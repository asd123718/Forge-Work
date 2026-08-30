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
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../../../common/contributions.js";
import { MarkerList, IMarkerNavigationService } from "../../../../../../editor/contrib/gotoError/browser/markerNavigationService.js";
import { CellUri } from "../../../common/notebookCommon.js";
import { IMarkerService, MarkerSeverity } from "../../../../../../platform/markers/common/markers.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { NotebookOverviewRulerLane } from "../../notebookBrowser.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
import { throttle } from "../../../../../../base/common/decorators.js";
import { editorErrorForeground, editorWarningForeground } from "../../../../../../platform/theme/common/colorRegistry.js";
import { isEqual } from "../../../../../../base/common/resources.js";
let MarkerListProvider = class {
  constructor(_markerService, markerNavigation, _configService) {
    this._markerService = _markerService;
    this._configService = _configService;
    this._dispoables = markerNavigation.registerProvider(this);
  }
  dispose() {
    this._dispoables.dispose();
  }
  getMarkerList(resource) {
    if (!resource) {
      return void 0;
    }
    const data = CellUri.parse(resource);
    if (!data) {
      return void 0;
    }
    return new MarkerList((uri) => {
      const otherData = CellUri.parse(uri);
      return otherData?.notebook.toString() === data.notebook.toString();
    }, this._markerService, this._configService);
  }
};
MarkerListProvider.ID = "workbench.contrib.markerListProvider";
MarkerListProvider = __decorateClass([
  __decorateParam(0, IMarkerService),
  __decorateParam(1, IMarkerNavigationService),
  __decorateParam(2, IConfigurationService)
], MarkerListProvider);
let NotebookMarkerDecorationContribution = class extends Disposable {
  constructor(_notebookEditor, _markerService) {
    super();
    this._notebookEditor = _notebookEditor;
    this._markerService = _markerService;
    this._markersOverviewRulerDecorations = [];
    this._update();
    this._register(this._notebookEditor.onDidChangeModel(() => this._update()));
    this._register(this._markerService.onMarkerChanged((e) => {
      if (e.some((uri) => this._notebookEditor.getCellsInRange().some((cell) => isEqual(cell.uri, uri)))) {
        this._update();
      }
    }));
  }
  _update() {
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    const cellDecorations = [];
    this._notebookEditor.getCellsInRange().forEach((cell) => {
      const marker = this._markerService.read({ resource: cell.uri, severities: MarkerSeverity.Error | MarkerSeverity.Warning });
      marker.forEach((m) => {
        const color = m.severity === MarkerSeverity.Error ? editorErrorForeground : editorWarningForeground;
        const range = { startLineNumber: m.startLineNumber, startColumn: m.startColumn, endLineNumber: m.endLineNumber, endColumn: m.endColumn };
        cellDecorations.push({
          handle: cell.handle,
          options: {
            overviewRuler: {
              color,
              modelRanges: [range],
              includeOutput: false,
              position: NotebookOverviewRulerLane.Right
            }
          }
        });
      });
    });
    this._markersOverviewRulerDecorations = this._notebookEditor.deltaCellDecorations(this._markersOverviewRulerDecorations, cellDecorations);
  }
};
NotebookMarkerDecorationContribution.id = "workbench.notebook.markerDecoration";
__decorateClass([
  throttle(100)
], NotebookMarkerDecorationContribution.prototype, "_update", 1);
NotebookMarkerDecorationContribution = __decorateClass([
  __decorateParam(1, IMarkerService)
], NotebookMarkerDecorationContribution);
registerWorkbenchContribution2(MarkerListProvider.ID, MarkerListProvider, WorkbenchPhase.BlockRestore);
registerNotebookContribution(NotebookMarkerDecorationContribution.id, NotebookMarkerDecorationContribution);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxtYXJrZXJcXG1hcmtlclByb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFBoYXNlLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTWFya2VyTGlzdFByb3ZpZGVyLCBNYXJrZXJMaXN0LCBJTWFya2VyTmF2aWdhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9nb3RvRXJyb3IvYnJvd3Nlci9tYXJrZXJOYXZpZ2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElNYXJrZXJTZXJ2aWNlLCBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tEZWx0YURlY29yYXRpb24sIElOb3RlYm9va0VkaXRvciwgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uLCBOb3RlYm9va092ZXJ2aWV3UnVsZXJMYW5lIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyTm90ZWJvb2tDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9ub3RlYm9va0VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgdGhyb3R0bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IGVkaXRvckVycm9yRm9yZWdyb3VuZCwgZWRpdG9yV2FybmluZ0ZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcblxuY2xhc3MgTWFya2VyTGlzdFByb3ZpZGVyIGltcGxlbWVudHMgSU1hcmtlckxpc3RQcm92aWRlciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm1hcmtlckxpc3RQcm92aWRlcic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9hYmxlczogSURpc3Bvc2FibGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNYXJrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdEBJTWFya2VyTmF2aWdhdGlvblNlcnZpY2UgbWFya2VyTmF2aWdhdGlvbjogSU1hcmtlck5hdmlnYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlnU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2Rpc3BvYWJsZXMgPSBtYXJrZXJOYXZpZ2F0aW9uLnJlZ2lzdGVyUHJvdmlkZXIodGhpcyk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2Rpc3BvYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0Z2V0TWFya2VyTGlzdChyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogTWFya2VyTGlzdCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZGF0YSA9IENlbGxVcmkucGFyc2UocmVzb3VyY2UpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBNYXJrZXJMaXN0KHVyaSA9PiB7XG5cdFx0XHRjb25zdCBvdGhlckRhdGEgPSBDZWxsVXJpLnBhcnNlKHVyaSk7XG5cdFx0XHRyZXR1cm4gb3RoZXJEYXRhPy5ub3RlYm9vay50b1N0cmluZygpID09PSBkYXRhLm5vdGVib29rLnRvU3RyaW5nKCk7XG5cdFx0fSwgdGhpcy5fbWFya2VyU2VydmljZSwgdGhpcy5fY29uZmlnU2VydmljZSk7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tNYXJrZXJEZWNvcmF0aW9uQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyBpZDogc3RyaW5nID0gJ3dvcmtiZW5jaC5ub3RlYm9vay5tYXJrZXJEZWNvcmF0aW9uJztcblx0cHJpdmF0ZSBfbWFya2Vyc092ZXJ2aWV3UnVsZXJEZWNvcmF0aW9uczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvcixcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tYXJrZXJTZXJ2aWNlLm9uTWFya2VyQ2hhbmdlZChlID0+IHtcblx0XHRcdGlmIChlLnNvbWUodXJpID0+IHRoaXMuX25vdGVib29rRWRpdG9yLmdldENlbGxzSW5SYW5nZSgpLnNvbWUoY2VsbCA9PiBpc0VxdWFsKGNlbGwudXJpLCB1cmkpKSkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0QHRocm90dGxlKDEwMClcblx0cHJpdmF0ZSBfdXBkYXRlKCkge1xuXHRcdGlmICghdGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNlbGxEZWNvcmF0aW9uczogSU5vdGVib29rRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRDZWxsc0luUmFuZ2UoKS5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2VyID0gdGhpcy5fbWFya2VyU2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IGNlbGwudXJpLCBzZXZlcml0aWVzOiBNYXJrZXJTZXZlcml0eS5FcnJvciB8IE1hcmtlclNldmVyaXR5Lldhcm5pbmcgfSk7XG5cdFx0XHRtYXJrZXIuZm9yRWFjaChtID0+IHtcblx0XHRcdFx0Y29uc3QgY29sb3IgPSBtLnNldmVyaXR5ID09PSBNYXJrZXJTZXZlcml0eS5FcnJvciA/IGVkaXRvckVycm9yRm9yZWdyb3VuZCA6IGVkaXRvcldhcm5pbmdGb3JlZ3JvdW5kO1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IHsgc3RhcnRMaW5lTnVtYmVyOiBtLnN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW46IG0uc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXI6IG0uZW5kTGluZU51bWJlciwgZW5kQ29sdW1uOiBtLmVuZENvbHVtbiB9O1xuXHRcdFx0XHRjZWxsRGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0aGFuZGxlOiBjZWxsLmhhbmRsZSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdFx0XHRcdGNvbG9yOiBjb2xvcixcblx0XHRcdFx0XHRcdFx0bW9kZWxSYW5nZXM6IFtyYW5nZV0sXG5cdFx0XHRcdFx0XHRcdGluY2x1ZGVPdXRwdXQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogTm90ZWJvb2tPdmVydmlld1J1bGVyTGFuZS5SaWdodFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX21hcmtlcnNPdmVydmlld1J1bGVyRGVjb3JhdGlvbnMgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5kZWx0YUNlbGxEZWNvcmF0aW9ucyh0aGlzLl9tYXJrZXJzT3ZlcnZpZXdSdWxlckRlY29yYXRpb25zLCBjZWxsRGVjb3JhdGlvbnMpO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihNYXJrZXJMaXN0UHJvdmlkZXIuSUQsIE1hcmtlckxpc3RQcm92aWRlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcblxucmVnaXN0ZXJOb3RlYm9va0NvbnRyaWJ1dGlvbihOb3RlYm9va01hcmtlckRlY29yYXRpb25Db250cmlidXRpb24uaWQsIE5vdGVib29rTWFya2VyRGVjb3JhdGlvbkNvbnRyaWJ1dGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZ0JBQWdCLHNDQUFzQztBQUMvRCxTQUE4QixZQUFZLGdDQUFnQztBQUMxRSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0Isc0JBQXNCO0FBQy9DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQStCO0FBQ3hDLFNBQWlGLGlDQUFpQztBQUNsSCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QiwrQkFBK0I7QUFDL0QsU0FBUyxlQUFlO0FBRXhCLElBQU0scUJBQU4sTUFBd0Q7QUFBQSxFQU12RCxZQUNrQyxnQkFDUCxrQkFDYyxnQkFDdkM7QUFIZ0M7QUFFTztBQUV4QyxTQUFLLGNBQWMsaUJBQWlCLGlCQUFpQixJQUFJO0FBQUEsRUFDMUQ7QUFBQSxFQUVBLFVBQVU7QUFDVCxTQUFLLFlBQVksUUFBUTtBQUFBLEVBQzFCO0FBQUEsRUFFQSxjQUFjLFVBQW1EO0FBQ2hFLFFBQUksQ0FBQyxVQUFVO0FBQ2QsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLE9BQU8sUUFBUSxNQUFNLFFBQVE7QUFDbkMsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sSUFBSSxXQUFXLFNBQU87QUFDNUIsWUFBTSxZQUFZLFFBQVEsTUFBTSxHQUFHO0FBQ25DLGFBQU8sV0FBVyxTQUFTLFNBQVMsTUFBTSxLQUFLLFNBQVMsU0FBUztBQUFBLElBQ2xFLEdBQUcsS0FBSyxnQkFBZ0IsS0FBSyxjQUFjO0FBQUEsRUFDNUM7QUFDRDtBQS9CTSxtQkFFVyxLQUFLO0FBRmhCLHFCQUFOO0FBQUEsRUFPRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FURztBQWlDTixJQUFNLHVDQUFOLGNBQW1ELFdBQWtEO0FBQUEsRUFHcEcsWUFDa0IsaUJBQ2dCLGdCQUNoQztBQUNELFVBQU07QUFIVztBQUNnQjtBQUhsQyxTQUFRLG1DQUE2QyxDQUFDO0FBT3JELFNBQUssUUFBUTtBQUNiLFNBQUssVUFBVSxLQUFLLGdCQUFnQixpQkFBaUIsTUFBTSxLQUFLLFFBQVEsQ0FBQyxDQUFDO0FBQzFFLFNBQUssVUFBVSxLQUFLLGVBQWUsZ0JBQWdCLE9BQUs7QUFDdkQsVUFBSSxFQUFFLEtBQUssU0FBTyxLQUFLLGdCQUFnQixnQkFBZ0IsRUFBRSxLQUFLLFVBQVEsUUFBUSxLQUFLLEtBQUssR0FBRyxDQUFDLENBQUMsR0FBRztBQUMvRixhQUFLLFFBQVE7QUFBQSxNQUNkO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFHUSxVQUFVO0FBQ2pCLFFBQUksQ0FBQyxLQUFLLGdCQUFnQixTQUFTLEdBQUc7QUFDckM7QUFBQSxJQUNEO0FBRUEsVUFBTSxrQkFBOEMsQ0FBQztBQUNyRCxTQUFLLGdCQUFnQixnQkFBZ0IsRUFBRSxRQUFRLFVBQVE7QUFDdEQsWUFBTSxTQUFTLEtBQUssZUFBZSxLQUFLLEVBQUUsVUFBVSxLQUFLLEtBQUssWUFBWSxlQUFlLFFBQVEsZUFBZSxRQUFRLENBQUM7QUFDekgsYUFBTyxRQUFRLE9BQUs7QUFDbkIsY0FBTSxRQUFRLEVBQUUsYUFBYSxlQUFlLFFBQVEsd0JBQXdCO0FBQzVFLGNBQU0sUUFBUSxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixhQUFhLEVBQUUsYUFBYSxlQUFlLEVBQUUsZUFBZSxXQUFXLEVBQUUsVUFBVTtBQUN2SSx3QkFBZ0IsS0FBSztBQUFBLFVBQ3BCLFFBQVEsS0FBSztBQUFBLFVBQ2IsU0FBUztBQUFBLFlBQ1IsZUFBZTtBQUFBLGNBQ2Q7QUFBQSxjQUNBLGFBQWEsQ0FBQyxLQUFLO0FBQUEsY0FDbkIsZUFBZTtBQUFBLGNBQ2YsVUFBVSwwQkFBMEI7QUFBQSxZQUNyQztBQUFBLFVBQ0Q7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLG1DQUFtQyxLQUFLLGdCQUFnQixxQkFBcUIsS0FBSyxrQ0FBa0MsZUFBZTtBQUFBLEVBQ3pJO0FBQ0Q7QUE5Q00scUNBQ0UsS0FBYTtBQWtCWjtBQUFBLEVBRFAsU0FBUyxHQUFHO0FBQUEsR0FsQlIscUNBbUJHO0FBbkJILHVDQUFOO0FBQUEsRUFLRztBQUFBLEdBTEc7QUFnRE4sK0JBQStCLG1CQUFtQixJQUFJLG9CQUFvQixlQUFlLFlBQVk7QUFFckcsNkJBQTZCLHFDQUFxQyxJQUFJLG9DQUFvQzsiLAogICJuYW1lcyI6IFtdCn0K
