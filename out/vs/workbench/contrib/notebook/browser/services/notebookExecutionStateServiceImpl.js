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
import { Emitter } from "../../../../../base/common/event.js";
import { combinedDisposable, Disposable } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { CellEditType, CellUri, NotebookCellExecutionState, NotebookExecutionState } from "../../common/notebookCommon.js";
import { CellExecutionUpdateType, INotebookExecutionService } from "../../common/notebookExecutionService.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../common/notebookExecutionStateService.js";
import { INotebookKernelService } from "../../common/notebookKernelService.js";
import { INotebookService } from "../../common/notebookService.js";
let NotebookExecutionStateService = class extends Disposable {
  constructor(_instantiationService, _logService, _notebookService, _accessibilitySignalService) {
    super();
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._notebookService = _notebookService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._executions = new ResourceMap();
    this._notebookExecutions = new ResourceMap();
    this._notebookListeners = new ResourceMap();
    this._cellListeners = new ResourceMap();
    this._lastFailedCells = new ResourceMap();
    this._lastCompletedCellHandles = new ResourceMap();
    this._onDidChangeExecution = this._register(new Emitter());
    this.onDidChangeExecution = this._onDidChangeExecution.event;
    this._onDidChangeLastRunFailState = this._register(new Emitter());
    this.onDidChangeLastRunFailState = this._onDidChangeLastRunFailState.event;
  }
  getLastFailedCellForNotebook(notebook) {
    const failedCell = this._lastFailedCells.get(notebook);
    return failedCell?.visible ? failedCell.cellHandle : void 0;
  }
  getLastCompletedCellForNotebook(notebook) {
    return this._lastCompletedCellHandles.get(notebook);
  }
  forceCancelNotebookExecutions(notebookUri) {
    const notebookCellExecutions = this._executions.get(notebookUri);
    if (notebookCellExecutions) {
      for (const exe of notebookCellExecutions.values()) {
        this._onCellExecutionDidComplete(notebookUri, exe.cellHandle, exe);
      }
    }
    if (this._notebookExecutions.has(notebookUri)) {
      this._onExecutionDidComplete(notebookUri);
    }
  }
  getCellExecution(cellUri) {
    const parsed = CellUri.parse(cellUri);
    if (!parsed) {
      throw new Error(`Not a cell URI: ${cellUri}`);
    }
    const exeMap = this._executions.get(parsed.notebook);
    if (exeMap) {
      return exeMap.get(parsed.handle);
    }
    return void 0;
  }
  getExecution(notebook) {
    return this._notebookExecutions.get(notebook)?.[0];
  }
  getCellExecutionsForNotebook(notebook) {
    const exeMap = this._executions.get(notebook);
    return exeMap ? Array.from(exeMap.values()) : [];
  }
  getCellExecutionsByHandleForNotebook(notebook) {
    const exeMap = this._executions.get(notebook);
    return exeMap ? new Map(exeMap.entries()) : void 0;
  }
  _onCellExecutionDidChange(notebookUri, cellHandle, exe) {
    this._onDidChangeExecution.fire(new NotebookCellExecutionEvent(notebookUri, cellHandle, exe));
  }
  _onCellExecutionDidComplete(notebookUri, cellHandle, exe, lastRunSuccess) {
    const notebookExecutions = this._executions.get(notebookUri);
    if (!notebookExecutions) {
      this._logService.debug(`NotebookExecutionStateService#_onCellExecutionDidComplete - unknown notebook ${notebookUri.toString()}`);
      return;
    }
    exe.dispose();
    const cellUri = CellUri.generate(notebookUri, cellHandle);
    this._cellListeners.get(cellUri)?.dispose();
    this._cellListeners.delete(cellUri);
    notebookExecutions.delete(cellHandle);
    if (notebookExecutions.size === 0) {
      this._executions.delete(notebookUri);
      this._notebookListeners.get(notebookUri)?.dispose();
      this._notebookListeners.delete(notebookUri);
    }
    if (lastRunSuccess !== void 0) {
      if (lastRunSuccess) {
        if (this._executions.size === 0) {
          this._accessibilitySignalService.playSignal(AccessibilitySignal.notebookCellCompleted);
        }
        this._clearLastFailedCell(notebookUri);
      } else {
        this._accessibilitySignalService.playSignal(AccessibilitySignal.notebookCellFailed);
        this._setLastFailedCell(notebookUri, cellHandle);
      }
      this._lastCompletedCellHandles.set(notebookUri, cellHandle);
    }
    this._onDidChangeExecution.fire(new NotebookCellExecutionEvent(notebookUri, cellHandle));
  }
  _onExecutionDidChange(notebookUri, exe) {
    this._onDidChangeExecution.fire(new NotebookExecutionEvent(notebookUri, exe));
  }
  _onExecutionDidComplete(notebookUri) {
    const disposables = this._notebookExecutions.get(notebookUri);
    if (!Array.isArray(disposables)) {
      this._logService.debug(`NotebookExecutionStateService#_onCellExecutionDidComplete - unknown notebook ${notebookUri.toString()}`);
      return;
    }
    this._notebookExecutions.delete(notebookUri);
    this._onDidChangeExecution.fire(new NotebookExecutionEvent(notebookUri));
    disposables.forEach((d) => d.dispose());
  }
  createCellExecution(notebookUri, cellHandle) {
    const notebook = this._notebookService.getNotebookTextModel(notebookUri);
    if (!notebook) {
      throw new Error(`Notebook not found: ${notebookUri.toString()}`);
    }
    let notebookExecutionMap = this._executions.get(notebookUri);
    if (!notebookExecutionMap) {
      const listeners = this._instantiationService.createInstance(NotebookExecutionListeners, notebookUri);
      this._notebookListeners.set(notebookUri, listeners);
      notebookExecutionMap = /* @__PURE__ */ new Map();
      this._executions.set(notebookUri, notebookExecutionMap);
    }
    let exe = notebookExecutionMap.get(cellHandle);
    if (!exe) {
      exe = this._createNotebookCellExecution(notebook, cellHandle);
      notebookExecutionMap.set(cellHandle, exe);
      exe.initialize();
      this._onDidChangeExecution.fire(new NotebookCellExecutionEvent(notebookUri, cellHandle, exe));
    }
    return exe;
  }
  createExecution(notebookUri) {
    const notebook = this._notebookService.getNotebookTextModel(notebookUri);
    if (!notebook) {
      throw new Error(`Notebook not found: ${notebookUri.toString()}`);
    }
    if (!this._notebookListeners.has(notebookUri)) {
      const listeners = this._instantiationService.createInstance(NotebookExecutionListeners, notebookUri);
      this._notebookListeners.set(notebookUri, listeners);
    }
    let info = this._notebookExecutions.get(notebookUri);
    if (!info) {
      info = this._createNotebookExecution(notebook);
      this._notebookExecutions.set(notebookUri, info);
      this._onDidChangeExecution.fire(new NotebookExecutionEvent(notebookUri, info[0]));
    }
    return info[0];
  }
  _createNotebookCellExecution(notebook, cellHandle) {
    const notebookUri = notebook.uri;
    const exe = this._instantiationService.createInstance(CellExecution, cellHandle, notebook);
    const disposable = combinedDisposable(
      exe.onDidUpdate(() => this._onCellExecutionDidChange(notebookUri, cellHandle, exe)),
      exe.onDidComplete((lastRunSuccess) => this._onCellExecutionDidComplete(notebookUri, cellHandle, exe, lastRunSuccess))
    );
    this._cellListeners.set(CellUri.generate(notebookUri, cellHandle), disposable);
    return exe;
  }
  _createNotebookExecution(notebook) {
    const notebookUri = notebook.uri;
    const exe = this._instantiationService.createInstance(NotebookExecution, notebook);
    const disposable = combinedDisposable(
      exe.onDidUpdate(() => this._onExecutionDidChange(notebookUri, exe)),
      exe.onDidComplete(() => this._onExecutionDidComplete(notebookUri))
    );
    return [exe, disposable];
  }
  _setLastFailedCell(notebookURI, cellHandle) {
    const prevLastFailedCellInfo = this._lastFailedCells.get(notebookURI);
    const notebook = this._notebookService.getNotebookTextModel(notebookURI);
    if (!notebook) {
      return;
    }
    const newLastFailedCellInfo = {
      cellHandle,
      disposable: prevLastFailedCellInfo ? prevLastFailedCellInfo.disposable : this._getFailedCellListener(notebook),
      visible: true
    };
    this._lastFailedCells.set(notebookURI, newLastFailedCellInfo);
    this._onDidChangeLastRunFailState.fire({ visible: true, notebook: notebookURI });
  }
  _setLastFailedCellVisibility(notebookURI, visible) {
    const lastFailedCellInfo = this._lastFailedCells.get(notebookURI);
    if (lastFailedCellInfo) {
      this._lastFailedCells.set(notebookURI, {
        cellHandle: lastFailedCellInfo.cellHandle,
        disposable: lastFailedCellInfo.disposable,
        visible
      });
    }
    this._onDidChangeLastRunFailState.fire({ visible, notebook: notebookURI });
  }
  _clearLastFailedCell(notebookURI) {
    const lastFailedCellInfo = this._lastFailedCells.get(notebookURI);
    if (lastFailedCellInfo) {
      lastFailedCellInfo.disposable?.dispose();
      this._lastFailedCells.delete(notebookURI);
    }
    this._onDidChangeLastRunFailState.fire({ visible: false, notebook: notebookURI });
  }
  _getFailedCellListener(notebook) {
    return notebook.onWillAddRemoveCells((e) => {
      const lastFailedCell = this._lastFailedCells.get(notebook.uri)?.cellHandle;
      if (lastFailedCell !== void 0) {
        const lastFailedCellPos = notebook.cells.findIndex((c) => c.handle === lastFailedCell);
        e.rawEvent.changes.forEach(([start, deleteCount, addedCells]) => {
          if (deleteCount) {
            if (lastFailedCellPos >= start && lastFailedCellPos < start + deleteCount) {
              this._setLastFailedCellVisibility(notebook.uri, false);
            }
          }
          if (addedCells.some((cell) => cell.handle === lastFailedCell)) {
            this._setLastFailedCellVisibility(notebook.uri, true);
          }
        });
      }
    });
  }
  dispose() {
    super.dispose();
    this._executions.forEach((executionMap) => {
      executionMap.forEach((execution) => execution.dispose());
      executionMap.clear();
    });
    this._executions.clear();
    this._notebookExecutions.forEach((disposables) => {
      disposables.forEach((d) => d.dispose());
    });
    this._notebookExecutions.clear();
    this._cellListeners.forEach((disposable) => disposable.dispose());
    this._notebookListeners.forEach((disposable) => disposable.dispose());
    this._lastFailedCells.forEach((elem) => elem.disposable.dispose());
  }
};
NotebookExecutionStateService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ILogService),
  __decorateParam(2, INotebookService),
  __decorateParam(3, IAccessibilitySignalService)
], NotebookExecutionStateService);
class NotebookCellExecutionEvent {
  constructor(notebook, cellHandle, changed) {
    this.notebook = notebook;
    this.cellHandle = cellHandle;
    this.changed = changed;
    this.type = NotebookExecutionType.cell;
  }
  affectsCell(cell) {
    const parsedUri = CellUri.parse(cell);
    return !!parsedUri && isEqual(this.notebook, parsedUri.notebook) && this.cellHandle === parsedUri.handle;
  }
  affectsNotebook(notebook) {
    return isEqual(this.notebook, notebook);
  }
}
class NotebookExecutionEvent {
  constructor(notebook, changed) {
    this.notebook = notebook;
    this.changed = changed;
    this.type = NotebookExecutionType.notebook;
  }
  affectsNotebook(notebook) {
    return isEqual(this.notebook, notebook);
  }
}
let NotebookExecutionListeners = class extends Disposable {
  constructor(notebook, _notebookService, _notebookKernelService, _notebookExecutionService, _notebookExecutionStateService, _logService) {
    super();
    this._notebookService = _notebookService;
    this._notebookKernelService = _notebookKernelService;
    this._notebookExecutionService = _notebookExecutionService;
    this._notebookExecutionStateService = _notebookExecutionStateService;
    this._logService = _logService;
    this._logService.debug(`NotebookExecution#ctor ${notebook.toString()}`);
    const notebookModel = this._notebookService.getNotebookTextModel(notebook);
    if (!notebookModel) {
      throw new Error("Notebook not found: " + notebook);
    }
    this._notebookModel = notebookModel;
    this._register(this._notebookModel.onWillAddRemoveCells((e) => this.onWillAddRemoveCells(e)));
    this._register(this._notebookModel.onWillDispose(() => this.onWillDisposeDocument()));
  }
  cancelAll() {
    this._logService.debug(`NotebookExecutionListeners#cancelAll`);
    const exes = this._notebookExecutionStateService.getCellExecutionsForNotebook(this._notebookModel.uri);
    this._notebookExecutionService.cancelNotebookCellHandles(this._notebookModel, exes.map((exe) => exe.cellHandle));
  }
  onWillDisposeDocument() {
    this._logService.debug(`NotebookExecution#onWillDisposeDocument`);
    this.cancelAll();
  }
  onWillAddRemoveCells(e) {
    const notebookExes = this._notebookExecutionStateService.getCellExecutionsByHandleForNotebook(this._notebookModel.uri);
    const executingDeletedHandles = /* @__PURE__ */ new Set();
    const pendingDeletedHandles = /* @__PURE__ */ new Set();
    if (notebookExes) {
      e.rawEvent.changes.forEach(([start, deleteCount]) => {
        if (deleteCount) {
          const deletedHandles = this._notebookModel.cells.slice(start, start + deleteCount).map((c) => c.handle);
          deletedHandles.forEach((h) => {
            const exe = notebookExes.get(h);
            if (exe?.state === NotebookCellExecutionState.Executing) {
              executingDeletedHandles.add(h);
            } else if (exe) {
              pendingDeletedHandles.add(h);
            }
          });
        }
      });
    }
    if (executingDeletedHandles.size || pendingDeletedHandles.size) {
      const kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(this._notebookModel);
      if (kernel) {
        const implementsInterrupt = kernel.implementsInterrupt;
        const handlesToCancel = implementsInterrupt ? [...executingDeletedHandles] : [...executingDeletedHandles, ...pendingDeletedHandles];
        this._logService.debug(`NotebookExecution#onWillAddRemoveCells, ${JSON.stringify([...handlesToCancel])}`);
        if (handlesToCancel.length) {
          kernel.cancelNotebookCellExecution(this._notebookModel.uri, handlesToCancel);
        }
      }
    }
  }
};
NotebookExecutionListeners = __decorateClass([
  __decorateParam(1, INotebookService),
  __decorateParam(2, INotebookKernelService),
  __decorateParam(3, INotebookExecutionService),
  __decorateParam(4, INotebookExecutionStateService),
  __decorateParam(5, ILogService)
], NotebookExecutionListeners);
function updateToEdit(update, cellHandle) {
  if (update.editType === CellExecutionUpdateType.Output) {
    return {
      editType: CellEditType.Output,
      handle: update.cellHandle,
      append: update.append,
      outputs: update.outputs
    };
  } else if (update.editType === CellExecutionUpdateType.OutputItems) {
    return {
      editType: CellEditType.OutputItems,
      items: update.items,
      append: update.append,
      outputId: update.outputId
    };
  } else if (update.editType === CellExecutionUpdateType.ExecutionState) {
    const newInternalMetadata = {};
    if (typeof update.executionOrder !== "undefined") {
      newInternalMetadata.executionOrder = update.executionOrder;
    }
    if (typeof update.runStartTime !== "undefined") {
      newInternalMetadata.runStartTime = update.runStartTime;
    }
    return {
      editType: CellEditType.PartialInternalMetadata,
      handle: cellHandle,
      internalMetadata: newInternalMetadata
    };
  }
  throw new Error("Unknown cell update type");
}
let CellExecution = class extends Disposable {
  constructor(cellHandle, _notebookModel, _logService) {
    super();
    this.cellHandle = cellHandle;
    this._notebookModel = _notebookModel;
    this._logService = _logService;
    this._onDidUpdate = this._register(new Emitter());
    this.onDidUpdate = this._onDidUpdate.event;
    this._onDidComplete = this._register(new Emitter());
    this.onDidComplete = this._onDidComplete.event;
    this._state = NotebookCellExecutionState.Unconfirmed;
    this._didPause = false;
    this._isPaused = false;
    this._logService.debug(`CellExecution#ctor ${this.getCellLog()}`);
  }
  get state() {
    return this._state;
  }
  get notebook() {
    return this._notebookModel.uri;
  }
  get didPause() {
    return this._didPause;
  }
  get isPaused() {
    return this._isPaused;
  }
  initialize() {
    const startExecuteEdit = {
      editType: CellEditType.PartialInternalMetadata,
      handle: this.cellHandle,
      internalMetadata: {
        executionId: generateUuid(),
        runStartTime: null,
        runEndTime: null,
        lastRunSuccess: null,
        executionOrder: null,
        renderDuration: null
      }
    };
    this._applyExecutionEdits([startExecuteEdit]);
  }
  getCellLog() {
    return `${this._notebookModel.uri.toString()}, ${this.cellHandle}`;
  }
  logUpdates(updates) {
    const updateTypes = updates.map((u) => CellExecutionUpdateType[u.editType]).join(", ");
    this._logService.debug(`CellExecution#updateExecution ${this.getCellLog()}, [${updateTypes}]`);
  }
  confirm() {
    this._logService.debug(`CellExecution#confirm ${this.getCellLog()}`);
    this._state = NotebookCellExecutionState.Pending;
    this._onDidUpdate.fire();
  }
  update(updates) {
    this.logUpdates(updates);
    if (updates.some((u) => u.editType === CellExecutionUpdateType.ExecutionState)) {
      this._state = NotebookCellExecutionState.Executing;
    }
    if (!this._didPause && updates.some((u) => u.editType === CellExecutionUpdateType.ExecutionState && u.didPause)) {
      this._didPause = true;
    }
    const lastIsPausedUpdate = [...updates].reverse().find((u) => u.editType === CellExecutionUpdateType.ExecutionState && typeof u.isPaused === "boolean");
    if (lastIsPausedUpdate) {
      this._isPaused = lastIsPausedUpdate.isPaused;
    }
    const cellModel = this._notebookModel.cells.find((c) => c.handle === this.cellHandle);
    if (!cellModel) {
      this._logService.debug(`CellExecution#update, updating cell not in notebook: ${this._notebookModel.uri.toString()}, ${this.cellHandle}`);
    } else {
      const edits = updates.map((update) => updateToEdit(update, this.cellHandle));
      this._applyExecutionEdits(edits);
    }
    if (updates.some((u) => u.editType === CellExecutionUpdateType.ExecutionState)) {
      this._onDidUpdate.fire();
    }
  }
  complete(completionData) {
    const cellModel = this._notebookModel.cells.find((c) => c.handle === this.cellHandle);
    if (!cellModel) {
      this._logService.debug(`CellExecution#complete, completing cell not in notebook: ${this._notebookModel.uri.toString()}, ${this.cellHandle}`);
    } else {
      const edit = {
        editType: CellEditType.PartialInternalMetadata,
        handle: this.cellHandle,
        internalMetadata: {
          lastRunSuccess: completionData.lastRunSuccess,
          runStartTime: this._didPause ? null : cellModel.internalMetadata.runStartTime,
          runEndTime: this._didPause ? null : completionData.runEndTime,
          error: completionData.error
        }
      };
      this._applyExecutionEdits([edit]);
    }
    this._onDidComplete.fire(completionData.lastRunSuccess);
  }
  _applyExecutionEdits(edits) {
    this._notebookModel.applyEdits(edits, true, void 0, () => void 0, void 0, false);
  }
};
CellExecution = __decorateClass([
  __decorateParam(2, ILogService)
], CellExecution);
let NotebookExecution = class extends Disposable {
  constructor(_notebookModel, _logService) {
    super();
    this._notebookModel = _notebookModel;
    this._logService = _logService;
    this._onDidUpdate = this._register(new Emitter());
    this.onDidUpdate = this._onDidUpdate.event;
    this._onDidComplete = this._register(new Emitter());
    this.onDidComplete = this._onDidComplete.event;
    this._state = NotebookExecutionState.Unconfirmed;
    this._logService.debug(`NotebookExecution#ctor`);
  }
  get state() {
    return this._state;
  }
  get notebook() {
    return this._notebookModel.uri;
  }
  debug(message) {
    this._logService.debug(`${message} ${this._notebookModel.uri.toString()}`);
  }
  confirm() {
    this.debug(`Execution#confirm`);
    this._state = NotebookExecutionState.Pending;
    this._onDidUpdate.fire();
  }
  begin() {
    this.debug(`Execution#begin`);
    this._state = NotebookExecutionState.Executing;
    this._onDidUpdate.fire();
  }
  complete() {
    this.debug(`Execution#begin`);
    this._state = NotebookExecutionState.Unconfirmed;
    this._onDidComplete.fire();
  }
};
NotebookExecution = __decorateClass([
  __decorateParam(1, ILogService)
], NotebookExecution);
export {
  NotebookExecutionStateService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxzZXJ2aWNlc1xcbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2VJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgQ2VsbFVyaSwgSUNlbGxFZGl0T3BlcmF0aW9uLCBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZSwgTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSwgTm90ZWJvb2tFeGVjdXRpb25TdGF0ZSwgTm90ZWJvb2tUZXh0TW9kZWxXaWxsQWRkUmVtb3ZlRXZlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUsIElOb3RlYm9va0V4ZWN1dGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDZWxsRXhlY3V0ZVVwZGF0ZSwgSUNlbGxFeGVjdXRpb25Db21wbGV0ZSwgSUNlbGxFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudCwgSUNlbGxFeGVjdXRpb25TdGF0ZVVwZGF0ZSwgSUV4ZWN1dGlvblN0YXRlQ2hhbmdlZEV2ZW50LCBJRmFpbGVkQ2VsbEluZm8sIElOb3RlYm9va0NlbGxFeGVjdXRpb24sIElOb3RlYm9va0V4ZWN1dGlvbiwgSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLCBJTm90ZWJvb2tGYWlsU3RhdGVDaGFuZ2VkRXZlbnQsIE5vdGVib29rRXhlY3V0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rS2VybmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2Uge1xuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9leGVjdXRpb25zID0gbmV3IFJlc291cmNlTWFwPE1hcDxudW1iZXIsIENlbGxFeGVjdXRpb24+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0V4ZWN1dGlvbnMgPSBuZXcgUmVzb3VyY2VNYXA8W05vdGVib29rRXhlY3V0aW9uLCBJRGlzcG9zYWJsZV0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rTGlzdGVuZXJzID0gbmV3IFJlc291cmNlTWFwPE5vdGVib29rRXhlY3V0aW9uTGlzdGVuZXJzPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jZWxsTGlzdGVuZXJzID0gbmV3IFJlc291cmNlTWFwPElEaXNwb3NhYmxlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXN0RmFpbGVkQ2VsbHMgPSBuZXcgUmVzb3VyY2VNYXA8SUZhaWxlZENlbGxJbmZvPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXN0Q29tcGxldGVkQ2VsbEhhbmRsZXMgPSBuZXcgUmVzb3VyY2VNYXA8bnVtYmVyPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRXhlY3V0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNlbGxFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudCB8IElFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudD4oKSk7XG5cdG9uRGlkQ2hhbmdlRXhlY3V0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VFeGVjdXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMYXN0UnVuRmFpbFN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU5vdGVib29rRmFpbFN0YXRlQ2hhbmdlZEV2ZW50PigpKTtcblx0b25EaWRDaGFuZ2VMYXN0UnVuRmFpbFN0YXRlID0gdGhpcy5fb25EaWRDaGFuZ2VMYXN0UnVuRmFpbFN0YXRlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElOb3RlYm9va1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Z2V0TGFzdEZhaWxlZENlbGxGb3JOb3RlYm9vayhub3RlYm9vazogVVJJKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmYWlsZWRDZWxsID0gdGhpcy5fbGFzdEZhaWxlZENlbGxzLmdldChub3RlYm9vayk7XG5cdFx0cmV0dXJuIGZhaWxlZENlbGw/LnZpc2libGUgPyBmYWlsZWRDZWxsLmNlbGxIYW5kbGUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRMYXN0Q29tcGxldGVkQ2VsbEZvck5vdGVib29rKG5vdGVib29rOiBVUkkpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0Q29tcGxldGVkQ2VsbEhhbmRsZXMuZ2V0KG5vdGVib29rKTtcblx0fVxuXG5cdGZvcmNlQ2FuY2VsTm90ZWJvb2tFeGVjdXRpb25zKG5vdGVib29rVXJpOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBub3RlYm9va0NlbGxFeGVjdXRpb25zID0gdGhpcy5fZXhlY3V0aW9ucy5nZXQobm90ZWJvb2tVcmkpO1xuXHRcdGlmIChub3RlYm9va0NlbGxFeGVjdXRpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4ZSBvZiBub3RlYm9va0NlbGxFeGVjdXRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRcdHRoaXMuX29uQ2VsbEV4ZWN1dGlvbkRpZENvbXBsZXRlKG5vdGVib29rVXJpLCBleGUuY2VsbEhhbmRsZSwgZXhlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuX25vdGVib29rRXhlY3V0aW9ucy5oYXMobm90ZWJvb2tVcmkpKSB7XG5cdFx0XHR0aGlzLl9vbkV4ZWN1dGlvbkRpZENvbXBsZXRlKG5vdGVib29rVXJpKTtcblx0XHR9XG5cdH1cblxuXHRnZXRDZWxsRXhlY3V0aW9uKGNlbGxVcmk6IFVSSSk6IElOb3RlYm9va0NlbGxFeGVjdXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHBhcnNlZCA9IENlbGxVcmkucGFyc2UoY2VsbFVyaSk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm90IGEgY2VsbCBVUkk6ICR7Y2VsbFVyaX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBleGVNYXAgPSB0aGlzLl9leGVjdXRpb25zLmdldChwYXJzZWQubm90ZWJvb2spO1xuXHRcdGlmIChleGVNYXApIHtcblx0XHRcdHJldHVybiBleGVNYXAuZ2V0KHBhcnNlZC5oYW5kbGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Z2V0RXhlY3V0aW9uKG5vdGVib29rOiBVUkkpOiBJTm90ZWJvb2tFeGVjdXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9va0V4ZWN1dGlvbnMuZ2V0KG5vdGVib29rKT8uWzBdO1xuXHR9XG5cblx0Z2V0Q2VsbEV4ZWN1dGlvbnNGb3JOb3RlYm9vayhub3RlYm9vazogVVJJKTogSU5vdGVib29rQ2VsbEV4ZWN1dGlvbltdIHtcblx0XHRjb25zdCBleGVNYXAgPSB0aGlzLl9leGVjdXRpb25zLmdldChub3RlYm9vayk7XG5cdFx0cmV0dXJuIGV4ZU1hcCA/IEFycmF5LmZyb20oZXhlTWFwLnZhbHVlcygpKSA6IFtdO1xuXHR9XG5cblx0Z2V0Q2VsbEV4ZWN1dGlvbnNCeUhhbmRsZUZvck5vdGVib29rKG5vdGVib29rOiBVUkkpOiBNYXA8bnVtYmVyLCBJTm90ZWJvb2tDZWxsRXhlY3V0aW9uPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZXhlTWFwID0gdGhpcy5fZXhlY3V0aW9ucy5nZXQobm90ZWJvb2spO1xuXHRcdHJldHVybiBleGVNYXAgPyBuZXcgTWFwKGV4ZU1hcC5lbnRyaWVzKCkpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25DZWxsRXhlY3V0aW9uRGlkQ2hhbmdlKG5vdGVib29rVXJpOiBVUkksIGNlbGxIYW5kbGU6IG51bWJlciwgZXhlOiBDZWxsRXhlY3V0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VFeGVjdXRpb24uZmlyZShuZXcgTm90ZWJvb2tDZWxsRXhlY3V0aW9uRXZlbnQobm90ZWJvb2tVcmksIGNlbGxIYW5kbGUsIGV4ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25DZWxsRXhlY3V0aW9uRGlkQ29tcGxldGUobm90ZWJvb2tVcmk6IFVSSSwgY2VsbEhhbmRsZTogbnVtYmVyLCBleGU6IENlbGxFeGVjdXRpb24sIGxhc3RSdW5TdWNjZXNzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IG5vdGVib29rRXhlY3V0aW9ucyA9IHRoaXMuX2V4ZWN1dGlvbnMuZ2V0KG5vdGVib29rVXJpKTtcblx0XHRpZiAoIW5vdGVib29rRXhlY3V0aW9ucykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UjX29uQ2VsbEV4ZWN1dGlvbkRpZENvbXBsZXRlIC0gdW5rbm93biBub3RlYm9vayAke25vdGVib29rVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZXhlLmRpc3Bvc2UoKTtcblx0XHRjb25zdCBjZWxsVXJpID0gQ2VsbFVyaS5nZW5lcmF0ZShub3RlYm9va1VyaSwgY2VsbEhhbmRsZSk7XG5cdFx0dGhpcy5fY2VsbExpc3RlbmVycy5nZXQoY2VsbFVyaSk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jZWxsTGlzdGVuZXJzLmRlbGV0ZShjZWxsVXJpKTtcblx0XHRub3RlYm9va0V4ZWN1dGlvbnMuZGVsZXRlKGNlbGxIYW5kbGUpO1xuXHRcdGlmIChub3RlYm9va0V4ZWN1dGlvbnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fZXhlY3V0aW9ucy5kZWxldGUobm90ZWJvb2tVcmkpO1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tMaXN0ZW5lcnMuZ2V0KG5vdGVib29rVXJpKT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tMaXN0ZW5lcnMuZGVsZXRlKG5vdGVib29rVXJpKTtcblx0XHR9XG5cblx0XHRpZiAobGFzdFJ1blN1Y2Nlc3MgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKGxhc3RSdW5TdWNjZXNzKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9leGVjdXRpb25zLnNpemUgPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwubm90ZWJvb2tDZWxsQ29tcGxldGVkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jbGVhckxhc3RGYWlsZWRDZWxsKG5vdGVib29rVXJpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5ub3RlYm9va0NlbGxGYWlsZWQpO1xuXHRcdFx0XHR0aGlzLl9zZXRMYXN0RmFpbGVkQ2VsbChub3RlYm9va1VyaSwgY2VsbEhhbmRsZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXN0Q29tcGxldGVkQ2VsbEhhbmRsZXMuc2V0KG5vdGVib29rVXJpLCBjZWxsSGFuZGxlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUV4ZWN1dGlvbi5maXJlKG5ldyBOb3RlYm9va0NlbGxFeGVjdXRpb25FdmVudChub3RlYm9va1VyaSwgY2VsbEhhbmRsZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25FeGVjdXRpb25EaWRDaGFuZ2Uobm90ZWJvb2tVcmk6IFVSSSwgZXhlOiBOb3RlYm9va0V4ZWN1dGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRXhlY3V0aW9uLmZpcmUobmV3IE5vdGVib29rRXhlY3V0aW9uRXZlbnQobm90ZWJvb2tVcmksIGV4ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25FeGVjdXRpb25EaWRDb21wbGV0ZShub3RlYm9va1VyaTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSB0aGlzLl9ub3RlYm9va0V4ZWN1dGlvbnMuZ2V0KG5vdGVib29rVXJpKTtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoZGlzcG9zYWJsZXMpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSNfb25DZWxsRXhlY3V0aW9uRGlkQ29tcGxldGUgLSB1bmtub3duIG5vdGVib29rICR7bm90ZWJvb2tVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9ub3RlYm9va0V4ZWN1dGlvbnMuZGVsZXRlKG5vdGVib29rVXJpKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUV4ZWN1dGlvbi5maXJlKG5ldyBOb3RlYm9va0V4ZWN1dGlvbkV2ZW50KG5vdGVib29rVXJpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuZm9yRWFjaChkID0+IGQuZGlzcG9zZSgpKTtcblx0fVxuXG5cdGNyZWF0ZUNlbGxFeGVjdXRpb24obm90ZWJvb2tVcmk6IFVSSSwgY2VsbEhhbmRsZTogbnVtYmVyKTogSU5vdGVib29rQ2VsbEV4ZWN1dGlvbiB7XG5cdFx0Y29uc3Qgbm90ZWJvb2sgPSB0aGlzLl9ub3RlYm9va1NlcnZpY2UuZ2V0Tm90ZWJvb2tUZXh0TW9kZWwobm90ZWJvb2tVcmkpO1xuXHRcdGlmICghbm90ZWJvb2spIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm90ZWJvb2sgbm90IGZvdW5kOiAke25vdGVib29rVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0bGV0IG5vdGVib29rRXhlY3V0aW9uTWFwID0gdGhpcy5fZXhlY3V0aW9ucy5nZXQobm90ZWJvb2tVcmkpO1xuXHRcdGlmICghbm90ZWJvb2tFeGVjdXRpb25NYXApIHtcblx0XHRcdGNvbnN0IGxpc3RlbmVycyA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rRXhlY3V0aW9uTGlzdGVuZXJzLCBub3RlYm9va1VyaSk7XG5cdFx0XHR0aGlzLl9ub3RlYm9va0xpc3RlbmVycy5zZXQobm90ZWJvb2tVcmksIGxpc3RlbmVycyk7XG5cblx0XHRcdG5vdGVib29rRXhlY3V0aW9uTWFwID0gbmV3IE1hcDxudW1iZXIsIENlbGxFeGVjdXRpb24+KCk7XG5cdFx0XHR0aGlzLl9leGVjdXRpb25zLnNldChub3RlYm9va1VyaSwgbm90ZWJvb2tFeGVjdXRpb25NYXApO1xuXHRcdH1cblxuXHRcdGxldCBleGUgPSBub3RlYm9va0V4ZWN1dGlvbk1hcC5nZXQoY2VsbEhhbmRsZSk7XG5cdFx0aWYgKCFleGUpIHtcblx0XHRcdGV4ZSA9IHRoaXMuX2NyZWF0ZU5vdGVib29rQ2VsbEV4ZWN1dGlvbihub3RlYm9vaywgY2VsbEhhbmRsZSk7XG5cdFx0XHRub3RlYm9va0V4ZWN1dGlvbk1hcC5zZXQoY2VsbEhhbmRsZSwgZXhlKTtcblx0XHRcdGV4ZS5pbml0aWFsaXplKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUV4ZWN1dGlvbi5maXJlKG5ldyBOb3RlYm9va0NlbGxFeGVjdXRpb25FdmVudChub3RlYm9va1VyaSwgY2VsbEhhbmRsZSwgZXhlKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGV4ZTtcblx0fVxuXHRjcmVhdGVFeGVjdXRpb24obm90ZWJvb2tVcmk6IFVSSSk6IElOb3RlYm9va0V4ZWN1dGlvbiB7XG5cdFx0Y29uc3Qgbm90ZWJvb2sgPSB0aGlzLl9ub3RlYm9va1NlcnZpY2UuZ2V0Tm90ZWJvb2tUZXh0TW9kZWwobm90ZWJvb2tVcmkpO1xuXHRcdGlmICghbm90ZWJvb2spIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm90ZWJvb2sgbm90IGZvdW5kOiAke25vdGVib29rVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9ub3RlYm9va0xpc3RlbmVycy5oYXMobm90ZWJvb2tVcmkpKSB7XG5cdFx0XHRjb25zdCBsaXN0ZW5lcnMgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0V4ZWN1dGlvbkxpc3RlbmVycywgbm90ZWJvb2tVcmkpO1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tMaXN0ZW5lcnMuc2V0KG5vdGVib29rVXJpLCBsaXN0ZW5lcnMpO1xuXHRcdH1cblxuXHRcdGxldCBpbmZvID0gdGhpcy5fbm90ZWJvb2tFeGVjdXRpb25zLmdldChub3RlYm9va1VyaSk7XG5cdFx0aWYgKCFpbmZvKSB7XG5cdFx0XHRpbmZvID0gdGhpcy5fY3JlYXRlTm90ZWJvb2tFeGVjdXRpb24obm90ZWJvb2spO1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tFeGVjdXRpb25zLnNldChub3RlYm9va1VyaSwgaW5mbyk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUV4ZWN1dGlvbi5maXJlKG5ldyBOb3RlYm9va0V4ZWN1dGlvbkV2ZW50KG5vdGVib29rVXJpLCBpbmZvWzBdKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluZm9bMF07XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVOb3RlYm9va0NlbGxFeGVjdXRpb24obm90ZWJvb2s6IE5vdGVib29rVGV4dE1vZGVsLCBjZWxsSGFuZGxlOiBudW1iZXIpOiBDZWxsRXhlY3V0aW9uIHtcblx0XHRjb25zdCBub3RlYm9va1VyaSA9IG5vdGVib29rLnVyaTtcblx0XHRjb25zdCBleGU6IENlbGxFeGVjdXRpb24gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsRXhlY3V0aW9uLCBjZWxsSGFuZGxlLCBub3RlYm9vayk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRcdGV4ZS5vbkRpZFVwZGF0ZSgoKSA9PiB0aGlzLl9vbkNlbGxFeGVjdXRpb25EaWRDaGFuZ2Uobm90ZWJvb2tVcmksIGNlbGxIYW5kbGUsIGV4ZSkpLFxuXHRcdFx0ZXhlLm9uRGlkQ29tcGxldGUobGFzdFJ1blN1Y2Nlc3MgPT4gdGhpcy5fb25DZWxsRXhlY3V0aW9uRGlkQ29tcGxldGUobm90ZWJvb2tVcmksIGNlbGxIYW5kbGUsIGV4ZSwgbGFzdFJ1blN1Y2Nlc3MpKSk7XG5cdFx0dGhpcy5fY2VsbExpc3RlbmVycy5zZXQoQ2VsbFVyaS5nZW5lcmF0ZShub3RlYm9va1VyaSwgY2VsbEhhbmRsZSksIGRpc3Bvc2FibGUpO1xuXG5cdFx0cmV0dXJuIGV4ZTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZU5vdGVib29rRXhlY3V0aW9uKG5vdGVib29rOiBOb3RlYm9va1RleHRNb2RlbCk6IFtOb3RlYm9va0V4ZWN1dGlvbiwgSURpc3Bvc2FibGVdIHtcblx0XHRjb25zdCBub3RlYm9va1VyaSA9IG5vdGVib29rLnVyaTtcblx0XHRjb25zdCBleGU6IE5vdGVib29rRXhlY3V0aW9uID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tFeGVjdXRpb24sIG5vdGVib29rKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdFx0ZXhlLm9uRGlkVXBkYXRlKCgpID0+IHRoaXMuX29uRXhlY3V0aW9uRGlkQ2hhbmdlKG5vdGVib29rVXJpLCBleGUpKSxcblx0XHRcdGV4ZS5vbkRpZENvbXBsZXRlKCgpID0+IHRoaXMuX29uRXhlY3V0aW9uRGlkQ29tcGxldGUobm90ZWJvb2tVcmkpKSk7XG5cdFx0cmV0dXJuIFtleGUsIGRpc3Bvc2FibGVdO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0TGFzdEZhaWxlZENlbGwobm90ZWJvb2tVUkk6IFVSSSwgY2VsbEhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldkxhc3RGYWlsZWRDZWxsSW5mbyA9IHRoaXMuX2xhc3RGYWlsZWRDZWxscy5nZXQobm90ZWJvb2tVUkkpO1xuXHRcdGNvbnN0IG5vdGVib29rID0gdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLmdldE5vdGVib29rVGV4dE1vZGVsKG5vdGVib29rVVJJKTtcblx0XHRpZiAoIW5vdGVib29rKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3TGFzdEZhaWxlZENlbGxJbmZvOiBJRmFpbGVkQ2VsbEluZm8gPSB7XG5cdFx0XHRjZWxsSGFuZGxlOiBjZWxsSGFuZGxlLFxuXHRcdFx0ZGlzcG9zYWJsZTogcHJldkxhc3RGYWlsZWRDZWxsSW5mbyA/IHByZXZMYXN0RmFpbGVkQ2VsbEluZm8uZGlzcG9zYWJsZSA6IHRoaXMuX2dldEZhaWxlZENlbGxMaXN0ZW5lcihub3RlYm9vayksXG5cdFx0XHR2aXNpYmxlOiB0cnVlXG5cdFx0fTtcblxuXHRcdHRoaXMuX2xhc3RGYWlsZWRDZWxscy5zZXQobm90ZWJvb2tVUkksIG5ld0xhc3RGYWlsZWRDZWxsSW5mbyk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUxhc3RSdW5GYWlsU3RhdGUuZmlyZSh7IHZpc2libGU6IHRydWUsIG5vdGVib29rOiBub3RlYm9va1VSSSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldExhc3RGYWlsZWRDZWxsVmlzaWJpbGl0eShub3RlYm9va1VSSTogVVJJLCB2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFzdEZhaWxlZENlbGxJbmZvID0gdGhpcy5fbGFzdEZhaWxlZENlbGxzLmdldChub3RlYm9va1VSSSk7XG5cblx0XHRpZiAobGFzdEZhaWxlZENlbGxJbmZvKSB7XG5cdFx0XHR0aGlzLl9sYXN0RmFpbGVkQ2VsbHMuc2V0KG5vdGVib29rVVJJLCB7XG5cdFx0XHRcdGNlbGxIYW5kbGU6IGxhc3RGYWlsZWRDZWxsSW5mby5jZWxsSGFuZGxlLFxuXHRcdFx0XHRkaXNwb3NhYmxlOiBsYXN0RmFpbGVkQ2VsbEluZm8uZGlzcG9zYWJsZSxcblx0XHRcdFx0dmlzaWJsZTogdmlzaWJsZSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTGFzdFJ1bkZhaWxTdGF0ZS5maXJlKHsgdmlzaWJsZTogdmlzaWJsZSwgbm90ZWJvb2s6IG5vdGVib29rVVJJIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJMYXN0RmFpbGVkQ2VsbChub3RlYm9va1VSSTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFzdEZhaWxlZENlbGxJbmZvID0gdGhpcy5fbGFzdEZhaWxlZENlbGxzLmdldChub3RlYm9va1VSSSk7XG5cblx0XHRpZiAobGFzdEZhaWxlZENlbGxJbmZvKSB7XG5cdFx0XHRsYXN0RmFpbGVkQ2VsbEluZm8uZGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fbGFzdEZhaWxlZENlbGxzLmRlbGV0ZShub3RlYm9va1VSSSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VMYXN0UnVuRmFpbFN0YXRlLmZpcmUoeyB2aXNpYmxlOiBmYWxzZSwgbm90ZWJvb2s6IG5vdGVib29rVVJJIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RmFpbGVkQ2VsbExpc3RlbmVyKG5vdGVib29rOiBOb3RlYm9va1RleHRNb2RlbCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gbm90ZWJvb2sub25XaWxsQWRkUmVtb3ZlQ2VsbHMoKGU6IE5vdGVib29rVGV4dE1vZGVsV2lsbEFkZFJlbW92ZUV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBsYXN0RmFpbGVkQ2VsbCA9IHRoaXMuX2xhc3RGYWlsZWRDZWxscy5nZXQobm90ZWJvb2sudXJpKT8uY2VsbEhhbmRsZTtcblx0XHRcdGlmIChsYXN0RmFpbGVkQ2VsbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IGxhc3RGYWlsZWRDZWxsUG9zID0gbm90ZWJvb2suY2VsbHMuZmluZEluZGV4KGMgPT4gYy5oYW5kbGUgPT09IGxhc3RGYWlsZWRDZWxsKTtcblx0XHRcdFx0ZS5yYXdFdmVudC5jaGFuZ2VzLmZvckVhY2goKFtzdGFydCwgZGVsZXRlQ291bnQsIGFkZGVkQ2VsbHNdKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGRlbGV0ZUNvdW50KSB7XG5cdFx0XHRcdFx0XHRpZiAobGFzdEZhaWxlZENlbGxQb3MgPj0gc3RhcnQgJiYgbGFzdEZhaWxlZENlbGxQb3MgPCBzdGFydCArIGRlbGV0ZUNvdW50KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3NldExhc3RGYWlsZWRDZWxsVmlzaWJpbGl0eShub3RlYm9vay51cmksIGZhbHNlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoYWRkZWRDZWxscy5zb21lKGNlbGwgPT4gY2VsbC5oYW5kbGUgPT09IGxhc3RGYWlsZWRDZWxsKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2V0TGFzdEZhaWxlZENlbGxWaXNpYmlsaXR5KG5vdGVib29rLnVyaSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZXhlY3V0aW9ucy5mb3JFYWNoKGV4ZWN1dGlvbk1hcCA9PiB7XG5cdFx0XHRleGVjdXRpb25NYXAuZm9yRWFjaChleGVjdXRpb24gPT4gZXhlY3V0aW9uLmRpc3Bvc2UoKSk7XG5cdFx0XHRleGVjdXRpb25NYXAuY2xlYXIoKTtcblx0XHR9KTtcblx0XHR0aGlzLl9leGVjdXRpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5fbm90ZWJvb2tFeGVjdXRpb25zLmZvckVhY2goZGlzcG9zYWJsZXMgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZm9yRWFjaChkID0+IGQuZGlzcG9zZSgpKTtcblx0XHR9KTtcblx0XHR0aGlzLl9ub3RlYm9va0V4ZWN1dGlvbnMuY2xlYXIoKTtcblxuXHRcdHRoaXMuX2NlbGxMaXN0ZW5lcnMuZm9yRWFjaChkaXNwb3NhYmxlID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblx0XHR0aGlzLl9ub3RlYm9va0xpc3RlbmVycy5mb3JFYWNoKGRpc3Bvc2FibGUgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkpO1xuXHRcdHRoaXMuX2xhc3RGYWlsZWRDZWxscy5mb3JFYWNoKGVsZW0gPT4gZWxlbS5kaXNwb3NhYmxlLmRpc3Bvc2UoKSk7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tDZWxsRXhlY3V0aW9uRXZlbnQgaW1wbGVtZW50cyBJQ2VsbEV4ZWN1dGlvblN0YXRlQ2hhbmdlZEV2ZW50IHtcblx0cmVhZG9ubHkgdHlwZSA9IE5vdGVib29rRXhlY3V0aW9uVHlwZS5jZWxsO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBub3RlYm9vazogVVJJLFxuXHRcdHJlYWRvbmx5IGNlbGxIYW5kbGU6IG51bWJlcixcblx0XHRyZWFkb25seSBjaGFuZ2VkPzogQ2VsbEV4ZWN1dGlvblxuXHQpIHsgfVxuXG5cdGFmZmVjdHNDZWxsKGNlbGw6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHBhcnNlZFVyaSA9IENlbGxVcmkucGFyc2UoY2VsbCk7XG5cdFx0cmV0dXJuICEhcGFyc2VkVXJpICYmIGlzRXF1YWwodGhpcy5ub3RlYm9vaywgcGFyc2VkVXJpLm5vdGVib29rKSAmJiB0aGlzLmNlbGxIYW5kbGUgPT09IHBhcnNlZFVyaS5oYW5kbGU7XG5cdH1cblxuXHRhZmZlY3RzTm90ZWJvb2sobm90ZWJvb2s6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc0VxdWFsKHRoaXMubm90ZWJvb2ssIG5vdGVib29rKTtcblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va0V4ZWN1dGlvbkV2ZW50IGltcGxlbWVudHMgSUV4ZWN1dGlvblN0YXRlQ2hhbmdlZEV2ZW50IHtcblx0cmVhZG9ubHkgdHlwZSA9IE5vdGVib29rRXhlY3V0aW9uVHlwZS5ub3RlYm9vaztcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbm90ZWJvb2s6IFVSSSxcblx0XHRyZWFkb25seSBjaGFuZ2VkPzogTm90ZWJvb2tFeGVjdXRpb25cblx0KSB7IH1cblxuXHRhZmZlY3RzTm90ZWJvb2sobm90ZWJvb2s6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc0VxdWFsKHRoaXMubm90ZWJvb2ssIG5vdGVib29rKTtcblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va0V4ZWN1dGlvbkxpc3RlbmVycyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va01vZGVsOiBOb3RlYm9va1RleHRNb2RlbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRub3RlYm9vazogVVJJLFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRASU5vdGVib29rS2VybmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0tlcm5lbFNlcnZpY2U6IElOb3RlYm9va0tlcm5lbFNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgTm90ZWJvb2tFeGVjdXRpb24jY3RvciAke25vdGVib29rLnRvU3RyaW5nKCl9YCk7XG5cblx0XHRjb25zdCBub3RlYm9va01vZGVsID0gdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLmdldE5vdGVib29rVGV4dE1vZGVsKG5vdGVib29rKTtcblx0XHRpZiAoIW5vdGVib29rTW9kZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm90ZWJvb2sgbm90IGZvdW5kOiAnICsgbm90ZWJvb2spO1xuXHRcdH1cblxuXHRcdHRoaXMuX25vdGVib29rTW9kZWwgPSBub3RlYm9va01vZGVsO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25vdGVib29rTW9kZWwub25XaWxsQWRkUmVtb3ZlQ2VsbHMoZSA9PiB0aGlzLm9uV2lsbEFkZFJlbW92ZUNlbGxzKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90ZWJvb2tNb2RlbC5vbldpbGxEaXNwb3NlKCgpID0+IHRoaXMub25XaWxsRGlzcG9zZURvY3VtZW50KCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY2FuY2VsQWxsKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYE5vdGVib29rRXhlY3V0aW9uTGlzdGVuZXJzI2NhbmNlbEFsbGApO1xuXHRcdGNvbnN0IGV4ZXMgPSB0aGlzLl9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5nZXRDZWxsRXhlY3V0aW9uc0Zvck5vdGVib29rKHRoaXMuX25vdGVib29rTW9kZWwudXJpKTtcblx0XHR0aGlzLl9ub3RlYm9va0V4ZWN1dGlvblNlcnZpY2UuY2FuY2VsTm90ZWJvb2tDZWxsSGFuZGxlcyh0aGlzLl9ub3RlYm9va01vZGVsLCBleGVzLm1hcChleGUgPT4gZXhlLmNlbGxIYW5kbGUpKTtcblx0fVxuXG5cdHByaXZhdGUgb25XaWxsRGlzcG9zZURvY3VtZW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYE5vdGVib29rRXhlY3V0aW9uI29uV2lsbERpc3Bvc2VEb2N1bWVudGApO1xuXHRcdHRoaXMuY2FuY2VsQWxsKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uV2lsbEFkZFJlbW92ZUNlbGxzKGU6IE5vdGVib29rVGV4dE1vZGVsV2lsbEFkZFJlbW92ZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tFeGVzID0gdGhpcy5fbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuZ2V0Q2VsbEV4ZWN1dGlvbnNCeUhhbmRsZUZvck5vdGVib29rKHRoaXMuX25vdGVib29rTW9kZWwudXJpKTtcblxuXHRcdGNvbnN0IGV4ZWN1dGluZ0RlbGV0ZWRIYW5kbGVzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0Y29uc3QgcGVuZGluZ0RlbGV0ZWRIYW5kbGVzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0aWYgKG5vdGVib29rRXhlcykge1xuXHRcdFx0ZS5yYXdFdmVudC5jaGFuZ2VzLmZvckVhY2goKFtzdGFydCwgZGVsZXRlQ291bnRdKSA9PiB7XG5cdFx0XHRcdGlmIChkZWxldGVDb3VudCkge1xuXHRcdFx0XHRcdGNvbnN0IGRlbGV0ZWRIYW5kbGVzID0gdGhpcy5fbm90ZWJvb2tNb2RlbC5jZWxscy5zbGljZShzdGFydCwgc3RhcnQgKyBkZWxldGVDb3VudCkubWFwKGMgPT4gYy5oYW5kbGUpO1xuXHRcdFx0XHRcdGRlbGV0ZWRIYW5kbGVzLmZvckVhY2goaCA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBleGUgPSBub3RlYm9va0V4ZXMuZ2V0KGgpO1xuXHRcdFx0XHRcdFx0aWYgKGV4ZT8uc3RhdGUgPT09IE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlLkV4ZWN1dGluZykge1xuXHRcdFx0XHRcdFx0XHRleGVjdXRpbmdEZWxldGVkSGFuZGxlcy5hZGQoaCk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGV4ZSkge1xuXHRcdFx0XHRcdFx0XHRwZW5kaW5nRGVsZXRlZEhhbmRsZXMuYWRkKGgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoZXhlY3V0aW5nRGVsZXRlZEhhbmRsZXMuc2l6ZSB8fCBwZW5kaW5nRGVsZXRlZEhhbmRsZXMuc2l6ZSkge1xuXHRcdFx0Y29uc3Qga2VybmVsID0gdGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldFNlbGVjdGVkT3JTdWdnZXN0ZWRLZXJuZWwodGhpcy5fbm90ZWJvb2tNb2RlbCk7XG5cdFx0XHRpZiAoa2VybmVsKSB7XG5cdFx0XHRcdGNvbnN0IGltcGxlbWVudHNJbnRlcnJ1cHQgPSBrZXJuZWwuaW1wbGVtZW50c0ludGVycnVwdDtcblx0XHRcdFx0Y29uc3QgaGFuZGxlc1RvQ2FuY2VsID0gaW1wbGVtZW50c0ludGVycnVwdCA/IFsuLi5leGVjdXRpbmdEZWxldGVkSGFuZGxlc10gOiBbLi4uZXhlY3V0aW5nRGVsZXRlZEhhbmRsZXMsIC4uLnBlbmRpbmdEZWxldGVkSGFuZGxlc107XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYE5vdGVib29rRXhlY3V0aW9uI29uV2lsbEFkZFJlbW92ZUNlbGxzLCAke0pTT04uc3RyaW5naWZ5KFsuLi5oYW5kbGVzVG9DYW5jZWxdKX1gKTtcblx0XHRcdFx0aWYgKGhhbmRsZXNUb0NhbmNlbC5sZW5ndGgpIHtcblx0XHRcdFx0XHRrZXJuZWwuY2FuY2VsTm90ZWJvb2tDZWxsRXhlY3V0aW9uKHRoaXMuX25vdGVib29rTW9kZWwudXJpLCBoYW5kbGVzVG9DYW5jZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVRvRWRpdCh1cGRhdGU6IElDZWxsRXhlY3V0ZVVwZGF0ZSwgY2VsbEhhbmRsZTogbnVtYmVyKTogSUNlbGxFZGl0T3BlcmF0aW9uIHtcblx0aWYgKHVwZGF0ZS5lZGl0VHlwZSA9PT0gQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUuT3V0cHV0KSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0LFxuXHRcdFx0aGFuZGxlOiB1cGRhdGUuY2VsbEhhbmRsZSxcblx0XHRcdGFwcGVuZDogdXBkYXRlLmFwcGVuZCxcblx0XHRcdG91dHB1dHM6IHVwZGF0ZS5vdXRwdXRzLFxuXHRcdH07XG5cdH0gZWxzZSBpZiAodXBkYXRlLmVkaXRUeXBlID09PSBDZWxsRXhlY3V0aW9uVXBkYXRlVHlwZS5PdXRwdXRJdGVtcykge1xuXHRcdHJldHVybiB7XG5cdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dEl0ZW1zLFxuXHRcdFx0aXRlbXM6IHVwZGF0ZS5pdGVtcyxcblx0XHRcdGFwcGVuZDogdXBkYXRlLmFwcGVuZCxcblx0XHRcdG91dHB1dElkOiB1cGRhdGUub3V0cHV0SWRcblx0XHR9O1xuXHR9IGVsc2UgaWYgKHVwZGF0ZS5lZGl0VHlwZSA9PT0gQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUuRXhlY3V0aW9uU3RhdGUpIHtcblx0XHRjb25zdCBuZXdJbnRlcm5hbE1ldGFkYXRhOiBQYXJ0aWFsPE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGE+ID0ge307XG5cdFx0aWYgKHR5cGVvZiB1cGRhdGUuZXhlY3V0aW9uT3JkZXIgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRuZXdJbnRlcm5hbE1ldGFkYXRhLmV4ZWN1dGlvbk9yZGVyID0gdXBkYXRlLmV4ZWN1dGlvbk9yZGVyO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIHVwZGF0ZS5ydW5TdGFydFRpbWUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRuZXdJbnRlcm5hbE1ldGFkYXRhLnJ1blN0YXJ0VGltZSA9IHVwZGF0ZS5ydW5TdGFydFRpbWU7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlBhcnRpYWxJbnRlcm5hbE1ldGFkYXRhLFxuXHRcdFx0aGFuZGxlOiBjZWxsSGFuZGxlLFxuXHRcdFx0aW50ZXJuYWxNZXRhZGF0YTogbmV3SW50ZXJuYWxNZXRhZGF0YVxuXHRcdH07XG5cdH1cblxuXHR0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gY2VsbCB1cGRhdGUgdHlwZScpO1xufVxuXG5jbGFzcyBDZWxsRXhlY3V0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOb3RlYm9va0NlbGxFeGVjdXRpb24ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZSA9IHRoaXMuX29uRGlkVXBkYXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ29tcGxldGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDb21wbGV0ZSA9IHRoaXMuX29uRGlkQ29tcGxldGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfc3RhdGU6IE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlID0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3RhdGUuVW5jb25maXJtZWQ7XG5cdGdldCBzdGF0ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhdGU7XG5cdH1cblxuXHRnZXQgbm90ZWJvb2soKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2tNb2RlbC51cmk7XG5cdH1cblxuXHRwcml2YXRlIF9kaWRQYXVzZSA9IGZhbHNlO1xuXHRnZXQgZGlkUGF1c2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2RpZFBhdXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNQYXVzZWQgPSBmYWxzZTtcblx0Z2V0IGlzUGF1c2VkKCkge1xuXHRcdHJldHVybiB0aGlzLl9pc1BhdXNlZDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGNlbGxIYW5kbGU6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va01vZGVsOiBOb3RlYm9va1RleHRNb2RlbCxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgQ2VsbEV4ZWN1dGlvbiNjdG9yICR7dGhpcy5nZXRDZWxsTG9nKCl9YCk7XG5cdH1cblxuXHRpbml0aWFsaXplKCkge1xuXHRcdGNvbnN0IHN0YXJ0RXhlY3V0ZUVkaXQ6IElDZWxsRWRpdE9wZXJhdGlvbiA9IHtcblx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUGFydGlhbEludGVybmFsTWV0YWRhdGEsXG5cdFx0XHRoYW5kbGU6IHRoaXMuY2VsbEhhbmRsZSxcblx0XHRcdGludGVybmFsTWV0YWRhdGE6IHtcblx0XHRcdFx0ZXhlY3V0aW9uSWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRydW5TdGFydFRpbWU6IG51bGwsXG5cdFx0XHRcdHJ1bkVuZFRpbWU6IG51bGwsXG5cdFx0XHRcdGxhc3RSdW5TdWNjZXNzOiBudWxsLFxuXHRcdFx0XHRleGVjdXRpb25PcmRlcjogbnVsbCxcblx0XHRcdFx0cmVuZGVyRHVyYXRpb246IG51bGwsXG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9hcHBseUV4ZWN1dGlvbkVkaXRzKFtzdGFydEV4ZWN1dGVFZGl0XSk7XG5cdH1cblxuXHRwcml2YXRlIGdldENlbGxMb2coKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5fbm90ZWJvb2tNb2RlbC51cmkudG9TdHJpbmcoKX0sICR7dGhpcy5jZWxsSGFuZGxlfWA7XG5cdH1cblxuXHRwcml2YXRlIGxvZ1VwZGF0ZXModXBkYXRlczogSUNlbGxFeGVjdXRlVXBkYXRlW10pOiB2b2lkIHtcblx0XHRjb25zdCB1cGRhdGVUeXBlcyA9IHVwZGF0ZXMubWFwKHUgPT4gQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGVbdS5lZGl0VHlwZV0pLmpvaW4oJywgJyk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgQ2VsbEV4ZWN1dGlvbiN1cGRhdGVFeGVjdXRpb24gJHt0aGlzLmdldENlbGxMb2coKX0sIFske3VwZGF0ZVR5cGVzfV1gKTtcblx0fVxuXG5cdGNvbmZpcm0oKSB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgQ2VsbEV4ZWN1dGlvbiNjb25maXJtICR7dGhpcy5nZXRDZWxsTG9nKCl9YCk7XG5cdFx0dGhpcy5fc3RhdGUgPSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZS5QZW5kaW5nO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlLmZpcmUoKTtcblx0fVxuXG5cdHVwZGF0ZSh1cGRhdGVzOiBJQ2VsbEV4ZWN1dGVVcGRhdGVbXSk6IHZvaWQge1xuXHRcdHRoaXMubG9nVXBkYXRlcyh1cGRhdGVzKTtcblx0XHRpZiAodXBkYXRlcy5zb21lKHUgPT4gdS5lZGl0VHlwZSA9PT0gQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUuRXhlY3V0aW9uU3RhdGUpKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlLkV4ZWN1dGluZztcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2RpZFBhdXNlICYmIHVwZGF0ZXMuc29tZSh1ID0+IHUuZWRpdFR5cGUgPT09IENlbGxFeGVjdXRpb25VcGRhdGVUeXBlLkV4ZWN1dGlvblN0YXRlICYmIHUuZGlkUGF1c2UpKSB7XG5cdFx0XHR0aGlzLl9kaWRQYXVzZSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdElzUGF1c2VkVXBkYXRlID0gWy4uLnVwZGF0ZXNdLnJldmVyc2UoKS5maW5kKHUgPT4gdS5lZGl0VHlwZSA9PT0gQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUuRXhlY3V0aW9uU3RhdGUgJiYgdHlwZW9mIHUuaXNQYXVzZWQgPT09ICdib29sZWFuJyk7XG5cdFx0aWYgKGxhc3RJc1BhdXNlZFVwZGF0ZSkge1xuXHRcdFx0dGhpcy5faXNQYXVzZWQgPSAobGFzdElzUGF1c2VkVXBkYXRlIGFzIElDZWxsRXhlY3V0aW9uU3RhdGVVcGRhdGUpLmlzUGF1c2VkITtcblx0XHR9XG5cblx0XHRjb25zdCBjZWxsTW9kZWwgPSB0aGlzLl9ub3RlYm9va01vZGVsLmNlbGxzLmZpbmQoYyA9PiBjLmhhbmRsZSA9PT0gdGhpcy5jZWxsSGFuZGxlKTtcblx0XHRpZiAoIWNlbGxNb2RlbCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgQ2VsbEV4ZWN1dGlvbiN1cGRhdGUsIHVwZGF0aW5nIGNlbGwgbm90IGluIG5vdGVib29rOiAke3RoaXMuX25vdGVib29rTW9kZWwudXJpLnRvU3RyaW5nKCl9LCAke3RoaXMuY2VsbEhhbmRsZX1gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZWRpdHMgPSB1cGRhdGVzLm1hcCh1cGRhdGUgPT4gdXBkYXRlVG9FZGl0KHVwZGF0ZSwgdGhpcy5jZWxsSGFuZGxlKSk7XG5cdFx0XHR0aGlzLl9hcHBseUV4ZWN1dGlvbkVkaXRzKGVkaXRzKTtcblx0XHR9XG5cblx0XHRpZiAodXBkYXRlcy5zb21lKHUgPT4gdS5lZGl0VHlwZSA9PT0gQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUuRXhlY3V0aW9uU3RhdGUpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFVwZGF0ZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0Y29tcGxldGUoY29tcGxldGlvbkRhdGE6IElDZWxsRXhlY3V0aW9uQ29tcGxldGUpOiB2b2lkIHtcblx0XHRjb25zdCBjZWxsTW9kZWwgPSB0aGlzLl9ub3RlYm9va01vZGVsLmNlbGxzLmZpbmQoYyA9PiBjLmhhbmRsZSA9PT0gdGhpcy5jZWxsSGFuZGxlKTtcblx0XHRpZiAoIWNlbGxNb2RlbCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgQ2VsbEV4ZWN1dGlvbiNjb21wbGV0ZSwgY29tcGxldGluZyBjZWxsIG5vdCBpbiBub3RlYm9vazogJHt0aGlzLl9ub3RlYm9va01vZGVsLnVyaS50b1N0cmluZygpfSwgJHt0aGlzLmNlbGxIYW5kbGV9YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGVkaXQ6IElDZWxsRWRpdE9wZXJhdGlvbiA9IHtcblx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5QYXJ0aWFsSW50ZXJuYWxNZXRhZGF0YSxcblx0XHRcdFx0aGFuZGxlOiB0aGlzLmNlbGxIYW5kbGUsXG5cdFx0XHRcdGludGVybmFsTWV0YWRhdGE6IHtcblx0XHRcdFx0XHRsYXN0UnVuU3VjY2VzczogY29tcGxldGlvbkRhdGEubGFzdFJ1blN1Y2Nlc3MsXG5cdFx0XHRcdFx0cnVuU3RhcnRUaW1lOiB0aGlzLl9kaWRQYXVzZSA/IG51bGwgOiBjZWxsTW9kZWwuaW50ZXJuYWxNZXRhZGF0YS5ydW5TdGFydFRpbWUsXG5cdFx0XHRcdFx0cnVuRW5kVGltZTogdGhpcy5fZGlkUGF1c2UgPyBudWxsIDogY29tcGxldGlvbkRhdGEucnVuRW5kVGltZSxcblx0XHRcdFx0XHRlcnJvcjogY29tcGxldGlvbkRhdGEuZXJyb3Jcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX2FwcGx5RXhlY3V0aW9uRWRpdHMoW2VkaXRdKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENvbXBsZXRlLmZpcmUoY29tcGxldGlvbkRhdGEubGFzdFJ1blN1Y2Nlc3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlFeGVjdXRpb25FZGl0cyhlZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10pOiB2b2lkIHtcblx0XHR0aGlzLl9ub3RlYm9va01vZGVsLmFwcGx5RWRpdHMoZWRpdHMsIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va0V4ZWN1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTm90ZWJvb2tFeGVjdXRpb24ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZSA9IHRoaXMuX29uRGlkVXBkYXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ29tcGxldGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDb21wbGV0ZSA9IHRoaXMuX29uRGlkQ29tcGxldGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfc3RhdGU6IE5vdGVib29rRXhlY3V0aW9uU3RhdGUgPSBOb3RlYm9va0V4ZWN1dGlvblN0YXRlLlVuY29uZmlybWVkO1xuXHRnZXQgc3RhdGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRlO1xuXHR9XG5cblx0Z2V0IG5vdGVib29rKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuX25vdGVib29rTW9kZWwudXJpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tNb2RlbDogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYE5vdGVib29rRXhlY3V0aW9uI2N0b3JgKTtcblx0fVxuXHRwcml2YXRlIGRlYnVnKG1lc3NhZ2U6IHN0cmluZykge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYCR7bWVzc2FnZX0gJHt0aGlzLl9ub3RlYm9va01vZGVsLnVyaS50b1N0cmluZygpfWApO1xuXHR9XG5cblx0Y29uZmlybSgpIHtcblx0XHR0aGlzLmRlYnVnKGBFeGVjdXRpb24jY29uZmlybWApO1xuXHRcdHRoaXMuX3N0YXRlID0gTm90ZWJvb2tFeGVjdXRpb25TdGF0ZS5QZW5kaW5nO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlLmZpcmUoKTtcblx0fVxuXG5cdGJlZ2luKCk6IHZvaWQge1xuXHRcdHRoaXMuZGVidWcoYEV4ZWN1dGlvbiNiZWdpbmApO1xuXHRcdHRoaXMuX3N0YXRlID0gTm90ZWJvb2tFeGVjdXRpb25TdGF0ZS5FeGVjdXRpbmc7XG5cdFx0dGhpcy5fb25EaWRVcGRhdGUuZmlyZSgpO1xuXHR9XG5cblx0Y29tcGxldGUoKTogdm9pZCB7XG5cdFx0dGhpcy5kZWJ1ZyhgRXhlY3V0aW9uI2JlZ2luYCk7XG5cdFx0dGhpcy5fc3RhdGUgPSBOb3RlYm9va0V4ZWN1dGlvblN0YXRlLlVu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
