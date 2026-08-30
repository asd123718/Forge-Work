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
import { IDebugService, State } from "../common/debug.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { ITitleService } from "../../../services/title/browser/titleService.js";
let DebugTitleContribution = class {
  constructor(debugService, hostService, titleService) {
    this.toDispose = [];
    const updateTitle = () => {
      if (debugService.state === State.Stopped && !hostService.hasFocus) {
        titleService.updateProperties({ prefix: "\u{1F534}" });
      } else {
        titleService.updateProperties({ prefix: "" });
      }
    };
    this.toDispose.push(debugService.onDidChangeState(updateTitle));
    this.toDispose.push(hostService.onDidChangeFocus(updateTitle));
  }
  dispose() {
    dispose(this.toDispose);
  }
};
DebugTitleContribution = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IHostService),
  __decorateParam(2, ITitleService)
], DebugTitleContribution);
export {
  DebugTitleContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z1RpdGxlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElEZWJ1Z1NlcnZpY2UsIFN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IGRpc3Bvc2UsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElUaXRsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90aXRsZS9icm93c2VyL3RpdGxlU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1RpdGxlQ29udHJpYnV0aW9uIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSB0b0Rpc3Bvc2U6IElEaXNwb3NhYmxlW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURlYnVnU2VydmljZSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJVGl0bGVTZXJ2aWNlIHRpdGxlU2VydmljZTogSVRpdGxlU2VydmljZVxuXHQpIHtcblx0XHRjb25zdCB1cGRhdGVUaXRsZSA9ICgpID0+IHtcblx0XHRcdGlmIChkZWJ1Z1NlcnZpY2Uuc3RhdGUgPT09IFN0YXRlLlN0b3BwZWQgJiYgIWhvc3RTZXJ2aWNlLmhhc0ZvY3VzKSB7XG5cdFx0XHRcdHRpdGxlU2VydmljZS51cGRhdGVQcm9wZXJ0aWVzKHsgcHJlZml4OiAnXHVEODNEXHVERDM0JyB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRpdGxlU2VydmljZS51cGRhdGVQcm9wZXJ0aWVzKHsgcHJlZml4OiAnJyB9KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2goZGVidWdTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdGUodXBkYXRlVGl0bGUpKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKGhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXModXBkYXRlVGl0bGUpKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLnRvRGlzcG9zZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxlQUFlLGFBQWE7QUFDckMsU0FBUyxlQUE0QjtBQUNyQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFCQUFxQjtBQUV2QixJQUFNLHlCQUFOLE1BQStEO0FBQUEsRUFJckUsWUFDZ0IsY0FDRCxhQUNDLGNBQ2Q7QUFORixTQUFRLFlBQTJCLENBQUM7QUFPbkMsVUFBTSxjQUFjLE1BQU07QUFDekIsVUFBSSxhQUFhLFVBQVUsTUFBTSxXQUFXLENBQUMsWUFBWSxVQUFVO0FBQ2xFLHFCQUFhLGlCQUFpQixFQUFFLFFBQVEsWUFBSyxDQUFDO0FBQUEsTUFDL0MsT0FBTztBQUNOLHFCQUFhLGlCQUFpQixFQUFFLFFBQVEsR0FBRyxDQUFDO0FBQUEsTUFDN0M7QUFBQSxJQUNEO0FBQ0EsU0FBSyxVQUFVLEtBQUssYUFBYSxpQkFBaUIsV0FBVyxDQUFDO0FBQzlELFNBQUssVUFBVSxLQUFLLFlBQVksaUJBQWlCLFdBQVcsQ0FBQztBQUFBLEVBQzlEO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFlBQVEsS0FBSyxTQUFTO0FBQUEsRUFDdkI7QUFDRDtBQXZCYSx5QkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
