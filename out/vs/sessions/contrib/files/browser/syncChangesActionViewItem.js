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
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { autorun, derivedOpts } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { structuralEquals } from "../../../../base/common/equals.js";
import { reset } from "../../../../base/browser/dom.js";
import { ISCMService } from "../../../../workbench/contrib/scm/common/scm.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { MutableDisposable } from "../../../../base/common/lifecycle.js";
let SyncChangesActionViewItem = class extends ActionViewItem {
  constructor(action, options, scmService, contextService) {
    super(void 0, action, { ...options, icon: false, label: true });
    this.scmService = scmService;
    this.contextService = contextService;
    this._labelUpdateDisposable = this._register(new MutableDisposable());
  }
  getTooltip() {
    return this._tooltip ?? super.getTooltip();
  }
  updateLabel() {
    this._labelUpdateDisposable.clear();
    if (!this.label) {
      return;
    }
    this.label.classList.add("sync-changes-action-view-item");
    const workspaceFolder = this.contextService.getWorkspace().folders[0];
    const repository = workspaceFolder ? Iterable.find(this.scmService.repositories, (repo) => isEqual(repo.provider.rootUri, workspaceFolder.uri)) : void 0;
    const syncActionDetailsObs = derivedOpts(
      { equalsFn: structuralEquals },
      (reader) => {
        const commands = repository?.provider.statusBarCommands.read(reader);
        const syncCommand = commands?.find((c) => c.title.startsWith("$(sync)") || c.title.startsWith("$(sync~spin)"));
        return syncCommand ? {
          title: syncCommand.title,
          tooltip: syncCommand.tooltip
        } : void 0;
      }
    );
    this._labelUpdateDisposable.value = autorun((reader) => {
      const syncActionDetails = syncActionDetailsObs.read(reader);
      reset(this.label, ...syncActionDetails ? renderLabelWithIcons(syncActionDetails.title) : []);
      this._tooltip = syncActionDetails?.tooltip;
      this.updateTooltip();
    });
  }
};
SyncChangesActionViewItem = __decorateClass([
  __decorateParam(2, ISCMService),
  __decorateParam(3, IWorkspaceContextService)
], SyncChangesActionViewItem);
export {
  SyncChangesActionViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcZmlsZXNcXGJyb3dzZXJcXHN5bmNDaGFuZ2VzQWN0aW9uVmlld0l0ZW0udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZHJvcGRvd24vZHJvcGRvd25BY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWRPcHRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IHN0cnVjdHVyYWxFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuaW1wb3J0IHsgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElTQ01TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvc2NtL2NvbW1vbi9zY20uanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5leHBvcnQgY2xhc3MgU3luY0NoYW5nZXNBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEFjdGlvblZpZXdJdGVtIHtcblx0cHJpdmF0ZSBfdG9vbHRpcDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFVwZGF0ZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElTQ01TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2NtU2VydmljZTogSVNDTVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUb29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rvb2x0aXAgPz8gc3VwZXIuZ2V0VG9vbHRpcCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUxhYmVsKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xhYmVsVXBkYXRlRGlzcG9zYWJsZS5jbGVhcigpO1xuXG5cdFx0aWYgKCF0aGlzLmxhYmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QuYWRkKCdzeW5jLWNoYW5nZXMtYWN0aW9uLXZpZXctaXRlbScpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB3b3Jrc3BhY2VGb2xkZXJcblx0XHRcdD8gSXRlcmFibGUuZmluZCh0aGlzLnNjbVNlcnZpY2UucmVwb3NpdG9yaWVzLCByZXBvID0+IGlzRXF1YWwocmVwby5wcm92aWRlci5yb290VXJpLCB3b3Jrc3BhY2VGb2xkZXIudXJpKSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc3luY0FjdGlvbkRldGFpbHNPYnMgPSBkZXJpdmVkT3B0czx7IHRpdGxlOiBzdHJpbmc7IHRvb2x0aXA/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4oeyBlcXVhbHNGbjogc3RydWN0dXJhbEVxdWFscyB9LFxuXHRcdFx0cmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZHMgPSByZXBvc2l0b3J5Py5wcm92aWRlci5zdGF0dXNCYXJDb21tYW5kcy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdFx0Ly8gV2UgYXJlIHJldXNpbmcgdGhlIHN5bmMgc3RhdHVzIGJhciBjb21tYW5kIHRoYXQgaXMgYmVpbmcgY29udHJpYnV0ZWQgYnkgdGhlIGdpdCBleHRlbnNpb24gYXMgdGhhdCBpc1xuXHRcdFx0XHQvLyBiZWluZyB1cGRhdGVkIGJhc2VkIG9uIHRoZSBsYXRlc3Qgc3RhdGUgYXMgd2VsbCBhcyB3aGlsZSB0aGUgYWN0aW9uIGlzIHJ1bm5pbmcuIExvbmcgdGVybSwgd2UgbmVlZCB0b1xuXHRcdFx0XHQvLyBmaW5kIGEgYmV0dGVyIHdheSB0byBpZGVudGlmeSBhbmQgcmV1c2UgdGhpcyBjb21tYW5kLlxuXHRcdFx0XHRjb25zdCBzeW5jQ29tbWFuZCA9IGNvbW1hbmRzPy5maW5kKGMgPT4gYy50aXRsZS5zdGFydHNXaXRoKCckKHN5bmMpJykgfHwgYy50aXRsZS5zdGFydHNXaXRoKCckKHN5bmN+c3BpbiknKSk7XG5cblx0XHRcdFx0cmV0dXJuIHN5bmNDb21tYW5kXG5cdFx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0XHR0aXRsZTogc3luY0NvbW1hbmQudGl0bGUsXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBzeW5jQ29tbWFuZC50b29sdGlwXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cblx0XHR0aGlzLl9sYWJlbFVwZGF0ZURpc3Bvc2FibGUudmFsdWUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzeW5jQWN0aW9uRGV0YWlscyA9IHN5bmNBY3Rpb25EZXRhaWxzT2JzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0cmVzZXQodGhpcy5sYWJlbCEsIC4uLihzeW5jQWN0aW9uRGV0YWlscyA/IHJlbmRlckxhYmVsV2l0aEljb25zKHN5bmNBY3Rpb25EZXRhaWxzLnRpdGxlKSA6IFtdKSk7XG5cblx0XHRcdHRoaXMuX3Rvb2x0aXAgPSBzeW5jQWN0aW9uRGV0YWlscz8udG9vbHRpcDtcblx0XHRcdHRoaXMudXBkYXRlVG9vbHRpcCgpO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxtQkFBbUI7QUFDckMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsYUFBYTtBQUN0QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUUzQixJQUFNLDRCQUFOLGNBQXdDLGVBQWU7QUFBQSxFQUk3RCxZQUNDLFFBQ0EsU0FDOEIsWUFDYSxnQkFDMUM7QUFDRCxVQUFNLFFBQVcsUUFBUSxFQUFFLEdBQUcsU0FBUyxNQUFNLE9BQU8sT0FBTyxLQUFLLENBQUM7QUFIbkM7QUFDYTtBQU41QyxTQUFpQix5QkFBeUIsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFBQSxFQVNoRjtBQUFBLEVBRW1CLGFBQWlDO0FBQ25ELFdBQU8sS0FBSyxZQUFZLE1BQU0sV0FBVztBQUFBLEVBQzFDO0FBQUEsRUFFbUIsY0FBb0I7QUFDdEMsU0FBSyx1QkFBdUIsTUFBTTtBQUVsQyxRQUFJLENBQUMsS0FBSyxPQUFPO0FBQ2hCO0FBQUEsSUFDRDtBQUVBLFNBQUssTUFBTSxVQUFVLElBQUksK0JBQStCO0FBRXhELFVBQU0sa0JBQWtCLEtBQUssZUFBZSxhQUFhLEVBQUUsUUFBUSxDQUFDO0FBQ3BFLFVBQU0sYUFBYSxrQkFDaEIsU0FBUyxLQUFLLEtBQUssV0FBVyxjQUFjLFVBQVEsUUFBUSxLQUFLLFNBQVMsU0FBUyxnQkFBZ0IsR0FBRyxDQUFDLElBQ3ZHO0FBRUgsVUFBTSx1QkFBdUI7QUFBQSxNQUE2RCxFQUFFLFVBQVUsaUJBQWlCO0FBQUEsTUFDdEgsWUFBVTtBQUNULGNBQU0sV0FBVyxZQUFZLFNBQVMsa0JBQWtCLEtBQUssTUFBTTtBQUtuRSxjQUFNLGNBQWMsVUFBVSxLQUFLLE9BQUssRUFBRSxNQUFNLFdBQVcsU0FBUyxLQUFLLEVBQUUsTUFBTSxXQUFXLGNBQWMsQ0FBQztBQUUzRyxlQUFPLGNBQ0o7QUFBQSxVQUNELE9BQU8sWUFBWTtBQUFBLFVBQ25CLFNBQVMsWUFBWTtBQUFBLFFBQ3RCLElBQ0U7QUFBQSxNQUNKO0FBQUEsSUFBQztBQUVGLFNBQUssdUJBQXVCLFFBQVEsUUFBUSxZQUFVO0FBQ3JELFlBQU0sb0JBQW9CLHFCQUFxQixLQUFLLE1BQU07QUFFMUQsWUFBTSxLQUFLLE9BQVEsR0FBSSxvQkFBb0IscUJBQXFCLGtCQUFrQixLQUFLLElBQUksQ0FBQyxDQUFFO0FBRTlGLFdBQUssV0FBVyxtQkFBbUI7QUFDbkMsV0FBSyxjQUFjO0FBQUEsSUFDcEIsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQXpEYSw0QkFBTjtBQUFBLEVBT0o7QUFBQSxFQUNBO0FBQUEsR0FSVTsiLAogICJuYW1lcyI6IFtdCn0K
