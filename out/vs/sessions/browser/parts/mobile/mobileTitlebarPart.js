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
import "./mobileChatShell.css";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { $, addDisposableListener, append, EventType } from "../../../../base/browser/dom.js";
import { Emitter } from "../../../../base/common/event.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Separator } from "../../../../base/common/actions.js";
import { localize } from "../../../../nls.js";
import { autorun } from "../../../../base/common/observable.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IMenuService } from "../../../../platform/actions/common/actions.js";
import { fillInActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { ACCOUNTS_AVATAR_SETTING, IAuthenticationService } from "../../../../workbench/services/authentication/common/authentication.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { IsNewChatSessionContext } from "../../../common/contextkeys.js";
import { SideBarVisibleContext } from "../../../../workbench/common/contextkeys.js";
import { Menus } from "../../menus.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../workbench/services/chat/common/chatEntitlementService.js";
import { getAccountTitleBarState, getAccountProfileImageUrl, getAccountTitleBarBadgeKey, resolveAccountInfo } from "../../accountTitleBarState.js";
import { IChatDashboardService } from "../../chatDashboardService.js";
import { MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID } from "./contributions/mobileChangesView.js";
let MobileTitlebarPart = class extends Disposable {
  constructor(parent, instantiationService, sessionsService, contextKeyService, defaultAccountService, authenticationService, chatEntitlementService, menuService, chatDashboardService, commandService, configurationService) {
    super();
    this.sessionsService = sessionsService;
    this.contextKeyService = contextKeyService;
    this.defaultAccountService = defaultAccountService;
    this.authenticationService = authenticationService;
    this.chatEntitlementService = chatEntitlementService;
    this.menuService = menuService;
    this.chatDashboardService = chatDashboardService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this._onDidClickHamburger = this._register(new Emitter());
    this.onDidClickHamburger = this._onDidClickHamburger.event;
    this._onDidClickNewSession = this._register(new Emitter());
    this.onDidClickNewSession = this._onDidClickNewSession.event;
    this._onDidClickTitle = this._register(new Emitter());
    this.onDidClickTitle = this._onDidClickTitle.event;
    this.isAccountLoading = true;
    this.accountRequestCounter = 0;
    this.avatarRequestCounter = 0;
    this.isAccountMenuVisible = false;
    this.accountPanelDisposable = this._register(new MutableDisposable());
    this.avatarLoadDisposable = this._register(new MutableDisposable());
    this.copilotDashboardStore = this._register(new MutableDisposable());
    // Changes pill state — kept here so the click handler can read the
    // latest set without re-deriving it on each tap.
    this.latestChanges = [];
    this.element = document.createElement("div");
    this.element.className = "mobile-top-bar";
    this._register(toDisposable(() => this.element.remove()));
    parent.prepend(this.element);
    const hamburger = append(this.element, $("button.mobile-top-bar-button"));
    hamburger.setAttribute("aria-label", localize("mobileTopBar.openSessions", "Open sessions"));
    const hamburgerIcon = append(hamburger, $("span"));
    const closedIconClasses = ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeftOff);
    const openIconClasses = ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeft);
    hamburgerIcon.classList.add(...closedIconClasses);
    this._register(addDisposableListener(hamburger, EventType.CLICK, () => this._onDidClickHamburger.fire()));
    const sidebarVisibleKeySet = /* @__PURE__ */ new Set([SideBarVisibleContext.key]);
    const updateSidebarIcon = () => {
      const isOpen = !!SideBarVisibleContext.getValue(contextKeyService);
      hamburgerIcon.classList.remove(...closedIconClasses, ...openIconClasses);
      hamburgerIcon.classList.add(...isOpen ? openIconClasses : closedIconClasses);
      hamburger.setAttribute("aria-label", isOpen ? localize("mobileTopBar.closeSessions", "Close sessions") : localize("mobileTopBar.openSessions", "Open sessions"));
    };
    updateSidebarIcon();
    const center = append(this.element, $("div.mobile-top-bar-center"));
    this.sessionTitleElement = append(center, $("button.mobile-session-title"));
    this.sessionTitleElement.setAttribute("type", "button");
    this.sessionTitleElement.textContent = localize("mobileTopBar.newSession", "New Session");
    this._register(addDisposableListener(this.sessionTitleElement, EventType.CLICK, () => this._onDidClickTitle.fire()));
    this.actionsContainer = append(center, $("div.mobile-top-bar-actions"));
    const changesPill = append(this.element, $("button.mobile-top-bar-button.mobile-changes-pill", { type: "button" }));
    changesPill.setAttribute("aria-label", localize("mobileTopBar.changes", "View changes"));
    changesPill.style.display = "none";
    const changesIcon = append(changesPill, $("span.mobile-changes-pill-icon"));
    changesIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
    const changesAddedEl = append(changesPill, $("span.mobile-changes-pill-added"));
    const changesRemovedEl = append(changesPill, $("span.mobile-changes-pill-removed"));
    this._register(addDisposableListener(changesPill, EventType.CLICK, () => this.showChangesPicker()));
    const newSessionButton = append(this.element, $("button.mobile-top-bar-button.mobile-new-session-button"));
    newSessionButton.setAttribute("aria-label", localize("mobileTopBar.newSessionAria", "New session"));
    const newSessionIcon = append(newSessionButton, $("span"));
    newSessionIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.plus));
    this._register(addDisposableListener(newSessionButton, EventType.CLICK, () => this._onDidClickNewSession.fire()));
    this.accountButton = append(this.element, $("button.mobile-top-bar-button.mobile-account-indicator"));
    this.accountButton.setAttribute("aria-label", localize("mobileTopBar.account", "Account"));
    this.accountAvatarElement = append(this.accountButton, $("img.mobile-account-avatar", { alt: "", draggable: "false" }));
    this.accountAvatarElement.decoding = "async";
    this.accountAvatarElement.referrerPolicy = "no-referrer";
    this.accountIconElement = append(this.accountButton, $("span"));
    this.accountBadgeElement = append(this.accountButton, $("span.mobile-account-badge"));
    this._register(addDisposableListener(this.accountButton, EventType.CLICK, () => this.showAccountPanel()));
    this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.refreshAccount()));
    this._register(this.authenticationService.onDidChangeSessions(() => this.refreshAccount()));
    this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.renderAccountState()));
    this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.renderAccountState()));
    this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.renderAccountState()));
    this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.renderAccountState()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ACCOUNTS_AVATAR_SETTING)) {
        this.refreshAvatar();
      }
    }));
    this.refreshAccount();
    this._register(autorun((reader) => {
      const session = this.sessionsService.activeSession.read(reader);
      const title = session?.title.read(reader);
      this.sessionTitleElement.textContent = title || localize("mobileTopBar.newSession", "New Session");
    }));
    const isNewChatRef = { value: !!IsNewChatSessionContext.getValue(contextKeyService) };
    const renderChangesPill = () => {
      const changes = this.latestChanges;
      let added = 0;
      let removed = 0;
      for (const c of changes) {
        added += c.insertions;
        removed += c.deletions;
      }
      const hasChanges = changes.length > 0;
      const visible = hasChanges && !isNewChatRef.value;
      changesPill.style.display = visible ? "" : "none";
      if (visible) {
        if (added > 0 || removed > 0) {
          changesAddedEl.textContent = `+${added}`;
          changesRemovedEl.textContent = `-${removed}`;
          changesPill.title = localize("mobileTopBar.changesTooltip", "{0} files changed (+{1} -{2})", changes.length, added, removed);
        } else {
          changesAddedEl.textContent = changes.length === 1 ? localize("mobileTopBar.singleFileChanged", "1 file") : localize("mobileTopBar.filesChangedCount", "{0} files", changes.length);
          changesRemovedEl.textContent = "";
          changesPill.title = changes.length === 1 ? localize("mobileTopBar.singleFileChangedTooltip", "1 file changed") : localize("mobileTopBar.filesChangedTooltip", "{0} files changed", changes.length);
        }
      }
    };
    this._register(autorun((reader) => {
      const session = this.sessionsService.activeSession.read(reader);
      this.latestChanges = session?.changes.read(reader) ?? [];
      renderChangesPill();
    }));
    const toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this.actionsContainer, Menus.MobileTitleBarCenter, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "mobileTitlebar.center",
      toolbarOptions: { primaryGroup: () => true }
    }));
    const newChatKeySet = /* @__PURE__ */ new Set([IsNewChatSessionContext.key]);
    const updateCenterMode = () => {
      const isNewChat = !!IsNewChatSessionContext.getValue(contextKeyService);
      const hasActions = toolbar.getItemsLength() > 0;
      this.element.classList.toggle("show-actions", isNewChat && hasActions);
      newSessionButton.style.display = isNewChat ? "none" : "";
      this.accountButton.style.display = isNewChat ? "" : "none";
      isNewChatRef.value = isNewChat;
      renderChangesPill();
    };
    updateCenterMode();
    this._register(contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(newChatKeySet)) {
        updateCenterMode();
      }
      if (e.affectsSome(sidebarVisibleKeySet)) {
        updateSidebarIcon();
      }
    }));
    this._register(toolbar.onDidChangeMenuItems(() => updateCenterMode()));
  }
  /**
   * Explicitly set the title shown in the center slot. Called only when
   * overriding the live session title (tests, placeholders). The live
   * subscription will overwrite this on the next session change.
   */
  setTitle(title) {
    this.sessionTitleElement.textContent = title;
  }
  // --- Changes Pill --- //
  /**
   * Tap handler for the changes pill. Opens the dedicated mobile
   * Changes overlay (a master list with file icons + add/remove
   * counts) via {@link MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID}. The
   * overlay's own row taps fan out into per-file diff views with
   * prev/next navigation.
   *
   * The list overlay handles its own single-file shortcut, so the
   * caller just dispatches the command unconditionally.
   */
  showChangesPicker() {
    if (!this.latestChanges.length) {
      return;
    }
    this.commandService.executeCommand(MOBILE_OPEN_CHANGES_VIEW_COMMAND_ID);
  }
  // --- Account Indicator --- //
  async refreshAccount() {
    const requestId = ++this.accountRequestCounter;
    this.isAccountLoading = true;
    this.renderAccountState();
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
    this.renderAccountState();
  }
  renderAccountState() {
    const entitlement = this.accountName && this.chatEntitlementService.entitlement === ChatEntitlement.Unknown ? ChatEntitlement.Unresolved : this.chatEntitlementService.entitlement;
    const state = getAccountTitleBarState({
      isAccountLoading: this.isAccountLoading,
      accountName: this.accountName,
      accountProviderLabel: this.accountProviderLabel,
      entitlement,
      sentiment: this.chatEntitlementService.sentiment,
      quotas: this.chatEntitlementService.quotas,
      // The conditional-auth opt-in is desktop-only (the native agent host it
      // lets in does not run on mobile/web).
      allowSignedOutWhenUsable: false
    });
    const hasAvatar = !!this.loadedAvatarUrl && !this.isAccountLoading;
    this.accountAvatarElement.classList.toggle("visible", hasAvatar);
    if (hasAvatar && this.accountAvatarElement.src !== this.loadedAvatarUrl) {
      this.accountAvatarElement.src = this.loadedAvatarUrl;
    } else if (!hasAvatar) {
      this.accountAvatarElement.removeAttribute("src");
    }
    const titleBarIcon = state.dotBadge ? Codicon.account : state.icon;
    this.accountIconElement.className = ThemeIcon.asClassName(titleBarIcon);
    this.accountIconElement.classList.toggle("hidden", hasAvatar);
    const badgeKey = getAccountTitleBarBadgeKey(state);
    if (badgeKey !== this.lastBadgeKey) {
      this.lastBadgeKey = badgeKey;
      this.dismissedBadgeKey = void 0;
    }
    const showBadge = !!badgeKey && badgeKey !== this.dismissedBadgeKey;
    this.accountBadgeElement.style.display = showBadge ? "" : "none";
    this.accountBadgeElement.classList.toggle("dot-badge-warning", showBadge && state.dotBadge === "warning");
    this.accountBadgeElement.classList.toggle("dot-badge-error", showBadge && state.dotBadge === "error");
    this.accountButton.setAttribute("aria-label", state.ariaLabel);
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
      this.renderAccountState();
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
      this.renderAccountState();
      clearHandlers();
    };
    image.onerror = () => {
      if (requestId !== this.avatarRequestCounter) {
        return;
      }
      this.loadedAvatarUrl = void 0;
      this.renderAccountState();
      clearHandlers();
    };
    this.avatarLoadDisposable.value = toDisposable(() => {
      clearHandlers();
      image.src = "";
    });
    image.src = avatarUrl;
  }
  // --- Account Sheet --- //
  showAccountPanel() {
    if (this.isAccountMenuVisible) {
      this.accountPanelDisposable.clear();
      return;
    }
    this.accountPanelDisposable.clear();
    const panelStore = new DisposableStore();
    this.accountPanelDisposable.value = panelStore;
    const badgeKey = getAccountTitleBarBadgeKey(getAccountTitleBarState({
      isAccountLoading: this.isAccountLoading,
      accountName: this.accountName,
      accountProviderLabel: this.accountProviderLabel,
      entitlement: this.chatEntitlementService.entitlement,
      sentiment: this.chatEntitlementService.sentiment,
      quotas: this.chatEntitlementService.quotas,
      allowSignedOutWhenUsable: false
    }));
    if (badgeKey) {
      this.dismissedBadgeKey = badgeKey;
    }
    this.isAccountMenuVisible = true;
    this.renderAccountState();
    panelStore.add({
      dispose: () => {
        this.isAccountMenuVisible = false;
        this.copilotDashboardStore.clear();
        this.renderAccountState();
      }
    });
    const closeSheet = () => this.accountPanelDisposable.clear();
    const workbenchContainer = this.element.parentElement;
    const sheet = append(workbenchContainer, $("div.mobile-account-sheet"));
    panelStore.add(toDisposable(() => sheet.remove()));
    const header = append(sheet, $("div.mobile-account-sheet-header"));
    const headerTitle = append(header, $("h2.mobile-account-sheet-title"));
    headerTitle.textContent = localize("mobileAccount.title", "Account");
    const closeButton = append(header, $("button.mobile-account-sheet-close", { type: "button" }));
    closeButton.setAttribute("aria-label", localize("mobileAccount.close", "Close"));
    append(closeButton, $("span")).classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
    panelStore.add(addDisposableListener(closeButton, EventType.CLICK, closeSheet));
    const content = append(sheet, $("div.mobile-account-sheet-content"));
    const profile = append(content, $("div.mobile-account-sheet-profile"));
    if (this.loadedAvatarUrl) {
      const avatar = append(profile, $("img.mobile-account-sheet-avatar", { alt: "", draggable: "false" }));
      avatar.src = this.loadedAvatarUrl;
      avatar.referrerPolicy = "no-referrer";
      avatar.decoding = "async";
    } else {
      const avatarPlaceholder = append(profile, $("div.mobile-account-sheet-avatar-placeholder"));
      append(avatarPlaceholder, $("span")).classList.add(...ThemeIcon.asClassNameArray(Codicon.account));
    }
    const profileInfo = append(profile, $("div.mobile-account-sheet-profile-info"));
    if (this.isAccountLoading) {
      append(profileInfo, $("div.mobile-account-sheet-name")).textContent = localize("mobileAccount.loading", "Loading...");
    } else if (this.accountName) {
      append(profileInfo, $("div.mobile-account-sheet-name")).textContent = this.accountName;
      if (this.accountProviderLabel) {
        append(profileInfo, $("div.mobile-account-sheet-provider")).textContent = this.accountProviderLabel;
      }
    } else {
      append(profileInfo, $("div.mobile-account-sheet-name")).textContent = localize("mobileAccount.signedOut", "Not signed in");
    }
    const entitlement = this.chatEntitlementService.entitlement;
    const showDashboard = !this.chatEntitlementService.sentiment.hidden && !!this.accountName && entitlement !== ChatEntitlement.Unknown && entitlement !== ChatEntitlement.Available;
    if (showDashboard) {
      const dashboardSection = append(content, $("div.mobile-account-sheet-section"));
      const store = new DisposableStore();
      this.copilotDashboardStore.value = store;
      const dashboardElement = this.chatDashboardService.createDashboardElement(store);
      if (dashboardElement) {
        append(dashboardSection, dashboardElement);
      }
    }
    const actionsSection = append(content, $("div.mobile-account-sheet-actions"));
    const allActions = this.getSheetActions();
    for (const action of allActions) {
      if (action instanceof Separator) {
        append(actionsSection, $("div.mobile-account-sheet-separator"));
        continue;
      }
      const row = append(actionsSection, $("button.mobile-account-sheet-action", { type: "button" }));
      row.disabled = !action.enabled;
      row.setAttribute("aria-label", action.tooltip || action.label);
      const icon = this.getActionIcon(action);
      if (icon) {
        append(row, $("span.mobile-account-sheet-action-icon")).classList.add(...ThemeIcon.asClassNameArray(icon));
      }
      append(row, $("span.mobile-account-sheet-action-label")).textContent = action.label;
      panelStore.add(addDisposableListener(row, EventType.CLICK, async (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeSheet();
        await Promise.resolve(action.run());
      }));
    }
  }
  getSheetActions() {
    const menu = this.menuService.createMenu(Menus.AccountMenu, this.contextKeyService);
    const rawActions = [];
    fillInActionBarActions(menu.getActions(), rawActions);
    menu.dispose();
    return rawActions.filter((action) => {
      if (action instanceof Separator) {
        return true;
      }
      if (this.isAccountLoading && action.id === "workbench.action.agenticSignIn") {
        return false;
      }
      return !action.id.startsWith("update.");
    });
  }
  getActionIcon(action) {
    switch (action.id) {
      case "workbench.action.openSettings":
        return Codicon.settingsGear;
      case "workbench.action.agenticSignOut":
        return Codicon.signOut;
      case "workbench.action.agenticSignIn":
        return Codicon.signIn;
      default:
        return void 0;
    }
  }
};
MobileTitlebarPart = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IDefaultAccountService),
  __decorateParam(5, IAuthenticationService),
  __decorateParam(6, IChatEntitlementService),
  __decorateParam(7, IMenuService),
  __decorateParam(8, IChatDashboardService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, IConfigurationService)
], MobileTitlebarPart);
export {
  MobileTitlebarPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcYnJvd3NlclxccGFydHNcXG1vYmlsZVxcbW9iaWxlVGl0bGViYXJQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21vYmlsZUNoYXRTaGVsbC5jc3MnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBmaWxsSW5BY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgQUNDT1VOVFNfQVZBVEFSX1NFVFRJTkcsIElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkZpbGVDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJc05ld0NoYXRTZXNzaW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBTaWRlQmFyVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vbWVudXMuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50LCBDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldEFjY291bnRUaXRsZUJhclN0YXRlLCBnZXRBY2NvdW50UHJvZmlsZUltYWdlVXJsLCBnZXRBY2NvdW50VGl0bGVCYXJCYWRnZUtleSwgcmVzb2x2ZUFjY291bnRJbmZvIH0gZnJvbSAnLi4vLi4vYWNjb3VudFRpdGxlQmFyU3RhdGUuanMnO1xuaW1wb3J0IHsgSUNoYXREYXNoYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdERhc2hib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTU9CSUxFX09QRU5fQ0hBTkdFU19WSUVXX0NPTU1BTkRfSUQgfSBmcm9tICcuL2NvbnRyaWJ1dGlvbnMvbW9iaWxlQ2hhbmdlc1ZpZXcuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuLyoqXG4gKiBNb2JpbGUgdGl0bGViYXIgXHUyMDE0IHByZXBlbmRlZCBhYm92ZSB0aGUgd29ya2JlbmNoIGdyaWQgb24gcGhvbmUgdmlld3BvcnRzXG4gKiBpbiBwbGFjZSBvZiB0aGUgZGVza3RvcCB0aXRsZWJhci5cbiAqXG4gKiBMYXlvdXQgKGNvbnRleHR1YWwgcmlnaHQgc2xvdCk6XG4gKlxuICogIC0gKipJbiBhIGNoYXQgc2Vzc2lvbioqIFx1MjE5MiBgW3RvZ2dsZSBzaWRlYmFyXSAgW3Nlc3Npb24gdGl0bGVdICBbY2hhbmdlcyBwaWxsXSAgWytdYFxuICogIC0gKipXZWxjb21lIC8gbmV3IHNlc3Npb24qKiBcdTIxOTIgYFt0b2dnbGUgc2lkZWJhcl0gIFtob3N0IHdpZGdldCB8IHRpdGxlXSAgW2FjY291bnRdYFxuICpcbiAqIFRoZSBjZW50ZXIgc2xvdCBzd2l0Y2hlcyBjb250ZW50IGJhc2VkIG9uIHdoZXRoZXIgdGhlIHNlc3Npb25zIHdlbGNvbWVcbiAqIChob21lL2VtcHR5KSBzY3JlZW4gaXMgdmlzaWJsZTpcbiAqXG4gKiAgLSAqKldlbGNvbWUgaGlkZGVuKiogXHUyMTkyIHNob3dzIHRoZSBhY3RpdmUgc2Vzc2lvbiB0aXRsZSAobGl2ZSwgZnJvbVxuICogICAge0BsaW5rIElTZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbn0pLlxuICogIC0gKipXZWxjb21lIHZpc2libGUqKiBcdTIxOTIgc2hvd3Mgd2hhdGV2ZXIgaXMgY29udHJpYnV0ZWQgdG8gdGhlXG4gKiAgICB7QGxpbmsgTWVudXMuTW9iaWxlVGl0bGVCYXJDZW50ZXJ9IG1lbnUuIE9uIHdlYiwgdGhlIGhvc3QgZmlsdGVyXG4gKiAgICBjb250cmlidXRpb24gYXBwZW5kcyBpdHMgaG9zdCBkcm9wZG93biArIGNvbm5lY3Rpb24gYnV0dG9uIHRoZXJlLlxuICpcbiAqIFRoZSBzd2l0Y2ggaXMgZHJpdmVuIGVudGlyZWx5IGJ5IHRoZSBtZW51OiB3aGVuIHRoZSB0b29sYmFyIGhhcyBub1xuICogaXRlbXMgdGhlIHRpdGxlIGlzIHNob3duOyBhcyBzb29uIGFzIGl0IGhhcyBpdGVtcyB0aGUgdGl0bGUgaXMgaGlkZGVuXG4gKiBhbmQgdGhlIHRvb2xiYXIgZmlsbHMgdGhlIHNsb3QuXG4gKlxuICogVGhlIHJpZ2h0IHNsb3Qgc3dhcHMgYmV0d2VlbiB0aGUgbmV3LXNlc3Npb24gKCspIGJ1dHRvbiAoaW4gYSBjaGF0KVxuICogYW5kIHRoZSBhY2NvdW50IGluZGljYXRvciAob24gd2VsY29tZSAvIG5ldyBzZXNzaW9uKS4gVGhlIGFjY291bnRcbiAqIGluZGljYXRvciBzaG93cyB0aGUgdXNlcidzIGF2YXRhciBvciBhIHBlcnNvbiBpY29uIHdpdGggYW4gb3B0aW9uYWxcbiAqIGRvdCBiYWRnZSBmb3IgcXVvdGEvc3RhdHVzIHdhcm5pbmdzLiBUYXBwaW5nIGl0IG9wZW5zIGEgcGFuZWwgd2l0aFxuICogYWNjb3VudCBpbmZvLCBjb3BpbG90IHN0YXR1cyBkYXNoYm9hcmQsIGFuZCBzaWduLWluL3NpZ24tb3V0IGFjdGlvbnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBNb2JpbGVUaXRsZWJhclBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25UaXRsZUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvbnNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2tIYW1idXJnZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbGlja0hhbWJ1cmdlcjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENsaWNrSGFtYnVyZ2VyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2tOZXdTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tOZXdTZXNzaW9uOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2xpY2tOZXdTZXNzaW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2tUaXRsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsaWNrVGl0bGU6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDbGlja1RpdGxlLmV2ZW50O1xuXG5cdC8vIEFjY291bnQgaW5kaWNhdG9yIHN0YXRlXG5cdHByaXZhdGUgcmVhZG9ubHkgYWNjb3VudEJ1dHRvbjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWNjb3VudEF2YXRhckVsZW1lbnQ6IEhUTUxJbWFnZUVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWNjb3VudEljb25FbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBhY2NvdW50QmFkZ2VFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBhY2NvdW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFjY291bnRQcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYWNjb3VudFByb3ZpZGVyTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhY2NvdW50SWNvbjogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGlzQWNjb3VudExvYWRpbmcgPSB0cnVlO1xuXHRwcml2YXRlIGFjY291bnRSZXF1ZXN0Q291bnRlciA9IDA7XG5cdHByaXZhdGUgYXZhdGFyUmVxdWVzdENvdW50ZXIgPSAwO1xuXHRwcml2YXRlIGN1cnJlbnRBdmF0YXJVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsb2FkZWRBdmF0YXJVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBpc0FjY291bnRNZW51VmlzaWJsZSA9IGZhbHNlO1xuXHRwcml2YXRlIGxhc3RCYWRnZUtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGRpc21pc3NlZEJhZGdlS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWNjb3VudFBhbmVsRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGF2YXRhckxvYWREaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvcGlsb3REYXNoYm9hcmRTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXG5cdC8vIENoYW5nZXMgcGlsbCBzdGF0ZSBcdTIwMTQga2VwdCBoZXJlIHNvIHRoZSBjbGljayBoYW5kbGVyIGNhbiByZWFkIHRoZVxuXHQvLyBsYXRlc3Qgc2V0IHdpdGhvdXQgcmUtZGVyaXZpbmcgaXQgb24gZWFjaCB0YXAuXG5cdHByaXZhdGUgbGF0ZXN0Q2hhbmdlczogcmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASURlZmF1bHRBY2NvdW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRBY2NvdW50U2VydmljZTogSURlZmF1bHRBY2NvdW50U2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ2hhdERhc2hib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RGFzaGJvYXJkU2VydmljZTogSUNoYXREYXNoYm9hcmRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTmFtZSA9ICdtb2JpbGUtdG9wLWJhcic7XG5cblx0XHQvLyBSZWdpc3RlciBET00gcmVtb3ZhbCBiZWZvcmUgYXBwZW5kaW5nIHNvIHRoYXQgYW55IGV4Y2VwdGlvblxuXHRcdC8vIGJldHdlZW4gdGhpcyBwb2ludCBhbmQgdGhlIGVuZCBvZiB0aGUgY29uc3RydWN0b3Igc3RpbGwgY2xlYW5zXG5cdFx0Ly8gdXAgdGhlIGVsZW1lbnQgdmlhIGRpc3Bvc2FsLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmVsZW1lbnQucmVtb3ZlKCkpKTtcblx0XHRwYXJlbnQucHJlcGVuZCh0aGlzLmVsZW1lbnQpO1xuXG5cdFx0Ly8gU2lkZWJhciB0b2dnbGUgYnV0dG9uLiBVc2VzIHRoZSBzYW1lIGljb24gYXMgdGhlIGRlc2t0b3Avd2ViXG5cdFx0Ly8gYWdlbnRzLWFwcCBzaWRlYmFyIHRvZ2dsZSBhbmQgcmVmbGVjdHMgb3Blbi9jbG9zZWQgc3RhdGUgdmlhIHRoZVxuXHRcdC8vIFNpZGVCYXJWaXNpYmxlQ29udGV4dCBrZXkuXG5cdFx0Y29uc3QgaGFtYnVyZ2VyID0gYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnYnV0dG9uLm1vYmlsZS10b3AtYmFyLWJ1dHRvbicpKTtcblx0XHRoYW1idXJnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ21vYmlsZVRvcEJhci5vcGVuU2Vzc2lvbnMnLCBcIk9wZW4gc2Vzc2lvbnNcIikpO1xuXHRcdGNvbnN0IGhhbWJ1cmdlckljb24gPSBhcHBlbmQoaGFtYnVyZ2VyLCAkKCdzcGFuJykpO1xuXHRcdGNvbnN0IGNsb3NlZEljb25DbGFzc2VzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5sYXlvdXRTaWRlYmFyTGVmdE9mZik7XG5cdFx0Y29uc3Qgb3Blbkljb25DbGFzc2VzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5sYXlvdXRTaWRlYmFyTGVmdCk7XG5cdFx0aGFtYnVyZ2VySWNvbi5jbGFzc0xpc3QuYWRkKC4uLmNsb3NlZEljb25DbGFzc2VzKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoaGFtYnVyZ2VyLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuX29uRGlkQ2xpY2tIYW1idXJnZXIuZmlyZSgpKSk7XG5cblx0XHRjb25zdCBzaWRlYmFyVmlzaWJsZUtleVNldCA9IG5ldyBTZXQoW1NpZGVCYXJWaXNpYmxlQ29udGV4dC5rZXldKTtcblx0XHRjb25zdCB1cGRhdGVTaWRlYmFySWNvbiA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGlzT3BlbiA9ICEhU2lkZUJhclZpc2libGVDb250ZXh0LmdldFZhbHVlKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGhhbWJ1cmdlckljb24uY2xhc3NMaXN0LnJlbW92ZSguLi5jbG9zZWRJY29uQ2xhc3NlcywgLi4ub3Blbkljb25DbGFzc2VzKTtcblx0XHRcdGhhbWJ1cmdlckljb24uY2xhc3NMaXN0LmFkZCguLi4oaXNPcGVuID8gb3Blbkljb25DbGFzc2VzIDogY2xvc2VkSWNvbkNsYXNzZXMpKTtcblx0XHRcdGhhbWJ1cmdlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBpc09wZW5cblx0XHRcdFx0PyBsb2NhbGl6ZSgnbW9iaWxlVG9wQmFyLmNsb3NlU2Vzc2lvbnMnLCBcIkNsb3NlIHNlc3Npb25zXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ21vYmlsZVRvcEJhci5vcGVuU2Vzc2lvbnMnLCBcIk9wZW4gc2Vzc2lvbnNcIikpO1xuXHRcdH07XG5cdFx0dXBkYXRlU2lkZWJhckljb24oKTtcblxuXHRcdC8vIENlbnRlciBzbG90OiB0aXRsZSBhbmQvb3IgYWN0aW9ucyBjb250YWluZXIgKG11dHVhbGx5IGV4Y2x1c2l2ZSlcblx0XHRjb25zdCBjZW50ZXIgPSBhcHBlbmQodGhpcy5lbGVtZW50LCAkKCdkaXYubW9iaWxlLXRvcC1iYXItY2VudGVyJykpO1xuXG5cdFx0dGhpcy5zZXNzaW9uVGl0bGVFbGVtZW50ID0gYXBwZW5kKGNlbnRlciwgJCgnYnV0dG9uLm1vYmlsZS1zZXNzaW9uLXRpdGxlJykpO1xuXHRcdHRoaXMuc2Vzc2lvblRpdGxlRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAnYnV0dG9uJyk7XG5cdFx0dGhpcy5zZXNzaW9uVGl0bGVFbGVtZW50LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ21vYmlsZVRvcEJhci5uZXdTZXNzaW9uJywgXCJOZXcgU2Vzc2lvblwiKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zZXNzaW9uVGl0bGVFbGVtZW50LCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuX29uRGlkQ2xpY2tUaXRsZS5maXJlKCkpKTtcblxuXHRcdHRoaXMuYWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZChjZW50ZXIsICQoJ2Rpdi5tb2JpbGUtdG9wLWJhci1hY3Rpb25zJykpO1xuXG5cdFx0Ly8gUmlnaHQgc2xvdCBcdTIwMTQgbGFpZCBvdXQgbGVmdC10by1yaWdodCBpbiBET00gb3JkZXIuIFRoZSBuZXctc2Vzc2lvblxuXHRcdC8vICgrKSBidXR0b24gaXMgYXBwZW5kZWQgTEFTVCBzbyBpdCBhbHdheXMgc2l0cyBhdCB0aGUgcmlnaHQgZWRnZSxcblx0XHQvLyBldmVuIHdoZW4gdGhlIGNoYW5nZXMgcGlsbCBpcyB2aXNpYmxlLlxuXG5cdFx0Ly8gQ2hhbmdlcyBwaWxsIFx1MjAxNCBzaG93biB3aGVuIGluIGEgY2hhdCB0aGF0IGhhcyBwcm9kdWNlZCBjaGFuZ2VzLlxuXHRcdC8vIFRhcCBcdTIxOTIgb3BlbnMgYSBmaWxlIHBpY2tlcjsgc2VsZWN0aW5nIGEgZmlsZSBpbnZva2VzIHRoZVxuXHRcdC8vIGBzZXNzaW9ucy5tb2JpbGUub3BlbkRpZmZWaWV3YCBjb21tYW5kIGZvciB0aGF0IGZpbGUncyBkaWZmLlxuXHRcdGNvbnN0IGNoYW5nZXNQaWxsID0gYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnYnV0dG9uLm1vYmlsZS10b3AtYmFyLWJ1dHRvbi5tb2JpbGUtY2hhbmdlcy1waWxsJywgeyB0eXBlOiAnYnV0dG9uJyB9KSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0Y2hhbmdlc1BpbGwuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ21vYmlsZVRvcEJhci5jaGFuZ2VzJywgXCJWaWV3IGNoYW5nZXNcIikpO1xuXHRcdGNoYW5nZXNQaWxsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0Y29uc3QgY2hhbmdlc0ljb24gPSBhcHBlbmQoY2hhbmdlc1BpbGwsICQoJ3NwYW4ubW9iaWxlLWNoYW5nZXMtcGlsbC1pY29uJykpO1xuXHRcdGNoYW5nZXNJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5kaWZmTXVsdGlwbGUpKTtcblx0XHRjb25zdCBjaGFuZ2VzQWRkZWRFbCA9IGFwcGVuZChjaGFuZ2VzUGlsbCwgJCgnc3Bhbi5tb2JpbGUtY2hhbmdlcy1waWxsLWFkZGVkJykpO1xuXHRcdGNvbnN0IGNoYW5nZXNSZW1vdmVkRWwgPSBhcHBlbmQoY2hhbmdlc1BpbGwsICQoJ3NwYW4ubW9iaWxlLWNoYW5nZXMtcGlsbC1yZW1vdmVkJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjaGFuZ2VzUGlsbCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLnNob3dDaGFuZ2VzUGlja2VyKCkpKTtcblxuXHRcdC8vIE5ldyBzZXNzaW9uIGJ1dHRvbiAoKykgXHUyMDE0IHNob3duIHdoZW4gaW4gYSBjaGF0LCBoaWRkZW4gb24gd2VsY29tZS5cblx0XHQvLyBBbHdheXMgcmlnaHRtb3N0IHdoZW4gaW4gYSBjaGF0LlxuXHRcdGNvbnN0IG5ld1Nlc3Npb25CdXR0b24gPSBhcHBlbmQodGhpcy5lbGVtZW50LCAkKCdidXR0b24ubW9iaWxlLXRvcC1iYXItYnV0dG9uLm1vYmlsZS1uZXctc2Vzc2lvbi1idXR0b24nKSk7XG5cdFx0bmV3U2Vzc2lvbkJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnbW9iaWxlVG9wQmFyLm5ld1Nlc3Npb25BcmlhJywgXCJOZXcgc2Vzc2lvblwiKSk7XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbkljb24gPSBhcHBlbmQobmV3U2Vzc2lvbkJ1dHRvbiwgJCgnc3BhbicpKTtcblx0XHRuZXdTZXNzaW9uSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ucGx1cykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihuZXdTZXNzaW9uQnV0dG9uLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuX29uRGlkQ2xpY2tOZXdTZXNzaW9uLmZpcmUoKSkpO1xuXG5cdFx0Ly8gQWNjb3VudCBpbmRpY2F0b3IgXHUyMDE0IHNob3duIG9uIHdlbGNvbWUvbmV3IHNlc3Npb24sIGhpZGRlbiBpbiBhIGNoYXRcblx0XHR0aGlzLmFjY291bnRCdXR0b24gPSBhcHBlbmQodGhpcy5lbGVtZW50LCAkKCdidXR0b24ubW9iaWxlLXRvcC1iYXItYnV0dG9uLm1vYmlsZS1hY2NvdW50LWluZGljYXRvcicpKTtcblx0XHR0aGlzLmFjY291bnRCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ21vYmlsZVRvcEJhci5hY2NvdW50JywgXCJBY2NvdW50XCIpKTtcblx0XHR0aGlzLmFjY291bnRBdmF0YXJFbGVtZW50ID0gYXBwZW5kKHRoaXMuYWNjb3VudEJ1dHRvbiwgJCgnaW1nLm1vYmlsZS1hY2NvdW50LWF2YXRhcicsIHsgYWx0OiAnJywgZHJhZ2dhYmxlOiAnZmFsc2UnIH0pKSBhcyBIVE1MSW1hZ2VFbGVtZW50O1xuXHRcdHRoaXMuYWNjb3VudEF2YXRhckVsZW1lbnQuZGVjb2RpbmcgPSAnYXN5bmMnO1xuXHRcdHRoaXMuYWNjb3VudEF2YXRhckVsZW1lbnQucmVmZXJyZXJQb2xpY3kgPSAnbm8tcmVmZXJyZXInO1xuXHRcdHRoaXMuYWNjb3VudEljb25FbGVtZW50ID0gYXBwZW5kKHRoaXMuYWNjb3VudEJ1dHRvbiwgJCgnc3BhbicpKTtcblx0XHR0aGlzLmFjY291bnRCYWRnZUVsZW1lbnQgPSBhcHBlbmQodGhpcy5hY2NvdW50QnV0dG9uLCAkKCdzcGFuLm1vYmlsZS1hY2NvdW50LWJhZGdlJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmFjY291bnRCdXR0b24sIEV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5zaG93QWNjb3VudFBhbmVsKCkpKTtcblxuXHRcdC8vIFRyYWNrIGFjY291bnQgc3RhdGUgXHUyMDE0IGxpc3RlbiB0byBtdWx0aXBsZSBzb3VyY2VzIHRvIGNhdGNoXG5cdFx0Ly8gdXBkYXRlcyByZWdhcmRsZXNzIG9mIHNlcnZpY2UgaW5pdGlhbGl6YXRpb24gb3JkZXJpbmcuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2Uub25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudCgoKSA9PiB0aGlzLnJlZnJlc2hBY2NvdW50KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHRoaXMucmVmcmVzaEFjY291bnQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVudGl0bGVtZW50KCgpID0+IHRoaXMucmVuZGVyQWNjb3VudFN0YXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZW50aW1lbnQoKCkgPT4gdGhpcy5yZW5kZXJBY2NvdW50U3RhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVF1b3RhRXhjZWVkZWQoKCkgPT4gdGhpcy5yZW5kZXJBY2NvdW50U3RhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVF1b3RhUmVtYWluaW5nKCgpID0+IHRoaXMucmVuZGVyQWNjb3VudFN0YXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEFDQ09VTlRTX0FWQVRBUl9TRVRUSU5HKSkge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hBdmF0YXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5yZWZyZXNoQWNjb3VudCgpO1xuXG5cdFx0Ly8gS2VlcCB0aGUgdGl0bGUgaW4gc3luYyB3aXRoIHRoZSBhY3RpdmUgc2Vzc2lvblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHRpdGxlID0gc2Vzc2lvbj8udGl0bGUucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5zZXNzaW9uVGl0bGVFbGVtZW50LnRleHRDb250ZW50ID0gdGl0bGUgfHwgbG9jYWxpemUoJ21vYmlsZVRvcEJhci5uZXdTZXNzaW9uJywgXCJOZXcgU2Vzc2lvblwiKTtcblx0XHR9KSk7XG5cblx0XHQvLyBLZWVwIHRoZSBjaGFuZ2VzIHBpbGwgaW4gc3luYyB3aXRoIHRoZSBhY3RpdmUgc2Vzc2lvbidzIGNoYW5nZXMuXG5cdFx0Ly8gSGlkZGVuIHdoZW4gdGhlcmUgYXJlIG5vIGNoYW5nZXMgKGNvdW50cyBhcmUgemVybyBhbmQgbGlzdCBpcyBlbXB0eSkuXG5cdFx0Y29uc3QgaXNOZXdDaGF0UmVmID0geyB2YWx1ZTogISFJc05ld0NoYXRTZXNzaW9uQ29udGV4dC5nZXRWYWx1ZShjb250ZXh0S2V5U2VydmljZSkgfTtcblx0XHRjb25zdCByZW5kZXJDaGFuZ2VzUGlsbCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSB0aGlzLmxhdGVzdENoYW5nZXM7XG5cdFx0XHRsZXQgYWRkZWQgPSAwO1xuXHRcdFx0bGV0IHJlbW92ZWQgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBjIG9mIGNoYW5nZXMpIHtcblx0XHRcdFx0YWRkZWQgKz0gYy5pbnNlcnRpb25zO1xuXHRcdFx0XHRyZW1vdmVkICs9IGMuZGVsZXRpb25zO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaGFzQ2hhbmdlcyA9IGNoYW5nZXMubGVuZ3RoID4gMDtcblx0XHRcdC8vIEhpZGUgb24gd2VsY29tZSAvIG5ldy1jaGF0IFx1MjAxNCBubyBzZXNzaW9uIGNoYW5nZXMgdG8gdmlldyB0aGVyZS5cblx0XHRcdGNvbnN0IHZpc2libGUgPSBoYXNDaGFuZ2VzICYmICFpc05ld0NoYXRSZWYudmFsdWU7XG5cdFx0XHRjaGFuZ2VzUGlsbC5zdHlsZS5kaXNwbGF5ID0gdmlzaWJsZSA/ICcnIDogJ25vbmUnO1xuXHRcdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdFx0aWYgKGFkZGVkID4gMCB8fCByZW1vdmVkID4gMCkge1xuXHRcdFx0XHRcdGNoYW5nZXNBZGRlZEVsLnRleHRDb250ZW50ID0gYCske2FkZGVkfWA7XG5cdFx0XHRcdFx0Y2hhbmdlc1JlbW92ZWRFbC50ZXh0Q29udGVudCA9IGAtJHtyZW1vdmVkfWA7XG5cdFx0XHRcdFx0Y2hhbmdlc1BpbGwudGl0bGUgPSBsb2NhbGl6ZSgnbW9iaWxlVG9wQmFyLmNoYW5nZXNUb29sdGlwJywgXCJ7MH0gZmlsZXMgY2hhbmdlZCAoK3sxfSAtezJ9KVwiLCBjaGFuZ2VzLmxlbmd0aCwgYWRkZWQsIHJlbW92ZWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNoYW5nZXNBZGRlZEVsLnRleHRDb250ZW50ID0gY2hhbmdlcy5sZW5ndGggPT09IDFcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21vYmlsZVRvcEJhci5zaW5nbGVGaWxlQ2hhbmdlZCcsIFwiMSBmaWxlXCIpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb2JpbGVUb3BCYXIuZmlsZXNDaGFuZ2VkQ291bnQnLCBcInswfSBmaWxlc1wiLCBjaGFuZ2VzLmxlbmd0aCk7XG5cdFx0XHRcdFx0Y2hhbmdlc1JlbW92ZWRFbC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHRcdGNoYW5nZXNQaWxsLnRpdGxlID0gY2hhbmdlcy5sZW5ndGggPT09IDFcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21vYmlsZVRvcEJhci5zaW5nbGVGaWxlQ2hhbmdlZFRvb2x0aXAnLCBcIjEgZmlsZSBjaGFuZ2VkXCIpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb2JpbGVUb3BCYXIuZmlsZXNDaGFuZ2VkVG9vbHRpcCcsIFwiezB9IGZpbGVzIGNoYW5nZWRcIiwgY2hhbmdlcy5sZW5ndGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLmxhdGVzdENoYW5nZXMgPSBzZXNzaW9uPy5jaGFuZ2VzLnJlYWQocmVhZGVyKSA/PyBbXTtcblx0XHRcdHJlbmRlckNoYW5nZXNQaWxsKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTW91bnQgdGhlIGNlbnRlciB0b29sYmFyIChob3N0IGZpbHRlciB3aWRnZXQgb24gd2ViIHdlbGNvbWUsIGV0Yy4pXG5cdFx0Y29uc3QgdG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0aGlzLmFjdGlvbnNDb250YWluZXIsIE1lbnVzLk1vYmlsZVRpdGxlQmFyQ2VudGVyLCB7XG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHR0ZWxlbWV0cnlTb3VyY2U6ICdtb2JpbGVUaXRsZWJhci5jZW50ZXInLFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHsgcHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSkpO1xuXG5cdFx0Ly8gU3dpdGNoIGJldHdlZW4gdGl0bGUgYW5kIHRvb2xiYXIgYmFzZWQgb24gd2hldGhlciBhIG5ldyAoZW1wdHkpXG5cdFx0Ly8gY2hhdCBzZXNzaW9uIGlzIGFjdGl2ZSBBTkQgd2hldGhlciB0aGUgdG9vbGJhciBoYXMgYW55dGhpbmcgdG9cblx0XHQvLyBzaG93LiBUaGUgbGF0dGVyIGlzIGltcG9ydGFudCBiZWNhdXNlIG9uIGRlc2t0b3AvZWxlY3Ryb24gb3Jcblx0XHQvLyB3aGVuIG5vIGFnZW50IGhvc3RzIGFyZSBjb25maWd1cmVkIHRoZSB0b29sYmFyIGNhbiBiZSBlbXB0eSBcdTIwMTRcblx0XHQvLyBpbiB0aGF0IGNhc2Ugd2Uga2VlcCB0aGUgdGl0bGUgdmlzaWJsZS5cblx0XHRjb25zdCBuZXdDaGF0S2V5U2V0ID0gbmV3IFNldChbSXNOZXdDaGF0U2Vzc2lvbkNvbnRleHQua2V5XSk7XG5cdFx0Y29uc3QgdXBkYXRlQ2VudGVyTW9kZSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGlzTmV3Q2hhdCA9ICEhSXNOZXdDaGF0U2Vzc2lvbkNvbnRleHQuZ2V0VmFsdWUoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgaGFzQWN0aW9ucyA9IHRvb2xiYXIuZ2V0SXRlbXNMZW5ndGgoKSA+IDA7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnc2hvdy1hY3Rpb25zJywgaXNOZXdDaGF0ICYmIGhhc0FjdGlvbnMpO1xuXG5cdFx0XHQvLyBSaWdodCBzbG90OiBzd2FwIGJldHdlZW4gWytdIChpbi1jaGF0KSBhbmQgW2FjY291bnRdICh3ZWxjb21lKVxuXHRcdFx0bmV3U2Vzc2lvbkJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gaXNOZXdDaGF0ID8gJ25vbmUnIDogJyc7XG5cdFx0XHR0aGlzLmFjY291bnRCdXR0b24uc3R5bGUuZGlzcGxheSA9IGlzTmV3Q2hhdCA/ICcnIDogJ25vbmUnO1xuXG5cdFx0XHQvLyBDaGFuZ2VzIHBpbGwgZm9sbG93cyB0aGUgaW4tY2hhdCBzdGF0ZSBcdTIwMTQgaGlkZGVuIG9uIHdlbGNvbWUuXG5cdFx0XHRpc05ld0NoYXRSZWYudmFsdWUgPSBpc05ld0NoYXQ7XG5cdFx0XHRyZW5kZXJDaGFuZ2VzUGlsbCgpO1xuXHRcdH07XG5cdFx0dXBkYXRlQ2VudGVyTW9kZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKG5ld0NoYXRLZXlTZXQpKSB7XG5cdFx0XHRcdHVwZGF0ZUNlbnRlck1vZGUoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKHNpZGViYXJWaXNpYmxlS2V5U2V0KSkge1xuXHRcdFx0XHR1cGRhdGVTaWRlYmFySWNvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b29sYmFyLm9uRGlkQ2hhbmdlTWVudUl0ZW1zKCgpID0+IHVwZGF0ZUNlbnRlck1vZGUoKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4cGxpY2l0bHkgc2V0IHRoZSB0aXRsZSBzaG93biBpbiB0aGUgY2VudGVyIHNsb3QuIENhbGxlZCBvbmx5IHdoZW5cblx0ICogb3ZlcnJpZGluZyB0aGUgbGl2ZSBzZXNzaW9uIHRpdGxlICh0ZXN0cywgcGxhY2Vob2xkZXJzKS4gVGhlIGxpdmVcblx0ICogc3Vic2NyaXB0aW9uIHdpbGwgb3ZlcndyaXRlIHRoaXMgb24gdGhlIG5leHQgc2Vzc2lvbiBjaGFuZ2UuXG5cdCAqL1xuXHRzZXRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zZXNzaW9uVGl0bGVFbGVtZW50LnRleHRDb250ZW50ID0gdGl0bGU7XG5cdH1cblxuXHQvLyAtLS0gQ2hhbmdlcyBQaWxsIC0tLSAvL1xuXG5cdC8qKlxuXHQgKiBUYXAgaGFuZGxlciBmb3IgdGhlIGNoYW5nZXMgcGlsbC4gT3BlbnMgdGhlIGRlZGljYXRlZCBtb2JpbGVcblx0ICogQ2hhbmdlcyBvdmVybGF5IChhIG1hc3RlciBsaXN0IHdpdGggZmlsZSBpY29ucyArIGFkZC9yZW1vdmVcblx0ICogY291bnRzKSB2aWEge0BsaW5rIE1PQklMRV9PUEVOX0NIQU5HRVNfVklFV19DT01NQU5EX0lEfS4gVGhlXG5cdCAqIG92ZXJsYXkncyBvd24gcm93IHRhcHMgZmFuIG91dCBpbnRvIHBlci1maWxlIGRpZmYgdmlld3Mgd2l0aFxuXHQgKiBwcmV2L25leHQgbmF2aWdhdGlvbi5cblx0ICpcblx0ICogVGhlIGxpc3Qgb3ZlcmxheSBoYW5kbGVzIGl0cyBvd24gc2luZ2xlLWZpbGUgc2hvcnRjdXQsIHNvIHRoZVxuXHQgKiBjYWxsZXIganVzdCBkaXNwYXRjaGVzIHRoZSBjb21tYW5kIHVuY29uZGl0aW9uYWxseS5cblx0ICovXG5cdHByaXZhdGUgc2hvd0NoYW5nZXNQaWNrZXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmxhdGVzdENoYW5nZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTU9CSUxFX09QRU5fQ0hBTkdFU19WSUVXX0NPTU1BTkRfSUQpO1xuXHR9XG5cblx0Ly8gLS0tIEFjY291bnQgSW5kaWNhdG9yIC0tLSAvL1xuXG5cdHByaXZhdGUgYXN5bmMgcmVmcmVzaEFjY291bnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gKyt0aGlzLmFjY291bnRSZXF1ZXN0Q291bnRlcjtcblx0XHR0aGlzLmlzQWNjb3VudExvYWRpbmcgPSB0cnVlO1xuXHRcdHRoaXMucmVuZGVyQWNjb3VudFN0YXRlKCk7XG5cblx0XHRjb25zdCBpbmZvID0gYXdhaXQgcmVzb2x2ZUFjY291bnRJbmZvKHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdFx0aWYgKHJlcXVlc3RJZCAhPT0gdGhpcy5hY2NvdW50UmVxdWVzdENvdW50ZXIgfHwgdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuYWNjb3VudE5hbWUgPSBpbmZvPy5hY2NvdW50TmFtZTtcblx0XHR0aGlzLmFjY291bnRQcm92aWRlcklkID0gaW5mbz8uYWNjb3VudFByb3ZpZGVySWQ7XG5cdFx0dGhpcy5hY2NvdW50UHJvdmlkZXJMYWJlbCA9IGluZm8/LmFjY291bnRQcm92aWRlckxhYmVsO1xuXHRcdHRoaXMuYWNjb3VudEljb24gPSBpbmZvPy5hY2NvdW50SWNvbjtcblx0XHR0aGlzLmlzQWNjb3VudExvYWRpbmcgPSBmYWxzZTtcblx0XHR0aGlzLnJlZnJlc2hBdmF0YXIoKTtcblx0XHR0aGlzLnJlbmRlckFjY291bnRTdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJBY2NvdW50U3RhdGUoKTogdm9pZCB7XG5cdFx0Ly8gV2hlbiB3ZSBoYXZlIGEgc2Vzc2lvbiBmcm9tIHRoZSBhdXRoIHNlcnZpY2UgYnV0IHRoZSBlbnRpdGxlbWVudFxuXHRcdC8vIHNlcnZpY2UgaGFzbid0IHJlc29sdmVkIHlldCAoc3RpbGwgVW5rbm93biksIHRyZWF0IGl0IGFzIHRoZVxuXHRcdC8vIGFjY291bnQgYmVpbmcgYXZhaWxhYmxlIHJhdGhlciB0aGFuIHNpZ25lZCBvdXQuIFRoaXMgYXZvaWRzXG5cdFx0Ly8gc2hvd2luZyBcIlNpZ24gSW5cIiByaWdodCBhZnRlciB0aGUgd2Fsa3Rocm91Z2ggY29tcGxldGVzLlxuXHRcdGNvbnN0IGVudGl0bGVtZW50ID0gdGhpcy5hY2NvdW50TmFtZSAmJiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duXG5cdFx0XHQ/IENoYXRFbnRpdGxlbWVudC5VbnJlc29sdmVkXG5cdFx0XHQ6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudDtcblxuXHRcdGNvbnN0IHN0YXRlID0gZ2V0QWNjb3VudFRpdGxlQmFyU3RhdGUoe1xuXHRcdFx0aXNBY2NvdW50TG9hZGluZzogdGhpcy5pc0FjY291bnRMb2FkaW5nLFxuXHRcdFx0YWNjb3VudE5hbWU6IHRoaXMuYWNjb3VudE5hbWUsXG5cdFx0XHRhY2NvdW50UHJvdmlkZXJMYWJlbDogdGhpcy5hY2NvdW50UHJvdmlkZXJMYWJlbCxcblx0XHRcdGVudGl0bGVtZW50LFxuXHRcdFx0c2VudGltZW50OiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LFxuXHRcdFx0cXVvdGFzOiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLFxuXHRcdFx0Ly8gVGhlIGNvbmRpdGlvbmFsLWF1dGggb3B0LWluIGlzIGRlc2t0b3Atb25seSAodGhlIG5hdGl2ZSBhZ2VudCBob3N0IGl0XG5cdFx0XHQvLyBsZXRzIGluIGRvZXMgbm90IHJ1biBvbiBtb2JpbGUvd2ViKS5cblx0XHRcdGFsbG93U2lnbmVkT3V0V2hlblVzYWJsZTogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHQvLyBBdmF0YXJcblx0XHRjb25zdCBoYXNBdmF0YXIgPSAhIXRoaXMubG9hZGVkQXZhdGFyVXJsICYmICF0aGlzLmlzQWNjb3VudExvYWRpbmc7XG5cdFx0dGhpcy5hY2NvdW50QXZhdGFyRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCd2aXNpYmxlJywgaGFzQXZhdGFyKTtcblx0XHRpZiAoaGFzQXZhdGFyICYmIHRoaXMuYWNjb3VudEF2YXRhckVsZW1lbnQuc3JjICE9PSB0aGlzLmxvYWRlZEF2YXRhclVybCkge1xuXHRcdFx0dGhpcy5hY2NvdW50QXZhdGFyRWxlbWVudC5zcmMgPSB0aGlzLmxvYWRlZEF2YXRhclVybCE7XG5cdFx0fSBlbHNlIGlmICghaGFzQXZhdGFyKSB7XG5cdFx0XHR0aGlzLmFjY291bnRBdmF0YXJFbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnc3JjJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29kaWNvbiBmYWxsYmFja1xuXHRcdGNvbnN0IHRpdGxlQmFySWNvbiA9IHN0YXRlLmRvdEJhZGdlID8gQ29kaWNvbi5hY2NvdW50IDogc3RhdGUuaWNvbjtcblx0XHR0aGlzLmFjY291bnRJY29uRWxlbWVudC5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUodGl0bGVCYXJJY29uKTtcblx0XHR0aGlzLmFjY291bnRJY29uRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBoYXNBdmF0YXIpO1xuXG5cdFx0Ly8gRG90IGJhZGdlXG5cdFx0Y29uc3QgYmFkZ2VLZXkgPSBnZXRBY2NvdW50VGl0bGVCYXJCYWRnZUtleShzdGF0ZSk7XG5cdFx0aWYgKGJhZGdlS2V5ICE9PSB0aGlzLmxhc3RCYWRnZUtleSkge1xuXHRcdFx0dGhpcy5sYXN0QmFkZ2VLZXkgPSBiYWRnZUtleTtcblx0XHRcdHRoaXMuZGlzbWlzc2VkQmFkZ2VLZXkgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNob3dCYWRnZSA9ICEhYmFkZ2VLZXkgJiYgYmFkZ2VLZXkgIT09IHRoaXMuZGlzbWlzc2VkQmFkZ2VLZXk7XG5cdFx0dGhpcy5hY2NvdW50QmFkZ2VFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBzaG93QmFkZ2UgPyAnJyA6ICdub25lJztcblx0XHR0aGlzLmFjY291bnRCYWRnZUVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZG90LWJhZGdlLXdhcm5pbmcnLCBzaG93QmFkZ2UgJiYgc3RhdGUuZG90QmFkZ2UgPT09ICd3YXJuaW5nJyk7XG5cdFx0dGhpcy5hY2NvdW50QmFkZ2VFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2RvdC1iYWRnZS1lcnJvcicsIHNob3dCYWRnZSAmJiBzdGF0ZS5kb3RCYWRnZSA9PT0gJ2Vycm9yJyk7XG5cblx0XHQvLyBBUklBXG5cdFx0dGhpcy5hY2NvdW50QnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHN0YXRlLmFyaWFMYWJlbCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hBdmF0YXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgYXZhdGFyVXJsID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBQ0NPVU5UU19BVkFUQVJfU0VUVElORylcblx0XHRcdD8gZ2V0QWNjb3VudFByb2ZpbGVJbWFnZVVybCh0aGlzLmFjY291bnRQcm92aWRlcklkLCB0aGlzLmFjY291bnROYW1lLCB0aGlzLmFjY291bnRJY29uKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKGF2YXRhclVybCA9PT0gdGhpcy5jdXJyZW50QXZhdGFyVXJsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jdXJyZW50QXZhdGFyVXJsID0gYXZhdGFyVXJsO1xuXHRcdHRoaXMubG9hZGVkQXZhdGFyVXJsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuYXZhdGFyTG9hZERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRjb25zdCByZXF1ZXN0SWQgPSArK3RoaXMuYXZhdGFyUmVxdWVzdENvdW50ZXI7XG5cblx0XHRpZiAoIWF2YXRhclVybCkge1xuXHRcdFx0dGhpcy5yZW5kZXJBY2NvdW50U3RhdGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xuXHRcdGltYWdlLnJlZmVycmVyUG9saWN5ID0gJ25vLXJlZmVycmVyJztcblx0XHRjb25zdCBjbGVhckhhbmRsZXJzID0gKCkgPT4geyBpbWFnZS5vbmxvYWQgPSBudWxsOyBpbWFnZS5vbmVycm9yID0gbnVsbDsgfTtcblx0XHRpbWFnZS5vbmxvYWQgPSAoKSA9PiB7XG5cdFx0XHRpZiAocmVxdWVzdElkICE9PSB0aGlzLmF2YXRhclJlcXVlc3RDb3VudGVyKSB7IHJldHVybjsgfVxuXHRcdFx0dGhpcy5sb2FkZWRBdmF0YXJVcmwgPSBhdmF0YXJVcmw7XG5cdFx0XHR0aGlzLnJlbmRlckFjY291bnRTdGF0ZSgpO1xuXHRcdFx0Y2xlYXJIYW5kbGVycygpO1xuXHRcdH07XG5cdFx0aW1hZ2Uub25lcnJvciA9ICgpID0+IHtcblx0XHRcdGlmIChyZXF1ZXN0SWQgIT09IHRoaXMuYXZhdGFyUmVxdWVzdENvdW50ZXIpIHsgcmV0dXJuOyB9XG5cdFx0XHR0aGlzLmxvYWRlZEF2YXRhclVybCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMucmVuZGVyQWNjb3VudFN0YXRlKCk7XG5cdFx0XHRjbGVhckhhbmRsZXJzKCk7XG5cdFx0fTtcblx0XHR0aGlzLmF2YXRhckxvYWREaXNwb3NhYmxlLnZhbHVlID0gdG9EaXNwb3NhYmxlKCgpID0+IHsgY2xlYXJIYW5kbGVycygpOyBpbWFnZS5zcmMgPSAnJzsgfSk7XG5cdFx0aW1hZ2Uuc3JjID0gYXZhdGFyVXJsO1xuXHR9XG5cblx0Ly8gLS0tIEFjY291bnQgU2hlZXQgLS0tIC8vXG5cblx0cHJpdmF0ZSBzaG93QWNjb3VudFBhbmVsKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzQWNjb3VudE1lbnVWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLmFjY291bnRQYW5lbERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmFjY291bnRQYW5lbERpc3Bvc2FibGUuY2xlYXIoKTtcblxuXHRcdGNvbnN0IHBhbmVsU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5hY2NvdW50UGFuZWxEaXNwb3NhYmxlLnZhbHVlID0gcGFuZWxTdG9yZTtcblxuXHRcdGNvbnN0IGJhZGdlS2V5ID0gZ2V0QWNjb3VudFRpdGxlQmFyQmFkZ2VLZXkoZ2V0QWNjb3VudFRpdGxlQmFyU3RhdGUoe1xuXHRcdFx0aXNBY2NvdW50TG9hZGluZzogdGhpcy5pc0FjY291bnRMb2FkaW5nLFxuXHRcdFx0YWNjb3VudE5hbWU6IHRoaXMuYWNjb3VudE5hbWUsXG5cdFx0XHRhY2NvdW50UHJvdmlkZXJMYWJlbDogdGhpcy5hY2NvdW50UHJvdmlkZXJMYWJlbCxcblx0XHRcdGVudGl0bGVtZW50OiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQsXG5cdFx0XHRzZW50aW1lbnQ6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQsXG5cdFx0XHRxdW90YXM6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMsXG5cdFx0XHRhbGxvd1NpZ25lZE91dFdoZW5Vc2FibGU6IGZhbHNlLFxuXHRcdH0pKTtcblx0XHRpZiAoYmFkZ2VLZXkpIHtcblx0XHRcdHRoaXMuZGlzbWlzc2VkQmFkZ2VLZXkgPSBiYWRnZUtleTtcblx0XHR9XG5cblx0XHR0aGlzLmlzQWNjb3VudE1lbnVWaXNpYmxlID0gdHJ1ZTtcblx0XHR0aGlzLnJlbmRlckFjY291bnRTdGF0ZSgpO1xuXHRcdHBhbmVsU3RvcmUuYWRkKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5pc0FjY291bnRNZW51VmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLmNvcGlsb3REYXNoYm9hcmRTdG9yZS5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLnJlbmRlckFjY291bnRTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2xvc2VTaGVldCA9ICgpID0+IHRoaXMuYWNjb3VudFBhbmVsRGlzcG9zYWJsZS5jbGVhcigpO1xuXG5cdFx0Ly8gRnVsbC1zY3JlZW4gc2hlZXQgaW5zaWRlIHRoZSB3b3JrYmVuY2ggY29udGFpbmVyXG5cdFx0Y29uc3Qgd29ya2JlbmNoQ29udGFpbmVyID0gdGhpcy5lbGVtZW50LnBhcmVudEVsZW1lbnQhO1xuXHRcdGNvbnN0IHNoZWV0ID0gYXBwZW5kKHdvcmtiZW5jaENvbnRhaW5lciwgJCgnZGl2Lm1vYmlsZS1hY2NvdW50LXNoZWV0JykpO1xuXHRcdHBhbmVsU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBzaGVldC5yZW1vdmUoKSkpO1xuXG5cdFx0Ly8gSGVhZGVyOiB0aXRsZSArIGNsb3NlIGJ1dHRvblxuXHRcdGNvbnN0IGhlYWRlciA9IGFwcGVuZChzaGVldCwgJCgnZGl2Lm1vYmlsZS1hY2NvdW50LXNoZWV0LWhlYWRlcicpKTtcblx0XHRjb25zdCBoZWFkZXJUaXRsZSA9IGFwcGVuZChoZWFkZXIsICQoJ2gyLm1vYmlsZS1hY2NvdW50LXNoZWV0LXRpdGxlJykpO1xuXHRcdGhlYWRlclRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ21vYmlsZUFjY291bnQudGl0bGUnLCBcIkFjY291bnRcIik7XG5cdFx0Y29uc3QgY2xvc2VCdXR0b24gPSBhcHBlbmQoaGVhZGVyLCAkKCdidXR0b24ubW9iaWxlLWFjY291bnQtc2hlZXQtY2xvc2UnLCB7IHR5cGU6ICdidXR0b24nIH0pKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRjbG9zZUJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnbW9iaWxlQWNjb3VudC5jbG9zZScsIFwiQ2xvc2VcIikpO1xuXHRcdGFwcGVuZChjbG9zZUJ1dHRvbiwgJCgnc3BhbicpKS5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uY2xvc2UpKTtcblx0XHRwYW5lbFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoY2xvc2VCdXR0b24sIEV2ZW50VHlwZS5DTElDSywgY2xvc2VTaGVldCkpO1xuXG5cdFx0Ly8gU2Nyb2xsYWJsZSBjb250ZW50XG5cdFx0Y29uc3QgY29udGVudCA9IGFwcGVuZChzaGVldCwgJCgnZGl2Lm1vYmlsZS1hY2NvdW50LXNoZWV0LWNvbnRlbnQnKSk7XG5cblx0XHQvLyBQcm9maWxlIHNlY3Rpb25cblx0XHRjb25zdCBwcm9maWxlID0gYXBwZW5kKGNvbnRlbnQsICQoJ2Rpdi5tb2JpbGUtYWNjb3VudC1zaGVldC1wcm9maWxlJykpO1xuXHRcdGlmICh0aGlzLmxvYWRlZEF2YXRhclVybCkge1xuXHRcdFx0Y29uc3QgYXZhdGFyID0gYXBwZW5kKHByb2ZpbGUsICQoJ2ltZy5tb2JpbGUtYWNjb3VudC1zaGVldC1hdmF0YXInLCB7IGFsdDogJycsIGRyYWdnYWJsZTogJ2ZhbHNlJyB9KSkgYXMgSFRNTEltYWdlRWxlbWVudDtcblx0XHRcdGF2YXRhci5zcmMgPSB0aGlzLmxvYWRlZEF2YXRhclVybDtcblx0XHRcdGF2YXRhci5yZWZlcnJlclBvbGljeSA9ICduby1yZWZlcnJlcic7XG5cdFx0XHRhdmF0YXIuZGVjb2RpbmcgPSAnYXN5bmMnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBhdmF0YXJQbGFjZWhvbGRlciA9IGFwcGVuZChwcm9maWxlLCAkKCdkaXYubW9iaWxlLWFjY291bnQtc2hlZXQtYXZhdGFyLXBsYWNlaG9sZGVyJykpO1xuXHRcdFx0YXBwZW5kKGF2YXRhclBsYWNlaG9sZGVyLCAkKCdzcGFuJykpLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5hY2NvdW50KSk7XG5cdFx0fVxuXHRcdGNvbnN0IHByb2ZpbGVJbmZvID0gYXBwZW5kKHByb2ZpbGUsICQoJ2Rpdi5tb2JpbGUtYWNjb3VudC1zaGVldC1wcm9maWxlLWluZm8nKSk7XG5cdFx0aWYgKHRoaXMuaXNBY2NvdW50TG9hZGluZykge1xuXHRcdFx0YXBwZW5kKHByb2ZpbGVJbmZvLCAkKCdkaXYubW9iaWxlLWFjY291bnQtc2hlZXQtbmFtZScpKS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdtb2JpbGVBY2NvdW50LmxvYWRpbmcnLCBcIkxvYWRpbmcuLi5cIik7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmFjY291bnROYW1lKSB7XG5cdFx0XHRhcHBlbmQocHJvZmlsZUluZm8sICQoJ2Rpdi5tb2JpbGUtYWNjb3VudC1zaGVldC1uYW1lJykpLnRleHRDb250ZW50ID0gdGhpcy5hY2NvdW50TmFtZTtcblx0XHRcdGlmICh0aGlzLmFjY291bnRQcm92aWRlckxhYmVsKSB7XG5cdFx0XHRcdGFwcGVuZChwcm9maWxlSW5mbywgJCgnZGl2Lm1vYmlsZS1hY2NvdW50LXNoZWV0LXByb3ZpZGVyJykpLnRleHRDb250ZW50ID0gdGhpcy5hY2NvdW50UHJvdmlkZXJMYWJlbDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0YXBwZW5kKHByb2ZpbGVJbmZvLCAkKCdkaXYubW9iaWxlLWFjY291bnQtc2hlZXQtbmFtZScpKS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdtb2JpbGVBY2NvdW50LnNpZ25lZE91dCcsIFwiTm90IHNpZ25lZCBpblwiKTtcblx0XHR9XG5cblx0XHQvLyBDb3BpbG90IHN0YXR1cyBkYXNoYm9hcmQgXHUyMDE0IG9ubHkgd2hlbiBzaWduZWQgaW4gQU5EIGVudGl0bGVtZW50c1xuXHRcdC8vIGhhdmUgcmVzb2x2ZWQuIFdoZW4gZW50aXRsZW1lbnQgaXMgVW5rbm93biBvciBBdmFpbGFibGUgKHNldHVwXG5cdFx0Ly8gcGVuZGluZyksIHRoZSBkYXNoYm9hcmQgc2hvd3MgYSBcIlNldCB1cCBDb3BpbG90XCIgcHJvbXB0IHRoYXRcblx0XHQvLyBkb2Vzbid0IGFwcGx5IGluIHRoZSBhZ2VudHMgYXBwLlxuXHRcdGNvbnN0IGVudGl0bGVtZW50ID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50O1xuXHRcdGNvbnN0IHNob3dEYXNoYm9hcmQgPSAhdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5oaWRkZW5cblx0XHRcdCYmICEhdGhpcy5hY2NvdW50TmFtZVxuXHRcdFx0JiYgZW50aXRsZW1lbnQgIT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duXG5cdFx0XHQmJiBlbnRpdGxlbWVudCAhPT0gQ2hhdEVudGl0bGVtZW50LkF2YWlsYWJsZTtcblx0XHRpZiAoc2hvd0Rhc2hib2FyZCkge1xuXHRcdFx0Y29uc3QgZGFzaGJvYXJkU2VjdGlvbiA9IGFwcGVuZChjb250ZW50LCAkKCdkaXYubW9iaWxlLWFjY291bnQtc2hlZXQtc2VjdGlvbicpKTtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0dGhpcy5jb3BpbG90RGFzaGJvYXJkU3RvcmUudmFsdWUgPSBzdG9yZTtcblx0XHRcdGNvbnN0IGRhc2hib2FyZEVsZW1lbnQgPSB0aGlzLmNoYXREYXNoYm9hcmRTZXJ2aWNlLmNyZWF0ZURhc2hib2FyZEVsZW1lbnQoc3RvcmUpO1xuXHRcdFx0aWYgKGRhc2hib2FyZEVsZW1lbnQpIHtcblx0XHRcdFx0YXBwZW5kKGRhc2hib2FyZFNlY3Rpb24sIGRhc2hib2FyZEVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFjdGlvbnMgbGlzdFxuXHRcdGNvbnN0IGFjdGlvbnNTZWN0aW9uID0gYXBwZW5kKGNvbnRlbnQsICQoJ2Rpdi5tb2JpbGUtYWNjb3VudC1zaGVldC1hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGFsbEFjdGlvbnMgPSB0aGlzLmdldFNoZWV0QWN0aW9ucygpO1xuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFsbEFjdGlvbnMpIHtcblx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IpIHtcblx0XHRcdFx0YXBwZW5kKGFjdGlvbnNTZWN0aW9uLCAkKCdkaXYubW9iaWxlLWFjY291bnQtc2hlZXQtc2VwYXJhdG9yJykpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJvdyA9IGFwcGVuZChhY3Rpb25zU2VjdGlvbiwgJCgnYnV0dG9uLm1vYmlsZS1hY2NvdW50LXNoZWV0LWFjdGlvbicsIHsgdHlwZTogJ2J1dHRvbicgfSkpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdFx0cm93LmRpc2FibGVkID0gIWFjdGlvbi5lbmFibGVkO1xuXHRcdFx0cm93LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFjdGlvbi50b29sdGlwIHx8IGFjdGlvbi5sYWJlbCk7XG5cdFx0XHRjb25zdCBpY29uID0gdGhpcy5nZXRBY3Rpb25JY29uKGFjdGlvbik7XG5cdFx0XHRpZiAoaWNvbikge1xuXHRcdFx0XHRhcHBlbmQocm93LCAkKCdzcGFuLm1vYmlsZS1hY2NvdW50LXNoZWV0LWFjdGlvbi1pY29uJykpLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaWNvbikpO1xuXHRcdFx0fVxuXHRcdFx0YXBwZW5kKHJvdywgJCgnc3Bhbi5tb2JpbGUtYWNjb3VudC1zaGVldC1hY3Rpb24tbGFiZWwnKSkudGV4dENvbnRlbnQgPSBhY3Rpb24ubGFiZWw7XG5cdFx0XHRwYW5lbFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIocm93LCBFdmVudFR5cGUuQ0xJQ0ssIGFzeW5jIGV2ZW50ID0+IHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGNsb3NlU2hlZXQoKTtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKGFjdGlvbi5ydW4oKSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTaGVldEFjdGlvbnMoKTogSUFjdGlvbltdIHtcblx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVzLkFjY291bnRNZW51LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCByYXdBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRmaWxsSW5BY3Rpb25CYXJBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucygpLCByYXdBY3Rpb25zKTtcblx0XHRtZW51LmRpc3Bvc2UoKTtcblx0XHRyZXR1cm4gcmF3QWN0aW9ucy5maWx0ZXIoYWN0aW9uID0+IHtcblx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5pc0FjY291bnRMb2FkaW5nICYmIGFjdGlvbi5pZCA9PT0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRpY1NpZ25JbicpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICFhY3Rpb24uaWQuc3RhcnRzV2l0aCgndXBkYXRlLicpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3Rpb25JY29uKGFjdGlvbjogSUFjdGlvbik6IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoIChhY3Rpb24uaWQpIHtcblx0XHRcdGNhc2UgJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJzogcmV0dXJuIENvZGljb24uc2V0dGluZ3NHZWFyO1xuXHRcdFx0Y2FzZSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudGljU2lnbk91dCc6IHJldHVybiBDb2RpY29uLnNpZ25PdXQ7XG5cdFx0XHRjYXNlICd3b3JrYmVuY2guYWN0aW9uLmFnZW50aWNTaWduSW4nOiByZXR1cm4gQ29kaWNvbi5zaWduSW47XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxZQUFZLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBQzdFLFNBQVMsR0FBRyx1QkFBdUIsUUFBUSxpQkFBaUI7QUFDNUQsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFDeEIsU0FBa0IsaUJB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
