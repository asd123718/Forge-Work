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
import { IFileService } from "../../../../platform/files/common/files.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { ResourceFileEdit, ResourceTextEdit } from "../../../../editor/browser/services/bulkEditService.js";
import { ResourceNotebookCellEdit } from "./bulkCellEdits.js";
import { ILogService } from "../../../../platform/log/common/log.js";
let ConflictDetector = class {
  constructor(edits, fileService, modelService, logService) {
    this._conflicts = new ResourceMap();
    this._disposables = new DisposableStore();
    this._onDidConflict = new Emitter();
    this.onDidConflict = this._onDidConflict.event;
    const _workspaceEditResources = new ResourceMap();
    for (const edit of edits) {
      if (edit instanceof ResourceTextEdit) {
        _workspaceEditResources.set(edit.resource, true);
        if (typeof edit.versionId === "number") {
          const model = modelService.getModel(edit.resource);
          if (model && model.getVersionId() !== edit.versionId) {
            this._conflicts.set(edit.resource, true);
            this._onDidConflict.fire(this);
          }
        }
      } else if (edit instanceof ResourceFileEdit) {
        if (edit.newResource) {
          _workspaceEditResources.set(edit.newResource, true);
        } else if (edit.oldResource) {
          _workspaceEditResources.set(edit.oldResource, true);
        }
      } else if (edit instanceof ResourceNotebookCellEdit) {
        _workspaceEditResources.set(edit.resource, true);
      } else {
        logService.warn("UNKNOWN edit type", edit);
      }
    }
    this._disposables.add(fileService.onDidFilesChange((e) => {
      for (const uri of _workspaceEditResources.keys()) {
        if (!modelService.getModel(uri) && e.contains(uri)) {
          this._conflicts.set(uri, true);
          this._onDidConflict.fire(this);
          break;
        }
      }
    }));
    const onDidChangeModel = (model) => {
      if (_workspaceEditResources.has(model.uri)) {
        this._conflicts.set(model.uri, true);
        this._onDidConflict.fire(this);
      }
    };
    for (const model of modelService.getModels()) {
      this._disposables.add(model.onDidChangeContent(() => onDidChangeModel(model)));
    }
  }
  dispose() {
    this._disposables.dispose();
    this._onDidConflict.dispose();
  }
  list() {
    return [...this._conflicts.keys()];
  }
  hasConflicts() {
    return this._conflicts.size > 0;
  }
};
ConflictDetector = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IModelService),
  __decorateParam(3, ILogService)
], ConflictDetector);
export {
  ConflictDetector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJ1bGtFZGl0XFxicm93c2VyXFxjb25mbGljdHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFJlc291cmNlRWRpdCwgUmVzb3VyY2VGaWxlRWRpdCwgUmVzb3VyY2VUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU5vdGVib29rQ2VsbEVkaXQgfSBmcm9tICcuL2J1bGtDZWxsRWRpdHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDb25mbGljdERldGVjdG9yIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25mbGljdHMgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDb25mbGljdCA9IG5ldyBFbWl0dGVyPHRoaXM+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ29uZmxpY3Q6IEV2ZW50PHRoaXM+ID0gdGhpcy5fb25EaWRDb25mbGljdC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0czogUmVzb3VyY2VFZGl0W10sXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXG5cdFx0Y29uc3QgX3dvcmtzcGFjZUVkaXRSZXNvdXJjZXMgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblxuXHRcdGZvciAoY29uc3QgZWRpdCBvZiBlZGl0cykge1xuXHRcdFx0aWYgKGVkaXQgaW5zdGFuY2VvZiBSZXNvdXJjZVRleHRFZGl0KSB7XG5cdFx0XHRcdF93b3Jrc3BhY2VFZGl0UmVzb3VyY2VzLnNldChlZGl0LnJlc291cmNlLCB0cnVlKTtcblx0XHRcdFx0aWYgKHR5cGVvZiBlZGl0LnZlcnNpb25JZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IG1vZGVsU2VydmljZS5nZXRNb2RlbChlZGl0LnJlc291cmNlKTtcblx0XHRcdFx0XHRpZiAobW9kZWwgJiYgbW9kZWwuZ2V0VmVyc2lvbklkKCkgIT09IGVkaXQudmVyc2lvbklkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jb25mbGljdHMuc2V0KGVkaXQucmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDb25mbGljdC5maXJlKHRoaXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHR9IGVsc2UgaWYgKGVkaXQgaW5zdGFuY2VvZiBSZXNvdXJjZUZpbGVFZGl0KSB7XG5cdFx0XHRcdGlmIChlZGl0Lm5ld1Jlc291cmNlKSB7XG5cdFx0XHRcdFx0X3dvcmtzcGFjZUVkaXRSZXNvdXJjZXMuc2V0KGVkaXQubmV3UmVzb3VyY2UsIHRydWUpO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAoZWRpdC5vbGRSZXNvdXJjZSkge1xuXHRcdFx0XHRcdF93b3Jrc3BhY2VFZGl0UmVzb3VyY2VzLnNldChlZGl0Lm9sZFJlc291cmNlLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChlZGl0IGluc3RhbmNlb2YgUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0KSB7XG5cdFx0XHRcdF93b3Jrc3BhY2VFZGl0UmVzb3VyY2VzLnNldChlZGl0LnJlc291cmNlLCB0cnVlKTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bG9nU2VydmljZS53YXJuKCdVTktOT1dOIGVkaXQgdHlwZScsIGVkaXQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGxpc3RlbiB0byBmaWxlIGNoYW5nZXNcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblxuXHRcdFx0Zm9yIChjb25zdCB1cmkgb2YgX3dvcmtzcGFjZUVkaXRSZXNvdXJjZXMua2V5cygpKSB7XG5cdFx0XHRcdC8vIGNvbmZsaWN0IGhhcHBlbnMgd2hlbiBhIGZpbGUgdGhhdCB3ZSBhcmUgd29ya2luZ1xuXHRcdFx0XHQvLyBvbiBjaGFuZ2VzIG9uIGRpc2suIGlnbm9yZSBjaGFuZ2VzIGZvciB3aGljaCBhIG1vZGVsXG5cdFx0XHRcdC8vIGV4aXN0cyBiZWNhdXNlIHdlIGhhdmUgYSBiZXR0ZXIgY2hlY2sgZm9yIG1vZGVsc1xuXHRcdFx0XHRpZiAoIW1vZGVsU2VydmljZS5nZXRNb2RlbCh1cmkpICYmIGUuY29udGFpbnModXJpKSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbmZsaWN0cy5zZXQodXJpLCB0cnVlKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENvbmZsaWN0LmZpcmUodGhpcyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBsaXN0ZW4gdG8gbW9kZWwgY2hhbmdlcy4uLj9cblx0XHRjb25zdCBvbkRpZENoYW5nZU1vZGVsID0gKG1vZGVsOiBJVGV4dE1vZGVsKSA9PiB7XG5cblx0XHRcdC8vIGNvbmZsaWN0XG5cdFx0XHRpZiAoX3dvcmtzcGFjZUVkaXRSZXNvdXJjZXMuaGFzKG1vZGVsLnVyaSkpIHtcblx0XHRcdFx0dGhpcy5fY29uZmxpY3RzLnNldChtb2RlbC51cmksIHRydWUpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENvbmZsaWN0LmZpcmUodGhpcyk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIG1vZGVsU2VydmljZS5nZXRNb2RlbHMoKSkge1xuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiBvbkRpZENoYW5nZU1vZGVsKG1vZGVsKSkpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ29uZmxpY3QuZGlzcG9zZSgpO1xuXHR9XG5cblx0bGlzdCgpOiBVUklbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9jb25mbGljdHMua2V5cygpXTtcblx0fVxuXG5cdGhhc0NvbmZsaWN0cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmxpY3RzLnNpemUgPiAwO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBc0I7QUFFL0IsU0FBdUIsa0JBQWtCLHdCQUF3QjtBQUNqRSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG1CQUFtQjtBQUVyQixJQUFNLG1CQUFOLE1BQXVCO0FBQUEsRUFRN0IsWUFDQyxPQUNjLGFBQ0MsY0FDRixZQUNaO0FBWEYsU0FBaUIsYUFBYSxJQUFJLFlBQXFCO0FBQ3ZELFNBQWlCLGVBQWUsSUFBSSxnQkFBZ0I7QUFFcEQsU0FBaUIsaUJBQWlCLElBQUksUUFBYztBQUNwRCxTQUFTLGdCQUE2QixLQUFLLGVBQWU7QUFTekQsVUFBTSwwQkFBMEIsSUFBSSxZQUFxQjtBQUV6RCxlQUFXLFFBQVEsT0FBTztBQUN6QixVQUFJLGdCQUFnQixrQkFBa0I7QUFDckMsZ0NBQXdCLElBQUksS0FBSyxVQUFVLElBQUk7QUFDL0MsWUFBSSxPQUFPLEtBQUssY0FBYyxVQUFVO0FBQ3ZDLGdCQUFNLFFBQVEsYUFBYSxTQUFTLEtBQUssUUFBUTtBQUNqRCxjQUFJLFNBQVMsTUFBTSxhQUFhLE1BQU0sS0FBSyxXQUFXO0FBQ3JELGlCQUFLLFdBQVcsSUFBSSxLQUFLLFVBQVUsSUFBSTtBQUN2QyxpQkFBSyxlQUFlLEtBQUssSUFBSTtBQUFBLFVBQzlCO0FBQUEsUUFDRDtBQUFBLE1BRUQsV0FBVyxnQkFBZ0Isa0JBQWtCO0FBQzVDLFlBQUksS0FBSyxhQUFhO0FBQ3JCLGtDQUF3QixJQUFJLEtBQUssYUFBYSxJQUFJO0FBQUEsUUFFbkQsV0FBVyxLQUFLLGFBQWE7QUFDNUIsa0NBQXdCLElBQUksS0FBSyxhQUFhLElBQUk7QUFBQSxRQUNuRDtBQUFBLE1BQ0QsV0FBVyxnQkFBZ0IsMEJBQTBCO0FBQ3BELGdDQUF3QixJQUFJLEtBQUssVUFBVSxJQUFJO0FBQUEsTUFFaEQsT0FBTztBQUNOLG1CQUFXLEtBQUsscUJBQXFCLElBQUk7QUFBQSxNQUMxQztBQUFBLElBQ0Q7QUFHQSxTQUFLLGFBQWEsSUFBSSxZQUFZLGlCQUFpQixPQUFLO0FBRXZELGlCQUFXLE9BQU8sd0JBQXdCLEtBQUssR0FBRztBQUlqRCxZQUFJLENBQUMsYUFBYSxTQUFTLEdBQUcsS0FBSyxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBQ25ELGVBQUssV0FBVyxJQUFJLEtBQUssSUFBSTtBQUM3QixlQUFLLGVBQWUsS0FBSyxJQUFJO0FBQzdCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLFVBQU0sbUJBQW1CLENBQUMsVUFBc0I7QUFHL0MsVUFBSSx3QkFBd0IsSUFBSSxNQUFNLEdBQUcsR0FBRztBQUMzQyxhQUFLLFdBQVcsSUFBSSxNQUFNLEtBQUssSUFBSTtBQUNuQyxhQUFLLGVBQWUsS0FBSyxJQUFJO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBQ0EsZUFBVyxTQUFTLGFBQWEsVUFBVSxHQUFHO0FBQzdDLFdBQUssYUFBYSxJQUFJLE1BQU0sbUJBQW1CLE1BQU0saUJBQWlCLEtBQUssQ0FBQyxDQUFDO0FBQUEsSUFDOUU7QUFBQSxFQUNEO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssYUFBYSxRQUFRO0FBQzFCLFNBQUssZUFBZSxRQUFRO0FBQUEsRUFDN0I7QUFBQSxFQUVBLE9BQWM7QUFDYixXQUFPLENBQUMsR0FBRyxLQUFLLFdBQVcsS0FBSyxDQUFDO0FBQUEsRUFDbEM7QUFBQSxFQUVBLGVBQXdCO0FBQ3ZCLFdBQU8sS0FBSyxXQUFXLE9BQU87QUFBQSxFQUMvQjtBQUNEO0FBcEZhLG1CQUFOO0FBQUEsRUFVSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFtdCn0K
