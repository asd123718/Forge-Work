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
import { ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IMainProcessService } from "../../../../platform/ipc/common/mainProcessService.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { NativeMcpDiscoveryHelperChannelName } from "../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js";
import { NativeFilesystemMcpDiscovery } from "../common/discovery/nativeMcpDiscoveryAbstract.js";
import { IMcpRegistry } from "../common/mcpRegistryTypes.js";
let NativeMcpDiscovery = class extends NativeFilesystemMcpDiscovery {
  constructor(mainProcess, logService, labelService, fileService, instantiationService, mcpRegistry, configurationService) {
    super(null, labelService, fileService, instantiationService, mcpRegistry, configurationService);
    this.mainProcess = mainProcess;
    this.logService = logService;
  }
  start() {
    const service = ProxyChannel.toService(
      this.mainProcess.getChannel(NativeMcpDiscoveryHelperChannelName)
    );
    service.load().then(
      (data) => this.setDetails(data),
      (err) => {
        this.logService.warn("Error getting main process MCP environment", err);
        this.setDetails(void 0);
      }
    );
  }
};
NativeMcpDiscovery = __decorateClass([
  __decorateParam(0, IMainProcessService),
  __decorateParam(1, ILogService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IMcpRegistry),
  __decorateParam(6, IConfigurationService)
], NativeMcpDiscovery);
export {
  NativeMcpDiscovery
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcZWxlY3Ryb24tYnJvd3NlclxcbmF0aXZlTXBjRGlzY292ZXJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUHJveHlDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElNYWluUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pcGMvY29tbW9uL21haW5Qcm9jZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZU1jcERpc2NvdmVyeUhlbHBlclNlcnZpY2UsIE5hdGl2ZU1jcERpc2NvdmVyeUhlbHBlckNoYW5uZWxOYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9uYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXIuanMnO1xuaW1wb3J0IHsgTmF0aXZlRmlsZXN5c3RlbU1jcERpc2NvdmVyeSB9IGZyb20gJy4uL2NvbW1vbi9kaXNjb3ZlcnkvbmF0aXZlTWNwRGlzY292ZXJ5QWJzdHJhY3QuanMnO1xuaW1wb3J0IHsgSU1jcFJlZ2lzdHJ5IH0gZnJvbSAnLi4vY29tbW9uL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgTmF0aXZlTWNwRGlzY292ZXJ5IGV4dGVuZHMgTmF0aXZlRmlsZXN5c3RlbU1jcERpc2NvdmVyeSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWFpblByb2Nlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFpblByb2Nlc3M6IElNYWluUHJvY2Vzc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNY3BSZWdpc3RyeSBtY3BSZWdpc3RyeTogSU1jcFJlZ2lzdHJ5LFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgbGFiZWxTZXJ2aWNlLCBmaWxlU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG1jcFJlZ2lzdHJ5LCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgc3RhcnQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IFByb3h5Q2hhbm5lbC50b1NlcnZpY2U8SU5hdGl2ZU1jcERpc2NvdmVyeUhlbHBlclNlcnZpY2U+KFxuXHRcdFx0dGhpcy5tYWluUHJvY2Vzcy5nZXRDaGFubmVsKE5hdGl2ZU1jcERpc2NvdmVyeUhlbHBlckNoYW5uZWxOYW1lKSk7XG5cblx0XHRzZXJ2aWNlLmxvYWQoKS50aGVuKFxuXHRcdFx0ZGF0YSA9PiB0aGlzLnNldERldGFpbHMoZGF0YSksXG5cdFx0XHRlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignRXJyb3IgZ2V0dGluZyBtYWluIHByb2Nlc3MgTUNQIGVudmlyb25tZW50JywgZXJyKTtcblx0XHRcdFx0dGhpcy5zZXREZXRhaWxzKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQjtBQUM1QixTQUEyQywyQ0FBMkM7QUFDdEYsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxvQkFBb0I7QUFFdEIsSUFBTSxxQkFBTixjQUFpQyw2QkFBNkI7QUFBQSxFQUNwRSxZQUN1QyxhQUNSLFlBQ2YsY0FDRCxhQUNTLHNCQUNULGFBQ1Msc0JBQ3RCO0FBQ0QsVUFBTSxNQUFNLGNBQWMsYUFBYSxzQkFBc0IsYUFBYSxvQkFBb0I7QUFSeEQ7QUFDUjtBQUFBLEVBUS9CO0FBQUEsRUFFZ0IsUUFBYztBQUM3QixVQUFNLFVBQVUsYUFBYTtBQUFBLE1BQzVCLEtBQUssWUFBWSxXQUFXLG1DQUFtQztBQUFBLElBQUM7QUFFakUsWUFBUSxLQUFLLEVBQUU7QUFBQSxNQUNkLFVBQVEsS0FBSyxXQUFXLElBQUk7QUFBQSxNQUM1QixTQUFPO0FBQ04sYUFBSyxXQUFXLEtBQUssOENBQThDLEdBQUc7QUFDdEUsYUFBSyxXQUFXLE1BQVM7QUFBQSxNQUMxQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUF6QmEscUJBQU47QUFBQSxFQUVKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FSVTsiLAogICJuYW1lcyI6IFtdCn0K
