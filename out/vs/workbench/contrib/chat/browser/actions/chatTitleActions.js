import { Codicon } from "../../../../../base/common/codicons.js";
import { marked } from "../../../../../base/common/marked/marked.js";
import { basename } from "../../../../../base/common/resources.js";
import { IBulkEditService } from "../../../../../editor/browser/services/bulkEditService.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ResourceNotebookCellEdit } from "../../../bulkEdit/browser/bulkCellEdits.js";
import { MENU_INLINE_CHAT_WIDGET_SECONDARY } from "../../../inlineChat/common/inlineChat.js";
import { CellEditType, CellKind, NOTEBOOK_EDITOR_ID } from "../../../notebook/common/notebookCommon.js";
import { NOTEBOOK_IS_ACTIVE_EDITOR } from "../../../notebook/common/notebookContextKeys.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { applyingChatEditsFailedContextKey, isChatEditingActionContext } from "../../common/editing/chatEditingService.js";
import { ChatAgentVoteDirection, IChatService } from "../../common/chatService/chatService.js";
import { isResponseVM } from "../../common/model/chatViewModel.js";
import { ChatModeKind } from "../../common/constants.js";
import { IChatAccessibilityService, IChatWidgetService } from "../chat.js";
import { CHAT_CATEGORY } from "./chatActions.js";
const MarkHelpfulActionId = "workbench.action.chat.markHelpful";
const MarkUnhelpfulActionId = "workbench.action.chat.markUnhelpful";
const enableFeedbackConfig = "config.telemetry.feedback.enabled";
function registerChatTitleActions() {
  registerAction2(class MarkHelpfulAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.markHelpful",
        title: localize2("interactive.helpful.label", "Helpful"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.thumbsup,
        toggled: ChatContextKeys.responseVote.isEqualTo("up"),
        menu: [{
          id: MenuId.ChatMessageFooter,
          group: "navigation",
          order: 2,
          when: ContextKeyExpr.and(ChatContextKeys.extensionParticipantRegistered, ChatContextKeys.isResponse, ChatContextKeys.responseHasError.negate(), ContextKeyExpr.has(enableFeedbackConfig), ChatContextKeys.lockedToCodingAgent.negate())
        }, {
          id: MENU_INLINE_CHAT_WIDGET_SECONDARY,
          group: "navigation",
          order: 1,
          when: ContextKeyExpr.and(ChatContextKeys.extensionParticipantRegistered, ChatContextKeys.isResponse, ChatContextKeys.responseHasError.negate(), ContextKeyExpr.has(enableFeedbackConfig), ChatContextKeys.lockedToCodingAgent.negate())
        }]
      });
    }
    run(accessor, ...args) {
      const item = args[0];
      if (!isResponseVM(item)) {
        return;
      }
      const chatService = accessor.get(IChatService);
      chatService.notifyUserAction({
        agentId: item.agent?.id,
        command: item.slashCommand?.name,
        sessionResource: item.session.sessionResource,
        requestId: item.requestId,
        result: item.result,
        action: {
          kind: "vote",
          direction: ChatAgentVoteDirection.Up
        }
      });
      item.setVote(ChatAgentVoteDirection.Up);
    }
  });
  registerAction2(class MarkUnhelpfulAction extends Action2 {
    constructor() {
      super({
        id: MarkUnhelpfulActionId,
        title: localize2("interactive.unhelpful.label", "Unhelpful"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.thumbsdown,
        toggled: ChatContextKeys.responseVote.isEqualTo("down"),
        menu: [{
          id: MenuId.ChatMessageFooter,
          group: "navigation",
          order: 3,
          when: ContextKeyExpr.and(ChatContextKeys.extensionParticipantRegistered, ChatContextKeys.isResponse, ContextKeyExpr.has(enableFeedbackConfig), ChatContextKeys.lockedToCodingAgent.negate())
        }, {
          id: MENU_INLINE_CHAT_WIDGET_SECONDARY,
          group: "navigation",
          order: 2,
          when: ContextKeyExpr.and(ChatContextKeys.extensionParticipantRegistered, ChatContextKeys.isResponse, ChatContextKeys.responseHasError.negate(), ContextKeyExpr.has(enableFeedbackConfig), ChatContextKeys.lockedToCodingAgent.negate())
        }]
      });
    }
    run(accessor, ...args) {
      const item = args[0];
      if (!isResponseVM(item)) {
        return;
      }
      item.setVote(ChatAgentVoteDirection.Down);
      const chatService = accessor.get(IChatService);
      chatService.notifyUserAction({
        agentId: item.agent?.id,
        command: item.slashCommand?.name,
        sessionResource: item.session.sessionResource,
        requestId: item.requestId,
        result: item.result,
        action: {
          kind: "vote",
          direction: ChatAgentVoteDirection.Down
        }
      });
    }
  });
  registerAction2(class ReportIssueForBugAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.reportIssueForBug",
        title: localize2("interactive.reportIssueForBug.label", "Report Issue"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.report,
        menu: [{
          id: MenuId.ChatMessageFooter,
          group: "navigation",
          order: 4,
          when: ContextKeyExpr.and(ChatContextKeys.responseSupportsIssueReporting, ChatContextKeys.isResponse, ContextKeyExpr.has(enableFeedbackConfig))
        }, {
          id: MENU_INLINE_CHAT_WIDGET_SECONDARY,
          group: "navigation",
          order: 3,
          when: ContextKeyExpr.and(ChatContextKeys.responseSupportsIssueReporting, ChatContextKeys.isResponse, ContextKeyExpr.has(enableFeedbackConfig))
        }]
      });
    }
    run(accessor, ...args) {
      const item = args[0];
      if (!isResponseVM(item)) {
        return;
      }
      const chatService = accessor.get(IChatService);
      chatService.notifyUserAction({
        agentId: item.agent?.id,
        command: item.slashCommand?.name,
        sessionResource: item.session.sessionResource,
        requestId: item.requestId,
        result: item.result,
        action: {
          kind: "bug"
        }
      });
    }
  });
  registerAction2(class RetryChatAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.retry",
        title: localize2("chat.retry.label", "Retry"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.refresh,
        menu: [
          {
            id: MenuId.ChatMessageFooter,
            group: "navigation",
            when: ContextKeyExpr.and(
              ChatContextKeys.isResponse,
              ContextKeyExpr.in(ChatContextKeys.itemId.key, ChatContextKeys.lastItemId.key),
              ChatContextKeys.lockedToCodingAgent.negate()
            )
          },
          {
            id: MenuId.ChatEditingWidgetToolbar,
            group: "navigation",
            when: ContextKeyExpr.and(applyingChatEditsFailedContextKey, ChatContextKeys.lockedToCodingAgent.negate()),
            order: 0
          }
        ]
      });
    }
    async run(accessor, ...args) {
      const chatWidgetService = accessor.get(IChatWidgetService);
      const chatAccessibilityService = accessor.get(IChatAccessibilityService);
      const chatService = accessor.get(IChatService);
      const configurationService = accessor.get(IConfigurationService);
      const dialogService = accessor.get(IDialogService);
      let item = args[0];
      if (isChatEditingActionContext(item)) {
        item = chatWidgetService.getWidgetBySessionResource(item.sessionResource)?.viewModel?.getItems().at(-1);
      }
      if (!isResponseVM(item)) {
        return;
      }
      const chatModel = chatService.getSession(item.sessionResource);
      const chatRequests = chatModel?.getRequests();
      if (!chatRequests) {
        return;
      }
      const itemIndex = chatRequests?.findIndex((request2) => request2.id === item.requestId);
      const widget = chatWidgetService.getWidgetBySessionResource(item.sessionResource);
      const mode = widget?.input.currentModeKind;
      if (chatModel && (mode === ChatModeKind.Edit || mode === ChatModeKind.Agent)) {
        const currentEditingSession = widget?.viewModel?.model.editingSession;
        if (!currentEditingSession) {
          return;
        }
        const entriesModifiedInLastRequest = currentEditingSession.entries.get().filter((entry) => entry.lastModifyingRequestId === item.requestId);
        const shouldPrompt = entriesModifiedInLastRequest.length > 0 && configurationService.getValue("chat.editing.confirmEditRequestRetry") === true;
        const confirmation = shouldPrompt ? await dialogService.confirm({
          title: localize("chat.retryLast.confirmation.title2", "Do you want to retry your last request?"),
          message: entriesModifiedInLastRequest.length === 1 ? localize("chat.retry.confirmation.message2", "This will undo edits made to {0} since this request.", basename(entriesModifiedInLastRequest[0].modifiedURI)) : localize("chat.retryLast.confirmation.message2", "This will undo edits made to {0} files in your working set since this request. Do you want to proceed?", entriesModifiedInLastRequest.length),
          primaryButton: localize("chat.retry.confirmation.primaryButton", "Yes"),
          checkbox: { label: localize("chat.retry.confirmation.checkbox", "Don't ask again"), checked: false },
          type: "info"
        }) : { confirmed: true };
        if (!confirmation.confirmed) {
          return;
        }
        if (confirmation.checkboxChecked) {
          await configurationService.updateValue("chat.editing.confirmEditRequestRetry", false);
        }
        const snapshotRequest = chatRequests[itemIndex];
        if (snapshotRequest) {
          await currentEditingSession.restoreSnapshot(snapshotRequest.id, void 0);
        }
      }
      const request = chatModel?.getRequests().find((candidate) => candidate.id === item.requestId);
      chatAccessibilityService.acceptRequest(item.sessionResource);
      chatService.resendRequest(request, {
        ...widget?.getSelectedModelRequestOptions(),
        attempt: (request?.attempt ?? -1) + 1,
        ...widget?.getModeRequestOptions()
      });
    }
  });
  registerAction2(class InsertToNotebookAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.insertIntoNotebook",
        title: localize2("interactive.insertIntoNotebook.label", "Insert into Notebook"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.insert,
        menu: {
          id: MenuId.ChatMessageFooter,
          group: "navigation",
          isHiddenByDefault: true,
          when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, ChatContextKeys.isResponse, ChatContextKeys.responseIsFiltered.negate(), ChatContextKeys.lockedToCodingAgent.negate())
        }
      });
    }
    async run(accessor, ...args) {
      const item = args[0];
      if (!isResponseVM(item)) {
        return;
      }
      const editorService = accessor.get(IEditorService);
      if (editorService.activeEditorPane?.getId() === NOTEBOOK_EDITOR_ID) {
        const notebookEditor = editorService.activeEditorPane.getControl();
        if (!notebookEditor.hasModel()) {
          return;
        }
        if (notebookEditor.isReadOnly) {
          return;
        }
        const value = item.response.toString();
        const splitContents = splitMarkdownAndCodeBlocks(value);
        const focusRange = notebookEditor.getFocus();
        const index = Math.max(focusRange.end, 0);
        const bulkEditService = accessor.get(IBulkEditService);
        await bulkEditService.apply(
          [
            new ResourceNotebookCellEdit(
              notebookEditor.textModel.uri,
              {
                editType: CellEditType.Replace,
                index,
                count: 0,
                cells: splitContents.map((content) => {
                  const kind = content.type === "markdown" ? CellKind.Markup : CellKind.Code;
                  const language = content.type === "markdown" ? "markdown" : content.language;
                  const mime = content.type === "markdown" ? "text/markdown" : `text/x-${content.language}`;
                  return {
                    cellKind: kind,
                    language,
                    mime,
                    source: content.content,
                    outputs: [],
                    metadata: {}
                  };
                })
              }
            )
          ],
          { quotableLabel: "Insert into Notebook" }
        );
      }
    }
  });
}
function splitMarkdownAndCodeBlocks(markdown) {
  const lexer = new marked.Lexer();
  const tokens = lexer.lex(markdown);
  const splitContent = [];
  let markdownPart = "";
  tokens.forEach((token) => {
    if (token.type === "code") {
      if (markdownPart.trim()) {
        splitContent.push({ type: "markdown", content: markdownPart });
        markdownPart = "";
      }
      splitContent.push({
        type: "code",
        language: token.lang || "",
        content: token.text
      });
    } else {
      markdownPart += token.raw;
    }
  });
  if (markdownPart.trim()) {
    splitContent.push({ type: "markdown", content: markdownPart });
  }
  return splitContent;
}
export {
  MarkHelpfulActionId,
  MarkUnhelpfulActionId,
  registerChatTitleActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRUaXRsZUFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgbWFya2VkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFya2VkL21hcmtlZC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU5vdGVib29rQ2VsbEVkaXQgfSBmcm9tICcuLi8uLi8uLi9idWxrRWRpdC9icm93c2VyL2J1bGtDZWxsRWRpdHMuanMnO1xuaW1wb3J0IHsgTUVOVV9JTkxJTkVfQ0hBVF9XSURHRVRfU0VDT05EQVJZIH0gZnJvbSAnLi4vLi4vLi4vaW5saW5lQ2hhdC9jb21tb24vaW5saW5lQ2hhdC5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFR5cGUsIENlbGxLaW5kLCBOT1RFQk9PS19FRElUT1JfSUQgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgTk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUiB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBhcHBseWluZ0NoYXRFZGl0c0ZhaWxlZENvbnRleHRLZXksIGlzQ2hhdEVkaXRpbmdBY3Rpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudFZvdGVEaXJlY3Rpb24sIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0QWNjZXNzaWJpbGl0eVNlcnZpY2UsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4vY2hhdEFjdGlvbnMuanMnO1xuXG5leHBvcnQgY29uc3QgTWFya0hlbHBmdWxBY3Rpb25JZCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubWFya0hlbHBmdWwnO1xuZXhwb3J0IGNvbnN0IE1hcmtVbmhlbHBmdWxBY3Rpb25JZCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubWFya1VuaGVscGZ1bCc7XG5jb25zdCBlbmFibGVGZWVkYmFja0NvbmZpZyA9ICdjb25maWcudGVsZW1ldHJ5LmZlZWRiYWNrLmVuYWJsZWQnO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDaGF0VGl0bGVBY3Rpb25zKCkge1xuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgTWFya0hlbHBmdWxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubWFya0hlbHBmdWwnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5oZWxwZnVsLmxhYmVsJywgXCJIZWxwZnVsXCIpLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnRodW1ic3VwLFxuXHRcdFx0XHR0b2dnbGVkOiBDaGF0Q29udGV4dEtleXMucmVzcG9uc2VWb3RlLmlzRXF1YWxUbygndXAnKSxcblx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRNZXNzYWdlRm9vdGVyLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5leHRlbnNpb25QYXJ0aWNpcGFudFJlZ2lzdGVyZWQsIENoYXRDb250ZXh0S2V5cy5pc1Jlc3BvbnNlLCBDaGF0Q29udGV4dEtleXMucmVzcG9uc2VIYXNFcnJvci5uZWdhdGUoKSwgQ29udGV4dEtleUV4cHIuaGFzKGVuYWJsZUZlZWRiYWNrQ29uZmlnKSwgQ2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQubmVnYXRlKCkpXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRpZDogTUVOVV9JTkxJTkVfQ0hBVF9XSURHRVRfU0VDT05EQVJZLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5leHRlbnNpb25QYXJ0aWNpcGFudFJlZ2lzdGVyZWQsIENoYXRDb250ZXh0S2V5cy5pc1Jlc3BvbnNlLCBDaGF0Q29udGV4dEtleXMucmVzcG9uc2VIYXNFcnJvci5uZWdhdGUoKSwgQ29udGV4dEtleUV4cHIuaGFzKGVuYWJsZUZlZWRiYWNrQ29uZmlnKSwgQ2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQubmVnYXRlKCkpXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0Y29uc3QgaXRlbSA9IGFyZ3NbMF07XG5cdFx0XHRpZiAoIWlzUmVzcG9uc2VWTShpdGVtKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2VydmljZSk7XG5cdFx0XHRjaGF0U2VydmljZS5ub3RpZnlVc2VyQWN0aW9uKHtcblx0XHRcdFx0YWdlbnRJZDogaXRlbS5hZ2VudD8uaWQsXG5cdFx0XHRcdGNvbW1hbmQ6IGl0ZW0uc2xhc2hDb21tYW5kPy5uYW1lLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGl0ZW0uc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHJlcXVlc3RJZDogaXRlbS5yZXF1ZXN0SWQsXG5cdFx0XHRcdHJlc3VsdDogaXRlbS5yZXN1bHQsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdGtpbmQ6ICd2b3RlJyxcblx0XHRcdFx0XHRkaXJlY3Rpb246IENoYXRBZ2VudFZvdGVEaXJlY3Rpb24uVXAsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0aXRlbS5zZXRWb3RlKENoYXRBZ2VudFZvdGVEaXJlY3Rpb24uVXApO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE1hcmtVbmhlbHBmdWxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IE1hcmtVbmhlbHBmdWxBY3Rpb25JZCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUudW5oZWxwZnVsLmxhYmVsJywgXCJVbmhlbHBmdWxcIiksXG5cdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGljb246IENvZGljb24udGh1bWJzZG93bixcblx0XHRcdFx0dG9nZ2xlZDogQ2hhdENvbnRleHRLZXlzLnJlc3BvbnNlVm90ZS5pc0VxdWFsVG8oJ2Rvd24nKSxcblx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRNZXNzYWdlRm9vdGVyLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5leHRlbnNpb25QYXJ0aWNpcGFudFJlZ2lzdGVyZWQsIENoYXRDb250ZXh0S2V5cy5pc1Jlc3BvbnNlLCBDb250ZXh0S2V5RXhwci5oYXMoZW5hYmxlRmVlZGJhY2tDb25maWcpLCBDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudC5uZWdhdGUoKSlcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGlkOiBNRU5VX0lOTElORV9DSEFUX1dJREdFVF9TRUNPTkRBUlksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmV4dGVuc2lvblBhcnRpY2lwYW50UmVnaXN0ZXJlZCwgQ2hhdENvbnRleHRLZXlzLmlzUmVzcG9uc2UsIENoYXRDb250ZXh0S2V5cy5yZXNwb25zZUhhc0Vycm9yLm5lZ2F0ZSgpLCBDb250ZXh0S2V5RXhwci5oYXMoZW5hYmxlRmVlZGJhY2tDb25maWcpLCBDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudC5uZWdhdGUoKSlcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gYXJnc1swXTtcblx0XHRcdGlmICghaXNSZXNwb25zZVZNKGl0ZW0pKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aXRlbS5zZXRWb3RlKENoYXRBZ2VudFZvdGVEaXJlY3Rpb24uRG93bik7XG5cblx0XHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2VydmljZSk7XG5cdFx0XHRjaGF0U2VydmljZS5ub3RpZnlVc2VyQWN0aW9uKHtcblx0XHRcdFx0YWdlbnRJZDogaXRlbS5hZ2VudD8uaWQsXG5cdFx0XHRcdGNvbW1hbmQ6IGl0ZW0uc2xhc2hDb21tYW5kPy5uYW1lLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGl0ZW0uc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHJlcXVlc3RJZDogaXRlbS5yZXF1ZXN0SWQsXG5cdFx0XHRcdHJlc3VsdDogaXRlbS5yZXN1bHQsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdGtpbmQ6ICd2b3RlJyxcblx0XHRcdFx0XHRkaXJlY3Rpb246IENoYXRBZ2VudFZvdGVEaXJlY3Rpb24uRG93bixcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVwb3J0SXNzdWVGb3JCdWdBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVwb3J0SXNzdWVGb3JCdWcnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5yZXBvcnRJc3N1ZUZvckJ1Zy5sYWJlbCcsIFwiUmVwb3J0IElzc3VlXCIpLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnJlcG9ydCxcblx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRNZXNzYWdlRm9vdGVyLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5yZXNwb25zZVN1cHBvcnRzSXNzdWVSZXBvcnRpbmcsIENoYXRDb250ZXh0S2V5cy5pc1Jlc3BvbnNlLCBDb250ZXh0S2V5RXhwci5oYXMoZW5hYmxlRmVlZGJhY2tDb25maWcpKVxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0aWQ6IE1FTlVfSU5MSU5FX0NIQVRfV0lER0VUX1NFQ09OREFSWSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMucmVzcG9uc2VTdXBwb3J0c0lzc3VlUmVwb3J0aW5nLCBDaGF0Q29udGV4dEtleXMuaXNSZXNwb25zZSwgQ29udGV4dEtleUV4cHIuaGFzKGVuYWJsZUZlZWRiYWNrQ29uZmlnKSlcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gYXJnc1swXTtcblx0XHRcdGlmICghaXNSZXNwb25zZVZNKGl0ZW0pKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXJ2aWNlKTtcblx0XHRcdGNoYXRTZXJ2aWNlLm5vdGlmeVVzZXJBY3Rpb24oe1xuXHRcdFx0XHRhZ2VudElkOiBpdGVtLmFnZW50Py5pZCxcblx0XHRcdFx0Y29tbWFuZDogaXRlbS5zbGFzaENvbW1hbmQ/Lm5hbWUsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogaXRlbS5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0cmVxdWVzdElkOiBpdGVtLnJlcXVlc3RJZCxcblx0XHRcdFx0cmVzdWx0OiBpdGVtLnJlc3VsdCxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0a2luZDogJ2J1Zydcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgUmV0cnlDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJldHJ5Jyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5yZXRyeS5sYWJlbCcsIFwiUmV0cnlcIiksXG5cdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGljb246IENvZGljb24ucmVmcmVzaCxcblx0XHRcdFx0bWVudTogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdE1lc3NhZ2VGb290ZXIsXG5cdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaXNSZXNwb25zZSxcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuaW4oQ2hhdENvbnRleHRLZXlzLml0ZW1JZC5rZXksIENoYXRDb250ZXh0S2V5cy5sYXN0SXRlbUlkLmtleSksXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NrZWRUb0NvZGluZ0FnZW50Lm5lZ2F0ZSgpKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdGluZ1dpZGdldFRvb2xiYXIsXG5cdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGFwcGx5aW5nQ2hhdEVkaXRzRmFpbGVkQ29udGV4dEtleSwgQ2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQubmVnYXRlKCkpLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDBcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0QWNjZXNzaWJpbGl0eVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblxuXHRcdFx0bGV0IGl0ZW0gPSBhcmdzWzBdO1xuXHRcdFx0aWYgKGlzQ2hhdEVkaXRpbmdBY3Rpb25Db250ZXh0KGl0ZW0pKSB7XG5cdFx0XHRcdC8vIFJlc29sdmUgY2hhdCBlZGl0aW5nIGFjdGlvbiBjb250ZXh0IHRvIHRoZSBsYXN0IHJlc3BvbnNlIFZNXG5cdFx0XHRcdGl0ZW0gPSBjaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShpdGVtLnNlc3Npb25SZXNvdXJjZSk/LnZpZXdNb2RlbD8uZ2V0SXRlbXMoKS5hdCgtMSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzUmVzcG9uc2VWTShpdGVtKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoYXRNb2RlbCA9IGNoYXRTZXJ2aWNlLmdldFNlc3Npb24oaXRlbS5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgY2hhdFJlcXVlc3RzID0gY2hhdE1vZGVsPy5nZXRSZXF1ZXN0cygpO1xuXHRcdFx0aWYgKCFjaGF0UmVxdWVzdHMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXRlbUluZGV4ID0gY2hhdFJlcXVlc3RzPy5maW5kSW5kZXgocmVxdWVzdCA9PiByZXF1ZXN0LmlkID09PSBpdGVtLnJlcXVlc3RJZCk7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSBjaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShpdGVtLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBtb2RlID0gd2lkZ2V0Py5pbnB1dC5jdXJyZW50TW9kZUtpbmQ7XG5cdFx0XHRpZiAoY2hhdE1vZGVsICYmIChtb2RlID09PSBDaGF0TW9kZUtpbmQuRWRpdCB8fCBtb2RlID09PSBDaGF0TW9kZUtpbmQuQWdlbnQpKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRFZGl0aW5nU2Vzc2lvbiA9IHdpZGdldD8udmlld01vZGVsPy5tb2RlbC5lZGl0aW5nU2Vzc2lvbjtcblx0XHRcdFx0aWYgKCFjdXJyZW50RWRpdGluZ1Nlc3Npb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBQcm9tcHQgaWYgdGhlIGxhc3QgcmVxdWVzdCBtb2RpZmllZCB0aGUgd29ya2luZyBzZXQgYW5kIHRoZSB1c2VyIGhhc24ndCBhbHJlYWR5IGRpc2FibGVkIHRoZSBkaWFsb2dcblx0XHRcdFx0Y29uc3QgZW50cmllc01vZGlmaWVkSW5MYXN0UmVxdWVzdCA9IGN1cnJlbnRFZGl0aW5nU2Vzc2lvbi5lbnRyaWVzLmdldCgpLmZpbHRlcigoZW50cnkpID0+IGVudHJ5Lmxhc3RNb2RpZnlpbmdSZXF1ZXN0SWQgPT09IGl0ZW0ucmVxdWVzdElkKTtcblx0XHRcdFx0Y29uc3Qgc2hvdWxkUHJvbXB0ID0gZW50cmllc01vZGlmaWVkSW5MYXN0UmVxdWVzdC5sZW5ndGggPiAwICYmIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdjaGF0LmVkaXRpbmcuY29uZmlybUVkaXRSZXF1ZXN0UmV0cnknKSA9PT0gdHJ1ZTtcblx0XHRcdFx0Y29uc3QgY29uZmlybWF0aW9uID0gc2hvdWxkUHJvbXB0XG5cdFx0XHRcdFx0PyBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0LnJldHJ5TGFzdC5jb25maXJtYXRpb24udGl0bGUyJywgXCJEbyB5b3Ugd2FudCB0byByZXRyeSB5b3VyIGxhc3QgcmVxdWVzdD9cIiksXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBlbnRyaWVzTW9kaWZpZWRJbkxhc3RSZXF1ZXN0Lmxlbmd0aCA9PT0gMVxuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnJldHJ5LmNvbmZpcm1hdGlvbi5tZXNzYWdlMicsIFwiVGhpcyB3aWxsIHVuZG8gZWRpdHMgbWFkZSB0byB7MH0gc2luY2UgdGhpcyByZXF1ZXN0LlwiLCBiYXNlbmFtZShlbnRyaWVzTW9kaWZpZWRJbkxhc3RSZXF1ZXN0WzBdLm1vZGlmaWVkVVJJKSlcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5yZXRyeUxhc3QuY29uZmlybWF0aW9uLm1lc3NhZ2UyJywgXCJUaGlzIHdpbGwgdW5kbyBlZGl0cyBtYWRlIHRvIHswfSBmaWxlcyBpbiB5b3VyIHdvcmtpbmcgc2V0IHNpbmNlIHRoaXMgcmVxdWVzdC4gRG8geW91IHdhbnQgdG8gcHJvY2VlZD9cIiwgZW50cmllc01vZGlmaWVkSW5MYXN0UmVxdWVzdC5sZW5ndGgpLFxuXHRcdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2NoYXQucmV0cnkuY29uZmlybWF0aW9uLnByaW1hcnlCdXR0b24nLCBcIlllc1wiKSxcblx0XHRcdFx0XHRcdGNoZWNrYm94OiB7IGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5yZXRyeS5jb25maXJtYXRpb24uY2hlY2tib3gnLCBcIkRvbid0IGFzayBhZ2FpblwiKSwgY2hlY2tlZDogZmFsc2UgfSxcblx0XHRcdFx0XHRcdHR5cGU6ICdpbmZvJ1xuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0OiB7IGNvbmZpcm1lZDogdHJ1ZSB9O1xuXG5cdFx0XHRcdGlmICghY29uZmlybWF0aW9uLmNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjb25maXJtYXRpb24uY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2NoYXQuZWRpdGluZy5jb25maXJtRWRpdFJlcXVlc3RSZXRyeScsIGZhbHNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlc2V0IHRoZSBzbmFwc2hvdCB0byB0aGUgZmlyc3Qgc3RvcCAodW5kZWZpbmVkIHVuZG8gaW5kZXgpXG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90UmVxdWVzdCA9IGNoYXRSZXF1ZXN0c1tpdGVtSW5kZXhdO1xuXHRcdFx0XHRpZiAoc25hcHNob3RSZXF1ZXN0KSB7XG5cdFx0XHRcdFx0YXdhaXQgY3VycmVudEVkaXRpbmdTZXNzaW9uLnJlc3RvcmVTbmFwc2hvdChzbmFwc2hvdFJlcXVlc3QuaWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBjaGF0TW9kZWw/LmdldFJlcXVlc3RzKCkuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkID09PSBpdGVtLnJlcXVlc3RJZCk7XG5cblx0XHRcdGNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZS5hY2NlcHRSZXF1ZXN0KGl0ZW0uc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGNoYXRTZXJ2aWNlLnJlc2VuZFJlcXVlc3QocmVxdWVzdCEsIHtcblx0XHRcdFx0Li4ud2lkZ2V0Py5nZXRTZWxlY3RlZE1vZGVsUmVxdWVzdE9wdGlvbnMoKSxcblx0XHRcdFx0YXR0ZW1wdDogKHJlcXVlc3Q/LmF0dGVtcHQgPz8gLTEpICsgMSxcblx0XHRcdFx0Li4ud2lkZ2V0Py5nZXRNb2RlUmVxdWVzdE9wdGlvbnMoKSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEluc2VydFRvTm90ZWJvb2tBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuaW5zZXJ0SW50b05vdGVib29rJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUuaW5zZXJ0SW50b05vdGVib29rLmxhYmVsJywgXCJJbnNlcnQgaW50byBOb3RlYm9va1wiKSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5pbnNlcnQsXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRNZXNzYWdlRm9vdGVyLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsIENoYXRDb250ZXh0S2V5cy5pc1Jlc3BvbnNlLCBDaGF0Q29udGV4dEtleXMucmVzcG9uc2VJc0ZpbHRlcmVkLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudC5uZWdhdGUoKSlcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSBhcmdzWzBdO1xuXHRcdFx0aWYgKCFpc1Jlc3BvbnNlVk0oaXRlbSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdFx0aWYgKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0SWQoKSA9PT0gTk9URUJPT0tfRURJVE9SX0lEKSB7XG5cdFx0XHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lLmdldENvbnRyb2woKSBhcyBJTm90ZWJvb2tFZGl0b3I7XG5cblx0XHRcdFx0aWYgKCFub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG5vdGVib29rRWRpdG9yLmlzUmVhZE9ubHkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IGl0ZW0ucmVzcG9uc2UudG9TdHJpbmcoKTtcblx0XHRcdFx0Y29uc3Qgc3BsaXRDb250ZW50cyA9IHNwbGl0TWFya2Rvd25BbmRDb2RlQmxvY2tzKHZhbHVlKTtcblxuXHRcdFx0XHRjb25zdCBmb2N1c1JhbmdlID0gbm90ZWJvb2tFZGl0b3IuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBNYXRoLm1heChmb2N1c1JhbmdlLmVuZCwgMCk7XG5cdFx0XHRcdGNvbnN0IGJ1bGtFZGl0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQnVsa0VkaXRTZXJ2aWNlKTtcblxuXHRcdFx0XHRhd2FpdCBidWxrRWRpdFNlcnZpY2UuYXBwbHkoXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0bmV3IFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdChub3RlYm9va0VkaXRvci50ZXh0TW9kZWwudXJpLFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdFx0XHRcdGluZGV4OiBpbmRleCxcblx0XHRcdFx0XHRcdFx0XHRjb3VudDogMCxcblx0XHRcdFx0XHRcdFx0XHRjZWxsczogc3BsaXRDb250ZW50cy5tYXAoY29udGVudCA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBraW5kID0gY29udGVudC50eXBlID09PSAnbWFya2Rvd24nID8gQ2VsbEtpbmQuTWFya3VwIDogQ2VsbEtpbmQuQ29kZTtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGxhbmd1YWdlID0gY29udGVudC50eXBlID09PSAnbWFya2Rvd24nID8gJ21hcmtkb3duJyA6IGNvbnRlbnQubGFuZ3VhZ2U7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBtaW1lID0gY29udGVudC50eXBlID09PSAnbWFya2Rvd24nID8gJ3RleHQvbWFya2Rvd24nIDogYHRleHQveC0ke2NvbnRlbnQubGFuZ3VhZ2V9YDtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNlbGxLaW5kOiBraW5kLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRsYW5ndWFnZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0bWltZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0c291cmNlOiBjb250ZW50LmNvbnRlbnQsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRtZXRhZGF0YToge31cblx0XHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0eyBxdW90YWJsZUxhYmVsOiAnSW5zZXJ0IGludG8gTm90ZWJvb2snIH1cblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xufVxuXG5pbnRlcmZhY2UgTWFya2Rvd25Db250ZW50IHtcblx0dHlwZTogJ21hcmtkb3duJztcblx0Y29udGVudDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQ29kZUNvbnRlbnQge1xuXHR0eXBlOiAnY29kZSc7XG5cdGxhbmd1YWdlOiBzdHJpbmc7XG5cdGNvbnRlbnQ6IHN0cmluZztcbn1cblxudHlwZSBDb250ZW50ID0gTWFya2Rvd25Db250ZW50IHwgQ29kZUNvbnRlbnQ7XG5cbmZ1bmN0aW9uIHNwbGl0TWFya2Rvd25BbmRDb2RlQmxvY2tzKG1hcmtkb3duOiBzdHJpbmcpOiBDb250ZW50W10ge1xuXHRjb25zdCBsZXhlciA9IG5ldyBtYXJrZWQuTGV4ZXIoKTtcblx0Y29uc3QgdG9rZW5zID0gbGV4ZXIubGV4KG1hcmtkb3duKTtcblxuXHRjb25zdCBzcGxpdENvbnRlbnQ6IENvbnRlbnRbXSA9IFtdO1xuXG5cdGxldCBtYXJrZG93blBhcnQgPSAnJztcblx0dG9rZW5zLmZvckVhY2goKHRva2VuKSA9PiB7XG5cdFx0aWYgKHRva2VuLnR5cGUgPT09ICdjb2RlJykge1xuXHRcdFx0aWYgKG1hcmtkb3duUGFydC50cmltKCkpIHtcblx0XHRcdFx0c3BsaXRDb250ZW50LnB1c2goeyB0eXBlOiAnbWFya2Rvd24nLCBjb250ZW50OiBtYXJrZG93blBhcnQgfSk7XG5cdFx0XHRcdG1hcmtkb3duUGFydCA9ICcnO1xuXHRcdFx0fVxuXHRcdFx0c3BsaXRDb250ZW50LnB1c2goe1xuXHRcdFx0XHR0eXBlOiAnY29kZScsXG5cdFx0XHRcdGxhbmd1YWdlOiB0b2tlbi5sYW5nIHx8ICcnLFxuXHRcdFx0XHRjb250ZW50OiB0b2tlbi50ZXh0LFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1hcmtkb3duUGFydCArPSB0b2tlbi5yYXc7XG5cdFx0fVxuXHR9KTtcblxuXHRpZiAobWFya2Rvd25QYXJ0LnRyaW0oKSkge1xuXHRcdHNwbGl0Q29udGVudC5wdXNoKHsgdHlwZTogJ21hcmtkb3duJywgY29udGVudDogbWFya2Rvd25QYXJ0IH0pO1xuXHR9XG5cblx0cmV0dXJuIHNwbGl0Q29udGVudDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5Q0FBeUM7QUFFbEQsU0FBUyxjQUFjLFVBQVUsMEJBQTBCO0FBQzNELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUNBQW1DLGtDQUFrQztBQUM5RSxTQUFTLHdCQUF3QixvQkFBb0I7QUFDckQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkIsMEJBQTBCO0FBQzlELFNBQVMscUJBQXFCO0FBRXZCLE1BQU0sc0JBQXNCO0FBQzVCLE1BQU0sd0JBQXdCO0FBQ3JDLE1BQU0sdUJBQXVCO0FBRXRCLFNBQVMsMkJBQTJCO0FBQzFDLGtCQUFnQixNQUFNLDBCQUEwQixRQUFRO0FBQUEsSUFDdkQsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNK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
