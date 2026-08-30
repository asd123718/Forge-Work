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
import "./media/agenttitlebarstatuswidget.css";
import { $, addDisposableListener, EventType, getWindow, isHTMLElement, reset } from "../../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event as EventUtils } from "../../../../../../base/common/event.js";
import { localize } from "../../../../../../nls.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { getDefaultHoverDelegate } from "../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { AgentStatusMode, IAgentTitleBarStatusService } from "./agentTitleBarStatusService.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { EnterAgentSessionProjectionAction, ExitAgentSessionProjectionAction } from "./agentSessionProjectionActions.js";
import { UNIFIED_QUICK_ACCESS_ACTION_ID } from "./unifiedQuickAccessActions.js";
import { IAgentSessionsService } from "../agentSessionsService.js";
import { AgentSessionStatus, isSessionInProgressStatus } from "../agentSessionsModel.js";
import { BaseActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Separator, SubmenuAction, toAction } from "../../../../../../base/common/actions.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../../../platform/workspace/common/workspace.js";
import { IEditorGroupsService } from "../../../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { renderAsPlaintext } from "../../../../../../base/browser/markdownRenderer.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from "../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { InEditorZenModeContext } from "../../../../../common/contextkeys.js";
import { HiddenItemStrategy, WorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { DropdownWithPrimaryActionViewItem } from "../../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js";
import { createActionViewItem } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { FocusAgentSessionsAction } from "../agentSessionsActions.js";
import { WORKBENCH_MENU_MOTION_CLASS, workbenchMenuCloseAnimation } from "../../../../../browser/actions/menuMotion.js";
import { IActionViewItemService } from "../../../../../../platform/actions/browser/actionViewItemService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { mainWindow } from "../../../../../../base/browser/window.js";
import { LayoutSettings } from "../../../../../services/layout/browser/layoutService.js";
import { ChatAIDisabledSettingId, ChatConfiguration } from "../../../common/constants.js";
import { IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import { IChatWidgetService } from "../../chat.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { ITitleService } from "../../../../../services/title/browser/titleService.js";
const TOGGLE_CHAT_ACTION_ID = "workbench.action.chat.toggle";
const QUICK_OPEN_ACTION_ID = "workbench.action.quickOpenWithModes";
const FILTER_STORAGE_KEY = "agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu";
const PREVIOUS_FILTER_STORAGE_KEY = "agentSessions.filterExcludes.previousUserFilter";
function shouldForceHiddenAgentStatus(configurationService, contextKeyService) {
  if (contextKeyService.getContextKeyValue(InEditorZenModeContext.key) === true) {
    return true;
  }
  const aiFeaturesDisabled = configurationService.getValue(ChatAIDisabledSettingId) === true;
  const aiCustomizationsDisabled = configurationService.getValue("disableAICustomizations") === true || configurationService.getValue("workbench.disableAICustomizations") === true;
  return aiFeaturesDisabled && aiCustomizationsDisabled;
}
function getAgentStatusSettingMode(configurationService, contextKeyService) {
  if (shouldForceHiddenAgentStatus(configurationService, contextKeyService)) {
    return "hidden";
  }
  const value = configurationService.getValue(ChatConfiguration.AgentStatusEnabled);
  if (value === false || value === "hidden") {
    return "hidden";
  }
  if (value === "badge") {
    return "badge";
  }
  if (value === true || value === void 0 || value === "compact") {
    return "compact";
  }
  return "compact";
}
let AgentTitleBarStatusWidget = class extends BaseActionViewItem {
  constructor(action, _windowTitle, options, instantiationService, agentTitleBarStatusService, hoverService, commandService, keybindingService, agentSessionsService, workspaceContextService, editorGroupsService, editorService, menuService, contextKeyService, storageService, configurationService, chatEntitlementService, chatWidgetService, telemetryService) {
    super(void 0, action, options);
    this._windowTitle = _windowTitle;
    this.instantiationService = instantiationService;
    this.agentTitleBarStatusService = agentTitleBarStatusService;
    this.hoverService = hoverService;
    this.commandService = commandService;
    this.keybindingService = keybindingService;
    this.agentSessionsService = agentSessionsService;
    this.workspaceContextService = workspaceContextService;
    this.editorGroupsService = editorGroupsService;
    this.editorService = editorService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.chatEntitlementService = chatEntitlementService;
    this.chatWidgetService = chatWidgetService;
    this.telemetryService = telemetryService;
    this._dynamicDisposables = this._register(new DisposableStore());
    /** Guard to prevent re-entrant rendering */
    this._isRendering = false;
    /** Roving tabindex elements for keyboard navigation */
    this._rovingElements = [];
    this._rovingIndex = 0;
    /** Tracks if this window applied a badge filter (unread/inProgress), so we only auto-clear our own filters */
    // TODO: This is imperfect. Targetted fix for vscode#290863. We should revisit storing filter state per-window to avoid this
    this._badgeFilterAppliedByThisWindow = null;
    this._commandCenterMenu = this._register(this.menuService.createMenu(MenuId.CommandCenterCenter, this.contextKeyService));
    this._chatTitleBarMenu = this._register(this.menuService.createMenu(MenuId.ChatTitleBarMenu, this.contextKeyService));
    this._register(this.agentTitleBarStatusService.onDidChangeMode(() => {
      this._render();
    }));
    this._register(this.agentTitleBarStatusService.onDidChangeSessionInfo(() => {
      this._render();
    }));
    this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
      this._render();
    }));
    this._register(this._windowTitle.onDidChange(() => {
      this._render();
    }));
    this._register(this.editorService.onDidActiveEditorChange(() => {
      this._render();
    }));
    this._register(this.editorGroupsService.onDidChangeEditorPartOptions(({ newPartOptions, oldPartOptions }) => {
      if (newPartOptions.showTabs !== oldPartOptions.showTabs) {
        this._render();
      }
    }));
    this._register(this._commandCenterMenu.onDidChange(() => {
      this._lastRenderState = void 0;
      this._render();
    }));
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, "agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu", this._store)(() => {
      this._render();
    }));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(/* @__PURE__ */ new Set([InEditorZenModeContext.key]))) {
        this._lastRenderState = void 0;
        this._render();
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.AgentStatusEnabled) || e.affectsConfiguration(ChatConfiguration.UnifiedAgentsBar) || e.affectsConfiguration(ChatConfiguration.ChatViewSessionsEnabled) || e.affectsConfiguration(ChatAIDisabledSettingId) || e.affectsConfiguration("disableAICustomizations") || e.affectsConfiguration("workbench.disableAICustomizations")) {
        this._lastRenderState = void 0;
        this._render();
      }
    }));
    this._register(EventUtils.any(
      this.chatEntitlementService.onDidChangeSentiment,
      this.chatEntitlementService.onDidChangeQuotaExceeded,
      this.chatEntitlementService.onDidChangeEntitlement,
      this.chatEntitlementService.onDidChangeAnonymous
    )(() => {
      this._lastRenderState = void 0;
      this._render();
    }));
    this._register(this.chatWidgetService.onDidAddWidget(() => {
      this._render();
    }));
    this._register(this.chatWidgetService.onDidBackgroundSession(() => {
      this._render();
    }));
  }
  render(container) {
    super.render(container);
    this._container = container;
    container.classList.add("agent-status-container");
    container.setAttribute("role", "toolbar");
    container.setAttribute("aria-label", localize("agentStatusToolbarLabel", "Agent Status"));
    container.tabIndex = -1;
    this._render();
  }
  // Override focus methods - the container itself shouldn't be focusable,
  // focus is handled by the inner interactive elements (badge sections)
  setFocusable(_focusable) {
  }
  focus() {
    this._rovingElements[this._rovingIndex]?.focus();
  }
  blur() {
    if (!this._container) {
      return;
    }
    const activeElement = getWindow(this._container).document.activeElement;
    if (isHTMLElement(activeElement) && this._container.contains(activeElement)) {
      activeElement.blur();
    }
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
      const mode = this.agentTitleBarStatusService.mode;
      const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
      const { activeSessions, unreadSessions, attentionNeededSessions } = this._getSessionStats();
      const attentionSession = attentionNeededSessions.length > 0 ? [...attentionNeededSessions].sort((a, b) => {
        const timeA = a.timing.lastRequestStarted ?? a.timing.created;
        const timeB = b.timing.lastRequestStarted ?? b.timing.created;
        return timeB - timeA;
      })[0] : void 0;
      const attentionText = attentionSession?.description ? typeof attentionSession.description === "string" ? attentionSession.description : renderAsPlaintext(attentionSession.description) : attentionSession?.label;
      const label = this._getLabel();
      const { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput } = this._getCurrentFilterState();
      const statusMode = getAgentStatusSettingMode(this.configurationService, this.contextKeyService);
      const unifiedAgentsBarEnabled = this.configurationService.getValue(ChatConfiguration.UnifiedAgentsBar) === true;
      const viewSessionsEnabled = this.configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled) !== false;
      const stateKey = JSON.stringify({
        mode,
        sessionTitle: sessionInfo?.title,
        activeCount: activeSessions.length,
        unreadCount: unreadSessions.length,
        attentionCount: attentionNeededSessions.length,
        attentionText,
        label,
        isFilteredToUnread,
        isFilteredToInProgress,
        isFilteredToNeedsInput,
        statusMode,
        unifiedAgentsBarEnabled,
        viewSessionsEnabled
      });
      if (this._lastRenderState === stateKey) {
        return;
      }
      this._lastRenderState = stateKey;
      reset(this._container);
      this._dynamicDisposables.clear();
      this._rovingElements = [];
      if (this.agentTitleBarStatusService.mode === AgentStatusMode.Session) {
        this._renderSessionMode(this._dynamicDisposables);
      } else if (this.agentTitleBarStatusService.mode === AgentStatusMode.SessionReady) {
        this._renderSessionReadyMode(this._dynamicDisposables);
      } else if (statusMode === "compact") {
        this._renderChatInputMode(this._dynamicDisposables);
      } else if (statusMode === "badge") {
        this._renderStatusBadge(this._dynamicDisposables, activeSessions, unreadSessions, attentionNeededSessions);
      }
      this._setupRovingTabIndex(this._dynamicDisposables);
    } finally {
      this._isRendering = false;
    }
  }
  /**
   * Setup roving tabindex for arrow key navigation between interactive elements.
   * Uses the elements registered in `this._rovingElements` in their existing order.
   */
  _setupRovingTabIndex(disposables) {
    if (!this._container || this._rovingElements.length === 0) {
      return;
    }
    if (this._rovingIndex >= this._rovingElements.length) {
      this._rovingIndex = 0;
    }
    for (let i = 0; i < this._rovingElements.length; i++) {
      this._rovingElements[i].tabIndex = i === this._rovingIndex ? 0 : -1;
    }
    disposables.add(addDisposableListener(this._container, EventType.KEY_DOWN, (e) => {
      const index = this._rovingElements.findIndex((el) => el === e.target || el.contains(e.target));
      if (index === -1) {
        return;
      }
      const nextIndex = this._getNextRovingIndex(index, e.key);
      if (nextIndex !== void 0 && nextIndex !== index) {
        e.preventDefault();
        e.stopPropagation();
        this._moveRovingFocus(index, nextIndex);
      }
    }));
  }
  /**
   * Moves roving focus from `currentIndex` to `nextIndex`, updating tabIndex and focusing the element.
   */
  _moveRovingFocus(currentIndex, nextIndex) {
    this._rovingElements[currentIndex].tabIndex = -1;
    this._rovingElements[nextIndex].tabIndex = 0;
    this._rovingElements[nextIndex].focus();
    this._rovingIndex = nextIndex;
  }
  /**
   * Returns the next roving index for the given key, or `undefined` if no navigation should occur.
   */
  _getNextRovingIndex(currentIndex, key) {
    const len = this._rovingElements.length;
    switch (key) {
      case "ArrowRight":
        return (currentIndex + 1) % len;
      case "ArrowLeft":
        return (currentIndex - 1 + len) % len;
      case "Home":
        return 0;
      case "End":
        return len - 1;
      default:
        return void 0;
    }
  }
  // #region Session Statistics
  /**
   * Get computed session statistics for rendering.
   * Respects the current provider (session type) filter when calculating counts.
   */
  _getSessionStats() {
    const sessions = this.agentSessionsService.model.sessions;
    const currentFilter = this._getStoredFilter();
    const excludedProviders = currentFilter?.providers ?? [];
    const filteredSessions = excludedProviders.length > 0 ? sessions.filter((s) => !excludedProviders.includes(s.providerType)) : sessions;
    const activeSessions = filteredSessions.filter((s) => isSessionInProgressStatus(s.status) && !s.isArchived());
    const unreadSessions = filteredSessions.filter((s) => !s.isRead());
    const attentionNeededSessions = filteredSessions.filter((s) => s.status === AgentSessionStatus.NeedsInput && !this.chatWidgetService.getWidgetBySessionResource(s.resource));
    return {
      activeSessions,
      unreadSessions,
      attentionNeededSessions,
      hasActiveSessions: activeSessions.length > 0,
      hasUnreadSessions: unreadSessions.length > 0,
      hasAttentionNeeded: attentionNeededSessions.length > 0
    };
  }
  // #endregion
  // #region Mode Renderers
  _renderChatInputMode(disposables) {
    if (!this._container) {
      return;
    }
    const { activeSessions, unreadSessions, attentionNeededSessions, hasAttentionNeeded } = this._getSessionStats();
    const pill = $("div.agent-status-pill.chat-input-mode");
    if (hasAttentionNeeded) {
      pill.classList.add("needs-attention");
    }
    this._container.appendChild(pill);
    this._renderCommandCenterToolbar(disposables, pill);
    const isCompactMode = true;
    pill.classList.toggle("compact-mode", isCompactMode);
    const leftIcon = $("span.agent-status-left-icon");
    if (hasAttentionNeeded) {
      const reportIcon = renderIcon(Codicon.report);
      const countSpan = $("span.agent-status-attention-count");
      countSpan.textContent = String(attentionNeededSessions.length);
      reset(leftIcon, reportIcon, countSpan);
      leftIcon.classList.add("has-attention");
    } else {
      reset(leftIcon, renderIcon(Codicon.searchSparkle));
    }
    if (!isCompactMode) {
      pill.appendChild(leftIcon);
    }
    const inputArea = $("div.agent-status-input-area");
    inputArea.setAttribute("role", "button");
    inputArea.setAttribute("aria-label", localize("openQuickAccess", "Open Quick Access"));
    inputArea.tabIndex = 0;
    this._rovingElements.push(inputArea);
    pill.appendChild(inputArea);
    const label = $("span.agent-status-label");
    const { progress: progressText } = this._getSessionNeedingAttention(attentionNeededSessions);
    const defaultLabel = isCompactMode ? this._getLabel() : progressText ?? this._getLabel();
    if (!isCompactMode && progressText) {
      label.classList.add("has-progress");
    }
    const hoverLabel = localize("askAnythingPlaceholder", "Ask anything or describe what to build");
    label.textContent = defaultLabel;
    inputArea.appendChild(label);
    if (isCompactMode) {
      disposables.add(addDisposableListener(inputArea, EventType.MOUSE_ENTER, () => {
        reset(leftIcon, renderIcon(Codicon.searchSparkle));
        leftIcon.classList.remove("has-attention");
        label.classList.remove("has-progress");
      }));
      disposables.add(addDisposableListener(inputArea, EventType.MOUSE_LEAVE, () => {
        reset(leftIcon, renderIcon(Codicon.searchSparkle));
      }));
    } else {
      const sendIcon = $("span.agent-status-send");
      reset(sendIcon, renderIcon(Codicon.send));
      sendIcon.classList.add("hidden");
      inputArea.appendChild(sendIcon);
      if (!progressText) {
        disposables.add(addDisposableListener(inputArea, EventType.MOUSE_ENTER, () => {
          reset(leftIcon, renderIcon(Codicon.searchSparkle));
          leftIcon.classList.remove("has-attention");
          label.textContent = hoverLabel;
          label.classList.remove("has-progress");
          sendIcon.classList.remove("hidden");
        }));
        disposables.add(addDisposableListener(inputArea, EventType.MOUSE_LEAVE, () => {
          reset(leftIcon, renderIcon(Codicon.searchSparkle));
          label.textContent = defaultLabel;
          sendIcon.classList.add("hidden");
        }));
      }
    }
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    disposables.add(this.hoverService.setupManagedHover(hoverDelegate, inputArea, () => {
      const kbForTooltip = this.keybindingService.lookupKeybinding(UNIFIED_QUICK_ACCESS_ACTION_ID)?.getLabel();
      return kbForTooltip ? localize("askTooltip", "Open Quick Access ({0})", kbForTooltip) : localize("askTooltip2", "Open Quick Access");
    }));
    disposables.add(addDisposableListener(inputArea, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.telemetryService.publicLog2("agentStatusWidget.click", {
        source: "pill",
        action: "quickAccess"
      });
      const useUnifiedQuickAccess = this.configurationService.getValue(ChatConfiguration.UnifiedAgentsBar) === true;
      this.commandService.executeCommand(useUnifiedQuickAccess ? UNIFIED_QUICK_ACCESS_ACTION_ID : QUICK_OPEN_ACTION_ID);
    }));
    disposables.add(addDisposableListener(inputArea, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.telemetryService.publicLog2("agentStatusWidget.click", {
          source: "pill",
          action: "quickAccess"
        });
        const useUnifiedQuickAccess = this.configurationService.getValue(ChatConfiguration.UnifiedAgentsBar) === true;
        this.commandService.executeCommand(useUnifiedQuickAccess ? UNIFIED_QUICK_ACCESS_ACTION_ID : QUICK_OPEN_ACTION_ID);
      }
    }));
    this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions, pill);
  }
  _renderSessionMode(disposables) {
    if (!this._container) {
      return;
    }
    const { activeSessions, unreadSessions, attentionNeededSessions } = this._getSessionStats();
    this._renderCommandCenterToolbar(disposables);
    const pill = $("div.agent-status-pill.session-mode");
    this._container.appendChild(pill);
    this._renderSearchButton(disposables, pill);
    const titleLabel = $("span.agent-status-title");
    const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
    titleLabel.textContent = sessionInfo?.title ?? localize("agentSessionProjection", "Agent Session Projection");
    pill.appendChild(titleLabel);
    this._renderEscapeButton(disposables, pill);
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    disposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, () => {
      const sessionInfo2 = this.agentTitleBarStatusService.sessionInfo;
      return sessionInfo2 ? localize("agentSessionProjectionTooltip", "Agent Session Projection: {0}", sessionInfo2.title) : localize("agentSessionProjection", "Agent Session Projection");
    }));
    const exitHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.commandService.executeCommand(ExitAgentSessionProjectionAction.ID);
    };
    disposables.add(addDisposableListener(pill, EventType.CLICK, exitHandler));
    disposables.add(addDisposableListener(pill, EventType.MOUSE_DOWN, exitHandler));
    this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions);
  }
  /**
   * Render session ready mode - shows session title + enter projection button.
   * Used when a projection-capable session is available but not yet entered.
   */
  _renderSessionReadyMode(disposables) {
    if (!this._container) {
      return;
    }
    const { activeSessions, unreadSessions, attentionNeededSessions } = this._getSessionStats();
    const pill = $("div.agent-status-pill.session-ready-mode");
    this._container.appendChild(pill);
    const titleLabel = $("span.agent-status-title");
    const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
    titleLabel.textContent = sessionInfo?.title ?? localize("agentSessionReady", "Review Changes");
    pill.appendChild(titleLabel);
    this._renderEnterButton(disposables, pill);
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    disposables.add(this.hoverService.setupManagedHover(hoverDelegate, pill, () => {
      const sessionInfo2 = this.agentTitleBarStatusService.sessionInfo;
      return sessionInfo2 ? localize("agentSessionReadyTooltip", "Review changes from: {0}", sessionInfo2.title) : localize("agentSessionReadyGeneric", "Review agent session changes");
    }));
    const enterHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sessionInfo2 = this.agentTitleBarStatusService.sessionInfo;
      if (sessionInfo2) {
        const session = this.agentSessionsService.getSession(sessionInfo2.sessionResource);
        if (session) {
          this.commandService.executeCommand(EnterAgentSessionProjectionAction.ID, session);
        }
      }
    };
    disposables.add(addDisposableListener(pill, EventType.CLICK, enterHandler));
    disposables.add(addDisposableListener(pill, EventType.MOUSE_DOWN, enterHandler));
    this._renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions);
  }
  // #endregion
  // #region Reusable Components
  /**
   * Render command center toolbar items (like debug toolbar) that are registered to CommandCenter
   * Filters out the quick open action since we provide our own search UI.
   * Adds a dot separator after the toolbar if content was rendered.
   */
  _renderCommandCenterToolbar(disposables, parent) {
    const container = parent ?? this._container;
    if (!container) {
      return;
    }
    const allActions = [];
    for (const [, actions] of this._commandCenterMenu.getActions({ shouldForwardArgs: true })) {
      for (const action of actions) {
        if (action.id === QUICK_OPEN_ACTION_ID) {
          continue;
        }
        if (action instanceof SubmenuAction) {
          allActions.push(...action.actions);
        } else {
          allActions.push(action);
        }
      }
    }
    if (allActions.length === 0) {
      return;
    }
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    const toolbarContainer = $("div.agent-status-command-center-toolbar");
    container.appendChild(toolbarContainer);
    const toolbar = this.instantiationService.createInstance(WorkbenchToolBar, toolbarContainer, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "agentStatusCommandCenter",
      actionViewItemProvider: (action, options) => {
        return createActionViewItem(this.instantiationService, action, { ...options, hoverDelegate });
      }
    });
    disposables.add(toolbar);
    toolbar.setActions(allActions);
    if (parent) {
      const separator = $("span.agent-status-line-separator");
      container.appendChild(separator);
    } else {
      const separator = renderIcon(Codicon.circleSmallFilled);
      separator.classList.add("agent-status-separator");
      container.appendChild(separator);
    }
  }
  /**
   * Render the search button. If parent is provided, appends to parent; otherwise appends to container.
   */
  _renderSearchButton(disposables, parent) {
    const container = parent ?? this._container;
    if (!container) {
      return;
    }
    const searchButton = $("span.agent-status-search");
    reset(searchButton, renderIcon(Codicon.searchSparkle));
    searchButton.setAttribute("role", "button");
    searchButton.setAttribute("aria-label", localize("openQuickOpen", "Open Quick Open"));
    searchButton.tabIndex = 0;
    this._rovingElements.push(searchButton);
    container.appendChild(searchButton);
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    const searchKb = this.keybindingService.lookupKeybinding(QUICK_OPEN_ACTION_ID)?.getLabel();
    const searchTooltip = searchKb ? localize("openQuickOpenTooltip", "Go to File ({0})", searchKb) : localize("openQuickOpenTooltip2", "Go to File");
    disposables.add(this.hoverService.setupManagedHover(hoverDelegate, searchButton, searchTooltip));
    disposables.add(addDisposableListener(searchButton, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.commandService.executeCommand(QUICK_OPEN_ACTION_ID);
    }));
    disposables.add(addDisposableListener(searchButton, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.commandService.executeCommand(QUICK_OPEN_ACTION_ID);
      }
    }));
  }
  /**
   * Render the status badge showing in-progress, needs-input, and/or unread session counts.
   * Shows split UI with sparkle icon on left, then unread, needs-input, and active indicators.
   * Always renders the sparkle icon section.
   */
  _renderStatusBadge(disposables, activeSessions, unreadSessions, attentionNeededSessions, inlineContainer) {
    if (!this._container) {
      return;
    }
    const hasActiveSessions = activeSessions.length > 0;
    const hasUnreadSessions = unreadSessions.length > 0;
    const hasAttentionNeeded = attentionNeededSessions.length > 0;
    this._clearFilterIfCategoryEmpty(hasUnreadSessions, hasActiveSessions, hasAttentionNeeded);
    let badge;
    if (inlineContainer) {
      badge = inlineContainer;
    } else {
      badge = $("div.agent-status-badge");
      this._container.appendChild(badge);
    }
    const sparkleContainer = $("span.agent-status-badge-section.sparkle");
    sparkleContainer.tabIndex = 0;
    const menuActions = Separator.join(...this._chatTitleBarMenu.getActions({ shouldForwardArgs: true }).map(([, actions]) => actions));
    const primaryActionId = TOGGLE_CHAT_ACTION_ID;
    const primaryActionTitle = localize("toggleChat", "Toggle Chat");
    const primaryActionIcon = Codicon.chatSparkle;
    const primaryAction = this.instantiationService.createInstance(MenuItemAction, {
      id: primaryActionId,
      title: primaryActionTitle,
      icon: primaryActionIcon
    }, void 0, void 0, void 0, void 0);
    const dropdownAction = toAction({
      id: "agentStatus.sparkle.dropdown",
      label: localize("agentStatus.sparkle.dropdown", "More Actions"),
      run() {
      }
    });
    const sparkleDropdown = this.instantiationService.createInstance(
      DropdownWithPrimaryActionViewItem,
      primaryAction,
      dropdownAction,
      menuActions,
      "agent-status-sparkle-dropdown",
      { skipTelemetry: true, menuClassName: WORKBENCH_MENU_MOTION_CLASS, closeAnimation: workbenchMenuCloseAnimation }
    );
    sparkleDropdown.render(sparkleContainer);
    disposables.add(sparkleDropdown);
    disposables.add(addDisposableListener(
      sparkleContainer,
      EventType.KEY_DOWN,
      (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
          const idx = this._rovingElements.indexOf(sparkleContainer);
          if (idx === -1) {
            return;
          }
          const nextIndex = this._getNextRovingIndex(idx, e.key);
          if (nextIndex !== void 0 && nextIndex !== idx) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this._moveRovingFocus(idx, nextIndex);
          }
        }
      },
      true
      /* useCapture */
    ));
    disposables.add(addDisposableListener(sparkleContainer, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.commandService.executeCommand(primaryActionId);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        sparkleDropdown.showDropdown();
      }
    }));
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    const viewSessionsEnabled = this.configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled) !== false;
    const reverseOrder = !!inlineContainer;
    if (!reverseOrder) {
      badge.appendChild(sparkleContainer);
    }
    let unreadSection;
    let activeSection;
    let needsInputSection;
    if (viewSessionsEnabled && hasUnreadSessions && this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
      const { isFilteredToUnread } = this._getCurrentFilterState();
      unreadSection = $("span.agent-status-badge-section.unread");
      if (isFilteredToUnread) {
        unreadSection.classList.add("filtered");
      }
      unreadSection.setAttribute("role", "button");
      unreadSection.tabIndex = 0;
      const unreadIcon = $("span.agent-status-icon");
      reset(unreadIcon, renderIcon(Codicon.circleFilled));
      unreadSection.appendChild(unreadIcon);
      const unreadCount = $("span.agent-status-text");
      unreadCount.textContent = String(unreadSessions.length);
      unreadSection.appendChild(unreadCount);
      disposables.add(addDisposableListener(unreadSection, EventType.CLICK, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openSessionsWithFilter("unread");
      }));
      disposables.add(addDisposableListener(unreadSection, EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          this._openSessionsWithFilter("unread");
        }
      }));
      const unreadTooltip = unreadSessions.length === 1 ? localize("unreadSessionsTooltip1", "{0} unread session", unreadSessions.length) : localize("unreadSessionsTooltip", "{0} unread sessions", unreadSessions.length);
      disposables.add(this.hoverService.setupManagedHover(hoverDelegate, unreadSection, unreadTooltip));
    }
    if (viewSessionsEnabled && hasAttentionNeeded) {
      const { isFilteredToNeedsInput } = this._getCurrentFilterState();
      needsInputSection = $("span.agent-status-badge-section.active.needs-input");
      if (isFilteredToNeedsInput) {
        needsInputSection.classList.add("filtered");
      }
      needsInputSection.setAttribute("role", "button");
      needsInputSection.tabIndex = 0;
      const needsInputIcon = $("span.agent-status-icon");
      reset(needsInputIcon, renderIcon(Codicon.report));
      needsInputSection.appendChild(needsInputIcon);
      const needsInputCount = $("span.agent-status-text");
      needsInputCount.textContent = String(attentionNeededSessions.length);
      needsInputSection.appendChild(needsInputCount);
      disposables.add(addDisposableListener(needsInputSection, EventType.CLICK, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openSessionsWithFilter("needsInput");
      }));
      disposables.add(addDisposableListener(needsInputSection, EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          this._openSessionsWithFilter("needsInput");
        }
      }));
      const needsInputTooltip = attentionNeededSessions.length === 1 ? localize("needsInputSessionsTooltip1", "{0} session needs input", attentionNeededSessions.length) : localize("needsInputSessionsTooltip", "{0} sessions need input", attentionNeededSessions.length);
      disposables.add(this.hoverService.setupManagedHover(hoverDelegate, needsInputSection, needsInputTooltip));
    }
    const inProgressOnly = activeSessions.filter((s) => s.status !== AgentSessionStatus.NeedsInput);
    if (viewSessionsEnabled && inProgressOnly.length > 0) {
      const { isFilteredToInProgress } = this._getCurrentFilterState();
      activeSection = $("span.agent-status-badge-section.active");
      if (isFilteredToInProgress) {
        activeSection.classList.add("filtered");
      }
      activeSection.setAttribute("role", "button");
      activeSection.tabIndex = 0;
      const statusIcon = $("span.agent-status-icon");
      reset(statusIcon, renderIcon(Codicon.sessionInProgress));
      activeSection.appendChild(statusIcon);
      const statusCount = $("span.agent-status-text");
      statusCount.textContent = String(inProgressOnly.length);
      activeSection.appendChild(statusCount);
      disposables.add(addDisposableListener(activeSection, EventType.CLICK, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openSessionsWithFilter("inProgress");
      }));
      disposables.add(addDisposableListener(activeSection, EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          this._openSessionsWithFilter("inProgress");
        }
      }));
      const activeTooltip = inProgressOnly.length === 1 ? localize("activeSessionsTooltip1", "{0} session in progress", inProgressOnly.length) : localize("activeSessionsTooltip", "{0} sessions in progress", inProgressOnly.length);
      disposables.add(this.hoverService.setupManagedHover(hoverDelegate, activeSection, activeTooltip));
    }
    if (reverseOrder) {
      if (needsInputSection) {
        badge.appendChild(needsInputSection);
        this._rovingElements.push(needsInputSection);
      }
      if (activeSection) {
        badge.appendChild(activeSection);
        this._rovingElements.push(activeSection);
      }
      if (unreadSection) {
        badge.appendChild(unreadSection);
        this._rovingElements.push(unreadSection);
      }
      badge.appendChild(sparkleContainer);
      this._rovingElements.push(sparkleContainer);
    } else {
      this._rovingElements.push(sparkleContainer);
      if (unreadSection) {
        badge.appendChild(unreadSection);
        this._rovingElements.push(unreadSection);
      }
      if (activeSection) {
        badge.appendChild(activeSection);
        this._rovingElements.push(activeSection);
      }
      if (needsInputSection) {
        badge.appendChild(needsInputSection);
        this._rovingElements.push(needsInputSection);
      }
    }
  }
  /**
   * Clear the filter if the currently filtered category becomes empty.
   * For example, if filtered to "unread" but no unread sessions exist, restore user's previous filter.
   * Only auto-clears if THIS window applied the badge filter to avoid cross-window interference.
   */
  _clearFilterIfCategoryEmpty(hasUnreadSessions, hasActiveSessions, hasAttentionNeeded) {
    if (this._badgeFilterAppliedByThisWindow === "unread" && !hasUnreadSessions) {
      this._restoreUserFilter();
    } else if (this._badgeFilterAppliedByThisWindow === "inProgress" && !hasActiveSessions) {
      this._restoreUserFilter();
    } else if (this._badgeFilterAppliedByThisWindow === "needsInput" && !hasAttentionNeeded) {
      this._restoreUserFilter();
    }
  }
  /**
   * Get the current filter state from storage.
   */
  _getCurrentFilterState() {
    const filter = this._getStoredFilter();
    if (!filter) {
      return { isFilteredToUnread: false, isFilteredToInProgress: false, isFilteredToNeedsInput: false };
    }
    const isFilteredToUnread = filter.read === true && filter.states.length === 0;
    const isFilteredToInProgress = filter.states?.length === 3 && filter.states.includes(AgentSessionStatus.NeedsInput) && filter.read === false;
    const isFilteredToNeedsInput = filter.states?.length === 3 && filter.states.includes(AgentSessionStatus.InProgress) && filter.read === false;
    return { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput };
  }
  /**
   * Get the stored filter object from storage.
   */
  _getStoredFilter() {
    const filterStr = this.storageService.get(FILTER_STORAGE_KEY, StorageScope.PROFILE);
    if (!filterStr) {
      return void 0;
    }
    try {
      return JSON.parse(filterStr);
    } catch {
      return void 0;
    }
  }
  /**
   * Store a filter object to storage.
   */
  _storeFilter(filter) {
    this.storageService.store(FILTER_STORAGE_KEY, JSON.stringify(filter), StorageScope.PROFILE, StorageTarget.USER);
  }
  /**
   * Clear all filters (reset to default).
   */
  _clearFilter() {
    this._storeFilter({
      providers: [],
      states: [],
      archived: true,
      read: false
    });
  }
  /**
   * Save the current user filter before we override it with a badge filter.
   * Only saves if the current filter is NOT already a badge filter (unread or in-progress).
   * This preserves the original user filter when switching between badge filters.
   */
  _saveUserFilter() {
    const { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput } = this._getCurrentFilterState();
    if (isFilteredToUnread || isFilteredToInProgress || isFilteredToNeedsInput) {
      return;
    }
    const currentFilter = this._getStoredFilter();
    if (currentFilter) {
      this.storageService.store(PREVIOUS_FILTER_STORAGE_KEY, JSON.stringify(currentFilter), StorageScope.PROFILE, StorageTarget.USER);
    }
  }
  /**
   * Restore the user's previous filter (saved before we applied a badge filter).
   */
  _restoreUserFilter() {
    const previousFilterStr = this.storageService.get(PREVIOUS_FILTER_STORAGE_KEY, StorageScope.PROFILE);
    if (previousFilterStr) {
      try {
        const previousFilter = JSON.parse(previousFilterStr);
        this._storeFilter(previousFilter);
      } catch {
        this._clearFilter();
      }
    } else {
      this._clearFilter();
    }
    this.storageService.remove(PREVIOUS_FILTER_STORAGE_KEY, StorageScope.PROFILE);
    this._badgeFilterAppliedByThisWindow = null;
  }
  /**
   * Opens the agent sessions view with a specific filter applied, or restores previous filter if already applied.
   * Preserves session type (provider) filters while toggling only status filters.
   */
  _openSessionsWithFilter(filterType) {
    const { isFilteredToUnread, isFilteredToInProgress, isFilteredToNeedsInput } = this._getCurrentFilterState();
    const currentFilter = this._getStoredFilter();
    const preservedProviders = currentFilter?.providers ?? [];
    const isToggleOff = filterType === "unread" && isFilteredToUnread || filterType === "inProgress" && isFilteredToInProgress || filterType === "needsInput" && isFilteredToNeedsInput;
    this.telemetryService.publicLog2("agentStatusWidget.click", {
      source: filterType,
      action: isToggleOff ? "clearFilter" : "applyFilter"
    });
    if (isToggleOff) {
      this._restoreUserFilter();
    } else {
      this._saveUserFilter();
      if (filterType === "unread") {
        this._storeFilter({
          providers: preservedProviders,
          states: [],
          archived: true,
          read: true
        });
      } else if (filterType === "inProgress") {
        this._storeFilter({
          providers: preservedProviders,
          states: [AgentSessionStatus.Completed, AgentSessionStatus.Failed, AgentSessionStatus.NeedsInput],
          archived: true,
          read: false
        });
      } else {
        this._storeFilter({
          providers: preservedProviders,
          states: [AgentSessionStatus.Completed, AgentSessionStatus.Failed, AgentSessionStatus.InProgress],
          archived: true,
          read: false
        });
      }
      this._badgeFilterAppliedByThisWindow = filterType;
    }
    this.commandService.executeCommand(FocusAgentSessionsAction.id);
  }
  /**
   * Render the escape button for exiting session projection mode.
   */
  _renderEscapeButton(disposables, parent) {
    const escButton = $("span.agent-status-esc-button");
    escButton.textContent = "Esc";
    escButton.setAttribute("role", "button");
    escButton.setAttribute("aria-label", localize("exitAgentSessionProjection", "Exit Agent Session Projection"));
    escButton.tabIndex = 0;
    this._rovingElements.push(escButton);
    parent.appendChild(escButton);
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    disposables.add(this.hoverService.setupManagedHover(hoverDelegate, escButton, localize("exitAgentSessionProjectionTooltip", "Exit Agent Session Projection (Escape)")));
    disposables.add(addDisposableListener(escButton, EventType.MOUSE_DOWN, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.commandService.executeCommand(ExitAgentSessionProjectionAction.ID);
    }));
    disposables.add(addDisposableListener(escButton, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.commandService.executeCommand(ExitAgentSessionProjectionAction.ID);
    }));
    disposables.add(addDisposableListener(escButton, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.commandService.executeCommand(ExitAgentSessionProjectionAction.ID);
      }
    }));
  }
  /**
   * Render the enter button for entering session projection mode.
   */
  _renderEnterButton(disposables, parent) {
    const enterButton = $("span.agent-status-enter-button");
    const keybinding = this.keybindingService.lookupKeybinding(EnterAgentSessionProjectionAction.ID);
    enterButton.textContent = keybinding?.getLabel() ?? localize("review", "Review");
    enterButton.setAttribute("role", "button");
    enterButton.setAttribute("aria-label", localize("enterAgentSessionProjection", "Enter Agent Session Projection"));
    enterButton.tabIndex = 0;
    this._rovingElements.push(enterButton);
    parent.appendChild(enterButton);
    const hoverDelegate = getDefaultHoverDelegate("mouse");
    const hoverText = keybinding ? localize("enterAgentSessionProjectionTooltip", "Review Changes ({0})", keybinding.getLabel()) : localize("enterAgentSessionProjectionTooltipNoKey", "Review Changes");
    disposables.add(this.hoverService.setupManagedHover(hoverDelegate, enterButton, hoverText));
    const enterProjection = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sessionInfo = this.agentTitleBarStatusService.sessionInfo;
      if (sessionInfo) {
        const session = this.agentSessionsService.getSession(sessionInfo.sessionResource);
        if (session) {
          this.commandService.executeCommand(EnterAgentSessionProjectionAction.ID, session);
        }
      }
    };
    disposables.add(addDisposableListener(enterButton, EventType.MOUSE_DOWN, enterProjection));
    disposables.add(addDisposableListener(enterButton, EventType.CLICK, enterProjection));
    disposables.add(addDisposableListener(enterButton, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        enterProjection(e);
      }
    }));
  }
  // #endregion
  // #region Session Helpers
  /**
   * Get the session most urgently needing user attention (approval/confirmation/input).
   * Returns undefined if no sessions need attention.
   */
  _getSessionNeedingAttention(attentionNeededSessions) {
    if (attentionNeededSessions.length === 0) {
      return { session: void 0, progress: void 0 };
    }
    const sorted = [...attentionNeededSessions].sort((a, b) => {
      const timeA = a.timing.lastRequestStarted ?? a.timing.created;
      const timeB = b.timing.lastRequestStarted ?? b.timing.created;
      return timeB - timeA;
    });
    const mostRecent = sorted[0];
    if (!mostRecent.description) {
      return { session: mostRecent, progress: mostRecent.label };
    }
    const progress = typeof mostRecent.description === "string" ? mostRecent.description : renderAsPlaintext(mostRecent.description);
    return { session: mostRecent, progress };
  }
  // #endregion
  // #region Label Helpers
  /**
   * Compute the label to display in the command center.
   * Uses the workspace name (folder name) with prefix/suffix decorations.
   * Falls back to file name when tabs are hidden, or "Search" when empty.
   */
  _getLabel() {
    const { prefix, suffix } = this._windowTitle.getTitleDecorations();
    let label = this._windowTitle.workspaceName;
    if (this._windowTitle.isCustomTitleFormat()) {
      label = this._windowTitle.getWindowTitle();
    } else if (!label && this.editorGroupsService.partOptions.showTabs === "none") {
      label = this._windowTitle.fileName ?? "";
    }
    if (!label) {
      label = localize("agentStatusWidget.search", "Search");
    }
    if (prefix) {
      label = localize("label1", "{0} {1}", prefix, label);
    }
    if (suffix) {
      label = localize("label2", "{0} {1}", label, suffix);
    }
    return label.replaceAll(/\r\n|\r|\n/g, "\u23CE");
  }
  // #endregion
};
AgentTitleBarStatusWidget = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IAgentTitleBarStatusService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IAgentSessionsService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IEditorGroupsService),
  __decorateParam(11, IEditorService),
  __decorateParam(12, IMenuService),
  __decorateParam(13, IContextKeyService),
  __decorateParam(14, IStorageService),
  __decorateParam(15, IConfigurationService),
  __decorateParam(16, IChatEntitlementService),
  __decorateParam(17, IChatWidgetService),
  __decorateParam(18, ITelemetryService)
], AgentTitleBarStatusWidget);
let AgentTitleBarStatusRendering = class extends Disposable {
  constructor(actionViewItemService, instantiationService, configurationService, contextKeyService, titleService) {
    super();
    this._register(actionViewItemService.register(MenuId.CommandCenter, MenuId.AgentsTitleBarControlMenu, (action, options) => {
      if (!(action instanceof SubmenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(AgentTitleBarStatusWidget, action, titleService.windowTitle, options);
    }, void 0));
    const chatEnabledKey = contextKeyService.getContextKeyValue("chatIsEnabled");
    let chatEnabled = !!chatEnabledKey;
    const updateClass = () => {
      const commandCenterEnabled = configurationService.getValue(LayoutSettings.COMMAND_CENTER) === true;
      const statusMode = getAgentStatusSettingMode(configurationService, contextKeyService);
      const enabled = commandCenterEnabled && chatEnabled && statusMode !== "hidden";
      const enhanced = enabled && statusMode === "compact";
      mainWindow.document.body.classList.toggle("agent-status-enabled", enabled);
      mainWindow.document.body.classList.toggle("unified-agents-bar", enhanced);
    };
    updateClass();
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.AgentStatusEnabled) || e.affectsConfiguration(LayoutSettings.COMMAND_CENTER) || e.affectsConfiguration(ChatAIDisabledSettingId) || e.affectsConfiguration("disableAICustomizations") || e.affectsConfiguration("workbench.disableAICustomizations")) {
        updateClass();
      }
    }));
    this._register(contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(/* @__PURE__ */ new Set(["chatIsEnabled", InEditorZenModeContext.key]))) {
        chatEnabled = !!contextKeyService.getContextKeyValue("chatIsEnabled");
        updateClass();
      }
    }));
  }
};
AgentTitleBarStatusRendering.ID = "workbench.contrib.agentStatus.rendering";
AgentTitleBarStatusRendering = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ITitleService)
], AgentTitleBarStatusRendering);
export {
  AgentTitleBarStatusRendering,
  AgentTitleBarStatusWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGV4cGVyaW1lbnRzXFxhZ2VudFRpdGxlQmFyU3RhdHVzV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2FnZW50dGl0bGViYXJzdGF0dXN3aWRnZXQuY3NzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBnZXRXaW5kb3csIGlzSFRNTEVsZW1lbnQsIHJlc2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgYXMgRXZlbnRVdGlscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IEFnZW50U3RhdHVzTW9kZSwgSUFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBFbnRlckFnZW50U2Vzc2lvblByb2plY3Rpb25BY3Rpb24sIEV4aXRBZ2VudFNlc3Npb25Qcm9qZWN0aW9uQWN0aW9uIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25Qcm9qZWN0aW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBVTklGSUVEX1FVSUNLX0FDQ0VTU19BQ1RJT05fSUQgfSBmcm9tICcuL3VuaWZpZWRRdWlja0FjY2Vzc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uU3RhdHVzLCBJQWdlbnRTZXNzaW9uLCBpc1Nlc3Npb25JblByb2dyZXNzU3RhdHVzIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9uc01vZGVsLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSwgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBTZXBhcmF0b3IsIFN1Ym1lbnVBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiwgU3VibWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSW5FZGl0b3JaZW5Nb2RlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIFdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBEcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvZHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBGb2N1c0FnZW50U2Vzc2lvbnNBY3Rpb24gfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgV09SS0JFTkNIX01FTlVfTU9USU9OX0NMQVNTLCB3b3JrYmVuY2hNZW51Q2xvc2VBbmltYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvbWVudU1vdGlvbi5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IExheW91dFNldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBXaW5kb3dUaXRsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdGl0bGViYXIvd2luZG93VGl0bGUuanMnO1xuaW1wb3J0IHsgQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQsIENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUaXRsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy90aXRsZS9icm93c2VyL3RpdGxlU2VydmljZS5qcyc7XG5cbi8vIFRlbGVtZXRyeSB0eXBlc1xudHlwZSBBZ2VudFN0YXR1c0NsaWNrQWN0aW9uID1cblx0fCAnb3BlblNlc3Npb24nXG5cdHwgJ3F1aWNrQWNjZXNzJ1xuXHR8ICdmb2N1c1Nlc3Npb25zVmlldydcblx0fCAndG9nZ2xlQ2hhdCdcblx0fCAnc2V0dXBDaGF0J1xuXHR8ICdhcHBseUZpbHRlcidcblx0fCAnY2xlYXJGaWx0ZXInXG5cdHwgJ2VudGVyUHJvamVjdGlvbidcblx0fCAnZXhpdFByb2plY3Rpb24nO1xuXG50eXBlIEFnZW50U3RhdHVzQ2xpY2tFdmVudCA9IHtcblx0c291cmNlOiAncGlsbCcgfCAnc3BhcmtsZScgfCAndW5yZWFkJyB8ICdpblByb2dyZXNzJyB8ICduZWVkc0lucHV0Jztcblx0YWN0aW9uOiBBZ2VudFN0YXR1c0NsaWNrQWN0aW9uO1xufTtcblxudHlwZSBBZ2VudFN0YXR1c0NsaWNrQ2xhc3NpZmljYXRpb24gPSB7XG5cdHNvdXJjZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doaWNoIHBhcnQgb2YgdGhlIGFnZW50IHN0YXR1cyB3aWRnZXQgd2FzIGNsaWNrZWQuJyB9O1xuXHRhY3Rpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgYWN0aW9uIHRha2VuIGluIHJlc3BvbnNlIHRvIHRoZSBjbGljay4nIH07XG5cdG93bmVyOiAnam9zaHNwaWNlcic7XG5cdGNvbW1lbnQ6ICdUcmFja3MgaW50ZXJhY3Rpb25zIHdpdGggdGhlIGFnZW50IHN0YXR1cyBjb21tYW5kIGNlbnRlciBjb250cm9sLic7XG59O1xuXG4vLyBBY3Rpb24gSURzXG5jb25zdCBUT0dHTEVfQ0hBVF9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRvZ2dsZSc7XG5jb25zdCBRVUlDS19PUEVOX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3BlbldpdGhNb2Rlcyc7XG5cbi8vIFN0b3JhZ2Uga2V5IGZvciBmaWx0ZXIgc3RhdGVcbmNvbnN0IEZJTFRFUl9TVE9SQUdFX0tFWSA9ICdhZ2VudFNlc3Npb25zLmZpbHRlckV4Y2x1ZGVzLmFnZW50c2Vzc2lvbnN2aWV3ZXJmaWx0ZXJzdWJtZW51Jztcbi8vIFN0b3JhZ2Uga2V5IGZvciBzYXZpbmcgdXNlcidzIGZpbHRlciBzdGF0ZSBiZWZvcmUgd2Ugb3ZlcnJpZGUgaXRcbmNvbnN0IFBSRVZJT1VTX0ZJTFRFUl9TVE9SQUdFX0tFWSA9ICdhZ2VudFNlc3Npb25zLmZpbHRlckV4Y2x1ZGVzLnByZXZpb3VzVXNlckZpbHRlcic7XG5cbnR5cGUgQWdlbnRTdGF0dXNTZXR0aW5nTW9kZSA9ICdoaWRkZW4nIHwgJ2JhZGdlJyB8ICdjb21wYWN0JztcblxuZnVuY3Rpb24gc2hvdWxkRm9yY2VIaWRkZW5BZ2VudFN0YXR1cyhjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKTogYm9vbGVhbiB7XG5cdC8vIEhpZGUgYWxsIGFnZW50IGRpc3RyYWN0aW9ucyB3aGlsZSBpbiBaZW4gbW9kZVxuXHRpZiAoY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KEluRWRpdG9yWmVuTW9kZUNvbnRleHQua2V5KSA9PT0gdHJ1ZSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Y29uc3QgYWlGZWF0dXJlc0Rpc2FibGVkID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpID09PSB0cnVlO1xuXHRjb25zdCBhaUN1c3RvbWl6YXRpb25zRGlzYWJsZWQgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZGlzYWJsZUFJQ3VzdG9taXphdGlvbnMnKSA9PT0gdHJ1ZVxuXHRcdHx8IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCd3b3JrYmVuY2guZGlzYWJsZUFJQ3VzdG9taXphdGlvbnMnKSA9PT0gdHJ1ZTtcblxuXHRyZXR1cm4gYWlGZWF0dXJlc0Rpc2FibGVkICYmIGFpQ3VzdG9taXphdGlvbnNEaXNhYmxlZDtcbn1cblxuZnVuY3Rpb24gZ2V0QWdlbnRTdGF0dXNTZXR0aW5nTW9kZShjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKTogQWdlbnRTdGF0dXNTZXR0aW5nTW9kZSB7XG5cdGlmIChzaG91bGRGb3JjZUhpZGRlbkFnZW50U3RhdHVzKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSkpIHtcblx0XHRyZXR1cm4gJ2hpZGRlbic7XG5cdH1cblxuXHRjb25zdCB2YWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKENoYXRDb25maWd1cmF0aW9uLkFnZW50U3RhdHVzRW5hYmxlZCk7XG5cblx0aWYgKHZhbHVlID09PSBmYWxzZSB8fCB2YWx1ZSA9PT0gJ2hpZGRlbicpIHtcblx0XHRyZXR1cm4gJ2hpZGRlbic7XG5cdH1cblxuXHRpZiAodmFsdWUgPT09ICdiYWRnZScpIHtcblx0XHRyZXR1cm4gJ2JhZGdlJztcblx0fVxuXG5cdC8vIEJhY2t3YXJkIGNvbXBhdGliaWxpdHk6IHByZXZpb3VzIGV4cGVyaW1lbnRzIHN0b3JlZCB0aGlzIGFzIGEgYm9vbGVhbi5cblx0aWYgKHZhbHVlID09PSB0cnVlIHx8IHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09ICdjb21wYWN0Jykge1xuXHRcdHJldHVybiAnY29tcGFjdCc7XG5cdH1cblxuXHRyZXR1cm4gJ2NvbXBhY3QnO1xufVxuXG4vKipcbiAqIEFnZW50IFN0YXR1cyBXaWRnZXQgLSByZW5kZXJzIGFnZW50IHN0YXR1cyBpbiB0aGUgY29tbWFuZCBjZW50ZXIuXG4gKlxuICogU2hvd3MgdHdvIGRpZmZlcmVudCBzdGF0ZXM6XG4gKiAxLiBEZWZhdWx0IHN0YXRlOiBDb3BpbG90IGljb24gcGlsbCAodHVybnMgYmx1ZSB3aXRoIGluLXByb2dyZXNzIGNvdW50IHdoZW4gYWdlbnRzIGFyZSBydW5uaW5nKVxuICogMi4gQWdlbnQgU2Vzc2lvbiBQcm9qZWN0aW9uIHN0YXRlOiBTZXNzaW9uIHRpdGxlICsgY2xvc2UgYnV0dG9uICh3aGVuIHZpZXdpbmcgYSBzZXNzaW9uKVxuICpcbiAqIFRoZSBjb21tYW5kIGNlbnRlciBzZWFyY2ggYm94IGFuZCBuYXZpZ2F0aW9uIGNvbnRyb2xzIHJlbWFpbiB2aXNpYmxlIGFsb25nc2lkZSB0aGlzIGNvbnRyb2wuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudFRpdGxlQmFyU3RhdHVzV2lkZ2V0IGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblxuXHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9keW5hbWljRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdC8qKiBUaGUgY3VycmVudGx5IGRpc3BsYXllZCBpbi1wcm9ncmVzcyBzZXNzaW9uIChpZiBhbnkpIC0gY2xpY2tpbmcgcGlsbCBvcGVucyB0aGlzICovXG5cblx0LyoqIENhY2hlZCByZW5kZXIgc3RhdGUgdG8gYXZvaWQgdW5uZWNlc3NhcnkgRE9NIHJlYnVpbGRzICovXG5cdHByaXZhdGUgX2xhc3RSZW5kZXJTdGF0ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBHdWFyZCB0byBwcmV2ZW50IHJlLWVudHJhbnQgcmVuZGVyaW5nICovXG5cdHByaXZhdGUgX2lzUmVuZGVyaW5nID0gZmFsc2U7XG5cblx0LyoqIFJvdmluZyB0YWJpbmRleCBlbGVtZW50cyBmb3Iga2V5Ym9hcmQgbmF2aWdhdGlvbiAqL1xuXHRwcml2YXRlIF9yb3ZpbmdFbGVtZW50czogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIF9yb3ZpbmdJbmRleDogbnVtYmVyID0gMDtcblxuXHQvKiogVHJhY2tzIGlmIHRoaXMgd2luZG93IGFwcGxpZWQgYSBiYWRnZSBmaWx0ZXIgKHVucmVhZC9pblByb2dyZXNzKSwgc28gd2Ugb25seSBhdXRvLWNsZWFyIG91ciBvd24gZmlsdGVycyAqL1xuXHQvLyBUT0RPOiBUaGlzIGlzIGltcGVyZmVjdC4gVGFyZ2V0dGVkIGZpeCBmb3IgdnNjb2RlIzI5MDg2My4gV2Ugc2hvdWxkIHJldmlzaXQgc3RvcmluZyBmaWx0ZXIgc3RhdGUgcGVyLXdpbmRvdyB0byBhdm9pZCB0aGlzXG5cdHByaXZhdGUgX2JhZGdlRmlsdGVyQXBwbGllZEJ5VGhpc1dpbmRvdzogJ3VucmVhZCcgfCAnaW5Qcm9ncmVzcycgfCAnbmVlZHNJbnB1dCcgfCBudWxsID0gbnVsbDtcblxuXHQvKiogUmV1c2FibGUgbWVudSBmb3IgQ29tbWFuZENlbnRlckNlbnRlciBpdGVtcyAoZS5nLiwgZGVidWcgdG9vbGJhcikgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZENlbnRlck1lbnU7XG5cblx0LyoqIE1lbnUgZm9yIENoYXRUaXRsZUJhck1lbnUgaXRlbXMgKHNhbWUgYXMgY2hhdCBjb250cm9scyBkcm9wZG93bikgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFRpdGxlQmFyTWVudTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd2luZG93VGl0bGU6IFdpbmRvd1RpdGxlLFxuXHRcdG9wdGlvbnM6IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZTogSUFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFNlc3Npb25zU2VydmljZTogSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cblx0XHQvLyBDcmVhdGUgbWVudSBmb3IgQ29tbWFuZENlbnRlckNlbnRlciB0byBnZXQgaXRlbXMgbGlrZSBkZWJ1ZyB0b29sYmFyXG5cdFx0dGhpcy5fY29tbWFuZENlbnRlck1lbnUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLkNvbW1hbmRDZW50ZXJDZW50ZXIsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpKTtcblxuXHRcdC8vIENyZWF0ZSBtZW51IGZvciBDaGF0VGl0bGVCYXJNZW51IHRvIHNob3cgaW4gc3BhcmtsZSBzZWN0aW9uIGRyb3Bkb3duXG5cdFx0dGhpcy5fY2hhdFRpdGxlQmFyTWVudSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuQ2hhdFRpdGxlQmFyTWVudSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gY29udHJvbCBtb2RlIG9yIHNlc3Npb24gaW5mbyBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZS5vbkRpZENoYW5nZU1vZGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25JbmZvKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlLXJlbmRlciB3aGVuIHNlc3Npb25zIGNoYW5nZSB0byB1cGRhdGUgc3RhdGlzdGljc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwub25EaWRDaGFuZ2VTZXNzaW9ucygoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiB3aW5kb3cgdGl0bGUgY2hhbmdlcyAoaG9ub3JzIHVzZXIncyB3aW5kb3cudGl0bGUgc2V0dGluZylcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93aW5kb3dUaXRsZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiBhY3RpdmUgZWRpdG9yIGNoYW5nZXMgKGZvciBmaWxlIG5hbWUgZGlzcGxheSB3aGVuIHRhYnMgYXJlIGhpZGRlbilcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gdGFicyB2aXNpYmlsaXR5IGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2Uub25EaWRDaGFuZ2VFZGl0b3JQYXJ0T3B0aW9ucygoeyBuZXdQYXJ0T3B0aW9ucywgb2xkUGFydE9wdGlvbnMgfSkgPT4ge1xuXHRcdFx0aWYgKG5ld1BhcnRPcHRpb25zLnNob3dUYWJzICE9PSBvbGRQYXJ0T3B0aW9ucy5zaG93VGFicykge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiBjb21tYW5kIGNlbnRlciBtZW51IGNoYW5nZXMgKGUuZy4sIGRlYnVnIHRvb2xiYXIgdmlzaWJpbGl0eSlcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb21tYW5kQ2VudGVyTWVudS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9sYXN0UmVuZGVyU3RhdGUgPSB1bmRlZmluZWQ7IC8vIEZvcmNlIHJlLXJlbmRlclxuXHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gc3RvcmFnZSBjaGFuZ2VzIChlLmcuLCBmaWx0ZXIgc3RhdGUgY2hhbmdlcyBmcm9tIHNlc3Npb25zIHZpZXcpXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAnYWdlbnRTZXNzaW9ucy5maWx0ZXJFeGNsdWRlcy5hZ2VudHNlc3Npb25zdmlld2VyZmlsdGVyc3VibWVudScsIHRoaXMuX3N0b3JlKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiBaZW4gbW9kZSB0b2dnbGVzLCB0byBoaWRlIGFsbCBhZ2VudCBkaXN0cmFjdGlvbnNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKG5ldyBTZXQoW0luRWRpdG9yWmVuTW9kZUNvbnRleHQua2V5XSkpKSB7XG5cdFx0XHRcdHRoaXMuX2xhc3RSZW5kZXJTdGF0ZSA9IHVuZGVmaW5lZDsgLy8gRm9yY2UgcmUtcmVuZGVyXG5cdFx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlLXJlbmRlciB3aGVuIHNldHRpbmdzIGNoYW5nZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkFnZW50U3RhdHVzRW5hYmxlZClcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5VbmlmaWVkQWdlbnRzQmFyKVxuXHRcdFx0XHR8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3U2Vzc2lvbnNFbmFibGVkKVxuXHRcdFx0XHR8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRBSURpc2FibGVkU2V0dGluZ0lkKVxuXHRcdFx0XHR8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdkaXNhYmxlQUlDdXN0b21pemF0aW9ucycpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaC5kaXNhYmxlQUlDdXN0b21pemF0aW9ucycpXG5cdFx0XHQpIHtcblx0XHRcdFx0dGhpcy5fbGFzdFJlbmRlclN0YXRlID0gdW5kZWZpbmVkOyAvLyBGb3JjZSByZS1yZW5kZXJcblx0XHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gY2hhdCBlbnRpdGxlbWVudCBvciBxdW90YSBjaGFuZ2VzIChmb3Igc2lnbi1pbiAvIHF1b3RhIGV4Y2VlZGVkIHN0YXRlcylcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudFV0aWxzLmFueShcblx0XHRcdHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVNlbnRpbWVudCxcblx0XHRcdHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQsXG5cdFx0XHR0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VFbnRpdGxlbWVudCxcblx0XHRcdHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZUFub255bW91c1xuXHRcdCkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbGFzdFJlbmRlclN0YXRlID0gdW5kZWZpbmVkOyAvLyBGb3JjZSByZS1yZW5kZXJcblx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlLXJlbmRlciB3aGVuIGNoYXQgd2lkZ2V0cyBhcmUgYWRkZWQgb3IgYmFja2dyb3VuZGVkIHRvIHVwZGF0ZSBhY3RpdmUvdW5yZWFkIHNlc3Npb24gY291bnRzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0V2lkZ2V0U2VydmljZS5vbkRpZEFkZFdpZGdldCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLm9uRGlkQmFja2dyb3VuZFNlc3Npb24oKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHR0aGlzLl9jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2FnZW50LXN0YXR1cy1jb250YWluZXInKTtcblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3Rvb2xiYXInKTtcblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2FnZW50U3RhdHVzVG9vbGJhckxhYmVsJywgXCJBZ2VudCBTdGF0dXNcIikpO1xuXHRcdC8vIENvbnRhaW5lciBzaG91bGQgbm90IGJlIGZvY3VzYWJsZSAtIGlubmVyIGVsZW1lbnRzIGhhbmRsZSBmb2N1c1xuXHRcdGNvbnRhaW5lci50YWJJbmRleCA9IC0xO1xuXG5cdFx0Ly8gSW5pdGlhbCByZW5kZXJcblx0XHR0aGlzLl9yZW5kZXIoKTtcblx0fVxuXG5cdC8vIE92ZXJyaWRlIGZvY3VzIG1ldGhvZHMgLSB0aGUgY29udGFpbmVyIGl0c2VsZiBzaG91bGRuJ3QgYmUgZm9jdXNhYmxlLFxuXHQvLyBmb2N1cyBpcyBoYW5kbGVkIGJ5IHRoZSBpbm5lciBpbnRlcmFjdGl2ZSBlbGVtZW50cyAoYmFkZ2Ugc2VjdGlvbnMpXG5cdG92ZXJyaWRlIHNldEZvY3VzYWJsZShfZm9jdXNhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gRG9uJ3Qgc2V0IGZvY3VzYWJsZSBvbiB0aGUgY29udGFpbmVyXG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9yb3ZpbmdFbGVtZW50c1t0aGlzLl9yb3ZpbmdJbmRleF0/LmZvY3VzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBibHVyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBnZXRXaW5kb3codGhpcy5fY29udGFpbmVyKS5kb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXHRcdGlmIChpc0hUTUxFbGVtZW50KGFjdGl2ZUVsZW1lbnQpICYmIHRoaXMuX2NvbnRhaW5lci5jb250YWlucyhhY3RpdmVFbGVtZW50KSkge1xuXHRcdFx0YWN0aXZlRWxlbWVudC5ibHVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2lzUmVuZGVyaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzUmVuZGVyaW5nID0gdHJ1ZTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBDb21wdXRlIGN1cnJlbnQgcmVuZGVyIHN0YXRlIHRvIGF2b2lkIHVubmVjZXNzYXJ5IERPTSByZWJ1aWxkc1xuXHRcdFx0Y29uc3QgbW9kZSA9IHRoaXMuYWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UubW9kZTtcblx0XHRcdGNvbnN0IHNlc3Npb25JbmZvID0gdGhpcy5hZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZS5zZXNzaW9uSW5mbztcblx0XHRcdGNvbnN0IHsgYWN0aXZlU2Vzc2lvbnMsIHVucmVhZFNlc3Npb25zLCBhdHRlbnRpb25OZWVkZWRTZXNzaW9ucyB9ID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRzKCk7XG5cblx0XHRcdC8vIEdldCBhdHRlbnRpb24gc2Vzc2lvbiBpbmZvIGZvciBzdGF0ZSBjb21wdXRhdGlvblxuXHRcdFx0Y29uc3QgYXR0ZW50aW9uU2Vzc2lvbiA9IGF0dGVudGlvbk5lZWRlZFNlc3Npb25zLmxlbmd0aCA+IDBcblx0XHRcdFx0PyBbLi4uYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnNdLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0XHRjb25zdCB0aW1lQSA9IGEudGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCA/PyBhLnRpbWluZy5jcmVhdGVkO1xuXHRcdFx0XHRcdGNvbnN0IHRpbWVCID0gYi50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkID8/IGIudGltaW5nLmNyZWF0ZWQ7XG5cdFx0XHRcdFx0cmV0dXJuIHRpbWVCIC0gdGltZUE7XG5cdFx0XHRcdH0pWzBdXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBhdHRlbnRpb25UZXh0ID0gYXR0ZW50aW9uU2Vzc2lvbj8uZGVzY3JpcHRpb25cblx0XHRcdFx0PyAodHlwZW9mIGF0dGVudGlvblNlc3Npb24uZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0PyBhdHRlbnRpb25TZXNzaW9uLmRlc2NyaXB0aW9uXG5cdFx0XHRcdFx0OiByZW5kZXJBc1BsYWludGV4dChhdHRlbnRpb25TZXNzaW9uLmRlc2NyaXB0aW9uKSlcblx0XHRcdFx0OiBhdHRlbnRpb25TZXNzaW9uPy5sYWJlbDtcblxuXHRcdFx0Y29uc3QgbGFiZWwgPSB0aGlzLl9nZXRMYWJlbCgpO1xuXG5cdFx0XHQvLyBHZXQgY3VycmVudCBmaWx0ZXIgc3RhdGUgZm9yIHN0YXRlIGtleVxuXHRcdFx0Y29uc3QgeyBpc0ZpbHRlcmVkVG9VbnJlYWQsIGlzRmlsdGVyZWRUb0luUHJvZ3Jlc3MsIGlzRmlsdGVyZWRUb05lZWRzSW5wdXQgfSA9IHRoaXMuX2dldEN1cnJlbnRGaWx0ZXJTdGF0ZSgpO1xuXG5cdFx0XHRjb25zdCBzdGF0dXNNb2RlID0gZ2V0QWdlbnRTdGF0dXNTZXR0aW5nTW9kZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHVuaWZpZWRBZ2VudHNCYXJFbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5VbmlmaWVkQWdlbnRzQmFyKSA9PT0gdHJ1ZTtcblx0XHRcdGNvbnN0IHZpZXdTZXNzaW9uc0VuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3U2Vzc2lvbnNFbmFibGVkKSAhPT0gZmFsc2U7XG5cblx0XHRcdC8vIEJ1aWxkIHN0YXRlIGtleSBmb3IgY29tcGFyaXNvblxuXHRcdFx0Y29uc3Qgc3RhdGVLZXkgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdG1vZGUsXG5cdFx0XHRcdHNlc3Npb25UaXRsZTogc2Vzc2lvbkluZm8/LnRpdGxlLFxuXHRcdFx0XHRhY3RpdmVDb3VudDogYWN0aXZlU2Vzc2lvbnMubGVuZ3RoLFxuXHRcdFx0XHR1bnJlYWRDb3VudDogdW5yZWFkU2Vzc2lvbnMubGVuZ3RoLFxuXHRcdFx0XHRhdHRlbnRpb25Db3VudDogYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMubGVuZ3RoLFxuXHRcdFx0XHRhdHRlbnRpb25UZXh0LFxuXHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0aXNGaWx0ZXJlZFRvVW5yZWFkLFxuXHRcdFx0XHRpc0ZpbHRlcmVkVG9JblByb2dyZXNzLFxuXHRcdFx0XHRpc0ZpbHRlcmVkVG9OZWVkc0lucHV0LFxuXHRcdFx0XHRzdGF0dXNNb2RlLFxuXHRcdFx0XHR1bmlmaWVkQWdlbnRzQmFyRW5hYmxlZCxcblx0XHRcdFx0dmlld1Nlc3Npb25zRW5hYmxlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBTa2lwIHJlLXJlbmRlciBpZiBzdGF0ZSBoYXNuJ3QgY2hhbmdlZFxuXHRcdFx0aWYgKHRoaXMuX2xhc3RSZW5kZXJTdGF0ZSA9PT0gc3RhdGVLZXkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbGFzdFJlbmRlclN0YXRlID0gc3RhdGVLZXk7XG5cblx0XHRcdC8vIENsZWFyIGV4aXN0aW5nIGNvbnRlbnRcblx0XHRcdHJlc2V0KHRoaXMuX2NvbnRhaW5lcik7XG5cblx0XHRcdC8vIENsZWFyIHByZXZpb3VzIGRpc3Bvc2FibGVzIGFuZCByb3ZpbmcgZWxlbWVudHMgZm9yIGR5bmFtaWMgY29udGVudFxuXHRcdFx0dGhpcy5fZHluYW1pY0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9yb3ZpbmdFbGVtZW50cyA9IFtdO1xuXG5cdFx0XHRpZiAodGhpcy5hZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZS5tb2RlID09PSBBZ2VudFN0YXR1c01vZGUuU2Vzc2lvbikge1xuXHRcdFx0XHQvLyBBZ2VudCBTZXNzaW9uIFByb2plY3Rpb24gbW9kZSAtIHNob3cgc2Vzc2lvbiB0aXRsZSArIGNsb3NlIGJ1dHRvblxuXHRcdFx0XHR0aGlzLl9yZW5kZXJTZXNzaW9uTW9kZSh0aGlzLl9keW5hbWljRGlzcG9zYWJsZXMpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLm1vZGUgPT09IEFnZW50U3RhdHVzTW9kZS5TZXNzaW9uUmVhZHkpIHtcblx0XHRcdFx0Ly8gU2Vzc2lvbiByZWFkeSBtb2RlIC0gc2hvdyBzZXNzaW9uIHRpdGxlICsgZW50ZXIgcHJvamVjdGlvbiBidXR0b25cblx0XHRcdFx0dGhpcy5fcmVuZGVyU2Vzc2lvblJlYWR5TW9kZSh0aGlzLl9keW5hbWljRGlzcG9zYWJsZXMpO1xuXHRcdFx0fSBlbHNlIGlmIChzdGF0dXNNb2RlID09PSAnY29tcGFjdCcpIHtcblx0XHRcdFx0Ly8gQ29tcGFjdCBtb2RlIC0gcmVwbGFjZSBjb21tYW5kIGNlbnRlciBzZWFyY2ggd2l0aCBpbnRlZ3JhdGVkIGNvbnRyb2xcblx0XHRcdFx0dGhpcy5fcmVuZGVyQ2hhdElucHV0TW9kZSh0aGlzLl9keW5hbWljRGlzcG9zYWJsZXMpO1xuXHRcdFx0fSBlbHNlIGlmIChzdGF0dXNNb2RlID09PSAnYmFkZ2UnKSB7XG5cdFx0XHRcdC8vIEJhZGdlIG1vZGUgLSByZW5kZXIgc3RhdHVzIGJhZGdlIG5leHQgdG8gY29tbWFuZCBjZW50ZXIgc2VhcmNoXG5cdFx0XHRcdHRoaXMuX3JlbmRlclN0YXR1c0JhZGdlKHRoaXMuX2R5bmFtaWNEaXNwb3NhYmxlcywgYWN0aXZlU2Vzc2lvbnMsIHVucmVhZFNlc3Npb25zLCBhdHRlbnRpb25OZWVkZWRTZXNzaW9ucyk7XG5cdFx0XHR9XG5cdFx0XHQvLyBIaWRkZW4gbW9kZSBpbnRlbnRpb25hbGx5IHJlbmRlcnMgbm90aGluZy5cblxuXHRcdFx0Ly8gU2V0dXAgcm92aW5nIHRhYmluZGV4IGZvciBrZXlib2FyZCBuYXZpZ2F0aW9uXG5cdFx0XHR0aGlzLl9zZXR1cFJvdmluZ1RhYkluZGV4KHRoaXMuX2R5bmFtaWNEaXNwb3NhYmxlcyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2lzUmVuZGVyaW5nID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNldHVwIHJvdmluZyB0YWJpbmRleCBmb3IgYXJyb3cga2V5IG5hdmlnYXRpb24gYmV0d2VlbiBpbnRlcmFjdGl2ZSBlbGVtZW50cy5cblx0ICogVXNlcyB0aGUgZWxlbWVudHMgcmVnaXN0ZXJlZCBpbiBgdGhpcy5fcm92aW5nRWxlbWVudHNgIGluIHRoZWlyIGV4aXN0aW5nIG9yZGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2V0dXBSb3ZpbmdUYWJJbmRleChkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIgfHwgdGhpcy5fcm92aW5nRWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3JvdmluZ0luZGV4ID49IHRoaXMuX3JvdmluZ0VsZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fcm92aW5nSW5kZXggPSAwO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3JvdmluZ0VsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLl9yb3ZpbmdFbGVtZW50c1tpXS50YWJJbmRleCA9IGkgPT09IHRoaXMuX3JvdmluZ0luZGV4ID8gMCA6IC0xO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fY29udGFpbmVyLCBFdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX3JvdmluZ0VsZW1lbnRzLmZpbmRJbmRleChlbCA9PiBlbCA9PT0gZS50YXJnZXQgfHwgZWwuY29udGFpbnMoZS50YXJnZXQgYXMgTm9kZSkpO1xuXHRcdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5leHRJbmRleCA9IHRoaXMuX2dldE5leHRSb3ZpbmdJbmRleChpbmRleCwgZS5rZXkpO1xuXHRcdFx0aWYgKG5leHRJbmRleCAhPT0gdW5kZWZpbmVkICYmIG5leHRJbmRleCAhPT0gaW5kZXgpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9tb3ZlUm92aW5nRm9jdXMoaW5kZXgsIG5leHRJbmRleCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1vdmVzIHJvdmluZyBmb2N1cyBmcm9tIGBjdXJyZW50SW5kZXhgIHRvIGBuZXh0SW5kZXhgLCB1cGRhdGluZyB0YWJJbmRleCBhbmQgZm9jdXNpbmcgdGhlIGVsZW1lbnQuXG5cdCAqL1xuXHRwcml2YXRlIF9tb3ZlUm92aW5nRm9jdXMoY3VycmVudEluZGV4OiBudW1iZXIsIG5leHRJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcm92aW5nRWxlbWVudHNbY3VycmVudEluZGV4XS50YWJJbmRleCA9IC0xO1xuXHRcdHRoaXMuX3JvdmluZ0VsZW1lbnRzW25leHRJbmRleF0udGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuX3JvdmluZ0VsZW1lbnRzW25leHRJbmRleF0uZm9jdXMoKTtcblx0XHR0aGlzLl9yb3ZpbmdJbmRleCA9IG5leHRJbmRleDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBuZXh0IHJvdmluZyBpbmRleCBmb3IgdGhlIGdpdmVuIGtleSwgb3IgYHVuZGVmaW5lZGAgaWYgbm8gbmF2aWdhdGlvbiBzaG91bGQgb2NjdXIuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXROZXh0Um92aW5nSW5kZXgoY3VycmVudEluZGV4OiBudW1iZXIsIGtleTogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsZW4gPSB0aGlzLl9yb3ZpbmdFbGVtZW50cy5sZW5ndGg7XG5cdFx0c3dpdGNoIChrZXkpIHtcblx0XHRcdGNhc2UgJ0Fycm93UmlnaHQnOiByZXR1cm4gKGN1cnJlbnRJbmRleCArIDEpICUgbGVuO1xuXHRcdFx0Y2FzZSAnQXJyb3dMZWZ0JzogcmV0dXJuIChjdXJyZW50SW5kZXggLSAxICsgbGVuKSAlIGxlbjtcblx0XHRcdGNhc2UgJ0hvbWUnOiByZXR1cm4gMDtcblx0XHRcdGNhc2UgJ0VuZCc6IHJldHVybiBsZW4gLSAxO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvLyAjcmVnaW9uIFNlc3Npb24gU3RhdGlzdGljc1xuXG5cdC8qKlxuXHQgKiBHZXQgY29tcHV0ZWQgc2Vzc2lvbiBzdGF0aXN0aWNzIGZvciByZW5kZXJpbmcuXG5cdCAqIFJlc3BlY3RzIHRoZSBjdXJyZW50IHByb3ZpZGVyIChzZXNzaW9uIHR5cGUpIGZpbHRlciB3aGVuIGNhbGN1bGF0aW5nIGNvdW50cy5cblx0ICovXG5cdHByaXZhdGUgX2dldFNlc3Npb25TdGF0cygpOiB7XG5cdFx0YWN0aXZlU2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXTtcblx0XHR1bnJlYWRTZXNzaW9uczogSUFnZW50U2Vzc2lvbltdO1xuXHRcdGF0dGVudGlvbk5lZWRlZFNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW107XG5cdFx0aGFzQWN0aXZlU2Vzc2lvbnM6IGJvb2xlYW47XG5cdFx0aGFzVW5yZWFkU2Vzc2lvbnM6IGJvb2xlYW47XG5cdFx0aGFzQXR0ZW50aW9uTmVlZGVkOiBib29sZWFuO1xuXHR9IHtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuc2Vzc2lvbnM7XG5cblx0XHQvLyBHZXQgZXhjbHVkZWQgcHJvdmlkZXJzIGZyb20gY3VycmVudCBmaWx0ZXIgdG8gcmVzcGVjdCBzZXNzaW9uIHR5cGUgZmlsdGVyc1xuXHRcdGNvbnN0IGN1cnJlbnRGaWx0ZXIgPSB0aGlzLl9nZXRTdG9yZWRGaWx0ZXIoKTtcblx0XHRjb25zdCBleGNsdWRlZFByb3ZpZGVycyA9IGN1cnJlbnRGaWx0ZXI/LnByb3ZpZGVycyA/PyBbXTtcblxuXHRcdC8vIEZpbHRlciBzZXNzaW9ucyBieSBwcm92aWRlciB0eXBlIGZpcnN0IChyZXNwZWN0cyBzZXNzaW9uIHR5cGUgZmlsdGVycylcblx0XHRjb25zdCBmaWx0ZXJlZFNlc3Npb25zID0gZXhjbHVkZWRQcm92aWRlcnMubGVuZ3RoID4gMFxuXHRcdFx0PyBzZXNzaW9ucy5maWx0ZXIocyA9PiAhZXhjbHVkZWRQcm92aWRlcnMuaW5jbHVkZXMocy5wcm92aWRlclR5cGUpKVxuXHRcdFx0OiBzZXNzaW9ucztcblxuXHRcdC8vIEFjdGl2ZSBzZXNzaW9ucyBpbmNsdWRlIGJvdGggSW5Qcm9ncmVzcyBhbmQgTmVlZHNJbnB1dFxuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25zID0gZmlsdGVyZWRTZXNzaW9ucy5maWx0ZXIocyA9PiBpc1Nlc3Npb25JblByb2dyZXNzU3RhdHVzKHMuc3RhdHVzKSAmJiAhcy5pc0FyY2hpdmVkKCkpO1xuXHRcdGNvbnN0IHVucmVhZFNlc3Npb25zID0gZmlsdGVyZWRTZXNzaW9ucy5maWx0ZXIocyA9PiAhcy5pc1JlYWQoKSk7XG5cdFx0Ly8gU2Vzc2lvbnMgdGhhdCBuZWVkIHVzZXIgaW5wdXQvYXR0ZW50aW9uIChzdWJzZXQgb2YgYWN0aXZlKVxuXHRcdGNvbnN0IGF0dGVudGlvbk5lZWRlZFNlc3Npb25zID0gZmlsdGVyZWRTZXNzaW9ucy5maWx0ZXIocyA9PiBzLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQgJiYgIXRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2Uocy5yZXNvdXJjZSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGFjdGl2ZVNlc3Npb25zLFxuXHRcdFx0dW5yZWFkU2Vzc2lvbnMsXG5cdFx0XHRhdHRlbnRpb25OZWVkZWRTZXNzaW9ucyxcblx0XHRcdGhhc0FjdGl2ZVNlc3Npb25zOiBhY3RpdmVTZXNzaW9ucy5sZW5ndGggPiAwLFxuXHRcdFx0aGFzVW5yZWFkU2Vzc2lvbnM6IHVucmVhZFNlc3Npb25zLmxlbmd0aCA+IDAsXG5cdFx0XHRoYXNBdHRlbnRpb25OZWVkZWQ6IGF0dGVudGlvbk5lZWRlZFNlc3Npb25zLmxlbmd0aCA+IDAsXG5cdFx0fTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIE1vZGUgUmVuZGVyZXJzXG5cblx0cHJpdmF0ZSBfcmVuZGVyQ2hhdElucHV0TW9kZShkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGFjdGl2ZVNlc3Npb25zLCB1bnJlYWRTZXNzaW9ucywgYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMsIGhhc0F0dGVudGlvbk5lZWRlZCB9ID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRzKCk7XG5cblx0XHQvLyBDcmVhdGUgcGlsbFxuXHRcdGNvbnN0IHBpbGwgPSAkKCdkaXYuYWdlbnQtc3RhdHVzLXBpbGwuY2hhdC1pbnB1dC1tb2RlJyk7XG5cdFx0aWYgKGhhc0F0dGVudGlvbk5lZWRlZCkge1xuXHRcdFx0cGlsbC5jbGFzc0xpc3QuYWRkKCduZWVkcy1hdHRlbnRpb24nKTtcblx0XHR9XG5cdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHBpbGwpO1xuXG5cdFx0Ly8gUmVuZGVyIGNvbW1hbmQgY2VudGVyIGl0ZW1zIChsaWtlIGRlYnVnIHRvb2xiYXIpIGluc2lkZSB0aGUgcGlsbFxuXHRcdHRoaXMuX3JlbmRlckNvbW1hbmRDZW50ZXJUb29sYmFyKGRpc3Bvc2FibGVzLCBwaWxsKTtcblxuXHRcdC8vIENvbXBhY3QgbW9kZSBpcyBhbHdheXMgdHJ1ZSB3aGVuIHJlbmRlcmluZyBjaGF0IGlucHV0IG1vZGUgKGNhbGxlciBhbHJlYWR5IGNoZWNrZWQgZm9yIGNvbXBhY3QpXG5cdFx0Y29uc3QgaXNDb21wYWN0TW9kZSA9IHRydWU7XG5cdFx0cGlsbC5jbGFzc0xpc3QudG9nZ2xlKCdjb21wYWN0LW1vZGUnLCBpc0NvbXBhY3RNb2RlKTtcblxuXHRcdC8vIExlZnQgaWNvbiBjb250YWluZXIgKHNwYXJrbGUgYnkgZGVmYXVsdCwgcmVwb3J0K2NvdW50IHdoZW4gYXR0ZW50aW9uIG5lZWRlZCwgc2VhcmNoIG9uIGhvdmVyKVxuXHRcdGNvbnN0IGxlZnRJY29uID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtbGVmdC1pY29uJyk7XG5cdFx0aWYgKGhhc0F0dGVudGlvbk5lZWRlZCkge1xuXHRcdFx0Ly8gU2hvdyByZXBvcnQgaWNvbiArIGNvdW50IHdoZW4gc2Vzc2lvbnMgbmVlZCBhdHRlbnRpb25cblx0XHRcdGNvbnN0IHJlcG9ydEljb24gPSByZW5kZXJJY29uKENvZGljb24ucmVwb3J0KTtcblx0XHRcdGNvbnN0IGNvdW50U3BhbiA9ICQoJ3NwYW4uYWdlbnQtc3RhdHVzLWF0dGVudGlvbi1jb3VudCcpO1xuXHRcdFx0Y291bnRTcGFuLnRleHRDb250ZW50ID0gU3RyaW5nKGF0dGVudGlvbk5lZWRlZFNlc3Npb25zLmxlbmd0aCk7XG5cdFx0XHRyZXNldChsZWZ0SWNvbiwgcmVwb3J0SWNvbiwgY291bnRTcGFuKTtcblx0XHRcdGxlZnRJY29uLmNsYXNzTGlzdC5hZGQoJ2hhcy1hdHRlbnRpb24nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzZXQobGVmdEljb24sIHJlbmRlckljb24oQ29kaWNvbi5zZWFyY2hTcGFya2xlKSk7XG5cdFx0fVxuXHRcdGlmICghaXNDb21wYWN0TW9kZSkge1xuXHRcdFx0cGlsbC5hcHBlbmRDaGlsZChsZWZ0SWNvbik7XG5cdFx0fVxuXG5cdFx0Ly8gSW5wdXQgYXJlYSB3cmFwcGVyIC0gaG92ZXIgb25seSBhY3RpdmF0ZXMgaGVyZSwgbm90IG9uIGJhZGdlIHNlY3Rpb25zXG5cdFx0Y29uc3QgaW5wdXRBcmVhID0gJCgnZGl2LmFnZW50LXN0YXR1cy1pbnB1dC1hcmVhJyk7XG5cdFx0aW5wdXRBcmVhLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRpbnB1dEFyZWEuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ29wZW5RdWlja0FjY2VzcycsIFwiT3BlbiBRdWljayBBY2Nlc3NcIikpO1xuXHRcdGlucHV0QXJlYS50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5fcm92aW5nRWxlbWVudHMucHVzaChpbnB1dEFyZWEpO1xuXHRcdHBpbGwuYXBwZW5kQ2hpbGQoaW5wdXRBcmVhKTtcblxuXHRcdC8vIExhYmVsIC0gYWx3YXlzIHNob3dzIHdvcmtzcGFjZSBuYW1lIGluIGNvbXBhY3QgbW9kZVxuXHRcdGNvbnN0IGxhYmVsID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtbGFiZWwnKTtcblx0XHRjb25zdCB7IHByb2dyZXNzOiBwcm9ncmVzc1RleHQgfSA9IHRoaXMuX2dldFNlc3Npb25OZWVkaW5nQXR0ZW50aW9uKGF0dGVudGlvbk5lZWRlZFNlc3Npb25zKTtcblx0XHRjb25zdCBkZWZhdWx0TGFiZWwgPSBpc0NvbXBhY3RNb2RlID8gdGhpcy5fZ2V0TGFiZWwoKSA6IChwcm9ncmVzc1RleHQgPz8gdGhpcy5fZ2V0TGFiZWwoKSk7XG5cblx0XHRpZiAoIWlzQ29tcGFjdE1vZGUgJiYgcHJvZ3Jlc3NUZXh0KSB7XG5cdFx0XHRsYWJlbC5jbGFzc0xpc3QuYWRkKCdoYXMtcHJvZ3Jlc3MnKTtcblx0XHR9XG5cblx0XHRjb25zdCBob3ZlckxhYmVsID0gbG9jYWxpemUoJ2Fza0FueXRoaW5nUGxhY2Vob2xkZXInLCBcIkFzayBhbnl0aGluZyBvciBkZXNjcmliZSB3aGF0IHRvIGJ1aWxkXCIpO1xuXG5cdFx0bGFiZWwudGV4dENvbnRlbnQgPSBkZWZhdWx0TGFiZWw7XG5cdFx0aW5wdXRBcmVhLmFwcGVuZENoaWxkKGxhYmVsKTtcblxuXHRcdGlmIChpc0NvbXBhY3RNb2RlKSB7XG5cdFx0XHQvLyBDb21wYWN0IG1vZGU6IGhvdmVyIHJlc2V0cyBpY29uIHN0YXRlIGJ1dCBrZWVwcyB3b3Jrc3BhY2UgbmFtZVxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEFyZWEsIEV2ZW50VHlwZS5NT1VTRV9FTlRFUiwgKCkgPT4ge1xuXHRcdFx0XHRyZXNldChsZWZ0SWNvbiwgcmVuZGVySWNvbihDb2RpY29uLnNlYXJjaFNwYXJrbGUpKTtcblx0XHRcdFx0bGVmdEljb24uY2xhc3NMaXN0LnJlbW92ZSgnaGFzLWF0dGVudGlvbicpO1xuXHRcdFx0XHRsYWJlbC5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtcHJvZ3Jlc3MnKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEFyZWEsIEV2ZW50VHlwZS5NT1VTRV9MRUFWRSwgKCkgPT4ge1xuXHRcdFx0XHRyZXNldChsZWZ0SWNvbiwgcmVuZGVySWNvbihDb2RpY29uLnNlYXJjaFNwYXJrbGUpKTtcblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gU2VuZCBpY29uIChoaWRkZW4gYnkgZGVmYXVsdCwgc2hvd24gb24gaG92ZXIgLSBvbmx5IHdoZW4gbm90IHNob3dpbmcgYXR0ZW50aW9uIG1lc3NhZ2UpXG5cdFx0XHRjb25zdCBzZW5kSWNvbiA9ICQoJ3NwYW4uYWdlbnQtc3RhdHVzLXNlbmQnKTtcblx0XHRcdHJlc2V0KHNlbmRJY29uLCByZW5kZXJJY29uKENvZGljb24uc2VuZCkpO1xuXHRcdFx0c2VuZEljb24uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0XHRpbnB1dEFyZWEuYXBwZW5kQ2hpbGQoc2VuZEljb24pO1xuXG5cdFx0XHQvLyBIb3ZlciBiZWhhdmlvciAtIHN3YXAgaWNvbiBhbmQgbGFiZWwgKG9ubHkgd2hlbiBzaG93aW5nIGRlZmF1bHQgc3RhdGUpLlxuXHRcdFx0aWYgKCFwcm9ncmVzc1RleHQpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEFyZWEsIEV2ZW50VHlwZS5NT1VTRV9FTlRFUiwgKCkgPT4ge1xuXHRcdFx0XHRcdHJlc2V0KGxlZnRJY29uLCByZW5kZXJJY29uKENvZGljb24uc2VhcmNoU3BhcmtsZSkpO1xuXHRcdFx0XHRcdGxlZnRJY29uLmNsYXNzTGlzdC5yZW1vdmUoJ2hhcy1hdHRlbnRpb24nKTtcblx0XHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGhvdmVyTGFiZWw7XG5cdFx0XHRcdFx0bGFiZWwuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLXByb2dyZXNzJyk7XG5cdFx0XHRcdFx0c2VuZEljb24uY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0QXJlYSwgRXZlbnRUeXBlLk1PVVNFX0xFQVZFLCAoKSA9PiB7XG5cdFx0XHRcdFx0cmVzZXQobGVmdEljb24sIHJlbmRlckljb24oQ29kaWNvbi5zZWFyY2hTcGFya2xlKSk7XG5cdFx0XHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSBkZWZhdWx0TGFiZWw7XG5cdFx0XHRcdFx0c2VuZEljb24uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTZXR1cCBob3ZlciB0b29sdGlwIG9uIGlucHV0IGFyZWFcblx0XHRjb25zdCBob3ZlckRlbGVnYXRlID0gZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGhvdmVyRGVsZWdhdGUsIGlucHV0QXJlYSwgKCkgPT4ge1xuXHRcdFx0Y29uc3Qga2JGb3JUb29sdGlwID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKFVOSUZJRURfUVVJQ0tfQUNDRVNTX0FDVElPTl9JRCk/LmdldExhYmVsKCk7XG5cdFx0XHRyZXR1cm4ga2JGb3JUb29sdGlwXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2Fza1Rvb2x0aXAnLCBcIk9wZW4gUXVpY2sgQWNjZXNzICh7MH0pXCIsIGtiRm9yVG9vbHRpcClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYXNrVG9vbHRpcDInLCBcIk9wZW4gUXVpY2sgQWNjZXNzXCIpO1xuXHRcdH0pKTtcblxuXHRcdC8vIENsaWNrIGhhbmRsZXIgLSBhbHdheXMgb3BlbiBxdWljayBhY2Nlc3MgaW4gY29tcGFjdCBtb2RlIChhdHRlbnRpb24gc2Vzc2lvbnMgYXJlIGhhbmRsZWQgYnkgdGhlIGJhZGdlKVxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXRBcmVhLCBFdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QWdlbnRTdGF0dXNDbGlja0V2ZW50LCBBZ2VudFN0YXR1c0NsaWNrQ2xhc3NpZmljYXRpb24+KCdhZ2VudFN0YXR1c1dpZGdldC5jbGljaycsIHtcblx0XHRcdFx0c291cmNlOiAncGlsbCcsXG5cdFx0XHRcdGFjdGlvbjogJ3F1aWNrQWNjZXNzJyxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgdXNlVW5pZmllZFF1aWNrQWNjZXNzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5VbmlmaWVkQWdlbnRzQmFyKSA9PT0gdHJ1ZTtcblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQodXNlVW5pZmllZFF1aWNrQWNjZXNzID8gVU5JRklFRF9RVUlDS19BQ0NFU1NfQUNUSU9OX0lEIDogUVVJQ0tfT1BFTl9BQ1RJT05fSUQpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEtleWJvYXJkIGhhbmRsZXJcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0QXJlYSwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxBZ2VudFN0YXR1c0NsaWNrRXZlbnQsIEFnZW50U3RhdHVzQ2xpY2tDbGFzc2lmaWNhdGlvbj4oJ2FnZW50U3RhdHVzV2lkZ2V0LmNsaWNrJywge1xuXHRcdFx0XHRcdHNvdXJjZTogJ3BpbGwnLFxuXHRcdFx0XHRcdGFjdGlvbjogJ3F1aWNrQWNjZXNzJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IHVzZVVuaWZpZWRRdWlja0FjY2VzcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uVW5pZmllZEFnZW50c0JhcikgPT09IHRydWU7XG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQodXNlVW5pZmllZFF1aWNrQWNjZXNzID8gVU5JRklFRF9RVUlDS19BQ0NFU1NfQUNUSU9OX0lEIDogUVVJQ0tfT1BFTl9BQ1RJT05fSUQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEluIGNvbXBhY3QgbW9kZSwgcmVuZGVyIHN0YXR1cyBiYWRnZSBpbmxpbmUgd2l0aGluIHRoZSBwaWxsXG5cdFx0dGhpcy5fcmVuZGVyU3RhdHVzQmFkZ2UoZGlzcG9zYWJsZXMsIGFjdGl2ZVNlc3Npb25zLCB1bnJlYWRTZXNzaW9ucywgYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMsIHBpbGwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyU2Vzc2lvbk1vZGUoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBhY3RpdmVTZXNzaW9ucywgdW5yZWFkU2Vzc2lvbnMsIGF0dGVudGlvbk5lZWRlZFNlc3Npb25zIH0gPSB0aGlzLl9nZXRTZXNzaW9uU3RhdHMoKTtcblxuXHRcdC8vIFJlbmRlciBjb21tYW5kIGNlbnRlciBpdGVtcyAobGlrZSBkZWJ1ZyB0b29sYmFyKSBGSVJTVCAtIHRvIHRoZSBsZWZ0XG5cdFx0dGhpcy5fcmVuZGVyQ29tbWFuZENlbnRlclRvb2xiYXIoZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3QgcGlsbCA9ICQoJ2Rpdi5hZ2VudC1zdGF0dXMtcGlsbC5zZXNzaW9uLW1vZGUnKTtcblx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQocGlsbCk7XG5cblx0XHQvLyBTZWFyY2ggYnV0dG9uIChsZWZ0IHNpZGUsIGluc2lkZSBwaWxsKVxuXHRcdHRoaXMuX3JlbmRlclNlYXJjaEJ1dHRvbihkaXNwb3NhYmxlcywgcGlsbCk7XG5cblx0XHQvLyBTZXNzaW9uIHRpdGxlIChjZW50ZXIpXG5cdFx0Y29uc3QgdGl0bGVMYWJlbCA9ICQoJ3NwYW4uYWdlbnQtc3RhdHVzLXRpdGxlJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkluZm8gPSB0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLnNlc3Npb25JbmZvO1xuXHRcdHRpdGxlTGFiZWwudGV4dENvbnRlbnQgPSBzZXNzaW9uSW5mbz8udGl0bGUgPz8gbG9jYWxpemUoJ2FnZW50U2Vzc2lvblByb2plY3Rpb24nLCBcIkFnZW50IFNlc3Npb24gUHJvamVjdGlvblwiKTtcblx0XHRwaWxsLmFwcGVuZENoaWxkKHRpdGxlTGFiZWwpO1xuXG5cdFx0Ly8gRXNjYXBlIGJ1dHRvbiAocmlnaHQgc2lkZSlcblx0XHR0aGlzLl9yZW5kZXJFc2NhcGVCdXR0b24oZGlzcG9zYWJsZXMsIHBpbGwpO1xuXG5cdFx0Ly8gU2V0dXAgcGlsbCBob3ZlclxuXHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoaG92ZXJEZWxlZ2F0ZSwgcGlsbCwgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkluZm8gPSB0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLnNlc3Npb25JbmZvO1xuXHRcdFx0cmV0dXJuIHNlc3Npb25JbmZvID8gbG9jYWxpemUoJ2FnZW50U2Vzc2lvblByb2plY3Rpb25Ub29sdGlwJywgXCJBZ2VudCBTZXNzaW9uIFByb2plY3Rpb246IHswfVwiLCBzZXNzaW9uSW5mby50aXRsZSkgOiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uUHJvamVjdGlvbicsIFwiQWdlbnQgU2Vzc2lvbiBQcm9qZWN0aW9uXCIpO1xuXHRcdH0pKTtcblxuXHRcdC8vIENsaWNrIGhhbmRsZXIgLSBjbGlja2luZyBhbnl3aGVyZSBvbiBjb250YWluZXIgZXhpdHMgcHJvamVjdGlvblxuXHRcdGNvbnN0IGV4aXRIYW5kbGVyID0gKGU6IEV2ZW50KSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChFeGl0QWdlbnRTZXNzaW9uUHJvamVjdGlvbkFjdGlvbi5JRCk7XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBpbGwsIEV2ZW50VHlwZS5DTElDSywgZXhpdEhhbmRsZXIpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBpbGwsIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCBleGl0SGFuZGxlcikpO1xuXG5cdFx0Ly8gU3RhdHVzIGJhZGdlIChzZXBhcmF0ZSByZWN0YW5nbGUgb24gcmlnaHQpXG5cdFx0dGhpcy5fcmVuZGVyU3RhdHVzQmFkZ2UoZGlzcG9zYWJsZXMsIGFjdGl2ZVNlc3Npb25zLCB1bnJlYWRTZXNzaW9ucywgYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlciBzZXNzaW9uIHJlYWR5IG1vZGUgLSBzaG93cyBzZXNzaW9uIHRpdGxlICsgZW50ZXIgcHJvamVjdGlvbiBidXR0b24uXG5cdCAqIFVzZWQgd2hlbiBhIHByb2plY3Rpb24tY2FwYWJsZSBzZXNzaW9uIGlzIGF2YWlsYWJsZSBidXQgbm90IHlldCBlbnRlcmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyU2Vzc2lvblJlYWR5TW9kZShkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGFjdGl2ZVNlc3Npb25zLCB1bnJlYWRTZXNzaW9ucywgYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMgfSA9IHRoaXMuX2dldFNlc3Npb25TdGF0cygpO1xuXG5cdFx0Y29uc3QgcGlsbCA9ICQoJ2Rpdi5hZ2VudC1zdGF0dXMtcGlsbC5zZXNzaW9uLXJlYWR5LW1vZGUnKTtcblx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQocGlsbCk7XG5cblx0XHQvLyBTZXNzaW9uIHRpdGxlIChsZWZ0IHNpZGUpXG5cdFx0Y29uc3QgdGl0bGVMYWJlbCA9ICQoJ3NwYW4uYWdlbnQtc3RhdHVzLXRpdGxlJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkluZm8gPSB0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLnNlc3Npb25JbmZvO1xuXHRcdHRpdGxlTGFiZWwudGV4dENvbnRlbnQgPSBzZXNzaW9uSW5mbz8udGl0bGUgPz8gbG9jYWxpemUoJ2FnZW50U2Vzc2lvblJlYWR5JywgXCJSZXZpZXcgQ2hhbmdlc1wiKTtcblx0XHRwaWxsLmFwcGVuZENoaWxkKHRpdGxlTGFiZWwpO1xuXG5cdFx0Ly8gRW50ZXIgYnV0dG9uIChyaWdodCBzaWRlKVxuXHRcdHRoaXMuX3JlbmRlckVudGVyQnV0dG9uKGRpc3Bvc2FibGVzLCBwaWxsKTtcblxuXHRcdC8vIFNldHVwIHBpbGwgaG92ZXJcblx0XHRjb25zdCBob3ZlckRlbGVnYXRlID0gZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGhvdmVyRGVsZWdhdGUsIHBpbGwsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25JbmZvID0gdGhpcy5hZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZS5zZXNzaW9uSW5mbztcblx0XHRcdHJldHVybiBzZXNzaW9uSW5mbyA/IGxvY2FsaXplKCdhZ2VudFNlc3Npb25SZWFkeVRvb2x0aXAnLCBcIlJldmlldyBjaGFuZ2VzIGZyb206IHswfVwiLCBzZXNzaW9uSW5mby50aXRsZSkgOiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uUmVhZHlHZW5lcmljJywgXCJSZXZpZXcgYWdlbnQgc2Vzc2lvbiBjaGFuZ2VzXCIpO1xuXHRcdH0pKTtcblxuXHRcdC8vIENsaWNrIGhhbmRsZXIgLSBjbGlja2luZyBhbnl3aGVyZSBvbiBwaWxsIGVudGVycyBwcm9qZWN0aW9uXG5cdFx0Y29uc3QgZW50ZXJIYW5kbGVyID0gKGU6IEV2ZW50KSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkluZm8gPSB0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLnNlc3Npb25JbmZvO1xuXHRcdFx0aWYgKHNlc3Npb25JbmZvKSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvbkluZm8uc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEVudGVyQWdlbnRTZXNzaW9uUHJvamVjdGlvbkFjdGlvbi5JRCwgc2Vzc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIocGlsbCwgRXZlbnRUeXBlLkNMSUNLLCBlbnRlckhhbmRsZXIpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBpbGwsIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlbnRlckhhbmRsZXIpKTtcblxuXHRcdC8vIFN0YXR1cyBiYWRnZSAoc2VwYXJhdGUgcmVjdGFuZ2xlIG9uIHJpZ2h0KVxuXHRcdHRoaXMuX3JlbmRlclN0YXR1c0JhZGdlKGRpc3Bvc2FibGVzLCBhY3RpdmVTZXNzaW9ucywgdW5yZWFkU2Vzc2lvbnMsIGF0dGVudGlvbk5lZWRlZFNlc3Npb25zKTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIFJldXNhYmxlIENvbXBvbmVudHNcblxuXHQvKipcblx0ICogUmVuZGVyIGNvbW1hbmQgY2VudGVyIHRvb2xiYXIgaXRlbXMgKGxpa2UgZGVidWcgdG9vbGJhcikgdGhhdCBhcmUgcmVnaXN0ZXJlZCB0byBDb21tYW5kQ2VudGVyXG5cdCAqIEZpbHRlcnMgb3V0IHRoZSBxdWljayBvcGVuIGFjdGlvbiBzaW5jZSB3ZSBwcm92aWRlIG91ciBvd24gc2VhcmNoIFVJLlxuXHQgKiBBZGRzIGEgZG90IHNlcGFyYXRvciBhZnRlciB0aGUgdG9vbGJhciBpZiBjb250ZW50IHdhcyByZW5kZXJlZC5cblx0ICovXG5cdHByaXZhdGUgX3JlbmRlckNvbW1hbmRDZW50ZXJUb29sYmFyKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIHBhcmVudD86IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gcGFyZW50ID8/IHRoaXMuX2NvbnRhaW5lcjtcblx0XHRpZiAoIWNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEdldCBtZW51IGFjdGlvbnMgZnJvbSBDb21tYW5kQ2VudGVyQ2VudGVyIChlLmcuLCBkZWJ1ZyB0b29sYmFyKVxuXHRcdGNvbnN0IGFsbEFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgWywgYWN0aW9uc10gb2YgdGhpcy5fY29tbWFuZENlbnRlck1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRcdC8vIEZpbHRlciBvdXQgdGhlIHF1aWNrIG9wZW4gYWN0aW9uIC0gd2UgcHJvdmlkZSBvdXIgb3duIHNlYXJjaCBVSVxuXHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSBRVUlDS19PUEVOX0FDVElPTl9JRCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEZvciBzdWJtZW51cyAobGlrZSBkZWJ1ZyB0b29sYmFyKSwgYWRkIHRoZSBzdWJtZW51IGFjdGlvbnNcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVBY3Rpb24pIHtcblx0XHRcdFx0XHRhbGxBY3Rpb25zLnB1c2goLi4uYWN0aW9uLmFjdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFsbEFjdGlvbnMucHVzaChhY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gT25seSByZW5kZXIgdG9vbGJhciBpZiB0aGVyZSBhcmUgYWN0aW9uc1xuXHRcdGlmIChhbGxBY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKTtcblx0XHRjb25zdCB0b29sYmFyQ29udGFpbmVyID0gJCgnZGl2LmFnZW50LXN0YXR1cy1jb21tYW5kLWNlbnRlci10b29sYmFyJyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRvb2xiYXJDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdG9vbGJhciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoVG9vbEJhciwgdG9vbGJhckNvbnRhaW5lciwge1xuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnYWdlbnRTdGF0dXNDb21tYW5kQ2VudGVyJyxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUFjdGlvblZpZXdJdGVtKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBob3ZlckRlbGVnYXRlIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sYmFyKTtcblxuXHRcdHRvb2xiYXIuc2V0QWN0aW9ucyhhbGxBY3Rpb25zKTtcblxuXHRcdC8vIEFkZCBzZXBhcmF0b3IgYWZ0ZXIgdGhlIHRvb2xiYXJcblx0XHRpZiAocGFyZW50KSB7XG5cdFx0XHQvLyBJbnNpZGUgcGlsbCAoY29tcGFjdCBtb2RlKTogdXNlIGEgdmVydGljYWwgbGluZSBzZXBhcmF0b3Jcblx0XHRcdGNvbnN0IHNlcGFyYXRvciA9ICQoJ3NwYW4uYWdlbnQtc3RhdHVzLWxpbmUtc2VwYXJhdG9yJyk7XG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoc2VwYXJhdG9yKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gT3V0c2lkZSBwaWxsOiB1c2UgZG90IHNlcGFyYXRvciAobWF0Y2hpbmcgY29tbWFuZCBjZW50ZXIgc3R5bGUpXG5cdFx0XHRjb25zdCBzZXBhcmF0b3IgPSByZW5kZXJJY29uKENvZGljb24uY2lyY2xlU21hbGxGaWxsZWQpO1xuXHRcdFx0c2VwYXJhdG9yLmNsYXNzTGlzdC5hZGQoJ2FnZW50LXN0YXR1cy1zZXBhcmF0b3InKTtcblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChzZXBhcmF0b3IpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXIgdGhlIHNlYXJjaCBidXR0b24uIElmIHBhcmVudCBpcyBwcm92aWRlZCwgYXBwZW5kcyB0byBwYXJlbnQ7IG90aGVyd2lzZSBhcHBlbmRzIHRvIGNvbnRhaW5lci5cblx0ICovXG5cdHByaXZhdGUgX3JlbmRlclNlYXJjaEJ1dHRvbihkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBwYXJlbnQ/OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHBhcmVudCA/PyB0aGlzLl9jb250YWluZXI7XG5cdFx0aWYgKCFjb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWFyY2hCdXR0b24gPSAkKCdzcGFuLmFnZW50LXN0YXR1cy1zZWFyY2gnKTtcblx0XHRyZXNldChzZWFyY2hCdXR0b24sIHJlbmRlckljb24oQ29kaWNvbi5zZWFyY2hTcGFya2xlKSk7XG5cdFx0c2VhcmNoQnV0dG9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRzZWFyY2hCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ29wZW5RdWlja09wZW4nLCBcIk9wZW4gUXVpY2sgT3BlblwiKSk7XG5cdFx0c2VhcmNoQnV0dG9uLnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLl9yb3ZpbmdFbGVtZW50cy5wdXNoKHNlYXJjaEJ1dHRvbik7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHNlYXJjaEJ1dHRvbik7XG5cblx0XHQvLyBTZXR1cCBob3ZlclxuXHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKTtcblx0XHRjb25zdCBzZWFyY2hLYiA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhRVUlDS19PUEVOX0FDVElPTl9JRCk/LmdldExhYmVsKCk7XG5cdFx0Y29uc3Qgc2VhcmNoVG9vbHRpcCA9IHNlYXJjaEtiXG5cdFx0XHQ/IGxvY2FsaXplKCdvcGVuUXVpY2tPcGVuVG9vbHRpcCcsIFwiR28gdG8gRmlsZSAoezB9KVwiLCBzZWFyY2hLYilcblx0XHRcdDogbG9jYWxpemUoJ29wZW5RdWlja09wZW5Ub29sdGlwMicsIFwiR28gdG8gRmlsZVwiKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoaG92ZXJEZWxlZ2F0ZSwgc2VhcmNoQnV0dG9uLCBzZWFyY2hUb29sdGlwKSk7XG5cblx0XHQvLyBDbGljayBoYW5kbGVyXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihzZWFyY2hCdXR0b24sIEV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFFVSUNLX09QRU5fQUNUSU9OX0lEKTtcblx0XHR9KSk7XG5cblx0XHQvLyBLZXlib2FyZCBoYW5kbGVyXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihzZWFyY2hCdXR0b24sIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChRVUlDS19PUEVOX0FDVElPTl9JRCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlciB0aGUgc3RhdHVzIGJhZGdlIHNob3dpbmcgaW4tcHJvZ3Jlc3MsIG5lZWRzLWlucHV0LCBhbmQvb3IgdW5yZWFkIHNlc3Npb24gY291bnRzLlxuXHQgKiBTaG93cyBzcGxpdCBVSSB3aXRoIHNwYXJrbGUgaWNvbiBvbiBsZWZ0LCB0aGVuIHVucmVhZCwgbmVlZHMtaW5wdXQsIGFuZCBhY3RpdmUgaW5kaWNhdG9ycy5cblx0ICogQWx3YXlzIHJlbmRlcnMgdGhlIHNwYXJrbGUgaWNvbiBzZWN0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyU3RhdHVzQmFkZ2UoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgYWN0aXZlU2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSwgdW5yZWFkU2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSwgYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSwgaW5saW5lQ29udGFpbmVyPzogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc0FjdGl2ZVNlc3Npb25zID0gYWN0aXZlU2Vzc2lvbnMubGVuZ3RoID4gMDtcblx0XHRjb25zdCBoYXNVbnJlYWRTZXNzaW9ucyA9IHVucmVhZFNlc3Npb25zLmxlbmd0aCA+IDA7XG5cdFx0Y29uc3QgaGFzQXR0ZW50aW9uTmVlZGVkID0gYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMubGVuZ3RoID4gMDtcblxuXHRcdC8vIEF1dG8tY2xlYXIgZmlsdGVyIGlmIHRoZSBmaWx0ZXJlZCBjYXRlZ29yeSBiZWNvbWVzIGVtcHR5IGlmIHRoaXMgd2luZG93IGFwcGxpZWQgaXRcblx0XHR0aGlzLl9jbGVhckZpbHRlcklmQ2F0ZWdvcnlFbXB0eShoYXNVbnJlYWRTZXNzaW9ucywgaGFzQWN0aXZlU2Vzc2lvbnMsIGhhc0F0dGVudGlvbk5lZWRlZCk7XG5cblx0XHQvLyBXaGVuIGlubGluZUNvbnRhaW5lciBpcyBwcm92aWRlZCwgcmVuZGVyIHNlY3Rpb25zIGRpcmVjdGx5IGludG8gaXQgKGNvbXBhY3QgbW9kZSlcblx0XHQvLyBPdGhlcndpc2UsIGNyZWF0ZSBhIHNlcGFyYXRlIGJhZGdlIGNvbnRhaW5lclxuXHRcdGxldCBiYWRnZTogSFRNTEVsZW1lbnQ7XG5cdFx0aWYgKGlubGluZUNvbnRhaW5lcikge1xuXHRcdFx0YmFkZ2UgPSBpbmxpbmVDb250YWluZXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJhZGdlID0gJCgnZGl2LmFnZW50LXN0YXR1cy1iYWRnZScpO1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKGJhZGdlKTtcblx0XHR9XG5cblx0XHQvLyBTcGFya2xlIGRyb3Bkb3duIGJ1dHRvbiBzZWN0aW9uIChhbHdheXMgdmlzaWJsZSBvbiBsZWZ0KSAtIHByb3BlciBidXR0b24gd2l0aCBkcm9wZG93biBtZW51XG5cdFx0Y29uc3Qgc3BhcmtsZUNvbnRhaW5lciA9ICQoJ3NwYW4uYWdlbnQtc3RhdHVzLWJhZGdlLXNlY3Rpb24uc3BhcmtsZScpO1xuXHRcdHNwYXJrbGVDb250YWluZXIudGFiSW5kZXggPSAwO1xuXG5cdFx0Ly8gR2V0IG1lbnUgYWN0aW9ucyBmb3IgZHJvcGRvd24gd2l0aCBwcm9wZXIgZ3JvdXAgc2VwYXJhdG9yc1xuXHRcdGNvbnN0IG1lbnVBY3Rpb25zOiBJQWN0aW9uW10gPSBTZXBhcmF0b3Iuam9pbiguLi50aGlzLl9jaGF0VGl0bGVCYXJNZW51LmdldEFjdGlvbnMoeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KS5tYXAoKFssIGFjdGlvbnNdKSA9PiBhY3Rpb25zKSk7XG5cblx0XHRjb25zdCBwcmltYXJ5QWN0aW9uSWQgPSBUT0dHTEVfQ0hBVF9BQ1RJT05fSUQ7XG5cdFx0Y29uc3QgcHJpbWFyeUFjdGlvblRpdGxlID0gbG9jYWxpemUoJ3RvZ2dsZUNoYXQnLCBcIlRvZ2dsZSBDaGF0XCIpO1xuXHRcdGNvbnN0IHByaW1hcnlBY3Rpb25JY29uID0gQ29kaWNvbi5jaGF0U3BhcmtsZTtcblxuXHRcdC8vIENyZWF0ZSBwcmltYXJ5IGFjdGlvblxuXHRcdGNvbnN0IHByaW1hcnlBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVJdGVtQWN0aW9uLCB7XG5cdFx0XHRpZDogcHJpbWFyeUFjdGlvbklkLFxuXHRcdFx0dGl0bGU6IHByaW1hcnlBY3Rpb25UaXRsZSxcblx0XHRcdGljb246IHByaW1hcnlBY3Rpb25JY29uLFxuXHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBDcmVhdGUgZHJvcGRvd24gYWN0aW9uIChlbXB0eSBsYWJlbCBwcmV2ZW50cyBkZWZhdWx0IHRvb2x0aXAgLSB3ZSBoYXZlIG91ciBvd24gaG92ZXIpXG5cdFx0Y29uc3QgZHJvcGRvd25BY3Rpb24gPSB0b0FjdGlvbih7XG5cdFx0XHRpZDogJ2FnZW50U3RhdHVzLnNwYXJrbGUuZHJvcGRvd24nLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudFN0YXR1cy5zcGFya2xlLmRyb3Bkb3duJywgXCJNb3JlIEFjdGlvbnNcIiksXG5cdFx0XHRydW4oKSB7IH1cblx0XHR9KTtcblxuXHRcdC8vIENyZWF0ZSB0aGUgZHJvcGRvd24gd2l0aCBwcmltYXJ5IGFjdGlvbiBidXR0b25cblx0XHRjb25zdCBzcGFya2xlRHJvcGRvd24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0RHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtLFxuXHRcdFx0cHJpbWFyeUFjdGlvbixcblx0XHRcdGRyb3Bkb3duQWN0aW9uLFxuXHRcdFx0bWVudUFjdGlvbnMsXG5cdFx0XHQnYWdlbnQtc3RhdHVzLXNwYXJrbGUtZHJvcGRvd24nLFxuXHRcdFx0eyBza2lwVGVsZW1ldHJ5OiB0cnVlLCBtZW51Q2xhc3NOYW1lOiBXT1JLQkVOQ0hfTUVOVV9NT1RJT05fQ0xBU1MsIGNsb3NlQW5pbWF0aW9uOiB3b3JrYmVuY2hNZW51Q2xvc2VBbmltYXRpb24gfVxuXHRcdCk7XG5cdFx0c3BhcmtsZURyb3Bkb3duLnJlbmRlcihzcGFya2xlQ29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3BhcmtsZURyb3Bkb3duKTtcblxuXHRcdC8vIENhcHR1cmUtcGhhc2UgbGlzdGVuZXIgZm9yIEFycm93TGVmdC9BcnJvd1JpZ2h0L0hvbWUvRW5kIHRvIHByZXZlbnQgRHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtXG5cdFx0Ly8gZnJvbSBjb25zdW1pbmcgdGhlc2Uga2V5cyBpbnRlcm5hbGx5LiBUaGlzIGVuc3VyZXMgdGhlIG91dGVyIHJvdmluZyB0YWJpbmRleCBoYW5kbGVzIG5hdmlnYXRpb24uXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihzcGFya2xlQ29udGFpbmVyLCBFdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdBcnJvd0xlZnQnIHx8IGUua2V5ID09PSAnQXJyb3dSaWdodCcgfHwgZS5rZXkgPT09ICdIb21lJyB8fCBlLmtleSA9PT0gJ0VuZCcpIHtcblx0XHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5fcm92aW5nRWxlbWVudHMuaW5kZXhPZihzcGFya2xlQ29udGFpbmVyKTtcblx0XHRcdFx0aWYgKGlkeCA9PT0gLTEpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbmV4dEluZGV4ID0gdGhpcy5fZ2V0TmV4dFJvdmluZ0luZGV4KGlkeCwgZS5rZXkpO1xuXHRcdFx0XHRpZiAobmV4dEluZGV4ICE9PSB1bmRlZmluZWQgJiYgbmV4dEluZGV4ICE9PSBpZHgpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHR0aGlzLl9tb3ZlUm92aW5nRm9jdXMoaWR4LCBuZXh0SW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSwgdHJ1ZSAvKiB1c2VDYXB0dXJlICovKSk7XG5cblx0XHQvLyBBZGQga2V5Ym9hcmQgaGFuZGxlciBmb3IgRW50ZXIvU3BhY2Ugb24gdGhlIHNwYXJrbGUgY29udGFpbmVyXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihzcGFya2xlQ29udGFpbmVyLCBFdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQocHJpbWFyeUFjdGlvbklkKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5rZXkgPT09ICdBcnJvd0Rvd24nIHx8IGUua2V5ID09PSAnQXJyb3dVcCcpIHtcblx0XHRcdFx0Ly8gT3BlbiBkcm9wZG93biBtZW51IHdpdGggYXJyb3cga2V5c1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHNwYXJrbGVEcm9wZG93bi5zaG93RHJvcGRvd24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBIb3ZlciBkZWxlZ2F0ZSBmb3Igc3RhdHVzIHNlY3Rpb25zXG5cdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpO1xuXG5cdFx0Ly8gT25seSBzaG93IHN0YXR1cyBpbmRpY2F0b3JzIGlmIGNoYXQudmlld1Nlc3Npb25zLmVuYWJsZWQgaXMgdHJ1ZVxuXHRcdGNvbnN0IHZpZXdTZXNzaW9uc0VuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3U2Vzc2lvbnNFbmFibGVkKSAhPT0gZmFsc2U7XG5cblx0XHQvLyBXaGVuIGNvbXBhY3QgbW9kZSBpcyBhY3RpdmUsIHNob3cgc3RhdHVzIGluZGljYXRvcnMgYmVmb3JlIHRoZSBzcGFya2xlIGJ1dHRvbjpcblx0XHQvLyBbbmVlZHMtaW5wdXQsIGFjdGl2ZSwgdW5yZWFkLCBzcGFya2xlXSAocG9wdWxhdGluZyBpbndhcmQpXG5cdFx0Ly8gT3RoZXJ3aXNlLCBrZWVwIG9yaWdpbmFsIG9yZGVyOiBbc3BhcmtsZSwgdW5yZWFkLCBhY3RpdmUsIG5lZWRzLWlucHV0XVxuXHRcdGNvbnN0IHJldmVyc2VPcmRlciA9ICEhaW5saW5lQ29udGFpbmVyO1xuXG5cdFx0aWYgKCFyZXZlcnNlT3JkZXIpIHtcblx0XHRcdC8vIE9yaWdpbmFsIG9yZGVyOiBzcGFya2xlIGZpcnN0XG5cdFx0XHRiYWRnZS5hcHBlbmRDaGlsZChzcGFya2xlQ29udGFpbmVyKTtcblx0XHR9XG5cblx0XHQvLyBCdWlsZCBzdGF0dXMgc2VjdGlvbnMgYnV0IGRvbid0IGFwcGVuZCB5ZXQgLSB3ZSBuZWVkIHRvIGNvbnRyb2wgb3JkZXJcblx0XHRsZXQgdW5yZWFkU2VjdGlvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGFjdGl2ZVNlY3Rpb246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBuZWVkc0lucHV0U2VjdGlvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBVbnJlYWQgc2VjdGlvbiAoYmx1ZSBkb3QgKyBjb3VudClcblx0XHRpZiAodmlld1Nlc3Npb25zRW5hYmxlZCAmJiBoYXNVbnJlYWRTZXNzaW9ucyAmJiB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHRjb25zdCB7IGlzRmlsdGVyZWRUb1VucmVhZCB9ID0gdGhpcy5fZ2V0Q3VycmVudEZpbHRlclN0YXRlKCk7XG5cdFx0XHR1bnJlYWRTZWN0aW9uID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtYmFkZ2Utc2VjdGlvbi51bnJlYWQnKTtcblx0XHRcdGlmIChpc0ZpbHRlcmVkVG9VbnJlYWQpIHtcblx0XHRcdFx0dW5yZWFkU2VjdGlvbi5jbGFzc0xpc3QuYWRkKCdmaWx0ZXJlZCcpO1xuXHRcdFx0fVxuXHRcdFx0dW5yZWFkU2VjdGlvbi5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHR1bnJlYWRTZWN0aW9uLnRhYkluZGV4ID0gMDtcblx0XHRcdGNvbnN0IHVucmVhZEljb24gPSAkKCdzcGFuLmFnZW50LXN0YXR1cy1pY29uJyk7XG5cdFx0XHRyZXNldCh1bnJlYWRJY29uLCByZW5kZXJJY29uKENvZGljb24uY2lyY2xlRmlsbGVkKSk7XG5cdFx0XHR1bnJlYWRTZWN0aW9uLmFwcGVuZENoaWxkKHVucmVhZEljb24pO1xuXHRcdFx0Y29uc3QgdW5yZWFkQ291bnQgPSAkKCdzcGFuLmFnZW50LXN0YXR1cy10ZXh0Jyk7XG5cdFx0XHR1bnJlYWRDb3VudC50ZXh0Q29udGVudCA9IFN0cmluZyh1bnJlYWRTZXNzaW9ucy5sZW5ndGgpO1xuXHRcdFx0dW5yZWFkU2VjdGlvbi5hcHBlbmRDaGlsZCh1bnJlYWRDb3VudCk7XG5cblx0XHRcdC8vIENsaWNrIGhhbmRsZXIgLSBmaWx0ZXIgdG8gdW5yZWFkIHNlc3Npb25zXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHVucmVhZFNlY3Rpb24sIEV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9vcGVuU2Vzc2lvbnNXaXRoRmlsdGVyKCd1bnJlYWQnKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodW5yZWFkU2VjdGlvbiwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHRoaXMuX29wZW5TZXNzaW9uc1dpdGhGaWx0ZXIoJ3VucmVhZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIEhvdmVyIHRvb2x0aXAgZm9yIHVucmVhZCBzZWN0aW9uXG5cdFx0XHRjb25zdCB1bnJlYWRUb29sdGlwID0gdW5yZWFkU2Vzc2lvbnMubGVuZ3RoID09PSAxXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3VucmVhZFNlc3Npb25zVG9vbHRpcDEnLCBcInswfSB1bnJlYWQgc2Vzc2lvblwiLCB1bnJlYWRTZXNzaW9ucy5sZW5ndGgpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3VucmVhZFNlc3Npb25zVG9vbHRpcCcsIFwiezB9IHVucmVhZCBzZXNzaW9uc1wiLCB1bnJlYWRTZXNzaW9ucy5sZW5ndGgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGhvdmVyRGVsZWdhdGUsIHVucmVhZFNlY3Rpb24sIHVucmVhZFRvb2x0aXApKTtcblx0XHR9XG5cblx0XHQvLyBOZWVkcy1pbnB1dCBzZWN0aW9uIC0gc2hvd3Mgc2Vzc2lvbnMgcmVxdWlyaW5nIHVzZXIgYXR0ZW50aW9uIChhcHByb3ZhbC9jb25maXJtYXRpb24vaW5wdXQpXG5cdFx0aWYgKHZpZXdTZXNzaW9uc0VuYWJsZWQgJiYgaGFzQXR0ZW50aW9uTmVlZGVkKSB7XG5cdFx0XHRjb25zdCB7IGlzRmlsdGVyZWRUb05lZWRzSW5wdXQgfSA9IHRoaXMuX2dldEN1cnJlbnRGaWx0ZXJTdGF0ZSgpO1xuXHRcdFx0bmVlZHNJbnB1dFNlY3Rpb24gPSAkKCdzcGFuLmFnZW50LXN0YXR1cy1iYWRnZS1zZWN0aW9uLmFjdGl2ZS5uZWVkcy1pbnB1dCcpO1xuXHRcdFx0aWYgKGlzRmlsdGVyZWRUb05lZWRzSW5wdXQpIHtcblx0XHRcdFx0bmVlZHNJbnB1dFNlY3Rpb24uY2xhc3NMaXN0LmFkZCgnZmlsdGVyZWQnKTtcblx0XHRcdH1cblx0XHRcdG5lZWRzSW5wdXRTZWN0aW9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdG5lZWRzSW5wdXRTZWN0aW9uLnRhYkluZGV4ID0gMDtcblx0XHRcdGNvbnN0IG5lZWRzSW5wdXRJY29uID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtaWNvbicpO1xuXHRcdFx0cmVzZXQobmVlZHNJbnB1dEljb24sIHJlbmRlckljb24oQ29kaWNvbi5yZXBvcnQpKTtcblx0XHRcdG5lZWRzSW5wdXRTZWN0aW9uLmFwcGVuZENoaWxkKG5lZWRzSW5wdXRJY29uKTtcblx0XHRcdGNvbnN0IG5lZWRzSW5wdXRDb3VudCA9ICQoJ3NwYW4uYWdlbnQtc3RhdHVzLXRleHQnKTtcblx0XHRcdG5lZWRzSW5wdXRDb3VudC50ZXh0Q29udGVudCA9IFN0cmluZyhhdHRlbnRpb25OZWVkZWRTZXNzaW9ucy5sZW5ndGgpO1xuXHRcdFx0bmVlZHNJbnB1dFNlY3Rpb24uYXBwZW5kQ2hpbGQobmVlZHNJbnB1dENvdW50KTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihuZWVkc0lucHV0U2VjdGlvbiwgRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX29wZW5TZXNzaW9uc1dpdGhGaWx0ZXIoJ25lZWRzSW5wdXQnKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIobmVlZHNJbnB1dFNlY3Rpb24sIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHR0aGlzLl9vcGVuU2Vzc2lvbnNXaXRoRmlsdGVyKCduZWVkc0lucHV0Jyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgbmVlZHNJbnB1dFRvb2x0aXAgPSBhdHRlbnRpb25OZWVkZWRTZXNzaW9ucy5sZW5ndGggPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnbmVlZHNJbnB1dFNlc3Npb25zVG9vbHRpcDEnLCBcInswfSBzZXNzaW9uIG5lZWRzIGlucHV0XCIsIGF0dGVudGlvbk5lZWRlZFNlc3Npb25zLmxlbmd0aClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbmVlZHNJbnB1dFNlc3Npb25zVG9vbHRpcCcsIFwiezB9IHNlc3Npb25zIG5lZWQgaW5wdXRcIiwgYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnMubGVuZ3RoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihob3ZlckRlbGVnYXRlLCBuZWVkc0lucHV0U2VjdGlvbiwgbmVlZHNJbnB1dFRvb2x0aXApKTtcblx0XHR9XG5cblx0XHQvLyBJbi1wcm9ncmVzcyBzZWN0aW9uIC0gc2hvd3Mgc2Vzc2lvbnMgdGhhdCBhcmUgYWN0aXZlbHkgcnVubmluZyAoZXhjbHVkZXMgbmVlZHMtaW5wdXQpXG5cdFx0Y29uc3QgaW5Qcm9ncmVzc09ubHkgPSBhY3RpdmVTZXNzaW9ucy5maWx0ZXIocyA9PiBzLnN0YXR1cyAhPT0gQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQpO1xuXHRcdGlmICh2aWV3U2Vzc2lvbnNFbmFibGVkICYmIGluUHJvZ3Jlc3NPbmx5Lmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHsgaXNGaWx0ZXJlZFRvSW5Qcm9ncmVzcyB9ID0gdGhpcy5fZ2V0Q3VycmVudEZpbHRlclN0YXRlKCk7XG5cdFx0XHRhY3RpdmVTZWN0aW9uID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtYmFkZ2Utc2VjdGlvbi5hY3RpdmUnKTtcblx0XHRcdGlmIChpc0ZpbHRlcmVkVG9JblByb2dyZXNzKSB7XG5cdFx0XHRcdGFjdGl2ZVNlY3Rpb24uY2xhc3NMaXN0LmFkZCgnZmlsdGVyZWQnKTtcblx0XHRcdH1cblx0XHRcdGFjdGl2ZVNlY3Rpb24uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0YWN0aXZlU2VjdGlvbi50YWJJbmRleCA9IDA7XG5cdFx0XHRjb25zdCBzdGF0dXNJY29uID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtaWNvbicpO1xuXHRcdFx0cmVzZXQoc3RhdHVzSWNvbiwgcmVuZGVySWNvbihDb2RpY29uLnNlc3Npb25JblByb2dyZXNzKSk7XG5cdFx0XHRhY3RpdmVTZWN0aW9uLmFwcGVuZENoaWxkKHN0YXR1c0ljb24pO1xuXHRcdFx0Y29uc3Qgc3RhdHVzQ291bnQgPSAkKCdzcGFuLmFnZW50LXN0YXR1cy10ZXh0Jyk7XG5cdFx0XHRzdGF0dXNDb3VudC50ZXh0Q29udGVudCA9IFN0cmluZyhpblByb2dyZXNzT25seS5sZW5ndGgpO1xuXHRcdFx0YWN0aXZlU2VjdGlvbi5hcHBlbmRDaGlsZChzdGF0dXNDb3VudCk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYWN0aXZlU2VjdGlvbiwgRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX29wZW5TZXNzaW9uc1dpdGhGaWx0ZXIoJ2luUHJvZ3Jlc3MnKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYWN0aXZlU2VjdGlvbiwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHRoaXMuX29wZW5TZXNzaW9uc1dpdGhGaWx0ZXIoJ2luUHJvZ3Jlc3MnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBhY3RpdmVUb29sdGlwID0gaW5Qcm9ncmVzc09ubHkubGVuZ3RoID09PSAxXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2FjdGl2ZVNlc3Npb25zVG9vbHRpcDEnLCBcInswfSBzZXNzaW9uIGluIHByb2dyZXNzXCIsIGluUHJvZ3Jlc3NPbmx5Lmxlbmd0aClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYWN0aXZlU2Vzc2lvbnNUb29sdGlwJywgXCJ7MH0gc2Vzc2lvbnMgaW4gcHJvZ3Jlc3NcIiwgaW5Qcm9ncmVzc09ubHkubGVuZ3RoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihob3ZlckRlbGVnYXRlLCBhY3RpdmVTZWN0aW9uLCBhY3RpdmVUb29sdGlwKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQXBwZW5kIHN0YXR1cyBzZWN0aW9ucyBpbiB0aGUgY29ycmVjdCBvcmRlciBhbmQgcmVnaXN0ZXIgZm9yIHJvdmluZyB0YWJpbmRleFxuXHRcdGlmIChyZXZlcnNlT3JkZXIpIHtcblx0XHRcdC8vIFtuZWVkcy1pbnB1dCwgYWN0aXZlLCB1bnJlYWQsIHNwYXJrbGVdIFx1MjAxNCBwb3B1bGF0ZXMgaW53YXJkXG5cdFx0XHRpZiAobmVlZHNJbnB1dFNlY3Rpb24pIHsgYmFkZ2UuYXBwZW5kQ2hpbGQobmVlZHNJbnB1dFNlY3Rpb24pOyB0aGlzLl9yb3ZpbmdFbGVtZW50cy5wdXNoKG5lZWRzSW5wdXRTZWN0aW9uKTsgfVxuXHRcdFx0aWYgKGFjdGl2ZVNlY3Rpb24pIHsgYmFkZ2UuYXBwZW5kQ2hpbGQoYWN0aXZlU2VjdGlvbik7IHRoaXMuX3JvdmluZ0VsZW1lbnRzLnB1c2goYWN0aXZlU2VjdGlvbik7IH1cblx0XHRcdGlmICh1bnJlYWRTZWN0aW9uKSB7IGJhZGdlLmFwcGVuZENoaWxkKHVucmVhZFNlY3Rpb24pOyB0aGlzLl9yb3ZpbmdFbGVtZW50cy5wdXNoKHVucmVhZFNlY3Rpb24pOyB9XG5cdFx0XHRiYWRnZS5hcHBlbmRDaGlsZChzcGFya2xlQ29udGFpbmVyKTtcblx0XHRcdHRoaXMuX3JvdmluZ0VsZW1lbnRzLnB1c2goc3BhcmtsZUNvbnRhaW5lcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE9yaWdpbmFsOiBbc3BhcmtsZSAoYWxyZWFkeSBhcHBlbmRlZCksIHVucmVhZCwgYWN0aXZlLCBuZWVkcy1pbnB1dF1cblx0XHRcdHRoaXMuX3JvdmluZ0VsZW1lbnRzLnB1c2goc3BhcmtsZUNvbnRhaW5lcik7XG5cdFx0XHRpZiAodW5yZWFkU2VjdGlvbikgeyBiYWRnZS5hcHBlbmRDaGlsZCh1bnJlYWRTZWN0aW9uKTsgdGhpcy5fcm92aW5nRWxlbWVudHMucHVzaCh1bnJlYWRTZWN0aW9uKTsgfVxuXHRcdFx0aWYgKGFjdGl2ZVNlY3Rpb24pIHsgYmFkZ2UuYXBwZW5kQ2hpbGQoYWN0aXZlU2VjdGlvbik7IHRoaXMuX3JvdmluZ0VsZW1lbnRzLnB1c2goYWN0aXZlU2VjdGlvbik7IH1cblx0XHRcdGlmIChuZWVkc0lucHV0U2VjdGlvbikgeyBiYWRnZS5hcHBlbmRDaGlsZChuZWVkc0lucHV0U2VjdGlvbik7IHRoaXMuX3JvdmluZ0VsZW1lbnRzLnB1c2gobmVlZHNJbnB1dFNlY3Rpb24pOyB9XG5cdFx0fVxuXG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXIgdGhlIGZpbHRlciBpZiB0aGUgY3VycmVudGx5IGZpbHRlcmVkIGNhdGVnb3J5IGJlY29tZXMgZW1wdHkuXG5cdCAqIEZvciBleGFtcGxlLCBpZiBmaWx0ZXJlZCB0byBcInVucmVhZFwiIGJ1dCBubyB1bnJlYWQgc2Vzc2lvbnMgZXhpc3QsIHJlc3RvcmUgdXNlcidzIHByZXZpb3VzIGZpbHRlci5cblx0ICogT25seSBhdXRvLWNsZWFycyBpZiBUSElTIHdpbmRvdyBhcHBsaWVkIHRoZSBiYWRnZSBmaWx0ZXIgdG8gYXZvaWQgY3Jvc3Mtd2luZG93IGludGVyZmVyZW5jZS5cblx0ICovXG5cdHByaXZhdGUgX2NsZWFyRmlsdGVySWZDYXRlZ29yeUVtcHR5KGhhc1VucmVhZFNlc3Npb25zOiBib29sZWFuLCBoYXNBY3RpdmVTZXNzaW9uczogYm9vbGVhbiwgaGFzQXR0ZW50aW9uTmVlZGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gT25seSBhdXRvLWNsZWFyIGlmIHRoaXMgd2luZG93IGFwcGxpZWQgdGhlIGJhZGdlIGZpbHRlclxuXHRcdC8vIFRoaXMgcHJldmVudHMgV2luZG93IEIgZnJvbSBjbGVhcmluZyBmaWx0ZXJzIHRoYXQgV2luZG93IEEgc2V0XG5cdFx0aWYgKHRoaXMuX2JhZGdlRmlsdGVyQXBwbGllZEJ5VGhpc1dpbmRvdyA9PT0gJ3VucmVhZCcgJiYgIWhhc1VucmVhZFNlc3Npb25zKSB7XG5cdFx0XHR0aGlzLl9yZXN0b3JlVXNlckZpbHRlcigpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fYmFkZ2VGaWx0ZXJBcHBsaWVkQnlUaGlzV2luZG93ID09PSAnaW5Qcm9ncmVzcycgJiYgIWhhc0FjdGl2ZVNlc3Npb25zKSB7XG5cdFx0XHR0aGlzLl9yZXN0b3JlVXNlckZpbHRlcigpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fYmFkZ2VGaWx0ZXJBcHBsaWVkQnlUaGlzV2luZG93ID09PSAnbmVlZHNJbnB1dCcgJiYgIWhhc0F0dGVudGlvbk5lZWRlZCkge1xuXHRcdFx0dGhpcy5fcmVzdG9yZVVzZXJGaWx0ZXIoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBjdXJyZW50IGZpbHRlciBzdGF0ZSBmcm9tIHN0b3JhZ2UuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRDdXJyZW50RmlsdGVyU3RhdGUoKTogeyBpc0ZpbHRlcmVkVG9VbnJlYWQ6IGJvb2xlYW47IGlzRmlsdGVyZWRUb0luUHJvZ3Jlc3M6IGJvb2xlYW47IGlzRmlsdGVyZWRUb05lZWRzSW5wdXQ6IGJvb2xlYW4gfSB7XG5cdFx0Y29uc3QgZmlsdGVyID0gdGhpcy5fZ2V0U3RvcmVkRmlsdGVyKCk7XG5cdFx0aWYgKCFmaWx0ZXIpIHtcblx0XHRcdHJldHVybiB7IGlzRmlsdGVyZWRUb1VucmVhZDogZmFsc2UsIGlzRmlsdGVyZWRUb0luUHJvZ3Jlc3M6IGZhbHNlLCBpc0ZpbHRlcmVkVG9OZWVkc0lucHV0OiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdC8vIERldGVjdCBpZiBmaWx0ZXJlZCB0byB1bnJlYWQgKHJlYWQ9dHJ1ZSBleGNsdWRlcyByZWFkIHNlc3Npb25zLCBsZWF2aW5nIG9ubHkgdW5yZWFkKVxuXHRcdGNvbnN0IGlzRmlsdGVyZWRUb1VucmVhZCA9IGZpbHRlci5yZWFkID09PSB0cnVlICYmIGZpbHRlci5zdGF0ZXMubGVuZ3RoID09PSAwO1xuXHRcdC8vIERldGVjdCBpZiBmaWx0ZXJlZCB0byBpbi1wcm9ncmVzcyBvbmx5ICgzIGV4Y2x1ZGVkIHN0YXRlcyBpbmNsdWRpbmcgTmVlZHNJbnB1dClcblx0XHRjb25zdCBpc0ZpbHRlcmVkVG9JblByb2dyZXNzID0gZmlsdGVyLnN0YXRlcz8ubGVuZ3RoID09PSAzICYmIGZpbHRlci5zdGF0ZXMuaW5jbHVkZXMoQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQpICYmIGZpbHRlci5yZWFkID09PSBmYWxzZTtcblx0XHQvLyBEZXRlY3QgaWYgZmlsdGVyZWQgdG8gbmVlZHMtaW5wdXQgb25seSAoMyBleGNsdWRlZCBzdGF0ZXMgaW5jbHVkaW5nIEluUHJvZ3Jlc3MpXG5cdFx0Y29uc3QgaXNGaWx0ZXJlZFRvTmVlZHNJbnB1dCA9IGZpbHRlci5zdGF0ZXM/Lmxlbmd0aCA9PT0gMyAmJiBmaWx0ZXIuc3RhdGVzLmluY2x1ZGVzKEFnZW50U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKSAmJiBmaWx0ZXIucmVhZCA9PT0gZmFsc2U7XG5cblx0XHRyZXR1cm4geyBpc0ZpbHRlcmVkVG9VbnJlYWQsIGlzRmlsdGVyZWRUb0luUHJvZ3Jlc3MsIGlzRmlsdGVyZWRUb05lZWRzSW5wdXQgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHN0b3JlZCBmaWx0ZXIgb2JqZWN0IGZyb20gc3RvcmFnZS5cblx0ICovXG5cdHByaXZhdGUgX2dldFN0b3JlZEZpbHRlcigpOiB7IHByb3ZpZGVyczogc3RyaW5nW107IHN0YXRlczogQWdlbnRTZXNzaW9uU3RhdHVzW107IGFyY2hpdmVkOiBib29sZWFuOyByZWFkOiBib29sZWFuIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGZpbHRlclN0ciA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEZJTFRFUl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGlmICghZmlsdGVyU3RyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2UoZmlsdGVyU3RyKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN0b3JlIGEgZmlsdGVyIG9iamVjdCB0byBzdG9yYWdlLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RvcmVGaWx0ZXIoZmlsdGVyOiB7IHByb3ZpZGVyczogc3RyaW5nW107IHN0YXRlczogQWdlbnRTZXNzaW9uU3RhdHVzW107IGFyY2hpdmVkOiBib29sZWFuOyByZWFkOiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEZJTFRFUl9TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkoZmlsdGVyKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXIgYWxsIGZpbHRlcnMgKHJlc2V0IHRvIGRlZmF1bHQpLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2xlYXJGaWx0ZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcmVGaWx0ZXIoe1xuXHRcdFx0cHJvdmlkZXJzOiBbXSxcblx0XHRcdHN0YXRlczogW10sXG5cdFx0XHRhcmNoaXZlZDogdHJ1ZSxcblx0XHRcdHJlYWQ6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU2F2ZSB0aGUgY3VycmVudCB1c2VyIGZpbHRlciBiZWZvcmUgd2Ugb3ZlcnJpZGUgaXQgd2l0aCBhIGJhZGdlIGZpbHRlci5cblx0ICogT25seSBzYXZlcyBpZiB0aGUgY3VycmVudCBmaWx0ZXIgaXMgTk9UIGFscmVhZHkgYSBiYWRnZSBmaWx0ZXIgKHVucmVhZCBvciBpbi1wcm9ncmVzcykuXG5cdCAqIFRoaXMgcHJlc2VydmVzIHRoZSBvcmlnaW5hbCB1c2VyIGZpbHRlciB3aGVuIHN3aXRjaGluZyBiZXR3ZWVuIGJhZGdlIGZpbHRlcnMuXG5cdCAqL1xuXHRwcml2YXRlIF9zYXZlVXNlckZpbHRlcigpOiB2b2lkIHtcblx0XHRjb25zdCB7IGlzRmlsdGVyZWRUb1VucmVhZCwgaXNGaWx0ZXJlZFRvSW5Qcm9ncmVzcywgaXNGaWx0ZXJlZFRvTmVlZHNJbnB1dCB9ID0gdGhpcy5fZ2V0Q3VycmVudEZpbHRlclN0YXRlKCk7XG5cblx0XHQvLyBEb24ndCBvdmVyd3JpdGUgdGhlIHNhdmVkIGZpbHRlciBpZiB3ZSdyZSBhbHJlYWR5IGluIGEgYmFkZ2UtZmlsdGVyZWQgc3RhdGVcblx0XHQvLyBUaGUgcHJldmlvdXMgdXNlciBmaWx0ZXIgc2hvdWxkIGFscmVhZHkgYmUgc2F2ZWRcblx0XHRpZiAoaXNGaWx0ZXJlZFRvVW5yZWFkIHx8IGlzRmlsdGVyZWRUb0luUHJvZ3Jlc3MgfHwgaXNGaWx0ZXJlZFRvTmVlZHNJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRGaWx0ZXIgPSB0aGlzLl9nZXRTdG9yZWRGaWx0ZXIoKTtcblx0XHRpZiAoY3VycmVudEZpbHRlcikge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShQUkVWSU9VU19GSUxURVJfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KGN1cnJlbnRGaWx0ZXIpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVzdG9yZSB0aGUgdXNlcidzIHByZXZpb3VzIGZpbHRlciAoc2F2ZWQgYmVmb3JlIHdlIGFwcGxpZWQgYSBiYWRnZSBmaWx0ZXIpLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzdG9yZVVzZXJGaWx0ZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXNGaWx0ZXJTdHIgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChQUkVWSU9VU19GSUxURVJfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAocHJldmlvdXNGaWx0ZXJTdHIpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzRmlsdGVyID0gSlNPTi5wYXJzZShwcmV2aW91c0ZpbHRlclN0cik7XG5cdFx0XHRcdHRoaXMuX3N0b3JlRmlsdGVyKHByZXZpb3VzRmlsdGVyKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBGYWxsIGJhY2sgdG8gY2xlYXJpbmcgaWYgcGFyc2UgZmFpbHNcblx0XHRcdFx0dGhpcy5fY2xlYXJGaWx0ZXIoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTm8gcHJldmlvdXMgZmlsdGVyIHNhdmVkLCBjbGVhciB0byBkZWZhdWx0XG5cdFx0XHR0aGlzLl9jbGVhckZpbHRlcigpO1xuXHRcdH1cblx0XHQvLyBDbGVhciB0aGUgc2F2ZWQgZmlsdGVyIGFmdGVyIHJlc3RvcmluZ1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFBSRVZJT1VTX0ZJTFRFUl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdC8vIENsZWFyIHRoZSBwZXItd2luZG93IGJhZGdlIGZpbHRlciB0cmFja2luZ1xuXHRcdHRoaXMuX2JhZGdlRmlsdGVyQXBwbGllZEJ5VGhpc1dpbmRvdyA9IG51bGw7XG5cdH1cblxuXHQvKipcblx0ICogT3BlbnMgdGhlIGFnZW50IHNlc3Npb25zIHZpZXcgd2l0aCBhIHNwZWNpZmljIGZpbHRlciBhcHBsaWVkLCBvciByZXN0b3JlcyBwcmV2aW91cyBmaWx0ZXIgaWYgYWxyZWFkeSBhcHBsaWVkLlxuXHQgKiBQcmVzZXJ2ZXMgc2Vzc2lvbiB0eXBlIChwcm92aWRlcikgZmlsdGVycyB3aGlsZSB0b2dnbGluZyBvbmx5IHN0YXR1cyBmaWx0ZXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBfb3BlblNlc3Npb25zV2l0aEZpbHRlcihmaWx0ZXJUeXBlOiAndW5yZWFkJyB8ICdpblByb2dyZXNzJyB8ICduZWVkc0lucHV0Jyk6IHZvaWQge1xuXHRcdGNvbnN0IHsgaXNGaWx0ZXJlZFRvVW5yZWFkLCBpc0ZpbHRlcmVkVG9JblByb2dyZXNzLCBpc0ZpbHRlcmVkVG9OZWVkc0lucHV0IH0gPSB0aGlzLl9nZXRDdXJyZW50RmlsdGVyU3RhdGUoKTtcblx0XHRjb25zdCBjdXJyZW50RmlsdGVyID0gdGhpcy5fZ2V0U3RvcmVkRmlsdGVyKCk7XG5cdFx0Ly8gUHJlc2VydmUgZXhpc3RpbmcgcHJvdmlkZXIgZmlsdGVycyAoc2Vzc2lvbiB0eXBlIGZpbHRlcnMgbGlrZSBMb2NhbCwgQmFja2dyb3VuZCwgZXRjLilcblx0XHRjb25zdCBwcmVzZXJ2ZWRQcm92aWRlcnMgPSBjdXJyZW50RmlsdGVyPy5wcm92aWRlcnMgPz8gW107XG5cblx0XHQvLyBMb2cgdGVsZW1ldHJ5IGZvciBmaWx0ZXIgYnV0dG9uIGNsaWNrc1xuXHRcdGNvbnN0IGlzVG9nZ2xlT2ZmID0gKGZpbHRlclR5cGUgPT09ICd1bnJlYWQnICYmIGlzRmlsdGVyZWRUb1VucmVhZClcblx0XHRcdHx8IChmaWx0ZXJUeXBlID09PSAnaW5Qcm9ncmVzcycgJiYgaXNGaWx0ZXJlZFRvSW5Qcm9ncmVzcylcblx0XHRcdHx8IChmaWx0ZXJUeXBlID09PSAnbmVlZHNJbnB1dCcgJiYgaXNGaWx0ZXJlZFRvTmVlZHNJbnB1dCk7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QWdlbnRTdGF0dXNDbGlja0V2ZW50LCBBZ2VudFN0YXR1c0NsaWNrQ2xhc3NpZmljYXRpb24+KCdhZ2VudFN0YXR1c1dpZGdldC5jbGljaycsIHtcblx0XHRcdHNvdXJjZTogZmlsdGVyVHlwZSxcblx0XHRcdGFjdGlvbjogaXNUb2dnbGVPZmYgPyAnY2xlYXJGaWx0ZXInIDogJ2FwcGx5RmlsdGVyJyxcblx0XHR9KTtcblxuXHRcdC8vIENoZWNrIGlmIGFscmVhZHkgZmlsdGVyZWQgdG8gdGhpcyB0eXBlIFx1MjAxNCB0b2dnbGUgb2ZmXG5cdFx0aWYgKGlzVG9nZ2xlT2ZmKSB7XG5cdFx0XHR0aGlzLl9yZXN0b3JlVXNlckZpbHRlcigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBTYXZlIGN1cnJlbnQgZmlsdGVyIGJlZm9yZSBhcHBseWluZyBvdXIgb3duXG5cdFx0XHR0aGlzLl9zYXZlVXNlckZpbHRlcigpO1xuXG5cdFx0XHRpZiAoZmlsdGVyVHlwZSA9PT0gJ3VucmVhZCcpIHtcblx0XHRcdFx0dGhpcy5fc3RvcmVGaWx0ZXIoe1xuXHRcdFx0XHRcdHByb3ZpZGVyczogcHJlc2VydmVkUHJvdmlkZXJzLFxuXHRcdFx0XHRcdHN0YXRlczogW10sXG5cdFx0XHRcdFx0YXJjaGl2ZWQ6IHRydWUsXG5cdFx0XHRcdFx0cmVhZDogdHJ1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoZmlsdGVyVHlwZSA9PT0gJ2luUHJvZ3Jlc3MnKSB7XG5cdFx0XHRcdC8vIEV4Y2x1ZGUgQ29tcGxldGVkLCBGYWlsZWQsIGFuZCBOZWVkc0lucHV0IFx1MjAxNCBzaG93IG9ubHkgSW5Qcm9ncmVzc1xuXHRcdFx0XHR0aGlzLl9zdG9yZUZpbHRlcih7XG5cdFx0XHRcdFx0cHJvdmlkZXJzOiBwcmVzZXJ2ZWRQcm92aWRlcnMsXG5cdFx0XHRcdFx0c3RhdGVzOiBbQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgQWdlbnRTZXNzaW9uU3RhdHVzLkZhaWxlZCwgQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXRdLFxuXHRcdFx0XHRcdGFyY2hpdmVkOiB0cnVlLFxuXHRcdFx0XHRcdHJlYWQ6IGZhbHNlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gRXhjbHVkZSBDb21wbGV0ZWQsIEZhaWxlZCwgYW5kIEluUHJvZ3Jlc3MgXHUyMDE0IHNob3cgb25seSBOZWVkc0lucHV0XG5cdFx0XHRcdHRoaXMuX3N0b3JlRmlsdGVyKHtcblx0XHRcdFx0XHRwcm92aWRlcnM6IHByZXNlcnZlZFByb3ZpZGVycyxcblx0XHRcdFx0XHRzdGF0ZXM6IFtBZ2VudFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBBZ2VudFNlc3Npb25TdGF0dXMuRmFpbGVkLCBBZ2VudFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzc10sXG5cdFx0XHRcdFx0YXJjaGl2ZWQ6IHRydWUsXG5cdFx0XHRcdFx0cmVhZDogZmFsc2Vcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9iYWRnZUZpbHRlckFwcGxpZWRCeVRoaXNXaW5kb3cgPSBmaWx0ZXJUeXBlO1xuXHRcdH1cblxuXHRcdC8vIE9wZW4gdGhlIHNlc3Npb25zIHZpZXdcblx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEZvY3VzQWdlbnRTZXNzaW9uc0FjdGlvbi5pZCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIHRoZSBlc2NhcGUgYnV0dG9uIGZvciBleGl0aW5nIHNlc3Npb24gcHJvamVjdGlvbiBtb2RlLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyRXNjYXBlQnV0dG9uKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBlc2NCdXR0b24gPSAkKCdzcGFuLmFnZW50LXN0YXR1cy1lc2MtYnV0dG9uJyk7XG5cdFx0ZXNjQnV0dG9uLnRleHRDb250ZW50ID0gJ0VzYyc7XG5cdFx0ZXNjQnV0dG9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRlc2NCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2V4aXRBZ2VudFNlc3Npb25Qcm9qZWN0aW9uJywgXCJFeGl0IEFnZW50IFNlc3Npb24gUHJvamVjdGlvblwiKSk7XG5cdFx0ZXNjQnV0dG9uLnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLl9yb3ZpbmdFbGVtZW50cy5wdXNoKGVzY0J1dHRvbik7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKGVzY0J1dHRvbik7XG5cblx0XHQvLyBTZXR1cCBob3ZlclxuXHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoaG92ZXJEZWxlZ2F0ZSwgZXNjQnV0dG9uLCBsb2NhbGl6ZSgnZXhpdEFnZW50U2Vzc2lvblByb2plY3Rpb25Ub29sdGlwJywgXCJFeGl0IEFnZW50IFNlc3Npb24gUHJvamVjdGlvbiAoRXNjYXBlKVwiKSkpO1xuXG5cdFx0Ly8gQ2xpY2sgaGFuZGxlclxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZXNjQnV0dG9uLCBFdmVudFR5cGUuTU9VU0VfRE9XTiwgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEV4aXRBZ2VudFNlc3Npb25Qcm9qZWN0aW9uQWN0aW9uLklEKTtcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVzY0J1dHRvbiwgRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoRXhpdEFnZW50U2Vzc2lvblByb2plY3Rpb25BY3Rpb24uSUQpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEtleWJvYXJkIGhhbmRsZXJcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVzY0J1dHRvbiwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEV4aXRBZ2VudFNlc3Npb25Qcm9qZWN0aW9uQWN0aW9uLklEKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIHRoZSBlbnRlciBidXR0b24gZm9yIGVudGVyaW5nIHNlc3Npb24gcHJvamVjdGlvbiBtb2RlLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyRW50ZXJCdXR0b24oZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgcGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVudGVyQnV0dG9uID0gJCgnc3Bhbi5hZ2VudC1zdGF0dXMtZW50ZXItYnV0dG9uJyk7XG5cdFx0Ly8gR2V0IHRoZSBrZXliaW5kaW5nIGZvciB0aGUgZW50ZXIgYWN0aW9uXG5cdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhFbnRlckFnZW50U2Vzc2lvblByb2plY3Rpb25BY3Rpb24uSUQpO1xuXHRcdGVudGVyQnV0dG9uLnRleHRDb250ZW50ID0ga2V5YmluZGluZz8uZ2V0TGFiZWwoKSA/PyBsb2NhbGl6ZSgncmV2aWV3JywgXCJSZXZpZXdcIik7XG5cdFx0ZW50ZXJCdXR0b24uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdGVudGVyQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdlbnRlckFnZW50U2Vzc2lvblByb2plY3Rpb24nLCBcIkVudGVyIEFnZW50IFNlc3Npb24gUHJvamVjdGlvblwiKSk7XG5cdFx0ZW50ZXJCdXR0b24udGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuX3JvdmluZ0VsZW1lbnRzLnB1c2goZW50ZXJCdXR0b24pO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChlbnRlckJ1dHRvbik7XG5cblx0XHQvLyBTZXR1cCBob3ZlclxuXHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKTtcblx0XHRjb25zdCBob3ZlclRleHQgPSBrZXliaW5kaW5nXG5cdFx0XHQ/IGxvY2FsaXplKCdlbnRlckFnZW50U2Vzc2lvblByb2plY3Rpb25Ub29sdGlwJywgXCJSZXZpZXcgQ2hhbmdlcyAoezB9KVwiLCBrZXliaW5kaW5nLmdldExhYmVsKCkpXG5cdFx0XHQ6IGxvY2FsaXplKCdlbnRlckFnZW50U2Vzc2lvblByb2plY3Rpb25Ub29sdGlwTm9LZXknLCBcIlJldmlldyBDaGFuZ2VzXCIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihob3ZlckRlbGVnYXRlLCBlbnRlckJ1dHRvbiwgaG92ZXJUZXh0KSk7XG5cblx0XHQvLyBFbnRlciBwcm9qZWN0aW9uIGhhbmRsZXIgLSBzYW1lIGFzIGNsaWNraW5nIHRoZSBwaWxsXG5cdFx0Y29uc3QgZW50ZXJQcm9qZWN0aW9uID0gKGU6IEV2ZW50KSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkluZm8gPSB0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLnNlc3Npb25JbmZvO1xuXHRcdFx0aWYgKHNlc3Npb25JbmZvKSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvbkluZm8uc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEVudGVyQWdlbnRTZXNzaW9uUHJvamVjdGlvbkFjdGlvbi5JRCwgc2Vzc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gQ2xpY2sgaGFuZGxlclxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZW50ZXJCdXR0b24sIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlbnRlclByb2plY3Rpb24pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVudGVyQnV0dG9uLCBFdmVudFR5cGUuQ0xJQ0ssIGVudGVyUHJvamVjdGlvbikpO1xuXG5cdFx0Ly8gS2V5Ym9hcmQgaGFuZGxlclxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZW50ZXJCdXR0b24sIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdGVudGVyUHJvamVjdGlvbihlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBTZXNzaW9uIEhlbHBlcnNcblxuXHQvKipcblx0ICogR2V0IHRoZSBzZXNzaW9uIG1vc3QgdXJnZW50bHkgbmVlZGluZyB1c2VyIGF0dGVudGlvbiAoYXBwcm92YWwvY29uZmlybWF0aW9uL2lucHV0KS5cblx0ICogUmV0dXJucyB1bmRlZmluZWQgaWYgbm8gc2Vzc2lvbnMgbmVlZCBhdHRlbnRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRTZXNzaW9uTmVlZGluZ0F0dGVudGlvbihhdHRlbnRpb25OZWVkZWRTZXNzaW9uczogSUFnZW50U2Vzc2lvbltdKTogeyBzZXNzaW9uOiBJQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkOyBwcm9ncmVzczogc3RyaW5nIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGlmIChhdHRlbnRpb25OZWVkZWRTZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7IHNlc3Npb246IHVuZGVmaW5lZCwgcHJvZ3Jlc3M6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdC8vIFNvcnQgYnkgbW9zdCByZWNlbnRseSBzdGFydGVkIHJlcXVlc3Rcblx0XHRjb25zdCBzb3J0ZWQgPSBbLi4uYXR0ZW50aW9uTmVlZGVkU2Vzc2lvbnNdLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGNvbnN0IHRpbWVBID0gYS50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkID8/IGEudGltaW5nLmNyZWF0ZWQ7XG5cdFx0XHRjb25zdCB0aW1lQiA9IGIudGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCA/PyBiLnRpbWluZy5jcmVhdGVkO1xuXHRcdFx0cmV0dXJuIHRpbWVCIC0gdGltZUE7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBtb3N0UmVjZW50ID0gc29ydGVkWzBdO1xuXHRcdGlmICghbW9zdFJlY2VudC5kZXNjcmlwdGlvbikge1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvbjogbW9zdFJlY2VudCwgcHJvZ3Jlc3M6IG1vc3RSZWNlbnQubGFiZWwgfTtcblx0XHR9XG5cblx0XHQvLyBDb252ZXJ0IG1hcmtkb3duIHRvIHBsYWluIHRleHQgaWYgbmVlZGVkXG5cdFx0Y29uc3QgcHJvZ3Jlc3MgPSB0eXBlb2YgbW9zdFJlY2VudC5kZXNjcmlwdGlvbiA9PT0gJ3N0cmluZydcblx0XHRcdD8gbW9zdFJlY2VudC5kZXNjcmlwdGlvblxuXHRcdFx0OiByZW5kZXJBc1BsYWludGV4dChtb3N0UmVjZW50LmRlc2NyaXB0aW9uKTtcblxuXHRcdHJldHVybiB7IHNlc3Npb246IG1vc3RSZWNlbnQsIHByb2dyZXNzIH07XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBMYWJlbCBIZWxwZXJzXG5cblx0LyoqXG5cdCAqIENvbXB1dGUgdGhlIGxhYmVsIHRvIGRpc3BsYXkgaW4gdGhlIGNvbW1hbmQgY2VudGVyLlxuXHQgKiBVc2VzIHRoZSB3b3Jrc3BhY2UgbmFtZSAoZm9sZGVyIG5hbWUpIHdpdGggcHJlZml4L3N1ZmZpeCBkZWNvcmF0aW9ucy5cblx0ICogRmFsbHMgYmFjayB0byBmaWxlIG5hbWUgd2hlbiB0YWJzIGFyZSBoaWRkZW4sIG9yIFwiU2VhcmNoXCIgd2hlbiBlbXB0eS5cblx0ICovXG5cdHByaXZhdGUgX2dldExhYmVsKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgeyBwcmVmaXgsIHN1ZmZpeCB9ID0gdGhpcy5fd2luZG93VGl0bGUuZ2V0VGl0bGVEZWNvcmF0aW9ucygpO1xuXG5cdFx0Ly8gQmFzZSBsYWJlbDogY3VzdG9tIHRpdGxlLCB3b3Jrc3BhY2UgbmFtZSwgb3IgZmlsZSBuYW1lIHdoZW4gdGFicyBhcmUgaGlkZGVuXG5cdFx0bGV0IGxhYmVsID0gdGhpcy5fd2luZG93VGl0bGUud29ya3NwYWNlTmFtZTtcblx0XHRpZiAodGhpcy5fd2luZG93VGl0bGUuaXNDdXN0b21UaXRsZUZvcm1hdCgpKSB7XG5cdFx0XHRsYWJlbCA9IHRoaXMuX3dpbmRvd1RpdGxlLmdldFdpbmRvd1RpdGxlKCk7XG5cdFx0fSBlbHNlIGlmICghbGFiZWwgJiYgdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLnBhcnRPcHRpb25zLnNob3dUYWJzID09PSAnbm9uZScpIHtcblx0XHRcdGxhYmVsID0gdGhpcy5fd2luZG93VGl0bGUuZmlsZU5hbWUgPz8gJyc7XG5cdFx0fVxuXG5cdFx0aWYgKCFsYWJlbCkge1xuXHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRTdGF0dXNXaWRnZXQuc2VhcmNoJywgXCJTZWFyY2hcIik7XG5cdFx0fVxuXG5cdFx0Ly8gQXBwbHkgcHJlZml4IGFuZCBzdWZmaXggZGVjb3JhdGlvbnNcblx0XHRpZiAocHJlZml4KSB7XG5cdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdsYWJlbDEnLCBcInswfSB7MX1cIiwgcHJlZml4LCBsYWJlbCk7XG5cdFx0fVxuXHRcdGlmIChzdWZmaXgpIHtcblx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ2xhYmVsMicsIFwiezB9IHsxfVwiLCBsYWJlbCwgc3VmZml4KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbGFiZWwucmVwbGFjZUFsbCgvXFxyXFxufFxccnxcXG4vZywgJ1xcdTIzQ0UnKTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cbn1cblxuLyoqXG4gKiBQcm92aWRlcyBjdXN0b20gcmVuZGVyaW5nIGZvciB0aGUgYWdlbnQgc3RhdHVzIGluIHRoZSBjb21tYW5kIGNlbnRlci5cbiAqIFVzZXMgSUFjdGlvblZpZXdJdGVtU2VydmljZSB0byByZW5kZXIgYSBjdXN0b20gQWdlbnRTdGF0dXNXaWRnZXRcbiAqIGZvciB0aGUgQWdlbnRzQ29udHJvbE1lbnUgc3VibWVudS5cbiAqIEFsc28gYWRkcyBDU1MgY2xhc3NlcyB0byB0aGUgd29ya2JlbmNoIGJhc2VkIG9uIHNldHRpbmdzLlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRUaXRsZUJhclN0YXR1c1JlbmRlcmluZyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuYWdlbnRTdGF0dXMucmVuZGVyaW5nJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUaXRsZVNlcnZpY2UgdGl0bGVTZXJ2aWNlOiBJVGl0bGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKE1lbnVJZC5Db21tYW5kQ2VudGVyLCBNZW51SWQuQWdlbnRzVGl0bGVCYXJDb250cm9sTWVudSwgKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUl0ZW1BY3Rpb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRUaXRsZUJhclN0YXR1c1dpZGdldCwgYWN0aW9uLCB0aXRsZVNlcnZpY2Uud2luZG93VGl0bGUsIG9wdGlvbnMpO1xuXHRcdH0sIHVuZGVmaW5lZCkpO1xuXG5cdFx0Ly8gQWRkL3JlbW92ZSBDU1MgY2xhc3NlcyBvbiB3b3JrYmVuY2ggYmFzZWQgb24gc2V0dGluZ3MuXG5cdFx0Ly8gT25seSBoaWRlIHRoZSBkZWZhdWx0IGNvbW1hbmQgY2VudGVyIHNlYXJjaCBib3ggKHZpYSB1bmlmaWVkLWFnZW50cy1iYXIpXG5cdFx0Ly8gd2hlbiBjaGF0IGlzIGVuYWJsZWQsIHNvIHRoZSBzZWFyY2ggYm94IHJlbWFpbnMgdmlzaWJsZSBkdXJpbmcgcmVtb3RlXG5cdFx0Ly8gY29ubmVjdGlvbiBzdGFydHVwIGJlZm9yZSB0aGUgYWdlbnQgc3RhdHVzIHdpZGdldCBpcyByZWFkeSB0byByZW5kZXIuXG5cdFx0Y29uc3QgY2hhdEVuYWJsZWRLZXkgPSBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oJ2NoYXRJc0VuYWJsZWQnKTtcblx0XHRsZXQgY2hhdEVuYWJsZWQgPSAhIWNoYXRFbmFibGVkS2V5O1xuXG5cdFx0Y29uc3QgdXBkYXRlQ2xhc3MgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kQ2VudGVyRW5hYmxlZCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLkNPTU1BTkRfQ0VOVEVSKSA9PT0gdHJ1ZTtcblx0XHRcdGNvbnN0IHN0YXR1c01vZGUgPSBnZXRBZ2VudFN0YXR1c1NldHRpbmdNb2RlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRjb25zdCBlbmFibGVkID0gY29tbWFuZENlbnRlckVuYWJsZWQgJiYgY2hhdEVuYWJsZWQgJiYgc3RhdHVzTW9kZSAhPT0gJ2hpZGRlbic7XG5cdFx0XHRjb25zdCBlbmhhbmNlZCA9IGVuYWJsZWQgJiYgc3RhdHVzTW9kZSA9PT0gJ2NvbXBhY3QnO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnRvZ2dsZSgnYWdlbnQtc3RhdHVzLWVuYWJsZWQnLCBlbmFibGVkKTtcblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QudG9nZ2xlKCd1bmlmaWVkLWFnZW50cy1iYXInLCBlbmhhbmNlZCk7XG5cdFx0fTtcblx0XHR1cGRhdGVDbGFzcygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChcblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudFN0YXR1c0VuYWJsZWQpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuQ09NTUFORF9DRU5URVIpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2Rpc2FibGVBSUN1c3RvbWl6YXRpb25zJylcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignd29ya2JlbmNoLmRpc2FibGVBSUN1c3RvbWl6YXRpb25zJylcblx0XHRcdCkge1xuXHRcdFx0XHR1cGRhdGVDbGFzcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZShuZXcgU2V0KFsnY2hhdElzRW5hYmxlZCcsIEluRWRpdG9yWmVuTW9kZUNvbnRleHQua2V5XSkpKSB7XG5cdFx0XHRcdGNoYXRFbmFibGVkID0gISFjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oJ2NoYXRJc0VuYWJsZWQnKTtcblx0XHRcdFx0dXBkYXRlQ2xhc3MoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsR0FBRyx1QkFBdUIsV0FBVyxXQUFXLGVBQWUsYUFBYTtBQUNyRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsa0JBQWtCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsaUJBQWlCLG1DQUFtQztBQUM3RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1DQUFtQyx3Q0FBd0M7QUFDcEYsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBbUMsaUNBQWlDO0FBQzdFLFNBQVMsMEJBQXNEO0FBQy9ELFNBQWtCLFdBQVcsZUFBZSxnQkFBZ0I7QUFDNUQsU0FBUywwQkFBMEIsc0JBQXNCO0FBQ3pELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsY0FBYyxRQUFRLGdCQUFnQix5QkFBeUI7QUFDeEUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxvQkFBb0Isd0JBQXdCO0FBQ3JELFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsaUJBQWlCLGNBQWMscUJB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Q0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0E5Q1U7QUE0dkNOLElBQU0sK0JBQU4sY0FBMkMsV0FBNkM7QUFBQSxFQUk5RixZQUN5Qix1QkFDRCxzQkFDQSxzQkFDSCxtQkFDTCxjQUNkO0FBQ0QsVUFBTTtBQUVOLFNBQUssVUFBVSxzQkFBc0IsU0FBUyxPQUFPLGVBQWUsT0FBTywyQkFBMkIsQ0FBQyxRQUFRLFlBQVk7QUFDMUgsVUFBSSxFQUFFLGtCQUFrQixvQkFBb0I7QUFDM0MsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPLHFCQUFxQixlQUFlLDJCQUEyQixRQUFRLGFBQWEsYUFBYSxPQUFPO0FBQUEsSUFDaEgsR0FBRyxNQUFTLENBQUM7QUFNYixVQUFNLGlCQUFpQixrQkFBa0IsbUJBQTRCLGVBQWU7QUFDcEYsUUFBSSxjQUFjLENBQUMsQ0FBQztBQUVwQixVQUFNLGNBQWMsTUFBTTtBQUN6QixZQUFNLHVCQUF1QixxQkFBcUIsU0FBa0IsZUFBZSxjQUFjLE1BQU07QUFDdkcsWUFBTSxhQUFhLDBCQUEwQixzQkFBc0IsaUJBQWlCO0FBQ3BGLFlBQU0sVUFBVSx3QkFBd0IsZUFBZSxlQUFlO0FBQ3RFLFlBQU0sV0FBVyxXQUFXLGVBQWU7QUFFM0MsaUJBQVcsU0FBUyxLQUFLLFVBQVUsT0FBTyx3QkFBd0IsT0FBTztBQUN6RSxpQkFBVyxTQUFTLEtBQUssVUFBVSxPQUFPLHNCQUFzQixRQUFRO0FBQUEsSUFDekU7QUFDQSxnQkFBWTtBQUNaLFNBQUssVUFBVSxxQkFBcUIseUJBQXlCLE9BQUs7QUFDakUsVUFDQyxFQUFFLHFCQUFxQixrQkFBa0Isa0JBQWtCLEtBQ3hELEVBQUUscUJBQXFCLGVBQWUsY0FBYyxLQUNwRCxFQUFFLHFCQUFxQix1QkFBdUIsS0FDOUMsRUFBRSxxQkFBcUIseUJBQXlCLEtBQ2hELEVBQUUscUJBQXFCLG1DQUFtQyxHQUM1RDtBQUNELG9CQUFZO0FBQUEsTUFDYjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLGtCQUFrQixtQkFBbUIsT0FBSztBQUN4RCxVQUFJLEVBQUUsWUFBWSxvQkFBSSxJQUFJLENBQUMsaUJBQWlCLHVCQUF1QixHQUFHLENBQUMsQ0FBQyxHQUFHO0FBQzFFLHNCQUFjLENBQUMsQ0FBQyxrQkFBa0IsbUJBQTRCLGVBQWU7QUFDN0Usb0JBQVk7QUFBQSxNQUNiO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0Q7QUF2RGEsNkJBRUksS0FBSztBQUZULCtCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRVOyIsCiAgIm5hbWVzIjogWyJzZXNzaW9uSW5mbyJdCn0K
