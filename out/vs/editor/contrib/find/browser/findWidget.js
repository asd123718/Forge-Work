import * as dom from "../../../../base/browser/dom.js";
import { alert as alertFn } from "../../../../base/browser/ui/aria/aria.js";
import { Toggle } from "../../../../base/browser/ui/toggle/toggle.js";
import { Orientation, Sash } from "../../../../base/browser/ui/sash/sash.js";
import { Widget } from "../../../../base/browser/ui/widget.js";
import { Delayer, disposableTimeout } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import * as platform from "../../../../base/common/platform.js";
import * as strings from "../../../../base/common/strings.js";
import "./findWidget.css";
import { OverlayWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { CONTEXT_FIND_INPUT_FOCUSED, CONTEXT_FIND_WIDGET_FOCUSED, CONTEXT_REPLACE_INPUT_FOCUSED, FIND_IDS, MATCHES_LIMIT } from "./findModel.js";
import * as nls from "../../../../nls.js";
import { AccessibilitySupport } from "../../../../platform/accessibility/common/accessibility.js";
import { ContextScopedFindInput, ContextScopedReplaceInput } from "../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { showHistoryKeybindingHint } from "../../../../platform/history/browser/historyWidgetKeybindingHint.js";
import { asCssVariable, contrastBorder, editorFindMatchForeground, editorFindMatchHighlightBorder, editorFindMatchHighlightForeground, editorFindRangeHighlightBorder, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { registerIcon, widgetClose } from "../../../../platform/theme/common/iconRegistry.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { defaultInputBoxStyles, defaultToggleStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { HoverStyle } from "../../../../base/browser/ui/hover/hover.js";
const findCollapsedIcon = registerIcon("find-collapsed", Codicon.chevronRight, nls.localize("findCollapsedIcon", "Icon to indicate that the editor find widget is collapsed."));
const findExpandedIcon = registerIcon("find-expanded", Codicon.chevronDown, nls.localize("findExpandedIcon", "Icon to indicate that the editor find widget is expanded."));
const findSelectionIcon = registerIcon("find-selection", Codicon.selection, nls.localize("findSelectionIcon", "Icon for 'Find in Selection' in the editor find widget."));
const findReplaceIcon = registerIcon("find-replace", Codicon.replace, nls.localize("findReplaceIcon", "Icon for 'Replace' in the editor find widget."));
const findReplaceAllIcon = registerIcon("find-replace-all", Codicon.replaceAll, nls.localize("findReplaceAllIcon", "Icon for 'Replace All' in the editor find widget."));
const findPreviousMatchIcon = registerIcon("find-previous-match", Codicon.arrowUp, nls.localize("findPreviousMatchIcon", "Icon for 'Find Previous' in the editor find widget."));
const findNextMatchIcon = registerIcon("find-next-match", Codicon.arrowDown, nls.localize("findNextMatchIcon", "Icon for 'Find Next' in the editor find widget."));
const NLS_FIND_DIALOG_LABEL = nls.localize("label.findDialog", "Find / Replace");
const NLS_FIND_INPUT_LABEL = nls.localize("label.find", "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize("placeholder.find", "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize("label.previousMatchButton", "Previous Match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize("label.nextMatchButton", "Next Match");
const NLS_TOGGLE_SELECTION_FIND_TITLE = nls.localize("label.toggleSelectionFind", "Find in Selection");
const NLS_CLOSE_BTN_LABEL = nls.localize("label.closeButton", "Close");
const NLS_REPLACE_INPUT_LABEL = nls.localize("label.replace", "Replace");
const NLS_REPLACE_INPUT_PLACEHOLDER = nls.localize("placeholder.replace", "Replace");
const NLS_REPLACE_BTN_LABEL = nls.localize("label.replaceButton", "Replace");
const NLS_REPLACE_ALL_BTN_LABEL = nls.localize("label.replaceAllButton", "Replace All");
const NLS_TOGGLE_REPLACE_MODE_BTN_LABEL = nls.localize("label.toggleReplaceButton", "Toggle Replace");
const NLS_MATCHES_COUNT_LIMIT_TITLE = nls.localize("title.matchesCountLimit", "Only the first {0} results are highlighted, but all find operations work on the entire text.", MATCHES_LIMIT);
const NLS_MATCHES_LOCATION = nls.localize("label.matchesLocation", "{0} of {1}");
const NLS_NO_RESULTS = nls.localize("label.noResults", "No results");
const FIND_WIDGET_INITIAL_WIDTH = 419;
const PART_WIDTH = 275;
const FIND_INPUT_AREA_WIDTH = PART_WIDTH - 54;
let MAX_MATCHES_COUNT_WIDTH = 69;
const FIND_INPUT_AREA_HEIGHT = 33;
const ctrlKeyMod = platform.isMacintosh ? KeyMod.WinCtrl : KeyMod.CtrlCmd;
class FindWidgetViewZone {
  constructor(afterLineNumber) {
    this.afterLineNumber = afterLineNumber;
    this.heightInPx = FIND_INPUT_AREA_HEIGHT;
    this.suppressMouseDown = false;
    this.domNode = document.createElement("div");
    this.domNode.className = "dock-find-viewzone";
  }
}
function stopPropagationForMultiLineUpwards(event, value, textarea) {
  const isMultiline = !!value.match(/\n/);
  if (textarea && isMultiline && textarea.selectionStart > 0) {
    event.stopPropagation();
    return;
  }
}
function stopPropagationForMultiLineDownwards(event, value, textarea) {
  const isMultiline = !!value.match(/\n/);
  if (textarea && isMultiline && textarea.selectionEnd < textarea.value.length) {
    event.stopPropagation();
    return;
  }
}
const _FindWidget = class _FindWidget extends Widget {
  constructor(codeEditor, controller, state, contextViewProvider, keybindingService, contextKeyService, _hoverService, _findWidgetSearchHistory, _replaceWidgetHistory, _configurationService, _accessibilityService) {
    super();
    this._hoverService = _hoverService;
    this._findWidgetSearchHistory = _findWidgetSearchHistory;
    this._replaceWidgetHistory = _replaceWidgetHistory;
    this._configurationService = _configurationService;
    this._accessibilityService = _accessibilityService;
    this._cachedHeight = null;
    this._lastFocusedInputWasReplace = false;
    this._lastFocusedElement = null;
    this._revealTimeouts = [];
    this._codeEditor = codeEditor;
    this._controller = controller;
    this._state = state;
    this._contextViewProvider = contextViewProvider;
    this._keybindingService = keybindingService;
    this._contextKeyService = contextKeyService;
    this._isVisible = false;
    this._isReplaceVisible = false;
    this._ignoreChangeEvent = false;
    this._accessibilityHelpHintAnnounced = false;
    this._updateHistoryDelayer = new Delayer(500);
    this._register(toDisposable(() => this._updateHistoryDelayer.cancel()));
    this._register(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));
    this._buildDomNode();
    this._updateButtons();
    this._tryUpdateWidgetWidth();
    this._findInput.inputBox.layout();
    this._register(this._codeEditor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.readOnly)) {
        if (this._codeEditor.getOption(EditorOption.readOnly)) {
          this._state.change({ isReplaceRevealed: false }, false);
        }
        this._updateButtons();
      }
      if (e.hasChanged(EditorOption.layoutInfo)) {
        this._tryUpdateWidgetWidth();
      }
      if (e.hasChanged(EditorOption.accessibilitySupport)) {
        this.updateAccessibilitySupport();
      }
      if (e.hasChanged(EditorOption.find)) {
        const supportLoop = this._codeEditor.getOption(EditorOption.find).loop;
        this._state.change({ loop: supportLoop }, false);
        const addExtraSpaceOnTop = this._codeEditor.getOption(EditorOption.find).addExtraSpaceOnTop;
        if (addExtraSpaceOnTop && !this._viewZone) {
          this._viewZone = new FindWidgetViewZone(0);
          this._showViewZone();
        }
        if (!addExtraSpaceOnTop && this._viewZone) {
          this._removeViewZone();
        }
      }
    }));
    this.updateAccessibilitySupport();
    this._register(this._codeEditor.onDidChangeCursorSelection(() => {
      if (this._isVisible) {
        this._updateToggleSelectionFindButton();
      }
    }));
    this._register(this._codeEditor.onDidFocusEditorWidget(async () => {
      if (this._isVisible) {
        const globalBufferTerm = await this._controller.getGlobalBufferTerm();
        if (globalBufferTerm && globalBufferTerm !== this._state.searchString) {
          this._state.change({ searchString: globalBufferTerm }, false);
          this._findInput.select();
        }
      }
    }));
    this._findInputFocused = CONTEXT_FIND_INPUT_FOCUSED.bindTo(contextKeyService);
    this._findFocusTracker = this._register(dom.trackFocus(this._findInput.inputBox.inputElement));
    this._register(this._findFocusTracker.onDidFocus(() => {
      this._findInputFocused.set(true);
      this._lastFocusedInputWasReplace = false;
      this._updateSearchScope();
    }));
    this._register(this._findFocusTracker.onDidBlur(() => {
      this._findInputFocused.set(false);
    }));
    this._replaceInputFocused = CONTEXT_REPLACE_INPUT_FOCUSED.bindTo(contextKeyService);
    this._replaceFocusTracker = this._register(dom.trackFocus(this._replaceInput.inputBox.inputElement));
    this._register(this._replaceFocusTracker.onDidFocus(() => {
      this._replaceInputFocused.set(true);
      this._lastFocusedInputWasReplace = true;
      this._updateSearchScope();
    }));
    this._register(this._replaceFocusTracker.onDidBlur(() => {
      this._replaceInputFocused.set(false);
    }));
    this._findWidgetFocused = CONTEXT_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);
    this._widgetFocusTracker = this._register(dom.trackFocus(this._domNode));
    this._register(this._widgetFocusTracker.onDidFocus(() => {
      this._findWidgetFocused.set(true);
    }));
    this._register(this._widgetFocusTracker.onDidBlur(() => {
      this._findWidgetFocused.set(false);
    }));
    this._register(dom.addDisposableListener(this._domNode, "focusin", (e) => {
      if (dom.isHTMLElement(e.target)) {
        this._lastFocusedElement = e.target;
      }
    }));
    this._codeEditor.addOverlayWidget(this);
    if (this._codeEditor.getOption(EditorOption.find).addExtraSpaceOnTop) {
      this._viewZone = new FindWidgetViewZone(0);
    }
    this._register(this._codeEditor.onDidChangeModel(() => {
      if (!this._isVisible) {
        return;
      }
      this._viewZoneId = void 0;
    }));
    this._register(this._codeEditor.onDidScrollChange((e) => {
      if (e.scrollTopChanged) {
        this._layoutViewZone();
        return;
      }
      setTimeout(() => {
        this._layoutViewZone();
      }, 0);
    }));
  }
  // ----- IOverlayWidget API
  getId() {
    return _FindWidget.ID;
  }
  getDomNode() {
    return this._domNode;
  }
  /**
   * Returns whether the Replace input was the last focused input in the find widget.
   * This persists even after focus leaves the widget, allowing external code to know
   * which input to restore focus to.
   */
  get lastFocusedInputWasReplace() {
    return this._lastFocusedInputWasReplace;
  }
  /**
   * Returns the last focused element within the Find widget.
   * This is useful for restoring focus to the exact element after
   * accessibility help or other overlays are dismissed.
   */
  get lastFocusedElement() {
    return this._lastFocusedElement;
  }
  /**
   * Focuses the last focused element in the Find widget.
   * Falls back to the Find or Replace input based on lastFocusedInputWasReplace.
   */
  focusLastElement() {
    if (!this._isVisible) {
      return;
    }
    if (this._lastFocusedElement && this._domNode.contains(this._lastFocusedElement) && dom.getWindow(this._lastFocusedElement).document.body.contains(this._lastFocusedElement)) {
      this._lastFocusedElement.focus();
    } else if (this._lastFocusedInputWasReplace) {
      this.focusReplaceInput();
    } else {
      this.focusFindInput();
    }
  }
  getPosition() {
    if (this._isVisible) {
      return {
        preference: OverlayWidgetPositionPreference.TOP_RIGHT_CORNER
      };
    }
    return null;
  }
  // ----- React to state changes
  _onStateChanged(e) {
    if (e.searchString) {
      try {
        this._ignoreChangeEvent = true;
        this._findInput.setValue(this._state.searchString);
      } finally {
        this._ignoreChangeEvent = false;
      }
      this._updateButtons();
    }
    if (e.replaceString) {
      this._replaceInput.inputBox.value = this._state.replaceString;
    }
    if (e.isRevealed) {
      if (this._state.isRevealed) {
        this._reveal();
      } else {
        this._hide(true);
      }
    }
    if (e.isReplaceRevealed) {
      if (this._state.isReplaceRevealed) {
        if (!this._codeEditor.getOption(EditorOption.readOnly) && !this._isReplaceVisible) {
          this._isReplaceVisible = true;
          this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
          this._updateButtons();
          this._replaceInput.inputBox.layout();
        }
      } else {
        if (this._isReplaceVisible) {
          this._isReplaceVisible = false;
          this._updateButtons();
        }
      }
    }
    if ((e.isRevealed || e.isReplaceRevealed) && (this._state.isRevealed || this._state.isReplaceRevealed)) {
      if (this._tryUpdateHeight()) {
        this._showViewZone();
      }
    }
    if (e.isRegex) {
      this._findInput.setRegex(this._state.isRegex);
    }
    if (e.wholeWord) {
      this._findInput.setWholeWords(this._state.wholeWord);
    }
    if (e.matchCase) {
      this._findInput.setCaseSensitive(this._state.matchCase);
    }
    if (e.preserveCase) {
      this._replaceInput.setPreserveCase(this._state.preserveCase);
    }
    if (e.searchScope) {
      if (this._state.searchScope) {
        this._toggleSelectionFind.checked = true;
      } else {
        this._toggleSelectionFind.checked = false;
      }
      this._updateToggleSelectionFindButton();
    }
    if (e.searchString || e.matchesCount || e.matchesPosition) {
      const showRedOutline = this._state.searchString.length > 0 && this._state.matchesCount === 0;
      this._domNode.classList.toggle("no-results", showRedOutline);
      this._updateMatchesCount();
      this._updateButtons();
    }
    if (e.searchString || e.currentMatch) {
      this._layoutViewZone();
    }
    if (e.updateHistory) {
      this._delayedUpdateHistory();
    }
    if (e.loop) {
      this._updateButtons();
    }
  }
  _delayedUpdateHistory() {
    this._updateHistoryDelayer.trigger(this._updateHistory.bind(this)).then(void 0, onUnexpectedError);
  }
  _updateHistory() {
    if (this._state.searchString) {
      this._findInput.inputBox.addToHistory();
    }
    if (this._state.replaceString) {
      this._replaceInput.inputBox.addToHistory();
    }
  }
  _updateMatchesCount() {
    this._matchesCount.style.minWidth = MAX_MATCHES_COUNT_WIDTH + "px";
    if (this._state.matchesCount >= MATCHES_LIMIT) {
      this._matchesCount.title = NLS_MATCHES_COUNT_LIMIT_TITLE;
    } else {
      this._matchesCount.title = "";
    }
    this._matchesCount.firstChild?.remove();
    let label;
    if (this._state.matchesCount > 0) {
      let matchesCount = String(this._state.matchesCount);
      if (this._state.matchesCount >= MATCHES_LIMIT) {
        matchesCount += "+";
      }
      let matchesPosition = String(this._state.matchesPosition);
      if (matchesPosition === "0") {
        matchesPosition = "?";
      }
      label = strings.format(NLS_MATCHES_LOCATION, matchesPosition, matchesCount);
    } else {
      label = NLS_NO_RESULTS;
    }
    this._matchesCount.appendChild(document.createTextNode(label));
    alertFn(this._getAriaLabel(label, this._state.currentMatch, this._state.searchString));
    MAX_MATCHES_COUNT_WIDTH = Math.max(MAX_MATCHES_COUNT_WIDTH, this._matchesCount.clientWidth);
  }
  // ----- actions
  _getAriaLabel(label, currentMatch, searchString) {
    let result;
    if (label === NLS_NO_RESULTS) {
      result = searchString === "" ? nls.localize("ariaSearchNoResultEmpty", "{0} found", label) : nls.localize("ariaSearchNoResult", "{0} found for '{1}'", label, searchString);
    } else if (currentMatch) {
      const ariaLabel = nls.localize("ariaSearchNoResultWithLineNum", "{0} found for '{1}', at {2}", label, searchString, currentMatch.startLineNumber + ":" + currentMatch.startColumn);
      const model = this._codeEditor.getModel();
      if (model && currentMatch.startLineNumber <= model.getLineCount() && currentMatch.startLineNumber >= 1) {
        const lineContent = model.getLineContent(currentMatch.startLineNumber);
        result = `${lineContent}, ${ariaLabel}`;
      } else {
        result = ariaLabel;
      }
    } else {
      result = nls.localize("ariaSearchNoResultWithLineNumNoCurrentMatch", "{0} found for '{1}'", label, searchString);
    }
    return result;
  }
  /**
   * If 'selection find' is ON we should not disable the button (its function is to cancel 'selection find').
   * If 'selection find' is OFF we enable the button only if there is a selection.
   */
  _updateToggleSelectionFindButton() {
    const selection = this._codeEditor.getSelection();
    const isSelection = selection ? selection.startLineNumber !== selection.endLineNumber || selection.startColumn !== selection.endColumn : false;
    const isChecked = this._toggleSelectionFind.checked;
    if (this._isVisible && (isChecked || isSelection)) {
      this._toggleSelectionFind.enable();
    } else {
      this._toggleSelectionFind.disable();
    }
  }
  _updateButtons() {
    this._findInput.setEnabled(this._isVisible);
    this._replaceInput.setEnabled(this._isVisible && this._isReplaceVisible);
    this._updateToggleSelectionFindButton();
    this._closeBtn.setEnabled(this._isVisible);
    const findInputIsNonEmpty = this._state.searchString.length > 0;
    const matchesCount = this._state.matchesCount ? true : false;
    this._prevBtn.setEnabled(this._isVisible && findInputIsNonEmpty && matchesCount && this._state.canNavigateBack());
    this._nextBtn.setEnabled(this._isVisible && findInputIsNonEmpty && matchesCount && this._state.canNavigateForward());
    this._replaceBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);
    this._replaceAllBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);
    this._domNode.classList.toggle("replaceToggled", this._isReplaceVisible);
    this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);
    const canReplace = !this._codeEditor.getOption(EditorOption.readOnly);
    this._toggleReplaceBtn.setEnabled(this._isVisible && canReplace);
  }
  _reveal() {
    this._revealTimeouts.forEach((e) => {
      clearTimeout(e);
    });
    this._revealTimeouts = [];
    if (!this._isVisible) {
      this._isVisible = true;
      const selection = this._codeEditor.getSelection();
      switch (this._codeEditor.getOption(EditorOption.find).autoFindInSelection) {
        case "always":
          this._toggleSelectionFind.checked = true;
          break;
        case "never":
          this._toggleSelectionFind.checked = false;
          break;
        case "multiline": {
          const isSelectionMultipleLine = !!selection && selection.startLineNumber !== selection.endLineNumber;
          this._toggleSelectionFind.checked = isSelectionMultipleLine;
          break;
        }
        default:
          break;
      }
      this._tryUpdateWidgetWidth();
      this._updateButtons();
      this._revealTimeouts.push(setTimeout(() => {
        this._domNode.classList.add("visible");
        this._domNode.setAttribute("aria-hidden", "false");
        this._updateFindInputAriaLabel();
      }, 0));
      this._revealTimeouts.push(setTimeout(() => {
        this._findInput.validate();
      }, 200));
      this._codeEditor.layoutOverlayWidget(this);
      let adjustEditorScrollTop = true;
      if (this._codeEditor.getOption(EditorOption.find).seedSearchStringFromSelection && selection) {
        const domNode = this._codeEditor.getDomNode();
        if (domNode) {
          const editorCoords = dom.getDomNodePagePosition(domNode);
          const startCoords = this._codeEditor.getScrolledVisiblePosition(selection.getStartPosition());
          const startLeft = editorCoords.left + (startCoords ? startCoords.left : 0);
          const startTop = startCoords ? startCoords.top : 0;
          if (this._viewZone && startTop < this._viewZone.heightInPx) {
            if (selection.endLineNumber > selection.startLineNumber) {
              adjustEditorScrollTop = false;
            }
            const leftOfFindWidget = dom.getTopLeftOffset(this._domNode).left;
            if (startLeft > leftOfFindWidget) {
              adjustEditorScrollTop = false;
            }
            const endCoords = this._codeEditor.getScrolledVisiblePosition(selection.getEndPosition());
            const endLeft = editorCoords.left + (endCoords ? endCoords.left : 0);
            if (endLeft > leftOfFindWidget) {
              adjustEditorScrollTop = false;
            }
          }
        }
      }
      this._showViewZone(adjustEditorScrollTop);
    }
  }
  _hide(focusTheEditor) {
    this._revealTimeouts.forEach((e) => {
      clearTimeout(e);
    });
    this._revealTimeouts = [];
    if (this._isVisible) {
      this._isVisible = false;
      this._accessibilityHelpHintAnnounced = false;
      this._updateButtons();
      this._domNode.classList.remove("visible");
      this._domNode.setAttribute("aria-hidden", "true");
      this._findInput.clearMessage();
      if (focusTheEditor) {
        this._codeEditor.focus();
      }
      this._codeEditor.layoutOverlayWidget(this);
      this._removeViewZone();
    }
  }
  _layoutViewZone(targetScrollTop) {
    const addExtraSpaceOnTop = this._codeEditor.getOption(EditorOption.find).addExtraSpaceOnTop;
    if (!addExtraSpaceOnTop) {
      this._removeViewZone();
      return;
    }
    if (!this._isVisible) {
      return;
    }
    const viewZone = this._viewZone;
    if (this._viewZoneId !== void 0 || !viewZone) {
      return;
    }
    this._codeEditor.changeViewZones((accessor) => {
      viewZone.heightInPx = this._getHeight();
      this._viewZoneId = accessor.addZone(viewZone);
      this._codeEditor.setScrollTop(targetScrollTop || this._codeEditor.getScrollTop() + viewZone.heightInPx);
    });
  }
  _showViewZone(adjustScroll = true) {
    if (!this._isVisible) {
      return;
    }
    const addExtraSpaceOnTop = this._codeEditor.getOption(EditorOption.find).addExtraSpaceOnTop;
    if (!addExtraSpaceOnTop) {
      return;
    }
    if (this._viewZone === void 0) {
      this._viewZone = new FindWidgetViewZone(0);
    }
    const viewZone = this._viewZone;
    this._codeEditor.changeViewZones((accessor) => {
      if (this._viewZoneId !== void 0) {
        const newHeight = this._getHeight();
        if (newHeight === viewZone.heightInPx) {
          return;
        }
        const scrollAdjustment = newHeight - viewZone.heightInPx;
        viewZone.heightInPx = newHeight;
        accessor.layoutZone(this._viewZoneId);
        if (adjustScroll) {
          this._codeEditor.setScrollTop(this._codeEditor.getScrollTop() + scrollAdjustment);
        }
        return;
      } else {
        let scrollAdjustment = this._getHeight();
        scrollAdjustment -= this._codeEditor.getOption(EditorOption.padding).top;
        if (scrollAdjustment <= 0) {
          return;
        }
        viewZone.heightInPx = scrollAdjustment;
        this._viewZoneId = accessor.addZone(viewZone);
        if (adjustScroll) {
          this._codeEditor.setScrollTop(this._codeEditor.getScrollTop() + scrollAdjustment);
        }
      }
    });
  }
  _removeViewZone() {
    this._codeEditor.changeViewZones((accessor) => {
      if (this._viewZoneId !== void 0) {
        accessor.removeZone(this._viewZoneId);
        this._viewZoneId = void 0;
        if (this._viewZone) {
          this._codeEditor.setScrollTop(this._codeEditor.getScrollTop() - this._viewZone.heightInPx);
          this._viewZone = void 0;
        }
      }
    });
  }
  _tryUpdateWidgetWidth() {
    if (!this._isVisible) {
      return;
    }
    if (!this._domNode.isConnected) {
      return;
    }
    const layoutInfo = this._codeEditor.getLayoutInfo();
    const editorContentWidth = layoutInfo.contentWidth;
    if (editorContentWidth <= 0) {
      this._domNode.classList.add("hiddenEditor");
      return;
    } else if (this._domNode.classList.contains("hiddenEditor")) {
      this._domNode.classList.remove("hiddenEditor");
    }
    const editorWidth = layoutInfo.width;
    const minimapWidth = layoutInfo.minimap.minimapWidth;
    let collapsedFindWidget = false;
    let reducedFindWidget = false;
    let narrowFindWidget = false;
    if (this._resized) {
      const widgetWidth = dom.getTotalWidth(this._domNode);
      if (widgetWidth > FIND_WIDGET_INITIAL_WIDTH) {
        this._domNode.style.maxWidth = `${editorWidth - 28 - minimapWidth - 15}px`;
        this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
        return;
      }
    }
    if (FIND_WIDGET_INITIAL_WIDTH + 28 + minimapWidth >= editorWidth) {
      reducedFindWidget = true;
    }
    if (FIND_WIDGET_INITIAL_WIDTH + 28 + minimapWidth - MAX_MATCHES_COUNT_WIDTH >= editorWidth) {
      narrowFindWidget = true;
    }
    if (FIND_WIDGET_INITIAL_WIDTH + 28 + minimapWidth - MAX_MATCHES_COUNT_WIDTH >= editorWidth + 50) {
      collapsedFindWidget = true;
    }
    this._domNode.classList.toggle("collapsed-find-widget", collapsedFindWidget);
    this._domNode.classList.toggle("narrow-find-widget", narrowFindWidget);
    this._domNode.classList.toggle("reduced-find-widget", reducedFindWidget);
    if (!narrowFindWidget && !collapsedFindWidget) {
      this._domNode.style.maxWidth = `${editorWidth - 28 - minimapWidth - 15}px`;
    }
    this._findInput.layout({ collapsedFindWidget, narrowFindWidget, reducedFindWidget });
    if (this._resized) {
      const findInputWidth = this._findInput.inputBox.element.clientWidth;
      if (findInputWidth > 0) {
        this._replaceInput.width = findInputWidth;
      }
    } else if (this._isReplaceVisible) {
      this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
    }
  }
  _getHeight() {
    let totalheight = 0;
    totalheight += 4;
    totalheight += this._findInput.inputBox.height + 2;
    if (this._isReplaceVisible) {
      totalheight += 4;
      totalheight += this._replaceInput.inputBox.height + 2;
    }
    totalheight += 4;
    return totalheight;
  }
  _tryUpdateHeight() {
    const totalHeight = this._getHeight();
    if (this._cachedHeight !== null && this._cachedHeight === totalHeight) {
      return false;
    }
    this._cachedHeight = totalHeight;
    this._domNode.style.height = `${totalHeight}px`;
    return true;
  }
  // ----- Public
  focusFindInput() {
    this._findInput.select();
    this._findInput.focus();
  }
  focusReplaceInput() {
    this._replaceInput.select();
    this._replaceInput.focus();
  }
  highlightFindOptions() {
    this._findInput.highlightFindOptions();
  }
  _updateSearchScope() {
    if (!this._codeEditor.hasModel()) {
      return;
    }
    if (this._toggleSelectionFind.checked) {
      const selections = this._codeEditor.getSelections();
      selections.map((selection) => {
        if (selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber) {
          selection = selection.setEndPosition(
            selection.endLineNumber - 1,
            this._codeEditor.getModel().getLineMaxColumn(selection.endLineNumber - 1)
          );
        }
        const currentMatch = this._state.currentMatch;
        if (selection.startLineNumber !== selection.endLineNumber) {
          if (!Range.equalsRange(selection, currentMatch)) {
            return selection;
          }
        }
        return null;
      }).filter((element) => !!element);
      if (selections.length) {
        this._state.change({ searchScope: selections }, true);
      }
    }
  }
  _onFindInputMouseDown(e) {
    if (e.middleButton) {
      e.stopPropagation();
    }
  }
  _onFindInputKeyDown(e) {
    if (e.equals(ctrlKeyMod | KeyCode.Enter)) {
      if (this._keybindingService.dispatchEvent(e, e.target)) {
        e.preventDefault();
        return;
      } else {
        this._findInput.inputBox.insertAtCursor("\n");
        e.preventDefault();
        return;
      }
    }
    if (e.equals(KeyCode.Tab)) {
      if (this._isReplaceVisible) {
        this._replaceInput.focus();
      } else {
        this._findInput.focusOnCaseSensitive();
      }
      e.preventDefault();
      return;
    }
    if (e.equals(KeyMod.CtrlCmd | KeyCode.DownArrow)) {
      this._codeEditor.focus();
      e.preventDefault();
      return;
    }
    if (e.equals(KeyCode.UpArrow)) {
      return stopPropagationForMultiLineUpwards(e, this._findInput.getValue(), this._findInput.domNode.querySelector("textarea"));
    }
    if (e.equals(KeyCode.DownArrow)) {
      return stopPropagationForMultiLineDownwards(e, this._findInput.getValue(), this._findInput.domNode.querySelector("textarea"));
    }
  }
  _onReplaceInputKeyDown(e) {
    if (e.equals(ctrlKeyMod | KeyCode.Enter)) {
      if (this._keybindingService.dispatchEvent(e, e.target)) {
        e.preventDefault();
        return;
      } else {
        this._replaceInput.inputBox.insertAtCursor("\n");
        e.preventDefault();
        return;
      }
    }
    if (e.equals(KeyCode.Tab)) {
      this._findInput.focusOnCaseSensitive();
      e.preventDefault();
      return;
    }
    if (e.equals(KeyMod.Shift | KeyCode.Tab)) {
      this._findInput.focus();
      e.preventDefault();
      return;
    }
    if (e.equals(KeyMod.CtrlCmd | KeyCode.DownArrow)) {
      this._codeEditor.focus();
      e.preventDefault();
      return;
    }
    if (e.equals(KeyCode.UpArrow)) {
      return stopPropagationForMultiLineUpwards(e, this._replaceInput.inputBox.value, this._replaceInput.inputBox.element.querySelector("textarea"));
    }
    if (e.equals(KeyCode.DownArrow)) {
      return stopPropagationForMultiLineDownwards(e, this._replaceInput.inputBox.value, this._replaceInput.inputBox.element.querySelector("textarea"));
    }
  }
  // ----- sash
  getVerticalSashLeft(_sash) {
    return 0;
  }
  // ----- initialization
  _keybindingLabelFor(actionId) {
    return this._keybindingService.appendKeybinding("", actionId);
  }
  _buildDomNode() {
    const flexibleHeight = true;
    const flexibleWidth = true;
    const findSearchHistoryConfig = this._codeEditor.getOption(EditorOption.find).history;
    const replaceHistoryConfig = this._codeEditor.getOption(EditorOption.find).replaceHistory;
    this._findInput = this._register(new ContextScopedFindInput(null, this._contextViewProvider, {
      width: FIND_INPUT_AREA_WIDTH,
      label: NLS_FIND_INPUT_LABEL,
      placeholder: NLS_FIND_INPUT_PLACEHOLDER,
      appendCaseSensitiveLabel: this._keybindingLabelFor(FIND_IDS.ToggleCaseSensitiveCommand),
      appendWholeWordsLabel: this._keybindingLabelFor(FIND_IDS.ToggleWholeWordCommand),
      appendRegexLabel: this._keybindingLabelFor(FIND_IDS.ToggleRegexCommand),
      validation: (value) => {
        if (value.length === 0 || !this._findInput.getRegex()) {
          return null;
        }
        try {
          new RegExp(value, "gu");
          return null;
        } catch (e) {
          return { content: e.message };
        }
      },
      flexibleHeight,
      flexibleWidth,
      flexibleMaxHeight: 118,
      showCommonFindToggles: true,
      showHistoryHint: () => showHistoryKeybindingHint(this._keybindingService),
      inputBoxStyles: defaultInputBoxStyles,
      toggleStyles: defaultToggleStyles,
      history: findSearchHistoryConfig === "workspace" ? this._findWidgetSearchHistory : /* @__PURE__ */ new Set([])
    }, this._contextKeyService));
    this._findInput.setRegex(!!this._state.isRegex);
    this._findInput.setCaseSensitive(!!this._state.matchCase);
    this._findInput.setWholeWords(!!this._state.wholeWord);
    this._register(this._findInput.onKeyDown((e) => {
      if (e.equals(KeyCode.Enter) && !this._codeEditor.getOption(EditorOption.find).findOnType) {
        this._state.change({ searchString: this._findInput.getValue() }, true);
      }
      this._onFindInputKeyDown(e);
    }));
    this._register(this._findInput.inputBox.onDidChange(() => {
      if (this._ignoreChangeEvent || !this._codeEditor.getOption(EditorOption.find).findOnType) {
        return;
      }
      this._state.change({ searchString: this._findInput.getValue() }, true);
    }));
    this._register(this._findInput.onDidOptionChange(() => {
      this._state.change({
        isRegex: this._findInput.getRegex(),
        wholeWord: this._findInput.getWholeWords(),
        matchCase: this._findInput.getCaseSensitive()
      }, true);
    }));
    this._register(this._findInput.onCaseSensitiveKeyDown((e) => {
      if (e.equals(KeyMod.Shift | KeyCode.Tab)) {
        if (this._isReplaceVisible) {
          this._replaceInput.focus();
          e.preventDefault();
        }
      }
    }));
    this._register(this._findInput.onRegexKeyDown((e) => {
      if (e.equals(KeyCode.Tab)) {
        if (this._isReplaceVisible) {
          this._replaceInput.focusOnPreserve();
          e.preventDefault();
        }
      }
    }));
    this._register(this._findInput.inputBox.onDidHeightChange((e) => {
      if (this._tryUpdateHeight()) {
        this._showViewZone();
      }
    }));
    if (platform.isLinux) {
      this._register(this._findInput.onMouseDown((e) => this._onFindInputMouseDown(e)));
    }
    this._matchesCount = document.createElement("div");
    this._matchesCount.className = "matchesCount";
    this._updateMatchesCount();
    const hoverLifecycleOptions = { groupId: "find-widget" };
    this._prevBtn = this._register(new SimpleButton({
      label: NLS_PREVIOUS_MATCH_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.PreviousMatchFindAction),
      icon: findPreviousMatchIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        assertReturnsDefined(this._codeEditor.getAction(FIND_IDS.PreviousMatchFindAction)).run().then(void 0, onUnexpectedError);
      }
    }, this._hoverService));
    this._nextBtn = this._register(new SimpleButton({
      label: NLS_NEXT_MATCH_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.NextMatchFindAction),
      icon: findNextMatchIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        assertReturnsDefined(this._codeEditor.getAction(FIND_IDS.NextMatchFindAction)).run().then(void 0, onUnexpectedError);
      }
    }, this._hoverService));
    const findPart = document.createElement("div");
    findPart.className = "find-part";
    findPart.appendChild(this._findInput.domNode);
    const actionsContainer = document.createElement("div");
    actionsContainer.className = "find-actions";
    findPart.appendChild(actionsContainer);
    actionsContainer.appendChild(this._matchesCount);
    actionsContainer.appendChild(this._prevBtn.domNode);
    actionsContainer.appendChild(this._nextBtn.domNode);
    this._toggleSelectionFind = this._register(new Toggle({
      icon: findSelectionIcon,
      title: NLS_TOGGLE_SELECTION_FIND_TITLE + this._keybindingLabelFor(FIND_IDS.ToggleSearchScopeCommand),
      isChecked: false,
      hoverLifecycleOptions,
      inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground),
      inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
      inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground)
    }));
    this._register(this._toggleSelectionFind.onChange(() => {
      if (this._toggleSelectionFind.checked) {
        if (this._codeEditor.hasModel()) {
          let selections = this._codeEditor.getSelections();
          selections = selections.map((selection) => {
            if (selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber) {
              selection = selection.setEndPosition(selection.endLineNumber - 1, this._codeEditor.getModel().getLineMaxColumn(selection.endLineNumber - 1));
            }
            if (!selection.isEmpty()) {
              return selection;
            }
            return null;
          }).filter((element) => !!element);
          if (selections.length) {
            this._state.change({ searchScope: selections }, true);
          }
        }
      } else {
        this._state.change({ searchScope: null }, true);
      }
    }));
    actionsContainer.appendChild(this._toggleSelectionFind.domNode);
    this._closeBtn = this._register(new SimpleButton({
      label: NLS_CLOSE_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.CloseFindWidgetCommand),
      icon: widgetClose,
      hoverLifecycleOptions,
      onTrigger: () => {
        this._state.change({ isRevealed: false, searchScope: null }, false);
      },
      onKeyDown: (e) => {
        if (e.equals(KeyCode.Tab)) {
          if (this._isReplaceVisible) {
            if (this._replaceBtn.isEnabled()) {
              this._replaceBtn.focus();
            } else {
              this._codeEditor.focus();
            }
            e.preventDefault();
          }
        }
      }
    }, this._hoverService));
    this._replaceInput = this._register(new ContextScopedReplaceInput(null, void 0, {
      label: NLS_REPLACE_INPUT_LABEL,
      placeholder: NLS_REPLACE_INPUT_PLACEHOLDER,
      appendPreserveCaseLabel: this._keybindingLabelFor(FIND_IDS.TogglePreserveCaseCommand),
      history: replaceHistoryConfig === "workspace" ? this._replaceWidgetHistory : /* @__PURE__ */ new Set([]),
      flexibleHeight,
      flexibleWidth,
      flexibleMaxHeight: 118,
      showHistoryHint: () => showHistoryKeybindingHint(this._keybindingService),
      inputBoxStyles: defaultInputBoxStyles,
      toggleStyles: defaultToggleStyles,
      hoverLifecycleOptions
    }, this._contextKeyService, true));
    this._replaceInput.setPreserveCase(!!this._state.preserveCase);
    this._register(this._replaceInput.onKeyDown((e) => this._onReplaceInputKeyDown(e)));
    this._register(this._replaceInput.inputBox.onDidChange(() => {
      this._state.change({ replaceString: this._replaceInput.inputBox.value }, false);
    }));
    this._register(this._replaceInput.inputBox.onDidHeightChange((e) => {
      if (this._isReplaceVisible && this._tryUpdateHeight()) {
        this._showViewZone();
      }
    }));
    this._register(this._replaceInput.onDidOptionChange(() => {
      this._state.change({
        preserveCase: this._replaceInput.getPreserveCase()
      }, true);
    }));
    this._register(this._replaceInput.onPreserveCaseKeyDown((e) => {
      if (e.equals(KeyCode.Tab)) {
        if (this._prevBtn.isEnabled()) {
          this._prevBtn.focus();
        } else if (this._nextBtn.isEnabled()) {
          this._nextBtn.focus();
        } else if (this._toggleSelectionFind.enabled) {
          this._toggleSelectionFind.focus();
        } else if (this._closeBtn.isEnabled()) {
          this._closeBtn.focus();
        }
        e.preventDefault();
      }
    }));
    this._replaceBtn = this._register(new SimpleButton({
      label: NLS_REPLACE_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.ReplaceOneAction),
      icon: findReplaceIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this._controller.replace();
      },
      onKeyDown: (e) => {
        if (e.equals(KeyMod.Shift | KeyCode.Tab)) {
          this._closeBtn.focus();
          e.preventDefault();
        }
      }
    }, this._hoverService));
    this._replaceAllBtn = this._register(new SimpleButton({
      label: NLS_REPLACE_ALL_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.ReplaceAllAction),
      icon: findReplaceAllIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this._controller.replaceAll();
      }
    }, this._hoverService));
    const replacePart = document.createElement("div");
    replacePart.className = "replace-part";
    replacePart.appendChild(this._replaceInput.domNode);
    const replaceActionsContainer = document.createElement("div");
    replaceActionsContainer.className = "replace-actions";
    replacePart.appendChild(replaceActionsContainer);
    replaceActionsContainer.appendChild(this._replaceBtn.domNode);
    replaceActionsContainer.appendChild(this._replaceAllBtn.domNode);
    this._toggleReplaceBtn = this._register(new SimpleButton({
      label: NLS_TOGGLE_REPLACE_MODE_BTN_LABEL,
      className: "codicon toggle left",
      onTrigger: () => {
        this._state.change({ isReplaceRevealed: !this._isReplaceVisible }, false);
        if (this._isReplaceVisible) {
          this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
          this._replaceInput.inputBox.layout();
        }
        this._showViewZone();
      }
    }, this._hoverService));
    this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);
    this._domNode = document.createElement("div");
    this._domNode.className = "editor-widget find-widget";
    this._domNode.setAttribute("aria-hidden", "true");
    this._domNode.ariaLabel = NLS_FIND_DIALOG_LABEL;
    this._domNode.role = "dialog";
    this._domNode.style.width = `${FIND_WIDGET_INITIAL_WIDTH}px`;
    this._domNode.appendChild(this._toggleReplaceBtn.domNode);
    this._domNode.appendChild(findPart);
    this._domNode.appendChild(this._closeBtn.domNode);
    this._domNode.appendChild(replacePart);
    this._resizeSash = this._register(new Sash(this._domNode, this, { orientation: Orientation.VERTICAL, size: 2 }));
    this._resized = false;
    let originalWidth = FIND_WIDGET_INITIAL_WIDTH;
    this._register(this._resizeSash.onDidStart(() => {
      originalWidth = dom.getTotalWidth(this._domNode);
    }));
    this._register(this._resizeSash.onDidChange((evt) => {
      this._resized = true;
      const width = originalWidth + evt.startX - evt.currentX;
      if (width < FIND_WIDGET_INITIAL_WIDTH) {
        return;
      }
      const maxWidth = parseFloat(dom.getComputedStyle(this._domNode).maxWidth) || 0;
      if (width > maxWidth) {
        return;
      }
      this._domNode.style.width = `${width}px`;
      if (this._isReplaceVisible) {
        this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
      }
      this._findInput.inputBox.layout();
      this._tryUpdateHeight();
    }));
    this._register(this._resizeSash.onDidReset(() => {
      const currentWidth = dom.getTotalWidth(this._domNode);
      if (currentWidth < FIND_WIDGET_INITIAL_WIDTH) {
        return;
      }
      let width = FIND_WIDGET_INITIAL_WIDTH;
      if (!this._resized || currentWidth === FIND_WIDGET_INITIAL_WIDTH) {
        const layoutInfo = this._codeEditor.getLayoutInfo();
        width = layoutInfo.width - 28 - layoutInfo.minimap.minimapWidth - 15;
        this._resized = true;
      } else {
      }
      this._domNode.style.width = `${width}px`;
      if (this._isReplaceVisible) {
        this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
      }
      this._findInput.inputBox.layout();
    }));
  }
  updateAccessibilitySupport() {
    const value = this._codeEditor.getOption(EditorOption.accessibilitySupport);
    this._findInput.setFocusInputOnOptionClick(value !== AccessibilitySupport.Enabled);
    this._updateFindInputAriaLabel();
  }
  _updateFindInputAriaLabel() {
    let findLabel = NLS_FIND_INPUT_LABEL;
    let replaceLabel = NLS_REPLACE_INPUT_LABEL;
    if (!this._accessibilityHelpHintAnnounced && this._configurationService.getValue("accessibility.verbosity.find") && this._accessibilityService.isScreenReaderOptimized()) {
      const accessibilityHelpKeybinding = this._keybindingService.lookupKeybinding("editor.action.accessibilityHelp")?.getAriaLabel();
      if (accessibilityHelpKeybinding) {
        const hint = nls.localize("accessibilityHelpHintInLabel", "Press {0} for accessibility help", accessibilityHelpKeybinding);
        findLabel = nls.localize("findInputAriaLabelWithHint", "{0}, {1}", findLabel, hint);
        replaceLabel = nls.localize("replaceInputAriaLabelWithHint", "{0}, {1}", replaceLabel, hint);
      }
      this._accessibilityHelpHintAnnounced = true;
      this._labelResetTimeout?.dispose();
      this._labelResetTimeout = disposableTimeout(() => {
        if (this._isVisible) {
          this._findInput.inputBox.setAriaLabel(NLS_FIND_INPUT_LABEL);
          this._replaceInput.inputBox.setAriaLabel(NLS_REPLACE_INPUT_LABEL);
        }
      }, 1e3);
    }
    this._findInput.inputBox.setAriaLabel(findLabel);
    this._replaceInput.inputBox.setAriaLabel(replaceLabel);
  }
  getViewState() {
    let widgetViewZoneVisible = false;
    if (this._viewZone && this._viewZoneId) {
      widgetViewZoneVisible = this._viewZone.heightInPx > this._codeEditor.getScrollTop();
    }
    return {
      widgetViewZoneVisible,
      scrollTop: this._codeEditor.getScrollTop()
    };
  }
  setViewState(state) {
    if (!state) {
      return;
    }
    if (state.widgetViewZoneVisible) {
      this._layoutViewZone(state.scrollTop);
    }
  }
};
_FindWidget.ID = "editor.contrib.findWidget";
let FindWidget = _FindWidget;
class SimpleButton extends Widget {
  constructor(opts, hoverService) {
    super();
    this._opts = opts;
    let className = "button";
    if (this._opts.className) {
      className = className + " " + this._opts.className;
    }
    if (this._opts.icon) {
      className = className + " " + ThemeIcon.asClassName(this._opts.icon);
    }
    this._domNode = document.createElement("div");
    this._domNode.tabIndex = 0;
    this._domNode.className = className;
    this._domNode.setAttribute("role", "button");
    this._domNode.setAttribute("aria-label", this._opts.label);
    this._register(hoverService.setupDelayedHover(this._domNode, {
      content: this._opts.label,
      style: HoverStyle.Pointer
    }, opts.hoverLifecycleOptions));
    this.onclick(this._domNode, (e) => {
      this._opts.onTrigger();
      e.preventDefault();
    });
    this.onkeydown(this._domNode, (e) => {
      if (e.equals(KeyCode.Space) || e.equals(KeyCode.Enter)) {
        this._opts.onTrigger();
        e.preventDefault();
        return;
      }
      this._opts.onKeyDown?.(e);
    });
  }
  get domNode() {
    return this._domNode;
  }
  isEnabled() {
    return this._domNode.tabIndex >= 0;
  }
  focus() {
    this._domNode.focus();
  }
  setEnabled(enabled) {
    this._domNode.classList.toggle("disabled", !enabled);
    this._domNode.setAttribute("aria-disabled", String(!enabled));
    this._domNode.tabIndex = enabled ? 0 : -1;
  }
  setExpanded(expanded) {
    this._domNode.setAttribute("aria-expanded", String(!!expanded));
    if (expanded) {
      this._domNode.classList.remove(...ThemeIcon.asClassNameArray(findCollapsedIcon));
      this._domNode.classList.add(...ThemeIcon.asClassNameArray(findExpandedIcon));
    } else {
      this._domNode.classList.remove(...ThemeIcon.asClassNameArray(findExpandedIcon));
      this._domNode.classList.add(...ThemeIcon.asClassNameArray(findCollapsedIcon));
    }
  }
}
registerThemingParticipant((theme, collector) => {
  const findMatchHighlightBorder = theme.getColor(editorFindMatchHighlightBorder);
  if (findMatchHighlightBorder) {
    collector.addRule(`.monaco-editor .findMatch { border: 1px ${isHighContrast(theme.type) ? "dotted" : "solid"} ${findMatchHighlightBorder}; box-sizing: border-box; }`);
  }
  const findRangeHighlightBorder = theme.getColor(editorFindRangeHighlightBorder);
  if (findRangeHighlightBorder) {
    collector.addRule(`.monaco-editor .findScope { border: 1px ${isHighContrast(theme.type) ? "dashed" : "solid"} ${findRangeHighlightBorder}; }`);
  }
  const hcBorder = theme.getColor(contrastBorder);
  if (hcBorder) {
    collector.addRule(`.monaco-editor .find-widget { border: 1px solid ${hcBorder}; }`);
  }
  const findMatchForeground = theme.getColor(editorFindMatchForeground);
  if (findMatchForeground) {
    collector.addRule(`.monaco-editor .findMatchInline { color: ${findMatchForeground}; }`);
  }
  const findMatchHighlightForeground = theme.getColor(editorFindMatchHighlightForeground);
  if (findMatchHighlightForeground) {
    collector.addRule(`.monaco-editor .currentFindMatchInline { color: ${findMatchHighlightForeground}; }`);
  }
});
export {
  FindWidget,
  FindWidgetViewZone,
  NLS_MATCHES_LOCATION,
  NLS_NO_RESULTS,
  SimpleButton,
  findNextMatchIcon,
  findPreviousMatchIcon,
  findReplaceAllIcon,
  findReplaceIcon,
  findSelectionIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZpbmRcXGJyb3dzZXJcXGZpbmRXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IElNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgYWxlcnQgYXMgYWxlcnRGbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgVG9nZ2xlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgRmluZElucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ZpbmRpbnB1dC9maW5kSW5wdXQuanMnO1xuaW1wb3J0IHsgUmVwbGFjZUlucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ZpbmRpbnB1dC9yZXBsYWNlSW5wdXQuanMnO1xuaW1wb3J0IHsgSU1lc3NhZ2UgYXMgSW5wdXRCb3hNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IElTYXNoRXZlbnQsIElWZXJ0aWNhbFNhc2hMYXlvdXRQcm92aWRlciwgT3JpZW50YXRpb24sIFNhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IFdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS93aWRnZXQuanMnO1xuaW1wb3J0IHsgRGVsYXllciwgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0ICcuL2ZpbmRXaWRnZXQuY3NzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJT3ZlcmxheVdpZGdldCwgSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiwgSVZpZXdab25lLCBPdmVybGF5V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQsIEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IENPTlRFWFRfRklORF9JTlBVVF9GT0NVU0VELCBDT05URVhUX0ZJTkRfV0lER0VUX0ZPQ1VTRUQsIENPTlRFWFRfUkVQTEFDRV9JTlBVVF9GT0NVU0VELCBGSU5EX0lEUywgTUFUQ0hFU19MSU1JVCB9IGZyb20gJy4vZmluZE1vZGVsLmpzJztcbmltcG9ydCB7IEZpbmRSZXBsYWNlU3RhdGUsIEZpbmRSZXBsYWNlU3RhdGVDaGFuZ2VkRXZlbnQgfSBmcm9tICcuL2ZpbmRTdGF0ZS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTdXBwb3J0LCBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IENvbnRleHRTY29wZWRGaW5kSW5wdXQsIENvbnRleHRTY29wZWRSZXBsYWNlSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9oaXN0b3J5L2Jyb3dzZXIvY29udGV4dFNjb3BlZEhpc3RvcnlXaWRnZXQuanMnO1xuaW1wb3J0IHsgc2hvd0hpc3RvcnlLZXliaW5kaW5nSGludCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hpc3RvcnkvYnJvd3Nlci9oaXN0b3J5V2lkZ2V0S2V5YmluZGluZ0hpbnQuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBjb250cmFzdEJvcmRlciwgZWRpdG9yRmluZE1hdGNoRm9yZWdyb3VuZCwgZWRpdG9yRmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyLCBlZGl0b3JGaW5kTWF0Y2hIaWdobGlnaHRGb3JlZ3JvdW5kLCBlZGl0b3JGaW5kUmFuZ2VIaWdobGlnaHRCb3JkZXIsIGlucHV0QWN0aXZlT3B0aW9uQmFja2dyb3VuZCwgaW5wdXRBY3RpdmVPcHRpb25Cb3JkZXIsIGlucHV0QWN0aXZlT3B0aW9uRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiwgd2lkZ2V0Q2xvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgaXNIaWdoQ29udHJhc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsIGRlZmF1bHRUb2dnbGVTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElIaXN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0eWxlLCB0eXBlIElIb3ZlckxpZmVjeWNsZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5cbmNvbnN0IGZpbmRDb2xsYXBzZWRJY29uID0gcmVnaXN0ZXJJY29uKCdmaW5kLWNvbGxhcHNlZCcsIENvZGljb24uY2hldnJvblJpZ2h0LCBubHMubG9jYWxpemUoJ2ZpbmRDb2xsYXBzZWRJY29uJywgJ0ljb24gdG8gaW5kaWNhdGUgdGhhdCB0aGUgZWRpdG9yIGZpbmQgd2lkZ2V0IGlzIGNvbGxhcHNlZC4nKSk7XG5jb25zdCBmaW5kRXhwYW5kZWRJY29uID0gcmVnaXN0ZXJJY29uKCdmaW5kLWV4cGFuZGVkJywgQ29kaWNvbi5jaGV2cm9uRG93biwgbmxzLmxvY2FsaXplKCdmaW5kRXhwYW5kZWRJY29uJywgJ0ljb24gdG8gaW5kaWNhdGUgdGhhdCB0aGUgZWRpdG9yIGZpbmQgd2lkZ2V0IGlzIGV4cGFuZGVkLicpKTtcblxuZXhwb3J0IGNvbnN0IGZpbmRTZWxlY3Rpb25JY29uID0gcmVnaXN0ZXJJY29uKCdmaW5kLXNlbGVjdGlvbicsIENvZGljb24uc2VsZWN0aW9uLCBubHMubG9jYWxpemUoJ2ZpbmRTZWxlY3Rpb25JY29uJywgJ0ljb24gZm9yIFxcJ0ZpbmQgaW4gU2VsZWN0aW9uXFwnIGluIHRoZSBlZGl0b3IgZmluZCB3aWRnZXQuJykpO1xuZXhwb3J0IGNvbnN0IGZpbmRSZXBsYWNlSWNvbiA9IHJlZ2lzdGVySWNvbignZmluZC1yZXBsYWNlJywgQ29kaWNvbi5yZXBsYWNlLCBubHMubG9jYWxpemUoJ2ZpbmRSZXBsYWNlSWNvbicsICdJY29uIGZvciBcXCdSZXBsYWNlXFwnIGluIHRoZSBlZGl0b3IgZmluZCB3aWRnZXQuJykpO1xuZXhwb3J0IGNvbnN0IGZpbmRSZXBsYWNlQWxsSWNvbiA9IHJlZ2lzdGVySWNvbignZmluZC1yZXBsYWNlLWFsbCcsIENvZGljb24ucmVwbGFjZUFsbCwgbmxzLmxvY2FsaXplKCdmaW5kUmVwbGFjZUFsbEljb24nLCAnSWNvbiBmb3IgXFwnUmVwbGFjZSBBbGxcXCcgaW4gdGhlIGVkaXRvciBmaW5kIHdpZGdldC4nKSk7XG5leHBvcnQgY29uc3QgZmluZFByZXZpb3VzTWF0Y2hJY29uID0gcmVnaXN0ZXJJY29uKCdmaW5kLXByZXZpb3VzLW1hdGNoJywgQ29kaWNvbi5hcnJvd1VwLCBubHMubG9jYWxpemUoJ2ZpbmRQcmV2aW91c01hdGNoSWNvbicsICdJY29uIGZvciBcXCdGaW5kIFByZXZpb3VzXFwnIGluIHRoZSBlZGl0b3IgZmluZCB3aWRnZXQuJykpO1xuZXhwb3J0IGNvbnN0IGZpbmROZXh0TWF0Y2hJY29uID0gcmVnaXN0ZXJJY29uKCdmaW5kLW5leHQtbWF0Y2gnLCBDb2RpY29uLmFycm93RG93biwgbmxzLmxvY2FsaXplKCdmaW5kTmV4dE1hdGNoSWNvbicsICdJY29uIGZvciBcXCdGaW5kIE5leHRcXCcgaW4gdGhlIGVkaXRvciBmaW5kIHdpZGdldC4nKSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbmRDb250cm9sbGVyIHtcblx0cmVwbGFjZSgpOiB2b2lkO1xuXHRyZXBsYWNlQWxsKCk6IHZvaWQ7XG5cdGdldEdsb2JhbEJ1ZmZlclRlcm0oKTogUHJvbWlzZTxzdHJpbmc+O1xufVxuXG5jb25zdCBOTFNfRklORF9ESUFMT0dfTEFCRUwgPSBubHMubG9jYWxpemUoJ2xhYmVsLmZpbmREaWFsb2cnLCBcIkZpbmQgLyBSZXBsYWNlXCIpO1xuY29uc3QgTkxTX0ZJTkRfSU5QVVRfTEFCRUwgPSBubHMubG9jYWxpemUoJ2xhYmVsLmZpbmQnLCBcIkZpbmRcIik7XG5jb25zdCBOTFNfRklORF9JTlBVVF9QTEFDRUhPTERFUiA9IG5scy5sb2NhbGl6ZSgncGxhY2Vob2xkZXIuZmluZCcsIFwiRmluZFwiKTtcbmNvbnN0IE5MU19QUkVWSU9VU19NQVRDSF9CVE5fTEFCRUwgPSBubHMubG9jYWxpemUoJ2xhYmVsLnByZXZpb3VzTWF0Y2hCdXR0b24nLCBcIlByZXZpb3VzIE1hdGNoXCIpO1xuY29uc3QgTkxTX05FWFRfTUFUQ0hfQlROX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5uZXh0TWF0Y2hCdXR0b24nLCBcIk5leHQgTWF0Y2hcIik7XG5jb25zdCBOTFNfVE9HR0xFX1NFTEVDVElPTl9GSU5EX1RJVExFID0gbmxzLmxvY2FsaXplKCdsYWJlbC50b2dnbGVTZWxlY3Rpb25GaW5kJywgXCJGaW5kIGluIFNlbGVjdGlvblwiKTtcbmNvbnN0IE5MU19DTE9TRV9CVE5fTEFCRUwgPSBubHMubG9jYWxpemUoJ2xhYmVsLmNsb3NlQnV0dG9uJywgXCJDbG9zZVwiKTtcbmNvbnN0IE5MU19SRVBMQUNFX0lOUFVUX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5yZXBsYWNlJywgXCJSZXBsYWNlXCIpO1xuY29uc3QgTkxTX1JFUExBQ0VfSU5QVVRfUExBQ0VIT0xERVIgPSBubHMubG9jYWxpemUoJ3BsYWNlaG9sZGVyLnJlcGxhY2UnLCBcIlJlcGxhY2VcIik7XG5jb25zdCBOTFNfUkVQTEFDRV9CVE5fTEFCRUwgPSBubHMubG9jYWxpemUoJ2xhYmVsLnJlcGxhY2VCdXR0b24nLCBcIlJlcGxhY2VcIik7XG5jb25zdCBOTFNfUkVQTEFDRV9BTExfQlROX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5yZXBsYWNlQWxsQnV0dG9uJywgXCJSZXBsYWNlIEFsbFwiKTtcbmNvbnN0IE5MU19UT0dHTEVfUkVQTEFDRV9NT0RFX0JUTl9MQUJFTCA9IG5scy5sb2NhbGl6ZSgnbGFiZWwudG9nZ2xlUmVwbGFjZUJ1dHRvbicsIFwiVG9nZ2xlIFJlcGxhY2VcIik7XG5jb25zdCBOTFNfTUFUQ0hFU19DT1VOVF9MSU1JVF9USVRMRSA9IG5scy5sb2NhbGl6ZSgndGl0bGUubWF0Y2hlc0NvdW50TGltaXQnLCBcIk9ubHkgdGhlIGZpcnN0IHswfSByZXN1bHRzIGFyZSBoaWdobGlnaHRlZCwgYnV0IGFsbCBmaW5kIG9wZXJhdGlvbnMgd29yayBvbiB0aGUgZW50aXJlIHRleHQuXCIsIE1BVENIRVNfTElNSVQpO1xuZXhwb3J0IGNvbnN0IE5MU19NQVRDSEVTX0xPQ0FUSU9OID0gbmxzLmxvY2FsaXplKCdsYWJlbC5tYXRjaGVzTG9jYXRpb24nLCBcInswfSBvZiB7MX1cIik7XG5leHBvcnQgY29uc3QgTkxTX05PX1JFU1VMVFMgPSBubHMubG9jYWxpemUoJ2xhYmVsLm5vUmVzdWx0cycsIFwiTm8gcmVzdWx0c1wiKTtcblxuY29uc3QgRklORF9XSURHRVRfSU5JVElBTF9XSURUSCA9IDQxOTtcbmNvbnN0IFBBUlRfV0lEVEggPSAyNzU7XG5jb25zdCBGSU5EX0lOUFVUX0FSRUFfV0lEVEggPSBQQVJUX1dJRFRIIC0gNTQ7XG5cbmxldCBNQVhfTUFUQ0hFU19DT1VOVF9XSURUSCA9IDY5O1xuLy8gbGV0IEZJTkRfQUxMX0NPTlRST0xTX1dJRFRIID0gMTcvKiogRmluZCBJbnB1dCBtYXJnaW4tbGVmdCAqLyArIChNQVhfTUFUQ0hFU19DT1VOVF9XSURUSCArIDMgKyAxKSAvKiogTWF0Y2ggUmVzdWx0cyAqLyArIDIzIC8qKiBCdXR0b24gKi8gKiA0ICsgMi8qKiBzYXNoICovO1xuXG5jb25zdCBGSU5EX0lOUFVUX0FSRUFfSEVJR0hUID0gMzM7IC8vIFRoZSBoZWlnaHQgb2YgRmluZCBXaWRnZXQgd2hlbiBSZXBsYWNlIElucHV0IGlzIG5vdCB2aXNpYmxlLlxuXG5jb25zdCBjdHJsS2V5TW9kID0gKHBsYXRmb3JtLmlzTWFjaW50b3NoID8gS2V5TW9kLldpbkN0cmwgOiBLZXlNb2QuQ3RybENtZCk7XG5leHBvcnQgY2xhc3MgRmluZFdpZGdldFZpZXdab25lIGltcGxlbWVudHMgSVZpZXdab25lIHtcblx0cHVibGljIHJlYWRvbmx5IGFmdGVyTGluZU51bWJlcjogbnVtYmVyO1xuXHRwdWJsaWMgaGVpZ2h0SW5QeDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgc3VwcHJlc3NNb3VzZURvd246IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3RvcihhZnRlckxpbmVOdW1iZXI6IG51bWJlcikge1xuXHRcdHRoaXMuYWZ0ZXJMaW5lTnVtYmVyID0gYWZ0ZXJMaW5lTnVtYmVyO1xuXG5cdFx0dGhpcy5oZWlnaHRJblB4ID0gRklORF9JTlBVVF9BUkVBX0hFSUdIVDtcblx0XHR0aGlzLnN1cHByZXNzTW91c2VEb3duID0gZmFsc2U7XG5cdFx0dGhpcy5kb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTmFtZSA9ICdkb2NrLWZpbmQtdmlld3pvbmUnO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHN0b3BQcm9wYWdhdGlvbkZvck11bHRpTGluZVVwd2FyZHMoZXZlbnQ6IElLZXlib2FyZEV2ZW50LCB2YWx1ZTogc3RyaW5nLCB0ZXh0YXJlYTogSFRNTFRleHRBcmVhRWxlbWVudCB8IG51bGwpIHtcblx0Y29uc3QgaXNNdWx0aWxpbmUgPSAhIXZhbHVlLm1hdGNoKC9cXG4vKTtcblx0aWYgKHRleHRhcmVhICYmIGlzTXVsdGlsaW5lICYmIHRleHRhcmVhLnNlbGVjdGlvblN0YXJ0ID4gMCkge1xuXHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdHJldHVybjtcblx0fVxufVxuXG5mdW5jdGlvbiBzdG9wUHJvcGFnYXRpb25Gb3JNdWx0aUxpbmVEb3dud2FyZHMoZXZlbnQ6IElLZXlib2FyZEV2ZW50LCB2YWx1ZTogc3RyaW5nLCB0ZXh0YXJlYTogSFRNTFRleHRBcmVhRWxlbWVudCB8IG51bGwpIHtcblx0Y29uc3QgaXNNdWx0aWxpbmUgPSAhIXZhbHVlLm1hdGNoKC9cXG4vKTtcblx0aWYgKHRleHRhcmVhICYmIGlzTXVsdGlsaW5lICYmIHRleHRhcmVhLnNlbGVjdGlvbkVuZCA8IHRleHRhcmVhLnZhbHVlLmxlbmd0aCkge1xuXHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdHJldHVybjtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRmluZFdpZGdldCBleHRlbmRzIFdpZGdldCBpbXBsZW1lbnRzIElPdmVybGF5V2lkZ2V0LCBJVmVydGljYWxTYXNoTGF5b3V0UHJvdmlkZXIge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuY29udHJpYi5maW5kV2lkZ2V0Jztcblx0cHJpdmF0ZSByZWFkb25seSBfY29kZUVkaXRvcjogSUNvZGVFZGl0b3I7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlOiBGaW5kUmVwbGFjZVN0YXRlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250cm9sbGVyOiBJRmluZENvbnRyb2xsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRWaWV3UHJvdmlkZXI6IElDb250ZXh0Vmlld1Byb3ZpZGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXG5cdHByaXZhdGUgX2RvbU5vZGUhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfY2FjaGVkSGVpZ2h0OiBudW1iZXIgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfZmluZElucHV0ITogRmluZElucHV0O1xuXHRwcml2YXRlIF9yZXBsYWNlSW5wdXQhOiBSZXBsYWNlSW5wdXQ7XG5cblx0cHJpdmF0ZSBfdG9nZ2xlUmVwbGFjZUJ0biE6IFNpbXBsZUJ1dHRvbjtcblx0cHJpdmF0ZSBfbWF0Y2hlc0NvdW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3ByZXZCdG4hOiBTaW1wbGVCdXR0b247XG5cdHByaXZhdGUgX25leHRCdG4hOiBTaW1wbGVCdXR0b247XG5cdHByaXZhdGUgX3RvZ2dsZVNlbGVjdGlvbkZpbmQhOiBUb2dnbGU7XG5cdHByaXZhdGUgX2Nsb3NlQnRuITogU2ltcGxlQnV0dG9uO1xuXHRwcml2YXRlIF9yZXBsYWNlQnRuITogU2ltcGxlQnV0dG9uO1xuXHRwcml2YXRlIF9yZXBsYWNlQWxsQnRuITogU2ltcGxlQnV0dG9uO1xuXG5cdHByaXZhdGUgX2lzVmlzaWJsZTogYm9vbGVhbjtcblx0cHJpdmF0ZSBfaXNSZXBsYWNlVmlzaWJsZTogYm9vbGVhbjtcblx0cHJpdmF0ZSBfaWdub3JlQ2hhbmdlRXZlbnQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX2FjY2Vzc2liaWxpdHlIZWxwSGludEFubm91bmNlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfbGFiZWxSZXNldFRpbWVvdXQ6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXN0Rm9jdXNlZElucHV0V2FzUmVwbGFjZTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbmRGb2N1c1RyYWNrZXI6IGRvbS5JRm9jdXNUcmFja2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maW5kSW5wdXRGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVwbGFjZUZvY3VzVHJhY2tlcjogZG9tLklGb2N1c1RyYWNrZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcGxhY2VJbnB1dEZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF93aWRnZXRGb2N1c1RyYWNrZXI6IGRvbS5JRm9jdXNUcmFja2VyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maW5kV2lkZ2V0Rm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2xhc3RGb2N1c2VkRWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfdmlld1pvbmU/OiBGaW5kV2lkZ2V0Vmlld1pvbmU7XG5cdHByaXZhdGUgX3ZpZXdab25lSWQ/OiBzdHJpbmc7XG5cblx0cHJpdmF0ZSBfcmVzaXplU2FzaCE6IFNhc2g7XG5cdHByaXZhdGUgX3Jlc2l6ZWQhOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91cGRhdGVIaXN0b3J5RGVsYXllcjogRGVsYXllcjx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb2RlRWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRjb250cm9sbGVyOiBJRmluZENvbnRyb2xsZXIsXG5cdFx0c3RhdGU6IEZpbmRSZXBsYWNlU3RhdGUsXG5cdFx0Y29udGV4dFZpZXdQcm92aWRlcjogSUNvbnRleHRWaWV3UHJvdmlkZXIsXG5cdFx0a2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9maW5kV2lkZ2V0U2VhcmNoSGlzdG9yeTogSUhpc3Rvcnk8c3RyaW5nPiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXBsYWNlV2lkZ2V0SGlzdG9yeTogSUhpc3Rvcnk8c3RyaW5nPiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY29kZUVkaXRvciA9IGNvZGVFZGl0b3I7XG5cdFx0dGhpcy5fY29udHJvbGxlciA9IGNvbnRyb2xsZXI7XG5cdFx0dGhpcy5fc3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9jb250ZXh0Vmlld1Byb3ZpZGVyID0gY29udGV4dFZpZXdQcm92aWRlcjtcblx0XHR0aGlzLl9rZXliaW5kaW5nU2VydmljZSA9IGtleWJpbmRpbmdTZXJ2aWNlO1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlID0gY29udGV4dEtleVNlcnZpY2U7XG5cblx0XHR0aGlzLl9pc1Zpc2libGUgPSBmYWxzZTtcblx0XHR0aGlzLl9pc1JlcGxhY2VWaXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5faWdub3JlQ2hhbmdlRXZlbnQgPSBmYWxzZTtcblx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5SGVscEhpbnRBbm5vdW5jZWQgPSBmYWxzZTtcblxuXHRcdHRoaXMuX3VwZGF0ZUhpc3RvcnlEZWxheWVyID0gbmV3IERlbGF5ZXI8dm9pZD4oNTAwKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fdXBkYXRlSGlzdG9yeURlbGF5ZXIuY2FuY2VsKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGF0ZS5vbkZpbmRSZXBsYWNlU3RhdGVDaGFuZ2UoKGUpID0+IHRoaXMuX29uU3RhdGVDaGFuZ2VkKGUpKSk7XG5cdFx0dGhpcy5fYnVpbGREb21Ob2RlKCk7XG5cdFx0dGhpcy5fdXBkYXRlQnV0dG9ucygpO1xuXHRcdHRoaXMuX3RyeVVwZGF0ZVdpZGdldFdpZHRoKCk7XG5cdFx0dGhpcy5fZmluZElucHV0LmlucHV0Qm94LmxheW91dCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29kZUVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGU6IENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnJlYWRPbmx5KSkge1xuXHRcdFx0XHRpZiAodGhpcy5fY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnJlYWRPbmx5KSkge1xuXHRcdFx0XHRcdC8vIEhpZGUgcmVwbGFjZSBwYXJ0IGlmIGVkaXRvciBiZWNvbWVzIHJlYWQgb25seVxuXHRcdFx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IGlzUmVwbGFjZVJldmVhbGVkOiBmYWxzZSB9LCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdXBkYXRlQnV0dG9ucygpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbykpIHtcblx0XHRcdFx0dGhpcy5fdHJ5VXBkYXRlV2lkZ2V0V2lkdGgoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uYWNjZXNzaWJpbGl0eVN1cHBvcnQpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQWNjZXNzaWJpbGl0eVN1cHBvcnQoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZmluZCkpIHtcblx0XHRcdFx0Y29uc3Qgc3VwcG9ydExvb3AgPSB0aGlzLl9jb2RlRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkubG9vcDtcblx0XHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgbG9vcDogc3VwcG9ydExvb3AgfSwgZmFsc2UpO1xuXHRcdFx0XHRjb25zdCBhZGRFeHRyYVNwYWNlT25Ub3AgPSB0aGlzLl9jb2RlRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuYWRkRXh0cmFTcGFjZU9uVG9wO1xuXHRcdFx0XHRpZiAoYWRkRXh0cmFTcGFjZU9uVG9wICYmICF0aGlzLl92aWV3Wm9uZSkge1xuXHRcdFx0XHRcdHRoaXMuX3ZpZXdab25lID0gbmV3IEZpbmRXaWRnZXRWaWV3Wm9uZSgwKTtcblx0XHRcdFx0XHR0aGlzLl9zaG93Vmlld1pvbmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWFkZEV4dHJhU3BhY2VPblRvcCAmJiB0aGlzLl92aWV3Wm9uZSkge1xuXHRcdFx0XHRcdHRoaXMuX3JlbW92ZVZpZXdab25lKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy51cGRhdGVBY2Nlc3NpYmlsaXR5U3VwcG9ydCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvZGVFZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUb2dnbGVTZWxlY3Rpb25GaW5kQnV0dG9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvZGVFZGl0b3Iub25EaWRGb2N1c0VkaXRvcldpZGdldChhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRcdGNvbnN0IGdsb2JhbEJ1ZmZlclRlcm0gPSBhd2FpdCB0aGlzLl9jb250cm9sbGVyLmdldEdsb2JhbEJ1ZmZlclRlcm0oKTtcblx0XHRcdFx0aWYgKGdsb2JhbEJ1ZmZlclRlcm0gJiYgZ2xvYmFsQnVmZmVyVGVybSAhPT0gdGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiBnbG9iYWxCdWZmZXJUZXJtIH0sIGZhbHNlKTtcblx0XHRcdFx0XHR0aGlzLl9maW5kSW5wdXQuc2VsZWN0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fZmluZElucHV0Rm9jdXNlZCA9IENPTlRFWFRfRklORF9JTlBVVF9GT0NVU0VELmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fZmluZEZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGRvbS50cmFja0ZvY3VzKHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5pbnB1dEVsZW1lbnQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maW5kRm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZmluZElucHV0Rm9jdXNlZC5zZXQodHJ1ZSk7XG5cdFx0XHR0aGlzLl9sYXN0Rm9jdXNlZElucHV0V2FzUmVwbGFjZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fdXBkYXRlU2VhcmNoU2NvcGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmluZEZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZmluZElucHV0Rm9jdXNlZC5zZXQoZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlcGxhY2VJbnB1dEZvY3VzZWQgPSBDT05URVhUX1JFUExBQ0VfSU5QVVRfRk9DVVNFRC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlcGxhY2VGb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3Rlcihkb20udHJhY2tGb2N1cyh0aGlzLl9yZXBsYWNlSW5wdXQuaW5wdXRCb3guaW5wdXRFbGVtZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVwbGFjZUZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dEZvY3VzZWQuc2V0KHRydWUpO1xuXHRcdFx0dGhpcy5fbGFzdEZvY3VzZWRJbnB1dFdhc1JlcGxhY2UgPSB0cnVlO1xuXHRcdFx0dGhpcy5fdXBkYXRlU2VhcmNoU2NvcGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVwbGFjZUZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVwbGFjZUlucHV0Rm9jdXNlZC5zZXQoZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIGZvY3VzIG9uIHRoZSBlbnRpcmUgRmluZCB3aWRnZXQgZm9yIGFjY2Vzc2liaWxpdHkgaGVscFxuXHRcdHRoaXMuX2ZpbmRXaWRnZXRGb2N1c2VkID0gQ09OVEVYVF9GSU5EX1dJREdFVF9GT0NVU0VELmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fd2lkZ2V0Rm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoZG9tLnRyYWNrRm9jdXModGhpcy5fZG9tTm9kZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dpZGdldEZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdHRoaXMuX2ZpbmRXaWRnZXRGb2N1c2VkLnNldCh0cnVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd2lkZ2V0Rm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHR0aGlzLl9maW5kV2lkZ2V0Rm9jdXNlZC5zZXQoZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIHdoaWNoIGVsZW1lbnQgd2FzIGxhc3QgZm9jdXNlZCB3aXRoaW4gdGhlIHdpZGdldCB1c2luZyBmb2N1c2luICh3aGljaCBidWJibGVzKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZG9tTm9kZSwgJ2ZvY3VzaW4nLCAoZTogRm9jdXNFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGRvbS5pc0hUTUxFbGVtZW50KGUudGFyZ2V0KSkge1xuXHRcdFx0XHR0aGlzLl9sYXN0Rm9jdXNlZEVsZW1lbnQgPSBlLnRhcmdldDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9jb2RlRWRpdG9yLmFkZE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdFx0aWYgKHRoaXMuX2NvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5hZGRFeHRyYVNwYWNlT25Ub3ApIHtcblx0XHRcdHRoaXMuX3ZpZXdab25lID0gbmV3IEZpbmRXaWRnZXRWaWV3Wm9uZSgwKTsgLy8gUHV0IGl0IGJlZm9yZSB0aGUgZmlyc3QgbGluZSB0aGVuIHVzZXJzIGNhbiBzY3JvbGwgYmV5b25kIHRoZSBmaXJzdCBsaW5lLlxuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvZGVFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl92aWV3Wm9uZUlkID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29kZUVkaXRvci5vbkRpZFNjcm9sbENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKGUuc2Nyb2xsVG9wQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl9sYXlvdXRWaWV3Wm9uZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIGZvciBvdGhlciBzY3JvbGwgY2hhbmdlcywgbGF5b3V0IHRoZSB2aWV3em9uZSBpbiBuZXh0IHRpY2sgdG8gYXZvaWQgcnVpbmluZyBjdXJyZW50IHJlbmRlcmluZy5cblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9sYXlvdXRWaWV3Wm9uZSgpO1xuXHRcdFx0fSwgMCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tLS0gSU92ZXJsYXlXaWRnZXQgQVBJXG5cblx0cHVibGljIGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEZpbmRXaWRnZXQuSUQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSBSZXBsYWNlIGlucHV0IHdhcyB0aGUgbGFzdCBmb2N1c2VkIGlucHV0IGluIHRoZSBmaW5kIHdpZGdldC5cblx0ICogVGhpcyBwZXJzaXN0cyBldmVuIGFmdGVyIGZvY3VzIGxlYXZlcyB0aGUgd2lkZ2V0LCBhbGxvd2luZyBleHRlcm5hbCBjb2RlIHRvIGtub3dcblx0ICogd2hpY2ggaW5wdXQgdG8gcmVzdG9yZSBmb2N1cyB0by5cblx0ICovXG5cdHB1YmxpYyBnZXQgbGFzdEZvY3VzZWRJbnB1dFdhc1JlcGxhY2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhc3RGb2N1c2VkSW5wdXRXYXNSZXBsYWNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGxhc3QgZm9jdXNlZCBlbGVtZW50IHdpdGhpbiB0aGUgRmluZCB3aWRnZXQuXG5cdCAqIFRoaXMgaXMgdXNlZnVsIGZvciByZXN0b3JpbmcgZm9jdXMgdG8gdGhlIGV4YWN0IGVsZW1lbnQgYWZ0ZXJcblx0ICogYWNjZXNzaWJpbGl0eSBoZWxwIG9yIG90aGVyIG92ZXJsYXlzIGFyZSBkaXNtaXNzZWQuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGxhc3RGb2N1c2VkRWxlbWVudCgpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0Rm9jdXNlZEVsZW1lbnQ7XG5cdH1cblxuXHQvKipcblx0ICogRm9jdXNlcyB0aGUgbGFzdCBmb2N1c2VkIGVsZW1lbnQgaW4gdGhlIEZpbmQgd2lkZ2V0LlxuXHQgKiBGYWxscyBiYWNrIHRvIHRoZSBGaW5kIG9yIFJlcGxhY2UgaW5wdXQgYmFzZWQgb24gbGFzdEZvY3VzZWRJbnB1dFdhc1JlcGxhY2UuXG5cdCAqL1xuXHRwdWJsaWMgZm9jdXNMYXN0RWxlbWVudCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fbGFzdEZvY3VzZWRFbGVtZW50ICYmIHRoaXMuX2RvbU5vZGUuY29udGFpbnModGhpcy5fbGFzdEZvY3VzZWRFbGVtZW50KSAmJiBkb20uZ2V0V2luZG93KHRoaXMuX2xhc3RGb2N1c2VkRWxlbWVudCkuZG9jdW1lbnQuYm9keS5jb250YWlucyh0aGlzLl9sYXN0Rm9jdXNlZEVsZW1lbnQpKSB7XG5cdFx0XHR0aGlzLl9sYXN0Rm9jdXNlZEVsZW1lbnQuZm9jdXMoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2xhc3RGb2N1c2VkSW5wdXRXYXNSZXBsYWNlKSB7XG5cdFx0XHR0aGlzLmZvY3VzUmVwbGFjZUlucHV0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZm9jdXNGaW5kSW5wdXQoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0UG9zaXRpb24oKTogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHByZWZlcmVuY2U6IE92ZXJsYXlXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuVE9QX1JJR0hUX0NPUk5FUlxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvLyAtLS0tLSBSZWFjdCB0byBzdGF0ZSBjaGFuZ2VzXG5cblx0cHJpdmF0ZSBfb25TdGF0ZUNoYW5nZWQoZTogRmluZFJlcGxhY2VTdGF0ZUNoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLnNlYXJjaFN0cmluZykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5faWdub3JlQ2hhbmdlRXZlbnQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9maW5kSW5wdXQuc2V0VmFsdWUodGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX2lnbm9yZUNoYW5nZUV2ZW50ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl91cGRhdGVCdXR0b25zKCk7XG5cdFx0fVxuXHRcdGlmIChlLnJlcGxhY2VTdHJpbmcpIHtcblx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC52YWx1ZSA9IHRoaXMuX3N0YXRlLnJlcGxhY2VTdHJpbmc7XG5cdFx0fVxuXHRcdGlmIChlLmlzUmV2ZWFsZWQpIHtcblx0XHRcdGlmICh0aGlzLl9zdGF0ZS5pc1JldmVhbGVkKSB7XG5cdFx0XHRcdHRoaXMuX3JldmVhbCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5faGlkZSh0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGUuaXNSZXBsYWNlUmV2ZWFsZWQpIHtcblx0XHRcdGlmICh0aGlzLl9zdGF0ZS5pc1JlcGxhY2VSZXZlYWxlZCkge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2NvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSkgJiYgIXRoaXMuX2lzUmVwbGFjZVZpc2libGUpIHtcblx0XHRcdFx0XHR0aGlzLl9pc1JlcGxhY2VWaXNpYmxlID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQud2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9maW5kSW5wdXQuZG9tTm9kZSk7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlQnV0dG9ucygpO1xuXHRcdFx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC5sYXlvdXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHRoaXMuX2lzUmVwbGFjZVZpc2libGUpIHtcblx0XHRcdFx0XHR0aGlzLl9pc1JlcGxhY2VWaXNpYmxlID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlQnV0dG9ucygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICgoZS5pc1JldmVhbGVkIHx8IGUuaXNSZXBsYWNlUmV2ZWFsZWQpICYmICh0aGlzLl9zdGF0ZS5pc1JldmVhbGVkIHx8IHRoaXMuX3N0YXRlLmlzUmVwbGFjZVJldmVhbGVkKSkge1xuXHRcdFx0aWYgKHRoaXMuX3RyeVVwZGF0ZUhlaWdodCgpKSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dWaWV3Wm9uZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlLmlzUmVnZXgpIHtcblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5zZXRSZWdleCh0aGlzLl9zdGF0ZS5pc1JlZ2V4KTtcblx0XHR9XG5cdFx0aWYgKGUud2hvbGVXb3JkKSB7XG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuc2V0V2hvbGVXb3Jkcyh0aGlzLl9zdGF0ZS53aG9sZVdvcmQpO1xuXHRcdH1cblx0XHRpZiAoZS5tYXRjaENhc2UpIHtcblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5zZXRDYXNlU2Vuc2l0aXZlKHRoaXMuX3N0YXRlLm1hdGNoQ2FzZSk7XG5cdFx0fVxuXHRcdGlmIChlLnByZXNlcnZlQ2FzZSkge1xuXHRcdFx0dGhpcy5fcmVwbGFjZUlucHV0LnNldFByZXNlcnZlQ2FzZSh0aGlzLl9zdGF0ZS5wcmVzZXJ2ZUNhc2UpO1xuXHRcdH1cblx0XHRpZiAoZS5zZWFyY2hTY29wZSkge1xuXHRcdFx0aWYgKHRoaXMuX3N0YXRlLnNlYXJjaFNjb3BlKSB7XG5cdFx0XHRcdHRoaXMuX3RvZ2dsZVNlbGVjdGlvbkZpbmQuY2hlY2tlZCA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl90b2dnbGVTZWxlY3Rpb25GaW5kLmNoZWNrZWQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3VwZGF0ZVRvZ2dsZVNlbGVjdGlvbkZpbmRCdXR0b24oKTtcblx0XHR9XG5cdFx0aWYgKGUuc2VhcmNoU3RyaW5nIHx8IGUubWF0Y2hlc0NvdW50IHx8IGUubWF0Y2hlc1Bvc2l0aW9uKSB7XG5cdFx0XHRjb25zdCBzaG93UmVkT3V0bGluZSA9ICh0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcubGVuZ3RoID4gMCAmJiB0aGlzLl9zdGF0ZS5tYXRjaGVzQ291bnQgPT09IDApO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCduby1yZXN1bHRzJywgc2hvd1JlZE91dGxpbmUpO1xuXG5cdFx0XHR0aGlzLl91cGRhdGVNYXRjaGVzQ291bnQoKTtcblx0XHRcdHRoaXMuX3VwZGF0ZUJ1dHRvbnMoKTtcblx0XHR9XG5cdFx0aWYgKGUuc2VhcmNoU3RyaW5nIHx8IGUuY3VycmVudE1hdGNoKSB7XG5cdFx0XHR0aGlzLl9sYXlvdXRWaWV3Wm9uZSgpO1xuXHRcdH1cblx0XHRpZiAoZS51cGRhdGVIaXN0b3J5KSB7XG5cdFx0XHR0aGlzLl9kZWxheWVkVXBkYXRlSGlzdG9yeSgpO1xuXHRcdH1cblx0XHRpZiAoZS5sb29wKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVCdXR0b25zKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGVsYXllZFVwZGF0ZUhpc3RvcnkoKSB7XG5cdFx0dGhpcy5fdXBkYXRlSGlzdG9yeURlbGF5ZXIudHJpZ2dlcih0aGlzLl91cGRhdGVIaXN0b3J5LmJpbmQodGhpcykpLnRoZW4odW5kZWZpbmVkLCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVIaXN0b3J5KCkge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcpIHtcblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5hZGRUb0hpc3RvcnkoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0YXRlLnJlcGxhY2VTdHJpbmcpIHtcblx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC5hZGRUb0hpc3RvcnkoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVNYXRjaGVzQ291bnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWF0Y2hlc0NvdW50LnN0eWxlLm1pbldpZHRoID0gTUFYX01BVENIRVNfQ09VTlRfV0lEVEggKyAncHgnO1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5tYXRjaGVzQ291bnQgPj0gTUFUQ0hFU19MSU1JVCkge1xuXHRcdFx0dGhpcy5fbWF0Y2hlc0NvdW50LnRpdGxlID0gTkxTX01BVENIRVNfQ09VTlRfTElNSVRfVElUTEU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX21hdGNoZXNDb3VudC50aXRsZSA9ICcnO1xuXHRcdH1cblxuXHRcdC8vIHJlbW92ZSBwcmV2aW91cyBjb250ZW50XG5cdFx0dGhpcy5fbWF0Y2hlc0NvdW50LmZpcnN0Q2hpbGQ/LnJlbW92ZSgpO1xuXG5cdFx0bGV0IGxhYmVsOiBzdHJpbmc7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLm1hdGNoZXNDb3VudCA+IDApIHtcblx0XHRcdGxldCBtYXRjaGVzQ291bnQ6IHN0cmluZyA9IFN0cmluZyh0aGlzLl9zdGF0ZS5tYXRjaGVzQ291bnQpO1xuXHRcdFx0aWYgKHRoaXMuX3N0YXRlLm1hdGNoZXNDb3VudCA+PSBNQVRDSEVTX0xJTUlUKSB7XG5cdFx0XHRcdG1hdGNoZXNDb3VudCArPSAnKyc7XG5cdFx0XHR9XG5cdFx0XHRsZXQgbWF0Y2hlc1Bvc2l0aW9uOiBzdHJpbmcgPSBTdHJpbmcodGhpcy5fc3RhdGUubWF0Y2hlc1Bvc2l0aW9uKTtcblx0XHRcdGlmIChtYXRjaGVzUG9zaXRpb24gPT09ICcwJykge1xuXHRcdFx0XHRtYXRjaGVzUG9zaXRpb24gPSAnPyc7XG5cdFx0XHR9XG5cdFx0XHRsYWJlbCA9IHN0cmluZ3MuZm9ybWF0KE5MU19NQVRDSEVTX0xPQ0FUSU9OLCBtYXRjaGVzUG9zaXRpb24sIG1hdGNoZXNDb3VudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxhYmVsID0gTkxTX05PX1JFU1VMVFM7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbWF0Y2hlc0NvdW50LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGxhYmVsKSk7XG5cblx0XHRhbGVydEZuKHRoaXMuX2dldEFyaWFMYWJlbChsYWJlbCwgdGhpcy5fc3RhdGUuY3VycmVudE1hdGNoLCB0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcpKTtcblx0XHRNQVhfTUFUQ0hFU19DT1VOVF9XSURUSCA9IE1hdGgubWF4KE1BWF9NQVRDSEVTX0NPVU5UX1dJRFRILCB0aGlzLl9tYXRjaGVzQ291bnQuY2xpZW50V2lkdGgpO1xuXHR9XG5cblx0Ly8gLS0tLS0gYWN0aW9uc1xuXG5cdHByaXZhdGUgX2dldEFyaWFMYWJlbChsYWJlbDogc3RyaW5nLCBjdXJyZW50TWF0Y2g6IFJhbmdlIHwgbnVsbCwgc2VhcmNoU3RyaW5nOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGxldCByZXN1bHQ6IHN0cmluZztcblx0XHRpZiAobGFiZWwgPT09IE5MU19OT19SRVNVTFRTKSB7XG5cdFx0XHRyZXN1bHQgPSBzZWFyY2hTdHJpbmcgPT09ICcnXG5cdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdhcmlhU2VhcmNoTm9SZXN1bHRFbXB0eScsIFwiezB9IGZvdW5kXCIsIGxhYmVsKVxuXHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnYXJpYVNlYXJjaE5vUmVzdWx0JywgXCJ7MH0gZm91bmQgZm9yICd7MX0nXCIsIGxhYmVsLCBzZWFyY2hTdHJpbmcpO1xuXHRcdH0gZWxzZSBpZiAoY3VycmVudE1hdGNoKSB7XG5cdFx0XHRjb25zdCBhcmlhTGFiZWwgPSBubHMubG9jYWxpemUoJ2FyaWFTZWFyY2hOb1Jlc3VsdFdpdGhMaW5lTnVtJywgXCJ7MH0gZm91bmQgZm9yICd7MX0nLCBhdCB7Mn1cIiwgbGFiZWwsIHNlYXJjaFN0cmluZywgY3VycmVudE1hdGNoLnN0YXJ0TGluZU51bWJlciArICc6JyArIGN1cnJlbnRNYXRjaC5zdGFydENvbHVtbik7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2NvZGVFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmIChtb2RlbCAmJiAoY3VycmVudE1hdGNoLnN0YXJ0TGluZU51bWJlciA8PSBtb2RlbC5nZXRMaW5lQ291bnQoKSkgJiYgKGN1cnJlbnRNYXRjaC5zdGFydExpbmVOdW1iZXIgPj0gMSkpIHtcblx0XHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChjdXJyZW50TWF0Y2guc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0cmVzdWx0ID0gYCR7bGluZUNvbnRlbnR9LCAke2FyaWFMYWJlbH1gO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0ID0gYXJpYUxhYmVsO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQgPSBubHMubG9jYWxpemUoJ2FyaWFTZWFyY2hOb1Jlc3VsdFdpdGhMaW5lTnVtTm9DdXJyZW50TWF0Y2gnLCBcInswfSBmb3VuZCBmb3IgJ3sxfSdcIiwgbGFiZWwsIHNlYXJjaFN0cmluZyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBJZiAnc2VsZWN0aW9uIGZpbmQnIGlzIE9OIHdlIHNob3VsZCBub3QgZGlzYWJsZSB0aGUgYnV0dG9uIChpdHMgZnVuY3Rpb24gaXMgdG8gY2FuY2VsICdzZWxlY3Rpb24gZmluZCcpLlxuXHQgKiBJZiAnc2VsZWN0aW9uIGZpbmQnIGlzIE9GRiB3ZSBlbmFibGUgdGhlIGJ1dHRvbiBvbmx5IGlmIHRoZXJlIGlzIGEgc2VsZWN0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfdXBkYXRlVG9nZ2xlU2VsZWN0aW9uRmluZEJ1dHRvbigpOiB2b2lkIHtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9jb2RlRWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGNvbnN0IGlzU2VsZWN0aW9uID0gc2VsZWN0aW9uID8gKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgIT09IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyIHx8IHNlbGVjdGlvbi5zdGFydENvbHVtbiAhPT0gc2VsZWN0aW9uLmVuZENvbHVtbikgOiBmYWxzZTtcblx0XHRjb25zdCBpc0NoZWNrZWQgPSB0aGlzLl90b2dnbGVTZWxlY3Rpb25GaW5kLmNoZWNrZWQ7XG5cblx0XHRpZiAodGhpcy5faXNWaXNpYmxlICYmIChpc0NoZWNrZWQgfHwgaXNTZWxlY3Rpb24pKSB7XG5cdFx0XHR0aGlzLl90b2dnbGVTZWxlY3Rpb25GaW5kLmVuYWJsZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90b2dnbGVTZWxlY3Rpb25GaW5kLmRpc2FibGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVCdXR0b25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbmRJbnB1dC5zZXRFbmFibGVkKHRoaXMuX2lzVmlzaWJsZSk7XG5cdFx0dGhpcy5fcmVwbGFjZUlucHV0LnNldEVuYWJsZWQodGhpcy5faXNWaXNpYmxlICYmIHRoaXMuX2lzUmVwbGFjZVZpc2libGUpO1xuXHRcdHRoaXMuX3VwZGF0ZVRvZ2dsZVNlbGVjdGlvbkZpbmRCdXR0b24oKTtcblx0XHR0aGlzLl9jbG9zZUJ0bi5zZXRFbmFibGVkKHRoaXMuX2lzVmlzaWJsZSk7XG5cblx0XHRjb25zdCBmaW5kSW5wdXRJc05vbkVtcHR5ID0gKHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZy5sZW5ndGggPiAwKTtcblx0XHRjb25zdCBtYXRjaGVzQ291bnQgPSB0aGlzLl9zdGF0ZS5tYXRjaGVzQ291bnQgPyB0cnVlIDogZmFsc2U7XG5cdFx0dGhpcy5fcHJldkJ0bi5zZXRFbmFibGVkKHRoaXMuX2lzVmlzaWJsZSAmJiBmaW5kSW5wdXRJc05vbkVtcHR5ICYmIG1hdGNoZXNDb3VudCAmJiB0aGlzLl9zdGF0ZS5jYW5OYXZpZ2F0ZUJhY2soKSk7XG5cdFx0dGhpcy5fbmV4dEJ0bi5zZXRFbmFibGVkKHRoaXMuX2lzVmlzaWJsZSAmJiBmaW5kSW5wdXRJc05vbkVtcHR5ICYmIG1hdGNoZXNDb3VudCAmJiB0aGlzLl9zdGF0ZS5jYW5OYXZpZ2F0ZUZvcndhcmQoKSk7XG5cdFx0dGhpcy5fcmVwbGFjZUJ0bi5zZXRFbmFibGVkKHRoaXMuX2lzVmlzaWJsZSAmJiB0aGlzLl9pc1JlcGxhY2VWaXNpYmxlICYmIGZpbmRJbnB1dElzTm9uRW1wdHkpO1xuXHRcdHRoaXMuX3JlcGxhY2VBbGxCdG4uc2V0RW5hYmxlZCh0aGlzLl9pc1Zpc2libGUgJiYgdGhpcy5faXNSZXBsYWNlVmlzaWJsZSAmJiBmaW5kSW5wdXRJc05vbkVtcHR5KTtcblxuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgncmVwbGFjZVRvZ2dsZWQnLCB0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKTtcblx0XHR0aGlzLl90b2dnbGVSZXBsYWNlQnRuLnNldEV4cGFuZGVkKHRoaXMuX2lzUmVwbGFjZVZpc2libGUpO1xuXG5cdFx0Y29uc3QgY2FuUmVwbGFjZSA9ICF0aGlzLl9jb2RlRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucmVhZE9ubHkpO1xuXHRcdHRoaXMuX3RvZ2dsZVJlcGxhY2VCdG4uc2V0RW5hYmxlZCh0aGlzLl9pc1Zpc2libGUgJiYgY2FuUmVwbGFjZSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWxUaW1lb3V0czogVGltZW91dFtdID0gW107XG5cblx0cHJpdmF0ZSBfcmV2ZWFsKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbFRpbWVvdXRzLmZvckVhY2goZSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQoZSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZXZlYWxUaW1lb3V0cyA9IFtdO1xuXG5cdFx0aWYgKCF0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuX2lzVmlzaWJsZSA9IHRydWU7XG5cblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX2NvZGVFZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cblx0XHRcdHN3aXRjaCAodGhpcy5fY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmF1dG9GaW5kSW5TZWxlY3Rpb24pIHtcblx0XHRcdFx0Y2FzZSAnYWx3YXlzJzpcblx0XHRcdFx0XHR0aGlzLl90b2dnbGVTZWxlY3Rpb25GaW5kLmNoZWNrZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICduZXZlcic6XG5cdFx0XHRcdFx0dGhpcy5fdG9nZ2xlU2VsZWN0aW9uRmluZC5jaGVja2VkID0gZmFsc2U7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ211bHRpbGluZSc6IHtcblx0XHRcdFx0XHRjb25zdCBpc1NlbGVjdGlvbk11bHRpcGxlTGluZSA9ICEhc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgIT09IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdHRoaXMuX3RvZ2dsZVNlbGVjdGlvbkZpbmQuY2hlY2tlZCA9IGlzU2VsZWN0aW9uTXVsdGlwbGVMaW5lO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3RyeVVwZGF0ZVdpZGdldFdpZHRoKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVCdXR0b25zKCk7XG5cblx0XHRcdHRoaXMuX3JldmVhbFRpbWVvdXRzLnB1c2goc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScpO1xuXHRcdFx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAnZmFsc2UnKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlRmluZElucHV0QXJpYUxhYmVsKCk7XG5cdFx0XHR9LCAwKSk7XG5cblx0XHRcdC8vIHZhbGlkYXRlIHF1ZXJ5IGFnYWluIGFzIGl0J3MgYmVpbmcgZGlzbWlzc2VkIHdoZW4gd2UgaGlkZSB0aGUgZmluZCB3aWRnZXQuXG5cdFx0XHR0aGlzLl9yZXZlYWxUaW1lb3V0cy5wdXNoKHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9maW5kSW5wdXQudmFsaWRhdGUoKTtcblx0XHRcdH0sIDIwMCkpO1xuXG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yLmxheW91dE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cblx0XHRcdGxldCBhZGp1c3RFZGl0b3JTY3JvbGxUb3AgPSB0cnVlO1xuXHRcdFx0aWYgKHRoaXMuX2NvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiAmJiBzZWxlY3Rpb24pIHtcblx0XHRcdFx0Y29uc3QgZG9tTm9kZSA9IHRoaXMuX2NvZGVFZGl0b3IuZ2V0RG9tTm9kZSgpO1xuXHRcdFx0XHRpZiAoZG9tTm9kZSkge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvckNvb3JkcyA9IGRvbS5nZXREb21Ob2RlUGFnZVBvc2l0aW9uKGRvbU5vZGUpO1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0Q29vcmRzID0gdGhpcy5fY29kZUVkaXRvci5nZXRTY3JvbGxlZFZpc2libGVQb3NpdGlvbihzZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdFx0XHRjb25zdCBzdGFydExlZnQgPSBlZGl0b3JDb29yZHMubGVmdCArIChzdGFydENvb3JkcyA/IHN0YXJ0Q29vcmRzLmxlZnQgOiAwKTtcblx0XHRcdFx0XHRjb25zdCBzdGFydFRvcCA9IHN0YXJ0Q29vcmRzID8gc3RhcnRDb29yZHMudG9wIDogMDtcblxuXHRcdFx0XHRcdGlmICh0aGlzLl92aWV3Wm9uZSAmJiBzdGFydFRvcCA8IHRoaXMuX3ZpZXdab25lLmhlaWdodEluUHgpIHtcblx0XHRcdFx0XHRcdGlmIChzZWxlY3Rpb24uZW5kTGluZU51bWJlciA+IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdFx0YWRqdXN0RWRpdG9yU2Nyb2xsVG9wID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IGxlZnRPZkZpbmRXaWRnZXQgPSBkb20uZ2V0VG9wTGVmdE9mZnNldCh0aGlzLl9kb21Ob2RlKS5sZWZ0O1xuXHRcdFx0XHRcdFx0aWYgKHN0YXJ0TGVmdCA+IGxlZnRPZkZpbmRXaWRnZXQpIHtcblx0XHRcdFx0XHRcdFx0YWRqdXN0RWRpdG9yU2Nyb2xsVG9wID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBlbmRDb29yZHMgPSB0aGlzLl9jb2RlRWRpdG9yLmdldFNjcm9sbGVkVmlzaWJsZVBvc2l0aW9uKHNlbGVjdGlvbi5nZXRFbmRQb3NpdGlvbigpKTtcblx0XHRcdFx0XHRcdGNvbnN0IGVuZExlZnQgPSBlZGl0b3JDb29yZHMubGVmdCArIChlbmRDb29yZHMgPyBlbmRDb29yZHMubGVmdCA6IDApO1xuXHRcdFx0XHRcdFx0aWYgKGVuZExlZnQgPiBsZWZ0T2ZGaW5kV2lkZ2V0KSB7XG5cdFx0XHRcdFx0XHRcdGFkanVzdEVkaXRvclNjcm9sbFRvcCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2hvd1ZpZXdab25lKGFkanVzdEVkaXRvclNjcm9sbFRvcCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZShmb2N1c1RoZUVkaXRvcjogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbFRpbWVvdXRzLmZvckVhY2goZSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQoZSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZXZlYWxUaW1lb3V0cyA9IFtdO1xuXG5cdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5faXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5SGVscEhpbnRBbm5vdW5jZWQgPSBmYWxzZTtcblxuXHRcdFx0dGhpcy5fdXBkYXRlQnV0dG9ucygpO1xuXG5cdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKTtcblx0XHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuY2xlYXJNZXNzYWdlKCk7XG5cdFx0XHRpZiAoZm9jdXNUaGVFZGl0b3IpIHtcblx0XHRcdFx0dGhpcy5fY29kZUVkaXRvci5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29kZUVkaXRvci5sYXlvdXRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdFx0dGhpcy5fcmVtb3ZlVmlld1pvbmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sYXlvdXRWaWV3Wm9uZSh0YXJnZXRTY3JvbGxUb3A/OiBudW1iZXIpIHtcblx0XHRjb25zdCBhZGRFeHRyYVNwYWNlT25Ub3AgPSB0aGlzLl9jb2RlRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuYWRkRXh0cmFTcGFjZU9uVG9wO1xuXG5cdFx0aWYgKCFhZGRFeHRyYVNwYWNlT25Ub3ApIHtcblx0XHRcdHRoaXMuX3JlbW92ZVZpZXdab25lKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgdmlld1pvbmUgPSB0aGlzLl92aWV3Wm9uZTtcblx0XHRpZiAodGhpcy5fdmlld1pvbmVJZCAhPT0gdW5kZWZpbmVkIHx8ICF2aWV3Wm9uZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvZGVFZGl0b3IuY2hhbmdlVmlld1pvbmVzKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0dmlld1pvbmUuaGVpZ2h0SW5QeCA9IHRoaXMuX2dldEhlaWdodCgpO1xuXHRcdFx0dGhpcy5fdmlld1pvbmVJZCA9IGFjY2Vzc29yLmFkZFpvbmUodmlld1pvbmUpO1xuXHRcdFx0Ly8gc2Nyb2xsIHRvcCBhZGp1c3QgdG8gbWFrZSBzdXJlIHRoZSBlZGl0b3IgZG9lc24ndCBzY3JvbGwgd2hlbiBhZGRpbmcgdmlld3pvbmUgYXQgdGhlIGJlZ2lubmluZy5cblx0XHRcdHRoaXMuX2NvZGVFZGl0b3Iuc2V0U2Nyb2xsVG9wKHRhcmdldFNjcm9sbFRvcCB8fCB0aGlzLl9jb2RlRWRpdG9yLmdldFNjcm9sbFRvcCgpICsgdmlld1pvbmUuaGVpZ2h0SW5QeCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93Vmlld1pvbmUoYWRqdXN0U2Nyb2xsOiBib29sZWFuID0gdHJ1ZSkge1xuXHRcdGlmICghdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWRkRXh0cmFTcGFjZU9uVG9wID0gdGhpcy5fY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmFkZEV4dHJhU3BhY2VPblRvcDtcblxuXHRcdGlmICghYWRkRXh0cmFTcGFjZU9uVG9wKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3ZpZXdab25lID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3ZpZXdab25lID0gbmV3IEZpbmRXaWRnZXRWaWV3Wm9uZSgwKTtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3Wm9uZSA9IHRoaXMuX3ZpZXdab25lO1xuXG5cdFx0dGhpcy5fY29kZUVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdmlld1pvbmVJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdC8vIHRoZSB2aWV3IHpvbmUgYWxyZWFkeSBleGlzdHMsIHdlIG5lZWQgdG8gdXBkYXRlIHRoZSBoZWlnaHRcblx0XHRcdFx0Y29uc3QgbmV3SGVpZ2h0ID0gdGhpcy5fZ2V0SGVpZ2h0KCk7XG5cdFx0XHRcdGlmIChuZXdIZWlnaHQgPT09IHZpZXdab25lLmhlaWdodEluUHgpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzY3JvbGxBZGp1c3RtZW50ID0gbmV3SGVpZ2h0IC0gdmlld1pvbmUuaGVpZ2h0SW5QeDtcblx0XHRcdFx0dmlld1pvbmUuaGVpZ2h0SW5QeCA9IG5ld0hlaWdodDtcblx0XHRcdFx0YWNjZXNzb3IubGF5b3V0Wm9uZSh0aGlzLl92aWV3Wm9uZUlkKTtcblxuXHRcdFx0XHRpZiAoYWRqdXN0U2Nyb2xsKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29kZUVkaXRvci5zZXRTY3JvbGxUb3AodGhpcy5fY29kZUVkaXRvci5nZXRTY3JvbGxUb3AoKSArIHNjcm9sbEFkanVzdG1lbnQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IHNjcm9sbEFkanVzdG1lbnQgPSB0aGlzLl9nZXRIZWlnaHQoKTtcblxuXHRcdFx0XHQvLyBpZiB0aGUgZWRpdG9yIGhhcyB0b3AgcGFkZGluZywgZmFjdG9yIHRoYXQgaW50byB0aGUgem9uZSBoZWlnaHRcblx0XHRcdFx0c2Nyb2xsQWRqdXN0bWVudCAtPSB0aGlzLl9jb2RlRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucGFkZGluZykudG9wO1xuXHRcdFx0XHRpZiAoc2Nyb2xsQWRqdXN0bWVudCA8PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dmlld1pvbmUuaGVpZ2h0SW5QeCA9IHNjcm9sbEFkanVzdG1lbnQ7XG5cdFx0XHRcdHRoaXMuX3ZpZXdab25lSWQgPSBhY2Nlc3Nvci5hZGRab25lKHZpZXdab25lKTtcblxuXHRcdFx0XHRpZiAoYWRqdXN0U2Nyb2xsKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29kZUVkaXRvci5zZXRTY3JvbGxUb3AodGhpcy5fY29kZUVkaXRvci5nZXRTY3JvbGxUb3AoKSArIHNjcm9sbEFkanVzdG1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVWaWV3Wm9uZSgpIHtcblx0XHR0aGlzLl9jb2RlRWRpdG9yLmNoYW5nZVZpZXdab25lcygoYWNjZXNzb3IpID0+IHtcblx0XHRcdGlmICh0aGlzLl92aWV3Wm9uZUlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlWm9uZSh0aGlzLl92aWV3Wm9uZUlkKTtcblx0XHRcdFx0dGhpcy5fdmlld1pvbmVJZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHRoaXMuX3ZpZXdab25lKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29kZUVkaXRvci5zZXRTY3JvbGxUb3AodGhpcy5fY29kZUVkaXRvci5nZXRTY3JvbGxUb3AoKSAtIHRoaXMuX3ZpZXdab25lLmhlaWdodEluUHgpO1xuXHRcdFx0XHRcdHRoaXMuX3ZpZXdab25lID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF90cnlVcGRhdGVXaWRnZXRXaWR0aCgpIHtcblx0XHRpZiAoIXRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2RvbU5vZGUuaXNDb25uZWN0ZWQpIHtcblx0XHRcdC8vIHRoZSB3aWRnZXQgaXMgbm90IGluIHRoZSBET01cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5fY29kZUVkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0Y29uc3QgZWRpdG9yQ29udGVudFdpZHRoID0gbGF5b3V0SW5mby5jb250ZW50V2lkdGg7XG5cblx0XHRpZiAoZWRpdG9yQ29udGVudFdpZHRoIDw9IDApIHtcblx0XHRcdC8vIGZvciBleGFtcGxlLCBkaWZmIHZpZXcgb3JpZ2luYWwgZWRpdG9yXG5cdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbkVkaXRvcicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2hpZGRlbkVkaXRvcicpKSB7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbkVkaXRvcicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvcldpZHRoID0gbGF5b3V0SW5mby53aWR0aDtcblx0XHRjb25zdCBtaW5pbWFwV2lkdGggPSBsYXlvdXRJbmZvLm1pbmltYXAubWluaW1hcFdpZHRoO1xuXHRcdGxldCBjb2xsYXBzZWRGaW5kV2lkZ2V0ID0gZmFsc2U7XG5cdFx0bGV0IHJlZHVjZWRGaW5kV2lkZ2V0ID0gZmFsc2U7XG5cdFx0bGV0IG5hcnJvd0ZpbmRXaWRnZXQgPSBmYWxzZTtcblxuXHRcdGlmICh0aGlzLl9yZXNpemVkKSB7XG5cdFx0XHRjb25zdCB3aWRnZXRXaWR0aCA9IGRvbS5nZXRUb3RhbFdpZHRoKHRoaXMuX2RvbU5vZGUpO1xuXG5cdFx0XHRpZiAod2lkZ2V0V2lkdGggPiBGSU5EX1dJREdFVF9JTklUSUFMX1dJRFRIKSB7XG5cdFx0XHRcdC8vIGFzIHRoZSB3aWRnZXQgaXMgcmVzaXplZCBieSB1c2Vycywgd2UgbWF5IG5lZWQgdG8gY2hhbmdlIHRoZSBtYXggd2lkdGggb2YgdGhlIHdpZGdldCBhcyB0aGUgZWRpdG9yIHdpZHRoIGNoYW5nZXMuXG5cdFx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUubWF4V2lkdGggPSBgJHtlZGl0b3JXaWR0aCAtIDI4IC0gbWluaW1hcFdpZHRoIC0gMTV9cHhgO1xuXHRcdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQud2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9maW5kSW5wdXQuZG9tTm9kZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoRklORF9XSURHRVRfSU5JVElBTF9XSURUSCArIDI4ICsgbWluaW1hcFdpZHRoID49IGVkaXRvcldpZHRoKSB7XG5cdFx0XHRyZWR1Y2VkRmluZFdpZGdldCA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChGSU5EX1dJREdFVF9JTklUSUFMX1dJRFRIICsgMjggKyBtaW5pbWFwV2lkdGggLSBNQVhfTUFUQ0hFU19DT1VOVF9XSURUSCA+PSBlZGl0b3JXaWR0aCkge1xuXHRcdFx0bmFycm93RmluZFdpZGdldCA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChGSU5EX1dJREdFVF9JTklUSUFMX1dJRFRIICsgMjggKyBtaW5pbWFwV2lkdGggLSBNQVhfTUFUQ0hFU19DT1VOVF9XSURUSCA+PSBlZGl0b3JXaWR0aCArIDUwKSB7XG5cdFx0XHRjb2xsYXBzZWRGaW5kV2lkZ2V0ID0gdHJ1ZTtcblx0XHR9XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjb2xsYXBzZWQtZmluZC13aWRnZXQnLCBjb2xsYXBzZWRGaW5kV2lkZ2V0KTtcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ25hcnJvdy1maW5kLXdpZGdldCcsIG5hcnJvd0ZpbmRXaWRnZXQpO1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgncmVkdWNlZC1maW5kLXdpZGdldCcsIHJlZHVjZWRGaW5kV2lkZ2V0KTtcblxuXHRcdGlmICghbmFycm93RmluZFdpZGdldCAmJiAhY29sbGFwc2VkRmluZFdpZGdldCkge1xuXHRcdFx0Ly8gdGhlIG1pbmltYWwgbGVmdCBvZmZzZXQgb2YgZmluZHdpZGdldCBpcyAxNXB4LlxuXHRcdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5tYXhXaWR0aCA9IGAke2VkaXRvcldpZHRoIC0gMjggLSBtaW5pbWFwV2lkdGggLSAxNX1weGA7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZmluZElucHV0LmxheW91dCh7IGNvbGxhcHNlZEZpbmRXaWRnZXQsIG5hcnJvd0ZpbmRXaWRnZXQsIHJlZHVjZWRGaW5kV2lkZ2V0IH0pO1xuXHRcdGlmICh0aGlzLl9yZXNpemVkKSB7XG5cdFx0XHRjb25zdCBmaW5kSW5wdXRXaWR0aCA9IHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5lbGVtZW50LmNsaWVudFdpZHRoO1xuXHRcdFx0aWYgKGZpbmRJbnB1dFdpZHRoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQud2lkdGggPSBmaW5kSW5wdXRXaWR0aDtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHRoaXMuX2lzUmVwbGFjZVZpc2libGUpIHtcblx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC53aWR0aCA9IGRvbS5nZXRUb3RhbFdpZHRoKHRoaXMuX2ZpbmRJbnB1dC5kb21Ob2RlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRsZXQgdG90YWxoZWlnaHQgPSAwO1xuXG5cdFx0Ly8gZmluZCBpbnB1dCBtYXJnaW4gdG9wXG5cdFx0dG90YWxoZWlnaHQgKz0gNDtcblxuXHRcdC8vIGZpbmQgaW5wdXQgaGVpZ2h0XG5cdFx0dG90YWxoZWlnaHQgKz0gdGhpcy5fZmluZElucHV0LmlucHV0Qm94LmhlaWdodCArIDIgLyoqIGlucHV0IGJveCBib3JkZXIgKi87XG5cblx0XHRpZiAodGhpcy5faXNSZXBsYWNlVmlzaWJsZSkge1xuXHRcdFx0Ly8gcmVwbGFjZSBpbnB1dCBtYXJnaW5cblx0XHRcdHRvdGFsaGVpZ2h0ICs9IDQ7XG5cblx0XHRcdHRvdGFsaGVpZ2h0ICs9IHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC5oZWlnaHQgKyAyIC8qKiBpbnB1dCBib3ggYm9yZGVyICovO1xuXHRcdH1cblxuXHRcdC8vIG1hcmdpbiBib3R0b21cblx0XHR0b3RhbGhlaWdodCArPSA0O1xuXHRcdHJldHVybiB0b3RhbGhlaWdodDtcblx0fVxuXG5cdHByaXZhdGUgX3RyeVVwZGF0ZUhlaWdodCgpOiBib29sZWFuIHtcblx0XHRjb25zdCB0b3RhbEhlaWdodCA9IHRoaXMuX2dldEhlaWdodCgpO1xuXHRcdGlmICh0aGlzLl9jYWNoZWRIZWlnaHQgIT09IG51bGwgJiYgdGhpcy5fY2FjaGVkSGVpZ2h0ID09PSB0b3RhbEhlaWdodCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NhY2hlZEhlaWdodCA9IHRvdGFsSGVpZ2h0O1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuaGVpZ2h0ID0gYCR7dG90YWxIZWlnaHR9cHhgO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyAtLS0tLSBQdWJsaWNcblxuXHRwdWJsaWMgZm9jdXNGaW5kSW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZmluZElucHV0LnNlbGVjdCgpO1xuXHRcdC8vIEVkZ2UgYnJvd3NlciByZXF1aXJlcyBmb2N1cygpIGluIGFkZGl0aW9uIHRvIHNlbGVjdCgpXG5cdFx0dGhpcy5fZmluZElucHV0LmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgZm9jdXNSZXBsYWNlSW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVwbGFjZUlucHV0LnNlbGVjdCgpO1xuXHRcdC8vIEVkZ2UgYnJvd3NlciByZXF1aXJlcyBmb2N1cygpIGluIGFkZGl0aW9uIHRvIHNlbGVjdCgpXG5cdFx0dGhpcy5fcmVwbGFjZUlucHV0LmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgaGlnaGxpZ2h0RmluZE9wdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fZmluZElucHV0LmhpZ2hsaWdodEZpbmRPcHRpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTZWFyY2hTY29wZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvZGVFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl90b2dnbGVTZWxlY3Rpb25GaW5kLmNoZWNrZWQpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLl9jb2RlRWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblxuXHRcdFx0c2VsZWN0aW9ucy5tYXAoc2VsZWN0aW9uID0+IHtcblx0XHRcdFx0aWYgKHNlbGVjdGlvbi5lbmRDb2x1bW4gPT09IDEgJiYgc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgPiBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0c2VsZWN0aW9uID0gc2VsZWN0aW9uLnNldEVuZFBvc2l0aW9uKFxuXHRcdFx0XHRcdFx0c2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgLSAxLFxuXHRcdFx0XHRcdFx0dGhpcy5fY29kZUVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lTWF4Q29sdW1uKHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyIC0gMSlcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRNYXRjaCA9IHRoaXMuX3N0YXRlLmN1cnJlbnRNYXRjaDtcblx0XHRcdFx0aWYgKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgIT09IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0aWYgKCFSYW5nZS5lcXVhbHNSYW5nZShzZWxlY3Rpb24sIGN1cnJlbnRNYXRjaCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBzZWxlY3Rpb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fSkuZmlsdGVyKGVsZW1lbnQgPT4gISFlbGVtZW50KTtcblxuXHRcdFx0aWYgKHNlbGVjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHNlYXJjaFNjb3BlOiBzZWxlY3Rpb25zIGFzIFJhbmdlW10gfSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25GaW5kSW5wdXRNb3VzZURvd24oZTogSU1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHQvLyBvbiBsaW51eCwgbWlkZGxlIGtleSBkb2VzIHBhc3RpbmcuXG5cdFx0aWYgKGUubWlkZGxlQnV0dG9uKSB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uRmluZElucHV0S2V5RG93bihlOiBJS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmVxdWFscyhjdHJsS2V5TW9kIHwgS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdGlmICh0aGlzLl9rZXliaW5kaW5nU2VydmljZS5kaXNwYXRjaEV2ZW50KGUsIGUudGFyZ2V0KSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5pbnNlcnRBdEN1cnNvcignXFxuJyk7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLlRhYikpIHtcblx0XHRcdGlmICh0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5mb2N1cygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZmluZElucHV0LmZvY3VzT25DYXNlU2Vuc2l0aXZlKCk7XG5cdFx0XHR9XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGUuZXF1YWxzKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3cpKSB7XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuVXBBcnJvdykpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0cmV0dXJuIHN0b3BQcm9wYWdhdGlvbkZvck11bHRpTGluZVVwd2FyZHMoZSwgdGhpcy5fZmluZElucHV0LmdldFZhbHVlKCksIHRoaXMuX2ZpbmRJbnB1dC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhJykpO1xuXHRcdH1cblxuXHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkRvd25BcnJvdykpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0cmV0dXJuIHN0b3BQcm9wYWdhdGlvbkZvck11bHRpTGluZURvd253YXJkcyhlLCB0aGlzLl9maW5kSW5wdXQuZ2V0VmFsdWUoKSwgdGhpcy5fZmluZElucHV0LmRvbU5vZGUucXVlcnlTZWxlY3RvcigndGV4dGFyZWEnKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25SZXBsYWNlSW5wdXRLZXlEb3duKGU6IElLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGUuZXF1YWxzKGN0cmxLZXlNb2QgfCBLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0aWYgKHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmRpc3BhdGNoRXZlbnQoZSwgZS50YXJnZXQpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fcmVwbGFjZUlucHV0LmlucHV0Qm94Lmluc2VydEF0Q3Vyc29yKCdcXG4nKTtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHR9XG5cblx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5UYWIpKSB7XG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuZm9jdXNPbkNhc2VTZW5zaXRpdmUoKTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZS5lcXVhbHMoS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWIpKSB7XG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuZm9jdXMoKTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZS5lcXVhbHMoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdykpIHtcblx0XHRcdHRoaXMuX2NvZGVFZGl0b3IuZm9jdXMoKTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5VcEFycm93KSkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRyZXR1cm4gc3RvcFByb3BhZ2F0aW9uRm9yTXVsdGlMaW5lVXB3YXJkcyhlLCB0aGlzLl9yZXBsYWNlSW5wdXQuaW5wdXRCb3gudmFsdWUsIHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhJykpO1xuXHRcdH1cblxuXHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkRvd25BcnJvdykpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0cmV0dXJuIHN0b3BQcm9wYWdhdGlvbkZvck11bHRpTGluZURvd253YXJkcyhlLCB0aGlzLl9yZXBsYWNlSW5wdXQuaW5wdXRCb3gudmFsdWUsIHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhJykpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0tIHNhc2hcblx0cHVibGljIGdldFZlcnRpY2FsU2FzaExlZnQoX3Nhc2g6IFNhc2gpOiBudW1iZXIge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cdC8vIC0tLS0tIGluaXRpYWxpemF0aW9uXG5cblx0cHJpdmF0ZSBfa2V5YmluZGluZ0xhYmVsRm9yKGFjdGlvbklkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKCcnLCBhY3Rpb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZERvbU5vZGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgZmxleGlibGVIZWlnaHQgPSB0cnVlO1xuXHRcdGNvbnN0IGZsZXhpYmxlV2lkdGggPSB0cnVlO1xuXHRcdC8vIEZpbmQgaW5wdXRcblx0XHRjb25zdCBmaW5kU2VhcmNoSGlzdG9yeUNvbmZpZyA9IHRoaXMuX2NvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5oaXN0b3J5O1xuXHRcdGNvbnN0IHJlcGxhY2VIaXN0b3J5Q29uZmlnID0gdGhpcy5fY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLnJlcGxhY2VIaXN0b3J5O1xuXHRcdHRoaXMuX2ZpbmRJbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb250ZXh0U2NvcGVkRmluZElucHV0KG51bGwsIHRoaXMuX2NvbnRleHRWaWV3UHJvdmlkZXIsIHtcblx0XHRcdHdpZHRoOiBGSU5EX0lOUFVUX0FSRUFfV0lEVEgsXG5cdFx0XHRsYWJlbDogTkxTX0ZJTkRfSU5QVVRfTEFCRUwsXG5cdFx0XHRwbGFjZWhvbGRlcjogTkxTX0ZJTkRfSU5QVVRfUExBQ0VIT0xERVIsXG5cdFx0XHRhcHBlbmRDYXNlU2Vuc2l0aXZlTGFiZWw6IHRoaXMuX2tleWJpbmRpbmdMYWJlbEZvcihGSU5EX0lEUy5Ub2dnbGVDYXNlU2Vuc2l0aXZlQ29tbWFuZCksXG5cdFx0XHRhcHBlbmRXaG9sZVdvcmRzTGFiZWw6IHRoaXMuX2tleWJpbmRpbmdMYWJlbEZvcihGSU5EX0lEUy5Ub2dnbGVXaG9sZVdvcmRDb21tYW5kKSxcblx0XHRcdGFwcGVuZFJlZ2V4TGFiZWw6IHRoaXMuX2tleWJpbmRpbmdMYWJlbEZvcihGSU5EX0lEUy5Ub2dnbGVSZWdleENvbW1hbmQpLFxuXHRcdFx0dmFsaWRhdGlvbjogKHZhbHVlOiBzdHJpbmcpOiBJbnB1dEJveE1lc3NhZ2UgfCBudWxsID0+IHtcblx0XHRcdFx0aWYgKHZhbHVlLmxlbmd0aCA9PT0gMCB8fCAhdGhpcy5fZmluZElucHV0LmdldFJlZ2V4KCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIHVzZSBgZ2AgYW5kIGB1YCB3aGljaCBhcmUgYWxzbyB1c2VkIGJ5IHRoZSBUZXh0TW9kZWwgc2VhcmNoXG5cdFx0XHRcdFx0bmV3IFJlZ0V4cCh2YWx1ZSwgJ2d1Jyk7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBlLm1lc3NhZ2UgfTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGZsZXhpYmxlSGVpZ2h0LFxuXHRcdFx0ZmxleGlibGVXaWR0aCxcblx0XHRcdGZsZXhpYmxlTWF4SGVpZ2h0OiAxMTgsXG5cdFx0XHRzaG93Q29tbW9uRmluZFRvZ2dsZXM6IHRydWUsXG5cdFx0XHRzaG93SGlzdG9yeUhpbnQ6ICgpID0+IHNob3dIaXN0b3J5S2V5YmluZGluZ0hpbnQodGhpcy5fa2V5YmluZGluZ1NlcnZpY2UpLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHRcdHRvZ2dsZVN0eWxlczogZGVmYXVsdFRvZ2dsZVN0eWxlcyxcblx0XHRcdGhpc3Rvcnk6IGZpbmRTZWFyY2hIaXN0b3J5Q29uZmlnID09PSAnd29ya3NwYWNlJyA/IHRoaXMuX2ZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5IDogbmV3IFNldChbXSksXG5cdFx0fSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHR0aGlzLl9maW5kSW5wdXQuc2V0UmVnZXgoISF0aGlzLl9zdGF0ZS5pc1JlZ2V4KTtcblx0XHR0aGlzLl9maW5kSW5wdXQuc2V0Q2FzZVNlbnNpdGl2ZSghIXRoaXMuX3N0YXRlLm1hdGNoQ2FzZSk7XG5cdFx0dGhpcy5fZmluZElucHV0LnNldFdob2xlV29yZHMoISF0aGlzLl9zdGF0ZS53aG9sZVdvcmQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbmRJbnB1dC5vbktleURvd24oKGUpID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVudGVyKSAmJiAhdGhpcy5fY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmZpbmRPblR5cGUpIHtcblx0XHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiB0aGlzLl9maW5kSW5wdXQuZ2V0VmFsdWUoKSB9LCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRmluZElucHV0S2V5RG93bihlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmluZElucHV0LmlucHV0Qm94Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pZ25vcmVDaGFuZ2VFdmVudCB8fCAhdGhpcy5fY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmZpbmRPblR5cGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiB0aGlzLl9maW5kSW5wdXQuZ2V0VmFsdWUoKSB9LCB0cnVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmluZElucHV0Lm9uRGlkT3B0aW9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7XG5cdFx0XHRcdGlzUmVnZXg6IHRoaXMuX2ZpbmRJbnB1dC5nZXRSZWdleCgpLFxuXHRcdFx0XHR3aG9sZVdvcmQ6IHRoaXMuX2ZpbmRJbnB1dC5nZXRXaG9sZVdvcmRzKCksXG5cdFx0XHRcdG1hdGNoQ2FzZTogdGhpcy5fZmluZElucHV0LmdldENhc2VTZW5zaXRpdmUoKVxuXHRcdFx0fSwgdHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbmRJbnB1dC5vbkNhc2VTZW5zaXRpdmVLZXlEb3duKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5lcXVhbHMoS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWIpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVwbGFjZUlucHV0LmZvY3VzKCk7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbmRJbnB1dC5vblJlZ2V4S2V5RG93bigoZSkgPT4ge1xuXHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuVGFiKSkge1xuXHRcdFx0XHRpZiAodGhpcy5faXNSZXBsYWNlVmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5mb2N1c09uUHJlc2VydmUoKTtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmluZElucHV0LmlucHV0Qm94Lm9uRGlkSGVpZ2h0Q2hhbmdlKChlKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdHJ5VXBkYXRlSGVpZ2h0KCkpIHtcblx0XHRcdFx0dGhpcy5fc2hvd1ZpZXdab25lKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGlmIChwbGF0Zm9ybS5pc0xpbnV4KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maW5kSW5wdXQub25Nb3VzZURvd24oKGUpID0+IHRoaXMuX29uRmluZElucHV0TW91c2VEb3duKGUpKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbWF0Y2hlc0NvdW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fbWF0Y2hlc0NvdW50LmNsYXNzTmFtZSA9ICdtYXRjaGVzQ291bnQnO1xuXHRcdHRoaXMuX3VwZGF0ZU1hdGNoZXNDb3VudCgpO1xuXG5cdFx0Y29uc3QgaG92ZXJMaWZlY3ljbGVPcHRpb25zOiBJSG92ZXJMaWZlY3ljbGVPcHRpb25zID0geyBncm91cElkOiAnZmluZC13aWRnZXQnIH07XG5cblx0XHQvLyBQcmV2aW91cyBidXR0b25cblx0XHR0aGlzLl9wcmV2QnRuID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNpbXBsZUJ1dHRvbih7XG5cdFx0XHRsYWJlbDogTkxTX1BSRVZJT1VTX01BVENIX0JUTl9MQUJFTCArIHRoaXMuX2tleWJpbmRpbmdMYWJlbEZvcihGSU5EX0lEUy5QcmV2aW91c01hdGNoRmluZEFjdGlvbiksXG5cdFx0XHRpY29uOiBmaW5kUHJldmlvdXNNYXRjaEljb24sXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdFx0XHRvblRyaWdnZXI6ICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5fY29kZUVkaXRvci5nZXRBY3Rpb24oRklORF9JRFMuUHJldmlvdXNNYXRjaEZpbmRBY3Rpb24pKS5ydW4oKS50aGVuKHVuZGVmaW5lZCwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0sIHRoaXMuX2hvdmVyU2VydmljZSkpO1xuXG5cdFx0Ly8gTmV4dCBidXR0b25cblx0XHR0aGlzLl9uZXh0QnRuID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNpbXBsZUJ1dHRvbih7XG5cdFx0XHRsYWJlbDogTkxTX05FWFRfTUFUQ0hfQlROX0xBQkVMICsgdGhpcy5fa2V5YmluZGluZ0xhYmVsRm9yKEZJTkRfSURTLk5leHRNYXRjaEZpbmRBY3Rpb24pLFxuXHRcdFx0aWNvbjogZmluZE5leHRNYXRjaEljb24sXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdFx0XHRvblRyaWdnZXI6ICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5fY29kZUVkaXRvci5nZXRBY3Rpb24oRklORF9JRFMuTmV4dE1hdGNoRmluZEFjdGlvbikpLnJ1bigpLnRoZW4odW5kZWZpbmVkLCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHR9XG5cdFx0fSwgdGhpcy5faG92ZXJTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBmaW5kUGFydCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGZpbmRQYXJ0LmNsYXNzTmFtZSA9ICdmaW5kLXBhcnQnO1xuXHRcdGZpbmRQYXJ0LmFwcGVuZENoaWxkKHRoaXMuX2ZpbmRJbnB1dC5kb21Ob2RlKTtcblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0YWN0aW9uc0NvbnRhaW5lci5jbGFzc05hbWUgPSAnZmluZC1hY3Rpb25zJztcblx0XHRmaW5kUGFydC5hcHBlbmRDaGlsZChhY3Rpb25zQ29udGFpbmVyKTtcblx0XHRhY3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX21hdGNoZXNDb3VudCk7XG5cdFx0YWN0aW9uc0NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9wcmV2QnRuLmRvbU5vZGUpO1xuXHRcdGFjdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fbmV4dEJ0bi5kb21Ob2RlKTtcblxuXHRcdC8vIFRvZ2dsZSBzZWxlY3Rpb24gYnV0dG9uXG5cdFx0dGhpcy5fdG9nZ2xlU2VsZWN0aW9uRmluZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUb2dnbGUoe1xuXHRcdFx0aWNvbjogZmluZFNlbGVjdGlvbkljb24sXG5cdFx0XHR0aXRsZTogTkxTX1RPR0dMRV9TRUxFQ1RJT05fRklORF9USVRMRSArIHRoaXMuX2tleWJpbmRpbmdMYWJlbEZvcihGSU5EX0lEUy5Ub2dnbGVTZWFyY2hTY29wZUNvbW1hbmQpLFxuXHRcdFx0aXNDaGVja2VkOiBmYWxzZSxcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHRcdGlucHV0QWN0aXZlT3B0aW9uQmFja2dyb3VuZDogYXNDc3NWYXJpYWJsZShpbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQpLFxuXHRcdFx0aW5wdXRBY3RpdmVPcHRpb25Cb3JkZXI6IGFzQ3NzVmFyaWFibGUoaW5wdXRBY3RpdmVPcHRpb25Cb3JkZXIpLFxuXHRcdFx0aW5wdXRBY3RpdmVPcHRpb25Gb3JlZ3JvdW5kOiBhc0Nzc1ZhcmlhYmxlKGlucHV0QWN0aXZlT3B0aW9uRm9yZWdyb3VuZCksXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdG9nZ2xlU2VsZWN0aW9uRmluZC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdG9nZ2xlU2VsZWN0aW9uRmluZC5jaGVja2VkKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9jb2RlRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0XHRsZXQgc2VsZWN0aW9ucyA9IHRoaXMuX2NvZGVFZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0XHRcdHNlbGVjdGlvbnMgPSBzZWxlY3Rpb25zLm1hcChzZWxlY3Rpb24gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHNlbGVjdGlvbi5lbmRDb2x1bW4gPT09IDEgJiYgc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgPiBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRcdHNlbGVjdGlvbiA9IHNlbGVjdGlvbi5zZXRFbmRQb3NpdGlvbihzZWxlY3Rpb24uZW5kTGluZU51bWJlciAtIDEsIHRoaXMuX2NvZGVFZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZU1heENvbHVtbihzZWxlY3Rpb24uZW5kTGluZU51bWJlciAtIDEpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICghc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gc2VsZWN0aW9uO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fSkuZmlsdGVyKChlbGVtZW50KTogZWxlbWVudCBpcyBTZWxlY3Rpb24gPT4gISFlbGVtZW50KTtcblxuXHRcdFx0XHRcdGlmIChzZWxlY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgc2VhcmNoU2NvcGU6IHNlbGVjdGlvbnMgYXMgUmFuZ2VbXSB9LCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHNlYXJjaFNjb3BlOiBudWxsIH0sIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGFjdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fdG9nZ2xlU2VsZWN0aW9uRmluZC5kb21Ob2RlKTtcblxuXHRcdC8vIENsb3NlIGJ1dHRvblxuXHRcdHRoaXMuX2Nsb3NlQnRuID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNpbXBsZUJ1dHRvbih7XG5cdFx0XHRsYWJlbDogTkxTX0NMT1NFX0JUTl9MQUJFTCArIHRoaXMuX2tleWJpbmRpbmdMYWJlbEZvcihGSU5EX0lEUy5DbG9zZUZpbmRXaWRnZXRDb21tYW5kKSxcblx0XHRcdGljb246IHdpZGdldENsb3NlLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdFx0b25UcmlnZ2VyOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IGlzUmV2ZWFsZWQ6IGZhbHNlLCBzZWFyY2hTY29wZTogbnVsbCB9LCBmYWxzZSk7XG5cdFx0XHR9LFxuXHRcdFx0b25LZXlEb3duOiAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5UYWIpKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2lzUmVwbGFjZVZpc2libGUpIHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLl9yZXBsYWNlQnRuLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3JlcGxhY2VCdG4uZm9jdXMoKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2NvZGVFZGl0b3IuZm9jdXMoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCB0aGlzLl9ob3ZlclNlcnZpY2UpKTtcblxuXHRcdC8vIFJlcGxhY2UgaW5wdXRcblx0XHR0aGlzLl9yZXBsYWNlSW5wdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29udGV4dFNjb3BlZFJlcGxhY2VJbnB1dChudWxsLCB1bmRlZmluZWQsIHtcblx0XHRcdGxhYmVsOiBOTFNfUkVQTEFDRV9JTlBVVF9MQUJFTCxcblx0XHRcdHBsYWNlaG9sZGVyOiBOTFNfUkVQTEFDRV9JTlBVVF9QTEFDRUhPTERFUixcblx0XHRcdGFwcGVuZFByZXNlcnZlQ2FzZUxhYmVsOiB0aGlzLl9rZXliaW5kaW5nTGFiZWxGb3IoRklORF9JRFMuVG9nZ2xlUHJlc2VydmVDYXNlQ29tbWFuZCksXG5cdFx0XHRoaXN0b3J5OiByZXBsYWNlSGlzdG9yeUNvbmZpZyA9PT0gJ3dvcmtzcGFjZScgPyB0aGlzLl9yZXBsYWNlV2lkZ2V0SGlzdG9yeSA6IG5ldyBTZXQoW10pLFxuXHRcdFx0ZmxleGlibGVIZWlnaHQsXG5cdFx0XHRmbGV4aWJsZVdpZHRoLFxuXHRcdFx0ZmxleGlibGVNYXhIZWlnaHQ6IDExOCxcblx0XHRcdHNob3dIaXN0b3J5SGludDogKCkgPT4gc2hvd0hpc3RvcnlLZXliaW5kaW5nSGludCh0aGlzLl9rZXliaW5kaW5nU2VydmljZSksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzLFxuXHRcdFx0dG9nZ2xlU3R5bGVzOiBkZWZhdWx0VG9nZ2xlU3R5bGVzLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdH0sIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0cnVlKSk7XG5cdFx0dGhpcy5fcmVwbGFjZUlucHV0LnNldFByZXNlcnZlQ2FzZSghIXRoaXMuX3N0YXRlLnByZXNlcnZlQ2FzZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVwbGFjZUlucHV0Lm9uS2V5RG93bigoZSkgPT4gdGhpcy5fb25SZXBsYWNlSW5wdXRLZXlEb3duKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVwbGFjZUlucHV0LmlucHV0Qm94Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHJlcGxhY2VTdHJpbmc6IHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC52YWx1ZSB9LCBmYWxzZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC5vbkRpZEhlaWdodENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzUmVwbGFjZVZpc2libGUgJiYgdGhpcy5fdHJ5VXBkYXRlSGVpZ2h0KCkpIHtcblx0XHRcdFx0dGhpcy5fc2hvd1ZpZXdab25lKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlcGxhY2VJbnB1dC5vbkRpZE9wdGlvbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2Uoe1xuXHRcdFx0XHRwcmVzZXJ2ZUNhc2U6IHRoaXMuX3JlcGxhY2VJbnB1dC5nZXRQcmVzZXJ2ZUNhc2UoKVxuXHRcdFx0fSwgdHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlcGxhY2VJbnB1dC5vblByZXNlcnZlQ2FzZUtleURvd24oKGUpID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLlRhYikpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3ByZXZCdG4uaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9wcmV2QnRuLmZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fbmV4dEJ0bi5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuX25leHRCdG4uZm9jdXMoKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl90b2dnbGVTZWxlY3Rpb25GaW5kLmVuYWJsZWQpIHtcblx0XHRcdFx0XHR0aGlzLl90b2dnbGVTZWxlY3Rpb25GaW5kLmZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fY2xvc2VCdG4uaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9jbG9zZUJ0bi5mb2N1cygpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlcGxhY2Ugb25lIGJ1dHRvblxuXHRcdHRoaXMuX3JlcGxhY2VCdG4gPSB0aGlzLl9yZWdpc3RlcihuZXcgU2ltcGxlQnV0dG9uKHtcblx0XHRcdGxhYmVsOiBOTFNfUkVQTEFDRV9CVE5fTEFCRUwgKyB0aGlzLl9rZXliaW5kaW5nTGFiZWxGb3IoRklORF9JRFMuUmVwbGFjZU9uZUFjdGlvbiksXG5cdFx0XHRpY29uOiBmaW5kUmVwbGFjZUljb24sXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdFx0XHRvblRyaWdnZXI6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fY29udHJvbGxlci5yZXBsYWNlKCk7XG5cdFx0XHR9LFxuXHRcdFx0b25LZXlEb3duOiAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5lcXVhbHMoS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWIpKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2xvc2VCdG4uZm9jdXMoKTtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCB0aGlzLl9ob3ZlclNlcnZpY2UpKTtcblxuXHRcdC8vIFJlcGxhY2UgYWxsIGJ1dHRvblxuXHRcdHRoaXMuX3JlcGxhY2VBbGxCdG4gPSB0aGlzLl9yZWdpc3RlcihuZXcgU2ltcGxlQnV0dG9uKHtcblx0XHRcdGxhYmVsOiBOTFNfUkVQTEFDRV9BTExfQlROX0xBQkVMICsgdGhpcy5fa2V5YmluZGluZ0xhYmVsRm9yKEZJTkRfSURTLlJlcGxhY2VBbGxBY3Rpb24pLFxuXHRcdFx0aWNvbjogZmluZFJlcGxhY2VBbGxJY29uLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdFx0b25UcmlnZ2VyOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2NvbnRyb2xsZXIucmVwbGFjZUFsbCgpO1xuXHRcdFx0fVxuXHRcdH0sIHRoaXMuX2hvdmVyU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgcmVwbGFjZVBhcnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRyZXBsYWNlUGFydC5jbGFzc05hbWUgPSAncmVwbGFjZS1wYXJ0Jztcblx0XHRyZXBsYWNlUGFydC5hcHBlbmRDaGlsZCh0aGlzLl9yZXBsYWNlSW5wdXQuZG9tTm9kZSk7XG5cblx0XHRjb25zdCByZXBsYWNlQWN0aW9uc0NvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHJlcGxhY2VBY3Rpb25zQ29udGFpbmVyLmNsYXNzTmFtZSA9ICdyZXBsYWNlLWFjdGlvbnMnO1xuXHRcdHJlcGxhY2VQYXJ0LmFwcGVuZENoaWxkKHJlcGxhY2VBY3Rpb25zQ29udGFpbmVyKTtcblxuXHRcdHJlcGxhY2VBY3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3JlcGxhY2VCdG4uZG9tTm9kZSk7XG5cdFx0cmVwbGFjZUFjdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fcmVwbGFjZUFsbEJ0bi5kb21Ob2RlKTtcblxuXHRcdC8vIFRvZ2dsZSByZXBsYWNlIGJ1dHRvblxuXHRcdHRoaXMuX3RvZ2dsZVJlcGxhY2VCdG4gPSB0aGlzLl9yZWdpc3RlcihuZXcgU2ltcGxlQnV0dG9uKHtcblx0XHRcdGxhYmVsOiBOTFNfVE9HR0xFX1JFUExBQ0VfTU9ERV9CVE5fTEFCRUwsXG5cdFx0XHRjbGFzc05hbWU6ICdjb2RpY29uIHRvZ2dsZSBsZWZ0Jyxcblx0XHRcdG9uVHJpZ2dlcjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBpc1JlcGxhY2VSZXZlYWxlZDogIXRoaXMuX2lzUmVwbGFjZVZpc2libGUgfSwgZmFsc2UpO1xuXHRcdFx0XHRpZiAodGhpcy5faXNSZXBsYWNlVmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC53aWR0aCA9IGRvbS5nZXRUb3RhbFdpZHRoKHRoaXMuX2ZpbmRJbnB1dC5kb21Ob2RlKTtcblx0XHRcdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQuaW5wdXRCb3gubGF5b3V0KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc2hvd1ZpZXdab25lKCk7XG5cdFx0XHR9XG5cdFx0fSwgdGhpcy5faG92ZXJTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fdG9nZ2xlUmVwbGFjZUJ0bi5zZXRFeHBhbmRlZCh0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKTtcblxuXHRcdC8vIFdpZGdldFxuXHRcdHRoaXMuX2RvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTmFtZSA9ICdlZGl0b3Itd2lkZ2V0IGZpbmQtd2lkZ2V0Jztcblx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXJpYUxhYmVsID0gTkxTX0ZJTkRfRElBTE9HX0xBQkVMO1xuXHRcdHRoaXMuX2RvbU5vZGUucm9sZSA9ICdkaWFsb2cnO1xuXG5cdFx0Ly8gV2UgbmVlZCB0byBzZXQgdGhpcyBleHBsaWNpdGx5LCBvdGhlcndpc2Ugb24gSUUxMSwgdGhlIHdpZHRoIGluaGVyaXRlbmNlIG9mIGZsZXggZG9lc24ndCB3b3JrLlxuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUud2lkdGggPSBgJHtGSU5EX1dJREdFVF9JTklUSUFMX1dJRFRIfXB4YDtcblxuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fdG9nZ2xlUmVwbGFjZUJ0bi5kb21Ob2RlKTtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKGZpbmRQYXJ0KTtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2Nsb3NlQnRuLmRvbU5vZGUpO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQocmVwbGFjZVBhcnQpO1xuXG5cdFx0dGhpcy5fcmVzaXplU2FzaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTYXNoKHRoaXMuX2RvbU5vZGUsIHRoaXMsIHsgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBzaXplOiAyIH0pKTtcblx0XHR0aGlzLl9yZXNpemVkID0gZmFsc2U7XG5cdFx0bGV0IG9yaWdpbmFsV2lkdGggPSBGSU5EX1dJREdFVF9JTklUSUFMX1dJRFRIO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVzaXplU2FzaC5vbkRpZFN0YXJ0KCgpID0+IHtcblx0XHRcdG9yaWdpbmFsV2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9kb21Ob2RlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZXNpemVTYXNoLm9uRGlkQ2hhbmdlKChldnQ6IElTYXNoRXZlbnQpID0+IHtcblx0XHRcdHRoaXMuX3Jlc2l6ZWQgPSB0cnVlO1xuXHRcdFx0Y29uc3Qgd2lkdGggPSBvcmlnaW5hbFdpZHRoICsgZXZ0LnN0YXJ0WCAtIGV2dC5jdXJyZW50WDtcblxuXHRcdFx0aWYgKHdpZHRoIDwgRklORF9XSURHRVRfSU5JVElBTF9XSURUSCkge1xuXHRcdFx0XHQvLyBuYXJyb3cgZG93biB0aGUgZmluZCB3aWRnZXQgc2hvdWxkIGJlIGhhbmRsZWQgYnkgQ1NTLlxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1heFdpZHRoID0gcGFyc2VGbG9hdChkb20uZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLl9kb21Ob2RlKS5tYXhXaWR0aCkgfHwgMDtcblx0XHRcdGlmICh3aWR0aCA+IG1heFdpZHRoKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0XHRpZiAodGhpcy5faXNSZXBsYWNlVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQud2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9maW5kSW5wdXQuZG9tTm9kZSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5sYXlvdXQoKTtcblx0XHRcdHRoaXMuX3RyeVVwZGF0ZUhlaWdodCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Jlc2l6ZVNhc2gub25EaWRSZXNldCgoKSA9PiB7XG5cdFx0XHQvLyB1c2VycyBkb3VibGUgY2xpY2sgb24gdGhlIHNhc2hcblx0XHRcdGNvbnN0IGN1cnJlbnRXaWR0aCA9IGRvbS5nZXRUb3RhbFdpZHRoKHRoaXMuX2RvbU5vZGUpO1xuXG5cdFx0XHRpZiAoY3VycmVudFdpZHRoIDwgRklORF9XSURHRVRfSU5JVElBTF9XSURUSCkge1xuXHRcdFx0XHQvLyBUaGUgZWRpdG9yIGlzIG5hcnJvdyBhbmQgdGhlIHdpZHRoIG9mIHRoZSBmaW5kIHdpZGdldCBpcyBjb250cm9sbGVkIGZ1bGx5IGJ5IENTUy5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgd2lkdGggPSBGSU5EX1dJREdFVF9JTklUSUFMX1dJRFRIO1xuXG5cdFx0XHRpZiAoIXRoaXMuX3Jlc2l6ZWQgfHwgY3VycmVudFdpZHRoID09PSBGSU5EX1dJREdFVF9JTklUSUFMX1dJRFRIKSB7XG5cdFx0XHRcdC8vIDEuIG5ldmVyIHJlc2l6ZWQgYmVmb3JlLCBkb3VibGUgY2xpY2sgc2hvdWxkIG1heGltaXplcyBpdFxuXHRcdFx0XHQvLyAyLiB1c2VycyByZXNpemVkIGl0IGFscmVhZHkgYnV0IGl0cyB3aWR0aCBpcyB0aGUgc2FtZSBhcyBkZWZhdWx0XG5cdFx0XHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLl9jb2RlRWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRcdFx0d2lkdGggPSBsYXlvdXRJbmZvLndpZHRoIC0gMjggLSBsYXlvdXRJbmZvLm1pbmltYXAubWluaW1hcFdpZHRoIC0gMTU7XG5cdFx0XHRcdHRoaXMuX3Jlc2l6ZWQgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0LyoqXG5cdFx0XHRcdCAqIG5vIG9wLCB0aGUgZmluZCB3aWRnZXQgc2hvdWxkIGJlIHNocmlua2VkIHRvIGl0cyBkZWZhdWx0IHNpemUuXG5cdFx0XHRcdCAqL1xuXHRcdFx0fVxuXG5cblx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0XHRpZiAodGhpcy5faXNSZXBsYWNlVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQud2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9maW5kSW5wdXQuZG9tTm9kZSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5sYXlvdXQoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFjY2Vzc2liaWxpdHlTdXBwb3J0KCk6IHZvaWQge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmFjY2Vzc2liaWxpdHlTdXBwb3J0KTtcblx0XHR0aGlzLl9maW5kSW5wdXQuc2V0Rm9jdXNJbnB1dE9uT3B0aW9uQ2xpY2sodmFsdWUgIT09IEFjY2Vzc2liaWxpdHlTdXBwb3J0LkVuYWJsZWQpO1xuXHRcdHRoaXMuX3VwZGF0ZUZpbmRJbnB1dEFyaWFMYWJlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRmluZElucHV0QXJpYUxhYmVsKCk6IHZvaWQge1xuXHRcdGxldCBmaW5kTGFiZWwgPSBOTFNfRklORF9JTlBVVF9MQUJFTDtcblx0XHRsZXQgcmVwbGFjZUxhYmVsID0gTkxTX1JFUExBQ0VfSU5QVVRfTEFCRUw7XG5cdFx0aWYgKCF0aGlzLl9hY2Nlc3NpYmlsaXR5SGVscEhpbnRBbm5vdW5jZWQgJiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmZpbmQnKSAmJiB0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKSB7XG5cdFx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5SGVscEtleWJpbmRpbmcgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKCdlZGl0b3IuYWN0aW9uLmFjY2Vzc2liaWxpdHlIZWxwJyk/LmdldEFyaWFMYWJlbCgpO1xuXHRcdFx0aWYgKGFjY2Vzc2liaWxpdHlIZWxwS2V5YmluZGluZykge1xuXHRcdFx0XHRjb25zdCBoaW50ID0gbmxzLmxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5SGVscEhpbnRJbkxhYmVsJywgXCJQcmVzcyB7MH0gZm9yIGFjY2Vzc2liaWxpdHkgaGVscFwiLCBhY2Nlc3NpYmlsaXR5SGVscEtleWJpbmRpbmcpO1xuXHRcdFx0XHRmaW5kTGFiZWwgPSBubHMubG9jYWxpemUoJ2ZpbmRJbnB1dEFyaWFMYWJlbFdpdGhIaW50JywgXCJ7MH0sIHsxfVwiLCBmaW5kTGFiZWwsIGhpbnQpO1xuXHRcdFx0XHRyZXBsYWNlTGFiZWwgPSBubHMubG9jYWxpemUoJ3JlcGxhY2VJbnB1dEFyaWFMYWJlbFdpdGhIaW50JywgXCJ7MH0sIHsxfVwiLCByZXBsYWNlTGFiZWwsIGhpbnQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eUhlbHBIaW50QW5ub3VuY2VkID0gdHJ1ZTtcblx0XHRcdC8vIFNjaGVkdWxlIHJlc2V0IHRvIHBsYWluIGxhYmVscyBhZnRlciBpbml0aWFsIGFubm91bmNlbWVudFxuXHRcdFx0dGhpcy5fbGFiZWxSZXNldFRpbWVvdXQ/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2xhYmVsUmVzZXRUaW1lb3V0ID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmluZElucHV0LmlucHV0Qm94LnNldEFyaWFMYWJlbChOTFNfRklORF9JTlBVVF9MQUJFTCk7XG5cdFx0XHRcdFx0dGhpcy5fcmVwbGFjZUlucHV0LmlucHV0Qm94LnNldEFyaWFMYWJlbChOTFNfUkVQTEFDRV9JTlBVVF9MQUJFTCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDEwMDApO1xuXHRcdH1cblx0XHR0aGlzLl9maW5kSW5wdXQuaW5wdXRCb3guc2V0QXJpYUxhYmVsKGZpbmRMYWJlbCk7XG5cdFx0dGhpcy5fcmVwbGFjZUlucHV0LmlucHV0Qm94LnNldEFyaWFMYWJlbChyZXBsYWNlTGFiZWwpO1xuXHR9XG5cblx0Z2V0Vmlld1N0YXRlKCkge1xuXHRcdGxldCB3aWRnZXRWaWV3Wm9uZVZpc2libGUgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5fdmlld1pvbmUgJiYgdGhpcy5fdmlld1pvbmVJZCkge1xuXHRcdFx0d2lkZ2V0Vmlld1pvbmVWaXNpYmxlID0gdGhpcy5fdmlld1pvbmUuaGVpZ2h0SW5QeCA+IHRoaXMuX2NvZGVFZGl0b3IuZ2V0U2Nyb2xsVG9wKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHdpZGdldFZpZXdab25lVmlzaWJsZSxcblx0XHRcdHNjcm9sbFRvcDogdGhpcy5fY29kZUVkaXRvci5nZXRTY3JvbGxUb3AoKVxuXHRcdH07XG5cdH1cblxuXHRzZXRWaWV3U3RhdGUoc3RhdGU/OiB7IHdpZGdldFZpZXdab25lVmlzaWJsZTogYm9vbGVhbjsgc2Nyb2xsVG9wOiBudW1iZXIgfSkge1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc3RhdGUud2lkZ2V0Vmlld1pvbmVWaXNpYmxlKSB7XG5cdFx0XHQvLyB3ZSBzaG91bGQgYWRkIHRoZSB2aWV3IHpvbmVcblx0XHRcdHRoaXMuX2xheW91dFZpZXdab25lKHN0YXRlLnNjcm9sbFRvcCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNpbXBsZUJ1dHRvbk9wdHMge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBjbGFzc05hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb24/OiBUaGVtZUljb247XG5cdHJlYWRvbmx5IGhvdmVyTGlmZWN5Y2xlT3B0aW9ucz86IElIb3ZlckxpZmVjeWNsZU9wdGlvbnM7XG5cdHJlYWRvbmx5IG9uVHJpZ2dlcjogKCkgPT4gdm9pZDtcblx0cmVhZG9ubHkgb25LZXlEb3duPzogKGU6IElLZXlib2FyZEV2ZW50KSA9PiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgU2ltcGxlQnV0dG9uIGV4dGVuZHMgV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcHRzOiBJU2ltcGxlQnV0dG9uT3B0cztcblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0czogSVNpbXBsZUJ1dHRvbk9wdHMsXG5cdFx0aG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fb3B0cyA9IG9wdHM7XG5cblx0XHRsZXQgY2xhc3NOYW1lID0gJ2J1dHRvbic7XG5cdFx0aWYgKHRoaXMuX29wdHMuY2xhc3NOYW1lKSB7XG5cdFx0XHRjbGFzc05hbWUgPSBjbGFzc05hbWUgKyAnICcgKyB0aGlzLl9vcHRzLmNsYXNzTmFtZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX29wdHMuaWNvbikge1xuXHRcdFx0Y2xhc3NOYW1lID0gY2xhc3NOYW1lICsgJyAnICsgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHRoaXMuX29wdHMuaWNvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2RvbU5vZGUudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5fb3B0cy5sYWJlbCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuX2RvbU5vZGUsIHtcblx0XHRcdGNvbnRlbnQ6IHRoaXMuX29wdHMubGFiZWwsXG5cdFx0XHRzdHlsZTogSG92ZXJTdHlsZS5Qb2ludGVyLFxuXHRcdH0sIG9wdHMuaG92ZXJMaWZlY3ljbGVPcHRpb25zKSk7XG5cblx0XHR0aGlzLm9uY2xpY2sodGhpcy5fZG9tTm9kZSwgKGUpID0+IHtcblx0XHRcdHRoaXMuX29wdHMub25UcmlnZ2VyKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLm9ua2V5ZG93bih0aGlzLl9kb21Ob2RlLCAoZSkgPT4ge1xuXHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuU3BhY2UpIHx8IGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdHRoaXMuX29wdHMub25UcmlnZ2VyKCk7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb3B0cy5vbktleURvd24/LihlKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHRwdWJsaWMgaXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5fZG9tTm9kZS50YWJJbmRleCA+PSAwKTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9kb21Ob2RlLmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0RW5hYmxlZChlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICFlbmFibGVkKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcsIFN0cmluZyghZW5hYmxlZCkpO1xuXHRcdHRoaXMuX2RvbU5vZGUudGFiSW5kZXggPSBlbmFibGVkID8gMCA6IC0xO1xuXHR9XG5cblx0cHVibGljIHNldEV4cGFuZGVkKGV4cGFuZGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoISFleHBhbmRlZCkpO1xuXHRcdGlmIChleHBhbmRlZCkge1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGZpbmRDb2xsYXBzZWRJY29uKSk7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoZmluZEV4cGFuZGVkSWNvbikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoZmluZEV4cGFuZGVkSWNvbikpO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGZpbmRDb2xsYXBzZWRJY29uKSk7XG5cdFx0fVxuXHR9XG59XG5cbi8vIHRoZW1pbmdcblxucmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQoKHRoZW1lLCBjb2xsZWN0b3IpID0+IHtcblx0Y29uc3QgZmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yRmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyKTtcblx0aWYgKGZpbmRNYXRjaEhpZ2hsaWdodEJvcmRlcikge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWVkaXRvciAuZmluZE1hdGNoIHsgYm9yZGVyOiAxcHggJHtpc0hpZ2hDb250cmFzdCh0aGVtZS50eXBlKSA/ICdkb3R0ZWQnIDogJ3NvbGlkJ30gJHtmaW5kTWF0Y2hIaWdobGlnaHRCb3JkZXJ9OyBib3gtc2l6aW5nOiBib3JkZXItYm94OyB9YCk7XG5cdH1cblxuXHRjb25zdCBmaW5kUmFuZ2VIaWdobGlnaHRCb3JkZXIgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JGaW5kUmFuZ2VIaWdobGlnaHRCb3JkZXIpO1xuXHRpZiAoZmluZFJhbmdlSGlnaGxpZ2h0Qm9yZGVyKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28tZWRpdG9yIC5maW5kU2NvcGUgeyBib3JkZXI6IDFweCAke2lzSGlnaENvbnRyYXN0KHRoZW1lLnR5cGUpID8gJ2Rhc2hlZCcgOiAnc29saWQnfSAke2ZpbmRSYW5nZUhpZ2hsaWdodEJvcmRlcn07IH1gKTtcblx0fVxuXG5cdGNvbnN0IGhjQm9yZGVyID0gdGhlbWUuZ2V0Q29sb3IoY29udHJhc3RCb3JkZXIpO1xuXHRpZiAoaGNCb3JkZXIpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1lZGl0b3IgLmZpbmQtd2lkZ2V0IHsgYm9yZGVyOiAxcHggc29saWQgJHtoY0JvcmRlcn07IH1gKTtcblx0fVxuXHRjb25zdCBmaW5kTWF0Y2hGb3JlZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yRmluZE1hdGNoRm9yZWdyb3VuZCk7XG5cdGlmIChmaW5kTWF0Y2hGb3JlZ3JvdW5kKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28tZWRpdG9yIC5maW5kTWF0Y2hJbmxpbmUgeyBjb2xvcjogJHtmaW5kTWF0Y2hGb3JlZ3JvdW5kfTsgfWApO1xuXHR9XG5cdGNvbnN0IGZpbmRNYXRjaEhpZ2hsaWdodEZvcmVncm91bmQgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JGaW5kTWF0Y2hIaWdobGlnaHRGb3JlZ3JvdW5kKTtcblx0aWYgKGZpbmRNYXRjaEhpZ2hsaWdodEZvcmVncm91bmQpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1lZGl0b3IgLmN1cnJlbnRGaW5kTWF0Y2hJbmxpbmUgeyBjb2xvcjogJHtmaW5kTWF0Y2hIaWdobGlnaHRGb3JlZ3JvdW5kfTsgfWApO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUdyQixTQUFTLFNBQVMsZUFBZTtBQUNqQyxTQUFTLGNBQWM7QUFLdkIsU0FBa0QsYUFBYSxZQUFZO0FBQzNFLFNBQVMsY0FBYztBQUN2QixTQUFTLFNBQVMseUJBQXlCO0FBQzNDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLG9CQUFpQztBQUMxQyxZQUFZLGNBQWM7QUFDMUIsWUFBWSxhQUFhO0FBQ3pCLE9BQU87QUFDUCxTQUF5RSx1Q0FBdUM7QUFDaEgsU0FBb0Msb0JBQW9CO0FBQ3hELFNBQVMsYUFBYTtBQUN0QixTQUFTLDRCQUE0Qiw2QkFBNkIsK0JBQStCLFVBQVUscUJBQXFCO0FBRWhJLFlBQVksU0FBUztBQUNyQixTQUFTLDRCQUFtRDtBQUM1RCxTQUFTLHdCQUF3QixpQ0FBaUM7QUFDbEUsU0FBUyxpQ0FBaUM7QUFHMUMsU0FBUyxlQUFlLGdCQUFnQiwyQkFBMkIsZ0NBQWdDLG9DQUFvQyxnQ0FBZ0MsNkJBQTZCLHlCQUF5Qixt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V0FBVyxTQUF3QjtBQUN6QyxTQUFLLFNBQVMsVUFBVSxPQUFPLFlBQVksQ0FBQyxPQUFPO0FBQ25ELFNBQUssU0FBUyxhQUFhLGlCQUFpQixPQUFPLENBQUMsT0FBTyxDQUFDO0FBQzVELFNBQUssU0FBUyxXQUFXLFVBQVUsSUFBSTtBQUFBLEVBQ3hDO0FBQUEsRUFFTyxZQUFZLFVBQXlCO0FBQzNDLFNBQUssU0FBUyxhQUFhLGlCQUFpQixPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUM7QUFDOUQsUUFBSSxVQUFVO0FBQ2IsV0FBSyxTQUFTLFVBQVUsT0FBTyxHQUFHLFVBQVUsaUJBQWlCLGlCQUFpQixDQUFDO0FBQy9FLFdBQUssU0FBUyxVQUFVLElBQUksR0FBRyxVQUFVLGlCQUFpQixnQkFBZ0IsQ0FBQztBQUFBLElBQzVFLE9BQU87QUFDTixXQUFLLFNBQVMsVUFBVSxPQUFPLEdBQUcsVUFBVSxpQkFBaUIsZ0JBQWdCLENBQUM7QUFDOUUsV0FBSyxTQUFTLFVBQVUsSUFBSSxHQUFHLFVBQVUsaUJBQWlCLGlCQUFpQixDQUFDO0FBQUEsSUFDN0U7QUFBQSxFQUNEO0FBQ0Q7QUFJQSwyQkFBMkIsQ0FBQyxPQUFPLGNBQWM7QUFDaEQsUUFBTSwyQkFBMkIsTUFBTSxTQUFTLDhCQUE4QjtBQUM5RSxNQUFJLDBCQUEwQjtBQUM3QixjQUFVLFFBQVEsMkNBQTJDLGVBQWUsTUFBTSxJQUFJLElBQUksV0FBVyxPQUFPLElBQUksd0JBQXdCLDZCQUE2QjtBQUFBLEVBQ3RLO0FBRUEsUUFBTSwyQkFBMkIsTUFBTSxTQUFTLDhCQUE4QjtBQUM5RSxNQUFJLDBCQUEwQjtBQUM3QixjQUFVLFFBQVEsMkNBQTJDLGVBQWUsTUFBTSxJQUFJLElBQUksV0FBVyxPQUFPLElBQUksd0JBQXdCLEtBQUs7QUFBQSxFQUM5STtBQUVBLFFBQU0sV0FBVyxNQUFNLFNBQVMsY0FBYztBQUM5QyxNQUFJLFVBQVU7QUFDYixjQUFVLFFBQVEsbURBQW1ELFFBQVEsS0FBSztBQUFBLEVBQ25GO0FBQ0EsUUFBTSxzQkFBc0IsTUFBTSxTQUFTLHlCQUF5QjtBQUNwRSxNQUFJLHFCQUFxQjtBQUN4QixjQUFVLFFBQVEsNENBQTRDLG1CQUFtQixLQUFLO0FBQUEsRUFDdkY7QUFDQSxRQUFNLCtCQUErQixNQUFNLFNBQVMsa0NBQWtDO0FBQ3RGLE1BQUksOEJBQThCO0FBQ2pDLGNBQVUsUUFBUSxtREFBbUQsNEJBQTRCLEtBQUs7QUFBQSxFQUN2RztBQUNELENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
