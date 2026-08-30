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
import { reverseOrder, compareBy, numberComparator, sumBy } from "../../../../../base/common/arrays.js";
import { IntervalTimer } from "../../../../../base/common/async.js";
import { toDisposable, Disposable } from "../../../../../base/common/lifecycle.js";
import { mapObservableArrayCached, derived, observableSignal, runOnChange, autorun } from "../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { sendEditSourcesDetailsTelemetry, sendEditSourcesStatsTelemetry } from "../../../../../platform/telemetry/common/editTelemetry.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IUserAttentionService } from "../../../../services/userAttention/common/userAttentionService.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { CreateSuggestionIdForChatOrInlineChatCaller, EditTelemetryReportEditArcForChatOrInlineChatSender, EditTelemetryReportInlineEditArcSender } from "./arcTelemetrySender.js";
import { createDocWithJustReason } from "../helpers/documentWithAnnotatedEdits.js";
import { DocumentEditSourceTracker } from "./editTracker.js";
import { sumByCategory } from "../helpers/utils.js";
import { ScmAdapter } from "./scmAdapter.js";
import { IRandomService } from "../randomService.js";
import { AgentHostEditAttributionDeferredError, AgentHostEditAttributionUnknownOutcomeError } from "./agentHostEditMarkerService.js";
const FOCUS_CORRELATION_DRAIN_TIMEOUT = 1e3;
function getEditTelemetryCategory(source) {
  if (source.category === "ai" && source.kind === "nes") {
    return "nes";
  }
  if (source.category === "ai" && source.kind === "completion" && source.extensionId === "github.copilot") {
    return "inlineCompletionsCopilot";
  }
  if (source.category === "ai" && source.kind === "completion" && source.extensionId === "github.copilot-chat" && source.providerId === "nes") {
    return "inlineCompletionsNES";
  }
  if (source.category === "ai" && source.kind === "completion" && source.extensionId === "github.copilot-chat" && source.providerId === "completions") {
    return "inlineCompletionsCopilot";
  }
  if (source.category === "ai" && source.kind === "completion") {
    return "inlineCompletionsOther";
  }
  if (source.category === "ai") {
    return "otherAI";
  }
  if (source.category === "agentHost") {
    return "agentHost";
  }
  if (source.category === "user") {
    return "user";
  }
  if (source.category === "ide") {
    return "ide";
  }
  if (source.category === "external") {
    return "external";
  }
  return "unknown";
}
let EditSourceTrackingImpl = class extends Disposable {
  constructor(_statsEnabled, _annotatedDocuments, _agentHostEditMarkerService, _instantiationService) {
    super();
    this._statsEnabled = _statsEnabled;
    this._annotatedDocuments = _annotatedDocuments;
    this._agentHostEditMarkerService = _agentHostEditMarkerService;
    this._instantiationService = _instantiationService;
    const scmBridge = this._instantiationService.createInstance(ScmAdapter);
    this._states = mapObservableArrayCached(this, this._annotatedDocuments.documents, (doc, store) => {
      return [doc.document, store.add(this._instantiationService.createInstance(TrackedDocumentInfo, doc, scmBridge, this._statsEnabled, this._agentHostEditMarkerService))];
    });
    this.docsState = this._states.map((entries) => new Map(entries));
    this.docsState.recomputeInitiallyAndOnChange(this._store);
  }
};
EditSourceTrackingImpl = __decorateClass([
  __decorateParam(3, IInstantiationService)
], EditSourceTrackingImpl);
let TrackedDocumentInfo = class extends Disposable {
  constructor(_doc, _scm, _statsEnabled, _agentHostEditMarkerService, _instantiationService, _telemetryService, _randomService, _userAttentionService, _textFileService, _logService) {
    super();
    this._doc = _doc;
    this._scm = _scm;
    this._statsEnabled = _statsEnabled;
    this._agentHostEditMarkerService = _agentHostEditMarkerService;
    this._instantiationService = _instantiationService;
    this._telemetryService = _telemetryService;
    this._randomService = _randomService;
    this._userAttentionService = _userAttentionService;
    this._textFileService = _textFileService;
    this._logService = _logService;
    this._repo = derived(this, (reader) => this._scm.getRepo(_doc.document.uri, reader));
    const docWithJustReason = createDocWithJustReason(_doc.documentWithAnnotations, this._store);
    const externalEditCorrelation = this._agentHostEditMarkerService?.createCorrelation(_doc.document.uri);
    const longtermResetSignal = observableSignal("resetSignal");
    let longtermReason = "closed";
    this.longtermTracker = derived((reader) => {
      if (!this._statsEnabled.read(reader)) {
        return void 0;
      }
      longtermResetSignal.read(reader);
      const t = new DocumentEditSourceTracker(docWithJustReason, void 0, externalEditCorrelation);
      const startFocusTime = this._userAttentionService.totalFocusTimeMs;
      const startTime = Date.now();
      reader.store.add(toDisposable(() => {
        t.stopTracking();
        this._sendTelemetryAndLog("longterm", longtermReason, t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
      }));
      return t;
    }).recomputeInitiallyAndOnChange(this._store);
    this._store.add(new IntervalTimer()).cancelAndSet(() => {
      longtermReason = "10hours";
      longtermResetSignal.trigger(void 0);
      longtermReason = "closed";
    }, 10 * 60 * 60 * 1e3);
    this._store.add(autorun((reader) => {
      const repo = this._repo.read(reader);
      if (repo) {
        reader.store.add(runOnChange(repo.headCommitHashObs, () => {
          longtermReason = "hashChange";
          longtermResetSignal.trigger(void 0);
          longtermReason = "closed";
        }));
        reader.store.add(runOnChange(repo.headBranchNameObs, () => {
          longtermReason = "branchChange";
          longtermResetSignal.trigger(void 0);
          longtermReason = "closed";
        }));
      }
    }));
    this._store.add(this._instantiationService.createInstance(EditTelemetryReportInlineEditArcSender, _doc.documentWithAnnotations, this._repo));
    this._store.add(this._instantiationService.createInstance(EditTelemetryReportEditArcForChatOrInlineChatSender, _doc.documentWithAnnotations, this._repo));
    this._store.add(this._instantiationService.createInstance(CreateSuggestionIdForChatOrInlineChatCaller, _doc.documentWithAnnotations));
    const resetSignal = observableSignal("resetSignal");
    this.windowedTracker = derived((reader) => {
      if (!this._statsEnabled.read(reader)) {
        return void 0;
      }
      if (!this._doc.isVisible.read(reader)) {
        return void 0;
      }
      resetSignal.read(reader);
      reader.store.add(this._userAttentionService.fireAfterGivenFocusTimePassed(10 * 60 * 1e3, () => {
        resetSignal.trigger(void 0);
      }));
      const t = new DocumentEditSourceTracker(docWithJustReason, void 0, externalEditCorrelation, "reattribute");
      const startFocusTime = this._userAttentionService.totalFocusTimeMs;
      const startTime = Date.now();
      reader.store.add(toDisposable(() => {
        t.stopTracking();
        this._sendTelemetryAndLog("10minFocusWindow", "time", t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
      }));
      return t;
    }).recomputeInitiallyAndOnChange(this._store);
    const focusResetSignal = observableSignal("focusResetSignal");
    this.windowedFocusTracker = derived((reader) => {
      if (!this._statsEnabled.read(reader)) {
        return void 0;
      }
      if (!this._doc.isVisible.read(reader)) {
        return void 0;
      }
      focusResetSignal.read(reader);
      reader.store.add(this._userAttentionService.fireAfterGivenFocusTimePassed(20 * 60 * 1e3, () => {
        focusResetSignal.trigger(void 0);
      }));
      const t = new DocumentEditSourceTracker(docWithJustReason, void 0, externalEditCorrelation, "reattribute");
      const startFocusTime = this._userAttentionService.totalFocusTimeMs;
      const startTime = Date.now();
      reader.store.add(toDisposable(() => {
        t.stopTracking();
        this._sendTelemetryAndLog("20minFocusWindow", "time", t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
      }));
      return t;
    }).recomputeInitiallyAndOnChange(this._store);
  }
  _sendTelemetryAndLog(mode, trigger, tracker, focusTime, actualTime) {
    void this.sendTelemetry(mode, trigger, tracker, focusTime, actualTime).catch((error) => {
      this._logService.error(`[EditSourceTrackingImpl] Failed to send ${mode} edit telemetry: ${error}`);
    }).finally(() => {
      tracker.releaseExternalEditCorrelations();
      tracker.dispose();
    });
  }
  async sendTelemetry(mode, trigger, t, focusTime, actualTime) {
    if (mode !== "longterm") {
      await t.waitForExternalEditCorrelations(FOCUS_CORRELATION_DRAIN_TIMEOUT);
    }
    t.applyPendingExternalEdits();
    let ranges = t.getTrackedRanges();
    let internalKeys = t.getAllKeys();
    let data = this.getTelemetryData(ranges);
    const statsUuid = this._randomService.generateUuid();
    let preparedAgentFlush;
    let deferSuppressedExternal = false;
    const isDirty = this._textFileService.isDirty(this._doc.document.uri);
    if (mode === "longterm" && this._agentHostEditMarkerService) {
      try {
        preparedAgentFlush = await this._agentHostEditMarkerService.prepareFlush(
          this._doc.document.uri,
          trigger,
          statsUuid,
          isDirty,
          this._doc.document.languageId.get()
        );
      } catch (error) {
        this._logService.error(`[EditSourceTrackingImpl] Failed to prepare Agent Host edit attribution: ${error}`);
        deferSuppressedExternal = error instanceof AgentHostEditAttributionDeferredError || error instanceof AgentHostEditAttributionUnknownOutcomeError;
      }
    }
    if (preparedAgentFlush) {
      t.applyPendingExternalEdits();
      ranges = t.getTrackedRanges();
      internalKeys = t.getAllKeys();
      data = this.getTelemetryData(ranges);
      try {
        await preparedAgentFlush.commit(data.totalModifiedCharactersInFinalState + preparedAgentFlush.agentModifiedCount);
      } catch (error) {
        this._logService.error(`[EditSourceTrackingImpl] Failed to commit Agent Host edit attribution: ${error}`);
        if (!(error instanceof AgentHostEditAttributionUnknownOutcomeError)) {
          preparedAgentFlush = void 0;
        }
        deferSuppressedExternal = error instanceof AgentHostEditAttributionDeferredError || error instanceof AgentHostEditAttributionUnknownOutcomeError;
      }
    }
    const includeSuppressedExternal = !preparedAgentFlush && !deferSuppressedExternal && !isDirty && mode === "longterm" && !!this._agentHostEditMarkerService;
    if (includeSuppressedExternal) {
      ranges = t.getTrackedRanges(void 0, true);
      internalKeys = t.getAllKeys(true);
      data = this.getTelemetryData(ranges);
    }
    const coverageGap = mode === "longterm" && !isDirty && !deferSuppressedExternal && !preparedAgentFlush?.deferCoverageGap ? this._agentHostEditMarkerService?.takeCoverageGap?.(this._doc.document.uri, preparedAgentFlush?.coverageGapThroughSequence ?? preparedAgentFlush?.lastSequence) : void 0;
    const agentModifiedCount = mode === "longterm" ? preparedAgentFlush?.agentModifiedCount ?? 0 : data.agentHostModifiedCount;
    if (internalKeys.length === 0 && agentModifiedCount === 0 && !coverageGap) {
      return;
    }
    const totalModifiedCount = data.totalModifiedCharactersInFinalState + (preparedAgentFlush?.agentModifiedCount ?? 0);
    const telemetryKeys = /* @__PURE__ */ new Map();
    for (const internalKey of internalKeys) {
      const representative = t.getRepresentative(internalKey);
      const telemetryKey = representative.toKey(1);
      const entry = telemetryKeys.get(telemetryKey) ?? {
        representative,
        modifiedCount: 0,
        deltaModifiedCount: 0
      };
      entry.deltaModifiedCount += t.getTotalInsertedCharactersCount(internalKey, includeSuppressedExternal);
      telemetryKeys.set(telemetryKey, entry);
    }
    for (const range of ranges) {
      const representative = t.getRepresentative(range.sourceKey);
      const entry = telemetryKeys.get(representative.toKey(1));
      if (entry) {
        entry.modifiedCount += range.range.length;
      }
    }
    const sums = Object.fromEntries(Array.from(telemetryKeys, ([key, value]) => [key, value.modifiedCount]));
    const entries = Object.entries(sums).filter((entry) => entry[1] !== void 0).sort(reverseOrder(compareBy(([, value]) => value, numberComparator))).slice(0, mode === "longterm" ? 30 : 10);
    for (const [key, value] of entries) {
      const telemetryEntry = telemetryKeys.get(key);
      const repr = telemetryEntry.representative;
      const deltaModifiedCount = telemetryEntry.deltaModifiedCount;
      sendEditSourcesDetailsTelemetry(this._telemetryService, {
        mode,
        sourceKey: key,
        sourceKeyCleaned: repr.toKey(1, { $extensionId: false, $extensionVersion: false, $modelId: false }),
        extensionId: repr.props.$extensionId,
        extensionVersion: repr.props.$extensionVersion,
        modelId: repr.props.$modelId,
        trigger,
        languageId: this._doc.document.languageId.get(),
        statsUuid,
        conversationId: repr.props.$$sessionId,
        requestId: repr.props.$$requestId,
        origin: repr.props.$origin,
        harness: repr.props.$harness,
        modifiedCount: value,
        deltaModifiedCount,
        totalModifiedCount
      });
    }
    const isTrackedByGit = await data.isTrackedByGit;
    sendEditSourcesStatsTelemetry(this._telemetryService, {
      attributionSchemaVersion: 2,
      mode,
      languageId: this._doc.document.languageId.get(),
      statsUuid,
      nesModifiedCount: data.nesModifiedCount,
      inlineCompletionsCopilotModifiedCount: data.inlineCompletionsCopilotModifiedCount,
      inlineCompletionsNESModifiedCount: data.inlineCompletionsNESModifiedCount,
      otherAIModifiedCount: data.otherAIModifiedCount,
      agentHostModifiedCount: agentModifiedCount,
      unknownModifiedCount: data.unknownModifiedCount,
      userModifiedCount: data.userModifiedCount,
      ideModifiedCount: data.ideModifiedCount,
      totalModifiedCharacters: totalModifiedCount,
      externalModifiedCount: data.externalModifiedCount,
      isTrackedByGit: isTrackedByGit ? 1 : 0,
      focusTime,
      actualTime,
      trigger,
      ...mode === "longterm" ? {
        agentHostAttributionCoverage: coverageGap ? "partial" : "complete",
        agentHostUntrackedEditCount: coverageGap?.editCount ?? 0,
        agentHostUntrackedInsertedCount: coverageGap?.insertedCount ?? 0
      } : {}
    });
  }
  getTelemetryData(ranges) {
    const sums = sumByCategory(ranges, (r) => r.range.length, (r) => getEditTelemetryCategory(r.source));
    const totalModifiedCharactersInFinalState = sumBy(ranges, (r) => r.range.length);
    return {
      nesModifiedCount: sums.nes ?? 0,
      inlineCompletionsCopilotModifiedCount: sums.inlineCompletionsCopilot ?? 0,
      inlineCompletionsNESModifiedCount: sums.inlineCompletionsNES ?? 0,
      otherAIModifiedCount: sums.otherAI ?? 0,
      agentHostModifiedCount: sums.agentHost ?? 0,
      userModifiedCount: sums.user ?? 0,
      ideModifiedCount: sums.ide ?? 0,
      unknownModifiedCount: sums.unknown ?? 0,
      externalModifiedCount: sums.external ?? 0,
      totalModifiedCharactersInFinalState,
      languageId: this._doc.document.languageId.get(),
      isTrackedByGit: this._repo.get()?.isIgnored(this._doc.document.uri)
    };
  }
};
TrackedDocumentInfo = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, IRandomService),
  __decorateParam(7, IUserAttentionService),
  __decorateParam(8, ITextFileService),
  __decorateParam(9, ILogService)
], TrackedDocumentInfo);
export {
  EditSourceTrackingImpl,
  getEditTelemetryCategory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRUZWxlbWV0cnlcXGJyb3dzZXJcXHRlbGVtZXRyeVxcZWRpdFNvdXJjZVRyYWNraW5nSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJldmVyc2VPcmRlciwgY29tcGFyZUJ5LCBudW1iZXJDb21wYXJhdG9yLCBzdW1CeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJbnRlcnZhbFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlLCBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1hcE9ic2VydmFibGVBcnJheUNhY2hlZCwgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVTaWduYWwsIHJ1bk9uQ2hhbmdlLCBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRUZWxlbWV0cnlNb2RlLCBFZGl0VGVsZW1ldHJ5VHJpZ2dlciwgc2VuZEVkaXRTb3VyY2VzRGV0YWlsc1RlbGVtZXRyeSwgc2VuZEVkaXRTb3VyY2VzU3RhdHNUZWxlbWV0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL2VkaXRUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxFZGl0U291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcbmltcG9ydCB7IElVc2VyQXR0ZW50aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJBdHRlbnRpb24vY29tbW9uL3VzZXJBdHRlbnRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQW5ub3RhdGVkRG9jdW1lbnQsIElBbm5vdGF0ZWREb2N1bWVudHMgfSBmcm9tICcuLi9oZWxwZXJzL2Fubm90YXRlZERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBDcmVhdGVTdWdnZXN0aW9uSWRGb3JDaGF0T3JJbmxpbmVDaGF0Q2FsbGVyLCBFZGl0VGVsZW1ldHJ5UmVwb3J0RWRpdEFyY0ZvckNoYXRPcklubGluZUNoYXRTZW5kZXIsIEVkaXRUZWxlbWV0cnlSZXBvcnRJbmxpbmVFZGl0QXJjU2VuZGVyIH0gZnJvbSAnLi9hcmNUZWxlbWV0cnlTZW5kZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlRG9jV2l0aEp1c3RSZWFzb24sIEVkaXRTb3VyY2UgfSBmcm9tICcuLi9oZWxwZXJzL2RvY3VtZW50V2l0aEFubm90YXRlZEVkaXRzLmpzJztcbmltcG9ydCB7IERvY3VtZW50RWRpdFNvdXJjZVRyYWNrZXIsIFRyYWNrZWRFZGl0IH0gZnJvbSAnLi9lZGl0VHJhY2tlci5qcyc7XG5pbXBvcnQgeyBzdW1CeUNhdGVnb3J5IH0gZnJvbSAnLi4vaGVscGVycy91dGlscy5qcyc7XG5pbXBvcnQgeyBJU2NtUmVwb0FkYXB0ZXIsIFNjbUFkYXB0ZXIgfSBmcm9tICcuL3NjbUFkYXB0ZXIuanMnO1xuaW1wb3J0IHsgSVJhbmRvbVNlcnZpY2UgfSBmcm9tICcuLi9yYW5kb21TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkRlZmVycmVkRXJyb3IsIEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvblVua25vd25PdXRjb21lRXJyb3IsIElBZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZSwgSVByZXBhcmVkQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRmx1c2ggfSBmcm9tICcuL2FnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlLmpzJztcblxuY29uc3QgRk9DVVNfQ09SUkVMQVRJT05fRFJBSU5fVElNRU9VVCA9IDFfMDAwO1xuXG5leHBvcnQgdHlwZSBFZGl0VGVsZW1ldHJ5Q2F0ZWdvcnkgPSAnbmVzJyB8ICdpbmxpbmVDb21wbGV0aW9uc0NvcGlsb3QnIHwgJ2lubGluZUNvbXBsZXRpb25zTkVTJyB8ICdpbmxpbmVDb21wbGV0aW9uc090aGVyJyB8ICdvdGhlckFJJyB8ICdhZ2VudEhvc3QnIHwgJ3VzZXInIHwgJ2lkZScgfCAnZXh0ZXJuYWwnIHwgJ3Vua25vd24nO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWRpdFRlbGVtZXRyeUNhdGVnb3J5KHNvdXJjZTogRWRpdFNvdXJjZSk6IEVkaXRUZWxlbWV0cnlDYXRlZ29yeSB7XG5cdGlmIChzb3VyY2UuY2F0ZWdvcnkgPT09ICdhaScgJiYgc291cmNlLmtpbmQgPT09ICduZXMnKSB7IHJldHVybiAnbmVzJzsgfVxuXG5cdGlmIChzb3VyY2UuY2F0ZWdvcnkgPT09ICdhaScgJiYgc291cmNlLmtpbmQgPT09ICdjb21wbGV0aW9uJyAmJiBzb3VyY2UuZXh0ZW5zaW9uSWQgPT09ICdnaXRodWIuY29waWxvdCcpIHsgcmV0dXJuICdpbmxpbmVDb21wbGV0aW9uc0NvcGlsb3QnOyB9XG5cdGlmIChzb3VyY2UuY2F0ZWdvcnkgPT09ICdhaScgJiYgc291cmNlLmtpbmQgPT09ICdjb21wbGV0aW9uJyAmJiBzb3VyY2UuZXh0ZW5zaW9uSWQgPT09ICdnaXRodWIuY29waWxvdC1jaGF0JyAmJiBzb3VyY2UucHJvdmlkZXJJZCA9PT0gJ25lcycpIHsgcmV0dXJuICdpbmxpbmVDb21wbGV0aW9uc05FUyc7IH1cblx0aWYgKHNvdXJjZS5jYXRlZ29yeSA9PT0gJ2FpJyAmJiBzb3VyY2Uua2luZCA9PT0gJ2NvbXBsZXRpb24nICYmIHNvdXJjZS5leHRlbnNpb25JZCA9PT0gJ2dpdGh1Yi5jb3BpbG90LWNoYXQnICYmIHNvdXJjZS5wcm92aWRlcklkID09PSAnY29tcGxldGlvbnMnKSB7IHJldHVybiAnaW5saW5lQ29tcGxldGlvbnNDb3BpbG90JzsgfVxuXHRpZiAoc291cmNlLmNhdGVnb3J5ID09PSAnYWknICYmIHNvdXJjZS5raW5kID09PSAnY29tcGxldGlvbicpIHsgcmV0dXJuICdpbmxpbmVDb21wbGV0aW9uc090aGVyJzsgfVxuXG5cdGlmIChzb3VyY2UuY2F0ZWdvcnkgPT09ICdhaScpIHsgcmV0dXJuICdvdGhlckFJJzsgfVxuXHRpZiAoc291cmNlLmNhdGVnb3J5ID09PSAnYWdlbnRIb3N0JykgeyByZXR1cm4gJ2FnZW50SG9zdCc7IH1cblx0aWYgKHNvdXJjZS5jYXRlZ29yeSA9PT0gJ3VzZXInKSB7IHJldHVybiAndXNlcic7IH1cblx0aWYgKHNvdXJjZS5jYXRlZ29yeSA9PT0gJ2lkZScpIHsgcmV0dXJuICdpZGUnOyB9XG5cdGlmIChzb3VyY2UuY2F0ZWdvcnkgPT09ICdleHRlcm5hbCcpIHsgcmV0dXJuICdleHRlcm5hbCc7IH1cblx0cmV0dXJuICd1bmtub3duJztcbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRTb3VyY2VUcmFja2luZ0ltcGwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHJlYWRvbmx5IGRvY3NTdGF0ZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGVzO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRzRW5hYmxlZDogSU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYW5ub3RhdGVkRG9jdW1lbnRzOiBJQW5ub3RhdGVkRG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgc2NtQnJpZGdlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2NtQWRhcHRlcik7XG5cdFx0dGhpcy5fc3RhdGVzID0gbWFwT2JzZXJ2YWJsZUFycmF5Q2FjaGVkKHRoaXMsIHRoaXMuX2Fubm90YXRlZERvY3VtZW50cy5kb2N1bWVudHMsIChkb2MsIHN0b3JlKSA9PiB7XG5cdFx0XHRyZXR1cm4gW2RvYy5kb2N1bWVudCwgc3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyYWNrZWREb2N1bWVudEluZm8sIGRvYywgc2NtQnJpZGdlLCB0aGlzLl9zdGF0c0VuYWJsZWQsIHRoaXMuX2FnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlKSldIGFzIGNvbnN0O1xuXHRcdH0pO1xuXHRcdHRoaXMuZG9jc1N0YXRlID0gdGhpcy5fc3RhdGVzLm1hcCgoZW50cmllcykgPT4gbmV3IE1hcChlbnRyaWVzKSk7XG5cblx0XHR0aGlzLmRvY3NTdGF0ZS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cdH1cbn1cblxuY2xhc3MgVHJhY2tlZERvY3VtZW50SW5mbyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgbG9uZ3Rlcm1UcmFja2VyOiBJT2JzZXJ2YWJsZTxEb2N1bWVudEVkaXRTb3VyY2VUcmFja2VyPHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ+O1xuXHRwdWJsaWMgcmVhZG9ubHkgd2luZG93ZWRUcmFja2VyOiBJT2JzZXJ2YWJsZTxEb2N1bWVudEVkaXRTb3VyY2VUcmFja2VyPHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ+O1xuXHRwdWJsaWMgcmVhZG9ubHkgd2luZG93ZWRGb2N1c1RyYWNrZXI6IElPYnNlcnZhYmxlPERvY3VtZW50RWRpdFNvdXJjZVRyYWNrZXI8dW5kZWZpbmVkPiB8IHVuZGVmaW5lZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVwbzogSU9ic2VydmFibGU8SVNjbVJlcG9BZGFwdGVyIHwgdW5kZWZpbmVkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2M6IEFubm90YXRlZERvY3VtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NjbTogU2NtQWRhcHRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0c0VuYWJsZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVJhbmRvbVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmFuZG9tU2VydmljZTogSVJhbmRvbVNlcnZpY2UsXG5cdFx0QElVc2VyQXR0ZW50aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91c2VyQXR0ZW50aW9uU2VydmljZTogSVVzZXJBdHRlbnRpb25TZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZXBvID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fc2NtLmdldFJlcG8oX2RvYy5kb2N1bWVudC51cmksIHJlYWRlcikpO1xuXG5cdFx0Y29uc3QgZG9jV2l0aEp1c3RSZWFzb24gPSBjcmVhdGVEb2NXaXRoSnVzdFJlYXNvbihfZG9jLmRvY3VtZW50V2l0aEFubm90YXRpb25zLCB0aGlzLl9zdG9yZSk7XG5cdFx0Y29uc3QgZXh0ZXJuYWxFZGl0Q29ycmVsYXRpb24gPSB0aGlzLl9hZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZT8uY3JlYXRlQ29ycmVsYXRpb24oX2RvYy5kb2N1bWVudC51cmkpO1xuXG5cdFx0Y29uc3QgbG9uZ3Rlcm1SZXNldFNpZ25hbCA9IG9ic2VydmFibGVTaWduYWwoJ3Jlc2V0U2lnbmFsJyk7XG5cblx0XHRsZXQgbG9uZ3Rlcm1SZWFzb246IEVkaXRUZWxlbWV0cnlUcmlnZ2VyID0gJ2Nsb3NlZCc7XG5cdFx0dGhpcy5sb25ndGVybVRyYWNrZXIgPSBkZXJpdmVkKChyZWFkZXIpID0+IHtcblx0XHRcdGlmICghdGhpcy5fc3RhdHNFbmFibGVkLnJlYWQocmVhZGVyKSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRsb25ndGVybVJlc2V0U2lnbmFsLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgdCA9IG5ldyBEb2N1bWVudEVkaXRTb3VyY2VUcmFja2VyKGRvY1dpdGhKdXN0UmVhc29uLCB1bmRlZmluZWQsIGV4dGVybmFsRWRpdENvcnJlbGF0aW9uKTtcblx0XHRcdGNvbnN0IHN0YXJ0Rm9jdXNUaW1lID0gdGhpcy5fdXNlckF0dGVudGlvblNlcnZpY2UudG90YWxGb2N1c1RpbWVNcztcblx0XHRcdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdC8vIHNlbmQgbG9uZyB0ZXJtIGRvY3VtZW50IHRlbGVtZXRyeVxuXHRcdFx0XHR0LnN0b3BUcmFja2luZygpO1xuXHRcdFx0XHR0aGlzLl9zZW5kVGVsZW1ldHJ5QW5kTG9nKCdsb25ndGVybScsIGxvbmd0ZXJtUmVhc29uLCB0LCB0aGlzLl91c2VyQXR0ZW50aW9uU2VydmljZS50b3RhbEZvY3VzVGltZU1zIC0gc3RhcnRGb2N1c1RpbWUsIERhdGUubm93KCkgLSBzdGFydFRpbWUpO1xuXHRcdFx0fSkpO1xuXHRcdFx0cmV0dXJuIHQ7XG5cdFx0fSkucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKG5ldyBJbnRlcnZhbFRpbWVyKCkpLmNhbmNlbEFuZFNldCgoKSA9PiB7XG5cdFx0XHQvLyBSZXNldCBhZnRlciAxMCBob3Vyc1xuXHRcdFx0bG9uZ3Rlcm1SZWFzb24gPSAnMTBob3Vycyc7XG5cdFx0XHRsb25ndGVybVJlc2V0U2lnbmFsLnRyaWdnZXIodW5kZWZpbmVkKTtcblx0XHRcdGxvbmd0ZXJtUmVhc29uID0gJ2Nsb3NlZCc7XG5cdFx0fSwgMTAgKiA2MCAqIDYwICogMTAwMCk7XG5cblx0XHQvLyBSZXNldCBvbiBicmFuY2ggY2hhbmdlIG9yIGNvbW1pdFxuXHRcdHRoaXMuX3N0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCByZXBvID0gdGhpcy5fcmVwby5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAocmVwbykge1xuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJ1bk9uQ2hhbmdlKHJlcG8uaGVhZENvbW1pdEhhc2hPYnMsICgpID0+IHtcblx0XHRcdFx0XHRsb25ndGVybVJlYXNvbiA9ICdoYXNoQ2hhbmdlJztcblx0XHRcdFx0XHRsb25ndGVybVJlc2V0U2lnbmFsLnRyaWdnZXIodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRsb25ndGVybVJlYXNvbiA9ICdjbG9zZWQnO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQocnVuT25DaGFuZ2UocmVwby5oZWFkQnJhbmNoTmFtZU9icywgKCkgPT4ge1xuXHRcdFx0XHRcdGxvbmd0ZXJtUmVhc29uID0gJ2JyYW5jaENoYW5nZSc7XG5cdFx0XHRcdFx0bG9uZ3Rlcm1SZXNldFNpZ25hbC50cmlnZ2VyKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0bG9uZ3Rlcm1SZWFzb24gPSAnY2xvc2VkJztcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0VGVsZW1ldHJ5UmVwb3J0SW5saW5lRWRpdEFyY1NlbmRlciwgX2RvYy5kb2N1bWVudFdpdGhBbm5vdGF0aW9ucywgdGhpcy5fcmVwbykpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0VGVsZW1ldHJ5UmVwb3J0RWRpdEFyY0ZvckNoYXRPcklubGluZUNoYXRTZW5kZXIsIF9kb2MuZG9jdW1lbnRXaXRoQW5ub3RhdGlvbnMsIHRoaXMuX3JlcG8pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ3JlYXRlU3VnZ2VzdGlvbklkRm9yQ2hhdE9ySW5saW5lQ2hhdENhbGxlciwgX2RvYy5kb2N1bWVudFdpdGhBbm5vdGF0aW9ucykpO1xuXG5cdFx0Ly8gRm9jdXMgdGltZSBiYXNlZCAxMC1taW51dGUgd2luZG93IHRyYWNrZXJcblx0XHRjb25zdCByZXNldFNpZ25hbCA9IG9ic2VydmFibGVTaWduYWwoJ3Jlc2V0U2lnbmFsJyk7XG5cblx0XHR0aGlzLndpbmRvd2VkVHJhY2tlciA9IGRlcml2ZWQoKHJlYWRlcikgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9zdGF0c0VuYWJsZWQucmVhZChyZWFkZXIpKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdFx0aWYgKCF0aGlzLl9kb2MuaXNWaXNpYmxlLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmVzZXRTaWduYWwucmVhZChyZWFkZXIpO1xuXG5cdFx0XHQvLyBSZXNldCBhZnRlciAxMCBtaW51dGVzIG9mIGFjY3VtdWxhdGVkIGZvY3VzIHRpbWVcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQodGhpcy5fdXNlckF0dGVudGlvblNlcnZpY2UuZmlyZUFmdGVyR2l2ZW5Gb2N1c1RpbWVQYXNzZWQoMTAgKiA2MCAqIDEwMDAsICgpID0+IHtcblx0XHRcdFx0cmVzZXRTaWduYWwudHJpZ2dlcih1bmRlZmluZWQpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCB0ID0gbmV3IERvY3VtZW50RWRpdFNvdXJjZVRyYWNrZXIoZG9jV2l0aEp1c3RSZWFzb24sIHVuZGVmaW5lZCwgZXh0ZXJuYWxFZGl0Q29ycmVsYXRpb24sICdyZWF0dHJpYnV0ZScpO1xuXHRcdFx0Y29uc3Qgc3RhcnRGb2N1c1RpbWUgPSB0aGlzLl91c2VyQXR0ZW50aW9uU2VydmljZS50b3RhbEZvY3VzVGltZU1zO1xuXHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0Ly8gc2VuZCB3aW5kb3dlZCBkb2N1bWVudCB0ZWxlbWV0cnlcblx0XHRcdFx0dC5zdG9wVHJhY2tpbmcoKTtcblx0XHRcdFx0dGhpcy5fc2VuZFRlbGVtZXRyeUFuZExvZygnMTBtaW5Gb2N1c1dpbmRvdycsICd0aW1lJywgdCwgdGhpcy5fdXNlckF0dGVudGlvblNlcnZpY2UudG90YWxGb2N1c1RpbWVNcyAtIHN0YXJ0Rm9jdXNUaW1lLCBEYXRlLm5vdygpIC0gc3RhcnRUaW1lKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cmV0dXJuIHQ7XG5cdFx0fSkucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXG5cdFx0Ly8gRm9jdXMgdGltZSBiYXNlZCAyMC1taW51dGUgd2luZG93IHRyYWNrZXJcblx0XHRjb25zdCBmb2N1c1Jlc2V0U2lnbmFsID0gb2JzZXJ2YWJsZVNpZ25hbCgnZm9jdXNSZXNldFNpZ25hbCcpO1xuXG5cdFx0dGhpcy53aW5kb3dlZEZvY3VzVHJhY2tlciA9IGRlcml2ZWQoKHJlYWRlcikgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9zdGF0c0VuYWJsZWQucmVhZChyZWFkZXIpKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdFx0aWYgKCF0aGlzLl9kb2MuaXNWaXNpYmxlLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Zm9jdXNSZXNldFNpZ25hbC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdC8vIFJlc2V0IGFmdGVyIDIwIG1pbnV0ZXMgb2YgYWNjdW11bGF0ZWQgZm9jdXMgdGltZVxuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZCh0aGlzLl91c2VyQXR0ZW50aW9uU2VydmljZS5maXJlQWZ0ZXJHaXZlbkZvY3VzVGltZVBhc3NlZCgyMCAqIDYwICogMTAwMCwgKCkgPT4ge1xuXHRcdFx0XHRmb2N1c1Jlc2V0U2lnbmFsLnRyaWdnZXIodW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgdCA9IG5ldyBEb2N1bWVudEVkaXRTb3VyY2VUcmFja2VyKGRvY1dpdGhKdXN0UmVhc29uLCB1bmRlZmluZWQsIGV4dGVybmFsRWRpdENvcnJlbGF0aW9uLCAncmVhdHRyaWJ1dGUnKTtcblx0XHRcdGNvbnN0IHN0YXJ0Rm9jdXNUaW1lID0gdGhpcy5fdXNlckF0dGVudGlvblNlcnZpY2UudG90YWxGb2N1c1RpbWVNcztcblx0XHRcdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdC8vIHNlbmQgZm9jdXMtd2luZG93ZWQgZG9jdW1lbnQgdGVsZW1ldHJ5XG5cdFx0XHRcdHQuc3RvcFRyYWNraW5nKCk7XG5cdFx0XHRcdHRoaXMuX3NlbmRUZWxlbWV0cnlBbmRMb2coJzIwbWluRm9jdXNXaW5kb3cnLCAndGltZScsIHQsIHRoaXMuX3VzZXJBdHRlbnRpb25TZXJ2aWNlLnRvdGFsRm9jdXNUaW1lTXMgLSBzdGFydEZvY3VzVGltZSwgRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHJldHVybiB0O1xuXHRcdH0pLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZFRlbGVtZXRyeUFuZExvZyhtb2RlOiBFZGl0VGVsZW1ldHJ5TW9kZSwgdHJpZ2dlcjogRWRpdFRlbGVtZXRyeVRyaWdnZXIsIHRyYWNrZXI6IERvY3VtZW50RWRpdFNvdXJjZVRyYWNrZXIsIGZvY3VzVGltZTogbnVtYmVyLCBhY3R1YWxUaW1lOiBudW1iZXIpOiB2b2lkIHtcblx0XHR2b2lkIHRoaXMuc2VuZFRlbGVtZXRyeShtb2RlLCB0cmlnZ2VyLCB0cmFja2VyLCBmb2N1c1RpbWUsIGFjdHVhbFRpbWUpLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtFZGl0U291cmNlVHJhY2tpbmdJbXBsXSBGYWlsZWQgdG8gc2VuZCAke21vZGV9IGVkaXQgdGVsZW1ldHJ5OiAke2Vycm9yfWApO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0dHJhY2tlci5yZWxlYXNlRXh0ZXJuYWxFZGl0Q29ycmVsYXRpb25zKCk7XG5cdFx0XHR0cmFja2VyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHNlbmRUZWxlbWV0cnkobW9kZTogRWRpdFRlbGVtZXRyeU1vZGUsIHRyaWdnZXI6IEVkaXRUZWxlbWV0cnlUcmlnZ2VyLCB0OiBEb2N1bWVudEVkaXRTb3VyY2VUcmFja2VyLCBmb2N1c1RpbWU6IG51bWJlciwgYWN0dWFsVGltZTogbnVtYmVyKSB7XG5cdFx0aWYgKG1vZGUgIT09ICdsb25ndGVybScpIHtcblx0XHRcdGF3YWl0IHQud2FpdEZvckV4dGVybmFsRWRpdENvcnJlbGF0aW9ucyhGT0NVU19DT1JSRUxBVElPTl9EUkFJTl9USU1FT1VUKTtcblx0XHR9XG5cdFx0dC5hcHBseVBlbmRpbmdFeHRlcm5hbEVkaXRzKCk7XG5cdFx0bGV0IHJhbmdlcyA9IHQuZ2V0VHJhY2tlZFJhbmdlcygpO1xuXHRcdGxldCBpbnRlcm5hbEtleXMgPSB0LmdldEFsbEtleXMoKTtcblx0XHRsZXQgZGF0YSA9IHRoaXMuZ2V0VGVsZW1ldHJ5RGF0YShyYW5nZXMpO1xuXHRcdGNvbnN0IHN0YXRzVXVpZCA9IHRoaXMuX3JhbmRvbVNlcnZpY2UuZ2VuZXJhdGVVdWlkKCk7XG5cdFx0bGV0IHByZXBhcmVkQWdlbnRGbHVzaDogSVByZXBhcmVkQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRmx1c2ggfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRlZmVyU3VwcHJlc3NlZEV4dGVybmFsID0gZmFsc2U7XG5cdFx0Y29uc3QgaXNEaXJ0eSA9IHRoaXMuX3RleHRGaWxlU2VydmljZS5pc0RpcnR5KHRoaXMuX2RvYy5kb2N1bWVudC51cmkpO1xuXHRcdGlmIChtb2RlID09PSAnbG9uZ3Rlcm0nICYmIHRoaXMuX2FnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwcmVwYXJlZEFnZW50Rmx1c2ggPSBhd2FpdCB0aGlzLl9hZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZS5wcmVwYXJlRmx1c2goXG5cdFx0XHRcdFx0dGhpcy5fZG9jLmRvY3VtZW50LnVyaSxcblx0XHRcdFx0XHR0cmlnZ2VyLFxuXHRcdFx0XHRcdHN0YXRzVXVpZCxcblx0XHRcdFx0XHRpc0RpcnR5LFxuXHRcdFx0XHRcdHRoaXMuX2RvYy5kb2N1bWVudC5sYW5ndWFnZUlkLmdldCgpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0VkaXRTb3VyY2VUcmFja2luZ0ltcGxdIEZhaWxlZCB0byBwcmVwYXJlIEFnZW50IEhvc3QgZWRpdCBhdHRyaWJ1dGlvbjogJHtlcnJvcn1gKTtcblx0XHRcdFx0ZGVmZXJTdXBwcmVzc2VkRXh0ZXJuYWwgPSBlcnJvciBpbnN0YW5jZW9mIEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkRlZmVycmVkRXJyb3IgfHwgZXJyb3IgaW5zdGFuY2VvZiBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Vbmtub3duT3V0Y29tZUVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocHJlcGFyZWRBZ2VudEZsdXNoKSB7XG5cdFx0XHR0LmFwcGx5UGVuZGluZ0V4dGVybmFsRWRpdHMoKTtcblx0XHRcdHJhbmdlcyA9IHQuZ2V0VHJhY2tlZFJhbmdlcygpO1xuXHRcdFx0aW50ZXJuYWxLZXlzID0gdC5nZXRBbGxLZXlzKCk7XG5cdFx0XHRkYXRhID0gdGhpcy5nZXRUZWxlbWV0cnlEYXRhKHJhbmdlcyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBwcmVwYXJlZEFnZW50Rmx1c2guY29tbWl0KGRhdGEudG90YWxNb2RpZmllZENoYXJhY3RlcnNJbkZpbmFsU3RhdGUgKyBwcmVwYXJlZEFnZW50Rmx1c2guYWdlbnRNb2RpZmllZENvdW50KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtFZGl0U291cmNlVHJhY2tpbmdJbXBsXSBGYWlsZWQgdG8gY29tbWl0IEFnZW50IEhvc3QgZWRpdCBhdHRyaWJ1dGlvbjogJHtlcnJvcn1gKTtcblx0XHRcdFx0aWYgKCEoZXJyb3IgaW5zdGFuY2VvZiBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Vbmtub3duT3V0Y29tZUVycm9yKSkge1xuXHRcdFx0XHRcdHByZXBhcmVkQWdlbnRGbHVzaCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWZlclN1cHByZXNzZWRFeHRlcm5hbCA9IGVycm9yIGluc3RhbmNlb2YgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRGVmZXJyZWRFcnJvciB8fCBlcnJvciBpbnN0YW5jZW9mIEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvblVua25vd25PdXRjb21lRXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGluY2x1ZGVTdXBwcmVzc2VkRXh0ZXJuYWwgPSAhcHJlcGFyZWRBZ2VudEZsdXNoICYmICFkZWZlclN1cHByZXNzZWRFeHRlcm5hbCAmJiAhaXNEaXJ0eSAmJiBtb2RlID09PSAnbG9uZ3Rlcm0nICYmICEhdGhpcy5fYWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2U7XG5cdFx0aWYgKGluY2x1ZGVTdXBwcmVzc2VkRXh0ZXJuYWwpIHtcblx0XHRcdHJhbmdlcyA9IHQuZ2V0VHJhY2tlZFJhbmdlcyh1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0aW50ZXJuYWxLZXlzID0gdC5nZXRBbGxLZXlzKHRydWUpO1xuXHRcdFx0ZGF0YSA9IHRoaXMuZ2V0VGVsZW1ldHJ5RGF0YShyYW5nZXMpO1xuXHRcdH1cblx0XHRjb25zdCBjb3ZlcmFnZUdhcCA9IG1vZGUgPT09ICdsb25ndGVybScgJiYgIWlzRGlydHkgJiYgIWRlZmVyU3VwcHJlc3NlZEV4dGVybmFsICYmICFwcmVwYXJlZEFnZW50Rmx1c2g/LmRlZmVyQ292ZXJhZ2VHYXBcblx0XHRcdD8gdGhpcy5fYWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2U/LnRha2VDb3ZlcmFnZUdhcD8uKHRoaXMuX2RvYy5kb2N1bWVudC51cmksIHByZXBhcmVkQWdlbnRGbHVzaD8uY292ZXJhZ2VHYXBUaHJvdWdoU2VxdWVuY2UgPz8gcHJlcGFyZWRBZ2VudEZsdXNoPy5sYXN0U2VxdWVuY2UpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhZ2VudE1vZGlmaWVkQ291bnQgPSBtb2RlID09PSAnbG9uZ3Rlcm0nID8gcHJlcGFyZWRBZ2VudEZsdXNoPy5hZ2VudE1vZGlmaWVkQ291bnQgPz8gMCA6IGRhdGEuYWdlbnRIb3N0TW9kaWZpZWRDb3VudDtcblx0XHRpZiAoaW50ZXJuYWxLZXlzLmxlbmd0aCA9PT0gMCAmJiBhZ2VudE1vZGlmaWVkQ291bnQgPT09IDAgJiYgIWNvdmVyYWdlR2FwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRvdGFsTW9kaWZpZWRDb3VudCA9IGRhdGEudG90YWxNb2RpZmllZENoYXJhY3RlcnNJbkZpbmFsU3RhdGUgKyAocHJlcGFyZWRBZ2VudEZsdXNoPy5hZ2VudE1vZGlmaWVkQ291bnQgPz8gMCk7XG5cblx0XHRjb25zdCB0ZWxlbWV0cnlLZXlzID0gbmV3IE1hcDxzdHJpbmcsIHtcblx0XHRcdHJlYWRvbmx5IHJlcHJlc2VudGF0aXZlOiBUZXh0TW9kZWxFZGl0U291cmNlO1xuXHRcdFx0bW9kaWZpZWRDb3VudDogbnVtYmVyO1xuXHRcdFx0ZGVsdGFNb2RpZmllZENvdW50OiBudW1iZXI7XG5cdFx0fT4oKTtcblx0XHRmb3IgKGNvbnN0IGludGVybmFsS2V5IG9mIGludGVybmFsS2V5cykge1xuXHRcdFx0Y29uc3QgcmVwcmVzZW50YXRpdmUgPSB0LmdldFJlcHJlc2VudGF0aXZlKGludGVybmFsS2V5KSE7XG5cdFx0XHRjb25zdCB0ZWxlbWV0cnlLZXkgPSByZXByZXNlbnRhdGl2ZS50b0tleSgxKTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGVsZW1ldHJ5S2V5cy5nZXQodGVsZW1ldHJ5S2V5KSA/PyB7XG5cdFx0XHRcdHJlcHJlc2VudGF0aXZlLFxuXHRcdFx0XHRtb2RpZmllZENvdW50OiAwLFxuXHRcdFx0XHRkZWx0YU1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHR9O1xuXHRcdFx0ZW50cnkuZGVsdGFNb2RpZmllZENvdW50ICs9IHQuZ2V0VG90YWxJbnNlcnRlZENoYXJhY3RlcnNDb3VudChpbnRlcm5hbEtleSwgaW5jbHVkZVN1cHByZXNzZWRFeHRlcm5hbCk7XG5cdFx0XHR0ZWxlbWV0cnlLZXlzLnNldCh0ZWxlbWV0cnlLZXksIGVudHJ5KTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCByYW5nZSBvZiByYW5nZXMpIHtcblx0XHRcdGNvbnN0IHJlcHJlc2VudGF0aXZlID0gdC5nZXRSZXByZXNlbnRhdGl2ZShyYW5nZS5zb3VyY2VLZXkpITtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGVsZW1ldHJ5S2V5cy5nZXQocmVwcmVzZW50YXRpdmUudG9LZXkoMSkpO1xuXHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdGVudHJ5Lm1vZGlmaWVkQ291bnQgKz0gcmFuZ2UucmFuZ2UubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzdW1zID0gT2JqZWN0LmZyb21FbnRyaWVzKEFycmF5LmZyb20odGVsZW1ldHJ5S2V5cywgKFtrZXksIHZhbHVlXSkgPT4gW2tleSwgdmFsdWUubW9kaWZpZWRDb3VudF0pKTtcblx0XHRjb25zdCBlbnRyaWVzID0gT2JqZWN0LmVudHJpZXMoc3Vtcylcblx0XHRcdC5maWx0ZXIoKGVudHJ5KTogZW50cnkgaXMgW3N0cmluZywgbnVtYmVyXSA9PiBlbnRyeVsxXSAhPT0gdW5kZWZpbmVkKVxuXHRcdFx0LnNvcnQocmV2ZXJzZU9yZGVyKGNvbXBhcmVCeSgoWywgdmFsdWVdKSA9PiB2YWx1ZSwgbnVtYmVyQ29tcGFyYXRvcikpKVxuXHRcdFx0LnNsaWNlKDAsIG1vZGUgPT09ICdsb25ndGVybScgPyAzMCA6IDEwKTtcblxuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIGVudHJpZXMpIHtcblx0XHRcdGNvbnN0IHRlbGVtZXRyeUVudHJ5ID0gdGVsZW1ldHJ5S2V5cy5nZXQoa2V5KSE7XG5cdFx0XHRjb25zdCByZXByID0gdGVsZW1ldHJ5RW50cnkucmVwcmVzZW50YXRpdmU7XG5cdFx0XHRjb25zdCBkZWx0YU1vZGlmaWVkQ291bnQgPSB0ZWxlbWV0cnlFbnRyeS5kZWx0YU1vZGlmaWVkQ291bnQ7XG5cblx0XHRcdHNlbmRFZGl0U291cmNlc0RldGFpbHNUZWxlbWV0cnkodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0XHRtb2RlLFxuXHRcdFx0XHRzb3VyY2VLZXk6IGtleSxcblx0XHRcdFx0c291cmNlS2V5Q2xlYW5lZDogcmVwci50b0tleSgxLCB7ICRleHRlbnNpb25JZDogZmFsc2UsICRleHRlbnNpb25WZXJzaW9uOiBmYWxzZSwgJG1vZGVsSWQ6IGZhbHNlIH0pLFxuXHRcdFx0XHRleHRlbnNpb25JZDogcmVwci5wcm9wcy4kZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdGV4dGVuc2lvblZlcnNpb246IHJlcHIucHJvcHMuJGV4dGVuc2lvblZlcnNpb24sXG5cdFx0XHRcdG1vZGVsSWQ6IHJlcHIucHJvcHMuJG1vZGVsSWQsXG5cdFx0XHRcdHRyaWdnZXIsXG5cdFx0XHRcdGxhbmd1YWdlSWQ6IHRoaXMuX2RvYy5kb2N1bWVudC5sYW5ndWFnZUlkLmdldCgpLFxuXHRcdFx0XHRzdGF0c1V1aWQ6IHN0YXRzVXVpZCxcblx0XHRcdFx0Y29udmVyc2F0aW9uSWQ6IHJlcHIucHJvcHMuJCRzZXNzaW9uSWQsXG5cdFx0XHRcdHJlcXVlc3RJZDogcmVwci5wcm9wcy4kJHJlcXVlc3RJZCxcblx0XHRcdFx0b3JpZ2luOiByZXByLnByb3BzLiRvcmlnaW4sXG5cdFx0XHRcdGhhcm5lc3M6IHJlcHIucHJvcHMuJGhhcm5lc3MsXG5cdFx0XHRcdG1vZGlmaWVkQ291bnQ6IHZhbHVlLFxuXHRcdFx0XHRkZWx0YU1vZGlmaWVkQ291bnQ6IGRlbHRhTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0dG90YWxNb2RpZmllZENvdW50LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cblx0XHRjb25zdCBpc1RyYWNrZWRCeUdpdCA9IGF3YWl0IGRhdGEuaXNUcmFja2VkQnlHaXQ7XG5cdFx0c2VuZEVkaXRTb3VyY2VzU3RhdHNUZWxlbWV0cnkodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0YXR0cmlidXRpb25TY2hlbWFWZXJzaW9uOiAyLFxuXHRcdFx0bW9kZSxcblx0XHRcdGxhbmd1YWdlSWQ6IHRoaXMuX2RvYy5kb2N1bWVudC5sYW5ndWFnZUlkLmdldCgpLFxuXHRcdFx0c3RhdHNVdWlkOiBzdGF0c1V1aWQsXG5cdFx0XHRuZXNNb2RpZmllZENvdW50OiBkYXRhLm5lc01vZGlmaWVkQ291bnQsXG5cdFx0XHRpbmxpbmVDb21wbGV0aW9uc0NvcGlsb3RNb2RpZmllZENvdW50OiBkYXRhLmlubGluZUNvbXBsZXRpb25zQ29waWxvdE1vZGlmaWVkQ291bnQsXG5cdFx0XHRpbmxpbmVDb21wbGV0aW9uc05FU01vZGlmaWVkQ291bnQ6IGRhdGEuaW5saW5lQ29tcGxldGlvbnNORVNNb2RpZmllZENvdW50LFxuXHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IGRhdGEub3RoZXJBSU1vZGlmaWVkQ291bnQsXG5cdFx0XHRhZ2VudEhvc3RNb2RpZmllZENvdW50OiBhZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHR1bmtub3duTW9kaWZpZWRDb3VudDogZGF0YS51bmtub3duTW9kaWZpZWRDb3VudCxcblx0XHRcdHVzZXJNb2RpZmllZENvdW50OiBkYXRhLnVzZXJNb2RpZmllZENvdW50LFxuXHRcdFx0aWRlTW9kaWZpZWRDb3VudDogZGF0YS5pZGVNb2RpZmllZENvdW50LFxuXHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IHRvdGFsTW9kaWZpZWRDb3VudCxcblx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogZGF0YS5leHRlcm5hbE1vZGlmaWVkQ291bnQsXG5cdFx0XHRpc1RyYWNrZWRCeUdpdDogaXNUcmFja2VkQnlHaXQgPyAxIDogMCxcblx0XHRcdGZvY3VzVGltZSxcblx0XHRcdGFjdHVhbFRpbWUsXG5cdFx0XHR0cmlnZ2VyLFxuXHRcdFx0Li4uKG1vZGUgPT09ICdsb25ndGVybScgPyB7XG5cdFx0XHRcdGFnZW50SG9zdEF0dHJpYnV0aW9uQ292ZXJhZ2U6IGNvdmVyYWdlR2FwID8gJ3BhcnRpYWwnIGFzIGNvbnN0IDogJ2NvbXBsZXRlJyBhcyBjb25zdCxcblx0XHRcdFx0YWdlbnRIb3N0VW50cmFja2VkRWRpdENvdW50OiBjb3ZlcmFnZUdhcD8uZWRpdENvdW50ID8/IDAsXG5cdFx0XHRcdGFnZW50SG9zdFVudHJhY2tlZEluc2VydGVkQ291bnQ6IGNvdmVyYWdlR2FwPy5pbnNlcnRlZENvdW50ID8/IDAsXG5cdFx0XHR9IDoge30pLFxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0VGVsZW1ldHJ5RGF0YShyYW5nZXM6IHJlYWRvbmx5IFRyYWNrZWRFZGl0W10pIHtcblx0XHRjb25zdCBzdW1zID0gc3VtQnlDYXRlZ29yeShyYW5nZXMsIHIgPT4gci5yYW5nZS5sZW5ndGgsIHIgPT4gZ2V0RWRpdFRlbGVtZXRyeUNhdGVnb3J5KHIuc291cmNlKSk7XG5cdFx0Y29uc3QgdG90YWxNb2RpZmllZENoYXJhY3RlcnNJbkZpbmFsU3RhdGUgPSBzdW1CeShyYW5nZXMsIHIgPT4gci5yYW5nZS5sZW5ndGgpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5lc01vZGlmaWVkQ291bnQ6IHN1bXMubmVzID8/IDAsXG5cdFx0XHRpbmxpbmVDb21wbGV0aW9uc0NvcGlsb3RNb2RpZmllZENvdW50OiBzdW1zLmlubGluZUNvbXBsZXRpb25zQ29waWxvdCA/PyAwLFxuXHRcdFx0aW5saW5lQ29tcGxldGlvbnNORVNNb2RpZmllZENvdW50OiBzdW1zLmlubGluZUNvbXBsZXRpb25zTkVTID8/IDAsXG5cdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogc3Vtcy5vdGhlckFJID8/IDAsXG5cdFx0XHRhZ2VudEhvc3RNb2RpZmllZENvdW50OiBzdW1zLmFnZW50SG9zdCA/PyAwLFxuXHRcdFx0dXNlck1vZGlmaWVkQ291bnQ6IHN1bXMudXNlciA/PyAwLFxuXHRcdFx0aWRlTW9kaWZpZWRDb3VudDogc3Vtcy5pZGUgPz8gMCxcblx0XHRcdHVua25vd25Nb2RpZmllZENvdW50OiBzdW1zLnVua25vd24gPz8gMCxcblx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogc3Vtcy5leHRlcm5hbCA/PyAwLFxuXHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnNJbkZpbmFsU3RhdGUsXG5cdFx0XHRsYW5ndWFnZUlkOiB0aGlzLl9kb2MuZG9jdW1lbnQubGFuZ3VhZ2VJZC5nZXQoKSxcblx0XHRcdGlzVHJhY2tlZEJ5R2l0OiB0aGlzLl9yZXBvLmdldCgpPy5pc0lnbm9yZWQodGhpcy5fZG9jLmRvY3VtZW50LnVyaSksXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGNBQWMsV0FBVyxrQkFBa0IsYUFBYTtBQUNqRSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGNBQWMsa0JBQWtCO0FBQ3pDLFNBQVMsMEJBQTBCLFNBQXNCLGtCQUFrQixhQUFhLGVBQWU7QUFDdkcsU0FBUyw2QkFBNkI7QUFDdEMsU0FBa0QsaUNBQWlDLHFDQUFxQztBQUN4SCxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLDZDQUE2QyxxREFBcUQsOENBQThDO0FBQ3pKLFNBQVMsK0JBQTJDO0FBQ3BELFNBQVMsaUNBQThDO0FBQ3ZELFNBQVMscUJBQXFCO0FBQzlCLFNBQTBCLGtCQUFrQjtBQUM1QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVDQUF1QyxtREFBd0g7QUFFeEssTUFBTSxrQ0FBa0M7QUFJakMsU0FBUyx5QkFBeUIsUUFBMkM7QUFDbkYsTUFBSSxPQUFPLGFBQWEsUUFBUSxPQUFPLFNBQVMsT0FBTztBQUFFLFdBQU87QUFBQSxFQUFPO0FBRXZFLE1BQUksT0FBTyxhQUFhLFFBQVEsT0FBTyxTQUFTLGdCQUFnQixPQUFPLGdCQUFnQixrQkFBa0I7QUFBRSxXQUFPO0FBQUEsRUFBNEI7QUFDOUksTUFBSSxPQUFPLGFBQWEsUUFBUSxPQUFPLFNBQVMsZ0JBQWdCLE9BQU8sZ0JBQWdCLHlCQUF5QixPQUFPLGVBQWUsT0FBTztBQUFFLFdBQU87QUFBQSxFQUF3QjtBQUM5SyxNQUFJLE9BQU8sYUFBYSxRQUFRLE9BQU8sU0FBUyxnQkFBZ0IsT0FBTyxnQkFBZ0IseUJBQXlCLE9BQU8sZUFBZSxlQUFlO0FBQUUsV0FBTztBQUFBLEVBQTRCO0FBQzFMLE1BQUksT0FBTyxhQUFhLFFBQVEsT0FBTyxTQUFTLGNBQWM7QUFBRSxXQUFPO0FBQUEsRUFBMEI7QUFFakcsTUFBSSxPQUFPLGFBQWEsTUFBTTtBQUFFLFdBQU87QUFBQSxFQUFXO0FBQ2xELE1BQUksT0FBTyxhQUFhLGFBQWE7QUFBRSxXQUFPO0FBQUEsRUFBYTtBQUMzRCxNQUFJLE9BQU8sYUFBYSxRQUFRO0FBQUUsV0FBTztBQUFBLEVBQVE7QUFDakQsTUFBSSxPQUFPLGFBQWEsT0FBTztBQUFFLFdBQU87QUFBQSxFQUFPO0FBQy9DLE1BQUksT0FBTyxhQUFhLFlBQVk7QUFBRSxXQUFPO0FBQUEsRUFBWTtBQUN6RCxTQUFPO0FBQ1I7QUFFTyxJQUFNLHlCQUFOLGNBQXFDLFdBQVc7QUFBQSxFQUl0RCxZQUNrQixlQUNBLHFCQUNBLDZCQUN1Qix1QkFDdkM7QUFDRCxVQUFNO0FBTFc7QUFDQTtBQUNBO0FBQ3VCO0FBSXhDLFVBQU0sWUFBWSxLQUFLLHNCQUFzQixlQUFlLFVBQVU7QUFDdEUsU0FBSyxVQUFVLHlCQUF5QixNQUFNLEtBQUssb0JBQW9CLFdBQVcsQ0FBQyxLQUFLLFVBQVU7QUFDakcsYUFBTyxDQUFDLElBQUksVUFBVSxNQUFNLElBQUksS0FBSyxzQkFBc0IsZUFBZSxxQkFBcUIsS0FBSyxXQUFXLEtBQUssZUFBZSxLQUFLLDJCQUEyQixDQUFDLENBQUM7QUFBQSxJQUN0SyxDQUFDO0FBQ0QsU0FBSyxZQUFZLEtBQUssUUFBUSxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksT0FBTyxDQUFDO0FBRS9ELFNBQUssVUFBVSw4QkFBOEIsS0FBSyxNQUFNO0FBQUEsRUFDekQ7QUFDRDtBQXBCYSx5QkFBTjtBQUFBLEVBUUo7QUFBQSxHQVJVO0FBc0JiLElBQU0sc0JBQU4sY0FBa0MsV0FBVztBQUFBLEVBTzVDLFlBQ2tCLE1BQ0EsTUFDQSxlQUNBLDZCQUN1Qix1QkFDSixtQkFDSCxnQkFDTyx1QkFDTCxrQkFDTCxhQUM3QjtBQUNELFVBQU07QUFYVztBQUNBO0FBQ0E7QUFDQTtBQUN1QjtBQUNKO0FBQ0g7QUFDTztBQUNMO0FBQ0w7QUFJOUIsU0FBSyxRQUFRLFFBQVEsTUFBTSxZQUFVLEtBQUssS0FBSyxRQUFRLEtBQUssU0FBUyxLQUFLLE1BQU0sQ0FBQztBQUVqRixVQUFNLG9CQUFvQix3QkFBd0IsS0FBSyx5QkFBeUIsS0FBSyxNQUFNO0FBQzNGLFVBQU0sMEJBQTBCLEtBQUssNkJBQTZCLGtCQUFrQixLQUFLLFNBQVMsR0FBRztBQUVyRyxVQUFNLHNCQUFzQixpQkFBaUIsYUFBYTtBQUUxRCxRQUFJLGlCQUF1QztBQUMzQyxTQUFLLGtCQUFrQixRQUFRLENBQUMsV0FBVztBQUMxQyxVQUFJLENBQUMsS0FBSyxjQUFjLEtBQUssTUFBTSxHQUFHO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFDMUQsMEJBQW9CLEtBQUssTUFBTTtBQUUvQixZQUFNLElBQUksSUFBSSwwQkFBMEIsbUJBQW1CLFFBQVcsdUJBQXVCO0FBQzdGLFlBQU0saUJBQWlCLEtBQUssc0JBQXNCO0FBQ2xELFlBQU0sWUFBWSxLQUFLLElBQUk7QUFDM0IsYUFBTyxNQUFNLElBQUksYUFBYSxNQUFNO0FBRW5DLFVBQUUsYUFBYTtBQUNmLGFBQUsscUJBQXFCLFlBQVksZ0JBQWdCLEdBQUcsS0FBSyxzQkFBc0IsbUJBQW1CLGdCQUFnQixLQUFLLElBQUksSUFBSSxTQUFTO0FBQUEsTUFDOUksQ0FBQyxDQUFDO0FBQ0YsYUFBTztBQUFBLElBQ1IsQ0FBQyxFQUFFLDhCQUE4QixLQUFLLE1BQU07QUFFNUMsU0FBSyxPQUFPLElBQUksSUFBSSxjQUFjLENBQUMsRUFBRSxhQUFhLE1BQU07QUFFdkQsdUJBQWlCO0FBQ2pCLDBCQUFvQixRQUFRLE1BQVM7QUFDckMsdUJBQWlCO0FBQUEsSUFDbEIsR0FBRyxLQUFLLEtBQUssS0FBSyxHQUFJO0FBR3RCLFNBQUssT0FBTyxJQUFJLFFBQVEsWUFBVTtBQUNqQyxZQUFNLE9BQU8sS0FBSyxNQUFNLEtBQUssTUFBTTtBQUNuQyxVQUFJLE1BQU07QUFDVCxlQUFPLE1BQU0sSUFBSSxZQUFZLEtBQUssbUJBQW1CLE1BQU07QUFDMUQsMkJBQWlCO0FBQ2pCLDhCQUFvQixRQUFRLE1BQVM7QUFDckMsMkJBQWlCO0FBQUEsUUFDbEIsQ0FBQyxDQUFDO0FBQ0YsZUFBTyxNQUFNLElBQUksWUFBWSxLQUFLLG1CQUFtQixNQUFNO0FBQzFELDJCQUFpQjtBQUNqQiw4QkFBb0IsUUFBUSxNQUFTO0FBQ3JDLDJCQUFpQjtBQUFBLFFBQ2xCLENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssT0FBTyxJQUFJLEtBQUssc0JBQXNCLGVBQWUsd0NBQXdDLEtBQUsseUJBQXlCLEtBQUssS0FBSyxDQUFDO0FBQzNJLFNBQUssT0FBTyxJQUFJLEtBQUssc0JBQXNCLGVBQWUscURBQXFELEtBQUsseUJBQXlCLEtBQUssS0FBSyxDQUFDO0FBQ3hKLFNBQUssT0FBTyxJQUFJLEtBQUssc0JBQXNCLGVBQWUsNkNBQTZDLEtBQUssdUJBQXVCLENBQUM7QUFHcEksVUFBTSxjQUFjLGlCQUFpQixhQUFhO0FBRWxELFNBQUssa0JBQWtCLFFBQVEsQ0FBQyxXQUFXO0FBQzFDLFVBQUksQ0FBQyxLQUFLLGNBQWMsS0FBSyxNQUFNLEdBQUc7QUFBRSxlQUFPO0FBQUEsTUFBVztBQUUxRCxVQUFJLENBQUMsS0FBSyxLQUFLLFVBQVUsS0FBSyxNQUFNLEdBQUc7QUFDdEMsZUFBTztBQUFBLE1BQ1I7QUFDQSxrQkFBWSxLQUFLLE1BQU07QUFHdkIsYUFBTyxNQUFNLElBQUksS0FBSyxzQkFBc0IsOEJBQThCLEtBQUssS0FBSyxLQUFNLE1BQU07QUFDL0Ysb0JBQVksUUFBUSxNQUFTO0FBQUEsTUFDOUIsQ0FBQyxDQUFDO0FBRUYsWUFBTSxJQUFJLElBQUksMEJBQTBCLG1CQUFtQixRQUFXLHlCQUF5QixhQUFhO0FBQzVHLFlBQU0saUJBQWlCLEtBQUssc0JBQXNCO0FBQ2xELFlBQU0sWUFBWSxLQUFLLElBQUk7QUFDM0IsYUFBTyxNQUFNLElBQUksYUFBYSxNQUFNO0FBRW5DLFVBQUUsYUFBYTtBQUNmLGFBQUsscUJBQXFCLG9CQUFvQixRQUFRLEdBQUcsS0FBSyxzQkFBc0IsbUJBQW1CLGdCQUFnQixLQUFLLElBQUksSUFBSSxTQUFTO0FBQUEsTUFDOUksQ0FBQyxDQUFDO0FBRUYsYUFBTztBQUFBLElBQ1IsQ0FBQyxFQUFFLDhCQUE4QixLQUFLLE1BQU07QUFHNUMsVUFBTSxtQkFBbUIsaUJBQWlCLGtCQUFrQjtBQUU1RCxTQUFLLHVCQUF1QixRQUFRLENBQUMsV0FBVztBQUMvQyxVQUFJLENBQUMsS0FBSyxjQUFjLEtBQUssTUFBTSxHQUFHO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFFMUQsVUFBSSxDQUFDLEtBQUssS0FBSyxVQUFVLEtBQUssTUFBTSxHQUFHO0FBQ3RDLGVBQU87QUFBQSxNQUNSO0FBQ0EsdUJBQWlCLEtBQUssTUFBTTtBQUc1QixhQUFPLE1BQU0sSUFBSSxLQUFLLHNCQUFzQiw4QkFBOEIsS0FBSyxLQUFLLEtBQU0sTUFBTTtBQUMvRix5QkFBaUIsUUFBUSxNQUFTO0FBQUEsTUFDbkMsQ0FBQyxDQUFDO0FBRUYsWUFBTSxJQUFJLElBQUksMEJBQTBCLG1CQUFtQixRQUFXLHlCQUF5QixhQUFhO0FBQzVHLFlBQU0saUJBQWlCLEtBQUssc0JBQXNCO0FBQ2xELFlBQU0sWUFBWSxLQUFLLElBQUk7QUFDM0IsYUFBTyxNQUFNLElBQUksYUFBYSxNQUFNO0FBRW5DLFVBQUUsYUFBYTtBQUNmLGFBQUsscUJBQXFCLG9CQUFvQixRQUFRLEdBQUcsS0FBSyxzQkFBc0IsbUJBQW1CLGdCQUFnQixLQUFLLElBQUksSUFBSSxTQUFTO0FBQUEsTUFDOUksQ0FBQyxDQUFDO0FBRUYsYUFBTztBQUFBLElBQ1IsQ0FBQyxFQUFFLDhCQUE4QixLQUFLLE1BQU07QUFBQSxFQUU3QztBQUFBLEVBRVEscUJBQXFCLE1BQXlCLFNBQStCLFNBQW9DLFdBQW1CLFlBQTBCO0FBQ3JLLFNBQUssS0FBSyxjQUFjLE1BQU0sU0FBUyxTQUFTLFdBQVcsVUFBVSxFQUFFLE1BQU0sV0FBUztBQUNyRixXQUFLLFlBQVksTUFBTSwyQ0FBMkMsSUFBSSxvQkFBb0IsS0FBSyxFQUFFO0FBQUEsSUFDbEcsQ0FBQyxFQUFFLFFBQVEsTUFBTTtBQUNoQixjQUFRLGdDQUFnQztBQUN4QyxjQUFRLFFBQVE7QUFBQSxJQUNqQixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxjQUFjLE1BQXlCLFNBQStCLEdBQThCLFdBQW1CLFlBQW9CO0FBQ2hKLFFBQUksU0FBUyxZQUFZO0FBQ3hCLFlBQU0sRUFBRSxnQ0FBZ0MsK0JBQStCO0FBQUEsSUFDeEU7QUFDQSxNQUFFLDBCQUEwQjtBQUM1QixRQUFJLFNBQVMsRUFBRSxpQkFBaUI7QUFDaEMsUUFBSSxlQUFlLEVBQUUsV0FBVztBQUNoQyxRQUFJLE9BQU8sS0FBSyxpQkFBaUIsTUFBTTtBQUN2QyxVQUFNLFlBQVksS0FBSyxlQUFlLGFBQWE7QUFDbkQsUUFBSTtBQUNKLFFBQUksMEJBQTBCO0FBQzlCLFVBQU0sVUFBVSxLQUFLLGlCQUFpQixRQUFRLEtBQUssS0FBSyxTQUFTLEdBQUc7QUFDcEUsUUFBSSxTQUFTLGNBQWMsS0FBSyw2QkFBNkI7QUFDNUQsVUFBSTtBQUNILDZCQUFxQixNQUFNLEtBQUssNEJBQTRCO0FBQUEsVUFDM0QsS0FBSyxLQUFLLFNBQVM7QUFBQSxVQUNuQjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQSxLQUFLLEtBQUssU0FBUyxXQUFXLElBQUk7QUFBQSxRQUNuQztBQUFBLE1BQ0QsU0FBUyxPQUFPO0FBQ2YsYUFBSyxZQUFZLE1BQU0sMkVBQTJFLEtBQUssRUFBRTtBQUN6RyxrQ0FBMEIsaUJBQWlCLHlDQUF5QyxpQkFBaUI7QUFBQSxNQUN0RztBQUFBLElBQ0Q7QUFDQSxRQUFJLG9CQUFvQjtBQUN2QixRQUFFLDBCQUEwQjtBQUM1QixlQUFTLEVBQUUsaUJBQWlCO0FBQzVCLHFCQUFlLEVBQUUsV0FBVztBQUM1QixhQUFPLEtBQUssaUJBQWlCLE1BQU07QUFDbkMsVUFBSTtBQUNILGNBQU0sbUJBQW1CLE9BQU8sS0FBSyxzQ0FBc0MsbUJBQW1CLGtCQUFrQjtBQUFBLE1BQ2pILFNBQVMsT0FBTztBQUNmLGFBQUssWUFBWSxNQUFNLDBFQUEwRSxLQUFLLEVBQUU7QUFDeEcsWUFBSSxFQUFFLGlCQUFpQiw4Q0FBOEM7QUFDcEUsK0JBQXFCO0FBQUEsUUFDdEI7QUFDQSxrQ0FBMEIsaUJBQWlCLHlDQUF5QyxpQkFBaUI7QUFBQSxNQUN0RztBQUFBLElBQ0Q7QUFDQSxVQUFNLDRCQUE0QixDQUFDLHNCQUFzQixDQUFDLDJCQUEyQixDQUFDLFdBQVcsU0FBUyxjQUFjLENBQUMsQ0FBQyxLQUFLO0FBQy9ILFFBQUksMkJBQTJCO0FBQzlCLGVBQVMsRUFBRSxpQkFBaUIsUUFBVyxJQUFJO0FBQzNDLHFCQUFlLEVBQUUsV0FBVyxJQUFJO0FBQ2hDLGFBQU8sS0FBSyxpQkFBaUIsTUFBTTtBQUFBLElBQ3BDO0FBQ0EsVUFBTSxjQUFjLFNBQVMsY0FBYyxDQUFDLFdBQVcsQ0FBQywyQkFBMkIsQ0FBQyxvQkFBb0IsbUJBQ3JHLEtBQUssNkJBQTZCLGtCQUFrQixLQUFLLEtBQUssU0FBUyxLQUFLLG9CQUFvQiw4QkFBOEIsb0JBQW9CLFlBQVksSUFDOUo7QUFDSCxVQUFNLHFCQUFxQixTQUFTLGFBQWEsb0JBQW9CLHNCQUFzQixJQUFJLEtBQUs7QUFDcEcsUUFBSSxhQUFhLFdBQVcsS0FBSyx1QkFBdUIsS0FBSyxDQUFDLGFBQWE7QUFDMUU7QUFBQSxJQUNEO0FBQ0EsVUFBTSxxQkFBcUIsS0FBSyx1Q0FBdUMsb0JBQW9CLHNCQUFzQjtBQUVqSCxVQUFNLGdCQUFnQixvQkFBSSxJQUl2QjtBQUNILGVBQVcsZUFBZSxjQUFjO0FBQ3ZDLFlBQU0saUJBQWlCLEVBQUUsa0JBQWtCLFdBQVc7QUFDdEQsWUFBTSxlQUFlLGVBQWUsTUFBTSxDQUFDO0FBQzNDLFlBQU0sUUFBUSxjQUFjLElBQUksWUFBWSxLQUFLO0FBQUEsUUFDaEQ7QUFBQSxRQUNBLGVBQWU7QUFBQSxRQUNmLG9CQUFvQjtBQUFBLE1BQ3JCO0FBQ0EsWUFBTSxzQkFBc0IsRUFBRSxnQ0FBZ0MsYUFBYSx5QkFBeUI7QUFDcEcsb0JBQWMsSUFBSSxjQUFjLEtBQUs7QUFBQSxJQUN0QztBQUNBLGVBQVcsU0FBUyxRQUFRO0FBQzNCLFlBQU0saUJBQWlCLEVBQUUsa0JBQWtCLE1BQU0sU0FBUztBQUMxRCxZQUFNLFFBQVEsY0FBYyxJQUFJLGVBQWUsTUFBTSxDQUFDLENBQUM7QUFDdkQsVUFBSSxPQUFPO0FBQ1YsY0FBTSxpQkFBaUIsTUFBTSxNQUFNO0FBQUEsTUFDcEM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxPQUFPLE9BQU8sWUFBWSxNQUFNLEtBQUssZUFBZSxDQUFDLENBQUMsS0FBSyxLQUFLLE1BQU0sQ0FBQyxLQUFLLE1BQU0sYUFBYSxDQUFDLENBQUM7QUFDdkcsVUFBTSxVQUFVLE9BQU8sUUFBUSxJQUFJLEVBQ2pDLE9BQU8sQ0FBQyxVQUFxQyxNQUFNLENBQUMsTUFBTSxNQUFTLEVBQ25FLEtBQUssYUFBYSxVQUFVLENBQUMsQ0FBQyxFQUFFLEtBQUssTUFBTSxPQUFPLGdCQUFnQixDQUFDLENBQUMsRUFDcEUsTUFBTSxHQUFHLFNBQVMsYUFBYSxLQUFLLEVBQUU7QUFFeEMsZUFBVyxDQUFDLEtBQUssS0FBSyxLQUFLLFNBQVM7QUFDbkMsWUFBTSxpQkFBaUIsY0FBYyxJQUFJLEdBQUc7QUFDNUMsWUFBTSxPQUFPLGVBQWU7QUFDNUIsWUFBTSxxQkFBcUIsZUFBZTtBQUUxQyxzQ0FBZ0MsS0FBSyxtQkFBbUI7QUFBQSxRQUN2RDtBQUFBLFFBQ0EsV0FBVztBQUFBLFFBQ1gsa0JBQWtCLEtBQUssTUFBTSxHQUFHLEVBQUUsY0FBYyxPQUFPLG1CQUFtQixPQUFPLFVBQVUsTUFBTSxDQUFDO0FBQUEsUUFDbEcsYUFBYSxLQUFLLE1BQU07QUFBQSxRQUN4QixrQkFBa0IsS0FBSyxNQUFNO0FBQUEsUUFDN0IsU0FBUyxLQUFLLE1BQU07QUFBQSxRQUNwQjtBQUFBLFFBQ0EsWUFBWSxLQUFLLEtBQUssU0FBUyxXQUFXLElBQUk7QUFBQSxRQUM5QztBQUFBLFFBQ0EsZ0JBQWdCLEtBQUssTUFBTTtBQUFBLFFBQzNCLFdBQVcsS0FBSyxNQUFNO0FBQUEsUUFDdEIsUUFBUSxLQUFLLE1BQU07QUFBQSxRQUNuQixTQUFTLEtBQUssTUFBTTtBQUFBLFFBQ3BCLGVBQWU7QUFBQSxRQUNmO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFHQSxVQUFNLGlCQUFpQixNQUFNLEtBQUs7QUFDbEMsa0NBQThCLEtBQUssbUJBQW1CO0FBQUEsTUFDckQsMEJBQTBCO0FBQUEsTUFDMUI7QUFBQSxNQUNBLFlBQVksS0FBSyxLQUFLLFNBQVMsV0FBVyxJQUFJO0FBQUEsTUFDOUM7QUFBQSxNQUNBLGtCQUFrQixLQUFLO0FBQUEsTUFDdkIsdUNBQXVDLEtBQUs7QUFBQSxNQUM1QyxtQ0FBbUMsS0FBSztBQUFBLE1BQ3hDLHNCQUFzQixLQUFLO0FBQUEsTUFDM0Isd0JBQXdCO0FBQUEsTUFDeEIsc0JBQXNCLEtBQUs7QUFBQSxNQUMzQixtQkFBbUIsS0FBSztBQUFBLE1BQ3hCLGtCQUFrQixLQUFLO0FBQUEsTUFDdkIseUJBQXlCO0FBQUEsTUFDekIsdUJBQXVCLEtBQUs7QUFBQSxNQUM1QixnQkFBZ0IsaUJBQWlCLElBQUk7QUFBQSxNQUNyQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxHQUFJLFNBQVMsYUFBYTtBQUFBLFFBQ3pCLDhCQUE4QixjQUFjLFlBQXFCO0FBQUEsUUFDakUsNkJBQTZCLGFBQWEsYUFBYTtBQUFBLFFBQ3ZELGlDQUFpQyxhQUFhLGlCQUFpQjtBQUFBLE1BQ2hFLElBQUksQ0FBQztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLGlCQUFpQixRQUFnQztBQUNoRCxVQUFNLE9BQU8sY0FBYyxRQUFRLE9BQUssRUFBRSxNQUFNLFFBQVEsT0FBSyx5QkFBeUIsRUFBRSxNQUFNLENBQUM7QUFDL0YsVUFBTSxzQ0FBc0MsTUFBTSxRQUFRLE9BQUssRUFBRSxNQUFNLE1BQU07QUFFN0UsV0FBTztBQUFBLE1BQ04sa0JBQWtCLEtBQUssT0FBTztBQUFBLE1BQzlCLHVDQUF1QyxLQUFLLDRCQUE0QjtBQUFBLE1BQ3hFLG1DQUFtQyxLQUFLLHdCQUF3QjtBQUFBLE1BQ2hFLHNCQUFzQixLQUFLLFdBQVc7QUFBQSxNQUN0Qyx3QkFBd0IsS0FBSyxhQUFhO0FBQUEsTUFDMUMsbUJBQW1CLEtBQUssUUFBUTtBQUFBLE1BQ2hDLGtCQUFrQixLQUFLLE9BQU87QUFBQSxNQUM5QixzQkFBc0IsS0FBSyxXQUFXO0FBQUEsTUFDdEMsdUJBQXVCLEtBQUssWUFBWTtBQUFBLE1BQ3hDO0FBQUEsTUFDQSxZQUFZLEtBQUssS0FBSyxTQUFTLFdBQVcsSUFBSTtBQUFBLE1BQzlDLGdCQUFnQixLQUFLLE1BQU0sSUFBSSxHQUFHLFVBQVUsS0FBSyxLQUFLLFNBQVMsR0FBRztBQUFBLElBQ25FO0FBQUEsRUFDRDtBQUNEO0FBelNNLHNCQUFOO0FBQUEsRUFZRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FqQkc7IiwKICAibmFtZXMiOiBbXQp9Cg==
