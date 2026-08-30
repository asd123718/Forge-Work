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
import "../../../browser/media/sidebarActionButton.css";
import "./media/accountWidget.css";
import "./media/accountTitleBarWidget.css";
import "../../../../workbench/contrib/chat/browser/chatStatus/media/chatStatus.css";
import Severity from "../../../../base/common/severity.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { runOnChange } from "../../../../base/common/observable.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuRegistry, registerAction2, IMenuService } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { appendUpdateMenuItems as registerUpdateMenuItems } from "../../../../workbench/contrib/update/browser/update.js";
import { Menus } from "../../../browser/menus.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { fillInActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { $, addDisposableListener, append, disposableWindowInterval, EventType, getDomNodePagePosition } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { ActionBar, ActionsOrientation } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { registerUpdateTitleBarMenuPlacement } from "../../../../workbench/contrib/update/browser/updateTitleBarEntry.js";
import { ChatEntitlement, getChatPlanName, IChatEntitlementService } from "../../../../workbench/services/chat/common/chatEntitlementService.js";
import { ChatStatusDashboard } from "../../../../workbench/contrib/chat/browser/chatStatus/chatStatusDashboard.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { getAccountProfileImageUrl, getAccountTitleBarBadgeKey, getAccountTitleBarState, resolveAccountInfo } from "../../../browser/accountTitleBarState.js";
import { observeAllowSignedOutWhenUsable } from "../../../browser/sessionsAuthGate.js";
import { IsPhoneLayoutContext, SessionHasChangesContext, SessionIsCreatedContext, SessionsWelcomeVisibleContext, SinglePaneLayoutEnabledContext } from "../../../common/contextkeys.js";
import { IsAuxiliaryWindowContext } from "../../../../workbench/common/contextkeys.js";
import { IAuthenticationAccessService } from "../../../../workbench/services/authentication/browser/authenticationAccessService.js";
import { IAuthenticationUsageService } from "../../../../workbench/services/authentication/browser/authenticationUsageService.js";
import { ACCOUNTS_AVATAR_SETTING, IAuthenticationService } from "../../../../workbench/services/authentication/common/authentication.js";
import { IChatDashboardService } from "../../../browser/chatDashboardService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createCodexAccountMenuActions, hasSignedInCodexChatGPTAccount, ICodexAccountService, shouldShowCodexAccount } from "../../../../workbench/services/agentHost/browser/codexAccountService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { MANAGE_CHAT_COMMAND_ID } from "../../../../workbench/contrib/chat/common/constants.js";
import { AICustomizationManagementCommands } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js";
import { AICustomizationManagementSection } from "../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js";
import { SessionType } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { fromNow, safeIntl } from "../../../../base/common/date.js";
import { language } from "../../../../base/common/platform.js";
import { AgentHostCodexAgentEnabledSettingId } from "../../../../platform/agentHost/common/agentService.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
import { CHAT_SETUP_ACTION_ID } from "../../../../workbench/contrib/chat/browser/actions/chatActions.js";
import { AGENTIC_SIGN_IN_COMMAND_ID } from "../../../common/sessionCommands.js";
const AccountMenu = Menus.AccountMenu;
const SessionsTitleBarAccountWidgetAction = "sessions.action.titleBarAccountWidget";
const SESSIONS_ACCOUNT_TITLEBAR_PANEL_WIDTH = 400;
const PERSONALIZE_ACTION_IDS = [
  "workbench.action.openSettings"
];
const SIGN_OUT_ACTION_ID = "workbench.action.agenticSignOut";
const accountDateFormatter = safeIntl.DateTimeFormat(language, { month: "short", day: "numeric" });
const accountTimeFormatter = safeIntl.DateTimeFormat(language, { hour: "numeric", minute: "numeric" });
function shouldShowAccountPanelSummary(state, hasCopilotDashboard, isAccountLoading) {
  return !hasCopilotDashboard && !isAccountLoading && !(state.source === "copilot" && state.kind === "prominent");
}
const sessionsChangesPrimaryActionVisible = ContextKeyExpr.and(
  SinglePaneLayoutEnabledContext,
  SessionIsCreatedContext,
  SessionHasChangesContext
);
registerUpdateTitleBarMenuPlacement(Menus.TitleBarUpdate, {
  when: ContextKeyExpr.and(
    IsAuxiliaryWindowContext.toNegated(),
    SessionsWelcomeVisibleContext.toNegated(),
    sessionsChangesPrimaryActionVisible.negate()
  )
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: AGENTIC_SIGN_IN_COMMAND_ID,
      title: localize2("signIn", "Sign in to use GitHub Copilot"),
      icon: Codicon.signIn,
      menu: {
        id: AccountMenu,
        when: ContextKeyExpr.notEquals("defaultAccountStatus", "available"),
        group: "1_account",
        order: 1
      }
    });
  }
  async run(accessor) {
    await accessor.get(ICommandService).executeCommand(CHAT_SETUP_ACTION_ID);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.agenticSignOut",
      title: localize2("signOut", "Sign Out"),
      icon: Codicon.signOut,
      menu: {
        id: AccountMenu,
        when: ContextKeyExpr.equals("defaultAccountStatus", "available"),
        group: "1_account",
        order: 1
      }
    });
  }
  async run(accessor) {
    const defaultAccountService = accessor.get(IDefaultAccountService);
    const dialogService = accessor.get(IDialogService);
    const authenticationService = accessor.get(IAuthenticationService);
    const authenticationUsageService = accessor.get(IAuthenticationUsageService);
    const authenticationAccessService = accessor.get(IAuthenticationAccessService);
    const defaultAccount = await defaultAccountService.getDefaultAccount();
    if (!defaultAccount) {
      return;
    }
    const providerId = defaultAccount.authenticationProvider.id;
    const accountLabel = defaultAccount.accountName;
    const { confirmed } = await dialogService.confirm({
      type: Severity.Info,
      message: localize("agenticSignOutMessage", "Sign out of the Agents window?"),
      detail: localize("agenticSignOutDetail", "This will sign out '{0}' from the Agents window.", accountLabel),
      primaryButton: localize({ key: "agenticSignOutButton", comment: ["&& denotes a mnemonic"] }, "&&Sign Out")
    });
    if (!confirmed) {
      return;
    }
    const allSessions = await authenticationService.getSessions(providerId);
    const sessions = allSessions.filter((session) => session.account.label === accountLabel);
    await Promise.all(sessions.map((session) => authenticationService.removeSession(providerId, session.id)));
    authenticationUsageService.removeAccountUsage(providerId, accountLabel);
    authenticationAccessService.removeAllowedExtensions(providerId, accountLabel);
  }
});
MenuRegistry.appendMenuItem(AccountMenu, {
  command: {
    id: "workbench.action.openSettings",
    title: localize("settings", "Settings"),
    icon: Codicon.settingsGear
  },
  when: IsPhoneLayoutContext.negate(),
  group: "2_settings",
  order: 1
});
registerUpdateMenuItems(AccountMenu, "3_updates");
let TitleBarAccountWidget = class extends BaseActionViewItem {
  constructor(action, options, defaultAccountService, authenticationService, menuService, contextKeyService, hoverService, instantiationService, chatEntitlementService, codexAccountService, configurationService, commandService) {
    super(void 0, action, options);
    this.defaultAccountService = defaultAccountService;
    this.authenticationService = authenticationService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    this.chatEntitlementService = chatEntitlementService;
    this.codexAccountService = codexAccountService;
    this.configurationService = configurationService;
    this.commandService = commandService;
    this.isAccountLoading = true;
    this.accountRequestCounter = 0;
    this.avatarRequestCounter = 0;
    this.isMenuVisible = false;
    this.copilotDashboardStore = this._register(new MutableDisposable());
    this.clickPanelDisposable = this._register(new MutableDisposable());
    this.avatarLoadDisposable = this._register(new MutableDisposable());
    this.allowSignedOutWhenUsable = observeAllowSignedOutWhenUsable(configurationService);
    this.lastState = getAccountTitleBarState({
      isAccountLoading: true,
      entitlement: this.chatEntitlementService.entitlement,
      sentiment: this.chatEntitlementService.sentiment,
      quotas: this.chatEntitlementService.quotas,
      allowSignedOutWhenUsable: false
    });
    this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.refreshAccount()));
    this._register(this.authenticationService.onDidChangeSessions(() => this.refreshAccount()));
    this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.renderState()));
    this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.renderState()));
    this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.renderState()));
    this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.renderState()));
    this._register(this.codexAccountService.onDidChangeAccount(() => {
      this.clickPanelDisposable.clear();
      this.renderState();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(AgentHostCodexAgentEnabledSettingId) || event.affectsConfiguration(ChatAIDisabledSettingId)) {
        this.clickPanelDisposable.clear();
        this.renderState();
      }
      if (event.affectsConfiguration(ACCOUNTS_AVATAR_SETTING)) {
        this.refreshAvatar();
      }
    }));
    this._register(runOnChange(this.allowSignedOutWhenUsable, () => this.renderState()));
    this.refreshAccount();
  }
  setFocusable(_focusable) {
  }
  render(container) {
    super.render(container);
    this.container = container;
    container.classList.add("sessions-account-titlebar-widget");
    container.setAttribute("role", "button");
    container.tabIndex = 0;
    this.avatarElement = append(container, $("img.sessions-account-titlebar-widget-avatar", { alt: localize("accountAvatarAltFallback", "Account profile image"), draggable: "false" }));
    this.avatarElement.decoding = "async";
    this.avatarElement.referrerPolicy = "no-referrer";
    this.iconElement = append(container, $(".sessions-account-titlebar-widget-icon"));
    this.codexIconElement = append(container, $(".sessions-account-titlebar-widget-codex-icon"));
    this.codexIconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.openai));
    this.labelElement = append(container, $("span.sessions-account-titlebar-widget-label"));
    this.badgeElement = append(container, $("span.sessions-account-titlebar-widget-badge"));
    this.renderState();
  }
  onClick() {
    if (!this.container) {
      return;
    }
    this.showCombinedPanel();
  }
  async refreshAccount() {
    const requestId = ++this.accountRequestCounter;
    this.isAccountLoading = true;
    this.renderState();
    const info = await resolveAccountInfo(this.defaultAccountService, this.authenticationService);
    if (requestId !== this.accountRequestCounter || this._store.isDisposed) {
      return;
    }
    this.accountName = info?.accountName;
    this.accountProviderId = info?.accountProviderId;
    this.accountProviderLabel = info?.accountProviderLabel;
    this.accountIcon = info?.accountIcon;
    this.isAccountLoading = false;
    this.refreshAvatar();
    this.renderState();
  }
  renderState() {
    if (!this.container || !this.avatarElement || !this.iconElement || !this.codexIconElement || !this.labelElement || !this.badgeElement) {
      return;
    }
    const entitlement = this.accountName && this.chatEntitlementService.entitlement === ChatEntitlement.Unknown ? ChatEntitlement.Unresolved : this.chatEntitlementService.entitlement;
    const hasChatGPTAccount = hasSignedInCodexChatGPTAccount(
      this.codexAccountService.account,
      shouldShowCodexAccount(this.configurationService, true)
    );
    const state = getAccountTitleBarState({
      isAccountLoading: this.isAccountLoading,
      accountName: this.accountName,
      accountProviderLabel: this.accountProviderLabel,
      entitlement,
      sentiment: this.chatEntitlementService.sentiment,
      quotas: this.chatEntitlementService.quotas,
      allowSignedOutWhenUsable: this.allowSignedOutWhenUsable.get()
    });
    this.lastState = state;
    this.container.classList.remove("kind-default", "kind-accent", "kind-warning", "kind-prominent");
    this.container.classList.add(`kind-${state.kind}`);
    this.container.classList.toggle("menu-visible", this.isMenuVisible);
    this.container.setAttribute("aria-label", state.ariaLabel);
    const badgeKey = getAccountTitleBarBadgeKey(state);
    if (badgeKey !== this.lastBadgeKey) {
      this.lastBadgeKey = badgeKey;
      this.dismissedBadgeKey = void 0;
    }
    const shouldShowDotBadge = !!badgeKey && badgeKey !== this.dismissedBadgeKey;
    const loadedAvatarUrl = !this.isAccountLoading ? this.loadedAvatarUrl : void 0;
    const hasLoadedAvatar = !!loadedAvatarUrl;
    const titleBarIcon = state.dotBadge ? Codicon.account : state.icon;
    this.avatarElement.classList.toggle("visible", hasLoadedAvatar);
    this.avatarElement.alt = this.getAvatarAltText(hasLoadedAvatar);
    if (hasLoadedAvatar) {
      if (this.avatarElement.src !== loadedAvatarUrl) {
        this.avatarElement.src = loadedAvatarUrl;
      }
    } else {
      this.avatarElement.removeAttribute("src");
    }
    this.iconElement.className = `sessions-account-titlebar-widget-icon ${ThemeIcon.asClassName(titleBarIcon)}`;
    this.iconElement.classList.toggle("hidden", hasLoadedAvatar);
    this.container.classList.toggle("has-chatgpt-account", hasChatGPTAccount);
    this.codexIconElement.classList.toggle("visible", hasChatGPTAccount);
    this.labelElement.textContent = "";
    this.badgeElement.textContent = "";
    this.badgeElement.classList.toggle("dot-badge", shouldShowDotBadge);
    this.badgeElement.classList.toggle("dot-badge-warning", shouldShowDotBadge && state.dotBadge === "warning");
    this.badgeElement.classList.toggle("dot-badge-error", shouldShowDotBadge && state.dotBadge === "error");
    this.badgeElement.style.display = shouldShowDotBadge ? "" : "none";
  }
  getAvatarAltText(hasLoadedAvatar) {
    if (hasLoadedAvatar && this.accountProviderId === "github" && this.accountName) {
      return localize("accountAvatarAlt", "GitHub profile image for {0}", this.accountName);
    }
    return localize("accountAvatarAltFallback", "Account profile image");
  }
  refreshAvatar() {
    const avatarUrl = this.configurationService.getValue(ACCOUNTS_AVATAR_SETTING) ? getAccountProfileImageUrl(this.accountProviderId, this.accountName, this.accountIcon) : void 0;
    if (avatarUrl === this.currentAvatarUrl) {
      return;
    }
    this.currentAvatarUrl = avatarUrl;
    this.loadedAvatarUrl = void 0;
    this.avatarLoadDisposable.clear();
    const requestId = ++this.avatarRequestCounter;
    if (!avatarUrl) {
      this.renderState();
      return;
    }
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    const clearHandlers = () => {
      image.onload = null;
      image.onerror = null;
    };
    image.onload = () => {
      if (requestId !== this.avatarRequestCounter) {
        return;
      }
      this.loadedAvatarUrl = avatarUrl;
      this.renderState();
      clearHandlers();
    };
    image.onerror = () => {
      if (requestId !== this.avatarRequestCounter) {
        return;
      }
      this.loadedAvatarUrl = void 0;
      this.renderState();
      clearHandlers();
    };
    this.avatarLoadDisposable.value = toDisposable(() => {
      clearHandlers();
      image.src = "";
    });
    image.src = avatarUrl;
    this.renderState();
  }
  getHoverTarget() {
    const { left, width } = getDomNodePagePosition(this.container);
    return {
      targetElements: [this.container],
      x: left + width - SESSIONS_ACCOUNT_TITLEBAR_PANEL_WIDTH
    };
  }
  showCombinedPanel() {
    if (!this.container) {
      return;
    }
    if (this.isMenuVisible) {
      this.hoverService.hideHover(true);
      this.clickPanelDisposable.clear();
      return;
    }
    this.hoverService.hideHover(true);
    this.clickPanelDisposable.clear();
    const panelStore = new DisposableStore();
    this.clickPanelDisposable.value = panelStore;
    const badgeKey = getAccountTitleBarBadgeKey(this.lastState);
    if (badgeKey) {
      this.dismissedBadgeKey = badgeKey;
    }
    this.isMenuVisible = true;
    this.container.classList.add("menu-visible");
    this.renderState();
    panelStore.add({
      dispose: () => {
        this.isMenuVisible = false;
        this.container?.classList.remove("menu-visible");
        this.renderState();
        this.container?.focus();
      }
    });
    const panelContent = this.createCombinedPanelContent(panelStore);
    const hoverWidget = this.hoverService.showInstantHover({
      content: panelContent,
      target: this.getHoverTarget(),
      additionalClasses: ["sessions-account-titlebar-panel-hover"],
      position: { hoverPosition: HoverPosition.BELOW },
      persistence: { sticky: true, hideOnHover: false },
      appearance: { showPointer: false, skipFadeInAnimation: true, maxHeightRatio: 0.8 }
    }, true);
    if (hoverWidget) {
      panelStore.add(hoverWidget);
    }
    panelStore.add(disposableWindowInterval(mainWindow, () => {
      if (!panelContent.isConnected || hoverWidget?.isDisposed) {
        this.clickPanelDisposable.clear();
      }
    }, 500));
  }
  createCombinedPanelContent(panelStore) {
    const panel = $("div.sessions-account-titlebar-panel");
    const menu = this.menuService.createMenu(AccountMenu, this.contextKeyService);
    const rawActions = [];
    fillInActionBarActions(menu.getActions(), rawActions);
    menu.dispose();
    const codexAccount = this.codexAccountService.account;
    const codexAccountVisible = shouldShowCodexAccount(this.configurationService, true);
    const partitioned = this.partitionMenuActions(rawActions);
    const identities = append(panel, $(".sessions-account-titlebar-panel-identities"));
    if (this.accountName || this.isAccountLoading) {
      const copilotAccount = append(identities, $("section.sessions-account-titlebar-panel-provider-account", {
        "aria-label": localize("copilotAccountSectionLabel", "Copilot account")
      }));
      const copilotIdentity = append(copilotAccount, $(".sessions-account-titlebar-panel-provider-identity"));
      const loadedAvatarUrl = !this.isAccountLoading ? this.loadedAvatarUrl : void 0;
      if (loadedAvatarUrl) {
        const avatar = append(copilotIdentity, $("img.sessions-account-titlebar-panel-provider-avatar", {
          alt: this.getAvatarAltText(true),
          draggable: "false",
          src: loadedAvatarUrl
        }));
        avatar.decoding = "async";
        avatar.referrerPolicy = "no-referrer";
      } else {
        const accountIcon = append(copilotIdentity, $("span.sessions-account-titlebar-panel-provider-icon", { "aria-hidden": "true" }));
        accountIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.github));
      }
      const title = append(copilotIdentity, $("div.sessions-account-titlebar-panel-provider-name"));
      title.textContent = this.getPanelHeaderLabel();
      const copilotActions = append(copilotIdentity, $(".sessions-account-titlebar-panel-provider-actions"));
      const copilotActionBar = panelStore.add(new ActionBar(copilotActions));
      panelStore.add(copilotActionBar.onWillRun(() => {
        this.hoverService.hideHover(true);
        this.clickPanelDisposable.clear();
      }));
      copilotActionBar.push(panelStore.add(new Action(
        "copilot.manageModels",
        localize("manageCopilotModels", "Manage Copilot Models"),
        ThemeIcon.asClassName(Codicon.copilot),
        true,
        () => this.commandService.executeCommand(MANAGE_CHAT_COMMAND_ID, '@provider:"Copilot"')
      )), { icon: true, label: false });
      copilotActionBar.push(panelStore.add(new Action(
        "copilot.openAgentCustomizations",
        localize("openCopilotAgentCustomizations", "Agent Customizations for Copilot"),
        ThemeIcon.asClassName(Codicon.settingsGear),
        true,
        () => this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
          sessionType: SessionType.AgentHostCopilot,
          section: AICustomizationManagementSection.Agents
        })
      )), { icon: true, label: false });
      if (partitioned.signOut) {
        copilotActionBar.push(partitioned.signOut, { icon: true, label: false });
      }
      this.appendCopilotUsage(copilotAccount, panelStore);
    } else if (partitioned.signIn) {
      const copilotAccount = append(identities, $("section.sessions-account-titlebar-panel-provider-account.signed-out", {
        "aria-label": localize("copilotAccountSectionLabel", "Copilot account")
      }));
      const copilotIdentity = append(copilotAccount, $(".sessions-account-titlebar-panel-provider-identity"));
      const accountIcon = append(copilotIdentity, $("span.sessions-account-titlebar-panel-provider-icon", { "aria-hidden": "true" }));
      accountIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.github));
      const signInActions = append(copilotIdentity, $(".sessions-account-titlebar-panel-provider-sign-in-actions"));
      const signInActionBar = panelStore.add(new ActionBar(signInActions));
      panelStore.add(signInActionBar.onWillRun(() => {
        this.hoverService.hideHover(true);
        this.clickPanelDisposable.clear();
      }));
      signInActionBar.push(partitioned.signIn, { icon: false, label: true });
    }
    if (hasSignedInCodexChatGPTAccount(codexAccount, codexAccountVisible)) {
      const accountSection = append(identities, $("section.sessions-account-titlebar-panel-provider-account", {
        "aria-label": localize("chatGPTAccountSectionLabel", "ChatGPT account")
      }));
      const accountIdentity = append(accountSection, $(".sessions-account-titlebar-panel-provider-identity"));
      const accountIcon = append(accountIdentity, $("span.sessions-account-titlebar-panel-provider-icon", { "aria-hidden": "true" }));
      accountIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.openai));
      const accountName = append(accountIdentity, $(".sessions-account-titlebar-panel-provider-name"));
      accountName.textContent = codexAccount.email ?? localize("chatGPTAccountName", "ChatGPT");
      const accountActions = append(accountIdentity, $(".sessions-account-titlebar-panel-provider-actions"));
      const accountActionBar = panelStore.add(new ActionBar(accountActions));
      panelStore.add(accountActionBar.onWillRun(() => {
        this.hoverService.hideHover(true);
        this.clickPanelDisposable.clear();
      }));
      accountActionBar.push(panelStore.add(new Action(
        "codex.manageChatGPTModels",
        localize("manageChatGPTModels", "Manage ChatGPT Models"),
        ThemeIcon.asClassName(Codicon.openai),
        true,
        () => this.commandService.executeCommand(MANAGE_CHAT_COMMAND_ID, '@provider:"ChatGPT"')
      )), { icon: true, label: false });
      accountActionBar.push(panelStore.add(new Action(
        "codex.openAgentCustomizations",
        localize("openCodexAgentCustomizations", "Agent Customizations for Codex"),
        ThemeIcon.asClassName(Codicon.settingsGear),
        true,
        () => this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
          sessionType: SessionType.AgentHostCodex,
          section: AICustomizationManagementSection.HarnessSettings
        })
      )), { icon: true, label: false });
      accountActionBar.push(panelStore.add(new Action(
        "codex.signOutOfChatGPT",
        localize("signOutOfChatGPT", "Sign Out"),
        ThemeIcon.asClassName(Codicon.signOut),
        true,
        () => this.codexAccountService.signOut()
      )), { icon: true, label: false });
      this.appendChatGPTUsage(accountSection);
    } else {
      const codexAccountActions = createCodexAccountMenuActions(this.codexAccountService, codexAccountVisible);
      if (codexAccountActions.length) {
        const accountSection = append(identities, $("section.sessions-account-titlebar-panel-provider-account.signed-out", {
          "aria-label": localize("chatGPTAccountSectionLabel", "ChatGPT account")
        }));
        const accountIdentity = append(accountSection, $(".sessions-account-titlebar-panel-provider-identity"));
        const accountIcon = append(accountIdentity, $("span.sessions-account-titlebar-panel-provider-icon", { "aria-hidden": "true" }));
        accountIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.openai));
        const signInActions = append(accountIdentity, $(".sessions-account-titlebar-panel-provider-sign-in-actions"));
        const signInActionBar = panelStore.add(new ActionBar(signInActions));
        panelStore.add(signInActionBar.onWillRun(() => {
          this.hoverService.hideHover(true);
          this.clickPanelDisposable.clear();
        }));
        for (const action of codexAccountActions) {
          signInActionBar.push(action instanceof Action ? panelStore.add(action) : action, { icon: false, label: true });
        }
      }
    }
    if (this.shouldShowCopilotDashboardHover()) {
      const footer = append(panel, $("section.sessions-account-titlebar-panel-footer", {
        "aria-label": localize("sessionsAccountStatusSectionLabel", "Account status")
      }));
      append(footer, this.createCopilotHoverContent({ compactQuotaLayout: true }));
    }
    if (partitioned.other.some((a) => !(a instanceof Separator))) {
      const actionsSection = append(panel, $(".sessions-account-titlebar-panel-actions"));
      const actionsActionBar = panelStore.add(new ActionBar(actionsSection, {
        orientation: ActionsOrientation.VERTICAL
      }));
      panelStore.add(actionsActionBar.onWillRun(() => {
        this.hoverService.hideHover(true);
        this.clickPanelDisposable.clear();
      }));
      let lastWasSeparator = true;
      for (const action of partitioned.other) {
        if (action instanceof Separator) {
          if (!lastWasSeparator) {
            actionsActionBar.push(action);
            lastWasSeparator = true;
          }
          continue;
        }
        lastWasSeparator = false;
        actionsActionBar.push(action, { icon: false, label: true });
      }
    }
    if (shouldShowAccountPanelSummary(this.lastState, this.shouldShowCopilotDashboardHover(), this.isAccountLoading)) {
      const contentSection = append(panel, $(".sessions-account-titlebar-panel-content"));
      const summary = append(contentSection, $(".sessions-account-titlebar-panel-summary"));
      summary.textContent = this.lastState.ariaLabel;
    }
    return panel;
  }
  appendCopilotUsage(accountSection, panelStore) {
    const quota = this.chatEntitlementService.quotas.premiumChat ?? this.chatEntitlementService.quotas.chat;
    const usage = append(accountSection, $(".sessions-account-titlebar-panel-provider-usage"));
    const planRow = append(usage, $(".sessions-account-titlebar-panel-provider-metric-row.primary"));
    append(planRow, $("span.sessions-account-titlebar-panel-provider-plan", void 0, this.getCopilotPlanLabel()));
    if (quota && !quota.unlimited) {
      const usedPercentage = Math.max(0, Math.floor(100 - quota.percentRemaining));
      const usageValue = append(planRow, $("span.sessions-account-titlebar-panel-provider-usage-value", { tabIndex: 0 }));
      const percentageLabel = localize("copilotCreditsUsedPercentageValue", "{0}%", usedPercentage);
      const percentageAriaLabel = localize("copilotCreditsUsedPercentage", "{0}% credits used", usedPercentage);
      usageValue.textContent = percentageLabel;
      usageValue.setAttribute("aria-label", percentageAriaLabel);
      if (quota.entitlement) {
        const formatter = safeIntl.NumberFormat(language, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
        const used = quota.creditsUsed ?? (quota.quotaRemaining !== void 0 ? quota.entitlement - quota.quotaRemaining : quota.entitlement * (100 - quota.percentRemaining) / 100);
        const creditsValue = localize("copilotCreditsUsedRatioValue", "{0} / {1}", formatter.value.format(used), formatter.value.format(quota.entitlement));
        const creditsAriaLabel = localize("copilotCreditsUsedRatio", "{0} / {1} credits used", formatter.value.format(used), formatter.value.format(quota.entitlement));
        const showCredits = () => {
          usageValue.textContent = creditsValue;
          usageValue.setAttribute("aria-label", creditsAriaLabel);
        };
        const showPercentage = () => {
          usageValue.textContent = percentageLabel;
          usageValue.setAttribute("aria-label", percentageAriaLabel);
        };
        panelStore.add(addDisposableListener(usageValue, EventType.MOUSE_ENTER, showCredits));
        panelStore.add(addDisposableListener(usageValue, EventType.MOUSE_LEAVE, showPercentage));
        panelStore.add(addDisposableListener(usageValue, EventType.FOCUS, showCredits));
        panelStore.add(addDisposableListener(usageValue, EventType.BLUR, showPercentage));
      }
      const detailRow = append(usage, $(".sessions-account-titlebar-panel-provider-metric-row.secondary"));
      const resetLabel = this.getCopilotResetLabel(quota.resetAt);
      if (resetLabel) {
        append(detailRow, $("span.sessions-account-titlebar-panel-provider-reset", void 0, resetLabel));
      } else {
        detailRow.classList.add("without-reset");
      }
      append(detailRow, $("span.sessions-account-titlebar-panel-provider-usage-label", void 0, localize("copilotCreditsUsedLabel", "Credits used")));
    }
  }
  appendChatGPTUsage(accountSection) {
    const account = this.codexAccountService.account;
    const usage = append(accountSection, $(".sessions-account-titlebar-panel-provider-usage"));
    const planRow = append(usage, $(".sessions-account-titlebar-panel-provider-metric-row.primary"));
    append(planRow, $("span.sessions-account-titlebar-panel-provider-plan", void 0, account.planType ? localize("chatGPTPlan", "ChatGPT {0}", account.planType.charAt(0).toUpperCase() + account.planType.slice(1)) : localize("chatGPTSubscription", "ChatGPT subscription")));
    if (!account.rateLimit) {
      return;
    }
    const percentageFormatter = safeIntl.NumberFormat(language, { maximumFractionDigits: 0 });
    const usedPercentage = percentageFormatter.value.format(account.rateLimit.usedPercent);
    append(planRow, $("span.sessions-account-titlebar-panel-provider-usage-value", {
      "aria-label": localize("chatGPTLimitUsedPercentage", "{0}% used", usedPercentage)
    }, localize("chatGPTLimitUsedPercentageValue", "{0}%", usedPercentage)));
    const detailRow = append(usage, $(".sessions-account-titlebar-panel-provider-metric-row.secondary"));
    if (account.rateLimit.resetsAt) {
      append(detailRow, $("span.sessions-account-titlebar-panel-provider-reset", void 0, localize(
        "chatGPTLimitReset",
        "{0} resets {1}",
        this.getChatGPTLimitLabel(account.rateLimit.windowDurationMins),
        fromNow(account.rateLimit.resetsAt * 1e3, false, true)
      )));
    } else {
      detailRow.classList.add("without-reset");
    }
    append(detailRow, $("span.sessions-account-titlebar-panel-provider-usage-label", void 0, localize("chatGPTLimitUsedLabel", "Limit used")));
  }
  getCopilotResetLabel(resetAt) {
    if (resetAt) {
      const resetDate2 = new Date(resetAt * 1e3);
      return localize("copilotCreditsResetAt", "Resets {0} at {1}", accountDateFormatter.value.format(resetDate2), accountTimeFormatter.value.format(resetDate2));
    }
    const { resetDate, resetDateHasTime } = this.chatEntitlementService.quotas;
    if (!resetDate) {
      return void 0;
    }
    const date = new Date(resetDate);
    return resetDateHasTime ? localize("copilotCreditsResetAt", "Resets {0} at {1}", accountDateFormatter.value.format(date), accountTimeFormatter.value.format(date)) : localize("copilotCreditsReset", "Resets {0}", accountDateFormatter.value.format(date));
  }
  getChatGPTLimitLabel(windowDurationMins) {
    if (windowDurationMins !== void 0) {
      if (Math.abs(windowDurationMins - 7 * 24 * 60) <= 60) {
        return localize("chatGPTWeeklyLimitUsed", "Weekly limit");
      }
      if (Math.abs(windowDurationMins - 24 * 60) <= 60) {
        return localize("chatGPTDailyLimitUsed", "Daily limit");
      }
    }
    return localize("chatGPTUsageLimitUsed", "Usage limit");
  }
  partitionMenuActions(rawActions) {
    let signIn;
    let signOut;
    const personalizeMap = /* @__PURE__ */ new Map();
    const other = [];
    const pushSeparator = () => {
      if (other.length === 0 || other[other.length - 1] instanceof Separator) {
        return;
      }
      other.push(new Separator());
    };
    for (const action of rawActions) {
      if (action instanceof Separator) {
        pushSeparator();
        continue;
      }
      if (action.id === SIGN_OUT_ACTION_ID) {
        signOut = action;
        continue;
      }
      if (action.id === AGENTIC_SIGN_IN_COMMAND_ID) {
        if (!this.isAccountLoading) {
          signIn = action;
        }
        continue;
      }
      if (PERSONALIZE_ACTION_IDS.includes(action.id)) {
        personalizeMap.set(action.id, action);
        continue;
      }
      if (action.id.startsWith("update.")) {
        continue;
      }
      other.push(action);
    }
    if (other.length > 0 && other[other.length - 1] instanceof Separator) {
      other.pop();
    }
    const personalize = PERSONALIZE_ACTION_IDS.map((id) => personalizeMap.get(id)).filter((a) => !!a);
    return { signIn, signOut, personalize, other };
  }
  getPanelHeaderLabel() {
    if (this.accountName) {
      return this.accountName;
    }
    if (this.isAccountLoading) {
      return localize("loadingAccountHeader", "Loading Account...");
    }
    return localize("accountMenuHeaderFallback", "Account");
  }
  getCopilotPlanLabel() {
    switch (this.chatEntitlementService.entitlement) {
      case ChatEntitlement.Available:
      case ChatEntitlement.Free:
      case ChatEntitlement.EDU:
      case ChatEntitlement.Pro:
      case ChatEntitlement.ProPlus:
      case ChatEntitlement.Business:
      case ChatEntitlement.Enterprise:
      case ChatEntitlement.Max:
        return getChatPlanName(this.chatEntitlementService.entitlement);
      default:
        return "";
    }
  }
  shouldShowCopilotDashboardHover() {
    return !this.chatEntitlementService.sentiment.hidden && !!this.accountName;
  }
  createCopilotHoverContent(extraOptions) {
    const store = new DisposableStore();
    this.copilotDashboardStore.value = store;
    const dashboardElement = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, {
      disableInlineSuggestionsSettings: true,
      disableModelSelection: true,
      disableProviderOptions: true,
      disableCompletionsSnooze: true,
      disableQuickSettingsCollapsible: true,
      ...extraOptions
    });
    store.add(disposableWindowInterval(mainWindow, () => {
      if (!dashboardElement.isConnected) {
        store.dispose();
      }
    }, 2e3));
    return dashboardElement;
  }
};
TitleBarAccountWidget = __decorateClass([
  __decorateParam(2, IDefaultAccountService),
  __decorateParam(3, IAuthenticationService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IChatEntitlementService),
  __decorateParam(9, ICodexAccountService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, ICommandService)
], TitleBarAccountWidget);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SessionsTitleBarAccountWidgetAction,
      title: localize2("agentsAccountStatusTitleBar", "Agents Account and Status"),
      menu: {
        id: Menus.TitleBarRightLayout,
        group: "navigation",
        order: 100,
        when: IsAuxiliaryWindowContext.toNegated()
      }
    });
  }
  run() {
  }
});
let AccountWidgetContribution = class extends Disposable {
  constructor(actionViewItemService, instantiationService) {
    super();
    this._register(actionViewItemService.register(Menus.TitleBarRightLayout, SessionsTitleBarAccountWidgetAction, (action, options) => {
      return instantiationService.createInstance(TitleBarAccountWidget, action, options);
    }, void 0));
  }
};
AccountWidgetContribution.ID = "workbench.contrib.sessionsWidget";
AccountWidgetContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService)
], AccountWidgetContribution);
registerWorkbenchContribution2(AccountWidgetContribution.ID, AccountWidgetContribution, WorkbenchPhase.BlockRestore);
let ChatDashboardServiceImpl = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
  }
  createDashboardElement(store) {
    const dashboardElement = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, {
      disableInlineSuggestionsSettings: true,
      disableModelSelection: true,
      disableProviderOptions: true,
      disableCompletionsSnooze: true
    });
    store.add(disposableWindowInterval(mainWindow, () => {
      if (!dashboardElement.isConnected) {
        store.dispose();
      }
    }, 2e3));
    return dashboardElement;
  }
};
ChatDashboardServiceImpl = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ChatDashboardServiceImpl);
registerSingleton(IChatDashboardService, ChatDashboardServiceImpl, InstantiationType.Delayed);
export {
  shouldShowAccountPanelSummary
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWNjb3VudE1lbnVcXGJyb3dzZXJcXGFjY291bnQuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuLi8uLi8uLi9icm93c2VyL21lZGlhL3NpZGViYXJBY3Rpb25CdXR0b24uY3NzJztcbmltcG9ydCAnLi9tZWRpYS9hY2NvdW50V2lkZ2V0LmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvYWNjb3VudFRpdGxlQmFyV2lkZ2V0LmNzcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U3RhdHVzL21lZGlhL2NoYXRTdGF0dXMuY3NzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIHJ1bk9uQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yLCBJTWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgYXBwZW5kVXBkYXRlTWVudUl0ZW1zIGFzIHJlZ2lzdGVyVXBkYXRlTWVudUl0ZW1zIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvdXBkYXRlL2Jyb3dzZXIvdXBkYXRlLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBmaWxsSW5BY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwsIEV2ZW50VHlwZSwgZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyLCBBY3Rpb25zT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0sIElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJVcGRhdGVUaXRsZUJhck1lbnVQbGFjZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi91cGRhdGUvYnJvd3Nlci91cGRhdGVUaXRsZUJhckVudHJ5LmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgQ2hhdEVudGl0bGVtZW50U2VydmljZSwgZ2V0Q2hhdFBsYW5OYW1lLCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRTdGF0dXNEYXNoYm9hcmQsIElDaGF0U3RhdHVzRGFzaGJvYXJkT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U3RhdHVzL2NoYXRTdGF0dXNEYXNoYm9hcmQuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgZ2V0QWNjb3VudFByb2ZpbGVJbWFnZVVybCwgZ2V0QWNjb3VudFRpdGxlQmFyQmFkZ2VLZXksIGdldEFjY291bnRUaXRsZUJhclN0YXRlLCBJQWNjb3VudFRpdGxlQmFyU3RhdGUsIHJlc29sdmVBY2NvdW50SW5mbyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWNjb3VudFRpdGxlQmFyU3RhdGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2ZUFsbG93U2lnbmVkT3V0V2hlblVzYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvc2Vzc2lvbnNBdXRoR2F0ZS5qcyc7XG5pbXBvcnQgeyBJc1Bob25lTGF5b3V0Q29udGV4dCwgU2Vzc2lvbkhhc0NoYW5nZXNDb250ZXh0LCBTZXNzaW9uSXNDcmVhdGVkQ29udGV4dCwgU2Vzc2lvbnNXZWxjb21lVmlzaWJsZUNvbnRleHQsIFNpbmdsZVBhbmVMYXlvdXRFbmFibGVkQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUNDT1VOVFNfQVZBVEFSX1NFVFRJTkcsIElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdERhc2hib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXREYXNoYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29kZXhBY2NvdW50TWVudUFjdGlvbnMsIGhhc1NpZ25lZEluQ29kZXhDaGF0R1BUQWNjb3VudCwgSUNvZGV4QWNjb3VudFNlcnZpY2UsIHNob3VsZFNob3dDb2RleEFjY291bnQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYWdlbnRIb3N0L2Jyb3dzZXIvY29kZXhBY2NvdW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTUFOQUdFX0NIQVRfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50Q29tbWFuZHMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9haUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBmcm9tTm93LCBzYWZlSW50bCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgbGFuZ3VhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBSURpc2FibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2hhdC9jb21tb24vY2hhdFNldHRpbmdzLmpzJztcbmltcG9ydCB7IENIQVRfU0VUVVBfQUNUSU9OX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQUdFTlRJQ19TSUdOX0lOX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2Vzc2lvbkNvbW1hbmRzLmpzJztcblxuLy8gLS0tIEFjY291bnQgTWVudSBJdGVtcyAtLS0gLy9cbmNvbnN0IEFjY291bnRNZW51ID0gTWVudXMuQWNjb3VudE1lbnU7XG5jb25zdCBTZXNzaW9uc1RpdGxlQmFyQWNjb3VudFdpZGdldEFjdGlvbiA9ICdzZXNzaW9ucy5hY3Rpb24udGl0bGVCYXJBY2NvdW50V2lkZ2V0JztcbmNvbnN0IFNFU1NJT05TX0FDQ09VTlRfVElUTEVCQVJfUEFORUxfV0lEVEggPSA0MDA7XG5cbmNvbnN0IFBFUlNPTkFMSVpFX0FDVElPTl9JRFM6IHJlYWRvbmx5IHN0cmluZ1tdID0gW1xuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLFxuXTtcbmNvbnN0IFNJR05fT1VUX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50aWNTaWduT3V0JztcbmNvbnN0IGFjY291bnREYXRlRm9ybWF0dGVyID0gc2FmZUludGwuRGF0ZVRpbWVGb3JtYXQobGFuZ3VhZ2UsIHsgbW9udGg6ICdzaG9ydCcsIGRheTogJ251bWVyaWMnIH0pO1xuY29uc3QgYWNjb3VudFRpbWVGb3JtYXR0ZXIgPSBzYWZlSW50bC5EYXRlVGltZUZvcm1hdChsYW5ndWFnZSwgeyBob3VyOiAnbnVtZXJpYycsIG1pbnV0ZTogJ251bWVyaWMnIH0pO1xuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkU2hvd0FjY291bnRQYW5lbFN1bW1hcnkoc3RhdGU6IFBpY2s8SUFjY291bnRUaXRsZUJhclN0YXRlLCAnc291cmNlJyB8ICdraW5kJz4sIGhhc0NvcGlsb3REYXNoYm9hcmQ6IGJvb2xlYW4sIGlzQWNjb3VudExvYWRpbmc6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0cmV0dXJuICFoYXNDb3BpbG90RGFzaGJvYXJkICYmICFpc0FjY291bnRMb2FkaW5nICYmICEoc3RhdGUuc291cmNlID09PSAnY29waWxvdCcgJiYgc3RhdGUua2luZCA9PT0gJ3Byb21pbmVudCcpO1xufVxuXG5jb25zdCBzZXNzaW9uc0NoYW5nZXNQcmltYXJ5QWN0aW9uVmlzaWJsZSA9IENvbnRleHRLZXlFeHByLmFuZChcblx0U2luZ2xlUGFuZUxheW91dEVuYWJsZWRDb250ZXh0LFxuXHRTZXNzaW9uSXNDcmVhdGVkQ29udGV4dCxcblx0U2Vzc2lvbkhhc0NoYW5nZXNDb250ZXh0XG4pITtcblxuLy8gUmVnaXN0ZXIgdGhlIHNoYXJlZCBWUyBDb2RlIHVwZGF0ZSBlbnRyeSBhdCB0aGUgbGVhZGluZyBlZGdlIG9mIHRoZSBBZ2VudHMgdGl0bGViYXIgYWN0aW9ucy5cbnJlZ2lzdGVyVXBkYXRlVGl0bGVCYXJNZW51UGxhY2VtZW50KE1lbnVzLlRpdGxlQmFyVXBkYXRlLCB7XG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0U2Vzc2lvbnNXZWxjb21lVmlzaWJsZUNvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0c2Vzc2lvbnNDaGFuZ2VzUHJpbWFyeUFjdGlvblZpc2libGUubmVnYXRlKClcblx0KSxcbn0pO1xuXG4vLyBTaWduIEluIChzaG93biB3aGVuIHNpZ25lZCBvdXQpXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFHRU5USUNfU0lHTl9JTl9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2lnbkluJywgXCJTaWduIGluIHRvIHVzZSBHaXRIdWIgQ29waWxvdFwiKSxcblx0XHRcdGljb246IENvZGljb24uc2lnbkluLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogQWNjb3VudE1lbnUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnZGVmYXVsdEFjY291bnRTdGF0dXMnLCAnYXZhaWxhYmxlJyksXG5cdFx0XHRcdGdyb3VwOiAnMV9hY2NvdW50Jyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9TRVRVUF9BQ1RJT05fSUQpO1xuXHR9XG59KTtcblxuLy8gU2lnbiBPdXQgKHNob3duIHdoZW4gc2lnbmVkIGluKVxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudGljU2lnbk91dCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaWduT3V0JywgJ1NpZ24gT3V0JyksXG5cdFx0XHRpY29uOiBDb2RpY29uLnNpZ25PdXQsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBBY2NvdW50TWVudSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdkZWZhdWx0QWNjb3VudFN0YXR1cycsICdhdmFpbGFibGUnKSxcblx0XHRcdFx0Z3JvdXA6ICcxX2FjY291bnQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlZmF1bHRBY2NvdW50U2VydmljZSk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgYXV0aGVudGljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRoZW50aWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRoZW50aWNhdGlvblVzYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50ID0gYXdhaXQgZGVmYXVsdEFjY291bnRTZXJ2aWNlLmdldERlZmF1bHRBY2NvdW50KCk7XG5cdFx0aWYgKCFkZWZhdWx0QWNjb3VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSBkZWZhdWx0QWNjb3VudC5hdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkO1xuXHRcdGNvbnN0IGFjY291bnRMYWJlbCA9IGRlZmF1bHRBY2NvdW50LmFjY291bnROYW1lO1xuXHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudGljU2lnbk91dE1lc3NhZ2UnLCBcIlNpZ24gb3V0IG9mIHRoZSBBZ2VudHMgd2luZG93P1wiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FnZW50aWNTaWduT3V0RGV0YWlsJywgXCJUaGlzIHdpbGwgc2lnbiBvdXQgJ3swfScgZnJvbSB0aGUgQWdlbnRzIHdpbmRvdy5cIiwgYWNjb3VudExhYmVsKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAnYWdlbnRpY1NpZ25PdXRCdXR0b24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTaWduIE91dFwiKVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxTZXNzaW9ucyA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IGFsbFNlc3Npb25zLmZpbHRlcihzZXNzaW9uID0+IHNlc3Npb24uYWNjb3VudC5sYWJlbCA9PT0gYWNjb3VudExhYmVsKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChzZXNzaW9ucy5tYXAoc2Vzc2lvbiA9PiBhdXRoZW50aWNhdGlvblNlcnZpY2UucmVtb3ZlU2Vzc2lvbihwcm92aWRlcklkLCBzZXNzaW9uLmlkKSkpO1xuXHRcdGF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLnJlbW92ZUFjY291bnRVc2FnZShwcm92aWRlcklkLCBhY2NvdW50TGFiZWwpO1xuXHRcdGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZW1vdmVBbGxvd2VkRXh0ZW5zaW9ucyhwcm92aWRlcklkLCBhY2NvdW50TGFiZWwpO1xuXHR9XG59KTtcblxuLy8gU2V0dGluZ3MgKGhpZGRlbiBvbiBwaG9uZSBcdTIwMTQgbm8gc2V0dGluZ3MgVUkgb24gbW9iaWxlKVxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKEFjY291bnRNZW51LCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ3NldHRpbmdzJywgXCJTZXR0aW5nc1wiKSxcblx0XHRpY29uOiBDb2RpY29uLnNldHRpbmdzR2Vhcixcblx0fSxcblx0d2hlbjogSXNQaG9uZUxheW91dENvbnRleHQubmVnYXRlKCksXG5cdGdyb3VwOiAnMl9zZXR0aW5ncycsXG5cdG9yZGVyOiAxLFxufSk7XG5cbi8vIFVwZGF0ZSBhY3Rpb25zXG5yZWdpc3RlclVwZGF0ZU1lbnVJdGVtcyhBY2NvdW50TWVudSwgJzNfdXBkYXRlcycpO1xuXG5jbGFzcyBUaXRsZUJhckFjY291bnRXaWRnZXQgZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhdmF0YXJFbGVtZW50OiBIVE1MSW1hZ2VFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGljb25FbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb2RleEljb25FbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsYWJlbEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGJhZGdlRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYWNjb3VudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhY2NvdW50UHJvdmlkZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFjY291bnRQcm92aWRlckxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYWNjb3VudEljb246IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBpc0FjY291bnRMb2FkaW5nID0gdHJ1ZTtcblx0cHJpdmF0ZSBhY2NvdW50UmVxdWVzdENvdW50ZXIgPSAwO1xuXHRwcml2YXRlIGF2YXRhclJlcXVlc3RDb3VudGVyID0gMDtcblx0cHJpdmF0ZSBjdXJyZW50QXZhdGFyVXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbG9hZGVkQXZhdGFyVXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbGFzdFN0YXRlOiBSZXR1cm5UeXBlPHR5cGVvZiBnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZT47XG5cdHByaXZhdGUgaXNNZW51VmlzaWJsZSA9IGZhbHNlO1xuXHRwcml2YXRlIGxhc3RCYWRnZUtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGRpc21pc3NlZEJhZGdlS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29waWxvdERhc2hib2FyZFN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2xpY2tQYW5lbERpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBhdmF0YXJMb2FkRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0LyoqIFdoZXRoZXIgdGhlIGNvbmRpdGlvbmFsLWF1dGggb3B0LWluIHBlcm1pdHMgc2lnbmVkLW91dCBvcGVyYXRpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgYWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0b3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUNvZGV4QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RleEFjY291bnRTZXJ2aWNlOiBJQ29kZXhBY2NvdW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdHRoaXMuYWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlID0gb2JzZXJ2ZUFsbG93U2lnbmVkT3V0V2hlblVzYWJsZShjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5sYXN0U3RhdGUgPSBnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZSh7XG5cdFx0XHRpc0FjY291bnRMb2FkaW5nOiB0cnVlLFxuXHRcdFx0ZW50aXRsZW1lbnQ6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCxcblx0XHRcdHNlbnRpbWVudDogdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudCxcblx0XHRcdHF1b3RhczogdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcyxcblx0XHRcdGFsbG93U2lnbmVkT3V0V2hlblVzYWJsZTogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50KCgpID0+IHRoaXMucmVmcmVzaEFjY291bnQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKCkgPT4gdGhpcy5yZWZyZXNoQWNjb3VudCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW50aXRsZW1lbnQoKCkgPT4gdGhpcy5yZW5kZXJTdGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2VudGltZW50KCgpID0+IHRoaXMucmVuZGVyU3RhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQoKCkgPT4gdGhpcy5yZW5kZXJTdGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcoKCkgPT4gdGhpcy5yZW5kZXJTdGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb2RleEFjY291bnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWNjb3VudCgoKSA9PiB7XG5cdFx0XHR0aGlzLmNsaWNrUGFuZWxEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHR0aGlzLnJlbmRlclN0YXRlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZCkgfHwgZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdHRoaXMuY2xpY2tQYW5lbERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5yZW5kZXJTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKEFDQ09VTlRTX0FWQVRBUl9TRVRUSU5HKSkge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hBdmF0YXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Ly8gQSBzaWduZWQtb3V0IHVzZXIgc2VlcyBlaXRoZXIgYSBxdWlldCBcIlNpZ24gSW5cIiAodGhlIG9wdC1pbiBpcyBvbiwgc28gc2lnbmluZ1xuXHRcdC8vIGluIGlzIG9wdGlvbmFsKSBvciBhIHByb21pbmVudCBcIkFnZW50cyBTaWduZWQgT3V0XCIuIFJlLXJlbmRlciBzbyB0b2dnbGluZyB0aGVcblx0XHQvLyBzZXR0aW5nIHN3aXRjaGVzIGJldHdlZW4gdGhlbSB3aGlsZSB0aGUgd2luZG93IGlzIG9wZW4uXG5cdFx0dGhpcy5fcmVnaXN0ZXIocnVuT25DaGFuZ2UodGhpcy5hbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUsICgpID0+IHRoaXMucmVuZGVyU3RhdGUoKSkpO1xuXHRcdHRoaXMucmVmcmVzaEFjY291bnQoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldEZvY3VzYWJsZShfZm9jdXNhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gRG9uJ3QgbGV0IHRoZSBBY3Rpb25CYXIgcmVtb3ZlIGZvY3VzYWJpbGl0eSAtIHRoaXMgd2lkZ2V0IG11c3Rcblx0XHQvLyBhbHdheXMgYmUgcmVhY2hhYmxlIHZpYSBUYWIgZXZlbiB3aGVuIGEgc2libGluZyBpdGVtIGlzIGhpZGRlbi5cblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci13aWRnZXQnKTtcblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdGNvbnRhaW5lci50YWJJbmRleCA9IDA7XG5cblx0XHR0aGlzLmF2YXRhckVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdpbWcuc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci13aWRnZXQtYXZhdGFyJywgeyBhbHQ6IGxvY2FsaXplKCdhY2NvdW50QXZhdGFyQWx0RmFsbGJhY2snLCBcIkFjY291bnQgcHJvZmlsZSBpbWFnZVwiKSwgZHJhZ2dhYmxlOiAnZmFsc2UnIH0pKSBhcyBIVE1MSW1hZ2VFbGVtZW50O1xuXHRcdHRoaXMuYXZhdGFyRWxlbWVudC5kZWNvZGluZyA9ICdhc3luYyc7XG5cdFx0dGhpcy5hdmF0YXJFbGVtZW50LnJlZmVycmVyUG9saWN5ID0gJ25vLXJlZmVycmVyJztcblx0XHR0aGlzLmljb25FbGVtZW50ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItd2lkZ2V0LWljb24nKSk7XG5cdFx0dGhpcy5jb2RleEljb25FbGVtZW50ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItd2lkZ2V0LWNvZGV4LWljb24nKSk7XG5cdFx0dGhpcy5jb2RleEljb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5vcGVuYWkpKTtcblx0XHR0aGlzLmxhYmVsRWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci13aWRnZXQtbGFiZWwnKSk7XG5cdFx0dGhpcy5iYWRnZUVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItd2lkZ2V0LWJhZGdlJykpO1xuXG5cdFx0dGhpcy5yZW5kZXJTdGF0ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgb25DbGljaygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zaG93Q29tYmluZWRQYW5lbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoQWNjb3VudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXF1ZXN0SWQgPSArK3RoaXMuYWNjb3VudFJlcXVlc3RDb3VudGVyO1xuXHRcdHRoaXMuaXNBY2NvdW50TG9hZGluZyA9IHRydWU7XG5cdFx0dGhpcy5yZW5kZXJTdGF0ZSgpO1xuXG5cdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHJlc29sdmVBY2NvdW50SW5mbyh0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZSwgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChyZXF1ZXN0SWQgIT09IHRoaXMuYWNjb3VudFJlcXVlc3RDb3VudGVyIHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmFjY291bnROYW1lID0gaW5mbz8uYWNjb3VudE5hbWU7XG5cdFx0dGhpcy5hY2NvdW50UHJvdmlkZXJJZCA9IGluZm8/LmFjY291bnRQcm92aWRlcklkO1xuXHRcdHRoaXMuYWNjb3VudFByb3ZpZGVyTGFiZWwgPSBpbmZvPy5hY2NvdW50UHJvdmlkZXJMYWJlbDtcblx0XHR0aGlzLmFjY291bnRJY29uID0gaW5mbz8uYWNjb3VudEljb247XG5cdFx0dGhpcy5pc0FjY291bnRMb2FkaW5nID0gZmFsc2U7XG5cdFx0dGhpcy5yZWZyZXNoQXZhdGFyKCk7XG5cdFx0dGhpcy5yZW5kZXJTdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY29udGFpbmVyIHx8ICF0aGlzLmF2YXRhckVsZW1lbnQgfHwgIXRoaXMuaWNvbkVsZW1lbnQgfHwgIXRoaXMuY29kZXhJY29uRWxlbWVudCB8fCAhdGhpcy5sYWJlbEVsZW1lbnQgfHwgIXRoaXMuYmFkZ2VFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiB3ZSBoYXZlIGEgc2Vzc2lvbiBidXQgZW50aXRsZW1lbnQgaGFzbid0IHJlc29sdmVkIHlldCxcblx0XHQvLyB0cmVhdCBhcyBVbnJlc29sdmVkIHRvIGF2b2lkIHNob3dpbmcgXCJBZ2VudHMgU2lnbmVkIE91dFwiLlxuXHRcdGNvbnN0IGVudGl0bGVtZW50ID0gdGhpcy5hY2NvdW50TmFtZSAmJiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duXG5cdFx0XHQ/IENoYXRFbnRpdGxlbWVudC5VbnJlc29sdmVkXG5cdFx0XHQ6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudDtcblx0XHRjb25zdCBoYXNDaGF0R1BUQWNjb3VudCA9IGhhc1NpZ25lZEluQ29kZXhDaGF0R1BUQWNjb3VudChcblx0XHRcdHRoaXMuY29kZXhBY2NvdW50U2VydmljZS5hY2NvdW50LFxuXHRcdFx0c2hvdWxkU2hvd0NvZGV4QWNjb3VudCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0cnVlKSxcblx0XHQpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZSh7XG5cdFx0XHRpc0FjY291bnRMb2FkaW5nOiB0aGlzLmlzQWNjb3VudExvYWRpbmcsXG5cdFx0XHRhY2NvdW50TmFtZTogdGhpcy5hY2NvdW50TmFtZSxcblx0XHRcdGFjY291bnRQcm92aWRlckxhYmVsOiB0aGlzLmFjY291bnRQcm92aWRlckxhYmVsLFxuXHRcdFx0ZW50aXRsZW1lbnQsXG5cdFx0XHRzZW50aW1lbnQ6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQsXG5cdFx0XHRxdW90YXM6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMsXG5cdFx0XHRhbGxvd1NpZ25lZE91dFdoZW5Vc2FibGU6IHRoaXMuYWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlLmdldCgpLFxuXHRcdH0pO1xuXHRcdHRoaXMubGFzdFN0YXRlID0gc3RhdGU7XG5cblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdraW5kLWRlZmF1bHQnLCAna2luZC1hY2NlbnQnLCAna2luZC13YXJuaW5nJywgJ2tpbmQtcHJvbWluZW50Jyk7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZChga2luZC0ke3N0YXRlLmtpbmR9YCk7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbWVudS12aXNpYmxlJywgdGhpcy5pc01lbnVWaXNpYmxlKTtcblx0XHR0aGlzLmNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBzdGF0ZS5hcmlhTGFiZWwpO1xuXG5cdFx0Y29uc3QgYmFkZ2VLZXkgPSBnZXRBY2NvdW50VGl0bGVCYXJCYWRnZUtleShzdGF0ZSk7XG5cdFx0aWYgKGJhZGdlS2V5ICE9PSB0aGlzLmxhc3RCYWRnZUtleSkge1xuXHRcdFx0dGhpcy5sYXN0QmFkZ2VLZXkgPSBiYWRnZUtleTtcblx0XHRcdHRoaXMuZGlzbWlzc2VkQmFkZ2VLZXkgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0RvdEJhZGdlID0gISFiYWRnZUtleSAmJiBiYWRnZUtleSAhPT0gdGhpcy5kaXNtaXNzZWRCYWRnZUtleTtcblx0XHRjb25zdCBsb2FkZWRBdmF0YXJVcmwgPSAhdGhpcy5pc0FjY291bnRMb2FkaW5nID8gdGhpcy5sb2FkZWRBdmF0YXJVcmwgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaGFzTG9hZGVkQXZhdGFyID0gISFsb2FkZWRBdmF0YXJVcmw7XG5cdFx0Y29uc3QgdGl0bGVCYXJJY29uID0gc3RhdGUuZG90QmFkZ2UgPyBDb2RpY29uLmFjY291bnQgOiBzdGF0ZS5pY29uO1xuXG5cdFx0dGhpcy5hdmF0YXJFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3Zpc2libGUnLCBoYXNMb2FkZWRBdmF0YXIpO1xuXHRcdHRoaXMuYXZhdGFyRWxlbWVudC5hbHQgPSB0aGlzLmdldEF2YXRhckFsdFRleHQoaGFzTG9hZGVkQXZhdGFyKTtcblx0XHRpZiAoaGFzTG9hZGVkQXZhdGFyKSB7XG5cdFx0XHRpZiAodGhpcy5hdmF0YXJFbGVtZW50LnNyYyAhPT0gbG9hZGVkQXZhdGFyVXJsKSB7XG5cdFx0XHRcdHRoaXMuYXZhdGFyRWxlbWVudC5zcmMgPSBsb2FkZWRBdmF0YXJVcmw7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYXZhdGFyRWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ3NyYycpO1xuXHRcdH1cblxuXHRcdHRoaXMuaWNvbkVsZW1lbnQuY2xhc3NOYW1lID0gYHNlc3Npb25zLWFjY291bnQtdGl0bGViYXItd2lkZ2V0LWljb24gJHtUaGVtZUljb24uYXNDbGFzc05hbWUodGl0bGVCYXJJY29uKX1gO1xuXHRcdHRoaXMuaWNvbkVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgaGFzTG9hZGVkQXZhdGFyKTtcblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtY2hhdGdwdC1hY2NvdW50JywgaGFzQ2hhdEdQVEFjY291bnQpO1xuXHRcdHRoaXMuY29kZXhJY29uRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCd2aXNpYmxlJywgaGFzQ2hhdEdQVEFjY291bnQpO1xuXHRcdHRoaXMubGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGhpcy5iYWRnZUVsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblx0XHR0aGlzLmJhZGdlRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdkb3QtYmFkZ2UnLCBzaG91bGRTaG93RG90QmFkZ2UpO1xuXHRcdHRoaXMuYmFkZ2VFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2RvdC1iYWRnZS13YXJuaW5nJywgc2hvdWxkU2hvd0RvdEJhZGdlICYmIHN0YXRlLmRvdEJhZGdlID09PSAnd2FybmluZycpO1xuXHRcdHRoaXMuYmFkZ2VFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2RvdC1iYWRnZS1lcnJvcicsIHNob3VsZFNob3dEb3RCYWRnZSAmJiBzdGF0ZS5kb3RCYWRnZSA9PT0gJ2Vycm9yJyk7XG5cdFx0dGhpcy5iYWRnZUVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IHNob3VsZFNob3dEb3RCYWRnZSA/ICcnIDogJ25vbmUnO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBdmF0YXJBbHRUZXh0KGhhc0xvYWRlZEF2YXRhcjogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0aWYgKGhhc0xvYWRlZEF2YXRhciAmJiB0aGlzLmFjY291bnRQcm92aWRlcklkID09PSAnZ2l0aHViJyAmJiB0aGlzLmFjY291bnROYW1lKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FjY291bnRBdmF0YXJBbHQnLCBcIkdpdEh1YiBwcm9maWxlIGltYWdlIGZvciB7MH1cIiwgdGhpcy5hY2NvdW50TmFtZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxvY2FsaXplKCdhY2NvdW50QXZhdGFyQWx0RmFsbGJhY2snLCBcIkFjY291bnQgcHJvZmlsZSBpbWFnZVwiKTtcblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaEF2YXRhcigpOiB2b2lkIHtcblx0XHRjb25zdCBhdmF0YXJVcmwgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFDQ09VTlRTX0FWQVRBUl9TRVRUSU5HKVxuXHRcdFx0PyBnZXRBY2NvdW50UHJvZmlsZUltYWdlVXJsKHRoaXMuYWNjb3VudFByb3ZpZGVySWQsIHRoaXMuYWNjb3VudE5hbWUsIHRoaXMuYWNjb3VudEljb24pXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRpZiAoYXZhdGFyVXJsID09PSB0aGlzLmN1cnJlbnRBdmF0YXJVcmwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnRBdmF0YXJVcmwgPSBhdmF0YXJVcmw7XG5cdFx0dGhpcy5sb2FkZWRBdmF0YXJVcmwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5hdmF0YXJMb2FkRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9ICsrdGhpcy5hdmF0YXJSZXF1ZXN0Q291bnRlcjtcblxuXHRcdGlmICghYXZhdGFyVXJsKSB7XG5cdFx0XHR0aGlzLnJlbmRlclN0YXRlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW1hZ2UgPSBuZXcgSW1hZ2UoKTtcblx0XHRpbWFnZS5yZWZlcnJlclBvbGljeSA9ICduby1yZWZlcnJlcic7XG5cdFx0Y29uc3QgY2xlYXJIYW5kbGVycyA9ICgpID0+IHtcblx0XHRcdGltYWdlLm9ubG9hZCA9IG51bGw7XG5cdFx0XHRpbWFnZS5vbmVycm9yID0gbnVsbDtcblx0XHR9O1xuXHRcdGltYWdlLm9ubG9hZCA9ICgpID0+IHtcblx0XHRcdGlmIChyZXF1ZXN0SWQgIT09IHRoaXMuYXZhdGFyUmVxdWVzdENvdW50ZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmxvYWRlZEF2YXRhclVybCA9IGF2YXRhclVybDtcblx0XHRcdHRoaXMucmVuZGVyU3RhdGUoKTtcblx0XHRcdGNsZWFySGFuZGxlcnMoKTtcblx0XHR9O1xuXHRcdGltYWdlLm9uZXJyb3IgPSAoKSA9PiB7XG5cdFx0XHRpZiAocmVxdWVzdElkICE9PSB0aGlzLmF2YXRhclJlcXVlc3RDb3VudGVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5sb2FkZWRBdmF0YXJVcmwgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnJlbmRlclN0YXRlKCk7XG5cdFx0XHRjbGVhckhhbmRsZXJzKCk7XG5cdFx0fTtcblx0XHR0aGlzLmF2YXRhckxvYWREaXNwb3NhYmxlLnZhbHVlID0gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNsZWFySGFuZGxlcnMoKTtcblx0XHRcdGltYWdlLnNyYyA9ICcnO1xuXHRcdH0pO1xuXHRcdGltYWdlLnNyYyA9IGF2YXRhclVybDtcblx0XHR0aGlzLnJlbmRlclN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEhvdmVyVGFyZ2V0KCk6IHsgdGFyZ2V0RWxlbWVudHM6IEhUTUxFbGVtZW50W107IHg6IG51bWJlciB9IHtcblx0XHRjb25zdCB7IGxlZnQsIHdpZHRoIH0gPSBnZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuY29udGFpbmVyISk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRhcmdldEVsZW1lbnRzOiBbdGhpcy5jb250YWluZXIhXSxcblx0XHRcdHg6IGxlZnQgKyB3aWR0aCAtIFNFU1NJT05TX0FDQ09VTlRfVElUTEVCQVJfUEFORUxfV0lEVEgsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd0NvbWJpbmVkUGFuZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzTWVudVZpc2libGUpIHtcblx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHRcdHRoaXMuY2xpY2tQYW5lbERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cdFx0dGhpcy5jbGlja1BhbmVsRGlzcG9zYWJsZS5jbGVhcigpO1xuXG5cdFx0Y29uc3QgcGFuZWxTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmNsaWNrUGFuZWxEaXNwb3NhYmxlLnZhbHVlID0gcGFuZWxTdG9yZTtcblxuXHRcdGNvbnN0IGJhZGdlS2V5ID0gZ2V0QWNjb3VudFRpdGxlQmFyQmFkZ2VLZXkodGhpcy5sYXN0U3RhdGUpO1xuXHRcdGlmIChiYWRnZUtleSkge1xuXHRcdFx0dGhpcy5kaXNtaXNzZWRCYWRnZUtleSA9IGJhZGdlS2V5O1xuXHRcdH1cblxuXHRcdHRoaXMuaXNNZW51VmlzaWJsZSA9IHRydWU7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbWVudS12aXNpYmxlJyk7XG5cdFx0dGhpcy5yZW5kZXJTdGF0ZSgpO1xuXG5cdFx0cGFuZWxTdG9yZS5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmlzTWVudVZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5jb250YWluZXI/LmNsYXNzTGlzdC5yZW1vdmUoJ21lbnUtdmlzaWJsZScpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclN0YXRlKCk7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyPy5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcGFuZWxDb250ZW50ID0gdGhpcy5jcmVhdGVDb21iaW5lZFBhbmVsQ29udGVudChwYW5lbFN0b3JlKTtcblx0XHRjb25zdCBob3ZlcldpZGdldCA9IHRoaXMuaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0Y29udGVudDogcGFuZWxDb250ZW50LFxuXHRcdFx0dGFyZ2V0OiB0aGlzLmdldEhvdmVyVGFyZ2V0KCksXG5cdFx0XHRhZGRpdGlvbmFsQ2xhc3NlczogWydzZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLWhvdmVyJ10sXG5cdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XIH0sXG5cdFx0XHRwZXJzaXN0ZW5jZTogeyBzdGlja3k6IHRydWUsIGhpZGVPbkhvdmVyOiBmYWxzZSB9LFxuXHRcdFx0YXBwZWFyYW5jZTogeyBzaG93UG9pbnRlcjogZmFsc2UsIHNraXBGYWRlSW5BbmltYXRpb246IHRydWUsIG1heEhlaWdodFJhdGlvOiAwLjggfSxcblx0XHR9LCB0cnVlKTtcblxuXHRcdGlmIChob3ZlcldpZGdldCkge1xuXHRcdFx0cGFuZWxTdG9yZS5hZGQoaG92ZXJXaWRnZXQpO1xuXHRcdH1cblxuXHRcdHBhbmVsU3RvcmUuYWRkKGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbChtYWluV2luZG93LCAoKSA9PiB7XG5cdFx0XHRpZiAoIXBhbmVsQ29udGVudC5pc0Nvbm5lY3RlZCB8fCBob3ZlcldpZGdldD8uaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR0aGlzLmNsaWNrUGFuZWxEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSwgNTAwKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvbWJpbmVkUGFuZWxDb250ZW50KHBhbmVsU3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBwYW5lbCA9ICQoJ2Rpdi5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsJyk7XG5cblx0XHQvLyBCdWlsZCB0aGUgbWVudSBhY3Rpb25zIG9uY2UgYW5kIHBhcnRpdGlvbiB0aGVtLlxuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoQWNjb3VudE1lbnUsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IHJhd0FjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGZpbGxJbkFjdGlvbkJhckFjdGlvbnMobWVudS5nZXRBY3Rpb25zKCksIHJhd0FjdGlvbnMpO1xuXHRcdG1lbnUuZGlzcG9zZSgpO1xuXHRcdGNvbnN0IGNvZGV4QWNjb3VudCA9IHRoaXMuY29kZXhBY2NvdW50U2VydmljZS5hY2NvdW50O1xuXHRcdGNvbnN0IGNvZGV4QWNjb3VudFZpc2libGUgPSBzaG91bGRTaG93Q29kZXhBY2NvdW50KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRydWUpO1xuXHRcdGNvbnN0IHBhcnRpdGlvbmVkID0gdGhpcy5wYXJ0aXRpb25NZW51QWN0aW9ucyhyYXdBY3Rpb25zKTtcblxuXHRcdGNvbnN0IGlkZW50aXRpZXMgPSBhcHBlbmQocGFuZWwsICQoJy5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLWlkZW50aXRpZXMnKSk7XG5cdFx0aWYgKHRoaXMuYWNjb3VudE5hbWUgfHwgdGhpcy5pc0FjY291bnRMb2FkaW5nKSB7XG5cdFx0XHRjb25zdCBjb3BpbG90QWNjb3VudCA9IGFwcGVuZChpZGVudGl0aWVzLCAkKCdzZWN0aW9uLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtcHJvdmlkZXItYWNjb3VudCcsIHtcblx0XHRcdFx0J2FyaWEtbGFiZWwnOiBsb2NhbGl6ZSgnY29waWxvdEFjY291bnRTZWN0aW9uTGFiZWwnLCBcIkNvcGlsb3QgYWNjb3VudFwiKVxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgY29waWxvdElkZW50aXR5ID0gYXBwZW5kKGNvcGlsb3RBY2NvdW50LCAkKCcuc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci1wYW5lbC1wcm92aWRlci1pZGVudGl0eScpKTtcblx0XHRcdGNvbnN0IGxvYWRlZEF2YXRhclVybCA9ICF0aGlzLmlzQWNjb3VudExvYWRpbmcgPyB0aGlzLmxvYWRlZEF2YXRhclVybCA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChsb2FkZWRBdmF0YXJVcmwpIHtcblx0XHRcdFx0Y29uc3QgYXZhdGFyID0gYXBwZW5kKGNvcGlsb3RJZGVudGl0eSwgJCgnaW1nLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtcHJvdmlkZXItYXZhdGFyJywge1xuXHRcdFx0XHRcdGFsdDogdGhpcy5nZXRBdmF0YXJBbHRUZXh0KHRydWUpLFxuXHRcdFx0XHRcdGRyYWdnYWJsZTogJ2ZhbHNlJyxcblx0XHRcdFx0XHRzcmM6IGxvYWRlZEF2YXRhclVybCxcblx0XHRcdFx0fSkpIGFzIEhUTUxJbWFnZUVsZW1lbnQ7XG5cdFx0XHRcdGF2YXRhci5kZWNvZGluZyA9ICdhc3luYyc7XG5cdFx0XHRcdGF2YXRhci5yZWZlcnJlclBvbGljeSA9ICduby1yZWZlcnJlcic7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBhY2NvdW50SWNvbiA9IGFwcGVuZChjb3BpbG90SWRlbnRpdHksICQoJ3NwYW4uc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci1wYW5lbC1wcm92aWRlci1pY29uJywgeyAnYXJpYS1oaWRkZW4nOiAndHJ1ZScgfSkpO1xuXHRcdFx0XHRhY2NvdW50SWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZ2l0aHViKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0aXRsZSA9IGFwcGVuZChjb3BpbG90SWRlbnRpdHksICQoJ2Rpdi5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLXByb3ZpZGVyLW5hbWUnKSk7XG5cdFx0XHR0aXRsZS50ZXh0Q29udGVudCA9IHRoaXMuZ2V0UGFuZWxIZWFkZXJMYWJlbCgpO1xuXHRcdFx0Y29uc3QgY29waWxvdEFjdGlvbnMgPSBhcHBlbmQoY29waWxvdElkZW50aXR5LCAkKCcuc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci1wYW5lbC1wcm92aWRlci1hY3Rpb25zJykpO1xuXHRcdFx0Y29uc3QgY29waWxvdEFjdGlvbkJhciA9IHBhbmVsU3RvcmUuYWRkKG5ldyBBY3Rpb25CYXIoY29waWxvdEFjdGlvbnMpKTtcblx0XHRcdHBhbmVsU3RvcmUuYWRkKGNvcGlsb3RBY3Rpb25CYXIub25XaWxsUnVuKCgpID0+IHtcblx0XHRcdFx0dGhpcy5ob3ZlclNlcnZpY2UuaGlkZUhvdmVyKHRydWUpO1xuXHRcdFx0XHR0aGlzLmNsaWNrUGFuZWxEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRjb3BpbG90QWN0aW9uQmFyLnB1c2gocGFuZWxTdG9yZS5hZGQobmV3IEFjdGlvbihcblx0XHRcdFx0J2NvcGlsb3QubWFuYWdlTW9kZWxzJyxcblx0XHRcdFx0bG9jYWxpemUoJ21hbmFnZUNvcGlsb3RNb2RlbHMnLCBcIk1hbmFnZSBDb3BpbG90IE1vZGVsc1wiKSxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY29waWxvdCksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTUFOQUdFX0NIQVRfQ09NTUFORF9JRCwgJ0Bwcm92aWRlcjpcIkNvcGlsb3RcIicpLFxuXHRcdFx0KSksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0Y29waWxvdEFjdGlvbkJhci5wdXNoKHBhbmVsU3RvcmUuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHRcdCdjb3BpbG90Lm9wZW5BZ2VudEN1c3RvbWl6YXRpb25zJyxcblx0XHRcdFx0bG9jYWxpemUoJ29wZW5Db3BpbG90QWdlbnRDdXN0b21pemF0aW9ucycsIFwiQWdlbnQgQ3VzdG9taXphdGlvbnMgZm9yIENvcGlsb3RcIiksXG5cdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNldHRpbmdzR2VhciksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudENvbW1hbmRzLk9wZW5FZGl0b3IsIHtcblx0XHRcdFx0XHRzZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCxcblx0XHRcdFx0XHRzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMsXG5cdFx0XHRcdH0pLFxuXHRcdFx0KSksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0aWYgKHBhcnRpdGlvbmVkLnNpZ25PdXQpIHtcblx0XHRcdFx0Y29waWxvdEFjdGlvbkJhci5wdXNoKHBhcnRpdGlvbmVkLnNpZ25PdXQsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5hcHBlbmRDb3BpbG90VXNhZ2UoY29waWxvdEFjY291bnQsIHBhbmVsU3RvcmUpO1xuXHRcdH0gZWxzZSBpZiAocGFydGl0aW9uZWQuc2lnbkluKSB7XG5cdFx0XHRjb25zdCBjb3BpbG90QWNjb3VudCA9IGFwcGVuZChpZGVudGl0aWVzLCAkKCdzZWN0aW9uLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtcHJvdmlkZXItYWNjb3VudC5zaWduZWQtb3V0Jywge1xuXHRcdFx0XHQnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCdjb3BpbG90QWNjb3VudFNlY3Rpb25MYWJlbCcsIFwiQ29waWxvdCBhY2NvdW50XCIpXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCBjb3BpbG90SWRlbnRpdHkgPSBhcHBlbmQoY29waWxvdEFjY291bnQsICQoJy5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLXByb3ZpZGVyLWlkZW50aXR5JykpO1xuXHRcdFx0Y29uc3QgYWNjb3VudEljb24gPSBhcHBlbmQoY29waWxvdElkZW50aXR5LCAkKCdzcGFuLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtcHJvdmlkZXItaWNvbicsIHsgJ2FyaWEtaGlkZGVuJzogJ3RydWUnIH0pKTtcblx0XHRcdGFjY291bnRJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5naXRodWIpKTtcblx0XHRcdGNvbnN0IHNpZ25JbkFjdGlvbnMgPSBhcHBlbmQoY29waWxvdElkZW50aXR5LCAkKCcuc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci1wYW5lbC1wcm92aWRlci1zaWduLWluLWFjdGlvbnMnKSk7XG5cdFx0XHRjb25zdCBzaWduSW5BY3Rpb25CYXIgPSBwYW5lbFN0b3JlLmFkZChuZXcgQWN0aW9uQmFyKHNpZ25JbkFjdGlvbnMpKTtcblx0XHRcdHBhbmVsU3RvcmUuYWRkKHNpZ25JbkFjdGlvbkJhci5vbldpbGxSdW4oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cdFx0XHRcdHRoaXMuY2xpY2tQYW5lbERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdH0pKTtcblx0XHRcdHNpZ25JbkFjdGlvbkJhci5wdXNoKHBhcnRpdGlvbmVkLnNpZ25JbiwgeyBpY29uOiBmYWxzZSwgbGFiZWw6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKGhhc1NpZ25lZEluQ29kZXhDaGF0R1BUQWNjb3VudChjb2RleEFjY291bnQsIGNvZGV4QWNjb3VudFZpc2libGUpKSB7XG5cdFx0XHRjb25zdCBhY2NvdW50U2VjdGlvbiA9IGFwcGVuZChpZGVudGl0aWVzLCAkKCdzZWN0aW9uLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtcHJvdmlkZXItYWNjb3VudCcsIHtcblx0XHRcdFx0J2FyaWEtbGFiZWwnOiBsb2NhbGl6ZSgnY2hhdEdQVEFjY291bnRTZWN0aW9uTGFiZWwnLCBcIkNoYXRHUFQgYWNjb3VudFwiKVxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgYWNjb3VudElkZW50aXR5ID0gYXBwZW5kKGFjY291bnRTZWN0aW9uLCAkKCcuc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci1wYW5lbC1wcm92aWRlci1pZGVudGl0eScpKTtcblx0XHRcdGNvbnN0IGFjY291bnRJY29uID0gYXBwZW5kKGFjY291bnRJZGVudGl0eSwgJCgnc3Bhbi5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLXByb3ZpZGVyLWljb24nLCB7ICdhcmlhLWhpZGRlbic6ICd0cnVlJyB9KSk7XG5cdFx0XHRhY2NvdW50SWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ub3BlbmFpKSk7XG5cdFx0XHRjb25zdCBhY2NvdW50TmFtZSA9IGFwcGVuZChhY2NvdW50SWRlbnRpdHksICQoJy5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLXByb3ZpZGVyLW5hbWUnKSk7XG5cdFx0XHRhY2NvdW50TmFtZS50ZXh0Q29udGVudCA9IGNvZGV4QWNjb3VudC5lbWFpbCA/PyBsb2NhbGl6ZSgnY2hhdEdQVEFjY291bnROYW1lJywgXCJDaGF0R1BUXCIpO1xuXHRcdFx0Y29uc3QgYWNjb3VudEFjdGlvbnMgPSBhcHBlbmQoYWNjb3VudElkZW50aXR5LCAkKCcuc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci1wYW5lbC1wcm92aWRlci1hY3Rpb25zJykpO1xuXHRcdFx0Y29uc3QgYWNjb3VudEFjdGlvbkJhciA9IHBhbmVsU3RvcmUuYWRkKG5ldyBBY3Rpb25CYXIoYWNjb3VudEFjdGlvbnMpKTtcblx0XHRcdHBhbmVsU3RvcmUuYWRkKGFjY291bnRBY3Rpb25CYXIub25XaWxsUnVuKCgpID0+IHtcblx0XHRcdFx0dGhpcy5ob3ZlclNlcnZpY2UuaGlkZUhvdmVyKHRydWUpO1xuXHRcdFx0XHR0aGlzLmNsaWNrUGFuZWxEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRhY2NvdW50QWN0aW9uQmFyLnB1c2gocGFuZWxTdG9yZS5hZGQobmV3IEFjdGlvbihcblx0XHRcdFx0J2NvZGV4Lm1hbmFnZUNoYXRHUFRNb2RlbHMnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnbWFuYWdlQ2hhdEdQVE1vZGVscycsIFwiTWFuYWdlIENoYXRHUFQgTW9kZWxzXCIpLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5vcGVuYWkpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE1BTkFHRV9DSEFUX0NPTU1BTkRfSUQsICdAcHJvdmlkZXI6XCJDaGF0R1BUXCInKSxcblx0XHRcdCkpLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHRcdGFjY291bnRBY3Rpb25CYXIucHVzaChwYW5lbFN0b3JlLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0XHQnY29kZXgub3BlbkFnZW50Q3VzdG9taXphdGlvbnMnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnb3BlbkNvZGV4QWdlbnRDdXN0b21pemF0aW9ucycsIFwiQWdlbnQgQ3VzdG9taXphdGlvbnMgZm9yIENvZGV4XCIpLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zZXR0aW5nc0dlYXIpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRDb21tYW5kcy5PcGVuRWRpdG9yLCB7XG5cdFx0XHRcdFx0c2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvZGV4LFxuXHRcdFx0XHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhhcm5lc3NTZXR0aW5ncyxcblx0XHRcdFx0fSksXG5cdFx0XHQpKSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0XHRhY2NvdW50QWN0aW9uQmFyLnB1c2gocGFuZWxTdG9yZS5hZGQobmV3IEFjdGlvbihcblx0XHRcdFx0J2NvZGV4LnNpZ25PdXRPZkNoYXRHUFQnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2lnbk91dE9mQ2hhdEdQVCcsIFwiU2lnbiBPdXRcIiksXG5cdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNpZ25PdXQpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmNvZGV4QWNjb3VudFNlcnZpY2Uuc2lnbk91dCgpLFxuXHRcdFx0KSksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0dGhpcy5hcHBlbmRDaGF0R1BUVXNhZ2UoYWNjb3VudFNlY3Rpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBjb2RleEFjY291bnRBY3Rpb25zID0gY3JlYXRlQ29kZXhBY2NvdW50TWVudUFjdGlvbnModGhpcy5jb2RleEFjY291bnRTZXJ2aWNlLCBjb2RleEFjY291bnRWaXNpYmxlKTtcblx0XHRcdGlmIChjb2RleEFjY291bnRBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBhY2NvdW50U2VjdGlvbiA9IGFwcGVuZChpZGVudGl0aWVzLCAkKCdzZWN0aW9uLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtcHJvdmlkZXItYWNjb3VudC5zaWduZWQtb3V0Jywge1xuXHRcdFx0XHRcdCdhcmlhLWxhYmVsJzogbG9jYWxpemUoJ2NoYXRHUFRBY2NvdW50U2VjdGlvbkxhYmVsJywgXCJDaGF0R1BUIGFjY291bnRcIilcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRjb25zdCBhY2NvdW50SWRlbnRpdHkgPSBhcHBlbmQoYWNjb3VudFNlY3Rpb24sICQoJy5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLXByb3ZpZGVyLWlkZW50aXR5JykpO1xuXHRcdFx0XHRjb25zdCBhY2NvdW50SWNvbiA9IGFwcGVuZChhY2NvdW50SWRlbnRpdHksICQoJ3NwYW4uc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci1wYW5lbC1wcm92aWRlci1pY29uJywgeyAnYXJpYS1oaWRkZW4nOiAndHJ1ZScgfSkpO1xuXHRcdFx0XHRhY2NvdW50SWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ub3BlbmFpKSk7XG5cdFx0XHRcdGNvbnN0IHNpZ25JbkFjdGlvbnMgPSBhcHBlbmQoYWNjb3VudElkZW50aXR5LCAkKCcuc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci1wYW5lbC1wcm92aWRlci1zaWduLWluLWFjdGlvbnMnKSk7XG5cdFx0XHRcdGNvbnN0IHNpZ25JbkFjdGlvbkJhciA9IHBhbmVsU3RvcmUuYWRkKG5ldyBBY3Rpb25CYXIoc2lnbkluQWN0aW9ucykpO1xuXHRcdFx0XHRwYW5lbFN0b3JlLmFkZChzaWduSW5BY3Rpb25CYXIub25XaWxsUnVuKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy5jbGlja1BhbmVsRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGNvZGV4QWNjb3VudEFjdGlvbnMpIHtcblx0XHRcdFx0XHRzaWduSW5BY3Rpb25CYXIucHVzaChhY3Rpb24gaW5zdGFuY2VvZiBBY3Rpb24gPyBwYW5lbFN0b3JlLmFkZChhY3Rpb24pIDogYWN0aW9uLCB7IGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNob3VsZFNob3dDb3BpbG90RGFzaGJvYXJkSG92ZXIoKSkge1xuXHRcdFx0Y29uc3QgZm9vdGVyID0gYXBwZW5kKHBhbmVsLCAkKCdzZWN0aW9uLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtZm9vdGVyJywge1xuXHRcdFx0XHQnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCdzZXNzaW9uc0FjY291bnRTdGF0dXNTZWN0aW9uTGFiZWwnLCBcIkFjY291bnQgc3RhdHVzXCIpXG5cdFx0XHR9KSk7XG5cdFx0XHRhcHBlbmQoZm9vdGVyLCB0aGlzLmNyZWF0ZUNvcGlsb3RIb3ZlckNvbnRlbnQoeyBjb21wYWN0UXVvdGFMYXlvdXQ6IHRydWUgfSkpO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyIHBhbmVsIGFjdGlvbnMgKHNpZ24taW4sIGV0Yy4pIFx1MjAxNCBvbmx5IHJlbmRlciBpZiB0aGVyZSdzIGF0IGxlYXN0IG9uZSBub24tc2VwYXJhdG9yIGFjdGlvbi5cblx0XHRpZiAocGFydGl0aW9uZWQub3RoZXIuc29tZShhID0+ICEoYSBpbnN0YW5jZW9mIFNlcGFyYXRvcikpKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zU2VjdGlvbiA9IGFwcGVuZChwYW5lbCwgJCgnLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtYWN0aW9ucycpKTtcblx0XHRcdGNvbnN0IGFjdGlvbnNBY3Rpb25CYXIgPSBwYW5lbFN0b3JlLmFkZChuZXcgQWN0aW9uQmFyKGFjdGlvbnNTZWN0aW9uLCB7XG5cdFx0XHRcdG9yaWVudGF0aW9uOiBBY3Rpb25zT3JpZW50YXRpb24uVkVSVElDQUwsXG5cdFx0XHR9KSk7XG5cdFx0XHRwYW5lbFN0b3JlLmFkZChhY3Rpb25zQWN0aW9uQmFyLm9uV2lsbFJ1bigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHRcdFx0dGhpcy5jbGlja1BhbmVsRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0fSkpO1xuXHRcdFx0bGV0IGxhc3RXYXNTZXBhcmF0b3IgPSB0cnVlO1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgcGFydGl0aW9uZWQub3RoZXIpIHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvcikge1xuXHRcdFx0XHRcdGlmICghbGFzdFdhc1NlcGFyYXRvcikge1xuXHRcdFx0XHRcdFx0YWN0aW9uc0FjdGlvbkJhci5wdXNoKGFjdGlvbik7XG5cdFx0XHRcdFx0XHRsYXN0V2FzU2VwYXJhdG9yID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGFzdFdhc1NlcGFyYXRvciA9IGZhbHNlO1xuXHRcdFx0XHRhY3Rpb25zQWN0aW9uQmFyLnB1c2goYWN0aW9uLCB7IGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc2hvdWxkU2hvd0FjY291bnRQYW5lbFN1bW1hcnkodGhpcy5sYXN0U3RhdGUsIHRoaXMuc2hvdWxkU2hvd0NvcGlsb3REYXNoYm9hcmRIb3ZlcigpLCB0aGlzLmlzQWNjb3VudExvYWRpbmcpKSB7XG5cdFx0XHRjb25zdCBjb250ZW50U2VjdGlvbiA9IGFwcGVuZChwYW5lbCwgJCgnLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtY29udGVudCcpKTtcblx0XHRcdGNvbnN0IHN1bW1hcnkgPSBhcHBlbmQoY29udGVudFNlY3Rpb24sICQoJy5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLXN1bW1hcnknKSk7XG5cdFx0XHRzdW1tYXJ5LnRleHRDb250ZW50ID0gdGhpcy5sYXN0U3RhdGUuYXJpYUxhYmVsO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYW5lbDtcblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kQ29waWxvdFVzYWdlKGFjY291bnRTZWN0aW9uOiBIVE1MRWxlbWVudCwgcGFuZWxTdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0Y29uc3QgcXVvdGEgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLnByZW1pdW1DaGF0ID8/IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMuY2hhdDtcblx0XHRjb25zdCB1c2FnZSA9IGFwcGVuZChhY2NvdW50U2VjdGlvbiwgJCgnLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtcHJvdmlkZXItdXNhZ2UnKSk7XG5cdFx0Y29uc3QgcGxhblJvdyA9IGFwcGVuZCh1c2FnZSwgJCgnLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtcHJvdmlkZXItbWV0cmljLXJvdy5wcmltYXJ5JykpO1xuXHRcdGFwcGVuZChwbGFuUm93LCAkKCdzcGFuLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtcHJvdmlkZXItcGxhbicsIHVuZGVmaW5lZCwgdGhpcy5nZXRDb3BpbG90UGxhbkxhYmVsKCkpKTtcblx0XHRpZiAocXVvdGEgJiYgIXF1b3RhLnVubGltaXRlZCkge1xuXHRcdFx0Y29uc3QgdXNlZFBlcmNlbnRhZ2UgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKDEwMCAtIHF1b3RhLnBlcmNlbnRSZW1haW5pbmcpKTtcblx0XHRcdGNvbnN0IHVzYWdlVmFsdWUgPSBhcHBlbmQocGxhblJvdywgJCgnc3Bhbi5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLXByb3ZpZGVyLXVzYWdlLXZhbHVlJywgeyB0YWJJbmRleDogMCB9KSk7XG5cdFx0XHRjb25zdCBwZXJjZW50YWdlTGFiZWwgPSBsb2NhbGl6ZSgnY29waWxvdENyZWRpdHNVc2VkUGVyY2VudGFnZVZhbHVlJywgXCJ7MH0lXCIsIHVzZWRQZXJjZW50YWdlKTtcblx0XHRcdGNvbnN0IHBlcmNlbnRhZ2VBcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY29waWxvdENyZWRpdHNVc2VkUGVyY2VudGFnZScsIFwiezB9JSBjcmVkaXRzIHVzZWRcIiwgdXNlZFBlcmNlbnRhZ2UpO1xuXHRcdFx0dXNhZ2VWYWx1ZS50ZXh0Q29udGVudCA9IHBlcmNlbnRhZ2VMYWJlbDtcblx0XHRcdHVzYWdlVmFsdWUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgcGVyY2VudGFnZUFyaWFMYWJlbCk7XG5cdFx0XHRpZiAocXVvdGEuZW50aXRsZW1lbnQpIHtcblx0XHRcdFx0Y29uc3QgZm9ybWF0dGVyID0gc2FmZUludGwuTnVtYmVyRm9ybWF0KGxhbmd1YWdlLCB7IG1heGltdW1GcmFjdGlvbkRpZ2l0czogMiwgbWluaW11bUZyYWN0aW9uRGlnaXRzOiAwIH0pO1xuXHRcdFx0XHRjb25zdCB1c2VkID0gcXVvdGEuY3JlZGl0c1VzZWQgPz8gKHF1b3RhLnF1b3RhUmVtYWluaW5nICE9PSB1bmRlZmluZWRcblx0XHRcdFx0XHQ/IHF1b3RhLmVudGl0bGVtZW50IC0gcXVvdGEucXVvdGFSZW1haW5pbmdcblx0XHRcdFx0XHQ6IHF1b3RhLmVudGl0bGVtZW50ICogKDEwMCAtIHF1b3RhLnBlcmNlbnRSZW1haW5pbmcpIC8gMTAwKTtcblx0XHRcdFx0Y29uc3QgY3JlZGl0c1ZhbHVlID0gbG9jYWxpemUoJ2NvcGlsb3RDcmVkaXRzVXNlZFJhdGlvVmFsdWUnLCBcInswfSAvIHsxfVwiLCBmb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHVzZWQpLCBmb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHF1b3RhLmVudGl0bGVtZW50KSk7XG5cdFx0XHRcdGNvbnN0IGNyZWRpdHNBcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY29waWxvdENyZWRpdHNVc2VkUmF0aW8nLCBcInswfSAvIHsxfSBjcmVkaXRzIHVzZWRcIiwgZm9ybWF0dGVyLnZhbHVlLmZvcm1hdCh1c2VkKSwgZm9ybWF0dGVyLnZhbHVlLmZvcm1hdChxdW90YS5lbnRpdGxlbWVudCkpO1xuXHRcdFx0XHRjb25zdCBzaG93Q3JlZGl0cyA9ICgpID0+IHtcblx0XHRcdFx0XHR1c2FnZVZhbHVlLnRleHRDb250ZW50ID0gY3JlZGl0c1ZhbHVlO1xuXHRcdFx0XHRcdHVzYWdlVmFsdWUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgY3JlZGl0c0FyaWFMYWJlbCk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IHNob3dQZXJjZW50YWdlID0gKCkgPT4ge1xuXHRcdFx0XHRcdHVzYWdlVmFsdWUudGV4dENvbnRlbnQgPSBwZXJjZW50YWdlTGFiZWw7XG5cdFx0XHRcdFx0dXNhZ2VWYWx1ZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBwZXJjZW50YWdlQXJpYUxhYmVsKTtcblx0XHRcdFx0fTtcblx0XHRcdFx0cGFuZWxTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHVzYWdlVmFsdWUsIEV2ZW50VHlwZS5NT1VTRV9FTlRFUiwgc2hvd0NyZWRpdHMpKTtcblx0XHRcdFx0cGFuZWxTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHVzYWdlVmFsdWUsIEV2ZW50VHlwZS5NT1VTRV9MRUFWRSwgc2hvd1BlcmNlbnRhZ2UpKTtcblx0XHRcdFx0cGFuZWxTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHVzYWdlVmFsdWUsIEV2ZW50VHlwZS5GT0NVUywgc2hvd0NyZWRpdHMpKTtcblx0XHRcdFx0cGFuZWxTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHVzYWdlVmFsdWUsIEV2ZW50VHlwZS5CTFVSLCBzaG93UGVyY2VudGFnZSkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGV0YWlsUm93ID0gYXBwZW5kKHVzYWdlLCAkKCcuc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci1wYW5lbC1wcm92aWRlci1tZXRyaWMtcm93LnNlY29uZGFyeScpKTtcblx0XHRcdGNvbnN0IHJlc2V0TGFiZWwgPSB0aGlzLmdldENvcGlsb3RSZXNldExhYmVsKHF1b3RhLnJlc2V0QXQpO1xuXHRcdFx0aWYgKHJlc2V0TGFiZWwpIHtcblx0XHRcdFx0YXBwZW5kKGRldGFpbFJvdywgJCgnc3Bhbi5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLXByb3ZpZGVyLXJlc2V0JywgdW5kZWZpbmVkLCByZXNldExhYmVsKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkZXRhaWxSb3cuY2xhc3NMaXN0LmFkZCgnd2l0aG91dC1yZXNldCcpO1xuXHRcdFx0fVxuXHRcdFx0YXBwZW5kKGRldGFpbFJvdywgJCgnc3Bhbi5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLXByb3ZpZGVyLXVzYWdlLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY29waWxvdENyZWRpdHNVc2VkTGFiZWwnLCBcIkNyZWRpdHMgdXNlZFwiKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kQ2hhdEdQVFVzYWdlKGFjY291bnRTZWN0aW9uOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjY291bnQgPSB0aGlzLmNvZGV4QWNjb3VudFNlcnZpY2UuYWNjb3VudDtcblx0XHRjb25zdCB1c2FnZSA9IGFwcGVuZChhY2NvdW50U2VjdGlvbiwgJCgnLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtcHJvdmlkZXItdXNhZ2UnKSk7XG5cdFx0Y29uc3QgcGxhblJvdyA9IGFwcGVuZCh1c2FnZSwgJCgnLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtcHJvdmlkZXItbWV0cmljLXJvdy5wcmltYXJ5JykpO1xuXHRcdGFwcGVuZChwbGFuUm93LCAkKCdzcGFuLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtcHJvdmlkZXItcGxhbicsIHVuZGVmaW5lZCwgYWNjb3VudC5wbGFuVHlwZVxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdEdQVFBsYW4nLCBcIkNoYXRHUFQgezB9XCIsIGFjY291bnQucGxhblR5cGUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBhY2NvdW50LnBsYW5UeXBlLnNsaWNlKDEpKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdEdQVFN1YnNjcmlwdGlvbicsIFwiQ2hhdEdQVCBzdWJzY3JpcHRpb25cIikpKTtcblx0XHRpZiAoIWFjY291bnQucmF0ZUxpbWl0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBlcmNlbnRhZ2VGb3JtYXR0ZXIgPSBzYWZlSW50bC5OdW1iZXJGb3JtYXQobGFuZ3VhZ2UsIHsgbWF4aW11bUZyYWN0aW9uRGlnaXRzOiAwIH0pO1xuXHRcdGNvbnN0IHVzZWRQZXJjZW50YWdlID0gcGVyY2VudGFnZUZvcm1hdHRlci52YWx1ZS5mb3JtYXQoYWNjb3VudC5yYXRlTGltaXQudXNlZFBlcmNlbnQpO1xuXHRcdGFwcGVuZChwbGFuUm93LCAkKCdzcGFuLnNlc3Npb25zLWFjY291bnQtdGl0bGViYXItcGFuZWwtcHJvdmlkZXItdXNhZ2UtdmFsdWUnLCB7XG5cdFx0XHQnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCdjaGF0R1BUTGltaXRVc2VkUGVyY2VudGFnZScsIFwiezB9JSB1c2VkXCIsIHVzZWRQZXJjZW50YWdlKSxcblx0XHR9LCBsb2NhbGl6ZSgnY2hhdEdQVExpbWl0VXNlZFBlcmNlbnRhZ2VWYWx1ZScsIFwiezB9JVwiLCB1c2VkUGVyY2VudGFnZSkpKTtcblx0XHRjb25zdCBkZXRhaWxSb3cgPSBhcHBlbmQodXNhZ2UsICQoJy5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLXByb3ZpZGVyLW1ldHJpYy1yb3cuc2Vjb25kYXJ5JykpO1xuXHRcdGlmIChhY2NvdW50LnJhdGVMaW1pdC5yZXNldHNBdCkge1xuXHRcdFx0YXBwZW5kKGRldGFpbFJvdywgJCgnc3Bhbi5zZXNzaW9ucy1hY2NvdW50LXRpdGxlYmFyLXBhbmVsLXByb3ZpZGVyLXJlc2V0JywgdW5kZWZpbmVkLCBsb2NhbGl6ZShcblx0XHRcdFx0J2NoYXRHUFRMaW1pdFJlc2V0Jyxcblx0XHRcdFx0XCJ7MH0gcmVzZXRzIHsxfVwiLFxuXHRcdFx0XHR0aGlzLmdldENoYXRHUFRMaW1pdExhYmVsKGFjY291bnQucmF0ZUxpbWl0LndpbmRvd0R1cmF0aW9uTWlucyksXG5cdFx0XHRcdGZyb21Ob3coYWNjb3VudC5yYXRlTGltaXQucmVzZXRzQXQgKiAxMDAwLCBmYWxzZSwgdHJ1ZSksXG5cdFx0XHQpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRldGFpbFJvdy5jbGFzc0xpc3QuYWRkKCd3aXRob3V0LXJlc2V0Jyk7XG5cdFx0fVxuXHRcdGFwcGVuZChkZXRhaWxSb3csICQoJ3NwYW4uc2Vzc2lvbnMtYWNjb3VudC10aXRsZWJhci1wYW5lbC1wcm92aWRlci11c2FnZS1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXRHUFRMaW1pdFVzZWRMYWJlbCcsIFwiTGltaXQgdXNlZFwiKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb3BpbG90UmVzZXRMYWJlbChyZXNldEF0OiBudW1iZXIgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChyZXNldEF0KSB7XG5cdFx0XHRjb25zdCByZXNldERhdGUgPSBuZXcgRGF0ZShyZXNldEF0ICogMTAwMCk7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NvcGlsb3RDcmVkaXRzUmVzZXRBdCcsIFwiUmVzZXRzIHswfSBhdCB7MX1cIiwgYWNjb3VudERhdGVGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KHJlc2V0RGF0ZSksIGFjY291bnRUaW1lRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChyZXNldERhdGUpKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IHJlc2V0RGF0ZSwgcmVzZXREYXRlSGFzVGltZSB9ID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcztcblx0XHRpZiAoIXJlc2V0RGF0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZGF0ZSA9IG5ldyBEYXRlKHJlc2V0RGF0ZSk7XG5cdFx0cmV0dXJuIHJlc2V0RGF0ZUhhc1RpbWVcblx0XHRcdD8gbG9jYWxpemUoJ2NvcGlsb3RDcmVkaXRzUmVzZXRBdCcsIFwiUmVzZXRzIHswfSBhdCB7MX1cIiwgYWNjb3VudERhdGVGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KGRhdGUpLCBhY2NvdW50VGltZUZvcm1hdHRlci52YWx1ZS5mb3JtYXQoZGF0ZSkpXG5cdFx0XHQ6IGxvY2FsaXplKCdjb3BpbG90Q3JlZGl0c1Jlc2V0JywgXCJSZXNldHMgezB9XCIsIGFjY291bnREYXRlRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChkYXRlKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldENoYXRHUFRMaW1pdExhYmVsKHdpbmRvd0R1cmF0aW9uTWluczogbnVtYmVyIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRpZiAod2luZG93RHVyYXRpb25NaW5zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmIChNYXRoLmFicyh3aW5kb3dEdXJhdGlvbk1pbnMgLSA3ICogMjQgKiA2MCkgPD0gNjApIHtcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0R1BUV2Vla2x5TGltaXRVc2VkJywgXCJXZWVrbHkgbGltaXRcIik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoTWF0aC5hYnMod2luZG93RHVyYXRpb25NaW5zIC0gMjQgKiA2MCkgPD0gNjApIHtcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0R1BURGFpbHlMaW1pdFVzZWQnLCBcIkRhaWx5IGxpbWl0XCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXRHUFRVc2FnZUxpbWl0VXNlZCcsIFwiVXNhZ2UgbGltaXRcIik7XG5cdH1cblxuXHRwcml2YXRlIHBhcnRpdGlvbk1lbnVBY3Rpb25zKHJhd0FjdGlvbnM6IElBY3Rpb25bXSk6IHsgc2lnbkluOiBJQWN0aW9uIHwgdW5kZWZpbmVkOyBzaWduT3V0OiBJQWN0aW9uIHwgdW5kZWZpbmVkOyBwZXJzb25hbGl6ZTogSUFjdGlvbltdOyBvdGhlcjogSUFjdGlvbltdIH0ge1xuXHRcdGxldCBzaWduSW46IElBY3Rpb24gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNpZ25PdXQ6IElBY3Rpb24gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcGVyc29uYWxpemVNYXAgPSBuZXcgTWFwPHN0cmluZywgSUFjdGlvbj4oKTtcblx0XHRjb25zdCBvdGhlcjogSUFjdGlvbltdID0gW107XG5cblx0XHRjb25zdCBwdXNoU2VwYXJhdG9yID0gKCkgPT4ge1xuXHRcdFx0Ly8gQ29sbGFwc2UgcnVucyBhbmQgc2tpcCBsZWFkaW5nIHNlcGFyYXRvcnMgc28gZ3JvdXBzIHdob3NlIG9ubHlcblx0XHRcdC8vIGl0ZW1zIGdldCBmaWx0ZXJlZCAoZS5nLiB1cGRhdGUuKikgZG9uJ3QgbGVhdmUgb3JwaGFucyBiZWhpbmQuXG5cdFx0XHRpZiAob3RoZXIubGVuZ3RoID09PSAwIHx8IG90aGVyW290aGVyLmxlbmd0aCAtIDFdIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdG90aGVyLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgcmF3QWN0aW9ucykge1xuXHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvcikge1xuXHRcdFx0XHRwdXNoU2VwYXJhdG9yKCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gU0lHTl9PVVRfQUNUSU9OX0lEKSB7XG5cdFx0XHRcdHNpZ25PdXQgPSBhY3Rpb247XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gQUdFTlRJQ19TSUdOX0lOX0NPTU1BTkRfSUQpIHtcblx0XHRcdFx0aWYgKCF0aGlzLmlzQWNjb3VudExvYWRpbmcpIHtcblx0XHRcdFx0XHRzaWduSW4gPSBhY3Rpb247XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoUEVSU09OQUxJWkVfQUNUSU9OX0lEUy5pbmNsdWRlcyhhY3Rpb24uaWQpKSB7XG5cdFx0XHRcdHBlcnNvbmFsaXplTWFwLnNldChhY3Rpb24uaWQsIGFjdGlvbik7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFjdGlvbi5pZC5zdGFydHNXaXRoKCd1cGRhdGUuJykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRvdGhlci5wdXNoKGFjdGlvbik7XG5cdFx0fVxuXG5cdFx0Ly8gVHJpbSB0cmFpbGluZyBzZXBhcmF0b3IgbGVmdCBhZnRlciBmaWx0ZXJpbmcuXG5cdFx0aWYgKG90aGVyLmxlbmd0aCA+IDAgJiYgb3RoZXJbb3RoZXIubGVuZ3RoIC0gMV0gaW5zdGFuY2VvZiBTZXBhcmF0b3IpIHtcblx0XHRcdG90aGVyLnBvcCgpO1xuXHRcdH1cblxuXHRcdC8vIFByZXNlcnZlIGNhbm9uaWNhbCBwZXJzb25hbGl6ZSBvcmRlci5cblx0XHRjb25zdCBwZXJzb25hbGl6ZSA9IFBFUlNPTkFMSVpFX0FDVElPTl9JRFNcblx0XHRcdC5tYXAoaWQgPT4gcGVyc29uYWxpemVNYXAuZ2V0KGlkKSlcblx0XHRcdC5maWx0ZXIoKGEpOiBhIGlzIElBY3Rpb24gPT4gISFhKTtcblxuXHRcdHJldHVybiB7IHNpZ25Jbiwgc2lnbk91dCwgcGVyc29uYWxpemUsIG90aGVyIH07XG5cdH1cblxuXHRwcml2YXRlIGdldFBhbmVsSGVhZGVyTGFiZWwoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5hY2NvdW50TmFtZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuYWNjb3VudE5hbWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNBY2NvdW50TG9hZGluZykge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdsb2FkaW5nQWNjb3VudEhlYWRlcicsIFwiTG9hZGluZyBBY2NvdW50Li4uXCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBsb2NhbGl6ZSgnYWNjb3VudE1lbnVIZWFkZXJGYWxsYmFjaycsIFwiQWNjb3VudFwiKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29waWxvdFBsYW5MYWJlbCgpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50KSB7XG5cdFx0XHRjYXNlIENoYXRFbnRpdGxlbWVudC5BdmFpbGFibGU6XG5cdFx0XHRjYXNlIENoYXRFbnRpdGxlbWVudC5GcmVlOlxuXHRcdFx0Y2FzZSBDaGF0RW50aXRsZW1lbnQuRURVOlxuXHRcdFx0Y2FzZSBDaGF0RW50aXRsZW1lbnQuUHJvOlxuXHRcdFx0Y2FzZSBDaGF0RW50aXRsZW1lbnQuUHJvUGx1czpcblx0XHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzOlxuXHRcdFx0Y2FzZSBDaGF0RW50aXRsZW1lbnQuRW50ZXJwcmlzZTpcblx0XHRcdGNhc2UgQ2hhdEVudGl0bGVtZW50Lk1heDpcblx0XHRcdFx0cmV0dXJuIGdldENoYXRQbGFuTmFtZSh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkU2hvd0NvcGlsb3REYXNoYm9hcmRIb3ZlcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuaGlkZGVuICYmICEhdGhpcy5hY2NvdW50TmFtZTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ29waWxvdEhvdmVyQ29udGVudChleHRyYU9wdGlvbnM/OiBQYXJ0aWFsPElDaGF0U3RhdHVzRGFzaGJvYXJkT3B0aW9ucz4pOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5jb3BpbG90RGFzaGJvYXJkU3RvcmUudmFsdWUgPSBzdG9yZTtcblx0XHRjb25zdCBkYXNoYm9hcmRFbGVtZW50ID0gQ2hhdFN0YXR1c0Rhc2hib2FyZC5pbnN0YW50aWF0ZUluQ29udGVudHModGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgc3RvcmUsIHtcblx0XHRcdGRpc2FibGVJbmxpbmVTdWdnZXN0aW9uc1NldHRpbmdzOiB0cnVlLFxuXHRcdFx0ZGlzYWJsZU1vZGVsU2VsZWN0aW9uOiB0cnVlLFxuXHRcdFx0ZGlzYWJsZVByb3ZpZGVyT3B0aW9uczogdHJ1ZSxcblx0XHRcdGRpc2FibGVDb21wbGV0aW9uc1Nub296ZTogdHJ1ZSxcblx0XHRcdGRpc2FibGVRdWlja1NldHRpbmdzQ29sbGFwc2libGU6IHRydWUsXG5cdFx0XHQuLi5leHRyYU9wdGlvbnMsXG5cdFx0fSk7XG5cblx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsKG1haW5XaW5kb3csICgpID0+IHtcblx0XHRcdGlmICghZGFzaGJvYXJkRWxlbWVudC5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSwgMjAwMCkpO1xuXG5cdFx0cmV0dXJuIGRhc2hib2FyZEVsZW1lbnQ7XG5cdH1cbn1cblxuLy8gLS0tIFJlZ2lzdGVyIGN1c3RvbSB2aWV3IGl0ZW0gLS0tIC8vXG5cbi8vIEFjdGlvbnMgcmVnaXN0ZXJlZCBhdCBtb2R1bGUgbGV2ZWwgc28gTWVudXMuVGl0bGVCYXJSaWdodExheW91dCBpcyBub24tZW1wdHkgd2hlbiB0aGVcbi8vIHRvb2xiYXIgaXMgZmlyc3QgY29uc3RydWN0ZWQuIFRoZSBydW4oKSBpcyBhIG5vLW9wIFx1MjAxNCByZW5kZXJpbmcgaXMgaGFuZGxlZCBieSB0aGUgY3VzdG9tXG4vLyB2aWV3IGl0ZW1zIHJlZ2lzdGVyZWQgaW4gQWNjb3VudFdpZGdldENvbnRyaWJ1dGlvbi5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2Vzc2lvbnNUaXRsZUJhckFjY291bnRXaWRnZXRBY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZ2VudHNBY2NvdW50U3RhdHVzVGl0bGVCYXInLCBcIkFnZW50cyBBY2NvdW50IGFuZCBTdGF0dXNcIiksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51cy5UaXRsZUJhclJpZ2h0TGF5b3V0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTAwLFxuXHRcdFx0XHR3aGVuOiBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oKTogdm9pZCB7IH1cbn0pO1xuXG5jbGFzcyBBY2NvdW50V2lkZ2V0Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zZXNzaW9uc1dpZGdldCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51cy5UaXRsZUJhclJpZ2h0TGF5b3V0LCBTZXNzaW9uc1RpdGxlQmFyQWNjb3VudFdpZGdldEFjdGlvbiwgKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRpdGxlQmFyQWNjb3VudFdpZGdldCwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHR9LCB1bmRlZmluZWQpKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWNjb3VudFdpZGdldENvbnRyaWJ1dGlvbi5JRCwgQWNjb3VudFdpZGdldENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcblxuLy8gLS0tIENoYXQgRGFzaGJvYXJkIFNlcnZpY2UgKHJlYWwgaW1wbGVtZW50YXRpb24gZm9yIG1vYmlsZSBhY2NvdW50IHNoZWV0KSAtLS0gLy9cblxuY2xhc3MgQ2hhdERhc2hib2FyZFNlcnZpY2VJbXBsIGltcGxlbWVudHMgSUNoYXREYXNoYm9hcmRTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGNyZWF0ZURhc2hib2FyZEVsZW1lbnQoc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkYXNoYm9hcmRFbGVtZW50ID0gQ2hhdFN0YXR1c0Rhc2hib2FyZC5pbnN0YW50aWF0ZUluQ29udGVudHModGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgc3RvcmUsIHtcblx0XHRcdGRpc2FibGVJbmxpbmVTdWdnZXN0aW9uc1NldHRpbmdzOiB0cnVlLFxuXHRcdFx0ZGlzYWJsZU1vZGVsU2VsZWN0aW9uOiB0cnVlLFxuXHRcdFx0ZGlzYWJsZVByb3ZpZGVyT3B0aW9uczogdHJ1ZSxcblx0XHRcdGRpc2FibGVDb21wbGV0aW9uc1Nub296ZTogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwobWFpbldpbmRvdywgKCkgPT4ge1xuXHRcdFx0aWYgKCFkYXNoYm9hcmRFbGVtZW50LmlzQ29ubmVjdGVkKSB7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9LCAyMDAwKSk7XG5cblx0XHRyZXR1cm4gZGFzaGJvYXJkRWxlbWVudDtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdERhc2hib2FyZFNlcnZpY2UsIENoYXREYXNoYm9hcmRTZXJ2aWNlSW1wbCwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPLGNBQWM7QUFDckIsU0FBUyxZQUFZLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBQzdFLFNBQXNCLG1CQUFtQjtBQUN6QyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsU0FBUyxjQUFjLGlCQUFpQixvQkFBb0I7QUFDckUsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQ25ELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNkJBQStDO0FBQ3hELFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBUyx5QkFBeUIsK0JBQStCO0FBQ2pFLFNBQVMsYUFBYTtBQUN0QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLEdBQUcsdUJBQXVCLFFBQVEsMEJBQTBCLFdBQVcsOEJBQThCO0FBQzlHLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVywwQkFBMEI7QUFDOUMsU0FBUywwQkFBc0Q7QUFDL0QsU0FBUyxRQUFpQixpQkFBaUI7QUFDM0MsU0FBUyxlQUFlO0FBQ3hCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsaUJBQXlDLGlCQUFpQiwrQkFBK0I7QUFDbEcsU0FBUywyQkFBd0Q7QUFDakUsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywyQkFBMkIsNEJBQTRCLHlCQUFnRCwwQkFBMEI7QUFDMUksU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxzQkFBc0IsMEJBQTBCLHlCQUF5QiwrQkFBK0Isc0NBQXNDO0FBQ3ZKLFNB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
