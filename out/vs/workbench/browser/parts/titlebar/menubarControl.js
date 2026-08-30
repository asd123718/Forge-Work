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
import "./media/menubarControl.css";
import { localize, localize2 } from "../../../../nls.js";
import { IMenuService, MenuId, SubmenuItemAction, registerAction2, Action2, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { getMenuBarVisibility, MenuSettings, hasNativeMenu } from "../../../../platform/window/common/window.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { Action, SubmenuAction, Separator, ActionRunner, toAction } from "../../../../base/common/actions.js";
import { addDisposableListener, Dimension, EventType } from "../../../../base/browser/dom.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { isMacintosh, isWeb, isIOS, isNative } from "../../../../base/common/platform.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { isRecentFolder, isRecentWorkspace, IWorkspacesService } from "../../../../platform/workspaces/common/workspaces.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { ILabelService, Verbosity } from "../../../../platform/label/common/label.js";
import { IUpdateService, StateType } from "../../../../platform/update/common/update.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { MenuBar } from "../../../../base/browser/ui/menu/menubar.js";
import { HorizontalDirection, VerticalDirection } from "../../../../base/browser/ui/menu/menu.js";
import { mnemonicMenuLabel, unmnemonicLabel } from "../../../../base/common/labels.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { isFullscreen, onDidChangeFullscreen } from "../../../../base/browser/browser.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { BrowserFeatures } from "../../../../base/browser/canIUse.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { OpenRecentAction } from "../../actions/windowActions.js";
import { isICommandActionToggleInfo } from "../../../../platform/action/common/action.js";
import { getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { defaultMenuStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { ActivityBarPosition } from "../../../services/layout/browser/layoutService.js";
import { truncateMiddle } from "../../../../base/common/strings.js";
const _MenubarControl = class _MenubarControl extends Disposable {
  constructor(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, hostService, commandService) {
    super();
    this.menuService = menuService;
    this.workspacesService = workspacesService;
    this.contextKeyService = contextKeyService;
    this.keybindingService = keybindingService;
    this.configurationService = configurationService;
    this.labelService = labelService;
    this.updateService = updateService;
    this.storageService = storageService;
    this.notificationService = notificationService;
    this.preferencesService = preferencesService;
    this.environmentService = environmentService;
    this.accessibilityService = accessibilityService;
    this.hostService = hostService;
    this.commandService = commandService;
    this.keys = [
      MenuSettings.MenuBarVisibility,
      "window.enableMenuBarMnemonics",
      "window.customMenuBarAltFocus",
      "workbench.sideBar.location",
      "window.nativeTabs"
    ];
    this.menus = {};
    this.topLevelTitles = {};
    this.recentlyOpened = { files: [], workspaces: [] };
    this.mainMenu = this._register(this.menuService.createMenu(MenuId.MenubarMainMenu, this.contextKeyService));
    this.mainMenuDisposables = this._register(new DisposableStore());
    this.setupMainMenu();
    this.menuUpdater = this._register(new RunOnceScheduler(() => this.doUpdateMenubar(false), 200));
    this.notifyUserOfCustomMenubarAccessibility();
  }
  registerListeners() {
    this._register(this.hostService.onDidChangeFocus((e) => this.onDidChangeWindowFocus(e)));
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
    this._register(this.updateService.onStateChange(() => this.onUpdateStateChange()));
    this._register(this.workspacesService.onDidChangeRecentlyOpened(() => {
      this.onDidChangeRecentlyOpened();
    }));
    this._register(this.keybindingService.onDidUpdateKeybindings(() => this.updateMenubar()));
    this._register(this.labelService.onDidChangeFormatters(() => {
      this.onDidChangeRecentlyOpened();
    }));
    this._register(this.mainMenu.onDidChange(() => {
      this.setupMainMenu();
      this.doUpdateMenubar(true);
    }));
  }
  setupMainMenu() {
    this.mainMenuDisposables.clear();
    this.menus = {};
    this.topLevelTitles = {};
    const [, mainMenuActions] = this.mainMenu.getActions()[0];
    for (const mainMenuAction of mainMenuActions) {
      if (mainMenuAction instanceof SubmenuItemAction && typeof mainMenuAction.item.title !== "string") {
        this.menus[mainMenuAction.item.title.original] = this.mainMenuDisposables.add(this.menuService.createMenu(mainMenuAction.item.submenu, this.contextKeyService, { emitEventsForSubmenuChanges: true }));
        this.topLevelTitles[mainMenuAction.item.title.original] = mainMenuAction.item.title.mnemonicTitle ?? mainMenuAction.item.title.value;
      }
    }
  }
  updateMenubar() {
    this.menuUpdater.schedule();
  }
  calculateActionLabel(action) {
    const label = action.label;
    switch (action.id) {
      default:
        break;
    }
    return label;
  }
  onUpdateStateChange() {
    this.updateMenubar();
  }
  onUpdateKeybindings() {
    this.updateMenubar();
  }
  getOpenRecentActions() {
    if (!this.recentlyOpened) {
      return [];
    }
    const { workspaces, files } = this.recentlyOpened;
    const result = [];
    if (workspaces.length > 0) {
      for (let i = 0; i < _MenubarControl.MAX_MENU_RECENT_ENTRIES && i < workspaces.length; i++) {
        result.push(this.createOpenRecentMenuAction(workspaces[i]));
      }
      result.push(new Separator());
    }
    if (files.length > 0) {
      for (let i = 0; i < _MenubarControl.MAX_MENU_RECENT_ENTRIES && i < files.length; i++) {
        result.push(this.createOpenRecentMenuAction(files[i]));
      }
      result.push(new Separator());
    }
    return result;
  }
  onDidChangeWindowFocus(hasFocus) {
    if (hasFocus) {
      this.onDidChangeRecentlyOpened();
    }
  }
  onConfigurationUpdated(event) {
    if (this.keys.some((key) => event.affectsConfiguration(key))) {
      this.updateMenubar();
    }
    if (event.affectsConfiguration("editor.accessibilitySupport")) {
      this.notifyUserOfCustomMenubarAccessibility();
    }
    if (event.affectsConfiguration(MenuSettings.MenuBarVisibility)) {
      this.onDidChangeRecentlyOpened();
    }
  }
  get menubarHidden() {
    return isMacintosh && isNative ? false : getMenuBarVisibility(this.configurationService) === "hidden";
  }
  onDidChangeRecentlyOpened() {
    if (!this.menubarHidden) {
      this.workspacesService.getRecentlyOpened().then((recentlyOpened) => {
        this.recentlyOpened = recentlyOpened;
        this.updateMenubar();
      });
    }
  }
  createOpenRecentMenuAction(recent) {
    let label;
    let uri;
    let commandId;
    let openable;
    const remoteAuthority = recent.remoteAuthority;
    if (isRecentFolder(recent)) {
      uri = recent.folderUri;
      label = recent.label || this.labelService.getWorkspaceLabel(uri, { verbose: Verbosity.LONG });
      commandId = "openRecentFolder";
      openable = { folderUri: uri };
    } else if (isRecentWorkspace(recent)) {
      uri = recent.workspace.configPath;
      label = recent.label || this.labelService.getWorkspaceLabel(recent.workspace, { verbose: Verbosity.LONG });
      commandId = "openRecentWorkspace";
      openable = { workspaceUri: uri };
    } else {
      uri = recent.fileUri;
      label = recent.label || this.labelService.getUriLabel(uri, { appendWorkspaceSuffix: true });
      commandId = "openRecentFile";
      openable = { fileUri: uri };
    }
    const ret = toAction({
      id: commandId,
      label: unmnemonicLabel(truncateMiddle(label, _MenubarControl.MAX_MENU_RECENT_LABEL_LENGTH)),
      run: (browserEvent) => {
        const openInNewWindow = browserEvent && (!isMacintosh && (browserEvent.ctrlKey || browserEvent.shiftKey) || isMacintosh && (browserEvent.metaKey || browserEvent.altKey));
        return this.hostService.openWindow([openable], {
          forceNewWindow: !!openInNewWindow,
          remoteAuthority: remoteAuthority || null
          // local window if remoteAuthority is not set or can not be deducted from the openable
        });
      }
    });
    return Object.assign(ret, { uri, remoteAuthority });
  }
  notifyUserOfCustomMenubarAccessibility() {
    if (isWeb || isMacintosh) {
      return;
    }
    const hasBeenNotified = this.storageService.getBoolean("menubar/accessibleMenubarNotified", StorageScope.APPLICATION, false);
    const usingCustomMenubar = !hasNativeMenu(this.configurationService);
    if (hasBeenNotified || usingCustomMenubar || !this.accessibilityService.isScreenReaderOptimized()) {
      return;
    }
    const message = localize("menubar.customTitlebarAccessibilityNotification", "Accessibility support is enabled for you. For the most accessible experience, we recommend the custom menu style.");
    this.notificationService.prompt(Severity.Info, message, [
      {
        label: localize("goToSetting", "Open Settings"),
        run: () => {
          return this.preferencesService.openUserSettings({ query: MenuSettings.MenuStyle });
        }
      }
    ]);
    this.storageService.store("menubar/accessibleMenubarNotified", true, StorageScope.APPLICATION, StorageTarget.USER);
  }
};
_MenubarControl.MAX_MENU_RECENT_ENTRIES = 10;
_MenubarControl.MAX_MENU_RECENT_LABEL_LENGTH = 120;
let MenubarControl = _MenubarControl;
let focusMenuBarEmitter = void 0;
function enableFocusMenuBarAction() {
  if (!focusMenuBarEmitter) {
    focusMenuBarEmitter = new Emitter();
    registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.menubar.focus`,
          title: localize2("focusMenu", "Focus Application Menu"),
          keybinding: {
            primary: KeyMod.Alt | KeyCode.F10,
            weight: KeybindingWeight.WorkbenchContrib,
            when: IsWebContext
          },
          f1: true
        });
      }
      async run() {
        focusMenuBarEmitter?.fire();
      }
    });
  }
  return focusMenuBarEmitter;
}
let CustomMenubarControl = class extends MenubarControl {
  constructor(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, telemetryService, hostService, commandService) {
    super(menuService, workspacesService, contextKeyService, keybindingService, configurationService, labelService, updateService, storageService, notificationService, preferencesService, environmentService, accessibilityService, hostService, commandService);
    this.telemetryService = telemetryService;
    this.alwaysOnMnemonics = false;
    this.focusInsideMenubar = false;
    this.pendingFirstTimeUpdate = false;
    this.visible = true;
    this.webNavigationMenu = this._register(this.menuService.createMenu(MenuId.MenubarHomeMenu, this.contextKeyService));
    this.reinstallDisposables = this._register(new DisposableStore());
    this.updateActionsDisposables = this._register(new DisposableStore());
    this._onVisibilityChange = this._register(new Emitter());
    this._onFocusStateChange = this._register(new Emitter());
    this.actionRunner = this._register(new ActionRunner());
    this._register(this.actionRunner.onDidRun((e) => {
      this.telemetryService.publicLog2("workbenchActionExecuted", { id: e.action.id, from: "menu" });
    }));
    this.workspacesService.getRecentlyOpened().then((recentlyOpened) => {
      this.recentlyOpened = recentlyOpened;
    });
    this.registerListeners();
  }
  doUpdateMenubar(firstTime) {
    if (!this.focusInsideMenubar) {
      this.setupCustomMenubar(firstTime);
    }
    if (firstTime) {
      this.pendingFirstTimeUpdate = true;
    }
  }
  getUpdateAction() {
    const state = this.updateService.state;
    switch (state.type) {
      case StateType.Idle:
        return toAction({
          id: "update.check",
          label: localize({ key: "checkForUpdates", comment: ["&& denotes a mnemonic"] }, "Check for &&Updates..."),
          enabled: true,
          run: () => this.updateService.checkForUpdates(true)
        });
      case StateType.CheckingForUpdates:
        return toAction({ id: "update.checking", label: localize("checkingForUpdates", "Checking for Updates..."), enabled: false, run: () => {
        } });
      case StateType.AvailableForDownload:
        return toAction({
          id: "update.downloadNow",
          label: localize({ key: "download now", comment: ["&& denotes a mnemonic"] }, "D&&ownload Update"),
          enabled: true,
          run: () => this.updateService.downloadUpdate(true)
        });
      case StateType.Downloading:
      case StateType.Overwriting:
        return toAction({ id: "update.downloading", label: localize("DownloadingUpdate", "Downloading Update..."), enabled: false, run: () => {
        } });
      case StateType.Downloaded:
        return isMacintosh ? null : toAction({
          id: "update.install",
          label: localize({ key: "installUpdate...", comment: ["&& denotes a mnemonic"] }, "Install &&Update..."),
          enabled: true,
          run: () => this.updateService.applyUpdate()
        });
      case StateType.Updating:
        return toAction({ id: "update.updating", label: localize("installingUpdate", "Installing Update..."), enabled: false, run: () => {
        } });
      case StateType.Cancelling:
        return toAction({ id: "update.cancelling", label: localize("cancellingUpdate", "Cancelling Update..."), enabled: false, run: () => {
        } });
      case StateType.Ready:
        return toAction({
          id: "update.restart",
          label: localize({ key: "restartToUpdate", comment: ["&& denotes a mnemonic"] }, "Restart to &&Update"),
          enabled: true,
          run: () => this.updateService.quitAndInstall()
        });
      default:
        return null;
    }
  }
  get currentMenubarVisibility() {
    return getMenuBarVisibility(this.configurationService);
  }
  get currentDisableMenuBarAltFocus() {
    const settingValue = this.configurationService.getValue("window.customMenuBarAltFocus");
    let disableMenuBarAltBehavior = false;
    if (typeof settingValue === "boolean") {
      disableMenuBarAltBehavior = !settingValue;
    }
    return disableMenuBarAltBehavior;
  }
  insertActionsBefore(nextAction, target) {
    switch (nextAction.id) {
      case OpenRecentAction.ID:
        target.push(...this.getOpenRecentActions());
        break;
      case "workbench.action.showAboutDialog":
        if (!isMacintosh && !isWeb) {
          const updateAction = this.getUpdateAction();
          if (updateAction) {
            updateAction.label = mnemonicMenuLabel(updateAction.label);
            target.push(updateAction);
            target.push(new Separator());
          }
        }
        break;
      default:
        break;
    }
  }
  get currentEnableMenuBarMnemonics() {
    let enableMenuBarMnemonics = this.configurationService.getValue("window.enableMenuBarMnemonics");
    if (typeof enableMenuBarMnemonics !== "boolean") {
      enableMenuBarMnemonics = true;
    }
    return enableMenuBarMnemonics && (!isWeb || isFullscreen(mainWindow));
  }
  get currentCompactMenuMode() {
    if (this.currentMenubarVisibility !== "compact") {
      return void 0;
    }
    const currentSidebarLocation = this.configurationService.getValue("workbench.sideBar.location");
    const horizontalDirection = currentSidebarLocation === "right" ? HorizontalDirection.Left : HorizontalDirection.Right;
    const activityBarLocation = this.configurationService.getValue("workbench.activityBar.location");
    const verticalDirection = activityBarLocation === ActivityBarPosition.BOTTOM ? VerticalDirection.Above : VerticalDirection.Below;
    return { horizontal: horizontalDirection, vertical: verticalDirection };
  }
  onDidVisibilityChange(visible) {
    this.visible = visible;
    this.onDidChangeRecentlyOpened();
    this._onVisibilityChange.fire(visible);
  }
  toActionsArray(menu) {
    return getFlatContextMenuActions(menu.getActions({ shouldForwardArgs: true }));
  }
  setupCustomMenubar(firstTime) {
    if (!this.container) {
      return;
    }
    if (firstTime) {
      if (this.menubar) {
        this.reinstallDisposables.clear();
      }
      this.menubar = this.reinstallDisposables.add(new MenuBar(this.container, this.getMenuBarOptions(), defaultMenuStyles));
      this.accessibilityService.alwaysUnderlineAccessKeys().then((val) => {
        this.alwaysOnMnemonics = val;
        this.menubar?.update(this.getMenuBarOptions());
      });
      this.reinstallDisposables.add(this.menubar.onFocusStateChange((focused) => {
        this._onFocusStateChange.fire(focused);
        if (!focused) {
          if (this.pendingFirstTimeUpdate) {
            this.setupCustomMenubar(true);
            this.pendingFirstTimeUpdate = false;
          } else {
            this.updateMenubar();
          }
          this.focusInsideMenubar = false;
        }
      }));
      this.reinstallDisposables.add(this.menubar.onVisibilityChange((e) => this.onDidVisibilityChange(e)));
      this.reinstallDisposables.add(addDisposableListener(this.container, EventType.FOCUS_IN, () => {
        this.focusInsideMenubar = true;
      }));
      this.reinstallDisposables.add(addDisposableListener(this.container, EventType.FOCUS_OUT, () => {
        this.focusInsideMenubar = false;
      }));
      if (this.menubar.isVisible) {
        this.onDidVisibilityChange(true);
      }
    } else {
      this.menubar?.update(this.getMenuBarOptions());
    }
    const updateActions = (menuActions, target, topLevelTitle, store) => {
      target.splice(0);
      for (const menuItem of menuActions) {
        this.insertActionsBefore(menuItem, target);
        if (menuItem instanceof Separator) {
          target.push(menuItem);
        } else if (menuItem instanceof SubmenuItemAction || menuItem instanceof MenuItemAction) {
          let title = typeof menuItem.item.title === "string" ? menuItem.item.title : menuItem.item.title.mnemonicTitle ?? menuItem.item.title.value;
          if (menuItem instanceof SubmenuItemAction) {
            const submenuActions = [];
            updateActions(menuItem.actions, submenuActions, topLevelTitle, store);
            if (submenuActions.length > 0) {
              target.push(new SubmenuAction(menuItem.id, mnemonicMenuLabel(title), submenuActions));
            }
          } else {
            if (isICommandActionToggleInfo(menuItem.item.toggled)) {
              title = menuItem.item.toggled.mnemonicTitle ?? menuItem.item.toggled.title ?? title;
            }
            const newAction = store.add(new Action(menuItem.id, mnemonicMenuLabel(title), menuItem.class, menuItem.enabled, () => this.commandService.executeCommand(menuItem.id)));
            newAction.tooltip = menuItem.tooltip;
            newAction.checked = menuItem.checked;
            target.push(newAction);
          }
        }
      }
      if (topLevelTitle === "File" && this.currentCompactMenuMode === void 0) {
        const webActions = this.getWebNavigationActions();
        if (webActions.length) {
          target.push(...webActions);
        }
      }
    };
    for (const title of Object.keys(this.topLevelTitles)) {
      const menu = this.menus[title];
      if (firstTime && menu) {
        const menuChangedDisposable = this.reinstallDisposables.add(new DisposableStore());
        this.reinstallDisposables.add(menu.onDidChange(() => {
          if (!this.focusInsideMenubar) {
            const actions2 = [];
            menuChangedDisposable.clear();
            updateActions(this.toActionsArray(menu), actions2, title, menuChangedDisposable);
            this.menubar?.updateMenu({ actions: actions2, label: mnemonicMenuLabel(this.topLevelTitles[title]) });
          }
        }));
        if (menu === this.menus.File) {
          const webMenuChangedDisposable = this.reinstallDisposables.add(new DisposableStore());
          this.reinstallDisposables.add(this.webNavigationMenu.onDidChange(() => {
            if (!this.focusInsideMenubar) {
              const actions2 = [];
              webMenuChangedDisposable.clear();
              updateActions(this.toActionsArray(menu), actions2, title, webMenuChangedDisposable);
              this.menubar?.updateMenu({ actions: actions2, label: mnemonicMenuLabel(this.topLevelTitles[title]) });
            }
          }));
        }
      }
      const actions = [];
      if (menu) {
        this.updateActionsDisposables.clear();
        updateActions(this.toActionsArray(menu), actions, title, this.updateActionsDisposables);
      }
      if (this.menubar) {
        if (!firstTime) {
          this.menubar.updateMenu({ actions, label: mnemonicMenuLabel(this.topLevelTitles[title]) });
        } else {
          this.menubar.push({ actions, label: mnemonicMenuLabel(this.topLevelTitles[title]) });
        }
      }
    }
  }
  getWebNavigationActions() {
    if (!isWeb) {
      return [];
    }
    const webNavigationActions = [];
    for (const groups of this.webNavigationMenu.getActions()) {
      const [, actions] = groups;
      for (const action of actions) {
        if (action instanceof MenuItemAction) {
          const title = typeof action.item.title === "string" ? action.item.title : action.item.title.mnemonicTitle ?? action.item.title.value;
          webNavigationActions.push(toAction({
            id: action.id,
            label: mnemonicMenuLabel(title),
            class: action.class,
            enabled: action.enabled,
            run: async (event) => {
              this.commandService.executeCommand(action.id, event);
            }
          }));
        }
      }
      webNavigationActions.push(new Separator());
    }
    if (webNavigationActions.length) {
      webNavigationActions.pop();
    }
    return webNavigationActions;
  }
  getMenuBarOptions() {
    return {
      enableMnemonics: this.currentEnableMenuBarMnemonics,
      disableAltFocus: this.currentDisableMenuBarAltFocus,
      visibility: this.currentMenubarVisibility,
      actionRunner: this.actionRunner,
      getKeybinding: (action) => this.keybindingService.lookupKeybinding(action.id),
      alwaysOnMnemonics: this.alwaysOnMnemonics,
      compactMode: this.currentCompactMenuMode,
      getCompactMenuActions: () => {
        if (!isWeb) {
          return [];
        }
        return this.getWebNavigationActions();
      }
    };
  }
  onDidChangeWindowFocus(hasFocus) {
    if (!this.visible) {
      return;
    }
    super.onDidChangeWindowFocus(hasFocus);
    if (this.container) {
      if (hasFocus) {
        this.container.classList.remove("inactive");
      } else {
        this.container.classList.add("inactive");
        this.menubar?.blur();
      }
    }
  }
  onUpdateStateChange() {
    if (!this.visible) {
      return;
    }
    super.onUpdateStateChange();
  }
  onDidChangeRecentlyOpened() {
    if (!this.visible) {
      return;
    }
    super.onDidChangeRecentlyOpened();
  }
  onUpdateKeybindings() {
    if (!this.visible) {
      return;
    }
    super.onUpdateKeybindings();
  }
  registerListeners() {
    super.registerListeners();
    this._register(addDisposableListener(mainWindow, EventType.RESIZE, () => {
      if (this.menubar && !(isIOS && BrowserFeatures.pointerEvents)) {
        this.menubar.blur();
      }
    }));
    if (isWeb) {
      this._register(onDidChangeFullscreen((windowId) => {
        if (windowId === mainWindow.vscodeWindowId) {
          this.updateMenubar();
        }
      }));
      this._register(this.webNavigationMenu.onDidChange(() => this.updateMenubar()));
      this._register(enableFocusMenuBarAction().event(() => this.menubar?.toggleFocus()));
    }
  }
  get onVisibilityChange() {
    return this._onVisibilityChange.event;
  }
  get onFocusStateChange() {
    return this._onFocusStateChange.event;
  }
  getMenubarItemsDimensions() {
    if (this.menubar) {
      return new Dimension(this.menubar.getWidth(), this.menubar.getHeight());
    }
    return new Dimension(0, 0);
  }
  create(parent) {
    this.container = parent;
    if (this.container) {
      this.doUpdateMenubar(true);
    }
    return this.container;
  }
  layout(dimension) {
    this.menubar?.update(this.getMenuBarOptions());
  }
  toggleFocus() {
    this.menubar?.toggleFocus();
  }
};
CustomMenubarControl = __decorateClass([
  __decorateParam(0, IMenuService),
  __decorateParam(1, IWorkspacesService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, IUpdateService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, INotificationService),
  __decorateParam(9, IPreferencesService),
  __decorateParam(10, IWorkbenchEnvironmentService),
  __decorateParam(11, IAccessibilityService),
  __decorateParam(12, ITelemetryService),
  __decorateParam(13, IHostService),
  __decorateParam(14, ICommandService)
], CustomMenubarControl);
export {
  CustomMenubarControl,
  MenubarControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFx0aXRsZWJhclxcbWVudWJhckNvbnRyb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvbWVudWJhckNvbnRyb2wuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIElNZW51LCBTdWJtZW51SXRlbUFjdGlvbiwgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVudUJhclZpc2liaWxpdHksIElXaW5kb3dPcGVuYWJsZSwgZ2V0TWVudUJhclZpc2liaWxpdHksIE1lbnVTZXR0aW5ncywgaGFzTmF0aXZlTWVudSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgQWN0aW9uLCBTdWJtZW51QWN0aW9uLCBTZXBhcmF0b3IsIElBY3Rpb25SdW5uZXIsIEFjdGlvblJ1bm5lciwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRGltZW5zaW9uLCBFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2gsIGlzV2ViLCBpc0lPUywgaXNOYXRpdmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UsIElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElSZWNlbnRseU9wZW5lZCwgaXNSZWNlbnRGb2xkZXIsIElSZWNlbnQsIGlzUmVjZW50V29ya3NwYWNlLCBJV29ya3NwYWNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSwgVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElVcGRhdGVTZXJ2aWNlLCBTdGF0ZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZW51QmFyLCBJTWVudUJhck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbWVudS9tZW51YmFyLmpzJztcbmltcG9ydCB7IEhvcml6b250YWxEaXJlY3Rpb24sIElNZW51RGlyZWN0aW9uLCBWZXJ0aWNhbERpcmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9tZW51L21lbnUuanMnO1xuaW1wb3J0IHsgbW5lbW9uaWNNZW51TGFiZWwsIHVubW5lbW9uaWNMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IGlzRnVsbHNjcmVlbiwgb25EaWRDaGFuZ2VGdWxsc2NyZWVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgQnJvd3NlckZlYXR1cmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2NhbklVc2UuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSXNXZWJDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgT3BlblJlY2VudEFjdGlvbiB9IGZyb20gJy4uLy4uL2FjdGlvbnMvd2luZG93QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBpc0lDb21tYW5kQWN0aW9uVG9nZ2xlSW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgZGVmYXVsdE1lbnVTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgQWN0aXZpdHlCYXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdHJ1bmNhdGVNaWRkbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcblxuZXhwb3J0IHR5cGUgSU9wZW5SZWNlbnRBY3Rpb24gPSBJQWN0aW9uICYgeyB1cmk6IFVSSTsgcmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nIH07XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBNZW51YmFyQ29udHJvbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByb3RlY3RlZCBrZXlzID0gW1xuXHRcdE1lbnVTZXR0aW5ncy5NZW51QmFyVmlzaWJpbGl0eSxcblx0XHQnd2luZG93LmVuYWJsZU1lbnVCYXJNbmVtb25pY3MnLFxuXHRcdCd3aW5kb3cuY3VzdG9tTWVudUJhckFsdEZvY3VzJyxcblx0XHQnd29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nLFxuXHRcdCd3aW5kb3cubmF0aXZlVGFicydcblx0XTtcblxuXHRwcm90ZWN0ZWQgbWFpbk1lbnU6IElNZW51O1xuXHRwcm90ZWN0ZWQgbWVudXM6IHtcblx0XHRbaW5kZXg6IHN0cmluZ106IElNZW51IHwgdW5kZWZpbmVkO1xuXHR9ID0ge307XG5cblx0cHJvdGVjdGVkIHRvcExldmVsVGl0bGVzOiB7IFttZW51OiBzdHJpbmddOiBzdHJpbmcgfSA9IHt9O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBtYWluTWVudURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0cHJvdGVjdGVkIHJlY2VudGx5T3BlbmVkOiBJUmVjZW50bHlPcGVuZWQgPSB7IGZpbGVzOiBbXSwgd29ya3NwYWNlczogW10gfTtcblxuXHRwcm90ZWN0ZWQgbWVudVVwZGF0ZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0cHJvdGVjdGVkIHN0YXRpYyByZWFkb25seSBNQVhfTUVOVV9SRUNFTlRfRU5UUklFUyA9IDEwO1xuXHRwcm90ZWN0ZWQgc3RhdGljIHJlYWRvbmx5IE1BWF9NRU5VX1JFQ0VOVF9MQUJFTF9MRU5HVEggPSAxMjA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IHdvcmtzcGFjZXNTZXJ2aWNlOiBJV29ya3NwYWNlc1NlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgdXBkYXRlU2VydmljZTogSVVwZGF0ZVNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZVxuXHQpIHtcblxuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLm1haW5NZW51ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5NZW51YmFyTWFpbk1lbnUsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHR0aGlzLm1haW5NZW51RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0dGhpcy5zZXR1cE1haW5NZW51KCk7XG5cblx0XHR0aGlzLm1lbnVVcGRhdGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5kb1VwZGF0ZU1lbnViYXIoZmFsc2UpLCAyMDApKTtcblxuXHRcdHRoaXMubm90aWZ5VXNlck9mQ3VzdG9tTWVudWJhckFjY2Vzc2liaWxpdHkoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBkb1VwZGF0ZU1lbnViYXIoZmlyc3RUaW1lOiBib29sZWFuKTogdm9pZDtcblxuXHRwcm90ZWN0ZWQgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0Ly8gTGlzdGVuIGZvciB3aW5kb3cgZm9jdXMgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cyhlID0+IHRoaXMub25EaWRDaGFuZ2VXaW5kb3dGb2N1cyhlKSkpO1xuXG5cdFx0Ly8gVXBkYXRlIHdoZW4gY29uZmlnIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHRoaXMub25Db25maWd1cmF0aW9uVXBkYXRlZChlKSkpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIHVwZGF0ZSBzZXJ2aWNlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51cGRhdGVTZXJ2aWNlLm9uU3RhdGVDaGFuZ2UoKCkgPT4gdGhpcy5vblVwZGF0ZVN0YXRlQ2hhbmdlKCkpKTtcblxuXHRcdC8vIExpc3RlbiBmb3IgY2hhbmdlcyBpbiByZWNlbnRseSBvcGVuZWQgbWVudVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlc1NlcnZpY2Uub25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZCgoKSA9PiB7IHRoaXMub25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZCgpOyB9KSk7XG5cblx0XHQvLyBMaXN0ZW4gdG8ga2V5YmluZGluZ3MgY2hhbmdlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5rZXliaW5kaW5nU2VydmljZS5vbkRpZFVwZGF0ZUtleWJpbmRpbmdzKCgpID0+IHRoaXMudXBkYXRlTWVudWJhcigpKSk7XG5cblx0XHQvLyBVcGRhdGUgcmVjZW50IG1lbnUgaXRlbXMgb24gZm9ybWF0dGVyIHJlZ2lzdHJhdGlvblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFiZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9ybWF0dGVycygoKSA9PiB7IHRoaXMub25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZCgpOyB9KSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGNoYW5nZXMgb24gdGhlIG1haW4gbWVudVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWFpbk1lbnUub25EaWRDaGFuZ2UoKCkgPT4geyB0aGlzLnNldHVwTWFpbk1lbnUoKTsgdGhpcy5kb1VwZGF0ZU1lbnViYXIodHJ1ZSk7IH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBzZXR1cE1haW5NZW51KCk6IHZvaWQge1xuXHRcdHRoaXMubWFpbk1lbnVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMubWVudXMgPSB7fTtcblx0XHR0aGlzLnRvcExldmVsVGl0bGVzID0ge307XG5cblx0XHRjb25zdCBbLCBtYWluTWVudUFjdGlvbnNdID0gdGhpcy5tYWluTWVudS5nZXRBY3Rpb25zKClbMF07XG5cdFx0Zm9yIChjb25zdCBtYWluTWVudUFjdGlvbiBvZiBtYWluTWVudUFjdGlvbnMpIHtcblx0XHRcdGlmIChtYWluTWVudUFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uICYmIHR5cGVvZiBtYWluTWVudUFjdGlvbi5pdGVtLnRpdGxlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHR0aGlzLm1lbnVzW21haW5NZW51QWN0aW9uLml0ZW0udGl0bGUub3JpZ2luYWxdID0gdGhpcy5tYWluTWVudURpc3Bvc2FibGVzLmFkZCh0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUobWFpbk1lbnVBY3Rpb24uaXRlbS5zdWJtZW51LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB7IGVtaXRFdmVudHNGb3JTdWJtZW51Q2hhbmdlczogdHJ1ZSB9KSk7XG5cdFx0XHRcdHRoaXMudG9wTGV2ZWxUaXRsZXNbbWFpbk1lbnVBY3Rpb24uaXRlbS50aXRsZS5vcmlnaW5hbF0gPSBtYWluTWVudUFjdGlvbi5pdGVtLnRpdGxlLm1uZW1vbmljVGl0bGUgPz8gbWFpbk1lbnVBY3Rpb24uaXRlbS50aXRsZS52YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlTWVudWJhcigpOiB2b2lkIHtcblx0XHR0aGlzLm1lbnVVcGRhdGVyLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY2FsY3VsYXRlQWN0aW9uTGFiZWwoYWN0aW9uOiB7IGlkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmcgfSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGFiZWwgPSBhY3Rpb24ubGFiZWw7XG5cdFx0c3dpdGNoIChhY3Rpb24uaWQpIHtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHJldHVybiBsYWJlbDtcblx0fVxuXG5cdHByb3RlY3RlZCBvblVwZGF0ZVN0YXRlQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlTWVudWJhcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uVXBkYXRlS2V5YmluZGluZ3MoKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVNZW51YmFyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0T3BlblJlY2VudEFjdGlvbnMoKTogKFNlcGFyYXRvciB8IElPcGVuUmVjZW50QWN0aW9uKVtdIHtcblx0XHRpZiAoIXRoaXMucmVjZW50bHlPcGVuZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCB7IHdvcmtzcGFjZXMsIGZpbGVzIH0gPSB0aGlzLnJlY2VudGx5T3BlbmVkO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gW107XG5cblx0XHRpZiAod29ya3NwYWNlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IE1lbnViYXJDb250cm9sLk1BWF9NRU5VX1JFQ0VOVF9FTlRSSUVTICYmIGkgPCB3b3Jrc3BhY2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuY3JlYXRlT3BlblJlY2VudE1lbnVBY3Rpb24od29ya3NwYWNlc1tpXSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHQucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdH1cblxuXHRcdGlmIChmaWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IE1lbnViYXJDb250cm9sLk1BWF9NRU5VX1JFQ0VOVF9FTlRSSUVTICYmIGkgPCBmaWxlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh0aGlzLmNyZWF0ZU9wZW5SZWNlbnRNZW51QWN0aW9uKGZpbGVzW2ldKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdC5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByb3RlY3RlZCBvbkRpZENoYW5nZVdpbmRvd0ZvY3VzKGhhc0ZvY3VzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gV2hlbiB3ZSByZWdhaW4gZm9jdXMsIHVwZGF0ZSB0aGUgcmVjZW50IG1lbnUgaXRlbXNcblx0XHRpZiAoaGFzRm9jdXMpIHtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Db25maWd1cmF0aW9uVXBkYXRlZChldmVudDogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmtleXMuc29tZShrZXkgPT4gZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oa2V5KSkpIHtcblx0XHRcdHRoaXMudXBkYXRlTWVudWJhcigpO1xuXHRcdH1cblxuXHRcdGlmIChldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmFjY2Vzc2liaWxpdHlTdXBwb3J0JykpIHtcblx0XHRcdHRoaXMubm90aWZ5VXNlck9mQ3VzdG9tTWVudWJhckFjY2Vzc2liaWxpdHkoKTtcblx0XHR9XG5cblx0XHQvLyBTaW5jZSB3ZSB0cnkgbm90IHVwZGF0ZSB3aGVuIGhpZGRlbiwgd2Ugc2hvdWxkXG5cdFx0Ly8gdHJ5IHRvIHVwZGF0ZSB0aGUgcmVjZW50bHkgb3BlbmVkIGxpc3Qgb24gdmlzaWJpbGl0eSBjaGFuZ2VzXG5cdFx0aWYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKE1lbnVTZXR0aW5ncy5NZW51QmFyVmlzaWJpbGl0eSkpIHtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0IG1lbnViYXJIaWRkZW4oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzTWFjaW50b3NoICYmIGlzTmF0aXZlID8gZmFsc2UgOiBnZXRNZW51QmFyVmlzaWJpbGl0eSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSA9PT0gJ2hpZGRlbic7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZCgpOiB2b2lkIHtcblxuXHRcdC8vIERvIG5vdCB1cGRhdGUgcmVjZW50bHkgb3BlbmVkIHdoZW4gdGhlIG1lbnViYXIgaXMgaGlkZGVuICMxMDg3MTJcblx0XHRpZiAoIXRoaXMubWVudWJhckhpZGRlbikge1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VzU2VydmljZS5nZXRSZWNlbnRseU9wZW5lZCgpLnRoZW4ocmVjZW50bHlPcGVuZWQgPT4ge1xuXHRcdFx0XHR0aGlzLnJlY2VudGx5T3BlbmVkID0gcmVjZW50bHlPcGVuZWQ7XG5cdFx0XHRcdHRoaXMudXBkYXRlTWVudWJhcigpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVPcGVuUmVjZW50TWVudUFjdGlvbihyZWNlbnQ6IElSZWNlbnQpOiBJT3BlblJlY2VudEFjdGlvbiB7XG5cblx0XHRsZXQgbGFiZWw6IHN0cmluZztcblx0XHRsZXQgdXJpOiBVUkk7XG5cdFx0bGV0IGNvbW1hbmRJZDogc3RyaW5nO1xuXHRcdGxldCBvcGVuYWJsZTogSVdpbmRvd09wZW5hYmxlO1xuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHJlY2VudC5yZW1vdGVBdXRob3JpdHk7XG5cblx0XHRpZiAoaXNSZWNlbnRGb2xkZXIocmVjZW50KSkge1xuXHRcdFx0dXJpID0gcmVjZW50LmZvbGRlclVyaTtcblx0XHRcdGxhYmVsID0gcmVjZW50LmxhYmVsIHx8IHRoaXMubGFiZWxTZXJ2aWNlLmdldFdvcmtzcGFjZUxhYmVsKHVyaSwgeyB2ZXJib3NlOiBWZXJib3NpdHkuTE9ORyB9KTtcblx0XHRcdGNvbW1hbmRJZCA9ICdvcGVuUmVjZW50Rm9sZGVyJztcblx0XHRcdG9wZW5hYmxlID0geyBmb2xkZXJVcmk6IHVyaSB9O1xuXHRcdH0gZWxzZSBpZiAoaXNSZWNlbnRXb3Jrc3BhY2UocmVjZW50KSkge1xuXHRcdFx0dXJpID0gcmVjZW50LndvcmtzcGFjZS5jb25maWdQYXRoO1xuXHRcdFx0bGFiZWwgPSByZWNlbnQubGFiZWwgfHwgdGhpcy5sYWJlbFNlcnZpY2UuZ2V0V29ya3NwYWNlTGFiZWwocmVjZW50LndvcmtzcGFjZSwgeyB2ZXJib3NlOiBWZXJib3NpdHkuTE9ORyB9KTtcblx0XHRcdGNvbW1hbmRJZCA9ICdvcGVuUmVjZW50V29ya3NwYWNlJztcblx0XHRcdG9wZW5hYmxlID0geyB3b3Jrc3BhY2VVcmk6IHVyaSB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR1cmkgPSByZWNlbnQuZmlsZVVyaTtcblx0XHRcdGxhYmVsID0gcmVjZW50LmxhYmVsIHx8IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHVyaSwgeyBhcHBlbmRXb3Jrc3BhY2VTdWZmaXg6IHRydWUgfSk7XG5cdFx0XHRjb21tYW5kSWQgPSAnb3BlblJlY2VudEZpbGUnO1xuXHRcdFx0b3BlbmFibGUgPSB7IGZpbGVVcmk6IHVyaSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJldCA9IHRvQWN0aW9uKHtcblx0XHRcdGlkOiBjb21tYW5kSWQsIGxhYmVsOiB1bm1uZW1vbmljTGFiZWwodHJ1bmNhdGVNaWRkbGUobGFiZWwsIE1lbnViYXJDb250cm9sLk1BWF9NRU5VX1JFQ0VOVF9MQUJFTF9MRU5HVEgpKSwgcnVuOiAoYnJvd3NlckV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9wZW5Jbk5ld1dpbmRvdyA9IGJyb3dzZXJFdmVudCAmJiAoKCFpc01hY2ludG9zaCAmJiAoYnJvd3NlckV2ZW50LmN0cmxLZXkgfHwgYnJvd3NlckV2ZW50LnNoaWZ0S2V5KSkgfHwgKGlzTWFjaW50b3NoICYmIChicm93c2VyRXZlbnQubWV0YUtleSB8fCBicm93c2VyRXZlbnQuYWx0S2V5KSkpO1xuXG5cdFx0XHRcdHJldHVybiB0aGlzLmhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coW29wZW5hYmxlXSwge1xuXHRcdFx0XHRcdGZvcmNlTmV3V2luZG93OiAhIW9wZW5Jbk5ld1dpbmRvdyxcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSB8fCBudWxsIC8vIGxvY2FsIHdpbmRvdyBpZiByZW1vdGVBdXRob3JpdHkgaXMgbm90IHNldCBvciBjYW4gbm90IGJlIGRlZHVjdGVkIGZyb20gdGhlIG9wZW5hYmxlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIE9iamVjdC5hc3NpZ24ocmV0LCB7IHVyaSwgcmVtb3RlQXV0aG9yaXR5IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBub3RpZnlVc2VyT2ZDdXN0b21NZW51YmFyQWNjZXNzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRpZiAoaXNXZWIgfHwgaXNNYWNpbnRvc2gpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNCZWVuTm90aWZpZWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ21lbnViYXIvYWNjZXNzaWJsZU1lbnViYXJOb3RpZmllZCcsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXHRcdGNvbnN0IHVzaW5nQ3VzdG9tTWVudWJhciA9ICFoYXNOYXRpdmVNZW51KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0aWYgKGhhc0JlZW5Ob3RpZmllZCB8fCB1c2luZ0N1c3RvbU1lbnViYXIgfHwgIXRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBsb2NhbGl6ZSgnbWVudWJhci5jdXN0b21UaXRsZWJhckFjY2Vzc2liaWxpdHlOb3RpZmljYXRpb24nLCBcIkFjY2Vzc2liaWxpdHkgc3VwcG9ydCBpcyBlbmFibGVkIGZvciB5b3UuIEZvciB0aGUgbW9zdCBhY2Nlc3NpYmxlIGV4cGVyaWVuY2UsIHdlIHJlY29tbWVuZCB0aGUgY3VzdG9tIG1lbnUgc3R5bGUuXCIpO1xuXHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuSW5mbywgbWVzc2FnZSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2dvVG9TZXR0aW5nJywgXCJPcGVuIFNldHRpbmdzXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblVzZXJTZXR0aW5ncyh7IHF1ZXJ5OiBNZW51U2V0dGluZ3MuTWVudVN0eWxlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XSk7XG5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdtZW51YmFyL2FjY2Vzc2libGVNZW51YmFyTm90aWZpZWQnLCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cbn1cblxuLy8gVGhpcyBpcyBhIGJpdCBjb21wbGV4IGR1ZSB0byB0aGUgaXNzdWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIwNTgzNlxubGV0IGZvY3VzTWVudUJhckVtaXR0ZXI6IEVtaXR0ZXI8dm9pZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5mdW5jdGlvbiBlbmFibGVGb2N1c01lbnVCYXJBY3Rpb24oKTogRW1pdHRlcjx2b2lkPiB7XG5cdGlmICghZm9jdXNNZW51QmFyRW1pdHRlcikge1xuXHRcdGZvY3VzTWVudUJhckVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXG5cdFx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbnMubWVudWJhci5mb2N1c2AsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9jdXNNZW51JywgJ0ZvY3VzIEFwcGxpY2F0aW9uIE1lbnUnKSxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GMTAsXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRcdHdoZW46IElzV2ViQ29udGV4dFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZjE6IHRydWVcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Zm9jdXNNZW51QmFyRW1pdHRlcj8uZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cmV0dXJuIGZvY3VzTWVudUJhckVtaXR0ZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBDdXN0b21NZW51YmFyQ29udHJvbCBleHRlbmRzIE1lbnViYXJDb250cm9sIHtcblx0cHJpdmF0ZSBtZW51YmFyOiBNZW51QmFyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYWx3YXlzT25NbmVtb25pY3M6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBmb2N1c0luc2lkZU1lbnViYXI6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBwZW5kaW5nRmlyc3RUaW1lVXBkYXRlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgdmlzaWJsZTogYm9vbGVhbiA9IHRydWU7XG5cdHByaXZhdGUgYWN0aW9uUnVubmVyOiBJQWN0aW9uUnVubmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IHdlYk5hdmlnYXRpb25NZW51ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5NZW51YmFySG9tZU1lbnUsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblZpc2liaWxpdHlDaGFuZ2U6IEVtaXR0ZXI8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRm9jdXNTdGF0ZUNoYW5nZTogRW1pdHRlcjxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VzU2VydmljZSB3b3Jrc3BhY2VzU2VydmljZTogSVdvcmtzcGFjZXNTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVVwZGF0ZVNlcnZpY2UgdXBkYXRlU2VydmljZTogSVVwZGF0ZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKG1lbnVTZXJ2aWNlLCB3b3Jrc3BhY2VzU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgbGFiZWxTZXJ2aWNlLCB1cGRhdGVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgcHJlZmVyZW5jZXNTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBob3N0U2VydmljZSwgY29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fb25WaXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdFx0dGhpcy5fb25Gb2N1c1N0YXRlQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cblx0XHR0aGlzLmFjdGlvblJ1bm5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25SdW5uZXIoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hY3Rpb25SdW5uZXIub25EaWRSdW4oZSA9PiB7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiBlLmFjdGlvbi5pZCwgZnJvbTogJ21lbnUnIH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMud29ya3NwYWNlc1NlcnZpY2UuZ2V0UmVjZW50bHlPcGVuZWQoKS50aGVuKChyZWNlbnRseU9wZW5lZCkgPT4ge1xuXHRcdFx0dGhpcy5yZWNlbnRseU9wZW5lZCA9IHJlY2VudGx5T3BlbmVkO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGRvVXBkYXRlTWVudWJhcihmaXJzdFRpbWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZm9jdXNJbnNpZGVNZW51YmFyKSB7XG5cdFx0XHR0aGlzLnNldHVwQ3VzdG9tTWVudWJhcihmaXJzdFRpbWUpO1xuXHRcdH1cblxuXHRcdGlmIChmaXJzdFRpbWUpIHtcblx0XHRcdHRoaXMucGVuZGluZ0ZpcnN0VGltZVVwZGF0ZSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRVcGRhdGVBY3Rpb24oKTogSUFjdGlvbiB8IG51bGwge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy51cGRhdGVTZXJ2aWNlLnN0YXRlO1xuXG5cdFx0c3dpdGNoIChzdGF0ZS50eXBlKSB7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5JZGxlOlxuXHRcdFx0XHRyZXR1cm4gdG9BY3Rpb24oe1xuXHRcdFx0XHRcdGlkOiAndXBkYXRlLmNoZWNrJywgbGFiZWw6IGxvY2FsaXplKHsga2V5OiAnY2hlY2tGb3JVcGRhdGVzJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkNoZWNrIGZvciAmJlVwZGF0ZXMuLi5cIiksIGVuYWJsZWQ6IHRydWUsIHJ1bjogKCkgPT5cblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlU2VydmljZS5jaGVja0ZvclVwZGF0ZXModHJ1ZSlcblx0XHRcdFx0fSk7XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLkNoZWNraW5nRm9yVXBkYXRlczpcblx0XHRcdFx0cmV0dXJuIHRvQWN0aW9uKHsgaWQ6ICd1cGRhdGUuY2hlY2tpbmcnLCBsYWJlbDogbG9jYWxpemUoJ2NoZWNraW5nRm9yVXBkYXRlcycsIFwiQ2hlY2tpbmcgZm9yIFVwZGF0ZXMuLi5cIiksIGVuYWJsZWQ6IGZhbHNlLCBydW46ICgpID0+IHsgfSB9KTtcblxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuQXZhaWxhYmxlRm9yRG93bmxvYWQ6XG5cdFx0XHRcdHJldHVybiB0b0FjdGlvbih7XG5cdFx0XHRcdFx0aWQ6ICd1cGRhdGUuZG93bmxvYWROb3cnLCBsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdkb3dubG9hZCBub3cnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiRCYmb3dubG9hZCBVcGRhdGVcIiksIGVuYWJsZWQ6IHRydWUsIHJ1bjogKCkgPT5cblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlU2VydmljZS5kb3dubG9hZFVwZGF0ZSh0cnVlKVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRG93bmxvYWRpbmc6XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5PdmVyd3JpdGluZzpcblx0XHRcdFx0cmV0dXJuIHRvQWN0aW9uKHsgaWQ6ICd1cGRhdGUuZG93bmxvYWRpbmcnLCBsYWJlbDogbG9jYWxpemUoJ0Rvd25sb2FkaW5nVXBkYXRlJywgXCJEb3dubG9hZGluZyBVcGRhdGUuLi5cIiksIGVuYWJsZWQ6IGZhbHNlLCBydW46ICgpID0+IHsgfSB9KTtcblxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRG93bmxvYWRlZDpcblx0XHRcdFx0cmV0dXJuIGlzTWFjaW50b3NoID8gbnVsbCA6IHRvQWN0aW9uKHtcblx0XHRcdFx0XHRpZDogJ3VwZGF0ZS5pbnN0YWxsJywgbGFiZWw6IGxvY2FsaXplKHsga2V5OiAnaW5zdGFsbFVwZGF0ZS4uLicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJJbnN0YWxsICYmVXBkYXRlLi4uXCIpLCBlbmFibGVkOiB0cnVlLCBydW46ICgpID0+XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVNlcnZpY2UuYXBwbHlVcGRhdGUoKVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuVXBkYXRpbmc6XG5cdFx0XHRcdHJldHVybiB0b0FjdGlvbih7IGlkOiAndXBkYXRlLnVwZGF0aW5nJywgbGFiZWw6IGxvY2FsaXplKCdpbnN0YWxsaW5nVXBkYXRlJywgXCJJbnN0YWxsaW5nIFVwZGF0ZS4uLlwiKSwgZW5hYmxlZDogZmFsc2UsIHJ1bjogKCkgPT4geyB9IH0pO1xuXG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5DYW5jZWxsaW5nOlxuXHRcdFx0XHRyZXR1cm4gdG9BY3Rpb24oeyBpZDogJ3VwZGF0ZS5jYW5jZWxsaW5nJywgbGFiZWw6IGxvY2FsaXplKCdjYW5jZWxsaW5nVXBkYXRlJywgXCJDYW5jZWxsaW5nIFVwZGF0ZS4uLlwiKSwgZW5hYmxlZDogZmFsc2UsIHJ1bjogKCkgPT4geyB9IH0pO1xuXG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5SZWFkeTpcblx0XHRcdFx0cmV0dXJuIHRvQWN0aW9uKHtcblx0XHRcdFx0XHRpZDogJ3VwZGF0ZS5yZXN0YXJ0JywgbGFiZWw6IGxvY2FsaXplKHsga2V5OiAncmVzdGFydFRvVXBkYXRlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlJlc3RhcnQgdG8gJiZVcGRhdGVcIiksIGVuYWJsZWQ6IHRydWUsIHJ1bjogKCkgPT5cblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlU2VydmljZS5xdWl0QW5kSW5zdGFsbCgpXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldCBjdXJyZW50TWVudWJhclZpc2liaWxpdHkoKTogTWVudUJhclZpc2liaWxpdHkge1xuXHRcdHJldHVybiBnZXRNZW51QmFyVmlzaWJpbGl0eSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGN1cnJlbnREaXNhYmxlTWVudUJhckFsdEZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNldHRpbmdWYWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3dpbmRvdy5jdXN0b21NZW51QmFyQWx0Rm9jdXMnKTtcblxuXHRcdGxldCBkaXNhYmxlTWVudUJhckFsdEJlaGF2aW9yID0gZmFsc2U7XG5cdFx0aWYgKHR5cGVvZiBzZXR0aW5nVmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdFx0ZGlzYWJsZU1lbnVCYXJBbHRCZWhhdmlvciA9ICFzZXR0aW5nVmFsdWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpc2FibGVNZW51QmFyQWx0QmVoYXZpb3I7XG5cdH1cblxuXHRwcml2YXRlIGluc2VydEFjdGlvbnNCZWZvcmUobmV4dEFjdGlvbjogSUFjdGlvbiwgdGFyZ2V0OiBJQWN0aW9uW10pOiB2b2lkIHtcblx0XHRzd2l0Y2ggKG5leHRBY3Rpb24uaWQpIHtcblx0XHRcdGNhc2UgT3BlblJlY2VudEFjdGlvbi5JRDpcblx0XHRcdFx0dGFyZ2V0LnB1c2goLi4udGhpcy5nZXRPcGVuUmVjZW50QWN0aW9ucygpKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd0Fib3V0RGlhbG9nJzpcblx0XHRcdFx0aWYgKCFpc01hY2ludG9zaCAmJiAhaXNXZWIpIHtcblx0XHRcdFx0XHRjb25zdCB1cGRhdGVBY3Rpb24gPSB0aGlzLmdldFVwZGF0ZUFjdGlvbigpO1xuXHRcdFx0XHRcdGlmICh1cGRhdGVBY3Rpb24pIHtcblx0XHRcdFx0XHRcdHVwZGF0ZUFjdGlvbi5sYWJlbCA9IG1uZW1vbmljTWVudUxhYmVsKHVwZGF0ZUFjdGlvbi5sYWJlbCk7XG5cdFx0XHRcdFx0XHR0YXJnZXQucHVzaCh1cGRhdGVBY3Rpb24pO1xuXHRcdFx0XHRcdFx0dGFyZ2V0LnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgY3VycmVudEVuYWJsZU1lbnVCYXJNbmVtb25pY3MoKTogYm9vbGVhbiB7XG5cdFx0bGV0IGVuYWJsZU1lbnVCYXJNbmVtb25pY3MgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCd3aW5kb3cuZW5hYmxlTWVudUJhck1uZW1vbmljcycpO1xuXHRcdGlmICh0eXBlb2YgZW5hYmxlTWVudUJhck1uZW1vbmljcyAhPT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRlbmFibGVNZW51QmFyTW5lbW9uaWNzID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZW5hYmxlTWVudUJhck1uZW1vbmljcyAmJiAoIWlzV2ViIHx8IGlzRnVsbHNjcmVlbihtYWluV2luZG93KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBjdXJyZW50Q29tcGFjdE1lbnVNb2RlKCk6IElNZW51RGlyZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5jdXJyZW50TWVudWJhclZpc2liaWxpdHkgIT09ICdjb21wYWN0Jykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBNZW51IGJhciBsaXZlcyBpbiBhY3Rpdml0eSBiYXIgYW5kIHNob3VsZCBmbG93IGJhc2VkIG9uIGl0cyBsb2NhdGlvblxuXHRcdGNvbnN0IGN1cnJlbnRTaWRlYmFyTG9jYXRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3dvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJyk7XG5cdFx0Y29uc3QgaG9yaXpvbnRhbERpcmVjdGlvbiA9IGN1cnJlbnRTaWRlYmFyTG9jYXRpb24gPT09ICdyaWdodCcgPyBIb3Jpem9udGFsRGlyZWN0aW9uLkxlZnQgOiBIb3Jpem9udGFsRGlyZWN0aW9uLlJpZ2h0O1xuXG5cdFx0Y29uc3QgYWN0aXZpdHlCYXJMb2NhdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignd29ya2JlbmNoLmFjdGl2aXR5QmFyLmxvY2F0aW9uJyk7XG5cdFx0Y29uc3QgdmVydGljYWxEaXJlY3Rpb24gPSBhY3Rpdml0eUJhckxvY2F0aW9uID09PSBBY3Rpdml0eUJhclBvc2l0aW9uLkJPVFRPTSA/IFZlcnRpY2FsRGlyZWN0aW9uLkFib3ZlIDogVmVydGljYWxEaXJlY3Rpb24uQmVsb3c7XG5cblx0XHRyZXR1cm4geyBob3Jpem9udGFsOiBob3Jpem9udGFsRGlyZWN0aW9uLCB2ZXJ0aWNhbDogdmVydGljYWxEaXJlY3Rpb24gfTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRWaXNpYmlsaXR5Q2hhbmdlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnZpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZCgpO1xuXHRcdHRoaXMuX29uVmlzaWJpbGl0eUNoYW5nZS5maXJlKHZpc2libGUpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0FjdGlvbnNBcnJheShtZW51OiBJTWVudSk6IElBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMobWVudS5nZXRBY3Rpb25zKHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSByZWluc3RhbGxEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlQWN0aW9uc0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBzZXR1cEN1c3RvbU1lbnViYXIoZmlyc3RUaW1lOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gSWYgdGhlcmUgaXMgbm8gY29udGFpbmVyLCB3ZSBjYW5ub3Qgc2V0dXAgdGhlIG1lbnViYXJcblx0XHRpZiAoIXRoaXMuY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGZpcnN0VGltZSkge1xuXHRcdFx0Ly8gUmVzZXQgYW5kIGNyZWF0ZSBuZXcgbWVudWJhclxuXHRcdFx0aWYgKHRoaXMubWVudWJhcikge1xuXHRcdFx0XHR0aGlzLnJlaW5zdGFsbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubWVudWJhciA9IHRoaXMucmVpbnN0YWxsRGlzcG9zYWJsZXMuYWRkKG5ldyBNZW51QmFyKHRoaXMuY29udGFpbmVyLCB0aGlzLmdldE1lbnVCYXJPcHRpb25zKCksIGRlZmF1bHRNZW51U3R5bGVzKSk7XG5cblx0XHRcdHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuYWx3YXlzVW5kZXJsaW5lQWNjZXNzS2V5cygpLnRoZW4odmFsID0+IHtcblx0XHRcdFx0dGhpcy5hbHdheXNPbk1uZW1vbmljcyA9IHZhbDtcblx0XHRcdFx0dGhpcy5tZW51YmFyPy51cGRhdGUodGhpcy5nZXRNZW51QmFyT3B0aW9ucygpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLnJlaW5zdGFsbERpc3Bvc2FibGVzLmFkZCh0aGlzLm1lbnViYXIub25Gb2N1c1N0YXRlQ2hhbmdlKGZvY3VzZWQgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkZvY3VzU3RhdGVDaGFuZ2UuZmlyZShmb2N1c2VkKTtcblxuXHRcdFx0XHQvLyBXaGVuIHRoZSBtZW51YmFyIGxvc2VzIGZvY3VzLCB1cGRhdGUgaXQgdG8gY2xlYXIgYW55IHBlbmRpbmcgdXBkYXRlc1xuXHRcdFx0XHRpZiAoIWZvY3VzZWQpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5wZW5kaW5nRmlyc3RUaW1lVXBkYXRlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldHVwQ3VzdG9tTWVudWJhcih0cnVlKTtcblx0XHRcdFx0XHRcdHRoaXMucGVuZGluZ0ZpcnN0VGltZVVwZGF0ZSA9IGZhbHNlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZU1lbnViYXIoKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLmZvY3VzSW5zaWRlTWVudWJhciA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMucmVpbnN0YWxsRGlzcG9zYWJsZXMuYWRkKHRoaXMubWVudWJhci5vblZpc2liaWxpdHlDaGFuZ2UoZSA9PiB0aGlzLm9uRGlkVmlzaWJpbGl0eUNoYW5nZShlKSkpO1xuXG5cdFx0XHQvLyBCZWZvcmUgd2UgZm9jdXMgdGhlIG1lbnViYXIsIHN0b3AgdXBkYXRlcyB0byBpdCBzbyB0aGF0IGZvY3VzLXJlbGF0ZWQgY29udGV4dCBrZXlzIHdpbGwgd29ya1xuXHRcdFx0dGhpcy5yZWluc3RhbGxEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCBFdmVudFR5cGUuRk9DVVNfSU4sICgpID0+IHtcblx0XHRcdFx0dGhpcy5mb2N1c0luc2lkZU1lbnViYXIgPSB0cnVlO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLnJlaW5zdGFsbERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsIEV2ZW50VHlwZS5GT0NVU19PVVQsICgpID0+IHtcblx0XHRcdFx0dGhpcy5mb2N1c0luc2lkZU1lbnViYXIgPSBmYWxzZTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gRmlyZSB2aXNpYmlsaXR5IGNoYW5nZSBmb3IgdGhlIGZpcnN0IGluc3RhbGwgaWYgbWVudSBpcyBzaG93blxuXHRcdFx0aWYgKHRoaXMubWVudWJhci5pc1Zpc2libGUpIHtcblx0XHRcdFx0dGhpcy5vbkRpZFZpc2liaWxpdHlDaGFuZ2UodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubWVudWJhcj8udXBkYXRlKHRoaXMuZ2V0TWVudUJhck9wdGlvbnMoKSk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRoZSBtZW51IGFjdGlvbnNcblx0XHRjb25zdCB1cGRhdGVBY3Rpb25zID0gKG1lbnVBY3Rpb25zOiByZWFkb25seSBJQWN0aW9uW10sIHRhcmdldDogSUFjdGlvbltdLCB0b3BMZXZlbFRpdGxlOiBzdHJpbmcsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpID0+IHtcblx0XHRcdHRhcmdldC5zcGxpY2UoMCk7XG5cblx0XHRcdGZvciAoY29uc3QgbWVudUl0ZW0gb2YgbWVudUFjdGlvbnMpIHtcblx0XHRcdFx0dGhpcy5pbnNlcnRBY3Rpb25zQmVmb3JlKG1lbnVJdGVtLCB0YXJnZXQpO1xuXG5cdFx0XHRcdGlmIChtZW51SXRlbSBpbnN0YW5jZW9mIFNlcGFyYXRvcikge1xuXHRcdFx0XHRcdHRhcmdldC5wdXNoKG1lbnVJdGVtKTtcblx0XHRcdFx0fSBlbHNlIGlmIChtZW51SXRlbSBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uIHx8IG1lbnVJdGVtIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHQvLyB1c2UgbW5lbW9uaWNUaXRsZSB3aGVuZXZlciBwb3NzaWJsZVxuXHRcdFx0XHRcdGxldCB0aXRsZSA9IHR5cGVvZiBtZW51SXRlbS5pdGVtLnRpdGxlID09PSAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0PyBtZW51SXRlbS5pdGVtLnRpdGxlXG5cdFx0XHRcdFx0XHQ6IG1lbnVJdGVtLml0ZW0udGl0bGUubW5lbW9uaWNUaXRsZSA/PyBtZW51SXRlbS5pdGVtLnRpdGxlLnZhbHVlO1xuXG5cdFx0XHRcdFx0aWYgKG1lbnVJdGVtIGluc3RhbmNlb2YgU3VibWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRcdGNvbnN0IHN1Ym1lbnVBY3Rpb25zOiBTdWJtZW51QWN0aW9uW10gPSBbXTtcblx0XHRcdFx0XHRcdHVwZGF0ZUFjdGlvbnMobWVudUl0ZW0uYWN0aW9ucywgc3VibWVudUFjdGlvbnMsIHRvcExldmVsVGl0bGUsIHN0b3JlKTtcblxuXHRcdFx0XHRcdFx0aWYgKHN1Ym1lbnVBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0dGFyZ2V0LnB1c2gobmV3IFN1Ym1lbnVBY3Rpb24obWVudUl0ZW0uaWQsIG1uZW1vbmljTWVudUxhYmVsKHRpdGxlKSwgc3VibWVudUFjdGlvbnMpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKGlzSUNvbW1hbmRBY3Rpb25Ub2dnbGVJbmZvKG1lbnVJdGVtLml0ZW0udG9nZ2xlZCkpIHtcblx0XHRcdFx0XHRcdFx0dGl0bGUgPSBtZW51SXRlbS5pdGVtLnRvZ2dsZWQubW5lbW9uaWNUaXRsZSA/PyBtZW51SXRlbS5pdGVtLnRvZ2dsZWQudGl0bGUgPz8gdGl0bGU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IG5ld0FjdGlvbiA9IHN0b3JlLmFkZChuZXcgQWN0aW9uKG1lbnVJdGVtLmlkLCBtbmVtb25pY01lbnVMYWJlbCh0aXRsZSksIG1lbnVJdGVtLmNsYXNzLCBtZW51SXRlbS5lbmFibGVkLCAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKG1lbnVJdGVtLmlkKSkpO1xuXHRcdFx0XHRcdFx0bmV3QWN0aW9uLnRvb2x0aXAgPSBtZW51SXRlbS50b29sdGlwO1xuXHRcdFx0XHRcdFx0bmV3QWN0aW9uLmNoZWNrZWQgPSBtZW51SXRlbS5jaGVja2VkO1xuXHRcdFx0XHRcdFx0dGFyZ2V0LnB1c2gobmV3QWN0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXG5cdFx0XHQvLyBBcHBlbmQgd2ViIG5hdmlnYXRpb24gbWVudSBpdGVtcyB0byB0aGUgZmlsZSBtZW51IHdoZW4gbm90IGNvbXBhY3Rcblx0XHRcdGlmICh0b3BMZXZlbFRpdGxlID09PSAnRmlsZScgJiYgdGhpcy5jdXJyZW50Q29tcGFjdE1lbnVNb2RlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3Qgd2ViQWN0aW9ucyA9IHRoaXMuZ2V0V2ViTmF2aWdhdGlvbkFjdGlvbnMoKTtcblx0XHRcdFx0aWYgKHdlYkFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGFyZ2V0LnB1c2goLi4ud2ViQWN0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCB0aXRsZSBvZiBPYmplY3Qua2V5cyh0aGlzLnRvcExldmVsVGl0bGVzKSkge1xuXHRcdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudXNbdGl0bGVdO1xuXHRcdFx0aWYgKGZpcnN0VGltZSAmJiBtZW51KSB7XG5cdFx0XHRcdGNvbnN0IG1lbnVDaGFuZ2VkRGlzcG9zYWJsZSA9IHRoaXMucmVpbnN0YWxsRGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0XHRcdHRoaXMucmVpbnN0YWxsRGlzcG9zYWJsZXMuYWRkKG1lbnUub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghdGhpcy5mb2N1c0luc2lkZU1lbnViYXIpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdFx0XHRcdFx0bWVudUNoYW5nZWREaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHRcdFx0XHR1cGRhdGVBY3Rpb25zKHRoaXMudG9BY3Rpb25zQXJyYXkobWVudSksIGFjdGlvbnMsIHRpdGxlLCBtZW51Q2hhbmdlZERpc3Bvc2FibGUpO1xuXHRcdFx0XHRcdFx0dGhpcy5tZW51YmFyPy51cGRhdGVNZW51KHsgYWN0aW9ucywgbGFiZWw6IG1uZW1vbmljTWVudUxhYmVsKHRoaXMudG9wTGV2ZWxUaXRsZXNbdGl0bGVdKSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBGb3IgdGhlIGZpbGUgbWVudSwgd2UgbmVlZCB0byB1cGRhdGUgaWYgdGhlIHdlYiBuYXYgbWVudSB1cGRhdGVzIGFzIHdlbGxcblx0XHRcdFx0aWYgKG1lbnUgPT09IHRoaXMubWVudXMuRmlsZSkge1xuXHRcdFx0XHRcdGNvbnN0IHdlYk1lbnVDaGFuZ2VkRGlzcG9zYWJsZSA9IHRoaXMucmVpbnN0YWxsRGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0XHRcdFx0dGhpcy5yZWluc3RhbGxEaXNwb3NhYmxlcy5hZGQodGhpcy53ZWJOYXZpZ2F0aW9uTWVudS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIXRoaXMuZm9jdXNJbnNpZGVNZW51YmFyKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdFx0XHRcdFx0XHR3ZWJNZW51Q2hhbmdlZERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdFx0XHRcdFx0dXBkYXRlQWN0aW9ucyh0aGlzLnRvQWN0aW9uc0FycmF5KG1lbnUpLCBhY3Rpb25zLCB0aXRsZSwgd2ViTWVudUNoYW5nZWREaXNwb3NhYmxlKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5tZW51YmFyPy51cGRhdGVNZW51KHsgYWN0aW9ucywgbGFiZWw6IG1uZW1vbmljTWVudUxhYmVsKHRoaXMudG9wTGV2ZWxUaXRsZXNbdGl0bGVdKSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0XHRpZiAobWVudSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUFjdGlvbnNEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHR1cGRhdGVBY3Rpb25zKHRoaXMudG9BY3Rpb25zQXJyYXkobWVudSksIGFjdGlvbnMsIHRpdGxlLCB0aGlzLnVwZGF0ZUFjdGlvbnNEaXNwb3NhYmxlcyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLm1lbnViYXIpIHtcblx0XHRcdFx0aWYgKCFmaXJzdFRpbWUpIHtcblx0XHRcdFx0XHR0aGlzLm1lbnViYXIudXBkYXRlTWVudSh7IGFjdGlvbnMsIGxhYmVsOiBtbmVtb25pY01lbnVMYWJlbCh0aGlzLnRvcExldmVsVGl0bGVzW3RpdGxlXSkgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5tZW51YmFyLnB1c2goeyBhY3Rpb25zLCBsYWJlbDogbW5lbW9uaWNNZW51TGFiZWwodGhpcy50b3BMZXZlbFRpdGxlc1t0aXRsZV0pIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRXZWJOYXZpZ2F0aW9uQWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdGlmICghaXNXZWIpIHtcblx0XHRcdHJldHVybiBbXTsgLy8gb25seSBmb3Igd2ViXG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2ViTmF2aWdhdGlvbkFjdGlvbnMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwcyBvZiB0aGlzLndlYk5hdmlnYXRpb25NZW51LmdldEFjdGlvbnMoKSkge1xuXHRcdFx0Y29uc3QgWywgYWN0aW9uc10gPSBncm91cHM7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IHRpdGxlID0gdHlwZW9mIGFjdGlvbi5pdGVtLnRpdGxlID09PSAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0PyBhY3Rpb24uaXRlbS50aXRsZVxuXHRcdFx0XHRcdFx0OiBhY3Rpb24uaXRlbS50aXRsZS5tbmVtb25pY1RpdGxlID8/IGFjdGlvbi5pdGVtLnRpdGxlLnZhbHVlO1xuXHRcdFx0XHRcdHdlYk5hdmlnYXRpb25BY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0aWQ6IGFjdGlvbi5pZCwgbGFiZWw6IG1uZW1vbmljTWVudUxhYmVsKHRpdGxlKSwgY2xhc3M6IGFjdGlvbi5jbGFzcywgZW5hYmxlZDogYWN0aW9uLmVuYWJsZWQsIHJ1bjogYXN5bmMgKGV2ZW50PzogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGFjdGlvbi5pZCwgZXZlbnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR3ZWJOYXZpZ2F0aW9uQWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHdlYk5hdmlnYXRpb25BY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0d2ViTmF2aWdhdGlvbkFjdGlvbnMucG9wKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHdlYk5hdmlnYXRpb25BY3Rpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNZW51QmFyT3B0aW9ucygpOiBJTWVudUJhck9wdGlvbnMge1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbmFibGVNbmVtb25pY3M6IHRoaXMuY3VycmVudEVuYWJsZU1lbnVCYXJNbmVtb25pY3MsXG5cdFx0XHRkaXNhYmxlQWx0Rm9jdXM6IHRoaXMuY3VycmVudERpc2FibGVNZW51QmFyQWx0Rm9jdXMsXG5cdFx0XHR2aXNpYmlsaXR5OiB0aGlzLmN1cnJlbnRNZW51YmFyVmlzaWJpbGl0eSxcblx0XHRcdGFjdGlvblJ1bm5lcjogdGhpcy5hY3Rpb25SdW5uZXIsXG5cdFx0XHRnZXRLZXliaW5kaW5nOiAoYWN0aW9uKSA9PiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKSxcblx0XHRcdGFsd2F5c09uTW5lbW9uaWNzOiB0aGlzLmFsd2F5c09uTW5lbW9uaWNzLFxuXHRcdFx0Y29tcGFjdE1vZGU6IHRoaXMuY3VycmVudENvbXBhY3RNZW51TW9kZSxcblx0XHRcdGdldENvbXBhY3RNZW51QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWlzV2ViKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdOyAvLyBvbmx5IGZvciB3ZWJcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFdlYk5hdmlnYXRpb25BY3Rpb25zKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbkRpZENoYW5nZVdpbmRvd0ZvY3VzKGhhc0ZvY3VzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzdXBlci5vbkRpZENoYW5nZVdpbmRvd0ZvY3VzKGhhc0ZvY3VzKTtcblxuXHRcdGlmICh0aGlzLmNvbnRhaW5lcikge1xuXHRcdFx0aWYgKGhhc0ZvY3VzKSB7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2luYWN0aXZlJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdpbmFjdGl2ZScpO1xuXHRcdFx0XHR0aGlzLm1lbnViYXI/LmJsdXIoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgb25VcGRhdGVTdGF0ZUNoYW5nZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN1cGVyLm9uVXBkYXRlU3RhdGVDaGFuZ2UoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbkRpZENoYW5nZVJlY2VudGx5T3BlbmVkKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy52aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3VwZXIub25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIG9uVXBkYXRlS2V5YmluZGluZ3MoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzdXBlci5vblVwZGF0ZUtleWJpbmRpbmdzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0c3VwZXIucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihtYWluV2luZG93LCBFdmVudFR5cGUuUkVTSVpFLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5tZW51YmFyICYmICEoaXNJT1MgJiYgQnJvd3NlckZlYXR1cmVzLnBvaW50ZXJFdmVudHMpKSB7XG5cdFx0XHRcdHRoaXMubWVudWJhci5ibHVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTW5lbW9uaWNzIHJlcXVpcmUgZnVsbHNjcmVlbiBpbiB3ZWJcblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlRnVsbHNjcmVlbih3aW5kb3dJZCA9PiB7XG5cdFx0XHRcdGlmICh3aW5kb3dJZCA9PT0gbWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZCkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlTWVudWJhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndlYk5hdmlnYXRpb25NZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMudXBkYXRlTWVudWJhcigpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihlbmFibGVGb2N1c01lbnVCYXJBY3Rpb24oKS5ldmVudCgoKSA9PiB0aGlzLm1lbnViYXI/LnRvZ2dsZUZvY3VzKCkpKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgb25WaXNpYmlsaXR5Q2hhbmdlKCk6IEV2ZW50PGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25WaXNpYmlsaXR5Q2hhbmdlLmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRm9jdXNTdGF0ZUNoYW5nZSgpOiBFdmVudDxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRm9jdXNTdGF0ZUNoYW5nZS5ldmVudDtcblx0fVxuXG5cdGdldE1lbnViYXJJdGVtc0RpbWVuc2lvbnMoKTogRGltZW5zaW9uIHtcblx0XHRpZiAodGhpcy5tZW51YmFyKSB7XG5cdFx0XHRyZXR1cm4gbmV3IERpbWVuc2lvbih0aGlzLm1lbnViYXIuZ2V0V2lkdGgoKSwgdGhpcy5tZW51YmFyLmdldEhlaWdodCgpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IERpbWVuc2lvbigwLCAwKTtcblx0fVxuXG5cdGNyZWF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdHRoaXMuY29udGFpbmVyID0gcGFyZW50O1xuXG5cdFx0Ly8gQnVpbGQgdGhlIG1lbnViYXJcblx0XHRpZiAodGhpcy5jb250YWluZXIpIHtcblx0XHRcdHRoaXMuZG9VcGRhdGVNZW51YmFyKHRydWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNvbnRhaW5lcjtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbikge1xuXHRcdHRoaXMubWVudWJhcj8udXBkYXRlKHRoaXMuZ2V0TWVudUJhck9wdGlvbnMoKSk7XG5cdH1cblxuXHR0b2dnbGVGb2N1cygpIHtcblx0XHR0aGlzLm1lbnViYXI/LnRvZ2dsZUZvY3VzKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxjQUFjLFFBQWUsbUJBQW1CLGlCQUFpQixTQUFTLHNCQUFzQjtBQUN6RyxTQUE2QyxzQkFBc0IsY0FBYyxxQkFBcUI7QUFDdEcsU0FBUywwQkFBMEI7QUFDbkMsU0FBa0IsUUFBUSxlQUFlLFdBQTBCLGNBQW1GLGdCQUFnQjtBQUN0SyxTQUFTLHVCQUF1QixXQUFXLGlCQUFpQjtBQUM1RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGFBQWEsT0FBTyxPQUFPLGdCQUFnQjtBQUNwRCxTQUFTLDZCQUF3RDtBQUNqRSxTQUFnQixlQUFlO0FBQy9CLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBMEIsZ0JBQXlCLG1CQUFtQiwwQkFBMEI7QUFDaEcsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxlQUFlLGlCQUFpQjtBQUN6QyxTQUFTLGdCQUFnQixpQkFBaUI7QUFDMUMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsZUFBZ0M7QUFDekMsU0FBUyxxQkFBcUMseUJBQXlCO0FBQ3ZFLFNBQVMsbUJBQW1CLHVCQUF1QjtBQUNuRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGNBQWMsNkJBQTZCO0FBQ3BELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CO0FBQzdC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
