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
import * as dom from "../../../../../../base/browser/dom.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { assertType } from "../../../../../../base/common/types.js";
import { localize } from "../../../../../../nls.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { defaultButtonStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
const $ = dom.$;
let ChatQuotaExceededPart = class extends Disposable {
  constructor(element, content, renderer, commandService, telemetryService, chatEntitlementService) {
    super();
    this.content = content;
    const errorDetails = element.errorDetails;
    assertType(!!errorDetails, "errorDetails");
    this.domNode = $(".chat-quota-error-widget");
    const icon = dom.append(this.domNode, $("span"));
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
    const messageContainer = dom.append(this.domNode, $(".chat-quota-error-message"));
    const markdownContent = this._register(renderer.render(new MarkdownString(errorDetails.message)));
    dom.append(messageContainer, markdownContent.element);
    let primaryButtonLabel;
    switch (chatEntitlementService.entitlement) {
      case ChatEntitlement.EDU:
      case ChatEntitlement.Pro:
      case ChatEntitlement.ProPlus:
      case ChatEntitlement.Max:
        primaryButtonLabel = localize("manageBudget", "Manage Budget");
        break;
      case ChatEntitlement.Free:
        primaryButtonLabel = localize("upgradeToCopilotPro", "Upgrade to GitHub Copilot Pro");
        break;
    }
    if (primaryButtonLabel) {
      const primaryButton = this._register(new Button(messageContainer, { ...defaultButtonStyles, supportIcons: true }));
      primaryButton.label = primaryButtonLabel;
      primaryButton.element.classList.add("chat-quota-error-button");
      this._register(primaryButton.onDidClick(async () => {
        const commandId = chatEntitlementService.entitlement === ChatEntitlement.Free ? "workbench.action.chat.upgradePlan" : "workbench.action.chat.manageAdditionalSpend";
        telemetryService.publicLog2("workbenchActionExecuted", { id: commandId, from: "chat-response" });
        await commandService.executeCommand(commandId);
      }));
    }
  }
  hasSameContent(other) {
    return other.kind === this.content.kind && !!other.errorDetails.isQuotaExceeded;
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatQuotaExceededPart = __decorateClass([
  __decorateParam(3, ICommandService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IChatEntitlementService)
], ChatQuotaExceededPart);
export {
  ChatQuotaExceededPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFF1b3RhRXhjZWVkZWRQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0RXJyb3JEZXRhaWxzUGFydCwgSUNoYXRSZW5kZXJlckNvbnRlbnQsIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5leHBvcnQgY2xhc3MgQ2hhdFF1b3RhRXhjZWVkZWRQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0Q29udGVudFBhcnQge1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50OiBJQ2hhdEVycm9yRGV0YWlsc1BhcnQsXG5cdFx0cmVuZGVyZXI6IElNYXJrZG93blJlbmRlcmVyLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBlcnJvckRldGFpbHMgPSBlbGVtZW50LmVycm9yRGV0YWlscztcblx0XHRhc3NlcnRUeXBlKCEhZXJyb3JEZXRhaWxzLCAnZXJyb3JEZXRhaWxzJyk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSAkKCcuY2hhdC1xdW90YS1lcnJvci13aWRnZXQnKTtcblx0XHRjb25zdCBpY29uID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsICQoJ3NwYW4nKSk7XG5cdFx0aWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ud2FybmluZykpO1xuXG5cdFx0Y29uc3QgbWVzc2FnZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCAkKCcuY2hhdC1xdW90YS1lcnJvci1tZXNzYWdlJykpO1xuXHRcdGNvbnN0IG1hcmtkb3duQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKHJlbmRlcmVyLnJlbmRlcihuZXcgTWFya2Rvd25TdHJpbmcoZXJyb3JEZXRhaWxzLm1lc3NhZ2UpKSk7XG5cdFx0ZG9tLmFwcGVuZChtZXNzYWdlQ29udGFpbmVyLCBtYXJrZG93bkNvbnRlbnQuZWxlbWVudCk7XG5cblx0XHRsZXQgcHJpbWFyeUJ1dHRvbkxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0c3dpdGNoIChjaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50KSB7XG5cdFx0XHRjYXNlIENoYXRFbnRpdGxlbWVudC5FRFU6XG5cdFx0XHRjYXNlIENoYXRFbnRpdGxlbWVudC5Qcm86XG5cdFx0XHRjYXNlIENoYXRFbnRpdGxlbWVudC5Qcm9QbHVzOlxuXHRcdFx0Y2FzZSBDaGF0RW50aXRsZW1lbnQuTWF4OlxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uTGFiZWwgPSBsb2NhbGl6ZSgnbWFuYWdlQnVkZ2V0JywgXCJNYW5hZ2UgQnVkZ2V0XCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50LkZyZWU6XG5cdFx0XHRcdHByaW1hcnlCdXR0b25MYWJlbCA9IGxvY2FsaXplKCd1cGdyYWRlVG9Db3BpbG90UHJvJywgXCJVcGdyYWRlIHRvIEdpdEh1YiBDb3BpbG90IFByb1wiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKHByaW1hcnlCdXR0b25MYWJlbCkge1xuXHRcdFx0Y29uc3QgcHJpbWFyeUJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24obWVzc2FnZUNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXHRcdFx0cHJpbWFyeUJ1dHRvbi5sYWJlbCA9IHByaW1hcnlCdXR0b25MYWJlbDtcblx0XHRcdHByaW1hcnlCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXF1b3RhLWVycm9yLWJ1dHRvbicpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihwcmltYXJ5QnV0dG9uLm9uRGlkQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kSWQgPSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRnJlZSA/ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudXBncmFkZVBsYW4nIDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5tYW5hZ2VBZGRpdGlvbmFsU3BlbmQnO1xuXHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogY29tbWFuZElkLCBmcm9tOiAnY2hhdC1yZXNwb25zZScgfSk7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG90aGVyLmtpbmQgPT09IHRoaXMuY29udGVudC5raW5kICYmICEhb3RoZXIuZXJyb3JEZXRhaWxzLmlzUXVvdGFFeGNlZWRlZDtcblx0fVxuXG5cdGFkZERpc3Bvc2FibGUoZGlzcG9zYWJsZTogSURpc3Bvc2FibGUpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjO0FBRXZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUErQjtBQUN4QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlCQUFpQiwrQkFBK0I7QUFJekQsTUFBTSxJQUFJLElBQUk7QUFFUCxJQUFNLHdCQUFOLGNBQW9DLFdBQXVDO0FBQUEsRUFJakYsWUFDQyxTQUNpQixTQUNqQixVQUNpQixnQkFDRSxrQkFDTSx3QkFDeEI7QUFDRCxVQUFNO0FBTlc7QUFRakIsVUFBTSxlQUFlLFFBQVE7QUFDN0IsZUFBVyxDQUFDLENBQUMsY0FBYyxjQUFjO0FBRXpDLFNBQUssVUFBVSxFQUFFLDBCQUEwQjtBQUMzQyxVQUFNLE9BQU8sSUFBSSxPQUFPLEtBQUssU0FBUyxFQUFFLE1BQU0sQ0FBQztBQUMvQyxTQUFLLFVBQVUsSUFBSSxHQUFHLFVBQVUsaUJBQWlCLFFBQVEsT0FBTyxDQUFDO0FBRWpFLFVBQU0sbUJBQW1CLElBQUksT0FBTyxLQUFLLFNBQVMsRUFBRSwyQkFBMkIsQ0FBQztBQUNoRixVQUFNLGtCQUFrQixLQUFLLFVBQVUsU0FBUyxPQUFPLElBQUksZUFBZSxhQUFhLE9BQU8sQ0FBQyxDQUFDO0FBQ2hHLFFBQUksT0FBTyxrQkFBa0IsZ0JBQWdCLE9BQU87QUFFcEQsUUFBSTtBQUNKLFlBQVEsdUJBQXVCLGFBQWE7QUFBQSxNQUMzQyxLQUFLLGdCQUFnQjtBQUFBLE1BQ3JCLEtBQUssZ0JBQWdCO0FBQUEsTUFDckIsS0FBSyxnQkFBZ0I7QUFBQSxNQUNyQixLQUFLLGdCQUFnQjtBQUNwQiw2QkFBcUIsU0FBUyxnQkFBZ0IsZUFBZTtBQUM3RDtBQUFBLE1BQ0QsS0FBSyxnQkFBZ0I7QUFDcEIsNkJBQXFCLFNBQVMsdUJBQXVCLCtCQUErQjtBQUNwRjtBQUFBLElBQ0Y7QUFFQSxRQUFJLG9CQUFvQjtBQUN2QixZQUFNLGdCQUFnQixLQUFLLFVBQVUsSUFBSSxPQUFPLGtCQUFrQixFQUFFLEdBQUcscUJBQXFCLGNBQWMsS0FBSyxDQUFDLENBQUM7QUFDakgsb0JBQWMsUUFBUTtBQUN0QixvQkFBYyxRQUFRLFVBQVUsSUFBSSx5QkFBeUI7QUFFN0QsV0FBSyxVQUFVLGNBQWMsV0FBVyxZQUFZO0FBQ25ELGNBQU0sWUFBWSx1QkFBdUIsZ0JBQWdCLGdCQUFnQixPQUFPLHNDQUFzQztBQUN0SCx5QkFBaUIsV0FBZ0YsMkJBQTJCLEVBQUUsSUFBSSxXQUFXLE1BQU0sZ0JBQWdCLENBQUM7QUFDcEssY0FBTSxlQUFlLGVBQWUsU0FBUztBQUFBLE1BQzlDLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNEO0FBQUEsRUFFQSxlQUFlLE9BQXNDO0FBQ3BELFdBQU8sTUFBTSxTQUFTLEtBQUssUUFBUSxRQUFRLENBQUMsQ0FBQyxNQUFNLGFBQWE7QUFBQSxFQUNqRTtBQUFBLEVBRUEsY0FBYyxZQUErQjtBQUM1QyxTQUFLLFVBQVUsVUFBVTtBQUFBLEVBQzFCO0FBQ0Q7QUExRGEsd0JBQU47QUFBQSxFQVFKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVZVOyIsCiAgIm5hbWVzIjogW10KfQo=
