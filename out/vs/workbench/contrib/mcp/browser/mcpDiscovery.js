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
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { mcpAccessConfig, McpAccessValue } from "../../../../platform/mcp/common/mcpManagement.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { mcpDiscoveryRegistry } from "../common/discovery/mcpDiscovery.js";
let McpDiscovery = class extends Disposable {
  constructor(instantiationService, configurationService) {
    super();
    const mcpAccessValue = observableConfigValue(mcpAccessConfig, McpAccessValue.All, configurationService);
    const store = this._register(new DisposableStore());
    this._register(autorun((reader) => {
      store.clear();
      const value = mcpAccessValue.read(reader);
      if (value === McpAccessValue.None) {
        return;
      }
      for (const descriptor of mcpDiscoveryRegistry.getAll()) {
        const mcpDiscovery = instantiationService.createInstance(descriptor);
        if (value === McpAccessValue.Registry && !mcpDiscovery.fromGallery) {
          mcpDiscovery.dispose();
          continue;
        }
        store.add(mcpDiscovery);
        mcpDiscovery.start();
      }
    }));
  }
};
McpDiscovery.ID = "workbench.contrib.mcp.discovery";
McpDiscovery = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IConfigurationService)
], McpDiscovery);
export {
  McpDiscovery
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwRGlzY292ZXJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBtY3BBY2Nlc3NDb25maWcsIE1jcEFjY2Vzc1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBtY3BEaXNjb3ZlcnlSZWdpc3RyeSB9IGZyb20gJy4uL2NvbW1vbi9kaXNjb3ZlcnkvbWNwRGlzY292ZXJ5LmpzJztcblxuZXhwb3J0IGNsYXNzIE1jcERpc2NvdmVyeSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5tY3AuZGlzY292ZXJ5JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgbWNwQWNjZXNzVmFsdWUgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWUobWNwQWNjZXNzQ29uZmlnLCBNY3BBY2Nlc3NWYWx1ZS5BbGwsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBzdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRzdG9yZS5jbGVhcigpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBtY3BBY2Nlc3NWYWx1ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodmFsdWUgPT09IE1jcEFjY2Vzc1ZhbHVlLk5vbmUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBkZXNjcmlwdG9yIG9mIG1jcERpc2NvdmVyeVJlZ2lzdHJ5LmdldEFsbCgpKSB7XG5cdFx0XHRcdGNvbnN0IG1jcERpc2NvdmVyeSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGRlc2NyaXB0b3IpO1xuXHRcdFx0XHRpZiAodmFsdWUgPT09IE1jcEFjY2Vzc1ZhbHVlLlJlZ2lzdHJ5ICYmICFtY3BEaXNjb3ZlcnkuZnJvbUdhbGxlcnkpIHtcblx0XHRcdFx0XHRtY3BEaXNjb3ZlcnkuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0b3JlLmFkZChtY3BEaXNjb3ZlcnkpO1xuXHRcdFx0XHRtY3BEaXNjb3Zlcnkuc3RhcnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUIsc0JBQXNCO0FBQ2hELFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsNEJBQTRCO0FBRTlCLElBQU0sZUFBTixjQUEyQixXQUE2QztBQUFBLEVBRzlFLFlBQ3dCLHNCQUNBLHNCQUN0QjtBQUNELFVBQU07QUFFTixVQUFNLGlCQUFpQixzQkFBc0IsaUJBQWlCLGVBQWUsS0FBSyxvQkFBb0I7QUFDdEcsVUFBTSxRQUFRLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBRWxELFNBQUssVUFBVSxRQUFRLFlBQVU7QUFDaEMsWUFBTSxNQUFNO0FBQ1osWUFBTSxRQUFRLGVBQWUsS0FBSyxNQUFNO0FBQ3hDLFVBQUksVUFBVSxlQUFlLE1BQU07QUFDbEM7QUFBQSxNQUNEO0FBQ0EsaUJBQVcsY0FBYyxxQkFBcUIsT0FBTyxHQUFHO0FBQ3ZELGNBQU0sZUFBZSxxQkFBcUIsZUFBZSxVQUFVO0FBQ25FLFlBQUksVUFBVSxlQUFlLFlBQVksQ0FBQyxhQUFhLGFBQWE7QUFDbkUsdUJBQWEsUUFBUTtBQUNyQjtBQUFBLFFBQ0Q7QUFDQSxjQUFNLElBQUksWUFBWTtBQUN0QixxQkFBYSxNQUFNO0FBQUEsTUFDcEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQTdCYSxhQUNXLEtBQUs7QUFEaEIsZUFBTjtBQUFBLEVBSUo7QUFBQSxFQUNBO0FBQUEsR0FMVTsiLAogICJuYW1lcyI6IFtdCn0K
