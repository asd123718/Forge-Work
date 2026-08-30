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
import { localize } from "../../../../nls.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { IChatWidgetService } from "../../../../workbench/contrib/chat/browser/chat.js";
import { IWorkbenchEnvironmentService } from "../../../../workbench/services/environment/common/environmentService.js";
import { ChatAgentLocation } from "../../../../workbench/contrib/chat/common/constants.js";
import { IChatService } from "../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IChatSlashCommandService } from "../../../../workbench/contrib/chat/common/participants/chatSlashCommands.js";
import { captureSideChatSelection } from "../../../../workbench/contrib/chat/browser/chatSideChat.js";
import { IsSessionsWindowContext } from "../../../../workbench/common/contextkeys.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ISessionsPartService } from "../../../services/sessions/browser/sessionsPartService.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { SessionIsArchivedContext, SessionIsCreatedContext, SessionSupportsSideChatContext } from "../../../common/contextkeys.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
import { openAndSendSideChat } from "./sideChatOrchestration.js";
let BtwSlashCommandContribution = class extends Disposable {
  constructor(slashCommandService, sessionsService, sessionsManagementService, sessionsPartService, chatService, chatWidgetService, environmentService, logService, notificationService) {
    super();
    if (!environmentService.isSessionsWindow) {
      return;
    }
    this._register(slashCommandService.registerSlashCommand({
      command: "btw",
      detail: localize("btw", "Ask a side question without adding it to this conversation"),
      sortText: "z2_btw",
      executeImmediately: false,
      executeDuringRequest: true,
      silent: true,
      locations: [ChatAgentLocation.Chat],
      when: ContextKeyExpr.and(
        IsSessionsWindowContext,
        SessionIsCreatedContext,
        SessionIsArchivedContext.negate(),
        SessionSupportsSideChatContext
      )
    }, async (prompt, _progress, _history, _location, sessionResource, _token, options) => {
      const remainder = prompt.trim();
      if (!remainder) {
        notificationService.warn(localize("btw.missingPrompt", "Enter a question after `/btw`."));
        return;
      }
      const found = sessionsManagementService.getSessionForChatResource(sessionResource);
      if (!found) {
        notificationService.warn(localize("btw.sessionUnavailable", "A side chat cannot be created from this conversation."));
        return;
      }
      const { session, chat } = found;
      if (session.status.get() === SessionStatus.Untitled || session.isArchived.get() || !session.capabilities.get().supportsSideChat) {
        notificationService.warn(localize("btw.unsupported", "This conversation does not support side chats."));
        return;
      }
      const sourceTurn = chatService.getSession(chat.resource)?.getRequests().at(-1);
      if (!sourceTurn) {
        logService.warn("[btw] No turn to branch a side chat from");
        notificationService.warn(localize("btw.noTurn", "Send a message in this conversation before starting a side chat."));
        return;
      }
      const selection = captureSideChatSelection(chatWidgetService.getWidgetBySessionResource(chat.resource));
      let sideChat;
      try {
        sideChat = await sessionsManagementService.createSideChatInSession(session, chat.resource, sourceTurn.id, selection);
      } catch (err) {
        logService.error("[btw] Failed to create side chat", err);
        notificationService.error(localize("btw.createFailed", "The side chat could not be created."));
        return;
      }
      await openAndSendSideChat(sessionsManagementService, sessionsService, sessionsPartService, session, sideChat, { query: remainder, attachedContext: options?.attachedContext });
    }));
  }
};
BtwSlashCommandContribution.ID = "sessions.contrib.btwSlashCommand";
BtwSlashCommandContribution = __decorateClass([
  __decorateParam(0, IChatSlashCommandService),
  __decorateParam(1, ISessionsService),
  __decorateParam(2, ISessionsManagementService),
  __decorateParam(3, ISessionsPartService),
  __decorateParam(4, IChatService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, IWorkbenchEnvironmentService),
  __decorateParam(7, ILogService),
  __decorateParam(8, INotificationService)
], BtwSlashCommandContribution);
registerWorkbenchContribution2(BtwSlashCommandContribution.ID, BtwSlashCommandContribution, WorkbenchPhase.Eventually);
export {
  BtwSlashCommandContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3NlclxcYnR3U2xhc2hDb21tYW5kLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdFNsYXNoQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgY2FwdHVyZVNpZGVDaGF0U2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRTaWRlQ2hhdC5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1BhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1BhcnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQsIFNlc3Npb25Jc0NyZWF0ZWRDb250ZXh0LCBTZXNzaW9uU3VwcG9ydHNTaWRlQ2hhdENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IG9wZW5BbmRTZW5kU2lkZUNoYXQgfSBmcm9tICcuL3NpZGVDaGF0T3JjaGVzdHJhdGlvbi5qcyc7XG5cblxuZXhwb3J0IGNsYXNzIEJ0d1NsYXNoQ29tbWFuZENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2Vzc2lvbnMuY29udHJpYi5idHdTbGFzaENvbW1hbmQnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2Ugc2xhc2hDb21tYW5kU2VydmljZTogSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Ugc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1BhcnRTZXJ2aWNlIHNlc3Npb25zUGFydFNlcnZpY2U6IElTZXNzaW9uc1BhcnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAoIWVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRjb21tYW5kOiAnYnR3Jyxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2J0dycsIFwiQXNrIGEgc2lkZSBxdWVzdGlvbiB3aXRob3V0IGFkZGluZyBpdCB0byB0aGlzIGNvbnZlcnNhdGlvblwiKSxcblx0XHRcdHNvcnRUZXh0OiAnejJfYnR3Jyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogZmFsc2UsXG5cdFx0XHRleGVjdXRlRHVyaW5nUmVxdWVzdDogdHJ1ZSxcblx0XHRcdHNpbGVudDogdHJ1ZSxcblx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRcdFx0U2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsXG5cdFx0XHRcdFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0U2Vzc2lvblN1cHBvcnRzU2lkZUNoYXRDb250ZXh0LFxuXHRcdFx0KSxcblx0XHR9LCBhc3luYyAocHJvbXB0LCBfcHJvZ3Jlc3MsIF9oaXN0b3J5LCBfbG9jYXRpb24sIHNlc3Npb25SZXNvdXJjZSwgX3Rva2VuLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRjb25zdCByZW1haW5kZXIgPSBwcm9tcHQudHJpbSgpO1xuXHRcdFx0aWYgKCFyZW1haW5kZXIpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS53YXJuKGxvY2FsaXplKCdidHcubWlzc2luZ1Byb21wdCcsIFwiRW50ZXIgYSBxdWVzdGlvbiBhZnRlciBgL2J0d2AuXCIpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZm91bmQgPSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb25Gb3JDaGF0UmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICghZm91bmQpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS53YXJuKGxvY2FsaXplKCdidHcuc2Vzc2lvblVuYXZhaWxhYmxlJywgXCJBIHNpZGUgY2hhdCBjYW5ub3QgYmUgY3JlYXRlZCBmcm9tIHRoaXMgY29udmVyc2F0aW9uLlwiKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiwgY2hhdCB9ID0gZm91bmQ7XG5cdFx0XHRpZiAoc2Vzc2lvbi5zdGF0dXMuZ2V0KCkgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgfHwgc2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpIHx8ICFzZXNzaW9uLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c1NpZGVDaGF0KSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnYnR3LnVuc3VwcG9ydGVkJywgXCJUaGlzIGNvbnZlcnNhdGlvbiBkb2VzIG5vdCBzdXBwb3J0IHNpZGUgY2hhdHMuXCIpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzb3VyY2VUdXJuID0gY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihjaGF0LnJlc291cmNlKT8uZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0XHRpZiAoIXNvdXJjZVR1cm4pIHtcblx0XHRcdFx0bG9nU2VydmljZS53YXJuKCdbYnR3XSBObyB0dXJuIHRvIGJyYW5jaCBhIHNpZGUgY2hhdCBmcm9tJyk7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnYnR3Lm5vVHVybicsIFwiU2VuZCBhIG1lc3NhZ2UgaW4gdGhpcyBjb252ZXJzYXRpb24gYmVmb3JlIHN0YXJ0aW5nIGEgc2lkZSBjaGF0LlwiKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGNhcHR1cmVTaWRlQ2hhdFNlbGVjdGlvbihjaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShjaGF0LnJlc291cmNlKSk7XG5cblx0XHRcdGxldCBzaWRlQ2hhdDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHNpZGVDaGF0ID0gYXdhaXQgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5jcmVhdGVTaWRlQ2hhdEluU2Vzc2lvbihzZXNzaW9uLCBjaGF0LnJlc291cmNlLCBzb3VyY2VUdXJuLmlkLCBzZWxlY3Rpb24pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ1tidHddIEZhaWxlZCB0byBjcmVhdGUgc2lkZSBjaGF0JywgZXJyKTtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnYnR3LmNyZWF0ZUZhaWxlZCcsIFwiVGhlIHNpZGUgY2hhdCBjb3VsZCBub3QgYmUgY3JlYXRlZC5cIikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IG9wZW5BbmRTZW5kU2lkZUNoYXQoc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlLCBzZXNzaW9uc1BhcnRTZXJ2aWNlLCBzZXNzaW9uLCBzaWRlQ2hhdCwgeyBxdWVyeTogcmVtYWluZGVyLCBhdHRhY2hlZENvbnRleHQ6IG9wdGlvbnM/LmF0dGFjaGVkQ29udGV4dCB9KTtcblx0XHR9KSk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEJ0d1NsYXNoQ29tbWFuZENvbnRyaWJ1dGlvbi5JRCwgQnR3U2xhc2hDb21tYW5kQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBaUMsZ0NBQWdDLHNCQUFzQjtBQUN2RixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDBCQUEwQix5QkFBeUIsc0NBQXNDO0FBQ2xHLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMkJBQTJCO0FBRzdCLElBQU0sOEJBQU4sY0FBMEMsV0FBNkM7QUFBQSxFQUk3RixZQUMyQixxQkFDUixpQkFDVSwyQkFDTixxQkFDUixhQUNNLG1CQUNVLG9CQUNqQixZQUNTLHFCQUNyQjtBQUNELFVBQU07QUFFTixRQUFJLENBQUMsbUJBQW1CLGtCQUFrQjtBQUN6QztBQUFBLElBQ0Q7QUFFQSxTQUFLLFVBQVUsb0JBQW9CLHFCQUFxQjtBQUFBLE1BQ3ZELFNBQVM7QUFBQSxNQUNULFFBQVEsU0FBUyxPQUFPLDREQUE0RDtBQUFBLE1BQ3BGLFVBQVU7QUFBQSxNQUNWLG9CQUFvQjtBQUFBLE1BQ3BCLHNCQUFzQjtBQUFBLE1BQ3RCLFFBQVE7QUFBQSxNQUNSLFdBQVcsQ0FBQyxrQkFBa0IsSUFBSTtBQUFBLE1BQ2xDLE1BQU0sZUFBZTtBQUFBLFFBQ3BCO0FBQUEsUUFDQTtBQUFBLFFBQ0EseUJBQXlCLE9BQU87QUFBQSxRQUNoQztBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUcsT0FBTyxRQUFRLFdBQVcsVUFBVSxXQUFXLGlCQUFpQixRQUFRLFlBQVk7QUFDdEYsWUFBTSxZQUFZLE9BQU8sS0FBSztBQUM5QixVQUFJLENBQUMsV0FBVztBQUNmLDRCQUFvQixLQUFLLFNBQVMscUJBQXFCLGdDQUFnQyxDQUFDO0FBQ3hGO0FBQUEsTUFDRDtBQUNBLFlBQU0sUUFBUSwwQkFBMEIsMEJBQTBCLGVBQWU7QUFDakYsVUFBSSxDQUFDLE9BQU87QUFDWCw0QkFBb0IsS0FBSyxTQUFTLDBCQUEwQix1REFBdUQsQ0FBQztBQUNwSDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLEVBQUUsU0FBUyxLQUFLLElBQUk7QUFDMUIsVUFBSSxRQUFRLE9BQU8sSUFBSSxNQUFNLGNBQWMsWUFBWSxRQUFRLFdBQVcsSUFBSSxLQUFLLENBQUMsUUFBUSxhQUFhLElBQUksRUFBRSxrQkFBa0I7QUFDaEksNEJBQW9CLEtBQUssU0FBUyxtQkFBbUIsZ0RBQWdELENBQUM7QUFDdEc7QUFBQSxNQUNEO0FBRUEsWUFBTSxhQUFhLFlBQVksV0FBVyxLQUFLLFFBQVEsR0FBRyxZQUFZLEVBQUUsR0FBRyxFQUFFO0FBQzdFLFVBQUksQ0FBQyxZQUFZO0FBQ2hCLG1CQUFXLEtBQUssMENBQTBDO0FBQzFELDRCQUFvQixLQUFLLFNBQVMsY0FBYyxrRUFBa0UsQ0FBQztBQUNuSDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFlBQVkseUJBQXlCLGtCQUFrQiwyQkFBMkIsS0FBSyxRQUFRLENBQUM7QUFFdEcsVUFBSTtBQUNKLFVBQUk7QUFDSCxtQkFBVyxNQUFNLDBCQUEwQix3QkFBd0IsU0FBUyxLQUFLLFVBQVUsV0FBVyxJQUFJLFNBQVM7QUFBQSxNQUNwSCxTQUFTLEtBQUs7QUFDYixtQkFBVyxNQUFNLG9DQUFvQyxHQUFHO0FBQ3hELDRCQUFvQixNQUFNLFNBQVMsb0JBQW9CLHFDQUFxQyxDQUFDO0FBQzdGO0FBQUEsTUFDRDtBQUVBLFlBQU0sb0JBQW9CLDJCQUEyQixpQkFBaUIscUJBQXFCLFNBQVMsVUFBVSxFQUFFLE9BQU8sV0FBVyxpQkFBaUIsU0FBUyxnQkFBZ0IsQ0FBQztBQUFBLElBQzlLLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQXhFYSw0QkFFSSxLQUFLO0FBRlQsOEJBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWJVO0FBMEViLCtCQUErQiw0QkFBNEIsSUFBSSw2QkFBNkIsZUFBZSxVQUFVOyIsCiAgIm5hbWVzIjogW10KfQo=
