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
import { alert as alertFn } from "../../../../base/browser/ui/aria/aria.js";
import { Delayer } from "../../../../base/common/async.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import * as strings from "../../../../base/common/strings.js";
import { EditorAction, EditorCommand, EditorContributionInstantiation, MultiEditorAction, registerEditorAction, registerEditorCommand, registerEditorContribution, registerMultiEditorAction } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { overviewRulerRangeHighlight } from "../../../common/core/editorColorRegistry.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { OverviewRulerLane } from "../../../common/model.js";
import { CONTEXT_FIND_INPUT_FOCUSED, CONTEXT_FIND_WIDGET_VISIBLE, CONTEXT_REPLACE_INPUT_FOCUSED, FindModelBoundToEditorModel, FIND_IDS, ToggleCaseSensitiveKeybinding, TogglePreserveCaseKeybinding, ToggleRegexKeybinding, ToggleSearchScopeKeybinding, ToggleWholeWordKeybinding } from "./findModel.js";
import { FindOptionsWidget } from "./findOptionsWidget.js";
import { FindReplaceState } from "./findState.js";
import { FindWidget, NLS_NO_RESULTS } from "./findWidget.js";
import * as nls from "../../../../nls.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { FindWidgetSearchHistory } from "./findWidgetSearchHistory.js";
import { ReplaceWidgetHistory } from "./replaceWidgetHistory.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
const SEARCH_STRING_MAX_LENGTH = 524288;
function getSelectionSearchString(editor, seedSearchStringFromSelection = "single", seedSearchStringFromNonEmptySelection = false) {
  if (!editor.hasModel()) {
    return null;
  }
  const selection = editor.getSelection();
  if (seedSearchStringFromSelection === "single" && selection.startLineNumber === selection.endLineNumber || seedSearchStringFromSelection === "multiple") {
    if (selection.isEmpty()) {
      const wordAtPosition = editor.getConfiguredWordAtPosition(selection.getStartPosition());
      if (wordAtPosition && false === seedSearchStringFromNonEmptySelection) {
        return wordAtPosition.word;
      }
    } else {
      if (editor.getModel().getValueLengthInRange(selection) < SEARCH_STRING_MAX_LENGTH) {
        return editor.getModel().getValueInRange(selection);
      }
    }
  }
  return null;
}
var FindStartFocusAction = /* @__PURE__ */ ((FindStartFocusAction2) => {
  FindStartFocusAction2[FindStartFocusAction2["NoFocusChange"] = 0] = "NoFocusChange";
  FindStartFocusAction2[FindStartFocusAction2["FocusFindInput"] = 1] = "FocusFindInput";
  FindStartFocusAction2[FindStartFocusAction2["FocusReplaceInput"] = 2] = "FocusReplaceInput";
  return FindStartFocusAction2;
})(FindStartFocusAction || {});
let CommonFindController = class extends Disposable {
  get editor() {
    return this._editor;
  }
  static get(editor) {
    return editor.getContribution(CommonFindController.ID);
  }
  constructor(editor, contextKeyService, storageService, clipboardService, notificationService, hoverService) {
    super();
    this._editor = editor;
    this._findWidgetVisible = CONTEXT_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
    this._contextKeyService = contextKeyService;
    this._storageService = storageService;
    this._clipboardService = clipboardService;
    this._notificationService = notificationService;
    this._hoverService = hoverService;
    this._updateHistoryDelayer = this._register(new Delayer(500));
    this._state = this._register(new FindReplaceState());
    this.loadQueryState();
    this._register(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));
    this._model = null;
    this._register(this._editor.onDidChangeModel(() => {
      const shouldRestartFind = this._editor.getModel() && this._state.isRevealed;
      this.disposeModel();
      this._state.change({
        searchScope: null,
        matchCase: this._storageService.getBoolean("editor.matchCase", StorageScope.WORKSPACE, false),
        wholeWord: this._storageService.getBoolean("editor.wholeWord", StorageScope.WORKSPACE, false),
        isRegex: this._storageService.getBoolean("editor.isRegex", StorageScope.WORKSPACE, false),
        preserveCase: this._storageService.getBoolean("editor.preserveCase", StorageScope.WORKSPACE, false)
      }, false);
      if (shouldRestartFind) {
        this._start({
          forceRevealReplace: false,
          seedSearchStringFromSelection: "none",
          seedSearchStringFromNonEmptySelection: false,
          seedSearchStringFromGlobalClipboard: false,
          shouldFocus: 0 /* NoFocusChange */,
          shouldAnimate: false,
          updateSearchScope: false,
          loop: this._editor.getOption(EditorOption.find).loop
        });
      }
    }));
  }
  dispose() {
    this.disposeModel();
    super.dispose();
  }
  disposeModel() {
    if (this._model) {
      this._model.dispose();
      this._model = null;
    }
  }
  _onStateChanged(e) {
    this.saveQueryState(e);
    if (e.isRevealed) {
      if (this._state.isRevealed) {
        this._findWidgetVisible.set(true);
      } else {
        this._findWidgetVisible.reset();
        this.disposeModel();
      }
    }
    if (e.searchString) {
      this.setGlobalBufferTerm(this._state.searchString);
    }
  }
  saveQueryState(e) {
    if (e.isRegex) {
      this._storageService.store("editor.isRegex", this._state.actualIsRegex, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
    if (e.wholeWord) {
      this._storageService.store("editor.wholeWord", this._state.actualWholeWord, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
    if (e.matchCase) {
      this._storageService.store("editor.matchCase", this._state.actualMatchCase, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
    if (e.preserveCase) {
      this._storageService.store("editor.preserveCase", this._state.actualPreserveCase, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  loadQueryState() {
    this._state.change({
      matchCase: this._storageService.getBoolean("editor.matchCase", StorageScope.WORKSPACE, this._state.matchCase),
      wholeWord: this._storageService.getBoolean("editor.wholeWord", StorageScope.WORKSPACE, this._state.wholeWord),
      isRegex: this._storageService.getBoolean("editor.isRegex", StorageScope.WORKSPACE, this._state.isRegex),
      preserveCase: this._storageService.getBoolean("editor.preserveCase", StorageScope.WORKSPACE, this._state.preserveCase)
    }, false);
  }
  isFindInputFocused() {
    return !!CONTEXT_FIND_INPUT_FOCUSED.getValue(this._contextKeyService);
  }
  /**
   * Returns whether the Replace input was the last focused input in the find widget.
   * Returns false by default; overridden in FindController.
   */
  wasReplaceInputLastFocused() {
    return false;
  }
  /**
   * Focuses the last focused element in the find widget.
   * Implemented by FindController; base implementation does nothing.
   */
  focusLastElement() {
  }
  getState() {
    return this._state;
  }
  closeFindWidget() {
    this._state.change({
      isRevealed: false,
      searchScope: null
    }, false);
    this._editor.focus();
  }
  toggleCaseSensitive() {
    this._state.change({ matchCase: !this._state.matchCase }, false);
    if (!this._state.isRevealed) {
      this.highlightFindOptions();
    }
  }
  toggleWholeWords() {
    this._state.change({ wholeWord: !this._state.wholeWord }, false);
    if (!this._state.isRevealed) {
      this.highlightFindOptions();
    }
  }
  toggleRegex() {
    this._state.change({ isRegex: !this._state.isRegex }, false);
    if (!this._state.isRevealed) {
      this.highlightFindOptions();
    }
  }
  togglePreserveCase() {
    this._state.change({ preserveCase: !this._state.preserveCase }, false);
    if (!this._state.isRevealed) {
      this.highlightFindOptions();
    }
  }
  toggleSearchScope() {
    if (this._state.searchScope) {
      this._state.change({ searchScope: null }, true);
    } else {
      if (this._editor.hasModel()) {
        let selections = this._editor.getSelections();
        selections = selections.map((selection) => {
          if (selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber) {
            selection = selection.setEndPosition(
              selection.endLineNumber - 1,
              this._editor.getModel().getLineMaxColumn(selection.endLineNumber - 1)
            );
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
    }
  }
  setSearchString(searchString) {
    if (this._state.isRegex) {
      searchString = strings.escapeRegExpCharacters(searchString);
    }
    this._state.change({ searchString }, false);
  }
  highlightFindOptions(ignoreWhenVisible = false) {
  }
  async _start(opts, newState) {
    this.disposeModel();
    if (!this._editor.hasModel()) {
      return;
    }
    const stateChanges = {
      ...newState,
      isRevealed: true
    };
    if (opts.seedSearchStringFromSelection === "single") {
      const selectionSearchString = getSelectionSearchString(this._editor, opts.seedSearchStringFromSelection, opts.seedSearchStringFromNonEmptySelection);
      if (selectionSearchString) {
        if (this._state.isRegex) {
          stateChanges.searchString = strings.escapeRegExpCharacters(selectionSearchString);
        } else {
          stateChanges.searchString = selectionSearchString;
        }
      }
    } else if (opts.seedSearchStringFromSelection === "multiple" && !opts.updateSearchScope) {
      const selectionSearchString = getSelectionSearchString(this._editor, opts.seedSearchStringFromSelection);
      if (selectionSearchString) {
        stateChanges.searchString = selectionSearchString;
      }
    }
    if (!stateChanges.searchString && opts.seedSearchStringFromGlobalClipboard) {
      const selectionSearchString = await this.getGlobalBufferTerm();
      if (!this._editor.hasModel()) {
        return;
      }
      if (selectionSearchString) {
        stateChanges.searchString = selectionSearchString;
      }
    }
    if (opts.forceRevealReplace || stateChanges.isReplaceRevealed) {
      stateChanges.isReplaceRevealed = true;
    } else if (!this._findWidgetVisible.get()) {
      stateChanges.isReplaceRevealed = false;
    }
    if (opts.updateSearchScope) {
      const currentSelections = this._editor.getSelections();
      if (currentSelections.some((selection) => !selection.isEmpty())) {
        stateChanges.searchScope = currentSelections;
      }
    }
    stateChanges.loop = opts.loop;
    this._state.change(stateChanges, false);
    if (!this._model) {
      this._model = new FindModelBoundToEditorModel(this._editor, this._state);
    }
  }
  start(opts, newState) {
    return this._start(opts, newState);
  }
  moveToNextMatch() {
    if (this._model) {
      this._model.moveToNextMatch();
      return true;
    }
    return false;
  }
  moveToPrevMatch() {
    if (this._model) {
      this._model.moveToPrevMatch();
      return true;
    }
    return false;
  }
  goToMatch(index) {
    if (this._model) {
      this._model.moveToMatch(index);
      return true;
    }
    return false;
  }
  replace() {
    if (this._model) {
      this._model.replace();
      return true;
    }
    return false;
  }
  replaceAll() {
    if (this._model) {
      if (this._editor.getModel()?.isTooLargeForHeapOperation()) {
        this._notificationService.warn(nls.localize("too.large.for.replaceall", "The file is too large to perform a replace all operation."));
        return false;
      }
      this._model.replaceAll();
      return true;
    }
    return false;
  }
  selectAllMatches() {
    if (this._model) {
      this._model.selectAllMatches();
      this._editor.focus();
      return true;
    }
    return false;
  }
  async getGlobalBufferTerm() {
    if (this._editor.getOption(EditorOption.find).globalFindClipboard && this._editor.hasModel() && !this._editor.getModel().isTooLargeForSyncing()) {
      return this._clipboardService.readFindText();
    }
    return "";
  }
  setGlobalBufferTerm(text) {
    if (this._editor.getOption(EditorOption.find).globalFindClipboard && this._editor.hasModel() && !this._editor.getModel().isTooLargeForSyncing()) {
      this._clipboardService.writeFindText(text);
    }
  }
};
CommonFindController.ID = "editor.contrib.findController";
CommonFindController = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IClipboardService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IHoverService)
], CommonFindController);
let FindController = class extends CommonFindController {
  constructor(editor, _contextViewService, _contextKeyService, _keybindingService, notificationService, _storageService, clipboardService, hoverService, _configurationService, _accessibilityService) {
    super(editor, _contextKeyService, _storageService, clipboardService, notificationService, hoverService);
    this._contextViewService = _contextViewService;
    this._keybindingService = _keybindingService;
    this._configurationService = _configurationService;
    this._accessibilityService = _accessibilityService;
    this._widget = null;
    this._findOptionsWidget = null;
    this._findWidgetSearchHistory = FindWidgetSearchHistory.getOrCreate(_storageService);
    this._replaceWidgetHistory = ReplaceWidgetHistory.getOrCreate(_storageService);
  }
  async _start(opts, newState) {
    if (!this._widget) {
      this._createFindWidget();
    }
    const selection = this._editor.getSelection();
    let updateSearchScope = false;
    switch (this._editor.getOption(EditorOption.find).autoFindInSelection) {
      case "always":
        updateSearchScope = true;
        break;
      case "never":
        updateSearchScope = false;
        break;
      case "multiline": {
        const isSelectionMultipleLine = !!selection && selection.startLineNumber !== selection.endLineNumber;
        updateSearchScope = isSelectionMultipleLine;
        break;
      }
      default:
        break;
    }
    opts.updateSearchScope = opts.updateSearchScope || updateSearchScope;
    await super._start(opts, newState);
    if (this._widget) {
      if (opts.shouldFocus === 2 /* FocusReplaceInput */) {
        this._widget.focusReplaceInput();
      } else if (opts.shouldFocus === 1 /* FocusFindInput */) {
        this._widget.focusFindInput();
      }
    }
  }
  highlightFindOptions(ignoreWhenVisible = false) {
    if (!this._widget) {
      this._createFindWidget();
    }
    if (this._state.isRevealed && !ignoreWhenVisible) {
      this._widget.highlightFindOptions();
    } else {
      this._findOptionsWidget.highlightFindOptions();
    }
  }
  _createFindWidget() {
    this._widget = this._register(new FindWidget(this._editor, this, this._state, this._contextViewService, this._keybindingService, this._contextKeyService, this._hoverService, this._findWidgetSearchHistory, this._replaceWidgetHistory, this._configurationService, this._accessibilityService));
    this._findOptionsWidget = this._register(new FindOptionsWidget(this._editor, this._state, this._keybindingService));
  }
  /**
   * Returns whether the Replace input was the last focused input in the find widget.
   */
  wasReplaceInputLastFocused() {
    return this._widget?.lastFocusedInputWasReplace ?? false;
  }
  /**
   * Focuses the last focused element in the find widget.
   * This is more precise than just focusing the Find or Replace input,
   * as it can restore focus to checkboxes, buttons, etc.
   */
  focusLastElement() {
    this._widget?.focusLastElement();
  }
  saveViewState() {
    return this._widget?.getViewState();
  }
  restoreViewState(state) {
    this._widget?.setViewState(state);
  }
};
FindController = __decorateClass([
  __decorateParam(1, IContextViewService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IClipboardService),
  __decorateParam(7, IHoverService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IAccessibilityService)
], FindController);
const StartFindAction = registerMultiEditorAction(new MultiEditorAction({
  id: FIND_IDS.StartFindAction,
  label: nls.localize2("startFindAction", "Find"),
  precondition: ContextKeyExpr.or(EditorContextKeys.focus, ContextKeyExpr.has("editorIsOpen")),
  kbOpts: {
    kbExpr: null,
    primary: KeyMod.CtrlCmd | KeyCode.KeyF,
    weight: KeybindingWeight.EditorContrib
  },
  menuOpts: {
    menuId: MenuId.MenubarEditMenu,
    group: "3_find",
    title: nls.localize({ key: "miFind", comment: ["&& denotes a mnemonic"] }, "&&Find"),
    order: 1
  }
}));
StartFindAction.addImplementation(0, (accessor, editor, args) => {
  const controller = CommonFindController.get(editor);
  if (!controller) {
    return false;
  }
  return controller.start({
    forceRevealReplace: false,
    seedSearchStringFromSelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection !== "never" ? "single" : "none",
    seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === "selection",
    seedSearchStringFromGlobalClipboard: editor.getOption(EditorOption.find).globalFindClipboard,
    shouldFocus: 1 /* FocusFindInput */,
    shouldAnimate: true,
    updateSearchScope: false,
    loop: editor.getOption(EditorOption.find).loop
  });
});
const findArgDescription = {
  description: "Open a new In-Editor Find Widget.",
  args: [{
    name: "Open a new In-Editor Find Widget args",
    schema: {
      properties: {
        searchString: { type: "string" },
        replaceString: { type: "string" },
        isRegex: { type: "boolean" },
        matchWholeWord: { type: "boolean" },
        isCaseSensitive: { type: "boolean" },
        preserveCase: { type: "boolean" },
        findInSelection: { type: "boolean" }
      }
    }
  }]
};
class StartFindWithArgsAction extends EditorAction {
  constructor() {
    super({
      id: FIND_IDS.StartFindWithArgs,
      label: nls.localize2("startFindWithArgsAction", "Find with Arguments"),
      precondition: void 0,
      kbOpts: {
        kbExpr: null,
        primary: 0,
        weight: KeybindingWeight.EditorContrib
      },
      metadata: findArgDescription
    });
  }
  async run(accessor, editor, args) {
    const controller = CommonFindController.get(editor);
    if (controller) {
      const newState = args ? {
        searchString: args.searchString,
        replaceString: args.replaceString,
        isReplaceRevealed: args.replaceString !== void 0,
        isRegex: args.isRegex,
        // isRegexOverride: args.regexOverride,
        wholeWord: args.matchWholeWord,
        // wholeWordOverride: args.wholeWordOverride,
        matchCase: args.isCaseSensitive,
        // matchCaseOverride: args.matchCaseOverride,
        preserveCase: args.preserveCase
        // preserveCaseOverride: args.preserveCaseOverride,
      } : {};
      await controller.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: controller.getState().searchString.length === 0 && editor.getOption(EditorOption.find).seedSearchStringFromSelection !== "never" ? "single" : "none",
        seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === "selection",
        seedSearchStringFromGlobalClipboard: true,
        shouldFocus: 1 /* FocusFindInput */,
        shouldAnimate: true,
        updateSearchScope: args?.findInSelection || false,
        loop: editor.getOption(EditorOption.find).loop
      }, newState);
      controller.setGlobalBufferTerm(controller.getState().searchString);
    }
  }
}
class StartFindWithSelectionAction extends EditorAction {
  constructor() {
    super({
      id: FIND_IDS.StartFindWithSelection,
      label: nls.localize2("startFindWithSelectionAction", "Find with Selection"),
      precondition: void 0,
      kbOpts: {
        kbExpr: null,
        primary: 0,
        mac: {
          primary: KeyMod.CtrlCmd | KeyCode.KeyE
        },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  async run(accessor, editor) {
    const controller = CommonFindController.get(editor);
    if (controller) {
      await controller.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: "multiple",
        seedSearchStringFromNonEmptySelection: false,
        seedSearchStringFromGlobalClipboard: false,
        shouldFocus: 0 /* NoFocusChange */,
        shouldAnimate: true,
        updateSearchScope: false,
        loop: editor.getOption(EditorOption.find).loop
      });
      controller.setGlobalBufferTerm(controller.getState().searchString);
    }
  }
}
class MatchFindAction extends EditorAction {
  async run(accessor, editor) {
    const controller = CommonFindController.get(editor);
    if (controller && !this._run(controller)) {
      await controller.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: controller.getState().searchString.length === 0 && editor.getOption(EditorOption.find).seedSearchStringFromSelection !== "never" ? "single" : "none",
        seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === "selection",
        seedSearchStringFromGlobalClipboard: true,
        shouldFocus: 0 /* NoFocusChange */,
        shouldAnimate: true,
        updateSearchScope: false,
        loop: editor.getOption(EditorOption.find).loop
      });
      this._run(controller);
    }
  }
}
async function matchFindAction(editor, next) {
  const controller = CommonFindController.get(editor);
  if (!controller) {
    return;
  }
  const shouldCloseOnResult = editor.getOption(EditorOption.find).closeOnResult;
  const wasFindWidgetVisible = controller.getState().isRevealed;
  const runMatch = () => {
    const previousSelection = controller.editor.getSelection();
    const result = next ? controller.moveToNextMatch() : controller.moveToPrevMatch();
    let landedOnMatch = false;
    if (result) {
      const currentSelection = controller.editor.getSelection();
      if (!previousSelection && currentSelection) {
        landedOnMatch = true;
      } else if (previousSelection && currentSelection && !previousSelection.equalsSelection(currentSelection)) {
        landedOnMatch = true;
      }
    }
    if (landedOnMatch) {
      controller.editor.pushUndoStop();
      if (shouldCloseOnResult && wasFindWidgetVisible && controller.isFindInputFocused()) {
        controller.closeFindWidget();
      }
      return true;
    }
    return false;
  };
  if (!runMatch()) {
    await controller.start({
      forceRevealReplace: false,
      seedSearchStringFromSelection: controller.getState().searchString.length === 0 && editor.getOption(EditorOption.find).seedSearchStringFromSelection !== "never" ? "single" : "none",
      seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === "selection",
      seedSearchStringFromGlobalClipboard: true,
      shouldFocus: 0 /* NoFocusChange */,
      shouldAnimate: true,
      updateSearchScope: false,
      loop: editor.getOption(EditorOption.find).loop
    });
    if (!runMatch()) {
      const state = controller.getState();
      if (wasFindWidgetVisible && state.matchesCount === 0 && state.searchString) {
        alertFn(nls.localize("ariaSearchNoResult", "{0} found for '{1}'", NLS_NO_RESULTS, state.searchString));
      }
    }
  }
}
const NextMatchFindAction = registerMultiEditorAction(new MultiEditorAction({
  id: FIND_IDS.NextMatchFindAction,
  label: nls.localize2("findNextMatchAction", "Find Next"),
  precondition: void 0,
  kbOpts: [{
    kbExpr: EditorContextKeys.focus,
    primary: KeyCode.F3,
    mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyG, secondary: [KeyCode.F3] },
    weight: KeybindingWeight.EditorContrib
  }, {
    kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_FIND_INPUT_FOCUSED),
    primary: KeyCode.Enter,
    weight: KeybindingWeight.EditorContrib
  }]
}));
NextMatchFindAction.addImplementation(0, async (accessor, editor, args) => {
  return matchFindAction(editor, true);
});
const PreviousMatchFindAction = registerMultiEditorAction(new MultiEditorAction({
  id: FIND_IDS.PreviousMatchFindAction,
  label: nls.localize2("findPreviousMatchAction", "Find Previous"),
  precondition: void 0,
  kbOpts: [{
    kbExpr: EditorContextKeys.focus,
    primary: KeyMod.Shift | KeyCode.F3,
    mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG, secondary: [KeyMod.Shift | KeyCode.F3] },
    weight: KeybindingWeight.EditorContrib
  }, {
    kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_FIND_INPUT_FOCUSED),
    primary: KeyMod.Shift | KeyCode.Enter,
    weight: KeybindingWeight.EditorContrib
  }]
}));
PreviousMatchFindAction.addImplementation(0, async (accessor, editor, args) => {
  return matchFindAction(editor, false);
});
class MoveToMatchFindAction extends EditorAction {
  constructor() {
    super({
      id: FIND_IDS.GoToMatchFindAction,
      label: nls.localize2("findMatchAction.goToMatch", "Go to Match..."),
      precondition: CONTEXT_FIND_WIDGET_VISIBLE
    });
    this._highlightDecorations = [];
  }
  run(accessor, editor) {
    const controller = CommonFindController.get(editor);
    if (!controller) {
      return;
    }
    const matchesCount = controller.getState().matchesCount;
    if (matchesCount < 1) {
      const notificationService = accessor.get(INotificationService);
      notificationService.notify({
        severity: Severity.Warning,
        message: nls.localize("findMatchAction.noResults", "No matches. Try searching for something else.")
      });
      return;
    }
    const quickInputService = accessor.get(IQuickInputService);
    const disposables = new DisposableStore();
    const inputBox = disposables.add(quickInputService.createInputBox());
    inputBox.placeholder = nls.localize("findMatchAction.inputPlaceHolder", "Type a number to go to a specific match (between 1 and {0})", matchesCount);
    const toFindMatchIndex = (value) => {
      const index = parseInt(value);
      if (isNaN(index)) {
        return void 0;
      }
      const matchCount = controller.getState().matchesCount;
      if (index > 0 && index <= matchCount) {
        return index - 1;
      } else if (index < 0 && index >= -matchCount) {
        return matchCount + index;
      }
      return void 0;
    };
    const updatePickerAndEditor = (value) => {
      const index = toFindMatchIndex(value);
      if (typeof index === "number") {
        inputBox.validationMessage = void 0;
        controller.goToMatch(index);
        const currentMatch = controller.getState().currentMatch;
        if (currentMatch) {
          this.addDecorations(editor, currentMatch);
        }
      } else {
        inputBox.validationMessage = nls.localize("findMatchAction.inputValidationMessage", "Please type a number between 1 and {0}", controller.getState().matchesCount);
        this.clearDecorations(editor);
      }
    };
    disposables.add(inputBox.onDidChangeValue((value) => {
      updatePickerAndEditor(value);
    }));
    disposables.add(inputBox.onDidAccept(() => {
      const index = toFindMatchIndex(inputBox.value);
      if (typeof index === "number") {
        controller.goToMatch(index);
        inputBox.hide();
      } else {
        inputBox.validationMessage = nls.localize("findMatchAction.inputValidationMessage", "Please type a number between 1 and {0}", controller.getState().matchesCount);
      }
    }));
    disposables.add(inputBox.onDidHide(() => {
      this.clearDecorations(editor);
      disposables.dispose();
    }));
    inputBox.show();
  }
  clearDecorations(editor) {
    editor.changeDecorations((changeAccessor) => {
      this._highlightDecorations = changeAccessor.deltaDecorations(this._highlightDecorations, []);
    });
  }
  addDecorations(editor, range) {
    editor.changeDecorations((changeAccessor) => {
      this._highlightDecorations = changeAccessor.deltaDecorations(this._highlightDecorations, [
        {
          range,
          options: {
            description: "find-match-quick-access-range-highlight",
            className: "rangeHighlight",
            isWholeLine: true
          }
        },
        {
          range,
          options: {
            description: "find-match-quick-access-range-highlight-overview",
            overviewRuler: {
              color: themeColorFromId(overviewRulerRangeHighlight),
              position: OverviewRulerLane.Full
            }
          }
        }
      ]);
    });
  }
}
class SelectionMatchFindAction extends EditorAction {
  async run(accessor, editor) {
    const controller = CommonFindController.get(editor);
    if (!controller) {
      return;
    }
    const selectionSearchString = getSelectionSearchString(editor, "single", false);
    if (selectionSearchString) {
      controller.setSearchString(selectionSearchString);
    }
    if (!this._run(controller)) {
      await controller.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: "none",
        seedSearchStringFromNonEmptySelection: false,
        seedSearchStringFromGlobalClipboard: false,
        shouldFocus: 0 /* NoFocusChange */,
        shouldAnimate: true,
        updateSearchScope: false,
        loop: editor.getOption(EditorOption.find).loop
      });
      this._run(controller);
    }
  }
}
class NextSelectionMatchFindAction extends SelectionMatchFindAction {
  constructor() {
    super({
      id: FIND_IDS.NextSelectionMatchFindAction,
      label: nls.localize2("nextSelectionMatchFindAction", "Find Next Selection"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.focus,
        primary: KeyMod.CtrlCmd | KeyCode.F3,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  _run(controller) {
    return controller.moveToNextMatch();
  }
}
class PreviousSelectionMatchFindAction extends SelectionMatchFindAction {
  constructor() {
    super({
      id: FIND_IDS.PreviousSelectionMatchFindAction,
      label: nls.localize2("previousSelectionMatchFindAction", "Find Previous Selection"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.focus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F3,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  _run(controller) {
    return controller.moveToPrevMatch();
  }
}
const StartFindReplaceAction = registerMultiEditorAction(new MultiEditorAction({
  id: FIND_IDS.StartFindReplaceAction,
  label: nls.localize2("startReplace", "Replace"),
  precondition: ContextKeyExpr.or(EditorContextKeys.focus, ContextKeyExpr.has("editorIsOpen")),
  kbOpts: {
    kbExpr: null,
    primary: KeyMod.CtrlCmd | KeyCode.KeyH,
    mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyF },
    weight: KeybindingWeight.EditorContrib
  },
  menuOpts: {
    menuId: MenuId.MenubarEditMenu,
    group: "3_find",
    title: nls.localize({ key: "miReplace", comment: ["&& denotes a mnemonic"] }, "&&Replace"),
    order: 2
  }
}));
StartFindReplaceAction.addImplementation(0, (accessor, editor, args) => {
  if (!editor.hasModel() || editor.getOption(EditorOption.readOnly)) {
    return false;
  }
  const controller = CommonFindController.get(editor);
  if (!controller) {
    return false;
  }
  const currentSelection = editor.getSelection();
  const findInputFocused = controller.isFindInputFocused();
  const seedSearchStringFromSelection = !currentSelection.isEmpty() && currentSelection.startLineNumber === currentSelection.endLineNumber && editor.getOption(EditorOption.find).seedSearchStringFromSelection !== "never" && !findInputFocused;
  const shouldFocus = findInputFocused || seedSearchStringFromSelection ? 2 /* FocusReplaceInput */ : 1 /* FocusFindInput */;
  return controller.start({
    forceRevealReplace: true,
    seedSearchStringFromSelection: seedSearchStringFromSelection ? "single" : "none",
    seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === "selection",
    seedSearchStringFromGlobalClipboard: editor.getOption(EditorOption.find).seedSearchStringFromSelection !== "never",
    shouldFocus,
    shouldAnimate: true,
    updateSearchScope: false,
    loop: editor.getOption(EditorOption.find).loop
  });
});
registerEditorContribution(CommonFindController.ID, FindController, EditorContributionInstantiation.Eager);
registerEditorAction(StartFindWithArgsAction);
registerEditorAction(StartFindWithSelectionAction);
registerEditorAction(MoveToMatchFindAction);
registerEditorAction(NextSelectionMatchFindAction);
registerEditorAction(PreviousSelectionMatchFindAction);
const FindCommand = EditorCommand.bindToContribution(CommonFindController.get);
registerEditorCommand(new FindCommand({
  id: FIND_IDS.CloseFindWidgetCommand,
  precondition: CONTEXT_FIND_WIDGET_VISIBLE,
  handler: (x) => x.closeFindWidget(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: KeyCode.Escape,
    secondary: [KeyMod.Shift | KeyCode.Escape]
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ToggleCaseSensitiveCommand,
  precondition: void 0,
  handler: (x) => x.toggleCaseSensitive(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: ToggleCaseSensitiveKeybinding.primary,
    mac: ToggleCaseSensitiveKeybinding.mac,
    win: ToggleCaseSensitiveKeybinding.win,
    linux: ToggleCaseSensitiveKeybinding.linux
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ToggleWholeWordCommand,
  precondition: void 0,
  handler: (x) => x.toggleWholeWords(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: ToggleWholeWordKeybinding.primary,
    mac: ToggleWholeWordKeybinding.mac,
    win: ToggleWholeWordKeybinding.win,
    linux: ToggleWholeWordKeybinding.linux
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ToggleRegexCommand,
  precondition: void 0,
  handler: (x) => x.toggleRegex(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: ToggleRegexKeybinding.primary,
    mac: ToggleRegexKeybinding.mac,
    win: ToggleRegexKeybinding.win,
    linux: ToggleRegexKeybinding.linux
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ToggleSearchScopeCommand,
  precondition: void 0,
  handler: (x) => x.toggleSearchScope(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: ToggleSearchScopeKeybinding.primary,
    mac: ToggleSearchScopeKeybinding.mac,
    win: ToggleSearchScopeKeybinding.win,
    linux: ToggleSearchScopeKeybinding.linux
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.TogglePreserveCaseCommand,
  precondition: void 0,
  handler: (x) => x.togglePreserveCase(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: TogglePreserveCaseKeybinding.primary,
    mac: TogglePreserveCaseKeybinding.mac,
    win: TogglePreserveCaseKeybinding.win,
    linux: TogglePreserveCaseKeybinding.linux
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ReplaceOneAction,
  precondition: CONTEXT_FIND_WIDGET_VISIBLE,
  handler: (x) => x.replace(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit1
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ReplaceOneAction,
  precondition: CONTEXT_FIND_WIDGET_VISIBLE,
  handler: (x) => x.replace(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_REPLACE_INPUT_FOCUSED),
    primary: KeyCode.Enter
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ReplaceAllAction,
  precondition: CONTEXT_FIND_WIDGET_VISIBLE,
  handler: (x) => x.replaceAll(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ReplaceAllAction,
  precondition: CONTEXT_FIND_WIDGET_VISIBLE,
  handler: (x) => x.replaceAll(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_REPLACE_INPUT_FOCUSED),
    primary: void 0,
    mac: {
      primary: KeyMod.CtrlCmd | KeyCode.Enter
    }
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.SelectAllMatchesAction,
  precondition: CONTEXT_FIND_WIDGET_VISIBLE,
  handler: (x) => x.selectAllMatches(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: KeyMod.Alt | KeyCode.Enter
  }
}));
export {
  CommonFindController,
  FindController,
  FindStartFocusAction,
  MatchFindAction,
  MoveToMatchFindAction,
  NextMatchFindAction,
  NextSelectionMatchFindAction,
  PreviousMatchFindAction,
  PreviousSelectionMatchFindAction,
  SelectionMatchFindAction,
  StartFindAction,
  StartFindReplaceAction,
  StartFindWithArgsAction,
  StartFindWithSelectionAction,
  getSelectionSearchString
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZpbmRcXGJyb3dzZXJcXGZpbmRDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYWxlcnQgYXMgYWxlcnRGbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBFZGl0b3JDb21tYW5kLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCBNdWx0aUVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JBY3Rpb24sIHJlZ2lzdGVyRWRpdG9yQ29tbWFuZCwgcmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24sIHJlZ2lzdGVyTXVsdGlFZGl0b3JBY3Rpb24sIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IG92ZXJ2aWV3UnVsZXJSYW5nZUhpZ2hsaWdodCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRvckNvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgT3ZlcnZpZXdSdWxlckxhbmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9GSU5EX0lOUFVUX0ZPQ1VTRUQsIENPTlRFWFRfRklORF9XSURHRVRfVklTSUJMRSwgQ09OVEVYVF9SRVBMQUNFX0lOUFVUX0ZPQ1VTRUQsIEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbCwgRklORF9JRFMsIFRvZ2dsZUNhc2VTZW5zaXRpdmVLZXliaW5kaW5nLCBUb2dnbGVQcmVzZXJ2ZUNhc2VLZXliaW5kaW5nLCBUb2dnbGVSZWdleEtleWJpbmRpbmcsIFRvZ2dsZVNlYXJjaFNjb3BlS2V5YmluZGluZywgVG9nZ2xlV2hvbGVXb3JkS2V5YmluZGluZyB9IGZyb20gJy4vZmluZE1vZGVsLmpzJztcbmltcG9ydCB7IEZpbmRPcHRpb25zV2lkZ2V0IH0gZnJvbSAnLi9maW5kT3B0aW9uc1dpZGdldC5qcyc7XG5pbXBvcnQgeyBGaW5kUmVwbGFjZVN0YXRlLCBGaW5kUmVwbGFjZVN0YXRlQ2hhbmdlZEV2ZW50LCBJTmV3RmluZFJlcGxhY2VTdGF0ZSB9IGZyb20gJy4vZmluZFN0YXRlLmpzJztcbmltcG9ydCB7IEZpbmRXaWRnZXQsIElGaW5kQ29udHJvbGxlciwgTkxTX05PX1JFU1VMVFMgfSBmcm9tICcuL2ZpbmRXaWRnZXQuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBGaW5kV2lkZ2V0U2VhcmNoSGlzdG9yeSB9IGZyb20gJy4vZmluZFdpZGdldFNlYXJjaEhpc3RvcnkuanMnO1xuaW1wb3J0IHsgUmVwbGFjZVdpZGdldEhpc3RvcnkgfSBmcm9tICcuL3JlcGxhY2VXaWRnZXRIaXN0b3J5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5cbmNvbnN0IFNFQVJDSF9TVFJJTkdfTUFYX0xFTkdUSCA9IDUyNDI4ODtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNlbGVjdGlvblNlYXJjaFN0cmluZyhlZGl0b3I6IElDb2RlRWRpdG9yLCBzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjogJ3NpbmdsZScgfCAnbXVsdGlwbGUnID0gJ3NpbmdsZScsIHNlZWRTZWFyY2hTdHJpbmdGcm9tTm9uRW1wdHlTZWxlY3Rpb246IGJvb2xlYW4gPSBmYWxzZSk6IHN0cmluZyB8IG51bGwge1xuXHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBzZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdC8vIGlmIHNlbGVjdGlvbiBzcGFucyBtdWx0aXBsZSBsaW5lcywgZGVmYXVsdCBzZWFyY2ggc3RyaW5nIHRvIGVtcHR5XG5cblx0aWYgKChzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiA9PT0gJ3NpbmdsZScgJiYgc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciA9PT0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIpXG5cdFx0fHwgc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gPT09ICdtdWx0aXBsZScpIHtcblx0XHRpZiAoc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0Y29uc3Qgd29yZEF0UG9zaXRpb24gPSBlZGl0b3IuZ2V0Q29uZmlndXJlZFdvcmRBdFBvc2l0aW9uKHNlbGVjdGlvbi5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdFx0aWYgKHdvcmRBdFBvc2l0aW9uICYmIChmYWxzZSA9PT0gc2VlZFNlYXJjaFN0cmluZ0Zyb21Ob25FbXB0eVNlbGVjdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHdvcmRBdFBvc2l0aW9uLndvcmQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChlZGl0b3IuZ2V0TW9kZWwoKS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2Uoc2VsZWN0aW9uKSA8IFNFQVJDSF9TVFJJTkdfTUFYX0xFTkdUSCkge1xuXHRcdFx0XHRyZXR1cm4gZWRpdG9yLmdldE1vZGVsKCkuZ2V0VmFsdWVJblJhbmdlKHNlbGVjdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEZpbmRTdGFydEZvY3VzQWN0aW9uIHtcblx0Tm9Gb2N1c0NoYW5nZSxcblx0Rm9jdXNGaW5kSW5wdXQsXG5cdEZvY3VzUmVwbGFjZUlucHV0XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbmRTdGFydE9wdGlvbnMge1xuXHRmb3JjZVJldmVhbFJlcGxhY2U6IGJvb2xlYW47XG5cdHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uOiAnbm9uZScgfCAnc2luZ2xlJyB8ICdtdWx0aXBsZSc7XG5cdHNlZWRTZWFyY2hTdHJpbmdGcm9tTm9uRW1wdHlTZWxlY3Rpb246IGJvb2xlYW47XG5cdHNlZWRTZWFyY2hTdHJpbmdGcm9tR2xvYmFsQ2xpcGJvYXJkOiBib29sZWFuO1xuXHRzaG91bGRGb2N1czogRmluZFN0YXJ0Rm9jdXNBY3Rpb247XG5cdHNob3VsZEFuaW1hdGU6IGJvb2xlYW47XG5cdHVwZGF0ZVNlYXJjaFNjb3BlOiBib29sZWFuO1xuXHRsb29wOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaW5kU3RhcnRBcmd1bWVudHMge1xuXHRzZWFyY2hTdHJpbmc/OiBzdHJpbmc7XG5cdHJlcGxhY2VTdHJpbmc/OiBzdHJpbmc7XG5cdGlzUmVnZXg/OiBib29sZWFuO1xuXHRtYXRjaFdob2xlV29yZD86IGJvb2xlYW47XG5cdGlzQ2FzZVNlbnNpdGl2ZT86IGJvb2xlYW47XG5cdHByZXNlcnZlQ2FzZT86IGJvb2xlYW47XG5cdGZpbmRJblNlbGVjdGlvbj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBDb21tb25GaW5kQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLmZpbmRDb250cm9sbGVyJztcblxuXHRwcm90ZWN0ZWQgX2VkaXRvcjogSUNvZGVFZGl0b3I7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbmRXaWRnZXRWaXNpYmxlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJvdGVjdGVkIF9zdGF0ZTogRmluZFJlcGxhY2VTdGF0ZTtcblx0cHJvdGVjdGVkIF91cGRhdGVIaXN0b3J5RGVsYXllcjogRGVsYXllcjx2b2lkPjtcblx0cHJpdmF0ZSBfbW9kZWw6IEZpbmRNb2RlbEJvdW5kVG9FZGl0b3JNb2RlbCB8IG51bGw7XG5cdHByb3RlY3RlZCByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2U7XG5cdHByb3RlY3RlZCByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2U7XG5cblx0Z2V0IGVkaXRvcigpIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IENvbW1vbkZpbmRDb250cm9sbGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248Q29tbW9uRmluZENvbnRyb2xsZXI+KENvbW1vbkZpbmRDb250cm9sbGVyLklEKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2VkaXRvciA9IGVkaXRvcjtcblx0XHR0aGlzLl9maW5kV2lkZ2V0VmlzaWJsZSA9IENPTlRFWFRfRklORF9XSURHRVRfVklTSUJMRS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlID0gY29udGV4dEtleVNlcnZpY2U7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UgPSBzdG9yYWdlU2VydmljZTtcblx0XHR0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlID0gY2xpcGJvYXJkU2VydmljZTtcblx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlID0gbm90aWZpY2F0aW9uU2VydmljZTtcblx0XHR0aGlzLl9ob3ZlclNlcnZpY2UgPSBob3ZlclNlcnZpY2U7XG5cblx0XHR0aGlzLl91cGRhdGVIaXN0b3J5RGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDUwMCkpO1xuXHRcdHRoaXMuX3N0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEZpbmRSZXBsYWNlU3RhdGUoKSk7XG5cdFx0dGhpcy5sb2FkUXVlcnlTdGF0ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0YXRlLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZSgoZSkgPT4gdGhpcy5fb25TdGF0ZUNoYW5nZWQoZSkpKTtcblxuXHRcdHRoaXMuX21vZGVsID0gbnVsbDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHtcblx0XHRcdGNvbnN0IHNob3VsZFJlc3RhcnRGaW5kID0gKHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpICYmIHRoaXMuX3N0YXRlLmlzUmV2ZWFsZWQpO1xuXG5cdFx0XHR0aGlzLmRpc3Bvc2VNb2RlbCgpO1xuXG5cdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2Uoe1xuXHRcdFx0XHRzZWFyY2hTY29wZTogbnVsbCxcblx0XHRcdFx0bWF0Y2hDYXNlOiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdlZGl0b3IubWF0Y2hDYXNlJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgZmFsc2UpLFxuXHRcdFx0XHR3aG9sZVdvcmQ6IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ2VkaXRvci53aG9sZVdvcmQnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBmYWxzZSksXG5cdFx0XHRcdGlzUmVnZXg6IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ2VkaXRvci5pc1JlZ2V4JywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgZmFsc2UpLFxuXHRcdFx0XHRwcmVzZXJ2ZUNhc2U6IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ2VkaXRvci5wcmVzZXJ2ZUNhc2UnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBmYWxzZSlcblx0XHRcdH0sIGZhbHNlKTtcblxuXHRcdFx0aWYgKHNob3VsZFJlc3RhcnRGaW5kKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXJ0KHtcblx0XHRcdFx0XHRmb3JjZVJldmVhbFJlcGxhY2U6IGZhbHNlLFxuXHRcdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uOiAnbm9uZScsXG5cdFx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21Ob25FbXB0eVNlbGVjdGlvbjogZmFsc2UsXG5cdFx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21HbG9iYWxDbGlwYm9hcmQ6IGZhbHNlLFxuXHRcdFx0XHRcdHNob3VsZEZvY3VzOiBGaW5kU3RhcnRGb2N1c0FjdGlvbi5Ob0ZvY3VzQ2hhbmdlLFxuXHRcdFx0XHRcdHNob3VsZEFuaW1hdGU6IGZhbHNlLFxuXHRcdFx0XHRcdHVwZGF0ZVNlYXJjaFNjb3BlOiBmYWxzZSxcblx0XHRcdFx0XHRsb29wOiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5sb29wXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zZU1vZGVsKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNwb3NlTW9kZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX21vZGVsKSB7XG5cdFx0XHR0aGlzLl9tb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9tb2RlbCA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25TdGF0ZUNoYW5nZWQoZTogRmluZFJlcGxhY2VTdGF0ZUNoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuc2F2ZVF1ZXJ5U3RhdGUoZSk7XG5cblx0XHRpZiAoZS5pc1JldmVhbGVkKSB7XG5cdFx0XHRpZiAodGhpcy5fc3RhdGUuaXNSZXZlYWxlZCkge1xuXHRcdFx0XHR0aGlzLl9maW5kV2lkZ2V0VmlzaWJsZS5zZXQodHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9maW5kV2lkZ2V0VmlzaWJsZS5yZXNldCgpO1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2VNb2RlbCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZS5zZWFyY2hTdHJpbmcpIHtcblx0XHRcdHRoaXMuc2V0R2xvYmFsQnVmZmVyVGVybSh0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2F2ZVF1ZXJ5U3RhdGUoZTogRmluZFJlcGxhY2VTdGF0ZUNoYW5nZWRFdmVudCkge1xuXHRcdGlmIChlLmlzUmVnZXgpIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdlZGl0b3IuaXNSZWdleCcsIHRoaXMuX3N0YXRlLmFjdHVhbElzUmVnZXgsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHRcdGlmIChlLndob2xlV29yZCkge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2VkaXRvci53aG9sZVdvcmQnLCB0aGlzLl9zdGF0ZS5hY3R1YWxXaG9sZVdvcmQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHRcdGlmIChlLm1hdGNoQ2FzZSkge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2VkaXRvci5tYXRjaENhc2UnLCB0aGlzLl9zdGF0ZS5hY3R1YWxNYXRjaENhc2UsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHRcdGlmIChlLnByZXNlcnZlQ2FzZSkge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2VkaXRvci5wcmVzZXJ2ZUNhc2UnLCB0aGlzLl9zdGF0ZS5hY3R1YWxQcmVzZXJ2ZUNhc2UsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsb2FkUXVlcnlTdGF0ZSgpIHtcblx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2Uoe1xuXHRcdFx0bWF0Y2hDYXNlOiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdlZGl0b3IubWF0Y2hDYXNlJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdGhpcy5fc3RhdGUubWF0Y2hDYXNlKSxcblx0XHRcdHdob2xlV29yZDogdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbignZWRpdG9yLndob2xlV29yZCcsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHRoaXMuX3N0YXRlLndob2xlV29yZCksXG5cdFx0XHRpc1JlZ2V4OiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdlZGl0b3IuaXNSZWdleCcsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHRoaXMuX3N0YXRlLmlzUmVnZXgpLFxuXHRcdFx0cHJlc2VydmVDYXNlOiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdlZGl0b3IucHJlc2VydmVDYXNlJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdGhpcy5fc3RhdGUucHJlc2VydmVDYXNlKVxuXHRcdH0sIGZhbHNlKTtcblx0fVxuXG5cdHB1YmxpYyBpc0ZpbmRJbnB1dEZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhQ09OVEVYVF9GSU5EX0lOUFVUX0ZPQ1VTRUQuZ2V0VmFsdWUodGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgUmVwbGFjZSBpbnB1dCB3YXMgdGhlIGxhc3QgZm9jdXNlZCBpbnB1dCBpbiB0aGUgZmluZCB3aWRnZXQuXG5cdCAqIFJldHVybnMgZmFsc2UgYnkgZGVmYXVsdDsgb3ZlcnJpZGRlbiBpbiBGaW5kQ29udHJvbGxlci5cblx0ICovXG5cdHB1YmxpYyB3YXNSZXBsYWNlSW5wdXRMYXN0Rm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogRm9jdXNlcyB0aGUgbGFzdCBmb2N1c2VkIGVsZW1lbnQgaW4gdGhlIGZpbmQgd2lkZ2V0LlxuXHQgKiBJbXBsZW1lbnRlZCBieSBGaW5kQ29udHJvbGxlcjsgYmFzZSBpbXBsZW1lbnRhdGlvbiBkb2VzIG5vdGhpbmcuXG5cdCAqL1xuXHRwdWJsaWMgZm9jdXNMYXN0RWxlbWVudCgpOiB2b2lkIHtcblx0XHQvLyBCYXNlIGltcGxlbWVudGF0aW9uIC0gb3ZlcnJpZGRlbiBpbiBGaW5kQ29udHJvbGxlclxuXHR9XG5cblx0cHVibGljIGdldFN0YXRlKCk6IEZpbmRSZXBsYWNlU3RhdGUge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0ZTtcblx0fVxuXG5cdHB1YmxpYyBjbG9zZUZpbmRXaWRnZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHtcblx0XHRcdGlzUmV2ZWFsZWQ6IGZhbHNlLFxuXHRcdFx0c2VhcmNoU2NvcGU6IG51bGxcblx0XHR9LCBmYWxzZSk7XG5cdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgdG9nZ2xlQ2FzZVNlbnNpdGl2ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBtYXRjaENhc2U6ICF0aGlzLl9zdGF0ZS5tYXRjaENhc2UgfSwgZmFsc2UpO1xuXHRcdGlmICghdGhpcy5fc3RhdGUuaXNSZXZlYWxlZCkge1xuXHRcdFx0dGhpcy5oaWdobGlnaHRGaW5kT3B0aW9ucygpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB0b2dnbGVXaG9sZVdvcmRzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHdob2xlV29yZDogIXRoaXMuX3N0YXRlLndob2xlV29yZCB9LCBmYWxzZSk7XG5cdFx0aWYgKCF0aGlzLl9zdGF0ZS5pc1JldmVhbGVkKSB7XG5cdFx0XHR0aGlzLmhpZ2hsaWdodEZpbmRPcHRpb25zKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHRvZ2dsZVJlZ2V4KCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IGlzUmVnZXg6ICF0aGlzLl9zdGF0ZS5pc1JlZ2V4IH0sIGZhbHNlKTtcblx0XHRpZiAoIXRoaXMuX3N0YXRlLmlzUmV2ZWFsZWQpIHtcblx0XHRcdHRoaXMuaGlnaGxpZ2h0RmluZE9wdGlvbnMoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdG9nZ2xlUHJlc2VydmVDYXNlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHByZXNlcnZlQ2FzZTogIXRoaXMuX3N0YXRlLnByZXNlcnZlQ2FzZSB9LCBmYWxzZSk7XG5cdFx0aWYgKCF0aGlzLl9zdGF0ZS5pc1JldmVhbGVkKSB7XG5cdFx0XHR0aGlzLmhpZ2hsaWdodEZpbmRPcHRpb25zKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHRvZ2dsZVNlYXJjaFNjb3BlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5zZWFyY2hTY29wZSkge1xuXHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgc2VhcmNoU2NvcGU6IG51bGwgfSwgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRsZXQgc2VsZWN0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0XHRcdHNlbGVjdGlvbnMgPSBzZWxlY3Rpb25zLm1hcChzZWxlY3Rpb24gPT4ge1xuXHRcdFx0XHRcdGlmIChzZWxlY3Rpb24uZW5kQ29sdW1uID09PSAxICYmIHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyID4gc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0c2VsZWN0aW9uID0gc2VsZWN0aW9uLnNldEVuZFBvc2l0aW9uKFxuXHRcdFx0XHRcdFx0XHRzZWxlY3Rpb24uZW5kTGluZU51bWJlciAtIDEsXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lTWF4Q29sdW1uKHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyIC0gMSlcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHNlbGVjdGlvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH0pLmZpbHRlcigoZWxlbWVudCk6IGVsZW1lbnQgaXMgU2VsZWN0aW9uID0+ICEhZWxlbWVudCk7XG5cblx0XHRcdFx0aWYgKHNlbGVjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgc2VhcmNoU2NvcGU6IHNlbGVjdGlvbnMgfSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0U2VhcmNoU3RyaW5nKHNlYXJjaFN0cmluZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmlzUmVnZXgpIHtcblx0XHRcdHNlYXJjaFN0cmluZyA9IHN0cmluZ3MuZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhzZWFyY2hTdHJpbmcpO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6IHNlYXJjaFN0cmluZyB9LCBmYWxzZSk7XG5cdH1cblxuXHRwdWJsaWMgaGlnaGxpZ2h0RmluZE9wdGlvbnMoaWdub3JlV2hlblZpc2libGU6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdC8vIG92ZXJ3cml0dGVuIGluIHN1YmNsYXNzXG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX3N0YXJ0KG9wdHM6IElGaW5kU3RhcnRPcHRpb25zLCBuZXdTdGF0ZT86IElOZXdGaW5kUmVwbGFjZVN0YXRlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5kaXNwb3NlTW9kZWwoKTtcblxuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdC8vIGNhbm5vdCBkbyBhbnl0aGluZyB3aXRoIGFuIGVkaXRvciB0aGF0IGRvZXNuJ3QgaGF2ZSBhIG1vZGVsLi4uXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGVDaGFuZ2VzOiBJTmV3RmluZFJlcGxhY2VTdGF0ZSA9IHtcblx0XHRcdC4uLm5ld1N0YXRlLFxuXHRcdFx0aXNSZXZlYWxlZDogdHJ1ZVxuXHRcdH07XG5cblx0XHRpZiAob3B0cy5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiA9PT0gJ3NpbmdsZScpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvblNlYXJjaFN0cmluZyA9IGdldFNlbGVjdGlvblNlYXJjaFN0cmluZyh0aGlzLl9lZGl0b3IsIG9wdHMuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24sIG9wdHMuc2VlZFNlYXJjaFN0cmluZ0Zyb21Ob25FbXB0eVNlbGVjdGlvbik7XG5cdFx0XHRpZiAoc2VsZWN0aW9uU2VhcmNoU3RyaW5nKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZS5pc1JlZ2V4KSB7XG5cdFx0XHRcdFx0c3RhdGVDaGFuZ2VzLnNlYXJjaFN0cmluZyA9IHN0cmluZ3MuZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhzZWxlY3Rpb25TZWFyY2hTdHJpbmcpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHN0YXRlQ2hhbmdlcy5zZWFyY2hTdHJpbmcgPSBzZWxlY3Rpb25TZWFyY2hTdHJpbmc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKG9wdHMuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gPT09ICdtdWx0aXBsZScgJiYgIW9wdHMudXBkYXRlU2VhcmNoU2NvcGUpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvblNlYXJjaFN0cmluZyA9IGdldFNlbGVjdGlvblNlYXJjaFN0cmluZyh0aGlzLl9lZGl0b3IsIG9wdHMuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24pO1xuXHRcdFx0aWYgKHNlbGVjdGlvblNlYXJjaFN0cmluZykge1xuXHRcdFx0XHRzdGF0ZUNoYW5nZXMuc2VhcmNoU3RyaW5nID0gc2VsZWN0aW9uU2VhcmNoU3RyaW5nO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghc3RhdGVDaGFuZ2VzLnNlYXJjaFN0cmluZyAmJiBvcHRzLnNlZWRTZWFyY2hTdHJpbmdGcm9tR2xvYmFsQ2xpcGJvYXJkKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25TZWFyY2hTdHJpbmcgPSBhd2FpdCB0aGlzLmdldEdsb2JhbEJ1ZmZlclRlcm0oKTtcblxuXHRcdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHQvLyB0aGUgZWRpdG9yIGhhcyBsb3N0IGl0cyBtb2RlbCBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2VsZWN0aW9uU2VhcmNoU3RyaW5nKSB7XG5cdFx0XHRcdHN0YXRlQ2hhbmdlcy5zZWFyY2hTdHJpbmcgPSBzZWxlY3Rpb25TZWFyY2hTdHJpbmc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gT3ZlcndyaXRlIGlzUmVwbGFjZVJldmVhbGVkXG5cdFx0aWYgKG9wdHMuZm9yY2VSZXZlYWxSZXBsYWNlIHx8IHN0YXRlQ2hhbmdlcy5pc1JlcGxhY2VSZXZlYWxlZCkge1xuXHRcdFx0c3RhdGVDaGFuZ2VzLmlzUmVwbGFjZVJldmVhbGVkID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKCF0aGlzLl9maW5kV2lkZ2V0VmlzaWJsZS5nZXQoKSkge1xuXHRcdFx0c3RhdGVDaGFuZ2VzLmlzUmVwbGFjZVJldmVhbGVkID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdHMudXBkYXRlU2VhcmNoU2NvcGUpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRTZWxlY3Rpb25zID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRcdGlmIChjdXJyZW50U2VsZWN0aW9ucy5zb21lKHNlbGVjdGlvbiA9PiAhc2VsZWN0aW9uLmlzRW1wdHkoKSkpIHtcblx0XHRcdFx0c3RhdGVDaGFuZ2VzLnNlYXJjaFNjb3BlID0gY3VycmVudFNlbGVjdGlvbnM7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c3RhdGVDaGFuZ2VzLmxvb3AgPSBvcHRzLmxvb3A7XG5cblx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2Uoc3RhdGVDaGFuZ2VzLCBmYWxzZSk7XG5cblx0XHRpZiAoIXRoaXMuX21vZGVsKSB7XG5cdFx0XHR0aGlzLl9tb2RlbCA9IG5ldyBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwodGhpcy5fZWRpdG9yLCB0aGlzLl9zdGF0ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHN0YXJ0KG9wdHM6IElGaW5kU3RhcnRPcHRpb25zLCBuZXdTdGF0ZT86IElOZXdGaW5kUmVwbGFjZVN0YXRlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXJ0KG9wdHMsIG5ld1N0YXRlKTtcblx0fVxuXG5cdHB1YmxpYyBtb3ZlVG9OZXh0TWF0Y2goKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX21vZGVsKSB7XG5cdFx0XHR0aGlzLl9tb2RlbC5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgbW92ZVRvUHJldk1hdGNoKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9tb2RlbCkge1xuXHRcdFx0dGhpcy5fbW9kZWwubW92ZVRvUHJldk1hdGNoKCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGdvVG9NYXRjaChpbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX21vZGVsKSB7XG5cdFx0XHR0aGlzLl9tb2RlbC5tb3ZlVG9NYXRjaChpbmRleCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHJlcGxhY2UoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX21vZGVsKSB7XG5cdFx0XHR0aGlzLl9tb2RlbC5yZXBsYWNlKCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHJlcGxhY2VBbGwoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX21vZGVsKSB7XG5cdFx0XHRpZiAodGhpcy5fZWRpdG9yLmdldE1vZGVsKCk/LmlzVG9vTGFyZ2VGb3JIZWFwT3BlcmF0aW9uKCkpIHtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS53YXJuKG5scy5sb2NhbGl6ZSgndG9vLmxhcmdlLmZvci5yZXBsYWNlYWxsJywgXCJUaGUgZmlsZSBpcyB0b28gbGFyZ2UgdG8gcGVyZm9ybSBhIHJlcGxhY2UgYWxsIG9wZXJhdGlvbi5cIikpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9tb2RlbC5yZXBsYWNlQWxsKCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHNlbGVjdEFsbE1hdGNoZXMoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX21vZGVsKSB7XG5cdFx0XHR0aGlzLl9tb2RlbC5zZWxlY3RBbGxNYXRjaGVzKCk7XG5cdFx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0R2xvYmFsQnVmZmVyVGVybSgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICh0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5nbG9iYWxGaW5kQ2xpcGJvYXJkXG5cdFx0XHQmJiB0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKVxuXHRcdFx0JiYgIXRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLmlzVG9vTGFyZ2VGb3JTeW5jaW5nKClcblx0XHQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLnJlYWRGaW5kVGV4dCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRwdWJsaWMgc2V0R2xvYmFsQnVmZmVyVGVybSh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuZ2xvYmFsRmluZENsaXBib2FyZFxuXHRcdFx0JiYgdGhpcy5fZWRpdG9yLmhhc01vZGVsKClcblx0XHRcdCYmICF0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKS5pc1Rvb0xhcmdlRm9yU3luY2luZygpXG5cdFx0KSB7XG5cdFx0XHQvLyBpbnRlbnRpb25hbGx5IG5vdCBhd2FpdGVkXG5cdFx0XHR0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLndyaXRlRmluZFRleHQodGV4dCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGaW5kQ29udHJvbGxlciBleHRlbmRzIENvbW1vbkZpbmRDb250cm9sbGVyIGltcGxlbWVudHMgSUZpbmRDb250cm9sbGVyIHtcblxuXHRwcml2YXRlIF93aWRnZXQ6IEZpbmRXaWRnZXQgfCBudWxsO1xuXHRwcml2YXRlIF9maW5kT3B0aW9uc1dpZGdldDogRmluZE9wdGlvbnNXaWRnZXQgfCBudWxsO1xuXHRwcml2YXRlIF9maW5kV2lkZ2V0U2VhcmNoSGlzdG9yeTogRmluZFdpZGdldFNlYXJjaEhpc3Rvcnk7XG5cdHByaXZhdGUgX3JlcGxhY2VXaWRnZXRIaXN0b3J5OiBSZXBsYWNlV2lkZ2V0SGlzdG9yeTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvciwgX2NvbnRleHRLZXlTZXJ2aWNlLCBfc3RvcmFnZVNlcnZpY2UsIGNsaXBib2FyZFNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cdFx0dGhpcy5fd2lkZ2V0ID0gbnVsbDtcblx0XHR0aGlzLl9maW5kT3B0aW9uc1dpZGdldCA9IG51bGw7XG5cdFx0dGhpcy5fZmluZFdpZGdldFNlYXJjaEhpc3RvcnkgPSBGaW5kV2lkZ2V0U2VhcmNoSGlzdG9yeS5nZXRPckNyZWF0ZShfc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlcGxhY2VXaWRnZXRIaXN0b3J5ID0gUmVwbGFjZVdpZGdldEhpc3RvcnkuZ2V0T3JDcmVhdGUoX3N0b3JhZ2VTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfc3RhcnQob3B0czogSUZpbmRTdGFydE9wdGlvbnMsIG5ld1N0YXRlPzogSU5ld0ZpbmRSZXBsYWNlU3RhdGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3dpZGdldCkge1xuXHRcdFx0dGhpcy5fY3JlYXRlRmluZFdpZGdldCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRsZXQgdXBkYXRlU2VhcmNoU2NvcGUgPSBmYWxzZTtcblxuXHRcdHN3aXRjaCAodGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuYXV0b0ZpbmRJblNlbGVjdGlvbikge1xuXHRcdFx0Y2FzZSAnYWx3YXlzJzpcblx0XHRcdFx0dXBkYXRlU2VhcmNoU2NvcGUgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ25ldmVyJzpcblx0XHRcdFx0dXBkYXRlU2VhcmNoU2NvcGUgPSBmYWxzZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdtdWx0aWxpbmUnOiB7XG5cdFx0XHRcdGNvbnN0IGlzU2VsZWN0aW9uTXVsdGlwbGVMaW5lID0gISFzZWxlY3Rpb24gJiYgc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciAhPT0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdHVwZGF0ZVNlYXJjaFNjb3BlID0gaXNTZWxlY3Rpb25NdWx0aXBsZUxpbmU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0b3B0cy51cGRhdGVTZWFyY2hTY29wZSA9IG9wdHMudXBkYXRlU2VhcmNoU2NvcGUgfHwgdXBkYXRlU2VhcmNoU2NvcGU7XG5cblx0XHRhd2FpdCBzdXBlci5fc3RhcnQob3B0cywgbmV3U3RhdGUpO1xuXG5cdFx0aWYgKHRoaXMuX3dpZGdldCkge1xuXHRcdFx0aWYgKG9wdHMuc2hvdWxkRm9jdXMgPT09IEZpbmRTdGFydEZvY3VzQWN0aW9uLkZvY3VzUmVwbGFjZUlucHV0KSB7XG5cdFx0XHRcdHRoaXMuX3dpZGdldC5mb2N1c1JlcGxhY2VJbnB1dCgpO1xuXHRcdFx0fSBlbHNlIGlmIChvcHRzLnNob3VsZEZvY3VzID09PSBGaW5kU3RhcnRGb2N1c0FjdGlvbi5Gb2N1c0ZpbmRJbnB1dCkge1xuXHRcdFx0XHR0aGlzLl93aWRnZXQuZm9jdXNGaW5kSW5wdXQoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgaGlnaGxpZ2h0RmluZE9wdGlvbnMoaWdub3JlV2hlblZpc2libGU6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHR0aGlzLl9jcmVhdGVGaW5kV2lkZ2V0KCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdGF0ZS5pc1JldmVhbGVkICYmICFpZ25vcmVXaGVuVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0IS5oaWdobGlnaHRGaW5kT3B0aW9ucygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9maW5kT3B0aW9uc1dpZGdldCEuaGlnaGxpZ2h0RmluZE9wdGlvbnMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVGaW5kV2lkZ2V0KCkge1xuXHRcdHRoaXMuX3dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBGaW5kV2lkZ2V0KHRoaXMuX2VkaXRvciwgdGhpcywgdGhpcy5fc3RhdGUsIHRoaXMuX2NvbnRleHRWaWV3U2VydmljZSwgdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9ob3ZlclNlcnZpY2UsIHRoaXMuX2ZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5LCB0aGlzLl9yZXBsYWNlV2lkZ2V0SGlzdG9yeSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fZmluZE9wdGlvbnNXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRmluZE9wdGlvbnNXaWRnZXQodGhpcy5fZWRpdG9yLCB0aGlzLl9zdGF0ZSwgdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIFJlcGxhY2UgaW5wdXQgd2FzIHRoZSBsYXN0IGZvY3VzZWQgaW5wdXQgaW4gdGhlIGZpbmQgd2lkZ2V0LlxuXHQgKi9cblx0cHVibGljIG92ZXJyaWRlIHdhc1JlcGxhY2VJbnB1dExhc3RGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQ/Lmxhc3RGb2N1c2VkSW5wdXRXYXNSZXBsYWNlID8/IGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvY3VzZXMgdGhlIGxhc3QgZm9jdXNlZCBlbGVtZW50IGluIHRoZSBmaW5kIHdpZGdldC5cblx0ICogVGhpcyBpcyBtb3JlIHByZWNpc2UgdGhhbiBqdXN0IGZvY3VzaW5nIHRoZSBGaW5kIG9yIFJlcGxhY2UgaW5wdXQsXG5cdCAqIGFzIGl0IGNhbiByZXN0b3JlIGZvY3VzIHRvIGNoZWNrYm94ZXMsIGJ1dHRvbnMsIGV0Yy5cblx0ICovXG5cdHB1YmxpYyBvdmVycmlkZSBmb2N1c0xhc3RFbGVtZW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldD8uZm9jdXNMYXN0RWxlbWVudCgpO1xuXHR9XG5cblx0c2F2ZVZpZXdTdGF0ZSgpOiBhbnkge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQ/LmdldFZpZXdTdGF0ZSgpO1xuXHR9XG5cblx0cmVzdG9yZVZpZXdTdGF0ZShzdGF0ZTogYW55KTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0Py5zZXRWaWV3U3RhdGUoc3RhdGUpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBTdGFydEZpbmRBY3Rpb24gPSByZWdpc3Rlck11bHRpRWRpdG9yQWN0aW9uKG5ldyBNdWx0aUVkaXRvckFjdGlvbih7XG5cdGlkOiBGSU5EX0lEUy5TdGFydEZpbmRBY3Rpb24sXG5cdGxhYmVsOiBubHMubG9jYWxpemUyKCdzdGFydEZpbmRBY3Rpb24nLCBcIkZpbmRcIiksXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsIENvbnRleHRLZXlFeHByLmhhcygnZWRpdG9ySXNPcGVuJykpLFxuXHRrYk9wdHM6IHtcblx0XHRrYkV4cHI6IG51bGwsXG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUYsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0fSxcblx0bWVudU9wdHM6IHtcblx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyRWRpdE1lbnUsXG5cdFx0Z3JvdXA6ICczX2ZpbmQnLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUZpbmQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZGaW5kXCIpLFxuXHRcdG9yZGVyOiAxXG5cdH1cbn0pKTtcblxuU3RhcnRGaW5kQWN0aW9uLmFkZEltcGxlbWVudGF0aW9uKDAsIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogYW55KTogYm9vbGVhbiB8IFByb21pc2U8dm9pZD4gPT4ge1xuXHRjb25zdCBjb250cm9sbGVyID0gQ29tbW9uRmluZENvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdGlmICghY29udHJvbGxlcikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gY29udHJvbGxlci5zdGFydCh7XG5cdFx0Zm9yY2VSZXZlYWxSZXBsYWNlOiBmYWxzZSxcblx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjogZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gIT09ICduZXZlcicgPyAnc2luZ2xlJyA6ICdub25lJyxcblx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbU5vbkVtcHR5U2VsZWN0aW9uOiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiA9PT0gJ3NlbGVjdGlvbicsXG5cdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21HbG9iYWxDbGlwYm9hcmQ6IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmdsb2JhbEZpbmRDbGlwYm9hcmQsXG5cdFx0c2hvdWxkRm9jdXM6IEZpbmRTdGFydEZvY3VzQWN0aW9uLkZvY3VzRmluZElucHV0LFxuXHRcdHNob3VsZEFuaW1hdGU6IHRydWUsXG5cdFx0dXBkYXRlU2VhcmNoU2NvcGU6IGZhbHNlLFxuXHRcdGxvb3A6IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmxvb3Bcblx0fSk7XG59KTtcblxuY29uc3QgZmluZEFyZ0Rlc2NyaXB0aW9uID0ge1xuXHRkZXNjcmlwdGlvbjogJ09wZW4gYSBuZXcgSW4tRWRpdG9yIEZpbmQgV2lkZ2V0LicsXG5cdGFyZ3M6IFt7XG5cdFx0bmFtZTogJ09wZW4gYSBuZXcgSW4tRWRpdG9yIEZpbmQgV2lkZ2V0IGFyZ3MnLFxuXHRcdHNjaGVtYToge1xuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRzZWFyY2hTdHJpbmc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0cmVwbGFjZVN0cmluZzogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRpc1JlZ2V4OiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0XHRtYXRjaFdob2xlV29yZDogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0aXNDYXNlU2Vuc2l0aXZlOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0XHRwcmVzZXJ2ZUNhc2U6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdGZpbmRJblNlbGVjdGlvbjogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdH1cblx0XHR9XG5cdH1dXG59IGFzIGNvbnN0O1xuXG5leHBvcnQgY2xhc3MgU3RhcnRGaW5kV2l0aEFyZ3NBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBGSU5EX0lEUy5TdGFydEZpbmRXaXRoQXJncyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdzdGFydEZpbmRXaXRoQXJnc0FjdGlvbicsIFwiRmluZCB3aXRoIEFyZ3VtZW50c1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogbnVsbCxcblx0XHRcdFx0cHJpbWFyeTogMCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YTogZmluZEFyZ0Rlc2NyaXB0aW9uXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzPzogSUZpbmRTdGFydEFyZ3VtZW50cyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb21tb25GaW5kQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoY29udHJvbGxlcikge1xuXHRcdFx0Y29uc3QgbmV3U3RhdGU6IElOZXdGaW5kUmVwbGFjZVN0YXRlID0gYXJncyA/IHtcblx0XHRcdFx0c2VhcmNoU3RyaW5nOiBhcmdzLnNlYXJjaFN0cmluZyxcblx0XHRcdFx0cmVwbGFjZVN0cmluZzogYXJncy5yZXBsYWNlU3RyaW5nLFxuXHRcdFx0XHRpc1JlcGxhY2VSZXZlYWxlZDogYXJncy5yZXBsYWNlU3RyaW5nICE9PSB1bmRlZmluZWQsXG5cdFx0XHRcdGlzUmVnZXg6IGFyZ3MuaXNSZWdleCxcblx0XHRcdFx0Ly8gaXNSZWdleE92ZXJyaWRlOiBhcmdzLnJlZ2V4T3ZlcnJpZGUsXG5cdFx0XHRcdHdob2xlV29yZDogYXJncy5tYXRjaFdob2xlV29yZCxcblx0XHRcdFx0Ly8gd2hvbGVXb3JkT3ZlcnJpZGU6IGFyZ3Mud2hvbGVXb3JkT3ZlcnJpZGUsXG5cdFx0XHRcdG1hdGNoQ2FzZTogYXJncy5pc0Nhc2VTZW5zaXRpdmUsXG5cdFx0XHRcdC8vIG1hdGNoQ2FzZU92ZXJyaWRlOiBhcmdzLm1hdGNoQ2FzZU92ZXJyaWRlLFxuXHRcdFx0XHRwcmVzZXJ2ZUNhc2U6IGFyZ3MucHJlc2VydmVDYXNlLFxuXHRcdFx0XHQvLyBwcmVzZXJ2ZUNhc2VPdmVycmlkZTogYXJncy5wcmVzZXJ2ZUNhc2VPdmVycmlkZSxcblx0XHRcdH0gOiB7fTtcblxuXHRcdFx0YXdhaXQgY29udHJvbGxlci5zdGFydCh7XG5cdFx0XHRcdGZvcmNlUmV2ZWFsUmVwbGFjZTogZmFsc2UsXG5cdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uOiAoY29udHJvbGxlci5nZXRTdGF0ZSgpLnNlYXJjaFN0cmluZy5sZW5ndGggPT09IDApICYmIGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uICE9PSAnbmV2ZXInID8gJ3NpbmdsZScgOiAnbm9uZScsXG5cdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tTm9uRW1wdHlTZWxlY3Rpb246IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uID09PSAnc2VsZWN0aW9uJyxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21HbG9iYWxDbGlwYm9hcmQ6IHRydWUsXG5cdFx0XHRcdHNob3VsZEZvY3VzOiBGaW5kU3RhcnRGb2N1c0FjdGlvbi5Gb2N1c0ZpbmRJbnB1dCxcblx0XHRcdFx0c2hvdWxkQW5pbWF0ZTogdHJ1ZSxcblx0XHRcdFx0dXBkYXRlU2VhcmNoU2NvcGU6IGFyZ3M/LmZpbmRJblNlbGVjdGlvbiB8fCBmYWxzZSxcblx0XHRcdFx0bG9vcDogZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkubG9vcFxuXHRcdFx0fSwgbmV3U3RhdGUpO1xuXG5cdFx0XHRjb250cm9sbGVyLnNldEdsb2JhbEJ1ZmZlclRlcm0oY29udHJvbGxlci5nZXRTdGF0ZSgpLnNlYXJjaFN0cmluZyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdGFydEZpbmRXaXRoU2VsZWN0aW9uQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRklORF9JRFMuU3RhcnRGaW5kV2l0aFNlbGVjdGlvbixcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdzdGFydEZpbmRXaXRoU2VsZWN0aW9uQWN0aW9uJywgXCJGaW5kIHdpdGggU2VsZWN0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBudWxsLFxuXHRcdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5RSxcblx0XHRcdFx0fSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29tbW9uRmluZENvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKGNvbnRyb2xsZXIpIHtcblx0XHRcdGF3YWl0IGNvbnRyb2xsZXIuc3RhcnQoe1xuXHRcdFx0XHRmb3JjZVJldmVhbFJlcGxhY2U6IGZhbHNlLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjogJ211bHRpcGxlJyxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21Ob25FbXB0eVNlbGVjdGlvbjogZmFsc2UsXG5cdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tR2xvYmFsQ2xpcGJvYXJkOiBmYWxzZSxcblx0XHRcdFx0c2hvdWxkRm9jdXM6IEZpbmRTdGFydEZvY3VzQWN0aW9uLk5vRm9jdXNDaGFuZ2UsXG5cdFx0XHRcdHNob3VsZEFuaW1hdGU6IHRydWUsXG5cdFx0XHRcdHVwZGF0ZVNlYXJjaFNjb3BlOiBmYWxzZSxcblx0XHRcdFx0bG9vcDogZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkubG9vcFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnRyb2xsZXIuc2V0R2xvYmFsQnVmZmVyVGVybShjb250cm9sbGVyLmdldFN0YXRlKCkuc2VhcmNoU3RyaW5nKTtcblx0XHR9XG5cdH1cbn1cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBNYXRjaEZpbmRBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1vbkZpbmRDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmIChjb250cm9sbGVyICYmICF0aGlzLl9ydW4oY29udHJvbGxlcikpIHtcblx0XHRcdGF3YWl0IGNvbnRyb2xsZXIuc3RhcnQoe1xuXHRcdFx0XHRmb3JjZVJldmVhbFJlcGxhY2U6IGZhbHNlLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjogKGNvbnRyb2xsZXIuZ2V0U3RhdGUoKS5zZWFyY2hTdHJpbmcubGVuZ3RoID09PSAwKSAmJiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiAhPT0gJ25ldmVyJyA/ICdzaW5nbGUnIDogJ25vbmUnLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbU5vbkVtcHR5U2VsZWN0aW9uOiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiA9PT0gJ3NlbGVjdGlvbicsXG5cdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tR2xvYmFsQ2xpcGJvYXJkOiB0cnVlLFxuXHRcdFx0XHRzaG91bGRGb2N1czogRmluZFN0YXJ0Rm9jdXNBY3Rpb24uTm9Gb2N1c0NoYW5nZSxcblx0XHRcdFx0c2hvdWxkQW5pbWF0ZTogdHJ1ZSxcblx0XHRcdFx0dXBkYXRlU2VhcmNoU2NvcGU6IGZhbHNlLFxuXHRcdFx0XHRsb29wOiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5sb29wXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3J1bihjb250cm9sbGVyKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX3J1bihjb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcik6IGJvb2xlYW47XG59XG5cbmFzeW5jIGZ1bmN0aW9uIG1hdGNoRmluZEFjdGlvbihlZGl0b3I6IElDb2RlRWRpdG9yLCBuZXh0OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGNvbnRyb2xsZXIgPSBDb21tb25GaW5kQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IHNob3VsZENsb3NlT25SZXN1bHQgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5jbG9zZU9uUmVzdWx0O1xuXHRjb25zdCB3YXNGaW5kV2lkZ2V0VmlzaWJsZSA9IGNvbnRyb2xsZXIuZ2V0U3RhdGUoKS5pc1JldmVhbGVkO1xuXG5cdGNvbnN0IHJ1bk1hdGNoID0gKCk6IGJvb2xlYW4gPT4ge1xuXHRcdGNvbnN0IHByZXZpb3VzU2VsZWN0aW9uID0gY29udHJvbGxlci5lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV4dCA/IGNvbnRyb2xsZXIubW92ZVRvTmV4dE1hdGNoKCkgOiBjb250cm9sbGVyLm1vdmVUb1ByZXZNYXRjaCgpO1xuXG5cdFx0bGV0IGxhbmRlZE9uTWF0Y2ggPSBmYWxzZTtcblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRjb25zdCBjdXJyZW50U2VsZWN0aW9uID0gY29udHJvbGxlci5lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRpZiAoIXByZXZpb3VzU2VsZWN0aW9uICYmIGN1cnJlbnRTZWxlY3Rpb24pIHtcblx0XHRcdFx0bGFuZGVkT25NYXRjaCA9IHRydWU7XG5cdFx0XHR9IGVsc2UgaWYgKHByZXZpb3VzU2VsZWN0aW9uICYmIGN1cnJlbnRTZWxlY3Rpb24gJiYgIXByZXZpb3VzU2VsZWN0aW9uLmVxdWFsc1NlbGVjdGlvbihjdXJyZW50U2VsZWN0aW9uKSkge1xuXHRcdFx0XHRsYW5kZWRPbk1hdGNoID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobGFuZGVkT25NYXRjaCkge1xuXHRcdFx0Y29udHJvbGxlci5lZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHRpZiAoc2hvdWxkQ2xvc2VPblJlc3VsdCAmJiB3YXNGaW5kV2lkZ2V0VmlzaWJsZSAmJiBjb250cm9sbGVyLmlzRmluZElucHV0Rm9jdXNlZCgpKSB7XG5cdFx0XHRcdGNvbnRyb2xsZXIuY2xvc2VGaW5kV2lkZ2V0KCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9O1xuXG5cdGlmICghcnVuTWF0Y2goKSkge1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuc3RhcnQoe1xuXHRcdFx0Zm9yY2VSZXZlYWxSZXBsYWNlOiBmYWxzZSxcblx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uOiAoY29udHJvbGxlci5nZXRTdGF0ZSgpLnNlYXJjaFN0cmluZy5sZW5ndGggPT09IDApICYmIGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uICE9PSAnbmV2ZXInID8gJ3NpbmdsZScgOiAnbm9uZScsXG5cdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbU5vbkVtcHR5U2VsZWN0aW9uOiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiA9PT0gJ3NlbGVjdGlvbicsXG5cdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbUdsb2JhbENsaXBib2FyZDogdHJ1ZSxcblx0XHRcdHNob3VsZEZvY3VzOiBGaW5kU3RhcnRGb2N1c0FjdGlvbi5Ob0ZvY3VzQ2hhbmdlLFxuXHRcdFx0c2hvdWxkQW5pbWF0ZTogdHJ1ZSxcblx0XHRcdHVwZGF0ZVNlYXJjaFNjb3BlOiBmYWxzZSxcblx0XHRcdGxvb3A6IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmxvb3Bcblx0XHR9KTtcblx0XHRpZiAoIXJ1bk1hdGNoKCkpIHtcblx0XHRcdC8vIFJlLWFubm91bmNlIFwibm8gcmVzdWx0c1wiIGZvciBzY3JlZW4gcmVhZGVycyBvbiBleHBsaWNpdCBuYXZpZ2F0aW9uICgjMzAxMTI2KVxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBjb250cm9sbGVyLmdldFN0YXRlKCk7XG5cdFx0XHRpZiAod2FzRmluZFdpZGdldFZpc2libGUgJiYgc3RhdGUubWF0Y2hlc0NvdW50ID09PSAwICYmIHN0YXRlLnNlYXJjaFN0cmluZykge1xuXHRcdFx0XHRhbGVydEZuKG5scy5sb2NhbGl6ZSgnYXJpYVNlYXJjaE5vUmVzdWx0JywgXCJ7MH0gZm91bmQgZm9yICd7MX0nXCIsIE5MU19OT19SRVNVTFRTLCBzdGF0ZS5zZWFyY2hTdHJpbmcpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IE5leHRNYXRjaEZpbmRBY3Rpb24gPSByZWdpc3Rlck11bHRpRWRpdG9yQWN0aW9uKG5ldyBNdWx0aUVkaXRvckFjdGlvbih7XG5cdGlkOiBGSU5EX0lEUy5OZXh0TWF0Y2hGaW5kQWN0aW9uLFxuXHRsYWJlbDogbmxzLmxvY2FsaXplMignZmluZE5leHRNYXRjaEFjdGlvbicsIFwiRmluZCBOZXh0XCIpLFxuXHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0a2JPcHRzOiBbe1xuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5GMyxcblx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUcsIHNlY29uZGFyeTogW0tleUNvZGUuRjNdIH0sXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0fSwge1xuXHRcdGtiRXhwcjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLCBDT05URVhUX0ZJTkRfSU5QVVRfRk9DVVNFRCksXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHR9XVxufSkpO1xuXG5OZXh0TWF0Y2hGaW5kQWN0aW9uLmFkZEltcGxlbWVudGF0aW9uKDAsIGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogYW55KTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdHJldHVybiBtYXRjaEZpbmRBY3Rpb24oZWRpdG9yLCB0cnVlKTtcbn0pO1xuXG5cbmV4cG9ydCBjb25zdCBQcmV2aW91c01hdGNoRmluZEFjdGlvbiA9IHJlZ2lzdGVyTXVsdGlFZGl0b3JBY3Rpb24obmV3IE11bHRpRWRpdG9yQWN0aW9uKHtcblx0aWQ6IEZJTkRfSURTLlByZXZpb3VzTWF0Y2hGaW5kQWN0aW9uLFxuXHRsYWJlbDogbmxzLmxvY2FsaXplMignZmluZFByZXZpb3VzTWF0Y2hBY3Rpb24nLCBcIkZpbmQgUHJldmlvdXNcIiksXG5cdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRrYk9wdHM6IFt7XG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkYzLFxuXHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Rywgc2Vjb25kYXJ5OiBbS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5GM10gfSxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHR9LCB7XG5cdFx0a2JFeHByOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsIENPTlRFWFRfRklORF9JTlBVVF9GT0NVU0VEKSxcblx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdH1dXG59KSk7XG5cblByZXZpb3VzTWF0Y2hGaW5kQWN0aW9uLmFkZEltcGxlbWVudGF0aW9uKDAsIGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogYW55KTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdHJldHVybiBtYXRjaEZpbmRBY3Rpb24oZWRpdG9yLCBmYWxzZSk7XG59KTtcblxuZXhwb3J0IGNsYXNzIE1vdmVUb01hdGNoRmluZEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0cHJpdmF0ZSBfaGlnaGxpZ2h0RGVjb3JhdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBGSU5EX0lEUy5Hb1RvTWF0Y2hGaW5kQWN0aW9uLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2ZpbmRNYXRjaEFjdGlvbi5nb1RvTWF0Y2gnLCBcIkdvIHRvIE1hdGNoLi4uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZJTkRfV0lER0VUX1ZJU0lCTEVcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1vbkZpbmRDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hdGNoZXNDb3VudCA9IGNvbnRyb2xsZXIuZ2V0U3RhdGUoKS5tYXRjaGVzQ291bnQ7XG5cdFx0aWYgKG1hdGNoZXNDb3VudCA8IDEpIHtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdmaW5kTWF0Y2hBY3Rpb24ubm9SZXN1bHRzJywgXCJObyBtYXRjaGVzLiBUcnkgc2VhcmNoaW5nIGZvciBzb21ldGhpbmcgZWxzZS5cIilcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaW5wdXRCb3ggPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlSW5wdXRCb3goKSk7XG5cdFx0aW5wdXRCb3gucGxhY2Vob2xkZXIgPSBubHMubG9jYWxpemUoJ2ZpbmRNYXRjaEFjdGlvbi5pbnB1dFBsYWNlSG9sZGVyJywgXCJUeXBlIGEgbnVtYmVyIHRvIGdvIHRvIGEgc3BlY2lmaWMgbWF0Y2ggKGJldHdlZW4gMSBhbmQgezB9KVwiLCBtYXRjaGVzQ291bnQpO1xuXG5cdFx0Y29uc3QgdG9GaW5kTWF0Y2hJbmRleCA9ICh2YWx1ZTogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gcGFyc2VJbnQodmFsdWUpO1xuXHRcdFx0aWYgKGlzTmFOKGluZGV4KSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtYXRjaENvdW50ID0gY29udHJvbGxlci5nZXRTdGF0ZSgpLm1hdGNoZXNDb3VudDtcblx0XHRcdGlmIChpbmRleCA+IDAgJiYgaW5kZXggPD0gbWF0Y2hDb3VudCkge1xuXHRcdFx0XHRyZXR1cm4gaW5kZXggLSAxOyAvLyB6ZXJvIGJhc2VkXG5cdFx0XHR9IGVsc2UgaWYgKGluZGV4IDwgMCAmJiBpbmRleCA+PSAtbWF0Y2hDb3VudCkge1xuXHRcdFx0XHRyZXR1cm4gbWF0Y2hDb3VudCArIGluZGV4O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHRjb25zdCB1cGRhdGVQaWNrZXJBbmRFZGl0b3IgPSAodmFsdWU6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0b0ZpbmRNYXRjaEluZGV4KHZhbHVlKTtcblx0XHRcdGlmICh0eXBlb2YgaW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdC8vIHZhbGlkXG5cdFx0XHRcdGlucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRjb250cm9sbGVyLmdvVG9NYXRjaChpbmRleCk7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRNYXRjaCA9IGNvbnRyb2xsZXIuZ2V0U3RhdGUoKS5jdXJyZW50TWF0Y2g7XG5cdFx0XHRcdGlmIChjdXJyZW50TWF0Y2gpIHtcblx0XHRcdFx0XHR0aGlzLmFkZERlY29yYXRpb25zKGVkaXRvciwgY3VycmVudE1hdGNoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5wdXRCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ2ZpbmRNYXRjaEFjdGlvbi5pbnB1dFZhbGlkYXRpb25NZXNzYWdlJywgXCJQbGVhc2UgdHlwZSBhIG51bWJlciBiZXR3ZWVuIDEgYW5kIHswfVwiLCBjb250cm9sbGVyLmdldFN0YXRlKCkubWF0Y2hlc0NvdW50KTtcblx0XHRcdFx0dGhpcy5jbGVhckRlY29yYXRpb25zKGVkaXRvcik7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXRCb3gub25EaWRDaGFuZ2VWYWx1ZSh2YWx1ZSA9PiB7XG5cdFx0XHR1cGRhdGVQaWNrZXJBbmRFZGl0b3IodmFsdWUpO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dEJveC5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRvRmluZE1hdGNoSW5kZXgoaW5wdXRCb3gudmFsdWUpO1xuXHRcdFx0aWYgKHR5cGVvZiBpbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0Y29udHJvbGxlci5nb1RvTWF0Y2goaW5kZXgpO1xuXHRcdFx0XHRpbnB1dEJveC5oaWRlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnZmluZE1hdGNoQWN0aW9uLmlucHV0VmFsaWRhdGlvbk1lc3NhZ2UnLCBcIlBsZWFzZSB0eXBlIGEgbnVtYmVyIGJldHdlZW4gMSBhbmQgezB9XCIsIGNvbnRyb2xsZXIuZ2V0U3RhdGUoKS5tYXRjaGVzQ291bnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dEJveC5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5jbGVhckRlY29yYXRpb25zKGVkaXRvcik7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0aW5wdXRCb3guc2hvdygpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckRlY29yYXRpb25zKGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRlZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoY2hhbmdlQWNjZXNzb3IgPT4ge1xuXHRcdFx0dGhpcy5faGlnaGxpZ2h0RGVjb3JhdGlvbnMgPSBjaGFuZ2VBY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKHRoaXMuX2hpZ2hsaWdodERlY29yYXRpb25zLCBbXSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFkZERlY29yYXRpb25zKGVkaXRvcjogSUNvZGVFZGl0b3IsIHJhbmdlOiBJUmFuZ2UpOiB2b2lkIHtcblx0XHRlZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoY2hhbmdlQWNjZXNzb3IgPT4ge1xuXHRcdFx0dGhpcy5faGlnaGxpZ2h0RGVjb3JhdGlvbnMgPSBjaGFuZ2VBY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKHRoaXMuX2hpZ2hsaWdodERlY29yYXRpb25zLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2ZpbmQtbWF0Y2gtcXVpY2stYWNjZXNzLXJhbmdlLWhpZ2hsaWdodCcsXG5cdFx0XHRcdFx0XHRjbGFzc05hbWU6ICdyYW5nZUhpZ2hsaWdodCcsXG5cdFx0XHRcdFx0XHRpc1dob2xlTGluZTogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnZmluZC1tYXRjaC1xdWljay1hY2Nlc3MtcmFuZ2UtaGlnaGxpZ2h0LW92ZXJ2aWV3Jyxcblx0XHRcdFx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0XHRcdFx0Y29sb3I6IHRoZW1lQ29sb3JGcm9tSWQob3ZlcnZpZXdSdWxlclJhbmdlSGlnaGxpZ2h0KSxcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IE92ZXJ2aWV3UnVsZXJMYW5lLkZ1bGxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBTZWxlY3Rpb25NYXRjaEZpbmRBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1vbkZpbmRDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvblNlYXJjaFN0cmluZyA9IGdldFNlbGVjdGlvblNlYXJjaFN0cmluZyhlZGl0b3IsICdzaW5nbGUnLCBmYWxzZSk7XG5cdFx0aWYgKHNlbGVjdGlvblNlYXJjaFN0cmluZykge1xuXHRcdFx0Y29udHJvbGxlci5zZXRTZWFyY2hTdHJpbmcoc2VsZWN0aW9uU2VhcmNoU3RyaW5nKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9ydW4oY29udHJvbGxlcikpIHtcblx0XHRcdGF3YWl0IGNvbnRyb2xsZXIuc3RhcnQoe1xuXHRcdFx0XHRmb3JjZVJldmVhbFJlcGxhY2U6IGZhbHNlLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjogJ25vbmUnLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbU5vbkVtcHR5U2VsZWN0aW9uOiBmYWxzZSxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21HbG9iYWxDbGlwYm9hcmQ6IGZhbHNlLFxuXHRcdFx0XHRzaG91bGRGb2N1czogRmluZFN0YXJ0Rm9jdXNBY3Rpb24uTm9Gb2N1c0NoYW5nZSxcblx0XHRcdFx0c2hvdWxkQW5pbWF0ZTogdHJ1ZSxcblx0XHRcdFx0dXBkYXRlU2VhcmNoU2NvcGU6IGZhbHNlLFxuXHRcdFx0XHRsb29wOiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5sb29wXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3J1bihjb250cm9sbGVyKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX3J1bihjb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcik6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBOZXh0U2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uIGV4dGVuZHMgU2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRklORF9JRFMuTmV4dFNlbGVjdGlvbk1hdGNoRmluZEFjdGlvbixcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCduZXh0U2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uJywgXCJGaW5kIE5leHQgU2VsZWN0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkYzLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9ydW4oY29udHJvbGxlcjogQ29tbW9uRmluZENvbnRyb2xsZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY29udHJvbGxlci5tb3ZlVG9OZXh0TWF0Y2goKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUHJldmlvdXNTZWxlY3Rpb25NYXRjaEZpbmRBY3Rpb24gZXh0ZW5kcyBTZWxlY3Rpb25NYXRjaEZpbmRBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBGSU5EX0lEUy5QcmV2aW91c1NlbGVjdGlvbk1hdGNoRmluZEFjdGlvbixcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdwcmV2aW91c1NlbGVjdGlvbk1hdGNoRmluZEFjdGlvbicsIFwiRmluZCBQcmV2aW91cyBTZWxlY3Rpb25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRjMsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3J1bihjb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjb250cm9sbGVyLm1vdmVUb1ByZXZNYXRjaCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBTdGFydEZpbmRSZXBsYWNlQWN0aW9uID0gcmVnaXN0ZXJNdWx0aUVkaXRvckFjdGlvbihuZXcgTXVsdGlFZGl0b3JBY3Rpb24oe1xuXHRpZDogRklORF9JRFMuU3RhcnRGaW5kUmVwbGFjZUFjdGlvbixcblx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3N0YXJ0UmVwbGFjZScsIFwiUmVwbGFjZVwiKSxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihFZGl0b3JDb250ZXh0S2V5cy5mb2N1cywgQ29udGV4dEtleUV4cHIuaGFzKCdlZGl0b3JJc09wZW4nKSksXG5cdGtiT3B0czoge1xuXHRcdGtiRXhwcjogbnVsbCxcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SCxcblx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlGIH0sXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0fSxcblx0bWVudU9wdHM6IHtcblx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyRWRpdE1lbnUsXG5cdFx0Z3JvdXA6ICczX2ZpbmQnLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVJlcGxhY2UnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZXBsYWNlXCIpLFxuXHRcdG9yZGVyOiAyXG5cdH1cbn0pKTtcblxuU3RhcnRGaW5kUmVwbGFjZUFjdGlvbi5hZGRJbXBsZW1lbnRhdGlvbigwLCAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IGFueSk6IGJvb2xlYW4gfCBQcm9taXNlPHZvaWQ+ID0+IHtcblx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSB8fCBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgY29udHJvbGxlciA9IENvbW1vbkZpbmRDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBjdXJyZW50U2VsZWN0aW9uID0gZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRjb25zdCBmaW5kSW5wdXRGb2N1c2VkID0gY29udHJvbGxlci5pc0ZpbmRJbnB1dEZvY3VzZWQoKTtcblx0Ly8gd2Ugb25seSBzZWVkIHNlYXJjaCBzdHJpbmcgZnJvbSBzZWxlY3Rpb24gd2hlbiB0aGUgY3VycmVudCBzZWxlY3Rpb24gaXMgc2luZ2xlIGxpbmUgYW5kIG5vdCBlbXB0eSxcblx0Ly8gKyB0aGUgZmluZCBpbnB1dCBpcyBub3QgZm9jdXNlZFxuXHRjb25zdCBzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiA9ICFjdXJyZW50U2VsZWN0aW9uLmlzRW1wdHkoKVxuXHRcdCYmIGN1cnJlbnRTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyID09PSBjdXJyZW50U2VsZWN0aW9uLmVuZExpbmVOdW1iZXJcblx0XHQmJiAoZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gIT09ICduZXZlcicpXG5cdFx0JiYgIWZpbmRJbnB1dEZvY3VzZWQ7XG5cdC8qXG5cdCogaWYgdGhlIGV4aXN0aW5nIHNlYXJjaCBzdHJpbmcgaW4gZmluZCB3aWRnZXQgaXMgZW1wdHkgYW5kIHdlIGRvbid0IHNlZWQgc2VhcmNoIHN0cmluZyBmcm9tIHNlbGVjdGlvbiwgaXQgbWVhbnMgdGhlIEZpbmQgSW5wdXQgaXMgc3RpbGwgZW1wdHksIHNvIHdlIHNob3VsZCBmb2N1cyB0aGUgRmluZCBJbnB1dCBpbnN0ZWFkIG9mIFJlcGxhY2UgSW5wdXQuXG5cblx0KiBmaW5kSW5wdXRGb2N1c2VkIHRydWUgLT4gc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gZmFsc2UsIEZvY3VzUmVwbGFjZUlucHV0XG5cdCogZmluZElucHV0Rm9jdXNlZCBmYWxzZSwgc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gdHJ1ZSBGb2N1c1JlcGxhY2VJbnB1dFxuXHQqIGZpbmRJbnB1dEZvY3VzZWQgZmFsc2Ugc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gZmFsc2UgRm9jdXNGaW5kSW5wdXRcblx0Ki9cblx0Y29uc3Qgc2hvdWxkRm9jdXMgPSAoZmluZElucHV0Rm9jdXNlZCB8fCBzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbikgP1xuXHRcdEZpbmRTdGFydEZvY3VzQWN0aW9uLkZvY3VzUmVwbGFjZUlucHV0IDogRmluZFN0YXJ0Rm9jdXNBY3Rpb24uRm9jdXNGaW5kSW5wdXQ7XG5cblx0cmV0dXJuIGNvbnRyb2xsZXIuc3RhcnQoe1xuXHRcdGZvcmNlUmV2ZWFsUmVwbGFjZTogdHJ1ZSxcblx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjogc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gPyAnc2luZ2xlJyA6ICdub25lJyxcblx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbU5vbkVtcHR5U2VsZWN0aW9uOiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiA9PT0gJ3NlbGVjdGlvbicsXG5cdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21HbG9iYWxDbGlwYm9hcmQ6IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uICE9PSAnbmV2ZXInLFxuXHRcdHNob3VsZEZvY3VzOiBzaG91bGRGb2N1cyxcblx0XHRzaG91bGRBbmltYXRlOiB0cnVlLFxuXHRcdHVwZGF0ZVNlYXJjaFNjb3BlOiBmYWxzZSxcblx0XHRsb29wOiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5sb29wXG5cdH0pO1xufSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKENvbW1vbkZpbmRDb250cm9sbGVyLklELCBGaW5kQ29udHJvbGxlciwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5FYWdlcik7IC8vIGVhZ2VyIGJlY2F1c2UgaXQgdXNlcyBgc2F2ZVZpZXdTdGF0ZWAvYHJlc3RvcmVWaWV3U3RhdGVgXG5cbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFN0YXJ0RmluZFdpdGhBcmdzQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFN0YXJ0RmluZFdpdGhTZWxlY3Rpb25BY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oTW92ZVRvTWF0Y2hGaW5kQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKE5leHRTZWxlY3Rpb25NYXRjaEZpbmRBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oUHJldmlvdXNTZWxlY3Rpb25NYXRjaEZpbmRBY3Rpb24pO1xuXG5jb25zdCBGaW5kQ29tbWFuZCA9IEVkaXRvckNvbW1hbmQuYmluZFRvQ29udHJpYnV0aW9uPENvbW1vbkZpbmRDb250cm9sbGVyPihDb21tb25GaW5kQ29udHJvbGxlci5nZXQpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEZpbmRDb21tYW5kKHtcblx0aWQ6IEZJTkRfSURTLkNsb3NlRmluZFdpZGdldENvbW1hbmQsXG5cdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GSU5EX1dJREdFVF9WSVNJQkxFLFxuXHRoYW5kbGVyOiB4ID0+IHguY2xvc2VGaW5kV2lkZ2V0KCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgNSxcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuRXNjYXBlXVxuXHR9XG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgRmluZENvbW1hbmQoe1xuXHRpZDogRklORF9JRFMuVG9nZ2xlQ2FzZVNlbnNpdGl2ZUNvbW1hbmQsXG5cdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRoYW5kbGVyOiB4ID0+IHgudG9nZ2xlQ2FzZVNlbnNpdGl2ZSgpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDUsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRwcmltYXJ5OiBUb2dnbGVDYXNlU2Vuc2l0aXZlS2V5YmluZGluZy5wcmltYXJ5LFxuXHRcdG1hYzogVG9nZ2xlQ2FzZVNlbnNpdGl2ZUtleWJpbmRpbmcubWFjLFxuXHRcdHdpbjogVG9nZ2xlQ2FzZVNlbnNpdGl2ZUtleWJpbmRpbmcud2luLFxuXHRcdGxpbnV4OiBUb2dnbGVDYXNlU2Vuc2l0aXZlS2V5YmluZGluZy5saW51eFxuXHR9XG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgRmluZENvbW1hbmQoe1xuXHRpZDogRklORF9JRFMuVG9nZ2xlV2hvbGVXb3JkQ29tbWFuZCxcblx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdGhhbmRsZXI6IHggPT4geC50b2dnbGVXaG9sZVdvcmRzKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgNSxcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdHByaW1hcnk6IFRvZ2dsZVdob2xlV29yZEtleWJpbmRpbmcucHJpbWFyeSxcblx0XHRtYWM6IFRvZ2dsZVdob2xlV29yZEtleWJpbmRpbmcubWFjLFxuXHRcdHdpbjogVG9nZ2xlV2hvbGVXb3JkS2V5YmluZGluZy53aW4sXG5cdFx0bGludXg6IFRvZ2dsZVdob2xlV29yZEtleWJpbmRpbmcubGludXhcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEZpbmRDb21tYW5kKHtcblx0aWQ6IEZJTkRfSURTLlRvZ2dsZVJlZ2V4Q29tbWFuZCxcblx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdGhhbmRsZXI6IHggPT4geC50b2dnbGVSZWdleCgpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDUsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRwcmltYXJ5OiBUb2dnbGVSZWdleEtleWJpbmRpbmcucHJpbWFyeSxcblx0XHRtYWM6IFRvZ2dsZVJlZ2V4S2V5YmluZGluZy5tYWMsXG5cdFx0d2luOiBUb2dnbGVSZWdleEtleWJpbmRpbmcud2luLFxuXHRcdGxpbnV4OiBUb2dnbGVSZWdleEtleWJpbmRpbmcubGludXhcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEZpbmRDb21tYW5kKHtcblx0aWQ6IEZJTkRfSURTLlRvZ2dsZVNlYXJjaFNjb3BlQ29tbWFuZCxcblx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdGhhbmRsZXI6IHggPT4geC50b2dnbGVTZWFyY2hTY29wZSgpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDUsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRwcmltYXJ5OiBUb2dnbGVTZWFyY2hTY29wZUtleWJpbmRpbmcucHJpbWFyeSxcblx0XHRtYWM6IFRvZ2dsZVNlYXJjaFNjb3BlS2V5YmluZGluZy5tYWMsXG5cdFx0d2luOiBUb2dnbGVTZWFyY2hTY29wZUtleWJpbmRpbmcud2luLFxuXHRcdGxpbnV4OiBUb2dnbGVTZWFyY2hTY29wZUtleWJpbmRpbmcubGludXhcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEZpbmRDb21tYW5kKHtcblx0aWQ6IEZJTkRfSURTLlRvZ2dsZVByZXNlcnZlQ2FzZUNvbW1hbmQsXG5cdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRoYW5kbGVyOiB4ID0+IHgudG9nZ2xlUHJlc2VydmVDYXNlKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgNSxcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdHByaW1hcnk6IFRvZ2dsZVByZXNlcnZlQ2FzZUtleWJpbmRpbmcucHJpbWFyeSxcblx0XHRtYWM6IFRvZ2dsZVByZXNlcnZlQ2FzZUtleWJpbmRpbmcubWFjLFxuXHRcdHdpbjogVG9nZ2xlUHJlc2VydmVDYXNlS2V5YmluZGluZy53aW4sXG5cdFx0bGludXg6IFRvZ2dsZVByZXNlcnZlQ2FzZUtleWJpbmRpbmcubGludXhcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEZpbmRDb21tYW5kKHtcblx0aWQ6IEZJTkRfSURTLlJlcGxhY2VPbmVBY3Rpb24sXG5cdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GSU5EX1dJREdFVF9WSVNJQkxFLFxuXHRoYW5kbGVyOiB4ID0+IHgucmVwbGFjZSgpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDUsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRGlnaXQxXG5cdH1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBGaW5kQ29tbWFuZCh7XG5cdGlkOiBGSU5EX0lEUy5SZXBsYWNlT25lQWN0aW9uLFxuXHRwcmVjb25kaXRpb246IENPTlRFWFRfRklORF9XSURHRVRfVklTSUJMRSxcblx0aGFuZGxlcjogeCA9PiB4LnJlcGxhY2UoKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA1LFxuXHRcdGtiRXhwcjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLCBDT05URVhUX1JFUExBQ0VfSU5QVVRfRk9DVVNFRCksXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlclxuXHR9XG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgRmluZENvbW1hbmQoe1xuXHRpZDogRklORF9JRFMuUmVwbGFjZUFsbEFjdGlvbixcblx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZJTkRfV0lER0VUX1ZJU0lCTEUsXG5cdGhhbmRsZXI6IHggPT4geC5yZXBsYWNlQWxsKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgNSxcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuRW50ZXJcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEZpbmRDb21tYW5kKHtcblx0aWQ6IEZJTkRfSURTLlJlcGxhY2VBbGxBY3Rpb24sXG5cdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GSU5EX1dJREdFVF9WSVNJQkxFLFxuXHRoYW5kbGVyOiB4ID0+IHgucmVwbGFjZUFsbCgpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDUsXG5cdFx0a2JFeHByOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsIENPTlRFWFRfUkVQTEFDRV9JTlBVVF9GT0NVU0VEKSxcblx0XHRwcmltYXJ5OiB1bmRlZmluZWQsXG5cdFx0bWFjOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0fVxuXHR9XG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgRmluZENvbW1hbmQoe1xuXHRpZDogRklORF9JRFMuU2VsZWN0QWxsTWF0Y2hlc0FjdGlvbixcblx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZJTkRfV0lER0VUX1ZJU0lCTEUsXG5cdGhhbmRsZXI6IHggPT4geC5zZWxlY3RBbGxNYXRjaGVzKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgNSxcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkVudGVyXG5cdH1cbn0pKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTLGVBQWU7QUFDakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsWUFBWSxhQUFhO0FBRXpCLFNBQVMsY0FBYyxlQUFlLGlDQUFpQyxtQkFBbUIsc0JBQXNCLHVCQUF1Qiw0QkFBNEIsaUNBQW1EO0FBQ3ROLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUNBQW1DO0FBRzVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCLDZCQUE2QiwrQkFBK0IsNkJBQTZCLFVBQVUsK0JBQStCLDhCQUE4Qix1QkFBdUIsNkJBQTZCLGlDQUFpQztBQUMxUixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHdCQUE0RTtBQUNyRixTQUFTLFlBQTZCLHNCQUFzQjtBQUM1RCxZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQTZCLDBCQUEwQjtBQUNoRSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFFdEMsTUFBTSwyQkFBMkI7QUFFMUIsU0FBUyx5QkFBeUIsUUFBcUIs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
