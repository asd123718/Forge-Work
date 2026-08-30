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
import { ProxyChannel } from "../../../../../base/parts/ipc/common/ipc.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { NativeMcpDiscoveryHelperChannelName } from "../../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js";
import { IRemoteAgentService } from "../../../../services/remote/common/remoteAgentService.js";
import { IMcpRegistry } from "../mcpRegistryTypes.js";
import { NativeFilesystemMcpDiscovery } from "./nativeMcpDiscoveryAbstract.js";
let RemoteNativeMpcDiscovery = class extends NativeFilesystemMcpDiscovery {
  constructor(remoteAgent, logService, labelService, fileService, instantiationService, mcpRegistry, configurationService) {
    super(remoteAgent.getConnection()?.remoteAuthority || null, labelService, fileService, instantiationService, mcpRegistry, configurationService);
    this.remoteAgent = remoteAgent;
    this.logService = logService;
  }
  async start() {
    const connection = this.remoteAgent.getConnection();
    if (!connection) {
      return this.setDetails(void 0);
    }
    await connection.withChannel(NativeMcpDiscoveryHelperChannelName, async (channel) => {
      const service = ProxyChannel.toService(channel);
      service.load().then(
        (data) => this.setDetails(data),
        (err) => {
          this.logService.warn("Error getting remote process MCP environment", err);
          this.setDetails(void 0);
        }
      );
    });
  }
};
RemoteNativeMpcDiscovery = __decorateClass([
  __decorateParam(0, IRemoteAgentService),
  __decorateParam(1, ILogService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IMcpRegistry),
  __decorateParam(6, IConfigurationService)
], RemoteNativeMpcDiscovery);
export {
  RemoteNativeMpcDiscovery
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxkaXNjb3ZlcnlcXG5hdGl2ZU1jcFJlbW90ZURpc2NvdmVyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFByb3h5Q2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZU1jcERpc2NvdmVyeUhlbHBlclNlcnZpY2UsIE5hdGl2ZU1jcERpc2NvdmVyeUhlbHBlckNoYW5uZWxOYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9uYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXIuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNY3BSZWdpc3RyeSB9IGZyb20gJy4uL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgTmF0aXZlRmlsZXN5c3RlbU1jcERpc2NvdmVyeSB9IGZyb20gJy4vbmF0aXZlTWNwRGlzY292ZXJ5QWJzdHJhY3QuanMnO1xuXG4vKipcbiAqIERpc2NvdmVycyBNQ1Agc2VydmVycyBvbiB0aGUgcmVtb3RlIGZpbGVzeXN0ZW0sIGlmIGFueS5cbiAqL1xuZXhwb3J0IGNsYXNzIFJlbW90ZU5hdGl2ZU1wY0Rpc2NvdmVyeSBleHRlbmRzIE5hdGl2ZUZpbGVzeXN0ZW1NY3BEaXNjb3Zlcnkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50OiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWNwUmVnaXN0cnkgbWNwUmVnaXN0cnk6IElNY3BSZWdpc3RyeSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHJlbW90ZUFnZW50LmdldENvbm5lY3Rpb24oKT8ucmVtb3RlQXV0aG9yaXR5IHx8IG51bGwsIGxhYmVsU2VydmljZSwgZmlsZVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBtY3BSZWdpc3RyeSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHN0YXJ0KCkge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLnJlbW90ZUFnZW50LmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLnNldERldGFpbHModW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRhd2FpdCBjb25uZWN0aW9uLndpdGhDaGFubmVsKE5hdGl2ZU1jcERpc2NvdmVyeUhlbHBlckNoYW5uZWxOYW1lLCBhc3luYyBjaGFubmVsID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBQcm94eUNoYW5uZWwudG9TZXJ2aWNlPElOYXRpdmVNY3BEaXNjb3ZlcnlIZWxwZXJTZXJ2aWNlPihjaGFubmVsKTtcblxuXHRcdFx0c2VydmljZS5sb2FkKCkudGhlbihcblx0XHRcdFx0ZGF0YSA9PiB0aGlzLnNldERldGFpbHMoZGF0YSksXG5cdFx0XHRcdGVyciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ0Vycm9yIGdldHRpbmcgcmVtb3RlIHByb2Nlc3MgTUNQIGVudmlyb25tZW50JywgZXJyKTtcblx0XHRcdFx0XHR0aGlzLnNldERldGFpbHModW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQjtBQUM1QixTQUEyQywyQ0FBMkM7QUFDdEYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQ0FBb0M7QUFLdEMsSUFBTSwyQkFBTixjQUF1Qyw2QkFBNkI7QUFBQSxFQUMxRSxZQUN1QyxhQUNSLFlBQ2YsY0FDRCxhQUNTLHNCQUNULGFBQ1Msc0JBQ3RCO0FBQ0QsVUFBTSxZQUFZLGNBQWMsR0FBRyxtQkFBbUIsTUFBTSxjQUFjLGFBQWEsc0JBQXNCLGFBQWEsb0JBQW9CO0FBUnhHO0FBQ1I7QUFBQSxFQVEvQjtBQUFBLEVBRUEsTUFBc0IsUUFBUTtBQUM3QixVQUFNLGFBQWEsS0FBSyxZQUFZLGNBQWM7QUFDbEQsUUFBSSxDQUFDLFlBQVk7QUFDaEIsYUFBTyxLQUFLLFdBQVcsTUFBUztBQUFBLElBQ2pDO0FBRUEsVUFBTSxXQUFXLFlBQVkscUNBQXFDLE9BQU0sWUFBVztBQUNsRixZQUFNLFVBQVUsYUFBYSxVQUE0QyxPQUFPO0FBRWhGLGNBQVEsS0FBSyxFQUFFO0FBQUEsUUFDZCxVQUFRLEtBQUssV0FBVyxJQUFJO0FBQUEsUUFDNUIsU0FBTztBQUNOLGVBQUssV0FBVyxLQUFLLGdEQUFnRCxHQUFHO0FBQ3hFLGVBQUssV0FBVyxNQUFTO0FBQUEsUUFDMUI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBL0JhLDJCQUFOO0FBQUEsRUFFSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
