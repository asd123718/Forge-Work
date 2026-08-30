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
import { DeferredPromise, Sequencer, SequencerByKey, timeout } from "../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { BugIndicatingError } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { isStringInSample } from "../../../../../base/common/hash.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { Disposable, DisposableStore, dispose } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { derived, observableValue, transaction } from "../../../../../base/common/observable.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { hasKey } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { IBulkEditService } from "../../../../../editor/browser/services/bulkEditService.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../../nls.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { EditorActivation } from "../../../../../platform/editor/common/editor.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { DiffEditorInput } from "../../../../common/editor/diffEditorInput.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { MultiDiffEditorInput } from "../../../multiDiffEditor/browser/multiDiffEditorInput.js";
import { CellUri } from "../../../notebook/common/notebookCommon.js";
import { INotebookService } from "../../../notebook/common/notebookService.js";
import { chatEditingSessionIsReady, ChatEditingSessionState, ChatEditKind, getMultiDiffSourceUri, ModifiedFileEntryState } from "../../common/editing/chatEditingService.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { ChatEditingCheckpointTimelineImpl } from "./chatEditingCheckpointTimelineImpl.js";
import { ChatEditingDeletedFileEntry } from "./chatEditingDeletedFileEntry.js";
import { ChatEditingModifiedDocumentEntry } from "./chatEditingModifiedDocumentEntry.js";
import { AbstractChatEditingModifiedFileEntry } from "./chatEditingModifiedFileEntry.js";
import { ChatEditingModifiedNotebookEntry } from "./chatEditingModifiedNotebookEntry.js";
import { FileOperationType, getKeyForChatSessionResource } from "./chatEditingOperations.js";
import { IChatEditingExplanationModelManager } from "./chatEditingExplanationModelManager.js";
import { ChatEditingSessionStorage } from "./chatEditingSessionStorage.js";
import { ChatEditingTextModelContentProvider } from "./chatEditingTextModelContentProviders.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { AgentSessionProviders } from "../agentSessions/agentSessions.js";
var NotExistBehavior = /* @__PURE__ */ ((NotExistBehavior2) => {
  NotExistBehavior2[NotExistBehavior2["Create"] = 0] = "Create";
  NotExistBehavior2[NotExistBehavior2["Abort"] = 1] = "Abort";
  return NotExistBehavior2;
})(NotExistBehavior || {});
class ThrottledSequencer extends Sequencer {
  constructor(_minDuration, _maxOverallDelay) {
    super();
    this._minDuration = _minDuration;
    this._maxOverallDelay = _maxOverallDelay;
    this._size = 0;
  }
  queue(promiseTask) {
    this._size += 1;
    const noDelay = this._size * this._minDuration > this._maxOverallDelay;
    return super.queue(async () => {
      try {
        const p1 = promiseTask();
        const p2 = noDelay ? Promise.resolve(void 0) : timeout(this._minDuration, CancellationToken.None);
        const [result] = await Promise.all([p1, p2]);
        return result;
      } finally {
        this._size -= 1;
      }
    });
  }
}
function createOpeningEditCodeBlock(uri, isNotebook, undoStopId) {
  return [
    {
      kind: "markdownContent",
      content: new MarkdownString("\n````\n")
    },
    {
      kind: "codeblockUri",
      uri,
      isEdit: true,
      undoStopId
    },
    {
      kind: "markdownContent",
      content: new MarkdownString("\n````\n")
    },
    isNotebook ? {
      kind: "notebookEdit",
      uri,
      edits: [],
      done: false,
      isExternalEdit: true
    } : {
      kind: "textEdit",
      uri,
      edits: [],
      done: false,
      isExternalEdit: true
    }
  ];
}
let ChatEditingSession = class extends Disposable {
  constructor(chatSessionResource, isGlobalEditingSession, _lookupExternalEntry, transferFrom, _instantiationService, _modelService, _languageService, _textModelService, _bulkEditService, _editorGroupsService, _editorService, _notebookService, _accessibilitySignalService, _logService, configurationService, _fileService, _explanationModelManager, _telemetryService) {
    super();
    this.chatSessionResource = chatSessionResource;
    this.isGlobalEditingSession = isGlobalEditingSession;
    this._lookupExternalEntry = _lookupExternalEntry;
    this._instantiationService = _instantiationService;
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._textModelService = _textModelService;
    this._bulkEditService = _bulkEditService;
    this._editorGroupsService = _editorGroupsService;
    this._editorService = _editorService;
    this._notebookService = _notebookService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._logService = _logService;
    this.configurationService = configurationService;
    this._fileService = _fileService;
    this._explanationModelManager = _explanationModelManager;
    this._telemetryService = _telemetryService;
    this.supportsKeepUndo = false;
    this._state = observableValue(this, ChatEditingSessionState.Initial);
    /**
     * Contains the contents of a file when the AI first began doing edits to it.
     */
    this._initialFileContents = new ResourceMap();
    this._baselineCreationLocks = new SequencerByKey();
    this._streamingEditLocks = new SequencerByKey();
    /**
     * Tracks active external edit operations.
     * Key is operationId, value contains the operation state.
     */
    this._externalEditOperations = /* @__PURE__ */ new Map();
    this._entriesObs = observableValue(this, []);
    this.entries = derived((reader) => {
      const state = this._state.read(reader);
      if (state === ChatEditingSessionState.Disposed || state === ChatEditingSessionState.Initial) {
        return [];
      } else {
        return this._entriesObs.read(reader);
      }
    });
    this._onDidDispose = new Emitter();
    this._timeline = this._instantiationService.createInstance(
      ChatEditingCheckpointTimelineImpl,
      chatSessionResource,
      this._getTimelineDelegate()
    );
    this.canRedo = this._timeline.canRedo.map((hasHistory, reader) => hasHistory && this._state.read(reader) === ChatEditingSessionState.Idle);
    this.canUndo = this._timeline.canUndo.map((hasHistory, reader) => hasHistory && this._state.read(reader) === ChatEditingSessionState.Idle);
    this._init(transferFrom);
  }
  get state() {
    return this._state;
  }
  get requestDisablement() {
    return this._timeline.requestDisablement;
  }
  get onDidDispose() {
    this._assertNotDisposed();
    return this._onDidDispose.event;
  }
  _getTimelineDelegate() {
    return {
      createFile: (uri, content) => {
        return this._bulkEditService.apply({
          edits: [{
            newResource: uri,
            options: {
              overwrite: true,
              contents: content ? Promise.resolve(VSBuffer.fromString(content)) : void 0
            }
          }]
        });
      },
      deleteFile: async (uri) => {
        const removedEntry = this._entriesObs.get().find((e) => isEqual(e.modifiedURI, uri));
        const entries = this._entriesObs.get().filter((e) => !isEqual(e.modifiedURI, uri));
        this._entriesObs.set(entries, void 0);
        removedEntry?.dispose();
        await this._bulkEditService.apply({ edits: [{ oldResource: uri, options: { ignoreIfNotExists: true } }] });
      },
      renameFile: async (fromUri, toUri) => {
        const entries = this._entriesObs.get();
        const previousEntry = entries.find((e) => isEqual(e.modifiedURI, fromUri));
        if (previousEntry) {
          const newEntry = await this._getOrCreateModifiedFileEntry(toUri, 0 /* Create */, previousEntry.telemetryInfo, this._getCurrentTextOrNotebookSnapshot(previousEntry));
          previousEntry.dispose();
          this._entriesObs.set(entries.map((e) => e === previousEntry ? newEntry : e), void 0);
        }
      },
      setContents: async (uri, content, telemetryInfo) => {
        const entry = await this._getOrCreateModifiedFileEntry(uri, 0 /* Create */, telemetryInfo);
        const state = entry.state.get();
        if (entry instanceof ChatEditingModifiedNotebookEntry) {
          await entry.restoreModifiedModelFromSnapshot(content);
        } else {
          await entry.acceptAgentEdits(uri, [{ range: new Range(1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), text: content }], true, void 0);
        }
        if (state !== ModifiedFileEntryState.Modified) {
          await entry.accept();
        }
      }
    };
  }
  async _init(transferFrom) {
    const storage = this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionResource);
    let restoredSessionState;
    if (transferFrom instanceof ChatEditingSession) {
      restoredSessionState = transferFrom._getStoredState(this.chatSessionResource);
    } else {
      restoredSessionState = await storage.restoreState().catch((err) => {
        this._logService.error(`Error restoring chat editing session state for ${this.chatSessionResource}`, err);
        return void 0;
      });
      if (this._store.isDisposed) {
        return;
      }
    }
    if (restoredSessionState) {
      for (const [uri, content] of restoredSessionState.initialFileContents) {
        this._initialFileContents.set(uri, content);
      }
      if (restoredSessionState.timeline) {
        transaction((tx) => this._timeline.restoreFromState(restoredSessionState.timeline, tx));
      }
      await this._initEntries(restoredSessionState.recentSnapshot);
    }
    this._state.set(ChatEditingSessionState.Idle, void 0);
  }
  _getEntry(uri) {
    uri = CellUri.parse(uri)?.notebook ?? uri;
    return this._entriesObs.get().find((e) => isEqual(e.modifiedURI, uri));
  }
  getEntry(uri) {
    return this._getEntry(uri);
  }
  readEntry(uri, reader) {
    uri = CellUri.parse(uri)?.notebook ?? uri;
    return this._entriesObs.read(reader).find((e) => isEqual(e.modifiedURI, uri));
  }
  storeState() {
    const storage = this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionResource);
    const storedState = this._getStoredState();
    this._reportSessionInfo("chatEditing/sessionStore", this._entriesObs.get());
    return storage.storeState(storedState);
  }
  _getStoredState(sessionResource = this.chatSessionResource) {
    const entries = new ResourceMap();
    for (const entry of this._entriesObs.get()) {
      entries.set(entry.modifiedURI, entry.createSnapshot(sessionResource, void 0, void 0));
    }
    const state = {
      initialFileContents: this._initialFileContents,
      timeline: this._timeline.getStateForPersistence(),
      recentSnapshot: { entries, stopId: void 0 }
    };
    return state;
  }
  getEntryDiffBetweenStops(uri, requestId, stopId) {
    return this._timeline.getEntryDiffBetweenStops(uri, requestId, stopId);
  }
  getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId) {
    return this._timeline.getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId);
  }
  getDiffsForFilesInSession() {
    return this._timeline.getDiffsForFilesInSession();
  }
  getDiffForSession() {
    return this._timeline.getDiffForSession();
  }
  getDiffsForFilesInRequest(requestId) {
    return this._timeline.getDiffsForFilesInRequest(requestId);
  }
  hasEditsInRequest(requestId, reader) {
    return this._timeline.hasEditsInRequest(requestId, reader);
  }
  createSnapshot(requestId, undoStop) {
    const label = undoStop ? `Request ${requestId} - Stop ${undoStop}` : `Request ${requestId}`;
    this._timeline.createCheckpoint(requestId, undoStop, label);
  }
  async getSnapshotContents(requestId, uri, stopId) {
    const content = await this._timeline.getContentAtStop(requestId, uri, stopId);
    return typeof content === "string" ? VSBuffer.fromString(content) : content;
  }
  async getSnapshotModel(requestId, undoStop, snapshotUri) {
    await this._baselineCreationLocks.peek(snapshotUri.path);
    const content = await this._timeline.getContentAtStop(requestId, snapshotUri, undoStop);
    if (content === void 0) {
      return null;
    }
    const contentStr = typeof content === "string" ? content : content.toString();
    const model = this._modelService.createModel(contentStr, this._languageService.createByFilepathOrFirstLine(snapshotUri), snapshotUri, false);
    const store = new DisposableStore();
    store.add(model.onWillDispose(() => store.dispose()));
    store.add(this._timeline.onDidChangeContentsAtStop(requestId, snapshotUri, undoStop, (c) => model.setValue(c)));
    return model;
  }
  getSnapshotUri(requestId, uri, stopId) {
    return this._timeline.getContentURIAtStop(requestId, uri, stopId);
  }
  async restoreSnapshot(requestId, stopId) {
    const checkpointId = this._timeline.getCheckpointIdForRequest(requestId, stopId);
    if (checkpointId) {
      await this._timeline.navigateToCheckpoint(checkpointId);
    }
  }
  _assertNotDisposed() {
    if (this._state.get() === ChatEditingSessionState.Disposed) {
      throw new BugIndicatingError(`Cannot access a disposed editing session`);
    }
  }
  async accept(...uris) {
    if (await this._operateEntry("accept", uris)) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
    }
  }
  async reject(...uris) {
    if (await this._operateEntry("reject", uris)) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
    }
  }
  async _operateEntry(action, uris) {
    this._assertNotDisposed();
    const applicableEntries = this._entriesObs.get().filter((e) => uris.length === 0 || uris.some((u) => isEqual(u, e.modifiedURI))).filter((e) => !e.isCurrentlyBeingModifiedBy.get()).filter((e) => e.state.get() === ModifiedFileEntryState.Modified);
    if (applicableEntries.length === 0) {
      return 0;
    }
    const method = action === "accept" ? "acceptDeferred" : "rejectDeferred";
    const transitionCallbacks = await Promise.all(
      applicableEntries.map((entry) => entry[method]().catch((err) => {
        this._logService.error(`Error calling ${method} on entry ${entry.modifiedURI}`, err);
      }))
    );
    transaction((tx) => {
      transitionCallbacks.forEach((callback) => callback?.(tx));
    });
    return applicableEntries.length;
  }
  async show(previousChanges) {
    this._assertNotDisposed();
    if (this._editorPane) {
      if (this._editorPane.isVisible()) {
        return;
      } else if (this._editorPane.input) {
        await this._editorService.openEditor(this._editorPane.input, { pinned: true, activation: EditorActivation.ACTIVATE });
        return;
      }
    }
    const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
      multiDiffSource: getMultiDiffSourceUri(this, previousChanges),
      label: localize("multiDiffEditorInput.name", "Suggested Edits")
    }, this._instantiationService);
    this._editorPane = await this._editorService.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE });
  }
  async stop(clearState = false) {
    this._stopPromise ??= Promise.allSettled([this._performStop(), this.storeState()]).then(() => {
    });
    await this._stopPromise;
    if (clearState) {
      await this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionResource).clearState();
    }
  }
  async _performStop() {
    const schemes = [AbstractChatEditingModifiedFileEntry.scheme, ChatEditingTextModelContentProvider.scheme];
    await Promise.allSettled(this._editorGroupsService.groups.flatMap(async (g) => {
      return g.editors.map(async (e) => {
        if (e instanceof MultiDiffEditorInput && e.initialResources?.some((r) => r.originalUri && schemes.indexOf(r.originalUri.scheme) !== -1) || e instanceof DiffEditorInput && e.original.resource && schemes.indexOf(e.original.resource.scheme) !== -1) {
          await g.closeEditor(e);
        }
      });
    }));
  }
  dispose() {
    this._assertNotDisposed();
    this.clearExplanations();
    dispose(this._entriesObs.get());
    super.dispose();
    this._state.set(ChatEditingSessionState.Disposed, void 0);
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }
  get isDisposed() {
    return this._state.get() === ChatEditingSessionState.Disposed;
  }
  startStreamingEdits(resource, responseModel, inUndoStop) {
    const completePromise = new DeferredPromise();
    const startPromise = new DeferredPromise();
    const sequencer = new ThrottledSequencer(15, 1e3);
    sequencer.queue(() => startPromise.p);
    this._baselineCreationLocks.queue(resource.path, () => startPromise.p);
    this._streamingEditLocks.queue(resource.toString(), async () => {
      await chatEditingSessionIsReady(this);
      if (!this.isDisposed) {
        await this._acceptStreamingEditsStart(responseModel, inUndoStop, resource);
      }
      startPromise.complete();
      return completePromise.p;
    });
    let didComplete = false;
    return {
      pushText: (edits, isLastEdits) => {
        sequencer.queue(async () => {
          if (!this.isDisposed) {
            await this._acceptEdits(resource, edits, isLastEdits, responseModel);
          }
        });
      },
      pushNotebookCellText: (cell, edits, isLastEdits) => {
        sequencer.queue(async () => {
          if (!this.isDisposed) {
            await this._acceptEdits(cell, edits, isLastEdits, responseModel);
          }
        });
      },
      pushNotebook: (edits, isLastEdits) => {
        sequencer.queue(async () => {
          if (!this.isDisposed) {
            await this._acceptEdits(resource, edits, isLastEdits, responseModel);
          }
        });
      },
      complete: () => {
        if (didComplete) {
          return;
        }
        didComplete = true;
        sequencer.queue(async () => {
          if (!this.isDisposed) {
            await this._acceptEdits(resource, [], true, responseModel);
            await this._resolve(responseModel.requestId, inUndoStop, resource);
            completePromise.complete();
          }
        });
      }
    };
  }
  startDeletion(resource, responseModel, undoStopId) {
    this._assertNotDisposed();
    this._streamingEditLocks.queue(resource.toString(), async () => {
      if (this.isDisposed) {
        return;
      }
      await chatEditingSessionIsReady(this);
      let fileContent;
      try {
        const content = await this._fileService.readFile(resource);
        fileContent = content.value.toString();
      } catch (e) {
        this._logService.warn(`Cannot delete file ${resource.toString()}: file does not exist`);
        return;
      }
      const existingEntry = this._getEntry(resource);
      if (existingEntry) {
        existingEntry.dispose();
        const entries2 = this._entriesObs.get().filter((e) => e !== existingEntry);
        this._entriesObs.set(entries2, void 0);
      }
      if (!this._initialFileContents.has(resource)) {
        this._initialFileContents.set(resource, fileContent);
      }
      await this._bulkEditService.apply({
        edits: [{ oldResource: resource, options: { ignoreIfNotExists: true } }]
      });
      this._timeline.recordFileOperation({
        type: FileOperationType.Delete,
        uri: resource,
        requestId: responseModel.requestId,
        epoch: this._timeline.incrementEpoch(),
        finalContent: fileContent
      });
      const telemetryInfo = this._getTelemetryInfoForModel(responseModel);
      const languageSelection = this._languageService.createByFilepathOrFirstLine(resource);
      const entry = this._instantiationService.createInstance(
        ChatEditingDeletedFileEntry,
        resource,
        fileContent,
        { collapse: (tx) => this._collapse(resource, tx) },
        telemetryInfo,
        languageSelection.languageId
      );
      const entries = [...this._entriesObs.get(), entry];
      this._entriesObs.set(entries, void 0);
    });
  }
  applyWorkspaceEdit(edit, responseModel, undoStopId) {
    for (const fileEdit of edit.edits) {
      if (fileEdit.oldResource && !fileEdit.newResource) {
        this.startDeletion(fileEdit.oldResource, responseModel, undoStopId);
      }
    }
  }
  async startExternalEdits(responseModel, operationId, resources, undoStopId, contentFor) {
    const snapshots = new ResourceMap();
    const acquiredLockPromises = [];
    const releaseLockPromises = [];
    const progress = [];
    const telemetryInfo = this._getTelemetryInfoForModel(responseModel);
    await chatEditingSessionIsReady(this);
    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i];
      const contentSource = contentFor?.[i];
      const releaseLock = new DeferredPromise();
      releaseLockPromises.push(releaseLock);
      const acquiredLock = new DeferredPromise();
      acquiredLockPromises.push(acquiredLock);
      this._streamingEditLocks.queue(resource.toString(), async () => {
        if (this.isDisposed) {
          acquiredLock.complete();
          return;
        }
        let initialContent;
        if (contentSource) {
          try {
            const data = await this._fileService.readFile(contentSource);
            initialContent = data.value.toString();
          } catch {
            initialContent = "";
          }
        }
        const entry = await this._getOrCreateModifiedFileEntry(resource, 1 /* Abort */, telemetryInfo, initialContent);
        if (entry) {
          await this._acceptStreamingEditsStart(responseModel, undoStopId, resource);
        }
        const notebookUri = CellUri.parse(resource)?.notebook || resource;
        progress.push(...createOpeningEditCodeBlock(resource, this._notebookService.hasSupportedNotebooks(notebookUri), undoStopId));
        if (initialContent !== void 0) {
          if (entry) {
            entry.initialContent = initialContent;
            await entry.resetEditTrackerToInitialContent();
          }
          snapshots.set(resource, initialContent);
        } else {
          await entry?.save();
          snapshots.set(resource, entry && this._getCurrentTextOrNotebookSnapshot(entry));
        }
        entry?.startExternalEdit();
        acquiredLock.complete();
        return releaseLock.p;
      });
    }
    await Promise.all(acquiredLockPromises.map((p) => p.p));
    this.createSnapshot(responseModel.requestId, undoStopId);
    this._externalEditOperations.set(operationId, {
      responseModel,
      snapshots,
      undoStopId,
      releaseLocks: () => releaseLockPromises.forEach((p) => p.complete())
    });
    return progress;
  }
  async stopExternalEdits(responseModel, operationId, contentFor) {
    const operation = this._externalEditOperations.get(operationId);
    if (!operation) {
      this._logService.warn(`stopExternalEdits called for unknown operation ${operationId}`);
      return [];
    }
    this._externalEditOperations.delete(operationId);
    const progress = [];
    try {
      const contentForMap = new ResourceMap();
      if (contentFor) {
        let idx = 0;
        for (const [resource] of operation.snapshots) {
          if (idx < contentFor.length && contentFor[idx]) {
            contentForMap.set(resource, contentFor[idx]);
          }
          idx++;
        }
      }
      for (const [resource, beforeSnapshot] of operation.snapshots) {
        let entry = this._getEntry(resource);
        if (!entry && beforeSnapshot === void 0) {
          entry = await this._getOrCreateModifiedFileEntry(resource, 1 /* Abort */, this._getTelemetryInfoForModel(responseModel), "");
          if (entry) {
            entry.startExternalEdit();
            entry.acceptStreamingEditsStart(responseModel, operation.undoStopId, void 0);
          }
        }
        if (!entry) {
          continue;
        }
        let afterSnapshot;
        const contentSource = contentForMap.get(resource);
        if (contentSource) {
          try {
            const data = await this._fileService.readFile(contentSource);
            afterSnapshot = data.value.toString();
          } catch (_e) {
            afterSnapshot = "";
          }
        } else {
          await entry.revertToDisk();
          afterSnapshot = this._getCurrentTextOrNotebookSnapshot(entry) ?? "";
        }
        let edits = [];
        if (beforeSnapshot === void 0) {
          this._timeline.recordFileOperation({
            type: FileOperationType.Create,
            uri: resource,
            requestId: responseModel.requestId,
            epoch: this._timeline.incrementEpoch(),
            initialContent: afterSnapshot,
            telemetryInfo: entry.telemetryInfo
          });
        } else {
          edits = await entry.computeEditsFromSnapshots(beforeSnapshot, afterSnapshot);
          this._recordEditOperations(entry, resource, edits, responseModel);
        }
        progress.push(entry instanceof ChatEditingModifiedNotebookEntry ? {
          kind: "notebookEdit",
          uri: resource,
          edits,
          done: true,
          isExternalEdit: true
        } : {
          kind: "textEdit",
          uri: resource,
          edits,
          done: true,
          isExternalEdit: true
        });
        await entry.acceptStreamingEditsEnd();
        if (getChatSessionType(this.chatSessionResource) === AgentSessionProviders.Background) {
          await entry.accept();
        }
        entry.stopExternalEdit();
      }
    } finally {
      operation.releaseLocks();
      const hasOtherTasks = Iterable.some(this._streamingEditLocks.keys(), (k) => !operation.snapshots.has(URI.parse(k)));
      if (!hasOtherTasks) {
        this._state.set(ChatEditingSessionState.Idle, void 0);
      }
    }
    return progress;
  }
  async undoInteraction() {
    await this._timeline.undoToLastCheckpoint();
  }
  async redoInteraction() {
    await this._timeline.redoToNextCheckpoint();
  }
  async triggerExplanationGeneration() {
    this.clearExplanations();
    const entries = this._entriesObs.get();
    const diffInfos = [];
    for (const entry of entries) {
      if (entry instanceof ChatEditingModifiedDocumentEntry) {
        const diff = await entry.getDiffInfo();
        diffInfos.push({
          changes: diff.changes,
          identical: diff.identical,
          originalModel: entry.originalModel,
          modifiedModel: entry.modifiedModel
        });
      }
    }
    if (diffInfos.length > 0) {
      this._explanationHandle = this._explanationModelManager.generateExplanations(diffInfos, this.chatSessionResource, CancellationToken.None);
      await this._explanationHandle.completed;
    }
  }
  clearExplanations() {
    if (this._explanationHandle) {
      this._explanationHandle.dispose();
      this._explanationHandle = void 0;
    }
  }
  hasExplanations() {
    return this._explanationHandle !== void 0;
  }
  _recordEditOperations(entry, resource, edits, responseModel) {
    const isNotebookEdits = edits.length > 0 && hasKey(edits[0], { cells: true });
    if (isNotebookEdits) {
      const notebookEdits = edits;
      this._timeline.recordFileOperation({
        type: FileOperationType.NotebookEdit,
        uri: resource,
        requestId: responseModel.requestId,
        epoch: this._timeline.incrementEpoch(),
        cellEdits: notebookEdits
      });
    } else {
      let cellIndex;
      if (entry instanceof ChatEditingModifiedNotebookEntry) {
        const cellUri = CellUri.parse(resource);
        if (cellUri) {
          const i = entry.getIndexOfCellHandle(cellUri.handle);
          if (i !== -1) {
            cellIndex = i;
          }
        }
      }
      const textEdits = edits;
      this._timeline.recordFileOperation({
        type: FileOperationType.TextEdit,
        uri: resource,
        requestId: responseModel.requestId,
        epoch: this._timeline.incrementEpoch(),
        edits: textEdits,
        cellIndex
      });
    }
  }
  _getCurrentTextOrNotebookSnapshot(entry) {
    if (entry instanceof ChatEditingModifiedNotebookEntry) {
      return entry.getCurrentSnapshot();
    } else if (entry instanceof ChatEditingModifiedDocumentEntry) {
      return entry.getCurrentContents();
    } else if (entry instanceof ChatEditingDeletedFileEntry) {
      return "";
    } else {
      throw new Error(`unknown entry type for ${entry.modifiedURI}`);
    }
  }
  async _acceptStreamingEditsStart(responseModel, undoStop, resource) {
    const entry = await this._getOrCreateModifiedFileEntry(resource, 0 /* Create */, this._getTelemetryInfoForModel(responseModel));
    if (!this._timeline.hasFileBaseline(resource, responseModel.requestId)) {
      this._timeline.recordFileBaseline({
        uri: resource,
        requestId: responseModel.requestId,
        content: this._getCurrentTextOrNotebookSnapshot(entry),
        epoch: this._timeline.incrementEpoch(),
        telemetryInfo: entry.telemetryInfo,
        notebookViewType: entry instanceof ChatEditingModifiedNotebookEntry ? entry.viewType : void 0
      });
    }
    transaction((tx) => {
      this._state.set(ChatEditingSessionState.StreamingEdits, tx);
      entry.acceptStreamingEditsStart(responseModel, undoStop, tx);
    });
    return entry;
  }
  async _initEntries({ entries }) {
    for (const entry of this._entriesObs.get()) {
      const snapshotEntry = entries.get(entry.modifiedURI);
      if (!snapshotEntry) {
        await entry.resetToInitialContent();
        entry.dispose();
      }
    }
    const entriesArr = [];
    for (const snapshotEntry of entries.values()) {
      let entry;
      if (snapshotEntry.isDeleted) {
        entry = this._instantiationService.createInstance(
          ChatEditingDeletedFileEntry,
          snapshotEntry.resource,
          snapshotEntry.original,
          // original content before deletion
          { collapse: (tx) => this._collapse(snapshotEntry.resource, tx) },
          snapshotEntry.telemetryInfo,
          snapshotEntry.languageId
        );
        await entry.restoreFromSnapshot(snapshotEntry, false);
      } else {
        entry = await this._getOrCreateModifiedFileEntry(snapshotEntry.resource, 1 /* Abort */, snapshotEntry.telemetryInfo);
        if (entry) {
          const restoreToDisk = snapshotEntry.state === ModifiedFileEntryState.Modified;
          await entry.restoreFromSnapshot(snapshotEntry, restoreToDisk);
        }
      }
      if (entry) {
        entriesArr.push(entry);
      }
    }
    this._entriesObs.set(entriesArr, void 0);
    this._reportSessionInfo("chatEditing/sessionRestore", entriesArr);
  }
  async _acceptEdits(resource, textEdits, isLastEdits, responseModel) {
    const entry = await this._getOrCreateModifiedFileEntry(resource, 0 /* Create */, this._getTelemetryInfoForModel(responseModel));
    if (textEdits.length > 0) {
      this._recordEditOperations(entry, resource, textEdits, responseModel);
    }
    await entry.acceptAgentEdits(resource, textEdits, isLastEdits, responseModel);
  }
  _getTelemetryInfoForModel(responseModel) {
    return new class {
      get agentId() {
        return responseModel.agent?.id;
      }
      get modelId() {
        return responseModel.request?.modelId;
      }
      get modeId() {
        return responseModel.request?.modeInfo?.telemetryModeId;
      }
      get command() {
        return responseModel.slashCommand?.name;
      }
      get sessionResource() {
        return responseModel.session.sessionResource;
      }
      get requestId() {
        return responseModel.requestId;
      }
      get result() {
        return responseModel.result;
      }
      get applyCodeBlockSuggestionId() {
        return responseModel.request?.modeInfo?.applyCodeBlockSuggestionId;
      }
      get feature() {
        if (responseModel.session.initialLocation === ChatAgentLocation.Chat) {
          return "sideBarChat";
        } else if (responseModel.session.initialLocation === ChatAgentLocation.EditorInline) {
          return "inlineChat";
        }
        return void 0;
      }
    }();
  }
  _reportSessionInfo(eventName, entries) {
    const editSessionId = getKeyForChatSessionResource(this.chatSessionResource);
    if (isStringInSample(editSessionId, 5)) {
      this._telemetryService.publicLog2(eventName, {
        editSessionId,
        ...this._countEntryStates(entries)
      });
    }
  }
  _countEntryStates(entries) {
    let entryCount = 0;
    let modifiedCount = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;
    for (const entry of entries) {
      entryCount += 1;
      switch (entry.state.get()) {
        case ModifiedFileEntryState.Modified:
          modifiedCount += 1;
          break;
        case ModifiedFileEntryState.Accepted:
          acceptedCount += 1;
          break;
        case ModifiedFileEntryState.Rejected:
          rejectedCount += 1;
          break;
      }
    }
    return { entryCount, modifiedCount, acceptedCount, rejectedCount };
  }
  async _resolve(requestId, undoStop, resource) {
    const hasOtherTasks = Iterable.some(this._streamingEditLocks.keys(), (k) => k !== resource.toString());
    if (!hasOtherTasks) {
      this._state.set(ChatEditingSessionState.Idle, void 0);
    }
    const entry = this._getEntry(resource);
    if (!entry) {
      return;
    }
    const label = undoStop ? `Request ${requestId} - Stop ${undoStop}` : `Request ${requestId}`;
    this._timeline.createCheckpoint(requestId, undoStop, label);
    return entry.acceptStreamingEditsEnd();
  }
  async _getOrCreateModifiedFileEntry(resource, ifNotExists, telemetryInfo, _initialContent) {
    resource = CellUri.parse(resource)?.notebook ?? resource;
    const existingEntry = this._entriesObs.get().find((e) => isEqual(e.modifiedURI, resource));
    if (existingEntry) {
      if (existingEntry instanceof ChatEditingDeletedFileEntry) {
        const initialContentFromDeleted = existingEntry.state.get() === ModifiedFileEntryState.Modified ? existingEntry.initialContent : void 0;
        existingEntry.dispose();
        const entries = this._entriesObs.get().filter((e) => e !== existingEntry);
        this._entriesObs.set(entries, void 0);
        if (initialContentFromDeleted !== void 0) {
          _initialContent = initialContentFromDeleted;
        }
      } else {
        if (telemetryInfo.requestId !== existingEntry.telemetryInfo.requestId) {
          existingEntry.updateTelemetryInfo(telemetryInfo);
        }
        return existingEntry;
      }
    }
    let entry;
    const existingExternalEntry = this._lookupExternalEntry(resource);
    if (existingExternalEntry) {
      entry = existingExternalEntry;
      if (telemetryInfo.requestId !== entry.telemetryInfo.requestId) {
        entry.updateTelemetryInfo(telemetryInfo);
      }
    } else {
      const initialContent = _initialContent ?? this._initialFileContents.get(resource);
      const maybeEntry = await this._createModifiedFileEntry(resource, telemetryInfo, ifNotExists, initialContent);
      if (!maybeEntry) {
        return void 0;
      }
      entry = maybeEntry;
      if (initialContent === void 0) {
        this._initialFileContents.set(resource, entry.initialContent);
      }
    }
    const listener = entry.onDidDelete(() => {
      const newEntries = this._entriesObs.get().filter((e) => !isEqual(e.modifiedURI, entry.modifiedURI));
      this._entriesObs.set(newEntries, void 0);
      this._editorService.closeEditors(this._editorService.findEditors(entry.modifiedURI));
      if (!existingExternalEntry) {
        entry.dispose();
      }
      this._store.delete(listener);
    });
    this._store.add(listener);
    const entriesArr = [...this._entriesObs.get(), entry];
    this._entriesObs.set(entriesArr, void 0);
    return entry;
  }
  async _createModifiedFileEntry(resource, telemetryInfo, ifNotExists, initialContent) {
    const multiDiffEntryDelegate = {
      collapse: (transaction2) => this._collapse(resource, transaction2),
      recordOperation: (operation) => {
        operation.epoch = this._timeline.incrementEpoch();
        this._timeline.recordFileOperation(operation);
      }
    };
    const notebookUri = CellUri.parse(resource)?.notebook || resource;
    const doCreate = async (chatKind) => {
      if (this._notebookService.hasSupportedNotebooks(notebookUri)) {
        return await ChatEditingModifiedNotebookEntry.create(notebookUri, multiDiffEntryDelegate, telemetryInfo, chatKind, initialContent, this._instantiationService);
      } else {
        const ref = await this._textModelService.createModelReference(resource);
        return this._instantiationService.createInstance(ChatEditingModifiedDocumentEntry, ref, multiDiffEntryDelegate, telemetryInfo, chatKind, initialContent);
      }
    };
    try {
      return await doCreate(ChatEditKind.Modified);
    } catch (err) {
      if (ifNotExists === 1 /* Abort */) {
        return void 0;
      }
      await this._bulkEditService.apply({ edits: [{ newResource: resource }] });
      if (this.configurationService.getValue("accessibility.openChatEditedFiles")) {
        this._editorService.openEditor({ resource, options: { inactive: true, preserveFocus: true, pinned: true, isExplicit: false } });
      }
      this._timeline.recordFileOperation({
        type: FileOperationType.Create,
        uri: resource,
        requestId: telemetryInfo.requestId,
        epoch: this._timeline.incrementEpoch(),
        initialContent: initialContent || "",
        telemetryInfo
      });
      if (this._notebookService.hasSupportedNotebooks(notebookUri)) {
        return await ChatEditingModifiedNotebookEntry.create(resource, multiDiffEntryDelegate, telemetryInfo, ChatEditKind.Created, initialContent, this._instantiationService);
      } else {
        return await doCreate(ChatEditKind.Created);
      }
    }
  }
  _collapse(resource, transaction2) {
    const multiDiffItem = this._editorPane?.findDocumentDiffItem(resource);
    if (multiDiffItem) {
      this._editorPane?.viewModel?.items.get().find((documentDiffItem) => isEqual(documentDiffItem.originalUri, multiDiffItem.originalUri) && isEqual(documentDiffItem.modifiedUri, multiDiffItem.modifiedUri))?.collapsed.set(true, transaction2);
    }
  }
};
ChatEditingSession = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IModelService),
  __decorateParam(6, ILanguageService),
  __decorateParam(7, ITextModelService),
  __decorateParam(8, IBulkEditService),
  __decorateParam(9, IEditorGroupsService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, INotebookService),
  __decorateParam(12, IAccessibilitySignalService),
  __decorateParam(13, ILogService),
  __decorateParam(14, IConfigurationService),
  __decorateParam(15, IFileService),
  __decorateParam(16, IChatEditingExplanationModelManager),
  __decorateParam(17, ITelemetryService)
], ChatEditingSession);
export {
  ChatEditingSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ1Nlc3Npb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIElUYXNrLCBTZXF1ZW5jZXIsIFNlcXVlbmNlckJ5S2V5LCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZ0luU2FtcGxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBJVHJhbnNhY3Rpb24sIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaGFzS2V5LCBNdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElCdWxrRWRpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3RpdmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvciB9IGZyb20gJy4uLy4uLy4uL211bHRpRGlmZkVkaXRvci9icm93c2VyL211bHRpRGlmZkVkaXRvci5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL211bHRpRGlmZkVkaXRvci9icm93c2VyL211bHRpRGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IENlbGxVcmksIElDZWxsRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjaGF0RWRpdGluZ1Nlc3Npb25Jc1JlYWR5LCBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZSwgQ2hhdEVkaXRLaW5kLCBnZXRNdWx0aURpZmZTb3VyY2VVcmksIElDaGF0RWRpdGluZ1Nlc3Npb24sIElFZGl0U2Vzc2lvbkVudHJ5RGlmZiwgSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvLCBJTW9kaWZpZWRGaWxlRW50cnksIElTbmFwc2hvdEVudHJ5LCBJU3RyZWFtaW5nRWRpdHMsIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZU1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFByb2dyZXNzLCBJQ2hhdFdvcmtzcGFjZUVkaXQgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0RWRpdGluZ0NoZWNrcG9pbnRUaW1lbGluZSB9IGZyb20gJy4vY2hhdEVkaXRpbmdDaGVja3BvaW50VGltZWxpbmUuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdDaGVja3BvaW50VGltZWxpbmVJbXBsLCBJQ2hhdEVkaXRpbmdUaW1lbGluZUZzRGVsZWdhdGUgfSBmcm9tICcuL2NoYXRFZGl0aW5nQ2hlY2twb2ludFRpbWVsaW5lSW1wbC5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ0RlbGV0ZWRGaWxlRW50cnkgfSBmcm9tICcuL2NoYXRFZGl0aW5nRGVsZXRlZEZpbGVFbnRyeS5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ01vZGlmaWVkRG9jdW1lbnRFbnRyeSB9IGZyb20gJy4vY2hhdEVkaXRpbmdNb2RpZmllZERvY3VtZW50RW50cnkuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IH0gZnJvbSAnLi9jaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5LmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5IH0gZnJvbSAnLi9jaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeS5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uVHlwZSwgZ2V0S2V5Rm9yQ2hhdFNlc3Npb25SZXNvdXJjZSB9IGZyb20gJy4vY2hhdEVkaXRpbmdPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IElDaGF0RWRpdGluZ0V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyLCBJRXhwbGFuYXRpb25EaWZmSW5mbywgSUV4cGxhbmF0aW9uR2VuZXJhdGlvbkhhbmRsZSB9IGZyb20gJy4vY2hhdEVkaXRpbmdFeHBsYW5hdGlvbk1vZGVsTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ1Nlc3Npb25TdG9yYWdlLCBJQ2hhdEVkaXRpbmdTZXNzaW9uU3RvcCwgU3RvcmVkU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi9jaGF0RWRpdGluZ1Nlc3Npb25TdG9yYWdlLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyIH0gZnJvbSAnLi9jaGF0RWRpdGluZ1RleHRNb2RlbENvbnRlbnRQcm92aWRlcnMuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcblxuY29uc3QgZW51bSBOb3RFeGlzdEJlaGF2aW9yIHtcblx0Q3JlYXRlLFxuXHRBYm9ydCxcbn1cblxudHlwZSBDaGF0RWRpdGluZ1Nlc3Npb25JbmZvRXZlbnQgPSB7XG5cdGVkaXRTZXNzaW9uSWQ6IHN0cmluZztcblx0ZW50cnlDb3VudDogbnVtYmVyO1xuXHRtb2RpZmllZENvdW50OiBudW1iZXI7XG5cdGFjY2VwdGVkQ291bnQ6IG51bWJlcjtcblx0cmVqZWN0ZWRDb3VudDogbnVtYmVyO1xufTtcblxudHlwZSBDaGF0RWRpdGluZ1Nlc3Npb25JbmZvQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnanJpZWtlbic7XG5cdGNvbW1lbnQ6ICdUcmFja3MgdGhlIG51bWJlciBhbmQgc3RhdGUgb2YgY2hhdCBlZGl0aW5nIGVudHJpZXMgd2hlbiBzZXNzaW9ucyBhcmUgc3RvcmVkIG9yIHJlc3RvcmVkLiBFdmVudHMgdXNlIHN0YWJsZSA1JSBzYW1wbGluZyBieSBzZXNzaW9uLic7XG5cdGVkaXRTZXNzaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdIYXNoZWQgaWRlbnRpZmllciBvZiB0aGUgY2hhdCBzZXNzaW9uIGZvciBjb3JyZWxhdGlvbi4nIH07XG5cdGVudHJ5Q291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUb3RhbCBudW1iZXIgb2YgZW50cmllcyBzdG9yZWQgd2l0aCB0aGUgc2Vzc2lvbi4nIH07XG5cdG1vZGlmaWVkQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgZW50cmllcyBpbiBNb2RpZmllZCBzdGF0ZSB3aGVuIHN0b3JpbmcuJyB9O1xuXHRhY2NlcHRlZENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIGVudHJpZXMgaW4gQWNjZXB0ZWQgc3RhdGUgd2hlbiBzdG9yaW5nLicgfTtcblx0cmVqZWN0ZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBlbnRyaWVzIGluIFJlamVjdGVkIHN0YXRlIHdoZW4gc3RvcmluZy4nIH07XG59O1xuXG5cbmNsYXNzIFRocm90dGxlZFNlcXVlbmNlciBleHRlbmRzIFNlcXVlbmNlciB7XG5cblx0cHJpdmF0ZSBfc2l6ZSA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWluRHVyYXRpb246IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tYXhPdmVyYWxsRGVsYXk6IG51bWJlclxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcXVldWU8VD4ocHJvbWlzZVRhc2s6IElUYXNrPFByb21pc2U8VD4+KTogUHJvbWlzZTxUPiB7XG5cblx0XHR0aGlzLl9zaXplICs9IDE7XG5cblx0XHRjb25zdCBub0RlbGF5ID0gdGhpcy5fc2l6ZSAqIHRoaXMuX21pbkR1cmF0aW9uID4gdGhpcy5fbWF4T3ZlcmFsbERlbGF5O1xuXG5cdFx0cmV0dXJuIHN1cGVyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHAxID0gcHJvbWlzZVRhc2soKTtcblx0XHRcdFx0Y29uc3QgcDIgPSBub0RlbGF5XG5cdFx0XHRcdFx0PyBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKVxuXHRcdFx0XHRcdDogdGltZW91dCh0aGlzLl9taW5EdXJhdGlvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdFx0Y29uc3QgW3Jlc3VsdF0gPSBhd2FpdCBQcm9taXNlLmFsbChbcDEsIHAyXSk7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX3NpemUgLT0gMTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVPcGVuaW5nRWRpdENvZGVCbG9jayh1cmk6IFVSSSwgaXNOb3RlYm9vazogYm9vbGVhbiwgdW5kb1N0b3BJZDogc3RyaW5nKTogSUNoYXRQcm9ncmVzc1tdIHtcblx0cmV0dXJuIFtcblx0XHR7XG5cdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnXFxuYGBgYFxcbicpXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRraW5kOiAnY29kZWJsb2NrVXJpJyxcblx0XHRcdHVyaSxcblx0XHRcdGlzRWRpdDogdHJ1ZSxcblx0XHRcdHVuZG9TdG9wSWRcblx0XHR9LFxuXHRcdHtcblx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdcXG5gYGBgXFxuJylcblx0XHR9LFxuXHRcdGlzTm90ZWJvb2tcblx0XHRcdD8ge1xuXHRcdFx0XHRraW5kOiAnbm90ZWJvb2tFZGl0Jyxcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRlZGl0czogW10sXG5cdFx0XHRcdGRvbmU6IGZhbHNlLFxuXHRcdFx0XHRpc0V4dGVybmFsRWRpdDogdHJ1ZVxuXHRcdFx0fVxuXHRcdFx0OiB7XG5cdFx0XHRcdGtpbmQ6ICd0ZXh0RWRpdCcsXG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0ZWRpdHM6IFtdLFxuXHRcdFx0XHRkb25lOiBmYWxzZSxcblx0XHRcdFx0aXNFeHRlcm5hbEVkaXQ6IHRydWVcblx0XHRcdH0sXG5cdF07XG59XG5cblxuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nU2Vzc2lvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdEVkaXRpbmdTZXNzaW9uIHtcblx0cmVhZG9ubHkgc3VwcG9ydHNLZWVwVW5kbyA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZT4odGhpcywgQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuSW5pdGlhbCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpbWVsaW5lOiBJQ2hhdEVkaXRpbmdDaGVja3BvaW50VGltZWxpbmU7XG5cblx0LyoqXG5cdCAqIENvbnRhaW5zIHRoZSBjb250ZW50cyBvZiBhIGZpbGUgd2hlbiB0aGUgQUkgZmlyc3QgYmVnYW4gZG9pbmcgZWRpdHMgdG8gaXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbml0aWFsRmlsZUNvbnRlbnRzID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9iYXNlbGluZUNyZWF0aW9uTG9ja3MgPSBuZXcgU2VxdWVuY2VyQnlLZXk8LyogVVJJLnBhdGggKi8gc3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHJlYW1pbmdFZGl0TG9ja3MgPSBuZXcgU2VxdWVuY2VyQnlLZXk8LyogVVJJICovIHN0cmluZz4oKTtcblxuXHQvKipcblx0ICogVHJhY2tzIGFjdGl2ZSBleHRlcm5hbCBlZGl0IG9wZXJhdGlvbnMuXG5cdCAqIEtleSBpcyBvcGVyYXRpb25JZCwgdmFsdWUgY29udGFpbnMgdGhlIG9wZXJhdGlvbiBzdGF0ZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVybmFsRWRpdE9wZXJhdGlvbnMgPSBuZXcgTWFwPG51bWJlciwge1xuXHRcdHJlc3BvbnNlTW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbDtcblx0XHRzbmFwc2hvdHM6IFJlc291cmNlTWFwPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdFx0dW5kb1N0b3BJZDogc3RyaW5nO1xuXHRcdHJlbGVhc2VMb2NrczogKCkgPT4gdm9pZDtcblx0fT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lbnRyaWVzT2JzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IEFic3RyYWN0Q2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeVtdPih0aGlzLCBbXSk7XG5cdHB1YmxpYyByZWFkb25seSBlbnRyaWVzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJTW9kaWZpZWRGaWxlRW50cnlbXT4gPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKHN0YXRlID09PSBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZS5EaXNwb3NlZCB8fCBzdGF0ZSA9PT0gQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuSW5pdGlhbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZW50cmllc09icy5yZWFkKHJlYWRlcik7XG5cdFx0fVxuXHR9KTtcblxuXHRwcml2YXRlIF9lZGl0b3JQYW5lOiBNdWx0aURpZmZFZGl0b3IgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2V4cGxhbmF0aW9uSGFuZGxlOiBJRXhwbGFuYXRpb25HZW5lcmF0aW9uSGFuZGxlIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBzdGF0ZSgpOiBJT2JzZXJ2YWJsZTxDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZT4ge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0ZTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBjYW5VbmRvOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cHVibGljIHJlYWRvbmx5IGNhblJlZG86IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdHB1YmxpYyBnZXQgcmVxdWVzdERpc2FibGVtZW50KCkge1xuXHRcdHJldHVybiB0aGlzLl90aW1lbGluZS5yZXF1ZXN0RGlzYWJsZW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRnZXQgb25EaWREaXNwb3NlKCkge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkRGlzcG9zZS5ldmVudDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRyZWFkb25seSBpc0dsb2JhbEVkaXRpbmdTZXNzaW9uOiBib29sZWFuLFxuXHRcdHByaXZhdGUgX2xvb2t1cEV4dGVybmFsRW50cnk6ICh1cmk6IFVSSSkgPT4gQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IHwgdW5kZWZpbmVkLFxuXHRcdHRyYW5zZmVyRnJvbTogSUNoYXRFZGl0aW5nU2Vzc2lvbiB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElCdWxrRWRpdFNlcnZpY2UgcHVibGljIHJlYWRvbmx5IF9idWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElDaGF0RWRpdGluZ0V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyIHByaXZhdGUgcmVhZG9ubHkgX2V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyOiBJQ2hhdEVkaXRpbmdFeHBsYW5hdGlvbk1vZGVsTWFuYWdlcixcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdGltZWxpbmUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRFZGl0aW5nQ2hlY2twb2ludFRpbWVsaW5lSW1wbCxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR0aGlzLl9nZXRUaW1lbGluZURlbGVnYXRlKCksXG5cdFx0KTtcblxuXHRcdHRoaXMuY2FuUmVkbyA9IHRoaXMuX3RpbWVsaW5lLmNhblJlZG8ubWFwKChoYXNIaXN0b3J5LCByZWFkZXIpID0+XG5cdFx0XHRoYXNIaXN0b3J5ICYmIHRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKSA9PT0gQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuSWRsZSk7XG5cdFx0dGhpcy5jYW5VbmRvID0gdGhpcy5fdGltZWxpbmUuY2FuVW5kby5tYXAoKGhhc0hpc3RvcnksIHJlYWRlcikgPT5cblx0XHRcdGhhc0hpc3RvcnkgJiYgdGhpcy5fc3RhdGUucmVhZChyZWFkZXIpID09PSBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZS5JZGxlKTtcblxuXHRcdHRoaXMuX2luaXQodHJhbnNmZXJGcm9tKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRpbWVsaW5lRGVsZWdhdGUoKTogSUNoYXRFZGl0aW5nVGltZWxpbmVGc0RlbGVnYXRlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3JlYXRlRmlsZTogKHVyaSwgY29udGVudCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KHtcblx0XHRcdFx0XHRlZGl0czogW3tcblx0XHRcdFx0XHRcdG5ld1Jlc291cmNlOiB1cmksXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdG92ZXJ3cml0ZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0Y29udGVudHM6IGNvbnRlbnQgPyBQcm9taXNlLnJlc29sdmUoVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRkZWxldGVGaWxlOiBhc3luYyAodXJpKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlbW92ZWRFbnRyeSA9IHRoaXMuX2VudHJpZXNPYnMuZ2V0KCkuZmluZChlID0+IGlzRXF1YWwoZS5tb2RpZmllZFVSSSwgdXJpKSk7XG5cdFx0XHRcdGNvbnN0IGVudHJpZXMgPSB0aGlzLl9lbnRyaWVzT2JzLmdldCgpLmZpbHRlcihlID0+ICFpc0VxdWFsKGUubW9kaWZpZWRVUkksIHVyaSkpO1xuXHRcdFx0XHR0aGlzLl9lbnRyaWVzT2JzLnNldChlbnRyaWVzLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRyZW1vdmVkRW50cnk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KHsgZWRpdHM6IFt7IG9sZFJlc291cmNlOiB1cmksIG9wdGlvbnM6IHsgaWdub3JlSWZOb3RFeGlzdHM6IHRydWUgfSB9XSB9KTtcblx0XHRcdH0sXG5cdFx0XHRyZW5hbWVGaWxlOiBhc3luYyAoZnJvbVVyaSwgdG9VcmkpID0+IHtcblx0XHRcdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuX2VudHJpZXNPYnMuZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzRW50cnkgPSBlbnRyaWVzLmZpbmQoZSA9PiBpc0VxdWFsKGUubW9kaWZpZWRVUkksIGZyb21VcmkpKTtcblx0XHRcdFx0aWYgKHByZXZpb3VzRW50cnkpIHtcblx0XHRcdFx0XHRjb25zdCBuZXdFbnRyeSA9IGF3YWl0IHRoaXMuX2dldE9yQ3JlYXRlTW9kaWZpZWRGaWxlRW50cnkodG9VcmksIE5vdEV4aXN0QmVoYXZpb3IuQ3JlYXRlLCBwcmV2aW91c0VudHJ5LnRlbGVtZXRyeUluZm8sIHRoaXMuX2dldEN1cnJlbnRUZXh0T3JOb3RlYm9va1NuYXBzaG90KHByZXZpb3VzRW50cnkpKTtcblx0XHRcdFx0XHRwcmV2aW91c0VudHJ5LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9lbnRyaWVzT2JzLnNldChlbnRyaWVzLm1hcChlID0+IGUgPT09IHByZXZpb3VzRW50cnkgPyBuZXdFbnRyeSA6IGUpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0c2V0Q29udGVudHM6IGFzeW5jICh1cmksIGNvbnRlbnQsIHRlbGVtZXRyeUluZm8pID0+IHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZU1vZGlmaWVkRmlsZUVudHJ5KHVyaSwgTm90RXhpc3RCZWhhdmlvci5DcmVhdGUsIHRlbGVtZXRyeUluZm8pO1xuXG5cdFx0XHRcdC8vIFdlIGFwcGx5IHRoZXNlIGVkaXRzIGFzICdhZ2VudCBlZGl0cycgd2hpY2ggd2lsbCBieSBkZWZhdWx0IG1ha2UgdGhlbSBnZXQga2VlcFxuXHRcdFx0XHQvLyAvdW5kbyBpbmRpY2F0b3JzLiBUaGlzIGlzIGdvb2QgaW4gdGhlIGNhc2UgdGhlIGVkaXRzIHdlcmUgbmV2ZXIgaW5pdGlhbGx5IGFjY2VwdGVkLFxuXHRcdFx0XHQvLyBidXQgaWYgdGhlIGZpbGUgd2FzIGFscmVhZHkgaW4gYW4gYWNjZXB0ZWQgc3RhdGUgd2Ugc2hvdWxkIG5vdCBtYWtlIGl0IG1vZGlmaWVkIGFnYWluLlxuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGVudHJ5LnN0YXRlLmdldCgpO1xuXHRcdFx0XHRpZiAoZW50cnkgaW5zdGFuY2VvZiBDaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeSkge1xuXHRcdFx0XHRcdGF3YWl0IGVudHJ5LnJlc3RvcmVNb2RpZmllZE1vZGVsRnJvbVNuYXBzaG90KGNvbnRlbnQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IGVudHJ5LmFjY2VwdEFnZW50RWRpdHModXJpLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiksIHRleHQ6IGNvbnRlbnQgfV0sIHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc3RhdGUgIT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpIHtcblx0XHRcdFx0XHRhd2FpdCBlbnRyeS5hY2NlcHQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbml0KHRyYW5zZmVyRnJvbT86IElDaGF0RWRpdGluZ1Nlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRpbmdTZXNzaW9uU3RvcmFnZSwgdGhpcy5jaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRsZXQgcmVzdG9yZWRTZXNzaW9uU3RhdGU6IFN0b3JlZFNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodHJhbnNmZXJGcm9tIGluc3RhbmNlb2YgQ2hhdEVkaXRpbmdTZXNzaW9uKSB7XG5cdFx0XHRyZXN0b3JlZFNlc3Npb25TdGF0ZSA9IHRyYW5zZmVyRnJvbS5fZ2V0U3RvcmVkU3RhdGUodGhpcy5jaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdG9yZWRTZXNzaW9uU3RhdGUgPSBhd2FpdCBzdG9yYWdlLnJlc3RvcmVTdGF0ZSgpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHJlc3RvcmluZyBjaGF0IGVkaXRpbmcgc2Vzc2lvbiBzdGF0ZSBmb3IgJHt0aGlzLmNoYXRTZXNzaW9uUmVzb3VyY2V9YCwgZXJyKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47IC8vIGRpc3Bvc2VkIHdoaWxlIHJlc3RvcmluZ1xuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0aWYgKHJlc3RvcmVkU2Vzc2lvblN0YXRlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFt1cmksIGNvbnRlbnRdIG9mIHJlc3RvcmVkU2Vzc2lvblN0YXRlLmluaXRpYWxGaWxlQ29udGVudHMpIHtcblx0XHRcdFx0dGhpcy5faW5pdGlhbEZpbGVDb250ZW50cy5zZXQodXJpLCBjb250ZW50KTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN0b3JlZFNlc3Npb25TdGF0ZS50aW1lbGluZSkge1xuXHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB0aGlzLl90aW1lbGluZS5yZXN0b3JlRnJvbVN0YXRlKHJlc3RvcmVkU2Vzc2lvblN0YXRlLnRpbWVsaW5lISwgdHgpKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX2luaXRFbnRyaWVzKHJlc3RvcmVkU2Vzc2lvblN0YXRlLnJlY2VudFNuYXBzaG90KTtcblx0XHR9XG5cblx0XHR0aGlzLl9zdGF0ZS5zZXQoQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuSWRsZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVudHJ5KHVyaTogVVJJKTogQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IHwgdW5kZWZpbmVkIHtcblx0XHR1cmkgPSBDZWxsVXJpLnBhcnNlKHVyaSk/Lm5vdGVib29rID8/IHVyaTtcblx0XHRyZXR1cm4gdGhpcy5fZW50cmllc09icy5nZXQoKS5maW5kKGUgPT4gaXNFcXVhbChlLm1vZGlmaWVkVVJJLCB1cmkpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbnRyeSh1cmk6IFVSSSk6IElNb2RpZmllZEZpbGVFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEVudHJ5KHVyaSk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZEVudHJ5KHVyaTogVVJJLCByZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpOiBJTW9kaWZpZWRGaWxlRW50cnkgfCB1bmRlZmluZWQge1xuXHRcdHVyaSA9IENlbGxVcmkucGFyc2UodXJpKT8ubm90ZWJvb2sgPz8gdXJpO1xuXHRcdHJldHVybiB0aGlzLl9lbnRyaWVzT2JzLnJlYWQocmVhZGVyKS5maW5kKGUgPT4gaXNFcXVhbChlLm1vZGlmaWVkVVJJLCB1cmkpKTtcblx0fVxuXG5cdHB1YmxpYyBzdG9yZVN0YXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RWRpdGluZ1Nlc3Npb25TdG9yYWdlLCB0aGlzLmNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHN0b3JlZFN0YXRlID0gdGhpcy5fZ2V0U3RvcmVkU3RhdGUoKTtcblx0XHR0aGlzLl9yZXBvcnRTZXNzaW9uSW5mbygnY2hhdEVkaXRpbmcvc2Vzc2lvblN0b3JlJywgdGhpcy5fZW50cmllc09icy5nZXQoKSk7XG5cdFx0cmV0dXJuIHN0b3JhZ2Uuc3RvcmVTdGF0ZShzdG9yZWRTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTdG9yZWRTdGF0ZShzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmNoYXRTZXNzaW9uUmVzb3VyY2UpOiBTdG9yZWRTZXNzaW9uU3RhdGUge1xuXHRcdGNvbnN0IGVudHJpZXMgPSBuZXcgUmVzb3VyY2VNYXA8SVNuYXBzaG90RW50cnk+KCk7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9lbnRyaWVzT2JzLmdldCgpKSB7XG5cdFx0XHRlbnRyaWVzLnNldChlbnRyeS5tb2RpZmllZFVSSSwgZW50cnkuY3JlYXRlU25hcHNob3Qoc2Vzc2lvblJlc291cmNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlOiBTdG9yZWRTZXNzaW9uU3RhdGUgPSB7XG5cdFx0XHRpbml0aWFsRmlsZUNvbnRlbnRzOiB0aGlzLl9pbml0aWFsRmlsZUNvbnRlbnRzLFxuXHRcdFx0dGltZWxpbmU6IHRoaXMuX3RpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKSxcblx0XHRcdHJlY2VudFNuYXBzaG90OiB7IGVudHJpZXMsIHN0b3BJZDogdW5kZWZpbmVkIH0sXG5cdFx0fTtcblxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbnRyeURpZmZCZXR3ZWVuU3RvcHModXJpOiBVUkksIHJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBzdG9wSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB0aGlzLl90aW1lbGluZS5nZXRFbnRyeURpZmZCZXR3ZWVuU3RvcHModXJpLCByZXF1ZXN0SWQsIHN0b3BJZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW50cnlEaWZmQmV0d2VlblJlcXVlc3RzKHVyaTogVVJJLCBzdGFydFJlcXVlc3RJZDogc3RyaW5nLCBzdG9wUmVxdWVzdElkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fdGltZWxpbmUuZ2V0RW50cnlEaWZmQmV0d2VlblJlcXVlc3RzKHVyaSwgc3RhcnRSZXF1ZXN0SWQsIHN0b3BSZXF1ZXN0SWQpO1xuXHR9XG5cblx0cHVibGljIGdldERpZmZzRm9yRmlsZXNJblNlc3Npb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpbWVsaW5lLmdldERpZmZzRm9yRmlsZXNJblNlc3Npb24oKTtcblx0fVxuXG5cdHB1YmxpYyBnZXREaWZmRm9yU2Vzc2lvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5fdGltZWxpbmUuZ2V0RGlmZkZvclNlc3Npb24oKTtcblx0fVxuXG5cdHB1YmxpYyBnZXREaWZmc0ZvckZpbGVzSW5SZXF1ZXN0KHJlcXVlc3RJZDogc3RyaW5nKTogSU9ic2VydmFibGU8cmVhZG9ubHkgSUVkaXRTZXNzaW9uRW50cnlEaWZmW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGltZWxpbmUuZ2V0RGlmZnNGb3JGaWxlc0luUmVxdWVzdChyZXF1ZXN0SWQpO1xuXHR9XG5cblx0cHVibGljIGhhc0VkaXRzSW5SZXF1ZXN0KHJlcXVlc3RJZDogc3RyaW5nLCByZWFkZXI/OiBJUmVhZGVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpbWVsaW5lLmhhc0VkaXRzSW5SZXF1ZXN0KHJlcXVlc3RJZCwgcmVhZGVyKTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVTbmFwc2hvdChyZXF1ZXN0SWQ6IHN0cmluZywgdW5kb1N0b3A6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGxhYmVsID0gdW5kb1N0b3AgPyBgUmVxdWVzdCAke3JlcXVlc3RJZH0gLSBTdG9wICR7dW5kb1N0b3B9YCA6IGBSZXF1ZXN0ICR7cmVxdWVzdElkfWA7XG5cdFx0dGhpcy5fdGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludChyZXF1ZXN0SWQsIHVuZG9TdG9wLCBsYWJlbCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0U25hcHNob3RDb250ZW50cyhyZXF1ZXN0SWQ6IHN0cmluZywgdXJpOiBVUkksIHN0b3BJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxWU0J1ZmZlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl90aW1lbGluZS5nZXRDb250ZW50QXRTdG9wKHJlcXVlc3RJZCwgdXJpLCBzdG9wSWQpO1xuXHRcdHJldHVybiB0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycgPyBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpIDogY29udGVudDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRTbmFwc2hvdE1vZGVsKHJlcXVlc3RJZDogc3RyaW5nLCB1bmRvU3RvcDogc3RyaW5nIHwgdW5kZWZpbmVkLCBzbmFwc2hvdFVyaTogVVJJKTogUHJvbWlzZTxJVGV4dE1vZGVsIHwgbnVsbD4ge1xuXHRcdGF3YWl0IHRoaXMuX2Jhc2VsaW5lQ3JlYXRpb25Mb2Nrcy5wZWVrKHNuYXBzaG90VXJpLnBhdGgpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuX3RpbWVsaW5lLmdldENvbnRlbnRBdFN0b3AocmVxdWVzdElkLCBzbmFwc2hvdFVyaSwgdW5kb1N0b3ApO1xuXHRcdGlmIChjb250ZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnRTdHIgPSB0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycgPyBjb250ZW50IDogY29udGVudC50b1N0cmluZygpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKGNvbnRlbnRTdHIsIHRoaXMuX2xhbmd1YWdlU2VydmljZS5jcmVhdGVCeUZpbGVwYXRoT3JGaXJzdExpbmUoc25hcHNob3RVcmkpLCBzbmFwc2hvdFVyaSwgZmFsc2UpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKG1vZGVsLm9uV2lsbERpc3Bvc2UoKCkgPT4gc3RvcmUuZGlzcG9zZSgpKSk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuX3RpbWVsaW5lLm9uRGlkQ2hhbmdlQ29udGVudHNBdFN0b3AocmVxdWVzdElkLCBzbmFwc2hvdFVyaSwgdW5kb1N0b3AsIGMgPT4gbW9kZWwuc2V0VmFsdWUoYykpKTtcblxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdHB1YmxpYyBnZXRTbmFwc2hvdFVyaShyZXF1ZXN0SWQ6IHN0cmluZywgdXJpOiBVUkksIHN0b3BJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdGltZWxpbmUuZ2V0Q29udGVudFVSSUF0U3RvcChyZXF1ZXN0SWQsIHVyaSwgc3RvcElkKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXN0b3JlU25hcHNob3QocmVxdWVzdElkOiBzdHJpbmcsIHN0b3BJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hlY2twb2ludElkID0gdGhpcy5fdGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdChyZXF1ZXN0SWQsIHN0b3BJZCk7XG5cdFx0aWYgKGNoZWNrcG9pbnRJZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQoY2hlY2twb2ludElkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hc3NlcnROb3REaXNwb3NlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUuZ2V0KCkgPT09IENoYXRFZGl0aW5nU2Vzc2lvblN0YXRlLkRpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKGBDYW5ub3QgYWNjZXNzIGEgZGlzcG9zZWQgZWRpdGluZyBzZXNzaW9uYCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgYWNjZXB0KC4uLnVyaXM6IFVSSVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGF3YWl0IHRoaXMuX29wZXJhdGVFbnRyeSgnYWNjZXB0JywgdXJpcykpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5lZGl0c0tlcHQsIHsgYWxsb3dNYW55SW5QYXJhbGxlbDogdHJ1ZSB9KTtcblx0XHR9XG5cblx0fVxuXG5cdGFzeW5jIHJlamVjdCguLi51cmlzOiBVUklbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChhd2FpdCB0aGlzLl9vcGVyYXRlRW50cnkoJ3JlamVjdCcsIHVyaXMpKSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuZWRpdHNVbmRvbmUsIHsgYWxsb3dNYW55SW5QYXJhbGxlbDogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vcGVyYXRlRW50cnkoYWN0aW9uOiAnYWNjZXB0JyB8ICdyZWplY3QnLCB1cmlzOiBVUklbXSk6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblxuXHRcdGNvbnN0IGFwcGxpY2FibGVFbnRyaWVzID0gdGhpcy5fZW50cmllc09icy5nZXQoKVxuXHRcdFx0LmZpbHRlcihlID0+IHVyaXMubGVuZ3RoID09PSAwIHx8IHVyaXMuc29tZSh1ID0+IGlzRXF1YWwodSwgZS5tb2RpZmllZFVSSSkpKVxuXHRcdFx0LmZpbHRlcihlID0+ICFlLmlzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5LmdldCgpKVxuXHRcdFx0LmZpbHRlcihlID0+IGUuc3RhdGUuZ2V0KCkgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpO1xuXG5cdFx0aWYgKGFwcGxpY2FibGVFbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0Ly8gUGVyZm9ybSBhbGwgSS9PIG9wZXJhdGlvbnMgaW4gcGFyYWxsZWwsIGVhY2ggcmVzb2x2aW5nIHRvIGEgc3RhdGUgdHJhbnNpdGlvbiBjYWxsYmFja1xuXHRcdGNvbnN0IG1ldGhvZCA9IGFjdGlvbiA9PT0gJ2FjY2VwdCcgPyAnYWNjZXB0RGVmZXJyZWQnIDogJ3JlamVjdERlZmVycmVkJztcblx0XHRjb25zdCB0cmFuc2l0aW9uQ2FsbGJhY2tzID0gYXdhaXQgUHJvbWlzZS5hbGwoXG5cdFx0XHRhcHBsaWNhYmxlRW50cmllcy5tYXAoZW50cnkgPT4gZW50cnlbbWV0aG9kXSgpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIGNhbGxpbmcgJHttZXRob2R9IG9uIGVudHJ5ICR7ZW50cnkubW9kaWZpZWRVUkl9YCwgZXJyKTtcblx0XHRcdH0pKVxuXHRcdCk7XG5cblx0XHQvLyBFeGVjdXRlIGFsbCBzdGF0ZSB0cmFuc2l0aW9ucyBhdG9taWNhbGx5IGluIGEgc2luZ2xlIHRyYW5zYWN0aW9uXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dHJhbnNpdGlvbkNhbGxiYWNrcy5mb3JFYWNoKGNhbGxiYWNrID0+IGNhbGxiYWNrPy4odHgpKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBhcHBsaWNhYmxlRW50cmllcy5sZW5ndGg7XG5cdH1cblxuXHRhc3luYyBzaG93KHByZXZpb3VzQ2hhbmdlcz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGlmICh0aGlzLl9lZGl0b3JQYW5lKSB7XG5cdFx0XHRpZiAodGhpcy5fZWRpdG9yUGFuZS5pc1Zpc2libGUoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2VkaXRvclBhbmUuaW5wdXQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHRoaXMuX2VkaXRvclBhbmUuaW5wdXQsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmF0aW9uOiBFZGl0b3JBY3RpdmF0aW9uLkFDVElWQVRFIH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gTXVsdGlEaWZmRWRpdG9ySW5wdXQuZnJvbVJlc291cmNlTXVsdGlEaWZmRWRpdG9ySW5wdXQoe1xuXHRcdFx0bXVsdGlEaWZmU291cmNlOiBnZXRNdWx0aURpZmZTb3VyY2VVcmkodGhpcywgcHJldmlvdXNDaGFuZ2VzKSxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbXVsdGlEaWZmRWRpdG9ySW5wdXQubmFtZScsIFwiU3VnZ2VzdGVkIEVkaXRzXCIpXG5cdFx0fSwgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fZWRpdG9yUGFuZSA9IGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUsIGFjdGl2YXRpb246IEVkaXRvckFjdGl2YXRpb24uQUNUSVZBVEUgfSkgYXMgTXVsdGlEaWZmRWRpdG9yIHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcFByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0YXN5bmMgc3RvcChjbGVhclN0YXRlID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zdG9wUHJvbWlzZSA/Pz0gUHJvbWlzZS5hbGxTZXR0bGVkKFt0aGlzLl9wZXJmb3JtU3RvcCgpLCB0aGlzLnN0b3JlU3RhdGUoKV0pLnRoZW4oKCkgPT4geyB9KTtcblx0XHRhd2FpdCB0aGlzLl9zdG9wUHJvbWlzZTtcblx0XHRpZiAoY2xlYXJTdGF0ZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRpbmdTZXNzaW9uU3RvcmFnZSwgdGhpcy5jaGF0U2Vzc2lvblJlc291cmNlKS5jbGVhclN0YXRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcGVyZm9ybVN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQ2xvc2Ugb3V0IGFsbCBvcGVuIGZpbGVzXG5cdFx0Y29uc3Qgc2NoZW1lcyA9IFtBYnN0cmFjdENoYXRFZGl0aW5nTW9kaWZpZWRGaWxlRW50cnkuc2NoZW1lLCBDaGF0RWRpdGluZ1RleHRNb2RlbENvbnRlbnRQcm92aWRlci5zY2hlbWVdO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLmdyb3Vwcy5mbGF0TWFwKGFzeW5jIChnKSA9PiB7XG5cdFx0XHRyZXR1cm4gZy5lZGl0b3JzLm1hcChhc3luYyAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoKGUgaW5zdGFuY2VvZiBNdWx0aURpZmZFZGl0b3JJbnB1dCAmJiBlLmluaXRpYWxSZXNvdXJjZXM/LnNvbWUociA9PiByLm9yaWdpbmFsVXJpICYmIHNjaGVtZXMuaW5kZXhPZihyLm9yaWdpbmFsVXJpLnNjaGVtZSkgIT09IC0xKSlcblx0XHRcdFx0XHR8fCAoZSBpbnN0YW5jZW9mIERpZmZFZGl0b3JJbnB1dCAmJiBlLm9yaWdpbmFsLnJlc291cmNlICYmIHNjaGVtZXMuaW5kZXhPZihlLm9yaWdpbmFsLnJlc291cmNlLnNjaGVtZSkgIT09IC0xKSkge1xuXHRcdFx0XHRcdGF3YWl0IGcuY2xvc2VFZGl0b3IoZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHR0aGlzLmNsZWFyRXhwbGFuYXRpb25zKCk7XG5cdFx0ZGlzcG9zZSh0aGlzLl9lbnRyaWVzT2JzLmdldCgpKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc3RhdGUuc2V0KENoYXRFZGl0aW5nU2Vzc2lvblN0YXRlLkRpc3Bvc2VkLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5maXJlKCk7XG5cdFx0dGhpcy5fb25EaWREaXNwb3NlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGlzRGlzcG9zZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRlLmdldCgpID09PSBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZS5EaXNwb3NlZDtcblx0fVxuXG5cdHN0YXJ0U3RyZWFtaW5nRWRpdHMocmVzb3VyY2U6IFVSSSwgcmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsLCBpblVuZG9TdG9wOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJU3RyZWFtaW5nRWRpdHMge1xuXHRcdGNvbnN0IGNvbXBsZXRlUHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBzdGFydFByb21pc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0XHQvLyBTZXF1ZW5jZSBhbGwgZWRpdHMgbWFkZSB0aGlzIHRoaXMgcmVzb3VyY2UgaW4gdGhpcyBzdHJlYW1pbmcgZWRpdHMgaW5zdGFuY2UsXG5cdFx0Ly8gYW5kIGFsc28gc2VxdWVuY2UgdGhlIHJlc291cmNlIG92ZXJhbGwgaW4gdGhlIHJhcmUgKGN1cnJlbnRseSBpbnZhbGlkPykgY2FzZVxuXHRcdC8vIHRoYXQgZWRpdHMgYXJlIG1hZGUgaW4gcGFyYWxsZWwgdG8gdGhlIHNhbWUgcmVzb3VyY2UsXG5cdFx0Y29uc3Qgc2VxdWVuY2VyID0gbmV3IFRocm90dGxlZFNlcXVlbmNlcigxNSwgMTAwMCk7XG5cdFx0c2VxdWVuY2VyLnF1ZXVlKCgpID0+IHN0YXJ0UHJvbWlzZS5wKTtcblxuXHRcdC8vIExvY2sgYXJvdW5kIGNyZWF0aW5nIHRoZSBiYXNlbGluZSBzbyB3ZSBkb24ndCBmYWlsIHRvIHJlc29sdmUgbW9kZWxzXG5cdFx0Ly8gaW4gdGhlIGVkaXQgcGlsbHMgaWYgdGhleSByZW5kZXIgcXVpY2tseVxuXHRcdHRoaXMuX2Jhc2VsaW5lQ3JlYXRpb25Mb2Nrcy5xdWV1ZShyZXNvdXJjZS5wYXRoLCAoKSA9PiBzdGFydFByb21pc2UucCk7XG5cblx0XHR0aGlzLl9zdHJlYW1pbmdFZGl0TG9ja3MucXVldWUocmVzb3VyY2UudG9TdHJpbmcoKSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgY2hhdEVkaXRpbmdTZXNzaW9uSXNSZWFkeSh0aGlzKTtcblxuXHRcdFx0aWYgKCF0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fYWNjZXB0U3RyZWFtaW5nRWRpdHNTdGFydChyZXNwb25zZU1vZGVsLCBpblVuZG9TdG9wLCByZXNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHRcdHN0YXJ0UHJvbWlzZS5jb21wbGV0ZSgpO1xuXHRcdFx0cmV0dXJuIGNvbXBsZXRlUHJvbWlzZS5wO1xuXHRcdH0pO1xuXG5cblx0XHRsZXQgZGlkQ29tcGxldGUgPSBmYWxzZTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRwdXNoVGV4dDogKGVkaXRzLCBpc0xhc3RFZGl0cykgPT4ge1xuXHRcdFx0XHRzZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghdGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9hY2NlcHRFZGl0cyhyZXNvdXJjZSwgZWRpdHMsIGlzTGFzdEVkaXRzLCByZXNwb25zZU1vZGVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdHB1c2hOb3RlYm9va0NlbGxUZXh0OiAoY2VsbCwgZWRpdHMsIGlzTGFzdEVkaXRzKSA9PiB7XG5cdFx0XHRcdHNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2FjY2VwdEVkaXRzKGNlbGwsIGVkaXRzLCBpc0xhc3RFZGl0cywgcmVzcG9uc2VNb2RlbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRwdXNoTm90ZWJvb2s6IChlZGl0cywgaXNMYXN0RWRpdHMpID0+IHtcblx0XHRcdFx0c2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fYWNjZXB0RWRpdHMocmVzb3VyY2UsIGVkaXRzLCBpc0xhc3RFZGl0cywgcmVzcG9uc2VNb2RlbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRjb21wbGV0ZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAoZGlkQ29tcGxldGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaWRDb21wbGV0ZSA9IHRydWU7XG5cdFx0XHRcdHNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2FjY2VwdEVkaXRzKHJlc291cmNlLCBbXSwgdHJ1ZSwgcmVzcG9uc2VNb2RlbCk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9yZXNvbHZlKHJlc3BvbnNlTW9kZWwucmVxdWVzdElkLCBpblVuZG9TdG9wLCByZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRjb21wbGV0ZVByb21pc2UuY29tcGxldGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0c3RhcnREZWxldGlvbihyZXNvdXJjZTogVVJJLCByZXNwb25zZU1vZGVsOiBJQ2hhdFJlc3BvbnNlTW9kZWwsIHVuZG9TdG9wSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cblx0XHQvLyBRdWV1ZSB0aGUgZGVsZXRpb24gb3BlcmF0aW9uIHdpdGggcHJvcGVyIGxvY2tpbmdcblx0XHR0aGlzLl9zdHJlYW1pbmdFZGl0TG9ja3MucXVldWUocmVzb3VyY2UudG9TdHJpbmcoKSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IGNoYXRFZGl0aW5nU2Vzc2lvbklzUmVhZHkodGhpcyk7XG5cblx0XHRcdC8vIENoZWNrIGlmIGZpbGUgZXhpc3RzXG5cdFx0XHRsZXQgZmlsZUNvbnRlbnQ6IHN0cmluZztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0XHRcdGZpbGVDb250ZW50ID0gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyBGaWxlIGRvZXNuJ3QgZXhpc3QsIG5vdGhpbmcgdG8gZGVsZXRlXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgQ2Fubm90IGRlbGV0ZSBmaWxlICR7cmVzb3VyY2UudG9TdHJpbmcoKX06IGZpbGUgZG9lcyBub3QgZXhpc3RgKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBpZiB0aGVyZSdzIGFscmVhZHkgYW4gZW50cnkgZm9yIHRoaXMgZmlsZVxuXHRcdFx0Y29uc3QgZXhpc3RpbmdFbnRyeSA9IHRoaXMuX2dldEVudHJ5KHJlc291cmNlKTtcblx0XHRcdGlmIChleGlzdGluZ0VudHJ5KSB7XG5cdFx0XHRcdC8vIElmIHRoZXJlJ3MgYWxyZWFkeSBhbiBlbnRyeSwgd2UgbmVlZCB0byBoYW5kbGUgaXQgZGlmZmVyZW50bHlcblx0XHRcdFx0Ly8gRm9yIG5vdywgd2UnbGwganVzdCBjb2xsYXBzZSBpdCBhbmQgcHJvY2VlZCB3aXRoIGRlbGV0aW9uXG5cdFx0XHRcdGV4aXN0aW5nRW50cnkuZGlzcG9zZSgpO1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzID0gdGhpcy5fZW50cmllc09icy5nZXQoKS5maWx0ZXIoZSA9PiBlICE9PSBleGlzdGluZ0VudHJ5KTtcblx0XHRcdFx0dGhpcy5fZW50cmllc09icy5zZXQoZW50cmllcywgdW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3RvcmUgaW5pdGlhbCBjb250ZW50IGZvciB0aW1lbGluZSByZXN0b3JhdGlvblxuXHRcdFx0aWYgKCF0aGlzLl9pbml0aWFsRmlsZUNvbnRlbnRzLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdFx0dGhpcy5faW5pdGlhbEZpbGVDb250ZW50cy5zZXQocmVzb3VyY2UsIGZpbGVDb250ZW50KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGVsZXRlIHRoZSBmaWxlIG9uIGRpc2tcblx0XHRcdGF3YWl0IHRoaXMuX2J1bGtFZGl0U2VydmljZS5hcHBseSh7XG5cdFx0XHRcdGVkaXRzOiBbeyBvbGRSZXNvdXJjZTogcmVzb3VyY2UsIG9wdGlvbnM6IHsgaWdub3JlSWZOb3RFeGlzdHM6IHRydWUgfSB9XVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFJlY29yZCB0aGUgZGVsZXRlIG9wZXJhdGlvbiBpbiB0aGUgdGltZWxpbmVcblx0XHRcdHRoaXMuX3RpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oe1xuXHRcdFx0XHR0eXBlOiBGaWxlT3BlcmF0aW9uVHlwZS5EZWxldGUsXG5cdFx0XHRcdHVyaTogcmVzb3VyY2UsXG5cdFx0XHRcdHJlcXVlc3RJZDogcmVzcG9uc2VNb2RlbC5yZXF1ZXN0SWQsXG5cdFx0XHRcdGVwb2NoOiB0aGlzLl90aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0XHRmaW5hbENvbnRlbnQ6IGZpbGVDb250ZW50XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgZGVsZXRlZCBmaWxlIGVudHJ5XG5cdFx0XHRjb25zdCB0ZWxlbWV0cnlJbmZvID0gdGhpcy5fZ2V0VGVsZW1ldHJ5SW5mb0Zvck1vZGVsKHJlc3BvbnNlTW9kZWwpO1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VTZWxlY3Rpb24gPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlGaWxlcGF0aE9yRmlyc3RMaW5lKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRFZGl0aW5nRGVsZXRlZEZpbGVFbnRyeSxcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdGZpbGVDb250ZW50LFxuXHRcdFx0XHR7IGNvbGxhcHNlOiAodHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCkgPT4gdGhpcy5fY29sbGFwc2UocmVzb3VyY2UsIHR4KSB9LFxuXHRcdFx0XHR0ZWxlbWV0cnlJbmZvLFxuXHRcdFx0XHRsYW5ndWFnZVNlbGVjdGlvbi5sYW5ndWFnZUlkXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBBZGQgZW50cnkgdG8gdGhlIGVudHJpZXMgb2JzZXJ2YWJsZVxuXHRcdFx0Y29uc3QgZW50cmllcyA9IFsuLi50aGlzLl9lbnRyaWVzT2JzLmdldCgpLCBlbnRyeV07XG5cdFx0XHR0aGlzLl9lbnRyaWVzT2JzLnNldChlbnRyaWVzLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXBwbHlXb3Jrc3BhY2VFZGl0KGVkaXQ6IElDaGF0V29ya3NwYWNlRWRpdCwgcmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsLCB1bmRvU3RvcElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGZpbGVFZGl0IG9mIGVkaXQuZWRpdHMpIHtcblx0XHRcdGlmIChmaWxlRWRpdC5vbGRSZXNvdXJjZSAmJiAhZmlsZUVkaXQubmV3UmVzb3VyY2UpIHtcblx0XHRcdFx0Ly8gRmlsZSBkZWxldGlvblxuXHRcdFx0XHR0aGlzLnN0YXJ0RGVsZXRpb24oZmlsZUVkaXQub2xkUmVzb3VyY2UsIHJlc3BvbnNlTW9kZWwsIHVuZG9TdG9wSWQpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRnV0dXJlOiBoYW5kbGUgZmlsZSBjcmVhdGlvbnMgYW5kIHJlbmFtZXNcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdGFydEV4dGVybmFsRWRpdHMocmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsLCBvcGVyYXRpb25JZDogbnVtYmVyLCByZXNvdXJjZXM6IFVSSVtdLCB1bmRvU3RvcElkOiBzdHJpbmcsIGNvbnRlbnRGb3I/OiBVUklbXSk6IFByb21pc2U8SUNoYXRQcm9ncmVzc1tdPiB7XG5cdFx0Y29uc3Qgc25hcHNob3RzID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IHVuZGVmaW5lZD4oKTtcblx0XHRjb25zdCBhY3F1aXJlZExvY2tQcm9taXNlczogRGVmZXJyZWRQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRjb25zdCByZWxlYXNlTG9ja1Byb21pc2VzOiBEZWZlcnJlZFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdGNvbnN0IHByb2dyZXNzOiBJQ2hhdFByb2dyZXNzW10gPSBbXTtcblx0XHRjb25zdCB0ZWxlbWV0cnlJbmZvID0gdGhpcy5fZ2V0VGVsZW1ldHJ5SW5mb0Zvck1vZGVsKHJlc3BvbnNlTW9kZWwpO1xuXG5cdFx0YXdhaXQgY2hhdEVkaXRpbmdTZXNzaW9uSXNSZWFkeSh0aGlzKTtcblxuXHRcdC8vIEFjcXVpcmUgbG9ja3MgZm9yIGVhY2ggcmVzb3VyY2UgYW5kIHRha2Ugc25hcHNob3RzXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZXNvdXJjZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gcmVzb3VyY2VzW2ldO1xuXHRcdFx0Y29uc3QgY29udGVudFNvdXJjZSA9IGNvbnRlbnRGb3I/LltpXTtcblx0XHRcdGNvbnN0IHJlbGVhc2VMb2NrID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0cmVsZWFzZUxvY2tQcm9taXNlcy5wdXNoKHJlbGVhc2VMb2NrKTtcblxuXHRcdFx0Y29uc3QgYWNxdWlyZWRMb2NrID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0YWNxdWlyZWRMb2NrUHJvbWlzZXMucHVzaChhY3F1aXJlZExvY2spO1xuXG5cdFx0XHR0aGlzLl9zdHJlYW1pbmdFZGl0TG9ja3MucXVldWUocmVzb3VyY2UudG9TdHJpbmcoKSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0YWNxdWlyZWRMb2NrLmNvbXBsZXRlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGluaXRpYWxDb250ZW50OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChjb250ZW50U291cmNlKSB7XG5cdFx0XHRcdFx0Ly8gUmVhZCB0aGUgYmVmb3JlLWNvbnRlbnQgZnJvbSB0aGUgcHJvdmlkZWQgVVJJIGluc3RlYWQgb2YgZGlza1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkYXRhID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoY29udGVudFNvdXJjZSk7XG5cdFx0XHRcdFx0XHRpbml0aWFsQ29udGVudCA9IGRhdGEudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdGluaXRpYWxDb250ZW50ID0gJyc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZW50cnkgPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZU1vZGlmaWVkRmlsZUVudHJ5KHJlc291cmNlLCBOb3RFeGlzdEJlaGF2aW9yLkFib3J0LCB0ZWxlbWV0cnlJbmZvLCBpbml0aWFsQ29udGVudCk7XG5cdFx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2FjY2VwdFN0cmVhbWluZ0VkaXRzU3RhcnQocmVzcG9uc2VNb2RlbCwgdW5kb1N0b3BJZCwgcmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tVcmkgPSBDZWxsVXJpLnBhcnNlKHJlc291cmNlKT8ubm90ZWJvb2sgfHwgcmVzb3VyY2U7XG5cdFx0XHRcdHByb2dyZXNzLnB1c2goLi4uY3JlYXRlT3BlbmluZ0VkaXRDb2RlQmxvY2socmVzb3VyY2UsIHRoaXMuX25vdGVib29rU2VydmljZS5oYXNTdXBwb3J0ZWROb3RlYm9va3Mobm90ZWJvb2tVcmkpLCB1bmRvU3RvcElkKSk7XG5cblx0XHRcdFx0aWYgKGluaXRpYWxDb250ZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0XHRcdGVudHJ5LmluaXRpYWxDb250ZW50ID0gaW5pdGlhbENvbnRlbnQ7XG5cdFx0XHRcdFx0XHRhd2FpdCBlbnRyeS5yZXNldEVkaXRUcmFja2VyVG9Jbml0aWFsQ29udGVudCgpOyAvLyBpbiBjYXNlIGl0J3MgcmV1c2VkXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNuYXBzaG90cy5zZXQocmVzb3VyY2UsIGluaXRpYWxDb250ZW50KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBTYXZlIHRvIGRpc2sgdG8gZW5zdXJlIGRpc2sgc3RhdGUgaXMgY3VycmVudCBiZWZvcmUgZXh0ZXJuYWwgZWRpdHNcblx0XHRcdFx0XHRhd2FpdCBlbnRyeT8uc2F2ZSgpO1xuXHRcdFx0XHRcdC8vIFRha2Ugc25hcHNob3Qgb2YgY3VycmVudCBzdGF0ZVxuXHRcdFx0XHRcdHNuYXBzaG90cy5zZXQocmVzb3VyY2UsIGVudHJ5ICYmIHRoaXMuX2dldEN1cnJlbnRUZXh0T3JOb3RlYm9va1NuYXBzaG90KGVudHJ5KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZW50cnk/LnN0YXJ0RXh0ZXJuYWxFZGl0KCk7XG5cdFx0XHRcdGFjcXVpcmVkTG9jay5jb21wbGV0ZSgpO1xuXG5cdFx0XHRcdC8vIFdhaXQgZm9yIHRoZSBsb2NrIHRvIGJlIHJlbGVhc2VkIGJ5IHN0b3BFeHRlcm5hbEVkaXRzXG5cdFx0XHRcdHJldHVybiByZWxlYXNlTG9jay5wO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoYWNxdWlyZWRMb2NrUHJvbWlzZXMubWFwKHAgPT4gcC5wKSk7XG5cdFx0dGhpcy5jcmVhdGVTbmFwc2hvdChyZXNwb25zZU1vZGVsLnJlcXVlc3RJZCwgdW5kb1N0b3BJZCk7XG5cblx0XHQvLyBTdG9yZSB0aGUgb3BlcmF0aW9uIHN0YXRlXG5cdFx0dGhpcy5fZXh0ZXJuYWxFZGl0T3BlcmF0aW9ucy5zZXQob3BlcmF0aW9uSWQsIHtcblx0XHRcdHJlc3BvbnNlTW9kZWwsXG5cdFx0XHRzbmFwc2hvdHMsXG5cdFx0XHR1bmRvU3RvcElkLFxuXHRcdFx0cmVsZWFzZUxvY2tzOiAoKSA9PiByZWxlYXNlTG9ja1Byb21pc2VzLmZvckVhY2gocCA9PiBwLmNvbXBsZXRlKCkpXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcHJvZ3Jlc3M7XG5cdH1cblxuXHRhc3luYyBzdG9wRXh0ZXJuYWxFZGl0cyhyZXNwb25zZU1vZGVsOiBJQ2hhdFJlc3BvbnNlTW9kZWwsIG9wZXJhdGlvbklkOiBudW1iZXIsIGNvbnRlbnRGb3I/OiBVUklbXSk6IFByb21pc2U8SUNoYXRQcm9ncmVzc1tdPiB7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uID0gdGhpcy5fZXh0ZXJuYWxFZGl0T3BlcmF0aW9ucy5nZXQob3BlcmF0aW9uSWQpO1xuXHRcdGlmICghb3BlcmF0aW9uKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYHN0b3BFeHRlcm5hbEVkaXRzIGNhbGxlZCBmb3IgdW5rbm93biBvcGVyYXRpb24gJHtvcGVyYXRpb25JZH1gKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHR0aGlzLl9leHRlcm5hbEVkaXRPcGVyYXRpb25zLmRlbGV0ZShvcGVyYXRpb25JZCk7XG5cblx0XHRjb25zdCBwcm9ncmVzczogSUNoYXRQcm9ncmVzc1tdID0gW107XG5cblx0XHR0cnkge1xuXHRcdFx0Ly8gQnVpbGQgYSBtYXAgb2YgcmVzb3VyY2UgLT4gY29udGVudEZvciBVUklcblx0XHRcdGNvbnN0IGNvbnRlbnRGb3JNYXAgPSBuZXcgUmVzb3VyY2VNYXA8VVJJPigpO1xuXHRcdFx0aWYgKGNvbnRlbnRGb3IpIHtcblx0XHRcdFx0bGV0IGlkeCA9IDA7XG5cdFx0XHRcdGZvciAoY29uc3QgW3Jlc291cmNlXSBvZiBvcGVyYXRpb24uc25hcHNob3RzKSB7XG5cdFx0XHRcdFx0aWYgKGlkeCA8IGNvbnRlbnRGb3IubGVuZ3RoICYmIGNvbnRlbnRGb3JbaWR4XSkge1xuXHRcdFx0XHRcdFx0Y29udGVudEZvck1hcC5zZXQocmVzb3VyY2UsIGNvbnRlbnRGb3JbaWR4XSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlkeCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvciBlYWNoIHJlc291cmNlLCBjb21wdXRlIHRoZSBkaWZmIGFuZCBjcmVhdGUgZWRpdCBwYXJ0c1xuXHRcdFx0Zm9yIChjb25zdCBbcmVzb3VyY2UsIGJlZm9yZVNuYXBzaG90XSBvZiBvcGVyYXRpb24uc25hcHNob3RzKSB7XG5cdFx0XHRcdGxldCBlbnRyeSA9IHRoaXMuX2dldEVudHJ5KHJlc291cmNlKTtcblxuXHRcdFx0XHQvLyBGaWxlcyB0aGF0IGRpZCBub3QgZXhpc3Qgb24gZGlzayBiZWZvcmUgbWF5IG5vdCBleGlzdCBpbiBvdXIgd29ya2luZ1xuXHRcdFx0XHQvLyBzZXQgeWV0LiBDcmVhdGUgdGhvc2UgaWYgdGhhdCdzIHRoZSBjYXNlLlxuXHRcdFx0XHRpZiAoIWVudHJ5ICYmIGJlZm9yZVNuYXBzaG90ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRlbnRyeSA9IGF3YWl0IHRoaXMuX2dldE9yQ3JlYXRlTW9kaWZpZWRGaWxlRW50cnkocmVzb3VyY2UsIE5vdEV4aXN0QmVoYXZpb3IuQWJvcnQsIHRoaXMuX2dldFRlbGVtZXRyeUluZm9Gb3JNb2RlbChyZXNwb25zZU1vZGVsKSwgJycpO1xuXHRcdFx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRcdFx0ZW50cnkuc3RhcnRFeHRlcm5hbEVkaXQoKTtcblx0XHRcdFx0XHRcdGVudHJ5LmFjY2VwdFN0cmVhbWluZ0VkaXRzU3RhcnQocmVzcG9uc2VNb2RlbCwgb3BlcmF0aW9uLnVuZG9TdG9wSWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGFmdGVyU25hcHNob3Q6IHN0cmluZztcblx0XHRcdFx0Y29uc3QgY29udGVudFNvdXJjZSA9IGNvbnRlbnRGb3JNYXAuZ2V0KHJlc291cmNlKTtcblx0XHRcdFx0aWYgKGNvbnRlbnRTb3VyY2UpIHtcblx0XHRcdFx0XHQvLyBSZWFkIGFmdGVyLWNvbnRlbnQgZnJvbSB0aGUgcHJvdmlkZWQgVVJJIGluc3RlYWQgb2YgZGlza1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkYXRhID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoY29udGVudFNvdXJjZSk7XG5cdFx0XHRcdFx0XHRhZnRlclNuYXBzaG90ID0gZGF0YS52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKF9lKSB7XG5cdFx0XHRcdFx0XHRhZnRlclNuYXBzaG90ID0gJyc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFJlbG9hZCBmcm9tIGRpc2sgdG8gZW5zdXJlIGluLW1lbW9yeSBtb2RlbCBpcyBpbiBzeW5jIHdpdGggZmlsZSBzeXN0ZW1cblx0XHRcdFx0XHRhd2FpdCBlbnRyeS5yZXZlcnRUb0Rpc2soKTtcblx0XHRcdFx0XHRhZnRlclNuYXBzaG90ID0gdGhpcy5fZ2V0Q3VycmVudFRleHRPck5vdGVib29rU25hcHNob3QoZW50cnkpID8/ICcnO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ29tcHV0ZSBlZGl0cyBmcm9tIHRoZSBzbmFwc2hvdHNcblx0XHRcdFx0bGV0IGVkaXRzOiAoVGV4dEVkaXQgfCBJQ2VsbEVkaXRPcGVyYXRpb24pW10gPSBbXTtcblx0XHRcdFx0aWYgKGJlZm9yZVNuYXBzaG90ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl90aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKHtcblx0XHRcdFx0XHRcdHR5cGU6IEZpbGVPcGVyYXRpb25UeXBlLkNyZWF0ZSxcblx0XHRcdFx0XHRcdHVyaTogcmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRyZXF1ZXN0SWQ6IHJlc3BvbnNlTW9kZWwucmVxdWVzdElkLFxuXHRcdFx0XHRcdFx0ZXBvY2g6IHRoaXMuX3RpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHRcdFx0XHRpbml0aWFsQ29udGVudDogYWZ0ZXJTbmFwc2hvdCxcblx0XHRcdFx0XHRcdHRlbGVtZXRyeUluZm86IGVudHJ5LnRlbGVtZXRyeUluZm8sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZWRpdHMgPSBhd2FpdCBlbnRyeS5jb21wdXRlRWRpdHNGcm9tU25hcHNob3RzKGJlZm9yZVNuYXBzaG90LCBhZnRlclNuYXBzaG90KTtcblx0XHRcdFx0XHR0aGlzLl9yZWNvcmRFZGl0T3BlcmF0aW9ucyhlbnRyeSwgcmVzb3VyY2UsIGVkaXRzLCByZXNwb25zZU1vZGVsKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByb2dyZXNzLnB1c2goZW50cnkgaW5zdGFuY2VvZiBDaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeSA/IHtcblx0XHRcdFx0XHRraW5kOiAnbm90ZWJvb2tFZGl0Jyxcblx0XHRcdFx0XHR1cmk6IHJlc291cmNlLFxuXHRcdFx0XHRcdGVkaXRzOiBlZGl0cyBhcyBJQ2VsbEVkaXRPcGVyYXRpb25bXSxcblx0XHRcdFx0XHRkb25lOiB0cnVlLFxuXHRcdFx0XHRcdGlzRXh0ZXJuYWxFZGl0OiB0cnVlXG5cdFx0XHRcdH0gOiB7XG5cdFx0XHRcdFx0a2luZDogJ3RleHRFZGl0Jyxcblx0XHRcdFx0XHR1cmk6IHJlc291cmNlLFxuXHRcdFx0XHRcdGVkaXRzOiBlZGl0cyBhcyBUZXh0RWRpdFtdLFxuXHRcdFx0XHRcdGRvbmU6IHRydWUsXG5cdFx0XHRcdFx0aXNFeHRlcm5hbEVkaXQ6IHRydWVcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gTWFyayBhcyBubyBsb25nZXIgYmVpbmcgbW9kaWZpZWRcblx0XHRcdFx0YXdhaXQgZW50cnkuYWNjZXB0U3RyZWFtaW5nRWRpdHNFbmQoKTtcblxuXHRcdFx0XHQvLyBBY2NlcHQgdGhlIGNoYW5nZXMgZm9yIGJhY2tncm91bmQgc2Vzc2lvbnNcblx0XHRcdFx0aWYgKGdldENoYXRTZXNzaW9uVHlwZSh0aGlzLmNoYXRTZXNzaW9uUmVzb3VyY2UpID09PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCkge1xuXHRcdFx0XHRcdGF3YWl0IGVudHJ5LmFjY2VwdCgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ2xlYXIgZXh0ZXJuYWwgZWRpdCBtb2RlXG5cdFx0XHRcdGVudHJ5LnN0b3BFeHRlcm5hbEVkaXQoKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Ly8gUmVsZWFzZSBhbGwgdGhlIGxvY2tzXG5cdFx0XHRvcGVyYXRpb24ucmVsZWFzZUxvY2tzKCk7XG5cblx0XHRcdGNvbnN0IGhhc090aGVyVGFza3MgPSBJdGVyYWJsZS5zb21lKHRoaXMuX3N0cmVhbWluZ0VkaXRMb2Nrcy5rZXlzKCksIGsgPT4gIW9wZXJhdGlvbi5zbmFwc2hvdHMuaGFzKFVSSS5wYXJzZShrKSkpO1xuXHRcdFx0aWYgKCFoYXNPdGhlclRhc2tzKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLnNldChDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZS5JZGxlLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0cmV0dXJuIHByb2dyZXNzO1xuXHR9XG5cblx0YXN5bmMgdW5kb0ludGVyYWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3RpbWVsaW5lLnVuZG9Ub0xhc3RDaGVja3BvaW50KCk7XG5cdH1cblxuXHRhc3luYyByZWRvSW50ZXJhY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fdGltZWxpbmUucmVkb1RvTmV4dENoZWNrcG9pbnQoKTtcblx0fVxuXG5cdGFzeW5jIHRyaWdnZXJFeHBsYW5hdGlvbkdlbmVyYXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQ2xlYXIgYW55IGV4aXN0aW5nIGV4cGxhbmF0aW9ucyBmaXJzdFxuXHRcdHRoaXMuY2xlYXJFeHBsYW5hdGlvbnMoKTtcblxuXHRcdGNvbnN0IGVudHJpZXMgPSB0aGlzLl9lbnRyaWVzT2JzLmdldCgpO1xuXHRcdGNvbnN0IGRpZmZJbmZvczogSUV4cGxhbmF0aW9uRGlmZkluZm9bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0aWYgKGVudHJ5IGluc3RhbmNlb2YgQ2hhdEVkaXRpbmdNb2RpZmllZERvY3VtZW50RW50cnkpIHtcblx0XHRcdFx0Y29uc3QgZGlmZiA9IGF3YWl0IGVudHJ5LmdldERpZmZJbmZvKCk7XG5cdFx0XHRcdGRpZmZJbmZvcy5wdXNoKHtcblx0XHRcdFx0XHRjaGFuZ2VzOiBkaWZmLmNoYW5nZXMsXG5cdFx0XHRcdFx0aWRlbnRpY2FsOiBkaWZmLmlkZW50aWNhbCxcblx0XHRcdFx0XHRvcmlnaW5hbE1vZGVsOiBlbnRyeS5vcmlnaW5hbE1vZGVsLFxuXHRcdFx0XHRcdG1vZGlmaWVkTW9kZWw6IGVudHJ5Lm1vZGlmaWVkTW9kZWwsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkaWZmSW5mb3MubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fZXhwbGFuYXRpb25IYW5kbGUgPSB0aGlzLl9leHBsYW5hdGlvbk1vZGVsTWFuYWdlci5nZW5lcmF0ZUV4cGxhbmF0aW9ucyhkaWZmSW5mb3MsIHRoaXMuY2hhdFNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhd2FpdCB0aGlzLl9leHBsYW5hdGlvbkhhbmRsZS5jb21wbGV0ZWQ7XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXJFeHBsYW5hdGlvbnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2V4cGxhbmF0aW9uSGFuZGxlKSB7XG5cdFx0XHR0aGlzLl9leHBsYW5hdGlvbkhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9leHBsYW5hdGlvbkhhbmRsZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRoYXNFeHBsYW5hdGlvbnMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4cGxhbmF0aW9uSGFuZGxlICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvcmRFZGl0T3BlcmF0aW9ucyhlbnRyeTogQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5LCByZXNvdXJjZTogVVJJLCBlZGl0czogKFRleHRFZGl0IHwgSUNlbGxFZGl0T3BlcmF0aW9uKVtdLCByZXNwb25zZU1vZGVsOiBJQ2hhdFJlc3BvbnNlTW9kZWwpOiB2b2lkIHtcblx0XHQvLyBEZXRlcm1pbmUgaWYgdGhlc2UgYXJlIHRleHQgZWRpdHMgb3Igbm90ZWJvb2sgZWRpdHNcblx0XHRjb25zdCBpc05vdGVib29rRWRpdHMgPSBlZGl0cy5sZW5ndGggPiAwICYmIGhhc0tleShlZGl0c1swXSwgeyBjZWxsczogdHJ1ZSB9KTtcblxuXHRcdGlmIChpc05vdGVib29rRWRpdHMpIHtcblx0XHRcdC8vIFJlY29yZCBub3RlYm9vayBlZGl0IG9wZXJhdGlvblxuXHRcdFx0Y29uc3Qgbm90ZWJvb2tFZGl0cyA9IGVkaXRzIGFzIElDZWxsRWRpdE9wZXJhdGlvbltdO1xuXHRcdFx0dGhpcy5fdGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbih7XG5cdFx0XHRcdHR5cGU6IEZpbGVPcGVyYXRpb25UeXBlLk5vdGVib29rRWRpdCxcblx0XHRcdFx0dXJpOiByZXNvdXJjZSxcblx0XHRcdFx0cmVxdWVzdElkOiByZXNwb25zZU1vZGVsLnJlcXVlc3RJZCxcblx0XHRcdFx0ZXBvY2g6IHRoaXMuX3RpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHRcdGNlbGxFZGl0czogbm90ZWJvb2tFZGl0c1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBjZWxsSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChlbnRyeSBpbnN0YW5jZW9mIENoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5KSB7XG5cdFx0XHRcdGNvbnN0IGNlbGxVcmkgPSBDZWxsVXJpLnBhcnNlKHJlc291cmNlKTtcblx0XHRcdFx0aWYgKGNlbGxVcmkpIHtcblx0XHRcdFx0XHRjb25zdCBpID0gZW50cnkuZ2V0SW5kZXhPZkNlbGxIYW5kbGUoY2VsbFVyaS5oYW5kbGUpO1xuXHRcdFx0XHRcdGlmIChpICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0Y2VsbEluZGV4ID0gaTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGV4dEVkaXRzID0gZWRpdHMgYXMgVGV4dEVkaXRbXTtcblx0XHRcdHRoaXMuX3RpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oe1xuXHRcdFx0XHR0eXBlOiBGaWxlT3BlcmF0aW9uVHlwZS5UZXh0RWRpdCxcblx0XHRcdFx0dXJpOiByZXNvdXJjZSxcblx0XHRcdFx0cmVxdWVzdElkOiByZXNwb25zZU1vZGVsLnJlcXVlc3RJZCxcblx0XHRcdFx0ZXBvY2g6IHRoaXMuX3RpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHRcdGVkaXRzOiB0ZXh0RWRpdHMsXG5cdFx0XHRcdGNlbGxJbmRleCxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldEN1cnJlbnRUZXh0T3JOb3RlYm9va1NuYXBzaG90KGVudHJ5OiBBYnN0cmFjdENoYXRFZGl0aW5nTW9kaWZpZWRGaWxlRW50cnkpOiBzdHJpbmcge1xuXHRcdGlmIChlbnRyeSBpbnN0YW5jZW9mIENoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5KSB7XG5cdFx0XHRyZXR1cm4gZW50cnkuZ2V0Q3VycmVudFNuYXBzaG90KCk7XG5cdFx0fSBlbHNlIGlmIChlbnRyeSBpbnN0YW5jZW9mIENoYXRFZGl0aW5nTW9kaWZpZWREb2N1bWVudEVudHJ5KSB7XG5cdFx0XHRyZXR1cm4gZW50cnkuZ2V0Q3VycmVudENvbnRlbnRzKCk7XG5cdFx0fSBlbHNlIGlmIChlbnRyeSBpbnN0YW5jZW9mIENoYXRFZGl0aW5nRGVsZXRlZEZpbGVFbnRyeSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYHVua25vd24gZW50cnkgdHlwZSBmb3IgJHtlbnRyeS5tb2RpZmllZFVSSX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hY2NlcHRTdHJlYW1pbmdFZGl0c1N0YXJ0KHJlc3BvbnNlTW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbCwgdW5kb1N0b3A6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVzb3VyY2U6IFVSSSkge1xuXHRcdGNvbnN0IGVudHJ5ID0gYXdhaXQgdGhpcy5fZ2V0T3JDcmVhdGVNb2RpZmllZEZpbGVFbnRyeShyZXNvdXJjZSwgTm90RXhpc3RCZWhhdmlvci5DcmVhdGUsIHRoaXMuX2dldFRlbGVtZXRyeUluZm9Gb3JNb2RlbChyZXNwb25zZU1vZGVsKSk7XG5cblx0XHQvLyBSZWNvcmQgZmlsZSBiYXNlbGluZSBpZiB0aGlzIGlzIHRoZSBmaXJzdCBlZGl0IGZvciB0aGlzIGZpbGUgaW4gdGhpcyByZXF1ZXN0XG5cdFx0aWYgKCF0aGlzLl90aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUocmVzb3VyY2UsIHJlc3BvbnNlTW9kZWwucmVxdWVzdElkKSkge1xuXHRcdFx0dGhpcy5fdGltZWxpbmUucmVjb3JkRmlsZUJhc2VsaW5lKHtcblx0XHRcdFx0dXJpOiByZXNvdXJjZSxcblx0XHRcdFx0cmVxdWVzdElkOiByZXNwb25zZU1vZGVsLnJlcXVlc3RJZCxcblx0XHRcdFx0Y29udGVudDogdGhpcy5fZ2V0Q3VycmVudFRleHRPck5vdGVib29rU25hcHNob3QoZW50cnkpLFxuXHRcdFx0XHRlcG9jaDogdGhpcy5fdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFx0dGVsZW1ldHJ5SW5mbzogZW50cnkudGVsZW1ldHJ5SW5mbyxcblx0XHRcdFx0bm90ZWJvb2tWaWV3VHlwZTogZW50cnkgaW5zdGFuY2VvZiBDaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeSA/IGVudHJ5LnZpZXdUeXBlIDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5zZXQoQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuU3RyZWFtaW5nRWRpdHMsIHR4KTtcblx0XHRcdGVudHJ5LmFjY2VwdFN0cmVhbWluZ0VkaXRzU3RhcnQocmVzcG9uc2VNb2RlbCwgdW5kb1N0b3AsIHR4KTtcblx0XHRcdC8vIE5vdGU6IEluZGl2aWR1YWwgZWRpdCBvcGVyYXRpb25zIHdpbGwgYmUgcmVjb3JkZWQgYnkgdGhlIGZpbGUgZW50cmllc1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaW5pdEVudHJpZXMoeyBlbnRyaWVzIH06IElDaGF0RWRpdGluZ1Nlc3Npb25TdG9wKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gUmVzZXQgYWxsIHRoZSBmaWxlcyB3aGljaCBhcmUgbW9kaWZpZWQgaW4gdGhpcyBzZXNzaW9uIHN0YXRlXG5cdFx0Ly8gYnV0IHdoaWNoIGFyZSBub3QgZm91bmQgaW4gdGhlIHNuYXBzaG90XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9lbnRyaWVzT2JzLmdldCgpKSB7XG5cdFx0XHRjb25zdCBzbmFwc2hvdEVudHJ5ID0gZW50cmllcy5nZXQoZW50cnkubW9kaWZpZWRVUkkpO1xuXHRcdFx0aWYgKCFzbmFwc2hvdEVudHJ5KSB7XG5cdFx0XHRcdGF3YWl0IGVudHJ5LnJlc2V0VG9Jbml0aWFsQ29udGVudCgpO1xuXHRcdFx0XHRlbnRyeS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cmllc0FycjogQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5W10gPSBbXTtcblx0XHQvLyBSZXN0b3JlIGFsbCBlbnRyaWVzIGZyb20gdGhlIHNuYXBzaG90XG5cdFx0Zm9yIChjb25zdCBzbmFwc2hvdEVudHJ5IG9mIGVudHJpZXMudmFsdWVzKCkpIHtcblx0XHRcdGxldCBlbnRyeTogQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoc25hcHNob3RFbnRyeS5pc0RlbGV0ZWQpIHtcblx0XHRcdFx0Ly8gQ3JlYXRlIGEgZGVsZXRlZCBmaWxlIGVudHJ5XG5cdFx0XHRcdGVudHJ5ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0Q2hhdEVkaXRpbmdEZWxldGVkRmlsZUVudHJ5LFxuXHRcdFx0XHRcdHNuYXBzaG90RW50cnkucmVzb3VyY2UsXG5cdFx0XHRcdFx0c25hcHNob3RFbnRyeS5vcmlnaW5hbCwgLy8gb3JpZ2luYWwgY29udGVudCBiZWZvcmUgZGVsZXRpb25cblx0XHRcdFx0XHR7IGNvbGxhcHNlOiAodHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCkgPT4gdGhpcy5fY29sbGFwc2Uoc25hcHNob3RFbnRyeS5yZXNvdXJjZSwgdHgpIH0sXG5cdFx0XHRcdFx0c25hcHNob3RFbnRyeS50ZWxlbWV0cnlJbmZvLFxuXHRcdFx0XHRcdHNuYXBzaG90RW50cnkubGFuZ3VhZ2VJZFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRhd2FpdCBlbnRyeS5yZXN0b3JlRnJvbVNuYXBzaG90KHNuYXBzaG90RW50cnksIGZhbHNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVudHJ5ID0gYXdhaXQgdGhpcy5fZ2V0T3JDcmVhdGVNb2RpZmllZEZpbGVFbnRyeShzbmFwc2hvdEVudHJ5LnJlc291cmNlLCBOb3RFeGlzdEJlaGF2aW9yLkFib3J0LCBzbmFwc2hvdEVudHJ5LnRlbGVtZXRyeUluZm8pO1xuXHRcdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0XHRjb25zdCByZXN0b3JlVG9EaXNrID0gc25hcHNob3RFbnRyeS5zdGF0ZSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZDtcblx0XHRcdFx0XHRhd2FpdCBlbnRyeS5yZXN0b3JlRnJvbVNuYXBzaG90KHNuYXBzaG90RW50cnksIHJlc3RvcmVUb0Rpc2spO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRlbnRyaWVzQXJyLnB1c2goZW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2VudHJpZXNPYnMuc2V0KGVudHJpZXNBcnIsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fcmVwb3J0U2Vzc2lvbkluZm8oJ2NoYXRFZGl0aW5nL3Nlc3Npb25SZXN0b3JlJywgZW50cmllc0Fycik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hY2NlcHRFZGl0cyhyZXNvdXJjZTogVVJJLCB0ZXh0RWRpdHM6IChUZXh0RWRpdCB8IElDZWxsRWRpdE9wZXJhdGlvbilbXSwgaXNMYXN0RWRpdHM6IGJvb2xlYW4sIHJlc3BvbnNlTW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gYXdhaXQgdGhpcy5fZ2V0T3JDcmVhdGVNb2RpZmllZEZpbGVFbnRyeShyZXNvdXJjZSwgTm90RXhpc3RCZWhhdmlvci5DcmVhdGUsIHRoaXMuX2dldFRlbGVtZXRyeUluZm9Gb3JNb2RlbChyZXNwb25zZU1vZGVsKSk7XG5cblx0XHQvLyBSZWNvcmQgZWRpdCBvcGVyYXRpb25zIGluIHRoZSB0aW1lbGluZSBpZiB0aGVyZSBhcmUgYWN0dWFsIGVkaXRzXG5cdFx0aWYgKHRleHRFZGl0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9yZWNvcmRFZGl0T3BlcmF0aW9ucyhlbnRyeSwgcmVzb3VyY2UsIHRleHRFZGl0cywgcmVzcG9uc2VNb2RlbCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgZW50cnkuYWNjZXB0QWdlbnRFZGl0cyhyZXNvdXJjZSwgdGV4dEVkaXRzLCBpc0xhc3RFZGl0cywgcmVzcG9uc2VNb2RlbCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUZWxlbWV0cnlJbmZvRm9yTW9kZWwocmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsKTogSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvIHtcblx0XHQvLyBNYWtlIHRoZXNlIGdldHRlcnMgYmVjYXVzZSB0aGUgcmVzcG9uc2UgcmVzdWx0IGlzIG5vdCBhdmFpbGFibGUgd2hlbiB0aGUgZmlsZSBmaXJzdCBzdGFydHMgdG8gYmUgZWRpdGVkXG5cdFx0cmV0dXJuIG5ldyBjbGFzcyBpbXBsZW1lbnRzIElNb2RpZmllZEVudHJ5VGVsZW1ldHJ5SW5mbyB7XG5cdFx0XHRnZXQgYWdlbnRJZCgpIHsgcmV0dXJuIHJlc3BvbnNlTW9kZWwuYWdlbnQ/LmlkOyB9XG5cdFx0XHRnZXQgbW9kZWxJZCgpIHsgcmV0dXJuIHJlc3BvbnNlTW9kZWwucmVxdWVzdD8ubW9kZWxJZDsgfVxuXHRcdFx0Z2V0IG1vZGVJZCgpIHsgcmV0dXJuIHJlc3BvbnNlTW9kZWwucmVxdWVzdD8ubW9kZUluZm8/LnRlbGVtZXRyeU1vZGVJZDsgfVxuXHRcdFx0Z2V0IGNvbW1hbmQoKSB7IHJldHVybiByZXNwb25zZU1vZGVsLnNsYXNoQ29tbWFuZD8ubmFtZTsgfVxuXHRcdFx0Z2V0IHNlc3Npb25SZXNvdXJjZSgpIHsgcmV0dXJuIHJlc3BvbnNlTW9kZWwuc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2U7IH1cblx0XHRcdGdldCByZXF1ZXN0SWQoKSB7IHJldHVybiByZXNwb25zZU1vZGVsLnJlcXVlc3RJZDsgfVxuXHRcdFx0Z2V0IHJlc3VsdCgpIHsgcmV0dXJuIHJlc3BvbnNlTW9kZWwucmVzdWx0OyB9XG5cdFx0XHRnZXQgYXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQoKSB7IHJldHVybiByZXNwb25zZU1vZGVsLnJlcXVlc3Q/Lm1vZGVJbmZvPy5hcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDsgfVxuXG5cdFx0XHRnZXQgZmVhdHVyZSgpOiAnc2lkZUJhckNoYXQnIHwgJ2lubGluZUNoYXQnIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0aWYgKHJlc3BvbnNlTW9kZWwuc2Vzc2lvbi5pbml0aWFsTG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLkNoYXQpIHtcblx0XHRcdFx0XHRyZXR1cm4gJ3NpZGVCYXJDaGF0Jztcblx0XHRcdFx0fSBlbHNlIGlmIChyZXNwb25zZU1vZGVsLnNlc3Npb24uaW5pdGlhbExvY2F0aW9uID09PSBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpIHtcblx0XHRcdFx0XHRyZXR1cm4gJ2lubGluZUNoYXQnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3JlcG9ydFNlc3Npb25JbmZvKGV2ZW50TmFtZTogJ2NoYXRFZGl0aW5nL3Nlc3Npb25TdG9yZScgfCAnY2hhdEVkaXRpbmcvc2Vzc2lvblJlc3RvcmUnLCBlbnRyaWVzOiByZWFkb25seSBBYnN0cmFjdENoYXRFZGl0aW5nTW9kaWZpZWRGaWxlRW50cnlbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRTZXNzaW9uSWQgPSBnZXRLZXlGb3JDaGF0U2Vzc2lvblJlc291cmNlKHRoaXMuY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Ly8gU2VsZWN0IDUlIG9mIGVkaXQgc2Vzc2lvbnMgYnkgSUQsIHJldGFpbmluZyBhbGwgc3RvcmUgYW5kIHJlc3RvcmUgZXZlbnRzIGZvciBzZWxlY3RlZCBzZXNzaW9ucyBhbmQgbm9uZSBmb3IgdGhlIHJlc3QuXG5cdFx0aWYgKGlzU3RyaW5nSW5TYW1wbGUoZWRpdFNlc3Npb25JZCwgNSkpIHtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0RWRpdGluZ1Nlc3Npb25JbmZvRXZlbnQsIENoYXRFZGl0aW5nU2Vzc2lvbkluZm9DbGFzc2lmaWNhdGlvbj4oZXZlbnROYW1lLCB7XG5cdFx0XHRcdGVkaXRTZXNzaW9uSWQsXG5cdFx0XHRcdC4uLnRoaXMuX2NvdW50RW50cnlTdGF0ZXMoZW50cmllcyksXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb3VudEVudHJ5U3RhdGVzKGVudHJpZXM6IHJlYWRvbmx5IEFic3RyYWN0Q2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeVtdKTogeyBlbnRyeUNvdW50OiBudW1iZXI7IG1vZGlmaWVkQ291bnQ6IG51bWJlcjsgYWNjZXB0ZWRDb3VudDogbnVtYmVyOyByZWplY3RlZENvdW50OiBudW1iZXIgfSB7XG5cdFx0bGV0IGVudHJ5Q291bnQgPSAwO1xuXHRcdGxldCBtb2RpZmllZENvdW50ID0gMDtcblx0XHRsZXQgYWNjZXB0ZWRDb3VudCA9IDA7XG5cdFx0bGV0IHJlamVjdGVkQ291bnQgPSAwO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0ZW50cnlDb3VudCArPSAxO1xuXHRcdFx0c3dpdGNoIChlbnRyeS5zdGF0ZS5nZXQoKSkge1xuXHRcdFx0XHRjYXNlIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQ6XG5cdFx0XHRcdFx0bW9kaWZpZWRDb3VudCArPSAxO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuQWNjZXB0ZWQ6XG5cdFx0XHRcdFx0YWNjZXB0ZWRDb3VudCArPSAxO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuUmVqZWN0ZWQ6XG5cdFx0XHRcdFx0cmVqZWN0ZWRDb3VudCArPSAxO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBlbnRyeUNvdW50LCBtb2RpZmllZENvdW50LCBhY2NlcHRlZENvdW50LCByZWplY3RlZENvdW50IH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlKHJlcXVlc3RJZDogc3RyaW5nLCB1bmRvU3RvcDogc3RyaW5nIHwgdW5kZWZpbmVkLCByZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGFzT3RoZXJUYXNrcyA9IEl0ZXJhYmxlLnNvbWUodGhpcy5fc3RyZWFtaW5nRWRpdExvY2tzLmtleXMoKSwgayA9PiBrICE9PSByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRpZiAoIWhhc090aGVyVGFza3MpIHtcblx0XHRcdHRoaXMuX3N0YXRlLnNldChDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZS5JZGxlLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZ2V0RW50cnkocmVzb3VyY2UpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgY2hlY2twb2ludCBmb3IgdGhpcyBlZGl0IGNvbXBsZXRpb25cblx0XHRjb25zdCBsYWJlbCA9IHVuZG9TdG9wID8gYFJlcXVlc3QgJHtyZXF1ZXN0SWR9IC0gU3RvcCAke3VuZG9TdG9wfWAgOiBgUmVxdWVzdCAke3JlcXVlc3RJZH1gO1xuXHRcdHRoaXMuX3RpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQocmVxdWVzdElkLCB1bmRvU3RvcCwgbGFiZWwpO1xuXG5cdFx0cmV0dXJuIGVudHJ5LmFjY2VwdFN0cmVhbWluZ0VkaXRzRW5kKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0cmlldmVzIG9yIGNyZWF0ZXMgYSBtb2RpZmllZCBmaWxlIGVudHJ5LlxuXHQgKlxuXHQgKiBAcmV0dXJucyBUaGUgbW9kaWZpZWQgZmlsZSBlbnRyeS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2dldE9yQ3JlYXRlTW9kaWZpZWRGaWxlRW50cnkocmVzb3VyY2U6IFVSSSwgaWZOb3RFeGlzdHM6IE5vdEV4aXN0QmVoYXZpb3IuQ3JlYXRlLCB0ZWxlbWV0cnlJbmZvOiBJTW9kaWZpZWRFbnRyeVRlbGVtZXRyeUluZm8sIGluaXRpYWxDb250ZW50Pzogc3RyaW5nKTogUHJvbWlzZTxBYnN0cmFjdENoYXRFZGl0aW5nTW9kaWZpZWRGaWxlRW50cnk+O1xuXHRwcml2YXRlIGFzeW5jIF9nZXRPckNyZWF0ZU1vZGlmaWVkRmlsZUVudHJ5KHJlc291cmNlOiBVUkksIGlmTm90RXhpc3RzOiBOb3RFeGlzdEJlaGF2aW9yLCB0ZWxlbWV0cnlJbmZvOiBJTW9kaWZpZWRFbnRyeVRlbGVtZXRyeUluZm8sIGluaXRpYWxDb250ZW50Pzogc3RyaW5nKTogUHJvbWlzZTxBYnN0cmFjdENoYXRFZGl0aW5nTW9kaWZpZWRGaWxlRW50cnkgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIGFzeW5jIF9nZXRPckNyZWF0ZU1vZGlmaWVkRmlsZUVudHJ5KHJlc291cmNlOiBVUkksIGlmTm90RXhpc3RzOiBOb3RFeGlzdEJlaGF2aW9yLCB0ZWxlbWV0cnlJbmZvOiBJTW9kaWZpZWRFbnRyeVRlbGVtZXRyeUluZm8sIF9pbml0aWFsQ29udGVudD86IHN0cmluZyk6IFByb21pc2U8QWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cblx0XHRyZXNvdXJjZSA9IENlbGxVcmkucGFyc2UocmVzb3VyY2UpPy5ub3RlYm9vayA/PyByZXNvdXJjZTtcblxuXHRcdGNvbnN0IGV4aXN0aW5nRW50cnkgPSB0aGlzLl9lbnRyaWVzT2JzLmdldCgpLmZpbmQoZSA9PiBpc0VxdWFsKGUubW9kaWZpZWRVUkksIHJlc291cmNlKSk7XG5cdFx0aWYgKGV4aXN0aW5nRW50cnkpIHtcblx0XHRcdC8vIElmIHRoZSBleGlzdGluZyBlbnRyeSBpcyBhIGRlbGV0ZWQgZmlsZSBlbnRyeSwgd2UgbmVlZCB0byByZXBsYWNlIGl0IHdpdGggYSBuZXcgbW9kaWZpZWQgZW50cnlcblx0XHRcdC8vIFRoaXMgaGFuZGxlcyB0aGUgY2FzZSB3aGVyZSBhIGZpbGUgd2FzIGRlbGV0ZWQgYW5kIHRoZW4gcmVjcmVhdGVkXG5cdFx0XHRpZiAoZXhpc3RpbmdFbnRyeSBpbnN0YW5jZW9mIENoYXRFZGl0aW5nRGVsZXRlZEZpbGVFbnRyeSkge1xuXHRcdFx0XHQvLyBVc2UgdGhlIG9yaWdpbmFsIGNvbnRlbnQgZnJvbSB0aGUgZGVsZXRlZCBlbnRyeSBhcyB0aGUgaW5pdGlhbCBjb250ZW50IGZvciB0aGUgbmV3IGVudHJ5XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxDb250ZW50RnJvbURlbGV0ZWQgPSBleGlzdGluZ0VudHJ5LnN0YXRlLmdldCgpID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkXG5cdFx0XHRcdFx0PyBleGlzdGluZ0VudHJ5LmluaXRpYWxDb250ZW50XG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0Ly8gUmVtb3ZlIHRoZSBkZWxldGVkIGVudHJ5XG5cdFx0XHRcdGV4aXN0aW5nRW50cnkuZGlzcG9zZSgpO1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzID0gdGhpcy5fZW50cmllc09icy5nZXQoKS5maWx0ZXIoZSA9PiBlICE9PSBleGlzdGluZ0VudHJ5KTtcblx0XHRcdFx0dGhpcy5fZW50cmllc09icy5zZXQoZW50cmllcywgdW5kZWZpbmVkKTtcblxuXHRcdFx0XHQvLyBTZXQgdGhlIGluaXRpYWwgY29udGVudCBmcm9tIHRoZSBkZWxldGVkIGVudHJ5IGlmIGl0IHdhcyBzdGlsbCBpbiBtb2RpZmllZCBzdGF0ZVxuXHRcdFx0XHRpZiAoaW5pdGlhbENvbnRlbnRGcm9tRGVsZXRlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0X2luaXRpYWxDb250ZW50ID0gaW5pdGlhbENvbnRlbnRGcm9tRGVsZXRlZDtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBGYWxsIHRocm91Z2ggdG8gY3JlYXRlIGEgbmV3IGVudHJ5XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGVsZW1ldHJ5SW5mby5yZXF1ZXN0SWQgIT09IGV4aXN0aW5nRW50cnkudGVsZW1ldHJ5SW5mby5yZXF1ZXN0SWQpIHtcblx0XHRcdFx0XHRleGlzdGluZ0VudHJ5LnVwZGF0ZVRlbGVtZXRyeUluZm8odGVsZW1ldHJ5SW5mbyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nRW50cnk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGVudHJ5OiBBYnN0cmFjdENoYXRFZGl0aW5nTW9kaWZpZWRGaWxlRW50cnk7XG5cdFx0Y29uc3QgZXhpc3RpbmdFeHRlcm5hbEVudHJ5ID0gdGhpcy5fbG9va3VwRXh0ZXJuYWxFbnRyeShyZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nRXh0ZXJuYWxFbnRyeSkge1xuXHRcdFx0ZW50cnkgPSBleGlzdGluZ0V4dGVybmFsRW50cnk7XG5cblx0XHRcdGlmICh0ZWxlbWV0cnlJbmZvLnJlcXVlc3RJZCAhPT0gZW50cnkudGVsZW1ldHJ5SW5mby5yZXF1ZXN0SWQpIHtcblx0XHRcdFx0ZW50cnkudXBkYXRlVGVsZW1ldHJ5SW5mbyh0ZWxlbWV0cnlJbmZvKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaW5pdGlhbENvbnRlbnQgPSBfaW5pdGlhbENvbnRlbnQgPz8gdGhpcy5faW5pdGlhbEZpbGVDb250ZW50cy5nZXQocmVzb3VyY2UpO1xuXHRcdFx0Ly8gVGhpcyBnZXRzIG1hbnVhbGx5IGRpc3Bvc2VkIGluIC5kaXNwb3NlKCkgb3IgaW4gLnJlc3RvcmVTbmFwc2hvdCgpXG5cdFx0XHRjb25zdCBtYXliZUVudHJ5ID0gYXdhaXQgdGhpcy5fY3JlYXRlTW9kaWZpZWRGaWxlRW50cnkocmVzb3VyY2UsIHRlbGVtZXRyeUluZm8sIGlmTm90RXhpc3RzLCBpbml0aWFsQ29udGVudCk7XG5cdFx0XHRpZiAoIW1heWJlRW50cnkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGVudHJ5ID0gbWF5YmVFbnRyeTtcblx0XHRcdGlmIChpbml0aWFsQ29udGVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX2luaXRpYWxGaWxlQ29udGVudHMuc2V0KHJlc291cmNlLCBlbnRyeS5pbml0aWFsQ29udGVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgYW4gZW50cnkgaXMgZGVsZXRlZCBlLmcuIHJldmVydGluZyBhIGNyZWF0ZWQgZmlsZSxcblx0XHQvLyByZW1vdmUgaXQgZnJvbSB0aGUgZW50cmllcyBhbmQgZG9uJ3Qgc2hvdyBpdCBpbiB0aGUgd29ya2luZyBzZXQgYW55bW9yZVxuXHRcdC8vIHNvIHRoYXQgaXQgY2FuIGJlIHJlY3JlYXRlZCBlLmcuIHRocm91Z2ggcmV0cnlcblx0XHRjb25zdCBsaXN0ZW5lciA9IGVudHJ5Lm9uRGlkRGVsZXRlKCgpID0+IHtcblx0XHRcdGNvbnN0IG5ld0VudHJpZXMgPSB0aGlzLl9lbnRyaWVzT2JzLmdldCgpLmZpbHRlcihlID0+ICFpc0VxdWFsKGUubW9kaWZpZWRVUkksIGVudHJ5Lm1vZGlmaWVkVVJJKSk7XG5cdFx0XHR0aGlzLl9lbnRyaWVzT2JzLnNldChuZXdFbnRyaWVzLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5jbG9zZUVkaXRvcnModGhpcy5fZWRpdG9yU2VydmljZS5maW5kRWRpdG9ycyhlbnRyeS5tb2RpZmllZFVSSSkpO1xuXG5cdFx0XHRpZiAoIWV4aXN0aW5nRXh0ZXJuYWxFbnRyeSkge1xuXHRcdFx0XHQvLyBkb24ndCBkaXNwb3NlIGVudHJpZXMgdGhhdCBhcmUgbm90IHlvdXJzIVxuXHRcdFx0XHRlbnRyeS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3N0b3JlLmRlbGV0ZShsaXN0ZW5lcik7XG5cdFx0fSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGxpc3RlbmVyKTtcblxuXHRcdGNvbnN0IGVudHJpZXNBcnIgPSBbLi4udGhpcy5fZW50cmllc09icy5nZXQoKSwgZW50cnldO1xuXHRcdHRoaXMuX2VudHJpZXNPYnMuc2V0KGVudHJpZXNBcnIsIHVuZGVmaW5lZCk7XG5cblx0XHRyZXR1cm4gZW50cnk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVNb2RpZmllZEZpbGVFbnRyeShyZXNvdXJjZTogVVJJLCB0ZWxlbWV0cnlJbmZvOiBJTW9kaWZpZWRFbnRyeVRlbGVtZXRyeUluZm8sIGlmTm90RXhpc3RzOiBOb3RFeGlzdEJlaGF2aW9yLkNyZWF0ZSwgaW5pdGlhbENvbnRlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8QWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5Pjtcblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlTW9kaWZpZWRGaWxlRW50cnkocmVzb3VyY2U6IFVSSSwgdGVsZW1ldHJ5SW5mbzogSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvLCBpZk5vdEV4aXN0czogTm90RXhpc3RCZWhhdmlvciwgaW5pdGlhbENvbnRlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8QWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IHwgdW5kZWZpbmVkPjtcblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVNb2RpZmllZEZpbGVFbnRyeShyZXNvdXJjZTogVVJJLCB0ZWxlbWV0cnlJbmZvOiBJTW9kaWZpZWRFbnRyeVRlbGVtZXRyeUluZm8sIGlmTm90RXhpc3RzOiBOb3RFeGlzdEJlaGF2aW9yLCBpbml0aWFsQ29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxBYnN0cmFjdENoYXRFZGl0aW5nTW9kaWZpZWRGaWxlRW50cnkgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBtdWx0aURpZmZFbnRyeURlbGVnYXRlID0ge1xuXHRcdFx0Y29sbGFwc2U6ICh0cmFuc2FjdGlvbjogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKSA9PiB0aGlzLl9jb2xsYXBzZShyZXNvdXJjZSwgdHJhbnNhY3Rpb24pLFxuXHRcdFx0cmVjb3JkT3BlcmF0aW9uOiAob3BlcmF0aW9uOiBNdXRhYmxlPEZpbGVPcGVyYXRpb24+KSA9PiB7XG5cdFx0XHRcdG9wZXJhdGlvbi5lcG9jaCA9IHRoaXMuX3RpbWVsaW5lLmluY3JlbWVudEVwb2NoKCk7XG5cdFx0XHRcdHRoaXMuX3RpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24ob3BlcmF0aW9uKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBub3RlYm9va1VyaSA9IENlbGxVcmkucGFyc2UocmVzb3VyY2UpPy5ub3RlYm9vayB8fCByZXNvdXJjZTtcblx0XHRjb25zdCBkb0NyZWF0ZSA9IGFzeW5jIChjaGF0S2luZDogQ2hhdEVkaXRLaW5kKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fbm90ZWJvb2tTZXJ2aWNlLmhhc1N1cHBvcnRlZE5vdGVib29rcyhub3RlYm9va1VyaSkpIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IENoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5LmNyZWF0ZShub3RlYm9va1VyaSwgbXVsdGlEaWZmRW50cnlEZWxlZ2F0ZSwgdGVsZW1ldHJ5SW5mbywgY2hhdEtpbmQsIGluaXRpYWxDb250ZW50LCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl90ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFZGl0aW5nTW9kaWZpZWREb2N1bWVudEVudHJ5LCByZWYsIG11bHRpRGlmZkVudHJ5RGVsZWdhdGUsIHRlbGVtZXRyeUluZm8sIGNoYXRLaW5kLCBpbml0aWFsQ29udGVudCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgZG9DcmVhdGUoQ2hhdEVkaXRLaW5kLk1vZGlmaWVkKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChpZk5vdEV4aXN0cyA9PT0gTm90RXhpc3RCZWhhdmlvci5BYm9ydCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB0aGlzIGZpbGUgZG9lcyBub3QgZXhpc3QgeWV0LCBjcmVhdGUgaXQgYW5kIHRyeSBhZ2FpblxuXHRcdFx0YXdhaXQgdGhpcy5fYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KHsgZWRpdHM6IFt7IG5ld1Jlc291cmNlOiByZXNvdXJjZSB9XSB9KTtcblx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdhY2Nlc3NpYmlsaXR5Lm9wZW5DaGF0RWRpdGVkRmlsZXMnKSkge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSwgb3B0aW9uczogeyBpbmFjdGl2ZTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSwgcGlubmVkOiB0cnVlLCBpc0V4cGxpY2l0OiBmYWxzZSB9IH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZWNvcmQgZmlsZSBjcmVhdGlvbiBvcGVyYXRpb25cblx0XHRcdHRoaXMuX3RpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oe1xuXHRcdFx0XHR0eXBlOiBGaWxlT3BlcmF0aW9uVHlwZS5DcmVhdGUsXG5cdFx0XHRcdHVyaTogcmVzb3VyY2UsXG5cdFx0XHRcdHJlcXVlc3RJZDogdGVsZW1ldHJ5SW5mby5yZXF1ZXN0SWQsXG5cdFx0XHRcdGVwb2NoOiB0aGlzLl90aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0XHRpbml0aWFsQ29udGVudDogaW5pdGlhbENvbnRlbnQgfHwgJycsXG5cdFx0XHRcdHRlbGVtZXRyeUluZm8sXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHRoaXMuX25vdGVib29rU2VydmljZS5oYXNTdXBwb3J0ZWROb3RlYm9va3Mobm90ZWJvb2tVcmkpKSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBDaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeS5jcmVhdGUocmVzb3VyY2UsIG11bHRpRGlmZkVudHJ5RGVsZWdhdGUsIHRlbGVtZXRyeUluZm8sIENoYXRFZGl0S2luZC5DcmVhdGVkLCBpbml0aWFsQ29udGVudCwgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IGRvQ3JlYXRlKENoYXRFZGl0S2luZC5DcmVhdGVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb2xsYXBzZShyZXNvdXJjZTogVVJJLCB0cmFuc2FjdGlvbjogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgbXVsdGlEaWZmSXRlbSA9IHRoaXMuX2VkaXRvclBhbmU/LmZpbmREb2N1bWVudERpZmZJdGVtKHJlc291cmNlKTtcblx0XHRpZiAobXVsdGlEaWZmSXRlbSkge1xuXHRcdFx0dGhpcy5fZWRpdG9yUGFuZT8udmlld01vZGVsPy5pdGVtcy5nZXQoKS5maW5kKChkb2N1bWVudERpZmZJdGVtKSA9PlxuXHRcdFx0XHRpc0VxdWFsKGRvY3VtZW50RGlmZkl0ZW0ub3JpZ2luYWxVcmksIG11bHRpRGlmZkl0ZW0ub3JpZ2luYWxVcmkpICYmXG5cdFx0XHRcdGlzRXF1YWwoZG9jdW1lbnREaWZmSXRlbS5tb2RpZmllZFVyaSwgbXVsdGlEaWZmSXRlbS5tb2RpZmllZFVyaSkpXG5cdFx0XHRcdD8uY29sbGFwc2VkLnNldCh0cnVlLCB0cmFuc2FjdGlvbik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQXdCLFdBQVcsZ0JBQWdCLGVBQWU7QUFDM0UsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsWUFBWSxpQkFBaUIsZUFBZTtBQUNyRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFNBQTZDLGlCQUFpQixtQkFBbUI7QUFDMUYsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsYUFBYTtBQUV0QixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQixtQ0FBbUM7QUFDakUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxlQUFtQztBQUM1QyxTQUFTLHdCQUF3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
