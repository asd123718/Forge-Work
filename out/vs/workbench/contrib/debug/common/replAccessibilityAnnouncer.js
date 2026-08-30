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
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IDebugService } from "./debug.js";
let ReplAccessibilityAnnouncer = class extends Disposable {
  constructor(debugService, accessibilityService, logService) {
    super();
    const viewModel = debugService.getViewModel();
    const mutableDispoable = this._register(new MutableDisposable());
    this._register(viewModel.onDidFocusSession((session) => {
      mutableDispoable.clear();
      if (!session) {
        return;
      }
      mutableDispoable.value = session.onDidChangeReplElements((element) => {
        if (!element || !("originalExpression" in element)) {
          return;
        }
        const value = element.toString();
        accessibilityService.status(value);
        logService.trace("ReplAccessibilityAnnouncer#onDidChangeReplElements", element.originalExpression + ": " + value);
      });
    }));
  }
};
ReplAccessibilityAnnouncer.ID = "debug.replAccessibilityAnnouncer";
ReplAccessibilityAnnouncer = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IAccessibilityService),
  __decorateParam(2, ILogService)
], ReplAccessibilityAnnouncer);
export {
  ReplAccessibilityAnnouncer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxjb21tb25cXHJlcGxBY2Nlc3NpYmlsaXR5QW5ub3VuY2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRGVidWdTZXJ2aWNlIH0gZnJvbSAnLi9kZWJ1Zy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBSZXBsQWNjZXNzaWJpbGl0eUFubm91bmNlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIElEID0gJ2RlYnVnLnJlcGxBY2Nlc3NpYmlsaXR5QW5ub3VuY2VyJztcblx0Y29uc3RydWN0b3IoXG5cdFx0QElEZWJ1Z1NlcnZpY2UgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCk7XG5cdFx0Y29uc3QgbXV0YWJsZURpc3BvYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih2aWV3TW9kZWwub25EaWRGb2N1c1Nlc3Npb24oKHNlc3Npb24pID0+IHtcblx0XHRcdG11dGFibGVEaXNwb2FibGUuY2xlYXIoKTtcblx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRtdXRhYmxlRGlzcG9hYmxlLnZhbHVlID0gc2Vzc2lvbi5vbkRpZENoYW5nZVJlcGxFbGVtZW50cygoZWxlbWVudCkgPT4ge1xuXHRcdFx0XHRpZiAoIWVsZW1lbnQgfHwgISgnb3JpZ2luYWxFeHByZXNzaW9uJyBpbiBlbGVtZW50KSkge1xuXHRcdFx0XHRcdC8vIGVsZW1lbnQgd2FzIHJlbW92ZWQgb3IgaGFzbid0IGJlZW4gcmVzb2x2ZWQgeWV0XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gZWxlbWVudC50b1N0cmluZygpO1xuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5U2VydmljZS5zdGF0dXModmFsdWUpO1xuXHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdSZXBsQWNjZXNzaWJpbGl0eUFubm91bmNlciNvbkRpZENoYW5nZVJlcGxFbGVtZW50cycsIGVsZW1lbnQub3JpZ2luYWxFeHByZXNzaW9uICsgJzogJyArIHZhbHVlKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMscUJBQXFCO0FBRXZCLElBQU0sNkJBQU4sY0FBeUMsV0FBNkM7QUFBQSxFQUU1RixZQUNnQixjQUNRLHNCQUNWLFlBQ1o7QUFDRCxVQUFNO0FBQ04sVUFBTSxZQUFZLGFBQWEsYUFBYTtBQUM1QyxVQUFNLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQUMvRCxTQUFLLFVBQVUsVUFBVSxrQkFBa0IsQ0FBQyxZQUFZO0FBQ3ZELHVCQUFpQixNQUFNO0FBQ3ZCLFVBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxNQUNEO0FBQ0EsdUJBQWlCLFFBQVEsUUFBUSx3QkFBd0IsQ0FBQyxZQUFZO0FBQ3JFLFlBQUksQ0FBQyxXQUFXLEVBQUUsd0JBQXdCLFVBQVU7QUFFbkQ7QUFBQSxRQUNEO0FBQ0EsY0FBTSxRQUFRLFFBQVEsU0FBUztBQUMvQiw2QkFBcUIsT0FBTyxLQUFLO0FBQ2pDLG1CQUFXLE1BQU0sc0RBQXNELFFBQVEscUJBQXFCLE9BQU8sS0FBSztBQUFBLE1BQ2pILENBQUM7QUFBQSxJQUNGLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQTFCYSwyQkFDTCxLQUFLO0FBREEsNkJBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQUxVOyIsCiAgIm5hbWVzIjogW10KfQo=
