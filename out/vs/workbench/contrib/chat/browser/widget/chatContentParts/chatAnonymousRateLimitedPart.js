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
import { $, append } from "../../../../../../base/browser/dom.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { defaultButtonStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
let ChatAnonymousRateLimitedPart = class extends Disposable {
  constructor(content, commandService, telemetryService, chatEntitlementService) {
    super();
    this.content = content;
    this.domNode = $(".chat-rate-limited-widget");
    const icon = append(this.domNode, $("span"));
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
    const messageContainer = append(this.domNode, $(".chat-rate-limited-message"));
    const message = append(messageContainer, $("div"));
    message.textContent = localize("anonymousRateLimited", "Continue the conversation by signing in. Your free account gets 50 premium requests a month plus access to more models and AI features.");
    const signInButton = this._register(new Button(messageContainer, { ...defaultButtonStyles, supportIcons: true }));
    signInButton.label = localize("enableMoreAIFeatures", "Enable more AI features");
    signInButton.element.classList.add("chat-rate-limited-button");
    this._register(signInButton.onDidClick(async () => {
      const commandId = "workbench.action.chat.triggerSetup";
      telemetryService.publicLog2("workbenchActionExecuted", { id: commandId, from: "chat-response" });
      await commandService.executeCommand(commandId);
    }));
  }
  hasSameContent(other) {
    return other.kind === this.content.kind && !!other.errorDetails.isRateLimited;
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatAnonymousRateLimitedPart = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IChatEntitlementService)
], ChatAnonymousRateLimitedPart);
export {
  ChatAnonymousRateLimitedPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdEFub255bW91c1JhdGVMaW1pdGVkUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQsIGFwcGVuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVycm9yRGV0YWlsc1BhcnQsIElDaGF0UmVuZGVyZXJDb250ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0QW5vbnltb3VzUmF0ZUxpbWl0ZWRQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0Q29udGVudFBhcnQge1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGVudDogSUNoYXRFcnJvckRldGFpbHNQYXJ0LFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSAkKCcuY2hhdC1yYXRlLWxpbWl0ZWQtd2lkZ2V0Jyk7XG5cblx0XHRjb25zdCBpY29uID0gYXBwZW5kKHRoaXMuZG9tTm9kZSwgJCgnc3BhbicpKTtcblx0XHRpY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5pbmZvKSk7XG5cblx0XHRjb25zdCBtZXNzYWdlQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuZG9tTm9kZSwgJCgnLmNoYXQtcmF0ZS1saW1pdGVkLW1lc3NhZ2UnKSk7XG5cblx0XHRjb25zdCBtZXNzYWdlID0gYXBwZW5kKG1lc3NhZ2VDb250YWluZXIsICQoJ2RpdicpKTtcblx0XHRtZXNzYWdlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2Fub255bW91c1JhdGVMaW1pdGVkJywgXCJDb250aW51ZSB0aGUgY29udmVyc2F0aW9uIGJ5IHNpZ25pbmcgaW4uIFlvdXIgZnJlZSBhY2NvdW50IGdldHMgNTAgcHJlbWl1bSByZXF1ZXN0cyBhIG1vbnRoIHBsdXMgYWNjZXNzIHRvIG1vcmUgbW9kZWxzIGFuZCBBSSBmZWF0dXJlcy5cIik7XG5cblx0XHRjb25zdCBzaWduSW5CdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKG1lc3NhZ2VDb250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHRzaWduSW5CdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnZW5hYmxlTW9yZUFJRmVhdHVyZXMnLCBcIkVuYWJsZSBtb3JlIEFJIGZlYXR1cmVzXCIpO1xuXHRcdHNpZ25JbkJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtcmF0ZS1saW1pdGVkLWJ1dHRvbicpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2lnbkluQnV0dG9uLm9uRGlkQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZElkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXAnO1xuXHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6IGNvbW1hbmRJZCwgZnJvbTogJ2NoYXQtcmVzcG9uc2UnIH0pO1xuXG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kSWQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGhhc1NhbWVDb250ZW50KG90aGVyOiBJQ2hhdFJlbmRlcmVyQ29udGVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBvdGhlci5raW5kID09PSB0aGlzLmNvbnRlbnQua2luZCAmJiAhIW90aGVyLmVycm9yRGV0YWlscy5pc1JhdGVMaW1pdGVkO1xuXHR9XG5cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBRyxjQUFjO0FBQzFCLFNBQVMsY0FBYztBQUV2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQkFBK0I7QUFJakMsSUFBTSwrQkFBTixjQUEyQyxXQUF1QztBQUFBLEVBSXhGLFlBQ2tCLFNBQ0EsZ0JBQ0Usa0JBQ00sd0JBQ3hCO0FBQ0QsVUFBTTtBQUxXO0FBT2pCLFNBQUssVUFBVSxFQUFFLDJCQUEyQjtBQUU1QyxVQUFNLE9BQU8sT0FBTyxLQUFLLFNBQVMsRUFBRSxNQUFNLENBQUM7QUFDM0MsU0FBSyxVQUFVLElBQUksR0FBRyxVQUFVLGlCQUFpQixRQUFRLElBQUksQ0FBQztBQUU5RCxVQUFNLG1CQUFtQixPQUFPLEtBQUssU0FBUyxFQUFFLDRCQUE0QixDQUFDO0FBRTdFLFVBQU0sVUFBVSxPQUFPLGtCQUFrQixFQUFFLEtBQUssQ0FBQztBQUNqRCxZQUFRLGNBQWMsU0FBUyx3QkFBd0IseUlBQXlJO0FBRWhNLFVBQU0sZUFBZSxLQUFLLFVBQVUsSUFBSSxPQUFPLGtCQUFrQixFQUFFLEdBQUcscUJBQXFCLGNBQWMsS0FBSyxDQUFDLENBQUM7QUFDaEgsaUJBQWEsUUFBUSxTQUFTLHdCQUF3Qix5QkFBeUI7QUFDL0UsaUJBQWEsUUFBUSxVQUFVLElBQUksMEJBQTBCO0FBRTdELFNBQUssVUFBVSxhQUFhLFdBQVcsWUFBWTtBQUNsRCxZQUFNLFlBQVk7QUFDbEIsdUJBQWlCLFdBQWdGLDJCQUEyQixFQUFFLElBQUksV0FBVyxNQUFNLGdCQUFnQixDQUFDO0FBRXBLLFlBQU0sZUFBZSxlQUFlLFNBQVM7QUFBQSxJQUM5QyxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxlQUFlLE9BQXNDO0FBQ3BELFdBQU8sTUFBTSxTQUFTLEtBQUssUUFBUSxRQUFRLENBQUMsQ0FBQyxNQUFNLGFBQWE7QUFBQSxFQUNqRTtBQUFBLEVBRUEsY0FBYyxZQUErQjtBQUM1QyxTQUFLLFVBQVUsVUFBVTtBQUFBLEVBQzFCO0FBQ0Q7QUF6Q2EsK0JBQU47QUFBQSxFQU1KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVJVOyIsCiAgIm5hbWVzIjogW10KfQo=
