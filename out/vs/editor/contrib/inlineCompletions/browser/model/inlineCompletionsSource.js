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
import { booleanComparator, compareBy, compareUndefinedSmallest, numberComparator } from "../../../../../base/common/arrays.js";
import { findLastMax } from "../../../../../base/common/arraysFind.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { equalsIfDefined, thisEqualsC } from "../../../../../base/common/equals.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { cloneAndChange } from "../../../../../base/common/objects.js";
import { derived, observableValue, recordChangesLazy, runOnChange, transaction } from "../../../../../base/common/observable.js";
import { observableReducerSettable } from "../../../../../base/common/observableInternal/experimental/reducer.js";
import { isDefined, isObject } from "../../../../../base/common/types.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { DataChannelForwardingTelemetryService, forwardToChannelIf, isCopilotLikeExtension } from "../../../../../platform/dataChannel/browser/forwardingTelemetryService.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { observableConfigValue } from "../../../../../platform/observable/common/platformObservableUtils.js";
import { StringEdit } from "../../../../common/core/edits/stringEdit.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { Command, InlineCompletionEndOfLifeReasonKind, InlineCompletionTriggerKind } from "../../../../common/languages.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { offsetEditFromContentChanges } from "../../../../common/model/textModelStringEdit.js";
import { isCompletionsEnabledFromObject } from "../../../../common/services/completionsEnablement.js";
import { ITextModelService } from "../../../../common/services/resolverService.js";
import { formatRecordableLogEntry, StructuredLogger } from "../structuredLogger.js";
import { sendInlineCompletionsEndOfLifeTelemetry } from "../telemetry.js";
import { wait } from "../utils.js";
import { InlineSuggestionItem } from "./inlineSuggestionItem.js";
import { provideInlineCompletions, runWhenCancelled } from "./provideInlineCompletions.js";
import { RenameSymbolProcessor } from "./renameSymbolProcessor.js";
import { TextModelValueReference } from "./textModelValueReference.js";
let InlineCompletionsSource = class extends Disposable {
  constructor(_textModel, _versionId, _debounceValue, _cursorPosition, completionsEnablementSetting, _languageConfigurationService, _logService, _configurationService, _instantiationService, _contextKeyService, _textModelService) {
    super();
    this._textModel = _textModel;
    this._versionId = _versionId;
    this._debounceValue = _debounceValue;
    this._cursorPosition = _cursorPosition;
    this._languageConfigurationService = _languageConfigurationService;
    this._logService = _logService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._contextKeyService = _contextKeyService;
    this._textModelService = _textModelService;
    this._updateOperation = this._register(new MutableDisposable());
    this._state = observableReducerSettable(this, {
      initial: () => ({
        inlineCompletions: InlineCompletionsState.createEmpty(),
        suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty()
      }),
      disposeFinal: (values) => {
        values.inlineCompletions.dispose();
        values.suggestWidgetInlineCompletions.dispose();
      },
      changeTracker: recordChangesLazy(() => ({ versionId: this._versionId })),
      update: (reader, previousValue, changes) => {
        const edit = StringEdit.compose(changes.changes.map((c) => c.change ? offsetEditFromContentChanges(c.change.changes) : StringEdit.empty).filter(isDefined));
        if (edit.isEmpty()) {
          return previousValue;
        }
        try {
          return {
            inlineCompletions: previousValue.inlineCompletions.createStateWithAppliedEdit(edit, this._textModel),
            suggestWidgetInlineCompletions: previousValue.suggestWidgetInlineCompletions.createStateWithAppliedEdit(edit, this._textModel)
          };
        } finally {
          previousValue.inlineCompletions.dispose();
          previousValue.suggestWidgetInlineCompletions.dispose();
        }
      }
    });
    this.inlineCompletions = this._state.map(this, (v) => v.inlineCompletions);
    this.suggestWidgetInlineCompletions = this._state.map(this, (v) => v.suggestWidgetInlineCompletions);
    this._completionsEnabled = void 0;
    this.clearOperationOnTextModelChange = derived(this, (reader) => {
      this._versionId.read(reader);
      this._updateOperation.clear();
      return void 0;
    });
    this._loadingCount = observableValue(this, 0);
    this.loading = this._loadingCount.map(this, (v) => v > 0);
    this._dataChannelTelemetryService = this._instantiationService.createInstance(DataChannelForwardingTelemetryService);
    this._loggingEnabled = observableConfigValue("editor.inlineSuggest.logFetch", false, this._configurationService).recomputeInitiallyAndOnChange(this._store);
    this._sendRequestData = observableConfigValue("editor.inlineSuggest.emptyResponseInformation", true, this._configurationService).recomputeInitiallyAndOnChange(this._store);
    this._structuredFetchLogger = this._register(this._instantiationService.createInstance(
      StructuredLogger.cast(),
      "editor.inlineSuggest.logFetch.commandId"
    ));
    this._renameProcessor = this._store.add(this._instantiationService.createInstance(RenameSymbolProcessor));
    this.clearOperationOnTextModelChange.recomputeInitiallyAndOnChange(this._store);
    if (completionsEnablementSetting) {
      this._updateCompletionsEnablement(completionsEnablementSetting);
      this._register(this._configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(completionsEnablementSetting)) {
          this._updateCompletionsEnablement(completionsEnablementSetting);
        }
      }));
    }
    this._state.recomputeInitiallyAndOnChange(this._store);
  }
  _updateCompletionsEnablement(enalementSetting) {
    const result = this._configurationService.getValue(enalementSetting);
    if (!isObject(result)) {
      this._completionsEnabled = void 0;
    } else {
      this._completionsEnabled = result;
    }
  }
  _log(entry) {
    if (this._loggingEnabled.get()) {
      this._logService.info(formatRecordableLogEntry(entry));
    }
    this._structuredFetchLogger.log(entry);
  }
  fetch(providers, providersLabel, context, activeInlineCompletion, withDebounce, userJumpedToActiveCompletion, requestInfo) {
    const position = this._cursorPosition.get();
    const request = new UpdateRequest(position, context, this._textModel.getVersionId(), new Set(providers));
    const target = context.selectedSuggestionInfo ? this.suggestWidgetInlineCompletions.get() : this.inlineCompletions.get();
    if (this._updateOperation.value?.request.satisfies(request)) {
      return this._updateOperation.value.promise;
    } else if (target?.request?.satisfies(request)) {
      return Promise.resolve(true);
    }
    const updateOngoing = !!this._updateOperation.value;
    this._updateOperation.clear();
    const source = new CancellationTokenSource();
    const promise = (async () => {
      const store = new DisposableStore();
      this._loadingCount.set(this._loadingCount.get() + 1, void 0);
      let didDecrease = false;
      const decreaseLoadingCount = () => {
        if (!didDecrease) {
          didDecrease = true;
          this._loadingCount.set(this._loadingCount.get() - 1, void 0);
        }
      };
      const loadingReset = store.add(new RunOnceScheduler(() => decreaseLoadingCount(), 10 * 1e3));
      loadingReset.schedule();
      const inlineSuggestionsProviders = providers.filter((p) => p.providerId);
      const requestResponseInfo = new RequestResponseData(context, requestInfo, inlineSuggestionsProviders);
      try {
        const recommendedDebounceValue = this._debounceValue.get(this._textModel);
        const debounceValue = findLastMax(
          providers.map((p) => p.debounceDelayMs),
          compareUndefinedSmallest(numberComparator)
        ) ?? recommendedDebounceValue;
        const shouldDebounce = updateOngoing || withDebounce && context.triggerKind === InlineCompletionTriggerKind.Automatic;
        if (shouldDebounce) {
          await wait(debounceValue, source.token);
        }
        if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId) {
          requestResponseInfo.setNoSuggestionReasonIfNotSet("canceled:beforeFetch");
          return false;
        }
        const requestId = InlineCompletionsSource._requestId++;
        if (this._loggingEnabled.get() || this._structuredFetchLogger.isEnabled.get()) {
          this._log({
            sourceId: "InlineCompletions.fetch",
            kind: "start",
            requestId,
            modelUri: this._textModel.uri,
            modelVersion: this._textModel.getVersionId(),
            context: { triggerKind: context.triggerKind, suggestInfo: context.selectedSuggestionInfo ? true : void 0 },
            time: Date.now(),
            provider: providersLabel
          });
        }
        const startTime = /* @__PURE__ */ new Date();
        const providerResult = provideInlineCompletions(providers, this._cursorPosition.get(), this._textModel, context, requestInfo, this._languageConfigurationService);
        runWhenCancelled(source.token, () => providerResult.cancelAndDispose({ kind: "tokenCancellation" }));
        let shouldStopEarly = false;
        let producedSuggestion = false;
        const providerSuggestions = [];
        for await (const list of providerResult.lists) {
          if (!list) {
            continue;
          }
          list.addRef();
          store.add(toDisposable(() => list.removeRef(list.inlineSuggestionsData.length === 0 ? { kind: "empty" } : { kind: "notTaken" })));
          for (const item of list.inlineSuggestionsData) {
            producedSuggestion = true;
            if (!context.includeInlineEdits && (item.isInlineEdit || item.showInlineEditMenu)) {
              item.setNotShownReason("notInlineEditRequested");
              continue;
            }
            if (!context.includeInlineCompletions && !(item.isInlineEdit || item.showInlineEditMenu)) {
              item.setNotShownReason("notInlineCompletionRequested");
              continue;
            }
            item.addPerformanceMarker("providerReturned");
            const targetUri = item.action?.uri;
            let targetModel;
            let disposable;
            if (targetUri && targetUri.toString() !== this._textModel.uri.toString()) {
              const modelRef = await this._textModelService.createModelReference(targetUri);
              targetModel = modelRef.object.textEditorModel;
              disposable = modelRef;
            } else {
              targetModel = this._textModel;
              disposable = void 0;
            }
            const ref = TextModelValueReference.snapshot(targetModel);
            const i = InlineSuggestionItem.create(item, ref);
            if (disposable) {
              const s = runOnChange(i.identity.onDispose, () => {
                disposable?.dispose();
                s.dispose();
              });
            }
            item.addPerformanceMarker("itemCreated");
            providerSuggestions.push(i);
            if (!i.isInlineEdit && !i.showInlineEditMenu && context.triggerKind === InlineCompletionTriggerKind.Automatic) {
              if (i.isVisible(this._textModel, this._cursorPosition.get())) {
                shouldStopEarly = true;
              }
            }
          }
          if (shouldStopEarly) {
            break;
          }
        }
        providerSuggestions.forEach((s) => s.addPerformanceMarker("providersResolved"));
        const suggestions = await Promise.all(providerSuggestions.map(async (s) => {
          return this._renameProcessor.proposeRenameRefactoring(this._textModel, s, context);
        }));
        suggestions.forEach((s) => s.addPerformanceMarker("renameProcessed"));
        providerResult.cancelAndDispose({ kind: "lostRace" });
        if (this._loggingEnabled.get() || this._structuredFetchLogger.isEnabled.get()) {
          const didAllProvidersReturn = providerResult.didAllProvidersReturn;
          let error = void 0;
          if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId) {
            error = "canceled";
          }
          const result = suggestions.map((c) => {
            const comp = c.getSourceCompletion();
            if (comp.doNotLog) {
              return void 0;
            }
            const obj = {
              insertText: comp.insertText,
              range: comp.range,
              additionalTextEdits: comp.additionalTextEdits,
              uri: comp.uri,
              command: comp.command,
              gutterMenuLinkAction: comp.gutterMenuLinkAction,
              shownCommand: comp.shownCommand,
              completeBracketPairs: comp.completeBracketPairs,
              isInlineEdit: comp.isInlineEdit,
              showInlineEditMenu: comp.showInlineEditMenu,
              showRange: comp.showRange,
              warning: comp.warning,
              hint: comp.hint,
              supportsRename: comp.supportsRename,
              correlationId: comp.correlationId,
              jumpToPosition: comp.jumpToPosition
            };
            return {
              ...cloneAndChange(obj, (v) => {
                if (Range.isIRange(v)) {
                  return Range.lift(v).toString();
                }
                if (Position.isIPosition(v)) {
                  return Position.lift(v).toString();
                }
                if (Command.is(v)) {
                  return { $commandId: v.id };
                }
                return v;
              }),
              $providerId: c.source.provider.providerId?.toString()
            };
          }).filter((result2) => result2 !== void 0);
          this._log({ sourceId: "InlineCompletions.fetch", kind: "end", requestId, durationMs: Date.now() - startTime.getTime(), error, result, time: Date.now(), didAllProvidersReturn });
        }
        requestResponseInfo.setRequestUuid(providerResult.contextWithUuid.requestUuid);
        if (producedSuggestion) {
          requestResponseInfo.setHasProducedSuggestion();
          if (suggestions.length > 0 && source.token.isCancellationRequested) {
            suggestions.forEach((s) => s.setNotShownReasonIfNotSet("canceled:whileAwaitingOtherProviders"));
          }
        } else {
          if (source.token.isCancellationRequested) {
            requestResponseInfo.setNoSuggestionReasonIfNotSet("canceled:whileFetching");
          } else {
            const completionsQuotaExceeded = this._contextKeyService.getContextKeyValue("completionsQuotaExceeded");
            requestResponseInfo.setNoSuggestionReasonIfNotSet(completionsQuotaExceeded ? "completionsQuotaExceeded" : "noSuggestion");
          }
        }
        const remainingTimeToWait = context.earliestShownDateTime - Date.now();
        if (remainingTimeToWait > 0) {
          await wait(remainingTimeToWait, source.token);
        }
        suggestions.forEach((s) => s.addPerformanceMarker("minShowDelayPassed"));
        if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId || userJumpedToActiveCompletion.get()) {
          const notShownReason = source.token.isCancellationRequested ? "canceled:afterMinShowDelay" : this._store.isDisposed ? "canceled:disposed" : this._textModel.getVersionId() !== request.versionId ? "canceled:documentChanged" : userJumpedToActiveCompletion.get() ? "canceled:userJumped" : "unknown";
          suggestions.forEach((s) => s.setNotShownReasonIfNotSet(notShownReason));
          return false;
        }
        const endTime = /* @__PURE__ */ new Date();
        this._debounceValue.update(this._textModel, endTime.getTime() - startTime.getTime());
        const cursorPosition = this._cursorPosition.get();
        this._updateOperation.clear();
        transaction((tx) => {
          const v = this._state.get();
          if (context.selectedSuggestionInfo) {
            this._state.set({
              inlineCompletions: InlineCompletionsState.createEmpty(),
              suggestWidgetInlineCompletions: v.suggestWidgetInlineCompletions.createStateWithAppliedResults(suggestions, request, this._textModel, cursorPosition, activeInlineCompletion)
            }, tx);
          } else {
            this._state.set({
              inlineCompletions: v.inlineCompletions.createStateWithAppliedResults(suggestions, request, this._textModel, cursorPosition, activeInlineCompletion),
              suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty()
            }, tx);
          }
          v.inlineCompletions.dispose();
          v.suggestWidgetInlineCompletions.dispose();
        });
      } finally {
        store.dispose();
        decreaseLoadingCount();
        this._sendInlineCompletionsRequestTelemetry(requestResponseInfo);
      }
      return true;
    })();
    const updateOperation = new UpdateOperation(request, source, promise);
    this._updateOperation.value = updateOperation;
    return promise;
  }
  clear(tx) {
    if (this._store.isDisposed) {
      return;
    }
    this._updateOperation.clear();
    const v = this._state.get();
    this._state.set({
      inlineCompletions: InlineCompletionsState.createEmpty(),
      suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty()
    }, tx);
    v.inlineCompletions.dispose();
    v.suggestWidgetInlineCompletions.dispose();
  }
  seedInlineCompletionsWithSuggestWidget() {
    const inlineCompletions = this.inlineCompletions.get();
    const suggestWidgetInlineCompletions = this.suggestWidgetInlineCompletions.get();
    if (!suggestWidgetInlineCompletions) {
      return;
    }
    transaction((tx) => {
      if (!inlineCompletions || (suggestWidgetInlineCompletions.request?.versionId ?? -1) > (inlineCompletions.request?.versionId ?? -1)) {
        inlineCompletions?.dispose();
        const s = this._state.get();
        this._state.set({
          inlineCompletions: suggestWidgetInlineCompletions.clone(),
          suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty()
        }, tx);
        s.inlineCompletions.dispose();
        s.suggestWidgetInlineCompletions.dispose();
      }
      this.clearSuggestWidgetInlineCompletions(tx);
    });
  }
  /**
   * Seeds the inline completions with an external inline completion item.
   * Used when transplanting a completion from one model to another (cross-file edits).
   */
  seedWithCompletion(item, tx) {
    const s = this._state.get();
    this._state.set({
      inlineCompletions: new InlineCompletionsState([item], void 0),
      suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty()
    }, tx);
    s.inlineCompletions.dispose();
    s.suggestWidgetInlineCompletions.dispose();
  }
  _sendInlineCompletionsRequestTelemetry(requestResponseInfo) {
    if (!this._sendRequestData.get() && !this._contextKeyService.getContextKeyValue("isRunningUnificationExperiment")) {
      return;
    }
    if (requestResponseInfo.requestUuid === void 0 || requestResponseInfo.hasProducedSuggestion) {
      return;
    }
    if (!isCompletionsEnabledFromObject(this._completionsEnabled, this._textModel.getLanguageId())) {
      return;
    }
    if (!requestResponseInfo.providers.some((p) => isCopilotLikeExtension(p.providerId?.extensionId))) {
      return;
    }
    const emptyEndOfLifeEvent = {
      opportunityId: requestResponseInfo.requestUuid,
      noSuggestionReason: requestResponseInfo.noSuggestionReason ?? "unknown",
      extensionId: "vscode-core",
      extensionVersion: "0.0.0",
      groupId: "empty",
      shown: false,
      skuPlan: requestResponseInfo.requestInfo.sku?.plan,
      skuType: requestResponseInfo.requestInfo.sku?.type,
      editorType: requestResponseInfo.requestInfo.editorType,
      requestReason: requestResponseInfo.requestInfo.reason,
      typingInterval: requestResponseInfo.requestInfo.typingInterval,
      typingIntervalCharacterCount: requestResponseInfo.requestInfo.typingIntervalCharacterCount,
      languageId: requestResponseInfo.requestInfo.languageId,
      selectedSuggestionInfo: !!requestResponseInfo.context.selectedSuggestionInfo,
      availableProviders: requestResponseInfo.providers.map((p) => p.providerId?.toString()).filter(isDefined).join(","),
      ...forwardToChannelIf(requestResponseInfo.providers.some((p) => isCopilotLikeExtension(p.providerId?.extensionId))),
      timeUntilProviderRequest: void 0,
      timeUntilProviderResponse: void 0,
      viewKind: void 0,
      preceeded: void 0,
      superseded: void 0,
      reason: void 0,
      acceptedAlternativeAction: void 0,
      correlationId: void 0,
      shownDuration: void 0,
      shownDurationUncollapsed: void 0,
      timeUntilShown: void 0,
      partiallyAccepted: void 0,
      partiallyAcceptedCountSinceOriginal: void 0,
      partiallyAcceptedRatioSinceOriginal: void 0,
      partiallyAcceptedCharactersSinceOriginal: void 0,
      cursorColumnDistance: void 0,
      cursorLineDistance: void 0,
      lineCountOriginal: void 0,
      lineCountModified: void 0,
      characterCountOriginal: void 0,
      characterCountModified: void 0,
      disjointReplacements: void 0,
      sameShapeReplacements: void 0,
      longDistanceHintVisible: void 0,
      longDistanceHintDistance: void 0,
      isForAnotherDocument: void 0,
      notShownReason: void 0,
      renameCreated: false,
      renameDuration: void 0,
      renameTimedOut: false,
      renameDroppedOtherEdits: void 0,
      renameDroppedRenameEdits: void 0,
      performanceMarkers: void 0,
      editKind: void 0
    };
    sendInlineCompletionsEndOfLifeTelemetry(this._dataChannelTelemetryService, emptyEndOfLifeEvent);
  }
  clearSuggestWidgetInlineCompletions(tx) {
    if (this._updateOperation.value?.request.context.selectedSuggestionInfo) {
      this._updateOperation.clear();
    }
  }
  cancelUpdate() {
    this._updateOperation.clear();
  }
};
InlineCompletionsSource._requestId = 0;
InlineCompletionsSource = __decorateClass([
  __decorateParam(5, ILanguageConfigurationService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, ITextModelService)
], InlineCompletionsSource);
class UpdateRequest {
  constructor(position, context, versionId, providers) {
    this.position = position;
    this.context = context;
    this.versionId = versionId;
    this.providers = providers;
  }
  satisfies(other) {
    return this.position.equals(other.position) && equalsIfDefined(this.context.selectedSuggestionInfo, other.context.selectedSuggestionInfo, thisEqualsC()) && (other.context.triggerKind === InlineCompletionTriggerKind.Automatic || this.context.triggerKind === InlineCompletionTriggerKind.Explicit) && this.versionId === other.versionId && isSubset(other.providers, this.providers);
  }
  get isExplicitRequest() {
    return this.context.triggerKind === InlineCompletionTriggerKind.Explicit;
  }
}
class RequestResponseData {
  constructor(context, requestInfo, providers) {
    this.context = context;
    this.requestInfo = requestInfo;
    this.providers = providers;
    this.hasProducedSuggestion = false;
  }
  setRequestUuid(uuid) {
    this.requestUuid = uuid;
  }
  setNoSuggestionReasonIfNotSet(type) {
    this.noSuggestionReason ??= type;
  }
  setHasProducedSuggestion() {
    this.hasProducedSuggestion = true;
  }
}
function isSubset(set1, set2) {
  return [...set1].every((item) => set2.has(item));
}
class UpdateOperation {
  constructor(request, cancellationTokenSource, promise) {
    this.request = request;
    this.cancellationTokenSource = cancellationTokenSource;
    this.promise = promise;
  }
  dispose() {
    this.cancellationTokenSource.cancel();
  }
}
class InlineCompletionsState extends Disposable {
  constructor(inlineCompletions, request) {
    super();
    this.inlineCompletions = inlineCompletions;
    this.request = request;
    for (const inlineCompletion of this.inlineCompletions) {
      inlineCompletion.addRef();
    }
    this._register({
      dispose: () => {
        for (const inlineCompletion of this.inlineCompletions) {
          inlineCompletion.removeRef();
        }
      }
    });
  }
  static createEmpty() {
    return new InlineCompletionsState([], void 0);
  }
  _findById(id) {
    return this.inlineCompletions.find((i) => i.identity === id);
  }
  _findByHash(hash) {
    return this.inlineCompletions.find((i) => i.hash === hash);
  }
  /**
   * Applies the edit on the state.
  */
  createStateWithAppliedEdit(edit, textModel) {
    const newInlineCompletions = this.inlineCompletions.map((i) => i.withEdit(edit, textModel)).filter(isDefined);
    return new InlineCompletionsState(newInlineCompletions, this.request);
  }
  createStateWithAppliedResults(updatedSuggestions, request, textModel, cursorPosition, itemIdToPreserveAtTop) {
    let itemToPreserve = void 0;
    if (itemIdToPreserveAtTop) {
      const itemToPreserveCandidate = this._findById(itemIdToPreserveAtTop);
      if (itemToPreserveCandidate && itemToPreserveCandidate.canBeReused(textModel, request.position)) {
        itemToPreserve = itemToPreserveCandidate;
        const updatedItemToPreserve = updatedSuggestions.find((i) => i.hash === itemToPreserveCandidate.hash);
        if (updatedItemToPreserve) {
          updatedSuggestions = moveToFront(updatedItemToPreserve, updatedSuggestions);
        } else {
          updatedSuggestions = [itemToPreserveCandidate, ...updatedSuggestions];
        }
      }
    }
    const preferInlineCompletions = itemToPreserve ? !itemToPreserve.isInlineEdit : updatedSuggestions.some((i) => !i.isInlineEdit && i.isVisible(textModel, cursorPosition));
    let updatedItems = [];
    for (const i of updatedSuggestions) {
      const oldItem = this._findByHash(i.hash);
      let item;
      if (oldItem && oldItem !== i) {
        item = i.withIdentity(oldItem.identity);
        i.setIsPreceeded(oldItem);
        oldItem.setEndOfLifeReason({ kind: InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false, supersededBy: i.getSourceCompletion() });
      } else {
        item = i;
      }
      if (preferInlineCompletions !== item.isInlineEdit) {
        updatedItems.push(item);
      }
    }
    updatedItems.sort(compareBy((i) => i.showInlineEditMenu, booleanComparator));
    updatedItems = distinctByKey(updatedItems, (i) => i.semanticId);
    return new InlineCompletionsState(updatedItems, request);
  }
  clone() {
    return new InlineCompletionsState(this.inlineCompletions, this.request);
  }
}
function distinctByKey(items, key) {
  const seen = /* @__PURE__ */ new Set();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
}
function moveToFront(item, items) {
  const index = items.indexOf(item);
  if (index > -1) {
    return [item, ...items.slice(0, index), ...items.slice(index + 1)];
  }
  return items;
}
export {
  InlineCompletionsSource,
  InlineCompletionsState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFxtb2RlbFxcaW5saW5lQ29tcGxldGlvbnNTb3VyY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBib29sZWFuQ29tcGFyYXRvciwgY29tcGFyZUJ5LCBjb21wYXJlVW5kZWZpbmVkU21hbGxlc3QsIG51bWJlckNvbXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgZmluZExhc3RNYXggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBlcXVhbHNJZkRlZmluZWQsIHRoaXNFcXVhbHNDIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY2xvbmVBbmRDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIElPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2UsIElUcmFuc2FjdGlvbiwgb2JzZXJ2YWJsZVZhbHVlLCByZWNvcmRDaGFuZ2VzTGF6eSwgcnVuT25DaGFuZ2UsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kZWVwLWltcG9ydC1vZi1pbnRlcm5hbFxuaW1wb3J0IHsgb2JzZXJ2YWJsZVJlZHVjZXJTZXR0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9leHBlcmltZW50YWwvcmVkdWNlci5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQsIGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IERhdGFDaGFubmVsRm9yd2FyZGluZ1RlbGVtZXRyeVNlcnZpY2UsIGZvcndhcmRUb0NoYW5uZWxJZiwgaXNDb3BpbG90TGlrZUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RhdGFDaGFubmVsL2Jyb3dzZXIvZm9yd2FyZGluZ1RlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IFN0cmluZ0VkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9lZGl0cy9zdHJpbmdFZGl0LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kLCBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZCwgSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLCBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBvZmZzZXRFZGl0RnJvbUNvbnRlbnRDaGFuZ2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbFN0cmluZ0VkaXQuanMnO1xuaW1wb3J0IHsgaXNDb21wbGV0aW9uc0VuYWJsZWRGcm9tT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2NvbXBsZXRpb25zRW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsRXZlbnRzLmpzJztcbmltcG9ydCB7IGZvcm1hdFJlY29yZGFibGVMb2dFbnRyeSwgSVJlY29yZGFibGVFZGl0b3JMb2dFbnRyeSwgSVJlY29yZGFibGVMb2dFbnRyeSwgU3RydWN0dXJlZExvZ2dlciB9IGZyb20gJy4uL3N0cnVjdHVyZWRMb2dnZXIuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZUV2ZW50LCBzZW5kSW5saW5lQ29tcGxldGlvbnNFbmRPZkxpZmVUZWxlbWV0cnkgfSBmcm9tICcuLi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgd2FpdCB9IGZyb20gJy4uL3V0aWxzLmpzJztcbmltcG9ydCB7IElubGluZVN1Z2dlc3Rpb25JZGVudGl0eSwgSW5saW5lU3VnZ2VzdGlvbkl0ZW0gfSBmcm9tICcuL2lubGluZVN1Z2dlc3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25Db250ZXh0V2l0aG91dFV1aWQsIElubGluZVN1Z2dlc3RSZXF1ZXN0SW5mbywgcHJvdmlkZUlubGluZUNvbXBsZXRpb25zLCBydW5XaGVuQ2FuY2VsbGVkIH0gZnJvbSAnLi9wcm92aWRlSW5saW5lQ29tcGxldGlvbnMuanMnO1xuaW1wb3J0IHsgUmVuYW1lU3ltYm9sUHJvY2Vzc29yIH0gZnJvbSAnLi9yZW5hbWVTeW1ib2xQcm9jZXNzb3IuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UgfSBmcm9tICcuL3RleHRNb2RlbFZhbHVlUmVmZXJlbmNlLmpzJztcblxuZXhwb3J0IGNsYXNzIElubGluZUNvbXBsZXRpb25zU291cmNlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIF9yZXF1ZXN0SWQgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZU9wZXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxVcGRhdGVPcGVyYXRpb24+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dpbmdFbmFibGVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZW5kUmVxdWVzdERhdGE7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RydWN0dXJlZEZldGNoTG9nZ2VyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlID0gb2JzZXJ2YWJsZVJlZHVjZXJTZXR0YWJsZSh0aGlzLCB7XG5cdFx0aW5pdGlhbDogKCkgPT4gKHtcblx0XHRcdGlubGluZUNvbXBsZXRpb25zOiBJbmxpbmVDb21wbGV0aW9uc1N0YXRlLmNyZWF0ZUVtcHR5KCksXG5cdFx0XHRzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnM6IElubGluZUNvbXBsZXRpb25zU3RhdGUuY3JlYXRlRW1wdHkoKSxcblx0XHR9KSxcblx0XHRkaXNwb3NlRmluYWw6ICh2YWx1ZXMpID0+IHtcblx0XHRcdHZhbHVlcy5pbmxpbmVDb21wbGV0aW9ucy5kaXNwb3NlKCk7XG5cdFx0XHR2YWx1ZXMuc3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zLmRpc3Bvc2UoKTtcblx0XHR9LFxuXHRcdGNoYW5nZVRyYWNrZXI6IHJlY29yZENoYW5nZXNMYXp5KCgpID0+ICh7IHZlcnNpb25JZDogdGhpcy5fdmVyc2lvbklkIH0pKSxcblx0XHR1cGRhdGU6IChyZWFkZXIsIHByZXZpb3VzVmFsdWUsIGNoYW5nZXMpID0+IHtcblx0XHRcdGNvbnN0IGVkaXQgPSBTdHJpbmdFZGl0LmNvbXBvc2UoY2hhbmdlcy5jaGFuZ2VzLm1hcChjID0+IGMuY2hhbmdlID8gb2Zmc2V0RWRpdEZyb21Db250ZW50Q2hhbmdlcyhjLmNoYW5nZS5jaGFuZ2VzKSA6IFN0cmluZ0VkaXQuZW1wdHkpLmZpbHRlcihpc0RlZmluZWQpKTtcblxuXHRcdFx0aWYgKGVkaXQuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdHJldHVybiBwcmV2aW91c1ZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpbmxpbmVDb21wbGV0aW9uczogcHJldmlvdXNWYWx1ZS5pbmxpbmVDb21wbGV0aW9ucy5jcmVhdGVTdGF0ZVdpdGhBcHBsaWVkRWRpdChlZGl0LCB0aGlzLl90ZXh0TW9kZWwpLFxuXHRcdFx0XHRcdHN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9uczogcHJldmlvdXNWYWx1ZS5zdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMuY3JlYXRlU3RhdGVXaXRoQXBwbGllZEVkaXQoZWRpdCwgdGhpcy5fdGV4dE1vZGVsKSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHByZXZpb3VzVmFsdWUuaW5saW5lQ29tcGxldGlvbnMuZGlzcG9zZSgpO1xuXHRcdFx0XHRwcmV2aW91c1ZhbHVlLnN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaW5saW5lQ29tcGxldGlvbnMgPSB0aGlzLl9zdGF0ZS5tYXAodGhpcywgdiA9PiB2LmlubGluZUNvbXBsZXRpb25zKTtcblx0cHVibGljIHJlYWRvbmx5IHN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucyA9IHRoaXMuX3N0YXRlLm1hcCh0aGlzLCB2ID0+IHYuc3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5hbWVQcm9jZXNzb3I6IFJlbmFtZVN5bWJvbFByb2Nlc3Nvcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGF0YUNoYW5uZWxUZWxlbWV0cnlTZXJ2aWNlOiBEYXRhQ2hhbm5lbEZvcndhcmRpbmdUZWxlbWV0cnlTZXJ2aWNlO1xuXG5cdHByaXZhdGUgX2NvbXBsZXRpb25zRW5hYmxlZDogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ZlcnNpb25JZDogSU9ic2VydmFibGVXaXRoQ2hhbmdlPG51bWJlciB8IG51bGwsIElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlYm91bmNlVmFsdWU6IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jdXJzb3JQb3NpdGlvbjogSU9ic2VydmFibGU8UG9zaXRpb24+LFxuXHRcdGNvbXBsZXRpb25zRW5hYmxlbWVudFNldHRpbmc6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9kYXRhQ2hhbm5lbFRlbGVtZXRyeVNlcnZpY2UgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEYXRhQ2hhbm5lbEZvcndhcmRpbmdUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHR0aGlzLl9sb2dnaW5nRW5hYmxlZCA9IG9ic2VydmFibGVDb25maWdWYWx1ZSgnZWRpdG9yLmlubGluZVN1Z2dlc3QubG9nRmV0Y2gnLCBmYWxzZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLl9zZW5kUmVxdWVzdERhdGEgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWUoJ2VkaXRvci5pbmxpbmVTdWdnZXN0LmVtcHR5UmVzcG9uc2VJbmZvcm1hdGlvbicsIHRydWUsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5fc3RydWN0dXJlZEZldGNoTG9nZ2VyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3RydWN0dXJlZExvZ2dlci5jYXN0PFxuXHRcdFx0eyBraW5kOiAnc3RhcnQnOyByZXF1ZXN0SWQ6IG51bWJlcjsgY29udGV4dDogdW5rbm93biB9ICYgSVJlY29yZGFibGVFZGl0b3JMb2dFbnRyeVxuXHRcdFx0fCB7IGtpbmQ6ICdlbmQnOyBlcnJvcjogdW5rbm93bjsgZHVyYXRpb25NczogbnVtYmVyOyByZXN1bHQ6IHVua25vd247IHJlcXVlc3RJZDogbnVtYmVyIH0gJiBJUmVjb3JkYWJsZUxvZ0VudHJ5XG5cdFx0PigpLFxuXHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0LmxvZ0ZldGNoLmNvbW1hbmRJZCdcblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlbmFtZVByb2Nlc3NvciA9IHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW5hbWVTeW1ib2xQcm9jZXNzb3IpKTtcblxuXHRcdHRoaXMuY2xlYXJPcGVyYXRpb25PblRleHRNb2RlbENoYW5nZS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cblx0XHRpZiAoY29tcGxldGlvbnNFbmFibGVtZW50U2V0dGluZykge1xuXHRcdFx0dGhpcy5fdXBkYXRlQ29tcGxldGlvbnNFbmFibGVtZW50KGNvbXBsZXRpb25zRW5hYmxlbWVudFNldHRpbmcpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihjb21wbGV0aW9uc0VuYWJsZW1lbnRTZXR0aW5nKSkge1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUNvbXBsZXRpb25zRW5hYmxlbWVudChjb21wbGV0aW9uc0VuYWJsZW1lbnRTZXR0aW5nKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvbXBsZXRpb25zRW5hYmxlbWVudChlbmFsZW1lbnRTZXR0aW5nOiBzdHJpbmcpIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj4oZW5hbGVtZW50U2V0dGluZyk7XG5cdFx0aWYgKCFpc09iamVjdChyZXN1bHQpKSB7XG5cdFx0XHR0aGlzLl9jb21wbGV0aW9uc0VuYWJsZWQgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbXBsZXRpb25zRW5hYmxlZCA9IHJlc3VsdDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgY2xlYXJPcGVyYXRpb25PblRleHRNb2RlbENoYW5nZSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHR0aGlzLl92ZXJzaW9uSWQucmVhZChyZWFkZXIpO1xuXHRcdHRoaXMuX3VwZGF0ZU9wZXJhdGlvbi5jbGVhcigpO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIGFsd2F5cyBjb25zdGFudFxuXHR9KTtcblxuXHRwcml2YXRlIF9sb2coZW50cnk6XG5cdFx0eyBzb3VyY2VJZDogc3RyaW5nOyBraW5kOiAnc3RhcnQnOyByZXF1ZXN0SWQ6IG51bWJlcjsgY29udGV4dDogdW5rbm93bjsgcHJvdmlkZXI6IHN0cmluZyB8IHVuZGVmaW5lZCB9ICYgSVJlY29yZGFibGVFZGl0b3JMb2dFbnRyeVxuXHRcdHwgeyBzb3VyY2VJZDogc3RyaW5nOyBraW5kOiAnZW5kJzsgZXJyb3I6IHVua25vd247IGR1cmF0aW9uTXM6IG51bWJlcjsgcmVzdWx0OiB1bmtub3duOyByZXF1ZXN0SWQ6IG51bWJlcjsgZGlkQWxsUHJvdmlkZXJzUmV0dXJuOiBib29sZWFuIH0gJiBJUmVjb3JkYWJsZUxvZ0VudHJ5XG5cdCkge1xuXHRcdGlmICh0aGlzLl9sb2dnaW5nRW5hYmxlZC5nZXQoKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGZvcm1hdFJlY29yZGFibGVMb2dFbnRyeShlbnRyeSkpO1xuXHRcdH1cblx0XHR0aGlzLl9zdHJ1Y3R1cmVkRmV0Y2hMb2dnZXIubG9nKGVudHJ5KTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvYWRpbmdDb3VudCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCAwKTtcblx0cHVibGljIHJlYWRvbmx5IGxvYWRpbmcgPSB0aGlzLl9sb2FkaW5nQ291bnQubWFwKHRoaXMsIHYgPT4gdiA+IDApO1xuXG5cdHB1YmxpYyBmZXRjaChcblx0XHRwcm92aWRlcnM6IElubGluZUNvbXBsZXRpb25zUHJvdmlkZXJbXSxcblx0XHRwcm92aWRlcnNMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdGNvbnRleHQ6IElubGluZUNvbXBsZXRpb25Db250ZXh0V2l0aG91dFV1aWQsXG5cdFx0YWN0aXZlSW5saW5lQ29tcGxldGlvbjogSW5saW5lU3VnZ2VzdGlvbklkZW50aXR5IHwgdW5kZWZpbmVkLFxuXHRcdHdpdGhEZWJvdW5jZTogYm9vbGVhbixcblx0XHR1c2VySnVtcGVkVG9BY3RpdmVDb21wbGV0aW9uOiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0XHRyZXF1ZXN0SW5mbzogSW5saW5lU3VnZ2VzdFJlcXVlc3RJbmZvXG5cdCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fY3Vyc29yUG9zaXRpb24uZ2V0KCk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG5ldyBVcGRhdGVSZXF1ZXN0KHBvc2l0aW9uLCBjb250ZXh0LCB0aGlzLl90ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCksIG5ldyBTZXQocHJvdmlkZXJzKSk7XG5cblx0XHRjb25zdCB0YXJnZXQgPSBjb250ZXh0LnNlbGVjdGVkU3VnZ2VzdGlvbkluZm8gPyB0aGlzLnN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucy5nZXQoKSA6IHRoaXMuaW5saW5lQ29tcGxldGlvbnMuZ2V0KCk7XG5cblx0XHRpZiAodGhpcy5fdXBkYXRlT3BlcmF0aW9uLnZhbHVlPy5yZXF1ZXN0LnNhdGlzZmllcyhyZXF1ZXN0KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3VwZGF0ZU9wZXJhdGlvbi52YWx1ZS5wcm9taXNlO1xuXHRcdH0gZWxzZSBpZiAodGFyZ2V0Py5yZXF1ZXN0Py5zYXRpc2ZpZXMocmVxdWVzdCkpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXBkYXRlT25nb2luZyA9ICEhdGhpcy5fdXBkYXRlT3BlcmF0aW9uLnZhbHVlO1xuXHRcdHRoaXMuX3VwZGF0ZU9wZXJhdGlvbi5jbGVhcigpO1xuXG5cdFx0Y29uc3Qgc291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRjb25zdCBwcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHR0aGlzLl9sb2FkaW5nQ291bnQuc2V0KHRoaXMuX2xvYWRpbmdDb3VudC5nZXQoKSArIDEsIHVuZGVmaW5lZCk7XG5cdFx0XHRsZXQgZGlkRGVjcmVhc2UgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGRlY3JlYXNlTG9hZGluZ0NvdW50ID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWRpZERlY3JlYXNlKSB7XG5cdFx0XHRcdFx0ZGlkRGVjcmVhc2UgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX2xvYWRpbmdDb3VudC5zZXQodGhpcy5fbG9hZGluZ0NvdW50LmdldCgpIC0gMSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxvYWRpbmdSZXNldCA9IHN0b3JlLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiBkZWNyZWFzZUxvYWRpbmdDb3VudCgpLCAxMCAqIDEwMDApKTtcblx0XHRcdGxvYWRpbmdSZXNldC5zY2hlZHVsZSgpO1xuXG5cdFx0XHRjb25zdCBpbmxpbmVTdWdnZXN0aW9uc1Byb3ZpZGVycyA9IHByb3ZpZGVycy5maWx0ZXIocCA9PiBwLnByb3ZpZGVySWQpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdFJlc3BvbnNlSW5mbyA9IG5ldyBSZXF1ZXN0UmVzcG9uc2VEYXRhKGNvbnRleHQsIHJlcXVlc3RJbmZvLCBpbmxpbmVTdWdnZXN0aW9uc1Byb3ZpZGVycyk7XG5cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVjb21tZW5kZWREZWJvdW5jZVZhbHVlID0gdGhpcy5fZGVib3VuY2VWYWx1ZS5nZXQodGhpcy5fdGV4dE1vZGVsKTtcblx0XHRcdFx0Y29uc3QgZGVib3VuY2VWYWx1ZSA9IGZpbmRMYXN0TWF4KFxuXHRcdFx0XHRcdHByb3ZpZGVycy5tYXAocCA9PiBwLmRlYm91bmNlRGVsYXlNcyksXG5cdFx0XHRcdFx0Y29tcGFyZVVuZGVmaW5lZFNtYWxsZXN0KG51bWJlckNvbXBhcmF0b3IpXG5cdFx0XHRcdCkgPz8gcmVjb21tZW5kZWREZWJvdW5jZVZhbHVlO1xuXG5cdFx0XHRcdC8vIERlYm91bmNlIGluIGFueSBjYXNlIGlmIHVwZGF0ZSBpcyBvbmdvaW5nXG5cdFx0XHRcdGNvbnN0IHNob3VsZERlYm91bmNlID0gdXBkYXRlT25nb2luZyB8fCAod2l0aERlYm91bmNlICYmIGNvbnRleHQudHJpZ2dlcktpbmQgPT09IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5BdXRvbWF0aWMpO1xuXHRcdFx0XHRpZiAoc2hvdWxkRGVib3VuY2UpIHtcblx0XHRcdFx0XHQvLyBUaGlzIGRlYm91bmNlcyB0aGUgb3BlcmF0aW9uXG5cdFx0XHRcdFx0YXdhaXQgd2FpdChkZWJvdW5jZVZhbHVlLCBzb3VyY2UudG9rZW4pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCB0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkIHx8IHRoaXMuX3RleHRNb2RlbC5nZXRWZXJzaW9uSWQoKSAhPT0gcmVxdWVzdC52ZXJzaW9uSWQpIHtcblx0XHRcdFx0XHRyZXF1ZXN0UmVzcG9uc2VJbmZvLnNldE5vU3VnZ2VzdGlvblJlYXNvbklmTm90U2V0KCdjYW5jZWxlZDpiZWZvcmVGZXRjaCcpO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IElubGluZUNvbXBsZXRpb25zU291cmNlLl9yZXF1ZXN0SWQrKztcblx0XHRcdFx0aWYgKHRoaXMuX2xvZ2dpbmdFbmFibGVkLmdldCgpIHx8IHRoaXMuX3N0cnVjdHVyZWRGZXRjaExvZ2dlci5pc0VuYWJsZWQuZ2V0KCkpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2coe1xuXHRcdFx0XHRcdFx0c291cmNlSWQ6ICdJbmxpbmVDb21wbGV0aW9ucy5mZXRjaCcsXG5cdFx0XHRcdFx0XHRraW5kOiAnc3RhcnQnLFxuXHRcdFx0XHRcdFx0cmVxdWVzdElkLFxuXHRcdFx0XHRcdFx0bW9kZWxVcmk6IHRoaXMuX3RleHRNb2RlbC51cmksXG5cdFx0XHRcdFx0XHRtb2RlbFZlcnNpb246IHRoaXMuX3RleHRNb2RlbC5nZXRWZXJzaW9uSWQoKSxcblx0XHRcdFx0XHRcdGNvbnRleHQ6IHsgdHJpZ2dlcktpbmQ6IGNvbnRleHQudHJpZ2dlcktpbmQsIHN1Z2dlc3RJbmZvOiBjb250ZXh0LnNlbGVjdGVkU3VnZ2VzdGlvbkluZm8gPyB0cnVlIDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0XHR0aW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdFx0cHJvdmlkZXI6IHByb3ZpZGVyc0xhYmVsLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gbmV3IERhdGUoKTtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXJSZXN1bHQgPSBwcm92aWRlSW5saW5lQ29tcGxldGlvbnMocHJvdmlkZXJzLCB0aGlzLl9jdXJzb3JQb3NpdGlvbi5nZXQoKSwgdGhpcy5fdGV4dE1vZGVsLCBjb250ZXh0LCByZXF1ZXN0SW5mbywgdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRcdFx0cnVuV2hlbkNhbmNlbGxlZChzb3VyY2UudG9rZW4sICgpID0+IHByb3ZpZGVyUmVzdWx0LmNhbmNlbEFuZERpc3Bvc2UoeyBraW5kOiAndG9rZW5DYW5jZWxsYXRpb24nIH0pKTtcblxuXHRcdFx0XHRsZXQgc2hvdWxkU3RvcEVhcmx5ID0gZmFsc2U7XG5cdFx0XHRcdGxldCBwcm9kdWNlZFN1Z2dlc3Rpb24gPSBmYWxzZTtcblxuXHRcdFx0XHRjb25zdCBwcm92aWRlclN1Z2dlc3Rpb25zOiBJbmxpbmVTdWdnZXN0aW9uSXRlbVtdID0gW107XG5cdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgbGlzdCBvZiBwcm92aWRlclJlc3VsdC5saXN0cykge1xuXHRcdFx0XHRcdGlmICghbGlzdCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxpc3QuYWRkUmVmKCk7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBsaXN0LnJlbW92ZVJlZihsaXN0LmlubGluZVN1Z2dlc3Rpb25zRGF0YS5sZW5ndGggPT09IDAgPyB7IGtpbmQ6ICdlbXB0eScgfSA6IHsga2luZDogJ25vdFRha2VuJyB9KSkpO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGxpc3QuaW5saW5lU3VnZ2VzdGlvbnNEYXRhKSB7XG5cdFx0XHRcdFx0XHRwcm9kdWNlZFN1Z2dlc3Rpb24gPSB0cnVlO1xuXHRcdFx0XHRcdFx0aWYgKCFjb250ZXh0LmluY2x1ZGVJbmxpbmVFZGl0cyAmJiAoaXRlbS5pc0lubGluZUVkaXQgfHwgaXRlbS5zaG93SW5saW5lRWRpdE1lbnUpKSB7XG5cdFx0XHRcdFx0XHRcdGl0ZW0uc2V0Tm90U2hvd25SZWFzb24oJ25vdElubGluZUVkaXRSZXF1ZXN0ZWQnKTtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoIWNvbnRleHQuaW5jbHVkZUlubGluZUNvbXBsZXRpb25zICYmICEoaXRlbS5pc0lubGluZUVkaXQgfHwgaXRlbS5zaG93SW5saW5lRWRpdE1lbnUpKSB7XG5cdFx0XHRcdFx0XHRcdGl0ZW0uc2V0Tm90U2hvd25SZWFzb24oJ25vdElubGluZUNvbXBsZXRpb25SZXF1ZXN0ZWQnKTtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGl0ZW0uYWRkUGVyZm9ybWFuY2VNYXJrZXIoJ3Byb3ZpZGVyUmV0dXJuZWQnKTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0VXJpID0gaXRlbS5hY3Rpb24/LnVyaTtcblx0XHRcdFx0XHRcdGxldCB0YXJnZXRNb2RlbDogSVRleHRNb2RlbDtcblx0XHRcdFx0XHRcdGxldCBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdFx0aWYgKHRhcmdldFVyaSAmJiB0YXJnZXRVcmkudG9TdHJpbmcoKSAhPT0gdGhpcy5fdGV4dE1vZGVsLnVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG1vZGVsUmVmID0gYXdhaXQgdGhpcy5fdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZSh0YXJnZXRVcmkpO1xuXHRcdFx0XHRcdFx0XHR0YXJnZXRNb2RlbCA9IG1vZGVsUmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0XHRcdFx0XHRcdGRpc3Bvc2FibGUgPSBtb2RlbFJlZjtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRhcmdldE1vZGVsID0gdGhpcy5fdGV4dE1vZGVsO1xuXHRcdFx0XHRcdFx0XHRkaXNwb3NhYmxlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCByZWYgPSBUZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZS5zbmFwc2hvdCh0YXJnZXRNb2RlbCk7XG5cblx0XHRcdFx0XHRcdGNvbnN0IGkgPSBJbmxpbmVTdWdnZXN0aW9uSXRlbS5jcmVhdGUoaXRlbSwgcmVmKTtcblx0XHRcdFx0XHRcdGlmIChkaXNwb3NhYmxlKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHMgPSBydW5PbkNoYW5nZShpLmlkZW50aXR5Lm9uRGlzcG9zZSwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGRpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHRzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGl0ZW0uYWRkUGVyZm9ybWFuY2VNYXJrZXIoJ2l0ZW1DcmVhdGVkJyk7XG5cdFx0XHRcdFx0XHRwcm92aWRlclN1Z2dlc3Rpb25zLnB1c2goaSk7XG5cdFx0XHRcdFx0XHQvLyBTdG9wIGFmdGVyIGZpcnN0IHZpc2libGUgaW5saW5lIGNvbXBsZXRpb25cblx0XHRcdFx0XHRcdGlmICghaS5pc0lubGluZUVkaXQgJiYgIWkuc2hvd0lubGluZUVkaXRNZW51ICYmIGNvbnRleHQudHJpZ2dlcktpbmQgPT09IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5BdXRvbWF0aWMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGkuaXNWaXNpYmxlKHRoaXMuX3RleHRNb2RlbCwgdGhpcy5fY3Vyc29yUG9zaXRpb24uZ2V0KCkpKSB7XG5cdFx0XHRcdFx0XHRcdFx0c2hvdWxkU3RvcEVhcmx5ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChzaG91bGRTdG9wRWFybHkpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByb3ZpZGVyU3VnZ2VzdGlvbnMuZm9yRWFjaChzID0+IHMuYWRkUGVyZm9ybWFuY2VNYXJrZXIoJ3Byb3ZpZGVyc1Jlc29sdmVkJykpO1xuXG5cdFx0XHRcdGNvbnN0IHN1Z2dlc3Rpb25zOiBJbmxpbmVTdWdnZXN0aW9uSXRlbVtdID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvdmlkZXJTdWdnZXN0aW9ucy5tYXAoYXN5bmMgcyA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlbmFtZVByb2Nlc3Nvci5wcm9wb3NlUmVuYW1lUmVmYWN0b3JpbmcodGhpcy5fdGV4dE1vZGVsLCBzLCBjb250ZXh0KTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHN1Z2dlc3Rpb25zLmZvckVhY2gocyA9PiBzLmFkZFBlcmZvcm1hbmNlTWFya2VyKCdyZW5hbWVQcm9jZXNzZWQnKSk7XG5cblx0XHRcdFx0cHJvdmlkZXJSZXN1bHQuY2FuY2VsQW5kRGlzcG9zZSh7IGtpbmQ6ICdsb3N0UmFjZScgfSk7XG5cblx0XHRcdFx0aWYgKHRoaXMuX2xvZ2dpbmdFbmFibGVkLmdldCgpIHx8IHRoaXMuX3N0cnVjdHVyZWRGZXRjaExvZ2dlci5pc0VuYWJsZWQuZ2V0KCkpIHtcblx0XHRcdFx0XHRjb25zdCBkaWRBbGxQcm92aWRlcnNSZXR1cm4gPSBwcm92aWRlclJlc3VsdC5kaWRBbGxQcm92aWRlcnNSZXR1cm47XG5cdFx0XHRcdFx0bGV0IGVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKHNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCB0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkIHx8IHRoaXMuX3RleHRNb2RlbC5nZXRWZXJzaW9uSWQoKSAhPT0gcmVxdWVzdC52ZXJzaW9uSWQpIHtcblx0XHRcdFx0XHRcdGVycm9yID0gJ2NhbmNlbGVkJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gc3VnZ2VzdGlvbnMubWFwKGMgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29tcCA9IGMuZ2V0U291cmNlQ29tcGxldGlvbigpO1xuXHRcdFx0XHRcdFx0aWYgKGNvbXAuZG9Ob3RMb2cpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IG9iaiA9IHtcblx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogY29tcC5pbnNlcnRUZXh0LFxuXHRcdFx0XHRcdFx0XHRyYW5nZTogY29tcC5yYW5nZSxcblx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbFRleHRFZGl0czogY29tcC5hZGRpdGlvbmFsVGV4dEVkaXRzLFxuXHRcdFx0XHRcdFx0XHR1cmk6IGNvbXAudXJpLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiBjb21wLmNvbW1hbmQsXG5cdFx0XHRcdFx0XHRcdGd1dHRlck1lbnVMaW5rQWN0aW9uOiBjb21wLmd1dHRlck1lbnVMaW5rQWN0aW9uLFxuXHRcdFx0XHRcdFx0XHRzaG93bkNvbW1hbmQ6IGNvbXAuc2hvd25Db21tYW5kLFxuXHRcdFx0XHRcdFx0XHRjb21wbGV0ZUJyYWNrZXRQYWlyczogY29tcC5jb21wbGV0ZUJyYWNrZXRQYWlycyxcblx0XHRcdFx0XHRcdFx0aXNJbmxpbmVFZGl0OiBjb21wLmlzSW5saW5lRWRpdCxcblx0XHRcdFx0XHRcdFx0c2hvd0lubGluZUVkaXRNZW51OiBjb21wLnNob3dJbmxpbmVFZGl0TWVudSxcblx0XHRcdFx0XHRcdFx0c2hvd1JhbmdlOiBjb21wLnNob3dSYW5nZSxcblx0XHRcdFx0XHRcdFx0d2FybmluZzogY29tcC53YXJuaW5nLFxuXHRcdFx0XHRcdFx0XHRoaW50OiBjb21wLmhpbnQsXG5cdFx0XHRcdFx0XHRcdHN1cHBvcnRzUmVuYW1lOiBjb21wLnN1cHBvcnRzUmVuYW1lLFxuXHRcdFx0XHRcdFx0XHRjb3JyZWxhdGlvbklkOiBjb21wLmNvcnJlbGF0aW9uSWQsXG5cdFx0XHRcdFx0XHRcdGp1bXBUb1Bvc2l0aW9uOiBjb21wLmp1bXBUb1Bvc2l0aW9uLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdC4uLihjbG9uZUFuZENoYW5nZShvYmosIHYgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChSYW5nZS5pc0lSYW5nZSh2KSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIFJhbmdlLmxpZnQodikudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0aWYgKFBvc2l0aW9uLmlzSVBvc2l0aW9uKHYpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gUG9zaXRpb24ubGlmdCh2KS50b1N0cmluZygpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRpZiAoQ29tbWFuZC5pcyh2KSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgJGNvbW1hbmRJZDogdi5pZCB9O1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdjtcblx0XHRcdFx0XHRcdFx0fSkgYXMgb2JqZWN0KSxcblx0XHRcdFx0XHRcdFx0JHByb3ZpZGVySWQ6IGMuc291cmNlLnByb3ZpZGVyLnByb3ZpZGVySWQ/LnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0pLmZpbHRlcihyZXN1bHQgPT4gcmVzdWx0ICE9PSB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdFx0dGhpcy5fbG9nKHsgc291cmNlSWQ6ICdJbmxpbmVDb21wbGV0aW9ucy5mZXRjaCcsIGtpbmQ6ICdlbmQnLCByZXF1ZXN0SWQsIGR1cmF0aW9uTXM6IChEYXRlLm5vdygpIC0gc3RhcnRUaW1lLmdldFRpbWUoKSksIGVycm9yLCByZXN1bHQsIHRpbWU6IERhdGUubm93KCksIGRpZEFsbFByb3ZpZGVyc1JldHVybiB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlcXVlc3RSZXNwb25zZUluZm8uc2V0UmVxdWVzdFV1aWQocHJvdmlkZXJSZXN1bHQuY29udGV4dFdpdGhVdWlkLnJlcXVlc3RVdWlkKTtcblx0XHRcdFx0aWYgKHByb2R1Y2VkU3VnZ2VzdGlvbikge1xuXHRcdFx0XHRcdHJlcXVlc3RSZXNwb25zZUluZm8uc2V0SGFzUHJvZHVjZWRTdWdnZXN0aW9uKCk7XG5cdFx0XHRcdFx0aWYgKHN1Z2dlc3Rpb25zLmxlbmd0aCA+IDAgJiYgc291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRzdWdnZXN0aW9ucy5mb3JFYWNoKHMgPT4gcy5zZXROb3RTaG93blJlYXNvbklmTm90U2V0KCdjYW5jZWxlZDp3aGlsZUF3YWl0aW5nT3RoZXJQcm92aWRlcnMnKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChzb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJlcXVlc3RSZXNwb25zZUluZm8uc2V0Tm9TdWdnZXN0aW9uUmVhc29uSWZOb3RTZXQoJ2NhbmNlbGVkOndoaWxlRmV0Y2hpbmcnKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29tcGxldGlvbnNRdW90YUV4Y2VlZGVkID0gdGhpcy5fY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KCdjb21wbGV0aW9uc1F1b3RhRXhjZWVkZWQnKTtcblx0XHRcdFx0XHRcdHJlcXVlc3RSZXNwb25zZUluZm8uc2V0Tm9TdWdnZXN0aW9uUmVhc29uSWZOb3RTZXQoY29tcGxldGlvbnNRdW90YUV4Y2VlZGVkID8gJ2NvbXBsZXRpb25zUXVvdGFFeGNlZWRlZCcgOiAnbm9TdWdnZXN0aW9uJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVtYWluaW5nVGltZVRvV2FpdCA9IGNvbnRleHQuZWFybGllc3RTaG93bkRhdGVUaW1lIC0gRGF0ZS5ub3coKTtcblx0XHRcdFx0aWYgKHJlbWFpbmluZ1RpbWVUb1dhaXQgPiAwKSB7XG5cdFx0XHRcdFx0YXdhaXQgd2FpdChyZW1haW5pbmdUaW1lVG9XYWl0LCBzb3VyY2UudG9rZW4pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3VnZ2VzdGlvbnMuZm9yRWFjaChzID0+IHMuYWRkUGVyZm9ybWFuY2VNYXJrZXIoJ21pblNob3dEZWxheVBhc3NlZCcpKTtcblxuXHRcdFx0XHRpZiAoc291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgfHwgdGhpcy5fdGV4dE1vZGVsLmdldFZlcnNpb25JZCgpICE9PSByZXF1ZXN0LnZlcnNpb25JZFxuXHRcdFx0XHRcdHx8IHVzZXJKdW1wZWRUb0FjdGl2ZUNvbXBsZXRpb24uZ2V0KCkgIC8qIEluIHRoZSBtZWFudGltZSB0aGUgdXNlciBzaG93ZWQgaW50ZXJlc3QgZm9yIHRoZSBhY3RpdmUgY29tcGxldGlvbiBzbyBkb250IGhpZGUgaXQgKi8pIHtcblx0XHRcdFx0XHRjb25zdCBub3RTaG93blJlYXNvbiA9XG5cdFx0XHRcdFx0XHRzb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgPyAnY2FuY2VsZWQ6YWZ0ZXJNaW5TaG93RGVsYXknIDpcblx0XHRcdFx0XHRcdFx0dGhpcy5fc3RvcmUuaXNEaXNwb3NlZCA/ICdjYW5jZWxlZDpkaXNwb3NlZCcgOlxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3RleHRNb2RlbC5nZXRWZXJzaW9uSWQoKSAhPT0gcmVxdWVzdC52ZXJzaW9uSWQgPyAnY2FuY2VsZWQ6ZG9jdW1lbnRDaGFuZ2VkJyA6XG5cdFx0XHRcdFx0XHRcdFx0XHR1c2VySnVtcGVkVG9BY3RpdmVDb21wbGV0aW9uLmdldCgpID8gJ2NhbmNlbGVkOnVzZXJKdW1wZWQnIDpcblx0XHRcdFx0XHRcdFx0XHRcdFx0J3Vua25vd24nO1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zLmZvckVhY2gocyA9PiBzLnNldE5vdFNob3duUmVhc29uSWZOb3RTZXQobm90U2hvd25SZWFzb24pKTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBlbmRUaW1lID0gbmV3IERhdGUoKTtcblx0XHRcdFx0dGhpcy5fZGVib3VuY2VWYWx1ZS51cGRhdGUodGhpcy5fdGV4dE1vZGVsLCBlbmRUaW1lLmdldFRpbWUoKSAtIHN0YXJ0VGltZS5nZXRUaW1lKCkpO1xuXG5cdFx0XHRcdGNvbnN0IGN1cnNvclBvc2l0aW9uID0gdGhpcy5fY3Vyc29yUG9zaXRpb24uZ2V0KCk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZU9wZXJhdGlvbi5jbGVhcigpO1xuXHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBVcGRhdGUgY29tcGxldGlvbnMgd2l0aCBwcm92aWRlciByZXN1bHQgKi9cblx0XHRcdFx0XHRjb25zdCB2ID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cblx0XHRcdFx0XHRpZiAoY29udGV4dC5zZWxlY3RlZFN1Z2dlc3Rpb25JbmZvKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0XHRcdFx0XHRpbmxpbmVDb21wbGV0aW9uczogSW5saW5lQ29tcGxldGlvbnNTdGF0ZS5jcmVhdGVFbXB0eSgpLFxuXHRcdFx0XHRcdFx0XHRzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnM6IHYuc3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zLmNyZWF0ZVN0YXRlV2l0aEFwcGxpZWRSZXN1bHRzKHN1Z2dlc3Rpb25zLCByZXF1ZXN0LCB0aGlzLl90ZXh0TW9kZWwsIGN1cnNvclBvc2l0aW9uLCBhY3RpdmVJbmxpbmVDb21wbGV0aW9uKSxcblx0XHRcdFx0XHRcdH0sIHR4KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fc3RhdGUuc2V0KHtcblx0XHRcdFx0XHRcdFx0aW5saW5lQ29tcGxldGlvbnM6IHYuaW5saW5lQ29tcGxldGlvbnMuY3JlYXRlU3RhdGVXaXRoQXBwbGllZFJlc3VsdHMoc3VnZ2VzdGlvbnMsIHJlcXVlc3QsIHRoaXMuX3RleHRNb2RlbCwgY3Vyc29yUG9zaXRpb24sIGFjdGl2ZUlubGluZUNvbXBsZXRpb24pLFxuXHRcdFx0XHRcdFx0XHRzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnM6IElubGluZUNvbXBsZXRpb25zU3RhdGUuY3JlYXRlRW1wdHkoKSxcblx0XHRcdFx0XHRcdH0sIHR4KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR2LmlubGluZUNvbXBsZXRpb25zLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR2LnN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucy5kaXNwb3NlKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRkZWNyZWFzZUxvYWRpbmdDb3VudCgpO1xuXHRcdFx0XHR0aGlzLl9zZW5kSW5saW5lQ29tcGxldGlvbnNSZXF1ZXN0VGVsZW1ldHJ5KHJlcXVlc3RSZXNwb25zZUluZm8pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KSgpO1xuXG5cdFx0Y29uc3QgdXBkYXRlT3BlcmF0aW9uID0gbmV3IFVwZGF0ZU9wZXJhdGlvbihyZXF1ZXN0LCBzb3VyY2UsIHByb21pc2UpO1xuXHRcdHRoaXMuX3VwZGF0ZU9wZXJhdGlvbi52YWx1ZSA9IHVwZGF0ZU9wZXJhdGlvbjtcblxuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0cHVibGljIGNsZWFyKHR4OiBJVHJhbnNhY3Rpb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVPcGVyYXRpb24uY2xlYXIoKTtcblx0XHRjb25zdCB2ID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0dGhpcy5fc3RhdGUuc2V0KHtcblx0XHRcdGlubGluZUNvbXBsZXRpb25zOiBJbmxpbmVDb21wbGV0aW9uc1N0YXRlLmNyZWF0ZUVtcHR5KCksXG5cdFx0XHRzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnM6IElubGluZUNvbXBsZXRpb25zU3RhdGUuY3JlYXRlRW1wdHkoKVxuXHRcdH0sIHR4KTtcblx0XHR2LmlubGluZUNvbXBsZXRpb25zLmRpc3Bvc2UoKTtcblx0XHR2LnN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgc2VlZElubGluZUNvbXBsZXRpb25zV2l0aFN1Z2dlc3RXaWRnZXQoKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5saW5lQ29tcGxldGlvbnMgPSB0aGlzLmlubGluZUNvbXBsZXRpb25zLmdldCgpO1xuXHRcdGNvbnN0IHN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucyA9IHRoaXMuc3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zLmdldCgpO1xuXHRcdGlmICghc3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gU2VlZCBpbmxpbmUgY29tcGxldGlvbnMgd2l0aCAobmV3ZXIpIHN1Z2dlc3Qgd2lkZ2V0IGlubGluZSBjb21wbGV0aW9ucyAqL1xuXHRcdFx0aWYgKCFpbmxpbmVDb21wbGV0aW9ucyB8fCAoc3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zLnJlcXVlc3Q/LnZlcnNpb25JZCA/PyAtMSkgPiAoaW5saW5lQ29tcGxldGlvbnMucmVxdWVzdD8udmVyc2lvbklkID8/IC0xKSkge1xuXHRcdFx0XHRpbmxpbmVDb21wbGV0aW9ucz8uZGlzcG9zZSgpO1xuXHRcdFx0XHRjb25zdCBzID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLnNldCh7XG5cdFx0XHRcdFx0aW5saW5lQ29tcGxldGlvbnM6IHN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucy5jbG9uZSgpLFxuXHRcdFx0XHRcdHN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9uczogSW5saW5lQ29tcGxldGlvbnNTdGF0ZS5jcmVhdGVFbXB0eSgpLFxuXHRcdFx0XHR9LCB0eCk7XG5cdFx0XHRcdHMuaW5saW5lQ29tcGxldGlvbnMuZGlzcG9zZSgpO1xuXHRcdFx0XHRzLnN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNsZWFyU3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zKHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZWVkcyB0aGUgaW5saW5lIGNvbXBsZXRpb25zIHdpdGggYW4gZXh0ZXJuYWwgaW5saW5lIGNvbXBsZXRpb24gaXRlbS5cblx0ICogVXNlZCB3aGVuIHRyYW5zcGxhbnRpbmcgYSBjb21wbGV0aW9uIGZyb20gb25lIG1vZGVsIHRvIGFub3RoZXIgKGNyb3NzLWZpbGUgZWRpdHMpLlxuXHQgKi9cblx0cHVibGljIHNlZWRXaXRoQ29tcGxldGlvbihpdGVtOiBJbmxpbmVTdWdnZXN0aW9uSXRlbSwgdHg6IElUcmFuc2FjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHMgPSB0aGlzLl9zdGF0ZS5nZXQoKTtcblx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0aW5saW5lQ29tcGxldGlvbnM6IG5ldyBJbmxpbmVDb21wbGV0aW9uc1N0YXRlKFtpdGVtXSwgdW5kZWZpbmVkKSxcblx0XHRcdHN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9uczogSW5saW5lQ29tcGxldGlvbnNTdGF0ZS5jcmVhdGVFbXB0eSgpLFxuXHRcdH0sIHR4KTtcblx0XHRzLmlubGluZUNvbXBsZXRpb25zLmRpc3Bvc2UoKTtcblx0XHRzLnN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kSW5saW5lQ29tcGxldGlvbnNSZXF1ZXN0VGVsZW1ldHJ5KFxuXHRcdHJlcXVlc3RSZXNwb25zZUluZm86IFJlcXVlc3RSZXNwb25zZURhdGFcblx0KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zZW5kUmVxdWVzdERhdGEuZ2V0KCkgJiYgIXRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuPignaXNSdW5uaW5nVW5pZmljYXRpb25FeHBlcmltZW50JykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocmVxdWVzdFJlc3BvbnNlSW5mby5yZXF1ZXN0VXVpZCA9PT0gdW5kZWZpbmVkIHx8IHJlcXVlc3RSZXNwb25zZUluZm8uaGFzUHJvZHVjZWRTdWdnZXN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cblx0XHRpZiAoIWlzQ29tcGxldGlvbnNFbmFibGVkRnJvbU9iamVjdCh0aGlzLl9jb21wbGV0aW9uc0VuYWJsZWQsIHRoaXMuX3RleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXF1ZXN0UmVzcG9uc2VJbmZvLnByb3ZpZGVycy5zb21lKHAgPT4gaXNDb3BpbG90TGlrZUV4dGVuc2lvbihwLnByb3ZpZGVySWQ/LmV4dGVuc2lvbklkKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbXB0eUVuZE9mTGlmZUV2ZW50OiBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlRXZlbnQgPSB7XG5cdFx0XHRvcHBvcnR1bml0eUlkOiByZXF1ZXN0UmVzcG9uc2VJbmZvLnJlcXVlc3RVdWlkLFxuXHRcdFx0bm9TdWdnZXN0aW9uUmVhc29uOiByZXF1ZXN0UmVzcG9uc2VJbmZvLm5vU3VnZ2VzdGlvblJlYXNvbiA/PyAndW5rbm93bicsXG5cdFx0XHRleHRlbnNpb25JZDogJ3ZzY29kZS1jb3JlJyxcblx0XHRcdGV4dGVuc2lvblZlcnNpb246ICcwLjAuMCcsXG5cdFx0XHRncm91cElkOiAnZW1wdHknLFxuXHRcdFx0c2hvd246IGZhbHNlLFxuXHRcdFx0c2t1UGxhbjogcmVxdWVzdFJlc3BvbnNlSW5mby5yZXF1ZXN0SW5mby5za3U/LnBsYW4sXG5cdFx0XHRza3VUeXBlOiByZXF1ZXN0UmVzcG9uc2VJbmZvLnJlcXVlc3RJbmZvLnNrdT8udHlwZSxcblx0XHRcdGVkaXRvclR5cGU6IHJlcXVlc3RSZXNwb25zZUluZm8ucmVxdWVzdEluZm8uZWRpdG9yVHlwZSxcblx0XHRcdHJlcXVlc3RSZWFzb246IHJlcXVlc3RSZXNwb25zZUluZm8ucmVxdWVzdEluZm8ucmVhc29uLFxuXHRcdFx0dHlwaW5nSW50ZXJ2YWw6IHJlcXVlc3RSZXNwb25zZUluZm8ucmVxdWVzdEluZm8udHlwaW5nSW50ZXJ2YWwsXG5cdFx0XHR0eXBpbmdJbnRlcnZhbENoYXJhY3RlckNvdW50OiByZXF1ZXN0UmVzcG9uc2VJbmZvLnJlcXVlc3RJbmZvLnR5cGluZ0ludGVydmFsQ2hhcmFjdGVyQ291bnQsXG5cdFx0XHRsYW5ndWFnZUlkOiByZXF1ZXN0UmVzcG9uc2VJbmZvLnJlcXVlc3RJbmZvLmxhbmd1YWdlSWQsXG5cdFx0XHRzZWxlY3RlZFN1Z2dlc3Rpb25JbmZvOiAhIXJlcXVlc3RSZXNwb25zZUluZm8uY29udGV4dC5zZWxlY3RlZFN1Z2dlc3Rpb25JbmZvLFxuXHRcdFx0YXZhaWxhYmxlUHJvdmlkZXJzOiByZXF1ZXN0UmVzcG9uc2VJbmZvLnByb3ZpZGVycy5tYXAocCA9PiBwLnByb3ZpZGVySWQ/LnRvU3RyaW5nKCkpLmZpbHRlcihpc0RlZmluZWQpLmpvaW4oJywnKSxcblx0XHRcdC4uLmZvcndhcmRUb0NoYW5uZWxJZihyZXF1ZXN0UmVzcG9uc2VJbmZvLnByb3ZpZGVycy5zb21lKHAgPT4gaXNDb3BpbG90TGlrZUV4dGVuc2lvbihwLnByb3ZpZGVySWQ/LmV4dGVuc2lvbklkKSkpLFxuXHRcdFx0dGltZVVudGlsUHJvdmlkZXJSZXF1ZXN0OiB1bmRlZmluZWQsXG5cdFx0XHR0aW1lVW50aWxQcm92aWRlclJlc3BvbnNlOiB1bmRlZmluZWQsXG5cdFx0XHR2aWV3S2luZDogdW5kZWZpbmVkLFxuXHRcdFx0cHJlY2VlZGVkOiB1bmRlZmluZWQsXG5cdFx0XHRzdXBlcnNlZGVkOiB1bmRlZmluZWQsXG5cdFx0XHRyZWFzb246IHVuZGVmaW5lZCxcblx0XHRcdGFjY2VwdGVkQWx0ZXJuYXRpdmVBY3Rpb246IHVuZGVmaW5lZCxcblx0XHRcdGNvcnJlbGF0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHNob3duRHVyYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdHNob3duRHVyYXRpb25VbmNvbGxhcHNlZDogdW5kZWZpbmVkLFxuXHRcdFx0dGltZVVudGlsU2hvd246IHVuZGVmaW5lZCxcblx0XHRcdHBhcnRpYWxseUFjY2VwdGVkOiB1bmRlZmluZWQsXG5cdFx0XHRwYXJ0aWFsbHlBY2NlcHRlZENvdW50U2luY2VPcmlnaW5hbDogdW5kZWZpbmVkLFxuXHRcdFx0cGFydGlhbGx5QWNjZXB0ZWRSYXRpb1NpbmNlT3JpZ2luYWw6IHVuZGVmaW5lZCxcblx0XHRcdHBhcnRpYWxseUFjY2VwdGVkQ2hhcmFjdGVyc1NpbmNlT3JpZ2luYWw6IHVuZGVmaW5lZCxcblx0XHRcdGN1cnNvckNvbHVtbkRpc3RhbmNlOiB1bmRlZmluZWQsXG5cdFx0XHRjdXJzb3JMaW5lRGlzdGFuY2U6IHVuZGVmaW5lZCxcblx0XHRcdGxpbmVDb3VudE9yaWdpbmFsOiB1bmRlZmluZWQsXG5cdFx0XHRsaW5lQ291bnRNb2RpZmllZDogdW5kZWZpbmVkLFxuXHRcdFx0Y2hhcmFjdGVyQ291bnRPcmlnaW5hbDogdW5kZWZpbmVkLFxuXHRcdFx0Y2hhcmFjdGVyQ291bnRNb2RpZmllZDogdW5kZWZpbmVkLFxuXHRcdFx0ZGlzam9pbnRSZXBsYWNlbWVudHM6IHVuZGVmaW5lZCxcblx0XHRcdHNhbWVTaGFwZVJlcGxhY2VtZW50czogdW5kZWZpbmVkLFxuXHRcdFx0bG9uZ0Rpc3RhbmNlSGludFZpc2libGU6IHVuZGVmaW5lZCxcblx0XHRcdGxvbmdEaXN0YW5jZUhpbnREaXN0YW5jZTogdW5kZWZpbmVkLFxuXHRcdFx0aXNGb3JBbm90aGVyRG9jdW1lbnQ6IHVuZGVmaW5lZCxcblx0XHRcdG5vdFNob3duUmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHRyZW5hbWVDcmVhdGVkOiBmYWxzZSxcblx0XHRcdHJlbmFtZUR1cmF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRyZW5hbWVUaW1lZE91dDogZmFsc2UsXG5cdFx0XHRyZW5hbWVEcm9wcGVkT3RoZXJFZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0cmVuYW1lRHJvcHBlZFJlbmFtZUVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRwZXJmb3JtYW5jZU1hcmtlcnM6IHVuZGVmaW5lZCxcblx0XHRcdGVkaXRLaW5kOiB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdHNlbmRJbmxpbmVDb21wbGV0aW9uc0VuZE9mTGlmZVRlbGVtZXRyeSh0aGlzLl9kYXRhQ2hhbm5lbFRlbGVtZXRyeVNlcnZpY2UsIGVtcHR5RW5kT2ZMaWZlRXZlbnQpO1xuXHR9XG5cblx0cHVibGljIGNsZWFyU3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zKHR4OiBJVHJhbnNhY3Rpb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdXBkYXRlT3BlcmF0aW9uLnZhbHVlPy5yZXF1ZXN0LmNvbnRleHQuc2VsZWN0ZWRTdWdnZXN0aW9uSW5mbykge1xuXHRcdFx0dGhpcy5fdXBkYXRlT3BlcmF0aW9uLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNhbmNlbFVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl91cGRhdGVPcGVyYXRpb24uY2xlYXIoKTtcblx0fVxufVxuXG5jbGFzcyBVcGRhdGVSZXF1ZXN0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHBvc2l0aW9uOiBQb3NpdGlvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29udGV4dDogSW5saW5lQ29tcGxldGlvbkNvbnRleHRXaXRob3V0VXVpZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdmVyc2lvbklkOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHByb3ZpZGVyczogU2V0PElubGluZUNvbXBsZXRpb25zUHJvdmlkZXI+LFxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBzYXRpc2ZpZXMob3RoZXI6IFVwZGF0ZVJlcXVlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5wb3NpdGlvbi5lcXVhbHMob3RoZXIucG9zaXRpb24pXG5cdFx0XHQmJiBlcXVhbHNJZkRlZmluZWQodGhpcy5jb250ZXh0LnNlbGVjdGVkU3VnZ2VzdGlvbkluZm8sIG90aGVyLmNvbnRleHQuc2VsZWN0ZWRTdWdnZXN0aW9uSW5mbywgdGhpc0VxdWFsc0MoKSlcblx0XHRcdCYmIChvdGhlci5jb250ZXh0LnRyaWdnZXJLaW5kID09PSBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQuQXV0b21hdGljXG5cdFx0XHRcdHx8IHRoaXMuY29udGV4dC50cmlnZ2VyS2luZCA9PT0gSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLkV4cGxpY2l0KVxuXHRcdFx0JiYgdGhpcy52ZXJzaW9uSWQgPT09IG90aGVyLnZlcnNpb25JZFxuXHRcdFx0JiYgaXNTdWJzZXQob3RoZXIucHJvdmlkZXJzLCB0aGlzLnByb3ZpZGVycyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzRXhwbGljaXRSZXF1ZXN0KCkge1xuXHRcdHJldHVybiB0aGlzLmNvbnRleHQudHJpZ2dlcktpbmQgPT09IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5FeHBsaWNpdDtcblx0fVxufVxuXG5jbGFzcyBSZXF1ZXN0UmVzcG9uc2VEYXRhIHtcblx0cHVibGljIHJlcXVlc3RVdWlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBub1N1Z2dlc3Rpb25SZWFzb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGhhc1Byb2R1Y2VkU3VnZ2VzdGlvbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBjb250ZXh0OiBJbmxpbmVDb21wbGV0aW9uQ29udGV4dFdpdGhvdXRVdWlkLFxuXHRcdHB1YmxpYyByZWFkb25seSByZXF1ZXN0SW5mbzogSW5saW5lU3VnZ2VzdFJlcXVlc3RJbmZvLFxuXHRcdHB1YmxpYyByZWFkb25seSBwcm92aWRlcnM6IElubGluZUNvbXBsZXRpb25zUHJvdmlkZXJbXSxcblx0KSB7IH1cblxuXHRzZXRSZXF1ZXN0VXVpZCh1dWlkOiBzdHJpbmcpIHtcblx0XHR0aGlzLnJlcXVlc3RVdWlkID0gdXVpZDtcblx0fVxuXG5cdHNldE5vU3VnZ2VzdGlvblJlYXNvbklmTm90U2V0KHR5cGU6IHN0cmluZykge1xuXHRcdHRoaXMubm9TdWdnZXN0aW9uUmVhc29uID8/PSB0eXBlO1xuXHR9XG5cblx0c2V0SGFzUHJvZHVjZWRTdWdnZXN0aW9uKCkge1xuXHRcdHRoaXMuaGFzUHJvZHVjZWRTdWdnZXN0aW9uID0gdHJ1ZTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc1N1YnNldDxUPihzZXQxOiBTZXQ8VD4sIHNldDI6IFNldDxUPik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gWy4uLnNldDFdLmV2ZXJ5KGl0ZW0gPT4gc2V0Mi5oYXMoaXRlbSkpO1xufVxuXG5jbGFzcyBVcGRhdGVPcGVyYXRpb24gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByZXF1ZXN0OiBVcGRhdGVSZXF1ZXN0LFxuXHRcdHB1YmxpYyByZWFkb25seSBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IHByb21pc2U6IFByb21pc2U8Ym9vbGVhbj4sXG5cdCkge1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLmNhbmNlbGxhdGlvblRva2VuU291cmNlLmNhbmNlbCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVDb21wbGV0aW9uc1N0YXRlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlRW1wdHkoKTogSW5saW5lQ29tcGxldGlvbnNTdGF0ZSB7XG5cdFx0cmV0dXJuIG5ldyBJbmxpbmVDb21wbGV0aW9uc1N0YXRlKFtdLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGlubGluZUNvbXBsZXRpb25zOiByZWFkb25seSBJbmxpbmVTdWdnZXN0aW9uSXRlbVtdLFxuXHRcdHB1YmxpYyByZWFkb25seSByZXF1ZXN0OiBVcGRhdGVSZXF1ZXN0IHwgdW5kZWZpbmVkLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Zm9yIChjb25zdCBpbmxpbmVDb21wbGV0aW9uIG9mIHRoaXMuaW5saW5lQ29tcGxldGlvbnMpIHtcblx0XHRcdGlubGluZUNvbXBsZXRpb24uYWRkUmVmKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGlubGluZUNvbXBsZXRpb24gb2YgdGhpcy5pbmxpbmVDb21wbGV0aW9ucykge1xuXHRcdFx0XHRcdGlubGluZUNvbXBsZXRpb24ucmVtb3ZlUmVmKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRCeUlkKGlkOiBJbmxpbmVTdWdnZXN0aW9uSWRlbnRpdHkpOiBJbmxpbmVTdWdnZXN0aW9uSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5saW5lQ29tcGxldGlvbnMuZmluZChpID0+IGkuaWRlbnRpdHkgPT09IGlkKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRCeUhhc2goaGFzaDogc3RyaW5nKTogSW5saW5lU3VnZ2VzdGlvbkl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmlubGluZUNvbXBsZXRpb25zLmZpbmQoaSA9PiBpLmhhc2ggPT09IGhhc2gpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGxpZXMgdGhlIGVkaXQgb24gdGhlIHN0YXRlLlxuXHQqL1xuXHRwdWJsaWMgY3JlYXRlU3RhdGVXaXRoQXBwbGllZEVkaXQoZWRpdDogU3RyaW5nRWRpdCwgdGV4dE1vZGVsOiBJVGV4dE1vZGVsKTogSW5saW5lQ29tcGxldGlvbnNTdGF0ZSB7XG5cdFx0Y29uc3QgbmV3SW5saW5lQ29tcGxldGlvbnMgPSB0aGlzLmlubGluZUNvbXBsZXRpb25zLm1hcChpID0+IGkud2l0aEVkaXQoZWRpdCwgdGV4dE1vZGVsKSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdFx0cmV0dXJuIG5ldyBJbmxpbmVDb21wbGV0aW9uc1N0YXRlKG5ld0lubGluZUNvbXBsZXRpb25zLCB0aGlzLnJlcXVlc3QpO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZVN0YXRlV2l0aEFwcGxpZWRSZXN1bHRzKHVwZGF0ZWRTdWdnZXN0aW9uczogSW5saW5lU3VnZ2VzdGlvbkl0ZW1bXSwgcmVxdWVzdDogVXBkYXRlUmVxdWVzdCwgdGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBjdXJzb3JQb3NpdGlvbjogUG9zaXRpb24sIGl0ZW1JZFRvUHJlc2VydmVBdFRvcDogSW5saW5lU3VnZ2VzdGlvbklkZW50aXR5IHwgdW5kZWZpbmVkKTogSW5saW5lQ29tcGxldGlvbnNTdGF0ZSB7XG5cdFx0bGV0IGl0ZW1Ub1ByZXNlcnZlOiBJbmxpbmVTdWdnZXN0aW9uSXRlbSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoaXRlbUlkVG9QcmVzZXJ2ZUF0VG9wKSB7XG5cdFx0XHRjb25zdCBpdGVtVG9QcmVzZXJ2ZUNhbmRpZGF0ZSA9IHRoaXMuX2ZpbmRCeUlkKGl0ZW1JZFRvUHJlc2VydmVBdFRvcCk7XG5cdFx0XHRpZiAoaXRlbVRvUHJlc2VydmVDYW5kaWRhdGUgJiYgaXRlbVRvUHJlc2VydmVDYW5kaWRhdGUuY2FuQmVSZXVzZWQodGV4dE1vZGVsLCByZXF1ZXN0LnBvc2l0aW9uKSkge1xuXHRcdFx0XHRpdGVtVG9QcmVzZXJ2ZSA9IGl0ZW1Ub1ByZXNlcnZlQ2FuZGlkYXRlO1xuXG5cdFx0XHRcdGNvbnN0IHVwZGF0ZWRJdGVtVG9QcmVzZXJ2ZSA9IHVwZGF0ZWRTdWdnZXN0aW9ucy5maW5kKGkgPT4gaS5oYXNoID09PSBpdGVtVG9QcmVzZXJ2ZUNhbmRpZGF0ZS5oYXNoKTtcblx0XHRcdFx0aWYgKHVwZGF0ZWRJdGVtVG9QcmVzZXJ2ZSkge1xuXHRcdFx0XHRcdHVwZGF0ZWRTdWdnZXN0aW9ucyA9IG1vdmVUb0Zyb250KHVwZGF0ZWRJdGVtVG9QcmVzZXJ2ZSwgdXBkYXRlZFN1Z2dlc3Rpb25zKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR1cGRhdGVkU3VnZ2VzdGlvbnMgPSBbaXRlbVRvUHJlc2VydmVDYW5kaWRhdGUsIC4uLnVwZGF0ZWRTdWdnZXN0aW9uc107XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwcmVmZXJJbmxpbmVDb21wbGV0aW9ucyA9IGl0ZW1Ub1ByZXNlcnZlXG5cdFx0XHQvLyBpdGVtVG9QcmVzZXJ2ZSBoYXMgcHJlY2VkZW5jZVxuXHRcdFx0PyAhaXRlbVRvUHJlc2VydmUuaXNJbmxpbmVFZGl0XG5cdFx0XHQvLyBPdGhlcndpc2U6IHByZWZlciBpbmxpbmUgY29tcGxldGlvbiBpZiB0aGVyZSBpcyBhIHZpc2libGUgb25lXG5cdFx0XHQ6IHVwZGF0ZWRTdWdnZXN0aW9ucy5zb21lKGkgPT4gIWkuaXNJbmxpbmVFZGl0ICYmIGkuaXNWaXNpYmxlKHRleHRNb2RlbCwgY3Vyc29yUG9zaXRpb24pKTtcblxuXHRcdGxldCB1cGRhdGVkSXRlbXM6IElubGluZVN1Z2dlc3Rpb25JdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGkgb2YgdXBkYXRlZFN1Z2dlc3Rpb25zKSB7XG5cdFx0XHRjb25zdCBvbGRJdGVtID0gdGhpcy5fZmluZEJ5SGFzaChpLmhhc2gpO1xuXHRcdFx0bGV0IGl0ZW07XG5cdFx0XHRpZiAob2xkSXRlbSAmJiBvbGRJdGVtICE9PSBpKSB7XG5cdFx0XHRcdGl0ZW0gPSBpLndpdGhJZGVudGl0eShvbGRJdGVtLmlkZW50aXR5KTtcblx0XHRcdFx0aS5zZXRJc1ByZWNlZWRlZChvbGRJdGVtKTtcblx0XHRcdFx0b2xkSXRlbS5zZXRFbmRPZkxpZmVSZWFzb24oeyBraW5kOiBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZC5JZ25vcmVkLCB1c2VyVHlwaW5nRGlzYWdyZWVkOiBmYWxzZSwgc3VwZXJzZWRlZEJ5OiBpLmdldFNvdXJjZUNvbXBsZXRpb24oKSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGl0ZW0gPSBpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByZWZlcklubGluZUNvbXBsZXRpb25zICE9PSBpdGVtLmlzSW5saW5lRWRpdCkge1xuXHRcdFx0XHR1cGRhdGVkSXRlbXMucHVzaChpdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR1cGRhdGVkSXRlbXMuc29ydChjb21wYXJlQnkoaSA9PiBpLnNob3dJbmxpbmVFZGl0TWVudSwgYm9vbGVhbkNvbXBhcmF0b3IpKTtcblx0XHR1cGRhdGVkSXRlbXMgPSBkaXN0aW5jdEJ5S2V5KHVwZGF0ZWRJdGVtcywgaSA9PiBpLnNlbWFudGljSWQpO1xuXG5cdFx0cmV0dXJuIG5ldyBJbmxpbmVDb21wbGV0aW9uc1N0YXRlKHVwZGF0ZWRJdGVtcywgcmVxdWVzdCk7XG5cdH1cblxuXHRwdWJsaWMgY2xvbmUoKTogSW5saW5lQ29tcGxldGlvbnNTdGF0ZSB7XG5cdFx0cmV0dXJuIG5ldyBJbmxpbmVDb21wbGV0aW9uc1N0YXRlKHRoaXMuaW5saW5lQ29tcGxldGlvbnMsIHRoaXMucmVxdWVzdCk7XG5cdH1cbn1cblxuLyoqIEtlZXBzIHRoZSBmaXJzdCBpdGVtIGluIGNhc2Ugb2YgZHVwbGljYXRlcy4gKi9cbmZ1bmN0aW9uIGRpc3RpbmN0QnlLZXk8VD4oaXRlbXM6IFRbXSwga2V5OiAoaXRlbTogVCkgPT4gdW5rbm93bik6IFRbXSB7XG5cdGNvbnN0IHNlZW4gPSBuZXcgU2V0KCk7XG5cdHJldHVybiBpdGVtcy5maWx0ZXIoaXRlbSA9PiB7XG5cdFx0Y29uc3QgayA9IGtleShpdGVtKTtcblx0XHRpZiAoc2Vlbi5oYXMoaykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0c2Vlbi5hZGQoayk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBtb3ZlVG9Gcm9udDxUPihpdGVtOiBULCBpdGVtczogVFtdKTogVFtdIHtcblx0Y29uc3QgaW5kZXggPSBpdGVtcy5pbmRleE9mKGl0ZW0pO1xuXHRpZiAoaW5kZXggPiAtMSkge1xuXHRcdHJldHVybiBbaXRlbSwgLi4uaXRlbXMuc2xpY2UoMCwgaW5kZXgpLCAuLi5pdGVtcy5zbGljZShpbmRleCArIDEpXTtcblx0fVxuXHRyZXR1cm4gaXRlbXM7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsbUJBQW1CLFdBQVcsMEJBQTBCLHdCQUF3QjtBQUN6RixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGlCQUFpQixtQkFBbUI7QUFDN0MsU0FBUyxZQUFZLGlCQUE4QixtQkFBbUIsb0JBQW9CO0FBQzFGLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsU0FBMkQsaUJBQWlCLG1CQUFtQixhQUFhLG1CQUFtQjtBQUV4SSxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLFdBQVcsZ0JBQWdCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RD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
