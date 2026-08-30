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
import { alert } from "../../../../../base/browser/ui/aria/aria.js";
import { timeout } from "../../../../../base/common/async.js";
import { cancelOnDispose } from "../../../../../base/common/cancellation.js";
import { createHotClass } from "../../../../../base/common/hotReloadHelpers.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, derived, derivedDisposable, derivedObservableWithCache, observableFromEvent, observableSignal, observableValue, runOnChange, runOnChangeWithStore, transaction, waitForState } from "../../../../../base/common/observable.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { isUndefined } from "../../../../../base/common/types.js";
import { localize } from "../../../../../nls.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { hotClassGetOriginalInstance } from "../../../../../platform/observable/common/wrapInHotClass.js";
import { CoreEditingCommands } from "../../../../browser/coreCommands.js";
import { observableCodeEditor } from "../../../../browser/observableCodeEditor.js";
import { TriggerInlineEditCommandsRegistry } from "../../../../browser/triggerInlineEditCommandsRegistry.js";
import { getOuterEditor } from "../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EditorOption } from "../../../../common/config/editorOptions.js";
import { Position } from "../../../../common/core/position.js";
import { CursorChangeReason } from "../../../../common/cursorEvents.js";
import { ILanguageFeatureDebounceService } from "../../../../common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../../common/services/languageFeatures.js";
import { FIND_IDS } from "../../../find/browser/findModel.js";
import { NextMarkerAction, NextMarkerInFilesAction, PrevMarkerAction, PrevMarkerInFilesAction } from "../../../gotoError/browser/gotoError.js";
import { InsertLineAfterAction, InsertLineBeforeAction } from "../../../linesOperations/browser/linesOperations.js";
import { InlineSuggestionHintsContentWidget } from "../hintsWidget/inlineCompletionsHintsWidget.js";
import { TextModelChangeRecorder } from "../model/changeRecorder.js";
import { InlineCompletionsModel } from "../model/inlineCompletionsModel.js";
import { ObservableSuggestWidgetAdapter } from "../model/suggestWidgetAdapter.js";
import { ObservableContextKeyService } from "../utils.js";
import { InlineSuggestionsView } from "../view/inlineSuggestionsView.js";
import { inlineSuggestCommitId, jumpToNextInlineEditId } from "./commandIds.js";
import { setInlineCompletionsControllerGetter } from "./common.js";
import { InlineCompletionContextKeys } from "./inlineCompletionContextKeys.js";
setInlineCompletionsControllerGetter((editor) => InlineCompletionsController.get(editor));
let InlineCompletionsController = class extends Disposable {
  constructor(editor, _instantiationService, _contextKeyService, _configurationService, _commandService, _debounceService, _languageFeaturesService, _accessibilitySignalService, _keybindingService) {
    super();
    this.editor = editor;
    this._instantiationService = _instantiationService;
    this._contextKeyService = _contextKeyService;
    this._configurationService = _configurationService;
    this._commandService = _commandService;
    this._debounceService = _debounceService;
    this._languageFeaturesService = _languageFeaturesService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._keybindingService = _keybindingService;
    this._focusIsInMenu = observableValue(this, false);
    this._focusIsInEditorOrMenu = derived(this, (reader) => {
      const editorHasFocus = this._editorObs.isFocused.read(reader);
      const menuHasFocus = this._focusIsInMenu.read(reader);
      return editorHasFocus || menuHasFocus;
    });
    this._cursorIsInIndentation = derived(this, (reader) => {
      const cursorPos = this._editorObs.cursorPosition.read(reader);
      if (cursorPos === null) {
        return false;
      }
      const model = this._editorObs.model.read(reader);
      if (!model) {
        return false;
      }
      this._editorObs.versionId.read(reader);
      const indentMaxColumn = model.getLineIndentColumn(cursorPos.lineNumber);
      return cursorPos.column <= indentMaxColumn;
    });
    this.model = derivedDisposable(this, (reader) => {
      if (this._editorObs.isReadonly.read(reader)) {
        return void 0;
      }
      const textModel = this._editorObs.model.read(reader);
      if (!textModel) {
        return void 0;
      }
      const model = this._instantiationService.createInstance(
        InlineCompletionsModel,
        textModel,
        this._suggestWidgetAdapter.selectedItem,
        this._editorObs.versionId,
        this._positions,
        this._debounceValue,
        this._enabledInConfig,
        () => this._isEditorDictationInProgress(),
        this.editor
      );
      return model;
    });
    this._playAccessibilitySignal = observableSignal(this);
    this._view = derived((reader) => reader.store.add(this._instantiationService.createInstance(InlineSuggestionsView.hot.read(reader), this.editor, this.model, this._focusIsInMenu)));
    this._editorObs = observableCodeEditor(this.editor);
    this._positions = derived(this, (reader) => this._editorObs.selections.read(reader)?.map((s) => s.getEndPosition()) ?? [new Position(1, 1)]);
    this._suggestWidgetAdapter = this._register(new ObservableSuggestWidgetAdapter(
      this._editorObs,
      (item) => this.model.get()?.handleSuggestAccepted(item),
      () => this.model.get()?.selectedInlineCompletion.get()?.getSingleTextEdit()
    ));
    this._enabledInConfig = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineSuggest).enabled);
    this._register(this._contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(/* @__PURE__ */ new Set(["editorDictation.inProgress"])) && this._isEditorDictationInProgress()) {
        this.model.get()?.stop();
      }
    }));
    this._debounceValue = this._debounceService.for(
      this._languageFeaturesService.inlineCompletionsProvider,
      "InlineCompletionsDebounce",
      { min: 50, max: 50 }
    );
    this.model.recomputeInitiallyAndOnChange(this._store);
    this._hideInlineEditOnSelectionChange = this._editorObs.getOption(EditorOption.inlineSuggest).map((val) => true);
    this._view.recomputeInitiallyAndOnChange(this._store);
    InlineCompletionsController._instances.add(this);
    this._register(toDisposable(() => InlineCompletionsController._instances.delete(this)));
    this._register(autorun((reader) => {
      const model = this.model.read(reader);
      if (!model) {
        return;
      }
      const state = model.state.read(reader);
      if (!state) {
        return;
      }
      if (!this._focusIsInEditorOrMenu.read(void 0)) {
        return;
      }
      const nextEditUri = state.kind === "inlineEdit" ? state.nextEditUri : void 0;
      for (const ctrl of InlineCompletionsController._instances) {
        if (ctrl === this) {
          continue;
        } else if (nextEditUri && isEqual(nextEditUri, ctrl.editor.getModel()?.uri)) {
          ctrl.model.read(void 0)?.trigger();
        } else {
          ctrl.reject();
        }
      }
    }));
    this._register(autorun((reader) => {
      const model = this.model.read(reader);
      const uri = this.editor.getModel()?.uri;
      if (!model || !uri) {
        return;
      }
      reader.store.add(model.onDidAccept(() => {
        for (const ctrl of InlineCompletionsController._instances) {
          if (ctrl === this) {
            continue;
          }
          const state = ctrl.model.read(void 0)?.state.read(void 0);
          if (state?.kind === "inlineEdit" && isEqual(state.nextEditUri, uri)) {
            ctrl.model.read(void 0)?.stop("automatic");
          }
        }
      }));
    }));
    this._register(runOnChange(this._editorObs.onDidType, (_value, _changes) => {
      if (this._enabledInConfig.get() && !this._isEditorDictationInProgress()) {
        this.model.get()?.trigger();
      }
    }));
    this._register(runOnChange(this._editorObs.onDidPaste, (_value, _changes) => {
      if (this._enabledInConfig.get() && !this._isEditorDictationInProgress()) {
        this.model.get()?.trigger();
      }
    }));
    const triggerCommands = /* @__PURE__ */ new Set([
      CoreEditingCommands.Tab.id,
      CoreEditingCommands.DeleteLeft.id,
      CoreEditingCommands.DeleteRight.id,
      inlineSuggestCommitId,
      "acceptSelectedSuggestion",
      InsertLineAfterAction.ID,
      InsertLineBeforeAction.ID,
      FIND_IDS.NextMatchFindAction,
      NextMarkerAction.ID,
      PrevMarkerAction.ID,
      NextMarkerInFilesAction.ID,
      PrevMarkerInFilesAction.ID,
      ...TriggerInlineEditCommandsRegistry.getRegisteredCommands()
    ]);
    this._register(this._commandService.onDidExecuteCommand((e) => {
      if (triggerCommands.has(e.commandId) && editor.hasTextFocus() && this._enabledInConfig.get() && !this._isEditorDictationInProgress()) {
        let noDelay = false;
        if (e.commandId === inlineSuggestCommitId) {
          noDelay = true;
        }
        this._editorObs.forceUpdate((tx) => {
          this.model.get()?.trigger(tx, { noDelay });
        });
      }
    }));
    this._register(runOnChange(this._editorObs.selections, (_value, _, changes) => {
      if (changes.some((e) => e.reason === CursorChangeReason.Explicit || e.source === "api")) {
        if (!this._hideInlineEditOnSelectionChange.get() && this.model.get()?.state.get()?.kind === "inlineEdit") {
          return;
        }
        const m = this.model.get();
        if (!m) {
          return;
        }
        if (m.state.get()?.kind === "ghostText") {
          this.model.get()?.stop();
        }
      }
    }));
    this._register(autorun((reader) => {
      const isFocused = this._focusIsInEditorOrMenu.read(reader);
      const model = this.model.read(void 0);
      if (isFocused) {
        const state = model?.state.read(void 0);
        if (!state || state.kind !== "inlineEdit" || !state.nextEditUri) {
          transaction((tx) => {
            for (const ctrl of InlineCompletionsController._instances) {
              if (ctrl !== this) {
                ctrl.model.read(void 0)?.stop("automatic", tx);
              }
            }
          });
        }
        return;
      }
      if (this._contextKeyService.getContextKeyValue("accessibleViewIsShown") || this._configurationService.getValue("editor.inlineSuggest.keepOnBlur") || editor.getOption(EditorOption.inlineSuggest).keepOnBlur || InlineSuggestionHintsContentWidget.dropDownVisible) {
        return;
      }
      if (!model) {
        return;
      }
      if (model.state.read(void 0)?.inlineSuggestion?.isFromExplicitRequest && model.inlineEditAvailable.read(void 0)) {
        return;
      }
      transaction((tx) => {
        model.stop("automatic", tx);
      });
    }));
    this._register(autorun((reader) => {
      const state = this.model.read(reader)?.inlineCompletionState.read(reader);
      if (state?.suggestItem) {
        if (state.primaryGhostText.lineCount >= 2) {
          this._suggestWidgetAdapter.forceRenderingAbove();
        }
      } else {
        this._suggestWidgetAdapter.stopForceRenderingAbove();
      }
    }));
    this._register(toDisposable(() => {
      this._suggestWidgetAdapter.stopForceRenderingAbove();
    }));
    const currentInlineCompletionBySemanticId = derivedObservableWithCache(this, (reader, last) => {
      const model = this.model.read(reader);
      const state = model?.state.read(reader);
      if (this._suggestWidgetAdapter.selectedItem.get()) {
        return last;
      }
      return state?.inlineSuggestion?.semanticId;
    });
    this._register(runOnChangeWithStore(derived((reader) => {
      this._playAccessibilitySignal.read(reader);
      currentInlineCompletionBySemanticId.read(reader);
      return {};
    }), async (_value, _, _deltas, store) => {
      let model = this.model.get();
      let state = model?.state.get();
      if (!state || !model) {
        return;
      }
      await timeout(50, cancelOnDispose(store));
      await waitForState(this._suggestWidgetAdapter.selectedItem, isUndefined, () => false, cancelOnDispose(store));
      model = this.model.get();
      state = model?.state.get();
      if (!state || !model) {
        return;
      }
      const lineText = state.kind === "ghostText" ? model.textModel.getLineContent(state.primaryGhostText.lineNumber) : "";
      this._accessibilitySignalService.playSignal(state.kind === "ghostText" ? AccessibilitySignal.inlineSuggestion : AccessibilitySignal.nextEditSuggestion);
      if (this.editor.getOption(EditorOption.screenReaderAnnounceInlineSuggestion)) {
        if (state.kind === "ghostText") {
          this._provideScreenReaderUpdate(state.primaryGhostText.renderForScreenReader(lineText));
        } else {
          const lineNumber = state.inlineSuggestion.targetRange.startLineNumber;
          const tabShouldAccept = model.tabShouldAcceptInlineEdit.get();
          const tabShouldJump = model.tabShouldJumpToInlineEdit.get();
          let content;
          if (tabShouldAccept) {
            const kb = this._keybindingService.lookupKeybinding(inlineSuggestCommitId)?.getAriaLabel();
            content = kb ? localize("nextEditSuggestionAcceptWithKb", "Next edit suggestion available on line {0}, press {1} to accept", lineNumber, kb) : localize("nextEditSuggestionAcceptNoKb", "Next edit suggestion available on line {0}, accept it to apply", lineNumber);
          } else if (tabShouldJump) {
            const kb = this._keybindingService.lookupKeybinding(jumpToNextInlineEditId)?.getAriaLabel();
            content = kb ? localize("nextEditSuggestionJumpWithKb", "Next edit suggestion available on line {0}, press {1} to jump", lineNumber, kb) : localize("nextEditSuggestionJumpNoKb", "Next edit suggestion available on line {0}", lineNumber);
          } else {
            content = localize("nextEditSuggestionNoAction", "Next edit suggestion available on line {0}", lineNumber);
          }
          this._provideScreenReaderUpdate(content);
        }
      }
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("accessibility.verbosity.inlineCompletions")) {
        this.editor.updateOptions({ inlineCompletionsAccessibilityVerbose: this._configurationService.getValue("accessibility.verbosity.inlineCompletions") });
      }
    }));
    this.editor.updateOptions({ inlineCompletionsAccessibilityVerbose: this._configurationService.getValue("accessibility.verbosity.inlineCompletions") });
    const contextKeySvcObs = new ObservableContextKeyService(this._contextKeyService);
    this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.cursorInIndentation, this._cursorIsInIndentation));
    this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.hasSelection, (reader) => !this._editorObs.cursorSelection.read(reader)?.isEmpty()));
    this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.cursorAtInlineEdit, this.model.map((m, reader) => m?.inlineEditState?.read(reader)?.cursorAtInlineEdit.read(reader))));
    this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.tabShouldAcceptInlineEdit, this.model.map((m, r) => !!m?.tabShouldAcceptInlineEdit.read(r))));
    this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.tabShouldJumpToInlineEdit, this.model.map((m, r) => !!m?.tabShouldJumpToInlineEdit.read(r))));
    this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.inlineEditVisible, (reader) => this.model.read(reader)?.inlineEditState.read(reader) !== void 0));
    this._register(contextKeySvcObs.bind(
      InlineCompletionContextKeys.inlineSuggestionHasIndentation,
      (reader) => this.model.read(reader)?.getIndentationInfo(reader)?.startsWithIndentation
    ));
    this._register(contextKeySvcObs.bind(
      InlineCompletionContextKeys.inlineSuggestionHasIndentationLessThanTabSize,
      (reader) => this.model.read(reader)?.getIndentationInfo(reader)?.startsWithIndentationLessThanTabSize
    ));
    this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.suppressSuggestions, (reader) => {
      const model = this.model.read(reader);
      const state = model?.inlineCompletionState.read(reader);
      return state?.primaryGhostText && state?.inlineSuggestion ? state.inlineSuggestion.source.inlineSuggestions.suppressSuggestions : void 0;
    }));
    this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.inlineSuggestionAlternativeActionVisible, (reader) => {
      const model = this.model.read(reader);
      const state = model?.inlineEditState.read(reader);
      const action = state?.inlineSuggestion.action;
      return action && action.kind === "edit" && action.alternativeAction !== void 0;
    }));
    this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.inlineSuggestionVisible, (reader) => {
      const model = this.model.read(reader);
      const state = model?.inlineCompletionState.read(reader);
      return !!state?.inlineSuggestion && state?.primaryGhostText !== void 0 && !state?.primaryGhostText.isEmpty();
    }));
    const firstGhostTextPos = derived(this, (reader) => {
      const model = this.model.read(reader);
      const state = model?.inlineCompletionState.read(reader);
      const primaryGhostText = state?.primaryGhostText;
      if (!primaryGhostText || primaryGhostText.isEmpty()) {
        return void 0;
      }
      const firstPartPos = new Position(primaryGhostText.lineNumber, primaryGhostText.parts[0].column);
      return firstPartPos;
    });
    this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.cursorBeforeGhostText, (reader) => {
      const firstPartPos = firstGhostTextPos.read(reader);
      if (!firstPartPos) {
        return false;
      }
      const cursorPos = this._editorObs.cursorPosition.read(reader);
      if (!cursorPos) {
        return false;
      }
      return firstPartPos.equals(cursorPos);
    }));
    this._register(this._instantiationService.createInstance(TextModelChangeRecorder, this.editor));
  }
  /**
   * Find the controller in the focused editor or in the outer editor (if applicable)
   */
  static getInFocusedEditorOrParent(accessor) {
    const outerEditor = getOuterEditor(accessor);
    if (!outerEditor) {
      return null;
    }
    return InlineCompletionsController.get(outerEditor);
  }
  static get(editor) {
    return hotClassGetOriginalInstance(editor.getContribution(InlineCompletionsController.ID));
  }
  _isEditorDictationInProgress() {
    return this._contextKeyService.getContext(this.editor.getDomNode())?.getValue("editorDictation.inProgress") === true;
  }
  playAccessibilitySignal(tx) {
    this._playAccessibilitySignal.trigger(tx);
  }
  _provideScreenReaderUpdate(content) {
    const accessibleViewShowing = this._contextKeyService.getContextKeyValue("accessibleViewIsShown");
    const accessibleViewKeybinding = this._keybindingService.lookupKeybinding("editor.action.accessibleView");
    let hint;
    if (!accessibleViewShowing && accessibleViewKeybinding && this.editor.getOption(EditorOption.inlineCompletionsAccessibilityVerbose)) {
      hint = localize("showAccessibleViewHint", "Inspect this in the accessible view ({0})", accessibleViewKeybinding.getAriaLabel());
    }
    alert(hint ? content + ", " + hint : content);
  }
  shouldShowHoverAt(range) {
    const ghostText = this.model.get()?.primaryGhostText.get();
    if (!ghostText) {
      return false;
    }
    return ghostText.parts.some((p) => range.containsPosition(new Position(ghostText.lineNumber, p.column)));
  }
  shouldShowHoverAtViewZone(viewZoneId) {
    return this._view.get().shouldShowHoverAtViewZone(viewZoneId);
  }
  reject() {
    transaction((tx) => {
      const m = this.model.get();
      if (m) {
        m.stop("explicitCancel", tx);
        if (this._focusIsInEditorOrMenu.get()) {
          for (const ctrl of InlineCompletionsController._instances) {
            if (ctrl !== this && !ctrl._focusIsInEditorOrMenu.get()) {
              ctrl.model.get()?.stop("automatic", tx);
            }
          }
        }
      }
    });
  }
  jump() {
    const m = this.model.get();
    if (m) {
      m.jump();
    }
  }
};
InlineCompletionsController._instances = /* @__PURE__ */ new Set();
InlineCompletionsController.hot = createHotClass(InlineCompletionsController);
InlineCompletionsController.ID = "editor.contrib.inlineCompletionsController";
InlineCompletionsController = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, ILanguageFeatureDebounceService),
  __decorateParam(6, ILanguageFeaturesService),
  __decorateParam(7, IAccessibilitySignalService),
  __decorateParam(8, IKeybindingService)
], InlineCompletionsController);
export {
  InlineCompletionsController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFxjb250cm9sbGVyXFxpbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhbGVydCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGNhbmNlbE9uRGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVIb3RDbGFzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hvdFJlbG9hZEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElUcmFuc2FjdGlvbiwgYXV0b3J1biwgZGVyaXZlZCwgZGVyaXZlZERpc3Bvc2FibGUsIGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlU2lnbmFsLCBvYnNlcnZhYmxlVmFsdWUsIHJ1bk9uQ2hhbmdlLCBydW5PbkNoYW5nZVdpdGhTdG9yZSwgdHJhbnNhY3Rpb24sIHdhaXRGb3JTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBob3RDbGFzc0dldE9yaWdpbmFsSW5zdGFuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi93cmFwSW5Ib3RDbGFzcy5qcyc7XG5pbXBvcnQgeyBDb3JlRWRpdGluZ0NvbW1hbmRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9jb3JlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL29ic2VydmFibGVDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IFRyaWdnZXJJbmxpbmVFZGl0Q29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvdHJpZ2dlcklubGluZUVkaXRDb21tYW5kc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGdldE91dGVyRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9lbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDaGFuZ2VSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgRklORF9JRFMgfSBmcm9tICcuLi8uLi8uLi9maW5kL2Jyb3dzZXIvZmluZE1vZGVsLmpzJztcbmltcG9ydCB7IE5leHRNYXJrZXJBY3Rpb24sIE5leHRNYXJrZXJJbkZpbGVzQWN0aW9uLCBQcmV2TWFya2VyQWN0aW9uLCBQcmV2TWFya2VySW5GaWxlc0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2dvdG9FcnJvci9icm93c2VyL2dvdG9FcnJvci5qcyc7XG5pbXBvcnQgeyBJbnNlcnRMaW5lQWZ0ZXJBY3Rpb24sIEluc2VydExpbmVCZWZvcmVBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9saW5lc09wZXJhdGlvbnMvYnJvd3Nlci9saW5lc09wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgSW5saW5lU3VnZ2VzdGlvbkhpbnRzQ29udGVudFdpZGdldCB9IGZyb20gJy4uL2hpbnRzV2lkZ2V0L2lubGluZUNvbXBsZXRpb25zSGludHNXaWRnZXQuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsQ2hhbmdlUmVjb3JkZXIgfSBmcm9tICcuLi9tb2RlbC9jaGFuZ2VSZWNvcmRlci5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc01vZGVsIH0gZnJvbSAnLi4vbW9kZWwvaW5saW5lQ29tcGxldGlvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlU3VnZ2VzdFdpZGdldEFkYXB0ZXIgfSBmcm9tICcuLi9tb2RlbC9zdWdnZXN0V2lkZ2V0QWRhcHRlci5qcyc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi91dGlscy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVTdWdnZXN0aW9uc1ZpZXcgfSBmcm9tICcuLi92aWV3L2lubGluZVN1Z2dlc3Rpb25zVmlldy5qcyc7XG5pbXBvcnQgeyBpbmxpbmVTdWdnZXN0Q29tbWl0SWQsIGp1bXBUb05leHRJbmxpbmVFZGl0SWQgfSBmcm9tICcuL2NvbW1hbmRJZHMuanMnO1xuaW1wb3J0IHsgc2V0SW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyR2V0dGVyIH0gZnJvbSAnLi9jb21tb24uanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzIH0gZnJvbSAnLi9pbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuanMnO1xuXG5zZXRJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXJHZXR0ZXIoKGVkaXRvcikgPT4gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmdldChlZGl0b3IpKTtcblxuZXhwb3J0IGNsYXNzIElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfaW5zdGFuY2VzID0gbmV3IFNldDxJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXI+KCk7XG5cblx0cHVibGljIHN0YXRpYyBob3QgPSBjcmVhdGVIb3RDbGFzcyh0aGlzKTtcblx0cHVibGljIHN0YXRpYyBJRCA9ICdlZGl0b3IuY29udHJpYi5pbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXInO1xuXG5cdC8qKlxuXHQgKiBGaW5kIHRoZSBjb250cm9sbGVyIGluIHRoZSBmb2N1c2VkIGVkaXRvciBvciBpbiB0aGUgb3V0ZXIgZWRpdG9yIChpZiBhcHBsaWNhYmxlKVxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBnZXRJbkZvY3VzZWRFZGl0b3JPclBhcmVudChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlciB8IG51bGwge1xuXHRcdGNvbnN0IG91dGVyRWRpdG9yID0gZ2V0T3V0ZXJFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGlmICghb3V0ZXJFZGl0b3IpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmdldChvdXRlckVkaXRvcik7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGhvdENsYXNzR2V0T3JpZ2luYWxJbnN0YW5jZShlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlcj4oSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLklEKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JPYnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Bvc2l0aW9ucztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWdnZXN0V2lkZ2V0QWRhcHRlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lbmFibGVkSW5Db25maWc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGVib3VuY2VWYWx1ZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9mb2N1c0lzSW5NZW51ID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KHRoaXMsIGZhbHNlKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZm9jdXNJc0luRWRpdG9yT3JNZW51ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGVkaXRvckhhc0ZvY3VzID0gdGhpcy5fZWRpdG9yT2JzLmlzRm9jdXNlZC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgbWVudUhhc0ZvY3VzID0gdGhpcy5fZm9jdXNJc0luTWVudS5yZWFkKHJlYWRlcik7XG5cdFx0cmV0dXJuIGVkaXRvckhhc0ZvY3VzIHx8IG1lbnVIYXNGb2N1cztcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3Vyc29ySXNJbkluZGVudGF0aW9uID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGN1cnNvclBvcyA9IHRoaXMuX2VkaXRvck9icy5jdXJzb3JQb3NpdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKGN1cnNvclBvcyA9PT0gbnVsbCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvck9icy5tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFtb2RlbCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHR0aGlzLl9lZGl0b3JPYnMudmVyc2lvbklkLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBpbmRlbnRNYXhDb2x1bW4gPSBtb2RlbC5nZXRMaW5lSW5kZW50Q29sdW1uKGN1cnNvclBvcy5saW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gY3Vyc29yUG9zLmNvbHVtbiA8PSBpbmRlbnRNYXhDb2x1bW47XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBtb2RlbCA9IGRlcml2ZWREaXNwb3NhYmxlPElubGluZUNvbXBsZXRpb25zTW9kZWwgfCB1bmRlZmluZWQ+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0aWYgKHRoaXMuX2VkaXRvck9icy5pc1JlYWRvbmx5LnJlYWQocmVhZGVyKSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fZWRpdG9yT2JzLm1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXRleHRNb2RlbCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRjb25zdCBtb2RlbDogSW5saW5lQ29tcGxldGlvbnNNb2RlbCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0SW5saW5lQ29tcGxldGlvbnNNb2RlbCxcblx0XHRcdHRleHRNb2RlbCxcblx0XHRcdHRoaXMuX3N1Z2dlc3RXaWRnZXRBZGFwdGVyLnNlbGVjdGVkSXRlbSxcblx0XHRcdHRoaXMuX2VkaXRvck9icy52ZXJzaW9uSWQsXG5cdFx0XHR0aGlzLl9wb3NpdGlvbnMsXG5cdFx0XHR0aGlzLl9kZWJvdW5jZVZhbHVlLFxuXHRcdFx0dGhpcy5fZW5hYmxlZEluQ29uZmlnLFxuXHRcdFx0KCkgPT4gdGhpcy5faXNFZGl0b3JEaWN0YXRpb25JblByb2dyZXNzKCksXG5cdFx0XHR0aGlzLmVkaXRvcixcblx0XHQpO1xuXHRcdHJldHVybiBtb2RlbDtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGxheUFjY2Vzc2liaWxpdHlTaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsKHRoaXMpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hpZGVJbmxpbmVFZGl0T25TZWxlY3Rpb25DaGFuZ2U7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF92aWV3ID0gZGVyaXZlZChyZWFkZXIgPT4gcmVhZGVyLnN0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmxpbmVTdWdnZXN0aW9uc1ZpZXcuaG90LnJlYWQocmVhZGVyKSwgdGhpcy5lZGl0b3IsIHRoaXMubW9kZWwsIHRoaXMuX2ZvY3VzSXNJbk1lbnUpKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RlYm91bmNlU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9lZGl0b3JPYnMgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcih0aGlzLmVkaXRvcik7XG5cdFx0dGhpcy5fcG9zaXRpb25zID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fZWRpdG9yT2JzLnNlbGVjdGlvbnMucmVhZChyZWFkZXIpPy5tYXAocyA9PiBzLmdldEVuZFBvc2l0aW9uKCkpID8/IFtuZXcgUG9zaXRpb24oMSwgMSldKTtcblx0XHR0aGlzLl9zdWdnZXN0V2lkZ2V0QWRhcHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBPYnNlcnZhYmxlU3VnZ2VzdFdpZGdldEFkYXB0ZXIoXG5cdFx0XHR0aGlzLl9lZGl0b3JPYnMsXG5cdFx0XHRpdGVtID0+IHRoaXMubW9kZWwuZ2V0KCk/LmhhbmRsZVN1Z2dlc3RBY2NlcHRlZChpdGVtKSxcblx0XHRcdCgpID0+IHRoaXMubW9kZWwuZ2V0KCk/LnNlbGVjdGVkSW5saW5lQ29tcGxldGlvbi5nZXQoKT8uZ2V0U2luZ2xlVGV4dEVkaXQoKSxcblx0XHQpKTtcblx0XHR0aGlzLl9lbmFibGVkSW5Db25maWcgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgKCkgPT4gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5pbmxpbmVTdWdnZXN0KS5lbmFibGVkKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZShuZXcgU2V0KFsnZWRpdG9yRGljdGF0aW9uLmluUHJvZ3Jlc3MnXSkpICYmIHRoaXMuX2lzRWRpdG9yRGljdGF0aW9uSW5Qcm9ncmVzcygpKSB7XG5cdFx0XHRcdHRoaXMubW9kZWwuZ2V0KCk/LnN0b3AoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kZWJvdW5jZVZhbHVlID0gdGhpcy5fZGVib3VuY2VTZXJ2aWNlLmZvcihcblx0XHRcdHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZUNvbXBsZXRpb25zUHJvdmlkZXIsXG5cdFx0XHQnSW5saW5lQ29tcGxldGlvbnNEZWJvdW5jZScsXG5cdFx0XHR7IG1pbjogNTAsIG1heDogNTAgfVxuXHRcdCk7XG5cdFx0dGhpcy5tb2RlbC5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5faGlkZUlubGluZUVkaXRPblNlbGVjdGlvbkNoYW5nZSA9IHRoaXMuX2VkaXRvck9icy5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmlubGluZVN1Z2dlc3QpLm1hcCh2YWwgPT4gdHJ1ZSk7XG5cblx0XHR0aGlzLl92aWV3LnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5faW5zdGFuY2VzLmFkZCh0aGlzKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLl9pbnN0YW5jZXMuZGVsZXRlKHRoaXMpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvLyBDYW5jZWwgYWxsIG90aGVyIGlubGluZSBjb21wbGV0aW9ucyB3aGVuIGEgbmV3IG9uZSBzdGFydHNcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIW1vZGVsKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBtb2RlbC5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXN0YXRlKSB7IHJldHVybjsgfVxuXHRcdFx0aWYgKCF0aGlzLl9mb2N1c0lzSW5FZGl0b3JPck1lbnUucmVhZCh1bmRlZmluZWQpKSB7IHJldHVybjsgfVxuXG5cdFx0XHQvLyBUaGlzIGNvbnRyb2xsZXIgaXMgaW4gZm9jdXMsIGhlbmNlIHJlamVjdCBvdGhlcnMuXG5cdFx0XHQvLyBIb3dldmVyIGlmIHdlIGRpc3BsYXkgYSBORVMgdGhhdCByZWxhdGVzIHRvIGFub3RoZXIgZWRpdCB0aGVuIHRyaWdnZXIgTkVTIG9uIHRoYXQgcmVsYXRlZCBjb250cm9sbGVyXG5cdFx0XHRjb25zdCBuZXh0RWRpdFVyaSA9IHN0YXRlLmtpbmQgPT09ICdpbmxpbmVFZGl0JyA/IHN0YXRlLm5leHRFZGl0VXJpIDogdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCBjdHJsIG9mIElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5faW5zdGFuY2VzKSB7XG5cdFx0XHRcdGlmIChjdHJsID09PSB0aGlzKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dEVkaXRVcmkgJiYgaXNFcXVhbChuZXh0RWRpdFVyaSwgY3RybC5lZGl0b3IuZ2V0TW9kZWwoKT8udXJpKSkge1xuXHRcdFx0XHRcdC8vIFRoZSBuZXh0IGVkaXQgaW4gb3RoZXIgZWRpdG8gaXMgcmVsYXRlZCB0byB0aGlzIGNvbnRyb2xsZXIsIHRyaWdnZXIgaXQuXG5cdFx0XHRcdFx0Y3RybC5tb2RlbC5yZWFkKHVuZGVmaW5lZCk/LnRyaWdnZXIoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjdHJsLnJlamVjdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8vIENhbmNlbCBhbGwgb3RoZXIgaW5saW5lIGNvbXBsZXRpb25zIHdoZW4gYSBuZXcgb25lIHN0YXJ0c1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHVyaSA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk/LnVyaTtcblx0XHRcdGlmICghbW9kZWwgfHwgIXVyaSkgeyByZXR1cm47IH1cblxuXHRcdFx0Ly8gVGhpcyBORVMgd2FzIGFjY2VwdGVkLCBpdHMgcG9zc2libGUgdGhlcmUgaXMgYW4gTkVTIHRoYXQgcG9pbnRzIHRvIHRoaXMgZWRpdG9yLlxuXHRcdFx0Ly8gSS5lLiB0aGVyZSdzIGFuIE5FUyB0aGF0IHJlYWRzIGBHbyBUbyBOZXh0IEVkaXRgLFxuXHRcdFx0Ly8gSWYgdGhlcmUgaXMgb25lIHRoYXQgcG9pbnRzIHRvIHRoaXMgZWRpdG9yLCB0aGVuIHdlIG5lZWQgdG8gaGlkZSB0aGF0IGFzIHRoaXMgTkVTIHdhcyBhY2NlcHRlZC5cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQobW9kZWwub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGN0cmwgb2YgSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLl9pbnN0YW5jZXMpIHtcblx0XHRcdFx0XHRpZiAoY3RybCA9PT0gdGhpcykge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIEZpbmQgdGhlIG5lcyBmcm9tIGFub3RoZXIgZWRpdG9yIHRoYXQgcG9pbnRzIHRvIHRoaXMuXG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBjdHJsLm1vZGVsLnJlYWQodW5kZWZpbmVkKT8uc3RhdGUucmVhZCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGlmIChzdGF0ZT8ua2luZCA9PT0gJ2lubGluZUVkaXQnICYmIGlzRXF1YWwoc3RhdGUubmV4dEVkaXRVcmksIHVyaSkpIHtcblx0XHRcdFx0XHRcdGN0cmwubW9kZWwucmVhZCh1bmRlZmluZWQpPy5zdG9wKCdhdXRvbWF0aWMnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJ1bk9uQ2hhbmdlKHRoaXMuX2VkaXRvck9icy5vbkRpZFR5cGUsIChfdmFsdWUsIF9jaGFuZ2VzKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZW5hYmxlZEluQ29uZmlnLmdldCgpICYmICF0aGlzLl9pc0VkaXRvckRpY3RhdGlvbkluUHJvZ3Jlc3MoKSkge1xuXHRcdFx0XHR0aGlzLm1vZGVsLmdldCgpPy50cmlnZ2VyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocnVuT25DaGFuZ2UodGhpcy5fZWRpdG9yT2JzLm9uRGlkUGFzdGUsIChfdmFsdWUsIF9jaGFuZ2VzKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZW5hYmxlZEluQ29uZmlnLmdldCgpICYmICF0aGlzLl9pc0VkaXRvckRpY3RhdGlvbkluUHJvZ3Jlc3MoKSkge1xuXHRcdFx0XHR0aGlzLm1vZGVsLmdldCgpPy50cmlnZ2VyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVGhlc2UgY29tbWFuZHMgZG9uJ3QgdHJpZ2dlciBvbkRpZFR5cGUuXG5cdFx0Y29uc3QgdHJpZ2dlckNvbW1hbmRzID0gbmV3IFNldChbXG5cdFx0XHRDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYi5pZCxcblx0XHRcdENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdC5pZCxcblx0XHRcdENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlUmlnaHQuaWQsXG5cdFx0XHRpbmxpbmVTdWdnZXN0Q29tbWl0SWQsXG5cdFx0XHQnYWNjZXB0U2VsZWN0ZWRTdWdnZXN0aW9uJyxcblx0XHRcdEluc2VydExpbmVBZnRlckFjdGlvbi5JRCxcblx0XHRcdEluc2VydExpbmVCZWZvcmVBY3Rpb24uSUQsXG5cdFx0XHRGSU5EX0lEUy5OZXh0TWF0Y2hGaW5kQWN0aW9uLFxuXHRcdFx0TmV4dE1hcmtlckFjdGlvbi5JRCxcblx0XHRcdFByZXZNYXJrZXJBY3Rpb24uSUQsXG5cdFx0XHROZXh0TWFya2VySW5GaWxlc0FjdGlvbi5JRCxcblx0XHRcdFByZXZNYXJrZXJJbkZpbGVzQWN0aW9uLklELFxuXHRcdFx0Li4uVHJpZ2dlcklubGluZUVkaXRDb21tYW5kc1JlZ2lzdHJ5LmdldFJlZ2lzdGVyZWRDb21tYW5kcygpLFxuXHRcdF0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbW1hbmRTZXJ2aWNlLm9uRGlkRXhlY3V0ZUNvbW1hbmQoKGUpID0+IHtcblx0XHRcdGlmICh0cmlnZ2VyQ29tbWFuZHMuaGFzKGUuY29tbWFuZElkKSAmJiBlZGl0b3IuaGFzVGV4dEZvY3VzKCkgJiYgdGhpcy5fZW5hYmxlZEluQ29uZmlnLmdldCgpICYmICF0aGlzLl9pc0VkaXRvckRpY3RhdGlvbkluUHJvZ3Jlc3MoKSkge1xuXHRcdFx0XHRsZXQgbm9EZWxheSA9IGZhbHNlO1xuXHRcdFx0XHRpZiAoZS5jb21tYW5kSWQgPT09IGlubGluZVN1Z2dlc3RDb21taXRJZCkge1xuXHRcdFx0XHRcdG5vRGVsYXkgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2VkaXRvck9icy5mb3JjZVVwZGF0ZSh0eCA9PiB7XG5cdFx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBvbkRpZEV4ZWN1dGVDb21tYW5kICovXG5cdFx0XHRcdFx0dGhpcy5tb2RlbC5nZXQoKT8udHJpZ2dlcih0eCwgeyBub0RlbGF5IH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihydW5PbkNoYW5nZSh0aGlzLl9lZGl0b3JPYnMuc2VsZWN0aW9ucywgKF92YWx1ZSwgXywgY2hhbmdlcykgPT4ge1xuXHRcdFx0aWYgKGNoYW5nZXMuc29tZShlID0+IGUucmVhc29uID09PSBDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQgfHwgZS5zb3VyY2UgPT09ICdhcGknKSkge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2hpZGVJbmxpbmVFZGl0T25TZWxlY3Rpb25DaGFuZ2UuZ2V0KCkgJiYgdGhpcy5tb2RlbC5nZXQoKT8uc3RhdGUuZ2V0KCk/LmtpbmQgPT09ICdpbmxpbmVFZGl0Jykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtID0gdGhpcy5tb2RlbC5nZXQoKTtcblx0XHRcdFx0aWYgKCFtKSB7IHJldHVybjsgfVxuXHRcdFx0XHRpZiAobS5zdGF0ZS5nZXQoKT8ua2luZCA9PT0gJ2dob3N0VGV4dCcpIHtcblx0XHRcdFx0XHR0aGlzLm1vZGVsLmdldCgpPy5zdG9wKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpc0ZvY3VzZWQgPSB0aGlzLl9mb2N1c0lzSW5FZGl0b3JPck1lbnUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdGlmIChpc0ZvY3VzZWQpIHtcblx0XHRcdFx0Ly8gSWYgdGhpcyBtb2RlbCBhbHJlYWR5IGhhcyBhbiBORVMgZm9yIGFub3RoZXIgZWRpdG9yLCB0aGVuIGxlYXZlIGFzIGlzXG5cdFx0XHRcdC8vIEVsc2Ugc3RvcCBvdGhlciBtb2RlbHMuXG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gbW9kZWw/LnN0YXRlLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZS5raW5kICE9PSAnaW5saW5lRWRpdCcgfHwgIXN0YXRlLm5leHRFZGl0VXJpKSB7XG5cdFx0XHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBjdHJsIG9mIElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5faW5zdGFuY2VzKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChjdHJsICE9PSB0aGlzKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y3RybC5tb2RlbC5yZWFkKHVuZGVmaW5lZCk/LnN0b3AoJ2F1dG9tYXRpYycsIHR4KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGhpcyBpcyBhIGhpZGRlbiBzZXR0aW5nIHZlcnkgdXNlZnVsIGZvciBkZWJ1Z2dpbmdcblx0XHRcdGlmICh0aGlzLl9jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oJ2FjY2Vzc2libGVWaWV3SXNTaG93bicpXG5cdFx0XHRcdHx8IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5rZWVwT25CbHVyJylcblx0XHRcdFx0fHwgZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uaW5saW5lU3VnZ2VzdCkua2VlcE9uQmx1clxuXHRcdFx0XHR8fCBJbmxpbmVTdWdnZXN0aW9uSGludHNDb250ZW50V2lkZ2V0LmRyb3BEb3duVmlzaWJsZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghbW9kZWwpIHsgcmV0dXJuOyB9XG5cdFx0XHRpZiAobW9kZWwuc3RhdGUucmVhZCh1bmRlZmluZWQpPy5pbmxpbmVTdWdnZXN0aW9uPy5pc0Zyb21FeHBsaWNpdFJlcXVlc3QgJiYgbW9kZWwuaW5saW5lRWRpdEF2YWlsYWJsZS5yZWFkKHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0Ly8gZG9udCBoaWRlIGlubGluZSBlZGl0cyBvbiBibHVyIHdoZW4gcmVxdWVzdGVkIGV4cGxpY2l0bHlcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLm9uRGlkQmx1ckVkaXRvcldpZGdldCAqL1xuXHRcdFx0XHRtb2RlbC5zdG9wKCdhdXRvbWF0aWMnLCB0eCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5mb3JjZVJlbmRlcmluZ0Fib3ZlICovXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMubW9kZWwucmVhZChyZWFkZXIpPy5pbmxpbmVDb21wbGV0aW9uU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHN0YXRlPy5zdWdnZXN0SXRlbSkge1xuXHRcdFx0XHRpZiAoc3RhdGUucHJpbWFyeUdob3N0VGV4dC5saW5lQ291bnQgPj0gMikge1xuXHRcdFx0XHRcdHRoaXMuX3N1Z2dlc3RXaWRnZXRBZGFwdGVyLmZvcmNlUmVuZGVyaW5nQWJvdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc3VnZ2VzdFdpZGdldEFkYXB0ZXIuc3RvcEZvcmNlUmVuZGVyaW5nQWJvdmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3N1Z2dlc3RXaWRnZXRBZGFwdGVyLnN0b3BGb3JjZVJlbmRlcmluZ0Fib3ZlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY3VycmVudElubGluZUNvbXBsZXRpb25CeVNlbWFudGljSWQgPSBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIChyZWFkZXIsIGxhc3QpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1vZGVsPy5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodGhpcy5fc3VnZ2VzdFdpZGdldEFkYXB0ZXIuc2VsZWN0ZWRJdGVtLmdldCgpKSB7XG5cdFx0XHRcdHJldHVybiBsYXN0O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHN0YXRlPy5pbmxpbmVTdWdnZXN0aW9uPy5zZW1hbnRpY0lkO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJ1bk9uQ2hhbmdlV2l0aFN0b3JlKGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3BsYXlBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlYWQocmVhZGVyKTtcblx0XHRcdGN1cnJlbnRJbmxpbmVDb21wbGV0aW9uQnlTZW1hbnRpY0lkLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9KSwgYXN5bmMgKF92YWx1ZSwgXywgX2RlbHRhcywgc3RvcmUpID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLnBsYXlBY2Nlc3NpYmlsaXR5U2lnbmFsQW5kUmVhZFN1Z2dlc3Rpb24gKi9cblx0XHRcdGxldCBtb2RlbCA9IHRoaXMubW9kZWwuZ2V0KCk7XG5cdFx0XHRsZXQgc3RhdGUgPSBtb2RlbD8uc3RhdGUuZ2V0KCk7XG5cdFx0XHRpZiAoIXN0YXRlIHx8ICFtb2RlbCkgeyByZXR1cm47IH1cblxuXHRcdFx0YXdhaXQgdGltZW91dCg1MCwgY2FuY2VsT25EaXNwb3NlKHN0b3JlKSk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUodGhpcy5fc3VnZ2VzdFdpZGdldEFkYXB0ZXIuc2VsZWN0ZWRJdGVtLCBpc1VuZGVmaW5lZCwgKCkgPT4gZmFsc2UsIGNhbmNlbE9uRGlzcG9zZShzdG9yZSkpO1xuXG5cdFx0XHRtb2RlbCA9IHRoaXMubW9kZWwuZ2V0KCk7XG5cdFx0XHRzdGF0ZSA9IG1vZGVsPy5zdGF0ZS5nZXQoKTtcblx0XHRcdGlmICghc3RhdGUgfHwgIW1vZGVsKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3QgbGluZVRleHQgPSBzdGF0ZS5raW5kID09PSAnZ2hvc3RUZXh0JyA/IG1vZGVsLnRleHRNb2RlbC5nZXRMaW5lQ29udGVudChzdGF0ZS5wcmltYXJ5R2hvc3RUZXh0LmxpbmVOdW1iZXIpIDogJyc7XG5cdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKHN0YXRlLmtpbmQgPT09ICdnaG9zdFRleHQnID8gQWNjZXNzaWJpbGl0eVNpZ25hbC5pbmxpbmVTdWdnZXN0aW9uIDogQWNjZXNzaWJpbGl0eVNpZ25hbC5uZXh0RWRpdFN1Z2dlc3Rpb24pO1xuXG5cdFx0XHRpZiAodGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zY3JlZW5SZWFkZXJBbm5vdW5jZUlubGluZVN1Z2dlc3Rpb24pKSB7XG5cdFx0XHRcdGlmIChzdGF0ZS5raW5kID09PSAnZ2hvc3RUZXh0Jykge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3ZpZGVTY3JlZW5SZWFkZXJVcGRhdGUoc3RhdGUucHJpbWFyeUdob3N0VGV4dC5yZW5kZXJGb3JTY3JlZW5SZWFkZXIobGluZVRleHQpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gc3RhdGUuaW5saW5lU3VnZ2VzdGlvbi50YXJnZXRSYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0Y29uc3QgdGFiU2hvdWxkQWNjZXB0ID0gbW9kZWwudGFiU2hvdWxkQWNjZXB0SW5saW5lRWRpdC5nZXQoKTtcblx0XHRcdFx0XHRjb25zdCB0YWJTaG91bGRKdW1wID0gbW9kZWwudGFiU2hvdWxkSnVtcFRvSW5saW5lRWRpdC5nZXQoKTtcblx0XHRcdFx0XHRsZXQgY29udGVudDogc3RyaW5nO1xuXHRcdFx0XHRcdGlmICh0YWJTaG91bGRBY2NlcHQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGtiID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhpbmxpbmVTdWdnZXN0Q29tbWl0SWQpPy5nZXRBcmlhTGFiZWwoKTtcblx0XHRcdFx0XHRcdGNvbnRlbnQgPSBrYlxuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCduZXh0RWRpdFN1Z2dlc3Rpb25BY2NlcHRXaXRoS2InLCBcIk5leHQgZWRpdCBzdWdnZXN0aW9uIGF2YWlsYWJsZSBvbiBsaW5lIHswfSwgcHJlc3MgezF9IHRvIGFjY2VwdFwiLCBsaW5lTnVtYmVyLCBrYilcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbmV4dEVkaXRTdWdnZXN0aW9uQWNjZXB0Tm9LYicsIFwiTmV4dCBlZGl0IHN1Z2dlc3Rpb24gYXZhaWxhYmxlIG9uIGxpbmUgezB9LCBhY2NlcHQgaXQgdG8gYXBwbHlcIiwgbGluZU51bWJlcik7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0YWJTaG91bGRKdW1wKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBrYiA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoanVtcFRvTmV4dElubGluZUVkaXRJZCk/LmdldEFyaWFMYWJlbCgpO1xuXHRcdFx0XHRcdFx0Y29udGVudCA9IGtiXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ25leHRFZGl0U3VnZ2VzdGlvbkp1bXBXaXRoS2InLCBcIk5leHQgZWRpdCBzdWdnZXN0aW9uIGF2YWlsYWJsZSBvbiBsaW5lIHswfSwgcHJlc3MgezF9IHRvIGp1bXBcIiwgbGluZU51bWJlciwga2IpXG5cdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ25leHRFZGl0U3VnZ2VzdGlvbkp1bXBOb0tiJywgXCJOZXh0IGVkaXQgc3VnZ2VzdGlvbiBhdmFpbGFibGUgb24gbGluZSB7MH1cIiwgbGluZU51bWJlcik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQgPSBsb2NhbGl6ZSgnbmV4dEVkaXRTdWdnZXN0aW9uTm9BY3Rpb24nLCBcIk5leHQgZWRpdCBzdWdnZXN0aW9uIGF2YWlsYWJsZSBvbiBsaW5lIHswfVwiLCBsaW5lTnVtYmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fcHJvdmlkZVNjcmVlblJlYWRlclVwZGF0ZShjb250ZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFRPRE9AaGVkaWV0XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmlubGluZUNvbXBsZXRpb25zJykpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3IudXBkYXRlT3B0aW9ucyh7IGlubGluZUNvbXBsZXRpb25zQWNjZXNzaWJpbGl0eVZlcmJvc2U6IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5pbmxpbmVDb21wbGV0aW9ucycpIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLmVkaXRvci51cGRhdGVPcHRpb25zKHsgaW5saW5lQ29tcGxldGlvbnNBY2Nlc3NpYmlsaXR5VmVyYm9zZTogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmlubGluZUNvbXBsZXRpb25zJykgfSk7XG5cblx0XHRjb25zdCBjb250ZXh0S2V5U3ZjT2JzID0gbmV3IE9ic2VydmFibGVDb250ZXh0S2V5U2VydmljZSh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U3ZjT2JzLmJpbmQoSW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLmN1cnNvckluSW5kZW50YXRpb24sIHRoaXMuX2N1cnNvcklzSW5JbmRlbnRhdGlvbikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTdmNPYnMuYmluZChJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaGFzU2VsZWN0aW9uLCByZWFkZXIgPT4gIXRoaXMuX2VkaXRvck9icy5jdXJzb3JTZWxlY3Rpb24ucmVhZChyZWFkZXIpPy5pc0VtcHR5KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U3ZjT2JzLmJpbmQoSW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLmN1cnNvckF0SW5saW5lRWRpdCwgdGhpcy5tb2RlbC5tYXAoKG0sIHJlYWRlcikgPT4gbT8uaW5saW5lRWRpdFN0YXRlPy5yZWFkKHJlYWRlcik/LmN1cnNvckF0SW5saW5lRWRpdC5yZWFkKHJlYWRlcikpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVN2Y09icy5iaW5kKElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy50YWJTaG91bGRBY2NlcHRJbmxpbmVFZGl0LCB0aGlzLm1vZGVsLm1hcCgobSwgcikgPT4gISFtPy50YWJTaG91bGRBY2NlcHRJbmxpbmVFZGl0LnJlYWQocikpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVN2Y09icy5iaW5kKElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy50YWJTaG91bGRKdW1wVG9JbmxpbmVFZGl0LCB0aGlzLm1vZGVsLm1hcCgobSwgcikgPT4gISFtPy50YWJTaG91bGRKdW1wVG9JbmxpbmVFZGl0LnJlYWQocikpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVN2Y09icy5iaW5kKElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5pbmxpbmVFZGl0VmlzaWJsZSwgcmVhZGVyID0+IHRoaXMubW9kZWwucmVhZChyZWFkZXIpPy5pbmxpbmVFZGl0U3RhdGUucmVhZChyZWFkZXIpICE9PSB1bmRlZmluZWQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U3ZjT2JzLmJpbmQoSW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLmlubGluZVN1Z2dlc3Rpb25IYXNJbmRlbnRhdGlvbixcblx0XHRcdHJlYWRlciA9PiB0aGlzLm1vZGVsLnJlYWQocmVhZGVyKT8uZ2V0SW5kZW50YXRpb25JbmZvKHJlYWRlcik/LnN0YXJ0c1dpdGhJbmRlbnRhdGlvblxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTdmNPYnMuYmluZChJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5saW5lU3VnZ2VzdGlvbkhhc0luZGVudGF0aW9uTGVzc1RoYW5UYWJTaXplLFxuXHRcdFx0cmVhZGVyID0+IHRoaXMubW9kZWwucmVhZChyZWFkZXIpPy5nZXRJbmRlbnRhdGlvbkluZm8ocmVhZGVyKT8uc3RhcnRzV2l0aEluZGVudGF0aW9uTGVzc1RoYW5UYWJTaXplXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVN2Y09icy5iaW5kKElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5zdXBwcmVzc1N1Z2dlc3Rpb25zLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gbW9kZWw/LmlubGluZUNvbXBsZXRpb25TdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gc3RhdGU/LnByaW1hcnlHaG9zdFRleHQgJiYgc3RhdGU/LmlubGluZVN1Z2dlc3Rpb24gPyBzdGF0ZS5pbmxpbmVTdWdnZXN0aW9uLnNvdXJjZS5pbmxpbmVTdWdnZXN0aW9ucy5zdXBwcmVzc1N1Z2dlc3Rpb25zIDogdW5kZWZpbmVkO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U3ZjT2JzLmJpbmQoSW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLmlubGluZVN1Z2dlc3Rpb25BbHRlcm5hdGl2ZUFjdGlvblZpc2libGUsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBtb2RlbD8uaW5saW5lRWRpdFN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHN0YXRlPy5pbmxpbmVTdWdnZXN0aW9uLmFjdGlvbjtcblx0XHRcdHJldHVybiBhY3Rpb24gJiYgYWN0aW9uLmtpbmQgPT09ICdlZGl0JyAmJiBhY3Rpb24uYWx0ZXJuYXRpdmVBY3Rpb24gIT09IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVN2Y09icy5iaW5kKElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5pbmxpbmVTdWdnZXN0aW9uVmlzaWJsZSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1vZGVsPy5pbmxpbmVDb21wbGV0aW9uU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuICEhc3RhdGU/LmlubGluZVN1Z2dlc3Rpb24gJiYgc3RhdGU/LnByaW1hcnlHaG9zdFRleHQgIT09IHVuZGVmaW5lZCAmJiAhc3RhdGU/LnByaW1hcnlHaG9zdFRleHQuaXNFbXB0eSgpO1xuXHRcdH0pKTtcblx0XHRjb25zdCBmaXJzdEdob3N0VGV4dFBvcyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1vZGVsPy5pbmxpbmVDb21wbGV0aW9uU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcHJpbWFyeUdob3N0VGV4dCA9IHN0YXRlPy5wcmltYXJ5R2hvc3RUZXh0O1xuXHRcdFx0aWYgKCFwcmltYXJ5R2hvc3RUZXh0IHx8IHByaW1hcnlHaG9zdFRleHQuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmaXJzdFBhcnRQb3MgPSBuZXcgUG9zaXRpb24ocHJpbWFyeUdob3N0VGV4dC5saW5lTnVtYmVyLCBwcmltYXJ5R2hvc3RUZXh0LnBhcnRzWzBdLmNvbHVtbik7XG5cdFx0XHRyZXR1cm4gZmlyc3RQYXJ0UG9zO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTdmNPYnMuYmluZChJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuY3Vyc29yQmVmb3JlR2hvc3RUZXh0LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZmlyc3RQYXJ0UG9zID0gZmlyc3RHaG9zdFRleHRQb3MucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFmaXJzdFBhcnRQb3MpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY3Vyc29yUG9zID0gdGhpcy5fZWRpdG9yT2JzLmN1cnNvclBvc2l0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghY3Vyc29yUG9zKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmaXJzdFBhcnRQb3MuZXF1YWxzKGN1cnNvclBvcyk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dE1vZGVsQ2hhbmdlUmVjb3JkZXIsIHRoaXMuZWRpdG9yKSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0VkaXRvckRpY3RhdGlvbkluUHJvZ3Jlc3MoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHQodGhpcy5lZGl0b3IuZ2V0RG9tTm9kZSgpKT8uZ2V0VmFsdWUoJ2VkaXRvckRpY3RhdGlvbi5pblByb2dyZXNzJykgPT09IHRydWU7XG5cdH1cblxuXHRwdWJsaWMgcGxheUFjY2Vzc2liaWxpdHlTaWduYWwodHg6IElUcmFuc2FjdGlvbikge1xuXHRcdHRoaXMuX3BsYXlBY2Nlc3NpYmlsaXR5U2lnbmFsLnRyaWdnZXIodHgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJvdmlkZVNjcmVlblJlYWRlclVwZGF0ZShjb250ZW50OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBhY2Nlc3NpYmxlVmlld1Nob3dpbmcgPSB0aGlzLl9jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oJ2FjY2Vzc2libGVWaWV3SXNTaG93bicpO1xuXHRcdGNvbnN0IGFjY2Vzc2libGVWaWV3S2V5YmluZGluZyA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoJ2VkaXRvci5hY3Rpb24uYWNjZXNzaWJsZVZpZXcnKTtcblx0XHRsZXQgaGludDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmICghYWNjZXNzaWJsZVZpZXdTaG93aW5nICYmIGFjY2Vzc2libGVWaWV3S2V5YmluZGluZyAmJiB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmlubGluZUNvbXBsZXRpb25zQWNjZXNzaWJpbGl0eVZlcmJvc2UpKSB7XG5cdFx0XHRoaW50ID0gbG9jYWxpemUoJ3Nob3dBY2Nlc3NpYmxlVmlld0hpbnQnLCBcIkluc3BlY3QgdGhpcyBpbiB0aGUgYWNjZXNzaWJsZSB2aWV3ICh7MH0pXCIsIGFjY2Vzc2libGVWaWV3S2V5YmluZGluZy5nZXRBcmlhTGFiZWwoKSk7XG5cdFx0fVxuXHRcdGFsZXJ0KGhpbnQgPyBjb250ZW50ICsgJywgJyArIGhpbnQgOiBjb250ZW50KTtcblx0fVxuXG5cdHB1YmxpYyBzaG91bGRTaG93SG92ZXJBdChyYW5nZTogUmFuZ2UpIHtcblx0XHRjb25zdCBnaG9zdFRleHQgPSB0aGlzLm1vZGVsLmdldCgpPy5wcmltYXJ5R2hvc3RUZXh0LmdldCgpO1xuXHRcdGlmICghZ2hvc3RUZXh0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBnaG9zdFRleHQucGFydHMuc29tZShwID0+IHJhbmdlLmNvbnRhaW5zUG9zaXRpb24obmV3IFBvc2l0aW9uKGdob3N0VGV4dC5saW5lTnVtYmVyLCBwLmNvbHVtbikpKTtcblx0fVxuXG5cdHB1YmxpYyBzaG91bGRTaG93SG92ZXJBdFZpZXdab25lKHZpZXdab25lSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl92aWV3LmdldCgpLnNob3VsZFNob3dIb3ZlckF0Vmlld1pvbmUodmlld1pvbmVJZCk7XG5cdH1cblxuXHRwdWJsaWMgcmVqZWN0KCk6IHZvaWQge1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdGNvbnN0IG0gPSB0aGlzLm1vZGVsLmdldCgpO1xuXHRcdFx0aWYgKG0pIHtcblx0XHRcdFx0bS5zdG9wKCdleHBsaWNpdENhbmNlbCcsIHR4KTtcblx0XHRcdFx0Ly8gT25seSBpZiB0aGlzIGNvbnRyb2xsZXIgaXMgaW4gZm9jdXMgY2FuIHdlIGNhbmNlbCBvdGhlcnMuXG5cdFx0XHRcdGlmICh0aGlzLl9mb2N1c0lzSW5FZGl0b3JPck1lbnUuZ2V0KCkpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGN0cmwgb2YgSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLl9pbnN0YW5jZXMpIHtcblx0XHRcdFx0XHRcdGlmIChjdHJsICE9PSB0aGlzICYmICFjdHJsLl9mb2N1c0lzSW5FZGl0b3JPck1lbnUuZ2V0KCkpIHtcblx0XHRcdFx0XHRcdFx0Y3RybC5tb2RlbC5nZXQoKT8uc3RvcCgnYXV0b21hdGljJywgdHgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGp1bXAoKTogdm9pZCB7XG5cdFx0Y29uc3QgbSA9IHRoaXMubW9kZWwuZ2V0KCk7XG5cdFx0aWYgKG0pIHtcblx0XHRcdG0uanVtcCgpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBdUIsU0FBUyxTQUFTLG1CQUFtQiw0QkFBNEIscUJBQXFCLGtCQUFrQixpQkFBaUIsYUFBYSxzQkFBc0IsYUFBYSxvQkFBb0I7QUFDcE4sU0FBUyxlQUFlO0FBQ3hCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCLG1DQUFtQztBQUNqRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQix5QkFBeUIsa0JBQWtCLCtCQUErQjtBQUNyRyxTQUFTLHVC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
