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
import { EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { StandardMouseEvent } from "../../../../../base/browser/mouseEvent.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { CellFoldingState } from "../notebookBrowser.js";
import { CellKind } from "../../common/notebookCommon.js";
import { Delayer } from "../../../../../base/common/async.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { foldingCollapsedIcon, foldingExpandedIcon } from "../../../../../editor/contrib/folding/browser/foldingDecorations.js";
import { FoldingController } from "../controller/foldingController.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { INotebookCellOutlineDataSourceFactory } from "../viewModel/notebookOutlineDataSourceFactory.js";
class NotebookStickyLine extends Disposable {
  constructor(element, foldingIcon, header, entry, notebookEditor) {
    super();
    this.element = element;
    this.foldingIcon = foldingIcon;
    this.header = header;
    this.entry = entry;
    this.notebookEditor = notebookEditor;
    this._register(DOM.addDisposableListener(this.header, DOM.EventType.CLICK || TouchEventType.Tap, () => {
      this.focusCell();
    }));
    this._register(DOM.addDisposableListener(this.foldingIcon.domNode, DOM.EventType.CLICK || TouchEventType.Tap, () => {
      if (this.entry.cell.cellKind === CellKind.Markup) {
        const currentFoldingState = this.entry.cell.foldingState;
        this.toggleFoldRange(currentFoldingState);
      }
    }));
  }
  toggleFoldRange(currentState) {
    const foldingController = this.notebookEditor.getContribution(FoldingController.id);
    const index = this.entry.index;
    const headerLevel = this.entry.level;
    const newFoldingState = currentState === CellFoldingState.Collapsed ? CellFoldingState.Expanded : CellFoldingState.Collapsed;
    foldingController.setFoldingStateDown(index, newFoldingState, headerLevel);
    this.focusCell();
  }
  focusCell() {
    this.notebookEditor.focusNotebookCell(this.entry.cell, "container");
    const cellScrollTop = this.notebookEditor.getAbsoluteTopOfElement(this.entry.cell);
    const parentCount = NotebookStickyLine.getParentCount(this.entry);
    this.notebookEditor.setScrollTop(cellScrollTop - (parentCount + 1.1) * 22);
  }
  static getParentCount(entry) {
    let count = 0;
    while (entry.parent) {
      count++;
      entry = entry.parent;
    }
    return count;
  }
}
class StickyFoldingIcon {
  constructor(isCollapsed, dimension) {
    this.isCollapsed = isCollapsed;
    this.dimension = dimension;
    this.domNode = document.createElement("div");
    this.domNode.style.width = `${dimension}px`;
    this.domNode.style.height = `${dimension}px`;
    this.domNode.className = ThemeIcon.asClassName(isCollapsed ? foldingCollapsedIcon : foldingExpandedIcon);
  }
  setVisible(visible) {
    this.domNode.style.cursor = visible ? "pointer" : "default";
    this.domNode.style.opacity = visible ? "1" : "0";
  }
}
let NotebookStickyScroll = class extends Disposable {
  constructor(domNode, notebookEditor, notebookCellList, layoutFn, _contextMenuService, instantiationService) {
    super();
    this.domNode = domNode;
    this.notebookEditor = notebookEditor;
    this.notebookCellList = notebookCellList;
    this.layoutFn = layoutFn;
    this._contextMenuService = _contextMenuService;
    this.instantiationService = instantiationService;
    this._disposables = new DisposableStore();
    this.currentStickyLines = /* @__PURE__ */ new Map();
    this._onDidChangeNotebookStickyScroll = this._register(new Emitter());
    this.onDidChangeNotebookStickyScroll = this._onDidChangeNotebookStickyScroll.event;
    this._layoutDisposableStore = this._register(new DisposableStore());
    if (this.notebookEditor.notebookOptions.getDisplayOptions().stickyScrollEnabled) {
      this.init().catch(console.error);
    }
    this._register(this.notebookEditor.notebookOptions.onDidChangeOptions((e) => {
      if (e.stickyScrollEnabled || e.stickyScrollMode) {
        this.updateConfig(e);
      }
    }));
    this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.CONTEXT_MENU, async (event) => {
      this.onContextMenu(event);
    }));
    this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.WHEEL, (event) => {
      this.notebookCellList.triggerScrollFromMouseWheelEvent(event);
    }));
  }
  getDomNode() {
    return this.domNode;
  }
  getCurrentStickyHeight() {
    let height = 0;
    this.currentStickyLines.forEach((value) => {
      if (value.rendered) {
        height += 22;
      }
    });
    return height;
  }
  setCurrentStickyLines(newStickyLines) {
    this.currentStickyLines = newStickyLines;
  }
  compareStickyLineMaps(mapA, mapB) {
    if (mapA.size !== mapB.size) {
      return false;
    }
    for (const [key, value] of mapA) {
      const otherValue = mapB.get(key);
      if (!otherValue || value.rendered !== otherValue.rendered) {
        return false;
      }
    }
    return true;
  }
  onContextMenu(e) {
    const event = new StandardMouseEvent(DOM.getWindow(this.domNode), e);
    const selectedElement = event.target.parentElement;
    const selectedOutlineEntry = Array.from(this.currentStickyLines.values()).find((entry) => entry.line.element.contains(selectedElement))?.line.entry;
    if (!selectedOutlineEntry) {
      return;
    }
    const args = {
      outlineEntry: selectedOutlineEntry,
      notebookEditor: this.notebookEditor
    };
    this._contextMenuService.showContextMenu({
      menuId: MenuId.NotebookStickyScrollContext,
      getAnchor: () => event,
      menuActionOptions: { shouldForwardArgs: true, arg: args, renderShortTitle: true }
    });
  }
  updateConfig(e) {
    if (e.stickyScrollEnabled) {
      if (this.notebookEditor.notebookOptions.getDisplayOptions().stickyScrollEnabled) {
        this.init().catch(console.error);
      } else {
        this._disposables.clear();
        this.notebookCellOutlineReference?.dispose();
        this.disposeCurrentStickyLines();
        DOM.clearNode(this.domNode);
        this.updateDisplay();
      }
    } else if (e.stickyScrollMode && this.notebookEditor.notebookOptions.getDisplayOptions().stickyScrollEnabled && this.notebookCellOutlineReference?.object) {
      this.updateContent(computeContent(this.notebookEditor, this.notebookCellList, this.notebookCellOutlineReference?.object?.entries, this.getCurrentStickyHeight()));
    }
  }
  async init() {
    const { object: notebookCellOutline } = this.notebookCellOutlineReference = this.instantiationService.invokeFunction((accessor) => accessor.get(INotebookCellOutlineDataSourceFactory).getOrCreate(this.notebookEditor));
    this._register(this.notebookCellOutlineReference);
    await notebookCellOutline.computeFullSymbols(CancellationToken.None);
    const computed = computeContent(this.notebookEditor, this.notebookCellList, notebookCellOutline.entries, this.getCurrentStickyHeight());
    this.updateContent(computed);
    this._disposables.add(notebookCellOutline.onDidChange(() => {
      const computed2 = computeContent(this.notebookEditor, this.notebookCellList, notebookCellOutline.entries, this.getCurrentStickyHeight());
      if (!this.compareStickyLineMaps(computed2, this.currentStickyLines)) {
        this.updateContent(computed2);
      } else {
        this.disposeStickyLineMap(computed2);
      }
    }));
    this._disposables.add(this.notebookEditor.onDidAttachViewModel(async () => {
      await notebookCellOutline.computeFullSymbols(CancellationToken.None);
      const computed2 = computeContent(this.notebookEditor, this.notebookCellList, notebookCellOutline.entries, this.getCurrentStickyHeight());
      this.updateContent(computed2);
    }));
    this._disposables.add(this.notebookEditor.onDidScroll(() => {
      const d = new Delayer(100);
      d.trigger(() => {
        d.dispose();
        const computed2 = computeContent(this.notebookEditor, this.notebookCellList, notebookCellOutline.entries, this.getCurrentStickyHeight());
        if (!this.compareStickyLineMaps(computed2, this.currentStickyLines)) {
          this.updateContent(computed2);
        } else {
          this.disposeStickyLineMap(computed2);
        }
      });
    }));
  }
  // Add helper method to dispose a map of sticky lines
  disposeStickyLineMap(map) {
    map.forEach((value) => {
      if (value.line) {
        value.line.dispose();
      }
    });
  }
  // take in an cell index, and get the corresponding outline entry
  static getVisibleOutlineEntry(visibleIndex, notebookOutlineEntries) {
    let left = 0;
    let right = notebookOutlineEntries.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (notebookOutlineEntries[mid].index === visibleIndex) {
        const rootEntry = notebookOutlineEntries[mid];
        const flatList = [];
        rootEntry.asFlatList(flatList);
        return flatList.find((entry) => entry.index === visibleIndex);
      } else if (notebookOutlineEntries[mid].index < visibleIndex) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    if (right >= 0) {
      const rootEntry = notebookOutlineEntries[right];
      const flatList = [];
      rootEntry.asFlatList(flatList);
      return flatList.find((entry) => entry.index === visibleIndex);
    }
    return void 0;
  }
  updateContent(newMap) {
    DOM.clearNode(this.domNode);
    this.disposeCurrentStickyLines();
    this.renderStickyLines(newMap, this.domNode);
    const oldStickyHeight = this.getCurrentStickyHeight();
    this.setCurrentStickyLines(newMap);
    const sizeDelta = this.getCurrentStickyHeight() - oldStickyHeight;
    if (sizeDelta !== 0) {
      this._onDidChangeNotebookStickyScroll.fire(sizeDelta);
      const d = this._layoutDisposableStore.add(DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.getDomNode()), () => {
        this.layoutFn(sizeDelta);
        this.updateDisplay();
        this._layoutDisposableStore.delete(d);
      }));
    } else {
      this.updateDisplay();
    }
  }
  updateDisplay() {
    const hasSticky = this.getCurrentStickyHeight() > 0;
    if (!hasSticky) {
      this.domNode.style.display = "none";
    } else {
      this.domNode.style.display = "block";
    }
  }
  static computeStickyHeight(entry) {
    let height = 0;
    if (entry.cell.cellKind === CellKind.Markup && entry.level < 7) {
      height += 22;
    }
    while (entry.parent) {
      height += 22;
      entry = entry.parent;
    }
    return height;
  }
  static checkCollapsedStickyLines(entry, numLinesToRender, notebookEditor) {
    let currentEntry = entry;
    const newMap = /* @__PURE__ */ new Map();
    const elementsToRender = [];
    while (currentEntry) {
      if (currentEntry.level >= 7) {
        currentEntry = currentEntry.parent;
        continue;
      }
      const lineToRender = NotebookStickyScroll.createStickyElement(currentEntry, notebookEditor);
      newMap.set(currentEntry, { line: lineToRender, rendered: false });
      elementsToRender.unshift(lineToRender);
      currentEntry = currentEntry.parent;
    }
    for (let i = 0; i < elementsToRender.length; i++) {
      if (i >= numLinesToRender) {
        break;
      }
      newMap.set(elementsToRender[i].entry, { line: elementsToRender[i], rendered: true });
    }
    return newMap;
  }
  renderStickyLines(stickyMap, containerElement) {
    const reversedEntries = Array.from(stickyMap.entries()).reverse();
    for (const [, value] of reversedEntries) {
      if (!value.rendered) {
        continue;
      }
      containerElement.append(value.line.element);
    }
  }
  static createStickyElement(entry, notebookEditor) {
    const stickyElement = document.createElement("div");
    stickyElement.classList.add("notebook-sticky-scroll-element");
    const indentMode = notebookEditor.notebookOptions.getLayoutConfiguration().stickyScrollMode;
    if (indentMode === "indented") {
      stickyElement.style.paddingLeft = NotebookStickyLine.getParentCount(entry) * 10 + "px";
    }
    let isCollapsed = false;
    if (entry.cell.cellKind === CellKind.Markup) {
      isCollapsed = entry.cell.foldingState === CellFoldingState.Collapsed;
    }
    const stickyFoldingIcon = new StickyFoldingIcon(isCollapsed, 16);
    stickyFoldingIcon.domNode.classList.add("notebook-sticky-scroll-folding-icon");
    stickyFoldingIcon.setVisible(true);
    const stickyHeader = document.createElement("div");
    stickyHeader.classList.add("notebook-sticky-scroll-header");
    stickyHeader.innerText = entry.label;
    stickyElement.append(stickyFoldingIcon.domNode, stickyHeader);
    return new NotebookStickyLine(stickyElement, stickyFoldingIcon, stickyHeader, entry, notebookEditor);
  }
  disposeCurrentStickyLines() {
    this.currentStickyLines.forEach((value) => {
      value.line.dispose();
    });
  }
  dispose() {
    this._disposables.dispose();
    this.disposeCurrentStickyLines();
    this.notebookCellOutlineReference?.dispose();
    super.dispose();
  }
};
NotebookStickyScroll = __decorateClass([
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IInstantiationService)
], NotebookStickyScroll);
function computeContent(notebookEditor, notebookCellList, notebookOutlineEntries, renderedStickyHeight) {
  const editorScrollTop = notebookEditor.scrollTop - renderedStickyHeight;
  const visibleRange = notebookEditor.visibleRanges[0];
  if (!visibleRange) {
    return /* @__PURE__ */ new Map();
  }
  if (visibleRange.start === 0) {
    const firstCell = notebookEditor.cellAt(0);
    const firstCellEntry = NotebookStickyScroll.getVisibleOutlineEntry(0, notebookOutlineEntries);
    if (firstCell && firstCellEntry && firstCell.cellKind === CellKind.Markup && firstCellEntry.level < 7) {
      if (notebookEditor.scrollTop > 22) {
        const newMap2 = NotebookStickyScroll.checkCollapsedStickyLines(firstCellEntry, 100, notebookEditor);
        return newMap2;
      }
    }
  }
  let cell;
  let cellEntry;
  const startIndex = visibleRange.start - 1;
  for (let currentIndex = startIndex; currentIndex < visibleRange.end; currentIndex++) {
    cell = notebookEditor.cellAt(currentIndex);
    if (!cell) {
      return /* @__PURE__ */ new Map();
    }
    cellEntry = NotebookStickyScroll.getVisibleOutlineEntry(currentIndex, notebookOutlineEntries);
    if (!cellEntry) {
      continue;
    }
    const nextCell = notebookEditor.cellAt(currentIndex + 1);
    if (!nextCell) {
      const sectionBottom2 = notebookEditor.getLayoutInfo().scrollHeight;
      const linesToRender2 = Math.floor(sectionBottom2 / 22);
      const newMap2 = NotebookStickyScroll.checkCollapsedStickyLines(cellEntry, linesToRender2, notebookEditor);
      return newMap2;
    }
    const nextCellEntry = NotebookStickyScroll.getVisibleOutlineEntry(currentIndex + 1, notebookOutlineEntries);
    if (!nextCellEntry) {
      continue;
    }
    if (nextCell.cellKind === CellKind.Markup && nextCellEntry.level < 7) {
      const sectionBottom2 = notebookCellList.getCellViewScrollTop(nextCell);
      const currentSectionStickyHeight = NotebookStickyScroll.computeStickyHeight(cellEntry);
      const nextSectionStickyHeight = NotebookStickyScroll.computeStickyHeight(nextCellEntry);
      if (editorScrollTop + currentSectionStickyHeight < sectionBottom2) {
        const linesToRender2 = Math.floor((sectionBottom2 - editorScrollTop) / 22);
        const newMap2 = NotebookStickyScroll.checkCollapsedStickyLines(cellEntry, linesToRender2, notebookEditor);
        return newMap2;
      } else if (nextSectionStickyHeight >= currentSectionStickyHeight) {
        const newMap2 = NotebookStickyScroll.checkCollapsedStickyLines(nextCellEntry, 100, notebookEditor);
        return newMap2;
      } else if (nextSectionStickyHeight < currentSectionStickyHeight) {
        const availableSpace = sectionBottom2 - editorScrollTop;
        if (availableSpace >= nextSectionStickyHeight) {
          const linesToRender2 = Math.floor(availableSpace / 22);
          const newMap2 = NotebookStickyScroll.checkCollapsedStickyLines(cellEntry, linesToRender2, notebookEditor);
          return newMap2;
        } else {
          const newMap2 = NotebookStickyScroll.checkCollapsedStickyLines(nextCellEntry, 100, notebookEditor);
          return newMap2;
        }
      }
    }
  }
  const sectionBottom = notebookEditor.getLayoutInfo().scrollHeight;
  const linesToRender = Math.floor((sectionBottom - editorScrollTop) / 22);
  const newMap = NotebookStickyScroll.checkCollapsedStickyLines(cellEntry, linesToRender, notebookEditor);
  return newMap;
}
export {
  NotebookStickyLine,
  NotebookStickyScroll,
  computeContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3UGFydHNcXG5vdGVib29rRWRpdG9yU3RpY2t5U2Nyb2xsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElNb3VzZVdoZWVsRXZlbnQsIFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0eXBlIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBDZWxsRm9sZGluZ1N0YXRlLCBJTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rQ2VsbExpc3QgfSBmcm9tICcuLi92aWV3L25vdGVib29rUmVuZGVyaW5nQ29tbW9uLmpzJztcbmltcG9ydCB7IE91dGxpbmVFbnRyeSB9IGZyb20gJy4uL3ZpZXdNb2RlbC9PdXRsaW5lRW50cnkuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2UgfSBmcm9tICcuLi92aWV3TW9kZWwvbm90ZWJvb2tPdXRsaW5lRGF0YVNvdXJjZS5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGZvbGRpbmdDb2xsYXBzZWRJY29uLCBmb2xkaW5nRXhwYW5kZWRJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZm9sZGluZy9icm93c2VyL2ZvbGRpbmdEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBNYXJrdXBDZWxsVmlld01vZGVsIH0gZnJvbSAnLi4vdmlld01vZGVsL21hcmt1cENlbGxWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgRm9sZGluZ0NvbnRyb2xsZXIgfSBmcm9tICcuLi9jb250cm9sbGVyL2ZvbGRpbmdDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IE5vdGVib29rT3B0aW9uc0NoYW5nZUV2ZW50IH0gZnJvbSAnLi4vbm90ZWJvb2tPcHRpb25zLmpzJztcbmltcG9ydCB7IE5vdGVib29rT3V0bGluZUVudHJ5QXJncyB9IGZyb20gJy4uL2NvbnRyb2xsZXIvc2VjdGlvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2VGYWN0b3J5IH0gZnJvbSAnLi4vdmlld01vZGVsL25vdGVib29rT3V0bGluZURhdGFTb3VyY2VGYWN0b3J5LmpzJztcblxuZXhwb3J0IGNsYXNzIE5vdGVib29rU3RpY2t5TGluZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGZvbGRpbmdJY29uOiBTdGlja3lGb2xkaW5nSWNvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgaGVhZGVyOiBIVE1MRWxlbWVudCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZW50cnk6IE91dGxpbmVFbnRyeSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvcixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHQvLyBjbGljayB0aGUgaGVhZGVyIHRvIGZvY3VzIHRoZSBjZWxsXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmhlYWRlciwgRE9NLkV2ZW50VHlwZS5DTElDSyB8fCBUb3VjaEV2ZW50VHlwZS5UYXAsICgpID0+IHtcblx0XHRcdHRoaXMuZm9jdXNDZWxsKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gY2xpY2sgdGhlIGZvbGRpbmcgaWNvbiB0byBmb2xkIHRoZSByYW5nZSBjb3ZlcmVkIGJ5IHRoZSBoZWFkZXJcblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZm9sZGluZ0ljb24uZG9tTm9kZSwgRE9NLkV2ZW50VHlwZS5DTElDSyB8fCBUb3VjaEV2ZW50VHlwZS5UYXAsICgpID0+IHtcblx0XHRcdGlmICh0aGlzLmVudHJ5LmNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCkge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50Rm9sZGluZ1N0YXRlID0gKHRoaXMuZW50cnkuY2VsbCBhcyBNYXJrdXBDZWxsVmlld01vZGVsKS5mb2xkaW5nU3RhdGU7XG5cdFx0XHRcdHRoaXMudG9nZ2xlRm9sZFJhbmdlKGN1cnJlbnRGb2xkaW5nU3RhdGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlRm9sZFJhbmdlKGN1cnJlbnRTdGF0ZTogQ2VsbEZvbGRpbmdTdGF0ZSkge1xuXHRcdGNvbnN0IGZvbGRpbmdDb250cm9sbGVyID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDb250cmlidXRpb248Rm9sZGluZ0NvbnRyb2xsZXI+KEZvbGRpbmdDb250cm9sbGVyLmlkKTtcblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5lbnRyeS5pbmRleDtcblx0XHRjb25zdCBoZWFkZXJMZXZlbCA9IHRoaXMuZW50cnkubGV2ZWw7XG5cdFx0Y29uc3QgbmV3Rm9sZGluZ1N0YXRlID0gKGN1cnJlbnRTdGF0ZSA9PT0gQ2VsbEZvbGRpbmdTdGF0ZS5Db2xsYXBzZWQpID8gQ2VsbEZvbGRpbmdTdGF0ZS5FeHBhbmRlZCA6IENlbGxGb2xkaW5nU3RhdGUuQ29sbGFwc2VkO1xuXG5cdFx0Zm9sZGluZ0NvbnRyb2xsZXIuc2V0Rm9sZGluZ1N0YXRlRG93bihpbmRleCwgbmV3Rm9sZGluZ1N0YXRlLCBoZWFkZXJMZXZlbCk7XG5cdFx0dGhpcy5mb2N1c0NlbGwoKTtcblx0fVxuXG5cdHByaXZhdGUgZm9jdXNDZWxsKCkge1xuXHRcdHRoaXMubm90ZWJvb2tFZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwodGhpcy5lbnRyeS5jZWxsLCAnY29udGFpbmVyJyk7XG5cdFx0Y29uc3QgY2VsbFNjcm9sbFRvcCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0QWJzb2x1dGVUb3BPZkVsZW1lbnQodGhpcy5lbnRyeS5jZWxsKTtcblx0XHRjb25zdCBwYXJlbnRDb3VudCA9IE5vdGVib29rU3RpY2t5TGluZS5nZXRQYXJlbnRDb3VudCh0aGlzLmVudHJ5KTtcblx0XHQvLyAxLjEgYWRkcmVzc2VzIHZpc2libGUgY2VsbCBwYWRkaW5nLCB0byBtYWtlIHN1cmUgd2UgZG9uJ3QgZm9jdXMgbWQgY2VsbCBhbmQgYWxzbyByZW5kZXIgaXRzIHN0aWNreSBsaW5lXG5cdFx0dGhpcy5ub3RlYm9va0VkaXRvci5zZXRTY3JvbGxUb3AoY2VsbFNjcm9sbFRvcCAtIChwYXJlbnRDb3VudCArIDEuMSkgKiAyMik7XG5cdH1cblxuXHRzdGF0aWMgZ2V0UGFyZW50Q291bnQoZW50cnk6IE91dGxpbmVFbnRyeSkge1xuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0d2hpbGUgKGVudHJ5LnBhcmVudCkge1xuXHRcdFx0Y291bnQrKztcblx0XHRcdGVudHJ5ID0gZW50cnkucGFyZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gY291bnQ7XG5cdH1cbn1cblxuY2xhc3MgU3RpY2t5Rm9sZGluZ0ljb24ge1xuXG5cdHB1YmxpYyBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgaXNDb2xsYXBzZWQ6IGJvb2xlYW4sXG5cdFx0cHVibGljIGRpbWVuc2lvbjogbnVtYmVyXG5cdCkge1xuXHRcdHRoaXMuZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS53aWR0aCA9IGAke2RpbWVuc2lvbn1weGA7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmhlaWdodCA9IGAke2RpbWVuc2lvbn1weGA7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpc0NvbGxhcHNlZCA/IGZvbGRpbmdDb2xsYXBzZWRJY29uIDogZm9sZGluZ0V4cGFuZGVkSWNvbik7XG5cdH1cblxuXHRwdWJsaWMgc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmN1cnNvciA9IHZpc2libGUgPyAncG9pbnRlcicgOiAnZGVmYXVsdCc7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLm9wYWNpdHkgPSB2aXNpYmxlID8gJzEnIDogJzAnO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va1N0aWNreVNjcm9sbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBjdXJyZW50U3RpY2t5TGluZXMgPSBuZXcgTWFwPE91dGxpbmVFbnRyeSwgeyBsaW5lOiBOb3RlYm9va1N0aWNreUxpbmU7IHJlbmRlcmVkOiBib29sZWFuIH0+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VOb3RlYm9va1N0aWNreVNjcm9sbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTm90ZWJvb2tTdGlja3lTY3JvbGw6IEV2ZW50PG51bWJlcj4gPSB0aGlzLl9vbkRpZENoYW5nZU5vdGVib29rU3RpY2t5U2Nyb2xsLmV2ZW50O1xuXHRwcml2YXRlIG5vdGVib29rQ2VsbE91dGxpbmVSZWZlcmVuY2U/OiBJUmVmZXJlbmNlPE5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXREaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGU7XG5cdH1cblxuXHRnZXRDdXJyZW50U3RpY2t5SGVpZ2h0KCkge1xuXHRcdGxldCBoZWlnaHQgPSAwO1xuXHRcdHRoaXMuY3VycmVudFN0aWNreUxpbmVzLmZvckVhY2goKHZhbHVlKSA9PiB7XG5cdFx0XHRpZiAodmFsdWUucmVuZGVyZWQpIHtcblx0XHRcdFx0aGVpZ2h0ICs9IDIyO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiBoZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIHNldEN1cnJlbnRTdGlja3lMaW5lcyhuZXdTdGlja3lMaW5lczogTWFwPE91dGxpbmVFbnRyeSwgeyBsaW5lOiBOb3RlYm9va1N0aWNreUxpbmU7IHJlbmRlcmVkOiBib29sZWFuIH0+KSB7XG5cdFx0dGhpcy5jdXJyZW50U3RpY2t5TGluZXMgPSBuZXdTdGlja3lMaW5lcztcblx0fVxuXG5cdHByaXZhdGUgY29tcGFyZVN0aWNreUxpbmVNYXBzKG1hcEE6IE1hcDxPdXRsaW5lRW50cnksIHsgbGluZTogTm90ZWJvb2tTdGlja3lMaW5lOyByZW5kZXJlZDogYm9vbGVhbiB9PiwgbWFwQjogTWFwPE91dGxpbmVFbnRyeSwgeyBsaW5lOiBOb3RlYm9va1N0aWNreUxpbmU7IHJlbmRlcmVkOiBib29sZWFuIH0+KTogYm9vbGVhbiB7XG5cdFx0aWYgKG1hcEEuc2l6ZSAhPT0gbWFwQi5zaXplKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgbWFwQSkge1xuXHRcdFx0Y29uc3Qgb3RoZXJWYWx1ZSA9IG1hcEIuZ2V0KGtleSk7XG5cdFx0XHRpZiAoIW90aGVyVmFsdWUgfHwgdmFsdWUucmVuZGVyZWQgIT09IG90aGVyVmFsdWUucmVuZGVyZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RlYm9va0NlbGxMaXN0OiBJTm90ZWJvb2tDZWxsTGlzdCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxheW91dEZuOiAoZGVsdGE6IG51bWJlcikgPT4gdm9pZCxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmICh0aGlzLm5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5nZXREaXNwbGF5T3B0aW9ucygpLnN0aWNreVNjcm9sbEVuYWJsZWQpIHtcblx0XHRcdHRoaXMuaW5pdCgpLmNhdGNoKGNvbnNvbGUuZXJyb3IpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLm9uRGlkQ2hhbmdlT3B0aW9ucygoZSkgPT4ge1xuXHRcdFx0aWYgKGUuc3RpY2t5U2Nyb2xsRW5hYmxlZCB8fCBlLnN0aWNreVNjcm9sbE1vZGUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDb25maWcoZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIERPTS5FdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBhc3luYyAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdHRoaXMub25Db250ZXh0TWVudShldmVudCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRm9yd2FyZCB3aGVlbCBldmVudHMgdG8gdGhlIG5vdGVib29rIGVkaXRvciB0byBlbmFibGUgc2Nyb2xsaW5nIHdoZW4gaG92ZXJpbmcgb3ZlciBzdGlja3kgc2Nyb2xsXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIERPTS5FdmVudFR5cGUuV0hFRUwsIChldmVudDogV2hlZWxFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5ub3RlYm9va0NlbGxMaXN0LnRyaWdnZXJTY3JvbGxGcm9tTW91c2VXaGVlbEV2ZW50KGV2ZW50IGFzIHVua25vd24gYXMgSU1vdXNlV2hlZWxFdmVudCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KGU6IE1vdXNlRXZlbnQpIHtcblx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoRE9NLmdldFdpbmRvdyh0aGlzLmRvbU5vZGUpLCBlKTtcblxuXHRcdGNvbnN0IHNlbGVjdGVkRWxlbWVudCA9IGV2ZW50LnRhcmdldC5wYXJlbnRFbGVtZW50O1xuXHRcdGNvbnN0IHNlbGVjdGVkT3V0bGluZUVudHJ5ID0gQXJyYXkuZnJvbSh0aGlzLmN1cnJlbnRTdGlja3lMaW5lcy52YWx1ZXMoKSkuZmluZChlbnRyeSA9PiBlbnRyeS5saW5lLmVsZW1lbnQuY29udGFpbnMoc2VsZWN0ZWRFbGVtZW50KSk/LmxpbmUuZW50cnk7XG5cdFx0aWYgKCFzZWxlY3RlZE91dGxpbmVFbnRyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFyZ3M6IE5vdGVib29rT3V0bGluZUVudHJ5QXJncyA9IHtcblx0XHRcdG91dGxpbmVFbnRyeTogc2VsZWN0ZWRPdXRsaW5lRW50cnksXG5cdFx0XHRub3RlYm9va0VkaXRvcjogdGhpcy5ub3RlYm9va0VkaXRvcixcblx0XHR9O1xuXG5cdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRtZW51SWQ6IE1lbnVJZC5Ob3RlYm9va1N0aWNreVNjcm9sbENvbnRleHQsXG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGV2ZW50LFxuXHRcdFx0bWVudUFjdGlvbk9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUsIGFyZzogYXJncywgcmVuZGVyU2hvcnRUaXRsZTogdHJ1ZSB9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb25maWcoZTogTm90ZWJvb2tPcHRpb25zQ2hhbmdlRXZlbnQpIHtcblx0XHRpZiAoZS5zdGlja3lTY3JvbGxFbmFibGVkKSB7XG5cdFx0XHRpZiAodGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuZ2V0RGlzcGxheU9wdGlvbnMoKS5zdGlja3lTY3JvbGxFbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuaW5pdCgpLmNhdGNoKGNvbnNvbGUuZXJyb3IpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5ub3RlYm9va0NlbGxPdXRsaW5lUmVmZXJlbmNlPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZUN1cnJlbnRTdGlja3lMaW5lcygpO1xuXHRcdFx0XHRET00uY2xlYXJOb2RlKHRoaXMuZG9tTm9kZSk7XG5cdFx0XHRcdHRoaXMudXBkYXRlRGlzcGxheSgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoZS5zdGlja3lTY3JvbGxNb2RlICYmIHRoaXMubm90ZWJvb2tFZGl0b3Iubm90ZWJvb2tPcHRpb25zLmdldERpc3BsYXlPcHRpb25zKCkuc3RpY2t5U2Nyb2xsRW5hYmxlZCAmJiB0aGlzLm5vdGVib29rQ2VsbE91dGxpbmVSZWZlcmVuY2U/Lm9iamVjdCkge1xuXHRcdFx0dGhpcy51cGRhdGVDb250ZW50KGNvbXB1dGVDb250ZW50KHRoaXMubm90ZWJvb2tFZGl0b3IsIHRoaXMubm90ZWJvb2tDZWxsTGlzdCwgdGhpcy5ub3RlYm9va0NlbGxPdXRsaW5lUmVmZXJlbmNlPy5vYmplY3Q/LmVudHJpZXMsIHRoaXMuZ2V0Q3VycmVudFN0aWNreUhlaWdodCgpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0KCkge1xuXHRcdGNvbnN0IHsgb2JqZWN0OiBub3RlYm9va0NlbGxPdXRsaW5lIH0gPSB0aGlzLm5vdGVib29rQ2VsbE91dGxpbmVSZWZlcmVuY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKChhY2Nlc3NvcikgPT4gYWNjZXNzb3IuZ2V0KElOb3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZUZhY3RvcnkpLmdldE9yQ3JlYXRlKHRoaXMubm90ZWJvb2tFZGl0b3IpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm5vdGVib29rQ2VsbE91dGxpbmVSZWZlcmVuY2UpO1xuXG5cdFx0Ly8gRW5zdXJlIHN5bWJvbHMgYXJlIGNvbXB1dGVkIGZpcnN0XG5cdFx0YXdhaXQgbm90ZWJvb2tDZWxsT3V0bGluZS5jb21wdXRlRnVsbFN5bWJvbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHQvLyBJbml0aWFsIGNvbnRlbnQgdXBkYXRlXG5cdFx0Y29uc3QgY29tcHV0ZWQgPSBjb21wdXRlQ29udGVudCh0aGlzLm5vdGVib29rRWRpdG9yLCB0aGlzLm5vdGVib29rQ2VsbExpc3QsIG5vdGVib29rQ2VsbE91dGxpbmUuZW50cmllcywgdGhpcy5nZXRDdXJyZW50U3RpY2t5SGVpZ2h0KCkpO1xuXHRcdHRoaXMudXBkYXRlQ29udGVudChjb21wdXRlZCk7XG5cblx0XHQvLyBTZXQgdXAgb3V0bGluZSBjaGFuZ2UgbGlzdGVuZXJcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQobm90ZWJvb2tDZWxsT3V0bGluZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21wdXRlZCA9IGNvbXB1dGVDb250ZW50KHRoaXMubm90ZWJvb2tFZGl0b3IsIHRoaXMubm90ZWJvb2tDZWxsTGlzdCwgbm90ZWJvb2tDZWxsT3V0bGluZS5lbnRyaWVzLCB0aGlzLmdldEN1cnJlbnRTdGlja3lIZWlnaHQoKSk7XG5cdFx0XHRpZiAoIXRoaXMuY29tcGFyZVN0aWNreUxpbmVNYXBzKGNvbXB1dGVkLCB0aGlzLmN1cnJlbnRTdGlja3lMaW5lcykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDb250ZW50KGNvbXB1dGVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGlmIHdlIGRvbid0IGVuZCB1cCB1cGRhdGluZyB0aGUgY29udGVudCwgd2UgbmVlZCB0byBhdm9pZCBsZWFraW5nIHRoZSBtYXBcblx0XHRcdFx0dGhpcy5kaXNwb3NlU3RpY2t5TGluZU1hcChjb21wdXRlZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGFuZGxlIHZpZXcgbW9kZWwgY2hhbmdlc1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLm5vdGVib29rRWRpdG9yLm9uRGlkQXR0YWNoVmlld01vZGVsKGFzeW5jICgpID0+IHtcblx0XHRcdC8vIGVuc3VyZSByZWNvbXB1dGUgc3ltYm9scyB3aGVuIHZpZXcgbW9kZWwgY2hhbmdlcyAtLSBjb3VsZCBiZSBtaXNzZWQgaWYgb3V0bGluZSBpcyBjbG9zZWRcblx0XHRcdGF3YWl0IG5vdGVib29rQ2VsbE91dGxpbmUuY29tcHV0ZUZ1bGxTeW1ib2xzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCBjb21wdXRlZCA9IGNvbXB1dGVDb250ZW50KHRoaXMubm90ZWJvb2tFZGl0b3IsIHRoaXMubm90ZWJvb2tDZWxsTGlzdCwgbm90ZWJvb2tDZWxsT3V0bGluZS5lbnRyaWVzLCB0aGlzLmdldEN1cnJlbnRTdGlja3lIZWlnaHQoKSk7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbnRlbnQoY29tcHV0ZWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLm5vdGVib29rRWRpdG9yLm9uRGlkU2Nyb2xsKCgpID0+IHtcblx0XHRcdGNvbnN0IGQgPSBuZXcgRGVsYXllcigxMDApO1xuXHRcdFx0ZC50cmlnZ2VyKCgpID0+IHtcblx0XHRcdFx0ZC5kaXNwb3NlKCk7XG5cblx0XHRcdFx0Y29uc3QgY29tcHV0ZWQgPSBjb21wdXRlQ29udGVudCh0aGlzLm5vdGVib29rRWRpdG9yLCB0aGlzLm5vdGVib29rQ2VsbExpc3QsIG5vdGVib29rQ2VsbE91dGxpbmUuZW50cmllcywgdGhpcy5nZXRDdXJyZW50U3RpY2t5SGVpZ2h0KCkpO1xuXHRcdFx0XHRpZiAoIXRoaXMuY29tcGFyZVN0aWNreUxpbmVNYXBzKGNvbXB1dGVkLCB0aGlzLmN1cnJlbnRTdGlja3lMaW5lcykpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUNvbnRlbnQoY29tcHV0ZWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIGlmIHdlIGRvbid0IGVuZCB1cCB1cGRhdGluZyB0aGUgY29udGVudCwgd2UgbmVlZCB0byBhdm9pZCBsZWFraW5nIHRoZSBtYXBcblx0XHRcdFx0XHR0aGlzLmRpc3Bvc2VTdGlja3lMaW5lTWFwKGNvbXB1dGVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gQWRkIGhlbHBlciBtZXRob2QgdG8gZGlzcG9zZSBhIG1hcCBvZiBzdGlja3kgbGluZXNcblx0cHJpdmF0ZSBkaXNwb3NlU3RpY2t5TGluZU1hcChtYXA6IE1hcDxPdXRsaW5lRW50cnksIHsgbGluZTogTm90ZWJvb2tTdGlja3lMaW5lOyByZW5kZXJlZDogYm9vbGVhbiB9Pikge1xuXHRcdG1hcC5mb3JFYWNoKHZhbHVlID0+IHtcblx0XHRcdGlmICh2YWx1ZS5saW5lKSB7XG5cdFx0XHRcdHZhbHVlLmxpbmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gdGFrZSBpbiBhbiBjZWxsIGluZGV4LCBhbmQgZ2V0IHRoZSBjb3JyZXNwb25kaW5nIG91dGxpbmUgZW50cnlcblx0c3RhdGljIGdldFZpc2libGVPdXRsaW5lRW50cnkodmlzaWJsZUluZGV4OiBudW1iZXIsIG5vdGVib29rT3V0bGluZUVudHJpZXM6IE91dGxpbmVFbnRyeVtdKTogT3V0bGluZUVudHJ5IHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgbGVmdCA9IDA7XG5cdFx0bGV0IHJpZ2h0ID0gbm90ZWJvb2tPdXRsaW5lRW50cmllcy5sZW5ndGggLSAxO1xuXG5cdFx0d2hpbGUgKGxlZnQgPD0gcmlnaHQpIHtcblx0XHRcdGNvbnN0IG1pZCA9IE1hdGguZmxvb3IoKGxlZnQgKyByaWdodCkgLyAyKTtcblx0XHRcdGlmIChub3RlYm9va091dGxpbmVFbnRyaWVzW21pZF0uaW5kZXggPT09IHZpc2libGVJbmRleCkge1xuXHRcdFx0XHQvLyBFeGFjdCBtYXRjaCBmb3VuZFxuXHRcdFx0XHRjb25zdCByb290RW50cnkgPSBub3RlYm9va091dGxpbmVFbnRyaWVzW21pZF07XG5cdFx0XHRcdGNvbnN0IGZsYXRMaXN0OiBPdXRsaW5lRW50cnlbXSA9IFtdO1xuXHRcdFx0XHRyb290RW50cnkuYXNGbGF0TGlzdChmbGF0TGlzdCk7XG5cdFx0XHRcdHJldHVybiBmbGF0TGlzdC5maW5kKGVudHJ5ID0+IGVudHJ5LmluZGV4ID09PSB2aXNpYmxlSW5kZXgpO1xuXHRcdFx0fSBlbHNlIGlmIChub3RlYm9va091dGxpbmVFbnRyaWVzW21pZF0uaW5kZXggPCB2aXNpYmxlSW5kZXgpIHtcblx0XHRcdFx0bGVmdCA9IG1pZCArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyaWdodCA9IG1pZCAtIDE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTm8gZXhhY3QgbWF0Y2ggZm91bmQgLSBnZXQgdGhlIGNsb3Nlc3Qgc21hbGxlciBlbnRyeVxuXHRcdGlmIChyaWdodCA+PSAwKSB7XG5cdFx0XHRjb25zdCByb290RW50cnkgPSBub3RlYm9va091dGxpbmVFbnRyaWVzW3JpZ2h0XTtcblx0XHRcdGNvbnN0IGZsYXRMaXN0OiBPdXRsaW5lRW50cnlbXSA9IFtdO1xuXHRcdFx0cm9vdEVudHJ5LmFzRmxhdExpc3QoZmxhdExpc3QpO1xuXHRcdFx0cmV0dXJuIGZsYXRMaXN0LmZpbmQoZW50cnkgPT4gZW50cnkuaW5kZXggPT09IHZpc2libGVJbmRleCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29udGVudChuZXdNYXA6IE1hcDxPdXRsaW5lRW50cnksIHsgbGluZTogTm90ZWJvb2tTdGlja3lMaW5lOyByZW5kZXJlZDogYm9vbGVhbiB9Pikge1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5kb21Ob2RlKTtcblx0XHR0aGlzLmRpc3Bvc2VDdXJyZW50U3RpY2t5TGluZXMoKTtcblx0XHR0aGlzLnJlbmRlclN0aWNreUxpbmVzKG5ld01hcCwgdGhpcy5kb21Ob2RlKTtcblxuXHRcdGNvbnN0IG9sZFN0aWNreUhlaWdodCA9IHRoaXMuZ2V0Q3VycmVudFN0aWNreUhlaWdodCgpO1xuXHRcdHRoaXMuc2V0Q3VycmVudFN0aWNreUxpbmVzKG5ld01hcCk7XG5cblx0XHQvLyAoKykgPSBzdGlja3kgaGVpZ2h0IGluY3JlYXNlZFxuXHRcdC8vICgtKSA9IHN0aWNreSBoZWlnaHQgZGVjcmVhc2VkXG5cdFx0Y29uc3Qgc2l6ZURlbHRhID0gdGhpcy5nZXRDdXJyZW50U3RpY2t5SGVpZ2h0KCkgLSBvbGRTdGlja3lIZWlnaHQ7XG5cdFx0aWYgKHNpemVEZWx0YSAhPT0gMCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VOb3RlYm9va1N0aWNreVNjcm9sbC5maXJlKHNpemVEZWx0YSk7XG5cblx0XHRcdGNvbnN0IGQgPSB0aGlzLl9sYXlvdXREaXNwb3NhYmxlU3RvcmUuYWRkKERPTS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKERPTS5nZXRXaW5kb3codGhpcy5nZXREb21Ob2RlKCkpLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMubGF5b3V0Rm4oc2l6ZURlbHRhKTtcblx0XHRcdFx0dGhpcy51cGRhdGVEaXNwbGF5KCk7XG5cblx0XHRcdFx0dGhpcy5fbGF5b3V0RGlzcG9zYWJsZVN0b3JlLmRlbGV0ZShkKTtcblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy51cGRhdGVEaXNwbGF5KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVEaXNwbGF5KCkge1xuXHRcdGNvbnN0IGhhc1N0aWNreSA9IHRoaXMuZ2V0Q3VycmVudFN0aWNreUhlaWdodCgpID4gMDtcblx0XHRpZiAoIWhhc1N0aWNreSkge1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHR9XG5cdH1cblxuXHRzdGF0aWMgY29tcHV0ZVN0aWNreUhlaWdodChlbnRyeTogT3V0bGluZUVudHJ5KSB7XG5cdFx0bGV0IGhlaWdodCA9IDA7XG5cdFx0aWYgKGVudHJ5LmNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBlbnRyeS5sZXZlbCA8IDcpIHtcblx0XHRcdGhlaWdodCArPSAyMjtcblx0XHR9XG5cdFx0d2hpbGUgKGVudHJ5LnBhcmVudCkge1xuXHRcdFx0aGVpZ2h0ICs9IDIyO1xuXHRcdFx0ZW50cnkgPSBlbnRyeS5wYXJlbnQ7XG5cdFx0fVxuXHRcdHJldHVybiBoZWlnaHQ7XG5cdH1cblxuXHRzdGF0aWMgY2hlY2tDb2xsYXBzZWRTdGlja3lMaW5lcyhlbnRyeTogT3V0bGluZUVudHJ5IHwgdW5kZWZpbmVkLCBudW1MaW5lc1RvUmVuZGVyOiBudW1iZXIsIG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IpIHtcblx0XHRsZXQgY3VycmVudEVudHJ5ID0gZW50cnk7XG5cdFx0Y29uc3QgbmV3TWFwID0gbmV3IE1hcDxPdXRsaW5lRW50cnksIHsgbGluZTogTm90ZWJvb2tTdGlja3lMaW5lOyByZW5kZXJlZDogYm9vbGVhbiB9PigpO1xuXG5cdFx0Y29uc3QgZWxlbWVudHNUb1JlbmRlciA9IFtdO1xuXHRcdHdoaWxlIChjdXJyZW50RW50cnkpIHtcblx0XHRcdGlmIChjdXJyZW50RW50cnkubGV2ZWwgPj0gNykge1xuXHRcdFx0XHQvLyBsZXZlbCA3KyByZXByZXNlbnRzIGEgbm9uLWhlYWRlciBlbnRyeSwgd2hpY2ggd2UgZG9uJ3Qgd2FudCB0byByZW5kZXJcblx0XHRcdFx0Y3VycmVudEVudHJ5ID0gY3VycmVudEVudHJ5LnBhcmVudDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaW5lVG9SZW5kZXIgPSBOb3RlYm9va1N0aWNreVNjcm9sbC5jcmVhdGVTdGlja3lFbGVtZW50KGN1cnJlbnRFbnRyeSwgbm90ZWJvb2tFZGl0b3IpO1xuXHRcdFx0bmV3TWFwLnNldChjdXJyZW50RW50cnksIHsgbGluZTogbGluZVRvUmVuZGVyLCByZW5kZXJlZDogZmFsc2UgfSk7XG5cdFx0XHRlbGVtZW50c1RvUmVuZGVyLnVuc2hpZnQobGluZVRvUmVuZGVyKTtcblx0XHRcdGN1cnJlbnRFbnRyeSA9IGN1cnJlbnRFbnRyeS5wYXJlbnQ7XG5cdFx0fVxuXG5cdFx0Ly8gaXRlcmF0ZSBvdmVyIGVsZW1lbnRzIHRvIHJlbmRlciwgYW5kIGFwcGVuZCB0byBjb250YWluZXJcblx0XHQvLyBicmVhayB3aGVuIHdlIHJlYWNoIG51bUxpbmVzVG9SZW5kZXJcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnRzVG9SZW5kZXIubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChpID49IG51bUxpbmVzVG9SZW5kZXIpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRuZXdNYXAuc2V0KGVsZW1lbnRzVG9SZW5kZXJbaV0uZW50cnksIHsgbGluZTogZWxlbWVudHNUb1JlbmRlcltpXSwgcmVuZGVyZWQ6IHRydWUgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXdNYXA7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclN0aWNreUxpbmVzKHN0aWNreU1hcDogTWFwPE91dGxpbmVFbnRyeSwgeyBsaW5lOiBOb3RlYm9va1N0aWNreUxpbmU7IHJlbmRlcmVkOiBib29sZWFuIH0+LCBjb250YWluZXJFbGVtZW50OiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IHJldmVyc2VkRW50cmllcyA9IEFycmF5LmZyb20oc3RpY2t5TWFwLmVudHJpZXMoKSkucmV2ZXJzZSgpO1xuXHRcdGZvciAoY29uc3QgWywgdmFsdWVdIG9mIHJldmVyc2VkRW50cmllcykge1xuXHRcdFx0aWYgKCF2YWx1ZS5yZW5kZXJlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnRhaW5lckVsZW1lbnQuYXBwZW5kKHZhbHVlLmxpbmUuZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0c3RhdGljIGNyZWF0ZVN0aWNreUVsZW1lbnQoZW50cnk6IE91dGxpbmVFbnRyeSwgbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvcikge1xuXHRcdGNvbnN0IHN0aWNreUVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRzdGlja3lFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ25vdGVib29rLXN0aWNreS1zY3JvbGwtZWxlbWVudCcpO1xuXG5cdFx0Y29uc3QgaW5kZW50TW9kZSA9IG5vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5nZXRMYXlvdXRDb25maWd1cmF0aW9uKCkuc3RpY2t5U2Nyb2xsTW9kZTtcblx0XHRpZiAoaW5kZW50TW9kZSA9PT0gJ2luZGVudGVkJykge1xuXHRcdFx0c3RpY2t5RWxlbWVudC5zdHlsZS5wYWRkaW5nTGVmdCA9IE5vdGVib29rU3RpY2t5TGluZS5nZXRQYXJlbnRDb3VudChlbnRyeSkgKiAxMCArICdweCc7XG5cdFx0fVxuXG5cdFx0bGV0IGlzQ29sbGFwc2VkID0gZmFsc2U7XG5cdFx0aWYgKGVudHJ5LmNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCkge1xuXHRcdFx0aXNDb2xsYXBzZWQgPSAoZW50cnkuY2VsbCBhcyBNYXJrdXBDZWxsVmlld01vZGVsKS5mb2xkaW5nU3RhdGUgPT09IENlbGxGb2xkaW5nU3RhdGUuQ29sbGFwc2VkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0aWNreUZvbGRpbmdJY29uID0gbmV3IFN0aWNreUZvbGRpbmdJY29uKGlzQ29sbGFwc2VkLCAxNik7XG5cdFx0c3RpY2t5Rm9sZGluZ0ljb24uZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdub3RlYm9vay1zdGlja3ktc2Nyb2xsLWZvbGRpbmctaWNvbicpO1xuXHRcdHN0aWNreUZvbGRpbmdJY29uLnNldFZpc2libGUodHJ1ZSk7XG5cblx0XHRjb25zdCBzdGlja3lIZWFkZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRzdGlja3lIZWFkZXIuY2xhc3NMaXN0LmFkZCgnbm90ZWJvb2stc3RpY2t5LXNjcm9sbC1oZWFkZXInKTtcblx0XHRzdGlja3lIZWFkZXIuaW5uZXJUZXh0ID0gZW50cnkubGFiZWw7XG5cblx0XHRzdGlja3lFbGVtZW50LmFwcGVuZChzdGlja3lGb2xkaW5nSWNvbi5kb21Ob2RlLCBzdGlja3lIZWFkZXIpO1xuXG5cdFx0cmV0dXJuIG5ldyBOb3RlYm9va1N0aWNreUxpbmUoc3RpY2t5RWxlbWVudCwgc3RpY2t5Rm9sZGluZ0ljb24sIHN0aWNreUhlYWRlciwgZW50cnksIG5vdGVib29rRWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZUN1cnJlbnRTdGlja3lMaW5lcygpIHtcblx0XHR0aGlzLmN1cnJlbnRTdGlja3lMaW5lcy5mb3JFYWNoKCh2YWx1ZSkgPT4ge1xuXHRcdFx0dmFsdWUubGluZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRpc3Bvc2VDdXJyZW50U3RpY2t5TGluZXMoKTtcblx0XHR0aGlzLm5vdGVib29rQ2VsbE91dGxpbmVSZWZlcmVuY2U/LmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVDb250ZW50KG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsIG5vdGVib29rQ2VsbExpc3Q6IElOb3RlYm9va0NlbGxMaXN0LCBub3RlYm9va091dGxpbmVFbnRyaWVzOiBPdXRsaW5lRW50cnlbXSwgcmVuZGVyZWRTdGlja3lIZWlnaHQ6IG51bWJlcik6IE1hcDxPdXRsaW5lRW50cnksIHsgbGluZTogTm90ZWJvb2tTdGlja3lMaW5lOyByZW5kZXJlZDogYm9vbGVhbiB9PiB7XG5cdC8vIGdldCBkYXRhIGFib3V0IHRoZSBjZWxsIGxpc3Qgd2l0aGluIHZpZXdwb3J0IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Y29uc3QgZWRpdG9yU2Nyb2xsVG9wID0gbm90ZWJvb2tFZGl0b3Iuc2Nyb2xsVG9wIC0gcmVuZGVyZWRTdGlja3lIZWlnaHQ7XG5cdGNvbnN0IHZpc2libGVSYW5nZSA9IG5vdGVib29rRWRpdG9yLnZpc2libGVSYW5nZXNbMF07XG5cdGlmICghdmlzaWJsZVJhbmdlKSB7XG5cdFx0cmV0dXJuIG5ldyBNYXAoKTtcblx0fVxuXG5cdC8vIGVkZ2UgY2FzZSBmb3IgY2VsbCAwIGluIHRoZSBub3RlYm9vayBpcyBhIGhlYWRlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0aWYgKHZpc2libGVSYW5nZS5zdGFydCA9PT0gMCkge1xuXHRcdGNvbnN0IGZpcnN0Q2VsbCA9IG5vdGVib29rRWRpdG9yLmNlbGxBdCgwKTtcblx0XHRjb25zdCBmaXJzdENlbGxFbnRyeSA9IE5vdGVib29rU3RpY2t5U2Nyb2xsLmdldFZpc2libGVPdXRsaW5lRW50cnkoMCwgbm90ZWJvb2tPdXRsaW5lRW50cmllcyk7XG5cdFx0aWYgKGZpcnN0Q2VsbCAmJiBmaXJzdENlbGxFbnRyeSAmJiBmaXJzdENlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBmaXJzdENlbGxFbnRyeS5sZXZlbCA8IDcpIHtcblx0XHRcdGlmIChub3RlYm9va0VkaXRvci5zY3JvbGxUb3AgPiAyMikge1xuXHRcdFx0XHRjb25zdCBuZXdNYXAgPSBOb3RlYm9va1N0aWNreVNjcm9sbC5jaGVja0NvbGxhcHNlZFN0aWNreUxpbmVzKGZpcnN0Q2VsbEVudHJ5LCAxMDAsIG5vdGVib29rRWRpdG9yKTtcblx0XHRcdFx0cmV0dXJuIG5ld01hcDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBpdGVyYXRlIG92ZXIgY2VsbHMgaW4gdmlld3BvcnQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdGxldCBjZWxsO1xuXHRsZXQgY2VsbEVudHJ5O1xuXHRjb25zdCBzdGFydEluZGV4ID0gdmlzaWJsZVJhbmdlLnN0YXJ0IC0gMTsgLy8gLTEgdG8gYWNjb3VudCBmb3IgY2VsbHMgaGlkZGVuIFwidW5kZXJcIiBzdGlja3kgbGluZXMuXG5cdGZvciAobGV0IGN1cnJlbnRJbmRleCA9IHN0YXJ0SW5kZXg7IGN1cnJlbnRJbmRleCA8IHZpc2libGVSYW5nZS5lbmQ7IGN1cnJlbnRJbmRleCsrKSB7XG5cdFx0Ly8gc3RvcmUgZGF0YSBmb3IgY3VycmVudCBjZWxsLCBhbmQgbmV4dCBjZWxsXG5cdFx0Y2VsbCA9IG5vdGVib29rRWRpdG9yLmNlbGxBdChjdXJyZW50SW5kZXgpO1xuXHRcdGlmICghY2VsbCkge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXAoKTtcblx0XHR9XG5cdFx0Y2VsbEVudHJ5ID0gTm90ZWJvb2tTdGlja3lTY3JvbGwuZ2V0VmlzaWJsZU91dGxpbmVFbnRyeShjdXJyZW50SW5kZXgsIG5vdGVib29rT3V0bGluZUVudHJpZXMpO1xuXHRcdGlmICghY2VsbEVudHJ5KSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCBuZXh0Q2VsbCA9IG5vdGVib29rRWRpdG9yLmNlbGxBdChjdXJyZW50SW5kZXggKyAxKTtcblx0XHRpZiAoIW5leHRDZWxsKSB7XG5cdFx0XHRjb25zdCBzZWN0aW9uQm90dG9tID0gbm90ZWJvb2tFZGl0b3IuZ2V0TGF5b3V0SW5mbygpLnNjcm9sbEhlaWdodDtcblx0XHRcdGNvbnN0IGxpbmVzVG9SZW5kZXIgPSBNYXRoLmZsb29yKChzZWN0aW9uQm90dG9tKSAvIDIyKTtcblx0XHRcdGNvbnN0IG5ld01hcCA9IE5vdGVib29rU3RpY2t5U2Nyb2xsLmNoZWNrQ29sbGFwc2VkU3RpY2t5TGluZXMoY2VsbEVudHJ5LCBsaW5lc1RvUmVuZGVyLCBub3RlYm9va0VkaXRvcik7XG5cdFx0XHRyZXR1cm4gbmV3TWFwO1xuXHRcdH1cblx0XHRjb25zdCBuZXh0Q2VsbEVudHJ5ID0gTm90ZWJvb2tTdGlja3lTY3JvbGwuZ2V0VmlzaWJsZU91dGxpbmVFbnRyeShjdXJyZW50SW5kZXggKyAxLCBub3RlYm9va091dGxpbmVFbnRyaWVzKTtcblx0XHRpZiAoIW5leHRDZWxsRW50cnkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdC8vIGNoZWNrIG5leHQgY2VsbCwgaWYgbWFya2Rvd24gd2l0aCBub24gbGV2ZWwgNyBlbnRyeSwgdGhhdCBtZWFucyB0aGlzIGlzIHRoZSBlbmQgb2YgdGhlIHNlY3Rpb24gKG5ldyBoZWFkZXIpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdGlmIChuZXh0Q2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwICYmIG5leHRDZWxsRW50cnkubGV2ZWwgPCA3KSB7XG5cdFx0XHRjb25zdCBzZWN0aW9uQm90dG9tID0gbm90ZWJvb2tDZWxsTGlzdC5nZXRDZWxsVmlld1Njcm9sbFRvcChuZXh0Q2VsbCk7XG5cdFx0XHRjb25zdCBjdXJyZW50U2VjdGlvblN0aWNreUhlaWdodCA9IE5vdGVib29rU3RpY2t5U2Nyb2xsLmNvbXB1dGVTdGlja3lIZWlnaHQoY2VsbEVudHJ5KTtcblx0XHRcdGNvbnN0IG5leHRTZWN0aW9uU3RpY2t5SGVpZ2h0ID0gTm90ZWJvb2tTdGlja3lTY3JvbGwuY29tcHV0ZVN0aWNreUhlaWdodChuZXh0Q2VsbEVudHJ5KTtcblxuXHRcdFx0Ly8gY2FzZTogd2UgY2FuIHJlbmRlciB0aGUgYWxsIHN0aWNreSBsaW5lcyBmb3IgdGhlIGN1cnJlbnQgc2VjdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHRcdGlmIChlZGl0b3JTY3JvbGxUb3AgKyBjdXJyZW50U2VjdGlvblN0aWNreUhlaWdodCA8IHNlY3Rpb25Cb3R0b20pIHtcblx0XHRcdFx0Y29uc3QgbGluZXNUb1JlbmRlciA9IE1hdGguZmxvb3IoKHNlY3Rpb25Cb3R0b20gLSBlZGl0b3JTY3JvbGxUb3ApIC8gMjIpO1xuXHRcdFx0XHRjb25zdCBuZXdNYXAgPSBOb3RlYm9va1N0aWNreVNjcm9sbC5jaGVja0NvbGxhcHNlZFN0aWNreUxpbmVzKGNlbGxFbnRyeSwgbGluZXNUb1JlbmRlciwgbm90ZWJvb2tFZGl0b3IpO1xuXHRcdFx0XHRyZXR1cm4gbmV3TWFwO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBjYXNlOiBuZXh0IHNlY3Rpb24gaXMgdGhlIHNhbWUgc2l6ZSBvciBiaWdnZXIsIHJlbmRlciBuZXh0IGVudHJ5IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdFx0XHRlbHNlIGlmIChuZXh0U2VjdGlvblN0aWNreUhlaWdodCA+PSBjdXJyZW50U2VjdGlvblN0aWNreUhlaWdodCkge1xuXHRcdFx0XHRjb25zdCBuZXdNYXAgPSBOb3RlYm9va1N0aWNreVNjcm9sbC5jaGVja0NvbGxhcHNlZFN0aWNreUxpbmVzKG5leHRDZWxsRW50cnksIDEwMCwgbm90ZWJvb2tFZGl0b3IpO1xuXHRcdFx0XHRyZXR1cm4gbmV3TWFwO1xuXHRcdFx0fVxuXHRcdFx0Ly8gY2FzZTogbmV4dCBzZWN0aW9uIGlzIHRoZSBzbWFsbGVyLCBzaHJpbmsgdW50aWwgbmV4dCBzZWN0aW9uIGhlaWdodCBpcyBncmVhdGVyIHRoYW4gdGhlIGF2YWlsYWJsZSBzcGFjZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHRcdGVsc2UgaWYgKG5leHRTZWN0aW9uU3RpY2t5SGVpZ2h0IDwgY3VycmVudFNlY3Rpb25TdGlja3lIZWlnaHQpIHtcblx0XHRcdFx0Y29uc3QgYXZhaWxhYmxlU3BhY2UgPSBzZWN0aW9uQm90dG9tIC0gZWRpdG9yU2Nyb2xsVG9wO1xuXG5cdFx0XHRcdGlmIChhdmFpbGFibGVTcGFjZSA+PSBuZXh0U2VjdGlvblN0aWNreUhlaWdodCkge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVzVG9SZW5kZXIgPSBNYXRoLmZsb29yKChhdmFpbGFibGVTcGFjZSkgLyAyMik7XG5cdFx0XHRcdFx0Y29uc3QgbmV3TWFwID0gTm90ZWJvb2tTdGlja3lTY3JvbGwuY2hlY2tDb2xsYXBzZWRTdGlja3lMaW5lcyhjZWxsRW50cnksIGxpbmVzVG9SZW5kZXIsIG5vdGVib29rRWRpdG9yKTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3TWFwO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IG5ld01hcCA9IE5vdGVib29rU3RpY2t5U2Nyb2xsLmNoZWNrQ29sbGFwc2VkU3RpY2t5TGluZXMobmV4dENlbGxFbnRyeSwgMTAwLCBub3RlYm9va0VkaXRvcik7XG5cdFx0XHRcdFx0cmV0dXJuIG5ld01hcDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSAvLyB2aXNpYmxlIHJhbmdlIGxvb3AgY2xvc2VcblxuXHQvLyBjYXNlOiBhbGwgdmlzaWJsZSBjZWxscyB3ZXJlIG5vbi1oZWFkZXIgY2VsbHMsIHNvIHJlbmRlciBhbnkgaGVhZGVycyByZWxldmFudCB0byB0aGVpciBzZWN0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdGNvbnN0IHNlY3Rpb25Cb3R0b20gPSBub3RlYm9va0VkaXRvci5nZXRMYXlvdXRJbmZvKCkuc2Nyb2xsSGVpZ2h0O1xuXHRjb25zdCBsaW5lc1RvUmVuZGVyID0gTWF0aC5mbG9vcigoc2VjdGlvbkJvdHRvbSAtIGVkaXRvclNjcm9sbFRvcCkgLyAyMik7XG5cdGNvbnN0IG5ld01hcCA9IE5vdGVib29rU3RpY2t5U2Nyb2xsLmNoZWNrQ29sbGFwc2VkU3RpY2t5TGluZXMoY2VsbEVudHJ5LCBsaW5lc1RvUmVuZGVyLCBub3RlYm9va0VkaXRvcik7XG5cdHJldHVybiBuZXdNYXA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQTJCLDBCQUEwQjtBQUNyRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSx1QkFBd0M7QUFDN0QsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsd0JBQXlDO0FB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QUFPRjtBQUFBLE1BQ1IsV0FHUywyQkFBMkIsNEJBQTRCO0FBQy9ELGNBQU1BLFVBQVMscUJBQXFCLDBCQUEwQixlQUFlLEtBQUssY0FBYztBQUNoRyxlQUFPQTtBQUFBLE1BQ1IsV0FFUywwQkFBMEIsNEJBQTRCO0FBQzlELGNBQU0saUJBQWlCQyxpQkFBZ0I7QUFFdkMsWUFBSSxrQkFBa0IseUJBQXlCO0FBQzlDLGdCQUFNQyxpQkFBZ0IsS0FBSyxNQUFPLGlCQUFrQixFQUFFO0FBQ3RELGdCQUFNRixVQUFTLHFCQUFxQiwwQkFBMEIsV0FBV0UsZ0JBQWUsY0FBYztBQUN0RyxpQkFBT0Y7QUFBQSxRQUNSLE9BQU87QUFDTixnQkFBTUEsVUFBUyxxQkFBcUIsMEJBQTBCLGVBQWUsS0FBSyxjQUFjO0FBQ2hHLGlCQUFPQTtBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFHQSxRQUFNLGdCQUFnQixlQUFlLGNBQWMsRUFBRTtBQUNyRCxRQUFNLGdCQUFnQixLQUFLLE9BQU8sZ0JBQWdCLG1CQUFtQixFQUFFO0FBQ3ZFLFFBQU0sU0FBUyxxQkFBcUIsMEJBQTBCLFdBQVcsZUFBZSxjQUFjO0FBQ3RHLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiY29tcHV0ZWQiLCAibmV3TWFwIiwgInNlY3Rpb25Cb3R0b20iLCAibGluZXNUb1JlbmRlciJdCn0K
