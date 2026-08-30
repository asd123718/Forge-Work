var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { InputBox } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { Widget } from "../../../../base/browser/ui/widget.js";
import { Action } from "../../../../base/common/actions.js";
import { Delayer, disposableTimeout } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { CONTEXT_FIND_WIDGET_NOT_VISIBLE } from "../../../../editor/contrib/find/browser/findModel.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ContextScopedReplaceInput } from "../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { isSearchViewFocused, getSearchView } from "./searchActionsBase.js";
import * as Constants from "../common/constants.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { Toggle } from "../../../../base/browser/ui/toggle/toggle.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { searchReplaceAllIcon, searchHideReplaceIcon, searchShowContextIcon, searchShowReplaceIcon } from "./searchIcons.js";
import { ToggleSearchEditorContextLinesCommandId } from "../../searchEditor/browser/constants.js";
import { showHistoryKeybindingHint } from "../../../../platform/history/browser/historyWidgetKeybindingHint.js";
import { defaultInputBoxStyles, defaultToggleStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { NotebookFindFilters } from "../../notebook/browser/contrib/find/findFilters.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { NotebookEditorInput } from "../../notebook/common/notebookEditorInput.js";
import { GroupModelChangeKind } from "../../../common/editor.js";
import { SearchFindInput } from "./searchFindInput.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { MutableDisposable } from "../../../../base/common/lifecycle.js";
import { NotebookFindScopeType } from "../../notebook/common/notebookCommon.js";
const SingleLineInputHeight = 26;
const _ReplaceAllAction = class _ReplaceAllAction extends Action {
  constructor(_searchWidget) {
    super(_ReplaceAllAction.ID, "", ThemeIcon.asClassName(searchReplaceAllIcon), false);
    this._searchWidget = _searchWidget;
  }
  set searchWidget(searchWidget) {
    this._searchWidget = searchWidget;
  }
  run() {
    if (this._searchWidget) {
      return this._searchWidget.triggerReplaceAll();
    }
    return Promise.resolve();
  }
};
_ReplaceAllAction.ID = "search.action.replaceAll";
let ReplaceAllAction = _ReplaceAllAction;
const hoverLifecycleOptions = { groupId: "search-widget" };
const ctrlKeyMod = isMacintosh ? KeyMod.WinCtrl : KeyMod.CtrlCmd;
function stopPropagationForMultiLineUpwards(event, value, textarea) {
  const isMultiline = !!value.match(/\n/);
  if (textarea && (isMultiline || textarea.clientHeight > SingleLineInputHeight) && textarea.selectionStart > 0) {
    event.stopPropagation();
    return;
  }
}
function stopPropagationForMultiLineDownwards(event, value, textarea) {
  const isMultiline = !!value.match(/\n/);
  if (textarea && (isMultiline || textarea.clientHeight > SingleLineInputHeight) && textarea.selectionEnd < textarea.value.length) {
    event.stopPropagation();
    return;
  }
}
let SearchWidget = class extends Widget {
  constructor(container, options, contextViewService, contextKeyService, keybindingService, clipboardServce, configurationService, accessibilityService, contextMenuService, instantiationService, editorService) {
    super();
    this.contextViewService = contextViewService;
    this.contextKeyService = contextKeyService;
    this.keybindingService = keybindingService;
    this.clipboardServce = clipboardServce;
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.ignoreGlobalFindBufferOnNextFocus = false;
    this.previousGlobalFindBufferValue = null;
    /**
     * Tracks whether the accessibility help hint has been announced in the ARIA label.
     * Reset when the widget loses focus, allowing the hint to be announced again
     * on the next focus.
     */
    this._accessibilityHelpHintAnnounced = false;
    this._onSearchSubmit = this._register(new Emitter());
    this.onSearchSubmit = this._onSearchSubmit.event;
    this._onSearchCancel = this._register(new Emitter());
    this.onSearchCancel = this._onSearchCancel.event;
    this._onReplaceToggled = this._register(new Emitter());
    this.onReplaceToggled = this._onReplaceToggled.event;
    this._onReplaceStateChange = this._register(new Emitter());
    this.onReplaceStateChange = this._onReplaceStateChange.event;
    this._onPreserveCaseChange = this._register(new Emitter());
    this.onPreserveCaseChange = this._onPreserveCaseChange.event;
    this._onReplaceValueChanged = this._register(new Emitter());
    this.onReplaceValueChanged = this._onReplaceValueChanged.event;
    this._onReplaceAll = this._register(new Emitter());
    this.onReplaceAll = this._onReplaceAll.event;
    this._onBlur = this._register(new Emitter());
    this.onBlur = this._onBlur.event;
    this._onDidHeightChange = this._register(new Emitter());
    this.onDidHeightChange = this._onDidHeightChange.event;
    this._onDidToggleContext = this._register(new Emitter());
    this.onDidToggleContext = this._onDidToggleContext.event;
    this.replaceActive = Constants.SearchContext.ReplaceActiveKey.bindTo(this.contextKeyService);
    this.searchInputBoxFocused = Constants.SearchContext.SearchInputBoxFocusedKey.bindTo(this.contextKeyService);
    this.replaceInputBoxFocused = Constants.SearchContext.ReplaceInputBoxFocusedKey.bindTo(this.contextKeyService);
    const notebookOptions = options.notebookOptions ?? {
      isInNotebookMarkdownInput: true,
      isInNotebookMarkdownPreview: true,
      isInNotebookCellInput: true,
      isInNotebookCellOutput: true
    };
    this._notebookFilters = this._register(
      new NotebookFindFilters(
        notebookOptions.isInNotebookMarkdownInput,
        notebookOptions.isInNotebookMarkdownPreview,
        notebookOptions.isInNotebookCellInput,
        notebookOptions.isInNotebookCellOutput,
        { findScopeType: NotebookFindScopeType.None }
      )
    );
    this._register(
      this._notebookFilters.onDidChange(() => {
        if (this.searchInput) {
          this.searchInput.updateFilterStyles();
        }
      })
    );
    this._register(this.editorService.onDidEditorsChange((e) => {
      if (this.searchInput && e.event.editor instanceof NotebookEditorInput && (e.event.kind === GroupModelChangeKind.EDITOR_OPEN || e.event.kind === GroupModelChangeKind.EDITOR_CLOSE)) {
        this.searchInput.filterVisible = this._hasNotebookOpen();
      }
    }));
    this._replaceHistoryDelayer = new Delayer(500);
    this._toggleReplaceButtonListener = this._register(new MutableDisposable());
    this.render(container, options);
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.accessibilitySupport")) {
        this.updateAccessibilitySupport();
      }
    }));
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this.updateAccessibilitySupport()));
    this.updateAccessibilitySupport();
  }
  _hasNotebookOpen() {
    const editors = this.editorService.editors;
    return editors.some((editor) => editor instanceof NotebookEditorInput);
  }
  getNotebookFilters() {
    return this._notebookFilters;
  }
  focus(select = true, focusReplace = false, suppressGlobalSearchBuffer = false) {
    this.ignoreGlobalFindBufferOnNextFocus = suppressGlobalSearchBuffer;
    if (focusReplace && this.isReplaceShown()) {
      if (this.replaceInput) {
        this._updateSearchInputAriaLabel(false);
        this.replaceInput.focus();
        if (select) {
          this.replaceInput.select();
        }
      }
    } else {
      if (this.searchInput) {
        this._updateSearchInputAriaLabel(true);
        this.searchInput.focus();
        if (select) {
          this.searchInput.select();
        }
      }
    }
  }
  /**
   * Updates the ARIA label of the search input box.
   * When a screen reader is active and the accessibility verbosity setting is enabled,
   * includes a hint about pressing Alt+F1 for accessibility help on first focus.
   * The hint is only announced once per focus cycle to prevent double-speak.
   * @param includeHint Whether to include the accessibility help hint in the label
   */
  _updateSearchInputAriaLabel(includeHint) {
    if (!this.searchInput) {
      return;
    }
    let searchLabel = nls.localize("label.Search", "Search: Type Search Term and press Enter to search");
    if (includeHint && !this._accessibilityHelpHintAnnounced && this.configurationService.getValue("accessibility.verbosity.find") && this.accessibilityService.isScreenReaderOptimized()) {
      const keybinding = this.keybindingService.lookupKeybinding("editor.action.accessibilityHelp")?.getAriaLabel();
      if (keybinding) {
        searchLabel += ", " + nls.localize("accessibilityHelpHintInLabel", "Press {0} for accessibility help", keybinding);
        this._accessibilityHelpHintAnnounced = true;
        this._labelResetTimeout?.dispose();
        this._labelResetTimeout = disposableTimeout(() => {
          if (this.searchInput) {
            this.searchInput.inputBox.setAriaLabel(nls.localize("label.Search", "Search: Type Search Term and press Enter to search"));
          }
        }, 1e3);
      }
    }
    this.searchInput.inputBox.setAriaLabel(searchLabel);
  }
  setWidth(width) {
    this.searchInput?.inputBox.layout();
    if (this.replaceInput) {
      this.replaceInput.width = width - 28;
      this.replaceInput.inputBox.layout();
    }
  }
  clear() {
    this.searchInput?.clear();
    this.replaceInput?.setValue("");
    this.setReplaceAllActionState(false);
  }
  isReplaceShown() {
    return this.replaceContainer ? !this.replaceContainer.classList.contains("disabled") : false;
  }
  isReplaceActive() {
    return !!this.replaceActive.get();
  }
  getReplaceValue() {
    return this.replaceInput?.getValue() ?? "";
  }
  toggleReplace(show) {
    if (show === void 0 || show !== this.isReplaceShown()) {
      this.onToggleReplaceButton();
    }
  }
  getSearchHistory() {
    return this.searchInput?.inputBox.getHistory() ?? [];
  }
  getReplaceHistory() {
    return this.replaceInput?.inputBox.getHistory() ?? [];
  }
  prependSearchHistory(history) {
    this.searchInput?.inputBox.prependHistory(history);
  }
  prependReplaceHistory(history) {
    this.replaceInput?.inputBox.prependHistory(history);
  }
  clearHistory() {
    this.searchInput?.inputBox.clearHistory();
    this.replaceInput?.inputBox.clearHistory();
  }
  showNextSearchTerm() {
    this.searchInput?.inputBox.showNextValue();
  }
  showPreviousSearchTerm() {
    this.searchInput?.inputBox.showPreviousValue();
  }
  showNextReplaceTerm() {
    this.replaceInput?.inputBox.showNextValue();
  }
  showPreviousReplaceTerm() {
    this.replaceInput?.inputBox.showPreviousValue();
  }
  searchInputHasFocus() {
    return !!this.searchInputBoxFocused.get();
  }
  replaceInputHasFocus() {
    return !!this.replaceInput?.inputBox.hasFocus();
  }
  focusReplaceAllAction() {
    this.replaceActionBar?.focus(true);
  }
  focusRegexAction() {
    this.searchInput?.focusOnRegex();
  }
  set replaceButtonVisibility(val) {
    if (this.toggleReplaceButton) {
      this.toggleReplaceButton.element.style.display = val ? "" : "none";
    }
  }
  render(container, options) {
    this.domNode = dom.append(container, dom.$(".search-widget"));
    this.domNode.style.position = "relative";
    if (!options._hideReplaceToggle) {
      this.renderToggleReplaceButton(this.domNode);
    }
    this.renderSearchInput(this.domNode, options);
    this.renderReplaceInput(this.domNode, options);
  }
  updateAccessibilitySupport() {
    this.searchInput?.setFocusInputOnOptionClick(!this.accessibilityService.isScreenReaderOptimized());
  }
  renderToggleReplaceButton(parent) {
    const opts = {
      buttonBackground: void 0,
      buttonBorder: void 0,
      buttonForeground: void 0,
      buttonHoverBackground: void 0,
      buttonSecondaryBackground: void 0,
      buttonSecondaryForeground: void 0,
      buttonSecondaryHoverBackground: void 0,
      buttonSeparator: void 0,
      title: nls.localize("search.replace.toggle.button.title", "Toggle Replace"),
      hoverDelegate: getDefaultHoverDelegate("element")
    };
    this.toggleReplaceButton = this._register(new Button(parent, opts));
    this.toggleReplaceButton.element.setAttribute("aria-expanded", "false");
    this.toggleReplaceButton.element.classList.add("toggle-replace-button");
    this.toggleReplaceButton.icon = searchHideReplaceIcon;
    this._toggleReplaceButtonListener.value = this.toggleReplaceButton.onDidClick(() => this.onToggleReplaceButton());
  }
  renderSearchInput(parent, options) {
    const history = options.searchHistory || [];
    const inputOptions = {
      label: nls.localize("label.Search", "Search: Type Search Term and press Enter to search"),
      validation: (value) => this.validateSearchInput(value),
      placeholder: nls.localize("search.placeHolder", "Search"),
      appendCaseSensitiveLabel: this.keybindingService.appendKeybinding("", Constants.SearchCommandIds.ToggleCaseSensitiveCommandId),
      appendWholeWordsLabel: this.keybindingService.appendKeybinding("", Constants.SearchCommandIds.ToggleWholeWordCommandId),
      appendRegexLabel: this.keybindingService.appendKeybinding("", Constants.SearchCommandIds.ToggleRegexCommandId),
      history: new Set(history),
      showHistoryHint: () => showHistoryKeybindingHint(this.keybindingService),
      flexibleHeight: true,
      flexibleMaxHeight: SearchWidget.INPUT_MAX_HEIGHT,
      showCommonFindToggles: true,
      inputBoxStyles: options.inputBoxStyles,
      toggleStyles: options.toggleStyles,
      hoverLifecycleOptions
    };
    const searchInputContainer = dom.append(parent, dom.$(".search-container.input-box"));
    this.searchInput = this._register(
      new SearchFindInput(
        searchInputContainer,
        this.contextViewService,
        inputOptions,
        this.contextKeyService,
        this.contextMenuService,
        this.instantiationService,
        this._notebookFilters,
        this._hasNotebookOpen()
      )
    );
    this._register(this.searchInput.onKeyDown((keyboardEvent) => this.onSearchInputKeyDown(keyboardEvent)));
    this.searchInput.setValue(options.value || "");
    this.searchInput.setRegex(!!options.isRegex);
    this.searchInput.setCaseSensitive(!!options.isCaseSensitive);
    this.searchInput.setWholeWords(!!options.isWholeWords);
    this._register(this.searchInput.onCaseSensitiveKeyDown((keyboardEvent) => this.onCaseSensitiveKeyDown(keyboardEvent)));
    this._register(this.searchInput.onRegexKeyDown((keyboardEvent) => this.onRegexKeyDown(keyboardEvent)));
    this._register(this.searchInput.inputBox.onDidChange(() => this.onSearchInputChanged()));
    this._register(this.searchInput.inputBox.onDidHeightChange(() => this._onDidHeightChange.fire()));
    this._register(this.onReplaceValueChanged(() => {
      this._replaceHistoryDelayer.trigger(() => this.replaceInput?.inputBox.addToHistory());
    }));
    this.searchInputFocusTracker = this._register(dom.trackFocus(this.searchInput.inputBox.inputElement));
    this._register(this.searchInputFocusTracker.onDidFocus(async () => {
      this.searchInputBoxFocused.set(true);
      const useGlobalFindBuffer = this.searchConfiguration.globalFindClipboard;
      if (!this.ignoreGlobalFindBufferOnNextFocus && useGlobalFindBuffer) {
        const globalBufferText = await this.clipboardServce.readFindText();
        if (globalBufferText && this.previousGlobalFindBufferValue !== globalBufferText) {
          this.searchInput?.inputBox.addToHistory();
          this.searchInput?.setValue(globalBufferText);
          this.searchInput?.select();
        }
        this.previousGlobalFindBufferValue = globalBufferText;
      }
      this.ignoreGlobalFindBufferOnNextFocus = false;
    }));
    this._register(this.searchInputFocusTracker.onDidBlur(() => this.searchInputBoxFocused.set(false)));
    this.showContextToggle = this._register(new Toggle({
      isChecked: false,
      title: this.keybindingService.appendKeybinding(nls.localize("showContext", "Toggle Context Lines"), ToggleSearchEditorContextLinesCommandId),
      icon: searchShowContextIcon,
      hoverLifecycleOptions,
      ...defaultToggleStyles
    }));
    this._register(this.showContextToggle.onChange(() => this.onContextLinesChanged()));
    if (options.showContextToggle) {
      this.contextLinesInput = this._register(new InputBox(searchInputContainer, this.contextViewService, { type: "number", inputBoxStyles: defaultInputBoxStyles }));
      this.contextLinesInput.element.classList.add("context-lines-input");
      this.contextLinesInput.value = "" + (this.configurationService.getValue("search").searchEditor.defaultNumberOfContextLines ?? 1);
      this._register(this.contextLinesInput.onDidChange((value) => {
        if (value !== "0") {
          this.showContextToggle.checked = true;
        }
        this.onContextLinesChanged();
      }));
      dom.append(searchInputContainer, this.showContextToggle.domNode);
    }
  }
  onContextLinesChanged() {
    this._onDidToggleContext.fire();
    if (this.contextLinesInput.value.includes("-")) {
      this.contextLinesInput.value = "0";
    }
    this._onDidToggleContext.fire();
  }
  setContextLines(lines) {
    if (!this.contextLinesInput) {
      return;
    }
    if (lines === 0) {
      this.showContextToggle.checked = false;
    } else {
      this.showContextToggle.checked = true;
      this.contextLinesInput.value = "" + lines;
    }
  }
  renderReplaceInput(parent, options) {
    this.replaceContainer = dom.append(parent, dom.$(".replace-container.disabled"));
    const replaceBox = dom.append(this.replaceContainer, dom.$(".replace-input"));
    this.replaceInput = this._register(new ContextScopedReplaceInput(replaceBox, this.contextViewService, {
      label: nls.localize("label.Replace", "Replace: Type replace term and press Enter to preview"),
      placeholder: nls.localize("search.replace.placeHolder", "Replace"),
      appendPreserveCaseLabel: this.keybindingService.appendKeybinding("", Constants.SearchCommandIds.TogglePreserveCaseId),
      history: new Set(options.replaceHistory),
      showHistoryHint: () => showHistoryKeybindingHint(this.keybindingService),
      flexibleHeight: true,
      flexibleMaxHeight: SearchWidget.INPUT_MAX_HEIGHT,
      inputBoxStyles: options.inputBoxStyles,
      toggleStyles: options.toggleStyles,
      hoverLifecycleOptions
    }, this.contextKeyService, true));
    this._register(this.replaceInput.onDidOptionChange((viaKeyboard) => {
      if (!viaKeyboard) {
        if (this.replaceInput) {
          this._onPreserveCaseChange.fire(this.replaceInput.getPreserveCase());
        }
      }
    }));
    this._register(this.replaceInput.onKeyDown((keyboardEvent) => this.onReplaceInputKeyDown(keyboardEvent)));
    this.replaceInput.setValue(options.replaceValue || "");
    this._register(this.replaceInput.inputBox.onDidChange(() => this._onReplaceValueChanged.fire()));
    this._register(this.replaceInput.inputBox.onDidHeightChange(() => this._onDidHeightChange.fire()));
    this.replaceAllAction = this._register(new ReplaceAllAction(this));
    this.replaceAllAction.label = SearchWidget.REPLACE_ALL_DISABLED_LABEL;
    this.replaceActionBar = this._register(new ActionBar(this.replaceContainer));
    this.replaceActionBar.push([this.replaceAllAction], { icon: true, label: false });
    this.onkeydown(this.replaceActionBar.domNode, (keyboardEvent) => this.onReplaceActionbarKeyDown(keyboardEvent));
    this.replaceInputFocusTracker = this._register(dom.trackFocus(this.replaceInput.inputBox.inputElement));
    this._register(this.replaceInputFocusTracker.onDidFocus(() => this.replaceInputBoxFocused.set(true)));
    this._register(this.replaceInputFocusTracker.onDidBlur(() => this.replaceInputBoxFocused.set(false)));
    this._register(this.replaceInput.onPreserveCaseKeyDown((keyboardEvent) => this.onPreserveCaseKeyDown(keyboardEvent)));
  }
  triggerReplaceAll() {
    this._onReplaceAll.fire();
    return Promise.resolve();
  }
  onToggleReplaceButton() {
    this.replaceContainer?.classList.toggle("disabled");
    if (this.isReplaceShown()) {
      this.toggleReplaceButton?.element.classList.remove(...ThemeIcon.asClassNameArray(searchHideReplaceIcon));
      this.toggleReplaceButton?.element.classList.add(...ThemeIcon.asClassNameArray(searchShowReplaceIcon));
    } else {
      this.toggleReplaceButton?.element.classList.remove(...ThemeIcon.asClassNameArray(searchShowReplaceIcon));
      this.toggleReplaceButton?.element.classList.add(...ThemeIcon.asClassNameArray(searchHideReplaceIcon));
    }
    this.toggleReplaceButton?.element.setAttribute("aria-expanded", this.isReplaceShown() ? "true" : "false");
    this.updateReplaceActiveState();
    this._onReplaceToggled.fire();
  }
  setValue(value) {
    this.searchInput?.setValue(value);
  }
  setReplaceAllActionState(enabled) {
    if (this.replaceAllAction && this.replaceAllAction.enabled !== enabled) {
      this.replaceAllAction.enabled = enabled;
      this.replaceAllAction.label = enabled ? SearchWidget.REPLACE_ALL_ENABLED_LABEL(this.keybindingService) : SearchWidget.REPLACE_ALL_DISABLED_LABEL;
      this.updateReplaceActiveState();
    }
  }
  updateReplaceActiveState() {
    const currentState = this.isReplaceActive();
    const newState = this.isReplaceShown() && !!this.replaceAllAction?.enabled;
    if (currentState !== newState) {
      this.replaceActive.set(newState);
      this._onReplaceStateChange.fire(newState);
      this.replaceInput?.inputBox.layout();
    }
  }
  validateSearchInput(value) {
    if (value.length === 0) {
      return null;
    }
    if (!this.searchInput?.getRegex()) {
      return null;
    }
    try {
      new RegExp(value, "u");
    } catch (e) {
      return { content: e.message };
    }
    return null;
  }
  onSearchInputChanged() {
    this.searchInput?.clearMessage();
    this.setReplaceAllActionState(false);
    if (this.searchConfiguration.searchOnType) {
      if (this.searchInput?.getRegex()) {
        try {
          const regex = new RegExp(this.searchInput.getValue(), "ug");
          const matchienessHeuristic = `
								~!@#$%^&*()_+
								\`1234567890-=
								qwertyuiop[]\\
								QWERTYUIOP{}|
								asdfghjkl;'
								ASDFGHJKL:"
								zxcvbnm,./
								ZXCVBNM<>? `.match(regex)?.length ?? 0;
          const delayMultiplier = matchienessHeuristic < 50 ? 1 : matchienessHeuristic < 100 ? 5 : (
            // expressions like `.` or `\w`
            10
          );
          this.submitSearch(true, this.searchConfiguration.searchOnTypeDebouncePeriod * delayMultiplier);
        } catch {
        }
      } else {
        this.submitSearch(true, this.searchConfiguration.searchOnTypeDebouncePeriod);
      }
    }
  }
  onSearchInputKeyDown(keyboardEvent) {
    if (keyboardEvent.equals(ctrlKeyMod | KeyCode.Enter)) {
      this.searchInput?.inputBox.insertAtCursor("\n");
      keyboardEvent.preventDefault();
    }
    if (keyboardEvent.equals(KeyCode.Enter)) {
      this.searchInput?.onSearchSubmit();
      this.submitSearch();
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyCode.Escape)) {
      this._onSearchCancel.fire({ focus: true });
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyCode.Tab)) {
      if (this.isReplaceShown()) {
        this.replaceInput?.focus();
      } else {
        this.searchInput?.focusOnCaseSensitive();
      }
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyCode.UpArrow)) {
      stopPropagationForMultiLineUpwards(keyboardEvent, this.searchInput?.getValue() ?? "", this.searchInput?.domNode.querySelector("textarea") ?? null);
    } else if (keyboardEvent.equals(KeyCode.DownArrow)) {
      stopPropagationForMultiLineDownwards(keyboardEvent, this.searchInput?.getValue() ?? "", this.searchInput?.domNode.querySelector("textarea") ?? null);
    } else if (keyboardEvent.equals(KeyCode.PageUp)) {
      const inputElement = this.searchInput?.inputBox.inputElement;
      if (inputElement) {
        inputElement.setSelectionRange(0, 0);
        inputElement.focus();
        keyboardEvent.preventDefault();
      }
    } else if (keyboardEvent.equals(KeyCode.PageDown)) {
      const inputElement = this.searchInput?.inputBox.inputElement;
      if (inputElement) {
        const endOfText = inputElement.value.length;
        inputElement.setSelectionRange(endOfText, endOfText);
        inputElement.focus();
        keyboardEvent.preventDefault();
      }
    }
  }
  onCaseSensitiveKeyDown(keyboardEvent) {
    if (keyboardEvent.equals(KeyMod.Shift | KeyCode.Tab)) {
      if (this.isReplaceShown()) {
        this.replaceInput?.focus();
        keyboardEvent.preventDefault();
      }
    }
  }
  onRegexKeyDown(keyboardEvent) {
    if (keyboardEvent.equals(KeyCode.Tab)) {
      if (this.isReplaceShown()) {
        this.replaceInput?.focusOnPreserve();
        keyboardEvent.preventDefault();
      }
    }
  }
  onPreserveCaseKeyDown(keyboardEvent) {
    if (keyboardEvent.equals(KeyCode.Tab)) {
      if (this.isReplaceActive()) {
        this.focusReplaceAllAction();
      } else {
        this._onBlur.fire();
      }
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyMod.Shift | KeyCode.Tab)) {
      this.focusRegexAction();
      keyboardEvent.preventDefault();
    }
  }
  onReplaceInputKeyDown(keyboardEvent) {
    if (keyboardEvent.equals(ctrlKeyMod | KeyCode.Enter)) {
      this.replaceInput?.inputBox.insertAtCursor("\n");
      keyboardEvent.preventDefault();
    }
    if (keyboardEvent.equals(KeyCode.Enter)) {
      this.submitSearch();
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyCode.Tab)) {
      this.searchInput?.focusOnCaseSensitive();
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyMod.Shift | KeyCode.Tab)) {
      this.searchInput?.focus();
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyCode.UpArrow)) {
      stopPropagationForMultiLineUpwards(keyboardEvent, this.replaceInput?.getValue() ?? "", this.replaceInput?.domNode.querySelector("textarea") ?? null);
    } else if (keyboardEvent.equals(KeyCode.DownArrow)) {
      stopPropagationForMultiLineDownwards(keyboardEvent, this.replaceInput?.getValue() ?? "", this.replaceInput?.domNode.querySelector("textarea") ?? null);
    }
  }
  onReplaceActionbarKeyDown(keyboardEvent) {
    if (keyboardEvent.equals(KeyMod.Shift | KeyCode.Tab)) {
      this.focusRegexAction();
      keyboardEvent.preventDefault();
    }
  }
  async submitSearch(triggeredOnType = false, delay = 0) {
    this.searchInput?.validate();
    if (!this.searchInput?.inputBox.isInputValid()) {
      return;
    }
    const value = this.searchInput.getValue();
    const useGlobalFindBuffer = this.searchConfiguration.globalFindClipboard;
    if (value && useGlobalFindBuffer) {
      await this.clipboardServce.writeFindText(value);
    }
    this._onSearchSubmit.fire({ triggeredOnType, delay });
  }
  getContextLines() {
    return this.showContextToggle.checked ? +this.contextLinesInput.value : 0;
  }
  modifyContextLines(increase) {
    const current = +this.contextLinesInput.value;
    const modified = current + (increase ? 1 : -1);
    this.showContextToggle.checked = modified !== 0;
    this.contextLinesInput.value = "" + modified;
  }
  toggleContextLines() {
    this.showContextToggle.checked = !this.showContextToggle.checked;
    this.onContextLinesChanged();
  }
  dispose() {
    this.setReplaceAllActionState(false);
    super.dispose();
  }
  get searchConfiguration() {
    return this.configurationService.getValue("search");
  }
};
SearchWidget.INPUT_MAX_HEIGHT = 134;
SearchWidget.REPLACE_ALL_DISABLED_LABEL = nls.localize("search.action.replaceAll.disabled.label", "Replace All (Submit Search to Enable)");
SearchWidget.REPLACE_ALL_ENABLED_LABEL = (keyBindingService2) => {
  return keyBindingService2.appendKeybinding(nls.localize("search.action.replaceAll.enabled.label", "Replace All"), ReplaceAllAction.ID);
};
SearchWidget = __decorateClass([
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IClipboardService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IAccessibilityService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IEditorService)
], SearchWidget);
function registerContributions() {
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: ReplaceAllAction.ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceActiveKey, CONTEXT_FIND_WIDGET_NOT_VISIBLE),
    primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.Enter,
    handler: (accessor) => {
      const viewsService = accessor.get(IViewsService);
      if (isSearchViewFocused(viewsService)) {
        const searchView = getSearchView(viewsService);
        if (searchView) {
          new ReplaceAllAction(searchView.searchAndReplaceWidget).run();
        }
      }
    }
  });
}
export {
  SearchWidget,
  registerContributions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcc2VhcmNoV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEJ1dHRvbiwgSUJ1dHRvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBJRmluZElucHV0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9maW5kaW5wdXQvZmluZElucHV0LmpzJztcbmltcG9ydCB7IFJlcGxhY2VJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9maW5kaW5wdXQvcmVwbGFjZUlucHV0LmpzJztcbmltcG9ydCB7IElJbnB1dEJveFN0eWxlcywgSU1lc3NhZ2UsIElucHV0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IFdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS93aWRnZXQuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEZWxheWVyLCBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9GSU5EX1dJREdFVF9OT1RfVklTSUJMRSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9maW5kTW9kZWwuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dFNjb3BlZFJlcGxhY2VJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hpc3RvcnkvYnJvd3Nlci9jb250ZXh0U2NvcGVkSGlzdG9yeVdpZGdldC5qcyc7XG5pbXBvcnQgeyBpc1NlYXJjaFZpZXdGb2N1c2VkLCBnZXRTZWFyY2hWaWV3IH0gZnJvbSAnLi9zZWFyY2hBY3Rpb25zQmFzZS5qcyc7XG5pbXBvcnQgKiBhcyBDb25zdGFudHMgZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVRvZ2dsZVN0eWxlcywgVG9nZ2xlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgc2VhcmNoUmVwbGFjZUFsbEljb24sIHNlYXJjaEhpZGVSZXBsYWNlSWNvbiwgc2VhcmNoU2hvd0NvbnRleHRJY29uLCBzZWFyY2hTaG93UmVwbGFjZUljb24gfSBmcm9tICcuL3NlYXJjaEljb25zLmpzJztcbmltcG9ydCB7IFRvZ2dsZVNlYXJjaEVkaXRvckNvbnRleHRMaW5lc0NvbW1hbmRJZCB9IGZyb20gJy4uLy4uL3NlYXJjaEVkaXRvci9icm93c2VyL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBzaG93SGlzdG9yeUtleWJpbmRpbmdIaW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaGlzdG9yeS9icm93c2VyL2hpc3RvcnlXaWRnZXRLZXliaW5kaW5nSGludC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsIGRlZmF1bHRUb2dnbGVTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tGaW5kRmlsdGVycyB9IGZyb20gJy4uLy4uL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9maW5kL2ZpbmRGaWx0ZXJzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEdyb3VwTW9kZWxDaGFuZ2VLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBTZWFyY2hGaW5kSW5wdXQgfSBmcm9tICcuL3NlYXJjaEZpbmRJbnB1dC5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tGaW5kU2NvcGVUeXBlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcblxuLyoqIFNwZWNpZmllZCBpbiBzZWFyY2h2aWV3LmNzcyAqL1xuY29uc3QgU2luZ2xlTGluZUlucHV0SGVpZ2h0ID0gMjY7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlYXJjaFdpZGdldE9wdGlvbnMge1xuXHR2YWx1ZT86IHN0cmluZztcblx0cmVwbGFjZVZhbHVlPzogc3RyaW5nO1xuXHRpc1JlZ2V4PzogYm9vbGVhbjtcblx0aXNDYXNlU2Vuc2l0aXZlPzogYm9vbGVhbjtcblx0aXNXaG9sZVdvcmRzPzogYm9vbGVhbjtcblx0c2VhcmNoSGlzdG9yeT86IHN0cmluZ1tdO1xuXHRyZXBsYWNlSGlzdG9yeT86IHN0cmluZ1tdO1xuXHRwcmVzZXJ2ZUNhc2U/OiBib29sZWFuO1xuXHRfaGlkZVJlcGxhY2VUb2dnbGU/OiBib29sZWFuOyAvLyBUT0RPOiBTZWFyY2ggRWRpdG9yJ3MgcmVwbGFjZSBleHBlcmllbmNlXG5cdHNob3dDb250ZXh0VG9nZ2xlPzogYm9vbGVhbjtcblx0aW5wdXRCb3hTdHlsZXM6IElJbnB1dEJveFN0eWxlcztcblx0dG9nZ2xlU3R5bGVzOiBJVG9nZ2xlU3R5bGVzO1xuXHRub3RlYm9va09wdGlvbnM/OiBOb3RlYm9va1RvZ2dsZVN0YXRlO1xufVxuXG5pbnRlcmZhY2UgTm90ZWJvb2tUb2dnbGVTdGF0ZSB7XG5cdGlzSW5Ob3RlYm9va01hcmtkb3duSW5wdXQ6IGJvb2xlYW47XG5cdGlzSW5Ob3RlYm9va01hcmtkb3duUHJldmlldzogYm9vbGVhbjtcblx0aXNJbk5vdGVib29rQ2VsbElucHV0OiBib29sZWFuO1xuXHRpc0luTm90ZWJvb2tDZWxsT3V0cHV0OiBib29sZWFuO1xufVxuXG5jbGFzcyBSZXBsYWNlQWxsQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICdzZWFyY2guYWN0aW9uLnJlcGxhY2VBbGwnO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgX3NlYXJjaFdpZGdldDogU2VhcmNoV2lkZ2V0KSB7XG5cdFx0c3VwZXIoUmVwbGFjZUFsbEFjdGlvbi5JRCwgJycsIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShzZWFyY2hSZXBsYWNlQWxsSWNvbiksIGZhbHNlKTtcblx0fVxuXG5cdHNldCBzZWFyY2hXaWRnZXQoc2VhcmNoV2lkZ2V0OiBTZWFyY2hXaWRnZXQpIHtcblx0XHR0aGlzLl9zZWFyY2hXaWRnZXQgPSBzZWFyY2hXaWRnZXQ7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3NlYXJjaFdpZGdldCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NlYXJjaFdpZGdldC50cmlnZ2VyUmVwbGFjZUFsbCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxuY29uc3QgaG92ZXJMaWZlY3ljbGVPcHRpb25zID0geyBncm91cElkOiAnc2VhcmNoLXdpZGdldCcgfTtcbmNvbnN0IGN0cmxLZXlNb2QgPSAoaXNNYWNpbnRvc2ggPyBLZXlNb2QuV2luQ3RybCA6IEtleU1vZC5DdHJsQ21kKTtcblxuZnVuY3Rpb24gc3RvcFByb3BhZ2F0aW9uRm9yTXVsdGlMaW5lVXB3YXJkcyhldmVudDogSUtleWJvYXJkRXZlbnQsIHZhbHVlOiBzdHJpbmcsIHRleHRhcmVhOiBIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbCkge1xuXHRjb25zdCBpc011bHRpbGluZSA9ICEhdmFsdWUubWF0Y2goL1xcbi8pO1xuXHRpZiAodGV4dGFyZWEgJiYgKGlzTXVsdGlsaW5lIHx8IHRleHRhcmVhLmNsaWVudEhlaWdodCA+IFNpbmdsZUxpbmVJbnB1dEhlaWdodCkgJiYgdGV4dGFyZWEuc2VsZWN0aW9uU3RhcnQgPiAwKSB7XG5cdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0cmV0dXJuO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHN0b3BQcm9wYWdhdGlvbkZvck11bHRpTGluZURvd253YXJkcyhldmVudDogSUtleWJvYXJkRXZlbnQsIHZhbHVlOiBzdHJpbmcsIHRleHRhcmVhOiBIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbCkge1xuXHRjb25zdCBpc011bHRpbGluZSA9ICEhdmFsdWUubWF0Y2goL1xcbi8pO1xuXHRpZiAodGV4dGFyZWEgJiYgKGlzTXVsdGlsaW5lIHx8IHRleHRhcmVhLmNsaWVudEhlaWdodCA+IFNpbmdsZUxpbmVJbnB1dEhlaWdodCkgJiYgdGV4dGFyZWEuc2VsZWN0aW9uRW5kIDwgdGV4dGFyZWEudmFsdWUubGVuZ3RoKSB7XG5cdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0cmV0dXJuO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIFNlYXJjaFdpZGdldCBleHRlbmRzIFdpZGdldCB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IElOUFVUX01BWF9IRUlHSFQgPSAxMzQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVQTEFDRV9BTExfRElTQUJMRURfTEFCRUwgPSBubHMubG9jYWxpemUoJ3NlYXJjaC5hY3Rpb24ucmVwbGFjZUFsbC5kaXNhYmxlZC5sYWJlbCcsIFwiUmVwbGFjZSBBbGwgKFN1Ym1pdCBTZWFyY2ggdG8gRW5hYmxlKVwiKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVQTEFDRV9BTExfRU5BQkxFRF9MQUJFTCA9IChrZXlCaW5kaW5nU2VydmljZTI6IElLZXliaW5kaW5nU2VydmljZSk6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuIGtleUJpbmRpbmdTZXJ2aWNlMi5hcHBlbmRLZXliaW5kaW5nKG5scy5sb2NhbGl6ZSgnc2VhcmNoLmFjdGlvbi5yZXBsYWNlQWxsLmVuYWJsZWQubGFiZWwnLCBcIlJlcGxhY2UgQWxsXCIpLCBSZXBsYWNlQWxsQWN0aW9uLklEKTtcblx0fTtcblxuXHRkb21Ob2RlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRzZWFyY2hJbnB1dDogU2VhcmNoRmluZElucHV0IHwgdW5kZWZpbmVkO1xuXHRzZWFyY2hJbnB1dEZvY3VzVHJhY2tlcjogZG9tLklGb2N1c1RyYWNrZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2VhcmNoSW5wdXRCb3hGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlcGxhY2VDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRyZXBsYWNlSW5wdXQ6IFJlcGxhY2VJbnB1dCB8IHVuZGVmaW5lZDtcblx0cmVwbGFjZUlucHV0Rm9jdXNUcmFja2VyOiBkb20uSUZvY3VzVHJhY2tlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZXBsYWNlSW5wdXRCb3hGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSB0b2dnbGVSZXBsYWNlQnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVwbGFjZUFsbEFjdGlvbjogUmVwbGFjZUFsbEFjdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZXBsYWNlQWN0aXZlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZXBsYWNlQWN0aW9uQmFyOiBBY3Rpb25CYXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlcGxhY2VIaXN0b3J5RGVsYXllcjogRGVsYXllcjx2b2lkPjtcblx0cHJpdmF0ZSBpZ25vcmVHbG9iYWxGaW5kQnVmZmVyT25OZXh0Rm9jdXMgPSBmYWxzZTtcblx0cHJpdmF0ZSBwcmV2aW91c0dsb2JhbEZpbmRCdWZmZXJWYWx1ZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0LyoqXG5cdCAqIFRyYWNrcyB3aGV0aGVyIHRoZSBhY2Nlc3NpYmlsaXR5IGhlbHAgaGludCBoYXMgYmVlbiBhbm5vdW5jZWQgaW4gdGhlIEFSSUEgbGFiZWwuXG5cdCAqIFJlc2V0IHdoZW4gdGhlIHdpZGdldCBsb3NlcyBmb2N1cywgYWxsb3dpbmcgdGhlIGhpbnQgdG8gYmUgYW5ub3VuY2VkIGFnYWluXG5cdCAqIG9uIHRoZSBuZXh0IGZvY3VzLlxuXHQgKi9cblx0cHJpdmF0ZSBfYWNjZXNzaWJpbGl0eUhlbHBIaW50QW5ub3VuY2VkID0gZmFsc2U7XG5cdHByaXZhdGUgX2xhYmVsUmVzZXRUaW1lb3V0OiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9vblNlYXJjaFN1Ym1pdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgdHJpZ2dlcmVkT25UeXBlOiBib29sZWFuOyBkZWxheTogbnVtYmVyIH0+KCkpO1xuXHRyZWFkb25seSBvblNlYXJjaFN1Ym1pdDogRXZlbnQ8eyB0cmlnZ2VyZWRPblR5cGU6IGJvb2xlYW47IGRlbGF5OiBudW1iZXIgfT4gPSB0aGlzLl9vblNlYXJjaFN1Ym1pdC5ldmVudDtcblxuXHRwcml2YXRlIF9vblNlYXJjaENhbmNlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgZm9jdXM6IGJvb2xlYW4gfT4oKSk7XG5cdHJlYWRvbmx5IG9uU2VhcmNoQ2FuY2VsOiBFdmVudDx7IGZvY3VzOiBib29sZWFuIH0+ID0gdGhpcy5fb25TZWFyY2hDYW5jZWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25SZXBsYWNlVG9nZ2xlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblJlcGxhY2VUb2dnbGVkOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uUmVwbGFjZVRvZ2dsZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25SZXBsYWNlU3RhdGVDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25SZXBsYWNlU3RhdGVDaGFuZ2U6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fb25SZXBsYWNlU3RhdGVDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25QcmVzZXJ2ZUNhc2VDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25QcmVzZXJ2ZUNhc2VDaGFuZ2U6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fb25QcmVzZXJ2ZUNhc2VDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25SZXBsYWNlVmFsdWVDaGFuZ2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uUmVwbGFjZVZhbHVlQ2hhbmdlZDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vblJlcGxhY2VWYWx1ZUNoYW5nZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25SZXBsYWNlQWxsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uUmVwbGFjZUFsbDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vblJlcGxhY2VBbGwuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25CbHVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uQmx1cjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkJsdXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRIZWlnaHRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRIZWlnaHRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRIZWlnaHRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUb2dnbGVDb250ZXh0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVG9nZ2xlQ29udGV4dDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZFRvZ2dsZUNvbnRleHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBzaG93Q29udGV4dFRvZ2dsZSE6IFRvZ2dsZTtcblx0cHVibGljIGNvbnRleHRMaW5lc0lucHV0ITogSW5wdXRCb3g7XG5cblx0cHJpdmF0ZSBfbm90ZWJvb2tGaWx0ZXJzOiBOb3RlYm9va0ZpbmRGaWx0ZXJzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b2dnbGVSZXBsYWNlQnV0dG9uTGlzdGVuZXI6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdG9wdGlvbnM6IElTZWFyY2hXaWRnZXRPcHRpb25zLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNsaXBib2FyZFNlcnZjZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZXBsYWNlQWN0aXZlID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuUmVwbGFjZUFjdGl2ZUtleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dEJveEZvY3VzZWQgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hJbnB1dEJveEZvY3VzZWRLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMucmVwbGFjZUlucHV0Qm94Rm9jdXNlZCA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlJlcGxhY2VJbnB1dEJveEZvY3VzZWRLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgbm90ZWJvb2tPcHRpb25zID0gb3B0aW9ucy5ub3RlYm9va09wdGlvbnMgPz9cblx0XHR7XG5cdFx0XHRpc0luTm90ZWJvb2tNYXJrZG93bklucHV0OiB0cnVlLFxuXHRcdFx0aXNJbk5vdGVib29rTWFya2Rvd25QcmV2aWV3OiB0cnVlLFxuXHRcdFx0aXNJbk5vdGVib29rQ2VsbElucHV0OiB0cnVlLFxuXHRcdFx0aXNJbk5vdGVib29rQ2VsbE91dHB1dDogdHJ1ZVxuXHRcdH07XG5cdFx0dGhpcy5fbm90ZWJvb2tGaWx0ZXJzID0gdGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRuZXcgTm90ZWJvb2tGaW5kRmlsdGVycyhcblx0XHRcdFx0bm90ZWJvb2tPcHRpb25zLmlzSW5Ob3RlYm9va01hcmtkb3duSW5wdXQsXG5cdFx0XHRcdG5vdGVib29rT3B0aW9ucy5pc0luTm90ZWJvb2tNYXJrZG93blByZXZpZXcsXG5cdFx0XHRcdG5vdGVib29rT3B0aW9ucy5pc0luTm90ZWJvb2tDZWxsSW5wdXQsXG5cdFx0XHRcdG5vdGVib29rT3B0aW9ucy5pc0luTm90ZWJvb2tDZWxsT3V0cHV0LFxuXHRcdFx0XHR7IGZpbmRTY29wZVR5cGU6IE5vdGVib29rRmluZFNjb3BlVHlwZS5Ob25lIH1cblx0XHRcdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHR0aGlzLl9ub3RlYm9va0ZpbHRlcnMub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5zZWFyY2hJbnB1dCkge1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoSW5wdXQudXBkYXRlRmlsdGVyU3R5bGVzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRFZGl0b3JzQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5zZWFyY2hJbnB1dCAmJlxuXHRcdFx0XHRlLmV2ZW50LmVkaXRvciBpbnN0YW5jZW9mIE5vdGVib29rRWRpdG9ySW5wdXQgJiZcblx0XHRcdFx0KGUuZXZlbnQua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX09QRU4gfHwgZS5ldmVudC5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQ0xPU0UpKSB7XG5cdFx0XHRcdHRoaXMuc2VhcmNoSW5wdXQuZmlsdGVyVmlzaWJsZSA9IHRoaXMuX2hhc05vdGVib29rT3BlbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlcGxhY2VIaXN0b3J5RGVsYXllciA9IG5ldyBEZWxheWVyPHZvaWQ+KDUwMCk7XG5cdFx0dGhpcy5fdG9nZ2xlUmVwbGFjZUJ1dHRvbkxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblxuXHRcdHRoaXMucmVuZGVyKGNvbnRhaW5lciwgb3B0aW9ucyk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuYWNjZXNzaWJpbGl0eVN1cHBvcnQnKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUFjY2Vzc2liaWxpdHlTdXBwb3J0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVNjcmVlblJlYWRlck9wdGltaXplZCgoKSA9PiB0aGlzLnVwZGF0ZUFjY2Vzc2liaWxpdHlTdXBwb3J0KCkpKTtcblx0XHR0aGlzLnVwZGF0ZUFjY2Vzc2liaWxpdHlTdXBwb3J0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNOb3RlYm9va09wZW4oKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZWRpdG9ycyA9IHRoaXMuZWRpdG9yU2VydmljZS5lZGl0b3JzO1xuXHRcdHJldHVybiBlZGl0b3JzLnNvbWUoZWRpdG9yID0+IGVkaXRvciBpbnN0YW5jZW9mIE5vdGVib29rRWRpdG9ySW5wdXQpO1xuXHR9XG5cblx0Z2V0Tm90ZWJvb2tGaWx0ZXJzKCkge1xuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9va0ZpbHRlcnM7XG5cdH1cblxuXHRmb2N1cyhzZWxlY3Q6IGJvb2xlYW4gPSB0cnVlLCBmb2N1c1JlcGxhY2U6IGJvb2xlYW4gPSBmYWxzZSwgc3VwcHJlc3NHbG9iYWxTZWFyY2hCdWZmZXIgPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuaWdub3JlR2xvYmFsRmluZEJ1ZmZlck9uTmV4dEZvY3VzID0gc3VwcHJlc3NHbG9iYWxTZWFyY2hCdWZmZXI7XG5cblx0XHRpZiAoZm9jdXNSZXBsYWNlICYmIHRoaXMuaXNSZXBsYWNlU2hvd24oKSkge1xuXHRcdFx0aWYgKHRoaXMucmVwbGFjZUlucHV0KSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVNlYXJjaElucHV0QXJpYUxhYmVsKGZhbHNlKTtcblx0XHRcdFx0dGhpcy5yZXBsYWNlSW5wdXQuZm9jdXMoKTtcblx0XHRcdFx0aWYgKHNlbGVjdCkge1xuXHRcdFx0XHRcdHRoaXMucmVwbGFjZUlucHV0LnNlbGVjdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLnNlYXJjaElucHV0KSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVNlYXJjaElucHV0QXJpYUxhYmVsKHRydWUpO1xuXHRcdFx0XHR0aGlzLnNlYXJjaElucHV0LmZvY3VzKCk7XG5cdFx0XHRcdGlmIChzZWxlY3QpIHtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaElucHV0LnNlbGVjdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIEFSSUEgbGFiZWwgb2YgdGhlIHNlYXJjaCBpbnB1dCBib3guXG5cdCAqIFdoZW4gYSBzY3JlZW4gcmVhZGVyIGlzIGFjdGl2ZSBhbmQgdGhlIGFjY2Vzc2liaWxpdHkgdmVyYm9zaXR5IHNldHRpbmcgaXMgZW5hYmxlZCxcblx0ICogaW5jbHVkZXMgYSBoaW50IGFib3V0IHByZXNzaW5nIEFsdCtGMSBmb3IgYWNjZXNzaWJpbGl0eSBoZWxwIG9uIGZpcnN0IGZvY3VzLlxuXHQgKiBUaGUgaGludCBpcyBvbmx5IGFubm91bmNlZCBvbmNlIHBlciBmb2N1cyBjeWNsZSB0byBwcmV2ZW50IGRvdWJsZS1zcGVhay5cblx0ICogQHBhcmFtIGluY2x1ZGVIaW50IFdoZXRoZXIgdG8gaW5jbHVkZSB0aGUgYWNjZXNzaWJpbGl0eSBoZWxwIGhpbnQgaW4gdGhlIGxhYmVsXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVTZWFyY2hJbnB1dEFyaWFMYWJlbChpbmNsdWRlSGludDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zZWFyY2hJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBzZWFyY2hMYWJlbCA9IG5scy5sb2NhbGl6ZSgnbGFiZWwuU2VhcmNoJywgJ1NlYXJjaDogVHlwZSBTZWFyY2ggVGVybSBhbmQgcHJlc3MgRW50ZXIgdG8gc2VhcmNoJyk7XG5cblx0XHQvLyBJbmNsdWRlIGFjY2Vzc2liaWxpdHkgaGVscCBoaW50IHdoZW4gcmVxdWVzdGVkLCBzY3JlZW4gcmVhZGVyIGlzIGFjdGl2ZSwgYW5kIHNldHRpbmcgaXMgZW5hYmxlZFxuXHRcdC8vIE5vdGU6IFVzaW5nIHJhdyBzdHJpbmcgZm9yIHNldHRpbmcgSUQgLSB0aGlzIHNldHRpbmcgbWF5IG5vdCBiZSByZWdpc3RlcmVkIHlldFxuXHRcdGlmIChpbmNsdWRlSGludCAmJiAhdGhpcy5fYWNjZXNzaWJpbGl0eUhlbHBIaW50QW5ub3VuY2VkICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmZpbmQnKSAmJiB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpIHtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoJ2VkaXRvci5hY3Rpb24uYWNjZXNzaWJpbGl0eUhlbHAnKT8uZ2V0QXJpYUxhYmVsKCk7XG5cdFx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0XHRzZWFyY2hMYWJlbCArPSAnLCAnICsgbmxzLmxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5SGVscEhpbnRJbkxhYmVsJywgXCJQcmVzcyB7MH0gZm9yIGFjY2Vzc2liaWxpdHkgaGVscFwiLCBrZXliaW5kaW5nKTtcblx0XHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eUhlbHBIaW50QW5ub3VuY2VkID0gdHJ1ZTtcblxuXHRcdFx0XHQvLyBSZXNldCB0byBwbGFpbiBsYWJlbCBhZnRlciBkZWxheSB0byBhdm9pZCByZXBlYXRlZCBhbm5vdW5jZW1lbnQgb24gZm9jdXMgY2hhbmdlc1xuXHRcdFx0XHR0aGlzLl9sYWJlbFJlc2V0VGltZW91dD8uZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9sYWJlbFJlc2V0VGltZW91dCA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRpZiAodGhpcy5zZWFyY2hJbnB1dCkge1xuXHRcdFx0XHRcdFx0dGhpcy5zZWFyY2hJbnB1dC5pbnB1dEJveC5zZXRBcmlhTGFiZWwobmxzLmxvY2FsaXplKCdsYWJlbC5TZWFyY2gnLCAnU2VhcmNoOiBUeXBlIFNlYXJjaCBUZXJtIGFuZCBwcmVzcyBFbnRlciB0byBzZWFyY2gnKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCAxMDAwKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnNlYXJjaElucHV0LmlucHV0Qm94LnNldEFyaWFMYWJlbChzZWFyY2hMYWJlbCk7XG5cdH1cblxuXHRzZXRXaWR0aCh3aWR0aDogbnVtYmVyKSB7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dD8uaW5wdXRCb3gubGF5b3V0KCk7XG5cdFx0aWYgKHRoaXMucmVwbGFjZUlucHV0KSB7XG5cdFx0XHR0aGlzLnJlcGxhY2VJbnB1dC53aWR0aCA9IHdpZHRoIC0gMjg7XG5cdFx0XHR0aGlzLnJlcGxhY2VJbnB1dC5pbnB1dEJveC5sYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhcigpIHtcblx0XHR0aGlzLnNlYXJjaElucHV0Py5jbGVhcigpO1xuXHRcdHRoaXMucmVwbGFjZUlucHV0Py5zZXRWYWx1ZSgnJyk7XG5cdFx0dGhpcy5zZXRSZXBsYWNlQWxsQWN0aW9uU3RhdGUoZmFsc2UpO1xuXHR9XG5cblx0aXNSZXBsYWNlU2hvd24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVwbGFjZUNvbnRhaW5lciA/ICF0aGlzLnJlcGxhY2VDb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdkaXNhYmxlZCcpIDogZmFsc2U7XG5cdH1cblxuXHRpc1JlcGxhY2VBY3RpdmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5yZXBsYWNlQWN0aXZlLmdldCgpO1xuXHR9XG5cblx0Z2V0UmVwbGFjZVZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMucmVwbGFjZUlucHV0Py5nZXRWYWx1ZSgpID8/ICcnO1xuXHR9XG5cblx0dG9nZ2xlUmVwbGFjZShzaG93PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChzaG93ID09PSB1bmRlZmluZWQgfHwgc2hvdyAhPT0gdGhpcy5pc1JlcGxhY2VTaG93bigpKSB7XG5cdFx0XHR0aGlzLm9uVG9nZ2xlUmVwbGFjZUJ1dHRvbigpO1xuXHRcdH1cblx0fVxuXG5cdGdldFNlYXJjaEhpc3RvcnkoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLnNlYXJjaElucHV0Py5pbnB1dEJveC5nZXRIaXN0b3J5KCkgPz8gW107XG5cdH1cblxuXHRnZXRSZXBsYWNlSGlzdG9yeSgpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMucmVwbGFjZUlucHV0Py5pbnB1dEJveC5nZXRIaXN0b3J5KCkgPz8gW107XG5cdH1cblxuXHRwcmVwZW5kU2VhcmNoSGlzdG9yeShoaXN0b3J5OiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQ/LmlucHV0Qm94LnByZXBlbmRIaXN0b3J5KGhpc3RvcnkpO1xuXHR9XG5cblx0cHJlcGVuZFJlcGxhY2VIaXN0b3J5KGhpc3Rvcnk6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0dGhpcy5yZXBsYWNlSW5wdXQ/LmlucHV0Qm94LnByZXBlbmRIaXN0b3J5KGhpc3RvcnkpO1xuXHR9XG5cblx0Y2xlYXJIaXN0b3J5KCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQ/LmlucHV0Qm94LmNsZWFySGlzdG9yeSgpO1xuXHRcdHRoaXMucmVwbGFjZUlucHV0Py5pbnB1dEJveC5jbGVhckhpc3RvcnkoKTtcblx0fVxuXG5cdHNob3dOZXh0U2VhcmNoVGVybSgpIHtcblx0XHR0aGlzLnNlYXJjaElucHV0Py5pbnB1dEJveC5zaG93TmV4dFZhbHVlKCk7XG5cdH1cblxuXHRzaG93UHJldmlvdXNTZWFyY2hUZXJtKCkge1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQ/LmlucHV0Qm94LnNob3dQcmV2aW91c1ZhbHVlKCk7XG5cdH1cblxuXHRzaG93TmV4dFJlcGxhY2VUZXJtKCkge1xuXHRcdHRoaXMucmVwbGFjZUlucHV0Py5pbnB1dEJveC5zaG93TmV4dFZhbHVlKCk7XG5cdH1cblxuXHRzaG93UHJldmlvdXNSZXBsYWNlVGVybSgpIHtcblx0XHR0aGlzLnJlcGxhY2VJbnB1dD8uaW5wdXRCb3guc2hvd1ByZXZpb3VzVmFsdWUoKTtcblx0fVxuXG5cdHNlYXJjaElucHV0SGFzRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5zZWFyY2hJbnB1dEJveEZvY3VzZWQuZ2V0KCk7XG5cdH1cblxuXHRyZXBsYWNlSW5wdXRIYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLnJlcGxhY2VJbnB1dD8uaW5wdXRCb3guaGFzRm9jdXMoKTtcblx0fVxuXG5cdGZvY3VzUmVwbGFjZUFsbEFjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnJlcGxhY2VBY3Rpb25CYXI/LmZvY3VzKHRydWUpO1xuXHR9XG5cblx0Zm9jdXNSZWdleEFjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnNlYXJjaElucHV0Py5mb2N1c09uUmVnZXgoKTtcblx0fVxuXG5cdHNldCByZXBsYWNlQnV0dG9uVmlzaWJpbGl0eSh2YWw6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy50b2dnbGVSZXBsYWNlQnV0dG9uKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZVJlcGxhY2VCdXR0b24uZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gdmFsID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgb3B0aW9uczogSVNlYXJjaFdpZGdldE9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5zZWFyY2gtd2lkZ2V0JykpO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cblx0XHRpZiAoIW9wdGlvbnMuX2hpZGVSZXBsYWNlVG9nZ2xlKSB7XG5cdFx0XHR0aGlzLnJlbmRlclRvZ2dsZVJlcGxhY2VCdXR0b24odGhpcy5kb21Ob2RlKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlclNlYXJjaElucHV0KHRoaXMuZG9tTm9kZSwgb3B0aW9ucyk7XG5cdFx0dGhpcy5yZW5kZXJSZXBsYWNlSW5wdXQodGhpcy5kb21Ob2RlLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWNjZXNzaWJpbGl0eVN1cHBvcnQoKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dD8uc2V0Rm9jdXNJbnB1dE9uT3B0aW9uQ2xpY2soIXRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclRvZ2dsZVJlcGxhY2VCdXR0b24ocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IG9wdHM6IElCdXR0b25PcHRpb25zID0ge1xuXHRcdFx0YnV0dG9uQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uQm9yZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25Gb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25Ib3ZlckJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUhvdmVyQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uU2VwYXJhdG9yOiB1bmRlZmluZWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzZWFyY2gucmVwbGFjZS50b2dnbGUuYnV0dG9uLnRpdGxlJywgXCJUb2dnbGUgUmVwbGFjZVwiKSxcblx0XHRcdGhvdmVyRGVsZWdhdGU6IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksXG5cdFx0fTtcblx0XHR0aGlzLnRvZ2dsZVJlcGxhY2VCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHBhcmVudCwgb3B0cykpO1xuXHRcdHRoaXMudG9nZ2xlUmVwbGFjZUJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdHRoaXMudG9nZ2xlUmVwbGFjZUJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3RvZ2dsZS1yZXBsYWNlLWJ1dHRvbicpO1xuXHRcdHRoaXMudG9nZ2xlUmVwbGFjZUJ1dHRvbi5pY29uID0gc2VhcmNoSGlkZVJlcGxhY2VJY29uO1xuXHRcdHRoaXMuX3RvZ2dsZVJlcGxhY2VCdXR0b25MaXN0ZW5lci52YWx1ZSA9IHRoaXMudG9nZ2xlUmVwbGFjZUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMub25Ub2dnbGVSZXBsYWNlQnV0dG9uKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTZWFyY2hJbnB1dChwYXJlbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBJU2VhcmNoV2lkZ2V0T3B0aW9ucyk6IHZvaWQge1xuXHRcdGNvbnN0IGhpc3RvcnkgPSBvcHRpb25zLnNlYXJjaEhpc3RvcnkgfHwgW107XG5cdFx0Y29uc3QgaW5wdXRPcHRpb25zOiBJRmluZElucHV0T3B0aW9ucyA9IHtcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2xhYmVsLlNlYXJjaCcsICdTZWFyY2g6IFR5cGUgU2VhcmNoIFRlcm0gYW5kIHByZXNzIEVudGVyIHRvIHNlYXJjaCcpLFxuXHRcdFx0dmFsaWRhdGlvbjogKHZhbHVlOiBzdHJpbmcpID0+IHRoaXMudmFsaWRhdGVTZWFyY2hJbnB1dCh2YWx1ZSksXG5cdFx0XHRwbGFjZWhvbGRlcjogbmxzLmxvY2FsaXplKCdzZWFyY2gucGxhY2VIb2xkZXInLCBcIlNlYXJjaFwiKSxcblx0XHRcdGFwcGVuZENhc2VTZW5zaXRpdmVMYWJlbDogdGhpcy5rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKCcnLCBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Ub2dnbGVDYXNlU2Vuc2l0aXZlQ29tbWFuZElkKSxcblx0XHRcdGFwcGVuZFdob2xlV29yZHNMYWJlbDogdGhpcy5rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKCcnLCBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Ub2dnbGVXaG9sZVdvcmRDb21tYW5kSWQpLFxuXHRcdFx0YXBwZW5kUmVnZXhMYWJlbDogdGhpcy5rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKCcnLCBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Ub2dnbGVSZWdleENvbW1hbmRJZCksXG5cdFx0XHRoaXN0b3J5OiBuZXcgU2V0KGhpc3RvcnkpLFxuXHRcdFx0c2hvd0hpc3RvcnlIaW50OiAoKSA9PiBzaG93SGlzdG9yeUtleWJpbmRpbmdIaW50KHRoaXMua2V5YmluZGluZ1NlcnZpY2UpLFxuXHRcdFx0ZmxleGlibGVIZWlnaHQ6IHRydWUsXG5cdFx0XHRmbGV4aWJsZU1heEhlaWdodDogU2VhcmNoV2lkZ2V0LklOUFVUX01BWF9IRUlHSFQsXG5cdFx0XHRzaG93Q29tbW9uRmluZFRvZ2dsZXM6IHRydWUsXG5cdFx0XHRpbnB1dEJveFN0eWxlczogb3B0aW9ucy5pbnB1dEJveFN0eWxlcyxcblx0XHRcdHRvZ2dsZVN0eWxlczogb3B0aW9ucy50b2dnbGVTdHlsZXMsXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHNlYXJjaElucHV0Q29udGFpbmVyID0gZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCcuc2VhcmNoLWNvbnRhaW5lci5pbnB1dC1ib3gnKSk7XG5cblx0XHR0aGlzLnNlYXJjaElucHV0ID0gdGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRuZXcgU2VhcmNoRmluZElucHV0KFxuXHRcdFx0XHRzZWFyY2hJbnB1dENvbnRhaW5lcixcblx0XHRcdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0XHRcdGlucHV0T3B0aW9ucyxcblx0XHRcdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuX25vdGVib29rRmlsdGVycyxcblx0XHRcdFx0dGhpcy5faGFzTm90ZWJvb2tPcGVuKClcblx0XHRcdClcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hJbnB1dC5vbktleURvd24oKGtleWJvYXJkRXZlbnQ6IElLZXlib2FyZEV2ZW50KSA9PiB0aGlzLm9uU2VhcmNoSW5wdXRLZXlEb3duKGtleWJvYXJkRXZlbnQpKSk7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dC5zZXRWYWx1ZShvcHRpb25zLnZhbHVlIHx8ICcnKTtcblx0XHR0aGlzLnNlYXJjaElucHV0LnNldFJlZ2V4KCEhb3B0aW9ucy5pc1JlZ2V4KTtcblx0XHR0aGlzLnNlYXJjaElucHV0LnNldENhc2VTZW5zaXRpdmUoISFvcHRpb25zLmlzQ2FzZVNlbnNpdGl2ZSk7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dC5zZXRXaG9sZVdvcmRzKCEhb3B0aW9ucy5pc1dob2xlV29yZHMpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoSW5wdXQub25DYXNlU2Vuc2l0aXZlS2V5RG93bigoa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpID0+IHRoaXMub25DYXNlU2Vuc2l0aXZlS2V5RG93bihrZXlib2FyZEV2ZW50KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoSW5wdXQub25SZWdleEtleURvd24oKGtleWJvYXJkRXZlbnQ6IElLZXlib2FyZEV2ZW50KSA9PiB0aGlzLm9uUmVnZXhLZXlEb3duKGtleWJvYXJkRXZlbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hJbnB1dC5pbnB1dEJveC5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLm9uU2VhcmNoSW5wdXRDaGFuZ2VkKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaElucHV0LmlucHV0Qm94Lm9uRGlkSGVpZ2h0Q2hhbmdlKCgpID0+IHRoaXMuX29uRGlkSGVpZ2h0Q2hhbmdlLmZpcmUoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vblJlcGxhY2VWYWx1ZUNoYW5nZWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVwbGFjZUhpc3RvcnlEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5yZXBsYWNlSW5wdXQ/LmlucHV0Qm94LmFkZFRvSGlzdG9yeSgpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnNlYXJjaElucHV0Rm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoZG9tLnRyYWNrRm9jdXModGhpcy5zZWFyY2hJbnB1dC5pbnB1dEJveC5pbnB1dEVsZW1lbnQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaElucHV0Rm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5zZWFyY2hJbnB1dEJveEZvY3VzZWQuc2V0KHRydWUpO1xuXG5cdFx0XHRjb25zdCB1c2VHbG9iYWxGaW5kQnVmZmVyID0gdGhpcy5zZWFyY2hDb25maWd1cmF0aW9uLmdsb2JhbEZpbmRDbGlwYm9hcmQ7XG5cdFx0XHRpZiAoIXRoaXMuaWdub3JlR2xvYmFsRmluZEJ1ZmZlck9uTmV4dEZvY3VzICYmIHVzZUdsb2JhbEZpbmRCdWZmZXIpIHtcblx0XHRcdFx0Y29uc3QgZ2xvYmFsQnVmZmVyVGV4dCA9IGF3YWl0IHRoaXMuY2xpcGJvYXJkU2VydmNlLnJlYWRGaW5kVGV4dCgpO1xuXHRcdFx0XHRpZiAoZ2xvYmFsQnVmZmVyVGV4dCAmJiB0aGlzLnByZXZpb3VzR2xvYmFsRmluZEJ1ZmZlclZhbHVlICE9PSBnbG9iYWxCdWZmZXJUZXh0KSB7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hJbnB1dD8uaW5wdXRCb3guYWRkVG9IaXN0b3J5KCk7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hJbnB1dD8uc2V0VmFsdWUoZ2xvYmFsQnVmZmVyVGV4dCk7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hJbnB1dD8uc2VsZWN0KCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnByZXZpb3VzR2xvYmFsRmluZEJ1ZmZlclZhbHVlID0gZ2xvYmFsQnVmZmVyVGV4dDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5pZ25vcmVHbG9iYWxGaW5kQnVmZmVyT25OZXh0Rm9jdXMgPSBmYWxzZTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hJbnB1dEZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4gdGhpcy5zZWFyY2hJbnB1dEJveEZvY3VzZWQuc2V0KGZhbHNlKSkpO1xuXG5cblx0XHR0aGlzLnNob3dDb250ZXh0VG9nZ2xlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRvZ2dsZSh7XG5cdFx0XHRpc0NoZWNrZWQ6IGZhbHNlLFxuXHRcdFx0dGl0bGU6IHRoaXMua2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyhubHMubG9jYWxpemUoJ3Nob3dDb250ZXh0JywgXCJUb2dnbGUgQ29udGV4dCBMaW5lc1wiKSwgVG9nZ2xlU2VhcmNoRWRpdG9yQ29udGV4dExpbmVzQ29tbWFuZElkKSxcblx0XHRcdGljb246IHNlYXJjaFNob3dDb250ZXh0SWNvbixcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHRcdC4uLmRlZmF1bHRUb2dnbGVTdHlsZXNcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zaG93Q29udGV4dFRvZ2dsZS5vbkNoYW5nZSgoKSA9PiB0aGlzLm9uQ29udGV4dExpbmVzQ2hhbmdlZCgpKSk7XG5cblx0XHRpZiAob3B0aW9ucy5zaG93Q29udGV4dFRvZ2dsZSkge1xuXHRcdFx0dGhpcy5jb250ZXh0TGluZXNJbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnB1dEJveChzZWFyY2hJbnB1dENvbnRhaW5lciwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHsgdHlwZTogJ251bWJlcicsIGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSkpO1xuXHRcdFx0dGhpcy5jb250ZXh0TGluZXNJbnB1dC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NvbnRleHQtbGluZXMtaW5wdXQnKTtcblx0XHRcdHRoaXMuY29udGV4dExpbmVzSW5wdXQudmFsdWUgPSAnJyArICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcz4oJ3NlYXJjaCcpLnNlYXJjaEVkaXRvci5kZWZhdWx0TnVtYmVyT2ZDb250ZXh0TGluZXMgPz8gMSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRMaW5lc0lucHV0Lm9uRGlkQ2hhbmdlKCh2YWx1ZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlmICh2YWx1ZSAhPT0gJzAnKSB7XG5cdFx0XHRcdFx0dGhpcy5zaG93Q29udGV4dFRvZ2dsZS5jaGVja2VkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLm9uQ29udGV4dExpbmVzQ2hhbmdlZCgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZG9tLmFwcGVuZChzZWFyY2hJbnB1dENvbnRhaW5lciwgdGhpcy5zaG93Q29udGV4dFRvZ2dsZS5kb21Ob2RlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uQ29udGV4dExpbmVzQ2hhbmdlZCgpIHtcblx0XHR0aGlzLl9vbkRpZFRvZ2dsZUNvbnRleHQuZmlyZSgpO1xuXG5cdFx0aWYgKHRoaXMuY29udGV4dExpbmVzSW5wdXQudmFsdWUuaW5jbHVkZXMoJy0nKSkge1xuXHRcdFx0dGhpcy5jb250ZXh0TGluZXNJbnB1dC52YWx1ZSA9ICcwJztcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZFRvZ2dsZUNvbnRleHQuZmlyZSgpO1xuXHR9XG5cblx0cHVibGljIHNldENvbnRleHRMaW5lcyhsaW5lczogbnVtYmVyKSB7XG5cdFx0aWYgKCF0aGlzLmNvbnRleHRMaW5lc0lucHV0KSB7IHJldHVybjsgfVxuXHRcdGlmIChsaW5lcyA9PT0gMCkge1xuXHRcdFx0dGhpcy5zaG93Q29udGV4dFRvZ2dsZS5jaGVja2VkID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2hvd0NvbnRleHRUb2dnbGUuY2hlY2tlZCA9IHRydWU7XG5cdFx0XHR0aGlzLmNvbnRleHRMaW5lc0lucHV0LnZhbHVlID0gJycgKyBsaW5lcztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclJlcGxhY2VJbnB1dChwYXJlbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBJU2VhcmNoV2lkZ2V0T3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMucmVwbGFjZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnLnJlcGxhY2UtY29udGFpbmVyLmRpc2FibGVkJykpO1xuXHRcdGNvbnN0IHJlcGxhY2VCb3ggPSBkb20uYXBwZW5kKHRoaXMucmVwbGFjZUNvbnRhaW5lciwgZG9tLiQoJy5yZXBsYWNlLWlucHV0JykpO1xuXG5cdFx0dGhpcy5yZXBsYWNlSW5wdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29udGV4dFNjb3BlZFJlcGxhY2VJbnB1dChyZXBsYWNlQm94LCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnbGFiZWwuUmVwbGFjZScsICdSZXBsYWNlOiBUeXBlIHJlcGxhY2UgdGVybSBhbmQgcHJlc3MgRW50ZXIgdG8gcHJldmlldycpLFxuXHRcdFx0cGxhY2Vob2xkZXI6IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnJlcGxhY2UucGxhY2VIb2xkZXInLCBcIlJlcGxhY2VcIiksXG5cdFx0XHRhcHBlbmRQcmVzZXJ2ZUNhc2VMYWJlbDogdGhpcy5rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKCcnLCBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Ub2dnbGVQcmVzZXJ2ZUNhc2VJZCksXG5cdFx0XHRoaXN0b3J5OiBuZXcgU2V0KG9wdGlvbnMucmVwbGFjZUhpc3RvcnkpLFxuXHRcdFx0c2hvd0hpc3RvcnlIaW50OiAoKSA9PiBzaG93SGlzdG9yeUtleWJpbmRpbmdIaW50KHRoaXMua2V5YmluZGluZ1NlcnZpY2UpLFxuXHRcdFx0ZmxleGlibGVIZWlnaHQ6IHRydWUsXG5cdFx0XHRmbGV4aWJsZU1heEhlaWdodDogU2VhcmNoV2lkZ2V0LklOUFVUX01BWF9IRUlHSFQsXG5cdFx0XHRpbnB1dEJveFN0eWxlczogb3B0aW9ucy5pbnB1dEJveFN0eWxlcyxcblx0XHRcdHRvZ2dsZVN0eWxlczogb3B0aW9ucy50b2dnbGVTdHlsZXMsXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnNcblx0XHR9LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0cnVlKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlcGxhY2VJbnB1dC5vbkRpZE9wdGlvbkNoYW5nZSh2aWFLZXlib2FyZCA9PiB7XG5cdFx0XHRpZiAoIXZpYUtleWJvYXJkKSB7XG5cdFx0XHRcdGlmICh0aGlzLnJlcGxhY2VJbnB1dCkge1xuXHRcdFx0XHRcdHRoaXMuX29uUHJlc2VydmVDYXNlQ2hhbmdlLmZpcmUodGhpcy5yZXBsYWNlSW5wdXQuZ2V0UHJlc2VydmVDYXNlKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZXBsYWNlSW5wdXQub25LZXlEb3duKChrZXlib2FyZEV2ZW50KSA9PiB0aGlzLm9uUmVwbGFjZUlucHV0S2V5RG93bihrZXlib2FyZEV2ZW50KSkpO1xuXHRcdHRoaXMucmVwbGFjZUlucHV0LnNldFZhbHVlKG9wdGlvbnMucmVwbGFjZVZhbHVlIHx8ICcnKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlcGxhY2VJbnB1dC5pbnB1dEJveC5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9vblJlcGxhY2VWYWx1ZUNoYW5nZWQuZmlyZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZXBsYWNlSW5wdXQuaW5wdXRCb3gub25EaWRIZWlnaHRDaGFuZ2UoKCkgPT4gdGhpcy5fb25EaWRIZWlnaHRDaGFuZ2UuZmlyZSgpKSk7XG5cblx0XHR0aGlzLnJlcGxhY2VBbGxBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVwbGFjZUFsbEFjdGlvbih0aGlzKSk7XG5cdFx0dGhpcy5yZXBsYWNlQWxsQWN0aW9uLmxhYmVsID0gU2VhcmNoV2lkZ2V0LlJFUExBQ0VfQUxMX0RJU0FCTEVEX0xBQkVMO1xuXHRcdHRoaXMucmVwbGFjZUFjdGlvbkJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIodGhpcy5yZXBsYWNlQ29udGFpbmVyKSk7XG5cdFx0dGhpcy5yZXBsYWNlQWN0aW9uQmFyLnB1c2goW3RoaXMucmVwbGFjZUFsbEFjdGlvbl0sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdHRoaXMub25rZXlkb3duKHRoaXMucmVwbGFjZUFjdGlvbkJhci5kb21Ob2RlLCAoa2V5Ym9hcmRFdmVudCkgPT4gdGhpcy5vblJlcGxhY2VBY3Rpb25iYXJLZXlEb3duKGtleWJvYXJkRXZlbnQpKTtcblxuXHRcdHRoaXMucmVwbGFjZUlucHV0Rm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoZG9tLnRyYWNrRm9jdXModGhpcy5yZXBsYWNlSW5wdXQuaW5wdXRCb3guaW5wdXRFbGVtZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZXBsYWNlSW5wdXRGb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB0aGlzLnJlcGxhY2VJbnB1dEJveEZvY3VzZWQuc2V0KHRydWUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZXBsYWNlSW5wdXRGb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHRoaXMucmVwbGFjZUlucHV0Qm94Rm9jdXNlZC5zZXQoZmFsc2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZXBsYWNlSW5wdXQub25QcmVzZXJ2ZUNhc2VLZXlEb3duKChrZXlib2FyZEV2ZW50OiBJS2V5Ym9hcmRFdmVudCkgPT4gdGhpcy5vblByZXNlcnZlQ2FzZUtleURvd24oa2V5Ym9hcmRFdmVudCkpKTtcblx0fVxuXG5cdHRyaWdnZXJSZXBsYWNlQWxsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX29uUmVwbGFjZUFsbC5maXJlKCk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblRvZ2dsZVJlcGxhY2VCdXR0b24oKTogdm9pZCB7XG5cdFx0dGhpcy5yZXBsYWNlQ29udGFpbmVyPy5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcpO1xuXHRcdGlmICh0aGlzLmlzUmVwbGFjZVNob3duKCkpIHtcblx0XHRcdHRoaXMudG9nZ2xlUmVwbGFjZUJ1dHRvbj8uZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHNlYXJjaEhpZGVSZXBsYWNlSWNvbikpO1xuXHRcdFx0dGhpcy50b2dnbGVSZXBsYWNlQnV0dG9uPy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoc2VhcmNoU2hvd1JlcGxhY2VJY29uKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudG9nZ2xlUmVwbGFjZUJ1dHRvbj8uZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHNlYXJjaFNob3dSZXBsYWNlSWNvbikpO1xuXHRcdFx0dGhpcy50b2dnbGVSZXBsYWNlQnV0dG9uPy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoc2VhcmNoSGlkZVJlcGxhY2VJY29uKSk7XG5cdFx0fVxuXHRcdHRoaXMudG9nZ2xlUmVwbGFjZUJ1dHRvbj8uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCB0aGlzLmlzUmVwbGFjZVNob3duKCkgPyAndHJ1ZScgOiAnZmFsc2UnKTtcblx0XHR0aGlzLnVwZGF0ZVJlcGxhY2VBY3RpdmVTdGF0ZSgpO1xuXHRcdHRoaXMuX29uUmVwbGFjZVRvZ2dsZWQuZmlyZSgpO1xuXHR9XG5cblx0c2V0VmFsdWUodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQ/LnNldFZhbHVlKHZhbHVlKTtcblx0fVxuXG5cdHNldFJlcGxhY2VBbGxBY3Rpb25TdGF0ZShlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucmVwbGFjZUFsbEFjdGlvbiAmJiAodGhpcy5yZXBsYWNlQWxsQWN0aW9uLmVuYWJsZWQgIT09IGVuYWJsZWQpKSB7XG5cdFx0XHR0aGlzLnJlcGxhY2VBbGxBY3Rpb24uZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0XHR0aGlzLnJlcGxhY2VBbGxBY3Rpb24ubGFiZWwgPSBlbmFibGVkID8gU2VhcmNoV2lkZ2V0LlJFUExBQ0VfQUxMX0VOQUJMRURfTEFCRUwodGhpcy5rZXliaW5kaW5nU2VydmljZSkgOiBTZWFyY2hXaWRnZXQuUkVQTEFDRV9BTExfRElTQUJMRURfTEFCRUw7XG5cdFx0XHR0aGlzLnVwZGF0ZVJlcGxhY2VBY3RpdmVTdGF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmVwbGFjZUFjdGl2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRoaXMuaXNSZXBsYWNlQWN0aXZlKCk7XG5cdFx0Y29uc3QgbmV3U3RhdGUgPSB0aGlzLmlzUmVwbGFjZVNob3duKCkgJiYgISF0aGlzLnJlcGxhY2VBbGxBY3Rpb24/LmVuYWJsZWQ7XG5cdFx0aWYgKGN1cnJlbnRTdGF0ZSAhPT0gbmV3U3RhdGUpIHtcblx0XHRcdHRoaXMucmVwbGFjZUFjdGl2ZS5zZXQobmV3U3RhdGUpO1xuXHRcdFx0dGhpcy5fb25SZXBsYWNlU3RhdGVDaGFuZ2UuZmlyZShuZXdTdGF0ZSk7XG5cdFx0XHR0aGlzLnJlcGxhY2VJbnB1dD8uaW5wdXRCb3gubGF5b3V0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZVNlYXJjaElucHV0KHZhbHVlOiBzdHJpbmcpOiBJTWVzc2FnZSB8IG51bGwge1xuXHRcdGlmICh2YWx1ZS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoISh0aGlzLnNlYXJjaElucHV0Py5nZXRSZWdleCgpKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRuZXcgUmVnRXhwKHZhbHVlLCAndScpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IGUubWVzc2FnZSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBvblNlYXJjaElucHV0Q2hhbmdlZCgpOiB2b2lkIHtcblx0XHR0aGlzLnNlYXJjaElucHV0Py5jbGVhck1lc3NhZ2UoKTtcblx0XHR0aGlzLnNldFJlcGxhY2VBbGxBY3Rpb25TdGF0ZShmYWxzZSk7XG5cblx0XHRpZiAodGhpcy5zZWFyY2hDb25maWd1cmF0aW9uLnNlYXJjaE9uVHlwZSkge1xuXHRcdFx0aWYgKHRoaXMuc2VhcmNoSW5wdXQ/LmdldFJlZ2V4KCkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAodGhpcy5zZWFyY2hJbnB1dC5nZXRWYWx1ZSgpLCAndWcnKTtcblx0XHRcdFx0XHRjb25zdCBtYXRjaGllbmVzc0hldXJpc3RpYyA9IGBcblx0XHRcdFx0XHRcdFx0XHR+IUAjJCVeJiooKV8rXG5cdFx0XHRcdFx0XHRcdFx0XFxgMTIzNDU2Nzg5MC09XG5cdFx0XHRcdFx0XHRcdFx0cXdlcnR5dWlvcFtdXFxcXFxuXHRcdFx0XHRcdFx0XHRcdFFXRVJUWVVJT1B7fXxcblx0XHRcdFx0XHRcdFx0XHRhc2RmZ2hqa2w7J1xuXHRcdFx0XHRcdFx0XHRcdEFTREZHSEpLTDpcIlxuXHRcdFx0XHRcdFx0XHRcdHp4Y3Zibm0sLi9cblx0XHRcdFx0XHRcdFx0XHRaWENWQk5NPD4/IGAubWF0Y2gocmVnZXgpPy5sZW5ndGggPz8gMDtcblxuXHRcdFx0XHRcdGNvbnN0IGRlbGF5TXVsdGlwbGllciA9XG5cdFx0XHRcdFx0XHRtYXRjaGllbmVzc0hldXJpc3RpYyA8IDUwID8gMSA6XG5cdFx0XHRcdFx0XHRcdG1hdGNoaWVuZXNzSGV1cmlzdGljIDwgMTAwID8gNSA6IC8vIGV4cHJlc3Npb25zIGxpa2UgYC5gIG9yIGBcXHdgXG5cdFx0XHRcdFx0XHRcdFx0MTA7IC8vIG9ubHkgdGhpbmdzIG1hdGNoaW5nIGVtcHR5IHN0cmluZ1xuXG5cblx0XHRcdFx0XHR0aGlzLnN1Ym1pdFNlYXJjaCh0cnVlLCB0aGlzLnNlYXJjaENvbmZpZ3VyYXRpb24uc2VhcmNoT25UeXBlRGVib3VuY2VQZXJpb2QgKiBkZWxheU11bHRpcGxpZXIpO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBwYXNzXG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc3VibWl0U2VhcmNoKHRydWUsIHRoaXMuc2VhcmNoQ29uZmlndXJhdGlvbi5zZWFyY2hPblR5cGVEZWJvdW5jZVBlcmlvZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblNlYXJjaElucHV0S2V5RG93bihrZXlib2FyZEV2ZW50OiBJS2V5Ym9hcmRFdmVudCkge1xuXHRcdGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhjdHJsS2V5TW9kIHwgS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdHRoaXMuc2VhcmNoSW5wdXQ/LmlucHV0Qm94Lmluc2VydEF0Q3Vyc29yKCdcXG4nKTtcblx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHR9XG5cblx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdHRoaXMuc2VhcmNoSW5wdXQ/Lm9uU2VhcmNoU3VibWl0KCk7XG5cdFx0XHR0aGlzLnN1Ym1pdFNlYXJjaCgpO1xuXHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSkge1xuXHRcdFx0dGhpcy5fb25TZWFyY2hDYW5jZWwuZmlyZSh7IGZvY3VzOiB0cnVlIH0pO1xuXHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuVGFiKSkge1xuXHRcdFx0aWYgKHRoaXMuaXNSZXBsYWNlU2hvd24oKSkge1xuXHRcdFx0XHR0aGlzLnJlcGxhY2VJbnB1dD8uZm9jdXMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2VhcmNoSW5wdXQ/LmZvY3VzT25DYXNlU2Vuc2l0aXZlKCk7XG5cdFx0XHR9XG5cdFx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5VcEFycm93KSkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRzdG9wUHJvcGFnYXRpb25Gb3JNdWx0aUxpbmVVcHdhcmRzKGtleWJvYXJkRXZlbnQsIHRoaXMuc2VhcmNoSW5wdXQ/LmdldFZhbHVlKCkgPz8gJycsIHRoaXMuc2VhcmNoSW5wdXQ/LmRvbU5vZGUucXVlcnlTZWxlY3RvcigndGV4dGFyZWEnKSA/PyBudWxsKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkRvd25BcnJvdykpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0c3RvcFByb3BhZ2F0aW9uRm9yTXVsdGlMaW5lRG93bndhcmRzKGtleWJvYXJkRXZlbnQsIHRoaXMuc2VhcmNoSW5wdXQ/LmdldFZhbHVlKCkgPz8gJycsIHRoaXMuc2VhcmNoSW5wdXQ/LmRvbU5vZGUucXVlcnlTZWxlY3RvcigndGV4dGFyZWEnKSA/PyBudWxsKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlBhZ2VVcCkpIHtcblx0XHRcdGNvbnN0IGlucHV0RWxlbWVudCA9IHRoaXMuc2VhcmNoSW5wdXQ/LmlucHV0Qm94LmlucHV0RWxlbWVudDtcblx0XHRcdGlmIChpbnB1dEVsZW1lbnQpIHtcblx0XHRcdFx0aW5wdXRFbGVtZW50LnNldFNlbGVjdGlvblJhbmdlKDAsIDApO1xuXHRcdFx0XHRpbnB1dEVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGVsc2UgaWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuUGFnZURvd24pKSB7XG5cdFx0XHRjb25zdCBpbnB1dEVsZW1lbnQgPSB0aGlzLnNlYXJjaElucHV0Py5pbnB1dEJveC5pbnB1dEVsZW1lbnQ7XG5cdFx0XHRpZiAoaW5wdXRFbGVtZW50KSB7XG5cdFx0XHRcdGNvbnN0IGVuZE9mVGV4dCA9IGlucHV0RWxlbWVudC52YWx1ZS5sZW5ndGg7XG5cdFx0XHRcdGlucHV0RWxlbWVudC5zZXRTZWxlY3Rpb25SYW5nZShlbmRPZlRleHQsIGVuZE9mVGV4dCk7XG5cdFx0XHRcdGlucHV0RWxlbWVudC5mb2N1cygpO1xuXHRcdFx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkNhc2VTZW5zaXRpdmVLZXlEb3duKGtleWJvYXJkRXZlbnQ6IElLZXlib2FyZEV2ZW50KSB7XG5cdFx0aWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiKSkge1xuXHRcdFx0aWYgKHRoaXMuaXNSZXBsYWNlU2hvd24oKSkge1xuXHRcdFx0XHR0aGlzLnJlcGxhY2VJbnB1dD8uZm9jdXMoKTtcblx0XHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25SZWdleEtleURvd24oa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpIHtcblx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5UYWIpKSB7XG5cdFx0XHRpZiAodGhpcy5pc1JlcGxhY2VTaG93bigpKSB7XG5cdFx0XHRcdHRoaXMucmVwbGFjZUlucHV0Py5mb2N1c09uUHJlc2VydmUoKTtcblx0XHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25QcmVzZXJ2ZUNhc2VLZXlEb3duKGtleWJvYXJkRXZlbnQ6IElLZXlib2FyZEV2ZW50KSB7XG5cdFx0aWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuVGFiKSkge1xuXHRcdFx0aWYgKHRoaXMuaXNSZXBsYWNlQWN0aXZlKCkpIHtcblx0XHRcdFx0dGhpcy5mb2N1c1JlcGxhY2VBbGxBY3Rpb24oKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29uQmx1ci5maXJlKCk7XG5cdFx0XHR9XG5cdFx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiKSkge1xuXHRcdFx0dGhpcy5mb2N1c1JlZ2V4QWN0aW9uKCk7XG5cdFx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblJlcGxhY2VJbnB1dEtleURvd24oa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpIHtcblx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoY3RybEtleU1vZCB8IEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHR0aGlzLnJlcGxhY2VJbnB1dD8uaW5wdXRCb3guaW5zZXJ0QXRDdXJzb3IoJ1xcbicpO1xuXHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH1cblxuXHRcdGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0dGhpcy5zdWJtaXRTZWFyY2goKTtcblx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlRhYikpIHtcblx0XHRcdHRoaXMuc2VhcmNoSW5wdXQ/LmZvY3VzT25DYXNlU2Vuc2l0aXZlKCk7XG5cdFx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWIpKSB7XG5cdFx0XHR0aGlzLnNlYXJjaElucHV0Py5mb2N1cygpO1xuXHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuVXBBcnJvdykpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0c3RvcFByb3BhZ2F0aW9uRm9yTXVsdGlMaW5lVXB3YXJkcyhrZXlib2FyZEV2ZW50LCB0aGlzLnJlcGxhY2VJbnB1dD8uZ2V0VmFsdWUoKSA/PyAnJywgdGhpcy5yZXBsYWNlSW5wdXQ/LmRvbU5vZGUucXVlcnlTZWxlY3RvcigndGV4dGFyZWEnKSA/PyBudWxsKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkRvd25BcnJvdykpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0c3RvcFByb3BhZ2F0aW9uRm9yTXVsdGlMaW5lRG93bndhcmRzKGtleWJvYXJkRXZlbnQsIHRoaXMucmVwbGFjZUlucHV0Py5nZXRWYWx1ZSgpID8/ICcnLCB0aGlzLnJlcGxhY2VJbnB1dD8uZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCd0ZXh0YXJlYScpID8/IG51bGwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25SZXBsYWNlQWN0aW9uYmFyS2V5RG93bihrZXlib2FyZEV2ZW50OiBJS2V5Ym9hcmRFdmVudCkge1xuXHRcdGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlRhYikpIHtcblx0XHRcdHRoaXMuZm9jdXNSZWdleEFjdGlvbigpO1xuXHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3VibWl0U2VhcmNoKHRyaWdnZXJlZE9uVHlwZSA9IGZhbHNlLCBkZWxheTogbnVtYmVyID0gMCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQ/LnZhbGlkYXRlKCk7XG5cdFx0aWYgKCF0aGlzLnNlYXJjaElucHV0Py5pbnB1dEJveC5pc0lucHV0VmFsaWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5zZWFyY2hJbnB1dC5nZXRWYWx1ZSgpO1xuXHRcdGNvbnN0IHVzZUdsb2JhbEZpbmRCdWZmZXIgPSB0aGlzLnNlYXJjaENvbmZpZ3VyYXRpb24uZ2xvYmFsRmluZENsaXBib2FyZDtcblx0XHRpZiAodmFsdWUgJiYgdXNlR2xvYmFsRmluZEJ1ZmZlcikge1xuXHRcdFx0YXdhaXQgdGhpcy5jbGlwYm9hcmRTZXJ2Y2Uud3JpdGVGaW5kVGV4dCh2YWx1ZSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uU2VhcmNoU3VibWl0LmZpcmUoeyB0cmlnZ2VyZWRPblR5cGUsIGRlbGF5IH0pO1xuXHR9XG5cblx0Z2V0Q29udGV4dExpbmVzKCkge1xuXHRcdHJldHVybiB0aGlzLnNob3dDb250ZXh0VG9nZ2xlLmNoZWNrZWQgPyArdGhpcy5jb250ZXh0TGluZXNJbnB1dC52YWx1ZSA6IDA7XG5cdH1cblxuXHRtb2RpZnlDb250ZXh0TGluZXMoaW5jcmVhc2U6IGJvb2xlYW4pIHtcblx0XHRjb25zdCBjdXJyZW50ID0gK3RoaXMuY29udGV4dExpbmVzSW5wdXQudmFsdWU7XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBjdXJyZW50ICsgKGluY3JlYXNlID8gMSA6IC0xKTtcblx0XHR0aGlzLnNob3dDb250ZXh0VG9nZ2xlLmNoZWNrZWQgPSBtb2RpZmllZCAhPT0gMDtcblx0XHR0aGlzLmNvbnRleHRMaW5lc0lucHV0LnZhbHVlID0gJycgKyBtb2RpZmllZDtcblx0fVxuXG5cdHRvZ2dsZUNvbnRleHRMaW5lcygpIHtcblx0XHR0aGlzLnNob3dDb250ZXh0VG9nZ2xlLmNoZWNrZWQgPSAhdGhpcy5zaG93Q29udGV4dFRvZ2dsZS5jaGVja2VkO1xuXHRcdHRoaXMub25Db250ZXh0TGluZXNDaGFuZ2VkKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0UmVwbGFjZUFsbEFjdGlvblN0YXRlKGZhbHNlKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBzZWFyY2hDb25maWd1cmF0aW9uKCk6IElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcyB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzPignc2VhcmNoJyk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29udHJpYnV0aW9ucygpIHtcblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IFJlcGxhY2VBbGxBY3Rpb24uSUQsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdWaXNpYmxlS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5SZXBsYWNlQWN0aXZlS2V5LCBDT05URVhUX0ZJTkRfV0lER0VUX05PVF9WSVNJQkxFKSxcblx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdGhhbmRsZXI6IGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRcdGlmIChpc1NlYXJjaFZpZXdGb2N1c2VkKHZpZXdzU2VydmljZSkpIHtcblx0XHRcdFx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcodmlld3NTZXJ2aWNlKTtcblx0XHRcdFx0aWYgKHNlYXJjaFZpZXcpIHtcblx0XHRcdFx0XHRuZXcgUmVwbGFjZUFsbEFjdGlvbihzZWFyY2hWaWV3LnNlYXJjaEFuZFJlcGxhY2VXaWRnZXQpLnJ1bigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksU0FBUztBQUVyQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGNBQThCO0FBR3ZDLFNBQW9DLGdCQUFnQjtBQUNwRCxTQUFTLGNBQWM7QUFDdkIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsU0FBUyx5QkFBeUI7QUFDM0MsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUE2QiwwQkFBMEI7QUFDaEUsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCLHdCQUF3QjtBQUV0RCxTQUFTLGlCQUFpQjtB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
