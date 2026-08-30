import { Disposable, DisposableStore, dispose, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { localize2 } from "../../../../../../nls.js";
import { Categories } from "../../../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
import { CellStatusbarAlignment } from "../../../common/notebookCommon.js";
import { INotebookService } from "../../../common/notebookService.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { n } from "../../../../../../base/browser/dom.js";
class TroubleshootController extends Disposable {
  constructor(_notebookEditor) {
    super();
    this._notebookEditor = _notebookEditor;
    this._localStore = this._register(new DisposableStore());
    this._cellDisposables = [];
    this._enabled = false;
    this._cellStatusItems = [];
    this._register(this._notebookEditor.onDidChangeModel(() => {
      this._update();
    }));
    this._update();
  }
  toggle() {
    this._enabled = !this._enabled;
    this._update();
  }
  _update() {
    this._localStore.clear();
    this._cellDisposables.forEach((d) => d.dispose());
    this._cellDisposables = [];
    this._removeNotebookOverlay();
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    if (this._enabled) {
      this._updateListener();
      this._createNotebookOverlay();
      this._createCellOverlays();
    }
  }
  _log(cell, e) {
    if (this._enabled) {
      const oldHeight = this._notebookEditor.getViewHeight(cell);
      console.log(`cell#${cell.handle}`, e, `${oldHeight} -> ${cell.layoutInfo.totalHeight}`);
    }
  }
  _createCellOverlays() {
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    for (let i = 0; i < this._notebookEditor.getLength(); i++) {
      const cell = this._notebookEditor.cellAt(i);
      this._createCellOverlay(cell, i);
    }
    this._localStore.add(this._notebookEditor.onDidChangeViewCells((e) => {
      const addedCells = e.splices.reduce((acc, [, , newCells]) => [...acc, ...newCells], []);
      for (let i = 0; i < addedCells.length; i++) {
        const cellIndex = this._notebookEditor.getCellIndex(addedCells[i]);
        if (cellIndex !== void 0) {
          this._createCellOverlay(addedCells[i], cellIndex);
        }
      }
    }));
  }
  _createNotebookOverlay() {
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    const listViewTop = this._notebookEditor.getLayoutInfo().listViewOffsetTop;
    const scrollTop = this._notebookEditor.scrollTop;
    const overlay = n.div({
      style: {
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: "1000"
      }
    }, [
      // Top line
      n.div({
        style: {
          position: "absolute",
          top: `${listViewTop}px`,
          left: "0",
          width: "100%",
          height: "2px",
          backgroundColor: "rgba(0, 0, 255, 0.7)"
        }
      }),
      // Text label for the notebook overlay
      n.div({
        style: {
          position: "absolute",
          top: `${listViewTop}px`,
          left: "10px",
          backgroundColor: "rgba(0, 0, 255, 0.7)",
          color: "white",
          fontSize: "11px",
          fontWeight: "bold",
          padding: "2px 6px",
          borderRadius: "3px",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: "1001"
        }
      }, [`ScrollTop: ${scrollTop}px`])
    ]).keepUpdated(this._store);
    this._notebookOverlayDomNode = overlay.element;
    if (this._notebookOverlayDomNode) {
      this._notebookEditor.getDomNode().appendChild(this._notebookOverlayDomNode);
    }
    this._localStore.add(this._notebookEditor.onDidScroll(() => {
      const scrollTop2 = this._notebookEditor.scrollTop;
      const listViewTop2 = this._notebookEditor.getLayoutInfo().listViewOffsetTop;
      if (this._notebookOverlayDomNode) {
        const labelElement = this._notebookOverlayDomNode.querySelector("div:nth-child(2)");
        if (labelElement) {
          labelElement.textContent = `ScrollTop: ${scrollTop2}px`;
          labelElement.style.top = `${listViewTop2}px`;
        }
        const topLineElement = this._notebookOverlayDomNode.querySelector("div:first-child");
        if (topLineElement) {
          topLineElement.style.top = `${listViewTop2}px`;
        }
      }
    }));
  }
  _createCellOverlay(cell, index) {
    const overlayContainer = document.createElement("div");
    overlayContainer.style.position = "absolute";
    overlayContainer.style.top = "0";
    overlayContainer.style.left = "0";
    overlayContainer.style.width = "100%";
    overlayContainer.style.height = "100%";
    overlayContainer.style.pointerEvents = "none";
    overlayContainer.style.zIndex = "1000";
    const topLine = document.createElement("div");
    topLine.style.position = "absolute";
    topLine.style.top = "0";
    topLine.style.left = "0";
    topLine.style.width = "100%";
    topLine.style.height = "2px";
    topLine.style.backgroundColor = "rgba(255, 0, 0, 0.7)";
    overlayContainer.appendChild(topLine);
    const getLayoutInfo = () => {
      const eol = cell.textBuffer.getEOL() === "\n" ? "LF" : "CRLF";
      let scrollTop = "";
      if (cell.layoutInfo.layoutState > 0) {
        scrollTop = `| AbsoluteTopOfElement: ${this._notebookEditor.getAbsoluteTopOfElement(cell)}px`;
      }
      return `cell #${index} (handle: ${cell.handle}) ${scrollTop} | EOL: ${eol}`;
    };
    const label = document.createElement("div");
    label.textContent = getLayoutInfo();
    label.style.position = "absolute";
    label.style.top = "0px";
    label.style.right = "10px";
    label.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
    label.style.color = "white";
    label.style.fontSize = "11px";
    label.style.fontWeight = "bold";
    label.style.padding = "2px 6px";
    label.style.borderRadius = "3px";
    label.style.whiteSpace = "nowrap";
    label.style.pointerEvents = "none";
    label.style.zIndex = "1001";
    overlayContainer.appendChild(label);
    let overlayId = void 0;
    this._notebookEditor.changeCellOverlays((accessor) => {
      overlayId = accessor.addOverlay({
        cell,
        domNode: overlayContainer
      });
    });
    if (overlayId) {
      const updateLayout = () => {
        label.textContent = getLayoutInfo();
        if (overlayId) {
          this._notebookEditor.changeCellOverlays((accessor) => {
            accessor.layoutOverlay(overlayId);
          });
        }
      };
      const disposables = this._cellDisposables[index];
      disposables.add(cell.onDidChangeLayout((e) => {
        updateLayout();
      }));
      disposables.add(cell.textBuffer.onDidChangeContent(() => {
        updateLayout();
      }));
      if (cell.textModel) {
        disposables.add(cell.textModel.onDidChangeContent(() => {
          updateLayout();
        }));
      }
      disposables.add(this._notebookEditor.onDidChangeLayout(() => {
        updateLayout();
      }));
      disposables.add(toDisposable(() => {
        this._notebookEditor.changeCellOverlays((accessor) => {
          if (overlayId) {
            accessor.removeOverlay(overlayId);
          }
        });
      }));
    }
  }
  _removeNotebookOverlay() {
    if (this._notebookOverlayDomNode) {
      this._notebookOverlayDomNode.remove();
      this._notebookOverlayDomNode = void 0;
    }
  }
  _updateListener() {
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    for (let i = 0; i < this._notebookEditor.getLength(); i++) {
      const cell = this._notebookEditor.cellAt(i);
      const disposableStore = new DisposableStore();
      this._cellDisposables.push(disposableStore);
      disposableStore.add(cell.onDidChangeLayout((e) => {
        this._log(cell, e);
      }));
    }
    this._localStore.add(this._notebookEditor.onDidChangeViewCells((e) => {
      [...e.splices].reverse().forEach((splice) => {
        const [start, deleted, newCells] = splice;
        const deletedCells = this._cellDisposables.splice(start, deleted, ...newCells.map((cell) => {
          const disposableStore = new DisposableStore();
          disposableStore.add(cell.onDidChangeLayout((e2) => {
            this._log(cell, e2);
          }));
          return disposableStore;
        }));
        dispose(deletedCells);
      });
      const addedCells = e.splices.reduce((acc, [, , newCells]) => [...acc, ...newCells], []);
      for (let i = 0; i < addedCells.length; i++) {
        const cellIndex = this._notebookEditor.getCellIndex(addedCells[i]);
        if (cellIndex !== void 0) {
          this._createCellOverlay(addedCells[i], cellIndex);
        }
      }
    }));
    const vm = this._notebookEditor.getViewModel();
    let items = [];
    if (this._enabled) {
      items = this._getItemsForCells();
    }
    this._cellStatusItems = vm.deltaCellStatusBarItems(this._cellStatusItems, items);
  }
  _getItemsForCells() {
    const items = [];
    for (let i = 0; i < this._notebookEditor.getLength(); i++) {
      items.push({
        handle: i,
        items: [
          {
            text: `index: ${i}`,
            alignment: CellStatusbarAlignment.Left,
            priority: Number.MAX_SAFE_INTEGER
          }
        ]
      });
    }
    return items;
  }
  dispose() {
    dispose(this._cellDisposables);
    this._removeNotebookOverlay();
    this._localStore.clear();
    super.dispose();
  }
}
TroubleshootController.id = "workbench.notebook.troubleshoot";
registerNotebookContribution(TroubleshootController.id, TroubleshootController);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.toggleLayoutTroubleshoot",
      title: localize2("workbench.notebook.toggleLayoutTroubleshoot", "Toggle Notebook Layout Troubleshoot"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
      return;
    }
    const controller = editor.getContribution(TroubleshootController.id);
    controller?.toggle();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.inspectLayout",
      title: localize2("workbench.notebook.inspectLayout", "Inspect Notebook Layout"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor || !editor.hasModel()) {
      return;
    }
    for (let i = 0; i < editor.getLength(); i++) {
      const cell = editor.cellAt(i);
      console.log(`cell#${cell.handle}`, cell.layoutInfo);
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.clearNotebookEdtitorTypeCache",
      title: localize2("workbench.notebook.clearNotebookEdtitorTypeCache", "Clear Notebook Editor Type Cache"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const notebookService = accessor.get(INotebookService);
    notebookService.clearEditorCache();
  }
});
export {
  TroubleshootController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFx0cm91Ymxlc2hvb3RcXGxheW91dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSwgSUNlbGxWaWV3TW9kZWwsIElOb3RlYm9va0RlbHRhQ2VsbFN0YXR1c0Jhckl0ZW1zLCBJTm90ZWJvb2tFZGl0b3IsIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck5vdGVib29rQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tFZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ2VsbFN0YXR1c2JhckFsaWdubWVudCwgSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW0gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuXG5leHBvcnQgY2xhc3MgVHJvdWJsZXNob290Q29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24ge1xuXHRzdGF0aWMgaWQ6IHN0cmluZyA9ICd3b3JrYmVuY2gubm90ZWJvb2sudHJvdWJsZXNob290JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbFN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfY2VsbERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmVbXSA9IFtdO1xuXHRwcml2YXRlIF9lbmFibGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2NlbGxTdGF0dXNJdGVtczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBfbm90ZWJvb2tPdmVybGF5RG9tTm9kZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvcikge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ub3RlYm9va0VkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHR9XG5cblx0dG9nZ2xlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2VuYWJsZWQgPSAhdGhpcy5fZW5hYmxlZDtcblx0XHR0aGlzLl91cGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZSgpIHtcblx0XHR0aGlzLl9sb2NhbFN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy5fY2VsbERpc3Bvc2FibGVzLmZvckVhY2goZCA9PiBkLmRpc3Bvc2UoKSk7XG5cdFx0dGhpcy5fY2VsbERpc3Bvc2FibGVzID0gW107XG5cdFx0dGhpcy5fcmVtb3ZlTm90ZWJvb2tPdmVybGF5KCk7XG5cblx0XHRpZiAoIXRoaXMuX25vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlTGlzdGVuZXIoKTtcblx0XHRcdHRoaXMuX2NyZWF0ZU5vdGVib29rT3ZlcmxheSgpO1xuXHRcdFx0dGhpcy5fY3JlYXRlQ2VsbE92ZXJsYXlzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbG9nKGNlbGw6IElDZWxsVmlld01vZGVsLCBlOiBhbnkpIHtcblx0XHRpZiAodGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0Y29uc3Qgb2xkSGVpZ2h0ID0gKHRoaXMuX25vdGVib29rRWRpdG9yIGFzIE5vdGVib29rRWRpdG9yV2lkZ2V0KS5nZXRWaWV3SGVpZ2h0KGNlbGwpO1xuXHRcdFx0Y29uc29sZS5sb2coYGNlbGwjJHtjZWxsLmhhbmRsZX1gLCBlLCBgJHtvbGRIZWlnaHR9IC0+ICR7Y2VsbC5sYXlvdXRJbmZvLnRvdGFsSGVpZ2h0fWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUNlbGxPdmVybGF5cygpIHtcblx0XHRpZiAoIXRoaXMuX25vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX25vdGVib29rRWRpdG9yLmdldExlbmd0aCgpOyBpKyspIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5jZWxsQXQoaSk7XG5cdFx0XHR0aGlzLl9jcmVhdGVDZWxsT3ZlcmxheShjZWxsLCBpKTtcblx0XHR9XG5cblx0XHQvLyBBZGQgbGlzdGVuZXIgZm9yIG5ldyBjZWxsc1xuXHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX25vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlVmlld0NlbGxzKGUgPT4ge1xuXHRcdFx0Y29uc3QgYWRkZWRDZWxscyA9IGUuc3BsaWNlcy5yZWR1Y2UoKGFjYywgWywgLCBuZXdDZWxsc10pID0+IFsuLi5hY2MsIC4uLm5ld0NlbGxzXSwgW10gYXMgSUNlbGxWaWV3TW9kZWxbXSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFkZGVkQ2VsbHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY2VsbEluZGV4ID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEluZGV4KGFkZGVkQ2VsbHNbaV0pO1xuXHRcdFx0XHRpZiAoY2VsbEluZGV4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9jcmVhdGVDZWxsT3ZlcmxheShhZGRlZENlbGxzW2ldLCBjZWxsSW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlTm90ZWJvb2tPdmVybGF5KCkge1xuXHRcdGlmICghdGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpc3RWaWV3VG9wID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0TGF5b3V0SW5mbygpLmxpc3RWaWV3T2Zmc2V0VG9wO1xuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuX25vdGVib29rRWRpdG9yLnNjcm9sbFRvcDtcblxuXHRcdGNvbnN0IG92ZXJsYXkgPSBuLmRpdih7XG5cdFx0XHRzdHlsZToge1xuXHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJyxcblx0XHRcdFx0dG9wOiAnMCcsXG5cdFx0XHRcdGxlZnQ6ICcwJyxcblx0XHRcdFx0d2lkdGg6ICcxMDAlJyxcblx0XHRcdFx0aGVpZ2h0OiAnMTAwJScsXG5cdFx0XHRcdHBvaW50ZXJFdmVudHM6ICdub25lJyxcblx0XHRcdFx0ekluZGV4OiAnMTAwMCdcblx0XHRcdH1cblx0XHR9LCBbXG5cdFx0XHQvLyBUb3AgbGluZVxuXHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRcdHRvcDogYCR7bGlzdFZpZXdUb3B9cHhgLFxuXHRcdFx0XHRcdGxlZnQ6ICcwJyxcblx0XHRcdFx0XHR3aWR0aDogJzEwMCUnLFxuXHRcdFx0XHRcdGhlaWdodDogJzJweCcsXG5cdFx0XHRcdFx0YmFja2dyb3VuZENvbG9yOiAncmdiYSgwLCAwLCAyNTUsIDAuNyknXG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0Ly8gVGV4dCBsYWJlbCBmb3IgdGhlIG5vdGVib29rIG92ZXJsYXlcblx0XHRcdG4uZGl2KHtcblx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJyxcblx0XHRcdFx0XHR0b3A6IGAke2xpc3RWaWV3VG9wfXB4YCxcblx0XHRcdFx0XHRsZWZ0OiAnMTBweCcsXG5cdFx0XHRcdFx0YmFja2dyb3VuZENvbG9yOiAncmdiYSgwLCAwLCAyNTUsIDAuNyknLFxuXHRcdFx0XHRcdGNvbG9yOiAnd2hpdGUnLFxuXHRcdFx0XHRcdGZvbnRTaXplOiAnMTFweCcsXG5cdFx0XHRcdFx0Zm9udFdlaWdodDogJ2JvbGQnLFxuXHRcdFx0XHRcdHBhZGRpbmc6ICcycHggNnB4Jyxcblx0XHRcdFx0XHRib3JkZXJSYWRpdXM6ICczcHgnLFxuXHRcdFx0XHRcdHdoaXRlU3BhY2U6ICdub3dyYXAnLFxuXHRcdFx0XHRcdHBvaW50ZXJFdmVudHM6ICdub25lJyxcblx0XHRcdFx0XHR6SW5kZXg6ICcxMDAxJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBbYFNjcm9sbFRvcDogJHtzY3JvbGxUb3B9cHhgXSlcblx0XHRdKS5rZWVwVXBkYXRlZCh0aGlzLl9zdG9yZSk7XG5cblx0XHR0aGlzLl9ub3RlYm9va092ZXJsYXlEb21Ob2RlID0gb3ZlcmxheS5lbGVtZW50O1xuXG5cdFx0aWYgKHRoaXMuX25vdGVib29rT3ZlcmxheURvbU5vZGUpIHtcblx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yLmdldERvbU5vZGUoKS5hcHBlbmRDaGlsZCh0aGlzLl9ub3RlYm9va092ZXJsYXlEb21Ob2RlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2NhbFN0b3JlLmFkZCh0aGlzLl9ub3RlYm9va0VkaXRvci5vbkRpZFNjcm9sbCgoKSA9PiB7XG5cdFx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5zY3JvbGxUb3A7XG5cdFx0XHRjb25zdCBsaXN0Vmlld1RvcCA9IHRoaXMuX25vdGVib29rRWRpdG9yLmdldExheW91dEluZm8oKS5saXN0Vmlld09mZnNldFRvcDtcblxuXHRcdFx0aWYgKHRoaXMuX25vdGVib29rT3ZlcmxheURvbU5vZGUpIHtcblx0XHRcdFx0Ly8gVXBkYXRlIGxhYmVsXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSB0aGlzLl9ub3RlYm9va092ZXJsYXlEb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJ2RpdjpudGgtY2hpbGQoMiknKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdFx0aWYgKGxhYmVsRWxlbWVudCkge1xuXHRcdFx0XHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IGBTY3JvbGxUb3A6ICR7c2Nyb2xsVG9wfXB4YDtcblx0XHRcdFx0XHRsYWJlbEVsZW1lbnQuc3R5bGUudG9wID0gYCR7bGlzdFZpZXdUb3B9cHhgO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVXBkYXRlIHRvcCBsaW5lXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRjb25zdCB0b3BMaW5lRWxlbWVudCA9IHRoaXMuX25vdGVib29rT3ZlcmxheURvbU5vZGUucXVlcnlTZWxlY3RvcignZGl2OmZpcnN0LWNoaWxkJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRcdGlmICh0b3BMaW5lRWxlbWVudCkge1xuXHRcdFx0XHRcdHRvcExpbmVFbGVtZW50LnN0eWxlLnRvcCA9IGAke2xpc3RWaWV3VG9wfXB4YDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUNlbGxPdmVybGF5KGNlbGw6IElDZWxsVmlld01vZGVsLCBpbmRleDogbnVtYmVyKSB7XG5cdFx0Y29uc3Qgb3ZlcmxheUNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdG92ZXJsYXlDb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdG92ZXJsYXlDb250YWluZXIuc3R5bGUudG9wID0gJzAnO1xuXHRcdG92ZXJsYXlDb250YWluZXIuc3R5bGUubGVmdCA9ICcwJztcblx0XHRvdmVybGF5Q29udGFpbmVyLnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRcdG92ZXJsYXlDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRcdG92ZXJsYXlDb250YWluZXIuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcblx0XHRvdmVybGF5Q29udGFpbmVyLnN0eWxlLnpJbmRleCA9ICcxMDAwJztcblx0XHRjb25zdCB0b3BMaW5lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dG9wTGluZS5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0dG9wTGluZS5zdHlsZS50b3AgPSAnMCc7XG5cdFx0dG9wTGluZS5zdHlsZS5sZWZ0ID0gJzAnO1xuXHRcdHRvcExpbmUuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdFx0dG9wTGluZS5zdHlsZS5oZWlnaHQgPSAnMnB4Jztcblx0XHR0b3BMaW5lLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICdyZ2JhKDI1NSwgMCwgMCwgMC43KSc7XG5cdFx0b3ZlcmxheUNvbnRhaW5lci5hcHBlbmRDaGlsZCh0b3BMaW5lKTtcblxuXHRcdGNvbnN0IGdldExheW91dEluZm8gPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBlb2wgPSBjZWxsLnRleHRCdWZmZXIuZ2V0RU9MKCkgPT09ICdcXG4nID8gJ0xGJyA6ICdDUkxGJztcblx0XHRcdGxldCBzY3JvbGxUb3AgPSAnJztcblx0XHRcdGlmIChjZWxsLmxheW91dEluZm8ubGF5b3V0U3RhdGUgPiAwKSB7XG5cdFx0XHRcdHNjcm9sbFRvcCA9IGB8IEFic29sdXRlVG9wT2ZFbGVtZW50OiAke3RoaXMuX25vdGVib29rRWRpdG9yLmdldEFic29sdXRlVG9wT2ZFbGVtZW50KGNlbGwpfXB4YDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBgY2VsbCAjJHtpbmRleH0gKGhhbmRsZTogJHtjZWxsLmhhbmRsZX0pICR7c2Nyb2xsVG9wfSB8IEVPTDogJHtlb2x9YDtcblx0XHR9O1xuXHRcdGNvbnN0IGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0bGFiZWwudGV4dENvbnRlbnQgPSBnZXRMYXlvdXRJbmZvKCk7XG5cdFx0bGFiZWwuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdGxhYmVsLnN0eWxlLnRvcCA9ICcwcHgnO1xuXHRcdGxhYmVsLnN0eWxlLnJpZ2h0ID0gJzEwcHgnO1xuXHRcdGxhYmVsLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICdyZ2JhKDI1NSwgMCwgMCwgMC41KSc7XG5cdFx0bGFiZWwuc3R5bGUuY29sb3IgPSAnd2hpdGUnO1xuXHRcdGxhYmVsLnN0eWxlLmZvbnRTaXplID0gJzExcHgnO1xuXHRcdGxhYmVsLnN0eWxlLmZvbnRXZWlnaHQgPSAnYm9sZCc7XG5cdFx0bGFiZWwuc3R5bGUucGFkZGluZyA9ICcycHggNnB4Jztcblx0XHRsYWJlbC5zdHlsZS5ib3JkZXJSYWRpdXMgPSAnM3B4Jztcblx0XHRsYWJlbC5zdHlsZS53aGl0ZVNwYWNlID0gJ25vd3JhcCc7XG5cdFx0bGFiZWwuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcblx0XHRsYWJlbC5zdHlsZS56SW5kZXggPSAnMTAwMSc7XG5cdFx0b3ZlcmxheUNvbnRhaW5lci5hcHBlbmRDaGlsZChsYWJlbCk7XG5cblx0XHRsZXQgb3ZlcmxheUlkOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IuY2hhbmdlQ2VsbE92ZXJsYXlzKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0b3ZlcmxheUlkID0gYWNjZXNzb3IuYWRkT3ZlcmxheSh7XG5cdFx0XHRcdGNlbGwsXG5cdFx0XHRcdGRvbU5vZGU6IG92ZXJsYXlDb250YWluZXJcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0aWYgKG92ZXJsYXlJZCkge1xuXG5cdFx0XHQvLyBVcGRhdGUgb3ZlcmxheSB3aGVuIGxheW91dCBjaGFuZ2VzXG5cdFx0XHRjb25zdCB1cGRhdGVMYXlvdXQgPSAoKSA9PiB7XG5cdFx0XHRcdC8vIFVwZGF0ZSBsYWJlbCB0ZXh0XG5cdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gZ2V0TGF5b3V0SW5mbygpO1xuXG5cdFx0XHRcdC8vIFJlZnJlc2ggdGhlIG92ZXJsYXkgcG9zaXRpb25cblx0XHRcdFx0aWYgKG92ZXJsYXlJZCkge1xuXHRcdFx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yLmNoYW5nZUNlbGxPdmVybGF5cygoYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0XHRcdGFjY2Vzc29yLmxheW91dE92ZXJsYXkob3ZlcmxheUlkISk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5fY2VsbERpc3Bvc2FibGVzW2luZGV4XTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChjZWxsLm9uRGlkQ2hhbmdlTGF5b3V0KChlKSA9PiB7XG5cdFx0XHRcdHVwZGF0ZUxheW91dCgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNlbGwudGV4dEJ1ZmZlci5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHR1cGRhdGVMYXlvdXQoKTtcblx0XHRcdH0pKTtcblx0XHRcdGlmIChjZWxsLnRleHRNb2RlbCkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoY2VsbC50ZXh0TW9kZWwub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHtcblx0XHRcdFx0XHR1cGRhdGVMYXlvdXQoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX25vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlTGF5b3V0KCgpID0+IHtcblx0XHRcdFx0dXBkYXRlTGF5b3V0KCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IuY2hhbmdlQ2VsbE92ZXJsYXlzKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRcdGlmIChvdmVybGF5SWQpIHtcblx0XHRcdFx0XHRcdGFjY2Vzc29yLnJlbW92ZU92ZXJsYXkob3ZlcmxheUlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlTm90ZWJvb2tPdmVybGF5KCkge1xuXHRcdGlmICh0aGlzLl9ub3RlYm9va092ZXJsYXlEb21Ob2RlKSB7XG5cdFx0XHR0aGlzLl9ub3RlYm9va092ZXJsYXlEb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tPdmVybGF5RG9tTm9kZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVMaXN0ZW5lcigpIHtcblx0XHRpZiAoIXRoaXMuX25vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX25vdGVib29rRWRpdG9yLmdldExlbmd0aCgpOyBpKyspIHtcblx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5jZWxsQXQoaSk7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHRoaXMuX2NlbGxEaXNwb3NhYmxlcy5wdXNoKGRpc3Bvc2FibGVTdG9yZSk7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGNlbGwub25EaWRDaGFuZ2VMYXlvdXQoZSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZyhjZWxsLCBlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2NhbFN0b3JlLmFkZCh0aGlzLl9ub3RlYm9va0VkaXRvci5vbkRpZENoYW5nZVZpZXdDZWxscyhlID0+IHtcblx0XHRcdFsuLi5lLnNwbGljZXNdLnJldmVyc2UoKS5mb3JFYWNoKHNwbGljZSA9PiB7XG5cdFx0XHRcdGNvbnN0IFtzdGFydCwgZGVsZXRlZCwgbmV3Q2VsbHNdID0gc3BsaWNlO1xuXHRcdFx0XHRjb25zdCBkZWxldGVkQ2VsbHMgPSB0aGlzLl9jZWxsRGlzcG9zYWJsZXMuc3BsaWNlKHN0YXJ0LCBkZWxldGVkLCAuLi5uZXdDZWxscy5tYXAoY2VsbCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQoY2VsbC5vbkRpZENoYW5nZUxheW91dChlID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZyhjZWxsLCBlKTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0cmV0dXJuIGRpc3Bvc2FibGVTdG9yZTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGRpc3Bvc2UoZGVsZXRlZENlbGxzKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBBZGQgdGhlIG92ZXJsYXlzXG5cdFx0XHRjb25zdCBhZGRlZENlbGxzID0gZS5zcGxpY2VzLnJlZHVjZSgoYWNjLCBbLCAsIG5ld0NlbGxzXSkgPT4gWy4uLmFjYywgLi4ubmV3Q2VsbHNdLCBbXSBhcyBJQ2VsbFZpZXdNb2RlbFtdKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYWRkZWRDZWxscy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjZWxsSW5kZXggPSB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgoYWRkZWRDZWxsc1tpXSk7XG5cdFx0XHRcdGlmIChjZWxsSW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX2NyZWF0ZUNlbGxPdmVybGF5KGFkZGVkQ2VsbHNbaV0sIGNlbGxJbmRleCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCB2bSA9IHRoaXMuX25vdGVib29rRWRpdG9yLmdldFZpZXdNb2RlbCgpO1xuXHRcdGxldCBpdGVtczogSU5vdGVib29rRGVsdGFDZWxsU3RhdHVzQmFySXRlbXNbXSA9IFtdO1xuXG5cdFx0aWYgKHRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdGl0ZW1zID0gdGhpcy5fZ2V0SXRlbXNGb3JDZWxscygpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NlbGxTdGF0dXNJdGVtcyA9IHZtLmRlbHRhQ2VsbFN0YXR1c0Jhckl0ZW1zKHRoaXMuX2NlbGxTdGF0dXNJdGVtcywgaXRlbXMpO1xuXG5cdH1cblxuXHRwcml2YXRlIF9nZXRJdGVtc0ZvckNlbGxzKCk6IElOb3RlYm9va0RlbHRhQ2VsbFN0YXR1c0Jhckl0ZW1zW10ge1xuXHRcdGNvbnN0IGl0ZW1zOiBJTm90ZWJvb2tEZWx0YUNlbGxTdGF0dXNCYXJJdGVtc1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRMZW5ndGgoKTsgaSsrKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0aGFuZGxlOiBpLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHRleHQ6IGBpbmRleDogJHtpfWAsXG5cdFx0XHRcdFx0XHRhbGlnbm1lbnQ6IENlbGxTdGF0dXNiYXJBbGlnbm1lbnQuTGVmdCxcblx0XHRcdFx0XHRcdHByaW9yaXR5OiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUlxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtXG5cdFx0XHRcdF1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0ZGlzcG9zZSh0aGlzLl9jZWxsRGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMuX3JlbW92ZU5vdGVib29rT3ZlcmxheSgpO1xuXHRcdHRoaXMuX2xvY2FsU3RvcmUuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJOb3RlYm9va0NvbnRyaWJ1dGlvbihUcm91Ymxlc2hvb3RDb250cm9sbGVyLmlkLCBUcm91Ymxlc2hvb3RDb250cm9sbGVyKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbm90ZWJvb2sudG9nZ2xlTGF5b3V0VHJvdWJsZXNob290Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5ub3RlYm9vay50b2dnbGVMYXlvdXRUcm91Ymxlc2hvb3QnLCBcIlRvZ2dsZSBOb3RlYm9vayBMYXlvdXQgVHJvdWJsZXNob290XCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblxuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGVkaXRvci5nZXRDb250cmlidXRpb248VHJvdWJsZXNob290Q29udHJvbGxlcj4oVHJvdWJsZXNob290Q29udHJvbGxlci5pZCk7XG5cdFx0Y29udHJvbGxlcj8udG9nZ2xlKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay5pbnNwZWN0TGF5b3V0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5ub3RlYm9vay5pbnNwZWN0TGF5b3V0JywgXCJJbnNwZWN0IE5vdGVib29rIExheW91dFwiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cblx0XHRpZiAoIWVkaXRvciB8fCAhZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGVkaXRvci5nZXRMZW5ndGgoKTsgaSsrKSB7XG5cdFx0XHRjb25zdCBjZWxsID0gZWRpdG9yLmNlbGxBdChpKTtcblx0XHRcdGNvbnNvbGUubG9nKGBjZWxsIyR7Y2VsbC5oYW5kbGV9YCwgY2VsbC5sYXlvdXRJbmZvKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay5jbGVhck5vdGVib29rRWR0aXRvclR5cGVDYWNoZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2gubm90ZWJvb2suY2xlYXJOb3RlYm9va0VkdGl0b3JUeXBlQ2FjaGUnLCBcIkNsZWFyIE5vdGVib29rIEVkaXRvciBUeXBlIENhY2hlXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5vdGVib29rU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90ZWJvb2tTZXJ2aWNlKTtcblx0XHRub3RlYm9va1NlcnZpY2UuY2xlYXJFZGl0b3JDYWNoZSgpO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsWUFBWSxpQkFBaUIsU0FBUyxvQkFBb0I7QUFDbkUsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLHVCQUF1QjtBQUV6QyxTQUFTLHVDQUF1STtBQUNoSixTQUFTLG9DQUFvQztBQUU3QyxTQUFTLDhCQUEwRDtBQUNuRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFNBQVM7QUFFWCxNQUFNLCtCQUErQixXQUFrRDtBQUFBLEVBUzdGLFlBQTZCLGlCQUFrQztBQUM5RCxVQUFNO0FBRHNCO0FBTjdCLFNBQWlCLGNBQWMsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFDbkUsU0FBUSxtQkFBc0MsQ0FBQztBQUMvQyxTQUFRLFdBQW9CO0FBQzVCLFNBQVEsbUJBQTZCLENBQUM7QUFNckMsU0FBSyxVQUFVLEtBQUssZ0JBQWdCLGlCQUFpQixNQUFNO0FBQzFELFdBQUssUUFBUTtBQUFBLElBQ2QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxRQUFRO0FBQUEsRUFDZDtBQUFBLEVBRUEsU0FBZTtBQUNkLFNBQUssV0FBVyxDQUFDLEtBQUs7QUFD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
