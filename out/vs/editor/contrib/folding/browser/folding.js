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
import { createCancelablePromise, Delayer, RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { illegalArgument, onUnexpectedError } from "../../../../base/common/errors.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
import * as types from "../../../../base/common/types.js";
import "./folding.css";
import { StableEditorScrollState } from "../../../browser/stableEditorScroll.js";
import { MouseTargetType } from "../../../browser/editorBrowser.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, registerInstantiatedEditorAction } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { FoldingRangeKind } from "../../../common/languages.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { FoldingModel, getNextFoldLine, getParentFoldLine, getPreviousFoldLine, setCollapseStateAtLevel, setCollapseStateForMatchingLines, setCollapseStateForRest, setCollapseStateForType, setCollapseStateLevelsDown, setCollapseStateLevelsUp, setCollapseStateUp, toggleCollapseState } from "./foldingModel.js";
import { HiddenRangeModel } from "./hiddenRangeModel.js";
import { IndentRangeProvider } from "./indentRangeProvider.js";
import * as nls from "../../../../nls.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { FoldingDecorationProvider } from "./foldingDecorations.js";
import { FoldingRegions, FoldSource } from "./foldingRanges.js";
import { SyntaxRangeProvider } from "./syntaxRangeProvider.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { Emitter } from "../../../../base/common/event.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { URI } from "../../../../base/common/uri.js";
import { IModelService } from "../../../common/services/model.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
const CONTEXT_FOLDING_ENABLED = new RawContextKey("foldingEnabled", false);
let FoldingController = class extends Disposable {
  constructor(editor, contextKeyService, languageConfigurationService, notificationService, languageFeatureDebounceService, languageFeaturesService) {
    super();
    this.contextKeyService = contextKeyService;
    this.languageConfigurationService = languageConfigurationService;
    this.languageFeaturesService = languageFeaturesService;
    this.localToDispose = this._register(new DisposableStore());
    this.editor = editor;
    this._foldingLimitReporter = this._register(new RangesLimitReporter(editor));
    const options = this.editor.getOptions();
    this._isEnabled = options.get(EditorOption.folding);
    this._useFoldingProviders = options.get(EditorOption.foldingStrategy) !== "indentation";
    this._unfoldOnClickAfterEndOfLine = options.get(EditorOption.unfoldOnClickAfterEndOfLine);
    this._restoringViewState = false;
    this._currentModelHasFoldedImports = false;
    this._foldingImportsByDefault = options.get(EditorOption.foldingImportsByDefault);
    this.updateDebounceInfo = languageFeatureDebounceService.for(languageFeaturesService.foldingRangeProvider, "Folding", { min: 200 });
    this.foldingModel = null;
    this.hiddenRangeModel = null;
    this.rangeProvider = null;
    this.foldingRegionPromise = null;
    this.foldingModelPromise = null;
    this.updateScheduler = null;
    this.cursorChangedScheduler = null;
    this.mouseDownInfo = null;
    this.foldingDecorationProvider = new FoldingDecorationProvider(editor);
    this.foldingDecorationProvider.showFoldingControls = options.get(EditorOption.showFoldingControls);
    this.foldingDecorationProvider.showFoldingHighlights = options.get(EditorOption.foldingHighlight);
    this.foldingEnabled = CONTEXT_FOLDING_ENABLED.bindTo(this.contextKeyService);
    this.foldingEnabled.set(this._isEnabled);
    this._register(this.editor.onDidChangeModel(() => this.onModelChanged()));
    this._register(this.editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.folding)) {
        this._isEnabled = this.editor.getOptions().get(EditorOption.folding);
        this.foldingEnabled.set(this._isEnabled);
        this.onModelChanged();
      }
      if (e.hasChanged(EditorOption.foldingMaximumRegions)) {
        this.onModelChanged();
      }
      if (e.hasChanged(EditorOption.showFoldingControls) || e.hasChanged(EditorOption.foldingHighlight)) {
        const options2 = this.editor.getOptions();
        this.foldingDecorationProvider.showFoldingControls = options2.get(EditorOption.showFoldingControls);
        this.foldingDecorationProvider.showFoldingHighlights = options2.get(EditorOption.foldingHighlight);
        this.triggerFoldingModelChanged();
      }
      if (e.hasChanged(EditorOption.foldingStrategy)) {
        this._useFoldingProviders = this.editor.getOptions().get(EditorOption.foldingStrategy) !== "indentation";
        this.onFoldingStrategyChanged();
      }
      if (e.hasChanged(EditorOption.unfoldOnClickAfterEndOfLine)) {
        this._unfoldOnClickAfterEndOfLine = this.editor.getOptions().get(EditorOption.unfoldOnClickAfterEndOfLine);
      }
      if (e.hasChanged(EditorOption.foldingImportsByDefault)) {
        this._foldingImportsByDefault = this.editor.getOptions().get(EditorOption.foldingImportsByDefault);
      }
    }));
    this.onModelChanged();
  }
  static get(editor) {
    return editor.getContribution(FoldingController.ID);
  }
  static getFoldingRangeProviders(languageFeaturesService, model) {
    const foldingRangeProviders = languageFeaturesService.foldingRangeProvider.ordered(model);
    return FoldingController._foldingRangeSelector?.(foldingRangeProviders, model) ?? foldingRangeProviders;
  }
  static setFoldingRangeProviderSelector(foldingRangeSelector) {
    FoldingController._foldingRangeSelector = foldingRangeSelector;
    return { dispose: () => {
      FoldingController._foldingRangeSelector = void 0;
    } };
  }
  get limitReporter() {
    return this._foldingLimitReporter;
  }
  /**
   * Store view state.
   */
  saveViewState() {
    const model = this.editor.getModel();
    if (!model || !this._isEnabled || model.isTooLargeForTokenization()) {
      return {};
    }
    if (this.foldingModel) {
      const collapsedRegions = this.foldingModel.getMemento();
      const provider = this.rangeProvider ? this.rangeProvider.id : void 0;
      return { collapsedRegions, lineCount: model.getLineCount(), provider, foldedImports: this._currentModelHasFoldedImports };
    }
    return void 0;
  }
  /**
   * Restore view state.
   */
  restoreViewState(state) {
    const model = this.editor.getModel();
    if (!model || !this._isEnabled || model.isTooLargeForTokenization() || !this.hiddenRangeModel) {
      return;
    }
    if (!state) {
      return;
    }
    this._currentModelHasFoldedImports = !!state.foldedImports;
    if (state.collapsedRegions && state.collapsedRegions.length > 0 && this.foldingModel) {
      this._restoringViewState = true;
      try {
        this.foldingModel.applyMemento(state.collapsedRegions);
      } finally {
        this._restoringViewState = false;
      }
    }
  }
  onModelChanged() {
    this.localToDispose.clear();
    const model = this.editor.getModel();
    if (!this._isEnabled || !model || model.isTooLargeForTokenization()) {
      return;
    }
    this._currentModelHasFoldedImports = false;
    this.foldingModel = new FoldingModel(model, this.foldingDecorationProvider);
    this.localToDispose.add(this.foldingModel);
    this.hiddenRangeModel = new HiddenRangeModel(this.foldingModel);
    this.localToDispose.add(this.hiddenRangeModel);
    this.localToDispose.add(this.hiddenRangeModel.onDidChange((hr) => this.onHiddenRangesChanges(hr)));
    this.updateScheduler = new Delayer(this.updateDebounceInfo.get(model));
    this.localToDispose.add(this.updateScheduler);
    this.cursorChangedScheduler = new RunOnceScheduler(() => this.revealCursor(), 200);
    this.localToDispose.add(this.cursorChangedScheduler);
    this.localToDispose.add(this.languageFeaturesService.foldingRangeProvider.onDidChange(() => this.onFoldingStrategyChanged()));
    this.localToDispose.add(this.editor.onDidChangeModelLanguageConfiguration(() => this.onFoldingStrategyChanged()));
    this.localToDispose.add(this.editor.onDidChangeModelContent((e) => this.onDidChangeModelContent(e)));
    this.localToDispose.add(this.editor.onDidChangeCursorPosition(() => this.onCursorPositionChanged()));
    this.localToDispose.add(this.editor.onMouseDown((e) => this.onEditorMouseDown(e)));
    this.localToDispose.add(this.editor.onMouseUp((e) => this.onEditorMouseUp(e)));
    this.localToDispose.add({
      dispose: () => {
        if (this.foldingRegionPromise) {
          this.foldingRegionPromise.cancel();
          this.foldingRegionPromise = null;
        }
        this.updateScheduler?.cancel();
        this.updateScheduler = null;
        this.foldingModel = null;
        this.foldingModelPromise = null;
        this.hiddenRangeModel = null;
        this.cursorChangedScheduler = null;
        this.rangeProvider?.dispose();
        this.rangeProvider = null;
      }
    });
    this.triggerFoldingModelChanged();
  }
  onFoldingStrategyChanged() {
    this.rangeProvider?.dispose();
    this.rangeProvider = null;
    this.triggerFoldingModelChanged();
  }
  getRangeProvider(editorModel) {
    if (this.rangeProvider) {
      return this.rangeProvider;
    }
    const indentRangeProvider = new IndentRangeProvider(editorModel, this.languageConfigurationService, this._foldingLimitReporter);
    this.rangeProvider = indentRangeProvider;
    if (this._useFoldingProviders && this.foldingModel) {
      const selectedProviders = FoldingController.getFoldingRangeProviders(this.languageFeaturesService, editorModel);
      if (selectedProviders.length > 0) {
        this.rangeProvider = new SyntaxRangeProvider(editorModel, selectedProviders, () => this.triggerFoldingModelChanged(), this._foldingLimitReporter, indentRangeProvider);
      }
    }
    return this.rangeProvider;
  }
  getFoldingModel() {
    return this.foldingModelPromise;
  }
  onDidChangeModelContent(e) {
    this.hiddenRangeModel?.notifyChangeModelContent(e);
    this.triggerFoldingModelChanged();
  }
  triggerFoldingModelChanged() {
    if (this.updateScheduler) {
      if (this.foldingRegionPromise) {
        this.foldingRegionPromise.cancel();
        this.foldingRegionPromise = null;
      }
      this.foldingModelPromise = this.updateScheduler.trigger(() => {
        const foldingModel = this.foldingModel;
        if (!foldingModel) {
          return null;
        }
        const sw = new StopWatch();
        const provider = this.getRangeProvider(foldingModel.textModel);
        const foldingRegionPromise = this.foldingRegionPromise = createCancelablePromise((token) => provider.compute(token));
        return foldingRegionPromise.then((foldingRanges) => {
          if (foldingRanges && foldingRegionPromise === this.foldingRegionPromise) {
            let scrollState;
            if (this._foldingImportsByDefault && !this._currentModelHasFoldedImports) {
              const hasChanges = foldingRanges.setCollapsedAllOfType(FoldingRangeKind.Imports.value, true);
              if (hasChanges) {
                scrollState = StableEditorScrollState.capture(this.editor);
                this._currentModelHasFoldedImports = hasChanges;
              }
            }
            const selections = this.editor.getSelections();
            foldingModel.update(foldingRanges, toSelectedLines(selections));
            scrollState?.restore(this.editor);
            const newValue = this.updateDebounceInfo.update(foldingModel.textModel, sw.elapsed());
            if (this.updateScheduler) {
              this.updateScheduler.defaultDelay = newValue;
            }
          }
          return foldingModel;
        });
      }).then(void 0, (err) => {
        onUnexpectedError(err);
        return null;
      });
    }
  }
  onHiddenRangesChanges(hiddenRanges) {
    if (this.hiddenRangeModel && hiddenRanges.length && !this._restoringViewState) {
      const selections = this.editor.getSelections();
      if (selections) {
        if (this.hiddenRangeModel.adjustSelections(selections)) {
          this.editor.setSelections(selections);
        }
      }
    }
    this.editor.setHiddenAreas(hiddenRanges, this);
  }
  onCursorPositionChanged() {
    if (this.hiddenRangeModel && this.hiddenRangeModel.hasRanges()) {
      this.cursorChangedScheduler.schedule();
    }
  }
  revealCursor() {
    const foldingModel = this.getFoldingModel();
    if (!foldingModel) {
      return;
    }
    foldingModel.then((foldingModel2) => {
      if (foldingModel2) {
        const selections = this.editor.getSelections();
        if (selections && selections.length > 0) {
          const toToggle = [];
          for (const selection of selections) {
            const lineNumber = selection.selectionStartLineNumber;
            if (this.hiddenRangeModel && this.hiddenRangeModel.isHidden(lineNumber)) {
              toToggle.push(...foldingModel2.getAllRegionsAtLine(lineNumber, (r) => r.isCollapsed && lineNumber > r.startLineNumber));
            }
          }
          if (toToggle.length) {
            foldingModel2.toggleCollapseState(toToggle);
            this.reveal(selections[0].getPosition());
          }
        }
      }
    }).then(void 0, onUnexpectedError);
  }
  onEditorMouseDown(e) {
    this.mouseDownInfo = null;
    if (!this.hiddenRangeModel || !e.target || !e.target.range) {
      return;
    }
    if (!e.event.leftButton && !e.event.middleButton) {
      return;
    }
    const range = e.target.range;
    let iconClicked = false;
    switch (e.target.type) {
      case MouseTargetType.GUTTER_LINE_DECORATIONS: {
        const data = e.target.detail;
        const offsetLeftInGutter = e.target.element.offsetLeft;
        const gutterOffsetX = data.offsetX - offsetLeftInGutter;
        if (gutterOffsetX < 4) {
          return;
        }
        iconClicked = true;
        break;
      }
      case MouseTargetType.CONTENT_EMPTY: {
        if (this._unfoldOnClickAfterEndOfLine && this.hiddenRangeModel.hasRanges()) {
          const data = e.target.detail;
          if (!data.isAfterLines) {
            break;
          }
        }
        return;
      }
      case MouseTargetType.CONTENT_TEXT: {
        if (this.hiddenRangeModel.hasRanges()) {
          const model = this.editor.getModel();
          if (model && range.startColumn === model.getLineMaxColumn(range.startLineNumber)) {
            break;
          }
        }
        return;
      }
      default:
        return;
    }
    this.mouseDownInfo = { lineNumber: range.startLineNumber, iconClicked };
  }
  onEditorMouseUp(e) {
    const foldingModel = this.foldingModel;
    if (!foldingModel || !this.mouseDownInfo || !e.target) {
      return;
    }
    const lineNumber = this.mouseDownInfo.lineNumber;
    const iconClicked = this.mouseDownInfo.iconClicked;
    const range = e.target.range;
    if (!range || range.startLineNumber !== lineNumber) {
      return;
    }
    if (iconClicked) {
      if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
        return;
      }
    } else {
      const model = this.editor.getModel();
      if (!model || range.startColumn !== model.getLineMaxColumn(lineNumber)) {
        return;
      }
    }
    const region = foldingModel.getRegionAtLine(lineNumber);
    if (region && region.startLineNumber === lineNumber) {
      const isCollapsed = region.isCollapsed;
      if (iconClicked || isCollapsed) {
        const surrounding = e.event.altKey;
        let toToggle = [];
        if (surrounding) {
          const filter = (otherRegion) => !otherRegion.containedBy(region) && !region.containedBy(otherRegion);
          const toMaybeToggle = foldingModel.getRegionsInside(null, filter);
          for (const r of toMaybeToggle) {
            if (r.isCollapsed) {
              toToggle.push(r);
            }
          }
          if (toToggle.length === 0) {
            toToggle = toMaybeToggle;
          }
        } else {
          const recursive = e.event.middleButton || e.event.shiftKey;
          if (recursive) {
            for (const r of foldingModel.getRegionsInside(region)) {
              if (r.isCollapsed === isCollapsed) {
                toToggle.push(r);
              }
            }
          }
          if (isCollapsed || !recursive || toToggle.length === 0) {
            toToggle.push(region);
          }
        }
        foldingModel.toggleCollapseState(toToggle);
        this.reveal({ lineNumber, column: 1 });
      }
    }
  }
  reveal(position) {
    this.editor.revealPositionInCenterIfOutsideViewport(position, ScrollType.Smooth);
  }
};
FoldingController.ID = "editor.contrib.folding";
FoldingController = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, ILanguageConfigurationService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, ILanguageFeatureDebounceService),
  __decorateParam(5, ILanguageFeaturesService)
], FoldingController);
class RangesLimitReporter extends Disposable {
  constructor(editor) {
    super();
    this.editor = editor;
    this._onDidChange = this._register(new Emitter());
    this._computed = 0;
    this._limited = false;
  }
  get limit() {
    return this.editor.getOptions().get(EditorOption.foldingMaximumRegions);
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  get computed() {
    return this._computed;
  }
  get limited() {
    return this._limited;
  }
  update(computed, limited) {
    if (computed !== this._computed || limited !== this._limited) {
      this._computed = computed;
      this._limited = limited;
      this._onDidChange.fire();
    }
  }
}
class FoldingAction extends EditorAction {
  runEditorCommand(accessor, editor, args) {
    const languageConfigurationService = accessor.get(ILanguageConfigurationService);
    const foldingController = FoldingController.get(editor);
    if (!foldingController) {
      return;
    }
    const foldingModelPromise = foldingController.getFoldingModel();
    if (foldingModelPromise) {
      this.reportTelemetry(accessor, editor);
      return foldingModelPromise.then((foldingModel) => {
        if (foldingModel) {
          this.invoke(foldingController, foldingModel, editor, args, languageConfigurationService);
          const selection = editor.getSelection();
          if (selection) {
            foldingController.reveal(selection.getStartPosition());
          }
        }
      });
    }
  }
  getSelectedLines(editor) {
    const selections = editor.getSelections();
    return selections ? selections.map((s) => s.startLineNumber) : [];
  }
  getLineNumbers(args, editor) {
    if (args && args.selectionLines) {
      return args.selectionLines.map((l) => l + 1);
    }
    return this.getSelectedLines(editor);
  }
  run(_accessor, _editor) {
  }
}
function toSelectedLines(selections) {
  if (!selections || selections.length === 0) {
    return {
      startsInside: () => false
    };
  }
  return {
    startsInside(startLine, endLine) {
      for (const s of selections) {
        const line = s.startLineNumber;
        if (line >= startLine && line <= endLine) {
          return true;
        }
      }
      return false;
    }
  };
}
function foldingArgumentsConstraint(args) {
  if (!types.isUndefined(args)) {
    if (!types.isObject(args)) {
      return false;
    }
    const foldingArgs = args;
    if (!types.isUndefined(foldingArgs.levels) && !types.isNumber(foldingArgs.levels)) {
      return false;
    }
    if (!types.isUndefined(foldingArgs.direction) && !types.isString(foldingArgs.direction)) {
      return false;
    }
    if (!types.isUndefined(foldingArgs.selectionLines) && (!Array.isArray(foldingArgs.selectionLines) || !foldingArgs.selectionLines.every(types.isNumber))) {
      return false;
    }
  }
  return true;
}
class UnfoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.unfold",
      label: nls.localize2("unfoldAction.label", "Unfold"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.BracketRight
        },
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: "Unfold the content in the editor",
        args: [
          {
            name: "Unfold editor argument",
            description: `Property-value pairs that can be passed through this argument:
						* 'levels': Number of levels to unfold. If not set, defaults to 1.
						* 'direction': If 'up', unfold given number of levels up otherwise unfolds down.
						* 'selectionLines': Array of the start lines (0-based) of the editor selections to apply the unfold action to. If not set, the active selection(s) will be used.
						`,
            constraint: foldingArgumentsConstraint,
            schema: {
              "type": "object",
              "properties": {
                "levels": {
                  "type": "number",
                  "default": 1
                },
                "direction": {
                  "type": "string",
                  "enum": ["up", "down"],
                  "default": "down"
                },
                "selectionLines": {
                  "type": "array",
                  "items": {
                    "type": "number"
                  }
                }
              }
            }
          }
        ]
      }
    });
  }
  invoke(_foldingController, foldingModel, editor, args) {
    const levels = args && args.levels || 1;
    const lineNumbers = this.getLineNumbers(args, editor);
    if (args && args.direction === "up") {
      setCollapseStateLevelsUp(foldingModel, false, levels, lineNumbers);
    } else {
      setCollapseStateLevelsDown(foldingModel, false, levels, lineNumbers);
    }
  }
}
class UnFoldRecursivelyAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.unfoldRecursively",
      label: nls.localize2("unFoldRecursivelyAction.label", "Unfold Recursively"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.BracketRight),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor, _args) {
    setCollapseStateLevelsDown(foldingModel, false, Number.MAX_VALUE, this.getSelectedLines(editor));
  }
}
class FoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.fold",
      label: nls.localize2("foldAction.label", "Fold"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.BracketLeft
        },
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: "Fold the content in the editor",
        args: [
          {
            name: "Fold editor argument",
            description: `Property-value pairs that can be passed through this argument:
							* 'levels': Number of levels to fold.
							* 'direction': If 'up', folds given number of levels up otherwise folds down.
							* 'selectionLines': Array of the start lines (0-based) of the editor selections to apply the fold action to. If not set, the active selection(s) will be used.
							If no levels or direction is set, folds the region at the locations or if already collapsed, the first uncollapsed parent instead.
						`,
            constraint: foldingArgumentsConstraint,
            schema: {
              "type": "object",
              "properties": {
                "levels": {
                  "type": "number"
                },
                "direction": {
                  "type": "string",
                  "enum": ["up", "down"]
                },
                "selectionLines": {
                  "type": "array",
                  "items": {
                    "type": "number"
                  }
                }
              }
            }
          }
        ]
      }
    });
  }
  invoke(_foldingController, foldingModel, editor, args) {
    const lineNumbers = this.getLineNumbers(args, editor);
    const levels = args && args.levels;
    const direction = args && args.direction;
    if (typeof levels !== "number" && typeof direction !== "string") {
      setCollapseStateUp(foldingModel, true, lineNumbers);
    } else {
      if (direction === "up") {
        setCollapseStateLevelsUp(foldingModel, true, levels || 1, lineNumbers);
      } else {
        setCollapseStateLevelsDown(foldingModel, true, levels || 1, lineNumbers);
      }
    }
  }
}
class ToggleFoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.toggleFold",
      label: nls.localize2("toggleFoldAction.label", "Toggle Fold"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyL),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    toggleCollapseState(foldingModel, 1, selectedLines);
  }
}
class FoldRecursivelyAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.foldRecursively",
      label: nls.localize2("foldRecursivelyAction.label", "Fold Recursively"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.BracketLeft),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    setCollapseStateLevelsDown(foldingModel, true, Number.MAX_VALUE, selectedLines);
  }
}
class ToggleFoldRecursivelyAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.toggleFoldRecursively",
      label: nls.localize2("toggleFoldRecursivelyAction.label", "Toggle Fold Recursively"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    toggleCollapseState(foldingModel, Number.MAX_VALUE, selectedLines);
  }
}
class FoldAllBlockCommentsAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.foldAllBlockComments",
      label: nls.localize2("foldAllBlockComments.label", "Fold All Block Comments"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Slash),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor, args, languageConfigurationService) {
    if (foldingModel.regions.hasTypes()) {
      setCollapseStateForType(foldingModel, FoldingRangeKind.Comment.value, true);
    } else {
      const editorModel = editor.getModel();
      if (!editorModel) {
        return;
      }
      const comments = languageConfigurationService.getLanguageConfiguration(editorModel.getLanguageId()).comments;
      if (comments && comments.blockCommentStartToken) {
        const regExp = new RegExp("^\\s*" + escapeRegExpCharacters(comments.blockCommentStartToken));
        setCollapseStateForMatchingLines(foldingModel, regExp, true);
      }
    }
  }
}
class FoldAllRegionsAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.foldAllMarkerRegions",
      label: nls.localize2("foldAllMarkerRegions.label", "Fold All Regions"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Digit8),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor, args, languageConfigurationService) {
    if (foldingModel.regions.hasTypes()) {
      setCollapseStateForType(foldingModel, FoldingRangeKind.Region.value, true);
    } else {
      const editorModel = editor.getModel();
      if (!editorModel) {
        return;
      }
      const foldingRules = languageConfigurationService.getLanguageConfiguration(editorModel.getLanguageId()).foldingRules;
      if (foldingRules && foldingRules.markers && foldingRules.markers.start) {
        const regExp = new RegExp(foldingRules.markers.start);
        setCollapseStateForMatchingLines(foldingModel, regExp, true);
      }
    }
  }
}
class UnfoldAllRegionsAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.unfoldAllMarkerRegions",
      label: nls.localize2("unfoldAllMarkerRegions.label", "Unfold All Regions"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Digit9),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor, args, languageConfigurationService) {
    if (foldingModel.regions.hasTypes()) {
      setCollapseStateForType(foldingModel, FoldingRangeKind.Region.value, false);
    } else {
      const editorModel = editor.getModel();
      if (!editorModel) {
        return;
      }
      const foldingRules = languageConfigurationService.getLanguageConfiguration(editorModel.getLanguageId()).foldingRules;
      if (foldingRules && foldingRules.markers && foldingRules.markers.start) {
        const regExp = new RegExp(foldingRules.markers.start);
        setCollapseStateForMatchingLines(foldingModel, regExp, false);
      }
    }
  }
}
class FoldAllExceptAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.foldAllExcept",
      label: nls.localize2("foldAllExcept.label", "Fold All Except Selected"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Minus),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    setCollapseStateForRest(foldingModel, true, selectedLines);
  }
}
class UnfoldAllExceptAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.unfoldAllExcept",
      label: nls.localize2("unfoldAllExcept.label", "Unfold All Except Selected"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    setCollapseStateForRest(foldingModel, false, selectedLines);
  }
}
class FoldAllAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.foldAll",
      label: nls.localize2("foldAllAction.label", "Fold All"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Digit0),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, _editor) {
    setCollapseStateLevelsDown(foldingModel, true);
  }
}
class UnfoldAllAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.unfoldAll",
      label: nls.localize2("unfoldAllAction.label", "Unfold All"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyJ),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, _editor) {
    setCollapseStateLevelsDown(foldingModel, false);
  }
}
const _FoldLevelAction = class _FoldLevelAction extends FoldingAction {
  getFoldingLevel() {
    return parseInt(this.id.substr(_FoldLevelAction.ID_PREFIX.length));
  }
  invoke(_foldingController, foldingModel, editor) {
    setCollapseStateAtLevel(foldingModel, this.getFoldingLevel(), true, this.getSelectedLines(editor));
  }
};
_FoldLevelAction.ID_PREFIX = "editor.foldLevel";
_FoldLevelAction.ID = (level) => _FoldLevelAction.ID_PREFIX + level;
let FoldLevelAction = _FoldLevelAction;
class GotoParentFoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.gotoParentFold",
      label: nls.localize2("gotoParentFold.label", "Go to Parent Fold"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    if (selectedLines.length > 0) {
      const startLineNumber = getParentFoldLine(selectedLines[0], foldingModel);
      if (startLineNumber !== null) {
        editor.setSelection({
          startLineNumber,
          startColumn: 1,
          endLineNumber: startLineNumber,
          endColumn: 1
        });
      }
    }
  }
}
class GotoPreviousFoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.gotoPreviousFold",
      label: nls.localize2("gotoPreviousFold.label", "Go to Previous Folding Range"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    if (selectedLines.length > 0) {
      const startLineNumber = getPreviousFoldLine(selectedLines[0], foldingModel);
      if (startLineNumber !== null) {
        editor.setSelection({
          startLineNumber,
          startColumn: 1,
          endLineNumber: startLineNumber,
          endColumn: 1
        });
      }
    }
  }
}
class GotoNextFoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.gotoNextFold",
      label: nls.localize2("gotoNextFold.label", "Go to Next Folding Range"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    if (selectedLines.length > 0) {
      const startLineNumber = getNextFoldLine(selectedLines[0], foldingModel);
      if (startLineNumber !== null) {
        editor.setSelection({
          startLineNumber,
          startColumn: 1,
          endLineNumber: startLineNumber,
          endColumn: 1
        });
      }
    }
  }
}
class FoldRangeFromSelectionAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.createFoldingRangeFromSelection",
      label: nls.localize2("createManualFoldRange.label", "Create Folding Range from Selection"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Comma),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const collapseRanges = [];
    const selections = editor.getSelections();
    if (selections) {
      for (const selection of selections) {
        let endLineNumber = selection.endLineNumber;
        if (selection.endColumn === 1) {
          --endLineNumber;
        }
        if (endLineNumber > selection.startLineNumber) {
          collapseRanges.push({
            startLineNumber: selection.startLineNumber,
            endLineNumber,
            type: void 0,
            isCollapsed: true,
            source: FoldSource.userDefined
          });
          editor.setSelection({
            startLineNumber: selection.startLineNumber,
            startColumn: 1,
            endLineNumber: selection.startLineNumber,
            endColumn: 1
          });
        }
      }
      if (collapseRanges.length > 0) {
        collapseRanges.sort((a, b) => {
          return a.startLineNumber - b.startLineNumber;
        });
        const newRanges = FoldingRegions.sanitizeAndMerge(foldingModel.regions, collapseRanges, editor.getModel()?.getLineCount());
        foldingModel.updatePost(FoldingRegions.fromFoldRanges(newRanges));
      }
    }
  }
}
class RemoveFoldRangeFromSelectionAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.removeManualFoldingRanges",
      label: nls.localize2("removeManualFoldingRanges.label", "Remove Manual Folding Ranges"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Period),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(foldingController, foldingModel, editor) {
    const selections = editor.getSelections();
    if (selections) {
      foldingModel.removeManualRanges(selections);
      foldingController.triggerFoldingModelChanged();
    }
  }
}
class ToggleImportFoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.toggleImportFold",
      label: nls.localize2("toggleImportFold.label", "Toggle Import Fold"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  async invoke(foldingController, foldingModel) {
    const regionsToToggle = [];
    const regions = foldingModel.regions;
    for (let i = regions.length - 1; i >= 0; i--) {
      if (regions.getType(i) === FoldingRangeKind.Imports.value) {
        regionsToToggle.push(regions.toRegion(i));
      }
    }
    foldingModel.toggleCollapseState(regionsToToggle);
    foldingController.triggerFoldingModelChanged();
  }
}
registerEditorContribution(FoldingController.ID, FoldingController, EditorContributionInstantiation.Eager);
registerEditorAction(UnfoldAction);
registerEditorAction(UnFoldRecursivelyAction);
registerEditorAction(FoldAction);
registerEditorAction(FoldRecursivelyAction);
registerEditorAction(ToggleFoldRecursivelyAction);
registerEditorAction(FoldAllAction);
registerEditorAction(UnfoldAllAction);
registerEditorAction(FoldAllBlockCommentsAction);
registerEditorAction(FoldAllRegionsAction);
registerEditorAction(UnfoldAllRegionsAction);
registerEditorAction(FoldAllExceptAction);
registerEditorAction(UnfoldAllExceptAction);
registerEditorAction(ToggleFoldAction);
registerEditorAction(GotoParentFoldAction);
registerEditorAction(GotoPreviousFoldAction);
registerEditorAction(GotoNextFoldAction);
registerEditorAction(FoldRangeFromSelectionAction);
registerEditorAction(RemoveFoldRangeFromSelectionAction);
registerEditorAction(ToggleImportFoldAction);
for (let i = 1; i <= 7; i++) {
  registerInstantiatedEditorAction(
    new FoldLevelAction({
      id: FoldLevelAction.ID(i),
      label: nls.localize2("foldLevelAction.label", "Fold Level {0}", i),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Digit0 + i),
        weight: KeybindingWeight.EditorContrib
      }
    })
  );
}
CommandsRegistry.registerCommand("_executeFoldingRangeProvider", async function(accessor, ...args) {
  const [resource] = args;
  if (!(resource instanceof URI)) {
    throw illegalArgument();
  }
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const model = accessor.get(IModelService).getModel(resource);
  if (!model) {
    throw illegalArgument();
  }
  const configurationService = accessor.get(IConfigurationService);
  if (!configurationService.getValue("editor.folding", { resource })) {
    return [];
  }
  const languageConfigurationService = accessor.get(ILanguageConfigurationService);
  const strategy = configurationService.getValue("editor.foldingStrategy", { resource });
  const foldingLimitReporter = {
    get limit() {
      return configurationService.getValue("editor.foldingMaximumRegions", { resource });
    },
    update: (computed, limited) => {
    }
  };
  const indentRangeProvider = new IndentRangeProvider(model, languageConfigurationService, foldingLimitReporter);
  let rangeProvider = indentRangeProvider;
  if (strategy !== "indentation") {
    const providers = FoldingController.getFoldingRangeProviders(languageFeaturesService, model);
    if (providers.length) {
      rangeProvider = new SyntaxRangeProvider(model, providers, () => {
      }, foldingLimitReporter, indentRangeProvider);
    }
  }
  const ranges = await rangeProvider.compute(CancellationToken.None);
  const result = [];
  try {
    if (ranges) {
      for (let i = 0; i < ranges.length; i++) {
        const type = ranges.getType(i);
        result.push({ start: ranges.getStartLineNumber(i), end: ranges.getEndLineNumber(i), kind: type ? FoldingRangeKind.fromValue(type) : void 0 });
      }
    }
    return result;
  } finally {
    rangeProvider.dispose();
  }
});
export {
  FoldingController,
  RangesLimitReporter,
  toSelectedLines
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZvbGRpbmdcXGJyb3dzZXJcXGZvbGRpbmcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIERlbGF5ZXIsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpbGxlZ2FsQXJndW1lbnQsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAnLi9mb2xkaW5nLmNzcyc7XG5pbXBvcnQgeyBTdGFibGVFZGl0b3JTY3JvbGxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvc3RhYmxlRWRpdG9yU2Nyb2xsLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJRWRpdG9yTW91c2VFdmVudCwgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiwgcmVnaXN0ZXJFZGl0b3JBY3Rpb24sIHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uLCByZWdpc3Rlckluc3RhbnRpYXRlZEVkaXRvckFjdGlvbiwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50LCBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24sIFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsQ29udGVudENoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgRm9sZGluZ1JhbmdlLCBGb2xkaW5nUmFuZ2VLaW5kLCBGb2xkaW5nUmFuZ2VQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbGxhcHNlTWVtZW50bywgRm9sZGluZ01vZGVsLCBnZXROZXh0Rm9sZExpbmUsIGdldFBhcmVudEZvbGRMaW5lLCBnZXRQcmV2aW91c0ZvbGRMaW5lLCBzZXRDb2xsYXBzZVN0YXRlQXRMZXZlbCwgc2V0Q29sbGFwc2VTdGF0ZUZvck1hdGNoaW5nTGluZXMsIHNldENvbGxhcHNlU3RhdGVGb3JSZXN0LCBzZXRDb2xsYXBzZVN0YXRlRm9yVHlwZSwgc2V0Q29sbGFwc2VTdGF0ZUxldmVsc0Rvd24sIHNldENvbGxhcHNlU3RhdGVMZXZlbHNVcCwgc2V0Q29sbGFwc2VTdGF0ZVVwLCB0b2dnbGVDb2xsYXBzZVN0YXRlIH0gZnJvbSAnLi9mb2xkaW5nTW9kZWwuanMnO1xuaW1wb3J0IHsgSGlkZGVuUmFuZ2VNb2RlbCB9IGZyb20gJy4vaGlkZGVuUmFuZ2VNb2RlbC5qcyc7XG5pbXBvcnQgeyBJbmRlbnRSYW5nZVByb3ZpZGVyIH0gZnJvbSAnLi9pbmRlbnRSYW5nZVByb3ZpZGVyLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRm9sZGluZ0RlY29yYXRpb25Qcm92aWRlciB9IGZyb20gJy4vZm9sZGluZ0RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IEZvbGRpbmdSZWdpb24sIEZvbGRpbmdSZWdpb25zLCBGb2xkUmFuZ2UsIEZvbGRTb3VyY2UgfSBmcm9tICcuL2ZvbGRpbmdSYW5nZXMuanMnO1xuaW1wb3J0IHsgU3ludGF4UmFuZ2VQcm92aWRlciB9IGZyb20gJy4vc3ludGF4UmFuZ2VQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbiwgSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuXG5jb25zdCBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdmb2xkaW5nRW5hYmxlZCcsIGZhbHNlKTtcblxuZXhwb3J0IGludGVyZmFjZSBSYW5nZVByb3ZpZGVyIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0Y29tcHV0ZShjYW5jZWxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Rm9sZGluZ1JlZ2lvbnMgfCBudWxsPjtcblx0ZGlzcG9zZSgpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgRm9sZGluZ1N0YXRlTWVtZW50byB7XG5cdGNvbGxhcHNlZFJlZ2lvbnM/OiBDb2xsYXBzZU1lbWVudG87XG5cdGxpbmVDb3VudD86IG51bWJlcjtcblx0cHJvdmlkZXI/OiBzdHJpbmc7XG5cdGZvbGRlZEltcG9ydHM/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZvbGRpbmdMaW1pdFJlcG9ydGVyIHtcblx0cmVhZG9ubHkgbGltaXQ6IG51bWJlcjtcblx0dXBkYXRlKGNvbXB1dGVkOiBudW1iZXIsIGxpbWl0ZWQ6IG51bWJlciB8IGZhbHNlKTogdm9pZDtcbn1cblxuZXhwb3J0IHR5cGUgRm9sZGluZ1JhbmdlUHJvdmlkZXJTZWxlY3RvciA9IChwcm92aWRlcjogRm9sZGluZ1JhbmdlUHJvdmlkZXJbXSwgZG9jdW1lbnQ6IElUZXh0TW9kZWwpID0+IEZvbGRpbmdSYW5nZVByb3ZpZGVyW10gfCB1bmRlZmluZWQ7XG5cbmV4cG9ydCBjbGFzcyBGb2xkaW5nQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLmZvbGRpbmcnO1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBGb2xkaW5nQ29udHJvbGxlciB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPEZvbGRpbmdDb250cm9sbGVyPihGb2xkaW5nQ29udHJvbGxlci5JRCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZm9sZGluZ1JhbmdlU2VsZWN0b3I6IEZvbGRpbmdSYW5nZVByb3ZpZGVyU2VsZWN0b3IgfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIHN0YXRpYyBnZXRGb2xkaW5nUmFuZ2VQcm92aWRlcnMobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbW9kZWw6IElUZXh0TW9kZWwpOiBGb2xkaW5nUmFuZ2VQcm92aWRlcltdIHtcblx0XHRjb25zdCBmb2xkaW5nUmFuZ2VQcm92aWRlcnMgPSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5mb2xkaW5nUmFuZ2VQcm92aWRlci5vcmRlcmVkKG1vZGVsKTtcblx0XHRyZXR1cm4gKEZvbGRpbmdDb250cm9sbGVyLl9mb2xkaW5nUmFuZ2VTZWxlY3Rvcj8uKGZvbGRpbmdSYW5nZVByb3ZpZGVycywgbW9kZWwpKSA/PyBmb2xkaW5nUmFuZ2VQcm92aWRlcnM7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNldEZvbGRpbmdSYW5nZVByb3ZpZGVyU2VsZWN0b3IoZm9sZGluZ1JhbmdlU2VsZWN0b3I6IEZvbGRpbmdSYW5nZVByb3ZpZGVyU2VsZWN0b3IpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Rm9sZGluZ0NvbnRyb2xsZXIuX2ZvbGRpbmdSYW5nZVNlbGVjdG9yID0gZm9sZGluZ1JhbmdlU2VsZWN0b3I7XG5cdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyBGb2xkaW5nQ29udHJvbGxlci5fZm9sZGluZ1JhbmdlU2VsZWN0b3IgPSB1bmRlZmluZWQ7IH0gfTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcjtcblx0cHJpdmF0ZSBfaXNFbmFibGVkOiBib29sZWFuO1xuXHRwcml2YXRlIF91c2VGb2xkaW5nUHJvdmlkZXJzOiBib29sZWFuO1xuXHRwcml2YXRlIF91bmZvbGRPbkNsaWNrQWZ0ZXJFbmRPZkxpbmU6IGJvb2xlYW47XG5cdHByaXZhdGUgX3Jlc3RvcmluZ1ZpZXdTdGF0ZTogYm9vbGVhbjtcblx0cHJpdmF0ZSBfZm9sZGluZ0ltcG9ydHNCeURlZmF1bHQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX2N1cnJlbnRNb2RlbEhhc0ZvbGRlZEltcG9ydHM6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBmb2xkaW5nRGVjb3JhdGlvblByb3ZpZGVyOiBGb2xkaW5nRGVjb3JhdGlvblByb3ZpZGVyO1xuXG5cdHByaXZhdGUgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwgfCBudWxsO1xuXHRwcml2YXRlIGhpZGRlblJhbmdlTW9kZWw6IEhpZGRlblJhbmdlTW9kZWwgfCBudWxsO1xuXG5cdHByaXZhdGUgcmFuZ2VQcm92aWRlcjogUmFuZ2VQcm92aWRlciB8IG51bGw7XG5cdHByaXZhdGUgZm9sZGluZ1JlZ2lvblByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPEZvbGRpbmdSZWdpb25zIHwgbnVsbD4gfCBudWxsO1xuXG5cdHByaXZhdGUgZm9sZGluZ01vZGVsUHJvbWlzZTogUHJvbWlzZTxGb2xkaW5nTW9kZWwgfCBudWxsPiB8IG51bGw7XG5cdHByaXZhdGUgdXBkYXRlU2NoZWR1bGVyOiBEZWxheWVyPEZvbGRpbmdNb2RlbCB8IG51bGw+IHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSB1cGRhdGVEZWJvdW5jZUluZm86IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbjtcblxuXHRwcml2YXRlIGZvbGRpbmdFbmFibGVkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBjdXJzb3JDaGFuZ2VkU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyIHwgbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGxvY2FsVG9EaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBtb3VzZURvd25JbmZvOiB7IGxpbmVOdW1iZXI6IG51bWJlcjsgaWNvbkNsaWNrZWQ6IGJvb2xlYW4gfSB8IG51bGw7XG5cblx0cHVibGljIHJlYWRvbmx5IF9mb2xkaW5nTGltaXRSZXBvcnRlcjogUmFuZ2VzTGltaXRSZXBvcnRlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSBsYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lZGl0b3IgPSBlZGl0b3I7XG5cblx0XHR0aGlzLl9mb2xkaW5nTGltaXRSZXBvcnRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSYW5nZXNMaW1pdFJlcG9ydGVyKGVkaXRvcikpO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbnMoKTtcblx0XHR0aGlzLl9pc0VuYWJsZWQgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9sZGluZyk7XG5cdFx0dGhpcy5fdXNlRm9sZGluZ1Byb3ZpZGVycyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb2xkaW5nU3RyYXRlZ3kpICE9PSAnaW5kZW50YXRpb24nO1xuXHRcdHRoaXMuX3VuZm9sZE9uQ2xpY2tBZnRlckVuZE9mTGluZSA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi51bmZvbGRPbkNsaWNrQWZ0ZXJFbmRPZkxpbmUpO1xuXHRcdHRoaXMuX3Jlc3RvcmluZ1ZpZXdTdGF0ZSA9IGZhbHNlO1xuXHRcdHRoaXMuX2N1cnJlbnRNb2RlbEhhc0ZvbGRlZEltcG9ydHMgPSBmYWxzZTtcblx0XHR0aGlzLl9mb2xkaW5nSW1wb3J0c0J5RGVmYXVsdCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb2xkaW5nSW1wb3J0c0J5RGVmYXVsdCk7XG5cdFx0dGhpcy51cGRhdGVEZWJvdW5jZUluZm8gPSBsYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UuZm9yKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmZvbGRpbmdSYW5nZVByb3ZpZGVyLCAnRm9sZGluZycsIHsgbWluOiAyMDAgfSk7XG5cblx0XHR0aGlzLmZvbGRpbmdNb2RlbCA9IG51bGw7XG5cdFx0dGhpcy5oaWRkZW5SYW5nZU1vZGVsID0gbnVsbDtcblx0XHR0aGlzLnJhbmdlUHJvdmlkZXIgPSBudWxsO1xuXHRcdHRoaXMuZm9sZGluZ1JlZ2lvblByb21pc2UgPSBudWxsO1xuXHRcdHRoaXMuZm9sZGluZ01vZGVsUHJvbWlzZSA9IG51bGw7XG5cdFx0dGhpcy51cGRhdGVTY2hlZHVsZXIgPSBudWxsO1xuXHRcdHRoaXMuY3Vyc29yQ2hhbmdlZFNjaGVkdWxlciA9IG51bGw7XG5cdFx0dGhpcy5tb3VzZURvd25JbmZvID0gbnVsbDtcblxuXHRcdHRoaXMuZm9sZGluZ0RlY29yYXRpb25Qcm92aWRlciA9IG5ldyBGb2xkaW5nRGVjb3JhdGlvblByb3ZpZGVyKGVkaXRvcik7XG5cdFx0dGhpcy5mb2xkaW5nRGVjb3JhdGlvblByb3ZpZGVyLnNob3dGb2xkaW5nQ29udHJvbHMgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc2hvd0ZvbGRpbmdDb250cm9scyk7XG5cdFx0dGhpcy5mb2xkaW5nRGVjb3JhdGlvblByb3ZpZGVyLnNob3dGb2xkaW5nSGlnaGxpZ2h0cyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb2xkaW5nSGlnaGxpZ2h0KTtcblx0XHR0aGlzLmZvbGRpbmdFbmFibGVkID0gQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZm9sZGluZ0VuYWJsZWQuc2V0KHRoaXMuX2lzRW5hYmxlZCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHRoaXMub25Nb2RlbENoYW5nZWQoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlOiBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb2xkaW5nKSkge1xuXHRcdFx0XHR0aGlzLl9pc0VuYWJsZWQgPSB0aGlzLmVkaXRvci5nZXRPcHRpb25zKCkuZ2V0KEVkaXRvck9wdGlvbi5mb2xkaW5nKTtcblx0XHRcdFx0dGhpcy5mb2xkaW5nRW5hYmxlZC5zZXQodGhpcy5faXNFbmFibGVkKTtcblx0XHRcdFx0dGhpcy5vbk1vZGVsQ2hhbmdlZCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9sZGluZ01heGltdW1SZWdpb25zKSkge1xuXHRcdFx0XHR0aGlzLm9uTW9kZWxDaGFuZ2VkKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5zaG93Rm9sZGluZ0NvbnRyb2xzKSB8fCBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbGRpbmdIaWdobGlnaHQpKSB7XG5cdFx0XHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLmVkaXRvci5nZXRPcHRpb25zKCk7XG5cdFx0XHRcdHRoaXMuZm9sZGluZ0RlY29yYXRpb25Qcm92aWRlci5zaG93Rm9sZGluZ0NvbnRyb2xzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnNob3dGb2xkaW5nQ29udHJvbHMpO1xuXHRcdFx0XHR0aGlzLmZvbGRpbmdEZWNvcmF0aW9uUHJvdmlkZXIuc2hvd0ZvbGRpbmdIaWdobGlnaHRzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbGRpbmdIaWdobGlnaHQpO1xuXHRcdFx0XHR0aGlzLnRyaWdnZXJGb2xkaW5nTW9kZWxDaGFuZ2VkKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb2xkaW5nU3RyYXRlZ3kpKSB7XG5cdFx0XHRcdHRoaXMuX3VzZUZvbGRpbmdQcm92aWRlcnMgPSB0aGlzLmVkaXRvci5nZXRPcHRpb25zKCkuZ2V0KEVkaXRvck9wdGlvbi5mb2xkaW5nU3RyYXRlZ3kpICE9PSAnaW5kZW50YXRpb24nO1xuXHRcdFx0XHR0aGlzLm9uRm9sZGluZ1N0cmF0ZWd5Q2hhbmdlZCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24udW5mb2xkT25DbGlja0FmdGVyRW5kT2ZMaW5lKSkge1xuXHRcdFx0XHR0aGlzLl91bmZvbGRPbkNsaWNrQWZ0ZXJFbmRPZkxpbmUgPSB0aGlzLmVkaXRvci5nZXRPcHRpb25zKCkuZ2V0KEVkaXRvck9wdGlvbi51bmZvbGRPbkNsaWNrQWZ0ZXJFbmRPZkxpbmUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9sZGluZ0ltcG9ydHNCeURlZmF1bHQpKSB7XG5cdFx0XHRcdHRoaXMuX2ZvbGRpbmdJbXBvcnRzQnlEZWZhdWx0ID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9ucygpLmdldChFZGl0b3JPcHRpb24uZm9sZGluZ0ltcG9ydHNCeURlZmF1bHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLm9uTW9kZWxDaGFuZ2VkKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGxpbWl0UmVwb3J0ZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZvbGRpbmdMaW1pdFJlcG9ydGVyO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0b3JlIHZpZXcgc3RhdGUuXG5cdCAqL1xuXHRwdWJsaWMgc2F2ZVZpZXdTdGF0ZSgpOiBGb2xkaW5nU3RhdGVNZW1lbnRvIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCB8fCAhdGhpcy5faXNFbmFibGVkIHx8IG1vZGVsLmlzVG9vTGFyZ2VGb3JUb2tlbml6YXRpb24oKSkge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0XHRpZiAodGhpcy5mb2xkaW5nTW9kZWwpIHsgLy8gZGlzcG9zZWQgP1xuXHRcdFx0Y29uc3QgY29sbGFwc2VkUmVnaW9ucyA9IHRoaXMuZm9sZGluZ01vZGVsLmdldE1lbWVudG8oKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5yYW5nZVByb3ZpZGVyID8gdGhpcy5yYW5nZVByb3ZpZGVyLmlkIDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHsgY29sbGFwc2VkUmVnaW9ucywgbGluZUNvdW50OiBtb2RlbC5nZXRMaW5lQ291bnQoKSwgcHJvdmlkZXIsIGZvbGRlZEltcG9ydHM6IHRoaXMuX2N1cnJlbnRNb2RlbEhhc0ZvbGRlZEltcG9ydHMgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXN0b3JlIHZpZXcgc3RhdGUuXG5cdCAqL1xuXHRwdWJsaWMgcmVzdG9yZVZpZXdTdGF0ZShzdGF0ZTogRm9sZGluZ1N0YXRlTWVtZW50byk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsIHx8ICF0aGlzLl9pc0VuYWJsZWQgfHwgbW9kZWwuaXNUb29MYXJnZUZvclRva2VuaXphdGlvbigpIHx8ICF0aGlzLmhpZGRlblJhbmdlTW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnJlbnRNb2RlbEhhc0ZvbGRlZEltcG9ydHMgPSAhIXN0YXRlLmZvbGRlZEltcG9ydHM7XG5cdFx0aWYgKHN0YXRlLmNvbGxhcHNlZFJlZ2lvbnMgJiYgc3RhdGUuY29sbGFwc2VkUmVnaW9ucy5sZW5ndGggPiAwICYmIHRoaXMuZm9sZGluZ01vZGVsKSB7XG5cdFx0XHR0aGlzLl9yZXN0b3JpbmdWaWV3U3RhdGUgPSB0cnVlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5mb2xkaW5nTW9kZWwuYXBwbHlNZW1lbnRvKHN0YXRlLmNvbGxhcHNlZFJlZ2lvbnMpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGhpcy5fcmVzdG9yaW5nVmlld1N0YXRlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbk1vZGVsQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmNsZWFyKCk7XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCF0aGlzLl9pc0VuYWJsZWQgfHwgIW1vZGVsIHx8IG1vZGVsLmlzVG9vTGFyZ2VGb3JUb2tlbml6YXRpb24oKSkge1xuXHRcdFx0Ly8gaHVnZSBmaWxlcyBnZXQgbm8gdmlldyBtb2RlbCwgc28gdGhleSBjYW5ub3Qgc3VwcG9ydCBoaWRkZW4gYXJlYXNcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jdXJyZW50TW9kZWxIYXNGb2xkZWRJbXBvcnRzID0gZmFsc2U7XG5cdFx0dGhpcy5mb2xkaW5nTW9kZWwgPSBuZXcgRm9sZGluZ01vZGVsKG1vZGVsLCB0aGlzLmZvbGRpbmdEZWNvcmF0aW9uUHJvdmlkZXIpO1xuXHRcdHRoaXMubG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuZm9sZGluZ01vZGVsKTtcblxuXHRcdHRoaXMuaGlkZGVuUmFuZ2VNb2RlbCA9IG5ldyBIaWRkZW5SYW5nZU1vZGVsKHRoaXMuZm9sZGluZ01vZGVsKTtcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLmhpZGRlblJhbmdlTW9kZWwpO1xuXHRcdHRoaXMubG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuaGlkZGVuUmFuZ2VNb2RlbC5vbkRpZENoYW5nZShociA9PiB0aGlzLm9uSGlkZGVuUmFuZ2VzQ2hhbmdlcyhocikpKTtcblxuXHRcdHRoaXMudXBkYXRlU2NoZWR1bGVyID0gbmV3IERlbGF5ZXI8Rm9sZGluZ01vZGVsPih0aGlzLnVwZGF0ZURlYm91bmNlSW5mby5nZXQobW9kZWwpKTtcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLnVwZGF0ZVNjaGVkdWxlcik7XG5cblx0XHR0aGlzLmN1cnNvckNoYW5nZWRTY2hlZHVsZXIgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLnJldmVhbEN1cnNvcigpLCAyMDApO1xuXHRcdHRoaXMubG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuY3Vyc29yQ2hhbmdlZFNjaGVkdWxlcik7XG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5hZGQodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5mb2xkaW5nUmFuZ2VQcm92aWRlci5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLm9uRm9sZGluZ1N0cmF0ZWd5Q2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5hZGQodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlQ29uZmlndXJhdGlvbigoKSA9PiB0aGlzLm9uRm9sZGluZ1N0cmF0ZWd5Q2hhbmdlZCgpKSk7IC8vIGNvdmVycyBtb2RlbCBsYW5ndWFnZSBjaGFuZ2VzIGFzIHdlbGxcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudChlID0+IHRoaXMub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoZSkpKTtcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLmVkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKCgpID0+IHRoaXMub25DdXJzb3JQb3NpdGlvbkNoYW5nZWQoKSkpO1xuXHRcdHRoaXMubG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuZWRpdG9yLm9uTW91c2VEb3duKGUgPT4gdGhpcy5vbkVkaXRvck1vdXNlRG93bihlKSkpO1xuXHRcdHRoaXMubG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuZWRpdG9yLm9uTW91c2VVcChlID0+IHRoaXMub25FZGl0b3JNb3VzZVVwKGUpKSk7XG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5mb2xkaW5nUmVnaW9uUHJvbWlzZSkge1xuXHRcdFx0XHRcdHRoaXMuZm9sZGluZ1JlZ2lvblByb21pc2UuY2FuY2VsKCk7XG5cdFx0XHRcdFx0dGhpcy5mb2xkaW5nUmVnaW9uUHJvbWlzZSA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy51cGRhdGVTY2hlZHVsZXI/LmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVNjaGVkdWxlciA9IG51bGw7XG5cdFx0XHRcdHRoaXMuZm9sZGluZ01vZGVsID0gbnVsbDtcblx0XHRcdFx0dGhpcy5mb2xkaW5nTW9kZWxQcm9taXNlID0gbnVsbDtcblx0XHRcdFx0dGhpcy5oaWRkZW5SYW5nZU1vZGVsID0gbnVsbDtcblx0XHRcdFx0dGhpcy5jdXJzb3JDaGFuZ2VkU2NoZWR1bGVyID0gbnVsbDtcblx0XHRcdFx0dGhpcy5yYW5nZVByb3ZpZGVyPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMucmFuZ2VQcm92aWRlciA9IG51bGw7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy50cmlnZ2VyRm9sZGluZ01vZGVsQ2hhbmdlZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkZvbGRpbmdTdHJhdGVneUNoYW5nZWQoKSB7XG5cdFx0dGhpcy5yYW5nZVByb3ZpZGVyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5yYW5nZVByb3ZpZGVyID0gbnVsbDtcblx0XHR0aGlzLnRyaWdnZXJGb2xkaW5nTW9kZWxDaGFuZ2VkKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFJhbmdlUHJvdmlkZXIoZWRpdG9yTW9kZWw6IElUZXh0TW9kZWwpOiBSYW5nZVByb3ZpZGVyIHtcblx0XHRpZiAodGhpcy5yYW5nZVByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yYW5nZVByb3ZpZGVyO1xuXHRcdH1cblx0XHRjb25zdCBpbmRlbnRSYW5nZVByb3ZpZGVyID0gbmV3IEluZGVudFJhbmdlUHJvdmlkZXIoZWRpdG9yTW9kZWwsIHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fZm9sZGluZ0xpbWl0UmVwb3J0ZXIpO1xuXHRcdHRoaXMucmFuZ2VQcm92aWRlciA9IGluZGVudFJhbmdlUHJvdmlkZXI7IC8vIGZhbGxiYWNrXG5cdFx0aWYgKHRoaXMuX3VzZUZvbGRpbmdQcm92aWRlcnMgJiYgdGhpcy5mb2xkaW5nTW9kZWwpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkUHJvdmlkZXJzID0gRm9sZGluZ0NvbnRyb2xsZXIuZ2V0Rm9sZGluZ1JhbmdlUHJvdmlkZXJzKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIGVkaXRvck1vZGVsKTtcblx0XHRcdGlmIChzZWxlY3RlZFByb3ZpZGVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMucmFuZ2VQcm92aWRlciA9IG5ldyBTeW50YXhSYW5nZVByb3ZpZGVyKGVkaXRvck1vZGVsLCBzZWxlY3RlZFByb3ZpZGVycywgKCkgPT4gdGhpcy50cmlnZ2VyRm9sZGluZ01vZGVsQ2hhbmdlZCgpLCB0aGlzLl9mb2xkaW5nTGltaXRSZXBvcnRlciwgaW5kZW50UmFuZ2VQcm92aWRlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnJhbmdlUHJvdmlkZXI7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Rm9sZGluZ01vZGVsKCk6IFByb21pc2U8Rm9sZGluZ01vZGVsIHwgbnVsbD4gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5mb2xkaW5nTW9kZWxQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZU1vZGVsQ29udGVudChlOiBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50KSB7XG5cdFx0dGhpcy5oaWRkZW5SYW5nZU1vZGVsPy5ub3RpZnlDaGFuZ2VNb2RlbENvbnRlbnQoZSk7XG5cdFx0dGhpcy50cmlnZ2VyRm9sZGluZ01vZGVsQ2hhbmdlZCgpO1xuXHR9XG5cblxuXHRwdWJsaWMgdHJpZ2dlckZvbGRpbmdNb2RlbENoYW5nZWQoKSB7XG5cdFx0aWYgKHRoaXMudXBkYXRlU2NoZWR1bGVyKSB7XG5cdFx0XHRpZiAodGhpcy5mb2xkaW5nUmVnaW9uUHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLmZvbGRpbmdSZWdpb25Qcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLmZvbGRpbmdSZWdpb25Qcm9taXNlID0gbnVsbDtcblx0XHRcdH1cblx0XHRcdHRoaXMuZm9sZGluZ01vZGVsUHJvbWlzZSA9IHRoaXMudXBkYXRlU2NoZWR1bGVyLnRyaWdnZXIoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSB0aGlzLmZvbGRpbmdNb2RlbDtcblx0XHRcdFx0aWYgKCFmb2xkaW5nTW9kZWwpIHsgLy8gbnVsbCBpZiBlZGl0b3IgaGFzIGJlZW4gZGlzcG9zZWQsIG9yIGZvbGRpbmcgdHVybmVkIG9mZlxuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHN3ID0gbmV3IFN0b3BXYXRjaCgpO1xuXHRcdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuZ2V0UmFuZ2VQcm92aWRlcihmb2xkaW5nTW9kZWwudGV4dE1vZGVsKTtcblx0XHRcdFx0Y29uc3QgZm9sZGluZ1JlZ2lvblByb21pc2UgPSB0aGlzLmZvbGRpbmdSZWdpb25Qcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4gcHJvdmlkZXIuY29tcHV0ZSh0b2tlbikpO1xuXHRcdFx0XHRyZXR1cm4gZm9sZGluZ1JlZ2lvblByb21pc2UudGhlbihmb2xkaW5nUmFuZ2VzID0+IHtcblx0XHRcdFx0XHRpZiAoZm9sZGluZ1JhbmdlcyAmJiBmb2xkaW5nUmVnaW9uUHJvbWlzZSA9PT0gdGhpcy5mb2xkaW5nUmVnaW9uUHJvbWlzZSkgeyAvLyBuZXcgcmVxdWVzdCBvciBjYW5jZWxsZWQgaW4gdGhlIG1lYW50aW1lP1xuXHRcdFx0XHRcdFx0bGV0IHNjcm9sbFN0YXRlOiBTdGFibGVFZGl0b3JTY3JvbGxTdGF0ZSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2ZvbGRpbmdJbXBvcnRzQnlEZWZhdWx0ICYmICF0aGlzLl9jdXJyZW50TW9kZWxIYXNGb2xkZWRJbXBvcnRzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGhhc0NoYW5nZXMgPSBmb2xkaW5nUmFuZ2VzLnNldENvbGxhcHNlZEFsbE9mVHlwZShGb2xkaW5nUmFuZ2VLaW5kLkltcG9ydHMudmFsdWUsIHRydWUpO1xuXHRcdFx0XHRcdFx0XHRpZiAoaGFzQ2hhbmdlcykge1xuXHRcdFx0XHRcdFx0XHRcdHNjcm9sbFN0YXRlID0gU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUuY2FwdHVyZSh0aGlzLmVkaXRvcik7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fY3VycmVudE1vZGVsSGFzRm9sZGVkSW1wb3J0cyA9IGhhc0NoYW5nZXM7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gc29tZSBjdXJzb3JzIG1pZ2h0IGhhdmUgbW92ZWQgaW50byBoaWRkZW4gcmVnaW9ucywgbWFrZSBzdXJlIHRoZXkgYXJlIGluIGV4cGFuZGVkIHJlZ2lvbnNcblx0XHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0XHRcdFx0XHRmb2xkaW5nTW9kZWwudXBkYXRlKGZvbGRpbmdSYW5nZXMsIHRvU2VsZWN0ZWRMaW5lcyhzZWxlY3Rpb25zKSk7XG5cblx0XHRcdFx0XHRcdHNjcm9sbFN0YXRlPy5yZXN0b3JlKHRoaXMuZWRpdG9yKTtcblxuXHRcdFx0XHRcdFx0Ly8gdXBkYXRlIGRlYm91bmNlIGluZm9cblx0XHRcdFx0XHRcdGNvbnN0IG5ld1ZhbHVlID0gdGhpcy51cGRhdGVEZWJvdW5jZUluZm8udXBkYXRlKGZvbGRpbmdNb2RlbC50ZXh0TW9kZWwsIHN3LmVsYXBzZWQoKSk7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy51cGRhdGVTY2hlZHVsZXIpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy51cGRhdGVTY2hlZHVsZXIuZGVmYXVsdERlbGF5ID0gbmV3VmFsdWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBmb2xkaW5nTW9kZWw7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSkudGhlbih1bmRlZmluZWQsIChlcnIpID0+IHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uSGlkZGVuUmFuZ2VzQ2hhbmdlcyhoaWRkZW5SYW5nZXM6IElSYW5nZVtdKSB7XG5cdFx0aWYgKHRoaXMuaGlkZGVuUmFuZ2VNb2RlbCAmJiBoaWRkZW5SYW5nZXMubGVuZ3RoICYmICF0aGlzLl9yZXN0b3JpbmdWaWV3U3RhdGUpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0XHRpZiAoc2VsZWN0aW9ucykge1xuXHRcdFx0XHRpZiAodGhpcy5oaWRkZW5SYW5nZU1vZGVsLmFkanVzdFNlbGVjdGlvbnMoc2VsZWN0aW9ucykpIHtcblx0XHRcdFx0XHR0aGlzLmVkaXRvci5zZXRTZWxlY3Rpb25zKHNlbGVjdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuZWRpdG9yLnNldEhpZGRlbkFyZWFzKGhpZGRlblJhbmdlcywgdGhpcyk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ3Vyc29yUG9zaXRpb25DaGFuZ2VkKCkge1xuXHRcdGlmICh0aGlzLmhpZGRlblJhbmdlTW9kZWwgJiYgdGhpcy5oaWRkZW5SYW5nZU1vZGVsLmhhc1JhbmdlcygpKSB7XG5cdFx0XHR0aGlzLmN1cnNvckNoYW5nZWRTY2hlZHVsZXIhLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXZlYWxDdXJzb3IoKSB7XG5cdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gdGhpcy5nZXRGb2xkaW5nTW9kZWwoKTtcblx0XHRpZiAoIWZvbGRpbmdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb2xkaW5nTW9kZWwudGhlbihmb2xkaW5nTW9kZWwgPT4geyAvLyBudWxsIGlzIHJldHVybmVkIGlmIGZvbGRpbmcgZ290IGRpc2FibGVkIGluIHRoZSBtZWFudGltZVxuXHRcdFx0aWYgKGZvbGRpbmdNb2RlbCkge1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5lZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0XHRpZiAoc2VsZWN0aW9ucyAmJiBzZWxlY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCB0b1RvZ2dsZTogRm9sZGluZ1JlZ2lvbltdID0gW107XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHNlbGVjdGlvbi5zZWxlY3Rpb25TdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5oaWRkZW5SYW5nZU1vZGVsICYmIHRoaXMuaGlkZGVuUmFuZ2VNb2RlbC5pc0hpZGRlbihsaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdFx0XHR0b1RvZ2dsZS5wdXNoKC4uLmZvbGRpbmdNb2RlbC5nZXRBbGxSZWdpb25zQXRMaW5lKGxpbmVOdW1iZXIsIHIgPT4gci5pc0NvbGxhcHNlZCAmJiBsaW5lTnVtYmVyID4gci5zdGFydExpbmVOdW1iZXIpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRvVG9nZ2xlLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0Zm9sZGluZ01vZGVsLnRvZ2dsZUNvbGxhcHNlU3RhdGUodG9Ub2dnbGUpO1xuXHRcdFx0XHRcdFx0dGhpcy5yZXZlYWwoc2VsZWN0aW9uc1swXS5nZXRQb3NpdGlvbigpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KS50aGVuKHVuZGVmaW5lZCwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXG5cdH1cblxuXHRwcml2YXRlIG9uRWRpdG9yTW91c2VEb3duKGU6IElFZGl0b3JNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5tb3VzZURvd25JbmZvID0gbnVsbDtcblxuXG5cdFx0aWYgKCF0aGlzLmhpZGRlblJhbmdlTW9kZWwgfHwgIWUudGFyZ2V0IHx8ICFlLnRhcmdldC5yYW5nZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWUuZXZlbnQubGVmdEJ1dHRvbiAmJiAhZS5ldmVudC5taWRkbGVCdXR0b24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmFuZ2UgPSBlLnRhcmdldC5yYW5nZTtcblx0XHRsZXQgaWNvbkNsaWNrZWQgPSBmYWxzZTtcblx0XHRzd2l0Y2ggKGUudGFyZ2V0LnR5cGUpIHtcblx0XHRcdGNhc2UgTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9MSU5FX0RFQ09SQVRJT05TOiB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSBlLnRhcmdldC5kZXRhaWw7XG5cdFx0XHRcdGNvbnN0IG9mZnNldExlZnRJbkd1dHRlciA9IGUudGFyZ2V0LmVsZW1lbnQhLm9mZnNldExlZnQ7XG5cdFx0XHRcdGNvbnN0IGd1dHRlck9mZnNldFggPSBkYXRhLm9mZnNldFggLSBvZmZzZXRMZWZ0SW5HdXR0ZXI7XG5cblx0XHRcdFx0Ly8gY29uc3QgZ3V0dGVyT2Zmc2V0WCA9IGRhdGEub2Zmc2V0WCAtIGRhdGEuZ2x5cGhNYXJnaW5XaWR0aCAtIGRhdGEubGluZU51bWJlcnNXaWR0aCAtIGRhdGEuZ2x5cGhNYXJnaW5MZWZ0O1xuXG5cdFx0XHRcdC8vIFRPRE9Aam9hbyBUT0RPQGFsZXggVE9ET0BtYXJ0aW4gdGhpcyBpcyBzdWNoIHRoYXQgd2UgZG9uJ3QgY29sbGlkZSB3aXRoIGRpcnR5IGRpZmZcblx0XHRcdFx0aWYgKGd1dHRlck9mZnNldFggPCA0KSB7IC8vIHRoZSB3aGl0ZXNwYWNlIGJldHdlZW4gdGhlIGJvcmRlciBhbmQgdGhlIHJlYWwgZm9sZGluZyBpY29uIGJvcmRlciBpcyA0cHhcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpY29uQ2xpY2tlZCA9IHRydWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9FTVBUWToge1xuXHRcdFx0XHRpZiAodGhpcy5fdW5mb2xkT25DbGlja0FmdGVyRW5kT2ZMaW5lICYmIHRoaXMuaGlkZGVuUmFuZ2VNb2RlbC5oYXNSYW5nZXMoKSkge1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSBlLnRhcmdldC5kZXRhaWw7XG5cdFx0XHRcdFx0aWYgKCFkYXRhLmlzQWZ0ZXJMaW5lcykge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNhc2UgTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVDoge1xuXHRcdFx0XHRpZiAodGhpcy5oaWRkZW5SYW5nZU1vZGVsLmhhc1JhbmdlcygpKSB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0XHRcdGlmIChtb2RlbCAmJiByYW5nZS5zdGFydENvbHVtbiA9PT0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihyYW5nZS5zdGFydExpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubW91c2VEb3duSW5mbyA9IHsgbGluZU51bWJlcjogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBpY29uQ2xpY2tlZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVkaXRvck1vdXNlVXAoZTogSUVkaXRvck1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSB0aGlzLmZvbGRpbmdNb2RlbDtcblx0XHRpZiAoIWZvbGRpbmdNb2RlbCB8fCAhdGhpcy5tb3VzZURvd25JbmZvIHx8ICFlLnRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsaW5lTnVtYmVyID0gdGhpcy5tb3VzZURvd25JbmZvLmxpbmVOdW1iZXI7XG5cdFx0Y29uc3QgaWNvbkNsaWNrZWQgPSB0aGlzLm1vdXNlRG93bkluZm8uaWNvbkNsaWNrZWQ7XG5cblx0XHRjb25zdCByYW5nZSA9IGUudGFyZ2V0LnJhbmdlO1xuXHRcdGlmICghcmFuZ2UgfHwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGljb25DbGlja2VkKSB7XG5cdFx0XHRpZiAoZS50YXJnZXQudHlwZSAhPT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9MSU5FX0RFQ09SQVRJT05TKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKCFtb2RlbCB8fCByYW5nZS5zdGFydENvbHVtbiAhPT0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVnaW9uID0gZm9sZGluZ01vZGVsLmdldFJlZ2lvbkF0TGluZShsaW5lTnVtYmVyKTtcblx0XHRpZiAocmVnaW9uICYmIHJlZ2lvbi5zdGFydExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpIHtcblx0XHRcdGNvbnN0IGlzQ29sbGFwc2VkID0gcmVnaW9uLmlzQ29sbGFwc2VkO1xuXHRcdFx0aWYgKGljb25DbGlja2VkIHx8IGlzQ29sbGFwc2VkKSB7XG5cdFx0XHRcdGNvbnN0IHN1cnJvdW5kaW5nID0gZS5ldmVudC5hbHRLZXk7XG5cdFx0XHRcdGxldCB0b1RvZ2dsZSA9IFtdO1xuXHRcdFx0XHRpZiAoc3Vycm91bmRpbmcpIHtcblx0XHRcdFx0XHRjb25zdCBmaWx0ZXIgPSAob3RoZXJSZWdpb246IEZvbGRpbmdSZWdpb24pID0+ICFvdGhlclJlZ2lvbi5jb250YWluZWRCeShyZWdpb24pICYmICFyZWdpb24uY29udGFpbmVkQnkob3RoZXJSZWdpb24pO1xuXHRcdFx0XHRcdGNvbnN0IHRvTWF5YmVUb2dnbGUgPSBmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uc0luc2lkZShudWxsLCBmaWx0ZXIpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgciBvZiB0b01heWJlVG9nZ2xlKSB7XG5cdFx0XHRcdFx0XHRpZiAoci5pc0NvbGxhcHNlZCkge1xuXHRcdFx0XHRcdFx0XHR0b1RvZ2dsZS5wdXNoKHIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBpZiBhbnkgc3Vycm91bmRpbmcgcmVnaW9ucyBhcmUgZm9sZGVkLCB1bmZvbGQgdGhvc2UuIE90aGVyd2lzZSwgZm9sZCBhbGwgc3Vycm91bmRpbmdcblx0XHRcdFx0XHRpZiAodG9Ub2dnbGUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHR0b1RvZ2dsZSA9IHRvTWF5YmVUb2dnbGU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHJlY3Vyc2l2ZSA9IGUuZXZlbnQubWlkZGxlQnV0dG9uIHx8IGUuZXZlbnQuc2hpZnRLZXk7XG5cdFx0XHRcdFx0aWYgKHJlY3Vyc2l2ZSkge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCByIG9mIGZvbGRpbmdNb2RlbC5nZXRSZWdpb25zSW5zaWRlKHJlZ2lvbikpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHIuaXNDb2xsYXBzZWQgPT09IGlzQ29sbGFwc2VkKSB7XG5cdFx0XHRcdFx0XHRcdFx0dG9Ub2dnbGUucHVzaChyKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyB3aGVuIHJlY3Vyc2l2ZSwgZmlyc3Qgb25seSBjb2xsYXBzZSBhbGwgY2hpbGRyZW4uIElmIGFsbCBhcmUgYWxyZWFkeSBmb2xkZWQgb3IgdGhlcmUgYXJlIG5vIGNoaWxkcmVuLCBhbHNvIGZvbGQgcGFyZW50LlxuXHRcdFx0XHRcdGlmIChpc0NvbGxhcHNlZCB8fCAhcmVjdXJzaXZlIHx8IHRvVG9nZ2xlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0dG9Ub2dnbGUucHVzaChyZWdpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb2xkaW5nTW9kZWwudG9nZ2xlQ29sbGFwc2VTdGF0ZSh0b1RvZ2dsZSk7XG5cdFx0XHRcdHRoaXMucmV2ZWFsKHsgbGluZU51bWJlciwgY29sdW1uOiAxIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZXZlYWwocG9zaXRpb246IElQb3NpdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yLnJldmVhbFBvc2l0aW9uSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChwb3NpdGlvbiwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSYW5nZXNMaW1pdFJlcG9ydGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIEZvbGRpbmdMaW1pdFJlcG9ydGVyIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbGltaXQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yLmdldE9wdGlvbnMoKS5nZXQoRWRpdG9yT3B0aW9uLmZvbGRpbmdNYXhpbXVtUmVnaW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZWQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2xpbWl0ZWQ6IG51bWJlciB8IGZhbHNlID0gZmFsc2U7XG5cdHB1YmxpYyBnZXQgY29tcHV0ZWQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY29tcHV0ZWQ7XG5cdH1cblx0cHVibGljIGdldCBsaW1pdGVkKCk6IG51bWJlciB8IGZhbHNlIHtcblx0XHRyZXR1cm4gdGhpcy5fbGltaXRlZDtcblx0fVxuXHRwdWJsaWMgdXBkYXRlKGNvbXB1dGVkOiBudW1iZXIsIGxpbWl0ZWQ6IG51bWJlciB8IGZhbHNlKSB7XG5cdFx0aWYgKGNvbXB1dGVkICE9PSB0aGlzLl9jb21wdXRlZCB8fCBsaW1pdGVkICE9PSB0aGlzLl9saW1pdGVkKSB7XG5cdFx0XHR0aGlzLl9jb21wdXRlZCA9IGNvbXB1dGVkO1xuXHRcdFx0dGhpcy5fbGltaXRlZCA9IGxpbWl0ZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEZvbGRpbmdBY3Rpb248VD4gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGFic3RyYWN0IGludm9rZShmb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiBULCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk6IHZvaWQ7XG5cblx0cHVibGljIG92ZXJyaWRlIHJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IFQpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgZm9sZGluZ0NvbnRyb2xsZXIgPSBGb2xkaW5nQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWZvbGRpbmdDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGZvbGRpbmdNb2RlbFByb21pc2UgPSBmb2xkaW5nQ29udHJvbGxlci5nZXRGb2xkaW5nTW9kZWwoKTtcblx0XHRpZiAoZm9sZGluZ01vZGVsUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5yZXBvcnRUZWxlbWV0cnkoYWNjZXNzb3IsIGVkaXRvcik7XG5cdFx0XHRyZXR1cm4gZm9sZGluZ01vZGVsUHJvbWlzZS50aGVuKGZvbGRpbmdNb2RlbCA9PiB7XG5cdFx0XHRcdGlmIChmb2xkaW5nTW9kZWwpIHtcblx0XHRcdFx0XHR0aGlzLmludm9rZShmb2xkaW5nQ29udHJvbGxlciwgZm9sZGluZ01vZGVsLCBlZGl0b3IsIGFyZ3MsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0XHRpZiAoc2VsZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRmb2xkaW5nQ29udHJvbGxlci5yZXZlYWwoc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0U2VsZWN0ZWRMaW5lcyhlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0cmV0dXJuIHNlbGVjdGlvbnMgPyBzZWxlY3Rpb25zLm1hcChzID0+IHMuc3RhcnRMaW5lTnVtYmVyKSA6IFtdO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldExpbmVOdW1iZXJzKGFyZ3M6IEZvbGRpbmdBcmd1bWVudHMsIGVkaXRvcjogSUNvZGVFZGl0b3IpIHtcblx0XHRpZiAoYXJncyAmJiBhcmdzLnNlbGVjdGlvbkxpbmVzKSB7XG5cdFx0XHRyZXR1cm4gYXJncy5zZWxlY3Rpb25MaW5lcy5tYXAobCA9PiBsICsgMSk7IC8vIHRvIDAtYmFzZXMgbGluZSBudW1iZXJzXG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldFNlbGVjdGVkTGluZXMoZWRpdG9yKTtcblx0fVxuXG5cdHB1YmxpYyBydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VsZWN0ZWRMaW5lcyB7XG5cdHN0YXJ0c0luc2lkZShzdGFydExpbmU6IG51bWJlciwgZW5kTGluZTogbnVtYmVyKTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvU2VsZWN0ZWRMaW5lcyhzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSB8IG51bGwpOiBTZWxlY3RlZExpbmVzIHtcblx0aWYgKCFzZWxlY3Rpb25zIHx8IHNlbGVjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0c0luc2lkZTogKCkgPT4gZmFsc2Vcblx0XHR9O1xuXHR9XG5cdHJldHVybiB7XG5cdFx0c3RhcnRzSW5zaWRlKHN0YXJ0TGluZTogbnVtYmVyLCBlbmRMaW5lOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRcdGZvciAoY29uc3QgcyBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmUgPSBzLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0aWYgKGxpbmUgPj0gc3RhcnRMaW5lICYmIGxpbmUgPD0gZW5kTGluZSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9O1xufVxuXG5pbnRlcmZhY2UgRm9sZGluZ0FyZ3VtZW50cyB7XG5cdGxldmVscz86IG51bWJlcjtcblx0ZGlyZWN0aW9uPzogJ3VwJyB8ICdkb3duJztcblx0c2VsZWN0aW9uTGluZXM/OiBudW1iZXJbXTtcbn1cblxuZnVuY3Rpb24gZm9sZGluZ0FyZ3VtZW50c0NvbnN0cmFpbnQoYXJnczogdW5rbm93bikge1xuXHRpZiAoIXR5cGVzLmlzVW5kZWZpbmVkKGFyZ3MpKSB7XG5cdFx0aWYgKCF0eXBlcy5pc09iamVjdChhcmdzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBmb2xkaW5nQXJnczogRm9sZGluZ0FyZ3VtZW50cyA9IGFyZ3M7XG5cdFx0aWYgKCF0eXBlcy5pc1VuZGVmaW5lZChmb2xkaW5nQXJncy5sZXZlbHMpICYmICF0eXBlcy5pc051bWJlcihmb2xkaW5nQXJncy5sZXZlbHMpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghdHlwZXMuaXNVbmRlZmluZWQoZm9sZGluZ0FyZ3MuZGlyZWN0aW9uKSAmJiAhdHlwZXMuaXNTdHJpbmcoZm9sZGluZ0FyZ3MuZGlyZWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXR5cGVzLmlzVW5kZWZpbmVkKGZvbGRpbmdBcmdzLnNlbGVjdGlvbkxpbmVzKSAmJiAoIUFycmF5LmlzQXJyYXkoZm9sZGluZ0FyZ3Muc2VsZWN0aW9uTGluZXMpIHx8ICFmb2xkaW5nQXJncy5zZWxlY3Rpb25MaW5lcy5ldmVyeSh0eXBlcy5pc051bWJlcikpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5jbGFzcyBVbmZvbGRBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPEZvbGRpbmdBcmd1bWVudHM+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci51bmZvbGQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3VuZm9sZEFjdGlvbi5sYWJlbCcsIFwiVW5mb2xkXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkJyYWNrZXRSaWdodCxcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5CcmFja2V0UmlnaHRcblx0XHRcdFx0fSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1VuZm9sZCB0aGUgY29udGVudCBpbiB0aGUgZWRpdG9yJyxcblx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICdVbmZvbGQgZWRpdG9yIGFyZ3VtZW50Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBgUHJvcGVydHktdmFsdWUgcGFpcnMgdGhhdCBjYW4gYmUgcGFzc2VkIHRocm91Z2ggdGhpcyBhcmd1bWVudDpcblx0XHRcdFx0XHRcdCogJ2xldmVscyc6IE51bWJlciBvZiBsZXZlbHMgdG8gdW5mb2xkLiBJZiBub3Qgc2V0LCBkZWZhdWx0cyB0byAxLlxuXHRcdFx0XHRcdFx0KiAnZGlyZWN0aW9uJzogSWYgJ3VwJywgdW5mb2xkIGdpdmVuIG51bWJlciBvZiBsZXZlbHMgdXAgb3RoZXJ3aXNlIHVuZm9sZHMgZG93bi5cblx0XHRcdFx0XHRcdCogJ3NlbGVjdGlvbkxpbmVzJzogQXJyYXkgb2YgdGhlIHN0YXJ0IGxpbmVzICgwLWJhc2VkKSBvZiB0aGUgZWRpdG9yIHNlbGVjdGlvbnMgdG8gYXBwbHkgdGhlIHVuZm9sZCBhY3Rpb24gdG8uIElmIG5vdCBzZXQsIHRoZSBhY3RpdmUgc2VsZWN0aW9uKHMpIHdpbGwgYmUgdXNlZC5cblx0XHRcdFx0XHRcdGAsXG5cdFx0XHRcdFx0XHRjb25zdHJhaW50OiBmb2xkaW5nQXJndW1lbnRzQ29uc3RyYWludCxcblx0XHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHRcdFx0XHQnbGV2ZWxzJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdkZWZhdWx0JzogMVxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0J2RpcmVjdGlvbic6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnZW51bSc6IFsndXAnLCAnZG93biddLFxuXHRcdFx0XHRcdFx0XHRcdFx0J2RlZmF1bHQnOiAnZG93bidcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdCdzZWxlY3Rpb25MaW5lcyc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0XHRcdCdpdGVtcyc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnbnVtYmVyJ1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0aW52b2tlKF9mb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiBGb2xkaW5nQXJndW1lbnRzKTogdm9pZCB7XG5cdFx0Y29uc3QgbGV2ZWxzID0gYXJncyAmJiBhcmdzLmxldmVscyB8fCAxO1xuXHRcdGNvbnN0IGxpbmVOdW1iZXJzID0gdGhpcy5nZXRMaW5lTnVtYmVycyhhcmdzLCBlZGl0b3IpO1xuXHRcdGlmIChhcmdzICYmIGFyZ3MuZGlyZWN0aW9uID09PSAndXAnKSB7XG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzVXAoZm9sZGluZ01vZGVsLCBmYWxzZSwgbGV2ZWxzLCBsaW5lTnVtYmVycyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNldENvbGxhcHNlU3RhdGVMZXZlbHNEb3duKGZvbGRpbmdNb2RlbCwgZmFsc2UsIGxldmVscywgbGluZU51bWJlcnMpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBVbkZvbGRSZWN1cnNpdmVseUFjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248dm9pZD4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLnVuZm9sZFJlY3Vyc2l2ZWx5Jyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCd1bkZvbGRSZWN1cnNpdmVseUFjdGlvbi5sYWJlbCcsIFwiVW5mb2xkIFJlY3Vyc2l2ZWx5XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CcmFja2V0UmlnaHQpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0aW52b2tlKF9mb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBfYXJnczogdW5rbm93bik6IHZvaWQge1xuXHRcdHNldENvbGxhcHNlU3RhdGVMZXZlbHNEb3duKGZvbGRpbmdNb2RlbCwgZmFsc2UsIE51bWJlci5NQVhfVkFMVUUsIHRoaXMuZ2V0U2VsZWN0ZWRMaW5lcyhlZGl0b3IpKTtcblx0fVxufVxuXG5jbGFzcyBGb2xkQWN0aW9uIGV4dGVuZHMgRm9sZGluZ0FjdGlvbjxGb2xkaW5nQXJndW1lbnRzPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuZm9sZCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignZm9sZEFjdGlvbi5sYWJlbCcsIFwiRm9sZFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5CcmFja2V0TGVmdCxcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5CcmFja2V0TGVmdFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnRm9sZCB0aGUgY29udGVudCBpbiB0aGUgZWRpdG9yJyxcblx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICdGb2xkIGVkaXRvciBhcmd1bWVudCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogYFByb3BlcnR5LXZhbHVlIHBhaXJzIHRoYXQgY2FuIGJlIHBhc3NlZCB0aHJvdWdoIHRoaXMgYXJndW1lbnQ6XG5cdFx0XHRcdFx0XHRcdCogJ2xldmVscyc6IE51bWJlciBvZiBsZXZlbHMgdG8gZm9sZC5cblx0XHRcdFx0XHRcdFx0KiAnZGlyZWN0aW9uJzogSWYgJ3VwJywgZm9sZHMgZ2l2ZW4gbnVtYmVyIG9mIGxldmVscyB1cCBvdGhlcndpc2UgZm9sZHMgZG93bi5cblx0XHRcdFx0XHRcdFx0KiAnc2VsZWN0aW9uTGluZXMnOiBBcnJheSBvZiB0aGUgc3RhcnQgbGluZXMgKDAtYmFzZWQpIG9mIHRoZSBlZGl0b3Igc2VsZWN0aW9ucyB0byBhcHBseSB0aGUgZm9sZCBhY3Rpb24gdG8uIElmIG5vdCBzZXQsIHRoZSBhY3RpdmUgc2VsZWN0aW9uKHMpIHdpbGwgYmUgdXNlZC5cblx0XHRcdFx0XHRcdFx0SWYgbm8gbGV2ZWxzIG9yIGRpcmVjdGlvbiBpcyBzZXQsIGZvbGRzIHRoZSByZWdpb24gYXQgdGhlIGxvY2F0aW9ucyBvciBpZiBhbHJlYWR5IGNvbGxhcHNlZCwgdGhlIGZpcnN0IHVuY29sbGFwc2VkIHBhcmVudCBpbnN0ZWFkLlxuXHRcdFx0XHRcdFx0YCxcblx0XHRcdFx0XHRcdGNvbnN0cmFpbnQ6IGZvbGRpbmdBcmd1bWVudHNDb25zdHJhaW50LFxuXHRcdFx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdFx0XHRcdCdsZXZlbHMnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0J2RpcmVjdGlvbic6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHQnZW51bSc6IFsndXAnLCAnZG93biddLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0J3NlbGVjdGlvbkxpbmVzJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRcdFx0J2l0ZW1zJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRpbnZva2UoX2ZvbGRpbmdDb250cm9sbGVyOiBGb2xkaW5nQ29udHJvbGxlciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IEZvbGRpbmdBcmd1bWVudHMpOiB2b2lkIHtcblx0XHRjb25zdCBsaW5lTnVtYmVycyA9IHRoaXMuZ2V0TGluZU51bWJlcnMoYXJncywgZWRpdG9yKTtcblxuXHRcdGNvbnN0IGxldmVscyA9IGFyZ3MgJiYgYXJncy5sZXZlbHM7XG5cdFx0Y29uc3QgZGlyZWN0aW9uID0gYXJncyAmJiBhcmdzLmRpcmVjdGlvbjtcblxuXHRcdGlmICh0eXBlb2YgbGV2ZWxzICE9PSAnbnVtYmVyJyAmJiB0eXBlb2YgZGlyZWN0aW9uICE9PSAnc3RyaW5nJykge1xuXHRcdFx0Ly8gZm9sZCB0aGUgcmVnaW9uIGF0IHRoZSBsb2NhdGlvbiBvciBpZiBhbHJlYWR5IGNvbGxhcHNlZCwgdGhlIGZpcnN0IHVuY29sbGFwc2VkIHBhcmVudCBpbnN0ZWFkLlxuXHRcdFx0c2V0Q29sbGFwc2VTdGF0ZVVwKGZvbGRpbmdNb2RlbCwgdHJ1ZSwgbGluZU51bWJlcnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoZGlyZWN0aW9uID09PSAndXAnKSB7XG5cdFx0XHRcdHNldENvbGxhcHNlU3RhdGVMZXZlbHNVcChmb2xkaW5nTW9kZWwsIHRydWUsIGxldmVscyB8fCAxLCBsaW5lTnVtYmVycyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzRG93bihmb2xkaW5nTW9kZWwsIHRydWUsIGxldmVscyB8fCAxLCBsaW5lTnVtYmVycyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cblxuY2xhc3MgVG9nZ2xlRm9sZEFjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248dm9pZD4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLnRvZ2dsZUZvbGQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3RvZ2dsZUZvbGRBY3Rpb24ubGFiZWwnLCBcIlRvZ2dsZSBGb2xkXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlMKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGVkTGluZXMgPSB0aGlzLmdldFNlbGVjdGVkTGluZXMoZWRpdG9yKTtcblx0XHR0b2dnbGVDb2xsYXBzZVN0YXRlKGZvbGRpbmdNb2RlbCwgMSwgc2VsZWN0ZWRMaW5lcyk7XG5cdH1cbn1cblxuXG5jbGFzcyBGb2xkUmVjdXJzaXZlbHlBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5mb2xkUmVjdXJzaXZlbHknLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2ZvbGRSZWN1cnNpdmVseUFjdGlvbi5sYWJlbCcsIFwiRm9sZCBSZWN1cnNpdmVseVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQnJhY2tldExlZnQpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0aW52b2tlKF9mb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRMaW5lcyA9IHRoaXMuZ2V0U2VsZWN0ZWRMaW5lcyhlZGl0b3IpO1xuXHRcdHNldENvbGxhcHNlU3RhdGVMZXZlbHNEb3duKGZvbGRpbmdNb2RlbCwgdHJ1ZSwgTnVtYmVyLk1BWF9WQUxVRSwgc2VsZWN0ZWRMaW5lcyk7XG5cdH1cbn1cblxuXG5jbGFzcyBUb2dnbGVGb2xkUmVjdXJzaXZlbHlBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci50b2dnbGVGb2xkUmVjdXJzaXZlbHknLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3RvZ2dsZUZvbGRSZWN1cnNpdmVseUFjdGlvbi5sYWJlbCcsIFwiVG9nZ2xlIEZvbGQgUmVjdXJzaXZlbHlcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfRk9MRElOR19FTkFCTEVELFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUwpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0aW52b2tlKF9mb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRMaW5lcyA9IHRoaXMuZ2V0U2VsZWN0ZWRMaW5lcyhlZGl0b3IpO1xuXHRcdHRvZ2dsZUNvbGxhcHNlU3RhdGUoZm9sZGluZ01vZGVsLCBOdW1iZXIuTUFYX1ZBTFVFLCBzZWxlY3RlZExpbmVzKTtcblx0fVxufVxuXG5cbmNsYXNzIEZvbGRBbGxCbG9ja0NvbW1lbnRzQWN0aW9uIGV4dGVuZHMgRm9sZGluZ0FjdGlvbjx2b2lkPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuZm9sZEFsbEJsb2NrQ29tbWVudHMnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2ZvbGRBbGxCbG9ja0NvbW1lbnRzLmxhYmVsJywgXCJGb2xkIEFsbCBCbG9jayBDb21tZW50c1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2xhc2gpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0aW52b2tlKF9mb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiB2b2lkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk6IHZvaWQge1xuXHRcdGlmIChmb2xkaW5nTW9kZWwucmVnaW9ucy5oYXNUeXBlcygpKSB7XG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlRm9yVHlwZShmb2xkaW5nTW9kZWwsIEZvbGRpbmdSYW5nZUtpbmQuQ29tbWVudC52YWx1ZSwgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGVkaXRvck1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAoIWVkaXRvck1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbW1lbnRzID0gbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24oZWRpdG9yTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKS5jb21tZW50cztcblx0XHRcdGlmIChjb21tZW50cyAmJiBjb21tZW50cy5ibG9ja0NvbW1lbnRTdGFydFRva2VuKSB7XG5cdFx0XHRcdGNvbnN0IHJlZ0V4cCA9IG5ldyBSZWdFeHAoJ15cXFxccyonICsgZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhjb21tZW50cy5ibG9ja0NvbW1lbnRTdGFydFRva2VuKSk7XG5cdFx0XHRcdHNldENvbGxhcHNlU3RhdGVGb3JNYXRjaGluZ0xpbmVzKGZvbGRpbmdNb2RlbCwgcmVnRXhwLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgRm9sZEFsbFJlZ2lvbnNBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5mb2xkQWxsTWFya2VyUmVnaW9ucycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignZm9sZEFsbE1hcmtlclJlZ2lvbnMubGFiZWwnLCBcIkZvbGQgQWxsIFJlZ2lvbnNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfRk9MRElOR19FTkFCTEVELFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRpZ2l0OCksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRpbnZva2UoX2ZvbGRpbmdDb250cm9sbGVyOiBGb2xkaW5nQ29udHJvbGxlciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IHZvaWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cdFx0aWYgKGZvbGRpbmdNb2RlbC5yZWdpb25zLmhhc1R5cGVzKCkpIHtcblx0XHRcdHNldENvbGxhcHNlU3RhdGVGb3JUeXBlKGZvbGRpbmdNb2RlbCwgRm9sZGluZ1JhbmdlS2luZC5SZWdpb24udmFsdWUsIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBlZGl0b3JNb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKCFlZGl0b3JNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmb2xkaW5nUnVsZXMgPSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihlZGl0b3JNb2RlbC5nZXRMYW5ndWFnZUlkKCkpLmZvbGRpbmdSdWxlcztcblx0XHRcdGlmIChmb2xkaW5nUnVsZXMgJiYgZm9sZGluZ1J1bGVzLm1hcmtlcnMgJiYgZm9sZGluZ1J1bGVzLm1hcmtlcnMuc3RhcnQpIHtcblx0XHRcdFx0Y29uc3QgcmVnRXhwID0gbmV3IFJlZ0V4cChmb2xkaW5nUnVsZXMubWFya2Vycy5zdGFydCk7XG5cdFx0XHRcdHNldENvbGxhcHNlU3RhdGVGb3JNYXRjaGluZ0xpbmVzKGZvbGRpbmdNb2RlbCwgcmVnRXhwLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVW5mb2xkQWxsUmVnaW9uc0FjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248dm9pZD4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLnVuZm9sZEFsbE1hcmtlclJlZ2lvbnMnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3VuZm9sZEFsbE1hcmtlclJlZ2lvbnMubGFiZWwnLCBcIlVuZm9sZCBBbGwgUmVnaW9uc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRGlnaXQ5KSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdm9pZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpOiB2b2lkIHtcblx0XHRpZiAoZm9sZGluZ01vZGVsLnJlZ2lvbnMuaGFzVHlwZXMoKSkge1xuXHRcdFx0c2V0Q29sbGFwc2VTdGF0ZUZvclR5cGUoZm9sZGluZ01vZGVsLCBGb2xkaW5nUmFuZ2VLaW5kLlJlZ2lvbi52YWx1ZSwgZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBlZGl0b3JNb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKCFlZGl0b3JNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmb2xkaW5nUnVsZXMgPSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihlZGl0b3JNb2RlbC5nZXRMYW5ndWFnZUlkKCkpLmZvbGRpbmdSdWxlcztcblx0XHRcdGlmIChmb2xkaW5nUnVsZXMgJiYgZm9sZGluZ1J1bGVzLm1hcmtlcnMgJiYgZm9sZGluZ1J1bGVzLm1hcmtlcnMuc3RhcnQpIHtcblx0XHRcdFx0Y29uc3QgcmVnRXhwID0gbmV3IFJlZ0V4cChmb2xkaW5nUnVsZXMubWFya2Vycy5zdGFydCk7XG5cdFx0XHRcdHNldENvbGxhcHNlU3RhdGVGb3JNYXRjaGluZ0xpbmVzKGZvbGRpbmdNb2RlbCwgcmVnRXhwLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEZvbGRBbGxFeGNlcHRBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5mb2xkQWxsRXhjZXB0Jyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdmb2xkQWxsRXhjZXB0LmxhYmVsJywgXCJGb2xkIEFsbCBFeGNlcHQgU2VsZWN0ZWRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfRk9MRElOR19FTkFCTEVELFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLk1pbnVzKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGVkTGluZXMgPSB0aGlzLmdldFNlbGVjdGVkTGluZXMoZWRpdG9yKTtcblx0XHRzZXRDb2xsYXBzZVN0YXRlRm9yUmVzdChmb2xkaW5nTW9kZWwsIHRydWUsIHNlbGVjdGVkTGluZXMpO1xuXHR9XG5cbn1cblxuY2xhc3MgVW5mb2xkQWxsRXhjZXB0QWN0aW9uIGV4dGVuZHMgRm9sZGluZ0FjdGlvbjx2b2lkPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IudW5mb2xkQWxsRXhjZXB0Jyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCd1bmZvbGRBbGxFeGNlcHQubGFiZWwnLCBcIlVuZm9sZCBBbGwgRXhjZXB0IFNlbGVjdGVkXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FcXVhbCksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRpbnZva2UoX2ZvbGRpbmdDb250cm9sbGVyOiBGb2xkaW5nQ29udHJvbGxlciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBzZWxlY3RlZExpbmVzID0gdGhpcy5nZXRTZWxlY3RlZExpbmVzKGVkaXRvcik7XG5cdFx0c2V0Q29sbGFwc2VTdGF0ZUZvclJlc3QoZm9sZGluZ01vZGVsLCBmYWxzZSwgc2VsZWN0ZWRMaW5lcyk7XG5cdH1cbn1cblxuY2xhc3MgRm9sZEFsbEFjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248dm9pZD4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmZvbGRBbGwnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2ZvbGRBbGxBY3Rpb24ubGFiZWwnLCBcIkZvbGQgQWxsXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5EaWdpdDApLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0aW52b2tlKF9mb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBfZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdHNldENvbGxhcHNlU3RhdGVMZXZlbHNEb3duKGZvbGRpbmdNb2RlbCwgdHJ1ZSk7XG5cdH1cbn1cblxuY2xhc3MgVW5mb2xkQWxsQWN0aW9uIGV4dGVuZHMgRm9sZGluZ0FjdGlvbjx2b2lkPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IudW5mb2xkQWxsJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCd1bmZvbGRBbGxBY3Rpb24ubGFiZWwnLCBcIlVuZm9sZCBBbGxcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfRk9MRElOR19FTkFCTEVELFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUopLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0aW52b2tlKF9mb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBfZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdHNldENvbGxhcHNlU3RhdGVMZXZlbHNEb3duKGZvbGRpbmdNb2RlbCwgZmFsc2UpO1xuXHR9XG59XG5cbmNsYXNzIEZvbGRMZXZlbEFjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248dm9pZD4ge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJRF9QUkVGSVggPSAnZWRpdG9yLmZvbGRMZXZlbCc7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAobGV2ZWw6IG51bWJlcikgPT4gRm9sZExldmVsQWN0aW9uLklEX1BSRUZJWCArIGxldmVsO1xuXG5cdHByaXZhdGUgZ2V0Rm9sZGluZ0xldmVsKCkge1xuXHRcdHJldHVybiBwYXJzZUludCh0aGlzLmlkLnN1YnN0cihGb2xkTGV2ZWxBY3Rpb24uSURfUFJFRklYLmxlbmd0aCkpO1xuXHR9XG5cblx0aW52b2tlKF9mb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0c2V0Q29sbGFwc2VTdGF0ZUF0TGV2ZWwoZm9sZGluZ01vZGVsLCB0aGlzLmdldEZvbGRpbmdMZXZlbCgpLCB0cnVlLCB0aGlzLmdldFNlbGVjdGVkTGluZXMoZWRpdG9yKSk7XG5cdH1cbn1cblxuLyoqIEFjdGlvbiB0byBnbyB0byB0aGUgcGFyZW50IGZvbGQgb2YgY3VycmVudCBsaW5lICovXG5jbGFzcyBHb3RvUGFyZW50Rm9sZEFjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248dm9pZD4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5nb3RvUGFyZW50Rm9sZCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignZ290b1BhcmVudEZvbGQubGFiZWwnLCBcIkdvIHRvIFBhcmVudCBGb2xkXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGVkTGluZXMgPSB0aGlzLmdldFNlbGVjdGVkTGluZXMoZWRpdG9yKTtcblx0XHRpZiAoc2VsZWN0ZWRMaW5lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBnZXRQYXJlbnRGb2xkTGluZShzZWxlY3RlZExpbmVzWzBdLCBmb2xkaW5nTW9kZWwpO1xuXHRcdFx0aWYgKHN0YXJ0TGluZU51bWJlciAhPT0gbnVsbCkge1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBzdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAxXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG4vKiogQWN0aW9uIHRvIGdvIHRvIHRoZSBwcmV2aW91cyBmb2xkIG9mIGN1cnJlbnQgbGluZSAqL1xuY2xhc3MgR290b1ByZXZpb3VzRm9sZEFjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248dm9pZD4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5nb3RvUHJldmlvdXNGb2xkJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdnb3RvUHJldmlvdXNGb2xkLmxhYmVsJywgXCJHbyB0byBQcmV2aW91cyBGb2xkaW5nIFJhbmdlXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGVkTGluZXMgPSB0aGlzLmdldFNlbGVjdGVkTGluZXMoZWRpdG9yKTtcblx0XHRpZiAoc2VsZWN0ZWRMaW5lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBnZXRQcmV2aW91c0ZvbGRMaW5lKHNlbGVjdGVkTGluZXNbMF0sIGZvbGRpbmdNb2RlbCk7XG5cdFx0XHRpZiAoc3RhcnRMaW5lTnVtYmVyICE9PSBudWxsKSB7XG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24oe1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRlbmRDb2x1bW46IDFcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbi8qKiBBY3Rpb24gdG8gZ28gdG8gdGhlIG5leHQgZm9sZCBvZiBjdXJyZW50IGxpbmUgKi9cbmNsYXNzIEdvdG9OZXh0Rm9sZEFjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248dm9pZD4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5nb3RvTmV4dEZvbGQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2dvdG9OZXh0Rm9sZC5sYWJlbCcsIFwiR28gdG8gTmV4dCBGb2xkaW5nIFJhbmdlXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGVkTGluZXMgPSB0aGlzLmdldFNlbGVjdGVkTGluZXMoZWRpdG9yKTtcblx0XHRpZiAoc2VsZWN0ZWRMaW5lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBnZXROZXh0Rm9sZExpbmUoc2VsZWN0ZWRMaW5lc1swXSwgZm9sZGluZ01vZGVsKTtcblx0XHRcdGlmIChzdGFydExpbmVOdW1iZXIgIT09IG51bGwpIHtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbih7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgRm9sZFJhbmdlRnJvbVNlbGVjdGlvbkFjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248dm9pZD4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmNyZWF0ZUZvbGRpbmdSYW5nZUZyb21TZWxlY3Rpb24nLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2NyZWF0ZU1hbnVhbEZvbGRSYW5nZS5sYWJlbCcsIFwiQ3JlYXRlIEZvbGRpbmcgUmFuZ2UgZnJvbSBTZWxlY3Rpb25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfRk9MRElOR19FTkFCTEVELFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkNvbW1hKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbGxhcHNlUmFuZ2VzOiBGb2xkUmFuZ2VbXSA9IFtdO1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGlmIChzZWxlY3Rpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlbGVjdGlvbiBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRcdGxldCBlbmRMaW5lTnVtYmVyID0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdGlmIChzZWxlY3Rpb24uZW5kQ29sdW1uID09PSAxKSB7XG5cdFx0XHRcdFx0LS1lbmRMaW5lTnVtYmVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlbmRMaW5lTnVtYmVyID4gc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRcdGNvbGxhcHNlUmFuZ2VzLnB1c2goe1xuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogZW5kTGluZU51bWJlcixcblx0XHRcdFx0XHRcdHR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGlzQ29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRcdFx0c291cmNlOiBGb2xkU291cmNlLnVzZXJEZWZpbmVkXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbih7XG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IDFcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbGxhcHNlUmFuZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29sbGFwc2VSYW5nZXMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBhLnN0YXJ0TGluZU51bWJlciAtIGIuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgbmV3UmFuZ2VzID0gRm9sZGluZ1JlZ2lvbnMuc2FuaXRpemVBbmRNZXJnZShmb2xkaW5nTW9kZWwucmVnaW9ucywgY29sbGFwc2VSYW5nZXMsIGVkaXRvci5nZXRNb2RlbCgpPy5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHRcdGZvbGRpbmdNb2RlbC51cGRhdGVQb3N0KEZvbGRpbmdSZWdpb25zLmZyb21Gb2xkUmFuZ2VzKG5ld1JhbmdlcykpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBSZW1vdmVGb2xkUmFuZ2VGcm9tU2VsZWN0aW9uQWN0aW9uIGV4dGVuZHMgRm9sZGluZ0FjdGlvbjx2b2lkPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IucmVtb3ZlTWFudWFsRm9sZGluZ1JhbmdlcycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMigncmVtb3ZlTWFudWFsRm9sZGluZ1Jhbmdlcy5sYWJlbCcsIFwiUmVtb3ZlIE1hbnVhbCBGb2xkaW5nIFJhbmdlc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUGVyaW9kKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShmb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0aWYgKHNlbGVjdGlvbnMpIHtcblx0XHRcdGZvbGRpbmdNb2RlbC5yZW1vdmVNYW51YWxSYW5nZXMoc2VsZWN0aW9ucyk7XG5cdFx0XHRmb2xkaW5nQ29udHJvbGxlci50cmlnZ2VyRm9sZGluZ01vZGVsQ2hhbmdlZCgpO1xuXHRcdH1cblx0fVxufVxuXG5cbmNsYXNzIFRvZ2dsZUltcG9ydEZvbGRBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci50b2dnbGVJbXBvcnRGb2xkJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCd0b2dnbGVJbXBvcnRGb2xkLmxhYmVsJywgXCJUb2dnbGUgSW1wb3J0IEZvbGRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfRk9MRElOR19FTkFCTEVELFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgaW52b2tlKGZvbGRpbmdDb250cm9sbGVyOiBGb2xkaW5nQ29udHJvbGxlciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZWdpb25zVG9Ub2dnbGU6IEZvbGRpbmdSZWdpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHJlZ2lvbnMgPSBmb2xkaW5nTW9kZWwucmVnaW9ucztcblx0XHRmb3IgKGxldCBpID0gcmVnaW9ucy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKHJlZ2lvbnMuZ2V0VHlwZShpKSA9PT0gRm9sZGluZ1JhbmdlS2luZC5JbXBvcnRzLnZhbHVlKSB7XG5cdFx0XHRcdHJlZ2lvbnNUb1RvZ2dsZS5wdXNoKHJlZ2lvbnMudG9SZWdpb24oaSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb2xkaW5nTW9kZWwudG9nZ2xlQ29sbGFwc2VTdGF0ZShyZWdpb25zVG9Ub2dnbGUpO1xuXHRcdGZvbGRpbmdDb250cm9sbGVyLnRyaWdnZXJGb2xkaW5nTW9kZWxDaGFuZ2VkKCk7XG5cdH1cbn1cblxuXG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihGb2xkaW5nQ29udHJvbGxlci5JRCwgRm9sZGluZ0NvbnRyb2xsZXIsIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uRWFnZXIpOyAvLyBlYWdlciBiZWNhdXNlIGl0IHVzZXMgYHNhdmVWaWV3U3RhdGVgL2ByZXN0b3JlVmlld1N0YXRlYFxucmVnaXN0ZXJFZGl0b3JBY3Rpb24oVW5mb2xkQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFVuRm9sZFJlY3Vyc2l2ZWx5QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEZvbGRBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oRm9sZFJlY3Vyc2l2ZWx5QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFRvZ2dsZUZvbGRSZWN1cnNpdmVseUFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihGb2xkQWxsQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFVuZm9sZEFsbEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihGb2xkQWxsQmxvY2tDb21tZW50c0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihGb2xkQWxsUmVnaW9uc0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihVbmZvbGRBbGxSZWdpb25zQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEZvbGRBbGxFeGNlcHRBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oVW5mb2xkQWxsRXhjZXB0QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFRvZ2dsZUZvbGRBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oR290b1BhcmVudEZvbGRBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oR290b1ByZXZpb3VzRm9sZEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihHb3RvTmV4dEZvbGRBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oRm9sZFJhbmdlRnJvbVNlbGVjdGlvbkFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihSZW1vdmVGb2xkUmFuZ2VGcm9tU2VsZWN0aW9uQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFRvZ2dsZUltcG9ydEZvbGRBY3Rpb24pO1xuXG5mb3IgKGxldCBpID0gMTsgaSA8PSA3OyBpKyspIHtcblx0cmVnaXN0ZXJJbnN0YW50aWF0ZWRFZGl0b3JBY3Rpb24oXG5cdFx0bmV3IEZvbGRMZXZlbEFjdGlvbih7XG5cdFx0XHRpZDogRm9sZExldmVsQWN0aW9uLklEKGkpLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2ZvbGRMZXZlbEFjdGlvbi5sYWJlbCcsIFwiRm9sZCBMZXZlbCB7MH1cIiwgaSksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfRk9MRElOR19FTkFCTEVELFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCAoS2V5Q29kZS5EaWdpdDAgKyBpKSksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSlcblx0KTtcbn1cblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19leGVjdXRlRm9sZGluZ1JhbmdlUHJvdmlkZXInLCBhc3luYyBmdW5jdGlvbiAoYWNjZXNzb3IsIC4uLmFyZ3MpIHtcblx0Y29uc3QgW3Jlc291cmNlXSA9IGFyZ3M7XG5cdGlmICghKHJlc291cmNlIGluc3RhbmNlb2YgVVJJKSkge1xuXHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgpO1xuXHR9XG5cblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblxuXHRjb25zdCBtb2RlbCA9IGFjY2Vzc29yLmdldChJTW9kZWxTZXJ2aWNlKS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdGlmICghbW9kZWwpIHtcblx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoKTtcblx0fVxuXG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGlmICghY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci5mb2xkaW5nJywgeyByZXNvdXJjZSB9KSkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdGNvbnN0IHN0cmF0ZWd5ID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci5mb2xkaW5nU3RyYXRlZ3knLCB7IHJlc291cmNlIH0pO1xuXHRjb25zdCBmb2xkaW5nTGltaXRSZXBvcnRlciA9IHtcblx0XHRnZXQgbGltaXQoKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignZWRpdG9yLmZvbGRpbmdNYXhpbXVtUmVnaW9ucycsIHsgcmVzb3VyY2UgfSk7XG5cdFx0fSxcblx0XHR1cGRhdGU6IChjb21wdXRlZDogbnVtYmVyLCBsaW1pdGVkOiBudW1iZXIgfCBmYWxzZSkgPT4geyB9XG5cdH07XG5cblx0Y29uc3QgaW5kZW50UmFuZ2VQcm92aWRlciA9IG5ldyBJbmRlbnRSYW5nZVByb3ZpZGVyKG1vZGVsLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBmb2xkaW5nTGltaXRSZXBvcnRlcik7XG5cdGxldCByYW5nZVByb3ZpZGVyOiBSYW5nZVByb3ZpZGVyID0gaW5kZW50UmFuZ2VQcm92aWRlcjtcblx0aWYgKHN0cmF0ZWd5ICE9PSAnaW5kZW50YXRpb24nKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gRm9sZGluZ0NvbnRyb2xsZXIuZ2V0Rm9sZGluZ1JhbmdlUHJvdmlkZXJzKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBtb2RlbCk7XG5cdFx0aWYgKHByb3ZpZGVycy5sZW5ndGgpIHtcblx0XHRcdHJhbmdlUHJvdmlkZXIgPSBuZXcgU3ludGF4UmFuZ2VQcm92aWRlcihtb2RlbCwgcHJvdmlkZXJzLCAoKSA9PiB7IH0sIGZvbGRpbmdMaW1pdFJlcG9ydGVyLCBpbmRlbnRSYW5nZVByb3ZpZGVyKTtcblx0XHR9XG5cdH1cblx0Y29uc3QgcmFuZ2VzID0gYXdhaXQgcmFuZ2VQcm92aWRlci5jb21wdXRlKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRjb25zdCByZXN1bHQ6IEZvbGRpbmdSYW5nZVtdID0gW107XG5cdHRyeSB7XG5cdFx0aWYgKHJhbmdlcykge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgdHlwZSA9IHJhbmdlcy5nZXRUeXBlKGkpO1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IHN0YXJ0OiByYW5nZXMuZ2V0U3RhcnRMaW5lTnVtYmVyKGkpLCBlbmQ6IHJhbmdlcy5nZXRFbmRMaW5lTnVtYmVyKGkpLCBraW5kOiB0eXBlID8gRm9sZGluZ1JhbmdlS2luZC5mcm9tVmFsdWUodHlwZSkgOiB1bmRlZmluZWQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH0gZmluYWxseSB7XG5cdFx0cmFuZ2VQcm92aWRlci5kaXNwb3NlKCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUE0Qix5QkFBeUIsU0FBUyx3QkFBd0I7QUFDdEYsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUIseUJBQXlCO0FBQ25ELFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFDMUMsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLDhCQUE4QjtBQUN2QyxZQUFZLFdBQVc7QUFDdkIsT0FBTztBQUNQLFNBQVMsK0JBQStCO0FBQ3hDLFNBQXlDLHVCQUF1QjtBQUNo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
