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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { isAbsolute, join } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { fromAgentHostUri } from "../../../../platform/agentHost/common/agentHostUri.js";
import { IAgentHostService } from "../../../../platform/agentHost/common/agentService.js";
import {
  DEFAULT_ORCHESTRATION_ASSIGNMENT,
  FORGE_ORCHESTRATION_ASSIGNMENT_KEY,
  isActiveOrchestrationStatus,
  readAssignment,
  readOrchestrationState
} from "../../../../platform/agentHost/common/orchestration/orchestrationTypes.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { FileChangeType, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { IChatWidgetService, isIChatViewViewContext } from "../../chat/browser/chat.js";
import { LiveEditPreviewController } from "../../chat/browser/agentSessions/agentHost/liveEditPreview.js";
import { IChatResponseFileChangesService } from "../../chat/browser/chatResponseFileChangesService.js";
import {
  DialecticLiveEditSlotMap,
  dialecticLiveEditContextKey,
  dialecticLiveEditPane,
  dialecticLiveEditSourceId
} from "../../chat/common/liveEditPreviewSlots.js";
import { SessionType } from "../../chat/common/chatSessionsService.js";
import { getChatSessionType } from "../../chat/common/model/chatUri.js";
import { FORGE_WORK_MODE_SETTING_ID, readForgeWorkMode } from "../common/forgeWorkMode.js";
let ForgeCodexLiveEditContribution = class extends Disposable {
  constructor(chatWidgetService, _fileChangesService, _configurationService, _agentHostService, _fileService, instantiationService) {
    super();
    this._fileChangesService = _fileChangesService;
    this._configurationService = _configurationService;
    this._agentHostService = _agentHostService;
    this._fileService = _fileService;
    this._widgetStore = this._register(new DisposableStore());
    this._slots = new DialecticLiveEditSlotMap();
    this._baselines = /* @__PURE__ */ new Map();
    this._dirty = /* @__PURE__ */ new Set();
    this._playedTasks = /* @__PURE__ */ new Set();
    this._focused = false;
    this._controller = this._register(instantiationService.createInstance(LiveEditPreviewController));
    this._fileScheduler = this._register(new RunOnceScheduler(() => {
      void this._flushDirtyFiles();
    }, 50));
    for (const widget of chatWidgetService.getAllWidgets()) {
      this._bindWidget(widget);
    }
    this._register(chatWidgetService.onDidAddWidget((widget) => this._bindWidget(widget)));
    this._register(this._agentHostService.rootState.onDidChange(() => this._onOrchestrationChange()));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(FORGE_WORK_MODE_SETTING_ID)) {
        this._onOrchestrationChange();
      }
    }));
    this._register(this._fileService.onDidFilesChange((e) => this._onWorkspaceFilesChange(e)));
    this._onOrchestrationChange();
  }
  _bindWidget(widget) {
    if (!isIChatViewViewContext(widget.viewContext)) {
      return;
    }
    const modelBinding = this._widgetStore.add(new MutableDisposable());
    const bindModel = () => {
      const store = new DisposableStore();
      modelBinding.value = store;
      const model = widget.viewModel?.model;
      if (!model || getChatSessionType(model.sessionResource) !== SessionType.AgentHostCodex) {
        return;
      }
      const chatKey = model.sessionResource.toString();
      this._chatKey = chatKey;
      this._controller.setContext(chatKey);
      let activeRequestId;
      const observedRequests = /* @__PURE__ */ new Set();
      const requestBinding = store.add(new MutableDisposable());
      const bindRequest = () => {
        const request = model.getRequests().at(-1);
        if (!request) {
          return;
        }
        const dialectic = this._isDialectic();
        const run = dialectic ? this._run() : void 0;
        const runId = run && isActiveOrchestrationStatus(run.status) ? run.runId : void 0;
        if (runId) {
          if (observedRequests.has(request.id)) {
            return;
          }
        } else if (request.id === activeRequestId) {
          return;
        } else {
          requestBinding.value = void 0;
          observedRequests.clear();
          this._slots.reset();
          this._focused = false;
        }
        activeRequestId = request.id;
        observedRequests.add(request.id);
        const contextKey = dialecticLiveEditContextKey(chatKey, runId, request.id);
        this._controller.setContext(contextKey);
        if (dialectic) {
          this._controller.ensureSplit();
        }
        const editsObservable = this._fileChangesService.getFileEditsForRequest?.(model.sessionResource, request.id);
        if (!editsObservable) {
          return;
        }
        const seen = /* @__PURE__ */ new Map();
        const requestStore = runId && requestBinding.value ? requestBinding.value : new DisposableStore();
        requestBinding.value = requestStore;
        requestStore.add(autorun((reader) => {
          const currentDialectic = this._isDialectic();
          const currentRun = currentDialectic ? this._run() : void 0;
          const currentRunId = currentRun && isActiveOrchestrationStatus(currentRun.status) ? currentRun.runId : void 0;
          const liveContextKey = dialecticLiveEditContextKey(chatKey, currentRunId, request.id);
          const tasks = taskRefs(currentRun);
          const workerIds = workerProviderIds(currentRun, this._assignment());
          for (const edit of editsObservable.read(reader)) {
            if (edit.isDeleted) {
              continue;
            }
            const snapshotUri = edit.modifiedSnapshotURI;
            if (!snapshotUri || seen.get(edit.modifiedURI.toString()) === snapshotUri.toString()) {
              continue;
            }
            seen.set(edit.modifiedURI.toString(), snapshotUri.toString());
            const takeFocus = !this._focused;
            this._focused = true;
            this._controller.show({
              contextKey: liveContextKey,
              chatKey,
              resource: edit.modifiedURI,
              originalUri: edit.originalURI,
              snapshotUri,
              isFinal: edit.isEditComplete === true,
              takeFocus,
              pane: currentDialectic ? dialecticLiveEditPane(dialecticLiveEditSourceId(liveEditFilePath(edit.modifiedURI), tasks), workerIds, this._slots) : "diff"
            });
          }
        }));
        if (!runId) {
          requestStore.add(model.onDidChange(() => {
            if (this._isDialectic() && isActiveOrchestrationStatus(this._run()?.status)) {
              return;
            }
            const current = model.getRequests().find((candidate) => candidate.id === request.id);
            if (current?.response?.isComplete || current?.response?.isCanceled) {
              this._controller.finishContext(dialecticLiveEditContextKey(chatKey, void 0, request.id));
            }
          }));
        }
      };
      store.add(model.onDidChange(bindRequest));
      bindRequest();
    };
    this._widgetStore.add(widget.onDidChangeViewModel(bindModel));
    bindModel();
  }
  _onOrchestrationChange() {
    if (!this._isDialectic()) {
      this._resetOrchestrationPreview();
      return;
    }
    const run = this._run();
    if (!run) {
      this._resetOrchestrationPreview();
      return;
    }
    if (this._runId !== run.runId) {
      this._slots.reset();
      this._baselines.clear();
      this._dirty.clear();
      this._playedTasks.clear();
      this._focused = false;
      this._runId = run.runId;
    }
    if (isActiveOrchestrationStatus(run.status)) {
      this._controller.ensureSplit();
      if (this._chatKey) {
        this._controller.setContext(dialecticLiveEditContextKey(this._chatKey, run.runId, run.runId));
      }
      void this._snapshotRunningTasks(run);
      return;
    }
    if (run.status === "reviewing" || run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      void this._playCompletedTasks(run);
      if (this._chatKey) {
        this._controller.finishContext(dialecticLiveEditContextKey(this._chatKey, run.runId, run.runId));
      }
    }
  }
  _resetOrchestrationPreview() {
    if (!this._runId && this._dirty.size === 0 && this._baselines.size === 0) {
      return;
    }
    this._fileScheduler.cancel();
    this._slots.reset();
    this._baselines.clear();
    this._dirty.clear();
    this._playedTasks.clear();
    this._focused = false;
    this._runId = void 0;
    this._controller.setContext(this._chatKey);
  }
  _onWorkspaceFilesChange(event) {
    if (!this._isDialectic()) {
      return;
    }
    const run = this._run();
    if (!run || run.status !== "running") {
      return;
    }
    for (const task of run.tasks) {
      if (task.status !== "running") {
        continue;
      }
      for (const file of [...task.files, ...task.result?.changedFiles ?? []]) {
        const resource = resolveWorkspaceFile(run.workspace, file);
        if (event.contains(resource, FileChangeType.UPDATED, FileChangeType.ADDED)) {
          this._dirty.add(resource.toString());
        }
      }
    }
    if (this._dirty.size > 0) {
      this._fileScheduler.schedule();
    }
  }
  async _snapshotRunningTasks(run) {
    const runId = run.runId;
    for (const task of run.tasks) {
      if (task.status !== "running" && task.status !== "queued") {
        continue;
      }
      for (const file of task.files) {
        const resource = resolveWorkspaceFile(run.workspace, file);
        const key = resource.toString();
        if (this._baselines.has(key)) {
          continue;
        }
        const baseline = await this._readText(resource);
        if (!this._isCurrentRun(runId)) {
          return;
        }
        this._baselines.set(key, baseline);
      }
    }
  }
  async _flushDirtyFiles() {
    const run = this._run();
    const chatKey = this._chatKey;
    if (!run || !chatKey || !this._isDialectic() || this._dirty.size === 0) {
      this._dirty.clear();
      return;
    }
    const dirty = [...this._dirty];
    this._dirty.clear();
    const contextKey = dialecticLiveEditContextKey(chatKey, run.runId, run.runId);
    const workerIds = workerProviderIds(run, this._assignment());
    for (const uriString of dirty) {
      const resource = URI.parse(uriString);
      const after = await this._readText(resource);
      if (!this._isCurrentRun(run.runId)) {
        return;
      }
      const before = this._baselines.get(uriString) ?? "";
      if (after === before) {
        continue;
      }
      const task = taskForFile(run, resource);
      this._controller.show({
        contextKey,
        chatKey,
        resource,
        snapshotUri: resource,
        originalContent: before,
        isFinal: task?.status === "completed" || task?.status === "escalated",
        takeFocus: !this._focused,
        pane: dialecticLiveEditPane(task?.workerProviderId ?? dialecticLiveEditSourceId(resource.fsPath, taskRefs(run)), workerIds, this._slots)
      });
      this._focused = true;
      this._baselines.set(uriString, after);
    }
  }
  async _playCompletedTasks(run) {
    const chatKey = this._chatKey;
    if (!chatKey) {
      return;
    }
    const contextKey = dialecticLiveEditContextKey(chatKey, run.runId, run.runId);
    const workerIds = workerProviderIds(run, this._assignment());
    for (const task of run.tasks) {
      const playKey = `${run.runId}:${task.id}:${task.attempt}`;
      if (this._playedTasks.has(playKey) || !task.result || task.result.changedFiles.length === 0) {
        continue;
      }
      if (task.status !== "completed" && task.status !== "escalated" && task.status !== "failed") {
        continue;
      }
      this._playedTasks.add(playKey);
      for (const file of task.result.changedFiles) {
        const resource = resolveWorkspaceFile(run.workspace, file);
        const key = resource.toString();
        const after = await this._readText(resource);
        if (!this._isCurrentRun(run.runId)) {
          return;
        }
        const before = this._baselines.get(key) ?? "";
        if (after === before) {
          continue;
        }
        this._controller.show({
          contextKey,
          chatKey,
          resource,
          snapshotUri: resource,
          originalContent: before,
          isFinal: true,
          takeFocus: !this._focused,
          pane: dialecticLiveEditPane(task.workerProviderId, workerIds, this._slots)
        });
        this._focused = true;
        this._baselines.set(key, after);
      }
    }
  }
  async _readText(resource) {
    try {
      return (await this._fileService.readFile(resource)).value.toString();
    } catch {
      return "";
    }
  }
  _isDialectic() {
    return readForgeWorkMode(this._configurationService.getValue(FORGE_WORK_MODE_SETTING_ID)) === "dialectic";
  }
  _run() {
    return readOrchestrationState(rootValues(this._agentHostService));
  }
  _isCurrentRun(runId) {
    return this._isDialectic() && this._runId === runId && this._run()?.runId === runId;
  }
  _assignment() {
    return readAssignment(rootValues(this._agentHostService)[FORGE_ORCHESTRATION_ASSIGNMENT_KEY]) ?? DEFAULT_ORCHESTRATION_ASSIGNMENT;
  }
};
ForgeCodexLiveEditContribution.ID = "workbench.contrib.forgeCodexLiveEdit";
ForgeCodexLiveEditContribution = __decorateClass([
  __decorateParam(0, IChatWidgetService),
  __decorateParam(1, IChatResponseFileChangesService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IAgentHostService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IInstantiationService)
], ForgeCodexLiveEditContribution);
function rootValues(agentHostService) {
  const state = agentHostService.rootState.value;
  if (!state || state instanceof Error) {
    return {};
  }
  return state.config?.values ?? {};
}
function workerProviderIds(run, assignment) {
  return (run?.assignment ?? assignment).workers.map((worker) => worker.providerId);
}
function taskRefs(run) {
  return (run?.tasks ?? []).map((task) => ({
    workerProviderId: task.workerProviderId,
    files: task.files,
    changedFiles: task.result?.changedFiles
  }));
}
function taskForFile(run, resource) {
  const path = resource.fsPath;
  return run.tasks.find((task) => dialecticLiveEditSourceId(path, [{
    workerProviderId: task.workerProviderId,
    files: task.files,
    changedFiles: task.result?.changedFiles
  }]) === task.workerProviderId);
}
function resolveWorkspaceFile(workspace, file) {
  return URI.file(isAbsolute(file) ? file : join(workspace, file));
}
function liveEditFilePath(uri) {
  const unwrapped = fromAgentHostUri(uri);
  return unwrapped.fsPath || unwrapped.path;
}
registerWorkbenchContribution2(ForgeCodexLiveEditContribution.ID, ForgeCodexLiveEditContribution, WorkbenchPhase.AfterRestored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZvcmdlXFxlbGVjdHJvbi1icm93c2VyXFxmb3JnZUNvZGV4TGl2ZUVkaXQuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNBYnNvbHV0ZSwgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGZyb21BZ2VudEhvc3RVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7XG5cdERFRkFVTFRfT1JDSEVTVFJBVElPTl9BU1NJR05NRU5ULFxuXHRGT1JHRV9PUkNIRVNUUkFUSU9OX0FTU0lHTk1FTlRfS0VZLFxuXHRpc0FjdGl2ZU9yY2hlc3RyYXRpb25TdGF0dXMsXG5cdHJlYWRBc3NpZ25tZW50LFxuXHRyZWFkT3JjaGVzdHJhdGlvblN0YXRlLFxuXHR0eXBlIElPcmNoZXN0cmF0aW9uUnVuU3RhdGUsXG5cdHR5cGUgSU9yY2hlc3RyYXRpb25UYXNrU3RhdGUsXG59IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vb3JjaGVzdHJhdGlvbi9vcmNoZXN0cmF0aW9uVHlwZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlVHlwZSwgRmlsZUNoYW5nZXNFdmVudCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UsIGlzSUNoYXRWaWV3Vmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBMaXZlRWRpdFByZXZpZXdDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2xpdmVFZGl0UHJldmlldy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZS5qcyc7XG5pbXBvcnQge1xuXHREaWFsZWN0aWNMaXZlRWRpdFNsb3RNYXAsXG5cdGRpYWxlY3RpY0xpdmVFZGl0Q29udGV4dEtleSxcblx0ZGlhbGVjdGljTGl2ZUVkaXRQYW5lLFxuXHRkaWFsZWN0aWNMaXZlRWRpdFNvdXJjZUlkLFxuXHR0eXBlIElEaWFsZWN0aWNMaXZlRWRpdFRhc2tSZWYsXG59IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2xpdmVFZGl0UHJldmlld1Nsb3RzLmpzJztcbmltcG9ydCB7IFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IEZPUkdFX1dPUktfTU9ERV9TRVRUSU5HX0lELCByZWFkRm9yZ2VXb3JrTW9kZSB9IGZyb20gJy4uL2NvbW1vbi9mb3JnZVdvcmtNb2RlLmpzJztcblxuLyoqIEZlZWRzIGxpdmUgQ29kZXggZmlsZSBzbmFwc2hvdHMgZnJvbSB0aGUgcmVndWxhciBzaWRlLWJhciBDaGF0IGludG8gdGhlIHNoYXJlZCBEaWZmIGNvbnRyb2xsZXIuICovXG5jbGFzcyBGb3JnZUNvZGV4TGl2ZUVkaXRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmZvcmdlQ29kZXhMaXZlRWRpdCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udHJvbGxlcjogTGl2ZUVkaXRQcmV2aWV3Q29udHJvbGxlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0U3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zbG90cyA9IG5ldyBEaWFsZWN0aWNMaXZlRWRpdFNsb3RNYXAoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYmFzZWxpbmVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlydHkgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGxheWVkVGFza3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsZVNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSBfY2hhdEtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9mb2N1c2VkID0gZmFsc2U7XG5cdHByaXZhdGUgX3J1bklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVDaGFuZ2VzU2VydmljZTogSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY29udHJvbGxlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExpdmVFZGl0UHJldmlld0NvbnRyb2xsZXIpKTtcblx0XHR0aGlzLl9maWxlU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4geyB2b2lkIHRoaXMuX2ZsdXNoRGlydHlGaWxlcygpOyB9LCA1MCkpO1xuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIGNoYXRXaWRnZXRTZXJ2aWNlLmdldEFsbFdpZGdldHMoKSkge1xuXHRcdFx0dGhpcy5fYmluZFdpZGdldCh3aWRnZXQpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3RlcihjaGF0V2lkZ2V0U2VydmljZS5vbkRpZEFkZFdpZGdldCh3aWRnZXQgPT4gdGhpcy5fYmluZFdpZGdldCh3aWRnZXQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWdlbnRIb3N0U2VydmljZS5yb290U3RhdGUub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fb25PcmNoZXN0cmF0aW9uQ2hhbmdlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihGT1JHRV9XT1JLX01PREVfU0VUVElOR19JRCkpIHtcblx0XHRcdFx0dGhpcy5fb25PcmNoZXN0cmF0aW9uQ2hhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB0aGlzLl9vbldvcmtzcGFjZUZpbGVzQ2hhbmdlKGUpKSk7XG5cdFx0dGhpcy5fb25PcmNoZXN0cmF0aW9uQ2hhbmdlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9iaW5kV2lkZ2V0KHdpZGdldDogSUNoYXRXaWRnZXQpOiB2b2lkIHtcblx0XHRpZiAoIWlzSUNoYXRWaWV3Vmlld0NvbnRleHQod2lkZ2V0LnZpZXdDb250ZXh0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbEJpbmRpbmcgPSB0aGlzLl93aWRnZXRTdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdFx0Y29uc3QgYmluZE1vZGVsID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRtb2RlbEJpbmRpbmcudmFsdWUgPSBzdG9yZTtcblx0XHRcdGNvbnN0IG1vZGVsID0gd2lkZ2V0LnZpZXdNb2RlbD8ubW9kZWw7XG5cdFx0XHRpZiAoIW1vZGVsIHx8IGdldENoYXRTZXNzaW9uVHlwZShtb2RlbC5zZXNzaW9uUmVzb3VyY2UpICE9PSBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb2RleCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjaGF0S2V5ID0gbW9kZWwuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHR0aGlzLl9jaGF0S2V5ID0gY2hhdEtleTtcblx0XHRcdHRoaXMuX2NvbnRyb2xsZXIuc2V0Q29udGV4dChjaGF0S2V5KTtcblx0XHRcdGxldCBhY3RpdmVSZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG9ic2VydmVkUmVxdWVzdHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGNvbnN0IHJlcXVlc3RCaW5kaW5nID0gc3RvcmUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRcdFx0Y29uc3QgYmluZFJlcXVlc3QgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRcdFx0aWYgKCFyZXF1ZXN0KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGRpYWxlY3RpYyA9IHRoaXMuX2lzRGlhbGVjdGljKCk7XG5cdFx0XHRcdGNvbnN0IHJ1biA9IGRpYWxlY3RpYyA/IHRoaXMuX3J1bigpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBydW5JZCA9IHJ1biAmJiBpc0FjdGl2ZU9yY2hlc3RyYXRpb25TdGF0dXMocnVuLnN0YXR1cykgPyBydW4ucnVuSWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChydW5JZCkge1xuXHRcdFx0XHRcdGlmIChvYnNlcnZlZFJlcXVlc3RzLmhhcyhyZXF1ZXN0LmlkKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChyZXF1ZXN0LmlkID09PSBhY3RpdmVSZXF1ZXN0SWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVxdWVzdEJpbmRpbmcudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0b2JzZXJ2ZWRSZXF1ZXN0cy5jbGVhcigpO1xuXHRcdFx0XHRcdHRoaXMuX3Nsb3RzLnJlc2V0KCk7XG5cdFx0XHRcdFx0dGhpcy5fZm9jdXNlZCA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFjdGl2ZVJlcXVlc3RJZCA9IHJlcXVlc3QuaWQ7XG5cdFx0XHRcdG9ic2VydmVkUmVxdWVzdHMuYWRkKHJlcXVlc3QuaWQpO1xuXHRcdFx0XHRjb25zdCBjb250ZXh0S2V5ID0gZGlhbGVjdGljTGl2ZUVkaXRDb250ZXh0S2V5KGNoYXRLZXksIHJ1bklkLCByZXF1ZXN0LmlkKTtcblx0XHRcdFx0dGhpcy5fY29udHJvbGxlci5zZXRDb250ZXh0KGNvbnRleHRLZXkpO1xuXHRcdFx0XHRpZiAoZGlhbGVjdGljKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29udHJvbGxlci5lbnN1cmVTcGxpdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVkaXRzT2JzZXJ2YWJsZSA9IHRoaXMuX2ZpbGVDaGFuZ2VzU2VydmljZS5nZXRGaWxlRWRpdHNGb3JSZXF1ZXN0Py4obW9kZWwuc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0LmlkKTtcblx0XHRcdFx0aWYgKCFlZGl0c09ic2VydmFibGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc2VlbiA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RTdG9yZSA9IHJ1bklkICYmIHJlcXVlc3RCaW5kaW5nLnZhbHVlID8gcmVxdWVzdEJpbmRpbmcudmFsdWUgOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdHJlcXVlc3RCaW5kaW5nLnZhbHVlID0gcmVxdWVzdFN0b3JlO1xuXHRcdFx0XHRyZXF1ZXN0U3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50RGlhbGVjdGljID0gdGhpcy5faXNEaWFsZWN0aWMoKTtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50UnVuID0gY3VycmVudERpYWxlY3RpYyA/IHRoaXMuX3J1bigpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRSdW5JZCA9IGN1cnJlbnRSdW4gJiYgaXNBY3RpdmVPcmNoZXN0cmF0aW9uU3RhdHVzKGN1cnJlbnRSdW4uc3RhdHVzKSA/IGN1cnJlbnRSdW4ucnVuSWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uc3QgbGl2ZUNvbnRleHRLZXkgPSBkaWFsZWN0aWNMaXZlRWRpdENvbnRleHRLZXkoY2hhdEtleSwgY3VycmVudFJ1bklkLCByZXF1ZXN0LmlkKTtcblx0XHRcdFx0XHRjb25zdCB0YXNrcyA9IHRhc2tSZWZzKGN1cnJlbnRSdW4pO1xuXHRcdFx0XHRcdGNvbnN0IHdvcmtlcklkcyA9IHdvcmtlclByb3ZpZGVySWRzKGN1cnJlbnRSdW4sIHRoaXMuX2Fzc2lnbm1lbnQoKSk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBlZGl0IG9mIGVkaXRzT2JzZXJ2YWJsZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRcdGlmIChlZGl0LmlzRGVsZXRlZCkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHNuYXBzaG90VXJpID0gZWRpdC5tb2RpZmllZFNuYXBzaG90VVJJO1xuXHRcdFx0XHRcdFx0aWYgKCFzbmFwc2hvdFVyaSB8fCBzZWVuLmdldChlZGl0Lm1vZGlmaWVkVVJJLnRvU3RyaW5nKCkpID09PSBzbmFwc2hvdFVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0c2Vlbi5zZXQoZWRpdC5tb2RpZmllZFVSSS50b1N0cmluZygpLCBzbmFwc2hvdFVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRcdGNvbnN0IHRha2VGb2N1cyA9ICF0aGlzLl9mb2N1c2VkO1xuXHRcdFx0XHRcdFx0dGhpcy5fZm9jdXNlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHR0aGlzLl9jb250cm9sbGVyLnNob3coe1xuXHRcdFx0XHRcdFx0XHRjb250ZXh0S2V5OiBsaXZlQ29udGV4dEtleSxcblx0XHRcdFx0XHRcdFx0Y2hhdEtleSxcblx0XHRcdFx0XHRcdFx0cmVzb3VyY2U6IGVkaXQubW9kaWZpZWRVUkksXG5cdFx0XHRcdFx0XHRcdG9yaWdpbmFsVXJpOiBlZGl0Lm9yaWdpbmFsVVJJLFxuXHRcdFx0XHRcdFx0XHRzbmFwc2hvdFVyaSxcblx0XHRcdFx0XHRcdFx0aXNGaW5hbDogZWRpdC5pc0VkaXRDb21wbGV0ZSA9PT0gdHJ1ZSxcblx0XHRcdFx0XHRcdFx0dGFrZUZvY3VzLFxuXHRcdFx0XHRcdFx0XHRwYW5lOiBjdXJyZW50RGlhbGVjdGljID8gZGlhbGVjdGljTGl2ZUVkaXRQYW5lKGRpYWxlY3RpY0xpdmVFZGl0U291cmNlSWQobGl2ZUVkaXRGaWxlUGF0aChlZGl0Lm1vZGlmaWVkVVJJKSwgdGFza3MpLCB3b3JrZXJJZHMsIHRoaXMuX3Nsb3RzKSA6ICdkaWZmJyxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRpZiAoIXJ1bklkKSB7XG5cdFx0XHRcdFx0cmVxdWVzdFN0b3JlLmFkZChtb2RlbC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5faXNEaWFsZWN0aWMoKSAmJiBpc0FjdGl2ZU9yY2hlc3RyYXRpb25TdGF0dXModGhpcy5fcnVuKCk/LnN0YXR1cykpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudCA9IG1vZGVsLmdldFJlcXVlc3RzKCkuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkID09PSByZXF1ZXN0LmlkKTtcblx0XHRcdFx0XHRcdGlmIChjdXJyZW50Py5yZXNwb25zZT8uaXNDb21wbGV0ZSB8fCBjdXJyZW50Py5yZXNwb25zZT8uaXNDYW5jZWxlZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb250cm9sbGVyLmZpbmlzaENvbnRleHQoZGlhbGVjdGljTGl2ZUVkaXRDb250ZXh0S2V5KGNoYXRLZXksIHVuZGVmaW5lZCwgcmVxdWVzdC5pZCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHN0b3JlLmFkZChtb2RlbC5vbkRpZENoYW5nZShiaW5kUmVxdWVzdCkpO1xuXHRcdFx0YmluZFJlcXVlc3QoKTtcblx0XHR9O1xuXHRcdHRoaXMuX3dpZGdldFN0b3JlLmFkZCh3aWRnZXQub25EaWRDaGFuZ2VWaWV3TW9kZWwoYmluZE1vZGVsKSk7XG5cdFx0YmluZE1vZGVsKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbk9yY2hlc3RyYXRpb25DaGFuZ2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0RpYWxlY3RpYygpKSB7XG5cdFx0XHR0aGlzLl9yZXNldE9yY2hlc3RyYXRpb25QcmV2aWV3KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJ1biA9IHRoaXMuX3J1bigpO1xuXHRcdGlmICghcnVuKSB7XG5cdFx0XHR0aGlzLl9yZXNldE9yY2hlc3RyYXRpb25QcmV2aWV3KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9ydW5JZCAhPT0gcnVuLnJ1bklkKSB7XG5cdFx0XHR0aGlzLl9zbG90cy5yZXNldCgpO1xuXHRcdFx0dGhpcy5fYmFzZWxpbmVzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9kaXJ0eS5jbGVhcigpO1xuXHRcdFx0dGhpcy5fcGxheWVkVGFza3MuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2ZvY3VzZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3J1bklkID0gcnVuLnJ1bklkO1xuXHRcdH1cblx0XHRpZiAoaXNBY3RpdmVPcmNoZXN0cmF0aW9uU3RhdHVzKHJ1bi5zdGF0dXMpKSB7XG5cdFx0XHR0aGlzLl9jb250cm9sbGVyLmVuc3VyZVNwbGl0KCk7XG5cdFx0XHRpZiAodGhpcy5fY2hhdEtleSkge1xuXHRcdFx0XHR0aGlzLl9jb250cm9sbGVyLnNldENvbnRleHQoZGlhbGVjdGljTGl2ZUVkaXRDb250ZXh0S2V5KHRoaXMuX2NoYXRLZXksIHJ1bi5ydW5JZCwgcnVuLnJ1bklkKSk7XG5cdFx0XHR9XG5cdFx0XHR2b2lkIHRoaXMuX3NuYXBzaG90UnVubmluZ1Rhc2tzKHJ1bik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChydW4uc3RhdHVzID09PSAncmV2aWV3aW5nJyB8fCBydW4uc3RhdHVzID09PSAnY29tcGxldGVkJyB8fCBydW4uc3RhdHVzID09PSAnZmFpbGVkJyB8fCBydW4uc3RhdHVzID09PSAnY2FuY2VsbGVkJykge1xuXHRcdFx0dm9pZCB0aGlzLl9wbGF5Q29tcGxldGVkVGFza3MocnVuKTtcblx0XHRcdGlmICh0aGlzLl9jaGF0S2V5KSB7XG5cdFx0XHRcdHRoaXMuX2NvbnRyb2xsZXIuZmluaXNoQ29udGV4dChkaWFsZWN0aWNMaXZlRWRpdENvbnRleHRLZXkodGhpcy5fY2hhdEtleSwgcnVuLnJ1bklkLCBydW4ucnVuSWQpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXNldE9yY2hlc3RyYXRpb25QcmV2aWV3KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fcnVuSWQgJiYgdGhpcy5fZGlydHkuc2l6ZSA9PT0gMCAmJiB0aGlzLl9iYXNlbGluZXMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9maWxlU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdHRoaXMuX3Nsb3RzLnJlc2V0KCk7XG5cdFx0dGhpcy5fYmFzZWxpbmVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fZGlydHkuY2xlYXIoKTtcblx0XHR0aGlzLl9wbGF5ZWRUYXNrcy5jbGVhcigpO1xuXHRcdHRoaXMuX2ZvY3VzZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9ydW5JZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jb250cm9sbGVyLnNldENvbnRleHQodGhpcy5fY2hhdEtleSk7XG5cdH1cblxuXHRwcml2YXRlIF9vbldvcmtzcGFjZUZpbGVzQ2hhbmdlKGV2ZW50OiBGaWxlQ2hhbmdlc0V2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0RpYWxlY3RpYygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJ1biA9IHRoaXMuX3J1bigpO1xuXHRcdGlmICghcnVuIHx8IHJ1bi5zdGF0dXMgIT09ICdydW5uaW5nJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgcnVuLnRhc2tzKSB7XG5cdFx0XHRpZiAodGFzay5zdGF0dXMgIT09ICdydW5uaW5nJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBbLi4udGFzay5maWxlcywgLi4uKHRhc2sucmVzdWx0Py5jaGFuZ2VkRmlsZXMgPz8gW10pXSkge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IHJlc29sdmVXb3Jrc3BhY2VGaWxlKHJ1bi53b3Jrc3BhY2UsIGZpbGUpO1xuXHRcdFx0XHRpZiAoZXZlbnQuY29udGFpbnMocmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKSkge1xuXHRcdFx0XHRcdHRoaXMuX2RpcnR5LmFkZChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5fZGlydHkuc2l6ZSA+IDApIHtcblx0XHRcdHRoaXMuX2ZpbGVTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zbmFwc2hvdFJ1bm5pbmdUYXNrcyhydW46IElPcmNoZXN0cmF0aW9uUnVuU3RhdGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBydW5JZCA9IHJ1bi5ydW5JZDtcblx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgcnVuLnRhc2tzKSB7XG5cdFx0XHRpZiAodGFzay5zdGF0dXMgIT09ICdydW5uaW5nJyAmJiB0YXNrLnN0YXR1cyAhPT0gJ3F1ZXVlZCcpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgdGFzay5maWxlcykge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IHJlc29sdmVXb3Jrc3BhY2VGaWxlKHJ1bi53b3Jrc3BhY2UsIGZpbGUpO1xuXHRcdFx0XHRjb25zdCBrZXkgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0XHRpZiAodGhpcy5fYmFzZWxpbmVzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYmFzZWxpbmUgPSBhd2FpdCB0aGlzLl9yZWFkVGV4dChyZXNvdXJjZSk7XG5cdFx0XHRcdGlmICghdGhpcy5faXNDdXJyZW50UnVuKHJ1bklkKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9iYXNlbGluZXMuc2V0KGtleSwgYmFzZWxpbmUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZsdXNoRGlydHlGaWxlcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBydW4gPSB0aGlzLl9ydW4oKTtcblx0XHRjb25zdCBjaGF0S2V5ID0gdGhpcy5fY2hhdEtleTtcblx0XHRpZiAoIXJ1biB8fCAhY2hhdEtleSB8fCAhdGhpcy5faXNEaWFsZWN0aWMoKSB8fCB0aGlzLl9kaXJ0eS5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLl9kaXJ0eS5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkaXJ0eSA9IFsuLi50aGlzLl9kaXJ0eV07XG5cdFx0dGhpcy5fZGlydHkuY2xlYXIoKTtcblx0XHRjb25zdCBjb250ZXh0S2V5ID0gZGlhbGVjdGljTGl2ZUVkaXRDb250ZXh0S2V5KGNoYXRLZXksIHJ1bi5ydW5JZCwgcnVuLnJ1bklkKTtcblx0XHRjb25zdCB3b3JrZXJJZHMgPSB3b3JrZXJQcm92aWRlcklkcyhydW4sIHRoaXMuX2Fzc2lnbm1lbnQoKSk7XG5cdFx0Zm9yIChjb25zdCB1cmlTdHJpbmcgb2YgZGlydHkpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKHVyaVN0cmluZyk7XG5cdFx0XHRjb25zdCBhZnRlciA9IGF3YWl0IHRoaXMuX3JlYWRUZXh0KHJlc291cmNlKTtcblx0XHRcdGlmICghdGhpcy5faXNDdXJyZW50UnVuKHJ1bi5ydW5JZCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYmVmb3JlID0gdGhpcy5fYmFzZWxpbmVzLmdldCh1cmlTdHJpbmcpID8/ICcnO1xuXHRcdFx0aWYgKGFmdGVyID09PSBiZWZvcmUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0YXNrID0gdGFza0ZvckZpbGUocnVuLCByZXNvdXJjZSk7XG5cdFx0XHR0aGlzLl9jb250cm9sbGVyLnNob3coe1xuXHRcdFx0XHRjb250ZXh0S2V5LFxuXHRcdFx0XHRjaGF0S2V5LFxuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0c25hcHNob3RVcmk6IHJlc291cmNlLFxuXHRcdFx0XHRvcmlnaW5hbENvbnRlbnQ6IGJlZm9yZSxcblx0XHRcdFx0aXNGaW5hbDogdGFzaz8uc3RhdHVzID09PSAnY29tcGxldGVkJyB8fCB0YXNrPy5zdGF0dXMgPT09ICdlc2NhbGF0ZWQnLFxuXHRcdFx0XHR0YWtlRm9jdXM6ICF0aGlzLl9mb2N1c2VkLFxuXHRcdFx0XHRwYW5lOiBkaWFsZWN0aWNMaXZlRWRpdFBhbmUodGFzaz8ud29ya2VyUHJvdmlkZXJJZCA/PyBkaWFsZWN0aWNMaXZlRWRpdFNvdXJjZUlkKHJlc291cmNlLmZzUGF0aCwgdGFza1JlZnMocnVuKSksIHdvcmtlcklkcywgdGhpcy5fc2xvdHMpLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9mb2N1c2VkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2Jhc2VsaW5lcy5zZXQodXJpU3RyaW5nLCBhZnRlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcGxheUNvbXBsZXRlZFRhc2tzKHJ1bjogSU9yY2hlc3RyYXRpb25SdW5TdGF0ZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRLZXkgPSB0aGlzLl9jaGF0S2V5O1xuXHRcdGlmICghY2hhdEtleSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb250ZXh0S2V5ID0gZGlhbGVjdGljTGl2ZUVkaXRDb250ZXh0S2V5KGNoYXRLZXksIHJ1bi5ydW5JZCwgcnVuLnJ1bklkKTtcblx0XHRjb25zdCB3b3JrZXJJZHMgPSB3b3JrZXJQcm92aWRlcklkcyhydW4sIHRoaXMuX2Fzc2lnbm1lbnQoKSk7XG5cdFx0Zm9yIChjb25zdCB0YXNrIG9mIHJ1bi50YXNrcykge1xuXHRcdFx0Y29uc3QgcGxheUtleSA9IGAke3J1bi5ydW5JZH06JHt0YXNrLmlkfToke3Rhc2suYXR0ZW1wdH1gO1xuXHRcdFx0aWYgKHRoaXMuX3BsYXllZFRhc2tzLmhhcyhwbGF5S2V5KSB8fCAhdGFzay5yZXN1bHQgfHwgdGFzay5yZXN1bHQuY2hhbmdlZEZpbGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0YXNrLnN0YXR1cyAhPT0gJ2NvbXBsZXRlZCcgJiYgdGFzay5zdGF0dXMgIT09ICdlc2NhbGF0ZWQnICYmIHRhc2suc3RhdHVzICE9PSAnZmFpbGVkJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3BsYXllZFRhc2tzLmFkZChwbGF5S2V5KTtcblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiB0YXNrLnJlc3VsdC5jaGFuZ2VkRmlsZXMpIHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSByZXNvbHZlV29ya3NwYWNlRmlsZShydW4ud29ya3NwYWNlLCBmaWxlKTtcblx0XHRcdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdFx0Y29uc3QgYWZ0ZXIgPSBhd2FpdCB0aGlzLl9yZWFkVGV4dChyZXNvdXJjZSk7XG5cdFx0XHRcdGlmICghdGhpcy5faXNDdXJyZW50UnVuKHJ1bi5ydW5JZCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYmVmb3JlID0gdGhpcy5fYmFzZWxpbmVzLmdldChrZXkpID8/ICcnO1xuXHRcdFx0XHRpZiAoYWZ0ZXIgPT09IGJlZm9yZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2NvbnRyb2xsZXIuc2hvdyh7XG5cdFx0XHRcdFx0Y29udGV4dEtleSxcblx0XHRcdFx0XHRjaGF0S2V5LFxuXHRcdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRcdHNuYXBzaG90VXJpOiByZXNvdXJjZSxcblx0XHRcdFx0XHRvcmlnaW5hbENvbnRlbnQ6IGJlZm9yZSxcblx0XHRcdFx0XHRpc0ZpbmFsOiB0cnVlLFxuXHRcdFx0XHRcdHRha2VGb2N1czogIXRoaXMuX2ZvY3VzZWQsXG5cdFx0XHRcdFx0cGFuZTogZGlhbGVjdGljTGl2ZUVkaXRQYW5lKHRhc2sud29ya2VyUHJvdmlkZXJJZCwgd29ya2VySWRzLCB0aGlzLl9zbG90cyksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLl9mb2N1c2VkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fYmFzZWxpbmVzLnNldChrZXksIGFmdGVyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkVGV4dChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIChhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaXNEaWFsZWN0aWMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHJlYWRGb3JnZVdvcmtNb2RlKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEZPUkdFX1dPUktfTU9ERV9TRVRUSU5HX0lEKSkgPT09ICdkaWFsZWN0aWMnO1xuXHR9XG5cblx0cHJpdmF0ZSBfcnVuKCk6IElPcmNoZXN0cmF0aW9uUnVuU3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiByZWFkT3JjaGVzdHJhdGlvblN0YXRlKHJvb3RWYWx1ZXModGhpcy5fYWdlbnRIb3N0U2VydmljZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNDdXJyZW50UnVuKHJ1bklkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNEaWFsZWN0aWMoKSAmJiB0aGlzLl9ydW5JZCA9PT0gcnVuSWQgJiYgdGhpcy5fcnVuKCk/LnJ1bklkID09PSBydW5JZDtcblx0fVxuXG5cdHByaXZhdGUgX2Fzc2lnbm1lbnQoKSB7XG5cdFx0cmV0dXJuIHJlYWRBc3NpZ25tZW50KHJvb3RWYWx1ZXModGhpcy5fYWdlbnRIb3N0U2VydmljZSlbRk9SR0VfT1JDSEVTVFJBVElPTl9BU1NJR05NRU5UX0tFWV0pID8/IERFRkFVTFRfT1JDSEVTVFJBVElPTl9BU1NJR05NRU5UO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJvb3RWYWx1ZXMoYWdlbnRIb3N0U2VydmljZTogSUFnZW50SG9zdFNlcnZpY2UpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG5cdGNvbnN0IHN0YXRlID0gYWdlbnRIb3N0U2VydmljZS5yb290U3RhdGUudmFsdWU7XG5cdGlmICghc3RhdGUgfHwgc3RhdGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdHJldHVybiB7fTtcblx0fVxuXHRyZXR1cm4gc3RhdGUuY29uZmlnPy52YWx1ZXMgPz8ge307XG59XG5cbmZ1bmN0aW9uIHdvcmtlclByb3ZpZGVySWRzKHJ1bjogSU9yY2hlc3RyYXRpb25SdW5TdGF0ZSB8IHVuZGVmaW5lZCwgYXNzaWdubWVudDogeyByZWFkb25seSB3b3JrZXJzOiByZWFkb25seSB7IHJlYWRvbmx5IHByb3ZpZGVySWQ6IHN0cmluZyB9W10gfSk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0cmV0dXJuIChydW4/LmFzc2lnbm1lbnQgPz8gYXNzaWdubWVudCkud29ya2Vycy5tYXAod29ya2VyID0+IHdvcmtlci5wcm92aWRlcklkKTtcbn1cblxuZnVuY3Rpb24gdGFza1JlZnMocnVuOiBJT3JjaGVzdHJhdGlvblJ1blN0YXRlIHwgdW5kZWZpbmVkKTogcmVhZG9ubHkgSURpYWxlY3RpY0xpdmVFZGl0VGFza1JlZltdIHtcblx0cmV0dXJuIChydW4/LnRhc2tzID8/IFtdKS5tYXAodGFzayA9PiAoe1xuXHRcdHdvcmtlclByb3ZpZGVySWQ6IHRhc2sud29ya2VyUHJvdmlkZXJJZCxcblx0XHRmaWxlczogdGFzay5maWxlcyxcblx0XHRjaGFuZ2VkRmlsZXM6IHRhc2sucmVzdWx0Py5jaGFuZ2VkRmlsZXMsXG5cdH0pKTtcbn1cblxuZnVuY3Rpb24gdGFza0ZvckZpbGUocnVuOiBJT3JjaGVzdHJhdGlvblJ1blN0YXRlLCByZXNvdXJjZTogVVJJKTogSU9yY2hlc3RyYXRpb25UYXNrU3RhdGUgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwYXRoID0gcmVzb3VyY2UuZnNQYXRoO1xuXHRyZXR1cm4gcnVuLnRhc2tzLmZpbmQodGFzayA9PiBkaWFsZWN0aWNMaXZlRWRpdFNvdXJjZUlkKHBhdGgsIFt7XG5cdFx0d29ya2VyUHJvdmlkZXJJZDogdGFzay53b3JrZXJQcm92aWRlcklkLFxuXHRcdGZpbGVzOiB0YXNrLmZpbGVzLFxuXHRcdGNoYW5nZWRGaWxlczogdGFzay5yZXN1bHQ/LmNoYW5nZWRGaWxlcyxcblx0fV0pID09PSB0YXNrLndvcmtlclByb3ZpZGVySWQpO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlV29ya3NwYWNlRmlsZSh3b3Jrc3BhY2U6IHN0cmluZywgZmlsZTogc3RyaW5nKTogVVJJIHtcblx0cmV0dXJuIFVSSS5maWxlKGlzQWJzb2x1dGUoZmlsZSkgPyBmaWxlIDogam9pbih3b3Jrc3BhY2UsIGZpbGUpKTtcbn1cblxuZnVuY3Rpb24gbGl2ZUVkaXRGaWxlUGF0aCh1cmk6IFVSSSk6IHN0cmluZyB7XG5cdGNvbnN0IHVud3JhcHBlZCA9IGZyb21BZ2VudEhvc3RVcmkodXJpKTtcblx0cmV0dXJuIHVud3JhcHBlZC5mc1BhdGggfHwgdW53cmFwcGVkLnBhdGg7XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihGb3JnZUNvZGV4TGl2ZUVkaXRDb250cmlidXRpb24uSUQsIEZvcmdlQ29kZXhMaXZlRWRpdENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsWUFBWSxpQkFBaUIseUJBQXlCO0FBQy9ELFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksWUFBWTtBQUNqQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEM7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BR007QUFDUCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFrQyxvQkFBb0I7QUFDL0QsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0Msc0JBQXNCO0FBQy9ELFNBQXNCLG9CQUFvQiw4QkFBOEI7QUFDeEUsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx1Q0FBdUM7QUFDaEQ7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FFTTtBQUNQLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNEJBQTRCLHlCQUF5QjtBQUc5RCxJQUFNLGlDQUFOLGNBQTZDLFdBQVc7QUFBQSxFQWN2RCxZQUNxQixtQkFDOEIscUJBQ1YsdUJBQ0osbUJBQ0wsY0FDUixzQkFDdEI7QUFDRCxVQUFNO0FBTjRDO0FBQ1Y7QUFDSjtBQUNMO0FBZmhDLFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksZ0JBQWdC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
