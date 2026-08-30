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
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { localize } from "../../../../../../../nls.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IAgentHostCustomizationService } from "../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { IChatToolInvocation } from "../../../../common/chatService/chatService.js";
import { IChatWidgetService } from "../../../chat.js";
import { ChatCustomConfirmationWidget } from "../chatConfirmationWidget.js";
import { BaseChatToolInvocationSubPart } from "./chatToolInvocationSubPart.js";
let ChatToolAuthenticationSubPart = class extends BaseChatToolInvocationSubPart {
  constructor(toolInvocation, context, instantiationService, customizationService, chatWidgetService) {
    super(toolInvocation);
    this.codeblocks = [];
    const state = toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
      throw new Error("Tool authentication state is missing");
    }
    const widget = this._register(instantiationService.createInstance(
      ChatCustomConfirmationWidget,
      context,
      {
        title: localize("chat.toolAuthentication.title", "MCP authentication required"),
        icon: Codicon.mcp,
        subtitle: state.server.name,
        buttons: [
          {
            label: localize("chat.toolAuthentication.authenticate", "Authenticate"),
            data: async () => {
              await customizationService.authenticateMcpServer(context.element.sessionResource, state.server.id);
            }
          },
          {
            label: localize("chat.toolAuthentication.cancel", "Cancel"),
            data: async () => {
              state.cancel();
            },
            isSecondary: true
          }
        ],
        message: localize("chat.toolAuthentication.message", "The MCP server {0} requires authentication to continue this tool call.", state.server.name),
        toolbarData: {
          arg: toolInvocation,
          partType: "chatToolAuthentication",
          partSource: toolInvocation.source.type
        }
      }
    ));
    this._register(widget.onDidClick(async ({ button, isTouchClick }) => {
      await button.data();
      if (!isTouchClick) {
        chatWidgetService.getWidgetBySessionResource(context.element.sessionResource)?.focusInput();
      }
    }));
    this.domNode = widget.domNode;
  }
};
ChatToolAuthenticationSubPart = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IAgentHostCustomizationService),
  __decorateParam(4, IChatWidgetService)
], ChatToolAuthenticationSubPart);
export {
  ChatToolAuthenticationSubPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcY2hhdFRvb2xBdXRoZW50aWNhdGlvblN1YlBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0VG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0Q3VzdG9tQ29uZmlybWF0aW9uV2lkZ2V0IH0gZnJvbSAnLi4vY2hhdENvbmZpcm1hdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4uL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgQmFzZUNoYXRUb29sSW52b2NhdGlvblN1YlBhcnQgfSBmcm9tICcuL2NoYXRUb29sSW52b2NhdGlvblN1YlBhcnQuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdFRvb2xBdXRoZW50aWNhdGlvblN1YlBhcnQgZXh0ZW5kcyBCYXNlQ2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydCB7XG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjb2RlYmxvY2tzID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24sXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgY3VzdG9taXphdGlvblNlcnZpY2U6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHRvb2xJbnZvY2F0aW9uKTtcblx0XHRjb25zdCBzdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQXV0aGVudGljYXRpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVG9vbCBhdXRoZW50aWNhdGlvbiBzdGF0ZSBpcyBtaXNzaW5nJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0Q3VzdG9tQ29uZmlybWF0aW9uV2lkZ2V0PCgpID0+IFByb21pc2U8dm9pZD4+LFxuXHRcdFx0Y29udGV4dCxcblx0XHRcdHtcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0LnRvb2xBdXRoZW50aWNhdGlvbi50aXRsZScsIFwiTUNQIGF1dGhlbnRpY2F0aW9uIHJlcXVpcmVkXCIpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLm1jcCxcblx0XHRcdFx0c3VidGl0bGU6IHN0YXRlLnNlcnZlci5uYW1lLFxuXHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0LnRvb2xBdXRoZW50aWNhdGlvbi5hdXRoZW50aWNhdGUnLCBcIkF1dGhlbnRpY2F0ZVwiKSxcblx0XHRcdFx0XHRcdGRhdGE6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgY3VzdG9taXphdGlvblNlcnZpY2UuYXV0aGVudGljYXRlTWNwU2VydmVyKGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsIHN0YXRlLnNlcnZlci5pZCk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0LnRvb2xBdXRoZW50aWNhdGlvbi5jYW5jZWwnLCBcIkNhbmNlbFwiKSxcblx0XHRcdFx0XHRcdGRhdGE6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0c3RhdGUuY2FuY2VsKCk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0aXNTZWNvbmRhcnk6IHRydWUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NoYXQudG9vbEF1dGhlbnRpY2F0aW9uLm1lc3NhZ2UnLCBcIlRoZSBNQ1Agc2VydmVyIHswfSByZXF1aXJlcyBhdXRoZW50aWNhdGlvbiB0byBjb250aW51ZSB0aGlzIHRvb2wgY2FsbC5cIiwgc3RhdGUuc2VydmVyLm5hbWUpLFxuXHRcdFx0XHR0b29sYmFyRGF0YToge1xuXHRcdFx0XHRcdGFyZzogdG9vbEludm9jYXRpb24sXG5cdFx0XHRcdFx0cGFydFR5cGU6ICdjaGF0VG9vbEF1dGhlbnRpY2F0aW9uJyxcblx0XHRcdFx0XHRwYXJ0U291cmNlOiB0b29sSW52b2NhdGlvbi5zb3VyY2UudHlwZSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod2lkZ2V0Lm9uRGlkQ2xpY2soYXN5bmMgKHsgYnV0dG9uLCBpc1RvdWNoQ2xpY2sgfSkgPT4ge1xuXHRcdFx0YXdhaXQgYnV0dG9uLmRhdGEoKTtcblx0XHRcdGlmICghaXNUb3VjaENsaWNrKSB7XG5cdFx0XHRcdGNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpPy5mb2N1c0lucHV0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuZG9tTm9kZSA9IHdpZGdldC5kb21Ob2RlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9DQUFvQztBQUU3QyxTQUFTLHFDQUFxQztBQUV2QyxJQUFNLGdDQUFOLGNBQTRDLDhCQUE4QjtBQUFBLEVBSWhGLFlBQ0MsZ0JBQ0EsU0FDdUIsc0JBQ1Msc0JBQ1osbUJBQ25CO0FBQ0QsVUFBTSxjQUFjO0FBVHJCLFNBQVMsYUFBYSxDQUFDO0FBVXRCLFVBQU0sUUFBUSxlQUFlLE1BQU0sSUFBSTtBQUN2QyxRQUFJLE1BQU0sU0FBUyxvQkFBb0IsVUFBVSwwQkFBMEI7QUFDMUUsWUFBTSxJQUFJLE1BQU0sc0NBQXNDO0FBQUEsSUFDdkQ7QUFFQSxVQUFNLFNBQVMsS0FBSyxVQUFVLHFCQUFxQjtBQUFBLE1BQ2xEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sU0FBUyxpQ0FBaUMsNkJBQTZCO0FBQUEsUUFDOUUsTUFBTSxRQUFRO0FBQUEsUUFDZCxVQUFVLE1BQU0sT0FBTztBQUFBLFFBQ3ZCLFNBQVM7QUFBQSxVQUNSO0FBQUEsWUFDQyxPQUFPLFNBQVMsd0NBQXdDLGNBQWM7QUFBQSxZQUN0RSxNQUFNLFlBQVk7QUFDakIsb0JBQU0scUJBQXFCLHNCQUFzQixRQUFRLFFBQVEsaUJBQWlCLE1BQU0sT0FBTyxFQUFFO0FBQUEsWUFDbEc7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTyxTQUFTLGtDQUFrQyxRQUFRO0FBQUEsWUFDMUQsTUFBTSxZQUFZO0FBQ2pCLG9CQUFNLE9BQU87QUFBQSxZQUNkO0FBQUEsWUFDQSxhQUFhO0FBQUEsVUFDZDtBQUFBLFFBQ0Q7QUFBQSxRQUNBLFNBQVMsU0FBUyxtQ0FBbUMsMEVBQTBFLE1BQU0sT0FBTyxJQUFJO0FBQUEsUUFDaEosYUFBYTtBQUFBLFVBQ1osS0FBSztBQUFBLFVBQ0wsVUFBVTtBQUFBLFVBQ1YsWUFBWSxlQUFlLE9BQU87QUFBQSxRQUNuQztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFDRCxTQUFLLFVBQVUsT0FBTyxXQUFXLE9BQU8sRUFBRSxRQUFRLGFBQWEsTUFBTTtBQUNwRSxZQUFNLE9BQU8sS0FBSztBQUNsQixVQUFJLENBQUMsY0FBYztBQUNsQiwwQkFBa0IsMkJBQTJCLFFBQVEsUUFBUSxlQUFlLEdBQUcsV0FBVztBQUFBLE1BQzNGO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsT0FBTztBQUFBLEVBQ3ZCO0FBQ0Q7QUF2RGEsZ0NBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRVOyIsCiAgIm5hbWVzIjogW10KfQo=
