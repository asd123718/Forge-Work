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
import { SequencerByKey, TimeoutTimer } from "../../../../base/common/async.js";
import { EditArcTracker } from "../../../../base/common/editArcTracker.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { extUriBiasedIgnorePathCase } from "../../../../base/common/resources.js";
import { dirname, extname } from "../../../../base/common/path.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { URI } from "../../../../base/common/uri.js";
import { FileChangeType, FileOperationResult, IFileService, toFileOperationResult } from "../../../files/common/files.js";
import { createDecorator } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import { ITelemetryService, TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { AgentSession } from "../../common/agent.js";
import { IAgentHostGitService } from "../../common/agentHostGitService.js";
import { AgentHostEditTelemetryEnabledConfigKey, platformRootSchema } from "../../common/agentHostSchema.js";
import { IDiffComputeService } from "../../common/diffComputeService.js";
import { isAhpChatChannel, isSubagentChatUri, isSubagentSession, parseRequiredSessionUriFromChatUri } from "../../common/state/sessionState.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { isAgentHostTelemetryService } from "../agentHostTelemetryService.js";
import { toInitiatorTelemetry } from "../agentHostTelemetryReporter.js";
const IEditArcReporterService = createDecorator("editArcReporterService");
class NullEditArcReporterService {
  async reportEdit(_params) {
  }
}
const SAMPLE_SCHEDULE_MS = [0, 6e4, 3e5];
const MAX_TRACKED_FILE_SIZE_CHARS = 5 * 1024 * 1024;
const MAX_REPORTERS_PER_RESOURCE = 20;
const MAX_REPORTERS_HOST_WIDE = 200;
const MAX_RETAINED_CHARACTERS_HOST_WIDE = 100 * 1024 * 1024;
let EditArcReporterService = class extends Disposable {
  constructor(_sampleScheduleMs = SAMPLE_SCHEDULE_MS, _fileService, _diffComputeService, _gitService, _configurationService, _logService, _telemetryService) {
    super();
    this._sampleScheduleMs = _sampleScheduleMs;
    this._fileService = _fileService;
    this._diffComputeService = _diffComputeService;
    this._gitService = _gitService;
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._telemetryService = _telemetryService;
    this._resourceSequencer = new SequencerByKey();
    this._resources = this._register(new DisposableMap());
    this._reporterCount = 0;
    this._retainedCharacters = 0;
    this._register(this._configurationService.onDidRootConfigChange(() => {
      if (!this._isEnabled()) {
        this._disposeAllReporters("configuration disabled");
      }
    }));
  }
  async reportEdit(params) {
    const resource = URI.file(params.filePath);
    const key = extUriBiasedIgnorePathCase.getComparisonKey(resource);
    await this._resourceSequencer.queue(key, async () => {
      if (!this._isEnabled()) {
        this._logService.trace(`[EditArcReporter] Skipping ${params.filePath}: telemetry is disabled`);
        return;
      }
      if (extname(params.filePath).toLowerCase() === ".ipynb") {
        this._logService.trace(`[EditArcReporter] Skipping notebook: ${params.filePath}`);
        return;
      }
      const retainedCharacters = params.beforeText.length + params.afterText.length;
      if (Math.max(params.beforeText.length, params.afterText.length) > MAX_TRACKED_FILE_SIZE_CHARS) {
        this._logService.warn(`[EditArcReporter] Skipping oversized file: ${params.filePath}`);
        return;
      }
      let state = this._resources.get(key);
      if (state) {
        if (!await this._applyCompletedEdit(state, params)) {
          return;
        }
        if (!this._isEnabled() || this._resources.get(key) !== state) {
          return;
        }
      }
      if (state && state.reporters.size >= MAX_REPORTERS_PER_RESOURCE) {
        this._logService.warn(`[EditArcReporter] Skipping edit: per-resource reporter limit reached for ${params.filePath}`);
        return;
      }
      if (this._reporterCount >= MAX_REPORTERS_HOST_WIDE || this._retainedCharacters + retainedCharacters > MAX_RETAINED_CHARACTERS_HOST_WIDE) {
        this._logService.warn(`[EditArcReporter] Skipping edit: host reporter memory limit reached`);
        return;
      }
      state ??= this._createResourceState(key, resource, params.afterText);
      const resourceState = state;
      const reporter = new EditArcReporter(params, this._sampleScheduleMs, resourceState.gitWorkingDirectory, this._gitService, this._telemetryService, this._logService, (timeDelayMs) => this.reconcileAndSample(resourceState, reporter, timeDelayMs), () => {
        resourceState.reporters.delete(reporter);
        this._reporterCount--;
        this._retainedCharacters -= retainedCharacters;
        if (!resourceState.isDisposing && resourceState.reporters.size === 0) {
          this._resources.deleteAndDispose(key);
        }
      });
      resourceState.reporters.add(reporter);
      this._reporterCount++;
      this._retainedCharacters += retainedCharacters;
    });
  }
  _createResourceState(key, resource, logicalText) {
    const store = new DisposableStore();
    const fileDirectory = URI.file(dirname(resource.fsPath));
    const state = {
      resource,
      gitWorkingDirectory: this._gitService.getRepositoryRoot(fileDirectory).then((repositoryRoot) => repositoryRoot ?? fileDirectory),
      logicalText,
      reporters: /* @__PURE__ */ new Set(),
      isDisposing: false,
      dispose: () => {
        state.isDisposing = true;
        store.dispose();
      }
    };
    store.add(toDisposable(() => {
      for (const reporter of [...state.reporters]) {
        reporter.dispose();
      }
    }));
    try {
      const watcher = store.add(this._fileService.createWatcher(URI.file(dirname(resource.fsPath)), { recursive: false, excludes: [] }));
      store.add(watcher.onDidChange((event) => {
        if (event.contains(resource, FileChangeType.ADDED, FileChangeType.UPDATED, FileChangeType.DELETED)) {
          this._resourceSequencer.queue(key, async () => {
            try {
              await this._reconcileFromDisk(state, false);
            } catch (error) {
              this._logService.warn(`[EditArcReporter] Watcher reconciliation failed for ${resource.fsPath}`, error);
            }
          });
        }
      }));
    } catch (error) {
      this._logService.warn(`[EditArcReporter] Failed to watch ${resource.fsPath}; delayed samples will use forced reconciliation`, error);
    }
    this._resources.set(key, state);
    return state;
  }
  async _applyCompletedEdit(state, params) {
    if (state.logicalText === params.afterText) {
      return true;
    }
    if (state.logicalText === params.beforeText) {
      await this._applyEdit(state, params.initialEdit, params.afterText);
      return true;
    }
    const detailed = await this._diffComputeService.computeDetailedDiff(state.logicalText, params.afterText);
    if (detailed.hitTimeout) {
      this._logService.warn(`[EditArcReporter] Could not update older reporters before ${params.toolCallId}: detailed diff timed out`);
      return false;
    }
    await this._applyEdit(state, { replacements: detailed.replacements }, params.afterText);
    return true;
  }
  async _reconcileFromDisk(state, sample) {
    let currentText;
    try {
      currentText = (await this._fileService.readFile(state.resource)).value.toString();
    } catch (error) {
      if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
        currentText = "";
      } else {
        this._logService.warn(`[EditArcReporter] Failed to read ${state.resource.fsPath}${sample ? " before sample" : ""}`, error);
        return false;
      }
    }
    if (currentText === state.logicalText) {
      return true;
    }
    const detailed = await this._diffComputeService.computeDetailedDiff(state.logicalText, currentText);
    if (detailed.hitTimeout) {
      this._logService.warn(`[EditArcReporter] Detailed diff timed out for ${state.resource.fsPath}`);
      return false;
    }
    await this._applyEdit(state, { replacements: detailed.replacements }, currentText);
    return true;
  }
  async _applyEdit(state, edit, afterText) {
    for (const reporter of state.reporters) {
      reporter.handleEdit(edit);
    }
    state.logicalText = afterText;
  }
  _isEnabled() {
    return this._telemetryService.telemetryLevel >= TelemetryLevel.USAGE && this._configurationService.getRootValue(platformRootSchema, AgentHostEditTelemetryEnabledConfigKey) !== false;
  }
  _disposeAllReporters(reason) {
    if (this._reporterCount > 0) {
      this._logService.info(`[EditArcReporter] Disposing ${this._reporterCount} active reporters: ${reason}`);
    }
    this._resources.clearAndDisposeAll();
    this._reporterCount = 0;
    this._retainedCharacters = 0;
  }
  async reconcileAndSample(state, reporter, timeDelayMs) {
    const key = extUriBiasedIgnorePathCase.getComparisonKey(state.resource);
    await this._resourceSequencer.queue(key, async () => {
      if (!this._isEnabled()) {
        reporter.dispose();
        return;
      }
      if (timeDelayMs !== 0 && !await this._reconcileFromDisk(state, true)) {
        return;
      }
      await reporter.emit(timeDelayMs);
    });
  }
};
EditArcReporterService = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IDiffComputeService),
  __decorateParam(3, IAgentHostGitService),
  __decorateParam(4, IAgentConfigurationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, ITelemetryService)
], EditArcReporterService);
class EditArcReporter extends Disposable {
  constructor(_params, _sampleScheduleMs, _gitWorkingDirectory, _gitService, _telemetryService, _logService, _sample, onDispose) {
    super();
    this._params = _params;
    this._sampleScheduleMs = _sampleScheduleMs;
    this._gitWorkingDirectory = _gitWorkingDirectory;
    this._gitService = _gitService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._sample = _sample;
    this._uniqueEditId = generateUuid();
    this._sampleIndex = 0;
    this._tracker = new EditArcTracker(_params.beforeText, _params.initialEdit);
    this._initialBranch = this._getCurrentBranchName();
    this._register(toDisposable(onDispose));
    this._scheduleNext();
  }
  handleEdit(edit) {
    this._tracker.handleEdits(edit);
  }
  _scheduleNext() {
    if (this._store.isDisposed) {
      return;
    }
    if (this._sampleIndex >= this._sampleScheduleMs.length) {
      this.dispose();
      return;
    }
    const delay = Math.max(0, this._params.completionTime + this._sampleScheduleMs[this._sampleIndex] - Date.now());
    const timer = this._register(new TimeoutTimer());
    timer.setIfNotSet(async () => {
      const timeDelayMs = this._sampleScheduleMs[this._sampleIndex++];
      try {
        await this._sample(timeDelayMs);
      } catch (error) {
        this._logService.warn(`[EditArcReporter] Failed to sample ${this._params.filePath} after ${timeDelayMs}ms`, error);
      } finally {
        this._scheduleNext();
      }
    }, delay);
  }
  async emit(timeDelayMs) {
    const sessionUri = isAhpChatChannel(this._params.sessionUri) ? parseRequiredSessionUriFromChatUri(this._params.sessionUri) : this._params.sessionUri;
    const provider = AgentSession.provider(sessionUri) ?? "unknown";
    const originalLineCounts = new EditArcTracker(this._params.beforeText, this._params.initialEdit).getLineCountInfo();
    const currentLineCounts = this._tracker.getLineCountInfo();
    const event = {
      ...toInitiatorTelemetry(this._params.clientContext),
      sourceKeyCleaned: "source:Chat.applyEdits",
      extensionId: void 0,
      extensionVersion: void 0,
      opportunityId: void 0,
      editSessionId: AgentSession.id(sessionUri),
      requestId: this._params.turnId,
      modelId: this._params.modelId,
      languageId: void 0,
      mode: this._params.mode,
      uniqueEditId: this._uniqueEditId,
      provider,
      agentSessionId: AgentSession.id(sessionUri),
      isSubagentSession: isSubagentChatUri(this._params.sessionUri) || isSubagentSession(sessionUri) ? "true" : "false",
      didBranchChange: await this._initialBranch === await this._getCurrentBranchName() ? 0 : 1,
      timeDelayMs,
      originalCharCount: this._tracker.getOriginalCharacterCount(),
      originalLineCount: originalLineCounts.insertedLineCounts,
      originalDeletedLineCount: originalLineCounts.deletedLineCounts,
      arc: this._tracker.getAcceptedRestrainedCharactersCount(),
      currentLineCount: currentLineCounts.insertedLineCounts,
      currentDeletedLineCount: currentLineCounts.deletedLineCounts
    };
    this._telemetryService.publicLog2("editTelemetry.reportEditArc", event);
    if (provider === "copilotcli" && isAgentHostTelemetryService(this._telemetryService)) {
      const {
        didBranchChange,
        timeDelayMs: delay,
        originalCharCount,
        originalLineCount,
        originalDeletedLineCount,
        arc,
        currentLineCount,
        currentDeletedLineCount,
        initiatorClientType: _,
        initiatorConnectionKind: _2,
        initiatorTransportKind: _3,
        hostLaunchKind: _4,
        initiatorMachineId: _5,
        initiatorDevDeviceId: _6,
        ...properties
      } = event;
      const telemetry = this._telemetryService;
      telemetry.sendGHTelemetryEvent("vscode.editTelemetry.reportEditArc", withoutUndefined(properties), {
        didBranchChange,
        timeDelayMs: delay,
        originalCharCount,
        originalLineCount,
        originalDeletedLineCount,
        arc,
        currentLineCount,
        currentDeletedLineCount
      });
    }
    if (timeDelayMs === this._sampleScheduleMs.at(-1)) {
      this.dispose();
    }
  }
  async _getCurrentBranchName() {
    const workingDirectory = await this._gitWorkingDirectory;
    return this._gitService.getCurrentBranchName?.(workingDirectory) ?? this._gitService.getCurrentBranch(workingDirectory);
  }
}
function withoutUndefined(values) {
  const result = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== void 0) {
      result[key] = value;
    }
  }
  return result;
}
export {
  EditArcReporterService,
  IEditArcReporterService,
  NullEditArcReporterService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxzaGFyZWRcXGVkaXRBcmNSZXBvcnRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFNlcXVlbmNlckJ5S2V5LCBUaW1lb3V0VGltZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFZGl0QXJjVHJhY2tlciwgSUFyY1RleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZWRpdEFyY1RyYWNrZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGV4dG5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VUeXBlLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UsIHRvRmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUVkaXRBcmNUZWxlbWV0cnlDbGFzc2lmaWNhdGlvbiwgSUVkaXRBcmNUZWxlbWV0cnlFdmVudCB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vZWRpdEFyY1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnQuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RFZGl0VGVsZW1ldHJ5RW5hYmxlZENvbmZpZ0tleSwgcGxhdGZvcm1Sb290U2NoZW1hIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBJRGlmZkNvbXB1dGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2RpZmZDb21wdXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0FocENoYXRDaGFubmVsLCBpc1N1YmFnZW50Q2hhdFVyaSwgaXNTdWJhZ2VudFNlc3Npb24sIHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSwgaXNBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyB0b0luaXRpYXRvclRlbGVtZXRyeSwgdHlwZSBJQWdlbnRIb3N0SW5pdGlhdG9yQ2xhc3NpZmljYXRpb24sIHR5cGUgSUFnZW50SG9zdEluaXRpYXRvclRlbGVtZXRyeSB9IGZyb20gJy4uL2FnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRWRpdEFyY1JlcG9ydGVyTGF1bmNoUGFyYW1zIHtcblx0cmVhZG9ubHkgY2xpZW50Q29udGV4dD86IElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0O1xuXHRyZWFkb25seSBzZXNzaW9uVXJpOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nO1xuXHRyZWFkb25seSB0b29sQ2FsbElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZpbGVQYXRoOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJlZm9yZVRleHQ6IHN0cmluZztcblx0cmVhZG9ubHkgYWZ0ZXJUZXh0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGluaXRpYWxFZGl0OiBJQXJjVGV4dEVkaXQ7XG5cdHJlYWRvbmx5IG1vZGVsSWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRvb2xOYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBtb2RlPzogc3RyaW5nO1xuXHRyZWFkb25seSBjb21wbGV0aW9uVGltZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgSUVkaXRBcmNSZXBvcnRlclNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUVkaXRBcmNSZXBvcnRlclNlcnZpY2U+KCdlZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRBcmNSZXBvcnRlclNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlcG9ydEVkaXQocGFyYW1zOiBJRWRpdEFyY1JlcG9ydGVyTGF1bmNoUGFyYW1zKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGNsYXNzIE51bGxFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlIGltcGxlbWVudHMgSUVkaXRBcmNSZXBvcnRlclNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGFzeW5jIHJlcG9ydEVkaXQoX3BhcmFtczogSUVkaXRBcmNSZXBvcnRlckxhdW5jaFBhcmFtcyk6IFByb21pc2U8dm9pZD4geyB9XG59XG5cbmludGVyZmFjZSBJUmVzb3VyY2VTdGF0ZSBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgZ2l0V29ya2luZ0RpcmVjdG9yeTogUHJvbWlzZTxVUkk+O1xuXHRyZWFkb25seSByZXBvcnRlcnM6IFNldDxFZGl0QXJjUmVwb3J0ZXI+O1xuXHRsb2dpY2FsVGV4dDogc3RyaW5nO1xuXHRpc0Rpc3Bvc2luZzogYm9vbGVhbjtcbn1cblxuY29uc3QgU0FNUExFX1NDSEVEVUxFX01TID0gWzAsIDYwXzAwMCwgMzAwXzAwMF07XG5jb25zdCBNQVhfVFJBQ0tFRF9GSUxFX1NJWkVfQ0hBUlMgPSA1ICogMTAyNCAqIDEwMjQ7XG5jb25zdCBNQVhfUkVQT1JURVJTX1BFUl9SRVNPVVJDRSA9IDIwO1xuY29uc3QgTUFYX1JFUE9SVEVSU19IT1NUX1dJREUgPSAyMDA7XG5jb25zdCBNQVhfUkVUQUlORURfQ0hBUkFDVEVSU19IT1NUX1dJREUgPSAxMDAgKiAxMDI0ICogMTAyNDtcblxuZXhwb3J0IGNsYXNzIEVkaXRBcmNSZXBvcnRlclNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRBcmNSZXBvcnRlclNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZVNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXJCeUtleTxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSVJlc291cmNlU3RhdGU+KCkpO1xuXHRwcml2YXRlIF9yZXBvcnRlckNvdW50ID0gMDtcblx0cHJpdmF0ZSBfcmV0YWluZWRDaGFyYWN0ZXJzID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zYW1wbGVTY2hlZHVsZU1zOiByZWFkb25seSBudW1iZXJbXSA9IFNBTVBMRV9TQ0hFRFVMRV9NUyxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElEaWZmQ29tcHV0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlmZkNvbXB1dGVTZXJ2aWNlOiBJRGlmZkNvbXB1dGVTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0R2l0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9naXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSxcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRSb290Q29uZmlnQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5faXNFbmFibGVkKCkpIHtcblx0XHRcdFx0dGhpcy5fZGlzcG9zZUFsbFJlcG9ydGVycygnY29uZmlndXJhdGlvbiBkaXNhYmxlZCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIHJlcG9ydEVkaXQocGFyYW1zOiBJRWRpdEFyY1JlcG9ydGVyTGF1bmNoUGFyYW1zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShwYXJhbXMuZmlsZVBhdGgpO1xuXHRcdGNvbnN0IGtleSA9IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmdldENvbXBhcmlzb25LZXkocmVzb3VyY2UpO1xuXHRcdGF3YWl0IHRoaXMuX3Jlc291cmNlU2VxdWVuY2VyLnF1ZXVlKGtleSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbRWRpdEFyY1JlcG9ydGVyXSBTa2lwcGluZyAke3BhcmFtcy5maWxlUGF0aH06IHRlbGVtZXRyeSBpcyBkaXNhYmxlZGApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0bmFtZShwYXJhbXMuZmlsZVBhdGgpLnRvTG93ZXJDYXNlKCkgPT09ICcuaXB5bmInKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtFZGl0QXJjUmVwb3J0ZXJdIFNraXBwaW5nIG5vdGVib29rOiAke3BhcmFtcy5maWxlUGF0aH1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmV0YWluZWRDaGFyYWN0ZXJzID0gcGFyYW1zLmJlZm9yZVRleHQubGVuZ3RoICsgcGFyYW1zLmFmdGVyVGV4dC5sZW5ndGg7XG5cdFx0XHRpZiAoTWF0aC5tYXgocGFyYW1zLmJlZm9yZVRleHQubGVuZ3RoLCBwYXJhbXMuYWZ0ZXJUZXh0Lmxlbmd0aCkgPiBNQVhfVFJBQ0tFRF9GSUxFX1NJWkVfQ0hBUlMpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbRWRpdEFyY1JlcG9ydGVyXSBTa2lwcGluZyBvdmVyc2l6ZWQgZmlsZTogJHtwYXJhbXMuZmlsZVBhdGh9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHN0YXRlID0gdGhpcy5fcmVzb3VyY2VzLmdldChrZXkpO1xuXHRcdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHRcdGlmICghYXdhaXQgdGhpcy5fYXBwbHlDb21wbGV0ZWRFZGl0KHN0YXRlLCBwYXJhbXMpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghdGhpcy5faXNFbmFibGVkKCkgfHwgdGhpcy5fcmVzb3VyY2VzLmdldChrZXkpICE9PSBzdGF0ZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RhdGUgJiYgc3RhdGUucmVwb3J0ZXJzLnNpemUgPj0gTUFYX1JFUE9SVEVSU19QRVJfUkVTT1VSQ0UpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbRWRpdEFyY1JlcG9ydGVyXSBTa2lwcGluZyBlZGl0OiBwZXItcmVzb3VyY2UgcmVwb3J0ZXIgbGltaXQgcmVhY2hlZCBmb3IgJHtwYXJhbXMuZmlsZVBhdGh9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9yZXBvcnRlckNvdW50ID49IE1BWF9SRVBPUlRFUlNfSE9TVF9XSURFIHx8IHRoaXMuX3JldGFpbmVkQ2hhcmFjdGVycyArIHJldGFpbmVkQ2hhcmFjdGVycyA+IE1BWF9SRVRBSU5FRF9DSEFSQUNURVJTX0hPU1RfV0lERSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtFZGl0QXJjUmVwb3J0ZXJdIFNraXBwaW5nIGVkaXQ6IGhvc3QgcmVwb3J0ZXIgbWVtb3J5IGxpbWl0IHJlYWNoZWRgKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRzdGF0ZSA/Pz0gdGhpcy5fY3JlYXRlUmVzb3VyY2VTdGF0ZShrZXksIHJlc291cmNlLCBwYXJhbXMuYWZ0ZXJUZXh0KTtcblx0XHRcdGNvbnN0IHJlc291cmNlU3RhdGUgPSBzdGF0ZTtcblx0XHRcdGNvbnN0IHJlcG9ydGVyOiBFZGl0QXJjUmVwb3J0ZXIgPSBuZXcgRWRpdEFyY1JlcG9ydGVyKHBhcmFtcywgdGhpcy5fc2FtcGxlU2NoZWR1bGVNcywgcmVzb3VyY2VTdGF0ZS5naXRXb3JraW5nRGlyZWN0b3J5LCB0aGlzLl9naXRTZXJ2aWNlLCB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlLCAodGltZURlbGF5TXMpOiBQcm9taXNlPHZvaWQ+ID0+IHRoaXMucmVjb25jaWxlQW5kU2FtcGxlKHJlc291cmNlU3RhdGUsIHJlcG9ydGVyLCB0aW1lRGVsYXlNcyksICgpID0+IHtcblx0XHRcdFx0cmVzb3VyY2VTdGF0ZS5yZXBvcnRlcnMuZGVsZXRlKHJlcG9ydGVyKTtcblx0XHRcdFx0dGhpcy5fcmVwb3J0ZXJDb3VudC0tO1xuXHRcdFx0XHR0aGlzLl9yZXRhaW5lZENoYXJhY3RlcnMgLT0gcmV0YWluZWRDaGFyYWN0ZXJzO1xuXHRcdFx0XHRpZiAoIXJlc291cmNlU3RhdGUuaXNEaXNwb3NpbmcgJiYgcmVzb3VyY2VTdGF0ZS5yZXBvcnRlcnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX3Jlc291cmNlcy5kZWxldGVBbmREaXNwb3NlKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0cmVzb3VyY2VTdGF0ZS5yZXBvcnRlcnMuYWRkKHJlcG9ydGVyKTtcblx0XHRcdHRoaXMuX3JlcG9ydGVyQ291bnQrKztcblx0XHRcdHRoaXMuX3JldGFpbmVkQ2hhcmFjdGVycyArPSByZXRhaW5lZENoYXJhY3RlcnM7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVSZXNvdXJjZVN0YXRlKGtleTogc3RyaW5nLCByZXNvdXJjZTogVVJJLCBsb2dpY2FsVGV4dDogc3RyaW5nKTogSVJlc291cmNlU3RhdGUge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGZpbGVEaXJlY3RvcnkgPSBVUkkuZmlsZShkaXJuYW1lKHJlc291cmNlLmZzUGF0aCkpO1xuXHRcdGNvbnN0IHN0YXRlOiBJUmVzb3VyY2VTdGF0ZSA9IHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0Z2l0V29ya2luZ0RpcmVjdG9yeTogdGhpcy5fZ2l0U2VydmljZS5nZXRSZXBvc2l0b3J5Um9vdChmaWxlRGlyZWN0b3J5KS50aGVuKHJlcG9zaXRvcnlSb290ID0+IHJlcG9zaXRvcnlSb290ID8/IGZpbGVEaXJlY3RvcnkpLFxuXHRcdFx0bG9naWNhbFRleHQsXG5cdFx0XHRyZXBvcnRlcnM6IG5ldyBTZXQoKSxcblx0XHRcdGlzRGlzcG9zaW5nOiBmYWxzZSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0c3RhdGUuaXNEaXNwb3NpbmcgPSB0cnVlO1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHJlcG9ydGVyIG9mIFsuLi5zdGF0ZS5yZXBvcnRlcnNdKSB7XG5cdFx0XHRcdHJlcG9ydGVyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHdhdGNoZXIgPSBzdG9yZS5hZGQodGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlV2F0Y2hlcihVUkkuZmlsZShkaXJuYW1lKHJlc291cmNlLmZzUGF0aCkpLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KSk7XG5cdFx0XHRzdG9yZS5hZGQod2F0Y2hlci5vbkRpZENoYW5nZShldmVudCA9PiB7XG5cdFx0XHRcdGlmIChldmVudC5jb250YWlucyhyZXNvdXJjZSwgRmlsZUNoYW5nZVR5cGUuQURERUQsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVzb3VyY2VTZXF1ZW5jZXIucXVldWUoa2V5LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9yZWNvbmNpbGVGcm9tRGlzayhzdGF0ZSwgZmFsc2UpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbRWRpdEFyY1JlcG9ydGVyXSBXYXRjaGVyIHJlY29uY2lsaWF0aW9uIGZhaWxlZCBmb3IgJHtyZXNvdXJjZS5mc1BhdGh9YCwgZXJyb3IpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0VkaXRBcmNSZXBvcnRlcl0gRmFpbGVkIHRvIHdhdGNoICR7cmVzb3VyY2UuZnNQYXRofTsgZGVsYXllZCBzYW1wbGVzIHdpbGwgdXNlIGZvcmNlZCByZWNvbmNpbGlhdGlvbmAsIGVycm9yKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVzb3VyY2VzLnNldChrZXksIHN0YXRlKTtcblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBseUNvbXBsZXRlZEVkaXQoc3RhdGU6IElSZXNvdXJjZVN0YXRlLCBwYXJhbXM6IElFZGl0QXJjUmVwb3J0ZXJMYXVuY2hQYXJhbXMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoc3RhdGUubG9naWNhbFRleHQgPT09IHBhcmFtcy5hZnRlclRleHQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc3RhdGUubG9naWNhbFRleHQgPT09IHBhcmFtcy5iZWZvcmVUZXh0KSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hcHBseUVkaXQoc3RhdGUsIHBhcmFtcy5pbml0aWFsRWRpdCwgcGFyYW1zLmFmdGVyVGV4dCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBkZXRhaWxlZCA9IGF3YWl0IHRoaXMuX2RpZmZDb21wdXRlU2VydmljZS5jb21wdXRlRGV0YWlsZWREaWZmKHN0YXRlLmxvZ2ljYWxUZXh0LCBwYXJhbXMuYWZ0ZXJUZXh0KTtcblx0XHRpZiAoZGV0YWlsZWQuaGl0VGltZW91dCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbRWRpdEFyY1JlcG9ydGVyXSBDb3VsZCBub3QgdXBkYXRlIG9sZGVyIHJlcG9ydGVycyBiZWZvcmUgJHtwYXJhbXMudG9vbENhbGxJZH06IGRldGFpbGVkIGRpZmYgdGltZWQgb3V0YCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2FwcGx5RWRpdChzdGF0ZSwgeyByZXBsYWNlbWVudHM6IGRldGFpbGVkLnJlcGxhY2VtZW50cyB9LCBwYXJhbXMuYWZ0ZXJUZXh0KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY29uY2lsZUZyb21EaXNrKHN0YXRlOiBJUmVzb3VyY2VTdGF0ZSwgc2FtcGxlOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IGN1cnJlbnRUZXh0OiBzdHJpbmc7XG5cdFx0dHJ5IHtcblx0XHRcdGN1cnJlbnRUZXh0ID0gKGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKHN0YXRlLnJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0Y3VycmVudFRleHQgPSAnJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0VkaXRBcmNSZXBvcnRlcl0gRmFpbGVkIHRvIHJlYWQgJHtzdGF0ZS5yZXNvdXJjZS5mc1BhdGh9JHtzYW1wbGUgPyAnIGJlZm9yZSBzYW1wbGUnIDogJyd9YCwgZXJyb3IpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjdXJyZW50VGV4dCA9PT0gc3RhdGUubG9naWNhbFRleHQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRldGFpbGVkID0gYXdhaXQgdGhpcy5fZGlmZkNvbXB1dGVTZXJ2aWNlLmNvbXB1dGVEZXRhaWxlZERpZmYoc3RhdGUubG9naWNhbFRleHQsIGN1cnJlbnRUZXh0KTtcblx0XHRpZiAoZGV0YWlsZWQuaGl0VGltZW91dCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbRWRpdEFyY1JlcG9ydGVyXSBEZXRhaWxlZCBkaWZmIHRpbWVkIG91dCBmb3IgJHtzdGF0ZS5yZXNvdXJjZS5mc1BhdGh9YCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2FwcGx5RWRpdChzdGF0ZSwgeyByZXBsYWNlbWVudHM6IGRldGFpbGVkLnJlcGxhY2VtZW50cyB9LCBjdXJyZW50VGV4dCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBseUVkaXQoc3RhdGU6IElSZXNvdXJjZVN0YXRlLCBlZGl0OiBJQXJjVGV4dEVkaXQsIGFmdGVyVGV4dDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCByZXBvcnRlciBvZiBzdGF0ZS5yZXBvcnRlcnMpIHtcblx0XHRcdHJlcG9ydGVyLmhhbmRsZUVkaXQoZWRpdCk7XG5cdFx0fVxuXHRcdHN0YXRlLmxvZ2ljYWxUZXh0ID0gYWZ0ZXJUZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnRlbGVtZXRyeUxldmVsID49IFRlbGVtZXRyeUxldmVsLlVTQUdFXG5cdFx0XHQmJiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RFZGl0VGVsZW1ldHJ5RW5hYmxlZENvbmZpZ0tleSkgIT09IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZUFsbFJlcG9ydGVycyhyZWFzb246IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9yZXBvcnRlckNvdW50ID4gMCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbRWRpdEFyY1JlcG9ydGVyXSBEaXNwb3NpbmcgJHt0aGlzLl9yZXBvcnRlckNvdW50fSBhY3RpdmUgcmVwb3J0ZXJzOiAke3JlYXNvbn1gKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVzb3VyY2VzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHRcdHRoaXMuX3JlcG9ydGVyQ291bnQgPSAwO1xuXHRcdHRoaXMuX3JldGFpbmVkQ2hhcmFjdGVycyA9IDA7XG5cdH1cblxuXHRhc3luYyByZWNvbmNpbGVBbmRTYW1wbGUoc3RhdGU6IElSZXNvdXJjZVN0YXRlLCByZXBvcnRlcjogRWRpdEFyY1JlcG9ydGVyLCB0aW1lRGVsYXlNczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qga2V5ID0gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuZ2V0Q29tcGFyaXNvbktleShzdGF0ZS5yZXNvdXJjZSk7XG5cdFx0YXdhaXQgdGhpcy5fcmVzb3VyY2VTZXF1ZW5jZXIucXVldWUoa2V5LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdHJlcG9ydGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRpbWVEZWxheU1zICE9PSAwICYmICFhd2FpdCB0aGlzLl9yZWNvbmNpbGVGcm9tRGlzayhzdGF0ZSwgdHJ1ZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgcmVwb3J0ZXIuZW1pdCh0aW1lRGVsYXlNcyk7XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgRWRpdEFyY1JlcG9ydGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyYWNrZXI6IEVkaXRBcmNUcmFja2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91bmlxdWVFZGl0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5pdGlhbEJyYW5jaDogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIF9zYW1wbGVJbmRleCA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcGFyYW1zOiBJRWRpdEFyY1JlcG9ydGVyTGF1bmNoUGFyYW1zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NhbXBsZVNjaGVkdWxlTXM6IHJlYWRvbmx5IG51bWJlcltdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dpdFdvcmtpbmdEaXJlY3Rvcnk6IFByb21pc2U8VVJJPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9naXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zYW1wbGU6ICh0aW1lRGVsYXlNczogbnVtYmVyKSA9PiBQcm9taXNlPHZvaWQ+LFxuXHRcdG9uRGlzcG9zZTogKCkgPT4gdm9pZCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl90cmFja2VyID0gbmV3IEVkaXRBcmNUcmFja2VyKF9wYXJhbXMuYmVmb3JlVGV4dCwgX3BhcmFtcy5pbml0aWFsRWRpdCk7XG5cdFx0dGhpcy5faW5pdGlhbEJyYW5jaCA9IHRoaXMuX2dldEN1cnJlbnRCcmFuY2hOYW1lKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKG9uRGlzcG9zZSkpO1xuXHRcdHRoaXMuX3NjaGVkdWxlTmV4dCgpO1xuXHR9XG5cblx0aGFuZGxlRWRpdChlZGl0OiBJQXJjVGV4dEVkaXQpOiB2b2lkIHtcblx0XHR0aGlzLl90cmFja2VyLmhhbmRsZUVkaXRzKGVkaXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVOZXh0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zYW1wbGVJbmRleCA+PSB0aGlzLl9zYW1wbGVTY2hlZHVsZU1zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRlbGF5ID0gTWF0aC5tYXgoMCwgdGhpcy5fcGFyYW1zLmNvbXBsZXRpb25UaW1lICsgdGhpcy5fc2FtcGxlU2NoZWR1bGVNc1t0aGlzLl9zYW1wbGVJbmRleF0gLSBEYXRlLm5vdygpKTtcblx0XHRjb25zdCB0aW1lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaW1lb3V0VGltZXIoKSk7XG5cdFx0dGltZXIuc2V0SWZOb3RTZXQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGltZURlbGF5TXMgPSB0aGlzLl9zYW1wbGVTY2hlZHVsZU1zW3RoaXMuX3NhbXBsZUluZGV4KytdO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fc2FtcGxlKHRpbWVEZWxheU1zKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0VkaXRBcmNSZXBvcnRlcl0gRmFpbGVkIHRvIHNhbXBsZSAke3RoaXMuX3BhcmFtcy5maWxlUGF0aH0gYWZ0ZXIgJHt0aW1lRGVsYXlNc31tc2AsIGVycm9yKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX3NjaGVkdWxlTmV4dCgpO1xuXHRcdFx0fVxuXHRcdH0sIGRlbGF5KTtcblx0fVxuXG5cdGFzeW5jIGVtaXQodGltZURlbGF5TXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBpc0FocENoYXRDaGFubmVsKHRoaXMuX3BhcmFtcy5zZXNzaW9uVXJpKSA/IHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkodGhpcy5fcGFyYW1zLnNlc3Npb25VcmkpIDogdGhpcy5fcGFyYW1zLnNlc3Npb25Vcmk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBBZ2VudFNlc3Npb24ucHJvdmlkZXIoc2Vzc2lvblVyaSkgPz8gJ3Vua25vd24nO1xuXHRcdGNvbnN0IG9yaWdpbmFsTGluZUNvdW50cyA9IG5ldyBFZGl0QXJjVHJhY2tlcih0aGlzLl9wYXJhbXMuYmVmb3JlVGV4dCwgdGhpcy5fcGFyYW1zLmluaXRpYWxFZGl0KS5nZXRMaW5lQ291bnRJbmZvKCk7XG5cdFx0Y29uc3QgY3VycmVudExpbmVDb3VudHMgPSB0aGlzLl90cmFja2VyLmdldExpbmVDb3VudEluZm8oKTtcblx0XHRjb25zdCBldmVudDogSUVkaXRBcmNUZWxlbWV0cnlFdmVudCAmIElBZ2VudEhvc3RJbml0aWF0b3JUZWxlbWV0cnkgPSB7XG5cdFx0XHQuLi50b0luaXRpYXRvclRlbGVtZXRyeSh0aGlzLl9wYXJhbXMuY2xpZW50Q29udGV4dCksXG5cdFx0XHRzb3VyY2VLZXlDbGVhbmVkOiAnc291cmNlOkNoYXQuYXBwbHlFZGl0cycsXG5cdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogdW5kZWZpbmVkLFxuXHRcdFx0b3Bwb3J0dW5pdHlJZDogdW5kZWZpbmVkLFxuXHRcdFx0ZWRpdFNlc3Npb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb25VcmkpLFxuXHRcdFx0cmVxdWVzdElkOiB0aGlzLl9wYXJhbXMudHVybklkLFxuXHRcdFx0bW9kZWxJZDogdGhpcy5fcGFyYW1zLm1vZGVsSWQsXG5cdFx0XHRsYW5ndWFnZUlkOiB1bmRlZmluZWQsXG5cdFx0XHRtb2RlOiB0aGlzLl9wYXJhbXMubW9kZSxcblx0XHRcdHVuaXF1ZUVkaXRJZDogdGhpcy5fdW5pcXVlRWRpdElkLFxuXHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRhZ2VudFNlc3Npb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb25VcmkpLFxuXHRcdFx0aXNTdWJhZ2VudFNlc3Npb246IGlzU3ViYWdlbnRDaGF0VXJpKHRoaXMuX3BhcmFtcy5zZXNzaW9uVXJpKSB8fCBpc1N1YmFnZW50U2Vzc2lvbihzZXNzaW9uVXJpKSA/ICd0cnVlJyA6ICdmYWxzZScsXG5cdFx0XHRkaWRCcmFuY2hDaGFuZ2U6IGF3YWl0IHRoaXMuX2luaXRpYWxCcmFuY2ggPT09IGF3YWl0IHRoaXMuX2dldEN1cnJlbnRCcmFuY2hOYW1lKCkgPyAwIDogMSxcblx0XHRcdHRpbWVEZWxheU1zLFxuXHRcdFx0b3JpZ2luYWxDaGFyQ291bnQ6IHRoaXMuX3RyYWNrZXIuZ2V0T3JpZ2luYWxDaGFyYWN0ZXJDb3VudCgpLFxuXHRcdFx0b3JpZ2luYWxMaW5lQ291bnQ6IG9yaWdpbmFsTGluZUNvdW50cy5pbnNlcnRlZExpbmVDb3VudHMsXG5cdFx0XHRvcmlnaW5hbERlbGV0ZWRMaW5lQ291bnQ6IG9yaWdpbmFsTGluZUNvdW50cy5kZWxldGVkTGluZUNvdW50cyxcblx0XHRcdGFyYzogdGhpcy5fdHJhY2tlci5nZXRBY2NlcHRlZFJlc3RyYWluZWRDaGFyYWN0ZXJzQ291bnQoKSxcblx0XHRcdGN1cnJlbnRMaW5lQ291bnQ6IGN1cnJlbnRMaW5lQ291bnRzLmluc2VydGVkTGluZUNvdW50cyxcblx0XHRcdGN1cnJlbnREZWxldGVkTGluZUNvdW50OiBjdXJyZW50TGluZUNvdW50cy5kZWxldGVkTGluZUNvdW50cyxcblx0XHR9O1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJRWRpdEFyY1RlbGVtZXRyeUV2ZW50ICYgSUFnZW50SG9zdEluaXRpYXRvclRlbGVtZXRyeSwgSUVkaXRBcmNUZWxlbWV0cnlDbGFzc2lmaWNhdGlvbiAmIElBZ2VudEhvc3RJbml0aWF0b3JDbGFzc2lmaWNhdGlvbj4oJ2VkaXRUZWxlbWV0cnkucmVwb3J0RWRpdEFyYycsIGV2ZW50KTtcblx0XHRpZiAocHJvdmlkZXIgPT09ICdjb3BpbG90Y2xpJyAmJiBpc0FnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UodGhpcy5fdGVsZW1ldHJ5U2VydmljZSkpIHtcblx0XHRcdGNvbnN0IHtcblx0XHRcdFx0ZGlkQnJhbmNoQ2hhbmdlLFxuXHRcdFx0XHR0aW1lRGVsYXlNczogZGVsYXksXG5cdFx0XHRcdG9yaWdpbmFsQ2hhckNvdW50LFxuXHRcdFx0XHRvcmlnaW5hbExpbmVDb3VudCxcblx0XHRcdFx0b3JpZ2luYWxEZWxldGVkTGluZUNvdW50LFxuXHRcdFx0XHRhcmMsXG5cdFx0XHRcdGN1cnJlbnRMaW5lQ291bnQsXG5cdFx0XHRcdGN1cnJlbnREZWxldGVkTGluZUNvdW50LFxuXHRcdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiBfLFxuXHRcdFx0XHRpbml0aWF0b3JDb25uZWN0aW9uS2luZDogXzIsXG5cdFx0XHRcdGluaXRpYXRvclRyYW5zcG9ydEtpbmQ6IF8zLFxuXHRcdFx0XHRob3N0TGF1bmNoS2luZDogXzQsXG5cdFx0XHRcdGluaXRpYXRvck1hY2hpbmVJZDogXzUsXG5cdFx0XHRcdGluaXRpYXRvckRldkRldmljZUlkOiBfNixcblx0XHRcdFx0Li4ucHJvcGVydGllc1xuXHRcdFx0fSA9IGV2ZW50O1xuXHRcdFx0Y29uc3QgdGVsZW1ldHJ5ID0gdGhpcy5fdGVsZW1ldHJ5U2VydmljZSBhcyBJQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZTtcblx0XHRcdHRlbGVtZXRyeS5zZW5kR0hUZWxlbWV0cnlFdmVudCgndnNjb2RlLmVkaXRUZWxlbWV0cnkucmVwb3J0RWRpdEFyYycsIHdpdGhvdXRVbmRlZmluZWQocHJvcGVydGllcyksIHtcblx0XHRcdFx0ZGlkQnJhbmNoQ2hhbmdlLFxuXHRcdFx0XHR0aW1lRGVsYXlNczogZGVsYXksXG5cdFx0XHRcdG9yaWdpbmFsQ2hhckNvdW50LFxuXHRcdFx0XHRvcmlnaW5hbExpbmVDb3VudCxcblx0XHRcdFx0b3JpZ2luYWxEZWxldGVkTGluZUNvdW50LFxuXHRcdFx0XHRhcmMsXG5cdFx0XHRcdGN1cnJlbnRMaW5lQ291bnQsXG5cdFx0XHRcdGN1cnJlbnREZWxldGVkTGluZUNvdW50LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGlmICh0aW1lRGVsYXlNcyA9PT0gdGhpcy5fc2FtcGxlU2NoZWR1bGVNcy5hdCgtMSkpIHtcblx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldEN1cnJlbnRCcmFuY2hOYW1lKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGF3YWl0IHRoaXMuX2dpdFdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0cmV0dXJuIHRoaXMuX2dpdFNlcnZpY2UuZ2V0Q3VycmVudEJyYW5jaE5hbWU/Lih3b3JraW5nRGlyZWN0b3J5KSA/PyB0aGlzLl9naXRTZXJ2aWNlLmdldEN1cnJlbnRCcmFuY2god29ya2luZ0RpcmVjdG9yeSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gd2l0aG91dFVuZGVmaW5lZCh2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4pOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcblx0Y29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHZhbHVlcykpIHtcblx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0W2tleV0gPSB2YWx1ZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0Isb0JBQW9CO0FBQzdDLFNBQVMsc0JBQW9DO0FBQzdDLFNBQVMsWUFBWSxlQUFlLGlCQUE4QixvQkFBb0I7QUFDdEYsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxTQUFTLGVBQWU7QUFDakMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCLHFCQUFxQixjQUFjLDZCQUE2QjtBQUN6RixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLG1CQUFtQixzQkFBc0I7QUFDbEQsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3Q0FBd0MsMEJBQTBCO0FBQzNFLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0JBQWtCLG1CQUFtQixtQkFBbUIsMENBQTBD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
