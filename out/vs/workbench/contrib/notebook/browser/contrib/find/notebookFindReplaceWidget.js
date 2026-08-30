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
import * as nls from "../../../../../../nls.js";
import * as dom from "../../../../../../base/browser/dom.js";
import "./notebookFindReplaceWidget.css";
import { ActionBar } from "../../../../../../base/browser/ui/actionbar/actionbar.js";
import { AnchorAlignment } from "../../../../../../base/browser/ui/contextview/contextview.js";
import { DropdownMenuActionViewItem } from "../../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { FindInput } from "../../../../../../base/browser/ui/findinput/findInput.js";
import { ProgressBar } from "../../../../../../base/browser/ui/progressbar/progressbar.js";
import { Orientation, Sash } from "../../../../../../base/browser/ui/sash/sash.js";
import { Toggle } from "../../../../../../base/browser/ui/toggle/toggle.js";
import { Widget } from "../../../../../../base/browser/ui/widget.js";
import { Action, ActionRunner, Separator } from "../../../../../../base/common/actions.js";
import { Delayer } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { KeyCode } from "../../../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { isSafari } from "../../../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { FindReplaceState } from "../../../../../../editor/contrib/find/browser/findState.js";
import { findNextMatchIcon, findPreviousMatchIcon, findReplaceAllIcon, findReplaceIcon, findSelectionIcon, SimpleButton } from "../../../../../../editor/contrib/find/browser/findWidget.js";
import { parseReplaceString, ReplacePattern } from "../../../../../../editor/contrib/find/browser/replacePattern.js";
import { getActionBarActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../../../platform/contextview/browser/contextView.js";
import { ContextScopedReplaceInput, registerAndCreateHistoryNavigationContext } from "../../../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { defaultInputBoxStyles, defaultProgressBarStyles, defaultToggleStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { asCssVariable, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground } from "../../../../../../platform/theme/common/colorRegistry.js";
import { registerIcon, widgetClose } from "../../../../../../platform/theme/common/iconRegistry.js";
import { registerThemingParticipant } from "../../../../../../platform/theme/common/themeService.js";
import { filterIcon } from "../../../../extensions/browser/extensionsIcons.js";
import { NotebookFindFilters } from "./findFilters.js";
import { NotebookFindScopeType, NotebookSetting } from "../../../common/notebookCommon.js";
const NLS_FIND_INPUT_LABEL = nls.localize("label.find", "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize("placeholder.find", "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize("label.previousMatchButton", "Previous Match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize("label.nextMatchButton", "Next Match");
const NLS_TOGGLE_SELECTION_FIND_TITLE = nls.localize("label.toggleSelectionFind", "Find in Selection");
const NLS_CLOSE_BTN_LABEL = nls.localize("label.closeButton", "Close");
const NLS_TOGGLE_REPLACE_MODE_BTN_LABEL = nls.localize("label.toggleReplaceButton", "Toggle Replace");
const NLS_REPLACE_INPUT_LABEL = nls.localize("label.replace", "Replace");
const NLS_REPLACE_INPUT_PLACEHOLDER = nls.localize("placeholder.replace", "Replace");
const NLS_REPLACE_BTN_LABEL = nls.localize("label.replaceButton", "Replace");
const NLS_REPLACE_ALL_BTN_LABEL = nls.localize("label.replaceAllButton", "Replace All");
const findFilterButton = registerIcon("find-filter", Codicon.filter, nls.localize("findFilterIcon", "Icon for Find Filter in find widget."));
const NOTEBOOK_FIND_FILTERS = nls.localize("notebook.find.filter.filterAction", "Find Filters");
const NOTEBOOK_FIND_IN_MARKUP_INPUT = nls.localize("notebook.find.filter.findInMarkupInput", "Markdown Source");
const NOTEBOOK_FIND_IN_MARKUP_PREVIEW = nls.localize("notebook.find.filter.findInMarkupPreview", "Rendered Markdown");
const NOTEBOOK_FIND_IN_CODE_INPUT = nls.localize("notebook.find.filter.findInCodeInput", "Code Cell Source");
const NOTEBOOK_FIND_IN_CODE_OUTPUT = nls.localize("notebook.find.filter.findInCodeOutput", "Code Cell Output");
const NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH = 419;
const NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING = 4;
let NotebookFindFilterActionViewItem = class extends DropdownMenuActionViewItem {
  constructor(filters, action, options, actionRunner, contextMenuService) {
    super(
      action,
      { getActions: () => this.getActions() },
      contextMenuService,
      {
        ...options,
        actionRunner,
        classNames: action.class,
        anchorAlignmentProvider: () => AnchorAlignment.RIGHT
      }
    );
    this.filters = filters;
  }
  render(container) {
    super.render(container);
    this.updateChecked();
  }
  getActions() {
    const markdownInput = {
      checked: this.filters.markupInput,
      class: void 0,
      enabled: true,
      id: "findInMarkdownInput",
      label: NOTEBOOK_FIND_IN_MARKUP_INPUT,
      run: async () => {
        this.filters.markupInput = !this.filters.markupInput;
      },
      tooltip: ""
    };
    const markdownPreview = {
      checked: this.filters.markupPreview,
      class: void 0,
      enabled: true,
      id: "findInMarkdownInput",
      label: NOTEBOOK_FIND_IN_MARKUP_PREVIEW,
      run: async () => {
        this.filters.markupPreview = !this.filters.markupPreview;
      },
      tooltip: ""
    };
    const codeInput = {
      checked: this.filters.codeInput,
      class: void 0,
      enabled: true,
      id: "findInCodeInput",
      label: NOTEBOOK_FIND_IN_CODE_INPUT,
      run: async () => {
        this.filters.codeInput = !this.filters.codeInput;
      },
      tooltip: ""
    };
    const codeOutput = {
      checked: this.filters.codeOutput,
      class: void 0,
      enabled: true,
      id: "findInCodeOutput",
      label: NOTEBOOK_FIND_IN_CODE_OUTPUT,
      run: async () => {
        this.filters.codeOutput = !this.filters.codeOutput;
      },
      tooltip: "",
      dispose: () => null
    };
    if (isSafari) {
      return [
        markdownInput,
        codeInput
      ];
    } else {
      return [
        markdownInput,
        markdownPreview,
        new Separator(),
        codeInput,
        codeOutput
      ];
    }
  }
  updateChecked() {
    this.element.classList.toggle("checked", this._action.checked);
  }
};
NotebookFindFilterActionViewItem = __decorateClass([
  __decorateParam(4, IContextMenuService)
], NotebookFindFilterActionViewItem);
class NotebookFindInputFilterButton extends Disposable {
  constructor(filters, contextMenuService, instantiationService, options, tooltip = NOTEBOOK_FIND_FILTERS) {
    super();
    this.filters = filters;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this._actionbar = null;
    this._toggleStyles = options.toggleStyles;
    this._filtersAction = this._register(new Action("notebookFindFilterAction", tooltip, "notebook-filters " + ThemeIcon.asClassName(filterIcon)));
    this._filtersAction.checked = false;
    this._filterButtonContainer = dom.$(".find-filter-button");
    this._filterButtonContainer.classList.add("monaco-custom-toggle");
    this.createFilters(this._filterButtonContainer);
  }
  get container() {
    return this._filterButtonContainer;
  }
  width() {
    return 2 + 2 + 2 + 16;
  }
  enable() {
    this.container.setAttribute("aria-disabled", String(false));
  }
  disable() {
    this.container.setAttribute("aria-disabled", String(true));
  }
  set visible(visible) {
    this._filterButtonContainer.style.display = visible ? "" : "none";
  }
  get visible() {
    return this._filterButtonContainer.style.display !== "none";
  }
  applyStyles(filterChecked) {
    const toggleStyles = this._toggleStyles;
    this._filterButtonContainer.style.border = "1px solid transparent";
    this._filterButtonContainer.style.borderRadius = "3px";
    this._filterButtonContainer.style.borderColor = filterChecked && toggleStyles.inputActiveOptionBorder || "";
    this._filterButtonContainer.style.color = filterChecked && toggleStyles.inputActiveOptionForeground || "inherit";
    this._filterButtonContainer.style.backgroundColor = filterChecked && toggleStyles.inputActiveOptionBackground || "";
  }
  createFilters(container) {
    this._actionbar = this._register(new ActionBar(container, {
      actionViewItemProvider: (action, options) => {
        if (action.id === this._filtersAction.id) {
          return this.instantiationService.createInstance(NotebookFindFilterActionViewItem, this.filters, action, options, this._register(new ActionRunner()));
        }
        return void 0;
      }
    }));
    this._actionbar.push(this._filtersAction, { icon: true, label: false });
  }
}
class NotebookFindInput extends FindInput {
  constructor(filters, contextKeyService, contextMenuService, instantiationService, parent, contextViewProvider, options) {
    super(parent, contextViewProvider, options);
    this.filters = filters;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this._filterChecked = false;
    this._register(registerAndCreateHistoryNavigationContext(contextKeyService, this.inputBox));
    this._findFilter = this._register(new NotebookFindInputFilterButton(filters, contextMenuService, instantiationService, options));
    this.inputBox.paddingRight = (this.caseSensitive?.width() ?? 0) + (this.wholeWords?.width() ?? 0) + (this.regex?.width() ?? 0) + this._findFilter.width();
    this.controls.appendChild(this._findFilter.container);
  }
  setEnabled(enabled) {
    super.setEnabled(enabled);
    if (enabled && !this._filterChecked) {
      this.regex?.enable();
    } else {
      this.regex?.disable();
    }
  }
  updateFilterState(changed) {
    this._filterChecked = changed;
    if (this.regex) {
      if (this._filterChecked) {
        this.regex.disable();
        this.regex.domNode.tabIndex = -1;
        this.regex.domNode.classList.toggle("disabled", true);
      } else {
        this.regex.enable();
        this.regex.domNode.tabIndex = 0;
        this.regex.domNode.classList.toggle("disabled", false);
      }
    }
    this._findFilter.applyStyles(this._filterChecked);
  }
  getToggleDomNodes() {
    const nodes = super.getToggleDomNodes();
    nodes.push(this._findFilter.container);
    return nodes;
  }
  getCellToolbarActions(menu) {
    return getActionBarActions(menu.getActions({ shouldForwardArgs: true }), (g) => /^inline/.test(g));
  }
}
let SimpleFindReplaceWidget = class extends Widget {
  constructor(_contextViewService, contextKeyService, _configurationService, contextMenuService, instantiationService, hoverService, _state = new FindReplaceState(), _notebookEditor, _findWidgetSearchHistory, _replaceWidgetHistory) {
    super();
    this._contextViewService = _contextViewService;
    this._configurationService = _configurationService;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this._state = _state;
    this._notebookEditor = _notebookEditor;
    this._findWidgetSearchHistory = _findWidgetSearchHistory;
    this._replaceWidgetHistory = _replaceWidgetHistory;
    this._resizeOriginalWidth = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;
    this._isVisible = false;
    this._isReplaceVisible = false;
    this.foundMatch = false;
    this.cellSelectionDecorationIds = [];
    this.textSelectionDecorationIds = [];
    this._register(this._state);
    const findFilters = this._configurationService.getValue(NotebookSetting.findFilters) ?? { markupSource: true, markupPreview: true, codeSource: true, codeOutput: true };
    const findHistoryConfig = this._configurationService.getValue("editor.find.history");
    const replaceHistoryConfig = this._configurationService.getValue("editor.find.replaceHistory");
    this._filters = this._register(new NotebookFindFilters(findFilters.markupSource, findFilters.markupPreview, findFilters.codeSource, findFilters.codeOutput, { findScopeType: NotebookFindScopeType.None }));
    this._state.change({ filters: this._filters }, false);
    this._register(this._filters.onDidChange(() => {
      this._state.change({ filters: this._filters }, false);
    }));
    this._domNode = document.createElement("div");
    this._domNode.classList.add("simple-fr-find-part-wrapper");
    this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, (e) => {
      if (!e || e.affectsConfiguration(NotebookSetting.globalToolbar)) {
        if (this._notebookEditor.notebookOptions.getLayoutConfiguration().globalToolbar) {
          this._domNode.style.top = "26px";
        } else {
          this._domNode.style.top = "0px";
        }
      }
    }));
    this._register(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));
    this._scopedContextKeyService = this._register(contextKeyService.createScoped(this._domNode));
    const progressContainer = dom.$(".find-replace-progress");
    this._progressBar = this._register(new ProgressBar(progressContainer, defaultProgressBarStyles));
    this._domNode.appendChild(progressContainer);
    const isInteractiveWindow = contextKeyService.getContextKeyValue("notebookType") === "interactive";
    const hoverLifecycleOptions = { groupId: "simple-find-widget" };
    this._toggleReplaceBtn = this._register(new SimpleButton({
      label: NLS_TOGGLE_REPLACE_MODE_BTN_LABEL,
      className: "codicon toggle left",
      hoverLifecycleOptions,
      onTrigger: isInteractiveWindow ? () => {
      } : () => {
        this._isReplaceVisible = !this._isReplaceVisible;
        this._state.change({ isReplaceRevealed: this._isReplaceVisible }, false);
        this._updateReplaceViewDisplay();
      }
    }, hoverService));
    this._toggleReplaceBtn.setEnabled(!isInteractiveWindow);
    this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);
    this._domNode.appendChild(this._toggleReplaceBtn.domNode);
    this._innerFindDomNode = document.createElement("div");
    this._innerFindDomNode.classList.add("simple-fr-find-part");
    this._findInput = this._register(new NotebookFindInput(
      this._filters,
      this._scopedContextKeyService,
      this.contextMenuService,
      this.instantiationService,
      null,
      this._contextViewService,
      {
        // width:FIND_INPUT_AREA_WIDTH,
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
            this.foundMatch = false;
            this.updateButtons(this.foundMatch);
            return { content: e.message };
          }
        },
        flexibleWidth: true,
        showCommonFindToggles: true,
        inputBoxStyles: defaultInputBoxStyles,
        toggleStyles: defaultToggleStyles,
        history: findHistoryConfig === "workspace" ? this._findWidgetSearchHistory : /* @__PURE__ */ new Set([])
      }
    ));
    this._updateFindHistoryDelayer = new Delayer(500);
    this.oninput(this._findInput.domNode, (e) => {
      this.foundMatch = this.onInputChanged();
      this.updateButtons(this.foundMatch);
      this._delayedUpdateFindHistory();
    });
    this._register(this._findInput.inputBox.onDidChange(() => {
      this._state.change({ searchString: this._findInput.getValue() }, true);
    }));
    this._findInput.setRegex(!!this._state.isRegex);
    this._findInput.setCaseSensitive(!!this._state.matchCase);
    this._findInput.setWholeWords(!!this._state.wholeWord);
    this._register(this._findInput.onDidOptionChange(() => {
      this._state.change({
        isRegex: this._findInput.getRegex(),
        wholeWord: this._findInput.getWholeWords(),
        matchCase: this._findInput.getCaseSensitive()
      }, true);
    }));
    this._register(this._state.onFindReplaceStateChange(() => {
      this._findInput.setRegex(this._state.isRegex);
      this._findInput.setWholeWords(this._state.wholeWord);
      this._findInput.setCaseSensitive(this._state.matchCase);
      this._replaceInput.setPreserveCase(this._state.preserveCase);
    }));
    this._matchesCount = document.createElement("div");
    this._matchesCount.className = "matchesCount";
    this._updateMatchesCount();
    this.prevBtn = this._register(new SimpleButton({
      label: NLS_PREVIOUS_MATCH_BTN_LABEL,
      icon: findPreviousMatchIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this.find(true);
      }
    }, hoverService));
    this.nextBtn = this._register(new SimpleButton({
      label: NLS_NEXT_MATCH_BTN_LABEL,
      icon: findNextMatchIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this.find(false);
      }
    }, hoverService));
    this.inSelectionToggle = this._register(new Toggle({
      icon: findSelectionIcon,
      title: NLS_TOGGLE_SELECTION_FIND_TITLE,
      isChecked: false,
      hoverLifecycleOptions,
      inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground),
      inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
      inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground)
    }));
    this.inSelectionToggle.domNode.style.display = "inline";
    this._register(this.inSelectionToggle.onChange(() => {
      const checked = this.inSelectionToggle.checked;
      if (checked) {
        const cellSelection = this._notebookEditor.getSelections();
        const textSelection = this._notebookEditor.getSelectionViewModels()[0].getSelections();
        if (cellSelection.length > 1 || cellSelection.some((range) => range.end - range.start > 1)) {
          this._filters.findScope = {
            findScopeType: NotebookFindScopeType.Cells,
            selectedCellRanges: cellSelection
          };
          this.setCellSelectionDecorations();
        } else if (textSelection.length > 1 || textSelection.some((range) => range.endLineNumber - range.startLineNumber >= 1)) {
          this._filters.findScope = {
            findScopeType: NotebookFindScopeType.Text,
            selectedCellRanges: cellSelection,
            selectedTextRanges: textSelection
          };
          this.setTextSelectionDecorations(textSelection, this._notebookEditor.getSelectionViewModels()[0]);
        } else {
          this._filters.findScope = {
            findScopeType: NotebookFindScopeType.Cells,
            selectedCellRanges: cellSelection
          };
          this.setCellSelectionDecorations();
        }
      } else {
        this._filters.findScope = {
          findScopeType: NotebookFindScopeType.None
        };
        this.clearCellSelectionDecorations();
        this.clearTextSelectionDecorations();
      }
    }));
    const closeBtn = this._register(new SimpleButton({
      label: NLS_CLOSE_BTN_LABEL,
      icon: widgetClose,
      hoverLifecycleOptions,
      onTrigger: () => {
        this.hide();
      }
    }, hoverService));
    this._innerFindDomNode.appendChild(this._findInput.domNode);
    this._innerFindDomNode.appendChild(this._matchesCount);
    this._innerFindDomNode.appendChild(this.prevBtn.domNode);
    this._innerFindDomNode.appendChild(this.nextBtn.domNode);
    this._innerFindDomNode.appendChild(this.inSelectionToggle.domNode);
    this._innerFindDomNode.appendChild(closeBtn.domNode);
    this._domNode.appendChild(this._innerFindDomNode);
    this.onkeyup(this._innerFindDomNode, (e) => {
      if (e.equals(KeyCode.Escape)) {
        this.hide();
        e.preventDefault();
        return;
      }
    });
    this._focusTracker = this._register(dom.trackFocus(this._domNode));
    this._register(this._focusTracker.onDidFocus(this.onFocusTrackerFocus.bind(this)));
    this._register(this._focusTracker.onDidBlur(this.onFocusTrackerBlur.bind(this)));
    this._findInputFocusTracker = this._register(dom.trackFocus(this._findInput.domNode));
    this._register(this._findInputFocusTracker.onDidFocus(this.onFindInputFocusTrackerFocus.bind(this)));
    this._register(this._findInputFocusTracker.onDidBlur(this.onFindInputFocusTrackerBlur.bind(this)));
    this._register(dom.addDisposableListener(this._innerFindDomNode, "click", (event) => {
      event.stopPropagation();
    }));
    this._innerReplaceDomNode = document.createElement("div");
    this._innerReplaceDomNode.classList.add("simple-fr-replace-part");
    this._replaceInput = this._register(new ContextScopedReplaceInput(null, void 0, {
      label: NLS_REPLACE_INPUT_LABEL,
      placeholder: NLS_REPLACE_INPUT_PLACEHOLDER,
      history: replaceHistoryConfig === "workspace" ? this._replaceWidgetHistory : /* @__PURE__ */ new Set([]),
      inputBoxStyles: defaultInputBoxStyles,
      toggleStyles: defaultToggleStyles,
      hoverLifecycleOptions
    }, contextKeyService, false));
    this._innerReplaceDomNode.appendChild(this._replaceInput.domNode);
    this._replaceInputFocusTracker = this._register(dom.trackFocus(this._replaceInput.domNode));
    this._register(this._replaceInputFocusTracker.onDidFocus(this.onReplaceInputFocusTrackerFocus.bind(this)));
    this._register(this._replaceInputFocusTracker.onDidBlur(this.onReplaceInputFocusTrackerBlur.bind(this)));
    this._updateReplaceHistoryDelayer = new Delayer(500);
    this.oninput(this._replaceInput.domNode, (e) => {
      this._delayedUpdateReplaceHistory();
    });
    this._register(this._replaceInput.inputBox.onDidChange(() => {
      this._state.change({ replaceString: this._replaceInput.getValue() }, true);
    }));
    this._domNode.appendChild(this._innerReplaceDomNode);
    this._updateReplaceViewDisplay();
    this._replaceBtn = this._register(new SimpleButton({
      label: NLS_REPLACE_BTN_LABEL,
      icon: findReplaceIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this.replaceOne();
      }
    }, hoverService));
    this._replaceAllBtn = this._register(new SimpleButton({
      label: NLS_REPLACE_ALL_BTN_LABEL,
      icon: findReplaceAllIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this.replaceAll();
      }
    }, hoverService));
    this._innerReplaceDomNode.appendChild(this._replaceBtn.domNode);
    this._innerReplaceDomNode.appendChild(this._replaceAllBtn.domNode);
    this._resizeSash = this._register(new Sash(this._domNode, { getVerticalSashLeft: () => 0 }, { orientation: Orientation.VERTICAL, size: 2 }));
    this._register(this._resizeSash.onDidStart(() => {
      this._resizeOriginalWidth = this._getDomWidth();
    }));
    this._register(this._resizeSash.onDidChange((evt) => {
      let width = this._resizeOriginalWidth + evt.startX - evt.currentX;
      if (width < NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH) {
        width = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;
      }
      const maxWidth = this._getMaxWidth();
      if (width > maxWidth) {
        width = maxWidth;
      }
      this._domNode.style.width = `${width}px`;
      if (this._isReplaceVisible) {
        this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
      }
      this._findInput.inputBox.layout();
    }));
    this._register(this._resizeSash.onDidReset(() => {
      const currentWidth = this._getDomWidth();
      let width = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;
      if (currentWidth <= NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH) {
        width = this._getMaxWidth();
      }
      this._domNode.style.width = `${width}px`;
      if (this._isReplaceVisible) {
        this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
      }
      this._findInput.inputBox.layout();
    }));
  }
  _getMaxWidth() {
    return this._notebookEditor.getLayoutInfo().width - 64;
  }
  _getDomWidth() {
    return dom.getTotalWidth(this._domNode) - NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING * 2;
  }
  getCellToolbarActions(menu) {
    return getActionBarActions(menu.getActions({ shouldForwardArgs: true }), (g) => /^inline/.test(g));
  }
  get inputValue() {
    return this._findInput.getValue();
  }
  get replaceValue() {
    return this._replaceInput.getValue();
  }
  get replacePattern() {
    if (this._state.isRegex) {
      return parseReplaceString(this.replaceValue);
    }
    return ReplacePattern.fromStaticValue(this.replaceValue);
  }
  get focusTracker() {
    return this._focusTracker;
  }
  get isVisible() {
    return this._isVisible;
  }
  _onStateChanged(e) {
    this._updateButtons();
    this._updateMatchesCount();
  }
  _updateButtons() {
    this._findInput.setEnabled(this._isVisible);
    this._replaceInput.setEnabled(this._isVisible && this._isReplaceVisible);
    const findInputIsNonEmpty = this._state.searchString.length > 0;
    this._replaceBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);
    this._replaceAllBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);
    this._domNode.classList.toggle("replaceToggled", this._isReplaceVisible);
    this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);
    this.foundMatch = this._state.matchesCount > 0;
    this.updateButtons(this.foundMatch);
  }
  setCellSelectionDecorations() {
    const cellHandles = [];
    this._notebookEditor.getSelectionViewModels().forEach((viewModel) => {
      cellHandles.push(viewModel.handle);
    });
    const decorations = [];
    for (const handle of cellHandles) {
      decorations.push({
        handle,
        options: { className: "nb-multiCellHighlight", outputClassName: "nb-multiCellHighlight" }
      });
    }
    this.cellSelectionDecorationIds = this._notebookEditor.deltaCellDecorations([], decorations);
  }
  clearCellSelectionDecorations() {
    this._notebookEditor.deltaCellDecorations(this.cellSelectionDecorationIds, []);
  }
  setTextSelectionDecorations(textRanges, cell) {
    this._notebookEditor.changeModelDecorations((changeAccessor) => {
      const decorations = [];
      for (const range of textRanges) {
        decorations.push({
          ownerId: cell.handle,
          decorations: [{
            range,
            options: {
              description: "text search range for notebook search scope",
              isWholeLine: true,
              className: "nb-findScope"
            }
          }]
        });
      }
      this.textSelectionDecorationIds = changeAccessor.deltaDecorations([], decorations);
    });
  }
  clearTextSelectionDecorations() {
    this._notebookEditor.changeModelDecorations((changeAccessor) => {
      changeAccessor.deltaDecorations(this.textSelectionDecorationIds, []);
    });
  }
  _updateMatchesCount() {
  }
  dispose() {
    super.dispose();
    this._domNode.remove();
  }
  getDomNode() {
    return this._domNode;
  }
  reveal(initialInput) {
    if (initialInput) {
      this._findInput.setValue(initialInput);
    }
    if (this._isVisible) {
      this._findInput.select();
      return;
    }
    this._isVisible = true;
    this.updateButtons(this.foundMatch);
    setTimeout(() => {
      this._domNode.classList.add("visible", "visible-transition");
      this._domNode.setAttribute("aria-hidden", "false");
      this._findInput.select();
    }, 0);
  }
  focus() {
    this._findInput.focus();
  }
  show(initialInput, options) {
    if (initialInput) {
      this._findInput.setValue(initialInput);
    }
    this._isVisible = true;
    setTimeout(() => {
      this._domNode.classList.add("visible", "visible-transition");
      this._domNode.setAttribute("aria-hidden", "false");
      if (options?.focus ?? true) {
        this.focus();
      }
    }, 0);
  }
  showWithReplace(initialInput, replaceInput) {
    if (initialInput) {
      this._findInput.setValue(initialInput);
    }
    if (replaceInput) {
      this._replaceInput.setValue(replaceInput);
    }
    this._isVisible = true;
    this._isReplaceVisible = true;
    this._state.change({ isReplaceRevealed: this._isReplaceVisible }, false);
    this._updateReplaceViewDisplay();
    setTimeout(() => {
      this._domNode.classList.add("visible", "visible-transition");
      this._domNode.setAttribute("aria-hidden", "false");
      this._updateButtons();
      this._replaceInput.focus();
    }, 0);
  }
  _updateReplaceViewDisplay() {
    if (this._isReplaceVisible) {
      this._innerReplaceDomNode.style.display = "flex";
    } else {
      this._innerReplaceDomNode.style.display = "none";
    }
    this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
  }
  hide() {
    if (this._isVisible) {
      this.inSelectionToggle.checked = false;
      this._notebookEditor.deltaCellDecorations(this.cellSelectionDecorationIds, []);
      this._notebookEditor.changeModelDecorations((changeAccessor) => {
        changeAccessor.deltaDecorations(this.textSelectionDecorationIds, []);
      });
      this._domNode.classList.remove("visible-transition");
      this._domNode.setAttribute("aria-hidden", "true");
      setTimeout(() => {
        this._isVisible = false;
        this.updateButtons(this.foundMatch);
        this._domNode.classList.remove("visible");
      }, 200);
    }
  }
  _delayedUpdateFindHistory() {
    this._updateFindHistoryDelayer.trigger(this._updateFindHistory.bind(this));
  }
  _updateFindHistory() {
    this._findInput.inputBox.addToHistory();
  }
  _delayedUpdateReplaceHistory() {
    this._updateReplaceHistoryDelayer.trigger(this._updateReplaceHistory.bind(this));
  }
  _updateReplaceHistory() {
    this._replaceInput.inputBox.addToHistory();
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
};
SimpleFindReplaceWidget = __decorateClass([
  __decorateParam(0, IContextViewService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IHoverService)
], SimpleFindReplaceWidget);
registerThemingParticipant((theme, collector) => {
  collector.addRule(`
	.notebook-editor {
		--notebook-find-width: ${NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH}px;
		--notebook-find-horizontal-padding: ${NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING}px;
	}
	`);
});
export {
  NotebookFindInput,
  NotebookFindInputFilterButton,
  SimpleFindReplaceWidget,
  findFilterButton
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxmaW5kXFxub3RlYm9va0ZpbmRSZXBsYWNlV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgJy4vbm90ZWJvb2tGaW5kUmVwbGFjZVdpZGdldC5jc3MnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCwgSUNvbnRleHRWaWV3UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZHJvcGRvd24vZHJvcGRvd25BY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBGaW5kSW5wdXQsIElGaW5kSW5wdXRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ZpbmRpbnB1dC9maW5kSW5wdXQuanMnO1xuaW1wb3J0IHsgUmVwbGFjZUlucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ZpbmRpbnB1dC9yZXBsYWNlSW5wdXQuanMnO1xuaW1wb3J0IHsgSU1lc3NhZ2UgYXMgSW5wdXRCb3hNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IFByb2dyZXNzQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Byb2dyZXNzYmFyL3Byb2dyZXNzYmFyLmpzJztcbmltcG9ydCB7IElTYXNoRXZlbnQsIE9yaWVudGF0aW9uLCBTYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBJVG9nZ2xlU3R5bGVzLCBUb2dnbGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvd2lkZ2V0LmpzJztcbmltcG9ydCB7IEFjdGlvbiwgQWN0aW9uUnVubmVyLCBJQWN0aW9uLCBJQWN0aW9uUnVubmVyLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc1NhZmFyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElIaXN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgRmluZFJlcGxhY2VTdGF0ZSwgRmluZFJlcGxhY2VTdGF0ZUNoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9maW5kU3RhdGUuanMnO1xuaW1wb3J0IHsgZmluZE5leHRNYXRjaEljb24sIGZpbmRQcmV2aW91c01hdGNoSWNvbiwgZmluZFJlcGxhY2VBbGxJY29uLCBmaW5kUmVwbGFjZUljb24sIGZpbmRTZWxlY3Rpb25JY29uLCBTaW1wbGVCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvZmluZFdpZGdldC5qcyc7XG5pbXBvcnQgeyBwYXJzZVJlcGxhY2VTdHJpbmcsIFJlcGxhY2VQYXR0ZXJuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL3JlcGxhY2VQYXR0ZXJuLmpzJztcbmltcG9ydCB7IGdldEFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlLCBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0U2NvcGVkUmVwbGFjZUlucHV0LCByZWdpc3RlckFuZENyZWF0ZUhpc3RvcnlOYXZpZ2F0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hpc3RvcnkvYnJvd3Nlci9jb250ZXh0U2NvcGVkSGlzdG9yeVdpZGdldC5qcyc7XG5cbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgZGVmYXVsdElucHV0Qm94U3R5bGVzLCBkZWZhdWx0UHJvZ3Jlc3NCYXJTdHlsZXMsIGRlZmF1bHRUb2dnbGVTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSwgaW5wdXRBY3RpdmVPcHRpb25CYWNrZ3JvdW5kLCBpbnB1dEFjdGl2ZU9wdGlvbkJvcmRlciwgaW5wdXRBY3RpdmVPcHRpb25Gb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uLCB3aWRnZXRDbG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGZpbHRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uc0ljb25zLmpzJztcbmltcG9ydCB7IE5vdGVib29rRmluZEZpbHRlcnMgfSBmcm9tICcuL2ZpbmRGaWx0ZXJzLmpzJztcbmltcG9ydCB7IElTaG93Tm90ZWJvb2tGaW5kV2lkZ2V0T3B0aW9ucyB9IGZyb20gJy4vbm90ZWJvb2tGaW5kV2lkZ2V0LmpzJztcbmltcG9ydCB7IElDZWxsTW9kZWxEZWNvcmF0aW9ucywgSUNlbGxNb2RlbERlbHRhRGVjb3JhdGlvbnMsIElDZWxsVmlld01vZGVsLCBJTm90ZWJvb2tEZWx0YURlY29yYXRpb24sIElOb3RlYm9va0VkaXRvciB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0ZpbmRTY29wZVR5cGUsIE5vdGVib29rU2V0dGluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJQ2VsbFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rUmFuZ2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJSG92ZXJMaWZlY3ljbGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcblxuXG5jb25zdCBOTFNfRklORF9JTlBVVF9MQUJFTCA9IG5scy5sb2NhbGl6ZSgnbGFiZWwuZmluZCcsIFwiRmluZFwiKTtcbmNvbnN0IE5MU19GSU5EX0lOUFVUX1BMQUNFSE9MREVSID0gbmxzLmxvY2FsaXplKCdwbGFjZWhvbGRlci5maW5kJywgXCJGaW5kXCIpO1xuY29uc3QgTkxTX1BSRVZJT1VTX01BVENIX0JUTl9MQUJFTCA9IG5scy5sb2NhbGl6ZSgnbGFiZWwucHJldmlvdXNNYXRjaEJ1dHRvbicsIFwiUHJldmlvdXMgTWF0Y2hcIik7XG5jb25zdCBOTFNfTkVYVF9NQVRDSF9CVE5fTEFCRUwgPSBubHMubG9jYWxpemUoJ2xhYmVsLm5leHRNYXRjaEJ1dHRvbicsIFwiTmV4dCBNYXRjaFwiKTtcbmNvbnN0IE5MU19UT0dHTEVfU0VMRUNUSU9OX0ZJTkRfVElUTEUgPSBubHMubG9jYWxpemUoJ2xhYmVsLnRvZ2dsZVNlbGVjdGlvbkZpbmQnLCBcIkZpbmQgaW4gU2VsZWN0aW9uXCIpO1xuY29uc3QgTkxTX0NMT1NFX0JUTl9MQUJFTCA9IG5scy5sb2NhbGl6ZSgnbGFiZWwuY2xvc2VCdXR0b24nLCBcIkNsb3NlXCIpO1xuY29uc3QgTkxTX1RPR0dMRV9SRVBMQUNFX01PREVfQlROX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC50b2dnbGVSZXBsYWNlQnV0dG9uJywgXCJUb2dnbGUgUmVwbGFjZVwiKTtcbmNvbnN0IE5MU19SRVBMQUNFX0lOUFVUX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5yZXBsYWNlJywgXCJSZXBsYWNlXCIpO1xuY29uc3QgTkxTX1JFUExBQ0VfSU5QVVRfUExBQ0VIT0xERVIgPSBubHMubG9jYWxpemUoJ3BsYWNlaG9sZGVyLnJlcGxhY2UnLCBcIlJlcGxhY2VcIik7XG5jb25zdCBOTFNfUkVQTEFDRV9CVE5fTEFCRUwgPSBubHMubG9jYWxpemUoJ2xhYmVsLnJlcGxhY2VCdXR0b24nLCBcIlJlcGxhY2VcIik7XG5jb25zdCBOTFNfUkVQTEFDRV9BTExfQlROX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5yZXBsYWNlQWxsQnV0dG9uJywgXCJSZXBsYWNlIEFsbFwiKTtcblxuZXhwb3J0IGNvbnN0IGZpbmRGaWx0ZXJCdXR0b24gPSByZWdpc3Rlckljb24oJ2ZpbmQtZmlsdGVyJywgQ29kaWNvbi5maWx0ZXIsIG5scy5sb2NhbGl6ZSgnZmluZEZpbHRlckljb24nLCAnSWNvbiBmb3IgRmluZCBGaWx0ZXIgaW4gZmluZCB3aWRnZXQuJykpO1xuY29uc3QgTk9URUJPT0tfRklORF9GSUxURVJTID0gbmxzLmxvY2FsaXplKCdub3RlYm9vay5maW5kLmZpbHRlci5maWx0ZXJBY3Rpb24nLCBcIkZpbmQgRmlsdGVyc1wiKTtcbmNvbnN0IE5PVEVCT09LX0ZJTkRfSU5fTUFSS1VQX0lOUFVUID0gbmxzLmxvY2FsaXplKCdub3RlYm9vay5maW5kLmZpbHRlci5maW5kSW5NYXJrdXBJbnB1dCcsIFwiTWFya2Rvd24gU291cmNlXCIpO1xuY29uc3QgTk9URUJPT0tfRklORF9JTl9NQVJLVVBfUFJFVklFVyA9IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZmluZC5maWx0ZXIuZmluZEluTWFya3VwUHJldmlldycsIFwiUmVuZGVyZWQgTWFya2Rvd25cIik7XG5jb25zdCBOT1RFQk9PS19GSU5EX0lOX0NPREVfSU5QVVQgPSBubHMubG9jYWxpemUoJ25vdGVib29rLmZpbmQuZmlsdGVyLmZpbmRJbkNvZGVJbnB1dCcsIFwiQ29kZSBDZWxsIFNvdXJjZVwiKTtcbmNvbnN0IE5PVEVCT09LX0ZJTkRfSU5fQ09ERV9PVVRQVVQgPSBubHMubG9jYWxpemUoJ25vdGVib29rLmZpbmQuZmlsdGVyLmZpbmRJbkNvZGVPdXRwdXQnLCBcIkNvZGUgQ2VsbCBPdXRwdXRcIik7XG5cbmNvbnN0IE5PVEVCT09LX0ZJTkRfV0lER0VUX0lOSVRJQUxfV0lEVEggPSA0MTk7XG5jb25zdCBOT1RFQk9PS19GSU5EX1dJREdFVF9JTklUSUFMX0hPUklaT05UQUxfUEFERElORyA9IDQ7XG5jbGFzcyBOb3RlYm9va0ZpbmRGaWx0ZXJBY3Rpb25WaWV3SXRlbSBleHRlbmRzIERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtIHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgZmlsdGVyczogTm90ZWJvb2tGaW5kRmlsdGVycywgYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zLCBhY3Rpb25SdW5uZXI6IElBY3Rpb25SdW5uZXIsIEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSkge1xuXHRcdHN1cGVyKGFjdGlvbixcblx0XHRcdHsgZ2V0QWN0aW9uczogKCkgPT4gdGhpcy5nZXRBY3Rpb25zKCkgfSxcblx0XHRcdGNvbnRleHRNZW51U2VydmljZSxcblx0XHRcdHtcblx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0YWN0aW9uUnVubmVyLFxuXHRcdFx0XHRjbGFzc05hbWVzOiBhY3Rpb24uY2xhc3MsXG5cdFx0XHRcdGFuY2hvckFsaWdubWVudFByb3ZpZGVyOiAoKSA9PiBBbmNob3JBbGlnbm1lbnQuUklHSFRcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHR0aGlzLnVwZGF0ZUNoZWNrZWQoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IG1hcmtkb3duSW5wdXQ6IElBY3Rpb24gPSB7XG5cdFx0XHRjaGVja2VkOiB0aGlzLmZpbHRlcnMubWFya3VwSW5wdXQsXG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGlkOiAnZmluZEluTWFya2Rvd25JbnB1dCcsXG5cdFx0XHRsYWJlbDogTk9URUJPT0tfRklORF9JTl9NQVJLVVBfSU5QVVQsXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5maWx0ZXJzLm1hcmt1cElucHV0ID0gIXRoaXMuZmlsdGVycy5tYXJrdXBJbnB1dDtcblx0XHRcdH0sXG5cdFx0XHR0b29sdGlwOiAnJ1xuXHRcdH07XG5cblx0XHRjb25zdCBtYXJrZG93blByZXZpZXc6IElBY3Rpb24gPSB7XG5cdFx0XHRjaGVja2VkOiB0aGlzLmZpbHRlcnMubWFya3VwUHJldmlldyxcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6ICdmaW5kSW5NYXJrZG93bklucHV0Jyxcblx0XHRcdGxhYmVsOiBOT1RFQk9PS19GSU5EX0lOX01BUktVUF9QUkVWSUVXLFxuXHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZmlsdGVycy5tYXJrdXBQcmV2aWV3ID0gIXRoaXMuZmlsdGVycy5tYXJrdXBQcmV2aWV3O1xuXHRcdFx0fSxcblx0XHRcdHRvb2x0aXA6ICcnXG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvZGVJbnB1dDogSUFjdGlvbiA9IHtcblx0XHRcdGNoZWNrZWQ6IHRoaXMuZmlsdGVycy5jb2RlSW5wdXQsXG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGlkOiAnZmluZEluQ29kZUlucHV0Jyxcblx0XHRcdGxhYmVsOiBOT1RFQk9PS19GSU5EX0lOX0NPREVfSU5QVVQsXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5maWx0ZXJzLmNvZGVJbnB1dCA9ICF0aGlzLmZpbHRlcnMuY29kZUlucHV0O1xuXHRcdFx0fSxcblx0XHRcdHRvb2x0aXA6ICcnXG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvZGVPdXRwdXQgPSB7XG5cdFx0XHRjaGVja2VkOiB0aGlzLmZpbHRlcnMuY29kZU91dHB1dCxcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6ICdmaW5kSW5Db2RlT3V0cHV0Jyxcblx0XHRcdGxhYmVsOiBOT1RFQk9PS19GSU5EX0lOX0NPREVfT1VUUFVULFxuXHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZmlsdGVycy5jb2RlT3V0cHV0ID0gIXRoaXMuZmlsdGVycy5jb2RlT3V0cHV0O1xuXHRcdFx0fSxcblx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gbnVsbFxuXHRcdH07XG5cblx0XHRpZiAoaXNTYWZhcmkpIHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdG1hcmtkb3duSW5wdXQsXG5cdFx0XHRcdGNvZGVJbnB1dFxuXHRcdFx0XTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0bWFya2Rvd25JbnB1dCxcblx0XHRcdFx0bWFya2Rvd25QcmV2aWV3LFxuXHRcdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHRcdGNvZGVJbnB1dCxcblx0XHRcdFx0Y29kZU91dHB1dCxcblx0XHRcdF07XG5cdFx0fVxuXG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlQ2hlY2tlZCgpOiB2b2lkIHtcblx0XHR0aGlzLmVsZW1lbnQhLmNsYXNzTGlzdC50b2dnbGUoJ2NoZWNrZWQnLCB0aGlzLl9hY3Rpb24uY2hlY2tlZCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rRmluZElucHV0RmlsdGVyQnV0dG9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX2ZpbHRlckJ1dHRvbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2FjdGlvbmJhcjogQWN0aW9uQmFyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2ZpbHRlcnNBY3Rpb246IElBY3Rpb247XG5cdHByaXZhdGUgX3RvZ2dsZVN0eWxlczogSVRvZ2dsZVN0eWxlcztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBmaWx0ZXJzOiBOb3RlYm9va0ZpbmRGaWx0ZXJzLFxuXHRcdHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRyZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdG9wdGlvbnM6IElGaW5kSW5wdXRPcHRpb25zLFxuXHRcdHRvb2x0aXA6IHN0cmluZyA9IE5PVEVCT09LX0ZJTkRfRklMVEVSUyxcblx0KSB7XG5cblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3RvZ2dsZVN0eWxlcyA9IG9wdGlvbnMudG9nZ2xlU3R5bGVzO1xuXG5cdFx0dGhpcy5fZmlsdGVyc0FjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oJ25vdGVib29rRmluZEZpbHRlckFjdGlvbicsIHRvb2x0aXAsICdub3RlYm9vay1maWx0ZXJzICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUoZmlsdGVySWNvbikpKTtcblx0XHR0aGlzLl9maWx0ZXJzQWN0aW9uLmNoZWNrZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9maWx0ZXJCdXR0b25Db250YWluZXIgPSBkb20uJCgnLmZpbmQtZmlsdGVyLWJ1dHRvbicpO1xuXHRcdHRoaXMuX2ZpbHRlckJ1dHRvbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb25hY28tY3VzdG9tLXRvZ2dsZScpO1xuXHRcdHRoaXMuY3JlYXRlRmlsdGVycyh0aGlzLl9maWx0ZXJCdXR0b25Db250YWluZXIpO1xuXHR9XG5cblx0Z2V0IGNvbnRhaW5lcigpIHtcblx0XHRyZXR1cm4gdGhpcy5fZmlsdGVyQnV0dG9uQ29udGFpbmVyO1xuXHR9XG5cblx0d2lkdGgoKSB7XG5cdFx0cmV0dXJuIDIgLyptYXJnaW4gbGVmdCovICsgMiAvKmJvcmRlciovICsgMiAvKnBhZGRpbmcqLyArIDE2IC8qIGljb24gd2lkdGggKi87XG5cdH1cblxuXHRlbmFibGUoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJywgU3RyaW5nKGZhbHNlKSk7XG5cdH1cblxuXHRkaXNhYmxlKCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcsIFN0cmluZyh0cnVlKSk7XG5cdH1cblxuXHRzZXQgdmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fZmlsdGVyQnV0dG9uQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSB2aXNpYmxlID8gJycgOiAnbm9uZSc7XG5cdH1cblxuXHRnZXQgdmlzaWJsZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZmlsdGVyQnV0dG9uQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgIT09ICdub25lJztcblx0fVxuXG5cdGFwcGx5U3R5bGVzKGZpbHRlckNoZWNrZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCB0b2dnbGVTdHlsZXMgPSB0aGlzLl90b2dnbGVTdHlsZXM7XG5cblx0XHR0aGlzLl9maWx0ZXJCdXR0b25Db250YWluZXIuc3R5bGUuYm9yZGVyID0gJzFweCBzb2xpZCB0cmFuc3BhcmVudCc7XG5cdFx0dGhpcy5fZmlsdGVyQnV0dG9uQ29udGFpbmVyLnN0eWxlLmJvcmRlclJhZGl1cyA9ICczcHgnO1xuXHRcdHRoaXMuX2ZpbHRlckJ1dHRvbkNvbnRhaW5lci5zdHlsZS5ib3JkZXJDb2xvciA9IChmaWx0ZXJDaGVja2VkICYmIHRvZ2dsZVN0eWxlcy5pbnB1dEFjdGl2ZU9wdGlvbkJvcmRlcikgfHwgJyc7XG5cdFx0dGhpcy5fZmlsdGVyQnV0dG9uQ29udGFpbmVyLnN0eWxlLmNvbG9yID0gKGZpbHRlckNoZWNrZWQgJiYgdG9nZ2xlU3R5bGVzLmlucHV0QWN0aXZlT3B0aW9uRm9yZWdyb3VuZCkgfHwgJ2luaGVyaXQnO1xuXHRcdHRoaXMuX2ZpbHRlckJ1dHRvbkNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAoZmlsdGVyQ2hlY2tlZCAmJiB0b2dnbGVTdHlsZXMuaW5wdXRBY3RpdmVPcHRpb25CYWNrZ3JvdW5kKSB8fCAnJztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRmlsdGVycyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aW9uYmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcihjb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gdGhpcy5fZmlsdGVyc0FjdGlvbi5pZCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rRmluZEZpbHRlckFjdGlvblZpZXdJdGVtLCB0aGlzLmZpbHRlcnMsIGFjdGlvbiwgb3B0aW9ucywgdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvblJ1bm5lcigpKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fYWN0aW9uYmFyLnB1c2godGhpcy5fZmlsdGVyc0FjdGlvbiwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rRmluZElucHV0IGV4dGVuZHMgRmluZElucHV0IHtcblx0cHJpdmF0ZSBfZmluZEZpbHRlcjogTm90ZWJvb2tGaW5kSW5wdXRGaWx0ZXJCdXR0b247XG5cdHByaXZhdGUgX2ZpbHRlckNoZWNrZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBmaWx0ZXJzOiBOb3RlYm9va0ZpbmRGaWx0ZXJzLFxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0cmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCB8IG51bGwsXG5cdFx0Y29udGV4dFZpZXdQcm92aWRlcjogSUNvbnRleHRWaWV3UHJvdmlkZXIsXG5cdFx0b3B0aW9uczogSUZpbmRJbnB1dE9wdGlvbnMsXG5cdCkge1xuXHRcdHN1cGVyKHBhcmVudCwgY29udGV4dFZpZXdQcm92aWRlciwgb3B0aW9ucyk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFuZENyZWF0ZUhpc3RvcnlOYXZpZ2F0aW9uQ29udGV4dChjb250ZXh0S2V5U2VydmljZSwgdGhpcy5pbnB1dEJveCkpO1xuXHRcdHRoaXMuX2ZpbmRGaWx0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTm90ZWJvb2tGaW5kSW5wdXRGaWx0ZXJCdXR0b24oZmlsdGVycywgY29udGV4dE1lbnVTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3B0aW9ucykpO1xuXG5cdFx0dGhpcy5pbnB1dEJveC5wYWRkaW5nUmlnaHQgPSAodGhpcy5jYXNlU2Vuc2l0aXZlPy53aWR0aCgpID8/IDApICsgKHRoaXMud2hvbGVXb3Jkcz8ud2lkdGgoKSA/PyAwKSArICh0aGlzLnJlZ2V4Py53aWR0aCgpID8/IDApICsgdGhpcy5fZmluZEZpbHRlci53aWR0aCgpO1xuXHRcdHRoaXMuY29udHJvbHMuYXBwZW5kQ2hpbGQodGhpcy5fZmluZEZpbHRlci5jb250YWluZXIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0RW5hYmxlZChlbmFibGVkOiBib29sZWFuKSB7XG5cdFx0c3VwZXIuc2V0RW5hYmxlZChlbmFibGVkKTtcblx0XHRpZiAoZW5hYmxlZCAmJiAhdGhpcy5fZmlsdGVyQ2hlY2tlZCkge1xuXHRcdFx0dGhpcy5yZWdleD8uZW5hYmxlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVnZXg/LmRpc2FibGUoKTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVGaWx0ZXJTdGF0ZShjaGFuZ2VkOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fZmlsdGVyQ2hlY2tlZCA9IGNoYW5nZWQ7XG5cdFx0aWYgKHRoaXMucmVnZXgpIHtcblx0XHRcdGlmICh0aGlzLl9maWx0ZXJDaGVja2VkKSB7XG5cdFx0XHRcdHRoaXMucmVnZXguZGlzYWJsZSgpO1xuXHRcdFx0XHR0aGlzLnJlZ2V4LmRvbU5vZGUudGFiSW5kZXggPSAtMTtcblx0XHRcdFx0dGhpcy5yZWdleC5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgdHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnJlZ2V4LmVuYWJsZSgpO1xuXHRcdFx0XHR0aGlzLnJlZ2V4LmRvbU5vZGUudGFiSW5kZXggPSAwO1xuXHRcdFx0XHR0aGlzLnJlZ2V4LmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2ZpbmRGaWx0ZXIuYXBwbHlTdHlsZXModGhpcy5fZmlsdGVyQ2hlY2tlZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VG9nZ2xlRG9tTm9kZXMoKTogSFRNTEVsZW1lbnRbXSB7XG5cdFx0Y29uc3Qgbm9kZXMgPSBzdXBlci5nZXRUb2dnbGVEb21Ob2RlcygpO1xuXHRcdG5vZGVzLnB1c2godGhpcy5fZmluZEZpbHRlci5jb250YWluZXIpO1xuXHRcdHJldHVybiBub2Rlcztcblx0fVxuXG5cdGdldENlbGxUb29sYmFyQWN0aW9ucyhtZW51OiBJTWVudSk6IHsgcHJpbWFyeTogSUFjdGlvbltdOyBzZWNvbmRhcnk6IElBY3Rpb25bXSB9IHtcblx0XHRyZXR1cm4gZ2V0QWN0aW9uQmFyQWN0aW9ucyhtZW51LmdldEFjdGlvbnMoeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KSwgZyA9PiAvXmlubGluZS8udGVzdChnKSk7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFNpbXBsZUZpbmRSZXBsYWNlV2lkZ2V0IGV4dGVuZHMgV2lkZ2V0IHtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9maW5kSW5wdXQ6IE5vdGVib29rRmluZElucHV0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5uZXJGaW5kRG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZvY3VzVHJhY2tlcjogZG9tLklGb2N1c1RyYWNrZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbmRJbnB1dEZvY3VzVHJhY2tlcjogZG9tLklGb2N1c1RyYWNrZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZUZpbmRIaXN0b3J5RGVsYXllcjogRGVsYXllcjx2b2lkPjtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9tYXRjaGVzQ291bnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBwcmV2QnRuOiBTaW1wbGVCdXR0b247XG5cdHByaXZhdGUgcmVhZG9ubHkgbmV4dEJ0bjogU2ltcGxlQnV0dG9uO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfcmVwbGFjZUlucHV0ITogUmVwbGFjZUlucHV0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbm5lclJlcGxhY2VEb21Ob2RlITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3RvZ2dsZVJlcGxhY2VCdG4hOiBTaW1wbGVCdXR0b247XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcGxhY2VJbnB1dEZvY3VzVHJhY2tlciE6IGRvbS5JRm9jdXNUcmFja2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91cGRhdGVSZXBsYWNlSGlzdG9yeURlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cdHByb3RlY3RlZCBfcmVwbGFjZUJ0biE6IFNpbXBsZUJ1dHRvbjtcblx0cHJvdGVjdGVkIF9yZXBsYWNlQWxsQnRuITogU2ltcGxlQnV0dG9uO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc2l6ZVNhc2g6IFNhc2g7XG5cdHByaXZhdGUgX3Jlc2l6ZU9yaWdpbmFsV2lkdGggPSBOT1RFQk9PS19GSU5EX1dJREdFVF9JTklUSUFMX1dJRFRIO1xuXG5cdHByaXZhdGUgX2lzVmlzaWJsZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc1JlcGxhY2VWaXNpYmxlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgZm91bmRNYXRjaDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByb3RlY3RlZCBfcHJvZ3Jlc3NCYXIhOiBQcm9ncmVzc0Jhcjtcblx0cHJvdGVjdGVkIF9zY29wZWRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXG5cdHByaXZhdGUgX2ZpbHRlcnM6IE5vdGVib29rRmluZEZpbHRlcnM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpblNlbGVjdGlvblRvZ2dsZTogVG9nZ2xlO1xuXHRwcml2YXRlIGNlbGxTZWxlY3Rpb25EZWNvcmF0aW9uSWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIHRleHRTZWxlY3Rpb25EZWNvcmF0aW9uSWRzOiBJQ2VsbE1vZGVsRGVjb3JhdGlvbnNbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfc3RhdGU6IEZpbmRSZXBsYWNlU3RhdGU8Tm90ZWJvb2tGaW5kRmlsdGVycz4gPSBuZXcgRmluZFJlcGxhY2VTdGF0ZTxOb3RlYm9va0ZpbmRGaWx0ZXJzPigpLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9maW5kV2lkZ2V0U2VhcmNoSGlzdG9yeTogSUhpc3Rvcnk8c3RyaW5nPiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXBsYWNlV2lkZ2V0SGlzdG9yeTogSUhpc3Rvcnk8c3RyaW5nPiB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0YXRlKTtcblxuXHRcdGNvbnN0IGZpbmRGaWx0ZXJzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8e1xuXHRcdFx0bWFya3VwU291cmNlOiBib29sZWFuO1xuXHRcdFx0bWFya3VwUHJldmlldzogYm9vbGVhbjtcblx0XHRcdGNvZGVTb3VyY2U6IGJvb2xlYW47XG5cdFx0XHRjb2RlT3V0cHV0OiBib29sZWFuO1xuXHRcdH0+KE5vdGVib29rU2V0dGluZy5maW5kRmlsdGVycykgPz8geyBtYXJrdXBTb3VyY2U6IHRydWUsIG1hcmt1cFByZXZpZXc6IHRydWUsIGNvZGVTb3VyY2U6IHRydWUsIGNvZGVPdXRwdXQ6IHRydWUgfTtcblxuXHRcdGNvbnN0IGZpbmRIaXN0b3J5Q29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J25ldmVyJyB8ICd3b3Jrc3BhY2UnPignZWRpdG9yLmZpbmQuaGlzdG9yeScpO1xuXHRcdGNvbnN0IHJlcGxhY2VIaXN0b3J5Q29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J25ldmVyJyB8ICd3b3Jrc3BhY2UnPignZWRpdG9yLmZpbmQucmVwbGFjZUhpc3RvcnknKTtcblxuXHRcdHRoaXMuX2ZpbHRlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTm90ZWJvb2tGaW5kRmlsdGVycyhmaW5kRmlsdGVycy5tYXJrdXBTb3VyY2UsIGZpbmRGaWx0ZXJzLm1hcmt1cFByZXZpZXcsIGZpbmRGaWx0ZXJzLmNvZGVTb3VyY2UsIGZpbmRGaWx0ZXJzLmNvZGVPdXRwdXQsIHsgZmluZFNjb3BlVHlwZTogTm90ZWJvb2tGaW5kU2NvcGVUeXBlLk5vbmUgfSkpO1xuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IGZpbHRlcnM6IHRoaXMuX2ZpbHRlcnMgfSwgZmFsc2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmlsdGVycy5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBmaWx0ZXJzOiB0aGlzLl9maWx0ZXJzIH0sIGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdzaW1wbGUtZnItZmluZC1wYXJ0LXdyYXBwZXInKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4ge1xuXHRcdFx0aWYgKCFlIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmdsb2JhbFRvb2xiYXIpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuZ2V0TGF5b3V0Q29uZmlndXJhdGlvbigpLmdsb2JhbFRvb2xiYXIpIHtcblx0XHRcdFx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLnRvcCA9ICcyNnB4Jztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLnRvcCA9ICcwcHgnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RhdGUub25GaW5kUmVwbGFjZVN0YXRlQ2hhbmdlKChlKSA9PiB0aGlzLl9vblN0YXRlQ2hhbmdlZChlKSkpO1xuXHRcdHRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuX2RvbU5vZGUpKTtcblxuXHRcdGNvbnN0IHByb2dyZXNzQ29udGFpbmVyID0gZG9tLiQoJy5maW5kLXJlcGxhY2UtcHJvZ3Jlc3MnKTtcblx0XHR0aGlzLl9wcm9ncmVzc0JhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQcm9ncmVzc0Jhcihwcm9ncmVzc0NvbnRhaW5lciwgZGVmYXVsdFByb2dyZXNzQmFyU3R5bGVzKSk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZChwcm9ncmVzc0NvbnRhaW5lcik7XG5cblx0XHRjb25zdCBpc0ludGVyYWN0aXZlV2luZG93ID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKCdub3RlYm9va1R5cGUnKSA9PT0gJ2ludGVyYWN0aXZlJztcblxuXHRcdGNvbnN0IGhvdmVyTGlmZWN5Y2xlT3B0aW9uczogSUhvdmVyTGlmZWN5Y2xlT3B0aW9ucyA9IHsgZ3JvdXBJZDogJ3NpbXBsZS1maW5kLXdpZGdldCcgfTtcblxuXHRcdC8vIFRvZ2dsZSByZXBsYWNlIGJ1dHRvblxuXHRcdHRoaXMuX3RvZ2dsZVJlcGxhY2VCdG4gPSB0aGlzLl9yZWdpc3RlcihuZXcgU2ltcGxlQnV0dG9uKHtcblx0XHRcdGxhYmVsOiBOTFNfVE9HR0xFX1JFUExBQ0VfTU9ERV9CVE5fTEFCRUwsXG5cdFx0XHRjbGFzc05hbWU6ICdjb2RpY29uIHRvZ2dsZSBsZWZ0Jyxcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHRcdG9uVHJpZ2dlcjogaXNJbnRlcmFjdGl2ZVdpbmRvdyA/ICgpID0+IHsgfSA6XG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9pc1JlcGxhY2VWaXNpYmxlID0gIXRoaXMuX2lzUmVwbGFjZVZpc2libGU7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgaXNSZXBsYWNlUmV2ZWFsZWQ6IHRoaXMuX2lzUmVwbGFjZVZpc2libGUgfSwgZmFsc2UpO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVJlcGxhY2VWaWV3RGlzcGxheSgpO1xuXHRcdFx0XHR9XG5cdFx0fSwgaG92ZXJTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fdG9nZ2xlUmVwbGFjZUJ0bi5zZXRFbmFibGVkKCFpc0ludGVyYWN0aXZlV2luZG93KTtcblx0XHR0aGlzLl90b2dnbGVSZXBsYWNlQnRuLnNldEV4cGFuZGVkKHRoaXMuX2lzUmVwbGFjZVZpc2libGUpO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fdG9nZ2xlUmVwbGFjZUJ0bi5kb21Ob2RlKTtcblxuXG5cblx0XHR0aGlzLl9pbm5lckZpbmREb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5faW5uZXJGaW5kRG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdzaW1wbGUtZnItZmluZC1wYXJ0Jyk7XG5cblx0XHR0aGlzLl9maW5kSW5wdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTm90ZWJvb2tGaW5kSW5wdXQoXG5cdFx0XHR0aGlzLl9maWx0ZXJzLFxuXHRcdFx0dGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRudWxsLFxuXHRcdFx0dGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdFx0e1xuXHRcdFx0XHQvLyB3aWR0aDpGSU5EX0lOUFVUX0FSRUFfV0lEVEgsXG5cdFx0XHRcdGxhYmVsOiBOTFNfRklORF9JTlBVVF9MQUJFTCxcblx0XHRcdFx0cGxhY2Vob2xkZXI6IE5MU19GSU5EX0lOUFVUX1BMQUNFSE9MREVSLFxuXHRcdFx0XHR2YWxpZGF0aW9uOiAodmFsdWU6IHN0cmluZyk6IElucHV0Qm94TWVzc2FnZSB8IG51bGwgPT4ge1xuXHRcdFx0XHRcdGlmICh2YWx1ZS5sZW5ndGggPT09IDAgfHwgIXRoaXMuX2ZpbmRJbnB1dC5nZXRSZWdleCgpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdG5ldyBSZWdFeHAodmFsdWUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5mb3VuZE1hdGNoID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUJ1dHRvbnModGhpcy5mb3VuZE1hdGNoKTtcblx0XHRcdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IGUubWVzc2FnZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZmxleGlibGVXaWR0aDogdHJ1ZSxcblx0XHRcdFx0c2hvd0NvbW1vbkZpbmRUb2dnbGVzOiB0cnVlLFxuXHRcdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzLFxuXHRcdFx0XHR0b2dnbGVTdHlsZXM6IGRlZmF1bHRUb2dnbGVTdHlsZXMsXG5cdFx0XHRcdGhpc3Rvcnk6IGZpbmRIaXN0b3J5Q29uZmlnID09PSAnd29ya3NwYWNlJyA/IHRoaXMuX2ZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5IDogbmV3IFNldChbXSksXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHQvLyBGaW5kIEhpc3Rvcnkgd2l0aCB1cGRhdGUgZGVsYXllclxuXHRcdHRoaXMuX3VwZGF0ZUZpbmRIaXN0b3J5RGVsYXllciA9IG5ldyBEZWxheWVyPHZvaWQ+KDUwMCk7XG5cblx0XHR0aGlzLm9uaW5wdXQodGhpcy5fZmluZElucHV0LmRvbU5vZGUsIChlKSA9PiB7XG5cdFx0XHR0aGlzLmZvdW5kTWF0Y2ggPSB0aGlzLm9uSW5wdXRDaGFuZ2VkKCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUJ1dHRvbnModGhpcy5mb3VuZE1hdGNoKTtcblx0XHRcdHRoaXMuX2RlbGF5ZWRVcGRhdGVGaW5kSGlzdG9yeSgpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmluZElucHV0LmlucHV0Qm94Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogdGhpcy5fZmluZElucHV0LmdldFZhbHVlKCkgfSwgdHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZmluZElucHV0LnNldFJlZ2V4KCEhdGhpcy5fc3RhdGUuaXNSZWdleCk7XG5cdFx0dGhpcy5fZmluZElucHV0LnNldENhc2VTZW5zaXRpdmUoISF0aGlzLl9zdGF0ZS5tYXRjaENhc2UpO1xuXHRcdHRoaXMuX2ZpbmRJbnB1dC5zZXRXaG9sZVdvcmRzKCEhdGhpcy5fc3RhdGUud2hvbGVXb3JkKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbmRJbnB1dC5vbkRpZE9wdGlvbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2Uoe1xuXHRcdFx0XHRpc1JlZ2V4OiB0aGlzLl9maW5kSW5wdXQuZ2V0UmVnZXgoKSxcblx0XHRcdFx0d2hvbGVXb3JkOiB0aGlzLl9maW5kSW5wdXQuZ2V0V2hvbGVXb3JkcygpLFxuXHRcdFx0XHRtYXRjaENhc2U6IHRoaXMuX2ZpbmRJbnB1dC5nZXRDYXNlU2Vuc2l0aXZlKClcblx0XHRcdH0sIHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0YXRlLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuc2V0UmVnZXgodGhpcy5fc3RhdGUuaXNSZWdleCk7XG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuc2V0V2hvbGVXb3Jkcyh0aGlzLl9zdGF0ZS53aG9sZVdvcmQpO1xuXHRcdFx0dGhpcy5fZmluZElucHV0LnNldENhc2VTZW5zaXRpdmUodGhpcy5fc3RhdGUubWF0Y2hDYXNlKTtcblx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5zZXRQcmVzZXJ2ZUNhc2UodGhpcy5fc3RhdGUucHJlc2VydmVDYXNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9tYXRjaGVzQ291bnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9tYXRjaGVzQ291bnQuY2xhc3NOYW1lID0gJ21hdGNoZXNDb3VudCc7XG5cdFx0dGhpcy5fdXBkYXRlTWF0Y2hlc0NvdW50KCk7XG5cblx0XHR0aGlzLnByZXZCdG4gPSB0aGlzLl9yZWdpc3RlcihuZXcgU2ltcGxlQnV0dG9uKHtcblx0XHRcdGxhYmVsOiBOTFNfUFJFVklPVVNfTUFUQ0hfQlROX0xBQkVMLFxuXHRcdFx0aWNvbjogZmluZFByZXZpb3VzTWF0Y2hJY29uLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdFx0b25UcmlnZ2VyOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZmluZCh0cnVlKTtcblx0XHRcdH1cblx0XHR9LCBob3ZlclNlcnZpY2UpKTtcblxuXHRcdHRoaXMubmV4dEJ0biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTaW1wbGVCdXR0b24oe1xuXHRcdFx0bGFiZWw6IE5MU19ORVhUX01BVENIX0JUTl9MQUJFTCxcblx0XHRcdGljb246IGZpbmROZXh0TWF0Y2hJY29uLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdFx0b25UcmlnZ2VyOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZmluZChmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSwgaG92ZXJTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLmluU2VsZWN0aW9uVG9nZ2xlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRvZ2dsZSh7XG5cdFx0XHRpY29uOiBmaW5kU2VsZWN0aW9uSWNvbixcblx0XHRcdHRpdGxlOiBOTFNfVE9HR0xFX1NFTEVDVElPTl9GSU5EX1RJVExFLFxuXHRcdFx0aXNDaGVja2VkOiBmYWxzZSxcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHRcdGlucHV0QWN0aXZlT3B0aW9uQmFja2dyb3VuZDogYXNDc3NWYXJpYWJsZShpbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQpLFxuXHRcdFx0aW5wdXRBY3RpdmVPcHRpb25Cb3JkZXI6IGFzQ3NzVmFyaWFibGUoaW5wdXRBY3RpdmVPcHRpb25Cb3JkZXIpLFxuXHRcdFx0aW5wdXRBY3RpdmVPcHRpb25Gb3JlZ3JvdW5kOiBhc0Nzc1ZhcmlhYmxlKGlucHV0QWN0aXZlT3B0aW9uRm9yZWdyb3VuZCksXG5cdFx0fSkpO1xuXHRcdHRoaXMuaW5TZWxlY3Rpb25Ub2dnbGUuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZSc7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluU2VsZWN0aW9uVG9nZ2xlLm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNvbnN0IGNoZWNrZWQgPSB0aGlzLmluU2VsZWN0aW9uVG9nZ2xlLmNoZWNrZWQ7XG5cdFx0XHRpZiAoY2hlY2tlZCkge1xuXHRcdFx0XHQvLyBzZWxlY3Rpb24gbG9naWM6XG5cdFx0XHRcdC8vIDEuIGlmIHRoZXJlIGFyZSBtdWx0aXBsZSBjZWxscywgZG8gdGhhdC5cblx0XHRcdFx0Ly8gMi4gaWYgdGhlcmUgaXMgb25seSBvbmUgY2VsbCwgZG8gdGhlIGZvbGxvd2luZzpcblx0XHRcdFx0Ly8gXHRcdC0gaWYgdGhlcmUgaXMgYSBtdWx0aS1saW5lIHJhbmdlIGhpZ2hsaWdodGVkLCB0ZXh0dWFsIGluIHNlbGVjdGlvblxuXHRcdFx0XHQvLyBcdFx0LSBpZiB0aGVyZSBpcyBubyByYW5nZSwgY2VsbCBpbiBzZWxlY3Rpb24gZm9yIHRoYXQgY2VsbFxuXG5cdFx0XHRcdGNvbnN0IGNlbGxTZWxlY3Rpb246IElDZWxsUmFuZ2VbXSA9IHRoaXMuX25vdGVib29rRWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRcdFx0Y29uc3QgdGV4dFNlbGVjdGlvbjogUmFuZ2VbXSA9IHRoaXMuX25vdGVib29rRWRpdG9yLmdldFNlbGVjdGlvblZpZXdNb2RlbHMoKVswXS5nZXRTZWxlY3Rpb25zKCk7XG5cblx0XHRcdFx0aWYgKGNlbGxTZWxlY3Rpb24ubGVuZ3RoID4gMSB8fCBjZWxsU2VsZWN0aW9uLnNvbWUocmFuZ2UgPT4gcmFuZ2UuZW5kIC0gcmFuZ2Uuc3RhcnQgPiAxKSkge1xuXHRcdFx0XHRcdHRoaXMuX2ZpbHRlcnMuZmluZFNjb3BlID0ge1xuXHRcdFx0XHRcdFx0ZmluZFNjb3BlVHlwZTogTm90ZWJvb2tGaW5kU2NvcGVUeXBlLkNlbGxzLFxuXHRcdFx0XHRcdFx0c2VsZWN0ZWRDZWxsUmFuZ2VzOiBjZWxsU2VsZWN0aW9uXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0aGlzLnNldENlbGxTZWxlY3Rpb25EZWNvcmF0aW9ucygpO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAodGV4dFNlbGVjdGlvbi5sZW5ndGggPiAxIHx8IHRleHRTZWxlY3Rpb24uc29tZShyYW5nZSA9PiByYW5nZS5lbmRMaW5lTnVtYmVyIC0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID49IDEpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmlsdGVycy5maW5kU2NvcGUgPSB7XG5cdFx0XHRcdFx0XHRmaW5kU2NvcGVUeXBlOiBOb3RlYm9va0ZpbmRTY29wZVR5cGUuVGV4dCxcblx0XHRcdFx0XHRcdHNlbGVjdGVkQ2VsbFJhbmdlczogY2VsbFNlbGVjdGlvbixcblx0XHRcdFx0XHRcdHNlbGVjdGVkVGV4dFJhbmdlczogdGV4dFNlbGVjdGlvblxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0dGhpcy5zZXRUZXh0U2VsZWN0aW9uRGVjb3JhdGlvbnModGV4dFNlbGVjdGlvbiwgdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0U2VsZWN0aW9uVmlld01vZGVscygpWzBdKTtcblxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2ZpbHRlcnMuZmluZFNjb3BlID0ge1xuXHRcdFx0XHRcdFx0ZmluZFNjb3BlVHlwZTogTm90ZWJvb2tGaW5kU2NvcGVUeXBlLkNlbGxzLFxuXHRcdFx0XHRcdFx0c2VsZWN0ZWRDZWxsUmFuZ2VzOiBjZWxsU2VsZWN0aW9uXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0aGlzLnNldENlbGxTZWxlY3Rpb25EZWNvcmF0aW9ucygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9maWx0ZXJzLmZpbmRTY29wZSA9IHtcblx0XHRcdFx0XHRmaW5kU2NvcGVUeXBlOiBOb3RlYm9va0ZpbmRTY29wZVR5cGUuTm9uZVxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLmNsZWFyQ2VsbFNlbGVjdGlvbkRlY29yYXRpb25zKCk7XG5cdFx0XHRcdHRoaXMuY2xlYXJUZXh0U2VsZWN0aW9uRGVjb3JhdGlvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBjbG9zZUJ0biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTaW1wbGVCdXR0b24oe1xuXHRcdFx0bGFiZWw6IE5MU19DTE9TRV9CVE5fTEFCRUwsXG5cdFx0XHRpY29uOiB3aWRnZXRDbG9zZSxcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHRcdG9uVHJpZ2dlcjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdH1cblx0XHR9LCBob3ZlclNlcnZpY2UpKTtcblxuXHRcdHRoaXMuX2lubmVyRmluZERvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fZmluZElucHV0LmRvbU5vZGUpO1xuXHRcdHRoaXMuX2lubmVyRmluZERvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fbWF0Y2hlc0NvdW50KTtcblx0XHR0aGlzLl9pbm5lckZpbmREb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMucHJldkJ0bi5kb21Ob2RlKTtcblx0XHR0aGlzLl9pbm5lckZpbmREb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMubmV4dEJ0bi5kb21Ob2RlKTtcblx0XHR0aGlzLl9pbm5lckZpbmREb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuaW5TZWxlY3Rpb25Ub2dnbGUuZG9tTm9kZSk7XG5cdFx0dGhpcy5faW5uZXJGaW5kRG9tTm9kZS5hcHBlbmRDaGlsZChjbG9zZUJ0bi5kb21Ob2RlKTtcblxuXHRcdC8vIF9kb21Ob2RlIHdyYXBzIF9pbm5lckRvbU5vZGUsIGVuc3VyaW5nIHRoYXRcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2lubmVyRmluZERvbU5vZGUpO1xuXG5cdFx0dGhpcy5vbmtleXVwKHRoaXMuX2lubmVyRmluZERvbU5vZGUsIGUgPT4ge1xuXHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSkge1xuXHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9mb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3Rlcihkb20udHJhY2tGb2N1cyh0aGlzLl9kb21Ob2RlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZm9jdXNUcmFja2VyLm9uRGlkRm9jdXModGhpcy5vbkZvY3VzVHJhY2tlckZvY3VzLmJpbmQodGhpcykpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9mb2N1c1RyYWNrZXIub25EaWRCbHVyKHRoaXMub25Gb2N1c1RyYWNrZXJCbHVyLmJpbmQodGhpcykpKTtcblxuXHRcdHRoaXMuX2ZpbmRJbnB1dEZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGRvbS50cmFja0ZvY3VzKHRoaXMuX2ZpbmRJbnB1dC5kb21Ob2RlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmluZElucHV0Rm9jdXNUcmFja2VyLm9uRGlkRm9jdXModGhpcy5vbkZpbmRJbnB1dEZvY3VzVHJhY2tlckZvY3VzLmJpbmQodGhpcykpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maW5kSW5wdXRGb2N1c1RyYWNrZXIub25EaWRCbHVyKHRoaXMub25GaW5kSW5wdXRGb2N1c1RyYWNrZXJCbHVyLmJpbmQodGhpcykpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5faW5uZXJGaW5kRG9tTm9kZSwgJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG5cdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZXBsYWNlXG5cdFx0dGhpcy5faW5uZXJSZXBsYWNlRG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2lubmVyUmVwbGFjZURvbU5vZGUuY2xhc3NMaXN0LmFkZCgnc2ltcGxlLWZyLXJlcGxhY2UtcGFydCcpO1xuXG5cdFx0dGhpcy5fcmVwbGFjZUlucHV0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IENvbnRleHRTY29wZWRSZXBsYWNlSW5wdXQobnVsbCwgdW5kZWZpbmVkLCB7XG5cdFx0XHRsYWJlbDogTkxTX1JFUExBQ0VfSU5QVVRfTEFCRUwsXG5cdFx0XHRwbGFjZWhvbGRlcjogTkxTX1JFUExBQ0VfSU5QVVRfUExBQ0VIT0xERVIsXG5cdFx0XHRoaXN0b3J5OiByZXBsYWNlSGlzdG9yeUNvbmZpZyA9PT0gJ3dvcmtzcGFjZScgPyB0aGlzLl9yZXBsYWNlV2lkZ2V0SGlzdG9yeSA6IG5ldyBTZXQoW10pLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHRcdHRvZ2dsZVN0eWxlczogZGVmYXVsdFRvZ2dsZVN0eWxlcyxcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHR9LCBjb250ZXh0S2V5U2VydmljZSwgZmFsc2UpKTtcblx0XHR0aGlzLl9pbm5lclJlcGxhY2VEb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX3JlcGxhY2VJbnB1dC5kb21Ob2RlKTtcblx0XHR0aGlzLl9yZXBsYWNlSW5wdXRGb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3Rlcihkb20udHJhY2tGb2N1cyh0aGlzLl9yZXBsYWNlSW5wdXQuZG9tTm9kZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlcGxhY2VJbnB1dEZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKHRoaXMub25SZXBsYWNlSW5wdXRGb2N1c1RyYWNrZXJGb2N1cy5iaW5kKHRoaXMpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVwbGFjZUlucHV0Rm9jdXNUcmFja2VyLm9uRGlkQmx1cih0aGlzLm9uUmVwbGFjZUlucHV0Rm9jdXNUcmFja2VyQmx1ci5iaW5kKHRoaXMpKSk7XG5cblx0XHQvLyBSZXBsYWNlIEhpc3Rvcnkgd2l0aCB1cGRhdGUgZGVsYXllclxuXHRcdHRoaXMuX3VwZGF0ZVJlcGxhY2VIaXN0b3J5RGVsYXllciA9IG5ldyBEZWxheWVyPHZvaWQ+KDUwMCk7XG5cblx0XHR0aGlzLm9uaW5wdXQodGhpcy5fcmVwbGFjZUlucHV0LmRvbU5vZGUsIChlKSA9PiB7XG5cdFx0XHR0aGlzLl9kZWxheWVkVXBkYXRlUmVwbGFjZUhpc3RvcnkoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyByZXBsYWNlU3RyaW5nOiB0aGlzLl9yZXBsYWNlSW5wdXQuZ2V0VmFsdWUoKSB9LCB0cnVlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2lubmVyUmVwbGFjZURvbU5vZGUpO1xuXG5cdFx0dGhpcy5fdXBkYXRlUmVwbGFjZVZpZXdEaXNwbGF5KCk7XG5cblx0XHR0aGlzLl9yZXBsYWNlQnRuID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNpbXBsZUJ1dHRvbih7XG5cdFx0XHRsYWJlbDogTkxTX1JFUExBQ0VfQlROX0xBQkVMLFxuXHRcdFx0aWNvbjogZmluZFJlcGxhY2VJY29uLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdFx0b25UcmlnZ2VyOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMucmVwbGFjZU9uZSgpO1xuXHRcdFx0fVxuXHRcdH0sIGhvdmVyU2VydmljZSkpO1xuXG5cdFx0Ly8gUmVwbGFjZSBhbGwgYnV0dG9uXG5cdFx0dGhpcy5fcmVwbGFjZUFsbEJ0biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTaW1wbGVCdXR0b24oe1xuXHRcdFx0bGFiZWw6IE5MU19SRVBMQUNFX0FMTF9CVE5fTEFCRUwsXG5cdFx0XHRpY29uOiBmaW5kUmVwbGFjZUFsbEljb24sXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdFx0XHRvblRyaWdnZXI6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5yZXBsYWNlQWxsKCk7XG5cdFx0XHR9XG5cdFx0fSwgaG92ZXJTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLl9pbm5lclJlcGxhY2VEb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX3JlcGxhY2VCdG4uZG9tTm9kZSk7XG5cdFx0dGhpcy5faW5uZXJSZXBsYWNlRG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9yZXBsYWNlQWxsQnRuLmRvbU5vZGUpO1xuXG5cdFx0dGhpcy5fcmVzaXplU2FzaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTYXNoKHRoaXMuX2RvbU5vZGUsIHsgZ2V0VmVydGljYWxTYXNoTGVmdDogKCkgPT4gMCB9LCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCwgc2l6ZTogMiB9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZXNpemVTYXNoLm9uRGlkU3RhcnQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVzaXplT3JpZ2luYWxXaWR0aCA9IHRoaXMuX2dldERvbVdpZHRoKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVzaXplU2FzaC5vbkRpZENoYW5nZSgoZXZ0OiBJU2FzaEV2ZW50KSA9PiB7XG5cdFx0XHRsZXQgd2lkdGggPSB0aGlzLl9yZXNpemVPcmlnaW5hbFdpZHRoICsgZXZ0LnN0YXJ0WCAtIGV2dC5jdXJyZW50WDtcblx0XHRcdGlmICh3aWR0aCA8IE5PVEVCT09LX0ZJTkRfV0lER0VUX0lOSVRJQUxfV0lEVEgpIHtcblx0XHRcdFx0d2lkdGggPSBOT1RFQk9PS19GSU5EX1dJREdFVF9JTklUSUFMX1dJRFRIO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtYXhXaWR0aCA9IHRoaXMuX2dldE1heFdpZHRoKCk7XG5cdFx0XHRpZiAod2lkdGggPiBtYXhXaWR0aCkge1xuXHRcdFx0XHR3aWR0aCA9IG1heFdpZHRoO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXG5cdFx0XHRpZiAodGhpcy5faXNSZXBsYWNlVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQud2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9maW5kSW5wdXQuZG9tTm9kZSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5sYXlvdXQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZXNpemVTYXNoLm9uRGlkUmVzZXQoKCkgPT4ge1xuXHRcdFx0Ly8gdXNlcnMgZG91YmxlIGNsaWNrIG9uIHRoZSBzYXNoXG5cdFx0XHQvLyB0cnkgdG8gZW11bGF0ZSB3aGF0IGhhcHBlbnMgd2l0aCBlZGl0b3IgZmluZFdpZGdldFxuXHRcdFx0Y29uc3QgY3VycmVudFdpZHRoID0gdGhpcy5fZ2V0RG9tV2lkdGgoKTtcblx0XHRcdGxldCB3aWR0aCA9IE5PVEVCT09LX0ZJTkRfV0lER0VUX0lOSVRJQUxfV0lEVEg7XG5cblx0XHRcdGlmIChjdXJyZW50V2lkdGggPD0gTk9URUJPT0tfRklORF9XSURHRVRfSU5JVElBTF9XSURUSCkge1xuXHRcdFx0XHR3aWR0aCA9IHRoaXMuX2dldE1heFdpZHRoKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0XHRpZiAodGhpcy5faXNSZXBsYWNlVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQud2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9maW5kSW5wdXQuZG9tTm9kZSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5sYXlvdXQoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRNYXhXaWR0aCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0TGF5b3V0SW5mbygpLndpZHRoIC0gNjQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREb21XaWR0aCgpIHtcblx0XHRyZXR1cm4gZG9tLmdldFRvdGFsV2lkdGgodGhpcy5fZG9tTm9kZSkgLSAoTk9URUJPT0tfRklORF9XSURHRVRfSU5JVElBTF9IT1JJWk9OVEFMX1BBRERJTkcgKiAyKTtcblx0fVxuXG5cdGdldENlbGxUb29sYmFyQWN0aW9ucyhtZW51OiBJTWVudSk6IHsgcHJpbWFyeTogSUFjdGlvbltdOyBzZWNvbmRhcnk6IElBY3Rpb25bXSB9IHtcblx0XHRyZXR1cm4gZ2V0QWN0aW9uQmFyQWN0aW9ucyhtZW51LmdldEFjdGlvbnMoeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KSwgZyA9PiAvXmlubGluZS8udGVzdChnKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3Qgb25JbnB1dENoYW5nZWQoKTogYm9vbGVhbjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGZpbmQocHJldmlvdXM6IGJvb2xlYW4pOiB2b2lkO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgcmVwbGFjZU9uZSgpOiB2b2lkO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgcmVwbGFjZUFsbCgpOiB2b2lkO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3Qgb25Gb2N1c1RyYWNrZXJGb2N1cygpOiB2b2lkO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3Qgb25Gb2N1c1RyYWNrZXJCbHVyKCk6IHZvaWQ7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBvbkZpbmRJbnB1dEZvY3VzVHJhY2tlckZvY3VzKCk6IHZvaWQ7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBvbkZpbmRJbnB1dEZvY3VzVHJhY2tlckJsdXIoKTogdm9pZDtcblx0cHJvdGVjdGVkIGFic3RyYWN0IG9uUmVwbGFjZUlucHV0Rm9jdXNUcmFja2VyRm9jdXMoKTogdm9pZDtcblx0cHJvdGVjdGVkIGFic3RyYWN0IG9uUmVwbGFjZUlucHV0Rm9jdXNUcmFja2VyQmx1cigpOiB2b2lkO1xuXG5cdHByb3RlY3RlZCBnZXQgaW5wdXRWYWx1ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZmluZElucHV0LmdldFZhbHVlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0IHJlcGxhY2VWYWx1ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVwbGFjZUlucHV0LmdldFZhbHVlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0IHJlcGxhY2VQYXR0ZXJuKCkge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5pc1JlZ2V4KSB7XG5cdFx0XHRyZXR1cm4gcGFyc2VSZXBsYWNlU3RyaW5nKHRoaXMucmVwbGFjZVZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIFJlcGxhY2VQYXR0ZXJuLmZyb21TdGF0aWNWYWx1ZSh0aGlzLnJlcGxhY2VWYWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGZvY3VzVHJhY2tlcigpOiBkb20uSUZvY3VzVHJhY2tlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZvY3VzVHJhY2tlcjtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1Zpc2libGU7XG5cdH1cblxuXHRwcml2YXRlIF9vblN0YXRlQ2hhbmdlZChlOiBGaW5kUmVwbGFjZVN0YXRlQ2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fdXBkYXRlQnV0dG9ucygpO1xuXHRcdHRoaXMuX3VwZGF0ZU1hdGNoZXNDb3VudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQnV0dG9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl9maW5kSW5wdXQuc2V0RW5hYmxlZCh0aGlzLl9pc1Zpc2libGUpO1xuXHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5zZXRFbmFibGVkKHRoaXMuX2lzVmlzaWJsZSAmJiB0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKTtcblx0XHRjb25zdCBmaW5kSW5wdXRJc05vbkVtcHR5ID0gKHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZy5sZW5ndGggPiAwKTtcblx0XHR0aGlzLl9yZXBsYWNlQnRuLnNldEVuYWJsZWQodGhpcy5faXNWaXNpYmxlICYmIHRoaXMuX2lzUmVwbGFjZVZpc2libGUgJiYgZmluZElucHV0SXNOb25FbXB0eSk7XG5cdFx0dGhpcy5fcmVwbGFjZUFsbEJ0bi5zZXRFbmFibGVkKHRoaXMuX2lzVmlzaWJsZSAmJiB0aGlzLl9pc1JlcGxhY2VWaXNpYmxlICYmIGZpbmRJbnB1dElzTm9uRW1wdHkpO1xuXG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdyZXBsYWNlVG9nZ2xlZCcsIHRoaXMuX2lzUmVwbGFjZVZpc2libGUpO1xuXHRcdHRoaXMuX3RvZ2dsZVJlcGxhY2VCdG4uc2V0RXhwYW5kZWQodGhpcy5faXNSZXBsYWNlVmlzaWJsZSk7XG5cblx0XHR0aGlzLmZvdW5kTWF0Y2ggPSB0aGlzLl9zdGF0ZS5tYXRjaGVzQ291bnQgPiAwO1xuXHRcdHRoaXMudXBkYXRlQnV0dG9ucyh0aGlzLmZvdW5kTWF0Y2gpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRDZWxsU2VsZWN0aW9uRGVjb3JhdGlvbnMoKSB7XG5cdFx0Y29uc3QgY2VsbEhhbmRsZXM6IG51bWJlcltdID0gW107XG5cdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0U2VsZWN0aW9uVmlld01vZGVscygpLmZvckVhY2godmlld01vZGVsID0+IHtcblx0XHRcdGNlbGxIYW5kbGVzLnB1c2godmlld01vZGVsLmhhbmRsZSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBkZWNvcmF0aW9uczogSU5vdGVib29rRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGhhbmRsZSBvZiBjZWxsSGFuZGxlcykge1xuXHRcdFx0ZGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdGhhbmRsZTogaGFuZGxlLFxuXHRcdFx0XHRvcHRpb25zOiB7IGNsYXNzTmFtZTogJ25iLW11bHRpQ2VsbEhpZ2hsaWdodCcsIG91dHB1dENsYXNzTmFtZTogJ25iLW11bHRpQ2VsbEhpZ2hsaWdodCcgfVxuXHRcdFx0fSBzYXRpc2ZpZXMgSU5vdGVib29rRGVsdGFEZWNvcmF0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5jZWxsU2VsZWN0aW9uRGVjb3JhdGlvbklkcyA9IHRoaXMuX25vdGVib29rRWRpdG9yLmRlbHRhQ2VsbERlY29yYXRpb25zKFtdLCBkZWNvcmF0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyQ2VsbFNlbGVjdGlvbkRlY29yYXRpb25zKCkge1xuXHRcdHRoaXMuX25vdGVib29rRWRpdG9yLmRlbHRhQ2VsbERlY29yYXRpb25zKHRoaXMuY2VsbFNlbGVjdGlvbkRlY29yYXRpb25JZHMsIFtdKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0VGV4dFNlbGVjdGlvbkRlY29yYXRpb25zKHRleHRSYW5nZXM6IFJhbmdlW10sIGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IuY2hhbmdlTW9kZWxEZWNvcmF0aW9ucyhjaGFuZ2VBY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uczogSUNlbGxNb2RlbERlbHRhRGVjb3JhdGlvbnNbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiB0ZXh0UmFuZ2VzKSB7XG5cdFx0XHRcdGRlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdG93bmVySWQ6IGNlbGwuaGFuZGxlLFxuXHRcdFx0XHRcdGRlY29yYXRpb25zOiBbe1xuXHRcdFx0XHRcdFx0cmFuZ2U6IHJhbmdlLFxuXHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3RleHQgc2VhcmNoIHJhbmdlIGZvciBub3RlYm9vayBzZWFyY2ggc2NvcGUnLFxuXHRcdFx0XHRcdFx0XHRpc1dob2xlTGluZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lOiAnbmItZmluZFNjb3BlJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy50ZXh0U2VsZWN0aW9uRGVjb3JhdGlvbklkcyA9IGNoYW5nZUFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMoW10sIGRlY29yYXRpb25zKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJUZXh0U2VsZWN0aW9uRGVjb3JhdGlvbnMoKSB7XG5cdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IuY2hhbmdlTW9kZWxEZWNvcmF0aW9ucyhjaGFuZ2VBY2Nlc3NvciA9PiB7XG5cdFx0XHRjaGFuZ2VBY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKHRoaXMudGV4dFNlbGVjdGlvbkRlY29yYXRpb25JZHMsIFtdKTtcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfdXBkYXRlTWF0Y2hlc0NvdW50KCk6IHZvaWQge1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9kb21Ob2RlLnJlbW92ZSgpO1xuXHR9XG5cblx0cHVibGljIGdldERvbU5vZGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsKGluaXRpYWxJbnB1dD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChpbml0aWFsSW5wdXQpIHtcblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5zZXRWYWx1ZShpbml0aWFsSW5wdXQpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5zZWxlY3QoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9pc1Zpc2libGUgPSB0cnVlO1xuXHRcdHRoaXMudXBkYXRlQnV0dG9ucyh0aGlzLmZvdW5kTWF0Y2gpO1xuXG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnLCAndmlzaWJsZS10cmFuc2l0aW9uJyk7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAnZmFsc2UnKTtcblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5zZWxlY3QoKTtcblx0XHR9LCAwKTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9maW5kSW5wdXQuZm9jdXMoKTtcblx0fVxuXG5cdHB1YmxpYyBzaG93KGluaXRpYWxJbnB1dD86IHN0cmluZywgb3B0aW9ucz86IElTaG93Tm90ZWJvb2tGaW5kV2lkZ2V0T3B0aW9ucyk6IHZvaWQge1xuXHRcdGlmIChpbml0aWFsSW5wdXQpIHtcblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5zZXRWYWx1ZShpbml0aWFsSW5wdXQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzVmlzaWJsZSA9IHRydWU7XG5cblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScsICd2aXNpYmxlLXRyYW5zaXRpb24nKTtcblx0XHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICdmYWxzZScpO1xuXG5cdFx0XHRpZiAob3B0aW9ucz8uZm9jdXMgPz8gdHJ1ZSkge1xuXHRcdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSwgMCk7XG5cdH1cblxuXHRwdWJsaWMgc2hvd1dpdGhSZXBsYWNlKGluaXRpYWxJbnB1dD86IHN0cmluZywgcmVwbGFjZUlucHV0Pzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKGluaXRpYWxJbnB1dCkge1xuXHRcdFx0dGhpcy5fZmluZElucHV0LnNldFZhbHVlKGluaXRpYWxJbnB1dCk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlcGxhY2VJbnB1dCkge1xuXHRcdFx0dGhpcy5fcmVwbGFjZUlucHV0LnNldFZhbHVlKHJlcGxhY2VJbnB1dCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNWaXNpYmxlID0gdHJ1ZTtcblx0XHR0aGlzLl9pc1JlcGxhY2VWaXNpYmxlID0gdHJ1ZTtcblx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBpc1JlcGxhY2VSZXZlYWxlZDogdGhpcy5faXNSZXBsYWNlVmlzaWJsZSB9LCBmYWxzZSk7XG5cdFx0dGhpcy5fdXBkYXRlUmVwbGFjZVZpZXdEaXNwbGF5KCk7XG5cblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScsICd2aXNpYmxlLXRyYW5zaXRpb24nKTtcblx0XHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICdmYWxzZScpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQnV0dG9ucygpO1xuXG5cdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQuZm9jdXMoKTtcblx0XHR9LCAwKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVJlcGxhY2VWaWV3RGlzcGxheSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNSZXBsYWNlVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5faW5uZXJSZXBsYWNlRG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pbm5lclJlcGxhY2VEb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVwbGFjZUlucHV0LndpZHRoID0gZG9tLmdldFRvdGFsV2lkdGgodGhpcy5fZmluZElucHV0LmRvbU5vZGUpO1xuXHR9XG5cblx0cHVibGljIGhpZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5pblNlbGVjdGlvblRvZ2dsZS5jaGVja2VkID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5kZWx0YUNlbGxEZWNvcmF0aW9ucyh0aGlzLmNlbGxTZWxlY3Rpb25EZWNvcmF0aW9uSWRzLCBbXSk7XG5cdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5jaGFuZ2VNb2RlbERlY29yYXRpb25zKGNoYW5nZUFjY2Vzc29yID0+IHtcblx0XHRcdFx0Y2hhbmdlQWNjZXNzb3IuZGVsdGFEZWNvcmF0aW9ucyh0aGlzLnRleHRTZWxlY3Rpb25EZWNvcmF0aW9uSWRzLCBbXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlLXRyYW5zaXRpb24nKTtcblx0XHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHQvLyBOZWVkIHRvIGRlbGF5IHRvZ2dsaW5nIHZpc2liaWxpdHkgdW50aWwgYWZ0ZXIgVHJhbnNpdGlvbiwgdGhlbiB2aXNpYmlsaXR5IGhpZGRlbiAtIHJlbW92ZXMgZnJvbSB0YWJJbmRleCBsaXN0XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5faXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMudXBkYXRlQnV0dG9ucyh0aGlzLmZvdW5kTWF0Y2gpO1xuXHRcdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKTtcblx0XHRcdH0sIDIwMCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9kZWxheWVkVXBkYXRlRmluZEhpc3RvcnkoKSB7XG5cdFx0dGhpcy5fdXBkYXRlRmluZEhpc3RvcnlEZWxheWVyLnRyaWdnZXIodGhpcy5fdXBkYXRlRmluZEhpc3RvcnkuYmluZCh0aGlzKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3VwZGF0ZUZpbmRIaXN0b3J5KCkge1xuXHRcdHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5hZGRUb0hpc3RvcnkoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZGVsYXllZFVwZGF0ZVJlcGxhY2VIaXN0b3J5KCkge1xuXHRcdHRoaXMuX3VwZGF0ZVJlcGxhY2VIaXN0b3J5RGVsYXllci50cmlnZ2VyKHRoaXMuX3VwZGF0ZVJlcGxhY2VIaXN0b3J5LmJpbmQodGhpcykpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF91cGRhdGVSZXBsYWNlSGlzdG9yeSgpIHtcblx0XHR0aGlzLl9yZXBsYWNlSW5wdXQuaW5wdXRCb3guYWRkVG9IaXN0b3J5KCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFJlZ2V4VmFsdWUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbmRJbnB1dC5nZXRSZWdleCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRXaG9sZVdvcmRWYWx1ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZmluZElucHV0LmdldFdob2xlV29yZHMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0Q2FzZVNlbnNpdGl2ZVZhbHVlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9maW5kSW5wdXQuZ2V0Q2FzZVNlbnNpdGl2ZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZUJ1dHRvbnMoZm91bmRNYXRjaDogYm9vbGVhbikge1xuXHRcdGNvbnN0IGhhc0lucHV0ID0gdGhpcy5pbnB1dFZhbHVlLmxlbmd0aCA+IDA7XG5cdFx0dGhpcy5wcmV2QnRuLnNldEVuYWJsZWQodGhpcy5faXNWaXNpYmxlICYmIGhhc0lucHV0ICYmIGZvdW5kTWF0Y2gpO1xuXHRcdHRoaXMubmV4dEJ0bi5zZXRFbmFibGVkKHRoaXMuX2lzVmlzaWJsZSAmJiBoYXNJbnB1dCAmJiBmb3VuZE1hdGNoKTtcblx0fVxufVxuXG4vLyB0aGVtaW5nXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWUsIGNvbGxlY3RvcikgPT4ge1xuXHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdC5ub3RlYm9vay1lZGl0b3Ige1xuXHRcdC0tbm90ZWJvb2stZmluZC13aWR0aDogJHtOT1RFQk9PS19GSU5EX1dJREdFVF9JTklUSUFMX1dJRFRIfXB4O1xuXHRcdC0tbm90ZWJvb2stZmluZC1ob3Jpem9udGFsLXBhZGRpbmc6ICR7Tk9URUJPT0tfRklORF9XSURHRVRfSU5JVElBTF9IT1JJWk9OVEFMX1BBRERJTkd9cHg7XG5cdH1cblx0YCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksU0FBUztBQUNyQixPQUFPO0FBQ1AsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyx1QkFBNkM7QUFDdEQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxpQkFBb0M7QUFHN0MsU0FBUyxtQkFBbUI7QUFDNUIsU0FBcUIsYUFBYSxZQUFZO0FBQzlDLFNBQXdCLGNBQWM7QUFDdEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsUUFBUSxjQUFzQyxpQkFBaUI7QUFDeEUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsd0JBQXNEO0FBQy9ELFNBQVMsbUJBQW1CLHVCQUF1QixvQkFBb0IsaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFDL0gsU0FBUyxvQkFBb0Isc0JBQXNCO0FBQ25ELFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLDJCQUEyQixpREFBaUQ7QUFFckYsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUIsMEJBQTBCLDJCQUEyQjtBQUNyRixTQUFTLGVBQWUsNkJBQTZCLHlCQUF5QixtQ0FBbUM7QUFDakgsU0FBUyxjQUFjLG1CQUFtQjtBQUMxQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDJCQUEyQjtBQUdwQyxTQUFTLHVCQUF1Qix1QkFB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
