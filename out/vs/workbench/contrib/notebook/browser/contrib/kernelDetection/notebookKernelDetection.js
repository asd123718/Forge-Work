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
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../../../common/contributions.js";
import { INotebookKernelService } from "../../../common/notebookKernelService.js";
import { INotebookLoggingService } from "../../../common/notebookLoggingService.js";
import { IExtensionService } from "../../../../../services/extensions/common/extensions.js";
import { LifecyclePhase } from "../../../../../services/lifecycle/common/lifecycle.js";
let NotebookKernelDetection = class extends Disposable {
  constructor(_notebookKernelService, _extensionService, _notebookLoggingService) {
    super();
    this._notebookKernelService = _notebookKernelService;
    this._extensionService = _extensionService;
    this._notebookLoggingService = _notebookLoggingService;
    this._detectionMap = /* @__PURE__ */ new Map();
    this._localDisposableStore = this._register(new DisposableStore());
    this._registerListeners();
  }
  _registerListeners() {
    this._localDisposableStore.clear();
    this._localDisposableStore.add(this._extensionService.onWillActivateByEvent((e) => {
      if (e.event.startsWith("onNotebook:")) {
        if (this._extensionService.activationEventIsDone(e.event)) {
          return;
        }
        const notebookType = e.event.substring("onNotebook:".length);
        if (notebookType === "*") {
          return;
        }
        let shouldStartDetection = false;
        const extensionStatus = this._extensionService.getExtensionsStatus();
        this._extensionService.extensions.forEach((extension) => {
          if (extensionStatus[extension.identifier.value].activationTimes) {
            return;
          }
          if (extension.activationEvents?.includes(e.event)) {
            shouldStartDetection = true;
          }
        });
        if (shouldStartDetection && !this._detectionMap.has(notebookType)) {
          this._notebookLoggingService.debug("KernelDetection", `start extension activation for ${notebookType}`);
          const task = this._notebookKernelService.registerNotebookKernelDetectionTask({
            notebookType
          });
          this._detectionMap.set(notebookType, task);
        }
      }
    }));
    let timer = null;
    this._localDisposableStore.add(this._extensionService.onDidChangeExtensionsStatus(() => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        const taskToDelete = [];
        for (const [notebookType, task] of this._detectionMap) {
          if (this._extensionService.activationEventIsDone(`onNotebook:${notebookType}`)) {
            this._notebookLoggingService.debug("KernelDetection", `finish extension activation for ${notebookType}`);
            taskToDelete.push(notebookType);
            task.dispose();
          }
        }
        taskToDelete.forEach((notebookType) => {
          this._detectionMap.delete(notebookType);
        });
      });
    }));
    this._localDisposableStore.add({
      dispose: () => {
        if (timer) {
          clearTimeout(timer);
        }
      }
    });
  }
};
NotebookKernelDetection = __decorateClass([
  __decorateParam(0, INotebookKernelService),
  __decorateParam(1, IExtensionService),
  __decorateParam(2, INotebookLoggingService)
], NotebookKernelDetection);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookKernelDetection, LifecyclePhase.Restored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxrZXJuZWxEZXRlY3Rpb25cXG5vdGVib29rS2VybmVsRGV0ZWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0tlcm5lbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rTG9nZ2luZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5jbGFzcyBOb3RlYm9va0tlcm5lbERldGVjdGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0cHJpdmF0ZSBfZGV0ZWN0aW9uTWFwID0gbmV3IE1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOb3RlYm9va0tlcm5lbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tLZXJuZWxTZXJ2aWNlOiBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASU5vdGVib29rTG9nZ2luZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tMb2dnaW5nU2VydmljZTogSU5vdGVib29rTG9nZ2luZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlckxpc3RlbmVycygpIHtcblx0XHR0aGlzLl9sb2NhbERpc3Bvc2FibGVTdG9yZS5jbGVhcigpO1xuXG5cdFx0dGhpcy5fbG9jYWxEaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uub25XaWxsQWN0aXZhdGVCeUV2ZW50KGUgPT4ge1xuXHRcdFx0aWYgKGUuZXZlbnQuc3RhcnRzV2l0aCgnb25Ob3RlYm9vazonKSkge1xuXHRcdFx0XHRpZiAodGhpcy5fZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0aW9uRXZlbnRJc0RvbmUoZS5ldmVudCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBwYXJzZSB0aGUgZXZlbnQgdG8gZ2V0IHRoZSBub3RlYm9vayB0eXBlXG5cdFx0XHRcdGNvbnN0IG5vdGVib29rVHlwZSA9IGUuZXZlbnQuc3Vic3RyaW5nKCdvbk5vdGVib29rOicubGVuZ3RoKTtcblxuXHRcdFx0XHRpZiAobm90ZWJvb2tUeXBlID09PSAnKicpIHtcblx0XHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgc2hvdWxkU3RhcnREZXRlY3Rpb24gPSBmYWxzZTtcblxuXHRcdFx0XHRjb25zdCBleHRlbnNpb25TdGF0dXMgPSB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbnNTdGF0dXMoKTtcblx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLmZvckVhY2goZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uU3RhdHVzW2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlXS5hY3RpdmF0aW9uVGltZXMpIHtcblx0XHRcdFx0XHRcdC8vIGFscmVhZHkgYWN0aXZhdGVkXG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChleHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cz8uaW5jbHVkZXMoZS5ldmVudCkpIHtcblx0XHRcdFx0XHRcdHNob3VsZFN0YXJ0RGV0ZWN0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmIChzaG91bGRTdGFydERldGVjdGlvbiAmJiAhdGhpcy5fZGV0ZWN0aW9uTWFwLmhhcyhub3RlYm9va1R5cGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbm90ZWJvb2tMb2dnaW5nU2VydmljZS5kZWJ1ZygnS2VybmVsRGV0ZWN0aW9uJywgYHN0YXJ0IGV4dGVuc2lvbiBhY3RpdmF0aW9uIGZvciAke25vdGVib29rVHlwZX1gKTtcblx0XHRcdFx0XHRjb25zdCB0YXNrID0gdGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLnJlZ2lzdGVyTm90ZWJvb2tLZXJuZWxEZXRlY3Rpb25UYXNrKHtcblx0XHRcdFx0XHRcdG5vdGVib29rVHlwZTogbm90ZWJvb2tUeXBlXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHR0aGlzLl9kZXRlY3Rpb25NYXAuc2V0KG5vdGVib29rVHlwZSwgdGFzayk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRsZXQgdGltZXI6IFRpbWVvdXQgfCBudWxsID0gbnVsbDtcblxuXHRcdHRoaXMuX2xvY2FsRGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9leHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uc1N0YXR1cygoKSA9PiB7XG5cdFx0XHRpZiAodGltZXIpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gYWN0aXZhdGlvbiBzdGF0ZSBtaWdodCBub3QgYmUgdXBkYXRlZCB5ZXQsIHBvc3Rwb25lIHRvIG5leHQgZnJhbWVcblx0XHRcdHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhc2tUb0RlbGV0ZTogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBbbm90ZWJvb2tUeXBlLCB0YXNrXSBvZiB0aGlzLl9kZXRlY3Rpb25NYXApIHtcblx0XHRcdFx0XHRpZiAodGhpcy5fZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0aW9uRXZlbnRJc0RvbmUoYG9uTm90ZWJvb2s6JHtub3RlYm9va1R5cGV9YCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX25vdGVib29rTG9nZ2luZ1NlcnZpY2UuZGVidWcoJ0tlcm5lbERldGVjdGlvbicsIGBmaW5pc2ggZXh0ZW5zaW9uIGFjdGl2YXRpb24gZm9yICR7bm90ZWJvb2tUeXBlfWApO1xuXHRcdFx0XHRcdFx0dGFza1RvRGVsZXRlLnB1c2gobm90ZWJvb2tUeXBlKTtcblx0XHRcdFx0XHRcdHRhc2suZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRhc2tUb0RlbGV0ZS5mb3JFYWNoKG5vdGVib29rVHlwZSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fZGV0ZWN0aW9uTWFwLmRlbGV0ZShub3RlYm9va1R5cGUpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2xvY2FsRGlzcG9zYWJsZVN0b3JlLmFkZCh7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aW1lcikge1xuXHRcdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oTm90ZWJvb2tLZXJuZWxEZXRlY3Rpb24sIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLGdC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
