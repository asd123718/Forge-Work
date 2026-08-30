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
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../../../common/contributions.js";
import { CellKind } from "../../../common/notebookCommon.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { CellEditState, getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { RedoCommand, UndoCommand } from "../../../../../../editor/browser/editorExtensions.js";
let NotebookUndoRedoContribution = class extends Disposable {
  constructor(_editorService) {
    super();
    this._editorService = _editorService;
    const PRIORITY = 105;
    this._register(UndoCommand.addImplementation(PRIORITY, "notebook-undo-redo", () => {
      const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
      const viewModel = editor?.getViewModel();
      if (editor && editor.hasEditorFocus() && editor.hasModel() && viewModel) {
        return viewModel.undo().then((cellResources) => {
          if (cellResources?.length) {
            for (let i = 0; i < editor.getLength(); i++) {
              const cell = editor.cellAt(i);
              if (cell.cellKind === CellKind.Markup && cellResources.find((resource) => resource.fragment === cell.model.uri.fragment)) {
                cell.updateEditState(CellEditState.Editing, "undo");
              }
            }
            editor?.setOptions({ cellOptions: { resource: cellResources[0] }, preserveFocus: true });
          }
        });
      }
      return false;
    }));
    this._register(RedoCommand.addImplementation(PRIORITY, "notebook-undo-redo", () => {
      const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
      const viewModel = editor?.getViewModel();
      if (editor && editor.hasEditorFocus() && editor.hasModel() && viewModel) {
        return viewModel.redo().then((cellResources) => {
          if (cellResources?.length) {
            for (let i = 0; i < editor.getLength(); i++) {
              const cell = editor.cellAt(i);
              if (cell.cellKind === CellKind.Markup && cellResources.find((resource) => resource.fragment === cell.model.uri.fragment)) {
                cell.updateEditState(CellEditState.Editing, "redo");
              }
            }
            editor?.setOptions({ cellOptions: { resource: cellResources[0] }, preserveFocus: true });
          }
        });
      }
      return false;
    }));
  }
};
NotebookUndoRedoContribution.ID = "workbench.contrib.notebookUndoRedo";
NotebookUndoRedoContribution = __decorateClass([
  __decorateParam(0, IEditorService)
], NotebookUndoRedoContribution);
registerWorkbenchContribution2(NotebookUndoRedoContribution.ID, NotebookUndoRedoContribution, WorkbenchPhase.BlockRestore);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFx1bmRvUmVkb1xcbm90ZWJvb2tVbmRvUmVkby50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IENlbGxLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENlbGxFZGl0U3RhdGUsIGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgUmVkb0NvbW1hbmQsIFVuZG9Db21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1ZpZXdNb2RlbCB9IGZyb20gJy4uLy4uL3ZpZXdNb2RlbC9ub3RlYm9va1ZpZXdNb2RlbEltcGwuanMnO1xuXG5jbGFzcyBOb3RlYm9va1VuZG9SZWRvQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm5vdGVib29rVW5kb1JlZG8nO1xuXG5cdGNvbnN0cnVjdG9yKEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBQUklPUklUWSA9IDEwNTtcblx0XHR0aGlzLl9yZWdpc3RlcihVbmRvQ29tbWFuZC5hZGRJbXBsZW1lbnRhdGlvbihQUklPUklUWSwgJ25vdGVib29rLXVuZG8tcmVkbycsICgpID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUodGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IGVkaXRvcj8uZ2V0Vmlld01vZGVsKCkgYXMgTm90ZWJvb2tWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZWRpdG9yICYmIGVkaXRvci5oYXNFZGl0b3JGb2N1cygpICYmIGVkaXRvci5oYXNNb2RlbCgpICYmIHZpZXdNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gdmlld01vZGVsLnVuZG8oKS50aGVuKGNlbGxSZXNvdXJjZXMgPT4ge1xuXHRcdFx0XHRcdGlmIChjZWxsUmVzb3VyY2VzPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZWRpdG9yLmdldExlbmd0aCgpOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2VsbCA9IGVkaXRvci5jZWxsQXQoaSk7XG5cdFx0XHRcdFx0XHRcdGlmIChjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXAgJiYgY2VsbFJlc291cmNlcy5maW5kKHJlc291cmNlID0+IHJlc291cmNlLmZyYWdtZW50ID09PSBjZWxsLm1vZGVsLnVyaS5mcmFnbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0XHRjZWxsLnVwZGF0ZUVkaXRTdGF0ZShDZWxsRWRpdFN0YXRlLkVkaXRpbmcsICd1bmRvJyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0ZWRpdG9yPy5zZXRPcHRpb25zKHsgY2VsbE9wdGlvbnM6IHsgcmVzb3VyY2U6IGNlbGxSZXNvdXJjZXNbMF0gfSwgcHJlc2VydmVGb2N1czogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoUmVkb0NvbW1hbmQuYWRkSW1wbGVtZW50YXRpb24oUFJJT1JJVFksICdub3RlYm9vay11bmRvLXJlZG8nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSBlZGl0b3I/LmdldFZpZXdNb2RlbCgpIGFzIE5vdGVib29rVmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoZWRpdG9yICYmIGVkaXRvci5oYXNFZGl0b3JGb2N1cygpICYmIGVkaXRvci5oYXNNb2RlbCgpICYmIHZpZXdNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gdmlld01vZGVsLnJlZG8oKS50aGVuKGNlbGxSZXNvdXJjZXMgPT4ge1xuXHRcdFx0XHRcdGlmIChjZWxsUmVzb3VyY2VzPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZWRpdG9yLmdldExlbmd0aCgpOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2VsbCA9IGVkaXRvci5jZWxsQXQoaSk7XG5cdFx0XHRcdFx0XHRcdGlmIChjZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXAgJiYgY2VsbFJlc291cmNlcy5maW5kKHJlc291cmNlID0+IHJlc291cmNlLmZyYWdtZW50ID09PSBjZWxsLm1vZGVsLnVyaS5mcmFnbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0XHRjZWxsLnVwZGF0ZUVkaXRTdGF0ZShDZWxsRWRpdFN0YXRlLkVkaXRpbmcsICdyZWRvJyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0ZWRpdG9yPy5zZXRPcHRpb25zKHsgY2VsbE9wdGlvbnM6IHsgcmVzb3VyY2U6IGNlbGxSZXNvdXJjZXNbMF0gfSwgcHJlc2VydmVGb2N1czogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihOb3RlYm9va1VuZG9SZWRvQ29udHJpYnV0aW9uLklELCBOb3RlYm9va1VuZG9SZWRvQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQixzQ0FBc0M7QUFDL0QsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFlLHVDQUF1QztBQUMvRCxTQUFTLGFBQWEsbUJBQW1CO0FBR3pDLElBQU0sK0JBQU4sY0FBMkMsV0FBVztBQUFBLEVBSXJELFlBQTZDLGdCQUFnQztBQUM1RSxVQUFNO0FBRHNDO0FBRzVDLFVBQU0sV0FBVztBQUNqQixTQUFLLFVBQVUsWUFBWSxrQkFBa0IsVUFBVSxzQkFBc0IsTUFBTTtBQUNsRixZQUFNLFNBQVMsZ0NBQWdDLEtBQUssZUFBZSxnQkFBZ0I7QUFDbkYsWUFBTSxZQUFZLFFBQVEsYUFBYTtBQUN2QyxVQUFJLFVBQVUsT0FBTyxlQUFlLEtBQUssT0FBTyxTQUFTLEtBQUssV0FBVztBQUN4RSxlQUFPLFVBQVUsS0FBSyxFQUFFLEtBQUssbUJBQWlCO0FBQzdDLGNBQUksZUFBZSxRQUFRO0FBQzFCLHFCQUFTLElBQUksR0FBRyxJQUFJLE9BQU8sVUFBVSxHQUFHLEtBQUs7QUFDNUMsb0JBQU0sT0FBTyxPQUFPLE9BQU8sQ0FBQztBQUM1QixrQkFBSSxLQUFLLGFBQWEsU0FBUyxVQUFVLGNBQWMsS0FBSyxjQUFZLFNBQVMsYUFBYSxLQUFLLE1BQU0sSUFBSSxRQUFRLEdBQUc7QUFDdkgscUJBQUssZ0JBQWdCLGNBQWMsU0FBUyxNQUFNO0FBQUEsY0FDbkQ7QUFBQSxZQUNEO0FBRUEsb0JBQVEsV0FBVyxFQUFFLGFBQWEsRUFBRSxVQUFVLGNBQWMsQ0FBQyxFQUFFLEdBQUcsZUFBZSxLQUFLLENBQUM7QUFBQSxVQUN4RjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFFQSxhQUFPO0FBQUEsSUFDUixDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsWUFBWSxrQkFBa0IsVUFBVSxzQkFBc0IsTUFBTTtBQUNsRixZQUFNLFNBQVMsZ0NBQWdDLEtBQUssZUFBZSxnQkFBZ0I7QUFDbkYsWUFBTSxZQUFZLFFBQVEsYUFBYTtBQUV2QyxVQUFJLFVBQVUsT0FBTyxlQUFlLEtBQUssT0FBTyxTQUFTLEtBQUssV0FBVztBQUN4RSxlQUFPLFVBQVUsS0FBSyxFQUFFLEtBQUssbUJBQWlCO0FBQzdDLGNBQUksZUFBZSxRQUFRO0FBQzFCLHFCQUFTLElBQUksR0FBRyxJQUFJLE9BQU8sVUFBVSxHQUFHLEtBQUs7QUFDNUMsb0JBQU0sT0FBTyxPQUFPLE9BQU8sQ0FBQztBQUM1QixrQkFBSSxLQUFLLGFBQWEsU0FBUyxVQUFVLGNBQWMsS0FBSyxjQUFZLFNBQVMsYUFBYSxLQUFLLE1BQU0sSUFBSSxRQUFRLEdBQUc7QUFDdkgscUJBQUssZ0JBQWdCLGNBQWMsU0FBUyxNQUFNO0FBQUEsY0FDbkQ7QUFBQSxZQUNEO0FBRUEsb0JBQVEsV0FBVyxFQUFFLGFBQWEsRUFBRSxVQUFVLGNBQWMsQ0FBQyxFQUFFLEdBQUcsZUFBZSxLQUFLLENBQUM7QUFBQSxVQUN4RjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFFQSxhQUFPO0FBQUEsSUFDUixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0Q7QUFuRE0sNkJBRVcsS0FBSztBQUZoQiwrQkFBTjtBQUFBLEVBSWM7QUFBQSxHQUpSO0FBcUROLCtCQUErQiw2QkFBNkIsSUFBSSw4QkFBOEIsZUFBZSxZQUFZOyIsCiAgIm5hbWVzIjogW10KfQo=
