import "./simpleFindWidget.css";
import * as nls from "../../../../../nls.js";
import * as dom from "../../../../../base/browser/dom.js";
import { Widget } from "../../../../../base/browser/ui/widget.js";
import { Delayer, disposableTimeout } from "../../../../../base/common/async.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { FindReplaceState } from "../../../../../editor/contrib/find/browser/findState.js";
import { SimpleButton, findPreviousMatchIcon, findNextMatchIcon, NLS_NO_RESULTS, NLS_MATCHES_LOCATION } from "../../../../../editor/contrib/find/browser/findWidget.js";
import { ContextScopedFindInput } from "../../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { widgetClose } from "../../../../../platform/theme/common/iconRegistry.js";
import { registerThemingParticipant } from "../../../../../platform/theme/common/themeService.js";
import * as strings from "../../../../../base/common/strings.js";
import { showHistoryKeybindingHint } from "../../../../../platform/history/browser/historyWidgetKeybindingHint.js";
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { defaultInputBoxStyles, defaultToggleStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { Orientation, Sash } from "../../../../../base/browser/ui/sash/sash.js";
import { registerColor } from "../../../../../platform/theme/common/colorRegistry.js";
const NLS_FIND_INPUT_LABEL = nls.localize("label.find", "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize("placeholder.find", "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize("label.previousMatchButton", "Previous Match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize("label.nextMatchButton", "Next Match");
const NLS_CLOSE_BTN_LABEL = nls.localize("label.closeButton", "Close");
const SIMPLE_FIND_WIDGET_INITIAL_WIDTH = 310;
const MATCHES_COUNT_WIDTH = 73;
class SimpleFindWidget extends Widget {
  constructor(options, contextViewService, contextKeyService, hoverService, _keybindingService, _configurationService, _accessibilityService) {
    super();
    this._keybindingService = _keybindingService;
    this._configurationService = _configurationService;
    this._accessibilityService = _accessibilityService;
    this._isVisible = false;
    this._foundMatch = false;
    this._width = 0;
    /**
     * Tracks whether the accessibility help hint has been announced in the ARIA label.
     * Reset to false when the widget is hidden, allowing the hint to be announced again
     * on the next reveal.
     */
    this._accessibilityHelpHintAnnounced = false;
    this.state = this._register(new FindReplaceState());
    this._matchesLimit = options.matchesLimit ?? Number.MAX_SAFE_INTEGER;
    this._findInput = this._register(new ContextScopedFindInput(null, contextViewService, {
      label: NLS_FIND_INPUT_LABEL,
      placeholder: NLS_FIND_INPUT_PLACEHOLDER,
      validation: (value) => {
        if (value.length === 0 || !this._findInput.getRegex()) {
          return null;
        }
        try {
          new RegExp(value);
          return null;
        } catch (e) {
          this._foundMatch = false;
          this.updateButtons(this._foundMatch);
          return { content: e.message };
        }
      },
      showCommonFindToggles: options.showCommonFindToggles,
      appendCaseSensitiveLabel: options.appendCaseSensitiveActionId ? this._getKeybinding(options.appendCaseSensitiveActionId) : void 0,
      appendRegexLabel: options.appendRegexActionId ? this._getKeybinding(options.appendRegexActionId) : void 0,
      appendWholeWordsLabel: options.appendWholeWordsActionId ? this._getKeybinding(options.appendWholeWordsActionId) : void 0,
      showHistoryHint: () => showHistoryKeybindingHint(_keybindingService),
      inputBoxStyles: defaultInputBoxStyles,
      toggleStyles: defaultToggleStyles
    }, contextKeyService));
    this._updateHistoryDelayer = this._register(new Delayer(500));
    this._register(this._findInput.onInput(async (e) => {
      if (!options.checkImeCompletionState || !this._findInput.isImeSessionInProgress) {
        this._foundMatch = this._onInputChanged();
        if (options.showResultCount) {
          await this.updateResultCount();
        }
        this.updateButtons(this._foundMatch);
        this.focusFindBox();
        this._delayedUpdateHistory();
      }
    }));
    this._findInput.setRegex(!!this.state.isRegex);
    this._findInput.setCaseSensitive(!!this.state.matchCase);
    this._findInput.setWholeWords(!!this.state.wholeWord);
    this._register(this._findInput.onDidOptionChange(() => {
      this.state.change({
        isRegex: this._findInput.getRegex(),
        wholeWord: this._findInput.getWholeWords(),
        matchCase: this._findInput.getCaseSensitive()
      }, true);
    }));
    this._register(this.state.onFindReplaceStateChange(() => {
      this._findInput.setRegex(this.state.isRegex);
      this._findInput.setWholeWords(this.state.wholeWord);
      this._findInput.setCaseSensitive(this.state.matchCase);
      this.findFirst();
    }));
    const hoverLifecycleOptions = { groupId: "simple-find-widget" };
    this.prevBtn = this._register(new SimpleButton({
      label: NLS_PREVIOUS_MATCH_BTN_LABEL + (options.previousMatchActionId ? this._getKeybinding(options.previousMatchActionId) : ""),
      icon: findPreviousMatchIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this.find(true);
      }
    }, hoverService));
    this.nextBtn = this._register(new SimpleButton({
      label: NLS_NEXT_MATCH_BTN_LABEL + (options.nextMatchActionId ? this._getKeybinding(options.nextMatchActionId) : ""),
      icon: findNextMatchIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this.find(false);
      }
    }, hoverService));
    const closeBtn = this._register(new SimpleButton({
      label: NLS_CLOSE_BTN_LABEL + (options.closeWidgetActionId ? this._getKeybinding(options.closeWidgetActionId) : ""),
      icon: widgetClose,
      hoverLifecycleOptions,
      onTrigger: () => {
        this.hide();
      }
    }, hoverService));
    this._innerDomNode = document.createElement("div");
    this._innerDomNode.classList.add("simple-find-part");
    this._innerDomNode.appendChild(this._findInput.domNode);
    this._innerDomNode.appendChild(this.prevBtn.domNode);
    this._innerDomNode.appendChild(this.nextBtn.domNode);
    this._innerDomNode.appendChild(closeBtn.domNode);
    this._domNode = document.createElement("div");
    this._domNode.classList.add("simple-find-part-wrapper");
    this._domNode.appendChild(this._innerDomNode);
    this.onkeyup(this._innerDomNode, (e) => {
      if (e.equals(KeyCode.Escape)) {
        this.hide();
        e.preventDefault();
        return;
      }
    });
    this._focusTracker = this._register(dom.trackFocus(this._innerDomNode));
    this._register(this._focusTracker.onDidFocus(this._onFocusTrackerFocus.bind(this)));
    this._register(this._focusTracker.onDidBlur(this._onFocusTrackerBlur.bind(this)));
    this._findInputFocusTracker = this._register(dom.trackFocus(this._findInput.domNode));
    this._register(this._findInputFocusTracker.onDidFocus(this._onFindInputFocusTrackerFocus.bind(this)));
    this._register(this._findInputFocusTracker.onDidBlur(this._onFindInputFocusTrackerBlur.bind(this)));
    this._register(dom.addDisposableListener(this._innerDomNode, "click", (event) => {
      event.stopPropagation();
    }));
    if (options?.showResultCount) {
      this._domNode.classList.add("result-count");
      this._matchesCount = document.createElement("div");
      this._matchesCount.className = "matchesCount";
      this._findInput.domNode.insertAdjacentElement("afterend", this._matchesCount);
      this._register(this._findInput.onDidChange(async () => {
        await this.updateResultCount();
      }));
      this._register(this._findInput.onDidOptionChange(async () => {
        this._foundMatch = this._onInputChanged();
        await this.updateResultCount();
        this.focusFindBox();
        this._delayedUpdateHistory();
      }));
    }
    let initialMinWidth = options?.initialWidth;
    if (initialMinWidth) {
      initialMinWidth = initialMinWidth < SIMPLE_FIND_WIDGET_INITIAL_WIDTH ? SIMPLE_FIND_WIDGET_INITIAL_WIDTH : initialMinWidth;
      this._domNode.style.width = `${initialMinWidth}px`;
    }
    if (options?.enableSash) {
      const _initialMinWidth = initialMinWidth ?? SIMPLE_FIND_WIDGET_INITIAL_WIDTH;
      let originalWidth = _initialMinWidth;
      const resizeSash = this._register(new Sash(this._innerDomNode, this, { orientation: Orientation.VERTICAL, size: 1 }));
      this._register(resizeSash.onDidStart(() => {
        originalWidth = parseFloat(dom.getComputedStyle(this._domNode).width);
      }));
      this._register(resizeSash.onDidChange((e) => {
        const width = originalWidth + e.startX - e.currentX;
        if (width < _initialMinWidth) {
          return;
        }
        this._domNode.style.width = `${width}px`;
      }));
      this._register(resizeSash.onDidReset((e) => {
        const currentWidth = parseFloat(dom.getComputedStyle(this._domNode).width);
        if (currentWidth === _initialMinWidth) {
          this._domNode.style.width = "100%";
        } else {
          this._domNode.style.width = `${_initialMinWidth}px`;
        }
      }));
    }
  }
  getVerticalSashLeft(_sash) {
    return 0;
  }
  get inputValue() {
    return this._findInput.getValue();
  }
  get focusTracker() {
    return this._focusTracker;
  }
  _getKeybinding(actionId) {
    return this._keybindingService.appendKeybinding("", actionId);
  }
  dispose() {
    super.dispose();
    this._domNode?.remove();
  }
  isVisible() {
    return this._isVisible;
  }
  getDomNode() {
    return this._domNode;
  }
  getFindInputDomNode() {
    return this._findInput.domNode;
  }
  reveal(initialInput, animated = true) {
    if (initialInput) {
      this._findInput.setValue(initialInput);
    }
    if (this._isVisible) {
      this._findInput.select();
      return;
    }
    this._isVisible = true;
    this._updateFindInputAriaLabel();
    this.updateResultCount();
    this.layout();
    setTimeout(() => {
      this._innerDomNode.classList.toggle("suppress-transition", !animated);
      this._innerDomNode.classList.add("visible", "visible-transition");
      this._innerDomNode.setAttribute("aria-hidden", "false");
      this._findInput.select();
      if (!animated) {
        setTimeout(() => {
          this._innerDomNode.classList.remove("suppress-transition");
        }, 0);
      }
    }, 0);
  }
  show(initialInput) {
    if (initialInput && !this._isVisible) {
      this._findInput.setValue(initialInput);
    }
    this._isVisible = true;
    this.layout();
    setTimeout(() => {
      this._innerDomNode.classList.add("visible", "visible-transition");
      this._innerDomNode.setAttribute("aria-hidden", "false");
    }, 0);
  }
  hide(animated = true) {
    if (this._isVisible) {
      this._accessibilityHelpHintAnnounced = false;
      this._innerDomNode.classList.toggle("suppress-transition", !animated);
      this._innerDomNode.classList.remove("visible-transition");
      this._innerDomNode.setAttribute("aria-hidden", "true");
      setTimeout(() => {
        this._isVisible = false;
        this.updateButtons(this._foundMatch);
        this._innerDomNode.classList.remove("visible", "suppress-transition");
      }, animated ? 200 : 0);
    }
  }
  layout(width = this._width) {
    this._width = width;
    if (!this._isVisible) {
      return;
    }
    if (this._matchesCount) {
      let reducedFindWidget = false;
      if (SIMPLE_FIND_WIDGET_INITIAL_WIDTH + MATCHES_COUNT_WIDTH + 28 >= width) {
        reducedFindWidget = true;
      }
      this._innerDomNode.classList.toggle("reduced-find-widget", reducedFindWidget);
    }
  }
  _delayedUpdateHistory() {
    this._updateHistoryDelayer.trigger(this._updateHistory.bind(this));
  }
  _updateHistory() {
    this._findInput.inputBox.addToHistory();
  }
  _getRegexValue() {
    return this._findInput.getRegex();
  }
  _getWholeWordValue() {
    return this._findInput.getWholeWords();
  }
  _getCaseSensitiveValue() {
    return this._findInput.getCaseSensitive();
  }
  updateButtons(foundMatch) {
    const hasInput = this.inputValue.length > 0;
    this.prevBtn.setEnabled(this._isVisible && hasInput && foundMatch);
    this.nextBtn.setEnabled(this._isVisible && hasInput && foundMatch);
  }
  focusFindBox() {
    this.nextBtn.focus();
    this._findInput.inputBox.focus();
  }
  async updateResultCount() {
    if (!this._matchesCount) {
      this.updateButtons(this._foundMatch);
      return;
    }
    const count = await this._getResultCount();
    this._matchesCount.textContent = "";
    const showRedOutline = this.inputValue.length > 0 && count?.resultCount === 0;
    this._matchesCount.classList.toggle("no-results", showRedOutline);
    let label = "";
    if (count?.resultCount) {
      let matchesCount = String(count.resultCount);
      if (count.resultCount >= this._matchesLimit) {
        matchesCount += "+";
      }
      let matchesPosition = String(count.resultIndex + 1);
      if (matchesPosition === "0") {
        matchesPosition = "?";
      }
      label = strings.format(NLS_MATCHES_LOCATION, matchesPosition, matchesCount);
    } else {
      label = NLS_NO_RESULTS;
    }
    status(this._announceSearchResults(label, this.inputValue));
    this._matchesCount.appendChild(document.createTextNode(label));
    this._foundMatch = !!count && count.resultCount > 0;
    this.updateButtons(this._foundMatch);
  }
  changeState(state) {
    this.state.change(state, false);
  }
  /**
   * Updates the ARIA label of the find input box.
   * When a screen reader is active and the accessibility verbosity setting is enabled,
   * includes a hint about pressing Alt+F1 for accessibility help on first reveal.
   * The hint is only announced once per show/hide cycle to prevent double-speak.
   */
  _updateFindInputAriaLabel() {
    let findLabel = NLS_FIND_INPUT_LABEL;
    if (!this._accessibilityHelpHintAnnounced && this._configurationService.getValue("accessibility.verbosity.find") && this._accessibilityService.isScreenReaderOptimized()) {
      const keybinding = this._keybindingService.lookupKeybinding("editor.action.accessibilityHelp")?.getAriaLabel();
      if (keybinding) {
        findLabel += ", " + nls.localize("accessibilityHelpHintInLabel", "Press {0} for accessibility help", keybinding);
        this._accessibilityHelpHintAnnounced = true;
        this._labelResetTimeout?.dispose();
        this._labelResetTimeout = disposableTimeout(() => {
          if (this._isVisible) {
            this._findInput.inputBox.setAriaLabel(NLS_FIND_INPUT_LABEL);
          }
        }, 1e3);
      }
    }
    this._findInput.inputBox.setAriaLabel(findLabel);
  }
  _announceSearchResults(label, searchString) {
    if (!searchString) {
      return nls.localize("ariaSearchNoInput", "Enter search input");
    }
    if (label === NLS_NO_RESULTS) {
      return searchString === "" ? nls.localize("ariaSearchNoResultEmpty", "{0} found", label) : nls.localize("ariaSearchNoResult", "{0} found for '{1}'", label, searchString);
    }
    return nls.localize("ariaSearchNoResultWithLineNumNoCurrentMatch", "{0} found for '{1}'", label, searchString);
  }
}
const simpleFindWidgetSashBorder = registerColor("simpleFindWidget.sashBorder", { dark: "#454545", light: "#C8C8C8", hcDark: "#6FC3DF", hcLight: "#0F4A85" }, nls.localize("simpleFindWidget.sashBorder", "Border color of the sash border."));
registerThemingParticipant((theme, collector) => {
  const resizeBorderBackground = theme.getColor(simpleFindWidgetSashBorder);
  collector.addRule(`.monaco-workbench .simple-find-part .monaco-sash { background-color: ${resizeBorderBackground}; border-color: ${resizeBorderBackground} }`);
});
export {
  SimpleFindWidget,
  simpleFindWidgetSashBorder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGJyb3dzZXJcXGZpbmRcXHNpbXBsZUZpbmRXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vc2ltcGxlRmluZFdpZGdldC5jc3MnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBGaW5kSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZmluZGlucHV0L2ZpbmRJbnB1dC5qcyc7XG5pbXBvcnQgeyBXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvd2lkZ2V0LmpzJztcbmltcG9ydCB7IERlbGF5ZXIsIGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEZpbmRSZXBsYWNlU3RhdGUsIElOZXdGaW5kUmVwbGFjZVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL2ZpbmRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBJTWVzc2FnZSBhcyBJbnB1dEJveE1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgU2ltcGxlQnV0dG9uLCBmaW5kUHJldmlvdXNNYXRjaEljb24sIGZpbmROZXh0TWF0Y2hJY29uLCBOTFNfTk9fUkVTVUxUUywgTkxTX01BVENIRVNfTE9DQVRJT04gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvZmluZFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IENvbnRleHRTY29wZWRGaW5kSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9oaXN0b3J5L2Jyb3dzZXIvY29udGV4dFNjb3BlZEhpc3RvcnlXaWRnZXQuanMnO1xuaW1wb3J0IHsgd2lkZ2V0Q2xvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBzaG93SGlzdG9yeUtleWJpbmRpbmdIaW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaGlzdG9yeS9icm93c2VyL2hpc3RvcnlXaWRnZXRLZXliaW5kaW5nSGludC5qcyc7XG5pbXBvcnQgeyBzdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IGRlZmF1bHRJbnB1dEJveFN0eWxlcywgZGVmYXVsdFRvZ2dsZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJU2FzaEV2ZW50LCBJVmVydGljYWxTYXNoTGF5b3V0UHJvdmlkZXIsIE9yaWVudGF0aW9uLCBTYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHR5cGUgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgdHlwZSB7IElIb3ZlckxpZmVjeWNsZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcblxuY29uc3QgTkxTX0ZJTkRfSU5QVVRfTEFCRUwgPSBubHMubG9jYWxpemUoJ2xhYmVsLmZpbmQnLCBcIkZpbmRcIik7XG5jb25zdCBOTFNfRklORF9JTlBVVF9QTEFDRUhPTERFUiA9IG5scy5sb2NhbGl6ZSgncGxhY2Vob2xkZXIuZmluZCcsIFwiRmluZFwiKTtcbmNvbnN0IE5MU19QUkVWSU9VU19NQVRDSF9CVE5fTEFCRUwgPSBubHMubG9jYWxpemUoJ2xhYmVsLnByZXZpb3VzTWF0Y2hCdXR0b24nLCBcIlByZXZpb3VzIE1hdGNoXCIpO1xuY29uc3QgTkxTX05FWFRfTUFUQ0hfQlROX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5uZXh0TWF0Y2hCdXR0b24nLCBcIk5leHQgTWF0Y2hcIik7XG5jb25zdCBOTFNfQ0xPU0VfQlROX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5jbG9zZUJ1dHRvbicsIFwiQ2xvc2VcIik7XG5cbmludGVyZmFjZSBJRmluZE9wdGlvbnMge1xuXHRzaG93Q29tbW9uRmluZFRvZ2dsZXM/OiBib29sZWFuO1xuXHRjaGVja0ltZUNvbXBsZXRpb25TdGF0ZT86IGJvb2xlYW47XG5cdHNob3dSZXN1bHRDb3VudD86IGJvb2xlYW47XG5cdGFwcGVuZENhc2VTZW5zaXRpdmVBY3Rpb25JZD86IHN0cmluZztcblx0YXBwZW5kUmVnZXhBY3Rpb25JZD86IHN0cmluZztcblx0YXBwZW5kV2hvbGVXb3Jkc0FjdGlvbklkPzogc3RyaW5nO1xuXHRwcmV2aW91c01hdGNoQWN0aW9uSWQ/OiBzdHJpbmc7XG5cdG5leHRNYXRjaEFjdGlvbklkPzogc3RyaW5nO1xuXHRjbG9zZVdpZGdldEFjdGlvbklkPzogc3RyaW5nO1xuXHRtYXRjaGVzTGltaXQ/OiBudW1iZXI7XG5cdHR5cGU/OiAnVGVybWluYWwnIHwgJ1dlYnZpZXcnO1xuXHRpbml0aWFsV2lkdGg/OiBudW1iZXI7XG5cdGVuYWJsZVNhc2g/OiBib29sZWFuO1xufVxuXG5jb25zdCBTSU1QTEVfRklORF9XSURHRVRfSU5JVElBTF9XSURUSCA9IDMxMDtcbmNvbnN0IE1BVENIRVNfQ09VTlRfV0lEVEggPSA3MztcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFNpbXBsZUZpbmRXaWRnZXQgZXh0ZW5kcyBXaWRnZXQgaW1wbGVtZW50cyBJVmVydGljYWxTYXNoTGF5b3V0UHJvdmlkZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maW5kSW5wdXQ6IEZpbmRJbnB1dDtcblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lubmVyRG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZvY3VzVHJhY2tlcjogZG9tLklGb2N1c1RyYWNrZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbmRJbnB1dEZvY3VzVHJhY2tlcjogZG9tLklGb2N1c1RyYWNrZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZUhpc3RvcnlEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHByZXZCdG46IFNpbXBsZUJ1dHRvbjtcblx0cHJpdmF0ZSByZWFkb25seSBuZXh0QnRuOiBTaW1wbGVCdXR0b247XG5cdHByaXZhdGUgcmVhZG9ubHkgX21hdGNoZXNMaW1pdDogbnVtYmVyO1xuXHRwcml2YXRlIF9tYXRjaGVzQ291bnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2lzVmlzaWJsZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9mb3VuZE1hdGNoOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3dpZHRoOiBudW1iZXIgPSAwO1xuXG5cdC8qKlxuXHQgKiBUcmFja3Mgd2hldGhlciB0aGUgYWNjZXNzaWJpbGl0eSBoZWxwIGhpbnQgaGFzIGJlZW4gYW5ub3VuY2VkIGluIHRoZSBBUklBIGxhYmVsLlxuXHQgKiBSZXNldCB0byBmYWxzZSB3aGVuIHRoZSB3aWRnZXQgaXMgaGlkZGVuLCBhbGxvd2luZyB0aGUgaGludCB0byBiZSBhbm5vdW5jZWQgYWdhaW5cblx0ICogb24gdGhlIG5leHQgcmV2ZWFsLlxuXHQgKi9cblx0cHJpdmF0ZSBfYWNjZXNzaWJpbGl0eUhlbHBIaW50QW5ub3VuY2VkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2xhYmVsUmVzZXRUaW1lb3V0OiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBzdGF0ZTogRmluZFJlcGxhY2VTdGF0ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJRmluZE9wdGlvbnMsXG5cdFx0Y29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0aG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdHRoaXMuX21hdGNoZXNMaW1pdCA9IG9wdGlvbnMubWF0Y2hlc0xpbWl0ID8/IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXG5cdFx0dGhpcy5fZmluZElucHV0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IENvbnRleHRTY29wZWRGaW5kSW5wdXQobnVsbCwgY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0XHRsYWJlbDogTkxTX0ZJTkRfSU5QVVRfTEFCRUwsXG5cdFx0XHRwbGFjZWhvbGRlcjogTkxTX0ZJTkRfSU5QVVRfUExBQ0VIT0xERVIsXG5cdFx0XHR2YWxpZGF0aW9uOiAodmFsdWU6IHN0cmluZyk6IElucHV0Qm94TWVzc2FnZSB8IG51bGwgPT4ge1xuXHRcdFx0XHRpZiAodmFsdWUubGVuZ3RoID09PSAwIHx8ICF0aGlzLl9maW5kSW5wdXQuZ2V0UmVnZXgoKSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0bmV3IFJlZ0V4cCh2YWx1ZSk7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHR0aGlzLl9mb3VuZE1hdGNoID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVCdXR0b25zKHRoaXMuX2ZvdW5kTWF0Y2gpO1xuXHRcdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IGUubWVzc2FnZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0c2hvd0NvbW1vbkZpbmRUb2dnbGVzOiBvcHRpb25zLnNob3dDb21tb25GaW5kVG9nZ2xlcyxcblx0XHRcdGFwcGVuZENhc2VTZW5zaXRpdmVMYWJlbDogb3B0aW9ucy5hcHBlbmRDYXNlU2Vuc2l0aXZlQWN0aW9uSWQgPyB0aGlzLl9nZXRLZXliaW5kaW5nKG9wdGlvbnMuYXBwZW5kQ2FzZVNlbnNpdGl2ZUFjdGlvbklkKSA6IHVuZGVmaW5lZCxcblx0XHRcdGFwcGVuZFJlZ2V4TGFiZWw6IG9wdGlvbnMuYXBwZW5kUmVnZXhBY3Rpb25JZCA/IHRoaXMuX2dldEtleWJpbmRpbmcob3B0aW9ucy5hcHBlbmRSZWdleEFjdGlvbklkKSA6IHVuZGVmaW5lZCxcblx0XHRcdGFwcGVuZFdob2xlV29yZHNMYWJlbDogb3B0aW9ucy5hcHBlbmRXaG9sZVdvcmRzQWN0aW9uSWQgPyB0aGlzLl9nZXRLZXliaW5kaW5nKG9wdGlvbnMuYXBwZW5kV2hvbGVXb3Jkc0FjdGlvbklkKSA6IHVuZGVmaW5lZCxcblx0XHRcdHNob3dIaXN0b3J5SGludDogKCkgPT4gc2hvd0hpc3RvcnlLZXliaW5kaW5nSGludChfa2V5YmluZGluZ1NlcnZpY2UpLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHRcdHRvZ2dsZVN0eWxlczogZGVmYXVsdFRvZ2dsZVN0eWxlc1xuXHRcdH0sIGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0Ly8gRmluZCBIaXN0b3J5IHdpdGggdXBkYXRlIGRlbGF5ZXJcblx0XHR0aGlzLl91cGRhdGVIaXN0b3J5RGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDUwMCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmluZElucHV0Lm9uSW5wdXQoYXN5bmMgKGUpID0+IHtcblx0XHRcdGlmICghb3B0aW9ucy5jaGVja0ltZUNvbXBsZXRpb25TdGF0ZSB8fCAhdGhpcy5fZmluZElucHV0LmlzSW1lU2Vzc2lvbkluUHJvZ3Jlc3MpIHtcblx0XHRcdFx0dGhpcy5fZm91bmRNYXRjaCA9IHRoaXMuX29uSW5wdXRDaGFuZ2VkKCk7XG5cdFx0XHRcdGlmIChvcHRpb25zLnNob3dSZXN1bHRDb3VudCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlUmVzdWx0Q291bnQoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnVwZGF0ZUJ1dHRvbnModGhpcy5fZm91bmRNYXRjaCk7XG5cdFx0XHRcdHRoaXMuZm9jdXNGaW5kQm94KCk7XG5cdFx0XHRcdHRoaXMuX2RlbGF5ZWRVcGRhdGVIaXN0b3J5KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZmluZElucHV0LnNldFJlZ2V4KCEhdGhpcy5zdGF0ZS5pc1JlZ2V4KTtcblx0XHR0aGlzLl9maW5kSW5wdXQuc2V0Q2FzZVNlbnNpdGl2ZSghIXRoaXMuc3RhdGUubWF0Y2hDYXNlKTtcblx0XHR0aGlzLl9maW5kSW5wdXQuc2V0V2hvbGVXb3JkcyghIXRoaXMuc3RhdGUud2hvbGVXb3JkKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbmRJbnB1dC5vbkRpZE9wdGlvbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnN0YXRlLmNoYW5nZSh7XG5cdFx0XHRcdGlzUmVnZXg6IHRoaXMuX2ZpbmRJbnB1dC5nZXRSZWdleCgpLFxuXHRcdFx0XHR3aG9sZVdvcmQ6IHRoaXMuX2ZpbmRJbnB1dC5nZXRXaG9sZVdvcmRzKCksXG5cdFx0XHRcdG1hdGNoQ2FzZTogdGhpcy5fZmluZElucHV0LmdldENhc2VTZW5zaXRpdmUoKVxuXHRcdFx0fSwgdHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdGF0ZS5vbkZpbmRSZXBsYWNlU3RhdGVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZmluZElucHV0LnNldFJlZ2V4KHRoaXMuc3RhdGUuaXNSZWdleCk7XG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuc2V0V2hvbGVXb3Jkcyh0aGlzLnN0YXRlLndob2xlV29yZCk7XG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuc2V0Q2FzZVNlbnNpdGl2ZSh0aGlzLnN0YXRlLm1hdGNoQ2FzZSk7XG5cdFx0XHR0aGlzLmZpbmRGaXJzdCgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGhvdmVyTGlmZWN5Y2xlT3B0aW9uczogSUhvdmVyTGlmZWN5Y2xlT3B0aW9ucyA9IHsgZ3JvdXBJZDogJ3NpbXBsZS1maW5kLXdpZGdldCcgfTtcblxuXHRcdHRoaXMucHJldkJ0biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTaW1wbGVCdXR0b24oe1xuXHRcdFx0bGFiZWw6IE5MU19QUkVWSU9VU19NQVRDSF9CVE5fTEFCRUwgKyAob3B0aW9ucy5wcmV2aW91c01hdGNoQWN0aW9uSWQgPyB0aGlzLl9nZXRLZXliaW5kaW5nKG9wdGlvbnMucHJldmlvdXNNYXRjaEFjdGlvbklkKSA6ICcnKSxcblx0XHRcdGljb246IGZpbmRQcmV2aW91c01hdGNoSWNvbixcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHRcdG9uVHJpZ2dlcjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmZpbmQodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSwgaG92ZXJTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLm5leHRCdG4gPSB0aGlzLl9yZWdpc3RlcihuZXcgU2ltcGxlQnV0dG9uKHtcblx0XHRcdGxhYmVsOiBOTFNfTkVYVF9NQVRDSF9CVE5fTEFCRUwgKyAob3B0aW9ucy5uZXh0TWF0Y2hBY3Rpb25JZCA/IHRoaXMuX2dldEtleWJpbmRpbmcob3B0aW9ucy5uZXh0TWF0Y2hBY3Rpb25JZCkgOiAnJyksXG5cdFx0XHRpY29uOiBmaW5kTmV4dE1hdGNoSWNvbixcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHRcdG9uVHJpZ2dlcjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmZpbmQoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0sIGhvdmVyU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgY2xvc2VCdG4gPSB0aGlzLl9yZWdpc3RlcihuZXcgU2ltcGxlQnV0dG9uKHtcblx0XHRcdGxhYmVsOiBOTFNfQ0xPU0VfQlROX0xBQkVMICsgKG9wdGlvbnMuY2xvc2VXaWRnZXRBY3Rpb25JZCA/IHRoaXMuX2dldEtleWJpbmRpbmcob3B0aW9ucy5jbG9zZVdpZGdldEFjdGlvbklkKSA6ICcnKSxcblx0XHRcdGljb246IHdpZGdldENsb3NlLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdFx0b25UcmlnZ2VyOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH0sIGhvdmVyU2VydmljZSkpO1xuXG5cdFx0dGhpcy5faW5uZXJEb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5faW5uZXJEb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3NpbXBsZS1maW5kLXBhcnQnKTtcblx0XHR0aGlzLl9pbm5lckRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fZmluZElucHV0LmRvbU5vZGUpO1xuXHRcdHRoaXMuX2lubmVyRG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLnByZXZCdG4uZG9tTm9kZSk7XG5cdFx0dGhpcy5faW5uZXJEb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMubmV4dEJ0bi5kb21Ob2RlKTtcblx0XHR0aGlzLl9pbm5lckRvbU5vZGUuYXBwZW5kQ2hpbGQoY2xvc2VCdG4uZG9tTm9kZSk7XG5cblx0XHQvLyBfZG9tTm9kZSB3cmFwcyBfaW5uZXJEb21Ob2RlLCBlbnN1cmluZyB0aGF0XG5cdFx0dGhpcy5fZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmFkZCgnc2ltcGxlLWZpbmQtcGFydC13cmFwcGVyJyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9pbm5lckRvbU5vZGUpO1xuXG5cdFx0dGhpcy5vbmtleXVwKHRoaXMuX2lubmVyRG9tTm9kZSwgZSA9PiB7XG5cdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX2ZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGRvbS50cmFja0ZvY3VzKHRoaXMuX2lubmVyRG9tTm9kZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKHRoaXMuX29uRm9jdXNUcmFja2VyRm9jdXMuYmluZCh0aGlzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZvY3VzVHJhY2tlci5vbkRpZEJsdXIodGhpcy5fb25Gb2N1c1RyYWNrZXJCbHVyLmJpbmQodGhpcykpKTtcblxuXHRcdHRoaXMuX2ZpbmRJbnB1dEZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGRvbS50cmFja0ZvY3VzKHRoaXMuX2ZpbmRJbnB1dC5kb21Ob2RlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmluZElucHV0Rm9jdXNUcmFja2VyLm9uRGlkRm9jdXModGhpcy5fb25GaW5kSW5wdXRGb2N1c1RyYWNrZXJGb2N1cy5iaW5kKHRoaXMpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmluZElucHV0Rm9jdXNUcmFja2VyLm9uRGlkQmx1cih0aGlzLl9vbkZpbmRJbnB1dEZvY3VzVHJhY2tlckJsdXIuYmluZCh0aGlzKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9pbm5lckRvbU5vZGUsICdjbGljaycsIChldmVudCkgPT4ge1xuXHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKG9wdGlvbnM/LnNob3dSZXN1bHRDb3VudCkge1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdyZXN1bHQtY291bnQnKTtcblx0XHRcdHRoaXMuX21hdGNoZXNDb3VudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0dGhpcy5fbWF0Y2hlc0NvdW50LmNsYXNzTmFtZSA9ICdtYXRjaGVzQ291bnQnO1xuXHRcdFx0dGhpcy5fZmluZElucHV0LmRvbU5vZGUuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdhZnRlcmVuZCcsIHRoaXMuX21hdGNoZXNDb3VudCk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maW5kSW5wdXQub25EaWRDaGFuZ2UoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZVJlc3VsdENvdW50KCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maW5kSW5wdXQub25EaWRPcHRpb25DaGFuZ2UoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9mb3VuZE1hdGNoID0gdGhpcy5fb25JbnB1dENoYW5nZWQoKTtcblx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVSZXN1bHRDb3VudCgpO1xuXHRcdFx0XHR0aGlzLmZvY3VzRmluZEJveCgpO1xuXHRcdFx0XHR0aGlzLl9kZWxheWVkVXBkYXRlSGlzdG9yeSgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGxldCBpbml0aWFsTWluV2lkdGggPSBvcHRpb25zPy5pbml0aWFsV2lkdGg7XG5cdFx0aWYgKGluaXRpYWxNaW5XaWR0aCkge1xuXHRcdFx0aW5pdGlhbE1pbldpZHRoID0gaW5pdGlhbE1pbldpZHRoIDwgU0lNUExFX0ZJTkRfV0lER0VUX0lOSVRJQUxfV0lEVEggPyBTSU1QTEVfRklORF9XSURHRVRfSU5JVElBTF9XSURUSCA6IGluaXRpYWxNaW5XaWR0aDtcblx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUud2lkdGggPSBgJHtpbml0aWFsTWluV2lkdGh9cHhgO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy5lbmFibGVTYXNoKSB7XG5cdFx0XHRjb25zdCBfaW5pdGlhbE1pbldpZHRoID0gaW5pdGlhbE1pbldpZHRoID8/IFNJTVBMRV9GSU5EX1dJREdFVF9JTklUSUFMX1dJRFRIO1xuXHRcdFx0bGV0IG9yaWdpbmFsV2lkdGggPSBfaW5pdGlhbE1pbldpZHRoO1xuXG5cdFx0XHQvLyBzYXNoXG5cdFx0XHRjb25zdCByZXNpemVTYXNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNhc2godGhpcy5faW5uZXJEb21Ob2RlLCB0aGlzLCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCwgc2l6ZTogMSB9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZXNpemVTYXNoLm9uRGlkU3RhcnQoKCkgPT4ge1xuXHRcdFx0XHRvcmlnaW5hbFdpZHRoID0gcGFyc2VGbG9hdChkb20uZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLl9kb21Ob2RlKS53aWR0aCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlc2l6ZVNhc2gub25EaWRDaGFuZ2UoKGU6IElTYXNoRXZlbnQpID0+IHtcblx0XHRcdFx0Y29uc3Qgd2lkdGggPSBvcmlnaW5hbFdpZHRoICsgZS5zdGFydFggLSBlLmN1cnJlbnRYO1xuXHRcdFx0XHRpZiAod2lkdGggPCBfaW5pdGlhbE1pbldpZHRoKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlc2l6ZVNhc2gub25EaWRSZXNldChlID0+IHtcblx0XHRcdFx0Y29uc3QgY3VycmVudFdpZHRoID0gcGFyc2VGbG9hdChkb20uZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLl9kb21Ob2RlKS53aWR0aCk7XG5cdFx0XHRcdGlmIChjdXJyZW50V2lkdGggPT09IF9pbml0aWFsTWluV2lkdGgpIHtcblx0XHRcdFx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUud2lkdGggPSBgJHtfaW5pdGlhbE1pbldpZHRofXB4YDtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRWZXJ0aWNhbFNhc2hMZWZ0KF9zYXNoOiBTYXNoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHB1YmxpYyBhYnN0cmFjdCBmaW5kKHByZXZpb3VzOiBib29sZWFuKTogdm9pZDtcblx0cHVibGljIGFic3RyYWN0IGZpbmRGaXJzdCgpOiB2b2lkO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX29uSW5wdXRDaGFuZ2VkKCk6IGJvb2xlYW47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfb25Gb2N1c1RyYWNrZXJGb2N1cygpOiB2b2lkO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX29uRm9jdXNUcmFja2VyQmx1cigpOiB2b2lkO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX29uRmluZElucHV0Rm9jdXNUcmFja2VyRm9jdXMoKTogdm9pZDtcblx0cHJvdGVjdGVkIGFic3RyYWN0IF9vbkZpbmRJbnB1dEZvY3VzVHJhY2tlckJsdXIoKTogdm9pZDtcblx0cHJvdGVjdGVkIGFic3RyYWN0IF9nZXRSZXN1bHRDb3VudCgpOiBQcm9taXNlPHsgcmVzdWx0SW5kZXg6IG51bWJlcjsgcmVzdWx0Q291bnQ6IG51bWJlciB9IHwgdW5kZWZpbmVkPjtcblxuXHRwcm90ZWN0ZWQgZ2V0IGlucHV0VmFsdWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbmRJbnB1dC5nZXRWYWx1ZSgpO1xuXHR9XG5cblx0cHVibGljIGdldCBmb2N1c1RyYWNrZXIoKTogZG9tLklGb2N1c1RyYWNrZXIge1xuXHRcdHJldHVybiB0aGlzLl9mb2N1c1RyYWNrZXI7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRLZXliaW5kaW5nKGFjdGlvbklkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKCcnLCBhY3Rpb25JZCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX2RvbU5vZGU/LnJlbW92ZSgpO1xuXHR9XG5cblx0cHVibGljIGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNWaXNpYmxlO1xuXHR9XG5cblx0cHVibGljIGdldERvbU5vZGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RmluZElucHV0RG9tTm9kZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZmluZElucHV0LmRvbU5vZGU7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsKGluaXRpYWxJbnB1dD86IHN0cmluZywgYW5pbWF0ZWQgPSB0cnVlKTogdm9pZCB7XG5cdFx0aWYgKGluaXRpYWxJbnB1dCkge1xuXHRcdFx0dGhpcy5fZmluZElucHV0LnNldFZhbHVlKGluaXRpYWxJbnB1dCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fZmluZElucHV0LnNlbGVjdCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzVmlzaWJsZSA9IHRydWU7XG5cdFx0dGhpcy5fdXBkYXRlRmluZElucHV0QXJpYUxhYmVsKCk7XG5cdFx0dGhpcy51cGRhdGVSZXN1bHRDb3VudCgpO1xuXHRcdHRoaXMubGF5b3V0KCk7XG5cblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2lubmVyRG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdzdXBwcmVzcy10cmFuc2l0aW9uJywgIWFuaW1hdGVkKTtcblx0XHRcdHRoaXMuX2lubmVyRG9tTm9kZS5jbGFzc0xpc3QuYWRkKCd2aXNpYmxlJywgJ3Zpc2libGUtdHJhbnNpdGlvbicpO1xuXHRcdFx0dGhpcy5faW5uZXJEb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAnZmFsc2UnKTtcblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5zZWxlY3QoKTtcblxuXHRcdFx0aWYgKCFhbmltYXRlZCkge1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9pbm5lckRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnc3VwcHJlc3MtdHJhbnNpdGlvbicpO1xuXHRcdFx0XHR9LCAwKTtcblx0XHRcdH1cblx0XHR9LCAwKTtcblx0fVxuXG5cdHB1YmxpYyBzaG93KGluaXRpYWxJbnB1dD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChpbml0aWFsSW5wdXQgJiYgIXRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fZmluZElucHV0LnNldFZhbHVlKGluaXRpYWxJbnB1dCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNWaXNpYmxlID0gdHJ1ZTtcblx0XHR0aGlzLmxheW91dCgpO1xuXG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9pbm5lckRvbU5vZGUuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScsICd2aXNpYmxlLXRyYW5zaXRpb24nKTtcblxuXHRcdFx0dGhpcy5faW5uZXJEb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAnZmFsc2UnKTtcblx0XHR9LCAwKTtcblx0fVxuXG5cdHB1YmxpYyBoaWRlKGFuaW1hdGVkID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdC8vIFJlc2V0IHRoZSBhY2Nlc3NpYmlsaXR5IGhlbHAgaGludCBmbGFnIHNvIGl0IGNhbiBiZSBhbm5vdW5jZWQgYWdhaW4gb24gbmV4dCByZXZlYWxcblx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlIZWxwSGludEFubm91bmNlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5faW5uZXJEb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3N1cHByZXNzLXRyYW5zaXRpb24nLCAhYW5pbWF0ZWQpO1xuXHRcdFx0dGhpcy5faW5uZXJEb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUtdHJhbnNpdGlvbicpO1xuXHRcdFx0dGhpcy5faW5uZXJEb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdFx0Ly8gTmVlZCB0byBkZWxheSB0b2dnbGluZyB2aXNpYmlsaXR5IHVudGlsIGFmdGVyIFRyYW5zaXRpb24sIHRoZW4gdmlzaWJpbGl0eSBoaWRkZW4gLSByZW1vdmVzIGZyb20gdGFiSW5kZXggbGlzdFxuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2lzVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUJ1dHRvbnModGhpcy5fZm91bmRNYXRjaCk7XG5cdFx0XHRcdHRoaXMuX2lubmVyRG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlJywgJ3N1cHByZXNzLXRyYW5zaXRpb24nKTtcblx0XHRcdH0sIGFuaW1hdGVkID8gMjAwIDogMCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGxheW91dCh3aWR0aDogbnVtYmVyID0gdGhpcy5fd2lkdGgpOiB2b2lkIHtcblx0XHR0aGlzLl93aWR0aCA9IHdpZHRoO1xuXG5cdFx0aWYgKCF0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbWF0Y2hlc0NvdW50KSB7XG5cdFx0XHRsZXQgcmVkdWNlZEZpbmRXaWRnZXQgPSBmYWxzZTtcblx0XHRcdGlmIChTSU1QTEVfRklORF9XSURHRVRfSU5JVElBTF9XSURUSCArIE1BVENIRVNfQ09VTlRfV0lEVEggKyAyOCA+PSB3aWR0aCkge1xuXHRcdFx0XHRyZWR1Y2VkRmluZFdpZGdldCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9pbm5lckRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgncmVkdWNlZC1maW5kLXdpZGdldCcsIHJlZHVjZWRGaW5kV2lkZ2V0KTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2RlbGF5ZWRVcGRhdGVIaXN0b3J5KCkge1xuXHRcdHRoaXMuX3VwZGF0ZUhpc3RvcnlEZWxheWVyLnRyaWdnZXIodGhpcy5fdXBkYXRlSGlzdG9yeS5iaW5kKHRoaXMpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfdXBkYXRlSGlzdG9yeSgpIHtcblx0XHR0aGlzLl9maW5kSW5wdXQuaW5wdXRCb3guYWRkVG9IaXN0b3J5KCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFJlZ2V4VmFsdWUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbmRJbnB1dC5nZXRSZWdleCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRXaG9sZVdvcmRWYWx1ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZmluZElucHV0LmdldFdob2xlV29yZHMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0Q2FzZVNlbnNpdGl2ZVZhbHVlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9maW5kSW5wdXQuZ2V0Q2FzZVNlbnNpdGl2ZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZUJ1dHRvbnMoZm91bmRNYXRjaDogYm9vbGVhbikge1xuXHRcdGNvbnN0IGhhc0lucHV0ID0gdGhpcy5pbnB1dFZhbHVlLmxlbmd0aCA+IDA7XG5cdFx0dGhpcy5wcmV2QnRuLnNldEVuYWJsZWQodGhpcy5faXNWaXNpYmxlICYmIGhhc0lucHV0ICYmIGZvdW5kTWF0Y2gpO1xuXHRcdHRoaXMubmV4dEJ0bi5zZXRFbmFibGVkKHRoaXMuX2lzVmlzaWJsZSAmJiBoYXNJbnB1dCAmJiBmb3VuZE1hdGNoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBmb2N1c0ZpbmRCb3goKSB7XG5cdFx0Ly8gRm9jdXMgYmFjayBvbnRvIHRoZSBmaW5kIGJveCwgd2hpY2hcblx0XHQvLyByZXF1aXJlcyBmb2N1c2luZyBvbnRvIHRoZSBuZXh0IGJ1dHRvbiBmaXJzdFxuXHRcdHRoaXMubmV4dEJ0bi5mb2N1cygpO1xuXHRcdHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5mb2N1cygpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlUmVzdWx0Q291bnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9tYXRjaGVzQ291bnQpIHtcblx0XHRcdHRoaXMudXBkYXRlQnV0dG9ucyh0aGlzLl9mb3VuZE1hdGNoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb3VudCA9IGF3YWl0IHRoaXMuX2dldFJlc3VsdENvdW50KCk7XG5cdFx0dGhpcy5fbWF0Y2hlc0NvdW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0Y29uc3Qgc2hvd1JlZE91dGxpbmUgPSAodGhpcy5pbnB1dFZhbHVlLmxlbmd0aCA+IDAgJiYgY291bnQ/LnJlc3VsdENvdW50ID09PSAwKTtcblx0XHR0aGlzLl9tYXRjaGVzQ291bnQuY2xhc3NMaXN0LnRvZ2dsZSgnbm8tcmVzdWx0cycsIHNob3dSZWRPdXRsaW5lKTtcblx0XHRsZXQgbGFiZWwgPSAnJztcblx0XHRpZiAoY291bnQ/LnJlc3VsdENvdW50KSB7XG5cdFx0XHRsZXQgbWF0Y2hlc0NvdW50OiBzdHJpbmcgPSBTdHJpbmcoY291bnQucmVzdWx0Q291bnQpO1xuXHRcdFx0aWYgKGNvdW50LnJlc3VsdENvdW50ID49IHRoaXMuX21hdGNoZXNMaW1pdCkge1xuXHRcdFx0XHRtYXRjaGVzQ291bnQgKz0gJysnO1xuXHRcdFx0fVxuXHRcdFx0bGV0IG1hdGNoZXNQb3NpdGlvbjogc3RyaW5nID0gU3RyaW5nKGNvdW50LnJlc3VsdEluZGV4ICsgMSk7XG5cdFx0XHRpZiAobWF0Y2hlc1Bvc2l0aW9uID09PSAnMCcpIHtcblx0XHRcdFx0bWF0Y2hlc1Bvc2l0aW9uID0gJz8nO1xuXHRcdFx0fVxuXHRcdFx0bGFiZWwgPSBzdHJpbmdzLmZvcm1hdChOTFNfTUFUQ0hFU19MT0NBVElPTiwgbWF0Y2hlc1Bvc2l0aW9uLCBtYXRjaGVzQ291bnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsYWJlbCA9IE5MU19OT19SRVNVTFRTO1xuXHRcdH1cblx0XHRzdGF0dXModGhpcy5fYW5ub3VuY2VTZWFyY2hSZXN1bHRzKGxhYmVsLCB0aGlzLmlucHV0VmFsdWUpKTtcblx0XHR0aGlzLl9tYXRjaGVzQ291bnQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobGFiZWwpKTtcblx0XHR0aGlzLl9mb3VuZE1hdGNoID0gISFjb3VudCAmJiBjb3VudC5yZXN1bHRDb3VudCA+IDA7XG5cdFx0dGhpcy51cGRhdGVCdXR0b25zKHRoaXMuX2ZvdW5kTWF0Y2gpO1xuXHR9XG5cblx0Y2hhbmdlU3RhdGUoc3RhdGU6IElOZXdGaW5kUmVwbGFjZVN0YXRlKSB7XG5cdFx0dGhpcy5zdGF0ZS5jaGFuZ2Uoc3RhdGUsIGZhbHNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBBUklBIGxhYmVsIG9mIHRoZSBmaW5kIGlucHV0IGJveC5cblx0ICogV2hlbiBhIHNjcmVlbiByZWFkZXIgaXMgYWN0aXZlIGFuZCB0aGUgYWNjZXNzaWJpbGl0eSB2ZXJib3NpdHkgc2V0dGluZyBpcyBlbmFibGVkLFxuXHQgKiBpbmNsdWRlcyBhIGhpbnQgYWJvdXQgcHJlc3NpbmcgQWx0K0YxIGZvciBhY2Nlc3NpYmlsaXR5IGhlbHAgb24gZmlyc3QgcmV2ZWFsLlxuXHQgKiBUaGUgaGludCBpcyBvbmx5IGFubm91bmNlZCBvbmNlIHBlciBzaG93L2hpZGUgY3ljbGUgdG8gcHJldmVudCBkb3VibGUtc3BlYWsuXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVGaW5kSW5wdXRBcmlhTGFiZWwoKTogdm9pZCB7XG5cdFx0bGV0IGZpbmRMYWJlbCA9IE5MU19GSU5EX0lOUFVUX0xBQkVMO1xuXG5cdFx0Ly8gSW5jbHVkZSBhY2Nlc3NpYmlsaXR5IGhlbHAgaGludCBvbiBmaXJzdCByZXZlYWwgd2hlbiBzY3JlZW4gcmVhZGVyIGlzIGFjdGl2ZVxuXHRcdC8vIE5vdGU6IFVzaW5nIHJhdyBzdHJpbmcgZm9yIHNldHRpbmcgSUQgLSB0aGlzIHNldHRpbmcgbWF5IG5vdCBiZSByZWdpc3RlcmVkIHlldFxuXHRcdGlmICghdGhpcy5fYWNjZXNzaWJpbGl0eUhlbHBIaW50QW5ub3VuY2VkICYmIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5maW5kJykgJiYgdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoJ2VkaXRvci5hY3Rpb24uYWNjZXNzaWJpbGl0eUhlbHAnKT8uZ2V0QXJpYUxhYmVsKCk7XG5cdFx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0XHRmaW5kTGFiZWwgKz0gJywgJyArIG5scy5sb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eUhlbHBIaW50SW5MYWJlbCcsIFwiUHJlc3MgezB9IGZvciBhY2Nlc3NpYmlsaXR5IGhlbHBcIiwga2V5YmluZGluZyk7XG5cdFx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlIZWxwSGludEFubm91bmNlZCA9IHRydWU7XG5cblx0XHRcdFx0Ly8gUmVzZXQgdG8gcGxhaW4gbGFiZWwgYWZ0ZXIgZGVsYXkgdG8gYXZvaWQgcmVwZWF0ZWQgYW5ub3VuY2VtZW50IG9uIGZvY3VzIGNoYW5nZXNcblx0XHRcdFx0dGhpcy5fbGFiZWxSZXNldFRpbWVvdXQ/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fbGFiZWxSZXNldFRpbWVvdXQgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZmluZElucHV0LmlucHV0Qm94LnNldEFyaWFMYWJlbChOTFNfRklORF9JTlBVVF9MQUJFTCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCAxMDAwKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9maW5kSW5wdXQuaW5wdXRCb3guc2V0QXJpYUxhYmVsKGZpbmRMYWJlbCk7XG5cdH1cblxuXHRwcml2YXRlIF9hbm5vdW5jZVNlYXJjaFJlc3VsdHMobGFiZWw6IHN0cmluZywgc2VhcmNoU3RyaW5nPzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAoIXNlYXJjaFN0cmluZykge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnYXJpYVNlYXJjaE5vSW5wdXQnLCBcIkVudGVyIHNlYXJjaCBpbnB1dFwiKTtcblx0XHR9XG5cdFx0aWYgKGxhYmVsID09PSBOTFNfTk9fUkVTVUxUUykge1xuXHRcdFx0cmV0dXJuIHNlYXJjaFN0cmluZyA9PT0gJydcblx0XHRcdFx0PyBubHMubG9jYWxpemUoJ2FyaWFTZWFyY2hOb1Jlc3VsdEVtcHR5JywgXCJ7MH0gZm91bmRcIiwgbGFiZWwpXG5cdFx0XHRcdDogbmxzLmxvY2FsaXplKCdhcmlhU2VhcmNoTm9SZXN1bHQnLCBcInswfSBmb3VuZCBmb3IgJ3sxfSdcIiwgbGFiZWwsIHNlYXJjaFN0cmluZyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnYXJpYVNlYXJjaE5vUmVzdWx0V2l0aExpbmVOdW1Ob0N1cnJlbnRNYXRjaCcsIFwiezB9IGZvdW5kIGZvciAnezF9J1wiLCBsYWJlbCwgc2VhcmNoU3RyaW5nKTtcblx0fVxufVxuXG5leHBvcnQgY29uc3Qgc2ltcGxlRmluZFdpZGdldFNhc2hCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdzaW1wbGVGaW5kV2lkZ2V0LnNhc2hCb3JkZXInLCB7IGRhcms6ICcjNDU0NTQ1JywgbGlnaHQ6ICcjQzhDOEM4JywgaGNEYXJrOiAnIzZGQzNERicsIGhjTGlnaHQ6ICcjMEY0QTg1JyB9LCBubHMubG9jYWxpemUoJ3NpbXBsZUZpbmRXaWRnZXQuc2FzaEJvcmRlcicsICdCb3JkZXIgY29sb3Igb2YgdGhlIHNhc2ggYm9yZGVyLicpKTtcblxucmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQoKHRoZW1lLCBjb2xsZWN0b3IpID0+IHtcblx0Y29uc3QgcmVzaXplQm9yZGVyQmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKHNpbXBsZUZpbmRXaWRnZXRTYXNoQm9yZGVyKTtcblx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28td29ya2JlbmNoIC5zaW1wbGUtZmluZC1wYXJ0IC5tb25hY28tc2FzaCB7IGJhY2tncm91bmQtY29sb3I6ICR7cmVzaXplQm9yZGVyQmFja2dyb3VuZH07IGJvcmRlci1jb2xvcjogJHtyZXNpemVCb3JkZXJCYWNrZ3JvdW5kfSB9YCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsWUFBWSxTQUFTO0FBRXJCLFNBQVMsY0FBYztBQUN2QixTQUFTLFNBQVMseUJBQXlCO0FBQzNDLFNBQVMsZUFBZTtBQUV4QixTQUFTLHdCQUE4QztBQUV2RCxTQUFTLGNBQWMsdUJBQXVCLG1CQUFtQixnQkFBZ0IsNEJBQTRCO0FBRzdHLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFlBQVksYUFBYTtBQUV6QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyx1QkFBdUIsMkJBQTJCO0FBQzNELFNBQWtELGFBQWEsWUFBWTtBQUMzRSxTQUFTLHFCQUFxQjtBQU05QixNQUFNLHVCQUF1QixJQUFJLFNBQVMsY0FBYyxNQUFNO0FBQzlELE1BQU0sNkJBQTZCLElBQUksU0FBUyxvQkFBb0IsTUFBTTtBQUMxRSxNQUFNLCtCQUErQixJQUFJLFNBQVMsNkJBQTZCLGdCQUFnQjtBQUMvRixNQUFNLDJCQUEyQixJQUFJLFNBQVMseUJBQXlCLFlBQVk7QUFDbkYsTUFBTSxzQkFBc0IsSUFBSSxTQUFTLHFCQUFxQixPQUFPO0FBa0JyRSxNQUFNLG1DQUFtQztBQUN6QyxNQUFNLHNCQUFzQjtBQUVyQixNQUFlLHlCQUF5QixPQUE4QztBQUFBLEVBMEI1RixZQUNDLFNBQ0Esb0JBQ0EsbUJBQ0EsY0FDaUIsb0JBQ0EsdUJBQ0EsdUJBQ2hCO0FBQ0QsVUFBTTtBQUpXO0FBQ0E7QUFDQTtBQXJCbEIsU0FBUSxhQUFzQjtBQUM5QixTQUFRLGNBQXVCO0FB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
