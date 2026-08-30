import { localize, localize2 } from "../../../../../nls.js";
import { AgentSessionSection, isAgentHostAgentSessionItem, isAgentSessionSection, isLocalAgentSessionItem, isMarshalledAgentSessionContext } from "./agentSessionsModel.js";
import { Action2, MenuId, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { AGENT_SESSION_DELETE_ACTION_ID, AGENT_SESSION_RENAME_ACTION_ID, AgentSessionProviders, AgentSessionsViewerOrientation } from "./agentSessions.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { IChatSessionsService } from "../../common/chatSessionsService.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { ChatContextKeyExprs, ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { LocalChatSessionUri } from "../../common/model/chatUri.js";
import { ChatViewId, IChatWidgetService } from "../chat.js";
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, SIDE_GROUP } from "../../../../services/editor/common/editorService.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../common/views.js";
import { IWorkbenchLayoutService, Position } from "../../../../services/layout/browser/layoutService.js";
import { IAgentSessionsService } from "./agentSessionsService.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { showClearEditingSessionConfirmation } from "../widgetHosts/editor/chatEditorInput.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ChatConfiguration } from "../../common/constants.js";
import { ACTION_ID_NEW_CHAT } from "../actions/chatActions.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IsSessionsWindowContext } from "../../../../common/contextkeys.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { coalesce } from "../../../../../base/common/arrays.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IPaneCompositePartService } from "../../../../services/panecomposite/browser/panecomposite.js";
import { ChatSessionArchiveActionWording, getChatSessionArchiveActionPresentation } from "../../../../../platform/chat/common/sessionArchiveActions.js";
const AGENT_SESSIONS_CATEGORY = localize2("chatSessions", "Chat Agent Sessions");
class ToggleShowAgentSessionsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.toggleShowAgentSessions",
      title: localize2("chat.showSessions", "Show Sessions"),
      toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true),
      menu: {
        id: MenuId.ChatWelcomeContext,
        group: "0_sessions",
        order: 2,
        when: ChatContextKeys.inChatEditor.negate()
      }
    });
  }
  async run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const currentValue = configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled);
    await configurationService.updateValue(ChatConfiguration.ChatViewSessionsEnabled, !currentValue);
  }
}
const agentSessionsOrientationSubmenu = new MenuId("chatAgentSessionsOrientationSubmenu");
MenuRegistry.appendMenuItem(MenuId.ChatWelcomeContext, {
  submenu: agentSessionsOrientationSubmenu,
  title: localize2("chat.sessionsOrientation", "Sessions Orientation"),
  group: "0_sessions",
  order: 1,
  when: ChatContextKeys.inChatEditor.negate()
});
class SetAgentSessionsOrientationStackedAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.setAgentSessionsOrientationStacked",
      title: localize2("chat.sessionsOrientation.stacked", "Stacked"),
      toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsOrientation}`, "stacked"),
      precondition: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true),
      menu: {
        id: agentSessionsOrientationSubmenu,
        group: "navigation",
        order: 2
      }
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand(HideAgentSessionsSidebar.ID);
  }
}
class SetAgentSessionsOrientationSideBySideAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.setAgentSessionsOrientationSideBySide",
      title: localize2("chat.sessionsOrientation.sideBySide", "Side by Side"),
      toggled: ContextKeyExpr.notEquals(`config.${ChatConfiguration.ChatViewSessionsOrientation}`, "stacked"),
      precondition: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true),
      menu: {
        id: agentSessionsOrientationSubmenu,
        group: "navigation",
        order: 1
      }
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand(ShowAgentSessionsSidebar.ID);
  }
}
class BaseArchiveAllAgentSessionsAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).archiveAll;
    super({
      id: "workbench.action.chat.archiveAllAgentSessions",
      title: action.title,
      icon: action.icon,
      precondition: ChatContextKeys.enabled,
      category: AGENT_SESSIONS_CATEGORY,
      f1: true
    });
    this.wording = wording;
  }
  async run(accessor) {
    const agentSessionsService = accessor.get(IAgentSessionsService);
    const dialogService = accessor.get(IDialogService);
    const sessionsToArchive = agentSessionsService.model.sessions.filter((session) => !session.isArchived());
    if (sessionsToArchive.length === 0) {
      return;
    }
    const confirmed = await dialogService.confirm({
      message: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? sessionsToArchive.length === 1 ? localize("markAllSessionsDone.confirmSingle", "Are you sure you want to mark 1 agent session as done?") : localize("markAllSessionsDone.confirm", "Are you sure you want to mark {0} agent sessions as done?", sessionsToArchive.length) : sessionsToArchive.length === 1 ? localize("archiveAllSessions.confirmSingle", "Are you sure you want to archive 1 agent session?") : localize("archiveAllSessions.confirm", "Are you sure you want to archive {0} agent sessions?", sessionsToArchive.length),
      detail: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markAllSessionsDone.detail", "You can restore sessions later if needed from the sessions view.") : localize("archiveAllSessions.detail", "You can unarchive sessions later if needed from the sessions view."),
      primaryButton: getChatSessionArchiveActionPresentation(this.wording).archiveAll.title.value
    });
    if (!confirmed.confirmed) {
      return;
    }
    for (const session of sessionsToArchive) {
      session.setArchived(true);
    }
  }
}
class ArchiveAllAgentSessionsAction extends BaseArchiveAllAgentSessionsAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class MarkAllAgentSessionsDoneAction extends BaseArchiveAllAgentSessionsAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
class MarkAllAgentSessionsReadAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.markAllAgentSessionsRead",
      title: localize2("markAllRead.label", "Mark All as Read"),
      precondition: ChatContextKeys.enabled,
      category: AGENT_SESSIONS_CATEGORY,
      f1: true,
      menu: {
        id: MenuId.AgentSessionsContext,
        group: "0_read",
        order: 2,
        when: ChatContextKeys.isArchivedAgentSession.negate()
        // no read state for archived sessions
      }
    });
  }
  async run(accessor) {
    const agentSessionsService = accessor.get(IAgentSessionsService);
    const sessionsToMarkRead = agentSessionsService.model.sessions.filter((session) => !session.isArchived() && !session.isRead());
    if (sessionsToMarkRead.length === 0) {
      return;
    }
    for (const session of sessionsToMarkRead) {
      session.setRead(true);
    }
  }
}
const ConfirmArchiveStorageKey = "chat.sessions.confirmArchive";
class BaseArchiveAgentSessionSectionAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).archiveAll;
    super({
      id: "agentSessionSection.archive",
      title: action.title,
      icon: action.icon,
      menu: [{
        id: MenuId.AgentSessionSectionToolbar,
        group: "navigation",
        order: 1,
        when: ChatContextKeys.agentSessionSection.notEqualsTo(AgentSessionSection.Archived)
      }, {
        id: MenuId.AgentSessionSectionContext,
        group: "1_edit",
        order: 2,
        when: ChatContextKeys.agentSessionSection.notEqualsTo(AgentSessionSection.Archived)
      }]
    });
    this.wording = wording;
  }
  async run(accessor, context) {
    if (!context || !isAgentSessionSection(context)) {
      return;
    }
    const dialogService = accessor.get(IDialogService);
    const storageService = accessor.get(IStorageService);
    const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, StorageScope.PROFILE, false);
    if (!skipConfirmation) {
      const confirmed = await dialogService.confirm({
        message: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? context.sessions.length === 1 ? localize("markSectionSessionsDone.confirmSingle", "Are you sure you want to mark 1 agent session from '{0}' as done?", context.label) : localize("markSectionSessionsDone.confirm", "Are you sure you want to mark {0} agent sessions from '{1}' as done?", context.sessions.length, context.label) : context.sessions.length === 1 ? localize("archiveSectionSessions.confirmSingle", "Are you sure you want to archive 1 agent session from '{0}'?", context.label) : localize("archiveSectionSessions.confirm", "Are you sure you want to archive {0} agent sessions from '{1}'?", context.sessions.length, context.label),
        detail: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markSectionSessionsDone.detail", "You can restore sessions later if needed from the sessions view.") : localize("archiveSectionSessions.detail", "You can unarchive sessions later if needed from the sessions view."),
        primaryButton: getChatSessionArchiveActionPresentation(this.wording).archiveAll.title.value,
        checkbox: {
          label: localize("doNotAskAgain", "Do not ask me again")
        }
      });
      if (!confirmed.confirmed) {
        return;
      }
      if (confirmed.checkboxChecked) {
        storageService.store(ConfirmArchiveStorageKey, true, StorageScope.PROFILE, StorageTarget.USER);
      }
    }
    for (const session of context.sessions) {
      session.setArchived(true);
    }
  }
}
class ArchiveAgentSessionSectionAction extends BaseArchiveAgentSessionSectionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class MarkAgentSessionSectionDoneAction extends BaseArchiveAgentSessionSectionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
class BaseUnarchiveAgentSessionSectionAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).unarchiveAll;
    super({
      id: "agentSessionSection.unarchive",
      title: action.title,
      icon: action.icon,
      menu: [{
        id: MenuId.AgentSessionSectionToolbar,
        group: "navigation",
        order: 1,
        when: ChatContextKeys.agentSessionSection.isEqualTo(AgentSessionSection.Archived)
      }, {
        id: MenuId.AgentSessionSectionContext,
        group: "1_edit",
        order: 2,
        when: ChatContextKeys.agentSessionSection.isEqualTo(AgentSessionSection.Archived)
      }]
    });
    this.wording = wording;
  }
  async run(accessor, context) {
    if (!context || !isAgentSessionSection(context)) {
      return;
    }
    const dialogService = accessor.get(IDialogService);
    const storageService = accessor.get(IStorageService);
    if (context.sessions.length > 1) {
      const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, StorageScope.PROFILE, false);
      if (!skipConfirmation) {
        const confirmed = await dialogService.confirm({
          message: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("restoreSectionSessions.confirm", "Are you sure you want to restore {0} agent sessions?", context.sessions.length) : localize("unarchiveSectionSessions.confirm", "Are you sure you want to unarchive {0} agent sessions?", context.sessions.length),
          primaryButton: getChatSessionArchiveActionPresentation(this.wording).unarchiveAll.title.value,
          checkbox: {
            label: localize("doNotAskAgain", "Do not ask me again")
          }
        });
        if (!confirmed.confirmed) {
          return;
        }
        if (confirmed.checkboxChecked) {
          storageService.store(ConfirmArchiveStorageKey, true, StorageScope.PROFILE, StorageTarget.USER);
        }
      }
    }
    for (const session of context.sessions) {
      session.setArchived(false);
    }
  }
}
class UnarchiveAgentSessionSectionAction extends BaseUnarchiveAgentSessionSectionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class RestoreAgentSessionSectionAction extends BaseUnarchiveAgentSessionSectionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
class MarkAgentSessionSectionReadAction extends Action2 {
  constructor() {
    super({
      id: "agentSessionSection.markRead",
      title: localize2("markSectionRead", "Mark All as Read"),
      menu: [{
        id: MenuId.AgentSessionSectionContext,
        group: "1_edit",
        order: 1,
        when: ChatContextKeys.agentSessionSection.notEqualsTo(AgentSessionSection.Archived)
      }]
    });
  }
  async run(accessor, context) {
    if (!context || !isAgentSessionSection(context)) {
      return;
    }
    for (const session of context.sessions) {
      session.setRead(true);
    }
  }
}
class CollapseAllAgentSessionSectionsAction extends Action2 {
  constructor() {
    super({
      id: "agentSessionSection.collapseAll",
      title: localize2("collapseAll", "Collapse All"),
      menu: [{
        id: MenuId.AgentSessionSectionContext,
        group: "2_collapse",
        order: 1
      }]
    });
  }
  async run(accessor, _section, control) {
    control?.collapseAllSections();
  }
}
class BaseAgentSessionAction extends Action2 {
  async run(accessor, context) {
    const agentSessionsService = accessor.get(IAgentSessionsService);
    const viewsService = accessor.get(IViewsService);
    let sessions = [];
    if (isMarshalledAgentSessionContext(context)) {
      sessions = coalesce((context.sessions ?? [context.session]).map((session) => agentSessionsService.getSession(session.resource)));
    } else if (context) {
      sessions = [context];
    }
    if (sessions.length === 0) {
      const chatView = viewsService.getActiveViewWithId(ChatViewId);
      const focused = chatView?.getFocusedSessions().at(0);
      if (focused) {
        sessions = [focused];
      }
    }
    if (sessions.length > 0) {
      await this.runWithSessions(sessions, accessor);
    }
  }
}
class MarkAgentSessionUnreadAction extends BaseAgentSessionAction {
  constructor() {
    super({
      id: "agentSession.markUnread",
      title: localize2("markUnread", "Mark as Unread"),
      menu: {
        id: MenuId.AgentSessionsContext,
        group: "0_read",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.isReadAgentSession,
          ChatContextKeys.isArchivedAgentSession.negate()
          // no read state for archived sessions
        )
      }
    });
  }
  runWithSessions(sessions) {
    for (const session of sessions) {
      session.setRead(false);
    }
  }
}
class MarkAgentSessionReadAction extends BaseAgentSessionAction {
  constructor() {
    super({
      id: "agentSession.markRead",
      title: localize2("markRead", "Mark as Read"),
      menu: {
        id: MenuId.AgentSessionsContext,
        group: "0_read",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.isReadAgentSession.negate(),
          ChatContextKeys.isArchivedAgentSession.negate()
          // no read state for archived sessions
        )
      }
    });
  }
  runWithSessions(sessions) {
    for (const session of sessions) {
      session.setRead(true);
    }
  }
}
class BaseArchiveAgentSessionAction extends BaseAgentSessionAction {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).archive;
    super({
      id: "agentSession.archive",
      title: action.title,
      icon: action.icon,
      keybinding: {
        primary: KeyCode.Delete,
        mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
        weight: KeybindingWeight.WorkbenchContrib + 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.agentSessionsViewerFocused,
          ChatContextKeys.isArchivedAgentSession.negate()
        )
      },
      menu: [{
        id: MenuId.AgentSessionItemToolbar,
        group: "navigation",
        order: 1,
        when: ChatContextKeys.isArchivedAgentSession.negate()
      }, {
        id: MenuId.AgentSessionsContext,
        group: "1_edit",
        order: 2,
        when: ChatContextKeys.isArchivedAgentSession.negate()
      }]
    });
    this.wording = wording;
  }
  async runWithSessions(sessions, accessor) {
    const chatService = accessor.get(IChatService);
    const dialogService = accessor.get(IDialogService);
    for (const session of sessions) {
      const chatModel = chatService.getSession(session.resource);
      if (chatModel && !await showClearEditingSessionConfirmation(chatModel, dialogService, {
        isArchiveAction: true,
        titleOverride: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markSessionDone", "Mark chat as done with pending edits?") : localize("archiveSession", "Archive chat with pending edits?"),
        messageOverride: localize("archiveSessionDescription", "You have pending changes in this chat session.")
      })) {
        return;
      }
      session.setArchived(true);
    }
  }
}
class ArchiveAgentSessionAction extends BaseArchiveAgentSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class MarkAgentSessionDoneAction extends BaseArchiveAgentSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
class BaseUnarchiveAgentSessionAction extends BaseAgentSessionAction {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).unarchive;
    super({
      id: "agentSession.unarchive",
      title: action.title,
      icon: action.icon,
      keybinding: {
        primary: KeyMod.Shift | KeyCode.Delete,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backspace
        },
        weight: KeybindingWeight.WorkbenchContrib + 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.agentSessionsViewerFocused,
          ChatContextKeys.isArchivedAgentSession
        )
      },
      menu: [{
        id: MenuId.AgentSessionItemToolbar,
        group: "navigation",
        order: 1,
        when: ChatContextKeys.isArchivedAgentSession
      }, {
        id: MenuId.AgentSessionsContext,
        group: "1_edit",
        order: 2,
        when: ChatContextKeys.isArchivedAgentSession
      }]
    });
  }
  runWithSessions(sessions) {
    for (const session of sessions) {
      session.setArchived(false);
    }
  }
}
class UnarchiveAgentSessionAction extends BaseUnarchiveAgentSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class RestoreAgentSessionAction extends BaseUnarchiveAgentSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
function getAgentSessionArchiveActionConstructors(wording) {
  return wording === ChatSessionArchiveActionWording.MarkAsDone ? [
    MarkAllAgentSessionsDoneAction,
    MarkAgentSessionSectionDoneAction,
    RestoreAgentSessionSectionAction,
    MarkAgentSessionDoneAction,
    RestoreAgentSessionAction
  ] : [
    ArchiveAllAgentSessionsAction,
    ArchiveAgentSessionSectionAction,
    UnarchiveAgentSessionSectionAction,
    ArchiveAgentSessionAction,
    UnarchiveAgentSessionAction
  ];
}
class PinAgentSessionAction extends BaseAgentSessionAction {
  constructor() {
    super({
      id: "agentSession.pin",
      title: localize2("pin", "Pin"),
      icon: Codicon.pin,
      menu: [{
        id: MenuId.AgentSessionItemToolbar,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(
          ChatContextKeys.isPinnedAgentSession.negate(),
          ChatContextKeys.isArchivedAgentSession.negate()
        )
      }, {
        id: MenuId.AgentSessionsContext,
        group: "0_pin",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.isPinnedAgentSession.negate(),
          ChatContextKeys.isArchivedAgentSession.negate()
        )
      }]
    });
  }
  runWithSessions(sessions) {
    for (const session of sessions) {
      session.setPinned(true);
    }
  }
}
class UnpinAgentSessionAction extends BaseAgentSessionAction {
  constructor() {
    super({
      id: "agentSession.unpin",
      title: localize2("unpin", "Unpin"),
      icon: Codicon.pinned,
      menu: [{
        id: MenuId.AgentSessionItemToolbar,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(
          ChatContextKeys.isPinnedAgentSession,
          ChatContextKeys.isArchivedAgentSession.negate()
        )
      }, {
        id: MenuId.AgentSessionsContext,
        group: "0_pin",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.isPinnedAgentSession,
          ChatContextKeys.isArchivedAgentSession.negate()
        )
      }]
    });
  }
  runWithSessions(sessions) {
    for (const session of sessions) {
      session.setPinned(false);
    }
  }
}
const renameSupportedSessionTypes = ContextKeyExpr.or(
  ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local),
  ChatContextKeyExprs.isAgentHostSessionItem
);
class RenameAgentSessionAction extends BaseAgentSessionAction {
  constructor() {
    super({
      id: AGENT_SESSION_RENAME_ACTION_ID,
      title: localize2("rename", "Rename..."),
      precondition: ChatContextKeys.hasMultipleAgentSessionsSelected.negate(),
      keybinding: {
        primary: KeyCode.F2,
        mac: {
          primary: KeyCode.Enter
        },
        weight: KeybindingWeight.WorkbenchContrib + 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.agentSessionsViewerFocused,
          renameSupportedSessionTypes
        )
      },
      menu: {
        id: MenuId.AgentSessionsContext,
        group: "1_edit",
        order: 3,
        when: renameSupportedSessionTypes
      }
    });
  }
  async runWithSessions(sessions, accessor) {
    const session = sessions.at(0);
    if (!session) {
      return;
    }
    const quickInputService = accessor.get(IQuickInputService);
    const chatService = accessor.get(IChatService);
    const chatSessionsService = accessor.get(IChatSessionsService);
    const title = await quickInputService.input({ prompt: localize("newChatTitle", "New agent session title"), value: session.label });
    if (title) {
      if (isAgentHostAgentSessionItem(session)) {
        await chatSessionsService.renameChatSession(session.resource, title, CancellationToken.None);
      } else {
        chatService.setChatSessionTitle(session.resource, title);
      }
    }
  }
}
class DeleteAgentSessionAction extends BaseAgentSessionAction {
  constructor() {
    super({
      id: AGENT_SESSION_DELETE_ACTION_ID,
      title: localize2("delete", "Delete..."),
      menu: {
        id: MenuId.AgentSessionsContext,
        group: "1_edit",
        order: 4,
        when: ContextKeyExpr.or(
          ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local),
          ChatContextKeyExprs.isAgentHostSessionItem
        )
      }
    });
  }
  async runWithSessions(sessions, accessor) {
    if (sessions.length === 0) {
      return;
    }
    const chatService = accessor.get(IChatService);
    const chatSessionsService = accessor.get(IChatSessionsService);
    const dialogService = accessor.get(IDialogService);
    const widgetService = accessor.get(IChatWidgetService);
    const commandService = accessor.get(ICommandService);
    const confirmed = await dialogService.confirm({
      message: sessions.length === 1 ? localize("deleteSession.confirm", "Are you sure you want to delete this chat session?") : localize("deleteSessions.confirm", "Are you sure you want to delete {0} chat sessions?", sessions.length),
      detail: localize("deleteSession.detail", "This action cannot be undone."),
      primaryButton: localize("deleteSession.delete", "Delete")
    });
    if (!confirmed.confirmed) {
      return;
    }
    const deletedSessionIds = [];
    for (const session of sessions) {
      if (isLocalAgentSessionItem(session)) {
        await widgetService.getWidgetBySessionResource(session.resource)?.clear();
        await chatService.removeHistoryEntry(session.resource);
        const sessionId = LocalChatSessionUri.parseLocalSessionId(session.resource);
        if (sessionId) {
          deletedSessionIds.push(sessionId);
        }
      } else if (isAgentHostAgentSessionItem(session)) {
        try {
          await chatSessionsService.deleteChatSessionItem(session.resource, CancellationToken.None);
          await widgetService.getWidgetBySessionResource(session.resource)?.clear();
        } catch (err) {
          dialogService.error(localize("deleteSession.error", "Failed to delete chat session: {0}", toErrorMessage(err)));
        }
      }
    }
    if (deletedSessionIds.length > 0) {
      commandService.executeCommand("github.copilot.sessionSync.deleteSessionFromCloud", deletedSessionIds).catch(() => {
      });
    }
  }
}
class DeleteAllLocalSessionsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.clearHistory",
      title: localize2("agentSessions.deleteAll", "Delete All Local Workspace Chat Sessions"),
      precondition: ChatContextKeys.enabled,
      category: AGENT_SESSIONS_CATEGORY,
      f1: true
    });
  }
  async run(accessor, ...args) {
    const chatService = accessor.get(IChatService);
    const widgetService = accessor.get(IChatWidgetService);
    const dialogService = accessor.get(IDialogService);
    const agentSessionsService = accessor.get(IAgentSessionsService);
    const localSessionsCount = agentSessionsService.model.sessions.filter((session) => isLocalAgentSessionItem(session)).length;
    if (localSessionsCount === 0) {
      return;
    }
    const confirmed = await dialogService.confirm({
      message: localSessionsCount === 1 ? localize("deleteAllChats.confirmSingle", "Are you sure you want to delete 1 local workspace chat session?") : localize("deleteAllChats.confirm", "Are you sure you want to delete {0} local workspace chat sessions?", localSessionsCount),
      detail: localize("deleteAllChats.detail", "This action cannot be undone."),
      primaryButton: localize("deleteAllChats.button", "Delete All")
    });
    if (!confirmed.confirmed) {
      return;
    }
    await Promise.all(widgetService.getAllWidgets().map((widget) => widget.clear()));
    await chatService.clearAllHistoryEntries();
  }
}
class BaseOpenAgentSessionAction extends BaseAgentSessionAction {
  async runWithSessions(sessions, accessor) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const targetGroup = this.getTargetGroup();
    for (const session of sessions) {
      const uri = session.resource;
      await chatWidgetService.openSession(uri, targetGroup, {
        ...this.getOptions(),
        pinned: true
      });
    }
  }
}
const _OpenAgentSessionInEditorGroupAction = class _OpenAgentSessionInEditorGroupAction extends BaseOpenAgentSessionAction {
  constructor() {
    super({
      id: _OpenAgentSessionInEditorGroupAction.id,
      title: localize2("chat.openSessionInEditorGroup.label", "Open as Editor"),
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        mac: {
          primary: KeyMod.WinCtrl | KeyCode.Enter
        },
        weight: KeybindingWeight.WorkbenchContrib + 1,
        when: ContextKeyExpr.and(ChatContextKeys.agentSessionsViewerFocused, IsSessionsWindowContext.negate())
      },
      menu: {
        id: MenuId.AgentSessionsContext,
        when: IsSessionsWindowContext.negate(),
        order: 1,
        group: "navigation"
      }
    });
  }
  getTargetGroup() {
    return ACTIVE_GROUP;
  }
  getOptions() {
    return {};
  }
};
_OpenAgentSessionInEditorGroupAction.id = "workbench.action.chat.openSessionInEditorGroup";
let OpenAgentSessionInEditorGroupAction = _OpenAgentSessionInEditorGroupAction;
const _OpenAgentSessionInNewEditorGroupAction = class _OpenAgentSessionInNewEditorGroupAction extends BaseOpenAgentSessionAction {
  constructor() {
    super({
      id: _OpenAgentSessionInNewEditorGroupAction.id,
      title: localize2("chat.openSessionInNewEditorGroup.label", "Open to the Side"),
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter,
        mac: {
          primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Enter
        },
        weight: KeybindingWeight.WorkbenchContrib + 1,
        when: ContextKeyExpr.and(ChatContextKeys.agentSessionsViewerFocused, IsSessionsWindowContext.negate())
      },
      menu: {
        id: MenuId.AgentSessionsContext,
        when: IsSessionsWindowContext.negate(),
        order: 2,
        group: "navigation"
      }
    });
  }
  getTargetGroup() {
    return SIDE_GROUP;
  }
  getOptions() {
    return {};
  }
};
_OpenAgentSessionInNewEditorGroupAction.id = "workbench.action.chat.openSessionInNewEditorGroup";
let OpenAgentSessionInNewEditorGroupAction = _OpenAgentSessionInNewEditorGroupAction;
const _OpenAgentSessionInNewWindowAction = class _OpenAgentSessionInNewWindowAction extends BaseOpenAgentSessionAction {
  constructor() {
    super({
      id: _OpenAgentSessionInNewWindowAction.id,
      title: localize2("chat.openSessionInNewWindow.label", "Open in New Window"),
      menu: {
        id: MenuId.AgentSessionsContext,
        order: 3,
        group: "navigation"
      }
    });
  }
  getTargetGroup() {
    return AUX_WINDOW_GROUP;
  }
  getOptions() {
    return {
      auxiliary: { compact: true, bounds: { width: 800, height: 640 } }
    };
  }
};
_OpenAgentSessionInNewWindowAction.id = "workbench.action.chat.openSessionInNewWindow";
let OpenAgentSessionInNewWindowAction = _OpenAgentSessionInNewWindowAction;
class RefreshAgentSessionsViewerAction extends Action2 {
  constructor() {
    super({
      id: "agentSessionsViewer.refresh",
      title: localize2("refresh", "Refresh Agent Sessions"),
      icon: Codicon.refresh,
      menu: {
        id: MenuId.AgentSessionsToolbar,
        group: "navigation",
        order: 1
      }
    });
  }
  run(accessor, agentSessionsControl) {
    const control = agentSessionsControl ?? accessor.get(IViewsService).getActiveViewWithId(ChatViewId)?.agentSessionsControl;
    if (control) {
      control.refresh();
    } else {
      accessor.get(ICommandService).executeCommand("sessionsViewPane.refresh");
    }
  }
}
class FindAgentSessionInViewerAction extends Action2 {
  constructor() {
    super({
      id: "agentSessionsViewer.find",
      title: localize2("find", "Find Agent Session"),
      icon: Codicon.search,
      menu: {
        id: MenuId.AgentSessionsToolbar,
        group: "navigation",
        order: 2
      }
    });
  }
  run(accessor, agentSessionsControl) {
    const control = agentSessionsControl ?? accessor.get(IViewsService).getActiveViewWithId(ChatViewId)?.agentSessionsControl;
    if (control) {
      return control.openFind();
    } else {
      return accessor.get(ICommandService).executeCommand("sessionsViewPane.find");
    }
  }
}
class UpdateChatViewWidthAction extends Action2 {
  async run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const configurationService = accessor.get(IConfigurationService);
    const viewsService = accessor.get(IViewsService);
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const chatLocation = viewDescriptorService.getViewLocationById(ChatViewId);
    if (typeof chatLocation !== "number") {
      return;
    }
    const panelPosition = layoutService.getPanelPosition();
    const canResizeView = chatLocation !== ViewContainerLocation.Panel || (panelPosition === Position.LEFT || panelPosition === Position.RIGHT);
    const chatViewSessionsEnabled = configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled);
    if (!chatViewSessionsEnabled) {
      await configurationService.updateValue(ChatConfiguration.ChatViewSessionsEnabled, true);
    }
    let chatView = viewsService.getActiveViewWithId(ChatViewId);
    if (!chatView) {
      chatView = await viewsService.openView(ChatViewId, false);
    }
    if (!chatView) {
      return;
    }
    const configuredOrientation = configurationService.getValue(ChatConfiguration.ChatViewSessionsOrientation);
    let validatedConfiguredOrientation;
    if (configuredOrientation === "stacked" || configuredOrientation === "sideBySide") {
      validatedConfiguredOrientation = configuredOrientation;
    } else {
      validatedConfiguredOrientation = "sideBySide";
    }
    const newOrientation = this.getOrientation();
    const lastWidthForOrientation = chatView?.getLastDimensions(newOrientation)?.width;
    if ((!canResizeView || validatedConfiguredOrientation === "sideBySide") && newOrientation === AgentSessionsViewerOrientation.Stacked) {
      chatView.updateConfiguredSessionsViewerOrientation("stacked");
    } else if ((!canResizeView || validatedConfiguredOrientation === "stacked") && newOrientation === AgentSessionsViewerOrientation.SideBySide) {
      chatView.updateConfiguredSessionsViewerOrientation("sideBySide");
    }
    if (!canResizeView) {
      return;
    }
    const part = paneCompositeService.getPartId(chatLocation);
    let currentSize = layoutService.getSize(part);
    const chatViewDefaultWidth = 300;
    const sessionsViewDefaultWidth = chatViewDefaultWidth;
    const sideBySideMinWidth = chatViewDefaultWidth + sessionsViewDefaultWidth + 1;
    if (newOrientation === AgentSessionsViewerOrientation.SideBySide && currentSize.width >= sideBySideMinWidth || // already wide enough to show side by side
    newOrientation === AgentSessionsViewerOrientation.Stacked && chatLocation === ViewContainerLocation.AuxiliaryBar && layoutService.isAuxiliaryBarMaximized()) {
      return;
    }
    if (chatLocation === ViewContainerLocation.AuxiliaryBar) {
      layoutService.setAuxiliaryBarMaximized(false);
      currentSize = layoutService.getSize(part);
    }
    let newWidth;
    if (newOrientation === AgentSessionsViewerOrientation.SideBySide) {
      newWidth = Math.max(sideBySideMinWidth, lastWidthForOrientation || Math.round(layoutService.mainContainerDimension.width / 2));
    } else {
      newWidth = lastWidthForOrientation || Math.max(chatViewDefaultWidth, currentSize.width - sessionsViewDefaultWidth);
    }
    layoutService.setSize(part, { width: newWidth, height: currentSize.height });
    const actualSize = layoutService.getSize(part);
    if (chatLocation === ViewContainerLocation.AuxiliaryBar && // only applicable for auxiliary bar
    newOrientation === AgentSessionsViewerOrientation.SideBySide && // only applicable when going to side by side
    actualSize.width < sideBySideMinWidth) {
      layoutService.setAuxiliaryBarMaximized(true);
    }
  }
}
const _ShowAgentSessionsSidebar = class _ShowAgentSessionsSidebar extends UpdateChatViewWidthAction {
  constructor() {
    super({
      id: _ShowAgentSessionsSidebar.ID,
      title: _ShowAgentSessionsSidebar.TITLE,
      precondition: ContextKeyExpr.and(
        ChatContextKeys.enabled,
        ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.Stacked)
      ),
      f1: true,
      category: AGENT_SESSIONS_CATEGORY
    });
  }
  getOrientation() {
    return AgentSessionsViewerOrientation.SideBySide;
  }
};
_ShowAgentSessionsSidebar.ID = "agentSessions.showAgentSessionsSidebar";
_ShowAgentSessionsSidebar.TITLE = localize2("showAgentSessionsSidebar", "Show Agent Sessions Sidebar");
let ShowAgentSessionsSidebar = _ShowAgentSessionsSidebar;
const _HideAgentSessionsSidebar = class _HideAgentSessionsSidebar extends UpdateChatViewWidthAction {
  constructor() {
    super({
      id: _HideAgentSessionsSidebar.ID,
      title: _HideAgentSessionsSidebar.TITLE,
      precondition: ContextKeyExpr.and(
        ChatContextKeys.enabled,
        ChatContextKeys.agentSessionsViewerOrientation.isEqualTo(AgentSessionsViewerOrientation.SideBySide)
      ),
      f1: true,
      category: AGENT_SESSIONS_CATEGORY
    });
  }
  getOrientation() {
    return AgentSessionsViewerOrientation.Stacked;
  }
};
_HideAgentSessionsSidebar.ID = "agentSessions.hideAgentSessionsSidebar";
_HideAgentSessionsSidebar.TITLE = localize2("hideAgentSessionsSidebar", "Hide Agent Sessions Sidebar");
let HideAgentSessionsSidebar = _HideAgentSessionsSidebar;
const _ToggleAgentSessionsSidebar = class _ToggleAgentSessionsSidebar extends Action2 {
  constructor() {
    super({
      id: _ToggleAgentSessionsSidebar.ID,
      title: _ToggleAgentSessionsSidebar.TITLE,
      precondition: ChatContextKeys.enabled,
      f1: true,
      category: AGENT_SESSIONS_CATEGORY
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    const viewsService = accessor.get(IViewsService);
    const chatView = viewsService.getActiveViewWithId(ChatViewId);
    const currentOrientation = chatView?.getSessionsViewerOrientation();
    if (currentOrientation === AgentSessionsViewerOrientation.SideBySide) {
      await commandService.executeCommand(HideAgentSessionsSidebar.ID);
    } else {
      await commandService.executeCommand(ShowAgentSessionsSidebar.ID);
    }
  }
};
_ToggleAgentSessionsSidebar.ID = "agentSessions.toggleAgentSessionsSidebar";
_ToggleAgentSessionsSidebar.TITLE = localize2("toggleAgentSessionsSidebar", "Toggle Agent Sessions Sidebar");
let ToggleAgentSessionsSidebar = _ToggleAgentSessionsSidebar;
const _FocusAgentSessionsAction = class _FocusAgentSessionsAction extends Action2 {
  constructor() {
    super({
      id: _FocusAgentSessionsAction.id,
      title: localize2("chat.focusAgentSessionsViewer.label", "Focus Agent Sessions"),
      precondition: ContextKeyExpr.and(
        ChatContextKeys.enabled,
        ContextKeyExpr.equals(`config.${ChatConfiguration.ChatViewSessionsEnabled}`, true)
      ),
      category: AGENT_SESSIONS_CATEGORY,
      f1: true
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const configurationService = accessor.get(IConfigurationService);
    const commandService = accessor.get(ICommandService);
    const chatView = await viewsService.openView(ChatViewId, true);
    const focused = chatView?.focusSessions();
    if (focused) {
      return;
    }
    const configuredSessionsViewerOrientation = configurationService.getValue(ChatConfiguration.ChatViewSessionsOrientation);
    if (configuredSessionsViewerOrientation === "stacked") {
      await commandService.executeCommand(ACTION_ID_NEW_CHAT);
    } else {
      await commandService.executeCommand(ShowAgentSessionsSidebar.ID);
    }
    chatView?.focusSessions();
  }
};
_FocusAgentSessionsAction.id = "workbench.action.chat.focusAgentSessionsViewer";
let FocusAgentSessionsAction = _FocusAgentSessionsAction;
export {
  ArchiveAgentSessionAction,
  ArchiveAgentSessionSectionAction,
  ArchiveAllAgentSessionsAction,
  CollapseAllAgentSessionSectionsAction,
  DeleteAgentSessionAction,
  DeleteAllLocalSessionsAction,
  FindAgentSessionInViewerAction,
  FocusAgentSessionsAction,
  HideAgentSessionsSidebar,
  MarkAgentSessionDoneAction,
  MarkAgentSessionReadAction,
  MarkAgentSessionSectionDoneAction,
  MarkAgentSessionSectionReadAction,
  MarkAgentSessionUnreadAction,
  MarkAllAgentSessionsDoneAction,
  MarkAllAgentSessionsReadAction,
  OpenAgentSessionInEditorGroupAction,
  OpenAgentSessionInNewEditorGroupAction,
  OpenAgentSessionInNewWindowAction,
  PinAgentSessionAction,
  RefreshAgentSessionsViewerAction,
  RenameAgentSessionAction,
  RestoreAgentSessionAction,
  RestoreAgentSessionSectionAction,
  SetAgentSessionsOrientationSideBySideAction,
  SetAgentSessionsOrientationStackedAction,
  ShowAgentSessionsSidebar,
  ToggleAgentSessionsSidebar,
  ToggleShowAgentSessionsAction,
  UnarchiveAgentSessionAction,
  UnarchiveAgentSessionSectionAction,
  UnpinAgentSessionAction,
  getAgentSessionArchiveActionConstructors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvbnNBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25TZWN0aW9uLCBJQWdlbnRTZXNzaW9uLCBJQWdlbnRTZXNzaW9uU2VjdGlvbiwgSU1hcnNoYWxsZWRBZ2VudFNlc3Npb25Db250ZXh0LCBpc0FnZW50SG9zdEFnZW50U2Vzc2lvbkl0ZW0sIGlzQWdlbnRTZXNzaW9uU2VjdGlvbiwgaXNMb2NhbEFnZW50U2Vzc2lvbkl0ZW0sIGlzTWFyc2hhbGxlZEFnZW50U2Vzc2lvbkNvbnRleHQgfSBmcm9tICcuL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEFHRU5UX1NFU1NJT05fREVMRVRFX0FDVElPTl9JRCwgQUdFTlRfU0VTU0lPTl9SRU5BTUVfQUNUSU9OX0lELCBBZ2VudFNlc3Npb25Qcm92aWRlcnMsIEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiwgSUFnZW50U2Vzc2lvbnNDb250cm9sIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5RXhwcnMsIENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3IuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdJZCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIEFVWF9XSU5ET1dfR1JPVVAsIFByZWZlcnJlZEdyb3VwLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4vYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IHNob3dDbGVhckVkaXRpbmdTZXNzaW9uQ29uZmlybWF0aW9uIH0gZnJvbSAnLi4vd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQUNUSU9OX0lEX05FV19DSEFUIH0gZnJvbSAnLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld1BhbmUgfSBmcm9tICcuLi93aWRnZXRIb3N0cy92aWV3UGFuZS9jaGF0Vmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLCBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25QcmVzZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jaGF0L2NvbW1vbi9zZXNzaW9uQXJjaGl2ZUFjdGlvbnMuanMnO1xuXG5jb25zdCBBR0VOVF9TRVNTSU9OU19DQVRFR09SWSA9IGxvY2FsaXplMignY2hhdFNlc3Npb25zJywgXCJDaGF0IEFnZW50IFNlc3Npb25zXCIpO1xuXG4vLyNyZWdpb24gQ2hhdCBWaWV3XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVTaG93QWdlbnRTZXNzaW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRvZ2dsZVNob3dBZ2VudFNlc3Npb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQuc2hvd1Nlc3Npb25zJywgXCJTaG93IFNlc3Npb25zXCIpLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zRW5hYmxlZH1gLCB0cnVlKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0V2VsY29tZUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMF9zZXNzaW9ucycsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaW5DaGF0RWRpdG9yLm5lZ2F0ZSgpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3U2Vzc2lvbnNFbmFibGVkKTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zRW5hYmxlZCwgIWN1cnJlbnRWYWx1ZSk7XG5cdH1cbn1cblxuY29uc3QgYWdlbnRTZXNzaW9uc09yaWVudGF0aW9uU3VibWVudSA9IG5ldyBNZW51SWQoJ2NoYXRBZ2VudFNlc3Npb25zT3JpZW50YXRpb25TdWJtZW51Jyk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNoYXRXZWxjb21lQ29udGV4dCwge1xuXHRzdWJtZW51OiBhZ2VudFNlc3Npb25zT3JpZW50YXRpb25TdWJtZW51LFxuXHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LnNlc3Npb25zT3JpZW50YXRpb24nLCBcIlNlc3Npb25zIE9yaWVudGF0aW9uXCIpLFxuXHRncm91cDogJzBfc2Vzc2lvbnMnLFxuXHRvcmRlcjogMSxcblx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmluQ2hhdEVkaXRvci5uZWdhdGUoKVxufSk7XG5cbmV4cG9ydCBjbGFzcyBTZXRBZ2VudFNlc3Npb25zT3JpZW50YXRpb25TdGFja2VkQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc2V0QWdlbnRTZXNzaW9uc09yaWVudGF0aW9uU3RhY2tlZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LnNlc3Npb25zT3JpZW50YXRpb24uc3RhY2tlZCcsIFwiU3RhY2tlZFwiKSxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc09yaWVudGF0aW9ufWAsICdzdGFja2VkJyksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc0VuYWJsZWR9YCwgdHJ1ZSksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBhZ2VudFNlc3Npb25zT3JpZW50YXRpb25TdWJtZW51LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEhpZGVBZ2VudFNlc3Npb25zU2lkZWJhci5JRCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNldEFnZW50U2Vzc2lvbnNPcmllbnRhdGlvblNpZGVCeVNpZGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zZXRBZ2VudFNlc3Npb25zT3JpZW50YXRpb25TaWRlQnlTaWRlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQuc2Vzc2lvbnNPcmllbnRhdGlvbi5zaWRlQnlTaWRlJywgXCJTaWRlIGJ5IFNpZGVcIiksXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke0NoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3U2Vzc2lvbnNPcmllbnRhdGlvbn1gLCAnc3RhY2tlZCcpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0NoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3U2Vzc2lvbnNFbmFibGVkfWAsIHRydWUpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogYWdlbnRTZXNzaW9uc09yaWVudGF0aW9uU3VibWVudSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChTaG93QWdlbnRTZXNzaW9uc1NpZGViYXIuSUQpO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEJhc2VBcmNoaXZlQWxsQWdlbnRTZXNzaW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgd29yZGluZzogQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZykge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGdldENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvblByZXNlbnRhdGlvbih3b3JkaW5nKS5hcmNoaXZlQWxsO1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmFyY2hpdmVBbGxBZ2VudFNlc3Npb25zJyxcblx0XHRcdHRpdGxlOiBhY3Rpb24udGl0bGUsXG5cdFx0XHRpY29uOiBhY3Rpb24uaWNvbixcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRjYXRlZ29yeTogQUdFTlRfU0VTU0lPTlNfQ0FURUdPUlksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBhZ2VudFNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJQWdlbnRTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnNUb0FyY2hpdmUgPSBhZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucy5maWx0ZXIoc2Vzc2lvbiA9PiAhc2Vzc2lvbi5pc0FyY2hpdmVkKCkpO1xuXHRcdGlmIChzZXNzaW9uc1RvQXJjaGl2ZS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0bWVzc2FnZTogdGhpcy53b3JkaW5nID09PSBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmVcblx0XHRcdFx0PyBzZXNzaW9uc1RvQXJjaGl2ZS5sZW5ndGggPT09IDFcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdtYXJrQWxsU2Vzc2lvbnNEb25lLmNvbmZpcm1TaW5nbGUnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBtYXJrIDEgYWdlbnQgc2Vzc2lvbiBhcyBkb25lP1wiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ21hcmtBbGxTZXNzaW9uc0RvbmUuY29uZmlybScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIG1hcmsgezB9IGFnZW50IHNlc3Npb25zIGFzIGRvbmU/XCIsIHNlc3Npb25zVG9BcmNoaXZlLmxlbmd0aClcblx0XHRcdFx0OiBzZXNzaW9uc1RvQXJjaGl2ZS5sZW5ndGggPT09IDFcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhcmNoaXZlQWxsU2Vzc2lvbnMuY29uZmlybVNpbmdsZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGFyY2hpdmUgMSBhZ2VudCBzZXNzaW9uP1wiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FyY2hpdmVBbGxTZXNzaW9ucy5jb25maXJtJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gYXJjaGl2ZSB7MH0gYWdlbnQgc2Vzc2lvbnM/XCIsIHNlc3Npb25zVG9BcmNoaXZlLmxlbmd0aCksXG5cdFx0XHRkZXRhaWw6IHRoaXMud29yZGluZyA9PT0gQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lXG5cdFx0XHRcdD8gbG9jYWxpemUoJ21hcmtBbGxTZXNzaW9uc0RvbmUuZGV0YWlsJywgXCJZb3UgY2FuIHJlc3RvcmUgc2Vzc2lvbnMgbGF0ZXIgaWYgbmVlZGVkIGZyb20gdGhlIHNlc3Npb25zIHZpZXcuXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2FyY2hpdmVBbGxTZXNzaW9ucy5kZXRhaWwnLCBcIllvdSBjYW4gdW5hcmNoaXZlIHNlc3Npb25zIGxhdGVyIGlmIG5lZWRlZCBmcm9tIHRoZSBzZXNzaW9ucyB2aWV3LlwiKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGdldENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvblByZXNlbnRhdGlvbih0aGlzLndvcmRpbmcpLmFyY2hpdmVBbGwudGl0bGUudmFsdWVcblx0XHR9KTtcblxuXHRcdGlmICghY29uZmlybWVkLmNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9uc1RvQXJjaGl2ZSkge1xuXHRcdFx0c2Vzc2lvbi5zZXRBcmNoaXZlZCh0cnVlKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFyY2hpdmVBbGxBZ2VudFNlc3Npb25zQWN0aW9uIGV4dGVuZHMgQmFzZUFyY2hpdmVBbGxBZ2VudFNlc3Npb25zQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5BcmNoaXZlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFya0FsbEFnZW50U2Vzc2lvbnNEb25lQWN0aW9uIGV4dGVuZHMgQmFzZUFyY2hpdmVBbGxBZ2VudFNlc3Npb25zQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFya0FsbEFnZW50U2Vzc2lvbnNSZWFkQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubWFya0FsbEFnZW50U2Vzc2lvbnNSZWFkJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21hcmtBbGxSZWFkLmxhYmVsJywgXCJNYXJrIEFsbCBhcyBSZWFkXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdGNhdGVnb3J5OiBBR0VOVF9TRVNTSU9OU19DQVRFR09SWSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvbnNDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzBfcmVhZCcsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaXNBcmNoaXZlZEFnZW50U2Vzc2lvbi5uZWdhdGUoKSAvLyBubyByZWFkIHN0YXRlIGZvciBhcmNoaXZlZCBzZXNzaW9uc1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBZ2VudFNlc3Npb25zU2VydmljZSk7XG5cblx0XHRjb25zdCBzZXNzaW9uc1RvTWFya1JlYWQgPSBhZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucy5maWx0ZXIoc2Vzc2lvbiA9PiAhc2Vzc2lvbi5pc0FyY2hpdmVkKCkgJiYgIXNlc3Npb24uaXNSZWFkKCkpO1xuXHRcdGlmIChzZXNzaW9uc1RvTWFya1JlYWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zVG9NYXJrUmVhZCkge1xuXHRcdFx0c2Vzc2lvbi5zZXRSZWFkKHRydWUpO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCBDb25maXJtQXJjaGl2ZVN0b3JhZ2VLZXkgPSAnY2hhdC5zZXNzaW9ucy5jb25maXJtQXJjaGl2ZSc7XG5cbmFic3RyYWN0IGNsYXNzIEJhc2VBcmNoaXZlQWdlbnRTZXNzaW9uU2VjdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgd29yZGluZzogQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZykge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGdldENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvblByZXNlbnRhdGlvbih3b3JkaW5nKS5hcmNoaXZlQWxsO1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRTZXNzaW9uU2VjdGlvbi5hcmNoaXZlJyxcblx0XHRcdHRpdGxlOiBhY3Rpb24udGl0bGUsXG5cdFx0XHRpY29uOiBhY3Rpb24uaWNvbixcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uU2VjdGlvblRvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uU2VjdGlvbi5ub3RFcXVhbHNUbyhBZ2VudFNlc3Npb25TZWN0aW9uLkFyY2hpdmVkKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25TZWN0aW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblNlY3Rpb24ubm90RXF1YWxzVG8oQWdlbnRTZXNzaW9uU2VjdGlvbi5BcmNoaXZlZCksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSUFnZW50U2Vzc2lvblNlY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWNvbnRleHQgfHwgIWlzQWdlbnRTZXNzaW9uU2VjdGlvbihjb250ZXh0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cblx0XHRjb25zdCBza2lwQ29uZmlybWF0aW9uID0gc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihDb25maXJtQXJjaGl2ZVN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBmYWxzZSk7XG5cdFx0aWYgKCFza2lwQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRtZXNzYWdlOiB0aGlzLndvcmRpbmcgPT09IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZVxuXHRcdFx0XHRcdD8gY29udGV4dC5zZXNzaW9ucy5sZW5ndGggPT09IDFcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21hcmtTZWN0aW9uU2Vzc2lvbnNEb25lLmNvbmZpcm1TaW5nbGUnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBtYXJrIDEgYWdlbnQgc2Vzc2lvbiBmcm9tICd7MH0nIGFzIGRvbmU/XCIsIGNvbnRleHQubGFiZWwpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtYXJrU2VjdGlvblNlc3Npb25zRG9uZS5jb25maXJtJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gbWFyayB7MH0gYWdlbnQgc2Vzc2lvbnMgZnJvbSAnezF9JyBhcyBkb25lP1wiLCBjb250ZXh0LnNlc3Npb25zLmxlbmd0aCwgY29udGV4dC5sYWJlbClcblx0XHRcdFx0XHQ6IGNvbnRleHQuc2Vzc2lvbnMubGVuZ3RoID09PSAxXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhcmNoaXZlU2VjdGlvblNlc3Npb25zLmNvbmZpcm1TaW5nbGUnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBhcmNoaXZlIDEgYWdlbnQgc2Vzc2lvbiBmcm9tICd7MH0nP1wiLCBjb250ZXh0LmxhYmVsKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYXJjaGl2ZVNlY3Rpb25TZXNzaW9ucy5jb25maXJtJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gYXJjaGl2ZSB7MH0gYWdlbnQgc2Vzc2lvbnMgZnJvbSAnezF9Jz9cIiwgY29udGV4dC5zZXNzaW9ucy5sZW5ndGgsIGNvbnRleHQubGFiZWwpLFxuXHRcdFx0XHRkZXRhaWw6IHRoaXMud29yZGluZyA9PT0gQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbWFya1NlY3Rpb25TZXNzaW9uc0RvbmUuZGV0YWlsJywgXCJZb3UgY2FuIHJlc3RvcmUgc2Vzc2lvbnMgbGF0ZXIgaWYgbmVlZGVkIGZyb20gdGhlIHNlc3Npb25zIHZpZXcuXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYXJjaGl2ZVNlY3Rpb25TZXNzaW9ucy5kZXRhaWwnLCBcIllvdSBjYW4gdW5hcmNoaXZlIHNlc3Npb25zIGxhdGVyIGlmIG5lZWRlZCBmcm9tIHRoZSBzZXNzaW9ucyB2aWV3LlwiKSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogZ2V0Q2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uUHJlc2VudGF0aW9uKHRoaXMud29yZGluZykuYXJjaGl2ZUFsbC50aXRsZS52YWx1ZSxcblx0XHRcdFx0Y2hlY2tib3g6IHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2RvTm90QXNrQWdhaW4nLCBcIkRvIG5vdCBhc2sgbWUgYWdhaW5cIilcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghY29uZmlybWVkLmNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb25maXJtZWQuY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENvbmZpcm1BcmNoaXZlU3RvcmFnZUtleSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGNvbnRleHQuc2Vzc2lvbnMpIHtcblx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBcmNoaXZlQWdlbnRTZXNzaW9uU2VjdGlvbkFjdGlvbiBleHRlbmRzIEJhc2VBcmNoaXZlQWdlbnRTZXNzaW9uU2VjdGlvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuQXJjaGl2ZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hcmtBZ2VudFNlc3Npb25TZWN0aW9uRG9uZUFjdGlvbiBleHRlbmRzIEJhc2VBcmNoaXZlQWdlbnRTZXNzaW9uU2VjdGlvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZSk7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQmFzZVVuYXJjaGl2ZUFnZW50U2Vzc2lvblNlY3Rpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHdvcmRpbmc6IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcpIHtcblx0XHRjb25zdCBhY3Rpb24gPSBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25QcmVzZW50YXRpb24od29yZGluZykudW5hcmNoaXZlQWxsO1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRTZXNzaW9uU2VjdGlvbi51bmFyY2hpdmUnLFxuXHRcdFx0dGl0bGU6IGFjdGlvbi50aXRsZSxcblx0XHRcdGljb246IGFjdGlvbi5pY29uLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25TZWN0aW9uVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25TZWN0aW9uLmlzRXF1YWxUbyhBZ2VudFNlc3Npb25TZWN0aW9uLkFyY2hpdmVkKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25TZWN0aW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblNlY3Rpb24uaXNFcXVhbFRvKEFnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWQpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElBZ2VudFNlc3Npb25TZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFjb250ZXh0IHx8ICFpc0FnZW50U2Vzc2lvblNlY3Rpb24oY29udGV4dCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0aWYgKGNvbnRleHQuc2Vzc2lvbnMubGVuZ3RoID4gMSkge1xuXHRcdFx0Y29uc3Qgc2tpcENvbmZpcm1hdGlvbiA9IHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQ29uZmlybUFyY2hpdmVTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgZmFsc2UpO1xuXHRcdFx0aWYgKCFza2lwQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0bWVzc2FnZTogdGhpcy53b3JkaW5nID09PSBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmVcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3Jlc3RvcmVTZWN0aW9uU2Vzc2lvbnMuY29uZmlybScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIHJlc3RvcmUgezB9IGFnZW50IHNlc3Npb25zP1wiLCBjb250ZXh0LnNlc3Npb25zLmxlbmd0aClcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ3VuYXJjaGl2ZVNlY3Rpb25TZXNzaW9ucy5jb25maXJtJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gdW5hcmNoaXZlIHswfSBhZ2VudCBzZXNzaW9ucz9cIiwgY29udGV4dC5zZXNzaW9ucy5sZW5ndGgpLFxuXHRcdFx0XHRcdHByaW1hcnlCdXR0b246IGdldENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvblByZXNlbnRhdGlvbih0aGlzLndvcmRpbmcpLnVuYXJjaGl2ZUFsbC50aXRsZS52YWx1ZSxcblx0XHRcdFx0XHRjaGVja2JveDoge1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkb05vdEFza0FnYWluJywgXCJEbyBub3QgYXNrIG1lIGFnYWluXCIpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoIWNvbmZpcm1lZC5jb25maXJtZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY29uZmlybWVkLmNoZWNrYm94Q2hlY2tlZCkge1xuXHRcdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENvbmZpcm1BcmNoaXZlU3RvcmFnZUtleSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgY29udGV4dC5zZXNzaW9ucykge1xuXHRcdFx0c2Vzc2lvbi5zZXRBcmNoaXZlZChmYWxzZSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVbmFyY2hpdmVBZ2VudFNlc3Npb25TZWN0aW9uQWN0aW9uIGV4dGVuZHMgQmFzZVVuYXJjaGl2ZUFnZW50U2Vzc2lvblNlY3Rpb25BY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLkFyY2hpdmUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXN0b3JlQWdlbnRTZXNzaW9uU2VjdGlvbkFjdGlvbiBleHRlbmRzIEJhc2VVbmFyY2hpdmVBZ2VudFNlc3Npb25TZWN0aW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFya0FnZW50U2Vzc2lvblNlY3Rpb25SZWFkQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudFNlc3Npb25TZWN0aW9uLm1hcmtSZWFkJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21hcmtTZWN0aW9uUmVhZCcsIFwiTWFyayBBbGwgYXMgUmVhZFwiKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uU2VjdGlvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMV9lZGl0Jyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25TZWN0aW9uLm5vdEVxdWFsc1RvKEFnZW50U2Vzc2lvblNlY3Rpb24uQXJjaGl2ZWQpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElBZ2VudFNlc3Npb25TZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFjb250ZXh0IHx8ICFpc0FnZW50U2Vzc2lvblNlY3Rpb24oY29udGV4dCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgY29udGV4dC5zZXNzaW9ucykge1xuXHRcdFx0c2Vzc2lvbi5zZXRSZWFkKHRydWUpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29sbGFwc2VBbGxBZ2VudFNlc3Npb25TZWN0aW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRTZXNzaW9uU2VjdGlvbi5jb2xsYXBzZUFsbCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb2xsYXBzZUFsbCcsIFwiQ29sbGFwc2UgQWxsXCIpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25TZWN0aW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcyX2NvbGxhcHNlJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBfc2VjdGlvbjogdW5rbm93biwgY29udHJvbD86IElBZ2VudFNlc3Npb25zQ29udHJvbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnRyb2w/LmNvbGxhcHNlQWxsU2VjdGlvbnMoKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFNlc3Npb24gQWN0aW9uc1xuXG5hYnN0cmFjdCBjbGFzcyBCYXNlQWdlbnRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSUFnZW50U2Vzc2lvbiB8IElNYXJzaGFsbGVkQWdlbnRTZXNzaW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBZ2VudFNlc3Npb25zU2VydmljZSk7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXG5cdFx0bGV0IHNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10gPSBbXTtcblx0XHRpZiAoaXNNYXJzaGFsbGVkQWdlbnRTZXNzaW9uQ29udGV4dChjb250ZXh0KSkge1xuXHRcdFx0c2Vzc2lvbnMgPSBjb2FsZXNjZSgoY29udGV4dC5zZXNzaW9ucyA/PyBbY29udGV4dC5zZXNzaW9uXSkubWFwKHNlc3Npb24gPT4gYWdlbnRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uLnJlc291cmNlKSkpO1xuXHRcdH0gZWxzZSBpZiAoY29udGV4dCkge1xuXHRcdFx0c2Vzc2lvbnMgPSBbY29udGV4dF07XG5cdFx0fVxuXG5cdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3QgY2hhdFZpZXcgPSB2aWV3c1NlcnZpY2UuZ2V0QWN0aXZlVmlld1dpdGhJZDxDaGF0Vmlld1BhbmU+KENoYXRWaWV3SWQpO1xuXHRcdFx0Y29uc3QgZm9jdXNlZCA9IGNoYXRWaWV3Py5nZXRGb2N1c2VkU2Vzc2lvbnMoKS5hdCgwKTtcblx0XHRcdGlmIChmb2N1c2VkKSB7XG5cdFx0XHRcdHNlc3Npb25zID0gW2ZvY3VzZWRdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJ1bldpdGhTZXNzaW9ucyhzZXNzaW9ucywgYWNjZXNzb3IpO1xuXHRcdH1cblx0fVxuXG5cdGFic3RyYWN0IHJ1bldpdGhTZXNzaW9ucyhzZXNzaW9uczogSUFnZW50U2Vzc2lvbltdLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4gfCB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgTWFya0FnZW50U2Vzc2lvblVucmVhZEFjdGlvbiBleHRlbmRzIEJhc2VBZ2VudFNlc3Npb25BY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRTZXNzaW9uLm1hcmtVbnJlYWQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWFya1VucmVhZCcsIFwiTWFyayBhcyBVbnJlYWRcIiksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uc0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMF9yZWFkJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaXNSZWFkQWdlbnRTZXNzaW9uLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pc0FyY2hpdmVkQWdlbnRTZXNzaW9uLm5lZ2F0ZSgpIC8vIG5vIHJlYWQgc3RhdGUgZm9yIGFyY2hpdmVkIHNlc3Npb25zXG5cdFx0XHRcdCksXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW5XaXRoU2Vzc2lvbnMoc2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0c2Vzc2lvbi5zZXRSZWFkKGZhbHNlKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hcmtBZ2VudFNlc3Npb25SZWFkQWN0aW9uIGV4dGVuZHMgQmFzZUFnZW50U2Vzc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudFNlc3Npb24ubWFya1JlYWQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWFya1JlYWQnLCBcIk1hcmsgYXMgUmVhZFwiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25zQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcwX3JlYWQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pc1JlYWRBZ2VudFNlc3Npb24ubmVnYXRlKCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlzQXJjaGl2ZWRBZ2VudFNlc3Npb24ubmVnYXRlKCkgLy8gbm8gcmVhZCBzdGF0ZSBmb3IgYXJjaGl2ZWQgc2Vzc2lvbnNcblx0XHRcdFx0KSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bldpdGhTZXNzaW9ucyhzZXNzaW9uczogSUFnZW50U2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRzZXNzaW9uLnNldFJlYWQodHJ1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEJhc2VBcmNoaXZlQWdlbnRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQmFzZUFnZW50U2Vzc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB3b3JkaW5nOiBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nKSB7XG5cdFx0Y29uc3QgYWN0aW9uID0gZ2V0Q2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uUHJlc2VudGF0aW9uKHdvcmRpbmcpLmFyY2hpdmU7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudFNlc3Npb24uYXJjaGl2ZScsXG5cdFx0XHR0aXRsZTogYWN0aW9uLnRpdGxlLFxuXHRcdFx0aWNvbjogYWN0aW9uLmljb24sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRGVsZXRlLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzcGFjZSB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uc1ZpZXdlckZvY3VzZWQsXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlzQXJjaGl2ZWRBZ2VudFNlc3Npb24ubmVnYXRlKClcblx0XHRcdFx0KVxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uSXRlbVRvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaXNBcmNoaXZlZEFnZW50U2Vzc2lvbi5uZWdhdGUoKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25zQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmlzQXJjaGl2ZWRBZ2VudFNlc3Npb24ubmVnYXRlKClcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoU2Vzc2lvbnMoc2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXG5cdFx0Ly8gQXJjaGl2ZSBhbGwgc2Vzc2lvbnNcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGNvbnN0IGNoYXRNb2RlbCA9IGNoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHRpZiAoY2hhdE1vZGVsICYmICFhd2FpdCBzaG93Q2xlYXJFZGl0aW5nU2Vzc2lvbkNvbmZpcm1hdGlvbihjaGF0TW9kZWwsIGRpYWxvZ1NlcnZpY2UsIHtcblx0XHRcdFx0aXNBcmNoaXZlQWN0aW9uOiB0cnVlLFxuXHRcdFx0XHR0aXRsZU92ZXJyaWRlOiB0aGlzLndvcmRpbmcgPT09IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ21hcmtTZXNzaW9uRG9uZScsIFwiTWFyayBjaGF0IGFzIGRvbmUgd2l0aCBwZW5kaW5nIGVkaXRzP1wiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FyY2hpdmVTZXNzaW9uJywgXCJBcmNoaXZlIGNoYXQgd2l0aCBwZW5kaW5nIGVkaXRzP1wiKSxcblx0XHRcdFx0bWVzc2FnZU92ZXJyaWRlOiBsb2NhbGl6ZSgnYXJjaGl2ZVNlc3Npb25EZXNjcmlwdGlvbicsIFwiWW91IGhhdmUgcGVuZGluZyBjaGFuZ2VzIGluIHRoaXMgY2hhdCBzZXNzaW9uLlwiKVxuXHRcdFx0fSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRzZXNzaW9uLnNldEFyY2hpdmVkKHRydWUpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQXJjaGl2ZUFnZW50U2Vzc2lvbkFjdGlvbiBleHRlbmRzIEJhc2VBcmNoaXZlQWdlbnRTZXNzaW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5BcmNoaXZlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFya0FnZW50U2Vzc2lvbkRvbmVBY3Rpb24gZXh0ZW5kcyBCYXNlQXJjaGl2ZUFnZW50U2Vzc2lvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZSk7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQmFzZVVuYXJjaGl2ZUFnZW50U2Vzc2lvbkFjdGlvbiBleHRlbmRzIEJhc2VBZ2VudFNlc3Npb25BY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKHdvcmRpbmc6IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcpIHtcblx0XHRjb25zdCBhY3Rpb24gPSBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25QcmVzZW50YXRpb24od29yZGluZykudW5hcmNoaXZlO1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRTZXNzaW9uLnVuYXJjaGl2ZScsXG5cdFx0XHR0aXRsZTogYWN0aW9uLnRpdGxlLFxuXHRcdFx0aWNvbjogYWN0aW9uLmljb24sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRGVsZXRlLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQmFja3NwYWNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uc1ZpZXdlckZvY3VzZWQsXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlzQXJjaGl2ZWRBZ2VudFNlc3Npb25cblx0XHRcdFx0KVxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uSXRlbVRvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaXNBcmNoaXZlZEFnZW50U2Vzc2lvbixcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25zQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmlzQXJjaGl2ZWRBZ2VudFNlc3Npb24sXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuV2l0aFNlc3Npb25zKHNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQoZmFsc2UpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVW5hcmNoaXZlQWdlbnRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQmFzZVVuYXJjaGl2ZUFnZW50U2Vzc2lvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuQXJjaGl2ZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlc3RvcmVBZ2VudFNlc3Npb25BY3Rpb24gZXh0ZW5kcyBCYXNlVW5hcmNoaXZlQWdlbnRTZXNzaW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWdlbnRTZXNzaW9uQXJjaGl2ZUFjdGlvbkNvbnN0cnVjdG9ycyh3b3JkaW5nOiBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nKTogcmVhZG9ubHkgeyBuZXcoKTogQWN0aW9uMiB9W10ge1xuXHRyZXR1cm4gd29yZGluZyA9PT0gQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lXG5cdFx0PyBbXG5cdFx0XHRNYXJrQWxsQWdlbnRTZXNzaW9uc0RvbmVBY3Rpb24sXG5cdFx0XHRNYXJrQWdlbnRTZXNzaW9uU2VjdGlvbkRvbmVBY3Rpb24sXG5cdFx0XHRSZXN0b3JlQWdlbnRTZXNzaW9uU2VjdGlvbkFjdGlvbixcblx0XHRcdE1hcmtBZ2VudFNlc3Npb25Eb25lQWN0aW9uLFxuXHRcdFx0UmVzdG9yZUFnZW50U2Vzc2lvbkFjdGlvbixcblx0XHRdXG5cdFx0OiBbXG5cdFx0XHRBcmNoaXZlQWxsQWdlbnRTZXNzaW9uc0FjdGlvbixcblx0XHRcdEFyY2hpdmVBZ2VudFNlc3Npb25TZWN0aW9uQWN0aW9uLFxuXHRcdFx0VW5hcmNoaXZlQWdlbnRTZXNzaW9uU2VjdGlvbkFjdGlvbixcblx0XHRcdEFyY2hpdmVBZ2VudFNlc3Npb25BY3Rpb24sXG5cdFx0XHRVbmFyY2hpdmVBZ2VudFNlc3Npb25BY3Rpb24sXG5cdFx0XTtcbn1cblxuZXhwb3J0IGNsYXNzIFBpbkFnZW50U2Vzc2lvbkFjdGlvbiBleHRlbmRzIEJhc2VBZ2VudFNlc3Npb25BY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRTZXNzaW9uLnBpbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdwaW4nLCBcIlBpblwiKSxcblx0XHRcdGljb246IENvZGljb24ucGluLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25JdGVtVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaXNQaW5uZWRBZ2VudFNlc3Npb24ubmVnYXRlKCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlzQXJjaGl2ZWRBZ2VudFNlc3Npb24ubmVnYXRlKClcblx0XHRcdFx0KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25zQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcwX3BpbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlzUGlubmVkQWdlbnRTZXNzaW9uLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pc0FyY2hpdmVkQWdlbnRTZXNzaW9uLm5lZ2F0ZSgpXG5cdFx0XHRcdCksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuV2l0aFNlc3Npb25zKHNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdHNlc3Npb24uc2V0UGlubmVkKHRydWUpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVW5waW5BZ2VudFNlc3Npb25BY3Rpb24gZXh0ZW5kcyBCYXNlQWdlbnRTZXNzaW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50U2Vzc2lvbi51bnBpbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd1bnBpbicsIFwiVW5waW5cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnBpbm5lZCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uSXRlbVRvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmlzUGlubmVkQWdlbnRTZXNzaW9uLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pc0FyY2hpdmVkQWdlbnRTZXNzaW9uLm5lZ2F0ZSgpXG5cdFx0XHRcdCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uc0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMF9waW4nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pc1Bpbm5lZEFnZW50U2Vzc2lvbixcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaXNBcmNoaXZlZEFnZW50U2Vzc2lvbi5uZWdhdGUoKVxuXHRcdFx0XHQpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bldpdGhTZXNzaW9ucyhzZXNzaW9uczogSUFnZW50U2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRzZXNzaW9uLnNldFBpbm5lZChmYWxzZSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogTWF0Y2hlcyBldmVyeSBzZXNzaW9uIHR5cGUgdGhhdCBzdXBwb3J0cyByZW5hbWluZzogbG9jYWwgc2Vzc2lvbnMgYW5kIGFsbFxuICogYWdlbnQtaG9zdCBzZXNzaW9uIHR5cGVzIChgYWdlbnQtaG9zdC0qYCBhbmQgYHJlbW90ZS0qYCksIG1pcnJvcmluZyB0aGVcbiAqIGdlbmVyaWMgYGlzQWdlbnRIb3N0VGFyZ2V0YCBjaGVjayB1c2VkIGJ5IHRoZSByZW5hbWUgYWN0aW9uIGJvZHkuXG4gKi9cbmNvbnN0IHJlbmFtZVN1cHBvcnRlZFNlc3Npb25UeXBlcyA9IENvbnRleHRLZXlFeHByLm9yKFxuXHRDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uVHlwZS5pc0VxdWFsVG8oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsKSxcblx0Q2hhdENvbnRleHRLZXlFeHBycy5pc0FnZW50SG9zdFNlc3Npb25JdGVtLFxuKTtcblxuZXhwb3J0IGNsYXNzIFJlbmFtZUFnZW50U2Vzc2lvbkFjdGlvbiBleHRlbmRzIEJhc2VBZ2VudFNlc3Npb25BY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBR0VOVF9TRVNTSU9OX1JFTkFNRV9BQ1RJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZW5hbWUnLCBcIlJlbmFtZS4uLlwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmhhc011bHRpcGxlQWdlbnRTZXNzaW9uc1NlbGVjdGVkLm5lZ2F0ZSgpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkYyLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25zVmlld2VyRm9jdXNlZCxcblx0XHRcdFx0XHRyZW5hbWVTdXBwb3J0ZWRTZXNzaW9uVHlwZXNcblx0XHRcdFx0KSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uc0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMV9lZGl0Jyxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdHdoZW46IHJlbmFtZVN1cHBvcnRlZFNlc3Npb25UeXBlc1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aFNlc3Npb25zKHNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10sIGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zLmF0KDApO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHRpdGxlID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoeyBwcm9tcHQ6IGxvY2FsaXplKCduZXdDaGF0VGl0bGUnLCBcIk5ldyBhZ2VudCBzZXNzaW9uIHRpdGxlXCIpLCB2YWx1ZTogc2Vzc2lvbi5sYWJlbCB9KTtcblx0XHRpZiAodGl0bGUpIHtcblx0XHRcdGlmIChpc0FnZW50SG9zdEFnZW50U2Vzc2lvbkl0ZW0oc2Vzc2lvbikpIHtcblx0XHRcdFx0YXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5yZW5hbWVDaGF0U2Vzc2lvbihzZXNzaW9uLnJlc291cmNlLCB0aXRsZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjaGF0U2VydmljZS5zZXRDaGF0U2Vzc2lvblRpdGxlKHNlc3Npb24ucmVzb3VyY2UsIHRpdGxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlbGV0ZUFnZW50U2Vzc2lvbkFjdGlvbiBleHRlbmRzIEJhc2VBZ2VudFNlc3Npb25BY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBR0VOVF9TRVNTSU9OX0RFTEVURV9BQ1RJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkZWxldGUnLCBcIkRlbGV0ZS4uLlwiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25zQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblR5cGUuaXNFcXVhbFRvKEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlFeHBycy5pc0FnZW50SG9zdFNlc3Npb25JdGVtLFxuXHRcdFx0XHQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoU2Vzc2lvbnMoc2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlOiBzZXNzaW9ucy5sZW5ndGggPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnZGVsZXRlU2Vzc2lvbi5jb25maXJtJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlIHRoaXMgY2hhdCBzZXNzaW9uP1wiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdkZWxldGVTZXNzaW9ucy5jb25maXJtJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlIHswfSBjaGF0IHNlc3Npb25zP1wiLCBzZXNzaW9ucy5sZW5ndGgpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnZGVsZXRlU2Vzc2lvbi5kZXRhaWwnLCBcIlRoaXMgYWN0aW9uIGNhbm5vdCBiZSB1bmRvbmUuXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2RlbGV0ZVNlc3Npb24uZGVsZXRlJywgXCJEZWxldGVcIilcblx0XHR9KTtcblxuXHRcdGlmICghY29uZmlybWVkLmNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlbGV0ZWRTZXNzaW9uSWRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRpZiAoaXNMb2NhbEFnZW50U2Vzc2lvbkl0ZW0oc2Vzc2lvbikpIHtcblx0XHRcdFx0Ly8gQ2xlYXIgY2hhdCB3aWRnZXQgYmVmb3JlIGRlbGV0aW9uOiBsb2NhbCBzZXNzaW9ucyBhcmUgc3RvcmVkIGluLXByb2Nlc3MgYW5kIHJlbW92YWwgY2Fubm90IGZhaWwuXG5cdFx0XHRcdGF3YWl0IHdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvbi5yZXNvdXJjZSk/LmNsZWFyKCk7XG5cblx0XHRcdFx0Ly8gUmVtb3ZlIGZyb20gc3RvcmFnZVxuXHRcdFx0XHRhd2FpdCBjaGF0U2VydmljZS5yZW1vdmVIaXN0b3J5RW50cnkoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cblx0XHRcdFx0Ly8gVHJhY2sgc2Vzc2lvbiBJRCBmb3IgY2xvdWQgY2xlYW51cFxuXHRcdFx0XHRjb25zdCBzZXNzaW9uSWQgPSBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChzZXNzaW9uSWQpIHtcblx0XHRcdFx0XHRkZWxldGVkU2Vzc2lvbklkcy5wdXNoKHNlc3Npb25JZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXNBZ2VudEhvc3RBZ2VudFNlc3Npb25JdGVtKHNlc3Npb24pKSB7XG5cdFx0XHRcdC8vIERlbGVnYXRlIHRvIHRoZSBhZ2VudCBob3N0IHNlc3Npb24gY29udHJvbGxlciwgd2hpY2ggZGlzcG9zZXMgdGhlIGJhY2tlbmQgc2Vzc2lvbiBhbmQgcmVtb3Zlc1xuXHRcdFx0XHQvLyB0aGUgaXRlbSBmcm9tIHRoZSBzaWRlYmFyLiBPbmx5IGNsZWFyIHRoZSBjaGF0IHdpZGdldCBhZnRlciBhIHN1Y2Nlc3NmdWwgZGVsZXRlIHNvIHRoYXQgYVxuXHRcdFx0XHQvLyBmYWlsdXJlIChhbmQgdGhlIHJlc3VsdGluZyBlcnJvciBkaWFsb2cpIGxlYXZlcyB0aGUgdXNlciBvbiB0aGUgc3RpbGwtZXhpc3Rpbmcgc2Vzc2lvbi5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmRlbGV0ZUNoYXRTZXNzaW9uSXRlbShzZXNzaW9uLnJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHRhd2FpdCB3aWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHNlc3Npb24ucmVzb3VyY2UpPy5jbGVhcigpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRkaWFsb2dTZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdkZWxldGVTZXNzaW9uLmVycm9yJywgXCJGYWlsZWQgdG8gZGVsZXRlIGNoYXQgc2Vzc2lvbjogezB9XCIsIHRvRXJyb3JNZXNzYWdlKGVycikpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE5vdGlmeSBleHRlbnNpb25zIHRvIGNsZWFuIHVwIGNsb3VkIGRhdGEgKGJlc3QgZWZmb3J0KVxuXHRcdGlmIChkZWxldGVkU2Vzc2lvbklkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZ2l0aHViLmNvcGlsb3Quc2Vzc2lvblN5bmMuZGVsZXRlU2Vzc2lvbkZyb21DbG91ZCcsIGRlbGV0ZWRTZXNzaW9uSWRzKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QgZWZmb3J0ICovIH0pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVsZXRlQWxsTG9jYWxTZXNzaW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmNsZWFySGlzdG9yeScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZ2VudFNlc3Npb25zLmRlbGV0ZUFsbCcsIFwiRGVsZXRlIEFsbCBMb2NhbCBXb3Jrc3BhY2UgQ2hhdCBTZXNzaW9uc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRjYXRlZ29yeTogQUdFTlRfU0VTU0lPTlNfQ0FURUdPUlksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGxvY2FsU2Vzc2lvbnNDb3VudCA9IGFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zLmZpbHRlcihzZXNzaW9uID0+IGlzTG9jYWxBZ2VudFNlc3Npb25JdGVtKHNlc3Npb24pKS5sZW5ndGg7XG5cdFx0aWYgKGxvY2FsU2Vzc2lvbnNDb3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlOiBsb2NhbFNlc3Npb25zQ291bnQgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnZGVsZXRlQWxsQ2hhdHMuY29uZmlybVNpbmdsZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSAxIGxvY2FsIHdvcmtzcGFjZSBjaGF0IHNlc3Npb24/XCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2RlbGV0ZUFsbENoYXRzLmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgezB9IGxvY2FsIHdvcmtzcGFjZSBjaGF0IHNlc3Npb25zP1wiLCBsb2NhbFNlc3Npb25zQ291bnQpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnZGVsZXRlQWxsQ2hhdHMuZGV0YWlsJywgXCJUaGlzIGFjdGlvbiBjYW5ub3QgYmUgdW5kb25lLlwiKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdkZWxldGVBbGxDaGF0cy5idXR0b24nLCBcIkRlbGV0ZSBBbGxcIilcblx0XHR9KTtcblxuXHRcdGlmICghY29uZmlybWVkLmNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIGFsbCBjaGF0IHdpZGdldHNcblx0XHRhd2FpdCBQcm9taXNlLmFsbCh3aWRnZXRTZXJ2aWNlLmdldEFsbFdpZGdldHMoKS5tYXAod2lkZ2V0ID0+IHdpZGdldC5jbGVhcigpKSk7XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBzdG9yYWdlXG5cdFx0YXdhaXQgY2hhdFNlcnZpY2UuY2xlYXJBbGxIaXN0b3J5RW50cmllcygpO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEJhc2VPcGVuQWdlbnRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQmFzZUFnZW50U2Vzc2lvbkFjdGlvbiB7XG5cblx0YXN5bmMgcnVuV2l0aFNlc3Npb25zKHNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10sIGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHRhcmdldEdyb3VwID0gdGhpcy5nZXRUYXJnZXRHcm91cCgpO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0Y29uc3QgdXJpID0gc2Vzc2lvbi5yZXNvdXJjZTtcblxuXHRcdFx0YXdhaXQgY2hhdFdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24odXJpLCB0YXJnZXRHcm91cCwge1xuXHRcdFx0XHQuLi50aGlzLmdldE9wdGlvbnMoKSxcblx0XHRcdFx0cGlubmVkOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0VGFyZ2V0R3JvdXAoKTogUHJlZmVycmVkR3JvdXA7XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldE9wdGlvbnMoKTogSUNoYXRFZGl0b3JPcHRpb25zO1xufVxuXG5leHBvcnQgY2xhc3MgT3BlbkFnZW50U2Vzc2lvbkluRWRpdG9yR3JvdXBBY3Rpb24gZXh0ZW5kcyBCYXNlT3BlbkFnZW50U2Vzc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuU2Vzc2lvbkluRWRpdG9yR3JvdXAnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuQWdlbnRTZXNzaW9uSW5FZGl0b3JHcm91cEFjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQub3BlblNlc3Npb25JbkVkaXRvckdyb3VwLmxhYmVsJywgXCJPcGVuIGFzIEVkaXRvclwiKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuRW50ZXJcblx0XHRcdFx0fSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvbnNWaWV3ZXJGb2N1c2VkLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHR9LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvbnNDb250ZXh0LFxuXHRcdFx0XHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbidcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRUYXJnZXRHcm91cCgpOiBQcmVmZXJyZWRHcm91cCB7XG5cdFx0cmV0dXJuIEFDVElWRV9HUk9VUDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRPcHRpb25zKCk6IElDaGF0RWRpdG9yT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuQWdlbnRTZXNzaW9uSW5OZXdFZGl0b3JHcm91cEFjdGlvbiBleHRlbmRzIEJhc2VPcGVuQWdlbnRTZXNzaW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5TZXNzaW9uSW5OZXdFZGl0b3JHcm91cCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5BZ2VudFNlc3Npb25Jbk5ld0VkaXRvckdyb3VwQWN0aW9uLmlkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5vcGVuU2Vzc2lvbkluTmV3RWRpdG9yR3JvdXAubGFiZWwnLCBcIk9wZW4gdG8gdGhlIFNpZGVcIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuRW50ZXJcblx0XHRcdFx0fSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvbnNWaWV3ZXJGb2N1c2VkLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHR9LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvbnNDb250ZXh0LFxuXHRcdFx0XHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbidcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRUYXJnZXRHcm91cCgpOiBQcmVmZXJyZWRHcm91cCB7XG5cdFx0cmV0dXJuIFNJREVfR1JPVVA7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0T3B0aW9ucygpOiBJQ2hhdEVkaXRvck9wdGlvbnMge1xuXHRcdHJldHVybiB7fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3BlbkFnZW50U2Vzc2lvbkluTmV3V2luZG93QWN0aW9uIGV4dGVuZHMgQmFzZU9wZW5BZ2VudFNlc3Npb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlblNlc3Npb25Jbk5ld1dpbmRvdyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5BZ2VudFNlc3Npb25Jbk5ld1dpbmRvd0FjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQub3BlblNlc3Npb25Jbk5ld1dpbmRvdy5sYWJlbCcsIFwiT3BlbiBpbiBOZXcgV2luZG93XCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvbnNDb250ZXh0LFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFRhcmdldEdyb3VwKCk6IFByZWZlcnJlZEdyb3VwIHtcblx0XHRyZXR1cm4gQVVYX1dJTkRPV19HUk9VUDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRPcHRpb25zKCk6IElDaGF0RWRpdG9yT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGF1eGlsaWFyeTogeyBjb21wYWN0OiB0cnVlLCBib3VuZHM6IHsgd2lkdGg6IDgwMCwgaGVpZ2h0OiA2NDAgfSB9XG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEFnZW50IFNlc3Npb25zIFNpZGViYXJcblxuZXhwb3J0IGNsYXNzIFJlZnJlc2hBZ2VudFNlc3Npb25zVmlld2VyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudFNlc3Npb25zVmlld2VyLnJlZnJlc2gnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVmcmVzaCcsIFwiUmVmcmVzaCBBZ2VudCBTZXNzaW9uc1wiKSxcblx0XHRcdGljb246IENvZGljb24ucmVmcmVzaCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25zVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhZ2VudFNlc3Npb25zQ29udHJvbD86IElBZ2VudFNlc3Npb25zQ29udHJvbCkge1xuXHRcdGNvbnN0IGNvbnRyb2wgPSBhZ2VudFNlc3Npb25zQ29udHJvbCA/PyBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkuZ2V0QWN0aXZlVmlld1dpdGhJZDxDaGF0Vmlld1BhbmU+KENoYXRWaWV3SWQpPy5hZ2VudFNlc3Npb25zQ29udHJvbDtcblx0XHRpZiAoY29udHJvbCkge1xuXHRcdFx0Y29udHJvbC5yZWZyZXNoKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpLmV4ZWN1dGVDb21tYW5kKCdzZXNzaW9uc1ZpZXdQYW5lLnJlZnJlc2gnKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZpbmRBZ2VudFNlc3Npb25JblZpZXdlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRTZXNzaW9uc1ZpZXdlci5maW5kJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZpbmQnLCBcIkZpbmQgQWdlbnQgU2Vzc2lvblwiKSxcblx0XHRcdGljb246IENvZGljb24uc2VhcmNoLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50U2Vzc2lvbnNUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYWdlbnRTZXNzaW9uc0NvbnRyb2w/OiBJQWdlbnRTZXNzaW9uc0NvbnRyb2wpIHtcblx0XHRjb25zdCBjb250cm9sID0gYWdlbnRTZXNzaW9uc0NvbnRyb2wgPz8gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpLmdldEFjdGl2ZVZpZXdXaXRoSWQ8Q2hhdFZpZXdQYW5lPihDaGF0Vmlld0lkKT8uYWdlbnRTZXNzaW9uc0NvbnRyb2w7XG5cdFx0aWYgKGNvbnRyb2wpIHtcblx0XHRcdHJldHVybiBjb250cm9sLm9wZW5GaW5kKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZCgnc2Vzc2lvbnNWaWV3UGFuZS5maW5kJyk7XG5cdFx0fVxuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIFVwZGF0ZUNoYXRWaWV3V2lkdGhBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdEZXNjcmlwdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgcGFuZUNvbXBvc2l0ZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSk7XG5cblx0XHRjb25zdCBjaGF0TG9jYXRpb24gPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZChDaGF0Vmlld0lkKTtcblx0XHRpZiAodHlwZW9mIGNoYXRMb2NhdGlvbiAhPT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybjsgLy8gd2UgbmVlZCBhIHZpZXcgbG9jYXRpb25cblx0XHR9XG5cblx0XHQvLyBEZXRlcm1pbmUgaWYgd2UgY2FuIHJlc2l6ZSB0aGUgdmlldzogdGhpcyBpcyBub3QgcG9zc2libGVcblx0XHQvLyBmb3Igd2hlbiB0aGUgY2hhdCB2aWV3IGlzIGluIHRoZSBwYW5lbCBhdCB0aGUgdG9wIG9yIGJvdHRvbVxuXHRcdGNvbnN0IHBhbmVsUG9zaXRpb24gPSBsYXlvdXRTZXJ2aWNlLmdldFBhbmVsUG9zaXRpb24oKTtcblx0XHRjb25zdCBjYW5SZXNpemVWaWV3ID0gY2hhdExvY2F0aW9uICE9PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwgfHwgKHBhbmVsUG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQgfHwgcGFuZWxQb3NpdGlvbiA9PT0gUG9zaXRpb24uUklHSFQpO1xuXG5cdFx0Ly8gVXBkYXRlIGNvbmZpZ3VyYXRpb24gaWYgbmVlZGVkXG5cdFx0Y29uc3QgY2hhdFZpZXdTZXNzaW9uc0VuYWJsZWQgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zRW5hYmxlZCk7XG5cdFx0aWYgKCFjaGF0Vmlld1Nlc3Npb25zRW5hYmxlZCkge1xuXHRcdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc0VuYWJsZWQsIHRydWUpO1xuXHRcdH1cblxuXHRcdGxldCBjaGF0VmlldyA9IHZpZXdzU2VydmljZS5nZXRBY3RpdmVWaWV3V2l0aElkPENoYXRWaWV3UGFuZT4oQ2hhdFZpZXdJZCk7XG5cdFx0aWYgKCFjaGF0Vmlldykge1xuXHRcdFx0Y2hhdFZpZXcgPSBhd2FpdCB2aWV3c1NlcnZpY2Uub3BlblZpZXc8Q2hhdFZpZXdQYW5lPihDaGF0Vmlld0lkLCBmYWxzZSk7XG5cdFx0fVxuXHRcdGlmICghY2hhdFZpZXcpIHtcblx0XHRcdHJldHVybjsgLy8gd2UgbmVlZCB0aGUgY2hhdCB2aWV3XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlndXJlZE9yaWVudGF0aW9uID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J3N0YWNrZWQnIHwgJ3NpZGVCeVNpZGUnIHwgdW5rbm93bj4oQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc09yaWVudGF0aW9uKTtcblx0XHRsZXQgdmFsaWRhdGVkQ29uZmlndXJlZE9yaWVudGF0aW9uOiAnc3RhY2tlZCcgfCAnc2lkZUJ5U2lkZSc7XG5cdFx0aWYgKGNvbmZpZ3VyZWRPcmllbnRhdGlvbiA9PT0gJ3N0YWNrZWQnIHx8IGNvbmZpZ3VyZWRPcmllbnRhdGlvbiA9PT0gJ3NpZGVCeVNpZGUnKSB7XG5cdFx0XHR2YWxpZGF0ZWRDb25maWd1cmVkT3JpZW50YXRpb24gPSBjb25maWd1cmVkT3JpZW50YXRpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhbGlkYXRlZENvbmZpZ3VyZWRPcmllbnRhdGlvbiA9ICdzaWRlQnlTaWRlJzsgLy8gZGVmYXVsdFxuXHRcdH1cblxuXHRcdGNvbnN0IG5ld09yaWVudGF0aW9uID0gdGhpcy5nZXRPcmllbnRhdGlvbigpO1xuXHRcdGNvbnN0IGxhc3RXaWR0aEZvck9yaWVudGF0aW9uID0gY2hhdFZpZXc/LmdldExhc3REaW1lbnNpb25zKG5ld09yaWVudGF0aW9uKT8ud2lkdGg7XG5cblx0XHRpZiAoKCFjYW5SZXNpemVWaWV3IHx8IHZhbGlkYXRlZENvbmZpZ3VyZWRPcmllbnRhdGlvbiA9PT0gJ3NpZGVCeVNpZGUnKSAmJiBuZXdPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlN0YWNrZWQpIHtcblx0XHRcdGNoYXRWaWV3LnVwZGF0ZUNvbmZpZ3VyZWRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uKCdzdGFja2VkJyk7XG5cdFx0fSBlbHNlIGlmICgoIWNhblJlc2l6ZVZpZXcgfHwgdmFsaWRhdGVkQ29uZmlndXJlZE9yaWVudGF0aW9uID09PSAnc3RhY2tlZCcpICYmIG5ld09yaWVudGF0aW9uID09PSBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU2lkZUJ5U2lkZSkge1xuXHRcdFx0Y2hhdFZpZXcudXBkYXRlQ29uZmlndXJlZFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24oJ3NpZGVCeVNpZGUnKTtcblx0XHR9XG5cblx0XHRpZiAoIWNhblJlc2l6ZVZpZXcpIHtcblx0XHRcdHJldHVybjsgLy8gbG9jYXRpb24gZG9lcyBub3QgYWxsb3cgZm9yIHJlc2l6ZSAocGFuZWwgdG9wIG9yIGJvdHRvbSlcblx0XHR9XG5cblx0XHRjb25zdCBwYXJ0ID0gcGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0UGFydElkKGNoYXRMb2NhdGlvbik7XG5cdFx0bGV0IGN1cnJlbnRTaXplID0gbGF5b3V0U2VydmljZS5nZXRTaXplKHBhcnQpO1xuXG5cdFx0Y29uc3QgY2hhdFZpZXdEZWZhdWx0V2lkdGggPSAzMDA7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNWaWV3RGVmYXVsdFdpZHRoID0gY2hhdFZpZXdEZWZhdWx0V2lkdGg7XG5cdFx0Y29uc3Qgc2lkZUJ5U2lkZU1pbldpZHRoID0gY2hhdFZpZXdEZWZhdWx0V2lkdGggKyBzZXNzaW9uc1ZpZXdEZWZhdWx0V2lkdGggKyAxO1x0Ly8gYWNjb3VudCBmb3IgcG9zc2libGUgdGhlbWUgYm9yZGVyXG5cblx0XHRpZiAoXG5cdFx0XHQobmV3T3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TaWRlQnlTaWRlICYmIGN1cnJlbnRTaXplLndpZHRoID49IHNpZGVCeVNpZGVNaW5XaWR0aCkgfHxcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIGFscmVhZHkgd2lkZSBlbm91Z2ggdG8gc2hvdyBzaWRlIGJ5IHNpZGVcblx0XHRcdChuZXdPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlN0YWNrZWQgJiYgY2hhdExvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyICYmIGxheW91dFNlcnZpY2UuaXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoKSkgXHQvLyB0cnkgdG8gbm90IGxlYXZlIG1heGltaXplZCBzdGF0ZSBpZiBtYXhpbWl6ZWRcblx0XHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBMZWF2ZSBtYXhpbWl6ZWQgc3RhdGUgaWYgYXBwbGljYWJsZVxuXHRcdGlmIChjaGF0TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpIHtcblx0XHRcdGxheW91dFNlcnZpY2Uuc2V0QXV4aWxpYXJ5QmFyTWF4aW1pemVkKGZhbHNlKTtcblx0XHRcdGN1cnJlbnRTaXplID0gbGF5b3V0U2VydmljZS5nZXRTaXplKHBhcnQpO1xuXHRcdH1cblxuXHRcdC8vIEZpZ3VyZSBvdXQgdGhlIHJpZ2h0IG5ldyB3aWR0aFxuXHRcdGxldCBuZXdXaWR0aDogbnVtYmVyO1xuXHRcdGlmIChuZXdPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlNpZGVCeVNpZGUpIHtcblx0XHRcdG5ld1dpZHRoID0gTWF0aC5tYXgoc2lkZUJ5U2lkZU1pbldpZHRoLCBsYXN0V2lkdGhGb3JPcmllbnRhdGlvbiB8fCBNYXRoLnJvdW5kKGxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAvIDIpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bmV3V2lkdGggPSBsYXN0V2lkdGhGb3JPcmllbnRhdGlvbiB8fCBNYXRoLm1heChjaGF0Vmlld0RlZmF1bHRXaWR0aCwgY3VycmVudFNpemUud2lkdGggLSBzZXNzaW9uc1ZpZXdEZWZhdWx0V2lkdGgpO1xuXHRcdH1cblxuXHRcdC8vIEFwcGx5IHRoZSBuZXcgd2lkdGhcblx0XHRsYXlvdXRTZXJ2aWNlLnNldFNpemUocGFydCwgeyB3aWR0aDogbmV3V2lkdGgsIGhlaWdodDogY3VycmVudFNpemUuaGVpZ2h0IH0pO1xuXG5cdFx0Ly8gSWYgd2UgZmlndXJlIG91dCB0aGF0IHRoZSB3aWR0aCB3YXMgbm90IGFwcGxpZWQgZHVlIHRvIGNvbnN0cmFpbnRzIChzdWNoIGFzIHdpbmRvdyBkaW1lbnNpb25zKSxcblx0XHQvLyB3ZSBtYXhpbWl6ZSB0aGUgYXV4aWxpYXJ5IGJhciB0byBlbnN1cmUgdGhlIHNpZGUgYnkgc2lkZSBleHBlcmllbmNlIGlzIG9wdGltYWxcblx0XHRjb25zdCBhY3R1YWxTaXplID0gbGF5b3V0U2VydmljZS5nZXRTaXplKHBhcnQpO1xuXHRcdGlmIChcblx0XHRcdGNoYXRMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhciAmJlx0XHRcdC8vIG9ubHkgYXBwbGljYWJsZSBmb3IgYXV4aWxpYXJ5IGJhclxuXHRcdFx0bmV3T3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TaWRlQnlTaWRlICYmXHQvLyBvbmx5IGFwcGxpY2FibGUgd2hlbiBnb2luZyB0byBzaWRlIGJ5IHNpZGVcblx0XHRcdGFjdHVhbFNpemUud2lkdGggPCBzaWRlQnlTaWRlTWluV2lkdGhcdFx0XHRcdFx0XHRcdC8vIHdpZHRoIGlzIHN0aWxsIG5vdCBlbm91Z2ggZm9yIHNpZGUgYnkgc2lkZVxuXHRcdCkge1xuXHRcdFx0bGF5b3V0U2VydmljZS5zZXRBdXhpbGlhcnlCYXJNYXhpbWl6ZWQodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0YWJzdHJhY3QgZ2V0T3JpZW50YXRpb24oKTogQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uO1xufVxuXG5leHBvcnQgY2xhc3MgU2hvd0FnZW50U2Vzc2lvbnNTaWRlYmFyIGV4dGVuZHMgVXBkYXRlQ2hhdFZpZXdXaWR0aEFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2FnZW50U2Vzc2lvbnMuc2hvd0FnZW50U2Vzc2lvbnNTaWRlYmFyJztcblx0c3RhdGljIHJlYWRvbmx5IFRJVExFID0gbG9jYWxpemUyKCdzaG93QWdlbnRTZXNzaW9uc1NpZGViYXInLCBcIlNob3cgQWdlbnQgU2Vzc2lvbnMgU2lkZWJhclwiKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2hvd0FnZW50U2Vzc2lvbnNTaWRlYmFyLklELFxuXHRcdFx0dGl0bGU6IFNob3dBZ2VudFNlc3Npb25zU2lkZWJhci5USVRMRSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5pc0VxdWFsVG8oQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlN0YWNrZWQpLFxuXHRcdFx0KSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IEFHRU5UX1NFU1NJT05TX0NBVEVHT1JZLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0T3JpZW50YXRpb24oKTogQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uIHtcblx0XHRyZXR1cm4gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlNpZGVCeVNpZGU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEhpZGVBZ2VudFNlc3Npb25zU2lkZWJhciBleHRlbmRzIFVwZGF0ZUNoYXRWaWV3V2lkdGhBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdhZ2VudFNlc3Npb25zLmhpZGVBZ2VudFNlc3Npb25zU2lkZWJhcic7XG5cdHN0YXRpYyByZWFkb25seSBUSVRMRSA9IGxvY2FsaXplMignaGlkZUFnZW50U2Vzc2lvbnNTaWRlYmFyJywgXCJIaWRlIEFnZW50IFNlc3Npb25zIFNpZGViYXJcIik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEhpZGVBZ2VudFNlc3Npb25zU2lkZWJhci5JRCxcblx0XHRcdHRpdGxlOiBIaWRlQWdlbnRTZXNzaW9uc1NpZGViYXIuVElUTEUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uaXNFcXVhbFRvKEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TaWRlQnlTaWRlKSxcblx0XHRcdCksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBBR0VOVF9TRVNTSU9OU19DQVRFR09SWSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldE9yaWVudGF0aW9uKCk6IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiB7XG5cdFx0cmV0dXJuIEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TdGFja2VkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVBZ2VudFNlc3Npb25zU2lkZWJhciBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdhZ2VudFNlc3Npb25zLnRvZ2dsZUFnZW50U2Vzc2lvbnNTaWRlYmFyJztcblx0c3RhdGljIHJlYWRvbmx5IFRJVExFID0gbG9jYWxpemUyKCd0b2dnbGVBZ2VudFNlc3Npb25zU2lkZWJhcicsIFwiVG9nZ2xlIEFnZW50IFNlc3Npb25zIFNpZGViYXJcIik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRvZ2dsZUFnZW50U2Vzc2lvbnNTaWRlYmFyLklELFxuXHRcdFx0dGl0bGU6IFRvZ2dsZUFnZW50U2Vzc2lvbnNTaWRlYmFyLlRJVExFLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IEFHRU5UX1NFU1NJT05TX0NBVEVHT1JZLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cblx0XHRjb25zdCBjaGF0VmlldyA9IHZpZXdzU2VydmljZS5nZXRBY3RpdmVWaWV3V2l0aElkPENoYXRWaWV3UGFuZT4oQ2hhdFZpZXdJZCk7XG5cdFx0Y29uc3QgY3VycmVudE9yaWVudGF0aW9uID0gY2hhdFZpZXc/LmdldFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24oKTtcblxuXHRcdGlmIChjdXJyZW50T3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TaWRlQnlTaWRlKSB7XG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChIaWRlQWdlbnRTZXNzaW9uc1NpZGViYXIuSUQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChTaG93QWdlbnRTZXNzaW9uc1NpZGViYXIuSUQpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRm9jdXNBZ2VudFNlc3Npb25zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5mb2N1c0FnZW50U2Vzc2lvbnNWaWV3ZXInO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBGb2N1c0FnZW50U2Vzc2lvbnNBY3Rpb24uaWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LmZvY3VzQWdlbnRTZXNzaW9uc1ZpZXdlci5sYWJlbCcsIFwiRm9jdXMgQWdlbnQgU2Vzc2lvbnNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc0VuYWJsZWR9YCwgdHJ1ZSlcblx0XHRcdCksXG5cdFx0XHRjYXRlZ29yeTogQUdFTlRfU0VTU0lPTlNfQ0FURUdPUlksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCBjaGF0VmlldyA9IGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldzxDaGF0Vmlld1BhbmU+KENoYXRWaWV3SWQsIHRydWUpO1xuXHRcdGNvbnN0IGZvY3VzZWQgPSBjaGF0Vmlldz8uZm9jdXNTZXNzaW9ucygpO1xuXHRcdGlmIChmb2N1c2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlndXJlZFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnc3RhY2tlZCcgfCAnc2lkZUJ5U2lkZScgfCB1bmtub3duPihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zT3JpZW50YXRpb24pO1xuXHRcdGlmIChjb25maWd1cmVkU2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9PT0gJ3N0YWNrZWQnKSB7XG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBQ1RJT05fSURfTkVXX0NIQVQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChTaG93QWdlbnRTZXNzaW9uc1NpZGViYXIuSUQpO1xuXHRcdH1cblxuXHRcdGNoYXRWaWV3Py5mb2N1c1Nlc3Npb25zKCk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMscUJBQTBGLDZCQUE2Qix1QkFBdUIseUJBQXlCLHVDQUF1QztB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
