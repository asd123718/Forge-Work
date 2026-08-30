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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
let ExternalUriResolverContribution = class extends Disposable {
  constructor(_openerService, _workbenchEnvironmentService) {
    super();
    if (_workbenchEnvironmentService.options?.resolveExternalUri) {
      this._register(_openerService.registerExternalUriResolver({
        resolveExternalUri: async (resource) => {
          return {
            resolved: await _workbenchEnvironmentService.options.resolveExternalUri(resource),
            dispose: () => {
            }
          };
        }
      }));
    }
  }
};
ExternalUriResolverContribution.ID = "workbench.contrib.externalUriResolver";
ExternalUriResolverContribution = __decorateClass([
  __decorateParam(0, IOpenerService),
  __decorateParam(1, IBrowserWorkbenchEnvironmentService)
], ExternalUriResolverContribution);
export {
  ExternalUriResolverContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVybFxcYnJvd3NlclxcZXh0ZXJuYWxVcmlSZXNvbHZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRlcm5hbFVyaVJlc29sdmVyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5leHRlcm5hbFVyaVJlc29sdmVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU9wZW5lclNlcnZpY2UgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBfd29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmIChfd29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LnJlc29sdmVFeHRlcm5hbFVyaSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoX29wZW5lclNlcnZpY2UucmVnaXN0ZXJFeHRlcm5hbFVyaVJlc29sdmVyKHtcblx0XHRcdFx0cmVzb2x2ZUV4dGVybmFsVXJpOiBhc3luYyAocmVzb3VyY2UpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZWQ6IGF3YWl0IF93b3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucyEucmVzb2x2ZUV4dGVybmFsVXJpIShyZXNvdXJjZSksXG5cdFx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdC8vIFRPRE9AbWpidnogLSBkbyB3ZSBuZWVkIHRvIGRvIGFueXRoaW5nIGhlcmU/XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLDJDQUEyQztBQUU3QyxJQUFNLGtDQUFOLGNBQThDLFdBQTZDO0FBQUEsRUFJakcsWUFDaUIsZ0JBQ3FCLDhCQUNwQztBQUNELFVBQU07QUFFTixRQUFJLDZCQUE2QixTQUFTLG9CQUFvQjtBQUM3RCxXQUFLLFVBQVUsZUFBZSw0QkFBNEI7QUFBQSxRQUN6RCxvQkFBb0IsT0FBTyxhQUFhO0FBQ3ZDLGlCQUFPO0FBQUEsWUFDTixVQUFVLE1BQU0sNkJBQTZCLFFBQVMsbUJBQW9CLFFBQVE7QUFBQSxZQUNsRixTQUFTLE1BQU07QUFBQSxZQUVmO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNEO0FBQ0Q7QUF2QmEsZ0NBRUksS0FBSztBQUZULGtDQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogW10KfQo=
