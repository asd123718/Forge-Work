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
import { app, BrowserWindow, Menu, MenuItem } from "electron";
import { RunOnceScheduler } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { mnemonicMenuLabel } from "../../../base/common/labels.js";
import { isMacintosh, language } from "../../../base/common/platform.js";
import { URI } from "../../../base/common/uri.js";
import * as nls from "../../../nls.js";
import { IAuxiliaryWindowsMainService } from "../../auxiliaryWindow/electron-main/auxiliaryWindows.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { isMenubarMenuItemAction, isMenubarMenuItemRecentAction, isMenubarMenuItemSeparator, isMenubarMenuItemSubmenu } from "../common/menubar.js";
import { INativeHostMainService } from "../../native/electron-main/nativeHostMainService.js";
import { IProductService } from "../../product/common/productService.js";
import { IStateService } from "../../state/node/state.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUpdateService, StateType } from "../../update/common/update.js";
import { hasNativeMenu } from "../../window/common/window.js";
import { IWindowsMainService, OpenContext } from "../../windows/electron-main/windows.js";
import { IWorkspacesHistoryMainService } from "../../workspaces/electron-main/workspacesHistoryMainService.js";
import { Disposable } from "../../../base/common/lifecycle.js";
const telemetryFrom = "menu";
let Menubar = class extends Disposable {
  constructor(updateService, configurationService, windowsMainService, environmentMainService, telemetryService, workspacesHistoryMainService, stateService, lifecycleMainService, logService, nativeHostMainService, productService, auxiliaryWindowsMainService) {
    super();
    this.updateService = updateService;
    this.configurationService = configurationService;
    this.windowsMainService = windowsMainService;
    this.environmentMainService = environmentMainService;
    this.telemetryService = telemetryService;
    this.workspacesHistoryMainService = workspacesHistoryMainService;
    this.stateService = stateService;
    this.lifecycleMainService = lifecycleMainService;
    this.logService = logService;
    this.nativeHostMainService = nativeHostMainService;
    this.productService = productService;
    this.auxiliaryWindowsMainService = auxiliaryWindowsMainService;
    this.fallbackMenuHandlers = /* @__PURE__ */ Object.create(null);
    this.menuUpdater = this._register(new RunOnceScheduler(() => this.doUpdateMenu(), 0));
    this.menuGC = this._register(new RunOnceScheduler(() => {
      this.oldMenus = [];
    }, 1e4));
    this.menubarMenus = /* @__PURE__ */ Object.create(null);
    this.keybindings = /* @__PURE__ */ Object.create(null);
    this.showNativeMenu = hasNativeMenu(configurationService);
    if (isMacintosh || this.showNativeMenu) {
      this.restoreCachedMenubarData();
    }
    this.addFallbackHandlers();
    this.closedLastWindow = false;
    this.noActiveMainWindow = false;
    this.oldMenus = [];
    this.install();
    this.registerListeners();
  }
  restoreCachedMenubarData() {
    const menubarData = this.stateService.getItem(Menubar.lastKnownMenubarStorageKey);
    if (menubarData) {
      if (menubarData.menus) {
        this.menubarMenus = menubarData.menus;
      }
      if (menubarData.keybindings) {
        this.keybindings = menubarData.keybindings;
      }
    }
  }
  addFallbackHandlers() {
    this.fallbackMenuHandlers["workbench.action.files.newUntitledFile"] = (menuItem, win, event) => {
      if (!this.runActionInRenderer({ type: "commandId", commandId: "workbench.action.files.newUntitledFile" })) {
        this.windowsMainService.openEmptyWindow({ context: OpenContext.MENU, contextWindowId: win?.id });
      }
    };
    this.fallbackMenuHandlers["workbench.action.newWindow"] = (menuItem, win, event) => this.windowsMainService.openEmptyWindow({ context: OpenContext.MENU, contextWindowId: win?.id });
    this.fallbackMenuHandlers["workbench.action.files.openFileFolder"] = (menuItem, win, event) => this.nativeHostMainService.pickFileFolderAndOpen(void 0, { forceNewWindow: this.isOptionClick(event), telemetryExtraData: { from: telemetryFrom } });
    this.fallbackMenuHandlers["workbench.action.files.openFolder"] = (menuItem, win, event) => this.nativeHostMainService.pickFolderAndOpen(void 0, { forceNewWindow: this.isOptionClick(event), telemetryExtraData: { from: telemetryFrom } });
    this.fallbackMenuHandlers["workbench.action.openWorkspace"] = (menuItem, win, event) => this.nativeHostMainService.pickWorkspaceAndOpen(void 0, { forceNewWindow: this.isOptionClick(event), telemetryExtraData: { from: telemetryFrom } });
    this.fallbackMenuHandlers["workbench.action.clearRecentFiles"] = () => this.workspacesHistoryMainService.clearRecentlyOpened({
      confirm: true
      /* ask for confirmation */
    });
    const youTubeUrl = this.productService.youTubeUrl;
    if (youTubeUrl) {
      this.fallbackMenuHandlers["workbench.action.openYouTubeUrl"] = () => this.openUrl(youTubeUrl, "openYouTubeUrl");
    }
    const requestFeatureUrl = this.productService.requestFeatureUrl;
    if (requestFeatureUrl) {
      this.fallbackMenuHandlers["workbench.action.openRequestFeatureUrl"] = () => this.openUrl(requestFeatureUrl, "openUserVoiceUrl");
    }
    const reportIssueUrl = this.productService.reportIssueUrl;
    if (reportIssueUrl) {
      this.fallbackMenuHandlers["workbench.action.openIssueReporter"] = () => this.openUrl(reportIssueUrl, "openReportIssues");
    }
    const licenseUrl = this.productService.licenseUrl;
    if (licenseUrl) {
      this.fallbackMenuHandlers["workbench.action.openLicenseUrl"] = () => {
        if (language) {
          const queryArgChar = licenseUrl.indexOf("?") > 0 ? "&" : "?";
          this.openUrl(`${licenseUrl}${queryArgChar}lang=${language}`, "openLicenseUrl");
        } else {
          this.openUrl(licenseUrl, "openLicenseUrl");
        }
      };
    }
    const privacyStatementUrl = this.productService.privacyStatementUrl;
    if (privacyStatementUrl && licenseUrl) {
      this.fallbackMenuHandlers["workbench.action.openPrivacyStatementUrl"] = () => {
        this.openUrl(privacyStatementUrl, "openPrivacyStatement");
      };
    }
  }
  registerListeners() {
    this._register(this.lifecycleMainService.onWillShutdown(() => this.willShutdown = true));
    this._register(this.windowsMainService.onDidChangeWindowsCount((e) => this.onDidChangeWindowsCount(e)));
    this._register(this.nativeHostMainService.onDidBlurMainWindow(() => this.onDidChangeWindowFocus()));
    this._register(this.nativeHostMainService.onDidFocusMainWindow(() => this.onDidChangeWindowFocus()));
    this._register(this.updateService.onStateChange(() => this.scheduleUpdateMenu()));
  }
  get currentEnableMenuBarMnemonics() {
    const enableMenuBarMnemonics = this.configurationService.getValue("window.enableMenuBarMnemonics");
    if (typeof enableMenuBarMnemonics !== "boolean") {
      return true;
    }
    return enableMenuBarMnemonics;
  }
  get currentEnableNativeTabs() {
    if (!isMacintosh) {
      return false;
    }
    const enableNativeTabs = this.configurationService.getValue("window.nativeTabs");
    if (typeof enableNativeTabs !== "boolean") {
      return false;
    }
    return enableNativeTabs;
  }
  updateMenu(menubarData, windowId) {
    this.menubarMenus = menubarData.menus;
    this.keybindings = menubarData.keybindings;
    this.stateService.setItem(Menubar.lastKnownMenubarStorageKey, menubarData);
    this.scheduleUpdateMenu();
  }
  scheduleUpdateMenu() {
    this.menuUpdater.schedule();
  }
  doUpdateMenu() {
    if (!this.willShutdown) {
      setTimeout(
        () => {
          if (!this.willShutdown) {
            this.install();
          }
        },
        10
        /* delay this because there is an issue with updating a menu when it is open */
      );
    }
  }
  onDidChangeWindowsCount(e) {
    if (!isMacintosh) {
      return;
    }
    if (e.oldCount === 0 && e.newCount > 0 || e.oldCount > 0 && e.newCount === 0) {
      this.closedLastWindow = e.newCount === 0;
      this.scheduleUpdateMenu();
    }
  }
  onDidChangeWindowFocus() {
    if (!isMacintosh) {
      return;
    }
    const focusedWindow = BrowserWindow.getFocusedWindow();
    this.noActiveMainWindow = !focusedWindow || !!this.auxiliaryWindowsMainService.getWindowByWebContents(focusedWindow.webContents);
    this.scheduleUpdateMenu();
  }
  install() {
    const oldMenu = Menu.getApplicationMenu();
    if (oldMenu) {
      this.oldMenus.push(oldMenu);
    }
    if (Object.keys(this.menubarMenus).length === 0) {
      this.doSetApplicationMenu(isMacintosh ? new Menu() : null);
      return;
    }
    const menubar = new Menu();
    let macApplicationMenuItem;
    if (isMacintosh) {
      const applicationMenu = new Menu();
      macApplicationMenuItem = new MenuItem({ label: this.productService.nameShort, submenu: applicationMenu });
      this.setMacApplicationMenu(applicationMenu);
      menubar.append(macApplicationMenuItem);
    }
    if (isMacintosh && !this.appMenuInstalled) {
      this.appMenuInstalled = true;
      const dockMenu = new Menu();
      dockMenu.append(new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "miNewWindow", comment: ["&& denotes a mnemonic"] }, "New &&Window")), click: () => this.windowsMainService.openEmptyWindow({ context: OpenContext.DOCK }) }));
      app.dock.setMenu(dockMenu);
    }
    if (this.shouldDrawMenu("File")) {
      const fileMenu = new Menu();
      const fileMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mFile", comment: ["&& denotes a mnemonic"] }, "&&File")), submenu: fileMenu });
      this.setMenuById(fileMenu, "File");
      menubar.append(fileMenuItem);
    }
    if (this.shouldDrawMenu("Edit")) {
      const editMenu = new Menu();
      const editMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mEdit", comment: ["&& denotes a mnemonic"] }, "&&Edit")), submenu: editMenu });
      this.setMenuById(editMenu, "Edit");
      menubar.append(editMenuItem);
    }
    if (this.shouldDrawMenu("Selection")) {
      const selectionMenu = new Menu();
      const selectionMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mSelection", comment: ["&& denotes a mnemonic"] }, "&&Selection")), submenu: selectionMenu });
      this.setMenuById(selectionMenu, "Selection");
      menubar.append(selectionMenuItem);
    }
    if (this.shouldDrawMenu("View")) {
      const viewMenu = new Menu();
      const viewMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mView", comment: ["&& denotes a mnemonic"] }, "&&View")), submenu: viewMenu });
      this.setMenuById(viewMenu, "View");
      menubar.append(viewMenuItem);
    }
    if (this.shouldDrawMenu("Go")) {
      const gotoMenu = new Menu();
      const gotoMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mGoto", comment: ["&& denotes a mnemonic"] }, "&&Go")), submenu: gotoMenu });
      this.setMenuById(gotoMenu, "Go");
      menubar.append(gotoMenuItem);
    }
    if (this.shouldDrawMenu("Run")) {
      const debugMenu = new Menu();
      const debugMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mRun", comment: ["&& denotes a mnemonic"] }, "&&Run")), submenu: debugMenu });
      this.setMenuById(debugMenu, "Run");
      menubar.append(debugMenuItem);
    }
    if (this.shouldDrawMenu("Terminal")) {
      const terminalMenu = new Menu();
      const terminalMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mTerminal", comment: ["&& denotes a mnemonic"] }, "&&Terminal")), submenu: terminalMenu });
      this.setMenuById(terminalMenu, "Terminal");
      menubar.append(terminalMenuItem);
    }
    let macWindowMenuItem;
    if (this.shouldDrawMenu("Window")) {
      const windowMenu = new Menu();
      macWindowMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize("mWindow", "Window")), submenu: windowMenu, role: "window" });
      this.setMacWindowMenu(windowMenu);
    }
    if (macWindowMenuItem) {
      menubar.append(macWindowMenuItem);
    }
    if (this.shouldDrawMenu("Help")) {
      const helpMenu = new Menu();
      const helpMenuItem = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "mHelp", comment: ["&& denotes a mnemonic"] }, "&&Help")), submenu: helpMenu, role: "help" });
      this.setMenuById(helpMenu, "Help");
      menubar.append(helpMenuItem);
    }
    if (menubar.items && menubar.items.length > 0) {
      this.doSetApplicationMenu(menubar);
    } else {
      this.doSetApplicationMenu(null);
    }
    this.menuGC.schedule();
  }
  doSetApplicationMenu(menu) {
    Menu.setApplicationMenu(menu);
    if (menu) {
      for (const window of this.auxiliaryWindowsMainService.getWindows()) {
        window.win?.setMenu(null);
      }
    }
  }
  setMacApplicationMenu(macApplicationMenu) {
    const about = this.createMenuItem(nls.localize("mAbout", "About {0}", this.productService.nameLong), "workbench.action.showAboutDialog");
    const checkForUpdates = this.getUpdateMenuItems();
    let preferences;
    if (this.shouldDrawMenu("Preferences")) {
      const preferencesMenu = new Menu();
      this.setMenuById(preferencesMenu, "Preferences");
      preferences = new MenuItem({ label: this.mnemonicLabel(nls.localize({ key: "miPreferences", comment: ["&& denotes a mnemonic"] }, "&&Preferences")), submenu: preferencesMenu });
    }
    const servicesMenu = new Menu();
    const services = new MenuItem({ label: nls.localize("mServices", "Services"), role: "services", submenu: servicesMenu });
    const hide = new MenuItem({ label: nls.localize("mHide", "Hide {0}", this.productService.nameLong), role: "hide", accelerator: "Command+H" });
    const hideOthers = new MenuItem({ label: nls.localize("mHideOthers", "Hide Others"), role: "hideOthers", accelerator: "Command+Alt+H" });
    const showAll = new MenuItem({ label: nls.localize("mShowAll", "Show All"), role: "unhide" });
    const quit = new MenuItem(this.likeAction("workbench.action.quit", {
      label: nls.localize("miQuit", "Quit {0}", this.productService.nameLong),
      click: async (item, window, event) => {
        const lastActiveWindow = this.windowsMainService.getLastActiveWindow();
        if (this.windowsMainService.getWindowCount() === 0 || // allow to quit when no more windows are open
        !!BrowserWindow.getFocusedWindow() || // allow to quit when window has focus (fix for https://github.com/microsoft/vscode/issues/39191)
        lastActiveWindow?.win?.isMinimized()) {
          const confirmed = await this.confirmBeforeQuit(event);
          if (confirmed) {
            this.nativeHostMainService.quit(void 0);
          }
        }
      }
    }));
    const actions = [about];
    actions.push(...checkForUpdates);
    if (preferences) {
      actions.push(...[
        __separator__(),
        preferences
      ]);
    }
    actions.push(...[
      __separator__(),
      services,
      __separator__(),
      hide,
      hideOthers,
      showAll,
      __separator__(),
      quit
    ]);
    actions.forEach((i) => macApplicationMenu.append(i));
  }
  async confirmBeforeQuit(event) {
    if (this.windowsMainService.getWindowCount() === 0) {
      return true;
    }
    const confirmBeforeClose = this.configurationService.getValue("window.confirmBeforeClose");
    if (confirmBeforeClose === "always" || confirmBeforeClose === "keyboardOnly" && this.isKeyboardEvent(event)) {
      const { response } = await this.nativeHostMainService.showMessageBox(this.windowsMainService.getFocusedWindow()?.id, {
        type: "question",
        buttons: [
          isMacintosh ? nls.localize({ key: "quit", comment: ["&& denotes a mnemonic"] }, "&&Quit") : nls.localize({ key: "exit", comment: ["&& denotes a mnemonic"] }, "&&Exit"),
          nls.localize("cancel", "Cancel")
        ],
        message: isMacintosh ? nls.localize("quitMessageMac", "Are you sure you want to quit?") : nls.localize("quitMessage", "Are you sure you want to exit?")
      });
      return response === 0;
    }
    return true;
  }
  shouldDrawMenu(menuId) {
    if (!isMacintosh && !this.showNativeMenu) {
      return false;
    }
    switch (menuId) {
      case "File":
      case "Help":
        if (isMacintosh) {
          return this.windowsMainService.getWindowCount() === 0 && this.closedLastWindow || this.windowsMainService.getWindowCount() > 0 && this.noActiveMainWindow || !!this.menubarMenus && !!this.menubarMenus[menuId];
        }
      case "Window":
        if (isMacintosh) {
          return this.windowsMainService.getWindowCount() === 0 && this.closedLastWindow || this.windowsMainService.getWindowCount() > 0 && this.noActiveMainWindow || !!this.menubarMenus;
        }
      default:
        return this.windowsMainService.getWindowCount() > 0 && (!!this.menubarMenus && !!this.menubarMenus[menuId]);
    }
  }
  setMenu(menu, items) {
    items.forEach((item) => {
      if (isMenubarMenuItemSeparator(item)) {
        menu.append(__separator__());
      } else if (isMenubarMenuItemSubmenu(item)) {
        const submenu = new Menu();
        const submenuItem = new MenuItem({ label: this.mnemonicLabel(item.label), submenu });
        this.setMenu(submenu, item.submenu.items);
        menu.append(submenuItem);
      } else if (isMenubarMenuItemRecentAction(item)) {
        menu.append(this.createOpenRecentMenuItem(item));
      } else if (isMenubarMenuItemAction(item)) {
        if (item.id === "workbench.action.showAboutDialog") {
          this.insertCheckForUpdatesItems(menu);
        }
        if (isMacintosh) {
          if (this.windowsMainService.getWindowCount() === 0 && this.closedLastWindow || this.windowsMainService.getWindowCount() > 0 && this.noActiveMainWindow) {
            if (this.fallbackMenuHandlers[item.id]) {
              menu.append(new MenuItem(this.likeAction(item.id, { label: this.mnemonicLabel(item.label), click: this.fallbackMenuHandlers[item.id] })));
            } else {
              menu.append(this.createMenuItem(item.label, item.id, false, item.checked));
            }
          } else {
            menu.append(this.createMenuItem(item.label, item.id, item.enabled !== false, !!item.checked));
          }
        } else {
          menu.append(this.createMenuItem(item.label, item.id, item.enabled !== false, !!item.checked));
        }
      }
    });
  }
  setMenuById(menu, menuId) {
    if (this.menubarMenus?.[menuId]) {
      this.setMenu(menu, this.menubarMenus[menuId].items);
    }
  }
  insertCheckForUpdatesItems(menu) {
    const updateItems = this.getUpdateMenuItems();
    if (updateItems.length) {
      updateItems.forEach((i) => menu.append(i));
      menu.append(__separator__());
    }
  }
  createOpenRecentMenuItem(item) {
    const revivedUri = URI.revive(item.uri);
    const commandId = item.id;
    const openable = commandId === "openRecentFile" ? { fileUri: revivedUri } : commandId === "openRecentWorkspace" ? { workspaceUri: revivedUri } : { folderUri: revivedUri };
    return new MenuItem(this.likeAction(commandId, {
      label: item.label,
      click: async (menuItem, win, event) => {
        const openInNewWindow = this.isOptionClick(event);
        const success = (await this.windowsMainService.open({
          context: OpenContext.MENU,
          cli: this.environmentMainService.args,
          urisToOpen: [openable],
          forceNewWindow: openInNewWindow,
          gotoLineMode: false,
          remoteAuthority: item.remoteAuthority
        })).length > 0;
        if (!success) {
          await this.workspacesHistoryMainService.removeRecentlyOpened([revivedUri]);
        }
      }
    }, false));
  }
  isOptionClick(event) {
    return !!(event && (!isMacintosh && (event.ctrlKey || event.shiftKey) || isMacintosh && (event.metaKey || event.altKey)));
  }
  isKeyboardEvent(event) {
    return !!(event.triggeredByAccelerator || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);
  }
  createRoleMenuItem(label, commandId, role) {
    const options = {
      label: this.mnemonicLabel(label),
      role,
      enabled: true
    };
    return new MenuItem(this.withKeybinding(commandId, options));
  }
  setMacWindowMenu(macWindowMenu) {
    const minimize = new MenuItem({ label: nls.localize("mMinimize", "Minimize"), role: "minimize", accelerator: "Command+M", enabled: this.windowsMainService.getWindowCount() > 0 });
    const zoom = new MenuItem({ label: nls.localize("mZoom", "Zoom"), role: "zoom", enabled: this.windowsMainService.getWindowCount() > 0 });
    const bringAllToFront = new MenuItem({ label: nls.localize("mBringToFront", "Bring All to Front"), role: "front", enabled: this.windowsMainService.getWindowCount() > 0 });
    const switchWindow = this.createMenuItem(nls.localize({ key: "miSwitchWindow", comment: ["&& denotes a mnemonic"] }, "Switch &&Window..."), "workbench.action.switchWindow");
    const nativeTabMenuItems = [];
    if (this.currentEnableNativeTabs) {
      nativeTabMenuItems.push(__separator__());
      nativeTabMenuItems.push(this.createMenuItem(nls.localize("mNewTab", "New Tab"), "workbench.action.newWindowTab"));
      nativeTabMenuItems.push(this.createRoleMenuItem(nls.localize("mShowPreviousTab", "Show Previous Tab"), "workbench.action.showPreviousWindowTab", "selectPreviousTab"));
      nativeTabMenuItems.push(this.createRoleMenuItem(nls.localize("mShowNextTab", "Show Next Tab"), "workbench.action.showNextWindowTab", "selectNextTab"));
      nativeTabMenuItems.push(this.createRoleMenuItem(nls.localize("mMoveTabToNewWindow", "Move Tab to New Window"), "workbench.action.moveWindowTabToNewWindow", "moveTabToNewWindow"));
      nativeTabMenuItems.push(this.createRoleMenuItem(nls.localize("mMergeAllWindows", "Merge All Windows"), "workbench.action.mergeAllWindowTabs", "mergeAllWindows"));
    }
    [
      minimize,
      zoom,
      __separator__(),
      switchWindow,
      ...nativeTabMenuItems,
      __separator__(),
      bringAllToFront
    ].forEach((item) => macWindowMenu.append(item));
  }
  getUpdateMenuItems() {
    const state = this.updateService.state;
    switch (state.type) {
      case StateType.Idle:
        return [new MenuItem({
          label: this.mnemonicLabel(nls.localize("miCheckForUpdates", "Check for &&Updates...")),
          click: () => setTimeout(() => {
            this.reportMenuActionTelemetry("CheckForUpdate");
            this.updateService.checkForUpdates(true);
          }, 0)
        })];
      case StateType.CheckingForUpdates:
        return [new MenuItem({ label: nls.localize("miCheckingForUpdates", "Checking for Updates..."), enabled: false })];
      case StateType.AvailableForDownload:
        return [new MenuItem({
          label: this.mnemonicLabel(nls.localize("miDownloadUpdate", "D&&ownload Available Update")),
          click: () => {
            this.updateService.downloadUpdate(true);
          }
        })];
      case StateType.Downloading:
      case StateType.Overwriting:
        return [new MenuItem({ label: nls.localize("miDownloadingUpdate", "Downloading Update..."), enabled: false })];
      case StateType.Downloaded:
        return isMacintosh ? [] : [new MenuItem({
          label: this.mnemonicLabel(nls.localize("miInstallUpdate", "Install &&Update...")),
          click: () => {
            this.reportMenuActionTelemetry("InstallUpdate");
            this.updateService.applyUpdate();
          }
        })];
      case StateType.Updating:
        return [new MenuItem({ label: nls.localize("miInstallingUpdate", "Installing Update..."), enabled: false })];
      case StateType.Cancelling:
        return [new MenuItem({ label: nls.localize("miCancellingUpdate", "Cancelling Update..."), enabled: false })];
      case StateType.Ready:
        return [new MenuItem({
          label: this.mnemonicLabel(nls.localize("miRestartToUpdate", "Restart to &&Update")),
          click: () => {
            this.reportMenuActionTelemetry("RestartToUpdate");
            this.updateService.quitAndInstall();
          }
        })];
      default:
        return [];
    }
  }
  createMenuItem(labelOpt, commandId, enabledOpt, checkedOpt) {
    const label = this.mnemonicLabel(labelOpt);
    const click = (menuItem, window, event) => {
      const userSettingsLabel = menuItem ? menuItem.userSettingsLabel : null;
      if (userSettingsLabel && event.triggeredByAccelerator) {
        this.runActionInRenderer({ type: "keybinding", userSettingsLabel });
      } else {
        this.runActionInRenderer({ type: "commandId", commandId });
      }
    };
    const enabled = typeof enabledOpt === "boolean" ? enabledOpt : this.windowsMainService.getWindowCount() > 0;
    const checked = typeof checkedOpt === "boolean" ? checkedOpt : false;
    const options = {
      label,
      click,
      enabled
    };
    if (checked) {
      options.type = "checkbox";
      options.checked = checked;
    }
    if (isMacintosh) {
      if (commandId === "editor.action.clipboardCutAction") {
        options.role = "cut";
      } else if (commandId === "editor.action.clipboardCopyAction") {
        options.role = "copy";
      } else if (commandId === "editor.action.clipboardPasteAction") {
        options.role = "paste";
      }
      if (commandId === "undo") {
        options.click = this.makeContextAwareClickHandler(click, {
          inDevTools: (devTools) => devTools.undo(),
          inNoWindow: () => Menu.sendActionToFirstResponder("undo:")
        });
      } else if (commandId === "redo") {
        options.click = this.makeContextAwareClickHandler(click, {
          inDevTools: (devTools) => devTools.redo(),
          inNoWindow: () => Menu.sendActionToFirstResponder("redo:")
        });
      } else if (commandId === "editor.action.selectAll") {
        options.click = this.makeContextAwareClickHandler(click, {
          inDevTools: (devTools) => devTools.selectAll(),
          inNoWindow: () => Menu.sendActionToFirstResponder("selectAll:")
        });
      }
    }
    return new MenuItem(this.withKeybinding(commandId, options));
  }
  makeContextAwareClickHandler(click, contextSpecificHandlers) {
    return (menuItem, win, event) => {
      const activeWindow = BrowserWindow.getFocusedWindow();
      if (!activeWindow) {
        return contextSpecificHandlers.inNoWindow();
      }
      if (activeWindow.webContents.isDevToolsFocused() && activeWindow.webContents.devToolsWebContents) {
        return contextSpecificHandlers.inDevTools(activeWindow.webContents.devToolsWebContents);
      }
      if (!activeWindow.webContents.isFocused()) {
        return contextSpecificHandlers.inNoWindow();
      }
      click(menuItem, win || activeWindow, event);
    };
  }
  runActionInRenderer(invocation) {
    let activeBrowserWindow = BrowserWindow.getFocusedWindow();
    if (activeBrowserWindow) {
      const auxiliaryWindowCandidate = this.auxiliaryWindowsMainService.getWindowByWebContents(activeBrowserWindow.webContents);
      if (auxiliaryWindowCandidate) {
        activeBrowserWindow = this.windowsMainService.getWindowById(auxiliaryWindowCandidate.parentId)?.win ?? null;
      }
    }
    if (!activeBrowserWindow) {
      const lastActiveWindow = this.windowsMainService.getLastActiveWindow();
      if (lastActiveWindow?.win?.isMinimized()) {
        activeBrowserWindow = lastActiveWindow.win;
      }
    }
    const activeWindow = activeBrowserWindow ? this.windowsMainService.getWindowById(activeBrowserWindow.id) : void 0;
    if (activeWindow) {
      this.logService.trace("menubar#runActionInRenderer", invocation);
      if (isMacintosh && !this.environmentMainService.isBuilt && !activeWindow.isReady) {
        if (invocation.type === "commandId" && invocation.commandId === "workbench.action.toggleDevTools" || invocation.type !== "commandId" && invocation.userSettingsLabel === "alt+cmd+i") {
          return false;
        }
      }
      if (invocation.type === "commandId") {
        const runActionPayload = { id: invocation.commandId, from: "menu" };
        activeWindow.sendWhenReady("vscode:runAction", CancellationToken.None, runActionPayload);
      } else {
        const runKeybindingPayload = { userSettingsLabel: invocation.userSettingsLabel };
        activeWindow.sendWhenReady("vscode:runKeybinding", CancellationToken.None, runKeybindingPayload);
      }
      return true;
    } else {
      this.logService.trace("menubar#runActionInRenderer: no active window found", invocation);
      return false;
    }
  }
  withKeybinding(commandId, options) {
    const binding = typeof commandId === "string" ? this.keybindings[commandId] : void 0;
    if (binding?.label) {
      if (binding.isNative !== false) {
        options.accelerator = binding.label;
        options.userSettingsLabel = binding.userSettingsLabel;
      } else if (typeof options.label === "string") {
        const bindingIndex = options.label.indexOf("[");
        if (bindingIndex >= 0) {
          options.label = `${options.label.substr(0, bindingIndex)} [${binding.label}]`;
        } else {
          options.label = `${options.label} [${binding.label}]`;
        }
      }
    } else {
      options.accelerator = void 0;
    }
    return options;
  }
  likeAction(commandId, options, setAccelerator = !options.accelerator) {
    if (setAccelerator) {
      options = this.withKeybinding(commandId, options);
    }
    const originalClick = options.click;
    options.click = (item, window, event) => {
      this.reportMenuActionTelemetry(commandId);
      originalClick?.(item, window, event);
    };
    return options;
  }
  openUrl(url, id) {
    this.nativeHostMainService.openExternal(void 0, url);
    this.reportMenuActionTelemetry(id);
  }
  reportMenuActionTelemetry(id) {
    this.telemetryService.publicLog2("workbenchActionExecuted", { id, from: telemetryFrom });
  }
  mnemonicLabel(label) {
    return mnemonicMenuLabel(label, !this.currentEnableMenuBarMnemonics);
  }
};
Menubar.lastKnownMenubarStorageKey = "lastKnownMenubarData";
Menubar = __decorateClass([
  __decorateParam(0, IUpdateService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWindowsMainService),
  __decorateParam(3, IEnvironmentMainService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IWorkspacesHistoryMainService),
  __decorateParam(6, IStateService),
  __decorateParam(7, ILifecycleMainService),
  __decorateParam(8, ILogService),
  __decorateParam(9, INativeHostMainService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IAuxiliaryWindowsMainService)
], Menubar);
function __separator__() {
  return new MenuItem({ type: "separator" });
}
export {
  Menubar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbWVudWJhclxcZWxlY3Ryb24tbWFpblxcbWVudWJhci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFwcCwgQnJvd3NlcldpbmRvdywgQmFzZVdpbmRvdywgS2V5Ym9hcmRFdmVudCwgTWVudSwgTWVudUl0ZW0sIE1lbnVJdGVtQ29uc3RydWN0b3JPcHRpb25zLCBXZWJDb250ZW50cyB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBtbmVtb25pY01lbnVMYWJlbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgbGFuZ3VhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYXV4aWxpYXJ5V2luZG93L2VsZWN0cm9uLW1haW4vYXV4aWxpYXJ5V2luZG93cy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9lbGVjdHJvbi1tYWluL2xpZmVjeWNsZU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1lbnViYXJEYXRhLCBJTWVudWJhcktleWJpbmRpbmcsIElNZW51YmFyTWVudSwgSU1lbnViYXJNZW51UmVjZW50SXRlbUFjdGlvbiwgaXNNZW51YmFyTWVudUl0ZW1BY3Rpb24sIGlzTWVudWJhck1lbnVJdGVtUmVjZW50QWN0aW9uLCBpc01lbnViYXJNZW51SXRlbVNlcGFyYXRvciwgaXNNZW51YmFyTWVudUl0ZW1TdWJtZW51LCBNZW51YmFyTWVudUl0ZW0gfSBmcm9tICcuLi9jb21tb24vbWVudWJhci5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbmF0aXZlL2VsZWN0cm9uLW1haW4vbmF0aXZlSG9zdE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdGF0ZS9ub2RlL3N0YXRlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVwZGF0ZVNlcnZpY2UsIFN0YXRlVHlwZSB9IGZyb20gJy4uLy4uL3VwZGF0ZS9jb21tb24vdXBkYXRlLmpzJztcbmltcG9ydCB7IElOYXRpdmVSdW5BY3Rpb25JbldpbmRvd1JlcXVlc3QsIElOYXRpdmVSdW5LZXliaW5kaW5nSW5XaW5kb3dSZXF1ZXN0LCBJV2luZG93T3BlbmFibGUsIGhhc05hdGl2ZU1lbnUgfSBmcm9tICcuLi8uLi93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJV2luZG93c0NvdW50Q2hhbmdlZEV2ZW50LCBJV2luZG93c01haW5TZXJ2aWNlLCBPcGVuQ29udGV4dCB9IGZyb20gJy4uLy4uL3dpbmRvd3MvZWxlY3Ryb24tbWFpbi93aW5kb3dzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlcy9lbGVjdHJvbi1tYWluL3dvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmNvbnN0IHRlbGVtZXRyeUZyb20gPSAnbWVudSc7XG5cbmludGVyZmFjZSBJTWVudUl0ZW1DbGlja0hhbmRsZXIge1xuXHRpbkRldlRvb2xzOiAoY29udGVudHM6IFdlYkNvbnRlbnRzKSA9PiB2b2lkO1xuXHRpbk5vV2luZG93OiAoKSA9PiB2b2lkO1xufVxuXG50eXBlIElNZW51SXRlbUludm9jYXRpb24gPSAoXG5cdHsgdHlwZTogJ2NvbW1hbmRJZCc7IGNvbW1hbmRJZDogc3RyaW5nIH1cblx0fCB7IHR5cGU6ICdrZXliaW5kaW5nJzsgdXNlclNldHRpbmdzTGFiZWw6IHN0cmluZyB9XG4pO1xuXG5pbnRlcmZhY2UgSU1lbnVJdGVtV2l0aEtleWJpbmRpbmcge1xuXHR1c2VyU2V0dGluZ3NMYWJlbD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIE1lbnViYXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBsYXN0S25vd25NZW51YmFyU3RvcmFnZUtleSA9ICdsYXN0S25vd25NZW51YmFyRGF0YSc7XG5cblx0cHJpdmF0ZSB3aWxsU2h1dGRvd246IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXBwTWVudUluc3RhbGxlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjbG9zZWRMYXN0V2luZG93OiBib29sZWFuO1xuXHRwcml2YXRlIG5vQWN0aXZlTWFpbldpbmRvdzogYm9vbGVhbjtcblx0cHJpdmF0ZSBzaG93TmF0aXZlTWVudTogYm9vbGVhbjtcblxuXHRwcml2YXRlIG1lbnVVcGRhdGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIG1lbnVHQzogUnVuT25jZVNjaGVkdWxlcjtcblxuXHQvLyBBcnJheSB0byBrZWVwIG1lbnVzIGFyb3VuZCBzbyB0aGF0IEdDIGRvZXNuJ3QgY2F1c2UgY3Jhc2ggYXMgZXhwbGFpbmVkIGluICM1NTM0N1xuXHQvLyBUT0RPQHNiYXR0ZW4gUmVtb3ZlIHRoaXMgd2hlbiBmaXhlZCB1cHN0cmVhbSBieSBFbGVjdHJvblxuXHRwcml2YXRlIG9sZE1lbnVzOiBNZW51W107XG5cblx0cHJpdmF0ZSBtZW51YmFyTWVudXM6IHsgW2lkOiBzdHJpbmddOiBJTWVudWJhck1lbnUgfTtcblxuXHRwcml2YXRlIGtleWJpbmRpbmdzOiB7IFtjb21tYW5kSWQ6IHN0cmluZ106IElNZW51YmFyS2V5YmluZGluZyB9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZmFsbGJhY2tNZW51SGFuZGxlcnM6IHsgW2lkOiBzdHJpbmddOiAobWVudUl0ZW06IE1lbnVJdGVtLCBicm93c2VyV2luZG93OiBCYXNlV2luZG93IHwgdW5kZWZpbmVkLCBldmVudDogS2V5Ym9hcmRFdmVudCkgPT4gdm9pZCB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVwZGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cGRhdGVTZXJ2aWNlOiBJVXBkYXRlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdpbmRvd3NNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdpbmRvd3NNYWluU2VydmljZTogSVdpbmRvd3NNYWluU2VydmljZSxcblx0XHRASUVudmlyb25tZW50TWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudE1haW5TZXJ2aWNlOiBJRW52aXJvbm1lbnRNYWluU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlOiBJV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSxcblx0XHRASVN0YXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXRlU2VydmljZTogSVN0YXRlU2VydmljZSxcblx0XHRASUxpZmVjeWNsZU1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlTWFpblNlcnZpY2U6IElMaWZlY3ljbGVNYWluU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5hdGl2ZUhvc3RNYWluU2VydmljZTogSU5hdGl2ZUhvc3RNYWluU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZTogSUF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5tZW51VXBkYXRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuZG9VcGRhdGVNZW51KCksIDApKTtcblxuXHRcdHRoaXMubWVudUdDID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4geyB0aGlzLm9sZE1lbnVzID0gW107IH0sIDEwMDAwKSk7XG5cblx0XHR0aGlzLm1lbnViYXJNZW51cyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5rZXliaW5kaW5ncyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5zaG93TmF0aXZlTWVudSA9IGhhc05hdGl2ZU1lbnUoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0aWYgKGlzTWFjaW50b3NoIHx8IHRoaXMuc2hvd05hdGl2ZU1lbnUpIHtcblx0XHRcdHRoaXMucmVzdG9yZUNhY2hlZE1lbnViYXJEYXRhKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5hZGRGYWxsYmFja0hhbmRsZXJzKCk7XG5cblx0XHR0aGlzLmNsb3NlZExhc3RXaW5kb3cgPSBmYWxzZTtcblx0XHR0aGlzLm5vQWN0aXZlTWFpbldpbmRvdyA9IGZhbHNlO1xuXG5cdFx0dGhpcy5vbGRNZW51cyA9IFtdO1xuXG5cdFx0dGhpcy5pbnN0YWxsKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVDYWNoZWRNZW51YmFyRGF0YSgpIHtcblx0XHRjb25zdCBtZW51YmFyRGF0YSA9IHRoaXMuc3RhdGVTZXJ2aWNlLmdldEl0ZW08SU1lbnViYXJEYXRhPihNZW51YmFyLmxhc3RLbm93bk1lbnViYXJTdG9yYWdlS2V5KTtcblx0XHRpZiAobWVudWJhckRhdGEpIHtcblx0XHRcdGlmIChtZW51YmFyRGF0YS5tZW51cykge1xuXHRcdFx0XHR0aGlzLm1lbnViYXJNZW51cyA9IG1lbnViYXJEYXRhLm1lbnVzO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobWVudWJhckRhdGEua2V5YmluZGluZ3MpIHtcblx0XHRcdFx0dGhpcy5rZXliaW5kaW5ncyA9IG1lbnViYXJEYXRhLmtleWJpbmRpbmdzO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWRkRmFsbGJhY2tIYW5kbGVycygpOiB2b2lkIHtcblxuXHRcdC8vIEZpbGUgTWVudSBJdGVtc1xuXHRcdHRoaXMuZmFsbGJhY2tNZW51SGFuZGxlcnNbJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMubmV3VW50aXRsZWRGaWxlJ10gPSAobWVudUl0ZW0sIHdpbiwgZXZlbnQpID0+IHtcblx0XHRcdGlmICghdGhpcy5ydW5BY3Rpb25JblJlbmRlcmVyKHsgdHlwZTogJ2NvbW1hbmRJZCcsIGNvbW1hbmRJZDogJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMubmV3VW50aXRsZWRGaWxlJyB9KSkgeyAvLyB0aGlzIGlzIG9uZSBvZiB0aGUgZmV3IHN1cHBvcnRlZCBhY3Rpb25zIHdoZW4gYXV4IHdpbmRvdyBoYXMgZm9jdXNcblx0XHRcdFx0dGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub3BlbkVtcHR5V2luZG93KHsgY29udGV4dDogT3BlbkNvbnRleHQuTUVOVSwgY29udGV4dFdpbmRvd0lkOiB3aW4/LmlkIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5mYWxsYmFja01lbnVIYW5kbGVyc1snd29ya2JlbmNoLmFjdGlvbi5uZXdXaW5kb3cnXSA9IChtZW51SXRlbSwgd2luLCBldmVudCkgPT4gdGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub3BlbkVtcHR5V2luZG93KHsgY29udGV4dDogT3BlbkNvbnRleHQuTUVOVSwgY29udGV4dFdpbmRvd0lkOiB3aW4/LmlkIH0pO1xuXHRcdHRoaXMuZmFsbGJhY2tNZW51SGFuZGxlcnNbJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMub3BlbkZpbGVGb2xkZXInXSA9IChtZW51SXRlbSwgd2luLCBldmVudCkgPT4gdGhpcy5uYXRpdmVIb3N0TWFpblNlcnZpY2UucGlja0ZpbGVGb2xkZXJBbmRPcGVuKHVuZGVmaW5lZCwgeyBmb3JjZU5ld1dpbmRvdzogdGhpcy5pc09wdGlvbkNsaWNrKGV2ZW50KSwgdGVsZW1ldHJ5RXh0cmFEYXRhOiB7IGZyb206IHRlbGVtZXRyeUZyb20gfSB9KTtcblx0XHR0aGlzLmZhbGxiYWNrTWVudUhhbmRsZXJzWyd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLm9wZW5Gb2xkZXInXSA9IChtZW51SXRlbSwgd2luLCBldmVudCkgPT4gdGhpcy5uYXRpdmVIb3N0TWFpblNlcnZpY2UucGlja0ZvbGRlckFuZE9wZW4odW5kZWZpbmVkLCB7IGZvcmNlTmV3V2luZG93OiB0aGlzLmlzT3B0aW9uQ2xpY2soZXZlbnQpLCB0ZWxlbWV0cnlFeHRyYURhdGE6IHsgZnJvbTogdGVsZW1ldHJ5RnJvbSB9IH0pO1xuXHRcdHRoaXMuZmFsbGJhY2tNZW51SGFuZGxlcnNbJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbldvcmtzcGFjZSddID0gKG1lbnVJdGVtLCB3aW4sIGV2ZW50KSA9PiB0aGlzLm5hdGl2ZUhvc3RNYWluU2VydmljZS5waWNrV29ya3NwYWNlQW5kT3Blbih1bmRlZmluZWQsIHsgZm9yY2VOZXdXaW5kb3c6IHRoaXMuaXNPcHRpb25DbGljayhldmVudCksIHRlbGVtZXRyeUV4dHJhRGF0YTogeyBmcm9tOiB0ZWxlbWV0cnlGcm9tIH0gfSk7XG5cblx0XHQvLyBSZWNlbnQgTWVudSBJdGVtc1xuXHRcdHRoaXMuZmFsbGJhY2tNZW51SGFuZGxlcnNbJ3dvcmtiZW5jaC5hY3Rpb24uY2xlYXJSZWNlbnRGaWxlcyddID0gKCkgPT4gdGhpcy53b3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLmNsZWFyUmVjZW50bHlPcGVuZWQoeyBjb25maXJtOiB0cnVlIC8qIGFzayBmb3IgY29uZmlybWF0aW9uICovIH0pO1xuXG5cdFx0Ly8gSGVscCBNZW51IEl0ZW1zXG5cdFx0Y29uc3QgeW91VHViZVVybCA9IHRoaXMucHJvZHVjdFNlcnZpY2UueW91VHViZVVybDtcblx0XHRpZiAoeW91VHViZVVybCkge1xuXHRcdFx0dGhpcy5mYWxsYmFja01lbnVIYW5kbGVyc1snd29ya2JlbmNoLmFjdGlvbi5vcGVuWW91VHViZVVybCddID0gKCkgPT4gdGhpcy5vcGVuVXJsKHlvdVR1YmVVcmwsICdvcGVuWW91VHViZVVybCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcXVlc3RGZWF0dXJlVXJsID0gdGhpcy5wcm9kdWN0U2VydmljZS5yZXF1ZXN0RmVhdHVyZVVybDtcblx0XHRpZiAocmVxdWVzdEZlYXR1cmVVcmwpIHtcblx0XHRcdHRoaXMuZmFsbGJhY2tNZW51SGFuZGxlcnNbJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblJlcXVlc3RGZWF0dXJlVXJsJ10gPSAoKSA9PiB0aGlzLm9wZW5VcmwocmVxdWVzdEZlYXR1cmVVcmwsICdvcGVuVXNlclZvaWNlVXJsJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwb3J0SXNzdWVVcmwgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLnJlcG9ydElzc3VlVXJsO1xuXHRcdGlmIChyZXBvcnRJc3N1ZVVybCkge1xuXHRcdFx0dGhpcy5mYWxsYmFja01lbnVIYW5kbGVyc1snd29ya2JlbmNoLmFjdGlvbi5vcGVuSXNzdWVSZXBvcnRlciddID0gKCkgPT4gdGhpcy5vcGVuVXJsKHJlcG9ydElzc3VlVXJsLCAnb3BlblJlcG9ydElzc3VlcycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpY2Vuc2VVcmwgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmxpY2Vuc2VVcmw7XG5cdFx0aWYgKGxpY2Vuc2VVcmwpIHtcblx0XHRcdHRoaXMuZmFsbGJhY2tNZW51SGFuZGxlcnNbJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkxpY2Vuc2VVcmwnXSA9ICgpID0+IHtcblx0XHRcdFx0aWYgKGxhbmd1YWdlKSB7XG5cdFx0XHRcdFx0Y29uc3QgcXVlcnlBcmdDaGFyID0gbGljZW5zZVVybC5pbmRleE9mKCc/JykgPiAwID8gJyYnIDogJz8nO1xuXHRcdFx0XHRcdHRoaXMub3BlblVybChgJHtsaWNlbnNlVXJsfSR7cXVlcnlBcmdDaGFyfWxhbmc9JHtsYW5ndWFnZX1gLCAnb3BlbkxpY2Vuc2VVcmwnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLm9wZW5VcmwobGljZW5zZVVybCwgJ29wZW5MaWNlbnNlVXJsJyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJpdmFjeVN0YXRlbWVudFVybCA9IHRoaXMucHJvZHVjdFNlcnZpY2UucHJpdmFjeVN0YXRlbWVudFVybDtcblx0XHRpZiAocHJpdmFjeVN0YXRlbWVudFVybCAmJiBsaWNlbnNlVXJsKSB7XG5cdFx0XHR0aGlzLmZhbGxiYWNrTWVudUhhbmRsZXJzWyd3b3JrYmVuY2guYWN0aW9uLm9wZW5Qcml2YWN5U3RhdGVtZW50VXJsJ10gPSAoKSA9PiB7XG5cdFx0XHRcdHRoaXMub3BlblVybChwcml2YWN5U3RhdGVtZW50VXJsLCAnb3BlblByaXZhY3lTdGF0ZW1lbnQnKTtcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIEtlZXAgZmxhZyB3aGVuIGFwcCBxdWl0c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2Uub25XaWxsU2h1dGRvd24oKCkgPT4gdGhpcy53aWxsU2h1dGRvd24gPSB0cnVlKSk7XG5cblx0XHQvLyBMaXN0ZW4gdG8gc29tZSBldmVudHMgZnJvbSB3aW5kb3cgc2VydmljZSB0byB1cGRhdGUgbWVudVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2luZG93c01haW5TZXJ2aWNlLm9uRGlkQ2hhbmdlV2luZG93c0NvdW50KGUgPT4gdGhpcy5vbkRpZENoYW5nZVdpbmRvd3NDb3VudChlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubmF0aXZlSG9zdE1haW5TZXJ2aWNlLm9uRGlkQmx1ck1haW5XaW5kb3coKCkgPT4gdGhpcy5vbkRpZENoYW5nZVdpbmRvd0ZvY3VzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm5hdGl2ZUhvc3RNYWluU2VydmljZS5vbkRpZEZvY3VzTWFpbldpbmRvdygoKSA9PiB0aGlzLm9uRGlkQ2hhbmdlV2luZG93Rm9jdXMoKSkpO1xuXG5cdFx0Ly8gUmVidWlsZCBtZW51IHdoZW4gdXBkYXRlIHN0YXRlIGNoYW5nZXMgc28gdXBkYXRlIG1lbnUgaXRlbXMgcmVmbGVjdFxuXHRcdC8vIHRoZSBjdXJyZW50IHN0YXRlIChlLmcuIFwiUmVzdGFydCB0byBVcGRhdGVcIiBpbnN0ZWFkIG9mIFwiQ2hlY2sgZm9yIFVwZGF0ZXMuLi5cIikuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51cGRhdGVTZXJ2aWNlLm9uU3RhdGVDaGFuZ2UoKCkgPT4gdGhpcy5zY2hlZHVsZVVwZGF0ZU1lbnUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgY3VycmVudEVuYWJsZU1lbnVCYXJNbmVtb25pY3MoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZW5hYmxlTWVudUJhck1uZW1vbmljcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3dpbmRvdy5lbmFibGVNZW51QmFyTW5lbW9uaWNzJyk7XG5cdFx0aWYgKHR5cGVvZiBlbmFibGVNZW51QmFyTW5lbW9uaWNzICE9PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbmFibGVNZW51QmFyTW5lbW9uaWNzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgY3VycmVudEVuYWJsZU5hdGl2ZVRhYnMoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFpc01hY2ludG9zaCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVuYWJsZU5hdGl2ZVRhYnMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3aW5kb3cubmF0aXZlVGFicycpO1xuXHRcdGlmICh0eXBlb2YgZW5hYmxlTmF0aXZlVGFicyAhPT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBlbmFibGVOYXRpdmVUYWJzO1xuXHR9XG5cblx0dXBkYXRlTWVudShtZW51YmFyRGF0YTogSU1lbnViYXJEYXRhLCB3aW5kb3dJZDogbnVtYmVyKSB7XG5cdFx0dGhpcy5tZW51YmFyTWVudXMgPSBtZW51YmFyRGF0YS5tZW51cztcblx0XHR0aGlzLmtleWJpbmRpbmdzID0gbWVudWJhckRhdGEua2V5YmluZGluZ3M7XG5cblx0XHQvLyBTYXZlIG9mZiBuZXcgbWVudSBhbmQga2V5YmluZGluZ3Ncblx0XHR0aGlzLnN0YXRlU2VydmljZS5zZXRJdGVtKE1lbnViYXIubGFzdEtub3duTWVudWJhclN0b3JhZ2VLZXksIG1lbnViYXJEYXRhKTtcblxuXHRcdHRoaXMuc2NoZWR1bGVVcGRhdGVNZW51KCk7XG5cdH1cblxuXG5cdHByaXZhdGUgc2NoZWR1bGVVcGRhdGVNZW51KCk6IHZvaWQge1xuXHRcdHRoaXMubWVudVVwZGF0ZXIuc2NoZWR1bGUoKTsgLy8gYnVmZmVyIG11bHRpcGxlIGF0dGVtcHRzIHRvIHVwZGF0ZSB0aGUgbWVudVxuXHR9XG5cblx0cHJpdmF0ZSBkb1VwZGF0ZU1lbnUoKTogdm9pZCB7XG5cblx0XHQvLyBEdWUgdG8gbGltaXRhdGlvbnMgaW4gRWxlY3Ryb24sIGl0IGlzIG5vdCBwb3NzaWJsZSB0byB1cGRhdGUgbWVudSBpdGVtcyBkeW5hbWljYWxseS4gVGhlIHN1Z2dlc3RlZFxuXHRcdC8vIHdvcmthcm91bmQgZnJvbSBFbGVjdHJvbiBpcyB0byBzZXQgdGhlIGFwcGxpY2F0aW9uIG1lbnUgYWdhaW4uXG5cdFx0Ly8gU2VlIGFsc28gaHR0cHM6Ly9naXRodWIuY29tL2VsZWN0cm9uL2VsZWN0cm9uL2lzc3Vlcy84NDZcblx0XHQvL1xuXHRcdC8vIFJ1biBkZWxheWVkIHRvIHByZXZlbnQgdXBkYXRpbmcgbWVudSB3aGlsZSBpdCBpcyBvcGVuXG5cdFx0aWYgKCF0aGlzLndpbGxTaHV0ZG93bikge1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy53aWxsU2h1dGRvd24pIHtcblx0XHRcdFx0XHR0aGlzLmluc3RhbGwoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMTAgLyogZGVsYXkgdGhpcyBiZWNhdXNlIHRoZXJlIGlzIGFuIGlzc3VlIHdpdGggdXBkYXRpbmcgYSBtZW51IHdoZW4gaXQgaXMgb3BlbiAqLyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVdpbmRvd3NDb3VudChlOiBJV2luZG93c0NvdW50Q2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCFpc01hY2ludG9zaCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBtZW51IGlmIHdpbmRvdyBjb3VudCBnb2VzIGZyb20gTiA+IDAgb3IgMCA+IE4gdG8gdXBkYXRlIG1lbnUgaXRlbSBlbmFibGVtZW50XG5cdFx0aWYgKChlLm9sZENvdW50ID09PSAwICYmIGUubmV3Q291bnQgPiAwKSB8fCAoZS5vbGRDb3VudCA+IDAgJiYgZS5uZXdDb3VudCA9PT0gMCkpIHtcblx0XHRcdHRoaXMuY2xvc2VkTGFzdFdpbmRvdyA9IGUubmV3Q291bnQgPT09IDA7XG5cdFx0XHR0aGlzLnNjaGVkdWxlVXBkYXRlTWVudSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VXaW5kb3dGb2N1cygpOiB2b2lkIHtcblx0XHRpZiAoIWlzTWFjaW50b3NoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXNlZFdpbmRvdyA9IEJyb3dzZXJXaW5kb3cuZ2V0Rm9jdXNlZFdpbmRvdygpO1xuXHRcdHRoaXMubm9BY3RpdmVNYWluV2luZG93ID0gIWZvY3VzZWRXaW5kb3cgfHwgISF0aGlzLmF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dCeVdlYkNvbnRlbnRzKGZvY3VzZWRXaW5kb3cud2ViQ29udGVudHMpO1xuXHRcdHRoaXMuc2NoZWR1bGVVcGRhdGVNZW51KCk7XG5cdH1cblxuXHRwcml2YXRlIGluc3RhbGwoKTogdm9pZCB7XG5cdFx0Ly8gU3RvcmUgb2xkIG1lbnUgaW4gb3VyIGFycmF5IHRvIGF2b2lkIEdDIHRvIGNvbGxlY3QgdGhlIG1lbnUgYW5kIGNyYXNoLiBTZWUgIzU1MzQ3XG5cdFx0Ly8gVE9ET0BzYmF0dGVuIFJlbW92ZSB0aGlzIHdoZW4gZml4ZWQgdXBzdHJlYW0gYnkgRWxlY3Ryb25cblx0XHRjb25zdCBvbGRNZW51ID0gTWVudS5nZXRBcHBsaWNhdGlvbk1lbnUoKTtcblx0XHRpZiAob2xkTWVudSkge1xuXHRcdFx0dGhpcy5vbGRNZW51cy5wdXNoKG9sZE1lbnUpO1xuXHRcdH1cblxuXHRcdC8vIElmIHdlIGRvbid0IGhhdmUgYSBtZW51IHlldCwgc2V0IGl0IHRvIG51bGwgdG8gYXZvaWQgdGhlIGVsZWN0cm9uIG1lbnUuXG5cdFx0Ly8gVGhpcyBzaG91bGQgb25seSBoYXBwZW4gb24gdGhlIGZpcnN0IGxhdW5jaCBldmVyXG5cdFx0aWYgKE9iamVjdC5rZXlzKHRoaXMubWVudWJhck1lbnVzKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuZG9TZXRBcHBsaWNhdGlvbk1lbnUoaXNNYWNpbnRvc2ggPyBuZXcgTWVudSgpIDogbnVsbCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTWVudXNcblx0XHRjb25zdCBtZW51YmFyID0gbmV3IE1lbnUoKTtcblxuXHRcdC8vIE1hYzogQXBwbGljYXRpb25cblx0XHRsZXQgbWFjQXBwbGljYXRpb25NZW51SXRlbTogTWVudUl0ZW07XG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRjb25zdCBhcHBsaWNhdGlvbk1lbnUgPSBuZXcgTWVudSgpO1xuXHRcdFx0bWFjQXBwbGljYXRpb25NZW51SXRlbSA9IG5ldyBNZW51SXRlbSh7IGxhYmVsOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCwgc3VibWVudTogYXBwbGljYXRpb25NZW51IH0pO1xuXHRcdFx0dGhpcy5zZXRNYWNBcHBsaWNhdGlvbk1lbnUoYXBwbGljYXRpb25NZW51KTtcblx0XHRcdG1lbnViYXIuYXBwZW5kKG1hY0FwcGxpY2F0aW9uTWVudUl0ZW0pO1xuXHRcdH1cblxuXHRcdC8vIE1hYzogRG9ja1xuXHRcdGlmIChpc01hY2ludG9zaCAmJiAhdGhpcy5hcHBNZW51SW5zdGFsbGVkKSB7XG5cdFx0XHR0aGlzLmFwcE1lbnVJbnN0YWxsZWQgPSB0cnVlO1xuXG5cdFx0XHRjb25zdCBkb2NrTWVudSA9IG5ldyBNZW51KCk7XG5cdFx0XHRkb2NrTWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHsgbGFiZWw6IHRoaXMubW5lbW9uaWNMYWJlbChubHMubG9jYWxpemUoeyBrZXk6ICdtaU5ld1dpbmRvdycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJOZXcgJiZXaW5kb3dcIikpLCBjbGljazogKCkgPT4gdGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub3BlbkVtcHR5V2luZG93KHsgY29udGV4dDogT3BlbkNvbnRleHQuRE9DSyB9KSB9KSk7XG5cblx0XHRcdGFwcC5kb2NrIS5zZXRNZW51KGRvY2tNZW51KTtcblx0XHR9XG5cblx0XHQvLyBGaWxlXG5cdFx0aWYgKHRoaXMuc2hvdWxkRHJhd01lbnUoJ0ZpbGUnKSkge1xuXHRcdFx0Y29uc3QgZmlsZU1lbnUgPSBuZXcgTWVudSgpO1xuXHRcdFx0Y29uc3QgZmlsZU1lbnVJdGVtID0gbmV3IE1lbnVJdGVtKHsgbGFiZWw6IHRoaXMubW5lbW9uaWNMYWJlbChubHMubG9jYWxpemUoeyBrZXk6ICdtRmlsZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkZpbGVcIikpLCBzdWJtZW51OiBmaWxlTWVudSB9KTtcblx0XHRcdHRoaXMuc2V0TWVudUJ5SWQoZmlsZU1lbnUsICdGaWxlJyk7XG5cdFx0XHRtZW51YmFyLmFwcGVuZChmaWxlTWVudUl0ZW0pO1xuXHRcdH1cblxuXHRcdC8vIEVkaXRcblx0XHRpZiAodGhpcy5zaG91bGREcmF3TWVudSgnRWRpdCcpKSB7XG5cdFx0XHRjb25zdCBlZGl0TWVudSA9IG5ldyBNZW51KCk7XG5cdFx0XHRjb25zdCBlZGl0TWVudUl0ZW0gPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKG5scy5sb2NhbGl6ZSh7IGtleTogJ21FZGl0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRWRpdFwiKSksIHN1Ym1lbnU6IGVkaXRNZW51IH0pO1xuXHRcdFx0dGhpcy5zZXRNZW51QnlJZChlZGl0TWVudSwgJ0VkaXQnKTtcblx0XHRcdG1lbnViYXIuYXBwZW5kKGVkaXRNZW51SXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2VsZWN0aW9uXG5cdFx0aWYgKHRoaXMuc2hvdWxkRHJhd01lbnUoJ1NlbGVjdGlvbicpKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25NZW51ID0gbmV3IE1lbnUoKTtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbk1lbnVJdGVtID0gbmV3IE1lbnVJdGVtKHsgbGFiZWw6IHRoaXMubW5lbW9uaWNMYWJlbChubHMubG9jYWxpemUoeyBrZXk6ICdtU2VsZWN0aW9uJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmU2VsZWN0aW9uXCIpKSwgc3VibWVudTogc2VsZWN0aW9uTWVudSB9KTtcblx0XHRcdHRoaXMuc2V0TWVudUJ5SWQoc2VsZWN0aW9uTWVudSwgJ1NlbGVjdGlvbicpO1xuXHRcdFx0bWVudWJhci5hcHBlbmQoc2VsZWN0aW9uTWVudUl0ZW0pO1xuXHRcdH1cblxuXHRcdC8vIFZpZXdcblx0XHRpZiAodGhpcy5zaG91bGREcmF3TWVudSgnVmlldycpKSB7XG5cdFx0XHRjb25zdCB2aWV3TWVudSA9IG5ldyBNZW51KCk7XG5cdFx0XHRjb25zdCB2aWV3TWVudUl0ZW0gPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKG5scy5sb2NhbGl6ZSh7IGtleTogJ21WaWV3JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmVmlld1wiKSksIHN1Ym1lbnU6IHZpZXdNZW51IH0pO1xuXHRcdFx0dGhpcy5zZXRNZW51QnlJZCh2aWV3TWVudSwgJ1ZpZXcnKTtcblx0XHRcdG1lbnViYXIuYXBwZW5kKHZpZXdNZW51SXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gR29cblx0XHRpZiAodGhpcy5zaG91bGREcmF3TWVudSgnR28nKSkge1xuXHRcdFx0Y29uc3QgZ290b01lbnUgPSBuZXcgTWVudSgpO1xuXHRcdFx0Y29uc3QgZ290b01lbnVJdGVtID0gbmV3IE1lbnVJdGVtKHsgbGFiZWw6IHRoaXMubW5lbW9uaWNMYWJlbChubHMubG9jYWxpemUoeyBrZXk6ICdtR290bycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkdvXCIpKSwgc3VibWVudTogZ290b01lbnUgfSk7XG5cdFx0XHR0aGlzLnNldE1lbnVCeUlkKGdvdG9NZW51LCAnR28nKTtcblx0XHRcdG1lbnViYXIuYXBwZW5kKGdvdG9NZW51SXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGVidWdcblx0XHRpZiAodGhpcy5zaG91bGREcmF3TWVudSgnUnVuJykpIHtcblx0XHRcdGNvbnN0IGRlYnVnTWVudSA9IG5ldyBNZW51KCk7XG5cdFx0XHRjb25zdCBkZWJ1Z01lbnVJdGVtID0gbmV3IE1lbnVJdGVtKHsgbGFiZWw6IHRoaXMubW5lbW9uaWNMYWJlbChubHMubG9jYWxpemUoeyBrZXk6ICdtUnVuJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUnVuXCIpKSwgc3VibWVudTogZGVidWdNZW51IH0pO1xuXHRcdFx0dGhpcy5zZXRNZW51QnlJZChkZWJ1Z01lbnUsICdSdW4nKTtcblx0XHRcdG1lbnViYXIuYXBwZW5kKGRlYnVnTWVudUl0ZW0pO1xuXHRcdH1cblxuXHRcdC8vIFRlcm1pbmFsXG5cdFx0aWYgKHRoaXMuc2hvdWxkRHJhd01lbnUoJ1Rlcm1pbmFsJykpIHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTWVudSA9IG5ldyBNZW51KCk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbE1lbnVJdGVtID0gbmV3IE1lbnVJdGVtKHsgbGFiZWw6IHRoaXMubW5lbW9uaWNMYWJlbChubHMubG9jYWxpemUoeyBrZXk6ICdtVGVybWluYWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZUZXJtaW5hbFwiKSksIHN1Ym1lbnU6IHRlcm1pbmFsTWVudSB9KTtcblx0XHRcdHRoaXMuc2V0TWVudUJ5SWQodGVybWluYWxNZW51LCAnVGVybWluYWwnKTtcblx0XHRcdG1lbnViYXIuYXBwZW5kKHRlcm1pbmFsTWVudUl0ZW0pO1xuXHRcdH1cblxuXHRcdC8vIE1hYzogV2luZG93XG5cdFx0bGV0IG1hY1dpbmRvd01lbnVJdGVtOiBNZW51SXRlbSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5zaG91bGREcmF3TWVudSgnV2luZG93JykpIHtcblx0XHRcdGNvbnN0IHdpbmRvd01lbnUgPSBuZXcgTWVudSgpO1xuXHRcdFx0bWFjV2luZG93TWVudUl0ZW0gPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKG5scy5sb2NhbGl6ZSgnbVdpbmRvdycsIFwiV2luZG93XCIpKSwgc3VibWVudTogd2luZG93TWVudSwgcm9sZTogJ3dpbmRvdycgfSk7XG5cdFx0XHR0aGlzLnNldE1hY1dpbmRvd01lbnUod2luZG93TWVudSk7XG5cdFx0fVxuXG5cdFx0aWYgKG1hY1dpbmRvd01lbnVJdGVtKSB7XG5cdFx0XHRtZW51YmFyLmFwcGVuZChtYWNXaW5kb3dNZW51SXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gSGVscFxuXHRcdGlmICh0aGlzLnNob3VsZERyYXdNZW51KCdIZWxwJykpIHtcblx0XHRcdGNvbnN0IGhlbHBNZW51ID0gbmV3IE1lbnUoKTtcblx0XHRcdGNvbnN0IGhlbHBNZW51SXRlbSA9IG5ldyBNZW51SXRlbSh7IGxhYmVsOiB0aGlzLm1uZW1vbmljTGFiZWwobmxzLmxvY2FsaXplKHsga2V5OiAnbUhlbHAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZIZWxwXCIpKSwgc3VibWVudTogaGVscE1lbnUsIHJvbGU6ICdoZWxwJyB9KTtcblx0XHRcdHRoaXMuc2V0TWVudUJ5SWQoaGVscE1lbnUsICdIZWxwJyk7XG5cdFx0XHRtZW51YmFyLmFwcGVuZChoZWxwTWVudUl0ZW0pO1xuXHRcdH1cblxuXHRcdGlmIChtZW51YmFyLml0ZW1zICYmIG1lbnViYXIuaXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5kb1NldEFwcGxpY2F0aW9uTWVudShtZW51YmFyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kb1NldEFwcGxpY2F0aW9uTWVudShudWxsKTtcblx0XHR9XG5cblx0XHQvLyBEaXNwb3NlIG9mIG9sZGVyIG1lbnVzIGFmdGVyIHNvbWUgdGltZVxuXHRcdHRoaXMubWVudUdDLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIGRvU2V0QXBwbGljYXRpb25NZW51KG1lbnU6IChNZW51KSB8IChudWxsKSk6IHZvaWQge1xuXG5cdFx0Ly8gU2V0dGluZyB0aGUgYXBwbGljYXRpb24gbWVudSBzZXRzIGl0IHRvIGFsbCBvcGVuZWQgd2luZG93cyxcblx0XHQvLyBidXQgd2UgY3VycmVudGx5IGRvIG5vdCBzdXBwb3J0IGEgbWVudSBpbiBhdXhpbGlhcnkgd2luZG93cyxcblx0XHQvLyBzbyB3ZSBuZWVkIHRvIHVuc2V0IGl0IHRoZXJlLlxuXHRcdC8vXG5cdFx0Ly8gVGhpcyBpcyBhIGJpdCB1Z2x5IGJ1dCBgc2V0QXBwbGljYXRpb25NZW51KClgIGhhcyBzb21lIG5pY2Vcblx0XHQvLyBiZWhhdmlvdXIgd2Ugd2FudDpcblx0XHQvLyAtIG9uIG1hY09TIGl0IGlzIHJlcXVpcmVkIGJlY2F1c2UgbWVudXMgYXJlIGFwcGxpY2F0aW9uIHNldFxuXHRcdC8vIC0gd2UgdXNlIGBnZXRBcHBsaWNhdGlvbk1lbnUoKWAgdG8gYWNjZXNzIHRoZSBjdXJyZW50IHN0YXRlXG5cdFx0Ly8gLSBuZXcgd2luZG93cyBpbW1lZGlhdGVseSBnZXQgdGhlIHNhbWUgbWVudSB3aGVuIG9wZW5pbmdcblx0XHQvLyAgIHJlZHVjaW5nIG92ZXJhbGwgZmxpY2tlciBmb3IgdGhlc2VcblxuXHRcdE1lbnUuc2V0QXBwbGljYXRpb25NZW51KG1lbnUpO1xuXG5cdFx0aWYgKG1lbnUpIHtcblx0XHRcdGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd3MoKSkge1xuXHRcdFx0XHR3aW5kb3cud2luPy5zZXRNZW51KG51bGwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0TWFjQXBwbGljYXRpb25NZW51KG1hY0FwcGxpY2F0aW9uTWVudTogTWVudSk6IHZvaWQge1xuXHRcdGNvbnN0IGFib3V0ID0gdGhpcy5jcmVhdGVNZW51SXRlbShubHMubG9jYWxpemUoJ21BYm91dCcsIFwiQWJvdXQgezB9XCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpLCAnd29ya2JlbmNoLmFjdGlvbi5zaG93QWJvdXREaWFsb2cnKTtcblx0XHRjb25zdCBjaGVja0ZvclVwZGF0ZXMgPSB0aGlzLmdldFVwZGF0ZU1lbnVJdGVtcygpO1xuXG5cdFx0bGV0IHByZWZlcmVuY2VzO1xuXHRcdGlmICh0aGlzLnNob3VsZERyYXdNZW51KCdQcmVmZXJlbmNlcycpKSB7XG5cdFx0XHRjb25zdCBwcmVmZXJlbmNlc01lbnUgPSBuZXcgTWVudSgpO1xuXHRcdFx0dGhpcy5zZXRNZW51QnlJZChwcmVmZXJlbmNlc01lbnUsICdQcmVmZXJlbmNlcycpO1xuXHRcdFx0cHJlZmVyZW5jZXMgPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKG5scy5sb2NhbGl6ZSh7IGtleTogJ21pUHJlZmVyZW5jZXMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZQcmVmZXJlbmNlc1wiKSksIHN1Ym1lbnU6IHByZWZlcmVuY2VzTWVudSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXJ2aWNlc01lbnUgPSBuZXcgTWVudSgpO1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IE1lbnVJdGVtKHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnbVNlcnZpY2VzJywgXCJTZXJ2aWNlc1wiKSwgcm9sZTogJ3NlcnZpY2VzJywgc3VibWVudTogc2VydmljZXNNZW51IH0pO1xuXHRcdGNvbnN0IGhpZGUgPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogbmxzLmxvY2FsaXplKCdtSGlkZScsIFwiSGlkZSB7MH1cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZyksIHJvbGU6ICdoaWRlJywgYWNjZWxlcmF0b3I6ICdDb21tYW5kK0gnIH0pO1xuXHRcdGNvbnN0IGhpZGVPdGhlcnMgPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogbmxzLmxvY2FsaXplKCdtSGlkZU90aGVycycsIFwiSGlkZSBPdGhlcnNcIiksIHJvbGU6ICdoaWRlT3RoZXJzJywgYWNjZWxlcmF0b3I6ICdDb21tYW5kK0FsdCtIJyB9KTtcblx0XHRjb25zdCBzaG93QWxsID0gbmV3IE1lbnVJdGVtKHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnbVNob3dBbGwnLCBcIlNob3cgQWxsXCIpLCByb2xlOiAndW5oaWRlJyB9KTtcblx0XHRjb25zdCBxdWl0ID0gbmV3IE1lbnVJdGVtKHRoaXMubGlrZUFjdGlvbignd29ya2JlbmNoLmFjdGlvbi5xdWl0Jywge1xuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnbWlRdWl0JywgXCJRdWl0IHswfVwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSwgY2xpY2s6IGFzeW5jIChpdGVtLCB3aW5kb3csIGV2ZW50KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxhc3RBY3RpdmVXaW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRMYXN0QWN0aXZlV2luZG93KCk7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHR0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dDb3VudCgpID09PSAwIHx8IFx0Ly8gYWxsb3cgdG8gcXVpdCB3aGVuIG5vIG1vcmUgd2luZG93cyBhcmUgb3BlblxuXHRcdFx0XHRcdCEhQnJvd3NlcldpbmRvdy5nZXRGb2N1c2VkV2luZG93KCkgfHxcdFx0XHRcdC8vIGFsbG93IHRvIHF1aXQgd2hlbiB3aW5kb3cgaGFzIGZvY3VzIChmaXggZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zOTE5MSlcblx0XHRcdFx0XHRsYXN0QWN0aXZlV2luZG93Py53aW4/LmlzTWluaW1pemVkKClcdFx0XHRcdC8vIGFsbG93IHRvIHF1aXQgd2hlbiB3aW5kb3cgaGFzIG5vIGZvY3VzIGJ1dCBpcyBtaW5pbWl6ZWQgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy82MzAwMClcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgdGhpcy5jb25maXJtQmVmb3JlUXVpdChldmVudCk7XG5cdFx0XHRcdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5uYXRpdmVIb3N0TWFpblNlcnZpY2UucXVpdCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBbYWJvdXRdO1xuXHRcdGFjdGlvbnMucHVzaCguLi5jaGVja0ZvclVwZGF0ZXMpO1xuXG5cdFx0aWYgKHByZWZlcmVuY2VzKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goLi4uW1xuXHRcdFx0XHRfX3NlcGFyYXRvcl9fKCksXG5cdFx0XHRcdHByZWZlcmVuY2VzXG5cdFx0XHRdKTtcblx0XHR9XG5cblx0XHRhY3Rpb25zLnB1c2goLi4uW1xuXHRcdFx0X19zZXBhcmF0b3JfXygpLFxuXHRcdFx0c2VydmljZXMsXG5cdFx0XHRfX3NlcGFyYXRvcl9fKCksXG5cdFx0XHRoaWRlLFxuXHRcdFx0aGlkZU90aGVycyxcblx0XHRcdHNob3dBbGwsXG5cdFx0XHRfX3NlcGFyYXRvcl9fKCksXG5cdFx0XHRxdWl0XG5cdFx0XSk7XG5cblx0XHRhY3Rpb25zLmZvckVhY2goaSA9PiBtYWNBcHBsaWNhdGlvbk1lbnUuYXBwZW5kKGkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29uZmlybUJlZm9yZVF1aXQoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIG5ldmVyIGNvbmZpcm0gd2hlbiBubyB3aW5kb3dzIGFyZSBvcGVuZWRcblx0XHR9XG5cblx0XHRjb25zdCBjb25maXJtQmVmb3JlQ2xvc2UgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdhbHdheXMnIHwgJ25ldmVyJyB8ICdrZXlib2FyZE9ubHknPignd2luZG93LmNvbmZpcm1CZWZvcmVDbG9zZScpO1xuXHRcdGlmIChjb25maXJtQmVmb3JlQ2xvc2UgPT09ICdhbHdheXMnIHx8IChjb25maXJtQmVmb3JlQ2xvc2UgPT09ICdrZXlib2FyZE9ubHknICYmIHRoaXMuaXNLZXlib2FyZEV2ZW50KGV2ZW50KSkpIHtcblx0XHRcdGNvbnN0IHsgcmVzcG9uc2UgfSA9IGF3YWl0IHRoaXMubmF0aXZlSG9zdE1haW5TZXJ2aWNlLnNob3dNZXNzYWdlQm94KHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldEZvY3VzZWRXaW5kb3coKT8uaWQsIHtcblx0XHRcdFx0dHlwZTogJ3F1ZXN0aW9uJyxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdGlzTWFjaW50b3NoID8gbmxzLmxvY2FsaXplKHsga2V5OiAncXVpdCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlF1aXRcIikgOiBubHMubG9jYWxpemUoeyBrZXk6ICdleGl0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRXhpdFwiKSxcblx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG1lc3NhZ2U6IGlzTWFjaW50b3NoID8gbmxzLmxvY2FsaXplKCdxdWl0TWVzc2FnZU1hYycsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIHF1aXQ/XCIpIDogbmxzLmxvY2FsaXplKCdxdWl0TWVzc2FnZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGV4aXQ/XCIpXG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHJlc3BvbnNlID09PSAwO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGREcmF3TWVudShtZW51SWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICghaXNNYWNpbnRvc2ggJiYgIXRoaXMuc2hvd05hdGl2ZU1lbnUpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gV2UgbmVlZCB0byBkcmF3IGFuIGVtcHR5IG1lbnUgdG8gb3ZlcnJpZGUgdGhlIGVsZWN0cm9uIGRlZmF1bHRcblx0XHR9XG5cblx0XHRzd2l0Y2ggKG1lbnVJZCkge1xuXHRcdFx0Y2FzZSAnRmlsZSc6XG5cdFx0XHRjYXNlICdIZWxwJzpcblx0XHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdFx0cmV0dXJuICh0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dDb3VudCgpID09PSAwICYmIHRoaXMuY2xvc2VkTGFzdFdpbmRvdykgfHwgKHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0NvdW50KCkgPiAwICYmIHRoaXMubm9BY3RpdmVNYWluV2luZG93KSB8fCAoISF0aGlzLm1lbnViYXJNZW51cyAmJiAhIXRoaXMubWVudWJhck1lbnVzW21lbnVJZF0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdGNhc2UgJ1dpbmRvdyc6XG5cdFx0XHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0XHRcdHJldHVybiAodGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA9PT0gMCAmJiB0aGlzLmNsb3NlZExhc3RXaW5kb3cpIHx8ICh0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dDb3VudCgpID4gMCAmJiB0aGlzLm5vQWN0aXZlTWFpbldpbmRvdykgfHwgISF0aGlzLm1lbnViYXJNZW51cztcblx0XHRcdFx0fVxuXG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA+IDAgJiYgKCEhdGhpcy5tZW51YmFyTWVudXMgJiYgISF0aGlzLm1lbnViYXJNZW51c1ttZW51SWRdKTtcblx0XHR9XG5cdH1cblxuXG5cdHByaXZhdGUgc2V0TWVudShtZW51OiBNZW51LCBpdGVtczogQXJyYXk8TWVudWJhck1lbnVJdGVtPikge1xuXHRcdGl0ZW1zLmZvckVhY2goKGl0ZW06IE1lbnViYXJNZW51SXRlbSkgPT4ge1xuXHRcdFx0aWYgKGlzTWVudWJhck1lbnVJdGVtU2VwYXJhdG9yKGl0ZW0pKSB7XG5cdFx0XHRcdG1lbnUuYXBwZW5kKF9fc2VwYXJhdG9yX18oKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzTWVudWJhck1lbnVJdGVtU3VibWVudShpdGVtKSkge1xuXHRcdFx0XHRjb25zdCBzdWJtZW51ID0gbmV3IE1lbnUoKTtcblx0XHRcdFx0Y29uc3Qgc3VibWVudUl0ZW0gPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKGl0ZW0ubGFiZWwpLCBzdWJtZW51IH0pO1xuXHRcdFx0XHR0aGlzLnNldE1lbnUoc3VibWVudSwgaXRlbS5zdWJtZW51Lml0ZW1zKTtcblx0XHRcdFx0bWVudS5hcHBlbmQoc3VibWVudUl0ZW0pO1xuXHRcdFx0fSBlbHNlIGlmIChpc01lbnViYXJNZW51SXRlbVJlY2VudEFjdGlvbihpdGVtKSkge1xuXHRcdFx0XHRtZW51LmFwcGVuZCh0aGlzLmNyZWF0ZU9wZW5SZWNlbnRNZW51SXRlbShpdGVtKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzTWVudWJhck1lbnVJdGVtQWN0aW9uKGl0ZW0pKSB7XG5cdFx0XHRcdGlmIChpdGVtLmlkID09PSAnd29ya2JlbmNoLmFjdGlvbi5zaG93QWJvdXREaWFsb2cnKSB7XG5cdFx0XHRcdFx0dGhpcy5pbnNlcnRDaGVja0ZvclVwZGF0ZXNJdGVtcyhtZW51KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0XHRcdGlmICgodGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA9PT0gMCAmJiB0aGlzLmNsb3NlZExhc3RXaW5kb3cpIHx8XG5cdFx0XHRcdFx0XHQodGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA+IDAgJiYgdGhpcy5ub0FjdGl2ZU1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdFx0XHQvLyBJbiB0aGUgZmFsbGJhY2sgc2NlbmFyaW8sIHdlIGFyZSBlaXRoZXIgZGlzYWJsZWQgb3IgdXNpbmcgYSBmYWxsYmFjayBoYW5kbGVyXG5cdFx0XHRcdFx0XHRpZiAodGhpcy5mYWxsYmFja01lbnVIYW5kbGVyc1tpdGVtLmlkXSkge1xuXHRcdFx0XHRcdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0odGhpcy5saWtlQWN0aW9uKGl0ZW0uaWQsIHsgbGFiZWw6IHRoaXMubW5lbW9uaWNMYWJlbChpdGVtLmxhYmVsKSwgY2xpY2s6IHRoaXMuZmFsbGJhY2tNZW51SGFuZGxlcnNbaXRlbS5pZF0gfSkpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG1lbnUuYXBwZW5kKHRoaXMuY3JlYXRlTWVudUl0ZW0oaXRlbS5sYWJlbCwgaXRlbS5pZCwgZmFsc2UsIGl0ZW0uY2hlY2tlZCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtZW51LmFwcGVuZCh0aGlzLmNyZWF0ZU1lbnVJdGVtKGl0ZW0ubGFiZWwsIGl0ZW0uaWQsIGl0ZW0uZW5hYmxlZCAhPT0gZmFsc2UsICEhaXRlbS5jaGVja2VkKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1lbnUuYXBwZW5kKHRoaXMuY3JlYXRlTWVudUl0ZW0oaXRlbS5sYWJlbCwgaXRlbS5pZCwgaXRlbS5lbmFibGVkICE9PSBmYWxzZSwgISFpdGVtLmNoZWNrZWQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRNZW51QnlJZChtZW51OiBNZW51LCBtZW51SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm1lbnViYXJNZW51cz8uW21lbnVJZF0pIHtcblx0XHRcdHRoaXMuc2V0TWVudShtZW51LCB0aGlzLm1lbnViYXJNZW51c1ttZW51SWRdLml0ZW1zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluc2VydENoZWNrRm9yVXBkYXRlc0l0ZW1zKG1lbnU6IE1lbnUpIHtcblx0XHRjb25zdCB1cGRhdGVJdGVtcyA9IHRoaXMuZ2V0VXBkYXRlTWVudUl0ZW1zKCk7XG5cdFx0aWYgKHVwZGF0ZUl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0dXBkYXRlSXRlbXMuZm9yRWFjaChpID0+IG1lbnUuYXBwZW5kKGkpKTtcblx0XHRcdG1lbnUuYXBwZW5kKF9fc2VwYXJhdG9yX18oKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVPcGVuUmVjZW50TWVudUl0ZW0oaXRlbTogSU1lbnViYXJNZW51UmVjZW50SXRlbUFjdGlvbik6IE1lbnVJdGVtIHtcblx0XHRjb25zdCByZXZpdmVkVXJpID0gVVJJLnJldml2ZShpdGVtLnVyaSk7XG5cdFx0Y29uc3QgY29tbWFuZElkID0gaXRlbS5pZDtcblx0XHRjb25zdCBvcGVuYWJsZTogSVdpbmRvd09wZW5hYmxlID1cblx0XHRcdChjb21tYW5kSWQgPT09ICdvcGVuUmVjZW50RmlsZScpID8geyBmaWxlVXJpOiByZXZpdmVkVXJpIH0gOlxuXHRcdFx0XHQoY29tbWFuZElkID09PSAnb3BlblJlY2VudFdvcmtzcGFjZScpID8geyB3b3Jrc3BhY2VVcmk6IHJldml2ZWRVcmkgfSA6IHsgZm9sZGVyVXJpOiByZXZpdmVkVXJpIH07XG5cblx0XHRyZXR1cm4gbmV3IE1lbnVJdGVtKHRoaXMubGlrZUFjdGlvbihjb21tYW5kSWQsIHtcblx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0Y2xpY2s6IGFzeW5jIChtZW51SXRlbSwgd2luLCBldmVudCkgPT4ge1xuXHRcdFx0XHRjb25zdCBvcGVuSW5OZXdXaW5kb3cgPSB0aGlzLmlzT3B0aW9uQ2xpY2soZXZlbnQpO1xuXHRcdFx0XHRjb25zdCBzdWNjZXNzID0gKGF3YWl0IHRoaXMud2luZG93c01haW5TZXJ2aWNlLm9wZW4oe1xuXHRcdFx0XHRcdGNvbnRleHQ6IE9wZW5Db250ZXh0Lk1FTlUsXG5cdFx0XHRcdFx0Y2xpOiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncyxcblx0XHRcdFx0XHR1cmlzVG9PcGVuOiBbb3BlbmFibGVdLFxuXHRcdFx0XHRcdGZvcmNlTmV3V2luZG93OiBvcGVuSW5OZXdXaW5kb3csXG5cdFx0XHRcdFx0Z290b0xpbmVNb2RlOiBmYWxzZSxcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IGl0ZW0ucmVtb3RlQXV0aG9yaXR5XG5cdFx0XHRcdH0pKS5sZW5ndGggPiAwO1xuXG5cdFx0XHRcdGlmICghc3VjY2Vzcykge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZS5yZW1vdmVSZWNlbnRseU9wZW5lZChbcmV2aXZlZFVyaV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSwgZmFsc2UpKTtcblx0fVxuXG5cdHByaXZhdGUgaXNPcHRpb25DbGljayhldmVudDogS2V5Ym9hcmRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIShldmVudCAmJiAoKCFpc01hY2ludG9zaCAmJiAoZXZlbnQuY3RybEtleSB8fCBldmVudC5zaGlmdEtleSkpIHx8IChpc01hY2ludG9zaCAmJiAoZXZlbnQubWV0YUtleSB8fCBldmVudC5hbHRLZXkpKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0tleWJvYXJkRXZlbnQoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISEoZXZlbnQudHJpZ2dlcmVkQnlBY2NlbGVyYXRvciB8fCBldmVudC5hbHRLZXkgfHwgZXZlbnQuY3RybEtleSB8fCBldmVudC5tZXRhS2V5IHx8IGV2ZW50LnNoaWZ0S2V5KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUm9sZU1lbnVJdGVtKGxhYmVsOiBzdHJpbmcsIGNvbW1hbmRJZDogc3RyaW5nLCByb2xlOiAndW5kbycgfCAncmVkbycgfCAnY3V0JyB8ICdjb3B5JyB8ICdwYXN0ZScgfCAncGFzdGVBbmRNYXRjaFN0eWxlJyB8ICdkZWxldGUnIHwgJ3NlbGVjdEFsbCcgfCAncmVsb2FkJyB8ICdmb3JjZVJlbG9hZCcgfCAndG9nZ2xlRGV2VG9vbHMnIHwgJ3Jlc2V0Wm9vbScgfCAnem9vbUluJyB8ICd6b29tT3V0JyB8ICd0b2dnbGVTcGVsbENoZWNrZXInIHwgJ3RvZ2dsZWZ1bGxzY3JlZW4nIHwgJ3dpbmRvdycgfCAnbWluaW1pemUnIHwgJ2Nsb3NlJyB8ICdoZWxwJyB8ICdhYm91dCcgfCAnc2VydmljZXMnIHwgJ2hpZGUnIHwgJ2hpZGVPdGhlcnMnIHwgJ3VuaGlkZScgfCAncXVpdCcgfCAnc2hvd1N1YnN0aXR1dGlvbnMnIHwgJ3RvZ2dsZVNtYXJ0UXVvdGVzJyB8ICd0b2dnbGVTbWFydERhc2hlcycgfCAndG9nZ2xlVGV4dFJlcGxhY2VtZW50JyB8ICdzdGFydFNwZWFraW5nJyB8ICdzdG9wU3BlYWtpbmcnIHwgJ3pvb20nIHwgJ2Zyb250JyB8ICdhcHBNZW51JyB8ICdmaWxlTWVudScgfCAnZWRpdE1lbnUnIHwgJ3ZpZXdNZW51JyB8ICdzaGFyZU1lbnUnIHwgJ3JlY2VudERvY3VtZW50cycgfCAndG9nZ2xlVGFiQmFyJyB8ICdzZWxlY3ROZXh0VGFiJyB8ICdzZWxlY3RQcmV2aW91c1RhYicgfCAnc2hvd0FsbFRhYnMnIHwgJ21lcmdlQWxsV2luZG93cycgfCAnY2xlYXJSZWNlbnREb2N1bWVudHMnIHwgJ21vdmVUYWJUb05ld1dpbmRvdycgfCAnd2luZG93TWVudScpOiBNZW51SXRlbSB7XG5cdFx0Y29uc3Qgb3B0aW9uczogTWVudUl0ZW1Db25zdHJ1Y3Rvck9wdGlvbnMgPSB7XG5cdFx0XHRsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKGxhYmVsKSxcblx0XHRcdHJvbGUsXG5cdFx0XHRlbmFibGVkOiB0cnVlXG5cdFx0fTtcblxuXHRcdHJldHVybiBuZXcgTWVudUl0ZW0odGhpcy53aXRoS2V5YmluZGluZyhjb21tYW5kSWQsIG9wdGlvbnMpKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0TWFjV2luZG93TWVudShtYWNXaW5kb3dNZW51OiBNZW51KTogdm9pZCB7XG5cdFx0Y29uc3QgbWluaW1pemUgPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogbmxzLmxvY2FsaXplKCdtTWluaW1pemUnLCBcIk1pbmltaXplXCIpLCByb2xlOiAnbWluaW1pemUnLCBhY2NlbGVyYXRvcjogJ0NvbW1hbmQrTScsIGVuYWJsZWQ6IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0NvdW50KCkgPiAwIH0pO1xuXHRcdGNvbnN0IHpvb20gPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogbmxzLmxvY2FsaXplKCdtWm9vbScsIFwiWm9vbVwiKSwgcm9sZTogJ3pvb20nLCBlbmFibGVkOiB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dDb3VudCgpID4gMCB9KTtcblx0XHRjb25zdCBicmluZ0FsbFRvRnJvbnQgPSBuZXcgTWVudUl0ZW0oeyBsYWJlbDogbmxzLmxvY2FsaXplKCdtQnJpbmdUb0Zyb250JywgXCJCcmluZyBBbGwgdG8gRnJvbnRcIiksIHJvbGU6ICdmcm9udCcsIGVuYWJsZWQ6IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0NvdW50KCkgPiAwIH0pO1xuXHRcdGNvbnN0IHN3aXRjaFdpbmRvdyA9IHRoaXMuY3JlYXRlTWVudUl0ZW0obmxzLmxvY2FsaXplKHsga2V5OiAnbWlTd2l0Y2hXaW5kb3cnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiU3dpdGNoICYmV2luZG93Li4uXCIpLCAnd29ya2JlbmNoLmFjdGlvbi5zd2l0Y2hXaW5kb3cnKTtcblxuXHRcdGNvbnN0IG5hdGl2ZVRhYk1lbnVJdGVtczogTWVudUl0ZW1bXSA9IFtdO1xuXHRcdGlmICh0aGlzLmN1cnJlbnRFbmFibGVOYXRpdmVUYWJzKSB7XG5cdFx0XHRuYXRpdmVUYWJNZW51SXRlbXMucHVzaChfX3NlcGFyYXRvcl9fKCkpO1xuXG5cdFx0XHRuYXRpdmVUYWJNZW51SXRlbXMucHVzaCh0aGlzLmNyZWF0ZU1lbnVJdGVtKG5scy5sb2NhbGl6ZSgnbU5ld1RhYicsIFwiTmV3IFRhYlwiKSwgJ3dvcmtiZW5jaC5hY3Rpb24ubmV3V2luZG93VGFiJykpO1xuXG5cdFx0XHRuYXRpdmVUYWJNZW51SXRlbXMucHVzaCh0aGlzLmNyZWF0ZVJvbGVNZW51SXRlbShubHMubG9jYWxpemUoJ21TaG93UHJldmlvdXNUYWInLCBcIlNob3cgUHJldmlvdXMgVGFiXCIpLCAnd29ya2JlbmNoLmFjdGlvbi5zaG93UHJldmlvdXNXaW5kb3dUYWInLCAnc2VsZWN0UHJldmlvdXNUYWInKSk7XG5cdFx0XHRuYXRpdmVUYWJNZW51SXRlbXMucHVzaCh0aGlzLmNyZWF0ZVJvbGVNZW51SXRlbShubHMubG9jYWxpemUoJ21TaG93TmV4dFRhYicsIFwiU2hvdyBOZXh0IFRhYlwiKSwgJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd05leHRXaW5kb3dUYWInLCAnc2VsZWN0TmV4dFRhYicpKTtcblx0XHRcdG5hdGl2ZVRhYk1lbnVJdGVtcy5wdXNoKHRoaXMuY3JlYXRlUm9sZU1lbnVJdGVtKG5scy5sb2NhbGl6ZSgnbU1vdmVUYWJUb05ld1dpbmRvdycsIFwiTW92ZSBUYWIgdG8gTmV3IFdpbmRvd1wiKSwgJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZVdpbmRvd1RhYlRvTmV3V2luZG93JywgJ21vdmVUYWJUb05ld1dpbmRvdycpKTtcblx0XHRcdG5hdGl2ZVRhYk1lbnVJdGVtcy5wdXNoKHRoaXMuY3JlYXRlUm9sZU1lbnVJdGVtKG5scy5sb2NhbGl6ZSgnbU1lcmdlQWxsV2luZG93cycsIFwiTWVyZ2UgQWxsIFdpbmRvd3NcIiksICd3b3JrYmVuY2guYWN0aW9uLm1lcmdlQWxsV2luZG93VGFicycsICdtZXJnZUFsbFdpbmRvd3MnKSk7XG5cdFx0fVxuXG5cdFx0W1xuXHRcdFx0bWluaW1pemUsXG5cdFx0XHR6b29tLFxuXHRcdFx0X19zZXBhcmF0b3JfXygpLFxuXHRcdFx0c3dpdGNoV2luZG93LFxuXHRcdFx0Li4ubmF0aXZlVGFiTWVudUl0ZW1zLFxuXHRcdFx0X19zZXBhcmF0b3JfXygpLFxuXHRcdFx0YnJpbmdBbGxUb0Zyb250XG5cdFx0XS5mb3JFYWNoKGl0ZW0gPT4gbWFjV2luZG93TWVudS5hcHBlbmQoaXRlbSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRVcGRhdGVNZW51SXRlbXMoKTogTWVudUl0ZW1bXSB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnVwZGF0ZVNlcnZpY2Uuc3RhdGU7XG5cblx0XHRzd2l0Y2ggKHN0YXRlLnR5cGUpIHtcblx0XHRcdGNhc2UgU3RhdGVUeXBlLklkbGU6XG5cdFx0XHRcdHJldHVybiBbbmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0XHRsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKG5scy5sb2NhbGl6ZSgnbWlDaGVja0ZvclVwZGF0ZXMnLCBcIkNoZWNrIGZvciAmJlVwZGF0ZXMuLi5cIikpLCBjbGljazogKCkgPT4gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnJlcG9ydE1lbnVBY3Rpb25UZWxlbWV0cnkoJ0NoZWNrRm9yVXBkYXRlJyk7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVNlcnZpY2UuY2hlY2tGb3JVcGRhdGVzKHRydWUpO1xuXHRcdFx0XHRcdH0sIDApXG5cdFx0XHRcdH0pXTtcblxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuQ2hlY2tpbmdGb3JVcGRhdGVzOlxuXHRcdFx0XHRyZXR1cm4gW25ldyBNZW51SXRlbSh7IGxhYmVsOiBubHMubG9jYWxpemUoJ21pQ2hlY2tpbmdGb3JVcGRhdGVzJywgXCJDaGVja2luZyBmb3IgVXBkYXRlcy4uLlwiKSwgZW5hYmxlZDogZmFsc2UgfSldO1xuXG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5BdmFpbGFibGVGb3JEb3dubG9hZDpcblx0XHRcdFx0cmV0dXJuIFtuZXcgTWVudUl0ZW0oe1xuXHRcdFx0XHRcdGxhYmVsOiB0aGlzLm1uZW1vbmljTGFiZWwobmxzLmxvY2FsaXplKCdtaURvd25sb2FkVXBkYXRlJywgXCJEJiZvd25sb2FkIEF2YWlsYWJsZSBVcGRhdGVcIikpLCBjbGljazogKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVTZXJ2aWNlLmRvd25sb2FkVXBkYXRlKHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSldO1xuXG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5Eb3dubG9hZGluZzpcblx0XHRcdGNhc2UgU3RhdGVUeXBlLk92ZXJ3cml0aW5nOlxuXHRcdFx0XHRyZXR1cm4gW25ldyBNZW51SXRlbSh7IGxhYmVsOiBubHMubG9jYWxpemUoJ21pRG93bmxvYWRpbmdVcGRhdGUnLCBcIkRvd25sb2FkaW5nIFVwZGF0ZS4uLlwiKSwgZW5hYmxlZDogZmFsc2UgfSldO1xuXG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5Eb3dubG9hZGVkOlxuXHRcdFx0XHRyZXR1cm4gaXNNYWNpbnRvc2ggPyBbXSA6IFtuZXcgTWVudUl0ZW0oe1xuXHRcdFx0XHRcdGxhYmVsOiB0aGlzLm1uZW1vbmljTGFiZWwobmxzLmxvY2FsaXplKCdtaUluc3RhbGxVcGRhdGUnLCBcIkluc3RhbGwgJiZVcGRhdGUuLi5cIikpLCBjbGljazogKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5yZXBvcnRNZW51QWN0aW9uVGVsZW1ldHJ5KCdJbnN0YWxsVXBkYXRlJyk7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVNlcnZpY2UuYXBwbHlVcGRhdGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXTtcblxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuVXBkYXRpbmc6XG5cdFx0XHRcdHJldHVybiBbbmV3IE1lbnVJdGVtKHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnbWlJbnN0YWxsaW5nVXBkYXRlJywgXCJJbnN0YWxsaW5nIFVwZGF0ZS4uLlwiKSwgZW5hYmxlZDogZmFsc2UgfSldO1xuXG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5DYW5jZWxsaW5nOlxuXHRcdFx0XHRyZXR1cm4gW25ldyBNZW51SXRlbSh7IGxhYmVsOiBubHMubG9jYWxpemUoJ21pQ2FuY2VsbGluZ1VwZGF0ZScsIFwiQ2FuY2VsbGluZyBVcGRhdGUuLi5cIiksIGVuYWJsZWQ6IGZhbHNlIH0pXTtcblxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuUmVhZHk6XG5cdFx0XHRcdHJldHVybiBbbmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0XHRsYWJlbDogdGhpcy5tbmVtb25pY0xhYmVsKG5scy5sb2NhbGl6ZSgnbWlSZXN0YXJ0VG9VcGRhdGUnLCBcIlJlc3RhcnQgdG8gJiZVcGRhdGVcIikpLCBjbGljazogKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5yZXBvcnRNZW51QWN0aW9uVGVsZW1ldHJ5KCdSZXN0YXJ0VG9VcGRhdGUnKTtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlU2VydmljZS5xdWl0QW5kSW5zdGFsbCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSldO1xuXG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVNZW51SXRlbShsYWJlbE9wdDogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZywgZW5hYmxlZE9wdD86IGJvb2xlYW4sIGNoZWNrZWRPcHQ/OiBib29sZWFuKTogTWVudUl0ZW0ge1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5tbmVtb25pY0xhYmVsKGxhYmVsT3B0KTtcblx0XHRjb25zdCBjbGljayA9IChtZW51SXRlbTogTWVudUl0ZW0gJiBJTWVudUl0ZW1XaXRoS2V5YmluZGluZywgd2luZG93OiBCYXNlV2luZG93IHwgdW5kZWZpbmVkLCBldmVudDogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgdXNlclNldHRpbmdzTGFiZWwgPSBtZW51SXRlbSA/IG1lbnVJdGVtLnVzZXJTZXR0aW5nc0xhYmVsIDogbnVsbDtcblx0XHRcdGlmICh1c2VyU2V0dGluZ3NMYWJlbCAmJiBldmVudC50cmlnZ2VyZWRCeUFjY2VsZXJhdG9yKSB7XG5cdFx0XHRcdHRoaXMucnVuQWN0aW9uSW5SZW5kZXJlcih7IHR5cGU6ICdrZXliaW5kaW5nJywgdXNlclNldHRpbmdzTGFiZWwgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnJ1bkFjdGlvbkluUmVuZGVyZXIoeyB0eXBlOiAnY29tbWFuZElkJywgY29tbWFuZElkIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHR5cGVvZiBlbmFibGVkT3B0ID09PSAnYm9vbGVhbicgPyBlbmFibGVkT3B0IDogdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA+IDA7XG5cdFx0Y29uc3QgY2hlY2tlZCA9IHR5cGVvZiBjaGVja2VkT3B0ID09PSAnYm9vbGVhbicgPyBjaGVja2VkT3B0IDogZmFsc2U7XG5cblx0XHRjb25zdCBvcHRpb25zOiBNZW51SXRlbUNvbnN0cnVjdG9yT3B0aW9ucyA9IHtcblx0XHRcdGxhYmVsLFxuXHRcdFx0Y2xpY2ssXG5cdFx0XHRlbmFibGVkXG5cdFx0fTtcblxuXHRcdGlmIChjaGVja2VkKSB7XG5cdFx0XHRvcHRpb25zLnR5cGUgPSAnY2hlY2tib3gnO1xuXHRcdFx0b3B0aW9ucy5jaGVja2VkID0gY2hlY2tlZDtcblx0XHR9XG5cblx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblxuXHRcdFx0Ly8gQWRkIHJvbGUgZm9yIHNwZWNpYWwgY2FzZSBtZW51IGl0ZW1zXG5cdFx0XHRpZiAoY29tbWFuZElkID09PSAnZWRpdG9yLmFjdGlvbi5jbGlwYm9hcmRDdXRBY3Rpb24nKSB7XG5cdFx0XHRcdG9wdGlvbnMucm9sZSA9ICdjdXQnO1xuXHRcdFx0fSBlbHNlIGlmIChjb21tYW5kSWQgPT09ICdlZGl0b3IuYWN0aW9uLmNsaXBib2FyZENvcHlBY3Rpb24nKSB7XG5cdFx0XHRcdG9wdGlvbnMucm9sZSA9ICdjb3B5Jztcblx0XHRcdH0gZWxzZSBpZiAoY29tbWFuZElkID09PSAnZWRpdG9yLmFjdGlvbi5jbGlwYm9hcmRQYXN0ZUFjdGlvbicpIHtcblx0XHRcdFx0b3B0aW9ucy5yb2xlID0gJ3Bhc3RlJztcblx0XHRcdH1cblxuXHRcdFx0Ly8gQWRkIGNvbnRleHQgYXdhcmUgY2xpY2sgaGFuZGxlcnMgZm9yIHNwZWNpYWwgY2FzZSBtZW51IGl0ZW1zXG5cdFx0XHRpZiAoY29tbWFuZElkID09PSAndW5kbycpIHtcblx0XHRcdFx0b3B0aW9ucy5jbGljayA9IHRoaXMubWFrZUNvbnRleHRBd2FyZUNsaWNrSGFuZGxlcihjbGljaywge1xuXHRcdFx0XHRcdGluRGV2VG9vbHM6IGRldlRvb2xzID0+IGRldlRvb2xzLnVuZG8oKSxcblx0XHRcdFx0XHRpbk5vV2luZG93OiAoKSA9PiBNZW51LnNlbmRBY3Rpb25Ub0ZpcnN0UmVzcG9uZGVyKCd1bmRvOicpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChjb21tYW5kSWQgPT09ICdyZWRvJykge1xuXHRcdFx0XHRvcHRpb25zLmNsaWNrID0gdGhpcy5tYWtlQ29udGV4dEF3YXJlQ2xpY2tIYW5kbGVyKGNsaWNrLCB7XG5cdFx0XHRcdFx0aW5EZXZUb29sczogZGV2VG9vbHMgPT4gZGV2VG9vbHMucmVkbygpLFxuXHRcdFx0XHRcdGluTm9XaW5kb3c6ICgpID0+IE1lbnUuc2VuZEFjdGlvblRvRmlyc3RSZXNwb25kZXIoJ3JlZG86Jylcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbW1hbmRJZCA9PT0gJ2VkaXRvci5hY3Rpb24uc2VsZWN0QWxsJykge1xuXHRcdFx0XHRvcHRpb25zLmNsaWNrID0gdGhpcy5tYWtlQ29udGV4dEF3YXJlQ2xpY2tIYW5kbGVyKGNsaWNrLCB7XG5cdFx0XHRcdFx0aW5EZXZUb29sczogZGV2VG9vbHMgPT4gZGV2VG9vbHMuc2VsZWN0QWxsKCksXG5cdFx0XHRcdFx0aW5Ob1dpbmRvdzogKCkgPT4gTWVudS5zZW5kQWN0aW9uVG9GaXJzdFJlc3BvbmRlcignc2VsZWN0QWxsOicpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgTWVudUl0ZW0odGhpcy53aXRoS2V5YmluZGluZyhjb21tYW5kSWQsIG9wdGlvbnMpKTtcblx0fVxuXG5cdHByaXZhdGUgbWFrZUNvbnRleHRBd2FyZUNsaWNrSGFuZGxlcihjbGljazogKG1lbnVJdGVtOiBNZW51SXRlbSwgd2luOiBCYXNlV2luZG93LCBldmVudDogS2V5Ym9hcmRFdmVudCkgPT4gdm9pZCwgY29udGV4dFNwZWNpZmljSGFuZGxlcnM6IElNZW51SXRlbUNsaWNrSGFuZGxlcik6IChtZW51SXRlbTogTWVudUl0ZW0sIHdpbjogQmFzZVdpbmRvdyB8IHVuZGVmaW5lZCwgZXZlbnQ6IEtleWJvYXJkRXZlbnQpID0+IHZvaWQge1xuXHRcdHJldHVybiAobWVudUl0ZW06IE1lbnVJdGVtLCB3aW46IEJhc2VXaW5kb3cgfCB1bmRlZmluZWQsIGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cblx0XHRcdC8vIE5vIEFjdGl2ZSBXaW5kb3dcblx0XHRcdGNvbnN0IGFjdGl2ZVdpbmRvdyA9IEJyb3dzZXJXaW5kb3cuZ2V0Rm9jdXNlZFdpbmRvdygpO1xuXHRcdFx0aWYgKCFhY3RpdmVXaW5kb3cpIHtcblx0XHRcdFx0cmV0dXJuIGNvbnRleHRTcGVjaWZpY0hhbmRsZXJzLmluTm9XaW5kb3coKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGV2VG9vbHMgZm9jdXNlZFxuXHRcdFx0aWYgKGFjdGl2ZVdpbmRvdy53ZWJDb250ZW50cy5pc0RldlRvb2xzRm9jdXNlZCgpICYmXG5cdFx0XHRcdGFjdGl2ZVdpbmRvdy53ZWJDb250ZW50cy5kZXZUb29sc1dlYkNvbnRlbnRzKSB7XG5cdFx0XHRcdHJldHVybiBjb250ZXh0U3BlY2lmaWNIYW5kbGVycy5pbkRldlRvb2xzKGFjdGl2ZVdpbmRvdy53ZWJDb250ZW50cy5kZXZUb29sc1dlYkNvbnRlbnRzKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRm9jdXMgaXMgbm90IGluIHRoZSB3b3JrYmVuY2ggd2ViQ29udGVudHNcblx0XHRcdGlmICghYWN0aXZlV2luZG93LndlYkNvbnRlbnRzLmlzRm9jdXNlZCgpKSB7XG5cdFx0XHRcdHJldHVybiBjb250ZXh0U3BlY2lmaWNIYW5kbGVycy5pbk5vV2luZG93KCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpbmFsbHkgZXhlY3V0ZSBjb21tYW5kIGluIFdpbmRvd1xuXHRcdFx0Y2xpY2sobWVudUl0ZW0sIHdpbiB8fCBhY3RpdmVXaW5kb3csIGV2ZW50KTtcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBydW5BY3Rpb25JblJlbmRlcmVyKGludm9jYXRpb246IElNZW51SXRlbUludm9jYXRpb24pOiBib29sZWFuIHtcblxuXHRcdC8vIFdlIHdhbnQgdG8gc3VwcG9ydCBhdXhpbGlsYXJ5IHdpbmRvd3MgdGhhdCBtYXkgaGF2ZSBmb2N1cyBieVxuXHRcdC8vIHJldHVybmluZyB0aGVpciBwYXJlbnQgd2luZG93cyBhcyB0YXJnZXQgdG8gc3VwcG9ydCBydW5uaW5nXG5cdFx0Ly8gYWN0aW9ucyB2aWEgdGhlIG1haW4gd2luZG93LlxuXHRcdGxldCBhY3RpdmVCcm93c2VyV2luZG93ID0gQnJvd3NlcldpbmRvdy5nZXRGb2N1c2VkV2luZG93KCk7XG5cdFx0aWYgKGFjdGl2ZUJyb3dzZXJXaW5kb3cpIHtcblx0XHRcdGNvbnN0IGF1eGlsaWFyeVdpbmRvd0NhbmRpZGF0ZSA9IHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0J5V2ViQ29udGVudHMoYWN0aXZlQnJvd3NlcldpbmRvdy53ZWJDb250ZW50cyk7XG5cdFx0XHRpZiAoYXV4aWxpYXJ5V2luZG93Q2FuZGlkYXRlKSB7XG5cdFx0XHRcdGFjdGl2ZUJyb3dzZXJXaW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dCeUlkKGF1eGlsaWFyeVdpbmRvd0NhbmRpZGF0ZS5wYXJlbnRJZCk/LndpbiA/PyBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFdlIG1ha2Ugc3VyZSB0byBub3QgcnVuIGFjdGlvbnMgd2hlbiB0aGUgd2luZG93IGhhcyBubyBmb2N1cywgdGhpcyBoZWxwc1xuXHRcdC8vIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjU5MDcgYW5kIHNwZWNpZmljYWxseSBmb3Jcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE5Mjhcblx0XHQvLyBTdGlsbCBhbGxvdyB0byBydW4gd2hlbiB0aGUgbGFzdCBhY3RpdmUgd2luZG93IGlzIG1pbmltaXplZCB0aG91Z2ggZm9yXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzYzMDAwXG5cdFx0aWYgKCFhY3RpdmVCcm93c2VyV2luZG93KSB7XG5cdFx0XHRjb25zdCBsYXN0QWN0aXZlV2luZG93ID0gdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVdpbmRvdygpO1xuXHRcdFx0aWYgKGxhc3RBY3RpdmVXaW5kb3c/Lndpbj8uaXNNaW5pbWl6ZWQoKSkge1xuXHRcdFx0XHRhY3RpdmVCcm93c2VyV2luZG93ID0gbGFzdEFjdGl2ZVdpbmRvdy53aW47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlV2luZG93ID0gYWN0aXZlQnJvd3NlcldpbmRvdyA/IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0J5SWQoYWN0aXZlQnJvd3NlcldpbmRvdy5pZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGFjdGl2ZVdpbmRvdykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdtZW51YmFyI3J1bkFjdGlvbkluUmVuZGVyZXInLCBpbnZvY2F0aW9uKTtcblxuXHRcdFx0aWYgKGlzTWFjaW50b3NoICYmICF0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuaXNCdWlsdCAmJiAhYWN0aXZlV2luZG93LmlzUmVhZHkpIHtcblx0XHRcdFx0aWYgKChpbnZvY2F0aW9uLnR5cGUgPT09ICdjb21tYW5kSWQnICYmIGludm9jYXRpb24uY29tbWFuZElkID09PSAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVEZXZUb29scycpIHx8IChpbnZvY2F0aW9uLnR5cGUgIT09ICdjb21tYW5kSWQnICYmIGludm9jYXRpb24udXNlclNldHRpbmdzTGFiZWwgPT09ICdhbHQrY21kK2knKSkge1xuXHRcdFx0XHRcdC8vIHByZXZlbnQgdGhpcyBhY3Rpb24gZnJvbSBydW5uaW5nIHR3aWNlIG9uIG1hY09TIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNjI3MTkpXG5cdFx0XHRcdFx0Ly8gd2UgYWxyZWFkeSByZWdpc3RlciBhIGtleWJpbmRpbmcgaW4gd29ya2JlbmNoLnRzIGZvciBvcGVuaW5nIGRldmVsb3BlciB0b29scyBpbiBjYXNlIHNvbWV0aGluZ1xuXHRcdFx0XHRcdC8vIGdvZXMgd3JvbmcgYW5kIHRoYXQga2V5YmluZGluZyBpcyBvbmx5IHJlbW92ZWQgd2hlbiB0aGUgYXBwbGljYXRpb24gaGFzIGxvYWRlZCAoPSB3aW5kb3cgcmVhZHkpLlxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaW52b2NhdGlvbi50eXBlID09PSAnY29tbWFuZElkJykge1xuXHRcdFx0XHRjb25zdCBydW5BY3Rpb25QYXlsb2FkOiBJTmF0aXZlUnVuQWN0aW9uSW5XaW5kb3dSZXF1ZXN0ID0geyBpZDogaW52b2NhdGlvbi5jb21tYW5kSWQsIGZyb206ICdtZW51JyB9O1xuXHRcdFx0XHRhY3RpdmVXaW5kb3cuc2VuZFdoZW5SZWFkeSgndnNjb2RlOnJ1bkFjdGlvbicsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHJ1bkFjdGlvblBheWxvYWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcnVuS2V5YmluZGluZ1BheWxvYWQ6IElOYXRpdmVSdW5LZXliaW5kaW5nSW5XaW5kb3dSZXF1ZXN0ID0geyB1c2VyU2V0dGluZ3NMYWJlbDogaW52b2NhdGlvbi51c2VyU2V0dGluZ3NMYWJlbCB9O1xuXHRcdFx0XHRhY3RpdmVXaW5kb3cuc2VuZFdoZW5SZWFkeSgndnNjb2RlOnJ1bktleWJpbmRpbmcnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCBydW5LZXliaW5kaW5nUGF5bG9hZCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ21lbnViYXIjcnVuQWN0aW9uSW5SZW5kZXJlcjogbm8gYWN0aXZlIHdpbmRvdyBmb3VuZCcsIGludm9jYXRpb24pO1xuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB3aXRoS2V5YmluZGluZyhjb21tYW5kSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgb3B0aW9uczogTWVudUl0ZW1Db25zdHJ1Y3Rvck9wdGlvbnMgJiBJTWVudUl0ZW1XaXRoS2V5YmluZGluZyk6IE1lbnVJdGVtQ29uc3RydWN0b3JPcHRpb25zIHtcblx0XHRjb25zdCBiaW5kaW5nID0gdHlwZW9mIGNvbW1hbmRJZCA9PT0gJ3N0cmluZycgPyB0aGlzLmtleWJpbmRpbmdzW2NvbW1hbmRJZF0gOiB1bmRlZmluZWQ7XG5cblx0XHQvLyBBcHBseSBiaW5kaW5nIGlmIHRoZXJlIGlzIG9uZVxuXHRcdGlmIChiaW5kaW5nPy5sYWJlbCkge1xuXG5cdFx0XHQvLyBpZiB0aGUgYmluZGluZyBpcyBuYXRpdmUsIHdlIGNhbiBqdXN0IGFwcGx5IGl0XG5cdFx0XHRpZiAoYmluZGluZy5pc05hdGl2ZSAhPT0gZmFsc2UpIHtcblx0XHRcdFx0b3B0aW9ucy5hY2NlbGVyYXRvciA9IGJpbmRpbmcubGFiZWw7XG5cdFx0XHRcdG9wdGlvbnMudXNlclNldHRpbmdzTGFiZWwgPSBiaW5kaW5nLnVzZXJTZXR0aW5nc0xhYmVsO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB0aGUga2V5YmluZGluZyBpcyBub3QgbmF0aXZlIHNvIHdlIGNhbm5vdCBzaG93IGl0IGFzIHBhcnQgb2YgdGhlIGFjY2VsZXJhdG9yIG9mXG5cdFx0XHQvLyB0aGUgbWVudSBpdGVtLiB3ZSBmYWxsYmFjayB0byBhIGRpZmZlcmVudCBzdHJhdGVneSBzbyB0aGF0IHdlIGFsd2F5cyBkaXNwbGF5IGl0XG5cdFx0XHRlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucy5sYWJlbCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29uc3QgYmluZGluZ0luZGV4ID0gb3B0aW9ucy5sYWJlbC5pbmRleE9mKCdbJyk7XG5cdFx0XHRcdGlmIChiaW5kaW5nSW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdG9wdGlvbnMubGFiZWwgPSBgJHtvcHRpb25zLmxhYmVsLnN1YnN0cigwLCBiaW5kaW5nSW5kZXgpfSBbJHtiaW5kaW5nLmxhYmVsfV1gO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG9wdGlvbnMubGFiZWwgPSBgJHtvcHRpb25zLmxhYmVsfSBbJHtiaW5kaW5nLmxhYmVsfV1gO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVW5zZXQgYmluZGluZ3MgaWYgdGhlcmUgaXMgbm9uZVxuXHRcdGVsc2Uge1xuXHRcdFx0b3B0aW9ucy5hY2NlbGVyYXRvciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3B0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgbGlrZUFjdGlvbihjb21tYW5kSWQ6IHN0cmluZywgb3B0aW9uczogTWVudUl0ZW1Db25zdHJ1Y3Rvck9wdGlvbnMsIHNldEFjY2VsZXJhdG9yID0gIW9wdGlvbnMuYWNjZWxlcmF0b3IpOiBNZW51SXRlbUNvbnN0cnVjdG9yT3B0aW9ucyB7XG5cdFx0aWYgKHNldEFjY2VsZXJhdG9yKSB7XG5cdFx0XHRvcHRpb25zID0gdGhpcy53aXRoS2V5YmluZGluZyhjb21tYW5kSWQsIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsQ2xpY2sgPSBvcHRpb25zLmNsaWNrO1xuXHRcdG9wdGlvbnMuY2xpY2sgPSAoaXRlbSwgd2luZG93LCBldmVudCkgPT4ge1xuXHRcdFx0dGhpcy5yZXBvcnRNZW51QWN0aW9uVGVsZW1ldHJ5KGNvbW1hbmRJZCk7XG5cdFx0XHRvcmlnaW5hbENsaWNrPy4oaXRlbSwgd2luZG93LCBldmVudCk7XG5cdFx0fTtcblxuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBvcGVuVXJsKHVybDogc3RyaW5nLCBpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5uYXRpdmVIb3N0TWFpblNlcnZpY2Uub3BlbkV4dGVybmFsKHVuZGVmaW5lZCwgdXJsKTtcblx0XHR0aGlzLnJlcG9ydE1lbnVBY3Rpb25UZWxlbWV0cnkoaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXBvcnRNZW51QWN0aW9uVGVsZW1ldHJ5KGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkLCBmcm9tOiB0ZWxlbWV0cnlGcm9tIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBtbmVtb25pY0xhYmVsKGxhYmVsOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBtbmVtb25pY01lbnVMYWJlbChsYWJlbCwgIXRoaXMuY3VycmVudEVuYWJsZU1lbnVCYXJNbmVtb25pY3MpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIF9fc2VwYXJhdG9yX18oKTogTWVudUl0ZW0ge1xuXHRyZXR1cm4gbmV3IE1lbnVJdGVtKHsgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsS0FBSyxlQUEwQyxNQUFNLGdCQUF5RDtBQUV2SCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGFBQWEsZ0JBQWdCO0FBQ3RDLFNBQVMsV0FBVztBQUNwQixZQUFZLFNBQVM7QUFDckIsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBdUYseUJBQXlCLCtCQUErQiw0QkFBNEIsZ0NBQWlEO0FBQzVOLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCLGlCQUFpQjtBQUMxQyxTQUFnRyxxQkFBcUI7QUFDckgsU0FBb0MscUJBQXFCLG1CQUFtQjtBQUM1RSxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGtCQUFrQjtBQUUzQixNQUFNLGdCQUFnQjtBQWdCZixJQUFNLFVBQU4sY0FBc0IsV0FBVztBQUFBLEVBdUJ2QyxZQUNrQyxlQUNPLHNCQUNGLG9CQUNJLHdCQUNOLGtCQUNZLDhCQUNoQixjQUNRLHNCQUNWLFlBQ1csdUJBQ1AsZ0JBQ2EsNkJBQzlDO0FBQ0QsVUFBTTtBQWIyQjtBQUNPO0FBQ0Y7QUFDSTtBQUNOO0FBQ1k7QUFDaEI7QUFDUTtBQUNWO0FBQ1c7QUFDUDtBQUNhO0FBZGhELFNBQWlCLHVCQUFvSSx1QkFBTyxPQUFPLElBQUk7QUFrQnRLLFNBQUssY0FBYyxLQUFLLFVBQVUsSUFBSSxpQkFBaUIsTUFBTSxLQUFLLGFBQWEsR0FBRyxDQUFD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
