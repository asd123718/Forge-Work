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
import { Codicon } from "../../../../base/common/codicons.js";
import { fromNow } from "../../../../base/common/date.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableSignalFromEvent } from "../../../../base/common/observable.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuRegistry, MenuId, registerAction2, MenuItemAction, SubmenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { EditorAreaFocusContext, IsAuxiliaryWindowContext, IsSessionsWindowContext } from "../../../../workbench/common/contextkeys.js";
import { IWorkbenchLayoutService, Parts } from "../../../../workbench/services/layout/browser/layoutService.js";
import { getQuickNavigateHandler, inQuickPickContext } from "../../../../workbench/browser/quickaccess.js";
import { Menus } from "../../../browser/menus.js";
import { SessionsCategories } from "../../../common/categories.js";
import { CanGoBackContext, CanGoForwardContext, SessionProviderIdContext, MultipleSessionsVisibleContext, SessionIsArchivedContext, SessionIsCreatedContext, SessionIsMaximizedContext, SessionIsStickyContext, SessionsFocusContext, SessionSupportsMultipleChatsContext, SessionsWelcomeVisibleContext, SessionIdContext, SessionHasMultipleCommittedChatsContext, SessionShouldShowChatTabsContext, SessionHasMultipleOpenChatsContext, SessionsPickerVisibleContext, SessionActiveChatIsClosableContext, SessionActiveChatIsDeletableContext, SessionChatsPickerVisibleContext, SessionActiveChatHasSubagentsContext, SessionsTitleBarNewSessionEnabledContext, SessionsEditorScopeContext, SessionsHasClosedItemContext } from "../../../common/contextkeys.js";
import { ANY_AGENT_HOST_PROVIDER_RE } from "../../../common/agentHostSessionsProvider.js";
import { CLOSE_CHAT_COMMAND_ID, FOCUS_NEXT_CHAT_GROUP_COMMAND_ID, FOCUS_PREVIOUS_CHAT_GROUP_COMMAND_ID, MOVE_CHAT_TO_NEXT_GROUP_COMMAND_ID, MOVE_CHAT_TO_PREVIOUS_GROUP_COMMAND_ID, SPLIT_CHAT_GROUP_DOWN_COMMAND_ID, SPLIT_CHAT_GROUP_RIGHT_COMMAND_ID } from "../../../common/sessionCommands.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ChatOriginKind, getChatCapabilities, getUntitledSessionTitle, SessionStatus } from "../../../services/sessions/common/session.js";
import { ISessionsPartService } from "../../../services/sessions/browser/sessionsPartService.js";
import { ISessionsListModelService } from "../../../services/sessions/browser/sessionsListModelService.js";
import { $, append, EventHelper, ModifierKeyEmitter, reset } from "../../../../base/browser/dom.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { KeybindingLabel } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { OS } from "../../../../base/common/platform.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { asCssVariable } from "../../../../platform/theme/common/colorRegistry.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { markOnboardingTarget } from "../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js";
import { IWorkbenchAssignmentService } from "../../../../workbench/services/assignment/common/assignmentService.js";
import { agentsNewSessionButtonBackground, agentsNewSessionButtonBorder, agentsNewSessionButtonForeground, agentsNewSessionButtonHoverBackground } from "../../../common/theme.js";
import { logSessionsInteraction } from "../../../common/sessionsTelemetry.js";
import { NEW_SESSION_ACTION_ID } from "../../chat/common/constants.js";
import { groupSessionsForPicker } from "./sessionsPicker.js";
import { getSessionConversationActionId, getSessionConversationGroupId } from "../../../browser/sessionConversationGroups.js";
import { SessionConversationsActionViewItem } from "../../../browser/parts/sessionConversationsActionViewItem.js";
import "./media/newSessionActionViewItem.css";
const SHOW_SESSIONS_PICKER_COMMAND_ID = "sessions.showSessionsPicker";
registerAction2(class ShowSessionsPickerAction extends Action2 {
  constructor() {
    super({
      id: SHOW_SESSIONS_PICKER_COMMAND_ID,
      title: localize2("showSessionsPicker", "Show Sessions Picker"),
      f1: true,
      category: SessionsCategories.Sessions,
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyCode.KeyR,
        mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyR },
        weight: KeybindingWeight.SessionsContrib,
        when: IsSessionsWindowContext
      }
    });
  }
  async run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    const quickInputService = accessor.get(IQuickInputService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    const sessionsListModelService = accessor.get(ISessionsListModelService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const contextKeyService = accessor.get(IContextKeyService);
    const activeSessionId = sessionsService.activeSession.get()?.sessionId;
    const toPickItem = (session, reader) => {
      const title = session.title.read(reader) || getUntitledSessionTitle(session.isQuickChat?.read(reader) ?? false);
      const status = session.status.read(reader);
      const isRead = session.isRead.read(reader);
      const isArchived = session.isArchived.read(reader);
      const workspace = session.workspace.read(reader);
      const pullRequestIcon = workspace?.folders[0]?.gitRepository?.gitHubInfo.read(reader)?.pullRequest?.icon;
      const completedStateIcon = session.completedStateIcon?.read(reader) ?? pullRequestIcon;
      const icon = sessionsListModelService.getStatusIcon(status, isRead, isArchived, completedStateIcon);
      const detailParts = [];
      if (workspace?.label) {
        const isWorkspaceFolder = workspace.folders.length > 0 && workspace.folders[0]?.gitRepository?.workTreeUri === void 0;
        const workspaceIcon = workspace.typeIcon ?? (workspace.isVirtualWorkspace ? Codicon.cloud : isWorkspaceFolder ? Codicon.folder : Codicon.worktree);
        detailParts.push(`$(${Codicon.blank.id}) $(${workspaceIcon.id}) ${workspace.label}`);
      } else {
        detailParts.push(`$(${Codicon.blank.id})`);
      }
      detailParts.push(fromNow(session.updatedAt.read(reader), true, true));
      return {
        id: session.sessionId,
        label: title,
        detail: detailParts.join(" \xB7 "),
        iconClass: ThemeIcon.asClassName(icon),
        iconColor: icon.color,
        session
      };
    };
    const picker = quickInputService.createQuickPick({ useSeparators: true });
    picker.placeholder = localize("searchSessions", "Search sessions by name or folder");
    picker.canAcceptInBackground = true;
    picker.matchOnDetail = true;
    const disposables = new DisposableStore();
    disposables.add(picker);
    const sessionsChanged = observableSignalFromEvent("sessionsPickerSessionsChanged", sessionsManagementService.onDidChangeSessions);
    disposables.add(autorun((reader) => {
      sessionsChanged.read(reader);
      const { recent, other } = sessionsService.getRecentlyOpenedSessions();
      const sessionGroups = groupSessionsForPicker(recent, other, reader);
      const items = [{
        id: "newSession",
        label: `$(add) ${localize("newSession", "New Session")}`,
        session: void 0
      }];
      let firstSessionItem;
      const appendSessions = (label, sessions) => {
        if (sessions.length === 0) {
          return;
        }
        items.push({ type: "separator", label });
        for (const session of sessions) {
          const item = toPickItem(session, reader);
          firstSessionItem ??= item;
          items.push(item);
        }
      };
      appendSessions(localize("sessionsPickerNeedsInput", "needs input"), sessionGroups.needsInput);
      appendSessions(localize("sessionsPickerUnread", "unread"), sessionGroups.unread);
      appendSessions(localize("recentlyOpened", "recently opened"), sessionGroups.recent);
      appendSessions(localize("otherSessions", "other sessions"), sessionGroups.other);
      const activeItemId = picker.activeItems[0]?.id;
      picker.items = items;
      const activeItem = activeItemId ? items.find((item) => item.type !== "separator" && item.id === activeItemId) : firstSessionItem;
      if (activeItem) {
        picker.activeItems = [activeItem];
      }
    }));
    const pickerVisibleContext = SessionsPickerVisibleContext.bindTo(contextKeyService);
    pickerVisibleContext.set(true);
    disposables.add(toDisposable(() => pickerVisibleContext.reset()));
    const openSelected = (selected, inBackground, toSide) => {
      if (!selected.session) {
        sessionsService.openNewSession();
        sessionsPartService.focusSession(sessionsService.activeSession.get());
        return;
      }
      if (toSide && activeSessionId !== void 0 && selected.session.sessionId !== activeSessionId) {
        sessionsService.insertAt(selected.session, activeSessionId, "right", !inBackground);
      } else {
        sessionsService.openSession(selected.session.resource, { preserveFocus: inBackground });
      }
    };
    disposables.add(picker.onDidAccept((e) => {
      const [selected] = picker.selectedItems;
      if (selected) {
        const toSide = picker.keyMods.ctrlCmd || picker.keyMods.alt;
        openSelected(selected, e.inBackground, toSide);
      }
      if (!e.inBackground) {
        picker.hide();
      }
    }));
    disposables.add(picker.onDidHide(() => disposables.dispose()));
    picker.show();
  }
});
const SESSIONS_PICKER_NAVIGATE_NEXT_ID = "sessions.showSessionsPicker.navigateNext";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: SESSIONS_PICKER_NAVIGATE_NEXT_ID,
  weight: KeybindingWeight.SessionsContrib + 50,
  handler: getQuickNavigateHandler(SESSIONS_PICKER_NAVIGATE_NEXT_ID, true),
  when: SessionsPickerVisibleContext,
  primary: KeyMod.CtrlCmd | KeyCode.KeyR,
  mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyR }
});
const SESSIONS_PICKER_NAVIGATE_PREVIOUS_ID = "sessions.showSessionsPicker.navigatePrevious";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: SESSIONS_PICKER_NAVIGATE_PREVIOUS_ID,
  weight: KeybindingWeight.SessionsContrib + 50,
  handler: getQuickNavigateHandler(SESSIONS_PICKER_NAVIGATE_PREVIOUS_ID, false),
  when: SessionsPickerVisibleContext,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
  mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyR }
});
registerAction2(class GoBackAction extends Action2 {
  constructor() {
    super({
      id: "sessions.goBack",
      title: {
        ...localize2("sessionsGoBack", "Go Back"),
        mnemonicTitle: localize({ key: "miSessionsBack", comment: ["&& denotes a mnemonic"] }, "&&Back")
      },
      f1: true,
      icon: Codicon.arrowLeft,
      tooltip: localize("sessionsGoBackTooltip", "Go Back One Session"),
      category: SessionsCategories.Sessions,
      precondition: CanGoBackContext,
      keybinding: {
        // Higher than `WorkbenchContrib` so the `Ctrl+Shift+Tab` secondary wins over the
        // editor quick-open actions (which bind the same chord at `WorkbenchContrib`).
        weight: KeybindingWeight.SessionsContrib,
        win: { primary: KeyMod.Alt | KeyCode.LeftArrow, secondary: [KeyCode.BrowserBack, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab] },
        mac: { primary: KeyMod.WinCtrl | KeyCode.Minus, secondary: [KeyCode.BrowserBack, KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab] },
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Minus, secondary: [KeyCode.BrowserBack, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab] },
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated())
      },
      menu: [{
        id: Menus.TitleBarCenterLeft,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated())
      }, {
        id: Menus.GoMenu,
        group: "1_history_nav",
        order: 1
      }]
    });
  }
  async run(accessor) {
    await accessor.get(ISessionsService).openPreviousSession();
  }
});
registerAction2(class GoForwardAction extends Action2 {
  constructor() {
    super({
      id: "sessions.goForward",
      title: {
        ...localize2("sessionsGoForward", "Go Forward"),
        mnemonicTitle: localize({ key: "miSessionsForward", comment: ["&& denotes a mnemonic"] }, "&&Forward")
      },
      f1: true,
      icon: Codicon.arrowRight,
      tooltip: localize("sessionsGoForwardTooltip", "Go Forward One Session"),
      category: SessionsCategories.Sessions,
      precondition: CanGoForwardContext,
      keybinding: {
        // Higher than `WorkbenchContrib` so the `Ctrl+Tab` secondary wins over the
        // editor quick-open actions (which bind the same chord at `WorkbenchContrib`).
        weight: KeybindingWeight.SessionsContrib,
        win: { primary: KeyMod.Alt | KeyCode.RightArrow, secondary: [KeyCode.BrowserForward, KeyMod.CtrlCmd | KeyCode.Tab] },
        mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Minus, secondary: [KeyCode.BrowserForward, KeyMod.WinCtrl | KeyCode.Tab] },
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Minus, secondary: [KeyCode.BrowserForward, KeyMod.CtrlCmd | KeyCode.Tab] },
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated())
      },
      menu: [{
        id: Menus.TitleBarCenterLeft,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated())
      }, {
        id: Menus.GoMenu,
        group: "1_history_nav",
        order: 2
      }]
    });
  }
  async run(accessor) {
    await accessor.get(ISessionsService).openNextSession();
  }
});
registerAction2(class FocusActiveSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessions.focusActiveSession",
      title: localize2("focusActiveSession", "Focus Active Session"),
      f1: true,
      category: SessionsCategories.Sessions,
      keybinding: {
        // Must outrank the workbench `workbench.action.chat.open` binding
        // (WorkbenchContrib) so that in the sessions window the chord
        // focuses the active session. Using the normal open chat action will not work for new session views.
        weight: KeybindingWeight.SessionsContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
        mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI }
      }
    });
  }
  async run(accessor) {
    const sessionsPartService = accessor.get(ISessionsPartService);
    const sessionsService = accessor.get(ISessionsService);
    sessionsPartService.focusSession(sessionsService.activeSession.get());
  }
});
function withActiveSessionView(accessor, action) {
  const sessionsService = accessor.get(ISessionsService);
  const view = accessor.get(ISessionsPartService).getSessionView(sessionsService.activeSession.get()?.sessionId);
  if (view) {
    action(view);
  }
}
registerAction2(class FocusPreviousChatGroupAction extends Action2 {
  constructor() {
    super({
      id: FOCUS_PREVIOUS_CHAT_GROUP_COMMAND_ID,
      title: localize2("focusPreviousChatGroup", "Focus Previous Chat Group"),
      f1: true,
      category: SessionsCategories.Sessions,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.LeftArrow),
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated())
      }
    });
  }
  run(accessor) {
    withActiveSessionView(accessor, (view) => view.focusAdjacentChatGroup("previous"));
  }
});
registerAction2(class FocusNextChatGroupAction extends Action2 {
  constructor() {
    super({
      id: FOCUS_NEXT_CHAT_GROUP_COMMAND_ID,
      title: localize2("focusNextChatGroup", "Focus Next Chat Group"),
      f1: true,
      category: SessionsCategories.Sessions,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.RightArrow),
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated())
      }
    });
  }
  run(accessor) {
    withActiveSessionView(accessor, (view) => view.focusAdjacentChatGroup("next"));
  }
});
registerAction2(class SplitChatGroupRightAction extends Action2 {
  constructor() {
    super({
      id: SPLIT_CHAT_GROUP_RIGHT_COMMAND_ID,
      title: localize2("splitChatGroupRight", "Split Chat Group Right"),
      f1: true,
      category: SessionsCategories.Sessions
    });
  }
  run(accessor) {
    withActiveSessionView(accessor, (view) => view.splitActiveChat("right"));
  }
});
registerAction2(class SplitChatGroupDownAction extends Action2 {
  constructor() {
    super({
      id: SPLIT_CHAT_GROUP_DOWN_COMMAND_ID,
      title: localize2("splitChatGroupDown", "Split Chat Group Down"),
      f1: true,
      category: SessionsCategories.Sessions
    });
  }
  run(accessor) {
    withActiveSessionView(accessor, (view) => view.splitActiveChat("bottom"));
  }
});
registerAction2(class MoveChatToPreviousGroupAction extends Action2 {
  constructor() {
    super({
      id: MOVE_CHAT_TO_PREVIOUS_GROUP_COMMAND_ID,
      title: localize2("moveChatToPreviousGroup", "Move Chat to Previous Group"),
      f1: true,
      category: SessionsCategories.Sessions
    });
  }
  run(accessor) {
    withActiveSessionView(accessor, (view) => view.moveActiveChatToAdjacentGroup("previous"));
  }
});
registerAction2(class MoveChatToNextGroupAction extends Action2 {
  constructor() {
    super({
      id: MOVE_CHAT_TO_NEXT_GROUP_COMMAND_ID,
      title: localize2("moveChatToNextGroup", "Move Chat to Next Group"),
      f1: true,
      category: SessionsCategories.Sessions
    });
  }
  run(accessor) {
    withActiveSessionView(accessor, (view) => view.moveActiveChatToAdjacentGroup("next"));
  }
});
for (let index = 0; index < 9; index++) {
  const position = index + 1;
  const isLast = position === 9;
  registerAction2(class FocusSessionByPositionAction extends Action2 {
    constructor() {
      super({
        id: `sessions.focusSessionInGrid${position}`,
        title: isLast ? localize2("focusLastSessionInGrid", "Focus Last Session in Grid") : localize2("focusSessionInGrid", "Focus Session {0} in Grid", position),
        f1: true,
        category: SessionsCategories.Sessions,
        keybinding: {
          weight: KeybindingWeight.SessionsContrib,
          primary: KeyMod.CtrlCmd | KeyCode.Digit1 + index,
          when: IsSessionsWindowContext
        }
      });
    }
    async run(accessor) {
      const sessionsService = accessor.get(ISessionsService);
      const sessionsPartService = accessor.get(ISessionsPartService);
      const visible = sessionsService.visibleSessions.get();
      const targetIndex = isLast ? visible.length - 1 : index;
      if (targetIndex < 0 || targetIndex >= visible.length) {
        return;
      }
      const session = visible[targetIndex];
      sessionsService.setActive(session);
      sessionsPartService.focusSession(session);
    }
  });
}
registerAction2(class CloseAllSessionsAction extends Action2 {
  constructor() {
    super({
      id: "sessions.closeAllSessions",
      title: localize2("closeAllSessions", "Close All Sessions"),
      f1: true,
      category: SessionsCategories.Sessions,
      precondition: IsSessionsWindowContext,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyW),
        // Only fire from the keyboard while a session (its chat view) has focus.
        when: ContextKeyExpr.and(IsSessionsWindowContext, SessionsFocusContext)
      }
    });
  }
  async run(accessor) {
    accessor.get(ISessionsService).closeAllSessions();
  }
});
const CHAT_TAB_KEYBINDING_WEIGHT = KeybindingWeight.SessionsContrib + 10;
const ADD_CHAT_TO_SESSION_ACTION_ID = "sessions.chatCompositeBar.addChat";
registerAction2(class AddChatToSessionAction extends Action2 {
  constructor() {
    super({
      id: ADD_CHAT_TO_SESSION_ACTION_ID,
      title: localize2("chatCompositeBar.addChat", "New Chat"),
      icon: Codicon.add,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        // Like Cmd/Ctrl+T in a browser — opens a new chat tab within the
        // active session. Scoped so it does not steal the shortcut outside
        // the agents window or when the session does not support multiple chats.
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionIsCreatedContext, SessionSupportsMultipleChatsContext, SessionIsArchivedContext.negate()),
        primary: KeyMod.CtrlCmd | KeyCode.KeyT
      },
      menu: {
        id: Menus.SessionBarToolbar,
        group: "navigation",
        order: 0,
        when: ContextKeyExpr.and(SessionIsCreatedContext, SessionSupportsMultipleChatsContext, SessionIsArchivedContext.negate(), SessionShouldShowChatTabsContext.negate())
      }
    });
  }
  async run(accessor, session) {
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    const target = session ?? sessionsService.activeSession.get();
    if (!target) {
      return;
    }
    await sessionsService.openNewChatInSession(target);
    sessionsPartService.focusSession(target);
  }
});
function navigateChatTab(accessor, direction) {
  const sessionsService = accessor.get(ISessionsService);
  const sessionsPartService = accessor.get(ISessionsPartService);
  const extUri = accessor.get(IUriIdentityService).extUri;
  const session = sessionsService.activeSession.get();
  if (!session) {
    return;
  }
  const tabs = session.visibleChatTabs.get();
  if (tabs.length < 2) {
    return;
  }
  const activeChat = session.activeChat.get();
  const currentIndex = activeChat ? tabs.findIndex((chat) => extUri.isEqual(chat.resource, activeChat.resource)) : -1;
  const from = currentIndex === -1 ? 0 : currentIndex;
  const delta = direction === "next" ? 1 : -1;
  const target = tabs[(from + delta + tabs.length) % tabs.length];
  sessionsService.openChat(session, target.resource);
  sessionsPartService.focusSession(session);
}
registerAction2(class NavigateNextChatAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.navigateNextChat",
      title: localize2("navigateNextChat", "Go to Next Chat"),
      f1: true,
      category: SessionsCategories.Sessions,
      precondition: SessionHasMultipleOpenChatsContext,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionHasMultipleOpenChatsContext),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight
      }
    });
  }
  run(accessor) {
    navigateChatTab(accessor, "next");
  }
});
registerAction2(class NavigatePreviousChatAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.navigatePreviousChat",
      title: localize2("navigatePreviousChat", "Go to Previous Chat"),
      f1: true,
      category: SessionsCategories.Sessions,
      precondition: SessionHasMultipleOpenChatsContext,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionHasMultipleOpenChatsContext),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft
      }
    });
  }
  run(accessor) {
    navigateChatTab(accessor, "previous");
  }
});
registerAction2(class CloseChatAction extends Action2 {
  constructor() {
    super({
      id: CLOSE_CHAT_COMMAND_ID,
      title: localize2("closeActiveChat", "Close Chat"),
      icon: Codicon.close,
      // Hidden from the palette: closing a specific chat is contextual (the
      // keybinding targets the active chat; the menu targets a tab).
      f1: false,
      category: SessionsCategories.Sessions,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        // Intercept Ctrl/Cmd+W (which otherwise closes the session) only
        // while the active chat is a closeable non-main chat, so it closes
        // the chat tab instead — like closing a tab vs the window.
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionActiveChatIsClosableContext),
        primary: KeyMod.CtrlCmd | KeyCode.KeyW,
        win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] }
      },
      // Rendered as the tab's close button by the chat tab strip; the main
      // chat's tab does not render this menu, so no per-tab gating is needed.
      menu: {
        id: Menus.SessionChatTab,
        group: "navigation",
        order: 10
      }
    });
  }
  async run(accessor, context) {
    const sessionsService = accessor.get(ISessionsService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const extUri = accessor.get(IUriIdentityService).extUri;
    const session = context?.session ?? sessionsService.activeSession.get();
    if (!session) {
      return;
    }
    const chat = context?.chat ?? session.activeChat.get();
    if (!chat || extUri.isEqual(chat.resource, session.mainChat.get().resource)) {
      return;
    }
    if (chat.status.get() === SessionStatus.Untitled) {
      await sessionsManagementService.deleteChat(session, chat.resource, { skipConfirmation: true });
    } else {
      await sessionsService.closeChat(session, chat);
    }
  }
});
registerAction2(class CloseAllChatsAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.closeAllChats",
      title: localize2("closeAllChats", "Close All Chats"),
      f1: true,
      category: SessionsCategories.Sessions,
      // Enabled (palette + keybinding) only while the active session has more
      // than one open chat, so the chord targets the focused session and
      // stays inert for single-chat sessions.
      precondition: SessionHasMultipleOpenChatsContext,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        when: ContextKeyExpr.and(
          IsSessionsWindowContext,
          // While a modal editor has focus, let VS Code's own
          // closeEditorsInGroup (same chord) act on the editor group.
          EditorAreaFocusContext.toNegated(),
          SessionHasMultipleOpenChatsContext
        ),
        // Mirror VS Code's "Close All Editors in Group" chord (Ctrl/Cmd+K W):
        // a session is the Agents-window analogue of an editor group. Note
        // "Close All Sessions" already owns Ctrl/Cmd+K Ctrl/Cmd+W.
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyW)
      }
    });
  }
  async run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const extUri = accessor.get(IUriIdentityService).extUri;
    const session = sessionsService.activeSession.get();
    if (!session) {
      return;
    }
    const mainResource = session.mainChat.get().resource;
    const chatsToClose = session.openChats.get().filter((chat) => !extUri.isEqual(chat.resource, mainResource));
    for (const chat of chatsToClose) {
      if (chat.status.get() === SessionStatus.Untitled) {
        await sessionsManagementService.deleteChat(session, chat.resource, { skipConfirmation: true });
      } else {
        await sessionsService.closeChat(session, chat, { skipHistory: true });
      }
    }
  }
});
registerAction2(class DeleteChatAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.deleteChat",
      title: localize2("deleteActiveChat", "Delete Chat"),
      f1: true,
      category: SessionsCategories.Sessions,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        // Delete / Cmd+Backspace (Mac) — mirrors the file-delete keybinding
        // in the Explorer. Scoped so it never fires while typing in an input
        // (chat composer, rename field, etc.) or on the session's main chat.
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), InputFocusedContext.toNegated(), SessionActiveChatIsDeletableContext),
        primary: KeyCode.Delete,
        mac: {
          primary: KeyMod.CtrlCmd | KeyCode.Backspace,
          secondary: [KeyCode.Delete]
        }
      }
    });
  }
  async run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    const sessionsManagementService = accessor.get(ISessionsManagementService);
    const session = sessionsService.activeSession.get();
    if (!session) {
      return;
    }
    const chat = session.activeChat.get();
    if (!chat || !getChatCapabilities(chat, session, void 0).canDelete) {
      return;
    }
    await sessionsManagementService.deleteChat(session, chat.resource);
  }
});
registerAction2(class ReopenLastClosedChatAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.reopenLastClosedChat",
      title: localize2("chatCompositeBar.reopenLastClosedChat", "Reopen Last Closed Chat"),
      f1: true,
      category: SessionsCategories.Sessions,
      precondition: SessionSupportsMultipleChatsContext
    });
  }
  async run(accessor) {
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    const session = sessionsService.activeSession.get();
    if (!session) {
      return;
    }
    const lastClosed = session.lastClosedChat;
    if (!lastClosed) {
      return;
    }
    await sessionsService.openChat(session, lastClosed.resource);
    sessionsPartService.focusSession(session);
  }
});
registerAction2(class ReopenLastClosedItemAction extends Action2 {
  constructor() {
    super({
      id: "sessions.reopenLastClosedItem",
      title: localize2("reopenLastClosedItem", "Reopen Closed Chat or Session"),
      category: SessionsCategories.Sessions,
      keybinding: {
        weight: CHAT_TAB_KEYBINDING_WEIGHT,
        // Like Ctrl/Cmd+Shift+T in a browser. Outside the editor scope the
        // chord always belongs to the sessions area (it is a no-op when
        // nothing was closed); inside it, VS Code's own Reopen Closed
        // Editor takes over.
        when: ContextKeyExpr.and(IsSessionsWindowContext, SessionsEditorScopeContext.negate()),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT
      },
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(IsSessionsWindowContext, SessionsHasClosedItemContext)
      }
    });
  }
  async run(accessor) {
    await accessor.get(ISessionsService).reopenLastClosedItem();
  }
});
const SHOW_CHATS_PICKER_COMMAND_ID = "sessions.showChatsPicker";
const QUICK_SWITCH_NEXT_CHAT_ID = "sessions.quickSwitchNextChat";
const QUICK_SWITCH_PREVIOUS_CHAT_ID = "sessions.quickSwitchPreviousChat";
const CHATS_PICKER_QUICK_NAVIGATE_NEXT_ID = "sessions.chatsPicker.quickNavigateNext";
const CHATS_PICKER_QUICK_NAVIGATE_PREVIOUS_ID = "sessions.chatsPicker.quickNavigatePrevious";
const ChatsPickerScopeContext = ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), SessionHasMultipleOpenChatsContext, inQuickPickContext.negate());
function openChatsPicker(accessor, mru) {
  const sessionsService = accessor.get(ISessionsService);
  const quickInputService = accessor.get(IQuickInputService);
  const sessionsPartService = accessor.get(ISessionsPartService);
  const contextKeyService = accessor.get(IContextKeyService);
  const keybindingService = accessor.get(IKeybindingService);
  const session = sessionsService.activeSession.get();
  if (!session) {
    return;
  }
  const extUri = accessor.get(IUriIdentityService).extUri;
  const toItem = (chat) => ({
    label: chat.title.get()?.trim() || localize("untitledChat", "Untitled Chat"),
    description: fromNow(chat.updatedAt.get(), true, true),
    iconClass: ThemeIcon.asClassName(Codicon.commentDiscussion),
    chat
  });
  const openItems = (mru ? session.visibleChatTabs.get() : session.visibleChatTabs.get().filter((chat) => chat.status.get() !== SessionStatus.Untitled)).map(toItem);
  const closedItems = mru ? [] : session.closedChats.get().filter((chat) => chat.status.get() !== SessionStatus.Untitled && chat.origin?.kind !== ChatOriginKind.Tool).map(toItem);
  const pickItems = [...openItems, ...closedItems];
  if (pickItems.length === 0) {
    return;
  }
  const displayItems = closedItems.length === 0 ? openItems : [
    { type: "separator", label: localize("openChatsGroup", "Open") },
    ...openItems,
    { type: "separator", label: localize("closedChatsGroup", "Closed") },
    ...closedItems
  ];
  const activeChat = session.activeChat.get();
  const activeIndex = Math.max(0, activeChat ? pickItems.findIndex((item) => extUri.isEqual(item.chat.resource, activeChat.resource)) : -1);
  const startIndex = mru ? (activeIndex + (mru.backward ? -1 : 1) + pickItems.length) % pickItems.length : activeIndex;
  const disposables = new DisposableStore();
  const picker = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
  picker.items = displayItems;
  picker.activeItems = [pickItems[startIndex]];
  if (mru) {
    picker.hideInput = true;
    picker.quickNavigate = { keybindings: keybindingService.lookupKeybindings(CHATS_PICKER_QUICK_NAVIGATE_NEXT_ID) };
  } else {
    picker.placeholder = localize("searchChats", "Search chats by name");
    picker.matchOnDescription = true;
  }
  const pickerVisibleContext = SessionChatsPickerVisibleContext.bindTo(contextKeyService);
  pickerVisibleContext.set(true);
  disposables.add(toDisposable(() => pickerVisibleContext.reset()));
  disposables.add(picker.onDidAccept(() => {
    const [selected] = picker.selectedItems;
    if (selected) {
      sessionsService.openChat(session, selected.chat.resource);
      sessionsPartService.focusSession(session);
    }
    picker.hide();
  }));
  disposables.add(picker.onDidHide(() => disposables.dispose()));
  picker.show();
}
registerAction2(class ShowChatsPickerAction extends Action2 {
  constructor() {
    super({
      id: SHOW_CHATS_PICKER_COMMAND_ID,
      title: localize2("showChatsPicker", "Go to Chat in Session"),
      f1: true,
      category: SessionsCategories.Sessions,
      precondition: SessionHasMultipleCommittedChatsContext,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib,
        when: ContextKeyExpr.and(IsSessionsWindowContext, EditorAreaFocusContext.toNegated(), inQuickPickContext.negate()),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO
      }
    });
  }
  run(accessor) {
    openChatsPicker(accessor);
  }
});
registerAction2(class QuickSwitchNextChatAction extends Action2 {
  constructor() {
    super({
      id: QUICK_SWITCH_NEXT_CHAT_ID,
      title: localize2("quickSwitchNextChat", "Quick Switch to Next Chat"),
      f1: false,
      category: SessionsCategories.Sessions,
      precondition: SessionHasMultipleOpenChatsContext,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib + 1,
        when: ChatsPickerScopeContext,
        primary: KeyMod.CtrlCmd | KeyCode.Tab,
        mac: { primary: KeyMod.WinCtrl | KeyCode.Tab }
      }
    });
  }
  run(accessor) {
    openChatsPicker(accessor, { backward: false });
  }
});
registerAction2(class QuickSwitchPreviousChatAction extends Action2 {
  constructor() {
    super({
      id: QUICK_SWITCH_PREVIOUS_CHAT_ID,
      title: localize2("quickSwitchPreviousChat", "Quick Switch to Previous Chat"),
      f1: false,
      category: SessionsCategories.Sessions,
      precondition: SessionHasMultipleOpenChatsContext,
      keybinding: {
        weight: KeybindingWeight.SessionsContrib + 1,
        when: ChatsPickerScopeContext,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
        mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab }
      }
    });
  }
  run(accessor) {
    openChatsPicker(accessor, { backward: true });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CHATS_PICKER_QUICK_NAVIGATE_NEXT_ID,
  weight: KeybindingWeight.SessionsContrib + 50,
  handler: getQuickNavigateHandler(CHATS_PICKER_QUICK_NAVIGATE_NEXT_ID, true),
  when: SessionChatsPickerVisibleContext,
  primary: KeyMod.CtrlCmd | KeyCode.Tab,
  mac: { primary: KeyMod.WinCtrl | KeyCode.Tab }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CHATS_PICKER_QUICK_NAVIGATE_PREVIOUS_ID,
  weight: KeybindingWeight.SessionsContrib + 50,
  handler: getQuickNavigateHandler(CHATS_PICKER_QUICK_NAVIGATE_PREVIOUS_ID, false),
  when: SessionChatsPickerVisibleContext,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
  mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab }
});
let CompactButtonActionViewItem = class extends BaseActionViewItem {
  constructor(action, keybindingService, hoverService, contextKeyService) {
    super(void 0, action);
    this.keybindingService = keybindingService;
    this.hoverService = hoverService;
    this.contextKeyService = contextKeyService;
  }
  /** Optional onboarding spotlight target id for the pill. */
  get onboardingTargetId() {
    return void 0;
  }
  /** Whether to render the trailing keybinding hint chip in the label. */
  get showKeybindingHint() {
    return true;
  }
  /** Hook invoked right before the action runs (e.g. for telemetry). */
  onRun() {
  }
  render(container) {
    super.render(container);
    if (!this.element) {
      return;
    }
    const button = this._register(new Button(this.element, {
      ...defaultButtonStyles,
      buttonSecondaryBackground: asCssVariable(agentsNewSessionButtonBackground),
      buttonSecondaryForeground: asCssVariable(agentsNewSessionButtonForeground),
      buttonSecondaryHoverBackground: asCssVariable(agentsNewSessionButtonHoverBackground),
      buttonSecondaryBorder: asCssVariable(agentsNewSessionButtonBorder),
      secondary: true,
      supportIcons: true
    }));
    button.element.classList.add("agent-sessions-compact-new-button");
    const onboardingTargetId = this.onboardingTargetId;
    if (onboardingTargetId) {
      this._register(markOnboardingTarget(button.element, onboardingTargetId));
    }
    this._register(button.onDidClick((e) => {
      EventHelper.stop(e, true);
      if (!this.action.enabled) {
        return;
      }
      this.onRun();
      this.actionRunner.run(this.action, this._context);
    }));
    const buttonLabel = $("span.new-session-button-label", void 0, this.label);
    const keybindingHint = $("span.new-session-keybinding-hint");
    const keybindingHintLabel = this.showKeybindingHint ? this._register(new KeybindingLabel(keybindingHint, OS, {
      disableTitle: true,
      keybindingLabelBackground: "transparent",
      keybindingLabelForeground: "inherit",
      keybindingLabelBorder: "transparent",
      keybindingLabelBottomBorder: void 0,
      keybindingLabelShadow: void 0
    })) : void 0;
    reset(button.element, buttonLabel);
    const getKeybinding = () => {
      const primaryKeybinding = this.keybindingService.lookupKeybinding(this.commandId, this.contextKeyService, true);
      const resolvedKeybindings = this.keybindingService.lookupKeybindings(this.commandId);
      return primaryKeybinding ?? resolvedKeybindings[0];
    };
    this._register(this.hoverService.setupDelayedHover(button.element, () => ({
      content: this.getHoverContent(getKeybinding()?.getLabel() ?? void 0),
      appearance: { compact: true },
      position: { hoverPosition: HoverPosition.BELOW }
    })));
    let lastRenderedKeybindingLabel = null;
    let lastRenderedKeybindingAriaLabel = null;
    const updateButton = () => {
      const keybinding = getKeybinding();
      const keybindingLabel = keybinding?.getLabel() ?? void 0;
      const keybindingAriaLabel = keybinding?.getAriaLabel() ?? void 0;
      if (lastRenderedKeybindingLabel === keybindingLabel && lastRenderedKeybindingAriaLabel === keybindingAriaLabel) {
        return;
      }
      lastRenderedKeybindingLabel = keybindingLabel;
      lastRenderedKeybindingAriaLabel = keybindingAriaLabel;
      keybindingHintLabel?.set(keybinding);
      if (keybindingHintLabel && keybinding) {
        if (keybindingHint.parentElement !== button.element) {
          append(button.element, keybindingHint);
        }
      } else {
        keybindingHint.remove();
      }
      button.element.setAttribute("aria-label", this.getAriaLabel(keybindingAriaLabel));
    };
    this._register(Event.runAndSubscribe(this.keybindingService.onDidUpdateKeybindings, updateButton));
  }
};
CompactButtonActionViewItem = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IHoverService),
  __decorateParam(3, IContextKeyService)
], CompactButtonActionViewItem);
let NewSessionActionViewItem = class extends CompactButtonActionViewItem {
  constructor(action, telemetrySource, keybindingService, hoverService, telemetryService, contextKeyService) {
    super(action, keybindingService, hoverService, contextKeyService);
    this.telemetrySource = telemetrySource;
    this.telemetryService = telemetryService;
  }
  get commandId() {
    return NEW_SESSION_ACTION_ID;
  }
  get label() {
    return localize("newCompact", "New");
  }
  get onboardingTargetId() {
    return "sessions.newSession.button";
  }
  getHoverContent(keybindingLabel) {
    return keybindingLabel ? localize("newSessionButtonTitle", "New Session ({0})", keybindingLabel) : localize("newSessionButtonTitleWithoutKeybinding", "New Session");
  }
  getAriaLabel(keybindingAriaLabel) {
    return keybindingAriaLabel ? localize("newSessionButtonAriaLabel", "New Session ({0})", keybindingAriaLabel) : localize("newSessionButtonAriaLabelWithoutKeybinding", "New Session");
  }
  onRun() {
    logSessionsInteraction(this.telemetryService, "newSession", this.telemetrySource);
  }
};
NewSessionActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IContextKeyService)
], NewSessionActionViewItem);
let NewSessionActionViewItemContribution = class extends Disposable {
  constructor(actionViewItemService, contextKeyService, assignmentService, environmentService) {
    super();
    this.assignmentService = assignmentService;
    this.environmentService = environmentService;
    this.titleBarEnabledContext = SessionsTitleBarNewSessionEnabledContext.bindTo(contextKeyService);
    const onDidRegister = this._register(new Emitter());
    const menus = [Menus.SidebarSessionsHeader, Menus.TitleBarLeftLayout];
    for (const menu of menus) {
      const source = menu === Menus.TitleBarLeftLayout ? "titleBar" : "sidebar";
      this._register(actionViewItemService.register(menu, NEW_SESSION_ACTION_ID, (action, _options, instantiationService) => {
        if (!(action instanceof MenuItemAction)) {
          return void 0;
        }
        return instantiationService.createInstance(NewSessionActionViewItem, action, source);
      }, onDidRegister.event));
    }
    onDidRegister.fire();
    this._register(this.assignmentService.onDidRefetchAssignments(() => this.updateTitleBarTreatment()));
    this.updateTitleBarTreatment();
  }
  async updateTitleBarTreatment() {
    if (!this.environmentService.isBuilt) {
      this.titleBarEnabledContext.set(true);
      return;
    }
    const enabled = await this.assignmentService.getTreatment(NewSessionActionViewItemContribution.NEW_SESSION_TITLEBAR_TREATMENT);
    this.titleBarEnabledContext.set(enabled === true);
  }
};
NewSessionActionViewItemContribution.ID = "workbench.contrib.sessions.newSessionActionViewItem";
/** ExP treatment that shows the new-session button in the titlebar. */
NewSessionActionViewItemContribution.NEW_SESSION_TITLEBAR_TREATMENT = "agentSessionsTitleBarNewSession";
NewSessionActionViewItemContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IWorkbenchAssignmentService),
  __decorateParam(3, IEnvironmentService)
], NewSessionActionViewItemContribution);
class NewChatActionViewItem extends CompactButtonActionViewItem {
  get commandId() {
    return ADD_CHAT_TO_SESSION_ACTION_ID;
  }
  get label() {
    return localize("chatCompositeBar.addChat.compact", "New Chat");
  }
  get showKeybindingHint() {
    return false;
  }
  getHoverContent(keybindingLabel) {
    return keybindingLabel ? localize("newChatButtonTitle", "New Chat ({0})", keybindingLabel) : localize("newChatButtonTitleWithoutKeybinding", "New Chat");
  }
  getAriaLabel(keybindingAriaLabel) {
    return keybindingAriaLabel ? localize("newChatButtonAriaLabel", "New Chat ({0})", keybindingAriaLabel) : localize("newChatButtonAriaLabelWithoutKeybinding", "New Chat");
  }
}
let SessionNewChatActionViewItemContribution = class extends Disposable {
  constructor(actionViewItemService) {
    super();
    const onDidRegister = this._register(new Emitter());
    this._register(actionViewItemService.register(Menus.SessionBarToolbar, ADD_CHAT_TO_SESSION_ACTION_ID, (action, _options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(NewChatActionViewItem, action);
    }, onDidRegister.event));
    onDidRegister.fire();
  }
};
SessionNewChatActionViewItemContribution.ID = "workbench.contrib.sessions.newChatActionViewItem";
SessionNewChatActionViewItemContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService)
], SessionNewChatActionViewItemContribution);
let SessionConversationsActionViewItemContribution = class extends Disposable {
  constructor(actionViewItemService) {
    super();
    this._register(actionViewItemService.register(Menus.SessionHeaderMeta, Menus.SessionConversations, (action, _options, instantiationService) => {
      if (!(action instanceof SubmenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(SessionConversationsActionViewItem, action);
    }));
  }
};
SessionConversationsActionViewItemContribution.ID = "workbench.contrib.sessions.conversationsActionViewItem";
SessionConversationsActionViewItemContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService)
], SessionConversationsActionViewItemContribution);
MenuRegistry.appendMenuItem(Menus.SessionHeaderMeta, {
  submenu: Menus.SessionConversations,
  title: localize2("chatCompositeBar.conversations", "Chats"),
  icon: Codicon.commentDiscussion,
  group: "navigation",
  order: 100,
  when: ContextKeyExpr.and(SessionIsCreatedContext, SessionIsArchivedContext.negate(), ContextKeyExpr.or(ContextKeyExpr.and(SessionSupportsMultipleChatsContext, SessionHasMultipleCommittedChatsContext), SessionActiveChatHasSubagentsContext))
});
let SessionConversationsMenuContribution = class extends Disposable {
  constructor(_sessionsService, _uriIdentityService) {
    super();
    this._sessionsService = _sessionsService;
    this._uriIdentityService = _uriIdentityService;
    this._register(autorun((reader) => {
      for (const session of this._sessionsService.visibleSessions.read(reader)) {
        if (session) {
          reader.store.add(this._registerSessionConversations(session, reader));
        }
      }
    }));
  }
  _registerSessionConversations(session, reader) {
    const store = new DisposableStore();
    const that = this;
    const extUri = this._uriIdentityService.extUri;
    const scopedToSession = ContextKeyExpr.equals(SessionIdContext.key, session.sessionId);
    const allChats = session.chats.read(reader);
    const activeChat = session.activeChat.read(reader);
    const registerOpen = (chat, group, order) => {
      const chatResource = chat.resource;
      const title = chat.title.read(reader) || localize("untitledChat", "Untitled Chat");
      store.add(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: getSessionConversationActionId(session.sessionId, chatResource),
            title,
            menu: { id: Menus.SessionConversations, group, order, when: scopedToSession }
          });
        }
        async run(accessor, forwardedSession) {
          const target = forwardedSession ?? session;
          const targetChat = target.chats.get().find((c) => extUri.isEqual(c.resource, chatResource));
          if (!targetChat) {
            return;
          }
          if (ModifierKeyEmitter.getInstance().keyStatus.altKey) {
            const view = accessor.get(ISessionsPartService).getSessionView(target.sessionId);
            if (view) {
              await view.openChatToSide(targetChat.resource);
              return;
            }
          }
          await that._sessionsService.openChat(target, targetChat.resource);
        }
      }));
    };
    allChats.forEach((chat, index) => {
      if (chat.status.read(reader) === SessionStatus.Untitled) {
        return;
      }
      const group = getSessionConversationGroupId(chat, activeChat, extUri);
      if (group) {
        registerOpen(chat, group, index);
      }
    });
    return store;
  }
};
SessionConversationsMenuContribution.ID = "workbench.contrib.sessions.conversationsMenu";
SessionConversationsMenuContribution = __decorateClass([
  __decorateParam(0, ISessionsService),
  __decorateParam(1, IUriIdentityService)
], SessionConversationsMenuContribution);
registerAction2(class TogglePinSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.togglePin",
      title: localize2("chatCompositeBar.pin", "Pin Session"),
      icon: Codicon.pin,
      toggled: {
        condition: SessionIsStickyContext,
        icon: Codicon.pinned,
        title: localize("chatCompositeBar.unpin", "Unpin Session")
      },
      menu: {
        id: Menus.SessionBarToolbar,
        group: "1_session",
        order: 10,
        when: ContextKeyExpr.and(SessionIsCreatedContext, SessionIsArchivedContext.negate())
      }
    });
  }
  async run(accessor, session) {
    if (!session) {
      return;
    }
    accessor.get(ISessionsService).toggleSessionStickiness(session);
  }
});
MenuRegistry.appendMenuItem(Menus.SessionHeaderContext, {
  command: {
    id: "sessions.chatCompositeBar.togglePin",
    title: localize("chatCompositeBar.pinView", "Pin View"),
    toggled: {
      condition: SessionIsStickyContext,
      title: localize("chatCompositeBar.unpinView", "Unpin View")
    }
  },
  group: "1_view",
  order: 1,
  when: SessionIsCreatedContext
});
registerAction2(class RenameSessionHeaderAction extends Action2 {
  constructor() {
    super({
      id: "sessions.sessionHeader.rename",
      title: localize2("renameSessionHeader", "Rename..."),
      menu: [{
        id: Menus.SessionHeaderContext,
        group: "2_edit",
        order: 1,
        when: ContextKeyExpr.regex(SessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE)
      }]
    });
  }
  run(accessor, session) {
    if (!session) {
      return;
    }
    accessor.get(ISessionsPartService).getSessionView(session.sessionId)?.startTitleEditing();
  }
});
registerAction2(class CloseSessionAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.close",
      title: localize2("chatCompositeBar.close", "Close"),
      icon: Codicon.close,
      menu: [{
        id: Menus.SessionBarToolbar,
        when: ContextKeyExpr.or(SessionIsCreatedContext, MultipleSessionsVisibleContext),
        group: "1_session",
        order: 30
      }, {
        id: Menus.SessionHeaderContext,
        when: ContextKeyExpr.or(SessionIsCreatedContext, MultipleSessionsVisibleContext),
        group: "1_view",
        order: 2
      }]
    });
  }
  async run(accessor, session) {
    const sessionsService = accessor.get(ISessionsService);
    const sessionsPartService = accessor.get(ISessionsPartService);
    sessionsService.closeSession(session);
    sessionsPartService.focusSession(sessionsService.activeSession.get());
  }
});
registerAction2(class ToggleMaximizeSessionViewAction extends Action2 {
  constructor() {
    super({
      id: "sessions.chatCompositeBar.toggleMaximize",
      title: localize2("chatCompositeBar.maximize", "Maximize Session"),
      icon: Codicon.screenFull,
      toggled: {
        condition: SessionIsMaximizedContext,
        icon: Codicon.screenNormal,
        title: localize("chatCompositeBar.unmaximize", "Restore Session")
      },
      menu: {
        id: Menus.SessionBarToolbar,
        when: MultipleSessionsVisibleContext,
        group: "1_session",
        order: 20
      }
    });
  }
  async run(accessor, session) {
    accessor.get(ISessionsPartService).toggleMaximizeSession(session);
    accessor.get(ISessionsService).setActive(session);
  }
});
registerAction2(class CloseEditorAreaAction extends Action2 {
  constructor() {
    super({
      id: "sessions.closeEditorArea",
      title: localize2("closeEditorArea", "Close Editor Area"),
      icon: Codicon.close,
      category: SessionsCategories.Sessions,
      menu: {
        id: MenuId.EditorGroupWatermarkToolbar,
        group: "navigation",
        order: 10,
        when: IsSessionsWindowContext
      }
    });
  }
  async run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    layoutService.setPartHidden(true, Parts.EDITOR_PART);
  }
});
export {
  CompactButtonActionViewItem,
  NewSessionActionViewItemContribution,
  SHOW_CHATS_PICKER_COMMAND_ID,
  SHOW_SESSIONS_PICKER_COMMAND_ID,
  SessionConversationsActionViewItemContribution,
  SessionConversationsMenuContribution,
  SessionNewChatActionViewItemContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXGJyb3dzZXJcXHNlc3Npb25zQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBmcm9tTm93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElSZWFkZXIsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudVJlZ2lzdHJ5LCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiwgTWVudUl0ZW1BY3Rpb24sIFN1Ym1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSW5wdXRGb2N1c2VkQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IEVkaXRvckFyZWFGb2N1c0NvbnRleHQsIElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFF1aWNrTmF2aWdhdGVIYW5kbGVyLCBpblF1aWNrUGlja0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9xdWlja2FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQ2FuR29CYWNrQ29udGV4dCwgQ2FuR29Gb3J3YXJkQ29udGV4dCwgU2Vzc2lvblByb3ZpZGVySWRDb250ZXh0LCBNdWx0aXBsZVNlc3Npb25zVmlzaWJsZUNvbnRleHQsIFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dCwgU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsIFNlc3Npb25Jc01heGltaXplZENvbnRleHQsIFNlc3Npb25Jc1N0aWNreUNvbnRleHQsIFNlc3Npb25zRm9jdXNDb250ZXh0LCBTZXNzaW9uU3VwcG9ydHNNdWx0aXBsZUNoYXRzQ29udGV4dCwgU2Vzc2lvbnNXZWxjb21lVmlzaWJsZUNvbnRleHQsIFNlc3Npb25JZENvbnRleHQsIFNlc3Npb25IYXNNdWx0aXBsZUNvbW1pdHRlZENoYXRzQ29udGV4dCwgU2Vzc2lvblNob3VsZFNob3dDaGF0VGFic0NvbnRleHQsIFNlc3Npb25IYXNNdWx0aXBsZU9wZW5DaGF0c0NvbnRleHQsIFNlc3Npb25zUGlja2VyVmlzaWJsZUNvbnRleHQsIFNlc3Npb25BY3RpdmVDaGF0SXNDbG9zYWJsZUNvbnRleHQsIFNlc3Npb25BY3RpdmVDaGF0SXNEZWxldGFibGVDb250ZXh0LCBTZXNzaW9uQ2hhdHNQaWNrZXJWaXNpYmxlQ29udGV4dCwgU2Vzc2lvbkFjdGl2ZUNoYXRIYXNTdWJhZ2VudHNDb250ZXh0LCBTZXNzaW9uc1RpdGxlQmFyTmV3U2Vzc2lvbkVuYWJsZWRDb250ZXh0LCBTZXNzaW9uc0VkaXRvclNjb3BlQ29udGV4dCwgU2Vzc2lvbnNIYXNDbG9zZWRJdGVtQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBBTllfQUdFTlRfSE9TVF9QUk9WSURFUl9SRSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IENMT1NFX0NIQVRfQ09NTUFORF9JRCwgRk9DVVNfTkVYVF9DSEFUX0dST1VQX0NPTU1BTkRfSUQsIEZPQ1VTX1BSRVZJT1VTX0NIQVRfR1JPVVBfQ09NTUFORF9JRCwgTU9WRV9DSEFUX1RPX05FWFRfR1JPVVBfQ09NTUFORF9JRCwgTU9WRV9DSEFUX1RPX1BSRVZJT1VTX0dST1VQX0NPTU1BTkRfSUQsIFNQTElUX0NIQVRfR1JPVVBfRE9XTl9DT01NQU5EX0lELCBTUExJVF9DSEFUX0dST1VQX1JJR0hUX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2Vzc2lvbkNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uLCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRPcmlnaW5LaW5kLCBnZXRDaGF0Q2FwYWJpbGl0aWVzLCBnZXRVbnRpdGxlZFNlc3Npb25UaXRsZSwgSUNoYXQsIElTZXNzaW9uLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUGFydFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTGlzdE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7ICQsIGFwcGVuZCwgRXZlbnRIZWxwZXIsIE1vZGlmaWVyS2V5RW1pdHRlciwgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ0xhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2tleWJpbmRpbmdMYWJlbC9rZXliaW5kaW5nTGFiZWwuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgbWFya09uYm9hcmRpbmdUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9vbmJvYXJkaW5nL2Jyb3dzZXIvc3BvdGxpZ2h0L29uYm9hcmRpbmdUYXJnZXQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFnZW50c05ld1Nlc3Npb25CdXR0b25CYWNrZ3JvdW5kLCBhZ2VudHNOZXdTZXNzaW9uQnV0dG9uQm9yZGVyLCBhZ2VudHNOZXdTZXNzaW9uQnV0dG9uRm9yZWdyb3VuZCwgYWdlbnRzTmV3U2Vzc2lvbkJ1dHRvbkhvdmVyQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBsb2dTZXNzaW9uc0ludGVyYWN0aW9uLCBTZXNzaW9uc0ludGVyYWN0aW9uU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25zVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE5FV19TRVNTSU9OX0FDVElPTl9JRCB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBncm91cFNlc3Npb25zRm9yUGlja2VyIH0gZnJvbSAnLi9zZXNzaW9uc1BpY2tlci5qcyc7XG5pbXBvcnQgeyBnZXRTZXNzaW9uQ29udmVyc2F0aW9uQWN0aW9uSWQsIGdldFNlc3Npb25Db252ZXJzYXRpb25Hcm91cElkIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9zZXNzaW9uQ29udmVyc2F0aW9uR3JvdXBzLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db252ZXJzYXRpb25zQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3Nlc3Npb25Db252ZXJzYXRpb25zQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0ICcuL21lZGlhL25ld1Nlc3Npb25BY3Rpb25WaWV3SXRlbS5jc3MnO1xuXG4vLyAtLSBTaG93IFNlc3Npb25zIFBpY2tlciAtLVxuXG5leHBvcnQgY29uc3QgU0hPV19TRVNTSU9OU19QSUNLRVJfQ09NTUFORF9JRCA9ICdzZXNzaW9ucy5zaG93U2Vzc2lvbnNQaWNrZXInO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgU2hvd1Nlc3Npb25zUGlja2VyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTSE9XX1NFU1NJT05TX1BJQ0tFUl9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvd1Nlc3Npb25zUGlja2VyJywgXCJTaG93IFNlc3Npb25zIFBpY2tlclwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVIsXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVIgfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYixcblx0XHRcdFx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNQYXJ0U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQYXJ0U2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uSWQgPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkO1xuXG5cdFx0aW50ZXJmYWNlIElTZXNzaW9uUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdFx0XHRzZXNzaW9uPzogSVNlc3Npb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9QaWNrSXRlbSA9IChzZXNzaW9uOiBJU2Vzc2lvbiwgcmVhZGVyOiBJUmVhZGVyKTogSVNlc3Npb25QaWNrSXRlbSA9PiB7XG5cdFx0XHRjb25zdCB0aXRsZSA9IHNlc3Npb24udGl0bGUucmVhZChyZWFkZXIpIHx8IGdldFVudGl0bGVkU2Vzc2lvblRpdGxlKHNlc3Npb24uaXNRdWlja0NoYXQ/LnJlYWQocmVhZGVyKSA/PyBmYWxzZSk7XG5cblx0XHRcdC8vIFN0YXR1cyBpY29uLCBtaXJyb3JpbmcgdGhlIHNlc3Npb25zIGxpc3QgYW5kIHNlc3Npb24gaGVhZGVyLlxuXHRcdFx0Y29uc3Qgc3RhdHVzID0gc2Vzc2lvbi5zdGF0dXMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaXNSZWFkID0gc2Vzc2lvbi5pc1JlYWQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaXNBcmNoaXZlZCA9IHNlc3Npb24uaXNBcmNoaXZlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBzZXNzaW9uLndvcmtzcGFjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBwdWxsUmVxdWVzdEljb24gPSB3b3Jrc3BhY2U/LmZvbGRlcnNbMF0/LmdpdFJlcG9zaXRvcnk/LmdpdEh1YkluZm8ucmVhZChyZWFkZXIpPy5wdWxsUmVxdWVzdD8uaWNvbjtcblx0XHRcdGNvbnN0IGNvbXBsZXRlZFN0YXRlSWNvbiA9IHNlc3Npb24uY29tcGxldGVkU3RhdGVJY29uPy5yZWFkKHJlYWRlcikgPz8gcHVsbFJlcXVlc3RJY29uO1xuXHRcdFx0Y29uc3QgaWNvbiA9IHNlc3Npb25zTGlzdE1vZGVsU2VydmljZS5nZXRTdGF0dXNJY29uKHN0YXR1cywgaXNSZWFkLCBpc0FyY2hpdmVkLCBjb21wbGV0ZWRTdGF0ZUljb24pO1xuXG5cdFx0XHQvLyBTZWNvbmQgcm93OiB3b3Jrc3BhY2UgKHdpdGggaXRzIGljb24sIGxpa2UgdGhlIHNlc3Npb24gaGVhZGVyIC9cblx0XHRcdC8vIGxpc3QpIGFuZCB0aGUgcmVsYXRpdmUgdGltZS4gQSBsZWFkaW5nIGJsYW5rIGljb24gYWxpZ25zIHRoZVxuXHRcdFx0Ly8gd29ya3NwYWNlIGljb24gdW5kZXIgdGhlIHRpdGxlIHRleHQgKHRoZSBzdGF0dXMgaWNvbiBzaXRzIGluIHRoZVxuXHRcdFx0Ly8gbGVmdCBndXR0ZXIpLlxuXHRcdFx0Y29uc3QgZGV0YWlsUGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRpZiAod29ya3NwYWNlPy5sYWJlbCkge1xuXHRcdFx0XHRjb25zdCBpc1dvcmtzcGFjZUZvbGRlciA9IHdvcmtzcGFjZS5mb2xkZXJzLmxlbmd0aCA+IDAgJiYgd29ya3NwYWNlLmZvbGRlcnNbMF0/LmdpdFJlcG9zaXRvcnk/LndvcmtUcmVlVXJpID09PSB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUljb24gPSB3b3Jrc3BhY2UudHlwZUljb24gPz8gKHdvcmtzcGFjZS5pc1ZpcnR1YWxXb3Jrc3BhY2UgPyBDb2RpY29uLmNsb3VkIDogaXNXb3Jrc3BhY2VGb2xkZXIgPyBDb2RpY29uLmZvbGRlciA6IENvZGljb24ud29ya3RyZWUpO1xuXHRcdFx0XHRkZXRhaWxQYXJ0cy5wdXNoKGAkKCR7Q29kaWNvbi5ibGFuay5pZH0pICQoJHt3b3Jrc3BhY2VJY29uLmlkfSkgJHt3b3Jrc3BhY2UubGFiZWx9YCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkZXRhaWxQYXJ0cy5wdXNoKGAkKCR7Q29kaWNvbi5ibGFuay5pZH0pYCk7XG5cdFx0XHR9XG5cdFx0XHRkZXRhaWxQYXJ0cy5wdXNoKGZyb21Ob3coc2Vzc2lvbi51cGRhdGVkQXQucmVhZChyZWFkZXIpLCB0cnVlLCB0cnVlKSk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBzZXNzaW9uLnNlc3Npb25JZCxcblx0XHRcdFx0bGFiZWw6IHRpdGxlLFxuXHRcdFx0XHRkZXRhaWw6IGRldGFpbFBhcnRzLmpvaW4oJyBcXHUwMEI3ICcpLFxuXHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uKSxcblx0XHRcdFx0aWNvbkNvbG9yOiBpY29uLmNvbG9yLFxuXHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcGlja2VyID0gcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElTZXNzaW9uUGlja0l0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnc2VhcmNoU2Vzc2lvbnMnLCBcIlNlYXJjaCBzZXNzaW9ucyBieSBuYW1lIG9yIGZvbGRlclwiKTtcblx0XHRwaWNrZXIuY2FuQWNjZXB0SW5CYWNrZ3JvdW5kID0gdHJ1ZTtcblx0XHQvLyBNYXRjaCBvbiB0aGUgZGV0YWlsIHJvdyB0b28gc28gc2Vzc2lvbnMgY2FuIGJlIGZvdW5kIGJ5IHRoZWlyIGZvbGRlci5cblx0XHRwaWNrZXIubWF0Y2hPbkRldGFpbCA9IHRydWU7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyKTtcblx0XHRjb25zdCBzZXNzaW9uc0NoYW5nZWQgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KCdzZXNzaW9uc1BpY2tlclNlc3Npb25zQ2hhbmdlZCcsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHNlc3Npb25zQ2hhbmdlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB7IHJlY2VudCwgb3RoZXIgfSA9IHNlc3Npb25zU2VydmljZS5nZXRSZWNlbnRseU9wZW5lZFNlc3Npb25zKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uR3JvdXBzID0gZ3JvdXBTZXNzaW9uc0ZvclBpY2tlcihyZWNlbnQsIG90aGVyLCByZWFkZXIpO1xuXHRcdFx0Y29uc3QgaXRlbXM6IChJU2Vzc2lvblBpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFt7XG5cdFx0XHRcdGlkOiAnbmV3U2Vzc2lvbicsXG5cdFx0XHRcdGxhYmVsOiBgJChhZGQpICR7bG9jYWxpemUoJ25ld1Nlc3Npb24nLCBcIk5ldyBTZXNzaW9uXCIpfWAsXG5cdFx0XHRcdHNlc3Npb246IHVuZGVmaW5lZCxcblx0XHRcdH1dO1xuXHRcdFx0bGV0IGZpcnN0U2Vzc2lvbkl0ZW06IElTZXNzaW9uUGlja0l0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBhcHBlbmRTZXNzaW9ucyA9IChsYWJlbDogc3RyaW5nLCBzZXNzaW9uczogcmVhZG9ubHkgSVNlc3Npb25bXSk6IHZvaWQgPT4ge1xuXHRcdFx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGl0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWwgfSk7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB0b1BpY2tJdGVtKHNlc3Npb24sIHJlYWRlcik7XG5cdFx0XHRcdFx0Zmlyc3RTZXNzaW9uSXRlbSA/Pz0gaXRlbTtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRhcHBlbmRTZXNzaW9ucyhsb2NhbGl6ZSgnc2Vzc2lvbnNQaWNrZXJOZWVkc0lucHV0JywgXCJuZWVkcyBpbnB1dFwiKSwgc2Vzc2lvbkdyb3Vwcy5uZWVkc0lucHV0KTtcblx0XHRcdGFwcGVuZFNlc3Npb25zKGxvY2FsaXplKCdzZXNzaW9uc1BpY2tlclVucmVhZCcsIFwidW5yZWFkXCIpLCBzZXNzaW9uR3JvdXBzLnVucmVhZCk7XG5cdFx0XHRhcHBlbmRTZXNzaW9ucyhsb2NhbGl6ZSgncmVjZW50bHlPcGVuZWQnLCBcInJlY2VudGx5IG9wZW5lZFwiKSwgc2Vzc2lvbkdyb3Vwcy5yZWNlbnQpO1xuXHRcdFx0YXBwZW5kU2Vzc2lvbnMobG9jYWxpemUoJ290aGVyU2Vzc2lvbnMnLCBcIm90aGVyIHNlc3Npb25zXCIpLCBzZXNzaW9uR3JvdXBzLm90aGVyKTtcblxuXHRcdFx0Y29uc3QgYWN0aXZlSXRlbUlkID0gcGlja2VyLmFjdGl2ZUl0ZW1zWzBdPy5pZDtcblx0XHRcdHBpY2tlci5pdGVtcyA9IGl0ZW1zO1xuXHRcdFx0Y29uc3QgYWN0aXZlSXRlbSA9IGFjdGl2ZUl0ZW1JZFxuXHRcdFx0XHQ/IGl0ZW1zLmZpbmQoKGl0ZW0pOiBpdGVtIGlzIElTZXNzaW9uUGlja0l0ZW0gPT4gaXRlbS50eXBlICE9PSAnc2VwYXJhdG9yJyAmJiBpdGVtLmlkID09PSBhY3RpdmVJdGVtSWQpXG5cdFx0XHRcdDogZmlyc3RTZXNzaW9uSXRlbTtcblx0XHRcdGlmIChhY3RpdmVJdGVtKSB7XG5cdFx0XHRcdHBpY2tlci5hY3RpdmVJdGVtcyA9IFthY3RpdmVJdGVtXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBFeHBvc2UgYSBjb250ZXh0IGtleSB3aGlsZSB0aGUgcGlja2VyIGlzIG9wZW4gc28gdGhlIG5hdmlnYXRlXG5cdFx0Ly8ga2V5YmluZGluZ3MgKGJvdW5kIHRvIHRoZSBzYW1lIGNob3JkIGFzIHRoaXMgY29tbWFuZCkgY2FuIGFkdmFuY2UgdGhlXG5cdFx0Ly8gc2VsZWN0aW9uIGluc3RlYWQgb2YgcmUtb3BlbmluZyB0aGUgcGlja2VyLlxuXHRcdGNvbnN0IHBpY2tlclZpc2libGVDb250ZXh0ID0gU2Vzc2lvbnNQaWNrZXJWaXNpYmxlQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHBpY2tlclZpc2libGVDb250ZXh0LnNldCh0cnVlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBpY2tlclZpc2libGVDb250ZXh0LnJlc2V0KCkpKTtcblxuXHRcdGNvbnN0IG9wZW5TZWxlY3RlZCA9IChzZWxlY3RlZDogSVNlc3Npb25QaWNrSXRlbSwgaW5CYWNrZ3JvdW5kOiBib29sZWFuLCB0b1NpZGU6IGJvb2xlYW4pOiB2b2lkID0+IHtcblx0XHRcdGlmICghc2VsZWN0ZWQuc2Vzc2lvbikge1xuXHRcdFx0XHRzZXNzaW9uc1NlcnZpY2Uub3Blbk5ld1Nlc3Npb24oKTtcblx0XHRcdFx0c2Vzc2lvbnNQYXJ0U2VydmljZS5mb2N1c1Nlc3Npb24oc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9wZW4gdG8gdGhlIHNpZGU6IHBsYWNlIHRoZSBzZXNzaW9uIGluIGEgbmV3IGdyaWQgc2xvdCBuZXh0IHRvIHRoZVxuXHRcdFx0Ly8gY3VycmVudGx5IGFjdGl2ZSBzZXNzaW9uIGluc3RlYWQgb2YgcmVwbGFjaW5nIGl0LiBGYWxscyBiYWNrIHRvIGFcblx0XHRcdC8vIG5vcm1hbCBvcGVuIHdoZW4gdGhlcmUgaXMgbm8gYWN0aXZlIHNlc3Npb24gdG8gYW5jaG9yIGFnYWluc3Qgb3IgdGhlXG5cdFx0XHQvLyBzZXNzaW9uIGlzIGFscmVhZHkgdGhlIGFjdGl2ZSBvbmUuXG5cdFx0XHRpZiAodG9TaWRlICYmIGFjdGl2ZVNlc3Npb25JZCAhPT0gdW5kZWZpbmVkICYmIHNlbGVjdGVkLnNlc3Npb24uc2Vzc2lvbklkICE9PSBhY3RpdmVTZXNzaW9uSWQpIHtcblx0XHRcdFx0c2Vzc2lvbnNTZXJ2aWNlLmluc2VydEF0KHNlbGVjdGVkLnNlc3Npb24sIGFjdGl2ZVNlc3Npb25JZCwgJ3JpZ2h0JywgIWluQmFja2dyb3VuZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZXNzaW9uc1NlcnZpY2Uub3BlblNlc3Npb24oc2VsZWN0ZWQuc2Vzc2lvbi5yZXNvdXJjZSwgeyBwcmVzZXJ2ZUZvY3VzOiBpbkJhY2tncm91bmQgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRBY2NlcHQoZSA9PiB7XG5cdFx0XHRjb25zdCBbc2VsZWN0ZWRdID0gcGlja2VyLnNlbGVjdGVkSXRlbXM7XG5cdFx0XHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRcdFx0Y29uc3QgdG9TaWRlID0gcGlja2VyLmtleU1vZHMuY3RybENtZCB8fCBwaWNrZXIua2V5TW9kcy5hbHQ7XG5cdFx0XHRcdG9wZW5TZWxlY3RlZChzZWxlY3RlZCwgZS5pbkJhY2tncm91bmQsIHRvU2lkZSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBCYWNrZ3JvdW5kIGFjY2VwdCAoZS5nLiBSaWdodCBBcnJvdykga2VlcHMgdGhlIHBpY2tlciBvcGVuIHNvIHRoZVxuXHRcdFx0Ly8gdXNlciBjYW4gY29udGludWUgbmF2aWdhdGluZywgbWlycm9yaW5nIGVkaXRvciBxdWljayBvcGVuLlxuXHRcdFx0aWYgKCFlLmluQmFja2dyb3VuZCkge1xuXHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkSGlkZSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpKTtcblxuXHRcdHBpY2tlci5zaG93KCk7XG5cdH1cbn0pO1xuXG4vLyAtLSBTZXNzaW9ucyBQaWNrZXIgUXVpY2sgTmF2aWdhdGlvbiAtLVxuLy8gV2hpbGUgdGhlIHNlc3Npb25zIHBpY2tlciBpcyBvcGVuLCBwcmVzc2luZyB0aGUgc2FtZSBjaG9yZCBhZ2FpbiBhZHZhbmNlcyB0aGVcbi8vIGFjdGl2ZSBpdGVtIChhbmQgU2hpZnQgZ29lcyBiYWNrd2FyZHMpLCBzbyB0aGUgdXNlciBjYW4gaG9sZCB0aGUgbW9kaWZpZXIgYW5kXG4vLyB0YWIgdGhyb3VnaCBzZXNzaW9ucywgdGhlbiByZWxlYXNlIHRvIG9wZW4gdGhlIGZvY3VzZWQgb25lLlxuXG5jb25zdCBTRVNTSU9OU19QSUNLRVJfTkFWSUdBVEVfTkVYVF9JRCA9ICdzZXNzaW9ucy5zaG93U2Vzc2lvbnNQaWNrZXIubmF2aWdhdGVOZXh0JztcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogU0VTU0lPTlNfUElDS0VSX05BVklHQVRFX05FWFRfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIgKyA1MCxcblx0aGFuZGxlcjogZ2V0UXVpY2tOYXZpZ2F0ZUhhbmRsZXIoU0VTU0lPTlNfUElDS0VSX05BVklHQVRFX05FWFRfSUQsIHRydWUpLFxuXHR3aGVuOiBTZXNzaW9uc1BpY2tlclZpc2libGVDb250ZXh0LFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Uixcblx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5UiB9LFxufSk7XG5cbmNvbnN0IFNFU1NJT05TX1BJQ0tFUl9OQVZJR0FURV9QUkVWSU9VU19JRCA9ICdzZXNzaW9ucy5zaG93U2Vzc2lvbnNQaWNrZXIubmF2aWdhdGVQcmV2aW91cyc7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IFNFU1NJT05TX1BJQ0tFUl9OQVZJR0FURV9QUkVWSU9VU19JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYiArIDUwLFxuXHRoYW5kbGVyOiBnZXRRdWlja05hdmlnYXRlSGFuZGxlcihTRVNTSU9OU19QSUNLRVJfTkFWSUdBVEVfUFJFVklPVVNfSUQsIGZhbHNlKSxcblx0d2hlbjogU2Vzc2lvbnNQaWNrZXJWaXNpYmxlQ29udGV4dCxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVIsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5BbHQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVIgfSxcbn0pO1xuXG4vLyAtLSBHbyBCYWNrIC0tXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHb0JhY2tBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9ucy5nb0JhY2snLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCdzZXNzaW9uc0dvQmFjaycsIFwiR28gQmFja1wiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVNlc3Npb25zQmFjaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkJhY2tcIilcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGljb246IENvZGljb24uYXJyb3dMZWZ0LFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3Nlc3Npb25zR29CYWNrVG9vbHRpcCcsIFwiR28gQmFjayBPbmUgU2Vzc2lvblwiKSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRwcmVjb25kaXRpb246IENhbkdvQmFja0NvbnRleHQsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdC8vIEhpZ2hlciB0aGFuIGBXb3JrYmVuY2hDb250cmliYCBzbyB0aGUgYEN0cmwrU2hpZnQrVGFiYCBzZWNvbmRhcnkgd2lucyBvdmVyIHRoZVxuXHRcdFx0XHQvLyBlZGl0b3IgcXVpY2stb3BlbiBhY3Rpb25zICh3aGljaCBiaW5kIHRoZSBzYW1lIGNob3JkIGF0IGBXb3JrYmVuY2hDb250cmliYCkuXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIsXG5cdFx0XHRcdHdpbjogeyBwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5MZWZ0QXJyb3csIHNlY29uZGFyeTogW0tleUNvZGUuQnJvd3NlckJhY2ssIEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWJdIH0sXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuTWludXMsIHNlY29uZGFyeTogW0tleUNvZGUuQnJvd3NlckJhY2ssIEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWJdIH0sXG5cdFx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuTWludXMsIHNlY29uZGFyeTogW0tleUNvZGUuQnJvd3NlckJhY2ssIEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWJdIH0sXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgRWRpdG9yQXJlYUZvY3VzQ29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVzLlRpdGxlQmFyQ2VudGVyTGVmdCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKCksIFNlc3Npb25zV2VsY29tZVZpc2libGVDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVzLkdvTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcxX2hpc3RvcnlfbmF2Jyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpLm9wZW5QcmV2aW91c1Nlc3Npb24oKTtcblx0fVxufSk7XG5cbi8vIC0tIEdvIEZvcndhcmQgLS1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdvRm9yd2FyZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zLmdvRm9yd2FyZCcsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ3Nlc3Npb25zR29Gb3J3YXJkJywgXCJHbyBGb3J3YXJkXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pU2Vzc2lvbnNGb3J3YXJkJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRm9yd2FyZFwiKVxuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd1JpZ2h0LFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3Nlc3Npb25zR29Gb3J3YXJkVG9vbHRpcCcsIFwiR28gRm9yd2FyZCBPbmUgU2Vzc2lvblwiKSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRwcmVjb25kaXRpb246IENhbkdvRm9yd2FyZENvbnRleHQsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdC8vIEhpZ2hlciB0aGFuIGBXb3JrYmVuY2hDb250cmliYCBzbyB0aGUgYEN0cmwrVGFiYCBzZWNvbmRhcnkgd2lucyBvdmVyIHRoZVxuXHRcdFx0XHQvLyBlZGl0b3IgcXVpY2stb3BlbiBhY3Rpb25zICh3aGljaCBiaW5kIHRoZSBzYW1lIGNob3JkIGF0IGBXb3JrYmVuY2hDb250cmliYCkuXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIsXG5cdFx0XHRcdHdpbjogeyBwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5SaWdodEFycm93LCBzZWNvbmRhcnk6IFtLZXlDb2RlLkJyb3dzZXJGb3J3YXJkLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVGFiXSB9LFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLk1pbnVzLCBzZWNvbmRhcnk6IFtLZXlDb2RlLkJyb3dzZXJGb3J3YXJkLCBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuVGFiXSB9LFxuXHRcdFx0XHRsaW51eDogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuTWludXMsIHNlY29uZGFyeTogW0tleUNvZGUuQnJvd3NlckZvcndhcmQsIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5UYWJdIH0sXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgRWRpdG9yQXJlYUZvY3VzQ29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVzLlRpdGxlQmFyQ2VudGVyTGVmdCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKCksIFNlc3Npb25zV2VsY29tZVZpc2libGVDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVzLkdvTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcxX2hpc3RvcnlfbmF2Jyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpLm9wZW5OZXh0U2Vzc2lvbigpO1xuXHR9XG59KTtcblxuLy8gLS0gRm9jdXMgQWN0aXZlIFNlc3Npb24gLS1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzQWN0aXZlU2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zLmZvY3VzQWN0aXZlU2Vzc2lvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmb2N1c0FjdGl2ZVNlc3Npb24nLCBcIkZvY3VzIEFjdGl2ZSBTZXNzaW9uXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHQvLyBNdXN0IG91dHJhbmsgdGhlIHdvcmtiZW5jaCBgd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5gIGJpbmRpbmdcblx0XHRcdFx0Ly8gKFdvcmtiZW5jaENvbnRyaWIpIHNvIHRoYXQgaW4gdGhlIHNlc3Npb25zIHdpbmRvdyB0aGUgY2hvcmRcblx0XHRcdFx0Ly8gZm9jdXNlcyB0aGUgYWN0aXZlIHNlc3Npb24uIFVzaW5nIHRoZSBub3JtYWwgb3BlbiBjaGF0IGFjdGlvbiB3aWxsIG5vdCB3b3JrIGZvciBuZXcgc2Vzc2lvbiB2aWV3cy5cblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlJLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5SSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25zUGFydFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRzZXNzaW9uc1BhcnRTZXJ2aWNlLmZvY3VzU2Vzc2lvbihzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKSk7XG5cdH1cbn0pO1xuXG5mdW5jdGlvbiB3aXRoQWN0aXZlU2Vzc2lvblZpZXcoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFjdGlvbjogKHZpZXc6IE5vbk51bGxhYmxlPFJldHVyblR5cGU8SVNlc3Npb25zUGFydFNlcnZpY2VbJ2dldFNlc3Npb25WaWV3J10+PikgPT4gdm9pZCk6IHZvaWQge1xuXHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdGNvbnN0IHZpZXcgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpLmdldFNlc3Npb25WaWV3KHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQpO1xuXHRpZiAodmlldykge1xuXHRcdGFjdGlvbih2aWV3KTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNQcmV2aW91c0NoYXRHcm91cEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRk9DVVNfUFJFVklPVVNfQ0hBVF9HUk9VUF9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9jdXNQcmV2aW91c0NoYXRHcm91cCcsIFwiRm9jdXMgUHJldmlvdXMgQ2hhdCBHcm91cFwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5MZWZ0QXJyb3cpLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIEVkaXRvckFyZWFGb2N1c0NvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdHdpdGhBY3RpdmVTZXNzaW9uVmlldyhhY2Nlc3NvciwgdmlldyA9PiB2aWV3LmZvY3VzQWRqYWNlbnRDaGF0R3JvdXAoJ3ByZXZpb3VzJykpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzTmV4dENoYXRHcm91cEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRk9DVVNfTkVYVF9DSEFUX0dST1VQX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmb2N1c05leHRDaGF0R3JvdXAnLCBcIkZvY3VzIE5leHQgQ2hhdCBHcm91cFwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5SaWdodEFycm93KSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBFZGl0b3JBcmVhRm9jdXNDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHR3aXRoQWN0aXZlU2Vzc2lvblZpZXcoYWNjZXNzb3IsIHZpZXcgPT4gdmlldy5mb2N1c0FkamFjZW50Q2hhdEdyb3VwKCduZXh0JykpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFNwbGl0Q2hhdEdyb3VwUmlnaHRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNQTElUX0NIQVRfR1JPVVBfUklHSFRfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NwbGl0Q2hhdEdyb3VwUmlnaHQnLCBcIlNwbGl0IENoYXQgR3JvdXAgUmlnaHRcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHR3aXRoQWN0aXZlU2Vzc2lvblZpZXcoYWNjZXNzb3IsIHZpZXcgPT4gdmlldy5zcGxpdEFjdGl2ZUNoYXQoJ3JpZ2h0JykpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFNwbGl0Q2hhdEdyb3VwRG93bkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU1BMSVRfQ0hBVF9HUk9VUF9ET1dOX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzcGxpdENoYXRHcm91cERvd24nLCBcIlNwbGl0IENoYXQgR3JvdXAgRG93blwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdHdpdGhBY3RpdmVTZXNzaW9uVmlldyhhY2Nlc3NvciwgdmlldyA9PiB2aWV3LnNwbGl0QWN0aXZlQ2hhdCgnYm90dG9tJykpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE1vdmVDaGF0VG9QcmV2aW91c0dyb3VwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNT1ZFX0NIQVRfVE9fUFJFVklPVVNfR1JPVVBfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVDaGF0VG9QcmV2aW91c0dyb3VwJywgXCJNb3ZlIENoYXQgdG8gUHJldmlvdXMgR3JvdXBcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHR3aXRoQWN0aXZlU2Vzc2lvblZpZXcoYWNjZXNzb3IsIHZpZXcgPT4gdmlldy5tb3ZlQWN0aXZlQ2hhdFRvQWRqYWNlbnRHcm91cCgncHJldmlvdXMnKSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTW92ZUNoYXRUb05leHRHcm91cEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTU9WRV9DSEFUX1RPX05FWFRfR1JPVVBfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVDaGF0VG9OZXh0R3JvdXAnLCBcIk1vdmUgQ2hhdCB0byBOZXh0IEdyb3VwXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0d2l0aEFjdGl2ZVNlc3Npb25WaWV3KGFjY2Vzc29yLCB2aWV3ID0+IHZpZXcubW92ZUFjdGl2ZUNoYXRUb0FkamFjZW50R3JvdXAoJ25leHQnKSk7XG5cdH1cbn0pO1xuXG4vLyAtLSBGb2N1cyBOdGggU2Vzc2lvbiBpbiB0aGUgR3JpZCAoQ21kL0N0cmwrMS4uOSkgLS1cbi8vIE1pcnJvcnMgVlMgQ29kZSdzIFwiRm9jdXMgRWRpdG9yIEdyb3VwIE5cIjogQ3RybC9DbWQrMS4uOCBmb2N1cyB0aGF0IGdyaWQgc2xvdFxuLy8gYW5kIEN0cmwvQ21kKzkgZm9jdXNlcyB0aGUgTEFTVCBzbG90LiBEb2VzIG5vdGhpbmcgd2hlbiB0aGUgc2xvdCBkb2Vzbid0IGV4aXN0LlxuXG5mb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgOTsgaW5kZXgrKykge1xuXHRjb25zdCBwb3NpdGlvbiA9IGluZGV4ICsgMTtcblx0Y29uc3QgaXNMYXN0ID0gcG9zaXRpb24gPT09IDk7XG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c1Nlc3Npb25CeVBvc2l0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBgc2Vzc2lvbnMuZm9jdXNTZXNzaW9uSW5HcmlkJHtwb3NpdGlvbn1gLFxuXHRcdFx0XHR0aXRsZTogaXNMYXN0XG5cdFx0XHRcdFx0PyBsb2NhbGl6ZTIoJ2ZvY3VzTGFzdFNlc3Npb25JbkdyaWQnLCBcIkZvY3VzIExhc3QgU2Vzc2lvbiBpbiBHcmlkXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZTIoJ2ZvY3VzU2Vzc2lvbkluR3JpZCcsIFwiRm9jdXMgU2Vzc2lvbiB7MH0gaW4gR3JpZFwiLCBwb3NpdGlvbiksXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYixcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IChLZXlDb2RlLkRpZ2l0MSArIGluZGV4KSxcblx0XHRcdFx0XHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnNQYXJ0U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQYXJ0U2VydmljZSk7XG5cblx0XHRcdGNvbnN0IHZpc2libGUgPSBzZXNzaW9uc1NlcnZpY2UudmlzaWJsZVNlc3Npb25zLmdldCgpO1xuXHRcdFx0Y29uc3QgdGFyZ2V0SW5kZXggPSBpc0xhc3QgPyB2aXNpYmxlLmxlbmd0aCAtIDEgOiBpbmRleDtcblx0XHRcdGlmICh0YXJnZXRJbmRleCA8IDAgfHwgdGFyZ2V0SW5kZXggPj0gdmlzaWJsZS5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdmlzaWJsZVt0YXJnZXRJbmRleF07XG5cdFx0XHRzZXNzaW9uc1NlcnZpY2Uuc2V0QWN0aXZlKHNlc3Npb24pO1xuXHRcdFx0c2Vzc2lvbnNQYXJ0U2VydmljZS5mb2N1c1Nlc3Npb24oc2Vzc2lvbik7XG5cdFx0fVxuXHR9KTtcbn1cblxuLy8gLS0gQ2xvc2UgQWxsIFNlc3Npb25zIC0tXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDbG9zZUFsbFNlc3Npb25zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnMuY2xvc2VBbGxTZXNzaW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbG9zZUFsbFNlc3Npb25zJywgXCJDbG9zZSBBbGwgU2Vzc2lvbnNcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRwcmVjb25kaXRpb246IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVcpLFxuXHRcdFx0XHQvLyBPbmx5IGZpcmUgZnJvbSB0aGUga2V5Ym9hcmQgd2hpbGUgYSBzZXNzaW9uIChpdHMgY2hhdCB2aWV3KSBoYXMgZm9jdXMuXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgU2Vzc2lvbnNGb2N1c0NvbnRleHQpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKS5jbG9zZUFsbFNlc3Npb25zKCk7XG5cdH1cbn0pO1xuXG4vLyAtLSBDaGF0IHRhYiBuYXZpZ2F0aW9uLCBuZXcgY2hhdCwgJiBjbG9zZSAod2l0aGluIHRoZSBhY3RpdmUgc2Vzc2lvbidzIHRhYiBzdHJpcCkgLS1cblxuLy8gVGhlc2UgY2hvcmRzIHNpdCBqdXN0IGFib3ZlIHRoZSBzZXNzaW9uLWxldmVsIG5hdmlnYXRpb24vY2xvc2UgY29tbWFuZHMgc29cbi8vIHRoZXkgd2luIHdoaWxlIGEgbXVsdGktY2hhdCBzZXNzaW9uIGlzIGZvY3VzZWQsIGZhbGxpbmcgYmFjayB0byB0aGVcbi8vIHNlc3Npb24tbGV2ZWwgY29tbWFuZHMgd2hlbiB0aGUgdGFiIHN0cmlwIGlzIG5vdCBzaG93bi5cbmNvbnN0IENIQVRfVEFCX0tFWUJJTkRJTkdfV0VJR0hUID0gS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIgKyAxMDtcblxuLy8gXCJOZXcgQ2hhdFwiIHN0YXJ0cyBhIG5ldyBjaGF0LiBIaWRkZW4gb25jZSB0aGUgc2Vzc2lvbiBoYXMgbW9yZSB0aGFuIG9uZSBvcGVuXG4vLyBjaGF0LCBzaW5jZSB0aGUgY2hhdCB0YWIgc3RyaXAgdGhlbiBvZmZlcnMgTmV3IENoYXQgYXQgdGhlIGVuZCBvZiB0aGUgdGFicy5cbmNvbnN0IEFERF9DSEFUX1RPX1NFU1NJT05fQUNUSU9OX0lEID0gJ3Nlc3Npb25zLmNoYXRDb21wb3NpdGVCYXIuYWRkQ2hhdCc7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBBZGRDaGF0VG9TZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBRERfQ0hBVF9UT19TRVNTSU9OX0FDVElPTl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXRDb21wb3NpdGVCYXIuYWRkQ2hhdCcsIFwiTmV3IENoYXRcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmFkZCxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBDSEFUX1RBQl9LRVlCSU5ESU5HX1dFSUdIVCxcblx0XHRcdFx0Ly8gTGlrZSBDbWQvQ3RybCtUIGluIGEgYnJvd3NlciBcdTIwMTQgb3BlbnMgYSBuZXcgY2hhdCB0YWIgd2l0aGluIHRoZVxuXHRcdFx0XHQvLyBhY3RpdmUgc2Vzc2lvbi4gU2NvcGVkIHNvIGl0IGRvZXMgbm90IHN0ZWFsIHRoZSBzaG9ydGN1dCBvdXRzaWRlXG5cdFx0XHRcdC8vIHRoZSBhZ2VudHMgd2luZG93IG9yIHdoZW4gdGhlIHNlc3Npb24gZG9lcyBub3Qgc3VwcG9ydCBtdWx0aXBsZSBjaGF0cy5cblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBFZGl0b3JBcmVhRm9jdXNDb250ZXh0LnRvTmVnYXRlZCgpLCBTZXNzaW9uSXNDcmVhdGVkQ29udGV4dCwgU2Vzc2lvblN1cHBvcnRzTXVsdGlwbGVDaGF0c0NvbnRleHQsIFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlULFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25CYXJUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFNlc3Npb25Jc0NyZWF0ZWRDb250ZXh0LCBTZXNzaW9uU3VwcG9ydHNNdWx0aXBsZUNoYXRzQ29udGV4dCwgU2Vzc2lvbklzQXJjaGl2ZWRDb250ZXh0Lm5lZ2F0ZSgpLCBTZXNzaW9uU2hvdWxkU2hvd0NoYXRUYWJzQ29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZXNzaW9uPzogSUFjdGl2ZVNlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNQYXJ0U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQYXJ0U2VydmljZSk7XG5cdFx0Ly8gRnJvbSB0aGUgbWVudTogc2Vzc2lvbiBpcyBmb3J3YXJkZWQgYXMgY29udGV4dC4gRnJvbSB0aGUga2V5YmluZGluZzpcblx0XHQvLyBmYWxsIGJhY2sgdG8gdGhlIGFjdGl2ZSBzZXNzaW9uLlxuXHRcdGNvbnN0IHRhcmdldCA9IHNlc3Npb24gPz8gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgc2Vzc2lvbnNTZXJ2aWNlLm9wZW5OZXdDaGF0SW5TZXNzaW9uKHRhcmdldCk7XG5cdFx0c2Vzc2lvbnNQYXJ0U2VydmljZS5mb2N1c1Nlc3Npb24odGFyZ2V0KTtcblx0fVxufSk7XG5cbmZ1bmN0aW9uIG5hdmlnYXRlQ2hhdFRhYihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZGlyZWN0aW9uOiAnbmV4dCcgfCAncHJldmlvdXMnKTogdm9pZCB7XG5cdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0Y29uc3Qgc2Vzc2lvbnNQYXJ0U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQYXJ0U2VydmljZSk7XG5cdGNvbnN0IGV4dFVyaSA9IGFjY2Vzc29yLmdldChJVXJpSWRlbnRpdHlTZXJ2aWNlKS5leHRVcmk7XG5cdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IHRhYnMgPSBzZXNzaW9uLnZpc2libGVDaGF0VGFicy5nZXQoKTtcblx0aWYgKHRhYnMubGVuZ3RoIDwgMikge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBhY3RpdmVDaGF0ID0gc2Vzc2lvbi5hY3RpdmVDaGF0LmdldCgpO1xuXHRjb25zdCBjdXJyZW50SW5kZXggPSBhY3RpdmVDaGF0ID8gdGFicy5maW5kSW5kZXgoY2hhdCA9PiBleHRVcmkuaXNFcXVhbChjaGF0LnJlc291cmNlLCBhY3RpdmVDaGF0LnJlc291cmNlKSkgOiAtMTtcblx0Y29uc3QgZnJvbSA9IGN1cnJlbnRJbmRleCA9PT0gLTEgPyAwIDogY3VycmVudEluZGV4O1xuXHRjb25zdCBkZWx0YSA9IGRpcmVjdGlvbiA9PT0gJ25leHQnID8gMSA6IC0xO1xuXHRjb25zdCB0YXJnZXQgPSB0YWJzWyhmcm9tICsgZGVsdGEgKyB0YWJzLmxlbmd0aCkgJSB0YWJzLmxlbmd0aF07XG5cdHNlc3Npb25zU2VydmljZS5vcGVuQ2hhdChzZXNzaW9uLCB0YXJnZXQucmVzb3VyY2UpO1xuXHRzZXNzaW9uc1BhcnRTZXJ2aWNlLmZvY3VzU2Vzc2lvbihzZXNzaW9uKTtcbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5hdmlnYXRlTmV4dENoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9ucy5jaGF0Q29tcG9zaXRlQmFyLm5hdmlnYXRlTmV4dENoYXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmF2aWdhdGVOZXh0Q2hhdCcsIFwiR28gdG8gTmV4dCBDaGF0XCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBTZXNzaW9uSGFzTXVsdGlwbGVPcGVuQ2hhdHNDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IENIQVRfVEFCX0tFWUJJTkRJTkdfV0VJR0hULFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIEVkaXRvckFyZWFGb2N1c0NvbnRleHQudG9OZWdhdGVkKCksIFNlc3Npb25IYXNNdWx0aXBsZU9wZW5DaGF0c0NvbnRleHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQnJhY2tldFJpZ2h0LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRuYXZpZ2F0ZUNoYXRUYWIoYWNjZXNzb3IsICduZXh0Jyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTmF2aWdhdGVQcmV2aW91c0NoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9ucy5jaGF0Q29tcG9zaXRlQmFyLm5hdmlnYXRlUHJldmlvdXNDaGF0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25hdmlnYXRlUHJldmlvdXNDaGF0JywgXCJHbyB0byBQcmV2aW91cyBDaGF0XCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBTZXNzaW9uSGFzTXVsdGlwbGVPcGVuQ2hhdHNDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IENIQVRfVEFCX0tFWUJJTkRJTkdfV0VJR0hULFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIEVkaXRvckFyZWFGb2N1c0NvbnRleHQudG9OZWdhdGVkKCksIFNlc3Npb25IYXNNdWx0aXBsZU9wZW5DaGF0c0NvbnRleHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQnJhY2tldExlZnQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdG5hdmlnYXRlQ2hhdFRhYihhY2Nlc3NvciwgJ3ByZXZpb3VzJyk7XG5cdH1cbn0pO1xuXG4vLyBUaGUgY2xvc2UtY2hhdCBhY3Rpb24gaXMgYm90aCBhIGtleWJpbmRpbmcgKEN0cmwvQ21kK1cgY2xvc2VzIHRoZSBhY3RpdmUgY2hhdClcbi8vIGFuZCBhIHBlci10YWIgdG9vbGJhciBhY3Rpb24gY29udHJpYnV0ZWQgdG8ge0BsaW5rIE1lbnVzLlNlc3Npb25DaGF0VGFifTogdGhlXG4vLyBjaGF0IHRhYiBzdHJpcCByZW5kZXJzIHRoaXMgbWVudSBhbmQgZm9yd2FyZHMgdGhlIHRhYidzIHtAbGluayBJQ2hhdFRhYkNvbnRleHR9XG4vLyBhcyB0aGUgYWN0aW9uIGFyZ3VtZW50IHNvIHRoZSBidXR0b24gY2xvc2VzIHRoYXQgc3BlY2lmaWMgdGFiLlxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFRhYkNvbnRleHQge1xuXHRyZWFkb25seSBzZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbjtcblx0cmVhZG9ubHkgY2hhdDogSUNoYXQ7XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDbG9zZUNoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENMT1NFX0NIQVRfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Nsb3NlQWN0aXZlQ2hhdCcsIFwiQ2xvc2UgQ2hhdFwiKSxcblx0XHRcdGljb246IENvZGljb24uY2xvc2UsXG5cdFx0XHQvLyBIaWRkZW4gZnJvbSB0aGUgcGFsZXR0ZTogY2xvc2luZyBhIHNwZWNpZmljIGNoYXQgaXMgY29udGV4dHVhbCAodGhlXG5cdFx0XHQvLyBrZXliaW5kaW5nIHRhcmdldHMgdGhlIGFjdGl2ZSBjaGF0OyB0aGUgbWVudSB0YXJnZXRzIGEgdGFiKS5cblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogQ0hBVF9UQUJfS0VZQklORElOR19XRUlHSFQsXG5cdFx0XHRcdC8vIEludGVyY2VwdCBDdHJsL0NtZCtXICh3aGljaCBvdGhlcndpc2UgY2xvc2VzIHRoZSBzZXNzaW9uKSBvbmx5XG5cdFx0XHRcdC8vIHdoaWxlIHRoZSBhY3RpdmUgY2hhdCBpcyBhIGNsb3NlYWJsZSBub24tbWFpbiBjaGF0LCBzbyBpdCBjbG9zZXNcblx0XHRcdFx0Ly8gdGhlIGNoYXQgdGFiIGluc3RlYWQgXHUyMDE0IGxpa2UgY2xvc2luZyBhIHRhYiB2cyB0aGUgd2luZG93LlxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIEVkaXRvckFyZWFGb2N1c0NvbnRleHQudG9OZWdhdGVkKCksIFNlc3Npb25BY3RpdmVDaGF0SXNDbG9zYWJsZUNvbnRleHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Vyxcblx0XHRcdFx0d2luOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5GNCwgc2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVddIH0sXG5cdFx0XHR9LFxuXHRcdFx0Ly8gUmVuZGVyZWQgYXMgdGhlIHRhYidzIGNsb3NlIGJ1dHRvbiBieSB0aGUgY2hhdCB0YWIgc3RyaXA7IHRoZSBtYWluXG5cdFx0XHQvLyBjaGF0J3MgdGFiIGRvZXMgbm90IHJlbmRlciB0aGlzIG1lbnUsIHNvIG5vIHBlci10YWIgZ2F0aW5nIGlzIG5lZWRlZC5cblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25DaGF0VGFiLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTAsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElDaGF0VGFiQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBleHRVcmkgPSBhY2Nlc3Nvci5nZXQoSVVyaUlkZW50aXR5U2VydmljZSkuZXh0VXJpO1xuXHRcdC8vIEZyb20gdGhlIHRhYiBtZW51OiBhY3Qgb24gdGhlIGZvcndhcmRlZCB0YWIncyBjaGF0LiBGcm9tIHRoZSBrZXliaW5kaW5nOlxuXHRcdC8vIGFjdCBvbiB0aGUgYWN0aXZlIGNoYXQgb2YgdGhlIGFjdGl2ZSBzZXNzaW9uLlxuXHRcdGNvbnN0IHNlc3Npb24gPSBjb250ZXh0Py5zZXNzaW9uID8/IHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjaGF0ID0gY29udGV4dD8uY2hhdCA/PyBzZXNzaW9uLmFjdGl2ZUNoYXQuZ2V0KCk7XG5cdFx0aWYgKCFjaGF0IHx8IGV4dFVyaS5pc0VxdWFsKGNoYXQucmVzb3VyY2UsIHNlc3Npb24ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEFuIHVudGl0bGVkIChpbi1jb21wb3NlcikgZHJhZnQgaGFzIG5vdGhpbmcgdG8gcmVvcGVuLCBzbyBkZWxldGUgaXRcblx0XHQvLyBvdXRyaWdodDsgYSBjb21taXR0ZWQgY2hhdCBpcyBoaWRkZW4gKHJlb3BlbmFibGUpLlxuXHRcdGlmIChjaGF0LnN0YXR1cy5nZXQoKSA9PT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCkge1xuXHRcdFx0YXdhaXQgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5kZWxldGVDaGF0KHNlc3Npb24sIGNoYXQucmVzb3VyY2UsIHsgc2tpcENvbmZpcm1hdGlvbjogdHJ1ZSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgc2Vzc2lvbnNTZXJ2aWNlLmNsb3NlQ2hhdChzZXNzaW9uLCBjaGF0KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2xvc2VBbGxDaGF0c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zLmNoYXRDb21wb3NpdGVCYXIuY2xvc2VBbGxDaGF0cycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbG9zZUFsbENoYXRzJywgXCJDbG9zZSBBbGwgQ2hhdHNcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHQvLyBFbmFibGVkIChwYWxldHRlICsga2V5YmluZGluZykgb25seSB3aGlsZSB0aGUgYWN0aXZlIHNlc3Npb24gaGFzIG1vcmVcblx0XHRcdC8vIHRoYW4gb25lIG9wZW4gY2hhdCwgc28gdGhlIGNob3JkIHRhcmdldHMgdGhlIGZvY3VzZWQgc2Vzc2lvbiBhbmRcblx0XHRcdC8vIHN0YXlzIGluZXJ0IGZvciBzaW5nbGUtY2hhdCBzZXNzaW9ucy5cblx0XHRcdHByZWNvbmRpdGlvbjogU2Vzc2lvbkhhc011bHRpcGxlT3BlbkNoYXRzQ29udGV4dCxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBDSEFUX1RBQl9LRVlCSU5ESU5HX1dFSUdIVCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0XHRcdC8vIFdoaWxlIGEgbW9kYWwgZWRpdG9yIGhhcyBmb2N1cywgbGV0IFZTIENvZGUncyBvd25cblx0XHRcdFx0XHQvLyBjbG9zZUVkaXRvcnNJbkdyb3VwIChzYW1lIGNob3JkKSBhY3Qgb24gdGhlIGVkaXRvciBncm91cC5cblx0XHRcdFx0XHRFZGl0b3JBcmVhRm9jdXNDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdFNlc3Npb25IYXNNdWx0aXBsZU9wZW5DaGF0c0NvbnRleHRcblx0XHRcdFx0KSxcblx0XHRcdFx0Ly8gTWlycm9yIFZTIENvZGUncyBcIkNsb3NlIEFsbCBFZGl0b3JzIGluIEdyb3VwXCIgY2hvcmQgKEN0cmwvQ21kK0sgVyk6XG5cdFx0XHRcdC8vIGEgc2Vzc2lvbiBpcyB0aGUgQWdlbnRzLXdpbmRvdyBhbmFsb2d1ZSBvZiBhbiBlZGl0b3IgZ3JvdXAuIE5vdGVcblx0XHRcdFx0Ly8gXCJDbG9zZSBBbGwgU2Vzc2lvbnNcIiBhbHJlYWR5IG93bnMgQ3RybC9DbWQrSyBDdHJsL0NtZCtXLlxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5Q29kZS5LZXlXKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0Y29uc3QgZXh0VXJpID0gYWNjZXNzb3IuZ2V0KElVcmlJZGVudGl0eVNlcnZpY2UpLmV4dFVyaTtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFpblJlc291cmNlID0gc2Vzc2lvbi5tYWluQ2hhdC5nZXQoKS5yZXNvdXJjZTtcblx0XHRjb25zdCBjaGF0c1RvQ2xvc2UgPSBzZXNzaW9uLm9wZW5DaGF0cy5nZXQoKS5maWx0ZXIoY2hhdCA9PiAhZXh0VXJpLmlzRXF1YWwoY2hhdC5yZXNvdXJjZSwgbWFpblJlc291cmNlKSk7XG5cdFx0Zm9yIChjb25zdCBjaGF0IG9mIGNoYXRzVG9DbG9zZSkge1xuXHRcdFx0aWYgKGNoYXQuc3RhdHVzLmdldCgpID09PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKSB7XG5cdFx0XHRcdGF3YWl0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZGVsZXRlQ2hhdChzZXNzaW9uLCBjaGF0LnJlc291cmNlLCB7IHNraXBDb25maXJtYXRpb246IHRydWUgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBDbG9zaW5nIHRoZSB3aG9sZSBiYXRjaCBpcyBvbmUgZ2VzdHVyZSwgc28gaXQgaXMgbm90IG9mZmVyZWQgdG9cblx0XHRcdFx0Ly8gUmVvcGVuIENsb3NlZCBDaGF0IG9yIFNlc3Npb24gXHUyMDE0IHRoYXQgd291bGQgcmVvcGVuIG9ubHkgdGhlIGxhc3Rcblx0XHRcdFx0Ly8gY2hhdCBvZiB0aGUgYmF0Y2guXG5cdFx0XHRcdGF3YWl0IHNlc3Npb25zU2VydmljZS5jbG9zZUNoYXQoc2Vzc2lvbiwgY2hhdCwgeyBza2lwSGlzdG9yeTogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRGVsZXRlQ2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zLmNoYXRDb21wb3NpdGVCYXIuZGVsZXRlQ2hhdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkZWxldGVBY3RpdmVDaGF0JywgXCJEZWxldGUgQ2hhdFwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBDSEFUX1RBQl9LRVlCSU5ESU5HX1dFSUdIVCxcblx0XHRcdFx0Ly8gRGVsZXRlIC8gQ21kK0JhY2tzcGFjZSAoTWFjKSBcdTIwMTQgbWlycm9ycyB0aGUgZmlsZS1kZWxldGUga2V5YmluZGluZ1xuXHRcdFx0XHQvLyBpbiB0aGUgRXhwbG9yZXIuIFNjb3BlZCBzbyBpdCBuZXZlciBmaXJlcyB3aGlsZSB0eXBpbmcgaW4gYW4gaW5wdXRcblx0XHRcdFx0Ly8gKGNoYXQgY29tcG9zZXIsIHJlbmFtZSBmaWVsZCwgZXRjLikgb3Igb24gdGhlIHNlc3Npb24ncyBtYWluIGNoYXQuXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgRWRpdG9yQXJlYUZvY3VzQ29udGV4dC50b05lZ2F0ZWQoKSwgSW5wdXRGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKSwgU2Vzc2lvbkFjdGl2ZUNoYXRJc0RlbGV0YWJsZUNvbnRleHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkRlbGV0ZSxcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzcGFjZSxcblx0XHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlDb2RlLkRlbGV0ZV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2hhdCA9IHNlc3Npb24uYWN0aXZlQ2hhdC5nZXQoKTtcblx0XHQvLyBUaGUgbWFpbiBjaGF0IGFuZCB3b3JrZXIgKHN1YmFnZW50KSBjaGF0cyByZXBvcnQgYGNhbkRlbGV0ZTogZmFsc2VgLlxuXHRcdGlmICghY2hhdCB8fCAhZ2V0Q2hhdENhcGFiaWxpdGllcyhjaGF0LCBzZXNzaW9uLCB1bmRlZmluZWQpLmNhbkRlbGV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmRlbGV0ZUNoYXQoc2Vzc2lvbiwgY2hhdC5yZXNvdXJjZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVvcGVuTGFzdENsb3NlZENoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9ucy5jaGF0Q29tcG9zaXRlQmFyLnJlb3Blbkxhc3RDbG9zZWRDaGF0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXRDb21wb3NpdGVCYXIucmVvcGVuTGFzdENsb3NlZENoYXQnLCBcIlJlb3BlbiBMYXN0IENsb3NlZCBDaGF0XCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBTZXNzaW9uU3VwcG9ydHNNdWx0aXBsZUNoYXRzQ29udGV4dCxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uc1BhcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1BhcnRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxhc3RDbG9zZWQgPSBzZXNzaW9uLmxhc3RDbG9zZWRDaGF0O1xuXHRcdGlmICghbGFzdENsb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBzZXNzaW9uc1NlcnZpY2Uub3BlbkNoYXQoc2Vzc2lvbiwgbGFzdENsb3NlZC5yZXNvdXJjZSk7XG5cdFx0c2Vzc2lvbnNQYXJ0U2VydmljZS5mb2N1c1Nlc3Npb24oc2Vzc2lvbik7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVvcGVuTGFzdENsb3NlZEl0ZW1BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9ucy5yZW9wZW5MYXN0Q2xvc2VkSXRlbScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZW9wZW5MYXN0Q2xvc2VkSXRlbScsIFwiUmVvcGVuIENsb3NlZCBDaGF0IG9yIFNlc3Npb25cIiksXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IENIQVRfVEFCX0tFWUJJTkRJTkdfV0VJR0hULFxuXHRcdFx0XHQvLyBMaWtlIEN0cmwvQ21kK1NoaWZ0K1QgaW4gYSBicm93c2VyLiBPdXRzaWRlIHRoZSBlZGl0b3Igc2NvcGUgdGhlXG5cdFx0XHRcdC8vIGNob3JkIGFsd2F5cyBiZWxvbmdzIHRvIHRoZSBzZXNzaW9ucyBhcmVhIChpdCBpcyBhIG5vLW9wIHdoZW5cblx0XHRcdFx0Ly8gbm90aGluZyB3YXMgY2xvc2VkKTsgaW5zaWRlIGl0LCBWUyBDb2RlJ3Mgb3duIFJlb3BlbiBDbG9zZWRcblx0XHRcdFx0Ly8gRWRpdG9yIHRha2VzIG92ZXIuXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgU2Vzc2lvbnNFZGl0b3JTY29wZUNvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5VCxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgU2Vzc2lvbnNIYXNDbG9zZWRJdGVtQ29udGV4dCksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpLnJlb3Blbkxhc3RDbG9zZWRJdGVtKCk7XG5cdH1cbn0pO1xuXG4vLyBBIG5vLWlucHV0IHF1aWNrIHBpY2sgKHB1cmUgc3dpdGNoZXIpIG92ZXIgdGhlIGFjdGl2ZSBzZXNzaW9uJ3Mgb3BlbiBjaGF0cyxcbi8vIGVhY2ggc2hvd24gd2l0aCBhIGNoYXQgaWNvbi4gRHJpdmVuIGJ5IEN0cmwrVGFiIC8gQ3RybCtTaGlmdCtUYWIgaW5cbi8vIGVkaXRvci1zd2l0Y2hlciAoTVJVKSBzdHlsZTogb3BlbnMgd2l0aCBxdWljayBuYXZpZ2F0ZSBhY3RpdmUsIHNvIGhvbGRpbmcgdGhlXG4vLyBtb2RpZmllciBhbmQgcHJlc3NpbmcgVGFiIGN5Y2xlcyBhbmQgcmVsZWFzaW5nIGFjY2VwdHMgdGhlIGZvY3VzZWQgY2hhdC4gVGhlc2Vcbi8vIGFyZSBnYXRlZCB0byBzZXNzaW9ucyB3aXRoIG1vcmUgdGhhbiBvbmUgb3BlbiBjaGF0IGF0IGEgaGlnaGVyIHdlaWdodCB0aGFuIHRoZVxuLy8gc2Vzc2lvbi1oaXN0b3J5IHNlY29uZGFyeSBvbiB0aGUgc2FtZSBjaG9yZCwgc28gdGhleSBmYWxsIGJhY2sgdG8gc2Vzc2lvblxuLy8gbmF2aWdhdGlvbiBvdGhlcndpc2UuIFRoZSBzYW1lIHBpY2tlciBpcyBhbHNvIHJlYWNoYWJsZSBmcm9tIHRoZSBwYWxldHRlIChcIkdvXG4vLyB0byBDaGF0IGluIFNlc3Npb25cIiksIHdoaWNoIGFkZGl0aW9uYWxseSBsaXN0cyBjbG9zZWQgY2hhdHMgYW5kIHNraXBzIGRyYWZ0cy5cblxuZXhwb3J0IGNvbnN0IFNIT1dfQ0hBVFNfUElDS0VSX0NPTU1BTkRfSUQgPSAnc2Vzc2lvbnMuc2hvd0NoYXRzUGlja2VyJztcbmNvbnN0IFFVSUNLX1NXSVRDSF9ORVhUX0NIQVRfSUQgPSAnc2Vzc2lvbnMucXVpY2tTd2l0Y2hOZXh0Q2hhdCc7XG5jb25zdCBRVUlDS19TV0lUQ0hfUFJFVklPVVNfQ0hBVF9JRCA9ICdzZXNzaW9ucy5xdWlja1N3aXRjaFByZXZpb3VzQ2hhdCc7XG5jb25zdCBDSEFUU19QSUNLRVJfUVVJQ0tfTkFWSUdBVEVfTkVYVF9JRCA9ICdzZXNzaW9ucy5jaGF0c1BpY2tlci5xdWlja05hdmlnYXRlTmV4dCc7XG5jb25zdCBDSEFUU19QSUNLRVJfUVVJQ0tfTkFWSUdBVEVfUFJFVklPVVNfSUQgPSAnc2Vzc2lvbnMuY2hhdHNQaWNrZXIucXVpY2tOYXZpZ2F0ZVByZXZpb3VzJztcblxuLy8gVGhlIG9wZW4gY2hvcmRzIGFyZSBnYXRlZCB0byBub3QgZmlyZSB3aGlsZSBhbm90aGVyIHF1aWNrIHBpY2sgaXMgYWxyZWFkeVxuLy8gc2hvd2luZyAoaW5RdWlja1BpY2tDb250ZXh0IG5lZ2F0ZWQpLCBzbyBlLmcuIHRoZSBlZGl0b3IncyBvd24gQ3RybCtUYWIgcGlja2VyXG4vLyBrZWVwcyB0aGUgY2hvcmQgZm9yIGl0cyBvd24gbmF2aWdhdGlvbiBpbnN0ZWFkIG9mIHRoaXMgb3BlbmluZyBvbiB0b3Agb2YgaXQuXG4vLyBUaGUgQ3RybCtUYWIgTVJVIHN3aXRjaGVyIGN5Y2xlcyBvcGVuIGNoYXRzIG9ubHksIHNvIGl0IGlzIGdhdGVkIG9uIG1vcmUgdGhhblxuLy8gb25lIG9wZW4gdGFiLiAoVGhlIHBhbGV0dGUgY29tbWFuZCwgd2hpY2ggYWxzbyBsaXN0cyBjbG9zZWQgY2hhdHMsIGlzIGdhdGVkIG9uXG4vLyBtb3JlIHRoYW4gb25lIGNvbW1pdHRlZCBjaGF0IGluc3RlYWQuKVxuY29uc3QgQ2hhdHNQaWNrZXJTY29wZUNvbnRleHQgPSBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIEVkaXRvckFyZWFGb2N1c0NvbnRleHQudG9OZWdhdGVkKCksIFNlc3Npb25IYXNNdWx0aXBsZU9wZW5DaGF0c0NvbnRleHQsIGluUXVpY2tQaWNrQ29udGV4dC5uZWdhdGUoKSk7XG5cbmZ1bmN0aW9uIG9wZW5DaGF0c1BpY2tlcihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbXJ1PzogeyByZWFkb25seSBiYWNrd2FyZDogYm9vbGVhbiB9KTogdm9pZCB7XG5cdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0Y29uc3Qgc2Vzc2lvbnNQYXJ0U2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQYXJ0U2VydmljZSk7XG5cdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cblx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRpZiAoIXNlc3Npb24pIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3QgZXh0VXJpID0gYWNjZXNzb3IuZ2V0KElVcmlJZGVudGl0eVNlcnZpY2UpLmV4dFVyaTtcblxuXHRpbnRlcmZhY2UgSUNoYXRQaWNrSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0XHRyZWFkb25seSBjaGF0OiBJQ2hhdDtcblx0fVxuXG5cdGNvbnN0IHRvSXRlbSA9IChjaGF0OiBJQ2hhdCk6IElDaGF0UGlja0l0ZW0gPT4gKHtcblx0XHRsYWJlbDogY2hhdC50aXRsZS5nZXQoKT8udHJpbSgpIHx8IGxvY2FsaXplKCd1bnRpdGxlZENoYXQnLCBcIlVudGl0bGVkIENoYXRcIiksXG5cdFx0ZGVzY3JpcHRpb246IGZyb21Ob3coY2hhdC51cGRhdGVkQXQuZ2V0KCksIHRydWUsIHRydWUpLFxuXHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY29tbWVudERpc2N1c3Npb24pLFxuXHRcdGNoYXQsXG5cdH0pO1xuXG5cdC8vIE1SVSBtb2RlIGN5Y2xlcyBldmVyeSBvcGVuIHRhYiAoaW5jbHVkaW5nIGluLWNvbXBvc2VyIGRyYWZ0cykgc28gdGhlIHNldCBvZlxuXHQvLyBzd2l0Y2hhYmxlIGNoYXRzIG1hdGNoZXMgdGhlIFNlc3Npb25IYXNNdWx0aXBsZU9wZW5DaGF0c0NvbnRleHQgZ2F0ZS4gVGhlXG5cdC8vIHNlYXJjaGFibGUgcGFsZXR0ZSBmbG93IGluc3RlYWQgc2tpcHMgdW50aXRsZWQgZHJhZnRzIChubyBtZWFuaW5nZnVsIHRpdGxlLFxuXHQvLyBtaXJyb3JpbmcgdGhlIENoYXRzIGRyb3Bkb3duKSBhbmQgYWRkcyB0aGUgY2xvc2VkIGNoYXRzIGJlbG93LlxuXHRjb25zdCBvcGVuSXRlbXMgPSAobXJ1XG5cdFx0PyBzZXNzaW9uLnZpc2libGVDaGF0VGFicy5nZXQoKVxuXHRcdDogc2Vzc2lvbi52aXNpYmxlQ2hhdFRhYnMuZ2V0KCkuZmlsdGVyKGNoYXQgPT4gY2hhdC5zdGF0dXMuZ2V0KCkgIT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpXG5cdCkubWFwKHRvSXRlbSk7XG5cdC8vIENsb3NlZCBjaGF0cyBhcmUgaGlkZGVuIGZyb20gdGhlIHRhYiBzdHJpcCBidXQgc3RpbGwgcmVvcGVuYWJsZS4gVGhleSBhcmVcblx0Ly8gb25seSBvZmZlcmVkIGluIHRoZSBzZWFyY2hhYmxlIHBhbGV0dGUgZmxvdyBcdTIwMTQgbm90IHRoZSBDdHJsK1RhYiBNUlUgc3dpdGNoZXIsXG5cdC8vIHdoaWNoIG1pcnJvcnMgdGhlIGVkaXRvciBzd2l0Y2hlciBhbmQgY3ljbGVzIG9wZW4gaXRlbXMgb25seS5cblx0Y29uc3QgY2xvc2VkSXRlbXMgPSBtcnUgPyBbXSA6IHNlc3Npb24uY2xvc2VkQ2hhdHMuZ2V0KClcblx0XHQuZmlsdGVyKGNoYXQgPT4gY2hhdC5zdGF0dXMuZ2V0KCkgIT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgJiYgY2hhdC5vcmlnaW4/LmtpbmQgIT09IENoYXRPcmlnaW5LaW5kLlRvb2wpXG5cdFx0Lm1hcCh0b0l0ZW0pO1xuXG5cdC8vIE5hdmlnYXRpb24gb3JkZXI6IG9wZW4gY2hhdHMgZmlyc3QsIHRoZW4gY2xvc2VkIGNoYXRzLlxuXHRjb25zdCBwaWNrSXRlbXMgPSBbLi4ub3Blbkl0ZW1zLCAuLi5jbG9zZWRJdGVtc107XG5cdGlmIChwaWNrSXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgZGlzcGxheUl0ZW1zOiAoSUNoYXRQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBjbG9zZWRJdGVtcy5sZW5ndGggPT09IDBcblx0XHQ/IG9wZW5JdGVtc1xuXHRcdDogW1xuXHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdvcGVuQ2hhdHNHcm91cCcsIFwiT3BlblwiKSB9LFxuXHRcdFx0Li4ub3Blbkl0ZW1zLFxuXHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdjbG9zZWRDaGF0c0dyb3VwJywgXCJDbG9zZWRcIikgfSxcblx0XHRcdC4uLmNsb3NlZEl0ZW1zLFxuXHRcdF07XG5cblx0Y29uc3QgYWN0aXZlQ2hhdCA9IHNlc3Npb24uYWN0aXZlQ2hhdC5nZXQoKTtcblx0Y29uc3QgYWN0aXZlSW5kZXggPSBNYXRoLm1heCgwLCBhY3RpdmVDaGF0ID8gcGlja0l0ZW1zLmZpbmRJbmRleChpdGVtID0+IGV4dFVyaS5pc0VxdWFsKGl0ZW0uY2hhdC5yZXNvdXJjZSwgYWN0aXZlQ2hhdC5yZXNvdXJjZSkpIDogLTEpO1xuXHQvLyBNUlUgc3R5bGUgc3RhcnRzIG9uIHRoZSBhZGphY2VudCBjaGF0IHNvIGEgc2luZ2xlIHRhcCtyZWxlYXNlIHN3aXRjaGVzIHRvXG5cdC8vIGl0OyBwYWxldHRlIGludm9jYXRpb24gKG5vbi1NUlUpIGZvY3VzZXMgdGhlIGFjdGl2ZSBjaGF0LlxuXHRjb25zdCBzdGFydEluZGV4ID0gbXJ1ID8gKGFjdGl2ZUluZGV4ICsgKG1ydS5iYWNrd2FyZCA/IC0xIDogMSkgKyBwaWNrSXRlbXMubGVuZ3RoKSAlIHBpY2tJdGVtcy5sZW5ndGggOiBhY3RpdmVJbmRleDtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgcGlja2VyID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJQ2hhdFBpY2tJdGVtPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRwaWNrZXIuaXRlbXMgPSBkaXNwbGF5SXRlbXM7XG5cdHBpY2tlci5hY3RpdmVJdGVtcyA9IFtwaWNrSXRlbXNbc3RhcnRJbmRleF1dO1xuXHRpZiAobXJ1KSB7XG5cdFx0Ly8gRWRpdG9yLXN3aXRjaGVyIHN0eWxlOiBubyBmaWx0ZXIgaW5wdXQsIGFuZCBxdWljayBuYXZpZ2F0ZSBzdGF5cyBhY3RpdmUgc29cblx0XHQvLyByZWxlYXNpbmcgdGhlIG1vZGlmaWVyIGFjY2VwdHMgdGhlIGZvY3VzZWQgY2hhdC4gVGhlIG1vZGlmaWVyIGlzIHRha2VuXG5cdFx0Ly8gZnJvbSB0aGUgcXVpY2stbmF2aWdhdGUga2V5YmluZGluZydzIGNob3JkLlxuXHRcdHBpY2tlci5oaWRlSW5wdXQgPSB0cnVlO1xuXHRcdHBpY2tlci5xdWlja05hdmlnYXRlID0geyBrZXliaW5kaW5nczoga2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZ3MoQ0hBVFNfUElDS0VSX1FVSUNLX05BVklHQVRFX05FWFRfSUQpIH07XG5cdH0gZWxzZSB7XG5cdFx0Ly8gUGFsZXR0ZSBmbG93OiBhIHNlYXJjaGFibGUgbGlzdCBhY3Jvc3MgdGhlIE9wZW4gYW5kIENsb3NlZCBncm91cHMuXG5cdFx0cGlja2VyLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3NlYXJjaENoYXRzJywgXCJTZWFyY2ggY2hhdHMgYnkgbmFtZVwiKTtcblx0XHRwaWNrZXIubWF0Y2hPbkRlc2NyaXB0aW9uID0gdHJ1ZTtcblx0fVxuXG5cdC8vIEV4cG9zZSBhIGNvbnRleHQga2V5IHdoaWxlIHRoZSBwaWNrZXIgaXMgb3BlbiBzbyB0aGUgbmF2aWdhdGUga2V5YmluZGluZ3Ncblx0Ly8gKGJvdW5kIHRvIHRoZSBzYW1lIGNob3JkcykgYWR2YW5jZSB0aGUgc2VsZWN0aW9uIGluc3RlYWQgb2YgcmUtb3BlbmluZy5cblx0Y29uc3QgcGlja2VyVmlzaWJsZUNvbnRleHQgPSBTZXNzaW9uQ2hhdHNQaWNrZXJWaXNpYmxlQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRwaWNrZXJWaXNpYmxlQ29udGV4dC5zZXQodHJ1ZSk7XG5cdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGlja2VyVmlzaWJsZUNvbnRleHQucmVzZXQoKSkpO1xuXG5cdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdGNvbnN0IFtzZWxlY3RlZF0gPSBwaWNrZXIuc2VsZWN0ZWRJdGVtcztcblx0XHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRcdHNlc3Npb25zU2VydmljZS5vcGVuQ2hhdChzZXNzaW9uLCBzZWxlY3RlZC5jaGF0LnJlc291cmNlKTtcblx0XHRcdHNlc3Npb25zUGFydFNlcnZpY2UuZm9jdXNTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH1cblx0XHRwaWNrZXIuaGlkZSgpO1xuXHR9KSk7XG5cdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRIaWRlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXG5cdHBpY2tlci5zaG93KCk7XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTaG93Q2hhdHNQaWNrZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNIT1dfQ0hBVFNfUElDS0VSX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93Q2hhdHNQaWNrZXInLCBcIkdvIHRvIENoYXQgaW4gU2Vzc2lvblwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdHByZWNvbmRpdGlvbjogU2Vzc2lvbkhhc011bHRpcGxlQ29tbWl0dGVkQ2hhdHNDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIEVkaXRvckFyZWFGb2N1c0NvbnRleHQudG9OZWdhdGVkKCksIGluUXVpY2tQaWNrQ29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlPLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRvcGVuQ2hhdHNQaWNrZXIoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxuLy8gQ3RybCtUYWIgLyBDdHJsK1NoaWZ0K1RhYiBvcGVuIHRoZSBwaWNrZXIgaW4gZWRpdG9yLXN3aXRjaGVyIChNUlUpIG1vZGUuIEhpZGRlblxuLy8gZnJvbSB0aGUgcGFsZXR0ZSAoZjE6IGZhbHNlKSBzaW5jZSB0aGV5IG9ubHkgbWFrZSBzZW5zZSBoZWxkOyB0aGUgY2hvcmQgd2luc1xuLy8gb3ZlciB0aGUgc2Vzc2lvbi1oaXN0b3J5IHNlY29uZGFyeSB2aWEgdGhlIGhpZ2hlciB3ZWlnaHQgd2hpbGUgbXVsdGktY2hhdC5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBRdWlja1N3aXRjaE5leHRDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBRVUlDS19TV0lUQ0hfTkVYVF9DSEFUX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncXVpY2tTd2l0Y2hOZXh0Q2hhdCcsIFwiUXVpY2sgU3dpdGNoIHRvIE5leHQgQ2hhdFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRwcmVjb25kaXRpb246IFNlc3Npb25IYXNNdWx0aXBsZU9wZW5DaGF0c0NvbnRleHQsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIgKyAxLFxuXHRcdFx0XHR3aGVuOiBDaGF0c1BpY2tlclNjb3BlQ29udGV4dCxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlRhYixcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5UYWIgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0b3BlbkNoYXRzUGlja2VyKGFjY2Vzc29yLCB7IGJhY2t3YXJkOiBmYWxzZSB9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBRdWlja1N3aXRjaFByZXZpb3VzQ2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUVVJQ0tfU1dJVENIX1BSRVZJT1VTX0NIQVRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdxdWlja1N3aXRjaFByZXZpb3VzQ2hhdCcsIFwiUXVpY2sgU3dpdGNoIHRvIFByZXZpb3VzIENoYXRcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBTZXNzaW9uSGFzTXVsdGlwbGVPcGVuQ2hhdHNDb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliICsgMSxcblx0XHRcdFx0d2hlbjogQ2hhdHNQaWNrZXJTY29wZUNvbnRleHQsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWIsXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdG9wZW5DaGF0c1BpY2tlcihhY2Nlc3NvciwgeyBiYWNrd2FyZDogdHJ1ZSB9KTtcblx0fVxufSk7XG5cbi8vIFdoaWxlIHRoZSBwaWNrZXIgaXMgb3BlbiwgQ3RybCtUYWIgLyBDdHJsK1NoaWZ0K1RhYiBjeWNsZSBmb3J3YXJkIC8gYmFja3dhcmQuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IENIQVRTX1BJQ0tFUl9RVUlDS19OQVZJR0FURV9ORVhUX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliICsgNTAsXG5cdGhhbmRsZXI6IGdldFF1aWNrTmF2aWdhdGVIYW5kbGVyKENIQVRTX1BJQ0tFUl9RVUlDS19OQVZJR0FURV9ORVhUX0lELCB0cnVlKSxcblx0d2hlbjogU2Vzc2lvbkNoYXRzUGlja2VyVmlzaWJsZUNvbnRleHQsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5UYWIsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuVGFiIH0sXG59KTtcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogQ0hBVFNfUElDS0VSX1FVSUNLX05BVklHQVRFX1BSRVZJT1VTX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuU2Vzc2lvbnNDb250cmliICsgNTAsXG5cdGhhbmRsZXI6IGdldFF1aWNrTmF2aWdhdGVIYW5kbGVyKENIQVRTX1BJQ0tFUl9RVUlDS19OQVZJR0FURV9QUkVWSU9VU19JRCwgZmFsc2UpLFxuXHR3aGVuOiBTZXNzaW9uQ2hhdHNQaWNrZXJWaXNpYmxlQ29udGV4dCxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlRhYixcblx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWIgfSxcbn0pO1xuXG4vKipcbiAqIEJhc2UgY2xhc3MgZm9yIHRoZSBjb21wYWN0IHBpbGwgYnV0dG9uIHJlbmRlcmVkIGluIHRoZSBzZXNzaW9ucyBVSSAoZS5nLiB0aGUgXCJOZXdcIiBzZXNzaW9uL2NoYXRcbiAqIGJ1dHRvbnMsIHRoZSBlbXB0eSBmaWxlIGVkaXRvcidzIFwiU2VhcmNoIEZpbGVzXCIgYnV0dG9uKS4gU3ViY2xhc3NlcyBwcm92aWRlIHRoZSBjb21tYW5kIGlkLFxuICogbGFiZWwgYW5kIGhvdmVyL2FyaWEgdGV4dC5cbiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIENvbXBhY3RCdXR0b25BY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24pO1xuXHR9XG5cblx0LyoqIENvbW1hbmQgaWQgdXNlZCB0byBsb29rIHVwIHRoZSB0cmFpbGluZyBrZXliaW5kaW5nIGhpbnQuICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXQgY29tbWFuZElkKCk6IHN0cmluZztcblxuXHQvKiogVmlzaWJsZSBwaWxsIGxhYmVsIChlLmcuIFwiTmV3XCIsIFwiTmV3IENoYXRcIikuICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXQgbGFiZWwoKTogc3RyaW5nO1xuXG5cdC8qKiBIb3ZlciB0ZXh0OyByZWNlaXZlcyB0aGUgcmVzb2x2ZWQga2V5YmluZGluZyBsYWJlbCwgaWYgYW55LiAqL1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0SG92ZXJDb250ZW50KGtleWJpbmRpbmdMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nO1xuXG5cdC8qKiBBY2Nlc3NpYmxlIG5hbWU7IHJlY2VpdmVzIHRoZSByZXNvbHZlZCBrZXliaW5kaW5nIGFyaWEgbGFiZWwsIGlmIGFueS4gKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldEFyaWFMYWJlbChrZXliaW5kaW5nQXJpYUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmc7XG5cblx0LyoqIE9wdGlvbmFsIG9uYm9hcmRpbmcgc3BvdGxpZ2h0IHRhcmdldCBpZCBmb3IgdGhlIHBpbGwuICovXG5cdHByb3RlY3RlZCBnZXQgb25ib2FyZGluZ1RhcmdldElkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBXaGV0aGVyIHRvIHJlbmRlciB0aGUgdHJhaWxpbmcga2V5YmluZGluZyBoaW50IGNoaXAgaW4gdGhlIGxhYmVsLiAqL1xuXHRwcm90ZWN0ZWQgZ2V0IHNob3dLZXliaW5kaW5nSGludCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKiBIb29rIGludm9rZWQgcmlnaHQgYmVmb3JlIHRoZSBhY3Rpb24gcnVucyAoZS5nLiBmb3IgdGVsZW1ldHJ5KS4gKi9cblx0cHJvdGVjdGVkIG9uUnVuKCk6IHZvaWQgeyB9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kOiBhc0Nzc1ZhcmlhYmxlKGFnZW50c05ld1Nlc3Npb25CdXR0b25CYWNrZ3JvdW5kKSxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUZvcmVncm91bmQ6IGFzQ3NzVmFyaWFibGUoYWdlbnRzTmV3U2Vzc2lvbkJ1dHRvbkZvcmVncm91bmQpLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kOiBhc0Nzc1ZhcmlhYmxlKGFnZW50c05ld1Nlc3Npb25CdXR0b25Ib3ZlckJhY2tncm91bmQpLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5Qm9yZGVyOiBhc0Nzc1ZhcmlhYmxlKGFnZW50c05ld1Nlc3Npb25CdXR0b25Cb3JkZXIpLFxuXHRcdFx0c2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdH0pKTtcblx0XHRidXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdhZ2VudC1zZXNzaW9ucy1jb21wYWN0LW5ldy1idXR0b24nKTtcblx0XHRjb25zdCBvbmJvYXJkaW5nVGFyZ2V0SWQgPSB0aGlzLm9uYm9hcmRpbmdUYXJnZXRJZDtcblx0XHRpZiAob25ib2FyZGluZ1RhcmdldElkKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihtYXJrT25ib2FyZGluZ1RhcmdldChidXR0b24uZWxlbWVudCwgb25ib2FyZGluZ1RhcmdldElkKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbi5vbkRpZENsaWNrKGUgPT4ge1xuXHRcdFx0Ly8gU3RvcCBwcm9wYWdhdGlvbiBzbyB0aGUgcGFyZW50IDxsaT4gY2xpY2sgaGFuZGxlciBkb2Vzbid0IHJ1biB0aGUgYWN0aW9uIHR3aWNlLlxuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdGlmICghdGhpcy5hY3Rpb24uZW5hYmxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm9uUnVuKCk7XG5cdFx0XHR0aGlzLmFjdGlvblJ1bm5lci5ydW4odGhpcy5hY3Rpb24sIHRoaXMuX2NvbnRleHQpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGJ1dHRvbkxhYmVsID0gJCgnc3Bhbi5uZXctc2Vzc2lvbi1idXR0b24tbGFiZWwnLCB1bmRlZmluZWQsIHRoaXMubGFiZWwpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdIaW50ID0gJCgnc3Bhbi5uZXctc2Vzc2lvbi1rZXliaW5kaW5nLWhpbnQnKTtcblx0XHRjb25zdCBrZXliaW5kaW5nSGludExhYmVsID0gdGhpcy5zaG93S2V5YmluZGluZ0hpbnRcblx0XHRcdD8gdGhpcy5fcmVnaXN0ZXIobmV3IEtleWJpbmRpbmdMYWJlbChrZXliaW5kaW5nSGludCwgT1MsIHtcblx0XHRcdFx0ZGlzYWJsZVRpdGxlOiB0cnVlLFxuXHRcdFx0XHRrZXliaW5kaW5nTGFiZWxCYWNrZ3JvdW5kOiAndHJhbnNwYXJlbnQnLFxuXHRcdFx0XHRrZXliaW5kaW5nTGFiZWxGb3JlZ3JvdW5kOiAnaW5oZXJpdCcsXG5cdFx0XHRcdGtleWJpbmRpbmdMYWJlbEJvcmRlcjogJ3RyYW5zcGFyZW50Jyxcblx0XHRcdFx0a2V5YmluZGluZ0xhYmVsQm90dG9tQm9yZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdGtleWJpbmRpbmdMYWJlbFNoYWRvdzogdW5kZWZpbmVkLFxuXHRcdFx0fSkpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRyZXNldChidXR0b24uZWxlbWVudCwgYnV0dG9uTGFiZWwpO1xuXG5cdFx0Y29uc3QgZ2V0S2V5YmluZGluZyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHByaW1hcnlLZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKHRoaXMuY29tbWFuZElkLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0cnVlKTtcblx0XHRcdGNvbnN0IHJlc29sdmVkS2V5YmluZGluZ3MgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmdzKHRoaXMuY29tbWFuZElkKTtcblx0XHRcdHJldHVybiBwcmltYXJ5S2V5YmluZGluZyA/PyByZXNvbHZlZEtleWJpbmRpbmdzWzBdO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihidXR0b24uZWxlbWVudCwgKCkgPT4gKHtcblx0XHRcdGNvbnRlbnQ6IHRoaXMuZ2V0SG92ZXJDb250ZW50KGdldEtleWJpbmRpbmcoKT8uZ2V0TGFiZWwoKSA/PyB1bmRlZmluZWQpLFxuXHRcdFx0YXBwZWFyYW5jZTogeyBjb21wYWN0OiB0cnVlIH0sXG5cdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XIH0sXG5cdFx0fSkpKTtcblxuXHRcdGxldCBsYXN0UmVuZGVyZWRLZXliaW5kaW5nTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBsYXN0UmVuZGVyZWRLZXliaW5kaW5nQXJpYUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsID0gbnVsbDtcblx0XHRjb25zdCB1cGRhdGVCdXR0b24gPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nID0gZ2V0S2V5YmluZGluZygpO1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZ0xhYmVsID0ga2V5YmluZGluZz8uZ2V0TGFiZWwoKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nQXJpYUxhYmVsID0ga2V5YmluZGluZz8uZ2V0QXJpYUxhYmVsKCkgPz8gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGxhc3RSZW5kZXJlZEtleWJpbmRpbmdMYWJlbCA9PT0ga2V5YmluZGluZ0xhYmVsICYmIGxhc3RSZW5kZXJlZEtleWJpbmRpbmdBcmlhTGFiZWwgPT09IGtleWJpbmRpbmdBcmlhTGFiZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsYXN0UmVuZGVyZWRLZXliaW5kaW5nTGFiZWwgPSBrZXliaW5kaW5nTGFiZWw7XG5cdFx0XHRsYXN0UmVuZGVyZWRLZXliaW5kaW5nQXJpYUxhYmVsID0ga2V5YmluZGluZ0FyaWFMYWJlbDtcblxuXHRcdFx0a2V5YmluZGluZ0hpbnRMYWJlbD8uc2V0KGtleWJpbmRpbmcpO1xuXHRcdFx0aWYgKGtleWJpbmRpbmdIaW50TGFiZWwgJiYga2V5YmluZGluZykge1xuXHRcdFx0XHRpZiAoa2V5YmluZGluZ0hpbnQucGFyZW50RWxlbWVudCAhPT0gYnV0dG9uLmVsZW1lbnQpIHtcblx0XHRcdFx0XHRhcHBlbmQoYnV0dG9uLmVsZW1lbnQsIGtleWJpbmRpbmdIaW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0a2V5YmluZGluZ0hpbnQucmVtb3ZlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuZ2V0QXJpYUxhYmVsKGtleWJpbmRpbmdBcmlhTGFiZWwpKTtcblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3MsIHVwZGF0ZUJ1dHRvbikpO1xuXHR9XG59XG5cbi8qKlxuICogUmVuZGVycyB0aGUgbmV3LXNlc3Npb24gYWN0aW9uIGFzIHRoZSBjb21wYWN0IFwiTmV3XCIgcGlsbCwgc2hhcmVkIGJ5IHRoZSBzZXNzaW9ucyBzaWRlYmFyXG4gKiBoZWFkZXIgYW5kIHRoZSB0aXRsZWJhci5cbiAqL1xuY2xhc3MgTmV3U2Vzc2lvbkFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQ29tcGFjdEJ1dHRvbkFjdGlvblZpZXdJdGVtIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTb3VyY2U6IFNlc3Npb25zSW50ZXJhY3Rpb25Tb3VyY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGFjdGlvbiwga2V5YmluZGluZ1NlcnZpY2UsIGhvdmVyU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldCBjb21tYW5kSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gTkVXX1NFU1NJT05fQUNUSU9OX0lEO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldCBsYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnbmV3Q29tcGFjdCcsIFwiTmV3XCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldCBvbmJvYXJkaW5nVGFyZ2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ3Nlc3Npb25zLm5ld1Nlc3Npb24uYnV0dG9uJztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRIb3ZlckNvbnRlbnQoa2V5YmluZGluZ0xhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBrZXliaW5kaW5nTGFiZWxcblx0XHRcdD8gbG9jYWxpemUoJ25ld1Nlc3Npb25CdXR0b25UaXRsZScsIFwiTmV3IFNlc3Npb24gKHswfSlcIiwga2V5YmluZGluZ0xhYmVsKVxuXHRcdFx0OiBsb2NhbGl6ZSgnbmV3U2Vzc2lvbkJ1dHRvblRpdGxlV2l0aG91dEtleWJpbmRpbmcnLCBcIk5ldyBTZXNzaW9uXCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldEFyaWFMYWJlbChrZXliaW5kaW5nQXJpYUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBrZXliaW5kaW5nQXJpYUxhYmVsXG5cdFx0XHQ/IGxvY2FsaXplKCduZXdTZXNzaW9uQnV0dG9uQXJpYUxhYmVsJywgXCJOZXcgU2Vzc2lvbiAoezB9KVwiLCBrZXliaW5kaW5nQXJpYUxhYmVsKVxuXHRcdFx0OiBsb2NhbGl6ZSgnbmV3U2Vzc2lvbkJ1dHRvbkFyaWFMYWJlbFdpdGhvdXRLZXliaW5kaW5nJywgXCJOZXcgU2Vzc2lvblwiKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvblJ1bigpOiB2b2lkIHtcblx0XHRsb2dTZXNzaW9uc0ludGVyYWN0aW9uKHRoaXMudGVsZW1ldHJ5U2VydmljZSwgJ25ld1Nlc3Npb24nLCB0aGlzLnRlbGVtZXRyeVNvdXJjZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBSZWdpc3RlcnMge0BsaW5rIE5ld1Nlc3Npb25BY3Rpb25WaWV3SXRlbX0gaW4gdGhlIHNlc3Npb25zIHNpZGViYXIgaGVhZGVyIGFuZCB0aGUgdGl0bGViYXIuXG4gKiBUaGUgdGl0bGViYXIgZW50cnkgaXMgZ2F0ZWQgYmVoaW5kIGFuIEEvQiBleHBlcmltZW50IHZpYSB7QGxpbmsgU2Vzc2lvbnNUaXRsZUJhck5ld1Nlc3Npb25FbmFibGVkQ29udGV4dH0uXG4gKi9cbmV4cG9ydCBjbGFzcyBOZXdTZXNzaW9uQWN0aW9uVmlld0l0ZW1Db250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNlc3Npb25zLm5ld1Nlc3Npb25BY3Rpb25WaWV3SXRlbSc7XG5cblx0LyoqIEV4UCB0cmVhdG1lbnQgdGhhdCBzaG93cyB0aGUgbmV3LXNlc3Npb24gYnV0dG9uIGluIHRoZSB0aXRsZWJhci4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTkVXX1NFU1NJT05fVElUTEVCQVJfVFJFQVRNRU5UID0gJ2FnZW50U2Vzc2lvbnNUaXRsZUJhck5ld1Nlc3Npb24nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGl0bGVCYXJFbmFibGVkQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXNzaWdubWVudFNlcnZpY2U6IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudGl0bGVCYXJFbmFibGVkQ29udGV4dCA9IFNlc3Npb25zVGl0bGVCYXJOZXdTZXNzaW9uRW5hYmxlZENvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG9uRGlkUmVnaXN0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRjb25zdCBtZW51czogTWVudUlkW10gPSBbTWVudXMuU2lkZWJhclNlc3Npb25zSGVhZGVyLCBNZW51cy5UaXRsZUJhckxlZnRMYXlvdXRdO1xuXHRcdGZvciAoY29uc3QgbWVudSBvZiBtZW51cykge1xuXHRcdFx0Y29uc3Qgc291cmNlOiBTZXNzaW9uc0ludGVyYWN0aW9uU291cmNlID0gbWVudSA9PT0gTWVudXMuVGl0bGVCYXJMZWZ0TGF5b3V0ID8gJ3RpdGxlQmFyJyA6ICdzaWRlYmFyJztcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihtZW51LCBORVdfU0VTU0lPTl9BQ1RJT05fSUQsIChhY3Rpb24sIF9vcHRpb25zLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOZXdTZXNzaW9uQWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgc291cmNlKTtcblx0XHRcdH0sIG9uRGlkUmVnaXN0ZXIuZXZlbnQpKTtcblx0XHR9XG5cdFx0b25EaWRSZWdpc3Rlci5maXJlKCk7XG5cblx0XHQvLyBSZXNvbHZlIHRoZSB0aXRsZWJhciBleHBlcmltZW50IG5vdyBhbmQgb24gcmVmZXRjaC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFzc2lnbm1lbnRTZXJ2aWNlLm9uRGlkUmVmZXRjaEFzc2lnbm1lbnRzKCgpID0+IHRoaXMudXBkYXRlVGl0bGVCYXJUcmVhdG1lbnQoKSkpO1xuXHRcdHRoaXMudXBkYXRlVGl0bGVCYXJUcmVhdG1lbnQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlVGl0bGVCYXJUcmVhdG1lbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQWx3YXlzIHNob3cgaW4gZGV2IGJ1aWxkcyAocnVubmluZyBmcm9tIHNvdXJjZXMpIHRvIGVhc2UgZGV2ZWxvcG1lbnQsIHJlZ2FyZGxlc3Mgb2YgdGhlIGV4cGVyaW1lbnQuXG5cdFx0aWYgKCF0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0J1aWx0KSB7XG5cdFx0XHR0aGlzLnRpdGxlQmFyRW5hYmxlZENvbnRleHQuc2V0KHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbmFibGVkID0gYXdhaXQgdGhpcy5hc3NpZ25tZW50U2VydmljZS5nZXRUcmVhdG1lbnQ8Ym9vbGVhbj4oTmV3U2Vzc2lvbkFjdGlvblZpZXdJdGVtQ29udHJpYnV0aW9uLk5FV19TRVNTSU9OX1RJVExFQkFSX1RSRUFUTUVOVCk7XG5cdFx0dGhpcy50aXRsZUJhckVuYWJsZWRDb250ZXh0LnNldChlbmFibGVkID09PSB0cnVlKTtcblx0fVxufVxuXG4vKipcbiAqIFJlbmRlcnMgdGhlIFwiTmV3IENoYXRcIiBhY3Rpb24gaW4gdGhlIHNlc3Npb24gaGVhZGVyIGFzIHRoZSBjb21wYWN0IHBpbGwsIG1hdGNoaW5nIHRoZVxuICogXCJOZXdcIiBzZXNzaW9uIHBpbGwgaW4gdGhlIHNlc3Npb25zIGxpc3QgaGVhZGVyIC8gdGl0bGViYXIuXG4gKi9cbmNsYXNzIE5ld0NoYXRBY3Rpb25WaWV3SXRlbSBleHRlbmRzIENvbXBhY3RCdXR0b25BY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldCBjb21tYW5kSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQUREX0NIQVRfVE9fU0VTU0lPTl9BQ1RJT05fSUQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0IGxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0Q29tcG9zaXRlQmFyLmFkZENoYXQuY29tcGFjdCcsIFwiTmV3IENoYXRcIik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0IHNob3dLZXliaW5kaW5nSGludCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0SG92ZXJDb250ZW50KGtleWJpbmRpbmdMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRyZXR1cm4ga2V5YmluZGluZ0xhYmVsXG5cdFx0XHQ/IGxvY2FsaXplKCduZXdDaGF0QnV0dG9uVGl0bGUnLCBcIk5ldyBDaGF0ICh7MH0pXCIsIGtleWJpbmRpbmdMYWJlbClcblx0XHRcdDogbG9jYWxpemUoJ25ld0NoYXRCdXR0b25UaXRsZVdpdGhvdXRLZXliaW5kaW5nJywgXCJOZXcgQ2hhdFwiKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRBcmlhTGFiZWwoa2V5YmluZGluZ0FyaWFMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRyZXR1cm4ga2V5YmluZGluZ0FyaWFMYWJlbFxuXHRcdFx0PyBsb2NhbGl6ZSgnbmV3Q2hhdEJ1dHRvbkFyaWFMYWJlbCcsIFwiTmV3IENoYXQgKHswfSlcIiwga2V5YmluZGluZ0FyaWFMYWJlbClcblx0XHRcdDogbG9jYWxpemUoJ25ld0NoYXRCdXR0b25BcmlhTGFiZWxXaXRob3V0S2V5YmluZGluZycsIFwiTmV3IENoYXRcIik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlc3Npb25OZXdDaGF0QWN0aW9uVmlld0l0ZW1Db250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNlc3Npb25zLm5ld0NoYXRBY3Rpb25WaWV3SXRlbSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gRmlyZSBvbmNlIGFmdGVyIHJlZ2lzdGVyaW5nIHNvIGEgaGVhZGVyIHRvb2xiYXIgdGhhdCB3YXMgYWxyZWFkeSBidWlsdFxuXHRcdC8vIChlLmcuIGZvciBhIHNlc3Npb24gcmVzdG9yZWQgYmVmb3JlIHRoaXMgY29udHJpYnV0aW9uIHJ1bnMpIHJlLXJlbmRlcnMgYW5kXG5cdFx0Ly8gcGlja3MgdXAgdGhpcyBmYWN0b3J5OyBvdGhlcndpc2UgTmV3IENoYXQgc3RheXMgaWNvbi1vbmx5IHVudGlsIGl0cyBtZW51XG5cdFx0Ly8gbmV4dCBjaGFuZ2VzLlxuXHRcdGNvbnN0IG9uRGlkUmVnaXN0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoTWVudXMuU2Vzc2lvbkJhclRvb2xiYXIsIEFERF9DSEFUX1RPX1NFU1NJT05fQUNUSU9OX0lELCAoYWN0aW9uLCBfb3B0aW9ucywgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld0NoYXRBY3Rpb25WaWV3SXRlbSwgYWN0aW9uKTtcblx0XHR9LCBvbkRpZFJlZ2lzdGVyLmV2ZW50KSk7XG5cdFx0b25EaWRSZWdpc3Rlci5maXJlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlc3Npb25Db252ZXJzYXRpb25zQWN0aW9uVmlld0l0ZW1Db250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNlc3Npb25zLmNvbnZlcnNhdGlvbnNBY3Rpb25WaWV3SXRlbSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51cy5TZXNzaW9uSGVhZGVyTWV0YSwgTWVudXMuU2Vzc2lvbkNvbnZlcnNhdGlvbnMsIChhY3Rpb24sIF9vcHRpb25zLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUl0ZW1BY3Rpb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkNvbnZlcnNhdGlvbnNBY3Rpb25WaWV3SXRlbSwgYWN0aW9uKTtcblx0XHR9KSk7XG5cdH1cbn1cblxuLy8gVGhlIFwiQ2hhdHNcIiB0b29sYmFyIGVudHJ5IGlzIGJhY2tlZCBieSBhIHN1Ym1lbnUgd2hvc2UgZ3JvdXBzIGFyZSByZW5kZXJlZCBieVxuLy8gdGhlIFNlc3Npb25zIHdvcmtiZW5jaCBhcyBhbiBBY3Rpb24gV2lkZ2V0IGRyb3Bkb3duLiBTZWxlY3RpbmcgYW4gZW50cnkgb3BlbnNcbi8vIG9yIGZvY3VzZXMgdGhhdCBjaGF0LlxuLy9cbi8vIEl0IGlzIGFsd2F5cyByZW5kZXJlZCBpbiB0aGUgc2Vzc2lvbiBoZWFkZXIgbWV0YSByb3csIGFmdGVyIHRoZSBwaWxsc1xuLy8gKHdvcmtzcGFjZSBmb2xkZXIgLyBjaGFuZ2VzIC8gcHVsbCByZXF1ZXN0KSBhcyB0aGUgbWV0YSB0b29sYmFyJ3MgZGVmYXVsdFxuLy8gZHJvcGRvd24gaWNvbiwgaW5kZXBlbmRlbnQgb2Ygd2hldGhlciB0aGUgY2hhdCB0YWIgc3RyaXAgaXMgc2hvd24uIEl0IHN1cmZhY2VzXG4vLyBvbmNlIHRoZSBzZXNzaW9uIGhhcyBtb3JlIHRoYW4gb25lIGNvbW1pdHRlZCBjaGF0LCBvciB3aGVuIHRoZSBhY3RpdmUgY2hhdCBoYXNcbi8vIHN1YmFnZW50cyAoYSBzZXBhcmF0ZSBncm91cCBhdCB0aGUgYm90dG9tIGxpc3RzIHRoZW0pIGV2ZW4gaWYgdGhhdCBpcyB0aGUgb25seVxuLy8gY29tbWl0dGVkIGNoYXQuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudXMuU2Vzc2lvbkhlYWRlck1ldGEsIHtcblx0c3VibWVudTogTWVudXMuU2Vzc2lvbkNvbnZlcnNhdGlvbnMsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXRDb21wb3NpdGVCYXIuY29udmVyc2F0aW9ucycsIFwiQ2hhdHNcIiksXG5cdGljb246IENvZGljb24uY29tbWVudERpc2N1c3Npb24sXG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdG9yZGVyOiAxMDAsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChTZXNzaW9uSXNDcmVhdGVkQ29udGV4dCwgU2Vzc2lvbklzQXJjaGl2ZWRDb250ZXh0Lm5lZ2F0ZSgpLCBDb250ZXh0S2V5RXhwci5vcihDb250ZXh0S2V5RXhwci5hbmQoU2Vzc2lvblN1cHBvcnRzTXVsdGlwbGVDaGF0c0NvbnRleHQsIFNlc3Npb25IYXNNdWx0aXBsZUNvbW1pdHRlZENoYXRzQ29udGV4dCksIFNlc3Npb25BY3RpdmVDaGF0SGFzU3ViYWdlbnRzQ29udGV4dCkpLFxufSk7XG5cbi8qKlxuICogUG9wdWxhdGVzIHRoZSB7QGxpbmsgTWVudXMuU2Vzc2lvbkNvbnZlcnNhdGlvbnN9IG1lbnUgZm9yIGV2ZXJ5IHZpc2libGVcbiAqIHNlc3Npb24uIHtAbGluayBNZW51cy5TZXNzaW9uQmFyVG9vbGJhcn0gaXMgcmVuZGVyZWQgb25jZSBwZXIgc2Vzc2lvbiB2aWV3XG4gKiAoaGVhZGVyL2Zsb2F0aW5nIHRvb2xiYXIpIGFnYWluc3QgdGhhdCB2aWV3J3Mgc2NvcGVkIGNvbnRleHQga2V5IHNlcnZpY2UsIHNvXG4gKiB0aGUgbWVudSBpdGVtcyBhcmUgc2NvcGVkIHBlciBzZXNzaW9uIHZpYSB7QGxpbmsgU2Vzc2lvbklkQ29udGV4dH06IGVhY2hcbiAqIHNlc3Npb24ncyBwZXItY2hhdCBuYXZpZ2F0aW9uIGFjdGlvbnMgb25seSByZW5kZXIgaW4gKGFuZCBhY3Qgb24pIHRoZWlyIG93blxuICogc2Vzc2lvbidzIHRvb2xiYXIuIFRoZSBhY3Rpb25zIGFyZSAocmUpcmVnaXN0ZXJlZCB3aGVuZXZlciB0aGUgc2V0IG9mIHZpc2libGVcbiAqIHNlc3Npb25zIG9yIHRoZWlyIGNoYXQgbGlzdHMgY2hhbmdlLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbkNvbnZlcnNhdGlvbnNNZW51Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zZXNzaW9ucy5jb252ZXJzYXRpb25zTWVudSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLnZpc2libGVTZXNzaW9ucy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHRoaXMuX3JlZ2lzdGVyU2Vzc2lvbkNvbnZlcnNhdGlvbnMoc2Vzc2lvbiwgcmVhZGVyKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlclNlc3Npb25Db252ZXJzYXRpb25zKHNlc3Npb246IElBY3RpdmVTZXNzaW9uLCByZWFkZXI6IElSZWFkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0Y29uc3QgZXh0VXJpID0gdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaTtcblxuXHRcdC8vIFNjb3BlIGV2ZXJ5IGVudHJ5IHRvIHRoaXMgc2Vzc2lvbidzIHRvb2xiYXI6IHRoZSBtZW51IGlzIHJlbmRlcmVkIG9uY2Vcblx0XHQvLyBwZXIgc2Vzc2lvbiB2aWV3IGFnYWluc3QgaXRzIG93biBzY29wZWQgY29udGV4dCBrZXkgc2VydmljZSwgd2hlcmVcblx0XHQvLyBgc2Vzc2lvbklkYCByZXNvbHZlcyB0byB0aGF0IHZpZXcncyBzZXNzaW9uLlxuXHRcdGNvbnN0IHNjb3BlZFRvU2Vzc2lvbiA9IENvbnRleHRLZXlFeHByLmVxdWFscyhTZXNzaW9uSWRDb250ZXh0LmtleSwgc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXG5cdFx0Y29uc3QgYWxsQ2hhdHMgPSBzZXNzaW9uLmNoYXRzLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBhY3RpdmVDaGF0ID0gc2Vzc2lvbi5hY3RpdmVDaGF0LnJlYWQocmVhZGVyKTtcblxuXHRcdGNvbnN0IHJlZ2lzdGVyT3BlbiA9IChjaGF0OiBJQ2hhdCwgZ3JvdXA6IHN0cmluZywgb3JkZXI6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29uc3QgY2hhdFJlc291cmNlID0gY2hhdC5yZXNvdXJjZTtcblx0XHRcdGNvbnN0IHRpdGxlID0gY2hhdC50aXRsZS5yZWFkKHJlYWRlcikgfHwgbG9jYWxpemUoJ3VudGl0bGVkQ2hhdCcsIFwiVW50aXRsZWQgQ2hhdFwiKTtcblx0XHRcdC8vIEFjdGlvbiBJRHMgYXJlIGdsb2JhbCwgc28gc2NvcGUgdGhlbSB0byB0aGUgc2Vzc2lvbiBhbmQgYSBoYXNoIG9mIHRoZVxuXHRcdFx0Ly8gY2hhdCByZXNvdXJjZSAod2hpY2ggaXMgc3RhYmxlIHBlciBjaGF0KSByYXRoZXIgdGhhbiBlbWJlZGRpbmcgdGhlIHJhd1xuXHRcdFx0Ly8gVVJJLCB3aGljaCBpcyBsb25nIGFuZCBjYW4gY29udGFpbiBgOmAsIGAvYCwgYCNgLlxuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRpZDogZ2V0U2Vzc2lvbkNvbnZlcnNhdGlvbkFjdGlvbklkKHNlc3Npb24uc2Vzc2lvbklkLCBjaGF0UmVzb3VyY2UpLFxuXHRcdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0XHRtZW51OiB7IGlkOiBNZW51cy5TZXNzaW9uQ29udmVyc2F0aW9ucywgZ3JvdXAsIG9yZGVyLCB3aGVuOiBzY29wZWRUb1Nlc3Npb24gfSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGZvcndhcmRlZFNlc3Npb24/OiBJQWN0aXZlU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldCA9IGZvcndhcmRlZFNlc3Npb24gPz8gc2Vzc2lvbjtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXRDaGF0ID0gdGFyZ2V0LmNoYXRzLmdldCgpLmZpbmQoYyA9PiBleHRVcmkuaXNFcXVhbChjLnJlc291cmNlLCBjaGF0UmVzb3VyY2UpKTtcblx0XHRcdFx0XHRpZiAoIXRhcmdldENoYXQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gQWx0LWludm9rZSBvcGVucyB0aGUgY2hhdCB0byB0aGUgc2lkZSAoaW4gYSBuZXcgZ3JvdXAgYmVzaWRlIHRoZVxuXHRcdFx0XHRcdC8vIGFjdGl2ZSBvbmUpIGluc3RlYWQgb2YgaW4gcGxhY2U7IHRoZSBkcm9wZG93bidzIHNlbGVjdCBoYW5kbGVyXG5cdFx0XHRcdFx0Ly8gZG9lcyBub3QgZm9yd2FyZCB0aGUgbW91c2UgZXZlbnQsIHNvIHJlYWQgdGhlIGxpdmUgbW9kaWZpZXIgc3RhdGUuXG5cdFx0XHRcdFx0aWYgKE1vZGlmaWVyS2V5RW1pdHRlci5nZXRJbnN0YW5jZSgpLmtleVN0YXR1cy5hbHRLZXkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZpZXcgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpLmdldFNlc3Npb25WaWV3KHRhcmdldC5zZXNzaW9uSWQpO1xuXHRcdFx0XHRcdFx0aWYgKHZpZXcpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdmlldy5vcGVuQ2hhdFRvU2lkZSh0YXJnZXRDaGF0LnJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhd2FpdCB0aGF0Ll9zZXNzaW9uc1NlcnZpY2Uub3BlbkNoYXQodGFyZ2V0LCB0YXJnZXRDaGF0LnJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH07XG5cblx0XHRhbGxDaGF0cy5mb3JFYWNoKChjaGF0LCBpbmRleCkgPT4ge1xuXHRcdFx0Ly8gU2tpcCB1bnRpdGxlZCAoaW4tY29tcG9zZXIpIGRyYWZ0IGNoYXRzOiB0aGV5IGFyZSB0cmFuc2llbnQgXCJOZXdcblx0XHRcdC8vIENoYXRcIiBkcmFmdHMgdGhhdCBjYW5ub3QgYmUgbWVhbmluZ2Z1bGx5IHNlbGVjdGVkLCBhbmQgbGlzdGluZ1xuXHRcdFx0Ly8gdGhlbSBoZXJlICh0aXRsZWQgXCJOZXcgQ2hhdFwiKSBqdXN0IGR1cGxpY2F0ZXMgdGhlIE5ldyBDaGF0IGFjdGlvbi5cblx0XHRcdGlmIChjaGF0LnN0YXR1cy5yZWFkKHJlYWRlcikgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZ3JvdXAgPSBnZXRTZXNzaW9uQ29udmVyc2F0aW9uR3JvdXBJZChjaGF0LCBhY3RpdmVDaGF0LCBleHRVcmkpO1xuXHRcdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRcdHJlZ2lzdGVyT3BlbihjaGF0LCBncm91cCwgaW5kZXgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVQaW5TZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnc2Vzc2lvbnMuY2hhdENvbXBvc2l0ZUJhci50b2dnbGVQaW4nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdENvbXBvc2l0ZUJhci5waW4nLCBcIlBpbiBTZXNzaW9uXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5waW4sXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGNvbmRpdGlvbjogU2Vzc2lvbklzU3RpY2t5Q29udGV4dCxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5waW5uZWQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdENvbXBvc2l0ZUJhci51bnBpbicsIFwiVW5waW4gU2Vzc2lvblwiKSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uQmFyVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICcxX3Nlc3Npb24nLFxuXHRcdFx0XHRvcmRlcjogMTAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChTZXNzaW9uSXNDcmVhdGVkQ29udGV4dCwgU2Vzc2lvbklzQXJjaGl2ZWRDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlc3Npb246IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKS50b2dnbGVTZXNzaW9uU3RpY2tpbmVzcyhzZXNzaW9uKTtcblx0fVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51cy5TZXNzaW9uSGVhZGVyQ29udGV4dCwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICdzZXNzaW9ucy5jaGF0Q29tcG9zaXRlQmFyLnRvZ2dsZVBpbicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0Q29tcG9zaXRlQmFyLnBpblZpZXcnLCBcIlBpbiBWaWV3XCIpLFxuXHRcdHRvZ2dsZWQ6IHtcblx0XHRcdGNvbmRpdGlvbjogU2Vzc2lvbklzU3RpY2t5Q29udGV4dCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdENvbXBvc2l0ZUJhci51bnBpblZpZXcnLCBcIlVucGluIFZpZXdcIiksXG5cdFx0fSxcblx0fSxcblx0Z3JvdXA6ICcxX3ZpZXcnLFxuXHRvcmRlcjogMSxcblx0d2hlbjogU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsXG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlbmFtZVNlc3Npb25IZWFkZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9ucy5zZXNzaW9uSGVhZGVyLnJlbmFtZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZW5hbWVTZXNzaW9uSGVhZGVyJywgXCJSZW5hbWUuLi5cIiksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudXMuU2Vzc2lvbkhlYWRlckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMl9lZGl0Jyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLnJlZ2V4KFNlc3Npb25Qcm92aWRlcklkQ29udGV4dC5rZXksIEFOWV9BR0VOVF9IT1NUX1BST1ZJREVSX1JFKSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpLmdldFNlc3Npb25WaWV3KHNlc3Npb24uc2Vzc2lvbklkKT8uc3RhcnRUaXRsZUVkaXRpbmcoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDbG9zZVNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9ucy5jaGF0Q29tcG9zaXRlQmFyLmNsb3NlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXRDb21wb3NpdGVCYXIuY2xvc2UnLCBcIkNsb3NlXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jbG9zZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uQmFyVG9vbGJhcixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsIE11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlQ29udGV4dCksXG5cdFx0XHRcdGdyb3VwOiAnMV9zZXNzaW9uJyxcblx0XHRcdFx0b3JkZXI6IDMwLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudXMuU2Vzc2lvbkhlYWRlckNvbnRleHQsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKFNlc3Npb25Jc0NyZWF0ZWRDb250ZXh0LCBNdWx0aXBsZVNlc3Npb25zVmlzaWJsZUNvbnRleHQpLFxuXHRcdFx0XHRncm91cDogJzFfdmlldycsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlc3Npb246IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25zUGFydFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpO1xuXG5cdFx0c2Vzc2lvbnNTZXJ2aWNlLmNsb3NlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRzZXNzaW9uc1BhcnRTZXJ2aWNlLmZvY3VzU2Vzc2lvbihzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlTWF4aW1pemVTZXNzaW9uVmlld0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zLmNoYXRDb21wb3NpdGVCYXIudG9nZ2xlTWF4aW1pemUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdENvbXBvc2l0ZUJhci5tYXhpbWl6ZScsIFwiTWF4aW1pemUgU2Vzc2lvblwiKSxcblx0XHRcdGljb246IENvZGljb24uc2NyZWVuRnVsbCxcblx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0Y29uZGl0aW9uOiBTZXNzaW9uSXNNYXhpbWl6ZWRDb250ZXh0LFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNjcmVlbk5vcm1hbCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0Q29tcG9zaXRlQmFyLnVubWF4aW1pemUnLCBcIlJlc3RvcmUgU2Vzc2lvblwiKSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uQmFyVG9vbGJhcixcblx0XHRcdFx0d2hlbjogTXVsdGlwbGVTZXNzaW9uc1Zpc2libGVDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzFfc2Vzc2lvbicsXG5cdFx0XHRcdG9yZGVyOiAyMCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlc3Npb246IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YWNjZXNzb3IuZ2V0KElTZXNzaW9uc1BhcnRTZXJ2aWNlKS50b2dnbGVNYXhpbWl6ZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0YWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpLnNldEFjdGl2ZShzZXNzaW9uKTtcblx0fVxufSk7XG5cbi8vIC0tIENsb3NlIEVkaXRvciBBcmVhIChXYXRlcm1hcmsgVG9vbGJhcikgLS1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENsb3NlRWRpdG9yQXJlYUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zLmNsb3NlRWRpdG9yQXJlYScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbG9zZUVkaXRvckFyZWEnLCBcIkNsb3NlIEVkaXRvciBBcmVhXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jbG9zZSxcblx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yR3JvdXBXYXRlcm1hcmtUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTAsXG5cdFx0XHRcdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdGxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5FRElUT1JfUEFSVCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFDMUMsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyxTQUFrQixpQ0FBaUM7QUFDNUQsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsY0FB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
