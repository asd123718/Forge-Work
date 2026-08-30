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
import * as fs from "fs";
import { exec } from "child_process";
import { app, BrowserWindow, clipboard, contentTracing, Menu, Notification, powerMonitor, powerSaveBlocker, screen, shell, systemPreferences, webContents } from "electron";
import { arch, cpus, freemem, loadavg, platform, release, totalmem, type } from "os";
import { promisify } from "util";
import { memoize } from "../../../base/common/decorators.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { matchesSomeScheme, Schemas } from "../../../base/common/network.js";
import { dirname, join, posix, resolve, win32 } from "../../../base/common/path.js";
import { isLinux, isMacintosh, isWindows } from "../../../base/common/platform.js";
import { hasKey } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { virtualMachineHint } from "../../../base/node/id.js";
import { Promises, SymlinkSupport } from "../../../base/node/pfs.js";
import { findFreePort, isPortFree } from "../../../base/node/ports.js";
import { localize } from "../../../nls.js";
import { IDialogMainService } from "../../dialogs/electron-main/dialogMainService.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { createDecorator, IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { FocusMode } from "../common/native.js";
import { listOllamaModelsFromMachine } from "../node/ollamaCli.js";
import { IGlobalKeybindingsMainService } from "../../globalKeybindings/electron-main/globalKeybindingsMainService.js";
import { IProductService } from "../../product/common/productService.js";
import { IThemeMainService } from "../../theme/electron-main/themeMainService.js";
import { defaultWindowState } from "../../window/electron-main/window.js";
import { defaultBrowserWindowOptions, IWindowsMainService, OpenContext } from "../../windows/electron-main/windows.js";
import { isWorkspaceIdentifier, toWorkspaceIdentifier } from "../../workspace/common/workspace.js";
import { IWorkspacesManagementMainService } from "../../workspaces/electron-main/workspacesManagementMainService.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { hasWSLFeatureInstalled } from "../../remote/node/wsl.js";
import { WindowProfiler } from "../../profiling/electron-main/windowProfiling.js";
import { IAuxiliaryWindowsMainService } from "../../auxiliaryWindow/electron-main/auxiliaryWindows.js";
import { CancellationError } from "../../../base/common/errors.js";
import { zip } from "../../../base/node/zip.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IProxyAuthService } from "./auth.js";
import { IRequestService } from "../../request/common/request.js";
import { randomPath } from "../../../base/common/extpath.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
const INativeHostMainService = createDecorator("nativeHostMainService");
let NativeHostMainService = class extends Disposable {
  constructor(windowsMainService, auxiliaryWindowsMainService, dialogMainService, lifecycleMainService, environmentMainService, logService, productService, themeMainService, workspacesManagementMainService, configurationService, requestService, proxyAuthService, instantiationService, globalKeybindingsMainService) {
    super();
    this.windowsMainService = windowsMainService;
    this.auxiliaryWindowsMainService = auxiliaryWindowsMainService;
    this.dialogMainService = dialogMainService;
    this.lifecycleMainService = lifecycleMainService;
    this.environmentMainService = environmentMainService;
    this.logService = logService;
    this.productService = productService;
    this.themeMainService = themeMainService;
    this.workspacesManagementMainService = workspacesManagementMainService;
    this.configurationService = configurationService;
    this.requestService = requestService;
    this.proxyAuthService = proxyAuthService;
    this.instantiationService = instantiationService;
    this.globalKeybindingsMainService = globalKeybindingsMainService;
    this._onDidChangePassword = this._register(new Emitter());
    this.onDidChangePassword = this._onDidChangePassword.event;
    this._isTracing = false;
    // #endregion
    //#region Toast Notifications
    this.activeToasts = this._register(new DisposableMap());
    {
      this.onDidOpenMainWindow = Event.map(this.windowsMainService.onDidOpenWindow, (window) => window.id);
      this.onDidTriggerWindowSystemContextMenu = Event.any(
        Event.map(this.windowsMainService.onDidTriggerSystemContextMenu, ({ window, x, y }) => ({ windowId: window.id, x, y })),
        Event.map(this.auxiliaryWindowsMainService.onDidTriggerSystemContextMenu, ({ window, x, y }) => ({ windowId: window.id, x, y }))
      );
      this.onDidMaximizeWindow = Event.any(
        Event.map(this.windowsMainService.onDidMaximizeWindow, (window) => window.id),
        Event.map(this.auxiliaryWindowsMainService.onDidMaximizeWindow, (window) => window.id)
      );
      this.onDidUnmaximizeWindow = Event.any(
        Event.map(this.windowsMainService.onDidUnmaximizeWindow, (window) => window.id),
        Event.map(this.auxiliaryWindowsMainService.onDidUnmaximizeWindow, (window) => window.id)
      );
      this.onDidChangeWindowFullScreen = Event.any(
        Event.map(this.windowsMainService.onDidChangeFullScreen, (e) => ({ windowId: e.window.id, fullscreen: e.fullscreen })),
        Event.map(this.auxiliaryWindowsMainService.onDidChangeFullScreen, (e) => ({ windowId: e.window.id, fullscreen: e.fullscreen }))
      );
      this.onDidChangeWindowAlwaysOnTop = Event.any(
        Event.None,
        // always on top is unsupported in main windows currently
        Event.map(this.auxiliaryWindowsMainService.onDidChangeAlwaysOnTop, (e) => ({ windowId: e.window.id, alwaysOnTop: e.alwaysOnTop }))
      );
      this.onDidBlurMainWindow = Event.filter(Event.fromNodeEventEmitter(app, "browser-window-blur", (event, window) => window.id), (windowId) => !!this.windowsMainService.getWindowById(windowId));
      this.onDidFocusMainWindow = Event.any(
        Event.map(Event.filter(Event.map(this.windowsMainService.onDidChangeWindowsCount, () => this.windowsMainService.getLastActiveWindow()), (window) => !!window), (window) => window.id),
        Event.filter(Event.fromNodeEventEmitter(app, "browser-window-focus", (event, window) => window.id), (windowId) => !!this.windowsMainService.getWindowById(windowId))
      );
      this.onDidBlurMainOrAuxiliaryWindow = Event.any(
        this.onDidBlurMainWindow,
        Event.map(Event.filter(Event.fromNodeEventEmitter(app, "browser-window-blur", (event, window) => this.auxiliaryWindowsMainService.getWindowByWebContents(window.webContents)), (window) => !!window), (window) => window.id)
      );
      this.onDidFocusMainOrAuxiliaryWindow = Event.any(
        this.onDidFocusMainWindow,
        Event.map(Event.filter(Event.fromNodeEventEmitter(app, "browser-window-focus", (event, window) => this.auxiliaryWindowsMainService.getWindowByWebContents(window.webContents)), (window) => !!window), (window) => window.id)
      );
      this.onDidSuspendOS = Event.fromNodeEventEmitter(powerMonitor, "suspend");
      this.onDidResumeOS = Event.fromNodeEventEmitter(powerMonitor, "resume");
      this.onDidChangeOnBatteryPower = Event.any(
        Event.map(Event.fromNodeEventEmitter(powerMonitor, "on-ac"), () => false),
        Event.map(Event.fromNodeEventEmitter(powerMonitor, "on-battery"), () => true)
      );
      this.onDidChangeThermalState = Event.map(
        Event.fromNodeEventEmitter(powerMonitor, "thermal-state-change"),
        (e) => e.state
      );
      this.onDidChangeSpeedLimit = Event.map(
        Event.fromNodeEventEmitter(powerMonitor, "speed-limit-change"),
        (e) => e.limit
      );
      this.onWillShutdownOS = Event.fromNodeEventEmitter(powerMonitor, "shutdown");
      this.onDidLockScreen = Event.fromNodeEventEmitter(powerMonitor, "lock-screen");
      this.onDidUnlockScreen = Event.fromNodeEventEmitter(powerMonitor, "unlock-screen");
      this.onDidChangeColorScheme = this.themeMainService.onDidChangeColorScheme;
      this.onDidChangeDisplay = Event.debounce(Event.any(
        Event.filter(Event.fromNodeEventEmitter(screen, "display-metrics-changed", (event, display, changedMetrics) => changedMetrics), (changedMetrics) => {
          return !(Array.isArray(changedMetrics) && changedMetrics.length === 1 && changedMetrics[0] === "workArea");
        }),
        Event.fromNodeEventEmitter(screen, "display-added"),
        Event.fromNodeEventEmitter(screen, "display-removed")
      ), () => {
      }, 100);
    }
  }
  //#region Properties
  get windowId() {
    throw new Error("Not implemented in electron-main");
  }
  async getWindows(windowId, options) {
    const mainWindows = this.windowsMainService.getWindows().map((window) => ({
      id: window.id,
      workspace: window.openedWorkspace ?? toWorkspaceIdentifier(window.backupPath, window.isExtensionDevelopmentHost),
      title: window.win?.getTitle() ?? "",
      filename: window.getRepresentedFilename(),
      dirty: window.isDocumentEdited()
    }));
    const auxiliaryWindows = [];
    if (options.includeAuxiliaryWindows) {
      auxiliaryWindows.push(...this.auxiliaryWindowsMainService.getWindows().map((window) => ({
        id: window.id,
        parentId: window.parentId,
        title: window.win?.getTitle() ?? "",
        filename: window.getRepresentedFilename()
      })));
    }
    return [...mainWindows, ...auxiliaryWindows];
  }
  async getWindowCount(windowId) {
    return this.windowsMainService.getWindowCount();
  }
  async getActiveWindowId(windowId) {
    const activeWindow = this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();
    if (activeWindow) {
      return activeWindow.id;
    }
    return void 0;
  }
  async getActiveWindowPosition() {
    const activeWindow = this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();
    if (activeWindow) {
      return activeWindow.getBounds();
    }
    return void 0;
  }
  async getWindowPosition(windowId, options) {
    return this.windowById(options?.targetWindowId, windowId)?.win?.getBounds();
  }
  async getNativeWindowHandle(fallbackWindowId, windowId) {
    const window = this.windowById(windowId, fallbackWindowId);
    if (window?.win) {
      return VSBuffer.wrap(window.win.getNativeWindowHandle());
    }
    return void 0;
  }
  openWindow(windowId, arg1, arg2) {
    if (Array.isArray(arg1)) {
      return this.doOpenWindow(windowId, arg1, arg2);
    }
    return this.doOpenEmptyWindow(windowId, arg1);
  }
  async doOpenWindow(windowId, toOpen, options = /* @__PURE__ */ Object.create(null)) {
    if (toOpen.length > 0) {
      const windows = await this.windowsMainService.open({
        context: OpenContext.API,
        contextWindowId: windowId,
        urisToOpen: toOpen,
        cli: this.environmentMainService.args,
        forceNewWindow: options.forceNewWindow,
        forceReuseWindow: options.forceReuseWindow,
        preferNewWindow: options.preferNewWindow,
        diffMode: options.diffMode,
        mergeMode: options.mergeMode,
        addMode: options.addMode,
        removeMode: options.removeMode,
        gotoLineMode: options.gotoLineMode,
        noRecentEntry: options.noRecentEntry,
        waitMarkerFileURI: options.waitMarkerFileURI,
        remoteAuthority: options.remoteAuthority || void 0,
        forceProfile: options.forceProfile,
        forceTempProfile: options.forceTempProfile
      });
      const chatSessionToOpen = options.chatSessionToOpen;
      if (chatSessionToOpen && windows.length === 1) {
        windows[0].sendWhenReady("vscode:openChatSession", CancellationToken.None, URI.revive(chatSessionToOpen).toString());
      }
    }
  }
  async doOpenEmptyWindow(windowId, options) {
    await this.windowsMainService.openEmptyWindow({
      context: OpenContext.API,
      contextWindowId: windowId
    }, options);
  }
  async openAgentsWindow(windowId, options) {
    const windows = await this.windowsMainService.openAgentsWindow({
      context: OpenContext.API,
      contextWindowId: windowId,
      cli: this.environmentMainService.args
    }, options?.folderUri ? URI.revive(options.folderUri) : void 0, options?.sessionResource ? URI.revive(options.sessionResource) : void 0, options?.source);
    if (windows.length > 0) {
      windows[0].focus();
    }
  }
  async syncSystemWideKeybindings(windowId, keybindings) {
    if (typeof windowId !== "number") {
      return { failed: [] };
    }
    return this.globalKeybindingsMainService.updateKeybindings(windowId, keybindings);
  }
  async isFullScreen(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return window?.isFullScreen ?? false;
  }
  async toggleFullScreen(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.toggleFullScreen();
  }
  async getCursorScreenPoint(windowId) {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    return { point, display: display.bounds };
  }
  async isMaximized(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return window?.win?.isMaximized() ?? false;
  }
  async maximizeWindow(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.maximize();
  }
  async unmaximizeWindow(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.unmaximize();
  }
  async minimizeWindow(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.minimize();
  }
  async moveWindowTop(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.moveTop();
  }
  async isWindowAlwaysOnTop(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return window?.win?.isAlwaysOnTop() ?? false;
  }
  async toggleWindowAlwaysOnTop(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.setAlwaysOnTop(!window.win.isAlwaysOnTop());
  }
  async setWindowAlwaysOnTop(windowId, alwaysOnTop, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.setAlwaysOnTop(alwaysOnTop);
  }
  async positionWindow(windowId, position, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    if (window?.win) {
      if (window.win.isFullScreen()) {
        const fullscreenLeftFuture = Event.toPromise(Event.once(Event.fromNodeEventEmitter(window.win, "leave-full-screen")));
        window.win.setFullScreen(false);
        await fullscreenLeftFuture;
      }
      window.win.setBounds(position);
    }
  }
  async updateWindowControls(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.updateWindowControls(options);
  }
  async updateWindowAccentColor(windowId, color, inactiveColor) {
    if (!isWindows) {
      return;
    }
    const window = this.windowById(windowId);
    if (!window) {
      return;
    }
    let activeWindowAccentColor;
    let inactiveWindowAccentColor;
    if (color === "default") {
      activeWindowAccentColor = null;
      inactiveWindowAccentColor = null;
    } else if (color === "off") {
      activeWindowAccentColor = false;
      inactiveWindowAccentColor = false;
    } else {
      activeWindowAccentColor = color;
      inactiveWindowAccentColor = inactiveColor ?? color;
    }
    const windows = [window];
    for (const auxiliaryWindow of this.auxiliaryWindowsMainService.getWindows()) {
      if (auxiliaryWindow.parentId === windowId) {
        windows.push(auxiliaryWindow);
      }
    }
    for (const window2 of windows) {
      window2.win?.setAccentColor(window2.win.isFocused() ? activeWindowAccentColor : inactiveWindowAccentColor);
    }
  }
  async focusWindow(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.focus({ mode: options?.mode ?? FocusMode.Transfer });
  }
  async setMinimumSize(windowId, width, height) {
    const window = this.codeWindowById(windowId);
    if (window?.win) {
      const [windowWidth, windowHeight] = window.win.getSize();
      const [minWindowWidth, minWindowHeight] = window.win.getMinimumSize();
      const [newMinWindowWidth, newMinWindowHeight] = [width ?? minWindowWidth, height ?? minWindowHeight];
      const [newWindowWidth, newWindowHeight] = [Math.max(windowWidth, newMinWindowWidth), Math.max(windowHeight, newMinWindowHeight)];
      if (minWindowWidth !== newMinWindowWidth || minWindowHeight !== newMinWindowHeight) {
        window.win.setMinimumSize(newMinWindowWidth, newMinWindowHeight);
      }
      if (windowWidth !== newWindowWidth || windowHeight !== newWindowHeight) {
        window.win.setSize(newWindowWidth, newWindowHeight);
      }
    }
  }
  async saveWindowSplash(windowId, splash) {
    const window = this.codeWindowById(windowId);
    this.themeMainService.saveWindowSplash(windowId, window?.openedWorkspace, splash);
  }
  async setBackgroundThrottling(windowId, allowed) {
    const window = this.codeWindowById(windowId);
    this.logService.trace(`Setting background throttling for window ${windowId} to '${allowed}'`);
    window?.win?.webContents?.setBackgroundThrottling(allowed);
  }
  //#endregion
  //#region macOS Shell Command
  async installShellCommand(windowId) {
    const { source, target } = await this.getShellCommandLink();
    try {
      const { symbolicLink } = await SymlinkSupport.stat(source);
      if (symbolicLink && !symbolicLink.dangling) {
        const linkTargetRealPath = await Promises.realpath(source);
        if (target === linkTargetRealPath) {
          return;
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    await this.installShellCommandWithPrivileges(windowId, source, target);
  }
  async installShellCommandWithPrivileges(windowId, source, target) {
    const { response } = await this.showMessageBox(windowId, {
      type: "info",
      message: localize("warnEscalation", "{0} will now prompt with 'osascript' for Administrator privileges to install the shell command.", this.productService.nameShort),
      buttons: [
        localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK"),
        localize("cancel", "Cancel")
      ]
    });
    if (response === 1) {
      throw new CancellationError();
    }
    try {
      const command = `osascript -e "do shell script \\"mkdir -p /usr/local/bin && ln -sf '${target}' '${source}'\\" with administrator privileges"`;
      await promisify(exec)(command);
    } catch (error) {
      throw new Error(localize("cantCreateBinFolder", "Unable to install the shell command '{0}'.", source));
    }
  }
  async uninstallShellCommand(windowId) {
    const { source } = await this.getShellCommandLink();
    try {
      await fs.promises.unlink(source);
    } catch (error) {
      switch (error.code) {
        case "EACCES": {
          const { response } = await this.showMessageBox(windowId, {
            type: "info",
            message: localize("warnEscalationUninstall", "{0} will now prompt with 'osascript' for Administrator privileges to uninstall the shell command.", this.productService.nameShort),
            buttons: [
              localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK"),
              localize("cancel", "Cancel")
            ]
          });
          if (response === 1) {
            throw new CancellationError();
          }
          try {
            const command = `osascript -e "do shell script \\"rm '${source}'\\" with administrator privileges"`;
            await promisify(exec)(command);
          } catch (error2) {
            throw new Error(localize("cantUninstall", "Unable to uninstall the shell command '{0}'.", source));
          }
          break;
        }
        case "ENOENT":
          break;
        // ignore file not found
        default:
          throw error;
      }
    }
  }
  async getShellCommandLink() {
    const target = resolve(this.environmentMainService.appRoot, "bin", "code");
    const source = `/usr/local/bin/${this.productService.applicationName}`;
    const sourceExists = await Promises.exists(target);
    if (!sourceExists) {
      throw new Error(localize("sourceMissing", "Unable to find shell script in '{0}'", target));
    }
    return { source, target };
  }
  //#endregion
  //#region Dialog
  async showMessageBox(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return this.dialogMainService.showMessageBox(options, window?.win ?? void 0);
  }
  async showSaveDialog(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return this.dialogMainService.showSaveDialog(options, window?.win ?? void 0);
  }
  async showOpenDialog(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return this.dialogMainService.showOpenDialog(options, window?.win ?? void 0);
  }
  async pickFileFolderAndOpen(windowId, options) {
    const paths = await this.dialogMainService.pickFileFolder(options);
    if (paths) {
      await this.doOpenPicked(await Promise.all(paths.map(async (path) => await SymlinkSupport.existsDirectory(path) ? { folderUri: URI.file(path) } : { fileUri: URI.file(path) })), options, windowId);
    }
  }
  async pickFolderAndOpen(windowId, options) {
    const paths = await this.dialogMainService.pickFolder(options);
    if (paths) {
      await this.doOpenPicked(paths.map((path) => ({ folderUri: URI.file(path) })), options, windowId);
    }
  }
  async pickFileAndOpen(windowId, options) {
    const paths = await this.dialogMainService.pickFile(options);
    if (paths) {
      await this.doOpenPicked(paths.map((path) => ({ fileUri: URI.file(path) })), options, windowId);
    }
  }
  async pickWorkspaceAndOpen(windowId, options) {
    const paths = await this.dialogMainService.pickWorkspace(options);
    if (paths) {
      await this.doOpenPicked(paths.map((path) => ({ workspaceUri: URI.file(path) })), options, windowId);
    }
  }
  async doOpenPicked(openable, options, windowId) {
    await this.windowsMainService.open({
      context: OpenContext.DIALOG,
      contextWindowId: windowId,
      cli: this.environmentMainService.args,
      urisToOpen: openable,
      forceNewWindow: options.forceNewWindow
      /* remoteAuthority will be determined based on openable */
    });
  }
  //#endregion
  //#region OS
  async showItemInFolder(windowId, path) {
    shell.showItemInFolder(path);
  }
  async setRepresentedFilename(windowId, path, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.setRepresentedFilename(path);
  }
  async setDocumentEdited(windowId, edited, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.setDocumentEdited(edited);
  }
  async openExternal(windowId, url, defaultApplication) {
    this.environmentMainService.unsetSnapExportedVariables();
    try {
      if (matchesSomeScheme(url, Schemas.http, Schemas.https)) {
        this.openExternalBrowser(windowId, url, defaultApplication);
      } else {
        this.doOpenShellExternal(windowId, url);
      }
    } finally {
      this.environmentMainService.restoreSnapExportedVariables();
    }
    return true;
  }
  async openExternalBrowser(windowId, url, defaultApplication) {
    const configuredBrowser = defaultApplication ?? this.configurationService.getValue("workbench.externalBrowser");
    if (!configuredBrowser) {
      return this.doOpenShellExternal(windowId, url);
    }
    if (configuredBrowser.includes(posix.sep) || configuredBrowser.includes(win32.sep)) {
      const browserPathExists = await Promises.exists(configuredBrowser);
      if (!browserPathExists) {
        this.logService.error(`Configured external browser path does not exist: ${configuredBrowser}`);
        return this.doOpenShellExternal(windowId, url);
      }
    }
    try {
      const { default: open, apps } = await import("open");
      const res = await open(url, {
        app: {
          // Use `open.apps` helper to allow cross-platform browser
          // aliases to be looked up properly. Fallback to the
          // configured value if not found.
          name: Object.hasOwn(apps, configuredBrowser) ? apps[configuredBrowser] : configuredBrowser
        }
      });
      if (!isWindows) {
        res.stderr?.once("data", (data) => {
          this.logService.error(`Error openening external URL '${url}' using browser '${configuredBrowser}': ${data.toString()}`);
          return this.doOpenShellExternal(windowId, url);
        });
      }
    } catch (error) {
      this.logService.error(`Unable to open external URL '${url}' using browser '${configuredBrowser}' due to ${error}.`);
      return this.doOpenShellExternal(windowId, url);
    }
  }
  async doOpenShellExternal(windowId, url) {
    try {
      await shell.openExternal(url);
    } catch (error) {
      let isLink;
      let message;
      if (matchesSomeScheme(url, Schemas.http, Schemas.https)) {
        isLink = true;
        message = localize("openExternalErrorLinkMessage", "An error occurred opening a link in your default browser.");
      } else {
        isLink = false;
        message = localize("openExternalProgramErrorMessage", "An error occurred opening an external program.");
      }
      const { response } = await this.dialogMainService.showMessageBox({
        type: "error",
        message,
        detail: error.message,
        buttons: isLink ? [
          localize({ key: "copyLink", comment: ["&& denotes a mnemonic"] }, "&&Copy Link"),
          localize("cancel", "Cancel")
        ] : [
          localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK")
        ]
      }, this.windowById(windowId)?.win ?? void 0);
      if (response === 1) {
        return;
      }
      this.writeClipboardText(windowId, url);
    }
  }
  moveItemToTrash(windowId, fullPath) {
    return shell.trashItem(fullPath);
  }
  async getMediaAccessStatus(windowId, mediaType) {
    if (isMacintosh) {
      return systemPreferences.getMediaAccessStatus(mediaType);
    }
    return "granted";
  }
  async isAdmin() {
    let isAdmin;
    if (isWindows) {
      isAdmin = (await import("native-is-elevated")).default();
    } else {
      isAdmin = process.getuid?.() === 0;
    }
    return isAdmin;
  }
  async writeElevated(windowId, source, target, options) {
    const sudoPrompt = await import("@vscode/sudo-prompt");
    const argsFile = randomPath(this.environmentMainService.userDataPath, "code-elevated");
    await Promises.writeFile(argsFile, JSON.stringify({ source: source.fsPath, target: target.fsPath }));
    try {
      await new Promise((resolve2, reject) => {
        const sudoCommand = [`"${this.cliPath}"`];
        if (options?.unlock) {
          sudoCommand.push("--file-chmod");
        }
        sudoCommand.push("--file-write", `"${argsFile}"`);
        const promptOptions = {
          name: this.productService.nameLong.replace("-", ""),
          icns: isMacintosh && this.environmentMainService.isBuilt ? join(dirname(this.environmentMainService.appRoot), `${this.productService.nameShort}.icns`) : void 0
        };
        this.logService.trace(`[sudo-prompt] running command: ${sudoCommand.join(" ")}`);
        sudoPrompt.exec(sudoCommand.join(" "), promptOptions, (error, stdout, stderr) => {
          if (stdout) {
            this.logService.trace(`[sudo-prompt] received stdout: ${stdout}`);
          }
          if (stderr) {
            this.logService.error(`[sudo-prompt] received stderr: ${stderr}`);
          }
          if (error) {
            reject(error);
          } else {
            resolve2(void 0);
          }
        });
      });
    } finally {
      await fs.promises.unlink(argsFile);
    }
  }
  async isRunningUnderARM64Translation() {
    if (isLinux || isWindows) {
      return false;
    }
    return app.runningUnderARM64Translation;
  }
  get cliPath() {
    if (isWindows) {
      if (this.environmentMainService.isBuilt) {
        return join(dirname(process.execPath), "bin", `${this.productService.applicationName}.cmd`);
      }
      return join(this.environmentMainService.appRoot, "scripts", "code-cli.bat");
    }
    if (isLinux) {
      if (this.environmentMainService.isBuilt) {
        return join(dirname(process.execPath), "bin", `${this.productService.applicationName}`);
      }
      return join(this.environmentMainService.appRoot, "scripts", "code-cli.sh");
    }
    if (this.environmentMainService.isBuilt) {
      return join(this.environmentMainService.appRoot, "bin", "code");
    }
    return join(this.environmentMainService.appRoot, "scripts", "code-cli.sh");
  }
  async getOSStatistics() {
    return {
      totalmem: totalmem(),
      freemem: freemem(),
      loadavg: loadavg()
    };
  }
  async getOSProperties() {
    return {
      arch: arch(),
      platform: platform(),
      release: release(),
      type: type(),
      cpus: cpus()
    };
  }
  async getOSVirtualMachineHint() {
    return virtualMachineHint.value();
  }
  async getOSColorScheme() {
    return this.themeMainService.getColorScheme();
  }
  // WSL
  async hasWSLFeatureInstalled() {
    return isWindows && hasWSLFeatureInstalled();
  }
  //#endregion
  //#region Screenshots
  async getScreenshot(windowId, rect, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    const captured = await window?.win?.webContents.capturePage(rect);
    const buf = captured?.toJPEG(95);
    return buf && VSBuffer.wrap(buf);
  }
  //#endregion
  //#region GitHub mobile upload API
  async uploadFileViaMobileApi(_windowId, token, repoId, fileName, fileBytes, contentType) {
    const { net } = await import("electron");
    const policyResponse = await net.fetch("https://api.github.com/mobile/upload/policy", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        name: fileName,
        size: fileBytes.byteLength,
        content_type: contentType,
        repository_id: parseInt(repoId, 10)
      })
    });
    if (!policyResponse.ok) {
      const text = await policyResponse.text();
      throw new Error(`Policy request failed ${policyResponse.status}: ${text.substring(0, 300)}`);
    }
    const policy = await policyResponse.json();
    const asset = policy.asset;
    const formFields = policy.form;
    const boundary = `----VSCodeUpload${Date.now()}`;
    let multipartBody = "";
    for (const [key, value] of Object.entries(formFields)) {
      multipartBody += `--${boundary}\r
Content-Disposition: form-data; name="${key}"\r
\r
${value}\r
`;
    }
    const safeName = String(asset.name).replace(/[\r\n]+/g, " ").replace(/[\\"]/g, "_");
    multipartBody += `--${boundary}\r
Content-Disposition: form-data; name="file"; filename="${safeName}"\r
Content-Type: ${contentType}\r
\r
`;
    const epilogue = `\r
--${boundary}--\r
`;
    const preambleBytes = Buffer.from(multipartBody, "utf-8");
    const epilogueBytes = Buffer.from(epilogue, "utf-8");
    const bodyBuffer = Buffer.concat([preambleBytes, fileBytes.buffer, epilogueBytes]);
    const s3Response = await net.fetch(policy.upload_url, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: bodyBuffer
    });
    if (s3Response.status !== 204 && s3Response.status !== 201) {
      const text = await s3Response.text();
      throw new Error(`S3 upload failed ${s3Response.status}: ${text.substring(0, 300)}`);
    }
    const confirmResponse = await net.fetch(`https://api.github.com${policy.asset_upload_url}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      }
    });
    if (!confirmResponse.ok) {
      const text = await confirmResponse.text();
      throw new Error(`Asset upload confirmation failed ${confirmResponse.status}: ${text.substring(0, 300)}`);
    }
    return { fileName, assetUrl: asset.href, contentType };
  }
  //#endregion
  //#region Process
  async getProcessId(windowId) {
    const window = this.windowById(void 0, windowId);
    return window?.win?.webContents.getOSProcessId();
  }
  async killProcess(windowId, pid, code) {
    process.kill(pid, code);
  }
  async listOllamaModels(_windowId, baseUrl) {
    try {
      return await listOllamaModelsFromMachine(baseUrl);
    } catch (error) {
      this.logService.debug(`[NativeHost] ollama list failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
  //#endregion
  //#region Clipboard
  async readClipboardText(windowId, type2) {
    this.logService.trace(`readClipboardText in window ${windowId} with type:`, type2);
    const clipboardText = clipboard.readText(type2);
    this.logService.trace(`clipboardText.length :`, clipboardText.length);
    return clipboardText;
  }
  async triggerPaste(windowId, options) {
    this.logService.trace(`Triggering paste in window ${windowId} with options:`, options);
    const window = this.windowById(options?.targetWindowId, windowId);
    return window?.win?.webContents.paste() ?? Promise.resolve();
  }
  async readImage() {
    return clipboard.readImage().toPNG();
  }
  async writeClipboardText(windowId, text, type2) {
    return clipboard.writeText(text, type2);
  }
  async readClipboardFindText(windowId) {
    return clipboard.readFindText();
  }
  async writeClipboardFindText(windowId, text) {
    return clipboard.writeFindText(text);
  }
  async writeClipboardBuffer(windowId, format, buffer, type2) {
    return clipboard.writeBuffer(format, Buffer.from(buffer.buffer), type2);
  }
  async readClipboardBuffer(windowId, format) {
    return VSBuffer.wrap(clipboard.readBuffer(format));
  }
  async hasClipboard(windowId, format, type2) {
    return clipboard.has(format, type2);
  }
  //#endregion
  //#region macOS Touchbar
  async newWindowTab() {
    await this.windowsMainService.open({
      context: OpenContext.API,
      cli: this.environmentMainService.args,
      forceNewTabbedWindow: true,
      forceEmpty: true,
      remoteAuthority: this.environmentMainService.args.remote || void 0
    });
  }
  async showPreviousWindowTab() {
    Menu.sendActionToFirstResponder("selectPreviousTab:");
  }
  async showNextWindowTab() {
    Menu.sendActionToFirstResponder("selectNextTab:");
  }
  async moveWindowTabToNewWindow() {
    Menu.sendActionToFirstResponder("moveTabToNewWindow:");
  }
  async mergeAllWindowTabs() {
    Menu.sendActionToFirstResponder("mergeAllWindows:");
  }
  async toggleWindowTabsBar() {
    Menu.sendActionToFirstResponder("toggleTabBar:");
  }
  async updateTouchBar(windowId, items) {
    const window = this.codeWindowById(windowId);
    window?.updateTouchBar(items);
  }
  //#endregion
  //#region Lifecycle
  async notifyReady(windowId) {
    const window = this.codeWindowById(windowId);
    window?.setReady();
  }
  async relaunch(windowId, options) {
    return this.lifecycleMainService.relaunch(options);
  }
  async reload(windowId, options) {
    const window = this.codeWindowById(windowId);
    if (window) {
      if (isWorkspaceIdentifier(window.openedWorkspace)) {
        const configPath = window.openedWorkspace.configPath;
        if (configPath.scheme === Schemas.file) {
          const workspace = await this.workspacesManagementMainService.resolveLocalWorkspace(configPath);
          if (workspace?.transient) {
            return this.openWindow(window.id, { forceReuseWindow: true });
          }
        }
      }
      return this.lifecycleMainService.reload(window, options?.disableExtensions !== void 0 ? { _: [], "disable-extensions": options.disableExtensions } : void 0);
    }
  }
  async closeWindow(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    return window?.win?.close();
  }
  async quit(windowId) {
    const window = this.windowsMainService.getLastActiveWindow();
    if (window?.isExtensionDevelopmentHost && this.windowsMainService.getWindowCount() > 1 && window.win) {
      window.win.close();
    } else {
      this.lifecycleMainService.quit();
    }
  }
  async exit(windowId, code) {
    await this.lifecycleMainService.kill(code);
  }
  //#endregion
  //#region Connectivity
  async resolveProxy(windowId, url) {
    const window = this.codeWindowById(windowId);
    const session = window?.win?.webContents?.session;
    return session?.resolveProxy(url);
  }
  async resolveProxyWithPackage(_windowId, url) {
    const { resolveProxy } = await import("@vscode/os-proxy-resolver");
    return resolveProxy(url);
  }
  async readProxyConfigWithPackage(_windowId) {
    const { readProxyConfig } = await import("@vscode/os-proxy-resolver");
    return readProxyConfig();
  }
  async lookupAuthorization(_windowId, authInfo) {
    return this.proxyAuthService.lookupAuthorization(authInfo);
  }
  async lookupKerberosAuthorization(_windowId, url) {
    return this.requestService.lookupKerberosAuthorization(url);
  }
  async loadCertificates(_windowId) {
    return this.requestService.loadCertificates();
  }
  isPortFree(windowId, port) {
    return isPortFree(port, 1e3);
  }
  findFreePort(windowId, startPort, giveUpAfter, timeout, stride = 1) {
    return findFreePort(startPort, giveUpAfter, timeout, stride);
  }
  async openDevTools(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.webContents.openDevTools(options?.mode ? { mode: options.mode, activate: options.activate } : void 0);
  }
  async toggleDevTools(windowId, options) {
    const window = this.windowById(options?.targetWindowId, windowId);
    window?.win?.webContents.toggleDevTools();
  }
  async openDevToolsWindow(windowId, url) {
    const parentWindow = this.codeWindowById(windowId);
    if (!parentWindow) {
      return;
    }
    this.openChildWindow(parentWindow.win, url);
  }
  openChildWindow(parentWindow, url, overrideWindowOptions = {}) {
    const options = this.instantiationService.invokeFunction(defaultBrowserWindowOptions, defaultWindowState(), { forceNativeTitlebar: true });
    const windowOptions = {
      ...options,
      parent: parentWindow ?? void 0,
      ...overrideWindowOptions
    };
    const window = new BrowserWindow(windowOptions);
    window.setMenuBarVisibility(false);
    window.loadURL(url);
    window.once("ready-to-show", () => window.show());
    return window;
  }
  async openGPUInfoWindow(windowId) {
    const parentWindow = this.codeWindowById(windowId);
    if (!parentWindow) {
      return;
    }
    if (typeof this.gpuInfoWindowId !== "number") {
      const gpuInfoWindow = this.openChildWindow(parentWindow.win, "chrome://gpu");
      gpuInfoWindow.once("close", () => this.gpuInfoWindowId = void 0);
      this.gpuInfoWindowId = gpuInfoWindow.id;
    }
    if (typeof this.gpuInfoWindowId === "number") {
      const window = BrowserWindow.fromId(this.gpuInfoWindowId);
      if (window?.isMinimized()) {
        window?.restore();
      }
      window?.focus();
    }
  }
  async openContentTracingWindow() {
    if (typeof this.contentTracingWindowId !== "number") {
      const contentTracingWindow = this.openChildWindow(null, "chrome://tracing", {
        paintWhenInitiallyHidden: false,
        webPreferences: {
          backgroundThrottling: false
        }
      });
      contentTracingWindow.webContents.once("did-finish-load", async () => {
        await contentTracingWindow.webContents.executeJavaScript(`
					window.prompt = () => '';
					null
				`);
        contentTracingWindow.show();
      });
      contentTracingWindow.once("close", () => this.contentTracingWindowId = void 0);
      this.contentTracingWindowId = contentTracingWindow.id;
    }
    if (typeof this.contentTracingWindowId === "number") {
      const window = BrowserWindow.fromId(this.contentTracingWindowId);
      if (window?.isMinimized()) {
        window?.restore();
      }
      window?.focus();
    }
  }
  async startTracing(windowId, categories, options) {
    if (this._isTracing) {
      throw new Error(localize("tracing.alreadyInProgress", 'A tracing session is already in progress. Use command `"{0}"` to stop it first.', "workbench.action.stopTracing"));
    }
    if (options?.enableHeapProfiling) {
      await contentTracing.enableHeapProfiling();
      await contentTracing.startRecording({
        recording_mode: "record-until-full",
        included_categories: categories.split(","),
        memory_dump_config: {
          triggers: [
            { mode: "detailed", type: "periodic_interval", periodic_interval_ms: 1e4 }
          ]
        }
      });
    } else {
      const traceOptions = ["record-until-full", "enable-sampling"];
      await contentTracing.startRecording({
        categoryFilter: categories,
        traceOptions: traceOptions.join(",")
      });
    }
    this._isTracing = true;
  }
  async stopTracing(windowId) {
    if (!this._isTracing && !this.environmentMainService.args.trace) {
      return;
    }
    this._isTracing = false;
    const path = await contentTracing.stopRecording(`${randomPath(this.environmentMainService.userHome.fsPath, this.productService.applicationName)}.trace.txt`);
    await this.dialogMainService.showMessageBox({
      type: "info",
      message: localize("trace.message", "Successfully created the trace file"),
      detail: localize("trace.detail", "Please create an issue and manually attach the following file:\n{0}", path),
      buttons: [localize({ key: "trace.ok", comment: ["&& denotes a mnemonic"] }, "&&OK")]
    }, BrowserWindow.getFocusedWindow() ?? void 0);
    this.showItemInFolder(void 0, path);
  }
  //#endregion
  // #region Performance
  async profileRenderer(windowId, session, duration) {
    const window = this.codeWindowById(windowId);
    if (!window?.win) {
      throw new Error();
    }
    const profiler = new WindowProfiler(window.win, session, this.logService);
    const result = await profiler.inspect(duration);
    return result;
  }
  async showToast(windowId, options) {
    if (!Notification.isSupported()) {
      return { supported: false, clicked: false };
    }
    const toast = new Notification({
      title: options.title,
      body: options.body,
      silent: options.silent,
      actions: options.actions?.map((action) => ({
        type: "button",
        text: action
      }))
    });
    const disposables = new DisposableStore();
    this.activeToasts.set(options.id, disposables);
    const cts = new CancellationTokenSource();
    disposables.add(toDisposable(() => {
      this.activeToasts.deleteAndDispose(options.id);
      toast.removeAllListeners();
      toast.close();
      cts.dispose(true);
    }));
    return new Promise((r) => {
      const resolve2 = (result) => {
        r(result);
        disposables.dispose();
      };
      disposables.add(cts.token.onCancellationRequested(() => resolve2({ supported: true, clicked: false })));
      toast.on("click", () => resolve2({ supported: true, clicked: true }));
      toast.on("action", (_event, actionIndex) => resolve2({ supported: true, clicked: true, actionIndex }));
      toast.on("close", () => resolve2({ supported: true, clicked: false }));
      toast.on("failed", () => resolve2({ supported: false, clicked: false }));
      toast.show();
    });
  }
  async clearToast(windowId, toastId) {
    this.activeToasts.deleteAndDispose(toastId);
  }
  async clearToasts() {
    this.activeToasts.clearAndDisposeAll();
  }
  //#endregion
  //#region Registry (windows)
  async windowsGetStringRegKey(windowId, hive, path, name) {
    if (!isWindows) {
      return void 0;
    }
    const Registry = await import("@vscode/windows-registry");
    try {
      return Registry.GetStringRegKey(hive, path, name);
    } catch {
      return void 0;
    }
  }
  //#endregion
  //#region Zip
  async createZipFile(windowId, zipPath, files) {
    await zip(zipPath.fsPath, files.map((file) => {
      if (hasKey(file, { contents: true })) {
        return file;
      }
      const source = URI.revive(file.source);
      if (source.scheme !== Schemas.file) {
        throw new Error(`Cannot add non-local resource '${source.toString()}' to a zip file`);
      }
      return { path: file.path, localPath: source.fsPath, localPathSize: file.size };
    }));
  }
  //#endregion
  //#region Power
  async getSystemIdleState(windowId, idleThreshold) {
    return powerMonitor.getSystemIdleState(idleThreshold);
  }
  async getSystemIdleTime(windowId) {
    return powerMonitor.getSystemIdleTime();
  }
  async getCurrentThermalState(windowId) {
    return powerMonitor.getCurrentThermalState();
  }
  async isOnBatteryPower(windowId) {
    return powerMonitor.isOnBatteryPower();
  }
  async startPowerSaveBlocker(windowId, type2) {
    return powerSaveBlocker.start(type2);
  }
  async stopPowerSaveBlocker(windowId, id) {
    return powerSaveBlocker.stop(id);
  }
  async isPowerSaveBlockerStarted(windowId, id) {
    return powerSaveBlocker.isStarted(id);
  }
  //#endregion
  windowById(windowId, fallbackCodeWindowId) {
    return this.codeWindowById(windowId) ?? this.auxiliaryWindowById(windowId) ?? this.codeWindowById(fallbackCodeWindowId);
  }
  codeWindowById(windowId) {
    if (typeof windowId !== "number") {
      return void 0;
    }
    return this.windowsMainService.getWindowById(windowId);
  }
  auxiliaryWindowById(windowId) {
    if (typeof windowId !== "number") {
      return void 0;
    }
    const contents = webContents.fromId(windowId);
    if (!contents) {
      return void 0;
    }
    return this.auxiliaryWindowsMainService.getWindowByWebContents(contents);
  }
};
__decorateClass([
  memoize
], NativeHostMainService.prototype, "cliPath", 1);
NativeHostMainService = __decorateClass([
  __decorateParam(0, IWindowsMainService),
  __decorateParam(1, IAuxiliaryWindowsMainService),
  __decorateParam(2, IDialogMainService),
  __decorateParam(3, ILifecycleMainService),
  __decorateParam(4, IEnvironmentMainService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IThemeMainService),
  __decorateParam(8, IWorkspacesManagementMainService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IRequestService),
  __decorateParam(11, IProxyAuthService),
  __decorateParam(12, IInstantiationService),
  __decorateParam(13, IGlobalKeybindingsMainService)
], NativeHostMainService);
export {
  INativeHostMainService,
  NativeHostMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbmF0aXZlXFxlbGVjdHJvbi1tYWluXFxuYXRpdmVIb3N0TWFpblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgeyBleGVjIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBhcHAsIEJyb3dzZXJXaW5kb3csIGNsaXBib2FyZCwgY29udGVudFRyYWNpbmcsIERpc3BsYXksIE1lbnUsIE1lc3NhZ2VCb3hPcHRpb25zLCBNZXNzYWdlQm94UmV0dXJuVmFsdWUsIE5vdGlmaWNhdGlvbiwgT3BlbkRldlRvb2xzT3B0aW9ucywgT3BlbkRpYWxvZ09wdGlvbnMsIE9wZW5EaWFsb2dSZXR1cm5WYWx1ZSwgcG93ZXJNb25pdG9yLCBwb3dlclNhdmVCbG9ja2VyLCBTYXZlRGlhbG9nT3B0aW9ucywgU2F2ZURpYWxvZ1JldHVyblZhbHVlLCBzY3JlZW4sIHNoZWxsLCBzeXN0ZW1QcmVmZXJlbmNlcywgd2ViQ29udGVudHMgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyBhcmNoLCBjcHVzLCBmcmVlbWVtLCBsb2FkYXZnLCBwbGF0Zm9ybSwgcmVsZWFzZSwgdG90YWxtZW0sIHR5cGUgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbWF0Y2hlc1NvbWVTY2hlbWUsIFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4sIHBvc2l4LCByZXNvbHZlLCB3aW4zMiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEFkZEZpcnN0UGFyYW1ldGVyVG9GdW5jdGlvbnMsIGhhc0tleSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyB2aXJ0dWFsTWFjaGluZUhpbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvaWQuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMsIFN5bWxpbmtTdXBwb3J0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBmaW5kRnJlZVBvcnQsIGlzUG9ydEZyZWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcG9ydHMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVNlcmlhbGl6YWJsZUNvbW1hbmRBY3Rpb24gfSBmcm9tICcuLi8uLi9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlT3BlbkRpYWxvZ09wdGlvbnMgfSBmcm9tICcuLi8uLi9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElEaWFsb2dNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2RpYWxvZ3MvZWxlY3Ryb24tbWFpbi9kaWFsb2dNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2VsZWN0cm9uLW1haW4vZW52aXJvbm1lbnRNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZU1haW5TZXJ2aWNlLCBJUmVsYXVuY2hPcHRpb25zIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2VsZWN0cm9uLW1haW4vbGlmZWN5Y2xlTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBGb2N1c01vZGUsIElDb21tb25OYXRpdmVIb3N0U2VydmljZSwgSU5hdGl2ZUhvc3RPcHRpb25zLCBJTmF0aXZlU3lzdGVtV2lkZUtleWJpbmRpbmcsIElOYXRpdmVTeXN0ZW1XaWRlS2V5YmluZGluZ1Jlc3VsdCwgSU5hdGl2ZVppcEZpbGUsIElPcGVuQWdlbnRzV2luZG93T3B0aW9ucywgSU9TUHJvcGVydGllcywgSU9TUHJveHksIElPU1Byb3h5Q29uZmlnLCBJT1NTdGF0aXN0aWNzLCBJU3RhcnRUcmFjaW5nT3B0aW9ucywgSVRvYXN0T3B0aW9ucywgSVRvYXN0UmVzdWx0LCBQb3dlclNhdmVCbG9ja2VyVHlwZSwgU3lzdGVtSWRsZVN0YXRlLCBUaGVybWFsU3RhdGUgfSBmcm9tICcuLi9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IGxpc3RPbGxhbWFNb2RlbHNGcm9tTWFjaGluZSB9IGZyb20gJy4uL25vZGUvb2xsYW1hQ2xpLmpzJztcbmltcG9ydCB7IElHbG9iYWxLZXliaW5kaW5nc01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZ2xvYmFsS2V5YmluZGluZ3MvZWxlY3Ryb24tbWFpbi9nbG9iYWxLZXliaW5kaW5nc01haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYXJ0c1NwbGFzaCB9IGZyb20gJy4uLy4uL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRoZW1lTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi90aGVtZS9lbGVjdHJvbi1tYWluL3RoZW1lTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdFdpbmRvd1N0YXRlLCBJQ29kZVdpbmRvdyB9IGZyb20gJy4uLy4uL3dpbmRvdy9lbGVjdHJvbi1tYWluL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJQ29sb3JTY2hlbWUsIElPcGVuZWRBdXhpbGlhcnlXaW5kb3csIElPcGVuZWRNYWluV2luZG93LCBJT3BlbkVtcHR5V2luZG93T3B0aW9ucywgSU9wZW5XaW5kb3dPcHRpb25zLCBJUG9pbnQsIElSZWN0YW5nbGUsIElXaW5kb3dPcGVuYWJsZSB9IGZyb20gJy4uLy4uL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IGRlZmF1bHRCcm93c2VyV2luZG93T3B0aW9ucywgSVdpbmRvd3NNYWluU2VydmljZSwgT3BlbkNvbnRleHQgfSBmcm9tICcuLi8uLi93aW5kb3dzL2VsZWN0cm9uLW1haW4vd2luZG93cy5qcyc7XG5pbXBvcnQgeyBpc1dvcmtzcGFjZUlkZW50aWZpZXIsIHRvV29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlcy9lbGVjdHJvbi1tYWluL3dvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgaGFzV1NMRmVhdHVyZUluc3RhbGxlZCB9IGZyb20gJy4uLy4uL3JlbW90ZS9ub2RlL3dzbC5qcyc7XG5pbXBvcnQgeyBXaW5kb3dQcm9maWxlciB9IGZyb20gJy4uLy4uL3Byb2ZpbGluZy9lbGVjdHJvbi1tYWluL3dpbmRvd1Byb2ZpbGluZy5qcyc7XG5pbXBvcnQgeyBJVjhQcm9maWxlIH0gZnJvbSAnLi4vLi4vcHJvZmlsaW5nL2NvbW1vbi9wcm9maWxpbmcuanMnO1xuaW1wb3J0IHsgSUF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2F1eGlsaWFyeVdpbmRvdy9lbGVjdHJvbi1tYWluL2F1eGlsaWFyeVdpbmRvd3MuanMnO1xuaW1wb3J0IHsgSUF1eGlsaWFyeVdpbmRvdyB9IGZyb20gJy4uLy4uL2F1eGlsaWFyeVdpbmRvdy9lbGVjdHJvbi1tYWluL2F1eGlsaWFyeVdpbmRvdy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyB6aXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvemlwLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb3h5QXV0aFNlcnZpY2UgfSBmcm9tICcuL2F1dGguanMnO1xuaW1wb3J0IHsgQXV0aEluZm8sIENyZWRlbnRpYWxzLCBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IHJhbmRvbVBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5hdGl2ZUhvc3RNYWluU2VydmljZSBleHRlbmRzIEFkZEZpcnN0UGFyYW1ldGVyVG9GdW5jdGlvbnM8SUNvbW1vbk5hdGl2ZUhvc3RTZXJ2aWNlLCBQcm9taXNlPHVua25vd24+IC8qIG9ubHkgbWV0aG9kcywgbm90IGV2ZW50cyAqLywgbnVtYmVyIHwgdW5kZWZpbmVkIC8qIHdpbmRvdyBJRCAqLz4geyB9XG5cbmV4cG9ydCBjb25zdCBJTmF0aXZlSG9zdE1haW5TZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElOYXRpdmVIb3N0TWFpblNlcnZpY2U+KCduYXRpdmVIb3N0TWFpblNlcnZpY2UnKTtcblxuZXhwb3J0IGNsYXNzIE5hdGl2ZUhvc3RNYWluU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTmF0aXZlSG9zdE1haW5TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdpbmRvd3NNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdpbmRvd3NNYWluU2VydmljZTogSVdpbmRvd3NNYWluU2VydmljZSxcblx0XHRASUF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZTogSUF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSxcblx0XHRASURpYWxvZ01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nTWFpblNlcnZpY2U6IElEaWFsb2dNYWluU2VydmljZSxcblx0XHRASUxpZmVjeWNsZU1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlTWFpblNlcnZpY2U6IElMaWZlY3ljbGVNYWluU2VydmljZSxcblx0XHRASUVudmlyb25tZW50TWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudE1haW5TZXJ2aWNlOiBJRW52aXJvbm1lbnRNYWluU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVRoZW1lTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZU1haW5TZXJ2aWNlOiBJVGhlbWVNYWluU2VydmljZSxcblx0XHRASVdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlOiBJV29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASVByb3h5QXV0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm94eUF1dGhTZXJ2aWNlOiBJUHJveHlBdXRoU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUdsb2JhbEtleWJpbmRpbmdzTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBnbG9iYWxLZXliaW5kaW5nc01haW5TZXJ2aWNlOiBJR2xvYmFsS2V5YmluZGluZ3NNYWluU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0e1xuXHRcdFx0dGhpcy5vbkRpZE9wZW5NYWluV2luZG93ID0gRXZlbnQubWFwKHRoaXMud2luZG93c01haW5TZXJ2aWNlLm9uRGlkT3BlbldpbmRvdywgd2luZG93ID0+IHdpbmRvdy5pZCk7XG5cblx0XHRcdHRoaXMub25EaWRUcmlnZ2VyV2luZG93U3lzdGVtQ29udGV4dE1lbnUgPSBFdmVudC5hbnkoXG5cdFx0XHRcdEV2ZW50Lm1hcCh0aGlzLndpbmRvd3NNYWluU2VydmljZS5vbkRpZFRyaWdnZXJTeXN0ZW1Db250ZXh0TWVudSwgKHsgd2luZG93LCB4LCB5IH0pID0+ICh7IHdpbmRvd0lkOiB3aW5kb3cuaWQsIHgsIHkgfSkpLFxuXHRcdFx0XHRFdmVudC5tYXAodGhpcy5hdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2Uub25EaWRUcmlnZ2VyU3lzdGVtQ29udGV4dE1lbnUsICh7IHdpbmRvdywgeCwgeSB9KSA9PiAoeyB3aW5kb3dJZDogd2luZG93LmlkLCB4LCB5IH0pKVxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5vbkRpZE1heGltaXplV2luZG93ID0gRXZlbnQuYW55KFxuXHRcdFx0XHRFdmVudC5tYXAodGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub25EaWRNYXhpbWl6ZVdpbmRvdywgd2luZG93ID0+IHdpbmRvdy5pZCksXG5cdFx0XHRcdEV2ZW50Lm1hcCh0aGlzLmF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZS5vbkRpZE1heGltaXplV2luZG93LCB3aW5kb3cgPT4gd2luZG93LmlkKVxuXHRcdFx0KTtcblx0XHRcdHRoaXMub25EaWRVbm1heGltaXplV2luZG93ID0gRXZlbnQuYW55KFxuXHRcdFx0XHRFdmVudC5tYXAodGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub25EaWRVbm1heGltaXplV2luZG93LCB3aW5kb3cgPT4gd2luZG93LmlkKSxcblx0XHRcdFx0RXZlbnQubWFwKHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLm9uRGlkVW5tYXhpbWl6ZVdpbmRvdywgd2luZG93ID0+IHdpbmRvdy5pZClcblx0XHRcdCk7XG5cblx0XHRcdHRoaXMub25EaWRDaGFuZ2VXaW5kb3dGdWxsU2NyZWVuID0gRXZlbnQuYW55KFxuXHRcdFx0XHRFdmVudC5tYXAodGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub25EaWRDaGFuZ2VGdWxsU2NyZWVuLCBlID0+ICh7IHdpbmRvd0lkOiBlLndpbmRvdy5pZCwgZnVsbHNjcmVlbjogZS5mdWxsc2NyZWVuIH0pKSxcblx0XHRcdFx0RXZlbnQubWFwKHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLm9uRGlkQ2hhbmdlRnVsbFNjcmVlbiwgZSA9PiAoeyB3aW5kb3dJZDogZS53aW5kb3cuaWQsIGZ1bGxzY3JlZW46IGUuZnVsbHNjcmVlbiB9KSlcblx0XHRcdCk7XG5cblx0XHRcdHRoaXMub25EaWRDaGFuZ2VXaW5kb3dBbHdheXNPblRvcCA9IEV2ZW50LmFueShcblx0XHRcdFx0RXZlbnQuTm9uZSwgLy8gYWx3YXlzIG9uIHRvcCBpcyB1bnN1cHBvcnRlZCBpbiBtYWluIHdpbmRvd3MgY3VycmVudGx5XG5cdFx0XHRcdEV2ZW50Lm1hcCh0aGlzLmF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZS5vbkRpZENoYW5nZUFsd2F5c09uVG9wLCBlID0+ICh7IHdpbmRvd0lkOiBlLndpbmRvdy5pZCwgYWx3YXlzT25Ub3A6IGUuYWx3YXlzT25Ub3AgfSkpXG5cdFx0XHQpO1xuXG5cdFx0XHR0aGlzLm9uRGlkQmx1ck1haW5XaW5kb3cgPSBFdmVudC5maWx0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIoYXBwLCAnYnJvd3Nlci13aW5kb3ctYmx1cicsIChldmVudCwgd2luZG93OiBCcm93c2VyV2luZG93KSA9PiB3aW5kb3cuaWQpLCB3aW5kb3dJZCA9PiAhIXRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0J5SWQod2luZG93SWQpKTtcblx0XHRcdHRoaXMub25EaWRGb2N1c01haW5XaW5kb3cgPSBFdmVudC5hbnkoXG5cdFx0XHRcdEV2ZW50Lm1hcChFdmVudC5maWx0ZXIoRXZlbnQubWFwKHRoaXMud2luZG93c01haW5TZXJ2aWNlLm9uRGlkQ2hhbmdlV2luZG93c0NvdW50LCAoKSA9PiB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRMYXN0QWN0aXZlV2luZG93KCkpLCB3aW5kb3cgPT4gISF3aW5kb3cpLCB3aW5kb3cgPT4gd2luZG93IS5pZCksXG5cdFx0XHRcdEV2ZW50LmZpbHRlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihhcHAsICdicm93c2VyLXdpbmRvdy1mb2N1cycsIChldmVudCwgd2luZG93OiBCcm93c2VyV2luZG93KSA9PiB3aW5kb3cuaWQpLCB3aW5kb3dJZCA9PiAhIXRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0J5SWQod2luZG93SWQpKVxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5vbkRpZEJsdXJNYWluT3JBdXhpbGlhcnlXaW5kb3cgPSBFdmVudC5hbnkoXG5cdFx0XHRcdHRoaXMub25EaWRCbHVyTWFpbldpbmRvdyxcblx0XHRcdFx0RXZlbnQubWFwKEV2ZW50LmZpbHRlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihhcHAsICdicm93c2VyLXdpbmRvdy1ibHVyJywgKGV2ZW50LCB3aW5kb3c6IEJyb3dzZXJXaW5kb3cpID0+IHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0J5V2ViQ29udGVudHMod2luZG93LndlYkNvbnRlbnRzKSksIHdpbmRvdyA9PiAhIXdpbmRvdyksIHdpbmRvdyA9PiB3aW5kb3chLmlkKVxuXHRcdFx0KTtcblx0XHRcdHRoaXMub25EaWRGb2N1c01haW5PckF1eGlsaWFyeVdpbmRvdyA9IEV2ZW50LmFueShcblx0XHRcdFx0dGhpcy5vbkRpZEZvY3VzTWFpbldpbmRvdyxcblx0XHRcdFx0RXZlbnQubWFwKEV2ZW50LmZpbHRlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihhcHAsICdicm93c2VyLXdpbmRvdy1mb2N1cycsIChldmVudCwgd2luZG93OiBCcm93c2VyV2luZG93KSA9PiB0aGlzLmF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dCeVdlYkNvbnRlbnRzKHdpbmRvdy53ZWJDb250ZW50cykpLCB3aW5kb3cgPT4gISF3aW5kb3cpLCB3aW5kb3cgPT4gd2luZG93IS5pZClcblx0XHRcdCk7XG5cblx0XHRcdHRoaXMub25EaWRTdXNwZW5kT1MgPSBFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihwb3dlck1vbml0b3IsICdzdXNwZW5kJyk7XG5cdFx0XHR0aGlzLm9uRGlkUmVzdW1lT1MgPSBFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihwb3dlck1vbml0b3IsICdyZXN1bWUnKTtcblxuXHRcdFx0Ly8gQmF0dGVyeSBwb3dlciBldmVudHMgKG1hY09TIGFuZCBXaW5kb3dzIG9ubHkpXG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlT25CYXR0ZXJ5UG93ZXIgPSBFdmVudC5hbnkoXG5cdFx0XHRcdEV2ZW50Lm1hcChFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihwb3dlck1vbml0b3IsICdvbi1hYycpLCAoKSA9PiBmYWxzZSksXG5cdFx0XHRcdEV2ZW50Lm1hcChFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihwb3dlck1vbml0b3IsICdvbi1iYXR0ZXJ5JyksICgpID0+IHRydWUpXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBUaGVybWFsIHN0YXRlIGV2ZW50cyAobWFjT1Mgb25seSlcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VUaGVybWFsU3RhdGUgPSBFdmVudC5tYXAoXG5cdFx0XHRcdEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPHsgc3RhdGU6IFRoZXJtYWxTdGF0ZSB9Pihwb3dlck1vbml0b3IsICd0aGVybWFsLXN0YXRlLWNoYW5nZScpLFxuXHRcdFx0XHRlID0+IGUuc3RhdGVcblx0XHRcdCk7XG5cblx0XHRcdC8vIFNwZWVkIGxpbWl0IGV2ZW50cyAobWFjT1MgYW5kIFdpbmRvd3Mgb25seSlcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VTcGVlZExpbWl0ID0gRXZlbnQubWFwKFxuXHRcdFx0XHRFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcjx7IGxpbWl0OiBudW1iZXIgfT4ocG93ZXJNb25pdG9yLCAnc3BlZWQtbGltaXQtY2hhbmdlJyksXG5cdFx0XHRcdGUgPT4gZS5saW1pdFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gU2h1dGRvd24gZXZlbnQgKExpbnV4IGFuZCBtYWNPUyBvbmx5KVxuXHRcdFx0dGhpcy5vbldpbGxTaHV0ZG93bk9TID0gRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIocG93ZXJNb25pdG9yLCAnc2h1dGRvd24nKTtcblxuXHRcdFx0Ly8gU2NyZWVuIGxvY2sgZXZlbnRzIChtYWNPUyBhbmQgV2luZG93cyBvbmx5KVxuXHRcdFx0dGhpcy5vbkRpZExvY2tTY3JlZW4gPSBFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihwb3dlck1vbml0b3IsICdsb2NrLXNjcmVlbicpO1xuXHRcdFx0dGhpcy5vbkRpZFVubG9ja1NjcmVlbiA9IEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHBvd2VyTW9uaXRvciwgJ3VubG9jay1zY3JlZW4nKTtcblxuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUNvbG9yU2NoZW1lID0gdGhpcy50aGVtZU1haW5TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29sb3JTY2hlbWU7XG5cblx0XHRcdHRoaXMub25EaWRDaGFuZ2VEaXNwbGF5ID0gRXZlbnQuZGVib3VuY2UoRXZlbnQuYW55KFxuXHRcdFx0XHRFdmVudC5maWx0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIoc2NyZWVuLCAnZGlzcGxheS1tZXRyaWNzLWNoYW5nZWQnLCAoZXZlbnQ6IEVsZWN0cm9uLkV2ZW50LCBkaXNwbGF5OiBEaXNwbGF5LCBjaGFuZ2VkTWV0cmljcz86IHN0cmluZ1tdKSA9PiBjaGFuZ2VkTWV0cmljcyksIGNoYW5nZWRNZXRyaWNzID0+IHtcblx0XHRcdFx0XHQvLyBFbGVjdHJvbiB3aWxsIGVtaXQgJ2Rpc3BsYXktbWV0cmljcy1jaGFuZ2VkJyBldmVudHMgZXZlbiB3aGVuIGFjdHVhbGx5XG5cdFx0XHRcdFx0Ly8gZ29pbmcgZnVsbHNjcmVlbiwgYmVjYXVzZSB0aGUgZG9jayBoaWRlcy4gSG93ZXZlciwgd2UgZG8gbm90IHdhbnQgdG9cblx0XHRcdFx0XHQvLyByZWFjdCBvbiB0aGlzIGV2ZW50IGFzIHRoZXJlIGlzIG5vIGNoYW5nZSBpbiBkaXNwbGF5IGJvdW5kcy5cblx0XHRcdFx0XHRyZXR1cm4gIShBcnJheS5pc0FycmF5KGNoYW5nZWRNZXRyaWNzKSAmJiBjaGFuZ2VkTWV0cmljcy5sZW5ndGggPT09IDEgJiYgY2hhbmdlZE1ldHJpY3NbMF0gPT09ICd3b3JrQXJlYScpO1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0RXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIoc2NyZWVuLCAnZGlzcGxheS1hZGRlZCcpLFxuXHRcdFx0XHRFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihzY3JlZW4sICdkaXNwbGF5LXJlbW92ZWQnKVxuXHRcdFx0KSwgKCkgPT4geyB9LCAxMDApO1xuXHRcdH1cblx0fVxuXG5cblx0Ly8jcmVnaW9uIFByb3BlcnRpZXNcblxuXHRnZXQgd2luZG93SWQoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCBpbiBlbGVjdHJvbi1tYWluJyk7IH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBFdmVudHNcblxuXHRyZWFkb25seSBvbkRpZE9wZW5NYWluV2luZG93OiBFdmVudDxudW1iZXI+O1xuXG5cdHJlYWRvbmx5IG9uRGlkVHJpZ2dlcldpbmRvd1N5c3RlbUNvbnRleHRNZW51OiBFdmVudDx7IHdpbmRvd0lkOiBudW1iZXI7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0+O1xuXG5cdHJlYWRvbmx5IG9uRGlkTWF4aW1pemVXaW5kb3c6IEV2ZW50PG51bWJlcj47XG5cdHJlYWRvbmx5IG9uRGlkVW5tYXhpbWl6ZVdpbmRvdzogRXZlbnQ8bnVtYmVyPjtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVdpbmRvd0Z1bGxTY3JlZW46IEV2ZW50PHsgcmVhZG9ubHkgd2luZG93SWQ6IG51bWJlcjsgcmVhZG9ubHkgZnVsbHNjcmVlbjogYm9vbGVhbiB9PjtcblxuXHRyZWFkb25seSBvbkRpZEJsdXJNYWluV2luZG93OiBFdmVudDxudW1iZXI+O1xuXHRyZWFkb25seSBvbkRpZEZvY3VzTWFpbldpbmRvdzogRXZlbnQ8bnVtYmVyPjtcblxuXHRyZWFkb25seSBvbkRpZEJsdXJNYWluT3JBdXhpbGlhcnlXaW5kb3c6IEV2ZW50PG51bWJlcj47XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXNNYWluT3JBdXhpbGlhcnlXaW5kb3c6IEV2ZW50PG51bWJlcj47XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VXaW5kb3dBbHdheXNPblRvcDogRXZlbnQ8eyByZWFkb25seSB3aW5kb3dJZDogbnVtYmVyOyByZWFkb25seSBhbHdheXNPblRvcDogYm9vbGVhbiB9PjtcblxuXHRyZWFkb25seSBvbkRpZFN1c3BlbmRPUzogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uRGlkUmVzdW1lT1M6IEV2ZW50PHZvaWQ+O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlT25CYXR0ZXJ5UG93ZXI6IEV2ZW50PGJvb2xlYW4+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRoZXJtYWxTdGF0ZTogRXZlbnQ8VGhlcm1hbFN0YXRlPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTcGVlZExpbWl0OiBFdmVudDxudW1iZXI+O1xuXHRyZWFkb25seSBvbldpbGxTaHV0ZG93bk9TOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRMb2NrU2NyZWVuOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRVbmxvY2tTY3JlZW46IEV2ZW50PHZvaWQ+O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29sb3JTY2hlbWU6IEV2ZW50PElDb2xvclNjaGVtZT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQYXNzd29yZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgYWNjb3VudDogc3RyaW5nOyBzZXJ2aWNlOiBzdHJpbmcgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGFzc3dvcmQgPSB0aGlzLl9vbkRpZENoYW5nZVBhc3N3b3JkLmV2ZW50O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGlzcGxheTogRXZlbnQ8dm9pZD47XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gV2luZG93XG5cblx0Z2V0V2luZG93cyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zOiB7IGluY2x1ZGVBdXhpbGlhcnlXaW5kb3dzOiB0cnVlIH0pOiBQcm9taXNlPEFycmF5PElPcGVuZWRNYWluV2luZG93IHwgSU9wZW5lZEF1eGlsaWFyeVdpbmRvdz4+O1xuXHRnZXRXaW5kb3dzKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM6IHsgaW5jbHVkZUF1eGlsaWFyeVdpbmRvd3M6IGZhbHNlIH0pOiBQcm9taXNlPEFycmF5PElPcGVuZWRNYWluV2luZG93Pj47XG5cdGFzeW5jIGdldFdpbmRvd3Mod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9uczogeyBpbmNsdWRlQXV4aWxpYXJ5V2luZG93czogYm9vbGVhbiB9KTogUHJvbWlzZTxBcnJheTxJT3BlbmVkTWFpbldpbmRvdyB8IElPcGVuZWRBdXhpbGlhcnlXaW5kb3c+PiB7XG5cdFx0Y29uc3QgbWFpbldpbmRvd3MgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dzKCkubWFwKHdpbmRvdyA9PiAoe1xuXHRcdFx0aWQ6IHdpbmRvdy5pZCxcblx0XHRcdHdvcmtzcGFjZTogd2luZG93Lm9wZW5lZFdvcmtzcGFjZSA/PyB0b1dvcmtzcGFjZUlkZW50aWZpZXIod2luZG93LmJhY2t1cFBhdGgsIHdpbmRvdy5pc0V4dGVuc2lvbkRldmVsb3BtZW50SG9zdCksXG5cdFx0XHR0aXRsZTogd2luZG93Lndpbj8uZ2V0VGl0bGUoKSA/PyAnJyxcblx0XHRcdGZpbGVuYW1lOiB3aW5kb3cuZ2V0UmVwcmVzZW50ZWRGaWxlbmFtZSgpLFxuXHRcdFx0ZGlydHk6IHdpbmRvdy5pc0RvY3VtZW50RWRpdGVkKClcblx0XHR9KSk7XG5cblx0XHRjb25zdCBhdXhpbGlhcnlXaW5kb3dzID0gW107XG5cdFx0aWYgKG9wdGlvbnMuaW5jbHVkZUF1eGlsaWFyeVdpbmRvd3MpIHtcblx0XHRcdGF1eGlsaWFyeVdpbmRvd3MucHVzaCguLi50aGlzLmF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dzKCkubWFwKHdpbmRvdyA9PiAoe1xuXHRcdFx0XHRpZDogd2luZG93LmlkLFxuXHRcdFx0XHRwYXJlbnRJZDogd2luZG93LnBhcmVudElkLFxuXHRcdFx0XHR0aXRsZTogd2luZG93Lndpbj8uZ2V0VGl0bGUoKSA/PyAnJyxcblx0XHRcdFx0ZmlsZW5hbWU6IHdpbmRvdy5nZXRSZXByZXNlbnRlZEZpbGVuYW1lKClcblx0XHRcdH0pKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi5tYWluV2luZG93cywgLi4uYXV4aWxpYXJ5V2luZG93c107XG5cdH1cblxuXHRhc3luYyBnZXRXaW5kb3dDb3VudCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRyZXR1cm4gdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKTtcblx0fVxuXG5cdGFzeW5jIGdldEFjdGl2ZVdpbmRvd0lkKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFjdGl2ZVdpbmRvdyA9IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldEZvY3VzZWRXaW5kb3coKSB8fCB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRMYXN0QWN0aXZlV2luZG93KCk7XG5cdFx0aWYgKGFjdGl2ZVdpbmRvdykge1xuXHRcdFx0cmV0dXJuIGFjdGl2ZVdpbmRvdy5pZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0QWN0aXZlV2luZG93UG9zaXRpb24oKTogUHJvbWlzZTxJUmVjdGFuZ2xlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWN0aXZlV2luZG93ID0gdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0Rm9jdXNlZFdpbmRvdygpIHx8IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldExhc3RBY3RpdmVXaW5kb3coKTtcblx0XHRpZiAoYWN0aXZlV2luZG93KSB7XG5cdFx0XHRyZXR1cm4gYWN0aXZlV2luZG93LmdldEJvdW5kcygpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0V2luZG93UG9zaXRpb24od2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8SVJlY3RhbmdsZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKT8ud2luPy5nZXRCb3VuZHMoKTtcblx0fVxuXG5cdGFzeW5jIGdldE5hdGl2ZVdpbmRvd0hhbmRsZShmYWxsYmFja1dpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHdpbmRvd0lkOiBudW1iZXIpOiBQcm9taXNlPFZTQnVmZmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKHdpbmRvd0lkLCBmYWxsYmFja1dpbmRvd0lkKTtcblx0XHRpZiAod2luZG93Py53aW4pIHtcblx0XHRcdHJldHVybiBWU0J1ZmZlci53cmFwKHdpbmRvdy53aW4uZ2V0TmF0aXZlV2luZG93SGFuZGxlKCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3BlbldpbmRvdyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSU9wZW5FbXB0eVdpbmRvd09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRvcGVuV2luZG93KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHRvT3BlbjogSVdpbmRvd09wZW5hYmxlW10sIG9wdGlvbnM/OiBJT3BlbldpbmRvd09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRvcGVuV2luZG93KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGFyZzE/OiBJT3BlbkVtcHR5V2luZG93T3B0aW9ucyB8IElXaW5kb3dPcGVuYWJsZVtdLCBhcmcyPzogSU9wZW5XaW5kb3dPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoYXJnMSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvT3BlbldpbmRvdyh3aW5kb3dJZCwgYXJnMSwgYXJnMik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZG9PcGVuRW1wdHlXaW5kb3cod2luZG93SWQsIGFyZzEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb09wZW5XaW5kb3cod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgdG9PcGVuOiBJV2luZG93T3BlbmFibGVbXSwgb3B0aW9uczogSU9wZW5XaW5kb3dPcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0b09wZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgd2luZG93cyA9IGF3YWl0IHRoaXMud2luZG93c01haW5TZXJ2aWNlLm9wZW4oe1xuXHRcdFx0XHRjb250ZXh0OiBPcGVuQ29udGV4dC5BUEksXG5cdFx0XHRcdGNvbnRleHRXaW5kb3dJZDogd2luZG93SWQsXG5cdFx0XHRcdHVyaXNUb09wZW46IHRvT3Blbixcblx0XHRcdFx0Y2xpOiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncyxcblx0XHRcdFx0Zm9yY2VOZXdXaW5kb3c6IG9wdGlvbnMuZm9yY2VOZXdXaW5kb3csXG5cdFx0XHRcdGZvcmNlUmV1c2VXaW5kb3c6IG9wdGlvbnMuZm9yY2VSZXVzZVdpbmRvdyxcblx0XHRcdFx0cHJlZmVyTmV3V2luZG93OiBvcHRpb25zLnByZWZlck5ld1dpbmRvdyxcblx0XHRcdFx0ZGlmZk1vZGU6IG9wdGlvbnMuZGlmZk1vZGUsXG5cdFx0XHRcdG1lcmdlTW9kZTogb3B0aW9ucy5tZXJnZU1vZGUsXG5cdFx0XHRcdGFkZE1vZGU6IG9wdGlvbnMuYWRkTW9kZSxcblx0XHRcdFx0cmVtb3ZlTW9kZTogb3B0aW9ucy5yZW1vdmVNb2RlLFxuXHRcdFx0XHRnb3RvTGluZU1vZGU6IG9wdGlvbnMuZ290b0xpbmVNb2RlLFxuXHRcdFx0XHRub1JlY2VudEVudHJ5OiBvcHRpb25zLm5vUmVjZW50RW50cnksXG5cdFx0XHRcdHdhaXRNYXJrZXJGaWxlVVJJOiBvcHRpb25zLndhaXRNYXJrZXJGaWxlVVJJLFxuXHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IG9wdGlvbnMucmVtb3RlQXV0aG9yaXR5IHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0Zm9yY2VQcm9maWxlOiBvcHRpb25zLmZvcmNlUHJvZmlsZSxcblx0XHRcdFx0Zm9yY2VUZW1wUHJvZmlsZTogb3B0aW9ucy5mb3JjZVRlbXBQcm9maWxlLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEhhbmQgb2ZmIGEgY2hhdCBzZXNzaW9uIHRvIHRoZSBvcGVuZWQgd2luZG93IHNvIGl0IHJlc3RvcmVzIGJvdGggdGhlXG5cdFx0XHQvLyBmb2xkZXIgYW5kIHRoZSBzZXNzaW9uIChlLmcuIHRoZSBBZ2VudHMgd2luZG93IFwiT3BlbiBpbiBWUyBDb2RlXCIgZmxvdykuXG5cdFx0XHQvLyBPbmx5IG1lYW5pbmdmdWwgd2hlbiBleGFjdGx5IG9uZSB3aW5kb3cgaXMgb3BlbmVkIHNvIHRoZSBzZXNzaW9uIGlzXG5cdFx0XHQvLyBub3Qgc2VudCB0byBhbiBhbWJpZ3VvdXMgdGFyZ2V0LlxuXHRcdFx0Y29uc3QgY2hhdFNlc3Npb25Ub09wZW4gPSBvcHRpb25zLmNoYXRTZXNzaW9uVG9PcGVuO1xuXHRcdFx0aWYgKGNoYXRTZXNzaW9uVG9PcGVuICYmIHdpbmRvd3MubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHdpbmRvd3NbMF0uc2VuZFdoZW5SZWFkeSgndnNjb2RlOm9wZW5DaGF0U2Vzc2lvbicsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIFVSSS5yZXZpdmUoY2hhdFNlc3Npb25Ub09wZW4pLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuRW1wdHlXaW5kb3cod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElPcGVuRW1wdHlXaW5kb3dPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub3BlbkVtcHR5V2luZG93KHtcblx0XHRcdGNvbnRleHQ6IE9wZW5Db250ZXh0LkFQSSxcblx0XHRcdGNvbnRleHRXaW5kb3dJZDogd2luZG93SWRcblx0XHR9LCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIG9wZW5BZ2VudHNXaW5kb3cod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElPcGVuQWdlbnRzV2luZG93T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvd3MgPSBhd2FpdCB0aGlzLndpbmRvd3NNYWluU2VydmljZS5vcGVuQWdlbnRzV2luZG93KHtcblx0XHRcdGNvbnRleHQ6IE9wZW5Db250ZXh0LkFQSSxcblx0XHRcdGNvbnRleHRXaW5kb3dJZDogd2luZG93SWQsXG5cdFx0XHRjbGk6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzLFxuXHRcdH0sIG9wdGlvbnM/LmZvbGRlclVyaSA/IFVSSS5yZXZpdmUob3B0aW9ucy5mb2xkZXJVcmkpIDogdW5kZWZpbmVkLCBvcHRpb25zPy5zZXNzaW9uUmVzb3VyY2UgPyBVUkkucmV2aXZlKG9wdGlvbnMuc2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZCwgb3B0aW9ucz8uc291cmNlKTtcblx0XHRpZiAod2luZG93cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR3aW5kb3dzWzBdLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3luY1N5c3RlbVdpZGVLZXliaW5kaW5ncyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBrZXliaW5kaW5nczogSU5hdGl2ZVN5c3RlbVdpZGVLZXliaW5kaW5nW10pOiBQcm9taXNlPElOYXRpdmVTeXN0ZW1XaWRlS2V5YmluZGluZ1Jlc3VsdD4ge1xuXHRcdGlmICh0eXBlb2Ygd2luZG93SWQgIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4geyBmYWlsZWQ6IFtdIH07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdsb2JhbEtleWJpbmRpbmdzTWFpblNlcnZpY2UudXBkYXRlS2V5YmluZGluZ3Mod2luZG93SWQsIGtleWJpbmRpbmdzKTtcblx0fVxuXG5cdGFzeW5jIGlzRnVsbFNjcmVlbih3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0cmV0dXJuIHdpbmRvdz8uaXNGdWxsU2NyZWVuID8/IGZhbHNlO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlRnVsbFNjcmVlbih3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0d2luZG93Py50b2dnbGVGdWxsU2NyZWVuKCk7XG5cdH1cblxuXHRhc3luYyBnZXRDdXJzb3JTY3JlZW5Qb2ludCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx7IHJlYWRvbmx5IHBvaW50OiBJUG9pbnQ7IHJlYWRvbmx5IGRpc3BsYXk6IElSZWN0YW5nbGUgfT4ge1xuXHRcdGNvbnN0IHBvaW50ID0gc2NyZWVuLmdldEN1cnNvclNjcmVlblBvaW50KCk7XG5cdFx0Y29uc3QgZGlzcGxheSA9IHNjcmVlbi5nZXREaXNwbGF5TmVhcmVzdFBvaW50KHBvaW50KTtcblxuXHRcdHJldHVybiB7IHBvaW50LCBkaXNwbGF5OiBkaXNwbGF5LmJvdW5kcyB9O1xuXHR9XG5cblx0YXN5bmMgaXNNYXhpbWl6ZWQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHJldHVybiB3aW5kb3c/Lndpbj8uaXNNYXhpbWl6ZWQoKSA/PyBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIG1heGltaXplV2luZG93KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHR3aW5kb3c/Lndpbj8ubWF4aW1pemUoKTtcblx0fVxuXG5cdGFzeW5jIHVubWF4aW1pemVXaW5kb3cod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHdpbmRvdz8ud2luPy51bm1heGltaXplKCk7XG5cdH1cblxuXHRhc3luYyBtaW5pbWl6ZVdpbmRvdyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0d2luZG93Py53aW4/Lm1pbmltaXplKCk7XG5cdH1cblxuXHRhc3luYyBtb3ZlV2luZG93VG9wKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHR3aW5kb3c/Lndpbj8ubW92ZVRvcCgpO1xuXHR9XG5cblx0YXN5bmMgaXNXaW5kb3dBbHdheXNPblRvcCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0cmV0dXJuIHdpbmRvdz8ud2luPy5pc0Fsd2F5c09uVG9wKCkgPz8gZmFsc2U7XG5cdH1cblxuXHRhc3luYyB0b2dnbGVXaW5kb3dBbHdheXNPblRvcCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0d2luZG93Py53aW4/LnNldEFsd2F5c09uVG9wKCF3aW5kb3cud2luLmlzQWx3YXlzT25Ub3AoKSk7XG5cdH1cblxuXHRhc3luYyBzZXRXaW5kb3dBbHdheXNPblRvcCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBhbHdheXNPblRvcDogYm9vbGVhbiwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHdpbmRvdz8ud2luPy5zZXRBbHdheXNPblRvcChhbHdheXNPblRvcCk7XG5cdH1cblxuXHRhc3luYyBwb3NpdGlvbldpbmRvdyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBwb3NpdGlvbjogSVJlY3RhbmdsZSwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdGlmICh3aW5kb3c/Lndpbikge1xuXHRcdFx0aWYgKHdpbmRvdy53aW4uaXNGdWxsU2NyZWVuKCkpIHtcblx0XHRcdFx0Y29uc3QgZnVsbHNjcmVlbkxlZnRGdXR1cmUgPSBFdmVudC50b1Byb21pc2UoRXZlbnQub25jZShFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcih3aW5kb3cud2luLCAnbGVhdmUtZnVsbC1zY3JlZW4nKSkpO1xuXHRcdFx0XHR3aW5kb3cud2luLnNldEZ1bGxTY3JlZW4oZmFsc2UpO1xuXHRcdFx0XHRhd2FpdCBmdWxsc2NyZWVuTGVmdEZ1dHVyZTtcblx0XHRcdH1cblxuXHRcdFx0d2luZG93Lndpbi5zZXRCb3VuZHMocG9zaXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVdpbmRvd0NvbnRyb2xzKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM6IElOYXRpdmVIb3N0T3B0aW9ucyAmIHsgaGVpZ2h0PzogbnVtYmVyOyBiYWNrZ3JvdW5kQ29sb3I/OiBzdHJpbmc7IGZvcmVncm91bmRDb2xvcj86IHN0cmluZzsgZGltbWVkPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0d2luZG93Py51cGRhdGVXaW5kb3dDb250cm9scyhvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVdpbmRvd0FjY2VudENvbG9yKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGNvbG9yOiAnZGVmYXVsdCcgfCAnb2ZmJyB8IHN0cmluZywgaW5hY3RpdmVDb2xvcjogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdHJldHVybjsgLy8gd2luZG93cyBvbmx5XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKHdpbmRvd0lkKTtcblx0XHRpZiAoIXdpbmRvdykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBhY3RpdmVXaW5kb3dBY2NlbnRDb2xvcjogc3RyaW5nIHwgYm9vbGVhbiB8IG51bGw7XG5cdFx0bGV0IGluYWN0aXZlV2luZG93QWNjZW50Q29sb3I6IHN0cmluZyB8IGJvb2xlYW4gfCBudWxsO1xuXG5cdFx0aWYgKGNvbG9yID09PSAnZGVmYXVsdCcpIHtcblx0XHRcdGFjdGl2ZVdpbmRvd0FjY2VudENvbG9yID0gbnVsbDtcblx0XHRcdGluYWN0aXZlV2luZG93QWNjZW50Q29sb3IgPSBudWxsO1xuXHRcdH0gZWxzZSBpZiAoY29sb3IgPT09ICdvZmYnKSB7XG5cdFx0XHRhY3RpdmVXaW5kb3dBY2NlbnRDb2xvciA9IGZhbHNlO1xuXHRcdFx0aW5hY3RpdmVXaW5kb3dBY2NlbnRDb2xvciA9IGZhbHNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhY3RpdmVXaW5kb3dBY2NlbnRDb2xvciA9IGNvbG9yO1xuXHRcdFx0aW5hY3RpdmVXaW5kb3dBY2NlbnRDb2xvciA9IGluYWN0aXZlQ29sb3IgPz8gY29sb3I7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2luZG93cyA9IFt3aW5kb3ddO1xuXHRcdGZvciAoY29uc3QgYXV4aWxpYXJ5V2luZG93IG9mIHRoaXMuYXV4aWxpYXJ5V2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd3MoKSkge1xuXHRcdFx0aWYgKGF1eGlsaWFyeVdpbmRvdy5wYXJlbnRJZCA9PT0gd2luZG93SWQpIHtcblx0XHRcdFx0d2luZG93cy5wdXNoKGF1eGlsaWFyeVdpbmRvdyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB3aW5kb3cgb2Ygd2luZG93cykge1xuXHRcdFx0d2luZG93Lndpbj8uc2V0QWNjZW50Q29sb3Iod2luZG93Lndpbi5pc0ZvY3VzZWQoKSA/IGFjdGl2ZVdpbmRvd0FjY2VudENvbG9yIDogaW5hY3RpdmVXaW5kb3dBY2NlbnRDb2xvcik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZm9jdXNXaW5kb3cod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyAmIHsgbW9kZT86IEZvY3VzTW9kZSB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0d2luZG93Py5mb2N1cyh7IG1vZGU6IG9wdGlvbnM/Lm1vZGUgPz8gRm9jdXNNb2RlLlRyYW5zZmVyIH0pO1xuXHR9XG5cblx0YXN5bmMgc2V0TWluaW11bVNpemUod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgd2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZCwgaGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLmNvZGVXaW5kb3dCeUlkKHdpbmRvd0lkKTtcblx0XHRpZiAod2luZG93Py53aW4pIHtcblx0XHRcdGNvbnN0IFt3aW5kb3dXaWR0aCwgd2luZG93SGVpZ2h0XSA9IHdpbmRvdy53aW4uZ2V0U2l6ZSgpO1xuXHRcdFx0Y29uc3QgW21pbldpbmRvd1dpZHRoLCBtaW5XaW5kb3dIZWlnaHRdID0gd2luZG93Lndpbi5nZXRNaW5pbXVtU2l6ZSgpO1xuXHRcdFx0Y29uc3QgW25ld01pbldpbmRvd1dpZHRoLCBuZXdNaW5XaW5kb3dIZWlnaHRdID0gW3dpZHRoID8/IG1pbldpbmRvd1dpZHRoLCBoZWlnaHQgPz8gbWluV2luZG93SGVpZ2h0XTtcblx0XHRcdGNvbnN0IFtuZXdXaW5kb3dXaWR0aCwgbmV3V2luZG93SGVpZ2h0XSA9IFtNYXRoLm1heCh3aW5kb3dXaWR0aCwgbmV3TWluV2luZG93V2lkdGgpLCBNYXRoLm1heCh3aW5kb3dIZWlnaHQsIG5ld01pbldpbmRvd0hlaWdodCldO1xuXG5cdFx0XHRpZiAobWluV2luZG93V2lkdGggIT09IG5ld01pbldpbmRvd1dpZHRoIHx8IG1pbldpbmRvd0hlaWdodCAhPT0gbmV3TWluV2luZG93SGVpZ2h0KSB7XG5cdFx0XHRcdHdpbmRvdy53aW4uc2V0TWluaW11bVNpemUobmV3TWluV2luZG93V2lkdGgsIG5ld01pbldpbmRvd0hlaWdodCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAod2luZG93V2lkdGggIT09IG5ld1dpbmRvd1dpZHRoIHx8IHdpbmRvd0hlaWdodCAhPT0gbmV3V2luZG93SGVpZ2h0KSB7XG5cdFx0XHRcdHdpbmRvdy53aW4uc2V0U2l6ZShuZXdXaW5kb3dXaWR0aCwgbmV3V2luZG93SGVpZ2h0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBzYXZlV2luZG93U3BsYXNoKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHNwbGFzaDogSVBhcnRzU3BsYXNoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy5jb2RlV2luZG93QnlJZCh3aW5kb3dJZCk7XG5cblx0XHR0aGlzLnRoZW1lTWFpblNlcnZpY2Uuc2F2ZVdpbmRvd1NwbGFzaCh3aW5kb3dJZCwgd2luZG93Py5vcGVuZWRXb3Jrc3BhY2UsIHNwbGFzaCk7XG5cdH1cblxuXHRhc3luYyBzZXRCYWNrZ3JvdW5kVGhyb3R0bGluZyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBhbGxvd2VkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy5jb2RlV2luZG93QnlJZCh3aW5kb3dJZCk7XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFNldHRpbmcgYmFja2dyb3VuZCB0aHJvdHRsaW5nIGZvciB3aW5kb3cgJHt3aW5kb3dJZH0gdG8gJyR7YWxsb3dlZH0nYCk7XG5cblx0XHR3aW5kb3c/Lndpbj8ud2ViQ29udGVudHM/LnNldEJhY2tncm91bmRUaHJvdHRsaW5nKGFsbG93ZWQpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gbWFjT1MgU2hlbGwgQ29tbWFuZFxuXG5cdGFzeW5jIGluc3RhbGxTaGVsbENvbW1hbmQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgc291cmNlLCB0YXJnZXQgfSA9IGF3YWl0IHRoaXMuZ2V0U2hlbGxDb21tYW5kTGluaygpO1xuXG5cdFx0Ly8gT25seSBpbnN0YWxsIHVubGVzcyBhbHJlYWR5IGV4aXN0aW5nXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHsgc3ltYm9saWNMaW5rIH0gPSBhd2FpdCBTeW1saW5rU3VwcG9ydC5zdGF0KHNvdXJjZSk7XG5cdFx0XHRpZiAoc3ltYm9saWNMaW5rICYmICFzeW1ib2xpY0xpbmsuZGFuZ2xpbmcpIHtcblx0XHRcdFx0Y29uc3QgbGlua1RhcmdldFJlYWxQYXRoID0gYXdhaXQgUHJvbWlzZXMucmVhbHBhdGgoc291cmNlKTtcblx0XHRcdFx0aWYgKHRhcmdldCA9PT0gbGlua1RhcmdldFJlYWxQYXRoKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChlcnJvci5jb2RlICE9PSAnRU5PRU5UJykge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjsgLy8gdGhyb3cgb24gYW55IGVycm9yIGJ1dCBmaWxlIG5vdCBmb3VuZFxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuaW5zdGFsbFNoZWxsQ29tbWFuZFdpdGhQcml2aWxlZ2VzKHdpbmRvd0lkLCBzb3VyY2UsIHRhcmdldCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluc3RhbGxTaGVsbENvbW1hbmRXaXRoUHJpdmlsZWdlcyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBzb3VyY2U6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IHJlc3BvbnNlIH0gPSBhd2FpdCB0aGlzLnNob3dNZXNzYWdlQm94KHdpbmRvd0lkLCB7XG5cdFx0XHR0eXBlOiAnaW5mbycsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnd2FybkVzY2FsYXRpb24nLCBcInswfSB3aWxsIG5vdyBwcm9tcHQgd2l0aCAnb3Nhc2NyaXB0JyBmb3IgQWRtaW5pc3RyYXRvciBwcml2aWxlZ2VzIHRvIGluc3RhbGwgdGhlIHNoZWxsIGNvbW1hbmQuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KSxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdvaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk9LXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnY2FuY2VsJywgXCJDYW5jZWxcIilcblx0XHRcdF1cblx0XHR9KTtcblxuXHRcdGlmIChyZXNwb25zZSA9PT0gMSAvKiBDYW5jZWwgKi8pIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb21tYW5kID0gYG9zYXNjcmlwdCAtZSBcImRvIHNoZWxsIHNjcmlwdCBcXFxcXCJta2RpciAtcCAvdXNyL2xvY2FsL2JpbiAmJiBsbiAtc2YgXFwnJHt0YXJnZXR9XFwnIFxcJyR7c291cmNlfVxcJ1xcXFxcIiB3aXRoIGFkbWluaXN0cmF0b3IgcHJpdmlsZWdlc1wiYDtcblx0XHRcdGF3YWl0IHByb21pc2lmeShleGVjKShjb21tYW5kKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdjYW50Q3JlYXRlQmluRm9sZGVyJywgXCJVbmFibGUgdG8gaW5zdGFsbCB0aGUgc2hlbGwgY29tbWFuZCAnezB9Jy5cIiwgc291cmNlKSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdW5pbnN0YWxsU2hlbGxDb21tYW5kKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IHNvdXJjZSB9ID0gYXdhaXQgdGhpcy5nZXRTaGVsbENvbW1hbmRMaW5rKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZnMucHJvbWlzZXMudW5saW5rKHNvdXJjZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHN3aXRjaCAoZXJyb3IuY29kZSkge1xuXHRcdFx0XHRjYXNlICdFQUNDRVMnOiB7XG5cdFx0XHRcdFx0Y29uc3QgeyByZXNwb25zZSB9ID0gYXdhaXQgdGhpcy5zaG93TWVzc2FnZUJveCh3aW5kb3dJZCwge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2luZm8nLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3dhcm5Fc2NhbGF0aW9uVW5pbnN0YWxsJywgXCJ7MH0gd2lsbCBub3cgcHJvbXB0IHdpdGggJ29zYXNjcmlwdCcgZm9yIEFkbWluaXN0cmF0b3IgcHJpdmlsZWdlcyB0byB1bmluc3RhbGwgdGhlIHNoZWxsIGNvbW1hbmQuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KSxcblx0XHRcdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdvaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk9LXCIpLFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnY2FuY2VsJywgXCJDYW5jZWxcIilcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGlmIChyZXNwb25zZSA9PT0gMSAvKiBDYW5jZWwgKi8pIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb21tYW5kID0gYG9zYXNjcmlwdCAtZSBcImRvIHNoZWxsIHNjcmlwdCBcXFxcXCJybSBcXCcke3NvdXJjZX1cXCdcXFxcXCIgd2l0aCBhZG1pbmlzdHJhdG9yIHByaXZpbGVnZXNcImA7XG5cdFx0XHRcdFx0XHRhd2FpdCBwcm9taXNpZnkoZXhlYykoY29tbWFuZCk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnY2FudFVuaW5zdGFsbCcsIFwiVW5hYmxlIHRvIHVuaW5zdGFsbCB0aGUgc2hlbGwgY29tbWFuZCAnezB9Jy5cIiwgc291cmNlKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ0VOT0VOVCc6XG5cdFx0XHRcdFx0YnJlYWs7IC8vIGlnbm9yZSBmaWxlIG5vdCBmb3VuZFxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0U2hlbGxDb21tYW5kTGluaygpOiBQcm9taXNlPHsgcmVhZG9ubHkgc291cmNlOiBzdHJpbmc7IHJlYWRvbmx5IHRhcmdldDogc3RyaW5nIH0+IHtcblx0XHRjb25zdCB0YXJnZXQgPSByZXNvbHZlKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcHBSb290LCAnYmluJywgJ2NvZGUnKTtcblx0XHRjb25zdCBzb3VyY2UgPSBgL3Vzci9sb2NhbC9iaW4vJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLmFwcGxpY2F0aW9uTmFtZX1gO1xuXG5cdFx0Ly8gRW5zdXJlIHNvdXJjZSBleGlzdHNcblx0XHRjb25zdCBzb3VyY2VFeGlzdHMgPSBhd2FpdCBQcm9taXNlcy5leGlzdHModGFyZ2V0KTtcblx0XHRpZiAoIXNvdXJjZUV4aXN0cykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdzb3VyY2VNaXNzaW5nJywgXCJVbmFibGUgdG8gZmluZCBzaGVsbCBzY3JpcHQgaW4gJ3swfSdcIiwgdGFyZ2V0KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgc291cmNlLCB0YXJnZXQgfTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBEaWFsb2dcblxuXHRhc3luYyBzaG93TWVzc2FnZUJveCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zOiBNZXNzYWdlQm94T3B0aW9ucyAmIElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8TWVzc2FnZUJveFJldHVyblZhbHVlPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0cmV0dXJuIHRoaXMuZGlhbG9nTWFpblNlcnZpY2Uuc2hvd01lc3NhZ2VCb3gob3B0aW9ucywgd2luZG93Py53aW4gPz8gdW5kZWZpbmVkKTtcblx0fVxuXG5cdGFzeW5jIHNob3dTYXZlRGlhbG9nKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM6IFNhdmVEaWFsb2dPcHRpb25zICYgSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTxTYXZlRGlhbG9nUmV0dXJuVmFsdWU+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHRyZXR1cm4gdGhpcy5kaWFsb2dNYWluU2VydmljZS5zaG93U2F2ZURpYWxvZyhvcHRpb25zLCB3aW5kb3c/LndpbiA/PyB1bmRlZmluZWQpO1xuXHR9XG5cblx0YXN5bmMgc2hvd09wZW5EaWFsb2cod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9uczogT3BlbkRpYWxvZ09wdGlvbnMgJiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPE9wZW5EaWFsb2dSZXR1cm5WYWx1ZT4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHJldHVybiB0aGlzLmRpYWxvZ01haW5TZXJ2aWNlLnNob3dPcGVuRGlhbG9nKG9wdGlvbnMsIHdpbmRvdz8ud2luID8/IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRhc3luYyBwaWNrRmlsZUZvbGRlckFuZE9wZW4od2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9uczogSU5hdGl2ZU9wZW5EaWFsb2dPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGF0aHMgPSBhd2FpdCB0aGlzLmRpYWxvZ01haW5TZXJ2aWNlLnBpY2tGaWxlRm9sZGVyKG9wdGlvbnMpO1xuXHRcdGlmIChwYXRocykge1xuXHRcdFx0YXdhaXQgdGhpcy5kb09wZW5QaWNrZWQoYXdhaXQgUHJvbWlzZS5hbGwocGF0aHMubWFwKGFzeW5jIHBhdGggPT4gKGF3YWl0IFN5bWxpbmtTdXBwb3J0LmV4aXN0c0RpcmVjdG9yeShwYXRoKSkgPyB7IGZvbGRlclVyaTogVVJJLmZpbGUocGF0aCkgfSA6IHsgZmlsZVVyaTogVVJJLmZpbGUocGF0aCkgfSkpLCBvcHRpb25zLCB3aW5kb3dJZCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcGlja0ZvbGRlckFuZE9wZW4od2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9uczogSU5hdGl2ZU9wZW5EaWFsb2dPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGF0aHMgPSBhd2FpdCB0aGlzLmRpYWxvZ01haW5TZXJ2aWNlLnBpY2tGb2xkZXIob3B0aW9ucyk7XG5cdFx0aWYgKHBhdGhzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvT3BlblBpY2tlZChwYXRocy5tYXAocGF0aCA9PiAoeyBmb2xkZXJVcmk6IFVSSS5maWxlKHBhdGgpIH0pKSwgb3B0aW9ucywgd2luZG93SWQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHBpY2tGaWxlQW5kT3Blbih3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zOiBJTmF0aXZlT3BlbkRpYWxvZ09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwYXRocyA9IGF3YWl0IHRoaXMuZGlhbG9nTWFpblNlcnZpY2UucGlja0ZpbGUob3B0aW9ucyk7XG5cdFx0aWYgKHBhdGhzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvT3BlblBpY2tlZChwYXRocy5tYXAocGF0aCA9PiAoeyBmaWxlVXJpOiBVUkkuZmlsZShwYXRoKSB9KSksIG9wdGlvbnMsIHdpbmRvd0lkKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBwaWNrV29ya3NwYWNlQW5kT3Blbih3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zOiBJTmF0aXZlT3BlbkRpYWxvZ09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwYXRocyA9IGF3YWl0IHRoaXMuZGlhbG9nTWFpblNlcnZpY2UucGlja1dvcmtzcGFjZShvcHRpb25zKTtcblx0XHRpZiAocGF0aHMpIHtcblx0XHRcdGF3YWl0IHRoaXMuZG9PcGVuUGlja2VkKHBhdGhzLm1hcChwYXRoID0+ICh7IHdvcmtzcGFjZVVyaTogVVJJLmZpbGUocGF0aCkgfSkpLCBvcHRpb25zLCB3aW5kb3dJZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb09wZW5QaWNrZWQob3BlbmFibGU6IElXaW5kb3dPcGVuYWJsZVtdLCBvcHRpb25zOiBJTmF0aXZlT3BlbkRpYWxvZ09wdGlvbnMsIHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLndpbmRvd3NNYWluU2VydmljZS5vcGVuKHtcblx0XHRcdGNvbnRleHQ6IE9wZW5Db250ZXh0LkRJQUxPRyxcblx0XHRcdGNvbnRleHRXaW5kb3dJZDogd2luZG93SWQsXG5cdFx0XHRjbGk6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzLFxuXHRcdFx0dXJpc1RvT3Blbjogb3BlbmFibGUsXG5cdFx0XHRmb3JjZU5ld1dpbmRvdzogb3B0aW9ucy5mb3JjZU5ld1dpbmRvdyxcblx0XHRcdC8qIHJlbW90ZUF1dGhvcml0eSB3aWxsIGJlIGRldGVybWluZWQgYmFzZWQgb24gb3BlbmFibGUgKi9cblx0XHR9KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Ly8jcmVnaW9uIE9TXG5cblx0YXN5bmMgc2hvd0l0ZW1JbkZvbGRlcih3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRzaGVsbC5zaG93SXRlbUluRm9sZGVyKHBhdGgpO1xuXHR9XG5cblx0YXN5bmMgc2V0UmVwcmVzZW50ZWRGaWxlbmFtZSh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBwYXRoOiBzdHJpbmcsIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHR3aW5kb3c/LnNldFJlcHJlc2VudGVkRmlsZW5hbWUocGF0aCk7XG5cdH1cblxuXHRhc3luYyBzZXREb2N1bWVudEVkaXRlZCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBlZGl0ZWQ6IGJvb2xlYW4sIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHR3aW5kb3c/LnNldERvY3VtZW50RWRpdGVkKGVkaXRlZCk7XG5cdH1cblxuXHRhc3luYyBvcGVuRXh0ZXJuYWwod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgdXJsOiBzdHJpbmcsIGRlZmF1bHRBcHBsaWNhdGlvbj86IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS51bnNldFNuYXBFeHBvcnRlZFZhcmlhYmxlcygpO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAobWF0Y2hlc1NvbWVTY2hlbWUodXJsLCBTY2hlbWFzLmh0dHAsIFNjaGVtYXMuaHR0cHMpKSB7XG5cdFx0XHRcdHRoaXMub3BlbkV4dGVybmFsQnJvd3Nlcih3aW5kb3dJZCwgdXJsLCBkZWZhdWx0QXBwbGljYXRpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5kb09wZW5TaGVsbEV4dGVybmFsKHdpbmRvd0lkLCB1cmwpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UucmVzdG9yZVNuYXBFeHBvcnRlZFZhcmlhYmxlcygpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuRXh0ZXJuYWxCcm93c2VyKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHVybDogc3RyaW5nLCBkZWZhdWx0QXBwbGljYXRpb24/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmVkQnJvd3NlciA9IGRlZmF1bHRBcHBsaWNhdGlvbiA/PyB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3dvcmtiZW5jaC5leHRlcm5hbEJyb3dzZXInKTtcblx0XHRpZiAoIWNvbmZpZ3VyZWRCcm93c2VyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb09wZW5TaGVsbEV4dGVybmFsKHdpbmRvd0lkLCB1cmwpO1xuXHRcdH1cblxuXHRcdGlmIChjb25maWd1cmVkQnJvd3Nlci5pbmNsdWRlcyhwb3NpeC5zZXApIHx8IGNvbmZpZ3VyZWRCcm93c2VyLmluY2x1ZGVzKHdpbjMyLnNlcCkpIHtcblx0XHRcdGNvbnN0IGJyb3dzZXJQYXRoRXhpc3RzID0gYXdhaXQgUHJvbWlzZXMuZXhpc3RzKGNvbmZpZ3VyZWRCcm93c2VyKTtcblx0XHRcdGlmICghYnJvd3NlclBhdGhFeGlzdHMpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBDb25maWd1cmVkIGV4dGVybmFsIGJyb3dzZXIgcGF0aCBkb2VzIG5vdCBleGlzdDogJHtjb25maWd1cmVkQnJvd3Nlcn1gKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZG9PcGVuU2hlbGxFeHRlcm5hbCh3aW5kb3dJZCwgdXJsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBkZWZhdWx0OiBvcGVuLCBhcHBzIH0gPSBhd2FpdCBpbXBvcnQoJ29wZW4nKTtcblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IG9wZW4odXJsLCB7XG5cdFx0XHRcdGFwcDoge1xuXHRcdFx0XHRcdC8vIFVzZSBgb3Blbi5hcHBzYCBoZWxwZXIgdG8gYWxsb3cgY3Jvc3MtcGxhdGZvcm0gYnJvd3NlclxuXHRcdFx0XHRcdC8vIGFsaWFzZXMgdG8gYmUgbG9va2VkIHVwIHByb3Blcmx5LiBGYWxsYmFjayB0byB0aGVcblx0XHRcdFx0XHQvLyBjb25maWd1cmVkIHZhbHVlIGlmIG5vdCBmb3VuZC5cblx0XHRcdFx0XHRuYW1lOiBPYmplY3QuaGFzT3duKGFwcHMsIGNvbmZpZ3VyZWRCcm93c2VyKSA/IGFwcHNbKGNvbmZpZ3VyZWRCcm93c2VyIGFzIGtleW9mIHR5cGVvZiBhcHBzKV0gOiBjb25maWd1cmVkQnJvd3NlclxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdFx0Ly8gT24gTGludXgvbWFjT1MsIGxpc3RlbiB0byBzdGRlcnIgYW5kIHRyZWF0IHRoYXQgYXMgZmFpbHVyZVxuXHRcdFx0XHQvLyBmb3Igb3BlbmluZyB0aGUgYnJvd3NlciB0byBmYWxsYmFjayB0byB0aGUgZGVmYXVsdC5cblx0XHRcdFx0Ly8gT24gV2luZG93cywgdW5mb3J0dW5hdGVseSBQb3dlclNoZWxsIHNlZW1zIHRvIGFsd2F5cyB3cml0ZVxuXHRcdFx0XHQvLyB0byBzdGRlcnIgc28gd2UgY2Fubm90IHVzZSBpdCB0aGVyZVxuXHRcdFx0XHQvLyAoc2VlIGFsc28gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIzMDYzNilcblx0XHRcdFx0cmVzLnN0ZGVycj8ub25jZSgnZGF0YScsIChkYXRhOiBCdWZmZXIpID0+IHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIG9wZW5lbmluZyBleHRlcm5hbCBVUkwgJyR7dXJsfScgdXNpbmcgYnJvd3NlciAnJHtjb25maWd1cmVkQnJvd3Nlcn0nOiAke2RhdGEudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5kb09wZW5TaGVsbEV4dGVybmFsKHdpbmRvd0lkLCB1cmwpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBVbmFibGUgdG8gb3BlbiBleHRlcm5hbCBVUkwgJyR7dXJsfScgdXNpbmcgYnJvd3NlciAnJHtjb25maWd1cmVkQnJvd3Nlcn0nIGR1ZSB0byAke2Vycm9yfS5gKTtcblx0XHRcdHJldHVybiB0aGlzLmRvT3BlblNoZWxsRXh0ZXJuYWwod2luZG93SWQsIHVybCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb09wZW5TaGVsbEV4dGVybmFsKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHVybDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNoZWxsLm9wZW5FeHRlcm5hbCh1cmwpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRsZXQgaXNMaW5rOiBib29sZWFuO1xuXHRcdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRcdGlmIChtYXRjaGVzU29tZVNjaGVtZSh1cmwsIFNjaGVtYXMuaHR0cCwgU2NoZW1hcy5odHRwcykpIHtcblx0XHRcdFx0aXNMaW5rID0gdHJ1ZTtcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdvcGVuRXh0ZXJuYWxFcnJvckxpbmtNZXNzYWdlJywgXCJBbiBlcnJvciBvY2N1cnJlZCBvcGVuaW5nIGEgbGluayBpbiB5b3VyIGRlZmF1bHQgYnJvd3Nlci5cIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpc0xpbmsgPSBmYWxzZTtcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdvcGVuRXh0ZXJuYWxQcm9ncmFtRXJyb3JNZXNzYWdlJywgXCJBbiBlcnJvciBvY2N1cnJlZCBvcGVuaW5nIGFuIGV4dGVybmFsIHByb2dyYW0uXCIpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB7IHJlc3BvbnNlIH0gPSBhd2FpdCB0aGlzLmRpYWxvZ01haW5TZXJ2aWNlLnNob3dNZXNzYWdlQm94KHtcblx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0ZGV0YWlsOiBlcnJvci5tZXNzYWdlLFxuXHRcdFx0XHRidXR0b25zOiBpc0xpbmsgPyBbXG5cdFx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdjb3B5TGluaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNvcHkgTGlua1wiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY2FuY2VsJywgXCJDYW5jZWxcIilcblx0XHRcdFx0XSA6IFtcblx0XHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ29rJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT0tcIilcblx0XHRcdFx0XVxuXHRcdFx0fSwgdGhpcy53aW5kb3dCeUlkKHdpbmRvd0lkKT8ud2luID8/IHVuZGVmaW5lZCk7XG5cblx0XHRcdGlmIChyZXNwb25zZSA9PT0gMSAvKiBDYW5jZWwgKi8pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLndyaXRlQ2xpcGJvYXJkVGV4dCh3aW5kb3dJZCwgdXJsKTtcblx0XHR9XG5cdH1cblxuXHRtb3ZlSXRlbVRvVHJhc2god2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgZnVsbFBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBzaGVsbC50cmFzaEl0ZW0oZnVsbFBhdGgpO1xuXHR9XG5cblx0YXN5bmMgZ2V0TWVkaWFBY2Nlc3NTdGF0dXMod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgbWVkaWFUeXBlOiAnbWljcm9waG9uZScgfCAnY2FtZXJhJyB8ICdzY3JlZW4nKTogUHJvbWlzZTwnbm90LWRldGVybWluZWQnIHwgJ2dyYW50ZWQnIHwgJ2RlbmllZCcgfCAncmVzdHJpY3RlZCcgfCAndW5rbm93bic+IHtcblx0XHQvLyBzeXN0ZW1QcmVmZXJlbmNlcy5nZXRNZWRpYUFjY2Vzc1N0YXR1cyBpcyBpbXBsZW1lbnRlZCBvbiBtYWNPUyBvbmx5LlxuXHRcdC8vIE9uIExpbnV4IGFuZCBXaW5kb3dzIHRoZXJlJ3Mgbm8gcGVyLWFwcCBzY3JlZW4tcmVjb3JkaW5nIHBlcm1pc3Npb25cblx0XHQvLyBjb25jZXB0OyB0aGUgT1MgaGFuZGxlcyBjYXB0dXJlIHdpdGhvdXQgYW4gYXBwLWxldmVsIGdhdGUsIHNvIHJlcG9ydFxuXHRcdC8vICdncmFudGVkJyBzbyB0aGUgcmVuZGVyZXIgY2FuIHByb2NlZWQgc3RyYWlnaHQgdG8gZ2V0RGlzcGxheU1lZGlhLlxuXHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0cmV0dXJuIHN5c3RlbVByZWZlcmVuY2VzLmdldE1lZGlhQWNjZXNzU3RhdHVzKG1lZGlhVHlwZSk7XG5cdFx0fVxuXHRcdHJldHVybiAnZ3JhbnRlZCc7XG5cdH1cblxuXHRhc3luYyBpc0FkbWluKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGxldCBpc0FkbWluOiBib29sZWFuO1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGlzQWRtaW4gPSAoYXdhaXQgaW1wb3J0KCduYXRpdmUtaXMtZWxldmF0ZWQnKSkuZGVmYXVsdCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpc0FkbWluID0gcHJvY2Vzcy5nZXR1aWQ/LigpID09PSAwO1xuXHRcdH1cblxuXHRcdHJldHVybiBpc0FkbWluO1xuXHR9XG5cblx0YXN5bmMgd3JpdGVFbGV2YXRlZCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkksIG9wdGlvbnM/OiB7IHVubG9jaz86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN1ZG9Qcm9tcHQgPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvc3Vkby1wcm9tcHQnKTtcblxuXHRcdGNvbnN0IGFyZ3NGaWxlID0gcmFuZG9tUGF0aCh0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UudXNlckRhdGFQYXRoLCAnY29kZS1lbGV2YXRlZCcpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShhcmdzRmlsZSwgSlNPTi5zdHJpbmdpZnkoeyBzb3VyY2U6IHNvdXJjZS5mc1BhdGgsIHRhcmdldDogdGFyZ2V0LmZzUGF0aCB9KSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzdWRvQ29tbWFuZDogc3RyaW5nW10gPSBbYFwiJHt0aGlzLmNsaVBhdGh9XCJgXTtcblx0XHRcdFx0aWYgKG9wdGlvbnM/LnVubG9jaykge1xuXHRcdFx0XHRcdHN1ZG9Db21tYW5kLnB1c2goJy0tZmlsZS1jaG1vZCcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3Vkb0NvbW1hbmQucHVzaCgnLS1maWxlLXdyaXRlJywgYFwiJHthcmdzRmlsZX1cImApO1xuXG5cdFx0XHRcdGNvbnN0IHByb21wdE9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0bmFtZTogdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZy5yZXBsYWNlKCctJywgJycpLFxuXHRcdFx0XHRcdGljbnM6IChpc01hY2ludG9zaCAmJiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuaXNCdWlsdCkgPyBqb2luKGRpcm5hbWUodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFwcFJvb3QpLCBgJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydH0uaWNuc2ApIDogdW5kZWZpbmVkXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbc3Vkby1wcm9tcHRdIHJ1bm5pbmcgY29tbWFuZDogJHtzdWRvQ29tbWFuZC5qb2luKCcgJyl9YCk7XG5cblx0XHRcdFx0c3Vkb1Byb21wdC5leGVjKHN1ZG9Db21tYW5kLmpvaW4oJyAnKSwgcHJvbXB0T3B0aW9ucywgKGVycm9yPywgc3Rkb3V0Pywgc3RkZXJyPykgPT4ge1xuXHRcdFx0XHRcdGlmIChzdGRvdXQpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3N1ZG8tcHJvbXB0XSByZWNlaXZlZCBzdGRvdXQ6ICR7c3Rkb3V0fWApO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChzdGRlcnIpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW3N1ZG8tcHJvbXB0XSByZWNlaXZlZCBzdGRlcnI6ICR7c3RkZXJyfWApO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZnMucHJvbWlzZXMudW5saW5rKGFyZ3NGaWxlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBpc1J1bm5pbmdVbmRlckFSTTY0VHJhbnNsYXRpb24oKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKGlzTGludXggfHwgaXNXaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFwcC5ydW5uaW5nVW5kZXJBUk02NFRyYW5zbGF0aW9uO1xuXHR9XG5cblx0QG1lbW9pemVcblx0cHJpdmF0ZSBnZXQgY2xpUGF0aCgpOiBzdHJpbmcge1xuXG5cdFx0Ly8gV2luZG93c1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGlmICh0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuaXNCdWlsdCkge1xuXHRcdFx0XHRyZXR1cm4gam9pbihkaXJuYW1lKHByb2Nlc3MuZXhlY1BhdGgpLCAnYmluJywgYCR7dGhpcy5wcm9kdWN0U2VydmljZS5hcHBsaWNhdGlvbk5hbWV9LmNtZGApO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gam9pbih0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXBwUm9vdCwgJ3NjcmlwdHMnLCAnY29kZS1jbGkuYmF0Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gTGludXhcblx0XHRpZiAoaXNMaW51eCkge1xuXHRcdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5pc0J1aWx0KSB7XG5cdFx0XHRcdHJldHVybiBqb2luKGRpcm5hbWUocHJvY2Vzcy5leGVjUGF0aCksICdiaW4nLCBgJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLmFwcGxpY2F0aW9uTmFtZX1gKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGpvaW4odGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFwcFJvb3QsICdzY3JpcHRzJywgJ2NvZGUtY2xpLnNoJyk7XG5cdFx0fVxuXG5cdFx0Ly8gbWFjT1Ncblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmlzQnVpbHQpIHtcblx0XHRcdHJldHVybiBqb2luKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcHBSb290LCAnYmluJywgJ2NvZGUnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gam9pbih0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXBwUm9vdCwgJ3NjcmlwdHMnLCAnY29kZS1jbGkuc2gnKTtcblx0fVxuXG5cdGFzeW5jIGdldE9TU3RhdGlzdGljcygpOiBQcm9taXNlPElPU1N0YXRpc3RpY3M+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dG90YWxtZW06IHRvdGFsbWVtKCksXG5cdFx0XHRmcmVlbWVtOiBmcmVlbWVtKCksXG5cdFx0XHRsb2FkYXZnOiBsb2FkYXZnKClcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZ2V0T1NQcm9wZXJ0aWVzKCk6IFByb21pc2U8SU9TUHJvcGVydGllcz4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRhcmNoOiBhcmNoKCksXG5cdFx0XHRwbGF0Zm9ybTogcGxhdGZvcm0oKSxcblx0XHRcdHJlbGVhc2U6IHJlbGVhc2UoKSxcblx0XHRcdHR5cGU6IHR5cGUoKSxcblx0XHRcdGNwdXM6IGNwdXMoKVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBnZXRPU1ZpcnR1YWxNYWNoaW5lSGludCgpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdHJldHVybiB2aXJ0dWFsTWFjaGluZUhpbnQudmFsdWUoKTtcblx0fVxuXG5cdGFzeW5jIGdldE9TQ29sb3JTY2hlbWUoKTogUHJvbWlzZTxJQ29sb3JTY2hlbWU+IHtcblx0XHRyZXR1cm4gdGhpcy50aGVtZU1haW5TZXJ2aWNlLmdldENvbG9yU2NoZW1lKCk7XG5cdH1cblxuXHQvLyBXU0xcblx0YXN5bmMgaGFzV1NMRmVhdHVyZUluc3RhbGxlZCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gaXNXaW5kb3dzICYmIGhhc1dTTEZlYXR1cmVJbnN0YWxsZWQoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Ly8jcmVnaW9uIFNjcmVlbnNob3RzXG5cblx0YXN5bmMgZ2V0U2NyZWVuc2hvdCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCByZWN0PzogSVJlY3RhbmdsZSwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHRjb25zdCBjYXB0dXJlZCA9IGF3YWl0IHdpbmRvdz8ud2luPy53ZWJDb250ZW50cy5jYXB0dXJlUGFnZShyZWN0KTtcblxuXHRcdGNvbnN0IGJ1ZiA9IGNhcHR1cmVkPy50b0pQRUcoOTUpO1xuXHRcdHJldHVybiBidWYgJiYgVlNCdWZmZXIud3JhcChidWYpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gR2l0SHViIG1vYmlsZSB1cGxvYWQgQVBJXG5cblx0YXN5bmMgdXBsb2FkRmlsZVZpYU1vYmlsZUFwaShfd2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgdG9rZW46IHN0cmluZywgcmVwb0lkOiBzdHJpbmcsIGZpbGVOYW1lOiBzdHJpbmcsIGZpbGVCeXRlczogVlNCdWZmZXIsIGNvbnRlbnRUeXBlOiBzdHJpbmcpOiBQcm9taXNlPHsgZmlsZU5hbWU6IHN0cmluZzsgYXNzZXRVcmw6IHN0cmluZzsgY29udGVudFR5cGU6IHN0cmluZyB9PiB7XG5cdFx0Y29uc3QgeyBuZXQgfSA9IGF3YWl0IGltcG9ydCgnZWxlY3Ryb24nKTtcblxuXHRcdC8vIFN0ZXAgMTogR2V0IHVwbG9hZCBwb2xpY3lcblx0XHRjb25zdCBwb2xpY3lSZXNwb25zZSA9IGF3YWl0IG5ldC5mZXRjaCgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9tb2JpbGUvdXBsb2FkL3BvbGljeScsIHtcblx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHt0b2tlbn1gLFxuXHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHQnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0fSxcblx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0bmFtZTogZmlsZU5hbWUsXG5cdFx0XHRcdHNpemU6IGZpbGVCeXRlcy5ieXRlTGVuZ3RoLFxuXHRcdFx0XHRjb250ZW50X3R5cGU6IGNvbnRlbnRUeXBlLFxuXHRcdFx0XHRyZXBvc2l0b3J5X2lkOiBwYXJzZUludChyZXBvSWQsIDEwKSxcblx0XHRcdH0pLFxuXHRcdH0pO1xuXHRcdGlmICghcG9saWN5UmVzcG9uc2Uub2spIHtcblx0XHRcdGNvbnN0IHRleHQgPSBhd2FpdCBwb2xpY3lSZXNwb25zZS50ZXh0KCk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFBvbGljeSByZXF1ZXN0IGZhaWxlZCAke3BvbGljeVJlc3BvbnNlLnN0YXR1c306ICR7dGV4dC5zdWJzdHJpbmcoMCwgMzAwKX1gKTtcblx0XHR9XG5cdFx0Y29uc3QgcG9saWN5ID0gYXdhaXQgcG9saWN5UmVzcG9uc2UuanNvbigpO1xuXHRcdGNvbnN0IGFzc2V0ID0gcG9saWN5LmFzc2V0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG5cdFx0Ly8gU3RlcCAyOiBVcGxvYWQgdG8gUzMgKHVzZXMgbmV0LmZldGNoIHdoaWNoIGJ5cGFzc2VzIENPUlMpXG5cdFx0Y29uc3QgZm9ybUZpZWxkcyA9IHBvbGljeS5mb3JtIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cdFx0Y29uc3QgYm91bmRhcnkgPSBgLS0tLVZTQ29kZVVwbG9hZCR7RGF0ZS5ub3coKX1gO1xuXHRcdGxldCBtdWx0aXBhcnRCb2R5ID0gJyc7XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZm9ybUZpZWxkcykpIHtcblx0XHRcdG11bHRpcGFydEJvZHkgKz0gYC0tJHtib3VuZGFyeX1cXHJcXG5Db250ZW50LURpc3Bvc2l0aW9uOiBmb3JtLWRhdGE7IG5hbWU9XCIke2tleX1cIlxcclxcblxcclxcbiR7dmFsdWV9XFxyXFxuYDtcblx0XHR9XG5cdFx0Ly8gU2FuaXRpemUgdGhlIGZpbGVuYW1lIGZvciBtdWx0aXBhcnQgaGVhZGVyIHNhZmV0eTogc3RyaXAgQ1IvTEYgKHdoaWNoIHdvdWxkXG5cdFx0Ly8gdGVybWluYXRlIHRoZSBoZWFkZXIgLyBpbmplY3QgZXh0cmEgZmllbGRzKSBhbmQgZXNjYXBlIGJhY2tzbGFzaGVzIGFuZCBkb3VibGVcblx0XHQvLyBxdW90ZXMgKFJGQyAyNjE2IHF1b3RlZC1zdHJpbmcgc2VtYW50aWNzKS5cblx0XHRjb25zdCBzYWZlTmFtZSA9IFN0cmluZyhhc3NldC5uYW1lKS5yZXBsYWNlKC9bXFxyXFxuXSsvZywgJyAnKS5yZXBsYWNlKC9bXFxcXFwiXS9nLCAnXycpO1xuXHRcdG11bHRpcGFydEJvZHkgKz0gYC0tJHtib3VuZGFyeX1cXHJcXG5Db250ZW50LURpc3Bvc2l0aW9uOiBmb3JtLWRhdGE7IG5hbWU9XCJmaWxlXCI7IGZpbGVuYW1lPVwiJHtzYWZlTmFtZX1cIlxcclxcbkNvbnRlbnQtVHlwZTogJHtjb250ZW50VHlwZX1cXHJcXG5cXHJcXG5gO1xuXHRcdGNvbnN0IGVwaWxvZ3VlID0gYFxcclxcbi0tJHtib3VuZGFyeX0tLVxcclxcbmA7XG5cblx0XHRjb25zdCBwcmVhbWJsZUJ5dGVzID0gQnVmZmVyLmZyb20obXVsdGlwYXJ0Qm9keSwgJ3V0Zi04Jyk7XG5cdFx0Y29uc3QgZXBpbG9ndWVCeXRlcyA9IEJ1ZmZlci5mcm9tKGVwaWxvZ3VlLCAndXRmLTgnKTtcblx0XHQvLyBQYXNzIGZpbGVCeXRlcy5idWZmZXIgKFVpbnQ4QXJyYXkpIGRpcmVjdGx5IHRvIEJ1ZmZlci5jb25jYXQgaW5zdGVhZCBvZiB3cmFwcGluZ1xuXHRcdC8vIGluIEJ1ZmZlci5mcm9tKC4uLikgd2hpY2ggd291bGQgZm9yY2UgYW4gZXh0cmEgZnVsbC1zaXplIGNvcHkgb2YgdGhlIHBheWxvYWQuXG5cdFx0Y29uc3QgYm9keUJ1ZmZlciA9IEJ1ZmZlci5jb25jYXQoW3ByZWFtYmxlQnl0ZXMsIGZpbGVCeXRlcy5idWZmZXIsIGVwaWxvZ3VlQnl0ZXNdKTtcblxuXHRcdGNvbnN0IHMzUmVzcG9uc2UgPSBhd2FpdCBuZXQuZmV0Y2gocG9saWN5LnVwbG9hZF91cmwgYXMgc3RyaW5nLCB7XG5cdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6IGBtdWx0aXBhcnQvZm9ybS1kYXRhOyBib3VuZGFyeT0ke2JvdW5kYXJ5fWAgfSxcblx0XHRcdGJvZHk6IGJvZHlCdWZmZXIsXG5cdFx0fSk7XG5cdFx0aWYgKHMzUmVzcG9uc2Uuc3RhdHVzICE9PSAyMDQgJiYgczNSZXNwb25zZS5zdGF0dXMgIT09IDIwMSkge1xuXHRcdFx0Y29uc3QgdGV4dCA9IGF3YWl0IHMzUmVzcG9uc2UudGV4dCgpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTMyB1cGxvYWQgZmFpbGVkICR7czNSZXNwb25zZS5zdGF0dXN9OiAke3RleHQuc3Vic3RyaW5nKDAsIDMwMCl9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RlcCAzOiBDb25maXJtIHVwbG9hZFxuXHRcdGNvbnN0IGNvbmZpcm1SZXNwb25zZSA9IGF3YWl0IG5ldC5mZXRjaChgaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbSR7cG9saWN5LmFzc2V0X3VwbG9hZF91cmx9YCwge1xuXHRcdFx0bWV0aG9kOiAnUFVUJyxcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7dG9rZW59YCxcblx0XHRcdFx0J0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0aWYgKCFjb25maXJtUmVzcG9uc2Uub2spIHtcblx0XHRcdGNvbnN0IHRleHQgPSBhd2FpdCBjb25maXJtUmVzcG9uc2UudGV4dCgpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBc3NldCB1cGxvYWQgY29uZmlybWF0aW9uIGZhaWxlZCAke2NvbmZpcm1SZXNwb25zZS5zdGF0dXN9OiAke3RleHQuc3Vic3RyaW5nKDAsIDMwMCl9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZmlsZU5hbWUsIGFzc2V0VXJsOiBhc3NldC5ocmVmIGFzIHN0cmluZywgY29udGVudFR5cGUgfTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Ly8jcmVnaW9uIFByb2Nlc3NcblxuXHRhc3luYyBnZXRQcm9jZXNzSWQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKHVuZGVmaW5lZCwgd2luZG93SWQpO1xuXHRcdHJldHVybiB3aW5kb3c/Lndpbj8ud2ViQ29udGVudHMuZ2V0T1NQcm9jZXNzSWQoKTtcblx0fVxuXG5cdGFzeW5jIGtpbGxQcm9jZXNzKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHBpZDogbnVtYmVyLCBjb2RlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRwcm9jZXNzLmtpbGwocGlkLCBjb2RlKTtcblx0fVxuXG5cdGFzeW5jIGxpc3RPbGxhbWFNb2RlbHMoX3dpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGJhc2VVcmw/OiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBsaXN0T2xsYW1hTW9kZWxzRnJvbU1hY2hpbmUoYmFzZVVybCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW05hdGl2ZUhvc3RdIG9sbGFtYSBsaXN0IGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gQ2xpcGJvYXJkXG5cblx0YXN5bmMgcmVhZENsaXBib2FyZFRleHQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgdHlwZT86ICdzZWxlY3Rpb24nIHwgJ2NsaXBib2FyZCcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgcmVhZENsaXBib2FyZFRleHQgaW4gd2luZG93ICR7d2luZG93SWR9IHdpdGggdHlwZTpgLCB0eXBlKTtcblx0XHRjb25zdCBjbGlwYm9hcmRUZXh0ID0gY2xpcGJvYXJkLnJlYWRUZXh0KHR5cGUpO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgY2xpcGJvYXJkVGV4dC5sZW5ndGggOmAsIGNsaXBib2FyZFRleHQubGVuZ3RoKTtcblx0XHRyZXR1cm4gY2xpcGJvYXJkVGV4dDtcblx0fVxuXG5cdGFzeW5jIHRyaWdnZXJQYXN0ZSh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBUcmlnZ2VyaW5nIHBhc3RlIGluIHdpbmRvdyAke3dpbmRvd0lkfSB3aXRoIG9wdGlvbnM6YCwgb3B0aW9ucyk7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0cmV0dXJuIHdpbmRvdz8ud2luPy53ZWJDb250ZW50cy5wYXN0ZSgpID8/IFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0YXN5bmMgcmVhZEltYWdlKCk6IFByb21pc2U8VWludDhBcnJheT4ge1xuXHRcdHJldHVybiBjbGlwYm9hcmQucmVhZEltYWdlKCkudG9QTkcoKTtcblx0fVxuXG5cdGFzeW5jIHdyaXRlQ2xpcGJvYXJkVGV4dCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0ZXh0OiBzdHJpbmcsIHR5cGU/OiAnc2VsZWN0aW9uJyB8ICdjbGlwYm9hcmQnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIGNsaXBib2FyZC53cml0ZVRleHQodGV4dCwgdHlwZSk7XG5cdH1cblxuXHRhc3luYyByZWFkQ2xpcGJvYXJkRmluZFRleHQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiBjbGlwYm9hcmQucmVhZEZpbmRUZXh0KCk7XG5cdH1cblxuXHRhc3luYyB3cml0ZUNsaXBib2FyZEZpbmRUZXh0KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHRleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBjbGlwYm9hcmQud3JpdGVGaW5kVGV4dCh0ZXh0KTtcblx0fVxuXG5cdGFzeW5jIHdyaXRlQ2xpcGJvYXJkQnVmZmVyKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGZvcm1hdDogc3RyaW5nLCBidWZmZXI6IFZTQnVmZmVyLCB0eXBlPzogJ3NlbGVjdGlvbicgfCAnY2xpcGJvYXJkJyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBjbGlwYm9hcmQud3JpdGVCdWZmZXIoZm9ybWF0LCBCdWZmZXIuZnJvbShidWZmZXIuYnVmZmVyKSwgdHlwZSk7XG5cdH1cblxuXHRhc3luYyByZWFkQ2xpcGJvYXJkQnVmZmVyKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGZvcm1hdDogc3RyaW5nKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdHJldHVybiBWU0J1ZmZlci53cmFwKGNsaXBib2FyZC5yZWFkQnVmZmVyKGZvcm1hdCkpO1xuXHR9XG5cblx0YXN5bmMgaGFzQ2xpcGJvYXJkKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGZvcm1hdDogc3RyaW5nLCB0eXBlPzogJ3NlbGVjdGlvbicgfCAnY2xpcGJvYXJkJyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBjbGlwYm9hcmQuaGFzKGZvcm1hdCwgdHlwZSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBtYWNPUyBUb3VjaGJhclxuXG5cdGFzeW5jIG5ld1dpbmRvd1RhYigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLndpbmRvd3NNYWluU2VydmljZS5vcGVuKHtcblx0XHRcdGNvbnRleHQ6IE9wZW5Db250ZXh0LkFQSSxcblx0XHRcdGNsaTogdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3MsXG5cdFx0XHRmb3JjZU5ld1RhYmJlZFdpbmRvdzogdHJ1ZSxcblx0XHRcdGZvcmNlRW1wdHk6IHRydWUsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzLnJlbW90ZSB8fCB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHNob3dQcmV2aW91c1dpbmRvd1RhYigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRNZW51LnNlbmRBY3Rpb25Ub0ZpcnN0UmVzcG9uZGVyKCdzZWxlY3RQcmV2aW91c1RhYjonKTtcblx0fVxuXG5cdGFzeW5jIHNob3dOZXh0V2luZG93VGFiKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdE1lbnUuc2VuZEFjdGlvblRvRmlyc3RSZXNwb25kZXIoJ3NlbGVjdE5leHRUYWI6Jyk7XG5cdH1cblxuXHRhc3luYyBtb3ZlV2luZG93VGFiVG9OZXdXaW5kb3coKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0TWVudS5zZW5kQWN0aW9uVG9GaXJzdFJlc3BvbmRlcignbW92ZVRhYlRvTmV3V2luZG93OicpO1xuXHR9XG5cblx0YXN5bmMgbWVyZ2VBbGxXaW5kb3dUYWJzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdE1lbnUuc2VuZEFjdGlvblRvRmlyc3RSZXNwb25kZXIoJ21lcmdlQWxsV2luZG93czonKTtcblx0fVxuXG5cdGFzeW5jIHRvZ2dsZVdpbmRvd1RhYnNCYXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0TWVudS5zZW5kQWN0aW9uVG9GaXJzdFJlc3BvbmRlcigndG9nZ2xlVGFiQmFyOicpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlVG91Y2hCYXIod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgaXRlbXM6IElTZXJpYWxpemFibGVDb21tYW5kQWN0aW9uW11bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMuY29kZVdpbmRvd0J5SWQod2luZG93SWQpO1xuXHRcdHdpbmRvdz8udXBkYXRlVG91Y2hCYXIoaXRlbXMpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gTGlmZWN5Y2xlXG5cblx0YXN5bmMgbm90aWZ5UmVhZHkod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMuY29kZVdpbmRvd0J5SWQod2luZG93SWQpO1xuXHRcdHdpbmRvdz8uc2V0UmVhZHkoKTtcblx0fVxuXG5cdGFzeW5jIHJlbGF1bmNoKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJUmVsYXVuY2hPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2UucmVsYXVuY2gob3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyByZWxvYWQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IHsgZGlzYWJsZUV4dGVuc2lvbnM/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLmNvZGVXaW5kb3dCeUlkKHdpbmRvd0lkKTtcblx0XHRpZiAod2luZG93KSB7XG5cblx0XHRcdC8vIFNwZWNpYWwgY2FzZTogc3VwcG9ydCBgdHJhbnNpZW50YCB3b3Jrc3BhY2VzIGJ5IHByZXZlbnRpbmdcblx0XHRcdC8vIHRoZSByZWxvYWQgYW5kIHJhdGhlciBnbyBiYWNrIHRvIGFuIGVtcHR5IHdpbmRvdy4gVHJhbnNpZW50XG5cdFx0XHQvLyB3b3Jrc3BhY2VzIHNob3VsZCBuZXZlciByZXN0b3JlLCBldmVuIHdoZW4gdGhlIHVzZXIgd2FudHNcblx0XHRcdC8vIHRvIHJlbG9hZC5cblx0XHRcdC8vIEZvcjogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExOTY5NVxuXHRcdFx0aWYgKGlzV29ya3NwYWNlSWRlbnRpZmllcih3aW5kb3cub3BlbmVkV29ya3NwYWNlKSkge1xuXHRcdFx0XHRjb25zdCBjb25maWdQYXRoID0gd2luZG93Lm9wZW5lZFdvcmtzcGFjZS5jb25maWdQYXRoO1xuXHRcdFx0XHRpZiAoY29uZmlnUGF0aC5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IHRoaXMud29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS5yZXNvbHZlTG9jYWxXb3Jrc3BhY2UoY29uZmlnUGF0aCk7XG5cdFx0XHRcdFx0aWYgKHdvcmtzcGFjZT8udHJhbnNpZW50KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5vcGVuV2luZG93KHdpbmRvdy5pZCwgeyBmb3JjZVJldXNlV2luZG93OiB0cnVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBQcm9jZWVkIG5vcm1hbGx5IHRvIHJlbG9hZCB0aGUgd2luZG93XG5cdFx0XHRyZXR1cm4gdGhpcy5saWZlY3ljbGVNYWluU2VydmljZS5yZWxvYWQod2luZG93LCBvcHRpb25zPy5kaXNhYmxlRXh0ZW5zaW9ucyAhPT0gdW5kZWZpbmVkID8geyBfOiBbXSwgJ2Rpc2FibGUtZXh0ZW5zaW9ucyc6IG9wdGlvbnMuZGlzYWJsZUV4dGVuc2lvbnMgfSA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY2xvc2VXaW5kb3cod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMud2luZG93QnlJZChvcHRpb25zPy50YXJnZXRXaW5kb3dJZCwgd2luZG93SWQpO1xuXHRcdHJldHVybiB3aW5kb3c/Lndpbj8uY2xvc2UoKTtcblx0fVxuXG5cdGFzeW5jIHF1aXQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gSWYgdGhlIHVzZXIgc2VsZWN0ZWQgdG8gZXhpdCBmcm9tIGFuIGV4dGVuc2lvbiBkZXZlbG9wbWVudCBob3N0IHdpbmRvdywgZG8gbm90IHF1aXQsIGJ1dCBqdXN0XG5cdFx0Ly8gY2xvc2UgdGhlIHdpbmRvdyB1bmxlc3MgdGhpcyBpcyB0aGUgbGFzdCB3aW5kb3cgdGhhdCBpcyBvcGVuZWQuXG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVdpbmRvdygpO1xuXHRcdGlmICh3aW5kb3c/LmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnRIb3N0ICYmIHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd0NvdW50KCkgPiAxICYmIHdpbmRvdy53aW4pIHtcblx0XHRcdHdpbmRvdy53aW4uY2xvc2UoKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2U6IG5vcm1hbCBxdWl0XG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLnF1aXQoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBleGl0KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGNvZGU6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2Uua2lsbChjb2RlKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Ly8jcmVnaW9uIENvbm5lY3Rpdml0eVxuXG5cdGFzeW5jIHJlc29sdmVQcm94eSh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCB1cmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy5jb2RlV2luZG93QnlJZCh3aW5kb3dJZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHdpbmRvdz8ud2luPy53ZWJDb250ZW50cz8uc2Vzc2lvbjtcblxuXHRcdHJldHVybiBzZXNzaW9uPy5yZXNvbHZlUHJveHkodXJsKTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVQcm94eVdpdGhQYWNrYWdlKF93aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCB1cmw6IHN0cmluZyk6IFByb21pc2U8SU9TUHJveHlbXT4ge1xuXHRcdGNvbnN0IHsgcmVzb2x2ZVByb3h5IH0gPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvb3MtcHJveHktcmVzb2x2ZXInKTtcblx0XHRyZXR1cm4gcmVzb2x2ZVByb3h5KHVybCk7XG5cdH1cblxuXHRhc3luYyByZWFkUHJveHlDb25maWdXaXRoUGFja2FnZShfd2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8SU9TUHJveHlDb25maWc+IHtcblx0XHRjb25zdCB7IHJlYWRQcm94eUNvbmZpZyB9ID0gYXdhaXQgaW1wb3J0KCdAdnNjb2RlL29zLXByb3h5LXJlc29sdmVyJyk7XG5cdFx0cmV0dXJuIHJlYWRQcm94eUNvbmZpZygpO1xuXHR9XG5cblx0YXN5bmMgbG9va3VwQXV0aG9yaXphdGlvbihfd2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgYXV0aEluZm86IEF1dGhJbmZvKTogUHJvbWlzZTxDcmVkZW50aWFscyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnByb3h5QXV0aFNlcnZpY2UubG9va3VwQXV0aG9yaXphdGlvbihhdXRoSW5mbyk7XG5cdH1cblxuXHRhc3luYyBsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24oX3dpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5yZXF1ZXN0U2VydmljZS5sb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24odXJsKTtcblx0fVxuXG5cdGFzeW5jIGxvYWRDZXJ0aWZpY2F0ZXMoX3dpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMucmVxdWVzdFNlcnZpY2UubG9hZENlcnRpZmljYXRlcygpO1xuXHR9XG5cblx0aXNQb3J0RnJlZSh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBwb3J0OiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gaXNQb3J0RnJlZShwb3J0LCAxXzAwMCk7XG5cdH1cblxuXHRmaW5kRnJlZVBvcnQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgc3RhcnRQb3J0OiBudW1iZXIsIGdpdmVVcEFmdGVyOiBudW1iZXIsIHRpbWVvdXQ6IG51bWJlciwgc3RyaWRlID0gMSk6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0cmV0dXJuIGZpbmRGcmVlUG9ydChzdGFydFBvcnQsIGdpdmVVcEFmdGVyLCB0aW1lb3V0LCBzdHJpZGUpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gRGV2ZWxvcG1lbnRcblxuXHRwcml2YXRlIGdwdUluZm9XaW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbnRlbnRUcmFjaW5nV2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRhc3luYyBvcGVuRGV2VG9vbHMod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IFBhcnRpYWw8T3BlbkRldlRvb2xzT3B0aW9ucz4gJiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd0J5SWQob3B0aW9ucz8udGFyZ2V0V2luZG93SWQsIHdpbmRvd0lkKTtcblx0XHR3aW5kb3c/Lndpbj8ud2ViQ29udGVudHMub3BlbkRldlRvb2xzKG9wdGlvbnM/Lm1vZGUgPyB7IG1vZGU6IG9wdGlvbnMubW9kZSwgYWN0aXZhdGU6IG9wdGlvbnMuYWN0aXZhdGUgfSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRhc3luYyB0b2dnbGVEZXZUb29scyh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy53aW5kb3dCeUlkKG9wdGlvbnM/LnRhcmdldFdpbmRvd0lkLCB3aW5kb3dJZCk7XG5cdFx0d2luZG93Py53aW4/LndlYkNvbnRlbnRzLnRvZ2dsZURldlRvb2xzKCk7XG5cdH1cblxuXHRhc3luYyBvcGVuRGV2VG9vbHNXaW5kb3cod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgdXJsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwYXJlbnRXaW5kb3cgPSB0aGlzLmNvZGVXaW5kb3dCeUlkKHdpbmRvd0lkKTtcblx0XHRpZiAoIXBhcmVudFdpbmRvdykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMub3BlbkNoaWxkV2luZG93KHBhcmVudFdpbmRvdy53aW4sIHVybCk7XG5cdH1cblxuXHRwcml2YXRlIG9wZW5DaGlsZFdpbmRvdyhwYXJlbnRXaW5kb3c6IEJyb3dzZXJXaW5kb3cgfCBudWxsLCB1cmw6IHN0cmluZywgb3ZlcnJpZGVXaW5kb3dPcHRpb25zOiBFbGVjdHJvbi5Ccm93c2VyV2luZG93Q29uc3RydWN0b3JPcHRpb25zID0ge30pOiBCcm93c2VyV2luZG93IHtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihkZWZhdWx0QnJvd3NlcldpbmRvd09wdGlvbnMsIGRlZmF1bHRXaW5kb3dTdGF0ZSgpLCB7IGZvcmNlTmF0aXZlVGl0bGViYXI6IHRydWUgfSk7XG5cblx0XHRjb25zdCB3aW5kb3dPcHRpb25zOiBFbGVjdHJvbi5Ccm93c2VyV2luZG93Q29uc3RydWN0b3JPcHRpb25zID0ge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdHBhcmVudDogcGFyZW50V2luZG93ID8/IHVuZGVmaW5lZCxcblx0XHRcdC4uLm92ZXJyaWRlV2luZG93T3B0aW9uc1xuXHRcdH07XG5cblx0XHRjb25zdCB3aW5kb3cgPSBuZXcgQnJvd3NlcldpbmRvdyh3aW5kb3dPcHRpb25zKTtcblx0XHR3aW5kb3cuc2V0TWVudUJhclZpc2liaWxpdHkoZmFsc2UpO1xuXHRcdHdpbmRvdy5sb2FkVVJMKHVybCk7XG5cblx0XHR3aW5kb3cub25jZSgncmVhZHktdG8tc2hvdycsICgpID0+IHdpbmRvdy5zaG93KCkpO1xuXG5cdFx0cmV0dXJuIHdpbmRvdztcblx0fVxuXG5cdGFzeW5jIG9wZW5HUFVJbmZvV2luZG93KHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwYXJlbnRXaW5kb3cgPSB0aGlzLmNvZGVXaW5kb3dCeUlkKHdpbmRvd0lkKTtcblx0XHRpZiAoIXBhcmVudFdpbmRvdykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdGhpcy5ncHVJbmZvV2luZG93SWQgIT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCBncHVJbmZvV2luZG93ID0gdGhpcy5vcGVuQ2hpbGRXaW5kb3cocGFyZW50V2luZG93LndpbiwgJ2Nocm9tZTovL2dwdScpO1xuXHRcdFx0Z3B1SW5mb1dpbmRvdy5vbmNlKCdjbG9zZScsICgpID0+IHRoaXMuZ3B1SW5mb1dpbmRvd0lkID0gdW5kZWZpbmVkKTtcblxuXHRcdFx0dGhpcy5ncHVJbmZvV2luZG93SWQgPSBncHVJbmZvV2luZG93LmlkO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdGhpcy5ncHVJbmZvV2luZG93SWQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCB3aW5kb3cgPSBCcm93c2VyV2luZG93LmZyb21JZCh0aGlzLmdwdUluZm9XaW5kb3dJZCk7XG5cdFx0XHRpZiAod2luZG93Py5pc01pbmltaXplZCgpKSB7XG5cdFx0XHRcdHdpbmRvdz8ucmVzdG9yZSgpO1xuXHRcdFx0fVxuXHRcdFx0d2luZG93Py5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIG9wZW5Db250ZW50VHJhY2luZ1dpbmRvdygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodHlwZW9mIHRoaXMuY29udGVudFRyYWNpbmdXaW5kb3dJZCAhPT0gJ251bWJlcicpIHtcblx0XHRcdC8vIERpc2FibGUgcmVhZHktdG8tc2hvdyBldmVudCB3aXRoIHBhaW50V2hlbkluaXRpYWxseUhpZGRlbiB0b1xuXHRcdFx0Ly8gY3VzdG9taXplIGNvbnRlbnQgdHJhY2luZyB3aW5kb3cgYmVsb3cuXG5cdFx0XHRjb25zdCBjb250ZW50VHJhY2luZ1dpbmRvdyA9IHRoaXMub3BlbkNoaWxkV2luZG93KG51bGwsICdjaHJvbWU6Ly90cmFjaW5nJywge1xuXHRcdFx0XHRwYWludFdoZW5Jbml0aWFsbHlIaWRkZW46IGZhbHNlLFxuXHRcdFx0XHR3ZWJQcmVmZXJlbmNlczoge1xuXHRcdFx0XHRcdGJhY2tncm91bmRUaHJvdHRsaW5nOiBmYWxzZVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnRlbnRUcmFjaW5nV2luZG93LndlYkNvbnRlbnRzLm9uY2UoJ2RpZC1maW5pc2gtbG9hZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gTW9jayB3aW5kb3cucHJvbXB0IHRvIHN1cHBvcnQgc2F2ZSBhY3Rpb24gZnJvbSB0aGUgdHJhY2luZyBVSVxuXHRcdFx0XHQvLyBzaW5jZSBFbGVjdHJvbiBieSBkZWZhdWx0IGRvZXNuJ3QgcHJvdmlkZSB0aGUgYXBpLlxuXHRcdFx0XHQvLyBTZWUgcmVxdWVzdEZpbGVuYW1lXyBpbXBsZW1lbnRhdGlvbiB1bmRlclxuXHRcdFx0XHQvLyBodHRwczovL3NvdXJjZS5jaHJvbWl1bS5vcmcvY2hyb21pdW0vY2hyb21pdW0vc3JjLysvbWFpbjp0aGlyZF9wYXJ0eS9jYXRhcHVsdC90cmFjaW5nL3RyYWNpbmcvdWkvZXh0cmFzL2Fib3V0X3RyYWNpbmcvcHJvZmlsaW5nX3ZpZXcuaHRtbDtsPTMzNC0zNzlcblx0XHRcdFx0YXdhaXQgY29udGVudFRyYWNpbmdXaW5kb3cud2ViQ29udGVudHMuZXhlY3V0ZUphdmFTY3JpcHQoYFxuXHRcdFx0XHRcdHdpbmRvdy5wcm9tcHQgPSAoKSA9PiAnJztcblx0XHRcdFx0XHRudWxsXG5cdFx0XHRcdGApO1xuXHRcdFx0XHRjb250ZW50VHJhY2luZ1dpbmRvdy5zaG93KCk7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnRlbnRUcmFjaW5nV2luZG93Lm9uY2UoJ2Nsb3NlJywgKCkgPT4gdGhpcy5jb250ZW50VHJhY2luZ1dpbmRvd0lkID0gdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuY29udGVudFRyYWNpbmdXaW5kb3dJZCA9IGNvbnRlbnRUcmFjaW5nV2luZG93LmlkO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdGhpcy5jb250ZW50VHJhY2luZ1dpbmRvd0lkID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3Qgd2luZG93ID0gQnJvd3NlcldpbmRvdy5mcm9tSWQodGhpcy5jb250ZW50VHJhY2luZ1dpbmRvd0lkKTtcblx0XHRcdGlmICh3aW5kb3c/LmlzTWluaW1pemVkKCkpIHtcblx0XHRcdFx0d2luZG93Py5yZXN0b3JlKCk7XG5cdFx0XHR9XG5cdFx0XHR3aW5kb3c/LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaXNUcmFjaW5nID0gZmFsc2U7XG5cblx0YXN5bmMgc3RhcnRUcmFjaW5nKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGNhdGVnb3JpZXM6IHN0cmluZywgb3B0aW9ucz86IElTdGFydFRyYWNpbmdPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2lzVHJhY2luZykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCd0cmFjaW5nLmFscmVhZHlJblByb2dyZXNzJywgJ0EgdHJhY2luZyBzZXNzaW9uIGlzIGFscmVhZHkgaW4gcHJvZ3Jlc3MuIFVzZSBjb21tYW5kIGBcInswfVwiYCB0byBzdG9wIGl0IGZpcnN0LicsICd3b3JrYmVuY2guYWN0aW9uLnN0b3BUcmFjaW5nJykpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy5lbmFibGVIZWFwUHJvZmlsaW5nKSB7XG5cdFx0XHRhd2FpdCBjb250ZW50VHJhY2luZy5lbmFibGVIZWFwUHJvZmlsaW5nKCk7XG5cdFx0XHRhd2FpdCBjb250ZW50VHJhY2luZy5zdGFydFJlY29yZGluZyh7XG5cdFx0XHRcdHJlY29yZGluZ19tb2RlOiAncmVjb3JkLXVudGlsLWZ1bGwnLFxuXHRcdFx0XHRpbmNsdWRlZF9jYXRlZ29yaWVzOiBjYXRlZ29yaWVzLnNwbGl0KCcsJyksXG5cdFx0XHRcdG1lbW9yeV9kdW1wX2NvbmZpZzoge1xuXHRcdFx0XHRcdHRyaWdnZXJzOiBbXG5cdFx0XHRcdFx0XHR7IG1vZGU6ICdkZXRhaWxlZCcsIHR5cGU6ICdwZXJpb2RpY19pbnRlcnZhbCcsIHBlcmlvZGljX2ludGVydmFsX21zOiAxMDAwMCB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdHJhY2VPcHRpb25zID0gWydyZWNvcmQtdW50aWwtZnVsbCcsICdlbmFibGUtc2FtcGxpbmcnXTtcblxuXHRcdFx0YXdhaXQgY29udGVudFRyYWNpbmcuc3RhcnRSZWNvcmRpbmcoe1xuXHRcdFx0XHRjYXRlZ29yeUZpbHRlcjogY2F0ZWdvcmllcyxcblx0XHRcdFx0dHJhY2VPcHRpb25zOiB0cmFjZU9wdGlvbnMuam9pbignLCcpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9pc1RyYWNpbmcgPSB0cnVlO1xuXHR9XG5cblx0YXN5bmMgc3RvcFRyYWNpbmcod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5faXNUcmFjaW5nICYmICF0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJncy50cmFjZSkge1xuXHRcdFx0cmV0dXJuOyAvLyBubyB0cmFjaW5nIGluIHByb2dyZXNzXG5cdFx0fVxuXG5cdFx0dGhpcy5faXNUcmFjaW5nID0gZmFsc2U7XG5cblx0XHRjb25zdCBwYXRoID0gYXdhaXQgY29udGVudFRyYWNpbmcuc3RvcFJlY29yZGluZyhgJHtyYW5kb21QYXRoKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS51c2VySG9tZS5mc1BhdGgsIHRoaXMucHJvZHVjdFNlcnZpY2UuYXBwbGljYXRpb25OYW1lKX0udHJhY2UudHh0YCk7XG5cblx0XHQvLyBJbmZvcm0gdXNlciB0byByZXBvcnQgYW4gaXNzdWVcblx0XHRhd2FpdCB0aGlzLmRpYWxvZ01haW5TZXJ2aWNlLnNob3dNZXNzYWdlQm94KHtcblx0XHRcdHR5cGU6ICdpbmZvJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd0cmFjZS5tZXNzYWdlJywgXCJTdWNjZXNzZnVsbHkgY3JlYXRlZCB0aGUgdHJhY2UgZmlsZVwiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3RyYWNlLmRldGFpbCcsIFwiUGxlYXNlIGNyZWF0ZSBhbiBpc3N1ZSBhbmQgbWFudWFsbHkgYXR0YWNoIHRoZSBmb2xsb3dpbmcgZmlsZTpcXG57MH1cIiwgcGF0aCksXG5cdFx0XHRidXR0b25zOiBbbG9jYWxpemUoeyBrZXk6ICd0cmFjZS5vaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk9LXCIpXSxcblx0XHR9LCBCcm93c2VyV2luZG93LmdldEZvY3VzZWRXaW5kb3coKSA/PyB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gU2hvdyBpdGVtIGluIGV4cGxvcmVyXG5cdFx0dGhpcy5zaG93SXRlbUluRm9sZGVyKHVuZGVmaW5lZCwgcGF0aCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIFBlcmZvcm1hbmNlXG5cblx0YXN5bmMgcHJvZmlsZVJlbmRlcmVyKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHNlc3Npb246IHN0cmluZywgZHVyYXRpb246IG51bWJlcik6IFByb21pc2U8SVY4UHJvZmlsZT4ge1xuXHRcdGNvbnN0IHdpbmRvdyA9IHRoaXMuY29kZVdpbmRvd0J5SWQod2luZG93SWQpO1xuXHRcdGlmICghd2luZG93Py53aW4pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2ZpbGVyID0gbmV3IFdpbmRvd1Byb2ZpbGVyKHdpbmRvdy53aW4sIHNlc3Npb24sIHRoaXMubG9nU2VydmljZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvZmlsZXIuaW5zcGVjdChkdXJhdGlvbik7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gVG9hc3QgTm90aWZpY2F0aW9uc1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlVG9hc3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblxuXHRhc3luYyBzaG93VG9hc3Qod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgb3B0aW9uczogSVRvYXN0T3B0aW9ucyk6IFByb21pc2U8SVRvYXN0UmVzdWx0PiB7XG5cdFx0aWYgKCFOb3RpZmljYXRpb24uaXNTdXBwb3J0ZWQoKSkge1xuXHRcdFx0cmV0dXJuIHsgc3VwcG9ydGVkOiBmYWxzZSwgY2xpY2tlZDogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRjb25zdCB0b2FzdCA9IG5ldyBOb3RpZmljYXRpb24oe1xuXHRcdFx0dGl0bGU6IG9wdGlvbnMudGl0bGUsXG5cdFx0XHRib2R5OiBvcHRpb25zLmJvZHksXG5cdFx0XHRzaWxlbnQ6IG9wdGlvbnMuc2lsZW50LFxuXHRcdFx0YWN0aW9uczogb3B0aW9ucy5hY3Rpb25zPy5tYXAoYWN0aW9uID0+ICh7XG5cdFx0XHRcdHR5cGU6ICdidXR0b24nLFxuXHRcdFx0XHR0ZXh0OiBhY3Rpb25cblx0XHRcdH0pKVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5hY3RpdmVUb2FzdHMuc2V0KG9wdGlvbnMuaWQsIGRpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmFjdGl2ZVRvYXN0cy5kZWxldGVBbmREaXNwb3NlKG9wdGlvbnMuaWQpO1xuXHRcdFx0dG9hc3QucmVtb3ZlQWxsTGlzdGVuZXJzKCk7XG5cdFx0XHR0b2FzdC5jbG9zZSgpO1xuXHRcdFx0Y3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPElUb2FzdFJlc3VsdD4ociA9PiB7XG5cdFx0XHRjb25zdCByZXNvbHZlID0gKHJlc3VsdDogSVRvYXN0UmVzdWx0KSA9PiB7XG5cdFx0XHRcdHIocmVzdWx0KTtcdFx0XHRcdC8vIGZpcnN0IHJldHVybiB0aGUgcmVzdWx0IGJlZm9yZS4uLlxuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XHQvLyAuLi5kaXNwb3Npbmcgd2hpY2ggd291bGQgaW52YWxpZGF0ZSB0aGUgcmVzdWx0IG9iamVjdFxuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGN0cy50b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiByZXNvbHZlKHsgc3VwcG9ydGVkOiB0cnVlLCBjbGlja2VkOiBmYWxzZSB9KSkpO1xuXG5cdFx0XHR0b2FzdC5vbignY2xpY2snLCAoKSA9PiByZXNvbHZlKHsgc3VwcG9ydGVkOiB0cnVlLCBjbGlja2VkOiB0cnVlIH0pKTtcblx0XHRcdHRvYXN0Lm9uKCdhY3Rpb24nLCAoX2V2ZW50LCBhY3Rpb25JbmRleCkgPT4gcmVzb2x2ZSh7IHN1cHBvcnRlZDogdHJ1ZSwgY2xpY2tlZDogdHJ1ZSwgYWN0aW9uSW5kZXggfSkpO1xuXHRcdFx0dG9hc3Qub24oJ2Nsb3NlJywgKCkgPT4gcmVzb2x2ZSh7IHN1cHBvcnRlZDogdHJ1ZSwgY2xpY2tlZDogZmFsc2UgfSkpO1xuXHRcdFx0dG9hc3Qub24oJ2ZhaWxlZCcsICgpID0+IHJlc29sdmUoeyBzdXBwb3J0ZWQ6IGZhbHNlLCBjbGlja2VkOiBmYWxzZSB9KSk7XG5cblx0XHRcdHRvYXN0LnNob3coKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyVG9hc3Qod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgdG9hc3RJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5hY3RpdmVUb2FzdHMuZGVsZXRlQW5kRGlzcG9zZSh0b2FzdElkKTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyVG9hc3RzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuYWN0aXZlVG9hc3RzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFJlZ2lzdHJ5ICh3aW5kb3dzKVxuXG5cdGFzeW5jIHdpbmRvd3NHZXRTdHJpbmdSZWdLZXkod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgaGl2ZTogJ0hLRVlfQ1VSUkVOVF9VU0VSJyB8ICdIS0VZX0xPQ0FMX01BQ0hJTkUnIHwgJ0hLRVlfQ0xBU1NFU19ST09UJyB8ICdIS0VZX1VTRVJTJyB8ICdIS0VZX0NVUlJFTlRfQ09ORklHJywgcGF0aDogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IFJlZ2lzdHJ5ID0gYXdhaXQgaW1wb3J0KCdAdnNjb2RlL3dpbmRvd3MtcmVnaXN0cnknKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIFJlZ2lzdHJ5LkdldFN0cmluZ1JlZ0tleShoaXZlLCBwYXRoLCBuYW1lKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFppcFxuXG5cdGFzeW5jIGNyZWF0ZVppcEZpbGUod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgemlwUGF0aDogVVJJLCBmaWxlczogSU5hdGl2ZVppcEZpbGVbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHppcCh6aXBQYXRoLmZzUGF0aCwgZmlsZXMubWFwKGZpbGUgPT4ge1xuXHRcdFx0aWYgKGhhc0tleShmaWxlLCB7IGNvbnRlbnRzOiB0cnVlIH0pKSB7XG5cdFx0XHRcdHJldHVybiBmaWxlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc291cmNlID0gVVJJLnJldml2ZShmaWxlLnNvdXJjZSk7XG5cdFx0XHRpZiAoc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGFkZCBub24tbG9jYWwgcmVzb3VyY2UgJyR7c291cmNlLnRvU3RyaW5nKCl9JyB0byBhIHppcCBmaWxlYCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBwYXRoOiBmaWxlLnBhdGgsIGxvY2FsUGF0aDogc291cmNlLmZzUGF0aCwgbG9jYWxQYXRoU2l6ZTogZmlsZS5zaXplIH07XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gUG93ZXJcblxuXHRhc3luYyBnZXRTeXN0ZW1JZGxlU3RhdGUod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgaWRsZVRocmVzaG9sZDogbnVtYmVyKTogUHJvbWlzZTxTeXN0ZW1JZGxlU3RhdGU+IHtcblx0XHRyZXR1cm4gcG93ZXJNb25pdG9yLmdldFN5c3RlbUlkbGVTdGF0ZShpZGxlVGhyZXNob2xkKTtcblx0fVxuXG5cdGFzeW5jIGdldFN5c3RlbUlkbGVUaW1lKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdHJldHVybiBwb3dlck1vbml0b3IuZ2V0U3lzdGVtSWRsZVRpbWUoKTtcblx0fVxuXG5cdGFzeW5jIGdldEN1cnJlbnRUaGVybWFsU3RhdGUod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8VGhlcm1hbFN0YXRlPiB7XG5cdFx0cmV0dXJuIHBvd2VyTW9uaXRvci5nZXRDdXJyZW50VGhlcm1hbFN0YXRlKCk7XG5cdH1cblxuXHRhc3luYyBpc09uQmF0dGVyeVBvd2VyKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gcG93ZXJNb25pdG9yLmlzT25CYXR0ZXJ5UG93ZXIoKTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0UG93ZXJTYXZlQmxvY2tlcih3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0eXBlOiBQb3dlclNhdmVCbG9ja2VyVHlwZSk6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0cmV0dXJuIHBvd2VyU2F2ZUJsb2NrZXIuc3RhcnQodHlwZSk7XG5cdH1cblxuXHRhc3luYyBzdG9wUG93ZXJTYXZlQmxvY2tlcih3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBpZDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHBvd2VyU2F2ZUJsb2NrZXIuc3RvcChpZCk7XG5cdH1cblxuXHRhc3luYyBpc1Bvd2VyU2F2ZUJsb2NrZXJTdGFydGVkKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGlkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gcG93ZXJTYXZlQmxvY2tlci5pc1N0YXJ0ZWQoaWQpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSB3aW5kb3dCeUlkKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIGZhbGxiYWNrQ29kZVdpbmRvd0lkPzogbnVtYmVyKTogSUNvZGVXaW5kb3cgfCBJQXV4aWxpYXJ5V2luZG93IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jb2RlV2luZG93QnlJZCh3aW5kb3dJZCkgPz8gdGhpcy5hdXhpbGlhcnlXaW5kb3dCeUlkKHdpbmRvd0lkKSA/PyB0aGlzLmNvZGVXaW5kb3dCeUlkKGZhbGxiYWNrQ29kZVdpbmRvd0lkKTtcblx0fVxuXG5cdHByaXZhdGUgY29kZVdpbmRvd0J5SWQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IElDb2RlV2luZG93IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodHlwZW9mIHdpbmRvd0lkICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93QnlJZCh3aW5kb3dJZCk7XG5cdH1cblxuXHRwcml2YXRlIGF1eGlsaWFyeVdpbmRvd0J5SWQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IElBdXhpbGlhcnlXaW5kb3cgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2Ygd2luZG93SWQgIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnRzID0gd2ViQ29udGVudHMuZnJvbUlkKHdpbmRvd0lkKTtcblx0XHRpZiAoIWNvbnRlbnRzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dCeVdlYkNvbnRlbnRzKGNvbnRlbnRzKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsS0FBSyxlQUFlLFdBQVcsZ0JBQXlCLE1BQWdELGNBQTZFLGNBQWMsa0JBQTRELFFBQVEsT0FBTyxtQkFBbUIsbUJBQW1CO0FBQzdULFNBQVMsTUFBTSxNQUFNLFNBQVMsU0FBUyxVQUFVLFNBQVMsVUFBVSxZQUFZO0FBQ2hGLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksZUFBZSxpQkFBaUIsb0JBQW9CO0FBQ3pFLFNBQVMsbUJBQW1CLGVBQWU7QUFDM0MsU0FBUyxTQUFTLE1BQU0sT0FBTyxTQUFTLGFBQWE7QUFDckQsU0FBUyxTQUFTLGFBQWEsaUJBQWlCO0FBQ2hELFNBQXVDLGNBQWM7QUFDckQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsVUFBVSxzQkFBc0I7QUFDekMsU0FBUyxjQUFjLGtCQUFrQjtBQUN6QyxTQUFTLGdCQUFnQjtBQUd6QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGlCQUFpQiw2QkFBNkI7QUFDdkQsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBeVU7QUFDbFYsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBdUM7QUFFaEQsU0FBUyw2QkFBNkIscUJBQXFCLG1CQUFtQjtBQUM5RSxTQUFTLHVCQUF1Qiw2QkFBNkI7QUFDN0QsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxvQ0FBb0M7QUFF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QUFjLFFBQVE7QUFBQSxFQUN0RDtBQUFBLEVBRVEsb0JBQW9CLFVBQTREO0FBQ3ZGLFFBQUksT0FBTyxhQUFhLFVBQVU7QUFDakMsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFdBQVcsWUFBWSxPQUFPLFFBQVE7QUFDNUMsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sS0FBSyw0QkFBNEIsdUJBQXVCLFFBQVE7QUFBQSxFQUN4RTtBQUNEO0FBdnFCYTtBQUFBLEVBRFg7QUFBQSxHQXB3Qlcsc0JBcXdCQTtBQXJ3QkEsd0JBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbEJVOyIsCiAgIm5hbWVzIjogWyJ3aW5kb3ciLCAiZXJyb3IiLCAicmVzb2x2ZSIsICJ0eXBlIl0KfQo=
