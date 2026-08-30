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
import { equals as arraysEqual } from "../../../../../base/common/arrays.js";
import { findFirst, findLast, findLastIdx } from "../../../../../base/common/arraysFind.js";
import { assertNever } from "../../../../../base/common/assert.js";
import { ThrottledDelayer } from "../../../../../base/common/async.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { mapsStrictEqualIgnoreOrder, ResourceMap, ResourceSet } from "../../../../../base/common/map.js";
import { equals as objectsEqual } from "../../../../../base/common/objects.js";
import { constObservable, derived, derivedOpts, ObservablePromise, observableSignalFromEvent, observableValue, observableValueOpts, transaction } from "../../../../../base/common/observable.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { isDefined } from "../../../../../base/common/types.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { DefaultEndOfLine, EndOfLinePreference, ValidAnnotatedEditOperation } from "../../../../../editor/common/model.js";
import { createTextBuffer } from "../../../../../editor/common/model/textModel.js";
import { IEditorWorkerService } from "../../../../../editor/common/services/editorWorker.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { CellEditType, CellUri } from "../../../notebook/common/notebookCommon.js";
import { INotebookEditorModelResolverService } from "../../../notebook/common/notebookEditorModelResolverService.js";
import { INotebookService } from "../../../notebook/common/notebookService.js";
import { emptySessionEntryDiff } from "../../common/editing/chatEditingService.js";
import { FileOperationType } from "./chatEditingOperations.js";
import { ChatEditingSnapshotTextModelContentProvider } from "./chatEditingTextModelContentProviders.js";
import { createSnapshot as createNotebookSnapshot, restoreSnapshot as restoreNotebookSnapshot } from "./notebook/chatEditingModifiedNotebookSnapshot.js";
const START_REQUEST_EPOCH = "$$start";
const STOP_ID_EPOCH_PREFIX = "__epoch_";
let ChatEditingCheckpointTimelineImpl = class {
  constructor(chatSessionResource, _delegate, _notebookEditorModelResolverService, _notebookService, _textModelService, _editorWorkerService, _configurationService) {
    this.chatSessionResource = chatSessionResource;
    this._delegate = _delegate;
    this._notebookEditorModelResolverService = _notebookEditorModelResolverService;
    this._notebookService = _notebookService;
    this._textModelService = _textModelService;
    this._editorWorkerService = _editorWorkerService;
    this._configurationService = _configurationService;
    this._epochCounter = 0;
    this._checkpoints = observableValue(this, []);
    this._currentEpoch = observableValue(this, 0);
    this._operations = observableValueOpts({ equalsFn: () => false }, []);
    // mutable
    this._fileBaselines = /* @__PURE__ */ new Map();
    // key: `${uri}::${requestId}`
    this._refCountedDiffs = /* @__PURE__ */ new Map();
    this._finalizedDiffCache = /* @__PURE__ */ new Map();
    /** Gets the checkpoint, if any, we can 'undo' to. */
    this._willUndoToCheckpoint = derived((reader) => {
      const currentEpoch = this._currentEpoch.read(reader);
      const checkpoints = this._checkpoints.read(reader);
      if (checkpoints.length < 2 || currentEpoch <= checkpoints[1].epoch) {
        return void 0;
      }
      const operations = this._operations.read(reader);
      const currentCheckpointIdx = findLastIdx(checkpoints, (cp) => cp.epoch < currentEpoch);
      const startOfRequest = currentCheckpointIdx === -1 ? void 0 : findLast(checkpoints, (cp) => cp.undoStopId === void 0, currentCheckpointIdx);
      const previousOperation = findLast(operations, (op) => op.epoch < currentEpoch);
      const previousCheckpoint = previousOperation && findLast(checkpoints, (cp) => cp.epoch < previousOperation.epoch);
      if (!startOfRequest) {
        return previousCheckpoint;
      }
      if (!previousCheckpoint) {
        return startOfRequest;
      }
      if (!operations.some((op) => op.epoch > startOfRequest.epoch && op.epoch < previousCheckpoint.epoch)) {
        return startOfRequest;
      }
      return previousCheckpoint.epoch > startOfRequest.epoch ? previousCheckpoint : startOfRequest;
    });
    this.canUndo = this._willUndoToCheckpoint.map((cp) => !!cp);
    /**
     * Gets the epoch we'll redo this. Unlike undo this doesn't only use checkpoints
     * because we could potentially redo to a 'tip' operation that's not checkpointed yet.
     */
    this._willRedoToEpoch = derived((reader) => {
      const currentEpoch = this._currentEpoch.read(reader);
      const operations = this._operations.read(reader);
      const checkpoints = this._checkpoints.read(reader);
      const maxEncounteredEpoch = Math.max(operations.at(-1)?.epoch || 0, checkpoints.at(-1)?.epoch || 0);
      if (currentEpoch > maxEncounteredEpoch) {
        return void 0;
      }
      const nextOperation = operations.find((op) => op.epoch >= currentEpoch);
      if (!nextOperation) {
        const nextRequestStart = checkpoints.find((cp) => cp.epoch >= currentEpoch && cp.undoStopId === void 0);
        if (!nextRequestStart) {
          return maxEncounteredEpoch + 1;
        }
        const requestAfter = checkpoints.find((cp) => cp.epoch > nextRequestStart.epoch && cp.undoStopId === void 0);
        return requestAfter ? requestAfter.epoch : maxEncounteredEpoch + 1;
      }
      const nextCheckpoint = checkpoints.find((op) => op.epoch > nextOperation.epoch);
      const currentCheckpoint = findLast(checkpoints, (cp) => cp.epoch < currentEpoch);
      if (currentCheckpoint && nextOperation && currentCheckpoint.requestId !== nextOperation.requestId) {
        const startOfNextRequestIdx = findLastIdx(checkpoints, (cp, i) => cp.undoStopId === void 0 && checkpoints[i - 1]?.requestId === currentCheckpoint.requestId);
        const startOfNextRequest = startOfNextRequestIdx === -1 ? void 0 : checkpoints[startOfNextRequestIdx];
        if (startOfNextRequest && nextOperation.requestId !== startOfNextRequest.requestId) {
          const requestAfterTheNext = findFirst(checkpoints, (op) => op.undoStopId === void 0, startOfNextRequestIdx + 1);
          if (requestAfterTheNext) {
            return requestAfterTheNext.epoch;
          }
        }
      }
      return Math.min(
        nextCheckpoint?.epoch || Infinity,
        maxEncounteredEpoch + 1
      );
    });
    this.canRedo = this._willRedoToEpoch.map((e) => !!e);
    this.requestDisablement = derivedOpts(
      { equalsFn: (a, b) => arraysEqual(a, b, objectsEqual) },
      (reader) => {
        const currentEpoch = this._currentEpoch.read(reader);
        const operations = this._operations.read(reader);
        const checkpoints = this._checkpoints.read(reader);
        const maxEncounteredEpoch = Math.max(operations.at(-1)?.epoch || 0, checkpoints.at(-1)?.epoch || 0);
        if (currentEpoch > maxEncounteredEpoch) {
          return [];
        }
        const lastAppliedOperation = findLast(operations, (op) => op.epoch < currentEpoch)?.epoch || 0;
        const lastAppliedRequest = findLast(checkpoints, (cp) => cp.epoch < currentEpoch && cp.undoStopId === void 0)?.epoch || 0;
        const stopDisablingAtEpoch = Math.max(lastAppliedOperation, lastAppliedRequest);
        const disablement = /* @__PURE__ */ new Map();
        for (let i = checkpoints.length - 1; i >= 0; i--) {
          const { undoStopId, requestId, epoch } = checkpoints[i];
          if (epoch <= stopDisablingAtEpoch) {
            break;
          }
          if (requestId) {
            disablement.set(requestId, undoStopId);
          }
        }
        return [...disablement].map(([requestId, afterUndoStop]) => ({ requestId, afterUndoStop }));
      }
    );
    this.createCheckpoint(void 0, void 0, "Initial State", "Starting point before any edits");
  }
  createCheckpoint(requestId, undoStopId, label, description) {
    const existingCheckpoints = this._checkpoints.get();
    const existing = existingCheckpoints.find((c) => c.undoStopId === undoStopId && c.requestId === requestId);
    if (existing) {
      return existing.checkpointId;
    }
    const { checkpoints, operations } = this._getVisibleOperationsAndCheckpoints();
    const checkpointId = generateUuid();
    const epoch = this.incrementEpoch();
    checkpoints.push({
      checkpointId,
      requestId,
      undoStopId,
      epoch,
      label,
      description
    });
    transaction((tx) => {
      this._checkpoints.set(checkpoints, tx);
      this._operations.set(operations, tx);
      this._currentEpoch.set(epoch + 1, tx);
    });
    return checkpointId;
  }
  async undoToLastCheckpoint() {
    const checkpoint = this._willUndoToCheckpoint.get();
    if (checkpoint) {
      await this.navigateToCheckpoint(checkpoint.checkpointId);
    }
  }
  async redoToNextCheckpoint() {
    const targetEpoch = this._willRedoToEpoch.get();
    if (targetEpoch) {
      await this._navigateToEpoch(targetEpoch);
    }
  }
  navigateToCheckpoint(checkpointId) {
    const targetCheckpoint = this._getCheckpoint(checkpointId);
    if (!targetCheckpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }
    if (targetCheckpoint.undoStopId === void 0) {
      return this._navigateToEpoch(targetCheckpoint.epoch + 1, targetCheckpoint.epoch);
    } else {
      return this._navigateToEpoch(targetCheckpoint.epoch + 1);
    }
  }
  getContentURIAtStop(requestId, fileURI, stopId) {
    return ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(this.chatSessionResource, requestId, stopId, fileURI.path, fileURI.scheme, fileURI.authority);
  }
  async _navigateToEpoch(restoreToEpoch, navigateToEpoch = restoreToEpoch) {
    const currentEpoch = this._currentEpoch.get();
    if (currentEpoch !== restoreToEpoch) {
      const urisToRestore = await this._applyFileSystemOperations(currentEpoch, restoreToEpoch);
      await this._reconstructAllFileContents(restoreToEpoch, urisToRestore);
    }
    this._currentEpoch.set(navigateToEpoch, void 0);
  }
  _getCheckpoint(checkpointId) {
    return this._checkpoints.get().find((c) => c.checkpointId === checkpointId);
  }
  incrementEpoch() {
    return this._epochCounter++;
  }
  recordFileOperation(operation) {
    const { currentEpoch, checkpoints, operations } = this._getVisibleOperationsAndCheckpoints();
    if (operation.epoch < currentEpoch) {
      throw new Error(`Cannot record operation at epoch ${operation.epoch} when current epoch is ${currentEpoch}`);
    }
    operations.push(operation);
    transaction((tx) => {
      this._checkpoints.set(checkpoints, tx);
      this._operations.set(operations, tx);
      this._currentEpoch.set(operation.epoch + 1, tx);
    });
  }
  _getVisibleOperationsAndCheckpoints() {
    const currentEpoch = this._currentEpoch.get();
    const checkpoints = this._checkpoints.get();
    const operations = this._operations.get();
    return {
      currentEpoch,
      checkpoints: checkpoints.filter((c) => c.epoch < currentEpoch),
      operations: operations.filter((op) => op.epoch < currentEpoch)
    };
  }
  recordFileBaseline(baseline) {
    const key = this._getBaselineKey(baseline.uri, baseline.requestId);
    this._fileBaselines.set(key, baseline);
  }
  _getFileBaseline(uri, requestId) {
    const key = this._getBaselineKey(uri, requestId);
    return this._fileBaselines.get(key);
  }
  hasFileBaseline(uri, requestId) {
    const key = this._getBaselineKey(uri, requestId);
    return this._fileBaselines.has(key) || this._operations.get().some((op) => op.type === FileOperationType.Create && op.requestId === requestId && isEqual(uri, op.uri));
  }
  async getContentAtStop(requestId, contentURI, stopId) {
    let toEpoch;
    if (stopId?.startsWith(STOP_ID_EPOCH_PREFIX)) {
      toEpoch = Number(stopId.slice(STOP_ID_EPOCH_PREFIX.length));
    } else {
      toEpoch = this._checkpoints.get().find((c) => c.requestId === requestId && c.undoStopId === stopId)?.epoch;
    }
    const fileURI = this._getTimelineCanonicalUriForPath(contentURI);
    if (!toEpoch || !fileURI) {
      return "";
    }
    const baseline = await this._findBestBaselineForFile(fileURI, toEpoch, requestId);
    if (!baseline) {
      return "";
    }
    const operations = this._getFileOperationsInRange(fileURI, baseline.epoch, toEpoch);
    const replayed = await this._replayOperations(baseline, operations);
    return replayed.exists ? replayed.content : void 0;
  }
  _getTimelineCanonicalUriForPath(contentURI) {
    for (const it of [this._fileBaselines.values(), this._operations.get()]) {
      for (const thing of it) {
        if (thing.uri.path === contentURI.path) {
          return thing.uri;
        }
      }
    }
    return void 0;
  }
  /**
   * Creates a callback that is invoked when data at the stop changes. This
   * will not fire initially and may be debounced internally.
   */
  onDidChangeContentsAtStop(requestId, contentURI, stopId, callback) {
    if (!stopId || !stopId.startsWith(STOP_ID_EPOCH_PREFIX)) {
      return Disposable.None;
    }
    const target = Number(stopId.slice(STOP_ID_EPOCH_PREFIX.length));
    if (target <= this._epochCounter) {
      return Disposable.None;
    }
    const store = new DisposableStore();
    const scheduler = store.add(new ThrottledDelayer(500));
    store.add(Event.fromObservableLight(this._operations)(() => {
      scheduler.trigger(async () => {
        if (this._operations.get().at(-1)?.epoch >= target) {
          store.dispose();
        }
        const content = await this.getContentAtStop(requestId, contentURI, stopId);
        if (content !== void 0) {
          callback(content);
        }
      });
    }));
    return store;
  }
  _getCheckpointBeforeEpoch(epoch, reader) {
    return findLast(this._checkpoints.read(reader), (c) => c.epoch <= epoch);
  }
  async _reconstructFileState(uri, targetEpoch) {
    const targetCheckpoint = this._getCheckpointBeforeEpoch(targetEpoch);
    if (!targetCheckpoint) {
      throw new Error(`Checkpoint for epoch ${targetEpoch} not found`);
    }
    const baseline = await this._findBestBaselineForFile(uri, targetEpoch, targetCheckpoint.requestId || "");
    if (!baseline) {
      return {
        exists: false,
        uri
      };
    }
    const operations = this._getFileOperationsInRange(uri, baseline.epoch, targetEpoch);
    return this._replayOperations(baseline, operations);
  }
  getStateForPersistence() {
    return {
      checkpoints: this._checkpoints.get(),
      currentEpoch: this._currentEpoch.get(),
      fileBaselines: [...this._fileBaselines],
      operations: this._operations.get(),
      epochCounter: this._epochCounter
    };
  }
  restoreFromState(state, tx) {
    this._checkpoints.set(state.checkpoints, tx);
    this._currentEpoch.set(state.currentEpoch, tx);
    this._operations.set(state.operations.slice(), tx);
    this._epochCounter = state.epochCounter;
    this._fileBaselines.clear();
    for (const [key, baseline] of state.fileBaselines) {
      this._fileBaselines.set(key, baseline);
    }
  }
  getCheckpointIdForRequest(requestId, undoStopId) {
    const checkpoints = this._checkpoints.get();
    return checkpoints.find((c) => c.requestId === requestId && c.undoStopId === undoStopId)?.checkpointId;
  }
  async _reconstructAllFileContents(targetEpoch, filesToReconstruct) {
    await Promise.all(Array.from(filesToReconstruct).map(async (uri) => {
      const reconstructedState = await this._reconstructFileState(uri, targetEpoch);
      if (reconstructedState.exists) {
        await this._delegate.setContents(reconstructedState.uri, reconstructedState.content, reconstructedState.telemetryInfo);
      }
    }));
  }
  _getBaselineKey(uri, requestId) {
    return `${uri.toString()}::${requestId}`;
  }
  async _findBestBaselineForFile(uri, epoch, requestId) {
    let currentRequestId = requestId;
    const operations = this._operations.get();
    for (let i = operations.length - 1; i >= 0; i--) {
      const operation = operations[i];
      if (operation.epoch > epoch) {
        continue;
      }
      if (operation.type === FileOperationType.Create && isEqual(operation.uri, uri)) {
        return {
          uri: operation.uri,
          requestId: operation.requestId,
          content: operation.initialContent,
          epoch: operation.epoch,
          telemetryInfo: operation.telemetryInfo
        };
      }
      if (operation.type === FileOperationType.Rename && isEqual(operation.newUri, uri)) {
        const prev = await this._findBestBaselineForFile(operation.oldUri, operation.epoch, operation.requestId);
        if (!prev) {
          return void 0;
        }
        const operations2 = this._getFileOperationsInRange(operation.oldUri, prev.epoch, operation.epoch);
        const replayed = await this._replayOperations(prev, operations2);
        return {
          uri,
          epoch: operation.epoch,
          content: replayed.exists ? replayed.content : "",
          requestId: operation.requestId,
          telemetryInfo: prev.telemetryInfo,
          notebookViewType: replayed.exists ? replayed.notebookViewType : void 0
        };
      }
      if (currentRequestId && operation.requestId !== currentRequestId) {
        const baseline = this._getFileBaseline(uri, currentRequestId);
        if (baseline) {
          return baseline;
        }
      }
      currentRequestId = operation.requestId;
    }
    return this._getFileBaseline(uri, currentRequestId);
  }
  _getFileOperationsInRange(uri, fromEpoch, toEpoch) {
    return this._operations.get().filter((op) => {
      const cellUri = CellUri.parse(op.uri);
      return op.epoch >= fromEpoch && op.epoch < toEpoch && (isEqual(op.uri, uri) || cellUri && isEqual(cellUri.notebook, uri));
    }).sort((a, b) => a.epoch - b.epoch);
  }
  async _replayOperations(baseline, operations) {
    let currentState = {
      exists: true,
      content: baseline.content,
      uri: baseline.uri,
      telemetryInfo: baseline.telemetryInfo
    };
    if (baseline.notebookViewType) {
      currentState.notebook = await this._notebookEditorModelResolverService.createUntitledNotebookTextModel(baseline.notebookViewType);
      if (baseline.content) {
        restoreNotebookSnapshot(currentState.notebook, baseline.content);
      }
    }
    for (const operation of operations) {
      currentState = await this._applyOperationToState(currentState, operation, baseline.telemetryInfo);
    }
    if (currentState.exists && currentState.notebook) {
      const info = await this._notebookService.withNotebookDataProvider(currentState.notebook.viewType);
      currentState.content = createNotebookSnapshot(currentState.notebook, info.serializer.options, this._configurationService);
      currentState.notebook.dispose();
    }
    return currentState;
  }
  async _applyOperationToState(state, operation, telemetryInfo) {
    switch (operation.type) {
      case FileOperationType.Create: {
        if (state.exists && state.notebook) {
          state.notebook.dispose();
        }
        let notebook;
        if (operation.notebookViewType) {
          notebook = await this._notebookEditorModelResolverService.createUntitledNotebookTextModel(operation.notebookViewType);
          if (operation.initialContent) {
            restoreNotebookSnapshot(notebook, operation.initialContent);
          }
        }
        return {
          exists: true,
          content: operation.initialContent,
          uri: operation.uri,
          telemetryInfo,
          notebookViewType: operation.notebookViewType,
          notebook
        };
      }
      case FileOperationType.Delete:
        if (state.exists && state.notebook) {
          state.notebook.dispose();
        }
        return {
          exists: false,
          uri: operation.uri
        };
      case FileOperationType.Rename:
        return {
          ...state,
          uri: operation.newUri
        };
      case FileOperationType.TextEdit: {
        if (!state.exists) {
          throw new Error("Cannot apply text edits to non-existent file");
        }
        const nbCell = operation.cellIndex !== void 0 && state.notebook?.cells.at(operation.cellIndex);
        if (nbCell) {
          const newContent = this._applyTextEditsToContent(nbCell.getValue(), operation.edits);
          state.notebook.applyEdits([{
            editType: CellEditType.Replace,
            index: operation.cellIndex,
            count: 1,
            cells: [{ cellKind: nbCell.cellKind, language: nbCell.language, mime: nbCell.language, source: newContent, outputs: nbCell.outputs }]
          }], true, void 0, () => void 0, void 0);
          return state;
        }
        return {
          ...state,
          content: this._applyTextEditsToContent(state.content, operation.edits)
        };
      }
      case FileOperationType.NotebookEdit:
        if (!state.exists) {
          throw new Error("Cannot apply notebook edits to non-existent file");
        }
        if (!state.notebook) {
          throw new Error("Cannot apply notebook edits to non-notebook file");
        }
        state.notebook.applyEdits(operation.cellEdits.slice(), true, void 0, () => void 0, void 0);
        return state;
      default:
        assertNever(operation);
    }
  }
  async _applyFileSystemOperations(fromEpoch, toEpoch) {
    const isMovingForward = toEpoch > fromEpoch;
    const operations = this._operations.get().filter((op) => {
      if (isMovingForward) {
        return op.epoch >= fromEpoch && op.epoch < toEpoch;
      } else {
        return op.epoch < fromEpoch && op.epoch >= toEpoch;
      }
    }).sort((a, b) => isMovingForward ? a.epoch - b.epoch : b.epoch - a.epoch);
    const urisToRestore = new ResourceSet();
    for (const operation of operations) {
      await this._applyFileSystemOperation(operation, isMovingForward, urisToRestore);
    }
    return urisToRestore;
  }
  async _applyFileSystemOperation(operation, isMovingForward, urisToRestore) {
    switch (operation.type) {
      case FileOperationType.Create:
        if (isMovingForward) {
          await this._delegate.createFile(operation.uri, operation.initialContent);
          urisToRestore.add(operation.uri);
        } else {
          await this._delegate.deleteFile(operation.uri);
          urisToRestore.delete(operation.uri);
        }
        break;
      case FileOperationType.Delete:
        if (isMovingForward) {
          await this._delegate.deleteFile(operation.uri);
          urisToRestore.delete(operation.uri);
        } else {
          await this._delegate.createFile(operation.uri, operation.finalContent);
          urisToRestore.add(operation.uri);
        }
        break;
      case FileOperationType.Rename:
        if (isMovingForward) {
          await this._delegate.renameFile(operation.oldUri, operation.newUri);
          urisToRestore.delete(operation.oldUri);
          urisToRestore.add(operation.newUri);
        } else {
          await this._delegate.renameFile(operation.newUri, operation.oldUri);
          urisToRestore.delete(operation.newUri);
          urisToRestore.add(operation.oldUri);
        }
        break;
      // Text and notebook edits don't affect file system structure
      case FileOperationType.TextEdit:
      case FileOperationType.NotebookEdit:
        urisToRestore.add(CellUri.parse(operation.uri)?.notebook ?? operation.uri);
        break;
      default:
        assertNever(operation);
    }
  }
  _applyTextEditsToContent(content, edits) {
    const { textBuffer, disposable } = createTextBuffer(content, DefaultEndOfLine.LF);
    try {
      textBuffer.applyEdits(edits.map(
        (edit) => new ValidAnnotatedEditOperation(null, Range.lift(edit.range), edit.text, false, false, false)
      ), false, false);
      const fullRange = textBuffer.getRangeAt(0, textBuffer.getLength());
      return textBuffer.getValueInRange(fullRange, EndOfLinePreference.TextDefined);
    } finally {
      disposable.dispose();
    }
  }
  getEntryDiffBetweenStops(uri, requestId, stopId) {
    const epochs = derivedOpts({ equalsFn: (a, b) => a.start === b.start && a.end === b.end }, (reader) => {
      const checkpoints = this._checkpoints.read(reader);
      const startIndex = checkpoints.findIndex((c) => c.requestId === requestId && c.undoStopId === stopId);
      return { start: checkpoints[startIndex], end: checkpoints[startIndex + 1] };
    });
    return this._getEntryDiffBetweenEpochs(uri, `s\0${requestId}\0${stopId}`, epochs);
  }
  /** Gets the epoch bounds of the request. If stopRequestId is undefined, gets ONLY the single request's bounds */
  _getRequestEpochBounds(startRequestId, stopRequestId) {
    return derivedOpts({ equalsFn: (a, b) => a.start === b.start && a.end === b.end }, (reader) => {
      const checkpoints = this._checkpoints.read(reader);
      const startIndex = checkpoints.findIndex((c) => c.requestId === startRequestId);
      const start = startIndex === -1 ? checkpoints[0] : checkpoints[startIndex];
      let end;
      if (stopRequestId === void 0) {
        end = findFirst(checkpoints, (c) => c.requestId !== startRequestId, startIndex + 1);
      } else {
        end = checkpoints.find((c) => c.requestId === stopRequestId) || findFirst(checkpoints, (c) => c.requestId !== startRequestId, startIndex + 1) || checkpoints[checkpoints.length - 1];
      }
      return { start, end };
    });
  }
  getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId) {
    return this._getEntryDiffBetweenEpochs(uri, `r\0${startRequestId}\0${stopRequestId}`, this._getRequestEpochBounds(startRequestId, stopRequestId));
  }
  _getEntryDiffBetweenEpochs(uri, cacheKey, epochs) {
    const key = `${uri.toString()}\0${cacheKey}`;
    const cached = this._finalizedDiffCache.get(key);
    if (cached) {
      return constObservable(cached);
    }
    let obs = this._refCountedDiffs.get(key);
    if (!obs) {
      obs = this._getEntryDiffBetweenEpochsInner(
        uri,
        key,
        epochs,
        () => this._refCountedDiffs.delete(key)
      );
      this._refCountedDiffs.set(key, obs);
    }
    return obs;
  }
  _getEntryDiffBetweenEpochsInner(uri, cacheKey, epochs, onLastObserverRemoved) {
    const modelRefsPromise = derived(this, (reader) => {
      const { start, end } = epochs.read(reader);
      if (!start) {
        return void 0;
      }
      const store = reader.store.add(new DisposableStore());
      const originalURI = this.getContentURIAtStop(start.requestId || START_REQUEST_EPOCH, uri, STOP_ID_EPOCH_PREFIX + start.epoch);
      const modifiedURI = this.getContentURIAtStop(end?.requestId || start.requestId || START_REQUEST_EPOCH, uri, STOP_ID_EPOCH_PREFIX + (end?.epoch || Number.MAX_SAFE_INTEGER));
      const promise = Promise.all([
        this._textModelService.createModelReference(originalURI),
        this._textModelService.createModelReference(modifiedURI)
      ]).then((refs) => {
        if (store.isDisposed) {
          refs.forEach((r) => r.dispose());
        } else {
          refs.forEach((r) => store.add(r));
        }
        return {
          refs: refs.map((r) => ({
            model: r.object.textEditorModel,
            onChange: observableSignalFromEvent(this, r.object.textEditorModel.onDidChangeContent.bind(r.object.textEditorModel))
          })),
          isFinal: !!end
        };
      }).catch((error) => {
        return { refs: [], isFinal: true, error };
      });
      return {
        originalURI,
        modifiedURI,
        promise: new ObservablePromise(promise)
      };
    });
    const diff = derived((reader) => {
      const modelsData = modelRefsPromise.read(reader);
      if (!modelsData) {
        return;
      }
      const { originalURI, modifiedURI, promise } = modelsData;
      const promiseData = promise?.promiseResult.read(reader);
      if (!promiseData?.data) {
        return { originalURI, modifiedURI, promise: void 0 };
      }
      const { refs, isFinal, error } = promiseData.data;
      if (error) {
        return { originalURI, modifiedURI, promise: new ObservablePromise(Promise.resolve(emptySessionEntryDiff(originalURI, modifiedURI))) };
      }
      refs.forEach((m) => m.onChange.read(reader));
      return { originalURI, modifiedURI, promise: new ObservablePromise(this._computeDiff(originalURI, modifiedURI, !!isFinal)) };
    });
    return derivedOpts({ onLastObserverRemoved }, (reader) => {
      const result = diff.read(reader);
      if (!result) {
        return void 0;
      }
      const promised = result.promise?.promiseResult.read(reader);
      if (promised?.data) {
        if (promised.data.isFinal) {
          this._finalizedDiffCache.set(cacheKey, promised.data);
        }
        return promised.data;
      }
      if (promised?.error) {
        return emptySessionEntryDiff(result.originalURI, result.modifiedURI);
      }
      return { ...emptySessionEntryDiff(result.originalURI, result.modifiedURI), isBusy: true };
    });
  }
  _computeDiff(originalUri, modifiedUri, isFinal) {
    return this._editorWorkerService.computeDiff(
      originalUri,
      modifiedUri,
      { ignoreTrimWhitespace: false, computeMoves: false, maxComputationTimeMs: 3e3 },
      "advanced"
    ).then((diff) => {
      const entryDiff = {
        originalURI: originalUri,
        modifiedURI: modifiedUri,
        identical: !!diff?.identical,
        isFinal,
        quitEarly: !diff || diff.quitEarly,
        added: 0,
        removed: 0,
        isBusy: false
      };
      if (diff) {
        for (const change of diff.changes) {
          entryDiff.removed += change.original.endLineNumberExclusive - change.original.startLineNumber;
          entryDiff.added += change.modified.endLineNumberExclusive - change.modified.startLineNumber;
        }
      }
      return entryDiff;
    });
  }
  hasEditsInRequest(requestId, reader) {
    for (const value of this._fileBaselines.values()) {
      if (value.requestId === requestId) {
        return true;
      }
    }
    for (const operation of this._operations.read(reader)) {
      if (operation.requestId === requestId) {
        return true;
      }
    }
    return false;
  }
  getDiffsForFilesInRequest(requestId) {
    const boundsObservable = this._getRequestEpochBounds(requestId);
    const startEpochs = derivedOpts({ equalsFn: mapsStrictEqualIgnoreOrder }, (reader) => {
      const uris = new ResourceMap();
      for (const value of this._fileBaselines.values()) {
        if (value.requestId === requestId) {
          uris.set(value.uri, value.epoch);
        }
      }
      const bounds = boundsObservable.read(reader);
      for (const operation of this._operations.read(reader)) {
        if (operation.epoch < bounds.start.epoch) {
          continue;
        }
        if (bounds.end && operation.epoch >= bounds.end.epoch) {
          break;
        }
        if (operation.type === FileOperationType.Create) {
          uris.set(operation.uri, 0);
        }
      }
      return uris;
    });
    return this._getDiffsForFilesAtEpochs(startEpochs, boundsObservable.map((b) => b.end));
  }
  _getDiffsForFilesAtEpochs(startEpochs, endCheckpointObs) {
    const prevDiffs = new ResourceMap();
    let prevEndCheckpoint = void 0;
    const perFileDiffs = derived(this, (reader) => {
      const checkpoints = this._checkpoints.read(reader);
      const firstCheckpoint = checkpoints[0];
      if (!firstCheckpoint) {
        return [];
      }
      const endCheckpoint = endCheckpointObs.read(reader);
      if (endCheckpoint !== prevEndCheckpoint) {
        prevDiffs.clear();
        prevEndCheckpoint = endCheckpoint;
      }
      const uris = startEpochs.read(reader);
      const diffs = [];
      for (const [uri, epoch] of uris) {
        const obs = prevDiffs.get(uri) ?? this._getEntryDiffBetweenEpochs(
          uri,
          `e\0${epoch}\0${endCheckpoint?.epoch}`,
          constObservable({ start: checkpoints.findLast((cp) => cp.epoch <= epoch) || firstCheckpoint, end: endCheckpoint })
        );
        prevDiffs.set(uri, obs);
        diffs.push(obs);
      }
      return diffs;
    });
    return perFileDiffs.map((diffs, reader) => {
      return diffs.flatMap((d) => d.read(reader)).filter(isDefined);
    });
  }
  getDiffsForFilesInSession() {
    const startEpochs = derivedOpts({ equalsFn: mapsStrictEqualIgnoreOrder }, (reader) => {
      const uris = new ResourceMap();
      for (const baseline of this._fileBaselines.values()) {
        uris.set(baseline.uri, Math.min(baseline.epoch, uris.get(baseline.uri) ?? Number.MAX_SAFE_INTEGER));
      }
      for (const operation of this._operations.read(reader)) {
        if (operation.type === FileOperationType.Create) {
          uris.set(operation.uri, 0);
        }
      }
      return uris;
    });
    return this._getDiffsForFilesAtEpochs(startEpochs, constObservable(void 0));
  }
  getDiffForSession() {
    const fileDiffs = this.getDiffsForFilesInSession();
    return derived((reader) => {
      const diffs = fileDiffs.read(reader);
      let added = 0;
      let removed = 0;
      for (const diff of diffs) {
        added += diff.added;
        removed += diff.removed;
      }
      return { added, removed };
    });
  }
};
ChatEditingCheckpointTimelineImpl = __decorateClass([
  __decorateParam(2, INotebookEditorModelResolverService),
  __decorateParam(3, INotebookService),
  __decorateParam(4, ITextModelService),
  __decorateParam(5, IEditorWorkerService),
  __decorateParam(6, IConfigurationService)
], ChatEditingCheckpointTimelineImpl);
export {
  ChatEditingCheckpointTimelineImpl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ0NoZWNrcG9pbnRUaW1lbGluZUltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlcXVhbHMgYXMgYXJyYXlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgZmluZEZpcnN0LCBmaW5kTGFzdCwgZmluZExhc3RJZHggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbWFwc1N0cmljdEVxdWFsSWdub3JlT3JkZXIsIFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgYXMgb2JqZWN0c0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSwgSVJlYWRlciwgSVRyYW5zYWN0aW9uLCBPYnNlcnZhYmxlUHJvbWlzZSwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlLCBvYnNlcnZhYmxlVmFsdWVPcHRzLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQsIE11dGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IERlZmF1bHRFbmRPZkxpbmUsIEVuZE9mTGluZVByZWZlcmVuY2UsIElUZXh0TW9kZWwsIFZhbGlkQW5ub3RhdGVkRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dEJ1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgQ2VsbFVyaSwgSU5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZW1wdHlTZXNzaW9uRW50cnlEaWZmLCBJRWRpdFNlc3Npb25EaWZmU3RhdHMsIElFZGl0U2Vzc2lvbkVudHJ5RGlmZiwgSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdERpc2FibGVtZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdDaGVja3BvaW50VGltZWxpbmUgfSBmcm9tICcuL2NoYXRFZGl0aW5nQ2hlY2twb2ludFRpbWVsaW5lLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb24sIEZpbGVPcGVyYXRpb25UeXBlLCBJQ2hhdEVkaXRpbmdUaW1lbGluZVN0YXRlLCBJQ2hlY2twb2ludCwgSUZpbGVCYXNlbGluZSwgSVJlY29uc3RydWN0ZWRGaWxlRXhpc3RzU3RhdGUsIElSZWNvbnN0cnVjdGVkRmlsZU5vdEV4aXN0c1N0YXRlLCBJUmVjb25zdHJ1Y3RlZEZpbGVTdGF0ZSB9IGZyb20gJy4vY2hhdEVkaXRpbmdPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nU25hcHNob3RUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIgfSBmcm9tICcuL2NoYXRFZGl0aW5nVGV4dE1vZGVsQ29udGVudFByb3ZpZGVycy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTbmFwc2hvdCBhcyBjcmVhdGVOb3RlYm9va1NuYXBzaG90LCByZXN0b3JlU25hcHNob3QgYXMgcmVzdG9yZU5vdGVib29rU25hcHNob3QgfSBmcm9tICcuL25vdGVib29rL2NoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va1NuYXBzaG90LmpzJztcblxuY29uc3QgU1RBUlRfUkVRVUVTVF9FUE9DSCA9ICckJHN0YXJ0JztcbmNvbnN0IFNUT1BfSURfRVBPQ0hfUFJFRklYID0gJ19fZXBvY2hfJztcblxudHlwZSBJUmVjb25zdHJ1Y3RlZEZpbGVTdGF0ZVdpdGhOb3RlYm9vayA9IElSZWNvbnN0cnVjdGVkRmlsZU5vdEV4aXN0c1N0YXRlIHwgKE11dGFibGU8SVJlY29uc3RydWN0ZWRGaWxlRXhpc3RzU3RhdGU+ICYgeyBub3RlYm9vaz86IElOb3RlYm9va1RleHRNb2RlbCB9KTtcblxuLyoqXG4gKiBBIGZpbGVzeXN0ZW0gZGVsZWdhdGUgdXNlZCBieSB0aGUgY2hlY2twb2ludGluZyB0aW1lbGluZSBzdWNoIHRoYXRcbiAqIG5hdmlnYXRpbmcgaW4gdGhlIHRpbWVsaW5lIHRyYWNrcyB0aGUgY2hhbmdlcyBhcyBhZ2VudC1pbml0aWF0ZWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRFZGl0aW5nVGltZWxpbmVGc0RlbGVnYXRlIHtcblx0LyoqIENyZWF0ZXMgYSBmaWxlIHdpdGggaW5pdGlhbCBjb250ZW50LiAqL1xuXHRjcmVhdGVGaWxlOiAodXJpOiBVUkksIGluaXRpYWxDb250ZW50OiBzdHJpbmcpID0+IFByb21pc2U8dW5rbm93bj47XG5cdC8qKiBEZWxldGUgYSBVUkkgKi9cblx0ZGVsZXRlRmlsZTogKHVyaTogVVJJKSA9PiBQcm9taXNlPHZvaWQ+O1xuXHQvKiogUmVuYW1lIGEgVVJJLCByZXRhaW5pbmcgY29udGVudHMgKi9cblx0cmVuYW1lRmlsZTogKGZyb21Vcmk6IFVSSSwgdG9Vcmk6IFVSSSkgPT4gUHJvbWlzZTx2b2lkPjtcblx0LyoqIFNldCBhIFVSSSBjb250ZW50cywgc2hvdWxkIGNyZWF0ZSBpdCBpZiBpdCBkb2VzIG5vdCBhbHJlYWR5IGV4aXN0ICovXG5cdHNldENvbnRlbnRzKHVyaTogVVJJLCBjb250ZW50OiBzdHJpbmcsIHRlbGVtZXRyeUluZm86IElNb2RpZmllZEVudHJ5VGVsZW1ldHJ5SW5mbyk6IFByb21pc2U8dm9pZD47XG59XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgdGhlIGNoZWNrcG9pbnQtYmFzZWQgdGltZWxpbmUgc3lzdGVtLlxuICpcbiAqIEludmFyaWFudHM6XG4gKiAtIFRoZXJlIGlzIGF0IG1vc3Qgb25lIGNoZWNrcG9pbnQgb3Igb3BlcmF0aW9uIHBlciBlcG9jaFxuICogLSBfY2hlY2twb2ludHMgYW5kIF9vcGVyYXRpb25zIGFyZSBhbHdheXMgc29ydGVkIGluIGFzY2VuZGluZyBvcmRlciBieSBlcG9jaFxuICogLSBfY3VycmVudEVwb2NoIGJlaW5nIGVxdWFsIHRvIHRoZSBlcG9jaCBvZiBhbiBvcGVyYXRpb24gbWVhbnMgdGhhdFxuICogICBvcGVyYXRpb24gaXMgX25vdF8gY3VycmVudGx5IGFwcGxpZWRcbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nQ2hlY2twb2ludFRpbWVsaW5lSW1wbCBpbXBsZW1lbnRzIElDaGF0RWRpdGluZ0NoZWNrcG9pbnRUaW1lbGluZSB7XG5cblx0cHJpdmF0ZSBfZXBvY2hDb3VudGVyID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hlY2twb2ludHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUNoZWNrcG9pbnRbXT4odGhpcywgW10pO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50RXBvY2ggPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPih0aGlzLCAwKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb3BlcmF0aW9ucyA9IG9ic2VydmFibGVWYWx1ZU9wdHM8RmlsZU9wZXJhdGlvbltdPih7IGVxdWFsc0ZuOiAoKSA9PiBmYWxzZSB9LCBbXSk7IC8vIG11dGFibGVcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsZUJhc2VsaW5lcyA9IG5ldyBNYXA8c3RyaW5nLCBJRmlsZUJhc2VsaW5lPigpOyAvLyBrZXk6IGAke3VyaX06OiR7cmVxdWVzdElkfWBcblx0cHJpdmF0ZSByZWFkb25seSBfcmVmQ291bnRlZERpZmZzID0gbmV3IE1hcDxzdHJpbmcsIElPYnNlcnZhYmxlPElFZGl0U2Vzc2lvbkVudHJ5RGlmZiB8IHVuZGVmaW5lZD4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbmFsaXplZERpZmZDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBJRWRpdFNlc3Npb25FbnRyeURpZmY+KCk7XG5cblx0LyoqIEdldHMgdGhlIGNoZWNrcG9pbnQsIGlmIGFueSwgd2UgY2FuICd1bmRvJyB0by4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfd2lsbFVuZG9Ub0NoZWNrcG9pbnQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgY3VycmVudEVwb2NoID0gdGhpcy5fY3VycmVudEVwb2NoLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBjaGVja3BvaW50cyA9IHRoaXMuX2NoZWNrcG9pbnRzLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoY2hlY2twb2ludHMubGVuZ3RoIDwgMiB8fCBjdXJyZW50RXBvY2ggPD0gY2hlY2twb2ludHNbMV0uZXBvY2gpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3BlcmF0aW9ucyA9IHRoaXMuX29wZXJhdGlvbnMucmVhZChyZWFkZXIpO1xuXG5cdFx0Ly8gVW5kbyBlaXRoZXIgdG8gcmlnaHQgYmVmb3JlIHRoZSBjdXJyZW50IHJlcXVlc3QuLi5cblx0XHRjb25zdCBjdXJyZW50Q2hlY2twb2ludElkeCA9IGZpbmRMYXN0SWR4KGNoZWNrcG9pbnRzLCBjcCA9PiBjcC5lcG9jaCA8IGN1cnJlbnRFcG9jaCk7XG5cdFx0Y29uc3Qgc3RhcnRPZlJlcXVlc3QgPSBjdXJyZW50Q2hlY2twb2ludElkeCA9PT0gLTEgPyB1bmRlZmluZWQgOiBmaW5kTGFzdChjaGVja3BvaW50cywgY3AgPT4gY3AudW5kb1N0b3BJZCA9PT0gdW5kZWZpbmVkLCBjdXJyZW50Q2hlY2twb2ludElkeCk7XG5cblx0XHQvLyBPciB0byB0aGUgY2hlY2twb2ludCBiZWZvcmUgdGhlIGxhc3Qgb3BlcmF0aW9uIGluIHRoaXMgcmVxdWVzdFxuXHRcdGNvbnN0IHByZXZpb3VzT3BlcmF0aW9uID0gZmluZExhc3Qob3BlcmF0aW9ucywgb3AgPT4gb3AuZXBvY2ggPCBjdXJyZW50RXBvY2gpO1xuXHRcdGNvbnN0IHByZXZpb3VzQ2hlY2twb2ludCA9IHByZXZpb3VzT3BlcmF0aW9uICYmIGZpbmRMYXN0KGNoZWNrcG9pbnRzLCBjcCA9PiBjcC5lcG9jaCA8IHByZXZpb3VzT3BlcmF0aW9uLmVwb2NoKTtcblxuXHRcdGlmICghc3RhcnRPZlJlcXVlc3QpIHtcblx0XHRcdHJldHVybiBwcmV2aW91c0NoZWNrcG9pbnQ7XG5cdFx0fVxuXHRcdGlmICghcHJldmlvdXNDaGVja3BvaW50KSB7XG5cdFx0XHRyZXR1cm4gc3RhcnRPZlJlcXVlc3Q7XG5cdFx0fVxuXG5cdFx0Ly8gU3BlY2lhbCBjYXNlOiBpZiB3ZSdyZSB1bmRvaW5nIHRoZSBmaXJzdCBlZGl0IG9wZXJhdGlvbiwgdW5kbyB0aGUgZW50aXJlIHJlcXVlc3Rcblx0XHRpZiAoIW9wZXJhdGlvbnMuc29tZShvcCA9PiBvcC5lcG9jaCA+IHN0YXJ0T2ZSZXF1ZXN0LmVwb2NoICYmIG9wLmVwb2NoIDwgcHJldmlvdXNDaGVja3BvaW50IS5lcG9jaCkpIHtcblx0XHRcdHJldHVybiBzdGFydE9mUmVxdWVzdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcHJldmlvdXNDaGVja3BvaW50LmVwb2NoID4gc3RhcnRPZlJlcXVlc3QuZXBvY2ggPyBwcmV2aW91c0NoZWNrcG9pbnQgOiBzdGFydE9mUmVxdWVzdDtcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IGNhblVuZG86IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5fd2lsbFVuZG9Ub0NoZWNrcG9pbnQubWFwKGNwID0+ICEhY3ApO1xuXG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIGVwb2NoIHdlJ2xsIHJlZG8gdGhpcy4gVW5saWtlIHVuZG8gdGhpcyBkb2Vzbid0IG9ubHkgdXNlIGNoZWNrcG9pbnRzXG5cdCAqIGJlY2F1c2Ugd2UgY291bGQgcG90ZW50aWFsbHkgcmVkbyB0byBhICd0aXAnIG9wZXJhdGlvbiB0aGF0J3Mgbm90IGNoZWNrcG9pbnRlZCB5ZXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF93aWxsUmVkb1RvRXBvY2ggPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgY3VycmVudEVwb2NoID0gdGhpcy5fY3VycmVudEVwb2NoLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBvcGVyYXRpb25zID0gdGhpcy5fb3BlcmF0aW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgY2hlY2twb2ludHMgPSB0aGlzLl9jaGVja3BvaW50cy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgbWF4RW5jb3VudGVyZWRFcG9jaCA9IE1hdGgubWF4KG9wZXJhdGlvbnMuYXQoLTEpPy5lcG9jaCB8fCAwLCBjaGVja3BvaW50cy5hdCgtMSk/LmVwb2NoIHx8IDApO1xuXHRcdGlmIChjdXJyZW50RXBvY2ggPiBtYXhFbmNvdW50ZXJlZEVwb2NoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEZpbmQgdGhlIG5leHQgZWRpdCBvcGVyYXRpb24gdGhhdCB3b3VsZCBiZSBhcHBsaWVkLi4uXG5cdFx0Y29uc3QgbmV4dE9wZXJhdGlvbiA9IG9wZXJhdGlvbnMuZmluZChvcCA9PiBvcC5lcG9jaCA+PSBjdXJyZW50RXBvY2gpO1xuXG5cdFx0Ly8gV2hlbiB0aGVyZSBhcmUgbm8gbW9yZSBvcGVyYXRpb25zLCBhZHZhbmNlIG9uZSByZXF1ZXN0IGF0IGEgdGltZVxuXHRcdC8vIGJ5IGZpbmRpbmcgdGhlIG5leHQgcmVxdWVzdC1zdGFydCBjaGVja3BvaW50IGJvdW5kYXJ5LlxuXHRcdGlmICghbmV4dE9wZXJhdGlvbikge1xuXHRcdFx0Y29uc3QgbmV4dFJlcXVlc3RTdGFydCA9IGNoZWNrcG9pbnRzLmZpbmQoY3AgPT4gY3AuZXBvY2ggPj0gY3VycmVudEVwb2NoICYmIGNwLnVuZG9TdG9wSWQgPT09IHVuZGVmaW5lZCk7XG5cdFx0XHRpZiAoIW5leHRSZXF1ZXN0U3RhcnQpIHtcblx0XHRcdFx0cmV0dXJuIG1heEVuY291bnRlcmVkRXBvY2ggKyAxO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVxdWVzdEFmdGVyID0gY2hlY2twb2ludHMuZmluZChjcCA9PiBjcC5lcG9jaCA+IG5leHRSZXF1ZXN0U3RhcnQuZXBvY2ggJiYgY3AudW5kb1N0b3BJZCA9PT0gdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiByZXF1ZXN0QWZ0ZXIgPyByZXF1ZXN0QWZ0ZXIuZXBvY2ggOiAobWF4RW5jb3VudGVyZWRFcG9jaCArIDEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5leHRDaGVja3BvaW50ID0gY2hlY2twb2ludHMuZmluZChvcCA9PiBvcC5lcG9jaCA+IG5leHRPcGVyYXRpb24uZXBvY2gpO1xuXG5cdFx0Ly8gQW5kIGZpZ3VyZSBvdXQgd2hlcmUgd2UncmUgZ29pbmcgaWYgd2UncmUgbmF2aWdhdGluZyBhY3Jvc3MgcmVxdWVzdFxuXHRcdC8vIDEuIElmIHRoZXJlIGlzIG5vIG5leHQgcmVxdWVzdCBvciBpZiB0aGUgbmV4dCB0YXJnZXQgY2hlY2twb2ludCBpcyBpblxuXHRcdC8vICAgIHRoZSBuZXh0IHJlcXVlc3QsIG5hdmlnYXRlIHRoZXJlLlxuXHRcdC8vIDIuIE90aGVyd2lzZSwgbmF2aWdhdGUgdG8gdGhlIGVuZCBvZiB0aGUgbmV4dCByZXF1ZXN0LlxuXHRcdGNvbnN0IGN1cnJlbnRDaGVja3BvaW50ID0gZmluZExhc3QoY2hlY2twb2ludHMsIGNwID0+IGNwLmVwb2NoIDwgY3VycmVudEVwb2NoKTtcblx0XHRpZiAoY3VycmVudENoZWNrcG9pbnQgJiYgbmV4dE9wZXJhdGlvbiAmJiBjdXJyZW50Q2hlY2twb2ludC5yZXF1ZXN0SWQgIT09IG5leHRPcGVyYXRpb24ucmVxdWVzdElkKSB7XG5cdFx0XHRjb25zdCBzdGFydE9mTmV4dFJlcXVlc3RJZHggPSBmaW5kTGFzdElkeChjaGVja3BvaW50cywgKGNwLCBpKSA9PlxuXHRcdFx0XHRjcC51bmRvU3RvcElkID09PSB1bmRlZmluZWQgJiYgKGNoZWNrcG9pbnRzW2kgLSAxXT8ucmVxdWVzdElkID09PSBjdXJyZW50Q2hlY2twb2ludC5yZXF1ZXN0SWQpKTtcblx0XHRcdGNvbnN0IHN0YXJ0T2ZOZXh0UmVxdWVzdCA9IHN0YXJ0T2ZOZXh0UmVxdWVzdElkeCA9PT0gLTEgPyB1bmRlZmluZWQgOiBjaGVja3BvaW50c1tzdGFydE9mTmV4dFJlcXVlc3RJZHhdO1xuXG5cdFx0XHRpZiAoc3RhcnRPZk5leHRSZXF1ZXN0ICYmIG5leHRPcGVyYXRpb24ucmVxdWVzdElkICE9PSBzdGFydE9mTmV4dFJlcXVlc3QucmVxdWVzdElkKSB7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RBZnRlclRoZU5leHQgPSBmaW5kRmlyc3QoY2hlY2twb2ludHMsIG9wID0+IG9wLnVuZG9TdG9wSWQgPT09IHVuZGVmaW5lZCwgc3RhcnRPZk5leHRSZXF1ZXN0SWR4ICsgMSk7XG5cdFx0XHRcdGlmIChyZXF1ZXN0QWZ0ZXJUaGVOZXh0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlcXVlc3RBZnRlclRoZU5leHQuZXBvY2g7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gTWF0aC5taW4oXG5cdFx0XHRuZXh0Q2hlY2twb2ludD8uZXBvY2ggfHwgSW5maW5pdHksXG5cdFx0XHQobWF4RW5jb3VudGVyZWRFcG9jaCArIDEpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBjYW5SZWRvOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IHRoaXMuX3dpbGxSZWRvVG9FcG9jaC5tYXAoZSA9PiAhIWUpO1xuXG5cdHB1YmxpYyByZWFkb25seSByZXF1ZXN0RGlzYWJsZW1lbnQ6IElPYnNlcnZhYmxlPElDaGF0UmVxdWVzdERpc2FibGVtZW50W10+ID0gZGVyaXZlZE9wdHMoXG5cdFx0eyBlcXVhbHNGbjogKGEsIGIpID0+IGFycmF5c0VxdWFsKGEsIGIsIG9iamVjdHNFcXVhbCkgfSxcblx0XHRyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudEVwb2NoID0gdGhpcy5fY3VycmVudEVwb2NoLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG9wZXJhdGlvbnMgPSB0aGlzLl9vcGVyYXRpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGNoZWNrcG9pbnRzID0gdGhpcy5fY2hlY2twb2ludHMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCBtYXhFbmNvdW50ZXJlZEVwb2NoID0gTWF0aC5tYXgob3BlcmF0aW9ucy5hdCgtMSk/LmVwb2NoIHx8IDAsIGNoZWNrcG9pbnRzLmF0KC0xKT8uZXBvY2ggfHwgMCk7XG5cdFx0XHRpZiAoY3VycmVudEVwb2NoID4gbWF4RW5jb3VudGVyZWRFcG9jaCkge1xuXHRcdFx0XHRyZXR1cm4gW107IC8vIGNvbW1vbiBjYXNlIC0tIG5vdGhpbmcgdW5kb25lXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxhc3RBcHBsaWVkT3BlcmF0aW9uID0gZmluZExhc3Qob3BlcmF0aW9ucywgb3AgPT4gb3AuZXBvY2ggPCBjdXJyZW50RXBvY2gpPy5lcG9jaCB8fCAwO1xuXHRcdFx0Y29uc3QgbGFzdEFwcGxpZWRSZXF1ZXN0ID0gZmluZExhc3QoY2hlY2twb2ludHMsIGNwID0+IGNwLmVwb2NoIDwgY3VycmVudEVwb2NoICYmIGNwLnVuZG9TdG9wSWQgPT09IHVuZGVmaW5lZCk/LmVwb2NoIHx8IDA7XG5cdFx0XHRjb25zdCBzdG9wRGlzYWJsaW5nQXRFcG9jaCA9IE1hdGgubWF4KGxhc3RBcHBsaWVkT3BlcmF0aW9uLCBsYXN0QXBwbGllZFJlcXVlc3QpO1xuXG5cdFx0XHRjb25zdCBkaXNhYmxlbWVudCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+KCk7XG5cblx0XHRcdC8vIEdvIHRocm91Z2ggdGhlIGNoZWNrcG9pbnRzIGFuZCBkaXNhYmxlIGFueSB1bnRpbCB0aGUgb25lIHRoYXQgY29udGFpbnMgdGhlIGxhc3QgYXBwbGllZCBvcGVyYXRpb24uXG5cdFx0XHQvLyBTdWJ0bGU6IHRoZSByZXF1ZXN0IHdpbGwgZmlyc3QgbWFrZSBhIGNoZWNrcG9pbnQgd2l0aCBhbiAndW5kZWZpbmVkJyB1bmRvXG5cdFx0XHQvLyBzdG9wLCBhbmQgaW4gdGhpcyBsb29wIHdlJ2xsIFwiYXV0b21hdGljYWxseVwiIGRpc2FibGUgdGhlIGVudGlyZSByZXF1ZXN0IHdoZW5cblx0XHRcdC8vIHdlIHJlYWNoIHRoYXQgY2hlY2twb2ludC5cblx0XHRcdGZvciAobGV0IGkgPSBjaGVja3BvaW50cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRjb25zdCB7IHVuZG9TdG9wSWQsIHJlcXVlc3RJZCwgZXBvY2ggfSA9IGNoZWNrcG9pbnRzW2ldO1xuXHRcdFx0XHRpZiAoZXBvY2ggPD0gc3RvcERpc2FibGluZ0F0RXBvY2gpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyZXF1ZXN0SWQpIHtcblx0XHRcdFx0XHRkaXNhYmxlbWVudC5zZXQocmVxdWVzdElkLCB1bmRvU3RvcElkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gWy4uLmRpc2FibGVtZW50XS5tYXAoKFtyZXF1ZXN0SWQsIGFmdGVyVW5kb1N0b3BdKTogSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnQgPT4gKHsgcmVxdWVzdElkLCBhZnRlclVuZG9TdG9wIH0pKTtcblx0XHR9KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWxlZ2F0ZTogSUNoYXRFZGl0aW5nVGltZWxpbmVGc0RlbGVnYXRlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yV29ya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JXb3JrZXJTZXJ2aWNlOiBJRWRpdG9yV29ya2VyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5jcmVhdGVDaGVja3BvaW50KHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnSW5pdGlhbCBTdGF0ZScsICdTdGFydGluZyBwb2ludCBiZWZvcmUgYW55IGVkaXRzJyk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlQ2hlY2twb2ludChyZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdW5kb1N0b3BJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBsYWJlbDogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZXhpc3RpbmdDaGVja3BvaW50cyA9IHRoaXMuX2NoZWNrcG9pbnRzLmdldCgpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gZXhpc3RpbmdDaGVja3BvaW50cy5maW5kKGMgPT4gYy51bmRvU3RvcElkID09PSB1bmRvU3RvcElkICYmIGMucmVxdWVzdElkID09PSByZXF1ZXN0SWQpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nLmNoZWNrcG9pbnRJZDtcblx0XHR9XG5cblx0XHRjb25zdCB7IGNoZWNrcG9pbnRzLCBvcGVyYXRpb25zIH0gPSB0aGlzLl9nZXRWaXNpYmxlT3BlcmF0aW9uc0FuZENoZWNrcG9pbnRzKCk7XG5cdFx0Y29uc3QgY2hlY2twb2ludElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgZXBvY2ggPSB0aGlzLmluY3JlbWVudEVwb2NoKCk7XG5cblx0XHRjaGVja3BvaW50cy5wdXNoKHtcblx0XHRcdGNoZWNrcG9pbnRJZCxcblx0XHRcdHJlcXVlc3RJZCxcblx0XHRcdHVuZG9TdG9wSWQsXG5cdFx0XHRlcG9jaCxcblx0XHRcdGxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb25cblx0XHR9KTtcblxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX2NoZWNrcG9pbnRzLnNldChjaGVja3BvaW50cywgdHgpO1xuXHRcdFx0dGhpcy5fb3BlcmF0aW9ucy5zZXQob3BlcmF0aW9ucywgdHgpO1xuXHRcdFx0dGhpcy5fY3VycmVudEVwb2NoLnNldChlcG9jaCArIDEsIHR4KTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBjaGVja3BvaW50SWQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdW5kb1RvTGFzdENoZWNrcG9pbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hlY2twb2ludCA9IHRoaXMuX3dpbGxVbmRvVG9DaGVja3BvaW50LmdldCgpO1xuXHRcdGlmIChjaGVja3BvaW50KSB7XG5cdFx0XHRhd2FpdCB0aGlzLm5hdmlnYXRlVG9DaGVja3BvaW50KGNoZWNrcG9pbnQuY2hlY2twb2ludElkKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVkb1RvTmV4dENoZWNrcG9pbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGFyZ2V0RXBvY2ggPSB0aGlzLl93aWxsUmVkb1RvRXBvY2guZ2V0KCk7XG5cdFx0aWYgKHRhcmdldEVwb2NoKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9uYXZpZ2F0ZVRvRXBvY2godGFyZ2V0RXBvY2gpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBuYXZpZ2F0ZVRvQ2hlY2twb2ludChjaGVja3BvaW50SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRhcmdldENoZWNrcG9pbnQgPSB0aGlzLl9nZXRDaGVja3BvaW50KGNoZWNrcG9pbnRJZCk7XG5cdFx0aWYgKCF0YXJnZXRDaGVja3BvaW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENoZWNrcG9pbnQgJHtjaGVja3BvaW50SWR9IG5vdCBmb3VuZGApO1xuXHRcdH1cblxuXHRcdGlmICh0YXJnZXRDaGVja3BvaW50LnVuZG9TdG9wSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gSWYgd2UncmUgbmF2aWdhdGluZyB0byB0aGUgc3RhcnQgb2YgYSByZXF1ZXN0LCB3ZSB3YW50IHRvIHJlc3RvcmUgdGhlIGZpbGVcblx0XHRcdC8vIHRvIHdoYXRldmVyIGJhc2VsaW5lIHdlIGNhcHR1cmVkLCBfbm90XyB0aGUgcmVzdWx0IHN0YXRlIGZyb20gdGhlIHByaW9yIHJlcXVlc3Rcblx0XHRcdC8vIGJlY2F1c2UgdGhlcmUgbWF5IGhhdmUgYmVlbiB1c2VyIGNoYW5nZXMgaW4gdGhlIG1lYW50aW1lLiBCdXQgd2Ugc3RpbGwgd2FudFxuXHRcdFx0Ly8gdG8gc2V0IHRoZSBlcG9jaCBtYXJraW5nIHRoYXQgY2hlY2twb2ludCBhcyBoYXZpbmcgYmVlbiB1bmRvbmUgKHRoZSBzZWNvbmRcblx0XHRcdC8vIGFyZyBiZWxvdykgc28gdGhhdCBkaXNhYmxlbWVudCB3b3JrcyBhbmQgc28gaXQncyBkaXNjYXJkZWQgaWYgYXBwcm9wcmlhdGUgbGF0ZXIuXG5cdFx0XHRyZXR1cm4gdGhpcy5fbmF2aWdhdGVUb0Vwb2NoKHRhcmdldENoZWNrcG9pbnQuZXBvY2ggKyAxLCB0YXJnZXRDaGVja3BvaW50LmVwb2NoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX25hdmlnYXRlVG9FcG9jaCh0YXJnZXRDaGVja3BvaW50LmVwb2NoICsgMSk7XG5cdFx0fVxuXG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29udGVudFVSSUF0U3RvcChyZXF1ZXN0SWQ6IHN0cmluZywgZmlsZVVSSTogVVJJLCBzdG9wSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFVSSSB7XG5cdFx0cmV0dXJuIENoYXRFZGl0aW5nU25hcHNob3RUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIuZ2V0U25hcHNob3RGaWxlVVJJKHRoaXMuY2hhdFNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdElkLCBzdG9wSWQsIGZpbGVVUkkucGF0aCwgZmlsZVVSSS5zY2hlbWUsIGZpbGVVUkkuYXV0aG9yaXR5KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX25hdmlnYXRlVG9FcG9jaChyZXN0b3JlVG9FcG9jaDogbnVtYmVyLCBuYXZpZ2F0ZVRvRXBvY2ggPSByZXN0b3JlVG9FcG9jaCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN1cnJlbnRFcG9jaCA9IHRoaXMuX2N1cnJlbnRFcG9jaC5nZXQoKTtcblx0XHRpZiAoY3VycmVudEVwb2NoICE9PSByZXN0b3JlVG9FcG9jaCkge1xuXHRcdFx0Y29uc3QgdXJpc1RvUmVzdG9yZSA9IGF3YWl0IHRoaXMuX2FwcGx5RmlsZVN5c3RlbU9wZXJhdGlvbnMoY3VycmVudEVwb2NoLCByZXN0b3JlVG9FcG9jaCk7XG5cblx0XHRcdC8vIFJlY29uc3RydWN0IGNvbnRlbnQgZm9yIGZpbGVzIGFmZmVjdGVkIGJ5IG9wZXJhdGlvbnMgaW4gdGhlIHJhbmdlXG5cdFx0XHRhd2FpdCB0aGlzLl9yZWNvbnN0cnVjdEFsbEZpbGVDb250ZW50cyhyZXN0b3JlVG9FcG9jaCwgdXJpc1RvUmVzdG9yZSk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGN1cnJlbnQgZXBvY2hcblx0XHR0aGlzLl9jdXJyZW50RXBvY2guc2V0KG5hdmlnYXRlVG9FcG9jaCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENoZWNrcG9pbnQoY2hlY2twb2ludElkOiBzdHJpbmcpOiBJQ2hlY2twb2ludCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoZWNrcG9pbnRzLmdldCgpLmZpbmQoYyA9PiBjLmNoZWNrcG9pbnRJZCA9PT0gY2hlY2twb2ludElkKTtcblx0fVxuXG5cdHB1YmxpYyBpbmNyZW1lbnRFcG9jaCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZXBvY2hDb3VudGVyKys7XG5cdH1cblxuXHRwdWJsaWMgcmVjb3JkRmlsZU9wZXJhdGlvbihvcGVyYXRpb246IEZpbGVPcGVyYXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCB7IGN1cnJlbnRFcG9jaCwgY2hlY2twb2ludHMsIG9wZXJhdGlvbnMgfSA9IHRoaXMuX2dldFZpc2libGVPcGVyYXRpb25zQW5kQ2hlY2twb2ludHMoKTtcblx0XHRpZiAob3BlcmF0aW9uLmVwb2NoIDwgY3VycmVudEVwb2NoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZWNvcmQgb3BlcmF0aW9uIGF0IGVwb2NoICR7b3BlcmF0aW9uLmVwb2NofSB3aGVuIGN1cnJlbnQgZXBvY2ggaXMgJHtjdXJyZW50RXBvY2h9YCk7XG5cdFx0fVxuXG5cdFx0b3BlcmF0aW9ucy5wdXNoKG9wZXJhdGlvbik7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5fY2hlY2twb2ludHMuc2V0KGNoZWNrcG9pbnRzLCB0eCk7XG5cdFx0XHR0aGlzLl9vcGVyYXRpb25zLnNldChvcGVyYXRpb25zLCB0eCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50RXBvY2guc2V0KG9wZXJhdGlvbi5lcG9jaCArIDEsIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFZpc2libGVPcGVyYXRpb25zQW5kQ2hlY2twb2ludHMoKSB7XG5cdFx0Y29uc3QgY3VycmVudEVwb2NoID0gdGhpcy5fY3VycmVudEVwb2NoLmdldCgpO1xuXHRcdGNvbnN0IGNoZWNrcG9pbnRzID0gdGhpcy5fY2hlY2twb2ludHMuZ2V0KCk7XG5cdFx0Y29uc3Qgb3BlcmF0aW9ucyA9IHRoaXMuX29wZXJhdGlvbnMuZ2V0KCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3VycmVudEVwb2NoLFxuXHRcdFx0Y2hlY2twb2ludHM6IGNoZWNrcG9pbnRzLmZpbHRlcihjID0+IGMuZXBvY2ggPCBjdXJyZW50RXBvY2gpLFxuXHRcdFx0b3BlcmF0aW9uczogb3BlcmF0aW9ucy5maWx0ZXIob3AgPT4gb3AuZXBvY2ggPCBjdXJyZW50RXBvY2gpXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyByZWNvcmRGaWxlQmFzZWxpbmUoYmFzZWxpbmU6IElGaWxlQmFzZWxpbmUpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9nZXRCYXNlbGluZUtleShiYXNlbGluZS51cmksIGJhc2VsaW5lLnJlcXVlc3RJZCk7XG5cdFx0dGhpcy5fZmlsZUJhc2VsaW5lcy5zZXQoa2V5LCBiYXNlbGluZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRGaWxlQmFzZWxpbmUodXJpOiBVUkksIHJlcXVlc3RJZDogc3RyaW5nKTogSUZpbGVCYXNlbGluZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fZ2V0QmFzZWxpbmVLZXkodXJpLCByZXF1ZXN0SWQpO1xuXHRcdHJldHVybiB0aGlzLl9maWxlQmFzZWxpbmVzLmdldChrZXkpO1xuXHR9XG5cblx0cHVibGljIGhhc0ZpbGVCYXNlbGluZSh1cmk6IFVSSSwgcmVxdWVzdElkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9nZXRCYXNlbGluZUtleSh1cmksIHJlcXVlc3RJZCk7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbGVCYXNlbGluZXMuaGFzKGtleSkgfHwgdGhpcy5fb3BlcmF0aW9ucy5nZXQoKS5zb21lKG9wID0+XG5cdFx0XHRvcC50eXBlID09PSBGaWxlT3BlcmF0aW9uVHlwZS5DcmVhdGUgJiYgb3AucmVxdWVzdElkID09PSByZXF1ZXN0SWQgJiYgaXNFcXVhbCh1cmksIG9wLnVyaSkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldENvbnRlbnRBdFN0b3AocmVxdWVzdElkOiBzdHJpbmcsIGNvbnRlbnRVUkk6IFVSSSwgc3RvcElkOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRsZXQgdG9FcG9jaDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChzdG9wSWQ/LnN0YXJ0c1dpdGgoU1RPUF9JRF9FUE9DSF9QUkVGSVgpKSB7XG5cdFx0XHR0b0Vwb2NoID0gTnVtYmVyKHN0b3BJZC5zbGljZShTVE9QX0lEX0VQT0NIX1BSRUZJWC5sZW5ndGgpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dG9FcG9jaCA9IHRoaXMuX2NoZWNrcG9pbnRzLmdldCgpLmZpbmQoYyA9PiBjLnJlcXVlc3RJZCA9PT0gcmVxdWVzdElkICYmIGMudW5kb1N0b3BJZCA9PT0gc3RvcElkKT8uZXBvY2g7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGNvbnRlbnQgVVJJIGRvZXNuJ3QgcHJlc2VydmUgdGhlIG9yaWdpbmFsIHNjaGVtZSBvciBhdXRob3JpdHkuIExvb2sgdGhyb3VnaFxuXHRcdC8vIHRvIGZpbmQgdGhlIG9wZXJhdGlvbiB0aGF0IHRvdWNoZWQgdGhhdCBwYXRoIHRvIGdldCBpdHMgYWN0dWFsIFVSSVxuXHRcdGNvbnN0IGZpbGVVUkkgPSB0aGlzLl9nZXRUaW1lbGluZUNhbm9uaWNhbFVyaUZvclBhdGgoY29udGVudFVSSSk7XG5cblx0XHRpZiAoIXRvRXBvY2ggfHwgIWZpbGVVUkkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRjb25zdCBiYXNlbGluZSA9IGF3YWl0IHRoaXMuX2ZpbmRCZXN0QmFzZWxpbmVGb3JGaWxlKGZpbGVVUkksIHRvRXBvY2gsIHJlcXVlc3RJZCk7XG5cdFx0aWYgKCFiYXNlbGluZSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wZXJhdGlvbnMgPSB0aGlzLl9nZXRGaWxlT3BlcmF0aW9uc0luUmFuZ2UoZmlsZVVSSSwgYmFzZWxpbmUuZXBvY2gsIHRvRXBvY2gpO1xuXHRcdGNvbnN0IHJlcGxheWVkID0gYXdhaXQgdGhpcy5fcmVwbGF5T3BlcmF0aW9ucyhiYXNlbGluZSwgb3BlcmF0aW9ucyk7XG5cdFx0cmV0dXJuIHJlcGxheWVkLmV4aXN0cyA/IHJlcGxheWVkLmNvbnRlbnQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUaW1lbGluZUNhbm9uaWNhbFVyaUZvclBhdGgoY29udGVudFVSSTogVVJJKSB7XG5cdFx0Zm9yIChjb25zdCBpdCBvZiBbdGhpcy5fZmlsZUJhc2VsaW5lcy52YWx1ZXMoKSwgdGhpcy5fb3BlcmF0aW9ucy5nZXQoKV0pIHtcblx0XHRcdGZvciAoY29uc3QgdGhpbmcgb2YgaXQpIHtcblx0XHRcdFx0aWYgKHRoaW5nLnVyaS5wYXRoID09PSBjb250ZW50VVJJLnBhdGgpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpbmcudXJpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgY2FsbGJhY2sgdGhhdCBpcyBpbnZva2VkIHdoZW4gZGF0YSBhdCB0aGUgc3RvcCBjaGFuZ2VzLiBUaGlzXG5cdCAqIHdpbGwgbm90IGZpcmUgaW5pdGlhbGx5IGFuZCBtYXkgYmUgZGVib3VuY2VkIGludGVybmFsbHkuXG5cdCAqL1xuXHRwdWJsaWMgb25EaWRDaGFuZ2VDb250ZW50c0F0U3RvcChyZXF1ZXN0SWQ6IHN0cmluZywgY29udGVudFVSSTogVVJJLCBzdG9wSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgY2FsbGJhY2s6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Ly8gVGhlIG9ubHkgY2FzZSB3aGVyZSB3ZSBoYXZlIGRhdGEgdGhhdCB1cGRhdGVzIGlzIGlmIHdlIGhhdmUgYW4gZXBvY2ggcG9pbnRlciB0aGF0J3Ncblx0XHQvLyBhZnRlciBvdXIga25vdyBlcG9jaHMgKGUuZy4gcG9pbnRpbmcgdG8gdGhlIGVuZCBmaWxlIHN0YXRlIGFmdGVyIGFsbCBvcGVyYXRpb25zKS5cblx0XHQvLyBJZiB0aGlzIGlzbid0IHRoZSBjYXNlLCBhYm9ydC5cblx0XHRpZiAoIXN0b3BJZCB8fCAhc3RvcElkLnN0YXJ0c1dpdGgoU1RPUF9JRF9FUE9DSF9QUkVGSVgpKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IE51bWJlcihzdG9wSWQuc2xpY2UoU1RPUF9JRF9FUE9DSF9QUkVGSVgubGVuZ3RoKSk7XG5cdFx0aWYgKHRhcmdldCA8PSB0aGlzLl9lcG9jaENvdW50ZXIpIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IC8vIGFscmVhZHkgZmluYWxpemVkXG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgc2NoZWR1bGVyID0gc3RvcmUuYWRkKG5ldyBUaHJvdHRsZWREZWxheWVyKDUwMCkpO1xuXG5cdFx0c3RvcmUuYWRkKEV2ZW50LmZyb21PYnNlcnZhYmxlTGlnaHQodGhpcy5fb3BlcmF0aW9ucykoKCkgPT4ge1xuXHRcdFx0c2NoZWR1bGVyLnRyaWdnZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fb3BlcmF0aW9ucy5nZXQoKS5hdCgtMSk/LmVwb2NoISA+PSB0YXJnZXQpIHtcblx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5nZXRDb250ZW50QXRTdG9wKHJlcXVlc3RJZCwgY29udGVudFVSSSwgc3RvcElkKTtcblx0XHRcdFx0aWYgKGNvbnRlbnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNhbGxiYWNrKGNvbnRlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDaGVja3BvaW50QmVmb3JlRXBvY2goZXBvY2g6IG51bWJlciwgcmVhZGVyPzogSVJlYWRlcikge1xuXHRcdHJldHVybiBmaW5kTGFzdCh0aGlzLl9jaGVja3BvaW50cy5yZWFkKHJlYWRlciksIGMgPT4gYy5lcG9jaCA8PSBlcG9jaCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWNvbnN0cnVjdEZpbGVTdGF0ZSh1cmk6IFVSSSwgdGFyZ2V0RXBvY2g6IG51bWJlcik6IFByb21pc2U8SVJlY29uc3RydWN0ZWRGaWxlU3RhdGU+IHtcblx0XHRjb25zdCB0YXJnZXRDaGVja3BvaW50ID0gdGhpcy5fZ2V0Q2hlY2twb2ludEJlZm9yZUVwb2NoKHRhcmdldEVwb2NoKTtcblx0XHRpZiAoIXRhcmdldENoZWNrcG9pbnQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2hlY2twb2ludCBmb3IgZXBvY2ggJHt0YXJnZXRFcG9jaH0gbm90IGZvdW5kYCk7XG5cdFx0fVxuXG5cdFx0Ly8gRmluZCB0aGUgbW9zdCBhcHByb3ByaWF0ZSBiYXNlbGluZSBmb3IgdGhpcyBmaWxlXG5cdFx0Y29uc3QgYmFzZWxpbmUgPSBhd2FpdCB0aGlzLl9maW5kQmVzdEJhc2VsaW5lRm9yRmlsZSh1cmksIHRhcmdldEVwb2NoLCB0YXJnZXRDaGVja3BvaW50LnJlcXVlc3RJZCB8fCAnJyk7XG5cdFx0aWYgKCFiYXNlbGluZSkge1xuXHRcdFx0Ly8gRmlsZSBkb2Vzbid0IGV4aXN0IGF0IHRoaXMgY2hlY2twb2ludFxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXhpc3RzOiBmYWxzZSxcblx0XHRcdFx0dXJpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBHZXQgb3BlcmF0aW9ucyB0aGF0IGFmZmVjdCB0aGlzIGZpbGUgZnJvbSBiYXNlbGluZSB0byB0YXJnZXQgY2hlY2twb2ludFxuXHRcdGNvbnN0IG9wZXJhdGlvbnMgPSB0aGlzLl9nZXRGaWxlT3BlcmF0aW9uc0luUmFuZ2UodXJpLCBiYXNlbGluZS5lcG9jaCwgdGFyZ2V0RXBvY2gpO1xuXG5cdFx0Ly8gUmVwbGF5IG9wZXJhdGlvbnMgdG8gcmVjb25zdHJ1Y3Qgc3RhdGVcblx0XHRyZXR1cm4gdGhpcy5fcmVwbGF5T3BlcmF0aW9ucyhiYXNlbGluZSwgb3BlcmF0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpOiBJQ2hhdEVkaXRpbmdUaW1lbGluZVN0YXRlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2hlY2twb2ludHM6IHRoaXMuX2NoZWNrcG9pbnRzLmdldCgpLFxuXHRcdFx0Y3VycmVudEVwb2NoOiB0aGlzLl9jdXJyZW50RXBvY2guZ2V0KCksXG5cdFx0XHRmaWxlQmFzZWxpbmVzOiBbLi4udGhpcy5fZmlsZUJhc2VsaW5lc10sXG5cdFx0XHRvcGVyYXRpb25zOiB0aGlzLl9vcGVyYXRpb25zLmdldCgpLFxuXHRcdFx0ZXBvY2hDb3VudGVyOiB0aGlzLl9lcG9jaENvdW50ZXIsXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyByZXN0b3JlRnJvbVN0YXRlKHN0YXRlOiBJQ2hhdEVkaXRpbmdUaW1lbGluZVN0YXRlLCB0eDogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hlY2twb2ludHMuc2V0KHN0YXRlLmNoZWNrcG9pbnRzLCB0eCk7XG5cdFx0dGhpcy5fY3VycmVudEVwb2NoLnNldChzdGF0ZS5jdXJyZW50RXBvY2gsIHR4KTtcblx0XHR0aGlzLl9vcGVyYXRpb25zLnNldChzdGF0ZS5vcGVyYXRpb25zLnNsaWNlKCksIHR4KTtcblx0XHR0aGlzLl9lcG9jaENvdW50ZXIgPSBzdGF0ZS5lcG9jaENvdW50ZXI7XG5cblx0XHR0aGlzLl9maWxlQmFzZWxpbmVzLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBba2V5LCBiYXNlbGluZV0gb2Ygc3RhdGUuZmlsZUJhc2VsaW5lcykge1xuXHRcdFx0dGhpcy5fZmlsZUJhc2VsaW5lcy5zZXQoa2V5LCBiYXNlbGluZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QocmVxdWVzdElkOiBzdHJpbmcsIHVuZG9TdG9wSWQ/OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNoZWNrcG9pbnRzID0gdGhpcy5fY2hlY2twb2ludHMuZ2V0KCk7XG5cdFx0cmV0dXJuIGNoZWNrcG9pbnRzLmZpbmQoYyA9PiBjLnJlcXVlc3RJZCA9PT0gcmVxdWVzdElkICYmIGMudW5kb1N0b3BJZCA9PT0gdW5kb1N0b3BJZCk/LmNoZWNrcG9pbnRJZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY29uc3RydWN0QWxsRmlsZUNvbnRlbnRzKHRhcmdldEVwb2NoOiBudW1iZXIsIGZpbGVzVG9SZWNvbnN0cnVjdDogUmVzb3VyY2VTZXQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChBcnJheS5mcm9tKGZpbGVzVG9SZWNvbnN0cnVjdCkubWFwKGFzeW5jIHVyaSA9PiB7XG5cdFx0XHRjb25zdCByZWNvbnN0cnVjdGVkU3RhdGUgPSBhd2FpdCB0aGlzLl9yZWNvbnN0cnVjdEZpbGVTdGF0ZSh1cmksIHRhcmdldEVwb2NoKTtcblx0XHRcdGlmIChyZWNvbnN0cnVjdGVkU3RhdGUuZXhpc3RzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2RlbGVnYXRlLnNldENvbnRlbnRzKHJlY29uc3RydWN0ZWRTdGF0ZS51cmksIHJlY29uc3RydWN0ZWRTdGF0ZS5jb250ZW50LCByZWNvbnN0cnVjdGVkU3RhdGUudGVsZW1ldHJ5SW5mbyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QmFzZWxpbmVLZXkodXJpOiBVUkksIHJlcXVlc3RJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dXJpLnRvU3RyaW5nKCl9Ojoke3JlcXVlc3RJZH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmluZEJlc3RCYXNlbGluZUZvckZpbGUodXJpOiBVUkksIGVwb2NoOiBudW1iZXIsIHJlcXVlc3RJZDogc3RyaW5nKTogUHJvbWlzZTxJRmlsZUJhc2VsaW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gRmlyc3QsIGl0ZXJhdGUgYmFja3dhcmRzIHRocm91Z2ggb3BlcmF0aW9ucyBiZWZvcmUgdGhlIHRhcmdldCBjaGVja3BvaW50XG5cdFx0Ly8gdG8gc2VlIGlmIHRoZSBmaWxlIHdhcyBjcmVhdGVkL3JlLWNyZWF0ZWQgbW9yZSByZWNlbnRseSB0aGFuIGFueSBiYXNlbGluZVxuXG5cdFx0bGV0IGN1cnJlbnRSZXF1ZXN0SWQgPSByZXF1ZXN0SWQ7XG5cdFx0Y29uc3Qgb3BlcmF0aW9ucyA9IHRoaXMuX29wZXJhdGlvbnMuZ2V0KCk7XG5cdFx0Zm9yIChsZXQgaSA9IG9wZXJhdGlvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IG9wZXJhdGlvbiA9IG9wZXJhdGlvbnNbaV07XG5cdFx0XHRpZiAob3BlcmF0aW9uLmVwb2NoID4gZXBvY2gpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZSBmaWxlIHdhcyBqdXN0IGNyZWF0ZWQsIHVzZSB0aGF0IGFzIGl0cyB1cGRhdGVkIGJhc2VsaW5lXG5cdFx0XHRpZiAob3BlcmF0aW9uLnR5cGUgPT09IEZpbGVPcGVyYXRpb25UeXBlLkNyZWF0ZSAmJiBpc0VxdWFsKG9wZXJhdGlvbi51cmksIHVyaSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR1cmk6IG9wZXJhdGlvbi51cmksXG5cdFx0XHRcdFx0cmVxdWVzdElkOiBvcGVyYXRpb24ucmVxdWVzdElkLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IG9wZXJhdGlvbi5pbml0aWFsQ29udGVudCxcblx0XHRcdFx0XHRlcG9jaDogb3BlcmF0aW9uLmVwb2NoLFxuXHRcdFx0XHRcdHRlbGVtZXRyeUluZm86IG9wZXJhdGlvbi50ZWxlbWV0cnlJbmZvLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB0aGUgZmlsZSB3YXMgcmVuYW1lZCB0byB0aGlzIFVSSSwgdXNlIGl0cyBvbGQgY29udGVudHMgYXMgdGhlIGJhc2VsaW5lXG5cdFx0XHRpZiAob3BlcmF0aW9uLnR5cGUgPT09IEZpbGVPcGVyYXRpb25UeXBlLlJlbmFtZSAmJiBpc0VxdWFsKG9wZXJhdGlvbi5uZXdVcmksIHVyaSkpIHtcblx0XHRcdFx0Y29uc3QgcHJldiA9IGF3YWl0IHRoaXMuX2ZpbmRCZXN0QmFzZWxpbmVGb3JGaWxlKG9wZXJhdGlvbi5vbGRVcmksIG9wZXJhdGlvbi5lcG9jaCwgb3BlcmF0aW9uLnJlcXVlc3RJZCk7XG5cdFx0XHRcdGlmICghcHJldikge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXG5cdFx0XHRcdGNvbnN0IG9wZXJhdGlvbnMgPSB0aGlzLl9nZXRGaWxlT3BlcmF0aW9uc0luUmFuZ2Uob3BlcmF0aW9uLm9sZFVyaSwgcHJldi5lcG9jaCwgb3BlcmF0aW9uLmVwb2NoKTtcblx0XHRcdFx0Y29uc3QgcmVwbGF5ZWQgPSBhd2FpdCB0aGlzLl9yZXBsYXlPcGVyYXRpb25zKHByZXYsIG9wZXJhdGlvbnMpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHVyaTogdXJpLFxuXHRcdFx0XHRcdGVwb2NoOiBvcGVyYXRpb24uZXBvY2gsXG5cdFx0XHRcdFx0Y29udGVudDogcmVwbGF5ZWQuZXhpc3RzID8gcmVwbGF5ZWQuY29udGVudCA6ICcnLFxuXHRcdFx0XHRcdHJlcXVlc3RJZDogb3BlcmF0aW9uLnJlcXVlc3RJZCxcblx0XHRcdFx0XHR0ZWxlbWV0cnlJbmZvOiBwcmV2LnRlbGVtZXRyeUluZm8sXG5cdFx0XHRcdFx0bm90ZWJvb2tWaWV3VHlwZTogcmVwbGF5ZWQuZXhpc3RzID8gcmVwbGF5ZWQubm90ZWJvb2tWaWV3VHlwZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2hlbiB0aGUgcmVxdWVzdCBJRCBjaGFuZ2VzLCBjaGVjayBpZiB3ZSBoYXZlIGEgYmFzZWxpbmUgZm9yIHRoZSBjdXJyZW50IHJlcXVlc3Rcblx0XHRcdGlmIChjdXJyZW50UmVxdWVzdElkICYmIG9wZXJhdGlvbi5yZXF1ZXN0SWQgIT09IGN1cnJlbnRSZXF1ZXN0SWQpIHtcblx0XHRcdFx0Y29uc3QgYmFzZWxpbmUgPSB0aGlzLl9nZXRGaWxlQmFzZWxpbmUodXJpLCBjdXJyZW50UmVxdWVzdElkKTtcblx0XHRcdFx0aWYgKGJhc2VsaW5lKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGJhc2VsaW5lO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGN1cnJlbnRSZXF1ZXN0SWQgPSBvcGVyYXRpb24ucmVxdWVzdElkO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRoZSBmaW5hbCByZXF1ZXN0IElEIGZvciBhIGJhc2VsaW5lXG5cdFx0cmV0dXJuIHRoaXMuX2dldEZpbGVCYXNlbGluZSh1cmksIGN1cnJlbnRSZXF1ZXN0SWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RmlsZU9wZXJhdGlvbnNJblJhbmdlKHVyaTogVVJJLCBmcm9tRXBvY2g6IG51bWJlciwgdG9FcG9jaDogbnVtYmVyKTogcmVhZG9ubHkgRmlsZU9wZXJhdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fb3BlcmF0aW9ucy5nZXQoKS5maWx0ZXIob3AgPT4ge1xuXHRcdFx0Y29uc3QgY2VsbFVyaSA9IENlbGxVcmkucGFyc2Uob3AudXJpKTtcblx0XHRcdHJldHVybiBvcC5lcG9jaCA+PSBmcm9tRXBvY2ggJiZcblx0XHRcdFx0b3AuZXBvY2ggPCB0b0Vwb2NoICYmXG5cdFx0XHRcdChpc0VxdWFsKG9wLnVyaSwgdXJpKSB8fCAoY2VsbFVyaSAmJiBpc0VxdWFsKGNlbGxVcmkubm90ZWJvb2ssIHVyaSkpKTtcblx0XHR9KS5zb3J0KChhLCBiKSA9PiBhLmVwb2NoIC0gYi5lcG9jaCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXBsYXlPcGVyYXRpb25zKGJhc2VsaW5lOiBJRmlsZUJhc2VsaW5lLCBvcGVyYXRpb25zOiByZWFkb25seSBGaWxlT3BlcmF0aW9uW10pOiBQcm9taXNlPElSZWNvbnN0cnVjdGVkRmlsZVN0YXRlPiB7XG5cdFx0bGV0IGN1cnJlbnRTdGF0ZTogSVJlY29uc3RydWN0ZWRGaWxlU3RhdGVXaXRoTm90ZWJvb2sgPSB7XG5cdFx0XHRleGlzdHM6IHRydWUsXG5cdFx0XHRjb250ZW50OiBiYXNlbGluZS5jb250ZW50LFxuXHRcdFx0dXJpOiBiYXNlbGluZS51cmksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBiYXNlbGluZS50ZWxlbWV0cnlJbmZvLFxuXHRcdH07XG5cblx0XHRpZiAoYmFzZWxpbmUubm90ZWJvb2tWaWV3VHlwZSkge1xuXHRcdFx0Y3VycmVudFN0YXRlLm5vdGVib29rID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZS5jcmVhdGVVbnRpdGxlZE5vdGVib29rVGV4dE1vZGVsKGJhc2VsaW5lLm5vdGVib29rVmlld1R5cGUpO1xuXHRcdFx0aWYgKGJhc2VsaW5lLmNvbnRlbnQpIHtcblx0XHRcdFx0cmVzdG9yZU5vdGVib29rU25hcHNob3QoY3VycmVudFN0YXRlLm5vdGVib29rLCBiYXNlbGluZS5jb250ZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IG9wZXJhdGlvbiBvZiBvcGVyYXRpb25zKSB7XG5cdFx0XHRjdXJyZW50U3RhdGUgPSBhd2FpdCB0aGlzLl9hcHBseU9wZXJhdGlvblRvU3RhdGUoY3VycmVudFN0YXRlLCBvcGVyYXRpb24sIGJhc2VsaW5lLnRlbGVtZXRyeUluZm8pO1xuXHRcdH1cblxuXHRcdGlmIChjdXJyZW50U3RhdGUuZXhpc3RzICYmIGN1cnJlbnRTdGF0ZS5ub3RlYm9vaykge1xuXHRcdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHRoaXMuX25vdGVib29rU2VydmljZS53aXRoTm90ZWJvb2tEYXRhUHJvdmlkZXIoY3VycmVudFN0YXRlLm5vdGVib29rLnZpZXdUeXBlKTtcblx0XHRcdGN1cnJlbnRTdGF0ZS5jb250ZW50ID0gY3JlYXRlTm90ZWJvb2tTbmFwc2hvdChjdXJyZW50U3RhdGUubm90ZWJvb2ssIGluZm8uc2VyaWFsaXplci5vcHRpb25zLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjdXJyZW50U3RhdGUubm90ZWJvb2suZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjdXJyZW50U3RhdGU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBseU9wZXJhdGlvblRvU3RhdGUoc3RhdGU6IElSZWNvbnN0cnVjdGVkRmlsZVN0YXRlV2l0aE5vdGVib29rLCBvcGVyYXRpb246IEZpbGVPcGVyYXRpb24sIHRlbGVtZXRyeUluZm86IElNb2RpZmllZEVudHJ5VGVsZW1ldHJ5SW5mbyk6IFByb21pc2U8SVJlY29uc3RydWN0ZWRGaWxlU3RhdGVXaXRoTm90ZWJvb2s+IHtcblx0XHRzd2l0Y2ggKG9wZXJhdGlvbi50eXBlKSB7XG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb25UeXBlLkNyZWF0ZToge1xuXHRcdFx0XHRpZiAoc3RhdGUuZXhpc3RzICYmIHN0YXRlLm5vdGVib29rKSB7XG5cdFx0XHRcdFx0c3RhdGUubm90ZWJvb2suZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IG5vdGVib29rOiBJTm90ZWJvb2tUZXh0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChvcGVyYXRpb24ubm90ZWJvb2tWaWV3VHlwZSkge1xuXHRcdFx0XHRcdG5vdGVib29rID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZS5jcmVhdGVVbnRpdGxlZE5vdGVib29rVGV4dE1vZGVsKG9wZXJhdGlvbi5ub3RlYm9va1ZpZXdUeXBlKTtcblx0XHRcdFx0XHRpZiAob3BlcmF0aW9uLmluaXRpYWxDb250ZW50KSB7XG5cdFx0XHRcdFx0XHRyZXN0b3JlTm90ZWJvb2tTbmFwc2hvdChub3RlYm9vaywgb3BlcmF0aW9uLmluaXRpYWxDb250ZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV4aXN0czogdHJ1ZSxcblx0XHRcdFx0XHRjb250ZW50OiBvcGVyYXRpb24uaW5pdGlhbENvbnRlbnQsXG5cdFx0XHRcdFx0dXJpOiBvcGVyYXRpb24udXJpLFxuXHRcdFx0XHRcdHRlbGVtZXRyeUluZm8sXG5cdFx0XHRcdFx0bm90ZWJvb2tWaWV3VHlwZTogb3BlcmF0aW9uLm5vdGVib29rVmlld1R5cGUsXG5cdFx0XHRcdFx0bm90ZWJvb2ssXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvblR5cGUuRGVsZXRlOlxuXHRcdFx0XHRpZiAoc3RhdGUuZXhpc3RzICYmIHN0YXRlLm5vdGVib29rKSB7XG5cdFx0XHRcdFx0c3RhdGUubm90ZWJvb2suZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleGlzdHM6IGZhbHNlLFxuXHRcdFx0XHRcdHVyaTogb3BlcmF0aW9uLnVyaVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb25UeXBlLlJlbmFtZTpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5zdGF0ZSxcblx0XHRcdFx0XHR1cmk6IG9wZXJhdGlvbi5uZXdVcmlcblx0XHRcdFx0fTtcblxuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uVHlwZS5UZXh0RWRpdDoge1xuXHRcdFx0XHRpZiAoIXN0YXRlLmV4aXN0cykge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGFwcGx5IHRleHQgZWRpdHMgdG8gbm9uLWV4aXN0ZW50IGZpbGUnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5iQ2VsbCA9IG9wZXJhdGlvbi5jZWxsSW5kZXggIT09IHVuZGVmaW5lZCAmJiBzdGF0ZS5ub3RlYm9vaz8uY2VsbHMuYXQob3BlcmF0aW9uLmNlbGxJbmRleCk7XG5cdFx0XHRcdGlmIChuYkNlbGwpIHtcblx0XHRcdFx0XHRjb25zdCBuZXdDb250ZW50ID0gdGhpcy5fYXBwbHlUZXh0RWRpdHNUb0NvbnRlbnQobmJDZWxsLmdldFZhbHVlKCksIG9wZXJhdGlvbi5lZGl0cyk7XG5cdFx0XHRcdFx0c3RhdGUubm90ZWJvb2shLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0XHRcdGluZGV4OiBvcGVyYXRpb24uY2VsbEluZGV4LFxuXHRcdFx0XHRcdFx0Y291bnQ6IDEsXG5cdFx0XHRcdFx0XHRjZWxsczogW3sgY2VsbEtpbmQ6IG5iQ2VsbC5jZWxsS2luZCwgbGFuZ3VhZ2U6IG5iQ2VsbC5sYW5ndWFnZSwgbWltZTogbmJDZWxsLmxhbmd1YWdlLCBzb3VyY2U6IG5ld0NvbnRlbnQsIG91dHB1dHM6IG5iQ2VsbC5vdXRwdXRzIH1dXG5cdFx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEFwcGx5IHRleHQgZWRpdHMgdXNpbmcgYSB0ZW1wb3JhcnkgdGV4dCBtb2RlbFxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IHRoaXMuX2FwcGx5VGV4dEVkaXRzVG9Db250ZW50KHN0YXRlLmNvbnRlbnQsIG9wZXJhdGlvbi5lZGl0cylcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvblR5cGUuTm90ZWJvb2tFZGl0OlxuXHRcdFx0XHRpZiAoIXN0YXRlLmV4aXN0cykge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGFwcGx5IG5vdGVib29rIGVkaXRzIHRvIG5vbi1leGlzdGVudCBmaWxlJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFzdGF0ZS5ub3RlYm9vaykge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGFwcGx5IG5vdGVib29rIGVkaXRzIHRvIG5vbi1ub3RlYm9vayBmaWxlJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzdGF0ZS5ub3RlYm9vay5hcHBseUVkaXRzKG9wZXJhdGlvbi5jZWxsRWRpdHMuc2xpY2UoKSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YXNzZXJ0TmV2ZXIob3BlcmF0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBseUZpbGVTeXN0ZW1PcGVyYXRpb25zKGZyb21FcG9jaDogbnVtYmVyLCB0b0Vwb2NoOiBudW1iZXIpOiBQcm9taXNlPFJlc291cmNlU2V0PiB7XG5cdFx0Y29uc3QgaXNNb3ZpbmdGb3J3YXJkID0gdG9FcG9jaCA+IGZyb21FcG9jaDtcblx0XHRjb25zdCBvcGVyYXRpb25zID0gdGhpcy5fb3BlcmF0aW9ucy5nZXQoKS5maWx0ZXIob3AgPT4ge1xuXHRcdFx0aWYgKGlzTW92aW5nRm9yd2FyZCkge1xuXHRcdFx0XHRyZXR1cm4gb3AuZXBvY2ggPj0gZnJvbUVwb2NoICYmIG9wLmVwb2NoIDwgdG9FcG9jaDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBvcC5lcG9jaCA8IGZyb21FcG9jaCAmJiBvcC5lcG9jaCA+PSB0b0Vwb2NoO1xuXHRcdFx0fVxuXHRcdH0pLnNvcnQoKGEsIGIpID0+IGlzTW92aW5nRm9yd2FyZCA/IGEuZXBvY2ggLSBiLmVwb2NoIDogYi5lcG9jaCAtIGEuZXBvY2gpO1xuXG5cdFx0Ly8gQXBwbHkgZmlsZSBzeXN0ZW0gb3BlcmF0aW9ucyBpbiB0aGUgY29ycmVjdCBkaXJlY3Rpb25cblx0XHRjb25zdCB1cmlzVG9SZXN0b3JlID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0Zm9yIChjb25zdCBvcGVyYXRpb24gb2Ygb3BlcmF0aW9ucykge1xuXHRcdFx0YXdhaXQgdGhpcy5fYXBwbHlGaWxlU3lzdGVtT3BlcmF0aW9uKG9wZXJhdGlvbiwgaXNNb3ZpbmdGb3J3YXJkLCB1cmlzVG9SZXN0b3JlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdXJpc1RvUmVzdG9yZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FwcGx5RmlsZVN5c3RlbU9wZXJhdGlvbihvcGVyYXRpb246IEZpbGVPcGVyYXRpb24sIGlzTW92aW5nRm9yd2FyZDogYm9vbGVhbiwgdXJpc1RvUmVzdG9yZTogUmVzb3VyY2VTZXQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRzd2l0Y2ggKG9wZXJhdGlvbi50eXBlKSB7XG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb25UeXBlLkNyZWF0ZTpcblx0XHRcdFx0aWYgKGlzTW92aW5nRm9yd2FyZCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2RlbGVnYXRlLmNyZWF0ZUZpbGUob3BlcmF0aW9uLnVyaSwgb3BlcmF0aW9uLmluaXRpYWxDb250ZW50KTtcblx0XHRcdFx0XHR1cmlzVG9SZXN0b3JlLmFkZChvcGVyYXRpb24udXJpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9kZWxlZ2F0ZS5kZWxldGVGaWxlKG9wZXJhdGlvbi51cmkpO1xuXHRcdFx0XHRcdHVyaXNUb1Jlc3RvcmUuZGVsZXRlKG9wZXJhdGlvbi51cmkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb25UeXBlLkRlbGV0ZTpcblx0XHRcdFx0aWYgKGlzTW92aW5nRm9yd2FyZCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2RlbGVnYXRlLmRlbGV0ZUZpbGUob3BlcmF0aW9uLnVyaSk7XG5cdFx0XHRcdFx0dXJpc1RvUmVzdG9yZS5kZWxldGUob3BlcmF0aW9uLnVyaSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fZGVsZWdhdGUuY3JlYXRlRmlsZShvcGVyYXRpb24udXJpLCBvcGVyYXRpb24uZmluYWxDb250ZW50KTtcblx0XHRcdFx0XHR1cmlzVG9SZXN0b3JlLmFkZChvcGVyYXRpb24udXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBGaWxlT3BlcmF0aW9uVHlwZS5SZW5hbWU6XG5cdFx0XHRcdGlmIChpc01vdmluZ0ZvcndhcmQpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9kZWxlZ2F0ZS5yZW5hbWVGaWxlKG9wZXJhdGlvbi5vbGRVcmksIG9wZXJhdGlvbi5uZXdVcmkpO1xuXHRcdFx0XHRcdHVyaXNUb1Jlc3RvcmUuZGVsZXRlKG9wZXJhdGlvbi5vbGRVcmkpO1xuXHRcdFx0XHRcdHVyaXNUb1Jlc3RvcmUuYWRkKG9wZXJhdGlvbi5uZXdVcmkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2RlbGVnYXRlLnJlbmFtZUZpbGUob3BlcmF0aW9uLm5ld1VyaSwgb3BlcmF0aW9uLm9sZFVyaSk7XG5cdFx0XHRcdFx0dXJpc1RvUmVzdG9yZS5kZWxldGUob3BlcmF0aW9uLm5ld1VyaSk7XG5cdFx0XHRcdFx0dXJpc1RvUmVzdG9yZS5hZGQob3BlcmF0aW9uLm9sZFVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdC8vIFRleHQgYW5kIG5vdGVib29rIGVkaXRzIGRvbid0IGFmZmVjdCBmaWxlIHN5c3RlbSBzdHJ1Y3R1cmVcblx0XHRcdGNhc2UgRmlsZU9wZXJhdGlvblR5cGUuVGV4dEVkaXQ6XG5cdFx0XHRjYXNlIEZpbGVPcGVyYXRpb25UeXBlLk5vdGVib29rRWRpdDpcblx0XHRcdFx0dXJpc1RvUmVzdG9yZS5hZGQoQ2VsbFVyaS5wYXJzZShvcGVyYXRpb24udXJpKT8ubm90ZWJvb2sgPz8gb3BlcmF0aW9uLnVyaSk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRhc3NlcnROZXZlcihvcGVyYXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5VGV4dEVkaXRzVG9Db250ZW50KGNvbnRlbnQ6IHN0cmluZywgZWRpdHM6IHJlYWRvbmx5IFRleHRFZGl0W10pOiBzdHJpbmcge1xuXHRcdGNvbnN0IHsgdGV4dEJ1ZmZlciwgZGlzcG9zYWJsZSB9ID0gY3JlYXRlVGV4dEJ1ZmZlcihjb250ZW50LCBEZWZhdWx0RW5kT2ZMaW5lLkxGKTtcblx0XHR0cnkge1xuXHRcdFx0dGV4dEJ1ZmZlci5hcHBseUVkaXRzKGVkaXRzLm1hcChlZGl0ID0+XG5cdFx0XHRcdG5ldyBWYWxpZEFubm90YXRlZEVkaXRPcGVyYXRpb24obnVsbCwgUmFuZ2UubGlmdChlZGl0LnJhbmdlKSwgZWRpdC50ZXh0LCBmYWxzZSwgZmFsc2UsIGZhbHNlKVxuXHRcdFx0KSwgZmFsc2UsIGZhbHNlKTtcblx0XHRcdGNvbnN0IGZ1bGxSYW5nZSA9IHRleHRCdWZmZXIuZ2V0UmFuZ2VBdCgwLCB0ZXh0QnVmZmVyLmdldExlbmd0aCgpKTtcblx0XHRcdHJldHVybiB0ZXh0QnVmZmVyLmdldFZhbHVlSW5SYW5nZShmdWxsUmFuZ2UsIEVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW50cnlEaWZmQmV0d2VlblN0b3BzKHVyaTogVVJJLCByZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgc3RvcElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJT2JzZXJ2YWJsZTxJRWRpdFNlc3Npb25FbnRyeURpZmYgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBlcG9jaHMgPSBkZXJpdmVkT3B0czx7IHN0YXJ0OiBJQ2hlY2twb2ludDsgZW5kOiBJQ2hlY2twb2ludCB8IHVuZGVmaW5lZCB9Pih7IGVxdWFsc0ZuOiAoYSwgYikgPT4gYS5zdGFydCA9PT0gYi5zdGFydCAmJiBhLmVuZCA9PT0gYi5lbmQgfSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoZWNrcG9pbnRzID0gdGhpcy5fY2hlY2twb2ludHMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc3RhcnRJbmRleCA9IGNoZWNrcG9pbnRzLmZpbmRJbmRleChjID0+IGMucmVxdWVzdElkID09PSByZXF1ZXN0SWQgJiYgYy51bmRvU3RvcElkID09PSBzdG9wSWQpO1xuXHRcdFx0cmV0dXJuIHsgc3RhcnQ6IGNoZWNrcG9pbnRzW3N0YXJ0SW5kZXhdLCBlbmQ6IGNoZWNrcG9pbnRzW3N0YXJ0SW5kZXggKyAxXSB9O1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2dldEVudHJ5RGlmZkJldHdlZW5FcG9jaHModXJpLCBgc1xcMCR7cmVxdWVzdElkfVxcMCR7c3RvcElkfWAsIGVwb2Nocyk7XG5cdH1cblxuXHQvKiogR2V0cyB0aGUgZXBvY2ggYm91bmRzIG9mIHRoZSByZXF1ZXN0LiBJZiBzdG9wUmVxdWVzdElkIGlzIHVuZGVmaW5lZCwgZ2V0cyBPTkxZIHRoZSBzaW5nbGUgcmVxdWVzdCdzIGJvdW5kcyAqL1xuXHRwcml2YXRlIF9nZXRSZXF1ZXN0RXBvY2hCb3VuZHMoc3RhcnRSZXF1ZXN0SWQ6IHN0cmluZywgc3RvcFJlcXVlc3RJZD86IHN0cmluZyk6IElPYnNlcnZhYmxlPHsgc3RhcnQ6IElDaGVja3BvaW50OyBlbmQ6IElDaGVja3BvaW50IHwgdW5kZWZpbmVkIH0+IHtcblx0XHRyZXR1cm4gZGVyaXZlZE9wdHM8eyBzdGFydDogSUNoZWNrcG9pbnQ7IGVuZDogSUNoZWNrcG9pbnQgfCB1bmRlZmluZWQgfT4oeyBlcXVhbHNGbjogKGEsIGIpID0+IGEuc3RhcnQgPT09IGIuc3RhcnQgJiYgYS5lbmQgPT09IGIuZW5kIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjaGVja3BvaW50cyA9IHRoaXMuX2NoZWNrcG9pbnRzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHN0YXJ0SW5kZXggPSBjaGVja3BvaW50cy5maW5kSW5kZXgoYyA9PiBjLnJlcXVlc3RJZCA9PT0gc3RhcnRSZXF1ZXN0SWQpO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBzdGFydEluZGV4ID09PSAtMSA/IGNoZWNrcG9pbnRzWzBdIDogY2hlY2twb2ludHNbc3RhcnRJbmRleF07XG5cblx0XHRcdGxldCBlbmQ6IElDaGVja3BvaW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHN0b3BSZXF1ZXN0SWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRlbmQgPSBmaW5kRmlyc3QoY2hlY2twb2ludHMsIGMgPT4gYy5yZXF1ZXN0SWQgIT09IHN0YXJ0UmVxdWVzdElkLCBzdGFydEluZGV4ICsgMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbmQgPSBjaGVja3BvaW50cy5maW5kKGMgPT4gYy5yZXF1ZXN0SWQgPT09IHN0b3BSZXF1ZXN0SWQpXG5cdFx0XHRcdFx0fHwgZmluZEZpcnN0KGNoZWNrcG9pbnRzLCBjID0+IGMucmVxdWVzdElkICE9PSBzdGFydFJlcXVlc3RJZCwgc3RhcnRJbmRleCArIDEpXG5cdFx0XHRcdFx0fHwgY2hlY2twb2ludHNbY2hlY2twb2ludHMubGVuZ3RoIC0gMV07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IHN0YXJ0LCBlbmQgfTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbnRyeURpZmZCZXR3ZWVuUmVxdWVzdHModXJpOiBVUkksIHN0YXJ0UmVxdWVzdElkOiBzdHJpbmcsIHN0b3BSZXF1ZXN0SWQ6IHN0cmluZyk6IElPYnNlcnZhYmxlPElFZGl0U2Vzc2lvbkVudHJ5RGlmZiB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRFbnRyeURpZmZCZXR3ZWVuRXBvY2hzKHVyaSwgYHJcXDAke3N0YXJ0UmVxdWVzdElkfVxcMCR7c3RvcFJlcXVlc3RJZH1gLCB0aGlzLl9nZXRSZXF1ZXN0RXBvY2hCb3VuZHMoc3RhcnRSZXF1ZXN0SWQsIHN0b3BSZXF1ZXN0SWQpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVudHJ5RGlmZkJldHdlZW5FcG9jaHModXJpOiBVUkksIGNhY2hlS2V5OiBzdHJpbmcsIGVwb2NoczogSU9ic2VydmFibGU8eyBzdGFydDogSUNoZWNrcG9pbnQgfCB1bmRlZmluZWQ7IGVuZDogSUNoZWNrcG9pbnQgfCB1bmRlZmluZWQgfT4pOiBJT2JzZXJ2YWJsZTxJRWRpdFNlc3Npb25FbnRyeURpZmYgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBrZXkgPSBgJHt1cmkudG9TdHJpbmcoKX1cXDAke2NhY2hlS2V5fWA7XG5cblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9maW5hbGl6ZWREaWZmQ2FjaGUuZ2V0KGtleSk7XG5cdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZShjYWNoZWQpO1xuXHRcdH1cblxuXHRcdGxldCBvYnMgPSB0aGlzLl9yZWZDb3VudGVkRGlmZnMuZ2V0KGtleSk7XG5cblx0XHRpZiAoIW9icykge1xuXHRcdFx0b2JzID0gdGhpcy5fZ2V0RW50cnlEaWZmQmV0d2VlbkVwb2Noc0lubmVyKFxuXHRcdFx0XHR1cmksXG5cdFx0XHRcdGtleSxcblx0XHRcdFx0ZXBvY2hzLFxuXHRcdFx0XHQoKSA9PiB0aGlzLl9yZWZDb3VudGVkRGlmZnMuZGVsZXRlKGtleSksXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5fcmVmQ291bnRlZERpZmZzLnNldChrZXksIG9icyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9icztcblx0fVxuXG5cdHByaXZhdGUgX2dldEVudHJ5RGlmZkJldHdlZW5FcG9jaHNJbm5lcihcblx0XHR1cmk6IFVSSSxcblx0XHRjYWNoZUtleTogc3RyaW5nLFxuXHRcdGVwb2NoczogSU9ic2VydmFibGU8eyBzdGFydDogSUNoZWNrcG9pbnQgfCB1bmRlZmluZWQ7IGVuZDogSUNoZWNrcG9pbnQgfCB1bmRlZmluZWQgfT4sXG5cdFx0b25MYXN0T2JzZXJ2ZXJSZW1vdmVkOiAoKSA9PiB2b2lkLFxuXHQpOiBJT2JzZXJ2YWJsZTxJRWRpdFNlc3Npb25FbnRyeURpZmYgfCB1bmRlZmluZWQ+IHtcblx0XHR0eXBlIE1vZGVsUmVmc1ZhbHVlID0geyByZWZzOiB7IG1vZGVsOiBJVGV4dE1vZGVsOyBvbkNoYW5nZTogSU9ic2VydmFibGU8dm9pZD4gfVtdOyBpc0ZpbmFsOiBib29sZWFuOyBlcnJvcj86IHVua25vd24gfTtcblxuXHRcdGNvbnN0IG1vZGVsUmVmc1Byb21pc2UgPSBkZXJpdmVkKHRoaXMsIChyZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IHsgc3RhcnQsIGVuZCB9ID0gZXBvY2hzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghc3RhcnQpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0XHRjb25zdCBzdG9yZSA9IHJlYWRlci5zdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVVJJID0gdGhpcy5nZXRDb250ZW50VVJJQXRTdG9wKHN0YXJ0LnJlcXVlc3RJZCB8fCBTVEFSVF9SRVFVRVNUX0VQT0NILCB1cmksIFNUT1BfSURfRVBPQ0hfUFJFRklYICsgc3RhcnQuZXBvY2gpO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRVUkkgPSB0aGlzLmdldENvbnRlbnRVUklBdFN0b3AoZW5kPy5yZXF1ZXN0SWQgfHwgc3RhcnQucmVxdWVzdElkIHx8IFNUQVJUX1JFUVVFU1RfRVBPQ0gsIHVyaSwgU1RPUF9JRF9FUE9DSF9QUkVGSVggKyAoZW5kPy5lcG9jaCB8fCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikpO1xuXG5cdFx0XHRjb25zdCBwcm9taXNlOiBQcm9taXNlPE1vZGVsUmVmc1ZhbHVlPiA9IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5fdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShvcmlnaW5hbFVSSSksXG5cdFx0XHRcdHRoaXMuX3RleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UobW9kaWZpZWRVUkkpLFxuXHRcdFx0XSkudGhlbihyZWZzID0+IHtcblx0XHRcdFx0aWYgKHN0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZWZzLmZvckVhY2gociA9PiByLmRpc3Bvc2UoKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVmcy5mb3JFYWNoKHIgPT4gc3RvcmUuYWRkKHIpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmVmczogcmVmcy5tYXAociA9PiAoe1xuXHRcdFx0XHRcdFx0bW9kZWw6IHIub2JqZWN0LnRleHRFZGl0b3JNb2RlbCxcblx0XHRcdFx0XHRcdG9uQ2hhbmdlOiBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KHRoaXMsIHIub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQuYmluZChyLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwpKSxcblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0aXNGaW5hbDogISFlbmQsXG5cdFx0XHRcdH07XG5cdFx0XHR9KS5jYXRjaCgoZXJyb3IpOiBNb2RlbFJlZnNWYWx1ZSA9PiB7XG5cdFx0XHRcdHJldHVybiB7IHJlZnM6IFtdLCBpc0ZpbmFsOiB0cnVlLCBlcnJvciB9O1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG9yaWdpbmFsVVJJLFxuXHRcdFx0XHRtb2RpZmllZFVSSSxcblx0XHRcdFx0cHJvbWlzZTogbmV3IE9ic2VydmFibGVQcm9taXNlKHByb21pc2UpLFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpZmYgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbHNEYXRhID0gbW9kZWxSZWZzUHJvbWlzZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIW1vZGVsc0RhdGEpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB7IG9yaWdpbmFsVVJJLCBtb2RpZmllZFVSSSwgcHJvbWlzZSB9ID0gbW9kZWxzRGF0YTtcblx0XHRcdGNvbnN0IHByb21pc2VEYXRhID0gcHJvbWlzZT8ucHJvbWlzZVJlc3VsdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXByb21pc2VEYXRhPy5kYXRhKSB7XG5cdFx0XHRcdHJldHVybiB7IG9yaWdpbmFsVVJJLCBtb2RpZmllZFVSSSwgcHJvbWlzZTogdW5kZWZpbmVkIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHsgcmVmcywgaXNGaW5hbCwgZXJyb3IgfSA9IHByb21pc2VEYXRhLmRhdGE7XG5cdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIHsgb3JpZ2luYWxVUkksIG1vZGlmaWVkVVJJLCBwcm9taXNlOiBuZXcgT2JzZXJ2YWJsZVByb21pc2UoUHJvbWlzZS5yZXNvbHZlKGVtcHR5U2Vzc2lvbkVudHJ5RGlmZihvcmlnaW5hbFVSSSwgbW9kaWZpZWRVUkkpKSkgfTtcblx0XHRcdH1cblxuXHRcdFx0cmVmcy5mb3JFYWNoKG0gPT4gbS5vbkNoYW5nZS5yZWFkKHJlYWRlcikpOyAvLyByZS1yZWFkIHdoZW4gY29udGVudHMgY2hhbmdlXG5cblx0XHRcdHJldHVybiB7IG9yaWdpbmFsVVJJLCBtb2RpZmllZFVSSSwgcHJvbWlzZTogbmV3IE9ic2VydmFibGVQcm9taXNlKHRoaXMuX2NvbXB1dGVEaWZmKG9yaWdpbmFsVVJJLCBtb2RpZmllZFVSSSwgISFpc0ZpbmFsKSkgfTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBkZXJpdmVkT3B0cyh7IG9uTGFzdE9ic2VydmVyUmVtb3ZlZCB9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZGlmZi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcm9taXNlZCA9IHJlc3VsdC5wcm9taXNlPy5wcm9taXNlUmVzdWx0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChwcm9taXNlZD8uZGF0YSkge1xuXHRcdFx0XHRpZiAocHJvbWlzZWQuZGF0YS5pc0ZpbmFsKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmluYWxpemVkRGlmZkNhY2hlLnNldChjYWNoZUtleSwgcHJvbWlzZWQuZGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHByb21pc2VkLmRhdGE7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcm9taXNlZD8uZXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIGVtcHR5U2Vzc2lvbkVudHJ5RGlmZihyZXN1bHQub3JpZ2luYWxVUkksIHJlc3VsdC5tb2RpZmllZFVSSSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IC4uLmVtcHR5U2Vzc2lvbkVudHJ5RGlmZihyZXN1bHQub3JpZ2luYWxVUkksIHJlc3VsdC5tb2RpZmllZFVSSSksIGlzQnVzeTogdHJ1ZSB9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZURpZmYob3JpZ2luYWxVcmk6IFVSSSwgbW9kaWZpZWRVcmk6IFVSSSwgaXNGaW5hbDogYm9vbGVhbik6IFByb21pc2U8SUVkaXRTZXNzaW9uRW50cnlEaWZmPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvcldvcmtlclNlcnZpY2UuY29tcHV0ZURpZmYoXG5cdFx0XHRvcmlnaW5hbFVyaSxcblx0XHRcdG1vZGlmaWVkVXJpLFxuXHRcdFx0eyBpZ25vcmVUcmltV2hpdGVzcGFjZTogZmFsc2UsIGNvbXB1dGVNb3ZlczogZmFsc2UsIG1heENvbXB1dGF0aW9uVGltZU1zOiAzMDAwIH0sXG5cdFx0XHQnYWR2YW5jZWQnXG5cdFx0KS50aGVuKChkaWZmKTogSUVkaXRTZXNzaW9uRW50cnlEaWZmID0+IHtcblx0XHRcdGNvbnN0IGVudHJ5RGlmZjogSUVkaXRTZXNzaW9uRW50cnlEaWZmID0ge1xuXHRcdFx0XHRvcmlnaW5hbFVSSTogb3JpZ2luYWxVcmksXG5cdFx0XHRcdG1vZGlmaWVkVVJJOiBtb2RpZmllZFVyaSxcblx0XHRcdFx0aWRlbnRpY2FsOiAhIWRpZmY/LmlkZW50aWNhbCxcblx0XHRcdFx0aXNGaW5hbCxcblx0XHRcdFx0cXVpdEVhcmx5OiAhZGlmZiB8fCBkaWZmLnF1aXRFYXJseSxcblx0XHRcdFx0YWRkZWQ6IDAsXG5cdFx0XHRcdHJlbW92ZWQ6IDAsXG5cdFx0XHRcdGlzQnVzeTogZmFsc2UsXG5cdFx0XHR9O1xuXHRcdFx0aWYgKGRpZmYpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgZGlmZi5jaGFuZ2VzKSB7XG5cdFx0XHRcdFx0ZW50cnlEaWZmLnJlbW92ZWQgKz0gY2hhbmdlLm9yaWdpbmFsLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSBjaGFuZ2Uub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdGVudHJ5RGlmZi5hZGRlZCArPSBjaGFuZ2UubW9kaWZpZWQuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIGNoYW5nZS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBlbnRyeURpZmY7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgaGFzRWRpdHNJblJlcXVlc3QocmVxdWVzdElkOiBzdHJpbmcsIHJlYWRlcj86IElSZWFkZXIpOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHRoaXMuX2ZpbGVCYXNlbGluZXMudmFsdWVzKCkpIHtcblx0XHRcdGlmICh2YWx1ZS5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IG9wZXJhdGlvbiBvZiB0aGlzLl9vcGVyYXRpb25zLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0aWYgKG9wZXJhdGlvbi5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGlmZnNGb3JGaWxlc0luUmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZyk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdPiB7XG5cdFx0Y29uc3QgYm91bmRzT2JzZXJ2YWJsZSA9IHRoaXMuX2dldFJlcXVlc3RFcG9jaEJvdW5kcyhyZXF1ZXN0SWQpO1xuXHRcdGNvbnN0IHN0YXJ0RXBvY2hzID0gZGVyaXZlZE9wdHM8UmVzb3VyY2VNYXA8bnVtYmVyPj4oeyBlcXVhbHNGbjogbWFwc1N0cmljdEVxdWFsSWdub3JlT3JkZXIgfSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHVyaXMgPSBuZXcgUmVzb3VyY2VNYXA8bnVtYmVyPigpO1xuXHRcdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB0aGlzLl9maWxlQmFzZWxpbmVzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGlmICh2YWx1ZS5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZCkge1xuXHRcdFx0XHRcdHVyaXMuc2V0KHZhbHVlLnVyaSwgdmFsdWUuZXBvY2gpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJvdW5kcyA9IGJvdW5kc09ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Zm9yIChjb25zdCBvcGVyYXRpb24gb2YgdGhpcy5fb3BlcmF0aW9ucy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0aWYgKG9wZXJhdGlvbi5lcG9jaCA8IGJvdW5kcy5zdGFydC5lcG9jaCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChib3VuZHMuZW5kICYmIG9wZXJhdGlvbi5lcG9jaCA+PSBib3VuZHMuZW5kLmVwb2NoKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAob3BlcmF0aW9uLnR5cGUgPT09IEZpbGVPcGVyYXRpb25UeXBlLkNyZWF0ZSkge1xuXHRcdFx0XHRcdHVyaXMuc2V0KG9wZXJhdGlvbi51cmksIDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1cmlzO1xuXHRcdH0pO1xuXG5cblx0XHRyZXR1cm4gdGhpcy5fZ2V0RGlmZnNGb3JGaWxlc0F0RXBvY2hzKHN0YXJ0RXBvY2hzLCBib3VuZHNPYnNlcnZhYmxlLm1hcChiID0+IGIuZW5kKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREaWZmc0ZvckZpbGVzQXRFcG9jaHMoc3RhcnRFcG9jaHM6IElPYnNlcnZhYmxlPFJlc291cmNlTWFwPG51bWJlcj4+LCBlbmRDaGVja3BvaW50T2JzOiBJT2JzZXJ2YWJsZTxJQ2hlY2twb2ludCB8IHVuZGVmaW5lZD4pIHtcblx0XHQvLyBVUklzIGFyZSBuZXZlciByZW1vdmVkIGZyb20gdGhlIHNldCBhbmQgd2UgbmV2ZXIgYWRqdXN0IGJhc2VsaW5lcyBiYWNrd2FyZHNcblx0XHQvLyAoaGlzdG9yeSBpcyBpbW11dGFibGUpIHNvIHdlIGNhbiBlYXNpbHkgY2FjaGUgdG8gYXZvaWQgcmVnZW5lcmF0aW5nIGRpZmZzIHdoZW4gbmV3IGZpbGVzIGFyZSBhZGRlZFxuXHRcdGNvbnN0IHByZXZEaWZmcyA9IG5ldyBSZXNvdXJjZU1hcDxJT2JzZXJ2YWJsZTxJRWRpdFNlc3Npb25FbnRyeURpZmYgfCB1bmRlZmluZWQ+PigpO1xuXHRcdGxldCBwcmV2RW5kQ2hlY2twb2ludDogSUNoZWNrcG9pbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBwZXJGaWxlRGlmZnMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjaGVja3BvaW50cyA9IHRoaXMuX2NoZWNrcG9pbnRzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGZpcnN0Q2hlY2twb2ludCA9IGNoZWNrcG9pbnRzWzBdO1xuXHRcdFx0aWYgKCFmaXJzdENoZWNrcG9pbnQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbmRDaGVja3BvaW50ID0gZW5kQ2hlY2twb2ludE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoZW5kQ2hlY2twb2ludCAhPT0gcHJldkVuZENoZWNrcG9pbnQpIHtcblx0XHRcdFx0cHJldkRpZmZzLmNsZWFyKCk7XG5cdFx0XHRcdHByZXZFbmRDaGVja3BvaW50ID0gZW5kQ2hlY2twb2ludDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdXJpcyA9IHN0YXJ0RXBvY2hzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGRpZmZzOiBJT2JzZXJ2YWJsZTxJRWRpdFNlc3Npb25FbnRyeURpZmYgfCB1bmRlZmluZWQ+W10gPSBbXTtcblxuXHRcdFx0Zm9yIChjb25zdCBbdXJpLCBlcG9jaF0gb2YgdXJpcykge1xuXHRcdFx0XHRjb25zdCBvYnMgPSBwcmV2RGlmZnMuZ2V0KHVyaSkgPz8gdGhpcy5fZ2V0RW50cnlEaWZmQmV0d2VlbkVwb2Nocyh1cmksIGBlXFwwJHtlcG9jaH1cXDAke2VuZENoZWNrcG9pbnQ/LmVwb2NofWAsXG5cdFx0XHRcdFx0Y29uc3RPYnNlcnZhYmxlKHsgc3RhcnQ6IGNoZWNrcG9pbnRzLmZpbmRMYXN0KGNwID0+IGNwLmVwb2NoIDw9IGVwb2NoKSB8fCBmaXJzdENoZWNrcG9pbnQsIGVuZDogZW5kQ2hlY2twb2ludCB9KSk7XG5cdFx0XHRcdHByZXZEaWZmcy5zZXQodXJpLCBvYnMpO1xuXHRcdFx0XHRkaWZmcy5wdXNoKG9icyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBkaWZmcztcblx0XHR9KTtcblxuXHRcdHJldHVybiBwZXJGaWxlRGlmZnMubWFwKChkaWZmcywgcmVhZGVyKSA9PiB7XG5cdFx0XHRyZXR1cm4gZGlmZnMuZmxhdE1hcChkID0+IGQucmVhZChyZWFkZXIpKS5maWx0ZXIoaXNEZWZpbmVkKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXREaWZmc0ZvckZpbGVzSW5TZXNzaW9uKCk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdPiB7XG5cdFx0Y29uc3Qgc3RhcnRFcG9jaHMgPSBkZXJpdmVkT3B0czxSZXNvdXJjZU1hcDxudW1iZXI+Pih7IGVxdWFsc0ZuOiBtYXBzU3RyaWN0RXF1YWxJZ25vcmVPcmRlciB9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgdXJpcyA9IG5ldyBSZXNvdXJjZU1hcDxudW1iZXI+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGJhc2VsaW5lIG9mIHRoaXMuX2ZpbGVCYXNlbGluZXMudmFsdWVzKCkpIHtcblx0XHRcdFx0dXJpcy5zZXQoYmFzZWxpbmUudXJpLCBNYXRoLm1pbihiYXNlbGluZS5lcG9jaCwgdXJpcy5nZXQoYmFzZWxpbmUudXJpKSA/PyBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBvcGVyYXRpb24gb2YgdGhpcy5fb3BlcmF0aW9ucy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0aWYgKG9wZXJhdGlvbi50eXBlID09PSBGaWxlT3BlcmF0aW9uVHlwZS5DcmVhdGUpIHtcblx0XHRcdFx0XHR1cmlzLnNldChvcGVyYXRpb24udXJpLCAwKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdXJpcztcblx0XHR9KTtcblxuXHRcdHJldHVybiB0aGlzLl9nZXREaWZmc0ZvckZpbGVzQXRFcG9jaHMoc3RhcnRFcG9jaHMsIGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXREaWZmRm9yU2Vzc2lvbigpOiBJT2JzZXJ2YWJsZTxJRWRpdFNlc3Npb25EaWZmU3RhdHM+IHtcblx0XHRjb25zdCBmaWxlRGlmZnMgPSB0aGlzLmdldERpZmZzRm9yRmlsZXNJblNlc3Npb24oKTtcblx0XHRyZXR1cm4gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZnMgPSBmaWxlRGlmZnMucmVhZChyZWFkZXIpO1xuXHRcdFx0bGV0IGFkZGVkID0gMDtcblx0XHRcdGxldCByZW1vdmVkID0gMDtcblx0XHRcdGZvciAoY29uc3QgZGlmZiBvZiBkaWZmcykge1xuXHRcdFx0XHRhZGRlZCArPSBkaWZmLmFkZGVkO1xuXHRcdFx0XHRyZW1vdmVkICs9IGRpZmYucmVtb3ZlZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGFkZGVkLCByZW1vdmVkIH07XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxVQUFVLG1CQUFtQjtBQUN0QyxTQUFTLFdBQVcsVUFBVSxtQkFBbUI7QUFDakQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyw0QkFBNEIsYUFBYSxtQkFBbUI7QUFDckUsU0FBUyxVQUFVLG9CQUFvQjtBQUN2QyxTQUFTLGlCQUFpQixTQUFTLGFBQWlELG1CQUFtQiwyQkFBMkIsaUJBQWlCLHFCQUFxQixtQkFBbUI7QUFDM0wsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQTBCO0FBRW5DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFBYTtBQUV0QixTQUFTLGtCQUFrQixxQkFBaUMsbUNBQW1DO0FBQy9GLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsY0FBYyxlQUFtQztBQUMxRCxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUF3RztBQUdqSCxTQUF3Qix5QkFBMEs7QUFDbE0sU0FBUyxtREFBbUQ7QUFDNUQsU0FBUyxrQkFBa0Isd0JBQXdCLG1CQUFtQiwrQkFBK0I7QUFFckcsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSx1QkFBdUI7QUE0QnRCLElBQU0sb0NBQU4sTUFBa0Y7QUFBQSxFQXlJeEYsWUFDa0IscUJBQ0EsV0FDcUMscUNBQ25CLGtCQUNDLG1CQUNHLHNCQUNDLHVCQUN2QztBQVBnQjtBQUNBO0FBQ3FDO0FBQ25CO0FBQ0M7QUFDRztBQUNDO0FBOUl6QyxTQUFRLGdCQUFnQjtBQUN4QixTQUFpQixlQUFlLGdCQUF3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
