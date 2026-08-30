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
import "./media/sessionsTitleBarWidget.css";
import { $, addDisposableGenericMouseDownListener, addDisposableListener, EventType, getDomNodePagePosition, getWindow, isAncestor, reset } from "../../../../base/browser/dom.js";
import { combinedDisposable, Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { localize } from "../../../../nls.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { MenuRegistry, SubmenuItemAction } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { Menus } from "../../../browser/menus.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { autorun } from "../../../../base/common/observable.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { AnchorAlignment, AnchorPosition } from "../../../../base/common/layout.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IsAuxiliaryWindowContext } from "../../../../workbench/common/contextkeys.js";
import { IWorkbenchLayoutService } from "../../../../workbench/services/layout/browser/layoutService.js";
import { SessionsBlockedSessionsVisibleContext, SessionsWelcomeVisibleContext } from "../../../common/contextkeys.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { SHOW_SESSIONS_PICKER_COMMAND_ID } from "./sessionsActions.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { getUntitledSessionTitle } from "../../../services/sessions/common/session.js";
import { BlockedSessionsList, registerBlockedSessionsItemActions } from "./blockedSessionsList.js";
import { SessionActionFeedback } from "./sessionActionFeedback.js";
import { BlockedSessionsIndicatorModel } from "./blockedSessionsIndicatorModel.js";
import { openSessionToTheSide } from "./views/sessionsView.js";
const SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID = "sessions.blockedSessions.showAllSessions";
const IGNORE_ALL_INPUT_NEEDED_COMMAND_ID = "sessions.blockedSessions.ignoreAllInputNeeded";
const HIDE_BLOCKED_SESSIONS_COMMAND_ID = "sessions.blockedSessions.hide";
function registerBlockedSessionsHeaderActions() {
  return combinedDisposable(
    MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
      command: {
        id: SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID,
        title: localize("showAllSessions", "Show All Sessions"),
        icon: Codicon.listSelection
      },
      group: "navigation",
      order: 1
    }),
    MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
      command: {
        id: IGNORE_ALL_INPUT_NEEDED_COMMAND_ID,
        title: localize("ignoreAllInputNeeded", "Ignore All Input Needed"),
        icon: Codicon.bellSlash
      },
      group: "navigation",
      order: 2
    }),
    MenuRegistry.appendMenuItem(Menus.BlockedSessionsHeader, {
      command: {
        id: HIDE_BLOCKED_SESSIONS_COMMAND_ID,
        title: localize("closeBlockedSessions", "Close"),
        icon: Codicon.close
      },
      group: "z_close",
      order: 1
    })
  );
}
function registerBlockedSessionsHeaderCommands() {
  return combinedDisposable(
    CommandsRegistry.registerCommand(SHOW_ALL_SESSIONS_FROM_BLOCKED_LIST_COMMAND_ID, (_accessor, context) => {
      context.showAllSessions();
    }),
    CommandsRegistry.registerCommand(IGNORE_ALL_INPUT_NEEDED_COMMAND_ID, (_accessor, context) => {
      context.ignoreAllSessions();
    })
  );
}
let openBlockedSessionsView;
const BLOCKED_DROPDOWN_MIN_WIDTH = 550;
const BLOCKED_DROPDOWN_MAX_WIDTH_RATIO = 0.9;
let SessionsTitleBarWidget = class extends BaseActionViewItem {
  constructor(action, options, sessionActionFeedback, approvalModel, blockedSessions, ciFixModel, sessionsManagementService, sessionsService, sessionsProvidersService, commandService, contextViewService, layoutService, instantiationService, contextKeyService, quickInputService) {
    super(void 0, action, options);
    this.sessionsManagementService = sessionsManagementService;
    this.sessionsService = sessionsService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.commandService = commandService;
    this.contextViewService = contextViewService;
    this.layoutService = layoutService;
    this.instantiationService = instantiationService;
    this.quickInputService = quickInputService;
    this._dynamicDisposables = this._register(new DisposableStore());
    /** Owns the blink animation's `animationend` listener, kept across re-renders. */
    this._blinkListener = this._register(new MutableDisposable());
    /** Guard to prevent re-entrant rendering */
    this._isRendering = false;
    this._blockedSessionsVisibleContext = SessionsBlockedSessionsVisibleContext.bindTo(contextKeyService);
    this._sessionActionFeedback = sessionActionFeedback ?? this._register(new SessionActionFeedback());
    this._blockedIndicator = this._register(this.instantiationService.createInstance(BlockedSessionsIndicatorModel, approvalModel, blockedSessions, ciFixModel));
    this._register(this._blockedIndicator.onDidRequestBlink(() => {
      this._lastRenderState = void 0;
      this._render();
    }));
    this._register(autorun((reader) => {
      const sessionData = this.sessionsService.activeSession.read(reader);
      if (sessionData) {
        sessionData.title.read(reader);
        sessionData.workspace.read(reader);
        sessionData.isQuickChat?.read(reader);
      }
      this._lastRenderState = void 0;
      this._render();
    }));
    this._register(autorun((reader) => {
      const blocked = this._blockedIndicator.blockedSessions.read(reader);
      this._sessionActionFeedback.approvedCount.read(reader);
      this._blockedIndicator.requiresInputKind.read(reader);
      if (this._openContextView && this._blockedList) {
        this._blockedList.setSessions(blocked.map((entry) => entry.session));
        this.contextViewService.layout();
      }
      this._render();
    }));
    this._register(this.sessionsManagementService.onDidChangeSessions(() => {
      this._lastRenderState = void 0;
      this._render();
    }));
    this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
      this._lastRenderState = void 0;
      this._render();
    }));
    this._register(toDisposable(() => this._openContextView?.close()));
  }
  render(container) {
    super.render(container);
    this._container = container;
    container.classList.add("agent-sessions-titlebar-container");
    this._render();
  }
  setFocusable(_focusable) {
  }
  // Override onClick to prevent the base class from running the underlying
  // submenu action when the widget handles clicks itself.
  onClick() {
  }
  _render() {
    if (!this._container) {
      return;
    }
    if (this._isRendering) {
      return;
    }
    this._isRendering = true;
    try {
      const approvedCount = this._sessionActionFeedback.approvedCount.get();
      const blockedCount = this._blockedIndicator.blockedSessions.get().length;
      const requiresInput = blockedCount > 0;
      const showApproved = approvedCount > 0;
      const showRequiresInput = requiresInput && !showApproved;
      const shouldBlink = showRequiresInput && this._blockedIndicator.consumePendingBlink();
      const requiresInputKind = this._blockedIndicator.requiresInputKind.get();
      let renderState;
      if (showApproved) {
        renderState = `approved|${approvedCount}`;
      } else if (showRequiresInput) {
        renderState = `blocked|${blockedCount}|${requiresInputKind ?? "mixed"}`;
      } else {
        const icon = this._getActiveSessionIcon();
        const sessionTitle = this._getSessionTitle() ?? getUntitledSessionTitle(this.sessionsService.activeSession.get()?.isQuickChat?.get() ?? false);
        const workspaceLabel = this._getRepositoryLabel();
        renderState = `normal|${icon?.id ?? ""}|${sessionTitle ?? ""}|${workspaceLabel ?? ""}`;
      }
      if (this._lastRenderState === renderState) {
        return;
      }
      this._lastRenderState = renderState;
      if (!requiresInput && this._openContextView) {
        this._openContextView.close();
      }
      reset(this._container);
      this._dynamicDisposables.clear();
      this._container.removeAttribute("aria-hidden");
      this._container.setAttribute("role", "button");
      this._container.tabIndex = 0;
      if (!(showRequiresInput && !shouldBlink)) {
        this._container.classList.remove("agent-sessions-titlebar-blink");
      }
      this._container.classList.toggle("agent-sessions-titlebar-requires-input", showRequiresInput);
      this._container.classList.toggle("agent-sessions-titlebar-approved", showApproved);
      if (showApproved) {
        this._renderApproved(approvedCount);
      } else if (showRequiresInput) {
        this._renderRequiresInput(blockedCount, requiresInputKind, shouldBlink);
      } else {
        this._renderActiveSession();
      }
    } finally {
      this._isRendering = false;
    }
  }
  /**
   * Render the active-session pill: icon + title + workspace. Clicking opens the
   * sessions picker.
   */
  _renderActiveSession() {
    const container = this._container;
    container.setAttribute("aria-label", localize("agentSessionsShowSessions", "Show Sessions"));
    const icon = this._getActiveSessionIcon();
    const sessionTitle = this._getSessionTitle() ?? getUntitledSessionTitle(this.sessionsService.activeSession.get()?.isQuickChat?.get() ?? false);
    const workspaceLabel = this._getRepositoryLabel();
    const sessionPill = $("div.agent-sessions-titlebar-pill");
    const centerGroup = $("div.agent-sessions-titlebar-center");
    if (icon) {
      const iconEl = $("div.agent-sessions-titlebar-icon" + ThemeIcon.asCSSSelector(icon));
      centerGroup.appendChild(iconEl);
    }
    if (sessionTitle) {
      const titleEl = $("div.agent-sessions-titlebar-title");
      titleEl.textContent = sessionTitle;
      centerGroup.appendChild(titleEl);
    }
    if (workspaceLabel) {
      const separatorEl = $("div.agent-sessions-titlebar-separator");
      centerGroup.appendChild(separatorEl);
      const workspaceEl = $("div.agent-sessions-titlebar-workspace");
      workspaceEl.textContent = workspaceLabel;
      centerGroup.appendChild(workspaceEl);
    }
    sessionPill.appendChild(centerGroup);
    this._dynamicDisposables.add(addDisposableGenericMouseDownListener(sessionPill, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }));
    this._dynamicDisposables.add(addDisposableListener(sessionPill, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showSessionsPicker();
    }));
    container.appendChild(sessionPill);
    this._dynamicDisposables.add(addDisposableListener(container, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this._showSessionsPicker();
      }
    }));
  }
  /**
   * Render the requires-input pill. Clicking toggles a dropdown that lists the
   * blocked sessions below the command center box.
   */
  _renderRequiresInput(count, kind, shouldBlink) {
    const container = this._container;
    const label = this._blockedIndicator.getRequiresInputLabel(count, kind);
    container.setAttribute("aria-label", label);
    const pill = $("div.agent-sessions-titlebar-pill");
    const labelEl = $("div.agent-sessions-titlebar-requires-input-label");
    labelEl.textContent = label;
    pill.appendChild(labelEl);
    this._dynamicDisposables.add(addDisposableGenericMouseDownListener(pill, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }));
    this._dynamicDisposables.add(addDisposableListener(pill, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._toggleBlockedSessions();
    }));
    container.appendChild(pill);
    this._dynamicDisposables.add(addDisposableListener(container, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this._toggleBlockedSessions();
      }
    }));
    if (shouldBlink) {
      this._triggerAttentionBlink();
    }
  }
  /**
   * Render the transient green "Approved N sessions" confirmation shown briefly
   * after the user approves one or more sessions' pending actions from the list.
   */
  _renderApproved(count) {
    const container = this._container;
    const label = count === 1 ? localize("oneSessionApproved", "Approved 1 session") : localize("nSessionsApproved", "Approved {0} sessions", count);
    container.setAttribute("aria-label", label);
    const pill = $("div.agent-sessions-titlebar-pill");
    const labelEl = $("div.agent-sessions-titlebar-approved-label");
    labelEl.textContent = label;
    pill.appendChild(labelEl);
    this._dynamicDisposables.add(addDisposableGenericMouseDownListener(pill, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }));
    this._dynamicDisposables.add(addDisposableListener(pill, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._activateDefaultAction();
    }));
    container.appendChild(pill);
    this._dynamicDisposables.add(addDisposableListener(container, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this._activateDefaultAction();
      }
    }));
  }
  /**
   * Activate the widget as its non-approved state would: reveal the blocked
   * sessions when the requires-input state applies, otherwise the sessions picker.
   */
  _activateDefaultAction() {
    const requiresInput = this._blockedIndicator.blockedSessions.get().length > 0;
    if (requiresInput) {
      this._toggleBlockedSessions();
    } else {
      this._showSessionsPicker();
    }
  }
  /**
   * Restart the attention blink animation on the command center box. Re-adding
   * the class after a forced reflow guarantees the CSS animation replays even
   * when the container element persists across renders.
   */
  _triggerAttentionBlink() {
    const container = this._container;
    if (!container) {
      return;
    }
    container.classList.remove("agent-sessions-titlebar-blink");
    container.getBoundingClientRect();
    container.classList.add("agent-sessions-titlebar-blink");
    this._blinkListener.value = addDisposableListener(container, "animationend", () => {
      container.classList.remove("agent-sessions-titlebar-blink");
      this._blinkListener.clear();
    });
  }
  /**
   * Toggle the blocked-sessions dropdown open/closed.
   */
  _toggleBlockedSessions() {
    if (this._openContextView) {
      this._openContextView.close();
      return;
    }
    this._showBlockedSessions();
  }
  /**
   * Show the blocked sessions as a flat list in a dropdown anchored below the
   * command center box.
   */
  _showBlockedSessions() {
    const container = this._container;
    if (!container) {
      return;
    }
    if (this._blockedIndicator.blockedSessions.get().length === 0) {
      return;
    }
    const width = this._computeBlockedDropdownWidth(container);
    const store = new DisposableStore();
    this._openContextView = this.contextViewService.showContextView({
      getAnchor: () => this._getBlockedDropdownAnchor(container),
      anchorAlignment: AnchorAlignment.LEFT,
      anchorPosition: AnchorPosition.BELOW,
      render: (viewContainer) => {
        const list = store.add(this.instantiationService.createInstance(BlockedSessionsList, viewContainer, {
          width,
          approvalModel: this._blockedIndicator.approvalModel,
          ciFixModel: this._blockedIndicator.ciFixModel,
          onSessionOpen: (resource, preserveFocus, sideBySide) => {
            this._openContextView?.close();
            this._openBlockedSession(resource, preserveFocus, sideBySide);
          },
          onIgnoreSession: (session) => this._blockedIndicator.ignoreSession(session),
          onShowAllSessions: () => {
            this._openContextView?.close();
            this._showSessionsPicker();
          },
          onIgnoreAllSessions: () => this._blockedIndicator.ignoreAllSessions(),
          onClose: () => this._openContextView?.close()
        }));
        list.setSessions(this._blockedIndicator.blockedSessions.get().map((entry) => entry.session));
        store.add(list.onDidChangeContentHeight(() => this.contextViewService.layout()));
        store.add(list.onDidApproveSession((approved) => {
          this._blockedIndicator.dismissApproval(approved);
          this._sessionActionFeedback.notifyApproved();
        }));
        store.add(this.layoutService.onDidLayoutActiveContainer(() => {
          list.setWidth(this._computeBlockedDropdownWidth(container));
          this.contextViewService.layout();
        }));
        store.add(this.quickInputService.onShow(() => this._openContextView?.close()));
        this._blockedList = list;
        return store;
      },
      focus: () => this._blockedList?.focus(),
      onDOMEvent: (e) => {
        if (e.type === EventType.CLICK) {
          const target = e.target;
          if (target && !isAncestor(target, this.contextViewService.getContextViewElement()) && !isAncestor(target, container)) {
            this._openContextView?.close();
          }
        }
      },
      onHide: () => {
        this._blockedSessionsVisibleContext.set(false);
        store.dispose();
        this._openContextView = void 0;
        openBlockedSessionsView = void 0;
        this._blockedList = void 0;
      }
    });
    openBlockedSessionsView = this._openContextView;
    this._blockedSessionsVisibleContext.set(true);
  }
  /**
   * Compute the width of the blocked-sessions dropdown: at least as wide as the
   * command center box (the anchor) and {@link BLOCKED_DROPDOWN_MIN_WIDTH}, but
   * never wider than {@link BLOCKED_DROPDOWN_MAX_WIDTH_RATIO} of the window so it
   * stays within the viewport on narrow layouts.
   */
  _computeBlockedDropdownWidth(container) {
    const anchorWidth = getDomNodePagePosition(container).width;
    const windowWidth = getWindow(container).innerWidth;
    const minWidth = Math.max(anchorWidth, BLOCKED_DROPDOWN_MIN_WIDTH);
    const maxWidth = windowWidth * BLOCKED_DROPDOWN_MAX_WIDTH_RATIO;
    return Math.round(Math.min(minWidth, maxWidth));
  }
  /**
   * Anchor the blocked-sessions dropdown so it is horizontally centered on the
   * command center box. Because the dropdown can be wider than the box, we hand
   * the context view a zero-width anchor positioned at the dropdown's target
   * left edge (the box center minus half the dropdown width).
   */
  _getBlockedDropdownAnchor(container) {
    const position = getDomNodePagePosition(container);
    const width = this._computeBlockedDropdownWidth(container);
    const centerX = position.left + position.width / 2;
    return {
      x: Math.round(centerX - width / 2),
      y: position.top,
      width: 0,
      height: position.height
    };
  }
  _openBlockedSession(resource, preserveFocus, sideBySide) {
    if (sideBySide) {
      const session = this.sessionsManagementService.getSession(resource);
      if (session) {
        openSessionToTheSide(this.sessionsService, session, { preserveFocus }).catch(onUnexpectedError);
        return;
      }
    }
    this.sessionsService.openSession(resource, { preserveFocus }).catch(onUnexpectedError);
  }
  /**
   * Get the icon for the active session's type.
   */
  _getActiveSessionIcon() {
    const sessionData = this.sessionsService.activeSession.get();
    if (sessionData) {
      return sessionData.icon;
    }
    return void 0;
  }
  /**
   * Get the display title for the active session.
   */
  _getSessionTitle() {
    const sessionData = this.sessionsService.activeSession.get();
    return sessionData?.title.get()?.trim() || void 0;
  }
  /**
   * Get the repository label for the active session.
   */
  _getRepositoryLabel() {
    const sessionData = this.sessionsService.activeSession.get();
    if (sessionData) {
      const workspace = sessionData.workspace.get();
      if (workspace) {
        return workspace.label;
      }
    }
    return void 0;
  }
  _showSessionsPicker() {
    this.commandService.executeCommand(SHOW_SESSIONS_PICKER_COMMAND_ID);
  }
};
SessionsTitleBarWidget = __decorateClass([
  __decorateParam(6, ISessionsManagementService),
  __decorateParam(7, ISessionsService),
  __decorateParam(8, ISessionsProvidersService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, IContextViewService),
  __decorateParam(11, IWorkbenchLayoutService),
  __decorateParam(12, IInstantiationService),
  __decorateParam(13, IContextKeyService),
  __decorateParam(14, IQuickInputService)
], SessionsTitleBarWidget);
let SessionsTitleBarContribution = class extends Disposable {
  constructor(actionViewItemService, instantiationService) {
    super();
    this._register(MenuRegistry.appendMenuItem(Menus.CommandCenter, {
      submenu: Menus.TitleBarSessionTitle,
      title: localize("agentSessionsControl", "Agent Sessions"),
      order: 101,
      when: ContextKeyExpr.and(IsAuxiliaryWindowContext.negate(), SessionsWelcomeVisibleContext.negate())
    }));
    this._register(MenuRegistry.appendMenuItem(Menus.TitleBarSessionTitle, {
      command: {
        id: SHOW_SESSIONS_PICKER_COMMAND_ID,
        title: localize("showSessions", "Show Sessions")
      },
      group: "a_sessions",
      order: 1,
      when: IsAuxiliaryWindowContext.negate()
    }));
    this._register(registerBlockedSessionsHeaderCommands());
    this._register(registerBlockedSessionsHeaderActions());
    this._register(registerBlockedSessionsItemActions());
    this._register(actionViewItemService.register(Menus.CommandCenter, Menus.TitleBarSessionTitle, (action, options) => {
      if (!(action instanceof SubmenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(SessionsTitleBarWidget, action, options, void 0, void 0, void 0, void 0);
    }, void 0));
  }
};
SessionsTitleBarContribution.ID = "workbench.contrib.agentSessionsTitleBar";
SessionsTitleBarContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService)
], SessionsTitleBarContribution);
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: HIDE_BLOCKED_SESSIONS_COMMAND_ID,
  weight: KeybindingWeight.SessionsContrib + 100,
  when: SessionsBlockedSessionsVisibleContext,
  primary: KeyCode.Escape,
  handler: (_accessor, context) => {
    if (context) {
      context.close();
    } else {
      openBlockedSessionsView?.close();
    }
  }
});
export {
  SessionsTitleBarContribution,
  SessionsTitleBarWidget,
  registerBlockedSessionsHeaderActions,
  registerBlockedSessionsHeaderCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXGJyb3dzZXJcXHNlc3Npb25zVGl0bGVCYXJXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvc2Vzc2lvbnNUaXRsZUJhcldpZGdldC5jc3MnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lciwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGdldERvbU5vZGVQYWdlUG9zaXRpb24sIGdldFdpbmRvdywgaXNBbmNlc3RvciwgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQmFzZUFjdGlvblZpZXdJdGVtLCBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgTWVudVJlZ2lzdHJ5LCBTdWJtZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCwgQW5jaG9yUG9zaXRpb24sIElBbmNob3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXlvdXQuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UsIElPcGVuQ29udGV4dFZpZXcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25zQmxvY2tlZFNlc3Npb25zVmlzaWJsZUNvbnRleHQsIFNlc3Npb25zV2VsY29tZVZpc2libGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTSE9XX1NFU1NJT05TX1BJQ0tFUl9DT01NQU5EX0lEIH0gZnJvbSAnLi9zZXNzaW9uc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRVbnRpdGxlZFNlc3Npb25UaXRsZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IEJsb2NrZWRTZXNzaW9ucyB9IGZyb20gJy4uLy4uL2Jsb2NrZWRTZXNzaW9ucy9icm93c2VyL2Jsb2NrZWRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBCbG9ja2VkU2Vzc2lvbnNMaXN0LCBJQmxvY2tlZFNlc3Npb25zSGVhZGVyQWN0aW9uQ29udGV4dCwgcmVnaXN0ZXJCbG9ja2VkU2Vzc2lvbnNJdGVtQWN0aW9ucyB9IGZyb20gJy4vYmxvY2tlZFNlc3Npb25zTGlzdC5qcyc7XG5pbXBvcnQgeyBCbG9ja2VkU2Vzc2lvbnNDSUZpeE1vZGVsIH0gZnJvbSAnLi9ibG9ja2VkU2Vzc2lvbnNDSUZpeE1vZGVsLmpzJztcbmltcG9ydCB7IFNlc3Npb25BY3Rpb25GZWVkYmFjayB9IGZyb20gJy4vc2Vzc2lvbkFjdGlvbkZlZWRiYWNrLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsLmpzJztcbmltcG9ydCB7IEJsb2NrZWRTZXNzaW9uc0luZGljYXRvck1vZGVsLCBSZXF1aXJlc0lucHV0S2luZCB9IGZyb20gJy4vYmxvY2tlZFNlc3Npb25zSW5kaWNhdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgb3BlblNlc3Npb25Ub1RoZVNpZGUgfSBmcm9tICcuL3ZpZXdzL3Nlc3Npb25zVmlldy5qcyc7XG5cbi8qKlxuICogSW50ZXJuYWwgY29tbWFuZCBiZWhpbmQgdGhlIGJsb2NrZWQtc2Vzc2lvbnMgZHJvcGRvd24gaGVhZGVyJ3MgXCJTaG93IEFsbFxuICogU2Vzc2lvbnNcIiBhY3Rpb246IGl0IGRpc21pc3NlcyB0aGUgZHJvcGRvd24gKGEgdHJhbnNpZW50IGNvbnRleHQgdmlldykgYmVmb3JlXG4gKiBvcGVuaW5nIHRoZSBmdWxsIHNlc3Npb25zIHBpY2tlciBzbyB0aGUgcG9wdXAgZG9lc24ndCBsaW5nZXIgYmVoaW5kIGl0LlxuICovXG5jb25zdCBTSE9XX0FMTF9TRVNTSU9OU19GUk9NX0JMT0NLRURfTElTVF9DT01NQU5EX0lEID0gJ3Nlc3Npb25zLmJsb2NrZWRTZXNzaW9ucy5zaG93QWxsU2Vzc2lvbnMnO1xuXG4vKiogSW50ZXJuYWwgY29tbWFuZCBiZWhpbmQgdGhlIGJsb2NrZWQtc2Vzc2lvbnMgZHJvcGRvd24gaGVhZGVyJ3MgYnVsay1pZ25vcmUgYWN0aW9uLiAqL1xuY29uc3QgSUdOT1JFX0FMTF9JTlBVVF9ORUVERURfQ09NTUFORF9JRCA9ICdzZXNzaW9ucy5ibG9ja2VkU2Vzc2lvbnMuaWdub3JlQWxsSW5wdXROZWVkZWQnO1xuXG4vKipcbiAqIEludGVybmFsIGNvbW1hbmQgdGhhdCBkaXNtaXNzZXMgdGhlIGJsb2NrZWQtc2Vzc2lvbnMgZHJvcGRvd24uIEJvdW5kIHRvIEVzY2FwZVxuICogKHNjb3BlZCB0byB7QGxpbmsgU2Vzc2lvbnNCbG9ja2VkU2Vzc2lvbnNWaXNpYmxlQ29udGV4dH0pIHNvIHRoZSBkcm9wZG93biBjYW5cbiAqIGJlIGNsb3NlZCBmcm9tIGFueXdoZXJlIGluIHRoZSBzZXNzaW9ucyB3aW5kb3cgd2hpbGUgaXQgaXMgb3Blbiwgbm90IG9ubHkgd2hlblxuICogZm9jdXMgaGFwcGVucyB0byBiZSBpbnNpZGUgaXQuXG4gKi9cbmNvbnN0IEhJREVfQkxPQ0tFRF9TRVNTSU9OU19DT01NQU5EX0lEID0gJ3Nlc3Npb25zLmJsb2NrZWRTZXNzaW9ucy5oaWRlJztcblxuLyoqIFJlZ2lzdGVyIHRoZSBhY3Rpb25zIHNob3duIGluIHRoZSBibG9ja2VkLXNlc3Npb25zIGRyb3Bkb3duIGhlYWRlciB0b29sYmFyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQmxvY2tlZFNlc3Npb25zSGVhZGVyQWN0aW9ucygpOiBJRGlzcG9zYWJsZSB7XG5cdHJldHVybiBjb21iaW5lZERpc3Bvc2FibGUoXG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVzLkJsb2NrZWRTZXNzaW9uc0hlYWRlciwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogU0hPV19BTExfU0VTU0lPTlNfRlJPTV9CTE9DS0VEX0xJU1RfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaG93QWxsU2Vzc2lvbnMnLCBcIlNob3cgQWxsIFNlc3Npb25zXCIpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmxpc3RTZWxlY3Rpb24sXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiAxLFxuXHRcdH0pLFxuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51cy5CbG9ja2VkU2Vzc2lvbnNIZWFkZXIsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IElHTk9SRV9BTExfSU5QVVRfTkVFREVEX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnaWdub3JlQWxsSW5wdXROZWVkZWQnLCBcIklnbm9yZSBBbGwgSW5wdXQgTmVlZGVkXCIpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmJlbGxTbGFzaCxcblx0XHRcdH0sXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDIsXG5cdFx0fSksXG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVzLkJsb2NrZWRTZXNzaW9uc0hlYWRlciwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogSElERV9CTE9DS0VEX1NFU1NJT05TX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2xvc2VCbG9ja2VkU2Vzc2lvbnMnLCBcIkNsb3NlXCIpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNsb3NlLFxuXHRcdFx0fSxcblx0XHRcdGdyb3VwOiAnel9jbG9zZScsXG5cdFx0XHRvcmRlcjogMSxcblx0XHR9KSxcblx0KTtcbn1cblxuLyoqIFJlZ2lzdGVyIHRoZSBjb21tYW5kcyBpbnZva2VkIGJ5IHRoZSBibG9ja2VkLXNlc3Npb25zIGhlYWRlciB0b29sYmFyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQmxvY2tlZFNlc3Npb25zSGVhZGVyQ29tbWFuZHMoKTogSURpc3Bvc2FibGUge1xuXHRyZXR1cm4gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFNIT1dfQUxMX1NFU1NJT05TX0ZST01fQkxPQ0tFRF9MSVNUX0NPTU1BTkRfSUQsIChfYWNjZXNzb3IsIGNvbnRleHQ6IElCbG9ja2VkU2Vzc2lvbnNIZWFkZXJBY3Rpb25Db250ZXh0KSA9PiB7XG5cdFx0XHRjb250ZXh0LnNob3dBbGxTZXNzaW9ucygpO1xuXHRcdH0pLFxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKElHTk9SRV9BTExfSU5QVVRfTkVFREVEX0NPTU1BTkRfSUQsIChfYWNjZXNzb3IsIGNvbnRleHQ6IElCbG9ja2VkU2Vzc2lvbnNIZWFkZXJBY3Rpb25Db250ZXh0KSA9PiB7XG5cdFx0XHRjb250ZXh0Lmlnbm9yZUFsbFNlc3Npb25zKCk7XG5cdFx0fSksXG5cdCk7XG59XG5cbi8qKlxuICogVGhlIGN1cnJlbnRseS1vcGVuIGJsb2NrZWQtc2Vzc2lvbnMgZHJvcGRvd24sIHNoYXJlZCB3aXRoIHRoZSBFc2NhcGUgY29tbWFuZCBzb1xuICogaXQgY2xvc2VzIHRoaXMgc3BlY2lmaWMgY29udGV4dCB2aWV3LlxuICovXG5sZXQgb3BlbkJsb2NrZWRTZXNzaW9uc1ZpZXc6IElPcGVuQ29udGV4dFZpZXcgfCB1bmRlZmluZWQ7XG5cbi8qKlxuICogTWluaW11bSB3aWR0aCBvZiB0aGUgYmxvY2tlZC1zZXNzaW9ucyBkcm9wZG93biwgaW4gcGl4ZWxzLiBUaGUgZHJvcGRvd24gaXMgYXRcbiAqIGxlYXN0IGFzIHdpZGUgYXMgdGhlIGNvbW1hbmQgY2VudGVyIGJveCBpdCBoYW5ncyBvZmYsIGJ1dCBuZXZlciBuYXJyb3dlciB0aGFuXG4gKiB0aGlzIHNvIGl0cyByb3dzIGhhdmUgcm9vbSB0byBicmVhdGhlLlxuICovXG5jb25zdCBCTE9DS0VEX0RST1BET1dOX01JTl9XSURUSCA9IDU1MDtcblxuLyoqXG4gKiBNYXhpbXVtIHdpZHRoIG9mIHRoZSBibG9ja2VkLXNlc3Npb25zIGRyb3Bkb3duIGFzIGEgZnJhY3Rpb24gb2YgdGhlIHdpbmRvd1xuICogd2lkdGgsIHNvIGl0IG5ldmVyIHNwYW5zIChuZWFybHkpIHRoZSBlbnRpcmUgd2luZG93IG9uIG5hcnJvdyBsYXlvdXRzLlxuICovXG5jb25zdCBCTE9DS0VEX0RST1BET1dOX01BWF9XSURUSF9SQVRJTyA9IDAuOTtcblxuLyoqXG4gKiBTZXNzaW9ucyBUaXRsZSBCYXIgV2lkZ2V0IC0gcmVuZGVycyB0aGUgYWN0aXZlIGNoYXQgc2Vzc2lvblxuICogaW4gdGhlIGNvbW1hbmQgY2VudGVyIG9mIHRoZSBhZ2VudCBzZXNzaW9ucyB3b3JrYmVuY2guXG4gKlxuICogU2hvd3MgdGhlIGN1cnJlbnQgY2hhdCBzZXNzaW9uIGFzIGEgY2xpY2thYmxlIHBpbGwgd2l0aDpcbiAqIC0gS2luZCBpY29uIGF0IHRoZSBiZWdpbm5pbmcgKHByb3ZpZGVyIHR5cGUgaWNvbilcbiAqIC0gUmVwb3NpdG9yeSBmb2xkZXIgbmFtZSBhbmQgYWN0aXZlIGJyYW5jaC93b3JrdHJlZSBuYW1lIHdoZW4gYXZhaWxhYmxlXG4gKlxuICogV2hlbiBhdCBsZWFzdCBvbmUgc2Vzc2lvbiBpcyBibG9ja2VkIChuZWVkcyBpbnB1dCBvciBoYXMgZmFpbGluZyBDSSBjaGVja3MpLFxuICogdGhlIHdpZGdldCBpbnN0ZWFkIGFkb3B0cyBhbiBvcmFuZ2UgXCJOIHNlc3Npb25zIHJlcXVpcmUgaW5wdXRcIiBzdGF0ZSBhbmQgcmV2ZWFscyB0aG9zZSBzZXNzaW9ucyBhcyBhXG4gKiBmbGF0IGxpc3QgaW4gYSBkcm9wZG93biBhbmNob3JlZCBiZWxvdyB0aGUgY29tbWFuZCBjZW50ZXIgYm94LiBBIHNob3J0IGJsaW5rXG4gKiBhbmltYXRpb24gcGxheXMgd2hlbmV2ZXIgYSBuZXcgc2Vzc2lvbiBiZWNvbWVzIGJsb2NrZWQuIEluIGV2ZXJ5IG90aGVyIGNhc2UgaXRcbiAqIGJlaGF2ZXMgYXMgdGhlIGFjdGl2ZS1zZXNzaW9uIHBpbGwgYW5kIG9wZW5zIHRoZSBzZXNzaW9ucyBwaWNrZXIgb24gY2xpY2suXG4gKlxuICogVGhlIHJlcXVpcmVzLWlucHV0IGxvZ2ljICh3aGljaCBibG9ja2VkIHNlc3Npb25zIHRvIHN1cmZhY2UsIHRoZSBob21vZ2VuZW91c1xuICogcmVhc29uLCBsYWJlbHMgYW5kIHdoZW4gdG8gYmxpbmspIGlzIG93bmVkIGJ5IHtAbGluayBCbG9ja2VkU2Vzc2lvbnNJbmRpY2F0b3JNb2RlbH07XG4gKiB0aGlzIHdpZGdldCBvbmx5IHJlbmRlcnMgaXQuXG4gKlxuICogU2Vzc2lvbiBhY3Rpb25zIChjaGFuZ2VzLCB0ZXJtaW5hbCwgZXRjLikgYXJlIHJlbmRlcmVkIHZpYSB0aGVcbiAqIFNlc3Npb25UaXRsZUFjdGlvbnMgbWVudSB0b29sYmFyIG5leHQgdG8gdGhpcyB3aWRnZXQuXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXNzaW9uc1RpdGxlQmFyV2lkZ2V0IGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblxuXHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9keW5hbWljRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdC8qKiBPd25zIHRoZSBibGluayBhbmltYXRpb24ncyBgYW5pbWF0aW9uZW5kYCBsaXN0ZW5lciwga2VwdCBhY3Jvc3MgcmUtcmVuZGVycy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYmxpbmtMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHQvKiogQ2FjaGVkIHJlbmRlciBzdGF0ZSB0byBhdm9pZCB1bm5lY2Vzc2FyeSBET00gcmVidWlsZHMgKi9cblx0cHJpdmF0ZSBfbGFzdFJlbmRlclN0YXRlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqIEd1YXJkIHRvIHByZXZlbnQgcmUtZW50cmFudCByZW5kZXJpbmcgKi9cblx0cHJpdmF0ZSBfaXNSZW5kZXJpbmcgPSBmYWxzZTtcblxuXHQvKiogTW9kZWwgYmVoaW5kIHRoZSBcIk4gc2Vzc2lvbnMgcmVxdWlyZSBpbnB1dFwiIGluZGljYXRvciAoYmxvY2tlZC1zZXNzaW9uIHNldCwgYmxpbmssIGxhYmVscykuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Jsb2NrZWRJbmRpY2F0b3I6IEJsb2NrZWRTZXNzaW9uc0luZGljYXRvck1vZGVsO1xuXG5cdC8qKiBUaGUgY3VycmVudGx5IG9wZW4gYmxvY2tlZC1zZXNzaW9ucyBkcm9wZG93biwgaWYgYW55LiAqL1xuXHRwcml2YXRlIF9vcGVuQ29udGV4dFZpZXc6IElPcGVuQ29udGV4dFZpZXcgfCB1bmRlZmluZWQ7XG5cdC8qKiBUaGUgYmxvY2tlZC1zZXNzaW9ucyBsaXN0IHJlbmRlcmVkIGluc2lkZSB0aGUgb3BlbiBkcm9wZG93biwgaWYgYW55LiAqL1xuXHRwcml2YXRlIF9ibG9ja2VkTGlzdDogQmxvY2tlZFNlc3Npb25zTGlzdCB8IHVuZGVmaW5lZDtcblxuXHQvKiogVHJhY2tzIHdoZXRoZXIgdGhlIGJsb2NrZWQtc2Vzc2lvbnMgZHJvcGRvd24gaXMgb3BlbiAoZHJpdmVzIHRoZSBFc2NhcGUga2V5YmluZGluZykuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Jsb2NrZWRTZXNzaW9uc1Zpc2libGVDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHQvKiogRHJpdmVzIHRoZSB0cmFuc2llbnQgXCJBcHByb3ZlZCBOIHNlc3Npb25zXCIgY29uZmlybWF0aW9uLiBPd25lZCBieSB0aGUgd2lkZ2V0LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uQWN0aW9uRmVlZGJhY2s6IFNlc3Npb25BY3Rpb25GZWVkYmFjaztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IFN1Ym1lbnVJdGVtQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdHNlc3Npb25BY3Rpb25GZWVkYmFjazogU2Vzc2lvbkFjdGlvbkZlZWRiYWNrIHwgdW5kZWZpbmVkLFxuXHRcdGFwcHJvdmFsTW9kZWw6IEFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwgfCB1bmRlZmluZWQsXG5cdFx0YmxvY2tlZFNlc3Npb25zOiBCbG9ja2VkU2Vzc2lvbnMgfCB1bmRlZmluZWQsXG5cdFx0Y2lGaXhNb2RlbDogQmxvY2tlZFNlc3Npb25zQ0lGaXhNb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uLCBvcHRpb25zKTtcblxuXHRcdHRoaXMuX2Jsb2NrZWRTZXNzaW9uc1Zpc2libGVDb250ZXh0ID0gU2Vzc2lvbnNCbG9ja2VkU2Vzc2lvbnNWaXNpYmxlQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Ly8gVGhlIHdpZGdldCBvd25zIHRoZSBhcHByb3ZhbC1mZWVkYmFjayBzdGF0ZTsgdGhlIG9wdGlvbmFsIHBhcmFtZXRlciBpcyBhXG5cdFx0Ly8gdGVzdCBzZWFtIHNvIGZpeHR1cmVzIGNhbiBzdXBwbHkgYSBwcmVzZXQgaW5zdGFuY2UuXG5cdFx0dGhpcy5fc2Vzc2lvbkFjdGlvbkZlZWRiYWNrID0gc2Vzc2lvbkFjdGlvbkZlZWRiYWNrID8/IHRoaXMuX3JlZ2lzdGVyKG5ldyBTZXNzaW9uQWN0aW9uRmVlZGJhY2soKSk7XG5cblx0XHQvLyBUaGUgYmxvY2tlZC1zZXNzaW9uIGluZGljYXRvciBtb2RlbCBvd25zIHRoZSByZXF1aXJlcy1pbnB1dCBsb2dpYyAodGhlXG5cdFx0Ly8gdmlzaWJsZS1maWx0ZXJlZCBibG9ja2VkIHNldCwgdGhlIHJlcXVpcmVzLWlucHV0IGtpbmQsIG9wdGltaXN0aWMgYXBwcm92YWxcblx0XHQvLyBkaXNtaXNzYWxzLCBsYWJlbHMgYW5kIGJsaW5rIGRldGVjdGlvbikuIFRoZSBvcHRpb25hbCBgYXBwcm92YWxNb2RlbGAsXG5cdFx0Ly8gYGJsb2NrZWRTZXNzaW9uc2AgYW5kIGBjaUZpeE1vZGVsYCBhcmUgdGVzdCBzZWFtcyBmb3J3YXJkZWQgdG8gaXQgc29cblx0XHQvLyBmaXh0dXJlcyBjYW4gcHJlc2V0IHRoZW0uXG5cdFx0dGhpcy5fYmxvY2tlZEluZGljYXRvciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQmxvY2tlZFNlc3Npb25zSW5kaWNhdG9yTW9kZWwsIGFwcHJvdmFsTW9kZWwsIGJsb2NrZWRTZXNzaW9ucywgY2lGaXhNb2RlbCkpO1xuXG5cdFx0Ly8gUmVwbGF5IHRoZSBhdHRlbnRpb24gYmxpbmsgd2hlbiB0aGUgbW9kZWwgcmVwb3J0cyBhIGdlbnVpbmVseSBuZXcsIG5vdC15ZXQtXG5cdFx0Ly8gdmlzaWJsZSBibG9jay4gSW52YWxpZGF0ZSB0aGUgY2FjaGVkIHJlbmRlciBzdGF0ZSBzbyB0aGUgaWRlbnRpY2FsIHBpbGwgaXNcblx0XHQvLyByZWJ1aWx0IHdpdGggdGhlIGJsaW5rIGNsYXNzIChzZWUgYF9yZW5kZXJgKS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ibG9ja2VkSW5kaWNhdG9yLm9uRGlkUmVxdWVzdEJsaW5rKCgpID0+IHtcblx0XHRcdHRoaXMuX2xhc3RSZW5kZXJTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlLXJlbmRlciB3aGVuIHRoZSBhY3RpdmUgc2Vzc2lvbidzIHRpdGxlLCB3b3Jrc3BhY2UsIG9yIHF1aWNrLWNoYXQga2luZCBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGEgPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChzZXNzaW9uRGF0YSkge1xuXHRcdFx0XHRzZXNzaW9uRGF0YS50aXRsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHNlc3Npb25EYXRhLndvcmtzcGFjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHNlc3Npb25EYXRhLmlzUXVpY2tDaGF0Py5yZWFkKHJlYWRlcik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXN0UmVuZGVyU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiB0aGUgc2V0IG9mIGJsb2NrZWQgc2Vzc2lvbnMgY2hhbmdlczsgaXQgZmVlZHMgdGhlXG5cdFx0Ly8gXCJOIHNlc3Npb25zIHJlcXVpcmUgaW5wdXRcIiBzdGF0ZS4gS2VlcCBhbiBvcGVuIGRyb3Bkb3duIGluIHN5bmMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYmxvY2tlZCA9IHRoaXMuX2Jsb2NrZWRJbmRpY2F0b3IuYmxvY2tlZFNlc3Npb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25BY3Rpb25GZWVkYmFjay5hcHByb3ZlZENvdW50LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX2Jsb2NrZWRJbmRpY2F0b3IucmVxdWlyZXNJbnB1dEtpbmQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHRoaXMuX29wZW5Db250ZXh0VmlldyAmJiB0aGlzLl9ibG9ja2VkTGlzdCkge1xuXHRcdFx0XHR0aGlzLl9ibG9ja2VkTGlzdC5zZXRTZXNzaW9ucyhibG9ja2VkLm1hcChlbnRyeSA9PiBlbnRyeS5zZXNzaW9uKSk7XG5cdFx0XHRcdHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLmxheW91dCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gc2Vzc2lvbnMgZGF0YSBjaGFuZ2VzIChlLmcuLCBjaGFuZ2VzIGluZm8gdXBkYXRlZClcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucygoKSA9PiB7XG5cdFx0XHR0aGlzLl9sYXN0UmVuZGVyU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiBwcm92aWRlcnMgY2hhbmdlIChhZmZlY3RzIHByb3ZpZGVyIHBpY2tlciB2aXNpYmlsaXR5KVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvdmlkZXJzKCgpID0+IHtcblx0XHRcdHRoaXMuX2xhc3RSZW5kZXJTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEVuc3VyZSBhbnkgb3BlbiBkcm9wZG93biBpcyBjbG9zZWQgd2hlbiB0aGUgd2lkZ2V0IGlzIGRpc3Bvc2VkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9vcGVuQ29udGV4dFZpZXc/LmNsb3NlKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2FnZW50LXNlc3Npb25zLXRpdGxlYmFyLWNvbnRhaW5lcicpO1xuXG5cdFx0Ly8gSW5pdGlhbCByZW5kZXJcblx0XHR0aGlzLl9yZW5kZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldEZvY3VzYWJsZShfZm9jdXNhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gRG9uJ3Qgc2V0IGZvY3VzYWJsZSBvbiB0aGUgY29udGFpbmVyXG5cdH1cblxuXHQvLyBPdmVycmlkZSBvbkNsaWNrIHRvIHByZXZlbnQgdGhlIGJhc2UgY2xhc3MgZnJvbSBydW5uaW5nIHRoZSB1bmRlcmx5aW5nXG5cdC8vIHN1Ym1lbnUgYWN0aW9uIHdoZW4gdGhlIHdpZGdldCBoYW5kbGVzIGNsaWNrcyBpdHNlbGYuXG5cdG92ZXJyaWRlIG9uQ2xpY2soKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3A6IGNsaWNrIGhhbmRsaW5nIGlzIGRvbmUgYnkgdGhlIHBpbGwgaGFuZGxlclxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2lzUmVuZGVyaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzUmVuZGVyaW5nID0gdHJ1ZTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhcHByb3ZlZENvdW50ID0gdGhpcy5fc2Vzc2lvbkFjdGlvbkZlZWRiYWNrLmFwcHJvdmVkQ291bnQuZ2V0KCk7XG5cdFx0XHRjb25zdCBibG9ja2VkQ291bnQgPSB0aGlzLl9ibG9ja2VkSW5kaWNhdG9yLmJsb2NrZWRTZXNzaW9ucy5nZXQoKS5sZW5ndGg7XG5cdFx0XHRjb25zdCByZXF1aXJlc0lucHV0ID0gYmxvY2tlZENvdW50ID4gMDtcblxuXHRcdFx0Ly8gVGhlIHRyYW5zaWVudCBcIkFwcHJvdmVkIE4gc2Vzc2lvbnNcIiBjb25maXJtYXRpb24gdGFrZXMgcHJlY2VkZW5jZSBvdmVyIHRoZVxuXHRcdFx0Ly8gcmVxdWlyZXMtaW5wdXQgc3RhdGUgd2hpbGUgaXQgaXMgc2hvd2luZy5cblx0XHRcdGNvbnN0IHNob3dBcHByb3ZlZCA9IGFwcHJvdmVkQ291bnQgPiAwO1xuXHRcdFx0Y29uc3Qgc2hvd1JlcXVpcmVzSW5wdXQgPSByZXF1aXJlc0lucHV0ICYmICFzaG93QXBwcm92ZWQ7XG5cblx0XHRcdC8vIFRoZSBhdHRlbnRpb24gYmxpbmsgZmlyZXMgb25seSB3aGVuIHRoZSBpbmRpY2F0b3IgbW9kZWwgcmVwb3J0cyBhXG5cdFx0XHQvLyAqZ2VudWluZWx5IG5ldyogYmxvY2tlZCBzZXNzaW9uIHdoaWxlIHRoZSByZXF1aXJlcy1pbnB1dCBzdGF0ZSBpcyBzaG93biBcdTIwMTRcblx0XHRcdC8vIGluY2x1ZGluZyB0aGUgdmVyeSBmaXJzdCBvbmUuIGBjb25zdW1lUGVuZGluZ0JsaW5rYCBpcyBzaG9ydC1jaXJjdWl0ZWQgc29cblx0XHRcdC8vIHRoZSBwZW5kaW5nIGJsaW5rIGlzIG9ubHkgY29uc3VtZWQgd2hlbiBpdCBhY3R1YWxseSBwbGF5czsgbmF2aWdhdGluZ1xuXHRcdFx0Ly8gYmV0d2VlbiBzZXNzaW9ucyAod2hpY2ggY2hhbmdlcyB0aGUgdmlzaWJsZSBzZXQsIG5vdCB0aGUgbW9kZWwpIG5ldmVyIGJsaW5rcy5cblx0XHRcdGNvbnN0IHNob3VsZEJsaW5rID0gc2hvd1JlcXVpcmVzSW5wdXQgJiYgdGhpcy5fYmxvY2tlZEluZGljYXRvci5jb25zdW1lUGVuZGluZ0JsaW5rKCk7XG5cblx0XHRcdGNvbnN0IHJlcXVpcmVzSW5wdXRLaW5kID0gdGhpcy5fYmxvY2tlZEluZGljYXRvci5yZXF1aXJlc0lucHV0S2luZC5nZXQoKTtcblxuXHRcdFx0bGV0IHJlbmRlclN0YXRlOiBzdHJpbmc7XG5cdFx0XHRpZiAoc2hvd0FwcHJvdmVkKSB7XG5cdFx0XHRcdHJlbmRlclN0YXRlID0gYGFwcHJvdmVkfCR7YXBwcm92ZWRDb3VudH1gO1xuXHRcdFx0fSBlbHNlIGlmIChzaG93UmVxdWlyZXNJbnB1dCkge1xuXHRcdFx0XHRyZW5kZXJTdGF0ZSA9IGBibG9ja2VkfCR7YmxvY2tlZENvdW50fXwke3JlcXVpcmVzSW5wdXRLaW5kID8/ICdtaXhlZCd9YDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGljb24gPSB0aGlzLl9nZXRBY3RpdmVTZXNzaW9uSWNvbigpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uVGl0bGUgPSB0aGlzLl9nZXRTZXNzaW9uVGl0bGUoKSA/PyBnZXRVbnRpdGxlZFNlc3Npb25UaXRsZSh0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpPy5pc1F1aWNrQ2hhdD8uZ2V0KCkgPz8gZmFsc2UpO1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VMYWJlbCA9IHRoaXMuX2dldFJlcG9zaXRvcnlMYWJlbCgpO1xuXHRcdFx0XHRyZW5kZXJTdGF0ZSA9IGBub3JtYWx8JHtpY29uPy5pZCA/PyAnJ318JHtzZXNzaW9uVGl0bGUgPz8gJyd9fCR7d29ya3NwYWNlTGFiZWwgPz8gJyd9YDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2tpcCByZS1yZW5kZXIgaWYgc3RhdGUgaGFzbid0IGNoYW5nZWRcblx0XHRcdGlmICh0aGlzLl9sYXN0UmVuZGVyU3RhdGUgPT09IHJlbmRlclN0YXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xhc3RSZW5kZXJTdGF0ZSA9IHJlbmRlclN0YXRlO1xuXG5cdFx0XHQvLyBDbG9zZSB0aGUgb3BlbiBibG9ja2VkLXNlc3Npb25zIGRyb3Bkb3duIG9ubHkgd2hlbiB0aGVyZSBhcmUgbm8gYmxvY2tlZFxuXHRcdFx0Ly8gc2Vzc2lvbnMgbGVmdCB0byBzaG93LiBOb3RlIHRoaXMga2V5cyBvZmYgYHJlcXVpcmVzSW5wdXRgLCBub3Rcblx0XHRcdC8vIGBzaG93UmVxdWlyZXNJbnB1dGA6IGFwcHJvdmluZyBhIHNlc3Npb24gc2hvd3MgdGhlIHRyYW5zaWVudCBncmVlbiBzdGF0ZVxuXHRcdFx0Ly8gKHN1cHByZXNzaW5nIGBzaG93UmVxdWlyZXNJbnB1dGApIGJ1dCB0aGUgZHJvcGRvd24gbXVzdCBzdGF5IG9wZW4gd2hpbGVcblx0XHRcdC8vIG90aGVyIHNlc3Npb25zIHJlbWFpbiBibG9ja2VkIFx1MjAxNCBpdCBqdXN0IGRyb3BzIHRoZSBhcHByb3ZlZCByb3cuXG5cdFx0XHRpZiAoIXJlcXVpcmVzSW5wdXQgJiYgdGhpcy5fb3BlbkNvbnRleHRWaWV3KSB7XG5cdFx0XHRcdHRoaXMuX29wZW5Db250ZXh0Vmlldy5jbG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDbGVhciBleGlzdGluZyBjb250ZW50XG5cdFx0XHRyZXNldCh0aGlzLl9jb250YWluZXIpO1xuXHRcdFx0dGhpcy5fZHluYW1pY0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRcdC8vIFNldCB1cCBjb250YWluZXIgYXMgdGhlIGJ1dHRvbiBkaXJlY3RseVxuXHRcdFx0dGhpcy5fY29udGFpbmVyLnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nKTtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHR0aGlzLl9jb250YWluZXIudGFiSW5kZXggPSAwO1xuXHRcdFx0Ly8gUHJlc2VydmUgYW4gaW4tcHJvZ3Jlc3MgYmxpbmsgd2hlbiByZS1yZW5kZXJpbmcgdGhlIFNBTUUgcmVxdWlyZXMtaW5wdXRcblx0XHRcdC8vIHBpbGwgd2l0aG91dCBhIG5ldyBibGluay4gT3RoZXIgYXV0b3J1bnMgKGUuZy4gb25EaWRDaGFuZ2VTZXNzaW9ucylcblx0XHRcdC8vIGludmFsaWRhdGUgdGhlIGNhY2hlZCByZW5kZXIgc3RhdGUgYW5kIGZvcmNlIGEgcmVkdW5kYW50IHJlYnVpbGQgb2YgdGhlXG5cdFx0XHQvLyBpZGVudGljYWwgcGlsbDsgd2l0aG91dCB0aGlzIGd1YXJkIHRoYXQgcmVidWlsZCB3b3VsZCBzdHJpcCB0aGUgZnJlc2hseS1cblx0XHRcdC8vIGFkZGVkIGJsaW5rIGNsYXNzIGFuZCBjdXQgdGhlIGFuaW1hdGlvbiBzaG9ydCBcdTIwMTQgd2hpY2ggaXMgd2h5IHRoZSBmaXJzdFxuXHRcdFx0Ly8gXCIxIHNlc3Npb24gcmVxdWlyZXMgaW5wdXRcIiBuZXZlciBhcHBlYXJlZCB0byBhbmltYXRlLlxuXHRcdFx0aWYgKCEoc2hvd1JlcXVpcmVzSW5wdXQgJiYgIXNob3VsZEJsaW5rKSkge1xuXHRcdFx0XHR0aGlzLl9jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItYmxpbmsnKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdhZ2VudC1zZXNzaW9ucy10aXRsZWJhci1yZXF1aXJlcy1pbnB1dCcsIHNob3dSZXF1aXJlc0lucHV0KTtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdhZ2VudC1zZXNzaW9ucy10aXRsZWJhci1hcHByb3ZlZCcsIHNob3dBcHByb3ZlZCk7XG5cblx0XHRcdGlmIChzaG93QXBwcm92ZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyQXBwcm92ZWQoYXBwcm92ZWRDb3VudCk7XG5cdFx0XHR9IGVsc2UgaWYgKHNob3dSZXF1aXJlc0lucHV0KSB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlclJlcXVpcmVzSW5wdXQoYmxvY2tlZENvdW50LCByZXF1aXJlc0lucHV0S2luZCwgc2hvdWxkQmxpbmspO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyQWN0aXZlU2Vzc2lvbigpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pc1JlbmRlcmluZyA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXIgdGhlIGFjdGl2ZS1zZXNzaW9uIHBpbGw6IGljb24gKyB0aXRsZSArIHdvcmtzcGFjZS4gQ2xpY2tpbmcgb3BlbnMgdGhlXG5cdCAqIHNlc3Npb25zIHBpY2tlci5cblx0ICovXG5cdHByaXZhdGUgX3JlbmRlckFjdGl2ZVNlc3Npb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5fY29udGFpbmVyITtcblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnNTaG93U2Vzc2lvbnMnLCBcIlNob3cgU2Vzc2lvbnNcIikpO1xuXG5cdFx0Y29uc3QgaWNvbiA9IHRoaXMuX2dldEFjdGl2ZVNlc3Npb25JY29uKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblRpdGxlID0gdGhpcy5fZ2V0U2Vzc2lvblRpdGxlKCkgPz8gZ2V0VW50aXRsZWRTZXNzaW9uVGl0bGUodGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uaXNRdWlja0NoYXQ/LmdldCgpID8/IGZhbHNlKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VMYWJlbCA9IHRoaXMuX2dldFJlcG9zaXRvcnlMYWJlbCgpO1xuXG5cdFx0Ly8gU2Vzc2lvbiBwaWxsOiBpY29uICsgdGl0bGUgKyB3b3Jrc3BhY2UgdG9nZXRoZXJcblx0XHRjb25zdCBzZXNzaW9uUGlsbCA9ICQoJ2Rpdi5hZ2VudC1zZXNzaW9ucy10aXRsZWJhci1waWxsJyk7XG5cblx0XHQvLyBDZW50ZXIgZ3JvdXA6IGljb24gKyB0aXRsZSArIHdvcmtzcGFjZSBuYW1lXG5cdFx0Y29uc3QgY2VudGVyR3JvdXAgPSAkKCdkaXYuYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItY2VudGVyJyk7XG5cblx0XHQvLyBLaW5kIGljb24gYXQgdGhlIGJlZ2lubmluZ1xuXHRcdGlmIChpY29uKSB7XG5cdFx0XHRjb25zdCBpY29uRWwgPSAkKCdkaXYuYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItaWNvbicgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29uKSk7XG5cdFx0XHRjZW50ZXJHcm91cC5hcHBlbmRDaGlsZChpY29uRWwpO1xuXHRcdH1cblxuXHRcdC8vIFNlc3Npb24gdGl0bGUgc2hvd24gbmV4dCB0byB0aGUgaWNvblxuXHRcdGlmIChzZXNzaW9uVGl0bGUpIHtcblx0XHRcdGNvbnN0IHRpdGxlRWwgPSAkKCdkaXYuYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItdGl0bGUnKTtcblx0XHRcdHRpdGxlRWwudGV4dENvbnRlbnQgPSBzZXNzaW9uVGl0bGU7XG5cdFx0XHRjZW50ZXJHcm91cC5hcHBlbmRDaGlsZCh0aXRsZUVsKTtcblx0XHR9XG5cblx0XHQvLyBXb3Jrc3BhY2UgbmFtZSBzaG93biBhZnRlciB0aGUgc2Vzc2lvbiB0aXRsZVxuXHRcdGlmICh3b3Jrc3BhY2VMYWJlbCkge1xuXHRcdFx0Y29uc3Qgc2VwYXJhdG9yRWwgPSAkKCdkaXYuYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItc2VwYXJhdG9yJyk7XG5cdFx0XHRjZW50ZXJHcm91cC5hcHBlbmRDaGlsZChzZXBhcmF0b3JFbCk7XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZUVsID0gJCgnZGl2LmFnZW50LXNlc3Npb25zLXRpdGxlYmFyLXdvcmtzcGFjZScpO1xuXHRcdFx0d29ya3NwYWNlRWwudGV4dENvbnRlbnQgPSB3b3Jrc3BhY2VMYWJlbDtcblx0XHRcdGNlbnRlckdyb3VwLmFwcGVuZENoaWxkKHdvcmtzcGFjZUVsKTtcblx0XHR9XG5cblx0XHRzZXNzaW9uUGlsbC5hcHBlbmRDaGlsZChjZW50ZXJHcm91cCk7XG5cblx0XHQvLyBDbGljayBoYW5kbGVyIG9uIHBpbGxcblx0XHR0aGlzLl9keW5hbWljRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIoc2Vzc2lvblBpbGwsIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9keW5hbWljRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihzZXNzaW9uUGlsbCwgRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuX3Nob3dTZXNzaW9uc1BpY2tlcigpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChzZXNzaW9uUGlsbCk7XG5cblx0XHQvLyBLZXlib2FyZCBoYW5kbGVyXG5cdFx0dGhpcy5fZHluYW1pY0Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoY29udGFpbmVyLCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX3Nob3dTZXNzaW9uc1BpY2tlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXIgdGhlIHJlcXVpcmVzLWlucHV0IHBpbGwuIENsaWNraW5nIHRvZ2dsZXMgYSBkcm9wZG93biB0aGF0IGxpc3RzIHRoZVxuXHQgKiBibG9ja2VkIHNlc3Npb25zIGJlbG93IHRoZSBjb21tYW5kIGNlbnRlciBib3guXG5cdCAqL1xuXHRwcml2YXRlIF9yZW5kZXJSZXF1aXJlc0lucHV0KGNvdW50OiBudW1iZXIsIGtpbmQ6IFJlcXVpcmVzSW5wdXRLaW5kIHwgdW5kZWZpbmVkLCBzaG91bGRCbGluazogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuX2NvbnRhaW5lciE7XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLl9ibG9ja2VkSW5kaWNhdG9yLmdldFJlcXVpcmVzSW5wdXRMYWJlbChjb3VudCwga2luZCk7XG5cdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxhYmVsKTtcblxuXHRcdGNvbnN0IHBpbGwgPSAkKCdkaXYuYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItcGlsbCcpO1xuXHRcdGNvbnN0IGxhYmVsRWwgPSAkKCdkaXYuYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItcmVxdWlyZXMtaW5wdXQtbGFiZWwnKTtcblx0XHRsYWJlbEVsLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0cGlsbC5hcHBlbmRDaGlsZChsYWJlbEVsKTtcblxuXHRcdHRoaXMuX2R5bmFtaWNEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lcihwaWxsLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fZHluYW1pY0Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIocGlsbCwgRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuX3RvZ2dsZUJsb2NrZWRTZXNzaW9ucygpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChwaWxsKTtcblxuXHRcdHRoaXMuX2R5bmFtaWNEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl90b2dnbGVCbG9ja2VkU2Vzc2lvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoc2hvdWxkQmxpbmspIHtcblx0XHRcdHRoaXMuX3RyaWdnZXJBdHRlbnRpb25CbGluaygpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXIgdGhlIHRyYW5zaWVudCBncmVlbiBcIkFwcHJvdmVkIE4gc2Vzc2lvbnNcIiBjb25maXJtYXRpb24gc2hvd24gYnJpZWZseVxuXHQgKiBhZnRlciB0aGUgdXNlciBhcHByb3ZlcyBvbmUgb3IgbW9yZSBzZXNzaW9ucycgcGVuZGluZyBhY3Rpb25zIGZyb20gdGhlIGxpc3QuXG5cdCAqL1xuXHRwcml2YXRlIF9yZW5kZXJBcHByb3ZlZChjb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5fY29udGFpbmVyITtcblx0XHRjb25zdCBsYWJlbCA9IGNvdW50ID09PSAxXG5cdFx0XHQ/IGxvY2FsaXplKCdvbmVTZXNzaW9uQXBwcm92ZWQnLCBcIkFwcHJvdmVkIDEgc2Vzc2lvblwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnblNlc3Npb25zQXBwcm92ZWQnLCBcIkFwcHJvdmVkIHswfSBzZXNzaW9uc1wiLCBjb3VudCk7XG5cdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxhYmVsKTtcblxuXHRcdGNvbnN0IHBpbGwgPSAkKCdkaXYuYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItcGlsbCcpO1xuXHRcdGNvbnN0IGxhYmVsRWwgPSAkKCdkaXYuYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItYXBwcm92ZWQtbGFiZWwnKTtcblx0XHRsYWJlbEVsLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0cGlsbC5hcHBlbmRDaGlsZChsYWJlbEVsKTtcblxuXHRcdC8vIFRoZSBjb25maXJtYXRpb24gaXMgdHJhbnNpZW50IGJ1dCBzdGF5cyBjbGlja2FibGU6IGNsaWNraW5nIGRvZXMgd2hhdGV2ZXJcblx0XHQvLyB0aGUgd2lkZ2V0J3MgdW5kZXJseWluZyAobm9uLWFwcHJvdmVkKSBzdGF0ZSB3b3VsZCBkby5cblx0XHR0aGlzLl9keW5hbWljRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIocGlsbCwgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2R5bmFtaWNEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBpbGwsIEV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9hY3RpdmF0ZURlZmF1bHRBY3Rpb24oKTtcblx0XHR9KSk7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQocGlsbCk7XG5cblx0XHR0aGlzLl9keW5hbWljRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fYWN0aXZhdGVEZWZhdWx0QWN0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFjdGl2YXRlIHRoZSB3aWRnZXQgYXMgaXRzIG5vbi1hcHByb3ZlZCBzdGF0ZSB3b3VsZDogcmV2ZWFsIHRoZSBibG9ja2VkXG5cdCAqIHNlc3Npb25zIHdoZW4gdGhlIHJlcXVpcmVzLWlucHV0IHN0YXRlIGFwcGxpZXMsIG90aGVyd2lzZSB0aGUgc2Vzc2lvbnMgcGlja2VyLlxuXHQgKi9cblx0cHJpdmF0ZSBfYWN0aXZhdGVEZWZhdWx0QWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlcXVpcmVzSW5wdXQgPSB0aGlzLl9ibG9ja2VkSW5kaWNhdG9yLmJsb2NrZWRTZXNzaW9ucy5nZXQoKS5sZW5ndGggPiAwO1xuXHRcdGlmIChyZXF1aXJlc0lucHV0KSB7XG5cdFx0XHR0aGlzLl90b2dnbGVCbG9ja2VkU2Vzc2lvbnMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2hvd1Nlc3Npb25zUGlja2VyKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlc3RhcnQgdGhlIGF0dGVudGlvbiBibGluayBhbmltYXRpb24gb24gdGhlIGNvbW1hbmQgY2VudGVyIGJveC4gUmUtYWRkaW5nXG5cdCAqIHRoZSBjbGFzcyBhZnRlciBhIGZvcmNlZCByZWZsb3cgZ3VhcmFudGVlcyB0aGUgQ1NTIGFuaW1hdGlvbiByZXBsYXlzIGV2ZW5cblx0ICogd2hlbiB0aGUgY29udGFpbmVyIGVsZW1lbnQgcGVyc2lzdHMgYWNyb3NzIHJlbmRlcnMuXG5cdCAqL1xuXHRwcml2YXRlIF90cmlnZ2VyQXR0ZW50aW9uQmxpbmsoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5fY29udGFpbmVyO1xuXHRcdGlmICghY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdhZ2VudC1zZXNzaW9ucy10aXRsZWJhci1ibGluaycpO1xuXHRcdGNvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTsgLy8gZm9yY2UgcmVmbG93IHNvIHRoZSBhbmltYXRpb24gcmVzdGFydHNcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYWdlbnQtc2Vzc2lvbnMtdGl0bGViYXItYmxpbmsnKTtcblx0XHQvLyBPd24gdGhlIGxpc3RlbmVyIG91dHNpZGUgYF9keW5hbWljRGlzcG9zYWJsZXNgIChjbGVhcmVkIG9uIGV2ZXJ5IHJlbmRlcikgc28gYVxuXHRcdC8vIHJlZHVuZGFudCByZS1yZW5kZXIgY2FuJ3QgZHJvcCBpdCBiZWZvcmUgdGhlIGFuaW1hdGlvbiBmaW5pc2hlcy5cblx0XHR0aGlzLl9ibGlua0xpc3RlbmVyLnZhbHVlID0gYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgJ2FuaW1hdGlvbmVuZCcsICgpID0+IHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdhZ2VudC1zZXNzaW9ucy10aXRsZWJhci1ibGluaycpO1xuXHRcdFx0dGhpcy5fYmxpbmtMaXN0ZW5lci5jbGVhcigpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRvZ2dsZSB0aGUgYmxvY2tlZC1zZXNzaW9ucyBkcm9wZG93biBvcGVuL2Nsb3NlZC5cblx0ICovXG5cdHByaXZhdGUgX3RvZ2dsZUJsb2NrZWRTZXNzaW9ucygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fb3BlbkNvbnRleHRWaWV3KSB7XG5cdFx0XHR0aGlzLl9vcGVuQ29udGV4dFZpZXcuY2xvc2UoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2hvd0Jsb2NrZWRTZXNzaW9ucygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3cgdGhlIGJsb2NrZWQgc2Vzc2lvbnMgYXMgYSBmbGF0IGxpc3QgaW4gYSBkcm9wZG93biBhbmNob3JlZCBiZWxvdyB0aGVcblx0ICogY29tbWFuZCBjZW50ZXIgYm94LlxuXHQgKi9cblx0cHJpdmF0ZSBfc2hvd0Jsb2NrZWRTZXNzaW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLl9jb250YWluZXI7XG5cdFx0aWYgKCFjb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2Jsb2NrZWRJbmRpY2F0b3IuYmxvY2tlZFNlc3Npb25zLmdldCgpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE1hdGNoIHRoZSBkcm9wZG93biB3aWR0aCB0byB0aGUgY29tbWFuZCBjZW50ZXIgYm94IGl0IGhhbmdzIG9mZiwgYnV0IGtlZXBcblx0XHQvLyBpdCB3aXRoaW4gYSBzZW5zaWJsZSBtaW4vbWF4IHNvIGl0IHN0YXlzIHJlYWRhYmxlIG9uIHdpZGUgbGF5b3V0cyBhbmRcblx0XHQvLyBkb2Vzbid0IG92ZXJmbG93IG9uIG5hcnJvdyBvbmVzLlxuXHRcdGNvbnN0IHdpZHRoID0gdGhpcy5fY29tcHV0ZUJsb2NrZWREcm9wZG93bldpZHRoKGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9vcGVuQ29udGV4dFZpZXcgPSB0aGlzLmNvbnRleHRWaWV3U2VydmljZS5zaG93Q29udGV4dFZpZXcoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiB0aGlzLl9nZXRCbG9ja2VkRHJvcGRvd25BbmNob3IoY29udGFpbmVyKSxcblx0XHRcdGFuY2hvckFsaWdubWVudDogQW5jaG9yQWxpZ25tZW50LkxFRlQsXG5cdFx0XHRhbmNob3JQb3NpdGlvbjogQW5jaG9yUG9zaXRpb24uQkVMT1csXG5cdFx0XHRyZW5kZXI6ICh2aWV3Q29udGFpbmVyKTogSURpc3Bvc2FibGUgPT4ge1xuXHRcdFx0XHRjb25zdCBsaXN0ID0gc3RvcmUuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQmxvY2tlZFNlc3Npb25zTGlzdCwgdmlld0NvbnRhaW5lciwge1xuXHRcdFx0XHRcdHdpZHRoLFxuXHRcdFx0XHRcdGFwcHJvdmFsTW9kZWw6IHRoaXMuX2Jsb2NrZWRJbmRpY2F0b3IuYXBwcm92YWxNb2RlbCxcblx0XHRcdFx0XHRjaUZpeE1vZGVsOiB0aGlzLl9ibG9ja2VkSW5kaWNhdG9yLmNpRml4TW9kZWwsXG5cdFx0XHRcdFx0b25TZXNzaW9uT3BlbjogKHJlc291cmNlLCBwcmVzZXJ2ZUZvY3VzLCBzaWRlQnlTaWRlKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vcGVuQ29udGV4dFZpZXc/LmNsb3NlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9vcGVuQmxvY2tlZFNlc3Npb24ocmVzb3VyY2UsIHByZXNlcnZlRm9jdXMsIHNpZGVCeVNpZGUpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0b25JZ25vcmVTZXNzaW9uOiBzZXNzaW9uID0+IHRoaXMuX2Jsb2NrZWRJbmRpY2F0b3IuaWdub3JlU2Vzc2lvbihzZXNzaW9uKSxcblx0XHRcdFx0XHRvblNob3dBbGxTZXNzaW9uczogKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fb3BlbkNvbnRleHRWaWV3Py5jbG9zZSgpO1xuXHRcdFx0XHRcdFx0dGhpcy5fc2hvd1Nlc3Npb25zUGlja2VyKCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRvbklnbm9yZUFsbFNlc3Npb25zOiAoKSA9PiB0aGlzLl9ibG9ja2VkSW5kaWNhdG9yLmlnbm9yZUFsbFNlc3Npb25zKCksXG5cdFx0XHRcdFx0b25DbG9zZTogKCkgPT4gdGhpcy5fb3BlbkNvbnRleHRWaWV3Py5jbG9zZSgpLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGxpc3Quc2V0U2Vzc2lvbnModGhpcy5fYmxvY2tlZEluZGljYXRvci5ibG9ja2VkU2Vzc2lvbnMuZ2V0KCkubWFwKGVudHJ5ID0+IGVudHJ5LnNlc3Npb24pKTtcblx0XHRcdFx0c3RvcmUuYWRkKGxpc3Qub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCgpID0+IHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLmxheW91dCgpKSk7XG5cdFx0XHRcdHN0b3JlLmFkZChsaXN0Lm9uRGlkQXBwcm92ZVNlc3Npb24oYXBwcm92ZWQgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2Jsb2NrZWRJbmRpY2F0b3IuZGlzbWlzc0FwcHJvdmFsKGFwcHJvdmVkKTtcblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uQWN0aW9uRmVlZGJhY2subm90aWZ5QXBwcm92ZWQoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIEtlZXAgdGhlIGRyb3Bkb3duIHdpZHRoIG1hdGNoZWQgdG8gdGhlIGNvbW1hbmQgY2VudGVyIGJveCBhcyB0aGVcblx0XHRcdFx0Ly8gd2luZG93IHJlc2l6ZXMgKHRoZSBjb21tYW5kIGNlbnRlciByZWZsb3dzIHRvIGEgbmV3IHdpZHRoLCBhbmQgdGhlXG5cdFx0XHRcdC8vIG1pbi9tYXggY2xhbXAgdHJhY2tzIHRoZSBuZXcgd2luZG93IHdpZHRoKS5cblx0XHRcdFx0c3RvcmUuYWRkKHRoaXMubGF5b3V0U2VydmljZS5vbkRpZExheW91dEFjdGl2ZUNvbnRhaW5lcigoKSA9PiB7XG5cdFx0XHRcdFx0bGlzdC5zZXRXaWR0aCh0aGlzLl9jb21wdXRlQmxvY2tlZERyb3Bkb3duV2lkdGgoY29udGFpbmVyKSk7XG5cdFx0XHRcdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UubGF5b3V0KCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBEaXNtaXNzIHRoZSBkcm9wZG93biB3aGVuIGEgcXVpY2sgcGljayBvcGVucyBvbiB0b3Agb2YgaXQgKGUuZy4gdGhlXG5cdFx0XHRcdC8vIHNlc3Npb25zIHBpY2tlciksIHNvIGl0IGRvZXNuJ3QgbGluZ2VyIGJlaGluZCB0aGUgcXVpY2sgaW5wdXQuIENsb3NlXG5cdFx0XHRcdC8vIG91ciBzcGVjaWZpYyBjb250ZXh0IHZpZXcgcmF0aGVyIHRoYW4gd2hhdGV2ZXIgaGFwcGVucyB0byBiZSBvcGVuLlxuXHRcdFx0XHRzdG9yZS5hZGQodGhpcy5xdWlja0lucHV0U2VydmljZS5vblNob3coKCkgPT4gdGhpcy5fb3BlbkNvbnRleHRWaWV3Py5jbG9zZSgpKSk7XG5cblx0XHRcdFx0dGhpcy5fYmxvY2tlZExpc3QgPSBsaXN0O1xuXHRcdFx0XHRyZXR1cm4gc3RvcmU7XG5cdFx0XHR9LFxuXHRcdFx0Zm9jdXM6ICgpID0+IHRoaXMuX2Jsb2NrZWRMaXN0Py5mb2N1cygpLFxuXHRcdFx0b25ET01FdmVudDogKGU6IEV2ZW50KSA9PiB7XG5cdFx0XHRcdC8vIERpc21pc3Mgb24gYSBjbGljayBvdXRzaWRlIHRoZSBkcm9wZG93bi4gQ2xpY2tzIG9uIHRoZSBhbmNob3IgYXJlXG5cdFx0XHRcdC8vIGlnbm9yZWQgaGVyZSBiZWNhdXNlIHRoZSBhbmNob3IgdG9nZ2xlcyB0aGUgZHJvcGRvd24gaXRzZWxmLiBFc2NhcGVcblx0XHRcdFx0Ly8gaXMgaGFuZGxlZCBieSBhIGRlZGljYXRlZCBoaWdoLXdlaWdodCBrZXliaW5kaW5nIChzZWVcblx0XHRcdFx0Ly8gSElERV9CTE9DS0VEX1NFU1NJT05TX0NPTU1BTkRfSUQpIHNvIGl0IGRpc21pc3NlcyB0aGUgZHJvcGRvd24gZXZlblxuXHRcdFx0XHQvLyB3aGVuIGZvY3VzIGlzIG91dHNpZGUgb2YgaXQuXG5cdFx0XHRcdGlmIChlLnR5cGUgPT09IEV2ZW50VHlwZS5DTElDSykge1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRcdFx0XHRpZiAodGFyZ2V0XG5cdFx0XHRcdFx0XHQmJiAhaXNBbmNlc3Rvcih0YXJnZXQsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLmdldENvbnRleHRWaWV3RWxlbWVudCgpKVxuXHRcdFx0XHRcdFx0JiYgIWlzQW5jZXN0b3IodGFyZ2V0LCBjb250YWluZXIpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vcGVuQ29udGV4dFZpZXc/LmNsb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2Jsb2NrZWRTZXNzaW9uc1Zpc2libGVDb250ZXh0LnNldChmYWxzZSk7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fb3BlbkNvbnRleHRWaWV3ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRvcGVuQmxvY2tlZFNlc3Npb25zVmlldyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fYmxvY2tlZExpc3QgPSB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0b3BlbkJsb2NrZWRTZXNzaW9uc1ZpZXcgPSB0aGlzLl9vcGVuQ29udGV4dFZpZXc7XG5cdFx0dGhpcy5fYmxvY2tlZFNlc3Npb25zVmlzaWJsZUNvbnRleHQuc2V0KHRydWUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbXB1dGUgdGhlIHdpZHRoIG9mIHRoZSBibG9ja2VkLXNlc3Npb25zIGRyb3Bkb3duOiBhdCBsZWFzdCBhcyB3aWRlIGFzIHRoZVxuXHQgKiBjb21tYW5kIGNlbnRlciBib3ggKHRoZSBhbmNob3IpIGFuZCB7QGxpbmsgQkxPQ0tFRF9EUk9QRE9XTl9NSU5fV0lEVEh9LCBidXRcblx0ICogbmV2ZXIgd2lkZXIgdGhhbiB7QGxpbmsgQkxPQ0tFRF9EUk9QRE9XTl9NQVhfV0lEVEhfUkFUSU99IG9mIHRoZSB3aW5kb3cgc28gaXRcblx0ICogc3RheXMgd2l0aGluIHRoZSB2aWV3cG9ydCBvbiBuYXJyb3cgbGF5b3V0cy5cblx0ICovXG5cdHByaXZhdGUgX2NvbXB1dGVCbG9ja2VkRHJvcGRvd25XaWR0aChjb250YWluZXI6IEhUTUxFbGVtZW50KTogbnVtYmVyIHtcblx0XHRjb25zdCBhbmNob3JXaWR0aCA9IGdldERvbU5vZGVQYWdlUG9zaXRpb24oY29udGFpbmVyKS53aWR0aDtcblx0XHRjb25zdCB3aW5kb3dXaWR0aCA9IGdldFdpbmRvdyhjb250YWluZXIpLmlubmVyV2lkdGg7XG5cdFx0Y29uc3QgbWluV2lkdGggPSBNYXRoLm1heChhbmNob3JXaWR0aCwgQkxPQ0tFRF9EUk9QRE9XTl9NSU5fV0lEVEgpO1xuXHRcdGNvbnN0IG1heFdpZHRoID0gd2luZG93V2lkdGggKiBCTE9DS0VEX0RST1BET1dOX01BWF9XSURUSF9SQVRJTztcblx0XHRyZXR1cm4gTWF0aC5yb3VuZChNYXRoLm1pbihtaW5XaWR0aCwgbWF4V2lkdGgpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBbmNob3IgdGhlIGJsb2NrZWQtc2Vzc2lvbnMgZHJvcGRvd24gc28gaXQgaXMgaG9yaXpvbnRhbGx5IGNlbnRlcmVkIG9uIHRoZVxuXHQgKiBjb21tYW5kIGNlbnRlciBib3guIEJlY2F1c2UgdGhlIGRyb3Bkb3duIGNhbiBiZSB3aWRlciB0aGFuIHRoZSBib3gsIHdlIGhhbmRcblx0ICogdGhlIGNvbnRleHQgdmlldyBhIHplcm8td2lkdGggYW5jaG9yIHBvc2l0aW9uZWQgYXQgdGhlIGRyb3Bkb3duJ3MgdGFyZ2V0XG5cdCAqIGxlZnQgZWRnZSAodGhlIGJveCBjZW50ZXIgbWludXMgaGFsZiB0aGUgZHJvcGRvd24gd2lkdGgpLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0QmxvY2tlZERyb3Bkb3duQW5jaG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJQW5jaG9yIHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IGdldERvbU5vZGVQYWdlUG9zaXRpb24oY29udGFpbmVyKTtcblx0XHRjb25zdCB3aWR0aCA9IHRoaXMuX2NvbXB1dGVCbG9ja2VkRHJvcGRvd25XaWR0aChjb250YWluZXIpO1xuXHRcdGNvbnN0IGNlbnRlclggPSBwb3NpdGlvbi5sZWZ0ICsgcG9zaXRpb24ud2lkdGggLyAyO1xuXHRcdHJldHVybiB7XG5cdFx0XHR4OiBNYXRoLnJvdW5kKGNlbnRlclggLSB3aWR0aCAvIDIpLFxuXHRcdFx0eTogcG9zaXRpb24udG9wLFxuXHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRoZWlnaHQ6IHBvc2l0aW9uLmhlaWdodCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfb3BlbkJsb2NrZWRTZXNzaW9uKHJlc291cmNlOiBVUkksIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4sIHNpZGVCeVNpZGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoc2lkZUJ5U2lkZSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uKHJlc291cmNlKTtcblx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdG9wZW5TZXNzaW9uVG9UaGVTaWRlKHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLCBzZXNzaW9uLCB7IHByZXNlcnZlRm9jdXMgfSkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLm9wZW5TZXNzaW9uKHJlc291cmNlLCB7IHByZXNlcnZlRm9jdXMgfSkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgaWNvbiBmb3IgdGhlIGFjdGl2ZSBzZXNzaW9uJ3MgdHlwZS5cblx0ICovXG5cdHByaXZhdGUgX2dldEFjdGl2ZVNlc3Npb25JY29uKCk6IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkRhdGEgPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGlmIChzZXNzaW9uRGF0YSkge1xuXHRcdFx0cmV0dXJuIHNlc3Npb25EYXRhLmljb247XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBkaXNwbGF5IHRpdGxlIGZvciB0aGUgYWN0aXZlIHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRTZXNzaW9uVGl0bGUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uRGF0YSA9IHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0cmV0dXJuIHNlc3Npb25EYXRhPy50aXRsZS5nZXQoKT8udHJpbSgpIHx8IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHJlcG9zaXRvcnkgbGFiZWwgZm9yIHRoZSBhY3RpdmUgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgX2dldFJlcG9zaXRvcnlMYWJlbCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb25EYXRhID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoc2Vzc2lvbkRhdGEpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHNlc3Npb25EYXRhLndvcmtzcGFjZS5nZXQoKTtcblx0XHRcdGlmICh3b3Jrc3BhY2UpIHtcblx0XHRcdFx0cmV0dXJuIHdvcmtzcGFjZS5sYWJlbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dTZXNzaW9uc1BpY2tlcigpOiB2b2lkIHtcblx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFNIT1dfU0VTU0lPTlNfUElDS0VSX0NPTU1BTkRfSUQpO1xuXHR9XG59XG5cbi8qKlxuICogUHJvdmlkZXMgY3VzdG9tIHJlbmRlcmluZyBmb3IgdGhlIHNlc3Npb25zIHRpdGxlIGJhciB3aWRnZXRcbiAqIGluIHRoZSBjb21tYW5kIGNlbnRlci4gVXNlcyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIHRvIHJlbmRlciBhIGN1c3RvbSB3aWRnZXRcbiAqIGZvciB0aGUgVGl0bGVCYXJDb250cm9sTWVudSBzdWJtZW51LlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbnNUaXRsZUJhckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuYWdlbnRTZXNzaW9uc1RpdGxlQmFyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIHN1Ym1lbnUgaXRlbSBpbiB0aGUgQWdlbnQgU2Vzc2lvbnMgY29tbWFuZCBjZW50ZXJcblx0XHR0aGlzLl9yZWdpc3RlcihNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudXMuQ29tbWFuZENlbnRlciwge1xuXHRcdFx0c3VibWVudTogTWVudXMuVGl0bGVCYXJTZXNzaW9uVGl0bGUsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnNDb250cm9sJywgXCJBZ2VudCBTZXNzaW9uc1wiKSxcblx0XHRcdG9yZGVyOiAxMDEsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLCBTZXNzaW9uc1dlbGNvbWVWaXNpYmxlQ29udGV4dC5uZWdhdGUoKSlcblx0XHR9KSk7XG5cblx0XHQvLyBSZWdpc3RlciBhIHBsYWNlaG9sZGVyIGFjdGlvbiBzbyB0aGUgc3VibWVudSBhcHBlYXJzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVzLlRpdGxlQmFyU2Vzc2lvblRpdGxlLCB7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBTSE9XX1NFU1NJT05TX1BJQ0tFUl9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Nob3dTZXNzaW9ucycsIFwiU2hvdyBTZXNzaW9uc1wiKSxcblx0XHRcdH0sXG5cdFx0XHRncm91cDogJ2Ffc2Vzc2lvbnMnLFxuXHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR3aGVuOiBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQubmVnYXRlKClcblx0XHR9KSk7XG5cblx0XHQvLyBUaGUgYmxvY2tlZC1zZXNzaW9ucyBkcm9wZG93biBoZWFkZXIncyBcIlNob3cgQWxsIFNlc3Npb25zXCIgYWN0aW9uIGRpc21pc3Nlc1xuXHRcdC8vIHRoZSBkcm9wZG93biAoYSB0cmFuc2llbnQgY29udGV4dCB2aWV3KSBiZWZvcmUgb3BlbmluZyB0aGUgZnVsbCBzZXNzaW9uc1xuXHRcdC8vIHBpY2tlciwgc28gdGhlIHBvcHVwIGRvZXNuJ3QgbGluZ2VyIGJlaGluZCBpdC5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckJsb2NrZWRTZXNzaW9uc0hlYWRlckNvbW1hbmRzKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQmxvY2tlZFNlc3Npb25zSGVhZGVyQWN0aW9ucygpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckJsb2NrZWRTZXNzaW9uc0l0ZW1BY3Rpb25zKCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKE1lbnVzLkNvbW1hbmRDZW50ZXIsIE1lbnVzLlRpdGxlQmFyU2Vzc2lvblRpdGxlLCAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc1RpdGxlQmFyV2lkZ2V0LCBhY3Rpb24sIG9wdGlvbnMsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fSwgdW5kZWZpbmVkKSk7XG5cdH1cbn1cblxuLy8gRXNjYXBlIGNsb3NlcyB0aGUgYmxvY2tlZC1zZXNzaW9ucyBkcm9wZG93biB3aGlsZSBpdCBpcyBvcGVuLiBSZWdpc3RlcmVkIGFzIGFcbi8vIGhpZ2gtd2VpZ2h0IGtleWJpbmRpbmcgc2NvcGVkIHRvIGBTZXNzaW9uc0Jsb2NrZWRTZXNzaW9uc1Zpc2libGVDb250ZXh0YCAocmF0aGVyXG4vLyB0aGFuIHJlbHlpbmcgb24gZm9jdXMgYmVpbmcgaW5zaWRlIHRoZSBkcm9wZG93bikgc28gaXQgcmVsaWFibHkgd2lucyBvdmVyIG90aGVyXG4vLyBFc2NhcGUgaGFuZGxlcnMsIG1pcnJvcmluZyBob3cgdGhlIHF1aWNrIHBpY2sgc2NvcGVzIGl0cyBkaXNtaXNzIGtleWJpbmRpbmcgdG8gYW5cbi8vIFwiaXMgdmlzaWJsZVwiIGNvbnRleHQga2V5LlxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBISURFX0JMT0NLRURfU0VTU0lPTlNfQ09NTUFORF9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYiArIDEwMCxcblx0d2hlbjogU2Vzc2lvbnNCbG9ja2VkU2Vzc2lvbnNWaXNpYmxlQ29udGV4dCxcblx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdGhhbmRsZXI6IChfYWNjZXNzb3IsIGNvbnRleHQ/OiBJQmxvY2tlZFNlc3Npb25zSGVhZGVyQWN0aW9uQ29udGV4dCkgPT4ge1xuXHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHRjb250ZXh0LmNsb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG9wZW5CbG9ja2VkU2Vzc2lvbnNWaWV3Py5jbG9zZSgpO1xuXHRcdH1cblx0fSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFP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
