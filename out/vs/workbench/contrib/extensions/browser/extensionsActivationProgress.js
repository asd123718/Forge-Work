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
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { localize } from "../../../../nls.js";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
let ExtensionActivationProgress = class {
  constructor(extensionService, progressService, logService) {
    const options = {
      location: ProgressLocation.Window,
      title: localize("activation", "Activating Extensions...")
    };
    let deferred;
    let count = 0;
    this._listener = extensionService.onWillActivateByEvent((e) => {
      logService.trace("onWillActivateByEvent: ", e.event);
      if (!deferred) {
        deferred = new DeferredPromise();
        progressService.withProgress(options, (_) => deferred.p);
      }
      count++;
      Promise.race([e.activation, timeout(5e3, CancellationToken.None)]).finally(() => {
        if (--count === 0) {
          deferred.complete(void 0);
          deferred = void 0;
        }
      });
    });
  }
  dispose() {
    this._listener.dispose();
  }
};
ExtensionActivationProgress = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IProgressService),
  __decorateParam(2, ILogService)
], ExtensionActivationProgress);
export {
  ExtensionActivationProgress
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGV4dGVuc2lvbnNBY3RpdmF0aW9uUHJvZ3Jlc3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25BY3RpdmF0aW9uUHJvZ3Jlc3MgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9saXN0ZW5lcjogSURpc3Bvc2FibGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHtcblx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWN0aXZhdGlvbicsIFwiQWN0aXZhdGluZyBFeHRlbnNpb25zLi4uXCIpXG5cdFx0fTtcblxuXHRcdGxldCBkZWZlcnJlZDogRGVmZXJyZWRQcm9taXNlPGFueT4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNvdW50ID0gMDtcblxuXHRcdHRoaXMuX2xpc3RlbmVyID0gZXh0ZW5zaW9uU2VydmljZS5vbldpbGxBY3RpdmF0ZUJ5RXZlbnQoZSA9PiB7XG5cdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdvbldpbGxBY3RpdmF0ZUJ5RXZlbnQ6ICcsIGUuZXZlbnQpO1xuXG5cdFx0XHRpZiAoIWRlZmVycmVkKSB7XG5cdFx0XHRcdGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuXHRcdFx0XHRwcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKG9wdGlvbnMsIF8gPT4gZGVmZXJyZWQhLnApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb3VudCsrO1xuXG5cdFx0XHRQcm9taXNlLnJhY2UoW2UuYWN0aXZhdGlvbiwgdGltZW91dCg1MDAwLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKV0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRpZiAoLS1jb3VudCA9PT0gMCkge1xuXHRcdFx0XHRcdGRlZmVycmVkIS5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGRlZmVycmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlzdGVuZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlCO0FBRTNCLElBQU0sOEJBQU4sTUFBb0U7QUFBQSxFQUkxRSxZQUNvQixrQkFDRCxpQkFDTCxZQUNaO0FBRUQsVUFBTSxVQUFVO0FBQUEsTUFDZixVQUFVLGlCQUFpQjtBQUFBLE1BQzNCLE9BQU8sU0FBUyxjQUFjLDBCQUEwQjtBQUFBLElBQ3pEO0FBRUEsUUFBSTtBQUNKLFFBQUksUUFBUTtBQUVaLFNBQUssWUFBWSxpQkFBaUIsc0JBQXNCLE9BQUs7QUFDNUQsaUJBQVcsTUFBTSwyQkFBMkIsRUFBRSxLQUFLO0FBRW5ELFVBQUksQ0FBQyxVQUFVO0FBQ2QsbUJBQVcsSUFBSSxnQkFBZ0I7QUFDL0Isd0JBQWdCLGFBQWEsU0FBUyxPQUFLLFNBQVUsQ0FBQztBQUFBLE1BQ3ZEO0FBRUE7QUFFQSxjQUFRLEtBQUssQ0FBQyxFQUFFLFlBQVksUUFBUSxLQUFNLGtCQUFrQixJQUFJLENBQUMsQ0FBQyxFQUFFLFFBQVEsTUFBTTtBQUNqRixZQUFJLEVBQUUsVUFBVSxHQUFHO0FBQ2xCLG1CQUFVLFNBQVMsTUFBUztBQUM1QixxQkFBVztBQUFBLFFBQ1o7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssVUFBVSxRQUFRO0FBQUEsRUFDeEI7QUFDRDtBQXhDYSw4QkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
