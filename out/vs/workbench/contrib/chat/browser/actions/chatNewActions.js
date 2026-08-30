import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { ChatContextKeyExprs, ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ChatAgentLocation, ChatModeKind } from "../../common/constants.js";
import { ChatViewId, IChatWidgetService } from "../chat.js";
import { IVoiceSessionController } from "../voiceClient/voiceSessionController.js";
import { EditingSessionAction, getEditingSessionContext } from "../chatEditing/chatEditingActions.js";
import { ACTION_ID_NEW_CHAT, ACTION_ID_NEW_EDIT_SESSION, CHAT_CATEGORY, clearChatSessionPreservingType, handleCurrentEditingSession } from "./chatActions.js";
import { clearChatEditor } from "./chatClear.js";
import { AgentSessionProviders, AgentSessionsViewerOrientation } from "../agentSessions/agentSessions.js";
function isNewEditSessionActionContext(arg) {
  if (arg && typeof arg === "object") {
    const obj = arg;
    if (obj.inputValue !== void 0 && typeof obj.inputValue !== "string") {
      return false;
    }
    if (obj.agentMode !== void 0 && typeof obj.agentMode !== "boolean") {
      return false;
    }
    if (obj.isPartialQuery !== void 0 && typeof obj.isPartialQuery !== "boolean") {
      return false;
    }
    return true;
  }
  return false;
}
function registerNewChatActions() {
  MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
    submenu: MenuId.ChatNewMenu,
    title: localize2("chat.newEdits.label", "New Chat"),
    icon: Codicon.plus,
    when: ContextKeyExpr.equals("view", ChatViewId),
    group: "navigation",
    order: -1,
    isSplitButton: true
  });
  registerAction2(class NewChatEditorAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chatEditor.newChat",
        title: localize2("chat.newChat.label", "New Chat"),
        icon: Codicon.plus,
        f1: false,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor, ...args) {
      await clearChatEditor(accessor);
    }
  });
  registerAction2(
    class NewChatAction extends Action2 {
      constructor() {
        super({
          id: ACTION_ID_NEW_CHAT,
          title: localize2("chat.newEdits.label", "New Chat"),
          category: CHAT_CATEGORY,
          icon: Codicon.plus,
          precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
          f1: true,
          menu: [
            {
              id: MenuId.ChatContext,
              group: "z_clear"
            },
            {
              id: MenuId.ChatNewMenu,
              group: "1_open",
              order: 1,
              when: ContextKeyExpr.and(
                ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo("copilot"),
                ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo("new-session"),
                ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo("comment")
              )
            }
          ],
          keybinding: {
            weight: KeybindingWeight.WorkbenchContrib + 1,
            primary: KeyMod.CtrlCmd | KeyCode.KeyN,
            secondary: [KeyMod.CtrlCmd | KeyCode.KeyL],
            mac: {
              primary: KeyMod.CtrlCmd | KeyCode.KeyN,
              secondary: [KeyMod.WinCtrl | KeyCode.KeyL]
            },
            when: ChatContextKeys.inChatSession
          }
        });
      }
      async run(accessor, ...args) {
        const executeCommandContext = isNewEditSessionActionContext(args[0]) ? args[0] : void 0;
        const context = getEditingSessionContext(accessor, args);
        await runNewChatAction(accessor, context, executeCommandContext);
      }
    }
  );
  const iconVariants = [
    { idSuffix: ".copilotIcon", iconValue: "copilot", icon: Codicon.copilot },
    { idSuffix: ".newSessionIcon", iconValue: "new-session", icon: Codicon.newSession },
    { idSuffix: ".commentIcon", iconValue: "comment", icon: Codicon.comment }
  ];
  for (const variant of iconVariants) {
    registerAction2(class extends Action2 {
      constructor() {
        super({
          id: ACTION_ID_NEW_CHAT + variant.idSuffix,
          title: localize2("chat.newEdits.label", "New Chat"),
          category: CHAT_CATEGORY,
          icon: variant.icon,
          precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
          f1: false,
          menu: [{
            id: MenuId.ChatNewMenu,
            group: "1_open",
            order: 1,
            when: ChatContextKeys.newChatButtonExperimentIcon.isEqualTo(variant.iconValue)
          }]
        });
      }
      async run(accessor, ...args) {
        const executeCommandContext = isNewEditSessionActionContext(args[0]) ? args[0] : void 0;
        const context = getEditingSessionContext(accessor, args);
        await runNewChatAction(accessor, context, executeCommandContext);
      }
    });
  }
  CommandsRegistry.registerCommandAlias(ACTION_ID_NEW_EDIT_SESSION, ACTION_ID_NEW_CHAT);
  registerAction2(class NewLocalChatAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.newLocalChat",
        title: localize2("chat.newLocalChat.label", "New Local Chat"),
        category: CHAT_CATEGORY,
        icon: Codicon.plus,
        precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
        f1: false
      });
    }
    async run(accessor, ...args) {
      const executeCommandContext = isNewEditSessionActionContext(args[0]) ? args[0] : void 0;
      const context = getEditingSessionContext(accessor, args);
      if (!context?.chatWidget) {
        const view = await accessor.get(IViewsService).openView(ChatViewId, true);
        await view?.startNewLocalSession();
        view?.focusInput();
        return;
      }
      await runNewChatAction(accessor, context, executeCommandContext, AgentSessionProviders.Local);
    }
  });
  MenuRegistry.appendMenuItem(MenuId.ChatViewSessionTitleNavigationToolbar, {
    command: {
      id: ACTION_ID_NEW_CHAT,
      title: localize2("chat.goBack", "Go Back"),
      icon: Codicon.arrowLeft
    },
    when: ChatContextKeys.agentSessionsViewerOrientation.notEqualsTo(AgentSessionsViewerOrientation.SideBySide),
    // when sessions show side by side, no need for a back button
    group: "navigation",
    order: 1
  });
  MenuRegistry.appendMenuItem(MenuId.ChatTitleBarMenu, {
    command: {
      id: ACTION_ID_NEW_CHAT,
      title: localize2("chat.newEdits.label", "New Chat")
    },
    when: ChatContextKeys.enabled,
    group: "b_new",
    order: -1
  });
  registerAction2(class UndoChatEditInteractionAction extends EditingSessionAction {
    constructor() {
      super({
        id: "workbench.action.chat.undoEdit",
        title: localize2("chat.undoEdit.label", "Undo Last Edit"),
        category: CHAT_CATEGORY,
        icon: Codicon.discard,
        precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanUndo, ChatContextKeys.enabled),
        f1: true,
        menu: [{
          id: MenuId.ViewTitle,
          when: ContextKeyExpr.equals("view", ChatViewId),
          group: "navigation",
          order: -3,
          isHiddenByDefault: true
        }]
      });
    }
    async runEditingSessionAction(accessor, editingSession) {
      await editingSession.undoInteraction();
    }
  });
  registerAction2(class RedoChatEditInteractionAction extends EditingSessionAction {
    constructor() {
      super({
        id: "workbench.action.chat.redoEdit",
        title: localize2("chat.redoEdit.label", "Redo Last Edit"),
        category: CHAT_CATEGORY,
        icon: Codicon.redo,
        precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanRedo, ChatContextKeys.enabled),
        f1: true,
        menu: [
          {
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", ChatViewId),
            group: "navigation",
            order: -2,
            isHiddenByDefault: true
          }
        ]
      });
    }
    async runEditingSessionAction(accessor, editingSession) {
      const chatService = accessor.get(IChatService);
      await editingSession.redoInteraction();
      chatService.getSession(editingSession.chatSessionResource)?.setCheckpoint(void 0);
    }
  });
  registerAction2(class RedoChatCheckpoints extends EditingSessionAction {
    constructor() {
      super({
        id: "workbench.action.chat.redoEdit2",
        title: localize2("chat.redoEdit.label2", "Redo"),
        tooltip: localize2("chat.redoEdit.tooltip", "Reapply discarded workspace changes and chat"),
        category: CHAT_CATEGORY,
        precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanRedo, ChatContextKeys.enabled),
        f1: true,
        menu: [{
          id: MenuId.ChatMessageRestoreCheckpoint,
          when: ContextKeyExpr.or(ChatContextKeys.lockedToCodingAgent.negate(), ChatContextKeyExprs.isAgentHostSession),
          group: "navigation",
          order: -1
        }]
      });
    }
    async runEditingSessionAction(accessor, editingSession) {
      const widget = accessor.get(IChatWidgetService);
      while (editingSession.canRedo.get()) {
        await editingSession.redoInteraction();
      }
      const currentWidget = widget.getWidgetBySessionResource(editingSession.chatSessionResource);
      const requestText = currentWidget?.viewModel?.model.checkpoint?.message.text;
      if (currentWidget?.inputEditor.getValue() === requestText) {
        currentWidget?.input.setValue("", false);
      }
      currentWidget?.viewModel?.model.setCheckpoint(void 0);
      currentWidget?.focusInput();
    }
  });
}
async function runNewChatAction(accessor, context, executeCommandContext, sessionType) {
  const accessibilityService = accessor.get(IAccessibilityService);
  const instantiationService = accessor.get(IInstantiationService);
  const { editingSession, chatWidget: widget } = context ?? {};
  if (!widget) {
    return;
  }
  const voiceSessionController = accessor.get(IVoiceSessionController);
  const voiceTarget = voiceSessionController.targetSession.get();
  const currentSession = widget.viewModel?.sessionResource;
  const dialogService = accessor.get(IDialogService);
  const model = widget.viewModel?.model;
  if (model && !await handleCurrentEditingSession(model, void 0, dialogService)) {
    return;
  }
  await editingSession?.stop();
  await instantiationService.invokeFunction(clearChatSessionPreservingType, widget, sessionType);
  const newSession = widget.viewModel?.sessionResource;
  if ((voiceSessionController.isConnected.get() || voiceSessionController.isConnecting.get()) && (!voiceTarget || !!currentSession && isEqual(voiceTarget, currentSession)) && newSession) {
    voiceSessionController.setTargetSession(newSession);
  }
  widget.attachmentModel.clear(true);
  widget.focusInput();
  accessibilityService.alert(localize("newChat", "New chat"));
  if (!executeCommandContext) {
    return;
  }
  if (typeof executeCommandContext.agentMode === "boolean") {
    widget.input.setChatMode(executeCommandContext.agentMode ? ChatModeKind.Agent : ChatModeKind.Edit);
  } else if (widget.input.currentModeKind === ChatModeKind.Edit) {
    widget.input.setChatMode(ChatModeKind.Agent);
  }
  if (executeCommandContext.inputValue) {
    if (executeCommandContext.isPartialQuery) {
      widget.setInput(executeCommandContext.inputValue);
    } else {
      widget.acceptInput(executeCommandContext.inputValue);
    }
  }
}
export {
  registerNewChatActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXROZXdBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5RXhwcnMsIENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld0lkLCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IElWb2ljZVNlc3Npb25Db250cm9sbGVyIH0gZnJvbSAnLi4vdm9pY2VDbGllbnQvdm9pY2VTZXNzaW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld1BhbmUgfSBmcm9tICcuLi93aWRnZXRIb3N0cy92aWV3UGFuZS9jaGF0Vmlld1BhbmUuanMnO1xuaW1wb3J0IHsgRWRpdGluZ1Nlc3Npb25BY3Rpb24sIEVkaXRpbmdTZXNzaW9uQWN0aW9uQ29udGV4dCwgZ2V0RWRpdGluZ1Nlc3Npb25Db250ZXh0IH0gZnJvbSAnLi4vY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdBY3Rpb25zLmpzJztcbmltcG9ydCB7IEFDVElPTl9JRF9ORVdfQ0hBVCwgQUNUSU9OX0lEX05FV19FRElUX1NFU1NJT04sIENIQVRfQ0FURUdPUlksIGNsZWFyQ2hhdFNlc3Npb25QcmVzZXJ2aW5nVHlwZSwgaGFuZGxlQ3VycmVudEVkaXRpbmdTZXNzaW9uIH0gZnJvbSAnLi9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjbGVhckNoYXRFZGl0b3IgfSBmcm9tICcuL2NoYXRDbGVhci5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25Qcm92aWRlcnMsIEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9ucy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5ld0VkaXRTZXNzaW9uQWN0aW9uQ29udGV4dCB7XG5cblx0LyoqXG5cdCAqIEFuIGluaXRpYWwgcHJvbXB0IHRvIHdyaXRlIHRvIHRoZSBjaGF0LlxuXHQgKi9cblx0aW5wdXRWYWx1ZT86IHN0cmluZztcblxuXHQvKipcblx0ICogU2VsZWN0cyBvcGVuaW5nIGluIGFnZW50IG1vZGUgb3Igbm90LiBJZiBub3Qgc2V0LCB0aGUgY3VycmVudCBtb2RlIGlzIHVzZWQuXG5cdCAqIFRoaXMgaXMgaWdub3JlZCB3aGVuIGNvbWluZyBmcm9tIGEgY2hhdCB2aWV3IHRpdGxlIGNvbnRleHQuXG5cdCAqL1xuXHRhZ2VudE1vZGU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBpbnB1dFZhbHVlIGlzIHBhcnRpYWwgYW5kIHNob3VsZCB3YWl0IGZvciBmdXJ0aGVyIHVzZXIgaW5wdXQuXG5cdCAqIElmIGZhbHNlIG9yIG5vdCBzZXQsIHRoZSBwcm9tcHQgaXMgc2VudCBpbW1lZGlhdGVseS5cblx0ICovXG5cdGlzUGFydGlhbFF1ZXJ5PzogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gaXNOZXdFZGl0U2Vzc2lvbkFjdGlvbkNvbnRleHQoYXJnOiB1bmtub3duKTogYXJnIGlzIElOZXdFZGl0U2Vzc2lvbkFjdGlvbkNvbnRleHQge1xuXHRpZiAoYXJnICYmIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnKSB7XG5cdFx0Y29uc3Qgb2JqID0gYXJnIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGlmIChvYmouaW5wdXRWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiBvYmouaW5wdXRWYWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKG9iai5hZ2VudE1vZGUgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2Ygb2JqLmFnZW50TW9kZSAhPT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChvYmouaXNQYXJ0aWFsUXVlcnkgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2Ygb2JqLmlzUGFydGlhbFF1ZXJ5ICE9PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJOZXdDaGF0QWN0aW9ucygpIHtcblxuXHQvLyBBZGQgXCJOZXcgQ2hhdFwiIHN1Ym1lbnUgdG8gQ2hhdCB2aWV3IG1lbnVcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5WaWV3VGl0bGUsIHtcblx0XHRzdWJtZW51OiBNZW51SWQuQ2hhdE5ld01lbnUsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5uZXdFZGl0cy5sYWJlbCcsIFwiTmV3IENoYXRcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5wbHVzLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIENoYXRWaWV3SWQpLFxuXHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0b3JkZXI6IC0xLFxuXHRcdGlzU3BsaXRCdXR0b246IHRydWVcblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5ld0NoYXRFZGl0b3JBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXRFZGl0b3IubmV3Q2hhdCcsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQubmV3Q2hhdC5sYWJlbCcsIFwiTmV3IENoYXRcIiksXG5cdFx0XHRcdGljb246IENvZGljb24ucGx1cyxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRhd2FpdCBjbGVhckNoYXRFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5ld0NoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IEFDVElPTl9JRF9ORVdfQ0hBVCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5uZXdFZGl0cy5sYWJlbCcsIFwiTmV3IENoYXRcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnBsdXMsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdG1lbnU6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRDb250ZXh0LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICd6X2NsZWFyJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0TmV3TWVudSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnMV9vcGVuJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubmV3Q2hhdEJ1dHRvbkV4cGVyaW1lbnRJY29uLm5vdEVxdWFsc1RvKCdjb3BpbG90JyksXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5uZXdDaGF0QnV0dG9uRXhwZXJpbWVudEljb24ubm90RXF1YWxzVG8oJ25ldy1zZXNzaW9uJyksXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5uZXdDaGF0QnV0dG9uRXhwZXJpbWVudEljb24ubm90RXF1YWxzVG8oJ2NvbW1lbnQnKVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Tixcblx0XHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5TF0sXG5cdFx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Tixcblx0XHRcdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlMXVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb25cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRcdGNvbnN0IGV4ZWN1dGVDb21tYW5kQ29udGV4dCA9IGlzTmV3RWRpdFNlc3Npb25BY3Rpb25Db250ZXh0KGFyZ3NbMF0pID8gYXJnc1swXSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gQ29udGV4dCBmcm9tIHRvb2xiYXIgb3IgbGFzdEZvY3VzZWRXaWRnZXRcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBnZXRFZGl0aW5nU2Vzc2lvbkNvbnRleHQoYWNjZXNzb3IsIGFyZ3MpO1xuXHRcdFx0YXdhaXQgcnVuTmV3Q2hhdEFjdGlvbihhY2Nlc3NvciwgY29udGV4dCwgZXhlY3V0ZUNvbW1hbmRDb250ZXh0KTtcblx0XHR9XG5cdH1cblx0KTtcblxuXHRjb25zdCBpY29uVmFyaWFudHMgPSBbXG5cdFx0eyBpZFN1ZmZpeDogJy5jb3BpbG90SWNvbicsIGljb25WYWx1ZTogJ2NvcGlsb3QnLCBpY29uOiBDb2RpY29uLmNvcGlsb3QgfSxcblx0XHR7IGlkU3VmZml4OiAnLm5ld1Nlc3Npb25JY29uJywgaWNvblZhbHVlOiAnbmV3LXNlc3Npb24nLCBpY29uOiBDb2RpY29uLm5ld1Nlc3Npb24gfSxcblx0XHR7IGlkU3VmZml4OiAnLmNvbW1lbnRJY29uJywgaWNvblZhbHVlOiAnY29tbWVudCcsIGljb246IENvZGljb24uY29tbWVudCB9LFxuXHRdIGFzIGNvbnN0O1xuXG5cdGZvciAoY29uc3QgdmFyaWFudCBvZiBpY29uVmFyaWFudHMpIHtcblx0XHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IEFDVElPTl9JRF9ORVdfQ0hBVCArIHZhcmlhbnQuaWRTdWZmaXgsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5uZXdFZGl0cy5sYWJlbCcsIFwiTmV3IENoYXRcIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdFx0aWNvbjogdmFyaWFudC5pY29uLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKSxcblx0XHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdE5ld01lbnUsXG5cdFx0XHRcdFx0XHRncm91cDogJzFfb3BlbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5uZXdDaGF0QnV0dG9uRXhwZXJpbWVudEljb24uaXNFcXVhbFRvKHZhcmlhbnQuaWNvblZhbHVlKVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0XHRjb25zdCBleGVjdXRlQ29tbWFuZENvbnRleHQgPSBpc05ld0VkaXRTZXNzaW9uQWN0aW9uQ29udGV4dChhcmdzWzBdKSA/IGFyZ3NbMF0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGNvbnRleHQgPSBnZXRFZGl0aW5nU2Vzc2lvbkNvbnRleHQoYWNjZXNzb3IsIGFyZ3MpO1xuXHRcdFx0XHRhd2FpdCBydW5OZXdDaGF0QWN0aW9uKGFjY2Vzc29yLCBjb250ZXh0LCBleGVjdXRlQ29tbWFuZENvbnRleHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbGlhcyhBQ1RJT05fSURfTkVXX0VESVRfU0VTU0lPTiwgQUNUSU9OX0lEX05FV19DSEFUKTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3TG9jYWxDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm5ld0xvY2FsQ2hhdCcsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQubmV3TG9jYWxDaGF0LmxhYmVsJywgXCJOZXcgTG9jYWwgQ2hhdFwiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGljb246IENvZGljb24ucGx1cyxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsIENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5pc0VxdWFsVG8oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0Y29uc3QgZXhlY3V0ZUNvbW1hbmRDb250ZXh0ID0gaXNOZXdFZGl0U2Vzc2lvbkFjdGlvbkNvbnRleHQoYXJnc1swXSkgPyBhcmdzWzBdIDogdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBDb250ZXh0IGZyb20gdG9vbGJhciBvciBsYXN0Rm9jdXNlZFdpZGdldFxuXHRcdFx0Y29uc3QgY29udGV4dCA9IGdldEVkaXRpbmdTZXNzaW9uQ29udGV4dChhY2Nlc3NvciwgYXJncyk7XG5cblx0XHRcdC8vIFdoZW4gbm8gY2hhdCB3aWRnZXQgaXMgb3BlbiB5ZXQsIG9wZW5pbmcgdGhlIHZpZXcgcmVzb2x2ZXMgdGhlXG5cdFx0XHQvLyBjb21wdXRlZCBkZWZhdWx0IHByb3ZpZGVyIChhIG5vbi1sb2NhbCBoYXJuZXNzIHdoZW4gdGhlIGFnZW50IGhvc3Rcblx0XHRcdC8vIGlzIGVuYWJsZWQpLiBPcGVuIHRoZSB2aWV3LCB0aGVuIGV4cGxpY2l0bHkgc3RhcnQgYSBsb2NhbCBzZXNzaW9uOlxuXHRcdFx0Ly8gYHN0YXJ0TmV3TG9jYWxTZXNzaW9uYCBjYW5jZWxzIHRoYXQgaW4tZmxpZ2h0IGRlZmF1bHQgcmVzb2x1dGlvbiBzb1xuXHRcdFx0Ly8gdGhlIGxvY2FsIHJlcXVlc3QgaXMgaG9ub3JlZCB3aXRob3V0IHdhaXRpbmcgZm9yIHRoZSBhZ2VudCBob3N0LlxuXHRcdFx0aWYgKCFjb250ZXh0Py5jaGF0V2lkZ2V0KSB7XG5cdFx0XHRcdGNvbnN0IHZpZXcgPSBhd2FpdCBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkub3BlblZpZXcoQ2hhdFZpZXdJZCwgdHJ1ZSkgYXMgQ2hhdFZpZXdQYW5lIHwgbnVsbDtcblx0XHRcdFx0YXdhaXQgdmlldz8uc3RhcnROZXdMb2NhbFNlc3Npb24oKTtcblx0XHRcdFx0dmlldz8uZm9jdXNJbnB1dCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHJ1bk5ld0NoYXRBY3Rpb24oYWNjZXNzb3IsIGNvbnRleHQsIGV4ZWN1dGVDb21tYW5kQ29udGV4dCwgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsKTtcblx0XHR9XG5cdH0pO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ2hhdFZpZXdTZXNzaW9uVGl0bGVOYXZpZ2F0aW9uVG9vbGJhciwge1xuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiBBQ1RJT05fSURfTkVXX0NIQVQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LmdvQmFjaycsIFwiR28gQmFja1wiKSxcblx0XHRcdGljb246IENvZGljb24uYXJyb3dMZWZ0LFxuXHRcdH0sXG5cdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5ub3RFcXVhbHNUbyhBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU2lkZUJ5U2lkZSksIC8vIHdoZW4gc2Vzc2lvbnMgc2hvdyBzaWRlIGJ5IHNpZGUsIG5vIG5lZWQgZm9yIGEgYmFjayBidXR0b25cblx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdG9yZGVyOiAxXG5cdH0pO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ2hhdFRpdGxlQmFyTWVudSwge1xuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiBBQ1RJT05fSURfTkVXX0NIQVQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0Lm5ld0VkaXRzLmxhYmVsJywgXCJOZXcgQ2hhdFwiKSxcblx0XHR9LFxuXHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdGdyb3VwOiAnYl9uZXcnLFxuXHRcdG9yZGVyOiAtMSxcblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFVuZG9DaGF0RWRpdEludGVyYWN0aW9uQWN0aW9uIGV4dGVuZHMgRWRpdGluZ1Nlc3Npb25BY3Rpb24ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC51bmRvRWRpdCcsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQudW5kb0VkaXQubGFiZWwnLCBcIlVuZG8gTGFzdCBFZGl0XCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5kaXNjYXJkLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuY2hhdEVkaXRpbmdDYW5VbmRvLCBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCksXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIENoYXRWaWV3SWQpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IC0zLFxuXHRcdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW5FZGl0aW5nU2Vzc2lvbkFjdGlvbihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdGluZ1Nlc3Npb246IElDaGF0RWRpdGluZ1Nlc3Npb24pIHtcblx0XHRcdGF3YWl0IGVkaXRpbmdTZXNzaW9uLnVuZG9JbnRlcmFjdGlvbigpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlZG9DaGF0RWRpdEludGVyYWN0aW9uQWN0aW9uIGV4dGVuZHMgRWRpdGluZ1Nlc3Npb25BY3Rpb24ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5yZWRvRWRpdCcsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQucmVkb0VkaXQubGFiZWwnLCBcIlJlZG8gTGFzdCBFZGl0XCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5yZWRvLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuY2hhdEVkaXRpbmdDYW5SZWRvLCBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCksXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBDaGF0Vmlld0lkKSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogLTIsXG5cdFx0XHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuRWRpdGluZ1Nlc3Npb25BY3Rpb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRpbmdTZXNzaW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgZWRpdGluZ1Nlc3Npb24ucmVkb0ludGVyYWN0aW9uKCk7XG5cdFx0XHRjaGF0U2VydmljZS5nZXRTZXNzaW9uKGVkaXRpbmdTZXNzaW9uLmNoYXRTZXNzaW9uUmVzb3VyY2UpPy5zZXRDaGVja3BvaW50KHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVkb0NoYXRDaGVja3BvaW50cyBleHRlbmRzIEVkaXRpbmdTZXNzaW9uQWN0aW9uIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVkb0VkaXQyJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5yZWRvRWRpdC5sYWJlbDInLCBcIlJlZG9cIiksXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplMignY2hhdC5yZWRvRWRpdC50b29sdGlwJywgXCJSZWFwcGx5IGRpc2NhcmRlZCB3b3Jrc3BhY2UgY2hhbmdlcyBhbmQgY2hhdFwiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5jaGF0RWRpdGluZ0NhblJlZG8sIENoYXRDb250ZXh0S2V5cy5lbmFibGVkKSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0TWVzc2FnZVJlc3RvcmVDaGVja3BvaW50LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENoYXRDb250ZXh0S2V5cy5sb2NrZWRUb0NvZGluZ0FnZW50Lm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleUV4cHJzLmlzQWdlbnRIb3N0U2Vzc2lvbiksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogLTFcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJ1bkVkaXRpbmdTZXNzaW9uQWN0aW9uKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0aW5nU2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbikge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cblx0XHRcdHdoaWxlIChlZGl0aW5nU2Vzc2lvbi5jYW5SZWRvLmdldCgpKSB7XG5cdFx0XHRcdGF3YWl0IGVkaXRpbmdTZXNzaW9uLnJlZG9JbnRlcmFjdGlvbigpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXJyZW50V2lkZ2V0ID0gd2lkZ2V0LmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKGVkaXRpbmdTZXNzaW9uLmNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdFRleHQgPSBjdXJyZW50V2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLmNoZWNrcG9pbnQ/Lm1lc3NhZ2UudGV4dDtcblxuXHRcdFx0Ly8gaWYgdGhlIGlucHV0IGhhcyB0aGUgc2FtZSB0ZXh0IHRoYXQgd2UganVzdCByZXN0b3JlZCwgY2xlYXIgaXQuXG5cdFx0XHRpZiAoY3VycmVudFdpZGdldD8uaW5wdXRFZGl0b3IuZ2V0VmFsdWUoKSA9PT0gcmVxdWVzdFRleHQpIHtcblx0XHRcdFx0Y3VycmVudFdpZGdldD8uaW5wdXQuc2V0VmFsdWUoJycsIGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0Y3VycmVudFdpZGdldD8udmlld01vZGVsPy5tb2RlbC5zZXRDaGVja3BvaW50KHVuZGVmaW5lZCk7XG5cdFx0XHRjdXJyZW50V2lkZ2V0Py5mb2N1c0lucHV0KCk7XG5cdFx0fVxuXHR9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcnVuTmV3Q2hhdEFjdGlvbihcblx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdGNvbnRleHQ6IEVkaXRpbmdTZXNzaW9uQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCxcblx0ZXhlY3V0ZUNvbW1hbmRDb250ZXh0PzogSU5ld0VkaXRTZXNzaW9uQWN0aW9uQ29udGV4dCxcblx0c2Vzc2lvblR5cGU/OiBBZ2VudFNlc3Npb25Qcm92aWRlcnNcbikge1xuXHRjb25zdCBhY2Nlc3NpYmlsaXR5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWNjZXNzaWJpbGl0eVNlcnZpY2UpO1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdGNvbnN0IHsgZWRpdGluZ1Nlc3Npb24sIGNoYXRXaWRnZXQ6IHdpZGdldCB9ID0gY29udGV4dCA/PyB7fTtcblx0aWYgKCF3aWRnZXQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCB2b2ljZVNlc3Npb25Db250cm9sbGVyID0gYWNjZXNzb3IuZ2V0KElWb2ljZVNlc3Npb25Db250cm9sbGVyKTtcblx0Y29uc3Qgdm9pY2VUYXJnZXQgPSB2b2ljZVNlc3Npb25Db250cm9sbGVyLnRhcmdldFNlc3Npb24uZ2V0KCk7XG5cdGNvbnN0IGN1cnJlbnRTZXNzaW9uID0gd2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblxuXHRjb25zdCBtb2RlbCA9IHdpZGdldC52aWV3TW9kZWw/Lm1vZGVsO1xuXHRpZiAobW9kZWwgJiYgIShhd2FpdCBoYW5kbGVDdXJyZW50RWRpdGluZ1Nlc3Npb24obW9kZWwsIHVuZGVmaW5lZCwgZGlhbG9nU2VydmljZSkpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0YXdhaXQgZWRpdGluZ1Nlc3Npb24/LnN0b3AoKTtcblxuXHQvLyBDcmVhdGUgYSBuZXcgc2Vzc2lvbiwgcHJlc2VydmluZyB0aGUgc2Vzc2lvbiB0eXBlIChvciB1c2luZyB0aGUgc3BlY2lmaWVkIG9uZSlcblx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oY2xlYXJDaGF0U2Vzc2lvblByZXNlcnZpbmdUeXBlLCB3aWRnZXQsIHNlc3Npb25UeXBlKTtcblxuXHRjb25zdCBuZXdTZXNzaW9uID0gd2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRpZiAoKHZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCkgfHwgdm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RpbmcuZ2V0KCkpXG5cdFx0JiYgKCF2b2ljZVRhcmdldCB8fCAoISFjdXJyZW50U2Vzc2lvbiAmJiBpc0VxdWFsKHZvaWNlVGFyZ2V0LCBjdXJyZW50U2Vzc2lvbikpKVxuXHRcdCYmIG5ld1Nlc3Npb24pIHtcblx0XHR2b2ljZVNlc3Npb25Db250cm9sbGVyLnNldFRhcmdldFNlc3Npb24obmV3U2Vzc2lvbik7XG5cdH1cblxuXHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmNsZWFyKHRydWUpO1xuXHR3aWRnZXQuZm9jdXNJbnB1dCgpO1xuXG5cdGFjY2Vzc2liaWxpdHlTZXJ2aWNlLmFsZXJ0KGxvY2FsaXplKCduZXdDaGF0JywgXCJOZXcgY2hhdFwiKSk7XG5cblx0aWYgKCFleGVjdXRlQ29tbWFuZENvbnRleHQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRpZiAodHlwZW9mIGV4ZWN1dGVDb21tYW5kQ29udGV4dC5hZ2VudE1vZGUgPT09ICdib29sZWFuJykge1xuXHRcdHdpZGdldC5pbnB1dC5zZXRDaGF0TW9kZShleGVjdXRlQ29tbWFuZENvbnRleHQuYWdlbnRNb2RlID8gQ2hhdE1vZGVLaW5kLkFnZW50IDogQ2hhdE1vZGVLaW5kLkVkaXQpO1xuXHR9IGVsc2UgaWYgKHdpZGdldC5pbnB1dC5jdXJyZW50TW9kZUtpbmQgPT09IENoYXRNb2RlS2luZC5FZGl0KSB7XG5cdFx0d2lkZ2V0LmlucHV0LnNldENoYXRNb2RlKENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdH1cblxuXHRpZiAoZXhlY3V0ZUNvbW1hbmRDb250ZXh0LmlucHV0VmFsdWUpIHtcblx0XHRpZiAoZXhlY3V0ZUNvbW1hbmRDb250ZXh0LmlzUGFydGlhbFF1ZXJ5KSB7XG5cdFx0XHR3aWRnZXQuc2V0SW5wdXQoZXhlY3V0ZUNvbW1hbmRDb250ZXh0LmlucHV0VmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR3aWRnZXQuYWNjZXB0SW5wdXQoZXhlY3V0ZUNvbW1hbmRDb250ZXh0LmlucHV0VmFsdWUpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsZUFBZTtBQUV4QixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsU0FBUyxRQUFRLGNBQWMsdUJBQXVCO0FBQy9ELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCLHVCQUF1QjtBQUVyRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQixvQkFBb0I7QUFDaEQsU0FBUyxZQUFZLDBCQUEwQjtBQUMvQyxTQUFTLCtCQUErQjtBQUV4QyxTQUFTLHNCQUFtRCxnQ0FBZ0M7QUFDNUYsU0FBUyxvQkFBb0IsNEJBQTRCLGVBQWUsZ0NBQWdDLG1DQUFtQztBQUMzSSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QixzQ0FBc0M7QUFzQnRFLFNBQVMsOEJBQThCLEtBQW1EO0FBQ3pGLE1BQUksT0FBTyxPQUFPLFFBQVEsVUFBVTtBQUNuQyxVQUFNLE1BQU07QUFDWixRQUFJLElBQUksZUFBZSxVQUFhLE9BQU8sSUFBSSxlQUFlLFVBQVU7QUFDdkUsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLElBQUksY0FBYyxVQUFhLE9BQU8sSUFBSSxjQUFjLFdBQVc7QUFDdEUsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLElBQUksbUJBQW1CLFVBQWEsT0FBTyxJQUFJLG1CQUFtQixXQUFXO0FBQ2hGLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPO0FBQ1I7QUFF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
