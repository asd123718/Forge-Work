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
import { Sequencer } from "../../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { constObservable, derived, derivedOpts, observableValue, transaction } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { toAgentHostUri } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { FileEditKind, ToolCallStatus } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { ChatEditingSessionState } from "../../../common/editing/chatEditingService.js";
import { fileEditsToExternalEdits } from "./stateToProgressAdapter.js";
let AgentHostSnapshotController = class extends Disposable {
  constructor(chatSessionResource, _connectionAuthority, _logService, _fileService) {
    super();
    this.chatSessionResource = chatSessionResource;
    this._connectionAuthority = _connectionAuthority;
    this._logService = _logService;
    this._fileService = _fileService;
    this.supportsKeepUndo = false;
    this.isGlobalEditingSession = false;
    this.state = constObservable(ChatEditingSessionState.Idle);
    this.entries = constObservable([]);
    this.requestDisablement = derivedOpts(
      { equalsFn: (a, b) => a.length === b.length && a.every((v, i) => v.requestId === b[i].requestId) },
      (reader) => {
        const currentIdx = this._currentCheckpointIndex.read(reader);
        const disabled = [];
        for (let i = currentIdx + 1; i < this._checkpoints.length; i++) {
          disabled.push({ requestId: this._checkpoints[i].requestId });
        }
        return disabled;
      }
    );
    this.canUndo = derived(this, (r) => this._currentCheckpointIndex.read(r) >= 0);
    this.canRedo = derived(this, (r) => this._currentCheckpointIndex.read(r) < this._checkpoints.length - 1);
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._checkpoints = [];
    this._currentCheckpointIndex = observableValue(this, -1);
    this._undoRedoSequencer = new Sequencer();
  }
  // ---- Hydration from protocol state --------------------------------------
  /**
   * Ensures a checkpoint exists for the given request. Called at the start
   * of every turn (and during history hydration) so {@link requestDisablement}
   * and {@link restoreSnapshot} can reference every request, even ones that
   * produce no file edits.
   *
   * Splices away stale checkpoints past the current index (undo branch
   * semantics) when a new request arrives after a checkpoint restore.
   */
  ensureRequestCheckpoint(requestId) {
    if (this._checkpoints.some((cp) => cp.requestId === requestId)) {
      return;
    }
    const currentIdx = this._currentCheckpointIndex.get();
    if (currentIdx < this._checkpoints.length - 1) {
      this._checkpoints.splice(currentIdx + 1);
    }
    this._checkpoints.push({ requestId, edits: [], seenToolCallIds: /* @__PURE__ */ new Set() });
    transaction((tx) => {
      this._currentCheckpointIndex.set(this._checkpoints.length - 1, tx);
    });
  }
  /**
   * Folds a completed tool call's file edits into the checkpoint for the
   * given request. Idempotent on `toolCallId`.
   */
  addToolCallEdits(requestId, tc) {
    if (tc.status !== ToolCallStatus.Completed) {
      return;
    }
    this.ensureRequestCheckpoint(requestId);
    const cp = this._checkpoints.find((c) => c.requestId === requestId);
    if (!cp || cp.seenToolCallIds.has(tc.toolCallId)) {
      return;
    }
    cp.seenToolCallIds.add(tc.toolCallId);
    const fileEdits = fileEditsToExternalEdits(tc);
    if (fileEdits.length === 0) {
      return;
    }
    const authority = this._connectionAuthority;
    for (const edit of fileEdits) {
      const resource = toAgentHostUri(edit.resource, authority);
      const entry = {
        kind: edit.kind,
        resource,
        originalResource: edit.originalResource ? toAgentHostUri(edit.originalResource, authority) : void 0,
        beforeContentUri: edit.beforeContentUri ? toAgentHostUri(edit.beforeContentUri, authority) : void 0,
        afterContentUri: edit.afterContentUri ? toAgentHostUri(edit.afterContentUri, authority) : void 0,
        undoStopId: edit.undoStopId,
        diff: edit.diff
      };
      const existingIdx = cp.edits.findIndex((e) => e.resource.toString() === resource.toString());
      if (existingIdx < 0) {
        cp.edits.push(entry);
      } else {
        cp.edits[existingIdx] = mergeFileEdit(cp.edits[existingIdx], entry);
      }
    }
  }
  // ---- Snapshots ----------------------------------------------------------
  _findCheckpointIndex(requestId) {
    return this._checkpoints.findIndex((cp) => cp.requestId === requestId);
  }
  async restoreSnapshot(requestId, _stopId) {
    return this._undoRedoSequencer.queue(async () => {
      const cpIdx = this._findCheckpointIndex(requestId);
      if (cpIdx < 0) {
        this._logService.warn(`[AgentHostSnapshotController] No checkpoint found for requestId=${requestId}`);
        return;
      }
      await this._navigateToCheckpointIndex(cpIdx - 1);
    });
  }
  /**
   * Steps a single checkpoint backwards, undoing the edits of the current
   * checkpoint. The "Undo" UI invokes this once per click.
   */
  async undoInteraction() {
    return this._undoRedoSequencer.queue(async () => {
      const currentIdx = this._currentCheckpointIndex.get();
      if (currentIdx < 0) {
        return;
      }
      await this._navigateToCheckpointIndex(currentIdx - 1);
    });
  }
  /**
   * Steps a single checkpoint forwards, redoing the edits of the next
   * checkpoint.
   *
   * Implementing this is essential: the "Redo" action repeatedly calls this
   * while {@link canRedo} is `true`, so a no-op implementation would spin
   * forever and hang the window.
   */
  async redoInteraction() {
    return this._undoRedoSequencer.queue(async () => {
      const currentIdx = this._currentCheckpointIndex.get();
      if (currentIdx >= this._checkpoints.length - 1) {
        return;
      }
      await this._navigateToCheckpointIndex(currentIdx + 1);
    });
  }
  /**
   * Moves the on-disk file state and the checkpoint cursor to `targetIdx`,
   * writing each crossed checkpoint's before/after content. Must run inside
   * the {@link _undoRedoSequencer} to avoid racing writes.
   */
  async _navigateToCheckpointIndex(targetIdx) {
    const currentIdx = this._currentCheckpointIndex.get();
    if (targetIdx < currentIdx) {
      for (let i = currentIdx; i > targetIdx; i--) {
        await this._writeCheckpointContent(this._checkpoints[i], "before");
      }
    } else if (targetIdx > currentIdx) {
      for (let i = currentIdx + 1; i <= targetIdx; i++) {
        await this._writeCheckpointContent(this._checkpoints[i], "after");
      }
    }
    transaction((tx) => {
      this._currentCheckpointIndex.set(targetIdx, tx);
    });
  }
  getSnapshotUri(requestId, uri, _stopId) {
    const cp = this._checkpoints.find((c) => c.requestId === requestId);
    if (!cp || !cp.edits.some((e) => e.resource.toString() === uri.toString())) {
      return void 0;
    }
    return URI.from({
      scheme: Schemas.chatEditingSnapshotScheme,
      path: uri.path,
      query: JSON.stringify({ session: this.chatSessionResource.toString(), requestId, undoStop: "" })
    });
  }
  async getSnapshotContents(requestId, uri, _stopId) {
    const cp = this._checkpoints.find((c) => c.requestId === requestId);
    if (!cp) {
      return void 0;
    }
    const uriStr = uri.toString();
    let edit;
    for (let i = cp.edits.length - 1; i >= 0; i--) {
      if (cp.edits[i].resource.toString() === uriStr) {
        edit = cp.edits[i];
        break;
      }
    }
    if (!edit) {
      return void 0;
    }
    try {
      if (!edit.afterContentUri) {
        return VSBuffer.fromByteArray([]);
      }
      const content = await this._fileService.readFile(edit.afterContentUri);
      return content.value;
    } catch (err) {
      this._logService.warn(`[AgentHostSnapshotController] Failed to fetch snapshot content`, err);
      return void 0;
    }
  }
  async getSnapshotModel(_requestId, _undoStop, _snapshotUri) {
    return null;
  }
  hasEditsInRequest(requestId, _reader) {
    const cp = this._checkpoints.find((c) => c.requestId === requestId);
    return !!cp && cp.edits.length > 0;
  }
  // ---- Unsupported / no-op (agent host owns edits server-side) ------------
  async show(_previousChanges) {
  }
  getEntry(_uri) {
    return void 0;
  }
  readEntry(_uri, _reader) {
    return void 0;
  }
  async accept(..._uris) {
  }
  async reject(..._uris) {
  }
  getEntryDiffBetweenStops(_uri, _requestId, _stopId) {
    return void 0;
  }
  getEntryDiffBetweenRequests(_uri, _startRequestId, _stopRequestId) {
    return constObservable(void 0);
  }
  getDiffsForFilesInSession() {
    return constObservable([]);
  }
  getDiffsForFilesInRequest(_requestId) {
    return constObservable([]);
  }
  getDiffForSession() {
    return constObservable({ added: 0, removed: 0 });
  }
  async triggerExplanationGeneration() {
  }
  clearExplanations() {
  }
  hasExplanations() {
    return false;
  }
  startStreamingEdits(_resource, _responseModel, _inUndoStop) {
    throw new Error("Not supported for agent host sessions");
  }
  applyWorkspaceEdit(_edit, _responseModel, _undoStopId) {
    throw new Error("Not supported for agent host sessions");
  }
  async startExternalEdits(_responseModel, _operationId, _resources, _undoStopId, _contentFor) {
    throw new Error("Not supported for agent host sessions");
  }
  async stopExternalEdits(_responseModel, _operationId, _contentFor) {
    throw new Error("Not supported for agent host sessions");
  }
  // ---- Stop / Dispose -----------------------------------------------------
  async stop(_clearState) {
    this.dispose();
  }
  dispose() {
    this._onDidDispose.fire();
    super.dispose();
  }
  // ---- Private helpers ----------------------------------------------------
  async _writeCheckpointContent(checkpoint, direction) {
    const ops = checkpoint.edits.map(async (edit) => {
      try {
        if (direction === "before") {
          switch (edit.kind) {
            case FileEditKind.Create:
              await this._fileService.del(edit.resource);
              break;
            case FileEditKind.Delete:
              if (edit.beforeContentUri) {
                const content = await this._fileService.readFile(edit.beforeContentUri);
                await this._fileService.writeFile(edit.resource, content.value);
              }
              break;
            case FileEditKind.Rename:
              if (edit.originalResource) {
                await this._fileService.move(edit.resource, edit.originalResource, true);
              }
              if (edit.beforeContentUri && edit.originalResource) {
                const content = await this._fileService.readFile(edit.beforeContentUri);
                await this._fileService.writeFile(edit.originalResource, content.value);
              }
              break;
            case FileEditKind.Edit:
              if (edit.beforeContentUri) {
                const content = await this._fileService.readFile(edit.beforeContentUri);
                await this._fileService.writeFile(edit.resource, content.value);
              }
              break;
          }
        } else {
          switch (edit.kind) {
            case FileEditKind.Create:
              if (edit.afterContentUri) {
                const content = await this._fileService.readFile(edit.afterContentUri);
                await this._fileService.writeFile(edit.resource, content.value);
              }
              break;
            case FileEditKind.Delete:
              await this._fileService.del(edit.resource);
              break;
            case FileEditKind.Rename:
              if (edit.originalResource) {
                await this._fileService.move(edit.originalResource, edit.resource, true);
              }
              if (edit.afterContentUri) {
                const content = await this._fileService.readFile(edit.afterContentUri);
                await this._fileService.writeFile(edit.resource, content.value);
              }
              break;
            case FileEditKind.Edit:
              if (edit.afterContentUri) {
                const content = await this._fileService.readFile(edit.afterContentUri);
                await this._fileService.writeFile(edit.resource, content.value);
              }
              break;
          }
        }
      } catch (err) {
        this._logService.warn(`[AgentHostSnapshotController] Failed to ${direction === "before" ? "undo" : "redo"} ${edit.kind} for ${edit.resource.toString()}`, err);
      }
    });
    await Promise.all(ops);
  }
};
AgentHostSnapshotController = __decorateClass([
  __decorateParam(2, ILogService),
  __decorateParam(3, IFileService)
], AgentHostSnapshotController);
function mergeFileEdit(prev, next) {
  const startsAbsent = prev.kind === FileEditKind.Create;
  const endsAbsent = next.kind === FileEditKind.Delete;
  let kind;
  if (startsAbsent && endsAbsent) {
    kind = FileEditKind.Edit;
  } else if (startsAbsent) {
    kind = FileEditKind.Create;
  } else if (endsAbsent) {
    kind = FileEditKind.Delete;
  } else {
    kind = FileEditKind.Edit;
  }
  return {
    kind,
    resource: next.resource,
    // Renames within a single request are uncommon; if the second edit
    // is itself a rename keep its originalResource, otherwise carry
    // forward the first one.
    originalResource: next.originalResource ?? prev.originalResource,
    beforeContentUri: prev.beforeContentUri,
    afterContentUri: next.afterContentUri,
    undoStopId: prev.undoStopId,
    diff: next.diff ?? prev.diff
  };
}
export {
  AgentHostSnapshotController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcYWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2VxdWVuY2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgdG9BZ2VudEhvc3RVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBGaWxlRWRpdEtpbmQsIFRvb2xDYWxsU3RhdHVzLCB0eXBlIFRvb2xDYWxsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFByb2dyZXNzLCBJQ2hhdFdvcmtzcGFjZUVkaXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUsIElDaGF0RWRpdGluZ1Nlc3Npb24sIElFZGl0U2Vzc2lvbkRpZmZTdGF0cywgSUVkaXRTZXNzaW9uRW50cnlEaWZmLCBJTW9kaWZpZWRGaWxlRW50cnksIElTdHJlYW1pbmdFZGl0cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3REaXNhYmxlbWVudCwgSUNoYXRSZXNwb25zZU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBmaWxlRWRpdHNUb0V4dGVybmFsRWRpdHMsIHR5cGUgSVRvb2xDYWxsRmlsZUVkaXQgfSBmcm9tICcuL3N0YXRlVG9Qcm9ncmVzc0FkYXB0ZXIuanMnO1xuXG4vKipcbiAqIE9uZSBjaGVja3BvaW50IHBlciByZXF1ZXN0LiBBY2N1bXVsYXRlcyB0aGUgYmVmb3JlL2FmdGVyIGNvbnRlbnQgVVJJcyBvZlxuICogZXZlcnkgY29tcGxldGVkIHRvb2wgY2FsbCdzIGZpbGUgZWRpdHMgc28gdGhlIHJlcXVlc3QncyBlZGl0cyBjYW4gYmVcbiAqIHVuZG9uZS9yZWRvbmUgb24gZGlzayBkdXJpbmcge0BsaW5rIEFnZW50SG9zdFNuYXBzaG90Q29udHJvbGxlci5yZXN0b3JlU25hcHNob3R9LlxuICovXG5pbnRlcmZhY2UgSUFnZW50SG9zdENoZWNrcG9pbnQge1xuXHRyZWFkb25seSByZXF1ZXN0SWQ6IHN0cmluZztcblx0cmVhZG9ubHkgZWRpdHM6IElUb29sQ2FsbEZpbGVFZGl0W107XG5cdC8qKiBUb29sLWNhbGwgSURzIHdob3NlIGVkaXRzIGhhdmUgYWxyZWFkeSBiZWVuIGZvbGRlZCBpbnRvIGBlZGl0c2AuICovXG5cdHJlYWRvbmx5IHNlZW5Ub29sQ2FsbElkczogU2V0PHN0cmluZz47XG59XG5cbi8qKlxuICogQSB0aGluIHtAbGluayBJQ2hhdEVkaXRpbmdTZXNzaW9ufSBmb3IgYWdlbnQgaG9zdCBzZXNzaW9ucy4gVGhlIGFnZW50IGhvc3RcbiAqIGhhcyBpdHMgb3duIGRpZmYgLyBjaGFuZ2VzZXQgbWFjaGluZXJ5IGFuZCByZW5kZXJzIGZpbGUgZWRpdHMgdmlhIHRoZVxuICogZGVkaWNhdGVkIHtAbGluayBJQ2hhdEV4dGVybmFsRWRpdH0gcHJvZ3Jlc3MgcGFydCBcdTIwMTQgc28gdGhpcyBzZXNzaW9uIG9ubHlcbiAqIG5lZWRzIHRvIHN1cHBvcnQgdGhlIGNoYXQtbGV2ZWwgXCJyZXN0b3JlIHRvIGNoZWNrcG9pbnRcIiBVWC5cbiAqXG4gKiBDb25jcmV0ZWx5IGl0IGltcGxlbWVudHM6XG4gKiAtIHtAbGluayByZXN0b3JlU25hcHNob3R9ICh3cml0ZXMgYmVmb3JlL2FmdGVyIGNvbnRlbnQgdG8gZGlzaylcbiAqIC0ge0BsaW5rIHJlcXVlc3REaXNhYmxlbWVudH0gKHNvIGRpc2FibGVkLXJlcXVlc3QgVUkgd29ya3MgYWZ0ZXIgcmVzdG9yZSlcbiAqIC0ge0BsaW5rIGdldFNuYXBzaG90VXJpfSAvIHtAbGluayBnZXRTbmFwc2hvdENvbnRlbnRzfSAoc28gY2hlY2twb2ludCBkaWZmXG4gKiAgIHZpZXdlcnMgY2FuIHJlc29sdmUgaGlzdG9yaWNhbCBjb250ZW50KVxuICpcbiAqIEV2ZXJ5dGhpbmcgZWxzZSBpcyBhIG5vLW9wIC8gZW1wdHkgb2JzZXJ2YWJsZSAvIGB1bmRlZmluZWRgLiBJbiBwYXJ0aWN1bGFyOlxuICogLSBgZW50cmllc2AgaXMgYWx3YXlzIGVtcHR5IFx1MjE5MiB0aGUgZ2xvYmFsIGFjY2VwdC9yZWplY3QgVUkgZG9lc24ndCBhcHBlYXJcbiAqIC0gbm8gZGlmZiBjb21wdXRhdGlvbiwgbm8gbXVsdGktZGlmZiBlZGl0b3IsIG5vIHN0cmVhbWluZy1lZGl0cyBBUElzXG4gKlxuICogVW5kby9yZWRvIGdyYW51bGFyaXR5IGlzIHBlci1yZXF1ZXN0OiBldmVyeSByZXF1ZXN0IG9jY3VwaWVzIG9uZSBjaGVja3BvaW50XG4gKiByZWdhcmRsZXNzIG9mIGhvdyBtYW55IHRvb2wgY2FsbHMgaXQgcmFuLiBUaGUgYHN0b3BJZGAgcGFyYW1ldGVycyBvblxuICoge0BsaW5rIHJlc3RvcmVTbmFwc2hvdH0sIHtAbGluayBnZXRTbmFwc2hvdFVyaX0sIGFuZCB7QGxpbmsgZ2V0U25hcHNob3RDb250ZW50c31cbiAqIGFyZSBhY2NlcHRlZCBmb3IgaW50ZXJmYWNlIGNvbXBhdGliaWxpdHkgYnV0IGlnbm9yZWQuXG4gKlxuICogSHlkcmF0ZWQgYnkgdGhlIHNlc3Npb24gaGFuZGxlciB2aWEge0BsaW5rIGVuc3VyZVJlcXVlc3RDaGVja3BvaW50fSBhbmRcbiAqIHtAbGluayBhZGRUb29sQ2FsbEVkaXRzfSBhcyB0dXJucyBhbmQgdG9vbCBjYWxscyBhcnJpdmUuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRFZGl0aW5nU2Vzc2lvbiB7XG5cblx0cmVhZG9ubHkgc3VwcG9ydHNLZWVwVW5kbyA9IGZhbHNlO1xuXHRyZWFkb25seSBpc0dsb2JhbEVkaXRpbmdTZXNzaW9uID0gZmFsc2U7XG5cblx0cmVhZG9ubHkgc3RhdGU6IElPYnNlcnZhYmxlPENoYXRFZGl0aW5nU2Vzc2lvblN0YXRlPiA9IGNvbnN0T2JzZXJ2YWJsZShDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZS5JZGxlKTtcblx0cmVhZG9ubHkgZW50cmllczogSU9ic2VydmFibGU8cmVhZG9ubHkgSU1vZGlmaWVkRmlsZUVudHJ5W10+ID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblxuXHRyZWFkb25seSByZXF1ZXN0RGlzYWJsZW1lbnQ6IElPYnNlcnZhYmxlPElDaGF0UmVxdWVzdERpc2FibGVtZW50W10+ID0gZGVyaXZlZE9wdHMoXG5cdFx0eyBlcXVhbHNGbjogKGEsIGIpID0+IGEubGVuZ3RoID09PSBiLmxlbmd0aCAmJiBhLmV2ZXJ5KCh2LCBpKSA9PiB2LnJlcXVlc3RJZCA9PT0gYltpXS5yZXF1ZXN0SWQpIH0sXG5cdFx0cmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRJZHggPSB0aGlzLl9jdXJyZW50Q2hlY2twb2ludEluZGV4LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGRpc2FibGVkOiBJQ2hhdFJlcXVlc3REaXNhYmxlbWVudFtdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gY3VycmVudElkeCArIDE7IGkgPCB0aGlzLl9jaGVja3BvaW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRkaXNhYmxlZC5wdXNoKHsgcmVxdWVzdElkOiB0aGlzLl9jaGVja3BvaW50c1tpXS5yZXF1ZXN0SWQgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZGlzYWJsZWQ7XG5cdFx0fSxcblx0KTtcblxuXHRyZWFkb25seSBjYW5VbmRvOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IGRlcml2ZWQodGhpcywgciA9PiB0aGlzLl9jdXJyZW50Q2hlY2twb2ludEluZGV4LnJlYWQocikgPj0gMCk7XG5cdHJlYWRvbmx5IGNhblJlZG86IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gZGVyaXZlZCh0aGlzLCByID0+IHRoaXMuX2N1cnJlbnRDaGVja3BvaW50SW5kZXgucmVhZChyKSA8IHRoaXMuX2NoZWNrcG9pbnRzLmxlbmd0aCAtIDEpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWREaXNwb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoZWNrcG9pbnRzOiBJQWdlbnRIb3N0Q2hlY2twb2ludFtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRDaGVja3BvaW50SW5kZXggPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPih0aGlzLCAtMSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VuZG9SZWRvU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8vIC0tLS0gSHlkcmF0aW9uIGZyb20gcHJvdG9jb2wgc3RhdGUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogRW5zdXJlcyBhIGNoZWNrcG9pbnQgZXhpc3RzIGZvciB0aGUgZ2l2ZW4gcmVxdWVzdC4gQ2FsbGVkIGF0IHRoZSBzdGFydFxuXHQgKiBvZiBldmVyeSB0dXJuIChhbmQgZHVyaW5nIGhpc3RvcnkgaHlkcmF0aW9uKSBzbyB7QGxpbmsgcmVxdWVzdERpc2FibGVtZW50fVxuXHQgKiBhbmQge0BsaW5rIHJlc3RvcmVTbmFwc2hvdH0gY2FuIHJlZmVyZW5jZSBldmVyeSByZXF1ZXN0LCBldmVuIG9uZXMgdGhhdFxuXHQgKiBwcm9kdWNlIG5vIGZpbGUgZWRpdHMuXG5cdCAqXG5cdCAqIFNwbGljZXMgYXdheSBzdGFsZSBjaGVja3BvaW50cyBwYXN0IHRoZSBjdXJyZW50IGluZGV4ICh1bmRvIGJyYW5jaFxuXHQgKiBzZW1hbnRpY3MpIHdoZW4gYSBuZXcgcmVxdWVzdCBhcnJpdmVzIGFmdGVyIGEgY2hlY2twb2ludCByZXN0b3JlLlxuXHQgKi9cblx0ZW5zdXJlUmVxdWVzdENoZWNrcG9pbnQocmVxdWVzdElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBJZGVtcG90ZW50IG9uIGV4aXN0aW5nIHJlcXVlc3RzLlxuXHRcdGlmICh0aGlzLl9jaGVja3BvaW50cy5zb21lKGNwID0+IGNwLnJlcXVlc3RJZCA9PT0gcmVxdWVzdElkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNwbGljZSB0aGUgZm9yd2FyZCBicmFuY2ggd2hlbiBzdGFydGluZyBhIGJyYW5kLW5ldyByZXF1ZXN0IGFmdGVyXG5cdFx0Ly8gdGhlIHVzZXIgcmVzdG9yZWQgYSBjaGVja3BvaW50LlxuXHRcdGNvbnN0IGN1cnJlbnRJZHggPSB0aGlzLl9jdXJyZW50Q2hlY2twb2ludEluZGV4LmdldCgpO1xuXHRcdGlmIChjdXJyZW50SWR4IDwgdGhpcy5fY2hlY2twb2ludHMubGVuZ3RoIC0gMSkge1xuXHRcdFx0dGhpcy5fY2hlY2twb2ludHMuc3BsaWNlKGN1cnJlbnRJZHggKyAxKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jaGVja3BvaW50cy5wdXNoKHsgcmVxdWVzdElkLCBlZGl0czogW10sIHNlZW5Ub29sQ2FsbElkczogbmV3IFNldCgpIH0pO1xuXG5cdFx0Ly8gQWR2YW5jZSB0aGUgY3Vyc29yIHRvIHRoZSBuZXcgY2hlY2twb2ludC4gT3RoZXJ3aXNlIHRoZSBqdXN0LWFkZGVkXG5cdFx0Ly8gcmVxdWVzdCB3b3VsZCBhcHBlYXIgaW4gcmVxdWVzdERpc2FibGVtZW50IChpdCB3b3VsZCBzaXQgZm9yd2FyZCBvZlxuXHRcdC8vIHRoZSBjdXJzb3IpIGFuZCB0aGUgY2hhdCBVSSB3b3VsZCByZW5kZXIgaXQgYXMgYSBkaXNhYmxlZCB0dXJuLlxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX2N1cnJlbnRDaGVja3BvaW50SW5kZXguc2V0KHRoaXMuX2NoZWNrcG9pbnRzLmxlbmd0aCAtIDEsIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb2xkcyBhIGNvbXBsZXRlZCB0b29sIGNhbGwncyBmaWxlIGVkaXRzIGludG8gdGhlIGNoZWNrcG9pbnQgZm9yIHRoZVxuXHQgKiBnaXZlbiByZXF1ZXN0LiBJZGVtcG90ZW50IG9uIGB0b29sQ2FsbElkYC5cblx0ICovXG5cdGFkZFRvb2xDYWxsRWRpdHMocmVxdWVzdElkOiBzdHJpbmcsIHRjOiBUb29sQ2FsbFN0YXRlKTogdm9pZCB7XG5cdFx0aWYgKHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lbnN1cmVSZXF1ZXN0Q2hlY2twb2ludChyZXF1ZXN0SWQpO1xuXG5cdFx0Y29uc3QgY3AgPSB0aGlzLl9jaGVja3BvaW50cy5maW5kKGMgPT4gYy5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZCk7XG5cdFx0aWYgKCFjcCB8fCBjcC5zZWVuVG9vbENhbGxJZHMuaGFzKHRjLnRvb2xDYWxsSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNwLnNlZW5Ub29sQ2FsbElkcy5hZGQodGMudG9vbENhbGxJZCk7XG5cblx0XHRjb25zdCBmaWxlRWRpdHMgPSBmaWxlRWRpdHNUb0V4dGVybmFsRWRpdHModGMpO1xuXHRcdGlmIChmaWxlRWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV0aG9yaXR5ID0gdGhpcy5fY29ubmVjdGlvbkF1dGhvcml0eTtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgZmlsZUVkaXRzKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHRvQWdlbnRIb3N0VXJpKGVkaXQucmVzb3VyY2UsIGF1dGhvcml0eSk7XG5cdFx0XHRjb25zdCBlbnRyeTogSVRvb2xDYWxsRmlsZUVkaXQgPSB7XG5cdFx0XHRcdGtpbmQ6IGVkaXQua2luZCxcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdG9yaWdpbmFsUmVzb3VyY2U6IGVkaXQub3JpZ2luYWxSZXNvdXJjZSA/IHRvQWdlbnRIb3N0VXJpKGVkaXQub3JpZ2luYWxSZXNvdXJjZSwgYXV0aG9yaXR5KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0YmVmb3JlQ29udGVudFVyaTogZWRpdC5iZWZvcmVDb250ZW50VXJpID8gdG9BZ2VudEhvc3RVcmkoZWRpdC5iZWZvcmVDb250ZW50VXJpLCBhdXRob3JpdHkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRhZnRlckNvbnRlbnRVcmk6IGVkaXQuYWZ0ZXJDb250ZW50VXJpID8gdG9BZ2VudEhvc3RVcmkoZWRpdC5hZnRlckNvbnRlbnRVcmksIGF1dGhvcml0eSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVuZG9TdG9wSWQ6IGVkaXQudW5kb1N0b3BJZCxcblx0XHRcdFx0ZGlmZjogZWRpdC5kaWZmLFxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gTXVsdGlwbGUgdG9vbCBjYWxscyBpbiBvbmUgcmVxdWVzdCBtYXkgdG91Y2ggdGhlIHNhbWUgZmlsZVxuXHRcdFx0Ly8gKGUuZy4gY3JlYXRlXHUyMTkyZWRpdCwgZWRpdFx1MjE5MmRlbGV0ZSkuIEZvbGQgZWFjaCBuZXcgZWRpdCBpbnRvIHRoZVxuXHRcdFx0Ly8gcHJpb3Igb25lIGZvciB0aGUgc2FtZSByZXNvdXJjZSBzbyB0aGUgY2hlY2twb2ludCBzdG9yZXMgYVxuXHRcdFx0Ly8gc2luZ2xlIG5ldCBiZWZvcmUvYWZ0ZXIgcGFpciBwZXIgZmlsZS4gT3RoZXJ3aXNlXG5cdFx0XHQvLyBfd3JpdGVDaGVja3BvaW50Q29udGVudCB3b3VsZCBhcHBseSBkdXBsaWNhdGUgd3JpdGVzIGluXG5cdFx0XHQvLyBwYXJhbGxlbCBhbmQgcmFjZSB0byBsZWF2ZSB0aGUgZmlsZSBpbiBhbiB1bmRlZmluZWQgc3RhdGUuXG5cdFx0XHRjb25zdCBleGlzdGluZ0lkeCA9IGNwLmVkaXRzLmZpbmRJbmRleChlID0+IGUucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoZXhpc3RpbmdJZHggPCAwKSB7XG5cdFx0XHRcdGNwLmVkaXRzLnB1c2goZW50cnkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y3AuZWRpdHNbZXhpc3RpbmdJZHhdID0gbWVyZ2VGaWxlRWRpdChjcC5lZGl0c1tleGlzdGluZ0lkeF0sIGVudHJ5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIFNuYXBzaG90cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfZmluZENoZWNrcG9pbnRJbmRleChyZXF1ZXN0SWQ6IHN0cmluZyk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoZWNrcG9pbnRzLmZpbmRJbmRleChjcCA9PiBjcC5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZCk7XG5cdH1cblxuXHRhc3luYyByZXN0b3JlU25hcHNob3QocmVxdWVzdElkOiBzdHJpbmcsIF9zdG9wSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl91bmRvUmVkb1NlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjcElkeCA9IHRoaXMuX2ZpbmRDaGVja3BvaW50SW5kZXgocmVxdWVzdElkKTtcblx0XHRcdGlmIChjcElkeCA8IDApIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyXSBObyBjaGVja3BvaW50IGZvdW5kIGZvciByZXF1ZXN0SWQ9JHtyZXF1ZXN0SWR9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzdG9yZSB0byBiZWZvcmUgdGhpcyByZXF1ZXN0OiB0YXJnZXQgb25lIHNsb3QgYmVmb3JlIGl0LlxuXHRcdFx0YXdhaXQgdGhpcy5fbmF2aWdhdGVUb0NoZWNrcG9pbnRJbmRleChjcElkeCAtIDEpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0ZXBzIGEgc2luZ2xlIGNoZWNrcG9pbnQgYmFja3dhcmRzLCB1bmRvaW5nIHRoZSBlZGl0cyBvZiB0aGUgY3VycmVudFxuXHQgKiBjaGVja3BvaW50LiBUaGUgXCJVbmRvXCIgVUkgaW52b2tlcyB0aGlzIG9uY2UgcGVyIGNsaWNrLlxuXHQgKi9cblx0YXN5bmMgdW5kb0ludGVyYWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl91bmRvUmVkb1NlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50SWR4ID0gdGhpcy5fY3VycmVudENoZWNrcG9pbnRJbmRleC5nZXQoKTtcblx0XHRcdGlmIChjdXJyZW50SWR4IDwgMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9uYXZpZ2F0ZVRvQ2hlY2twb2ludEluZGV4KGN1cnJlbnRJZHggLSAxKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdGVwcyBhIHNpbmdsZSBjaGVja3BvaW50IGZvcndhcmRzLCByZWRvaW5nIHRoZSBlZGl0cyBvZiB0aGUgbmV4dFxuXHQgKiBjaGVja3BvaW50LlxuXHQgKlxuXHQgKiBJbXBsZW1lbnRpbmcgdGhpcyBpcyBlc3NlbnRpYWw6IHRoZSBcIlJlZG9cIiBhY3Rpb24gcmVwZWF0ZWRseSBjYWxscyB0aGlzXG5cdCAqIHdoaWxlIHtAbGluayBjYW5SZWRvfSBpcyBgdHJ1ZWAsIHNvIGEgbm8tb3AgaW1wbGVtZW50YXRpb24gd291bGQgc3BpblxuXHQgKiBmb3JldmVyIGFuZCBoYW5nIHRoZSB3aW5kb3cuXG5cdCAqL1xuXHRhc3luYyByZWRvSW50ZXJhY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3VuZG9SZWRvU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRJZHggPSB0aGlzLl9jdXJyZW50Q2hlY2twb2ludEluZGV4LmdldCgpO1xuXHRcdFx0aWYgKGN1cnJlbnRJZHggPj0gdGhpcy5fY2hlY2twb2ludHMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9uYXZpZ2F0ZVRvQ2hlY2twb2ludEluZGV4KGN1cnJlbnRJZHggKyAxKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNb3ZlcyB0aGUgb24tZGlzayBmaWxlIHN0YXRlIGFuZCB0aGUgY2hlY2twb2ludCBjdXJzb3IgdG8gYHRhcmdldElkeGAsXG5cdCAqIHdyaXRpbmcgZWFjaCBjcm9zc2VkIGNoZWNrcG9pbnQncyBiZWZvcmUvYWZ0ZXIgY29udGVudC4gTXVzdCBydW4gaW5zaWRlXG5cdCAqIHRoZSB7QGxpbmsgX3VuZG9SZWRvU2VxdWVuY2VyfSB0byBhdm9pZCByYWNpbmcgd3JpdGVzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfbmF2aWdhdGVUb0NoZWNrcG9pbnRJbmRleCh0YXJnZXRJZHg6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN1cnJlbnRJZHggPSB0aGlzLl9jdXJyZW50Q2hlY2twb2ludEluZGV4LmdldCgpO1xuXHRcdGlmICh0YXJnZXRJZHggPCBjdXJyZW50SWR4KSB7XG5cdFx0XHQvLyBVbmRvIGZvcndhcmQgY2hlY2twb2ludHNcblx0XHRcdGZvciAobGV0IGkgPSBjdXJyZW50SWR4OyBpID4gdGFyZ2V0SWR4OyBpLS0pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fd3JpdGVDaGVja3BvaW50Q29udGVudCh0aGlzLl9jaGVja3BvaW50c1tpXSwgJ2JlZm9yZScpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGFyZ2V0SWR4ID4gY3VycmVudElkeCkge1xuXHRcdFx0Ly8gUmVkbyB0byByZWFjaCB0aGUgdGFyZ2V0XG5cdFx0XHRmb3IgKGxldCBpID0gY3VycmVudElkeCArIDE7IGkgPD0gdGFyZ2V0SWR4OyBpKyspIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fd3JpdGVDaGVja3BvaW50Q29udGVudCh0aGlzLl9jaGVja3BvaW50c1tpXSwgJ2FmdGVyJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5fY3VycmVudENoZWNrcG9pbnRJbmRleC5zZXQodGFyZ2V0SWR4LCB0eCk7XG5cdFx0fSk7XG5cdH1cblxuXHRnZXRTbmFwc2hvdFVyaShyZXF1ZXN0SWQ6IHN0cmluZywgdXJpOiBVUkksIF9zdG9wSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY3AgPSB0aGlzLl9jaGVja3BvaW50cy5maW5kKGMgPT4gYy5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZCk7XG5cdFx0aWYgKCFjcCB8fCAhY3AuZWRpdHMuc29tZShlID0+IGUucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gdXJpLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gVVJJLmZyb20oe1xuXHRcdFx0c2NoZW1lOiBTY2hlbWFzLmNoYXRFZGl0aW5nU25hcHNob3RTY2hlbWUsXG5cdFx0XHRwYXRoOiB1cmkucGF0aCxcblx0XHRcdHF1ZXJ5OiBKU09OLnN0cmluZ2lmeSh7IHNlc3Npb246IHRoaXMuY2hhdFNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCByZXF1ZXN0SWQsIHVuZG9TdG9wOiAnJyB9KSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGdldFNuYXBzaG90Q29udGVudHMocmVxdWVzdElkOiBzdHJpbmcsIHVyaTogVVJJLCBfc3RvcElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPFZTQnVmZmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY3AgPSB0aGlzLl9jaGVja3BvaW50cy5maW5kKGMgPT4gYy5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZCk7XG5cdFx0aWYgKCFjcCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdXJpU3RyID0gdXJpLnRvU3RyaW5nKCk7XG5cdFx0Ly8gVXNlIHRoZSBsYXN0IGVkaXQgZm9yIHRoaXMgZmlsZSBpbiB0aGUgcmVxdWVzdCBcdTIwMTQgdGhhdCdzIHRoZVxuXHRcdC8vIFwiYWZ0ZXItY29udGVudFwiIHRoZSBkaWZmIHZpZXdlciB3YW50cyB0byBkaXNwbGF5LlxuXHRcdGxldCBlZGl0OiBJVG9vbENhbGxGaWxlRWRpdCB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGxldCBpID0gY3AuZWRpdHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGlmIChjcC5lZGl0c1tpXS5yZXNvdXJjZS50b1N0cmluZygpID09PSB1cmlTdHIpIHtcblx0XHRcdFx0ZWRpdCA9IGNwLmVkaXRzW2ldO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFlZGl0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0aWYgKCFlZGl0LmFmdGVyQ29udGVudFVyaSkge1xuXHRcdFx0XHRyZXR1cm4gVlNCdWZmZXIuZnJvbUJ5dGVBcnJheShbXSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoZWRpdC5hZnRlckNvbnRlbnRVcmkpO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQudmFsdWU7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXJdIEZhaWxlZCB0byBmZXRjaCBzbmFwc2hvdCBjb250ZW50YCwgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0U25hcHNob3RNb2RlbChfcmVxdWVzdElkOiBzdHJpbmcsIF91bmRvU3RvcDogc3RyaW5nIHwgdW5kZWZpbmVkLCBfc25hcHNob3RVcmk6IFVSSSk6IFByb21pc2U8SVRleHRNb2RlbCB8IG51bGw+IHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGhhc0VkaXRzSW5SZXF1ZXN0KHJlcXVlc3RJZDogc3RyaW5nLCBfcmVhZGVyPzogSVJlYWRlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNwID0gdGhpcy5fY2hlY2twb2ludHMuZmluZChjID0+IGMucmVxdWVzdElkID09PSByZXF1ZXN0SWQpO1xuXHRcdHJldHVybiAhIWNwICYmIGNwLmVkaXRzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHQvLyAtLS0tIFVuc3VwcG9ydGVkIC8gbm8tb3AgKGFnZW50IGhvc3Qgb3ducyBlZGl0cyBzZXJ2ZXItc2lkZSkgLS0tLS0tLS0tLS0tXG5cblx0YXN5bmMgc2hvdyhfcHJldmlvdXNDaGFuZ2VzPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4geyAvKiBuby1vcCAqLyB9XG5cdGdldEVudHJ5KF91cmk6IFVSSSk6IElNb2RpZmllZEZpbGVFbnRyeSB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0cmVhZEVudHJ5KF91cmk6IFVSSSwgX3JlYWRlcjogSVJlYWRlcik6IElNb2RpZmllZEZpbGVFbnRyeSB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgYWNjZXB0KC4uLl91cmlzOiBVUklbXSk6IFByb21pc2U8dm9pZD4geyAvKiBuby1vcCAqLyB9XG5cdGFzeW5jIHJlamVjdCguLi5fdXJpczogVVJJW10pOiBQcm9taXNlPHZvaWQ+IHsgLyogbm8tb3AgKi8gfVxuXHRnZXRFbnRyeURpZmZCZXR3ZWVuU3RvcHMoX3VyaTogVVJJLCBfcmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIF9zdG9wSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElPYnNlcnZhYmxlPElFZGl0U2Vzc2lvbkVudHJ5RGlmZiB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGdldEVudHJ5RGlmZkJldHdlZW5SZXF1ZXN0cyhfdXJpOiBVUkksIF9zdGFydFJlcXVlc3RJZDogc3RyaW5nLCBfc3RvcFJlcXVlc3RJZDogc3RyaW5nKTogSU9ic2VydmFibGU8SUVkaXRTZXNzaW9uRW50cnlEaWZmIHwgdW5kZWZpbmVkPiB7IHJldHVybiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTsgfVxuXHRnZXREaWZmc0ZvckZpbGVzSW5TZXNzaW9uKCk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdPiB7IHJldHVybiBjb25zdE9ic2VydmFibGUoW10pOyB9XG5cdGdldERpZmZzRm9yRmlsZXNJblJlcXVlc3QoX3JlcXVlc3RJZDogc3RyaW5nKTogSU9ic2VydmFibGU8cmVhZG9ubHkgSUVkaXRTZXNzaW9uRW50cnlEaWZmW10+IHsgcmV0dXJuIGNvbnN0T2JzZXJ2YWJsZShbXSk7IH1cblx0Z2V0RGlmZkZvclNlc3Npb24oKTogSU9ic2VydmFibGU8SUVkaXRTZXNzaW9uRGlmZlN0YXRzPiB7IHJldHVybiBjb25zdE9ic2VydmFibGUoeyBhZGRlZDogMCwgcmVtb3ZlZDogMCB9KTsgfVxuXG5cdGFzeW5jIHRyaWdnZXJFeHBsYW5hdGlvbkdlbmVyYXRpb24oKTogUHJvbWlzZTx2b2lkPiB7IC8qIG5vLW9wICovIH1cblx0Y2xlYXJFeHBsYW5hdGlvbnMoKTogdm9pZCB7IC8qIG5vLW9wICovIH1cblx0aGFzRXhwbGFuYXRpb25zKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblxuXHRzdGFydFN0cmVhbWluZ0VkaXRzKF9yZXNvdXJjZTogVVJJLCBfcmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsLCBfaW5VbmRvU3RvcDogc3RyaW5nIHwgdW5kZWZpbmVkKTogSVN0cmVhbWluZ0VkaXRzIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQgZm9yIGFnZW50IGhvc3Qgc2Vzc2lvbnMnKTtcblx0fVxuXHRhcHBseVdvcmtzcGFjZUVkaXQoX2VkaXQ6IElDaGF0V29ya3NwYWNlRWRpdCwgX3Jlc3BvbnNlTW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbCwgX3VuZG9TdG9wSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCBmb3IgYWdlbnQgaG9zdCBzZXNzaW9ucycpO1xuXHR9XG5cdGFzeW5jIHN0YXJ0RXh0ZXJuYWxFZGl0cyhfcmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsLCBfb3BlcmF0aW9uSWQ6IG51bWJlciwgX3Jlc291cmNlczogVVJJW10sIF91bmRvU3RvcElkOiBzdHJpbmcsIF9jb250ZW50Rm9yPzogVVJJW10pOiBQcm9taXNlPElDaGF0UHJvZ3Jlc3NbXT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCBmb3IgYWdlbnQgaG9zdCBzZXNzaW9ucycpO1xuXHR9XG5cdGFzeW5jIHN0b3BFeHRlcm5hbEVkaXRzKF9yZXNwb25zZU1vZGVsOiBJQ2hhdFJlc3BvbnNlTW9kZWwsIF9vcGVyYXRpb25JZDogbnVtYmVyLCBfY29udGVudEZvcj86IFVSSVtdKTogUHJvbWlzZTxJQ2hhdFByb2dyZXNzW10+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQgZm9yIGFnZW50IGhvc3Qgc2Vzc2lvbnMnKTtcblx0fVxuXG5cdC8vIC0tLS0gU3RvcCAvIERpc3Bvc2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRhc3luYyBzdG9wKF9jbGVhclN0YXRlPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZERpc3Bvc2UuZmlyZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8vIC0tLS0gUHJpdmF0ZSBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIGFzeW5jIF93cml0ZUNoZWNrcG9pbnRDb250ZW50KGNoZWNrcG9pbnQ6IElBZ2VudEhvc3RDaGVja3BvaW50LCBkaXJlY3Rpb246ICdiZWZvcmUnIHwgJ2FmdGVyJyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9wcyA9IGNoZWNrcG9pbnQuZWRpdHMubWFwKGFzeW5jIGVkaXQgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKGRpcmVjdGlvbiA9PT0gJ2JlZm9yZScpIHtcblx0XHRcdFx0XHQvLyBVbmRvaW5nIHRoaXMgZWRpdFxuXHRcdFx0XHRcdHN3aXRjaCAoZWRpdC5raW5kKSB7XG5cdFx0XHRcdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5DcmVhdGU6XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmRlbChlZGl0LnJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5EZWxldGU6XG5cdFx0XHRcdFx0XHRcdGlmIChlZGl0LmJlZm9yZUNvbnRlbnRVcmkpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoZWRpdC5iZWZvcmVDb250ZW50VXJpKTtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUoZWRpdC5yZXNvdXJjZSwgY29udGVudC52YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5SZW5hbWU6XG5cdFx0XHRcdFx0XHRcdGlmIChlZGl0Lm9yaWdpbmFsUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5tb3ZlKGVkaXQucmVzb3VyY2UsIGVkaXQub3JpZ2luYWxSZXNvdXJjZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKGVkaXQuYmVmb3JlQ29udGVudFVyaSAmJiBlZGl0Lm9yaWdpbmFsUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoZWRpdC5iZWZvcmVDb250ZW50VXJpKTtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUoZWRpdC5vcmlnaW5hbFJlc291cmNlLCBjb250ZW50LnZhbHVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgRmlsZUVkaXRLaW5kLkVkaXQ6XG5cdFx0XHRcdFx0XHRcdGlmIChlZGl0LmJlZm9yZUNvbnRlbnRVcmkpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoZWRpdC5iZWZvcmVDb250ZW50VXJpKTtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUoZWRpdC5yZXNvdXJjZSwgY29udGVudC52YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFJlZG9pbmcgdGhpcyBlZGl0XG5cdFx0XHRcdFx0c3dpdGNoIChlZGl0LmtpbmQpIHtcblx0XHRcdFx0XHRcdGNhc2UgRmlsZUVkaXRLaW5kLkNyZWF0ZTpcblx0XHRcdFx0XHRcdFx0aWYgKGVkaXQuYWZ0ZXJDb250ZW50VXJpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKGVkaXQuYWZ0ZXJDb250ZW50VXJpKTtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUoZWRpdC5yZXNvdXJjZSwgY29udGVudC52YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5EZWxldGU6XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmRlbChlZGl0LnJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5SZW5hbWU6XG5cdFx0XHRcdFx0XHRcdGlmIChlZGl0Lm9yaWdpbmFsUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5tb3ZlKGVkaXQub3JpZ2luYWxSZXNvdXJjZSwgZWRpdC5yZXNvdXJjZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKGVkaXQuYWZ0ZXJDb250ZW50VXJpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKGVkaXQuYWZ0ZXJDb250ZW50VXJpKTtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUoZWRpdC5yZXNvdXJjZSwgY29udGVudC52YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIEZpbGVFZGl0S2luZC5FZGl0OlxuXHRcdFx0XHRcdFx0XHRpZiAoZWRpdC5hZnRlckNvbnRlbnRVcmkpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoZWRpdC5hZnRlckNvbnRlbnRVcmkpO1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShlZGl0LnJlc291cmNlLCBjb250ZW50LnZhbHVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXJdIEZhaWxlZCB0byAke2RpcmVjdGlvbiA9PT0gJ2JlZm9yZScgPyAndW5kbycgOiAncmVkbyd9ICR7ZWRpdC5raW5kfSBmb3IgJHtlZGl0LnJlc291cmNlLnRvU3RyaW5nKCl9YCwgZXJyKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChvcHMpO1xuXHR9XG59XG5cbi8qKlxuICogQ29tYmluZXMgdHdvIGVkaXRzIHRvIHRoZSBzYW1lIGZpbGUgKGluIGFycml2YWwgb3JkZXIpIGludG8gYSBzaW5nbGUgbmV0XG4gKiBlZGl0LiBUaGUgbWVyZ2VkIGVudHJ5IGtlZXBzIHRoZSBlYXJsaWVyIGBiZWZvcmVgIHNuYXBzaG90IGFuZCB0aGUgbGF0ZXJcbiAqIGBhZnRlcmAgc25hcHNob3QsIGFuZCBkZXJpdmVzIGEgbmV0IGBraW5kYCBiYXNlZCBvbiB3aGV0aGVyIHRoZSBmaWxlXG4gKiBleGlzdHMgYXQgdGhlIHN0YXJ0IGFuZCBlbmQgb2YgdGhlIGNvbWJpbmVkIG9wZXJhdGlvbi5cbiAqXG4gKiBBIGNyZWF0ZS10aGVuLWRlbGV0ZSBjb2xsYXBzZXMgdG8gYSBuby1vcCBlZGl0IChubyBiZWZvcmUsIG5vIGFmdGVyKSBcdTIwMTQgd2VcbiAqIHN0aWxsIGtlZXAgdGhlIGVudHJ5IHNvIHRoZSBmaWxlIGlzIHJlc3RvcmVkIHRvIFwiYWJzZW50XCIgb24gdW5kbywgYnV0XG4gKiBgX3dyaXRlQ2hlY2twb2ludENvbnRlbnRgIHdpbGwgc2tpcCB0aGUgd3JpdGUgc2luY2UgYm90aCBVUklzIGFyZSBhYnNlbnQuXG4gKi9cbmZ1bmN0aW9uIG1lcmdlRmlsZUVkaXQocHJldjogSVRvb2xDYWxsRmlsZUVkaXQsIG5leHQ6IElUb29sQ2FsbEZpbGVFZGl0KTogSVRvb2xDYWxsRmlsZUVkaXQge1xuXHRjb25zdCBzdGFydHNBYnNlbnQgPSBwcmV2LmtpbmQgPT09IEZpbGVFZGl0S2luZC5DcmVhdGU7XG5cdGNvbnN0IGVuZHNBYnNlbnQgPSBuZXh0LmtpbmQgPT09IEZpbGVFZGl0S2luZC5EZWxldGU7XG5cblx0bGV0IGtpbmQ6IEZpbGVFZGl0S2luZDtcblx0aWYgKHN0YXJ0c0Fic2VudCAmJiBlbmRzQWJzZW50KSB7XG5cdFx0a2luZCA9IEZpbGVFZGl0S2luZC5FZGl0OyAvLyBjcmVhdGUrZGVsZXRlIGNvbGxhcHNlcyB0byBuby1vcFxuXHR9IGVsc2UgaWYgKHN0YXJ0c0Fic2VudCkge1xuXHRcdGtpbmQgPSBGaWxlRWRpdEtpbmQuQ3JlYXRlO1xuXHR9IGVsc2UgaWYgKGVuZHNBYnNlbnQpIHtcblx0XHRraW5kID0gRmlsZUVkaXRLaW5kLkRlbGV0ZTtcblx0fSBlbHNlIHtcblx0XHRraW5kID0gRmlsZUVkaXRLaW5kLkVkaXQ7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGtpbmQsXG5cdFx0cmVzb3VyY2U6IG5leHQucmVzb3VyY2UsXG5cdFx0Ly8gUmVuYW1lcyB3aXRoaW4gYSBzaW5nbGUgcmVxdWVzdCBhcmUgdW5jb21tb247IGlmIHRoZSBzZWNvbmQgZWRpdFxuXHRcdC8vIGlzIGl0c2VsZiBhIHJlbmFtZSBrZWVwIGl0cyBvcmlnaW5hbFJlc291cmNlLCBvdGhlcndpc2UgY2Fycnlcblx0XHQvLyBmb3J3YXJkIHRoZSBmaXJzdCBvbmUuXG5cdFx0b3JpZ2luYWxSZXNvdXJjZTogbmV4dC5vcmlnaW5hbFJlc291cmNlID8/IHByZXYub3JpZ2luYWxSZXNvdXJjZSxcblx0XHRiZWZvcmVDb250ZW50VXJpOiBwcmV2LmJlZm9yZUNvbnRlbnRVcmksXG5cdFx0YWZ0ZXJDb250ZW50VXJpOiBuZXh0LmFmdGVyQ29udGVudFVyaSxcblx0XHR1bmRvU3RvcElkOiBwcmV2LnVuZG9TdG9wSWQsXG5cdFx0ZGlmZjogbmV4dC5kaWZmID8/IHByZXYuZGlmZixcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVB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
