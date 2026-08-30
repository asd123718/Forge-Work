import * as DOM from "../../../../../../base/browser/dom.js";
import { Delayer } from "../../../../../../base/common/async.js";
import { Disposable, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import * as platform from "../../../../../../base/common/platform.js";
import { expandCellRangesWithHiddenCells } from "../../notebookBrowser.js";
import { CellContentPart } from "../cellPart.js";
import { cloneNotebookCellTextModel } from "../../../common/model/notebookCellTextModel.js";
import { CellEditType, SelectionStateType } from "../../../common/notebookCommon.js";
import { cellRangesToIndexes } from "../../../common/notebookRange.js";
const $ = DOM.$;
const DRAGGING_CLASS = "cell-dragging";
const GLOBAL_DRAG_CLASS = "global-drag-active";
class CellDragAndDropPart extends CellContentPart {
  constructor(container) {
    super();
    this.container = container;
  }
  didRenderCell(element) {
    this.update(element);
  }
  updateState(element, e) {
    if (e.dragStateChanged) {
      this.update(element);
    }
  }
  update(element) {
    this.container.classList.toggle(DRAGGING_CLASS, element.dragging);
  }
}
class CellDragAndDropController extends Disposable {
  constructor(notebookEditor, notebookListContainer) {
    super();
    this.notebookEditor = notebookEditor;
    this.notebookListContainer = notebookListContainer;
    this.draggedCells = [];
    this.isScrolling = false;
    this.listOnWillScrollListener = this._register(new MutableDisposable());
    this.listInsertionIndicator = DOM.append(notebookListContainer, $(".cell-list-insertion-indicator"));
    this._register(DOM.addDisposableListener(notebookListContainer.ownerDocument.body, DOM.EventType.DRAG_START, this.onGlobalDragStart.bind(this), true));
    this._register(DOM.addDisposableListener(notebookListContainer.ownerDocument.body, DOM.EventType.DRAG_END, this.onGlobalDragEnd.bind(this), true));
    const addCellDragListener = (eventType, handler, useCapture = false) => {
      this._register(DOM.addDisposableListener(
        notebookEditor.getDomNode(),
        eventType,
        (e) => {
          const cellDragEvent = this.toCellDragEvent(e);
          if (cellDragEvent) {
            handler(cellDragEvent);
          }
        },
        useCapture
      ));
    };
    addCellDragListener(DOM.EventType.DRAG_OVER, (event) => {
      if (!this.currentDraggedCell) {
        return;
      }
      event.browserEvent.preventDefault();
      this.onCellDragover(event);
    }, true);
    addCellDragListener(DOM.EventType.DROP, (event) => {
      if (!this.currentDraggedCell) {
        return;
      }
      event.browserEvent.preventDefault();
      this.onCellDrop(event);
    });
    addCellDragListener(DOM.EventType.DRAG_LEAVE, (event) => {
      event.browserEvent.preventDefault();
      this.onCellDragLeave(event);
    });
    this.scrollingDelayer = this._register(new Delayer(200));
  }
  setList(value) {
    this.list = value;
    this.listOnWillScrollListener.value = this.list.onWillScroll((e) => {
      if (!e.scrollTopChanged) {
        return;
      }
      this.setInsertIndicatorVisibility(false);
      this.isScrolling = true;
      this.scrollingDelayer.trigger(() => {
        this.isScrolling = false;
      });
    });
  }
  setInsertIndicatorVisibility(visible) {
    this.listInsertionIndicator.style.opacity = visible ? "1" : "0";
  }
  toCellDragEvent(event) {
    const targetTop = this.notebookListContainer.getBoundingClientRect().top;
    const dragOffset = this.list.scrollTop + event.clientY - targetTop;
    const draggedOverCell = this.list.elementAt(dragOffset);
    if (!draggedOverCell) {
      return void 0;
    }
    const cellTop = this.list.getCellViewScrollTop(draggedOverCell);
    const cellHeight = this.list.elementHeight(draggedOverCell);
    const dragPosInElement = dragOffset - cellTop;
    const dragPosRatio = dragPosInElement / cellHeight;
    return {
      browserEvent: event,
      draggedOverCell,
      cellTop,
      cellHeight,
      dragPosRatio
    };
  }
  clearGlobalDragState() {
    this.notebookEditor.getDomNode().classList.remove(GLOBAL_DRAG_CLASS);
  }
  onGlobalDragStart() {
    this.notebookEditor.getDomNode().classList.add(GLOBAL_DRAG_CLASS);
  }
  onGlobalDragEnd() {
    this.notebookEditor.getDomNode().classList.remove(GLOBAL_DRAG_CLASS);
  }
  onCellDragover(event) {
    if (!event.browserEvent.dataTransfer) {
      return;
    }
    if (!this.currentDraggedCell) {
      event.browserEvent.dataTransfer.dropEffect = "none";
      return;
    }
    if (this.isScrolling || this.currentDraggedCell === event.draggedOverCell) {
      this.setInsertIndicatorVisibility(false);
      return;
    }
    const dropDirection = this.getDropInsertDirection(event.dragPosRatio);
    const insertionIndicatorAbsolutePos = dropDirection === "above" ? event.cellTop : event.cellTop + event.cellHeight;
    this.updateInsertIndicator(dropDirection, insertionIndicatorAbsolutePos);
  }
  updateInsertIndicator(dropDirection, insertionIndicatorAbsolutePos) {
    const { bottomToolbarGap } = this.notebookEditor.notebookOptions.computeBottomToolbarDimensions(this.notebookEditor.textModel?.viewType);
    const insertionIndicatorTop = insertionIndicatorAbsolutePos - this.list.scrollTop + bottomToolbarGap / 2;
    if (insertionIndicatorTop >= 0) {
      this.listInsertionIndicator.style.top = `${insertionIndicatorTop}px`;
      this.setInsertIndicatorVisibility(true);
    } else {
      this.setInsertIndicatorVisibility(false);
    }
  }
  getDropInsertDirection(dragPosRatio) {
    return dragPosRatio < 0.5 ? "above" : "below";
  }
  onCellDrop(event) {
    const draggedCell = this.currentDraggedCell;
    if (this.isScrolling || this.currentDraggedCell === event.draggedOverCell) {
      return;
    }
    this.dragCleanup();
    const dropDirection = this.getDropInsertDirection(event.dragPosRatio);
    this._dropImpl(draggedCell, dropDirection, event.browserEvent, event.draggedOverCell);
  }
  getCellRangeAroundDragTarget(draggedCellIndex) {
    const selections = this.notebookEditor.getSelections();
    const modelRanges = expandCellRangesWithHiddenCells(this.notebookEditor, selections);
    const nearestRange = modelRanges.find((range) => range.start <= draggedCellIndex && draggedCellIndex < range.end);
    if (nearestRange) {
      return nearestRange;
    } else {
      return { start: draggedCellIndex, end: draggedCellIndex + 1 };
    }
  }
  _dropImpl(draggedCell, dropDirection, ctx, draggedOverCell) {
    const cellTop = this.list.getCellViewScrollTop(draggedOverCell);
    const cellHeight = this.list.elementHeight(draggedOverCell);
    const insertionIndicatorAbsolutePos = dropDirection === "above" ? cellTop : cellTop + cellHeight;
    const { bottomToolbarGap } = this.notebookEditor.notebookOptions.computeBottomToolbarDimensions(this.notebookEditor.textModel?.viewType);
    const insertionIndicatorTop = insertionIndicatorAbsolutePos - this.list.scrollTop + bottomToolbarGap / 2;
    const editorHeight = this.notebookEditor.getDomNode().getBoundingClientRect().height;
    if (insertionIndicatorTop < 0 || insertionIndicatorTop > editorHeight) {
      return;
    }
    const isCopy = ctx.ctrlKey && !platform.isMacintosh || ctx.altKey && platform.isMacintosh;
    if (!this.notebookEditor.hasModel()) {
      return;
    }
    const textModel = this.notebookEditor.textModel;
    if (isCopy) {
      const draggedCellIndex = this.notebookEditor.getCellIndex(draggedCell);
      const range = this.getCellRangeAroundDragTarget(draggedCellIndex);
      let originalToIdx = this.notebookEditor.getCellIndex(draggedOverCell);
      if (dropDirection === "below") {
        const relativeToIndex = this.notebookEditor.getCellIndex(draggedOverCell);
        const newIdx = this.notebookEditor.getNextVisibleCellIndex(relativeToIndex);
        originalToIdx = newIdx;
      }
      let finalSelection;
      let finalFocus;
      if (originalToIdx <= range.start) {
        finalSelection = { start: originalToIdx, end: originalToIdx + range.end - range.start };
        finalFocus = { start: originalToIdx + draggedCellIndex - range.start, end: originalToIdx + draggedCellIndex - range.start + 1 };
      } else {
        const delta = originalToIdx - range.start;
        finalSelection = { start: range.start + delta, end: range.end + delta };
        finalFocus = { start: draggedCellIndex + delta, end: draggedCellIndex + delta + 1 };
      }
      textModel.applyEdits([
        {
          editType: CellEditType.Replace,
          index: originalToIdx,
          count: 0,
          cells: cellRangesToIndexes([range]).map((index) => cloneNotebookCellTextModel(this.notebookEditor.cellAt(index).model))
        }
      ], true, { kind: SelectionStateType.Index, focus: this.notebookEditor.getFocus(), selections: this.notebookEditor.getSelections() }, () => ({ kind: SelectionStateType.Index, focus: finalFocus, selections: [finalSelection] }), void 0, true);
      this.notebookEditor.revealCellRangeInView(finalSelection);
    } else {
      performCellDropEdits(this.notebookEditor, draggedCell, dropDirection, draggedOverCell);
    }
  }
  onCellDragLeave(event) {
    if (!event.browserEvent.relatedTarget || !DOM.isAncestor(event.browserEvent.relatedTarget, this.notebookEditor.getDomNode())) {
      this.setInsertIndicatorVisibility(false);
    }
  }
  dragCleanup() {
    if (this.currentDraggedCell) {
      this.draggedCells.forEach((cell) => cell.dragging = false);
      this.currentDraggedCell = void 0;
      this.draggedCells = [];
    }
    this.setInsertIndicatorVisibility(false);
  }
  registerDragHandle(templateData, cellRoot, dragHandles, dragImageProvider) {
    const container = templateData.container;
    for (const dragHandle of dragHandles) {
      dragHandle.setAttribute("draggable", "true");
    }
    const onDragEnd = () => {
      if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
        return;
      }
      container.classList.remove(DRAGGING_CLASS);
      this.dragCleanup();
    };
    for (const dragHandle of dragHandles) {
      templateData.templateDisposables.add(DOM.addDisposableListener(dragHandle, DOM.EventType.DRAG_END, onDragEnd));
    }
    const onDragStart = (event) => {
      if (!event.dataTransfer) {
        return;
      }
      if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
        return;
      }
      this.currentDraggedCell = templateData.currentRenderedCell;
      this.draggedCells = this.notebookEditor.getSelections().map((range) => this.notebookEditor.getCellsInRange(range)).flat();
      this.draggedCells.forEach((cell) => cell.dragging = true);
      const dragImage = dragImageProvider();
      cellRoot.parentElement.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => dragImage.remove(), 0);
    };
    for (const dragHandle of dragHandles) {
      templateData.templateDisposables.add(DOM.addDisposableListener(dragHandle, DOM.EventType.DRAG_START, onDragStart));
    }
  }
  startExplicitDrag(cell, _dragOffsetY) {
    if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
      return;
    }
    this.currentDraggedCell = cell;
    this.setInsertIndicatorVisibility(true);
  }
  explicitDrag(cell, dragOffsetY) {
    if (!this.notebookEditor.notebookOptions.getDisplayOptions().dragAndDropEnabled || !!this.notebookEditor.isReadOnly) {
      return;
    }
    const target = this.list.elementAt(dragOffsetY);
    if (target && target !== cell) {
      const cellTop = this.list.getCellViewScrollTop(target);
      const cellHeight = this.list.elementHeight(target);
      const dropDirection = this.getExplicitDragDropDirection(dragOffsetY, cellTop, cellHeight);
      const insertionIndicatorAbsolutePos = dropDirection === "above" ? cellTop : cellTop + cellHeight;
      this.updateInsertIndicator(dropDirection, insertionIndicatorAbsolutePos);
    }
    if (this.currentDraggedCell !== cell) {
      return;
    }
    const notebookViewRect = this.notebookEditor.getDomNode().getBoundingClientRect();
    const eventPositionInView = dragOffsetY - this.list.scrollTop;
    const notebookViewScrollMargins = 0.2;
    const maxScrollDeltaPerFrame = 20;
    const eventPositionRatio = eventPositionInView / notebookViewRect.height;
    if (eventPositionRatio < notebookViewScrollMargins) {
      this.list.scrollTop -= maxScrollDeltaPerFrame * (1 - eventPositionRatio / notebookViewScrollMargins);
    } else if (eventPositionRatio > 1 - notebookViewScrollMargins) {
      this.list.scrollTop += maxScrollDeltaPerFrame * (1 - (1 - eventPositionRatio) / notebookViewScrollMargins);
    }
  }
  endExplicitDrag(_cell) {
    this.setInsertIndicatorVisibility(false);
  }
  explicitDrop(cell, ctx) {
    this.currentDraggedCell = void 0;
    this.setInsertIndicatorVisibility(false);
    const target = this.list.elementAt(ctx.dragOffsetY);
    if (!target || target === cell) {
      return;
    }
    const cellTop = this.list.getCellViewScrollTop(target);
    const cellHeight = this.list.elementHeight(target);
    const dropDirection = this.getExplicitDragDropDirection(ctx.dragOffsetY, cellTop, cellHeight);
    this._dropImpl(cell, dropDirection, ctx, target);
  }
  getExplicitDragDropDirection(clientY, cellTop, cellHeight) {
    const dragPosInElement = clientY - cellTop;
    const dragPosRatio = dragPosInElement / cellHeight;
    return this.getDropInsertDirection(dragPosRatio);
  }
  dispose() {
    this.notebookEditor = null;
    super.dispose();
  }
}
function performCellDropEdits(editor, draggedCell, dropDirection, draggedOverCell) {
  const draggedCellIndex = editor.getCellIndex(draggedCell);
  let originalToIdx = editor.getCellIndex(draggedOverCell);
  if (typeof draggedCellIndex !== "number" || typeof originalToIdx !== "number") {
    return;
  }
  if (dropDirection === "below") {
    const newIdx = editor.getNextVisibleCellIndex(originalToIdx) ?? originalToIdx;
    originalToIdx = newIdx;
  }
  let selections = editor.getSelections();
  if (!selections.length) {
    selections = [editor.getFocus()];
  }
  let originalFocusIdx = editor.getFocus().start;
  if (!selections.some((s) => s.start <= draggedCellIndex && s.end > draggedCellIndex)) {
    selections = [{ start: draggedCellIndex, end: draggedCellIndex + 1 }];
    originalFocusIdx = draggedCellIndex;
  }
  const droppedInSelection = selections.find((range) => range.start <= originalToIdx && range.end > originalToIdx);
  if (droppedInSelection) {
    originalToIdx = droppedInSelection.start;
  }
  let numCells = 0;
  let focusNewIdx = originalToIdx;
  let newInsertionIdx = originalToIdx;
  selections.sort((a, b) => b.start - a.start);
  const edits = selections.map((range) => {
    const length = range.end - range.start;
    let toIndexDelta = 0;
    if (range.end <= newInsertionIdx) {
      toIndexDelta = -length;
    }
    const newIdx = newInsertionIdx + toIndexDelta;
    if (originalFocusIdx >= range.start && originalFocusIdx <= range.end) {
      const offset = originalFocusIdx - range.start;
      focusNewIdx = newIdx + offset;
    }
    const fromIndexDelta = range.start >= originalToIdx ? numCells : 0;
    const edit = {
      editType: CellEditType.Move,
      index: range.start + fromIndexDelta,
      length,
      newIdx
    };
    numCells += length;
    if (range.end < newInsertionIdx) {
      newInsertionIdx -= length;
    }
    return edit;
  });
  const lastEdit = edits[edits.length - 1];
  const finalSelection = { start: lastEdit.newIdx, end: lastEdit.newIdx + numCells };
  const finalFocus = { start: focusNewIdx, end: focusNewIdx + 1 };
  editor.textModel.applyEdits(
    edits,
    true,
    { kind: SelectionStateType.Index, focus: editor.getFocus(), selections: editor.getSelections() },
    () => ({ kind: SelectionStateType.Index, focus: finalFocus, selections: [finalSelection] }),
    void 0,
    true
  );
  editor.revealCellRangeInView(finalSelection);
}
export {
  CellDragAndDropController,
  CellDragAndDropPart,
  performCellDropEdits
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3XFxjZWxsUGFydHNcXGNlbGxEbmQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZXhwYW5kQ2VsbFJhbmdlc1dpdGhIaWRkZW5DZWxscywgSUNlbGxWaWV3TW9kZWwsIElOb3RlYm9va0VkaXRvckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IENlbGxWaWV3TW9kZWxTdGF0ZUNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tWaWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IENlbGxDb250ZW50UGFydCB9IGZyb20gJy4uL2NlbGxQYXJ0LmpzJztcbmltcG9ydCB7IEJhc2VDZWxsUmVuZGVyVGVtcGxhdGUsIElOb3RlYm9va0NlbGxMaXN0IH0gZnJvbSAnLi4vbm90ZWJvb2tSZW5kZXJpbmdDb21tb24uanMnO1xuaW1wb3J0IHsgY2xvbmVOb3RlYm9va0NlbGxUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tDZWxsVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgSUNlbGxNb3ZlRWRpdCwgU2VsZWN0aW9uU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IGNlbGxSYW5nZXNUb0luZGV4ZXMsIElDZWxsUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tSYW5nZS5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuY29uc3QgRFJBR0dJTkdfQ0xBU1MgPSAnY2VsbC1kcmFnZ2luZyc7XG5jb25zdCBHTE9CQUxfRFJBR19DTEFTUyA9ICdnbG9iYWwtZHJhZy1hY3RpdmUnO1xuXG50eXBlIERyYWdJbWFnZVByb3ZpZGVyID0gKCkgPT4gSFRNTEVsZW1lbnQ7XG5cbmludGVyZmFjZSBDZWxsRHJhZ0V2ZW50IHtcblx0YnJvd3NlckV2ZW50OiBEcmFnRXZlbnQ7XG5cdGRyYWdnZWRPdmVyQ2VsbDogSUNlbGxWaWV3TW9kZWw7XG5cdGNlbGxUb3A6IG51bWJlcjtcblx0Y2VsbEhlaWdodDogbnVtYmVyO1xuXHRkcmFnUG9zUmF0aW86IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIENlbGxEcmFnQW5kRHJvcFBhcnQgZXh0ZW5kcyBDZWxsQ29udGVudFBhcnQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnRcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpZFJlbmRlckNlbGwoZWxlbWVudDogSUNlbGxWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZShlbGVtZW50KTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0YXRlKGVsZW1lbnQ6IElDZWxsVmlld01vZGVsLCBlOiBDZWxsVmlld01vZGVsU3RhdGVDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmRyYWdTdGF0ZUNoYW5nZWQpIHtcblx0XHRcdHRoaXMudXBkYXRlKGVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKGVsZW1lbnQ6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShEUkFHR0lOR19DTEFTUywgZWxlbWVudC5kcmFnZ2luZyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENlbGxEcmFnQW5kRHJvcENvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Ly8gVE9ET0Byb2Jsb3VyZW5zIC0gc2hvdWxkIHByb2JhYmx5IHVzZSBkYXRhVHJhbnNmZXIgaGVyZSwgYnV0IGFueSBkYXRhVHJhbnNmZXIgc2V0IG1ha2VzIHRoZSBlZGl0b3IgdGhpbmsgSSBhbSBkcm9wcGluZyBhIGZpbGUsIG5lZWRcblx0Ly8gdG8gZmlndXJlIG91dCBob3cgdG8gcHJldmVudCB0aGF0XG5cdHByaXZhdGUgY3VycmVudERyYWdnZWRDZWxsOiBJQ2VsbFZpZXdNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkcmFnZ2VkQ2VsbHM6IElDZWxsVmlld01vZGVsW10gPSBbXTtcblxuXHRwcml2YXRlIGxpc3RJbnNlcnRpb25JbmRpY2F0b3I6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgbGlzdCE6IElOb3RlYm9va0NlbGxMaXN0O1xuXG5cdHByaXZhdGUgaXNTY3JvbGxpbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBzY3JvbGxpbmdEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbGlzdE9uV2lsbFNjcm9sbExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tMaXN0Q29udGFpbmVyOiBIVE1MRWxlbWVudFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5saXN0SW5zZXJ0aW9uSW5kaWNhdG9yID0gRE9NLmFwcGVuZChub3RlYm9va0xpc3RDb250YWluZXIsICQoJy5jZWxsLWxpc3QtaW5zZXJ0aW9uLWluZGljYXRvcicpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobm90ZWJvb2tMaXN0Q29udGFpbmVyLm93bmVyRG9jdW1lbnQuYm9keSwgRE9NLkV2ZW50VHlwZS5EUkFHX1NUQVJULCB0aGlzLm9uR2xvYmFsRHJhZ1N0YXJ0LmJpbmQodGhpcyksIHRydWUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG5vdGVib29rTGlzdENvbnRhaW5lci5vd25lckRvY3VtZW50LmJvZHksIERPTS5FdmVudFR5cGUuRFJBR19FTkQsIHRoaXMub25HbG9iYWxEcmFnRW5kLmJpbmQodGhpcyksIHRydWUpKTtcblxuXHRcdGNvbnN0IGFkZENlbGxEcmFnTGlzdGVuZXIgPSAoZXZlbnRUeXBlOiBzdHJpbmcsIGhhbmRsZXI6IChlOiBDZWxsRHJhZ0V2ZW50KSA9PiB2b2lkLCB1c2VDYXB0dXJlID0gZmFsc2UpID0+IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoXG5cdFx0XHRcdG5vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKSxcblx0XHRcdFx0ZXZlbnRUeXBlLFxuXHRcdFx0XHRlID0+IHtcblx0XHRcdFx0XHRjb25zdCBjZWxsRHJhZ0V2ZW50ID0gdGhpcy50b0NlbGxEcmFnRXZlbnQoZSk7XG5cdFx0XHRcdFx0aWYgKGNlbGxEcmFnRXZlbnQpIHtcblx0XHRcdFx0XHRcdGhhbmRsZXIoY2VsbERyYWdFdmVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCB1c2VDYXB0dXJlKSk7XG5cdFx0fTtcblxuXHRcdGFkZENlbGxEcmFnTGlzdGVuZXIoRE9NLkV2ZW50VHlwZS5EUkFHX09WRVIsIGV2ZW50ID0+IHtcblx0XHRcdGlmICghdGhpcy5jdXJyZW50RHJhZ2dlZENlbGwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZXZlbnQuYnJvd3NlckV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLm9uQ2VsbERyYWdvdmVyKGV2ZW50KTtcblx0XHR9LCB0cnVlKTtcblx0XHRhZGRDZWxsRHJhZ0xpc3RlbmVyKERPTS5FdmVudFR5cGUuRFJPUCwgZXZlbnQgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmN1cnJlbnREcmFnZ2VkQ2VsbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRldmVudC5icm93c2VyRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRoaXMub25DZWxsRHJvcChldmVudCk7XG5cdFx0fSk7XG5cdFx0YWRkQ2VsbERyYWdMaXN0ZW5lcihET00uRXZlbnRUeXBlLkRSQUdfTEVBVkUsIGV2ZW50ID0+IHtcblx0XHRcdGV2ZW50LmJyb3dzZXJFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5vbkNlbGxEcmFnTGVhdmUoZXZlbnQpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5zY3JvbGxpbmdEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXIoMjAwKSk7XG5cdH1cblxuXHRzZXRMaXN0KHZhbHVlOiBJTm90ZWJvb2tDZWxsTGlzdCkge1xuXHRcdHRoaXMubGlzdCA9IHZhbHVlO1xuXG5cdFx0dGhpcy5saXN0T25XaWxsU2Nyb2xsTGlzdGVuZXIudmFsdWUgPSB0aGlzLmxpc3Qub25XaWxsU2Nyb2xsKGUgPT4ge1xuXHRcdFx0aWYgKCFlLnNjcm9sbFRvcENoYW5nZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNldEluc2VydEluZGljYXRvclZpc2liaWxpdHkoZmFsc2UpO1xuXHRcdFx0dGhpcy5pc1Njcm9sbGluZyA9IHRydWU7XG5cdFx0XHR0aGlzLnNjcm9sbGluZ0RlbGF5ZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaXNTY3JvbGxpbmcgPSBmYWxzZTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRJbnNlcnRJbmRpY2F0b3JWaXNpYmlsaXR5KHZpc2libGU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLmxpc3RJbnNlcnRpb25JbmRpY2F0b3Iuc3R5bGUub3BhY2l0eSA9IHZpc2libGUgPyAnMScgOiAnMCc7XG5cdH1cblxuXHRwcml2YXRlIHRvQ2VsbERyYWdFdmVudChldmVudDogRHJhZ0V2ZW50KTogQ2VsbERyYWdFdmVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdGFyZ2V0VG9wID0gdGhpcy5ub3RlYm9va0xpc3RDb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wO1xuXHRcdGNvbnN0IGRyYWdPZmZzZXQgPSB0aGlzLmxpc3Quc2Nyb2xsVG9wICsgZXZlbnQuY2xpZW50WSAtIHRhcmdldFRvcDtcblx0XHRjb25zdCBkcmFnZ2VkT3ZlckNlbGwgPSB0aGlzLmxpc3QuZWxlbWVudEF0KGRyYWdPZmZzZXQpO1xuXHRcdGlmICghZHJhZ2dlZE92ZXJDZWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNlbGxUb3AgPSB0aGlzLmxpc3QuZ2V0Q2VsbFZpZXdTY3JvbGxUb3AoZHJhZ2dlZE92ZXJDZWxsKTtcblx0XHRjb25zdCBjZWxsSGVpZ2h0ID0gdGhpcy5saXN0LmVsZW1lbnRIZWlnaHQoZHJhZ2dlZE92ZXJDZWxsKTtcblxuXHRcdGNvbnN0IGRyYWdQb3NJbkVsZW1lbnQgPSBkcmFnT2Zmc2V0IC0gY2VsbFRvcDtcblx0XHRjb25zdCBkcmFnUG9zUmF0aW8gPSBkcmFnUG9zSW5FbGVtZW50IC8gY2VsbEhlaWdodDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRicm93c2VyRXZlbnQ6IGV2ZW50LFxuXHRcdFx0ZHJhZ2dlZE92ZXJDZWxsLFxuXHRcdFx0Y2VsbFRvcCxcblx0XHRcdGNlbGxIZWlnaHQsXG5cdFx0XHRkcmFnUG9zUmF0aW9cblx0XHR9O1xuXHR9XG5cblx0Y2xlYXJHbG9iYWxEcmFnU3RhdGUoKSB7XG5cdFx0dGhpcy5ub3RlYm9va0VkaXRvci5nZXREb21Ob2RlKCkuY2xhc3NMaXN0LnJlbW92ZShHTE9CQUxfRFJBR19DTEFTUyk7XG5cdH1cblxuXHRwcml2YXRlIG9uR2xvYmFsRHJhZ1N0YXJ0KCkge1xuXHRcdHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0RG9tTm9kZSgpLmNsYXNzTGlzdC5hZGQoR0xPQkFMX0RSQUdfQ0xBU1MpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkdsb2JhbERyYWdFbmQoKSB7XG5cdFx0dGhpcy5ub3RlYm9va0VkaXRvci5nZXREb21Ob2RlKCkuY2xhc3NMaXN0LnJlbW92ZShHTE9CQUxfRFJBR19DTEFTUyk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ2VsbERyYWdvdmVyKGV2ZW50OiBDZWxsRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCFldmVudC5icm93c2VyRXZlbnQuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmN1cnJlbnREcmFnZ2VkQ2VsbCkge1xuXHRcdFx0ZXZlbnQuYnJvd3NlckV2ZW50LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ25vbmUnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzU2Nyb2xsaW5nIHx8IHRoaXMuY3VycmVudERyYWdnZWRDZWxsID09PSBldmVudC5kcmFnZ2VkT3ZlckNlbGwpIHtcblx0XHRcdHRoaXMuc2V0SW5zZXJ0SW5kaWNhdG9yVmlzaWJpbGl0eShmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZHJvcERpcmVjdGlvbiA9IHRoaXMuZ2V0RHJvcEluc2VydERpcmVjdGlvbihldmVudC5kcmFnUG9zUmF0aW8pO1xuXHRcdGNvbnN0IGluc2VydGlvbkluZGljYXRvckFic29sdXRlUG9zID0gZHJvcERpcmVjdGlvbiA9PT0gJ2Fib3ZlJyA/IGV2ZW50LmNlbGxUb3AgOiBldmVudC5jZWxsVG9wICsgZXZlbnQuY2VsbEhlaWdodDtcblx0XHR0aGlzLnVwZGF0ZUluc2VydEluZGljYXRvcihkcm9wRGlyZWN0aW9uLCBpbnNlcnRpb25JbmRpY2F0b3JBYnNvbHV0ZVBvcyk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUluc2VydEluZGljYXRvcihkcm9wRGlyZWN0aW9uOiBzdHJpbmcsIGluc2VydGlvbkluZGljYXRvckFic29sdXRlUG9zOiBudW1iZXIpIHtcblx0XHRjb25zdCB7IGJvdHRvbVRvb2xiYXJHYXAgfSA9IHRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLmNvbXB1dGVCb3R0b21Ub29sYmFyRGltZW5zaW9ucyh0aGlzLm5vdGVib29rRWRpdG9yLnRleHRNb2RlbD8udmlld1R5cGUpO1xuXHRcdGNvbnN0IGluc2VydGlvbkluZGljYXRvclRvcCA9IGluc2VydGlvbkluZGljYXRvckFic29sdXRlUG9zIC0gdGhpcy5saXN0LnNjcm9sbFRvcCArIGJvdHRvbVRvb2xiYXJHYXAgLyAyO1xuXHRcdGlmIChpbnNlcnRpb25JbmRpY2F0b3JUb3AgPj0gMCkge1xuXHRcdFx0dGhpcy5saXN0SW5zZXJ0aW9uSW5kaWNhdG9yLnN0eWxlLnRvcCA9IGAke2luc2VydGlvbkluZGljYXRvclRvcH1weGA7XG5cdFx0XHR0aGlzLnNldEluc2VydEluZGljYXRvclZpc2liaWxpdHkodHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2V0SW5zZXJ0SW5kaWNhdG9yVmlzaWJpbGl0eShmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXREcm9wSW5zZXJ0RGlyZWN0aW9uKGRyYWdQb3NSYXRpbzogbnVtYmVyKTogJ2Fib3ZlJyB8ICdiZWxvdycge1xuXHRcdHJldHVybiBkcmFnUG9zUmF0aW8gPCAwLjUgPyAnYWJvdmUnIDogJ2JlbG93Jztcblx0fVxuXG5cdHByaXZhdGUgb25DZWxsRHJvcChldmVudDogQ2VsbERyYWdFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGRyYWdnZWRDZWxsID0gdGhpcy5jdXJyZW50RHJhZ2dlZENlbGwhO1xuXG5cdFx0aWYgKHRoaXMuaXNTY3JvbGxpbmcgfHwgdGhpcy5jdXJyZW50RHJhZ2dlZENlbGwgPT09IGV2ZW50LmRyYWdnZWRPdmVyQ2VsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZHJhZ0NsZWFudXAoKTtcblxuXHRcdGNvbnN0IGRyb3BEaXJlY3Rpb24gPSB0aGlzLmdldERyb3BJbnNlcnREaXJlY3Rpb24oZXZlbnQuZHJhZ1Bvc1JhdGlvKTtcblx0XHR0aGlzLl9kcm9wSW1wbChkcmFnZ2VkQ2VsbCwgZHJvcERpcmVjdGlvbiwgZXZlbnQuYnJvd3NlckV2ZW50LCBldmVudC5kcmFnZ2VkT3ZlckNlbGwpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDZWxsUmFuZ2VBcm91bmREcmFnVGFyZ2V0KGRyYWdnZWRDZWxsSW5kZXg6IG51bWJlcikge1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRjb25zdCBtb2RlbFJhbmdlcyA9IGV4cGFuZENlbGxSYW5nZXNXaXRoSGlkZGVuQ2VsbHModGhpcy5ub3RlYm9va0VkaXRvciwgc2VsZWN0aW9ucyk7XG5cdFx0Y29uc3QgbmVhcmVzdFJhbmdlID0gbW9kZWxSYW5nZXMuZmluZChyYW5nZSA9PiByYW5nZS5zdGFydCA8PSBkcmFnZ2VkQ2VsbEluZGV4ICYmIGRyYWdnZWRDZWxsSW5kZXggPCByYW5nZS5lbmQpO1xuXG5cdFx0aWYgKG5lYXJlc3RSYW5nZSkge1xuXHRcdFx0cmV0dXJuIG5lYXJlc3RSYW5nZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHsgc3RhcnQ6IGRyYWdnZWRDZWxsSW5kZXgsIGVuZDogZHJhZ2dlZENlbGxJbmRleCArIDEgfTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kcm9wSW1wbChkcmFnZ2VkQ2VsbDogSUNlbGxWaWV3TW9kZWwsIGRyb3BEaXJlY3Rpb246ICdhYm92ZScgfCAnYmVsb3cnLCBjdHg6IHsgY3RybEtleTogYm9vbGVhbjsgYWx0S2V5OiBib29sZWFuIH0sIGRyYWdnZWRPdmVyQ2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHRjb25zdCBjZWxsVG9wID0gdGhpcy5saXN0LmdldENlbGxWaWV3U2Nyb2xsVG9wKGRyYWdnZWRPdmVyQ2VsbCk7XG5cdFx0Y29uc3QgY2VsbEhlaWdodCA9IHRoaXMubGlzdC5lbGVtZW50SGVpZ2h0KGRyYWdnZWRPdmVyQ2VsbCk7XG5cdFx0Y29uc3QgaW5zZXJ0aW9uSW5kaWNhdG9yQWJzb2x1dGVQb3MgPSBkcm9wRGlyZWN0aW9uID09PSAnYWJvdmUnID8gY2VsbFRvcCA6IGNlbGxUb3AgKyBjZWxsSGVpZ2h0O1xuXHRcdGNvbnN0IHsgYm90dG9tVG9vbGJhckdhcCB9ID0gdGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuY29tcHV0ZUJvdHRvbVRvb2xiYXJEaW1lbnNpb25zKHRoaXMubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsPy52aWV3VHlwZSk7XG5cdFx0Y29uc3QgaW5zZXJ0aW9uSW5kaWNhdG9yVG9wID0gaW5zZXJ0aW9uSW5kaWNhdG9yQWJzb2x1dGVQb3MgLSB0aGlzLmxpc3Quc2Nyb2xsVG9wICsgYm90dG9tVG9vbGJhckdhcCAvIDI7XG5cdFx0Y29uc3QgZWRpdG9ySGVpZ2h0ID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXREb21Ob2RlKCkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkuaGVpZ2h0O1xuXHRcdGlmIChpbnNlcnRpb25JbmRpY2F0b3JUb3AgPCAwIHx8IGluc2VydGlvbkluZGljYXRvclRvcCA+IGVkaXRvckhlaWdodCkge1xuXHRcdFx0Ly8gSWdub3JlIGRyb3AsIGluc2VydGlvbiBwb2ludCBpcyBvZmYtc2NyZWVuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNDb3B5ID0gKGN0eC5jdHJsS2V5ICYmICFwbGF0Zm9ybS5pc01hY2ludG9zaCkgfHwgKGN0eC5hbHRLZXkgJiYgcGxhdGZvcm0uaXNNYWNpbnRvc2gpO1xuXG5cdFx0aWYgKCF0aGlzLm5vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLm5vdGVib29rRWRpdG9yLnRleHRNb2RlbDtcblxuXHRcdGlmIChpc0NvcHkpIHtcblx0XHRcdGNvbnN0IGRyYWdnZWRDZWxsSW5kZXggPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxJbmRleChkcmFnZ2VkQ2VsbCk7XG5cdFx0XHRjb25zdCByYW5nZSA9IHRoaXMuZ2V0Q2VsbFJhbmdlQXJvdW5kRHJhZ1RhcmdldChkcmFnZ2VkQ2VsbEluZGV4KTtcblxuXHRcdFx0bGV0IG9yaWdpbmFsVG9JZHggPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxJbmRleChkcmFnZ2VkT3ZlckNlbGwpO1xuXHRcdFx0aWYgKGRyb3BEaXJlY3Rpb24gPT09ICdiZWxvdycpIHtcblx0XHRcdFx0Y29uc3QgcmVsYXRpdmVUb0luZGV4ID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgoZHJhZ2dlZE92ZXJDZWxsKTtcblx0XHRcdFx0Y29uc3QgbmV3SWR4ID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXROZXh0VmlzaWJsZUNlbGxJbmRleChyZWxhdGl2ZVRvSW5kZXgpO1xuXHRcdFx0XHRvcmlnaW5hbFRvSWR4ID0gbmV3SWR4O1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZmluYWxTZWxlY3Rpb246IElDZWxsUmFuZ2U7XG5cdFx0XHRsZXQgZmluYWxGb2N1czogSUNlbGxSYW5nZTtcblxuXHRcdFx0aWYgKG9yaWdpbmFsVG9JZHggPD0gcmFuZ2Uuc3RhcnQpIHtcblx0XHRcdFx0ZmluYWxTZWxlY3Rpb24gPSB7IHN0YXJ0OiBvcmlnaW5hbFRvSWR4LCBlbmQ6IG9yaWdpbmFsVG9JZHggKyByYW5nZS5lbmQgLSByYW5nZS5zdGFydCB9O1xuXHRcdFx0XHRmaW5hbEZvY3VzID0geyBzdGFydDogb3JpZ2luYWxUb0lkeCArIGRyYWdnZWRDZWxsSW5kZXggLSByYW5nZS5zdGFydCwgZW5kOiBvcmlnaW5hbFRvSWR4ICsgZHJhZ2dlZENlbGxJbmRleCAtIHJhbmdlLnN0YXJ0ICsgMSB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZGVsdGEgPSAob3JpZ2luYWxUb0lkeCAtIHJhbmdlLnN0YXJ0KTtcblx0XHRcdFx0ZmluYWxTZWxlY3Rpb24gPSB7IHN0YXJ0OiByYW5nZS5zdGFydCArIGRlbHRhLCBlbmQ6IHJhbmdlLmVuZCArIGRlbHRhIH07XG5cdFx0XHRcdGZpbmFsRm9jdXMgPSB7IHN0YXJ0OiBkcmFnZ2VkQ2VsbEluZGV4ICsgZGVsdGEsIGVuZDogZHJhZ2dlZENlbGxJbmRleCArIGRlbHRhICsgMSB9O1xuXHRcdFx0fVxuXG5cdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IG9yaWdpbmFsVG9JZHgsXG5cdFx0XHRcdFx0Y291bnQ6IDAsXG5cdFx0XHRcdFx0Y2VsbHM6IGNlbGxSYW5nZXNUb0luZGV4ZXMoW3JhbmdlXSkubWFwKGluZGV4ID0+IGNsb25lTm90ZWJvb2tDZWxsVGV4dE1vZGVsKHRoaXMubm90ZWJvb2tFZGl0b3IuY2VsbEF0KGluZGV4KSEubW9kZWwpKVxuXHRcdFx0XHR9XG5cdFx0XHRdLCB0cnVlLCB7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Rm9jdXMoKSwgc2VsZWN0aW9uczogdGhpcy5ub3RlYm9va0VkaXRvci5nZXRTZWxlY3Rpb25zKCkgfSwgKCkgPT4gKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogZmluYWxGb2N1cywgc2VsZWN0aW9uczogW2ZpbmFsU2VsZWN0aW9uXSB9KSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IucmV2ZWFsQ2VsbFJhbmdlSW5WaWV3KGZpbmFsU2VsZWN0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cGVyZm9ybUNlbGxEcm9wRWRpdHModGhpcy5ub3RlYm9va0VkaXRvciwgZHJhZ2dlZENlbGwsIGRyb3BEaXJlY3Rpb24sIGRyYWdnZWRPdmVyQ2VsbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkNlbGxEcmFnTGVhdmUoZXZlbnQ6IENlbGxEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIWV2ZW50LmJyb3dzZXJFdmVudC5yZWxhdGVkVGFyZ2V0IHx8ICFET00uaXNBbmNlc3RvcihldmVudC5icm93c2VyRXZlbnQucmVsYXRlZFRhcmdldCBhcyBIVE1MRWxlbWVudCwgdGhpcy5ub3RlYm9va0VkaXRvci5nZXREb21Ob2RlKCkpKSB7XG5cdFx0XHR0aGlzLnNldEluc2VydEluZGljYXRvclZpc2liaWxpdHkoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZHJhZ0NsZWFudXAoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY3VycmVudERyYWdnZWRDZWxsKSB7XG5cdFx0XHR0aGlzLmRyYWdnZWRDZWxscy5mb3JFYWNoKGNlbGwgPT4gY2VsbC5kcmFnZ2luZyA9IGZhbHNlKTtcblx0XHRcdHRoaXMuY3VycmVudERyYWdnZWRDZWxsID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5kcmFnZ2VkQ2VsbHMgPSBbXTtcblx0XHR9XG5cblx0XHR0aGlzLnNldEluc2VydEluZGljYXRvclZpc2liaWxpdHkoZmFsc2UpO1xuXHR9XG5cblx0cmVnaXN0ZXJEcmFnSGFuZGxlKHRlbXBsYXRlRGF0YTogQmFzZUNlbGxSZW5kZXJUZW1wbGF0ZSwgY2VsbFJvb3Q6IEhUTUxFbGVtZW50LCBkcmFnSGFuZGxlczogSFRNTEVsZW1lbnRbXSwgZHJhZ0ltYWdlUHJvdmlkZXI6IERyYWdJbWFnZVByb3ZpZGVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGVtcGxhdGVEYXRhLmNvbnRhaW5lcjtcblx0XHRmb3IgKGNvbnN0IGRyYWdIYW5kbGUgb2YgZHJhZ0hhbmRsZXMpIHtcblx0XHRcdGRyYWdIYW5kbGUuc2V0QXR0cmlidXRlKCdkcmFnZ2FibGUnLCAndHJ1ZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9uRHJhZ0VuZCA9ICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuZ2V0RGlzcGxheU9wdGlvbnMoKS5kcmFnQW5kRHJvcEVuYWJsZWQgfHwgISF0aGlzLm5vdGVib29rRWRpdG9yLmlzUmVhZE9ubHkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBOb3RlLCB0ZW1wbGF0ZURhdGEgbWF5IGhhdmUgYSBkaWZmZXJlbnQgZWxlbWVudCByZW5kZXJlZCBpbnRvIGl0IGJ5IG5vd1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoRFJBR0dJTkdfQ0xBU1MpO1xuXHRcdFx0dGhpcy5kcmFnQ2xlYW51cCgpO1xuXHRcdH07XG5cdFx0Zm9yIChjb25zdCBkcmFnSGFuZGxlIG9mIGRyYWdIYW5kbGVzKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihkcmFnSGFuZGxlLCBET00uRXZlbnRUeXBlLkRSQUdfRU5ELCBvbkRyYWdFbmQpKTtcblx0XHR9XG5cblx0XHRjb25zdCBvbkRyYWdTdGFydCA9IChldmVudDogRHJhZ0V2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIWV2ZW50LmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuZ2V0RGlzcGxheU9wdGlvbnMoKS5kcmFnQW5kRHJvcEVuYWJsZWQgfHwgISF0aGlzLm5vdGVib29rRWRpdG9yLmlzUmVhZE9ubHkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmN1cnJlbnREcmFnZ2VkQ2VsbCA9IHRlbXBsYXRlRGF0YS5jdXJyZW50UmVuZGVyZWRDZWxsITtcblx0XHRcdHRoaXMuZHJhZ2dlZENlbGxzID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRTZWxlY3Rpb25zKCkubWFwKHJhbmdlID0+IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbHNJblJhbmdlKHJhbmdlKSkuZmxhdCgpO1xuXHRcdFx0dGhpcy5kcmFnZ2VkQ2VsbHMuZm9yRWFjaChjZWxsID0+IGNlbGwuZHJhZ2dpbmcgPSB0cnVlKTtcblxuXHRcdFx0Y29uc3QgZHJhZ0ltYWdlID0gZHJhZ0ltYWdlUHJvdmlkZXIoKTtcblx0XHRcdGNlbGxSb290LnBhcmVudEVsZW1lbnQhLmFwcGVuZENoaWxkKGRyYWdJbWFnZSk7XG5cdFx0XHRldmVudC5kYXRhVHJhbnNmZXIuc2V0RHJhZ0ltYWdlKGRyYWdJbWFnZSwgMCwgMCk7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IGRyYWdJbWFnZS5yZW1vdmUoKSwgMCk7IC8vIENvbW1lbnQgdGhpcyBvdXQgdG8gZGVidWcgZHJhZyBpbWFnZSBsYXlvdXRcblx0XHR9O1xuXHRcdGZvciAoY29uc3QgZHJhZ0hhbmRsZSBvZiBkcmFnSGFuZGxlcykge1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZHJhZ0hhbmRsZSwgRE9NLkV2ZW50VHlwZS5EUkFHX1NUQVJULCBvbkRyYWdTdGFydCkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzdGFydEV4cGxpY2l0RHJhZyhjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgX2RyYWdPZmZzZXRZOiBudW1iZXIpIHtcblx0XHRpZiAoIXRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLmdldERpc3BsYXlPcHRpb25zKCkuZHJhZ0FuZERyb3BFbmFibGVkIHx8ICEhdGhpcy5ub3RlYm9va0VkaXRvci5pc1JlYWRPbmx5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jdXJyZW50RHJhZ2dlZENlbGwgPSBjZWxsO1xuXHRcdHRoaXMuc2V0SW5zZXJ0SW5kaWNhdG9yVmlzaWJpbGl0eSh0cnVlKTtcblx0fVxuXG5cdHB1YmxpYyBleHBsaWNpdERyYWcoY2VsbDogSUNlbGxWaWV3TW9kZWwsIGRyYWdPZmZzZXRZOiBudW1iZXIpIHtcblx0XHRpZiAoIXRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLmdldERpc3BsYXlPcHRpb25zKCkuZHJhZ0FuZERyb3BFbmFibGVkIHx8ICEhdGhpcy5ub3RlYm9va0VkaXRvci5pc1JlYWRPbmx5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5saXN0LmVsZW1lbnRBdChkcmFnT2Zmc2V0WSk7XG5cdFx0aWYgKHRhcmdldCAmJiB0YXJnZXQgIT09IGNlbGwpIHtcblx0XHRcdGNvbnN0IGNlbGxUb3AgPSB0aGlzLmxpc3QuZ2V0Q2VsbFZpZXdTY3JvbGxUb3AodGFyZ2V0KTtcblx0XHRcdGNvbnN0IGNlbGxIZWlnaHQgPSB0aGlzLmxpc3QuZWxlbWVudEhlaWdodCh0YXJnZXQpO1xuXG5cdFx0XHRjb25zdCBkcm9wRGlyZWN0aW9uID0gdGhpcy5nZXRFeHBsaWNpdERyYWdEcm9wRGlyZWN0aW9uKGRyYWdPZmZzZXRZLCBjZWxsVG9wLCBjZWxsSGVpZ2h0KTtcblx0XHRcdGNvbnN0IGluc2VydGlvbkluZGljYXRvckFic29sdXRlUG9zID0gZHJvcERpcmVjdGlvbiA9PT0gJ2Fib3ZlJyA/IGNlbGxUb3AgOiBjZWxsVG9wICsgY2VsbEhlaWdodDtcblx0XHRcdHRoaXMudXBkYXRlSW5zZXJ0SW5kaWNhdG9yKGRyb3BEaXJlY3Rpb24sIGluc2VydGlvbkluZGljYXRvckFic29sdXRlUG9zKTtcblx0XHR9XG5cblx0XHQvLyBUcnkgc2Nyb2xsaW5nIGxpc3QgaWYgbmVlZGVkXG5cdFx0aWYgKHRoaXMuY3VycmVudERyYWdnZWRDZWxsICE9PSBjZWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm90ZWJvb2tWaWV3UmVjdCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0RG9tTm9kZSgpLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IGV2ZW50UG9zaXRpb25JblZpZXcgPSBkcmFnT2Zmc2V0WSAtIHRoaXMubGlzdC5zY3JvbGxUb3A7XG5cblx0XHQvLyBQZXJjZW50YWdlIGZyb20gdGhlIHRvcC9ib3R0b20gb2YgdGhlIHNjcmVlbiB3aGVyZSB3ZSBzdGFydCBzY3JvbGxpbmcgd2hpbGUgZHJhZ2dpbmdcblx0XHRjb25zdCBub3RlYm9va1ZpZXdTY3JvbGxNYXJnaW5zID0gMC4yO1xuXG5cdFx0Y29uc3QgbWF4U2Nyb2xsRGVsdGFQZXJGcmFtZSA9IDIwO1xuXG5cdFx0Y29uc3QgZXZlbnRQb3NpdGlvblJhdGlvID0gZXZlbnRQb3NpdGlvbkluVmlldyAvIG5vdGVib29rVmlld1JlY3QuaGVpZ2h0O1xuXHRcdGlmIChldmVudFBvc2l0aW9uUmF0aW8gPCBub3RlYm9va1ZpZXdTY3JvbGxNYXJnaW5zKSB7XG5cdFx0XHR0aGlzLmxpc3Quc2Nyb2xsVG9wIC09IG1heFNjcm9sbERlbHRhUGVyRnJhbWUgKiAoMSAtIGV2ZW50UG9zaXRpb25SYXRpbyAvIG5vdGVib29rVmlld1Njcm9sbE1hcmdpbnMpO1xuXHRcdH0gZWxzZSBpZiAoZXZlbnRQb3NpdGlvblJhdGlvID4gMSAtIG5vdGVib29rVmlld1Njcm9sbE1hcmdpbnMpIHtcblx0XHRcdHRoaXMubGlzdC5zY3JvbGxUb3AgKz0gbWF4U2Nyb2xsRGVsdGFQZXJGcmFtZSAqICgxIC0gKCgxIC0gZXZlbnRQb3NpdGlvblJhdGlvKSAvIG5vdGVib29rVmlld1Njcm9sbE1hcmdpbnMpKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZW5kRXhwbGljaXREcmFnKF9jZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdHRoaXMuc2V0SW5zZXJ0SW5kaWNhdG9yVmlzaWJpbGl0eShmYWxzZSk7XG5cdH1cblxuXHRwdWJsaWMgZXhwbGljaXREcm9wKGNlbGw6IElDZWxsVmlld01vZGVsLCBjdHg6IHsgZHJhZ09mZnNldFk6IG51bWJlcjsgY3RybEtleTogYm9vbGVhbjsgYWx0S2V5OiBib29sZWFuIH0pIHtcblx0XHR0aGlzLmN1cnJlbnREcmFnZ2VkQ2VsbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnNldEluc2VydEluZGljYXRvclZpc2liaWxpdHkoZmFsc2UpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5saXN0LmVsZW1lbnRBdChjdHguZHJhZ09mZnNldFkpO1xuXHRcdGlmICghdGFyZ2V0IHx8IHRhcmdldCA9PT0gY2VsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNlbGxUb3AgPSB0aGlzLmxpc3QuZ2V0Q2VsbFZpZXdTY3JvbGxUb3AodGFyZ2V0KTtcblx0XHRjb25zdCBjZWxsSGVpZ2h0ID0gdGhpcy5saXN0LmVsZW1lbnRIZWlnaHQodGFyZ2V0KTtcblx0XHRjb25zdCBkcm9wRGlyZWN0aW9uID0gdGhpcy5nZXRFeHBsaWNpdERyYWdEcm9wRGlyZWN0aW9uKGN0eC5kcmFnT2Zmc2V0WSwgY2VsbFRvcCwgY2VsbEhlaWdodCk7XG5cdFx0dGhpcy5fZHJvcEltcGwoY2VsbCwgZHJvcERpcmVjdGlvbiwgY3R4LCB0YXJnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFeHBsaWNpdERyYWdEcm9wRGlyZWN0aW9uKGNsaWVudFk6IG51bWJlciwgY2VsbFRvcDogbnVtYmVyLCBjZWxsSGVpZ2h0OiBudW1iZXIpIHtcblx0XHRjb25zdCBkcmFnUG9zSW5FbGVtZW50ID0gY2xpZW50WSAtIGNlbGxUb3A7XG5cdFx0Y29uc3QgZHJhZ1Bvc1JhdGlvID0gZHJhZ1Bvc0luRWxlbWVudCAvIGNlbGxIZWlnaHQ7XG5cblx0XHRyZXR1cm4gdGhpcy5nZXREcm9wSW5zZXJ0RGlyZWN0aW9uKGRyYWdQb3NSYXRpbyk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMubm90ZWJvb2tFZGl0b3IgPSBudWxsITtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBlcmZvcm1DZWxsRHJvcEVkaXRzKGVkaXRvcjogSU5vdGVib29rRWRpdG9yRGVsZWdhdGUsIGRyYWdnZWRDZWxsOiBJQ2VsbFZpZXdNb2RlbCwgZHJvcERpcmVjdGlvbjogJ2Fib3ZlJyB8ICdiZWxvdycsIGRyYWdnZWRPdmVyQ2VsbDogSUNlbGxWaWV3TW9kZWwpOiB2b2lkIHtcblx0Y29uc3QgZHJhZ2dlZENlbGxJbmRleCA9IGVkaXRvci5nZXRDZWxsSW5kZXgoZHJhZ2dlZENlbGwpITtcblx0bGV0IG9yaWdpbmFsVG9JZHggPSBlZGl0b3IuZ2V0Q2VsbEluZGV4KGRyYWdnZWRPdmVyQ2VsbCkhO1xuXG5cdGlmICh0eXBlb2YgZHJhZ2dlZENlbGxJbmRleCAhPT0gJ251bWJlcicgfHwgdHlwZW9mIG9yaWdpbmFsVG9JZHggIT09ICdudW1iZXInKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gSWYgZHJvcHBlZCBvbiBhIGZvbGRlZCBtYXJrZG93biByYW5nZSwgaW5zZXJ0IGFmdGVyIHRoZSBmb2xkaW5nIHJhbmdlXG5cdGlmIChkcm9wRGlyZWN0aW9uID09PSAnYmVsb3cnKSB7XG5cdFx0Y29uc3QgbmV3SWR4ID0gZWRpdG9yLmdldE5leHRWaXNpYmxlQ2VsbEluZGV4KG9yaWdpbmFsVG9JZHgpID8/IG9yaWdpbmFsVG9JZHg7XG5cdFx0b3JpZ2luYWxUb0lkeCA9IG5ld0lkeDtcblx0fVxuXG5cdGxldCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0aWYgKCFzZWxlY3Rpb25zLmxlbmd0aCkge1xuXHRcdHNlbGVjdGlvbnMgPSBbZWRpdG9yLmdldEZvY3VzKCldO1xuXHR9XG5cblx0bGV0IG9yaWdpbmFsRm9jdXNJZHggPSBlZGl0b3IuZ2V0Rm9jdXMoKS5zdGFydDtcblxuXHQvLyBJZiB0aGUgZHJhZ2dlZCBjZWxsIGlzIG5vdCBmb2N1c2VkL3NlbGVjdGVkLCBpZ25vcmUgdGhlIGN1cnJlbnQgZm9jdXMvc2VsZWN0aW9uIGFuZCB1c2UgdGhlIGRyYWdnZWQgaWR4XG5cdGlmICghc2VsZWN0aW9ucy5zb21lKHMgPT4gcy5zdGFydCA8PSBkcmFnZ2VkQ2VsbEluZGV4ICYmIHMuZW5kID4gZHJhZ2dlZENlbGxJbmRleCkpIHtcblx0XHRzZWxlY3Rpb25zID0gW3sgc3RhcnQ6IGRyYWdnZWRDZWxsSW5kZXgsIGVuZDogZHJhZ2dlZENlbGxJbmRleCArIDEgfV07XG5cdFx0b3JpZ2luYWxGb2N1c0lkeCA9IGRyYWdnZWRDZWxsSW5kZXg7XG5cdH1cblxuXHRjb25zdCBkcm9wcGVkSW5TZWxlY3Rpb24gPSBzZWxlY3Rpb25zLmZpbmQocmFuZ2UgPT4gcmFuZ2Uuc3RhcnQgPD0gb3JpZ2luYWxUb0lkeCAmJiByYW5nZS5lbmQgPiBvcmlnaW5hbFRvSWR4KTtcblx0aWYgKGRyb3BwZWRJblNlbGVjdGlvbikge1xuXHRcdG9yaWdpbmFsVG9JZHggPSBkcm9wcGVkSW5TZWxlY3Rpb24uc3RhcnQ7XG5cdH1cblxuXG5cdGxldCBudW1DZWxscyA9IDA7XG5cdGxldCBmb2N1c05ld0lkeCA9IG9yaWdpbmFsVG9JZHg7XG5cdGxldCBuZXdJbnNlcnRpb25JZHggPSBvcmlnaW5hbFRvSWR4O1xuXG5cdC8vIENvbXB1dGUgYSBzZXQgb2YgZWRpdHMgd2hpY2ggd2lsbCBiZSBhcHBsaWVkIGluIHJldmVyc2Ugb3JkZXIgYnkgdGhlIG5vdGVib29rIHRleHQgbW9kZWwuXG5cdC8vIGBpbmRleGA6IHRoZSBzdGFydGluZyBpbmRleCBvZiB0aGUgcmFuZ2UsIGFmdGVyIHByZXZpb3VzIGVkaXRzIGhhdmUgYmVlbiBhcHBsaWVkXG5cdC8vIGBuZXdJZHhgOiB0aGUgZGVzdGluYXRpb24gaW5kZXgsIGFmdGVyIHRoaXMgZWRpdCdzIHJhbmdlIGhhcyBiZWVuIHJlbW92ZWRcblx0c2VsZWN0aW9ucy5zb3J0KChhLCBiKSA9PiBiLnN0YXJ0IC0gYS5zdGFydCk7XG5cdGNvbnN0IGVkaXRzID0gc2VsZWN0aW9ucy5tYXAocmFuZ2UgPT4ge1xuXHRcdGNvbnN0IGxlbmd0aCA9IHJhbmdlLmVuZCAtIHJhbmdlLnN0YXJ0O1xuXG5cdFx0Ly8gSWYgdGhpcyByYW5nZSBpcyBiZWZvcmUgdGhlIGluc2VydGlvbiBwb2ludCwgc3VidHJhY3QgdGhlIGNlbGxzIGluIHRoaXMgcmFuZ2UgZnJvbSB0aGUgXCJ0b1wiIGluZGV4XG5cdFx0bGV0IHRvSW5kZXhEZWx0YSA9IDA7XG5cdFx0aWYgKHJhbmdlLmVuZCA8PSBuZXdJbnNlcnRpb25JZHgpIHtcblx0XHRcdHRvSW5kZXhEZWx0YSA9IC1sZW5ndGg7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3SWR4ID0gbmV3SW5zZXJ0aW9uSWR4ICsgdG9JbmRleERlbHRhO1xuXG5cdFx0Ly8gSWYgdGhpcyByYW5nZSBjb250YWlucyB0aGUgZm9jdXNlZCBjZWxsLCBzZXQgdGhlIG5ldyBmb2N1cyBpbmRleCB0byB0aGUgbmV3IGluZGV4IG9mIHRoZSBjZWxsXG5cdFx0aWYgKG9yaWdpbmFsRm9jdXNJZHggPj0gcmFuZ2Uuc3RhcnQgJiYgb3JpZ2luYWxGb2N1c0lkeCA8PSByYW5nZS5lbmQpIHtcblx0XHRcdGNvbnN0IG9mZnNldCA9IG9yaWdpbmFsRm9jdXNJZHggLSByYW5nZS5zdGFydDtcblx0XHRcdGZvY3VzTmV3SWR4ID0gbmV3SWR4ICsgb2Zmc2V0O1xuXHRcdH1cblxuXHRcdC8vIElmIGJlbG93IHRoZSBpbnNlcnRpb24gcG9pbnQsIHRoZSBvcmlnaW5hbCBpbmRleCB3aWxsIGhhdmUgYmVlbiBzaGlmdGVkIGRvd25cblx0XHRjb25zdCBmcm9tSW5kZXhEZWx0YSA9IHJhbmdlLnN0YXJ0ID49IG9yaWdpbmFsVG9JZHggPyBudW1DZWxscyA6IDA7XG5cblx0XHRjb25zdCBlZGl0OiBJQ2VsbE1vdmVFZGl0ID0ge1xuXHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5Nb3ZlLFxuXHRcdFx0aW5kZXg6IHJhbmdlLnN0YXJ0ICsgZnJvbUluZGV4RGVsdGEsXG5cdFx0XHRsZW5ndGgsXG5cdFx0XHRuZXdJZHhcblx0XHR9O1xuXHRcdG51bUNlbGxzICs9IGxlbmd0aDtcblxuXHRcdC8vIElmIGEgcmFuZ2Ugd2FzIG1vdmVkIGRvd24sIHRoZSBpbnNlcnRpb24gaW5kZXggbmVlZHMgdG8gYmUgYWRqdXN0ZWRcblx0XHRpZiAocmFuZ2UuZW5kIDwgbmV3SW5zZXJ0aW9uSWR4KSB7XG5cdFx0XHRuZXdJbnNlcnRpb25JZHggLT0gbGVuZ3RoO1xuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0O1xuXHR9KTtcblxuXHRjb25zdCBsYXN0RWRpdCA9IGVkaXRzW2VkaXRzLmxlbmd0aCAtIDFdO1xuXHRjb25zdCBmaW5hbFNlbGVjdGlvbiA9IHsgc3RhcnQ6IGxhc3RFZGl0Lm5ld0lkeCwgZW5kOiBsYXN0RWRpdC5uZXdJZHggKyBudW1DZWxscyB9O1xuXHRjb25zdCBmaW5hbEZvY3VzID0geyBzdGFydDogZm9jdXNOZXdJZHgsIGVuZDogZm9jdXNOZXdJZHggKyAxIH07XG5cblx0ZWRpdG9yLnRleHRNb2RlbCEuYXBwbHlFZGl0cyhcblx0XHRlZGl0cyxcblx0XHR0cnVlLFxuXHRcdHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogZWRpdG9yLmdldEZvY3VzKCksIHNlbGVjdGlvbnM6IGVkaXRvci5nZXRTZWxlY3Rpb25zKCkgfSxcblx0XHQoKSA9PiAoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiBmaW5hbEZvY3VzLCBzZWxlY3Rpb25zOiBbZmluYWxTZWxlY3Rpb25dIH0pLFxuXHRcdHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdGVkaXRvci5yZXZlYWxDZWxsUmFuZ2VJblZpZXcoZmluYWxTZWxlY3Rpb24pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFlBQVksY0FBYztBQUMxQixTQUFTLHVDQUFnRjtBQUV6RixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGNBQTZCLDBCQUEwQjtBQUNoRSxTQUFTLDJCQUF1QztBQUVoRCxNQUFNLElBQUksSUFBSTtBQUVkLE1BQU0saUJBQWlCO0FBQ3ZCLE1BQU0sb0JBQW9CO0FBWW5CLE1BQU0sNEJBQTRCLGdCQUFnQjtBQUFBLEVBQ3hELFlBQ2tCLFdBQ2hCO0FBQ0QsVUFBTTtBQUZXO0FBQUEsRUFHbEI7QUFBQSxFQUVTLGNBQWMsU0FBK0I7QUFDckQsU0FBSyxPQUFPLE9BQU87QUFBQSxFQUNwQjtBQUFBLEVBRVMsWUFBWSxTQUF5QixHQUF3QztBQUNyRixRQUFJLEVBQUUsa0JBQWtCO0FBQ3ZCLFdBQUssT0FBTyxPQUFPO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxPQUFPLFNBQXlCO0FBQ3ZD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
