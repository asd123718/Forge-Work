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
import { Emitter } from "../../../../../base/common/event.js";
import { localize } from "../../../../../nls.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { listInvalidItemForeground, listDeemphasizedForeground } from "../../../../../platform/theme/common/colorRegistry.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { explorerRootErrorEmitter } from "./explorerViewer.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
function provideDecorations(fileStat) {
  if (fileStat.isRoot && fileStat.error) {
    return {
      tooltip: localize("canNotResolve", "Unable to resolve workspace folder ({0})", toErrorMessage(fileStat.error)),
      letter: "!",
      color: listInvalidItemForeground
    };
  }
  if (fileStat.isSymbolicLink) {
    return {
      tooltip: localize("symbolicLlink", "Symbolic Link"),
      letter: "\u2937"
    };
  }
  if (fileStat.isUnknown) {
    return {
      tooltip: localize("unknown", "Unknown File Type"),
      letter: "?"
    };
  }
  if (fileStat.isExcluded) {
    return {
      color: listDeemphasizedForeground
    };
  }
  return void 0;
}
let ExplorerDecorationsProvider = class {
  constructor(explorerService, contextService) {
    this.explorerService = explorerService;
    this.label = localize("label", "Explorer");
    this._onDidChange = new Emitter();
    this.toDispose = new DisposableStore();
    this.toDispose.add(this._onDidChange);
    this.toDispose.add(contextService.onDidChangeWorkspaceFolders((e) => {
      this._onDidChange.fire(e.changed.concat(e.added).map((wf) => wf.uri));
    }));
    this.toDispose.add(explorerRootErrorEmitter.event(((resource) => {
      this._onDidChange.fire([resource]);
    })));
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  async provideDecorations(resource) {
    const fileStat = this.explorerService.findClosest(resource);
    if (!fileStat) {
      throw new Error("ExplorerItem not found");
    }
    return provideDecorations(fileStat);
  }
  dispose() {
    this.toDispose.dispose();
  }
};
ExplorerDecorationsProvider = __decorateClass([
  __decorateParam(1, IWorkspaceContextService)
], ExplorerDecorationsProvider);
export {
  ExplorerDecorationsProvider,
  provideDecorations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFx2aWV3c1xcZXhwbG9yZXJEZWNvcmF0aW9uc1Byb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSURlY29yYXRpb25zUHJvdmlkZXIsIElEZWNvcmF0aW9uRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2RlY29yYXRpb25zL2NvbW1vbi9kZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBsaXN0SW52YWxpZEl0ZW1Gb3JlZ3JvdW5kLCBsaXN0RGVlbXBoYXNpemVkRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBleHBsb3JlclJvb3RFcnJvckVtaXR0ZXIgfSBmcm9tICcuL2V4cGxvcmVyVmlld2VyLmpzJztcbmltcG9ydCB7IEV4cGxvcmVySXRlbSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHBsb3Jlck1vZGVsLmpzJztcbmltcG9ydCB7IElFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuLi9maWxlcy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm92aWRlRGVjb3JhdGlvbnMoZmlsZVN0YXQ6IEV4cGxvcmVySXRlbSk6IElEZWNvcmF0aW9uRGF0YSB8IHVuZGVmaW5lZCB7XG5cdGlmIChmaWxlU3RhdC5pc1Jvb3QgJiYgZmlsZVN0YXQuZXJyb3IpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2Nhbk5vdFJlc29sdmUnLCBcIlVuYWJsZSB0byByZXNvbHZlIHdvcmtzcGFjZSBmb2xkZXIgKHswfSlcIiwgdG9FcnJvck1lc3NhZ2UoZmlsZVN0YXQuZXJyb3IpKSxcblx0XHRcdGxldHRlcjogJyEnLFxuXHRcdFx0Y29sb3I6IGxpc3RJbnZhbGlkSXRlbUZvcmVncm91bmQsXG5cdFx0fTtcblx0fVxuXHRpZiAoZmlsZVN0YXQuaXNTeW1ib2xpY0xpbmspIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3N5bWJvbGljTGxpbmsnLCBcIlN5bWJvbGljIExpbmtcIiksXG5cdFx0XHRsZXR0ZXI6ICdcXHUyOTM3J1xuXHRcdH07XG5cdH1cblx0aWYgKGZpbGVTdGF0LmlzVW5rbm93bikge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgndW5rbm93bicsIFwiVW5rbm93biBGaWxlIFR5cGVcIiksXG5cdFx0XHRsZXR0ZXI6ICc/J1xuXHRcdH07XG5cdH1cblx0aWYgKGZpbGVTdGF0LmlzRXhjbHVkZWQpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29sb3I6IGxpc3REZWVtcGhhc2l6ZWRGb3JlZ3JvdW5kLFxuXHRcdH07XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFByb3ZpZGVzIHRoZSBleHBsb3JlciBzcGVjaWZpYyBmaWxlIGRlY29yYXRpb25zIChzeW1ib2xpYyBsaW5rLCB1bmtub3duIGZpbGVcbiAqIHR5cGUsIGV4Y2x1ZGVkLCB1bnJlc29sdmFibGUgcm9vdCkuIFRoZSBkZWNvcmF0aW9ucyBhcmUgY29tcHV0ZWQgZnJvbSB0aGVcbiAqIGV4cGxvcmVyIG1vZGVsIGFuZCB0aGVyZWZvcmUgYXBwbHkgdG8gdGhlIHdob2xlIHdpbmRvdzogcmVnaXN0ZXIgdGhpcyBwcm92aWRlclxuICogb25seSBvbmNlIHBlciB3aW5kb3csIG90aGVyd2lzZSBldmVyeSByZWdpc3RyYXRpb24gY29udHJpYnV0ZXMgaXRzIG93biBiYWRnZVxuICogYW5kIGRlY29yYXRpb25zIHJlbmRlciBtdWx0aXBsZSB0aW1lcy5cbiAqL1xuZXhwb3J0IGNsYXNzIEV4cGxvcmVyRGVjb3JhdGlvbnNQcm92aWRlciBpbXBsZW1lbnRzIElEZWNvcmF0aW9uc1Byb3ZpZGVyIHtcblxuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nID0gbG9jYWxpemUoJ2xhYmVsJywgXCJFeHBsb3JlclwiKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxVUklbXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHBsb3JlclNlcnZpY2U6IElFeHBsb3JlclNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMudG9EaXNwb3NlLmFkZCh0aGlzLl9vbkRpZENoYW5nZSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UuYWRkKGNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyhlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZS5jaGFuZ2VkLmNvbmNhdChlLmFkZGVkKS5tYXAod2YgPT4gd2YudXJpKSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLmFkZChleHBsb3JlclJvb3RFcnJvckVtaXR0ZXIuZXZlbnQoKHJlc291cmNlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoW3Jlc291cmNlXSk7XG5cdFx0fSkpKTtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZSgpOiBFdmVudDxVUklbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVEZWNvcmF0aW9ucyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJRGVjb3JhdGlvbkRhdGEgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBmaWxlU3RhdCA9IHRoaXMuZXhwbG9yZXJTZXJ2aWNlLmZpbmRDbG9zZXN0KHJlc291cmNlKTtcblx0XHRpZiAoIWZpbGVTdGF0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4cGxvcmVySXRlbSBub3QgZm91bmQnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcHJvdmlkZURlY29yYXRpb25zKGZpbGVTdGF0KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy50b0Rpc3Bvc2UuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQWdCLGVBQWU7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUywyQkFBMkIsa0NBQWtDO0FBQ3RFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0NBQWdDO0FBR3pDLFNBQVMsc0JBQXNCO0FBRXhCLFNBQVMsbUJBQW1CLFVBQXFEO0FBQ3ZGLE1BQUksU0FBUyxVQUFVLFNBQVMsT0FBTztBQUN0QyxXQUFPO0FBQUEsTUFDTixTQUFTLFNBQVMsaUJBQWlCLDRDQUE0QyxlQUFlLFNBQVMsS0FBSyxDQUFDO0FBQUEsTUFDN0csUUFBUTtBQUFBLE1BQ1IsT0FBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0EsTUFBSSxTQUFTLGdCQUFnQjtBQUM1QixXQUFPO0FBQUEsTUFDTixTQUFTLFNBQVMsaUJBQWlCLGVBQWU7QUFBQSxNQUNsRCxRQUFRO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFDQSxNQUFJLFNBQVMsV0FBVztBQUN2QixXQUFPO0FBQUEsTUFDTixTQUFTLFNBQVMsV0FBVyxtQkFBbUI7QUFBQSxNQUNoRCxRQUFRO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFDQSxNQUFJLFNBQVMsWUFBWTtBQUN4QixXQUFPO0FBQUEsTUFDTixPQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7QUFTTyxJQUFNLDhCQUFOLE1BQWtFO0FBQUEsRUFNeEUsWUFDa0IsaUJBQ1MsZ0JBQ3pCO0FBRmdCO0FBTGxCLFNBQVMsUUFBZ0IsU0FBUyxTQUFTLFVBQVU7QUFDckQsU0FBaUIsZUFBZSxJQUFJLFFBQWU7QUFDbkQsU0FBaUIsWUFBWSxJQUFJLGdCQUFnQjtBQU1oRCxTQUFLLFVBQVUsSUFBSSxLQUFLLFlBQVk7QUFDcEMsU0FBSyxVQUFVLElBQUksZUFBZSw0QkFBNEIsT0FBSztBQUNsRSxXQUFLLGFBQWEsS0FBSyxFQUFFLFFBQVEsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLFFBQU0sR0FBRyxHQUFHLENBQUM7QUFBQSxJQUNuRSxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsSUFBSSx5QkFBeUIsT0FBTyxjQUFZO0FBQzlELFdBQUssYUFBYSxLQUFLLENBQUMsUUFBUSxDQUFDO0FBQUEsSUFDbEMsRUFBRSxDQUFDO0FBQUEsRUFDSjtBQUFBLEVBRUEsSUFBSSxjQUE0QjtBQUMvQixXQUFPLEtBQUssYUFBYTtBQUFBLEVBQzFCO0FBQUEsRUFFQSxNQUFNLG1CQUFtQixVQUFxRDtBQUM3RSxVQUFNLFdBQVcsS0FBSyxnQkFBZ0IsWUFBWSxRQUFRO0FBQzFELFFBQUksQ0FBQyxVQUFVO0FBQ2QsWUFBTSxJQUFJLE1BQU0sd0JBQXdCO0FBQUEsSUFDekM7QUFFQSxXQUFPLG1CQUFtQixRQUFRO0FBQUEsRUFDbkM7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSyxVQUFVLFFBQVE7QUFBQSxFQUN4QjtBQUNEO0FBbkNhLDhCQUFOO0FBQUEsRUFRSjtBQUFBLEdBUlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
