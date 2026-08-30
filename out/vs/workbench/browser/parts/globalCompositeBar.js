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
import "./media/globalCompositeBar.css";
import { localize } from "../../../nls.js";
import { ActionBar, ActionsOrientation } from "../../../base/browser/ui/actionbar/actionbar.js";
import { ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID } from "../../common/activity.js";
import { IActivityService } from "../../services/activity/common/activity.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { DisposableStore, Disposable } from "../../../base/common/lifecycle.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { CompositeBarActionViewItem, CompositeBarAction } from "./compositeBarActions.js";
import { Codicon } from "../../../base/common/codicons.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { registerIcon } from "../../../platform/theme/common/iconRegistry.js";
import { Action, Separator, SubmenuAction, toAction } from "../../../base/common/actions.js";
import { IMenuService, MenuId } from "../../../platform/actions/common/actions.js";
import { addDisposableListener, EventType, append, clearNode, hide, show, EventHelper, $, runWhenWindowIdle, getWindow } from "../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../base/browser/keyboardEvent.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { EventType as TouchEventType } from "../../../base/browser/touch.js";
import { AnchorAlignment, AnchorAxisAlignment } from "../../../base/browser/ui/contextview/contextview.js";
import { Lazy } from "../../../base/common/lazy.js";
import { getActionBarActions } from "../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IProductService } from "../../../platform/product/common/productService.js";
import { ISecretStorageService } from "../../../platform/secrets/common/secrets.js";
import { getCurrentAuthenticationSessionInfo } from "../../services/authentication/browser/authenticationService.js";
import { ACCOUNTS_AVATAR_SETTING, IAuthenticationService, INTERNAL_AUTH_PROVIDER_PREFIX } from "../../services/authentication/common/authentication.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { IHoverService } from "../../../platform/hover/browser/hover.js";
import { ILifecycleService, LifecyclePhase } from "../../services/lifecycle/common/lifecycle.js";
import { IUserDataProfileService } from "../../services/userDataProfile/common/userDataProfile.js";
import { DEFAULT_ICON } from "../../services/userDataProfile/common/userDataProfileIcons.js";
import { isString } from "../../../base/common/types.js";
import { FileAccess } from "../../../base/common/network.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND } from "../../common/theme.js";
import { ICommandService } from "../../../platform/commands/common/commands.js";
import { IDefaultAccountService } from "../../../platform/defaultAccount/common/defaultAccount.js";
import { WORKBENCH_MENU_MOTION_CLASS, workbenchMenuCloseAnimation } from "../actions/menuMotion.js";
import { createCodexAccountMenuActions, ICodexAccountService, shouldShowCodexAccount } from "../../services/agentHost/browser/codexAccountService.js";
let GlobalCompositeBar = class extends Disposable {
  constructor(contextMenuActionsProvider, colors, activityHoverOptions, configurationService, instantiationService, storageService, extensionService) {
    super();
    this.contextMenuActionsProvider = contextMenuActionsProvider;
    this.colors = colors;
    this.activityHoverOptions = activityHoverOptions;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.extensionService = extensionService;
    this.globalActivityAction = this._register(new Action(GLOBAL_ACTIVITY_ID));
    this.accountAction = this._register(new Action(ACCOUNTS_ACTIVITY_ID));
    this.element = $("div");
    const contextMenuAlignmentOptions = () => ({
      anchorAlignment: configurationService.getValue("workbench.sideBar.location") === "left" ? AnchorAlignment.RIGHT : AnchorAlignment.LEFT,
      anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL
    });
    this.globalActivityActionBar = this._register(new ActionBar(this.element, {
      actionViewItemProvider: (action, options) => {
        if (action.id === GLOBAL_ACTIVITY_ID) {
          return this.instantiationService.createInstance(GlobalActivityActionViewItem, this.contextMenuActionsProvider, { ...options, colors: this.colors, hoverOptions: this.activityHoverOptions }, contextMenuAlignmentOptions);
        }
        if (action.id === ACCOUNTS_ACTIVITY_ID) {
          return this.instantiationService.createInstance(
            AccountsActivityActionViewItem,
            this.contextMenuActionsProvider,
            {
              ...options,
              colors: this.colors,
              hoverOptions: this.activityHoverOptions
            },
            contextMenuAlignmentOptions,
            (actions) => {
              actions.unshift(...[
                toAction({ id: "hideAccounts", label: localize("hideAccounts", "Hide Accounts"), run: () => setAccountsActionVisible(storageService, false) }),
                new Separator()
              ]);
            }
          );
        }
        throw new Error(`No view item for action '${action.id}'`);
      },
      orientation: ActionsOrientation.VERTICAL,
      ariaLabel: localize("manage", "Manage"),
      preventLoopNavigation: true
    }));
    if (this.accountsVisibilityPreference) {
      this.globalActivityActionBar.push(this.accountAction, { index: GlobalCompositeBar.ACCOUNTS_ACTION_INDEX });
    }
    this.globalActivityActionBar.push(this.globalActivityAction);
    this.registerListeners();
  }
  registerListeners() {
    this.extensionService.whenInstalledExtensionsRegistered().then(() => {
      if (!this._store.isDisposed) {
        this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, this._store)(() => this.toggleAccountsActivity()));
      }
    });
  }
  create(parent) {
    parent.appendChild(this.element);
  }
  focus() {
    this.globalActivityActionBar.focus(true);
  }
  size() {
    return this.globalActivityActionBar.viewItems.length;
  }
  getContextMenuActions() {
    return [toAction({ id: "toggleAccountsVisibility", label: localize("accounts", "Accounts"), checked: this.accountsVisibilityPreference, run: () => this.accountsVisibilityPreference = !this.accountsVisibilityPreference })];
  }
  toggleAccountsActivity() {
    if (this.globalActivityActionBar.length() === 2 && this.accountsVisibilityPreference) {
      return;
    }
    if (this.globalActivityActionBar.length() === 2) {
      this.globalActivityActionBar.pull(GlobalCompositeBar.ACCOUNTS_ACTION_INDEX);
    } else {
      this.globalActivityActionBar.push(this.accountAction, { index: GlobalCompositeBar.ACCOUNTS_ACTION_INDEX });
    }
  }
  get accountsVisibilityPreference() {
    return isAccountsActionVisible(this.storageService);
  }
  set accountsVisibilityPreference(value) {
    setAccountsActionVisible(this.storageService, value);
  }
};
GlobalCompositeBar.ACCOUNTS_ACTION_INDEX = 0;
GlobalCompositeBar.ACCOUNTS_ICON = registerIcon("accounts-view-bar-icon", Codicon.account, localize("accountsViewBarIcon", "Accounts icon in the view bar."));
GlobalCompositeBar = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IExtensionService)
], GlobalCompositeBar);
let AbstractGlobalActivityActionViewItem = class extends CompositeBarActionViewItem {
  constructor(menuId, action, options, contextMenuActionsProvider, contextMenuAlignmentOptions, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, keybindingService, activityService) {
    super(action, { draggable: false, icon: true, hasPopup: true, ...options }, () => true, themeService, hoverService, configurationService, keybindingService);
    this.menuId = menuId;
    this.contextMenuActionsProvider = contextMenuActionsProvider;
    this.contextMenuAlignmentOptions = contextMenuAlignmentOptions;
    this.menuService = menuService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.activityService = activityService;
    this.updateItemActivity();
    this._register(this.activityService.onDidChangeActivity((viewContainerOrAction) => {
      if (isString(viewContainerOrAction) && viewContainerOrAction === this.compositeBarActionItem.id) {
        this.updateItemActivity();
      }
    }));
  }
  updateItemActivity() {
    this.action.activities = this.activityService.getActivity(this.compositeBarActionItem.id);
  }
  render(container) {
    super.render(container);
    this._register(addDisposableListener(this.container, EventType.MOUSE_DOWN, async (e) => {
      EventHelper.stop(e, true);
      const isLeftClick = e?.button !== 2;
      if (isLeftClick) {
        this.run();
      }
    }));
    this._register(addDisposableListener(this.container, EventType.CONTEXT_MENU, async (e) => {
      e.stopPropagation();
      const disposables = new DisposableStore();
      const actions = await this.resolveContextMenuActions(disposables);
      const event = new StandardMouseEvent(getWindow(this.container), e);
      this.contextMenuService.showContextMenu({
        getAnchor: () => event,
        getActions: () => actions,
        getMenuClassName: () => WORKBENCH_MENU_MOTION_CLASS,
        onHide: () => disposables.dispose(),
        closeAnimation: workbenchMenuCloseAnimation
      });
    }));
    this._register(addDisposableListener(this.container, EventType.KEY_UP, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        EventHelper.stop(e, true);
        this.run();
      }
    }));
    this._register(addDisposableListener(this.container, TouchEventType.Tap, (e) => {
      EventHelper.stop(e, true);
      this.run();
    }));
  }
  async resolveContextMenuActions(disposables) {
    return this.contextMenuActionsProvider();
  }
  async run() {
    const disposables = new DisposableStore();
    const menu = disposables.add(this.menuService.createMenu(this.menuId, this.contextKeyService));
    const actions = await this.resolveMainMenuActions(menu, disposables);
    const { anchorAlignment, anchorAxisAlignment } = this.contextMenuAlignmentOptions() ?? { anchorAlignment: void 0, anchorAxisAlignment: void 0 };
    this.contextMenuService.showContextMenu({
      getAnchor: () => this.label,
      anchorAlignment,
      anchorAxisAlignment,
      getActions: () => actions,
      getMenuClassName: () => WORKBENCH_MENU_MOTION_CLASS,
      onHide: () => disposables.dispose(),
      menuActionOptions: { renderShortTitle: true },
      closeAnimation: workbenchMenuCloseAnimation
    });
  }
  async resolveMainMenuActions(menu, _disposable) {
    return getActionBarActions(menu.getActions({ renderShortTitle: true })).secondary;
  }
};
AbstractGlobalActivityActionViewItem = __decorateClass([
  __decorateParam(5, IThemeService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IMenuService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IKeybindingService),
  __decorateParam(12, IActivityService)
], AbstractGlobalActivityActionViewItem);
let AccountsActivityActionViewItem = class extends AbstractGlobalActivityActionViewItem {
  constructor(contextMenuActionsProvider, options, contextMenuAlignmentOptions, fillContextMenuActions, themeService, lifecycleService, hoverService, contextMenuService, menuService, contextKeyService, authenticationService, environmentService, productService, configurationService, keybindingService, secretStorageService, logService, activityService, instantiationService, commandService, codexAccountService, defaultAccountService) {
    const action = instantiationService.createInstance(CompositeBarAction, {
      id: ACCOUNTS_ACTIVITY_ID,
      name: localize("accounts", "Accounts"),
      classNames: ThemeIcon.asClassNameArray(GlobalCompositeBar.ACCOUNTS_ICON)
    });
    super(MenuId.AccountsContext, action, options, contextMenuActionsProvider, contextMenuAlignmentOptions, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, keybindingService, activityService);
    this.fillContextMenuActions = fillContextMenuActions;
    this.lifecycleService = lifecycleService;
    this.authenticationService = authenticationService;
    this.productService = productService;
    this.secretStorageService = secretStorageService;
    this.logService = logService;
    this.commandService = commandService;
    this.codexAccountService = codexAccountService;
    this.defaultAccountService = defaultAccountService;
    this.groupedAccounts = /* @__PURE__ */ new Map();
    this.problematicProviders = /* @__PURE__ */ new Set();
    this.initialized = false;
    this.sessionFromEmbedder = new Lazy(() => getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService));
    this._register(action);
    this.registerListeners();
    this.initialize();
  }
  registerListeners() {
    this._register(this.authenticationService.onDidRegisterAuthenticationProvider(async (e) => {
      await this.addAccountsFromProvider(e.id);
      this.updateAvatar();
    }));
    this._register(this.authenticationService.onDidUnregisterAuthenticationProvider((e) => {
      this.groupedAccounts.delete(e.id);
      this.problematicProviders.delete(e.id);
      this.updateAvatar();
    }));
    this._register(this.authenticationService.onDidChangeSessions(async (e) => {
      if (e.event.removed) {
        for (const removed of e.event.removed) {
          this.removeAccount(e.providerId, removed.account);
        }
      }
      for (const changed of [...e.event.changed ?? [], ...e.event.added ?? []]) {
        try {
          await this.addOrUpdateAccount(e.providerId, changed.account);
        } catch (e2) {
          this.logService.error(e2);
        }
      }
      this.updateAvatar();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ACCOUNTS_AVATAR_SETTING)) {
        this.updateAvatar();
      }
    }));
    this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => {
      this.updateAvatar();
    }));
  }
  // This function exists to ensure that the accounts are added for auth providers that had already been registered
  // before the menu was created.
  async initialize() {
    await this.lifecycleService.when(LifecyclePhase.Restored);
    if (this._store.isDisposed) {
      return;
    }
    const disposable = this._register(runWhenWindowIdle(getWindow(this.element), async () => {
      await this.doInitialize();
      disposable.dispose();
    }));
  }
  async doInitialize() {
    const providerIds = this.authenticationService.getProviderIds();
    const results = await Promise.allSettled(providerIds.map((providerId) => this.addAccountsFromProvider(providerId)));
    for (const result of results) {
      if (result.status === "rejected") {
        this.logService.error(result.reason);
      }
    }
    this.initialized = true;
    this.updateAvatar();
  }
  render(container) {
    super.render(container);
    this.avatarImg = $("img.accounts-avatar");
    this.avatarImg.alt = "";
    this.avatarImg.setAttribute("aria-hidden", "true");
    this.avatarImg.draggable = false;
    this.avatarImg.referrerPolicy = "no-referrer";
    this.avatarImg.style.display = "none";
    this.avatarImg.onerror = () => {
      this.avatarImg.style.display = "none";
      this.label.classList.remove("has-avatar");
    };
    append(this.label, this.avatarImg);
    this.updateAvatar();
  }
  updateAvatar() {
    if (!this.avatarImg) {
      return;
    }
    let avatarIcon;
    if (this.configurationService.getValue(ACCOUNTS_AVATAR_SETTING)) {
      avatarIcon = this.getDefaultAccountAvatarIcon();
      if (!avatarIcon) {
        for (const accounts of this.groupedAccounts.values()) {
          for (const account of accounts) {
            if (account.icon) {
              avatarIcon = account.icon;
              break;
            }
          }
          if (avatarIcon) {
            break;
          }
        }
      }
    }
    if (avatarIcon) {
      this.avatarImg.src = FileAccess.uriToBrowserUri(avatarIcon).toString(true);
      this.avatarImg.style.display = "";
      this.label.classList.add("has-avatar");
    } else {
      this.avatarImg.removeAttribute("src");
      this.avatarImg.style.display = "none";
      this.label.classList.remove("has-avatar");
    }
  }
  getDefaultAccountAvatarIcon() {
    const currentDefaultAccount = this.defaultAccountService.currentDefaultAccount;
    if (!currentDefaultAccount) {
      return void 0;
    }
    const accounts = this.groupedAccounts.get(currentDefaultAccount.authenticationProvider.id);
    return accounts?.find((account) => account.label === currentDefaultAccount.accountName)?.icon;
  }
  //#region overrides
  async resolveMainMenuActions(accountsMenu, disposables) {
    await super.resolveMainMenuActions(accountsMenu, disposables);
    const providers = this.authenticationService.getProviderIds().filter((p) => !p.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX));
    const otherCommands = accountsMenu.getActions();
    let menus = [];
    const registeredProviders = providers.filter((providerId) => !this.authenticationService.isDynamicAuthenticationProvider(providerId));
    const dynamicProviders = providers.filter((providerId) => this.authenticationService.isDynamicAuthenticationProvider(providerId));
    if (!this.initialized) {
      const noAccountsAvailableAction = disposables.add(new Action("noAccountsAvailable", localize("loading", "Loading..."), void 0, false));
      menus.push(noAccountsAvailableAction);
    } else {
      for (const providerId of registeredProviders) {
        const provider = this.authenticationService.getProvider(providerId);
        const accounts = this.groupedAccounts.get(providerId);
        if (!accounts) {
          if (this.problematicProviders.has(providerId)) {
            const providerUnavailableAction = disposables.add(new Action("providerUnavailable", localize("authProviderUnavailable", "{0} is currently unavailable", provider.label), void 0, false));
            menus.push(providerUnavailableAction);
            try {
              await this.addAccountsFromProvider(providerId);
            } catch (e) {
              this.logService.error(e);
            }
          }
          continue;
        }
        const canUseMcp = !!provider.authorizationServers?.length;
        for (const account of accounts) {
          const manageExtensionsAction = toAction({
            id: `configureSessions${account.label}`,
            label: localize("manageTrustedExtensions", "Manage Trusted Extensions"),
            enabled: true,
            run: () => this.commandService.executeCommand("_manageTrustedExtensionsForAccount", { providerId, accountLabel: account.label })
          });
          const providerSubMenuActions = [manageExtensionsAction];
          if (canUseMcp) {
            const manageMCPAction = toAction({
              id: `configureSessions${account.label}`,
              label: localize("manageTrustedMCPServers", "Manage Trusted MCP Servers"),
              enabled: true,
              run: () => this.commandService.executeCommand("_manageTrustedMCPServersForAccount", { providerId, accountLabel: account.label })
            });
            providerSubMenuActions.push(manageMCPAction);
          }
          if (account.canSignOut) {
            providerSubMenuActions.push(toAction({
              id: "signOut",
              label: localize("signOut", "Sign Out"),
              enabled: true,
              run: () => this.commandService.executeCommand("_signOutOfAccount", { providerId, accountLabel: account.label })
            }));
          }
          const providerSubMenu = new SubmenuAction("activitybar.submenu", `${account.label} (${provider.label})`, providerSubMenuActions);
          menus.push(providerSubMenu);
        }
      }
      if (dynamicProviders.length && registeredProviders.length) {
        menus.push(new Separator());
      }
      for (const providerId of dynamicProviders) {
        const provider = this.authenticationService.getProvider(providerId);
        const accounts = this.groupedAccounts.get(providerId);
        const manageDynamicAuthProvidersAction = toAction({
          id: "manageDynamicAuthProviders",
          label: localize("manageDynamicAuthProviders", "Manage Dynamic Authentication Providers..."),
          enabled: true,
          run: () => this.commandService.executeCommand("workbench.action.removeDynamicAuthenticationProviders")
        });
        if (!accounts) {
          if (this.problematicProviders.has(providerId)) {
            const providerUnavailableAction = disposables.add(new Action("providerUnavailable", localize("authProviderUnavailable", "{0} is currently unavailable", provider.label), void 0, false));
            menus.push(providerUnavailableAction);
            try {
              await this.addAccountsFromProvider(providerId);
            } catch (e) {
              this.logService.error(e);
            }
          }
          menus.push(manageDynamicAuthProvidersAction);
          continue;
        }
        for (const account of accounts) {
          const providerSubMenuActions = [];
          const manageMCPAction = toAction({
            id: `configureSessions${account.label}`,
            label: localize("manageTrustedMCPServers", "Manage Trusted MCP Servers"),
            enabled: true,
            run: () => this.commandService.executeCommand("_manageTrustedMCPServersForAccount", { providerId, accountLabel: account.label })
          });
          providerSubMenuActions.push(manageMCPAction);
          providerSubMenuActions.push(manageDynamicAuthProvidersAction);
          if (account.canSignOut) {
            providerSubMenuActions.push(toAction({
              id: "signOut",
              label: localize("signOut", "Sign Out"),
              enabled: true,
              run: () => this.commandService.executeCommand("_signOutOfAccount", { providerId, accountLabel: account.label })
            }));
          }
          const providerSubMenu = new SubmenuAction("activitybar.submenu", `${account.label} (${provider.label})`, providerSubMenuActions);
          menus.push(providerSubMenu);
        }
      }
    }
    const codexAccountActions = createCodexAccountMenuActions(this.codexAccountService, shouldShowCodexAccount(this.configurationService, false));
    if (codexAccountActions.length) {
      if (menus.length) {
        menus.push(new Separator());
      }
      for (const action of codexAccountActions) {
        menus.push(action instanceof Action ? disposables.add(action) : action);
      }
    }
    if (menus.length && otherCommands.length) {
      menus.push(new Separator());
    }
    otherCommands.forEach((group, i) => {
      const actions = group[1];
      menus = menus.concat(actions);
      if (i !== otherCommands.length - 1) {
        menus.push(new Separator());
      }
    });
    return menus;
  }
  async resolveContextMenuActions(disposables) {
    const actions = await super.resolveContextMenuActions(disposables);
    this.fillContextMenuActions(actions);
    return actions;
  }
  //#endregion
  //#region groupedAccounts helpers
  async addOrUpdateAccount(providerId, account) {
    let accounts = this.groupedAccounts.get(providerId);
    if (!accounts) {
      accounts = [];
      this.groupedAccounts.set(providerId, accounts);
    }
    const sessionFromEmbedder = await this.sessionFromEmbedder.value;
    let canSignOut = true;
    if (sessionFromEmbedder && !sessionFromEmbedder.canSignOut && (await this.authenticationService.getSessions(providerId)).some(
      (s) => s.id === sessionFromEmbedder.id && s.account.id === account.id
    )) {
      canSignOut = false;
    }
    const existingAccount = accounts.find((a) => a.label === account.label);
    if (existingAccount) {
      if (!canSignOut) {
        existingAccount.canSignOut = canSignOut;
      }
      existingAccount.icon = account.icon;
    } else {
      accounts.push({ ...account, canSignOut });
    }
  }
  removeAccount(providerId, account) {
    const accounts = this.groupedAccounts.get(providerId);
    if (!accounts) {
      return;
    }
    const index = accounts.findIndex((a) => a.id === account.id);
    if (index === -1) {
      return;
    }
    accounts.splice(index, 1);
    if (accounts.length === 0) {
      this.groupedAccounts.delete(providerId);
    }
  }
  async addAccountsFromProvider(providerId) {
    try {
      const sessions = await this.authenticationService.getSessions(providerId);
      this.problematicProviders.delete(providerId);
      for (const session of sessions) {
        try {
          await this.addOrUpdateAccount(providerId, session.account);
        } catch (e) {
          this.logService.error(e);
        }
      }
    } catch (e) {
      this.logService.error(e);
      this.problematicProviders.add(providerId);
    }
  }
  //#endregion
};
AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY = "workbench.activity.showAccounts";
AccountsActivityActionViewItem = __decorateClass([
  __decorateParam(4, IThemeService),
  __decorateParam(5, ILifecycleService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IAuthenticationService),
  __decorateParam(11, IWorkbenchEnvironmentService),
  __decorateParam(12, IProductService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IKeybindingService),
  __decorateParam(15, ISecretStorageService),
  __decorateParam(16, ILogService),
  __decorateParam(17, IActivityService),
  __decorateParam(18, IInstantiationService),
  __decorateParam(19, ICommandService),
  __decorateParam(20, ICodexAccountService),
  __decorateParam(21, IDefaultAccountService)
], AccountsActivityActionViewItem);
let GlobalActivityActionViewItem = class extends AbstractGlobalActivityActionViewItem {
  constructor(contextMenuActionsProvider, options, contextMenuAlignmentOptions, userDataProfileService, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, environmentService, keybindingService, instantiationService, activityService) {
    const action = instantiationService.createInstance(CompositeBarAction, {
      id: GLOBAL_ACTIVITY_ID,
      name: localize("manage", "Manage"),
      classNames: ThemeIcon.asClassNameArray(userDataProfileService.currentProfile.icon ? ThemeIcon.fromId(userDataProfileService.currentProfile.icon) : DEFAULT_ICON)
    });
    super(MenuId.GlobalActivity, action, options, contextMenuActionsProvider, contextMenuAlignmentOptions, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, keybindingService, activityService);
    this.userDataProfileService = userDataProfileService;
    this._register(action);
    this._register(this.userDataProfileService.onDidChangeCurrentProfile((e) => {
      action.compositeBarActionItem = {
        ...action.compositeBarActionItem,
        classNames: ThemeIcon.asClassNameArray(userDataProfileService.currentProfile.icon ? ThemeIcon.fromId(userDataProfileService.currentProfile.icon) : DEFAULT_ICON)
      };
    }));
  }
  render(container) {
    super.render(container);
    this.profileBadge = append(container, $(".profile-badge"));
    this.profileBadgeContent = append(this.profileBadge, $(".profile-badge-content"));
    this.updateProfileBadge();
  }
  updateProfileBadge() {
    if (!this.profileBadge || !this.profileBadgeContent) {
      return;
    }
    clearNode(this.profileBadgeContent);
    hide(this.profileBadge);
    if (this.userDataProfileService.currentProfile.isDefault) {
      return;
    }
    if (this.userDataProfileService.currentProfile.icon && this.userDataProfileService.currentProfile.icon !== DEFAULT_ICON.id) {
      return;
    }
    if (this.action.activities.length > 0) {
      return;
    }
    show(this.profileBadge);
    this.profileBadgeContent.classList.add("profile-text-overlay");
    this.profileBadgeContent.textContent = this.userDataProfileService.currentProfile.name.substring(0, 2).toUpperCase();
  }
  updateActivity() {
    super.updateActivity();
    this.updateProfileBadge();
  }
  computeTitle() {
    return this.userDataProfileService.currentProfile.isDefault ? super.computeTitle() : localize("manage profile", "Manage {0} (Profile)", this.userDataProfileService.currentProfile.name);
  }
};
GlobalActivityActionViewItem = __decorateClass([
  __decorateParam(3, IUserDataProfileService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IMenuService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IWorkbenchEnvironmentService),
  __decorateParam(11, IKeybindingService),
  __decorateParam(12, IInstantiationService),
  __decorateParam(13, IActivityService)
], GlobalActivityActionViewItem);
let SimpleAccountActivityActionViewItem = class extends AccountsActivityActionViewItem {
  constructor(hoverOptions, options, themeService, lifecycleService, hoverService, contextMenuService, menuService, contextKeyService, authenticationService, environmentService, productService, configurationService, keybindingService, secretStorageService, storageService, logService, activityService, instantiationService, commandService, codexAccountService, defaultAccountService) {
    super(
      () => simpleActivityContextMenuActions(storageService, true),
      {
        ...options,
        colors: (theme) => ({
          badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
          badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND)
        }),
        hoverOptions,
        compact: true
      },
      () => void 0,
      (actions) => actions,
      themeService,
      lifecycleService,
      hoverService,
      contextMenuService,
      menuService,
      contextKeyService,
      authenticationService,
      environmentService,
      productService,
      configurationService,
      keybindingService,
      secretStorageService,
      logService,
      activityService,
      instantiationService,
      commandService,
      codexAccountService,
      defaultAccountService
    );
  }
};
SimpleAccountActivityActionViewItem = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IMenuService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IAuthenticationService),
  __decorateParam(9, IWorkbenchEnvironmentService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IKeybindingService),
  __decorateParam(13, ISecretStorageService),
  __decorateParam(14, IStorageService),
  __decorateParam(15, ILogService),
  __decorateParam(16, IActivityService),
  __decorateParam(17, IInstantiationService),
  __decorateParam(18, ICommandService),
  __decorateParam(19, ICodexAccountService),
  __decorateParam(20, IDefaultAccountService)
], SimpleAccountActivityActionViewItem);
let SimpleGlobalActivityActionViewItem = class extends GlobalActivityActionViewItem {
  constructor(hoverOptions, options, userDataProfileService, themeService, hoverService, menuService, contextMenuService, contextKeyService, configurationService, environmentService, keybindingService, instantiationService, activityService, storageService) {
    super(
      () => simpleActivityContextMenuActions(storageService, false),
      {
        ...options,
        colors: (theme) => ({
          badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
          badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND)
        }),
        hoverOptions,
        compact: true
      },
      () => void 0,
      userDataProfileService,
      themeService,
      hoverService,
      menuService,
      contextMenuService,
      contextKeyService,
      configurationService,
      environmentService,
      keybindingService,
      instantiationService,
      activityService
    );
  }
};
SimpleGlobalActivityActionViewItem = __decorateClass([
  __decorateParam(2, IUserDataProfileService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IMenuService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IWorkbenchEnvironmentService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, IActivityService),
  __decorateParam(13, IStorageService)
], SimpleGlobalActivityActionViewItem);
function simpleActivityContextMenuActions(storageService, isAccount) {
  const currentElementContextMenuActions = [];
  if (isAccount) {
    currentElementContextMenuActions.push(
      toAction({ id: "hideAccounts", label: localize("hideAccounts", "Hide Accounts"), run: () => setAccountsActionVisible(storageService, false) }),
      new Separator()
    );
  }
  return [
    ...currentElementContextMenuActions,
    toAction({ id: "toggle.hideAccounts", label: localize("accounts", "Accounts"), checked: isAccountsActionVisible(storageService), run: () => setAccountsActionVisible(storageService, !isAccountsActionVisible(storageService)) }),
    toAction({ id: "toggle.hideManage", label: localize("manage", "Manage"), checked: true, enabled: false, run: () => {
      throw new Error('"Manage" can not be hidden');
    } })
  ];
}
function isAccountsActionVisible(storageService) {
  return storageService.getBoolean(AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, StorageScope.PROFILE, true);
}
function setAccountsActionVisible(storageService, visible) {
  storageService.store(AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, visible, StorageScope.PROFILE, StorageTarget.USER);
}
export {
  AccountsActivityActionViewItem,
  GlobalActivityActionViewItem,
  GlobalCompositeBar,
  SimpleAccountActivityActionViewItem,
  SimpleGlobalActivityActionViewItem,
  isAccountsActionVisible
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxnbG9iYWxDb21wb3NpdGVCYXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvZ2xvYmFsQ29tcG9zaXRlQmFyLmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIsIEFjdGlvbnNPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEFDQ09VTlRTX0FDVElWSVRZX0lELCBHTE9CQUxfQUNUSVZJVFlfSUQgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgSUFjdGl2aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2FjdGl2aXR5L2NvbW1vbi9hY3Rpdml0eS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSwgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb21wb3NpdGVCYXJBY3Rpb25WaWV3SXRlbSwgQ29tcG9zaXRlQmFyQWN0aW9uLCBJQWN0aXZpdHlIb3Zlck9wdGlvbnMsIElDb21wb3NpdGVCYXJBY3Rpb25WaWV3SXRlbU9wdGlvbnMsIElDb21wb3NpdGVCYXJDb2xvcnMgfSBmcm9tICcuL2NvbXBvc2l0ZUJhckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSU1lbnUsIElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgYXBwZW5kLCBjbGVhck5vZGUsIGhpZGUsIHNob3csIEV2ZW50SGVscGVyLCAkLCBydW5XaGVuV2luZG93SWRsZSwgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUsIEdlc3R1cmVFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBBbmNob3JBbGlnbm1lbnQsIEFuY2hvckF4aXNBbGlnbm1lbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZWNyZXRTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3NlY3JldHMvY29tbW9uL3NlY3JldHMuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uSW5mbywgZ2V0Q3VycmVudEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8gfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBQ0NPVU5UU19BVkFUQVJfU0VUVElORywgQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCwgSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgSU5URVJOQUxfQVVUSF9QUk9WSURFUl9QUkVGSVggfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0lDT04gfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZUljb25zLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBBQ1RJVklUWV9CQVJfQkFER0VfQkFDS0dST1VORCwgQUNUSVZJVFlfQkFSX0JBREdFX0ZPUkVHUk9VTkQgfSBmcm9tICcuLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBXT1JLQkVOQ0hfTUVOVV9NT1RJT05fQ0xBU1MsIHdvcmtiZW5jaE1lbnVDbG9zZUFuaW1hdGlvbiB9IGZyb20gJy4uL2FjdGlvbnMvbWVudU1vdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb2RleEFjY291bnRNZW51QWN0aW9ucywgSUNvZGV4QWNjb3VudFNlcnZpY2UsIHNob3VsZFNob3dDb2RleEFjY291bnQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hZ2VudEhvc3QvYnJvd3Nlci9jb2RleEFjY291bnRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIEdsb2JhbENvbXBvc2l0ZUJhciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEFDQ09VTlRTX0FDVElPTl9JTkRFWCA9IDA7XG5cdHN0YXRpYyByZWFkb25seSBBQ0NPVU5UU19JQ09OID0gcmVnaXN0ZXJJY29uKCdhY2NvdW50cy12aWV3LWJhci1pY29uJywgQ29kaWNvbi5hY2NvdW50LCBsb2NhbGl6ZSgnYWNjb3VudHNWaWV3QmFySWNvbicsIFwiQWNjb3VudHMgaWNvbiBpbiB0aGUgdmlldyBiYXIuXCIpKTtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGdsb2JhbEFjdGl2aXR5QWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihHTE9CQUxfQUNUSVZJVFlfSUQpKTtcblx0cHJpdmF0ZSByZWFkb25seSBhY2NvdW50QWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihBQ0NPVU5UU19BQ1RJVklUWV9JRCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGdsb2JhbEFjdGl2aXR5QWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudUFjdGlvbnNQcm92aWRlcjogKCkgPT4gSUFjdGlvbltdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29sb3JzOiAodGhlbWU6IElDb2xvclRoZW1lKSA9PiBJQ29tcG9zaXRlQmFyQ29sb3JzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZpdHlIb3Zlck9wdGlvbnM6IElBY3Rpdml0eUhvdmVyT3B0aW9ucyxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmVsZW1lbnQgPSAkKCdkaXYnKTtcblx0XHRjb25zdCBjb250ZXh0TWVudUFsaWdubWVudE9wdGlvbnMgPSAoKSA9PiAoe1xuXHRcdFx0YW5jaG9yQWxpZ25tZW50OiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnd29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nKSA9PT0gJ2xlZnQnID8gQW5jaG9yQWxpZ25tZW50LlJJR0hUIDogQW5jaG9yQWxpZ25tZW50LkxFRlQsXG5cdFx0XHRhbmNob3JBeGlzQWxpZ25tZW50OiBBbmNob3JBeGlzQWxpZ25tZW50LkhPUklaT05UQUxcblx0XHR9KTtcblx0XHR0aGlzLmdsb2JhbEFjdGl2aXR5QWN0aW9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gR0xPQkFMX0FDVElWSVRZX0lEKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoR2xvYmFsQWN0aXZpdHlBY3Rpb25WaWV3SXRlbSwgdGhpcy5jb250ZXh0TWVudUFjdGlvbnNQcm92aWRlciwgeyAuLi5vcHRpb25zLCBjb2xvcnM6IHRoaXMuY29sb3JzLCBob3Zlck9wdGlvbnM6IHRoaXMuYWN0aXZpdHlIb3Zlck9wdGlvbnMgfSwgY29udGV4dE1lbnVBbGlnbm1lbnRPcHRpb25zKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IEFDQ09VTlRTX0FDVElWSVRZX0lEKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWNjb3VudHNBY3Rpdml0eUFjdGlvblZpZXdJdGVtLFxuXHRcdFx0XHRcdFx0dGhpcy5jb250ZXh0TWVudUFjdGlvbnNQcm92aWRlcixcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0XHRcdFx0Y29sb3JzOiB0aGlzLmNvbG9ycyxcblx0XHRcdFx0XHRcdFx0aG92ZXJPcHRpb25zOiB0aGlzLmFjdGl2aXR5SG92ZXJPcHRpb25zXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Y29udGV4dE1lbnVBbGlnbm1lbnRPcHRpb25zLFxuXHRcdFx0XHRcdFx0KGFjdGlvbnM6IElBY3Rpb25bXSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRhY3Rpb25zLnVuc2hpZnQoLi4uW1xuXHRcdFx0XHRcdFx0XHRcdHRvQWN0aW9uKHsgaWQ6ICdoaWRlQWNjb3VudHMnLCBsYWJlbDogbG9jYWxpemUoJ2hpZGVBY2NvdW50cycsIFwiSGlkZSBBY2NvdW50c1wiKSwgcnVuOiAoKSA9PiBzZXRBY2NvdW50c0FjdGlvblZpc2libGUoc3RvcmFnZVNlcnZpY2UsIGZhbHNlKSB9KSxcblx0XHRcdFx0XHRcdFx0XHRuZXcgU2VwYXJhdG9yKClcblx0XHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gdmlldyBpdGVtIGZvciBhY3Rpb24gJyR7YWN0aW9uLmlkfSdgKTtcblx0XHRcdH0sXG5cdFx0XHRvcmllbnRhdGlvbjogQWN0aW9uc09yaWVudGF0aW9uLlZFUlRJQ0FMLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnbWFuYWdlJywgXCJNYW5hZ2VcIiksXG5cdFx0XHRwcmV2ZW50TG9vcE5hdmlnYXRpb246IHRydWVcblx0XHR9KSk7XG5cblx0XHRpZiAodGhpcy5hY2NvdW50c1Zpc2liaWxpdHlQcmVmZXJlbmNlKSB7XG5cdFx0XHR0aGlzLmdsb2JhbEFjdGl2aXR5QWN0aW9uQmFyLnB1c2godGhpcy5hY2NvdW50QWN0aW9uLCB7IGluZGV4OiBHbG9iYWxDb21wb3NpdGVCYXIuQUNDT1VOVFNfQUNUSU9OX0lOREVYIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuZ2xvYmFsQWN0aXZpdHlBY3Rpb25CYXIucHVzaCh0aGlzLmdsb2JhbEFjdGl2aXR5QWN0aW9uKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuUFJPRklMRSwgQWNjb3VudHNBY3Rpdml0eUFjdGlvblZpZXdJdGVtLkFDQ09VTlRTX1ZJU0lCSUxJVFlfUFJFRkVSRU5DRV9LRVksIHRoaXMuX3N0b3JlKSgoKSA9PiB0aGlzLnRvZ2dsZUFjY291bnRzQWN0aXZpdHkoKSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Y3JlYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50KTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuZ2xvYmFsQWN0aXZpdHlBY3Rpb25CYXIuZm9jdXModHJ1ZSk7XG5cdH1cblxuXHRzaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZ2xvYmFsQWN0aXZpdHlBY3Rpb25CYXIudmlld0l0ZW1zLmxlbmd0aDtcblx0fVxuXG5cdGdldENvbnRleHRNZW51QWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdHJldHVybiBbdG9BY3Rpb24oeyBpZDogJ3RvZ2dsZUFjY291bnRzVmlzaWJpbGl0eScsIGxhYmVsOiBsb2NhbGl6ZSgnYWNjb3VudHMnLCBcIkFjY291bnRzXCIpLCBjaGVja2VkOiB0aGlzLmFjY291bnRzVmlzaWJpbGl0eVByZWZlcmVuY2UsIHJ1bjogKCkgPT4gdGhpcy5hY2NvdW50c1Zpc2liaWxpdHlQcmVmZXJlbmNlID0gIXRoaXMuYWNjb3VudHNWaXNpYmlsaXR5UHJlZmVyZW5jZSB9KV07XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZUFjY291bnRzQWN0aXZpdHkoKSB7XG5cdFx0aWYgKHRoaXMuZ2xvYmFsQWN0aXZpdHlBY3Rpb25CYXIubGVuZ3RoKCkgPT09IDIgJiYgdGhpcy5hY2NvdW50c1Zpc2liaWxpdHlQcmVmZXJlbmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmdsb2JhbEFjdGl2aXR5QWN0aW9uQmFyLmxlbmd0aCgpID09PSAyKSB7XG5cdFx0XHR0aGlzLmdsb2JhbEFjdGl2aXR5QWN0aW9uQmFyLnB1bGwoR2xvYmFsQ29tcG9zaXRlQmFyLkFDQ09VTlRTX0FDVElPTl9JTkRFWCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZ2xvYmFsQWN0aXZpdHlBY3Rpb25CYXIucHVzaCh0aGlzLmFjY291bnRBY3Rpb24sIHsgaW5kZXg6IEdsb2JhbENvbXBvc2l0ZUJhci5BQ0NPVU5UU19BQ1RJT05fSU5ERVggfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgYWNjb3VudHNWaXNpYmlsaXR5UHJlZmVyZW5jZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNBY2NvdW50c0FjdGlvblZpc2libGUodGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIHNldCBhY2NvdW50c1Zpc2liaWxpdHlQcmVmZXJlbmNlKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0c2V0QWNjb3VudHNBY3Rpb25WaXNpYmxlKHRoaXMuc3RvcmFnZVNlcnZpY2UsIHZhbHVlKTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEdsb2JhbEFjdGl2aXR5QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBDb21wb3NpdGVCYXJBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtZW51SWQ6IE1lbnVJZCxcblx0XHRhY3Rpb246IENvbXBvc2l0ZUJhckFjdGlvbixcblx0XHRvcHRpb25zOiBJQ29tcG9zaXRlQmFyQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVBY3Rpb25zUHJvdmlkZXI6ICgpID0+IElBY3Rpb25bXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51QWxpZ25tZW50T3B0aW9uczogKCkgPT4gUmVhZG9ubHk8eyBhbmNob3JBbGlnbm1lbnQ6IEFuY2hvckFsaWdubWVudDsgYW5jaG9yQXhpc0FsaWdubWVudDogQW5jaG9yQXhpc0FsaWdubWVudCB9PiB8IHVuZGVmaW5lZCxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIG92ZXJyaWRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQWN0aXZpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWN0aXZpdHlTZXJ2aWNlOiBJQWN0aXZpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhY3Rpb24sIHsgZHJhZ2dhYmxlOiBmYWxzZSwgaWNvbjogdHJ1ZSwgaGFzUG9wdXA6IHRydWUsIC4uLm9wdGlvbnMgfSwgKCkgPT4gdHJ1ZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSk7XG5cblx0XHR0aGlzLnVwZGF0ZUl0ZW1BY3Rpdml0eSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWN0aXZpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZpdHkodmlld0NvbnRhaW5lck9yQWN0aW9uID0+IHtcblx0XHRcdGlmIChpc1N0cmluZyh2aWV3Q29udGFpbmVyT3JBY3Rpb24pICYmIHZpZXdDb250YWluZXJPckFjdGlvbiA9PT0gdGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmlkKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlSXRlbUFjdGl2aXR5KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJdGVtQWN0aXZpdHkoKTogdm9pZCB7XG5cdFx0KHRoaXMuYWN0aW9uIGFzIENvbXBvc2l0ZUJhckFjdGlvbikuYWN0aXZpdGllcyA9IHRoaXMuYWN0aXZpdHlTZXJ2aWNlLmdldEFjdGl2aXR5KHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCBFdmVudFR5cGUuTU9VU0VfRE9XTiwgYXN5bmMgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRjb25zdCBpc0xlZnRDbGljayA9IGU/LmJ1dHRvbiAhPT0gMjtcblx0XHRcdC8vIExlZnQtY2xpY2sgcnVuXG5cdFx0XHRpZiAoaXNMZWZ0Q2xpY2spIHtcblx0XHRcdFx0dGhpcy5ydW4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBUaGUgcmVzdCBvZiB0aGUgYWN0aXZpdHkgYmFyIHVzZXMgY29udGV4dCBtZW51IGV2ZW50IGZvciB0aGUgY29udGV4dCBtZW51LCBzbyB3ZSBtYXRjaCB0aGlzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCBFdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBhc3luYyAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0Ly8gTGV0IHRoZSBpdGVtIGRlY2lkZSBvbiB0aGUgY29udGV4dCBtZW51IGluc3RlYWQgb2YgdGhlIHRvb2xiYXJcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IHRoaXMucmVzb2x2ZUNvbnRleHRNZW51QWN0aW9ucyhkaXNwb3NhYmxlcyk7XG5cblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3codGhpcy5jb250YWluZXIpLCBlKTtcblxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdFx0Z2V0TWVudUNsYXNzTmFtZTogKCkgPT4gV09SS0JFTkNIX01FTlVfTU9USU9OX0NMQVNTLFxuXHRcdFx0XHRvbkhpZGU6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSxcblx0XHRcdFx0Y2xvc2VBbmltYXRpb246IHdvcmtiZW5jaE1lbnVDbG9zZUFuaW1hdGlvblxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCBFdmVudFR5cGUuS0VZX1VQLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5ydW4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsIFRvdWNoRXZlbnRUeXBlLlRhcCwgKGU6IEdlc3R1cmVFdmVudCkgPT4ge1xuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdHRoaXMucnVuKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHJlc29sdmVDb250ZXh0TWVudUFjdGlvbnMoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8SUFjdGlvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGV4dE1lbnVBY3Rpb25zUHJvdmlkZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG1lbnUgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KHRoaXMubWVudUlkLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IHRoaXMucmVzb2x2ZU1haW5NZW51QWN0aW9ucyhtZW51LCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgeyBhbmNob3JBbGlnbm1lbnQsIGFuY2hvckF4aXNBbGlnbm1lbnQgfSA9IHRoaXMuY29udGV4dE1lbnVBbGlnbm1lbnRPcHRpb25zKCkgPz8geyBhbmNob3JBbGlnbm1lbnQ6IHVuZGVmaW5lZCwgYW5jaG9yQXhpc0FsaWdubWVudDogdW5kZWZpbmVkIH07XG5cblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiB0aGlzLmxhYmVsLFxuXHRcdFx0YW5jaG9yQWxpZ25tZW50LFxuXHRcdFx0YW5jaG9yQXhpc0FsaWdubWVudCxcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRnZXRNZW51Q2xhc3NOYW1lOiAoKSA9PiBXT1JLQkVOQ0hfTUVOVV9NT1RJT05fQ0xBU1MsXG5cdFx0XHRvbkhpZGU6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSxcblx0XHRcdG1lbnVBY3Rpb25PcHRpb25zOiB7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSxcblx0XHRcdGNsb3NlQW5pbWF0aW9uOiB3b3JrYmVuY2hNZW51Q2xvc2VBbmltYXRpb25cblx0XHR9KTtcblxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHJlc29sdmVNYWluTWVudUFjdGlvbnMobWVudTogSU1lbnUsIF9kaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmUpOiBQcm9taXNlPElBY3Rpb25bXT4ge1xuXHRcdHJldHVybiBnZXRBY3Rpb25CYXJBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucyh7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSkpLnNlY29uZGFyeTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWNjb3VudHNBY3Rpdml0eUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQWJzdHJhY3RHbG9iYWxBY3Rpdml0eUFjdGlvblZpZXdJdGVtIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQUNDT1VOVFNfVklTSUJJTElUWV9QUkVGRVJFTkNFX0tFWSA9ICd3b3JrYmVuY2guYWN0aXZpdHkuc2hvd0FjY291bnRzJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGdyb3VwZWRBY2NvdW50czogTWFwPHN0cmluZywgKEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQgJiB7IGNhblNpZ25PdXQ6IGJvb2xlYW4gfSlbXT4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvYmxlbWF0aWNQcm92aWRlcnM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXG5cdHByaXZhdGUgaW5pdGlhbGl6ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBzZXNzaW9uRnJvbUVtYmVkZGVyID0gbmV3IExhenk8UHJvbWlzZTxBdXRoZW50aWNhdGlvblNlc3Npb25JbmZvIHwgdW5kZWZpbmVkPj4oKCkgPT4gZ2V0Q3VycmVudEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8odGhpcy5zZWNyZXRTdG9yYWdlU2VydmljZSwgdGhpcy5wcm9kdWN0U2VydmljZSkpO1xuXHRwcml2YXRlIGF2YXRhckltZzogSFRNTEltYWdlRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250ZXh0TWVudUFjdGlvbnNQcm92aWRlcjogKCkgPT4gSUFjdGlvbltdLFxuXHRcdG9wdGlvbnM6IElDb21wb3NpdGVCYXJBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0Y29udGV4dE1lbnVBbGlnbm1lbnRPcHRpb25zOiAoKSA9PiBSZWFkb25seTx7IGFuY2hvckFsaWdubWVudDogQW5jaG9yQWxpZ25tZW50OyBhbmNob3JBeGlzQWxpZ25tZW50OiBBbmNob3JBeGlzQWxpZ25tZW50IH0+IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsbENvbnRleHRNZW51QWN0aW9uczogKGFjdGlvbnM6IElBY3Rpb25bXSkgPT4gdm9pZCxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZWNyZXRTdG9yYWdlU2VydmljZTogSVNlY3JldFN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQWN0aXZpdHlTZXJ2aWNlIGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb2RleEFjY291bnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZXhBY2NvdW50U2VydmljZTogSUNvZGV4QWNjb3VudFNlcnZpY2UsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbXBvc2l0ZUJhckFjdGlvbiwge1xuXHRcdFx0aWQ6IEFDQ09VTlRTX0FDVElWSVRZX0lELFxuXHRcdFx0bmFtZTogbG9jYWxpemUoJ2FjY291bnRzJywgXCJBY2NvdW50c1wiKSxcblx0XHRcdGNsYXNzTmFtZXM6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KEdsb2JhbENvbXBvc2l0ZUJhci5BQ0NPVU5UU19JQ09OKVxuXHRcdH0pO1xuXHRcdHN1cGVyKE1lbnVJZC5BY2NvdW50c0NvbnRleHQsIGFjdGlvbiwgb3B0aW9ucywgY29udGV4dE1lbnVBY3Rpb25zUHJvdmlkZXIsIGNvbnRleHRNZW51QWxpZ25tZW50T3B0aW9ucywgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UsIG1lbnVTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGFjdGl2aXR5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uKTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy5pbml0aWFsaXplKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkUmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLmFkZEFjY291bnRzRnJvbVByb3ZpZGVyKGUuaWQpO1xuXHRcdFx0dGhpcy51cGRhdGVBdmF0YXIoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZFVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKChlKSA9PiB7XG5cdFx0XHR0aGlzLmdyb3VwZWRBY2NvdW50cy5kZWxldGUoZS5pZCk7XG5cdFx0XHR0aGlzLnByb2JsZW1hdGljUHJvdmlkZXJzLmRlbGV0ZShlLmlkKTtcblx0XHRcdHRoaXMudXBkYXRlQXZhdGFyKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyhhc3luYyBlID0+IHtcblx0XHRcdGlmIChlLmV2ZW50LnJlbW92ZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCByZW1vdmVkIG9mIGUuZXZlbnQucmVtb3ZlZCkge1xuXHRcdFx0XHRcdHRoaXMucmVtb3ZlQWNjb3VudChlLnByb3ZpZGVySWQsIHJlbW92ZWQuYWNjb3VudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgY2hhbmdlZCBvZiBbLi4uKGUuZXZlbnQuY2hhbmdlZCA/PyBbXSksIC4uLihlLmV2ZW50LmFkZGVkID8/IFtdKV0pIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmFkZE9yVXBkYXRlQWNjb3VudChlLnByb3ZpZGVySWQsIGNoYW5nZWQuYWNjb3VudCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMudXBkYXRlQXZhdGFyKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBQ0NPVU5UU19BVkFUQVJfU0VUVElORykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVBdmF0YXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50KCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlQXZhdGFyKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gVGhpcyBmdW5jdGlvbiBleGlzdHMgdG8gZW5zdXJlIHRoYXQgdGhlIGFjY291bnRzIGFyZSBhZGRlZCBmb3IgYXV0aCBwcm92aWRlcnMgdGhhdCBoYWQgYWxyZWFkeSBiZWVuIHJlZ2lzdGVyZWRcblx0Ly8gYmVmb3JlIHRoZSBtZW51IHdhcyBjcmVhdGVkLlxuXHRwcml2YXRlIGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gUmVzb2x2aW5nIHRoZSBtZW51IGRvZXNuJ3QgbmVlZCB0byBoYXBwZW4gaW1tZWRpYXRlbHksIHNvIHdlIGNhbiB3YWl0IHVudGlsIGFmdGVyIHRoZSB3b3JrYmVuY2ggaGFzIGJlZW4gcmVzdG9yZWRcblx0XHQvLyBhbmQgb25seSBydW4gdGhpcyB3aGVuIHRoZSBzeXN0ZW0gaXMgaWRsZS5cblx0XHRhd2FpdCB0aGlzLmxpZmVjeWNsZVNlcnZpY2Uud2hlbihMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKHJ1bldoZW5XaW5kb3dJZGxlKGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvSW5pdGlhbGl6ZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0luaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJJZHMgPSB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcklkcygpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQocHJvdmlkZXJJZHMubWFwKHByb3ZpZGVySWQgPT4gdGhpcy5hZGRBY2NvdW50c0Zyb21Qcm92aWRlcihwcm92aWRlcklkKSkpO1xuXG5cdFx0Ly8gTG9nIGFueSBlcnJvcnMgdGhhdCBvY2N1cnJlZCB3aGlsZSBpbml0aWFsaXppbmcuIFdlIHRyeSB0byBiZSBiZXN0IGVmZm9ydCBoZXJlIHRvIHNob3cgdGhlIG1vc3QgYW1vdW50IG9mIGFjY291bnRzXG5cdFx0Zm9yIChjb25zdCByZXN1bHQgb2YgcmVzdWx0cykge1xuXHRcdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdyZWplY3RlZCcpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKHJlc3VsdC5yZWFzb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuaW5pdGlhbGl6ZWQgPSB0cnVlO1xuXHRcdHRoaXMudXBkYXRlQXZhdGFyKCk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXG5cdFx0dGhpcy5hdmF0YXJJbWcgPSAkKCdpbWcuYWNjb3VudHMtYXZhdGFyJykgYXMgSFRNTEltYWdlRWxlbWVudDtcblx0XHR0aGlzLmF2YXRhckltZy5hbHQgPSAnJztcblx0XHR0aGlzLmF2YXRhckltZy5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHR0aGlzLmF2YXRhckltZy5kcmFnZ2FibGUgPSBmYWxzZTtcblx0XHR0aGlzLmF2YXRhckltZy5yZWZlcnJlclBvbGljeSA9ICduby1yZWZlcnJlcic7XG5cdFx0dGhpcy5hdmF0YXJJbWcuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLmF2YXRhckltZy5vbmVycm9yID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5hdmF0YXJJbWchLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLmxhYmVsLmNsYXNzTGlzdC5yZW1vdmUoJ2hhcy1hdmF0YXInKTtcblx0XHR9O1xuXHRcdGFwcGVuZCh0aGlzLmxhYmVsLCB0aGlzLmF2YXRhckltZyk7XG5cblx0XHR0aGlzLnVwZGF0ZUF2YXRhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBdmF0YXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmF2YXRhckltZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBhdmF0YXJJY29uOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQUNDT1VOVFNfQVZBVEFSX1NFVFRJTkcpKSB7XG5cdFx0XHRhdmF0YXJJY29uID0gdGhpcy5nZXREZWZhdWx0QWNjb3VudEF2YXRhckljb24oKTtcblx0XHRcdGlmICghYXZhdGFySWNvbikge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGFjY291bnRzIG9mIHRoaXMuZ3JvdXBlZEFjY291bnRzLnZhbHVlcygpKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBhY2NvdW50IG9mIGFjY291bnRzKSB7XG5cdFx0XHRcdFx0XHRpZiAoYWNjb3VudC5pY29uKSB7XG5cdFx0XHRcdFx0XHRcdGF2YXRhckljb24gPSBhY2NvdW50Lmljb247XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoYXZhdGFySWNvbikge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGF2YXRhckljb24pIHtcblx0XHRcdHRoaXMuYXZhdGFySW1nLnNyYyA9IEZpbGVBY2Nlc3MudXJpVG9Ccm93c2VyVXJpKGF2YXRhckljb24pLnRvU3RyaW5nKHRydWUpO1xuXHRcdFx0dGhpcy5hdmF0YXJJbWcuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QuYWRkKCdoYXMtYXZhdGFyJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYXZhdGFySW1nLnJlbW92ZUF0dHJpYnV0ZSgnc3JjJyk7XG5cdFx0XHR0aGlzLmF2YXRhckltZy5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtYXZhdGFyJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXREZWZhdWx0QWNjb3VudEF2YXRhckljb24oKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjdXJyZW50RGVmYXVsdEFjY291bnQgPSB0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5jdXJyZW50RGVmYXVsdEFjY291bnQ7XG5cdFx0aWYgKCFjdXJyZW50RGVmYXVsdEFjY291bnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWNjb3VudHMgPSB0aGlzLmdyb3VwZWRBY2NvdW50cy5nZXQoY3VycmVudERlZmF1bHRBY2NvdW50LmF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuaWQpO1xuXHRcdHJldHVybiBhY2NvdW50cz8uZmluZChhY2NvdW50ID0+IGFjY291bnQubGFiZWwgPT09IGN1cnJlbnREZWZhdWx0QWNjb3VudC5hY2NvdW50TmFtZSk/Lmljb247XG5cdH1cblxuXHQvLyNyZWdpb24gb3ZlcnJpZGVzXG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIHJlc29sdmVNYWluTWVudUFjdGlvbnMoYWNjb3VudHNNZW51OiBJTWVudSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8SUFjdGlvbltdPiB7XG5cdFx0YXdhaXQgc3VwZXIucmVzb2x2ZU1haW5NZW51QWN0aW9ucyhhY2NvdW50c01lbnUsIGRpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVycyA9IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVySWRzKCkuZmlsdGVyKHAgPT4gIXAuc3RhcnRzV2l0aChJTlRFUk5BTF9BVVRIX1BST1ZJREVSX1BSRUZJWCkpO1xuXHRcdGNvbnN0IG90aGVyQ29tbWFuZHMgPSBhY2NvdW50c01lbnUuZ2V0QWN0aW9ucygpO1xuXHRcdGxldCBtZW51czogSUFjdGlvbltdID0gW107XG5cblx0XHRjb25zdCByZWdpc3RlcmVkUHJvdmlkZXJzID0gcHJvdmlkZXJzLmZpbHRlcihwcm92aWRlcklkID0+ICF0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5pc0R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVySWQpKTtcblx0XHRjb25zdCBkeW5hbWljUHJvdmlkZXJzID0gcHJvdmlkZXJzLmZpbHRlcihwcm92aWRlcklkID0+IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmlzRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXJJZCkpO1xuXG5cdFx0aWYgKCF0aGlzLmluaXRpYWxpemVkKSB7XG5cdFx0XHRjb25zdCBub0FjY291bnRzQXZhaWxhYmxlQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oJ25vQWNjb3VudHNBdmFpbGFibGUnLCBsb2NhbGl6ZSgnbG9hZGluZycsIFwiTG9hZGluZy4uLlwiKSwgdW5kZWZpbmVkLCBmYWxzZSkpO1xuXHRcdFx0bWVudXMucHVzaChub0FjY291bnRzQXZhaWxhYmxlQWN0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBwcm92aWRlcklkIG9mIHJlZ2lzdGVyZWRQcm92aWRlcnMpIHtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRcdFx0Y29uc3QgYWNjb3VudHMgPSB0aGlzLmdyb3VwZWRBY2NvdW50cy5nZXQocHJvdmlkZXJJZCk7XG5cdFx0XHRcdGlmICghYWNjb3VudHMpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5wcm9ibGVtYXRpY1Byb3ZpZGVycy5oYXMocHJvdmlkZXJJZCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyVW5hdmFpbGFibGVBY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbigncHJvdmlkZXJVbmF2YWlsYWJsZScsIGxvY2FsaXplKCdhdXRoUHJvdmlkZXJVbmF2YWlsYWJsZScsICd7MH0gaXMgY3VycmVudGx5IHVuYXZhaWxhYmxlJywgcHJvdmlkZXIubGFiZWwpLCB1bmRlZmluZWQsIGZhbHNlKSk7XG5cdFx0XHRcdFx0XHRtZW51cy5wdXNoKHByb3ZpZGVyVW5hdmFpbGFibGVBY3Rpb24pO1xuXHRcdFx0XHRcdFx0Ly8gdHJ5IGFnYWluIGluIHRoZSBiYWNrZ3JvdW5kIHNvIHRoYXQgaWYgdGhlIGZhaWx1cmUgd2FzIGludGVybWl0dGVudCwgd2UgY2FuIHJlc29sdmUgaXQgb24gdGhlIG5leHQgc2hvd2luZyBvZiB0aGUgbWVudVxuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5hZGRBY2NvdW50c0Zyb21Qcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNhblVzZU1jcCA9ICEhcHJvdmlkZXIuYXV0aG9yaXphdGlvblNlcnZlcnM/Lmxlbmd0aDtcblx0XHRcdFx0Zm9yIChjb25zdCBhY2NvdW50IG9mIGFjY291bnRzKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWFuYWdlRXh0ZW5zaW9uc0FjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdGlkOiBgY29uZmlndXJlU2Vzc2lvbnMke2FjY291bnQubGFiZWx9YCxcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWFuYWdlVHJ1c3RlZEV4dGVuc2lvbnMnLCBcIk1hbmFnZSBUcnVzdGVkIEV4dGVuc2lvbnNcIiksXG5cdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfbWFuYWdlVHJ1c3RlZEV4dGVuc2lvbnNGb3JBY2NvdW50JywgeyBwcm92aWRlcklkLCBhY2NvdW50TGFiZWw6IGFjY291bnQubGFiZWwgfSlcblx0XHRcdFx0XHR9KTtcblxuXG5cdFx0XHRcdFx0Y29uc3QgcHJvdmlkZXJTdWJNZW51QWN0aW9uczogSUFjdGlvbltdID0gW21hbmFnZUV4dGVuc2lvbnNBY3Rpb25dO1xuXHRcdFx0XHRcdGlmIChjYW5Vc2VNY3ApIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1hbmFnZU1DUEFjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0aWQ6IGBjb25maWd1cmVTZXNzaW9ucyR7YWNjb3VudC5sYWJlbH1gLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21hbmFnZVRydXN0ZWRNQ1BTZXJ2ZXJzJywgXCJNYW5hZ2UgVHJ1c3RlZCBNQ1AgU2VydmVyc1wiKSxcblx0XHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfbWFuYWdlVHJ1c3RlZE1DUFNlcnZlcnNGb3JBY2NvdW50JywgeyBwcm92aWRlcklkLCBhY2NvdW50TGFiZWw6IGFjY291bnQubGFiZWwgfSlcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0cHJvdmlkZXJTdWJNZW51QWN0aW9ucy5wdXNoKG1hbmFnZU1DUEFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChhY2NvdW50LmNhblNpZ25PdXQpIHtcblx0XHRcdFx0XHRcdHByb3ZpZGVyU3ViTWVudUFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRcdGlkOiAnc2lnbk91dCcsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2lnbk91dCcsIFwiU2lnbiBPdXRcIiksXG5cdFx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnX3NpZ25PdXRPZkFjY291bnQnLCB7IHByb3ZpZGVySWQsIGFjY291bnRMYWJlbDogYWNjb3VudC5sYWJlbCB9KVxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyU3ViTWVudSA9IG5ldyBTdWJtZW51QWN0aW9uKCdhY3Rpdml0eWJhci5zdWJtZW51JywgYCR7YWNjb3VudC5sYWJlbH0gKCR7cHJvdmlkZXIubGFiZWx9KWAsIHByb3ZpZGVyU3ViTWVudUFjdGlvbnMpO1xuXHRcdFx0XHRcdG1lbnVzLnB1c2gocHJvdmlkZXJTdWJNZW51KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZHluYW1pY1Byb3ZpZGVycy5sZW5ndGggJiYgcmVnaXN0ZXJlZFByb3ZpZGVycy5sZW5ndGgpIHtcblx0XHRcdFx0bWVudXMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVySWQgb2YgZHluYW1pY1Byb3ZpZGVycykge1xuXHRcdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVyKHByb3ZpZGVySWQpO1xuXHRcdFx0XHRjb25zdCBhY2NvdW50cyA9IHRoaXMuZ3JvdXBlZEFjY291bnRzLmdldChwcm92aWRlcklkKTtcblx0XHRcdFx0Ly8gUHJvdmlkZSBfc29tZV8gZGlzY292ZXJhYmxlIHdheSB0byBtYW5hZ2UgZHluYW1pYyBhdXRoZW50aWNhdGlvbiBwcm92aWRlcnMuXG5cdFx0XHRcdC8vIFRoaXMgd2lsbCBlaXRoZXIgc2hvdyB1cCBpbnNpZGUgdGhlIGFjY291bnQgc3VibWVudSBvciBhcyBhIHRvcC1sZXZlbCBtZW51IGl0ZW0gaWYgdGhlcmVcblx0XHRcdFx0Ly8gYXJlIG5vIGFjY291bnRzLlxuXHRcdFx0XHRjb25zdCBtYW5hZ2VEeW5hbWljQXV0aFByb3ZpZGVyc0FjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdFx0XHRpZDogJ21hbmFnZUR5bmFtaWNBdXRoUHJvdmlkZXJzJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21hbmFnZUR5bmFtaWNBdXRoUHJvdmlkZXJzJywgXCJNYW5hZ2UgRHluYW1pYyBBdXRoZW50aWNhdGlvbiBQcm92aWRlcnMuLi5cIiksXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ucmVtb3ZlRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzJylcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghYWNjb3VudHMpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5wcm9ibGVtYXRpY1Byb3ZpZGVycy5oYXMocHJvdmlkZXJJZCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyVW5hdmFpbGFibGVBY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbigncHJvdmlkZXJVbmF2YWlsYWJsZScsIGxvY2FsaXplKCdhdXRoUHJvdmlkZXJVbmF2YWlsYWJsZScsICd7MH0gaXMgY3VycmVudGx5IHVuYXZhaWxhYmxlJywgcHJvdmlkZXIubGFiZWwpLCB1bmRlZmluZWQsIGZhbHNlKSk7XG5cdFx0XHRcdFx0XHRtZW51cy5wdXNoKHByb3ZpZGVyVW5hdmFpbGFibGVBY3Rpb24pO1xuXHRcdFx0XHRcdFx0Ly8gdHJ5IGFnYWluIGluIHRoZSBiYWNrZ3JvdW5kIHNvIHRoYXQgaWYgdGhlIGZhaWx1cmUgd2FzIGludGVybWl0dGVudCwgd2UgY2FuIHJlc29sdmUgaXQgb24gdGhlIG5leHQgc2hvd2luZyBvZiB0aGUgbWVudVxuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5hZGRBY2NvdW50c0Zyb21Qcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtZW51cy5wdXNoKG1hbmFnZUR5bmFtaWNBdXRoUHJvdmlkZXJzQWN0aW9uKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgYWNjb3VudCBvZiBhY2NvdW50cykge1xuXHRcdFx0XHRcdC8vIFRPRE9AVHlsZXJMZW9uaGFyZHQ6IElzIHRoZXJlIGEgbmljZSB3YXkgdG8gYnJpbmcgdGhpcyBiYWNrP1xuXHRcdFx0XHRcdC8vIGNvbnN0IG1hbmFnZUV4dGVuc2lvbnNBY3Rpb24gPSB0b0FjdGlvbih7XG5cdFx0XHRcdFx0Ly8gXHRpZDogYGNvbmZpZ3VyZVNlc3Npb25zJHthY2NvdW50LmxhYmVsfWAsXG5cdFx0XHRcdFx0Ly8gXHRsYWJlbDogbG9jYWxpemUoJ21hbmFnZVRydXN0ZWRFeHRlbnNpb25zJywgXCJNYW5hZ2UgVHJ1c3RlZCBFeHRlbnNpb25zXCIpLFxuXHRcdFx0XHRcdC8vIFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHQvLyBcdHJ1bjogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnX21hbmFnZVRydXN0ZWRFeHRlbnNpb25zRm9yQWNjb3VudCcsIHsgcHJvdmlkZXJJZCwgYWNjb3VudExhYmVsOiBhY2NvdW50LmxhYmVsIH0pXG5cdFx0XHRcdFx0Ly8gfSk7XG5cblx0XHRcdFx0XHRjb25zdCBwcm92aWRlclN1Yk1lbnVBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRcdFx0XHRjb25zdCBtYW5hZ2VNQ1BBY3Rpb24gPSB0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRpZDogYGNvbmZpZ3VyZVNlc3Npb25zJHthY2NvdW50LmxhYmVsfWAsXG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21hbmFnZVRydXN0ZWRNQ1BTZXJ2ZXJzJywgXCJNYW5hZ2UgVHJ1c3RlZCBNQ1AgU2VydmVyc1wiKSxcblx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ19tYW5hZ2VUcnVzdGVkTUNQU2VydmVyc0ZvckFjY291bnQnLCB7IHByb3ZpZGVySWQsIGFjY291bnRMYWJlbDogYWNjb3VudC5sYWJlbCB9KVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHByb3ZpZGVyU3ViTWVudUFjdGlvbnMucHVzaChtYW5hZ2VNQ1BBY3Rpb24pO1xuXHRcdFx0XHRcdHByb3ZpZGVyU3ViTWVudUFjdGlvbnMucHVzaChtYW5hZ2VEeW5hbWljQXV0aFByb3ZpZGVyc0FjdGlvbik7XG5cdFx0XHRcdFx0aWYgKGFjY291bnQuY2FuU2lnbk91dCkge1xuXHRcdFx0XHRcdFx0cHJvdmlkZXJTdWJNZW51QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0aWQ6ICdzaWduT3V0Jyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaWduT3V0JywgXCJTaWduIE91dFwiKSxcblx0XHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfc2lnbk91dE9mQWNjb3VudCcsIHsgcHJvdmlkZXJJZCwgYWNjb3VudExhYmVsOiBhY2NvdW50LmxhYmVsIH0pXG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcHJvdmlkZXJTdWJNZW51ID0gbmV3IFN1Ym1lbnVBY3Rpb24oJ2FjdGl2aXR5YmFyLnN1Ym1lbnUnLCBgJHthY2NvdW50LmxhYmVsfSAoJHtwcm92aWRlci5sYWJlbH0pYCwgcHJvdmlkZXJTdWJNZW51QWN0aW9ucyk7XG5cdFx0XHRcdFx0bWVudXMucHVzaChwcm92aWRlclN1Yk1lbnUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29kZXhBY2NvdW50QWN0aW9ucyA9IGNyZWF0ZUNvZGV4QWNjb3VudE1lbnVBY3Rpb25zKHRoaXMuY29kZXhBY2NvdW50U2VydmljZSwgc2hvdWxkU2hvd0NvZGV4QWNjb3VudCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBmYWxzZSkpO1xuXHRcdGlmIChjb2RleEFjY291bnRBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0aWYgKG1lbnVzLmxlbmd0aCkge1xuXHRcdFx0XHRtZW51cy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBjb2RleEFjY291bnRBY3Rpb25zKSB7XG5cdFx0XHRcdG1lbnVzLnB1c2goYWN0aW9uIGluc3RhbmNlb2YgQWN0aW9uID8gZGlzcG9zYWJsZXMuYWRkKGFjdGlvbikgOiBhY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChtZW51cy5sZW5ndGggJiYgb3RoZXJDb21tYW5kcy5sZW5ndGgpIHtcblx0XHRcdG1lbnVzLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHR9XG5cblx0XHRvdGhlckNvbW1hbmRzLmZvckVhY2goKGdyb3VwLCBpKSA9PiB7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gZ3JvdXBbMV07XG5cdFx0XHRtZW51cyA9IG1lbnVzLmNvbmNhdChhY3Rpb25zKTtcblx0XHRcdGlmIChpICE9PSBvdGhlckNvbW1hbmRzLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0bWVudXMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIG1lbnVzO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIHJlc29sdmVDb250ZXh0TWVudUFjdGlvbnMoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8SUFjdGlvbltdPiB7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IHN1cGVyLnJlc29sdmVDb250ZXh0TWVudUFjdGlvbnMoZGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMuZmlsbENvbnRleHRNZW51QWN0aW9ucyhhY3Rpb25zKTtcblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBncm91cGVkQWNjb3VudHMgaGVscGVyc1xuXG5cdHByaXZhdGUgYXN5bmMgYWRkT3JVcGRhdGVBY2NvdW50KHByb3ZpZGVySWQ6IHN0cmluZywgYWNjb3VudDogQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBhY2NvdW50cyA9IHRoaXMuZ3JvdXBlZEFjY291bnRzLmdldChwcm92aWRlcklkKTtcblx0XHRpZiAoIWFjY291bnRzKSB7XG5cdFx0XHRhY2NvdW50cyA9IFtdO1xuXHRcdFx0dGhpcy5ncm91cGVkQWNjb3VudHMuc2V0KHByb3ZpZGVySWQsIGFjY291bnRzKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uRnJvbUVtYmVkZGVyID0gYXdhaXQgdGhpcy5zZXNzaW9uRnJvbUVtYmVkZGVyLnZhbHVlO1xuXHRcdGxldCBjYW5TaWduT3V0ID0gdHJ1ZTtcblx0XHRpZiAoXG5cdFx0XHRzZXNzaW9uRnJvbUVtYmVkZGVyXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gaWYgd2UgaGF2ZSBhIHNlc3Npb24gZnJvbSB0aGUgZW1iZWRkZXJcblx0XHRcdCYmICFzZXNzaW9uRnJvbUVtYmVkZGVyLmNhblNpZ25PdXRcdFx0XHRcdFx0XHRcdFx0Ly8gYW5kIHRoYXQgc2Vzc2lvbiBzYXlzIHdlIGNhbid0IHNpZ24gb3V0XG5cdFx0XHQmJiAoYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXJJZCkpXHQvLyBhbmQgdGhhdCBzZXNzaW9uIGlzIGFzc29jaWF0ZWQgd2l0aCB0aGUgYWNjb3VudCB3ZSBhcmUgYWRkaW5nL3VwZGF0aW5nXG5cdFx0XHRcdC5zb21lKHMgPT5cblx0XHRcdFx0XHRzLmlkID09PSBzZXNzaW9uRnJvbUVtYmVkZGVyLmlkXG5cdFx0XHRcdFx0JiYgcy5hY2NvdW50LmlkID09PSBhY2NvdW50LmlkXG5cdFx0XHRcdClcblx0XHQpIHtcblx0XHRcdGNhblNpZ25PdXQgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBleGlzdGluZ0FjY291bnQgPSBhY2NvdW50cy5maW5kKGEgPT4gYS5sYWJlbCA9PT0gYWNjb3VudC5sYWJlbCk7XG5cdFx0aWYgKGV4aXN0aW5nQWNjb3VudCkge1xuXHRcdFx0Ly8gaWYgd2UgaGF2ZSBhbiBleGlzdGluZyBhY2NvdW50IGFuZCB3ZSBkaXNjb3ZlciB0aGF0IHdlXG5cdFx0XHQvLyBjYW4ndCBzaWduIG91dCBvZiBpdCwgdXBkYXRlIHRoZSBhY2NvdW50IHRvIG1hcmsgaXQgYXMgXCJjYW4ndCBzaWduIG91dFwiXG5cdFx0XHRpZiAoIWNhblNpZ25PdXQpIHtcblx0XHRcdFx0ZXhpc3RpbmdBY2NvdW50LmNhblNpZ25PdXQgPSBjYW5TaWduT3V0O1xuXHRcdFx0fVxuXHRcdFx0ZXhpc3RpbmdBY2NvdW50Lmljb24gPSBhY2NvdW50Lmljb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjY291bnRzLnB1c2goeyAuLi5hY2NvdW50LCBjYW5TaWduT3V0IH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlQWNjb3VudChwcm92aWRlcklkOiBzdHJpbmcsIGFjY291bnQ6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQpOiB2b2lkIHtcblx0XHRjb25zdCBhY2NvdW50cyA9IHRoaXMuZ3JvdXBlZEFjY291bnRzLmdldChwcm92aWRlcklkKTtcblx0XHRpZiAoIWFjY291bnRzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXggPSBhY2NvdW50cy5maW5kSW5kZXgoYSA9PiBhLmlkID09PSBhY2NvdW50LmlkKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YWNjb3VudHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRpZiAoYWNjb3VudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmdyb3VwZWRBY2NvdW50cy5kZWxldGUocHJvdmlkZXJJZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhZGRBY2NvdW50c0Zyb21Qcm92aWRlcihwcm92aWRlcklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkKTtcblx0XHRcdHRoaXMucHJvYmxlbWF0aWNQcm92aWRlcnMuZGVsZXRlKHByb3ZpZGVySWQpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmFkZE9yVXBkYXRlQWNjb3VudChwcm92aWRlcklkLCBzZXNzaW9uLmFjY291bnQpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0dGhpcy5wcm9ibGVtYXRpY1Byb3ZpZGVycy5hZGQocHJvdmlkZXJJZCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG5cbmV4cG9ydCBjbGFzcyBHbG9iYWxBY3Rpdml0eUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQWJzdHJhY3RHbG9iYWxBY3Rpdml0eUFjdGlvblZpZXdJdGVtIHtcblxuXHRwcml2YXRlIHByb2ZpbGVCYWRnZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcHJvZmlsZUJhZGdlQ29udGVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGV4dE1lbnVBY3Rpb25zUHJvdmlkZXI6ICgpID0+IElBY3Rpb25bXSxcblx0XHRvcHRpb25zOiBJQ29tcG9zaXRlQmFyQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdGNvbnRleHRNZW51QWxpZ25tZW50T3B0aW9uczogKCkgPT4gUmVhZG9ubHk8eyBhbmNob3JBbGlnbm1lbnQ6IEFuY2hvckFsaWdubWVudDsgYW5jaG9yQXhpc0FsaWdubWVudDogQW5jaG9yQXhpc0FsaWdubWVudCB9PiB8IHVuZGVmaW5lZCxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbXBvc2l0ZUJhckFjdGlvbiwge1xuXHRcdFx0aWQ6IEdMT0JBTF9BQ1RJVklUWV9JRCxcblx0XHRcdG5hbWU6IGxvY2FsaXplKCdtYW5hZ2UnLCBcIk1hbmFnZVwiKSxcblx0XHRcdGNsYXNzTmFtZXM6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaWNvbiA/IFRoZW1lSWNvbi5mcm9tSWQodXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pY29uKSA6IERFRkFVTFRfSUNPTilcblx0XHR9KTtcblx0XHRzdXBlcihNZW51SWQuR2xvYmFsQWN0aXZpdHksIGFjdGlvbiwgb3B0aW9ucywgY29udGV4dE1lbnVBY3Rpb25zUHJvdmlkZXIsIGNvbnRleHRNZW51QWxpZ25tZW50T3B0aW9ucywgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UsIG1lbnVTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGFjdGl2aXR5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VDdXJyZW50UHJvZmlsZShlID0+IHtcblx0XHRcdGFjdGlvbi5jb21wb3NpdGVCYXJBY3Rpb25JdGVtID0ge1xuXHRcdFx0XHQuLi5hY3Rpb24uY29tcG9zaXRlQmFyQWN0aW9uSXRlbSxcblx0XHRcdFx0Y2xhc3NOYW1lczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkodXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pY29uID8gVGhlbWVJY29uLmZyb21JZCh1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmljb24pIDogREVGQVVMVF9JQ09OKVxuXHRcdFx0fTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXG5cdFx0dGhpcy5wcm9maWxlQmFkZ2UgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucHJvZmlsZS1iYWRnZScpKTtcblx0XHR0aGlzLnByb2ZpbGVCYWRnZUNvbnRlbnQgPSBhcHBlbmQodGhpcy5wcm9maWxlQmFkZ2UsICQoJy5wcm9maWxlLWJhZGdlLWNvbnRlbnQnKSk7XG5cdFx0dGhpcy51cGRhdGVQcm9maWxlQmFkZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUHJvZmlsZUJhZGdlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5wcm9maWxlQmFkZ2UgfHwgIXRoaXMucHJvZmlsZUJhZGdlQ29udGVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNsZWFyTm9kZSh0aGlzLnByb2ZpbGVCYWRnZUNvbnRlbnQpO1xuXHRcdGhpZGUodGhpcy5wcm9maWxlQmFkZ2UpO1xuXG5cdFx0aWYgKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmljb24gJiYgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmljb24gIT09IERFRkFVTFRfSUNPTi5pZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICgodGhpcy5hY3Rpb24gYXMgQ29tcG9zaXRlQmFyQWN0aW9uKS5hY3Rpdml0aWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzaG93KHRoaXMucHJvZmlsZUJhZGdlKTtcblx0XHR0aGlzLnByb2ZpbGVCYWRnZUNvbnRlbnQuY2xhc3NMaXN0LmFkZCgncHJvZmlsZS10ZXh0LW92ZXJsYXknKTtcblx0XHR0aGlzLnByb2ZpbGVCYWRnZUNvbnRlbnQudGV4dENvbnRlbnQgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubmFtZS5zdWJzdHJpbmcoMCwgMikudG9VcHBlckNhc2UoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVBY3Rpdml0eSgpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVBY3Rpdml0eSgpO1xuXHRcdHRoaXMudXBkYXRlUHJvZmlsZUJhZGdlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY29tcHV0ZVRpdGxlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pc0RlZmF1bHQgPyBzdXBlci5jb21wdXRlVGl0bGUoKSA6IGxvY2FsaXplKCdtYW5hZ2UgcHJvZmlsZScsIFwiTWFuYWdlIHswfSAoUHJvZmlsZSlcIiwgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm5hbWUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTaW1wbGVBY2NvdW50QWN0aXZpdHlBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEFjY291bnRzQWN0aXZpdHlBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aG92ZXJPcHRpb25zOiBJQWN0aXZpdHlIb3Zlck9wdGlvbnMsXG5cdFx0b3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVNlY3JldFN0b3JhZ2VTZXJ2aWNlIHNlY3JldFN0b3JhZ2VTZXJ2aWNlOiBJU2VjcmV0U3RvcmFnZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvZGV4QWNjb3VudFNlcnZpY2UgY29kZXhBY2NvdW50U2VydmljZTogSUNvZGV4QWNjb3VudFNlcnZpY2UsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgZGVmYXVsdEFjY291bnRTZXJ2aWNlOiBJRGVmYXVsdEFjY291bnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigoKSA9PiBzaW1wbGVBY3Rpdml0eUNvbnRleHRNZW51QWN0aW9ucyhzdG9yYWdlU2VydmljZSwgdHJ1ZSksXG5cdFx0XHR7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdGNvbG9yczogdGhlbWUgPT4gKHtcblx0XHRcdFx0XHRiYWRnZUJhY2tncm91bmQ6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9CQURHRV9CQUNLR1JPVU5EKSxcblx0XHRcdFx0XHRiYWRnZUZvcmVncm91bmQ6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9CQURHRV9GT1JFR1JPVU5EKSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGhvdmVyT3B0aW9ucyxcblx0XHRcdFx0Y29tcGFjdDogdHJ1ZSxcblx0XHRcdH0sICgpID0+IHVuZGVmaW5lZCwgYWN0aW9ucyA9PiBhY3Rpb25zLCB0aGVtZVNlcnZpY2UsIGxpZmVjeWNsZVNlcnZpY2UsIGhvdmVyU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBtZW51U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGF1dGhlbnRpY2F0aW9uU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBzZWNyZXRTdG9yYWdlU2VydmljZSwgbG9nU2VydmljZSwgYWN0aXZpdHlTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgY29tbWFuZFNlcnZpY2UsIGNvZGV4QWNjb3VudFNlcnZpY2UsIGRlZmF1bHRBY2NvdW50U2VydmljZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNpbXBsZUdsb2JhbEFjdGl2aXR5QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBHbG9iYWxBY3Rpdml0eUFjdGlvblZpZXdJdGVtIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRob3Zlck9wdGlvbnM6IElBY3Rpdml0eUhvdmVyT3B0aW9ucyxcblx0XHRvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElBY3Rpdml0eVNlcnZpY2UgYWN0aXZpdHlTZXJ2aWNlOiBJQWN0aXZpdHlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigoKSA9PiBzaW1wbGVBY3Rpdml0eUNvbnRleHRNZW51QWN0aW9ucyhzdG9yYWdlU2VydmljZSwgZmFsc2UpLFxuXHRcdFx0e1xuXHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRjb2xvcnM6IHRoZW1lID0+ICh7XG5cdFx0XHRcdFx0YmFkZ2VCYWNrZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcihBQ1RJVklUWV9CQVJfQkFER0VfQkFDS0dST1VORCksXG5cdFx0XHRcdFx0YmFkZ2VGb3JlZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcihBQ1RJVklUWV9CQVJfQkFER0VfRk9SRUdST1VORCksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRob3Zlck9wdGlvbnMsXG5cdFx0XHRcdGNvbXBhY3Q6IHRydWUsXG5cdFx0XHR9LCAoKSA9PiB1bmRlZmluZWQsIHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlLCBtZW51U2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpdml0eVNlcnZpY2UpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHNpbXBsZUFjdGl2aXR5Q29udGV4dE1lbnVBY3Rpb25zKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsIGlzQWNjb3VudDogYm9vbGVhbik6IElBY3Rpb25bXSB7XG5cdGNvbnN0IGN1cnJlbnRFbGVtZW50Q29udGV4dE1lbnVBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0aWYgKGlzQWNjb3VudCkge1xuXHRcdGN1cnJlbnRFbGVtZW50Q29udGV4dE1lbnVBY3Rpb25zLnB1c2goXG5cdFx0XHR0b0FjdGlvbih7IGlkOiAnaGlkZUFjY291bnRzJywgbGFiZWw6IGxvY2FsaXplKCdoaWRlQWNjb3VudHMnLCBcIkhpZGUgQWNjb3VudHNcIiksIHJ1bjogKCkgPT4gc2V0QWNjb3VudHNBY3Rpb25WaXNpYmxlKHN0b3JhZ2VTZXJ2aWNlLCBmYWxzZSkgfSksXG5cdFx0XHRuZXcgU2VwYXJhdG9yKClcblx0XHQpO1xuXHR9XG5cdHJldHVybiBbXG5cdFx0Li4uY3VycmVudEVsZW1lbnRDb250ZXh0TWVudUFjdGlvbnMsXG5cdFx0dG9BY3Rpb24oeyBpZDogJ3RvZ2dsZS5oaWRlQWNjb3VudHMnLCBsYWJlbDogbG9jYWxpemUoJ2FjY291bnRzJywgXCJBY2NvdW50c1wiKSwgY2hlY2tlZDogaXNBY2NvdW50c0FjdGlvblZpc2libGUoc3RvcmFnZVNlcnZpY2UpLCBydW46ICgpID0+IHNldEFjY291bnRzQWN0aW9uVmlzaWJsZShzdG9yYWdlU2VydmljZSwgIWlzQWNjb3VudHNBY3Rpb25WaXNpYmxlKHN0b3JhZ2VTZXJ2aWNlKSkgfSksXG5cdFx0dG9BY3Rpb24oeyBpZDogJ3RvZ2dsZS5oaWRlTWFuYWdlJywgbGFiZWw6IGxvY2FsaXplKCdtYW5hZ2UnLCBcIk1hbmFnZVwiKSwgY2hlY2tlZDogdHJ1ZSwgZW5hYmxlZDogZmFsc2UsIHJ1bjogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1wiTWFuYWdlXCIgY2FuIG5vdCBiZSBoaWRkZW4nKTsgfSB9KVxuXHRdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBY2NvdW50c0FjdGlvblZpc2libGUoc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihBY2NvdW50c0FjdGl2aXR5QWN0aW9uVmlld0l0ZW0uQUNDT1VOVFNfVklTSUJJTElUWV9QUkVGRVJFTkNFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHRydWUpO1xufVxuXG5mdW5jdGlvbiBzZXRBY2NvdW50c0FjdGlvblZpc2libGUoc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSwgdmlzaWJsZTogYm9vbGVhbikge1xuXHRzdG9yYWdlU2VydmljZS5zdG9yZShBY2NvdW50c0FjdGl2aXR5QWN0aW9uVmlld0l0ZW0uQUNDT1VOVFNfVklTSUJJTElUWV9QUkVGRVJFTkNFX0tFWSwgdmlzaWJsZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVcsMEJBQTBCO0FBQzlDLFNBQVMsc0JBQXNCLDBCQUEwQjtBQUN6RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQixrQkFBa0I7QUFDNUMsU0FBc0IscUJBQXFCO0FBQzNDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCLDBCQUEwRztBQUMvSSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxRQUFpQixXQUFXLGVBQWUsZ0JBQWdCO0FBQ3BFLFNBQWdCLGNBQWMsY0FBYztBQUM1QyxTQUFTLHVCQUF1QixXQUFXLFFBQVEsV0FBVyxNQUFNLE1BQU0sYUFBYSxHQUFHLG1C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
