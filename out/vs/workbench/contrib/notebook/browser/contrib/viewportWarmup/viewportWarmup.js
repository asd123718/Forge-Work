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
import { RunOnceScheduler } from "../../../../../../base/common/async.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { CellEditState, RenderOutputType } from "../../notebookBrowser.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
import { outputDisplayLimit } from "../../viewModel/codeCellViewModel.js";
import { CellKind } from "../../../common/notebookCommon.js";
import { cellRangesToIndexes } from "../../../common/notebookRange.js";
import { INotebookService } from "../../../common/notebookService.js";
let NotebookViewportContribution = class extends Disposable {
  constructor(_notebookEditor, _notebookService, accessibilityService) {
    super();
    this._notebookEditor = _notebookEditor;
    this._notebookService = _notebookService;
    this._warmupDocument = null;
    this._warmupViewport = new RunOnceScheduler(() => this._warmupViewportNow(), 200);
    this._register(this._warmupViewport);
    this._register(this._notebookEditor.onDidScroll(() => {
      this._warmupViewport.schedule();
    }));
    this._warmupDocument = new RunOnceScheduler(() => this._warmupDocumentNow(), 200);
    this._register(this._warmupDocument);
    this._register(this._notebookEditor.onDidAttachViewModel(() => {
      if (this._notebookEditor.hasModel()) {
        this._warmupDocument?.schedule();
      }
    }));
    if (this._notebookEditor.hasModel()) {
      this._warmupDocument?.schedule();
    }
  }
  _warmupDocumentNow() {
    if (this._notebookEditor.hasModel()) {
      for (let i = 0; i < this._notebookEditor.getLength(); i++) {
        const cell = this._notebookEditor.cellAt(i);
        if (cell?.cellKind === CellKind.Markup && cell?.getEditState() === CellEditState.Preview && !cell.isInputCollapsed) {
        } else if (cell?.cellKind === CellKind.Code) {
          this._warmupCodeCell(cell);
        }
      }
    }
  }
  _warmupViewportNow() {
    if (this._notebookEditor.isDisposed) {
      return;
    }
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    const visibleRanges = this._notebookEditor.getVisibleRangesPlusViewportAboveAndBelow();
    cellRangesToIndexes(visibleRanges).forEach((index) => {
      const cell = this._notebookEditor.cellAt(index);
      if (cell?.cellKind === CellKind.Markup && cell?.getEditState() === CellEditState.Preview && !cell.isInputCollapsed) {
        this._notebookEditor.createMarkupPreview(cell);
      } else if (cell?.cellKind === CellKind.Code) {
        this._warmupCodeCell(cell);
      }
    });
  }
  _warmupCodeCell(viewCell) {
    if (viewCell.isOutputCollapsed) {
      return;
    }
    const outputs = viewCell.outputsViewModels;
    for (const output of outputs.slice(0, outputDisplayLimit)) {
      const [mimeTypes, pick] = output.resolveMimeTypes(this._notebookEditor.textModel, void 0);
      if (!mimeTypes.find((mimeType) => mimeType.isTrusted) || mimeTypes.length === 0) {
        continue;
      }
      const pickedMimeTypeRenderer = mimeTypes[pick];
      if (!pickedMimeTypeRenderer) {
        return;
      }
      if (!this._notebookEditor.hasModel()) {
        return;
      }
      const renderer = this._notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
      if (!renderer) {
        return;
      }
      const result = { type: RenderOutputType.Extension, renderer, source: output, mimeType: pickedMimeTypeRenderer.mimeType };
      this._notebookEditor.createOutput(viewCell, result, 0, true);
    }
  }
};
NotebookViewportContribution.id = "workbench.notebook.viewportWarmup";
NotebookViewportContribution = __decorateClass([
  __decorateParam(1, INotebookService),
  __decorateParam(2, IAccessibilityService)
], NotebookViewportContribution);
registerNotebookContribution(NotebookViewportContribution.id, NotebookViewportContribution);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFx2aWV3cG9ydFdhcm11cFxcdmlld3BvcnRXYXJtdXAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IENlbGxFZGl0U3RhdGUsIElJbnNldFJlbmRlck91dHB1dCwgSU5vdGVib29rRWRpdG9yLCBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24sIElOb3RlYm9va0VkaXRvckRlbGVnYXRlLCBSZW5kZXJPdXRwdXRUeXBlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyTm90ZWJvb2tDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9ub3RlYm9va0VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29kZUNlbGxWaWV3TW9kZWwsIG91dHB1dERpc3BsYXlMaW1pdCB9IGZyb20gJy4uLy4uL3ZpZXdNb2RlbC9jb2RlQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBjZWxsUmFuZ2VzVG9JbmRleGVzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rUmFuZ2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuXG5jbGFzcyBOb3RlYm9va1ZpZXdwb3J0Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyBpZDogc3RyaW5nID0gJ3dvcmtiZW5jaC5ub3RlYm9vay52aWV3cG9ydFdhcm11cCc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dhcm11cFZpZXdwb3J0OiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93YXJtdXBEb2N1bWVudDogUnVuT25jZVNjaGVkdWxlciB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsXG5cdFx0QElOb3RlYm9va1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3dhcm11cFZpZXdwb3J0ID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fd2FybXVwVmlld3BvcnROb3coKSwgMjAwKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93YXJtdXBWaWV3cG9ydCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90ZWJvb2tFZGl0b3Iub25EaWRTY3JvbGwoKCkgPT4ge1xuXHRcdFx0dGhpcy5fd2FybXVwVmlld3BvcnQuc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl93YXJtdXBEb2N1bWVudCA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX3dhcm11cERvY3VtZW50Tm93KCksIDIwMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd2FybXVwRG9jdW1lbnQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25vdGVib29rRWRpdG9yLm9uRGlkQXR0YWNoVmlld01vZGVsKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdHRoaXMuX3dhcm11cERvY3VtZW50Py5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLl9ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHR0aGlzLl93YXJtdXBEb2N1bWVudD8uc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF93YXJtdXBEb2N1bWVudE5vdygpIHtcblx0XHRpZiAodGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRMZW5ndGgoKTsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5jZWxsQXQoaSk7XG5cblx0XHRcdFx0aWYgKGNlbGw/LmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXAgJiYgY2VsbD8uZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuUHJldmlldyAmJiAhY2VsbC5pc0lucHV0Q29sbGFwc2VkKSB7XG5cdFx0XHRcdFx0Ly8gVE9ET0ByZWJvcm5peCBjdXJyZW50bHkgd2UgZGlzYWJsZSBtYXJrZG93biBjZWxsIHJlbmRlcmluZyBpbiB3ZWJ2aWV3IGZvciBhY2Nlc3NpYmlsaXR5XG5cdFx0XHRcdFx0Ly8gdGhpcy5fbm90ZWJvb2tFZGl0b3IuY3JlYXRlTWFya3VwUHJldmlldyhjZWxsKTtcblx0XHRcdFx0fSBlbHNlIGlmIChjZWxsPy5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuQ29kZSkge1xuXHRcdFx0XHRcdHRoaXMuX3dhcm11cENvZGVDZWxsKChjZWxsIGFzIENvZGVDZWxsVmlld01vZGVsKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF93YXJtdXBWaWV3cG9ydE5vdygpIHtcblx0XHRpZiAodGhpcy5fbm90ZWJvb2tFZGl0b3IuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpc2libGVSYW5nZXMgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRWaXNpYmxlUmFuZ2VzUGx1c1ZpZXdwb3J0QWJvdmVBbmRCZWxvdygpO1xuXHRcdGNlbGxSYW5nZXNUb0luZGV4ZXModmlzaWJsZVJhbmdlcykuZm9yRWFjaChpbmRleCA9PiB7XG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuY2VsbEF0KGluZGV4KTtcblxuXHRcdFx0aWYgKGNlbGw/LmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXAgJiYgY2VsbD8uZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuUHJldmlldyAmJiAhY2VsbC5pc0lucHV0Q29sbGFwc2VkKSB7XG5cdFx0XHRcdCh0aGlzLl9ub3RlYm9va0VkaXRvciBhcyBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSkuY3JlYXRlTWFya3VwUHJldmlldyhjZWxsKTtcblx0XHRcdH0gZWxzZSBpZiAoY2VsbD8uY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUpIHtcblx0XHRcdFx0dGhpcy5fd2FybXVwQ29kZUNlbGwoKGNlbGwgYXMgQ29kZUNlbGxWaWV3TW9kZWwpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3dhcm11cENvZGVDZWxsKHZpZXdDZWxsOiBDb2RlQ2VsbFZpZXdNb2RlbCkge1xuXHRcdGlmICh2aWV3Q2VsbC5pc091dHB1dENvbGxhcHNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG91dHB1dHMgPSB2aWV3Q2VsbC5vdXRwdXRzVmlld01vZGVscztcblx0XHRmb3IgKGNvbnN0IG91dHB1dCBvZiBvdXRwdXRzLnNsaWNlKDAsIG91dHB1dERpc3BsYXlMaW1pdCkpIHtcblx0XHRcdGNvbnN0IFttaW1lVHlwZXMsIHBpY2tdID0gb3V0cHV0LnJlc29sdmVNaW1lVHlwZXModGhpcy5fbm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsISwgdW5kZWZpbmVkKTtcblx0XHRcdGlmICghbWltZVR5cGVzLmZpbmQobWltZVR5cGUgPT4gbWltZVR5cGUuaXNUcnVzdGVkKSB8fCBtaW1lVHlwZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwaWNrZWRNaW1lVHlwZVJlbmRlcmVyID0gbWltZVR5cGVzW3BpY2tdO1xuXG5cdFx0XHRpZiAoIXBpY2tlZE1pbWVUeXBlUmVuZGVyZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX25vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZW5kZXJlciA9IHRoaXMuX25vdGVib29rU2VydmljZS5nZXRSZW5kZXJlckluZm8ocGlja2VkTWltZVR5cGVSZW5kZXJlci5yZW5kZXJlcklkKTtcblxuXHRcdFx0aWYgKCFyZW5kZXJlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogSUluc2V0UmVuZGVyT3V0cHV0ID0geyB0eXBlOiBSZW5kZXJPdXRwdXRUeXBlLkV4dGVuc2lvbiwgcmVuZGVyZXIsIHNvdXJjZTogb3V0cHV0LCBtaW1lVHlwZTogcGlja2VkTWltZVR5cGVSZW5kZXJlci5taW1lVHlwZSB9O1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IuY3JlYXRlT3V0cHV0KHZpZXdDZWxsLCByZXN1bHQsIDAsIHRydWUpO1xuXHRcdH1cblxuXHR9XG59XG5cbnJlZ2lzdGVyTm90ZWJvb2tDb250cmlidXRpb24oTm90ZWJvb2tWaWV3cG9ydENvbnRyaWJ1dGlvbi5pZCwgTm90ZWJvb2tWaWV3cG9ydENvbnRyaWJ1dGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZUFBMEcsd0JBQXdCO0FBQzNJLFNBQVMsb0NBQW9DO0FBQzdDLFNBQTRCLDBCQUEwQjtBQUN0RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHdCQUF3QjtBQUVqQyxJQUFNLCtCQUFOLGNBQTJDLFdBQWtEO0FBQUEsRUFLNUYsWUFDa0IsaUJBQ2tCLGtCQUNaLHNCQUN0QjtBQUNELFVBQU07QUFKVztBQUNrQjtBQUpwQyxTQUFpQixrQkFBMkM7QUFTM0QsU0FBSyxrQkFBa0IsSUFBSSxpQkFBaUIsTUFBTSxLQUFLLG1CQUFt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
