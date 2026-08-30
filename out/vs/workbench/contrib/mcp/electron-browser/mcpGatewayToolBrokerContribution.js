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
import { IMainProcessService } from "../../../../platform/ipc/common/mainProcessService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { McpGatewayToolBrokerChannelName } from "../../../../platform/mcp/common/mcpGateway.js";
import { IMcpService } from "../common/mcpTypes.js";
import { McpGatewayToolBrokerChannel } from "../common/mcpGatewayToolBrokerChannel.js";
let McpGatewayToolBrokerContribution = class {
  constructor(mainProcessService, mcpService, logService) {
    mainProcessService.registerChannel(McpGatewayToolBrokerChannelName, new McpGatewayToolBrokerChannel(mcpService, logService));
  }
};
McpGatewayToolBrokerContribution = __decorateClass([
  __decorateParam(0, IMainProcessService),
  __decorateParam(1, IMcpService),
  __decorateParam(2, ILogService)
], McpGatewayToolBrokerContribution);
export {
  McpGatewayToolBrokerContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcZWxlY3Ryb24tYnJvd3NlclxcbWNwR2F0ZXdheVRvb2xCcm9rZXJDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSU1haW5Qcm9jZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2lwYy9jb21tb24vbWFpblByb2Nlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTWNwR2F0ZXdheVRvb2xCcm9rZXJDaGFubmVsTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwR2F0ZXdheS5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBNY3BHYXRld2F5VG9vbEJyb2tlckNoYW5uZWwgfSBmcm9tICcuLi9jb21tb24vbWNwR2F0ZXdheVRvb2xCcm9rZXJDaGFubmVsLmpzJztcblxuZXhwb3J0IGNsYXNzIE1jcEdhdGV3YXlUb29sQnJva2VyQ29udHJpYnV0aW9uIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWFpblByb2Nlc3NTZXJ2aWNlIG1haW5Qcm9jZXNzU2VydmljZTogSU1haW5Qcm9jZXNzU2VydmljZSxcblx0XHRASU1jcFNlcnZpY2UgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRtYWluUHJvY2Vzc1NlcnZpY2UucmVnaXN0ZXJDaGFubmVsKE1jcEdhdGV3YXlUb29sQnJva2VyQ2hhbm5lbE5hbWUsIG5ldyBNY3BHYXRld2F5VG9vbEJyb2tlckNoYW5uZWwobWNwU2VydmljZSwgbG9nU2VydmljZSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsbUNBQW1DO0FBRXJDLElBQU0sbUNBQU4sTUFBeUU7QUFBQSxFQUMvRSxZQUNzQixvQkFDUixZQUNBLFlBQ1o7QUFDRCx1QkFBbUIsZ0JBQWdCLGlDQUFpQyxJQUFJLDRCQUE0QixZQUFZLFVBQVUsQ0FBQztBQUFBLEVBQzVIO0FBQ0Q7QUFSYSxtQ0FBTjtBQUFBLEVBRUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
