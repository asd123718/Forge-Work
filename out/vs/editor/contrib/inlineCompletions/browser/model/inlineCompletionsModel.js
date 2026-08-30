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
import { mapFindFirst } from "../../../../../base/common/arraysFind.js";
import { arrayEqualsC } from "../../../../../base/common/equals.js";
import { BugIndicatingError, onUnexpectedExternalError } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { autorun, constObservable, derived, derivedHandleChanges, derivedOpts, mapObservableArrayCached, observableFromEvent, observableSignal, observableValue, recomputeInitiallyAndOnChange, subtransaction, transaction } from "../../../../../base/common/observable.js";
import { firstNonWhitespaceIndex } from "../../../../../base/common/strings.js";
import { isDefined } from "../../../../../base/common/types.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { observableCodeEditor } from "../../../../browser/observableCodeEditor.js";
import product from "../../../../../platform/product/common/product.js";
import { EditorOption } from "../../../../common/config/editorOptions.js";
import { CursorColumns } from "../../../../common/core/cursorColumns.js";
import { LineRange } from "../../../../common/core/ranges/lineRange.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { Selection } from "../../../../common/core/selection.js";
import { TextReplacement, TextEdit } from "../../../../common/core/edits/textEdit.js";
import { TextLength } from "../../../../common/core/text/textLength.js";
import { ScrollType } from "../../../../common/editorCommon.js";
import { InlineCompletionEndOfLifeReasonKind, InlineCompletionTriggerKind, PartialAcceptTriggerKind } from "../../../../common/languages.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { EndOfLinePreference } from "../../../../common/model.js";
import { TextModelText } from "../../../../common/model/textModelText.js";
import { ILanguageFeaturesService } from "../../../../common/services/languageFeatures.js";
import { SnippetController2 } from "../../../snippet/browser/snippetController2.js";
import { getEndPositionsAfterApplying, removeTextReplacementCommonSuffixPrefix } from "../utils.js";
import { AnimatedValue, easeOutCubic, ObservableAnimatedValue } from "../../../../../base/browser/animatedValue.js";
import { computeGhostText } from "./computeGhostText.js";
import { GhostText, ghostTextOrReplacementEquals, ghostTextsOrReplacementsEqual } from "./ghostText.js";
import { InlineCompletionsSource } from "./inlineCompletionsSource.js";
import { InlineCompletionEditorType } from "./provideInlineCompletions.js";
import { singleTextEditAugments, singleTextRemoveCommonPrefix } from "./singleTextEditHelpers.js";
import { EditSources } from "../../../../common/textModelEditSource.js";
import { ICodeEditorService } from "../../../../browser/services/codeEditorService.js";
import { IInlineCompletionsService } from "../../../../browser/services/inlineCompletionsService.js";
import { TypingInterval } from "./typingSpeed.js";
import { StringReplacement } from "../../../../common/core/edits/stringEdit.js";
import { OffsetRange } from "../../../../common/core/ranges/offsetRange.js";
import { URI } from "../../../../../base/common/uri.js";
import { IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { Schemas } from "../../../../../base/common/network.js";
import { getInlineCompletionsController } from "../controller/common.js";
let InlineCompletionsModel = class extends Disposable {
  constructor(textModel, _selectedSuggestItem, _textModelVersionId, _positions, _debounceValue, _enabled, _isSuppressed, _editor, _instantiationService, _commandService, _languageConfigurationService, _accessibilityService, _languageFeaturesService, _codeEditorService, _inlineCompletionsService, defaultAccountService) {
    super();
    this.textModel = textModel;
    this._selectedSuggestItem = _selectedSuggestItem;
    this._textModelVersionId = _textModelVersionId;
    this._positions = _positions;
    this._debounceValue = _debounceValue;
    this._enabled = _enabled;
    this._isSuppressed = _isSuppressed;
    this._editor = _editor;
    this._instantiationService = _instantiationService;
    this._commandService = _commandService;
    this._languageConfigurationService = _languageConfigurationService;
    this._accessibilityService = _accessibilityService;
    this._languageFeaturesService = _languageFeaturesService;
    this._codeEditorService = _codeEditorService;
    this._inlineCompletionsService = _inlineCompletionsService;
    this._isActive = observableValue(this, false);
    this._onlyRequestInlineEditsSignal = observableSignal(this);
    this._forceUpdateExplicitlySignal = observableSignal(this);
    this._noDelaySignal = observableSignal(this);
    this._fetchSpecificProviderSignal = observableSignal(this);
    // We use a semantic id to keep the same inline completion selected even if the provider reorders the completions.
    this._selectedInlineCompletionId = observableValue(this, void 0);
    this.primaryPosition = derived(this, (reader) => this._positions.read(reader)[0] ?? new Position(1, 1));
    this.allPositions = derived(this, (reader) => this._positions.read(reader));
    this.sku = observableValue(this, void 0);
    this._isAcceptingPartially = false;
    this._appearedInsideViewport = derived(this, (reader) => {
      const state = this.state.read(reader);
      if (!state || !state.inlineSuggestion) {
        return false;
      }
      return isSuggestionInViewport(this._editor, state.inlineSuggestion, reader);
    });
    this._onDidAccept = this._register(new Emitter());
    this.onDidAccept = this._onDidAccept.event;
    this._lastShownInlineCompletionInfo = void 0;
    this._lastAcceptedInlineCompletionInfo = void 0;
    this._didUndoInlineEdits = derivedHandleChanges({
      owner: this,
      changeTracker: {
        createChangeSummary: () => ({ didUndo: false }),
        handleChange: (ctx, changeSummary) => {
          changeSummary.didUndo = ctx.didChange(this._textModelVersionId) && !!ctx.change?.isUndoing;
          return true;
        }
      }
    }, (reader, changeSummary) => {
      const versionId = this._textModelVersionId.read(reader);
      if (versionId !== null && this._lastAcceptedInlineCompletionInfo && this._lastAcceptedInlineCompletionInfo.textModelVersionIdAfter === versionId - 1 && this._lastAcceptedInlineCompletionInfo.inlineCompletion.isInlineEdit && changeSummary.didUndo) {
        this._lastAcceptedInlineCompletionInfo = void 0;
        return true;
      }
      return false;
    });
    this._preserveCurrentCompletionReasons = /* @__PURE__ */ new Set([
      1 /* Redo */,
      0 /* Undo */,
      2 /* AcceptWord */
    ]);
    this.dontRefetchSignal = observableSignal(this);
    this._fetchInlineCompletionsPromise = derivedHandleChanges({
      owner: this,
      changeTracker: {
        createChangeSummary: () => ({
          dontRefetch: false,
          preserveCurrentCompletion: false,
          inlineCompletionTriggerKind: InlineCompletionTriggerKind.Automatic,
          onlyRequestInlineEdits: false,
          shouldDebounce: true,
          provider: void 0,
          changeHint: void 0,
          textChange: false,
          changeReason: ""
        }),
        handleChange: (ctx, changeSummary) => {
          if (ctx.didChange(this._textModelVersionId)) {
            if (this._preserveCurrentCompletionReasons.has(this._getReason(ctx.change))) {
              changeSummary.preserveCurrentCompletion = true;
            }
            const detailedReasons = ctx.change?.detailedReasons ?? [];
            changeSummary.changeReason = detailedReasons.length > 0 ? detailedReasons[0].getType() : "";
            changeSummary.textChange = true;
          } else if (ctx.didChange(this._forceUpdateExplicitlySignal)) {
            changeSummary.preserveCurrentCompletion = true;
            changeSummary.inlineCompletionTriggerKind = InlineCompletionTriggerKind.Explicit;
          } else if (ctx.didChange(this.dontRefetchSignal)) {
            changeSummary.dontRefetch = true;
          } else if (ctx.didChange(this._onlyRequestInlineEditsSignal)) {
            changeSummary.onlyRequestInlineEdits = true;
          } else if (ctx.didChange(this._fetchSpecificProviderSignal)) {
            changeSummary.provider = ctx.change?.provider;
            changeSummary.changeHint = ctx.change?.changeHint;
          }
          return true;
        }
      }
    }, (reader, changeSummary) => {
      this._source.clearOperationOnTextModelChange.read(reader);
      this._noDelaySignal.read(reader);
      this.dontRefetchSignal.read(reader);
      this._onlyRequestInlineEditsSignal.read(reader);
      this._forceUpdateExplicitlySignal.read(reader);
      this._fetchSpecificProviderSignal.read(reader);
      const shouldUpdate = !this._isSuppressed() && (this._enabled.read(reader) && this._selectedSuggestItem.read(reader) || this._isActive.read(reader)) && (!this._inlineCompletionsService.isSnoozing() || changeSummary.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit);
      if (!shouldUpdate) {
        this._source.cancelUpdate();
        return void 0;
      }
      this._textModelVersionId.read(reader);
      const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.read(void 0);
      let suggestItem = this._selectedSuggestItem.read(reader);
      if (this._shouldShowOnSuggestConflict.read(void 0)) {
        suggestItem = void 0;
      }
      if (suggestWidgetInlineCompletions && !suggestItem) {
        this._source.seedInlineCompletionsWithSuggestWidget();
      }
      if (changeSummary.dontRefetch) {
        return Promise.resolve(true);
      }
      if (this._didUndoInlineEdits.read(reader) && changeSummary.inlineCompletionTriggerKind !== InlineCompletionTriggerKind.Explicit) {
        transaction((tx) => {
          this._source.clear(tx);
        });
        return void 0;
      }
      let reason = "";
      if (changeSummary.provider) {
        reason += "providerOnDidChange";
      } else if (changeSummary.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit) {
        reason += "explicit";
      }
      if (changeSummary.changeReason) {
        reason += reason.length > 0 ? `:${changeSummary.changeReason}` : changeSummary.changeReason;
      }
      const typingInterval = this._typing.getTypingInterval();
      const requestInfo = {
        editorType: this.editorType,
        startTime: Date.now(),
        languageId: this.textModel.getLanguageId(),
        reason,
        typingInterval: typingInterval.averageInterval,
        typingIntervalCharacterCount: typingInterval.characterCount,
        availableProviders: [],
        sku: this.sku.read(void 0)
      };
      let context = {
        triggerKind: changeSummary.inlineCompletionTriggerKind,
        selectedSuggestionInfo: suggestItem?.toSelectedSuggestionInfo(),
        includeInlineCompletions: !changeSummary.onlyRequestInlineEdits,
        includeInlineEdits: this._inlineEditsEnabled.read(reader),
        requestIssuedDateTime: requestInfo.startTime,
        earliestShownDateTime: requestInfo.startTime + (changeSummary.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit || this.inAcceptFlow.read(void 0) ? 0 : this._minShowDelay.read(void 0)),
        changeHint: changeSummary.changeHint
      };
      if (context.triggerKind === InlineCompletionTriggerKind.Automatic && changeSummary.textChange) {
        if (this.textModel.getAlternativeVersionId() === this._lastShownInlineCompletionInfo?.alternateTextModelVersionId) {
          context = {
            ...context,
            includeInlineCompletions: !this._lastShownInlineCompletionInfo.inlineCompletion.isInlineEdit,
            includeInlineEdits: this._lastShownInlineCompletionInfo.inlineCompletion.isInlineEdit
          };
        }
      }
      const itemToPreserveCandidate = this.selectedInlineCompletion.read(void 0) ?? this._inlineSuggestionItems.read(void 0)?.inlineEdit;
      const itemToPreserve = changeSummary.preserveCurrentCompletion || itemToPreserveCandidate?.forwardStable ? itemToPreserveCandidate : void 0;
      const userJumpedToActiveCompletion = this._jumpedToId.map((jumpedTo) => !!jumpedTo && jumpedTo === this._inlineSuggestionItems.read(void 0)?.inlineEdit?.semanticId);
      const providers = changeSummary.provider ? { providers: [changeSummary.provider], label: "single:" + changeSummary.provider.providerId?.toString() } : { providers: this._languageFeaturesService.inlineCompletionsProvider.all(this.textModel), label: void 0 };
      const availableProviders = this.getAvailableProviders(providers.providers);
      requestInfo.availableProviders = availableProviders.map((p) => p.providerId).filter(isDefined);
      return this._source.fetch(availableProviders, providers.label, context, itemToPreserve?.identity, changeSummary.shouldDebounce, userJumpedToActiveCompletion, requestInfo);
    });
    this._inlineSuggestionItems = derivedOpts({ owner: this }, (reader) => {
      const c = this._source.inlineCompletions.read(reader);
      if (!c) {
        return void 0;
      }
      const cursorPosition = this.primaryPosition.read(reader);
      let inlineEdit = void 0;
      const visibleCompletions = [];
      for (const completion of c.inlineCompletions) {
        if (!completion.isInlineEdit) {
          if (completion.isVisible(this.textModel, cursorPosition)) {
            visibleCompletions.push(completion);
          }
        } else {
          inlineEdit = completion;
        }
      }
      if (visibleCompletions.length !== 0) {
        inlineEdit = void 0;
      }
      return {
        inlineCompletions: visibleCompletions,
        inlineEdit
      };
    });
    this._inlineCompletionItems = derivedOpts({ owner: this, equalsFn: arrayEqualsC() }, (reader) => {
      const c = this._inlineSuggestionItems.read(reader);
      return c?.inlineCompletions ?? [];
    });
    this.selectedInlineCompletionIndex = derived(this, (reader) => {
      const selectedInlineCompletionId = this._selectedInlineCompletionId.read(reader);
      const filteredCompletions = this._inlineCompletionItems.read(reader);
      const idx = this._selectedInlineCompletionId === void 0 ? -1 : filteredCompletions.findIndex((v) => v.semanticId === selectedInlineCompletionId);
      if (idx === -1) {
        this._selectedInlineCompletionId.set(void 0, void 0);
        return 0;
      }
      return idx;
    });
    this.selectedInlineCompletion = derived(this, (reader) => {
      const filteredCompletions = this._inlineCompletionItems.read(reader);
      const idx = this.selectedInlineCompletionIndex.read(reader);
      return filteredCompletions[idx];
    });
    this.activeCommands = derivedOpts(
      { owner: this, equalsFn: arrayEqualsC() },
      (r) => this.selectedInlineCompletion.read(r)?.source.inlineSuggestions.commands ?? []
    );
    this.inlineCompletionsCount = derived(this, (reader) => {
      if (this.lastTriggerKind.read(reader) === InlineCompletionTriggerKind.Explicit) {
        return this._inlineCompletionItems.read(reader).length;
      } else {
        return void 0;
      }
    });
    this._hasVisiblePeekWidgets = derived(this, (reader) => this._editorObs.openedPeekWidgets.read(reader) > 0);
    this._shouldShowOnSuggestConflict = derived(this, (reader) => {
      const showOnSuggestConflict = this._showOnSuggestConflict.read(reader);
      if (showOnSuggestConflict !== "never") {
        const hasInlineCompletion = !!this.selectedInlineCompletion.read(reader);
        if (hasInlineCompletion) {
          const item = this._selectedSuggestItem.read(reader);
          if (!item) {
            return false;
          }
          if (showOnSuggestConflict === "whenSuggestListIsIncomplete") {
            return item.listIncomplete;
          }
          return true;
        }
      }
      return false;
    });
    this.state = derivedOpts({
      owner: this,
      equalsFn: (a, b) => {
        if (!a || !b) {
          return a === b;
        }
        if (a.kind === "ghostText" && b.kind === "ghostText") {
          return ghostTextsOrReplacementsEqual(a.ghostTexts, b.ghostTexts) && a.inlineSuggestion === b.inlineSuggestion && a.suggestItem === b.suggestItem;
        } else if (a.kind === "inlineEdit" && b.kind === "inlineEdit") {
          return a.inlineSuggestion === b.inlineSuggestion;
        }
        return false;
      }
    }, (reader) => {
      const model = this.textModel;
      if (this._suppressInSnippetMode.read(reader) && this._isInSnippetMode.read(reader)) {
        return void 0;
      }
      const item = this._inlineSuggestionItems.read(reader);
      const inlineEditResult = item?.inlineEdit;
      if (inlineEditResult) {
        if (this._hasVisiblePeekWidgets.read(reader)) {
          return void 0;
        }
        const cursorAtInlineEdit = this.primaryPosition.map((cursorPos) => LineRange.fromRangeInclusive(inlineEditResult.targetRange).addMargin(1, 1).contains(cursorPos.lineNumber));
        const stringEdit = inlineEditResult.action?.kind === "edit" ? inlineEditResult.action.stringEdit : void 0;
        const replacements = stringEdit ? TextEdit.fromStringEdit(stringEdit, new TextModelText(this.textModel)).replacements : [];
        let nextEditUri = (item.inlineEdit?.command?.id === "vscode.open" || item.inlineEdit?.command?.id === "_workbench.open") && // eslint-disable-next-line local/code-no-any-casts
        item.inlineEdit?.command.arguments?.length ? URI.from(item.inlineEdit?.command.arguments[0]) : void 0;
        if (!inlineEditResult.originalTextRef.targets(this.textModel)) {
          nextEditUri = inlineEditResult.originalTextRef.uri;
        }
        return { kind: "inlineEdit", inlineSuggestion: inlineEditResult, edits: replacements, cursorAtInlineEdit, nextEditUri };
      }
      const suggestItem = this._selectedSuggestItem.read(reader);
      if (!this._shouldShowOnSuggestConflict.read(reader) && suggestItem) {
        const suggestCompletionEdit = singleTextRemoveCommonPrefix(suggestItem.getSingleTextEdit(), model);
        const augmentation = this._computeAugmentation(suggestCompletionEdit, reader);
        const isSuggestionPreviewEnabled = this._suggestPreviewEnabled.read(reader);
        if (!isSuggestionPreviewEnabled && !augmentation) {
          return void 0;
        }
        const fullEdit = augmentation?.edit ?? suggestCompletionEdit;
        const fullEditPreviewLength = augmentation ? augmentation.edit.text.length - suggestCompletionEdit.text.length : 0;
        const mode = this._suggestPreviewMode.read(reader);
        const positions = this._positions.read(reader);
        const allPotentialEdits = [fullEdit, ...getSecondaryEdits(this.textModel, positions, fullEdit)];
        const validEditsAndGhostTexts = allPotentialEdits.map((edit, idx) => ({ edit, ghostText: edit ? computeGhostText(edit, model, mode, positions[idx], fullEditPreviewLength) : void 0 })).filter(({ edit, ghostText }) => edit !== void 0 && ghostText !== void 0);
        const edits = validEditsAndGhostTexts.map(({ edit }) => edit);
        const ghostTexts = validEditsAndGhostTexts.map(({ ghostText }) => ghostText);
        const primaryGhostText = ghostTexts[0] ?? new GhostText(fullEdit.range.endLineNumber, []);
        return { kind: "ghostText", edits, primaryGhostText, ghostTexts, inlineSuggestion: augmentation?.completion, suggestItem };
      } else {
        if (!this._isActive.read(reader)) {
          return void 0;
        }
        const inlineSuggestion = this.selectedInlineCompletion.read(reader);
        if (!inlineSuggestion) {
          return void 0;
        }
        const replacement = inlineSuggestion.getSingleTextEdit();
        const mode = this._inlineSuggestMode.read(reader);
        const positions = this._positions.read(reader);
        const allPotentialEdits = [replacement, ...getSecondaryEdits(this.textModel, positions, replacement)];
        const validEditsAndGhostTexts = allPotentialEdits.map((edit, idx) => ({ edit, ghostText: edit ? computeGhostText(edit, model, mode, positions[idx], 0) : void 0 })).filter(({ edit, ghostText }) => edit !== void 0 && ghostText !== void 0);
        const edits = validEditsAndGhostTexts.map(({ edit }) => edit);
        const ghostTexts = validEditsAndGhostTexts.map(({ ghostText }) => ghostText);
        if (!ghostTexts[0]) {
          return void 0;
        }
        return { kind: "ghostText", edits, primaryGhostText: ghostTexts[0], ghostTexts, inlineSuggestion, suggestItem: void 0 };
      }
    });
    this.status = derived(this, (reader) => {
      if (this._source.loading.read(reader)) {
        return "loading";
      }
      const s = this.state.read(reader);
      if (s?.kind === "ghostText") {
        return "ghostText";
      }
      if (s?.kind === "inlineEdit") {
        return "inlineEdit";
      }
      return "noSuggestion";
    });
    this.inlineCompletionState = derived(this, (reader) => {
      const s = this.state.read(reader);
      if (!s || s.kind !== "ghostText") {
        return void 0;
      }
      if (this._editorObs.inComposition.read(reader)) {
        return void 0;
      }
      return s;
    });
    this.inlineEditState = derived(this, (reader) => {
      const s = this.state.read(reader);
      if (!s || s.kind !== "inlineEdit") {
        return void 0;
      }
      return s;
    });
    this.inlineEditAvailable = derived(this, (reader) => {
      const s = this.inlineEditState.read(reader);
      return !!s;
    });
    this.warning = derived(this, (reader) => {
      return this.inlineCompletionState.read(reader)?.inlineSuggestion?.warning;
    });
    this.ghostTexts = derivedOpts({ owner: this, equalsFn: ghostTextsOrReplacementsEqual }, (reader) => {
      const v = this.inlineCompletionState.read(reader);
      if (!v) {
        return void 0;
      }
      return v.ghostTexts;
    });
    this.primaryGhostText = derivedOpts({ owner: this, equalsFn: ghostTextOrReplacementEquals }, (reader) => {
      const v = this.inlineCompletionState.read(reader);
      if (!v) {
        return void 0;
      }
      return v?.primaryGhostText;
    });
    this.showCollapsed = derived(this, (reader) => {
      const state = this.state.read(reader);
      if (!state || state.kind !== "inlineEdit") {
        return false;
      }
      if (state.inlineSuggestion.hint || state.inlineSuggestion.action?.kind === "jumpTo") {
        return false;
      }
      const isCurrentModelVersion = state.inlineSuggestion.updatedEditModelVersion === this._textModelVersionId.read(reader);
      return (this._inlineEditsShowCollapsedEnabled.read(reader) || !isCurrentModelVersion) && this._jumpedToId.read(reader) !== state.inlineSuggestion.semanticId && !this._inAcceptFlow.read(reader);
    });
    this._tabShouldIndent = derived(this, (reader) => {
      if (this._inAcceptFlow.read(reader)) {
        return false;
      }
      function isMultiLine(range) {
        return range.startLineNumber !== range.endLineNumber;
      }
      function getNonIndentationRange(model, lineNumber) {
        const columnStart = model.getLineIndentColumn(lineNumber);
        const lastNonWsColumn = model.getLineLastNonWhitespaceColumn(lineNumber);
        const columnEnd = Math.max(lastNonWsColumn, columnStart);
        return new Range(lineNumber, columnStart, lineNumber, columnEnd);
      }
      const selections = this._editorObs.selections.read(reader);
      return selections?.some((s) => {
        if (s.isEmpty()) {
          return this.textModel.getLineLength(s.startLineNumber) === 0;
        } else {
          return isMultiLine(s) || s.containsRange(getNonIndentationRange(this.textModel, s.startLineNumber));
        }
      });
    });
    this.tabShouldJumpToInlineEdit = derived(this, (reader) => {
      if (this._tabShouldIndent.read(reader)) {
        return false;
      }
      const s = this.inlineEditState.read(reader);
      if (!s) {
        return false;
      }
      if (s.inlineSuggestion.action?.kind === "jumpTo") {
        return true;
      }
      if (this.showCollapsed.read(reader)) {
        return true;
      }
      if (this._inAcceptFlow.read(reader) && this._appearedInsideViewport.read(reader)) {
        return false;
      }
      return !s.cursorAtInlineEdit.read(reader);
    });
    this.tabShouldAcceptInlineEdit = derived(this, (reader) => {
      const s = this.inlineEditState.read(reader);
      if (!s) {
        return false;
      }
      if (s.inlineSuggestion.action?.kind === "jumpTo") {
        return false;
      }
      if (this.showCollapsed.read(reader)) {
        return false;
      }
      if (this._tabShouldIndent.read(reader)) {
        return false;
      }
      if (this._inAcceptFlow.read(reader) && this._appearedInsideViewport.read(reader)) {
        return true;
      }
      if (s.inlineSuggestion.targetRange.startLineNumber === this._editorObs.cursorLineNumber.read(reader)) {
        return true;
      }
      if (this._jumpedToId.read(reader) === s.inlineSuggestion.semanticId) {
        return true;
      }
      return s.cursorAtInlineEdit.read(reader);
    });
    this._jumpedToId = observableValue(this, void 0);
    this._inAcceptFlow = observableValue(this, false);
    this.inAcceptFlow = this._inAcceptFlow;
    this._source = this._register(this._instantiationService.createInstance(InlineCompletionsSource, this.textModel, this._textModelVersionId, this._debounceValue, this.primaryPosition, product.defaultChatAgent?.completionsEnablementSetting));
    this.lastTriggerKind = this._source.inlineCompletions.map(this, (v) => v?.request?.context.triggerKind);
    this._editorObs = observableCodeEditor(this._editor);
    const suggest = this._editorObs.getOption(EditorOption.suggest);
    this._suggestPreviewEnabled = suggest.map((v) => v.preview);
    this._suggestPreviewMode = suggest.map((v) => v.previewMode);
    const inlineSuggest = this._editorObs.getOption(EditorOption.inlineSuggest);
    this._inlineSuggestMode = inlineSuggest.map((v) => v.mode);
    this._suppressedInlineCompletionGroupIds = inlineSuggest.map((v) => new Set(v.experimental.suppressInlineSuggestions.split(",")));
    this._inlineEditsEnabled = inlineSuggest.map((v) => !!v.edits.enabled);
    this._inlineEditsShowCollapsedEnabled = inlineSuggest.map((s) => s.edits.showCollapsed);
    this._triggerCommandOnProviderChange = inlineSuggest.map((s) => s.triggerCommandOnProviderChange);
    this._minShowDelay = inlineSuggest.map((s) => s.minShowDelay);
    this._showOnSuggestConflict = inlineSuggest.map((s) => s.experimental.showOnSuggestConflict);
    this._suppressInSnippetMode = inlineSuggest.map((s) => s.suppressInSnippetMode);
    const snippetController = SnippetController2.get(this._editor);
    this._isInSnippetMode = snippetController?.isInSnippetObservable ?? constObservable(false);
    defaultAccountService.getDefaultAccount().then(createDisposableCb((account) => this.sku.set(skuFromAccount(account), void 0), this._store));
    this._register(defaultAccountService.onDidChangeDefaultAccount((account) => this.sku.set(skuFromAccount(account), void 0)));
    this._typing = this._register(new TypingInterval(this.textModel));
    this._register(this._inlineCompletionsService.onDidChangeIsSnoozing((isSnoozing) => {
      if (isSnoozing) {
        this.stop();
      }
    }));
    {
      const isNotebook = this.textModel.uri.scheme === Schemas.vscodeNotebookCell;
      const [diffEditor] = this._codeEditorService.listDiffEditors().filter((d) => d.getOriginalEditor().getId() === this._editor.getId() || d.getModifiedEditor().getId() === this._editor.getId());
      this.isInDiffEditor = !!diffEditor;
      this.editorType = isNotebook ? InlineCompletionEditorType.Notebook : this.isInDiffEditor ? InlineCompletionEditorType.DiffEditor : InlineCompletionEditorType.TextEditor;
    }
    this._register(recomputeInitiallyAndOnChange(this.state, (s) => {
      if (s && s.inlineSuggestion) {
        this._inlineCompletionsService.reportNewCompletion(s.inlineSuggestion.requestUuid);
      }
    }));
    this._register(recomputeInitiallyAndOnChange(this._fetchInlineCompletionsPromise));
    this._register(autorun((reader) => {
      this._editorObs.versionId.read(reader);
      this._inAcceptFlow.set(false, void 0);
    }));
    this._register(autorun((reader) => {
      const jumpToReset = this.state.map((s, reader2) => !s || s.kind === "inlineEdit" && !s.cursorAtInlineEdit.read(reader2)).read(reader);
      if (jumpToReset) {
        this._jumpedToId.set(void 0, void 0);
      }
    }));
    this._register(autorun((reader) => {
      const inlineSuggestion = this.state.map((s) => s?.inlineSuggestion).read(reader);
      if (inlineSuggestion) {
        inlineSuggestion.addPerformanceMarker("activeSuggestion");
      }
    }));
    const inlineEditSemanticId = this.inlineEditState.map((s) => s?.inlineSuggestion.semanticId);
    this._register(autorun((reader) => {
      const id = inlineEditSemanticId.read(reader);
      if (id) {
        this._editor.pushUndoStop();
        this._lastShownInlineCompletionInfo = {
          alternateTextModelVersionId: this.textModel.getAlternativeVersionId(),
          inlineCompletion: this.state.get().inlineSuggestion
        };
      }
    }));
    const inlineCompletionProviders = observableFromEvent(this._languageFeaturesService.inlineCompletionsProvider.onDidChange, () => this._languageFeaturesService.inlineCompletionsProvider.all(textModel));
    mapObservableArrayCached(this, inlineCompletionProviders, (provider, store) => {
      if (!provider.onDidChangeInlineCompletions) {
        return;
      }
      store.add(provider.onDidChangeInlineCompletions((changeHint) => {
        if (!this._enabled.get()) {
          return;
        }
        const activeEditor = this._codeEditorService.getFocusedCodeEditor() || this._codeEditorService.getActiveCodeEditor();
        if (activeEditor !== this._editor) {
          return;
        }
        if (this._triggerCommandOnProviderChange.get()) {
          this.trigger(void 0, { onlyFetchInlineEdits: true });
          return;
        }
        const activeState = this.state.get();
        if (activeState && (activeState.inlineSuggestion || activeState.edits) && activeState.inlineSuggestion?.source.provider !== provider) {
          return;
        }
        transaction((tx) => {
          this._fetchSpecificProviderSignal.trigger(tx, { provider, changeHint: changeHint ?? void 0 });
          this.trigger(tx);
        });
      }));
    }).recomputeInitiallyAndOnChange(this._store);
    this._didUndoInlineEdits.recomputeInitiallyAndOnChange(this._store);
  }
  get isAcceptingPartially() {
    return this._isAcceptingPartially;
  }
  get editor() {
    return this._editor;
  }
  debugGetSelectedSuggestItem() {
    return this._selectedSuggestItem;
  }
  getIndentationInfo(reader) {
    let startsWithIndentation = false;
    let startsWithIndentationLessThanTabSize = true;
    const ghostText = this?.primaryGhostText.read(reader);
    if (!!this?._selectedSuggestItem && ghostText && ghostText.parts.length > 0) {
      const { column, lines } = ghostText.parts[0];
      const firstLine = lines[0].line;
      const indentationEndColumn = this.textModel.getLineIndentColumn(ghostText.lineNumber);
      const inIndentation = column <= indentationEndColumn;
      if (inIndentation) {
        let firstNonWsIdx = firstNonWhitespaceIndex(firstLine);
        if (firstNonWsIdx === -1) {
          firstNonWsIdx = firstLine.length - 1;
        }
        startsWithIndentation = firstNonWsIdx > 0;
        const tabSize = this.textModel.getOptions().tabSize;
        const visibleColumnIndentation = CursorColumns.visibleColumnFromColumn(firstLine, firstNonWsIdx + 1, tabSize);
        startsWithIndentationLessThanTabSize = visibleColumnIndentation < tabSize;
      }
    }
    return {
      startsWithIndentation,
      startsWithIndentationLessThanTabSize
    };
  }
  _getReason(e) {
    if (e?.isUndoing) {
      return 0 /* Undo */;
    }
    if (e?.isRedoing) {
      return 1 /* Redo */;
    }
    if (this.isAcceptingPartially) {
      return 2 /* AcceptWord */;
    }
    return 3 /* Other */;
  }
  // TODO: This is not an ideal implementation of excludesGroupIds, however as this is currently still behind proposed API
  // and due to the time constraints, we are using a simplified approach
  getAvailableProviders(providers) {
    const suppressedProviderGroupIds = this._suppressedInlineCompletionGroupIds.get();
    const unsuppressedProviders = providers.filter((provider) => !(provider.groupId && suppressedProviderGroupIds.has(provider.groupId)));
    const excludedGroupIds = /* @__PURE__ */ new Set();
    for (const provider of unsuppressedProviders) {
      provider.excludesGroupIds?.forEach((p) => excludedGroupIds.add(p));
    }
    const availableProviders = [];
    for (const provider of unsuppressedProviders) {
      if (provider.groupId && excludedGroupIds.has(provider.groupId)) {
        continue;
      }
      availableProviders.push(provider);
    }
    return availableProviders;
  }
  async trigger(tx, options = {}) {
    subtransaction(tx, (tx2) => {
      if (options.onlyFetchInlineEdits) {
        this._onlyRequestInlineEditsSignal.trigger(tx2);
      }
      if (options.noDelay) {
        this._noDelaySignal.trigger(tx2);
      }
      this._isActive.set(true, tx2);
      if (options.explicit) {
        this._inAcceptFlow.set(true, tx2);
        this._forceUpdateExplicitlySignal.trigger(tx2);
      }
      if (options.provider) {
        this._fetchSpecificProviderSignal.trigger(tx2, { provider: options.provider, changeHint: options.changeHint });
      }
    });
    await this._fetchInlineCompletionsPromise.get();
  }
  async triggerExplicitly(tx, onlyFetchInlineEdits = false) {
    return this.trigger(tx, { onlyFetchInlineEdits, explicit: true });
  }
  stop(stopReason = "automatic", tx) {
    subtransaction(tx, (tx2) => {
      if (stopReason === "explicitCancel") {
        const inlineCompletion = this.state.get()?.inlineSuggestion;
        if (inlineCompletion) {
          inlineCompletion.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Rejected });
        }
      }
      this._isActive.set(false, tx2);
      this._source.clear(tx2);
    });
  }
  _computeAugmentation(suggestCompletion, reader) {
    const model = this.textModel;
    const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.read(reader);
    const candidateInlineCompletions = suggestWidgetInlineCompletions ? suggestWidgetInlineCompletions.inlineCompletions.filter((c) => !c.isInlineEdit) : [this.selectedInlineCompletion.read(reader)].filter(isDefined);
    const augmentedCompletion = mapFindFirst(candidateInlineCompletions, (completion) => {
      let r = completion.getSingleTextEdit();
      r = singleTextRemoveCommonPrefix(
        r,
        model,
        Range.fromPositions(r.range.getStartPosition(), suggestCompletion.range.getEndPosition())
      );
      return singleTextEditAugments(r, suggestCompletion) ? { completion, edit: r } : void 0;
    });
    return augmentedCompletion;
  }
  async _deltaSelectedInlineCompletionIndex(delta) {
    await this.triggerExplicitly();
    const completions = this._inlineCompletionItems.get() || [];
    if (completions.length > 0) {
      const newIdx = (this.selectedInlineCompletionIndex.get() + delta + completions.length) % completions.length;
      this._selectedInlineCompletionId.set(completions[newIdx].semanticId, void 0);
    } else {
      this._selectedInlineCompletionId.set(void 0, void 0);
    }
  }
  async next() {
    await this._deltaSelectedInlineCompletionIndex(1);
  }
  async previous() {
    await this._deltaSelectedInlineCompletionIndex(-1);
  }
  _getMetadata(completion, languageId, type = void 0) {
    if (type) {
      return EditSources.inlineCompletionPartialAccept({
        nes: completion.isInlineEdit,
        requestUuid: completion.requestUuid,
        providerId: completion.source.provider.providerId,
        languageId,
        type,
        correlationId: completion.getSourceCompletion().correlationId
      });
    } else {
      return EditSources.inlineCompletionAccept({
        nes: completion.isInlineEdit,
        requestUuid: completion.requestUuid,
        correlationId: completion.getSourceCompletion().correlationId,
        providerId: completion.source.provider.providerId,
        languageId
      });
    }
  }
  async accept(editor = this._editor, alternativeAction = false) {
    if (editor.getModel() !== this.textModel) {
      throw new BugIndicatingError();
    }
    let completion;
    let isNextEditUri = false;
    const state = this.state.get();
    if (state?.kind === "ghostText") {
      if (!state || state.primaryGhostText.isEmpty() || !state.inlineSuggestion) {
        return;
      }
      completion = state.inlineSuggestion;
    } else if (state?.kind === "inlineEdit") {
      completion = state.inlineSuggestion;
      isNextEditUri = !!state.nextEditUri;
    } else {
      return;
    }
    completion.addRef();
    try {
      let followUpTrigger = false;
      editor.pushUndoStop();
      if (!completion.originalTextRef.targets(this.textModel)) {
        const targetEditor = await this._codeEditorService.openCodeEditor({ resource: completion.originalTextRef.uri }, this._editor);
        if (targetEditor) {
          const controller = getInlineCompletionsController(targetEditor);
          const m = controller?.model.get();
          targetEditor.focus();
          m?.transplantCompletion(completion);
          targetEditor.revealLineInCenter(completion.targetRange.startLineNumber);
        }
      } else if (isNextEditUri) {
      } else if (completion.action?.kind === "edit") {
        const action = completion.action;
        if (alternativeAction && action.alternativeAction) {
          followUpTrigger = true;
          const altCommand = action.alternativeAction.command;
          await this._commandService.executeCommand(altCommand.id, ...altCommand.arguments || []).then(void 0, onUnexpectedExternalError);
        } else if (action.snippetInfo) {
          const mainEdit = TextReplacement.delete(action.textReplacement.range);
          const additionalEdits = completion.additionalTextEdits.map((e) => new TextReplacement(Range.lift(e.range), e.text ?? ""));
          const edit = TextEdit.fromParallelReplacementsUnsorted([mainEdit, ...additionalEdits]);
          editor.edit(edit, this._getMetadata(completion, this.textModel.getLanguageId()));
          editor.setPosition(action.snippetInfo.range.getStartPosition(), "inlineCompletionAccept");
          SnippetController2.get(editor)?.insert(action.snippetInfo.snippet, { undoStopBefore: false });
        } else {
          const edits = state.edits;
          let minimalEdits = edits;
          if (state.kind === "ghostText") {
            minimalEdits = removeTextReplacementCommonSuffixPrefix(edits, this.textModel);
          }
          const selections = getEndPositionsAfterApplying(minimalEdits).map((p) => Selection.fromPositions(p));
          const additionalEdits = completion.additionalTextEdits.map((e) => new TextReplacement(Range.lift(e.range), e.text ?? ""));
          const edit = TextEdit.fromParallelReplacementsUnsorted([...edits, ...additionalEdits]);
          editor.edit(edit, this._getMetadata(completion, this.textModel.getLanguageId()));
          if (completion.hint === void 0) {
            editor.setSelections(state.kind === "inlineEdit" ? selections.slice(-1) : selections, "inlineCompletionAccept");
          }
          if (state.kind === "inlineEdit" && !this._accessibilityService.isMotionReduced()) {
            const editRanges = edit.getNewRanges();
            const dec = this._store.add(new FadeoutDecoration(editor, editRanges, () => {
              this._store.delete(dec);
            }));
          }
        }
      }
      this._onDidAccept.fire();
      this.stop();
      if (completion.command) {
        await this._commandService.executeCommand(completion.command.id, ...completion.command.arguments || []).then(void 0, onUnexpectedExternalError);
      }
      if (followUpTrigger) {
        this.trigger(void 0);
      }
      completion.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Accepted, alternativeAction });
    } finally {
      completion.removeRef();
      this._inAcceptFlow.set(true, void 0);
      this._lastAcceptedInlineCompletionInfo = { textModelVersionIdAfter: this.textModel.getVersionId(), inlineCompletion: completion };
    }
  }
  async acceptNextWord() {
    await this._acceptNext(this._editor, "word", (pos, text) => {
      const langId = this.textModel.getLanguageIdAtPosition(pos.lineNumber, pos.column);
      const config = this._languageConfigurationService.getLanguageConfiguration(langId);
      const wordRegExp = new RegExp(config.wordDefinition.source, config.wordDefinition.flags.replace("g", ""));
      const m1 = text.match(wordRegExp);
      let acceptUntilIndexExclusive = 0;
      if (m1 && m1.index !== void 0) {
        if (m1.index === 0) {
          acceptUntilIndexExclusive = m1[0].length;
        } else {
          acceptUntilIndexExclusive = m1.index;
        }
      } else {
        acceptUntilIndexExclusive = text.length;
      }
      const wsRegExp = /\s+/g;
      const m2 = wsRegExp.exec(text);
      if (m2 && m2.index !== void 0) {
        if (m2.index + m2[0].length < acceptUntilIndexExclusive) {
          acceptUntilIndexExclusive = m2.index + m2[0].length;
        }
      }
      return acceptUntilIndexExclusive;
    }, PartialAcceptTriggerKind.Word);
  }
  async acceptNextLine() {
    await this._acceptNext(this._editor, "line", (pos, text) => {
      const m = text.match(/\n/);
      if (m && m.index !== void 0) {
        return m.index + 1;
      }
      return text.length;
    }, PartialAcceptTriggerKind.Line);
  }
  async _acceptNext(editor, type, getAcceptUntilIndex, kind) {
    if (editor.getModel() !== this.textModel) {
      throw new BugIndicatingError();
    }
    const state = this.inlineCompletionState.get();
    if (!state || state.primaryGhostText.isEmpty() || !state.inlineSuggestion) {
      return;
    }
    const ghostText = state.primaryGhostText;
    const completion = state.inlineSuggestion;
    if (completion.snippetInfo) {
      await this.accept(editor);
      return;
    }
    const firstPart = ghostText.parts[0];
    const ghostTextPos = new Position(ghostText.lineNumber, firstPart.column);
    const ghostTextVal = firstPart.text;
    const acceptUntilIndexExclusive = getAcceptUntilIndex(ghostTextPos, ghostTextVal);
    if (acceptUntilIndexExclusive === ghostTextVal.length && ghostText.parts.length === 1) {
      this.accept(editor);
      return;
    }
    const partialGhostTextVal = ghostTextVal.substring(0, acceptUntilIndexExclusive);
    const positions = this._positions.get();
    const cursorPosition = positions[0];
    completion.addRef();
    try {
      this._isAcceptingPartially = true;
      try {
        editor.pushUndoStop();
        const replaceRange = Range.fromPositions(cursorPosition, ghostTextPos);
        const newText = editor.getModel().getValueInRange(replaceRange) + partialGhostTextVal;
        const primaryEdit = new TextReplacement(replaceRange, newText);
        const edits = [primaryEdit, ...getSecondaryEdits(this.textModel, positions, primaryEdit)].filter(isDefined);
        const selections = getEndPositionsAfterApplying(edits).map((p) => Selection.fromPositions(p));
        editor.edit(TextEdit.fromParallelReplacementsUnsorted(edits), this._getMetadata(completion, this.textModel.getLanguageId(), type));
        editor.setSelections(selections, "inlineCompletionPartialAccept");
        editor.revealPositionInCenterIfOutsideViewport(editor.getPosition(), ScrollType.Smooth);
      } finally {
        this._isAcceptingPartially = false;
      }
      const acceptedRange = Range.fromPositions(completion.editRange.getStartPosition(), TextLength.ofText(partialGhostTextVal).addToPosition(ghostTextPos));
      const text = editor.getModel().getValueInRange(acceptedRange, EndOfLinePreference.LF);
      const acceptedLength = text.length;
      completion.reportPartialAccept(
        acceptedLength,
        { kind, acceptedLength },
        { characters: acceptUntilIndexExclusive, ratio: acceptUntilIndexExclusive / ghostTextVal.length, count: 1 }
      );
    } finally {
      completion.removeRef();
    }
  }
  handleSuggestAccepted(item) {
    const itemEdit = singleTextRemoveCommonPrefix(item.getSingleTextEdit(), this.textModel);
    const augmentedCompletion = this._computeAugmentation(itemEdit, void 0);
    if (!augmentedCompletion) {
      return;
    }
    const alreadyAcceptedLength = this.textModel.getValueInRange(augmentedCompletion.completion.editRange, EndOfLinePreference.LF).length;
    const acceptedLength = alreadyAcceptedLength + itemEdit.text.length;
    augmentedCompletion.completion.reportPartialAccept(itemEdit.text.length, {
      kind: PartialAcceptTriggerKind.Suggest,
      acceptedLength
    }, {
      characters: itemEdit.text.length,
      count: 1,
      ratio: 1
    });
  }
  extractReproSample() {
    const value = this.textModel.getValue();
    const item = this.state.get()?.inlineSuggestion;
    return {
      documentValue: value,
      inlineCompletion: item?.getSourceCompletion()
    };
  }
  jump() {
    const s = this.inlineEditState.get();
    if (!s) {
      return;
    }
    const suggestion = s.inlineSuggestion;
    if (!suggestion.originalTextRef.targets(this.textModel)) {
      this.accept(this._editor);
      return;
    }
    suggestion.addRef();
    try {
      transaction((tx) => {
        if (suggestion.action?.kind === "jumpTo") {
          this.stop(void 0, tx);
          suggestion.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Accepted, alternativeAction: false });
        }
        this._jumpedToId.set(s.inlineSuggestion.semanticId, tx);
        this.dontRefetchSignal.trigger(tx);
        const targetRange = s.inlineSuggestion.targetRange;
        const targetPosition = targetRange.getStartPosition();
        this._editor.setPosition(targetPosition, "inlineCompletions.jump");
        const isSingleLineChange = targetRange.isSingleLine() && (s.inlineSuggestion.hint || s.inlineSuggestion.action?.kind === "edit" && !s.inlineSuggestion.action.textReplacement.text.includes("\n"));
        if (isSingleLineChange || s.inlineSuggestion.action?.kind === "jumpTo") {
          this._editor.revealPosition(targetPosition, ScrollType.Smooth);
        } else {
          const revealRange = new Range(targetRange.startLineNumber - 1, 1, targetRange.endLineNumber + 1, 1);
          this._editor.revealRange(revealRange, ScrollType.Smooth);
        }
        s.inlineSuggestion.identity.setJumpTo(tx);
        this._editor.focus();
      });
    } finally {
      suggestion.removeRef();
    }
  }
  async handleInlineSuggestionShown(inlineCompletion, viewKind, viewData, timeWhenShown) {
    await inlineCompletion.reportInlineEditShown(this._commandService, viewKind, viewData, this.textModel, timeWhenShown);
  }
  /**
   * Transplants an inline completion from another model to this one.
   * Used for cross-file inline edits.
   */
  transplantCompletion(item) {
    transaction((tx) => {
      this._source.seedWithCompletion(item, tx);
      this._isActive.set(true, tx);
      this._inAcceptFlow.set(true, tx);
      this.dontRefetchSignal.trigger(tx);
    });
  }
};
InlineCompletionsModel = __decorateClass([
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, ILanguageConfigurationService),
  __decorateParam(11, IAccessibilityService),
  __decorateParam(12, ILanguageFeaturesService),
  __decorateParam(13, ICodeEditorService),
  __decorateParam(14, IInlineCompletionsService),
  __decorateParam(15, IDefaultAccountService)
], InlineCompletionsModel);
var VersionIdChangeReason = /* @__PURE__ */ ((VersionIdChangeReason2) => {
  VersionIdChangeReason2[VersionIdChangeReason2["Undo"] = 0] = "Undo";
  VersionIdChangeReason2[VersionIdChangeReason2["Redo"] = 1] = "Redo";
  VersionIdChangeReason2[VersionIdChangeReason2["AcceptWord"] = 2] = "AcceptWord";
  VersionIdChangeReason2[VersionIdChangeReason2["Other"] = 3] = "Other";
  return VersionIdChangeReason2;
})(VersionIdChangeReason || {});
function getSecondaryEdits(textModel, positions, primaryTextRepl) {
  if (positions.length === 1) {
    return [];
  }
  const text = new TextModelText(textModel);
  const textTransformer = text.getTransformer();
  const primaryOffset = textTransformer.getOffset(positions[0]);
  const secondaryOffsets = positions.slice(1).map((pos) => textTransformer.getOffset(pos));
  primaryTextRepl = primaryTextRepl.removeCommonPrefixAndSuffix(text);
  const primaryStringRepl = textTransformer.getStringReplacement(primaryTextRepl);
  const deltaFromOffsetToRangeStart = primaryStringRepl.replaceRange.start - primaryOffset;
  const primaryContextRange = primaryStringRepl.replaceRange.join(OffsetRange.emptyAt(primaryOffset));
  const primaryContextValue = text.getValueOfOffsetRange(primaryContextRange);
  const replacements = secondaryOffsets.map((secondaryOffset) => {
    const newRangeStart = secondaryOffset + deltaFromOffsetToRangeStart;
    const newRangeEnd = newRangeStart + primaryStringRepl.replaceRange.length;
    const range = new OffsetRange(newRangeStart, newRangeEnd);
    const contextRange = range.join(OffsetRange.emptyAt(secondaryOffset));
    const contextValue = text.getValueOfOffsetRange(contextRange);
    if (contextValue !== primaryContextValue) {
      return void 0;
    }
    const stringRepl = new StringReplacement(range, primaryStringRepl.newText);
    const repl = textTransformer.getTextReplacement(stringRepl);
    return repl;
  }).filter(isDefined);
  return replacements;
}
class FadeoutDecoration extends Disposable {
  constructor(editor, ranges, onDispose) {
    super();
    if (onDispose) {
      this._register({ dispose: () => onDispose() });
    }
    this._register(observableCodeEditor(editor).setDecorations(constObservable(ranges.map((range) => ({
      range,
      options: {
        description: "animation",
        className: "edits-fadeout-decoration",
        zIndex: 1
      }
    })))));
    const val = new ObservableAnimatedValue(AnimatedValue.startNow(1, 0, 1e3, easeOutCubic));
    this._register(autorun((reader) => {
      const opacity = val.getValue(reader);
      editor.getContainerDomNode().style.setProperty("--animation-opacity", opacity.toString());
      if (val.isFinished(reader)) {
        this.dispose();
      }
    }));
  }
}
function isSuggestionInViewport(editor, suggestion, reader = void 0) {
  const targetRange = suggestion.targetRange;
  observableCodeEditor(editor).scrollTop.read(reader);
  const visibleRanges = editor.getVisibleRanges();
  if (visibleRanges.length < 1) {
    return false;
  }
  const viewportRange = new Range(
    visibleRanges[0].startLineNumber,
    visibleRanges[0].startColumn,
    visibleRanges[visibleRanges.length - 1].endLineNumber,
    visibleRanges[visibleRanges.length - 1].endColumn
  );
  return viewportRange.containsRange(targetRange);
}
function skuFromAccount(account) {
  if (account?.entitlementsData?.access_type_sku && account?.entitlementsData?.copilot_plan) {
    return { type: account.entitlementsData.access_type_sku, plan: account.entitlementsData.copilot_plan };
  }
  return void 0;
}
class DisposableCallback {
  constructor(cb) {
    this.handler = (val) => {
      return this._cb?.(val);
    };
    this._cb = cb;
  }
  dispose() {
    this._cb = void 0;
  }
}
function createDisposableCb(cb, store) {
  const dcb = new DisposableCallback(cb);
  store.add(dcb);
  return dcb.handler;
}
export {
  InlineCompletionsModel,
  VersionIdChangeReason,
  getSecondaryEdits,
  isSuggestionInViewport
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFxtb2RlbFxcaW5saW5lQ29tcGxldGlvbnNNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1hcEZpbmRGaXJzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgYXJyYXlFcXVhbHNDIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciwgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2UsIElSZWFkZXIsIElUcmFuc2FjdGlvbiwgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBkZXJpdmVkSGFuZGxlQ2hhbmdlcywgZGVyaXZlZE9wdHMsIG1hcE9ic2VydmFibGVBcnJheUNhY2hlZCwgb2JzZXJ2YWJsZUZyb21FdmVudCwgb2JzZXJ2YWJsZVNpZ25hbCwgb2JzZXJ2YWJsZVZhbHVlLCByZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSwgc3VidHJhbnNhY3Rpb24sIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBmaXJzdE5vbldoaXRlc3BhY2VJbmRleCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29sdW1ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2N1cnNvckNvbHVtbnMuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IFRleHRSZXBsYWNlbWVudCwgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9lZGl0cy90ZXh0RWRpdC5qcyc7XG5pbXBvcnQgeyBUZXh0TGVuZ3RoIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvdGV4dC90ZXh0TGVuZ3RoLmpzJztcbmltcG9ydCB7IFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElJbmxpbmVDb21wbGV0aW9uQ2hhbmdlSGludCwgSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQsIElubGluZUNvbXBsZXRpb24sIElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZCwgUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kLCBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyLCBJbmxpbmVDb21wbGV0aW9uQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UsIElNb2RlbERlbHRhRGVjb3JhdGlvbiwgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbFRleHQuanMnO1xuaW1wb3J0IHsgSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZURlYm91bmNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsRXZlbnRzLmpzJztcbmltcG9ydCB7IFNuaXBwZXRDb250cm9sbGVyMiB9IGZyb20gJy4uLy4uLy4uL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIuanMnO1xuaW1wb3J0IHsgZ2V0RW5kUG9zaXRpb25zQWZ0ZXJBcHBseWluZywgcmVtb3ZlVGV4dFJlcGxhY2VtZW50Q29tbW9uU3VmZml4UHJlZml4IH0gZnJvbSAnLi4vdXRpbHMuanMnO1xuaW1wb3J0IHsgQW5pbWF0ZWRWYWx1ZSwgZWFzZU91dEN1YmljLCBPYnNlcnZhYmxlQW5pbWF0ZWRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9hbmltYXRlZFZhbHVlLmpzJztcbmltcG9ydCB7IGNvbXB1dGVHaG9zdFRleHQgfSBmcm9tICcuL2NvbXB1dGVHaG9zdFRleHQuanMnO1xuaW1wb3J0IHsgR2hvc3RUZXh0LCBHaG9zdFRleHRPclJlcGxhY2VtZW50LCBnaG9zdFRleHRPclJlcGxhY2VtZW50RXF1YWxzLCBnaG9zdFRleHRzT3JSZXBsYWNlbWVudHNFcXVhbCB9IGZyb20gJy4vZ2hvc3RUZXh0LmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25zU291cmNlIH0gZnJvbSAnLi9pbmxpbmVDb21wbGV0aW9uc1NvdXJjZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uSXRlbSwgSW5saW5lRWRpdEl0ZW0sIElubGluZVN1Z2dlc3Rpb25JdGVtIH0gZnJvbSAnLi9pbmxpbmVTdWdnZXN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uQ29udGV4dFdpdGhvdXRVdWlkLCBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZSwgSW5saW5lU3VnZ2VzdFJlcXVlc3RJbmZvLCBJbmxpbmVTdWdnZXN0U2t1IH0gZnJvbSAnLi9wcm92aWRlSW5saW5lQ29tcGxldGlvbnMuanMnO1xuaW1wb3J0IHsgc2luZ2xlVGV4dEVkaXRBdWdtZW50cywgc2luZ2xlVGV4dFJlbW92ZUNvbW1vblByZWZpeCB9IGZyb20gJy4vc2luZ2xlVGV4dEVkaXRIZWxwZXJzLmpzJztcbmltcG9ydCB7IFN1Z2dlc3RJdGVtSW5mbyB9IGZyb20gJy4vc3VnZ2VzdFdpZGdldEFkYXB0ZXIuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsRWRpdFNvdXJjZSwgRWRpdFNvdXJjZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25WaWV3RGF0YSwgSW5saW5lQ29tcGxldGlvblZpZXdLaW5kIH0gZnJvbSAnLi4vdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdJbnRlcmZhY2UuanMnO1xuaW1wb3J0IHsgSUlubGluZUNvbXBsZXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvaW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFR5cGluZ0ludGVydmFsIH0gZnJvbSAnLi90eXBpbmdTcGVlZC5qcyc7XG5pbXBvcnQgeyBTdHJpbmdSZXBsYWNlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3N0cmluZ0VkaXQuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZ2V0SW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyIH0gZnJvbSAnLi4vY29udHJvbGxlci9jb21tb24uanMnO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lQ29tcGxldGlvbnNNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zb3VyY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzQWN0aXZlID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KHRoaXMsIGZhbHNlKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25seVJlcXVlc3RJbmxpbmVFZGl0c1NpZ25hbCA9IG9ic2VydmFibGVTaWduYWwodGhpcyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZvcmNlVXBkYXRlRXhwbGljaXRseVNpZ25hbCA9IG9ic2VydmFibGVTaWduYWwodGhpcyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25vRGVsYXlTaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsKHRoaXMpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZldGNoU3BlY2lmaWNQcm92aWRlclNpZ25hbCA9IG9ic2VydmFibGVTaWduYWw8eyBwcm92aWRlcjogSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcjsgY2hhbmdlSGludD86IElJbmxpbmVDb21wbGV0aW9uQ2hhbmdlSGludCB9IHwgdW5kZWZpbmVkPih0aGlzKTtcblxuXHQvLyBXZSB1c2UgYSBzZW1hbnRpYyBpZCB0byBrZWVwIHRoZSBzYW1lIGlubGluZSBjb21wbGV0aW9uIHNlbGVjdGVkIGV2ZW4gaWYgdGhlIHByb3ZpZGVyIHJlb3JkZXJzIHRoZSBjb21wbGV0aW9ucy5cblx0cHJpdmF0ZSByZWFkb25seSBfc2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uSWQgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJpbWFyeVBvc2l0aW9uID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fcG9zaXRpb25zLnJlYWQocmVhZGVyKVswXSA/PyBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgYWxsUG9zaXRpb25zID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fcG9zaXRpb25zLnJlYWQocmVhZGVyKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBza3UgPSBvYnNlcnZhYmxlVmFsdWU8SW5saW5lU3VnZ2VzdFNrdSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblxuXHRwcml2YXRlIF9pc0FjY2VwdGluZ1BhcnRpYWxseSA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hcHBlYXJlZEluc2lkZVZpZXdwb3J0ID0gZGVyaXZlZDxib29sZWFuPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzdGF0ZSB8fCAhc3RhdGUuaW5saW5lU3VnZ2VzdGlvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBpc1N1Z2dlc3Rpb25JblZpZXdwb3J0KHRoaXMuX2VkaXRvciwgc3RhdGUuaW5saW5lU3VnZ2VzdGlvbiwgcmVhZGVyKTtcblx0fSk7XG5cdHB1YmxpYyBnZXQgaXNBY2NlcHRpbmdQYXJ0aWFsbHkoKSB7IHJldHVybiB0aGlzLl9pc0FjY2VwdGluZ1BhcnRpYWxseTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWNjZXB0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZEFjY2VwdCA9IHRoaXMuX29uRGlkQWNjZXB0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvck9icztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90eXBpbmc6IFR5cGluZ0ludGVydmFsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1Z2dlc3RQcmV2aWV3RW5hYmxlZDtcblx0cHJpdmF0ZSByZWFkb25seSBfc3VnZ2VzdFByZXZpZXdNb2RlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVTdWdnZXN0TW9kZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3VwcHJlc3NlZElubGluZUNvbXBsZXRpb25Hcm91cElkcztcblx0cHJpdmF0ZSByZWFkb25seSBfaW5saW5lRWRpdHNFbmFibGVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVFZGl0c1Nob3dDb2xsYXBzZWRFbmFibGVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmlnZ2VyQ29tbWFuZE9uUHJvdmlkZXJDaGFuZ2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21pblNob3dEZWxheTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2hvd09uU3VnZ2VzdENvbmZsaWN0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdXBwcmVzc0luU25pcHBldE1vZGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzSW5TbmlwcGV0TW9kZTtcblxuXHRnZXQgZWRpdG9yKCkge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3I7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdGV4dE1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGVkU3VnZ2VzdEl0ZW06IElPYnNlcnZhYmxlPFN1Z2dlc3RJdGVtSW5mbyB8IHVuZGVmaW5lZD4sXG5cdFx0cHVibGljIHJlYWRvbmx5IF90ZXh0TW9kZWxWZXJzaW9uSWQ6IElPYnNlcnZhYmxlV2l0aENoYW5nZTxudW1iZXIgfCBudWxsLCBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50IHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wb3NpdGlvbnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IFBvc2l0aW9uW10+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlYm91bmNlVmFsdWU6IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lbmFibGVkOiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pc1N1cHByZXNzZWQ6ICgpID0+IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUlubGluZUNvbXBsZXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVDb21wbGV0aW9uc1NlcnZpY2U6IElJbmxpbmVDb21wbGV0aW9uc1NlcnZpY2UsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgZGVmYXVsdEFjY291bnRTZXJ2aWNlOiBJRGVmYXVsdEFjY291bnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3NvdXJjZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubGluZUNvbXBsZXRpb25zU291cmNlLCB0aGlzLnRleHRNb2RlbCwgdGhpcy5fdGV4dE1vZGVsVmVyc2lvbklkLCB0aGlzLl9kZWJvdW5jZVZhbHVlLCB0aGlzLnByaW1hcnlQb3NpdGlvbiwgcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5jb21wbGV0aW9uc0VuYWJsZW1lbnRTZXR0aW5nKSk7XG5cdFx0dGhpcy5sYXN0VHJpZ2dlcktpbmQgPSB0aGlzLl9zb3VyY2UuaW5saW5lQ29tcGxldGlvbnMubWFwKHRoaXMsIHYgPT4gdj8ucmVxdWVzdD8uY29udGV4dC50cmlnZ2VyS2luZCk7XG5cblx0XHR0aGlzLl9lZGl0b3JPYnMgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcih0aGlzLl9lZGl0b3IpO1xuXG5cdFx0Y29uc3Qgc3VnZ2VzdCA9IHRoaXMuX2VkaXRvck9icy5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3QpO1xuXHRcdHRoaXMuX3N1Z2dlc3RQcmV2aWV3RW5hYmxlZCA9IHN1Z2dlc3QubWFwKHYgPT4gdi5wcmV2aWV3KTtcblx0XHR0aGlzLl9zdWdnZXN0UHJldmlld01vZGUgPSBzdWdnZXN0Lm1hcCh2ID0+IHYucHJldmlld01vZGUpO1xuXG5cdFx0Y29uc3QgaW5saW5lU3VnZ2VzdCA9IHRoaXMuX2VkaXRvck9icy5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmlubGluZVN1Z2dlc3QpO1xuXHRcdHRoaXMuX2lubGluZVN1Z2dlc3RNb2RlID0gaW5saW5lU3VnZ2VzdC5tYXAodiA9PiB2Lm1vZGUpO1xuXHRcdHRoaXMuX3N1cHByZXNzZWRJbmxpbmVDb21wbGV0aW9uR3JvdXBJZHMgPSBpbmxpbmVTdWdnZXN0Lm1hcCh2ID0+IG5ldyBTZXQodi5leHBlcmltZW50YWwuc3VwcHJlc3NJbmxpbmVTdWdnZXN0aW9ucy5zcGxpdCgnLCcpKSk7XG5cdFx0dGhpcy5faW5saW5lRWRpdHNFbmFibGVkID0gaW5saW5lU3VnZ2VzdC5tYXAodiA9PiAhIXYuZWRpdHMuZW5hYmxlZCk7XG5cdFx0dGhpcy5faW5saW5lRWRpdHNTaG93Q29sbGFwc2VkRW5hYmxlZCA9IGlubGluZVN1Z2dlc3QubWFwKHMgPT4gcy5lZGl0cy5zaG93Q29sbGFwc2VkKTtcblx0XHR0aGlzLl90cmlnZ2VyQ29tbWFuZE9uUHJvdmlkZXJDaGFuZ2UgPSBpbmxpbmVTdWdnZXN0Lm1hcChzID0+IHMudHJpZ2dlckNvbW1hbmRPblByb3ZpZGVyQ2hhbmdlKTtcblx0XHR0aGlzLl9taW5TaG93RGVsYXkgPSBpbmxpbmVTdWdnZXN0Lm1hcChzID0+IHMubWluU2hvd0RlbGF5KTtcblx0XHR0aGlzLl9zaG93T25TdWdnZXN0Q29uZmxpY3QgPSBpbmxpbmVTdWdnZXN0Lm1hcChzID0+IHMuZXhwZXJpbWVudGFsLnNob3dPblN1Z2dlc3RDb25mbGljdCk7XG5cdFx0dGhpcy5fc3VwcHJlc3NJblNuaXBwZXRNb2RlID0gaW5saW5lU3VnZ2VzdC5tYXAocyA9PiBzLnN1cHByZXNzSW5TbmlwcGV0TW9kZSk7XG5cblx0XHRjb25zdCBzbmlwcGV0Q29udHJvbGxlciA9IFNuaXBwZXRDb250cm9sbGVyMi5nZXQodGhpcy5fZWRpdG9yKTtcblx0XHR0aGlzLl9pc0luU25pcHBldE1vZGUgPSBzbmlwcGV0Q29udHJvbGxlcj8uaXNJblNuaXBwZXRPYnNlcnZhYmxlID8/IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSk7XG5cblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2UuZ2V0RGVmYXVsdEFjY291bnQoKS50aGVuKGNyZWF0ZURpc3Bvc2FibGVDYihhY2NvdW50ID0+IHRoaXMuc2t1LnNldChza3VGcm9tQWNjb3VudChhY2NvdW50KSwgdW5kZWZpbmVkKSwgdGhpcy5fc3RvcmUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihkZWZhdWx0QWNjb3VudFNlcnZpY2Uub25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudChhY2NvdW50ID0+IHRoaXMuc2t1LnNldChza3VGcm9tQWNjb3VudChhY2NvdW50KSwgdW5kZWZpbmVkKSkpO1xuXG5cdFx0dGhpcy5fdHlwaW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IFR5cGluZ0ludGVydmFsKHRoaXMudGV4dE1vZGVsKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbmxpbmVDb21wbGV0aW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VJc1Nub296aW5nKChpc1Nub296aW5nKSA9PiB7XG5cdFx0XHRpZiAoaXNTbm9vemluZykge1xuXHRcdFx0XHR0aGlzLnN0b3AoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR7IC8vIERldGVybWluZSBlZGl0b3IgdHlwZVxuXHRcdFx0Y29uc3QgaXNOb3RlYm9vayA9IHRoaXMudGV4dE1vZGVsLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsO1xuXHRcdFx0Y29uc3QgW2RpZmZFZGl0b3JdID0gdGhpcy5fY29kZUVkaXRvclNlcnZpY2UubGlzdERpZmZFZGl0b3JzKClcblx0XHRcdFx0LmZpbHRlcihkID0+XG5cdFx0XHRcdFx0ZC5nZXRPcmlnaW5hbEVkaXRvcigpLmdldElkKCkgPT09IHRoaXMuX2VkaXRvci5nZXRJZCgpIHx8XG5cdFx0XHRcdFx0ZC5nZXRNb2RpZmllZEVkaXRvcigpLmdldElkKCkgPT09IHRoaXMuX2VkaXRvci5nZXRJZCgpKTtcblxuXHRcdFx0dGhpcy5pc0luRGlmZkVkaXRvciA9ICEhZGlmZkVkaXRvcjtcblx0XHRcdHRoaXMuZWRpdG9yVHlwZSA9IGlzTm90ZWJvb2sgPyBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZS5Ob3RlYm9va1xuXHRcdFx0XHQ6IHRoaXMuaXNJbkRpZmZFZGl0b3IgPyBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZS5EaWZmRWRpdG9yXG5cdFx0XHRcdFx0OiBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZS5UZXh0RWRpdG9yO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuc3RhdGUsIChzKSA9PiB7XG5cdFx0XHRpZiAocyAmJiBzLmlubGluZVN1Z2dlc3Rpb24pIHtcblx0XHRcdFx0dGhpcy5faW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLnJlcG9ydE5ld0NvbXBsZXRpb24ocy5pbmxpbmVTdWdnZXN0aW9uLnJlcXVlc3RVdWlkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9mZXRjaElubGluZUNvbXBsZXRpb25zUHJvbWlzZSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fZWRpdG9yT2JzLnZlcnNpb25JZC5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9pbkFjY2VwdEZsb3cuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGp1bXBUb1Jlc2V0ID0gdGhpcy5zdGF0ZS5tYXAoKHMsIHJlYWRlcikgPT4gIXMgfHwgcy5raW5kID09PSAnaW5saW5lRWRpdCcgJiYgIXMuY3Vyc29yQXRJbmxpbmVFZGl0LnJlYWQocmVhZGVyKSkucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGp1bXBUb1Jlc2V0KSB7XG5cdFx0XHRcdHRoaXMuX2p1bXBlZFRvSWQuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpbmxpbmVTdWdnZXN0aW9uID0gdGhpcy5zdGF0ZS5tYXAocyA9PiBzPy5pbmxpbmVTdWdnZXN0aW9uKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoaW5saW5lU3VnZ2VzdGlvbikge1xuXHRcdFx0XHRpbmxpbmVTdWdnZXN0aW9uLmFkZFBlcmZvcm1hbmNlTWFya2VyKCdhY3RpdmVTdWdnZXN0aW9uJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5saW5lRWRpdFNlbWFudGljSWQgPSB0aGlzLmlubGluZUVkaXRTdGF0ZS5tYXAocyA9PiBzPy5pbmxpbmVTdWdnZXN0aW9uLnNlbWFudGljSWQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaWQgPSBpbmxpbmVFZGl0U2VtYW50aWNJZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoaWQpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdFx0XHR0aGlzLl9sYXN0U2hvd25JbmxpbmVDb21wbGV0aW9uSW5mbyA9IHtcblx0XHRcdFx0XHRhbHRlcm5hdGVUZXh0TW9kZWxWZXJzaW9uSWQ6IHRoaXMudGV4dE1vZGVsLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCksXG5cdFx0XHRcdFx0aW5saW5lQ29tcGxldGlvbjogdGhpcy5zdGF0ZS5nZXQoKSEuaW5saW5lU3VnZ2VzdGlvbiEsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVE9ETzogc2hvdWxkIHVzZSBnZXRBdmFpbGFibGVQcm92aWRlcnMgYW5kIHVwZGF0ZSBvbiBfc3VwcHJlc3NlZElubGluZUNvbXBsZXRpb25Hcm91cElkcyBjaGFuZ2Vcblx0XHRjb25zdCBpbmxpbmVDb21wbGV0aW9uUHJvdmlkZXJzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyLm9uRGlkQ2hhbmdlLCAoKSA9PiB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyLmFsbCh0ZXh0TW9kZWwpKTtcblx0XHRtYXBPYnNlcnZhYmxlQXJyYXlDYWNoZWQodGhpcywgaW5saW5lQ29tcGxldGlvblByb3ZpZGVycywgKHByb3ZpZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0aWYgKCFwcm92aWRlci5vbkRpZENoYW5nZUlubGluZUNvbXBsZXRpb25zKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0c3RvcmUuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlSW5saW5lQ29tcGxldGlvbnMoY2hhbmdlSGludCA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5fZW5hYmxlZC5nZXQoKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE9ubHkgdXBkYXRlIHRoZSBhY3RpdmUgZWRpdG9yXG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLmdldEZvY3VzZWRDb2RlRWRpdG9yKCkgfHwgdGhpcy5fY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdFx0XHRpZiAoYWN0aXZlRWRpdG9yICE9PSB0aGlzLl9lZGl0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5fdHJpZ2dlckNvbW1hbmRPblByb3ZpZGVyQ2hhbmdlLmdldCgpKSB7XG5cdFx0XHRcdFx0Ly8gVE9ET0BoZWRpZXQgcmVtb3ZlIHRoaXMgYW5kIGFsd2F5cyBkbyB0aGUgZWxzZSBicmFuY2guXG5cdFx0XHRcdFx0dGhpcy50cmlnZ2VyKHVuZGVmaW5lZCwgeyBvbmx5RmV0Y2hJbmxpbmVFZGl0czogdHJ1ZSB9KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXG5cdFx0XHRcdC8vIElmIHRoZXJlIGlzIGFuIGFjdGl2ZSBzdWdnZXN0aW9uIGZyb20gYSBkaWZmZXJlbnQgcHJvdmlkZXIsIHdlIGlnbm9yZSB0aGUgdXBkYXRlXG5cdFx0XHRcdGNvbnN0IGFjdGl2ZVN0YXRlID0gdGhpcy5zdGF0ZS5nZXQoKTtcblx0XHRcdFx0aWYgKGFjdGl2ZVN0YXRlICYmIChhY3RpdmVTdGF0ZS5pbmxpbmVTdWdnZXN0aW9uIHx8IGFjdGl2ZVN0YXRlLmVkaXRzKSAmJiBhY3RpdmVTdGF0ZS5pbmxpbmVTdWdnZXN0aW9uPy5zb3VyY2UucHJvdmlkZXIgIT09IHByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2ZldGNoU3BlY2lmaWNQcm92aWRlclNpZ25hbC50cmlnZ2VyKHR4LCB7IHByb3ZpZGVyLCBjaGFuZ2VIaW50OiBjaGFuZ2VIaW50ID8/IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0XHR0aGlzLnRyaWdnZXIodHgpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0fSkpO1xuXHRcdH0pLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdHRoaXMuX2RpZFVuZG9JbmxpbmVFZGl0cy5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cdH1cblxuXHRwcml2YXRlIF9sYXN0U2hvd25JbmxpbmVDb21wbGV0aW9uSW5mbzogeyBhbHRlcm5hdGVUZXh0TW9kZWxWZXJzaW9uSWQ6IG51bWJlcjsgLyogYWxyZWFkeSBmcmVlZCEgKi8gaW5saW5lQ29tcGxldGlvbjogSW5saW5lU3VnZ2VzdGlvbkl0ZW0gfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdEFjY2VwdGVkSW5saW5lQ29tcGxldGlvbkluZm86IHsgdGV4dE1vZGVsVmVyc2lvbklkQWZ0ZXI6IG51bWJlcjsgLyogYWxyZWFkeSBmcmVlZCEgKi8gaW5saW5lQ29tcGxldGlvbjogSW5saW5lU3VnZ2VzdGlvbkl0ZW0gfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlkVW5kb0lubGluZUVkaXRzID0gZGVyaXZlZEhhbmRsZUNoYW5nZXMoe1xuXHRcdG93bmVyOiB0aGlzLFxuXHRcdGNoYW5nZVRyYWNrZXI6IHtcblx0XHRcdGNyZWF0ZUNoYW5nZVN1bW1hcnk6ICgpID0+ICh7IGRpZFVuZG86IGZhbHNlIH0pLFxuXHRcdFx0aGFuZGxlQ2hhbmdlOiAoY3R4LCBjaGFuZ2VTdW1tYXJ5KSA9PiB7XG5cdFx0XHRcdGNoYW5nZVN1bW1hcnkuZGlkVW5kbyA9IGN0eC5kaWRDaGFuZ2UodGhpcy5fdGV4dE1vZGVsVmVyc2lvbklkKSAmJiAhIWN0eC5jaGFuZ2U/LmlzVW5kb2luZztcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9LCAocmVhZGVyLCBjaGFuZ2VTdW1tYXJ5KSA9PiB7XG5cdFx0Y29uc3QgdmVyc2lvbklkID0gdGhpcy5fdGV4dE1vZGVsVmVyc2lvbklkLnJlYWQocmVhZGVyKTtcblx0XHRpZiAodmVyc2lvbklkICE9PSBudWxsXG5cdFx0XHQmJiB0aGlzLl9sYXN0QWNjZXB0ZWRJbmxpbmVDb21wbGV0aW9uSW5mb1xuXHRcdFx0JiYgdGhpcy5fbGFzdEFjY2VwdGVkSW5saW5lQ29tcGxldGlvbkluZm8udGV4dE1vZGVsVmVyc2lvbklkQWZ0ZXIgPT09IHZlcnNpb25JZCAtIDFcblx0XHRcdCYmIHRoaXMuX2xhc3RBY2NlcHRlZElubGluZUNvbXBsZXRpb25JbmZvLmlubGluZUNvbXBsZXRpb24uaXNJbmxpbmVFZGl0XG5cdFx0XHQmJiBjaGFuZ2VTdW1tYXJ5LmRpZFVuZG9cblx0XHQpIHtcblx0XHRcdHRoaXMuX2xhc3RBY2NlcHRlZElubGluZUNvbXBsZXRpb25JbmZvID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fSk7XG5cblx0cHVibGljIGRlYnVnR2V0U2VsZWN0ZWRTdWdnZXN0SXRlbSgpOiBJT2JzZXJ2YWJsZTxTdWdnZXN0SXRlbUluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0ZWRTdWdnZXN0SXRlbTtcblx0fVxuXG5cdHB1YmxpYyBnZXRJbmRlbnRhdGlvbkluZm8ocmVhZGVyOiBJUmVhZGVyKSB7XG5cdFx0bGV0IHN0YXJ0c1dpdGhJbmRlbnRhdGlvbiA9IGZhbHNlO1xuXHRcdGxldCBzdGFydHNXaXRoSW5kZW50YXRpb25MZXNzVGhhblRhYlNpemUgPSB0cnVlO1xuXHRcdGNvbnN0IGdob3N0VGV4dCA9IHRoaXM/LnByaW1hcnlHaG9zdFRleHQucmVhZChyZWFkZXIpO1xuXHRcdGlmICghIXRoaXM/Ll9zZWxlY3RlZFN1Z2dlc3RJdGVtICYmIGdob3N0VGV4dCAmJiBnaG9zdFRleHQucGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgeyBjb2x1bW4sIGxpbmVzIH0gPSBnaG9zdFRleHQucGFydHNbMF07XG5cblx0XHRcdGNvbnN0IGZpcnN0TGluZSA9IGxpbmVzWzBdLmxpbmU7XG5cblx0XHRcdGNvbnN0IGluZGVudGF0aW9uRW5kQ29sdW1uID0gdGhpcy50ZXh0TW9kZWwuZ2V0TGluZUluZGVudENvbHVtbihnaG9zdFRleHQubGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBpbkluZGVudGF0aW9uID0gY29sdW1uIDw9IGluZGVudGF0aW9uRW5kQ29sdW1uO1xuXG5cdFx0XHRpZiAoaW5JbmRlbnRhdGlvbikge1xuXHRcdFx0XHRsZXQgZmlyc3ROb25Xc0lkeCA9IGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4KGZpcnN0TGluZSk7XG5cdFx0XHRcdGlmIChmaXJzdE5vbldzSWR4ID09PSAtMSkge1xuXHRcdFx0XHRcdGZpcnN0Tm9uV3NJZHggPSBmaXJzdExpbmUubGVuZ3RoIC0gMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdGFydHNXaXRoSW5kZW50YXRpb24gPSBmaXJzdE5vbldzSWR4ID4gMDtcblxuXHRcdFx0XHRjb25zdCB0YWJTaXplID0gdGhpcy50ZXh0TW9kZWwuZ2V0T3B0aW9ucygpLnRhYlNpemU7XG5cdFx0XHRcdGNvbnN0IHZpc2libGVDb2x1bW5JbmRlbnRhdGlvbiA9IEN1cnNvckNvbHVtbnMudmlzaWJsZUNvbHVtbkZyb21Db2x1bW4oZmlyc3RMaW5lLCBmaXJzdE5vbldzSWR4ICsgMSwgdGFiU2l6ZSk7XG5cdFx0XHRcdHN0YXJ0c1dpdGhJbmRlbnRhdGlvbkxlc3NUaGFuVGFiU2l6ZSA9IHZpc2libGVDb2x1bW5JbmRlbnRhdGlvbiA8IHRhYlNpemU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydHNXaXRoSW5kZW50YXRpb24sXG5cdFx0XHRzdGFydHNXaXRoSW5kZW50YXRpb25MZXNzVGhhblRhYlNpemUsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZXNlcnZlQ3VycmVudENvbXBsZXRpb25SZWFzb25zID0gbmV3IFNldChbXG5cdFx0VmVyc2lvbklkQ2hhbmdlUmVhc29uLlJlZG8sXG5cdFx0VmVyc2lvbklkQ2hhbmdlUmVhc29uLlVuZG8sXG5cdFx0VmVyc2lvbklkQ2hhbmdlUmVhc29uLkFjY2VwdFdvcmQsXG5cdF0pO1xuXG5cdHByaXZhdGUgX2dldFJlYXNvbihlOiBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50IHwgdW5kZWZpbmVkKTogVmVyc2lvbklkQ2hhbmdlUmVhc29uIHtcblx0XHRpZiAoZT8uaXNVbmRvaW5nKSB7IHJldHVybiBWZXJzaW9uSWRDaGFuZ2VSZWFzb24uVW5kbzsgfVxuXHRcdGlmIChlPy5pc1JlZG9pbmcpIHsgcmV0dXJuIFZlcnNpb25JZENoYW5nZVJlYXNvbi5SZWRvOyB9XG5cdFx0aWYgKHRoaXMuaXNBY2NlcHRpbmdQYXJ0aWFsbHkpIHsgcmV0dXJuIFZlcnNpb25JZENoYW5nZVJlYXNvbi5BY2NlcHRXb3JkOyB9XG5cdFx0cmV0dXJuIFZlcnNpb25JZENoYW5nZVJlYXNvbi5PdGhlcjtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBkb250UmVmZXRjaFNpZ25hbCA9IG9ic2VydmFibGVTaWduYWwodGhpcyk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZmV0Y2hJbmxpbmVDb21wbGV0aW9uc1Byb21pc2UgPSBkZXJpdmVkSGFuZGxlQ2hhbmdlcyh7XG5cdFx0b3duZXI6IHRoaXMsXG5cdFx0Y2hhbmdlVHJhY2tlcjoge1xuXHRcdFx0Y3JlYXRlQ2hhbmdlU3VtbWFyeTogKCkgPT4gKHtcblx0XHRcdFx0ZG9udFJlZmV0Y2g6IGZhbHNlLFxuXHRcdFx0XHRwcmVzZXJ2ZUN1cnJlbnRDb21wbGV0aW9uOiBmYWxzZSxcblx0XHRcdFx0aW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kOiBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQuQXV0b21hdGljLFxuXHRcdFx0XHRvbmx5UmVxdWVzdElubGluZUVkaXRzOiBmYWxzZSxcblx0XHRcdFx0c2hvdWxkRGVib3VuY2U6IHRydWUsXG5cdFx0XHRcdHByb3ZpZGVyOiB1bmRlZmluZWQgYXMgSW5saW5lQ29tcGxldGlvbnNQcm92aWRlciB8IHVuZGVmaW5lZCxcblx0XHRcdFx0Y2hhbmdlSGludDogdW5kZWZpbmVkIGFzIElJbmxpbmVDb21wbGV0aW9uQ2hhbmdlSGludCB8IHVuZGVmaW5lZCxcblx0XHRcdFx0dGV4dENoYW5nZTogZmFsc2UsXG5cdFx0XHRcdGNoYW5nZVJlYXNvbjogJycsXG5cdFx0XHR9KSxcblx0XHRcdGhhbmRsZUNoYW5nZTogKGN0eCwgY2hhbmdlU3VtbWFyeSkgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIGZldGNoIGlubGluZSBjb21wbGV0aW9ucyAqL1xuXHRcdFx0XHRpZiAoY3R4LmRpZENoYW5nZSh0aGlzLl90ZXh0TW9kZWxWZXJzaW9uSWQpKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3ByZXNlcnZlQ3VycmVudENvbXBsZXRpb25SZWFzb25zLmhhcyh0aGlzLl9nZXRSZWFzb24oY3R4LmNoYW5nZSkpKSB7XG5cdFx0XHRcdFx0XHRjaGFuZ2VTdW1tYXJ5LnByZXNlcnZlQ3VycmVudENvbXBsZXRpb24gPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBkZXRhaWxlZFJlYXNvbnMgPSBjdHguY2hhbmdlPy5kZXRhaWxlZFJlYXNvbnMgPz8gW107XG5cdFx0XHRcdFx0Y2hhbmdlU3VtbWFyeS5jaGFuZ2VSZWFzb24gPSBkZXRhaWxlZFJlYXNvbnMubGVuZ3RoID4gMCA/IGRldGFpbGVkUmVhc29uc1swXS5nZXRUeXBlKCkgOiAnJztcblx0XHRcdFx0XHRjaGFuZ2VTdW1tYXJ5LnRleHRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGN0eC5kaWRDaGFuZ2UodGhpcy5fZm9yY2VVcGRhdGVFeHBsaWNpdGx5U2lnbmFsKSkge1xuXHRcdFx0XHRcdGNoYW5nZVN1bW1hcnkucHJlc2VydmVDdXJyZW50Q29tcGxldGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0Y2hhbmdlU3VtbWFyeS5pbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQgPSBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQuRXhwbGljaXQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY3R4LmRpZENoYW5nZSh0aGlzLmRvbnRSZWZldGNoU2lnbmFsKSkge1xuXHRcdFx0XHRcdGNoYW5nZVN1bW1hcnkuZG9udFJlZmV0Y2ggPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGN0eC5kaWRDaGFuZ2UodGhpcy5fb25seVJlcXVlc3RJbmxpbmVFZGl0c1NpZ25hbCkpIHtcblx0XHRcdFx0XHRjaGFuZ2VTdW1tYXJ5Lm9ubHlSZXF1ZXN0SW5saW5lRWRpdHMgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGN0eC5kaWRDaGFuZ2UodGhpcy5fZmV0Y2hTcGVjaWZpY1Byb3ZpZGVyU2lnbmFsKSkge1xuXHRcdFx0XHRcdGNoYW5nZVN1bW1hcnkucHJvdmlkZXIgPSBjdHguY2hhbmdlPy5wcm92aWRlcjtcblx0XHRcdFx0XHRjaGFuZ2VTdW1tYXJ5LmNoYW5nZUhpbnQgPSBjdHguY2hhbmdlPy5jaGFuZ2VIaW50O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSxcblx0XHR9LFxuXG5cdH0sIChyZWFkZXIsIGNoYW5nZVN1bW1hcnkpID0+IHtcblx0XHR0aGlzLl9zb3VyY2UuY2xlYXJPcGVyYXRpb25PblRleHRNb2RlbENoYW5nZS5yZWFkKHJlYWRlcik7IC8vIE1ha2Ugc3VyZSB0aGUgY2xlYXIgb3BlcmF0aW9uIHJ1bnMgYmVmb3JlIHRoZSBmZXRjaCBvcGVyYXRpb25cblx0XHR0aGlzLl9ub0RlbGF5U2lnbmFsLnJlYWQocmVhZGVyKTtcblx0XHR0aGlzLmRvbnRSZWZldGNoU2lnbmFsLnJlYWQocmVhZGVyKTtcblx0XHR0aGlzLl9vbmx5UmVxdWVzdElubGluZUVkaXRzU2lnbmFsLnJlYWQocmVhZGVyKTtcblx0XHR0aGlzLl9mb3JjZVVwZGF0ZUV4cGxpY2l0bHlTaWduYWwucmVhZChyZWFkZXIpO1xuXHRcdHRoaXMuX2ZldGNoU3BlY2lmaWNQcm92aWRlclNpZ25hbC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3Qgc2hvdWxkVXBkYXRlID0gIXRoaXMuX2lzU3VwcHJlc3NlZCgpXG5cdFx0XHQmJiAoKHRoaXMuX2VuYWJsZWQucmVhZChyZWFkZXIpICYmIHRoaXMuX3NlbGVjdGVkU3VnZ2VzdEl0ZW0ucmVhZChyZWFkZXIpKSB8fCB0aGlzLl9pc0FjdGl2ZS5yZWFkKHJlYWRlcikpXG5cdFx0XHQmJiAoIXRoaXMuX2lubGluZUNvbXBsZXRpb25zU2VydmljZS5pc1Nub296aW5nKCkgfHwgY2hhbmdlU3VtbWFyeS5pbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQgPT09IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5FeHBsaWNpdCk7XG5cdFx0aWYgKCFzaG91bGRVcGRhdGUpIHtcblx0XHRcdHRoaXMuX3NvdXJjZS5jYW5jZWxVcGRhdGUoKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGV4dE1vZGVsVmVyc2lvbklkLnJlYWQocmVhZGVyKTsgLy8gUmVmZXRjaCBvbiB0ZXh0IGNoYW5nZVxuXG5cdFx0Y29uc3Qgc3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zID0gdGhpcy5fc291cmNlLnN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucy5yZWFkKHVuZGVmaW5lZCk7XG5cdFx0bGV0IHN1Z2dlc3RJdGVtID0gdGhpcy5fc2VsZWN0ZWRTdWdnZXN0SXRlbS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKHRoaXMuX3Nob3VsZFNob3dPblN1Z2dlc3RDb25mbGljdC5yZWFkKHVuZGVmaW5lZCkpIHtcblx0XHRcdHN1Z2dlc3RJdGVtID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoc3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zICYmICFzdWdnZXN0SXRlbSkge1xuXHRcdFx0dGhpcy5fc291cmNlLnNlZWRJbmxpbmVDb21wbGV0aW9uc1dpdGhTdWdnZXN0V2lkZ2V0KCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNoYW5nZVN1bW1hcnkuZG9udFJlZmV0Y2gpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2RpZFVuZG9JbmxpbmVFZGl0cy5yZWFkKHJlYWRlcikgJiYgY2hhbmdlU3VtbWFyeS5pbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQgIT09IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5FeHBsaWNpdCkge1xuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHR0aGlzLl9zb3VyY2UuY2xlYXIodHgpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCByZWFzb246IHN0cmluZyA9ICcnO1xuXHRcdGlmIChjaGFuZ2VTdW1tYXJ5LnByb3ZpZGVyKSB7XG5cdFx0XHRyZWFzb24gKz0gJ3Byb3ZpZGVyT25EaWRDaGFuZ2UnO1xuXHRcdH0gZWxzZSBpZiAoY2hhbmdlU3VtbWFyeS5pbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQgPT09IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5FeHBsaWNpdCkge1xuXHRcdFx0cmVhc29uICs9ICdleHBsaWNpdCc7XG5cdFx0fVxuXHRcdGlmIChjaGFuZ2VTdW1tYXJ5LmNoYW5nZVJlYXNvbikge1xuXHRcdFx0cmVhc29uICs9IHJlYXNvbi5sZW5ndGggPiAwID8gYDoke2NoYW5nZVN1bW1hcnkuY2hhbmdlUmVhc29ufWAgOiBjaGFuZ2VTdW1tYXJ5LmNoYW5nZVJlYXNvbjtcblx0XHR9XG5cblx0XHRjb25zdCB0eXBpbmdJbnRlcnZhbCA9IHRoaXMuX3R5cGluZy5nZXRUeXBpbmdJbnRlcnZhbCgpO1xuXHRcdGNvbnN0IHJlcXVlc3RJbmZvOiBJbmxpbmVTdWdnZXN0UmVxdWVzdEluZm8gPSB7XG5cdFx0XHRlZGl0b3JUeXBlOiB0aGlzLmVkaXRvclR5cGUsXG5cdFx0XHRzdGFydFRpbWU6IERhdGUubm93KCksXG5cdFx0XHRsYW5ndWFnZUlkOiB0aGlzLnRleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCksXG5cdFx0XHRyZWFzb24sXG5cdFx0XHR0eXBpbmdJbnRlcnZhbDogdHlwaW5nSW50ZXJ2YWwuYXZlcmFnZUludGVydmFsLFxuXHRcdFx0dHlwaW5nSW50ZXJ2YWxDaGFyYWN0ZXJDb3VudDogdHlwaW5nSW50ZXJ2YWwuY2hhcmFjdGVyQ291bnQsXG5cdFx0XHRhdmFpbGFibGVQcm92aWRlcnM6IFtdLFxuXHRcdFx0c2t1OiB0aGlzLnNrdS5yZWFkKHVuZGVmaW5lZCksXG5cdFx0fTtcblxuXHRcdGxldCBjb250ZXh0OiBJbmxpbmVDb21wbGV0aW9uQ29udGV4dFdpdGhvdXRVdWlkID0ge1xuXHRcdFx0dHJpZ2dlcktpbmQ6IGNoYW5nZVN1bW1hcnkuaW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLFxuXHRcdFx0c2VsZWN0ZWRTdWdnZXN0aW9uSW5mbzogc3VnZ2VzdEl0ZW0/LnRvU2VsZWN0ZWRTdWdnZXN0aW9uSW5mbygpLFxuXHRcdFx0aW5jbHVkZUlubGluZUNvbXBsZXRpb25zOiAhY2hhbmdlU3VtbWFyeS5vbmx5UmVxdWVzdElubGluZUVkaXRzLFxuXHRcdFx0aW5jbHVkZUlubGluZUVkaXRzOiB0aGlzLl9pbmxpbmVFZGl0c0VuYWJsZWQucmVhZChyZWFkZXIpLFxuXHRcdFx0cmVxdWVzdElzc3VlZERhdGVUaW1lOiByZXF1ZXN0SW5mby5zdGFydFRpbWUsXG5cdFx0XHRlYXJsaWVzdFNob3duRGF0ZVRpbWU6IHJlcXVlc3RJbmZvLnN0YXJ0VGltZSArIChjaGFuZ2VTdW1tYXJ5LmlubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZCA9PT0gSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLkV4cGxpY2l0IHx8IHRoaXMuaW5BY2NlcHRGbG93LnJlYWQodW5kZWZpbmVkKSA/IDAgOiB0aGlzLl9taW5TaG93RGVsYXkucmVhZCh1bmRlZmluZWQpKSxcblx0XHRcdGNoYW5nZUhpbnQ6IGNoYW5nZVN1bW1hcnkuY2hhbmdlSGludCxcblx0XHR9O1xuXG5cdFx0aWYgKGNvbnRleHQudHJpZ2dlcktpbmQgPT09IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5BdXRvbWF0aWMgJiYgY2hhbmdlU3VtbWFyeS50ZXh0Q2hhbmdlKSB7XG5cdFx0XHRpZiAodGhpcy50ZXh0TW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKSA9PT0gdGhpcy5fbGFzdFNob3duSW5saW5lQ29tcGxldGlvbkluZm8/LmFsdGVybmF0ZVRleHRNb2RlbFZlcnNpb25JZCkge1xuXHRcdFx0XHQvLyBXaGVuIHVuZG9pbmcgYmFjayB0byBhIHZlcnNpb24gd2hlcmUgYW4gaW5saW5lIGVkaXQvY29tcGxldGlvbiB3YXMgc2hvd24sXG5cdFx0XHRcdC8vIHdlIHdhbnQgdG8gc2hvdyBhbiBpbmxpbmUgZWRpdCAob3IgY29tcGxldGlvbikgYWdhaW4gaWYgaXQgd2FzIG9yaWdpbmFsbHkgYW4gaW5saW5lIGVkaXQgKG9yIGNvbXBsZXRpb24pLlxuXHRcdFx0XHRjb250ZXh0ID0ge1xuXHRcdFx0XHRcdC4uLmNvbnRleHQsXG5cdFx0XHRcdFx0aW5jbHVkZUlubGluZUNvbXBsZXRpb25zOiAhdGhpcy5fbGFzdFNob3duSW5saW5lQ29tcGxldGlvbkluZm8uaW5saW5lQ29tcGxldGlvbi5pc0lubGluZUVkaXQsXG5cdFx0XHRcdFx0aW5jbHVkZUlubGluZUVkaXRzOiB0aGlzLl9sYXN0U2hvd25JbmxpbmVDb21wbGV0aW9uSW5mby5pbmxpbmVDb21wbGV0aW9uLmlzSW5saW5lRWRpdCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpdGVtVG9QcmVzZXJ2ZUNhbmRpZGF0ZSA9IHRoaXMuc2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uLnJlYWQodW5kZWZpbmVkKSA/PyB0aGlzLl9pbmxpbmVTdWdnZXN0aW9uSXRlbXMucmVhZCh1bmRlZmluZWQpPy5pbmxpbmVFZGl0O1xuXHRcdGNvbnN0IGl0ZW1Ub1ByZXNlcnZlID0gY2hhbmdlU3VtbWFyeS5wcmVzZXJ2ZUN1cnJlbnRDb21wbGV0aW9uIHx8IGl0ZW1Ub1ByZXNlcnZlQ2FuZGlkYXRlPy5mb3J3YXJkU3RhYmxlXG5cdFx0XHQ/IGl0ZW1Ub1ByZXNlcnZlQ2FuZGlkYXRlIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHVzZXJKdW1wZWRUb0FjdGl2ZUNvbXBsZXRpb24gPSB0aGlzLl9qdW1wZWRUb0lkLm1hcChqdW1wZWRUbyA9PiAhIWp1bXBlZFRvICYmIGp1bXBlZFRvID09PSB0aGlzLl9pbmxpbmVTdWdnZXN0aW9uSXRlbXMucmVhZCh1bmRlZmluZWQpPy5pbmxpbmVFZGl0Py5zZW1hbnRpY0lkKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVycyA9IGNoYW5nZVN1bW1hcnkucHJvdmlkZXJcblx0XHRcdD8geyBwcm92aWRlcnM6IFtjaGFuZ2VTdW1tYXJ5LnByb3ZpZGVyXSwgbGFiZWw6ICdzaW5nbGU6JyArIGNoYW5nZVN1bW1hcnkucHJvdmlkZXIucHJvdmlkZXJJZD8udG9TdHJpbmcoKSB9XG5cdFx0XHQ6IHsgcHJvdmlkZXJzOiB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyLmFsbCh0aGlzLnRleHRNb2RlbCksIGxhYmVsOiB1bmRlZmluZWQgfTsgLy8gVE9ETzogc2hvdWxkIHVzZSBpbmxpbmVDb21wbGV0aW9uUHJvdmlkZXJzXG5cdFx0Y29uc3QgYXZhaWxhYmxlUHJvdmlkZXJzID0gdGhpcy5nZXRBdmFpbGFibGVQcm92aWRlcnMocHJvdmlkZXJzLnByb3ZpZGVycyk7XG5cdFx0cmVxdWVzdEluZm8uYXZhaWxhYmxlUHJvdmlkZXJzID0gYXZhaWxhYmxlUHJvdmlkZXJzLm1hcChwID0+IHAucHJvdmlkZXJJZCkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0XHRyZXR1cm4gdGhpcy5fc291cmNlLmZldGNoKGF2YWlsYWJsZVByb3ZpZGVycywgcHJvdmlkZXJzLmxhYmVsLCBjb250ZXh0LCBpdGVtVG9QcmVzZXJ2ZT8uaWRlbnRpdHksIGNoYW5nZVN1bW1hcnkuc2hvdWxkRGVib3VuY2UsIHVzZXJKdW1wZWRUb0FjdGl2ZUNvbXBsZXRpb24sIHJlcXVlc3RJbmZvKTtcblx0fSk7XG5cblx0Ly8gVE9ETzogVGhpcyBpcyBub3QgYW4gaWRlYWwgaW1wbGVtZW50YXRpb24gb2YgZXhjbHVkZXNHcm91cElkcywgaG93ZXZlciBhcyB0aGlzIGlzIGN1cnJlbnRseSBzdGlsbCBiZWhpbmQgcHJvcG9zZWQgQVBJXG5cdC8vIGFuZCBkdWUgdG8gdGhlIHRpbWUgY29uc3RyYWludHMsIHdlIGFyZSB1c2luZyBhIHNpbXBsaWZpZWQgYXBwcm9hY2hcblx0cHJpdmF0ZSBnZXRBdmFpbGFibGVQcm92aWRlcnMocHJvdmlkZXJzOiBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyW10pOiBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyW10ge1xuXHRcdGNvbnN0IHN1cHByZXNzZWRQcm92aWRlckdyb3VwSWRzID0gdGhpcy5fc3VwcHJlc3NlZElubGluZUNvbXBsZXRpb25Hcm91cElkcy5nZXQoKTtcblx0XHRjb25zdCB1bnN1cHByZXNzZWRQcm92aWRlcnMgPSBwcm92aWRlcnMuZmlsdGVyKHByb3ZpZGVyID0+ICEocHJvdmlkZXIuZ3JvdXBJZCAmJiBzdXBwcmVzc2VkUHJvdmlkZXJHcm91cElkcy5oYXMocHJvdmlkZXIuZ3JvdXBJZCkpKTtcblxuXHRcdGNvbnN0IGV4Y2x1ZGVkR3JvdXBJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHVuc3VwcHJlc3NlZFByb3ZpZGVycykge1xuXHRcdFx0cHJvdmlkZXIuZXhjbHVkZXNHcm91cElkcz8uZm9yRWFjaChwID0+IGV4Y2x1ZGVkR3JvdXBJZHMuYWRkKHApKTtcblx0XHR9XG5cblx0XHRjb25zdCBhdmFpbGFibGVQcm92aWRlcnM6IElubGluZUNvbXBsZXRpb25zUHJvdmlkZXJbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdW5zdXBwcmVzc2VkUHJvdmlkZXJzKSB7XG5cdFx0XHRpZiAocHJvdmlkZXIuZ3JvdXBJZCAmJiBleGNsdWRlZEdyb3VwSWRzLmhhcyhwcm92aWRlci5ncm91cElkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGF2YWlsYWJsZVByb3ZpZGVycy5wdXNoKHByb3ZpZGVyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXZhaWxhYmxlUHJvdmlkZXJzO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHRyaWdnZXIodHg/OiBJVHJhbnNhY3Rpb24sIG9wdGlvbnM6IHsgb25seUZldGNoSW5saW5lRWRpdHM/OiBib29sZWFuOyBub0RlbGF5PzogYm9vbGVhbjsgcHJvdmlkZXI/OiBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyOyBleHBsaWNpdD86IGJvb2xlYW47IGNoYW5nZUhpbnQ/OiBJSW5saW5lQ29tcGxldGlvbkNoYW5nZUhpbnQgfSA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0c3VidHJhbnNhY3Rpb24odHgsIHR4ID0+IHtcblx0XHRcdGlmIChvcHRpb25zLm9ubHlGZXRjaElubGluZUVkaXRzKSB7XG5cdFx0XHRcdHRoaXMuX29ubHlSZXF1ZXN0SW5saW5lRWRpdHNTaWduYWwudHJpZ2dlcih0eCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAob3B0aW9ucy5ub0RlbGF5KSB7XG5cdFx0XHRcdHRoaXMuX25vRGVsYXlTaWduYWwudHJpZ2dlcih0eCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9pc0FjdGl2ZS5zZXQodHJ1ZSwgdHgpO1xuXG5cdFx0XHRpZiAob3B0aW9ucy5leHBsaWNpdCkge1xuXHRcdFx0XHR0aGlzLl9pbkFjY2VwdEZsb3cuc2V0KHRydWUsIHR4KTtcblx0XHRcdFx0dGhpcy5fZm9yY2VVcGRhdGVFeHBsaWNpdGx5U2lnbmFsLnRyaWdnZXIodHgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG9wdGlvbnMucHJvdmlkZXIpIHtcblx0XHRcdFx0dGhpcy5fZmV0Y2hTcGVjaWZpY1Byb3ZpZGVyU2lnbmFsLnRyaWdnZXIodHgsIHsgcHJvdmlkZXI6IG9wdGlvbnMucHJvdmlkZXIsIGNoYW5nZUhpbnQ6IG9wdGlvbnMuY2hhbmdlSGludCB9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhd2FpdCB0aGlzLl9mZXRjaElubGluZUNvbXBsZXRpb25zUHJvbWlzZS5nZXQoKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB0cmlnZ2VyRXhwbGljaXRseSh0eD86IElUcmFuc2FjdGlvbiwgb25seUZldGNoSW5saW5lRWRpdHM6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnRyaWdnZXIodHgsIHsgb25seUZldGNoSW5saW5lRWRpdHMsIGV4cGxpY2l0OiB0cnVlIH0pO1xuXHR9XG5cblx0cHVibGljIHN0b3Aoc3RvcFJlYXNvbjogJ2V4cGxpY2l0Q2FuY2VsJyB8ICdhdXRvbWF0aWMnID0gJ2F1dG9tYXRpYycsIHR4PzogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0c3VidHJhbnNhY3Rpb24odHgsIHR4ID0+IHtcblx0XHRcdGlmIChzdG9wUmVhc29uID09PSAnZXhwbGljaXRDYW5jZWwnKSB7XG5cdFx0XHRcdGNvbnN0IGlubGluZUNvbXBsZXRpb24gPSB0aGlzLnN0YXRlLmdldCgpPy5pbmxpbmVTdWdnZXN0aW9uO1xuXHRcdFx0XHRpZiAoaW5saW5lQ29tcGxldGlvbikge1xuXHRcdFx0XHRcdGlubGluZUNvbXBsZXRpb24ucmVwb3J0RW5kT2ZMaWZlKHsga2luZDogSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuUmVqZWN0ZWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5faXNBY3RpdmUuc2V0KGZhbHNlLCB0eCk7XG5cdFx0XHR0aGlzLl9zb3VyY2UuY2xlYXIodHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5saW5lU3VnZ2VzdGlvbkl0ZW1zID0gZGVyaXZlZE9wdHMoeyBvd25lcjogdGhpcyB9LCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGMgPSB0aGlzLl9zb3VyY2UuaW5saW5lQ29tcGxldGlvbnMucmVhZChyZWFkZXIpO1xuXHRcdGlmICghYykgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0Y29uc3QgY3Vyc29yUG9zaXRpb24gPSB0aGlzLnByaW1hcnlQb3NpdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0bGV0IGlubGluZUVkaXQ6IElubGluZUVkaXRJdGVtIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHZpc2libGVDb21wbGV0aW9uczogSW5saW5lQ29tcGxldGlvbkl0ZW1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY29tcGxldGlvbiBvZiBjLmlubGluZUNvbXBsZXRpb25zKSB7XG5cdFx0XHRpZiAoIWNvbXBsZXRpb24uaXNJbmxpbmVFZGl0KSB7XG5cdFx0XHRcdGlmIChjb21wbGV0aW9uLmlzVmlzaWJsZSh0aGlzLnRleHRNb2RlbCwgY3Vyc29yUG9zaXRpb24pKSB7XG5cdFx0XHRcdFx0dmlzaWJsZUNvbXBsZXRpb25zLnB1c2goY29tcGxldGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlubGluZUVkaXQgPSBjb21wbGV0aW9uO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh2aXNpYmxlQ29tcGxldGlvbnMubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHQvLyBEb24ndCBzaG93IHRoZSBpbmxpbmUgZWRpdCBpZiB0aGVyZSBpcyBhIHZpc2libGUgY29tcGxldGlvblxuXHRcdFx0aW5saW5lRWRpdCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5saW5lQ29tcGxldGlvbnM6IHZpc2libGVDb21wbGV0aW9ucyxcblx0XHRcdGlubGluZUVkaXQsXG5cdFx0fTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5saW5lQ29tcGxldGlvbkl0ZW1zID0gZGVyaXZlZE9wdHMoeyBvd25lcjogdGhpcywgZXF1YWxzRm46IGFycmF5RXF1YWxzQygpIH0sIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgYyA9IHRoaXMuX2lubGluZVN1Z2dlc3Rpb25JdGVtcy5yZWFkKHJlYWRlcik7XG5cdFx0cmV0dXJuIGM/LmlubGluZUNvbXBsZXRpb25zID8/IFtdO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uSW5kZXggPSBkZXJpdmVkPG51bWJlcj4odGhpcywgKHJlYWRlcikgPT4ge1xuXHRcdGNvbnN0IHNlbGVjdGVkSW5saW5lQ29tcGxldGlvbklkID0gdGhpcy5fc2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uSWQucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGZpbHRlcmVkQ29tcGxldGlvbnMgPSB0aGlzLl9pbmxpbmVDb21wbGV0aW9uSXRlbXMucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGlkeCA9IHRoaXMuX3NlbGVjdGVkSW5saW5lQ29tcGxldGlvbklkID09PSB1bmRlZmluZWQgPyAtMVxuXHRcdFx0OiBmaWx0ZXJlZENvbXBsZXRpb25zLmZpbmRJbmRleCh2ID0+IHYuc2VtYW50aWNJZCA9PT0gc2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uSWQpO1xuXHRcdGlmIChpZHggPT09IC0xKSB7XG5cdFx0XHQvLyBSZXNldCB0aGUgc2VsZWN0aW9uIHNvIHRoYXQgdGhlIHNlbGVjdGlvbiBkb2VzIG5vdCBqdW1wIGJhY2sgd2hlbiBpdCBhcHBlYXJzIGFnYWluXG5cdFx0XHR0aGlzLl9zZWxlY3RlZElubGluZUNvbXBsZXRpb25JZC5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdHJldHVybiBpZHg7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBzZWxlY3RlZElubGluZUNvbXBsZXRpb24gPSBkZXJpdmVkPElubGluZUNvbXBsZXRpb25JdGVtIHwgdW5kZWZpbmVkPih0aGlzLCAocmVhZGVyKSA9PiB7XG5cdFx0Y29uc3QgZmlsdGVyZWRDb21wbGV0aW9ucyA9IHRoaXMuX2lubGluZUNvbXBsZXRpb25JdGVtcy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgaWR4ID0gdGhpcy5zZWxlY3RlZElubGluZUNvbXBsZXRpb25JbmRleC5yZWFkKHJlYWRlcik7XG5cdFx0cmV0dXJuIGZpbHRlcmVkQ29tcGxldGlvbnNbaWR4XTtcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IGFjdGl2ZUNvbW1hbmRzID0gZGVyaXZlZE9wdHM8SW5saW5lQ29tcGxldGlvbkNvbW1hbmRbXT4oeyBvd25lcjogdGhpcywgZXF1YWxzRm46IGFycmF5RXF1YWxzQygpIH0sXG5cdFx0ciA9PiB0aGlzLnNlbGVjdGVkSW5saW5lQ29tcGxldGlvbi5yZWFkKHIpPy5zb3VyY2UuaW5saW5lU3VnZ2VzdGlvbnMuY29tbWFuZHMgPz8gW11cblx0KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbGFzdFRyaWdnZXJLaW5kOiBJT2JzZXJ2YWJsZTxJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQgfCB1bmRlZmluZWQ+O1xuXG5cdHB1YmxpYyByZWFkb25seSBpbmxpbmVDb21wbGV0aW9uc0NvdW50ID0gZGVyaXZlZDxudW1iZXIgfCB1bmRlZmluZWQ+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0aWYgKHRoaXMubGFzdFRyaWdnZXJLaW5kLnJlYWQocmVhZGVyKSA9PT0gSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLkV4cGxpY2l0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW1zLnJlYWQocmVhZGVyKS5sZW5ndGg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNWaXNpYmxlUGVla1dpZGdldHMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl9lZGl0b3JPYnMub3BlbmVkUGVla1dpZGdldHMucmVhZChyZWFkZXIpID4gMCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2hvdWxkU2hvd09uU3VnZ2VzdENvbmZsaWN0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHNob3dPblN1Z2dlc3RDb25mbGljdCA9IHRoaXMuX3Nob3dPblN1Z2dlc3RDb25mbGljdC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKHNob3dPblN1Z2dlc3RDb25mbGljdCAhPT0gJ25ldmVyJykge1xuXHRcdFx0Y29uc3QgaGFzSW5saW5lQ29tcGxldGlvbiA9ICEhdGhpcy5zZWxlY3RlZElubGluZUNvbXBsZXRpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGhhc0lubGluZUNvbXBsZXRpb24pIHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuX3NlbGVjdGVkU3VnZ2VzdEl0ZW0ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNob3dPblN1Z2dlc3RDb25mbGljdCA9PT0gJ3doZW5TdWdnZXN0TGlzdElzSW5jb21wbGV0ZScpIHtcblx0XHRcdFx0XHRyZXR1cm4gaXRlbS5saXN0SW5jb21wbGV0ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc3RhdGUgPSBkZXJpdmVkT3B0czx7XG5cdFx0a2luZDogJ2dob3N0VGV4dCc7XG5cdFx0ZWRpdHM6IHJlYWRvbmx5IFRleHRSZXBsYWNlbWVudFtdO1xuXHRcdHByaW1hcnlHaG9zdFRleHQ6IEdob3N0VGV4dE9yUmVwbGFjZW1lbnQ7XG5cdFx0Z2hvc3RUZXh0czogcmVhZG9ubHkgR2hvc3RUZXh0T3JSZXBsYWNlbWVudFtdO1xuXHRcdHN1Z2dlc3RJdGVtOiBTdWdnZXN0SXRlbUluZm8gfCB1bmRlZmluZWQ7XG5cdFx0aW5saW5lU3VnZ2VzdGlvbjogSW5saW5lQ29tcGxldGlvbkl0ZW0gfCB1bmRlZmluZWQ7XG5cdH0gfCB7XG5cdFx0a2luZDogJ2lubGluZUVkaXQnO1xuXHRcdGVkaXRzOiByZWFkb25seSBUZXh0UmVwbGFjZW1lbnRbXTtcblx0XHRpbmxpbmVTdWdnZXN0aW9uOiBJbmxpbmVFZGl0SXRlbTtcblx0XHRjdXJzb3JBdElubGluZUVkaXQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRcdG5leHRFZGl0VXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdH0gfCB1bmRlZmluZWQ+KHtcblx0XHRvd25lcjogdGhpcyxcblx0XHRlcXVhbHNGbjogKGEsIGIpID0+IHtcblx0XHRcdGlmICghYSB8fCAhYikgeyByZXR1cm4gYSA9PT0gYjsgfVxuXG5cdFx0XHRpZiAoYS5raW5kID09PSAnZ2hvc3RUZXh0JyAmJiBiLmtpbmQgPT09ICdnaG9zdFRleHQnKSB7XG5cdFx0XHRcdHJldHVybiBnaG9zdFRleHRzT3JSZXBsYWNlbWVudHNFcXVhbChhLmdob3N0VGV4dHMsIGIuZ2hvc3RUZXh0cylcblx0XHRcdFx0XHQmJiBhLmlubGluZVN1Z2dlc3Rpb24gPT09IGIuaW5saW5lU3VnZ2VzdGlvblxuXHRcdFx0XHRcdCYmIGEuc3VnZ2VzdEl0ZW0gPT09IGIuc3VnZ2VzdEl0ZW07XG5cdFx0XHR9IGVsc2UgaWYgKGEua2luZCA9PT0gJ2lubGluZUVkaXQnICYmIGIua2luZCA9PT0gJ2lubGluZUVkaXQnKSB7XG5cdFx0XHRcdHJldHVybiBhLmlubGluZVN1Z2dlc3Rpb24gPT09IGIuaW5saW5lU3VnZ2VzdGlvbjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH0sIChyZWFkZXIpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMudGV4dE1vZGVsO1xuXG5cdFx0aWYgKHRoaXMuX3N1cHByZXNzSW5TbmlwcGV0TW9kZS5yZWFkKHJlYWRlcikgJiYgdGhpcy5faXNJblNuaXBwZXRNb2RlLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtID0gdGhpcy5faW5saW5lU3VnZ2VzdGlvbkl0ZW1zLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBpbmxpbmVFZGl0UmVzdWx0ID0gaXRlbT8uaW5saW5lRWRpdDtcblx0XHRpZiAoaW5saW5lRWRpdFJlc3VsdCkge1xuXHRcdFx0aWYgKHRoaXMuX2hhc1Zpc2libGVQZWVrV2lkZ2V0cy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGN1cnNvckF0SW5saW5lRWRpdCA9IHRoaXMucHJpbWFyeVBvc2l0aW9uLm1hcChjdXJzb3JQb3MgPT4gTGluZVJhbmdlLmZyb21SYW5nZUluY2x1c2l2ZShpbmxpbmVFZGl0UmVzdWx0LnRhcmdldFJhbmdlKS5hZGRNYXJnaW4oMSwgMSkuY29udGFpbnMoY3Vyc29yUG9zLmxpbmVOdW1iZXIpKTtcblx0XHRcdGNvbnN0IHN0cmluZ0VkaXQgPSBpbmxpbmVFZGl0UmVzdWx0LmFjdGlvbj8ua2luZCA9PT0gJ2VkaXQnID8gaW5saW5lRWRpdFJlc3VsdC5hY3Rpb24uc3RyaW5nRWRpdCA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHJlcGxhY2VtZW50cyA9IHN0cmluZ0VkaXQgPyBUZXh0RWRpdC5mcm9tU3RyaW5nRWRpdChzdHJpbmdFZGl0LCBuZXcgVGV4dE1vZGVsVGV4dCh0aGlzLnRleHRNb2RlbCkpLnJlcGxhY2VtZW50cyA6IFtdO1xuXG5cdFx0XHRsZXQgbmV4dEVkaXRVcmkgPSAoaXRlbS5pbmxpbmVFZGl0Py5jb21tYW5kPy5pZCA9PT0gJ3ZzY29kZS5vcGVuJyB8fCBpdGVtLmlubGluZUVkaXQ/LmNvbW1hbmQ/LmlkID09PSAnX3dvcmtiZW5jaC5vcGVuJykgJiZcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdGl0ZW0uaW5saW5lRWRpdD8uY29tbWFuZC5hcmd1bWVudHM/Lmxlbmd0aCA/IFVSSS5mcm9tKDxhbnk+aXRlbS5pbmxpbmVFZGl0Py5jb21tYW5kLmFyZ3VtZW50c1swXSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIWlubGluZUVkaXRSZXN1bHQub3JpZ2luYWxUZXh0UmVmLnRhcmdldHModGhpcy50ZXh0TW9kZWwpKSB7XG5cdFx0XHRcdG5leHRFZGl0VXJpID0gaW5saW5lRWRpdFJlc3VsdC5vcmlnaW5hbFRleHRSZWYudXJpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsga2luZDogJ2lubGluZUVkaXQnLCBpbmxpbmVTdWdnZXN0aW9uOiBpbmxpbmVFZGl0UmVzdWx0LCBlZGl0czogcmVwbGFjZW1lbnRzLCBjdXJzb3JBdElubGluZUVkaXQsIG5leHRFZGl0VXJpIH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3VnZ2VzdEl0ZW0gPSB0aGlzLl9zZWxlY3RlZFN1Z2dlc3RJdGVtLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXRoaXMuX3Nob3VsZFNob3dPblN1Z2dlc3RDb25mbGljdC5yZWFkKHJlYWRlcikgJiYgc3VnZ2VzdEl0ZW0pIHtcblx0XHRcdGNvbnN0IHN1Z2dlc3RDb21wbGV0aW9uRWRpdCA9IHNpbmdsZVRleHRSZW1vdmVDb21tb25QcmVmaXgoc3VnZ2VzdEl0ZW0uZ2V0U2luZ2xlVGV4dEVkaXQoKSwgbW9kZWwpO1xuXHRcdFx0Y29uc3QgYXVnbWVudGF0aW9uID0gdGhpcy5fY29tcHV0ZUF1Z21lbnRhdGlvbihzdWdnZXN0Q29tcGxldGlvbkVkaXQsIHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IGlzU3VnZ2VzdGlvblByZXZpZXdFbmFibGVkID0gdGhpcy5fc3VnZ2VzdFByZXZpZXdFbmFibGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghaXNTdWdnZXN0aW9uUHJldmlld0VuYWJsZWQgJiYgIWF1Z21lbnRhdGlvbikgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRcdGNvbnN0IGZ1bGxFZGl0ID0gYXVnbWVudGF0aW9uPy5lZGl0ID8/IHN1Z2dlc3RDb21wbGV0aW9uRWRpdDtcblx0XHRcdGNvbnN0IGZ1bGxFZGl0UHJldmlld0xlbmd0aCA9IGF1Z21lbnRhdGlvbiA/IGF1Z21lbnRhdGlvbi5lZGl0LnRleHQubGVuZ3RoIC0gc3VnZ2VzdENvbXBsZXRpb25FZGl0LnRleHQubGVuZ3RoIDogMDtcblxuXHRcdFx0Y29uc3QgbW9kZSA9IHRoaXMuX3N1Z2dlc3RQcmV2aWV3TW9kZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBwb3NpdGlvbnMgPSB0aGlzLl9wb3NpdGlvbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYWxsUG90ZW50aWFsRWRpdHMgPSBbZnVsbEVkaXQsIC4uLmdldFNlY29uZGFyeUVkaXRzKHRoaXMudGV4dE1vZGVsLCBwb3NpdGlvbnMsIGZ1bGxFZGl0KV07XG5cdFx0XHRjb25zdCB2YWxpZEVkaXRzQW5kR2hvc3RUZXh0cyA9IGFsbFBvdGVudGlhbEVkaXRzXG5cdFx0XHRcdC5tYXAoKGVkaXQsIGlkeCkgPT4gKHsgZWRpdCwgZ2hvc3RUZXh0OiBlZGl0ID8gY29tcHV0ZUdob3N0VGV4dChlZGl0LCBtb2RlbCwgbW9kZSwgcG9zaXRpb25zW2lkeF0sIGZ1bGxFZGl0UHJldmlld0xlbmd0aCkgOiB1bmRlZmluZWQgfSkpXG5cdFx0XHRcdC5maWx0ZXIoKHsgZWRpdCwgZ2hvc3RUZXh0IH0pID0+IGVkaXQgIT09IHVuZGVmaW5lZCAmJiBnaG9zdFRleHQgIT09IHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBlZGl0cyA9IHZhbGlkRWRpdHNBbmRHaG9zdFRleHRzLm1hcCgoeyBlZGl0IH0pID0+IGVkaXQhKTtcblx0XHRcdGNvbnN0IGdob3N0VGV4dHMgPSB2YWxpZEVkaXRzQW5kR2hvc3RUZXh0cy5tYXAoKHsgZ2hvc3RUZXh0IH0pID0+IGdob3N0VGV4dCEpO1xuXHRcdFx0Y29uc3QgcHJpbWFyeUdob3N0VGV4dCA9IGdob3N0VGV4dHNbMF0gPz8gbmV3IEdob3N0VGV4dChmdWxsRWRpdC5yYW5nZS5lbmRMaW5lTnVtYmVyLCBbXSk7XG5cdFx0XHRyZXR1cm4geyBraW5kOiAnZ2hvc3RUZXh0JywgZWRpdHMsIHByaW1hcnlHaG9zdFRleHQsIGdob3N0VGV4dHMsIGlubGluZVN1Z2dlc3Rpb246IGF1Z21lbnRhdGlvbj8uY29tcGxldGlvbiwgc3VnZ2VzdEl0ZW0gfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKCF0aGlzLl9pc0FjdGl2ZS5yZWFkKHJlYWRlcikpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0Y29uc3QgaW5saW5lU3VnZ2VzdGlvbiA9IHRoaXMuc2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghaW5saW5lU3VnZ2VzdGlvbikgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gaW5saW5lU3VnZ2VzdGlvbi5nZXRTaW5nbGVUZXh0RWRpdCgpO1xuXHRcdFx0Y29uc3QgbW9kZSA9IHRoaXMuX2lubGluZVN1Z2dlc3RNb2RlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHBvc2l0aW9ucyA9IHRoaXMuX3Bvc2l0aW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBhbGxQb3RlbnRpYWxFZGl0cyA9IFtyZXBsYWNlbWVudCwgLi4uZ2V0U2Vjb25kYXJ5RWRpdHModGhpcy50ZXh0TW9kZWwsIHBvc2l0aW9ucywgcmVwbGFjZW1lbnQpXTtcblx0XHRcdGNvbnN0IHZhbGlkRWRpdHNBbmRHaG9zdFRleHRzID0gYWxsUG90ZW50aWFsRWRpdHNcblx0XHRcdFx0Lm1hcCgoZWRpdCwgaWR4KSA9PiAoeyBlZGl0LCBnaG9zdFRleHQ6IGVkaXQgPyBjb21wdXRlR2hvc3RUZXh0KGVkaXQsIG1vZGVsLCBtb2RlLCBwb3NpdGlvbnNbaWR4XSwgMCkgOiB1bmRlZmluZWQgfSkpXG5cdFx0XHRcdC5maWx0ZXIoKHsgZWRpdCwgZ2hvc3RUZXh0IH0pID0+IGVkaXQgIT09IHVuZGVmaW5lZCAmJiBnaG9zdFRleHQgIT09IHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBlZGl0cyA9IHZhbGlkRWRpdHNBbmRHaG9zdFRleHRzLm1hcCgoeyBlZGl0IH0pID0+IGVkaXQhKTtcblx0XHRcdGNvbnN0IGdob3N0VGV4dHMgPSB2YWxpZEVkaXRzQW5kR2hvc3RUZXh0cy5tYXAoKHsgZ2hvc3RUZXh0IH0pID0+IGdob3N0VGV4dCEpO1xuXHRcdFx0aWYgKCFnaG9zdFRleHRzWzBdKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdHJldHVybiB7IGtpbmQ6ICdnaG9zdFRleHQnLCBlZGl0cywgcHJpbWFyeUdob3N0VGV4dDogZ2hvc3RUZXh0c1swXSwgZ2hvc3RUZXh0cywgaW5saW5lU3VnZ2VzdGlvbiwgc3VnZ2VzdEl0ZW06IHVuZGVmaW5lZCB9O1xuXHRcdH1cblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IHN0YXR1cyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRpZiAodGhpcy5fc291cmNlLmxvYWRpbmcucmVhZChyZWFkZXIpKSB7IHJldHVybiAnbG9hZGluZyc7IH1cblx0XHRjb25zdCBzID0gdGhpcy5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKHM/LmtpbmQgPT09ICdnaG9zdFRleHQnKSB7IHJldHVybiAnZ2hvc3RUZXh0JzsgfVxuXHRcdGlmIChzPy5raW5kID09PSAnaW5saW5lRWRpdCcpIHsgcmV0dXJuICdpbmxpbmVFZGl0JzsgfVxuXHRcdHJldHVybiAnbm9TdWdnZXN0aW9uJztcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IGlubGluZUNvbXBsZXRpb25TdGF0ZSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBzID0gdGhpcy5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzIHx8IHMua2luZCAhPT0gJ2dob3N0VGV4dCcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9lZGl0b3JPYnMuaW5Db21wb3NpdGlvbi5yZWFkKHJlYWRlcikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBzO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaW5saW5lRWRpdFN0YXRlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHMgPSB0aGlzLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXMgfHwgcy5raW5kICE9PSAnaW5saW5lRWRpdCcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBzO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaW5saW5lRWRpdEF2YWlsYWJsZSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBzID0gdGhpcy5pbmxpbmVFZGl0U3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiAhIXM7XG5cdH0pO1xuXG5cdHByaXZhdGUgX2NvbXB1dGVBdWdtZW50YXRpb24oc3VnZ2VzdENvbXBsZXRpb246IFRleHRSZXBsYWNlbWVudCwgcmVhZGVyOiBJUmVhZGVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLnRleHRNb2RlbDtcblx0XHRjb25zdCBzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMgPSB0aGlzLl9zb3VyY2Uuc3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBjYW5kaWRhdGVJbmxpbmVDb21wbGV0aW9ucyA9IHN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9uc1xuXHRcdFx0PyBzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMuaW5saW5lQ29tcGxldGlvbnMuZmlsdGVyKGMgPT4gIWMuaXNJbmxpbmVFZGl0KVxuXHRcdFx0OiBbdGhpcy5zZWxlY3RlZElubGluZUNvbXBsZXRpb24ucmVhZChyZWFkZXIpXS5maWx0ZXIoaXNEZWZpbmVkKTtcblxuXHRcdGNvbnN0IGF1Z21lbnRlZENvbXBsZXRpb24gPSBtYXBGaW5kRmlyc3QoY2FuZGlkYXRlSW5saW5lQ29tcGxldGlvbnMsIGNvbXBsZXRpb24gPT4ge1xuXHRcdFx0bGV0IHIgPSBjb21wbGV0aW9uLmdldFNpbmdsZVRleHRFZGl0KCk7XG5cdFx0XHRyID0gc2luZ2xlVGV4dFJlbW92ZUNvbW1vblByZWZpeChcblx0XHRcdFx0cixcblx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFJhbmdlLmZyb21Qb3NpdGlvbnMoci5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCksIHN1Z2dlc3RDb21wbGV0aW9uLnJhbmdlLmdldEVuZFBvc2l0aW9uKCkpXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuIHNpbmdsZVRleHRFZGl0QXVnbWVudHMociwgc3VnZ2VzdENvbXBsZXRpb24pID8geyBjb21wbGV0aW9uLCBlZGl0OiByIH0gOiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gYXVnbWVudGVkQ29tcGxldGlvbjtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSB3YXJuaW5nID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdHJldHVybiB0aGlzLmlubGluZUNvbXBsZXRpb25TdGF0ZS5yZWFkKHJlYWRlcik/LmlubGluZVN1Z2dlc3Rpb24/Lndhcm5pbmc7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBnaG9zdFRleHRzID0gZGVyaXZlZE9wdHMoeyBvd25lcjogdGhpcywgZXF1YWxzRm46IGdob3N0VGV4dHNPclJlcGxhY2VtZW50c0VxdWFsIH0sIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgdiA9IHRoaXMuaW5saW5lQ29tcGxldGlvblN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB2Lmdob3N0VGV4dHM7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBwcmltYXJ5R2hvc3RUZXh0ID0gZGVyaXZlZE9wdHMoeyBvd25lcjogdGhpcywgZXF1YWxzRm46IGdob3N0VGV4dE9yUmVwbGFjZW1lbnRFcXVhbHMgfSwgcmVhZGVyID0+IHtcblx0XHRjb25zdCB2ID0gdGhpcy5pbmxpbmVDb21wbGV0aW9uU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGlmICghdikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHY/LnByaW1hcnlHaG9zdFRleHQ7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBzaG93Q29sbGFwc2VkID0gZGVyaXZlZDxib29sZWFuPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZS5raW5kICE9PSAnaW5saW5lRWRpdCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoc3RhdGUuaW5saW5lU3VnZ2VzdGlvbi5oaW50IHx8IHN0YXRlLmlubGluZVN1Z2dlc3Rpb24uYWN0aW9uPy5raW5kID09PSAnanVtcFRvJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQ3VycmVudE1vZGVsVmVyc2lvbiA9IHN0YXRlLmlubGluZVN1Z2dlc3Rpb24udXBkYXRlZEVkaXRNb2RlbFZlcnNpb24gPT09IHRoaXMuX3RleHRNb2RlbFZlcnNpb25JZC5yZWFkKHJlYWRlcik7XG5cdFx0cmV0dXJuICh0aGlzLl9pbmxpbmVFZGl0c1Nob3dDb2xsYXBzZWRFbmFibGVkLnJlYWQocmVhZGVyKSB8fCAhaXNDdXJyZW50TW9kZWxWZXJzaW9uKVxuXHRcdFx0JiYgdGhpcy5fanVtcGVkVG9JZC5yZWFkKHJlYWRlcikgIT09IHN0YXRlLmlubGluZVN1Z2dlc3Rpb24uc2VtYW50aWNJZFxuXHRcdFx0JiYgIXRoaXMuX2luQWNjZXB0Rmxvdy5yZWFkKHJlYWRlcik7XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RhYlNob3VsZEluZGVudCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRpZiAodGhpcy5faW5BY2NlcHRGbG93LnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGlzTXVsdGlMaW5lKHJhbmdlOiBSYW5nZSk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIHJhbmdlLnN0YXJ0TGluZU51bWJlciAhPT0gcmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBnZXROb25JbmRlbnRhdGlvblJhbmdlKG1vZGVsOiBJVGV4dE1vZGVsLCBsaW5lTnVtYmVyOiBudW1iZXIpOiBSYW5nZSB7XG5cdFx0XHRjb25zdCBjb2x1bW5TdGFydCA9IG1vZGVsLmdldExpbmVJbmRlbnRDb2x1bW4obGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBsYXN0Tm9uV3NDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4obGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBjb2x1bW5FbmQgPSBNYXRoLm1heChsYXN0Tm9uV3NDb2x1bW4sIGNvbHVtblN0YXJ0KTtcblx0XHRcdHJldHVybiBuZXcgUmFuZ2UobGluZU51bWJlciwgY29sdW1uU3RhcnQsIGxpbmVOdW1iZXIsIGNvbHVtbkVuZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHRoaXMuX2VkaXRvck9icy5zZWxlY3Rpb25zLnJlYWQocmVhZGVyKTtcblx0XHRyZXR1cm4gc2VsZWN0aW9ucz8uc29tZShzID0+IHtcblx0XHRcdGlmIChzLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy50ZXh0TW9kZWwuZ2V0TGluZUxlbmd0aChzLnN0YXJ0TGluZU51bWJlcikgPT09IDA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gaXNNdWx0aUxpbmUocykgfHwgcy5jb250YWluc1JhbmdlKGdldE5vbkluZGVudGF0aW9uUmFuZ2UodGhpcy50ZXh0TW9kZWwsIHMuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSB0YWJTaG91bGRKdW1wVG9JbmxpbmVFZGl0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGlmICh0aGlzLl90YWJTaG91bGRJbmRlbnQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcyA9IHRoaXMuaW5saW5lRWRpdFN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblxuXHRcdGlmIChzLmlubGluZVN1Z2dlc3Rpb24uYWN0aW9uPy5raW5kID09PSAnanVtcFRvJykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2hvd0NvbGxhcHNlZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pbkFjY2VwdEZsb3cucmVhZChyZWFkZXIpICYmIHRoaXMuX2FwcGVhcmVkSW5zaWRlVmlld3BvcnQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICFzLmN1cnNvckF0SW5saW5lRWRpdC5yZWFkKHJlYWRlcik7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSB0YWJTaG91bGRBY2NlcHRJbmxpbmVFZGl0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHMgPSB0aGlzLmlubGluZUVkaXRTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChzLmlubGluZVN1Z2dlc3Rpb24uYWN0aW9uPy5raW5kID09PSAnanVtcFRvJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5zaG93Q29sbGFwc2VkLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fdGFiU2hvdWxkSW5kZW50LnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faW5BY2NlcHRGbG93LnJlYWQocmVhZGVyKSAmJiB0aGlzLl9hcHBlYXJlZEluc2lkZVZpZXdwb3J0LnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChzLmlubGluZVN1Z2dlc3Rpb24udGFyZ2V0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSB0aGlzLl9lZGl0b3JPYnMuY3Vyc29yTGluZU51bWJlci5yZWFkKHJlYWRlcikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fanVtcGVkVG9JZC5yZWFkKHJlYWRlcikgPT09IHMuaW5saW5lU3VnZ2VzdGlvbi5zZW1hbnRpY0lkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcy5jdXJzb3JBdElubGluZUVkaXQucmVhZChyZWFkZXIpO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaXNJbkRpZmZFZGl0b3I7XG5cblx0cHVibGljIHJlYWRvbmx5IGVkaXRvclR5cGU6IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlO1xuXG5cdHByaXZhdGUgYXN5bmMgX2RlbHRhU2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uSW5kZXgoZGVsdGE6IDEgfCAtMSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMudHJpZ2dlckV4cGxpY2l0bHkoKTtcblxuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gdGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW1zLmdldCgpIHx8IFtdO1xuXHRcdGlmIChjb21wbGV0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBuZXdJZHggPSAodGhpcy5zZWxlY3RlZElubGluZUNvbXBsZXRpb25JbmRleC5nZXQoKSArIGRlbHRhICsgY29tcGxldGlvbnMubGVuZ3RoKSAlIGNvbXBsZXRpb25zLmxlbmd0aDtcblx0XHRcdHRoaXMuX3NlbGVjdGVkSW5saW5lQ29tcGxldGlvbklkLnNldChjb21wbGV0aW9uc1tuZXdJZHhdLnNlbWFudGljSWQsIHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3NlbGVjdGVkSW5saW5lQ29tcGxldGlvbklkLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIG5leHQoKTogUHJvbWlzZTx2b2lkPiB7IGF3YWl0IHRoaXMuX2RlbHRhU2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uSW5kZXgoMSk7IH1cblxuXHRwdWJsaWMgYXN5bmMgcHJldmlvdXMoKTogUHJvbWlzZTx2b2lkPiB7IGF3YWl0IHRoaXMuX2RlbHRhU2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uSW5kZXgoLTEpOyB9XG5cblx0cHJpdmF0ZSBfZ2V0TWV0YWRhdGEoY29tcGxldGlvbjogSW5saW5lU3VnZ2VzdGlvbkl0ZW0sIGxhbmd1YWdlSWQ6IHN0cmluZywgdHlwZTogJ3dvcmQnIHwgJ2xpbmUnIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogVGV4dE1vZGVsRWRpdFNvdXJjZSB7XG5cdFx0aWYgKHR5cGUpIHtcblx0XHRcdHJldHVybiBFZGl0U291cmNlcy5pbmxpbmVDb21wbGV0aW9uUGFydGlhbEFjY2VwdCh7XG5cdFx0XHRcdG5lczogY29tcGxldGlvbi5pc0lubGluZUVkaXQsXG5cdFx0XHRcdHJlcXVlc3RVdWlkOiBjb21wbGV0aW9uLnJlcXVlc3RVdWlkLFxuXHRcdFx0XHRwcm92aWRlcklkOiBjb21wbGV0aW9uLnNvdXJjZS5wcm92aWRlci5wcm92aWRlcklkLFxuXHRcdFx0XHRsYW5ndWFnZUlkLFxuXHRcdFx0XHR0eXBlLFxuXHRcdFx0XHRjb3JyZWxhdGlvbklkOiBjb21wbGV0aW9uLmdldFNvdXJjZUNvbXBsZXRpb24oKS5jb3JyZWxhdGlvbklkLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBFZGl0U291cmNlcy5pbmxpbmVDb21wbGV0aW9uQWNjZXB0KHtcblx0XHRcdFx0bmVzOiBjb21wbGV0aW9uLmlzSW5saW5lRWRpdCxcblx0XHRcdFx0cmVxdWVzdFV1aWQ6IGNvbXBsZXRpb24ucmVxdWVzdFV1aWQsXG5cdFx0XHRcdGNvcnJlbGF0aW9uSWQ6IGNvbXBsZXRpb24uZ2V0U291cmNlQ29tcGxldGlvbigpLmNvcnJlbGF0aW9uSWQsXG5cdFx0XHRcdHByb3ZpZGVySWQ6IGNvbXBsZXRpb24uc291cmNlLnByb3ZpZGVyLnByb3ZpZGVySWQsXG5cdFx0XHRcdGxhbmd1YWdlSWRcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBhY2NlcHQoZWRpdG9yOiBJQ29kZUVkaXRvciA9IHRoaXMuX2VkaXRvciwgYWx0ZXJuYXRpdmVBY3Rpb246IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChlZGl0b3IuZ2V0TW9kZWwoKSAhPT0gdGhpcy50ZXh0TW9kZWwpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoKTtcblx0XHR9XG5cblx0XHRsZXQgY29tcGxldGlvbjogSW5saW5lU3VnZ2VzdGlvbkl0ZW07XG5cdFx0bGV0IGlzTmV4dEVkaXRVcmkgPSBmYWxzZTtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlPy5raW5kID09PSAnZ2hvc3RUZXh0Jykge1xuXHRcdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZS5wcmltYXJ5R2hvc3RUZXh0LmlzRW1wdHkoKSB8fCAhc3RhdGUuaW5saW5lU3VnZ2VzdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb21wbGV0aW9uID0gc3RhdGUuaW5saW5lU3VnZ2VzdGlvbjtcblx0XHR9IGVsc2UgaWYgKHN0YXRlPy5raW5kID09PSAnaW5saW5lRWRpdCcpIHtcblx0XHRcdGNvbXBsZXRpb24gPSBzdGF0ZS5pbmxpbmVTdWdnZXN0aW9uO1xuXHRcdFx0aXNOZXh0RWRpdFVyaSA9ICEhc3RhdGUubmV4dEVkaXRVcmk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgdGhlIGNvbXBsZXRpb24gbGlzdCB3aWxsIG5vdCBiZSBkaXNwb3NlZCBiZWZvcmUgdGhlIHRleHQgY2hhbmdlIGlzIHNlbnQuXG5cdFx0Y29tcGxldGlvbi5hZGRSZWYoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRsZXQgZm9sbG93VXBUcmlnZ2VyID0gZmFsc2U7XG5cdFx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cblx0XHRcdGlmICghY29tcGxldGlvbi5vcmlnaW5hbFRleHRSZWYudGFyZ2V0cyh0aGlzLnRleHRNb2RlbCkpIHtcblx0XHRcdFx0Ly8gVGhlIGVkaXQgdGFyZ2V0cyBhIGRpZmZlcmVudCBkb2N1bWVudCwgb3BlbiBpdCBhbmQgdHJhbnNwbGFudCB0aGUgY29tcGxldGlvblxuXHRcdFx0XHRjb25zdCB0YXJnZXRFZGl0b3IgPSBhd2FpdCB0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5vcGVuQ29kZUVkaXRvcih7IHJlc291cmNlOiBjb21wbGV0aW9uLm9yaWdpbmFsVGV4dFJlZi51cmkgfSwgdGhpcy5fZWRpdG9yKTtcblx0XHRcdFx0aWYgKHRhcmdldEVkaXRvcikge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBnZXRJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIodGFyZ2V0RWRpdG9yKTtcblx0XHRcdFx0XHRjb25zdCBtID0gY29udHJvbGxlcj8ubW9kZWwuZ2V0KCk7XG5cdFx0XHRcdFx0dGFyZ2V0RWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdFx0bT8udHJhbnNwbGFudENvbXBsZXRpb24oY29tcGxldGlvbik7XG5cdFx0XHRcdFx0dGFyZ2V0RWRpdG9yLnJldmVhbExpbmVJbkNlbnRlcihjb21wbGV0aW9uLnRhcmdldFJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXNOZXh0RWRpdFVyaSkge1xuXHRcdFx0XHQvLyBEbyBub3RoaW5nXG5cdFx0XHR9IGVsc2UgaWYgKGNvbXBsZXRpb24uYWN0aW9uPy5raW5kID09PSAnZWRpdCcpIHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gY29tcGxldGlvbi5hY3Rpb247XG5cdFx0XHRcdGlmIChhbHRlcm5hdGl2ZUFjdGlvbiAmJiBhY3Rpb24uYWx0ZXJuYXRpdmVBY3Rpb24pIHtcblx0XHRcdFx0XHRmb2xsb3dVcFRyaWdnZXIgPSB0cnVlO1xuXHRcdFx0XHRcdGNvbnN0IGFsdENvbW1hbmQgPSBhY3Rpb24uYWx0ZXJuYXRpdmVBY3Rpb24uY29tbWFuZDtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZVxuXHRcdFx0XHRcdFx0LmV4ZWN1dGVDb21tYW5kKGFsdENvbW1hbmQuaWQsIC4uLihhbHRDb21tYW5kLmFyZ3VtZW50cyB8fCBbXSkpXG5cdFx0XHRcdFx0XHQudGhlbih1bmRlZmluZWQsIG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5zbmlwcGV0SW5mbykge1xuXHRcdFx0XHRcdGNvbnN0IG1haW5FZGl0ID0gVGV4dFJlcGxhY2VtZW50LmRlbGV0ZShhY3Rpb24udGV4dFJlcGxhY2VtZW50LnJhbmdlKTtcblx0XHRcdFx0XHRjb25zdCBhZGRpdGlvbmFsRWRpdHMgPSBjb21wbGV0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHMubWFwKGUgPT4gbmV3IFRleHRSZXBsYWNlbWVudChSYW5nZS5saWZ0KGUucmFuZ2UpLCBlLnRleHQgPz8gJycpKTtcblx0XHRcdFx0XHRjb25zdCBlZGl0ID0gVGV4dEVkaXQuZnJvbVBhcmFsbGVsUmVwbGFjZW1lbnRzVW5zb3J0ZWQoW21haW5FZGl0LCAuLi5hZGRpdGlvbmFsRWRpdHNdKTtcblx0XHRcdFx0XHRlZGl0b3IuZWRpdChlZGl0LCB0aGlzLl9nZXRNZXRhZGF0YShjb21wbGV0aW9uLCB0aGlzLnRleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCkpKTtcblxuXHRcdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbihhY3Rpb24uc25pcHBldEluZm8ucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpLCAnaW5saW5lQ29tcGxldGlvbkFjY2VwdCcpO1xuXHRcdFx0XHRcdFNuaXBwZXRDb250cm9sbGVyMi5nZXQoZWRpdG9yKT8uaW5zZXJ0KGFjdGlvbi5zbmlwcGV0SW5mby5zbmlwcGV0LCB7IHVuZG9TdG9wQmVmb3JlOiBmYWxzZSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBlZGl0cyA9IHN0YXRlLmVkaXRzO1xuXG5cdFx0XHRcdFx0Ly8gVGhlIGN1cnNvciBzaG91bGQgbW92ZSB0byB0aGUgZW5kIG9mIHRoZSBlZGl0LCBub3QgdGhlIGVuZCBvZiB0aGUgcmFuZ2UgcHJvdmlkZWQgYnkgdGhlIGV4dGVuc2lvblxuXHRcdFx0XHRcdC8vIElubGluZSBFZGl0IGRpZmZzIChodW1hbiByZWFkYWJsZSkgdGhlIHN1Z2dlc3Rpb24gZnJvbSB0aGUgZXh0ZW5zaW9uIHNvIGl0IGFscmVhZHkgcmVtb3ZlcyBjb21tb24gc3VmZml4L3ByZWZpeFxuXHRcdFx0XHRcdC8vIElubGluZSBDb21wbGV0aW9ucyBkb2VzIGRpZmYgdGhlIHN1Z2dlc3Rpb24gc28gaXQgbWF5IGNvbnRhaW4gY29tbW9uIHN1ZmZpeFxuXHRcdFx0XHRcdGxldCBtaW5pbWFsRWRpdHMgPSBlZGl0cztcblx0XHRcdFx0XHRpZiAoc3RhdGUua2luZCA9PT0gJ2dob3N0VGV4dCcpIHtcblx0XHRcdFx0XHRcdG1pbmltYWxFZGl0cyA9IHJlbW92ZVRleHRSZXBsYWNlbWVudENvbW1vblN1ZmZpeFByZWZpeChlZGl0cywgdGhpcy50ZXh0TW9kZWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gZ2V0RW5kUG9zaXRpb25zQWZ0ZXJBcHBseWluZyhtaW5pbWFsRWRpdHMpLm1hcChwID0+IFNlbGVjdGlvbi5mcm9tUG9zaXRpb25zKHApKTtcblxuXHRcdFx0XHRcdGNvbnN0IGFkZGl0aW9uYWxFZGl0cyA9IGNvbXBsZXRpb24uYWRkaXRpb25hbFRleHRFZGl0cy5tYXAoZSA9PiBuZXcgVGV4dFJlcGxhY2VtZW50KFJhbmdlLmxpZnQoZS5yYW5nZSksIGUudGV4dCA/PyAnJykpO1xuXHRcdFx0XHRcdGNvbnN0IGVkaXQgPSBUZXh0RWRpdC5mcm9tUGFyYWxsZWxSZXBsYWNlbWVudHNVbnNvcnRlZChbLi4uZWRpdHMsIC4uLmFkZGl0aW9uYWxFZGl0c10pO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLmVkaXQoZWRpdCwgdGhpcy5fZ2V0TWV0YWRhdGEoY29tcGxldGlvbiwgdGhpcy50ZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKSk7XG5cblx0XHRcdFx0XHRpZiAoY29tcGxldGlvbi5oaW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdC8vIGRvIG5vdCBtb3ZlIHRoZSBjdXJzb3Igd2hlbiB0aGUgY29tcGxldGlvbiBpcyBkaXNwbGF5ZWQgaW4gYSBkaWZmZXJlbnQgbG9jYXRpb25cblx0XHRcdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKHN0YXRlLmtpbmQgPT09ICdpbmxpbmVFZGl0JyA/IHNlbGVjdGlvbnMuc2xpY2UoLTEpIDogc2VsZWN0aW9ucywgJ2lubGluZUNvbXBsZXRpb25BY2NlcHQnKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoc3RhdGUua2luZCA9PT0gJ2lubGluZUVkaXQnICYmICF0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZWRpdFJhbmdlcyA9IGVkaXQuZ2V0TmV3UmFuZ2VzKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBkZWMgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEZhZGVvdXREZWNvcmF0aW9uKGVkaXRvciwgZWRpdFJhbmdlcywgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zdG9yZS5kZWxldGUoZGVjKTtcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb25EaWRBY2NlcHQuZmlyZSgpO1xuXG5cdFx0XHQvLyBSZXNldCBiZWZvcmUgaW52b2tpbmcgdGhlIGNvbW1hbmQsIGFzIHRoZSBjb21tYW5kIG1pZ2h0IGNhdXNlIGEgZm9sbG93IHVwIHRyaWdnZXIgKHdoaWNoIHdlIGRvbid0IHdhbnQgdG8gcmVzZXQpLlxuXHRcdFx0dGhpcy5zdG9wKCk7XG5cblx0XHRcdGlmIChjb21wbGV0aW9uLmNvbW1hbmQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY29tbWFuZFNlcnZpY2Vcblx0XHRcdFx0XHQuZXhlY3V0ZUNvbW1hbmQoY29tcGxldGlvbi5jb21tYW5kLmlkLCAuLi4oY29tcGxldGlvbi5jb21tYW5kLmFyZ3VtZW50cyB8fCBbXSkpXG5cdFx0XHRcdFx0LnRoZW4odW5kZWZpbmVkLCBvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVE9ETzogaG93IGNhbiB3ZSBtYWtlIGFsdGVybmF0aXZlIGFjdGlvbnMgdG8gcmV0cmlnZ2VyP1xuXHRcdFx0aWYgKGZvbGxvd1VwVHJpZ2dlcikge1xuXHRcdFx0XHR0aGlzLnRyaWdnZXIodW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdFx0Y29tcGxldGlvbi5yZXBvcnRFbmRPZkxpZmUoeyBraW5kOiBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZC5BY2NlcHRlZCwgYWx0ZXJuYXRpdmVBY3Rpb24gfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNvbXBsZXRpb24ucmVtb3ZlUmVmKCk7XG5cdFx0XHR0aGlzLl9pbkFjY2VwdEZsb3cuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9sYXN0QWNjZXB0ZWRJbmxpbmVDb21wbGV0aW9uSW5mbyA9IHsgdGV4dE1vZGVsVmVyc2lvbklkQWZ0ZXI6IHRoaXMudGV4dE1vZGVsLmdldFZlcnNpb25JZCgpLCBpbmxpbmVDb21wbGV0aW9uOiBjb21wbGV0aW9uIH07XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGFjY2VwdE5leHRXb3JkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2FjY2VwdE5leHQodGhpcy5fZWRpdG9yLCAnd29yZCcsIChwb3MsIHRleHQpID0+IHtcblx0XHRcdGNvbnN0IGxhbmdJZCA9IHRoaXMudGV4dE1vZGVsLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKHBvcy5saW5lTnVtYmVyLCBwb3MuY29sdW1uKTtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmdJZCk7XG5cdFx0XHRjb25zdCB3b3JkUmVnRXhwID0gbmV3IFJlZ0V4cChjb25maWcud29yZERlZmluaXRpb24uc291cmNlLCBjb25maWcud29yZERlZmluaXRpb24uZmxhZ3MucmVwbGFjZSgnZycsICcnKSk7XG5cblx0XHRcdGNvbnN0IG0xID0gdGV4dC5tYXRjaCh3b3JkUmVnRXhwKTtcblx0XHRcdGxldCBhY2NlcHRVbnRpbEluZGV4RXhjbHVzaXZlID0gMDtcblx0XHRcdGlmIChtMSAmJiBtMS5pbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmIChtMS5pbmRleCA9PT0gMCkge1xuXHRcdFx0XHRcdGFjY2VwdFVudGlsSW5kZXhFeGNsdXNpdmUgPSBtMVswXS5sZW5ndGg7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YWNjZXB0VW50aWxJbmRleEV4Y2x1c2l2ZSA9IG0xLmluZGV4O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhY2NlcHRVbnRpbEluZGV4RXhjbHVzaXZlID0gdGV4dC5sZW5ndGg7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdzUmVnRXhwID0gL1xccysvZztcblx0XHRcdGNvbnN0IG0yID0gd3NSZWdFeHAuZXhlYyh0ZXh0KTtcblx0XHRcdGlmIChtMiAmJiBtMi5pbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmIChtMi5pbmRleCArIG0yWzBdLmxlbmd0aCA8IGFjY2VwdFVudGlsSW5kZXhFeGNsdXNpdmUpIHtcblx0XHRcdFx0XHRhY2NlcHRVbnRpbEluZGV4RXhjbHVzaXZlID0gbTIuaW5kZXggKyBtMlswXS5sZW5ndGg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBhY2NlcHRVbnRpbEluZGV4RXhjbHVzaXZlO1xuXHRcdH0sIFBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZC5Xb3JkKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBhY2NlcHROZXh0TGluZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9hY2NlcHROZXh0KHRoaXMuX2VkaXRvciwgJ2xpbmUnLCAocG9zLCB0ZXh0KSA9PiB7XG5cdFx0XHRjb25zdCBtID0gdGV4dC5tYXRjaCgvXFxuLyk7XG5cdFx0XHRpZiAobSAmJiBtLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIG0uaW5kZXggKyAxO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRleHQubGVuZ3RoO1xuXHRcdH0sIFBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZC5MaW5lKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FjY2VwdE5leHQoZWRpdG9yOiBJQ29kZUVkaXRvciwgdHlwZTogJ3dvcmQnIHwgJ2xpbmUnLCBnZXRBY2NlcHRVbnRpbEluZGV4OiAocG9zaXRpb246IFBvc2l0aW9uLCB0ZXh0OiBzdHJpbmcpID0+IG51bWJlciwga2luZDogUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGVkaXRvci5nZXRNb2RlbCgpICE9PSB0aGlzLnRleHRNb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5pbmxpbmVDb21wbGV0aW9uU3RhdGUuZ2V0KCk7XG5cdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZS5wcmltYXJ5R2hvc3RUZXh0LmlzRW1wdHkoKSB8fCAhc3RhdGUuaW5saW5lU3VnZ2VzdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBnaG9zdFRleHQgPSBzdGF0ZS5wcmltYXJ5R2hvc3RUZXh0O1xuXHRcdGNvbnN0IGNvbXBsZXRpb24gPSBzdGF0ZS5pbmxpbmVTdWdnZXN0aW9uO1xuXG5cdFx0aWYgKGNvbXBsZXRpb24uc25pcHBldEluZm8pIHtcblx0XHRcdC8vIG5vdCBpbiBXWVNJV1lHIG1vZGUsIHBhcnRpYWwgY29tbWl0IG1pZ2h0IGNoYW5nZSBjb21wbGV0aW9uLCB0aHVzIGl0IGlzIG5vdCBzdXBwb3J0ZWRcblx0XHRcdGF3YWl0IHRoaXMuYWNjZXB0KGVkaXRvcik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlyc3RQYXJ0ID0gZ2hvc3RUZXh0LnBhcnRzWzBdO1xuXHRcdGNvbnN0IGdob3N0VGV4dFBvcyA9IG5ldyBQb3NpdGlvbihnaG9zdFRleHQubGluZU51bWJlciwgZmlyc3RQYXJ0LmNvbHVtbik7XG5cdFx0Y29uc3QgZ2hvc3RUZXh0VmFsID0gZmlyc3RQYXJ0LnRleHQ7XG5cdFx0Y29uc3QgYWNjZXB0VW50aWxJbmRleEV4Y2x1c2l2ZSA9IGdldEFjY2VwdFVudGlsSW5kZXgoZ2hvc3RUZXh0UG9zLCBnaG9zdFRleHRWYWwpO1xuXHRcdGlmIChhY2NlcHRVbnRpbEluZGV4RXhjbHVzaXZlID09PSBnaG9zdFRleHRWYWwubGVuZ3RoICYmIGdob3N0VGV4dC5wYXJ0cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHRoaXMuYWNjZXB0KGVkaXRvcik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnRpYWxHaG9zdFRleHRWYWwgPSBnaG9zdFRleHRWYWwuc3Vic3RyaW5nKDAsIGFjY2VwdFVudGlsSW5kZXhFeGNsdXNpdmUpO1xuXG5cdFx0Y29uc3QgcG9zaXRpb25zID0gdGhpcy5fcG9zaXRpb25zLmdldCgpO1xuXHRcdGNvbnN0IGN1cnNvclBvc2l0aW9uID0gcG9zaXRpb25zWzBdO1xuXG5cdFx0Ly8gRXhlY3V0aW5nIHRoZSBlZGl0IG1pZ2h0IGZyZWUgdGhlIGNvbXBsZXRpb24sIHNvIHdlIGhhdmUgdG8gaG9sZCBhIHJlZmVyZW5jZSBvbiBpdC5cblx0XHRjb21wbGV0aW9uLmFkZFJlZigpO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9pc0FjY2VwdGluZ1BhcnRpYWxseSA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHRcdGNvbnN0IHJlcGxhY2VSYW5nZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMoY3Vyc29yUG9zaXRpb24sIGdob3N0VGV4dFBvcyk7XG5cdFx0XHRcdGNvbnN0IG5ld1RleHQgPSBlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWVJblJhbmdlKHJlcGxhY2VSYW5nZSkgKyBwYXJ0aWFsR2hvc3RUZXh0VmFsO1xuXHRcdFx0XHRjb25zdCBwcmltYXJ5RWRpdCA9IG5ldyBUZXh0UmVwbGFjZW1lbnQocmVwbGFjZVJhbmdlLCBuZXdUZXh0KTtcblx0XHRcdFx0Y29uc3QgZWRpdHMgPSBbcHJpbWFyeUVkaXQsIC4uLmdldFNlY29uZGFyeUVkaXRzKHRoaXMudGV4dE1vZGVsLCBwb3NpdGlvbnMsIHByaW1hcnlFZGl0KV0uZmlsdGVyKGlzRGVmaW5lZCk7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBnZXRFbmRQb3NpdGlvbnNBZnRlckFwcGx5aW5nKGVkaXRzKS5tYXAocCA9PiBTZWxlY3Rpb24uZnJvbVBvc2l0aW9ucyhwKSk7XG5cblx0XHRcdFx0ZWRpdG9yLmVkaXQoVGV4dEVkaXQuZnJvbVBhcmFsbGVsUmVwbGFjZW1lbnRzVW5zb3J0ZWQoZWRpdHMpLCB0aGlzLl9nZXRNZXRhZGF0YShjb21wbGV0aW9uLCB0aGlzLnRleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCksIHR5cGUpKTtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoc2VsZWN0aW9ucywgJ2lubGluZUNvbXBsZXRpb25QYXJ0aWFsQWNjZXB0Jyk7XG5cdFx0XHRcdGVkaXRvci5yZXZlYWxQb3NpdGlvbkluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQoZWRpdG9yLmdldFBvc2l0aW9uKCkhLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9pc0FjY2VwdGluZ1BhcnRpYWxseSA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY2NlcHRlZFJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhjb21wbGV0aW9uLmVkaXRSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCksIFRleHRMZW5ndGgub2ZUZXh0KHBhcnRpYWxHaG9zdFRleHRWYWwpLmFkZFRvUG9zaXRpb24oZ2hvc3RUZXh0UG9zKSk7XG5cdFx0XHQvLyBUaGlzIGFzc3VtZXMgdGhhdCB0aGUgaW5saW5lIGNvbXBsZXRpb24gYW5kIHRoZSBtb2RlbCB1c2UgdGhlIHNhbWUgRU9MIHN0eWxlLlxuXHRcdFx0Y29uc3QgdGV4dCA9IGVkaXRvci5nZXRNb2RlbCgpIS5nZXRWYWx1ZUluUmFuZ2UoYWNjZXB0ZWRSYW5nZSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRik7XG5cdFx0XHRjb25zdCBhY2NlcHRlZExlbmd0aCA9IHRleHQubGVuZ3RoO1xuXHRcdFx0Y29tcGxldGlvbi5yZXBvcnRQYXJ0aWFsQWNjZXB0KFxuXHRcdFx0XHRhY2NlcHRlZExlbmd0aCxcblx0XHRcdFx0eyBraW5kLCBhY2NlcHRlZExlbmd0aDogYWNjZXB0ZWRMZW5ndGggfSxcblx0XHRcdFx0eyBjaGFyYWN0ZXJzOiBhY2NlcHRVbnRpbEluZGV4RXhjbHVzaXZlLCByYXRpbzogYWNjZXB0VW50aWxJbmRleEV4Y2x1c2l2ZSAvIGdob3N0VGV4dFZhbC5sZW5ndGgsIGNvdW50OiAxIH1cblx0XHRcdCk7XG5cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y29tcGxldGlvbi5yZW1vdmVSZWYoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlU3VnZ2VzdEFjY2VwdGVkKGl0ZW06IFN1Z2dlc3RJdGVtSW5mbykge1xuXHRcdGNvbnN0IGl0ZW1FZGl0ID0gc2luZ2xlVGV4dFJlbW92ZUNvbW1vblByZWZpeChpdGVtLmdldFNpbmdsZVRleHRFZGl0KCksIHRoaXMudGV4dE1vZGVsKTtcblx0XHRjb25zdCBhdWdtZW50ZWRDb21wbGV0aW9uID0gdGhpcy5fY29tcHV0ZUF1Z21lbnRhdGlvbihpdGVtRWRpdCwgdW5kZWZpbmVkKTtcblx0XHRpZiAoIWF1Z21lbnRlZENvbXBsZXRpb24pIHsgcmV0dXJuOyB9XG5cblx0XHQvLyBUaGlzIGFzc3VtZXMgdGhhdCB0aGUgaW5saW5lIGNvbXBsZXRpb24gYW5kIHRoZSBtb2RlbCB1c2UgdGhlIHNhbWUgRU9MIHN0eWxlLlxuXHRcdGNvbnN0IGFscmVhZHlBY2NlcHRlZExlbmd0aCA9IHRoaXMudGV4dE1vZGVsLmdldFZhbHVlSW5SYW5nZShhdWdtZW50ZWRDb21wbGV0aW9uLmNvbXBsZXRpb24uZWRpdFJhbmdlLCBFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKS5sZW5ndGg7XG5cdFx0Y29uc3QgYWNjZXB0ZWRMZW5ndGggPSBhbHJlYWR5QWNjZXB0ZWRMZW5ndGggKyBpdGVtRWRpdC50ZXh0Lmxlbmd0aDtcblxuXHRcdGF1Z21lbnRlZENvbXBsZXRpb24uY29tcGxldGlvbi5yZXBvcnRQYXJ0aWFsQWNjZXB0KGl0ZW1FZGl0LnRleHQubGVuZ3RoLCB7XG5cdFx0XHRraW5kOiBQYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQuU3VnZ2VzdCxcblx0XHRcdGFjY2VwdGVkTGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdGNoYXJhY3RlcnM6IGl0ZW1FZGl0LnRleHQubGVuZ3RoLFxuXHRcdFx0Y291bnQ6IDEsXG5cdFx0XHRyYXRpbzogMVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGV4dHJhY3RSZXByb1NhbXBsZSgpOiBSZXBybyB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLnRleHRNb2RlbC5nZXRWYWx1ZSgpO1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLnN0YXRlLmdldCgpPy5pbmxpbmVTdWdnZXN0aW9uO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkb2N1bWVudFZhbHVlOiB2YWx1ZSxcblx0XHRcdGlubGluZUNvbXBsZXRpb246IGl0ZW0/LmdldFNvdXJjZUNvbXBsZXRpb24oKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfanVtcGVkVG9JZCA9IG9ic2VydmFibGVWYWx1ZTx1bmRlZmluZWQgfCBzdHJpbmc+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luQWNjZXB0RmxvdyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdHB1YmxpYyByZWFkb25seSBpbkFjY2VwdEZsb3c6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5faW5BY2NlcHRGbG93O1xuXG5cdHB1YmxpYyBqdW1wKCk6IHZvaWQge1xuXHRcdGNvbnN0IHMgPSB0aGlzLmlubGluZUVkaXRTdGF0ZS5nZXQoKTtcblx0XHRpZiAoIXMpIHsgcmV0dXJuOyB9XG5cblx0XHRjb25zdCBzdWdnZXN0aW9uID0gcy5pbmxpbmVTdWdnZXN0aW9uO1xuXG5cdFx0aWYgKCFzdWdnZXN0aW9uLm9yaWdpbmFsVGV4dFJlZi50YXJnZXRzKHRoaXMudGV4dE1vZGVsKSkge1xuXHRcdFx0dGhpcy5hY2NlcHQodGhpcy5fZWRpdG9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblxuXHRcdHN1Z2dlc3Rpb24uYWRkUmVmKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0aWYgKHN1Z2dlc3Rpb24uYWN0aW9uPy5raW5kID09PSAnanVtcFRvJykge1xuXHRcdFx0XHRcdHRoaXMuc3RvcCh1bmRlZmluZWQsIHR4KTtcblx0XHRcdFx0XHRzdWdnZXN0aW9uLnJlcG9ydEVuZE9mTGlmZSh7IGtpbmQ6IElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLkFjY2VwdGVkLCBhbHRlcm5hdGl2ZUFjdGlvbjogZmFsc2UgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9qdW1wZWRUb0lkLnNldChzLmlubGluZVN1Z2dlc3Rpb24uc2VtYW50aWNJZCwgdHgpO1xuXHRcdFx0XHR0aGlzLmRvbnRSZWZldGNoU2lnbmFsLnRyaWdnZXIodHgpO1xuXHRcdFx0XHRjb25zdCB0YXJnZXRSYW5nZSA9IHMuaW5saW5lU3VnZ2VzdGlvbi50YXJnZXRSYW5nZTtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0UG9zaXRpb24gPSB0YXJnZXRSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX2VkaXRvci5zZXRQb3NpdGlvbih0YXJnZXRQb3NpdGlvbiwgJ2lubGluZUNvbXBsZXRpb25zLmp1bXAnKTtcblxuXHRcdFx0XHQvLyBUT0RPOiBjb25zaWRlciB1c2luZyB2aWV3IGluZm9ybWF0aW9uIHRvIHJldmVhbCBpdFxuXHRcdFx0XHRjb25zdCBpc1NpbmdsZUxpbmVDaGFuZ2UgPSB0YXJnZXRSYW5nZS5pc1NpbmdsZUxpbmUoKSAmJiAocy5pbmxpbmVTdWdnZXN0aW9uLmhpbnQgfHwgKHMuaW5saW5lU3VnZ2VzdGlvbi5hY3Rpb24/LmtpbmQgPT09ICdlZGl0JyAmJiAhcy5pbmxpbmVTdWdnZXN0aW9uLmFjdGlvbi50ZXh0UmVwbGFjZW1lbnQudGV4dC5pbmNsdWRlcygnXFxuJykpKTtcblx0XHRcdFx0aWYgKGlzU2luZ2xlTGluZUNoYW5nZSB8fCBzLmlubGluZVN1Z2dlc3Rpb24uYWN0aW9uPy5raW5kID09PSAnanVtcFRvJykge1xuXHRcdFx0XHRcdHRoaXMuX2VkaXRvci5yZXZlYWxQb3NpdGlvbih0YXJnZXRQb3NpdGlvbiwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHJldmVhbFJhbmdlID0gbmV3IFJhbmdlKHRhcmdldFJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsIDEsIHRhcmdldFJhbmdlLmVuZExpbmVOdW1iZXIgKyAxLCAxKTtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3IucmV2ZWFsUmFuZ2UocmV2ZWFsUmFuZ2UsIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHMuaW5saW5lU3VnZ2VzdGlvbi5pZGVudGl0eS5zZXRKdW1wVG8odHgpO1xuXG5cdFx0XHRcdHRoaXMuX2VkaXRvci5mb2N1cygpO1xuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN1Z2dlc3Rpb24ucmVtb3ZlUmVmKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGhhbmRsZUlubGluZVN1Z2dlc3Rpb25TaG93bihpbmxpbmVDb21wbGV0aW9uOiBJbmxpbmVTdWdnZXN0aW9uSXRlbSwgdmlld0tpbmQ6IElubGluZUNvbXBsZXRpb25WaWV3S2luZCwgdmlld0RhdGE6IElubGluZUNvbXBsZXRpb25WaWV3RGF0YSwgdGltZVdoZW5TaG93bjogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgaW5saW5lQ29tcGxldGlvbi5yZXBvcnRJbmxpbmVFZGl0U2hvd24odGhpcy5fY29tbWFuZFNlcnZpY2UsIHZpZXdLaW5kLCB2aWV3RGF0YSwgdGhpcy50ZXh0TW9kZWwsIHRpbWVXaGVuU2hvd24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyYW5zcGxhbnRzIGFuIGlubGluZSBjb21wbGV0aW9uIGZyb20gYW5vdGhlciBtb2RlbCB0byB0aGlzIG9uZS5cblx0ICogVXNlZCBmb3IgY3Jvc3MtZmlsZSBpbmxpbmUgZWRpdHMuXG5cdCAqL1xuXHRwdWJsaWMgdHJhbnNwbGFudENvbXBsZXRpb24oaXRlbTogSW5saW5lU3VnZ2VzdGlvbkl0ZW0pOiB2b2lkIHtcblx0XHQvLyBObyBleHBsaWNpdCBhZGRSZWYgbmVlZGVkOiBgc2VlZFdpdGhDb21wbGV0aW9uYCBjcmVhdGVzIGEgbmV3IGBJbmxpbmVDb21wbGV0aW9uc1N0YXRlYFxuXHRcdC8vIHdoaWNoIGNhbGxzIGBhZGRSZWZgIG9uIGV2ZXJ5IGl0ZW0gaXQgaG9sZHMgYW5kIHBhaXJzIGl0IHdpdGggYHJlbW92ZVJlZmAgaW4gZGlzcG9zZS5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9zb3VyY2Uuc2VlZFdpdGhDb21wbGV0aW9uKGl0ZW0sIHR4KTtcblx0XHRcdHRoaXMuX2lzQWN0aXZlLnNldCh0cnVlLCB0eCk7XG5cdFx0XHR0aGlzLl9pbkFjY2VwdEZsb3cuc2V0KHRydWUsIHR4KTtcblx0XHRcdHRoaXMuZG9udFJlZmV0Y2hTaWduYWwudHJpZ2dlcih0eCk7XG5cdFx0fSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIFJlcHJvIHtcblx0ZG9jdW1lbnRWYWx1ZTogc3RyaW5nO1xuXHRpbmxpbmVDb21wbGV0aW9uOiBJbmxpbmVDb21wbGV0aW9uIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZW51bSBWZXJzaW9uSWRDaGFuZ2VSZWFzb24ge1xuXHRVbmRvLFxuXHRSZWRvLFxuXHRBY2NlcHRXb3JkLFxuXHRPdGhlcixcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNlY29uZGFyeUVkaXRzKHRleHRNb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb25zOiByZWFkb25seSBQb3NpdGlvbltdLCBwcmltYXJ5VGV4dFJlcGw6IFRleHRSZXBsYWNlbWVudCk6IChUZXh0UmVwbGFjZW1lbnQgfCB1bmRlZmluZWQpW10ge1xuXHRpZiAocG9zaXRpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdC8vIE5vIHNlY29uZGFyeSBjdXJzb3IgcG9zaXRpb25zXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGNvbnN0IHRleHQgPSBuZXcgVGV4dE1vZGVsVGV4dCh0ZXh0TW9kZWwpO1xuXHRjb25zdCB0ZXh0VHJhbnNmb3JtZXIgPSB0ZXh0LmdldFRyYW5zZm9ybWVyKCk7XG5cdGNvbnN0IHByaW1hcnlPZmZzZXQgPSB0ZXh0VHJhbnNmb3JtZXIuZ2V0T2Zmc2V0KHBvc2l0aW9uc1swXSk7XG5cdGNvbnN0IHNlY29uZGFyeU9mZnNldHMgPSBwb3NpdGlvbnMuc2xpY2UoMSkubWFwKHBvcyA9PiB0ZXh0VHJhbnNmb3JtZXIuZ2V0T2Zmc2V0KHBvcykpO1xuXG5cdHByaW1hcnlUZXh0UmVwbCA9IHByaW1hcnlUZXh0UmVwbC5yZW1vdmVDb21tb25QcmVmaXhBbmRTdWZmaXgodGV4dCk7XG5cdGNvbnN0IHByaW1hcnlTdHJpbmdSZXBsID0gdGV4dFRyYW5zZm9ybWVyLmdldFN0cmluZ1JlcGxhY2VtZW50KHByaW1hcnlUZXh0UmVwbCk7XG5cblx0Y29uc3QgZGVsdGFGcm9tT2Zmc2V0VG9SYW5nZVN0YXJ0ID0gcHJpbWFyeVN0cmluZ1JlcGwucmVwbGFjZVJhbmdlLnN0YXJ0IC0gcHJpbWFyeU9mZnNldDtcblx0Y29uc3QgcHJpbWFyeUNvbnRleHRSYW5nZSA9IHByaW1hcnlTdHJpbmdSZXBsLnJlcGxhY2VSYW5nZS5qb2luKE9mZnNldFJhbmdlLmVtcHR5QXQocHJpbWFyeU9mZnNldCkpO1xuXHRjb25zdCBwcmltYXJ5Q29udGV4dFZhbHVlID0gdGV4dC5nZXRWYWx1ZU9mT2Zmc2V0UmFuZ2UocHJpbWFyeUNvbnRleHRSYW5nZSk7XG5cblx0Y29uc3QgcmVwbGFjZW1lbnRzID0gc2Vjb25kYXJ5T2Zmc2V0cy5tYXAoc2Vjb25kYXJ5T2Zmc2V0ID0+IHtcblx0XHRjb25zdCBuZXdSYW5nZVN0YXJ0ID0gc2Vjb25kYXJ5T2Zmc2V0ICsgZGVsdGFGcm9tT2Zmc2V0VG9SYW5nZVN0YXJ0O1xuXHRcdGNvbnN0IG5ld1JhbmdlRW5kID0gbmV3UmFuZ2VTdGFydCArIHByaW1hcnlTdHJpbmdSZXBsLnJlcGxhY2VSYW5nZS5sZW5ndGg7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgT2Zmc2V0UmFuZ2UobmV3UmFuZ2VTdGFydCwgbmV3UmFuZ2VFbmQpO1xuXG5cdFx0Y29uc3QgY29udGV4dFJhbmdlID0gcmFuZ2Uuam9pbihPZmZzZXRSYW5nZS5lbXB0eUF0KHNlY29uZGFyeU9mZnNldCkpO1xuXHRcdGNvbnN0IGNvbnRleHRWYWx1ZSA9IHRleHQuZ2V0VmFsdWVPZk9mZnNldFJhbmdlKGNvbnRleHRSYW5nZSk7XG5cdFx0aWYgKGNvbnRleHRWYWx1ZSAhPT0gcHJpbWFyeUNvbnRleHRWYWx1ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzdHJpbmdSZXBsID0gbmV3IFN0cmluZ1JlcGxhY2VtZW50KHJhbmdlLCBwcmltYXJ5U3RyaW5nUmVwbC5uZXdUZXh0KTtcblx0XHRjb25zdCByZXBsID0gdGV4dFRyYW5zZm9ybWVyLmdldFRleHRSZXBsYWNlbWVudChzdHJpbmdSZXBsKTtcblx0XHRyZXR1cm4gcmVwbDtcblx0fSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0cmV0dXJuIHJlcGxhY2VtZW50cztcbn1cblxuY2xhc3MgRmFkZW91dERlY29yYXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRyYW5nZXM6IFJhbmdlW10sXG5cdFx0b25EaXNwb3NlPzogKCkgPT4gdm9pZCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmIChvbkRpc3Bvc2UpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gb25EaXNwb3NlKCkgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIob2JzZXJ2YWJsZUNvZGVFZGl0b3IoZWRpdG9yKS5zZXREZWNvcmF0aW9ucyhjb25zdE9ic2VydmFibGUocmFuZ2VzLm1hcDxJTW9kZWxEZWx0YURlY29yYXRpb24+KHJhbmdlID0+ICh7XG5cdFx0XHRyYW5nZTogcmFuZ2UsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnYW5pbWF0aW9uJyxcblx0XHRcdFx0Y2xhc3NOYW1lOiAnZWRpdHMtZmFkZW91dC1kZWNvcmF0aW9uJyxcblx0XHRcdFx0ekluZGV4OiAxLFxuXHRcdFx0fVxuXHRcdH0pKSkpKTtcblxuXHRcdGNvbnN0IHZhbCA9IG5ldyBPYnNlcnZhYmxlQW5pbWF0ZWRWYWx1ZShBbmltYXRlZFZhbHVlLnN0YXJ0Tm93KDEsIDAsIDEwMDAsIGVhc2VPdXRDdWJpYykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgb3BhY2l0eSA9IHZhbC5nZXRWYWx1ZShyZWFkZXIpO1xuXHRcdFx0ZWRpdG9yLmdldENvbnRhaW5lckRvbU5vZGUoKS5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1hbmltYXRpb24tb3BhY2l0eScsIG9wYWNpdHkudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAodmFsLmlzRmluaXNoZWQocmVhZGVyKSkge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3VnZ2VzdGlvbkluVmlld3BvcnQoZWRpdG9yOiBJQ29kZUVkaXRvciwgc3VnZ2VzdGlvbjogSW5saW5lU3VnZ2VzdGlvbkl0ZW0sIHJlYWRlcjogSVJlYWRlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRjb25zdCB0YXJnZXRSYW5nZSA9IHN1Z2dlc3Rpb24udGFyZ2V0UmFuZ2U7XG5cblx0Ly8gVE9ETyBtYWtlIGdldFZpc2libGVSYW5nZXMgcmVhY3RpdmUhXG5cdG9ic2VydmFibGVDb2RlRWRpdG9yKGVkaXRvcikuc2Nyb2xsVG9wLnJlYWQocmVhZGVyKTtcblx0Y29uc3QgdmlzaWJsZVJhbmdlcyA9IGVkaXRvci5nZXRWaXNpYmxlUmFuZ2VzKCk7XG5cblx0aWYgKHZpc2libGVSYW5nZXMubGVuZ3RoIDwgMSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IHZpZXdwb3J0UmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0dmlzaWJsZVJhbmdlc1swXS5zdGFydExpbmVOdW1iZXIsXG5cdFx0dmlzaWJsZVJhbmdlc1swXS5zdGFydENvbHVtbixcblx0XHR2aXNpYmxlUmFuZ2VzW3Zpc2libGVSYW5nZXMubGVuZ3RoIC0gMV0uZW5kTGluZU51bWJlcixcblx0XHR2aXNpYmxlUmFuZ2VzW3Zpc2libGVSYW5nZXMubGVuZ3RoIC0gMV0uZW5kQ29sdW1uXG5cdCk7XG5cdHJldHVybiB2aWV3cG9ydFJhbmdlLmNvbnRhaW5zUmFuZ2UodGFyZ2V0UmFuZ2UpO1xufVxuXG5mdW5jdGlvbiBza3VGcm9tQWNjb3VudChhY2NvdW50OiBJRGVmYXVsdEFjY291bnQgfCBudWxsKTogSW5saW5lU3VnZ2VzdFNrdSB8IHVuZGVmaW5lZCB7XG5cdGlmIChhY2NvdW50Py5lbnRpdGxlbWVudHNEYXRhPy5hY2Nlc3NfdHlwZV9za3UgJiYgYWNjb3VudD8uZW50aXRsZW1lbnRzRGF0YT8uY29waWxvdF9wbGFuKSB7XG5cdFx0cmV0dXJuIHsgdHlwZTogYWNjb3VudC5lbnRpdGxlbWVudHNEYXRhLmFjY2Vzc190eXBlX3NrdSwgcGxhbjogYWNjb3VudC5lbnRpdGxlbWVudHNEYXRhLmNvcGlsb3RfcGxhbiB9O1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIERpc3Bvc2FibGVDYWxsYmFjazxUPiB7XG5cdHByaXZhdGUgX2NiOiAoKGU6IFQpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGNiOiAoZTogVCkgPT4gdm9pZCkge1xuXHRcdHRoaXMuX2NiID0gY2I7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NiID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmVhZG9ubHkgaGFuZGxlciA9ICh2YWw6IFQpID0+IHtcblx0XHRyZXR1cm4gdGhpcy5fY2I/Lih2YWwpO1xuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVEaXNwb3NhYmxlQ2I8VD4oY2I6IChlOiBUKSA9PiB2b2lkLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogKGU6IFQpID0+IHZvaWQge1xuXHRjb25zdCBkY2IgPSBuZXcgRGlzcG9zYWJsZUNhbGxiYWNrKGNiKTtcblx0c3RvcmUuYWRkKGRjYik7XG5cdHJldHVybiBkY2IuaGFuZGxlcjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQkFBb0IsaUNBQWlDO0FBQzlELFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFtQztBQUM1QyxTQUFvRSxTQUFTLGlCQUFpQixTQUFTLHNCQUFzQixhQUFhLDBCQUEwQixxQkFBcUIsa0JBQWtCLGlCQUFpQiwrQkFBK0IsZ0JBQWdCLG1CQUFtQjtBQUM5UixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFT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
