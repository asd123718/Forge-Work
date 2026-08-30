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
import { Event } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { McpGatewayChannelName } from "../../../../platform/mcp/common/mcpGateway.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
let BrowserMcpGatewayService = class {
  constructor(_remoteAgentService, _logService) {
    this._remoteAgentService = _remoteAgentService;
    this._logService = _logService;
  }
  async createGateway(inRemote, chatSessionResource) {
    this._logService.debug(`[McpGateway][BrowserWorkbench] createGateway requested (inRemote=${inRemote})`);
    if (!inRemote) {
      this._logService.info("[McpGateway][BrowserWorkbench] Cannot create local gateway in browser environment");
      return void 0;
    }
    const connection = this._remoteAgentService.getConnection();
    if (!connection) {
      this._logService.info("[McpGateway][BrowserWorkbench] No remote connection available (serverless web)");
      return void 0;
    }
    this._logService.info("[McpGateway][BrowserWorkbench] Creating remote gateway via remote server");
    return connection.withChannel(McpGatewayChannelName, async (channel) => {
      const info = await channel.call(
        "createGateway",
        chatSessionResource ? { chatSessionResource: chatSessionResource.toString() } : void 0
      );
      const servers = reviveServers(info.servers);
      this._logService.info(`[McpGateway][BrowserWorkbench] Remote gateway created with ${servers.length} server(s)`);
      const onDidChangeServers = Event.map(
        Event.filter(
          channel.listen("onDidChangeGatewayServers"),
          (e) => e.gatewayId === info.gatewayId
        ),
        (e) => reviveServers(e.servers)
      );
      return {
        servers,
        onDidChangeServers,
        dispose: () => {
          this._logService.info(`[McpGateway][BrowserWorkbench] Disposing remote gateway: ${info.gatewayId}`);
          void channel.call("disposeGateway", info.gatewayId).then(void 0, (error) => {
            this._logService.warn(`[McpGateway][BrowserWorkbench] Failed to dispose remote gateway: ${info.gatewayId}`, error);
          });
        }
      };
    });
  }
};
BrowserMcpGatewayService = __decorateClass([
  __decorateParam(0, IRemoteAgentService),
  __decorateParam(1, ILogService)
], BrowserMcpGatewayService);
function reviveServers(servers) {
  return servers.map((s) => ({ label: s.label, address: URI.revive(s.address) }));
}
export {
  BrowserMcpGatewayService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwR2F0ZXdheVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElNY3BHYXRld2F5U2VydmVySW5mbywgTWNwR2F0ZXdheUNoYW5uZWxOYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BHYXRld2F5LmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWNwR2F0ZXdheVJlc3VsdCwgSU1jcEdhdGV3YXlSZXN1bHRTZXJ2ZXIsIElXb3JrYmVuY2hNY3BHYXRld2F5U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9tY3BHYXRld2F5U2VydmljZS5qcyc7XG5cbi8qKlxuICogQnJvd3NlciBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgTUNQIEdhdGV3YXkgU2VydmljZS5cbiAqXG4gKiBJbiBicm93c2VyL3NlcnZlcmxlc3Mgd2ViIGVudmlyb25tZW50cyB3aXRob3V0IGEgcmVtb3RlIGNvbm5lY3Rpb24sXG4gKiB0aGVyZSBpcyBubyBOb2RlLmpzIHByb2Nlc3MgYXZhaWxhYmxlIHRvIGNyZWF0ZSBhbiBIVFRQIHNlcnZlci5cbiAqXG4gKiBXaGVuIHJ1bm5pbmcgd2l0aCBhIHJlbW90ZSBjb25uZWN0aW9uLCB0aGUgZ2F0ZXdheSBpcyBjcmVhdGVkIG9uIHRoZVxuICogcmVtb3RlIHNlcnZlciB2aWEgSVBDLlxuICovXG5leHBvcnQgY2xhc3MgQnJvd3Nlck1jcEdhdGV3YXlTZXJ2aWNlIGltcGxlbWVudHMgSVdvcmtiZW5jaE1jcEdhdGV3YXlTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBjcmVhdGVHYXRld2F5KGluUmVtb3RlOiBib29sZWFuLCBjaGF0U2Vzc2lvblJlc291cmNlPzogVVJJKTogUHJvbWlzZTxJTWNwR2F0ZXdheVJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtNY3BHYXRld2F5XVtCcm93c2VyV29ya2JlbmNoXSBjcmVhdGVHYXRld2F5IHJlcXVlc3RlZCAoaW5SZW1vdGU9JHtpblJlbW90ZX0pYCk7XG5cblx0XHQvLyBCcm93c2VyIGNhbiBvbmx5IGNyZWF0ZSBnYXRld2F5cyBpbiByZW1vdGUgZW52aXJvbm1lbnRcblx0XHRpZiAoIWluUmVtb3RlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tNY3BHYXRld2F5XVtCcm93c2VyV29ya2JlbmNoXSBDYW5ub3QgY3JlYXRlIGxvY2FsIGdhdGV3YXkgaW4gYnJvd3NlciBlbnZpcm9ubWVudCcpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnW01jcEdhdGV3YXldW0Jyb3dzZXJXb3JrYmVuY2hdIE5vIHJlbW90ZSBjb25uZWN0aW9uIGF2YWlsYWJsZSAoc2VydmVybGVzcyB3ZWIpJyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnW01jcEdhdGV3YXldW0Jyb3dzZXJXb3JrYmVuY2hdIENyZWF0aW5nIHJlbW90ZSBnYXRld2F5IHZpYSByZW1vdGUgc2VydmVyJyk7XG5cdFx0Ly8gVXNlIHRoZSByZW1vdGUgc2VydmVyJ3MgZ2F0ZXdheSBzZXJ2aWNlXG5cdFx0cmV0dXJuIGNvbm5lY3Rpb24ud2l0aENoYW5uZWwoTWNwR2F0ZXdheUNoYW5uZWxOYW1lLCBhc3luYyBjaGFubmVsID0+IHtcblx0XHRcdGNvbnN0IGluZm8gPSBhd2FpdCBjaGFubmVsLmNhbGw8eyBnYXRld2F5SWQ6IHN0cmluZzsgc2VydmVyczogcmVhZG9ubHkgSU1jcEdhdGV3YXlTZXJ2ZXJJbmZvW10gfT4oXG5cdFx0XHRcdCdjcmVhdGVHYXRld2F5Jyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZSA/IHsgY2hhdFNlc3Npb25SZXNvdXJjZTogY2hhdFNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpIH0gOiB1bmRlZmluZWRcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBzZXJ2ZXJzID0gcmV2aXZlU2VydmVycyhpbmZvLnNlcnZlcnMpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbTWNwR2F0ZXdheV1bQnJvd3NlcldvcmtiZW5jaF0gUmVtb3RlIGdhdGV3YXkgY3JlYXRlZCB3aXRoICR7c2VydmVycy5sZW5ndGh9IHNlcnZlcihzKWApO1xuXG5cdFx0XHRjb25zdCBvbkRpZENoYW5nZVNlcnZlcnMgPSBFdmVudC5tYXAoXG5cdFx0XHRcdEV2ZW50LmZpbHRlcihcblx0XHRcdFx0XHRjaGFubmVsLmxpc3Rlbjx7IGdhdGV3YXlJZDogc3RyaW5nOyBzZXJ2ZXJzOiByZWFkb25seSBJTWNwR2F0ZXdheVNlcnZlckluZm9bXSB9Pignb25EaWRDaGFuZ2VHYXRld2F5U2VydmVycycpLFxuXHRcdFx0XHRcdGUgPT4gZS5nYXRld2F5SWQgPT09IGluZm8uZ2F0ZXdheUlkLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRlID0+IHJldml2ZVNlcnZlcnMoZS5zZXJ2ZXJzKSxcblx0XHRcdCk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHNlcnZlcnMsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlU2VydmVycyxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW01jcEdhdGV3YXldW0Jyb3dzZXJXb3JrYmVuY2hdIERpc3Bvc2luZyByZW1vdGUgZ2F0ZXdheTogJHtpbmZvLmdhdGV3YXlJZH1gKTtcblx0XHRcdFx0XHR2b2lkIGNoYW5uZWwuY2FsbCgnZGlzcG9zZUdhdGV3YXknLCBpbmZvLmdhdGV3YXlJZCkudGhlbih1bmRlZmluZWQsIGVycm9yID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW01jcEdhdGV3YXldW0Jyb3dzZXJXb3JrYmVuY2hdIEZhaWxlZCB0byBkaXNwb3NlIHJlbW90ZSBnYXRld2F5OiAke2luZm8uZ2F0ZXdheUlkfWAsIGVycm9yKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiByZXZpdmVTZXJ2ZXJzKHNlcnZlcnM6IHJlYWRvbmx5IElNY3BHYXRld2F5U2VydmVySW5mb1tdKTogSU1jcEdhdGV3YXlSZXN1bHRTZXJ2ZXJbXSB7XG5cdHJldHVybiBzZXJ2ZXJzLm1hcChzID0+ICh7IGxhYmVsOiBzLmxhYmVsLCBhZGRyZXNzOiBVUkkucmV2aXZlKHMuYWRkcmVzcykgfSkpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQWdDLDZCQUE2QjtBQUM3RCxTQUFTLDJCQUEyQjtBQVk3QixJQUFNLDJCQUFOLE1BQXNFO0FBQUEsRUFHNUUsWUFDdUMscUJBQ1IsYUFDN0I7QUFGcUM7QUFDUjtBQUFBLEVBQzNCO0FBQUEsRUFFSixNQUFNLGNBQWMsVUFBbUIscUJBQW1FO0FBQ3pHLFNBQUssWUFBWSxNQUFNLG9FQUFvRSxRQUFRLEdBQUc7QUFHdEcsUUFBSSxDQUFDLFVBQVU7QUFDZCxXQUFLLFlBQVksS0FBSyxtRkFBbUY7QUFDekcsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGFBQWEsS0FBSyxvQkFBb0IsY0FBYztBQUMxRCxRQUFJLENBQUMsWUFBWTtBQUNoQixXQUFLLFlBQVksS0FBSyxnRkFBZ0Y7QUFDdEcsYUFBTztBQUFBLElBQ1I7QUFFQSxTQUFLLFlBQVksS0FBSywwRUFBMEU7QUFFaEcsV0FBTyxXQUFXLFlBQVksdUJBQXVCLE9BQU0sWUFBVztBQUNyRSxZQUFNLE9BQU8sTUFBTSxRQUFRO0FBQUEsUUFDMUI7QUFBQSxRQUNBLHNCQUFzQixFQUFFLHFCQUFxQixvQkFBb0IsU0FBUyxFQUFFLElBQUk7QUFBQSxNQUNqRjtBQUNBLFlBQU0sVUFBVSxjQUFjLEtBQUssT0FBTztBQUMxQyxXQUFLLFlBQVksS0FBSyw4REFBOEQsUUFBUSxNQUFNLFlBQVk7QUFFOUcsWUFBTSxxQkFBcUIsTUFBTTtBQUFBLFFBQ2hDLE1BQU07QUFBQSxVQUNMLFFBQVEsT0FBeUUsMkJBQTJCO0FBQUEsVUFDNUcsT0FBSyxFQUFFLGNBQWMsS0FBSztBQUFBLFFBQzNCO0FBQUEsUUFDQSxPQUFLLGNBQWMsRUFBRSxPQUFPO0FBQUEsTUFDN0I7QUFFQSxhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0E7QUFBQSxRQUNBLFNBQVMsTUFBTTtBQUNkLGVBQUssWUFBWSxLQUFLLDREQUE0RCxLQUFLLFNBQVMsRUFBRTtBQUNsRyxlQUFLLFFBQVEsS0FBSyxrQkFBa0IsS0FBSyxTQUFTLEVBQUUsS0FBSyxRQUFXLFdBQVM7QUFDNUUsaUJBQUssWUFBWSxLQUFLLG9FQUFvRSxLQUFLLFNBQVMsSUFBSSxLQUFLO0FBQUEsVUFDbEgsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBckRhLDJCQUFOO0FBQUEsRUFJSjtBQUFBLEVBQ0E7QUFBQSxHQUxVO0FBdURiLFNBQVMsY0FBYyxTQUFzRTtBQUM1RixTQUFPLFFBQVEsSUFBSSxRQUFNLEVBQUUsT0FBTyxFQUFFLE9BQU8sU0FBUyxJQUFJLE9BQU8sRUFBRSxPQUFPLEVBQUUsRUFBRTtBQUM3RTsiLAogICJuYW1lcyI6IFtdCn0K
