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
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableMap, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { clamp } from "../../../../../base/common/numbers.js";
import { autorun, derived, observableValue, observableValueOpts, transaction } from "../../../../../base/common/observable.js";
import { EditDeltaInfo } from "../../../../../editor/common/textModelEditSource.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { observableConfigValue } from "../../../../../platform/observable/common/platformObservableUtils.js";
import { editorBackground, registerColor, transparent } from "../../../../../platform/theme/common/colorRegistry.js";
import { IUndoRedoService } from "../../../../../platform/undoRedo/common/undoRedo.js";
import { IFilesConfigurationService } from "../../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IAiEditTelemetryService } from "../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ChatEditKind, ModifiedFileEntryState } from "../../common/editing/chatEditingService.js";
class AutoAcceptControl {
  constructor(total, remaining, cancel) {
    this.total = total;
    this.remaining = remaining;
    this.cancel = cancel;
  }
}
const pendingRewriteMinimap = registerColor(
  "minimap.chatEditHighlight",
  transparent(editorBackground, 0.6),
  localize("editorSelectionBackground", "Color of pending edit regions in the minimap")
);
let AbstractChatEditingModifiedFileEntry = class extends Disposable {
  constructor(modifiedURI, _telemetryInfo, kind, configService, _fileConfigService, _chatService, _fileService, _undoRedoService, _instantiationService, _aiEditTelemetryService) {
    super();
    this.modifiedURI = modifiedURI;
    this._telemetryInfo = _telemetryInfo;
    this._fileConfigService = _fileConfigService;
    this._chatService = _chatService;
    this._fileService = _fileService;
    this._undoRedoService = _undoRedoService;
    this._instantiationService = _instantiationService;
    this._aiEditTelemetryService = _aiEditTelemetryService;
    this.entryId = `${AbstractChatEditingModifiedFileEntry.scheme}::${++AbstractChatEditingModifiedFileEntry.lastEntryId}`;
    this._onDidDelete = this._register(new Emitter());
    this.onDidDelete = this._onDidDelete.event;
    this._stateObs = observableValue(this, ModifiedFileEntryState.Modified);
    this.state = this._stateObs;
    this._waitsForLastEdits = observableValue(this, false);
    this.waitsForLastEdits = this._waitsForLastEdits;
    this._isCurrentlyBeingModifiedByObs = observableValue(this, void 0);
    this.isCurrentlyBeingModifiedBy = this._isCurrentlyBeingModifiedByObs;
    /**
     * Flag to track if we're currently in an external edit operation.
     * When true, file system changes should be treated as agent edits, not user edits.
     */
    this._isExternalEditInProgress = false;
    this._lastModifyingResponseObs = observableValueOpts({ equalsFn: (a, b) => a?.requestId === b?.requestId }, void 0);
    this.lastModifyingResponse = this._lastModifyingResponseObs;
    this._lastModifyingResponseInProgressObs = this._lastModifyingResponseObs.map((value, r) => {
      return value?.isInProgress.read(r) ?? false;
    });
    this._rewriteRatioObs = observableValue(this, 0);
    this.rewriteRatio = this._rewriteRatioObs;
    this._reviewModeTempObs = observableValue(this, void 0);
    this._autoAcceptCtrl = observableValue(this, void 0);
    this.autoAcceptController = this._autoAcceptCtrl;
    this._refCounter = 1;
    this._userEditScheduler = this._register(new RunOnceScheduler(() => this._notifySessionAction("userModified"), 1e3));
    this._editorIntegrations = this._register(new DisposableMap());
    if (kind === ChatEditKind.Created) {
      this.createdInRequestId = this._telemetryInfo.requestId;
    }
    if (this.modifiedURI.scheme !== Schemas.untitled && this.modifiedURI.scheme !== Schemas.vscodeNotebookCell) {
      this._register(this._fileService.watch(this.modifiedURI));
      this._register(this._fileService.onDidFilesChange((e) => {
        if (e.affects(this.modifiedURI) && kind === ChatEditKind.Created && e.gotDeleted()) {
          this._onDidDelete.fire();
        }
      }));
    }
    const autoAcceptRaw = observableConfigValue("chat.editing.autoAcceptDelay", 0, configService);
    this._autoAcceptTimeout = derived((r) => {
      const value = autoAcceptRaw.read(r);
      return clamp(value, 0, 100);
    });
    this.reviewMode = derived((r) => {
      const configuredValue = this._autoAcceptTimeout.read(r);
      const tempValue = this._reviewModeTempObs.read(r);
      return tempValue ?? configuredValue === 0;
    });
    this._store.add(toDisposable(() => this._lastModifyingResponseObs.set(void 0, void 0)));
    const autoSaveOff = this._store.add(new MutableDisposable());
    this._store.add(autorun((r) => {
      if (this._waitsForLastEdits.read(r)) {
        autoSaveOff.value = _fileConfigService.disableAutoSave(this.modifiedURI);
      } else {
        autoSaveOff.clear();
      }
    }));
    this._store.add(autorun((r) => {
      const inProgress = this._lastModifyingResponseInProgressObs.read(r);
      if (inProgress === false && !this.reviewMode.read(r)) {
        const acceptTimeout = this._autoAcceptTimeout.read(void 0) * 1e3;
        const future = Date.now() + acceptTimeout;
        const update = () => {
          const reviewMode = this.reviewMode.read(void 0);
          if (reviewMode) {
            this._autoAcceptCtrl.set(void 0, void 0);
            return;
          }
          const remain = Math.round(future - Date.now());
          if (remain <= 0) {
            this.accept();
          } else {
            const handle = setTimeout(update, 100);
            this._autoAcceptCtrl.set(new AutoAcceptControl(acceptTimeout, remain, () => {
              clearTimeout(handle);
              this._autoAcceptCtrl.set(void 0, void 0);
            }), void 0);
          }
        };
        update();
      }
    }));
  }
  get telemetryInfo() {
    return this._telemetryInfo;
  }
  get lastModifyingRequestId() {
    return this._telemetryInfo.requestId;
  }
  dispose() {
    if (--this._refCounter === 0) {
      super.dispose();
    }
  }
  acquire() {
    this._refCounter++;
    return this;
  }
  enableReviewModeUntilSettled() {
    if (this.state.get() !== ModifiedFileEntryState.Modified) {
      return;
    }
    this._reviewModeTempObs.set(true, void 0);
    const cleanup = autorun((r) => {
      const resetConfig = this.state.read(r) !== ModifiedFileEntryState.Modified;
      if (resetConfig) {
        this._store.delete(cleanup);
        this._reviewModeTempObs.set(void 0, void 0);
      }
    });
    this._store.add(cleanup);
  }
  updateTelemetryInfo(telemetryInfo) {
    this._telemetryInfo = telemetryInfo;
  }
  async accept() {
    const callback = await this.acceptDeferred();
    if (callback) {
      transaction(callback);
    }
  }
  /** Accepts and returns a function used to transition the state. This MUST be called by the consumer. */
  async acceptDeferred() {
    if (this._stateObs.get() !== ModifiedFileEntryState.Modified) {
      return;
    }
    await this._doAccept();
    return (tx) => {
      this._stateObs.set(ModifiedFileEntryState.Accepted, tx);
      this._autoAcceptCtrl.set(void 0, tx);
      this._notifySessionAction("accepted");
    };
  }
  async reject() {
    const callback = await this.rejectDeferred();
    if (callback) {
      transaction(callback);
    }
  }
  /** Rejects and returns a function used to transition the state. This MUST be called by the consumer. */
  async rejectDeferred() {
    if (this._stateObs.get() !== ModifiedFileEntryState.Modified) {
      return void 0;
    }
    this._notifySessionAction("rejected");
    await this._doReject();
    return (tx) => {
      this._stateObs.set(ModifiedFileEntryState.Rejected, tx);
      this._autoAcceptCtrl.set(void 0, tx);
    };
  }
  _notifySessionAction(outcome) {
    this._notifyAction({ kind: "chatEditingSessionAction", uri: this.modifiedURI, hasRemainingEdits: false, outcome });
  }
  _notifyAction(action) {
    if (action.kind === "chatEditingHunkAction" && action.outcome === "accepted") {
      this._aiEditTelemetryService.handleCodeAccepted({
        suggestionId: void 0,
        // TODO@hediet try to figure this out
        acceptanceMethod: "accept",
        presentation: "highlightedEdit",
        modelId: this._telemetryInfo.modelId,
        modeId: this._telemetryInfo.modeId,
        applyCodeBlockSuggestionId: this._telemetryInfo.applyCodeBlockSuggestionId,
        editDeltaInfo: new EditDeltaInfo(
          action.linesAdded,
          action.linesRemoved,
          -1,
          -1
        ),
        feature: this._telemetryInfo.feature,
        languageId: action.languageId,
        source: void 0,
        sourceRequestId: this._telemetryInfo.requestId
      });
    } else if (action.kind === "chatEditingHunkAction" && action.outcome === "rejected") {
      this._aiEditTelemetryService.handleCodeRejected({
        suggestionId: void 0,
        rejectionMethod: "reject",
        presentation: "highlightedEdit",
        modelId: this._telemetryInfo.modelId,
        modeId: this._telemetryInfo.modeId,
        applyCodeBlockSuggestionId: this._telemetryInfo.applyCodeBlockSuggestionId,
        editDeltaInfo: new EditDeltaInfo(
          action.linesAdded,
          action.linesRemoved,
          -1,
          -1
        ),
        feature: this._telemetryInfo.feature,
        languageId: action.languageId,
        source: void 0,
        sourceRequestId: this._telemetryInfo.requestId
      });
    }
    this._chatService.notifyUserAction({
      action,
      agentId: this._telemetryInfo.agentId,
      modelId: this._telemetryInfo.modelId,
      modeId: this._telemetryInfo.modeId,
      command: this._telemetryInfo.command,
      sessionResource: this._telemetryInfo.sessionResource,
      requestId: this._telemetryInfo.requestId,
      result: this._telemetryInfo.result
    });
  }
  getEditorIntegration(pane) {
    let value = this._editorIntegrations.get(pane);
    if (!value) {
      value = this._createEditorIntegration(pane);
      this._editorIntegrations.set(pane, value);
    }
    return value;
  }
  acceptStreamingEditsStart(responseModel, undoStopId, tx) {
    this._resetEditsState(tx);
    this._isCurrentlyBeingModifiedByObs.set({ responseModel, undoStopId }, tx);
    this._lastModifyingResponseObs.set(responseModel, tx);
    this._autoAcceptCtrl.get()?.cancel();
    const undoRedoElement = this._createUndoRedoElement(responseModel);
    if (undoRedoElement) {
      this._undoRedoService.pushElement(undoRedoElement);
    }
  }
  async acceptStreamingEditsEnd() {
    this._resetEditsState(void 0);
    if (await this._areOriginalAndModifiedIdentical()) {
      await this.accept();
    }
  }
  _resetEditsState(tx) {
    this._isCurrentlyBeingModifiedByObs.set(void 0, tx);
    this._rewriteRatioObs.set(0, tx);
    this._waitsForLastEdits.set(false, tx);
  }
  /**
   * Marks the start of an external edit operation.
   * File system changes will be treated as agent edits until stopExternalEdit is called.
   */
  startExternalEdit() {
    this._isExternalEditInProgress = true;
  }
  /**
   * Marks the end of an external edit operation.
   */
  stopExternalEdit() {
    this._isExternalEditInProgress = false;
  }
};
AbstractChatEditingModifiedFileEntry.scheme = "modified-file-entry";
AbstractChatEditingModifiedFileEntry.lastEntryId = 0;
AbstractChatEditingModifiedFileEntry = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IFilesConfigurationService),
  __decorateParam(5, IChatService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IUndoRedoService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IAiEditTelemetryService)
], AbstractChatEditingModifiedFileEntry);
export {
  AbstractChatEditingModifiedFileEntry,
  pendingRewriteMinimap
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlVmFsdWUsIG9ic2VydmFibGVWYWx1ZU9wdHMsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBFZGl0RGVsdGFJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgZWRpdG9yQmFja2dyb3VuZCwgcmVnaXN0ZXJDb2xvciwgdHJhbnNwYXJlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9FbGVtZW50LCBJVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IElFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWlFZGl0VGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci90ZWxlbWV0cnkvYWlFZGl0VGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNlbGxFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IENoYXRVc2VyQWN0aW9uLCBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRLaW5kLCBJTW9kaWZpZWRFbnRyeVRlbGVtZXRyeUluZm8sIElNb2RpZmllZEZpbGVFbnRyeSwgSU1vZGlmaWVkRmlsZUVudHJ5RWRpdG9ySW50ZWdyYXRpb24sIElTbmFwc2hvdEVudHJ5LCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuXG5jbGFzcyBBdXRvQWNjZXB0Q29udHJvbCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHRvdGFsOiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgcmVtYWluaW5nOiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgY2FuY2VsOiAoKSA9PiB2b2lkXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjb25zdCBwZW5kaW5nUmV3cml0ZU1pbmltYXAgPSByZWdpc3RlckNvbG9yKCdtaW5pbWFwLmNoYXRFZGl0SGlnaGxpZ2h0Jyxcblx0dHJhbnNwYXJlbnQoZWRpdG9yQmFja2dyb3VuZCwgMC42KSxcblx0bG9jYWxpemUoJ2VkaXRvclNlbGVjdGlvbkJhY2tncm91bmQnLCBcIkNvbG9yIG9mIHBlbmRpbmcgZWRpdCByZWdpb25zIGluIHRoZSBtaW5pbWFwXCIpKTtcblxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNb2RpZmllZEZpbGVFbnRyeSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IHNjaGVtZSA9ICdtb2RpZmllZC1maWxlLWVudHJ5JztcblxuXHRwcml2YXRlIHN0YXRpYyBsYXN0RW50cnlJZCA9IDA7XG5cblx0cmVhZG9ubHkgZW50cnlJZCA9IGAke0Fic3RyYWN0Q2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeS5zY2hlbWV9OjokeysrQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5Lmxhc3RFbnRyeUlkfWA7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZERlbGV0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZERlbGV0ZSA9IHRoaXMuX29uRGlkRGVsZXRlLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfc3RhdGVPYnMgPSBvYnNlcnZhYmxlVmFsdWU8TW9kaWZpZWRGaWxlRW50cnlTdGF0ZT4odGhpcywgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCk7XG5cdHJlYWRvbmx5IHN0YXRlOiBJT2JzZXJ2YWJsZTxNb2RpZmllZEZpbGVFbnRyeVN0YXRlPiA9IHRoaXMuX3N0YXRlT2JzO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfd2FpdHNGb3JMYXN0RWRpdHMgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgZmFsc2UpO1xuXHRyZWFkb25seSB3YWl0c0Zvckxhc3RFZGl0czogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSB0aGlzLl93YWl0c0Zvckxhc3RFZGl0cztcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2lzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5T2JzID0gb2JzZXJ2YWJsZVZhbHVlPHsgcmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsOyB1bmRvU3RvcElkOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgaXNDdXJyZW50bHlCZWluZ01vZGlmaWVkQnk6IElPYnNlcnZhYmxlPHsgcmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsOyB1bmRvU3RvcElkOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZD4gPSB0aGlzLl9pc0N1cnJlbnRseUJlaW5nTW9kaWZpZWRCeU9icztcblxuXHQvKipcblx0ICogRmxhZyB0byB0cmFjayBpZiB3ZSdyZSBjdXJyZW50bHkgaW4gYW4gZXh0ZXJuYWwgZWRpdCBvcGVyYXRpb24uXG5cdCAqIFdoZW4gdHJ1ZSwgZmlsZSBzeXN0ZW0gY2hhbmdlcyBzaG91bGQgYmUgdHJlYXRlZCBhcyBhZ2VudCBlZGl0cywgbm90IHVzZXIgZWRpdHMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2lzRXh0ZXJuYWxFZGl0SW5Qcm9ncmVzcyA9IGZhbHNlO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfbGFzdE1vZGlmeWluZ1Jlc3BvbnNlT2JzID0gb2JzZXJ2YWJsZVZhbHVlT3B0czxJQ2hhdFJlc3BvbnNlTW9kZWwgfCB1bmRlZmluZWQ+KHsgZXF1YWxzRm46IChhLCBiKSA9PiBhPy5yZXF1ZXN0SWQgPT09IGI/LnJlcXVlc3RJZCB9LCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSBsYXN0TW9kaWZ5aW5nUmVzcG9uc2U6IElPYnNlcnZhYmxlPElDaGF0UmVzcG9uc2VNb2RlbCB8IHVuZGVmaW5lZD4gPSB0aGlzLl9sYXN0TW9kaWZ5aW5nUmVzcG9uc2VPYnM7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9sYXN0TW9kaWZ5aW5nUmVzcG9uc2VJblByb2dyZXNzT2JzID0gdGhpcy5fbGFzdE1vZGlmeWluZ1Jlc3BvbnNlT2JzLm1hcCgodmFsdWUsIHIpID0+IHtcblx0XHRyZXR1cm4gdmFsdWU/LmlzSW5Qcm9ncmVzcy5yZWFkKHIpID8/IGZhbHNlO1xuXHR9KTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3Jld3JpdGVSYXRpb09icyA9IG9ic2VydmFibGVWYWx1ZTxudW1iZXI+KHRoaXMsIDApO1xuXHRyZWFkb25seSByZXdyaXRlUmF0aW86IElPYnNlcnZhYmxlPG51bWJlcj4gPSB0aGlzLl9yZXdyaXRlUmF0aW9PYnM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmV2aWV3TW9kZVRlbXBPYnMgPSBvYnNlcnZhYmxlVmFsdWU8dHJ1ZSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgcmV2aWV3TW9kZTogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYXV0b0FjY2VwdEN0cmwgPSBvYnNlcnZhYmxlVmFsdWU8QXV0b0FjY2VwdENvbnRyb2wgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IGF1dG9BY2NlcHRDb250cm9sbGVyOiBJT2JzZXJ2YWJsZTxBdXRvQWNjZXB0Q29udHJvbCB8IHVuZGVmaW5lZD4gPSB0aGlzLl9hdXRvQWNjZXB0Q3RybDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2F1dG9BY2NlcHRUaW1lb3V0OiBJT2JzZXJ2YWJsZTxudW1iZXI+O1xuXG5cdGdldCB0ZWxlbWV0cnlJbmZvKCk6IElNb2RpZmllZEVudHJ5VGVsZW1ldHJ5SW5mbyB7XG5cdFx0cmV0dXJuIHRoaXMuX3RlbGVtZXRyeUluZm87XG5cdH1cblxuXHRyZWFkb25seSBjcmVhdGVkSW5SZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRnZXQgbGFzdE1vZGlmeWluZ1JlcXVlc3RJZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdGVsZW1ldHJ5SW5mby5yZXF1ZXN0SWQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZWZDb3VudGVyOiBudW1iZXIgPSAxO1xuXG5cdHJlYWRvbmx5IGFic3RyYWN0IG9yaWdpbmFsVVJJOiBVUkk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF91c2VyRWRpdFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX25vdGlmeVNlc3Npb25BY3Rpb24oJ3VzZXJNb2RpZmllZCcpLCAxMDAwKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbW9kaWZpZWRVUkk6IFVSSSxcblx0XHRwcm90ZWN0ZWQgX3RlbGVtZXRyeUluZm86IElNb2RpZmllZEVudHJ5VGVsZW1ldHJ5SW5mbyxcblx0XHRraW5kOiBDaGF0RWRpdEtpbmQsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCBfZmlsZUNvbmZpZ1NlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9jaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVW5kb1JlZG9TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VuZG9SZWRvU2VydmljZTogSVVuZG9SZWRvU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWlFZGl0VGVsZW1ldHJ5U2VydmljZTogSUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAoa2luZCA9PT0gQ2hhdEVkaXRLaW5kLkNyZWF0ZWQpIHtcblx0XHRcdHRoaXMuY3JlYXRlZEluUmVxdWVzdElkID0gdGhpcy5fdGVsZW1ldHJ5SW5mby5yZXF1ZXN0SWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubW9kaWZpZWRVUkkuc2NoZW1lICE9PSBTY2hlbWFzLnVudGl0bGVkICYmIHRoaXMubW9kaWZpZWRVUkkuc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmlsZVNlcnZpY2Uud2F0Y2godGhpcy5tb2RpZmllZFVSSSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdFx0aWYgKGUuYWZmZWN0cyh0aGlzLm1vZGlmaWVkVVJJKSAmJiBraW5kID09PSBDaGF0RWRpdEtpbmQuQ3JlYXRlZCAmJiBlLmdvdERlbGV0ZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkRGVsZXRlLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIHJldmlldyBtb2RlIGRlcGVuZHMgb24gc2V0dGluZyBhbmQgdGVtcG9yYXJ5IG92ZXJyaWRlXG5cdFx0Y29uc3QgYXV0b0FjY2VwdFJhdyA9IG9ic2VydmFibGVDb25maWdWYWx1ZSgnY2hhdC5lZGl0aW5nLmF1dG9BY2NlcHREZWxheScsIDAsIGNvbmZpZ1NlcnZpY2UpO1xuXHRcdHRoaXMuX2F1dG9BY2NlcHRUaW1lb3V0ID0gZGVyaXZlZChyID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXV0b0FjY2VwdFJhdy5yZWFkKHIpO1xuXHRcdFx0cmV0dXJuIGNsYW1wKHZhbHVlLCAwLCAxMDApO1xuXHRcdH0pO1xuXHRcdHRoaXMucmV2aWV3TW9kZSA9IGRlcml2ZWQociA9PiB7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkVmFsdWUgPSB0aGlzLl9hdXRvQWNjZXB0VGltZW91dC5yZWFkKHIpO1xuXHRcdFx0Y29uc3QgdGVtcFZhbHVlID0gdGhpcy5fcmV2aWV3TW9kZVRlbXBPYnMucmVhZChyKTtcblx0XHRcdHJldHVybiB0ZW1wVmFsdWUgPz8gY29uZmlndXJlZFZhbHVlID09PSAwO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9sYXN0TW9kaWZ5aW5nUmVzcG9uc2VPYnMuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKSkpO1xuXG5cdFx0Y29uc3QgYXV0b1NhdmVPZmYgPSB0aGlzLl9zdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3dhaXRzRm9yTGFzdEVkaXRzLnJlYWQocikpIHtcblx0XHRcdFx0YXV0b1NhdmVPZmYudmFsdWUgPSBfZmlsZUNvbmZpZ1NlcnZpY2UuZGlzYWJsZUF1dG9TYXZlKHRoaXMubW9kaWZpZWRVUkkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXV0b1NhdmVPZmYuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IGluUHJvZ3Jlc3MgPSB0aGlzLl9sYXN0TW9kaWZ5aW5nUmVzcG9uc2VJblByb2dyZXNzT2JzLnJlYWQocik7XG5cdFx0XHRpZiAoaW5Qcm9ncmVzcyA9PT0gZmFsc2UgJiYgIXRoaXMucmV2aWV3TW9kZS5yZWFkKHIpKSB7XG5cdFx0XHRcdC8vIEFVVE8gYWNjZXB0IG1vZGUgKHdoZW4gcmVxdWVzdCBpcyBkb25lKVxuXG5cdFx0XHRcdGNvbnN0IGFjY2VwdFRpbWVvdXQgPSB0aGlzLl9hdXRvQWNjZXB0VGltZW91dC5yZWFkKHVuZGVmaW5lZCkgKiAxMDAwO1xuXHRcdFx0XHRjb25zdCBmdXR1cmUgPSBEYXRlLm5vdygpICsgYWNjZXB0VGltZW91dDtcblx0XHRcdFx0Y29uc3QgdXBkYXRlID0gKCkgPT4ge1xuXG5cdFx0XHRcdFx0Y29uc3QgcmV2aWV3TW9kZSA9IHRoaXMucmV2aWV3TW9kZS5yZWFkKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0aWYgKHJldmlld01vZGUpIHtcblx0XHRcdFx0XHRcdC8vIHN3aXRjaGVkIGJhY2sgdG8gcmV2aWV3IG1vZGVcblx0XHRcdFx0XHRcdHRoaXMuX2F1dG9BY2NlcHRDdHJsLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcmVtYWluID0gTWF0aC5yb3VuZChmdXR1cmUgLSBEYXRlLm5vdygpKTtcblx0XHRcdFx0XHRpZiAocmVtYWluIDw9IDApIHtcblx0XHRcdFx0XHRcdHRoaXMuYWNjZXB0KCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IGhhbmRsZSA9IHNldFRpbWVvdXQodXBkYXRlLCAxMDApO1xuXHRcdFx0XHRcdFx0dGhpcy5fYXV0b0FjY2VwdEN0cmwuc2V0KG5ldyBBdXRvQWNjZXB0Q29udHJvbChhY2NlcHRUaW1lb3V0LCByZW1haW4sICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KGhhbmRsZSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2F1dG9BY2NlcHRDdHJsLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHR9KSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHRcdHVwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKC0tdGhpcy5fcmVmQ291bnRlciA9PT0gMCkge1xuXHRcdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFjcXVpcmUoKSB7XG5cdFx0dGhpcy5fcmVmQ291bnRlcisrO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0ZW5hYmxlUmV2aWV3TW9kZVVudGlsU2V0dGxlZCgpOiB2b2lkIHtcblxuXHRcdGlmICh0aGlzLnN0YXRlLmdldCgpICE9PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKSB7XG5cdFx0XHQvLyBub3RoaW5nIHRvIGRvXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmV2aWV3TW9kZVRlbXBPYnMuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBjbGVhbnVwID0gYXV0b3J1bihyID0+IHtcblx0XHRcdC8vIHJlc2V0IGNvbmZpZyB3aGVuIHNldHRsZWRcblx0XHRcdGNvbnN0IHJlc2V0Q29uZmlnID0gdGhpcy5zdGF0ZS5yZWFkKHIpICE9PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkO1xuXHRcdFx0aWYgKHJlc2V0Q29uZmlnKSB7XG5cdFx0XHRcdHRoaXMuX3N0b3JlLmRlbGV0ZShjbGVhbnVwKTtcblx0XHRcdFx0dGhpcy5fcmV2aWV3TW9kZVRlbXBPYnMuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChjbGVhbnVwKTtcblx0fVxuXG5cdHVwZGF0ZVRlbGVtZXRyeUluZm8odGVsZW1ldHJ5SW5mbzogSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvKSB7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5SW5mbyA9IHRlbGVtZXRyeUluZm87XG5cdH1cblxuXHRhc3luYyBhY2NlcHQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2FsbGJhY2sgPSBhd2FpdCB0aGlzLmFjY2VwdERlZmVycmVkKCk7XG5cdFx0aWYgKGNhbGxiYWNrKSB7XG5cdFx0XHR0cmFuc2FjdGlvbihjYWxsYmFjayk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEFjY2VwdHMgYW5kIHJldHVybnMgYSBmdW5jdGlvbiB1c2VkIHRvIHRyYW5zaXRpb24gdGhlIHN0YXRlLiBUaGlzIE1VU1QgYmUgY2FsbGVkIGJ5IHRoZSBjb25zdW1lci4gKi9cblx0YXN5bmMgYWNjZXB0RGVmZXJyZWQoKTogUHJvbWlzZTwoKHR4OiBJVHJhbnNhY3Rpb24pID0+IHZvaWQpIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlT2JzLmdldCgpICE9PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKSB7XG5cdFx0XHQvLyBhbHJlYWR5IGFjY2VwdGVkIG9yIHJlamVjdGVkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fZG9BY2NlcHQoKTtcblxuXHRcdHJldHVybiAodHg6IElUcmFuc2FjdGlvbikgPT4ge1xuXHRcdFx0dGhpcy5fc3RhdGVPYnMuc2V0KE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuQWNjZXB0ZWQsIHR4KTtcblx0XHRcdHRoaXMuX2F1dG9BY2NlcHRDdHJsLnNldCh1bmRlZmluZWQsIHR4KTtcblx0XHRcdHRoaXMuX25vdGlmeVNlc3Npb25BY3Rpb24oJ2FjY2VwdGVkJyk7XG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZG9BY2NlcHQoKTogUHJvbWlzZTx2b2lkPjtcblxuXHRhc3luYyByZWplY3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2FsbGJhY2sgPSBhd2FpdCB0aGlzLnJlamVjdERlZmVycmVkKCk7XG5cdFx0aWYgKGNhbGxiYWNrKSB7XG5cdFx0XHR0cmFuc2FjdGlvbihjYWxsYmFjayk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFJlamVjdHMgYW5kIHJldHVybnMgYSBmdW5jdGlvbiB1c2VkIHRvIHRyYW5zaXRpb24gdGhlIHN0YXRlLiBUaGlzIE1VU1QgYmUgY2FsbGVkIGJ5IHRoZSBjb25zdW1lci4gKi9cblx0YXN5bmMgcmVqZWN0RGVmZXJyZWQoKTogUHJvbWlzZTwoKHR4OiBJVHJhbnNhY3Rpb24pID0+IHZvaWQpIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlT2JzLmdldCgpICE9PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKSB7XG5cdFx0XHQvLyBhbHJlYWR5IGFjY2VwdGVkIG9yIHJlamVjdGVkXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX25vdGlmeVNlc3Npb25BY3Rpb24oJ3JlamVjdGVkJyk7XG5cdFx0YXdhaXQgdGhpcy5fZG9SZWplY3QoKTtcblxuXHRcdHJldHVybiAodHg6IElUcmFuc2FjdGlvbikgPT4ge1xuXHRcdFx0dGhpcy5fc3RhdGVPYnMuc2V0KE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuUmVqZWN0ZWQsIHR4KTtcblx0XHRcdHRoaXMuX2F1dG9BY2NlcHRDdHJsLnNldCh1bmRlZmluZWQsIHR4KTtcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9kb1JlamVjdCgpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdHByb3RlY3RlZCBfbm90aWZ5U2Vzc2lvbkFjdGlvbihvdXRjb21lOiAnYWNjZXB0ZWQnIHwgJ3JlamVjdGVkJyB8ICd1c2VyTW9kaWZpZWQnKSB7XG5cdFx0dGhpcy5fbm90aWZ5QWN0aW9uKHsga2luZDogJ2NoYXRFZGl0aW5nU2Vzc2lvbkFjdGlvbicsIHVyaTogdGhpcy5tb2RpZmllZFVSSSwgaGFzUmVtYWluaW5nRWRpdHM6IGZhbHNlLCBvdXRjb21lIH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9ub3RpZnlBY3Rpb24oYWN0aW9uOiBDaGF0VXNlckFjdGlvbikge1xuXHRcdGlmIChhY3Rpb24ua2luZCA9PT0gJ2NoYXRFZGl0aW5nSHVua0FjdGlvbicgJiYgYWN0aW9uLm91dGNvbWUgPT09ICdhY2NlcHRlZCcpIHtcblx0XHRcdHRoaXMuX2FpRWRpdFRlbGVtZXRyeVNlcnZpY2UuaGFuZGxlQ29kZUFjY2VwdGVkKHtcblx0XHRcdFx0c3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsIC8vIFRPRE9AaGVkaWV0IHRyeSB0byBmaWd1cmUgdGhpcyBvdXRcblx0XHRcdFx0YWNjZXB0YW5jZU1ldGhvZDogJ2FjY2VwdCcsXG5cdFx0XHRcdHByZXNlbnRhdGlvbjogJ2hpZ2hsaWdodGVkRWRpdCcsXG5cdFx0XHRcdG1vZGVsSWQ6IHRoaXMuX3RlbGVtZXRyeUluZm8ubW9kZWxJZCxcblx0XHRcdFx0bW9kZUlkOiB0aGlzLl90ZWxlbWV0cnlJbmZvLm1vZGVJZCxcblx0XHRcdFx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHRoaXMuX3RlbGVtZXRyeUluZm8uYXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQsXG5cdFx0XHRcdGVkaXREZWx0YUluZm86IG5ldyBFZGl0RGVsdGFJbmZvKFxuXHRcdFx0XHRcdGFjdGlvbi5saW5lc0FkZGVkLFxuXHRcdFx0XHRcdGFjdGlvbi5saW5lc1JlbW92ZWQsXG5cdFx0XHRcdFx0LTEsXG5cdFx0XHRcdFx0LTEsXG5cdFx0XHRcdCksXG5cdFx0XHRcdGZlYXR1cmU6IHRoaXMuX3RlbGVtZXRyeUluZm8uZmVhdHVyZSxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogYWN0aW9uLmxhbmd1YWdlSWQsXG5cdFx0XHRcdHNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRzb3VyY2VSZXF1ZXN0SWQ6IHRoaXMuX3RlbGVtZXRyeUluZm8ucmVxdWVzdElkLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChhY3Rpb24ua2luZCA9PT0gJ2NoYXRFZGl0aW5nSHVua0FjdGlvbicgJiYgYWN0aW9uLm91dGNvbWUgPT09ICdyZWplY3RlZCcpIHtcblx0XHRcdHRoaXMuX2FpRWRpdFRlbGVtZXRyeVNlcnZpY2UuaGFuZGxlQ29kZVJlamVjdGVkKHtcblx0XHRcdFx0c3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlamVjdGlvbk1ldGhvZDogJ3JlamVjdCcsXG5cdFx0XHRcdHByZXNlbnRhdGlvbjogJ2hpZ2hsaWdodGVkRWRpdCcsXG5cdFx0XHRcdG1vZGVsSWQ6IHRoaXMuX3RlbGVtZXRyeUluZm8ubW9kZWxJZCxcblx0XHRcdFx0bW9kZUlkOiB0aGlzLl90ZWxlbWV0cnlJbmZvLm1vZGVJZCxcblx0XHRcdFx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHRoaXMuX3RlbGVtZXRyeUluZm8uYXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQsXG5cdFx0XHRcdGVkaXREZWx0YUluZm86IG5ldyBFZGl0RGVsdGFJbmZvKFxuXHRcdFx0XHRcdGFjdGlvbi5saW5lc0FkZGVkLFxuXHRcdFx0XHRcdGFjdGlvbi5saW5lc1JlbW92ZWQsXG5cdFx0XHRcdFx0LTEsXG5cdFx0XHRcdFx0LTEsXG5cdFx0XHRcdCksXG5cdFx0XHRcdGZlYXR1cmU6IHRoaXMuX3RlbGVtZXRyeUluZm8uZmVhdHVyZSxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogYWN0aW9uLmxhbmd1YWdlSWQsXG5cdFx0XHRcdHNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRzb3VyY2VSZXF1ZXN0SWQ6IHRoaXMuX3RlbGVtZXRyeUluZm8ucmVxdWVzdElkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2hhdFNlcnZpY2Uubm90aWZ5VXNlckFjdGlvbih7XG5cdFx0XHRhY3Rpb24sXG5cdFx0XHRhZ2VudElkOiB0aGlzLl90ZWxlbWV0cnlJbmZvLmFnZW50SWQsXG5cdFx0XHRtb2RlbElkOiB0aGlzLl90ZWxlbWV0cnlJbmZvLm1vZGVsSWQsXG5cdFx0XHRtb2RlSWQ6IHRoaXMuX3RlbGVtZXRyeUluZm8ubW9kZUlkLFxuXHRcdFx0Y29tbWFuZDogdGhpcy5fdGVsZW1ldHJ5SW5mby5jb21tYW5kLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiB0aGlzLl90ZWxlbWV0cnlJbmZvLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHJlcXVlc3RJZDogdGhpcy5fdGVsZW1ldHJ5SW5mby5yZXF1ZXN0SWQsXG5cdFx0XHRyZXN1bHQ6IHRoaXMuX3RlbGVtZXRyeUluZm8ucmVzdWx0XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JJbnRlZ3JhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxJRWRpdG9yUGFuZSwgSU1vZGlmaWVkRmlsZUVudHJ5RWRpdG9ySW50ZWdyYXRpb24+KCkpO1xuXG5cdGdldEVkaXRvckludGVncmF0aW9uKHBhbmU6IElFZGl0b3JQYW5lKTogSU1vZGlmaWVkRmlsZUVudHJ5RWRpdG9ySW50ZWdyYXRpb24ge1xuXHRcdGxldCB2YWx1ZSA9IHRoaXMuX2VkaXRvckludGVncmF0aW9ucy5nZXQocGFuZSk7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0dmFsdWUgPSB0aGlzLl9jcmVhdGVFZGl0b3JJbnRlZ3JhdGlvbihwYW5lKTtcblx0XHRcdHRoaXMuX2VkaXRvckludGVncmF0aW9ucy5zZXQocGFuZSwgdmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIHRoZSBlZGl0b3IgaW50ZWdyYXRpb24gZm9yIHRoaXMgZW50cnkgYW5kIHRoZSBnaXZlbiBlZGl0b3IgcGFuZS4gVGhpcyB3aWxsIG9ubHkgYmUgY2FsbGVkXG5cdCAqIG9uY2UgKGFuZCBjYWNoZWQpIHBlciBwYW5lLiBUaGUgaW50ZWdyYXRpb24gaXMgbWVhbnQgdG8gYmUgc2NvcGVkIHRvIHRoaXMgZW50cnkgb25seSBhbmQgd2hlbiB0aGVcblx0ICogcGFzc2VkIHBhbmUvZWRpdG9yIGNoYW5nZXMgaW5wdXQsIHRoZW4gdGhlIGVkaXRvciBpbnRlZ3JhdGlvbiBtdXN0IGhhbmRsZSB0aGF0LCBlLmcgdXNlIGRlZmF1bHQvbnVsbFxuXHQgKiB2YWx1ZXNcblx0ICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfY3JlYXRlRWRpdG9ySW50ZWdyYXRpb24oZWRpdG9yOiBJRWRpdG9yUGFuZSk6IElNb2RpZmllZEZpbGVFbnRyeUVkaXRvckludGVncmF0aW9uO1xuXG5cdGFic3RyYWN0IHJlYWRvbmx5IGNoYW5nZXNDb3VudDogSU9ic2VydmFibGU8bnVtYmVyPjtcblxuXHRhY2NlcHRTdHJlYW1pbmdFZGl0c1N0YXJ0KHJlc3BvbnNlTW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbCwgdW5kb1N0b3BJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fcmVzZXRFZGl0c1N0YXRlKHR4KTtcblx0XHR0aGlzLl9pc0N1cnJlbnRseUJlaW5nTW9kaWZpZWRCeU9icy5zZXQoeyByZXNwb25zZU1vZGVsLCB1bmRvU3RvcElkIH0sIHR4KTtcblx0XHR0aGlzLl9sYXN0TW9kaWZ5aW5nUmVzcG9uc2VPYnMuc2V0KHJlc3BvbnNlTW9kZWwsIHR4KTtcblx0XHR0aGlzLl9hdXRvQWNjZXB0Q3RybC5nZXQoKT8uY2FuY2VsKCk7XG5cblx0XHRjb25zdCB1bmRvUmVkb0VsZW1lbnQgPSB0aGlzLl9jcmVhdGVVbmRvUmVkb0VsZW1lbnQocmVzcG9uc2VNb2RlbCk7XG5cdFx0aWYgKHVuZG9SZWRvRWxlbWVudCkge1xuXHRcdFx0dGhpcy5fdW5kb1JlZG9TZXJ2aWNlLnB1c2hFbGVtZW50KHVuZG9SZWRvRWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9jcmVhdGVVbmRvUmVkb0VsZW1lbnQocmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbCk6IElVbmRvUmVkb0VsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0YWJzdHJhY3QgYWNjZXB0QWdlbnRFZGl0cyh1cmk6IFVSSSwgZWRpdHM6IChUZXh0RWRpdCB8IElDZWxsRWRpdE9wZXJhdGlvbilbXSwgaXNMYXN0RWRpdHM6IGJvb2xlYW4sIHJlc3BvbnNlTW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD47XG5cblx0YXN5bmMgYWNjZXB0U3RyZWFtaW5nRWRpdHNFbmQoKSB7XG5cdFx0dGhpcy5fcmVzZXRFZGl0c1N0YXRlKHVuZGVmaW5lZCk7XG5cblx0XHRpZiAoYXdhaXQgdGhpcy5fYXJlT3JpZ2luYWxBbmRNb2RpZmllZElkZW50aWNhbCgpKSB7XG5cdFx0XHQvLyBBQ0NFUFQgaWYgaWRlbnRpY2FsXG5cdFx0XHRhd2FpdCB0aGlzLmFjY2VwdCgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfYXJlT3JpZ2luYWxBbmRNb2RpZmllZElkZW50aWNhbCgpOiBQcm9taXNlPGJvb2xlYW4+O1xuXG5cdHByb3RlY3RlZCBfcmVzZXRFZGl0c1N0YXRlKHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0N1cnJlbnRseUJlaW5nTW9kaWZpZWRCeU9icy5zZXQodW5kZWZpbmVkLCB0eCk7XG5cdFx0dGhpcy5fcmV3cml0ZVJhdGlvT2JzLnNldCgwLCB0eCk7XG5cdFx0dGhpcy5fd2FpdHNGb3JMYXN0RWRpdHMuc2V0KGZhbHNlLCB0eCk7XG5cdH1cblxuXHQvLyAtLS0gc25hcHNob3RcblxuXHRhYnN0cmFjdCBjcmVhdGVTbmFwc2hvdChjaGF0U2Vzc2lvblJlc291cmNlOiBVUkksIHJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB1bmRvU3RvcDogc3RyaW5nIHwgdW5kZWZpbmVkKTogSVNuYXBzaG90RW50cnk7XG5cblx0YWJzdHJhY3QgZXF1YWxzU25hcHNob3Qoc25hcHNob3Q6IElTbmFwc2hvdEVudHJ5IHwgdW5kZWZpbmVkKTogYm9vbGVhbjtcblxuXHRhYnN0cmFjdCByZXN0b3JlRnJvbVNuYXBzaG90KHNuYXBzaG90OiBJU25hcHNob3RFbnRyeSwgcmVzdG9yZVRvRGlzaz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8vIC0tLSBpbml0YWwgY29udGVudFxuXG5cdGFic3RyYWN0IHJlc2V0VG9Jbml0aWFsQ29udGVudCgpOiBQcm9taXNlPHZvaWQ+O1xuXHRhYnN0cmFjdCByZXNldEVkaXRUcmFja2VyVG9Jbml0aWFsQ29udGVudCgpOiBQcm9taXNlPHZvaWQ+O1xuXHRhYnN0cmFjdCBpbml0aWFsQ29udGVudDogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyB0aGUgZWRpdHMgYmV0d2VlbiB0d28gc25hcHNob3RzIG9mIHRoZSBmaWxlIGNvbnRlbnQuXG5cdCAqIEBwYXJhbSBiZWZvcmVTbmFwc2hvdCBUaGUgY29udGVudCBiZWZvcmUgdGhlIGNoYW5nZXNcblx0ICogQHBhcmFtIGFmdGVyU25hcHNob3QgVGhlIGNvbnRlbnQgYWZ0ZXIgdGhlIGNoYW5nZXNcblx0ICogQHJldHVybnMgQXJyYXkgb2YgdGV4dCBlZGl0cyBvciBjZWxsIGVkaXQgb3BlcmF0aW9uc1xuXHQgKi9cblx0YWJzdHJhY3QgY29tcHV0ZUVkaXRzRnJvbVNuYXBzaG90cyhiZWZvcmVTbmFwc2hvdDogc3RyaW5nLCBhZnRlclNuYXBzaG90OiBzdHJpbmcpOiBQcm9taXNlPChUZXh0RWRpdCB8IElDZWxsRWRpdE9wZXJhdGlvbilbXT47XG5cblx0LyoqXG5cdCAqIE1hcmtzIHRoZSBzdGFydCBvZiBhbiBleHRlcm5hbCBlZGl0IG9wZXJhdGlvbi5cblx0ICogRmlsZSBzeXN0ZW0gY2hhbmdlcyB3aWxsIGJlIHRyZWF0ZWQgYXMgYWdlbnQgZWRpdHMgdW50aWwgc3RvcEV4dGVybmFsRWRpdCBpcyBjYWxsZWQuXG5cdCAqL1xuXHRzdGFydEV4dGVybmFsRWRpdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0V4dGVybmFsRWRpdEluUHJvZ3Jlc3MgPSB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hcmtzIHRoZSBlbmQgb2YgYW4gZXh0ZXJuYWwgZWRpdCBvcGVyYXRpb24uXG5cdCAqL1xuXHRzdG9wRXh0ZXJuYWxFZGl0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzRXh0ZXJuYWxFZGl0SW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNhdmVzIHRoZSBjdXJyZW50IG1vZGVsIHN0YXRlIHRvIGRpc2suXG5cdCAqL1xuXHRhYnN0cmFjdCBzYXZlKCk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIFJlbG9hZHMgdGhlIG1vZGVsIGZyb20gZGlzayB0byBlbnN1cmUgaXQncyBpbiBzeW5jIHdpdGggZmlsZSBzeXN0ZW0gY2hhbmdlcy5cblx0ICovXG5cdGFic3RyYWN0IHJldmVydFRvRGlzaygpOiBQcm9taXNlPHZvaWQ+O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGVBQWUsbUJBQW1CLG9CQUFvQjtBQUMzRSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsU0FBUyxTQUFvQyxpQkFBaUIscUJBQXFCLG1CQUFtQjtBQUcvRyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUFrQixlQUFlLG1CQUFtQjtBQUM3RCxTQUEyQix3QkFBd0I7QUFFbkQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywrQkFBK0I7QUFFeEMsU0FBeUIsb0JBQW9CO0FBQzdDLFNBQVMsY0FBb0gsOEJBQThCO0FBRzNKLE1BQU0sa0JB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
