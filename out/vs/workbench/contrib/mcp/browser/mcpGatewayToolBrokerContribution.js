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
import { ILogService } from "../../../../platform/log/common/log.js";
import { McpGatewayToolBrokerChannelName } from "../../../../platform/mcp/common/mcpGateway.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { IMcpService } from "../common/mcpTypes.js";
import { McpGatewayToolBrokerChannel } from "../common/mcpGatewayToolBrokerChannel.js";
let McpGatewayToolBrokerContribution = class {
  constructor(remoteAgentService, mcpService, logService) {
    remoteAgentService.getConnection()?.registerChannel(McpGatewayToolBrokerChannelName, new McpGatewayToolBrokerChannel(mcpService, logService));
  }
};
McpGatewayToolBrokerContribution = __decorateClass([
  __decorateParam(0, IRemoteAgentService),
  __decorateParam(1, IMcpService),
  __decorateParam(2, ILogService)
], McpGatewayToolBrokerContribution);
export {
  McpGatewayToolBrokerContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwR2F0ZXdheVRvb2xCcm9rZXJDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBNY3BHYXRld2F5VG9vbEJyb2tlckNoYW5uZWxOYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BHYXRld2F5LmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBNY3BHYXRld2F5VG9vbEJyb2tlckNoYW5uZWwgfSBmcm9tICcuLi9jb21tb24vbWNwR2F0ZXdheVRvb2xCcm9rZXJDaGFubmVsLmpzJztcblxuZXhwb3J0IGNsYXNzIE1jcEdhdGV3YXlUb29sQnJva2VyQ29udHJpYnV0aW9uIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASU1jcFNlcnZpY2UgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRyZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpPy5yZWdpc3RlckNoYW5uZWwoTWNwR2F0ZXdheVRvb2xCcm9rZXJDaGFubmVsTmFtZSwgbmV3IE1jcEdhdGV3YXlUb29sQnJva2VyQ2hhbm5lbChtY3BTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxtQ0FBbUM7QUFFckMsSUFBTSxtQ0FBTixNQUF5RTtBQUFBLEVBQy9FLFlBQ3NCLG9CQUNSLFlBQ0EsWUFDWjtBQUNELHVCQUFtQixjQUFjLEdBQUcsZ0JBQWdCLGlDQUFpQyxJQUFJLDRCQUE0QixZQUFZLFVBQVUsQ0FBQztBQUFBLEVBQzdJO0FBQ0Q7QUFSYSxtQ0FBTjtBQUFBLEVBRUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
