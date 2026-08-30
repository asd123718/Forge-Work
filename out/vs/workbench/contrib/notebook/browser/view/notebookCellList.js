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
import * as DOM from "../../../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../../../base/browser/domStylesheets.js";
import { ListError } from "../../../../../base/browser/ui/list/list.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { isMacintosh } from "../../../../../base/common/platform.js";
import { TrackedRangeStickiness } from "../../../../../editor/common/model.js";
import { PrefixSumComputer } from "../../../../../editor/common/model/prefixSumComputer.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IListService, WorkbenchList } from "../../../../../platform/list/browser/listService.js";
import { CursorAtBoundary, CellEditState, CellRevealType, CellRevealRangeType, CursorAtLineBoundary } from "../notebookBrowser.js";
import { diff, NOTEBOOK_EDITOR_CURSOR_BOUNDARY, CellKind, SelectionStateType, NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY } from "../../common/notebookCommon.js";
import { cellRangesToIndexes, reduceCellRanges, cellRangesEqual } from "../../common/notebookRange.js";
import { NOTEBOOK_CELL_LIST_FOCUSED } from "../../common/notebookContextKeys.js";
import { clamp } from "../../../../../base/common/numbers.js";
import { FastDomNode } from "../../../../../base/browser/fastDomNode.js";
import { MarkupCellViewModel } from "../viewModel/markupCellViewModel.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { NotebookCellListView } from "./notebookCellListView.js";
import { INotebookExecutionStateService } from "../../common/notebookExecutionStateService.js";
import { NotebookCellAnchor } from "./notebookCellAnchor.js";
import { NotebookViewZones } from "../viewParts/notebookViewZones.js";
import { NotebookCellOverlays } from "../viewParts/notebookCellOverlays.js";
var CellRevealPosition = /* @__PURE__ */ ((CellRevealPosition2) => {
  CellRevealPosition2[CellRevealPosition2["Top"] = 0] = "Top";
  CellRevealPosition2[CellRevealPosition2["Center"] = 1] = "Center";
  CellRevealPosition2[CellRevealPosition2["Bottom"] = 2] = "Bottom";
  CellRevealPosition2[CellRevealPosition2["NearTop"] = 3] = "NearTop";
  return CellRevealPosition2;
})(CellRevealPosition || {});
function getVisibleCells(cells, hiddenRanges) {
  if (!hiddenRanges.length) {
    return cells;
  }
  let start = 0;
  let hiddenRangeIndex = 0;
  const result = [];
  while (start < cells.length && hiddenRangeIndex < hiddenRanges.length) {
    if (start < hiddenRanges[hiddenRangeIndex].start) {
      result.push(...cells.slice(start, hiddenRanges[hiddenRangeIndex].start));
    }
    start = hiddenRanges[hiddenRangeIndex].end + 1;
    hiddenRangeIndex++;
  }
  if (start < cells.length) {
    result.push(...cells.slice(start));
  }
  return result;
}
const NOTEBOOK_WEBVIEW_BOUNDARY = 5e3;
function validateWebviewBoundary(element) {
  const webviewTop = 0 - (parseInt(element.style.top, 10) || 0);
  return webviewTop >= 0 && webviewTop <= NOTEBOOK_WEBVIEW_BOUNDARY * 2;
}
let NotebookCellList = class extends WorkbenchList {
  constructor(listUser, container, notebookOptions, delegate, renderers, contextKeyService, options, listService, configurationService, instantiationService, notebookExecutionStateService) {
    super(listUser, container, delegate, renderers, options, contextKeyService, listService, configurationService, instantiationService);
    this.listUser = listUser;
    this.notebookOptions = notebookOptions;
    this._previousFocusedElements = [];
    this._localDisposableStore = new DisposableStore();
    this._viewModelStore = new DisposableStore();
    this._onDidRemoveOutputs = this._localDisposableStore.add(new Emitter());
    this.onDidRemoveOutputs = this._onDidRemoveOutputs.event;
    this._onDidHideOutputs = this._localDisposableStore.add(new Emitter());
    this.onDidHideOutputs = this._onDidHideOutputs.event;
    this._onDidRemoveCellsFromView = this._localDisposableStore.add(new Emitter());
    this.onDidRemoveCellsFromView = this._onDidRemoveCellsFromView.event;
    this._viewModel = null;
    this._hiddenRangeIds = [];
    this.hiddenRangesPrefixSum = null;
    this._onDidChangeVisibleRanges = this._localDisposableStore.add(new Emitter());
    this.onDidChangeVisibleRanges = this._onDidChangeVisibleRanges.event;
    this._visibleRanges = [];
    this._isDisposed = false;
    this._isInLayout = false;
    this._webviewElement = null;
    NOTEBOOK_CELL_LIST_FOCUSED.bindTo(this.contextKeyService).set(true);
    this._previousFocusedElements = this.getFocusedElements();
    this._localDisposableStore.add(this.onDidChangeFocus((e) => {
      this._previousFocusedElements.forEach((element) => {
        if (e.elements.indexOf(element) < 0) {
          element.onDeselect();
        }
      });
      this._previousFocusedElements = e.elements;
    }));
    const notebookEditorCursorAtBoundaryContext = NOTEBOOK_EDITOR_CURSOR_BOUNDARY.bindTo(contextKeyService);
    notebookEditorCursorAtBoundaryContext.set("none");
    const notebookEditorCursorAtLineBoundaryContext = NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY.bindTo(contextKeyService);
    notebookEditorCursorAtLineBoundaryContext.set("none");
    const cursorSelectionListener = this._localDisposableStore.add(new MutableDisposable());
    const textEditorAttachListener = this._localDisposableStore.add(new MutableDisposable());
    this._notebookCellAnchor = new NotebookCellAnchor(notebookExecutionStateService, configurationService, this.onDidScroll);
    const recomputeContext = (element) => {
      switch (element.cursorAtBoundary()) {
        case CursorAtBoundary.Both:
          notebookEditorCursorAtBoundaryContext.set("both");
          break;
        case CursorAtBoundary.Top:
          notebookEditorCursorAtBoundaryContext.set("top");
          break;
        case CursorAtBoundary.Bottom:
          notebookEditorCursorAtBoundaryContext.set("bottom");
          break;
        default:
          notebookEditorCursorAtBoundaryContext.set("none");
          break;
      }
      switch (element.cursorAtLineBoundary()) {
        case CursorAtLineBoundary.Both:
          notebookEditorCursorAtLineBoundaryContext.set("both");
          break;
        case CursorAtLineBoundary.Start:
          notebookEditorCursorAtLineBoundaryContext.set("start");
          break;
        case CursorAtLineBoundary.End:
          notebookEditorCursorAtLineBoundaryContext.set("end");
          break;
        default:
          notebookEditorCursorAtLineBoundaryContext.set("none");
          break;
      }
      return;
    };
    this._localDisposableStore.add(this.onDidChangeFocus((e) => {
      if (e.elements.length) {
        const focusedElement = e.elements[0];
        cursorSelectionListener.value = focusedElement.onDidChangeState((e2) => {
          if (e2.selectionChanged) {
            recomputeContext(focusedElement);
          }
        });
        textEditorAttachListener.value = focusedElement.onDidChangeEditorAttachState(() => {
          if (focusedElement.editorAttached) {
            recomputeContext(focusedElement);
          }
        });
        recomputeContext(focusedElement);
        return;
      }
      notebookEditorCursorAtBoundaryContext.set("none");
    }));
    const updateVisibleRanges = () => {
      if (!this.view.length) {
        return;
      }
      const top = this.getViewScrollTop();
      const bottom = this.getViewScrollBottom();
      if (top >= bottom) {
        return;
      }
      const topViewIndex = clamp(this.view.indexAt(top), 0, this.view.length - 1);
      const topElement = this.view.element(topViewIndex);
      const topModelIndex = this._viewModel.getCellIndex(topElement);
      const bottomViewIndex = clamp(this.view.indexAt(bottom), 0, this.view.length - 1);
      const bottomElement = this.view.element(bottomViewIndex);
      const bottomModelIndex = this._viewModel.getCellIndex(bottomElement);
      if (bottomModelIndex - topModelIndex === bottomViewIndex - topViewIndex) {
        this.visibleRanges = [{ start: topModelIndex, end: bottomModelIndex + 1 }];
      } else {
        this.visibleRanges = this._getVisibleRangesFromIndex(topViewIndex, topModelIndex, bottomViewIndex, bottomModelIndex);
      }
    };
    this._localDisposableStore.add(this.view.onDidChangeContentHeight(() => {
      if (this._isInLayout) {
        DOM.scheduleAtNextAnimationFrame(DOM.getWindow(container), () => {
          updateVisibleRanges();
        });
      }
      updateVisibleRanges();
    }));
    this._localDisposableStore.add(this.view.onDidScroll(() => {
      if (this._isInLayout) {
        DOM.scheduleAtNextAnimationFrame(DOM.getWindow(container), () => {
          updateVisibleRanges();
        });
      }
      updateVisibleRanges();
    }));
  }
  get onWillScroll() {
    return this.view.onWillScroll;
  }
  get rowsContainer() {
    return this.view.containerDomNode;
  }
  get scrollableElement() {
    return this.view.scrollableElementDomNode;
  }
  get viewModel() {
    return this._viewModel;
  }
  get visibleRanges() {
    return this._visibleRanges;
  }
  set visibleRanges(ranges) {
    if (cellRangesEqual(this._visibleRanges, ranges)) {
      return;
    }
    this._visibleRanges = ranges;
    this._onDidChangeVisibleRanges.fire();
  }
  get isDisposed() {
    return this._isDisposed;
  }
  get webviewElement() {
    return this._webviewElement;
  }
  get inRenderingTransaction() {
    return this.view.inRenderingTransaction;
  }
  createListView(container, virtualDelegate, renderers, viewOptions) {
    const listView = new NotebookCellListView(container, virtualDelegate, renderers, viewOptions);
    this.viewZones = new NotebookViewZones(listView, this);
    this.cellOverlays = new NotebookCellOverlays(listView);
    return listView;
  }
  /**
   * Test Only
   */
  _getView() {
    return this.view;
  }
  attachWebview(element) {
    element.style.top = `-${NOTEBOOK_WEBVIEW_BOUNDARY}px`;
    this.rowsContainer.insertAdjacentElement("afterbegin", element);
    this._webviewElement = new FastDomNode(element);
  }
  elementAt(position) {
    if (!this.view.length) {
      return void 0;
    }
    const idx = this.view.indexAt(position);
    const clamped = clamp(idx, 0, this.view.length - 1);
    return this.element(clamped);
  }
  elementHeight(element) {
    const index = this._getViewIndexUpperBound(element);
    if (index === void 0 || index < 0 || index >= this.length) {
      this._getViewIndexUpperBound(element);
      throw new ListError(this.listUser, `Invalid index ${index}`);
    }
    return this.view.elementHeight(index);
  }
  detachViewModel() {
    this._viewModelStore.clear();
    this._viewModel = null;
    this.hiddenRangesPrefixSum = null;
  }
  attachViewModel(model) {
    this._viewModel = model;
    this._viewModelStore.add(model.onDidChangeViewCells((e) => {
      if (this._isDisposed) {
        return;
      }
      this.viewZones.onCellsChanged(e);
      this.cellOverlays.onCellsChanged(e);
      const currentRanges = this._hiddenRangeIds.map((id) => this._viewModel.getTrackedRange(id)).filter((range) => range !== null);
      const newVisibleViewCells = getVisibleCells(this._viewModel.viewCells, currentRanges);
      const oldVisibleViewCells = [];
      const oldViewCellMapping = /* @__PURE__ */ new Set();
      for (let i = 0; i < this.length; i++) {
        oldVisibleViewCells.push(this.element(i));
        oldViewCellMapping.add(this.element(i).uri.toString());
      }
      const viewDiffs = diff(oldVisibleViewCells, newVisibleViewCells, (a) => {
        return oldViewCellMapping.has(a.uri.toString());
      });
      if (e.synchronous) {
        this._updateElementsInWebview(viewDiffs);
      } else {
        this._viewModelStore.add(DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.rowsContainer), () => {
          if (this._isDisposed) {
            return;
          }
          this._updateElementsInWebview(viewDiffs);
        }));
      }
    }));
    this._viewModelStore.add(model.onDidChangeSelection((e) => {
      if (e === "view") {
        return;
      }
      const viewSelections = cellRangesToIndexes(model.getSelections()).map((index) => model.cellAt(index)).filter((cell) => !!cell).map((cell) => this._getViewIndexUpperBound(cell));
      this.setSelection(viewSelections, void 0, true);
      const primary = cellRangesToIndexes([model.getFocus()]).map((index) => model.cellAt(index)).filter((cell) => !!cell).map((cell) => this._getViewIndexUpperBound(cell));
      if (primary.length) {
        this.setFocus(primary, void 0, true);
      }
    }));
    const hiddenRanges = model.getHiddenRanges();
    this.setHiddenAreas(hiddenRanges, false);
    const newRanges = reduceCellRanges(hiddenRanges);
    const viewCells = model.viewCells.slice(0);
    newRanges.reverse().forEach((range) => {
      const removedCells = viewCells.splice(range.start, range.end - range.start + 1);
      this._onDidRemoveCellsFromView.fire(removedCells);
    });
    this.splice2(0, 0, viewCells);
  }
  _updateElementsInWebview(viewDiffs) {
    viewDiffs.reverse().forEach((diff2) => {
      const hiddenOutputs = [];
      const deletedOutputs = [];
      const removedMarkdownCells = [];
      for (let i = diff2.start; i < diff2.start + diff2.deleteCount; i++) {
        const cell = this.element(i);
        if (cell.cellKind === CellKind.Code) {
          if (this._viewModel.hasCell(cell)) {
            hiddenOutputs.push(...cell?.outputsViewModels);
          } else {
            deletedOutputs.push(...cell?.outputsViewModels);
          }
        } else {
          removedMarkdownCells.push(cell);
        }
      }
      this.splice2(diff2.start, diff2.deleteCount, diff2.toInsert);
      this._onDidHideOutputs.fire(hiddenOutputs);
      this._onDidRemoveOutputs.fire(deletedOutputs);
      this._onDidRemoveCellsFromView.fire(removedMarkdownCells);
    });
  }
  clear() {
    super.splice(0, this.length);
  }
  setHiddenAreas(_ranges, triggerViewUpdate) {
    if (!this._viewModel) {
      return false;
    }
    const newRanges = reduceCellRanges(_ranges);
    const oldRanges = this._hiddenRangeIds.map((id) => this._viewModel.getTrackedRange(id)).filter((range) => range !== null);
    if (newRanges.length === oldRanges.length) {
      let hasDifference = false;
      for (let i = 0; i < newRanges.length; i++) {
        if (!(newRanges[i].start === oldRanges[i].start && newRanges[i].end === oldRanges[i].end)) {
          hasDifference = true;
          break;
        }
      }
      if (!hasDifference) {
        this._updateHiddenRangePrefixSum(newRanges);
        this.viewZones.onHiddenRangesChange();
        this.viewZones.layout();
        this.cellOverlays.onHiddenRangesChange();
        this.cellOverlays.layout();
        return false;
      }
    }
    this._hiddenRangeIds.forEach((id) => this._viewModel.setTrackedRange(id, null, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter));
    const hiddenAreaIds = newRanges.map((range) => this._viewModel.setTrackedRange(null, range, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter)).filter((id) => id !== null);
    this._hiddenRangeIds = hiddenAreaIds;
    this._updateHiddenRangePrefixSum(newRanges);
    this.viewZones.onHiddenRangesChange();
    this.cellOverlays.onHiddenRangesChange();
    if (triggerViewUpdate) {
      this.updateHiddenAreasInView(oldRanges, newRanges);
    }
    this.viewZones.layout();
    this.cellOverlays.layout();
    return true;
  }
  _updateHiddenRangePrefixSum(newRanges) {
    let start = 0;
    let index = 0;
    const ret = [];
    while (index < newRanges.length) {
      for (let j = start; j < newRanges[index].start - 1; j++) {
        ret.push(1);
      }
      ret.push(newRanges[index].end - newRanges[index].start + 1 + 1);
      start = newRanges[index].end + 1;
      index++;
    }
    for (let i = start; i < this._viewModel.length; i++) {
      ret.push(1);
    }
    const values = new Uint32Array(ret.length);
    for (let i = 0; i < ret.length; i++) {
      values[i] = ret[i];
    }
    this.hiddenRangesPrefixSum = new PrefixSumComputer(values);
  }
  /**
   * oldRanges and newRanges are all reduced and sorted.
   */
  updateHiddenAreasInView(oldRanges, newRanges) {
    const oldViewCellEntries = getVisibleCells(this._viewModel.viewCells, oldRanges);
    const oldViewCellMapping = /* @__PURE__ */ new Set();
    oldViewCellEntries.forEach((cell) => {
      oldViewCellMapping.add(cell.uri.toString());
    });
    const newViewCellEntries = getVisibleCells(this._viewModel.viewCells, newRanges);
    const viewDiffs = diff(oldViewCellEntries, newViewCellEntries, (a) => {
      return oldViewCellMapping.has(a.uri.toString());
    });
    this._updateElementsInWebview(viewDiffs);
  }
  splice2(start, deleteCount, elements = []) {
    if (start < 0 || start > this.view.length) {
      return;
    }
    const focusInside = DOM.isAncestorOfActiveElement(this.rowsContainer);
    super.splice(start, deleteCount, elements);
    if (focusInside) {
      this.domFocus();
    }
    const selectionsLeft = [];
    this.getSelectedElements().forEach((el) => {
      if (this._viewModel.hasCell(el)) {
        selectionsLeft.push(el.handle);
      }
    });
    if (!selectionsLeft.length && this._viewModel.viewCells.length) {
      this._viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] });
    }
    this.viewZones.layout();
    this.cellOverlays.layout();
  }
  getModelIndex(cell) {
    const viewIndex = this.indexOf(cell);
    return this.getModelIndex2(viewIndex);
  }
  getModelIndex2(viewIndex) {
    if (!this.hiddenRangesPrefixSum) {
      return viewIndex;
    }
    const modelIndex = this.hiddenRangesPrefixSum.getPrefixSum(viewIndex - 1);
    return modelIndex;
  }
  getViewIndex(cell) {
    const modelIndex = this._viewModel.getCellIndex(cell);
    return this.getViewIndex2(modelIndex);
  }
  getViewIndex2(modelIndex) {
    if (!this.hiddenRangesPrefixSum) {
      return modelIndex;
    }
    const viewIndexInfo = this.hiddenRangesPrefixSum.getIndexOf(modelIndex);
    if (viewIndexInfo.remainder !== 0) {
      if (modelIndex >= this.hiddenRangesPrefixSum.getTotalSum()) {
        return modelIndex - (this.hiddenRangesPrefixSum.getTotalSum() - this.hiddenRangesPrefixSum.getCount());
      }
      return void 0;
    } else {
      return viewIndexInfo.index;
    }
  }
  convertModelIndexToViewIndex(modelIndex) {
    if (!this.hiddenRangesPrefixSum) {
      return modelIndex;
    }
    if (modelIndex >= this.hiddenRangesPrefixSum.getTotalSum()) {
      return Math.min(this.length, this.hiddenRangesPrefixSum.getTotalSum());
    }
    return this.hiddenRangesPrefixSum.getIndexOf(modelIndex).index;
  }
  modelIndexIsVisible(modelIndex) {
    if (!this.hiddenRangesPrefixSum) {
      return true;
    }
    const viewIndexInfo = this.hiddenRangesPrefixSum.getIndexOf(modelIndex);
    if (viewIndexInfo.remainder !== 0) {
      if (modelIndex >= this.hiddenRangesPrefixSum.getTotalSum()) {
        return true;
      }
      return false;
    } else {
      return true;
    }
  }
  _getVisibleRangesFromIndex(topViewIndex, topModelIndex, bottomViewIndex, bottomModelIndex) {
    const stack = [];
    const ranges = [];
    let index = topViewIndex;
    let modelIndex = topModelIndex;
    while (index <= bottomViewIndex) {
      const accu = this.hiddenRangesPrefixSum.getPrefixSum(index);
      if (accu === modelIndex + 1) {
        if (stack.length) {
          if (stack[stack.length - 1] === modelIndex - 1) {
            ranges.push({ start: stack[stack.length - 1], end: modelIndex + 1 });
          } else {
            ranges.push({ start: stack[stack.length - 1], end: stack[stack.length - 1] + 1 });
          }
        }
        stack.push(modelIndex);
        index++;
        modelIndex++;
      } else {
        if (stack.length) {
          if (stack[stack.length - 1] === modelIndex - 1) {
            ranges.push({ start: stack[stack.length - 1], end: modelIndex + 1 });
          } else {
            ranges.push({ start: stack[stack.length - 1], end: stack[stack.length - 1] + 1 });
          }
        }
        stack.push(modelIndex);
        index++;
        modelIndex = accu;
      }
    }
    if (stack.length) {
      ranges.push({ start: stack[stack.length - 1], end: stack[stack.length - 1] + 1 });
    }
    return reduceCellRanges(ranges);
  }
  getVisibleRangesPlusViewportAboveAndBelow() {
    if (this.view.length <= 0) {
      return [];
    }
    const top = Math.max(this.getViewScrollTop() - this.renderHeight, 0);
    const topViewIndex = this.view.indexAt(top);
    const topElement = this.view.element(topViewIndex);
    const topModelIndex = this._viewModel.getCellIndex(topElement);
    const bottom = clamp(this.getViewScrollBottom() + this.renderHeight, 0, this.scrollHeight);
    const bottomViewIndex = clamp(this.view.indexAt(bottom), 0, this.view.length - 1);
    const bottomElement = this.view.element(bottomViewIndex);
    const bottomModelIndex = this._viewModel.getCellIndex(bottomElement);
    if (bottomModelIndex - topModelIndex === bottomViewIndex - topViewIndex) {
      return [{ start: topModelIndex, end: bottomModelIndex }];
    } else {
      return this._getVisibleRangesFromIndex(topViewIndex, topModelIndex, bottomViewIndex, bottomModelIndex);
    }
  }
  _getViewIndexUpperBound(cell) {
    if (!this._viewModel) {
      return -1;
    }
    const modelIndex = this._viewModel.getCellIndex(cell);
    if (modelIndex === -1) {
      return -1;
    }
    if (!this.hiddenRangesPrefixSum) {
      return modelIndex;
    }
    const viewIndexInfo = this.hiddenRangesPrefixSum.getIndexOf(modelIndex);
    if (viewIndexInfo.remainder !== 0) {
      if (modelIndex >= this.hiddenRangesPrefixSum.getTotalSum()) {
        return modelIndex - (this.hiddenRangesPrefixSum.getTotalSum() - this.hiddenRangesPrefixSum.getCount());
      }
    }
    return viewIndexInfo.index;
  }
  _getViewIndexUpperBound2(modelIndex) {
    if (!this.hiddenRangesPrefixSum) {
      return modelIndex;
    }
    const viewIndexInfo = this.hiddenRangesPrefixSum.getIndexOf(modelIndex);
    if (viewIndexInfo.remainder !== 0) {
      if (modelIndex >= this.hiddenRangesPrefixSum.getTotalSum()) {
        return modelIndex - (this.hiddenRangesPrefixSum.getTotalSum() - this.hiddenRangesPrefixSum.getCount());
      }
    }
    return viewIndexInfo.index;
  }
  focusElement(cell) {
    const index = this._getViewIndexUpperBound(cell);
    if (index >= 0 && this._viewModel) {
      const focusedElementHandle = this.element(index).handle;
      this._viewModel.updateSelectionsState({
        kind: SelectionStateType.Handle,
        primary: focusedElementHandle,
        selections: [focusedElementHandle]
      }, "view");
      this.setFocus([index], void 0, false);
    }
  }
  selectElements(elements) {
    const indices = elements.map((cell) => this._getViewIndexUpperBound(cell)).filter((index) => index >= 0);
    this.setSelection(indices);
  }
  getCellViewScrollTop(cell) {
    const index = this._getViewIndexUpperBound(cell);
    if (index === void 0 || index < 0 || index >= this.length) {
      throw new ListError(this.listUser, `Invalid index ${index}`);
    }
    return this.view.elementTop(index);
  }
  getCellViewScrollBottom(cell) {
    const index = this._getViewIndexUpperBound(cell);
    if (index === void 0 || index < 0 || index >= this.length) {
      throw new ListError(this.listUser, `Invalid index ${index}`);
    }
    const top = this.view.elementTop(index);
    const height = this.view.elementHeight(index);
    return top + height;
  }
  setFocus(indexes, browserEvent, ignoreTextModelUpdate) {
    if (ignoreTextModelUpdate) {
      super.setFocus(indexes, browserEvent);
      return;
    }
    if (!indexes.length) {
      if (this._viewModel) {
        if (this.length) {
          return;
        }
        this._viewModel.updateSelectionsState({
          kind: SelectionStateType.Handle,
          primary: null,
          selections: []
        }, "view");
      }
    } else {
      if (this._viewModel) {
        const focusedElementHandle = this.element(indexes[0]).handle;
        this._viewModel.updateSelectionsState({
          kind: SelectionStateType.Handle,
          primary: focusedElementHandle,
          selections: this.getSelection().map((selection) => this.element(selection).handle)
        }, "view");
      }
    }
    super.setFocus(indexes, browserEvent);
  }
  setSelection(indexes, browserEvent, ignoreTextModelUpdate) {
    if (ignoreTextModelUpdate) {
      super.setSelection(indexes, browserEvent);
      return;
    }
    if (!indexes.length) {
      if (this._viewModel) {
        this._viewModel.updateSelectionsState({
          kind: SelectionStateType.Handle,
          primary: this.getFocusedElements()[0]?.handle ?? null,
          selections: []
        }, "view");
      }
    } else {
      if (this._viewModel) {
        this._viewModel.updateSelectionsState({
          kind: SelectionStateType.Handle,
          primary: this.getFocusedElements()[0]?.handle ?? null,
          selections: indexes.map((index) => this.element(index)).map((cell) => cell.handle)
        }, "view");
      }
    }
    super.setSelection(indexes, browserEvent);
  }
  /**
   * The range will be revealed with as little scrolling as possible.
   */
  revealCells(range) {
    const startIndex = this._getViewIndexUpperBound2(range.start);
    if (startIndex < 0) {
      return;
    }
    const endIndex = this._getViewIndexUpperBound2(range.end - 1);
    const scrollTop = this.getViewScrollTop();
    const wrapperBottom = this.getViewScrollBottom();
    const elementTop = this.view.elementTop(startIndex);
    if (elementTop >= scrollTop && elementTop < wrapperBottom) {
      const endElementTop = this.view.elementTop(endIndex);
      const endElementHeight = this.view.elementHeight(endIndex);
      if (endElementTop + endElementHeight <= wrapperBottom) {
        return;
      }
      if (endElementTop >= wrapperBottom) {
        return this._revealInternal(endIndex, false, 2 /* Bottom */);
      }
      if (endElementTop < wrapperBottom) {
        if (endElementTop + endElementHeight - wrapperBottom < elementTop - scrollTop) {
          return this.view.setScrollTop(scrollTop + endElementTop + endElementHeight - wrapperBottom);
        } else {
          return this._revealInternal(startIndex, false, 0 /* Top */);
        }
      }
    }
    this._revealInViewWithMinimalScrolling(startIndex);
  }
  _revealInViewWithMinimalScrolling(viewIndex, firstLine) {
    const firstIndex = this.view.firstMostlyVisibleIndex;
    const elementHeight = this.view.elementHeight(viewIndex);
    if (viewIndex <= firstIndex || !firstLine && elementHeight >= this.view.renderHeight) {
      this._revealInternal(viewIndex, true, 0 /* Top */);
    } else {
      this._revealInternal(viewIndex, true, 2 /* Bottom */, firstLine);
    }
  }
  scrollToBottom() {
    const scrollHeight = this.view.scrollHeight;
    const scrollTop = this.getViewScrollTop();
    const wrapperBottom = this.getViewScrollBottom();
    this.view.setScrollTop(scrollHeight - (wrapperBottom - scrollTop));
  }
  /**
   * Reveals the given cell in the notebook cell list. The cell will come into view syncronously
   * but the cell's editor will be attached asyncronously if it was previously out of view.
   * @returns The promise to await for the cell editor to be attached
   */
  async revealCell(cell, revealType) {
    const index = this._getViewIndexUpperBound(cell);
    if (index < 0) {
      return;
    }
    switch (revealType) {
      case CellRevealType.Top:
        this._revealInternal(index, false, 0 /* Top */);
        break;
      case CellRevealType.Center:
        this._revealInternal(index, false, 1 /* Center */);
        break;
      case CellRevealType.CenterIfOutsideViewport:
        this._revealInternal(index, true, 1 /* Center */);
        break;
      case CellRevealType.NearTopIfOutsideViewport:
        this._revealInternal(index, true, 3 /* NearTop */);
        break;
      case CellRevealType.FirstLineIfOutsideViewport:
        this._revealInViewWithMinimalScrolling(index, true);
        break;
      case CellRevealType.Default:
        this._revealInViewWithMinimalScrolling(index);
        break;
    }
    if (
      // wait for the editor to be created if the cell is in editing mode
      (cell.getEditState() === CellEditState.Editing || revealType === CellRevealType.FirstLineIfOutsideViewport && cell.cellKind === CellKind.Code) && !cell.editorAttached
    ) {
      return getEditorAttachedPromise(cell);
    }
    return;
  }
  _revealInternal(viewIndex, ignoreIfInsideViewport, revealPosition, firstLine) {
    if (viewIndex >= this.view.length) {
      return;
    }
    const scrollTop = this.getViewScrollTop();
    const wrapperBottom = this.getViewScrollBottom();
    const elementTop = this.view.elementTop(viewIndex);
    const elementBottom = this.view.elementHeight(viewIndex) + elementTop;
    if (ignoreIfInsideViewport) {
      if (elementTop >= scrollTop && elementBottom < wrapperBottom) {
        return;
      }
    }
    switch (revealPosition) {
      case 0 /* Top */:
        this.view.setScrollTop(elementTop);
        this.view.setScrollTop(this.view.elementTop(viewIndex));
        break;
      case 1 /* Center */:
      case 3 /* NearTop */:
        {
          this.view.setScrollTop(elementTop - this.view.renderHeight / 2);
          const newElementTop = this.view.elementTop(viewIndex);
          const newElementHeight = this.view.elementHeight(viewIndex);
          const renderHeight = this.getViewScrollBottom() - this.getViewScrollTop();
          if (newElementHeight >= renderHeight) {
            this.view.setScrollTop(newElementTop);
          } else if (revealPosition === 1 /* Center */) {
            this.view.setScrollTop(newElementTop + newElementHeight / 2 - renderHeight / 2);
          } else if (revealPosition === 3 /* NearTop */) {
            this.view.setScrollTop(newElementTop - renderHeight / 5);
          }
        }
        break;
      case 2 /* Bottom */:
        if (firstLine) {
          const lineHeight = this.viewModel?.layoutInfo?.fontInfo.lineHeight ?? 15;
          const padding = this.notebookOptions.getLayoutConfiguration().cellTopMargin + this.notebookOptions.getLayoutConfiguration().editorTopPadding;
          const firstLineLocation = elementTop + lineHeight + padding;
          if (firstLineLocation < wrapperBottom) {
            return;
          }
          this.view.setScrollTop(this.scrollTop + (firstLineLocation - wrapperBottom));
          break;
        }
        this.view.setScrollTop(this.scrollTop + (elementBottom - wrapperBottom));
        this.view.setScrollTop(this.scrollTop + (this.view.elementTop(viewIndex) + this.view.elementHeight(viewIndex) - this.getViewScrollBottom()));
        break;
      default:
        break;
    }
  }
  //#region Reveal Cell Editor Range asynchronously
  async revealRangeInCell(cell, range, revealType) {
    const index = this._getViewIndexUpperBound(cell);
    if (index < 0) {
      return;
    }
    switch (revealType) {
      case CellRevealRangeType.Default:
        return this._revealRangeInternalAsync(index, range);
      case CellRevealRangeType.Center:
        return this._revealRangeInCenterInternalAsync(index, range);
      case CellRevealRangeType.CenterIfOutsideViewport:
        return this._revealRangeInCenterIfOutsideViewportInternalAsync(index, range);
    }
  }
  // List items have real dynamic heights, which means after we set `scrollTop` based on the `elementTop(index)`, the element at `index` might still be removed from the view once all relayouting tasks are done.
  // For example, we scroll item 10 into the view upwards, in the first round, items 7, 8, 9, 10 are all in the viewport. Then item 7 and 8 resize themselves to be larger and finally item 10 is removed from the view.
  // To ensure that item 10 is always there, we need to scroll item 10 to the top edge of the viewport.
  async _revealRangeInternalAsync(viewIndex, range) {
    const scrollTop = this.getViewScrollTop();
    const wrapperBottom = this.getViewScrollBottom();
    const elementTop = this.view.elementTop(viewIndex);
    const element = this.view.element(viewIndex);
    if (element.editorAttached) {
      this._revealRangeCommon(viewIndex, range);
    } else {
      const elementHeight = this.view.elementHeight(viewIndex);
      let alignHint = void 0;
      if (elementTop + elementHeight <= scrollTop) {
        this.view.setScrollTop(elementTop);
        alignHint = "top";
      } else if (elementTop >= wrapperBottom) {
        this.view.setScrollTop(elementTop - this.view.renderHeight / 2);
        alignHint = "bottom";
      }
      const editorAttachedPromise = new Promise((resolve, reject) => {
        Event.once(element.onDidChangeEditorAttachState)(() => {
          element.editorAttached ? resolve() : reject();
        });
      });
      return editorAttachedPromise.then(() => {
        this._revealRangeCommon(viewIndex, range, alignHint);
      });
    }
  }
  async _revealRangeInCenterInternalAsync(viewIndex, range) {
    const reveal = (viewIndex2, range2) => {
      const element2 = this.view.element(viewIndex2);
      const positionOffset = element2.getPositionScrollTopOffset(range2);
      const positionOffsetInView = this.view.elementTop(viewIndex2) + positionOffset;
      this.view.setScrollTop(positionOffsetInView - this.view.renderHeight / 2);
      element2.revealRangeInCenter(range2);
    };
    const elementTop = this.view.elementTop(viewIndex);
    const viewItemOffset = elementTop;
    this.view.setScrollTop(viewItemOffset - this.view.renderHeight / 2);
    const element = this.view.element(viewIndex);
    if (!element.editorAttached) {
      return getEditorAttachedPromise(element).then(() => reveal(viewIndex, range));
    } else {
      reveal(viewIndex, range);
    }
  }
  async _revealRangeInCenterIfOutsideViewportInternalAsync(viewIndex, range) {
    const reveal = (viewIndex2, range2) => {
      const element2 = this.view.element(viewIndex2);
      const positionOffset2 = element2.getPositionScrollTopOffset(range2);
      const positionOffsetInView = this.view.elementTop(viewIndex2) + positionOffset2;
      this.view.setScrollTop(positionOffsetInView - this.view.renderHeight / 2);
      element2.revealRangeInCenter(range2);
    };
    const scrollTop = this.getViewScrollTop();
    const wrapperBottom = this.getViewScrollBottom();
    const elementTop = this.view.elementTop(viewIndex);
    const viewItemOffset = elementTop;
    const element = this.view.element(viewIndex);
    const positionOffset = viewItemOffset + element.getPositionScrollTopOffset(range);
    if (positionOffset < scrollTop || positionOffset > wrapperBottom) {
      this.view.setScrollTop(positionOffset - this.view.renderHeight / 2);
      const newPositionOffset = this.view.elementTop(viewIndex) + element.getPositionScrollTopOffset(range);
      this.view.setScrollTop(newPositionOffset - this.view.renderHeight / 2);
      if (!element.editorAttached) {
        return getEditorAttachedPromise(element).then(() => reveal(viewIndex, range));
      } else {
      }
    } else {
      if (element.editorAttached) {
        element.revealRangeInCenter(range);
      } else {
        return getEditorAttachedPromise(element).then(() => reveal(viewIndex, range));
      }
    }
  }
  _revealRangeCommon(viewIndex, range, alignHint) {
    const element = this.view.element(viewIndex);
    const scrollTop = this.getViewScrollTop();
    const wrapperBottom = this.getViewScrollBottom();
    const positionOffset = element.getPositionScrollTopOffset(range);
    const elementOriginalHeight = this.view.elementHeight(viewIndex);
    if (positionOffset >= elementOriginalHeight) {
      const newTotalHeight = element.layoutInfo.totalHeight;
      this.updateElementHeight(viewIndex, newTotalHeight);
    }
    const elementTop = this.view.elementTop(viewIndex);
    const positionTop = elementTop + positionOffset;
    if (positionTop < scrollTop) {
      this.view.setScrollTop(positionTop - 30);
    } else if (positionTop > wrapperBottom) {
      this.view.setScrollTop(scrollTop + positionTop - wrapperBottom + 30);
    } else if (alignHint === "bottom") {
      this.view.setScrollTop(scrollTop + positionTop - wrapperBottom + 30);
    } else if (alignHint === "top") {
      this.view.setScrollTop(positionTop - 30);
    }
  }
  //#endregion
  /**
   * Reveals the specified offset of the given cell in the center of the viewport.
   * This enables revealing locations in the output as well as the input.
   */
  revealCellOffsetInCenter(cell, offset) {
    const viewIndex = this._getViewIndexUpperBound(cell);
    if (viewIndex >= 0) {
      const element = this.view.element(viewIndex);
      const elementTop = this.view.elementTop(viewIndex);
      if (element instanceof MarkupCellViewModel) {
        return this._revealInCenterIfOutsideViewport(viewIndex);
      } else {
        const rangeOffset = element.layoutInfo.outputContainerOffset + Math.min(offset, element.layoutInfo.outputTotalHeight);
        this.view.setScrollTop(elementTop - this.view.renderHeight / 2);
        this.view.setScrollTop(elementTop + rangeOffset - this.view.renderHeight / 2);
      }
    }
  }
  revealOffsetInCenterIfOutsideViewport(offset) {
    const scrollTop = this.getViewScrollTop();
    const wrapperBottom = this.getViewScrollBottom();
    if (offset < scrollTop || offset > wrapperBottom) {
      const newTop = Math.max(0, offset - this.view.renderHeight / 2);
      this.view.setScrollTop(newTop);
    }
  }
  _revealInCenterIfOutsideViewport(viewIndex) {
    this._revealInternal(viewIndex, true, 1 /* Center */);
  }
  domElementOfElement(element) {
    const index = this._getViewIndexUpperBound(element);
    if (index >= 0 && index < this.length) {
      return this.view.domElement(index);
    }
    return null;
  }
  focusView() {
    this.view.domNode.focus();
  }
  triggerScrollFromMouseWheelEvent(browserEvent) {
    this.view.delegateScrollFromMouseWheelEvent(browserEvent);
  }
  delegateVerticalScrollbarPointerDown(browserEvent) {
    this.view.delegateVerticalScrollbarPointerDown(browserEvent);
  }
  isElementAboveViewport(index) {
    const elementTop = this.view.elementTop(index);
    const elementBottom = elementTop + this.view.elementHeight(index);
    return elementBottom < this.scrollTop;
  }
  updateElementHeight2(element, size, anchorElementIndex = null) {
    const index = this._getViewIndexUpperBound(element);
    if (index === void 0 || index < 0 || index >= this.length) {
      return;
    }
    if (this.isElementAboveViewport(index)) {
      const oldHeight = this.elementHeight(element);
      const delta = oldHeight - size;
      if (this._webviewElement) {
        Event.once(this.view.onWillScroll)(() => {
          const webviewTop = parseInt(this._webviewElement.domNode.style.top, 10);
          if (validateWebviewBoundary(this._webviewElement.domNode)) {
            this._webviewElement.setTop(webviewTop - delta);
          } else {
            this._webviewElement.setTop(-NOTEBOOK_WEBVIEW_BOUNDARY);
          }
        });
      }
      this.view.updateElementHeight(index, size, anchorElementIndex);
      this.viewZones.layout();
      this.cellOverlays.layout();
      return;
    }
    if (anchorElementIndex !== null) {
      this.view.updateElementHeight(index, size, anchorElementIndex);
      this.viewZones.layout();
      this.cellOverlays.layout();
      return;
    }
    const focused = this.getFocus();
    const focus = focused.length ? focused[0] : null;
    if (focus) {
      const heightDelta = size - this.view.elementHeight(index);
      if (this._notebookCellAnchor.shouldAnchor(this.view, focus, heightDelta, this.element(index))) {
        this.view.updateElementHeight(index, size, focus);
        this.viewZones.layout();
        this.cellOverlays.layout();
        return;
      }
    }
    this.view.updateElementHeight(index, size, null);
    this.viewZones.layout();
    this.cellOverlays.layout();
    return;
  }
  changeViewZones(callback) {
    if (this.viewZones.changeViewZones(callback)) {
      this.viewZones.layout();
    }
  }
  changeCellOverlays(callback) {
    if (this.cellOverlays.changeCellOverlays(callback)) {
      this.cellOverlays.layout();
    }
  }
  getViewZoneLayoutInfo(viewZoneId) {
    return this.viewZones.getViewZoneLayoutInfo(viewZoneId);
  }
  // override
  domFocus() {
    const focused = this.getFocusedElements()[0];
    const focusedDomElement = focused && this.domElementOfElement(focused);
    if (this.view.domNode.ownerDocument.activeElement && focusedDomElement && focusedDomElement.contains(this.view.domNode.ownerDocument.activeElement)) {
      return;
    }
    if (!isMacintosh && this.view.domNode.ownerDocument.activeElement && !!DOM.findParentWithClass(this.view.domNode.ownerDocument.activeElement, "context-view")) {
      return;
    }
    super.domFocus();
  }
  focusContainer(clearSelection) {
    if (clearSelection) {
      this._viewModel?.updateSelectionsState({
        kind: SelectionStateType.Handle,
        primary: null,
        selections: []
      }, "view");
      this.setFocus([], void 0, true);
      this.setSelection([], void 0, true);
    }
    super.domFocus();
  }
  getViewScrollTop() {
    return this.view.getScrollTop();
  }
  getViewScrollBottom() {
    return this.getViewScrollTop() + this.view.renderHeight;
  }
  setCellEditorSelection(cell, range) {
    const element = cell;
    if (element.editorAttached) {
      element.setSelection(range);
    } else {
      getEditorAttachedPromise(element).then(() => {
        element.setSelection(range);
      });
    }
  }
  style(styles) {
    const selectorSuffix = this.view.domId;
    if (!this.styleElement) {
      this.styleElement = domStylesheetsJs.createStyleSheet(this.view.domNode);
    }
    const suffix = selectorSuffix && `.${selectorSuffix}`;
    const content = [];
    if (styles.listBackground) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows { background: ${styles.listBackground}; }`);
    }
    if (styles.listFocusBackground) {
      content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { background-color: ${styles.listFocusBackground}; }`);
      content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused:hover { background-color: ${styles.listFocusBackground}; }`);
    }
    if (styles.listFocusForeground) {
      content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { color: ${styles.listFocusForeground}; }`);
    }
    if (styles.listActiveSelectionBackground) {
      content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { background-color: ${styles.listActiveSelectionBackground}; }`);
      content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected:hover { background-color: ${styles.listActiveSelectionBackground}; }`);
    }
    if (styles.listActiveSelectionForeground) {
      content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { color: ${styles.listActiveSelectionForeground}; }`);
    }
    if (styles.listFocusAndSelectionBackground) {
      content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected.focused { background-color: ${styles.listFocusAndSelectionBackground}; }
			`);
    }
    if (styles.listFocusAndSelectionForeground) {
      content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected.focused { color: ${styles.listFocusAndSelectionForeground}; }
			`);
    }
    if (styles.listInactiveFocusBackground) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { background-color:  ${styles.listInactiveFocusBackground}; }`);
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused:hover { background-color:  ${styles.listInactiveFocusBackground}; }`);
    }
    if (styles.listInactiveSelectionBackground) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { background-color:  ${styles.listInactiveSelectionBackground}; }`);
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected:hover { background-color:  ${styles.listInactiveSelectionBackground}; }`);
    }
    if (styles.listInactiveSelectionForeground) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { color: ${styles.listInactiveSelectionForeground}; }`);
    }
    if (styles.listHoverBackground) {
      content.push(`.monaco-list${suffix}:not(.drop-target) > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover:not(.selected):not(.focused) { background-color:  ${styles.listHoverBackground}; }`);
    }
    if (styles.listHoverForeground) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover:not(.selected):not(.focused) { color:  ${styles.listHoverForeground}; }`);
    }
    if (styles.listSelectionOutline) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { outline: 1px dotted ${styles.listSelectionOutline}; outline-offset: -1px; }`);
    }
    if (styles.listFocusOutline) {
      content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }
			`);
    }
    if (styles.listInactiveFocusOutline) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { outline: 1px dotted ${styles.listInactiveFocusOutline}; outline-offset: -1px; }`);
    }
    if (styles.listHoverOutline) {
      content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover { outline: 1px dashed ${styles.listHoverOutline}; outline-offset: -1px; }`);
    }
    if (styles.listDropOverBackground) {
      content.push(`
				.monaco-list${suffix}.drop-target,
				.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows.drop-target,
				.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-row.drop-target { background-color: ${styles.listDropOverBackground} !important; color: inherit !important; }
			`);
    }
    const newStyles = content.join("\n");
    if (newStyles !== this.styleElement.textContent) {
      this.styleElement.textContent = newStyles;
    }
  }
  getRenderHeight() {
    return this.view.renderHeight;
  }
  getScrollHeight() {
    return this.view.scrollHeight;
  }
  layout(height, width) {
    this._isInLayout = true;
    super.layout(height, width);
    if (this.renderHeight === 0) {
      this.view.domNode.style.visibility = "hidden";
    } else {
      this.view.domNode.style.visibility = "initial";
    }
    this._isInLayout = false;
  }
  dispose() {
    this._isDisposed = true;
    this._viewModelStore.dispose();
    this._localDisposableStore.dispose();
    this._notebookCellAnchor.dispose();
    this.viewZones.dispose();
    this.cellOverlays.dispose();
    super.dispose();
    this._previousFocusedElements = [];
    this._viewModel = null;
    this._hiddenRangeIds = [];
    this.hiddenRangesPrefixSum = null;
    this._visibleRanges = [];
  }
};
NotebookCellList = __decorateClass([
  __decorateParam(7, IListService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, INotebookExecutionStateService)
], NotebookCellList);
class ListViewInfoAccessor extends Disposable {
  constructor(list) {
    super();
    this.list = list;
  }
  getViewIndex(cell) {
    return this.list.getViewIndex(cell) ?? -1;
  }
  getViewHeight(cell) {
    if (!this.list.viewModel) {
      return -1;
    }
    return this.list.elementHeight(cell);
  }
  getCellRangeFromViewRange(startIndex, endIndex) {
    if (!this.list.viewModel) {
      return void 0;
    }
    const modelIndex = this.list.getModelIndex2(startIndex);
    if (modelIndex === void 0) {
      throw new Error(`startIndex ${startIndex} out of boundary`);
    }
    if (endIndex >= this.list.length) {
      const endModelIndex = this.list.viewModel.length;
      return { start: modelIndex, end: endModelIndex };
    } else {
      const endModelIndex = this.list.getModelIndex2(endIndex);
      if (endModelIndex === void 0) {
        throw new Error(`endIndex ${endIndex} out of boundary`);
      }
      return { start: modelIndex, end: endModelIndex };
    }
  }
  getCellsFromViewRange(startIndex, endIndex) {
    if (!this.list.viewModel) {
      return [];
    }
    const range = this.getCellRangeFromViewRange(startIndex, endIndex);
    if (!range) {
      return [];
    }
    return this.list.viewModel.getCellsInRange(range);
  }
  getCellsInRange(range) {
    return this.list.viewModel?.getCellsInRange(range) ?? [];
  }
  getVisibleRangesPlusViewportAboveAndBelow() {
    return this.list?.getVisibleRangesPlusViewportAboveAndBelow() ?? [];
  }
}
function getEditorAttachedPromise(element) {
  return new Promise((resolve, reject) => {
    Event.once(element.onDidChangeEditorAttachState)(() => element.editorAttached ? resolve() : reject());
  });
}
export {
  ListViewInfoAccessor,
  NOTEBOOK_WEBVIEW_BOUNDARY,
  NotebookCellList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3XFxub3RlYm9va0NlbGxMaXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHNKcyBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgSU1vdXNlV2hlZWxFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IElMaXN0UmVuZGVyZXIsIElMaXN0VmlydHVhbERlbGVnYXRlLCBMaXN0RXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElMaXN0U3R5bGVzLCBJU3R5bGVDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU2Nyb2xsRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgUHJlZml4U3VtQ29tcHV0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3ByZWZpeFN1bUNvbXB1dGVyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIElXb3JrYmVuY2hMaXN0T3B0aW9ucywgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDdXJzb3JBdEJvdW5kYXJ5LCBJQ2VsbFZpZXdNb2RlbCwgQ2VsbEVkaXRTdGF0ZSwgSUNlbGxPdXRwdXRWaWV3TW9kZWwsIENlbGxSZXZlYWxUeXBlLCBDZWxsUmV2ZWFsUmFuZ2VUeXBlLCBDdXJzb3JBdExpbmVCb3VuZGFyeSwgSU5vdGVib29rVmlld1pvbmVDaGFuZ2VBY2Nlc3NvciwgSU5vdGVib29rQ2VsbE92ZXJsYXlDaGFuZ2VBY2Nlc3NvciB9IGZyb20gJy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDZWxsVmlld01vZGVsLCBOb3RlYm9va1ZpZXdNb2RlbCB9IGZyb20gJy4uL3ZpZXdNb2RlbC9ub3RlYm9va1ZpZXdNb2RlbEltcGwuanMnO1xuaW1wb3J0IHsgZGlmZiwgTk9URUJPT0tfRURJVE9SX0NVUlNPUl9CT1VOREFSWSwgQ2VsbEtpbmQsIFNlbGVjdGlvblN0YXRlVHlwZSwgTk9URUJPT0tfRURJVE9SX0NVUlNPUl9MSU5FX0JPVU5EQVJZIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElDZWxsUmFuZ2UsIGNlbGxSYW5nZXNUb0luZGV4ZXMsIHJlZHVjZUNlbGxSYW5nZXMsIGNlbGxSYW5nZXNFcXVhbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va1JhbmdlLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VEIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IElTcGxpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXF1ZW5jZS5qcyc7XG5pbXBvcnQgeyBCYXNlQ2VsbFJlbmRlclRlbXBsYXRlLCBJTm90ZWJvb2tDZWxsTGlzdCB9IGZyb20gJy4vbm90ZWJvb2tSZW5kZXJpbmdDb21tb24uanMnO1xuaW1wb3J0IHsgRmFzdERvbU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZmFzdERvbU5vZGUuanMnO1xuaW1wb3J0IHsgTWFya3VwQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4uL3ZpZXdNb2RlbC9tYXJrdXBDZWxsVmlld01vZGVsLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxpc3RWaWV3T3B0aW9ucywgSUxpc3RWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFZpZXcuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDZWxsTGlzdFZpZXcgfSBmcm9tICcuL25vdGVib29rQ2VsbExpc3RWaWV3LmpzJztcbmltcG9ydCB7IE5vdGVib29rT3B0aW9ucyB9IGZyb20gJy4uL25vdGVib29rT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDZWxsQW5jaG9yIH0gZnJvbSAnLi9ub3RlYm9va0NlbGxBbmNob3IuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tWaWV3Wm9uZXMgfSBmcm9tICcuLi92aWV3UGFydHMvbm90ZWJvb2tWaWV3Wm9uZXMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDZWxsT3ZlcmxheXMgfSBmcm9tICcuLi92aWV3UGFydHMvbm90ZWJvb2tDZWxsT3ZlcmxheXMuanMnO1xuXG5jb25zdCBlbnVtIENlbGxSZXZlYWxQb3NpdGlvbiB7XG5cdFRvcCxcblx0Q2VudGVyLFxuXHRCb3R0b20sXG5cdE5lYXJUb3Bcbn1cblxuZnVuY3Rpb24gZ2V0VmlzaWJsZUNlbGxzKGNlbGxzOiBDZWxsVmlld01vZGVsW10sIGhpZGRlblJhbmdlczogSUNlbGxSYW5nZVtdKSB7XG5cdGlmICghaGlkZGVuUmFuZ2VzLmxlbmd0aCkge1xuXHRcdHJldHVybiBjZWxscztcblx0fVxuXG5cdGxldCBzdGFydCA9IDA7XG5cdGxldCBoaWRkZW5SYW5nZUluZGV4ID0gMDtcblx0Y29uc3QgcmVzdWx0OiBDZWxsVmlld01vZGVsW10gPSBbXTtcblxuXHR3aGlsZSAoc3RhcnQgPCBjZWxscy5sZW5ndGggJiYgaGlkZGVuUmFuZ2VJbmRleCA8IGhpZGRlblJhbmdlcy5sZW5ndGgpIHtcblx0XHRpZiAoc3RhcnQgPCBoaWRkZW5SYW5nZXNbaGlkZGVuUmFuZ2VJbmRleF0uc3RhcnQpIHtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLmNlbGxzLnNsaWNlKHN0YXJ0LCBoaWRkZW5SYW5nZXNbaGlkZGVuUmFuZ2VJbmRleF0uc3RhcnQpKTtcblx0XHR9XG5cblx0XHRzdGFydCA9IGhpZGRlblJhbmdlc1toaWRkZW5SYW5nZUluZGV4XS5lbmQgKyAxO1xuXHRcdGhpZGRlblJhbmdlSW5kZXgrKztcblx0fVxuXG5cdGlmIChzdGFydCA8IGNlbGxzLmxlbmd0aCkge1xuXHRcdHJlc3VsdC5wdXNoKC4uLmNlbGxzLnNsaWNlKHN0YXJ0KSk7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgY29uc3QgTk9URUJPT0tfV0VCVklFV19CT1VOREFSWSA9IDUwMDA7XG5cbmZ1bmN0aW9uIHZhbGlkYXRlV2Vidmlld0JvdW5kYXJ5KGVsZW1lbnQ6IEhUTUxFbGVtZW50KSB7XG5cdGNvbnN0IHdlYnZpZXdUb3AgPSAwIC0gKHBhcnNlSW50KGVsZW1lbnQuc3R5bGUudG9wLCAxMCkgfHwgMCk7XG5cdHJldHVybiB3ZWJ2aWV3VG9wID49IDAgJiYgd2Vidmlld1RvcCA8PSBOT1RFQk9PS19XRUJWSUVXX0JPVU5EQVJZICogMjtcbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rQ2VsbExpc3QgZXh0ZW5kcyBXb3JrYmVuY2hMaXN0PENlbGxWaWV3TW9kZWw+IGltcGxlbWVudHMgSURpc3Bvc2FibGUsIElTdHlsZUNvbnRyb2xsZXIsIElOb3RlYm9va0NlbGxMaXN0IHtcblx0ZGVjbGFyZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdmlldzogTm90ZWJvb2tDZWxsTGlzdFZpZXc8Q2VsbFZpZXdNb2RlbD47XG5cdHByaXZhdGUgdmlld1pvbmVzITogTm90ZWJvb2tWaWV3Wm9uZXM7XG5cdHByaXZhdGUgY2VsbE92ZXJsYXlzITogTm90ZWJvb2tDZWxsT3ZlcmxheXM7XG5cdGdldCBvbldpbGxTY3JvbGwoKTogRXZlbnQ8U2Nyb2xsRXZlbnQ+IHsgcmV0dXJuIHRoaXMudmlldy5vbldpbGxTY3JvbGw7IH1cblxuXHRnZXQgcm93c0NvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5jb250YWluZXJEb21Ob2RlO1xuXHR9XG5cblx0Z2V0IHNjcm9sbGFibGVFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LnNjcm9sbGFibGVFbGVtZW50RG9tTm9kZTtcblx0fVxuXHRwcml2YXRlIF9wcmV2aW91c0ZvY3VzZWRFbGVtZW50czogcmVhZG9ubHkgQ2VsbFZpZXdNb2RlbFtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3TW9kZWxTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBzdHlsZUVsZW1lbnQ/OiBIVE1MU3R5bGVFbGVtZW50O1xuXHRwcml2YXRlIF9ub3RlYm9va0NlbGxBbmNob3I6IE5vdGVib29rQ2VsbEFuY2hvcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZU91dHB1dHMgPSB0aGlzLl9sb2NhbERpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSUNlbGxPdXRwdXRWaWV3TW9kZWxbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlT3V0cHV0cyA9IHRoaXMuX29uRGlkUmVtb3ZlT3V0cHV0cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEhpZGVPdXRwdXRzID0gdGhpcy5fbG9jYWxEaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBFbWl0dGVyPHJlYWRvbmx5IElDZWxsT3V0cHV0Vmlld01vZGVsW10+KCkpO1xuXHRyZWFkb25seSBvbkRpZEhpZGVPdXRwdXRzID0gdGhpcy5fb25EaWRIaWRlT3V0cHV0cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZUNlbGxzRnJvbVZpZXcgPSB0aGlzLl9sb2NhbERpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSUNlbGxWaWV3TW9kZWxbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlQ2VsbHNGcm9tVmlldyA9IHRoaXMuX29uRGlkUmVtb3ZlQ2VsbHNGcm9tVmlldy5ldmVudDtcblxuXHRwcml2YXRlIF92aWV3TW9kZWw6IE5vdGVib29rVmlld01vZGVsIHwgbnVsbCA9IG51bGw7XG5cdGdldCB2aWV3TW9kZWwoKTogTm90ZWJvb2tWaWV3TW9kZWwgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlld01vZGVsO1xuXHR9XG5cdHByaXZhdGUgX2hpZGRlblJhbmdlSWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIGhpZGRlblJhbmdlc1ByZWZpeFN1bTogUHJlZml4U3VtQ29tcHV0ZXIgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpc2libGVSYW5nZXMgPSB0aGlzLl9sb2NhbERpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmxlUmFuZ2VzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJsZVJhbmdlcy5ldmVudDtcblx0cHJpdmF0ZSBfdmlzaWJsZVJhbmdlczogSUNlbGxSYW5nZVtdID0gW107XG5cblx0Z2V0IHZpc2libGVSYW5nZXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGVSYW5nZXM7XG5cdH1cblxuXHRzZXQgdmlzaWJsZVJhbmdlcyhyYW5nZXM6IElDZWxsUmFuZ2VbXSkge1xuXHRcdGlmIChjZWxsUmFuZ2VzRXF1YWwodGhpcy5fdmlzaWJsZVJhbmdlcywgcmFuZ2VzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Zpc2libGVSYW5nZXMgPSByYW5nZXM7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmxlUmFuZ2VzLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzRGlzcG9zZWQgPSBmYWxzZTtcblxuXHRnZXQgaXNEaXNwb3NlZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5faXNEaXNwb3NlZDtcblx0fVxuXG5cdHByaXZhdGUgX2lzSW5MYXlvdXQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIF93ZWJ2aWV3RWxlbWVudDogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+IHwgbnVsbCA9IG51bGw7XG5cblx0Z2V0IHdlYnZpZXdFbGVtZW50KCkge1xuXHRcdHJldHVybiB0aGlzLl93ZWJ2aWV3RWxlbWVudDtcblx0fVxuXG5cdGdldCBpblJlbmRlcmluZ1RyYW5zYWN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuaW5SZW5kZXJpbmdUcmFuc2FjdGlvbjtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgbGlzdFVzZXI6IHN0cmluZyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tPcHRpb25zOiBOb3RlYm9va09wdGlvbnMsXG5cdFx0ZGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPENlbGxWaWV3TW9kZWw+LFxuXHRcdHJlbmRlcmVyczogSUxpc3RSZW5kZXJlcjxDZWxsVmlld01vZGVsLCBCYXNlQ2VsbFJlbmRlclRlbXBsYXRlPltdLFxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0b3B0aW9uczogSVdvcmtiZW5jaExpc3RPcHRpb25zPENlbGxWaWV3TW9kZWw+LFxuXHRcdEBJTGlzdFNlcnZpY2UgbGlzdFNlcnZpY2U6IElMaXN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2Ugbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobGlzdFVzZXIsIGNvbnRhaW5lciwgZGVsZWdhdGUsIHJlbmRlcmVycywgb3B0aW9ucywgY29udGV4dEtleVNlcnZpY2UsIGxpc3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VELmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5fcHJldmlvdXNGb2N1c2VkRWxlbWVudHMgPSB0aGlzLmdldEZvY3VzZWRFbGVtZW50cygpO1xuXHRcdHRoaXMuX2xvY2FsRGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLm9uRGlkQ2hhbmdlRm9jdXMoKGUpID0+IHtcblx0XHRcdHRoaXMuX3ByZXZpb3VzRm9jdXNlZEVsZW1lbnRzLmZvckVhY2goZWxlbWVudCA9PiB7XG5cdFx0XHRcdGlmIChlLmVsZW1lbnRzLmluZGV4T2YoZWxlbWVudCkgPCAwKSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5vbkRlc2VsZWN0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcHJldmlvdXNGb2N1c2VkRWxlbWVudHMgPSBlLmVsZW1lbnRzO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG5vdGVib29rRWRpdG9yQ3Vyc29yQXRCb3VuZGFyeUNvbnRleHQgPSBOT1RFQk9PS19FRElUT1JfQ1VSU09SX0JPVU5EQVJZLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0bm90ZWJvb2tFZGl0b3JDdXJzb3JBdEJvdW5kYXJ5Q29udGV4dC5zZXQoJ25vbmUnKTtcblxuXHRcdGNvbnN0IG5vdGVib29rRWRpdG9yQ3Vyc29yQXRMaW5lQm91bmRhcnlDb250ZXh0ID0gTk9URUJPT0tfRURJVE9SX0NVUlNPUl9MSU5FX0JPVU5EQVJZLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0bm90ZWJvb2tFZGl0b3JDdXJzb3JBdExpbmVCb3VuZGFyeUNvbnRleHQuc2V0KCdub25lJyk7XG5cblx0XHRjb25zdCBjdXJzb3JTZWxlY3Rpb25MaXN0ZW5lciA9IHRoaXMuX2xvY2FsRGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0Y29uc3QgdGV4dEVkaXRvckF0dGFjaExpc3RlbmVyID0gdGhpcy5fbG9jYWxEaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRcdHRoaXMuX25vdGVib29rQ2VsbEFuY2hvciA9IG5ldyBOb3RlYm9va0NlbGxBbmNob3Iobm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLm9uRGlkU2Nyb2xsKTtcblxuXHRcdGNvbnN0IHJlY29tcHV0ZUNvbnRleHQgPSAoZWxlbWVudDogQ2VsbFZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0c3dpdGNoIChlbGVtZW50LmN1cnNvckF0Qm91bmRhcnkoKSkge1xuXHRcdFx0XHRjYXNlIEN1cnNvckF0Qm91bmRhcnkuQm90aDpcblx0XHRcdFx0XHRub3RlYm9va0VkaXRvckN1cnNvckF0Qm91bmRhcnlDb250ZXh0LnNldCgnYm90aCcpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEN1cnNvckF0Qm91bmRhcnkuVG9wOlxuXHRcdFx0XHRcdG5vdGVib29rRWRpdG9yQ3Vyc29yQXRCb3VuZGFyeUNvbnRleHQuc2V0KCd0b3AnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDdXJzb3JBdEJvdW5kYXJ5LkJvdHRvbTpcblx0XHRcdFx0XHRub3RlYm9va0VkaXRvckN1cnNvckF0Qm91bmRhcnlDb250ZXh0LnNldCgnYm90dG9tJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0bm90ZWJvb2tFZGl0b3JDdXJzb3JBdEJvdW5kYXJ5Q29udGV4dC5zZXQoJ25vbmUnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0c3dpdGNoIChlbGVtZW50LmN1cnNvckF0TGluZUJvdW5kYXJ5KCkpIHtcblx0XHRcdFx0Y2FzZSBDdXJzb3JBdExpbmVCb3VuZGFyeS5Cb3RoOlxuXHRcdFx0XHRcdG5vdGVib29rRWRpdG9yQ3Vyc29yQXRMaW5lQm91bmRhcnlDb250ZXh0LnNldCgnYm90aCcpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEN1cnNvckF0TGluZUJvdW5kYXJ5LlN0YXJ0OlxuXHRcdFx0XHRcdG5vdGVib29rRWRpdG9yQ3Vyc29yQXRMaW5lQm91bmRhcnlDb250ZXh0LnNldCgnc3RhcnQnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDdXJzb3JBdExpbmVCb3VuZGFyeS5FbmQ6XG5cdFx0XHRcdFx0bm90ZWJvb2tFZGl0b3JDdXJzb3JBdExpbmVCb3VuZGFyeUNvbnRleHQuc2V0KCdlbmQnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRub3RlYm9va0VkaXRvckN1cnNvckF0TGluZUJvdW5kYXJ5Q29udGV4dC5zZXQoJ25vbmUnKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuO1xuXHRcdH07XG5cblx0XHQvLyBDdXJzb3IgQm91bmRhcnkgY29udGV4dFxuXHRcdHRoaXMuX2xvY2FsRGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLm9uRGlkQ2hhbmdlRm9jdXMoKGUpID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHQvLyB3ZSBvbmx5IHZhbGlkYXRlIHRoZSBmaXJzdCBmb2N1c2VkIGVsZW1lbnRcblx0XHRcdFx0Y29uc3QgZm9jdXNlZEVsZW1lbnQgPSBlLmVsZW1lbnRzWzBdO1xuXG5cdFx0XHRcdGN1cnNvclNlbGVjdGlvbkxpc3RlbmVyLnZhbHVlID0gZm9jdXNlZEVsZW1lbnQub25EaWRDaGFuZ2VTdGF0ZSgoZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChlLnNlbGVjdGlvbkNoYW5nZWQpIHtcblx0XHRcdFx0XHRcdHJlY29tcHV0ZUNvbnRleHQoZm9jdXNlZEVsZW1lbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGV4dEVkaXRvckF0dGFjaExpc3RlbmVyLnZhbHVlID0gZm9jdXNlZEVsZW1lbnQub25EaWRDaGFuZ2VFZGl0b3JBdHRhY2hTdGF0ZSgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGZvY3VzZWRFbGVtZW50LmVkaXRvckF0dGFjaGVkKSB7XG5cdFx0XHRcdFx0XHRyZWNvbXB1dGVDb250ZXh0KGZvY3VzZWRFbGVtZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJlY29tcHV0ZUNvbnRleHQoZm9jdXNlZEVsZW1lbnQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIHJlc2V0IGNvbnRleHRcblx0XHRcdG5vdGVib29rRWRpdG9yQ3Vyc29yQXRCb3VuZGFyeUNvbnRleHQuc2V0KCdub25lJyk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gdXBkYXRlIHZpc2libGVSYW5nZXNcblx0XHRjb25zdCB1cGRhdGVWaXNpYmxlUmFuZ2VzID0gKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnZpZXcubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdG9wID0gdGhpcy5nZXRWaWV3U2Nyb2xsVG9wKCk7XG5cdFx0XHRjb25zdCBib3R0b20gPSB0aGlzLmdldFZpZXdTY3JvbGxCb3R0b20oKTtcblx0XHRcdGlmICh0b3AgPj0gYm90dG9tKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdG9wVmlld0luZGV4ID0gY2xhbXAodGhpcy52aWV3LmluZGV4QXQodG9wKSwgMCwgdGhpcy52aWV3Lmxlbmd0aCAtIDEpO1xuXHRcdFx0Y29uc3QgdG9wRWxlbWVudCA9IHRoaXMudmlldy5lbGVtZW50KHRvcFZpZXdJbmRleCk7XG5cdFx0XHRjb25zdCB0b3BNb2RlbEluZGV4ID0gdGhpcy5fdmlld01vZGVsIS5nZXRDZWxsSW5kZXgodG9wRWxlbWVudCk7XG5cdFx0XHRjb25zdCBib3R0b21WaWV3SW5kZXggPSBjbGFtcCh0aGlzLnZpZXcuaW5kZXhBdChib3R0b20pLCAwLCB0aGlzLnZpZXcubGVuZ3RoIC0gMSk7XG5cdFx0XHRjb25zdCBib3R0b21FbGVtZW50ID0gdGhpcy52aWV3LmVsZW1lbnQoYm90dG9tVmlld0luZGV4KTtcblx0XHRcdGNvbnN0IGJvdHRvbU1vZGVsSW5kZXggPSB0aGlzLl92aWV3TW9kZWwhLmdldENlbGxJbmRleChib3R0b21FbGVtZW50KTtcblxuXHRcdFx0aWYgKGJvdHRvbU1vZGVsSW5kZXggLSB0b3BNb2RlbEluZGV4ID09PSBib3R0b21WaWV3SW5kZXggLSB0b3BWaWV3SW5kZXgpIHtcblx0XHRcdFx0dGhpcy52aXNpYmxlUmFuZ2VzID0gW3sgc3RhcnQ6IHRvcE1vZGVsSW5kZXgsIGVuZDogYm90dG9tTW9kZWxJbmRleCArIDEgfV07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnZpc2libGVSYW5nZXMgPSB0aGlzLl9nZXRWaXNpYmxlUmFuZ2VzRnJvbUluZGV4KHRvcFZpZXdJbmRleCwgdG9wTW9kZWxJbmRleCwgYm90dG9tVmlld0luZGV4LCBib3R0b21Nb2RlbEluZGV4KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fbG9jYWxEaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMudmlldy5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzSW5MYXlvdXQpIHtcblx0XHRcdFx0RE9NLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoRE9NLmdldFdpbmRvdyhjb250YWluZXIpLCAoKSA9PiB7XG5cdFx0XHRcdFx0dXBkYXRlVmlzaWJsZVJhbmdlcygpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHVwZGF0ZVZpc2libGVSYW5nZXMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fbG9jYWxEaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMudmlldy5vbkRpZFNjcm9sbCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNJbkxheW91dCkge1xuXHRcdFx0XHRET00uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShET00uZ2V0V2luZG93KGNvbnRhaW5lciksICgpID0+IHtcblx0XHRcdFx0XHR1cGRhdGVWaXNpYmxlUmFuZ2VzKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0dXBkYXRlVmlzaWJsZVJhbmdlcygpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVMaXN0Vmlldyhjb250YWluZXI6IEhUTUxFbGVtZW50LCB2aXJ0dWFsRGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPENlbGxWaWV3TW9kZWw+LCByZW5kZXJlcnM6IElMaXN0UmVuZGVyZXI8YW55LCBhbnk+W10sIHZpZXdPcHRpb25zOiBJTGlzdFZpZXdPcHRpb25zPENlbGxWaWV3TW9kZWw+KTogSUxpc3RWaWV3PENlbGxWaWV3TW9kZWw+IHtcblx0XHRjb25zdCBsaXN0VmlldyA9IG5ldyBOb3RlYm9va0NlbGxMaXN0Vmlldyhjb250YWluZXIsIHZpcnR1YWxEZWxlZ2F0ZSwgcmVuZGVyZXJzLCB2aWV3T3B0aW9ucyk7XG5cdFx0dGhpcy52aWV3Wm9uZXMgPSBuZXcgTm90ZWJvb2tWaWV3Wm9uZXMobGlzdFZpZXcsIHRoaXMpO1xuXHRcdHRoaXMuY2VsbE92ZXJsYXlzID0gbmV3IE5vdGVib29rQ2VsbE92ZXJsYXlzKGxpc3RWaWV3KTtcblx0XHRyZXR1cm4gbGlzdFZpZXc7XG5cdH1cblxuXHQvKipcblx0ICogVGVzdCBPbmx5XG5cdCAqL1xuXHRfZ2V0VmlldygpIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3O1xuXHR9XG5cblx0YXR0YWNoV2VidmlldyhlbGVtZW50OiBIVE1MRWxlbWVudCkge1xuXHRcdGVsZW1lbnQuc3R5bGUudG9wID0gYC0ke05PVEVCT09LX1dFQlZJRVdfQk9VTkRBUll9cHhgO1xuXHRcdHRoaXMucm93c0NvbnRhaW5lci5pbnNlcnRBZGphY2VudEVsZW1lbnQoJ2FmdGVyYmVnaW4nLCBlbGVtZW50KTtcblx0XHR0aGlzLl93ZWJ2aWV3RWxlbWVudCA9IG5ldyBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4oZWxlbWVudCk7XG5cdH1cblxuXHRlbGVtZW50QXQocG9zaXRpb246IG51bWJlcik6IElDZWxsVmlld01vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMudmlldy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWR4ID0gdGhpcy52aWV3LmluZGV4QXQocG9zaXRpb24pO1xuXHRcdGNvbnN0IGNsYW1wZWQgPSBjbGFtcChpZHgsIDAsIHRoaXMudmlldy5sZW5ndGggLSAxKTtcblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50KGNsYW1wZWQpO1xuXHR9XG5cblx0ZWxlbWVudEhlaWdodChlbGVtZW50OiBJQ2VsbFZpZXdNb2RlbCk6IG51bWJlciB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9nZXRWaWV3SW5kZXhVcHBlckJvdW5kKGVsZW1lbnQpO1xuXHRcdGlmIChpbmRleCA9PT0gdW5kZWZpbmVkIHx8IGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fZ2V0Vmlld0luZGV4VXBwZXJCb3VuZChlbGVtZW50KTtcblx0XHRcdHRocm93IG5ldyBMaXN0RXJyb3IodGhpcy5saXN0VXNlciwgYEludmFsaWQgaW5kZXggJHtpbmRleH1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy52aWV3LmVsZW1lbnRIZWlnaHQoaW5kZXgpO1xuXHR9XG5cblx0ZGV0YWNoVmlld01vZGVsKCkge1xuXHRcdHRoaXMuX3ZpZXdNb2RlbFN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy5fdmlld01vZGVsID0gbnVsbDtcblx0XHR0aGlzLmhpZGRlblJhbmdlc1ByZWZpeFN1bSA9IG51bGw7XG5cdH1cblxuXHRhdHRhY2hWaWV3TW9kZWwobW9kZWw6IE5vdGVib29rVmlld01vZGVsKSB7XG5cdFx0dGhpcy5fdmlld01vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fdmlld01vZGVsU3RvcmUuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlVmlld0NlbGxzKChlKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIHVwZGF0ZSB3aGl0ZXNwYWNlcyB3aGljaCBhcmUgYW5jaG9yZWQgdG8gdGhlIG1vZGVsIGluZGV4ZXNcblx0XHRcdHRoaXMudmlld1pvbmVzLm9uQ2VsbHNDaGFuZ2VkKGUpO1xuXHRcdFx0dGhpcy5jZWxsT3ZlcmxheXMub25DZWxsc0NoYW5nZWQoZSk7XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRSYW5nZXMgPSB0aGlzLl9oaWRkZW5SYW5nZUlkcy5tYXAoaWQgPT4gdGhpcy5fdmlld01vZGVsIS5nZXRUcmFja2VkUmFuZ2UoaWQpKS5maWx0ZXIocmFuZ2UgPT4gcmFuZ2UgIT09IG51bGwpIGFzIElDZWxsUmFuZ2VbXTtcblx0XHRcdGNvbnN0IG5ld1Zpc2libGVWaWV3Q2VsbHM6IENlbGxWaWV3TW9kZWxbXSA9IGdldFZpc2libGVDZWxscyh0aGlzLl92aWV3TW9kZWwhLnZpZXdDZWxscyBhcyBDZWxsVmlld01vZGVsW10sIGN1cnJlbnRSYW5nZXMpO1xuXG5cdFx0XHRjb25zdCBvbGRWaXNpYmxlVmlld0NlbGxzOiBDZWxsVmlld01vZGVsW10gPSBbXTtcblx0XHRcdGNvbnN0IG9sZFZpZXdDZWxsTWFwcGluZyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdG9sZFZpc2libGVWaWV3Q2VsbHMucHVzaCh0aGlzLmVsZW1lbnQoaSkpO1xuXHRcdFx0XHRvbGRWaWV3Q2VsbE1hcHBpbmcuYWRkKHRoaXMuZWxlbWVudChpKS51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZpZXdEaWZmcyA9IGRpZmY8Q2VsbFZpZXdNb2RlbD4ob2xkVmlzaWJsZVZpZXdDZWxscywgbmV3VmlzaWJsZVZpZXdDZWxscywgYSA9PiB7XG5cdFx0XHRcdHJldHVybiBvbGRWaWV3Q2VsbE1hcHBpbmcuaGFzKGEudXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChlLnN5bmNocm9ub3VzKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUVsZW1lbnRzSW5XZWJ2aWV3KHZpZXdEaWZmcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl92aWV3TW9kZWxTdG9yZS5hZGQoRE9NLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoRE9NLmdldFdpbmRvdyh0aGlzLnJvd3NDb250YWluZXIpLCAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl91cGRhdGVFbGVtZW50c0luV2Vidmlldyh2aWV3RGlmZnMpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdmlld01vZGVsU3RvcmUuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZSA9PT0gJ3ZpZXcnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gY29udmVydCBtb2RlbCBzZWxlY3Rpb25zIHRvIHZpZXcgc2VsZWN0aW9uc1xuXHRcdFx0Y29uc3Qgdmlld1NlbGVjdGlvbnMgPSBjZWxsUmFuZ2VzVG9JbmRleGVzKG1vZGVsLmdldFNlbGVjdGlvbnMoKSkubWFwKGluZGV4ID0+IG1vZGVsLmNlbGxBdChpbmRleCkpLmZpbHRlcihjZWxsID0+ICEhY2VsbCkubWFwKGNlbGwgPT4gdGhpcy5fZ2V0Vmlld0luZGV4VXBwZXJCb3VuZChjZWxsISkpO1xuXHRcdFx0dGhpcy5zZXRTZWxlY3Rpb24odmlld1NlbGVjdGlvbnMsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRjb25zdCBwcmltYXJ5ID0gY2VsbFJhbmdlc1RvSW5kZXhlcyhbbW9kZWwuZ2V0Rm9jdXMoKV0pLm1hcChpbmRleCA9PiBtb2RlbC5jZWxsQXQoaW5kZXgpKS5maWx0ZXIoY2VsbCA9PiAhIWNlbGwpLm1hcChjZWxsID0+IHRoaXMuX2dldFZpZXdJbmRleFVwcGVyQm91bmQoY2VsbCEpKTtcblxuXHRcdFx0aWYgKHByaW1hcnkubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuc2V0Rm9jdXMocHJpbWFyeSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBoaWRkZW5SYW5nZXMgPSBtb2RlbC5nZXRIaWRkZW5SYW5nZXMoKTtcblx0XHR0aGlzLnNldEhpZGRlbkFyZWFzKGhpZGRlblJhbmdlcywgZmFsc2UpO1xuXHRcdGNvbnN0IG5ld1JhbmdlcyA9IHJlZHVjZUNlbGxSYW5nZXMoaGlkZGVuUmFuZ2VzKTtcblx0XHRjb25zdCB2aWV3Q2VsbHMgPSBtb2RlbC52aWV3Q2VsbHMuc2xpY2UoMCkgYXMgQ2VsbFZpZXdNb2RlbFtdO1xuXHRcdG5ld1Jhbmdlcy5yZXZlcnNlKCkuZm9yRWFjaChyYW5nZSA9PiB7XG5cdFx0XHRjb25zdCByZW1vdmVkQ2VsbHMgPSB2aWV3Q2VsbHMuc3BsaWNlKHJhbmdlLnN0YXJ0LCByYW5nZS5lbmQgLSByYW5nZS5zdGFydCArIDEpO1xuXHRcdFx0dGhpcy5fb25EaWRSZW1vdmVDZWxsc0Zyb21WaWV3LmZpcmUocmVtb3ZlZENlbGxzKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuc3BsaWNlMigwLCAwLCB2aWV3Q2VsbHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRWxlbWVudHNJbldlYnZpZXcodmlld0RpZmZzOiBJU3BsaWNlPENlbGxWaWV3TW9kZWw+W10pIHtcblx0XHR2aWV3RGlmZnMucmV2ZXJzZSgpLmZvckVhY2goKGRpZmYpID0+IHtcblx0XHRcdGNvbnN0IGhpZGRlbk91dHB1dHM6IElDZWxsT3V0cHV0Vmlld01vZGVsW10gPSBbXTtcblx0XHRcdGNvbnN0IGRlbGV0ZWRPdXRwdXRzOiBJQ2VsbE91dHB1dFZpZXdNb2RlbFtdID0gW107XG5cdFx0XHRjb25zdCByZW1vdmVkTWFya2Rvd25DZWxsczogSUNlbGxWaWV3TW9kZWxbXSA9IFtdO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gZGlmZi5zdGFydDsgaSA8IGRpZmYuc3RhcnQgKyBkaWZmLmRlbGV0ZUNvdW50OyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMuZWxlbWVudChpKTtcblx0XHRcdFx0aWYgKGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5fdmlld01vZGVsIS5oYXNDZWxsKGNlbGwpKSB7XG5cdFx0XHRcdFx0XHRoaWRkZW5PdXRwdXRzLnB1c2goLi4uY2VsbD8ub3V0cHV0c1ZpZXdNb2RlbHMpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRkZWxldGVkT3V0cHV0cy5wdXNoKC4uLmNlbGw/Lm91dHB1dHNWaWV3TW9kZWxzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVtb3ZlZE1hcmtkb3duQ2VsbHMucHVzaChjZWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNwbGljZTIoZGlmZi5zdGFydCwgZGlmZi5kZWxldGVDb3VudCwgZGlmZi50b0luc2VydCk7XG5cblx0XHRcdHRoaXMuX29uRGlkSGlkZU91dHB1dHMuZmlyZShoaWRkZW5PdXRwdXRzKTtcblx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlT3V0cHV0cy5maXJlKGRlbGV0ZWRPdXRwdXRzKTtcblx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlQ2VsbHNGcm9tVmlldy5maXJlKHJlbW92ZWRNYXJrZG93bkNlbGxzKTtcblx0XHR9KTtcblx0fVxuXG5cdGNsZWFyKCkge1xuXHRcdHN1cGVyLnNwbGljZSgwLCB0aGlzLmxlbmd0aCk7XG5cdH1cblxuXHRzZXRIaWRkZW5BcmVhcyhfcmFuZ2VzOiBJQ2VsbFJhbmdlW10sIHRyaWdnZXJWaWV3VXBkYXRlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl92aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBuZXdSYW5nZXMgPSByZWR1Y2VDZWxsUmFuZ2VzKF9yYW5nZXMpO1xuXHRcdC8vIGRlbGV0ZSBvbGQgdHJhY2tpbmcgcmFuZ2VzXG5cdFx0Y29uc3Qgb2xkUmFuZ2VzID0gdGhpcy5faGlkZGVuUmFuZ2VJZHMubWFwKGlkID0+IHRoaXMuX3ZpZXdNb2RlbCEuZ2V0VHJhY2tlZFJhbmdlKGlkKSkuZmlsdGVyKHJhbmdlID0+IHJhbmdlICE9PSBudWxsKSBhcyBJQ2VsbFJhbmdlW107XG5cdFx0aWYgKG5ld1Jhbmdlcy5sZW5ndGggPT09IG9sZFJhbmdlcy5sZW5ndGgpIHtcblx0XHRcdGxldCBoYXNEaWZmZXJlbmNlID0gZmFsc2U7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG5ld1Jhbmdlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAoIShuZXdSYW5nZXNbaV0uc3RhcnQgPT09IG9sZFJhbmdlc1tpXS5zdGFydCAmJiBuZXdSYW5nZXNbaV0uZW5kID09PSBvbGRSYW5nZXNbaV0uZW5kKSkge1xuXHRcdFx0XHRcdGhhc0RpZmZlcmVuY2UgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaGFzRGlmZmVyZW5jZSkge1xuXHRcdFx0XHQvLyB0aGV5IGNhbGwgJ3NldEhpZGRlbkFyZWFzJyBmb3IgYSByZWFzb24sIGV2ZW4gaWYgdGhlIHJhbmdlcyBhcmUgc3RpbGwgdGhlIHNhbWUsIGl0J3MgcG9zc2libGUgdGhhdCB0aGUgaGlkZGVuUmFuZ2VTdW0gaXMgbm90IHVwZGF0ZSB0byBkYXRlXG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUhpZGRlblJhbmdlUHJlZml4U3VtKG5ld1Jhbmdlcyk7XG5cdFx0XHRcdHRoaXMudmlld1pvbmVzLm9uSGlkZGVuUmFuZ2VzQ2hhbmdlKCk7XG5cdFx0XHRcdHRoaXMudmlld1pvbmVzLmxheW91dCgpO1xuXHRcdFx0XHR0aGlzLmNlbGxPdmVybGF5cy5vbkhpZGRlblJhbmdlc0NoYW5nZSgpO1xuXHRcdFx0XHR0aGlzLmNlbGxPdmVybGF5cy5sYXlvdXQoKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2hpZGRlblJhbmdlSWRzLmZvckVhY2goaWQgPT4gdGhpcy5fdmlld01vZGVsIS5zZXRUcmFja2VkUmFuZ2UoaWQsIG51bGwsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyKSk7XG5cdFx0Y29uc3QgaGlkZGVuQXJlYUlkcyA9IG5ld1Jhbmdlcy5tYXAocmFuZ2UgPT4gdGhpcy5fdmlld01vZGVsIS5zZXRUcmFja2VkUmFuZ2UobnVsbCwgcmFuZ2UsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyKSkuZmlsdGVyKGlkID0+IGlkICE9PSBudWxsKSBhcyBzdHJpbmdbXTtcblxuXHRcdHRoaXMuX2hpZGRlblJhbmdlSWRzID0gaGlkZGVuQXJlYUlkcztcblxuXHRcdC8vIHNldCBoaWRkZW4gcmFuZ2VzIHByZWZpeCBzdW1cblx0XHR0aGlzLl91cGRhdGVIaWRkZW5SYW5nZVByZWZpeFN1bShuZXdSYW5nZXMpO1xuXHRcdC8vIFVwZGF0ZSB2aWV3IHpvbmUgcG9zaXRpb25zIGFmdGVyIGhpZGRlbiByYW5nZXMgY2hhbmdlXG5cdFx0dGhpcy52aWV3Wm9uZXMub25IaWRkZW5SYW5nZXNDaGFuZ2UoKTtcblx0XHR0aGlzLmNlbGxPdmVybGF5cy5vbkhpZGRlblJhbmdlc0NoYW5nZSgpO1xuXG5cdFx0aWYgKHRyaWdnZXJWaWV3VXBkYXRlKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUhpZGRlbkFyZWFzSW5WaWV3KG9sZFJhbmdlcywgbmV3UmFuZ2VzKTtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdab25lcy5sYXlvdXQoKTtcblx0XHR0aGlzLmNlbGxPdmVybGF5cy5sYXlvdXQoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUhpZGRlblJhbmdlUHJlZml4U3VtKG5ld1JhbmdlczogSUNlbGxSYW5nZVtdKSB7XG5cdFx0bGV0IHN0YXJ0ID0gMDtcblx0XHRsZXQgaW5kZXggPSAwO1xuXHRcdGNvbnN0IHJldDogbnVtYmVyW10gPSBbXTtcblxuXHRcdHdoaWxlIChpbmRleCA8IG5ld1Jhbmdlcy5sZW5ndGgpIHtcblx0XHRcdGZvciAobGV0IGogPSBzdGFydDsgaiA8IG5ld1Jhbmdlc1tpbmRleF0uc3RhcnQgLSAxOyBqKyspIHtcblx0XHRcdFx0cmV0LnB1c2goMSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldC5wdXNoKG5ld1Jhbmdlc1tpbmRleF0uZW5kIC0gbmV3UmFuZ2VzW2luZGV4XS5zdGFydCArIDEgKyAxKTtcblx0XHRcdHN0YXJ0ID0gbmV3UmFuZ2VzW2luZGV4XS5lbmQgKyAxO1xuXHRcdFx0aW5kZXgrKztcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gc3RhcnQ7IGkgPCB0aGlzLl92aWV3TW9kZWwhLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRyZXQucHVzaCgxKTtcblx0XHR9XG5cblx0XHRjb25zdCB2YWx1ZXMgPSBuZXcgVWludDMyQXJyYXkocmV0Lmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZXQubGVuZ3RoOyBpKyspIHtcblx0XHRcdHZhbHVlc1tpXSA9IHJldFtpXTtcblx0XHR9XG5cblx0XHR0aGlzLmhpZGRlblJhbmdlc1ByZWZpeFN1bSA9IG5ldyBQcmVmaXhTdW1Db21wdXRlcih2YWx1ZXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIG9sZFJhbmdlcyBhbmQgbmV3UmFuZ2VzIGFyZSBhbGwgcmVkdWNlZCBhbmQgc29ydGVkLlxuXHQgKi9cblx0dXBkYXRlSGlkZGVuQXJlYXNJblZpZXcob2xkUmFuZ2VzOiBJQ2VsbFJhbmdlW10sIG5ld1JhbmdlczogSUNlbGxSYW5nZVtdKSB7XG5cdFx0Y29uc3Qgb2xkVmlld0NlbGxFbnRyaWVzOiBDZWxsVmlld01vZGVsW10gPSBnZXRWaXNpYmxlQ2VsbHModGhpcy5fdmlld01vZGVsIS52aWV3Q2VsbHMgYXMgQ2VsbFZpZXdNb2RlbFtdLCBvbGRSYW5nZXMpO1xuXHRcdGNvbnN0IG9sZFZpZXdDZWxsTWFwcGluZyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdG9sZFZpZXdDZWxsRW50cmllcy5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0b2xkVmlld0NlbGxNYXBwaW5nLmFkZChjZWxsLnVyaS50b1N0cmluZygpKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG5ld1ZpZXdDZWxsRW50cmllczogQ2VsbFZpZXdNb2RlbFtdID0gZ2V0VmlzaWJsZUNlbGxzKHRoaXMuX3ZpZXdNb2RlbCEudmlld0NlbGxzIGFzIENlbGxWaWV3TW9kZWxbXSwgbmV3UmFuZ2VzKTtcblxuXHRcdGNvbnN0IHZpZXdEaWZmcyA9IGRpZmY8Q2VsbFZpZXdNb2RlbD4ob2xkVmlld0NlbGxFbnRyaWVzLCBuZXdWaWV3Q2VsbEVudHJpZXMsIGEgPT4ge1xuXHRcdFx0cmV0dXJuIG9sZFZpZXdDZWxsTWFwcGluZy5oYXMoYS51cmkudG9TdHJpbmcoKSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl91cGRhdGVFbGVtZW50c0luV2Vidmlldyh2aWV3RGlmZnMpO1xuXHR9XG5cblx0c3BsaWNlMihzdGFydDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyLCBlbGVtZW50czogcmVhZG9ubHkgQ2VsbFZpZXdNb2RlbFtdID0gW10pOiB2b2lkIHtcblx0XHQvLyB3ZSBuZWVkIHRvIGNvbnZlcnQgc3RhcnQgYW5kIGRlbGV0ZSBjb3VudCBiYXNlZCBvbiBoaWRkZW4gcmFuZ2VzXG5cdFx0aWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+IHRoaXMudmlldy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1c0luc2lkZSA9IERPTS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMucm93c0NvbnRhaW5lcik7XG5cdFx0c3VwZXIuc3BsaWNlKHN0YXJ0LCBkZWxldGVDb3VudCwgZWxlbWVudHMpO1xuXHRcdGlmIChmb2N1c0luc2lkZSkge1xuXHRcdFx0dGhpcy5kb21Gb2N1cygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbnNMZWZ0ID0gW107XG5cdFx0dGhpcy5nZXRTZWxlY3RlZEVsZW1lbnRzKCkuZm9yRWFjaChlbCA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdmlld01vZGVsIS5oYXNDZWxsKGVsKSkge1xuXHRcdFx0XHRzZWxlY3Rpb25zTGVmdC5wdXNoKGVsLmhhbmRsZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoIXNlbGVjdGlvbnNMZWZ0Lmxlbmd0aCAmJiB0aGlzLl92aWV3TW9kZWwhLnZpZXdDZWxscy5sZW5ndGgpIHtcblx0XHRcdC8vIGFmdGVyIHNwbGljZSwgdGhlIHNlbGVjdGVkIGNlbGxzIGFyZSBkZWxldGVkXG5cdFx0XHR0aGlzLl92aWV3TW9kZWwhLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDAsIGVuZDogMSB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMCwgZW5kOiAxIH1dIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMudmlld1pvbmVzLmxheW91dCgpO1xuXHRcdHRoaXMuY2VsbE92ZXJsYXlzLmxheW91dCgpO1xuXHR9XG5cblx0Z2V0TW9kZWxJbmRleChjZWxsOiBDZWxsVmlld01vZGVsKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2aWV3SW5kZXggPSB0aGlzLmluZGV4T2YoY2VsbCk7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TW9kZWxJbmRleDIodmlld0luZGV4KTtcblx0fVxuXG5cdGdldE1vZGVsSW5kZXgyKHZpZXdJbmRleDogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuaGlkZGVuUmFuZ2VzUHJlZml4U3VtKSB7XG5cdFx0XHRyZXR1cm4gdmlld0luZGV4O1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsSW5kZXggPSB0aGlzLmhpZGRlblJhbmdlc1ByZWZpeFN1bS5nZXRQcmVmaXhTdW0odmlld0luZGV4IC0gMSk7XG5cdFx0cmV0dXJuIG1vZGVsSW5kZXg7XG5cdH1cblxuXHRnZXRWaWV3SW5kZXgoY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHRjb25zdCBtb2RlbEluZGV4ID0gdGhpcy5fdmlld01vZGVsIS5nZXRDZWxsSW5kZXgoY2VsbCk7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Vmlld0luZGV4Mihtb2RlbEluZGV4KTtcblx0fVxuXG5cdGdldFZpZXdJbmRleDIobW9kZWxJbmRleDogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuaGlkZGVuUmFuZ2VzUHJlZml4U3VtKSB7XG5cdFx0XHRyZXR1cm4gbW9kZWxJbmRleDtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3SW5kZXhJbmZvID0gdGhpcy5oaWRkZW5SYW5nZXNQcmVmaXhTdW0uZ2V0SW5kZXhPZihtb2RlbEluZGV4KTtcblxuXHRcdGlmICh2aWV3SW5kZXhJbmZvLnJlbWFpbmRlciAhPT0gMCkge1xuXHRcdFx0aWYgKG1vZGVsSW5kZXggPj0gdGhpcy5oaWRkZW5SYW5nZXNQcmVmaXhTdW0uZ2V0VG90YWxTdW0oKSkge1xuXHRcdFx0XHQvLyBpdCdzIGFscmVhZHkgYWZ0ZXIgdGhlIGxhc3QgaGlkZGVuIHJhbmdlXG5cdFx0XHRcdHJldHVybiBtb2RlbEluZGV4IC0gKHRoaXMuaGlkZGVuUmFuZ2VzUHJlZml4U3VtLmdldFRvdGFsU3VtKCkgLSB0aGlzLmhpZGRlblJhbmdlc1ByZWZpeFN1bS5nZXRDb3VudCgpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB2aWV3SW5kZXhJbmZvLmluZGV4O1xuXHRcdH1cblx0fVxuXG5cdGNvbnZlcnRNb2RlbEluZGV4VG9WaWV3SW5kZXgobW9kZWxJbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuaGlkZGVuUmFuZ2VzUHJlZml4U3VtKSB7XG5cdFx0XHRyZXR1cm4gbW9kZWxJbmRleDtcblx0XHR9XG5cblx0XHRpZiAobW9kZWxJbmRleCA+PSB0aGlzLmhpZGRlblJhbmdlc1ByZWZpeFN1bS5nZXRUb3RhbFN1bSgpKSB7XG5cdFx0XHQvLyBpdCdzIGFscmVhZHkgYWZ0ZXIgdGhlIGxhc3QgaGlkZGVuIHJhbmdlXG5cdFx0XHRyZXR1cm4gTWF0aC5taW4odGhpcy5sZW5ndGgsIHRoaXMuaGlkZGVuUmFuZ2VzUHJlZml4U3VtLmdldFRvdGFsU3VtKCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmhpZGRlblJhbmdlc1ByZWZpeFN1bS5nZXRJbmRleE9mKG1vZGVsSW5kZXgpLmluZGV4O1xuXHR9XG5cblx0bW9kZWxJbmRleElzVmlzaWJsZShtb2RlbEluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuaGlkZGVuUmFuZ2VzUHJlZml4U3VtKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3SW5kZXhJbmZvID0gdGhpcy5oaWRkZW5SYW5nZXNQcmVmaXhTdW0uZ2V0SW5kZXhPZihtb2RlbEluZGV4KTtcblx0XHRpZiAodmlld0luZGV4SW5mby5yZW1haW5kZXIgIT09IDApIHtcblx0XHRcdGlmIChtb2RlbEluZGV4ID49IHRoaXMuaGlkZGVuUmFuZ2VzUHJlZml4U3VtLmdldFRvdGFsU3VtKCkpIHtcblx0XHRcdFx0Ly8gaXQncyBhbHJlYWR5IGFmdGVyIHRoZSBsYXN0IGhpZGRlbiByYW5nZVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VmlzaWJsZVJhbmdlc0Zyb21JbmRleCh0b3BWaWV3SW5kZXg6IG51bWJlciwgdG9wTW9kZWxJbmRleDogbnVtYmVyLCBib3R0b21WaWV3SW5kZXg6IG51bWJlciwgYm90dG9tTW9kZWxJbmRleDogbnVtYmVyKSB7XG5cdFx0Y29uc3Qgc3RhY2s6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgcmFuZ2VzOiBJQ2VsbFJhbmdlW10gPSBbXTtcblx0XHQvLyB0aGVyZSBhcmUgaGlkZGVuIHJhbmdlc1xuXHRcdGxldCBpbmRleCA9IHRvcFZpZXdJbmRleDtcblx0XHRsZXQgbW9kZWxJbmRleCA9IHRvcE1vZGVsSW5kZXg7XG5cblx0XHR3aGlsZSAoaW5kZXggPD0gYm90dG9tVmlld0luZGV4KSB7XG5cdFx0XHRjb25zdCBhY2N1ID0gdGhpcy5oaWRkZW5SYW5nZXNQcmVmaXhTdW0hLmdldFByZWZpeFN1bShpbmRleCk7XG5cdFx0XHRpZiAoYWNjdSA9PT0gbW9kZWxJbmRleCArIDEpIHtcblx0XHRcdFx0Ly8gbm8gaGlkZGVuIGFyZWEgYWZ0ZXIgaXRcblx0XHRcdFx0aWYgKHN0YWNrLmxlbmd0aCkge1xuXHRcdFx0XHRcdGlmIChzdGFja1tzdGFjay5sZW5ndGggLSAxXSA9PT0gbW9kZWxJbmRleCAtIDEpIHtcblx0XHRcdFx0XHRcdHJhbmdlcy5wdXNoKHsgc3RhcnQ6IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdLCBlbmQ6IG1vZGVsSW5kZXggKyAxIH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyYW5nZXMucHVzaCh7IHN0YXJ0OiBzdGFja1tzdGFjay5sZW5ndGggLSAxXSwgZW5kOiBzdGFja1tzdGFjay5sZW5ndGggLSAxXSArIDEgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3RhY2sucHVzaChtb2RlbEluZGV4KTtcblx0XHRcdFx0aW5kZXgrKztcblx0XHRcdFx0bW9kZWxJbmRleCsrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gdGhlcmUgYXJlIGhpZGRlbiByYW5nZXMgYWZ0ZXIgaXRcblx0XHRcdFx0aWYgKHN0YWNrLmxlbmd0aCkge1xuXHRcdFx0XHRcdGlmIChzdGFja1tzdGFjay5sZW5ndGggLSAxXSA9PT0gbW9kZWxJbmRleCAtIDEpIHtcblx0XHRcdFx0XHRcdHJhbmdlcy5wdXNoKHsgc3RhcnQ6IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdLCBlbmQ6IG1vZGVsSW5kZXggKyAxIH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyYW5nZXMucHVzaCh7IHN0YXJ0OiBzdGFja1tzdGFjay5sZW5ndGggLSAxXSwgZW5kOiBzdGFja1tzdGFjay5sZW5ndGggLSAxXSArIDEgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3RhY2sucHVzaChtb2RlbEluZGV4KTtcblx0XHRcdFx0aW5kZXgrKztcblx0XHRcdFx0bW9kZWxJbmRleCA9IGFjY3U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN0YWNrLmxlbmd0aCkge1xuXHRcdFx0cmFuZ2VzLnB1c2goeyBzdGFydDogc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0sIGVuZDogc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0gKyAxIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZWR1Y2VDZWxsUmFuZ2VzKHJhbmdlcyk7XG5cdH1cblxuXHRnZXRWaXNpYmxlUmFuZ2VzUGx1c1ZpZXdwb3J0QWJvdmVBbmRCZWxvdygpIHtcblx0XHRpZiAodGhpcy52aWV3Lmxlbmd0aCA8PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9wID0gTWF0aC5tYXgodGhpcy5nZXRWaWV3U2Nyb2xsVG9wKCkgLSB0aGlzLnJlbmRlckhlaWdodCwgMCk7XG5cdFx0Y29uc3QgdG9wVmlld0luZGV4ID0gdGhpcy52aWV3LmluZGV4QXQodG9wKTtcblx0XHRjb25zdCB0b3BFbGVtZW50ID0gdGhpcy52aWV3LmVsZW1lbnQodG9wVmlld0luZGV4KTtcblx0XHRjb25zdCB0b3BNb2RlbEluZGV4ID0gdGhpcy5fdmlld01vZGVsIS5nZXRDZWxsSW5kZXgodG9wRWxlbWVudCk7XG5cdFx0Y29uc3QgYm90dG9tID0gY2xhbXAodGhpcy5nZXRWaWV3U2Nyb2xsQm90dG9tKCkgKyB0aGlzLnJlbmRlckhlaWdodCwgMCwgdGhpcy5zY3JvbGxIZWlnaHQpO1xuXHRcdGNvbnN0IGJvdHRvbVZpZXdJbmRleCA9IGNsYW1wKHRoaXMudmlldy5pbmRleEF0KGJvdHRvbSksIDAsIHRoaXMudmlldy5sZW5ndGggLSAxKTtcblx0XHRjb25zdCBib3R0b21FbGVtZW50ID0gdGhpcy52aWV3LmVsZW1lbnQoYm90dG9tVmlld0luZGV4KTtcblx0XHRjb25zdCBib3R0b21Nb2RlbEluZGV4ID0gdGhpcy5fdmlld01vZGVsIS5nZXRDZWxsSW5kZXgoYm90dG9tRWxlbWVudCk7XG5cblx0XHRpZiAoYm90dG9tTW9kZWxJbmRleCAtIHRvcE1vZGVsSW5kZXggPT09IGJvdHRvbVZpZXdJbmRleCAtIHRvcFZpZXdJbmRleCkge1xuXHRcdFx0cmV0dXJuIFt7IHN0YXJ0OiB0b3BNb2RlbEluZGV4LCBlbmQ6IGJvdHRvbU1vZGVsSW5kZXggfV07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9nZXRWaXNpYmxlUmFuZ2VzRnJvbUluZGV4KHRvcFZpZXdJbmRleCwgdG9wTW9kZWxJbmRleCwgYm90dG9tVmlld0luZGV4LCBib3R0b21Nb2RlbEluZGV4KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRWaWV3SW5kZXhVcHBlckJvdW5kKGNlbGw6IElDZWxsVmlld01vZGVsKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX3ZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsSW5kZXggPSB0aGlzLl92aWV3TW9kZWwuZ2V0Q2VsbEluZGV4KGNlbGwpO1xuXHRcdGlmIChtb2RlbEluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5oaWRkZW5SYW5nZXNQcmVmaXhTdW0pIHtcblx0XHRcdHJldHVybiBtb2RlbEluZGV4O1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdJbmRleEluZm8gPSB0aGlzLmhpZGRlblJhbmdlc1ByZWZpeFN1bS5nZXRJbmRleE9mKG1vZGVsSW5kZXgpO1xuXG5cdFx0aWYgKHZpZXdJbmRleEluZm8ucmVtYWluZGVyICE9PSAwKSB7XG5cdFx0XHRpZiAobW9kZWxJbmRleCA+PSB0aGlzLmhpZGRlblJhbmdlc1ByZWZpeFN1bS5nZXRUb3RhbFN1bSgpKSB7XG5cdFx0XHRcdHJldHVybiBtb2RlbEluZGV4IC0gKHRoaXMuaGlkZGVuUmFuZ2VzUHJlZml4U3VtLmdldFRvdGFsU3VtKCkgLSB0aGlzLmhpZGRlblJhbmdlc1ByZWZpeFN1bS5nZXRDb3VudCgpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdmlld0luZGV4SW5mby5pbmRleDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFZpZXdJbmRleFVwcGVyQm91bmQyKG1vZGVsSW5kZXg6IG51bWJlcikge1xuXHRcdGlmICghdGhpcy5oaWRkZW5SYW5nZXNQcmVmaXhTdW0pIHtcblx0XHRcdHJldHVybiBtb2RlbEluZGV4O1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdJbmRleEluZm8gPSB0aGlzLmhpZGRlblJhbmdlc1ByZWZpeFN1bS5nZXRJbmRleE9mKG1vZGVsSW5kZXgpO1xuXG5cdFx0aWYgKHZpZXdJbmRleEluZm8ucmVtYWluZGVyICE9PSAwKSB7XG5cdFx0XHRpZiAobW9kZWxJbmRleCA+PSB0aGlzLmhpZGRlblJhbmdlc1ByZWZpeFN1bS5nZXRUb3RhbFN1bSgpKSB7XG5cdFx0XHRcdHJldHVybiBtb2RlbEluZGV4IC0gKHRoaXMuaGlkZGVuUmFuZ2VzUHJlZml4U3VtLmdldFRvdGFsU3VtKCkgLSB0aGlzLmhpZGRlblJhbmdlc1ByZWZpeFN1bS5nZXRDb3VudCgpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdmlld0luZGV4SW5mby5pbmRleDtcblx0fVxuXG5cdGZvY3VzRWxlbWVudChjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fZ2V0Vmlld0luZGV4VXBwZXJCb3VuZChjZWxsKTtcblxuXHRcdGlmIChpbmRleCA+PSAwICYmIHRoaXMuX3ZpZXdNb2RlbCkge1xuXHRcdFx0Ly8gdXBkYXRlIHZpZXcgbW9kZWwgZmlyc3QsIHdoaWNoIHdpbGwgdXBkYXRlIGJvdGggYGZvY3VzYCBhbmQgYHNlbGVjdGlvbmAgaW4gYSBzaW5nbGUgdHJhbnNhY3Rpb25cblx0XHRcdGNvbnN0IGZvY3VzZWRFbGVtZW50SGFuZGxlID0gdGhpcy5lbGVtZW50KGluZGV4KS5oYW5kbGU7XG5cdFx0XHR0aGlzLl92aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHtcblx0XHRcdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkhhbmRsZSxcblx0XHRcdFx0cHJpbWFyeTogZm9jdXNlZEVsZW1lbnRIYW5kbGUsXG5cdFx0XHRcdHNlbGVjdGlvbnM6IFtmb2N1c2VkRWxlbWVudEhhbmRsZV1cblx0XHRcdH0sICd2aWV3Jyk7XG5cblx0XHRcdC8vIHVwZGF0ZSB0aGUgdmlldyBhcyBwcmV2aW91cyBtb2RlbCB1cGRhdGUgd2lsbCBub3QgdHJpZ2dlciBldmVudFxuXHRcdFx0dGhpcy5zZXRGb2N1cyhbaW5kZXhdLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRzZWxlY3RFbGVtZW50cyhlbGVtZW50czogSUNlbGxWaWV3TW9kZWxbXSkge1xuXHRcdGNvbnN0IGluZGljZXMgPSBlbGVtZW50cy5tYXAoY2VsbCA9PiB0aGlzLl9nZXRWaWV3SW5kZXhVcHBlckJvdW5kKGNlbGwpKS5maWx0ZXIoaW5kZXggPT4gaW5kZXggPj0gMCk7XG5cdFx0dGhpcy5zZXRTZWxlY3Rpb24oaW5kaWNlcyk7XG5cdH1cblxuXHRnZXRDZWxsVmlld1Njcm9sbFRvcChjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fZ2V0Vmlld0luZGV4VXBwZXJCb3VuZChjZWxsKTtcblx0XHRpZiAoaW5kZXggPT09IHVuZGVmaW5lZCB8fCBpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBMaXN0RXJyb3IodGhpcy5saXN0VXNlciwgYEludmFsaWQgaW5kZXggJHtpbmRleH1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy52aWV3LmVsZW1lbnRUb3AoaW5kZXgpO1xuXHR9XG5cblx0Z2V0Q2VsbFZpZXdTY3JvbGxCb3R0b20oY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2dldFZpZXdJbmRleFVwcGVyQm91bmQoY2VsbCk7XG5cdFx0aWYgKGluZGV4ID09PSB1bmRlZmluZWQgfHwgaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgTGlzdEVycm9yKHRoaXMubGlzdFVzZXIsIGBJbnZhbGlkIGluZGV4ICR7aW5kZXh9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9wID0gdGhpcy52aWV3LmVsZW1lbnRUb3AoaW5kZXgpO1xuXHRcdGNvbnN0IGhlaWdodCA9IHRoaXMudmlldy5lbGVtZW50SGVpZ2h0KGluZGV4KTtcblx0XHRyZXR1cm4gdG9wICsgaGVpZ2h0O1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0Rm9jdXMoaW5kZXhlczogbnVtYmVyW10sIGJyb3dzZXJFdmVudD86IFVJRXZlbnQsIGlnbm9yZVRleHRNb2RlbFVwZGF0ZT86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoaWdub3JlVGV4dE1vZGVsVXBkYXRlKSB7XG5cdFx0XHRzdXBlci5zZXRGb2N1cyhpbmRleGVzLCBicm93c2VyRXZlbnQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghaW5kZXhlcy5sZW5ndGgpIHtcblx0XHRcdGlmICh0aGlzLl92aWV3TW9kZWwpIHtcblx0XHRcdFx0aWYgKHRoaXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Ly8gRG9uJ3QgYWxsb3cgY2xlYXJpbmcgZm9jdXMsICMxMjExMjlcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl92aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHtcblx0XHRcdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSGFuZGxlLFxuXHRcdFx0XHRcdHByaW1hcnk6IG51bGwsXG5cdFx0XHRcdFx0c2VsZWN0aW9uczogW11cblx0XHRcdFx0fSwgJ3ZpZXcnKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMuX3ZpZXdNb2RlbCkge1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkRWxlbWVudEhhbmRsZSA9IHRoaXMuZWxlbWVudChpbmRleGVzWzBdKS5oYW5kbGU7XG5cdFx0XHRcdHRoaXMuX3ZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoe1xuXHRcdFx0XHRcdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5IYW5kbGUsXG5cdFx0XHRcdFx0cHJpbWFyeTogZm9jdXNlZEVsZW1lbnRIYW5kbGUsXG5cdFx0XHRcdFx0c2VsZWN0aW9uczogdGhpcy5nZXRTZWxlY3Rpb24oKS5tYXAoc2VsZWN0aW9uID0+IHRoaXMuZWxlbWVudChzZWxlY3Rpb24pLmhhbmRsZSlcblx0XHRcdFx0fSwgJ3ZpZXcnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzdXBlci5zZXRGb2N1cyhpbmRleGVzLCBicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0U2VsZWN0aW9uKGluZGV4ZXM6IG51bWJlcltdLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50IHwgdW5kZWZpbmVkLCBpZ25vcmVUZXh0TW9kZWxVcGRhdGU/OiBib29sZWFuKSB7XG5cdFx0aWYgKGlnbm9yZVRleHRNb2RlbFVwZGF0ZSkge1xuXHRcdFx0c3VwZXIuc2V0U2VsZWN0aW9uKGluZGV4ZXMsIGJyb3dzZXJFdmVudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFpbmRleGVzLmxlbmd0aCkge1xuXHRcdFx0aWYgKHRoaXMuX3ZpZXdNb2RlbCkge1xuXHRcdFx0XHR0aGlzLl92aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHtcblx0XHRcdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSGFuZGxlLFxuXHRcdFx0XHRcdHByaW1hcnk6IHRoaXMuZ2V0Rm9jdXNlZEVsZW1lbnRzKClbMF0/LmhhbmRsZSA/PyBudWxsLFxuXHRcdFx0XHRcdHNlbGVjdGlvbnM6IFtdXG5cdFx0XHRcdH0sICd2aWV3Jyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLl92aWV3TW9kZWwpIHtcblx0XHRcdFx0dGhpcy5fdmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7XG5cdFx0XHRcdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkhhbmRsZSxcblx0XHRcdFx0XHRwcmltYXJ5OiB0aGlzLmdldEZvY3VzZWRFbGVtZW50cygpWzBdPy5oYW5kbGUgPz8gbnVsbCxcblx0XHRcdFx0XHRzZWxlY3Rpb25zOiBpbmRleGVzLm1hcChpbmRleCA9PiB0aGlzLmVsZW1lbnQoaW5kZXgpKS5tYXAoY2VsbCA9PiBjZWxsLmhhbmRsZSlcblx0XHRcdFx0fSwgJ3ZpZXcnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzdXBlci5zZXRTZWxlY3Rpb24oaW5kZXhlcywgYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgcmFuZ2Ugd2lsbCBiZSByZXZlYWxlZCB3aXRoIGFzIGxpdHRsZSBzY3JvbGxpbmcgYXMgcG9zc2libGUuXG5cdCAqL1xuXHRyZXZlYWxDZWxscyhyYW5nZTogSUNlbGxSYW5nZSkge1xuXHRcdGNvbnN0IHN0YXJ0SW5kZXggPSB0aGlzLl9nZXRWaWV3SW5kZXhVcHBlckJvdW5kMihyYW5nZS5zdGFydCk7XG5cblx0XHRpZiAoc3RhcnRJbmRleCA8IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbmRJbmRleCA9IHRoaXMuX2dldFZpZXdJbmRleFVwcGVyQm91bmQyKHJhbmdlLmVuZCAtIDEpO1xuXG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5nZXRWaWV3U2Nyb2xsVG9wKCk7XG5cdFx0Y29uc3Qgd3JhcHBlckJvdHRvbSA9IHRoaXMuZ2V0Vmlld1Njcm9sbEJvdHRvbSgpO1xuXHRcdGNvbnN0IGVsZW1lbnRUb3AgPSB0aGlzLnZpZXcuZWxlbWVudFRvcChzdGFydEluZGV4KTtcblx0XHRpZiAoZWxlbWVudFRvcCA+PSBzY3JvbGxUb3Bcblx0XHRcdCYmIGVsZW1lbnRUb3AgPCB3cmFwcGVyQm90dG9tKSB7XG5cdFx0XHQvLyBzdGFydCBlbGVtZW50IGlzIHZpc2libGVcblx0XHRcdC8vIGNoZWNrIGVuZFxuXG5cdFx0XHRjb25zdCBlbmRFbGVtZW50VG9wID0gdGhpcy52aWV3LmVsZW1lbnRUb3AoZW5kSW5kZXgpO1xuXHRcdFx0Y29uc3QgZW5kRWxlbWVudEhlaWdodCA9IHRoaXMudmlldy5lbGVtZW50SGVpZ2h0KGVuZEluZGV4KTtcblxuXHRcdFx0aWYgKGVuZEVsZW1lbnRUb3AgKyBlbmRFbGVtZW50SGVpZ2h0IDw9IHdyYXBwZXJCb3R0b20pIHtcblx0XHRcdFx0Ly8gZnVsbHkgdmlzaWJsZVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbmRFbGVtZW50VG9wID49IHdyYXBwZXJCb3R0b20pIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3JldmVhbEludGVybmFsKGVuZEluZGV4LCBmYWxzZSwgQ2VsbFJldmVhbFBvc2l0aW9uLkJvdHRvbSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbmRFbGVtZW50VG9wIDwgd3JhcHBlckJvdHRvbSkge1xuXHRcdFx0XHQvLyBlbmQgZWxlbWVudCBwYXJ0aWFsbHkgdmlzaWJsZVxuXHRcdFx0XHRpZiAoZW5kRWxlbWVudFRvcCArIGVuZEVsZW1lbnRIZWlnaHQgLSB3cmFwcGVyQm90dG9tIDwgZWxlbWVudFRvcCAtIHNjcm9sbFRvcCkge1xuXHRcdFx0XHRcdC8vIHRoZXJlIGlzIGVub3VnaCBzcGFjZSB0byBqdXN0IHNjcm9sbCB1cCBhIGxpdHRsZSBiaXQgdG8gbWFrZSB0aGUgZW5kIGVsZW1lbnQgdmlzaWJsZVxuXHRcdFx0XHRcdHJldHVybiB0aGlzLnZpZXcuc2V0U2Nyb2xsVG9wKHNjcm9sbFRvcCArIGVuZEVsZW1lbnRUb3AgKyBlbmRFbGVtZW50SGVpZ2h0IC0gd3JhcHBlckJvdHRvbSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gZG9uJ3QgZXZlbiB0cnkgaXRcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcmV2ZWFsSW50ZXJuYWwoc3RhcnRJbmRleCwgZmFsc2UsIENlbGxSZXZlYWxQb3NpdGlvbi5Ub3ApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmV2ZWFsSW5WaWV3V2l0aE1pbmltYWxTY3JvbGxpbmcoc3RhcnRJbmRleCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWxJblZpZXdXaXRoTWluaW1hbFNjcm9sbGluZyh2aWV3SW5kZXg6IG51bWJlciwgZmlyc3RMaW5lPzogYm9vbGVhbikge1xuXHRcdGNvbnN0IGZpcnN0SW5kZXggPSB0aGlzLnZpZXcuZmlyc3RNb3N0bHlWaXNpYmxlSW5kZXg7XG5cdFx0Y29uc3QgZWxlbWVudEhlaWdodCA9IHRoaXMudmlldy5lbGVtZW50SGVpZ2h0KHZpZXdJbmRleCk7XG5cblx0XHRpZiAodmlld0luZGV4IDw9IGZpcnN0SW5kZXggfHwgKCFmaXJzdExpbmUgJiYgZWxlbWVudEhlaWdodCA+PSB0aGlzLnZpZXcucmVuZGVySGVpZ2h0KSkge1xuXHRcdFx0dGhpcy5fcmV2ZWFsSW50ZXJuYWwodmlld0luZGV4LCB0cnVlLCBDZWxsUmV2ZWFsUG9zaXRpb24uVG9wKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmV2ZWFsSW50ZXJuYWwodmlld0luZGV4LCB0cnVlLCBDZWxsUmV2ZWFsUG9zaXRpb24uQm90dG9tLCBmaXJzdExpbmUpO1xuXHRcdH1cblx0fVxuXG5cdHNjcm9sbFRvQm90dG9tKCkge1xuXHRcdGNvbnN0IHNjcm9sbEhlaWdodCA9IHRoaXMudmlldy5zY3JvbGxIZWlnaHQ7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5nZXRWaWV3U2Nyb2xsVG9wKCk7XG5cdFx0Y29uc3Qgd3JhcHBlckJvdHRvbSA9IHRoaXMuZ2V0Vmlld1Njcm9sbEJvdHRvbSgpO1xuXG5cdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChzY3JvbGxIZWlnaHQgLSAod3JhcHBlckJvdHRvbSAtIHNjcm9sbFRvcCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldmVhbHMgdGhlIGdpdmVuIGNlbGwgaW4gdGhlIG5vdGVib29rIGNlbGwgbGlzdC4gVGhlIGNlbGwgd2lsbCBjb21lIGludG8gdmlldyBzeW5jcm9ub3VzbHlcblx0ICogYnV0IHRoZSBjZWxsJ3MgZWRpdG9yIHdpbGwgYmUgYXR0YWNoZWQgYXN5bmNyb25vdXNseSBpZiBpdCB3YXMgcHJldmlvdXNseSBvdXQgb2Ygdmlldy5cblx0ICogQHJldHVybnMgVGhlIHByb21pc2UgdG8gYXdhaXQgZm9yIHRoZSBjZWxsIGVkaXRvciB0byBiZSBhdHRhY2hlZFxuXHQgKi9cblx0YXN5bmMgcmV2ZWFsQ2VsbChjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgcmV2ZWFsVHlwZTogQ2VsbFJldmVhbFR5cGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2dldFZpZXdJbmRleFVwcGVyQm91bmQoY2VsbCk7XG5cblx0XHRpZiAoaW5kZXggPCAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChyZXZlYWxUeXBlKSB7XG5cdFx0XHRjYXNlIENlbGxSZXZlYWxUeXBlLlRvcDpcblx0XHRcdFx0dGhpcy5fcmV2ZWFsSW50ZXJuYWwoaW5kZXgsIGZhbHNlLCBDZWxsUmV2ZWFsUG9zaXRpb24uVG9wKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENlbGxSZXZlYWxUeXBlLkNlbnRlcjpcblx0XHRcdFx0dGhpcy5fcmV2ZWFsSW50ZXJuYWwoaW5kZXgsIGZhbHNlLCBDZWxsUmV2ZWFsUG9zaXRpb24uQ2VudGVyKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENlbGxSZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0OlxuXHRcdFx0XHR0aGlzLl9yZXZlYWxJbnRlcm5hbChpbmRleCwgdHJ1ZSwgQ2VsbFJldmVhbFBvc2l0aW9uLkNlbnRlcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDZWxsUmV2ZWFsVHlwZS5OZWFyVG9wSWZPdXRzaWRlVmlld3BvcnQ6XG5cdFx0XHRcdHRoaXMuX3JldmVhbEludGVybmFsKGluZGV4LCB0cnVlLCBDZWxsUmV2ZWFsUG9zaXRpb24uTmVhclRvcCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDZWxsUmV2ZWFsVHlwZS5GaXJzdExpbmVJZk91dHNpZGVWaWV3cG9ydDpcblx0XHRcdFx0dGhpcy5fcmV2ZWFsSW5WaWV3V2l0aE1pbmltYWxTY3JvbGxpbmcoaW5kZXgsIHRydWUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ2VsbFJldmVhbFR5cGUuRGVmYXVsdDpcblx0XHRcdFx0dGhpcy5fcmV2ZWFsSW5WaWV3V2l0aE1pbmltYWxTY3JvbGxpbmcoaW5kZXgpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAoKFxuXHRcdFx0Ly8gd2FpdCBmb3IgdGhlIGVkaXRvciB0byBiZSBjcmVhdGVkIGlmIHRoZSBjZWxsIGlzIGluIGVkaXRpbmcgbW9kZVxuXHRcdFx0Y2VsbC5nZXRFZGl0U3RhdGUoKSA9PT0gQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nXG5cdFx0XHQvLyB3YWl0IGZvciB0aGUgZWRpdG9yIHRvIGJlIGNyZWF0ZWQgaWYgd2UgYXJlIHJldmVhbGluZyB0aGUgZmlyc3QgbGluZSBvZiB0aGUgY2VsbFxuXHRcdFx0fHwgKHJldmVhbFR5cGUgPT09IENlbGxSZXZlYWxUeXBlLkZpcnN0TGluZUlmT3V0c2lkZVZpZXdwb3J0ICYmIGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUpXG5cdFx0KSAmJiAhY2VsbC5lZGl0b3JBdHRhY2hlZCkge1xuXHRcdFx0cmV0dXJuIGdldEVkaXRvckF0dGFjaGVkUHJvbWlzZShjZWxsKTtcblx0XHR9XG5cblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWxJbnRlcm5hbCh2aWV3SW5kZXg6IG51bWJlciwgaWdub3JlSWZJbnNpZGVWaWV3cG9ydDogYm9vbGVhbiwgcmV2ZWFsUG9zaXRpb246IENlbGxSZXZlYWxQb3NpdGlvbiwgZmlyc3RMaW5lPzogYm9vbGVhbikge1xuXHRcdGlmICh2aWV3SW5kZXggPj0gdGhpcy52aWV3Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuZ2V0Vmlld1Njcm9sbFRvcCgpO1xuXHRcdGNvbnN0IHdyYXBwZXJCb3R0b20gPSB0aGlzLmdldFZpZXdTY3JvbGxCb3R0b20oKTtcblx0XHRjb25zdCBlbGVtZW50VG9wID0gdGhpcy52aWV3LmVsZW1lbnRUb3Aodmlld0luZGV4KTtcblx0XHRjb25zdCBlbGVtZW50Qm90dG9tID0gdGhpcy52aWV3LmVsZW1lbnRIZWlnaHQodmlld0luZGV4KSArIGVsZW1lbnRUb3A7XG5cblx0XHRpZiAoaWdub3JlSWZJbnNpZGVWaWV3cG9ydCkge1xuXHRcdFx0aWYgKGVsZW1lbnRUb3AgPj0gc2Nyb2xsVG9wICYmIGVsZW1lbnRCb3R0b20gPCB3cmFwcGVyQm90dG9tKSB7XG5cdFx0XHRcdC8vIGVsZW1lbnQgaXMgYWxyZWFkeSBmdWxseSB2aXNpYmxlXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzd2l0Y2ggKHJldmVhbFBvc2l0aW9uKSB7XG5cdFx0XHRjYXNlIENlbGxSZXZlYWxQb3NpdGlvbi5Ub3A6XG5cdFx0XHRcdHRoaXMudmlldy5zZXRTY3JvbGxUb3AoZWxlbWVudFRvcCk7XG5cdFx0XHRcdHRoaXMudmlldy5zZXRTY3JvbGxUb3AodGhpcy52aWV3LmVsZW1lbnRUb3Aodmlld0luZGV4KSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDZWxsUmV2ZWFsUG9zaXRpb24uQ2VudGVyOlxuXHRcdFx0Y2FzZSBDZWxsUmV2ZWFsUG9zaXRpb24uTmVhclRvcDpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC8vIHJldmVhbCB0aGUgY2VsbCB0b3AgaW4gdGhlIHZpZXdwb3J0IGNlbnRlciBpbml0aWFsbHlcblx0XHRcdFx0XHR0aGlzLnZpZXcuc2V0U2Nyb2xsVG9wKGVsZW1lbnRUb3AgLSB0aGlzLnZpZXcucmVuZGVySGVpZ2h0IC8gMik7XG5cdFx0XHRcdFx0Ly8gY2VsbCByZW5kZXJlZCBhbHJlYWR5LCB3ZSBub3cgaGF2ZSBhIG1vcmUgYWNjdXJhdGUgY2VsbCBoZWlnaHRcblx0XHRcdFx0XHRjb25zdCBuZXdFbGVtZW50VG9wID0gdGhpcy52aWV3LmVsZW1lbnRUb3Aodmlld0luZGV4KTtcblx0XHRcdFx0XHRjb25zdCBuZXdFbGVtZW50SGVpZ2h0ID0gdGhpcy52aWV3LmVsZW1lbnRIZWlnaHQodmlld0luZGV4KTtcblx0XHRcdFx0XHRjb25zdCByZW5kZXJIZWlnaHQgPSB0aGlzLmdldFZpZXdTY3JvbGxCb3R0b20oKSAtIHRoaXMuZ2V0Vmlld1Njcm9sbFRvcCgpO1xuXHRcdFx0XHRcdGlmIChuZXdFbGVtZW50SGVpZ2h0ID49IHJlbmRlckhlaWdodCkge1xuXHRcdFx0XHRcdFx0Ly8gY2VsbCBpcyBsYXJnZXIgdGhhbiB2aWV3cG9ydCwgcmV2ZWFsIHRvcFxuXHRcdFx0XHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChuZXdFbGVtZW50VG9wKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHJldmVhbFBvc2l0aW9uID09PSBDZWxsUmV2ZWFsUG9zaXRpb24uQ2VudGVyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnZpZXcuc2V0U2Nyb2xsVG9wKG5ld0VsZW1lbnRUb3AgKyAobmV3RWxlbWVudEhlaWdodCAvIDIpIC0gKHJlbmRlckhlaWdodCAvIDIpKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHJldmVhbFBvc2l0aW9uID09PSBDZWxsUmV2ZWFsUG9zaXRpb24uTmVhclRvcCkge1xuXHRcdFx0XHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChuZXdFbGVtZW50VG9wIC0gKHJlbmRlckhlaWdodCAvIDUpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENlbGxSZXZlYWxQb3NpdGlvbi5Cb3R0b206XG5cdFx0XHRcdGlmIChmaXJzdExpbmUpIHtcblx0XHRcdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy52aWV3TW9kZWw/LmxheW91dEluZm8/LmZvbnRJbmZvLmxpbmVIZWlnaHQgPz8gMTU7XG5cdFx0XHRcdFx0Y29uc3QgcGFkZGluZyA9IHRoaXMubm90ZWJvb2tPcHRpb25zLmdldExheW91dENvbmZpZ3VyYXRpb24oKS5jZWxsVG9wTWFyZ2luICsgdGhpcy5ub3RlYm9va09wdGlvbnMuZ2V0TGF5b3V0Q29uZmlndXJhdGlvbigpLmVkaXRvclRvcFBhZGRpbmc7XG5cdFx0XHRcdFx0Y29uc3QgZmlyc3RMaW5lTG9jYXRpb24gPSBlbGVtZW50VG9wICsgbGluZUhlaWdodCArIHBhZGRpbmc7XG5cdFx0XHRcdFx0aWYgKGZpcnN0TGluZUxvY2F0aW9uIDwgd3JhcHBlckJvdHRvbSkge1xuXHRcdFx0XHRcdFx0Ly8gZmlyc3QgbGluZSBpcyBhbHJlYWR5IHZpc2libGVcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLnZpZXcuc2V0U2Nyb2xsVG9wKHRoaXMuc2Nyb2xsVG9wICsgKGZpcnN0TGluZUxvY2F0aW9uIC0gd3JhcHBlckJvdHRvbSkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMudmlldy5zZXRTY3JvbGxUb3AodGhpcy5zY3JvbGxUb3AgKyAoZWxlbWVudEJvdHRvbSAtIHdyYXBwZXJCb3R0b20pKTtcblx0XHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcCh0aGlzLnNjcm9sbFRvcCArICh0aGlzLnZpZXcuZWxlbWVudFRvcCh2aWV3SW5kZXgpICsgdGhpcy52aWV3LmVsZW1lbnRIZWlnaHQodmlld0luZGV4KSAtIHRoaXMuZ2V0Vmlld1Njcm9sbEJvdHRvbSgpKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0Ly8jcmVnaW9uIFJldmVhbCBDZWxsIEVkaXRvciBSYW5nZSBhc3luY2hyb25vdXNseVxuXHRhc3luYyByZXZlYWxSYW5nZUluQ2VsbChjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgcmFuZ2U6IFNlbGVjdGlvbiB8IFJhbmdlLCByZXZlYWxUeXBlOiBDZWxsUmV2ZWFsUmFuZ2VUeXBlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9nZXRWaWV3SW5kZXhVcHBlckJvdW5kKGNlbGwpO1xuXG5cdFx0aWYgKGluZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAocmV2ZWFsVHlwZSkge1xuXHRcdFx0Y2FzZSBDZWxsUmV2ZWFsUmFuZ2VUeXBlLkRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXZlYWxSYW5nZUludGVybmFsQXN5bmMoaW5kZXgsIHJhbmdlKTtcblx0XHRcdGNhc2UgQ2VsbFJldmVhbFJhbmdlVHlwZS5DZW50ZXI6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXZlYWxSYW5nZUluQ2VudGVySW50ZXJuYWxBc3luYyhpbmRleCwgcmFuZ2UpO1xuXHRcdFx0Y2FzZSBDZWxsUmV2ZWFsUmFuZ2VUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmV2ZWFsUmFuZ2VJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0SW50ZXJuYWxBc3luYyhpbmRleCwgcmFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdC8vIExpc3QgaXRlbXMgaGF2ZSByZWFsIGR5bmFtaWMgaGVpZ2h0cywgd2hpY2ggbWVhbnMgYWZ0ZXIgd2Ugc2V0IGBzY3JvbGxUb3BgIGJhc2VkIG9uIHRoZSBgZWxlbWVudFRvcChpbmRleClgLCB0aGUgZWxlbWVudCBhdCBgaW5kZXhgIG1pZ2h0IHN0aWxsIGJlIHJlbW92ZWQgZnJvbSB0aGUgdmlldyBvbmNlIGFsbCByZWxheW91dGluZyB0YXNrcyBhcmUgZG9uZS5cblx0Ly8gRm9yIGV4YW1wbGUsIHdlIHNjcm9sbCBpdGVtIDEwIGludG8gdGhlIHZpZXcgdXB3YXJkcywgaW4gdGhlIGZpcnN0IHJvdW5kLCBpdGVtcyA3LCA4LCA5LCAxMCBhcmUgYWxsIGluIHRoZSB2aWV3cG9ydC4gVGhlbiBpdGVtIDcgYW5kIDggcmVzaXplIHRoZW1zZWx2ZXMgdG8gYmUgbGFyZ2VyIGFuZCBmaW5hbGx5IGl0ZW0gMTAgaXMgcmVtb3ZlZCBmcm9tIHRoZSB2aWV3LlxuXHQvLyBUbyBlbnN1cmUgdGhhdCBpdGVtIDEwIGlzIGFsd2F5cyB0aGVyZSwgd2UgbmVlZCB0byBzY3JvbGwgaXRlbSAxMCB0byB0aGUgdG9wIGVkZ2Ugb2YgdGhlIHZpZXdwb3J0LlxuXHRwcml2YXRlIGFzeW5jIF9yZXZlYWxSYW5nZUludGVybmFsQXN5bmModmlld0luZGV4OiBudW1iZXIsIHJhbmdlOiBTZWxlY3Rpb24gfCBSYW5nZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuZ2V0Vmlld1Njcm9sbFRvcCgpO1xuXHRcdGNvbnN0IHdyYXBwZXJCb3R0b20gPSB0aGlzLmdldFZpZXdTY3JvbGxCb3R0b20oKTtcblx0XHRjb25zdCBlbGVtZW50VG9wID0gdGhpcy52aWV3LmVsZW1lbnRUb3Aodmlld0luZGV4KTtcblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy52aWV3LmVsZW1lbnQodmlld0luZGV4KTtcblxuXHRcdGlmIChlbGVtZW50LmVkaXRvckF0dGFjaGVkKSB7XG5cdFx0XHR0aGlzLl9yZXZlYWxSYW5nZUNvbW1vbih2aWV3SW5kZXgsIHJhbmdlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZWxlbWVudEhlaWdodCA9IHRoaXMudmlldy5lbGVtZW50SGVpZ2h0KHZpZXdJbmRleCk7XG5cdFx0XHRsZXQgYWxpZ25IaW50OiAndG9wJyB8ICdib3R0b20nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoZWxlbWVudFRvcCArIGVsZW1lbnRIZWlnaHQgPD0gc2Nyb2xsVG9wKSB7XG5cdFx0XHRcdC8vIHNjcm9sbCB1cFxuXHRcdFx0XHR0aGlzLnZpZXcuc2V0U2Nyb2xsVG9wKGVsZW1lbnRUb3ApO1xuXHRcdFx0XHRhbGlnbkhpbnQgPSAndG9wJztcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudFRvcCA+PSB3cmFwcGVyQm90dG9tKSB7XG5cdFx0XHRcdC8vIHNjcm9sbCBkb3duXG5cdFx0XHRcdHRoaXMudmlldy5zZXRTY3JvbGxUb3AoZWxlbWVudFRvcCAtIHRoaXMudmlldy5yZW5kZXJIZWlnaHQgLyAyKTtcblx0XHRcdFx0YWxpZ25IaW50ID0gJ2JvdHRvbSc7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVkaXRvckF0dGFjaGVkUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0RXZlbnQub25jZShlbGVtZW50Lm9uRGlkQ2hhbmdlRWRpdG9yQXR0YWNoU3RhdGUpKCgpID0+IHtcblx0XHRcdFx0XHRlbGVtZW50LmVkaXRvckF0dGFjaGVkID8gcmVzb2x2ZSgpIDogcmVqZWN0KCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiBlZGl0b3JBdHRhY2hlZFByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3JldmVhbFJhbmdlQ29tbW9uKHZpZXdJbmRleCwgcmFuZ2UsIGFsaWduSGludCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXZlYWxSYW5nZUluQ2VudGVySW50ZXJuYWxBc3luYyh2aWV3SW5kZXg6IG51bWJlciwgcmFuZ2U6IFNlbGVjdGlvbiB8IFJhbmdlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmV2ZWFsID0gKHZpZXdJbmRleDogbnVtYmVyLCByYW5nZTogUmFuZ2UpID0+IHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLnZpZXcuZWxlbWVudCh2aWV3SW5kZXgpO1xuXHRcdFx0Y29uc3QgcG9zaXRpb25PZmZzZXQgPSBlbGVtZW50LmdldFBvc2l0aW9uU2Nyb2xsVG9wT2Zmc2V0KHJhbmdlKTtcblx0XHRcdGNvbnN0IHBvc2l0aW9uT2Zmc2V0SW5WaWV3ID0gdGhpcy52aWV3LmVsZW1lbnRUb3Aodmlld0luZGV4KSArIHBvc2l0aW9uT2Zmc2V0O1xuXHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChwb3NpdGlvbk9mZnNldEluVmlldyAtIHRoaXMudmlldy5yZW5kZXJIZWlnaHQgLyAyKTtcblx0XHRcdGVsZW1lbnQucmV2ZWFsUmFuZ2VJbkNlbnRlcihyYW5nZSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGVsZW1lbnRUb3AgPSB0aGlzLnZpZXcuZWxlbWVudFRvcCh2aWV3SW5kZXgpO1xuXHRcdGNvbnN0IHZpZXdJdGVtT2Zmc2V0ID0gZWxlbWVudFRvcDtcblx0XHR0aGlzLnZpZXcuc2V0U2Nyb2xsVG9wKHZpZXdJdGVtT2Zmc2V0IC0gdGhpcy52aWV3LnJlbmRlckhlaWdodCAvIDIpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLnZpZXcuZWxlbWVudCh2aWV3SW5kZXgpO1xuXG5cdFx0aWYgKCFlbGVtZW50LmVkaXRvckF0dGFjaGVkKSB7XG5cdFx0XHRyZXR1cm4gZ2V0RWRpdG9yQXR0YWNoZWRQcm9taXNlKGVsZW1lbnQpLnRoZW4oKCkgPT4gcmV2ZWFsKHZpZXdJbmRleCwgcmFuZ2UpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV2ZWFsKHZpZXdJbmRleCwgcmFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JldmVhbFJhbmdlSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydEludGVybmFsQXN5bmModmlld0luZGV4OiBudW1iZXIsIHJhbmdlOiBTZWxlY3Rpb24gfCBSYW5nZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJldmVhbCA9ICh2aWV3SW5kZXg6IG51bWJlciwgcmFuZ2U6IFJhbmdlKSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy52aWV3LmVsZW1lbnQodmlld0luZGV4KTtcblx0XHRcdGNvbnN0IHBvc2l0aW9uT2Zmc2V0ID0gZWxlbWVudC5nZXRQb3NpdGlvblNjcm9sbFRvcE9mZnNldChyYW5nZSk7XG5cdFx0XHRjb25zdCBwb3NpdGlvbk9mZnNldEluVmlldyA9IHRoaXMudmlldy5lbGVtZW50VG9wKHZpZXdJbmRleCkgKyBwb3NpdGlvbk9mZnNldDtcblx0XHRcdHRoaXMudmlldy5zZXRTY3JvbGxUb3AocG9zaXRpb25PZmZzZXRJblZpZXcgLSB0aGlzLnZpZXcucmVuZGVySGVpZ2h0IC8gMik7XG5cblx0XHRcdGVsZW1lbnQucmV2ZWFsUmFuZ2VJbkNlbnRlcihyYW5nZSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuZ2V0Vmlld1Njcm9sbFRvcCgpO1xuXHRcdGNvbnN0IHdyYXBwZXJCb3R0b20gPSB0aGlzLmdldFZpZXdTY3JvbGxCb3R0b20oKTtcblx0XHRjb25zdCBlbGVtZW50VG9wID0gdGhpcy52aWV3LmVsZW1lbnRUb3Aodmlld0luZGV4KTtcblx0XHRjb25zdCB2aWV3SXRlbU9mZnNldCA9IGVsZW1lbnRUb3A7XG5cdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMudmlldy5lbGVtZW50KHZpZXdJbmRleCk7XG5cdFx0Y29uc3QgcG9zaXRpb25PZmZzZXQgPSB2aWV3SXRlbU9mZnNldCArIGVsZW1lbnQuZ2V0UG9zaXRpb25TY3JvbGxUb3BPZmZzZXQocmFuZ2UpO1xuXG5cdFx0aWYgKHBvc2l0aW9uT2Zmc2V0IDwgc2Nyb2xsVG9wIHx8IHBvc2l0aW9uT2Zmc2V0ID4gd3JhcHBlckJvdHRvbSkge1xuXHRcdFx0Ly8gbGV0IGl0IHJlbmRlclxuXHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChwb3NpdGlvbk9mZnNldCAtIHRoaXMudmlldy5yZW5kZXJIZWlnaHQgLyAyKTtcblxuXHRcdFx0Ly8gYWZ0ZXIgcmVuZGVyaW5nLCBpdCBtaWdodCBiZSBwdXNoZWQgZG93biBkdWUgdG8gbWFya2Rvd24gY2VsbCBkeW5hbWljIGhlaWdodFxuXHRcdFx0Y29uc3QgbmV3UG9zaXRpb25PZmZzZXQgPSB0aGlzLnZpZXcuZWxlbWVudFRvcCh2aWV3SW5kZXgpICsgZWxlbWVudC5nZXRQb3NpdGlvblNjcm9sbFRvcE9mZnNldChyYW5nZSk7XG5cdFx0XHR0aGlzLnZpZXcuc2V0U2Nyb2xsVG9wKG5ld1Bvc2l0aW9uT2Zmc2V0IC0gdGhpcy52aWV3LnJlbmRlckhlaWdodCAvIDIpO1xuXG5cdFx0XHQvLyByZXZlYWwgZWRpdG9yXG5cdFx0XHRpZiAoIWVsZW1lbnQuZWRpdG9yQXR0YWNoZWQpIHtcblx0XHRcdFx0cmV0dXJuIGdldEVkaXRvckF0dGFjaGVkUHJvbWlzZShlbGVtZW50KS50aGVuKCgpID0+IHJldmVhbCh2aWV3SW5kZXgsIHJhbmdlKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBmb3IgZXhhbXBsZSBtYXJrZG93blxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoZWxlbWVudC5lZGl0b3JBdHRhY2hlZCkge1xuXHRcdFx0XHRlbGVtZW50LnJldmVhbFJhbmdlSW5DZW50ZXIocmFuZ2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gZm9yIGV4YW1wbGUsIG1hcmtkb3duIGNlbGwgaW4gcHJldmlldyBtb2RlXG5cdFx0XHRcdHJldHVybiBnZXRFZGl0b3JBdHRhY2hlZFByb21pc2UoZWxlbWVudCkudGhlbigoKSA9PiByZXZlYWwodmlld0luZGV4LCByYW5nZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JldmVhbFJhbmdlQ29tbW9uKHZpZXdJbmRleDogbnVtYmVyLCByYW5nZTogU2VsZWN0aW9uIHwgUmFuZ2UsIGFsaWduSGludD86ICd0b3AnIHwgJ2JvdHRvbScgfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy52aWV3LmVsZW1lbnQodmlld0luZGV4KTtcblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLmdldFZpZXdTY3JvbGxUb3AoKTtcblx0XHRjb25zdCB3cmFwcGVyQm90dG9tID0gdGhpcy5nZXRWaWV3U2Nyb2xsQm90dG9tKCk7XG5cdFx0Y29uc3QgcG9zaXRpb25PZmZzZXQgPSBlbGVtZW50LmdldFBvc2l0aW9uU2Nyb2xsVG9wT2Zmc2V0KHJhbmdlKTtcblx0XHRjb25zdCBlbGVtZW50T3JpZ2luYWxIZWlnaHQgPSB0aGlzLnZpZXcuZWxlbWVudEhlaWdodCh2aWV3SW5kZXgpO1xuXHRcdGlmIChwb3NpdGlvbk9mZnNldCA+PSBlbGVtZW50T3JpZ2luYWxIZWlnaHQpIHtcblx0XHRcdC8vIHdlIGFyZSByZXZlYWxpbmcgYSByYW5nZSB0aGF0IGlzIGJleW9uZCBjdXJyZW50IGVsZW1lbnQgaGVpZ2h0XG5cdFx0XHQvLyBpZiB3ZSBkb24ndCB1cGRhdGUgdGhlIGVsZW1lbnQgaGVpZ2h0IG5vdywgYW5kIGRpcmVjdGx5IGBzZXRUb3BgIHRvIHJldmVhbCB0aGUgcmFuZ2Vcblx0XHRcdC8vIHRoZSBlbGVtZW50IG1pZ2h0IGJlIHNjcm9sbGVkIG91dCBvZiB2aWV3XG5cdFx0XHQvLyBuZXh0IGZyYW1lLCB3aGVuIHdlIHVwZGF0ZSB0aGUgZWxlbWVudCBoZWlnaHQsIHRoZSBlbGVtZW50IHdpbGwgbmV2ZXIgYmUgc2Nyb2xsZWQgYmFjayBpbnRvIHZpZXdcblx0XHRcdGNvbnN0IG5ld1RvdGFsSGVpZ2h0ID0gZWxlbWVudC5sYXlvdXRJbmZvLnRvdGFsSGVpZ2h0O1xuXHRcdFx0dGhpcy51cGRhdGVFbGVtZW50SGVpZ2h0KHZpZXdJbmRleCwgbmV3VG90YWxIZWlnaHQpO1xuXHRcdH1cblx0XHRjb25zdCBlbGVtZW50VG9wID0gdGhpcy52aWV3LmVsZW1lbnRUb3Aodmlld0luZGV4KTtcblx0XHRjb25zdCBwb3NpdGlvblRvcCA9IGVsZW1lbnRUb3AgKyBwb3NpdGlvbk9mZnNldDtcblxuXHRcdC8vIFRPRE9AcmVib3JuaXggMzAgLS0tPiBsaW5lIGhlaWdodCAqIDEuNVxuXHRcdGlmIChwb3NpdGlvblRvcCA8IHNjcm9sbFRvcCkge1xuXHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChwb3NpdGlvblRvcCAtIDMwKTtcblx0XHR9IGVsc2UgaWYgKHBvc2l0aW9uVG9wID4gd3JhcHBlckJvdHRvbSkge1xuXHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChzY3JvbGxUb3AgKyBwb3NpdGlvblRvcCAtIHdyYXBwZXJCb3R0b20gKyAzMCk7XG5cdFx0fSBlbHNlIGlmIChhbGlnbkhpbnQgPT09ICdib3R0b20nKSB7XG5cdFx0XHQvLyBTY3JvbGxlZCBpbnRvIHZpZXcgZnJvbSBiZWxvd1xuXHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChzY3JvbGxUb3AgKyBwb3NpdGlvblRvcCAtIHdyYXBwZXJCb3R0b20gKyAzMCk7XG5cdFx0fSBlbHNlIGlmIChhbGlnbkhpbnQgPT09ICd0b3AnKSB7XG5cdFx0XHQvLyBTY3JvbGxlZCBpbnRvIHZpZXcgZnJvbSBhYm92ZVxuXHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChwb3NpdGlvblRvcCAtIDMwKTtcblx0XHR9XG5cdH1cblx0Ly8jZW5kcmVnaW9uXG5cblxuXG5cdC8qKlxuXHQgKiBSZXZlYWxzIHRoZSBzcGVjaWZpZWQgb2Zmc2V0IG9mIHRoZSBnaXZlbiBjZWxsIGluIHRoZSBjZW50ZXIgb2YgdGhlIHZpZXdwb3J0LlxuXHQgKiBUaGlzIGVuYWJsZXMgcmV2ZWFsaW5nIGxvY2F0aW9ucyBpbiB0aGUgb3V0cHV0IGFzIHdlbGwgYXMgdGhlIGlucHV0LlxuXHQgKi9cblx0cmV2ZWFsQ2VsbE9mZnNldEluQ2VudGVyKGNlbGw6IElDZWxsVmlld01vZGVsLCBvZmZzZXQ6IG51bWJlcikge1xuXHRcdGNvbnN0IHZpZXdJbmRleCA9IHRoaXMuX2dldFZpZXdJbmRleFVwcGVyQm91bmQoY2VsbCk7XG5cblx0XHRpZiAodmlld0luZGV4ID49IDApIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLnZpZXcuZWxlbWVudCh2aWV3SW5kZXgpO1xuXHRcdFx0Y29uc3QgZWxlbWVudFRvcCA9IHRoaXMudmlldy5lbGVtZW50VG9wKHZpZXdJbmRleCk7XG5cdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE1hcmt1cENlbGxWaWV3TW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3JldmVhbEluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQodmlld0luZGV4KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJhbmdlT2Zmc2V0ID0gZWxlbWVudC5sYXlvdXRJbmZvLm91dHB1dENvbnRhaW5lck9mZnNldCArIE1hdGgubWluKG9mZnNldCwgZWxlbWVudC5sYXlvdXRJbmZvLm91dHB1dFRvdGFsSGVpZ2h0KTtcblx0XHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChlbGVtZW50VG9wIC0gdGhpcy52aWV3LnJlbmRlckhlaWdodCAvIDIpO1xuXHRcdFx0XHR0aGlzLnZpZXcuc2V0U2Nyb2xsVG9wKGVsZW1lbnRUb3AgKyByYW5nZU9mZnNldCAtIHRoaXMudmlldy5yZW5kZXJIZWlnaHQgLyAyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXZlYWxPZmZzZXRJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KG9mZnNldDogbnVtYmVyKSB7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5nZXRWaWV3U2Nyb2xsVG9wKCk7XG5cdFx0Y29uc3Qgd3JhcHBlckJvdHRvbSA9IHRoaXMuZ2V0Vmlld1Njcm9sbEJvdHRvbSgpO1xuXG5cdFx0aWYgKG9mZnNldCA8IHNjcm9sbFRvcCB8fCBvZmZzZXQgPiB3cmFwcGVyQm90dG9tKSB7XG5cdFx0XHRjb25zdCBuZXdUb3AgPSBNYXRoLm1heCgwLCBvZmZzZXQgLSB0aGlzLnZpZXcucmVuZGVySGVpZ2h0IC8gMik7XG5cdFx0XHR0aGlzLnZpZXcuc2V0U2Nyb2xsVG9wKG5ld1RvcCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmV2ZWFsSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCh2aWV3SW5kZXg6IG51bWJlcikge1xuXHRcdHRoaXMuX3JldmVhbEludGVybmFsKHZpZXdJbmRleCwgdHJ1ZSwgQ2VsbFJldmVhbFBvc2l0aW9uLkNlbnRlcik7XG5cdH1cblxuXHRkb21FbGVtZW50T2ZFbGVtZW50KGVsZW1lbnQ6IElDZWxsVmlld01vZGVsKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2dldFZpZXdJbmRleFVwcGVyQm91bmQoZWxlbWVudCk7XG5cdFx0aWYgKGluZGV4ID49IDAgJiYgaW5kZXggPCB0aGlzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRoaXMudmlldy5kb21FbGVtZW50KGluZGV4KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGZvY3VzVmlldygpIHtcblx0XHR0aGlzLnZpZXcuZG9tTm9kZS5mb2N1cygpO1xuXHR9XG5cblx0dHJpZ2dlclNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoYnJvd3NlckV2ZW50OiBJTW91c2VXaGVlbEV2ZW50KSB7XG5cdFx0dGhpcy52aWV3LmRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0ZGVsZWdhdGVWZXJ0aWNhbFNjcm9sbGJhclBvaW50ZXJEb3duKGJyb3dzZXJFdmVudDogUG9pbnRlckV2ZW50KSB7XG5cdFx0dGhpcy52aWV3LmRlbGVnYXRlVmVydGljYWxTY3JvbGxiYXJQb2ludGVyRG93bihicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0VsZW1lbnRBYm92ZVZpZXdwb3J0KGluZGV4OiBudW1iZXIpIHtcblx0XHRjb25zdCBlbGVtZW50VG9wID0gdGhpcy52aWV3LmVsZW1lbnRUb3AoaW5kZXgpO1xuXHRcdGNvbnN0IGVsZW1lbnRCb3R0b20gPSBlbGVtZW50VG9wICsgdGhpcy52aWV3LmVsZW1lbnRIZWlnaHQoaW5kZXgpO1xuXG5cdFx0cmV0dXJuIGVsZW1lbnRCb3R0b20gPCB0aGlzLnNjcm9sbFRvcDtcblx0fVxuXG5cdHVwZGF0ZUVsZW1lbnRIZWlnaHQyKGVsZW1lbnQ6IElDZWxsVmlld01vZGVsLCBzaXplOiBudW1iZXIsIGFuY2hvckVsZW1lbnRJbmRleDogbnVtYmVyIHwgbnVsbCA9IG51bGwpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2dldFZpZXdJbmRleFVwcGVyQm91bmQoZWxlbWVudCk7XG5cdFx0aWYgKGluZGV4ID09PSB1bmRlZmluZWQgfHwgaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNFbGVtZW50QWJvdmVWaWV3cG9ydChpbmRleCkpIHtcblx0XHRcdC8vIHVwZGF0ZSBlbGVtZW50IGFib3ZlIHZpZXdwb3J0XG5cdFx0XHRjb25zdCBvbGRIZWlnaHQgPSB0aGlzLmVsZW1lbnRIZWlnaHQoZWxlbWVudCk7XG5cdFx0XHRjb25zdCBkZWx0YSA9IG9sZEhlaWdodCAtIHNpemU7XG5cdFx0XHRpZiAodGhpcy5fd2Vidmlld0VsZW1lbnQpIHtcblx0XHRcdFx0RXZlbnQub25jZSh0aGlzLnZpZXcub25XaWxsU2Nyb2xsKSgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgd2Vidmlld1RvcCA9IHBhcnNlSW50KHRoaXMuX3dlYnZpZXdFbGVtZW50IS5kb21Ob2RlLnN0eWxlLnRvcCwgMTApO1xuXHRcdFx0XHRcdGlmICh2YWxpZGF0ZVdlYnZpZXdCb3VuZGFyeSh0aGlzLl93ZWJ2aWV3RWxlbWVudCEuZG9tTm9kZSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3dlYnZpZXdFbGVtZW50IS5zZXRUb3Aod2Vidmlld1RvcCAtIGRlbHRhKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gV2hlbiB0aGUgd2VidmlldyB0b3AgYm91bmRhcnkgaXMgYmVsb3cgdGhlIGxpc3QgdmlldyBzY3JvbGxhYmxlIGVsZW1lbnQgdG9wIGJvdW5kYXJ5LCB0aGVuIHdlIGNhbid0IGluc2VydCBhIG1hcmtkb3duIGNlbGwgYXQgdGhlIHRvcFxuXHRcdFx0XHRcdFx0Ly8gb3Igd2hlbiBpdHMgYm90dG9tIGJvdW5kYXJ5IGlzIGFib3ZlIHRoZSBsaXN0IHZpZXcgYm90dG9tIGJvdW5kYXJ5LCB0aGVuIHdlIGNhbid0IGluc2VydCBhIG1hcmtkb3duIGNlbGwgYXQgdGhlIGVuZFxuXHRcdFx0XHRcdFx0Ly8gdGh1cyB3ZSBoYXZlIHRvIHJldmVydCB0aGUgd2VidmlldyBlbGVtZW50IHBvc2l0aW9uIHRvIGluaXRpYWwgc3RhdGUgYC1OT1RFQk9PS19XRUJWSUVXX0JPVU5EQVJZYC5cblx0XHRcdFx0XHRcdC8vIHRoaXMgd2lsbCB0cmlnZ2VyIG9uZSB2aXN1YWwgZmxpY2tlciAoYXMgd2UgbmVlZCB0byB1cGRhdGUgZWxlbWVudCBvZmZzZXRzIGluIHRoZSB3ZWJ2aWV3KVxuXHRcdFx0XHRcdFx0Ly8gYnV0IGFzIGxvbmcgYXMgTk9URUJPT0tfV0VCVklFV19CT1VOREFSWSBpcyBsYXJnZSBlbm91Z2gsIGl0IHdpbGwgaGFwcGVuIGxlc3Mgb2Z0ZW5cblx0XHRcdFx0XHRcdHRoaXMuX3dlYnZpZXdFbGVtZW50IS5zZXRUb3AoLU5PVEVCT09LX1dFQlZJRVdfQk9VTkRBUlkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnZpZXcudXBkYXRlRWxlbWVudEhlaWdodChpbmRleCwgc2l6ZSwgYW5jaG9yRWxlbWVudEluZGV4KTtcblx0XHRcdHRoaXMudmlld1pvbmVzLmxheW91dCgpO1xuXHRcdFx0dGhpcy5jZWxsT3ZlcmxheXMubGF5b3V0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGFuY2hvckVsZW1lbnRJbmRleCAhPT0gbnVsbCkge1xuXHRcdFx0dGhpcy52aWV3LnVwZGF0ZUVsZW1lbnRIZWlnaHQoaW5kZXgsIHNpemUsIGFuY2hvckVsZW1lbnRJbmRleCk7XG5cdFx0XHR0aGlzLnZpZXdab25lcy5sYXlvdXQoKTtcblx0XHRcdHRoaXMuY2VsbE92ZXJsYXlzLmxheW91dCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLmdldEZvY3VzKCk7XG5cdFx0Y29uc3QgZm9jdXMgPSBmb2N1c2VkLmxlbmd0aCA/IGZvY3VzZWRbMF0gOiBudWxsO1xuXG5cdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHQvLyBJZiB0aGUgY2VsbCBpcyBncm93aW5nLCB3ZSBzaG91bGQgZmF2b3IgYW5jaG9yaW5nIHRvIHRoZSBmb2N1c2VkIGNlbGxcblx0XHRcdGNvbnN0IGhlaWdodERlbHRhID0gc2l6ZSAtIHRoaXMudmlldy5lbGVtZW50SGVpZ2h0KGluZGV4KTtcblxuXHRcdFx0aWYgKHRoaXMuX25vdGVib29rQ2VsbEFuY2hvci5zaG91bGRBbmNob3IodGhpcy52aWV3LCBmb2N1cywgaGVpZ2h0RGVsdGEsIHRoaXMuZWxlbWVudChpbmRleCkpKSB7XG5cdFx0XHRcdHRoaXMudmlldy51cGRhdGVFbGVtZW50SGVpZ2h0KGluZGV4LCBzaXplLCBmb2N1cyk7XG5cdFx0XHRcdHRoaXMudmlld1pvbmVzLmxheW91dCgpO1xuXHRcdFx0XHR0aGlzLmNlbGxPdmVybGF5cy5sYXlvdXQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMudmlldy51cGRhdGVFbGVtZW50SGVpZ2h0KGluZGV4LCBzaXplLCBudWxsKTtcblx0XHR0aGlzLnZpZXdab25lcy5sYXlvdXQoKTtcblx0XHR0aGlzLmNlbGxPdmVybGF5cy5sYXlvdXQoKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjaGFuZ2VWaWV3Wm9uZXMoY2FsbGJhY2s6IChhY2Nlc3NvcjogSU5vdGVib29rVmlld1pvbmVDaGFuZ2VBY2Nlc3NvcikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnZpZXdab25lcy5jaGFuZ2VWaWV3Wm9uZXMoY2FsbGJhY2spKSB7XG5cdFx0XHR0aGlzLnZpZXdab25lcy5sYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRjaGFuZ2VDZWxsT3ZlcmxheXMoY2FsbGJhY2s6IChhY2Nlc3NvcjogSU5vdGVib29rQ2VsbE92ZXJsYXlDaGFuZ2VBY2Nlc3NvcikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNlbGxPdmVybGF5cy5jaGFuZ2VDZWxsT3ZlcmxheXMoY2FsbGJhY2spKSB7XG5cdFx0XHR0aGlzLmNlbGxPdmVybGF5cy5sYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRnZXRWaWV3Wm9uZUxheW91dEluZm8odmlld1pvbmVJZDogc3RyaW5nKTogeyBoZWlnaHQ6IG51bWJlcjsgdG9wOiBudW1iZXIgfSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLnZpZXdab25lcy5nZXRWaWV3Wm9uZUxheW91dEluZm8odmlld1pvbmVJZCk7XG5cdH1cblxuXHQvLyBvdmVycmlkZVxuXHRvdmVycmlkZSBkb21Gb2N1cygpIHtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5nZXRGb2N1c2VkRWxlbWVudHMoKVswXTtcblx0XHRjb25zdCBmb2N1c2VkRG9tRWxlbWVudCA9IGZvY3VzZWQgJiYgdGhpcy5kb21FbGVtZW50T2ZFbGVtZW50KGZvY3VzZWQpO1xuXG5cdFx0aWYgKHRoaXMudmlldy5kb21Ob2RlLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCAmJiBmb2N1c2VkRG9tRWxlbWVudCAmJiBmb2N1c2VkRG9tRWxlbWVudC5jb250YWlucyh0aGlzLnZpZXcuZG9tTm9kZS5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpKSB7XG5cdFx0XHQvLyBmb3IgZXhhbXBsZSwgd2hlbiBmb2N1cyBnb2VzIGludG8gbW9uYWNvIGVkaXRvciwgaWYgd2UgcmVmb2N1cyB0aGUgbGlzdCB2aWV3LCB0aGUgZWRpdG9yIHdpbGwgbG9zZSBmb2N1cy5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWlzTWFjaW50b3NoICYmIHRoaXMudmlldy5kb21Ob2RlLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCAmJiAhIURPTS5maW5kUGFyZW50V2l0aENsYXNzKDxIVE1MRWxlbWVudD50aGlzLnZpZXcuZG9tTm9kZS5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQsICdjb250ZXh0LXZpZXcnKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN1cGVyLmRvbUZvY3VzKCk7XG5cdH1cblxuXHRmb2N1c0NvbnRhaW5lcihjbGVhclNlbGVjdGlvbjogYm9vbGVhbikge1xuXHRcdGlmIChjbGVhclNlbGVjdGlvbikge1xuXHRcdFx0Ly8gYWxsb3cgZm9jdXMgdG8gYmUgYmV0d2VlbiBjZWxsc1xuXHRcdFx0dGhpcy5fdmlld01vZGVsPy51cGRhdGVTZWxlY3Rpb25zU3RhdGUoe1xuXHRcdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSGFuZGxlLFxuXHRcdFx0XHRwcmltYXJ5OiBudWxsLFxuXHRcdFx0XHRzZWxlY3Rpb25zOiBbXVxuXHRcdFx0fSwgJ3ZpZXcnKTtcblx0XHRcdHRoaXMuc2V0Rm9jdXMoW10sIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHR0aGlzLnNldFNlbGVjdGlvbihbXSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHR9XG5cblx0XHRzdXBlci5kb21Gb2N1cygpO1xuXHR9XG5cblx0Z2V0Vmlld1Njcm9sbFRvcCgpIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmdldFNjcm9sbFRvcCgpO1xuXHR9XG5cblx0Z2V0Vmlld1Njcm9sbEJvdHRvbSgpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRWaWV3U2Nyb2xsVG9wKCkgKyB0aGlzLnZpZXcucmVuZGVySGVpZ2h0O1xuXHR9XG5cblx0c2V0Q2VsbEVkaXRvclNlbGVjdGlvbihjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgcmFuZ2U6IFJhbmdlKSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGNlbGwgYXMgQ2VsbFZpZXdNb2RlbDtcblx0XHRpZiAoZWxlbWVudC5lZGl0b3JBdHRhY2hlZCkge1xuXHRcdFx0ZWxlbWVudC5zZXRTZWxlY3Rpb24ocmFuZ2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRnZXRFZGl0b3JBdHRhY2hlZFByb21pc2UoZWxlbWVudCkudGhlbigoKSA9PiB7IGVsZW1lbnQuc2V0U2VsZWN0aW9uKHJhbmdlKTsgfSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc3R5bGUoc3R5bGVzOiBJTGlzdFN0eWxlcykge1xuXHRcdGNvbnN0IHNlbGVjdG9yU3VmZml4ID0gdGhpcy52aWV3LmRvbUlkO1xuXHRcdGlmICghdGhpcy5zdHlsZUVsZW1lbnQpIHtcblx0XHRcdHRoaXMuc3R5bGVFbGVtZW50ID0gZG9tU3R5bGVzaGVldHNKcy5jcmVhdGVTdHlsZVNoZWV0KHRoaXMudmlldy5kb21Ob2RlKTtcblx0XHR9XG5cdFx0Y29uc3Qgc3VmZml4ID0gc2VsZWN0b3JTdWZmaXggJiYgYC4ke3NlbGVjdG9yU3VmZml4fWA7XG5cdFx0Y29uc3QgY29udGVudDogc3RyaW5nW10gPSBbXTtcblxuXHRcdGlmIChzdHlsZXMubGlzdEJhY2tncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9ID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyB7IGJhY2tncm91bmQ6ICR7c3R5bGVzLmxpc3RCYWNrZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEZvY3VzQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgYmFja2dyb3VuZC1jb2xvcjogJHtzdHlsZXMubGlzdEZvY3VzQmFja2dyb3VuZH07IH1gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9OmZvY3VzID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZDpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3RGb2N1c0JhY2tncm91bmR9OyB9YCk7IC8vIG92ZXJ3cml0ZSA6aG92ZXIgc3R5bGUgaW4gdGhpcyBjYXNlIVxuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEZvY3VzRm9yZWdyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgY29sb3I6ICR7c3R5bGVzLmxpc3RGb2N1c0ZvcmVncm91bmR9OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZCB7IGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kfTsgfWApO1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZDpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kfTsgfWApOyAvLyBvdmVyd3JpdGUgOmhvdmVyIHN0eWxlIGluIHRoaXMgY2FzZSFcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fTpmb2N1cyA+IGRpdi5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93LnNlbGVjdGVkIHsgY29sb3I6ICR7c3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEZvY3VzQW5kU2VsZWN0aW9uQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGBcblx0XHRcdFx0Lm1vbmFjby1kcmFnLWltYWdlJHtzdWZmaXh9LFxuXHRcdFx0XHQubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZC5mb2N1c2VkIHsgYmFja2dyb3VuZC1jb2xvcjogJHtzdHlsZXMubGlzdEZvY3VzQW5kU2VsZWN0aW9uQmFja2dyb3VuZH07IH1cblx0XHRcdGApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEZvY3VzQW5kU2VsZWN0aW9uRm9yZWdyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGBcblx0XHRcdFx0Lm1vbmFjby1kcmFnLWltYWdlJHtzdWZmaXh9LFxuXHRcdFx0XHQubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZC5mb2N1c2VkIHsgY29sb3I6ICR7c3R5bGVzLmxpc3RGb2N1c0FuZFNlbGVjdGlvbkZvcmVncm91bmR9OyB9XG5cdFx0XHRgKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RJbmFjdGl2ZUZvY3VzQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgYmFja2dyb3VuZC1jb2xvcjogICR7c3R5bGVzLmxpc3RJbmFjdGl2ZUZvY3VzQmFja2dyb3VuZH07IH1gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9ID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZDpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICAke3N0eWxlcy5saXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmR9OyB9YCk7IC8vIG92ZXJ3cml0ZSA6aG92ZXIgc3R5bGUgaW4gdGhpcyBjYXNlIVxuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZCB7IGJhY2tncm91bmQtY29sb3I6ICAke3N0eWxlcy5saXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kfTsgfWApO1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZDpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICAke3N0eWxlcy5saXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kfTsgfWApOyAvLyBvdmVyd3JpdGUgOmhvdmVyIHN0eWxlIGluIHRoaXMgY2FzZSFcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RJbmFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9ID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQgeyBjb2xvcjogJHtzdHlsZXMubGlzdEluYWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZH07IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RIb3ZlckJhY2tncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9Om5vdCguZHJvcC10YXJnZXQpID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3c6aG92ZXI6bm90KC5zZWxlY3RlZCk6bm90KC5mb2N1c2VkKSB7IGJhY2tncm91bmQtY29sb3I6ICAke3N0eWxlcy5saXN0SG92ZXJCYWNrZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEhvdmVyRm9yZWdyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gPiBkaXYubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5tb25hY28tbGlzdC1yb3dzID4gLm1vbmFjby1saXN0LXJvdzpob3Zlcjpub3QoLnNlbGVjdGVkKTpub3QoLmZvY3VzZWQpIHsgY29sb3I6ICAke3N0eWxlcy5saXN0SG92ZXJGb3JlZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdFNlbGVjdGlvbk91dGxpbmUpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9ID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQgeyBvdXRsaW5lOiAxcHggZG90dGVkICR7c3R5bGVzLmxpc3RTZWxlY3Rpb25PdXRsaW5lfTsgb3V0bGluZS1vZmZzZXQ6IC0xcHg7IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RGb2N1c091dGxpbmUpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgXG5cdFx0XHRcdC5tb25hY28tZHJhZy1pbWFnZSR7c3VmZml4fSxcblx0XHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9OmZvY3VzID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cyA+IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IG91dGxpbmU6IDFweCBzb2xpZCAke3N0eWxlcy5saXN0Rm9jdXNPdXRsaW5lfTsgb3V0bGluZS1vZmZzZXQ6IC0xcHg7IH1cblx0XHRcdGApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEluYWN0aXZlRm9jdXNPdXRsaW5lKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSA+IGRpdi5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQgeyBvdXRsaW5lOiAxcHggZG90dGVkICR7c3R5bGVzLmxpc3RJbmFjdGl2ZUZvY3VzT3V0bGluZX07IG91dGxpbmUtb2Zmc2V0OiAtMXB4OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0SG92ZXJPdXRsaW5lKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSA+IGRpdi5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLm1vbmFjby1saXN0LXJvd3MgPiAubW9uYWNvLWxpc3Qtcm93OmhvdmVyIHsgb3V0bGluZTogMXB4IGRhc2hlZCAke3N0eWxlcy5saXN0SG92ZXJPdXRsaW5lfTsgb3V0bGluZS1vZmZzZXQ6IC0xcHg7IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3REcm9wT3ZlckJhY2tncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgXG5cdFx0XHRcdC5tb25hY28tbGlzdCR7c3VmZml4fS5kcm9wLXRhcmdldCxcblx0XHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9ID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93cy5kcm9wLXRhcmdldCxcblx0XHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9ID4gZGl2Lm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAubW9uYWNvLWxpc3Qtcm93LmRyb3AtdGFyZ2V0IHsgYmFja2dyb3VuZC1jb2xvcjogJHtzdHlsZXMubGlzdERyb3BPdmVyQmFja2dyb3VuZH0gIWltcG9ydGFudDsgY29sb3I6IGluaGVyaXQgIWltcG9ydGFudDsgfVxuXHRcdFx0YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3U3R5bGVzID0gY29udGVudC5qb2luKCdcXG4nKTtcblx0XHRpZiAobmV3U3R5bGVzICE9PSB0aGlzLnN0eWxlRWxlbWVudC50ZXh0Q29udGVudCkge1xuXHRcdFx0dGhpcy5zdHlsZUVsZW1lbnQudGV4dENvbnRlbnQgPSBuZXdTdHlsZXM7XG5cdFx0fVxuXHR9XG5cblx0Z2V0UmVuZGVySGVpZ2h0KCkge1xuXHRcdHJldHVybiB0aGlzLnZpZXcucmVuZGVySGVpZ2h0O1xuXHR9XG5cblx0Z2V0U2Nyb2xsSGVpZ2h0KCkge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuc2Nyb2xsSGVpZ2h0O1xuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KGhlaWdodD86IG51bWJlciwgd2lkdGg/OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0luTGF5b3V0ID0gdHJ1ZTtcblx0XHRzdXBlci5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0aWYgKHRoaXMucmVuZGVySGVpZ2h0ID09PSAwKSB7XG5cdFx0XHR0aGlzLnZpZXcuZG9tTm9kZS5zdHlsZS52aXNpYmlsaXR5ID0gJ2hpZGRlbic7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudmlldy5kb21Ob2RlLnN0eWxlLnZpc2liaWxpdHkgPSAnaW5pdGlhbCc7XG5cdFx0fVxuXHRcdHRoaXMuX2lzSW5MYXlvdXQgPSBmYWxzZTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0dGhpcy5fdmlld01vZGVsU3RvcmUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2xvY2FsRGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9ub3RlYm9va0NlbGxBbmNob3IuZGlzcG9zZSgpO1xuXHRcdHRoaXMudmlld1pvbmVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNlbGxPdmVybGF5cy5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gdW4tcmVmXG5cdFx0dGhpcy5fcHJldmlvdXNGb2N1c2VkRWxlbWVudHMgPSBbXTtcblx0XHR0aGlzLl92aWV3TW9kZWwgPSBudWxsO1xuXHRcdHRoaXMuX2hpZGRlblJhbmdlSWRzID0gW107XG5cdFx0dGhpcy5oaWRkZW5SYW5nZXNQcmVmaXhTdW0gPSBudWxsO1xuXHRcdHRoaXMuX3Zpc2libGVSYW5nZXMgPSBbXTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBMaXN0Vmlld0luZm9BY2Nlc3NvciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBsaXN0OiBJTm90ZWJvb2tDZWxsTGlzdFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Z2V0Vmlld0luZGV4KGNlbGw6IElDZWxsVmlld01vZGVsKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5saXN0LmdldFZpZXdJbmRleChjZWxsKSA/PyAtMTtcblx0fVxuXG5cdGdldFZpZXdIZWlnaHQoY2VsbDogSUNlbGxWaWV3TW9kZWwpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5saXN0LnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmxpc3QuZWxlbWVudEhlaWdodChjZWxsKTtcblx0fVxuXG5cdGdldENlbGxSYW5nZUZyb21WaWV3UmFuZ2Uoc3RhcnRJbmRleDogbnVtYmVyLCBlbmRJbmRleDogbnVtYmVyKTogSUNlbGxSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmxpc3Qudmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsSW5kZXggPSB0aGlzLmxpc3QuZ2V0TW9kZWxJbmRleDIoc3RhcnRJbmRleCk7XG5cdFx0aWYgKG1vZGVsSW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBzdGFydEluZGV4ICR7c3RhcnRJbmRleH0gb3V0IG9mIGJvdW5kYXJ5YCk7XG5cdFx0fVxuXG5cdFx0aWYgKGVuZEluZGV4ID49IHRoaXMubGlzdC5sZW5ndGgpIHtcblx0XHRcdC8vIGl0J3MgdGhlIGVuZFxuXHRcdFx0Y29uc3QgZW5kTW9kZWxJbmRleCA9IHRoaXMubGlzdC52aWV3TW9kZWwubGVuZ3RoO1xuXHRcdFx0cmV0dXJuIHsgc3RhcnQ6IG1vZGVsSW5kZXgsIGVuZDogZW5kTW9kZWxJbmRleCB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBlbmRNb2RlbEluZGV4ID0gdGhpcy5saXN0LmdldE1vZGVsSW5kZXgyKGVuZEluZGV4KTtcblx0XHRcdGlmIChlbmRNb2RlbEluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBlbmRJbmRleCAke2VuZEluZGV4fSBvdXQgb2YgYm91bmRhcnlgKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHN0YXJ0OiBtb2RlbEluZGV4LCBlbmQ6IGVuZE1vZGVsSW5kZXggfTtcblx0XHR9XG5cdH1cblxuXHRnZXRDZWxsc0Zyb21WaWV3UmFuZ2Uoc3RhcnRJbmRleDogbnVtYmVyLCBlbmRJbmRleDogbnVtYmVyKTogUmVhZG9ubHlBcnJheTxJQ2VsbFZpZXdNb2RlbD4ge1xuXHRcdGlmICghdGhpcy5saXN0LnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhbmdlID0gdGhpcy5nZXRDZWxsUmFuZ2VGcm9tVmlld1JhbmdlKHN0YXJ0SW5kZXgsIGVuZEluZGV4KTtcblx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubGlzdC52aWV3TW9kZWwuZ2V0Q2VsbHNJblJhbmdlKHJhbmdlKTtcblx0fVxuXG5cdGdldENlbGxzSW5SYW5nZShyYW5nZT86IElDZWxsUmFuZ2UpOiBSZWFkb25seUFycmF5PElDZWxsVmlld01vZGVsPiB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdC52aWV3TW9kZWw/LmdldENlbGxzSW5SYW5nZShyYW5nZSkgPz8gW107XG5cdH1cblxuXHRnZXRWaXNpYmxlUmFuZ2VzUGx1c1ZpZXdwb3J0QWJvdmVBbmRCZWxvdygpOiBJQ2VsbFJhbmdlW10ge1xuXHRcdHJldHVybiB0aGlzLmxpc3Q/LmdldFZpc2libGVSYW5nZXNQbHVzVmlld3BvcnRBYm92ZUFuZEJlbG93KCkgPz8gW107XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0RWRpdG9yQXR0YWNoZWRQcm9taXNlKGVsZW1lbnQ6IElDZWxsVmlld01vZGVsKSB7XG5cdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0RXZlbnQub25jZShlbGVtZW50Lm9uRGlkQ2hhbmdlRWRpdG9yQXR0YWNoU3RhdGUpKCgpID0+IGVsZW1lbnQuZWRpdG9yQXR0YWNoZWQgPyByZXNvbHZlKCkgOiByZWplY3QoKSk7XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxzQkFBc0I7QUFFbEMsU0FBOEMsaUJBQWlCO0FBRS9ELFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxpQkFBOEIseUJBQXlCO0FBQzVFLFNBQVMsbUJBQW1CO0FBSTVCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsY0FBcUMscUJBQXFCO0FBQ25FLFNBQVMsa0JBQWtDLGVBQXFDLGdCQUFnQixxQkFBcUIsNEJBQWlHO0FBRXROLFNBQVMsTUFBTSxpQ0FBaUMsVUFBVSxvQkFBb0IsNENBQTRDO0FBQzFILFNBQXFCLHFCQUFxQixrQkFBa0IsdUJBQXVCO0FBQ25GLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsYUFBYTtBQUd0QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUVyQyxJQUFXLHFCQUFYLGtCQUFXQSx3QkFBWDtBQUNDLEVBQUFBLHdDQUFBO0FBQ0EsRUFBQUEsd0NBQUE7QUFDQSxFQUFBQSx3Q0FBQTtBQUNBLEVBQUFBLHdDQUFBO0FB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O0FBQUEsRUFDcEM7QUFBQSxFQUVBLDBCQUEwQixZQUFvQixVQUEwQztBQUN2RixRQUFJLENBQUMsS0FBSyxLQUFLLFdBQVc7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGFBQWEsS0FBSyxLQUFLLGVBQWUsVUFBVTtBQUN0RCxRQUFJLGVBQWUsUUFBVztBQUM3QixZQUFNLElBQUksTUFBTSxjQUFjLFVBQVUsa0JBQWtCO0FBQUEsSUFDM0Q7QUFFQSxRQUFJLFlBQVksS0FBSyxLQUFLLFFBQVE7QUFFakMsWUFBTSxnQkFBZ0IsS0FBSyxLQUFLLFVBQVU7QUFDMUMsYUFBTyxFQUFFLE9BQU8sWUFBWSxLQUFLLGNBQWM7QUFBQSxJQUNoRCxPQUFPO0FBQ04sWUFBTSxnQkFBZ0IsS0FBSyxLQUFLLGVBQWUsUUFBUTtBQUN2RCxVQUFJLGtCQUFrQixRQUFXO0FBQ2hDLGNBQU0sSUFBSSxNQUFNLFlBQVksUUFBUSxrQkFBa0I7QUFBQSxNQUN2RDtBQUNBLGFBQU8sRUFBRSxPQUFPLFlBQVksS0FBSyxjQUFjO0FBQUEsSUFDaEQ7QUFBQSxFQUNEO0FBQUEsRUFFQSxzQkFBc0IsWUFBb0IsVUFBaUQ7QUFDMUYsUUFBSSxDQUFDLEtBQUssS0FBSyxXQUFXO0FBQ3pCLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxVQUFNLFFBQVEsS0FBSywwQkFBMEIsWUFBWSxRQUFRO0FBQ2pFLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFdBQU8sS0FBSyxLQUFLLFVBQVUsZ0JBQWdCLEtBQUs7QUFBQSxFQUNqRDtBQUFBLEVBRUEsZ0JBQWdCLE9BQW1EO0FBQ2xFLFdBQU8sS0FBSyxLQUFLLFdBQVcsZ0JBQWdCLEtBQUssS0FBSyxDQUFDO0FBQUEsRUFDeEQ7QUFBQSxFQUVBLDRDQUEwRDtBQUN6RCxXQUFPLEtBQUssTUFBTSwwQ0FBMEMsS0FBSyxDQUFDO0FBQUEsRUFDbkU7QUFDRDtBQUVBLFNBQVMseUJBQXlCLFNBQXlCO0FBQzFELFNBQU8sSUFBSSxRQUFjLENBQUMsU0FBUyxXQUFXO0FBQzdDLFVBQU0sS0FBSyxRQUFRLDRCQUE0QixFQUFFLE1BQU0sUUFBUSxpQkFBaUIsUUFBUSxJQUFJLE9BQU8sQ0FBQztBQUFBLEVBQ3JHLENBQUM7QUFDRjsiLAogICJuYW1lcyI6IFsiQ2VsbFJldmVhbFBvc2l0aW9uIiwgImUiLCAiZGlmZiIsICJ2aWV3SW5kZXgiLCAicmFuZ2UiLCAiZWxlbWVudCIsICJwb3NpdGlvbk9mZnNldCJdCn0K
