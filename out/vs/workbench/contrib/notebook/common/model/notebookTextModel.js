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
import { LcsDiff } from "../../../../../base/common/diff/diff.js";
import { Emitter, PauseableEmitter } from "../../../../../base/common/event.js";
import { hash } from "../../../../../base/common/hash.js";
import { Disposable, dispose } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { filter } from "../../../../../base/common/objects.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { hasKey, isDefined } from "../../../../../base/common/types.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { TextModel } from "../../../../../editor/common/model/textModel.js";
import { SearchParams } from "../../../../../editor/common/model/textModelSearch.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { IUndoRedoService, UndoRedoElementType } from "../../../../../platform/undoRedo/common/undoRedo.js";
import { ILanguageDetectionService } from "../../../../services/languageDetection/common/languageDetectionWorkerService.js";
import { SnapshotContext } from "../../../../services/workingCopy/common/fileWorkingCopy.js";
import { CellEditType, CellUri, diff, NotebookCellExecutionState, NotebookCellsChangeType } from "../notebookCommon.js";
import { INotebookExecutionStateService } from "../notebookExecutionStateService.js";
import { INotebookLoggingService } from "../notebookLoggingService.js";
import { CellMetadataEdit, MoveCellEdit, SpliceCellsEdit } from "./cellEdit.js";
import { NotebookCellOutputTextModel } from "./notebookCellOutputTextModel.js";
import { NotebookCellTextModel } from "./notebookCellTextModel.js";
class StackOperation {
  constructor(textModel, undoRedoGroup, _pauseableEmitter, _postUndoRedo, selectionState, beginAlternativeVersionId) {
    this.textModel = textModel;
    this.undoRedoGroup = undoRedoGroup;
    this._pauseableEmitter = _pauseableEmitter;
    this._postUndoRedo = _postUndoRedo;
    this.tag = "notebookUndoRedoElement";
    this._operations = [];
    this._beginSelectionState = void 0;
    this._resultSelectionState = void 0;
    this.type = UndoRedoElementType.Workspace;
    this._beginSelectionState = selectionState;
    this._beginAlternativeVersionId = beginAlternativeVersionId;
    this._resultAlternativeVersionId = beginAlternativeVersionId;
  }
  get code() {
    return this._operations.length === 1 ? this._operations[0].code : "undoredo.notebooks.stackOperation";
  }
  get label() {
    return this._operations.length === 1 ? this._operations[0].label : "edit";
  }
  get resources() {
    return [this.textModel.uri];
  }
  get isEmpty() {
    return this._operations.length === 0;
  }
  pushEndState(alternativeVersionId, selectionState) {
    this._resultAlternativeVersionId = alternativeVersionId;
    this._resultSelectionState = selectionState || this._resultSelectionState;
  }
  pushEditOperation(element, beginSelectionState, resultSelectionState, alternativeVersionId) {
    if (this._operations.length === 0) {
      this._beginSelectionState = this._beginSelectionState ?? beginSelectionState;
    }
    this._operations.push(element);
    this._resultSelectionState = resultSelectionState;
    this._resultAlternativeVersionId = alternativeVersionId;
  }
  async undo() {
    this._pauseableEmitter.pause();
    try {
      for (let i = this._operations.length - 1; i >= 0; i--) {
        await this._operations[i].undo();
      }
      this._postUndoRedo(this._beginAlternativeVersionId);
      this._pauseableEmitter.fire({
        rawEvents: [],
        synchronous: void 0,
        versionId: this.textModel.versionId,
        endSelectionState: this._beginSelectionState
      });
    } finally {
      this._pauseableEmitter.resume();
    }
  }
  async redo() {
    this._pauseableEmitter.pause();
    try {
      for (let i = 0; i < this._operations.length; i++) {
        await this._operations[i].redo();
      }
      this._postUndoRedo(this._resultAlternativeVersionId);
      this._pauseableEmitter.fire({
        rawEvents: [],
        synchronous: void 0,
        versionId: this.textModel.versionId,
        endSelectionState: this._resultSelectionState
      });
    } finally {
      this._pauseableEmitter.resume();
    }
  }
}
class NotebookOperationManager {
  constructor(_textModel, _undoService, _pauseableEmitter, _postUndoRedo) {
    this._textModel = _textModel;
    this._undoService = _undoService;
    this._pauseableEmitter = _pauseableEmitter;
    this._postUndoRedo = _postUndoRedo;
    this._pendingStackOperation = null;
    this._isAppending = false;
  }
  isUndoStackEmpty() {
    return this._pendingStackOperation === null || this._pendingStackOperation.isEmpty;
  }
  pushStackElement(alternativeVersionId, selectionState) {
    if (this._pendingStackOperation && !this._pendingStackOperation.isEmpty) {
      this._pendingStackOperation.pushEndState(alternativeVersionId, selectionState);
      if (!this._isAppending) {
        this._undoService.pushElement(this._pendingStackOperation, this._pendingStackOperation.undoRedoGroup);
      }
    }
    this._isAppending = false;
    this._pendingStackOperation = null;
  }
  _getOrCreateEditStackElement(beginSelectionState, undoRedoGroup, alternativeVersionId) {
    return this._pendingStackOperation ??= new StackOperation(this._textModel, undoRedoGroup, this._pauseableEmitter, this._postUndoRedo, beginSelectionState, alternativeVersionId || "");
  }
  appendPreviousOperation() {
    const previous = this._undoService.getLastElement(this._textModel.uri);
    if (previous && previous.tag === "notebookUndoRedoElement") {
      this._pendingStackOperation = previous;
      this._isAppending = true;
      return true;
    }
    return false;
  }
  pushEditOperation(element, beginSelectionState, resultSelectionState, alternativeVersionId, undoRedoGroup) {
    const pendingStackOperation = this._getOrCreateEditStackElement(beginSelectionState, undoRedoGroup, alternativeVersionId);
    pendingStackOperation.pushEditOperation(element, beginSelectionState, resultSelectionState, alternativeVersionId);
  }
}
class NotebookEventEmitter extends PauseableEmitter {
  get isEmpty() {
    return this._eventQueue.isEmpty();
  }
  isDirtyEvent() {
    for (const e of this._eventQueue) {
      for (let i = 0; i < e.rawEvents.length; i++) {
        if (!e.rawEvents[i].transient) {
          return true;
        }
      }
    }
    return false;
  }
}
let NotebookTextModel = class extends Disposable {
  constructor(viewType, uri, cells, metadata, options, _undoService, _modelService, _languageService, _languageDetectionService, _notebookExecutionStateService, _notebookLoggingService) {
    super();
    this.viewType = viewType;
    this.uri = uri;
    this._undoService = _undoService;
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._languageDetectionService = _languageDetectionService;
    this._notebookExecutionStateService = _notebookExecutionStateService;
    this._notebookLoggingService = _notebookLoggingService;
    this._isDisposed = false;
    this._onWillDispose = this._register(new Emitter());
    this._onWillAddRemoveCells = this._register(new Emitter());
    this._onDidChangeContent = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this.onWillAddRemoveCells = this._onWillAddRemoveCells.event;
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._cellhandlePool = 0;
    this._cellListeners = /* @__PURE__ */ new Map();
    this._cells = [];
    this.metadata = {};
    this.transientOptions = { transientCellMetadata: {}, transientDocumentMetadata: {}, transientOutputs: false, cellContentMetadata: {} };
    this._versionId = 0;
    /**
     * This alternative id is only for non-cell-content changes.
     */
    this._notebookSpecificAlternativeId = 0;
    /**
     * Unlike, versionId, this can go down (via undo) or go to previous values (via redo)
     */
    this._alternativeVersionId = "1";
    this.newCellsFromLastEdit = /* @__PURE__ */ new Set();
    this.transientOptions = options;
    this.metadata = metadata;
    this._initialize(cells);
    const maybeUpdateCellTextModel = (textModel) => {
      if (textModel.uri.scheme === Schemas.vscodeNotebookCell && textModel instanceof TextModel) {
        const cellUri = CellUri.parse(textModel.uri);
        if (cellUri && isEqual(cellUri.notebook, this.uri)) {
          const cellIdx = this._getCellIndexByHandle(cellUri.handle);
          if (cellIdx >= 0) {
            const cell = this.cells[cellIdx];
            if (cell) {
              cell.textModel = textModel;
            }
          }
        }
      }
    };
    this._register(_modelService.onModelAdded((e) => maybeUpdateCellTextModel(e)));
    this._pauseableEmitter = this._register(new NotebookEventEmitter({
      merge: (events) => {
        const first = events[0];
        const rawEvents = first.rawEvents;
        let versionId = first.versionId;
        let endSelectionState = first.endSelectionState;
        let synchronous = first.synchronous;
        for (let i = 1; i < events.length; i++) {
          rawEvents.push(...events[i].rawEvents);
          versionId = events[i].versionId;
          endSelectionState = events[i].endSelectionState !== void 0 ? events[i].endSelectionState : endSelectionState;
          synchronous = events[i].synchronous !== void 0 ? events[i].synchronous : synchronous;
        }
        return { rawEvents, versionId, endSelectionState, synchronous };
      }
    }));
    this._register(this._pauseableEmitter.event((e) => {
      if (e.rawEvents.length) {
        this._onDidChangeContent.fire(e);
      }
    }));
    this._operationManager = new NotebookOperationManager(
      this,
      this._undoService,
      this._pauseableEmitter,
      (alternativeVersionId) => {
        this._increaseVersionId(true);
        this._overwriteAlternativeVersionId(alternativeVersionId);
      }
    );
    this._notebookLoggingService.trace("notebookTextModel", `Initialized notebook text model for ${uri.toString()}`);
  }
  get length() {
    return this._cells.length;
  }
  get cells() {
    return this._cells;
  }
  get versionId() {
    return this._versionId;
  }
  get alternativeVersionId() {
    return this._alternativeVersionId;
  }
  get notebookType() {
    return this.viewType;
  }
  setCellCollapseDefault(collapseConfig) {
    this._defaultCollapseConfig = collapseConfig;
  }
  _initialize(cells, triggerDirty) {
    this._cells = [];
    this._versionId = 0;
    this._notebookSpecificAlternativeId = 0;
    const mainCells = cells.map((cell) => {
      const cellHandle = this._cellhandlePool++;
      const cellUri = CellUri.generate(this.uri, cellHandle);
      return new NotebookCellTextModel(
        cellUri,
        cellHandle,
        cell,
        this.transientOptions,
        this._languageService,
        this._modelService.getCreationOptions(cell.language, cellUri, false).defaultEOL,
        this._defaultCollapseConfig,
        this._languageDetectionService,
        this._notebookLoggingService
      );
    });
    for (let i = 0; i < mainCells.length; i++) {
      const dirtyStateListener = mainCells[i].onDidChangeContent((e) => {
        this._bindCellContentHandler(mainCells[i], e);
      });
      this._cellListeners.set(mainCells[i].handle, dirtyStateListener);
      this._register(mainCells[i]);
    }
    this._cells.splice(0, 0, ...mainCells);
    this._alternativeVersionId = this._generateAlternativeId();
    if (triggerDirty) {
      this._pauseableEmitter.fire({
        rawEvents: [{ kind: NotebookCellsChangeType.Unknown, transient: false }],
        versionId: this.versionId,
        synchronous: true,
        endSelectionState: void 0
      });
    }
  }
  _bindCellContentHandler(cell, e) {
    this._increaseVersionId(e === "content" || typeof e === "object" && e.type === "model");
    switch (e) {
      case "content":
        this._pauseableEmitter.fire({
          rawEvents: [{ kind: NotebookCellsChangeType.ChangeCellContent, index: this._getCellIndexByHandle(cell.handle), transient: false }],
          versionId: this.versionId,
          synchronous: true,
          endSelectionState: void 0
        });
        break;
      case "language":
        this._pauseableEmitter.fire({
          rawEvents: [{ kind: NotebookCellsChangeType.ChangeCellLanguage, index: this._getCellIndexByHandle(cell.handle), language: cell.language, transient: false }],
          versionId: this.versionId,
          synchronous: true,
          endSelectionState: void 0
        });
        break;
      case "mime":
        this._pauseableEmitter.fire({
          rawEvents: [{ kind: NotebookCellsChangeType.ChangeCellMime, index: this._getCellIndexByHandle(cell.handle), mime: cell.mime, transient: false }],
          versionId: this.versionId,
          synchronous: true,
          endSelectionState: void 0
        });
        break;
      default:
        if (typeof e === "object" && e.type === "model") {
          this._pauseableEmitter.fire({
            rawEvents: [{ kind: NotebookCellsChangeType.ChangeCellContent, index: this._getCellIndexByHandle(cell.handle), transient: false }],
            versionId: this.versionId,
            synchronous: true,
            endSelectionState: void 0
          });
        }
        break;
    }
  }
  _generateAlternativeId() {
    return `${this._notebookSpecificAlternativeId}_` + this.cells.map((cell) => cell.handle + "," + cell.alternativeId).join(";");
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._onWillDispose.fire();
    this._undoService.removeElements(this.uri);
    dispose(this._cellListeners.values());
    this._cellListeners.clear();
    dispose(this._cells);
    this._cells = [];
    super.dispose();
  }
  pushStackElement() {
  }
  _getCellIndexByHandle(handle) {
    return this.cells.findIndex((c) => c.handle === handle);
  }
  _getCellIndexWithOutputIdHandleFromEdits(outputId, rawEdits) {
    const edit = rawEdits.find((e) => hasKey(e, { outputs: true }) && e.outputs.some((o) => o.outputId === outputId));
    if (edit) {
      if (hasKey(edit, { index: true })) {
        return edit.index;
      } else if (hasKey(edit, { handle: true })) {
        const cellIndex = this._getCellIndexByHandle(edit.handle);
        this._assertIndex(cellIndex);
        return cellIndex;
      }
    }
    return -1;
  }
  _getCellIndexWithOutputIdHandle(outputId) {
    return this.cells.findIndex((c) => !!c.outputs.find((o) => o.outputId === outputId));
  }
  reset(cells, metadata, transientOptions) {
    this.transientOptions = transientOptions;
    const executions = this._notebookExecutionStateService.getCellExecutionsForNotebook(this.uri);
    const executingCellHandles = executions.filter((exe) => exe.state === NotebookCellExecutionState.Executing).map((exe) => exe.cellHandle);
    const edits = NotebookTextModel.computeEdits(this, cells, executingCellHandles);
    this.applyEdits(
      [
        ...edits,
        { editType: CellEditType.DocumentMetadata, metadata }
      ],
      true,
      void 0,
      () => void 0,
      void 0,
      false
    );
  }
  createSnapshot(options) {
    const transientOptions = options.transientOptions ?? this.transientOptions;
    const data = {
      metadata: filter(this.metadata, (key) => !transientOptions.transientDocumentMetadata[key]),
      cells: []
    };
    let outputSize = 0;
    for (const cell of this.cells) {
      const cellData = {
        cellKind: cell.cellKind,
        language: cell.language,
        mime: cell.mime,
        source: cell.getValue(),
        outputs: [],
        internalMetadata: cell.internalMetadata
      };
      if (options.context === SnapshotContext.Backup && options.outputSizeLimit > 0) {
        cell.outputs.forEach((output) => {
          output.outputs.forEach((item) => {
            outputSize += item.data.byteLength;
          });
        });
        if (outputSize > options.outputSizeLimit) {
          throw new Error("Notebook too large to backup");
        }
      }
      cellData.outputs = !transientOptions.transientOutputs ? cell.outputs : [];
      cellData.metadata = filter(cell.metadata, (key) => !transientOptions.transientCellMetadata[key]);
      data.cells.push(cellData);
    }
    return data;
  }
  restoreSnapshot(snapshot, transientOptions) {
    this.reset(snapshot.cells, snapshot.metadata, transientOptions ?? this.transientOptions);
  }
  static computeEdits(model, cells, executingHandles = []) {
    const edits = [];
    const isExecuting = (cell) => executingHandles.includes(cell.handle);
    const commonPrefix = this._commonPrefix(model.cells, model.cells.length, 0, cells, cells.length, 0, isExecuting);
    if (commonPrefix > 0) {
      for (let i = 0; i < commonPrefix; i++) {
        edits.push(
          {
            editType: CellEditType.Metadata,
            index: i,
            metadata: cells[i].metadata ?? {}
          },
          ...this._computeOutputEdit(i, model.cells[i].outputs, cells[i].outputs)
        );
      }
    }
    if (model.cells.length === cells.length && commonPrefix === model.cells.length) {
      return edits;
    }
    const commonSuffix = this._commonSuffix(model.cells, model.cells.length - commonPrefix, commonPrefix, cells, cells.length - commonPrefix, commonPrefix, isExecuting);
    if (commonSuffix > 0) {
      edits.push({ editType: CellEditType.Replace, index: commonPrefix, count: model.cells.length - commonPrefix - commonSuffix, cells: cells.slice(commonPrefix, cells.length - commonSuffix) });
    } else if (commonPrefix > 0) {
      edits.push({ editType: CellEditType.Replace, index: commonPrefix, count: model.cells.length - commonPrefix, cells: cells.slice(commonPrefix) });
    } else {
      edits.push({ editType: CellEditType.Replace, index: 0, count: model.cells.length, cells });
    }
    if (commonSuffix > 0) {
      for (let i = commonSuffix; i > 0; i--) {
        edits.push(
          {
            editType: CellEditType.Metadata,
            index: model.cells.length - i,
            metadata: cells[cells.length - i].metadata ?? {}
          },
          ...this._computeOutputEdit(model.cells.length - i, model.cells[model.cells.length - i].outputs, cells[cells.length - i].outputs)
        );
      }
    }
    return edits;
  }
  static _computeOutputEdit(index, a, b) {
    if (a.length !== b.length) {
      return [
        {
          editType: CellEditType.Output,
          index,
          outputs: b,
          append: false
        }
      ];
    }
    if (a.length === 0) {
      return [];
    }
    return b.map((output, i) => {
      return {
        editType: CellEditType.OutputItems,
        outputId: a[i].outputId,
        items: output.outputs,
        append: false
      };
    });
  }
  static _commonPrefix(a, aLen, aDelta, b, bLen, bDelta, isExecuting) {
    const maxResult = Math.min(aLen, bLen);
    let result = 0;
    for (let i = 0; i < maxResult && a[aDelta + i].fastEqual(b[bDelta + i], isExecuting(a[aDelta + i])); i++) {
      result++;
    }
    return result;
  }
  static _commonSuffix(a, aLen, aDelta, b, bLen, bDelta, isExecuting) {
    const maxResult = Math.min(aLen, bLen);
    let result = 0;
    for (let i = 0; i < maxResult && a[aDelta + aLen - i - 1].fastEqual(b[bDelta + bLen - i - 1], isExecuting(a[aDelta + aLen - i - 1])); i++) {
      result++;
    }
    return result;
  }
  isOnlyEditingMetadataOnNewCells(rawEdits) {
    for (const edit of rawEdits) {
      if (edit.editType === CellEditType.PartialInternalMetadata) {
        continue;
      }
      if (edit.editType !== CellEditType.Metadata && edit.editType !== CellEditType.PartialMetadata) {
        return false;
      }
      if (hasKey(edit, { index: true }) && !this.newCellsFromLastEdit.has(this.cells[edit.index].handle)) {
        return false;
      }
      if (hasKey(edit, { handle: true }) && !this.newCellsFromLastEdit.has(edit.handle)) {
        return false;
      }
    }
    return true;
  }
  applyEdits(rawEdits, synchronous, beginSelectionState, endSelectionsComputer, undoRedoGroup, computeUndoRedo) {
    this._notebookLoggingService.trace("textModelEdits", `Begin applying ${rawEdits.length} raw edits`);
    this._pauseableEmitter.pause();
    try {
      this._operationManager.pushStackElement(this._alternativeVersionId, void 0);
      if (computeUndoRedo && this.isOnlyEditingMetadataOnNewCells(rawEdits)) {
        if (!this._operationManager.appendPreviousOperation()) {
          computeUndoRedo = false;
        }
      } else if (computeUndoRedo) {
        this.newCellsFromLastEdit.clear();
      }
      try {
        this._doApplyEdits(rawEdits, synchronous, computeUndoRedo, beginSelectionState, undoRedoGroup);
        return true;
      } catch (err) {
        this._notebookLoggingService.error("textModelEdits", `Error while applying edits: ${err}`);
        throw err;
      } finally {
        if (!this._pauseableEmitter.isEmpty) {
          const endSelections = endSelectionsComputer();
          this._increaseVersionId(this._operationManager.isUndoStackEmpty() && !this._pauseableEmitter.isDirtyEvent());
          this._operationManager.pushStackElement(this._alternativeVersionId, endSelections);
          this._pauseableEmitter.fire({ rawEvents: [], versionId: this.versionId, synchronous, endSelectionState: endSelections });
          this._notebookLoggingService.trace("textModelEdits", `End applying ${rawEdits.length} raw edits`);
        }
      }
    } finally {
      this._pauseableEmitter.resume();
    }
  }
  _doApplyEdits(rawEdits, synchronous, computeUndoRedo, beginSelectionState, undoRedoGroup) {
    const editsWithDetails = rawEdits.map((edit, index) => {
      let cellIndex = -1;
      if (hasKey(edit, { index: true })) {
        cellIndex = edit.index;
      } else if (hasKey(edit, { handle: true })) {
        cellIndex = this._getCellIndexByHandle(edit.handle);
        this._assertIndex(cellIndex, `editType: ${edit.editType}, key: handle`);
      } else if (hasKey(edit, { outputId: true })) {
        cellIndex = this._getCellIndexWithOutputIdHandle(edit.outputId);
        if (this._indexIsInvalid(cellIndex)) {
          cellIndex = this._getCellIndexWithOutputIdHandleFromEdits(edit.outputId, rawEdits.slice(0, index));
        }
        if (this._indexIsInvalid(cellIndex)) {
          return null;
        }
      } else if (edit.editType !== CellEditType.DocumentMetadata) {
        throw new Error("Invalid cell edit: " + JSON.stringify(edit));
      }
      return {
        edit,
        cellIndex,
        end: edit.editType === CellEditType.DocumentMetadata ? void 0 : edit.editType === CellEditType.Replace ? edit.index + edit.count : cellIndex,
        originalIndex: index
      };
    }).filter(isDefined);
    const edits = this._mergeCellEdits(editsWithDetails).sort((a, b) => {
      if (a.end === void 0) {
        return -1;
      }
      if (b.end === void 0) {
        return 1;
      }
      return b.end - a.end || b.originalIndex - a.originalIndex;
    }).reduce((prev, curr) => {
      if (!prev.length) {
        prev.push([curr]);
      } else {
        const last = prev[prev.length - 1];
        const index = last[0].cellIndex;
        if (curr.cellIndex === index) {
          last.push(curr);
        } else {
          prev.push([curr]);
        }
      }
      return prev;
    }, []).map((editsOnSameIndex) => {
      const replaceEdits = [];
      const otherEdits = [];
      editsOnSameIndex.forEach((edit) => {
        if (edit.edit.editType === CellEditType.Replace) {
          replaceEdits.push(edit);
        } else {
          otherEdits.push(edit);
        }
      });
      return [...otherEdits.reverse(), ...replaceEdits];
    });
    const flattenEdits = edits.flat();
    for (const { edit, cellIndex } of flattenEdits) {
      switch (edit.editType) {
        case CellEditType.Replace:
          this._replaceCells(edit.index, edit.count, edit.cells, synchronous, computeUndoRedo, beginSelectionState, undoRedoGroup);
          break;
        case CellEditType.Output: {
          this._assertIndex(cellIndex);
          const cell = this._cells[cellIndex];
          if (edit.append) {
            this._spliceNotebookCellOutputs(cell, { start: cell.outputs.length, deleteCount: 0, newOutputs: edit.outputs.map((op) => new NotebookCellOutputTextModel(op)) }, true, computeUndoRedo);
          } else {
            this._spliceNotebookCellOutputs2(cell, edit.outputs, computeUndoRedo);
          }
          break;
        }
        case CellEditType.OutputItems:
          {
            this._assertIndex(cellIndex);
            const cell = this._cells[cellIndex];
            if (edit.append) {
              this._appendNotebookCellOutputItems(cell, edit.outputId, edit.items);
            } else {
              this._replaceNotebookCellOutputItems(cell, edit.outputId, edit.items);
            }
          }
          break;
        case CellEditType.Metadata:
          this._assertIndex(edit.index);
          this._changeCellMetadata(this._cells[edit.index], edit.metadata, computeUndoRedo, beginSelectionState, undoRedoGroup);
          break;
        case CellEditType.PartialMetadata:
          this._assertIndex(cellIndex);
          this._changeCellMetadataPartial(this._cells[cellIndex], edit.metadata, computeUndoRedo, beginSelectionState, undoRedoGroup);
          break;
        case CellEditType.PartialInternalMetadata:
          this._assertIndex(cellIndex);
          this._changeCellInternalMetadataPartial(this._cells[cellIndex], edit.internalMetadata);
          break;
        case CellEditType.CellLanguage:
          this._assertIndex(edit.index);
          this._changeCellLanguage(this._cells[edit.index], edit.language, computeUndoRedo, beginSelectionState, undoRedoGroup);
          break;
        case CellEditType.DocumentMetadata:
          this._updateNotebookCellMetadata(edit.metadata, computeUndoRedo, beginSelectionState, undoRedoGroup);
          break;
        case CellEditType.Move:
          this._moveCellToIdx(edit.index, edit.length, edit.newIdx, synchronous, computeUndoRedo, beginSelectionState, void 0, undoRedoGroup);
          break;
      }
    }
  }
  _mergeCellEdits(rawEdits) {
    const mergedEdits = [];
    rawEdits.forEach((edit) => {
      if (mergedEdits.length) {
        const last = mergedEdits[mergedEdits.length - 1];
        if (last.edit.editType === CellEditType.Output && last.edit.append && edit.edit.editType === CellEditType.Output && edit.edit.append && last.cellIndex === edit.cellIndex) {
          last.edit.outputs = [...last.edit.outputs, ...edit.edit.outputs];
        } else if (last.edit.editType === CellEditType.Output && !last.edit.append && last.edit.outputs.length === 0 && edit.edit.editType === CellEditType.Output && edit.edit.append && last.cellIndex === edit.cellIndex) {
          last.edit.append = false;
          last.edit.outputs = edit.edit.outputs;
        } else {
          mergedEdits.push(edit);
        }
      } else {
        mergedEdits.push(edit);
      }
    });
    return mergedEdits;
  }
  _replaceCells(index, count, cellDtos, synchronous, computeUndoRedo, beginSelectionState, undoRedoGroup) {
    if (count === 0 && cellDtos.length === 0) {
      return;
    }
    const oldViewCells = this._cells.slice(0);
    const oldSet = /* @__PURE__ */ new Set();
    oldViewCells.forEach((cell) => {
      oldSet.add(cell.handle);
    });
    for (let i = index; i < Math.min(index + count, this._cells.length); i++) {
      const cell = this._cells[i];
      this._cellListeners.get(cell.handle)?.dispose();
      this._cellListeners.delete(cell.handle);
    }
    const cells = cellDtos.map((cellDto) => {
      const cellHandle = this._cellhandlePool++;
      const cellUri = CellUri.generate(this.uri, cellHandle);
      if (!cellDto.outputs) {
        cellDto.outputs = [];
      }
      const cell = new NotebookCellTextModel(
        cellUri,
        cellHandle,
        cellDto,
        this.transientOptions,
        this._languageService,
        this._modelService.getCreationOptions(cellDto.language, cellUri, false).defaultEOL,
        this._defaultCollapseConfig,
        this._languageDetectionService,
        this._notebookLoggingService
      );
      const textModel = this._modelService.getModel(cellUri);
      if (textModel && textModel instanceof TextModel) {
        cell.textModel = textModel;
        cell.language = cellDto.language;
        cell.textModel.setValue(cellDto.source);
        cell.resetTextBuffer(cell.textModel.getTextBuffer());
      }
      const dirtyStateListener = cell.onDidChangeContent((e) => {
        this._bindCellContentHandler(cell, e);
      });
      this.newCellsFromLastEdit.add(cell.handle);
      this._cellListeners.set(cell.handle, dirtyStateListener);
      this._register(cell);
      return cell;
    });
    const cellsCopy = this._cells.slice(0);
    cellsCopy.splice(index, count, ...cells);
    const diffs = diff(this._cells, cellsCopy, (cell) => {
      return oldSet.has(cell.handle);
    }).map((diff2) => {
      return [diff2.start, diff2.deleteCount, diff2.toInsert];
    });
    this._onWillAddRemoveCells.fire({ rawEvent: { kind: NotebookCellsChangeType.ModelChange, changes: diffs } });
    this._cells = cellsCopy;
    const undoDiff = diffs.map((diff2) => {
      const deletedCells = oldViewCells.slice(diff2[0], diff2[0] + diff2[1]);
      return [diff2[0], deletedCells, diff2[2]];
    });
    if (computeUndoRedo) {
      this._operationManager.pushEditOperation(new SpliceCellsEdit(this.uri, undoDiff, {
        insertCell: (index2, cell, endSelections) => {
          this._insertNewCell(index2, [cell], true, endSelections);
        },
        deleteCell: (index2, endSelections) => {
          this._removeCell(index2, 1, true, endSelections);
        },
        replaceCell: (index2, count2, cells2, endSelections) => {
          this._replaceNewCells(index2, count2, cells2, true, endSelections);
        }
      }, void 0, void 0), beginSelectionState, void 0, this._alternativeVersionId, undoRedoGroup);
    }
    this._pauseableEmitter.fire({
      rawEvents: [{ kind: NotebookCellsChangeType.ModelChange, changes: diffs, transient: false }],
      versionId: this.versionId,
      synchronous,
      endSelectionState: void 0
    });
  }
  _increaseVersionId(transient) {
    this._versionId = this._versionId + 1;
    if (!transient) {
      this._notebookSpecificAlternativeId = this._versionId;
    }
    this._alternativeVersionId = this._generateAlternativeId();
  }
  _overwriteAlternativeVersionId(newAlternativeVersionId) {
    this._alternativeVersionId = newAlternativeVersionId;
    this._notebookSpecificAlternativeId = Number(newAlternativeVersionId.substring(0, newAlternativeVersionId.indexOf("_")));
  }
  _updateNotebookCellMetadata(metadata, computeUndoRedo, beginSelectionState, undoRedoGroup) {
    const oldMetadata = this.metadata;
    const triggerDirtyChange = this._isDocumentMetadataChanged(this.metadata, metadata);
    if (triggerDirtyChange) {
      if (computeUndoRedo) {
        const that = this;
        this._operationManager.pushEditOperation(new class {
          constructor() {
            this.type = UndoRedoElementType.Resource;
            this.label = "Update Cell Metadata";
            this.code = "undoredo.textBufferEdit";
          }
          get resource() {
            return that.uri;
          }
          undo() {
            that._updateNotebookCellMetadata(oldMetadata, false, beginSelectionState, undoRedoGroup);
          }
          redo() {
            that._updateNotebookCellMetadata(metadata, false, beginSelectionState, undoRedoGroup);
          }
        }(), beginSelectionState, void 0, this._alternativeVersionId, undoRedoGroup);
      }
    }
    this.metadata = metadata;
    this._pauseableEmitter.fire({
      rawEvents: [{ kind: NotebookCellsChangeType.ChangeDocumentMetadata, metadata: this.metadata, transient: !triggerDirtyChange }],
      versionId: this.versionId,
      synchronous: true,
      endSelectionState: void 0
    });
  }
  _insertNewCell(index, cells, synchronous, endSelections) {
    for (let i = 0; i < cells.length; i++) {
      const dirtyStateListener = cells[i].onDidChangeContent((e) => {
        this._bindCellContentHandler(cells[i], e);
      });
      this._cellListeners.set(cells[i].handle, dirtyStateListener);
    }
    const changes = [[index, 0, cells]];
    this._onWillAddRemoveCells.fire({ rawEvent: { kind: NotebookCellsChangeType.ModelChange, changes } });
    this._cells.splice(index, 0, ...cells);
    this._pauseableEmitter.fire({
      rawEvents: [{ kind: NotebookCellsChangeType.ModelChange, changes, transient: false }],
      versionId: this.versionId,
      synchronous,
      endSelectionState: endSelections
    });
    return;
  }
  _removeCell(index, count, synchronous, endSelections) {
    for (let i = index; i < index + count; i++) {
      const cell = this._cells[i];
      this._cellListeners.get(cell.handle)?.dispose();
      this._cellListeners.delete(cell.handle);
    }
    const changes = [[index, count, []]];
    this._onWillAddRemoveCells.fire({ rawEvent: { kind: NotebookCellsChangeType.ModelChange, changes } });
    this._cells.splice(index, count);
    this._pauseableEmitter.fire({
      rawEvents: [{ kind: NotebookCellsChangeType.ModelChange, changes, transient: false }],
      versionId: this.versionId,
      synchronous,
      endSelectionState: endSelections
    });
  }
  _replaceNewCells(index, count, cells, synchronous, endSelections) {
    for (let i = index; i < index + count; i++) {
      const cell = this._cells[i];
      this._cellListeners.get(cell.handle)?.dispose();
      this._cellListeners.delete(cell.handle);
    }
    for (let i = 0; i < cells.length; i++) {
      const dirtyStateListener = cells[i].onDidChangeContent((e) => {
        this._bindCellContentHandler(cells[i], e);
      });
      this._cellListeners.set(cells[i].handle, dirtyStateListener);
    }
    const changes = [[index, count, cells]];
    this._onWillAddRemoveCells.fire({ rawEvent: { kind: NotebookCellsChangeType.ModelChange, changes } });
    this._cells.splice(index, count, ...cells);
    this._pauseableEmitter.fire({
      rawEvents: [{ kind: NotebookCellsChangeType.ModelChange, changes, transient: false }],
      versionId: this.versionId,
      synchronous,
      endSelectionState: endSelections
    });
  }
  _isDocumentMetadataChanged(a, b) {
    const keys = /* @__PURE__ */ new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const key of keys) {
      if (key === "custom") {
        if (!this._customMetadataEqual(a[key], b[key]) && !this.transientOptions.transientDocumentMetadata[key]) {
          return true;
        }
      } else if (a[key] !== b[key] && !this.transientOptions.transientDocumentMetadata[key]) {
        return true;
      }
    }
    return false;
  }
  _isCellMetadataChanged(a, b) {
    const keys = /* @__PURE__ */ new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const key of keys) {
      if (a[key] !== b[key] && !this.transientOptions.transientCellMetadata[key]) {
        return true;
      }
    }
    return false;
  }
  _customMetadataEqual(a, b) {
    if (!a && !b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    const aProps = Object.getOwnPropertyNames(a);
    const bProps = Object.getOwnPropertyNames(b);
    if (aProps.length !== bProps.length) {
      return false;
    }
    for (let i = 0; i < aProps.length; i++) {
      const propName = aProps[i];
      if (a[propName] !== b[propName]) {
        return false;
      }
    }
    return true;
  }
  _changeCellMetadataPartial(cell, metadata, computeUndoRedo, beginSelectionState, undoRedoGroup) {
    const newMetadata = {
      ...cell.metadata
    };
    let k;
    for (k in metadata) {
      const value = metadata[k] ?? void 0;
      newMetadata[k] = value;
    }
    return this._changeCellMetadata(cell, newMetadata, computeUndoRedo, beginSelectionState, undoRedoGroup);
  }
  _changeCellMetadata(cell, metadata, computeUndoRedo, beginSelectionState, undoRedoGroup) {
    const triggerDirtyChange = this._isCellMetadataChanged(cell.metadata, metadata);
    if (triggerDirtyChange) {
      if (computeUndoRedo) {
        const index = this._cells.indexOf(cell);
        this._operationManager.pushEditOperation(new CellMetadataEdit(this.uri, index, Object.freeze(cell.metadata), Object.freeze(metadata), {
          updateCellMetadata: (index2, newMetadata) => {
            const cell2 = this._cells[index2];
            if (!cell2) {
              return;
            }
            this._changeCellMetadata(cell2, newMetadata, false, beginSelectionState, undoRedoGroup);
          }
        }), beginSelectionState, void 0, this._alternativeVersionId, undoRedoGroup);
      }
    }
    cell.metadata = metadata;
    this._pauseableEmitter.fire({
      rawEvents: [{ kind: NotebookCellsChangeType.ChangeCellMetadata, index: this._cells.indexOf(cell), metadata: cell.metadata, transient: !triggerDirtyChange }],
      versionId: this.versionId,
      synchronous: true,
      endSelectionState: void 0
    });
  }
  _changeCellInternalMetadataPartial(cell, internalMetadata) {
    const newInternalMetadata = {
      ...cell.internalMetadata
    };
    let k;
    for (k in internalMetadata) {
      const value = internalMetadata[k] ?? void 0;
      newInternalMetadata[k] = value;
    }
    cell.internalMetadata = newInternalMetadata;
    this._pauseableEmitter.fire({
      rawEvents: [{ kind: NotebookCellsChangeType.ChangeCellInternalMetadata, index: this._cells.indexOf(cell), internalMetadata: cell.internalMetadata, transient: true }],
      versionId: this.versionId,
      synchronous: true,
      endSelectionState: void 0
    });
  }
  _changeCellLanguage(cell, languageId, computeUndoRedo, beginSelectionState, undoRedoGroup) {
    if (cell.language === languageId) {
      return;
    }
    const oldLanguage = cell.language;
    cell.language = languageId;
    if (computeUndoRedo) {
      const that = this;
      this._operationManager.pushEditOperation(new class {
        constructor() {
          this.type = UndoRedoElementType.Resource;
          this.label = "Update Cell Language";
          this.code = "undoredo.textBufferEdit";
        }
        get resource() {
          return that.uri;
        }
        undo() {
          that._changeCellLanguage(cell, oldLanguage, false, beginSelectionState, undoRedoGroup);
        }
        redo() {
          that._changeCellLanguage(cell, languageId, false, beginSelectionState, undoRedoGroup);
        }
      }(), beginSelectionState, void 0, this._alternativeVersionId, undoRedoGroup);
    }
    this._pauseableEmitter.fire({
      rawEvents: [{ kind: NotebookCellsChangeType.ChangeCellLanguage, index: this._cells.indexOf(cell), language: languageId, transient: false }],
      versionId: this.versionId,
      synchronous: true,
      endSelectionState: void 0
    });
  }
  _spliceNotebookCellOutputs2(cell, outputs, computeUndoRedo) {
    if (outputs.length === 0 && cell.outputs.length === 0) {
      return;
    }
    if (outputs.length <= 1) {
      this._spliceNotebookCellOutputs(cell, { start: 0, deleteCount: cell.outputs.length, newOutputs: outputs.map((op) => new NotebookCellOutputTextModel(op)) }, false, computeUndoRedo);
      return;
    }
    const diff2 = new LcsDiff(new OutputSequence(cell.outputs), new OutputSequence(outputs));
    const diffResult = diff2.ComputeDiff(false);
    const splices = diffResult.changes.map((change) => ({
      start: change.originalStart,
      deleteCount: change.originalLength,
      // create cell output text model only when it's inserted into the notebook document
      newOutputs: outputs.slice(change.modifiedStart, change.modifiedStart + change.modifiedLength).map((op) => new NotebookCellOutputTextModel(op))
    }));
    splices.reverse().forEach((splice) => {
      this._spliceNotebookCellOutputs(cell, splice, false, computeUndoRedo);
    });
  }
  _spliceNotebookCellOutputs(cell, splice, append, computeUndoRedo) {
    cell.spliceNotebookCellOutputs(splice);
    this._pauseableEmitter.fire({
      rawEvents: [{
        kind: NotebookCellsChangeType.Output,
        index: this._cells.indexOf(cell),
        outputs: cell.outputs.map((output) => output.asDto()) ?? [],
        append,
        transient: this.transientOptions.transientOutputs
      }],
      versionId: this.versionId,
      synchronous: true,
      endSelectionState: void 0
    });
  }
  _appendNotebookCellOutputItems(cell, outputId, items) {
    if (cell.changeOutputItems(outputId, true, items)) {
      this._pauseableEmitter.fire({
        rawEvents: [{
          kind: NotebookCellsChangeType.OutputItem,
          index: this._cells.indexOf(cell),
          outputId,
          outputItems: items,
          append: true,
          transient: this.transientOptions.transientOutputs
        }],
        versionId: this.versionId,
        synchronous: true,
        endSelectionState: void 0
      });
    }
  }
  _replaceNotebookCellOutputItems(cell, outputId, items) {
    if (cell.changeOutputItems(outputId, false, items)) {
      this._pauseableEmitter.fire({
        rawEvents: [{
          kind: NotebookCellsChangeType.OutputItem,
          index: this._cells.indexOf(cell),
          outputId,
          outputItems: items,
          append: false,
          transient: this.transientOptions.transientOutputs
        }],
        versionId: this.versionId,
        synchronous: true,
        endSelectionState: void 0
      });
    }
  }
  _moveCellToIdx(index, length, newIdx, synchronous, pushedToUndoStack, beforeSelections, endSelections, undoRedoGroup) {
    if (pushedToUndoStack) {
      this._operationManager.pushEditOperation(new MoveCellEdit(this.uri, index, length, newIdx, {
        moveCell: (fromIndex, length2, toIndex, beforeSelections2, endSelections2) => {
          this._moveCellToIdx(fromIndex, length2, toIndex, true, false, beforeSelections2, endSelections2, undoRedoGroup);
        }
      }, beforeSelections, endSelections), beforeSelections, endSelections, this._alternativeVersionId, undoRedoGroup);
    }
    this._assertIndex(index);
    this._assertIndex(newIdx);
    const cells = this._cells.splice(index, length);
    this._cells.splice(newIdx, 0, ...cells);
    this._pauseableEmitter.fire({
      rawEvents: [{ kind: NotebookCellsChangeType.Move, index, length, newIdx, cells, transient: false }],
      versionId: this.versionId,
      synchronous,
      endSelectionState: endSelections
    });
    return true;
  }
  _assertIndex(index, context) {
    if (this._indexIsInvalid(index)) {
      throw new Error(`model index out of range ${index} (cellCount: ${this._cells.length}${context ? `, ${context}` : ""})`);
    }
  }
  _indexIsInvalid(index) {
    return index < 0 || index >= this._cells.length;
  }
  //#region Find
  findNextMatch(searchString, searchStart, isRegex, matchCase, wordSeparators, searchEnd) {
    this._assertIndex(searchStart.cellIndex);
    const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
    const searchData = searchParams.parseSearchRequest();
    if (!searchData) {
      return null;
    }
    let cellIndex = searchStart.cellIndex;
    let searchStartPosition = searchStart.position;
    let searchEndCell = this._cells.length;
    while (cellIndex < searchEndCell) {
      const cell = this._cells[cellIndex];
      const wrapFlag = searchEnd && cellIndex === searchEnd.cellIndex && searchStartPosition.isBefore(searchEnd.position);
      const searchRange = new Range(
        searchStartPosition.lineNumber,
        searchStartPosition.column,
        wrapFlag ? searchEnd.position.lineNumber : cell.textBuffer.getLineCount(),
        wrapFlag ? searchEnd.position.column : cell.textBuffer.getLineMaxColumn(cell.textBuffer.getLineCount())
      );
      const result = cell.textBuffer.findMatchesLineByLine(searchRange, searchData, false, 1);
      if (result.length > 0) {
        return { cell, match: result[0] };
      } else if (wrapFlag) {
        break;
      }
      cellIndex++;
      if (searchEnd && cellIndex >= this._cells.length) {
        cellIndex = 0;
        searchEndCell = searchEnd.cellIndex + 1;
      }
      searchStartPosition = new Position(1, 1);
    }
    return null;
  }
  findMatches(searchString, isRegex, matchCase, wordSeparators) {
    const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
    const searchData = searchParams.parseSearchRequest();
    if (!searchData) {
      return [];
    }
    const results = [];
    for (const cell of this._cells) {
      const searchRange = new Range(1, 1, cell.textBuffer.getLineCount(), cell.textBuffer.getLineMaxColumn(cell.textBuffer.getLineCount()));
      const matches = cell.textBuffer.findMatchesLineByLine(searchRange, searchData, false, 1e3);
      if (matches.length > 0) {
        results.push({ cell, matches });
      }
    }
    return results;
  }
  //#endregion
};
NotebookTextModel = __decorateClass([
  __decorateParam(5, IUndoRedoService),
  __decorateParam(6, IModelService),
  __decorateParam(7, ILanguageService),
  __decorateParam(8, ILanguageDetectionService),
  __decorateParam(9, INotebookExecutionStateService),
  __decorateParam(10, INotebookLoggingService)
], NotebookTextModel);
class OutputSequence {
  constructor(outputs) {
    this.outputs = outputs;
  }
  getElements() {
    return this.outputs.map((output) => {
      return hash(output.outputs.map((output2) => ({
        mime: output2.mime,
        data: output2.data
      })));
    });
  }
}
export {
  NotebookTextModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxjb21tb25cXG1vZGVsXFxub3RlYm9va1RleHRNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElTZXF1ZW5jZSwgTGNzRGlmZiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RpZmYvZGlmZi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCwgUGF1c2VhYmxlRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGZpbHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBoYXNLZXksIGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgRmluZE1hdGNoLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBTZWFyY2hQYXJhbXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbFNlYXJjaC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlVW5kb1JlZG9FbGVtZW50LCBJVW5kb1JlZG9FbGVtZW50LCBJVW5kb1JlZG9TZXJ2aWNlLCBJV29ya3NwYWNlVW5kb1JlZG9FbGVtZW50LCBVbmRvUmVkb0VsZW1lbnRUeXBlLCBVbmRvUmVkb0dyb3VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZURldGVjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYW5ndWFnZURldGVjdGlvbi9jb21tb24vbGFuZ3VhZ2VEZXRlY3Rpb25Xb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNuYXBzaG90Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi9maWxlV29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlLCBDZWxsVXJpLCBkaWZmLCBJQ2VsbCwgSUNlbGxEdG8yLCBJQ2VsbEVkaXRPcGVyYXRpb24sIElDZWxsT3V0cHV0LCBJTm90ZWJvb2tTbmFwc2hvdE9wdGlvbnMsIElOb3RlYm9va1RleHRNb2RlbCwgSU91dHB1dER0bywgSU91dHB1dEl0ZW1EdG8sIElTZWxlY3Rpb25TdGF0ZSwgTm90ZWJvb2tDZWxsRGVmYXVsdENvbGxhcHNlQ29uZmlnLCBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZSwgTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSwgTm90ZWJvb2tDZWxsTWV0YWRhdGEsIE5vdGVib29rQ2VsbE91dHB1dHNTcGxpY2UsIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLCBOb3RlYm9va0NlbGxUZXh0TW9kZWxTcGxpY2UsIE5vdGVib29rRGF0YSwgTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhLCBOb3RlYm9va1RleHRNb2RlbENoYW5nZWRFdmVudCwgTm90ZWJvb2tUZXh0TW9kZWxXaWxsQWRkUmVtb3ZlRXZlbnQsIE51bGxhYmxlUGFydGlhbE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGEsIE51bGxhYmxlUGFydGlhbE5vdGVib29rQ2VsbE1ldGFkYXRhLCBUcmFuc2llbnRPcHRpb25zIH0gZnJvbSAnLi4vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UgfSBmcm9tICcuLi9ub3RlYm9va0xvZ2dpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENlbGxNZXRhZGF0YUVkaXQsIE1vdmVDZWxsRWRpdCwgU3BsaWNlQ2VsbHNFZGl0IH0gZnJvbSAnLi9jZWxsRWRpdC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxPdXRwdXRUZXh0TW9kZWwgfSBmcm9tICcuL25vdGVib29rQ2VsbE91dHB1dFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxUZXh0TW9kZWwgfSBmcm9tICcuL25vdGVib29rQ2VsbFRleHRNb2RlbC5qcyc7XG5cbmNsYXNzIFN0YWNrT3BlcmF0aW9uIGltcGxlbWVudHMgSVdvcmtzcGFjZVVuZG9SZWRvRWxlbWVudCB7XG5cdHR5cGU6IFVuZG9SZWRvRWxlbWVudFR5cGUuV29ya3NwYWNlO1xuXHR0YWcgPSAnbm90ZWJvb2tVbmRvUmVkb0VsZW1lbnQnO1xuXG5cdHB1YmxpYyBnZXQgY29kZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fb3BlcmF0aW9ucy5sZW5ndGggPT09IDEgPyB0aGlzLl9vcGVyYXRpb25zWzBdLmNvZGUgOiAndW5kb3JlZG8ubm90ZWJvb2tzLnN0YWNrT3BlcmF0aW9uJztcblx0fVxuXG5cdHByaXZhdGUgX29wZXJhdGlvbnM6IElVbmRvUmVkb0VsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIF9iZWdpblNlbGVjdGlvblN0YXRlOiBJU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Jlc3VsdFNlbGVjdGlvblN0YXRlOiBJU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2JlZ2luQWx0ZXJuYXRpdmVWZXJzaW9uSWQ6IHN0cmluZztcblx0cHJpdmF0ZSBfcmVzdWx0QWx0ZXJuYXRpdmVWZXJzaW9uSWQ6IHN0cmluZztcblx0cHVibGljIGdldCBsYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fb3BlcmF0aW9ucy5sZW5ndGggPT09IDEgPyB0aGlzLl9vcGVyYXRpb25zWzBdLmxhYmVsIDogJ2VkaXQnO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgdGV4dE1vZGVsOiBOb3RlYm9va1RleHRNb2RlbCxcblx0XHRyZWFkb25seSB1bmRvUmVkb0dyb3VwOiBVbmRvUmVkb0dyb3VwIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BhdXNlYWJsZUVtaXR0ZXI6IFBhdXNlYWJsZUVtaXR0ZXI8Tm90ZWJvb2tUZXh0TW9kZWxDaGFuZ2VkRXZlbnQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Bvc3RVbmRvUmVkbzogKGFsdGVybmF0aXZlVmVyc2lvbklkOiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0c2VsZWN0aW9uU3RhdGU6IElTZWxlY3Rpb25TdGF0ZSB8IHVuZGVmaW5lZCxcblx0XHRiZWdpbkFsdGVybmF0aXZlVmVyc2lvbklkOiBzdHJpbmdcblx0KSB7XG5cdFx0dGhpcy50eXBlID0gVW5kb1JlZG9FbGVtZW50VHlwZS5Xb3Jrc3BhY2U7XG5cdFx0dGhpcy5fYmVnaW5TZWxlY3Rpb25TdGF0ZSA9IHNlbGVjdGlvblN0YXRlO1xuXHRcdHRoaXMuX2JlZ2luQWx0ZXJuYXRpdmVWZXJzaW9uSWQgPSBiZWdpbkFsdGVybmF0aXZlVmVyc2lvbklkO1xuXHRcdHRoaXMuX3Jlc3VsdEFsdGVybmF0aXZlVmVyc2lvbklkID0gYmVnaW5BbHRlcm5hdGl2ZVZlcnNpb25JZDtcblx0fVxuXHRnZXQgcmVzb3VyY2VzKCk6IHJlYWRvbmx5IFVSSVtdIHtcblx0XHRyZXR1cm4gW3RoaXMudGV4dE1vZGVsLnVyaV07XG5cdH1cblxuXHRnZXQgaXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fb3BlcmF0aW9ucy5sZW5ndGggPT09IDA7XG5cdH1cblxuXHRwdXNoRW5kU3RhdGUoYWx0ZXJuYXRpdmVWZXJzaW9uSWQ6IHN0cmluZywgc2VsZWN0aW9uU3RhdGU6IElTZWxlY3Rpb25TdGF0ZSB8IHVuZGVmaW5lZCkge1xuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDc1MjNcblx0XHR0aGlzLl9yZXN1bHRBbHRlcm5hdGl2ZVZlcnNpb25JZCA9IGFsdGVybmF0aXZlVmVyc2lvbklkO1xuXHRcdHRoaXMuX3Jlc3VsdFNlbGVjdGlvblN0YXRlID0gc2VsZWN0aW9uU3RhdGUgfHwgdGhpcy5fcmVzdWx0U2VsZWN0aW9uU3RhdGU7XG5cdH1cblxuXHRwdXNoRWRpdE9wZXJhdGlvbihlbGVtZW50OiBJVW5kb1JlZG9FbGVtZW50LCBiZWdpblNlbGVjdGlvblN0YXRlOiBJU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQsIHJlc3VsdFNlbGVjdGlvblN0YXRlOiBJU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQsIGFsdGVybmF0aXZlVmVyc2lvbklkOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5fb3BlcmF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2JlZ2luU2VsZWN0aW9uU3RhdGUgPSB0aGlzLl9iZWdpblNlbGVjdGlvblN0YXRlID8/IGJlZ2luU2VsZWN0aW9uU3RhdGU7XG5cdFx0fVxuXHRcdHRoaXMuX29wZXJhdGlvbnMucHVzaChlbGVtZW50KTtcblx0XHR0aGlzLl9yZXN1bHRTZWxlY3Rpb25TdGF0ZSA9IHJlc3VsdFNlbGVjdGlvblN0YXRlO1xuXHRcdHRoaXMuX3Jlc3VsdEFsdGVybmF0aXZlVmVyc2lvbklkID0gYWx0ZXJuYXRpdmVWZXJzaW9uSWQ7XG5cdH1cblxuXHRhc3luYyB1bmRvKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3BhdXNlYWJsZUVtaXR0ZXIucGF1c2UoKTtcblx0XHR0cnkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IHRoaXMuX29wZXJhdGlvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fb3BlcmF0aW9uc1tpXS51bmRvKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wb3N0VW5kb1JlZG8odGhpcy5fYmVnaW5BbHRlcm5hdGl2ZVZlcnNpb25JZCk7XG5cdFx0XHR0aGlzLl9wYXVzZWFibGVFbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRyYXdFdmVudHM6IFtdLFxuXHRcdFx0XHRzeW5jaHJvbm91czogdW5kZWZpbmVkLFxuXHRcdFx0XHR2ZXJzaW9uSWQ6IHRoaXMudGV4dE1vZGVsLnZlcnNpb25JZCxcblx0XHRcdFx0ZW5kU2VsZWN0aW9uU3RhdGU6IHRoaXMuX2JlZ2luU2VsZWN0aW9uU3RhdGVcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9wYXVzZWFibGVFbWl0dGVyLnJlc3VtZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlZG8oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcGF1c2VhYmxlRW1pdHRlci5wYXVzZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX29wZXJhdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fb3BlcmF0aW9uc1tpXS5yZWRvKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wb3N0VW5kb1JlZG8odGhpcy5fcmVzdWx0QWx0ZXJuYXRpdmVWZXJzaW9uSWQpO1xuXHRcdFx0dGhpcy5fcGF1c2VhYmxlRW1pdHRlci5maXJlKHtcblx0XHRcdFx0cmF3RXZlbnRzOiBbXSxcblx0XHRcdFx0c3luY2hyb25vdXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0dmVyc2lvbklkOiB0aGlzLnRleHRNb2RlbC52ZXJzaW9uSWQsXG5cdFx0XHRcdGVuZFNlbGVjdGlvblN0YXRlOiB0aGlzLl9yZXN1bHRTZWxlY3Rpb25TdGF0ZVxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3BhdXNlYWJsZUVtaXR0ZXIucmVzdW1lKCk7XG5cdFx0fVxuXG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tPcGVyYXRpb25NYW5hZ2VyIHtcblx0cHJpdmF0ZSBfcGVuZGluZ1N0YWNrT3BlcmF0aW9uOiBTdGFja09wZXJhdGlvbiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9pc0FwcGVuZGluZzogYm9vbGVhbiA9IGZhbHNlO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZXh0TW9kZWw6IE5vdGVib29rVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgX3VuZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlLFxuXHRcdHByaXZhdGUgX3BhdXNlYWJsZUVtaXR0ZXI6IFBhdXNlYWJsZUVtaXR0ZXI8Tm90ZWJvb2tUZXh0TW9kZWxDaGFuZ2VkRXZlbnQ+LFxuXHRcdHByaXZhdGUgX3Bvc3RVbmRvUmVkbzogKGFsdGVybmF0aXZlVmVyc2lvbklkOiBzdHJpbmcpID0+IHZvaWRcblx0KSB7XG5cdH1cblxuXHRpc1VuZG9TdGFja0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9wZW5kaW5nU3RhY2tPcGVyYXRpb24gPT09IG51bGwgfHwgdGhpcy5fcGVuZGluZ1N0YWNrT3BlcmF0aW9uLmlzRW1wdHk7XG5cdH1cblxuXHRwdXNoU3RhY2tFbGVtZW50KGFsdGVybmF0aXZlVmVyc2lvbklkOiBzdHJpbmcsIHNlbGVjdGlvblN0YXRlOiBJU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ1N0YWNrT3BlcmF0aW9uICYmICF0aGlzLl9wZW5kaW5nU3RhY2tPcGVyYXRpb24uaXNFbXB0eSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1N0YWNrT3BlcmF0aW9uLnB1c2hFbmRTdGF0ZShhbHRlcm5hdGl2ZVZlcnNpb25JZCwgc2VsZWN0aW9uU3RhdGUpO1xuXHRcdFx0aWYgKCF0aGlzLl9pc0FwcGVuZGluZykge1xuXHRcdFx0XHR0aGlzLl91bmRvU2VydmljZS5wdXNoRWxlbWVudCh0aGlzLl9wZW5kaW5nU3RhY2tPcGVyYXRpb24sIHRoaXMuX3BlbmRpbmdTdGFja09wZXJhdGlvbi51bmRvUmVkb0dyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5faXNBcHBlbmRpbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9wZW5kaW5nU3RhY2tPcGVyYXRpb24gPSBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3JDcmVhdGVFZGl0U3RhY2tFbGVtZW50KGJlZ2luU2VsZWN0aW9uU3RhdGU6IElTZWxlY3Rpb25TdGF0ZSB8IHVuZGVmaW5lZCwgdW5kb1JlZG9Hcm91cDogVW5kb1JlZG9Hcm91cCB8IHVuZGVmaW5lZCwgYWx0ZXJuYXRpdmVWZXJzaW9uSWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9wZW5kaW5nU3RhY2tPcGVyYXRpb24gPz89IG5ldyBTdGFja09wZXJhdGlvbih0aGlzLl90ZXh0TW9kZWwsIHVuZG9SZWRvR3JvdXAsIHRoaXMuX3BhdXNlYWJsZUVtaXR0ZXIsIHRoaXMuX3Bvc3RVbmRvUmVkbywgYmVnaW5TZWxlY3Rpb25TdGF0ZSwgYWx0ZXJuYXRpdmVWZXJzaW9uSWQgfHwgJycpO1xuXHR9XG5cblx0YXBwZW5kUHJldmlvdXNPcGVyYXRpb24oKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl91bmRvU2VydmljZS5nZXRMYXN0RWxlbWVudCh0aGlzLl90ZXh0TW9kZWwudXJpKSBhcyBTdGFja09wZXJhdGlvbjtcblx0XHRpZiAocHJldmlvdXMgJiYgcHJldmlvdXMudGFnID09PSAnbm90ZWJvb2tVbmRvUmVkb0VsZW1lbnQnKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU3RhY2tPcGVyYXRpb24gPSBwcmV2aW91cztcblx0XHRcdHRoaXMuX2lzQXBwZW5kaW5nID0gdHJ1ZTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdXNoRWRpdE9wZXJhdGlvbihlbGVtZW50OiBJVW5kb1JlZG9FbGVtZW50LCBiZWdpblNlbGVjdGlvblN0YXRlOiBJU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQsIHJlc3VsdFNlbGVjdGlvblN0YXRlOiBJU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQsIGFsdGVybmF0aXZlVmVyc2lvbklkOiBzdHJpbmcsIHVuZG9SZWRvR3JvdXA6IFVuZG9SZWRvR3JvdXAgfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBwZW5kaW5nU3RhY2tPcGVyYXRpb24gPSB0aGlzLl9nZXRPckNyZWF0ZUVkaXRTdGFja0VsZW1lbnQoYmVnaW5TZWxlY3Rpb25TdGF0ZSwgdW5kb1JlZG9Hcm91cCwgYWx0ZXJuYXRpdmVWZXJzaW9uSWQpO1xuXHRcdHBlbmRpbmdTdGFja09wZXJhdGlvbi5wdXNoRWRpdE9wZXJhdGlvbihlbGVtZW50LCBiZWdpblNlbGVjdGlvblN0YXRlLCByZXN1bHRTZWxlY3Rpb25TdGF0ZSwgYWx0ZXJuYXRpdmVWZXJzaW9uSWQpO1xuXHR9XG59XG5cbnR5cGUgVHJhbnNmb3JtZWRFZGl0ID0ge1xuXHRlZGl0OiBJQ2VsbEVkaXRPcGVyYXRpb247XG5cdGNlbGxJbmRleDogbnVtYmVyO1xuXHRlbmQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0b3JpZ2luYWxJbmRleDogbnVtYmVyO1xufTtcblxuY2xhc3MgTm90ZWJvb2tFdmVudEVtaXR0ZXIgZXh0ZW5kcyBQYXVzZWFibGVFbWl0dGVyPE5vdGVib29rVGV4dE1vZGVsQ2hhbmdlZEV2ZW50PiB7XG5cdGdldCBpc0VtcHR5KCkge1xuXHRcdHJldHVybiB0aGlzLl9ldmVudFF1ZXVlLmlzRW1wdHkoKTtcblx0fVxuXG5cdGlzRGlydHlFdmVudCgpIHtcblx0XHRmb3IgKGNvbnN0IGUgb2YgdGhpcy5fZXZlbnRRdWV1ZSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlLnJhd0V2ZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAoIWUucmF3RXZlbnRzW2ldLnRyYW5zaWVudCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va1RleHRNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTm90ZWJvb2tUZXh0TW9kZWwge1xuXG5cdHByaXZhdGUgX2lzRGlzcG9zZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsRGlzcG9zZTogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxBZGRSZW1vdmVDZWxscyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE5vdGVib29rVGV4dE1vZGVsV2lsbEFkZFJlbW92ZUV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Tm90ZWJvb2tUZXh0TW9kZWxDaGFuZ2VkRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxEaXNwb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uV2lsbERpc3Bvc2UuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uV2lsbEFkZFJlbW92ZUNlbGxzID0gdGhpcy5fb25XaWxsQWRkUmVtb3ZlQ2VsbHMuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudC5ldmVudDtcblx0cHJpdmF0ZSBfY2VsbGhhbmRsZVBvb2w6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NlbGxMaXN0ZW5lcnM6IE1hcDxudW1iZXIsIElEaXNwb3NhYmxlPiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSBfY2VsbHM6IE5vdGVib29rQ2VsbFRleHRNb2RlbFtdID0gW107XG5cdHByaXZhdGUgX2RlZmF1bHRDb2xsYXBzZUNvbmZpZzogTm90ZWJvb2tDZWxsRGVmYXVsdENvbGxhcHNlQ29uZmlnIHwgdW5kZWZpbmVkO1xuXG5cdG1ldGFkYXRhOiBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGEgPSB7fTtcblx0dHJhbnNpZW50T3B0aW9uczogVHJhbnNpZW50T3B0aW9ucyA9IHsgdHJhbnNpZW50Q2VsbE1ldGFkYXRhOiB7fSwgdHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YToge30sIHRyYW5zaWVudE91dHB1dHM6IGZhbHNlLCBjZWxsQ29udGVudE1ldGFkYXRhOiB7fSB9O1xuXHRwcml2YXRlIF92ZXJzaW9uSWQgPSAwO1xuXG5cdC8qKlxuXHQgKiBUaGlzIGFsdGVybmF0aXZlIGlkIGlzIG9ubHkgZm9yIG5vbi1jZWxsLWNvbnRlbnQgY2hhbmdlcy5cblx0ICovXG5cdHByaXZhdGUgX25vdGVib29rU3BlY2lmaWNBbHRlcm5hdGl2ZUlkID0gMDtcblxuXHQvKipcblx0ICogVW5saWtlLCB2ZXJzaW9uSWQsIHRoaXMgY2FuIGdvIGRvd24gKHZpYSB1bmRvKSBvciBnbyB0byBwcmV2aW91cyB2YWx1ZXMgKHZpYSByZWRvKVxuXHQgKi9cblx0cHJpdmF0ZSBfYWx0ZXJuYXRpdmVWZXJzaW9uSWQ6IHN0cmluZyA9ICcxJztcblx0cHJpdmF0ZSBfb3BlcmF0aW9uTWFuYWdlcjogTm90ZWJvb2tPcGVyYXRpb25NYW5hZ2VyO1xuXHRwcml2YXRlIF9wYXVzZWFibGVFbWl0dGVyOiBOb3RlYm9va0V2ZW50RW1pdHRlcjtcblxuXHRnZXQgbGVuZ3RoKCkge1xuXHRcdHJldHVybiB0aGlzLl9jZWxscy5sZW5ndGg7XG5cdH1cblxuXHRnZXQgY2VsbHMoKTogcmVhZG9ubHkgTm90ZWJvb2tDZWxsVGV4dE1vZGVsW10ge1xuXHRcdHJldHVybiB0aGlzLl9jZWxscztcblx0fVxuXG5cdGdldCB2ZXJzaW9uSWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZlcnNpb25JZDtcblx0fVxuXG5cdGdldCBhbHRlcm5hdGl2ZVZlcnNpb25JZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9hbHRlcm5hdGl2ZVZlcnNpb25JZDtcblx0fVxuXG5cdGdldCBub3RlYm9va1R5cGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMudmlld1R5cGU7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB2aWV3VHlwZTogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IHVyaTogVVJJLFxuXHRcdGNlbGxzOiBJQ2VsbER0bzJbXSxcblx0XHRtZXRhZGF0YTogTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhLFxuXHRcdG9wdGlvbnM6IFRyYW5zaWVudE9wdGlvbnMsXG5cdFx0QElVbmRvUmVkb1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdW5kb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZURldGVjdGlvblNlcnZpY2U6IElMYW5ndWFnZURldGVjdGlvblNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0xvZ2dpbmdTZXJ2aWNlOiBJTm90ZWJvb2tMb2dnaW5nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMudHJhbnNpZW50T3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5tZXRhZGF0YSA9IG1ldGFkYXRhO1xuXHRcdHRoaXMuX2luaXRpYWxpemUoY2VsbHMpO1xuXG5cdFx0Y29uc3QgbWF5YmVVcGRhdGVDZWxsVGV4dE1vZGVsID0gKHRleHRNb2RlbDogSVRleHRNb2RlbCkgPT4ge1xuXHRcdFx0aWYgKHRleHRNb2RlbC51cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbCAmJiB0ZXh0TW9kZWwgaW5zdGFuY2VvZiBUZXh0TW9kZWwpIHtcblx0XHRcdFx0Y29uc3QgY2VsbFVyaSA9IENlbGxVcmkucGFyc2UodGV4dE1vZGVsLnVyaSk7XG5cdFx0XHRcdGlmIChjZWxsVXJpICYmIGlzRXF1YWwoY2VsbFVyaS5ub3RlYm9vaywgdGhpcy51cmkpKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbElkeCA9IHRoaXMuX2dldENlbGxJbmRleEJ5SGFuZGxlKGNlbGxVcmkuaGFuZGxlKTtcblx0XHRcdFx0XHRpZiAoY2VsbElkeCA+PSAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5jZWxsc1tjZWxsSWR4XTtcblx0XHRcdFx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdFx0XHRcdGNlbGwudGV4dE1vZGVsID0gdGV4dE1vZGVsO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX21vZGVsU2VydmljZS5vbk1vZGVsQWRkZWQoZSA9PiBtYXliZVVwZGF0ZUNlbGxUZXh0TW9kZWwoZSkpKTtcblxuXHRcdHRoaXMuX3BhdXNlYWJsZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTm90ZWJvb2tFdmVudEVtaXR0ZXIoe1xuXHRcdFx0bWVyZ2U6IChldmVudHM6IE5vdGVib29rVGV4dE1vZGVsQ2hhbmdlZEV2ZW50W10pID0+IHtcblx0XHRcdFx0Y29uc3QgZmlyc3QgPSBldmVudHNbMF07XG5cblx0XHRcdFx0Y29uc3QgcmF3RXZlbnRzID0gZmlyc3QucmF3RXZlbnRzO1xuXHRcdFx0XHRsZXQgdmVyc2lvbklkID0gZmlyc3QudmVyc2lvbklkO1xuXHRcdFx0XHRsZXQgZW5kU2VsZWN0aW9uU3RhdGUgPSBmaXJzdC5lbmRTZWxlY3Rpb25TdGF0ZTtcblx0XHRcdFx0bGV0IHN5bmNocm9ub3VzID0gZmlyc3Quc3luY2hyb25vdXM7XG5cblx0XHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBldmVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRyYXdFdmVudHMucHVzaCguLi5ldmVudHNbaV0ucmF3RXZlbnRzKTtcblx0XHRcdFx0XHR2ZXJzaW9uSWQgPSBldmVudHNbaV0udmVyc2lvbklkO1xuXHRcdFx0XHRcdGVuZFNlbGVjdGlvblN0YXRlID0gZXZlbnRzW2ldLmVuZFNlbGVjdGlvblN0YXRlICE9PSB1bmRlZmluZWQgPyBldmVudHNbaV0uZW5kU2VsZWN0aW9uU3RhdGUgOiBlbmRTZWxlY3Rpb25TdGF0ZTtcblx0XHRcdFx0XHRzeW5jaHJvbm91cyA9IGV2ZW50c1tpXS5zeW5jaHJvbm91cyAhPT0gdW5kZWZpbmVkID8gZXZlbnRzW2ldLnN5bmNocm9ub3VzIDogc3luY2hyb25vdXM7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4geyByYXdFdmVudHMsIHZlcnNpb25JZCwgZW5kU2VsZWN0aW9uU3RhdGUsIHN5bmNocm9ub3VzIH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcGF1c2VhYmxlRW1pdHRlci5ldmVudChlID0+IHtcblx0XHRcdGlmIChlLnJhd0V2ZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmZpcmUoZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fb3BlcmF0aW9uTWFuYWdlciA9IG5ldyBOb3RlYm9va09wZXJhdGlvbk1hbmFnZXIoXG5cdFx0XHR0aGlzLFxuXHRcdFx0dGhpcy5fdW5kb1NlcnZpY2UsXG5cdFx0XHR0aGlzLl9wYXVzZWFibGVFbWl0dGVyLFxuXHRcdFx0KGFsdGVybmF0aXZlVmVyc2lvbklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0dGhpcy5faW5jcmVhc2VWZXJzaW9uSWQodHJ1ZSk7XG5cdFx0XHRcdHRoaXMuX292ZXJ3cml0ZUFsdGVybmF0aXZlVmVyc2lvbklkKGFsdGVybmF0aXZlVmVyc2lvbklkKTtcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0dGhpcy5fbm90ZWJvb2tMb2dnaW5nU2VydmljZS50cmFjZSgnbm90ZWJvb2tUZXh0TW9kZWwnLCBgSW5pdGlhbGl6ZWQgbm90ZWJvb2sgdGV4dCBtb2RlbCBmb3IgJHt1cmkudG9TdHJpbmcoKX1gKTtcblx0fVxuXG5cdHNldENlbGxDb2xsYXBzZURlZmF1bHQoY29sbGFwc2VDb25maWc6IE5vdGVib29rQ2VsbERlZmF1bHRDb2xsYXBzZUNvbmZpZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2RlZmF1bHRDb2xsYXBzZUNvbmZpZyA9IGNvbGxhcHNlQ29uZmlnO1xuXHR9XG5cblx0X2luaXRpYWxpemUoY2VsbHM6IElDZWxsRHRvMltdLCB0cmlnZ2VyRGlydHk/OiBib29sZWFuKSB7XG5cdFx0dGhpcy5fY2VsbHMgPSBbXTtcblx0XHR0aGlzLl92ZXJzaW9uSWQgPSAwO1xuXHRcdHRoaXMuX25vdGVib29rU3BlY2lmaWNBbHRlcm5hdGl2ZUlkID0gMDtcblxuXHRcdGNvbnN0IG1haW5DZWxscyA9IGNlbGxzLm1hcChjZWxsID0+IHtcblx0XHRcdGNvbnN0IGNlbGxIYW5kbGUgPSB0aGlzLl9jZWxsaGFuZGxlUG9vbCsrO1xuXHRcdFx0Y29uc3QgY2VsbFVyaSA9IENlbGxVcmkuZ2VuZXJhdGUodGhpcy51cmksIGNlbGxIYW5kbGUpO1xuXHRcdFx0cmV0dXJuIG5ldyBOb3RlYm9va0NlbGxUZXh0TW9kZWwoXG5cdFx0XHRcdGNlbGxVcmksXG5cdFx0XHRcdGNlbGxIYW5kbGUsXG5cdFx0XHRcdGNlbGwsXG5cdFx0XHRcdHRoaXMudHJhbnNpZW50T3B0aW9ucyxcblx0XHRcdFx0dGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0Q3JlYXRpb25PcHRpb25zKGNlbGwubGFuZ3VhZ2UsIGNlbGxVcmksIGZhbHNlKS5kZWZhdWx0RU9MLFxuXHRcdFx0XHR0aGlzLl9kZWZhdWx0Q29sbGFwc2VDb25maWcsXG5cdFx0XHRcdHRoaXMuX2xhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSxcblx0XHRcdFx0dGhpcy5fbm90ZWJvb2tMb2dnaW5nU2VydmljZVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWFpbkNlbGxzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBkaXJ0eVN0YXRlTGlzdGVuZXIgPSBtYWluQ2VsbHNbaV0ub25EaWRDaGFuZ2VDb250ZW50KChlKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2JpbmRDZWxsQ29udGVudEhhbmRsZXIobWFpbkNlbGxzW2ldLCBlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLl9jZWxsTGlzdGVuZXJzLnNldChtYWluQ2VsbHNbaV0uaGFuZGxlLCBkaXJ0eVN0YXRlTGlzdGVuZXIpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobWFpbkNlbGxzW2ldKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jZWxscy5zcGxpY2UoMCwgMCwgLi4ubWFpbkNlbGxzKTtcblx0XHR0aGlzLl9hbHRlcm5hdGl2ZVZlcnNpb25JZCA9IHRoaXMuX2dlbmVyYXRlQWx0ZXJuYXRpdmVJZCgpO1xuXG5cdFx0aWYgKHRyaWdnZXJEaXJ0eSkge1xuXHRcdFx0dGhpcy5fcGF1c2VhYmxlRW1pdHRlci5maXJlKHtcblx0XHRcdFx0cmF3RXZlbnRzOiBbeyBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Vbmtub3duLCB0cmFuc2llbnQ6IGZhbHNlIH1dLFxuXHRcdFx0XHR2ZXJzaW9uSWQ6IHRoaXMudmVyc2lvbklkLFxuXHRcdFx0XHRzeW5jaHJvbm91czogdHJ1ZSxcblx0XHRcdFx0ZW5kU2VsZWN0aW9uU3RhdGU6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYmluZENlbGxDb250ZW50SGFuZGxlcihjZWxsOiBOb3RlYm9va0NlbGxUZXh0TW9kZWwsIGU6ICdjb250ZW50JyB8ICdsYW5ndWFnZScgfCAnbWltZScgfCB7IHR5cGU6ICdtb2RlbCc7IGV2ZW50OiBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50IH0pIHtcblx0XHR0aGlzLl9pbmNyZWFzZVZlcnNpb25JZChlID09PSAnY29udGVudCcgfHwgKHR5cGVvZiBlID09PSAnb2JqZWN0JyAmJiBlLnR5cGUgPT09ICdtb2RlbCcpKTtcblx0XHRzd2l0Y2ggKGUpIHtcblx0XHRcdGNhc2UgJ2NvbnRlbnQnOlxuXHRcdFx0XHR0aGlzLl9wYXVzZWFibGVFbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRcdHJhd0V2ZW50czogW3sga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbENvbnRlbnQsIGluZGV4OiB0aGlzLl9nZXRDZWxsSW5kZXhCeUhhbmRsZShjZWxsLmhhbmRsZSksIHRyYW5zaWVudDogZmFsc2UgfV0sXG5cdFx0XHRcdFx0dmVyc2lvbklkOiB0aGlzLnZlcnNpb25JZCxcblx0XHRcdFx0XHRzeW5jaHJvbm91czogdHJ1ZSxcblx0XHRcdFx0XHRlbmRTZWxlY3Rpb25TdGF0ZTogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAnbGFuZ3VhZ2UnOlxuXHRcdFx0XHR0aGlzLl9wYXVzZWFibGVFbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRcdHJhd0V2ZW50czogW3sga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbExhbmd1YWdlLCBpbmRleDogdGhpcy5fZ2V0Q2VsbEluZGV4QnlIYW5kbGUoY2VsbC5oYW5kbGUpLCBsYW5ndWFnZTogY2VsbC5sYW5ndWFnZSwgdHJhbnNpZW50OiBmYWxzZSB9XSxcblx0XHRcdFx0XHR2ZXJzaW9uSWQ6IHRoaXMudmVyc2lvbklkLFxuXHRcdFx0XHRcdHN5bmNocm9ub3VzOiB0cnVlLFxuXHRcdFx0XHRcdGVuZFNlbGVjdGlvblN0YXRlOiB1bmRlZmluZWRcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdtaW1lJzpcblx0XHRcdFx0dGhpcy5fcGF1c2VhYmxlRW1pdHRlci5maXJlKHtcblx0XHRcdFx0XHRyYXdFdmVudHM6IFt7IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxNaW1lLCBpbmRleDogdGhpcy5fZ2V0Q2VsbEluZGV4QnlIYW5kbGUoY2VsbC5oYW5kbGUpLCBtaW1lOiBjZWxsLm1pbWUsIHRyYW5zaWVudDogZmFsc2UgfV0sXG5cdFx0XHRcdFx0dmVyc2lvbklkOiB0aGlzLnZlcnNpb25JZCxcblx0XHRcdFx0XHRzeW5jaHJvbm91czogdHJ1ZSxcblx0XHRcdFx0XHRlbmRTZWxlY3Rpb25TdGF0ZTogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0aWYgKHR5cGVvZiBlID09PSAnb2JqZWN0JyAmJiBlLnR5cGUgPT09ICdtb2RlbCcpIHtcblx0XHRcdFx0XHR0aGlzLl9wYXVzZWFibGVFbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRcdFx0cmF3RXZlbnRzOiBbeyBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsQ29udGVudCwgaW5kZXg6IHRoaXMuX2dldENlbGxJbmRleEJ5SGFuZGxlKGNlbGwuaGFuZGxlKSwgdHJhbnNpZW50OiBmYWxzZSB9XSxcblx0XHRcdFx0XHRcdHZlcnNpb25JZDogdGhpcy52ZXJzaW9uSWQsXG5cdFx0XHRcdFx0XHRzeW5jaHJvbm91czogdHJ1ZSxcblx0XHRcdFx0XHRcdGVuZFNlbGVjdGlvblN0YXRlOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZW5lcmF0ZUFsdGVybmF0aXZlSWQoKSB7XG5cdFx0cmV0dXJuIGAke3RoaXMuX25vdGVib29rU3BlY2lmaWNBbHRlcm5hdGl2ZUlkfV9gICsgdGhpcy5jZWxscy5tYXAoY2VsbCA9PiBjZWxsLmhhbmRsZSArICcsJyArIGNlbGwuYWx0ZXJuYXRpdmVJZCkuam9pbignOycpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0Ly8gTm90ZWJvb2tFZGl0b3JNb2RlbCBjYW4gYmUgZGlzcG9zZWQgdHdpY2UsIGRvbid0IGZpcmUgb25XaWxsRGlzcG9zZSBhZ2FpblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuX29uV2lsbERpc3Bvc2UuZmlyZSgpO1xuXHRcdHRoaXMuX3VuZG9TZXJ2aWNlLnJlbW92ZUVsZW1lbnRzKHRoaXMudXJpKTtcblxuXHRcdGRpc3Bvc2UodGhpcy5fY2VsbExpc3RlbmVycy52YWx1ZXMoKSk7XG5cdFx0dGhpcy5fY2VsbExpc3RlbmVycy5jbGVhcigpO1xuXG5cdFx0ZGlzcG9zZSh0aGlzLl9jZWxscyk7XG5cdFx0dGhpcy5fY2VsbHMgPSBbXTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdXNoU3RhY2tFbGVtZW50KCkge1xuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDc1MjNcblx0fVxuXG5cdHByaXZhdGUgX2dldENlbGxJbmRleEJ5SGFuZGxlKGhhbmRsZTogbnVtYmVyKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2VsbHMuZmluZEluZGV4KGMgPT4gYy5oYW5kbGUgPT09IGhhbmRsZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDZWxsSW5kZXhXaXRoT3V0cHV0SWRIYW5kbGVGcm9tRWRpdHMob3V0cHV0SWQ6IHN0cmluZywgcmF3RWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdKSB7XG5cdFx0Y29uc3QgZWRpdCA9IHJhd0VkaXRzLmZpbmQoZSA9PiBoYXNLZXkoZSwgeyBvdXRwdXRzOiB0cnVlIH0pICYmIGUub3V0cHV0cy5zb21lKG8gPT4gby5vdXRwdXRJZCA9PT0gb3V0cHV0SWQpKTtcblx0XHRpZiAoZWRpdCkge1xuXHRcdFx0aWYgKGhhc0tleShlZGl0LCB7IGluZGV4OiB0cnVlIH0pKSB7XG5cdFx0XHRcdHJldHVybiBlZGl0LmluZGV4O1xuXHRcdFx0fSBlbHNlIGlmIChoYXNLZXkoZWRpdCwgeyBoYW5kbGU6IHRydWUgfSkpIHtcblx0XHRcdFx0Y29uc3QgY2VsbEluZGV4ID0gdGhpcy5fZ2V0Q2VsbEluZGV4QnlIYW5kbGUoZWRpdC5oYW5kbGUpO1xuXHRcdFx0XHR0aGlzLl9hc3NlcnRJbmRleChjZWxsSW5kZXgpO1xuXHRcdFx0XHRyZXR1cm4gY2VsbEluZGV4O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENlbGxJbmRleFdpdGhPdXRwdXRJZEhhbmRsZShvdXRwdXRJZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2VsbHMuZmluZEluZGV4KGMgPT4gISFjLm91dHB1dHMuZmluZChvID0+IG8ub3V0cHV0SWQgPT09IG91dHB1dElkKSk7XG5cdH1cblxuXHRyZXNldChjZWxsczogSUNlbGxEdG8yW10sIG1ldGFkYXRhOiBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGEsIHRyYW5zaWVudE9wdGlvbnM6IFRyYW5zaWVudE9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLnRyYW5zaWVudE9wdGlvbnMgPSB0cmFuc2llbnRPcHRpb25zO1xuXHRcdGNvbnN0IGV4ZWN1dGlvbnMgPSB0aGlzLl9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5nZXRDZWxsRXhlY3V0aW9uc0Zvck5vdGVib29rKHRoaXMudXJpKTtcblx0XHRjb25zdCBleGVjdXRpbmdDZWxsSGFuZGxlcyA9IGV4ZWN1dGlvbnMuZmlsdGVyKGV4ZSA9PiBleGUuc3RhdGUgPT09IE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlLkV4ZWN1dGluZykubWFwKGV4ZSA9PiBleGUuY2VsbEhhbmRsZSk7XG5cdFx0Y29uc3QgZWRpdHMgPSBOb3RlYm9va1RleHRNb2RlbC5jb21wdXRlRWRpdHModGhpcywgY2VsbHMsIGV4ZWN1dGluZ0NlbGxIYW5kbGVzKTtcblxuXHRcdHRoaXMuYXBwbHlFZGl0cyhcblx0XHRcdFtcblx0XHRcdFx0Li4uZWRpdHMsXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5Eb2N1bWVudE1ldGFkYXRhLCBtZXRhZGF0YSB9XG5cdFx0XHRdLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZmFsc2Vcblx0XHQpO1xuXHR9XG5cblx0Y3JlYXRlU25hcHNob3Qob3B0aW9uczogSU5vdGVib29rU25hcHNob3RPcHRpb25zKTogTm90ZWJvb2tEYXRhIHtcblx0XHRjb25zdCB0cmFuc2llbnRPcHRpb25zID0gb3B0aW9ucy50cmFuc2llbnRPcHRpb25zID8/IHRoaXMudHJhbnNpZW50T3B0aW9ucztcblx0XHRjb25zdCBkYXRhOiBOb3RlYm9va0RhdGEgPSB7XG5cdFx0XHRtZXRhZGF0YTogZmlsdGVyKHRoaXMubWV0YWRhdGEsIGtleSA9PiAhdHJhbnNpZW50T3B0aW9ucy50cmFuc2llbnREb2N1bWVudE1ldGFkYXRhW2tleV0pLFxuXHRcdFx0Y2VsbHM6IFtdLFxuXHRcdH07XG5cblx0XHRsZXQgb3V0cHV0U2l6ZSA9IDA7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIHRoaXMuY2VsbHMpIHtcblx0XHRcdGNvbnN0IGNlbGxEYXRhOiBJQ2VsbER0bzIgPSB7XG5cdFx0XHRcdGNlbGxLaW5kOiBjZWxsLmNlbGxLaW5kLFxuXHRcdFx0XHRsYW5ndWFnZTogY2VsbC5sYW5ndWFnZSxcblx0XHRcdFx0bWltZTogY2VsbC5taW1lLFxuXHRcdFx0XHRzb3VyY2U6IGNlbGwuZ2V0VmFsdWUoKSxcblx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdGludGVybmFsTWV0YWRhdGE6IGNlbGwuaW50ZXJuYWxNZXRhZGF0YVxuXHRcdFx0fTtcblxuXHRcdFx0aWYgKG9wdGlvbnMuY29udGV4dCA9PT0gU25hcHNob3RDb250ZXh0LkJhY2t1cCAmJiBvcHRpb25zLm91dHB1dFNpemVMaW1pdCA+IDApIHtcblx0XHRcdFx0Y2VsbC5vdXRwdXRzLmZvckVhY2gob3V0cHV0ID0+IHtcblx0XHRcdFx0XHRvdXRwdXQub3V0cHV0cy5mb3JFYWNoKGl0ZW0gPT4ge1xuXHRcdFx0XHRcdFx0b3V0cHV0U2l6ZSArPSBpdGVtLmRhdGEuYnl0ZUxlbmd0aDtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChvdXRwdXRTaXplID4gb3B0aW9ucy5vdXRwdXRTaXplTGltaXQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdGVib29rIHRvbyBsYXJnZSB0byBiYWNrdXAnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjZWxsRGF0YS5vdXRwdXRzID0gIXRyYW5zaWVudE9wdGlvbnMudHJhbnNpZW50T3V0cHV0cyA/IGNlbGwub3V0cHV0cyA6IFtdO1xuXHRcdFx0Y2VsbERhdGEubWV0YWRhdGEgPSBmaWx0ZXIoY2VsbC5tZXRhZGF0YSwga2V5ID0+ICF0cmFuc2llbnRPcHRpb25zLnRyYW5zaWVudENlbGxNZXRhZGF0YVtrZXldKTtcblxuXHRcdFx0ZGF0YS5jZWxscy5wdXNoKGNlbGxEYXRhKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGF0YTtcblx0fVxuXG5cdHJlc3RvcmVTbmFwc2hvdChzbmFwc2hvdDogTm90ZWJvb2tEYXRhLCB0cmFuc2llbnRPcHRpb25zPzogVHJhbnNpZW50T3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMucmVzZXQoc25hcHNob3QuY2VsbHMsIHNuYXBzaG90Lm1ldGFkYXRhLCB0cmFuc2llbnRPcHRpb25zID8/IHRoaXMudHJhbnNpZW50T3B0aW9ucyk7XG5cdH1cblxuXHRzdGF0aWMgY29tcHV0ZUVkaXRzKG1vZGVsOiBOb3RlYm9va1RleHRNb2RlbCwgY2VsbHM6IElDZWxsRHRvMltdLCBleGVjdXRpbmdIYW5kbGVzOiBudW1iZXJbXSA9IFtdKTogSUNlbGxFZGl0T3BlcmF0aW9uW10ge1xuXHRcdGNvbnN0IGVkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGlzRXhlY3V0aW5nID0gKGNlbGw6IE5vdGVib29rQ2VsbFRleHRNb2RlbCkgPT4gZXhlY3V0aW5nSGFuZGxlcy5pbmNsdWRlcyhjZWxsLmhhbmRsZSk7XG5cblx0XHRjb25zdCBjb21tb25QcmVmaXggPSB0aGlzLl9jb21tb25QcmVmaXgobW9kZWwuY2VsbHMsIG1vZGVsLmNlbGxzLmxlbmd0aCwgMCwgY2VsbHMsIGNlbGxzLmxlbmd0aCwgMCwgaXNFeGVjdXRpbmcpO1xuXG5cdFx0aWYgKGNvbW1vblByZWZpeCA+IDApIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY29tbW9uUHJlZml4OyBpKyspIHtcblx0XHRcdFx0ZWRpdHMucHVzaChcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLFxuXHRcdFx0XHRcdFx0aW5kZXg6IGksXG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogY2VsbHNbaV0ubWV0YWRhdGEgPz8ge31cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdC4uLnRoaXMuX2NvbXB1dGVPdXRwdXRFZGl0KGksIG1vZGVsLmNlbGxzW2ldLm91dHB1dHMsIGNlbGxzW2ldLm91dHB1dHMpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsLmNlbGxzLmxlbmd0aCA9PT0gY2VsbHMubGVuZ3RoICYmIGNvbW1vblByZWZpeCA9PT0gbW9kZWwuY2VsbHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZWRpdHM7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbW9uU3VmZml4ID0gdGhpcy5fY29tbW9uU3VmZml4KG1vZGVsLmNlbGxzLCBtb2RlbC5jZWxscy5sZW5ndGggLSBjb21tb25QcmVmaXgsIGNvbW1vblByZWZpeCwgY2VsbHMsIGNlbGxzLmxlbmd0aCAtIGNvbW1vblByZWZpeCwgY29tbW9uUHJlZml4LCBpc0V4ZWN1dGluZyk7XG5cblx0XHRpZiAoY29tbW9uU3VmZml4ID4gMCkge1xuXHRcdFx0ZWRpdHMucHVzaCh7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IGNvbW1vblByZWZpeCwgY291bnQ6IG1vZGVsLmNlbGxzLmxlbmd0aCAtIGNvbW1vblByZWZpeCAtIGNvbW1vblN1ZmZpeCwgY2VsbHM6IGNlbGxzLnNsaWNlKGNvbW1vblByZWZpeCwgY2VsbHMubGVuZ3RoIC0gY29tbW9uU3VmZml4KSB9KTtcblx0XHR9IGVsc2UgaWYgKGNvbW1vblByZWZpeCA+IDApIHtcblx0XHRcdGVkaXRzLnB1c2goeyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiBjb21tb25QcmVmaXgsIGNvdW50OiBtb2RlbC5jZWxscy5sZW5ndGggLSBjb21tb25QcmVmaXgsIGNlbGxzOiBjZWxscy5zbGljZShjb21tb25QcmVmaXgpIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlZGl0cy5wdXNoKHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMCwgY291bnQ6IG1vZGVsLmNlbGxzLmxlbmd0aCwgY2VsbHMgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbW1vblN1ZmZpeCA+IDApIHtcblx0XHRcdC8vIGhhcyBzYW1lIHN1ZmZpeFxuXHRcdFx0Zm9yIChsZXQgaSA9IGNvbW1vblN1ZmZpeDsgaSA+IDA7IGktLSkge1xuXHRcdFx0XHRlZGl0cy5wdXNoKFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTWV0YWRhdGEsXG5cdFx0XHRcdFx0XHRpbmRleDogbW9kZWwuY2VsbHMubGVuZ3RoIC0gaSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiBjZWxsc1tjZWxscy5sZW5ndGggLSBpXS5tZXRhZGF0YSA/PyB7fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Li4udGhpcy5fY29tcHV0ZU91dHB1dEVkaXQobW9kZWwuY2VsbHMubGVuZ3RoIC0gaSwgbW9kZWwuY2VsbHNbbW9kZWwuY2VsbHMubGVuZ3RoIC0gaV0ub3V0cHV0cywgY2VsbHNbY2VsbHMubGVuZ3RoIC0gaV0ub3V0cHV0cylcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdHM7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY29tcHV0ZU91dHB1dEVkaXQoaW5kZXg6IG51bWJlciwgYTogSUNlbGxPdXRwdXRbXSwgYjogSU91dHB1dER0b1tdKTogSUNlbGxFZGl0T3BlcmF0aW9uW10ge1xuXHRcdGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCxcblx0XHRcdFx0XHRpbmRleDogaW5kZXgsXG5cdFx0XHRcdFx0b3V0cHV0czogYixcblx0XHRcdFx0XHRhcHBlbmQ6IGZhbHNlXG5cdFx0XHRcdH1cblx0XHRcdF07XG5cdFx0fVxuXG5cdFx0aWYgKGEubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBubyBvdXRwdXRcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBzYW1lIGxlbmd0aFxuXHRcdHJldHVybiBiLm1hcCgob3V0cHV0LCBpKSA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dEl0ZW1zLFxuXHRcdFx0XHRvdXRwdXRJZDogYVtpXS5vdXRwdXRJZCxcblx0XHRcdFx0aXRlbXM6IG91dHB1dC5vdXRwdXRzLFxuXHRcdFx0XHRhcHBlbmQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NvbW1vblByZWZpeChhOiByZWFkb25seSBOb3RlYm9va0NlbGxUZXh0TW9kZWxbXSwgYUxlbjogbnVtYmVyLCBhRGVsdGE6IG51bWJlciwgYjogSUNlbGxEdG8yW10sIGJMZW46IG51bWJlciwgYkRlbHRhOiBudW1iZXIsIGlzRXhlY3V0aW5nOiAoY2VsbDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsKSA9PiBib29sZWFuKTogbnVtYmVyIHtcblx0XHRjb25zdCBtYXhSZXN1bHQgPSBNYXRoLm1pbihhTGVuLCBiTGVuKTtcblx0XHRsZXQgcmVzdWx0ID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1heFJlc3VsdCAmJiBhW2FEZWx0YSArIGldLmZhc3RFcXVhbChiW2JEZWx0YSArIGldLCBpc0V4ZWN1dGluZyhhW2FEZWx0YSArIGldKSk7IGkrKykge1xuXHRcdFx0cmVzdWx0Kys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jb21tb25TdWZmaXgoYTogcmVhZG9ubHkgTm90ZWJvb2tDZWxsVGV4dE1vZGVsW10sIGFMZW46IG51bWJlciwgYURlbHRhOiBudW1iZXIsIGI6IElDZWxsRHRvMltdLCBiTGVuOiBudW1iZXIsIGJEZWx0YTogbnVtYmVyLCBpc0V4ZWN1dGluZzogKGNlbGw6IE5vdGVib29rQ2VsbFRleHRNb2RlbCkgPT4gYm9vbGVhbik6IG51bWJlciB7XG5cdFx0Y29uc3QgbWF4UmVzdWx0ID0gTWF0aC5taW4oYUxlbiwgYkxlbik7XG5cdFx0bGV0IHJlc3VsdCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtYXhSZXN1bHQgJiYgYVthRGVsdGEgKyBhTGVuIC0gaSAtIDFdLmZhc3RFcXVhbChiW2JEZWx0YSArIGJMZW4gLSBpIC0gMV0sIGlzRXhlY3V0aW5nKGFbYURlbHRhICsgYUxlbiAtIGkgLSAxXSkpOyBpKyspIHtcblx0XHRcdHJlc3VsdCsrO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBuZXdDZWxsc0Zyb21MYXN0RWRpdCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRwcml2YXRlIGlzT25seUVkaXRpbmdNZXRhZGF0YU9uTmV3Q2VsbHMocmF3RWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIHJhd0VkaXRzKSB7XG5cdFx0XHRpZiAoZWRpdC5lZGl0VHlwZSA9PT0gQ2VsbEVkaXRUeXBlLlBhcnRpYWxJbnRlcm5hbE1ldGFkYXRhKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVkaXQuZWRpdFR5cGUgIT09IENlbGxFZGl0VHlwZS5NZXRhZGF0YSAmJiBlZGl0LmVkaXRUeXBlICE9PSBDZWxsRWRpdFR5cGUuUGFydGlhbE1ldGFkYXRhKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGhhc0tleShlZGl0LCB7IGluZGV4OiB0cnVlIH0pICYmICF0aGlzLm5ld0NlbGxzRnJvbUxhc3RFZGl0Lmhhcyh0aGlzLmNlbGxzW2VkaXQuaW5kZXhdLmhhbmRsZSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhhc0tleShlZGl0LCB7IGhhbmRsZTogdHJ1ZSB9KSAmJiAhdGhpcy5uZXdDZWxsc0Zyb21MYXN0RWRpdC5oYXMoZWRpdC5oYW5kbGUpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFwcGx5RWRpdHMocmF3RWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdLCBzeW5jaHJvbm91czogYm9vbGVhbiwgYmVnaW5TZWxlY3Rpb25TdGF0ZTogSVNlbGVjdGlvblN0YXRlIHwgdW5kZWZpbmVkLCBlbmRTZWxlY3Rpb25zQ29tcHV0ZXI6ICgpID0+IElTZWxlY3Rpb25TdGF0ZSB8IHVuZGVmaW5lZCwgdW5kb1JlZG9Hcm91cDogVW5kb1JlZG9Hcm91cCB8IHVuZGVmaW5lZCwgY29tcHV0ZVVuZG9SZWRvOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fbm90ZWJvb2tMb2dnaW5nU2VydmljZS50cmFjZSgndGV4dE1vZGVsRWRpdHMnLCBgQmVnaW4gYXBwbHlpbmcgJHtyYXdFZGl0cy5sZW5ndGh9IHJhdyBlZGl0c2ApO1xuXHRcdHRoaXMuX3BhdXNlYWJsZUVtaXR0ZXIucGF1c2UoKTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fb3BlcmF0aW9uTWFuYWdlci5wdXNoU3RhY2tFbGVtZW50KHRoaXMuX2FsdGVybmF0aXZlVmVyc2lvbklkLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRpZiAoY29tcHV0ZVVuZG9SZWRvICYmIHRoaXMuaXNPbmx5RWRpdGluZ01ldGFkYXRhT25OZXdDZWxscyhyYXdFZGl0cykpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9vcGVyYXRpb25NYW5hZ2VyLmFwcGVuZFByZXZpb3VzT3BlcmF0aW9uKCkpIHtcblx0XHRcdFx0XHQvLyB3ZSBjYW4ndCBhcHBlbmQgdGhlIHByZXZpb3VzIG9wZXJhdGlvbiwgc28ganVzdCBkb24ndCBjb21wdXRlIHVuZG8vcmVkb1xuXHRcdFx0XHRcdGNvbXB1dGVVbmRvUmVkbyA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGNvbXB1dGVVbmRvUmVkbykge1xuXHRcdFx0XHR0aGlzLm5ld0NlbGxzRnJvbUxhc3RFZGl0LmNsZWFyKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX2RvQXBwbHlFZGl0cyhyYXdFZGl0cywgc3luY2hyb25vdXMsIGNvbXB1dGVVbmRvUmVkbywgYmVnaW5TZWxlY3Rpb25TdGF0ZSwgdW5kb1JlZG9Hcm91cCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX25vdGVib29rTG9nZ2luZ1NlcnZpY2UuZXJyb3IoJ3RleHRNb2RlbEVkaXRzJywgYEVycm9yIHdoaWxlIGFwcGx5aW5nIGVkaXRzOiAke2Vycn1gKTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9wYXVzZWFibGVFbWl0dGVyLmlzRW1wdHkpIHtcblx0XHRcdFx0XHQvLyBVcGRhdGUgc2VsZWN0aW9uIGFuZCB2ZXJzaW9uSWQgYWZ0ZXIgYXBwbHlpbmcgZWRpdHMuXG5cdFx0XHRcdFx0Y29uc3QgZW5kU2VsZWN0aW9ucyA9IGVuZFNlbGVjdGlvbnNDb21wdXRlcigpO1xuXHRcdFx0XHRcdHRoaXMuX2luY3JlYXNlVmVyc2lvbklkKHRoaXMuX29wZXJhdGlvbk1hbmFnZXIuaXNVbmRvU3RhY2tFbXB0eSgpICYmICF0aGlzLl9wYXVzZWFibGVFbWl0dGVyLmlzRGlydHlFdmVudCgpKTtcblxuXHRcdFx0XHRcdC8vIEZpbmFsaXplIHVuZG8gZWxlbWVudFxuXHRcdFx0XHRcdHRoaXMuX29wZXJhdGlvbk1hbmFnZXIucHVzaFN0YWNrRWxlbWVudCh0aGlzLl9hbHRlcm5hdGl2ZVZlcnNpb25JZCwgZW5kU2VsZWN0aW9ucyk7XG5cblx0XHRcdFx0XHQvLyBCcm9hZGNhc3QgY2hhbmdlc1xuXHRcdFx0XHRcdHRoaXMuX3BhdXNlYWJsZUVtaXR0ZXIuZmlyZSh7IHJhd0V2ZW50czogW10sIHZlcnNpb25JZDogdGhpcy52ZXJzaW9uSWQsIHN5bmNocm9ub3VzOiBzeW5jaHJvbm91cywgZW5kU2VsZWN0aW9uU3RhdGU6IGVuZFNlbGVjdGlvbnMgfSk7XG5cdFx0XHRcdFx0dGhpcy5fbm90ZWJvb2tMb2dnaW5nU2VydmljZS50cmFjZSgndGV4dE1vZGVsRWRpdHMnLCBgRW5kIGFwcGx5aW5nICR7cmF3RWRpdHMubGVuZ3RofSByYXcgZWRpdHNgKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9wYXVzZWFibGVFbWl0dGVyLnJlc3VtZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RvQXBwbHlFZGl0cyhyYXdFZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10sIHN5bmNocm9ub3VzOiBib29sZWFuLCBjb21wdXRlVW5kb1JlZG86IGJvb2xlYW4sIGJlZ2luU2VsZWN0aW9uU3RhdGU6IElTZWxlY3Rpb25TdGF0ZSB8IHVuZGVmaW5lZCwgdW5kb1JlZG9Hcm91cDogVW5kb1JlZG9Hcm91cCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRzV2l0aERldGFpbHMgPSByYXdFZGl0cy5tYXAoKGVkaXQsIGluZGV4KSA9PiB7XG5cdFx0XHRsZXQgY2VsbEluZGV4OiBudW1iZXIgPSAtMTtcblx0XHRcdGlmIChoYXNLZXkoZWRpdCwgeyBpbmRleDogdHJ1ZSB9KSkge1xuXHRcdFx0XHRjZWxsSW5kZXggPSBlZGl0LmluZGV4O1xuXHRcdFx0fSBlbHNlIGlmIChoYXNLZXkoZWRpdCwgeyBoYW5kbGU6IHRydWUgfSkpIHtcblx0XHRcdFx0Y2VsbEluZGV4ID0gdGhpcy5fZ2V0Q2VsbEluZGV4QnlIYW5kbGUoZWRpdC5oYW5kbGUpO1xuXHRcdFx0XHR0aGlzLl9hc3NlcnRJbmRleChjZWxsSW5kZXgsIGBlZGl0VHlwZTogJHtlZGl0LmVkaXRUeXBlfSwga2V5OiBoYW5kbGVgKTtcblx0XHRcdH0gZWxzZSBpZiAoaGFzS2V5KGVkaXQsIHsgb3V0cHV0SWQ6IHRydWUgfSkpIHtcblx0XHRcdFx0Y2VsbEluZGV4ID0gdGhpcy5fZ2V0Q2VsbEluZGV4V2l0aE91dHB1dElkSGFuZGxlKGVkaXQub3V0cHV0SWQpO1xuXHRcdFx0XHRpZiAodGhpcy5faW5kZXhJc0ludmFsaWQoY2VsbEluZGV4KSkge1xuXHRcdFx0XHRcdC8vIFRoZSByZWZlcmVuY2VkIG91dHB1dCBtYXkgaGF2ZSBiZWVuIGNyZWF0ZWQgaW4gdGhpcyBiYXRjaCBvZiBlZGl0c1xuXHRcdFx0XHRcdGNlbGxJbmRleCA9IHRoaXMuX2dldENlbGxJbmRleFdpdGhPdXRwdXRJZEhhbmRsZUZyb21FZGl0cyhlZGl0Lm91dHB1dElkLCByYXdFZGl0cy5zbGljZSgwLCBpbmRleCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX2luZGV4SXNJbnZhbGlkKGNlbGxJbmRleCkpIHtcblx0XHRcdFx0XHQvLyBJdCdzIHBvc3NpYmxlIGZvciBhbiBlZGl0IHRvIHJlZmVyIHRvIGFuIG91dHB1dCB3aGljaCB3YXMganVzdCBjbGVhcmVkLCBpZ25vcmUgaXQgd2l0aG91dCB0aHJvd2luZ1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGVkaXQuZWRpdFR5cGUgIT09IENlbGxFZGl0VHlwZS5Eb2N1bWVudE1ldGFkYXRhKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjZWxsIGVkaXQ6ICcgKyBKU09OLnN0cmluZ2lmeShlZGl0KSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVkaXQsXG5cdFx0XHRcdGNlbGxJbmRleCxcblx0XHRcdFx0ZW5kOlxuXHRcdFx0XHRcdChlZGl0LmVkaXRUeXBlID09PSBDZWxsRWRpdFR5cGUuRG9jdW1lbnRNZXRhZGF0YSlcblx0XHRcdFx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHQ6IChlZGl0LmVkaXRUeXBlID09PSBDZWxsRWRpdFR5cGUuUmVwbGFjZSA/IGVkaXQuaW5kZXggKyBlZGl0LmNvdW50IDogY2VsbEluZGV4KSxcblx0XHRcdFx0b3JpZ2luYWxJbmRleDogaW5kZXhcblx0XHRcdH07XG5cdFx0fSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0XHQvLyBjb21wcmVzcyBhbGwgZWRpdHMgd2hpY2ggaGF2ZSBubyBzaWRlIGVmZmVjdHMgb24gY2VsbCBpbmRleFxuXHRcdGNvbnN0IGVkaXRzID0gdGhpcy5fbWVyZ2VDZWxsRWRpdHMoZWRpdHNXaXRoRGV0YWlscylcblx0XHRcdC5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdGlmIChhLmVuZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGIuZW5kID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBiLmVuZCAtIGEuZW5kIHx8IGIub3JpZ2luYWxJbmRleCAtIGEub3JpZ2luYWxJbmRleDtcblx0XHRcdH0pLnJlZHVjZSgocHJldiwgY3VycikgPT4ge1xuXHRcdFx0XHRpZiAoIXByZXYubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Ly8gZW1wdHlcblx0XHRcdFx0XHRwcmV2LnB1c2goW2N1cnJdKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBsYXN0ID0gcHJldltwcmV2Lmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gbGFzdFswXS5jZWxsSW5kZXg7XG5cblx0XHRcdFx0XHRpZiAoY3Vyci5jZWxsSW5kZXggPT09IGluZGV4KSB7XG5cdFx0XHRcdFx0XHRsYXN0LnB1c2goY3Vycik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHByZXYucHVzaChbY3Vycl0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBwcmV2O1xuXHRcdFx0fSwgW10gYXMgVHJhbnNmb3JtZWRFZGl0W11bXSkubWFwKGVkaXRzT25TYW1lSW5kZXggPT4ge1xuXHRcdFx0XHRjb25zdCByZXBsYWNlRWRpdHM6IFRyYW5zZm9ybWVkRWRpdFtdID0gW107XG5cdFx0XHRcdGNvbnN0IG90aGVyRWRpdHM6IFRyYW5zZm9ybWVkRWRpdFtdID0gW107XG5cblx0XHRcdFx0ZWRpdHNPblNhbWVJbmRleC5mb3JFYWNoKGVkaXQgPT4ge1xuXHRcdFx0XHRcdGlmIChlZGl0LmVkaXQuZWRpdFR5cGUgPT09IENlbGxFZGl0VHlwZS5SZXBsYWNlKSB7XG5cdFx0XHRcdFx0XHRyZXBsYWNlRWRpdHMucHVzaChlZGl0KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0b3RoZXJFZGl0cy5wdXNoKGVkaXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIFsuLi5vdGhlckVkaXRzLnJldmVyc2UoKSwgLi4ucmVwbGFjZUVkaXRzXTtcblx0XHRcdH0pO1xuXG5cdFx0Y29uc3QgZmxhdHRlbkVkaXRzID0gZWRpdHMuZmxhdCgpO1xuXG5cdFx0Zm9yIChjb25zdCB7IGVkaXQsIGNlbGxJbmRleCB9IG9mIGZsYXR0ZW5FZGl0cykge1xuXHRcdFx0c3dpdGNoIChlZGl0LmVkaXRUeXBlKSB7XG5cdFx0XHRcdGNhc2UgQ2VsbEVkaXRUeXBlLlJlcGxhY2U6XG5cdFx0XHRcdFx0dGhpcy5fcmVwbGFjZUNlbGxzKGVkaXQuaW5kZXgsIGVkaXQuY291bnQsIGVkaXQuY2VsbHMsIHN5bmNocm9ub3VzLCBjb21wdXRlVW5kb1JlZG8sIGJlZ2luU2VsZWN0aW9uU3RhdGUsIHVuZG9SZWRvR3JvdXApO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENlbGxFZGl0VHlwZS5PdXRwdXQ6IHtcblx0XHRcdFx0XHR0aGlzLl9hc3NlcnRJbmRleChjZWxsSW5kZXgpO1xuXHRcdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9jZWxsc1tjZWxsSW5kZXhdO1xuXHRcdFx0XHRcdGlmIChlZGl0LmFwcGVuZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc3BsaWNlTm90ZWJvb2tDZWxsT3V0cHV0cyhjZWxsLCB7IHN0YXJ0OiBjZWxsLm91dHB1dHMubGVuZ3RoLCBkZWxldGVDb3VudDogMCwgbmV3T3V0cHV0czogZWRpdC5vdXRwdXRzLm1hcChvcCA9PiBuZXcgTm90ZWJvb2tDZWxsT3V0cHV0VGV4dE1vZGVsKG9wKSkgfSwgdHJ1ZSwgY29tcHV0ZVVuZG9SZWRvKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fc3BsaWNlTm90ZWJvb2tDZWxsT3V0cHV0czIoY2VsbCwgZWRpdC5vdXRwdXRzLCBjb21wdXRlVW5kb1JlZG8pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIENlbGxFZGl0VHlwZS5PdXRwdXRJdGVtczpcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0aGlzLl9hc3NlcnRJbmRleChjZWxsSW5kZXgpO1xuXHRcdFx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuX2NlbGxzW2NlbGxJbmRleF07XG5cdFx0XHRcdFx0XHRpZiAoZWRpdC5hcHBlbmQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fYXBwZW5kTm90ZWJvb2tDZWxsT3V0cHV0SXRlbXMoY2VsbCwgZWRpdC5vdXRwdXRJZCwgZWRpdC5pdGVtcyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9yZXBsYWNlTm90ZWJvb2tDZWxsT3V0cHV0SXRlbXMoY2VsbCwgZWRpdC5vdXRwdXRJZCwgZWRpdC5pdGVtcyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgQ2VsbEVkaXRUeXBlLk1ldGFkYXRhOlxuXHRcdFx0XHRcdHRoaXMuX2Fzc2VydEluZGV4KGVkaXQuaW5kZXgpO1xuXHRcdFx0XHRcdHRoaXMuX2NoYW5nZUNlbGxNZXRhZGF0YSh0aGlzLl9jZWxsc1tlZGl0LmluZGV4XSwgZWRpdC5tZXRhZGF0YSwgY29tcHV0ZVVuZG9SZWRvLCBiZWdpblNlbGVjdGlvblN0YXRlLCB1bmRvUmVkb0dyb3VwKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDZWxsRWRpdFR5cGUuUGFydGlhbE1ldGFkYXRhOlxuXHRcdFx0XHRcdHRoaXMuX2Fzc2VydEluZGV4KGNlbGxJbmRleCk7XG5cdFx0XHRcdFx0dGhpcy5fY2hhbmdlQ2VsbE1ldGFkYXRhUGFydGlhbCh0aGlzLl9jZWxsc1tjZWxsSW5kZXhdLCBlZGl0Lm1ldGFkYXRhLCBjb21wdXRlVW5kb1JlZG8sIGJlZ2luU2VsZWN0aW9uU3RhdGUsIHVuZG9SZWRvR3JvdXApO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENlbGxFZGl0VHlwZS5QYXJ0aWFsSW50ZXJuYWxNZXRhZGF0YTpcblx0XHRcdFx0XHR0aGlzLl9hc3NlcnRJbmRleChjZWxsSW5kZXgpO1xuXHRcdFx0XHRcdHRoaXMuX2NoYW5nZUNlbGxJbnRlcm5hbE1ldGFkYXRhUGFydGlhbCh0aGlzLl9jZWxsc1tjZWxsSW5kZXhdLCBlZGl0LmludGVybmFsTWV0YWRhdGEpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENlbGxFZGl0VHlwZS5DZWxsTGFuZ3VhZ2U6XG5cdFx0XHRcdFx0dGhpcy5fYXNzZXJ0SW5kZXgoZWRpdC5pbmRleCk7XG5cdFx0XHRcdFx0dGhpcy5fY2hhbmdlQ2VsbExhbmd1YWdlKHRoaXMuX2NlbGxzW2VkaXQuaW5kZXhdLCBlZGl0Lmxhbmd1YWdlLCBjb21wdXRlVW5kb1JlZG8sIGJlZ2luU2VsZWN0aW9uU3RhdGUsIHVuZG9SZWRvR3JvdXApO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENlbGxFZGl0VHlwZS5Eb2N1bWVudE1ldGFkYXRhOlxuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZU5vdGVib29rQ2VsbE1ldGFkYXRhKGVkaXQubWV0YWRhdGEsIGNvbXB1dGVVbmRvUmVkbywgYmVnaW5TZWxlY3Rpb25TdGF0ZSwgdW5kb1JlZG9Hcm91cCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2VsbEVkaXRUeXBlLk1vdmU6XG5cdFx0XHRcdFx0dGhpcy5fbW92ZUNlbGxUb0lkeChlZGl0LmluZGV4LCBlZGl0Lmxlbmd0aCwgZWRpdC5uZXdJZHgsIHN5bmNocm9ub3VzLCBjb21wdXRlVW5kb1JlZG8sIGJlZ2luU2VsZWN0aW9uU3RhdGUsIHVuZGVmaW5lZCwgdW5kb1JlZG9Hcm91cCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbWVyZ2VDZWxsRWRpdHMocmF3RWRpdHM6IFRyYW5zZm9ybWVkRWRpdFtdKTogVHJhbnNmb3JtZWRFZGl0W10ge1xuXHRcdGNvbnN0IG1lcmdlZEVkaXRzOiBUcmFuc2Zvcm1lZEVkaXRbXSA9IFtdO1xuXG5cdFx0cmF3RWRpdHMuZm9yRWFjaChlZGl0ID0+IHtcblx0XHRcdGlmIChtZXJnZWRFZGl0cy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgbGFzdCA9IG1lcmdlZEVkaXRzW21lcmdlZEVkaXRzLmxlbmd0aCAtIDFdO1xuXG5cdFx0XHRcdGlmIChsYXN0LmVkaXQuZWRpdFR5cGUgPT09IENlbGxFZGl0VHlwZS5PdXRwdXRcblx0XHRcdFx0XHQmJiBsYXN0LmVkaXQuYXBwZW5kXG5cdFx0XHRcdFx0JiYgZWRpdC5lZGl0LmVkaXRUeXBlID09PSBDZWxsRWRpdFR5cGUuT3V0cHV0XG5cdFx0XHRcdFx0JiYgZWRpdC5lZGl0LmFwcGVuZFxuXHRcdFx0XHRcdCYmIGxhc3QuY2VsbEluZGV4ID09PSBlZGl0LmNlbGxJbmRleFxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRsYXN0LmVkaXQub3V0cHV0cyA9IFsuLi5sYXN0LmVkaXQub3V0cHV0cywgLi4uZWRpdC5lZGl0Lm91dHB1dHNdO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGxhc3QuZWRpdC5lZGl0VHlwZSA9PT0gQ2VsbEVkaXRUeXBlLk91dHB1dFxuXHRcdFx0XHRcdCYmICFsYXN0LmVkaXQuYXBwZW5kIC8vIGxhc3QgY2VsbCBpcyBub3QgYXBwZW5kXG5cdFx0XHRcdFx0JiYgbGFzdC5lZGl0Lm91dHB1dHMubGVuZ3RoID09PSAwIC8vIGxhc3QgY2VsbCBpcyBjbGVhciBvdXRwdXRzXG5cdFx0XHRcdFx0JiYgZWRpdC5lZGl0LmVkaXRUeXBlID09PSBDZWxsRWRpdFR5cGUuT3V0cHV0XG5cdFx0XHRcdFx0JiYgZWRpdC5lZGl0LmFwcGVuZFxuXHRcdFx0XHRcdCYmIGxhc3QuY2VsbEluZGV4ID09PSBlZGl0LmNlbGxJbmRleFxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRsYXN0LmVkaXQuYXBwZW5kID0gZmFsc2U7XG5cdFx0XHRcdFx0bGFzdC5lZGl0Lm91dHB1dHMgPSBlZGl0LmVkaXQub3V0cHV0cztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtZXJnZWRFZGl0cy5wdXNoKGVkaXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtZXJnZWRFZGl0cy5wdXNoKGVkaXQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIG1lcmdlZEVkaXRzO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVwbGFjZUNlbGxzKGluZGV4OiBudW1iZXIsIGNvdW50OiBudW1iZXIsIGNlbGxEdG9zOiBJQ2VsbER0bzJbXSwgc3luY2hyb25vdXM6IGJvb2xlYW4sIGNvbXB1dGVVbmRvUmVkbzogYm9vbGVhbiwgYmVnaW5TZWxlY3Rpb25TdGF0ZTogSVNlbGVjdGlvblN0YXRlIHwgdW5kZWZpbmVkLCB1bmRvUmVkb0dyb3VwOiBVbmRvUmVkb0dyb3VwIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cblx0XHRpZiAoY291bnQgPT09IDAgJiYgY2VsbER0b3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb2xkVmlld0NlbGxzID0gdGhpcy5fY2VsbHMuc2xpY2UoMCk7XG5cdFx0Y29uc3Qgb2xkU2V0ID0gbmV3IFNldCgpO1xuXHRcdG9sZFZpZXdDZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0b2xkU2V0LmFkZChjZWxsLmhhbmRsZSk7XG5cdFx0fSk7XG5cblx0XHQvLyBwcmVwYXJlIHJlbW92ZVxuXHRcdGZvciAobGV0IGkgPSBpbmRleDsgaSA8IE1hdGgubWluKGluZGV4ICsgY291bnQsIHRoaXMuX2NlbGxzLmxlbmd0aCk7IGkrKykge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuX2NlbGxzW2ldO1xuXHRcdFx0dGhpcy5fY2VsbExpc3RlbmVycy5nZXQoY2VsbC5oYW5kbGUpPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9jZWxsTGlzdGVuZXJzLmRlbGV0ZShjZWxsLmhhbmRsZSk7XG5cdFx0fVxuXG5cdFx0Ly8gcHJlcGFyZSBhZGRcblx0XHRjb25zdCBjZWxscyA9IGNlbGxEdG9zLm1hcChjZWxsRHRvID0+IHtcblx0XHRcdGNvbnN0IGNlbGxIYW5kbGUgPSB0aGlzLl9jZWxsaGFuZGxlUG9vbCsrO1xuXHRcdFx0Y29uc3QgY2VsbFVyaSA9IENlbGxVcmkuZ2VuZXJhdGUodGhpcy51cmksIGNlbGxIYW5kbGUpO1xuXHRcdFx0aWYgKCFjZWxsRHRvLm91dHB1dHMpIHtcblx0XHRcdFx0Y2VsbER0by5vdXRwdXRzID0gW107XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjZWxsID0gbmV3IE5vdGVib29rQ2VsbFRleHRNb2RlbChcblx0XHRcdFx0Y2VsbFVyaSxcblx0XHRcdFx0Y2VsbEhhbmRsZSxcblx0XHRcdFx0Y2VsbER0byxcblx0XHRcdFx0dGhpcy50cmFuc2llbnRPcHRpb25zLFxuXHRcdFx0XHR0aGlzLl9sYW5ndWFnZVNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuX21vZGVsU2VydmljZS5nZXRDcmVhdGlvbk9wdGlvbnMoY2VsbER0by5sYW5ndWFnZSwgY2VsbFVyaSwgZmFsc2UpLmRlZmF1bHRFT0wsXG5cdFx0XHRcdHRoaXMuX2RlZmF1bHRDb2xsYXBzZUNvbmZpZyxcblx0XHRcdFx0dGhpcy5fbGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLl9ub3RlYm9va0xvZ2dpbmdTZXJ2aWNlXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKGNlbGxVcmkpO1xuXHRcdFx0aWYgKHRleHRNb2RlbCAmJiB0ZXh0TW9kZWwgaW5zdGFuY2VvZiBUZXh0TW9kZWwpIHtcblx0XHRcdFx0Y2VsbC50ZXh0TW9kZWwgPSB0ZXh0TW9kZWw7XG5cdFx0XHRcdGNlbGwubGFuZ3VhZ2UgPSBjZWxsRHRvLmxhbmd1YWdlO1xuXHRcdFx0XHRjZWxsLnRleHRNb2RlbC5zZXRWYWx1ZShjZWxsRHRvLnNvdXJjZSk7XG5cdFx0XHRcdGNlbGwucmVzZXRUZXh0QnVmZmVyKGNlbGwudGV4dE1vZGVsLmdldFRleHRCdWZmZXIoKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkaXJ0eVN0YXRlTGlzdGVuZXIgPSBjZWxsLm9uRGlkQ2hhbmdlQ29udGVudCgoZSkgPT4ge1xuXHRcdFx0XHR0aGlzLl9iaW5kQ2VsbENvbnRlbnRIYW5kbGVyKGNlbGwsIGUpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMubmV3Q2VsbHNGcm9tTGFzdEVkaXQuYWRkKGNlbGwuaGFuZGxlKTtcblx0XHRcdHRoaXMuX2NlbGxMaXN0ZW5lcnMuc2V0KGNlbGwuaGFuZGxlLCBkaXJ0eVN0YXRlTGlzdGVuZXIpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoY2VsbCk7XG5cdFx0XHRyZXR1cm4gY2VsbDtcblx0XHR9KTtcblxuXHRcdC8vIGNvbXB1dGUgY2hhbmdlXG5cdFx0Y29uc3QgY2VsbHNDb3B5ID0gdGhpcy5fY2VsbHMuc2xpY2UoMCk7XG5cdFx0Y2VsbHNDb3B5LnNwbGljZShpbmRleCwgY291bnQsIC4uLmNlbGxzKTtcblx0XHRjb25zdCBkaWZmcyA9IGRpZmYodGhpcy5fY2VsbHMsIGNlbGxzQ29weSwgY2VsbCA9PiB7XG5cdFx0XHRyZXR1cm4gb2xkU2V0LmhhcyhjZWxsLmhhbmRsZSk7XG5cdFx0fSkubWFwKGRpZmYgPT4ge1xuXHRcdFx0cmV0dXJuIFtkaWZmLnN0YXJ0LCBkaWZmLmRlbGV0ZUNvdW50LCBkaWZmLnRvSW5zZXJ0XSBhcyBbbnVtYmVyLCBudW1iZXIsIE5vdGVib29rQ2VsbFRleHRNb2RlbFtdXTtcblx0XHR9KTtcblx0XHR0aGlzLl9vbldpbGxBZGRSZW1vdmVDZWxscy5maXJlKHsgcmF3RXZlbnQ6IHsga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2UsIGNoYW5nZXM6IGRpZmZzIH0gfSk7XG5cblx0XHQvLyBtYWtlIGNoYW5nZVxuXHRcdHRoaXMuX2NlbGxzID0gY2VsbHNDb3B5O1xuXG5cdFx0Y29uc3QgdW5kb0RpZmYgPSBkaWZmcy5tYXAoZGlmZiA9PiB7XG5cdFx0XHRjb25zdCBkZWxldGVkQ2VsbHMgPSBvbGRWaWV3Q2VsbHMuc2xpY2UoZGlmZlswXSwgZGlmZlswXSArIGRpZmZbMV0pO1xuXG5cdFx0XHRyZXR1cm4gW2RpZmZbMF0sIGRlbGV0ZWRDZWxscywgZGlmZlsyXV0gYXMgW251bWJlciwgTm90ZWJvb2tDZWxsVGV4dE1vZGVsW10sIE5vdGVib29rQ2VsbFRleHRNb2RlbFtdXTtcblx0XHR9KTtcblxuXHRcdGlmIChjb21wdXRlVW5kb1JlZG8pIHtcblx0XHRcdHRoaXMuX29wZXJhdGlvbk1hbmFnZXIucHVzaEVkaXRPcGVyYXRpb24obmV3IFNwbGljZUNlbGxzRWRpdCh0aGlzLnVyaSwgdW5kb0RpZmYsIHtcblx0XHRcdFx0aW5zZXJ0Q2VsbDogKGluZGV4LCBjZWxsLCBlbmRTZWxlY3Rpb25zKSA9PiB7IHRoaXMuX2luc2VydE5ld0NlbGwoaW5kZXgsIFtjZWxsXSwgdHJ1ZSwgZW5kU2VsZWN0aW9ucyk7IH0sXG5cdFx0XHRcdGRlbGV0ZUNlbGw6IChpbmRleCwgZW5kU2VsZWN0aW9ucykgPT4geyB0aGlzLl9yZW1vdmVDZWxsKGluZGV4LCAxLCB0cnVlLCBlbmRTZWxlY3Rpb25zKTsgfSxcblx0XHRcdFx0cmVwbGFjZUNlbGw6IChpbmRleCwgY291bnQsIGNlbGxzLCBlbmRTZWxlY3Rpb25zKSA9PiB7IHRoaXMuX3JlcGxhY2VOZXdDZWxscyhpbmRleCwgY291bnQsIGNlbGxzLCB0cnVlLCBlbmRTZWxlY3Rpb25zKTsgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgYmVnaW5TZWxlY3Rpb25TdGF0ZSwgdW5kZWZpbmVkLCB0aGlzLl9hbHRlcm5hdGl2ZVZlcnNpb25JZCwgdW5kb1JlZG9Hcm91cCk7XG5cdFx0fVxuXG5cdFx0Ly8gc2hvdWxkIGJlIGRlZmVycmVkXG5cdFx0dGhpcy5fcGF1c2VhYmxlRW1pdHRlci5maXJlKHtcblx0XHRcdHJhd0V2ZW50czogW3sga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2UsIGNoYW5nZXM6IGRpZmZzLCB0cmFuc2llbnQ6IGZhbHNlIH1dLFxuXHRcdFx0dmVyc2lvbklkOiB0aGlzLnZlcnNpb25JZCxcblx0XHRcdHN5bmNocm9ub3VzOiBzeW5jaHJvbm91cyxcblx0XHRcdGVuZFNlbGVjdGlvblN0YXRlOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2luY3JlYXNlVmVyc2lvbklkKHRyYW5zaWVudDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3ZlcnNpb25JZCA9IHRoaXMuX3ZlcnNpb25JZCArIDE7XG5cdFx0aWYgKCF0cmFuc2llbnQpIHtcblx0XHRcdHRoaXMuX25vdGVib29rU3BlY2lmaWNBbHRlcm5hdGl2ZUlkID0gdGhpcy5fdmVyc2lvbklkO1xuXHRcdH1cblx0XHR0aGlzLl9hbHRlcm5hdGl2ZVZlcnNpb25JZCA9IHRoaXMuX2dlbmVyYXRlQWx0ZXJuYXRpdmVJZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb3ZlcndyaXRlQWx0ZXJuYXRpdmVWZXJzaW9uSWQobmV3QWx0ZXJuYXRpdmVWZXJzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2FsdGVybmF0aXZlVmVyc2lvbklkID0gbmV3QWx0ZXJuYXRpdmVWZXJzaW9uSWQ7XG5cdFx0dGhpcy5fbm90ZWJvb2tTcGVjaWZpY0FsdGVybmF0aXZlSWQgPSBOdW1iZXIobmV3QWx0ZXJuYXRpdmVWZXJzaW9uSWQuc3Vic3RyaW5nKDAsIG5ld0FsdGVybmF0aXZlVmVyc2lvbklkLmluZGV4T2YoJ18nKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTm90ZWJvb2tDZWxsTWV0YWRhdGEobWV0YWRhdGE6IE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YSwgY29tcHV0ZVVuZG9SZWRvOiBib29sZWFuLCBiZWdpblNlbGVjdGlvblN0YXRlOiBJU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQsIHVuZG9SZWRvR3JvdXA6IFVuZG9SZWRvR3JvdXAgfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBvbGRNZXRhZGF0YSA9IHRoaXMubWV0YWRhdGE7XG5cdFx0Y29uc3QgdHJpZ2dlckRpcnR5Q2hhbmdlID0gdGhpcy5faXNEb2N1bWVudE1ldGFkYXRhQ2hhbmdlZCh0aGlzLm1ldGFkYXRhLCBtZXRhZGF0YSk7XG5cblx0XHRpZiAodHJpZ2dlckRpcnR5Q2hhbmdlKSB7XG5cdFx0XHRpZiAoY29tcHV0ZVVuZG9SZWRvKSB7XG5cdFx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0XHR0aGlzLl9vcGVyYXRpb25NYW5hZ2VyLnB1c2hFZGl0T3BlcmF0aW9uKG5ldyBjbGFzcyBpbXBsZW1lbnRzIElSZXNvdXJjZVVuZG9SZWRvRWxlbWVudCB7XG5cdFx0XHRcdFx0cmVhZG9ubHkgdHlwZTogVW5kb1JlZG9FbGVtZW50VHlwZS5SZXNvdXJjZSA9IFVuZG9SZWRvRWxlbWVudFR5cGUuUmVzb3VyY2U7XG5cdFx0XHRcdFx0Z2V0IHJlc291cmNlKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoYXQudXJpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZWFkb25seSBsYWJlbCA9ICdVcGRhdGUgQ2VsbCBNZXRhZGF0YSc7XG5cdFx0XHRcdFx0cmVhZG9ubHkgY29kZSA9ICd1bmRvcmVkby50ZXh0QnVmZmVyRWRpdCc7XG5cdFx0XHRcdFx0dW5kbygpIHtcblx0XHRcdFx0XHRcdHRoYXQuX3VwZGF0ZU5vdGVib29rQ2VsbE1ldGFkYXRhKG9sZE1ldGFkYXRhLCBmYWxzZSwgYmVnaW5TZWxlY3Rpb25TdGF0ZSwgdW5kb1JlZG9Hcm91cCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlZG8oKSB7XG5cdFx0XHRcdFx0XHR0aGF0Ll91cGRhdGVOb3RlYm9va0NlbGxNZXRhZGF0YShtZXRhZGF0YSwgZmFsc2UsIGJlZ2luU2VsZWN0aW9uU3RhdGUsIHVuZG9SZWRvR3JvdXApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSgpLCBiZWdpblNlbGVjdGlvblN0YXRlLCB1bmRlZmluZWQsIHRoaXMuX2FsdGVybmF0aXZlVmVyc2lvbklkLCB1bmRvUmVkb0dyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLm1ldGFkYXRhID0gbWV0YWRhdGE7XG5cdFx0dGhpcy5fcGF1c2VhYmxlRW1pdHRlci5maXJlKHtcblx0XHRcdHJhd0V2ZW50czogW3sga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlRG9jdW1lbnRNZXRhZGF0YSwgbWV0YWRhdGE6IHRoaXMubWV0YWRhdGEsIHRyYW5zaWVudDogIXRyaWdnZXJEaXJ0eUNoYW5nZSB9XSxcblx0XHRcdHZlcnNpb25JZDogdGhpcy52ZXJzaW9uSWQsXG5cdFx0XHRzeW5jaHJvbm91czogdHJ1ZSxcblx0XHRcdGVuZFNlbGVjdGlvblN0YXRlOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2luc2VydE5ld0NlbGwoaW5kZXg6IG51bWJlciwgY2VsbHM6IE5vdGVib29rQ2VsbFRleHRNb2RlbFtdLCBzeW5jaHJvbm91czogYm9vbGVhbiwgZW5kU2VsZWN0aW9uczogSVNlbGVjdGlvblN0YXRlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjZWxscy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZGlydHlTdGF0ZUxpc3RlbmVyID0gY2VsbHNbaV0ub25EaWRDaGFuZ2VDb250ZW50KChlKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2JpbmRDZWxsQ29udGVudEhhbmRsZXIoY2VsbHNbaV0sIGUpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuX2NlbGxMaXN0ZW5lcnMuc2V0KGNlbGxzW2ldLmhhbmRsZSwgZGlydHlTdGF0ZUxpc3RlbmVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBjaGFuZ2VzOiBOb3RlYm9va0NlbGxUZXh0TW9kZWxTcGxpY2U8SUNlbGw+W10gPSBbW2luZGV4LCAwLCBjZWxsc11dO1xuXHRcdHRoaXMuX29uV2lsbEFkZFJlbW92ZUNlbGxzLmZpcmUoeyByYXdFdmVudDogeyBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb2RlbENoYW5nZSwgY2hhbmdlcyB9IH0pO1xuXHRcdHRoaXMuX2NlbGxzLnNwbGljZShpbmRleCwgMCwgLi4uY2VsbHMpO1xuXHRcdHRoaXMuX3BhdXNlYWJsZUVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRyYXdFdmVudHM6IFt7IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vZGVsQ2hhbmdlLCBjaGFuZ2VzLCB0cmFuc2llbnQ6IGZhbHNlIH1dLFxuXHRcdFx0dmVyc2lvbklkOiB0aGlzLnZlcnNpb25JZCxcblx0XHRcdHN5bmNocm9ub3VzOiBzeW5jaHJvbm91cyxcblx0XHRcdGVuZFNlbGVjdGlvblN0YXRlOiBlbmRTZWxlY3Rpb25zXG5cdFx0fSk7XG5cblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVDZWxsKGluZGV4OiBudW1iZXIsIGNvdW50OiBudW1iZXIsIHN5bmNocm9ub3VzOiBib29sZWFuLCBlbmRTZWxlY3Rpb25zOiBJU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQpIHtcblx0XHRmb3IgKGxldCBpID0gaW5kZXg7IGkgPCBpbmRleCArIGNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9jZWxsc1tpXTtcblx0XHRcdHRoaXMuX2NlbGxMaXN0ZW5lcnMuZ2V0KGNlbGwuaGFuZGxlKT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fY2VsbExpc3RlbmVycy5kZWxldGUoY2VsbC5oYW5kbGUpO1xuXHRcdH1cblx0XHRjb25zdCBjaGFuZ2VzOiBOb3RlYm9va0NlbGxUZXh0TW9kZWxTcGxpY2U8SUNlbGw+W10gPSBbW2luZGV4LCBjb3VudCwgW11dXTtcblx0XHR0aGlzLl9vbldpbGxBZGRSZW1vdmVDZWxscy5maXJlKHsgcmF3RXZlbnQ6IHsga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2UsIGNoYW5nZXMgfSB9KTtcblx0XHR0aGlzLl9jZWxscy5zcGxpY2UoaW5kZXgsIGNvdW50KTtcblx0XHR0aGlzLl9wYXVzZWFibGVFbWl0dGVyLmZpcmUoe1xuXHRcdFx0cmF3RXZlbnRzOiBbeyBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb2RlbENoYW5nZSwgY2hhbmdlcywgdHJhbnNpZW50OiBmYWxzZSB9XSxcblx0XHRcdHZlcnNpb25JZDogdGhpcy52ZXJzaW9uSWQsXG5cdFx0XHRzeW5jaHJvbm91czogc3luY2hyb25vdXMsXG5cdFx0XHRlbmRTZWxlY3Rpb25TdGF0ZTogZW5kU2VsZWN0aW9uc1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVwbGFjZU5ld0NlbGxzKGluZGV4OiBudW1iZXIsIGNvdW50OiBudW1iZXIsIGNlbGxzOiBOb3RlYm9va0NlbGxUZXh0TW9kZWxbXSwgc3luY2hyb25vdXM6IGJvb2xlYW4sIGVuZFNlbGVjdGlvbnM6IElTZWxlY3Rpb25TdGF0ZSB8IHVuZGVmaW5lZCkge1xuXHRcdGZvciAobGV0IGkgPSBpbmRleDsgaSA8IGluZGV4ICsgY291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuX2NlbGxzW2ldO1xuXHRcdFx0dGhpcy5fY2VsbExpc3RlbmVycy5nZXQoY2VsbC5oYW5kbGUpPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9jZWxsTGlzdGVuZXJzLmRlbGV0ZShjZWxsLmhhbmRsZSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjZWxscy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZGlydHlTdGF0ZUxpc3RlbmVyID0gY2VsbHNbaV0ub25EaWRDaGFuZ2VDb250ZW50KChlKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2JpbmRDZWxsQ29udGVudEhhbmRsZXIoY2VsbHNbaV0sIGUpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuX2NlbGxMaXN0ZW5lcnMuc2V0KGNlbGxzW2ldLmhhbmRsZSwgZGlydHlTdGF0ZUxpc3RlbmVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBjaGFuZ2VzOiBOb3RlYm9va0NlbGxUZXh0TW9kZWxTcGxpY2U8SUNlbGw+W10gPSBbW2luZGV4LCBjb3VudCwgY2VsbHNdXTtcblx0XHR0aGlzLl9vbldpbGxBZGRSZW1vdmVDZWxscy5maXJlKHsgcmF3RXZlbnQ6IHsga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2UsIGNoYW5nZXMgfSB9KTtcblx0XHR0aGlzLl9jZWxscy5zcGxpY2UoaW5kZXgsIGNvdW50LCAuLi5jZWxscyk7XG5cdFx0dGhpcy5fcGF1c2VhYmxlRW1pdHRlci5maXJlKHtcblx0XHRcdHJhd0V2ZW50czogW3sga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2UsIGNoYW5nZXMsIHRyYW5zaWVudDogZmFsc2UgfV0sXG5cdFx0XHR2ZXJzaW9uSWQ6IHRoaXMudmVyc2lvbklkLFxuXHRcdFx0c3luY2hyb25vdXM6IHN5bmNocm9ub3VzLFxuXHRcdFx0ZW5kU2VsZWN0aW9uU3RhdGU6IGVuZFNlbGVjdGlvbnNcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2lzRG9jdW1lbnRNZXRhZGF0YUNoYW5nZWQoYTogTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhLCBiOiBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGEpIHtcblx0XHRjb25zdCBrZXlzID0gbmV3IFNldChbLi4uT2JqZWN0LmtleXMoYSB8fCB7fSksIC4uLk9iamVjdC5rZXlzKGIgfHwge30pXSk7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuXHRcdFx0aWYgKGtleSA9PT0gJ2N1c3RvbScpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9jdXN0b21NZXRhZGF0YUVxdWFsKGFba2V5XSwgYltrZXldKVxuXHRcdFx0XHRcdCYmXG5cdFx0XHRcdFx0ISh0aGlzLnRyYW5zaWVudE9wdGlvbnMudHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YVtrZXkgYXMga2V5b2YgTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhXSlcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoXG5cdFx0XHRcdChhW2tleSBhcyBrZXlvZiBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGFdICE9PSBiW2tleSBhcyBrZXlvZiBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGFdKVxuXHRcdFx0XHQmJlxuXHRcdFx0XHQhKHRoaXMudHJhbnNpZW50T3B0aW9ucy50cmFuc2llbnREb2N1bWVudE1ldGFkYXRhW2tleSBhcyBrZXlvZiBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGFdKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2lzQ2VsbE1ldGFkYXRhQ2hhbmdlZChhOiBOb3RlYm9va0NlbGxNZXRhZGF0YSwgYjogTm90ZWJvb2tDZWxsTWV0YWRhdGEpIHtcblx0XHRjb25zdCBrZXlzID0gbmV3IFNldChbLi4uT2JqZWN0LmtleXMoYSB8fCB7fSksIC4uLk9iamVjdC5rZXlzKGIgfHwge30pXSk7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHQoYVtrZXkgYXMga2V5b2YgTm90ZWJvb2tDZWxsTWV0YWRhdGFdICE9PSBiW2tleSBhcyBrZXlvZiBOb3RlYm9va0NlbGxNZXRhZGF0YV0pXG5cdFx0XHRcdCYmXG5cdFx0XHRcdCEodGhpcy50cmFuc2llbnRPcHRpb25zLnRyYW5zaWVudENlbGxNZXRhZGF0YVtrZXkgYXMga2V5b2YgTm90ZWJvb2tDZWxsTWV0YWRhdGFdKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2N1c3RvbU1ldGFkYXRhRXF1YWwoYTogYW55LCBiOiBhbnkpIHtcblx0XHRpZiAoIWEgJiYgIWIpIHtcblx0XHRcdC8vIGJvdGggb2YgdGhlbSBhcmUgbnVsbGlzaCBvciB1bmRlZmluZWRcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICghYSB8fCAhYikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFQcm9wcyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKGEpO1xuXHRcdGNvbnN0IGJQcm9wcyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKGIpO1xuXG5cdFx0aWYgKGFQcm9wcy5sZW5ndGggIT09IGJQcm9wcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFQcm9wcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcHJvcE5hbWUgPSBhUHJvcHNbaV07XG5cdFx0XHRpZiAoYVtwcm9wTmFtZV0gIT09IGJbcHJvcE5hbWVdKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2NoYW5nZUNlbGxNZXRhZGF0YVBhcnRpYWwoY2VsbDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsLCBtZXRhZGF0YTogTnVsbGFibGVQYXJ0aWFsTm90ZWJvb2tDZWxsTWV0YWRhdGEsIGNvbXB1dGVVbmRvUmVkbzogYm9vbGVhbiwgYmVnaW5TZWxlY3Rpb25TdGF0ZTogSVNlbGVjdGlvblN0YXRlIHwgdW5kZWZpbmVkLCB1bmRvUmVkb0dyb3VwOiBVbmRvUmVkb0dyb3VwIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgbmV3TWV0YWRhdGE6IE5vdGVib29rQ2VsbE1ldGFkYXRhID0ge1xuXHRcdFx0Li4uY2VsbC5tZXRhZGF0YVxuXHRcdH07XG5cdFx0bGV0IGs6IGtleW9mIE51bGxhYmxlUGFydGlhbE5vdGVib29rQ2VsbE1ldGFkYXRhO1xuXHRcdGZvciAoayBpbiBtZXRhZGF0YSkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBtZXRhZGF0YVtrXSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRuZXdNZXRhZGF0YVtrXSA9IHZhbHVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9jaGFuZ2VDZWxsTWV0YWRhdGEoY2VsbCwgbmV3TWV0YWRhdGEsIGNvbXB1dGVVbmRvUmVkbywgYmVnaW5TZWxlY3Rpb25TdGF0ZSwgdW5kb1JlZG9Hcm91cCk7XG5cdH1cblxuXHRwcml2YXRlIF9jaGFuZ2VDZWxsTWV0YWRhdGEoY2VsbDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsLCBtZXRhZGF0YTogTm90ZWJvb2tDZWxsTWV0YWRhdGEsIGNvbXB1dGVVbmRvUmVkbzogYm9vbGVhbiwgYmVnaW5TZWxlY3Rpb25TdGF0ZTogSVNlbGVjdGlvblN0YXRlIHwgdW5kZWZpbmVkLCB1bmRvUmVkb0dyb3VwOiBVbmRvUmVkb0dyb3VwIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgdHJpZ2dlckRpcnR5Q2hhbmdlID0gdGhpcy5faXNDZWxsTWV0YWRhdGFDaGFuZ2VkKGNlbGwubWV0YWRhdGEsIG1ldGFkYXRhKTtcblxuXHRcdGlmICh0cmlnZ2VyRGlydHlDaGFuZ2UpIHtcblx0XHRcdGlmIChjb21wdXRlVW5kb1JlZG8pIHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9jZWxscy5pbmRleE9mKGNlbGwpO1xuXHRcdFx0XHR0aGlzLl9vcGVyYXRpb25NYW5hZ2VyLnB1c2hFZGl0T3BlcmF0aW9uKG5ldyBDZWxsTWV0YWRhdGFFZGl0KHRoaXMudXJpLCBpbmRleCwgT2JqZWN0LmZyZWV6ZShjZWxsLm1ldGFkYXRhKSwgT2JqZWN0LmZyZWV6ZShtZXRhZGF0YSksIHtcblx0XHRcdFx0XHR1cGRhdGVDZWxsTWV0YWRhdGE6IChpbmRleCwgbmV3TWV0YWRhdGEpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9jZWxsc1tpbmRleF07XG5cdFx0XHRcdFx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhpcy5fY2hhbmdlQ2VsbE1ldGFkYXRhKGNlbGwsIG5ld01ldGFkYXRhLCBmYWxzZSwgYmVnaW5TZWxlY3Rpb25TdGF0ZSwgdW5kb1JlZG9Hcm91cCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSwgYmVnaW5TZWxlY3Rpb25TdGF0ZSwgdW5kZWZpbmVkLCB0aGlzLl9hbHRlcm5hdGl2ZVZlcnNpb25JZCwgdW5kb1JlZG9Hcm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gc2hvdWxkIGJlIGRlZmVycmVkXG5cdFx0Y2VsbC5tZXRhZGF0YSA9IG1ldGFkYXRhO1xuXHRcdHRoaXMuX3BhdXNlYWJsZUVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRyYXdFdmVudHM6IFt7IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxNZXRhZGF0YSwgaW5kZXg6IHRoaXMuX2NlbGxzLmluZGV4T2YoY2VsbCksIG1ldGFkYXRhOiBjZWxsLm1ldGFkYXRhLCB0cmFuc2llbnQ6ICF0cmlnZ2VyRGlydHlDaGFuZ2UgfV0sXG5cdFx0XHR2ZXJzaW9uSWQ6IHRoaXMudmVyc2lvbklkLFxuXHRcdFx0c3luY2hyb25vdXM6IHRydWUsXG5cdFx0XHRlbmRTZWxlY3Rpb25TdGF0ZTogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jaGFuZ2VDZWxsSW50ZXJuYWxNZXRhZGF0YVBhcnRpYWwoY2VsbDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsLCBpbnRlcm5hbE1ldGFkYXRhOiBOdWxsYWJsZVBhcnRpYWxOb3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhKSB7XG5cdFx0Y29uc3QgbmV3SW50ZXJuYWxNZXRhZGF0YTogTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSA9IHtcblx0XHRcdC4uLmNlbGwuaW50ZXJuYWxNZXRhZGF0YVxuXHRcdH07XG5cdFx0bGV0IGs6IGtleW9mIE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGE7XG5cdFx0Zm9yIChrIGluIGludGVybmFsTWV0YWRhdGEpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gaW50ZXJuYWxNZXRhZGF0YVtrXSA/PyB1bmRlZmluZWQ7XG5cdFx0XHQobmV3SW50ZXJuYWxNZXRhZGF0YVtrXSBhcyB1bmtub3duKSA9IHZhbHVlO1xuXHRcdH1cblxuXHRcdGNlbGwuaW50ZXJuYWxNZXRhZGF0YSA9IG5ld0ludGVybmFsTWV0YWRhdGE7XG5cdFx0dGhpcy5fcGF1c2VhYmxlRW1pdHRlci5maXJlKHtcblx0XHRcdHJhd0V2ZW50czogW3sga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbEludGVybmFsTWV0YWRhdGEsIGluZGV4OiB0aGlzLl9jZWxscy5pbmRleE9mKGNlbGwpLCBpbnRlcm5hbE1ldGFkYXRhOiBjZWxsLmludGVybmFsTWV0YWRhdGEsIHRyYW5zaWVudDogdHJ1ZSB9XSxcblx0XHRcdHZlcnNpb25JZDogdGhpcy52ZXJzaW9uSWQsXG5cdFx0XHRzeW5jaHJvbm91czogdHJ1ZSxcblx0XHRcdGVuZFNlbGVjdGlvblN0YXRlOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2NoYW5nZUNlbGxMYW5ndWFnZShjZWxsOiBOb3RlYm9va0NlbGxUZXh0TW9kZWwsIGxhbmd1YWdlSWQ6IHN0cmluZywgY29tcHV0ZVVuZG9SZWRvOiBib29sZWFuLCBiZWdpblNlbGVjdGlvblN0YXRlOiBJU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQsIHVuZG9SZWRvR3JvdXA6IFVuZG9SZWRvR3JvdXAgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoY2VsbC5sYW5ndWFnZSA9PT0gbGFuZ3VhZ2VJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9sZExhbmd1YWdlID0gY2VsbC5sYW5ndWFnZTtcblx0XHRjZWxsLmxhbmd1YWdlID0gbGFuZ3VhZ2VJZDtcblxuXHRcdGlmIChjb21wdXRlVW5kb1JlZG8pIHtcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0dGhpcy5fb3BlcmF0aW9uTWFuYWdlci5wdXNoRWRpdE9wZXJhdGlvbihuZXcgY2xhc3MgaW1wbGVtZW50cyBJUmVzb3VyY2VVbmRvUmVkb0VsZW1lbnQge1xuXHRcdFx0XHRyZWFkb25seSB0eXBlOiBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlID0gVW5kb1JlZG9FbGVtZW50VHlwZS5SZXNvdXJjZTtcblx0XHRcdFx0Z2V0IHJlc291cmNlKCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGF0LnVyaTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZWFkb25seSBsYWJlbCA9ICdVcGRhdGUgQ2VsbCBMYW5ndWFnZSc7XG5cdFx0XHRcdHJlYWRvbmx5IGNvZGUgPSAndW5kb3JlZG8udGV4dEJ1ZmZlckVkaXQnO1xuXHRcdFx0XHR1bmRvKCkge1xuXHRcdFx0XHRcdHRoYXQuX2NoYW5nZUNlbGxMYW5ndWFnZShjZWxsLCBvbGRMYW5ndWFnZSwgZmFsc2UsIGJlZ2luU2VsZWN0aW9uU3RhdGUsIHVuZG9SZWRvR3JvdXApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlZG8oKSB7XG5cdFx0XHRcdFx0dGhhdC5fY2hhbmdlQ2VsbExhbmd1YWdlKGNlbGwsIGxhbmd1YWdlSWQsIGZhbHNlLCBiZWdpblNlbGVjdGlvblN0YXRlLCB1bmRvUmVkb0dyb3VwKTtcblx0XHRcdFx0fVxuXHRcdFx0fSgpLCBiZWdpblNlbGVjdGlvblN0YXRlLCB1bmRlZmluZWQsIHRoaXMuX2FsdGVybmF0aXZlVmVyc2lvbklkLCB1bmRvUmVkb0dyb3VwKTtcblx0XHR9XG5cblx0XHR0aGlzLl9wYXVzZWFibGVFbWl0dGVyLmZpcmUoe1xuXHRcdFx0cmF3RXZlbnRzOiBbeyBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTGFuZ3VhZ2UsIGluZGV4OiB0aGlzLl9jZWxscy5pbmRleE9mKGNlbGwpLCBsYW5ndWFnZTogbGFuZ3VhZ2VJZCwgdHJhbnNpZW50OiBmYWxzZSB9XSxcblx0XHRcdHZlcnNpb25JZDogdGhpcy52ZXJzaW9uSWQsXG5cdFx0XHRzeW5jaHJvbm91czogdHJ1ZSxcblx0XHRcdGVuZFNlbGVjdGlvblN0YXRlOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3NwbGljZU5vdGVib29rQ2VsbE91dHB1dHMyKGNlbGw6IE5vdGVib29rQ2VsbFRleHRNb2RlbCwgb3V0cHV0czogSU91dHB1dER0b1tdLCBjb21wdXRlVW5kb1JlZG86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAob3V0cHV0cy5sZW5ndGggPT09IDAgJiYgY2VsbC5vdXRwdXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChvdXRwdXRzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHR0aGlzLl9zcGxpY2VOb3RlYm9va0NlbGxPdXRwdXRzKGNlbGwsIHsgc3RhcnQ6IDAsIGRlbGV0ZUNvdW50OiBjZWxsLm91dHB1dHMubGVuZ3RoLCBuZXdPdXRwdXRzOiBvdXRwdXRzLm1hcChvcCA9PiBuZXcgTm90ZWJvb2tDZWxsT3V0cHV0VGV4dE1vZGVsKG9wKSkgfSwgZmFsc2UsIGNvbXB1dGVVbmRvUmVkbyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlmZiA9IG5ldyBMY3NEaWZmKG5ldyBPdXRwdXRTZXF1ZW5jZShjZWxsLm91dHB1dHMpLCBuZXcgT3V0cHV0U2VxdWVuY2Uob3V0cHV0cykpO1xuXHRcdGNvbnN0IGRpZmZSZXN1bHQgPSBkaWZmLkNvbXB1dGVEaWZmKGZhbHNlKTtcblx0XHRjb25zdCBzcGxpY2VzOiBOb3RlYm9va0NlbGxPdXRwdXRzU3BsaWNlW10gPSBkaWZmUmVzdWx0LmNoYW5nZXMubWFwKGNoYW5nZSA9PiAoe1xuXHRcdFx0c3RhcnQ6IGNoYW5nZS5vcmlnaW5hbFN0YXJ0LFxuXHRcdFx0ZGVsZXRlQ291bnQ6IGNoYW5nZS5vcmlnaW5hbExlbmd0aCxcblx0XHRcdC8vIGNyZWF0ZSBjZWxsIG91dHB1dCB0ZXh0IG1vZGVsIG9ubHkgd2hlbiBpdCdzIGluc2VydGVkIGludG8gdGhlIG5vdGVib29rIGRvY3VtZW50XG5cdFx0XHRuZXdPdXRwdXRzOiBvdXRwdXRzLnNsaWNlKGNoYW5nZS5tb2RpZmllZFN0YXJ0LCBjaGFuZ2UubW9kaWZpZWRTdGFydCArIGNoYW5nZS5tb2RpZmllZExlbmd0aCkubWFwKG9wID0+IG5ldyBOb3RlYm9va0NlbGxPdXRwdXRUZXh0TW9kZWwob3ApKVxuXHRcdH0pKTtcblx0XHRzcGxpY2VzLnJldmVyc2UoKS5mb3JFYWNoKHNwbGljZSA9PiB7XG5cdFx0XHR0aGlzLl9zcGxpY2VOb3RlYm9va0NlbGxPdXRwdXRzKGNlbGwsIHNwbGljZSwgZmFsc2UsIGNvbXB1dGVVbmRvUmVkbyk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zcGxpY2VOb3RlYm9va0NlbGxPdXRwdXRzKGNlbGw6IE5vdGVib29rQ2VsbFRleHRNb2RlbCwgc3BsaWNlOiBOb3RlYm9va0NlbGxPdXRwdXRzU3BsaWNlLCBhcHBlbmQ6IGJvb2xlYW4sIGNvbXB1dGVVbmRvUmVkbzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNlbGwuc3BsaWNlTm90ZWJvb2tDZWxsT3V0cHV0cyhzcGxpY2UpO1xuXHRcdHRoaXMuX3BhdXNlYWJsZUVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRyYXdFdmVudHM6IFt7XG5cdFx0XHRcdGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk91dHB1dCxcblx0XHRcdFx0aW5kZXg6IHRoaXMuX2NlbGxzLmluZGV4T2YoY2VsbCksXG5cdFx0XHRcdG91dHB1dHM6IGNlbGwub3V0cHV0cy5tYXAob3V0cHV0ID0+IG91dHB1dC5hc0R0bygpKSA/PyBbXSxcblx0XHRcdFx0YXBwZW5kLFxuXHRcdFx0XHR0cmFuc2llbnQ6IHRoaXMudHJhbnNpZW50T3B0aW9ucy50cmFuc2llbnRPdXRwdXRzLFxuXHRcdFx0fV0sXG5cdFx0XHR2ZXJzaW9uSWQ6IHRoaXMudmVyc2lvbklkLFxuXHRcdFx0c3luY2hyb25vdXM6IHRydWUsXG5cdFx0XHRlbmRTZWxlY3Rpb25TdGF0ZTogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBlbmROb3RlYm9va0NlbGxPdXRwdXRJdGVtcyhjZWxsOiBOb3RlYm9va0NlbGxUZXh0TW9kZWwsIG91dHB1dElkOiBzdHJpbmcsIGl0ZW1zOiBJT3V0cHV0SXRlbUR0b1tdKSB7XG5cdFx0aWYgKGNlbGwuY2hhbmdlT3V0cHV0SXRlbXMob3V0cHV0SWQsIHRydWUsIGl0ZW1zKSkge1xuXHRcdFx0dGhpcy5fcGF1c2VhYmxlRW1pdHRlci5maXJlKHtcblx0XHRcdFx0cmF3RXZlbnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk91dHB1dEl0ZW0sXG5cdFx0XHRcdFx0aW5kZXg6IHRoaXMuX2NlbGxzLmluZGV4T2YoY2VsbCksXG5cdFx0XHRcdFx0b3V0cHV0SWQ6IG91dHB1dElkLFxuXHRcdFx0XHRcdG91dHB1dEl0ZW1zOiBpdGVtcyxcblx0XHRcdFx0XHRhcHBlbmQ6IHRydWUsXG5cdFx0XHRcdFx0dHJhbnNpZW50OiB0aGlzLnRyYW5zaWVudE9wdGlvbnMudHJhbnNpZW50T3V0cHV0c1xuXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR2ZXJzaW9uSWQ6IHRoaXMudmVyc2lvbklkLFxuXHRcdFx0XHRzeW5jaHJvbm91czogdHJ1ZSxcblx0XHRcdFx0ZW5kU2VsZWN0aW9uU3RhdGU6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVwbGFjZU5vdGVib29rQ2VsbE91dHB1dEl0ZW1zKGNlbGw6IE5vdGVib29rQ2VsbFRleHRNb2RlbCwgb3V0cHV0SWQ6IHN0cmluZywgaXRlbXM6IElPdXRwdXRJdGVtRHRvW10pIHtcblx0XHRpZiAoY2VsbC5jaGFuZ2VPdXRwdXRJdGVtcyhvdXRwdXRJZCwgZmFsc2UsIGl0ZW1zKSkge1xuXHRcdFx0dGhpcy5fcGF1c2VhYmxlRW1pdHRlci5maXJlKHtcblx0XHRcdFx0cmF3RXZlbnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk91dHB1dEl0ZW0sXG5cdFx0XHRcdFx0aW5kZXg6IHRoaXMuX2NlbGxzLmluZGV4T2YoY2VsbCksXG5cdFx0XHRcdFx0b3V0cHV0SWQ6IG91dHB1dElkLFxuXHRcdFx0XHRcdG91dHB1dEl0ZW1zOiBpdGVtcyxcblx0XHRcdFx0XHRhcHBlbmQ6IGZhbHNlLFxuXHRcdFx0XHRcdHRyYW5zaWVudDogdGhpcy50cmFuc2llbnRPcHRpb25zLnRyYW5zaWVudE91dHB1dHNcblxuXHRcdFx0XHR9XSxcblx0XHRcdFx0dmVyc2lvbklkOiB0aGlzLnZlcnNpb25JZCxcblx0XHRcdFx0c3luY2hyb25vdXM6IHRydWUsXG5cdFx0XHRcdGVuZFNlbGVjdGlvblN0YXRlOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX21vdmVDZWxsVG9JZHgoaW5kZXg6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIsIG5ld0lkeDogbnVtYmVyLCBzeW5jaHJvbm91czogYm9vbGVhbiwgcHVzaGVkVG9VbmRvU3RhY2s6IGJvb2xlYW4sIGJlZm9yZVNlbGVjdGlvbnM6IElTZWxlY3Rpb25TdGF0ZSB8IHVuZGVmaW5lZCwgZW5kU2VsZWN0aW9uczogSVNlbGVjdGlvblN0YXRlIHwgdW5kZWZpbmVkLCB1bmRvUmVkb0dyb3VwOiBVbmRvUmVkb0dyb3VwIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKHB1c2hlZFRvVW5kb1N0YWNrKSB7XG5cdFx0XHR0aGlzLl9vcGVyYXRpb25NYW5hZ2VyLnB1c2hFZGl0T3BlcmF0aW9uKG5ldyBNb3ZlQ2VsbEVkaXQodGhpcy51cmksIGluZGV4LCBsZW5ndGgsIG5ld0lkeCwge1xuXHRcdFx0XHRtb3ZlQ2VsbDogKGZyb21JbmRleDogbnVtYmVyLCBsZW5ndGg6IG51bWJlciwgdG9JbmRleDogbnVtYmVyLCBiZWZvcmVTZWxlY3Rpb25zOiBJU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQsIGVuZFNlbGVjdGlvbnM6IElTZWxlY3Rpb25TdGF0ZSB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX21vdmVDZWxsVG9JZHgoZnJvbUluZGV4LCBsZW5ndGgsIHRvSW5kZXgsIHRydWUsIGZhbHNlLCBiZWZvcmVTZWxlY3Rpb25zLCBlbmRTZWxlY3Rpb25zLCB1bmRvUmVkb0dyb3VwKTtcblx0XHRcdFx0fSxcblx0XHRcdH0sIGJlZm9yZVNlbGVjdGlvbnMsIGVuZFNlbGVjdGlvbnMpLCBiZWZvcmVTZWxlY3Rpb25zLCBlbmRTZWxlY3Rpb25zLCB0aGlzLl9hbHRlcm5hdGl2ZVZlcnNpb25JZCwgdW5kb1JlZG9Hcm91cCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fYXNzZXJ0SW5kZXgoaW5kZXgpO1xuXHRcdHRoaXMuX2Fzc2VydEluZGV4KG5ld0lkeCk7XG5cblx0XHRjb25zdCBjZWxscyA9IHRoaXMuX2NlbGxzLnNwbGljZShpbmRleCwgbGVuZ3RoKTtcblx0XHR0aGlzLl9jZWxscy5zcGxpY2UobmV3SWR4LCAwLCAuLi5jZWxscyk7XG5cdFx0dGhpcy5fcGF1c2VhYmxlRW1pdHRlci5maXJlKHtcblx0XHRcdHJhd0V2ZW50czogW3sga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW92ZSwgaW5kZXgsIGxlbmd0aCwgbmV3SWR4LCBjZWxscywgdHJhbnNpZW50OiBmYWxzZSB9XSxcblx0XHRcdHZlcnNpb25JZDogdGhpcy52ZXJzaW9uSWQsXG5cdFx0XHRzeW5jaHJvbm91czogc3luY2hyb25vdXMsXG5cdFx0XHRlbmRTZWxlY3Rpb25TdGF0ZTogZW5kU2VsZWN0aW9uc1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9hc3NlcnRJbmRleChpbmRleDogbnVtYmVyLCBjb250ZXh0Pzogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMuX2luZGV4SXNJbnZhbGlkKGluZGV4KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBtb2RlbCBpbmRleCBvdXQgb2YgcmFuZ2UgJHtpbmRleH0gKGNlbGxDb3VudDogJHt0aGlzLl9jZWxscy5sZW5ndGh9JHtjb250ZXh0ID8gYCwgJHtjb250ZXh0fWAgOiAnJ30pYCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaW5kZXhJc0ludmFsaWQoaW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5fY2VsbHMubGVuZ3RoO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEZpbmRcblx0ZmluZE5leHRNYXRjaChzZWFyY2hTdHJpbmc6IHN0cmluZywgc2VhcmNoU3RhcnQ6IHsgY2VsbEluZGV4OiBudW1iZXI7IHBvc2l0aW9uOiBQb3NpdGlvbiB9LCBpc1JlZ2V4OiBib29sZWFuLCBtYXRjaENhc2U6IGJvb2xlYW4sIHdvcmRTZXBhcmF0b3JzOiBzdHJpbmcgfCBudWxsLCBzZWFyY2hFbmQ/OiB7IGNlbGxJbmRleDogbnVtYmVyOyBwb3NpdGlvbjogUG9zaXRpb24gfSk6IHsgY2VsbDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsOyBtYXRjaDogRmluZE1hdGNoIH0gfCBudWxsIHtcblx0XHQvLyBjaGVjayBpZiBzZWFyY2ggY2VsbCBpbmRleCBpcyB2YWxpZFxuXHRcdHRoaXMuX2Fzc2VydEluZGV4KHNlYXJjaFN0YXJ0LmNlbGxJbmRleCk7XG5cdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcyhzZWFyY2hTdHJpbmcsIGlzUmVnZXgsIG1hdGNoQ2FzZSwgd29yZFNlcGFyYXRvcnMpO1xuXHRcdGNvbnN0IHNlYXJjaERhdGEgPSBzZWFyY2hQYXJhbXMucGFyc2VTZWFyY2hSZXF1ZXN0KCk7XG5cblx0XHRpZiAoIXNlYXJjaERhdGEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGxldCBjZWxsSW5kZXggPSBzZWFyY2hTdGFydC5jZWxsSW5kZXg7XG5cdFx0bGV0IHNlYXJjaFN0YXJ0UG9zaXRpb24gPSBzZWFyY2hTdGFydC5wb3NpdGlvbjtcblxuXHRcdGxldCBzZWFyY2hFbmRDZWxsID0gdGhpcy5fY2VsbHMubGVuZ3RoO1xuXG5cdFx0d2hpbGUgKGNlbGxJbmRleCA8IHNlYXJjaEVuZENlbGwpIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9jZWxsc1tjZWxsSW5kZXhdO1xuXG5cdFx0XHQvLyBpZiB3ZSBoYXZlIHdyYXBwZWQgYmFjayB0byB0aGUgcG9pbnQgb2YgdGhlIGluaXRpYWwgc2VhcmNoIGNlbGwsIHdlIHNlYXJjaCBmcm9tIGJlZ2lubmluZyB0byB0aGUgcHJvdmlkZWQgc2VhcmNoRW5kIHBvc2l0aW9uXG5cdFx0XHRjb25zdCB3cmFwRmxhZyA9IHNlYXJjaEVuZCAmJiBjZWxsSW5kZXggPT09IHNlYXJjaEVuZC5jZWxsSW5kZXggJiYgc2VhcmNoU3RhcnRQb3NpdGlvbi5pc0JlZm9yZShzZWFyY2hFbmQucG9zaXRpb24pO1xuXHRcdFx0Y29uc3Qgc2VhcmNoUmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0XHRcdHNlYXJjaFN0YXJ0UG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdFx0c2VhcmNoU3RhcnRQb3NpdGlvbi5jb2x1bW4sXG5cdFx0XHRcdCh3cmFwRmxhZykgPyBzZWFyY2hFbmQucG9zaXRpb24ubGluZU51bWJlciA6IGNlbGwudGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKSxcblx0XHRcdFx0KHdyYXBGbGFnKSA/IHNlYXJjaEVuZC5wb3NpdGlvbi5jb2x1bW4gOiBjZWxsLnRleHRCdWZmZXIuZ2V0TGluZU1heENvbHVtbihjZWxsLnRleHRCdWZmZXIuZ2V0TGluZUNvdW50KCkpXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBjZWxsLnRleHRCdWZmZXIuZmluZE1hdGNoZXNMaW5lQnlMaW5lKHNlYXJjaFJhbmdlLCBzZWFyY2hEYXRhLCBmYWxzZSwgMSk7XG5cdFx0XHRpZiAocmVzdWx0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmV0dXJuIHsgY2VsbCwgbWF0Y2g6IHJlc3VsdFswXSB9O1xuXHRcdFx0fSBlbHNlIGlmICh3cmFwRmxhZykgeyAvLyB0aGlzIG1lYW5zIHRoZXJlIGFyZSBubyBtb3JlIHZhbGlkIG1hdGNoZXMgaW4gdGhlIG5vdGVib29rXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNb3ZlIHRvIHRoZSBuZXh0IGNlbGxcblx0XHRcdGNlbGxJbmRleCsrO1xuXG5cdFx0XHQvLyB3cmFwIGlmIGEgc2VhcmNoRW5kIGlzIHByb3ZpZGVkIGFuZCB3ZSBhcmUgcGFzdCB0aGUgZW5kIG9mIHRoZSBub3RlYm9va1xuXHRcdFx0aWYgKHNlYXJjaEVuZCAmJiBjZWxsSW5kZXggPj0gdGhpcy5fY2VsbHMubGVuZ3RoKSB7XG5cdFx0XHRcdGNlbGxJbmRleCA9IDA7XG5cdFx0XHRcdHNlYXJjaEVuZENlbGwgPSBzZWFyY2hFbmQuY2VsbEluZGV4ICsgMTtcblx0XHRcdH1cblxuXHRcdFx0c2VhcmNoU3RhcnRQb3NpdGlvbiA9IG5ldyBQb3NpdGlvbigxLCAxKTsgLy8gUmVzZXQgcG9zaXRpb24gdG8gc3RhcnQgb2YgdGhlIG5leHQgY2VsbFxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0ZmluZE1hdGNoZXMoc2VhcmNoU3RyaW5nOiBzdHJpbmcsIGlzUmVnZXg6IGJvb2xlYW4sIG1hdGNoQ2FzZTogYm9vbGVhbiwgd29yZFNlcGFyYXRvcnM6IHN0cmluZyB8IG51bGwpOiB7IGNlbGw6IE5vdGVib29rQ2VsbFRleHRNb2RlbDsgbWF0Y2hlczogRmluZE1hdGNoW10gfVtdIHtcblx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKHNlYXJjaFN0cmluZywgaXNSZWdleCwgbWF0Y2hDYXNlLCB3b3JkU2VwYXJhdG9ycyk7XG5cdFx0Y29uc3Qgc2VhcmNoRGF0YSA9IHNlYXJjaFBhcmFtcy5wYXJzZVNlYXJjaFJlcXVlc3QoKTtcblxuXHRcdGlmICghc2VhcmNoRGF0YSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdHM6IHsgY2VsbDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsOyBtYXRjaGVzOiBGaW5kTWF0Y2hbXSB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgdGhpcy5fY2VsbHMpIHtcblx0XHRcdGNvbnN0IHNlYXJjaFJhbmdlID0gbmV3IFJhbmdlKDEsIDEsIGNlbGwudGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKSwgY2VsbC50ZXh0QnVmZmVyLmdldExpbmVNYXhDb2x1bW4oY2VsbC50ZXh0QnVmZmVyLmdldExpbmVDb3VudCgpKSk7XG5cdFx0XHRjb25zdCBtYXRjaGVzID0gY2VsbC50ZXh0QnVmZmVyLmZpbmRNYXRjaGVzTGluZUJ5TGluZShzZWFyY2hSYW5nZSwgc2VhcmNoRGF0YSwgZmFsc2UsIDEwMDApO1xuXG5cdFx0XHRpZiAobWF0Y2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc3VsdHMucHVzaCh7IGNlbGwsIG1hdGNoZXM6IG1hdGNoZXMgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cblx0Ly8jZW5kcmVnaW9uXG59XG5cbmNsYXNzIE91dHB1dFNlcXVlbmNlIGltcGxlbWVudHMgSVNlcXVlbmNlIHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgb3V0cHV0czogSU91dHB1dER0b1tdKSB7XG5cdH1cblxuXHRnZXRFbGVtZW50cygpOiBJbnQzMkFycmF5IHwgbnVtYmVyW10gfCBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMub3V0cHV0cy5tYXAob3V0cHV0ID0+IHtcblx0XHRcdHJldHVybiBoYXNoKG91dHB1dC5vdXRwdXRzLm1hcChvdXRwdXQgPT4gKHtcblx0XHRcdFx0bWltZTogb3V0cHV0Lm1pbWUsXG5cdFx0XHRcdGRhdGE6IG91dHB1dC5kYXRhXG5cdFx0XHR9KSkpO1xuXHRcdH0pO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBb0IsZUFBZTtBQUNuQyxTQUFTLFNBQWdCLHdCQUF3QjtBQUNqRCxTQUFTLFlBQVk7QUFDckIsU0FBUyxZQUFZLGVBQTRCO0FBQ2pELFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsUUFBUSxpQkFBaUI7QUFFbEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJBQXFCO0FBRTlCLFNBQXFELGtCQUE2QywyQkFBMEM7QUFDNUksU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxjQUFjLFNBQVMsTUFBdUwsNEJBQTJHLCtCQUE0UTtBQUM5a0IsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxrQkFBa0IsY0FBYyx1QkFBdUI7QUFDaEUsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyw2QkFBNkI7QUFFdEMsTUFBTSxlQUFvRDtBQUFBLEVBaUJ6RCxZQUNVLFdBQ0Es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
