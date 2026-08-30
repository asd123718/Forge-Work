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
import { groupBy } from "../../../../../base/common/collections.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { clamp } from "../../../../../base/common/numbers.js";
import * as strings from "../../../../../base/common/strings.js";
import { IBulkEditService, ResourceTextEdit } from "../../../../../editor/browser/services/bulkEditService.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { TrackedRangeStickiness } from "../../../../../editor/common/model.js";
import { MultiModelEditStackElement, SingleModelEditStackElement } from "../../../../../editor/common/model/editStack.js";
import { IntervalNode, IntervalTree } from "../../../../../editor/common/model/intervalTree.js";
import { ModelDecorationOptions } from "../../../../../editor/common/model/textModel.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IUndoRedoService } from "../../../../../platform/undoRedo/common/undoRedo.js";
import { CellFindMatchModel } from "../contrib/find/findModel.js";
import { CellEditState, CellFoldingState, isNotebookCellDecoration } from "../notebookBrowser.js";
import { NotebookMetadataChangedEvent } from "../notebookViewEvents.js";
import { NotebookCellSelectionCollection } from "./cellSelectionCollection.js";
import { CodeCellViewModel } from "./codeCellViewModel.js";
import { MarkupCellViewModel } from "./markupCellViewModel.js";
import { CellKind, NotebookCellsChangeType, NotebookFindScopeType, SelectionStateType } from "../../common/notebookCommon.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../common/notebookExecutionStateService.js";
import { cellIndexesToRanges, cellRangesToIndexes, reduceCellRanges } from "../../common/notebookRange.js";
const invalidFunc = () => {
  throw new Error(`Invalid change accessor`);
};
class DecorationsTree {
  constructor() {
    this._decorationsTree = new IntervalTree();
  }
  intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations = false) {
    const r1 = this._decorationsTree.intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
    return r1;
  }
  search(filterOwnerId, filterOutValidation, filterFontDecorations, overviewRulerOnly, cachedVersionId, onlyMarginDecorations) {
    return this._decorationsTree.search(filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
  }
  collectNodesFromOwner(ownerId) {
    const r1 = this._decorationsTree.collectNodesFromOwner(ownerId);
    return r1;
  }
  collectNodesPostOrder() {
    const r1 = this._decorationsTree.collectNodesPostOrder();
    return r1;
  }
  insert(node) {
    this._decorationsTree.insert(node);
  }
  delete(node) {
    this._decorationsTree.delete(node);
  }
  resolveNode(node, cachedVersionId) {
    this._decorationsTree.resolveNode(node, cachedVersionId);
  }
  acceptReplace(offset, length, textLength, forceMoveMarkers) {
    this._decorationsTree.acceptReplace(offset, length, textLength, forceMoveMarkers);
  }
}
const TRACKED_RANGE_OPTIONS = [
  ModelDecorationOptions.register({ description: "notebook-view-model-tracked-range-always-grows-when-typing-at-edges", stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges }),
  ModelDecorationOptions.register({ description: "notebook-view-model-tracked-range-never-grows-when-typing-at-edges", stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }),
  ModelDecorationOptions.register({ description: "notebook-view-model-tracked-range-grows-only-when-typing-before", stickiness: TrackedRangeStickiness.GrowsOnlyWhenTypingBefore }),
  ModelDecorationOptions.register({ description: "notebook-view-model-tracked-range-grows-only-when-typing-after", stickiness: TrackedRangeStickiness.GrowsOnlyWhenTypingAfter })
];
function _normalizeOptions(options) {
  if (options instanceof ModelDecorationOptions) {
    return options;
  }
  return ModelDecorationOptions.createDynamic(options);
}
let MODEL_ID = 0;
let NotebookViewModel = class extends Disposable {
  constructor(viewType, _notebook, _viewContext, _layoutInfo, _options, _instantiationService, _bulkEditService, _undoService, _textModelService, notebookExecutionStateService) {
    super();
    this.viewType = viewType;
    this._notebook = _notebook;
    this._viewContext = _viewContext;
    this._layoutInfo = _layoutInfo;
    this._options = _options;
    this._instantiationService = _instantiationService;
    this._bulkEditService = _bulkEditService;
    this._undoService = _undoService;
    this._textModelService = _textModelService;
    this.notebookExecutionStateService = notebookExecutionStateService;
    this._localStore = this._register(new DisposableStore());
    this._handleToViewCellMapping = /* @__PURE__ */ new Map();
    this._onDidChangeOptions = this._register(new Emitter());
    this._viewCells = [];
    this._onDidChangeViewCells = this._register(new Emitter());
    this._lastNotebookEditResource = [];
    this._onDidChangeSelection = this._register(new Emitter());
    this._selectionCollection = this._register(new NotebookCellSelectionCollection());
    this._decorationsTree = new DecorationsTree();
    this._decorations = /* @__PURE__ */ Object.create(null);
    this._lastDecorationId = 0;
    this._foldingRanges = null;
    this._onDidFoldingStateChanged = this._register(new Emitter());
    this.onDidFoldingStateChanged = this._onDidFoldingStateChanged.event;
    this._hiddenRanges = [];
    this._focused = true;
    this._decorationIdToCellMap = /* @__PURE__ */ new Map();
    this._statusBarItemIdToCellMap = /* @__PURE__ */ new Map();
    this._lastOverviewRulerDecorationId = 0;
    this._overviewRulerDecorations = /* @__PURE__ */ new Map();
    MODEL_ID++;
    this.id = "$notebookViewModel" + MODEL_ID;
    this._instanceId = strings.singleLetterHash(MODEL_ID);
    const compute = (changes, synchronous) => {
      const diffs = changes.map((splice) => {
        return [splice[0], splice[1], splice[2].map((cell) => {
          return createCellViewModel(this._instantiationService, this, cell, this._viewContext);
        })];
      });
      diffs.reverse().forEach((diff) => {
        const deletedCells = this._viewCells.splice(diff[0], diff[1], ...diff[2]);
        this._decorationsTree.acceptReplace(diff[0], diff[1], diff[2].length, true);
        deletedCells.forEach((cell) => {
          this._handleToViewCellMapping.delete(cell.handle);
          this._localStore.delete(cell);
        });
        diff[2].forEach((cell) => {
          this._handleToViewCellMapping.set(cell.handle, cell);
          this._localStore.add(cell);
        });
      });
      const selectionHandles = this.selectionHandles;
      this._onDidChangeViewCells.fire({
        synchronous,
        splices: diffs
      });
      let endSelectionHandles = [];
      if (selectionHandles.length) {
        const primaryHandle = selectionHandles[0];
        const primarySelectionIndex = this._viewCells.indexOf(this.getCellByHandle(primaryHandle));
        endSelectionHandles = [primaryHandle];
        let delta = 0;
        for (let i = 0; i < diffs.length; i++) {
          const diff = diffs[0];
          if (diff[0] + diff[1] <= primarySelectionIndex) {
            delta += diff[2].length - diff[1];
            continue;
          }
          if (diff[0] > primarySelectionIndex) {
            endSelectionHandles = [primaryHandle];
            break;
          }
          if (diff[0] + diff[1] > primarySelectionIndex) {
            endSelectionHandles = [this._viewCells[diff[0] + delta].handle];
            break;
          }
        }
      }
      const selectionIndexes = endSelectionHandles.map((handle) => this._viewCells.findIndex((cell) => cell.handle === handle));
      this._selectionCollection.setState(cellIndexesToRanges([selectionIndexes[0]])[0], cellIndexesToRanges(selectionIndexes), true, "model");
    };
    this._register(this._notebook.onDidChangeContent((e) => {
      for (let i = 0; i < e.rawEvents.length; i++) {
        const change = e.rawEvents[i];
        let changes = [];
        const synchronous = e.synchronous ?? true;
        if (change.kind === NotebookCellsChangeType.ModelChange || change.kind === NotebookCellsChangeType.Initialize) {
          changes = change.changes;
          compute(changes, synchronous);
          continue;
        } else if (change.kind === NotebookCellsChangeType.Move) {
          compute([[change.index, change.length, []]], synchronous);
          compute([[change.newIdx, 0, change.cells]], synchronous);
        } else {
          continue;
        }
      }
    }));
    this._register(this._notebook.onDidChangeContent((contentChanges) => {
      contentChanges.rawEvents.forEach((e) => {
        if (e.kind === NotebookCellsChangeType.ChangeDocumentMetadata) {
          this._viewContext.eventDispatcher.emit([new NotebookMetadataChangedEvent(this._notebook.metadata)]);
        }
      });
      if (contentChanges.endSelectionState) {
        this.updateSelectionsState(contentChanges.endSelectionState);
      }
    }));
    this._register(this._viewContext.eventDispatcher.onDidChangeLayout((e) => {
      this._layoutInfo = e.value;
      this._viewCells.forEach((cell) => {
        if (cell.cellKind === CellKind.Markup) {
          if (e.source.width || e.source.fontInfo) {
            cell.layoutChange({ outerWidth: e.value.width, font: e.value.fontInfo });
          }
        } else {
          if (e.source.width !== void 0) {
            cell.layoutChange({ outerWidth: e.value.width, font: e.value.fontInfo });
          }
        }
      });
    }));
    this._register(this._viewContext.notebookOptions.onDidChangeOptions((e) => {
      for (let i = 0; i < this.length; i++) {
        const cell = this._viewCells[i];
        cell.updateOptions(e);
      }
    }));
    this._register(notebookExecutionStateService.onDidChangeExecution((e) => {
      if (e.type !== NotebookExecutionType.cell) {
        return;
      }
      const cell = this.getCellByHandle(e.cellHandle);
      if (cell instanceof CodeCellViewModel) {
        cell.updateExecutionState(e);
      }
    }));
    this._register(this._selectionCollection.onDidChangeSelection((e) => {
      this._onDidChangeSelection.fire(e);
    }));
    const viewCellCount = this.isRepl ? this._notebook.cells.length - 1 : this._notebook.cells.length;
    for (let i = 0; i < viewCellCount; i++) {
      this._viewCells.push(createCellViewModel(this._instantiationService, this, this._notebook.cells[i], this._viewContext));
    }
    this._viewCells.forEach((cell) => {
      this._handleToViewCellMapping.set(cell.handle, cell);
    });
  }
  get options() {
    return this._options;
  }
  get onDidChangeOptions() {
    return this._onDidChangeOptions.event;
  }
  get viewCells() {
    return this._viewCells;
  }
  get length() {
    return this._viewCells.length;
  }
  get notebookDocument() {
    return this._notebook;
  }
  get uri() {
    return this._notebook.uri;
  }
  get metadata() {
    return this._notebook.metadata;
  }
  get isRepl() {
    return this.viewType === "repl";
  }
  get onDidChangeViewCells() {
    return this._onDidChangeViewCells.event;
  }
  get lastNotebookEditResource() {
    if (this._lastNotebookEditResource.length) {
      return this._lastNotebookEditResource[this._lastNotebookEditResource.length - 1];
    }
    return null;
  }
  get layoutInfo() {
    return this._layoutInfo;
  }
  get onDidChangeSelection() {
    return this._onDidChangeSelection.event;
  }
  get selectionHandles() {
    const handlesSet = /* @__PURE__ */ new Set();
    const handles = [];
    cellRangesToIndexes(this._selectionCollection.selections).map((index) => index < this.length ? this.cellAt(index) : void 0).forEach((cell) => {
      if (cell && !handlesSet.has(cell.handle)) {
        handlesSet.add(cell.handle);
        handles.push(cell.handle);
      }
    });
    return handles;
  }
  set selectionHandles(selectionHandles) {
    const indexes = selectionHandles.map((handle) => this._viewCells.findIndex((cell) => cell.handle === handle));
    this._selectionCollection.setSelections(cellIndexesToRanges(indexes), true, "model");
  }
  get focused() {
    return this._focused;
  }
  updateOptions(newOptions) {
    this._options = { ...this._options, ...newOptions };
    this._viewCells.forEach((cell) => cell.updateOptions({ readonly: this._options.isReadOnly }));
    this._onDidChangeOptions.fire();
  }
  getFocus() {
    return this._selectionCollection.focus;
  }
  getSelections() {
    return this._selectionCollection.selections;
  }
  getMostRecentlyExecutedCell() {
    const handle = this.notebookExecutionStateService.getLastCompletedCellForNotebook(this._notebook.uri);
    return handle !== void 0 ? this.getCellByHandle(handle) : void 0;
  }
  setEditorFocus(focused) {
    this._focused = focused;
  }
  validateRange(cellRange) {
    if (!cellRange) {
      return null;
    }
    const start = clamp(cellRange.start, 0, this.length);
    const end = clamp(cellRange.end, 0, this.length);
    if (start <= end) {
      return { start, end };
    } else {
      return { start: end, end: start };
    }
  }
  // selection change from list view's `setFocus` and `setSelection` should always use `source: view` to prevent events breaking the list view focus/selection change transaction
  updateSelectionsState(state, source = "model") {
    if (this._focused || source === "model") {
      if (state.kind === SelectionStateType.Handle) {
        const primaryIndex = state.primary !== null ? this.getCellIndexByHandle(state.primary) : null;
        const primarySelection = primaryIndex !== null ? this.validateRange({ start: primaryIndex, end: primaryIndex + 1 }) : null;
        const selections = cellIndexesToRanges(state.selections.map((sel) => this.getCellIndexByHandle(sel))).map((range) => this.validateRange(range)).filter((range) => range !== null);
        this._selectionCollection.setState(primarySelection, reduceCellRanges(selections), true, source);
      } else {
        const primarySelection = this.validateRange(state.focus);
        const selections = state.selections.map((range) => this.validateRange(range)).filter((range) => range !== null);
        this._selectionCollection.setState(primarySelection, reduceCellRanges(selections), true, source);
      }
    }
  }
  getFoldingStartIndex(index) {
    if (!this._foldingRanges) {
      return -1;
    }
    const range = this._foldingRanges.findRange(index + 1);
    const startIndex = this._foldingRanges.getStartLineNumber(range) - 1;
    return startIndex;
  }
  getFoldingState(index) {
    if (!this._foldingRanges) {
      return CellFoldingState.None;
    }
    const range = this._foldingRanges.findRange(index + 1);
    const startIndex = this._foldingRanges.getStartLineNumber(range) - 1;
    if (startIndex !== index) {
      return CellFoldingState.None;
    }
    return this._foldingRanges.isCollapsed(range) ? CellFoldingState.Collapsed : CellFoldingState.Expanded;
  }
  getFoldedLength(index) {
    if (!this._foldingRanges) {
      return 0;
    }
    const range = this._foldingRanges.findRange(index + 1);
    const startIndex = this._foldingRanges.getStartLineNumber(range) - 1;
    const endIndex = this._foldingRanges.getEndLineNumber(range) - 1;
    return endIndex - startIndex;
  }
  updateFoldingRanges(ranges) {
    this._foldingRanges = ranges;
    let updateHiddenAreas = false;
    const newHiddenAreas = [];
    let i = 0;
    let k = 0;
    let lastCollapsedStart = Number.MAX_VALUE;
    let lastCollapsedEnd = -1;
    for (; i < ranges.length; i++) {
      if (!ranges.isCollapsed(i)) {
        continue;
      }
      const startLineNumber = ranges.getStartLineNumber(i) + 1;
      const endLineNumber = ranges.getEndLineNumber(i);
      if (lastCollapsedStart <= startLineNumber && endLineNumber <= lastCollapsedEnd) {
        continue;
      }
      if (!updateHiddenAreas && k < this._hiddenRanges.length && this._hiddenRanges[k].start + 1 === startLineNumber && this._hiddenRanges[k].end + 1 === endLineNumber) {
        newHiddenAreas.push(this._hiddenRanges[k]);
        k++;
      } else {
        updateHiddenAreas = true;
        newHiddenAreas.push({ start: startLineNumber - 1, end: endLineNumber - 1 });
      }
      lastCollapsedStart = startLineNumber;
      lastCollapsedEnd = endLineNumber;
    }
    if (updateHiddenAreas || k < this._hiddenRanges.length) {
      this._hiddenRanges = newHiddenAreas;
      this._onDidFoldingStateChanged.fire();
    }
    this._viewCells.forEach((cell) => {
      if (cell.cellKind === CellKind.Markup) {
        cell.triggerFoldingStateChange();
      }
    });
  }
  getHiddenRanges() {
    return this._hiddenRanges;
  }
  getOverviewRulerDecorations() {
    return Array.from(this._overviewRulerDecorations.values());
  }
  getCellByHandle(handle) {
    return this._handleToViewCellMapping.get(handle);
  }
  getCellIndexByHandle(handle) {
    return this._viewCells.findIndex((cell) => cell.handle === handle);
  }
  getCellIndex(cell) {
    return this._viewCells.indexOf(cell);
  }
  cellAt(index) {
    return this._viewCells[index];
  }
  getCellsInRange(range) {
    if (!range) {
      return this._viewCells.slice(0);
    }
    const validatedRange = this.validateRange(range);
    if (validatedRange) {
      const result = [];
      for (let i = validatedRange.start; i < validatedRange.end; i++) {
        result.push(this._viewCells[i]);
      }
      return result;
    }
    return [];
  }
  /**
   * If this._viewCells[index] is visible then return index
   */
  getNearestVisibleCellIndexUpwards(index) {
    for (let i = this._hiddenRanges.length - 1; i >= 0; i--) {
      const cellRange = this._hiddenRanges[i];
      const foldStart = cellRange.start - 1;
      const foldEnd = cellRange.end;
      if (foldStart > index) {
        continue;
      }
      if (foldStart <= index && foldEnd >= index) {
        return index;
      }
      break;
    }
    return index;
  }
  getNextVisibleCellIndex(index) {
    for (let i = 0; i < this._hiddenRanges.length; i++) {
      const cellRange = this._hiddenRanges[i];
      const foldStart = cellRange.start - 1;
      const foldEnd = cellRange.end;
      if (foldEnd < index) {
        continue;
      }
      if (foldStart <= index) {
        return foldEnd + 1;
      }
      break;
    }
    return index + 1;
  }
  getPreviousVisibleCellIndex(index) {
    for (let i = this._hiddenRanges.length - 1; i >= 0; i--) {
      const cellRange = this._hiddenRanges[i];
      const foldStart = cellRange.start - 1;
      const foldEnd = cellRange.end;
      if (foldEnd < index) {
        return index;
      }
      if (foldStart <= index) {
        return foldStart;
      }
    }
    return index;
  }
  hasCell(cell) {
    return this._handleToViewCellMapping.has(cell.handle);
  }
  getVersionId() {
    return this._notebook.versionId;
  }
  getAlternativeId() {
    return this._notebook.alternativeVersionId;
  }
  getTrackedRange(id) {
    return this._getDecorationRange(id);
  }
  _getDecorationRange(decorationId) {
    const node = this._decorations[decorationId];
    if (!node) {
      return null;
    }
    const versionId = this.getVersionId();
    if (node.cachedVersionId !== versionId) {
      this._decorationsTree.resolveNode(node, versionId);
    }
    if (node.range === null) {
      return { start: node.cachedAbsoluteStart - 1, end: node.cachedAbsoluteEnd - 1 };
    }
    return { start: node.range.startLineNumber - 1, end: node.range.endLineNumber - 1 };
  }
  setTrackedRange(id, newRange, newStickiness) {
    const node = id ? this._decorations[id] : null;
    if (!node) {
      if (!newRange) {
        return null;
      }
      return this._deltaCellDecorationsImpl(0, [], [{ range: new Range(newRange.start + 1, 1, newRange.end + 1, 1), options: TRACKED_RANGE_OPTIONS[newStickiness] }])[0];
    }
    if (!newRange) {
      this._decorationsTree.delete(node);
      delete this._decorations[node.id];
      return null;
    }
    this._decorationsTree.delete(node);
    node.reset(this.getVersionId(), newRange.start, newRange.end + 1, new Range(newRange.start + 1, 1, newRange.end + 1, 1));
    node.setOptions(TRACKED_RANGE_OPTIONS[newStickiness]);
    this._decorationsTree.insert(node);
    return node.id;
  }
  _deltaCellDecorationsImpl(ownerId, oldDecorationsIds, newDecorations) {
    const versionId = this.getVersionId();
    const oldDecorationsLen = oldDecorationsIds.length;
    let oldDecorationIndex = 0;
    const newDecorationsLen = newDecorations.length;
    let newDecorationIndex = 0;
    const result = new Array(newDecorationsLen);
    while (oldDecorationIndex < oldDecorationsLen || newDecorationIndex < newDecorationsLen) {
      let node = null;
      if (oldDecorationIndex < oldDecorationsLen) {
        do {
          node = this._decorations[oldDecorationsIds[oldDecorationIndex++]];
        } while (!node && oldDecorationIndex < oldDecorationsLen);
        if (node) {
          this._decorationsTree.delete(node);
        }
      }
      if (newDecorationIndex < newDecorationsLen) {
        if (!node) {
          const internalDecorationId = ++this._lastDecorationId;
          const decorationId = `${this._instanceId};${internalDecorationId}`;
          node = new IntervalNode(decorationId, 0, 0);
          this._decorations[decorationId] = node;
        }
        const newDecoration = newDecorations[newDecorationIndex];
        const range = newDecoration.range;
        const options = _normalizeOptions(newDecoration.options);
        node.ownerId = ownerId;
        node.reset(versionId, range.startLineNumber, range.endLineNumber, Range.lift(range));
        node.setOptions(options);
        this._decorationsTree.insert(node);
        result[newDecorationIndex] = node.id;
        newDecorationIndex++;
      } else {
        if (node) {
          delete this._decorations[node.id];
        }
      }
    }
    return result;
  }
  deltaCellDecorations(oldDecorations, newDecorations) {
    oldDecorations.forEach((id) => {
      const handle = this._decorationIdToCellMap.get(id);
      if (handle !== void 0) {
        const cell = this.getCellByHandle(handle);
        cell?.deltaCellDecorations([id], []);
        this._decorationIdToCellMap.delete(id);
      }
      this._overviewRulerDecorations.delete(id);
    });
    const result = [];
    newDecorations.forEach((decoration) => {
      if (isNotebookCellDecoration(decoration)) {
        const cell = this.getCellByHandle(decoration.handle);
        const ret = cell?.deltaCellDecorations([], [decoration.options]) || [];
        ret.forEach((id) => {
          this._decorationIdToCellMap.set(id, decoration.handle);
        });
        result.push(...ret);
      } else {
        const id = ++this._lastOverviewRulerDecorationId;
        const decorationId = `_overview_${this.id};${id}`;
        this._overviewRulerDecorations.set(decorationId, decoration);
        result.push(decorationId);
      }
    });
    return result;
  }
  deltaCellStatusBarItems(oldItems, newItems) {
    const deletesByHandle = groupBy(oldItems, (id) => this._statusBarItemIdToCellMap.get(id) ?? -1);
    const result = [];
    newItems.forEach((itemDelta) => {
      const cell = this.getCellByHandle(itemDelta.handle);
      const deleted = deletesByHandle[itemDelta.handle] ?? [];
      delete deletesByHandle[itemDelta.handle];
      deleted.forEach((id) => this._statusBarItemIdToCellMap.delete(id));
      const ret = cell?.deltaCellStatusBarItems(deleted, itemDelta.items) || [];
      ret.forEach((id) => {
        this._statusBarItemIdToCellMap.set(id, itemDelta.handle);
      });
      result.push(...ret);
    });
    for (const _handle in deletesByHandle) {
      const handle = parseInt(_handle);
      const ids = deletesByHandle[handle];
      const cell = this.getCellByHandle(handle);
      cell?.deltaCellStatusBarItems(ids, []);
      ids.forEach((id) => this._statusBarItemIdToCellMap.delete(id));
    }
    return result;
  }
  nearestCodeCellIndex(index) {
    const nearest = this.viewCells.slice(0, index).reverse().findIndex((cell) => cell.cellKind === CellKind.Code);
    if (nearest > -1) {
      return index - nearest - 1;
    } else {
      const nearestCellTheOtherDirection = this.viewCells.slice(index + 1).findIndex((cell) => cell.cellKind === CellKind.Code);
      if (nearestCellTheOtherDirection > -1) {
        return index + 1 + nearestCellTheOtherDirection;
      }
      return -1;
    }
  }
  getEditorViewState() {
    const editingCells = {};
    const collapsedInputCells = {};
    const collapsedOutputCells = {};
    const cellLineNumberStates = {};
    this._viewCells.forEach((cell, i) => {
      if (cell.getEditState() === CellEditState.Editing) {
        editingCells[i] = true;
      }
      if (cell.isInputCollapsed) {
        collapsedInputCells[i] = true;
      }
      if (cell instanceof CodeCellViewModel && cell.isOutputCollapsed) {
        collapsedOutputCells[i] = true;
      }
      if (cell.lineNumbers !== "inherit") {
        cellLineNumberStates[i] = cell.lineNumbers;
      }
    });
    const editorViewStates = {};
    this._viewCells.map((cell) => ({ handle: cell.model.handle, state: cell.saveEditorViewState() })).forEach((viewState, i) => {
      if (viewState.state) {
        editorViewStates[i] = viewState.state;
      }
    });
    return {
      editingCells,
      editorViewStates,
      cellLineNumberStates,
      collapsedInputCells,
      collapsedOutputCells
    };
  }
  restoreEditorViewState(viewState) {
    if (!viewState) {
      return;
    }
    this._viewCells.forEach((cell, index) => {
      const isEditing = viewState.editingCells && viewState.editingCells[index];
      const editorViewState = viewState.editorViewStates && viewState.editorViewStates[index];
      cell.updateEditState(isEditing ? CellEditState.Editing : CellEditState.Preview, "viewState");
      const cellHeight = viewState.cellTotalHeights ? viewState.cellTotalHeights[index] : void 0;
      cell.restoreEditorViewState(editorViewState, cellHeight);
      if (viewState.collapsedInputCells && viewState.collapsedInputCells[index]) {
        cell.isInputCollapsed = true;
      }
      if (viewState.collapsedOutputCells && viewState.collapsedOutputCells[index] && cell instanceof CodeCellViewModel) {
        cell.isOutputCollapsed = true;
      }
      if (viewState.cellLineNumberStates && viewState.cellLineNumberStates[index]) {
        cell.lineNumbers = viewState.cellLineNumberStates[index];
      }
    });
  }
  /**
   * Editor decorations across cells. For example, find decorations for multiple code cells
   * The reason that we can't completely delegate this to CodeEditorWidget is most of the time, the editors for cells are not created yet but we already have decorations for them.
   */
  changeModelDecorations(callback) {
    const changeAccessor = {
      deltaDecorations: (oldDecorations, newDecorations) => {
        return this._deltaModelDecorationsImpl(oldDecorations, newDecorations);
      }
    };
    let result = null;
    try {
      result = callback(changeAccessor);
    } catch (e) {
      onUnexpectedError(e);
    }
    changeAccessor.deltaDecorations = invalidFunc;
    return result;
  }
  _deltaModelDecorationsImpl(oldDecorations, newDecorations) {
    const mapping = /* @__PURE__ */ new Map();
    oldDecorations.forEach((oldDecoration) => {
      const ownerId = oldDecoration.ownerId;
      if (!mapping.has(ownerId)) {
        const cell = this._viewCells.find((cell2) => cell2.handle === ownerId);
        if (cell) {
          mapping.set(ownerId, { cell, oldDecorations: [], newDecorations: [] });
        }
      }
      const data = mapping.get(ownerId);
      if (data) {
        data.oldDecorations = oldDecoration.decorations;
      }
    });
    newDecorations.forEach((newDecoration) => {
      const ownerId = newDecoration.ownerId;
      if (!mapping.has(ownerId)) {
        const cell = this._viewCells.find((cell2) => cell2.handle === ownerId);
        if (cell) {
          mapping.set(ownerId, { cell, oldDecorations: [], newDecorations: [] });
        }
      }
      const data = mapping.get(ownerId);
      if (data) {
        data.newDecorations = newDecoration.decorations;
      }
    });
    const ret = [];
    mapping.forEach((value, ownerId) => {
      const cellRet = value.cell.deltaModelDecorations(value.oldDecorations, value.newDecorations);
      ret.push({
        ownerId,
        decorations: cellRet
      });
    });
    return ret;
  }
  //#region Find
  find(value, options) {
    const matches = [];
    let findCells = [];
    if (options.findScope && (options.findScope.findScopeType === NotebookFindScopeType.Cells || options.findScope.findScopeType === NotebookFindScopeType.Text)) {
      const selectedRanges = options.findScope.selectedCellRanges?.map((range) => this.validateRange(range)).filter((range) => !!range) ?? [];
      const selectedIndexes = cellRangesToIndexes(selectedRanges);
      findCells = selectedIndexes.map((index) => this._viewCells[index]);
    } else {
      findCells = this._viewCells;
    }
    findCells.forEach((cell, index) => {
      const cellMatches = cell.startFind(value, options);
      if (cellMatches) {
        matches.push(new CellFindMatchModel(
          cellMatches.cell,
          index,
          cellMatches.contentMatches,
          []
        ));
      }
    });
    return matches.filter(
      (match) => {
        if (match.cell.cellKind === CellKind.Code) {
          return options.includeCodeInput;
        }
        if (match.cell.getEditState() === CellEditState.Editing) {
          return options.includeMarkupInput;
        } else {
          return !options.includeMarkupPreview && options.includeMarkupInput;
        }
      }
    );
  }
  replaceOne(cell, range, text) {
    const viewCell = cell;
    this._lastNotebookEditResource.push(viewCell.uri);
    return viewCell.resolveTextModel().then(() => {
      this._bulkEditService.apply(
        [new ResourceTextEdit(cell.uri, { range, text })],
        { quotableLabel: "Notebook Replace" }
      );
    });
  }
  async replaceAll(matches, texts) {
    if (!matches.length) {
      return;
    }
    const textEdits = [];
    this._lastNotebookEditResource.push(matches[0].cell.uri);
    matches.forEach((match) => {
      match.contentMatches.forEach((singleMatch, index) => {
        textEdits.push({
          versionId: void 0,
          textEdit: { range: singleMatch.range, text: texts[index] },
          resource: match.cell.uri
        });
      });
    });
    return Promise.all(matches.map((match) => {
      return match.cell.resolveTextModel();
    })).then(async () => {
      this._bulkEditService.apply({ edits: textEdits }, { quotableLabel: "Notebook Replace All" });
      return;
    });
  }
  //#endregion
  //#region Undo/Redo
  async _withElement(element, callback) {
    const viewCells = this._viewCells.filter((cell) => element.matchesResource(cell.uri));
    const refs = await Promise.all(viewCells.map((cell) => this._textModelService.createModelReference(cell.uri)));
    await callback();
    refs.forEach((ref) => ref.dispose());
  }
  async undo() {
    const editStack = this._undoService.getElements(this.uri);
    const element = editStack.past.length ? editStack.past[editStack.past.length - 1] : void 0;
    if (element && element instanceof SingleModelEditStackElement || element instanceof MultiModelEditStackElement) {
      await this._withElement(element, async () => {
        await this._undoService.undo(this.uri);
      });
      return element instanceof SingleModelEditStackElement ? [element.resource] : element.resources;
    }
    await this._undoService.undo(this.uri);
    return [];
  }
  async redo() {
    const editStack = this._undoService.getElements(this.uri);
    const element = editStack.future[0];
    if (element && element instanceof SingleModelEditStackElement || element instanceof MultiModelEditStackElement) {
      await this._withElement(element, async () => {
        await this._undoService.redo(this.uri);
      });
      return element instanceof SingleModelEditStackElement ? [element.resource] : element.resources;
    }
    await this._undoService.redo(this.uri);
    return [];
  }
  //#endregion
  equal(notebook) {
    return this._notebook === notebook;
  }
  dispose() {
    this._localStore.clear();
    this._viewCells.forEach((cell) => {
      cell.dispose();
    });
    super.dispose();
  }
};
NotebookViewModel = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IBulkEditService),
  __decorateParam(7, IUndoRedoService),
  __decorateParam(8, ITextModelService),
  __decorateParam(9, INotebookExecutionStateService)
], NotebookViewModel);
function createCellViewModel(instantiationService, notebookViewModel, cell, viewContext) {
  if (cell.cellKind === CellKind.Code) {
    return instantiationService.createInstance(CodeCellViewModel, notebookViewModel.viewType, cell, notebookViewModel.layoutInfo, viewContext);
  } else {
    return instantiationService.createInstance(MarkupCellViewModel, notebookViewModel.viewType, cell, notebookViewModel.layoutInfo, notebookViewModel, viewContext);
  }
}
export {
  NotebookViewModel,
  createCellViewModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3TW9kZWxcXG5vdGVib29rVmlld01vZGVsSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdyb3VwQnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjbGFtcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRTZXJ2aWNlLCBSZXNvdXJjZVRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCAqIGFzIGVkaXRvckNvbW1vbiBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBGaW5kTWF0Y2gsIElNb2RlbERlY29yYXRpb25PcHRpb25zLCBJTW9kZWxEZWx0YURlY29yYXRpb24sIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50LCBTaW5nbGVNb2RlbEVkaXRTdGFja0VsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL2VkaXRTdGFjay5qcyc7XG5pbXBvcnQgeyBJbnRlcnZhbE5vZGUsIEludGVydmFsVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvaW50ZXJ2YWxUcmVlLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZvbGRpbmdSZWdpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZm9sZGluZy9icm93c2VyL2ZvbGRpbmdSYW5nZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IENlbGxGaW5kTWF0Y2hNb2RlbCB9IGZyb20gJy4uL2NvbnRyaWIvZmluZC9maW5kTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRTdGF0ZSwgQ2VsbEZpbmRNYXRjaFdpdGhJbmRleCwgQ2VsbEZvbGRpbmdTdGF0ZSwgRWRpdG9yRm9sZGluZ1N0YXRlRGVsZWdhdGUsIElDZWxsTW9kZWxEZWNvcmF0aW9ucywgSUNlbGxNb2RlbERlbHRhRGVjb3JhdGlvbnMsIElDZWxsVmlld01vZGVsLCBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yLCBJTm90ZWJvb2tEZWx0YUNlbGxTdGF0dXNCYXJJdGVtcywgSU5vdGVib29rRWRpdG9yVmlld1N0YXRlLCBJTm90ZWJvb2tWaWV3Q2VsbHNVcGRhdGVFdmVudCwgSU5vdGVib29rVmlld01vZGVsLCBJTm90ZWJvb2tEZWx0YURlY29yYXRpb24sIGlzTm90ZWJvb2tDZWxsRGVjb3JhdGlvbiwgSU5vdGVib29rRGVsdGFWaWV3Wm9uZURlY29yYXRpb24gfSBmcm9tICcuLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tMYXlvdXRJbmZvLCBOb3RlYm9va01ldGFkYXRhQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vbm90ZWJvb2tWaWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbFNlbGVjdGlvbkNvbGxlY3Rpb24gfSBmcm9tICcuL2NlbGxTZWxlY3Rpb25Db2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IENvZGVDZWxsVmlld01vZGVsIH0gZnJvbSAnLi9jb2RlQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBNYXJrdXBDZWxsVmlld01vZGVsIH0gZnJvbSAnLi9tYXJrdXBDZWxsVmlld01vZGVsLmpzJztcbmltcG9ydCB7IFZpZXdDb250ZXh0IH0gZnJvbSAnLi92aWV3Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tDZWxsVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IENlbGxLaW5kLCBJQ2VsbCwgSU5vdGVib29rRmluZE9wdGlvbnMsIElTZWxlY3Rpb25TdGF0ZSwgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUsIE5vdGVib29rQ2VsbFRleHRNb2RlbFNwbGljZSwgTm90ZWJvb2tGaW5kU2NvcGVUeXBlLCBTZWxlY3Rpb25TdGF0ZVR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLCBOb3RlYm9va0V4ZWN1dGlvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY2VsbEluZGV4ZXNUb1JhbmdlcywgY2VsbFJhbmdlc1RvSW5kZXhlcywgSUNlbGxSYW5nZSwgcmVkdWNlQ2VsbFJhbmdlcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va1JhbmdlLmpzJztcblxuY29uc3QgaW52YWxpZEZ1bmMgPSAoKSA9PiB7IHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBjaGFuZ2UgYWNjZXNzb3JgKTsgfTtcblxuY2xhc3MgRGVjb3JhdGlvbnNUcmVlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbnNUcmVlOiBJbnRlcnZhbFRyZWU7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlID0gbmV3IEludGVydmFsVHJlZSgpO1xuXHR9XG5cblx0cHVibGljIGludGVydmFsU2VhcmNoKHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyLCBmaWx0ZXJPd25lcklkOiBudW1iZXIsIGZpbHRlck91dFZhbGlkYXRpb246IGJvb2xlYW4sIGZpbHRlckZvbnREZWNvcmF0aW9uczogYm9vbGVhbiwgY2FjaGVkVmVyc2lvbklkOiBudW1iZXIsIG9ubHlNYXJnaW5EZWNvcmF0aW9uczogYm9vbGVhbiA9IGZhbHNlKTogSW50ZXJ2YWxOb2RlW10ge1xuXHRcdGNvbnN0IHIxID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmludGVydmFsU2VhcmNoKHN0YXJ0LCBlbmQsIGZpbHRlck93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgY2FjaGVkVmVyc2lvbklkLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXHRcdHJldHVybiByMTtcblx0fVxuXG5cdHB1YmxpYyBzZWFyY2goZmlsdGVyT3duZXJJZDogbnVtYmVyLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4sIG92ZXJ2aWV3UnVsZXJPbmx5OiBib29sZWFuLCBjYWNoZWRWZXJzaW9uSWQ6IG51bWJlciwgb25seU1hcmdpbkRlY29yYXRpb25zOiBib29sZWFuKTogSW50ZXJ2YWxOb2RlW10ge1xuXHRcdHJldHVybiB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuc2VhcmNoKGZpbHRlck93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgY2FjaGVkVmVyc2lvbklkLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXG5cdH1cblxuXHRwdWJsaWMgY29sbGVjdE5vZGVzRnJvbU93bmVyKG93bmVySWQ6IG51bWJlcik6IEludGVydmFsTm9kZVtdIHtcblx0XHRjb25zdCByMSA9IHRoaXMuX2RlY29yYXRpb25zVHJlZS5jb2xsZWN0Tm9kZXNGcm9tT3duZXIob3duZXJJZCk7XG5cdFx0cmV0dXJuIHIxO1xuXHR9XG5cblx0cHVibGljIGNvbGxlY3ROb2Rlc1Bvc3RPcmRlcigpOiBJbnRlcnZhbE5vZGVbXSB7XG5cdFx0Y29uc3QgcjEgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuY29sbGVjdE5vZGVzUG9zdE9yZGVyKCk7XG5cdFx0cmV0dXJuIHIxO1xuXHR9XG5cblx0cHVibGljIGluc2VydChub2RlOiBJbnRlcnZhbE5vZGUpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUuaW5zZXJ0KG5vZGUpO1xuXHR9XG5cblx0cHVibGljIGRlbGV0ZShub2RlOiBJbnRlcnZhbE5vZGUpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZGVsZXRlKG5vZGUpO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVOb2RlKG5vZGU6IEludGVydmFsTm9kZSwgY2FjaGVkVmVyc2lvbklkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUucmVzb2x2ZU5vZGUobm9kZSwgY2FjaGVkVmVyc2lvbklkKTtcblx0fVxuXG5cdHB1YmxpYyBhY2NlcHRSZXBsYWNlKG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlciwgdGV4dExlbmd0aDogbnVtYmVyLCBmb3JjZU1vdmVNYXJrZXJzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlLmFjY2VwdFJlcGxhY2Uob2Zmc2V0LCBsZW5ndGgsIHRleHRMZW5ndGgsIGZvcmNlTW92ZU1hcmtlcnMpO1xuXHR9XG59XG5cbmNvbnN0IFRSQUNLRURfUkFOR0VfT1BUSU9OUyA9IFtcblx0TW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7IGRlc2NyaXB0aW9uOiAnbm90ZWJvb2stdmlldy1tb2RlbC10cmFja2VkLXJhbmdlLWFsd2F5cy1ncm93cy13aGVuLXR5cGluZy1hdC1lZGdlcycsIHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyB9KSxcblx0TW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7IGRlc2NyaXB0aW9uOiAnbm90ZWJvb2stdmlldy1tb2RlbC10cmFja2VkLXJhbmdlLW5ldmVyLWdyb3dzLXdoZW4tdHlwaW5nLWF0LWVkZ2VzJywgc3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMgfSksXG5cdE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoeyBkZXNjcmlwdGlvbjogJ25vdGVib29rLXZpZXctbW9kZWwtdHJhY2tlZC1yYW5nZS1ncm93cy1vbmx5LXdoZW4tdHlwaW5nLWJlZm9yZScsIHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSB9KSxcblx0TW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7IGRlc2NyaXB0aW9uOiAnbm90ZWJvb2stdmlldy1tb2RlbC10cmFja2VkLXJhbmdlLWdyb3dzLW9ubHktd2hlbi10eXBpbmctYWZ0ZXInLCBzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciB9KSxcbl07XG5cbmZ1bmN0aW9uIF9ub3JtYWxpemVPcHRpb25zKG9wdGlvbnM6IElNb2RlbERlY29yYXRpb25PcHRpb25zKTogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB7XG5cdGlmIChvcHRpb25zIGluc3RhbmNlb2YgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucykge1xuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG5cdHJldHVybiBNb2RlbERlY29yYXRpb25PcHRpb25zLmNyZWF0ZUR5bmFtaWMob3B0aW9ucyk7XG59XG5cbmxldCBNT0RFTF9JRCA9IDA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tWaWV3TW9kZWxPcHRpb25zIHtcblx0aXNSZWFkT25seTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rVmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIEVkaXRvckZvbGRpbmdTdGF0ZURlbGVnYXRlLCBJTm90ZWJvb2tWaWV3TW9kZWwge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbFN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfaGFuZGxlVG9WaWV3Q2VsbE1hcHBpbmcgPSBuZXcgTWFwPG51bWJlciwgQ2VsbFZpZXdNb2RlbD4oKTtcblx0Z2V0IG9wdGlvbnMoKTogTm90ZWJvb2tWaWV3TW9kZWxPcHRpb25zIHsgcmV0dXJuIHRoaXMuX29wdGlvbnM7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VPcHRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvbkRpZENoYW5nZU9wdGlvbnMoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VPcHRpb25zLmV2ZW50OyB9XG5cdHByaXZhdGUgX3ZpZXdDZWxsczogQ2VsbFZpZXdNb2RlbFtdID0gW107XG5cblx0Z2V0IHZpZXdDZWxscygpOiBJQ2VsbFZpZXdNb2RlbFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlld0NlbGxzO1xuXHR9XG5cblx0Z2V0IGxlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl92aWV3Q2VsbHMubGVuZ3RoO1xuXHR9XG5cblx0Z2V0IG5vdGVib29rRG9jdW1lbnQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX25vdGVib29rO1xuXHR9XG5cblx0Z2V0IHVyaSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2sudXJpO1xuXHR9XG5cblx0Z2V0IG1ldGFkYXRhKCkge1xuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9vay5tZXRhZGF0YTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGlzUmVwbCgpIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3VHlwZSA9PT0gJ3JlcGwnO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaWV3Q2VsbHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTm90ZWJvb2tWaWV3Q2VsbHNVcGRhdGVFdmVudD4oKSk7XG5cdGdldCBvbkRpZENoYW5nZVZpZXdDZWxscygpOiBFdmVudDxJTm90ZWJvb2tWaWV3Q2VsbHNVcGRhdGVFdmVudD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VWaWV3Q2VsbHMuZXZlbnQ7IH1cblxuXHRwcml2YXRlIF9sYXN0Tm90ZWJvb2tFZGl0UmVzb3VyY2U6IFVSSVtdID0gW107XG5cblx0Z2V0IGxhc3ROb3RlYm9va0VkaXRSZXNvdXJjZSgpOiBVUkkgfCBudWxsIHtcblx0XHRpZiAodGhpcy5fbGFzdE5vdGVib29rRWRpdFJlc291cmNlLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xhc3ROb3RlYm9va0VkaXRSZXNvdXJjZVt0aGlzLl9sYXN0Tm90ZWJvb2tFZGl0UmVzb3VyY2UubGVuZ3RoIC0gMV07XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Z2V0IGxheW91dEluZm8oKTogTm90ZWJvb2tMYXlvdXRJbmZvIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xheW91dEluZm87XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdGdldCBvbkRpZENoYW5nZVNlbGVjdGlvbigpOiBFdmVudDxzdHJpbmc+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSBfc2VsZWN0aW9uQ29sbGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBOb3RlYm9va0NlbGxTZWxlY3Rpb25Db2xsZWN0aW9uKCkpO1xuXG5cdHByaXZhdGUgZ2V0IHNlbGVjdGlvbkhhbmRsZXMoKSB7XG5cdFx0Y29uc3QgaGFuZGxlc1NldCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdGNvbnN0IGhhbmRsZXM6IG51bWJlcltdID0gW107XG5cdFx0Y2VsbFJhbmdlc1RvSW5kZXhlcyh0aGlzLl9zZWxlY3Rpb25Db2xsZWN0aW9uLnNlbGVjdGlvbnMpLm1hcChpbmRleCA9PiBpbmRleCA8IHRoaXMubGVuZ3RoID8gdGhpcy5jZWxsQXQoaW5kZXgpIDogdW5kZWZpbmVkKS5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0aWYgKGNlbGwgJiYgIWhhbmRsZXNTZXQuaGFzKGNlbGwuaGFuZGxlKSkge1xuXHRcdFx0XHRoYW5kbGVzU2V0LmFkZChjZWxsLmhhbmRsZSk7XG5cdFx0XHRcdGhhbmRsZXMucHVzaChjZWxsLmhhbmRsZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gaGFuZGxlcztcblx0fVxuXG5cdHByaXZhdGUgc2V0IHNlbGVjdGlvbkhhbmRsZXMoc2VsZWN0aW9uSGFuZGxlczogbnVtYmVyW10pIHtcblx0XHRjb25zdCBpbmRleGVzID0gc2VsZWN0aW9uSGFuZGxlcy5tYXAoaGFuZGxlID0+IHRoaXMuX3ZpZXdDZWxscy5maW5kSW5kZXgoY2VsbCA9PiBjZWxsLmhhbmRsZSA9PT0gaGFuZGxlKSk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uQ29sbGVjdGlvbi5zZXRTZWxlY3Rpb25zKGNlbGxJbmRleGVzVG9SYW5nZXMoaW5kZXhlcyksIHRydWUsICdtb2RlbCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVjb3JhdGlvbnNUcmVlID0gbmV3IERlY29yYXRpb25zVHJlZSgpO1xuXHRwcml2YXRlIF9kZWNvcmF0aW9uczogeyBbZGVjb3JhdGlvbklkOiBzdHJpbmddOiBJbnRlcnZhbE5vZGUgfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdHByaXZhdGUgX2xhc3REZWNvcmF0aW9uSWQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbmNlSWQ6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHByaXZhdGUgX2ZvbGRpbmdSYW5nZXM6IEZvbGRpbmdSZWdpb25zIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX29uRGlkRm9sZGluZ1N0YXRlQ2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZvbGRpbmdTdGF0ZUNoYW5nZWQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRGb2xkaW5nU3RhdGVDaGFuZ2VkLmV2ZW50O1xuXHRwcml2YXRlIF9oaWRkZW5SYW5nZXM6IElDZWxsUmFuZ2VbXSA9IFtdO1xuXHRwcml2YXRlIF9mb2N1c2VkOiBib29sZWFuID0gdHJ1ZTtcblxuXHRnZXQgZm9jdXNlZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZm9jdXNlZDtcblx0fVxuXG5cdHByaXZhdGUgX2RlY29yYXRpb25JZFRvQ2VsbE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdHByaXZhdGUgX3N0YXR1c0Jhckl0ZW1JZFRvQ2VsbE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cblx0cHJpdmF0ZSBfbGFzdE92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9uSWQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX292ZXJ2aWV3UnVsZXJEZWNvcmF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJTm90ZWJvb2tEZWx0YVZpZXdab25lRGVjb3JhdGlvbj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgdmlld1R5cGU6IHN0cmluZyxcblx0XHRwcml2YXRlIF9ub3RlYm9vazogTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0cHJpdmF0ZSBfdmlld0NvbnRleHQ6IFZpZXdDb250ZXh0LFxuXHRcdHByaXZhdGUgX2xheW91dEluZm86IE5vdGVib29rTGF5b3V0SW5mbyB8IG51bGwsXG5cdFx0cHJpdmF0ZSBfb3B0aW9uczogTm90ZWJvb2tWaWV3TW9kZWxPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUJ1bGtFZGl0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9idWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdFx0QElVbmRvUmVkb1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdW5kb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0TU9ERUxfSUQrKztcblx0XHR0aGlzLmlkID0gJyRub3RlYm9va1ZpZXdNb2RlbCcgKyBNT0RFTF9JRDtcblx0XHR0aGlzLl9pbnN0YW5jZUlkID0gc3RyaW5ncy5zaW5nbGVMZXR0ZXJIYXNoKE1PREVMX0lEKTtcblxuXHRcdGNvbnN0IGNvbXB1dGUgPSAoY2hhbmdlczogTm90ZWJvb2tDZWxsVGV4dE1vZGVsU3BsaWNlPElDZWxsPltdLCBzeW5jaHJvbm91czogYm9vbGVhbikgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZnMgPSBjaGFuZ2VzLm1hcChzcGxpY2UgPT4ge1xuXHRcdFx0XHRyZXR1cm4gW3NwbGljZVswXSwgc3BsaWNlWzFdLCBzcGxpY2VbMl0ubWFwKGNlbGwgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBjcmVhdGVDZWxsVmlld01vZGVsKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLCBjZWxsIGFzIE5vdGVib29rQ2VsbFRleHRNb2RlbCwgdGhpcy5fdmlld0NvbnRleHQpO1xuXHRcdFx0XHR9KV0gYXMgW251bWJlciwgbnVtYmVyLCBDZWxsVmlld01vZGVsW11dO1xuXHRcdFx0fSk7XG5cblx0XHRcdGRpZmZzLnJldmVyc2UoKS5mb3JFYWNoKGRpZmYgPT4ge1xuXHRcdFx0XHRjb25zdCBkZWxldGVkQ2VsbHMgPSB0aGlzLl92aWV3Q2VsbHMuc3BsaWNlKGRpZmZbMF0sIGRpZmZbMV0sIC4uLmRpZmZbMl0pO1xuXG5cdFx0XHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZS5hY2NlcHRSZXBsYWNlKGRpZmZbMF0sIGRpZmZbMV0sIGRpZmZbMl0ubGVuZ3RoLCB0cnVlKTtcblx0XHRcdFx0ZGVsZXRlZENlbGxzLmZvckVhY2goY2VsbCA9PiB7XG5cdFx0XHRcdFx0dGhpcy5faGFuZGxlVG9WaWV3Q2VsbE1hcHBpbmcuZGVsZXRlKGNlbGwuaGFuZGxlKTtcblx0XHRcdFx0XHQvLyBkaXNwb3NlIHRoZSBjZWxsIHRvIHJlbGVhc2UgcmVmIHRvIHRoZSBjZWxsIHRleHQgZG9jdW1lbnRcblx0XHRcdFx0XHR0aGlzLl9sb2NhbFN0b3JlLmRlbGV0ZShjZWxsKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0ZGlmZlsyXS5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2hhbmRsZVRvVmlld0NlbGxNYXBwaW5nLnNldChjZWxsLmhhbmRsZSwgY2VsbCk7XG5cdFx0XHRcdFx0dGhpcy5fbG9jYWxTdG9yZS5hZGQoY2VsbCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHNlbGVjdGlvbkhhbmRsZXMgPSB0aGlzLnNlbGVjdGlvbkhhbmRsZXM7XG5cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld0NlbGxzLmZpcmUoe1xuXHRcdFx0XHRzeW5jaHJvbm91czogc3luY2hyb25vdXMsXG5cdFx0XHRcdHNwbGljZXM6IGRpZmZzXG5cdFx0XHR9KTtcblxuXHRcdFx0bGV0IGVuZFNlbGVjdGlvbkhhbmRsZXM6IG51bWJlcltdID0gW107XG5cdFx0XHRpZiAoc2VsZWN0aW9uSGFuZGxlcy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgcHJpbWFyeUhhbmRsZSA9IHNlbGVjdGlvbkhhbmRsZXNbMF07XG5cdFx0XHRcdGNvbnN0IHByaW1hcnlTZWxlY3Rpb25JbmRleCA9IHRoaXMuX3ZpZXdDZWxscy5pbmRleE9mKHRoaXMuZ2V0Q2VsbEJ5SGFuZGxlKHByaW1hcnlIYW5kbGUpISk7XG5cdFx0XHRcdGVuZFNlbGVjdGlvbkhhbmRsZXMgPSBbcHJpbWFyeUhhbmRsZV07XG5cdFx0XHRcdGxldCBkZWx0YSA9IDA7XG5cblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkaWZmcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGRpZmYgPSBkaWZmc1swXTtcblx0XHRcdFx0XHRpZiAoZGlmZlswXSArIGRpZmZbMV0gPD0gcHJpbWFyeVNlbGVjdGlvbkluZGV4KSB7XG5cdFx0XHRcdFx0XHRkZWx0YSArPSBkaWZmWzJdLmxlbmd0aCAtIGRpZmZbMV07XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoZGlmZlswXSA+IHByaW1hcnlTZWxlY3Rpb25JbmRleCkge1xuXHRcdFx0XHRcdFx0ZW5kU2VsZWN0aW9uSGFuZGxlcyA9IFtwcmltYXJ5SGFuZGxlXTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChkaWZmWzBdICsgZGlmZlsxXSA+IHByaW1hcnlTZWxlY3Rpb25JbmRleCkge1xuXHRcdFx0XHRcdFx0ZW5kU2VsZWN0aW9uSGFuZGxlcyA9IFt0aGlzLl92aWV3Q2VsbHNbZGlmZlswXSArIGRlbHRhXS5oYW5kbGVdO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRPRE9AcmVib3JuaXhcblx0XHRcdGNvbnN0IHNlbGVjdGlvbkluZGV4ZXMgPSBlbmRTZWxlY3Rpb25IYW5kbGVzLm1hcChoYW5kbGUgPT4gdGhpcy5fdmlld0NlbGxzLmZpbmRJbmRleChjZWxsID0+IGNlbGwuaGFuZGxlID09PSBoYW5kbGUpKTtcblx0XHRcdHRoaXMuX3NlbGVjdGlvbkNvbGxlY3Rpb24uc2V0U3RhdGUoY2VsbEluZGV4ZXNUb1Jhbmdlcyhbc2VsZWN0aW9uSW5kZXhlc1swXV0pWzBdLCBjZWxsSW5kZXhlc1RvUmFuZ2VzKHNlbGVjdGlvbkluZGV4ZXMpLCB0cnVlLCAnbW9kZWwnKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90ZWJvb2sub25EaWRDaGFuZ2VDb250ZW50KGUgPT4ge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlLnJhd0V2ZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjaGFuZ2UgPSBlLnJhd0V2ZW50c1tpXTtcblx0XHRcdFx0bGV0IGNoYW5nZXM6IE5vdGVib29rQ2VsbFRleHRNb2RlbFNwbGljZTxJQ2VsbD5bXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBzeW5jaHJvbm91cyA9IGUuc3luY2hyb25vdXMgPz8gdHJ1ZTtcblxuXHRcdFx0XHRpZiAoY2hhbmdlLmtpbmQgPT09IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vZGVsQ2hhbmdlIHx8IGNoYW5nZS5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Jbml0aWFsaXplKSB7XG5cdFx0XHRcdFx0Y2hhbmdlcyA9IGNoYW5nZS5jaGFuZ2VzO1xuXHRcdFx0XHRcdGNvbXB1dGUoY2hhbmdlcywgc3luY2hyb25vdXMpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNoYW5nZS5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb3ZlKSB7XG5cdFx0XHRcdFx0Y29tcHV0ZShbW2NoYW5nZS5pbmRleCwgY2hhbmdlLmxlbmd0aCwgW11dXSwgc3luY2hyb25vdXMpO1xuXHRcdFx0XHRcdGNvbXB1dGUoW1tjaGFuZ2UubmV3SWR4LCAwLCBjaGFuZ2UuY2VsbHNdXSwgc3luY2hyb25vdXMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90ZWJvb2sub25EaWRDaGFuZ2VDb250ZW50KGNvbnRlbnRDaGFuZ2VzID0+IHtcblx0XHRcdGNvbnRlbnRDaGFuZ2VzLnJhd0V2ZW50cy5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VEb2N1bWVudE1ldGFkYXRhKSB7XG5cdFx0XHRcdFx0dGhpcy5fdmlld0NvbnRleHQuZXZlbnREaXNwYXRjaGVyLmVtaXQoW25ldyBOb3RlYm9va01ldGFkYXRhQ2hhbmdlZEV2ZW50KHRoaXMuX25vdGVib29rLm1ldGFkYXRhKV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKGNvbnRlbnRDaGFuZ2VzLmVuZFNlbGVjdGlvblN0YXRlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2VsZWN0aW9uc1N0YXRlKGNvbnRlbnRDaGFuZ2VzLmVuZFNlbGVjdGlvblN0YXRlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl92aWV3Q29udGV4dC5ldmVudERpc3BhdGNoZXIub25EaWRDaGFuZ2VMYXlvdXQoKGUpID0+IHtcblx0XHRcdHRoaXMuX2xheW91dEluZm8gPSBlLnZhbHVlO1xuXG5cdFx0XHR0aGlzLl92aWV3Q2VsbHMuZm9yRWFjaChjZWxsID0+IHtcblx0XHRcdFx0aWYgKGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCkge1xuXHRcdFx0XHRcdGlmIChlLnNvdXJjZS53aWR0aCB8fCBlLnNvdXJjZS5mb250SW5mbykge1xuXHRcdFx0XHRcdFx0Y2VsbC5sYXlvdXRDaGFuZ2UoeyBvdXRlcldpZHRoOiBlLnZhbHVlLndpZHRoLCBmb250OiBlLnZhbHVlLmZvbnRJbmZvIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoZS5zb3VyY2Uud2lkdGggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0Y2VsbC5sYXlvdXRDaGFuZ2UoeyBvdXRlcldpZHRoOiBlLnZhbHVlLndpZHRoLCBmb250OiBlLnZhbHVlLmZvbnRJbmZvIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdmlld0NvbnRleHQubm90ZWJvb2tPcHRpb25zLm9uRGlkQ2hhbmdlT3B0aW9ucyhlID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fdmlld0NlbGxzW2ldO1xuXHRcdFx0XHRjZWxsLnVwZGF0ZU9wdGlvbnMoZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2Uub25EaWRDaGFuZ2VFeGVjdXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS50eXBlICE9PSBOb3RlYm9va0V4ZWN1dGlvblR5cGUuY2VsbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy5nZXRDZWxsQnlIYW5kbGUoZS5jZWxsSGFuZGxlKTtcblxuXHRcdFx0aWYgKGNlbGwgaW5zdGFuY2VvZiBDb2RlQ2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0XHRjZWxsLnVwZGF0ZUV4ZWN1dGlvblN0YXRlKGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3NlbGVjdGlvbkNvbGxlY3Rpb24ub25EaWRDaGFuZ2VTZWxlY3Rpb24oZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKGUpO1xuXHRcdH0pKTtcblxuXG5cdFx0Y29uc3Qgdmlld0NlbGxDb3VudCA9IHRoaXMuaXNSZXBsID8gdGhpcy5fbm90ZWJvb2suY2VsbHMubGVuZ3RoIC0gMSA6IHRoaXMuX25vdGVib29rLmNlbGxzLmxlbmd0aDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZpZXdDZWxsQ291bnQ7IGkrKykge1xuXHRcdFx0dGhpcy5fdmlld0NlbGxzLnB1c2goY3JlYXRlQ2VsbFZpZXdNb2RlbCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcywgdGhpcy5fbm90ZWJvb2suY2VsbHNbaV0sIHRoaXMuX3ZpZXdDb250ZXh0KSk7XG5cdFx0fVxuXG5cblx0XHR0aGlzLl92aWV3Q2VsbHMuZm9yRWFjaChjZWxsID0+IHtcblx0XHRcdHRoaXMuX2hhbmRsZVRvVmlld0NlbGxNYXBwaW5nLnNldChjZWxsLmhhbmRsZSwgY2VsbCk7XG5cdFx0fSk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG5ld09wdGlvbnM6IFBhcnRpYWw8Tm90ZWJvb2tWaWV3TW9kZWxPcHRpb25zPikge1xuXHRcdHRoaXMuX29wdGlvbnMgPSB7IC4uLnRoaXMuX29wdGlvbnMsIC4uLm5ld09wdGlvbnMgfTtcblx0XHR0aGlzLl92aWV3Q2VsbHMuZm9yRWFjaChjZWxsID0+IGNlbGwudXBkYXRlT3B0aW9ucyh7IHJlYWRvbmx5OiB0aGlzLl9vcHRpb25zLmlzUmVhZE9ubHkgfSkpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlT3B0aW9ucy5maXJlKCk7XG5cdH1cblxuXHRnZXRGb2N1cygpIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0aW9uQ29sbGVjdGlvbi5mb2N1cztcblx0fVxuXG5cdGdldFNlbGVjdGlvbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbGVjdGlvbkNvbGxlY3Rpb24uc2VsZWN0aW9ucztcblx0fVxuXG5cdGdldE1vc3RSZWNlbnRseUV4ZWN1dGVkQ2VsbCgpOiBJQ2VsbFZpZXdNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5nZXRMYXN0Q29tcGxldGVkQ2VsbEZvck5vdGVib29rKHRoaXMuX25vdGVib29rLnVyaSk7XG5cdFx0cmV0dXJuIGhhbmRsZSAhPT0gdW5kZWZpbmVkID8gdGhpcy5nZXRDZWxsQnlIYW5kbGUoaGFuZGxlKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHNldEVkaXRvckZvY3VzKGZvY3VzZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9mb2N1c2VkID0gZm9jdXNlZDtcblx0fVxuXG5cdHZhbGlkYXRlUmFuZ2UoY2VsbFJhbmdlOiBJQ2VsbFJhbmdlIHwgbnVsbCB8IHVuZGVmaW5lZCk6IElDZWxsUmFuZ2UgfCBudWxsIHtcblx0XHRpZiAoIWNlbGxSYW5nZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnQgPSBjbGFtcChjZWxsUmFuZ2Uuc3RhcnQsIDAsIHRoaXMubGVuZ3RoKTtcblx0XHRjb25zdCBlbmQgPSBjbGFtcChjZWxsUmFuZ2UuZW5kLCAwLCB0aGlzLmxlbmd0aCk7XG5cblx0XHRpZiAoc3RhcnQgPD0gZW5kKSB7XG5cdFx0XHRyZXR1cm4geyBzdGFydCwgZW5kIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7IHN0YXJ0OiBlbmQsIGVuZDogc3RhcnQgfTtcblx0XHR9XG5cdH1cblxuXHQvLyBzZWxlY3Rpb24gY2hhbmdlIGZyb20gbGlzdCB2aWV3J3MgYHNldEZvY3VzYCBhbmQgYHNldFNlbGVjdGlvbmAgc2hvdWxkIGFsd2F5cyB1c2UgYHNvdXJjZTogdmlld2AgdG8gcHJldmVudCBldmVudHMgYnJlYWtpbmcgdGhlIGxpc3QgdmlldyBmb2N1cy9zZWxlY3Rpb24gY2hhbmdlIHRyYW5zYWN0aW9uXG5cdHVwZGF0ZVNlbGVjdGlvbnNTdGF0ZShzdGF0ZTogSVNlbGVjdGlvblN0YXRlLCBzb3VyY2U6ICd2aWV3JyB8ICdtb2RlbCcgPSAnbW9kZWwnKSB7XG5cdFx0aWYgKHRoaXMuX2ZvY3VzZWQgfHwgc291cmNlID09PSAnbW9kZWwnKSB7XG5cdFx0XHRpZiAoc3RhdGUua2luZCA9PT0gU2VsZWN0aW9uU3RhdGVUeXBlLkhhbmRsZSkge1xuXHRcdFx0XHRjb25zdCBwcmltYXJ5SW5kZXggPSBzdGF0ZS5wcmltYXJ5ICE9PSBudWxsID8gdGhpcy5nZXRDZWxsSW5kZXhCeUhhbmRsZShzdGF0ZS5wcmltYXJ5KSA6IG51bGw7XG5cdFx0XHRcdGNvbnN0IHByaW1hcnlTZWxlY3Rpb24gPSBwcmltYXJ5SW5kZXggIT09IG51bGwgPyB0aGlzLnZhbGlkYXRlUmFuZ2UoeyBzdGFydDogcHJpbWFyeUluZGV4LCBlbmQ6IHByaW1hcnlJbmRleCArIDEgfSkgOiBudWxsO1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gY2VsbEluZGV4ZXNUb1JhbmdlcyhzdGF0ZS5zZWxlY3Rpb25zLm1hcChzZWwgPT4gdGhpcy5nZXRDZWxsSW5kZXhCeUhhbmRsZShzZWwpKSlcblx0XHRcdFx0XHQubWFwKHJhbmdlID0+IHRoaXMudmFsaWRhdGVSYW5nZShyYW5nZSkpXG5cdFx0XHRcdFx0LmZpbHRlcihyYW5nZSA9PiByYW5nZSAhPT0gbnVsbCkgYXMgSUNlbGxSYW5nZVtdO1xuXHRcdFx0XHR0aGlzLl9zZWxlY3Rpb25Db2xsZWN0aW9uLnNldFN0YXRlKHByaW1hcnlTZWxlY3Rpb24sIHJlZHVjZUNlbGxSYW5nZXMoc2VsZWN0aW9ucyksIHRydWUsIHNvdXJjZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBwcmltYXJ5U2VsZWN0aW9uID0gdGhpcy52YWxpZGF0ZVJhbmdlKHN0YXRlLmZvY3VzKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHN0YXRlLnNlbGVjdGlvbnNcblx0XHRcdFx0XHQubWFwKHJhbmdlID0+IHRoaXMudmFsaWRhdGVSYW5nZShyYW5nZSkpXG5cdFx0XHRcdFx0LmZpbHRlcihyYW5nZSA9PiByYW5nZSAhPT0gbnVsbCkgYXMgSUNlbGxSYW5nZVtdO1xuXHRcdFx0XHR0aGlzLl9zZWxlY3Rpb25Db2xsZWN0aW9uLnNldFN0YXRlKHByaW1hcnlTZWxlY3Rpb24sIHJlZHVjZUNlbGxSYW5nZXMoc2VsZWN0aW9ucyksIHRydWUsIHNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0Rm9sZGluZ1N0YXJ0SW5kZXgoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9mb2xkaW5nUmFuZ2VzKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9mb2xkaW5nUmFuZ2VzLmZpbmRSYW5nZShpbmRleCArIDEpO1xuXHRcdGNvbnN0IHN0YXJ0SW5kZXggPSB0aGlzLl9mb2xkaW5nUmFuZ2VzLmdldFN0YXJ0TGluZU51bWJlcihyYW5nZSkgLSAxO1xuXHRcdHJldHVybiBzdGFydEluZGV4O1xuXHR9XG5cblx0Z2V0Rm9sZGluZ1N0YXRlKGluZGV4OiBudW1iZXIpOiBDZWxsRm9sZGluZ1N0YXRlIHtcblx0XHRpZiAoIXRoaXMuX2ZvbGRpbmdSYW5nZXMpIHtcblx0XHRcdHJldHVybiBDZWxsRm9sZGluZ1N0YXRlLk5vbmU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9mb2xkaW5nUmFuZ2VzLmZpbmRSYW5nZShpbmRleCArIDEpO1xuXHRcdGNvbnN0IHN0YXJ0SW5kZXggPSB0aGlzLl9mb2xkaW5nUmFuZ2VzLmdldFN0YXJ0TGluZU51bWJlcihyYW5nZSkgLSAxO1xuXG5cdFx0aWYgKHN0YXJ0SW5kZXggIT09IGluZGV4KSB7XG5cdFx0XHRyZXR1cm4gQ2VsbEZvbGRpbmdTdGF0ZS5Ob25lO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9mb2xkaW5nUmFuZ2VzLmlzQ29sbGFwc2VkKHJhbmdlKSA/IENlbGxGb2xkaW5nU3RhdGUuQ29sbGFwc2VkIDogQ2VsbEZvbGRpbmdTdGF0ZS5FeHBhbmRlZDtcblx0fVxuXG5cdGdldEZvbGRlZExlbmd0aChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX2ZvbGRpbmdSYW5nZXMpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhbmdlID0gdGhpcy5fZm9sZGluZ1Jhbmdlcy5maW5kUmFuZ2UoaW5kZXggKyAxKTtcblx0XHRjb25zdCBzdGFydEluZGV4ID0gdGhpcy5fZm9sZGluZ1Jhbmdlcy5nZXRTdGFydExpbmVOdW1iZXIocmFuZ2UpIC0gMTtcblx0XHRjb25zdCBlbmRJbmRleCA9IHRoaXMuX2ZvbGRpbmdSYW5nZXMuZ2V0RW5kTGluZU51bWJlcihyYW5nZSkgLSAxO1xuXG5cdFx0cmV0dXJuIGVuZEluZGV4IC0gc3RhcnRJbmRleDtcblx0fVxuXG5cdHVwZGF0ZUZvbGRpbmdSYW5nZXMocmFuZ2VzOiBGb2xkaW5nUmVnaW9ucykge1xuXHRcdHRoaXMuX2ZvbGRpbmdSYW5nZXMgPSByYW5nZXM7XG5cdFx0bGV0IHVwZGF0ZUhpZGRlbkFyZWFzID0gZmFsc2U7XG5cdFx0Y29uc3QgbmV3SGlkZGVuQXJlYXM6IElDZWxsUmFuZ2VbXSA9IFtdO1xuXG5cdFx0bGV0IGkgPSAwOyAvLyBpbmRleCBpbnRvIGhpZGRlblxuXHRcdGxldCBrID0gMDtcblxuXHRcdGxldCBsYXN0Q29sbGFwc2VkU3RhcnQgPSBOdW1iZXIuTUFYX1ZBTFVFO1xuXHRcdGxldCBsYXN0Q29sbGFwc2VkRW5kID0gLTE7XG5cblx0XHRmb3IgKDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKCFyYW5nZXMuaXNDb2xsYXBzZWQoaSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHJhbmdlcy5nZXRTdGFydExpbmVOdW1iZXIoaSkgKyAxOyAvLyB0aGUgZmlyc3QgbGluZSBpcyBub3QgaGlkZGVuXG5cdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gcmFuZ2VzLmdldEVuZExpbmVOdW1iZXIoaSk7XG5cdFx0XHRpZiAobGFzdENvbGxhcHNlZFN0YXJ0IDw9IHN0YXJ0TGluZU51bWJlciAmJiBlbmRMaW5lTnVtYmVyIDw9IGxhc3RDb2xsYXBzZWRFbmQpIHtcblx0XHRcdFx0Ly8gaWdub3JlIHJhbmdlcyBjb250YWluZWQgaW4gY29sbGFwc2VkIHJlZ2lvbnNcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdXBkYXRlSGlkZGVuQXJlYXMgJiYgayA8IHRoaXMuX2hpZGRlblJhbmdlcy5sZW5ndGggJiYgdGhpcy5faGlkZGVuUmFuZ2VzW2tdLnN0YXJ0ICsgMSA9PT0gc3RhcnRMaW5lTnVtYmVyICYmICh0aGlzLl9oaWRkZW5SYW5nZXNba10uZW5kICsgMSkgPT09IGVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Ly8gcmV1c2UgdGhlIG9sZCByYW5nZXNcblx0XHRcdFx0bmV3SGlkZGVuQXJlYXMucHVzaCh0aGlzLl9oaWRkZW5SYW5nZXNba10pO1xuXHRcdFx0XHRrKys7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR1cGRhdGVIaWRkZW5BcmVhcyA9IHRydWU7XG5cdFx0XHRcdG5ld0hpZGRlbkFyZWFzLnB1c2goeyBzdGFydDogc3RhcnRMaW5lTnVtYmVyIC0gMSwgZW5kOiBlbmRMaW5lTnVtYmVyIC0gMSB9KTtcblx0XHRcdH1cblx0XHRcdGxhc3RDb2xsYXBzZWRTdGFydCA9IHN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGxhc3RDb2xsYXBzZWRFbmQgPSBlbmRMaW5lTnVtYmVyO1xuXHRcdH1cblxuXHRcdGlmICh1cGRhdGVIaWRkZW5BcmVhcyB8fCBrIDwgdGhpcy5faGlkZGVuUmFuZ2VzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5faGlkZGVuUmFuZ2VzID0gbmV3SGlkZGVuQXJlYXM7XG5cdFx0XHR0aGlzLl9vbkRpZEZvbGRpbmdTdGF0ZUNoYW5nZWQuZmlyZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ZpZXdDZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0aWYgKGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCkge1xuXHRcdFx0XHRjZWxsLnRyaWdnZXJGb2xkaW5nU3RhdGVDaGFuZ2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGdldEhpZGRlblJhbmdlcygpIHtcblx0XHRyZXR1cm4gdGhpcy5faGlkZGVuUmFuZ2VzO1xuXHR9XG5cblx0Z2V0T3ZlcnZpZXdSdWxlckRlY29yYXRpb25zKCk6IElOb3RlYm9va0RlbHRhVmlld1pvbmVEZWNvcmF0aW9uW10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX292ZXJ2aWV3UnVsZXJEZWNvcmF0aW9ucy52YWx1ZXMoKSk7XG5cdH1cblxuXHRnZXRDZWxsQnlIYW5kbGUoaGFuZGxlOiBudW1iZXIpIHtcblx0XHRyZXR1cm4gdGhpcy5faGFuZGxlVG9WaWV3Q2VsbE1hcHBpbmcuZ2V0KGhhbmRsZSk7XG5cdH1cblxuXHRnZXRDZWxsSW5kZXhCeUhhbmRsZShoYW5kbGU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdDZWxscy5maW5kSW5kZXgoY2VsbCA9PiBjZWxsLmhhbmRsZSA9PT0gaGFuZGxlKTtcblx0fVxuXG5cdGdldENlbGxJbmRleChjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdHJldHVybiB0aGlzLl92aWV3Q2VsbHMuaW5kZXhPZihjZWxsIGFzIENlbGxWaWV3TW9kZWwpO1xuXHR9XG5cblx0Y2VsbEF0KGluZGV4OiBudW1iZXIpOiBDZWxsVmlld01vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMubGVuZ3RoKSB7XG5cdFx0Ly8gXHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgaW5kZXggJHtpbmRleH1gKTtcblx0XHQvLyB9XG5cblx0XHRyZXR1cm4gdGhpcy5fdmlld0NlbGxzW2luZGV4XTtcblx0fVxuXG5cdGdldENlbGxzSW5SYW5nZShyYW5nZT86IElDZWxsUmFuZ2UpOiBSZWFkb25seUFycmF5PElDZWxsVmlld01vZGVsPiB7XG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3ZpZXdDZWxscy5zbGljZSgwKTtcblx0XHR9XG5cblx0XHRjb25zdCB2YWxpZGF0ZWRSYW5nZSA9IHRoaXMudmFsaWRhdGVSYW5nZShyYW5nZSk7XG5cblx0XHRpZiAodmFsaWRhdGVkUmFuZ2UpIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogSUNlbGxWaWV3TW9kZWxbXSA9IFtdO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gdmFsaWRhdGVkUmFuZ2Uuc3RhcnQ7IGkgPCB2YWxpZGF0ZWRSYW5nZS5lbmQ7IGkrKykge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh0aGlzLl92aWV3Q2VsbHNbaV0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJZiB0aGlzLl92aWV3Q2VsbHNbaW5kZXhdIGlzIHZpc2libGUgdGhlbiByZXR1cm4gaW5kZXhcblx0ICovXG5cdGdldE5lYXJlc3RWaXNpYmxlQ2VsbEluZGV4VXB3YXJkcyhpbmRleDogbnVtYmVyKSB7XG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuX2hpZGRlblJhbmdlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgY2VsbFJhbmdlID0gdGhpcy5faGlkZGVuUmFuZ2VzW2ldO1xuXHRcdFx0Y29uc3QgZm9sZFN0YXJ0ID0gY2VsbFJhbmdlLnN0YXJ0IC0gMTtcblx0XHRcdGNvbnN0IGZvbGRFbmQgPSBjZWxsUmFuZ2UuZW5kO1xuXG5cdFx0XHRpZiAoZm9sZFN0YXJ0ID4gaW5kZXgpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmb2xkU3RhcnQgPD0gaW5kZXggJiYgZm9sZEVuZCA+PSBpbmRleCkge1xuXHRcdFx0XHRyZXR1cm4gaW5kZXg7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGZvbGRTdGFydCA8PSBpbmRleCwgZm9sZEVuZCA8IGluZGV4XG5cdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4gaW5kZXg7XG5cdH1cblxuXHRnZXROZXh0VmlzaWJsZUNlbGxJbmRleChpbmRleDogbnVtYmVyKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9oaWRkZW5SYW5nZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGNlbGxSYW5nZSA9IHRoaXMuX2hpZGRlblJhbmdlc1tpXTtcblx0XHRcdGNvbnN0IGZvbGRTdGFydCA9IGNlbGxSYW5nZS5zdGFydCAtIDE7XG5cdFx0XHRjb25zdCBmb2xkRW5kID0gY2VsbFJhbmdlLmVuZDtcblxuXHRcdFx0aWYgKGZvbGRFbmQgPCBpbmRleCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZm9sZEVuZCA+PSBpbmRleFxuXHRcdFx0aWYgKGZvbGRTdGFydCA8PSBpbmRleCkge1xuXHRcdFx0XHRyZXR1cm4gZm9sZEVuZCArIDE7XG5cdFx0XHR9XG5cblx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHJldHVybiBpbmRleCArIDE7XG5cdH1cblxuXHRnZXRQcmV2aW91c1Zpc2libGVDZWxsSW5kZXgoaW5kZXg6IG51bWJlcikge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9oaWRkZW5SYW5nZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IGNlbGxSYW5nZSA9IHRoaXMuX2hpZGRlblJhbmdlc1tpXTtcblx0XHRcdGNvbnN0IGZvbGRTdGFydCA9IGNlbGxSYW5nZS5zdGFydCAtIDE7XG5cdFx0XHRjb25zdCBmb2xkRW5kID0gY2VsbFJhbmdlLmVuZDtcblxuXHRcdFx0aWYgKGZvbGRFbmQgPCBpbmRleCkge1xuXHRcdFx0XHRyZXR1cm4gaW5kZXg7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmb2xkU3RhcnQgPD0gaW5kZXgpIHtcblx0XHRcdFx0cmV0dXJuIGZvbGRTdGFydDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gaW5kZXg7XG5cdH1cblxuXHRoYXNDZWxsKGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2hhbmRsZVRvVmlld0NlbGxNYXBwaW5nLmhhcyhjZWxsLmhhbmRsZSk7XG5cdH1cblxuXHRnZXRWZXJzaW9uSWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX25vdGVib29rLnZlcnNpb25JZDtcblx0fVxuXG5cdGdldEFsdGVybmF0aXZlSWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX25vdGVib29rLmFsdGVybmF0aXZlVmVyc2lvbklkO1xuXHR9XG5cblx0Z2V0VHJhY2tlZFJhbmdlKGlkOiBzdHJpbmcpOiBJQ2VsbFJhbmdlIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldERlY29yYXRpb25SYW5nZShpZCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREZWNvcmF0aW9uUmFuZ2UoZGVjb3JhdGlvbklkOiBzdHJpbmcpOiBJQ2VsbFJhbmdlIHwgbnVsbCB7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuX2RlY29yYXRpb25zW2RlY29yYXRpb25JZF07XG5cdFx0aWYgKCFub2RlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgdmVyc2lvbklkID0gdGhpcy5nZXRWZXJzaW9uSWQoKTtcblx0XHRpZiAobm9kZS5jYWNoZWRWZXJzaW9uSWQgIT09IHZlcnNpb25JZCkge1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlLnJlc29sdmVOb2RlKG5vZGUsIHZlcnNpb25JZCk7XG5cdFx0fVxuXHRcdGlmIChub2RlLnJhbmdlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4geyBzdGFydDogbm9kZS5jYWNoZWRBYnNvbHV0ZVN0YXJ0IC0gMSwgZW5kOiBub2RlLmNhY2hlZEFic29sdXRlRW5kIC0gMSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHN0YXJ0OiBub2RlLnJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsIGVuZDogbm9kZS5yYW5nZS5lbmRMaW5lTnVtYmVyIC0gMSB9O1xuXHR9XG5cblx0c2V0VHJhY2tlZFJhbmdlKGlkOiBzdHJpbmcgfCBudWxsLCBuZXdSYW5nZTogSUNlbGxSYW5nZSB8IG51bGwsIG5ld1N0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRjb25zdCBub2RlID0gKGlkID8gdGhpcy5fZGVjb3JhdGlvbnNbaWRdIDogbnVsbCk7XG5cblx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdGlmICghbmV3UmFuZ2UpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLl9kZWx0YUNlbGxEZWNvcmF0aW9uc0ltcGwoMCwgW10sIFt7IHJhbmdlOiBuZXcgUmFuZ2UobmV3UmFuZ2Uuc3RhcnQgKyAxLCAxLCBuZXdSYW5nZS5lbmQgKyAxLCAxKSwgb3B0aW9uczogVFJBQ0tFRF9SQU5HRV9PUFRJT05TW25ld1N0aWNraW5lc3NdIH1dKVswXTtcblx0XHR9XG5cblx0XHRpZiAoIW5ld1JhbmdlKSB7XG5cdFx0XHQvLyBub2RlIGV4aXN0cywgdGhlIHJlcXVlc3QgaXMgdG8gZGVsZXRlID0+IGRlbGV0ZSBub2RlXG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZGVsZXRlKG5vZGUpO1xuXHRcdFx0ZGVsZXRlIHRoaXMuX2RlY29yYXRpb25zW25vZGUuaWRdO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlLmRlbGV0ZShub2RlKTtcblx0XHRub2RlLnJlc2V0KHRoaXMuZ2V0VmVyc2lvbklkKCksIG5ld1JhbmdlLnN0YXJ0LCBuZXdSYW5nZS5lbmQgKyAxLCBuZXcgUmFuZ2UobmV3UmFuZ2Uuc3RhcnQgKyAxLCAxLCBuZXdSYW5nZS5lbmQgKyAxLCAxKSk7XG5cdFx0bm9kZS5zZXRPcHRpb25zKFRSQUNLRURfUkFOR0VfT1BUSU9OU1tuZXdTdGlja2luZXNzXSk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlLmluc2VydChub2RlKTtcblx0XHRyZXR1cm4gbm9kZS5pZDtcblx0fVxuXG5cdHByaXZhdGUgX2RlbHRhQ2VsbERlY29yYXRpb25zSW1wbChvd25lcklkOiBudW1iZXIsIG9sZERlY29yYXRpb25zSWRzOiBzdHJpbmdbXSwgbmV3RGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHZlcnNpb25JZCA9IHRoaXMuZ2V0VmVyc2lvbklkKCk7XG5cblx0XHRjb25zdCBvbGREZWNvcmF0aW9uc0xlbiA9IG9sZERlY29yYXRpb25zSWRzLmxlbmd0aDtcblx0XHRsZXQgb2xkRGVjb3JhdGlvbkluZGV4ID0gMDtcblxuXHRcdGNvbnN0IG5ld0RlY29yYXRpb25zTGVuID0gbmV3RGVjb3JhdGlvbnMubGVuZ3RoO1xuXHRcdGxldCBuZXdEZWNvcmF0aW9uSW5kZXggPSAwO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEFycmF5PHN0cmluZz4obmV3RGVjb3JhdGlvbnNMZW4pO1xuXHRcdHdoaWxlIChvbGREZWNvcmF0aW9uSW5kZXggPCBvbGREZWNvcmF0aW9uc0xlbiB8fCBuZXdEZWNvcmF0aW9uSW5kZXggPCBuZXdEZWNvcmF0aW9uc0xlbikge1xuXG5cdFx0XHRsZXQgbm9kZTogSW50ZXJ2YWxOb2RlIHwgbnVsbCA9IG51bGw7XG5cblx0XHRcdGlmIChvbGREZWNvcmF0aW9uSW5kZXggPCBvbGREZWNvcmF0aW9uc0xlbikge1xuXHRcdFx0XHQvLyAoMSkgZ2V0IG91cnNlbHZlcyBhbiBvbGQgbm9kZVxuXHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0bm9kZSA9IHRoaXMuX2RlY29yYXRpb25zW29sZERlY29yYXRpb25zSWRzW29sZERlY29yYXRpb25JbmRleCsrXV07XG5cdFx0XHRcdH0gd2hpbGUgKCFub2RlICYmIG9sZERlY29yYXRpb25JbmRleCA8IG9sZERlY29yYXRpb25zTGVuKTtcblxuXHRcdFx0XHQvLyAoMikgcmVtb3ZlIHRoZSBub2RlIGZyb20gdGhlIHRyZWUgKGlmIGl0IGV4aXN0cylcblx0XHRcdFx0aWYgKG5vZGUpIHtcblx0XHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZGVsZXRlKG5vZGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChuZXdEZWNvcmF0aW9uSW5kZXggPCBuZXdEZWNvcmF0aW9uc0xlbikge1xuXHRcdFx0XHQvLyAoMykgY3JlYXRlIGEgbmV3IG5vZGUgaWYgbmVjZXNzYXJ5XG5cdFx0XHRcdGlmICghbm9kZSkge1xuXHRcdFx0XHRcdGNvbnN0IGludGVybmFsRGVjb3JhdGlvbklkID0gKCsrdGhpcy5fbGFzdERlY29yYXRpb25JZCk7XG5cdFx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbklkID0gYCR7dGhpcy5faW5zdGFuY2VJZH07JHtpbnRlcm5hbERlY29yYXRpb25JZH1gO1xuXHRcdFx0XHRcdG5vZGUgPSBuZXcgSW50ZXJ2YWxOb2RlKGRlY29yYXRpb25JZCwgMCwgMCk7XG5cdFx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbnNbZGVjb3JhdGlvbklkXSA9IG5vZGU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyAoNCkgaW5pdGlhbGl6ZSBub2RlXG5cdFx0XHRcdGNvbnN0IG5ld0RlY29yYXRpb24gPSBuZXdEZWNvcmF0aW9uc1tuZXdEZWNvcmF0aW9uSW5kZXhdO1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IG5ld0RlY29yYXRpb24ucmFuZ2U7XG5cdFx0XHRcdGNvbnN0IG9wdGlvbnMgPSBfbm9ybWFsaXplT3B0aW9ucyhuZXdEZWNvcmF0aW9uLm9wdGlvbnMpO1xuXG5cdFx0XHRcdG5vZGUub3duZXJJZCA9IG93bmVySWQ7XG5cdFx0XHRcdG5vZGUucmVzZXQodmVyc2lvbklkLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLmVuZExpbmVOdW1iZXIsIFJhbmdlLmxpZnQocmFuZ2UpKTtcblx0XHRcdFx0bm9kZS5zZXRPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0XHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZS5pbnNlcnQobm9kZSk7XG5cblx0XHRcdFx0cmVzdWx0W25ld0RlY29yYXRpb25JbmRleF0gPSBub2RlLmlkO1xuXG5cdFx0XHRcdG5ld0RlY29yYXRpb25JbmRleCsrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKG5vZGUpIHtcblx0XHRcdFx0XHRkZWxldGUgdGhpcy5fZGVjb3JhdGlvbnNbbm9kZS5pZF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZGVsdGFDZWxsRGVjb3JhdGlvbnMob2xkRGVjb3JhdGlvbnM6IHN0cmluZ1tdLCBuZXdEZWNvcmF0aW9uczogSU5vdGVib29rRGVsdGFEZWNvcmF0aW9uW10pOiBzdHJpbmdbXSB7XG5cdFx0b2xkRGVjb3JhdGlvbnMuZm9yRWFjaChpZCA9PiB7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9kZWNvcmF0aW9uSWRUb0NlbGxNYXAuZ2V0KGlkKTtcblxuXHRcdFx0aWYgKGhhbmRsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLmdldENlbGxCeUhhbmRsZShoYW5kbGUpO1xuXHRcdFx0XHRjZWxsPy5kZWx0YUNlbGxEZWNvcmF0aW9ucyhbaWRdLCBbXSk7XG5cdFx0XHRcdHRoaXMuX2RlY29yYXRpb25JZFRvQ2VsbE1hcC5kZWxldGUoaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vdmVydmlld1J1bGVyRGVjb3JhdGlvbnMuZGVsZXRlKGlkKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblxuXHRcdG5ld0RlY29yYXRpb25zLmZvckVhY2goZGVjb3JhdGlvbiA9PiB7XG5cdFx0XHRpZiAoaXNOb3RlYm9va0NlbGxEZWNvcmF0aW9uKGRlY29yYXRpb24pKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLmdldENlbGxCeUhhbmRsZShkZWNvcmF0aW9uLmhhbmRsZSk7XG5cdFx0XHRcdGNvbnN0IHJldCA9IGNlbGw/LmRlbHRhQ2VsbERlY29yYXRpb25zKFtdLCBbZGVjb3JhdGlvbi5vcHRpb25zXSkgfHwgW107XG5cdFx0XHRcdHJldC5mb3JFYWNoKGlkID0+IHtcblx0XHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9uSWRUb0NlbGxNYXAuc2V0KGlkLCBkZWNvcmF0aW9uLmhhbmRsZSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXN1bHQucHVzaCguLi5yZXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgaWQgPSArK3RoaXMuX2xhc3RPdmVydmlld1J1bGVyRGVjb3JhdGlvbklkO1xuXHRcdFx0XHRjb25zdCBkZWNvcmF0aW9uSWQgPSBgX292ZXJ2aWV3XyR7dGhpcy5pZH07JHtpZH1gO1xuXHRcdFx0XHR0aGlzLl9vdmVydmlld1J1bGVyRGVjb3JhdGlvbnMuc2V0KGRlY29yYXRpb25JZCwgZGVjb3JhdGlvbik7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGRlY29yYXRpb25JZCk7XG5cdFx0XHR9XG5cblx0XHR9KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRkZWx0YUNlbGxTdGF0dXNCYXJJdGVtcyhvbGRJdGVtczogc3RyaW5nW10sIG5ld0l0ZW1zOiBJTm90ZWJvb2tEZWx0YUNlbGxTdGF0dXNCYXJJdGVtc1tdKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGRlbGV0ZXNCeUhhbmRsZSA9IGdyb3VwQnkob2xkSXRlbXMsIGlkID0+IHRoaXMuX3N0YXR1c0Jhckl0ZW1JZFRvQ2VsbE1hcC5nZXQoaWQpID8/IC0xKTtcblxuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRuZXdJdGVtcy5mb3JFYWNoKGl0ZW1EZWx0YSA9PiB7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy5nZXRDZWxsQnlIYW5kbGUoaXRlbURlbHRhLmhhbmRsZSk7XG5cdFx0XHRjb25zdCBkZWxldGVkID0gZGVsZXRlc0J5SGFuZGxlW2l0ZW1EZWx0YS5oYW5kbGVdID8/IFtdO1xuXHRcdFx0ZGVsZXRlIGRlbGV0ZXNCeUhhbmRsZVtpdGVtRGVsdGEuaGFuZGxlXTtcblx0XHRcdGRlbGV0ZWQuZm9yRWFjaChpZCA9PiB0aGlzLl9zdGF0dXNCYXJJdGVtSWRUb0NlbGxNYXAuZGVsZXRlKGlkKSk7XG5cblx0XHRcdGNvbnN0IHJldCA9IGNlbGw/LmRlbHRhQ2VsbFN0YXR1c0Jhckl0ZW1zKGRlbGV0ZWQsIGl0ZW1EZWx0YS5pdGVtcykgfHwgW107XG5cdFx0XHRyZXQuZm9yRWFjaChpZCA9PiB7XG5cdFx0XHRcdHRoaXMuX3N0YXR1c0Jhckl0ZW1JZFRvQ2VsbE1hcC5zZXQoaWQsIGl0ZW1EZWx0YS5oYW5kbGUpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJlc3VsdC5wdXNoKC4uLnJldCk7XG5cdFx0fSk7XG5cblx0XHRmb3IgKGNvbnN0IF9oYW5kbGUgaW4gZGVsZXRlc0J5SGFuZGxlKSB7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBwYXJzZUludChfaGFuZGxlKTtcblx0XHRcdGNvbnN0IGlkcyA9IGRlbGV0ZXNCeUhhbmRsZVtoYW5kbGVdITtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLmdldENlbGxCeUhhbmRsZShoYW5kbGUpO1xuXHRcdFx0Y2VsbD8uZGVsdGFDZWxsU3RhdHVzQmFySXRlbXMoaWRzLCBbXSk7XG5cdFx0XHRpZHMuZm9yRWFjaChpZCA9PiB0aGlzLl9zdGF0dXNCYXJJdGVtSWRUb0NlbGxNYXAuZGVsZXRlKGlkKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdG5lYXJlc3RDb2RlQ2VsbEluZGV4KGluZGV4OiBudW1iZXIgLyogZXhjbHVzaXZlICovKSB7XG5cdFx0Y29uc3QgbmVhcmVzdCA9IHRoaXMudmlld0NlbGxzLnNsaWNlKDAsIGluZGV4KS5yZXZlcnNlKCkuZmluZEluZGV4KGNlbGwgPT4gY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuQ29kZSk7XG5cdFx0aWYgKG5lYXJlc3QgPiAtMSkge1xuXHRcdFx0cmV0dXJuIGluZGV4IC0gbmVhcmVzdCAtIDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG5lYXJlc3RDZWxsVGhlT3RoZXJEaXJlY3Rpb24gPSB0aGlzLnZpZXdDZWxscy5zbGljZShpbmRleCArIDEpLmZpbmRJbmRleChjZWxsID0+IGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUpO1xuXHRcdFx0aWYgKG5lYXJlc3RDZWxsVGhlT3RoZXJEaXJlY3Rpb24gPiAtMSkge1xuXHRcdFx0XHRyZXR1cm4gaW5kZXggKyAxICsgbmVhcmVzdENlbGxUaGVPdGhlckRpcmVjdGlvbjtcblx0XHRcdH1cblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdH1cblxuXHRnZXRFZGl0b3JWaWV3U3RhdGUoKTogSU5vdGVib29rRWRpdG9yVmlld1N0YXRlIHtcblx0XHRjb25zdCBlZGl0aW5nQ2VsbHM6IHsgW2tleTogbnVtYmVyXTogYm9vbGVhbiB9ID0ge307XG5cdFx0Y29uc3QgY29sbGFwc2VkSW5wdXRDZWxsczogeyBba2V5OiBudW1iZXJdOiBib29sZWFuIH0gPSB7fTtcblx0XHRjb25zdCBjb2xsYXBzZWRPdXRwdXRDZWxsczogeyBba2V5OiBudW1iZXJdOiBib29sZWFuIH0gPSB7fTtcblx0XHRjb25zdCBjZWxsTGluZU51bWJlclN0YXRlczogeyBba2V5OiBudW1iZXJdOiAnb24nIHwgJ29mZicgfSA9IHt9O1xuXG5cdFx0dGhpcy5fdmlld0NlbGxzLmZvckVhY2goKGNlbGwsIGkpID0+IHtcblx0XHRcdGlmIChjZWxsLmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLkVkaXRpbmcpIHtcblx0XHRcdFx0ZWRpdGluZ0NlbGxzW2ldID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNlbGwuaXNJbnB1dENvbGxhcHNlZCkge1xuXHRcdFx0XHRjb2xsYXBzZWRJbnB1dENlbGxzW2ldID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNlbGwgaW5zdGFuY2VvZiBDb2RlQ2VsbFZpZXdNb2RlbCAmJiBjZWxsLmlzT3V0cHV0Q29sbGFwc2VkKSB7XG5cdFx0XHRcdGNvbGxhcHNlZE91dHB1dENlbGxzW2ldID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNlbGwubGluZU51bWJlcnMgIT09ICdpbmhlcml0Jykge1xuXHRcdFx0XHRjZWxsTGluZU51bWJlclN0YXRlc1tpXSA9IGNlbGwubGluZU51bWJlcnM7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgZWRpdG9yVmlld1N0YXRlczogeyBba2V5OiBudW1iZXJdOiBlZGl0b3JDb21tb24uSUNvZGVFZGl0b3JWaWV3U3RhdGUgfSA9IHt9O1xuXHRcdHRoaXMuX3ZpZXdDZWxscy5tYXAoY2VsbCA9PiAoeyBoYW5kbGU6IGNlbGwubW9kZWwuaGFuZGxlLCBzdGF0ZTogY2VsbC5zYXZlRWRpdG9yVmlld1N0YXRlKCkgfSkpLmZvckVhY2goKHZpZXdTdGF0ZSwgaSkgPT4ge1xuXHRcdFx0aWYgKHZpZXdTdGF0ZS5zdGF0ZSkge1xuXHRcdFx0XHRlZGl0b3JWaWV3U3RhdGVzW2ldID0gdmlld1N0YXRlLnN0YXRlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVkaXRpbmdDZWxscyxcblx0XHRcdGVkaXRvclZpZXdTdGF0ZXMsXG5cdFx0XHRjZWxsTGluZU51bWJlclN0YXRlcyxcblx0XHRcdGNvbGxhcHNlZElucHV0Q2VsbHMsXG5cdFx0XHRjb2xsYXBzZWRPdXRwdXRDZWxsc1xuXHRcdH07XG5cdH1cblxuXHRyZXN0b3JlRWRpdG9yVmlld1N0YXRlKHZpZXdTdGF0ZTogSU5vdGVib29rRWRpdG9yVmlld1N0YXRlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF2aWV3U3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl92aWV3Q2VsbHMuZm9yRWFjaCgoY2VsbCwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IGlzRWRpdGluZyA9IHZpZXdTdGF0ZS5lZGl0aW5nQ2VsbHMgJiYgdmlld1N0YXRlLmVkaXRpbmdDZWxsc1tpbmRleF07XG5cdFx0XHRjb25zdCBlZGl0b3JWaWV3U3RhdGUgPSB2aWV3U3RhdGUuZWRpdG9yVmlld1N0YXRlcyAmJiB2aWV3U3RhdGUuZWRpdG9yVmlld1N0YXRlc1tpbmRleF07XG5cblx0XHRcdGNlbGwudXBkYXRlRWRpdFN0YXRlKGlzRWRpdGluZyA/IENlbGxFZGl0U3RhdGUuRWRpdGluZyA6IENlbGxFZGl0U3RhdGUuUHJldmlldywgJ3ZpZXdTdGF0ZScpO1xuXHRcdFx0Y29uc3QgY2VsbEhlaWdodCA9IHZpZXdTdGF0ZS5jZWxsVG90YWxIZWlnaHRzID8gdmlld1N0YXRlLmNlbGxUb3RhbEhlaWdodHNbaW5kZXhdIDogdW5kZWZpbmVkO1xuXHRcdFx0Y2VsbC5yZXN0b3JlRWRpdG9yVmlld1N0YXRlKGVkaXRvclZpZXdTdGF0ZSwgY2VsbEhlaWdodCk7XG5cdFx0XHRpZiAodmlld1N0YXRlLmNvbGxhcHNlZElucHV0Q2VsbHMgJiYgdmlld1N0YXRlLmNvbGxhcHNlZElucHV0Q2VsbHNbaW5kZXhdKSB7XG5cdFx0XHRcdGNlbGwuaXNJbnB1dENvbGxhcHNlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodmlld1N0YXRlLmNvbGxhcHNlZE91dHB1dENlbGxzICYmIHZpZXdTdGF0ZS5jb2xsYXBzZWRPdXRwdXRDZWxsc1tpbmRleF0gJiYgY2VsbCBpbnN0YW5jZW9mIENvZGVDZWxsVmlld01vZGVsKSB7XG5cdFx0XHRcdGNlbGwuaXNPdXRwdXRDb2xsYXBzZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZpZXdTdGF0ZS5jZWxsTGluZU51bWJlclN0YXRlcyAmJiB2aWV3U3RhdGUuY2VsbExpbmVOdW1iZXJTdGF0ZXNbaW5kZXhdKSB7XG5cdFx0XHRcdGNlbGwubGluZU51bWJlcnMgPSB2aWV3U3RhdGUuY2VsbExpbmVOdW1iZXJTdGF0ZXNbaW5kZXhdO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVkaXRvciBkZWNvcmF0aW9ucyBhY3Jvc3MgY2VsbHMuIEZvciBleGFtcGxlLCBmaW5kIGRlY29yYXRpb25zIGZvciBtdWx0aXBsZSBjb2RlIGNlbGxzXG5cdCAqIFRoZSByZWFzb24gdGhhdCB3ZSBjYW4ndCBjb21wbGV0ZWx5IGRlbGVnYXRlIHRoaXMgdG8gQ29kZUVkaXRvcldpZGdldCBpcyBtb3N0IG9mIHRoZSB0aW1lLCB0aGUgZWRpdG9ycyBmb3IgY2VsbHMgYXJlIG5vdCBjcmVhdGVkIHlldCBidXQgd2UgYWxyZWFkeSBoYXZlIGRlY29yYXRpb25zIGZvciB0aGVtLlxuXHQgKi9cblx0Y2hhbmdlTW9kZWxEZWNvcmF0aW9uczxUPihjYWxsYmFjazogKGNoYW5nZUFjY2Vzc29yOiBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yKSA9PiBUKTogVCB8IG51bGwge1xuXHRcdGNvbnN0IGNoYW5nZUFjY2Vzc29yOiBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yID0ge1xuXHRcdFx0ZGVsdGFEZWNvcmF0aW9uczogKG9sZERlY29yYXRpb25zOiBJQ2VsbE1vZGVsRGVjb3JhdGlvbnNbXSwgbmV3RGVjb3JhdGlvbnM6IElDZWxsTW9kZWxEZWx0YURlY29yYXRpb25zW10pOiBJQ2VsbE1vZGVsRGVjb3JhdGlvbnNbXSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9kZWx0YU1vZGVsRGVjb3JhdGlvbnNJbXBsKG9sZERlY29yYXRpb25zLCBuZXdEZWNvcmF0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGxldCByZXN1bHQ6IFQgfCBudWxsID0gbnVsbDtcblx0XHR0cnkge1xuXHRcdFx0cmVzdWx0ID0gY2FsbGJhY2soY2hhbmdlQWNjZXNzb3IpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGUpO1xuXHRcdH1cblxuXHRcdGNoYW5nZUFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMgPSBpbnZhbGlkRnVuYztcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9kZWx0YU1vZGVsRGVjb3JhdGlvbnNJbXBsKG9sZERlY29yYXRpb25zOiBJQ2VsbE1vZGVsRGVjb3JhdGlvbnNbXSwgbmV3RGVjb3JhdGlvbnM6IElDZWxsTW9kZWxEZWx0YURlY29yYXRpb25zW10pOiBJQ2VsbE1vZGVsRGVjb3JhdGlvbnNbXSB7XG5cblx0XHRjb25zdCBtYXBwaW5nID0gbmV3IE1hcDxudW1iZXIsIHsgY2VsbDogQ2VsbFZpZXdNb2RlbDsgb2xkRGVjb3JhdGlvbnM6IHJlYWRvbmx5IHN0cmluZ1tdOyBuZXdEZWNvcmF0aW9uczogcmVhZG9ubHkgSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gfT4oKTtcblx0XHRvbGREZWNvcmF0aW9ucy5mb3JFYWNoKG9sZERlY29yYXRpb24gPT4ge1xuXHRcdFx0Y29uc3Qgb3duZXJJZCA9IG9sZERlY29yYXRpb24ub3duZXJJZDtcblxuXHRcdFx0aWYgKCFtYXBwaW5nLmhhcyhvd25lcklkKSkge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fdmlld0NlbGxzLmZpbmQoY2VsbCA9PiBjZWxsLmhhbmRsZSA9PT0gb3duZXJJZCk7XG5cdFx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdFx0bWFwcGluZy5zZXQob3duZXJJZCwgeyBjZWxsOiBjZWxsLCBvbGREZWNvcmF0aW9uczogW10sIG5ld0RlY29yYXRpb25zOiBbXSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkYXRhID0gbWFwcGluZy5nZXQob3duZXJJZCkhO1xuXHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0ZGF0YS5vbGREZWNvcmF0aW9ucyA9IG9sZERlY29yYXRpb24uZGVjb3JhdGlvbnM7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRuZXdEZWNvcmF0aW9ucy5mb3JFYWNoKG5ld0RlY29yYXRpb24gPT4ge1xuXHRcdFx0Y29uc3Qgb3duZXJJZCA9IG5ld0RlY29yYXRpb24ub3duZXJJZDtcblxuXHRcdFx0aWYgKCFtYXBwaW5nLmhhcyhvd25lcklkKSkge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fdmlld0NlbGxzLmZpbmQoY2VsbCA9PiBjZWxsLmhhbmRsZSA9PT0gb3duZXJJZCk7XG5cblx0XHRcdFx0aWYgKGNlbGwpIHtcblx0XHRcdFx0XHRtYXBwaW5nLnNldChvd25lcklkLCB7IGNlbGw6IGNlbGwsIG9sZERlY29yYXRpb25zOiBbXSwgbmV3RGVjb3JhdGlvbnM6IFtdIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRhdGEgPSBtYXBwaW5nLmdldChvd25lcklkKSE7XG5cdFx0XHRpZiAoZGF0YSkge1xuXHRcdFx0XHRkYXRhLm5ld0RlY29yYXRpb25zID0gbmV3RGVjb3JhdGlvbi5kZWNvcmF0aW9ucztcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHJldDogSUNlbGxNb2RlbERlY29yYXRpb25zW10gPSBbXTtcblx0XHRtYXBwaW5nLmZvckVhY2goKHZhbHVlLCBvd25lcklkKSA9PiB7XG5cdFx0XHRjb25zdCBjZWxsUmV0ID0gdmFsdWUuY2VsbC5kZWx0YU1vZGVsRGVjb3JhdGlvbnModmFsdWUub2xkRGVjb3JhdGlvbnMsIHZhbHVlLm5ld0RlY29yYXRpb25zKTtcblx0XHRcdHJldC5wdXNoKHtcblx0XHRcdFx0b3duZXJJZDogb3duZXJJZCxcblx0XHRcdFx0ZGVjb3JhdGlvbnM6IGNlbGxSZXRcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdC8vI3JlZ2lvbiBGaW5kXG5cdGZpbmQodmFsdWU6IHN0cmluZywgb3B0aW9uczogSU5vdGVib29rRmluZE9wdGlvbnMpOiBDZWxsRmluZE1hdGNoV2l0aEluZGV4W10ge1xuXHRcdGNvbnN0IG1hdGNoZXM6IENlbGxGaW5kTWF0Y2hXaXRoSW5kZXhbXSA9IFtdO1xuXHRcdGxldCBmaW5kQ2VsbHM6IENlbGxWaWV3TW9kZWxbXSA9IFtdO1xuXG5cdFx0aWYgKG9wdGlvbnMuZmluZFNjb3BlICYmIChvcHRpb25zLmZpbmRTY29wZS5maW5kU2NvcGVUeXBlID09PSBOb3RlYm9va0ZpbmRTY29wZVR5cGUuQ2VsbHMgfHwgb3B0aW9ucy5maW5kU2NvcGUuZmluZFNjb3BlVHlwZSA9PT0gTm90ZWJvb2tGaW5kU2NvcGVUeXBlLlRleHQpKSB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZFJhbmdlcyA9IG9wdGlvbnMuZmluZFNjb3BlLnNlbGVjdGVkQ2VsbFJhbmdlcz8ubWFwKHJhbmdlID0+IHRoaXMudmFsaWRhdGVSYW5nZShyYW5nZSkpLmZpbHRlcihyYW5nZSA9PiAhIXJhbmdlKSA/PyBbXTtcblx0XHRcdGNvbnN0IHNlbGVjdGVkSW5kZXhlcyA9IGNlbGxSYW5nZXNUb0luZGV4ZXMoc2VsZWN0ZWRSYW5nZXMpO1xuXHRcdFx0ZmluZENlbGxzID0gc2VsZWN0ZWRJbmRleGVzLm1hcChpbmRleCA9PiB0aGlzLl92aWV3Q2VsbHNbaW5kZXhdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZmluZENlbGxzID0gdGhpcy5fdmlld0NlbGxzO1xuXHRcdH1cblxuXHRcdGZpbmRDZWxscy5mb3JFYWNoKChjZWxsLCBpbmRleCkgPT4ge1xuXHRcdFx0Y29uc3QgY2VsbE1hdGNoZXMgPSBjZWxsLnN0YXJ0RmluZCh2YWx1ZSwgb3B0aW9ucyk7XG5cdFx0XHRpZiAoY2VsbE1hdGNoZXMpIHtcblx0XHRcdFx0bWF0Y2hlcy5wdXNoKG5ldyBDZWxsRmluZE1hdGNoTW9kZWwoXG5cdFx0XHRcdFx0Y2VsbE1hdGNoZXMuY2VsbCxcblx0XHRcdFx0XHRpbmRleCxcblx0XHRcdFx0XHRjZWxsTWF0Y2hlcy5jb250ZW50TWF0Y2hlcyxcblx0XHRcdFx0XHRbXVxuXHRcdFx0XHQpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIGZpbHRlciBiYXNlZCBvbiBvcHRpb25zIGFuZCBlZGl0aW5nIHN0YXRlXG5cblx0XHRyZXR1cm4gbWF0Y2hlcy5maWx0ZXIobWF0Y2ggPT4ge1xuXHRcdFx0aWYgKG1hdGNoLmNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUpIHtcblx0XHRcdFx0Ly8gY29kZSBjZWxsLCB3ZSBvbmx5IGluY2x1ZGUgaXRzIG1hdGNoIGlmIGluY2x1ZGUgaW5wdXQgaXMgZW5hYmxlZFxuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5pbmNsdWRlQ29kZUlucHV0O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBtYXJrdXAgY2VsbCwgaXQgZGVwZW5kcyBvbiB0aGUgZWRpdGluZyBzdGF0ZVxuXHRcdFx0aWYgKG1hdGNoLmNlbGwuZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuRWRpdGluZykge1xuXHRcdFx0XHQvLyBlZGl0aW5nLCBldmVuIGlmIHdlIGluY2x1ZGVNYXJrdXBQcmV2aWV3XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmluY2x1ZGVNYXJrdXBJbnB1dDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGNlbGwgaW4gcHJldmlldyBtb2RlLCB3ZSBzaG91bGQgb25seSBpbmNsdWRlIGl0IGlmIGluY2x1ZGVNYXJrdXBQcmV2aWV3IGlzIGZhbHNlIGJ1dCBpbmNsdWRlTWFya3VwSW5wdXQgaXMgdHJ1ZVxuXHRcdFx0XHQvLyBpZiBpbmNsdWRlTWFya3VwUHJldmlldyBpcyB0cnVlLCB0aGVuIHdlIHNob3VsZCBpbmNsdWRlIHRoZSB3ZWJ2aWV3IG1hdGNoIHJlc3VsdCBvdGhlciB0aGFuIHRoaXNcblx0XHRcdFx0cmV0dXJuICFvcHRpb25zLmluY2x1ZGVNYXJrdXBQcmV2aWV3ICYmIG9wdGlvbnMuaW5jbHVkZU1hcmt1cElucHV0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cmVwbGFjZU9uZShjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgcmFuZ2U6IFJhbmdlLCB0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aWV3Q2VsbCA9IGNlbGwgYXMgQ2VsbFZpZXdNb2RlbDtcblx0XHR0aGlzLl9sYXN0Tm90ZWJvb2tFZGl0UmVzb3VyY2UucHVzaCh2aWV3Q2VsbC51cmkpO1xuXHRcdHJldHVybiB2aWV3Q2VsbC5yZXNvbHZlVGV4dE1vZGVsKCkudGhlbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9idWxrRWRpdFNlcnZpY2UuYXBwbHkoXG5cdFx0XHRcdFtuZXcgUmVzb3VyY2VUZXh0RWRpdChjZWxsLnVyaSwgeyByYW5nZSwgdGV4dCB9KV0sXG5cdFx0XHRcdHsgcXVvdGFibGVMYWJlbDogJ05vdGVib29rIFJlcGxhY2UnIH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyByZXBsYWNlQWxsKG1hdGNoZXM6IENlbGxGaW5kTWF0Y2hXaXRoSW5kZXhbXSwgdGV4dHM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFtYXRjaGVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHRFZGl0czogSVdvcmtzcGFjZVRleHRFZGl0W10gPSBbXTtcblx0XHR0aGlzLl9sYXN0Tm90ZWJvb2tFZGl0UmVzb3VyY2UucHVzaChtYXRjaGVzWzBdLmNlbGwudXJpKTtcblxuXHRcdG1hdGNoZXMuZm9yRWFjaChtYXRjaCA9PiB7XG5cdFx0XHRtYXRjaC5jb250ZW50TWF0Y2hlcy5mb3JFYWNoKChzaW5nbGVNYXRjaCwgaW5kZXgpID0+IHtcblx0XHRcdFx0dGV4dEVkaXRzLnB1c2goe1xuXHRcdFx0XHRcdHZlcnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRleHRFZGl0OiB7IHJhbmdlOiAoc2luZ2xlTWF0Y2ggYXMgRmluZE1hdGNoKS5yYW5nZSwgdGV4dDogdGV4dHNbaW5kZXhdIH0sXG5cdFx0XHRcdFx0cmVzb3VyY2U6IG1hdGNoLmNlbGwudXJpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwobWF0Y2hlcy5tYXAobWF0Y2ggPT4ge1xuXHRcdFx0cmV0dXJuIG1hdGNoLmNlbGwucmVzb2x2ZVRleHRNb2RlbCgpO1xuXHRcdH0pKS50aGVuKGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX2J1bGtFZGl0U2VydmljZS5hcHBseSh7IGVkaXRzOiB0ZXh0RWRpdHMgfSwgeyBxdW90YWJsZUxhYmVsOiAnTm90ZWJvb2sgUmVwbGFjZSBBbGwnIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFVuZG8vUmVkb1xuXG5cdHByaXZhdGUgYXN5bmMgX3dpdGhFbGVtZW50KGVsZW1lbnQ6IFNpbmdsZU1vZGVsRWRpdFN0YWNrRWxlbWVudCB8IE11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50LCBjYWxsYmFjazogKCkgPT4gUHJvbWlzZTx2b2lkPikge1xuXHRcdGNvbnN0IHZpZXdDZWxscyA9IHRoaXMuX3ZpZXdDZWxscy5maWx0ZXIoY2VsbCA9PiBlbGVtZW50Lm1hdGNoZXNSZXNvdXJjZShjZWxsLnVyaSkpO1xuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCBQcm9taXNlLmFsbCh2aWV3Q2VsbHMubWFwKGNlbGwgPT4gdGhpcy5fdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShjZWxsLnVyaSkpKTtcblx0XHRhd2FpdCBjYWxsYmFjaygpO1xuXHRcdHJlZnMuZm9yRWFjaChyZWYgPT4gcmVmLmRpc3Bvc2UoKSk7XG5cdH1cblxuXHRhc3luYyB1bmRvKCkge1xuXG5cdFx0Y29uc3QgZWRpdFN0YWNrID0gdGhpcy5fdW5kb1NlcnZpY2UuZ2V0RWxlbWVudHModGhpcy51cmkpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBlZGl0U3RhY2sucGFzdC5sZW5ndGggPyBlZGl0U3RhY2sucGFzdFtlZGl0U3RhY2sucGFzdC5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblxuXHRcdGlmIChlbGVtZW50ICYmIGVsZW1lbnQgaW5zdGFuY2VvZiBTaW5nbGVNb2RlbEVkaXRTdGFja0VsZW1lbnQgfHwgZWxlbWVudCBpbnN0YW5jZW9mIE11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50KSB7XG5cdFx0XHRhd2FpdCB0aGlzLl93aXRoRWxlbWVudChlbGVtZW50LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3VuZG9TZXJ2aWNlLnVuZG8odGhpcy51cmkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiAoZWxlbWVudCBpbnN0YW5jZW9mIFNpbmdsZU1vZGVsRWRpdFN0YWNrRWxlbWVudCkgPyBbZWxlbWVudC5yZXNvdXJjZV0gOiBlbGVtZW50LnJlc291cmNlcztcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl91bmRvU2VydmljZS51bmRvKHRoaXMudXJpKTtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRhc3luYyByZWRvKCkge1xuXG5cdFx0Y29uc3QgZWRpdFN0YWNrID0gdGhpcy5fdW5kb1NlcnZpY2UuZ2V0RWxlbWVudHModGhpcy51cmkpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBlZGl0U3RhY2suZnV0dXJlWzBdO1xuXG5cdFx0aWYgKGVsZW1lbnQgJiYgZWxlbWVudCBpbnN0YW5jZW9mIFNpbmdsZU1vZGVsRWRpdFN0YWNrRWxlbWVudCB8fCBlbGVtZW50IGluc3RhbmNlb2YgTXVsdGlNb2RlbEVkaXRTdGFja0VsZW1lbnQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3dpdGhFbGVtZW50KGVsZW1lbnQsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fdW5kb1NlcnZpY2UucmVkbyh0aGlzLnVyaSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIChlbGVtZW50IGluc3RhbmNlb2YgU2luZ2xlTW9kZWxFZGl0U3RhY2tFbGVtZW50KSA/IFtlbGVtZW50LnJlc291cmNlXSA6IGVsZW1lbnQucmVzb3VyY2VzO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX3VuZG9TZXJ2aWNlLnJlZG8odGhpcy51cmkpO1xuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0ZXF1YWwobm90ZWJvb2s6IE5vdGVib29rVGV4dE1vZGVsKSB7XG5cdFx0cmV0dXJuIHRoaXMuX25vdGVib29rID09PSBub3RlYm9vaztcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fbG9jYWxTdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuX3ZpZXdDZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0Y2VsbC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgQ2VsbFZpZXdNb2RlbCA9IChDb2RlQ2VsbFZpZXdNb2RlbCB8IE1hcmt1cENlbGxWaWV3TW9kZWwpICYgSUNlbGxWaWV3TW9kZWw7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDZWxsVmlld01vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIG5vdGVib29rVmlld01vZGVsOiBOb3RlYm9va1ZpZXdNb2RlbCwgY2VsbDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsLCB2aWV3Q29udGV4dDogVmlld0NvbnRleHQpIHtcblx0aWYgKGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUpIHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUNlbGxWaWV3TW9kZWwsIG5vdGVib29rVmlld01vZGVsLnZpZXdUeXBlLCBjZWxsLCBub3RlYm9va1ZpZXdNb2RlbC5sYXlvdXRJbmZvLCB2aWV3Q29udGV4dCk7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hcmt1cENlbGxWaWV3TW9kZWwsIG5vdGVib29rVmlld01vZGVsLnZpZXdUeXBlLCBjZWxsLCBub3RlYm9va1ZpZXdNb2RlbC5sYXlvdXRJbmZvLCBub3RlYm9va1ZpZXdNb2RlbCwgdmlld0NvbnRleHQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxhQUFhO0FBQ3RCLFlBQVksYUFBYTtBQUV6QixTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUyxhQUFhO0FBR3RCLFNBQW9FLDhCQUE4QjtBQUNsRyxTQUFTLDRCQUE0QixtQ0FBbUM7QUFDeEUsU0FBUyxjQUFjLG9CQUFvQjtBQUMzQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQXVDLGtCQUEyUixnQ0FBa0U7QUFDN1ksU0FBNkIsb0NBQW9DO0FBQ2pFLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBSXBDLFNBQVMsVUFBd0QseUJBQXNELHVCQUF1QiwwQkFBMEI7QUFDeEssU0FBUyxnQ0FBZ0MsNkJBQTZCO0FBQ3RFLFNBQVMscUJBQXFCLHFCQUFpQyx3QkFBd0I7QUFFdkYsTUFBTSxjQUFjLE1BQU07QUFBRSxRQUFNLElBQUksTUFBTSx5QkFBeUI7QUFB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
