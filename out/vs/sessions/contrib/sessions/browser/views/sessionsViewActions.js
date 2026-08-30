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
import { Codicon } from "../../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { isMobile, isWeb } from "../../../../../base/common/platform.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IViewsService } from "../../../../../workbench/services/views/common/viewsService.js";
import { CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID } from "../../../../browser/workbench.js";
import { EditorsVisibleContext, EditorAreaFocusContext, IsSessionsWindowContext } from "../../../../../workbench/common/contextkeys.js";
import { SessionsCategories } from "../../../../common/categories.js";
import { RENAME_SESSION_COMMAND_ID, UNARCHIVE_SESSION_COMMAND_ID } from "../../../../common/sessionCommands.js";
import { SessionSupportsDeleteContext, SessionSupportsRenameContext, IsNewChatSessionContext, SessionIsArchivedContext, SessionIsCreatedContext, SessionIsReadContext } from "../../../../common/contextkeys.js";
import { SessionItemToolbarMenuId, SessionItemContextMenuId, SessionSectionToolbarMenuId, SessionGroupToolbarMenuId, SessionSectionTypeContext, SessionGroupHasVisibleSessionsContext, SessionGroupIsEmptyContext, IsSessionPinnedContext, SessionsGrouping, SessionsSorting } from "./sessionsList.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { ISessionGroupsService } from "../../../../services/sessions/browser/sessionGroupsService.js";
import { IsWorkspaceGroupCappedContext, SessionsViewFilterOptionsSubMenu, SessionsViewFilterSubMenu, SessionsViewGroupingContext, SessionsViewId, SessionsViewSortingContext, openSessionToTheSide } from "./sessionsView.js";
import { Menus } from "../../../../browser/menus.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ChatContextKeys } from "../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, getChatSessionArchiveActionPresentation, getChatSessionArchiveActionWording } from "../../../../../platform/chat/common/sessionArchiveActions.js";
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { ISessionsPartService } from "../../../../services/sessions/browser/sessionsPartService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../workbench/common/contributions.js";
import { ICustomViewService } from "../../../../services/customView/browser/customViewService.js";
import { IAutomationService } from "../../../../../workbench/contrib/chat/common/automations/automationService.js";
import { AUTOMATIONS_CUSTOM_VIEW_ID } from "../automationsConstants.js";
const CLOSE_SESSION_COMMAND_ID = "sessionsViewPane.closeSession";
registerAction2(class CloseSessionAction extends Action2 {
  constructor() {
    super({
      id: CLOSE_SESSION_COMMAND_ID,
      title: localize2("closeSession", "Close Session"),
      f1: true,
      precondition: ContextKeyExpr.and(IsNewChatSessionContext.negate(), EditorsVisibleContext.negate()),
      category: SessionsCategories.Sessions
    });
  }
  async run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    sessionsService.openNewSession();
  }
});
KeybindingsRegistry.registerKeybindingRule({
  id: CLOSE_SESSION_COMMAND_ID,
  weight: KeybindingWeight.SessionsContrib,
  when: ContextKeyExpr.and(IsNewChatSessionContext.negate(), EditorsVisibleContext.negate()),
  primary: KeyMod.CtrlCmd | KeyCode.KeyW,
  win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] }
});
const OPEN_SESSION_AT_INDEX_COMMAND_ID = "sessionsViewPane.openSessionAtIndex";
function digitToKeyCode(digit) {
  switch (digit) {
    case 1:
      return KeyCode.Digit1;
    case 2:
      return KeyCode.Digit2;
    case 3:
      return KeyCode.Digit3;
    case 4:
      return KeyCode.Digit4;
    case 5:
      return KeyCode.Digit5;
    case 6:
      return KeyCode.Digit6;
    case 7:
      return KeyCode.Digit7;
    case 8:
      return KeyCode.Digit8;
    case 9:
      return KeyCode.Digit9;
    default:
      return KeyCode.Unknown;
  }
}
const openSessionAtIndex = (accessor, sessionIndex) => {
  if (typeof sessionIndex !== "number") {
    return;
  }
  const viewsService = accessor.get(IViewsService);
  const sessionsService = accessor.get(ISessionsService);
  const view = viewsService.getViewWithId(SessionsViewId);
  const visible = view?.sessionsControl?.getVisibleSessions() ?? [];
  if (visible.length === 0) {
    return;
  }
  const target = sessionIndex === -1 ? visible[visible.length - 1] : visible[sessionIndex];
  if (!target) {
    return;
  }
  sessionsService.openSession(target.resource);
};
CommandsRegistry.registerCommand({
  id: OPEN_SESSION_AT_INDEX_COMMAND_ID,
  handler: openSessionAtIndex
});
for (let visibleIndex = 1; visibleIndex <= 9; visibleIndex++) {
  const sessionIndex = visibleIndex === 9 ? -1 : visibleIndex - 1;
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: OPEN_SESSION_AT_INDEX_COMMAND_ID + visibleIndex,
    weight: KeybindingWeight.SessionsContrib,
    when: IsSessionsWindowContext,
    primary: KeyMod.Alt | digitToKeyCode(visibleIndex),
    mac: { primary: KeyMod.WinCtrl | digitToKeyCode(visibleIndex) },
    handler: (accessor) => openSessionAtIndex(accessor, sessionIndex)
  });
}
const navigateSessionInList = async (accessor, direction) => {
  const viewsService = accessor.get(IViewsService);
  const sessionsService = accessor.get(ISessionsService);
  const view = viewsService.getViewWithId(SessionsViewId);
  const visible = view?.sessionsControl?.getVisibleSessions() ?? [];
  if (visible.length === 0) {
    return;
  }
  const activeResource = sessionsService.activeSession.get()?.resource.toString();
  const currentIndex = activeResource === void 0 ? -1 : visible.findIndex((session) => session.resource.toString() === activeResource);
  let targetIndex;
  if (currentIndex === -1) {
    targetIndex = direction === "next" ? 0 : visible.length - 1;
  } else {
    targetIndex = direction === "next" ? Math.min(currentIndex + 1, visible.length - 1) : Math.max(currentIndex - 1, 0);
  }
  if (targetIndex === currentIndex) {
    return;
  }
  const target = visible[targetIndex];
  if (target) {
    await sessionsService.openSession(target.resource);
  }
};
registerAction2(class NavigatePreviousSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.navigatePreviousSession",
      title: {
        value: localize("navigatePreviousSession", "Go to Previous Session"),
        original: "Go to Previous Session",
        mnemonicTitle: localize("navigatePreviousSession.mnemonic", "&&Previous Session")
      },
      f1: true,
      category: SessionsCategories.Sessions,
      keybinding: {
        // Mirror core "Previous Editor"; keep Alt+Up as a sessions-only alternate outside the editor area.
        weight: KeybindingWeight.SessionsContrib,
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated()),
        primary: KeyMod.CtrlCmd | KeyCode.PageUp,
        secondary: [KeyMod.Alt | KeyCode.UpArrow],
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow,
          secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft, KeyMod.Alt | KeyCode.UpArrow]
        }
      },
      menu: [{
        id: Menus.GoMenu,
        group: "2_list_nav",
        order: 1
      }]
    });
  }
  run(accessor) {
    return navigateSessionInList(accessor, "previous");
  }
});
registerAction2(class NavigateNextSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.navigateNextSession",
      title: {
        value: localize("navigateNextSession", "Go to Next Session"),
        original: "Go to Next Session",
        mnemonicTitle: localize("navigateNextSession.mnemonic", "&&Next Session")
      },
      f1: true,
      category: SessionsCategories.Sessions,
      keybinding: {
        // Mirror core "Next Editor"; keep Alt+Down as a sessions-only alternate outside the editor area.
        weight: KeybindingWeight.SessionsContrib,
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated()),
        primary: KeyMod.CtrlCmd | KeyCode.PageDown,
        secondary: [KeyMod.Alt | KeyCode.DownArrow],
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow,
          secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight, KeyMod.Alt | KeyCode.DownArrow]
        }
      },
      menu: [{
        id: Menus.GoMenu,
        group: "2_list_nav",
        order: 2
      }]
    });
  }
  run(accessor) {
    return navigateSessionInList(accessor, "next");
  }
});
MenuRegistry.appendMenuItem(Menus.SidebarSessionsHeader, {
  submenu: SessionsViewFilterSubMenu,
  title: localize2("filterSessions", "Filter Sessions"),
  icon: Codicon.settings,
  group: "navigation",
  order: 10
});
MenuRegistry.appendMenuItem(Menus.SidebarSessionsHeader, {
  command: {
    id: "sessionsViewPane.find",
    title: localize2("find", "Find Session"),
    icon: Codicon.search
  },
  group: "navigation",
  order: 20
});
MenuRegistry.appendMenuItem(SessionsViewFilterSubMenu, {
  submenu: SessionsViewFilterOptionsSubMenu,
  title: localize2("filter", "Filter"),
  group: "0_filter",
  order: 0
});
registerAction2(class SortByCreatedAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.sortByCreated",
      title: localize2("sortByCreated", "Sort by Created"),
      category: SessionsCategories.Sessions,
      toggled: ContextKeyExpr.equals(SessionsViewSortingContext.key, SessionsSorting.Created),
      menu: [{ id: SessionsViewFilterSubMenu, group: "1_sort", order: 0 }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.setSorting(SessionsSorting.Created);
  }
});
registerAction2(class SortByUpdatedAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.sortByUpdated",
      title: localize2("sortByUpdated", "Sort by Updated"),
      category: SessionsCategories.Sessions,
      toggled: ContextKeyExpr.equals(SessionsViewSortingContext.key, SessionsSorting.Updated),
      menu: [{ id: SessionsViewFilterSubMenu, group: "1_sort", order: 1 }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.setSorting(SessionsSorting.Updated);
  }
});
registerAction2(class GroupByWorkspaceAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.groupByWorkspace",
      title: localize2("groupByWorkspace", "Group by Workspace"),
      category: SessionsCategories.Sessions,
      toggled: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Workspace),
      menu: [{ id: SessionsViewFilterSubMenu, group: "2_group", order: 0 }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.setGrouping(SessionsGrouping.Workspace);
  }
});
registerAction2(class GroupByTimeAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.groupByTime",
      title: localize2("groupByTime", "Group by Time"),
      category: SessionsCategories.Sessions,
      toggled: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Date),
      menu: [{ id: SessionsViewFilterSubMenu, group: "2_group", order: 1 }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.setGrouping(SessionsGrouping.Date);
  }
});
registerAction2(class ShowRecentWorkspaceSessionsAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.showRecentSessions",
      title: localize2("showRecentSessions", "Show Recent Sessions"),
      category: SessionsCategories.Sessions,
      toggled: IsWorkspaceGroupCappedContext,
      menu: [{
        id: SessionsViewFilterSubMenu,
        group: "3_cap",
        order: 0,
        when: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Workspace)
      }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.sessionsControl?.setWorkspaceGroupCapped(true);
    IsWorkspaceGroupCappedContext.bindTo(accessor.get(IContextKeyService)).set(true);
  }
});
registerAction2(class ShowAllWorkspaceSessionsAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.showAllSessions",
      title: localize2("showAllSessions", "Show All Sessions"),
      category: SessionsCategories.Sessions,
      toggled: IsWorkspaceGroupCappedContext.negate(),
      menu: [{
        id: SessionsViewFilterSubMenu,
        group: "3_cap",
        order: 1,
        when: ContextKeyExpr.equals(SessionsViewGroupingContext.key, SessionsGrouping.Workspace)
      }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.sessionsControl?.setWorkspaceGroupCapped(false);
    IsWorkspaceGroupCappedContext.bindTo(accessor.get(IContextKeyService)).set(false);
  }
});
registerAction2(class CollapseAllGroupsAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.collapseAllGroups",
      title: localize2("collapseAllGroups", "Collapse All Groups"),
      category: SessionsCategories.Sessions,
      menu: [{ id: SessionsViewFilterSubMenu, group: "4_collapse", order: 0 }]
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    view?.sessionsControl?.collapseAllSections();
  }
});
registerAction2(class RefreshSessionsAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.refresh",
      title: localize2("refresh", "Refresh Sessions"),
      icon: Codicon.refresh,
      f1: true,
      category: SessionsCategories.Sessions
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    return view?.sessionsControl?.refresh();
  }
});
registerAction2(class FindSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.find",
      title: localize2("find", "Find Session"),
      icon: Codicon.search,
      category: SessionsCategories.Sessions
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    return view?.openFind();
  }
});
registerAction2(class NewSessionForWorkspaceAction extends Action2 {
  constructor() {
    super({
      id: "sessionsView.sectionNewSession",
      title: localize2("newSessionForWorkspace", "New Session"),
      icon: Codicon.plus,
      menu: [{
        id: SessionSectionToolbarMenuId,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.equals(SessionSectionTypeContext.key, "workspace")
      }]
    });
  }
  async run(accessor, context) {
    if (!context || !context.sessions || context.sessions.length === 0) {
      return;
    }
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    const commandService = accessor.get(ICommandService);
    sessionsService.openNewSession();
    const session = context.sessions[0];
    const workspace = session.workspace.get();
    const folderUri = workspace?.folders[0]?.root;
    const providerId = session.providerId;
    const newSession = sessionsService.activeSession.get();
    if (folderUri) {
      sessionsPartService.getSessionView(newSession?.sessionId)?.selectWorkspace(folderUri, providerId);
    }
    if (isWeb && isMobile) {
      commandService.executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
    }
    sessionsPartService.focusSession(newSession);
  }
});
const NEW_QUICK_CHAT_COMMAND_ID = "sessionsView.newQuickChat";
const QuickChatEnabledContext = ContextKeyExpr.and(
  ChatContextKeys.enabled,
  AGENT_HOST_ENABLED_CONTEXT_KEY
);
registerAction2(class NewQuickChatAction extends Action2 {
  constructor() {
    super({
      id: NEW_QUICK_CHAT_COMMAND_ID,
      title: localize2("newQuickChat", "New Quick Chat"),
      icon: Codicon.add,
      category: SessionsCategories.Sessions,
      f1: true,
      precondition: QuickChatEnabledContext,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyN),
        when: ContextKeyExpr.and(QuickChatEnabledContext, IsSessionsWindowContext, EditorAreaFocusContext.negate())
      },
      menu: [
        {
          // Sole create affordance for quick chats: the "+" on the
          // always-visible in-list "Chats" section header. Opens the
          // composer; the session type is chosen via its inline picker.
          id: SessionSectionToolbarMenuId,
          group: "navigation",
          order: 0,
          when: ContextKeyExpr.and(QuickChatEnabledContext, ContextKeyExpr.equals(SessionSectionTypeContext.key, "quickchats"))
        }
      ]
    });
  }
  run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    const activeQuickChat = sessionsService.openQuickChat();
    if (isWeb && isMobile) {
      accessor.get(ICommandService).executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
    }
    accessor.get(ISessionsPartService).focusSession(activeQuickChat);
  }
});
const ConfirmArchiveStorageKey = "sessions.confirmArchive";
function getArchiveSectionConfirmationMessage(context, wording) {
  if (context.id === "pinned") {
    if (context.sessions.length === 1) {
      return wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markPinnedSectionSessionDone.confirmSingle", "Are you sure you want to mark 1 pinned session as done?") : localize("archivePinnedSectionSession.confirmSingle", "Are you sure you want to archive 1 pinned session?");
    }
    return wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markPinnedSectionSessionsDone.confirm", "Are you sure you want to mark {0} pinned sessions as done?", context.sessions.length) : localize("archivePinnedSectionSessions.confirm", "Are you sure you want to archive {0} pinned sessions?", context.sessions.length);
  }
  if (context.sessions.length === 1) {
    return wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markSectionSessionDone.confirmSingle", "Are you sure you want to mark 1 session from '{0}' as done?", context.label) : localize("archiveSectionSession.confirmSingle", "Are you sure you want to archive 1 session from '{0}'?", context.label);
  }
  return wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markSectionSessionsDone.confirm", "Are you sure you want to mark {0} sessions from '{1}' as done?", context.sessions.length, context.label) : localize("archiveSectionSessions.confirm", "Are you sure you want to archive {0} sessions from '{1}'?", context.sessions.length, context.label);
}
class BaseArchiveSectionAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).archiveAll;
    super({
      id: "sessionsView.sectionArchive",
      title: action.title,
      icon: action.icon,
      menu: [{
        id: SessionSectionToolbarMenuId,
        group: "navigation",
        order: 0,
        // Not on Done itself, and not on the "Chats" (quick chats) section.
        // Also not on Automations.
        when: ContextKeyExpr.and(
          ContextKeyExpr.notEquals(SessionSectionTypeContext.key, "archived"),
          ContextKeyExpr.notEquals(SessionSectionTypeContext.key, "quickchats"),
          ContextKeyExpr.notEquals(SessionSectionTypeContext.key, "automations")
        )
      }]
    });
    this.wording = wording;
  }
  async run(accessor, context) {
    if (!context || !context.sessions || context.sessions.length === 0) {
      return;
    }
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const dialogService = accessor.get(IDialogService);
    const storageService = accessor.get(IStorageService);
    const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, StorageScope.PROFILE, false);
    if (!skipConfirmation) {
      const confirmed = await dialogService.confirm({
        message: getArchiveSectionConfirmationMessage(context, this.wording),
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
      await sessionsManagementService.archiveSession(session);
    }
  }
}
class ArchiveSectionAction extends BaseArchiveSectionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class MarkSectionSessionsDoneAction extends BaseArchiveSectionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
function getArchiveGroupConfirmationMessage(context, wording) {
  if (context.sessions.length === 1) {
    return wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markGroupSessionDone.confirmSingle", "Are you sure you want to mark 1 session from '{0}' as done?", context.group.name) : localize("archiveGroupSession.confirmSingle", "Are you sure you want to archive 1 session from '{0}'?", context.group.name);
  }
  return wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markGroupSessionsDone.confirm", "Are you sure you want to mark {0} sessions from '{1}' as done?", context.sessions.length, context.group.name) : localize("archiveGroupSessions.confirm", "Are you sure you want to archive {0} sessions from '{1}'?", context.sessions.length, context.group.name);
}
class BaseArchiveSessionsInGroupAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).archiveAll;
    super({
      id: "sessionsView.markAllInGroupAsDone",
      title: action.title,
      icon: action.icon,
      menu: [{
        id: SessionGroupToolbarMenuId,
        group: "navigation",
        order: 0,
        when: SessionGroupHasVisibleSessionsContext
      }]
    });
    this.wording = wording;
  }
  async run(accessor, context) {
    if (!context || !context.sessions || context.sessions.length === 0) {
      return;
    }
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const dialogService = accessor.get(IDialogService);
    const storageService = accessor.get(IStorageService);
    const skipConfirmation = storageService.getBoolean(ConfirmArchiveStorageKey, StorageScope.PROFILE, false);
    if (!skipConfirmation) {
      const confirmed = await dialogService.confirm({
        message: getArchiveGroupConfirmationMessage(context, this.wording),
        detail: this.wording === ChatSessionArchiveActionWording.MarkAsDone ? localize("markGroupSessionsDone.detail", "You can restore sessions later if needed from the sessions view.") : localize("archiveGroupSessions.detail", "You can unarchive sessions later if needed from the sessions view."),
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
      await sessionsManagementService.archiveSession(session);
    }
  }
}
class ArchiveSessionsInGroupAction extends BaseArchiveSessionsInGroupAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class MarkAllSessionsInGroupAsDoneAction extends BaseArchiveSessionsInGroupAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
registerAction2(class DeleteEmptySessionGroupAction extends Action2 {
  constructor() {
    super({
      id: "sessionsView.deleteEmptyGroup",
      title: localize2("deleteEmptyGroup", "Delete Group"),
      icon: Codicon.trash,
      menu: [{
        id: SessionGroupToolbarMenuId,
        group: "navigation",
        order: 0,
        when: SessionGroupIsEmptyContext
      }]
    });
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const sessionGroupsService = accessor.get(ISessionGroupsService);
    if (sessionGroupsService.getSessionIdsInGroup(context.group.id).length === 0) {
      sessionGroupsService.deleteGroup(context.group.id);
    }
  }
});
registerAction2(class NewSessionInGroupAction extends Action2 {
  constructor() {
    super({
      id: "sessionsView.newSessionInGroup",
      title: localize2("newSessionInGroup", "New Session"),
      icon: Codicon.plus,
      menu: [{
        id: SessionGroupToolbarMenuId,
        group: "navigation",
        order: 1
      }]
    });
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    const sessionGroupsService = accessor.get(ISessionGroupsService);
    const commandService = accessor.get(ICommandService);
    sessionsService.openNewSession();
    sessionGroupsService.setPendingNewSessionGroup(context.group.id);
    if (isWeb && isMobile) {
      commandService.executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
    }
    sessionsPartService.focusSession(sessionsService.activeSession.get());
  }
});
registerAction2(class PinSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.pinSession",
      title: localize2("pinSession", "Pin"),
      icon: Codicon.pin,
      menu: [{
        id: SessionItemToolbarMenuId,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals(IsSessionPinnedContext.key, false),
          ContextKeyExpr.equals(SessionIsArchivedContext.key, false)
        )
      }, {
        id: SessionItemContextMenuId,
        group: "0_pin",
        order: 0,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals(IsSessionPinnedContext.key, false),
          ContextKeyExpr.equals(SessionIsArchivedContext.key, false)
        )
      }]
    });
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    for (const session of sessions) {
      view?.sessionsControl?.pinSession(session);
    }
  }
});
registerAction2(class UnpinSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.unpinSession",
      title: localize2("unpinSession", "Unpin"),
      icon: Codicon.pinned,
      menu: [{
        id: SessionItemToolbarMenuId,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals(IsSessionPinnedContext.key, true),
          ContextKeyExpr.equals(SessionIsArchivedContext.key, false)
        )
      }, {
        id: SessionItemContextMenuId,
        group: "0_pin",
        order: 0,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals(IsSessionPinnedContext.key, true),
          ContextKeyExpr.equals(SessionIsArchivedContext.key, false)
        )
      }]
    });
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(SessionsViewId);
    for (const session of sessions) {
      view?.sessionsControl?.unpinSession(session);
    }
  }
});
class BaseArchiveSessionAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).archive;
    super({
      id: "sessionsViewPane.archiveSession",
      title: action.title,
      icon: action.icon,
      menu: [{
        id: SessionItemToolbarMenuId,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.equals(SessionIsArchivedContext.key, false)
      }, {
        id: SessionItemContextMenuId,
        group: "1_edit",
        order: 2,
        when: ContextKeyExpr.equals(SessionIsArchivedContext.key, false)
      }, {
        id: Menus.SessionBarToolbar,
        group: "1_session",
        order: 5,
        when: ContextKeyExpr.and(SessionIsCreatedContext, ContextKeyExpr.equals(SessionIsArchivedContext.key, false))
      }]
    });
  }
  async run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    for (const session of sessions) {
      await sessionsManagementService.archiveSession(session);
    }
  }
}
class ArchiveSessionAction extends BaseArchiveSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class MarkSessionAsDoneAction extends BaseArchiveSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
class BaseUnarchiveSessionAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).unarchive;
    super({
      id: UNARCHIVE_SESSION_COMMAND_ID,
      title: action.title,
      icon: action.icon,
      menu: [{
        id: SessionItemToolbarMenuId,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.equals(SessionIsArchivedContext.key, true)
      }, {
        id: SessionItemContextMenuId,
        group: "1_edit",
        order: 2,
        when: ContextKeyExpr.equals(SessionIsArchivedContext.key, true)
      }, {
        id: Menus.SessionBarToolbar,
        group: "navigation",
        order: 5,
        when: ContextKeyExpr.equals(SessionIsArchivedContext.key, true)
      }]
    });
  }
  async run(accessor, context) {
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const sessionsService = accessor.get(ISessionsService);
    if (!context) {
      const activeSession = sessionsService.activeSession.get();
      if (activeSession) {
        await sessionsManagementService.unarchiveSession(activeSession);
      }
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    for (const session of sessions) {
      await sessionsManagementService.unarchiveSession(session);
    }
  }
}
class UnarchiveSessionAction extends BaseUnarchiveSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class RestoreArchivedSessionAction extends BaseUnarchiveSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
registerAction2(class RenameSessionAction extends Action2 {
  constructor() {
    super({
      id: RENAME_SESSION_COMMAND_ID,
      title: localize2("renameSession", "Rename..."),
      menu: [{
        id: SessionItemContextMenuId,
        group: "1_edit",
        order: 1,
        when: SessionSupportsRenameContext
      }]
    });
  }
  async run(accessor, context) {
    const session = Array.isArray(context) ? context[0] : context;
    if (!session || !session.capabilities.get().supportsRename) {
      return;
    }
    const quickInputService = accessor.get(IQuickInputService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const newTitle = await quickInputService.input({
      value: session.title.get(),
      prompt: localize("renameSession.prompt", "New agent session title"),
      validateInput: async (value) => {
        if (!value.trim()) {
          return localize("renameSession.empty", "Title cannot be empty");
        }
        return void 0;
      }
    });
    if (newTitle) {
      const trimmedTitle = newTitle.trim();
      if (trimmedTitle && trimmedTitle !== session.title.get().trim()) {
        await sessionsManagementService.renameSession(session, trimmedTitle);
      }
    }
  }
});
registerAction2(class DeleteSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.deleteSession",
      title: localize2("deleteSession", "Delete..."),
      menu: [{
        id: SessionItemContextMenuId,
        group: "1_edit",
        order: 4,
        when: SessionSupportsDeleteContext
      }]
    });
  }
  async run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = (Array.isArray(context) ? context : [context]).filter((session) => session.capabilities.get().supportsDelete);
    if (sessions.length === 0) {
      return;
    }
    const dialogService = accessor.get(IDialogService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const confirmed = await dialogService.confirm({
      message: sessions.length === 1 ? localize("deleteSession.confirm", "Are you sure you want to delete this session?") : localize("deleteSessions.confirm", "Are you sure you want to delete {0} sessions?", sessions.length),
      detail: localize("deleteSession.detail", "This action cannot be undone."),
      primaryButton: localize("deleteSession.delete", "Delete")
    });
    if (!confirmed.confirmed) {
      return;
    }
    try {
      await sessionsManagementService.deleteSessions(sessions);
    } catch (err) {
      dialogService.error(sessions.length === 1 ? localize("deleteSession.error", "Failed to delete the session: {0}", toErrorMessage(err)) : localize("deleteSessions.error", "Failed to delete the sessions: {0}", toErrorMessage(err)));
    }
  }
});
registerAction2(class MarkSessionReadAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.markRead",
      title: localize2("markRead", "Mark as Read"),
      menu: [{
        id: SessionItemContextMenuId,
        group: "0_read",
        order: 0,
        when: ContextKeyExpr.and(
          SessionIsReadContext.negate(),
          SessionIsArchivedContext.negate()
        )
      }, {
        id: Menus.SessionHeaderContext,
        group: "3_read",
        order: 0,
        when: ContextKeyExpr.and(
          SessionIsReadContext.negate(),
          SessionIsArchivedContext.negate()
        )
      }]
    });
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    sessionsManagementService.markAllRead(sessions);
  }
});
registerAction2(class MarkSessionUnreadAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.markUnread",
      title: localize2("markUnread", "Mark as Unread"),
      menu: [{
        id: SessionItemContextMenuId,
        group: "0_read",
        order: 0,
        when: ContextKeyExpr.and(
          SessionIsReadContext,
          SessionIsArchivedContext.negate()
        )
      }, {
        id: Menus.SessionHeaderContext,
        group: "3_read",
        order: 0,
        when: ContextKeyExpr.and(
          SessionIsReadContext,
          SessionIsArchivedContext.negate()
        )
      }]
    });
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    for (const session of sessions) {
      sessionsManagementService.markUnread(session);
    }
  }
});
registerAction2(class OpenSessionToTheSideAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.openToTheSide",
      title: localize2("openToTheSide", "Open to the Side"),
      menu: [{
        id: SessionItemContextMenuId,
        group: "navigation",
        order: -1,
        when: IsSessionsWindowContext
      }]
    });
  }
  async run(accessor, context) {
    if (!context) {
      return;
    }
    const sessions = Array.isArray(context) ? context : [context];
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    for (let i = 0; i < sessions.length - 1; i++) {
      const session = sessions[i];
      const visible = sessionsService.visibleSessions.get();
      const lastVisible = visible[visible.length - 1];
      if (lastVisible && lastVisible.sessionId !== session.sessionId) {
        sessionsService.insertAt(session, lastVisible.sessionId, "right");
      }
    }
    const lastRequested = sessions[sessions.length - 1];
    await openSessionToTheSide(sessionsService, lastRequested);
    const visibleAfterOpen = sessionsService.visibleSessions.get();
    const opened = visibleAfterOpen.find((s) => s?.sessionId === lastRequested.sessionId);
    if (opened) {
      sessionsPartService.focusSession(opened);
    }
  }
});
registerAction2(class MarkAllSessionsReadAction extends Action2 {
  constructor() {
    super({
      id: "sessionsViewPane.markAllRead",
      title: localize2("markAllRead", "Mark All as Read"),
      menu: [{
        id: SessionItemContextMenuId,
        group: "0_read",
        order: 1
      }]
    });
  }
  run(accessor) {
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const sessions = sessionsManagementService.getSessions().filter((s) => !s.isArchived.get() && !s.isRead.get());
    sessionsManagementService.markAllRead(sessions);
  }
});
class BaseUnarchiveActiveSessionAction extends Action2 {
  constructor(wording) {
    const action = getChatSessionArchiveActionPresentation(wording).unarchive;
    super({
      id: "agentSession.restore",
      title: action.title,
      icon: action.icon,
      menu: [{
        id: MenuId.AgentsChangesToolbar,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.and(
          IsSessionsWindowContext,
          SessionIsArchivedContext
        )
      }]
    });
  }
  async run(accessor) {
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const sessionsService = accessor.get(ISessionsService);
    const activeSession = sessionsService.activeSession.get();
    if (!activeSession || activeSession.status.get() === SessionStatus.Untitled) {
      return;
    }
    await sessionsManagementService.unarchiveSession(activeSession);
  }
}
class UnarchiveActiveSessionAction extends BaseUnarchiveActiveSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.Archive);
  }
}
class RestoreActiveSessionAction extends BaseUnarchiveActiveSessionAction {
  constructor() {
    super(ChatSessionArchiveActionWording.MarkAsDone);
  }
}
function getSessionsArchiveActionConstructors(wording) {
  return wording === ChatSessionArchiveActionWording.MarkAsDone ? [
    MarkSectionSessionsDoneAction,
    MarkAllSessionsInGroupAsDoneAction,
    MarkSessionAsDoneAction,
    RestoreArchivedSessionAction,
    RestoreActiveSessionAction
  ] : [
    ArchiveSectionAction,
    ArchiveSessionsInGroupAction,
    ArchiveSessionAction,
    UnarchiveSessionAction,
    UnarchiveActiveSessionAction
  ];
}
let SessionsArchiveActionsContribution = class extends Disposable {
  constructor(configurationService) {
    super();
    this.configurationService = configurationService;
    this.actionRegistrations = this._register(new DisposableStore());
    this.registerActions();
    this._register(this.configurationService.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(ChatSessionArchiveActionWordingSettingId)) {
        this.registerActions();
      }
    }));
  }
  registerActions() {
    this.actionRegistrations.clear();
    const wording = getChatSessionArchiveActionWording(this.configurationService);
    for (const action of getSessionsArchiveActionConstructors(wording)) {
      this.actionRegistrations.add(registerAction2(action));
    }
  }
};
SessionsArchiveActionsContribution.ID = "workbench.contrib.sessionsArchiveActions";
SessionsArchiveActionsContribution = __decorateClass([
  __decorateParam(0, IConfigurationService)
], SessionsArchiveActionsContribution);
registerWorkbenchContribution2(SessionsArchiveActionsContribution.ID, SessionsArchiveActionsContribution, WorkbenchPhase.BlockStartup);
registerAction2(class ManageAutomationsAction extends Action2 {
  constructor() {
    super({
      id: "sessionsView.manageAutomations",
      title: localize2("manageAutomations", "Manage Automations"),
      menu: []
    });
  }
  run(accessor) {
    accessor.get(ICustomViewService).showCustomView(AUTOMATIONS_CUSTOM_VIEW_ID);
  }
});
const MARK_ALL_AUTOMATION_RUNS_READ_COMMAND_ID = "sessionsView.markAllAutomationRunsRead";
registerAction2(class MarkAllAutomationRunsReadAction extends Action2 {
  constructor() {
    super({
      id: MARK_ALL_AUTOMATION_RUNS_READ_COMMAND_ID,
      title: localize2("markAllAutomationRunsRead", "Mark All as Read")
    });
  }
  async run(accessor) {
    const automationService = accessor.get(IAutomationService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const runs = automationService.runs.get();
    const sessions = /* @__PURE__ */ new Map();
    for (const run of runs) {
      if ((run.status === "completed" || run.status === "failed") && run.sessionResource) {
        const session = sessionsManagementService.getSession(run.sessionResource);
        if (session && !session.isRead.get()) {
          sessions.set(session.resource.toString(), session);
        }
      }
    }
    await sessionsManagementService.markAllRead([...sessions.values()]);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXGJyb3dzZXJcXHZpZXdzXFxzZXNzaW9uc1ZpZXdBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNNb2JpbGUsIGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENMT1NFX01PQklMRV9TSURFQkFSX0RSQVdFUl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgRWRpdG9yc1Zpc2libGVDb250ZXh0LCBFZGl0b3JBcmVhRm9jdXNDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgUkVOQU1FX1NFU1NJT05fQ09NTUFORF9JRCwgVU5BUkNISVZFX1NFU1NJT05fQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXNzaW9uQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblN1cHBvcnRzRGVsZXRlQ29udGV4dCwgU2Vzc2lvblN1cHBvcnRzUmVuYW1lQ29udGV4dCwgSXNOZXdDaGF0U2Vzc2lvbkNvbnRleHQsIFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dCwgU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsIFNlc3Npb25Jc1JlYWRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNlc3Npb25JdGVtVG9vbGJhck1lbnVJZCwgU2Vzc2lvbkl0ZW1Db250ZXh0TWVudUlkLCBTZXNzaW9uU2VjdGlvblRvb2xiYXJNZW51SWQsIFNlc3Npb25Hcm91cFRvb2xiYXJNZW51SWQsIFNlc3Npb25TZWN0aW9uVHlwZUNvbnRleHQsIFNlc3Npb25Hcm91cEhhc1Zpc2libGVTZXNzaW9uc0NvbnRleHQsIFNlc3Npb25Hcm91cElzRW1wdHlDb250ZXh0LCBJc1Nlc3Npb25QaW5uZWRDb250ZXh0LCBTZXNzaW9uc0dyb3VwaW5nLCBTZXNzaW9uc1NvcnRpbmcsIElTZXNzaW9uU2VjdGlvbiwgSVNlc3Npb25Hcm91cEl0ZW0gfSBmcm9tICcuL3Nlc3Npb25zTGlzdC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbkdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSXNXb3Jrc3BhY2VHcm91cENhcHBlZENvbnRleHQsIFNlc3Npb25zVmlld0ZpbHRlck9wdGlvbnNTdWJNZW51LCBTZXNzaW9uc1ZpZXdGaWx0ZXJTdWJNZW51LCBTZXNzaW9uc1ZpZXdHcm91cGluZ0NvbnRleHQsIFNlc3Npb25zVmlld0lkLCBTZXNzaW9uc1ZpZXcsIFNlc3Npb25zVmlld1NvcnRpbmdDb250ZXh0LCBvcGVuU2Vzc2lvblRvVGhlU2lkZSB9IGZyb20gJy4vc2Vzc2lvbnNWaWV3LmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZywgQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZ1NldHRpbmdJZCwgZ2V0Q2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uUHJlc2VudGF0aW9uLCBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2hhdC9jb21tb24vc2Vzc2lvbkFyY2hpdmVBY3Rpb25zLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfRU5BQkxFRF9DT05URVhUX0tFWSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUGFydFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUN1c3RvbVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY3VzdG9tVmlldy9icm93c2VyL2N1c3RvbVZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFVVE9NQVRJT05TX0NVU1RPTV9WSUVXX0lEIH0gZnJvbSAnLi4vYXV0b21hdGlvbnNDb25zdGFudHMuanMnO1xuXG5jb25zdCBDTE9TRV9TRVNTSU9OX0NPTU1BTkRfSUQgPSAnc2Vzc2lvbnNWaWV3UGFuZS5jbG9zZVNlc3Npb24nO1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENsb3NlU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ0xPU0VfU0VTU0lPTl9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2xvc2VTZXNzaW9uJywgXCJDbG9zZSBTZXNzaW9uXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChJc05ld0NoYXRTZXNzaW9uQ29udGV4dC5uZWdhdGUoKSwgRWRpdG9yc1Zpc2libGVDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdHNlc3Npb25zU2VydmljZS5vcGVuTmV3U2Vzc2lvbigpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlcktleWJpbmRpbmdSdWxlKHtcblx0aWQ6IENMT1NFX1NFU1NJT05fQ09NTUFORF9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzTmV3Q2hhdFNlc3Npb25Db250ZXh0Lm5lZ2F0ZSgpLCBFZGl0b3JzVmlzaWJsZUNvbnRleHQubmVnYXRlKCkpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Vyxcblx0d2luOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5GNCwgc2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVddIH0sXG59KTtcblxuLy8gIE9wZW4gU2Vzc2lvbiBhdCBJbmRleCAoQ3RybC9DbWQrMS4uOSlcblxuY29uc3QgT1BFTl9TRVNTSU9OX0FUX0lOREVYX0NPTU1BTkRfSUQgPSAnc2Vzc2lvbnNWaWV3UGFuZS5vcGVuU2Vzc2lvbkF0SW5kZXgnO1xuXG5mdW5jdGlvbiBkaWdpdFRvS2V5Q29kZShkaWdpdDogbnVtYmVyKTogS2V5Q29kZSB7XG5cdHN3aXRjaCAoZGlnaXQpIHtcblx0XHRjYXNlIDE6IHJldHVybiBLZXlDb2RlLkRpZ2l0MTtcblx0XHRjYXNlIDI6IHJldHVybiBLZXlDb2RlLkRpZ2l0Mjtcblx0XHRjYXNlIDM6IHJldHVybiBLZXlDb2RlLkRpZ2l0Mztcblx0XHRjYXNlIDQ6IHJldHVybiBLZXlDb2RlLkRpZ2l0NDtcblx0XHRjYXNlIDU6IHJldHVybiBLZXlDb2RlLkRpZ2l0NTtcblx0XHRjYXNlIDY6IHJldHVybiBLZXlDb2RlLkRpZ2l0Njtcblx0XHRjYXNlIDc6IHJldHVybiBLZXlDb2RlLkRpZ2l0Nztcblx0XHRjYXNlIDg6IHJldHVybiBLZXlDb2RlLkRpZ2l0ODtcblx0XHRjYXNlIDk6IHJldHVybiBLZXlDb2RlLkRpZ2l0OTtcblx0XHRkZWZhdWx0OiByZXR1cm4gS2V5Q29kZS5Vbmtub3duO1xuXHR9XG59XG5cbmNvbnN0IG9wZW5TZXNzaW9uQXRJbmRleCA9IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvbkluZGV4OiB1bmtub3duKTogdm9pZCA9PiB7XG5cdGlmICh0eXBlb2Ygc2Vzc2lvbkluZGV4ICE9PSAnbnVtYmVyJykge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0Y29uc3QgdmlldyA9IHZpZXdzU2VydmljZS5nZXRWaWV3V2l0aElkPFNlc3Npb25zVmlldz4oU2Vzc2lvbnNWaWV3SWQpO1xuXHRjb25zdCB2aXNpYmxlID0gdmlldz8uc2Vzc2lvbnNDb250cm9sPy5nZXRWaXNpYmxlU2Vzc2lvbnMoKSA/PyBbXTtcblx0aWYgKHZpc2libGUubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdC8vIEluZGV4IC0xIG1lYW5zIFwibGFzdCBzZXNzaW9uXCJcblx0Y29uc3QgdGFyZ2V0ID0gc2Vzc2lvbkluZGV4ID09PSAtMVxuXHRcdD8gdmlzaWJsZVt2aXNpYmxlLmxlbmd0aCAtIDFdXG5cdFx0OiB2aXNpYmxlW3Nlc3Npb25JbmRleF07XG5cdGlmICghdGFyZ2V0KSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdHNlc3Npb25zU2VydmljZS5vcGVuU2Vzc2lvbih0YXJnZXQucmVzb3VyY2UpO1xufTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogT1BFTl9TRVNTSU9OX0FUX0lOREVYX0NPTU1BTkRfSUQsXG5cdGhhbmRsZXI6IG9wZW5TZXNzaW9uQXRJbmRleFxufSk7XG5cbi8vIE9wZW4gTnRoIHNlc3Npb24gZnJvbSB0aGUgbGlzdC4gV2luZG93cy9MaW51eDogQWx0KzEuLjkgKEN0cmwrMS4uOSBpcyByZXNlcnZlZFxuLy8gZm9yIGZvY3VzaW5nIHNlc3Npb25zIGluIHRoZSBncmlkKS4gbWFjT1M6IEN0cmwrMS4uOSAoV2luQ3RybCkgXHUyMDE0IHRoZSBncmlkIHVzZXNcbi8vIENtZCsxLi45IHRoZXJlLCBzbyBDdHJsIGlzIGZyZWUgYW5kIGF2b2lkcyBPcHRpb24rZGlnaXQgdHlwaW5nIHN5bWJvbHMuXG4vLyAxLi44IG9wZW4gdGhhdCBzZXNzaW9uOyA5IG9wZW5zIHRoZSBsYXN0IHNlc3Npb24uXG5mb3IgKGxldCB2aXNpYmxlSW5kZXggPSAxOyB2aXNpYmxlSW5kZXggPD0gOTsgdmlzaWJsZUluZGV4KyspIHtcblx0Y29uc3Qgc2Vzc2lvbkluZGV4ID0gdmlzaWJsZUluZGV4ID09PSA5ID8gLTEgOiB2aXNpYmxlSW5kZXggLSAxO1xuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogT1BFTl9TRVNTSU9OX0FUX0lOREVYX0NPTU1BTkRfSUQgKyB2aXNpYmxlSW5kZXgsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYixcblx0XHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgZGlnaXRUb0tleUNvZGUodmlzaWJsZUluZGV4KSxcblx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBkaWdpdFRvS2V5Q29kZSh2aXNpYmxlSW5kZXgpIH0sXG5cdFx0aGFuZGxlcjogYWNjZXNzb3IgPT4gb3BlblNlc3Npb25BdEluZGV4KGFjY2Vzc29yLCBzZXNzaW9uSW5kZXgpXG5cdH0pO1xufVxuXG4vLyAgTmF2aWdhdGUgUHJldmlvdXMgLyBOZXh0IFNlc3Npb24gKGxpc3Qgb3JkZXIpXG5cbmNvbnN0IG5hdmlnYXRlU2Vzc2lvbkluTGlzdCA9IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZGlyZWN0aW9uOiAncHJldmlvdXMnIHwgJ25leHQnKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8U2Vzc2lvbnNWaWV3PihTZXNzaW9uc1ZpZXdJZCk7XG5cdGNvbnN0IHZpc2libGUgPSB2aWV3Py5zZXNzaW9uc0NvbnRyb2w/LmdldFZpc2libGVTZXNzaW9ucygpID8/IFtdO1xuXHRpZiAodmlzaWJsZS5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBMb2NhdGUgdGhlIGFjdGl2ZSBzZXNzaW9uIHdpdGhpbiB0aGUgdmlzaWJsZSBsaXN0IHNvIG5hdmlnYXRpb24gZm9sbG93c1xuXHQvLyB3aGF0IHRoZSB1c2VyIHNlZXMgKHJlc3BlY3RpbmcgZ3JvdXBpbmcsIGZpbHRlcmluZywgYW5kIGNvbGxhcHNlZCBzZWN0aW9ucykuXG5cdGNvbnN0IGFjdGl2ZVJlc291cmNlID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdGNvbnN0IGN1cnJlbnRJbmRleCA9IGFjdGl2ZVJlc291cmNlID09PSB1bmRlZmluZWRcblx0XHQ/IC0xXG5cdFx0OiB2aXNpYmxlLmZpbmRJbmRleChzZXNzaW9uID0+IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gYWN0aXZlUmVzb3VyY2UpO1xuXG5cdGxldCB0YXJnZXRJbmRleDogbnVtYmVyO1xuXHRpZiAoY3VycmVudEluZGV4ID09PSAtMSkge1xuXHRcdC8vIE5vIGFjdGl2ZSBzZXNzaW9uIGluIHRoZSB2aXNpYmxlIGxpc3Q6IHN0YXJ0IGZyb20gdGhlIG5lYXJlc3QgZWRnZS5cblx0XHR0YXJnZXRJbmRleCA9IGRpcmVjdGlvbiA9PT0gJ25leHQnID8gMCA6IHZpc2libGUubGVuZ3RoIC0gMTtcblx0fSBlbHNlIHtcblx0XHR0YXJnZXRJbmRleCA9IGRpcmVjdGlvbiA9PT0gJ25leHQnXG5cdFx0XHQ/IE1hdGgubWluKGN1cnJlbnRJbmRleCArIDEsIHZpc2libGUubGVuZ3RoIC0gMSlcblx0XHRcdDogTWF0aC5tYXgoY3VycmVudEluZGV4IC0gMSwgMCk7XG5cdH1cblxuXHQvLyBBdCB0aGUgbGlzdCBlZGdlcyB0aGUgdGFyZ2V0IGNsYW1wcyB0byB0aGUgYWN0aXZlIHNlc3Npb247IGRvbid0IHJlLW9wZW4gaXQuXG5cdGlmICh0YXJnZXRJbmRleCA9PT0gY3VycmVudEluZGV4KSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgdGFyZ2V0ID0gdmlzaWJsZVt0YXJnZXRJbmRleF07XG5cdGlmICh0YXJnZXQpIHtcblx0XHRhd2FpdCBzZXNzaW9uc1NlcnZpY2Uub3BlblNlc3Npb24odGFyZ2V0LnJlc291cmNlKTtcblx0fVxufTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5hdmlnYXRlUHJldmlvdXNTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5uYXZpZ2F0ZVByZXZpb3VzU2Vzc2lvbicsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ25hdmlnYXRlUHJldmlvdXNTZXNzaW9uJywgXCJHbyB0byBQcmV2aW91cyBTZXNzaW9uXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0dvIHRvIFByZXZpb3VzIFNlc3Npb24nLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSgnbmF2aWdhdGVQcmV2aW91c1Nlc3Npb24ubW5lbW9uaWMnLCBcIiYmUHJldmlvdXMgU2Vzc2lvblwiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdC8vIE1pcnJvciBjb3JlIFwiUHJldmlvdXMgRWRpdG9yXCI7IGtlZXAgQWx0K1VwIGFzIGEgc2Vzc2lvbnMtb25seSBhbHRlcm5hdGUgb3V0c2lkZSB0aGUgZWRpdG9yIGFyZWEuXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgRWRpdG9yQXJlYUZvY3VzQ29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5QYWdlVXAsXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5BbHQgfCBLZXlDb2RlLlVwQXJyb3ddLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkxlZnRBcnJvdyxcblx0XHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQnJhY2tldExlZnQsIEtleU1vZC5BbHQgfCBLZXlDb2RlLlVwQXJyb3ddLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51cy5Hb01lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMl9saXN0X25hdicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmF2aWdhdGVTZXNzaW9uSW5MaXN0KGFjY2Vzc29yLCAncHJldmlvdXMnKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBOYXZpZ2F0ZU5leHRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5uYXZpZ2F0ZU5leHRTZXNzaW9uJyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgnbmF2aWdhdGVOZXh0U2Vzc2lvbicsIFwiR28gdG8gTmV4dCBTZXNzaW9uXCIpLFxuXHRcdFx0XHRvcmlnaW5hbDogJ0dvIHRvIE5leHQgU2Vzc2lvbicsXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKCduYXZpZ2F0ZU5leHRTZXNzaW9uLm1uZW1vbmljJywgXCImJk5leHQgU2Vzc2lvblwiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdC8vIE1pcnJvciBjb3JlIFwiTmV4dCBFZGl0b3JcIjsga2VlcCBBbHQrRG93biBhcyBhIHNlc3Npb25zLW9ubHkgYWx0ZXJuYXRlIG91dHNpZGUgdGhlIGVkaXRvciBhcmVhLlxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIEVkaXRvckFyZWFGb2N1c0NvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUGFnZURvd24sXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5BbHQgfCBLZXlDb2RlLkRvd25BcnJvd10sXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0XHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQnJhY2tldFJpZ2h0LCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5Eb3duQXJyb3ddLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51cy5Hb01lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMl9saXN0X25hdicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmF2aWdhdGVTZXNzaW9uSW5MaXN0KGFjY2Vzc29yLCAnbmV4dCcpO1xuXHR9XG59KTtcblxuLy8gIFZpZXcgVGl0bGUgTWVudVxuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudXMuU2lkZWJhclNlc3Npb25zSGVhZGVyLCB7XG5cdHN1Ym1lbnU6IFNlc3Npb25zVmlld0ZpbHRlclN1Yk1lbnUsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZpbHRlclNlc3Npb25zJywgXCJGaWx0ZXIgU2Vzc2lvbnNcIiksXG5cdGljb246IENvZGljb24uc2V0dGluZ3MsXG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdG9yZGVyOiAxMCxcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudXMuU2lkZWJhclNlc3Npb25zSGVhZGVyLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUuZmluZCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignZmluZCcsIFwiRmluZCBTZXNzaW9uXCIpLFxuXHRcdGljb246IENvZGljb24uc2VhcmNoLFxuXHR9LFxuXHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRvcmRlcjogMjAsXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKFNlc3Npb25zVmlld0ZpbHRlclN1Yk1lbnUsIHtcblx0c3VibWVudTogU2Vzc2lvbnNWaWV3RmlsdGVyT3B0aW9uc1N1Yk1lbnUsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZpbHRlcicsIFwiRmlsdGVyXCIpLFxuXHRncm91cDogJzBfZmlsdGVyJyxcblx0b3JkZXI6IDAsXG59KTtcblxuLy8gIFNvcnQgLyBHcm91cCBBY3Rpb25zXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTb3J0QnlDcmVhdGVkQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5zb3J0QnlDcmVhdGVkJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NvcnRCeUNyZWF0ZWQnLCBcIlNvcnQgYnkgQ3JlYXRlZFwiKSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoU2Vzc2lvbnNWaWV3U29ydGluZ0NvbnRleHQua2V5LCBTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCksXG5cdFx0XHRtZW51OiBbeyBpZDogU2Vzc2lvbnNWaWV3RmlsdGVyU3ViTWVudSwgZ3JvdXA6ICcxX3NvcnQnLCBvcmRlcjogMCB9XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8U2Vzc2lvbnNWaWV3PihTZXNzaW9uc1ZpZXdJZCk7XG5cdFx0dmlldz8uc2V0U29ydGluZyhTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgU29ydEJ5VXBkYXRlZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUuc29ydEJ5VXBkYXRlZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzb3J0QnlVcGRhdGVkJywgXCJTb3J0IGJ5IFVwZGF0ZWRcIiksXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25zVmlld1NvcnRpbmdDb250ZXh0LmtleSwgU2Vzc2lvbnNTb3J0aW5nLlVwZGF0ZWQpLFxuXHRcdFx0bWVudTogW3sgaWQ6IFNlc3Npb25zVmlld0ZpbHRlclN1Yk1lbnUsIGdyb3VwOiAnMV9zb3J0Jywgb3JkZXI6IDEgfV1cblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgdmlldyA9IHZpZXdzU2VydmljZS5nZXRWaWV3V2l0aElkPFNlc3Npb25zVmlldz4oU2Vzc2lvbnNWaWV3SWQpO1xuXHRcdHZpZXc/LnNldFNvcnRpbmcoU2Vzc2lvbnNTb3J0aW5nLlVwZGF0ZWQpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdyb3VwQnlXb3Jrc3BhY2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLmdyb3VwQnlXb3Jrc3BhY2UnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZ3JvdXBCeVdvcmtzcGFjZScsIFwiR3JvdXAgYnkgV29ya3NwYWNlXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uc1ZpZXdHcm91cGluZ0NvbnRleHQua2V5LCBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSksXG5cdFx0XHRtZW51OiBbeyBpZDogU2Vzc2lvbnNWaWV3RmlsdGVyU3ViTWVudSwgZ3JvdXA6ICcyX2dyb3VwJywgb3JkZXI6IDAgfV1cblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgdmlldyA9IHZpZXdzU2VydmljZS5nZXRWaWV3V2l0aElkPFNlc3Npb25zVmlldz4oU2Vzc2lvbnNWaWV3SWQpO1xuXHRcdHZpZXc/LnNldEdyb3VwaW5nKFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHcm91cEJ5VGltZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUuZ3JvdXBCeVRpbWUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZ3JvdXBCeVRpbWUnLCBcIkdyb3VwIGJ5IFRpbWVcIiksXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25zVmlld0dyb3VwaW5nQ29udGV4dC5rZXksIFNlc3Npb25zR3JvdXBpbmcuRGF0ZSksXG5cdFx0XHRtZW51OiBbeyBpZDogU2Vzc2lvbnNWaWV3RmlsdGVyU3ViTWVudSwgZ3JvdXA6ICcyX2dyb3VwJywgb3JkZXI6IDEgfV1cblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgdmlldyA9IHZpZXdzU2VydmljZS5nZXRWaWV3V2l0aElkPFNlc3Npb25zVmlldz4oU2Vzc2lvbnNWaWV3SWQpO1xuXHRcdHZpZXc/LnNldEdyb3VwaW5nKFNlc3Npb25zR3JvdXBpbmcuRGF0ZSk7XG5cdH1cbn0pO1xuXG4vLyAgV29ya3NwYWNlIEdyb3VwIENhcHBpbmdcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFNob3dSZWNlbnRXb3Jrc3BhY2VTZXNzaW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUuc2hvd1JlY2VudFNlc3Npb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dSZWNlbnRTZXNzaW9ucycsIFwiU2hvdyBSZWNlbnQgU2Vzc2lvbnNcIiksXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0dG9nZ2xlZDogSXNXb3Jrc3BhY2VHcm91cENhcHBlZENvbnRleHQsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogU2Vzc2lvbnNWaWV3RmlsdGVyU3ViTWVudSxcblx0XHRcdFx0Z3JvdXA6ICczX2NhcCcsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoU2Vzc2lvbnNWaWV3R3JvdXBpbmdDb250ZXh0LmtleSwgU2Vzc2lvbnNHcm91cGluZy5Xb3Jrc3BhY2UpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgdmlldyA9IHZpZXdzU2VydmljZS5nZXRWaWV3V2l0aElkPFNlc3Npb25zVmlldz4oU2Vzc2lvbnNWaWV3SWQpO1xuXHRcdHZpZXc/LnNlc3Npb25zQ29udHJvbD8uc2V0V29ya3NwYWNlR3JvdXBDYXBwZWQodHJ1ZSk7XG5cdFx0SXNXb3Jrc3BhY2VHcm91cENhcHBlZENvbnRleHQuYmluZFRvKGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpKS5zZXQodHJ1ZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgU2hvd0FsbFdvcmtzcGFjZVNlc3Npb25zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5zaG93QWxsU2Vzc2lvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvd0FsbFNlc3Npb25zJywgXCJTaG93IEFsbCBTZXNzaW9uc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHR0b2dnbGVkOiBJc1dvcmtzcGFjZUdyb3VwQ2FwcGVkQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBTZXNzaW9uc1ZpZXdGaWx0ZXJTdWJNZW51LFxuXHRcdFx0XHRncm91cDogJzNfY2FwJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uc1ZpZXdHcm91cGluZ0NvbnRleHQua2V5LCBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8U2Vzc2lvbnNWaWV3PihTZXNzaW9uc1ZpZXdJZCk7XG5cdFx0dmlldz8uc2Vzc2lvbnNDb250cm9sPy5zZXRXb3Jrc3BhY2VHcm91cENhcHBlZChmYWxzZSk7XG5cdFx0SXNXb3Jrc3BhY2VHcm91cENhcHBlZENvbnRleHQuYmluZFRvKGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpKS5zZXQoZmFsc2UpO1xuXHR9XG59KTtcblxuLy8gIENvbGxhcHNlIEFsbCBHcm91cHNcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENvbGxhcHNlQWxsR3JvdXBzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5jb2xsYXBzZUFsbEdyb3VwcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb2xsYXBzZUFsbEdyb3VwcycsIFwiQ29sbGFwc2UgQWxsIEdyb3Vwc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRtZW51OiBbeyBpZDogU2Vzc2lvbnNWaWV3RmlsdGVyU3ViTWVudSwgZ3JvdXA6ICc0X2NvbGxhcHNlJywgb3JkZXI6IDAgfV1cblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgdmlldyA9IHZpZXdzU2VydmljZS5nZXRWaWV3V2l0aElkPFNlc3Npb25zVmlldz4oU2Vzc2lvbnNWaWV3SWQpO1xuXHRcdHZpZXc/LnNlc3Npb25zQ29udHJvbD8uY29sbGFwc2VBbGxTZWN0aW9ucygpO1xuXHR9XG59KTtcblxuLy8gIFZpZXcgVG9vbGJhciBBY3Rpb25zXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBSZWZyZXNoU2Vzc2lvbnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLnJlZnJlc2gnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVmcmVzaCcsIFwiUmVmcmVzaCBTZXNzaW9uc1wiKSxcblx0XHRcdGljb246IENvZGljb24ucmVmcmVzaCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgdmlldyA9IHZpZXdzU2VydmljZS5nZXRWaWV3V2l0aElkPFNlc3Npb25zVmlldz4oU2Vzc2lvbnNWaWV3SWQpO1xuXHRcdHJldHVybiB2aWV3Py5zZXNzaW9uc0NvbnRyb2w/LnJlZnJlc2goKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGaW5kU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUuZmluZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmaW5kJywgXCJGaW5kIFNlc3Npb25cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnNlYXJjaCxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXcgPSB2aWV3c1NlcnZpY2UuZ2V0Vmlld1dpdGhJZDxTZXNzaW9uc1ZpZXc+KFNlc3Npb25zVmlld0lkKTtcblx0XHRyZXR1cm4gdmlldz8ub3BlbkZpbmQoKTtcblx0fVxufSk7XG5cbi8vICBTZWN0aW9uIEFjdGlvbnNcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5ld1Nlc3Npb25Gb3JXb3Jrc3BhY2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXcuc2VjdGlvbk5ld1Nlc3Npb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmV3U2Vzc2lvbkZvcldvcmtzcGFjZScsIFwiTmV3IFNlc3Npb25cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnBsdXMsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogU2Vzc2lvblNlY3Rpb25Ub29sYmFyTWVudUlkLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25TZWN0aW9uVHlwZUNvbnRleHQua2V5LCAnd29ya3NwYWNlJyksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElTZXNzaW9uU2VjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghY29udGV4dCB8fCAhY29udGV4dC5zZXNzaW9ucyB8fCBjb250ZXh0LnNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNQYXJ0U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQYXJ0U2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHNlc3Npb25zU2VydmljZS5vcGVuTmV3U2Vzc2lvbigpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNvbnRleHQuc2Vzc2lvbnNbMF07XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCk7XG5cdFx0Y29uc3QgZm9sZGVyVXJpID0gd29ya3NwYWNlPy5mb2xkZXJzWzBdPy5yb290O1xuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSBzZXNzaW9uLnByb3ZpZGVySWQ7XG5cblx0XHRjb25zdCBuZXdTZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKGZvbGRlclVyaSkge1xuXHRcdFx0c2Vzc2lvbnNQYXJ0U2VydmljZS5nZXRTZXNzaW9uVmlldyhuZXdTZXNzaW9uPy5zZXNzaW9uSWQpPy5zZWxlY3RXb3Jrc3BhY2UoZm9sZGVyVXJpLCBwcm92aWRlcklkKTtcblx0XHR9XG5cblx0XHQvLyBPbiBtb2JpbGUgd2ViLCB0aGUgc2lkZWJhciBkcmF3ZXIgY292ZXJzIHRoZSB2aWV3cG9ydDsgY2xvc2UgaXQgc29cblx0XHQvLyB0aGUgbmV3IHNlc3Npb24gdmlldyBiZWNvbWVzIHZpc2libGUgYWZ0ZXIgY3JlYXRpb24uIFJvdXRlcyB0aHJvdWdoXG5cdFx0Ly8gdGhlIGRyYXdlci1jbG9zZSBjb21tYW5kIHRvIGtlZXAgdGhlIG1vYmlsZSBuYXYvaGlzdG9yeSBzdGFjayBpbiBzeW5jLlxuXHRcdGlmIChpc1dlYiAmJiBpc01vYmlsZSkge1xuXHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0xPU0VfTU9CSUxFX1NJREVCQVJfRFJBV0VSX0NPTU1BTkRfSUQpO1xuXHRcdH1cblxuXHRcdHNlc3Npb25zUGFydFNlcnZpY2UuZm9jdXNTZXNzaW9uKG5ld1Nlc3Npb24pO1xuXHR9XG59KTtcblxuY29uc3QgTkVXX1FVSUNLX0NIQVRfQ09NTUFORF9JRCA9ICdzZXNzaW9uc1ZpZXcubmV3UXVpY2tDaGF0JztcblxuLy8gR2F0ZSBvbiBBSSBmZWF0dXJlcyBiZWluZyBlbmFibGVkIGFuZCB0aGUgbG9jYWwgYWdlbnQgaG9zdCAod2hpY2ggc2VydmVzXG4vLyBxdWljayBjaGF0cykgYmVpbmcgYXZhaWxhYmxlLlxuY29uc3QgUXVpY2tDaGF0RW5hYmxlZENvbnRleHQgPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRBR0VOVF9IT1NUX0VOQUJMRURfQ09OVEVYVF9LRVksXG4pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3UXVpY2tDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBORVdfUVVJQ0tfQ0hBVF9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmV3UXVpY2tDaGF0JywgXCJOZXcgUXVpY2sgQ2hhdFwiKSxcblx0XHRcdGljb246IENvZGljb24uYWRkLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBRdWlja0NoYXRFbmFibGVkQ29udGV4dCxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlOKSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFF1aWNrQ2hhdEVuYWJsZWRDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgRWRpdG9yQXJlYUZvY3VzQ29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ly8gU29sZSBjcmVhdGUgYWZmb3JkYW5jZSBmb3IgcXVpY2sgY2hhdHM6IHRoZSBcIitcIiBvbiB0aGVcblx0XHRcdFx0XHQvLyBhbHdheXMtdmlzaWJsZSBpbi1saXN0IFwiQ2hhdHNcIiBzZWN0aW9uIGhlYWRlci4gT3BlbnMgdGhlXG5cdFx0XHRcdFx0Ly8gY29tcG9zZXI7IHRoZSBzZXNzaW9uIHR5cGUgaXMgY2hvc2VuIHZpYSBpdHMgaW5saW5lIHBpY2tlci5cblx0XHRcdFx0XHRpZDogU2Vzc2lvblNlY3Rpb25Ub29sYmFyTWVudUlkLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFF1aWNrQ2hhdEVuYWJsZWRDb250ZXh0LCBDb250ZXh0S2V5RXhwci5lcXVhbHMoU2Vzc2lvblNlY3Rpb25UeXBlQ29udGV4dC5rZXksICdxdWlja2NoYXRzJykpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdC8vIE9wZW5zIHRoZSBjb21wb3NlciB3aXRoIHRoZSBkZWZhdWx0IChsYXN0LXVzZWQgb3IgZmlyc3QpIHF1aWNrLWNoYXRcblx0XHQvLyBzZXNzaW9uIHR5cGU7IHRoZSB1c2VyIGNoYW5nZXMgaXQgdmlhIHRoZSBpbmxpbmUgY29tcG9zZXIgcGlja2VyLlxuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBhY3RpdmVRdWlja0NoYXQgPSBzZXNzaW9uc1NlcnZpY2Uub3BlblF1aWNrQ2hhdCgpO1xuXG5cdFx0Ly8gT24gbW9iaWxlIHdlYiwgdGhlIHNpZGViYXIgZHJhd2VyIGNvdmVycyB0aGUgdmlld3BvcnQ7IGNsb3NlIGl0IHNvIHRoZVxuXHRcdC8vIG5ldyBxdWljayBjaGF0IGNvbXBvc2VyIGJlY29tZXMgdmlzaWJsZSBhZnRlciBjcmVhdGlvbi5cblx0XHRpZiAoaXNXZWIgJiYgaXNNb2JpbGUpIHtcblx0XHRcdGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpLmV4ZWN1dGVDb21tYW5kKENMT1NFX01PQklMRV9TSURFQkFSX0RSQVdFUl9DT01NQU5EX0lEKTtcblx0XHR9XG5cblx0XHRhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpLmZvY3VzU2Vzc2lvbihhY3RpdmVRdWlja0NoYXQpO1xuXHR9XG59KTtcblxuY29uc3QgQ29uZmlybUFyY2hpdmVTdG9yYWdlS2V5ID0gJ3Nlc3Npb25zLmNvbmZpcm1BcmNoaXZlJztcblxuZnVuY3Rpb24gZ2V0QXJjaGl2ZVNlY3Rpb25Db25maXJtYXRpb25NZXNzYWdlKGNvbnRleHQ6IElTZXNzaW9uU2VjdGlvbiwgd29yZGluZzogQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZyk6IHN0cmluZyB7XG5cdGlmIChjb250ZXh0LmlkID09PSAncGlubmVkJykge1xuXHRcdGlmIChjb250ZXh0LnNlc3Npb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIHdvcmRpbmcgPT09IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdtYXJrUGlubmVkU2VjdGlvblNlc3Npb25Eb25lLmNvbmZpcm1TaW5nbGUnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBtYXJrIDEgcGlubmVkIHNlc3Npb24gYXMgZG9uZT9cIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYXJjaGl2ZVBpbm5lZFNlY3Rpb25TZXNzaW9uLmNvbmZpcm1TaW5nbGUnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBhcmNoaXZlIDEgcGlubmVkIHNlc3Npb24/XCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB3b3JkaW5nID09PSBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmVcblx0XHRcdD8gbG9jYWxpemUoJ21hcmtQaW5uZWRTZWN0aW9uU2Vzc2lvbnNEb25lLmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBtYXJrIHswfSBwaW5uZWQgc2Vzc2lvbnMgYXMgZG9uZT9cIiwgY29udGV4dC5zZXNzaW9ucy5sZW5ndGgpXG5cdFx0XHQ6IGxvY2FsaXplKCdhcmNoaXZlUGlubmVkU2VjdGlvblNlc3Npb25zLmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBhcmNoaXZlIHswfSBwaW5uZWQgc2Vzc2lvbnM/XCIsIGNvbnRleHQuc2Vzc2lvbnMubGVuZ3RoKTtcblx0fVxuXG5cdGlmIChjb250ZXh0LnNlc3Npb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdHJldHVybiB3b3JkaW5nID09PSBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmVcblx0XHRcdD8gbG9jYWxpemUoJ21hcmtTZWN0aW9uU2Vzc2lvbkRvbmUuY29uZmlybVNpbmdsZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIG1hcmsgMSBzZXNzaW9uIGZyb20gJ3swfScgYXMgZG9uZT9cIiwgY29udGV4dC5sYWJlbClcblx0XHRcdDogbG9jYWxpemUoJ2FyY2hpdmVTZWN0aW9uU2Vzc2lvbi5jb25maXJtU2luZ2xlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gYXJjaGl2ZSAxIHNlc3Npb24gZnJvbSAnezB9Jz9cIiwgY29udGV4dC5sYWJlbCk7XG5cdH1cblxuXHRyZXR1cm4gd29yZGluZyA9PT0gQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lXG5cdFx0PyBsb2NhbGl6ZSgnbWFya1NlY3Rpb25TZXNzaW9uc0RvbmUuY29uZmlybScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIG1hcmsgezB9IHNlc3Npb25zIGZyb20gJ3sxfScgYXMgZG9uZT9cIiwgY29udGV4dC5zZXNzaW9ucy5sZW5ndGgsIGNvbnRleHQubGFiZWwpXG5cdFx0OiBsb2NhbGl6ZSgnYXJjaGl2ZVNlY3Rpb25TZXNzaW9ucy5jb25maXJtJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gYXJjaGl2ZSB7MH0gc2Vzc2lvbnMgZnJvbSAnezF9Jz9cIiwgY29udGV4dC5zZXNzaW9ucy5sZW5ndGgsIGNvbnRleHQubGFiZWwpO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBCYXNlQXJjaGl2ZVNlY3Rpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB3b3JkaW5nOiBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nKSB7XG5cdFx0Y29uc3QgYWN0aW9uID0gZ2V0Q2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uUHJlc2VudGF0aW9uKHdvcmRpbmcpLmFyY2hpdmVBbGw7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXcuc2VjdGlvbkFyY2hpdmUnLFxuXHRcdFx0dGl0bGU6IGFjdGlvbi50aXRsZSxcblx0XHRcdGljb246IGFjdGlvbi5pY29uLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IFNlc3Npb25TZWN0aW9uVG9vbGJhck1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdC8vIE5vdCBvbiBEb25lIGl0c2VsZiwgYW5kIG5vdCBvbiB0aGUgXCJDaGF0c1wiIChxdWljayBjaGF0cykgc2VjdGlvbi5cblx0XHRcdFx0Ly8gQWxzbyBub3Qgb24gQXV0b21hdGlvbnMuXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoU2Vzc2lvblNlY3Rpb25UeXBlQ29udGV4dC5rZXksICdhcmNoaXZlZCcpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhTZXNzaW9uU2VjdGlvblR5cGVDb250ZXh0LmtleSwgJ3F1aWNrY2hhdHMnKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoU2Vzc2lvblNlY3Rpb25UeXBlQ29udGV4dC5rZXksICdhdXRvbWF0aW9ucycpLFxuXHRcdFx0XHQpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBJU2Vzc2lvblNlY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWNvbnRleHQgfHwgIWNvbnRleHQuc2Vzc2lvbnMgfHwgY29udGV4dC5zZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2tpcENvbmZpcm1hdGlvbiA9IHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQ29uZmlybUFyY2hpdmVTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgZmFsc2UpO1xuXHRcdGlmICghc2tpcENvbmZpcm1hdGlvbikge1xuXHRcdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0bWVzc2FnZTogZ2V0QXJjaGl2ZVNlY3Rpb25Db25maXJtYXRpb25NZXNzYWdlKGNvbnRleHQsIHRoaXMud29yZGluZyksXG5cdFx0XHRcdGRldGFpbDogdGhpcy53b3JkaW5nID09PSBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmVcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdtYXJrU2VjdGlvblNlc3Npb25zRG9uZS5kZXRhaWwnLCBcIllvdSBjYW4gcmVzdG9yZSBzZXNzaW9ucyBsYXRlciBpZiBuZWVkZWQgZnJvbSB0aGUgc2Vzc2lvbnMgdmlldy5cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhcmNoaXZlU2VjdGlvblNlc3Npb25zLmRldGFpbCcsIFwiWW91IGNhbiB1bmFyY2hpdmUgc2Vzc2lvbnMgbGF0ZXIgaWYgbmVlZGVkIGZyb20gdGhlIHNlc3Npb25zIHZpZXcuXCIpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25QcmVzZW50YXRpb24odGhpcy53b3JkaW5nKS5hcmNoaXZlQWxsLnRpdGxlLnZhbHVlLFxuXHRcdFx0XHRjaGVja2JveDoge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZG9Ob3RBc2tBZ2FpbicsIFwiRG8gbm90IGFzayBtZSBhZ2FpblwiKVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCFjb25maXJtZWQuY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbmZpcm1lZC5jaGVja2JveENoZWNrZWQpIHtcblx0XHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ29uZmlybUFyY2hpdmVTdG9yYWdlS2V5LCB0cnVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgY29udGV4dC5zZXNzaW9ucykge1xuXHRcdFx0YXdhaXQgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5hcmNoaXZlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgQXJjaGl2ZVNlY3Rpb25BY3Rpb24gZXh0ZW5kcyBCYXNlQXJjaGl2ZVNlY3Rpb25BY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLkFyY2hpdmUpO1xuXHR9XG59XG5cbmNsYXNzIE1hcmtTZWN0aW9uU2Vzc2lvbnNEb25lQWN0aW9uIGV4dGVuZHMgQmFzZUFyY2hpdmVTZWN0aW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lKTtcblx0fVxufVxuXG4vLyAgR3JvdXAgSGVhZGVyIEFjdGlvbnNcblxuZnVuY3Rpb24gZ2V0QXJjaGl2ZUdyb3VwQ29uZmlybWF0aW9uTWVzc2FnZShjb250ZXh0OiBJU2Vzc2lvbkdyb3VwSXRlbSwgd29yZGluZzogQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZyk6IHN0cmluZyB7XG5cdGlmIChjb250ZXh0LnNlc3Npb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdHJldHVybiB3b3JkaW5nID09PSBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLk1hcmtBc0RvbmVcblx0XHRcdD8gbG9jYWxpemUoJ21hcmtHcm91cFNlc3Npb25Eb25lLmNvbmZpcm1TaW5nbGUnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBtYXJrIDEgc2Vzc2lvbiBmcm9tICd7MH0nIGFzIGRvbmU/XCIsIGNvbnRleHQuZ3JvdXAubmFtZSlcblx0XHRcdDogbG9jYWxpemUoJ2FyY2hpdmVHcm91cFNlc3Npb24uY29uZmlybVNpbmdsZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGFyY2hpdmUgMSBzZXNzaW9uIGZyb20gJ3swfSc/XCIsIGNvbnRleHQuZ3JvdXAubmFtZSk7XG5cdH1cblxuXHRyZXR1cm4gd29yZGluZyA9PT0gQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lXG5cdFx0PyBsb2NhbGl6ZSgnbWFya0dyb3VwU2Vzc2lvbnNEb25lLmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBtYXJrIHswfSBzZXNzaW9ucyBmcm9tICd7MX0nIGFzIGRvbmU/XCIsIGNvbnRleHQuc2Vzc2lvbnMubGVuZ3RoLCBjb250ZXh0Lmdyb3VwLm5hbWUpXG5cdFx0OiBsb2NhbGl6ZSgnYXJjaGl2ZUdyb3VwU2Vzc2lvbnMuY29uZmlybScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGFyY2hpdmUgezB9IHNlc3Npb25zIGZyb20gJ3sxfSc/XCIsIGNvbnRleHQuc2Vzc2lvbnMubGVuZ3RoLCBjb250ZXh0Lmdyb3VwLm5hbWUpO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBCYXNlQXJjaGl2ZVNlc3Npb25zSW5Hcm91cEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHdvcmRpbmc6IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcpIHtcblx0XHRjb25zdCBhY3Rpb24gPSBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25QcmVzZW50YXRpb24od29yZGluZykuYXJjaGl2ZUFsbDtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlldy5tYXJrQWxsSW5Hcm91cEFzRG9uZScsXG5cdFx0XHR0aXRsZTogYWN0aW9uLnRpdGxlLFxuXHRcdFx0aWNvbjogYWN0aW9uLmljb24sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogU2Vzc2lvbkdyb3VwVG9vbGJhck1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IFNlc3Npb25Hcm91cEhhc1Zpc2libGVTZXNzaW9uc0NvbnRleHQsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElTZXNzaW9uR3JvdXBJdGVtKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFjb250ZXh0IHx8ICFjb250ZXh0LnNlc3Npb25zIHx8IGNvbnRleHQuc2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNraXBDb25maXJtYXRpb24gPSBzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKENvbmZpcm1BcmNoaXZlU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIGZhbHNlKTtcblx0XHRpZiAoIXNraXBDb25maXJtYXRpb24pIHtcblx0XHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdG1lc3NhZ2U6IGdldEFyY2hpdmVHcm91cENvbmZpcm1hdGlvbk1lc3NhZ2UoY29udGV4dCwgdGhpcy53b3JkaW5nKSxcblx0XHRcdFx0ZGV0YWlsOiB0aGlzLndvcmRpbmcgPT09IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ21hcmtHcm91cFNlc3Npb25zRG9uZS5kZXRhaWwnLCBcIllvdSBjYW4gcmVzdG9yZSBzZXNzaW9ucyBsYXRlciBpZiBuZWVkZWQgZnJvbSB0aGUgc2Vzc2lvbnMgdmlldy5cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhcmNoaXZlR3JvdXBTZXNzaW9ucy5kZXRhaWwnLCBcIllvdSBjYW4gdW5hcmNoaXZlIHNlc3Npb25zIGxhdGVyIGlmIG5lZWRlZCBmcm9tIHRoZSBzZXNzaW9ucyB2aWV3LlwiKSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogZ2V0Q2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uUHJlc2VudGF0aW9uKHRoaXMud29yZGluZykuYXJjaGl2ZUFsbC50aXRsZS52YWx1ZSxcblx0XHRcdFx0Y2hlY2tib3g6IHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2RvTm90QXNrQWdhaW4nLCBcIkRvIG5vdCBhc2sgbWUgYWdhaW5cIilcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghY29uZmlybWVkLmNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb25maXJtZWQuY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENvbmZpcm1BcmNoaXZlU3RvcmFnZUtleSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGNvbnRleHQuc2Vzc2lvbnMpIHtcblx0XHRcdGF3YWl0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEFyY2hpdmVTZXNzaW9uc0luR3JvdXBBY3Rpb24gZXh0ZW5kcyBCYXNlQXJjaGl2ZVNlc3Npb25zSW5Hcm91cEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuQXJjaGl2ZSk7XG5cdH1cbn1cblxuY2xhc3MgTWFya0FsbFNlc3Npb25zSW5Hcm91cEFzRG9uZUFjdGlvbiBleHRlbmRzIEJhc2VBcmNoaXZlU2Vzc2lvbnNJbkdyb3VwQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRGVsZXRlRW1wdHlTZXNzaW9uR3JvdXBBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXcuZGVsZXRlRW1wdHlHcm91cCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkZWxldGVFbXB0eUdyb3VwJywgXCJEZWxldGUgR3JvdXBcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnRyYXNoLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IFNlc3Npb25Hcm91cFRvb2xiYXJNZW51SWQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHR3aGVuOiBTZXNzaW9uR3JvdXBJc0VtcHR5Q29udGV4dCxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSVNlc3Npb25Hcm91cEl0ZW0pOiB2b2lkIHtcblx0XHRpZiAoIWNvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbkdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25Hcm91cHNTZXJ2aWNlKTtcblx0XHRpZiAoc2Vzc2lvbkdyb3Vwc1NlcnZpY2UuZ2V0U2Vzc2lvbklkc0luR3JvdXAoY29udGV4dC5ncm91cC5pZCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRzZXNzaW9uR3JvdXBzU2VydmljZS5kZWxldGVHcm91cChjb250ZXh0Lmdyb3VwLmlkKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3U2Vzc2lvbkluR3JvdXBBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXcubmV3U2Vzc2lvbkluR3JvdXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmV3U2Vzc2lvbkluR3JvdXAnLCBcIk5ldyBTZXNzaW9uXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5wbHVzLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IFNlc3Npb25Hcm91cFRvb2xiYXJNZW51SWQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBJU2Vzc2lvbkdyb3VwSXRlbSk6IHZvaWQge1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNQYXJ0U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQYXJ0U2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25Hcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0c2Vzc2lvbnNTZXJ2aWNlLm9wZW5OZXdTZXNzaW9uKCk7XG5cdFx0c2Vzc2lvbkdyb3Vwc1NlcnZpY2Uuc2V0UGVuZGluZ05ld1Nlc3Npb25Hcm91cChjb250ZXh0Lmdyb3VwLmlkKTtcblxuXHRcdC8vIE9uIG1vYmlsZSB3ZWIsIHRoZSBzaWRlYmFyIGRyYXdlciBjb3ZlcnMgdGhlIHZpZXdwb3J0OyBjbG9zZSBpdCBzb1xuXHRcdC8vIHRoZSBuZXcgc2Vzc2lvbiB2aWV3IGJlY29tZXMgdmlzaWJsZSBhZnRlciBjcmVhdGlvbi5cblx0XHRpZiAoaXNXZWIgJiYgaXNNb2JpbGUpIHtcblx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENMT1NFX01PQklMRV9TSURFQkFSX0RSQVdFUl9DT01NQU5EX0lEKTtcblx0XHR9XG5cblx0XHRzZXNzaW9uc1BhcnRTZXJ2aWNlLmZvY3VzU2Vzc2lvbihzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKSk7XG5cdH1cbn0pO1xuXG4vLyAgU2Vzc2lvbiBJdGVtIEFjdGlvbnNcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFBpblNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLnBpblNlc3Npb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncGluU2Vzc2lvbicsIFwiUGluXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5waW4sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogU2Vzc2lvbkl0ZW1Ub29sYmFyTWVudUlkLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhJc1Nlc3Npb25QaW5uZWRDb250ZXh0LmtleSwgZmFsc2UpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQua2V5LCBmYWxzZSksXG5cdFx0XHRcdCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBTZXNzaW9uSXRlbUNvbnRleHRNZW51SWQsXG5cdFx0XHRcdGdyb3VwOiAnMF9waW4nLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhJc1Nlc3Npb25QaW5uZWRDb250ZXh0LmtleSwgZmFsc2UpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQua2V5LCBmYWxzZSksXG5cdFx0XHRcdCksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElTZXNzaW9uIHwgSVNlc3Npb25bXSk6IHZvaWQge1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9ucyA9IEFycmF5LmlzQXJyYXkoY29udGV4dCkgPyBjb250ZXh0IDogW2NvbnRleHRdO1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8U2Vzc2lvbnNWaWV3PihTZXNzaW9uc1ZpZXdJZCk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHR2aWV3Py5zZXNzaW9uc0NvbnRyb2w/LnBpblNlc3Npb24oc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFVucGluU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUudW5waW5TZXNzaW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3VucGluU2Vzc2lvbicsIFwiVW5waW5cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnBpbm5lZCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBTZXNzaW9uSXRlbVRvb2xiYXJNZW51SWQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKElzU2Vzc2lvblBpbm5lZENvbnRleHQua2V5LCB0cnVlKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoU2Vzc2lvbklzQXJjaGl2ZWRDb250ZXh0LmtleSwgZmFsc2UpLFxuXHRcdFx0XHQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogU2Vzc2lvbkl0ZW1Db250ZXh0TWVudUlkLFxuXHRcdFx0XHRncm91cDogJzBfcGluJyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoSXNTZXNzaW9uUGlubmVkQ29udGV4dC5rZXksIHRydWUpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQua2V5LCBmYWxzZSksXG5cdFx0XHRcdCksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElTZXNzaW9uIHwgSVNlc3Npb25bXSk6IHZvaWQge1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9ucyA9IEFycmF5LmlzQXJyYXkoY29udGV4dCkgPyBjb250ZXh0IDogW2NvbnRleHRdO1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8U2Vzc2lvbnNWaWV3PihTZXNzaW9uc1ZpZXdJZCk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHR2aWV3Py5zZXNzaW9uc0NvbnRyb2w/LnVucGluU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5hYnN0cmFjdCBjbGFzcyBCYXNlQXJjaGl2ZVNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3Iod29yZGluZzogQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZykge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGdldENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvblByZXNlbnRhdGlvbih3b3JkaW5nKS5hcmNoaXZlO1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5hcmNoaXZlU2Vzc2lvbicsXG5cdFx0XHR0aXRsZTogYWN0aW9uLnRpdGxlLFxuXHRcdFx0aWNvbjogYWN0aW9uLmljb24sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogU2Vzc2lvbkl0ZW1Ub29sYmFyTWVudUlkLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5rZXksIGZhbHNlKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IFNlc3Npb25JdGVtQ29udGV4dE1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICcxX2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5rZXksIGZhbHNlKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25CYXJUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJzFfc2Vzc2lvbicsXG5cdFx0XHRcdG9yZGVyOiA1LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsIENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQua2V5LCBmYWxzZSkpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBJU2Vzc2lvbiB8IElTZXNzaW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWNvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBBcnJheS5pc0FycmF5KGNvbnRleHQpID8gY29udGV4dCA6IFtjb250ZXh0XTtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGF3YWl0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEFyY2hpdmVTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQmFzZUFyY2hpdmVTZXNzaW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5BcmNoaXZlKTtcblx0fVxufVxuXG5jbGFzcyBNYXJrU2Vzc2lvbkFzRG9uZUFjdGlvbiBleHRlbmRzIEJhc2VBcmNoaXZlU2Vzc2lvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZSk7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQmFzZVVuYXJjaGl2ZVNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3Iod29yZGluZzogQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZykge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGdldENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvblByZXNlbnRhdGlvbih3b3JkaW5nKS51bmFyY2hpdmU7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFVOQVJDSElWRV9TRVNTSU9OX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogYWN0aW9uLnRpdGxlLFxuXHRcdFx0aWNvbjogYWN0aW9uLmljb24sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogU2Vzc2lvbkl0ZW1Ub29sYmFyTWVudUlkLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5rZXksIHRydWUpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogU2Vzc2lvbkl0ZW1Db250ZXh0TWVudUlkLFxuXHRcdFx0XHRncm91cDogJzFfZWRpdCcsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoU2Vzc2lvbklzQXJjaGl2ZWRDb250ZXh0LmtleSwgdHJ1ZSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uQmFyVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQua2V5LCB0cnVlKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSVNlc3Npb24gfCBJU2Vzc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdFx0aWYgKGFjdGl2ZVNlc3Npb24pIHtcblx0XHRcdFx0YXdhaXQgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS51bmFyY2hpdmVTZXNzaW9uKGFjdGl2ZVNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9ucyA9IEFycmF5LmlzQXJyYXkoY29udGV4dCkgPyBjb250ZXh0IDogW2NvbnRleHRdO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0YXdhaXQgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS51bmFyY2hpdmVTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBVbmFyY2hpdmVTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQmFzZVVuYXJjaGl2ZVNlc3Npb25BY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nLkFyY2hpdmUpO1xuXHR9XG59XG5cbmNsYXNzIFJlc3RvcmVBcmNoaXZlZFNlc3Npb25BY3Rpb24gZXh0ZW5kcyBCYXNlVW5hcmNoaXZlU2Vzc2lvbkFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlbmFtZVNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJFTkFNRV9TRVNTSU9OX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZW5hbWVTZXNzaW9uJywgXCJSZW5hbWUuLi5cIiksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogU2Vzc2lvbkl0ZW1Db250ZXh0TWVudUlkLFxuXHRcdFx0XHRncm91cDogJzFfZWRpdCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBTZXNzaW9uU3VwcG9ydHNSZW5hbWVDb250ZXh0LFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBJU2Vzc2lvbiB8IElTZXNzaW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gQXJyYXkuaXNBcnJheShjb250ZXh0KSA/IGNvbnRleHRbMF0gOiBjb250ZXh0O1xuXHRcdGlmICghc2Vzc2lvbiB8fCAhc2Vzc2lvbi5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNSZW5hbWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBuZXdUaXRsZSA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdHZhbHVlOiBzZXNzaW9uLnRpdGxlLmdldCgpLFxuXHRcdFx0cHJvbXB0OiBsb2NhbGl6ZSgncmVuYW1lU2Vzc2lvbi5wcm9tcHQnLCBcIk5ldyBhZ2VudCBzZXNzaW9uIHRpdGxlXCIpLFxuXHRcdFx0dmFsaWRhdGVJbnB1dDogYXN5bmMgdmFsdWUgPT4ge1xuXHRcdFx0XHRpZiAoIXZhbHVlLnRyaW0oKSkge1xuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncmVuYW1lU2Vzc2lvbi5lbXB0eScsIFwiVGl0bGUgY2Fubm90IGJlIGVtcHR5XCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aWYgKG5ld1RpdGxlKSB7XG5cdFx0XHRjb25zdCB0cmltbWVkVGl0bGUgPSBuZXdUaXRsZS50cmltKCk7XG5cdFx0XHRpZiAodHJpbW1lZFRpdGxlICYmIHRyaW1tZWRUaXRsZSAhPT0gc2Vzc2lvbi50aXRsZS5nZXQoKS50cmltKCkpIHtcblx0XHRcdFx0YXdhaXQgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5yZW5hbWVTZXNzaW9uKHNlc3Npb24sIHRyaW1tZWRUaXRsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIERlbGV0ZVNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLmRlbGV0ZVNlc3Npb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZGVsZXRlU2Vzc2lvbicsIFwiRGVsZXRlLi4uXCIpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IFNlc3Npb25JdGVtQ29udGV4dE1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICcxX2VkaXQnLFxuXHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0d2hlbjogU2Vzc2lvblN1cHBvcnRzRGVsZXRlQ29udGV4dCxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSVNlc3Npb24gfCBJU2Vzc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25zID0gKEFycmF5LmlzQXJyYXkoY29udGV4dCkgPyBjb250ZXh0IDogW2NvbnRleHRdKS5maWx0ZXIoc2Vzc2lvbiA9PiBzZXNzaW9uLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c0RlbGV0ZSk7XG5cdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdG1lc3NhZ2U6IHNlc3Npb25zLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdkZWxldGVTZXNzaW9uLmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgdGhpcyBzZXNzaW9uP1wiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdkZWxldGVTZXNzaW9ucy5jb25maXJtJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlIHswfSBzZXNzaW9ucz9cIiwgc2Vzc2lvbnMubGVuZ3RoKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2RlbGV0ZVNlc3Npb24uZGV0YWlsJywgXCJUaGlzIGFjdGlvbiBjYW5ub3QgYmUgdW5kb25lLlwiKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdkZWxldGVTZXNzaW9uLmRlbGV0ZScsIFwiRGVsZXRlXCIpXG5cdFx0fSk7XG5cdFx0aWYgKCFjb25maXJtZWQuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZGVsZXRlU2Vzc2lvbnMoc2Vzc2lvbnMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZGlhbG9nU2VydmljZS5lcnJvcihzZXNzaW9ucy5sZW5ndGggPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnZGVsZXRlU2Vzc2lvbi5lcnJvcicsIFwiRmFpbGVkIHRvIGRlbGV0ZSB0aGUgc2Vzc2lvbjogezB9XCIsIHRvRXJyb3JNZXNzYWdlKGVycikpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2RlbGV0ZVNlc3Npb25zLmVycm9yJywgXCJGYWlsZWQgdG8gZGVsZXRlIHRoZSBzZXNzaW9uczogezB9XCIsIHRvRXJyb3JNZXNzYWdlKGVycikpKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTWFya1Nlc3Npb25SZWFkQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5tYXJrUmVhZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtYXJrUmVhZCcsIFwiTWFyayBhcyBSZWFkXCIpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IFNlc3Npb25JdGVtQ29udGV4dE1lbnVJZCxcblx0XHRcdFx0Z3JvdXA6ICcwX3JlYWQnLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFNlc3Npb25Jc1JlYWRDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25IZWFkZXJDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzNfcmVhZCcsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0U2Vzc2lvbklzUmVhZENvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdFx0U2Vzc2lvbklzQXJjaGl2ZWRDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHQpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBJU2Vzc2lvbiB8IElTZXNzaW9uW10pOiB2b2lkIHtcblx0XHRpZiAoIWNvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBBcnJheS5pc0FycmF5KGNvbnRleHQpID8gY29udGV4dCA6IFtjb250ZXh0XTtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm1hcmtBbGxSZWFkKHNlc3Npb25zKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBNYXJrU2Vzc2lvblVucmVhZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUubWFya1VucmVhZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtYXJrVW5yZWFkJywgXCJNYXJrIGFzIFVucmVhZFwiKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBTZXNzaW9uSXRlbUNvbnRleHRNZW51SWQsXG5cdFx0XHRcdGdyb3VwOiAnMF9yZWFkJyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRTZXNzaW9uSXNSZWFkQ29udGV4dCxcblx0XHRcdFx0XHRTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uSGVhZGVyQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICczX3JlYWQnLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFNlc3Npb25Jc1JlYWRDb250ZXh0LFxuXHRcdFx0XHRcdFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0KSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSVNlc3Npb24gfCBJU2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25zID0gQXJyYXkuaXNBcnJheShjb250ZXh0KSA/IGNvbnRleHQgOiBbY29udGV4dF07XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm1hcmtVbnJlYWQoc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5TZXNzaW9uVG9UaGVTaWRlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnNWaWV3UGFuZS5vcGVuVG9UaGVTaWRlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5Ub1RoZVNpZGUnLCBcIk9wZW4gdG8gdGhlIFNpZGVcIiksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogU2Vzc2lvbkl0ZW1Db250ZXh0TWVudUlkLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogLTEsXG5cdFx0XHRcdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBJU2Vzc2lvbiB8IElTZXNzaW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWNvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBBcnJheS5pc0FycmF5KGNvbnRleHQpID8gY29udGV4dCA6IFtjb250ZXh0XTtcblx0XHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNQYXJ0U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQYXJ0U2VydmljZSk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNlc3Npb25zLmxlbmd0aCAtIDE7IGkrKykge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zW2ldO1xuXHRcdFx0Y29uc3QgdmlzaWJsZSA9IHNlc3Npb25zU2VydmljZS52aXNpYmxlU2Vzc2lvbnMuZ2V0KCk7XG5cdFx0XHRjb25zdCBsYXN0VmlzaWJsZSA9IHZpc2libGVbdmlzaWJsZS5sZW5ndGggLSAxXTtcblx0XHRcdGlmIChsYXN0VmlzaWJsZSAmJiBsYXN0VmlzaWJsZS5zZXNzaW9uSWQgIT09IHNlc3Npb24uc2Vzc2lvbklkKSB7XG5cdFx0XHRcdHNlc3Npb25zU2VydmljZS5pbnNlcnRBdChzZXNzaW9uLCBsYXN0VmlzaWJsZS5zZXNzaW9uSWQsICdyaWdodCcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RSZXF1ZXN0ZWQgPSBzZXNzaW9uc1tzZXNzaW9ucy5sZW5ndGggLSAxXTtcblx0XHRhd2FpdCBvcGVuU2Vzc2lvblRvVGhlU2lkZShzZXNzaW9uc1NlcnZpY2UsIGxhc3RSZXF1ZXN0ZWQpO1xuXG5cdFx0Y29uc3QgdmlzaWJsZUFmdGVyT3BlbiA9IHNlc3Npb25zU2VydmljZS52aXNpYmxlU2Vzc2lvbnMuZ2V0KCk7XG5cdFx0Y29uc3Qgb3BlbmVkID0gdmlzaWJsZUFmdGVyT3Blbi5maW5kKHMgPT4gcz8uc2Vzc2lvbklkID09PSBsYXN0UmVxdWVzdGVkLnNlc3Npb25JZCk7XG5cdFx0aWYgKG9wZW5lZCkge1xuXHRcdFx0c2Vzc2lvbnNQYXJ0U2VydmljZS5mb2N1c1Nlc3Npb24ob3BlbmVkKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTWFya0FsbFNlc3Npb25zUmVhZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlld1BhbmUubWFya0FsbFJlYWQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWFya0FsbFJlYWQnLCBcIk1hcmsgQWxsIGFzIFJlYWRcIiksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogU2Vzc2lvbkl0ZW1Db250ZXh0TWVudUlkLFxuXHRcdFx0XHRncm91cDogJzBfcmVhZCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbnMoKVxuXHRcdFx0LmZpbHRlcihzID0+ICFzLmlzQXJjaGl2ZWQuZ2V0KCkgJiYgIXMuaXNSZWFkLmdldCgpKTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm1hcmtBbGxSZWFkKHNlc3Npb25zKTtcblx0fVxufSk7XG5cbmFic3RyYWN0IGNsYXNzIEJhc2VVbmFyY2hpdmVBY3RpdmVTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3Iod29yZGluZzogQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZykge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGdldENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvblByZXNlbnRhdGlvbih3b3JkaW5nKS51bmFyY2hpdmU7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudFNlc3Npb24ucmVzdG9yZScsXG5cdFx0XHR0aXRsZTogYWN0aW9uLnRpdGxlLFxuXHRcdFx0aWNvbjogYWN0aW9uLmljb24sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkFnZW50c0NoYW5nZXNUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0XHRcdFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dFxuXHRcdFx0XHQpXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIWFjdGl2ZVNlc3Npb24gfHwgYWN0aXZlU2Vzc2lvbi5zdGF0dXMuZ2V0KCkgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnVuYXJjaGl2ZVNlc3Npb24oYWN0aXZlU2Vzc2lvbik7XG5cdH1cbn1cblxuY2xhc3MgVW5hcmNoaXZlQWN0aXZlU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEJhc2VVbmFyY2hpdmVBY3RpdmVTZXNzaW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5BcmNoaXZlKTtcblx0fVxufVxuXG5jbGFzcyBSZXN0b3JlQWN0aXZlU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEJhc2VVbmFyY2hpdmVBY3RpdmVTZXNzaW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRTZXNzaW9uc0FyY2hpdmVBY3Rpb25Db25zdHJ1Y3RvcnMod29yZGluZzogQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZyk6IHJlYWRvbmx5IHsgbmV3KCk6IEFjdGlvbjIgfVtdIHtcblx0cmV0dXJuIHdvcmRpbmcgPT09IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuTWFya0FzRG9uZVxuXHRcdD8gW1xuXHRcdFx0TWFya1NlY3Rpb25TZXNzaW9uc0RvbmVBY3Rpb24sXG5cdFx0XHRNYXJrQWxsU2Vzc2lvbnNJbkdyb3VwQXNEb25lQWN0aW9uLFxuXHRcdFx0TWFya1Nlc3Npb25Bc0RvbmVBY3Rpb24sXG5cdFx0XHRSZXN0b3JlQXJjaGl2ZWRTZXNzaW9uQWN0aW9uLFxuXHRcdFx0UmVzdG9yZUFjdGl2ZVNlc3Npb25BY3Rpb24sXG5cdFx0XVxuXHRcdDogW1xuXHRcdFx0QXJjaGl2ZVNlY3Rpb25BY3Rpb24sXG5cdFx0XHRBcmNoaXZlU2Vzc2lvbnNJbkdyb3VwQWN0aW9uLFxuXHRcdFx0QXJjaGl2ZVNlc3Npb25BY3Rpb24sXG5cdFx0XHRVbmFyY2hpdmVTZXNzaW9uQWN0aW9uLFxuXHRcdFx0VW5hcmNoaXZlQWN0aXZlU2Vzc2lvbkFjdGlvbixcblx0XHRdO1xufVxuXG5jbGFzcyBTZXNzaW9uc0FyY2hpdmVBY3Rpb25zQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zZXNzaW9uc0FyY2hpdmVBY3Rpb25zJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvblJlZ2lzdHJhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmdTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5hY3Rpb25SZWdpc3RyYXRpb25zLmNsZWFyKCk7XG5cdFx0Y29uc3Qgd29yZGluZyA9IGdldENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgZ2V0U2Vzc2lvbnNBcmNoaXZlQWN0aW9uQ29uc3RydWN0b3JzKHdvcmRpbmcpKSB7XG5cdFx0XHR0aGlzLmFjdGlvblJlZ2lzdHJhdGlvbnMuYWRkKHJlZ2lzdGVyQWN0aW9uMihhY3Rpb24pKTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFNlc3Npb25zQXJjaGl2ZUFjdGlvbnNDb250cmlidXRpb24uSUQsIFNlc3Npb25zQXJjaGl2ZUFjdGlvbnNDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBNYW5hZ2VBdXRvbWF0aW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlldy5tYW5hZ2VBdXRvbWF0aW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtYW5hZ2VBdXRvbWF0aW9ucycsIFwiTWFuYWdlIEF1dG9tYXRpb25zXCIpLFxuXHRcdFx0bWVudTogW11cblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRhY2Nlc3Nvci5nZXQoSUN1c3RvbVZpZXdTZXJ2aWNlKS5zaG93Q3VzdG9tVmlldyhBVVRPTUFUSU9OU19DVVNUT01fVklFV19JRCk7XG5cdH1cbn0pO1xuXG5jb25zdCBNQVJLX0FMTF9BVVRPTUFUSU9OX1JVTlNfUkVBRF9DT01NQU5EX0lEID0gJ3Nlc3Npb25zVmlldy5tYXJrQWxsQXV0b21hdGlvblJ1bnNSZWFkJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE1hcmtBbGxBdXRvbWF0aW9uUnVuc1JlYWRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1BUktfQUxMX0FVVE9NQVRJT05fUlVOU19SRUFEX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtYXJrQWxsQXV0b21hdGlvblJ1bnNSZWFkJywgXCJNYXJrIEFsbCBhcyBSZWFkXCIpLFxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRvbWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSk7XG5cblx0XHRjb25zdCBydW5zID0gYXV0b21hdGlvblNlcnZpY2UucnVucy5nZXQoKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJU2Vzc2lvbj4oKTtcblx0XHRmb3IgKGNvbnN0IHJ1biBvZiBydW5zKSB7XG5cdFx0XHRpZiAoKHJ1bi5zdGF0dXMgPT09ICdjb21wbGV0ZWQnIHx8IHJ1bi5zdGF0dXMgPT09ICdmYWlsZWQnKSAmJiBydW4uc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb24ocnVuLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChzZXNzaW9uICYmICFzZXNzaW9uLmlzUmVhZC5nZXQoKSkge1xuXHRcdFx0XHRcdHNlc3Npb25zLnNldChzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UubWFya0FsbFJlYWQoWy4uLnNlc3Npb25zLnZhbHVlcygpXSk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUMxQyxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsVUFBVSxhQUFhO0FBQ2hDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLFFBQVEsY0FBYyx1QkFBdUI7QUFDL0QsU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUNuRCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw4Q0FBOEM7QUFDdkQsU0FBUyx1QkFBdUIsd0JBQXdCLCtCQUErQjtBQUN2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
