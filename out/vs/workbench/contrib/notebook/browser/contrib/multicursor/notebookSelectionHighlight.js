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
import { Event } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Selection, SelectionDirection } from "../../../../../../editor/common/core/selection.js";
import { CursorChangeReason } from "../../../../../../editor/common/cursorEvents.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
let NotebookSelectionHighlighter = class extends Disposable {
  // right now this lets us mimic the more performant cache implementation of the text editor (doesn't need to be a delayer)
  // todo: in the future, implement caching and change to a 250ms delay upon recompute
  // private readonly runDelayer: Delayer<void> = this._register(new Delayer<void>(0));
  constructor(notebookEditor, configurationService) {
    super();
    this.notebookEditor = notebookEditor;
    this.configurationService = configurationService;
    this.isEnabled = false;
    this.cellDecorationIds = /* @__PURE__ */ new Map();
    this.anchorDisposables = new DisposableStore();
    this.isEnabled = this.configurationService.getValue("editor.selectionHighlight");
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.selectionHighlight")) {
        this.isEnabled = this.configurationService.getValue("editor.selectionHighlight");
      }
    }));
    this._register(this.notebookEditor.onDidChangeActiveCell(async () => {
      if (!this.isEnabled) {
        return;
      }
      this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
      if (!this.anchorCell) {
        return;
      }
      const activeCell = this.notebookEditor.getActiveCell();
      if (!activeCell) {
        return;
      }
      if (!activeCell.editorAttached) {
        await Event.toPromise(activeCell.onDidChangeEditorAttachState);
      }
      this.clearNotebookSelectionDecorations();
      this.anchorDisposables.clear();
      this.anchorDisposables.add(this.anchorCell[1].onDidChangeCursorPosition((e) => {
        if (e.reason !== CursorChangeReason.Explicit) {
          this.clearNotebookSelectionDecorations();
          return;
        }
        if (!this.anchorCell) {
          return;
        }
        if (this.notebookEditor.hasModel()) {
          this.clearNotebookSelectionDecorations();
          this._update(this.notebookEditor);
        }
      }));
      if (this.notebookEditor.getEditorViewState().editorFocused && this.notebookEditor.hasModel()) {
        this._update(this.notebookEditor);
      }
    }));
  }
  _update(editor) {
    if (!this.anchorCell || !this.isEnabled) {
      return;
    }
    const textModel = this.anchorCell[0].textModel;
    if (!textModel || textModel.isTooLargeForTokenization()) {
      return;
    }
    const s = this.anchorCell[0].getSelections()[0];
    if (s.startLineNumber !== s.endLineNumber || s.isEmpty()) {
      return;
    }
    const searchText = this.getSearchText(s, textModel);
    if (!searchText) {
      return;
    }
    const results = editor.textModel.findMatches(
      searchText,
      false,
      true,
      null
    );
    for (const res of results) {
      const cell = editor.getCellByHandle(res.cell.handle);
      if (!cell) {
        continue;
      }
      this.updateCellDecorations(cell, res.matches);
    }
  }
  updateCellDecorations(cell, matches) {
    const selections = matches.map((m) => {
      return Selection.fromRange(m.range, SelectionDirection.LTR);
    });
    const newDecorations = [];
    selections?.map((selection) => {
      const isEmpty = selection.isEmpty();
      if (!isEmpty) {
        newDecorations.push({
          range: selection,
          options: {
            description: "",
            className: ".nb-selection-highlight"
          }
        });
      }
    });
    const oldDecorations = this.cellDecorationIds.get(cell) ?? [];
    this.cellDecorationIds.set(cell, cell.deltaModelDecorations(
      oldDecorations,
      newDecorations
    ));
  }
  clearNotebookSelectionDecorations() {
    this.cellDecorationIds.forEach((_, cell) => {
      const cellDecorations = this.cellDecorationIds.get(cell) ?? [];
      if (cellDecorations) {
        cell.deltaModelDecorations(cellDecorations, []);
        this.cellDecorationIds.delete(cell);
      }
    });
  }
  getSearchText(selection, model) {
    return model.getValueInRange(selection).replace(/\r\n/g, "\n");
  }
  dispose() {
    super.dispose();
    this.anchorDisposables.dispose();
  }
};
NotebookSelectionHighlighter.id = "notebook.selectionHighlighter";
NotebookSelectionHighlighter = __decorateClass([
  __decorateParam(1, IConfigurationService)
], NotebookSelectionHighlighter);
registerNotebookContribution(NotebookSelectionHighlighter.id, NotebookSelectionHighlighter);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxtdWx0aWN1cnNvclxcbm90ZWJvb2tTZWxlY3Rpb25IaWdobGlnaHQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uLCBTZWxlY3Rpb25EaXJlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IEN1cnNvckNoYW5nZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IEZpbmRNYXRjaCwgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElBY3RpdmVOb3RlYm9va0VkaXRvciwgSUNlbGxWaWV3TW9kZWwsIElOb3RlYm9va0VkaXRvciwgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyTm90ZWJvb2tDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9ub3RlYm9va0VkaXRvckV4dGVuc2lvbnMuanMnO1xuXG5jbGFzcyBOb3RlYm9va1NlbGVjdGlvbkhpZ2hsaWdodGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkOiBzdHJpbmcgPSAnbm90ZWJvb2suc2VsZWN0aW9uSGlnaGxpZ2h0ZXInO1xuXHRwcml2YXRlIGlzRW5hYmxlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgY2VsbERlY29yYXRpb25JZHMgPSBuZXcgTWFwPElDZWxsVmlld01vZGVsLCBzdHJpbmdbXT4oKTtcblx0cHJpdmF0ZSBhbmNob3JDZWxsOiBbSUNlbGxWaWV3TW9kZWwsIElDb2RlRWRpdG9yXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBhbmNob3JEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHQvLyByaWdodCBub3cgdGhpcyBsZXRzIHVzIG1pbWljIHRoZSBtb3JlIHBlcmZvcm1hbnQgY2FjaGUgaW1wbGVtZW50YXRpb24gb2YgdGhlIHRleHQgZWRpdG9yIChkb2Vzbid0IG5lZWQgdG8gYmUgYSBkZWxheWVyKVxuXHQvLyB0b2RvOiBpbiB0aGUgZnV0dXJlLCBpbXBsZW1lbnQgY2FjaGluZyBhbmQgY2hhbmdlIHRvIGEgMjUwbXMgZGVsYXkgdXBvbiByZWNvbXB1dGVcblx0Ly8gcHJpdmF0ZSByZWFkb25seSBydW5EZWxheWVyOiBEZWxheWVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oMCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvcixcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuaXNFbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZWRpdG9yLnNlbGVjdGlvbkhpZ2hsaWdodCcpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5zZWxlY3Rpb25IaWdobGlnaHQnKSkge1xuXHRcdFx0XHR0aGlzLmlzRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2VkaXRvci5zZWxlY3Rpb25IaWdobGlnaHQnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm5vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlQWN0aXZlQ2VsbChhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaXNFbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5hbmNob3JDZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5hY3RpdmVDZWxsQW5kQ29kZUVkaXRvcjtcblx0XHRcdGlmICghdGhpcy5hbmNob3JDZWxsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWN0aXZlQ2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0QWN0aXZlQ2VsbCgpO1xuXHRcdFx0aWYgKCFhY3RpdmVDZWxsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFhY3RpdmVDZWxsLmVkaXRvckF0dGFjaGVkKSB7XG5cdFx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShhY3RpdmVDZWxsLm9uRGlkQ2hhbmdlRWRpdG9yQXR0YWNoU3RhdGUpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmNsZWFyTm90ZWJvb2tTZWxlY3Rpb25EZWNvcmF0aW9ucygpO1xuXG5cdFx0XHR0aGlzLmFuY2hvckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmFuY2hvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmFuY2hvckNlbGxbMV0ub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5yZWFzb24gIT09IEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCkge1xuXHRcdFx0XHRcdHRoaXMuY2xlYXJOb3RlYm9va1NlbGVjdGlvbkRlY29yYXRpb25zKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCF0aGlzLmFuY2hvckNlbGwpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5jbGVhck5vdGVib29rU2VsZWN0aW9uRGVjb3JhdGlvbnMoKTtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGUodGhpcy5ub3RlYm9va0VkaXRvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0aWYgKHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0RWRpdG9yVmlld1N0YXRlKCkuZWRpdG9yRm9jdXNlZCAmJiB0aGlzLm5vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlKHRoaXMubm90ZWJvb2tFZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZShlZGl0b3I6IElBY3RpdmVOb3RlYm9va0VkaXRvcikge1xuXHRcdGlmICghdGhpcy5hbmNob3JDZWxsIHx8ICF0aGlzLmlzRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRPRE86IGlzVG9vTGFyZ2VGb3JUb2tlbml6YXRpb24gY2hlY2ssIG5vdGVib29rIGVxdWl2YWxlbnQ/XG5cdFx0Ly8gdW5saWtlbHkgdGhhdCBhbnkgb25lIGNlbGwncyB0ZXh0bW9kZWwgd291bGQgYmUgdG9vIGxhcmdlXG5cblx0XHQvLyBnZXQgdGhlIHdvcmRcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLmFuY2hvckNlbGxbMF0udGV4dE1vZGVsO1xuXHRcdGlmICghdGV4dE1vZGVsIHx8IHRleHRNb2RlbC5pc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcyA9IHRoaXMuYW5jaG9yQ2VsbFswXS5nZXRTZWxlY3Rpb25zKClbMF07XG5cdFx0aWYgKHMuc3RhcnRMaW5lTnVtYmVyICE9PSBzLmVuZExpbmVOdW1iZXIgfHwgcy5pc0VtcHR5KCkpIHtcblx0XHRcdC8vIGVtcHR5IHNlbGVjdGlvbnMgZG8gbm90aGluZ1xuXHRcdFx0Ly8gbXVsdGlsaW5lIGZvcmJpZGRlbiBmb3IgcGVyZiByZWFzb25zXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlYXJjaFRleHQgPSB0aGlzLmdldFNlYXJjaFRleHQocywgdGV4dE1vZGVsKTtcblx0XHRpZiAoIXNlYXJjaFRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHRzID0gZWRpdG9yLnRleHRNb2RlbC5maW5kTWF0Y2hlcyhcblx0XHRcdHNlYXJjaFRleHQsXG5cdFx0XHRmYWxzZSxcblx0XHRcdHRydWUsXG5cdFx0XHRudWxsLFxuXHRcdCk7XG5cblx0XHRmb3IgKGNvbnN0IHJlcyBvZiByZXN1bHRzKSB7XG5cdFx0XHRjb25zdCBjZWxsID0gZWRpdG9yLmdldENlbGxCeUhhbmRsZShyZXMuY2VsbC5oYW5kbGUpO1xuXHRcdFx0aWYgKCFjZWxsKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnVwZGF0ZUNlbGxEZWNvcmF0aW9ucyhjZWxsLCByZXMubWF0Y2hlcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDZWxsRGVjb3JhdGlvbnMoY2VsbDogSUNlbGxWaWV3TW9kZWwsIG1hdGNoZXM6IEZpbmRNYXRjaFtdKSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uczogU2VsZWN0aW9uW10gPSBtYXRjaGVzLm1hcChtID0+IHtcblx0XHRcdHJldHVybiBTZWxlY3Rpb24uZnJvbVJhbmdlKG0ucmFuZ2UsIFNlbGVjdGlvbkRpcmVjdGlvbi5MVFIpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbmV3RGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0c2VsZWN0aW9ucz8ubWFwKHNlbGVjdGlvbiA9PiB7XG5cdFx0XHRjb25zdCBpc0VtcHR5ID0gc2VsZWN0aW9uLmlzRW1wdHkoKTtcblxuXHRcdFx0aWYgKCFpc0VtcHR5KSB7XG5cdFx0XHRcdG5ld0RlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdHJhbmdlOiBzZWxlY3Rpb24sXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHRcdFx0Y2xhc3NOYW1lOiAnLm5iLXNlbGVjdGlvbi1oaWdobGlnaHQnLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBvbGREZWNvcmF0aW9ucyA9IHRoaXMuY2VsbERlY29yYXRpb25JZHMuZ2V0KGNlbGwpID8/IFtdO1xuXHRcdHRoaXMuY2VsbERlY29yYXRpb25JZHMuc2V0KGNlbGwsIGNlbGwuZGVsdGFNb2RlbERlY29yYXRpb25zKFxuXHRcdFx0b2xkRGVjb3JhdGlvbnMsXG5cdFx0XHRuZXdEZWNvcmF0aW9uc1xuXHRcdCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhck5vdGVib29rU2VsZWN0aW9uRGVjb3JhdGlvbnMoKSB7XG5cdFx0dGhpcy5jZWxsRGVjb3JhdGlvbklkcy5mb3JFYWNoKChfLCBjZWxsKSA9PiB7XG5cdFx0XHRjb25zdCBjZWxsRGVjb3JhdGlvbnMgPSB0aGlzLmNlbGxEZWNvcmF0aW9uSWRzLmdldChjZWxsKSA/PyBbXTtcblx0XHRcdGlmIChjZWxsRGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0Y2VsbC5kZWx0YU1vZGVsRGVjb3JhdGlvbnMoY2VsbERlY29yYXRpb25zLCBbXSk7XG5cdFx0XHRcdHRoaXMuY2VsbERlY29yYXRpb25JZHMuZGVsZXRlKGNlbGwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZWFyY2hUZXh0KHNlbGVjdGlvbjogU2VsZWN0aW9uLCBtb2RlbDogSVRleHRNb2RlbCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG1vZGVsLmdldFZhbHVlSW5SYW5nZShzZWxlY3Rpb24pLnJlcGxhY2UoL1xcclxcbi9nLCAnXFxuJyk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmFuY2hvckRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5yZWdpc3Rlck5vdGVib29rQ29udHJpYnV0aW9uKE5vdGVib29rU2VsZWN0aW9uSGlnaGxpZ2h0ZXIuaWQsIE5vdGVib29rU2VsZWN0aW9uSGlnaGxpZ2h0ZXIpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZLHVCQUF1QjtBQUU1QyxTQUFTLFdBQVcsMEJBQTBCO0FBQzlDLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsb0NBQW9DO0FBRTdDLElBQU0sK0JBQU4sY0FBMkMsV0FBa0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWE1RixZQUNrQixnQkFDdUIsc0JBQ3ZDO0FBQ0QsVUFBTTtBQUhXO0FBQ3VCO0FBWnpDLFNBQVEsWUFBcUI7QUFFN0IsU0FBUSxvQkFBb0Isb0JBQUksSUFBOEI7QUFFOUQsU0FBaUIsb0JBQW9CLElBQUksZ0JBQWdCO0FBWXhELFNBQUssWUFBWSxLQUFLLHFCQUFxQixTQUFrQiwyQkFBMkI7QUFDeEYsU0FBSyxVQUFVLEtBQUsscUJBQXFCLHlCQUF5QixPQUFLO0FBQ3RFLFVBQUksRUFBRSxxQkFBcUIsMkJBQTJCLEdBQUc7QUFDeEQsYUFBSyxZQUFZLEtBQUsscUJBQXFCLFNBQWtCLDJCQUEyQjtBQUFBLE1BQ3pGO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxlQUFlLHNCQUFzQixZQUFZO0FBQ3BFLFVBQUksQ0FBQyxLQUFLLFdBQVc7QUFDcEI7QUFBQSxNQUNEO0FBRUEsV0FBSyxhQUFhLEtBQUssZUFBZTtBQUN0QyxVQUFJLENBQUMsS0FBSyxZQUFZO0FBQ3JCO0FBQUEsTUFDRDtBQUVBLFlBQU0sYUFBYSxLQUFLLGVBQWUsY0FBYztBQUNyRCxVQUFJLENBQUMsWUFBWTtBQUNoQjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLENBQUMsV0FBVyxnQkFBZ0I7QUFDL0IsY0FBTSxNQUFNLFVBQVUsV0FBVyw0QkFBNEI7QUFBQSxNQUM5RDtBQUVBLFdBQUssa0NBQWtDO0FBRXZDLFdBQUssa0JBQWtCLE1BQU07QUFDN0IsV0FBSyxrQkFBa0IsSUFBSSxLQUFLLFdBQVcsQ0FBQyxFQUFFLDBCQUEwQixDQUFDLE1BQU07QUFDOUUsWUFBSSxFQUFFLFdBQVcsbUJBQW1CLFVBQVU7QUFDN0MsZUFBSyxrQ0FBa0M7QUFDdkM7QUFBQSxRQUNEO0FBRUEsWUFBSSxDQUFDLEtBQUssWUFBWTtBQUNyQjtBQUFBLFFBQ0Q7QUFFQSxZQUFJLEtBQUssZUFBZSxTQUFTLEdBQUc7QUFDbkMsZUFBSyxrQ0FBa0M7QUFDdkMsZUFBSyxRQUFRLEtBQUssY0FBYztBQUFBLFFBQ2pDO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixVQUFJLEtBQUssZUFBZSxtQkFBbUIsRUFBRSxpQkFBaUIsS0FBSyxlQUFlLFNBQVMsR0FBRztBQUM3RixhQUFLLFFBQVEsS0FBSyxjQUFjO0FBQUEsTUFDakM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLFFBQVEsUUFBK0I7QUFDOUMsUUFBSSxDQUFDLEtBQUssY0FBYyxDQUFDLEtBQUssV0FBVztBQUN4QztBQUFBLElBQ0Q7QUFNQSxVQUFNLFlBQVksS0FBSyxXQUFXLENBQUMsRUFBRTtBQUNyQyxRQUFJLENBQUMsYUFBYSxVQUFVLDBCQUEwQixHQUFHO0FBQ3hEO0FBQUEsSUFDRDtBQUNBLFVBQU0sSUFBSSxLQUFLLFdBQVcsQ0FBQyxFQUFFLGNBQWMsRUFBRSxDQUFDO0FBQzlDLFFBQUksRUFBRSxvQkFBb0IsRUFBRSxpQkFBaUIsRUFBRSxRQUFRLEdBQUc7QUFHekQ7QUFBQSxJQUNEO0FBQ0EsVUFBTSxhQUFhLEtBQUssY0FBYyxHQUFHLFNBQVM7QUFDbEQsUUFBSSxDQUFDLFlBQVk7QUFDaEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFVLE9BQU8sVUFBVTtBQUFBLE1BQ2hDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBLGVBQVcsT0FBTyxTQUFTO0FBQzFCLFlBQU0sT0FBTyxPQUFPLGdCQUFnQixJQUFJLEtBQUssTUFBTTtBQUNuRCxVQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsTUFDRDtBQUVBLFdBQUssc0JBQXNCLE1BQU0sSUFBSSxPQUFPO0FBQUEsSUFDN0M7QUFBQSxFQUNEO0FBQUEsRUFFUSxzQkFBc0IsTUFBc0IsU0FBc0I7QUFDekUsVUFBTSxhQUEwQixRQUFRLElBQUksT0FBSztBQUNoRCxhQUFPLFVBQVUsVUFBVSxFQUFFLE9BQU8sbUJBQW1CLEdBQUc7QUFBQSxJQUMzRCxDQUFDO0FBRUQsVUFBTSxpQkFBMEMsQ0FBQztBQUNqRCxnQkFBWSxJQUFJLGVBQWE7QUFDNUIsWUFBTSxVQUFVLFVBQVUsUUFBUTtBQUVsQyxVQUFJLENBQUMsU0FBUztBQUNiLHVCQUFlLEtBQUs7QUFBQSxVQUNuQixPQUFPO0FBQUEsVUFDUCxTQUFTO0FBQUEsWUFDUixhQUFhO0FBQUEsWUFDYixXQUFXO0FBQUEsVUFDWjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLGlCQUFpQixLQUFLLGtCQUFrQixJQUFJLElBQUksS0FBSyxDQUFDO0FBQzVELFNBQUssa0JBQWtCLElBQUksTUFBTSxLQUFLO0FBQUEsTUFDckM7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsb0NBQW9DO0FBQzNDLFNBQUssa0JBQWtCLFFBQVEsQ0FBQyxHQUFHLFNBQVM7QUFDM0MsWUFBTSxrQkFBa0IsS0FBSyxrQkFBa0IsSUFBSSxJQUFJLEtBQUssQ0FBQztBQUM3RCxVQUFJLGlCQUFpQjtBQUNwQixhQUFLLHNCQUFzQixpQkFBaUIsQ0FBQyxDQUFDO0FBQzlDLGFBQUssa0JBQWtCLE9BQU8sSUFBSTtBQUFBLE1BQ25DO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsY0FBYyxXQUFzQixPQUEyQjtBQUN0RSxXQUFPLE1BQU0sZ0JBQWdCLFNBQVMsRUFBRSxRQUFRLFNBQVMsSUFBSTtBQUFBLEVBQzlEO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixVQUFNLFFBQVE7QUFDZCxTQUFLLGtCQUFrQixRQUFRO0FBQUEsRUFDaEM7QUFDRDtBQTVKTSw2QkFFVyxLQUFhO0FBRnhCLCtCQUFOO0FBQUEsRUFlRztBQUFBLEdBZkc7QUE4Sk4sNkJBQTZCLDZCQUE2QixJQUFJLDRCQUE0QjsiLAogICJuYW1lcyI6IFtdCn0K
