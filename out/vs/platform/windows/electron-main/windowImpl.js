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
import electron, { screen } from "electron";
import { DeferredPromise, RunOnceScheduler, timeout, Delayer } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { FileAccess, Schemas } from "../../../base/common/network.js";
import { getMarks, mark } from "../../../base/common/performance.js";
import { isTahoeOrNewer, isLinux, isMacintosh, isWindows } from "../../../base/common/platform.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { release } from "os";
import { IBackupMainService } from "../../backup/electron-main/backup.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IDialogMainService } from "../../dialogs/electron-main/dialogMainService.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { isLaunchedFromCli } from "../../environment/node/argvHelper.js";
import { IFileService } from "../../files/common/files.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { IProtocolMainService } from "../../protocol/electron-main/protocol.js";
import { resolveMarketplaceHeaders } from "../../externalServices/common/marketplace.js";
import { IApplicationStorageMainService, IStorageMainService } from "../../storage/electron-main/storageMainService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { IThemeMainService } from "../../theme/electron-main/themeMainService.js";
import { getMenuBarVisibility, hasNativeTitlebar, useNativeFullScreen, useWindowControlsOverlay, DEFAULT_CUSTOM_TITLEBAR_HEIGHT, TitlebarStyle, MenuSettings } from "../../window/common/window.js";
import { defaultBrowserWindowOptions, getAllWindowsExcludingOffscreen, IWindowsMainService, OpenContext, WindowStateValidator } from "./windows.js";
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, toWorkspaceIdentifier } from "../../workspace/common/workspace.js";
import { IWorkspacesManagementMainService } from "../../workspaces/electron-main/workspacesManagementMainService.js";
import { WindowMode, WindowError, LoadReason, defaultWindowState } from "../../window/electron-main/window.js";
import { IPolicyService } from "../../policy/common/policy.js";
import { IStateService } from "../../state/node/state.js";
import { IUserDataProfilesMainService } from "../../userDataProfile/electron-main/userDataProfile.js";
import { ILoggerMainService } from "../../log/electron-main/loggerService.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { errorHandler } from "../../../base/common/errors.js";
import { FocusMode } from "../../native/common/native.js";
import { Color } from "../../../base/common/color.js";
var ReadyState = /* @__PURE__ */ ((ReadyState2) => {
  ReadyState2[ReadyState2["NONE"] = 0] = "NONE";
  ReadyState2[ReadyState2["NAVIGATING"] = 1] = "NAVIGATING";
  ReadyState2[ReadyState2["READY"] = 2] = "READY";
  return ReadyState2;
})(ReadyState || {});
const _DockBadgeManager = class _DockBadgeManager {
  constructor() {
    this.windows = /* @__PURE__ */ new Set();
  }
  acquireBadge(window) {
    this.windows.add(window.id);
    electron.app.setBadgeCount(
      isLinux ? 1 : void 0
      /* generic dot */
    );
    return {
      dispose: () => {
        this.windows.delete(window.id);
        if (this.windows.size === 0) {
          electron.app.setBadgeCount(0);
        }
      }
    };
  }
};
_DockBadgeManager.INSTANCE = new _DockBadgeManager();
let DockBadgeManager = _DockBadgeManager;
const _BaseWindow = class _BaseWindow extends Disposable {
  constructor(configurationService, stateService, environmentMainService, logService) {
    super();
    this.configurationService = configurationService;
    this.stateService = stateService;
    this.environmentMainService = environmentMainService;
    this.logService = logService;
    //#region Events
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._onDidMaximize = this._register(new Emitter());
    this.onDidMaximize = this._onDidMaximize.event;
    this._onDidUnmaximize = this._register(new Emitter());
    this.onDidUnmaximize = this._onDidUnmaximize.event;
    this._onDidTriggerSystemContextMenu = this._register(new Emitter());
    this.onDidTriggerSystemContextMenu = this._onDidTriggerSystemContextMenu.event;
    this._onDidEnterFullScreen = this._register(new Emitter());
    this.onDidEnterFullScreen = this._onDidEnterFullScreen.event;
    this._onDidLeaveFullScreen = this._register(new Emitter());
    this.onDidLeaveFullScreen = this._onDidLeaveFullScreen.event;
    this._onDidChangeAlwaysOnTop = this._register(new Emitter());
    this.onDidChangeAlwaysOnTop = this._onDidChangeAlwaysOnTop.event;
    this._lastFocusTime = Date.now();
    this._win = null;
    this.notifyFocusDisposable = this._register(new MutableDisposable());
    this.windowControlsDimmed = false;
    //#endregion
    //#region Fullscreen
    this.transientIsNativeFullScreen = void 0;
    this.joinNativeFullScreenTransition = void 0;
  }
  // window is shown on creation so take current time
  get lastFocusTime() {
    return this._lastFocusTime;
  }
  get win() {
    return this._win;
  }
  setWin(win, options) {
    this._win = win;
    this._register(Event.fromNodeEventEmitter(win, "maximize")(() => {
      if (isWindows && this.environmentMainService.enableRDPDisplayTracking && this._win) {
        const [x, y] = this._win.getPosition();
        const [width, height] = this._win.getSize();
        this.maximizedWindowState = { mode: WindowMode.Maximized, width, height, x, y };
        this.logService.debug(`Saved maximized window ${this.id} display state:`, this.maximizedWindowState);
      }
      this._onDidMaximize.fire();
    }));
    this._register(Event.fromNodeEventEmitter(win, "unmaximize")(() => {
      if (isWindows && this.environmentMainService.enableRDPDisplayTracking && this.maximizedWindowState) {
        this.maximizedWindowState = void 0;
        this.logService.debug(`Cleared maximized window ${this.id} state`);
      }
      this._onDidUnmaximize.fire();
    }));
    this._register(Event.fromNodeEventEmitter(win, "closed")(() => {
      this._onDidClose.fire();
      this.dispose();
    }));
    this._register(Event.fromNodeEventEmitter(win, "focus")(() => {
      this.clearNotifyFocus();
      this._lastFocusTime = Date.now();
    }));
    this._register(Event.fromNodeEventEmitter(this._win, "enter-full-screen")(() => this._onDidEnterFullScreen.fire()));
    this._register(Event.fromNodeEventEmitter(this._win, "leave-full-screen")(() => this._onDidLeaveFullScreen.fire()));
    this._register(Event.fromNodeEventEmitter(this._win, "always-on-top-changed", (_, alwaysOnTop) => alwaysOnTop)((alwaysOnTop) => this._onDidChangeAlwaysOnTop.fire(alwaysOnTop)));
    const useCustomTitleStyle = !hasNativeTitlebar(
      this.configurationService,
      options?.titleBarStyle === "hidden" ? TitlebarStyle.CUSTOM : void 0
      /* unknown */
    );
    if (isMacintosh && useCustomTitleStyle) {
      win.setSheetOffset(isTahoeOrNewer(release()) ? 32 : 28);
    }
    if (useCustomTitleStyle && useWindowControlsOverlay(this.configurationService)) {
      const cachedWindowControlHeight = this.stateService.getItem(_BaseWindow.windowControlHeightStateStorageKey);
      if (cachedWindowControlHeight) {
        this.updateWindowControls({ height: cachedWindowControlHeight });
      } else {
        this.updateWindowControls({ height: DEFAULT_CUSTOM_TITLEBAR_HEIGHT });
      }
    }
    if ((isWindows || isLinux) && useCustomTitleStyle) {
      this._register(Event.fromNodeEventEmitter(win, "system-context-menu", (event, point) => ({ event, point }))((e) => {
        const [x, y] = win.getPosition();
        const cursorPos = electron.screen.screenToDipPoint(e.point);
        const cx = Math.floor(cursorPos.x) - x;
        const cy = Math.floor(cursorPos.y) - y;
        if (isLinux) {
          if (cx > 35) {
            e.event.preventDefault();
            this._onDidTriggerSystemContextMenu.fire({ x: cx, y: cy });
          }
        }
      }));
    }
    if (this.environmentMainService.args["open-devtools"] === true) {
      win.webContents.openDevTools();
    }
    if (isMacintosh) {
      this._register(this.onDidEnterFullScreen(() => {
        this.joinNativeFullScreenTransition?.complete(true);
      }));
      this._register(this.onDidLeaveFullScreen(() => {
        this.joinNativeFullScreenTransition?.complete(true);
      }));
    }
    if (isWindows && this.environmentMainService.enableRDPDisplayTracking) {
      this._register(Event.fromNodeEventEmitter(screen, "display-added", (event, display) => ({ event, display }))((e) => {
        this.onDisplayAdded(e.display);
      }));
    }
  }
  onDisplayAdded(display) {
    const state = this.maximizedWindowState;
    if (state && this._win && WindowStateValidator.validateWindowStateOnDisplay(state, display)) {
      this.logService.debug(`Setting maximized window ${this.id} bounds to match newly added display`, state);
      this._win.setBounds(state);
    }
  }
  applyState(state, hasMultipleDisplays = electron.screen.getAllDisplays().length > 0) {
    const windowSettings = this.configurationService.getValue("window");
    const useNativeTabs = isMacintosh && windowSettings?.nativeTabs === true;
    if ((isMacintosh || isWindows) && hasMultipleDisplays && (!useNativeTabs || getAllWindowsExcludingOffscreen().length === 1)) {
      if ([state.width, state.height, state.x, state.y].every((value) => typeof value === "number")) {
        this._win?.setBounds({
          width: state.width,
          height: state.height,
          x: state.x,
          y: state.y
        });
      }
    }
    if (state.mode === WindowMode.Maximized || state.mode === WindowMode.Fullscreen) {
      this._win?.maximize();
      if (state.mode === WindowMode.Fullscreen) {
        this.setFullScreen(true, true);
      }
      this._win?.show();
    }
  }
  setRepresentedFilename(filename) {
    if (isMacintosh) {
      this.win?.setRepresentedFilename(filename);
    } else {
      this.representedFilename = filename;
    }
  }
  getRepresentedFilename() {
    if (isMacintosh) {
      return this.win?.getRepresentedFilename();
    }
    return this.representedFilename;
  }
  setDocumentEdited(edited) {
    if (isMacintosh) {
      this.win?.setDocumentEdited(edited);
    }
    this.documentEdited = edited;
  }
  isDocumentEdited() {
    if (isMacintosh) {
      return Boolean(this.win?.isDocumentEdited());
    }
    return !!this.documentEdited;
  }
  focus(options) {
    switch (options?.mode ?? FocusMode.Transfer) {
      case FocusMode.Transfer:
        this.doFocusWindow();
        break;
      case FocusMode.Notify:
        this.showNotifyFocus();
        break;
      case FocusMode.Force:
        if (isMacintosh) {
          electron.app.focus({ steal: true });
        }
        this.doFocusWindow();
        break;
    }
  }
  showNotifyFocus() {
    const disposables = new DisposableStore();
    this.notifyFocusDisposable.value = disposables;
    disposables.add(DockBadgeManager.INSTANCE.acquireBadge(this));
    if (isWindows || isLinux) {
      this.win?.flashFrame(true);
      disposables.add(toDisposable(() => this.win?.flashFrame(false)));
    } else if (isMacintosh) {
      electron.app.dock?.bounce("informational");
    }
  }
  clearNotifyFocus() {
    this.notifyFocusDisposable.clear();
  }
  doFocusWindow() {
    const win = this.win;
    if (!win) {
      return;
    }
    if (win.isMinimized()) {
      win.restore();
    }
    win.focus();
    win.webContents.focus();
  }
  updateWindowControls(options) {
    const win = this.win;
    if (!win) {
      return;
    }
    if (options.height) {
      this.stateService.setItem(CodeWindow.windowControlHeightStateStorageKey, options.height);
    }
    if (!isMacintosh && useWindowControlsOverlay(this.configurationService)) {
      if (options.dimmed !== void 0) {
        this.windowControlsDimmed = options.dimmed;
      }
      const backgroundColor = options.backgroundColor ?? this.lastWindowControlColors?.backgroundColor;
      const foregroundColor = options.foregroundColor ?? this.lastWindowControlColors?.foregroundColor;
      if (options.backgroundColor !== void 0 || options.foregroundColor !== void 0) {
        this.lastWindowControlColors = { backgroundColor, foregroundColor };
      }
      const effectiveBackgroundColor = this.windowControlsDimmed && backgroundColor ? this.dimColor(backgroundColor) : backgroundColor;
      const effectiveForegroundColor = this.windowControlsDimmed && foregroundColor ? this.dimColor(foregroundColor) : foregroundColor;
      win.setTitleBarOverlay({
        color: effectiveBackgroundColor?.trim() === "" ? void 0 : effectiveBackgroundColor,
        symbolColor: effectiveForegroundColor?.trim() === "" ? void 0 : effectiveForegroundColor,
        height: options.height ? options.height - 1 : void 0
        // account for window border
      });
    } else if (isMacintosh && options.height !== void 0) {
      const buttonHeight = isTahoeOrNewer(release()) ? 14 : 16;
      const offset = Math.floor((options.height - buttonHeight) / 2);
      if (!offset) {
        win.setWindowButtonPosition(null);
      } else {
        win.setWindowButtonPosition({ x: offset + 1, y: offset });
      }
    }
  }
  dimColor(color) {
    const parsed = Color.Format.CSS.parse(color);
    if (!parsed) {
      return color;
    }
    const dimFactor = 0.5;
    const r = Math.round(parsed.rgba.r * dimFactor);
    const g = Math.round(parsed.rgba.g * dimFactor);
    const b = Math.round(parsed.rgba.b * dimFactor);
    return `rgb(${r}, ${g}, ${b})`;
  }
  toggleFullScreen() {
    this.setFullScreen(!this.isFullScreen, false);
  }
  setFullScreen(fullscreen, fromRestore) {
    if (useNativeFullScreen(this.configurationService)) {
      this.setNativeFullScreen(fullscreen, fromRestore);
    } else {
      this.setSimpleFullScreen(fullscreen);
    }
  }
  get isFullScreen() {
    if (isMacintosh && typeof this.transientIsNativeFullScreen === "boolean") {
      return this.transientIsNativeFullScreen;
    }
    const win = this.win;
    const isFullScreen = win?.isFullScreen();
    const isSimpleFullScreen = win?.isSimpleFullScreen();
    return Boolean(isFullScreen || isSimpleFullScreen);
  }
  setNativeFullScreen(fullscreen, fromRestore) {
    const win = this.win;
    if (win?.isSimpleFullScreen()) {
      win?.setSimpleFullScreen(false);
    }
    this.doSetNativeFullScreen(fullscreen, fromRestore);
  }
  doSetNativeFullScreen(fullscreen, fromRestore) {
    if (isMacintosh) {
      this.transientIsNativeFullScreen = fullscreen;
      const joinNativeFullScreenTransition = this.joinNativeFullScreenTransition = new DeferredPromise();
      (async () => {
        const transitioned = await Promise.race([
          joinNativeFullScreenTransition.p,
          timeout(1e4).then(() => false)
        ]);
        if (this.joinNativeFullScreenTransition !== joinNativeFullScreenTransition) {
          return;
        }
        this.transientIsNativeFullScreen = void 0;
        this.joinNativeFullScreenTransition = void 0;
        if (!transitioned && fullscreen && fromRestore && this.win && !this.win.isFullScreen()) {
          this.logService.warn("window: native macOS fullscreen transition did not happen within 10s from restoring");
          this._onDidLeaveFullScreen.fire();
        }
      })();
    }
    const win = this.win;
    win?.setFullScreen(fullscreen);
  }
  setSimpleFullScreen(fullscreen) {
    const win = this.win;
    if (win?.isFullScreen()) {
      this.doSetNativeFullScreen(false, false);
    }
    win?.setSimpleFullScreen(fullscreen);
    win?.webContents.focus();
  }
  dispose() {
    super.dispose();
    this._win = null;
  }
};
//#region Window Control Overlays
_BaseWindow.windowControlHeightStateStorageKey = "windowControlHeight";
let BaseWindow = _BaseWindow;
let CodeWindow = class extends BaseWindow {
  constructor(config, logService, loggerMainService, environmentMainService, policyService, userDataProfilesService, fileService, applicationStorageMainService, storageMainService, configurationService, themeMainService, workspacesManagementMainService, backupMainService, telemetryService, dialogMainService, lifecycleMainService, productService, protocolMainService, windowsMainService, stateService, instantiationService) {
    super(configurationService, stateService, environmentMainService, logService);
    this.loggerMainService = loggerMainService;
    this.policyService = policyService;
    this.userDataProfilesService = userDataProfilesService;
    this.fileService = fileService;
    this.applicationStorageMainService = applicationStorageMainService;
    this.storageMainService = storageMainService;
    this.themeMainService = themeMainService;
    this.workspacesManagementMainService = workspacesManagementMainService;
    this.backupMainService = backupMainService;
    this.telemetryService = telemetryService;
    this.dialogMainService = dialogMainService;
    this.lifecycleMainService = lifecycleMainService;
    this.productService = productService;
    this.windowsMainService = windowsMainService;
    //#region Events
    this._onWillLoad = this._register(new Emitter());
    this.onWillLoad = this._onWillLoad.event;
    this._onDidSignalReady = this._register(new Emitter());
    this.onDidSignalReady = this._onDidSignalReady.event;
    this._onDidDestroy = this._register(new Emitter());
    this.onDidDestroy = this._onDidDestroy.event;
    this.whenReadyCallbacks = [];
    this.touchBarGroups = [];
    this.currentHttpProxy = void 0;
    this.currentNoProxy = void 0;
    this.customZoomLevel = void 0;
    this.wasLoaded = false;
    this.readyState = 0 /* NONE */;
    this.swipeListenerDisposable = this._register(new MutableDisposable());
    {
      this.configObjectUrl = this._register(protocolMainService.createIPCObjectUrl());
      const [state, hasMultipleDisplays] = this.restoreWindowState(config.state);
      this.windowState = state;
      this.logService.trace("window#ctor: using window state", state);
      const webPreferences = {
        preload: FileAccess.asFileUri("vs/base/parts/sandbox/electron-browser/preload.js").fsPath,
        additionalArguments: [`--vscode-window-config=${this.configObjectUrl.resource.toString()}`],
        v8CacheOptions: this.environmentMainService.useCodeCache ? "bypassHeatCheck" : "none"
      };
      if (config.isSessionsWindow) {
        webPreferences.backgroundThrottling = false;
      }
      const options = instantiationService.invokeFunction(defaultBrowserWindowOptions, this.windowState, void 0, webPreferences);
      mark("code/willCreateCodeBrowserWindow");
      this._win = new electron.BrowserWindow(options);
      mark("code/didCreateCodeBrowserWindow");
      this._id = this._win.id;
      this.setWin(this._win, options);
      this.applyState(this.windowState, hasMultipleDisplays);
      this._lastFocusTime = Date.now();
    }
    let sampleInterval = parseInt(this.environmentMainService.args["unresponsive-sample-interval"] || "1000");
    let samplePeriod = parseInt(this.environmentMainService.args["unresponsive-sample-period"] || "15000");
    if (sampleInterval <= 0 || samplePeriod <= 0 || sampleInterval > samplePeriod) {
      this.logService.warn(`Invalid unresponsive sample interval (${sampleInterval}ms) or period (${samplePeriod}ms), using defaults.`);
      sampleInterval = 1e3;
      samplePeriod = 15e3;
    }
    this.jsCallStackMap = /* @__PURE__ */ new Map();
    this.jsCallStackEffectiveSampleCount = Math.round(samplePeriod / sampleInterval);
    this.jsCallStackCollector = this._register(new Delayer(sampleInterval));
    this.jsCallStackCollectorStopScheduler = this._register(new RunOnceScheduler(() => {
      this.stopCollectingJScallStacks();
    }, samplePeriod));
    this.onConfigurationUpdated();
    this.createTouchBar();
    this.registerListeners();
  }
  get id() {
    return this._id;
  }
  get backupPath() {
    return this._config?.backupPath;
  }
  get openedWorkspace() {
    return this._config?.workspace;
  }
  get profile() {
    if (!this.config) {
      return void 0;
    }
    const profile = this.userDataProfilesService.profiles.find((profile2) => profile2.id === this.config?.profiles.profile.id);
    if (this.isExtensionDevelopmentHost && profile) {
      return profile;
    }
    return this.userDataProfilesService.getProfileForWorkspace(this.config.workspace ?? toWorkspaceIdentifier(this.backupPath, this.isExtensionDevelopmentHost)) ?? this.userDataProfilesService.defaultProfile;
  }
  get remoteAuthority() {
    return this._config?.remoteAuthority;
  }
  get config() {
    return this._config;
  }
  get isExtensionDevelopmentHost() {
    return !!this._config?.extensionDevelopmentPath;
  }
  get isExtensionTestHost() {
    return !!this._config?.extensionTestsPath;
  }
  get isExtensionDevelopmentTestFromCli() {
    return this.isExtensionDevelopmentHost && this.isExtensionTestHost && !this._config?.debugId;
  }
  setReady() {
    this.logService.trace(`window#load: window reported ready (id: ${this._id})`);
    this.readyState = 2 /* READY */;
    while (this.whenReadyCallbacks.length) {
      this.whenReadyCallbacks.pop()(this);
    }
    this._onDidSignalReady.fire();
  }
  ready() {
    return new Promise((resolve) => {
      if (this.isReady) {
        return resolve(this);
      }
      this.whenReadyCallbacks.push(resolve);
    });
  }
  get isReady() {
    return this.readyState === 2 /* READY */;
  }
  get whenClosedOrLoaded() {
    return new Promise((resolve) => {
      function handle() {
        closeListener.dispose();
        loadListener.dispose();
        resolve();
      }
      const closeListener = this.onDidClose(() => handle());
      const loadListener = this.onWillLoad(() => handle());
    });
  }
  registerListeners() {
    this._register(Event.fromNodeEventEmitter(this._win, "unresponsive")(() => this.onWindowError(WindowError.UNRESPONSIVE)));
    this._register(Event.fromNodeEventEmitter(this._win, "responsive")(() => this.onWindowError(WindowError.RESPONSIVE)));
    this._register(Event.fromNodeEventEmitter(this._win.webContents, "render-process-gone", (event, details) => details)((details) => this.onWindowError(WindowError.PROCESS_GONE, { ...details })));
    this._register(Event.fromNodeEventEmitter(this._win.webContents, "did-fail-load", (event, exitCode, reason) => ({ exitCode, reason }))(({ exitCode, reason }) => this.onWindowError(WindowError.LOAD, { reason, exitCode })));
    this._register(Event.fromNodeEventEmitter(this._win.webContents, "will-prevent-unload")((event) => event.preventDefault()));
    this._register(Event.fromNodeEventEmitter(this._win.webContents, "did-finish-load")(() => {
      if (this.pendingLoadConfig) {
        this._config = this.pendingLoadConfig;
        this.pendingLoadConfig = void 0;
      }
    }));
    this._register(this.onDidMaximize(() => {
      if (this._config) {
        this._config.maximized = true;
      }
    }));
    this._register(this.onDidUnmaximize(() => {
      if (this._config) {
        this._config.maximized = false;
      }
    }));
    this._register(this.onDidEnterFullScreen(() => {
      this.sendWhenReady("vscode:enterFullScreen", CancellationToken.None);
    }));
    this._register(this.onDidLeaveFullScreen(() => {
      this.sendWhenReady("vscode:leaveFullScreen", CancellationToken.None);
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
    this._register(this.workspacesManagementMainService.onDidDeleteUntitledWorkspace((e) => this.onDidDeleteUntitledWorkspace(e)));
    const urls = ["https://*.vsassets.io/*"];
    if (this.productService.extensionsGallery?.serviceUrl) {
      const serviceUrl = URI.parse(this.productService.extensionsGallery.serviceUrl);
      urls.push(`${serviceUrl.scheme}://${serviceUrl.authority}/*`);
    }
    this._win.webContents.session.webRequest.onBeforeSendHeaders({ urls }, async (details, cb) => {
      const headers = await this.getMarketplaceHeaders();
      cb({ cancel: false, requestHeaders: Object.assign(details.requestHeaders, headers) });
    });
  }
  getMarketplaceHeaders() {
    if (!this.marketplaceHeadersPromise) {
      this.marketplaceHeadersPromise = resolveMarketplaceHeaders(
        this.productService.version,
        this.productService,
        this.environmentMainService,
        this.configurationService,
        this.fileService,
        this.applicationStorageMainService,
        this.telemetryService
      );
    }
    return this.marketplaceHeadersPromise;
  }
  async onWindowError(type, details) {
    switch (type) {
      case WindowError.PROCESS_GONE:
        this.logService.error(`CodeWindow: renderer process gone (reason: ${details?.reason || "<unknown>"}, code: ${details?.exitCode || "<unknown>"})`);
        break;
      case WindowError.UNRESPONSIVE:
        this.logService.error("CodeWindow: detected unresponsive");
        break;
      case WindowError.RESPONSIVE:
        this.logService.error("CodeWindow: recovered from unresponsive");
        break;
      case WindowError.LOAD:
        this.logService.error(`CodeWindow: failed to load (reason: ${details?.reason || "<unknown>"}, code: ${details?.exitCode || "<unknown>"})`);
        break;
    }
    this.telemetryService.publicLog2("windowerror", {
      type,
      reason: details?.reason,
      code: details?.exitCode
    });
    switch (type) {
      case WindowError.UNRESPONSIVE:
      case WindowError.PROCESS_GONE:
        if (this.isExtensionDevelopmentTestFromCli) {
          this.lifecycleMainService.kill(1);
          return;
        }
        if (this.environmentMainService.args["enable-smoke-test-driver"]) {
          await this.destroyWindow(false, false);
          this.lifecycleMainService.quit();
          return;
        }
        if (type === WindowError.UNRESPONSIVE) {
          if (this.isExtensionDevelopmentHost || this.isExtensionTestHost || this._win?.webContents?.isDevToolsOpened()) {
            return;
          }
          this.jsCallStackCollector.trigger(() => this.startCollectingJScallStacks());
          this.jsCallStackCollectorStopScheduler.schedule();
          const { response, checkboxChecked } = await this.dialogMainService.showMessageBox({
            type: "warning",
            buttons: [
              localize({ key: "reopen", comment: ["&& denotes a mnemonic"] }, "&&Reopen"),
              localize({ key: "close", comment: ["&& denotes a mnemonic"] }, "&&Close"),
              localize({ key: "wait", comment: ["&& denotes a mnemonic"] }, "&&Keep Waiting")
            ],
            message: localize("appStalled", "The window is not responding"),
            detail: localize("appStalledDetail", "You can reopen or close the window or keep waiting."),
            checkboxLabel: this._config?.workspace ? localize("doNotRestoreEditors", "Don't restore editors") : void 0
          }, this._win);
          if (response !== 2) {
            const reopen = response === 0;
            this.stopCollectingJScallStacks();
            await this.destroyWindow(reopen, checkboxChecked);
          }
        } else if (type === WindowError.PROCESS_GONE) {
          let message;
          if (!details) {
            message = localize("appGone", "The window terminated unexpectedly");
          } else {
            message = localize("appGoneDetails", "The window terminated unexpectedly (reason: '{0}', code: '{1}')", details.reason, details.exitCode ?? "<unknown>");
          }
          const { response, checkboxChecked } = await this.dialogMainService.showMessageBox({
            type: "warning",
            buttons: [
              this._config?.workspace ? localize({ key: "reopen", comment: ["&& denotes a mnemonic"] }, "&&Reopen") : localize({ key: "newWindow", comment: ["&& denotes a mnemonic"] }, "&&New Window"),
              localize({ key: "close", comment: ["&& denotes a mnemonic"] }, "&&Close")
            ],
            message,
            detail: this._config?.workspace ? localize("appGoneDetailWorkspace", "We are sorry for the inconvenience. You can reopen the window to continue where you left off.") : localize("appGoneDetailEmptyWindow", "We are sorry for the inconvenience. You can open a new empty window to start again."),
            checkboxLabel: this._config?.workspace ? localize("doNotRestoreEditors", "Don't restore editors") : void 0
          }, this._win);
          const reopen = response === 0;
          await this.destroyWindow(reopen, checkboxChecked);
        }
        break;
      case WindowError.RESPONSIVE:
        this.stopCollectingJScallStacks();
        break;
    }
  }
  async destroyWindow(reopen, skipRestoreEditors) {
    const workspace = this._config?.workspace;
    if (skipRestoreEditors && workspace) {
      try {
        const workspaceStorage = this.storageMainService.workspaceStorage(workspace);
        await workspaceStorage.init();
        workspaceStorage.delete("memento/workbench.parts.editor");
        await workspaceStorage.close();
      } catch (error) {
        this.logService.error(error);
      }
    }
    this._onDidDestroy.fire();
    try {
      if (reopen && this._config) {
        let uriToOpen = void 0;
        let forceEmpty = void 0;
        if (isSingleFolderWorkspaceIdentifier(workspace)) {
          uriToOpen = { folderUri: workspace.uri };
        } else if (isWorkspaceIdentifier(workspace)) {
          uriToOpen = { workspaceUri: workspace.configPath };
        } else {
          forceEmpty = true;
        }
        const window = (await this.windowsMainService.open({
          context: OpenContext.API,
          userEnv: this._config.userEnv,
          cli: {
            ...this.environmentMainService.args,
            _: []
            // we pass in the workspace to open explicitly via `urisToOpen`
          },
          urisToOpen: uriToOpen ? [uriToOpen] : void 0,
          forceEmpty,
          forceNewWindow: true,
          remoteAuthority: this.remoteAuthority
        })).at(0);
        window?.focus();
      }
    } finally {
      this._win?.destroy();
    }
  }
  onDidDeleteUntitledWorkspace(workspace) {
    if (this._config?.workspace?.id === workspace.id) {
      this._config.workspace = void 0;
    }
  }
  onConfigurationUpdated(e) {
    if (isMacintosh && (!e || e.affectsConfiguration("workbench.editor.swipeToNavigate"))) {
      const swipeToNavigate = this.configurationService.getValue("workbench.editor.swipeToNavigate");
      if (swipeToNavigate) {
        this.registerSwipeListener();
      } else {
        this.swipeListenerDisposable.clear();
      }
    }
    if (!e || e.affectsConfiguration(MenuSettings.MenuBarVisibility)) {
      const newMenuBarVisibility = this.getMenuBarVisibility();
      if (newMenuBarVisibility !== this.currentMenuBarVisibility) {
        this.currentMenuBarVisibility = newMenuBarVisibility;
        this.setMenuBarVisibility(newMenuBarVisibility);
      }
    }
    if (!e || e.affectsConfiguration("http.proxy") || e.affectsConfiguration("http.noProxy")) {
      const inspect = this.configurationService.inspect("http.proxy");
      let newHttpProxy = (inspect.userLocalValue || "").trim() || (process.env["https_proxy"] || process.env["HTTPS_PROXY"] || process.env["http_proxy"] || process.env["HTTP_PROXY"] || "").trim() || void 0;
      if (newHttpProxy?.indexOf("@") !== -1) {
        const uri = URI.parse(newHttpProxy);
        const i = uri.authority.indexOf("@");
        if (i !== -1) {
          newHttpProxy = uri.with({ authority: uri.authority.substring(i + 1) }).toString();
        }
      }
      if (newHttpProxy?.endsWith("/")) {
        newHttpProxy = newHttpProxy.substr(0, newHttpProxy.length - 1);
      }
      const newNoProxy = (this.configurationService.getValue("http.noProxy") || []).map((item) => item.trim()).join(",") || (process.env["no_proxy"] || process.env["NO_PROXY"] || "").trim() || void 0;
      if ((newHttpProxy || "").indexOf("@") === -1 && (newHttpProxy !== this.currentHttpProxy || newNoProxy !== this.currentNoProxy)) {
        this.currentHttpProxy = newHttpProxy;
        this.currentNoProxy = newNoProxy;
        const proxyRules = newHttpProxy || "";
        const proxyBypassRules = newNoProxy ? `${newNoProxy},<local>` : "<local>";
        this.logService.trace(`Setting proxy to '${proxyRules}', bypassing '${proxyBypassRules}'`);
        this._win.webContents.session.setProxy({ proxyRules, proxyBypassRules, pacScript: "" });
        electron.app.setProxy({ proxyRules, proxyBypassRules, pacScript: "" });
      }
    }
  }
  registerSwipeListener() {
    this.swipeListenerDisposable.value = Event.fromNodeEventEmitter(this._win, "swipe", (event, cmd) => cmd)((cmd) => {
      if (!this.isReady) {
        return;
      }
      if (cmd === "left") {
        this.send("vscode:runAction", { id: "workbench.action.openPreviousRecentlyUsedEditor", from: "mouse" });
      } else if (cmd === "right") {
        this.send("vscode:runAction", { id: "workbench.action.openNextRecentlyUsedEditor", from: "mouse" });
      }
    });
  }
  addTabbedWindow(window) {
    if (isMacintosh && window.win) {
      this._win.addTabbedWindow(window.win);
    }
  }
  load(configuration, options = /* @__PURE__ */ Object.create(null)) {
    this.logService.trace(`window#load: attempt to load window (id: ${this._id})`);
    if (this.isDocumentEdited()) {
      if (!options.isReload || !this.backupMainService.isHotExitEnabled()) {
        this.setDocumentEdited(false);
      }
    }
    if (!options.isReload) {
      if (this.getRepresentedFilename()) {
        this.setRepresentedFilename("");
      }
      this._win.setTitle(this.productService.nameLong);
    }
    this.updateConfiguration(configuration, options);
    if (this.readyState === 0 /* NONE */) {
      this._config = configuration;
    } else {
      this.pendingLoadConfig = configuration;
    }
    this.readyState = 1 /* NAVIGATING */;
    let windowUrl;
    if (process.env.VSCODE_DEV && process.env.VSCODE_DEV_SERVER_URL) {
      windowUrl = process.env.VSCODE_DEV_SERVER_URL;
    } else if (configuration.isSessionsWindow) {
      windowUrl = FileAccess.asBrowserUri(`vs/sessions/electron-browser/sessions${this.environmentMainService.isBuilt ? "" : "-dev"}.html`).toString(true);
    } else {
      windowUrl = FileAccess.asBrowserUri(`vs/code/electron-browser/workbench/workbench${this.environmentMainService.isBuilt ? "" : "-dev"}.html`).toString(true);
    }
    this._win.loadURL(windowUrl);
    const wasLoaded = this.wasLoaded;
    this.wasLoaded = true;
    if (!this.environmentMainService.isBuilt && !this.environmentMainService.extensionTestsLocationURI) {
      this._register(new RunOnceScheduler(() => {
        if (this._win && !this._win.isVisible() && !this._win.isMinimized()) {
          this._win.show();
          this.focus({ mode: FocusMode.Force });
          this._win.webContents.openDevTools();
        }
      }, 1e4)).schedule();
    }
    this._onWillLoad.fire({ workspace: configuration.workspace, reason: options.isReload ? LoadReason.RELOAD : wasLoaded ? LoadReason.LOAD : LoadReason.INITIAL });
  }
  updateConfiguration(configuration, options) {
    const currentUserEnv = (this._config ?? this.pendingLoadConfig)?.userEnv;
    if (currentUserEnv) {
      const shouldPreserveLaunchCliEnvironment = isLaunchedFromCli(currentUserEnv) && !isLaunchedFromCli(configuration.userEnv);
      const shouldPreserveDebugEnvironmnet = this.isExtensionDevelopmentHost;
      if (shouldPreserveLaunchCliEnvironment || shouldPreserveDebugEnvironmnet) {
        configuration.userEnv = { ...currentUserEnv, ...configuration.userEnv };
      }
    }
    if (process.env["CHROME_CRASHPAD_PIPE_NAME"]) {
      Object.assign(configuration.userEnv, {
        CHROME_CRASHPAD_PIPE_NAME: process.env["CHROME_CRASHPAD_PIPE_NAME"]
      });
    }
    if (options.disableExtensions !== void 0) {
      configuration["disable-extensions"] = options.disableExtensions;
    }
    try {
      configuration.handle = VSBuffer.wrap(this._win.getNativeWindowHandle());
    } catch (error) {
      this.logService.error(`Error getting native window handle: ${error}`);
    }
    configuration.fullscreen = this.isFullScreen;
    configuration.maximized = this._win.isMaximized();
    configuration.partsSplash = this.themeMainService.getWindowSplash(configuration.workspace);
    configuration.zoomLevel = this.getZoomLevel();
    configuration.isCustomZoomLevel = typeof this.customZoomLevel === "number";
    if (configuration.isCustomZoomLevel && configuration.partsSplash) {
      configuration.partsSplash.zoomLevel = configuration.zoomLevel;
    }
    mark("code/willOpenNewWindow");
    configuration.perfMarks = getMarks();
    this.configObjectUrl.update(configuration);
  }
  async reload(cli) {
    const configuration = Object.assign({}, this._config);
    configuration.workspace = await this.validateWorkspaceBeforeReload(configuration);
    delete configuration.filesToOpenOrCreate;
    delete configuration.filesToDiff;
    delete configuration.filesToMerge;
    delete configuration.filesToWait;
    if (this.isExtensionDevelopmentHost && cli) {
      configuration.verbose = cli.verbose;
      configuration.debugId = cli.debugId;
      configuration.extensionEnvironment = cli.extensionEnvironment;
      configuration["inspect-extensions"] = cli["inspect-extensions"];
      configuration["inspect-brk-extensions"] = cli["inspect-brk-extensions"];
      configuration["extensions-dir"] = cli["extensions-dir"];
    }
    configuration.accessibilitySupport = electron.app.isAccessibilitySupportEnabled();
    configuration.isInitialStartup = false;
    configuration.policiesData = this.policyService.serialize();
    configuration.continueOn = this.environmentMainService.continueOn;
    configuration.profiles = {
      all: this.userDataProfilesService.profiles,
      profile: this.profile || this.userDataProfilesService.defaultProfile,
      home: this.userDataProfilesService.profilesHome
    };
    configuration.logLevel = this.loggerMainService.getLogLevel();
    configuration.loggers = this.loggerMainService.getGlobalLoggers();
    this.load(configuration, { isReload: true, disableExtensions: cli?.["disable-extensions"] });
  }
  async validateWorkspaceBeforeReload(configuration) {
    if (isWorkspaceIdentifier(configuration.workspace)) {
      const configPath = configuration.workspace.configPath;
      if (configPath.scheme === Schemas.file) {
        const workspaceExists = await this.fileService.exists(configPath);
        if (!workspaceExists) {
          return void 0;
        }
      }
    } else if (isSingleFolderWorkspaceIdentifier(configuration.workspace)) {
      const uri = configuration.workspace.uri;
      if (uri.scheme === Schemas.file) {
        const folderExists = await this.fileService.exists(uri);
        if (!folderExists) {
          return void 0;
        }
      }
    }
    return configuration.workspace;
  }
  serializeWindowState() {
    if (!this._win) {
      return defaultWindowState();
    }
    if (this.isFullScreen) {
      let display;
      try {
        display = electron.screen.getDisplayMatching(this.getBounds());
      } catch (error) {
      }
      const defaultState = defaultWindowState();
      return {
        mode: WindowMode.Fullscreen,
        display: display ? display.id : void 0,
        // Still carry over window dimensions from previous sessions
        // if we can compute it in fullscreen state.
        // does not seem possible in all cases on Linux for example
        // (https://github.com/microsoft/vscode/issues/58218) so we
        // fallback to the defaults in that case.
        width: this.windowState.width || defaultState.width,
        height: this.windowState.height || defaultState.height,
        x: this.windowState.x || 0,
        y: this.windowState.y || 0,
        zoomLevel: this.customZoomLevel
      };
    }
    const state = /* @__PURE__ */ Object.create(null);
    let mode;
    if (!isMacintosh && this._win.isMaximized()) {
      mode = WindowMode.Maximized;
    } else {
      mode = WindowMode.Normal;
    }
    if (mode === WindowMode.Maximized) {
      state.mode = WindowMode.Maximized;
    } else {
      state.mode = WindowMode.Normal;
    }
    if (mode === WindowMode.Normal || mode === WindowMode.Maximized) {
      let bounds;
      if (mode === WindowMode.Normal) {
        bounds = this.getBounds();
      } else {
        bounds = this._win.getNormalBounds();
      }
      state.x = bounds.x;
      state.y = bounds.y;
      state.width = bounds.width;
      state.height = bounds.height;
    }
    state.zoomLevel = this.customZoomLevel;
    return state;
  }
  restoreWindowState(state) {
    mark("code/willRestoreCodeWindowState");
    let hasMultipleDisplays = false;
    if (state) {
      this.customZoomLevel = state.zoomLevel;
      try {
        const displays = electron.screen.getAllDisplays();
        hasMultipleDisplays = displays.length > 1;
        state = WindowStateValidator.validateWindowState(this.logService, state, displays);
      } catch (err) {
        this.logService.warn(`Unexpected error validating window state: ${err}
${err.stack}`);
      }
    }
    mark("code/didRestoreCodeWindowState");
    return [state || defaultWindowState(), hasMultipleDisplays];
  }
  getBounds() {
    const [x, y] = this._win.getPosition();
    const [width, height] = this._win.getSize();
    return { x, y, width, height };
  }
  setFullScreen(fullscreen, fromRestore) {
    super.setFullScreen(fullscreen, fromRestore);
    this.sendWhenReady(fullscreen ? "vscode:enterFullScreen" : "vscode:leaveFullScreen", CancellationToken.None);
    if (this.currentMenuBarVisibility) {
      this.setMenuBarVisibility(this.currentMenuBarVisibility, false);
    }
  }
  getMenuBarVisibility() {
    let menuBarVisibility = getMenuBarVisibility(this.configurationService);
    if (["visible", "toggle", "hidden"].indexOf(menuBarVisibility) < 0) {
      menuBarVisibility = "classic";
    }
    return menuBarVisibility;
  }
  setMenuBarVisibility(visibility, notify = true) {
    if (isMacintosh) {
      return;
    }
    if (visibility === "toggle") {
      if (notify) {
        this.send("vscode:showInfoMessage", localize("hiddenMenuBar", "You can still access the menu bar by pressing the Alt-key."));
      }
    }
    if (visibility === "hidden") {
      setTimeout(() => {
        this.doSetMenuBarVisibility(visibility);
      });
    } else {
      this.doSetMenuBarVisibility(visibility);
    }
  }
  doSetMenuBarVisibility(visibility) {
    const isFullscreen = this.isFullScreen;
    switch (visibility) {
      case "classic":
        this._win.setMenuBarVisibility(!isFullscreen);
        this._win.autoHideMenuBar = isFullscreen;
        break;
      case "visible":
        this._win.setMenuBarVisibility(true);
        this._win.autoHideMenuBar = false;
        break;
      case "toggle":
        this._win.setMenuBarVisibility(false);
        this._win.autoHideMenuBar = true;
        break;
      case "hidden":
        this._win.setMenuBarVisibility(false);
        this._win.autoHideMenuBar = false;
        break;
    }
  }
  notifyZoomLevel(zoomLevel) {
    this.customZoomLevel = zoomLevel;
  }
  getZoomLevel() {
    if (typeof this.customZoomLevel === "number") {
      return this.customZoomLevel;
    }
    const windowSettings = this.configurationService.getValue("window");
    return windowSettings?.zoomLevel;
  }
  close() {
    this._win?.close();
  }
  sendWhenReady(channel, token, ...args) {
    if (this.isReady) {
      this.send(channel, ...args);
    } else {
      this.ready().then(() => {
        if (!token.isCancellationRequested) {
          this.send(channel, ...args);
        }
      });
    }
  }
  send(channel, ...args) {
    if (this._win) {
      if (this._win.isDestroyed() || this._win.webContents.isDestroyed()) {
        this.logService.warn(`Sending IPC message to channel '${channel}' for window that is destroyed`);
        return;
      }
      try {
        this._win.webContents.send(channel, ...args);
      } catch (error) {
        this.logService.warn(`Error sending IPC message to channel '${channel}' of window ${this._id}: ${toErrorMessage(error)}`);
      }
    }
  }
  updateTouchBar(groups) {
    if (!isMacintosh) {
      return;
    }
    this.touchBarGroups.forEach((touchBarGroup, index) => {
      const commands = groups[index];
      touchBarGroup.segments = this.createTouchBarGroupSegments(commands);
    });
  }
  createTouchBar() {
    if (!isMacintosh) {
      return;
    }
    for (let i = 0; i < 10; i++) {
      const groupTouchBar = this.createTouchBarGroup();
      this.touchBarGroups.push(groupTouchBar);
    }
    this._win.setTouchBar(new electron.TouchBar({ items: this.touchBarGroups }));
  }
  createTouchBarGroup(items = []) {
    const segments = this.createTouchBarGroupSegments(items);
    const control = new electron.TouchBar.TouchBarSegmentedControl({
      segments,
      mode: "buttons",
      segmentStyle: "automatic",
      change: (selectedIndex) => {
        this.sendWhenReady("vscode:runAction", CancellationToken.None, { id: control.segments[selectedIndex].id, from: "touchbar" });
      }
    });
    return control;
  }
  createTouchBarGroupSegments(items = []) {
    const segments = items.map((item) => {
      let icon;
      if (item.icon && !ThemeIcon.isThemeIcon(item.icon) && item.icon?.dark?.scheme === Schemas.file) {
        icon = electron.nativeImage.createFromPath(URI.revive(item.icon.dark).fsPath);
        if (icon.isEmpty()) {
          icon = void 0;
        }
      }
      let title;
      if (typeof item.title === "string") {
        title = item.title;
      } else {
        title = item.title.value;
      }
      return {
        id: item.id,
        label: !icon ? title : void 0,
        icon
      };
    });
    return segments;
  }
  async startCollectingJScallStacks() {
    if (!this.jsCallStackCollector.isTriggered()) {
      const stack = await this._win?.webContents.mainFrame.collectJavaScriptCallStack();
      if (stack) {
        const count = this.jsCallStackMap.get(stack) || 0;
        this.jsCallStackMap.set(stack, count + 1);
      }
      this.jsCallStackCollector.trigger(() => this.startCollectingJScallStacks());
    }
  }
  stopCollectingJScallStacks() {
    this.jsCallStackCollectorStopScheduler.cancel();
    this.jsCallStackCollector.cancel();
    if (this.jsCallStackMap.size) {
      let logMessage = `CodeWindow unresponsive samples:
`;
      let samples = 0;
      const sortedEntries = Array.from(this.jsCallStackMap.entries()).sort((a, b) => b[1] - a[1]);
      for (const [stack, count] of sortedEntries) {
        samples += count;
        if (Math.round(count * 100 / this.jsCallStackEffectiveSampleCount) > 20) {
          const fakeError = new UnresponsiveError(stack, this.id, this._win?.webContents.getOSProcessId());
          errorHandler.onUnexpectedError(fakeError);
        }
        logMessage += `<${count}> ${stack}
`;
      }
      logMessage += `Total Samples: ${samples}
`;
      logMessage += "For full overview of the unresponsive period, capture cpu profile via https://aka.ms/vscode-tracing-cpu-profile";
      this.logService.error(logMessage);
    }
    this.jsCallStackMap.clear();
  }
  matches(webContents) {
    return this._win?.webContents.id === webContents.id;
  }
  dispose() {
    super.dispose();
    this.loggerMainService.deregisterLoggers(this.id);
  }
};
CodeWindow = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, ILoggerMainService),
  __decorateParam(3, IEnvironmentMainService),
  __decorateParam(4, IPolicyService),
  __decorateParam(5, IUserDataProfilesMainService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IApplicationStorageMainService),
  __decorateParam(8, IStorageMainService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IThemeMainService),
  __decorateParam(11, IWorkspacesManagementMainService),
  __decorateParam(12, IBackupMainService),
  __decorateParam(13, ITelemetryService),
  __decorateParam(14, IDialogMainService),
  __decorateParam(15, ILifecycleMainService),
  __decorateParam(16, IProductService),
  __decorateParam(17, IProtocolMainService),
  __decorateParam(18, IWindowsMainService),
  __decorateParam(19, IStateService),
  __decorateParam(20, IInstantiationService)
], CodeWindow);
class UnresponsiveError extends Error {
  constructor(sample, windowId, pid = 0) {
    const stackTraceLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 0;
    super(`UnresponsiveSampleError: from window with ID ${windowId} belonging to process with pid ${pid}`);
    Error.stackTraceLimit = stackTraceLimit;
    this.name = "UnresponsiveSampleError";
    this.stack = sample;
  }
}
export {
  BaseWindow,
  CodeWindow
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcd2luZG93c1xcZWxlY3Ryb24tbWFpblxcd2luZG93SW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBlbGVjdHJvbiwgeyBCcm93c2VyV2luZG93Q29uc3RydWN0b3JPcHRpb25zLCBEaXNwbGF5LCBzY3JlZW4gfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIFJ1bk9uY2VTY2hlZHVsZXIsIHRpbWVvdXQsIERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcywgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZ2V0TWFya3MsIG1hcmsgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBpc1RhaG9lT3JOZXdlciwgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyByZWxlYXNlIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgSVNlcmlhbGl6YWJsZUNvbW1hbmRBY3Rpb24gfSBmcm9tICcuLi8uLi9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQmFja3VwTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9iYWNrdXAvZWxlY3Ryb24tbWFpbi9iYWNrdXAuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9kaWFsb2dzL2VsZWN0cm9uLW1haW4vZGlhbG9nTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTmF0aXZlUGFyc2VkQXJncyB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9hcmd2LmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzTGF1bmNoZWRGcm9tQ2xpIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvbm9kZS9hcmd2SGVscGVyLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvZWxlY3Ryb24tbWFpbi9saWZlY3ljbGVNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJUENPYmplY3RVcmwsIElQcm90b2NvbE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvdG9jb2wvZWxlY3Ryb24tbWFpbi9wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyByZXNvbHZlTWFya2V0cGxhY2VIZWFkZXJzIH0gZnJvbSAnLi4vLi4vZXh0ZXJuYWxTZXJ2aWNlcy9jb21tb24vbWFya2V0cGxhY2UuanMnO1xuaW1wb3J0IHsgSUFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlLCBJU3RvcmFnZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9lbGVjdHJvbi1tYWluL3N0b3JhZ2VNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3RoZW1lL2VsZWN0cm9uLW1haW4vdGhlbWVNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRNZW51QmFyVmlzaWJpbGl0eSwgSUZvbGRlclRvT3BlbiwgSU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24sIElXaW5kb3dTZXR0aW5ncywgSVdvcmtzcGFjZVRvT3BlbiwgTWVudUJhclZpc2liaWxpdHksIGhhc05hdGl2ZVRpdGxlYmFyLCB1c2VOYXRpdmVGdWxsU2NyZWVuLCB1c2VXaW5kb3dDb250cm9sc092ZXJsYXksIERFRkFVTFRfQ1VTVE9NX1RJVExFQkFSX0hFSUdIVCwgVGl0bGViYXJTdHlsZSwgTWVudVNldHRpbmdzIH0gZnJvbSAnLi4vLi4vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJyb3dzZXJXaW5kb3dPcHRpb25zLCBnZXRBbGxXaW5kb3dzRXhjbHVkaW5nT2Zmc2NyZWVuLCBJV2luZG93c01haW5TZXJ2aWNlLCBPcGVuQ29udGV4dCwgV2luZG93U3RhdGVWYWxpZGF0b3IgfSBmcm9tICcuL3dpbmRvd3MuanMnO1xuaW1wb3J0IHsgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIElXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIGlzV29ya3NwYWNlSWRlbnRpZmllciwgdG9Xb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2VzL2VsZWN0cm9uLW1haW4vd29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV2luZG93U3RhdGUsIElDb2RlV2luZG93LCBJTG9hZEV2ZW50LCBXaW5kb3dNb2RlLCBXaW5kb3dFcnJvciwgTG9hZFJlYXNvbiwgZGVmYXVsdFdpbmRvd1N0YXRlLCBJQmFzZVdpbmRvdyB9IGZyb20gJy4uLy4uL3dpbmRvdy9lbGVjdHJvbi1tYWluL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJUG9saWN5U2VydmljZSB9IGZyb20gJy4uLy4uL3BvbGljeS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RhdGUvbm9kZS9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2VsZWN0cm9uLW1haW4vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElMb2dnZXJNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9lbGVjdHJvbi1tYWluL2xvZ2dlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBlcnJvckhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRm9jdXNNb2RlIH0gZnJvbSAnLi4vLi4vbmF0aXZlL2NvbW1vbi9uYXRpdmUuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdpbmRvd0NyZWF0aW9uT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHN0YXRlOiBJV2luZG93U3RhdGU7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbkRldmVsb3BtZW50UGF0aD86IHN0cmluZ1tdO1xuXHRyZWFkb25seSBpc0V4dGVuc2lvblRlc3RIb3N0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNTZXNzaW9uc1dpbmRvdz86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJVG91Y2hCYXJTZWdtZW50IGV4dGVuZHMgZWxlY3Ryb24uU2VnbWVudGVkQ29udHJvbFNlZ21lbnQge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSUxvYWRPcHRpb25zIHtcblx0cmVhZG9ubHkgaXNSZWxvYWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBkaXNhYmxlRXh0ZW5zaW9ucz86IGJvb2xlYW47XG59XG5cbmNvbnN0IGVudW0gUmVhZHlTdGF0ZSB7XG5cblx0LyoqXG5cdCAqIFRoaXMgd2luZG93IGhhcyBub3QgbG9hZGVkIGFueXRoaW5nIHlldFxuXHQgKiBhbmQgdGhpcyBpcyB0aGUgaW5pdGlhbCBzdGF0ZSBvZiBldmVyeVxuXHQgKiB3aW5kb3cuXG5cdCAqL1xuXHROT05FLFxuXG5cdC8qKlxuXHQgKiBUaGlzIHdpbmRvdyBpcyBuYXZpZ2F0aW5nLCBlaXRoZXIgZm9yIHRoZVxuXHQgKiBmaXJzdCB0aW1lIG9yIHN1YnNlcXVlbnQgdGltZXMuXG5cdCAqL1xuXHROQVZJR0FUSU5HLFxuXG5cdC8qKlxuXHQgKiBUaGlzIHdpbmRvdyBoYXMgZmluaXNoZWQgbG9hZGluZyBhbmQgaXMgcmVhZHlcblx0ICogdG8gZm9yd2FyZCBJUEMgcmVxdWVzdHMgdG8gdGhlIHdlYiBjb250ZW50cy5cblx0ICovXG5cdFJFQURZXG59XG5cbmNsYXNzIERvY2tCYWRnZU1hbmFnZXIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJTlNUQU5DRSA9IG5ldyBEb2NrQmFkZ2VNYW5hZ2VyKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aW5kb3dzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cblx0YWNxdWlyZUJhZGdlKHdpbmRvdzogSUJhc2VXaW5kb3cpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy53aW5kb3dzLmFkZCh3aW5kb3cuaWQpO1xuXG5cdFx0ZWxlY3Ryb24uYXBwLnNldEJhZGdlQ291bnQoaXNMaW51eCA/IDEgLyogb25seSBudW1iZXJzIHN1cHBvcnRlZCAqLyA6IHVuZGVmaW5lZCAvKiBnZW5lcmljIGRvdCAqLyk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLndpbmRvd3MuZGVsZXRlKHdpbmRvdy5pZCk7XG5cblx0XHRcdFx0aWYgKHRoaXMud2luZG93cy5zaXplID09PSAwKSB7XG5cdFx0XHRcdFx0ZWxlY3Ryb24uYXBwLnNldEJhZGdlQ291bnQoMCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBCYXNlV2luZG93IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElCYXNlV2luZG93IHtcblxuXHQvLyNyZWdpb24gRXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlID0gdGhpcy5fb25EaWRDbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE1heGltaXplID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTWF4aW1pemUgPSB0aGlzLl9vbkRpZE1heGltaXplLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVW5tYXhpbWl6ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVubWF4aW1pemUgPSB0aGlzLl9vbkRpZFVubWF4aW1pemUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUcmlnZ2VyU3lzdGVtQ29udGV4dE1lbnUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFRyaWdnZXJTeXN0ZW1Db250ZXh0TWVudSA9IHRoaXMuX29uRGlkVHJpZ2dlclN5c3RlbUNvbnRleHRNZW51LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRW50ZXJGdWxsU2NyZWVuID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRW50ZXJGdWxsU2NyZWVuID0gdGhpcy5fb25EaWRFbnRlckZ1bGxTY3JlZW4uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRMZWF2ZUZ1bGxTY3JlZW4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRMZWF2ZUZ1bGxTY3JlZW4gPSB0aGlzLl9vbkRpZExlYXZlRnVsbFNjcmVlbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFsd2F5c09uVG9wID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWx3YXlzT25Ub3AgPSB0aGlzLl9vbkRpZENoYW5nZUFsd2F5c09uVG9wLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdGFic3RyYWN0IHJlYWRvbmx5IGlkOiBudW1iZXI7XG5cblx0cHJvdGVjdGVkIF9sYXN0Rm9jdXNUaW1lID0gRGF0ZS5ub3coKTsgLy8gd2luZG93IGlzIHNob3duIG9uIGNyZWF0aW9uIHNvIHRha2UgY3VycmVudCB0aW1lXG5cdGdldCBsYXN0Rm9jdXNUaW1lKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9sYXN0Rm9jdXNUaW1lOyB9XG5cblx0cHJpdmF0ZSBtYXhpbWl6ZWRXaW5kb3dTdGF0ZTogSVdpbmRvd1N0YXRlIHwgdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCBfd2luOiBlbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgbnVsbCA9IG51bGw7XG5cdGdldCB3aW4oKSB7IHJldHVybiB0aGlzLl93aW47IH1cblx0cHJvdGVjdGVkIHNldFdpbih3aW46IGVsZWN0cm9uLkJyb3dzZXJXaW5kb3csIG9wdGlvbnM/OiBCcm93c2VyV2luZG93Q29uc3RydWN0b3JPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5fd2luID0gd2luO1xuXG5cdFx0Ly8gV2luZG93IEV2ZW50c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHdpbiwgJ21heGltaXplJykoKCkgPT4ge1xuXHRcdFx0aWYgKGlzV2luZG93cyAmJiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuZW5hYmxlUkRQRGlzcGxheVRyYWNraW5nICYmIHRoaXMuX3dpbikge1xuXHRcdFx0XHRjb25zdCBbeCwgeV0gPSB0aGlzLl93aW4uZ2V0UG9zaXRpb24oKTtcblx0XHRcdFx0Y29uc3QgW3dpZHRoLCBoZWlnaHRdID0gdGhpcy5fd2luLmdldFNpemUoKTtcblxuXHRcdFx0XHR0aGlzLm1heGltaXplZFdpbmRvd1N0YXRlID0geyBtb2RlOiBXaW5kb3dNb2RlLk1heGltaXplZCwgd2lkdGgsIGhlaWdodCwgeCwgeSB9O1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFNhdmVkIG1heGltaXplZCB3aW5kb3cgJHt0aGlzLmlkfSBkaXNwbGF5IHN0YXRlOmAsIHRoaXMubWF4aW1pemVkV2luZG93U3RhdGUpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbkRpZE1heGltaXplLmZpcmUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIod2luLCAndW5tYXhpbWl6ZScpKCgpID0+IHtcblx0XHRcdGlmIChpc1dpbmRvd3MgJiYgdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmVuYWJsZVJEUERpc3BsYXlUcmFja2luZyAmJiB0aGlzLm1heGltaXplZFdpbmRvd1N0YXRlKSB7XG5cdFx0XHRcdHRoaXMubWF4aW1pemVkV2luZG93U3RhdGUgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBDbGVhcmVkIG1heGltaXplZCB3aW5kb3cgJHt0aGlzLmlkfSBzdGF0ZWApO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbkRpZFVubWF4aW1pemUuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcih3aW4sICdjbG9zZWQnKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENsb3NlLmZpcmUoKTtcblxuXHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHdpbiwgJ2ZvY3VzJykoKCkgPT4ge1xuXHRcdFx0dGhpcy5jbGVhck5vdGlmeUZvY3VzKCk7XG5cblx0XHRcdHRoaXMuX2xhc3RGb2N1c1RpbWUgPSBEYXRlLm5vdygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcih0aGlzLl93aW4sICdlbnRlci1mdWxsLXNjcmVlbicpKCgpID0+IHRoaXMuX29uRGlkRW50ZXJGdWxsU2NyZWVuLmZpcmUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHRoaXMuX3dpbiwgJ2xlYXZlLWZ1bGwtc2NyZWVuJykoKCkgPT4gdGhpcy5fb25EaWRMZWF2ZUZ1bGxTY3JlZW4uZmlyZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIodGhpcy5fd2luLCAnYWx3YXlzLW9uLXRvcC1jaGFuZ2VkJywgKF8sIGFsd2F5c09uVG9wKSA9PiBhbHdheXNPblRvcCkoYWx3YXlzT25Ub3AgPT4gdGhpcy5fb25EaWRDaGFuZ2VBbHdheXNPblRvcC5maXJlKGFsd2F5c09uVG9wKSkpO1xuXG5cdFx0Ly8gU2hlZXQgT2Zmc2V0c1xuXHRcdGNvbnN0IHVzZUN1c3RvbVRpdGxlU3R5bGUgPSAhaGFzTmF0aXZlVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgb3B0aW9ucz8udGl0bGVCYXJTdHlsZSA9PT0gJ2hpZGRlbicgPyBUaXRsZWJhclN0eWxlLkNVU1RPTSA6IHVuZGVmaW5lZCAvKiB1bmtub3duICovKTtcblx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgdXNlQ3VzdG9tVGl0bGVTdHlsZSkge1xuXHRcdFx0d2luLnNldFNoZWV0T2Zmc2V0KGlzVGFob2VPck5ld2VyKHJlbGVhc2UoKSkgPyAzMiA6IDI4KTsgLy8gb2Zmc2V0IGRpYWxvZ3MgYnkgdGhlIGhlaWdodCBvZiB0aGUgY3VzdG9tIHRpdGxlIGJhciBpZiB3ZSBoYXZlIGFueVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0aGUgd2luZG93IGNvbnRyb2xzIGltbWVkaWF0ZWx5IGJhc2VkIG9uIGNhY2hlZCBvciBkZWZhdWx0IHZhbHVlc1xuXHRcdGlmICh1c2VDdXN0b21UaXRsZVN0eWxlICYmIHVzZVdpbmRvd0NvbnRyb2xzT3ZlcmxheSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkge1xuXHRcdFx0Y29uc3QgY2FjaGVkV2luZG93Q29udHJvbEhlaWdodCA9IHRoaXMuc3RhdGVTZXJ2aWNlLmdldEl0ZW08bnVtYmVyPigoQmFzZVdpbmRvdy53aW5kb3dDb250cm9sSGVpZ2h0U3RhdGVTdG9yYWdlS2V5KSk7XG5cdFx0XHRpZiAoY2FjaGVkV2luZG93Q29udHJvbEhlaWdodCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVdpbmRvd0NvbnRyb2xzKHsgaGVpZ2h0OiBjYWNoZWRXaW5kb3dDb250cm9sSGVpZ2h0IH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy51cGRhdGVXaW5kb3dDb250cm9scyh7IGhlaWdodDogREVGQVVMVF9DVVNUT01fVElUTEVCQVJfSEVJR0hUIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNldHVwIHdpbmRvd3MvbGludXggc3lzdGVtIGNvbnRleHQgbWVudSBzbyBpdCBvbmx5IGlzIGFsbG93ZWQgb3ZlciB0aGUgYXBwIGljb25cblx0XHRpZiAoKGlzV2luZG93cyB8fCBpc0xpbnV4KSAmJiB1c2VDdXN0b21UaXRsZVN0eWxlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcih3aW4sICdzeXN0ZW0tY29udGV4dC1tZW51JywgKGV2ZW50OiBFbGVjdHJvbi5FdmVudCwgcG9pbnQ6IEVsZWN0cm9uLlBvaW50KSA9PiAoeyBldmVudCwgcG9pbnQgfSkpKGUgPT4ge1xuXHRcdFx0XHRjb25zdCBbeCwgeV0gPSB3aW4uZ2V0UG9zaXRpb24oKTtcblx0XHRcdFx0Y29uc3QgY3Vyc29yUG9zID0gZWxlY3Ryb24uc2NyZWVuLnNjcmVlblRvRGlwUG9pbnQoZS5wb2ludCk7XG5cdFx0XHRcdGNvbnN0IGN4ID0gTWF0aC5mbG9vcihjdXJzb3JQb3MueCkgLSB4O1xuXHRcdFx0XHRjb25zdCBjeSA9IE1hdGguZmxvb3IoY3Vyc29yUG9zLnkpIC0geTtcblxuXHRcdFx0XHQvLyBUT0RPQGRlZXBhazE1NTYgd29ya2Fyb3VuZCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1MDYzMlxuXHRcdFx0XHQvLyB3aGVyZSBzaG93aW5nIHRoZSBjdXN0b20gbWVudSBzZWVtcyBicm9rZW4gb24gV2luZG93c1xuXHRcdFx0XHRpZiAoaXNMaW51eCkge1xuXHRcdFx0XHRcdGlmIChjeCA+IDM1IC8qIEN1cnNvciBpcyBiZXlvbmQgYXBwIGljb24gaW4gdGl0bGUgYmFyICovKSB7XG5cdFx0XHRcdFx0XHRlLmV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkVHJpZ2dlclN5c3RlbUNvbnRleHRNZW51LmZpcmUoeyB4OiBjeCwgeTogY3kgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiBkZXZ0b29scyBpZiBpbnN0cnVjdGVkIGZyb20gY29tbWFuZCBsaW5lIGFyZ3Ncblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3NbJ29wZW4tZGV2dG9vbHMnXSA9PT0gdHJ1ZSkge1xuXHRcdFx0d2luLndlYkNvbnRlbnRzLm9wZW5EZXZUb29scygpO1xuXHRcdH1cblxuXHRcdC8vIG1hY09TOiBXaW5kb3cgRnVsbHNjcmVlbiBUcmFuc2l0aW9uc1xuXHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZEVudGVyRnVsbFNjcmVlbigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuam9pbk5hdGl2ZUZ1bGxTY3JlZW5UcmFuc2l0aW9uPy5jb21wbGV0ZSh0cnVlKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZExlYXZlRnVsbFNjcmVlbigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuam9pbk5hdGl2ZUZ1bGxTY3JlZW5UcmFuc2l0aW9uPy5jb21wbGV0ZSh0cnVlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAoaXNXaW5kb3dzICYmIHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5lbmFibGVSRFBEaXNwbGF5VHJhY2tpbmcpIHtcblx0XHRcdC8vIEhhbmRsZXMgdGhlIGRpc3BsYXktYWRkZWQgZXZlbnQgb24gV2luZG93cyBSRFAgbXVsdGktbW9uaXRvciBzY2VuYXJpb3MuXG5cdFx0XHQvLyBUaGlzIGhlbHBzIHJlc3RvcmUgbWF4aW1pemVkIHdpbmRvd3MgdG8gdGhlaXIgY29ycmVjdCBtb25pdG9yIGFmdGVyIFJEUCByZWNvbm5lY3Rpb24uXG5cdFx0XHQvLyBSZWZzIGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9pc3N1ZXMvNDcwMTZcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyKHNjcmVlbiwgJ2Rpc3BsYXktYWRkZWQnLCAoZXZlbnQ6IEVsZWN0cm9uLkV2ZW50LCBkaXNwbGF5OiBEaXNwbGF5KSA9PiAoeyBldmVudCwgZGlzcGxheSB9KSkoKGUpID0+IHtcblx0XHRcdFx0dGhpcy5vbkRpc3BsYXlBZGRlZChlLmRpc3BsYXkpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaXNwbGF5QWRkZWQoZGlzcGxheTogRGlzcGxheSk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5tYXhpbWl6ZWRXaW5kb3dTdGF0ZTtcblx0XHRpZiAoc3RhdGUgJiYgdGhpcy5fd2luICYmIFdpbmRvd1N0YXRlVmFsaWRhdG9yLnZhbGlkYXRlV2luZG93U3RhdGVPbkRpc3BsYXkoc3RhdGUsIGRpc3BsYXkpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFNldHRpbmcgbWF4aW1pemVkIHdpbmRvdyAke3RoaXMuaWR9IGJvdW5kcyB0byBtYXRjaCBuZXdseSBhZGRlZCBkaXNwbGF5YCwgc3RhdGUpO1xuXG5cdFx0XHR0aGlzLl93aW4uc2V0Qm91bmRzKHN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgc3RhdGVTZXJ2aWNlOiBJU3RhdGVTZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBlbnZpcm9ubWVudE1haW5TZXJ2aWNlOiBJRW52aXJvbm1lbnRNYWluU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhcHBseVN0YXRlKHN0YXRlOiBJV2luZG93U3RhdGUsIGhhc011bHRpcGxlRGlzcGxheXMgPSBlbGVjdHJvbi5zY3JlZW4uZ2V0QWxsRGlzcGxheXMoKS5sZW5ndGggPiAwKTogdm9pZCB7XG5cblx0XHQvLyBUT0RPQGVsZWN0cm9uIChFbGVjdHJvbiA0IHJlZ3Jlc3Npb24pOiB3aGVuIHJ1bm5pbmcgb24gbXVsdGlwbGUgZGlzcGxheXMgd2hlcmUgdGhlIHRhcmdldCBkaXNwbGF5XG5cdFx0Ly8gdG8gb3BlbiB0aGUgd2luZG93IGhhcyBhIGxhcmdlciByZXNvbHV0aW9uIHRoYW4gdGhlIHByaW1hcnkgZGlzcGxheSwgdGhlIHdpbmRvdyB3aWxsIG5vdCBzaXplXG5cdFx0Ly8gY29ycmVjdGx5IHVubGVzcyB3ZSBzZXQgdGhlIGJvdW5kcyBhZ2FpbiAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzc0ODcyKVxuXHRcdC8vXG5cdFx0Ly8gRXh0ZW5kZWQgdG8gY292ZXIgV2luZG93cyBhcyB3ZWxsIGFzIE1hYyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE0NjQ5OSlcblx0XHQvL1xuXHRcdC8vIEhvd2V2ZXIsIHdoZW4gcnVubmluZyB3aXRoIG5hdGl2ZSB0YWJzIHdpdGggbXVsdGlwbGUgd2luZG93cyB3ZSBjYW5ub3QgdXNlIHRoaXMgd29ya2Fyb3VuZFxuXHRcdC8vIGJlY2F1c2UgdGhlcmUgaXMgYSBwb3RlbnRpYWwgdGhhdCB0aGUgbmV3IHdpbmRvdyB3aWxsIGJlIGFkZGVkIGFzIG5hdGl2ZSB0YWIgaW5zdGVhZCBvZiBiZWluZ1xuXHRcdC8vIGEgd2luZG93IG9uIGl0cyBvd24uIEluIHRoYXQgY2FzZSBjYWxsaW5nIHNldEJvdW5kcygpIHdvdWxkIGNhdXNlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83NTgzMFxuXG5cdFx0Y29uc3Qgd2luZG93U2V0dGluZ3MgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElXaW5kb3dTZXR0aW5ncyB8IHVuZGVmaW5lZD4oJ3dpbmRvdycpO1xuXHRcdGNvbnN0IHVzZU5hdGl2ZVRhYnMgPSBpc01hY2ludG9zaCAmJiB3aW5kb3dTZXR0aW5ncz8ubmF0aXZlVGFicyA9PT0gdHJ1ZTtcblx0XHRpZiAoKGlzTWFjaW50b3NoIHx8IGlzV2luZG93cykgJiYgaGFzTXVsdGlwbGVEaXNwbGF5cyAmJiAoIXVzZU5hdGl2ZVRhYnMgfHwgZ2V0QWxsV2luZG93c0V4Y2x1ZGluZ09mZnNjcmVlbigpLmxlbmd0aCA9PT0gMSkpIHtcblx0XHRcdGlmIChbc3RhdGUud2lkdGgsIHN0YXRlLmhlaWdodCwgc3RhdGUueCwgc3RhdGUueV0uZXZlcnkodmFsdWUgPT4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykpIHtcblx0XHRcdFx0dGhpcy5fd2luPy5zZXRCb3VuZHMoe1xuXHRcdFx0XHRcdHdpZHRoOiBzdGF0ZS53aWR0aCxcblx0XHRcdFx0XHRoZWlnaHQ6IHN0YXRlLmhlaWdodCxcblx0XHRcdFx0XHR4OiBzdGF0ZS54LFxuXHRcdFx0XHRcdHk6IHN0YXRlLnlcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXRlLm1vZGUgPT09IFdpbmRvd01vZGUuTWF4aW1pemVkIHx8IHN0YXRlLm1vZGUgPT09IFdpbmRvd01vZGUuRnVsbHNjcmVlbikge1xuXG5cdFx0XHQvLyB0aGlzIGNhbGwgbWF5IG9yIG1heSBub3Qgc2hvdyB0aGUgd2luZG93LCBkZXBlbmRzXG5cdFx0XHQvLyBvbiB0aGUgcGxhdGZvcm06IGN1cnJlbnRseSBvbiBXaW5kb3dzIGFuZCBMaW51eCB3aWxsXG5cdFx0XHQvLyBzaG93IHRoZSB3aW5kb3cgYXMgYWN0aXZlLiBUbyBiZSBvbiB0aGUgc2FmZSBzaWRlLFxuXHRcdFx0Ly8gd2Ugc2hvdyB0aGUgd2luZG93IGF0IHRoZSBlbmQgb2YgdGhpcyBibG9jay5cblx0XHRcdHRoaXMuX3dpbj8ubWF4aW1pemUoKTtcblxuXHRcdFx0aWYgKHN0YXRlLm1vZGUgPT09IFdpbmRvd01vZGUuRnVsbHNjcmVlbikge1xuXHRcdFx0XHR0aGlzLnNldEZ1bGxTY3JlZW4odHJ1ZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHRvIHJlZHVjZSBmbGlja2VyIGZyb20gdGhlIGRlZmF1bHQgd2luZG93IHNpemVcblx0XHRcdC8vIHRvIG1heGltaXplIG9yIGZ1bGxzY3JlZW4sIHdlIG9ubHkgc2hvdyBhZnRlclxuXHRcdFx0dGhpcy5fd2luPy5zaG93KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXByZXNlbnRlZEZpbGVuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0c2V0UmVwcmVzZW50ZWRGaWxlbmFtZShmaWxlbmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHR0aGlzLndpbj8uc2V0UmVwcmVzZW50ZWRGaWxlbmFtZShmaWxlbmFtZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVwcmVzZW50ZWRGaWxlbmFtZSA9IGZpbGVuYW1lO1xuXHRcdH1cblx0fVxuXG5cdGdldFJlcHJlc2VudGVkRmlsZW5hbWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdHJldHVybiB0aGlzLndpbj8uZ2V0UmVwcmVzZW50ZWRGaWxlbmFtZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJlcHJlc2VudGVkRmlsZW5hbWU7XG5cdH1cblxuXHRwcml2YXRlIGRvY3VtZW50RWRpdGVkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdHNldERvY3VtZW50RWRpdGVkKGVkaXRlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0dGhpcy53aW4/LnNldERvY3VtZW50RWRpdGVkKGVkaXRlZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kb2N1bWVudEVkaXRlZCA9IGVkaXRlZDtcblx0fVxuXG5cdGlzRG9jdW1lbnRFZGl0ZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRyZXR1cm4gQm9vbGVhbih0aGlzLndpbj8uaXNEb2N1bWVudEVkaXRlZCgpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gISF0aGlzLmRvY3VtZW50RWRpdGVkO1xuXHR9XG5cblx0Zm9jdXMob3B0aW9ucz86IHsgbW9kZTogRm9jdXNNb2RlIH0pOiB2b2lkIHtcblx0XHRzd2l0Y2ggKG9wdGlvbnM/Lm1vZGUgPz8gRm9jdXNNb2RlLlRyYW5zZmVyKSB7XG5cdFx0XHRjYXNlIEZvY3VzTW9kZS5UcmFuc2Zlcjpcblx0XHRcdFx0dGhpcy5kb0ZvY3VzV2luZG93KCk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlIEZvY3VzTW9kZS5Ob3RpZnk6XG5cdFx0XHRcdHRoaXMuc2hvd05vdGlmeUZvY3VzKCk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlIEZvY3VzTW9kZS5Gb3JjZTpcblx0XHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdFx0ZWxlY3Ryb24uYXBwLmZvY3VzKHsgc3RlYWw6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5kb0ZvY3VzV2luZG93KCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgbm90aWZ5Rm9jdXNEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgc2hvd05vdGlmeUZvY3VzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMubm90aWZ5Rm9jdXNEaXNwb3NhYmxlLnZhbHVlID0gZGlzcG9zYWJsZXM7XG5cblx0XHQvLyBCYWRnZVxuXHRcdGRpc3Bvc2FibGVzLmFkZChEb2NrQmFkZ2VNYW5hZ2VyLklOU1RBTkNFLmFjcXVpcmVCYWRnZSh0aGlzKSk7XG5cblx0XHQvLyBGbGFzaC9Cb3VuY2Vcblx0XHRpZiAoaXNXaW5kb3dzIHx8IGlzTGludXgpIHtcblx0XHRcdHRoaXMud2luPy5mbGFzaEZyYW1lKHRydWUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLndpbj8uZmxhc2hGcmFtZShmYWxzZSkpKTtcblx0XHR9IGVsc2UgaWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRlbGVjdHJvbi5hcHAuZG9jaz8uYm91bmNlKCdpbmZvcm1hdGlvbmFsJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhck5vdGlmeUZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMubm90aWZ5Rm9jdXNEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIGRvRm9jdXNXaW5kb3coKSB7XG5cdFx0Y29uc3Qgd2luID0gdGhpcy53aW47XG5cdFx0aWYgKCF3aW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAod2luLmlzTWluaW1pemVkKCkpIHtcblx0XHRcdHdpbi5yZXN0b3JlKCk7XG5cdFx0fVxuXG5cdFx0d2luLmZvY3VzKCk7XG5cblx0XHQvLyBXaGVuIGZvY3VzaW5nIHRoZSB3aW5kb3csIHRoZSB3b3JrYmVuY2ggc2hvdWxkIGFsd2F5cyBiZSB0aGUgdmlldyB0aGF0IHJlY2VpdmVzIGZvY3VzLlxuXHRcdC8vIEhvd2V2ZXIsIGluIHNjZW5hcmlvcyB3aGVyZSB0aGUgd2luZG93IGhhcyBtdWx0aXBsZSBjaGlsZCB2aWV3cyAoZS5nLiBicm93c2VyIFdlYkNvbnRlbnRzVmlld3MpLFxuXHRcdC8vIHRoZSBsYXN0IGZvY3VzZWQgdmlldyBpbiB0aGUgd2luZG93IG1heSBub3QgYmUgdGhlIHdvcmtiZW5jaC5cblx0XHQvLyBTbyB3ZSBleHBsaWNpdGx5IGZvY3VzIHRoZSB3b3JrYmVuY2ggd2ViIGNvbnRlbnRzIGhlcmUgdG8gZW5zdXJlIGl0IGdldHMgZm9jdXMuXG5cdFx0d2luLndlYkNvbnRlbnRzLmZvY3VzKCk7XG5cdH1cblxuXHQvLyNyZWdpb24gV2luZG93IENvbnRyb2wgT3ZlcmxheXNcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSB3aW5kb3dDb250cm9sSGVpZ2h0U3RhdGVTdG9yYWdlS2V5ID0gJ3dpbmRvd0NvbnRyb2xIZWlnaHQnO1xuXG5cdHByaXZhdGUgd2luZG93Q29udHJvbHNEaW1tZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBsYXN0V2luZG93Q29udHJvbENvbG9yczogeyBiYWNrZ3JvdW5kQ29sb3I/OiBzdHJpbmc7IGZvcmVncm91bmRDb2xvcj86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXG5cdHVwZGF0ZVdpbmRvd0NvbnRyb2xzKG9wdGlvbnM6IHsgaGVpZ2h0PzogbnVtYmVyOyBiYWNrZ3JvdW5kQ29sb3I/OiBzdHJpbmc7IGZvcmVncm91bmRDb2xvcj86IHN0cmluZzsgZGltbWVkPzogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0Y29uc3Qgd2luID0gdGhpcy53aW47XG5cdFx0aWYgKCF3aW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDYWNoZSB0aGUgaGVpZ2h0IGZvciBzcGVlZHMgbG9va3VwcyBvbiBzdGFydHVwXG5cdFx0aWYgKG9wdGlvbnMuaGVpZ2h0KSB7XG5cdFx0XHR0aGlzLnN0YXRlU2VydmljZS5zZXRJdGVtKChDb2RlV2luZG93LndpbmRvd0NvbnRyb2xIZWlnaHRTdGF0ZVN0b3JhZ2VLZXkpLCBvcHRpb25zLmhlaWdodCk7XG5cdFx0fVxuXG5cdFx0Ly8gV2luZG93cy9MaW51eDogdXBkYXRlIHdpbmRvdyBjb250cm9scyB2aWEgc2V0VGl0bGVCYXJPdmVybGF5KClcblx0XHRpZiAoIWlzTWFjaW50b3NoICYmIHVzZVdpbmRvd0NvbnRyb2xzT3ZlcmxheSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkge1xuXG5cdFx0XHQvLyBVcGRhdGUgZGltbWVkIHN0YXRlIGlmIGV4cGxpY2l0bHkgcHJvdmlkZWRcblx0XHRcdGlmIChvcHRpb25zLmRpbW1lZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMud2luZG93Q29udHJvbHNEaW1tZWQgPSBvcHRpb25zLmRpbW1lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYmFja2dyb3VuZENvbG9yID0gb3B0aW9ucy5iYWNrZ3JvdW5kQ29sb3IgPz8gdGhpcy5sYXN0V2luZG93Q29udHJvbENvbG9ycz8uYmFja2dyb3VuZENvbG9yO1xuXHRcdFx0Y29uc3QgZm9yZWdyb3VuZENvbG9yID0gb3B0aW9ucy5mb3JlZ3JvdW5kQ29sb3IgPz8gdGhpcy5sYXN0V2luZG93Q29udHJvbENvbG9ycz8uZm9yZWdyb3VuZENvbG9yO1xuXG5cdFx0XHRpZiAob3B0aW9ucy5iYWNrZ3JvdW5kQ29sb3IgIT09IHVuZGVmaW5lZCB8fCBvcHRpb25zLmZvcmVncm91bmRDb2xvciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMubGFzdFdpbmRvd0NvbnRyb2xDb2xvcnMgPSB7IGJhY2tncm91bmRDb2xvciwgZm9yZWdyb3VuZENvbG9yIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVmZmVjdGl2ZUJhY2tncm91bmRDb2xvciA9IHRoaXMud2luZG93Q29udHJvbHNEaW1tZWQgJiYgYmFja2dyb3VuZENvbG9yID8gdGhpcy5kaW1Db2xvcihiYWNrZ3JvdW5kQ29sb3IpIDogYmFja2dyb3VuZENvbG9yO1xuXHRcdFx0Y29uc3QgZWZmZWN0aXZlRm9yZWdyb3VuZENvbG9yID0gdGhpcy53aW5kb3dDb250cm9sc0RpbW1lZCAmJiBmb3JlZ3JvdW5kQ29sb3IgPyB0aGlzLmRpbUNvbG9yKGZvcmVncm91bmRDb2xvcikgOiBmb3JlZ3JvdW5kQ29sb3I7XG5cblx0XHRcdHdpbi5zZXRUaXRsZUJhck92ZXJsYXkoe1xuXHRcdFx0XHRjb2xvcjogZWZmZWN0aXZlQmFja2dyb3VuZENvbG9yPy50cmltKCkgPT09ICcnID8gdW5kZWZpbmVkIDogZWZmZWN0aXZlQmFja2dyb3VuZENvbG9yLFxuXHRcdFx0XHRzeW1ib2xDb2xvcjogZWZmZWN0aXZlRm9yZWdyb3VuZENvbG9yPy50cmltKCkgPT09ICcnID8gdW5kZWZpbmVkIDogZWZmZWN0aXZlRm9yZWdyb3VuZENvbG9yLFxuXHRcdFx0XHRoZWlnaHQ6IG9wdGlvbnMuaGVpZ2h0ID8gb3B0aW9ucy5oZWlnaHQgLSAxIDogdW5kZWZpbmVkIC8vIGFjY291bnQgZm9yIHdpbmRvdyBib3JkZXJcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIG1hY09TOiB1cGRhdGUgd2luZG93IGNvbnRyb2xzIHZpYSBzZXRXaW5kb3dCdXR0b25Qb3NpdGlvbigpXG5cdFx0ZWxzZSBpZiAoaXNNYWNpbnRvc2ggJiYgb3B0aW9ucy5oZWlnaHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gV2hlbiB0aGUgcG9zaXRpb24gaXMgc2V0LCB0aGUgaG9yaXpvbnRhbCBtYXJnaW4gaXMgb2Zmc2V0IHRvIGVuc3VyZVxuXHRcdFx0Ly8gdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIHRyYWZmaWMgbGlnaHRzIGFuZCB0aGUgd2luZG93IGZyYW1lIGlzIGVxdWFsXG5cdFx0XHQvLyBpbiBib3RoIGRpcmVjdGlvbnMuXG5cdFx0XHRjb25zdCBidXR0b25IZWlnaHQgPSBpc1RhaG9lT3JOZXdlcihyZWxlYXNlKCkpID8gMTQgOiAxNjtcblx0XHRcdGNvbnN0IG9mZnNldCA9IE1hdGguZmxvb3IoKG9wdGlvbnMuaGVpZ2h0IC0gYnV0dG9uSGVpZ2h0KSAvIDIpO1xuXHRcdFx0aWYgKCFvZmZzZXQpIHtcblx0XHRcdFx0d2luLnNldFdpbmRvd0J1dHRvblBvc2l0aW9uKG51bGwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0d2luLnNldFdpbmRvd0J1dHRvblBvc2l0aW9uKHsgeDogb2Zmc2V0ICsgMSwgeTogb2Zmc2V0IH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZGltQ29sb3IoY29sb3I6IHN0cmluZyk6IHN0cmluZyB7XG5cblx0XHQvLyBCbGVuZCBhIENTUyBjb2xvciB3aXRoIGJsYWNrIGF0IDUwJSBvcGFjaXR5IHRvIG1hdGNoIHRoZVxuXHRcdC8vIGRpbW1pbmcgb3ZlcmxheSBvZiBgcmdiYSgwLCAwLCAwLCAwLjUpYCB1c2VkIGJ5IG1vZGFscy5cblxuXHRcdGNvbnN0IHBhcnNlZCA9IENvbG9yLkZvcm1hdC5DU1MucGFyc2UoY29sb3IpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gY29sb3I7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGltRmFjdG9yID0gMC41OyAvLyAxIC0gMC41IG9wYWNpdHkgb2YgYmxhY2sgb3ZlcmxheVxuXHRcdGNvbnN0IHIgPSBNYXRoLnJvdW5kKHBhcnNlZC5yZ2JhLnIgKiBkaW1GYWN0b3IpO1xuXHRcdGNvbnN0IGcgPSBNYXRoLnJvdW5kKHBhcnNlZC5yZ2JhLmcgKiBkaW1GYWN0b3IpO1xuXHRcdGNvbnN0IGIgPSBNYXRoLnJvdW5kKHBhcnNlZC5yZ2JhLmIgKiBkaW1GYWN0b3IpO1xuXG5cdFx0cmV0dXJuIGByZ2IoJHtyfSwgJHtnfSwgJHtifSlgO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEZ1bGxzY3JlZW5cblxuXHRwcml2YXRlIHRyYW5zaWVudElzTmF0aXZlRnVsbFNjcmVlbjogYm9vbGVhbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBqb2luTmF0aXZlRnVsbFNjcmVlblRyYW5zaXRpb246IERlZmVycmVkUHJvbWlzZTxib29sZWFuPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHR0b2dnbGVGdWxsU2NyZWVuKCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0RnVsbFNjcmVlbighdGhpcy5pc0Z1bGxTY3JlZW4sIGZhbHNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBzZXRGdWxsU2NyZWVuKGZ1bGxzY3JlZW46IGJvb2xlYW4sIGZyb21SZXN0b3JlOiBib29sZWFuKTogdm9pZCB7XG5cblx0XHQvLyBTZXQgZnVsbHNjcmVlbiBzdGF0ZVxuXHRcdGlmICh1c2VOYXRpdmVGdWxsU2NyZWVuKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHR0aGlzLnNldE5hdGl2ZUZ1bGxTY3JlZW4oZnVsbHNjcmVlbiwgZnJvbVJlc3RvcmUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNldFNpbXBsZUZ1bGxTY3JlZW4oZnVsbHNjcmVlbik7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGlzRnVsbFNjcmVlbigpOiBib29sZWFuIHtcblx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgdHlwZW9mIHRoaXMudHJhbnNpZW50SXNOYXRpdmVGdWxsU2NyZWVuID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiB0aGlzLnRyYW5zaWVudElzTmF0aXZlRnVsbFNjcmVlbjtcblx0XHR9XG5cblx0XHRjb25zdCB3aW4gPSB0aGlzLndpbjtcblx0XHRjb25zdCBpc0Z1bGxTY3JlZW4gPSB3aW4/LmlzRnVsbFNjcmVlbigpO1xuXHRcdGNvbnN0IGlzU2ltcGxlRnVsbFNjcmVlbiA9IHdpbj8uaXNTaW1wbGVGdWxsU2NyZWVuKCk7XG5cblx0XHRyZXR1cm4gQm9vbGVhbihpc0Z1bGxTY3JlZW4gfHwgaXNTaW1wbGVGdWxsU2NyZWVuKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0TmF0aXZlRnVsbFNjcmVlbihmdWxsc2NyZWVuOiBib29sZWFuLCBmcm9tUmVzdG9yZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHdpbiA9IHRoaXMud2luO1xuXHRcdGlmICh3aW4/LmlzU2ltcGxlRnVsbFNjcmVlbigpKSB7XG5cdFx0XHR3aW4/LnNldFNpbXBsZUZ1bGxTY3JlZW4oZmFsc2UpO1xuXHRcdH1cblxuXHRcdHRoaXMuZG9TZXROYXRpdmVGdWxsU2NyZWVuKGZ1bGxzY3JlZW4sIGZyb21SZXN0b3JlKTtcblx0fVxuXG5cdHByaXZhdGUgZG9TZXROYXRpdmVGdWxsU2NyZWVuKGZ1bGxzY3JlZW46IGJvb2xlYW4sIGZyb21SZXN0b3JlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cblx0XHRcdC8vIG1hY09TOiBFbGVjdHJvbiB3aW5kb3dzIHJlcG9ydCBgZmFsc2VgIGZvciBgaXNGdWxsU2NyZWVuKClgIGZvciBhcyBsb25nXG5cdFx0XHQvLyBhcyB0aGUgZnVsbHNjcmVlbiB0cmFuc2l0aW9uIGFuaW1hdGlvbiB0YWtlcyBwbGFjZS4gQXMgc3VjaCwgd2UgbmVlZCB0b1xuXHRcdFx0Ly8gbGlzdGVuIHRvIHRoZSB0cmFuc2l0aW9uIGV2ZW50cyBhbmQgY2FycnkgYXJvdW5kIGFuIGludGVybWVkaWF0ZSBzdGF0ZVxuXHRcdFx0Ly8gZm9yIGtub3dpbmcgaWYgd2UgYXJlIGluIGZ1bGxzY3JlZW4gb3Igbm90XG5cdFx0XHQvLyBSZWZzOiBodHRwczovL2dpdGh1Yi5jb20vZWxlY3Ryb24vZWxlY3Ryb24vaXNzdWVzLzM1MzYwXG5cblx0XHRcdHRoaXMudHJhbnNpZW50SXNOYXRpdmVGdWxsU2NyZWVuID0gZnVsbHNjcmVlbjtcblxuXHRcdFx0Y29uc3Qgam9pbk5hdGl2ZUZ1bGxTY3JlZW5UcmFuc2l0aW9uID0gdGhpcy5qb2luTmF0aXZlRnVsbFNjcmVlblRyYW5zaXRpb24gPSBuZXcgRGVmZXJyZWRQcm9taXNlPGJvb2xlYW4+KCk7XG5cdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0cmFuc2l0aW9uZWQgPSBhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHRcdGpvaW5OYXRpdmVGdWxsU2NyZWVuVHJhbnNpdGlvbi5wLFxuXHRcdFx0XHRcdHRpbWVvdXQoMTAwMDApLnRoZW4oKCkgPT4gZmFsc2UpXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdGlmICh0aGlzLmpvaW5OYXRpdmVGdWxsU2NyZWVuVHJhbnNpdGlvbiAhPT0gam9pbk5hdGl2ZUZ1bGxTY3JlZW5UcmFuc2l0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBhbm90aGVyIHRyYW5zaXRpb24gd2FzIHJlcXVlc3RlZCBsYXRlclxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy50cmFuc2llbnRJc05hdGl2ZUZ1bGxTY3JlZW4gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuam9pbk5hdGl2ZUZ1bGxTY3JlZW5UcmFuc2l0aW9uID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRcdC8vIFRoZXJlIGlzIG9uZSBpbnRlcmVzdGluZyBnb3RjaGEgb24gbWFjT1M6IHdoZW4geW91IGFyZSBvcGVuaW5nIGEgbmV3XG5cdFx0XHRcdC8vIHdpbmRvdyBmcm9tIGEgZnVsbHNjcmVlbiB3aW5kb3csIHRoYXQgbmV3IHdpbmRvdyB3aWxsIGltbWVkaWF0ZWx5XG5cdFx0XHRcdC8vIG9wZW4gZnVsbHNjcmVlbiBhbmQgZW1pdCB0aGUgYGVudGVyLWZ1bGwtc2NyZWVuYCBldmVudCBldmVuIGJlZm9yZSB3ZVxuXHRcdFx0XHQvLyByZWFjaCB0aGlzIG1ldGhvZC4gSW4gdGhhdCBjYXNlLCB3ZSBhY3R1YWxseSB3aWxsIHRpbWVvdXQgYWZ0ZXIgMTBzXG5cdFx0XHRcdC8vIGZvciBkZXRlY3RpbmcgdGhlIHRyYW5zaXRpb24gYW5kIGFzIHN1Y2ggaXQgaXMgaW1wb3J0YW50IHRoYXQgd2Ugb25seVxuXHRcdFx0XHQvLyBzaWduYWwgdG8gbGVhdmUgZnVsbHNjcmVlbiBpZiB0aGUgd2luZG93IHJlcG9ydHMgYXMgbm90IGJlaW5nIGluIGZ1bGxzY3JlZW4uXG5cblx0XHRcdFx0aWYgKCF0cmFuc2l0aW9uZWQgJiYgZnVsbHNjcmVlbiAmJiBmcm9tUmVzdG9yZSAmJiB0aGlzLndpbiAmJiAhdGhpcy53aW4uaXNGdWxsU2NyZWVuKCkpIHtcblxuXHRcdFx0XHRcdC8vIFdlIGhhdmUgc2VlbiByZXF1ZXN0cyBmb3IgZnVsbHNjcmVlbiBmYWlsaW5nIGV2ZW50dWFsbHkgYWZ0ZXIgc29tZVxuXHRcdFx0XHRcdC8vIHRpbWUsIGZvciBleGFtcGxlIHdoZW4gYW4gT1MgdXBkYXRlIHdhcyBwZXJmb3JtZWQgYW5kIHdpbmRvd3MgcmVzdG9yZS5cblx0XHRcdFx0XHQvLyBJbiB0aG9zZSBjYXNlcyBhIHVzZXIgd291bGQgZmluZCBhIHdpbmRvdyB0aGF0IGlzIG5vdCBpbiBmdWxsc2NyZWVuXG5cdFx0XHRcdFx0Ly8gYnV0IGFsc28gZG9lcyBub3Qgc2hvdyBhbnkgY3VzdG9tIHRpdGxlYmFyIChhbmQgdGh1cyB3aW5kb3cgY29udHJvbHMpXG5cdFx0XHRcdFx0Ly8gYmVjYXVzZSB3ZSB0aGluayB0aGUgd2luZG93IGlzIGluIGZ1bGxzY3JlZW4uXG5cdFx0XHRcdFx0Ly9cblx0XHRcdFx0XHQvLyBBcyBhIHdvcmthcm91bmQgaW4gdGhhdCBjYXNlIHdlIGVtaXQgYSB3YXJuaW5nIGFuZCBsZWF2ZSBmdWxsc2NyZWVuXG5cdFx0XHRcdFx0Ly8gc28gdGhhdCBhdCBsZWFzdCB0aGUgd2luZG93IGNvbnRyb2xzIGFyZSBiYWNrLlxuXG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ3dpbmRvdzogbmF0aXZlIG1hY09TIGZ1bGxzY3JlZW4gdHJhbnNpdGlvbiBkaWQgbm90IGhhcHBlbiB3aXRoaW4gMTBzIGZyb20gcmVzdG9yaW5nJyk7XG5cblx0XHRcdFx0XHR0aGlzLl9vbkRpZExlYXZlRnVsbFNjcmVlbi5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2luID0gdGhpcy53aW47XG5cdFx0d2luPy5zZXRGdWxsU2NyZWVuKGZ1bGxzY3JlZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRTaW1wbGVGdWxsU2NyZWVuKGZ1bGxzY3JlZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCB3aW4gPSB0aGlzLndpbjtcblx0XHRpZiAod2luPy5pc0Z1bGxTY3JlZW4oKSkge1xuXHRcdFx0dGhpcy5kb1NldE5hdGl2ZUZ1bGxTY3JlZW4oZmFsc2UsIGZhbHNlKTtcblx0XHR9XG5cblx0XHR3aW4/LnNldFNpbXBsZUZ1bGxTY3JlZW4oZnVsbHNjcmVlbik7XG5cdFx0d2luPy53ZWJDb250ZW50cy5mb2N1cygpOyAvLyB3b3JrYXJvdW5kIGlzc3VlIHdoZXJlIGZvY3VzIGlzIG5vdCBnb2luZyBpbnRvIHdpbmRvd1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0YWJzdHJhY3QgbWF0Y2hlcyh3ZWJDb250ZW50czogZWxlY3Ryb24uV2ViQ29udGVudHMpOiBib29sZWFuO1xuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fd2luID0gbnVsbCE7IC8vIEltcG9ydGFudCB0byBkZXJlZmVyZW5jZSB0aGUgd2luZG93IG9iamVjdCB0byBhbGxvdyBmb3IgR0Ncblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29kZVdpbmRvdyBleHRlbmRzIEJhc2VXaW5kb3cgaW1wbGVtZW50cyBJQ29kZVdpbmRvdyB7XG5cblx0Ly8jcmVnaW9uIEV2ZW50c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbExvYWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTG9hZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25XaWxsTG9hZCA9IHRoaXMuX29uV2lsbExvYWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTaWduYWxSZWFkeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNpZ25hbFJlYWR5ID0gdGhpcy5fb25EaWRTaWduYWxSZWFkeS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERlc3Ryb3kgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWREZXN0cm95ID0gdGhpcy5fb25EaWREZXN0cm95LmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Ly8jcmVnaW9uIFByb3BlcnRpZXNcblxuXHRwcml2YXRlIF9pZDogbnVtYmVyO1xuXHRnZXQgaWQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX2lkOyB9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF93aW46IGVsZWN0cm9uLkJyb3dzZXJXaW5kb3c7XG5cblx0Z2V0IGJhY2t1cFBhdGgoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2NvbmZpZz8uYmFja3VwUGF0aDsgfVxuXG5cdGdldCBvcGVuZWRXb3Jrc3BhY2UoKTogSVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9jb25maWc/LndvcmtzcGFjZTsgfVxuXG5cdGdldCBwcm9maWxlKCk6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5jb25maWcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvZmlsZSA9IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmluZChwcm9maWxlID0+IHByb2ZpbGUuaWQgPT09IHRoaXMuY29uZmlnPy5wcm9maWxlcy5wcm9maWxlLmlkKTtcblx0XHRpZiAodGhpcy5pc0V4dGVuc2lvbkRldmVsb3BtZW50SG9zdCAmJiBwcm9maWxlKSB7XG5cdFx0XHRyZXR1cm4gcHJvZmlsZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5nZXRQcm9maWxlRm9yV29ya3NwYWNlKHRoaXMuY29uZmlnLndvcmtzcGFjZSA/PyB0b1dvcmtzcGFjZUlkZW50aWZpZXIodGhpcy5iYWNrdXBQYXRoLCB0aGlzLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnRIb3N0KSkgPz8gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZTtcblx0fVxuXG5cdGdldCByZW1vdGVBdXRob3JpdHkoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2NvbmZpZz8ucmVtb3RlQXV0aG9yaXR5OyB9XG5cblx0cHJpdmF0ZSBfY29uZmlnOiBJTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZDtcblx0Z2V0IGNvbmZpZygpOiBJTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9jb25maWc7IH1cblxuXHRnZXQgaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3QoKTogYm9vbGVhbiB7IHJldHVybiAhISh0aGlzLl9jb25maWc/LmV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCk7IH1cblxuXHRnZXQgaXNFeHRlbnNpb25UZXN0SG9zdCgpOiBib29sZWFuIHsgcmV0dXJuICEhKHRoaXMuX2NvbmZpZz8uZXh0ZW5zaW9uVGVzdHNQYXRoKTsgfVxuXG5cdGdldCBpc0V4dGVuc2lvbkRldmVsb3BtZW50VGVzdEZyb21DbGkoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnRIb3N0ICYmIHRoaXMuaXNFeHRlbnNpb25UZXN0SG9zdCAmJiAhdGhpcy5fY29uZmlnPy5kZWJ1Z0lkOyB9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSByZWFkb25seSB3aW5kb3dTdGF0ZTogSVdpbmRvd1N0YXRlO1xuXHRwcml2YXRlIGN1cnJlbnRNZW51QmFyVmlzaWJpbGl0eTogTWVudUJhclZpc2liaWxpdHkgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aGVuUmVhZHlDYWxsYmFja3M6IHsgKHdpbmRvdzogSUNvZGVXaW5kb3cpOiB2b2lkIH1bXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdG91Y2hCYXJHcm91cHM6IGVsZWN0cm9uLlRvdWNoQmFyU2VnbWVudGVkQ29udHJvbFtdID0gW107XG5cblx0cHJpdmF0ZSBjdXJyZW50SHR0cFByb3h5OiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VycmVudE5vUHJveHk6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGN1c3RvbVpvb21MZXZlbDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29uZmlnT2JqZWN0VXJsOiBJSVBDT2JqZWN0VXJsPElOYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uPjtcblx0cHJpdmF0ZSBwZW5kaW5nTG9hZENvbmZpZzogSU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgd2FzTG9hZGVkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBqc0NhbGxTdGFja01hcDogTWFwPHN0cmluZywgbnVtYmVyPjtcblx0cHJpdmF0ZSByZWFkb25seSBqc0NhbGxTdGFja0VmZmVjdGl2ZVNhbXBsZUNvdW50OiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkganNDYWxsU3RhY2tDb2xsZWN0b3I6IERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgcmVhZG9ubHkganNDYWxsU3RhY2tDb2xsZWN0b3JTdG9wU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbmZpZzogSVdpbmRvd0NyZWF0aW9uT3B0aW9ucyxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElMb2dnZXJNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ2dlck1haW5TZXJ2aWNlOiBJTG9nZ2VyTWFpblNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIGVudmlyb25tZW50TWFpblNlcnZpY2U6IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlLFxuXHRcdEBJUG9saWN5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBvbGljeVNlcnZpY2U6IElQb2xpY3lTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzTWFpblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElBcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlOiBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlTWFpblNlcnZpY2U6IElTdG9yYWdlTWFpblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lTWFpblNlcnZpY2U6IElUaGVtZU1haW5TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2U6IElXb3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLFxuXHRcdEBJQmFja3VwTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBiYWNrdXBNYWluU2VydmljZTogSUJhY2t1cE1haW5TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dNYWluU2VydmljZTogSURpYWxvZ01haW5TZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVNYWluU2VydmljZTogSUxpZmVjeWNsZU1haW5TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJUHJvdG9jb2xNYWluU2VydmljZSBwcm90b2NvbE1haW5TZXJ2aWNlOiBJUHJvdG9jb2xNYWluU2VydmljZSxcblx0XHRASVdpbmRvd3NNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdpbmRvd3NNYWluU2VydmljZTogSVdpbmRvd3NNYWluU2VydmljZSxcblx0XHRASVN0YXRlU2VydmljZSBzdGF0ZVNlcnZpY2U6IElTdGF0ZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzdGF0ZVNlcnZpY2UsIGVudmlyb25tZW50TWFpblNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXG5cdFx0Ly8jcmVnaW9uIGNyZWF0ZSBicm93c2VyIHdpbmRvd1xuXHRcdHtcblx0XHRcdHRoaXMuY29uZmlnT2JqZWN0VXJsID0gdGhpcy5fcmVnaXN0ZXIocHJvdG9jb2xNYWluU2VydmljZS5jcmVhdGVJUENPYmplY3RVcmw8SU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24+KCkpO1xuXG5cdFx0XHQvLyBMb2FkIHdpbmRvdyBzdGF0ZVxuXHRcdFx0Y29uc3QgW3N0YXRlLCBoYXNNdWx0aXBsZURpc3BsYXlzXSA9IHRoaXMucmVzdG9yZVdpbmRvd1N0YXRlKGNvbmZpZy5zdGF0ZSk7XG5cdFx0XHR0aGlzLndpbmRvd1N0YXRlID0gc3RhdGU7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3dpbmRvdyNjdG9yOiB1c2luZyB3aW5kb3cgc3RhdGUnLCBzdGF0ZSk7XG5cblx0XHRcdGNvbnN0IHdlYlByZWZlcmVuY2VzOiBlbGVjdHJvbi5XZWJQcmVmZXJlbmNlcyA9IHtcblx0XHRcdFx0cHJlbG9hZDogRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL2Jhc2UvcGFydHMvc2FuZGJveC9lbGVjdHJvbi1icm93c2VyL3ByZWxvYWQuanMnKS5mc1BhdGgsXG5cdFx0XHRcdGFkZGl0aW9uYWxBcmd1bWVudHM6IFtgLS12c2NvZGUtd2luZG93LWNvbmZpZz0ke3RoaXMuY29uZmlnT2JqZWN0VXJsLnJlc291cmNlLnRvU3RyaW5nKCl9YF0sXG5cdFx0XHRcdHY4Q2FjaGVPcHRpb25zOiB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UudXNlQ29kZUNhY2hlID8gJ2J5cGFzc0hlYXRDaGVjaycgOiAnbm9uZSdcblx0XHRcdH07XG5cdFx0XHRpZiAoY29uZmlnLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdFx0d2ViUHJlZmVyZW5jZXMuYmFja2dyb3VuZFRocm90dGxpbmcgPSBmYWxzZTsgLy8ga2VlcCBhZ2VudHMgd2luZG93IHJlc3BvbnNpdmUgd2hlbiBpbiBiYWNrZ3JvdW5kXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9wdGlvbnMgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihkZWZhdWx0QnJvd3NlcldpbmRvd09wdGlvbnMsIHRoaXMud2luZG93U3RhdGUsIHVuZGVmaW5lZCwgd2ViUHJlZmVyZW5jZXMpO1xuXG5cdFx0XHQvLyBDcmVhdGUgdGhlIGJyb3dzZXIgd2luZG93XG5cdFx0XHRtYXJrKCdjb2RlL3dpbGxDcmVhdGVDb2RlQnJvd3NlcldpbmRvdycpO1xuXHRcdFx0dGhpcy5fd2luID0gbmV3IGVsZWN0cm9uLkJyb3dzZXJXaW5kb3cob3B0aW9ucyk7XG5cdFx0XHRtYXJrKCdjb2RlL2RpZENyZWF0ZUNvZGVCcm93c2VyV2luZG93Jyk7XG5cblx0XHRcdHRoaXMuX2lkID0gdGhpcy5fd2luLmlkO1xuXHRcdFx0dGhpcy5zZXRXaW4odGhpcy5fd2luLCBvcHRpb25zKTtcblxuXHRcdFx0Ly8gQXBwbHkgc29tZSBzdGF0ZSBhZnRlciB3aW5kb3cgY3JlYXRpb25cblx0XHRcdHRoaXMuYXBwbHlTdGF0ZSh0aGlzLndpbmRvd1N0YXRlLCBoYXNNdWx0aXBsZURpc3BsYXlzKTtcblxuXHRcdFx0dGhpcy5fbGFzdEZvY3VzVGltZSA9IERhdGUubm93KCk7IC8vIHNpbmNlIHdlIHNob3cgZGlyZWN0bHksIHdlIG5lZWQgdG8gc2V0IHRoZSBsYXN0IGZvY3VzIHRpbWUgdG9vXG5cdFx0fVxuXHRcdC8vI2VuZHJlZ2lvblxuXG5cdFx0Ly8jcmVnaW9uIEpTIENhbGxzdGFjayBDb2xsZWN0b3JcblxuXHRcdGxldCBzYW1wbGVJbnRlcnZhbCA9IHBhcnNlSW50KHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzWyd1bnJlc3BvbnNpdmUtc2FtcGxlLWludGVydmFsJ10gfHwgJzEwMDAnKTtcblx0XHRsZXQgc2FtcGxlUGVyaW9kID0gcGFyc2VJbnQodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3NbJ3VucmVzcG9uc2l2ZS1zYW1wbGUtcGVyaW9kJ10gfHwgJzE1MDAwJyk7XG5cdFx0aWYgKHNhbXBsZUludGVydmFsIDw9IDAgfHwgc2FtcGxlUGVyaW9kIDw9IDAgfHwgc2FtcGxlSW50ZXJ2YWwgPiBzYW1wbGVQZXJpb2QpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBJbnZhbGlkIHVucmVzcG9uc2l2ZSBzYW1wbGUgaW50ZXJ2YWwgKCR7c2FtcGxlSW50ZXJ2YWx9bXMpIG9yIHBlcmlvZCAoJHtzYW1wbGVQZXJpb2R9bXMpLCB1c2luZyBkZWZhdWx0cy5gKTtcblx0XHRcdHNhbXBsZUludGVydmFsID0gMTAwMDtcblx0XHRcdHNhbXBsZVBlcmlvZCA9IDE1MDAwO1xuXHRcdH1cblxuXHRcdHRoaXMuanNDYWxsU3RhY2tNYXAgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdHRoaXMuanNDYWxsU3RhY2tFZmZlY3RpdmVTYW1wbGVDb3VudCA9IE1hdGgucm91bmQoc2FtcGxlUGVyaW9kIC8gc2FtcGxlSW50ZXJ2YWwpO1xuXHRcdHRoaXMuanNDYWxsU3RhY2tDb2xsZWN0b3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPihzYW1wbGVJbnRlcnZhbCkpO1xuXHRcdHRoaXMuanNDYWxsU3RhY2tDb2xsZWN0b3JTdG9wU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5zdG9wQ29sbGVjdGluZ0pTY2FsbFN0YWNrcygpOyAvLyBTdG9wIGNvbGxlY3RpbmcgYWZ0ZXIgMTVzIG1heFxuXHRcdH0sIHNhbXBsZVBlcmlvZCkpO1xuXG5cdFx0Ly8jZW5kcmVnaW9uXG5cblx0XHQvLyByZXNwZWN0IGNvbmZpZ3VyZWQgbWVudSBiYXIgdmlzaWJpbGl0eVxuXHRcdHRoaXMub25Db25maWd1cmF0aW9uVXBkYXRlZCgpO1xuXG5cdFx0Ly8gbWFjT1M6IHRvdWNoIGJhciBzdXBwb3J0XG5cdFx0dGhpcy5jcmVhdGVUb3VjaEJhcigpO1xuXG5cdFx0Ly8gRXZlbnRpbmdcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWR5U3RhdGUgPSBSZWFkeVN0YXRlLk5PTkU7XG5cblx0c2V0UmVhZHkoKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGB3aW5kb3cjbG9hZDogd2luZG93IHJlcG9ydGVkIHJlYWR5IChpZDogJHt0aGlzLl9pZH0pYCk7XG5cblx0XHR0aGlzLnJlYWR5U3RhdGUgPSBSZWFkeVN0YXRlLlJFQURZO1xuXG5cdFx0Ly8gaW5mb3JtIGFsbCB3YWl0aW5nIHByb21pc2VzIHRoYXQgd2UgYXJlIHJlYWR5IG5vd1xuXHRcdHdoaWxlICh0aGlzLndoZW5SZWFkeUNhbGxiYWNrcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMud2hlblJlYWR5Q2FsbGJhY2tzLnBvcCgpISh0aGlzKTtcblx0XHR9XG5cblx0XHQvLyBFdmVudHNcblx0XHR0aGlzLl9vbkRpZFNpZ25hbFJlYWR5LmZpcmUoKTtcblx0fVxuXG5cdHJlYWR5KCk6IFByb21pc2U8SUNvZGVXaW5kb3c+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SUNvZGVXaW5kb3c+KHJlc29sdmUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNSZWFkeSkge1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZSh0aGlzKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gb3RoZXJ3aXNlIGtlZXAgYW5kIGNhbGwgbGF0ZXIgd2hlbiB3ZSBhcmUgcmVhZHlcblx0XHRcdHRoaXMud2hlblJlYWR5Q2FsbGJhY2tzLnB1c2gocmVzb2x2ZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgaXNSZWFkeSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5yZWFkeVN0YXRlID09PSBSZWFkeVN0YXRlLlJFQURZO1xuXHR9XG5cblx0Z2V0IHdoZW5DbG9zZWRPckxvYWRlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cblx0XHRcdGZ1bmN0aW9uIGhhbmRsZSgpIHtcblx0XHRcdFx0Y2xvc2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdGxvYWRMaXN0ZW5lci5kaXNwb3NlKCk7XG5cblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjbG9zZUxpc3RlbmVyID0gdGhpcy5vbkRpZENsb3NlKCgpID0+IGhhbmRsZSgpKTtcblx0XHRcdGNvbnN0IGxvYWRMaXN0ZW5lciA9IHRoaXMub25XaWxsTG9hZCgoKSA9PiBoYW5kbGUoKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gV2luZG93IGVycm9yIGNvbmRpdGlvbnMgdG8gaGFuZGxlXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIodGhpcy5fd2luLCAndW5yZXNwb25zaXZlJykoKCkgPT4gdGhpcy5vbldpbmRvd0Vycm9yKFdpbmRvd0Vycm9yLlVOUkVTUE9OU0lWRSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcih0aGlzLl93aW4sICdyZXNwb25zaXZlJykoKCkgPT4gdGhpcy5vbldpbmRvd0Vycm9yKFdpbmRvd0Vycm9yLlJFU1BPTlNJVkUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXIodGhpcy5fd2luLndlYkNvbnRlbnRzLCAncmVuZGVyLXByb2Nlc3MtZ29uZScsIChldmVudCwgZGV0YWlscykgPT4gZGV0YWlscykoZGV0YWlscyA9PiB0aGlzLm9uV2luZG93RXJyb3IoV2luZG93RXJyb3IuUFJPQ0VTU19HT05FLCB7IC4uLmRldGFpbHMgfSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcih0aGlzLl93aW4ud2ViQ29udGVudHMsICdkaWQtZmFpbC1sb2FkJywgKGV2ZW50LCBleGl0Q29kZSwgcmVhc29uKSA9PiAoeyBleGl0Q29kZSwgcmVhc29uIH0pKSgoeyBleGl0Q29kZSwgcmVhc29uIH0pID0+IHRoaXMub25XaW5kb3dFcnJvcihXaW5kb3dFcnJvci5MT0FELCB7IHJlYXNvbiwgZXhpdENvZGUgfSkpKTtcblxuXHRcdC8vIFByZXZlbnQgd2luZG93cy9pZnJhbWVzIGZyb20gYmxvY2tpbmcgdGhlIHVubG9hZFxuXHRcdC8vIHRocm91Z2ggRE9NIGV2ZW50cy4gV2UgaGF2ZSBvdXIgb3duIGxvZ2ljIGZvclxuXHRcdC8vIHVubG9hZGluZyBhIHdpbmRvdyB0aGF0IHNob3VsZCBub3QgYmUgY29uZnVzZWRcblx0XHQvLyB3aXRoIHRoZSBET00gd2F5LlxuXHRcdC8vIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTIyNzM2KVxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPGVsZWN0cm9uLkV2ZW50Pih0aGlzLl93aW4ud2ViQ29udGVudHMsICd3aWxsLXByZXZlbnQtdW5sb2FkJykoZXZlbnQgPT4gZXZlbnQucHJldmVudERlZmF1bHQoKSkpO1xuXG5cdFx0Ly8gUmVtZW1iZXIgdGhhdCB3ZSBsb2FkZWRcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcih0aGlzLl93aW4ud2ViQ29udGVudHMsICdkaWQtZmluaXNoLWxvYWQnKSgoKSA9PiB7XG5cblx0XHRcdC8vIEFzc29jaWF0ZSBwcm9wZXJ0aWVzIGZyb20gdGhlIGxvYWQgcmVxdWVzdCBpZiBwcm92aWRlZFxuXHRcdFx0aWYgKHRoaXMucGVuZGluZ0xvYWRDb25maWcpIHtcblx0XHRcdFx0dGhpcy5fY29uZmlnID0gdGhpcy5wZW5kaW5nTG9hZENvbmZpZztcblxuXHRcdFx0XHR0aGlzLnBlbmRpbmdMb2FkQ29uZmlnID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdpbmRvdyAoVW4pTWF4aW1pemVcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkTWF4aW1pemUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvbmZpZykge1xuXHRcdFx0XHR0aGlzLl9jb25maWcubWF4aW1pemVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkVW5tYXhpbWl6ZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY29uZmlnKSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZy5tYXhpbWl6ZWQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBXaW5kb3cgRnVsbHNjcmVlblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRFbnRlckZ1bGxTY3JlZW4oKCkgPT4ge1xuXHRcdFx0dGhpcy5zZW5kV2hlblJlYWR5KCd2c2NvZGU6ZW50ZXJGdWxsU2NyZWVuJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZExlYXZlRnVsbFNjcmVlbigoKSA9PiB7XG5cdFx0XHR0aGlzLnNlbmRXaGVuUmVhZHkoJ3ZzY29kZTpsZWF2ZUZ1bGxTY3JlZW4nLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9KSk7XG5cblx0XHQvLyBIYW5kbGUgY29uZmlndXJhdGlvbiBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB0aGlzLm9uQ29uZmlndXJhdGlvblVwZGF0ZWQoZSkpKTtcblxuXHRcdC8vIEhhbmRsZSBXb3Jrc3BhY2UgZXZlbnRzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLm9uRGlkRGVsZXRlVW50aXRsZWRXb3Jrc3BhY2UoZSA9PiB0aGlzLm9uRGlkRGVsZXRlVW50aXRsZWRXb3Jrc3BhY2UoZSkpKTtcblxuXHRcdC8vIEluamVjdCBoZWFkZXJzIHdoZW4gcmVxdWVzdHMgYXJlIGluY29taW5nXG5cdFx0Y29uc3QgdXJscyA9IFsnaHR0cHM6Ly8qLnZzYXNzZXRzLmlvLyonXTtcblx0XHRpZiAodGhpcy5wcm9kdWN0U2VydmljZS5leHRlbnNpb25zR2FsbGVyeT8uc2VydmljZVVybCkge1xuXHRcdFx0Y29uc3Qgc2VydmljZVVybCA9IFVSSS5wYXJzZSh0aGlzLnByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvbnNHYWxsZXJ5LnNlcnZpY2VVcmwpO1xuXHRcdFx0dXJscy5wdXNoKGAke3NlcnZpY2VVcmwuc2NoZW1lfTovLyR7c2VydmljZVVybC5hdXRob3JpdHl9LypgKTtcblx0XHR9XG5cdFx0dGhpcy5fd2luLndlYkNvbnRlbnRzLnNlc3Npb24ud2ViUmVxdWVzdC5vbkJlZm9yZVNlbmRIZWFkZXJzKHsgdXJscyB9LCBhc3luYyAoZGV0YWlscywgY2IpID0+IHtcblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBhd2FpdCB0aGlzLmdldE1hcmtldHBsYWNlSGVhZGVycygpO1xuXG5cdFx0XHRjYih7IGNhbmNlbDogZmFsc2UsIHJlcXVlc3RIZWFkZXJzOiBPYmplY3QuYXNzaWduKGRldGFpbHMucmVxdWVzdEhlYWRlcnMsIGhlYWRlcnMpIH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXJrZXRwbGFjZUhlYWRlcnNQcm9taXNlOiBQcm9taXNlPG9iamVjdD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0TWFya2V0cGxhY2VIZWFkZXJzKCk6IFByb21pc2U8b2JqZWN0PiB7XG5cdFx0aWYgKCF0aGlzLm1hcmtldHBsYWNlSGVhZGVyc1Byb21pc2UpIHtcblx0XHRcdHRoaXMubWFya2V0cGxhY2VIZWFkZXJzUHJvbWlzZSA9IHJlc29sdmVNYXJrZXRwbGFjZUhlYWRlcnMoXG5cdFx0XHRcdHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbixcblx0XHRcdFx0dGhpcy5wcm9kdWN0U2VydmljZSxcblx0XHRcdFx0dGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLmZpbGVTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm1hcmtldHBsYWNlSGVhZGVyc1Byb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uV2luZG93RXJyb3IoZXJyb3I6IFdpbmRvd0Vycm9yLlVOUkVTUE9OU0lWRSk6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgYXN5bmMgb25XaW5kb3dFcnJvcihlcnJvcjogV2luZG93RXJyb3IuUkVTUE9OU0lWRSk6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgYXN5bmMgb25XaW5kb3dFcnJvcihlcnJvcjogV2luZG93RXJyb3IuUFJPQ0VTU19HT05FLCBkZXRhaWxzOiB7IHJlYXNvbjogc3RyaW5nOyBleGl0Q29kZTogbnVtYmVyIH0pOiBQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIGFzeW5jIG9uV2luZG93RXJyb3IoZXJyb3I6IFdpbmRvd0Vycm9yLkxPQUQsIGRldGFpbHM6IHsgcmVhc29uOiBzdHJpbmc7IGV4aXRDb2RlOiBudW1iZXIgfSk6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgYXN5bmMgb25XaW5kb3dFcnJvcih0eXBlOiBXaW5kb3dFcnJvciwgZGV0YWlscz86IHsgcmVhc29uPzogc3RyaW5nOyBleGl0Q29kZT86IG51bWJlciB9KTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgV2luZG93RXJyb3IuUFJPQ0VTU19HT05FOlxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYENvZGVXaW5kb3c6IHJlbmRlcmVyIHByb2Nlc3MgZ29uZSAocmVhc29uOiAke2RldGFpbHM/LnJlYXNvbiB8fCAnPHVua25vd24+J30sIGNvZGU6ICR7ZGV0YWlscz8uZXhpdENvZGUgfHwgJzx1bmtub3duPid9KWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgV2luZG93RXJyb3IuVU5SRVNQT05TSVZFOlxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0NvZGVXaW5kb3c6IGRldGVjdGVkIHVucmVzcG9uc2l2ZScpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgV2luZG93RXJyb3IuUkVTUE9OU0lWRTpcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdDb2RlV2luZG93OiByZWNvdmVyZWQgZnJvbSB1bnJlc3BvbnNpdmUnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFdpbmRvd0Vycm9yLkxPQUQ6XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgQ29kZVdpbmRvdzogZmFpbGVkIHRvIGxvYWQgKHJlYXNvbjogJHtkZXRhaWxzPy5yZWFzb24gfHwgJzx1bmtub3duPid9LCBjb2RlOiAke2RldGFpbHM/LmV4aXRDb2RlIHx8ICc8dW5rbm93bj4nfSlgKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Ly8gVGVsZW1ldHJ5XG5cdFx0dHlwZSBXaW5kb3dFcnJvckNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0dHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSB0eXBlIG9mIHdpbmRvdyBlcnJvciB0byB1bmRlcnN0YW5kIHRoZSBuYXR1cmUgb2YgdGhlIGVycm9yIGJldHRlci4nIH07XG5cdFx0XHRyZWFzb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgcmVhc29uIG9mIHRoZSB3aW5kb3cgZXJyb3IgdG8gdW5kZXJzdGFuZCB0aGUgbmF0dXJlIG9mIHRoZSBlcnJvciBiZXR0ZXIuJyB9O1xuXHRcdFx0Y29kZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBleGl0IGNvZGUgb2YgdGhlIHdpbmRvdyBwcm9jZXNzIHRvIHVuZGVyc3RhbmQgdGhlIG5hdHVyZSBvZiB0aGUgZXJyb3IgYmV0dGVyJyB9O1xuXHRcdFx0b3duZXI6ICdicGFzZXJvJztcblx0XHRcdGNvbW1lbnQ6ICdQcm92aWRlcyBpbnNpZ2h0IGludG8gcmVhc29ucyB0aGUgdnNjb2RlIHdpbmRvdyBoYWQgYW4gZXJyb3IuJztcblx0XHR9O1xuXHRcdHR5cGUgV2luZG93RXJyb3JFdmVudCA9IHtcblx0XHRcdHR5cGU6IFdpbmRvd0Vycm9yO1xuXHRcdFx0cmVhc29uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb2RlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0fTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXaW5kb3dFcnJvckV2ZW50LCBXaW5kb3dFcnJvckNsYXNzaWZpY2F0aW9uPignd2luZG93ZXJyb3InLCB7XG5cdFx0XHR0eXBlLFxuXHRcdFx0cmVhc29uOiBkZXRhaWxzPy5yZWFzb24sXG5cdFx0XHRjb2RlOiBkZXRhaWxzPy5leGl0Q29kZVxuXHRcdH0pO1xuXG5cdFx0Ly8gSW5mb3JtIFVzZXIgaWYgbm9uLXJlY292ZXJhYmxlXG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlIFdpbmRvd0Vycm9yLlVOUkVTUE9OU0lWRTpcblx0XHRcdGNhc2UgV2luZG93RXJyb3IuUFJPQ0VTU19HT05FOlxuXG5cdFx0XHRcdC8vIElmIHdlIHJ1biBleHRlbnNpb24gdGVzdHMgZnJvbSBDTEksIHdlIHdhbnQgdG8gc2lnbmFsXG5cdFx0XHRcdC8vIGJhY2sgdGhpcyBzdGF0ZSB0byB0aGUgdGVzdCBydW5uZXIgYnkgZXhpdGluZyB3aXRoIGFcblx0XHRcdFx0Ly8gbm9uLXplcm8gZXhpdCBjb2RlLlxuXHRcdFx0XHRpZiAodGhpcy5pc0V4dGVuc2lvbkRldmVsb3BtZW50VGVzdEZyb21DbGkpIHtcblx0XHRcdFx0XHR0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLmtpbGwoMSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgd2UgcnVuIHNtb2tlIHRlc3RzLCB3YW50IHRvIHByb2NlZWQgd2l0aCBhbiBvcmRlcmx5XG5cdFx0XHRcdC8vIHNodXRkb3duIGFzIG11Y2ggYXMgcG9zc2libGUgYnkgZGVzdHJveWluZyB0aGUgd2luZG93XG5cdFx0XHRcdC8vIGFuZCB0aGVuIGNhbGxpbmcgdGhlIG5vcm1hbCBgcXVpdGAgcm91dGluZS5cblx0XHRcdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hcmdzWydlbmFibGUtc21va2UtdGVzdC1kcml2ZXInXSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZGVzdHJveVdpbmRvdyhmYWxzZSwgZmFsc2UpO1xuXHRcdFx0XHRcdHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2UucXVpdCgpOyAvLyBzdGlsbCBhbGxvdyBmb3IgYW4gb3JkZXJseSBzaHV0ZG93blxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFVucmVzcG9uc2l2ZVxuXHRcdFx0XHRpZiAodHlwZSA9PT0gV2luZG93RXJyb3IuVU5SRVNQT05TSVZFKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3QgfHwgdGhpcy5pc0V4dGVuc2lvblRlc3RIb3N0IHx8IHRoaXMuX3dpbj8ud2ViQ29udGVudHM/LmlzRGV2VG9vbHNPcGVuZWQoKSkge1xuXHRcdFx0XHRcdFx0Ly8gVE9ET0BlbGVjdHJvbiBXb3JrYXJvdW5kIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNTY5OTRcblx0XHRcdFx0XHRcdC8vIEluIGNlcnRhaW4gY2FzZXMgdGhlIHdpbmRvdyBjYW4gcmVwb3J0IHVucmVzcG9uc2l2ZW5lc3MgYmVjYXVzZSBhIGJyZWFrcG9pbnQgd2FzIGhpdFxuXHRcdFx0XHRcdFx0Ly8gYW5kIHRoZSBwcm9jZXNzIGlzIHN0b3BwZWQgZXhlY3V0aW5nLiBUaGUgbW9zdCB0eXBpY2FsIGNhc2VzIGFyZTpcblx0XHRcdFx0XHRcdC8vIC0gZGV2dG9vbHMgYXJlIG9wZW5lZCBhbmQgZGVidWdnaW5nIGhhcHBlbnNcblx0XHRcdFx0XHRcdC8vIC0gd2luZG93IGlzIGFuIGV4dGVuc2lvbnMgZGV2ZWxvcG1lbnQgaG9zdCB0aGF0IGlzIGJlaW5nIGRlYnVnZ2VkXG5cdFx0XHRcdFx0XHQvLyAtIHdpbmRvdyBpcyBhbiBleHRlbnNpb24gdGVzdCBkZXZlbG9wbWVudCBob3N0IHRoYXQgaXMgYmVpbmcgZGVidWdnZWRcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBJbnRlcnJ1cHQgVjggYW5kIGNvbGxlY3QgSmF2YVNjcmlwdCBzdGFja1xuXHRcdFx0XHRcdHRoaXMuanNDYWxsU3RhY2tDb2xsZWN0b3IudHJpZ2dlcigoKSA9PiB0aGlzLnN0YXJ0Q29sbGVjdGluZ0pTY2FsbFN0YWNrcygpKTtcblx0XHRcdFx0XHQvLyBTdGFjayBjb2xsZWN0aW9uIHdpbGwgc3RvcCB1bmRlciBhbnkgb2YgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuXHRcdFx0XHRcdC8vIC0gVGhlIHdpbmRvdyBiZWNvbWVzIHJlc3BvbnNpdmUgYWdhaW5cblx0XHRcdFx0XHQvLyAtIFRoZSB3aW5kb3cgaXMgZGVzdHJveWVkIGktZSByZW9wZW4gb3IgY2xvc2VkXG5cdFx0XHRcdFx0Ly8gLSBzYW1wbGluZyBwZXJpb2QgaXMgY29tcGxldGUsIGRlZmF1bHQgaXMgMTVzXG5cdFx0XHRcdFx0dGhpcy5qc0NhbGxTdGFja0NvbGxlY3RvclN0b3BTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblxuXHRcdFx0XHRcdC8vIFNob3cgRGlhbG9nXG5cdFx0XHRcdFx0Y29uc3QgeyByZXNwb25zZSwgY2hlY2tib3hDaGVja2VkIH0gPSBhd2FpdCB0aGlzLmRpYWxvZ01haW5TZXJ2aWNlLnNob3dNZXNzYWdlQm94KHtcblx0XHRcdFx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdyZW9wZW4nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZW9wZW5cIiksXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKHsga2V5OiAnY2xvc2UnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDbG9zZVwiKSxcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICd3YWl0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmS2VlcCBXYWl0aW5nXCIpXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2FwcFN0YWxsZWQnLCBcIlRoZSB3aW5kb3cgaXMgbm90IHJlc3BvbmRpbmdcIiksXG5cdFx0XHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhcHBTdGFsbGVkRGV0YWlsJywgXCJZb3UgY2FuIHJlb3BlbiBvciBjbG9zZSB0aGUgd2luZG93IG9yIGtlZXAgd2FpdGluZy5cIiksXG5cdFx0XHRcdFx0XHRjaGVja2JveExhYmVsOiB0aGlzLl9jb25maWc/LndvcmtzcGFjZSA/IGxvY2FsaXplKCdkb05vdFJlc3RvcmVFZGl0b3JzJywgXCJEb24ndCByZXN0b3JlIGVkaXRvcnNcIikgOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LCB0aGlzLl93aW4pO1xuXG5cdFx0XHRcdFx0Ly8gSGFuZGxlIGNob2ljZVxuXHRcdFx0XHRcdGlmIChyZXNwb25zZSAhPT0gMiAvKiBrZWVwIHdhaXRpbmcgKi8pIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlb3BlbiA9IHJlc3BvbnNlID09PSAwO1xuXHRcdFx0XHRcdFx0dGhpcy5zdG9wQ29sbGVjdGluZ0pTY2FsbFN0YWNrcygpO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5kZXN0cm95V2luZG93KHJlb3BlbiwgY2hlY2tib3hDaGVja2VkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBQcm9jZXNzIGdvbmVcblx0XHRcdFx0ZWxzZSBpZiAodHlwZSA9PT0gV2luZG93RXJyb3IuUFJPQ0VTU19HT05FKSB7XG5cdFx0XHRcdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRcdFx0XHRpZiAoIWRldGFpbHMpIHtcblx0XHRcdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnYXBwR29uZScsIFwiVGhlIHdpbmRvdyB0ZXJtaW5hdGVkIHVuZXhwZWN0ZWRseVwiKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdhcHBHb25lRGV0YWlscycsIFwiVGhlIHdpbmRvdyB0ZXJtaW5hdGVkIHVuZXhwZWN0ZWRseSAocmVhc29uOiAnezB9JywgY29kZTogJ3sxfScpXCIsIGRldGFpbHMucmVhc29uLCBkZXRhaWxzLmV4aXRDb2RlID8/ICc8dW5rbm93bj4nKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBTaG93IERpYWxvZ1xuXHRcdFx0XHRcdGNvbnN0IHsgcmVzcG9uc2UsIGNoZWNrYm94Q2hlY2tlZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dNYWluU2VydmljZS5zaG93TWVzc2FnZUJveCh7XG5cdFx0XHRcdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2NvbmZpZz8ud29ya3NwYWNlID8gbG9jYWxpemUoeyBrZXk6ICdyZW9wZW4nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZW9wZW5cIikgOiBsb2NhbGl6ZSh7IGtleTogJ25ld1dpbmRvdycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk5ldyBXaW5kb3dcIiksXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKHsga2V5OiAnY2xvc2UnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDbG9zZVwiKVxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRkZXRhaWw6IHRoaXMuX2NvbmZpZz8ud29ya3NwYWNlID9cblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2FwcEdvbmVEZXRhaWxXb3Jrc3BhY2UnLCBcIldlIGFyZSBzb3JyeSBmb3IgdGhlIGluY29udmVuaWVuY2UuIFlvdSBjYW4gcmVvcGVuIHRoZSB3aW5kb3cgdG8gY29udGludWUgd2hlcmUgeW91IGxlZnQgb2ZmLlwiKSA6XG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdhcHBHb25lRGV0YWlsRW1wdHlXaW5kb3cnLCBcIldlIGFyZSBzb3JyeSBmb3IgdGhlIGluY29udmVuaWVuY2UuIFlvdSBjYW4gb3BlbiBhIG5ldyBlbXB0eSB3aW5kb3cgdG8gc3RhcnQgYWdhaW4uXCIpLFxuXHRcdFx0XHRcdFx0Y2hlY2tib3hMYWJlbDogdGhpcy5fY29uZmlnPy53b3Jrc3BhY2UgPyBsb2NhbGl6ZSgnZG9Ob3RSZXN0b3JlRWRpdG9ycycsIFwiRG9uJ3QgcmVzdG9yZSBlZGl0b3JzXCIpIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSwgdGhpcy5fd2luKTtcblxuXHRcdFx0XHRcdC8vIEhhbmRsZSBjaG9pY2Vcblx0XHRcdFx0XHRjb25zdCByZW9wZW4gPSByZXNwb25zZSA9PT0gMDtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRlc3Ryb3lXaW5kb3cocmVvcGVuLCBjaGVja2JveENoZWNrZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBXaW5kb3dFcnJvci5SRVNQT05TSVZFOlxuXHRcdFx0XHR0aGlzLnN0b3BDb2xsZWN0aW5nSlNjYWxsU3RhY2tzKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGVzdHJveVdpbmRvdyhyZW9wZW46IGJvb2xlYW4sIHNraXBSZXN0b3JlRWRpdG9yczogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuX2NvbmZpZz8ud29ya3NwYWNlO1xuXG5cdFx0Ly8gY2hlY2sgdG8gZGlzY2FyZCBlZGl0b3Igc3RhdGUgZmlyc3Rcblx0XHRpZiAoc2tpcFJlc3RvcmVFZGl0b3JzICYmIHdvcmtzcGFjZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlU3RvcmFnZSA9IHRoaXMuc3RvcmFnZU1haW5TZXJ2aWNlLndvcmtzcGFjZVN0b3JhZ2Uod29ya3NwYWNlKTtcblx0XHRcdFx0YXdhaXQgd29ya3NwYWNlU3RvcmFnZS5pbml0KCk7XG5cdFx0XHRcdHdvcmtzcGFjZVN0b3JhZ2UuZGVsZXRlKCdtZW1lbnRvL3dvcmtiZW5jaC5wYXJ0cy5lZGl0b3InKTtcblx0XHRcdFx0YXdhaXQgd29ya3NwYWNlU3RvcmFnZS5jbG9zZSgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyAnY2xvc2UnIGV2ZW50IHdpbGwgbm90IGJlIGZpcmVkIG9uIGRlc3Ryb3koKSwgc28gc2lnbmFsIGNyYXNoIHZpYSBleHBsaWNpdCBldmVudFxuXHRcdHRoaXMuX29uRGlkRGVzdHJveS5maXJlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0Ly8gYXNrIHRoZSB3aW5kb3dzIHNlcnZpY2UgdG8gb3BlbiBhIG5ldyBmcmVzaCB3aW5kb3cgaWYgc3BlY2lmaWVkXG5cdFx0XHRpZiAocmVvcGVuICYmIHRoaXMuX2NvbmZpZykge1xuXG5cdFx0XHRcdC8vIFdlIGhhdmUgdG8gcmVjb25zdHJ1Y3QgYSBvcGVuYWJsZSBmcm9tIHRoZSBjdXJyZW50IHdvcmtzcGFjZVxuXHRcdFx0XHRsZXQgdXJpVG9PcGVuOiBJV29ya3NwYWNlVG9PcGVuIHwgSUZvbGRlclRvT3BlbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IGZvcmNlRW1wdHkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIod29ya3NwYWNlKSkge1xuXHRcdFx0XHRcdHVyaVRvT3BlbiA9IHsgZm9sZGVyVXJpOiB3b3Jrc3BhY2UudXJpIH07XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZSkpIHtcblx0XHRcdFx0XHR1cmlUb09wZW4gPSB7IHdvcmtzcGFjZVVyaTogd29ya3NwYWNlLmNvbmZpZ1BhdGggfTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRmb3JjZUVtcHR5ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIERlbGVnYXRlIHRvIHdpbmRvd3Mgc2VydmljZVxuXHRcdFx0XHRjb25zdCB3aW5kb3cgPSAoYXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub3Blbih7XG5cdFx0XHRcdFx0Y29udGV4dDogT3BlbkNvbnRleHQuQVBJLFxuXHRcdFx0XHRcdHVzZXJFbnY6IHRoaXMuX2NvbmZpZy51c2VyRW52LFxuXHRcdFx0XHRcdGNsaToge1xuXHRcdFx0XHRcdFx0Li4udGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3MsXG5cdFx0XHRcdFx0XHRfOiBbXSAvLyB3ZSBwYXNzIGluIHRoZSB3b3Jrc3BhY2UgdG8gb3BlbiBleHBsaWNpdGx5IHZpYSBgdXJpc1RvT3BlbmBcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHVyaXNUb09wZW46IHVyaVRvT3BlbiA/IFt1cmlUb09wZW5dIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGZvcmNlRW1wdHksXG5cdFx0XHRcdFx0Zm9yY2VOZXdXaW5kb3c6IHRydWUsXG5cdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB0aGlzLnJlbW90ZUF1dGhvcml0eVxuXHRcdFx0XHR9KSkuYXQoMCk7XG5cdFx0XHRcdHdpbmRvdz8uZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Ly8gbWFrZSBzdXJlIHRvIGRlc3Ryb3kgdGhlIHdpbmRvdyBhcyBpdHMgcmVuZGVyZXIgcHJvY2VzcyBpcyBnb25lLiBkbyB0aGlzXG5cdFx0XHQvLyBhZnRlciB0aGUgY29kZSBmb3IgcmVvcGVuaW5nIHRoZSB3aW5kb3csIHRvIHByZXZlbnQgdGhlIGVudGlyZSBhcHBsaWNhdGlvblxuXHRcdFx0Ly8gZnJvbSBxdWl0dGluZyB3aGVuIHRoZSBsYXN0IHdpbmRvdyBjbG9zZXMgYXMgYSByZXN1bHQuXG5cdFx0XHR0aGlzLl93aW4/LmRlc3Ryb3koKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkRGVsZXRlVW50aXRsZWRXb3Jrc3BhY2Uod29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllcik6IHZvaWQge1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHRvIHVwZGF0ZSBvdXIgd29ya3NwYWNlIGNvbmZpZyBpZiB3ZSBkZXRlY3QgdGhhdCBpdFxuXHRcdC8vIHdhcyBkZWxldGVkXG5cdFx0aWYgKHRoaXMuX2NvbmZpZz8ud29ya3NwYWNlPy5pZCA9PT0gd29ya3NwYWNlLmlkKSB7XG5cdFx0XHR0aGlzLl9jb25maWcud29ya3NwYWNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Db25maWd1cmF0aW9uVXBkYXRlZChlPzogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXG5cdFx0Ly8gU3dpcGUgY29tbWFuZCBzdXBwb3J0IChtYWNPUylcblx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgKCFlIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaC5lZGl0b3Iuc3dpcGVUb05hdmlnYXRlJykpKSB7XG5cdFx0XHRjb25zdCBzd2lwZVRvTmF2aWdhdGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCd3b3JrYmVuY2guZWRpdG9yLnN3aXBlVG9OYXZpZ2F0ZScpO1xuXHRcdFx0aWYgKHN3aXBlVG9OYXZpZ2F0ZSkge1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyU3dpcGVMaXN0ZW5lcigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zd2lwZUxpc3RlbmVyRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE1lbnViYXJcblx0XHRpZiAoIWUgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihNZW51U2V0dGluZ3MuTWVudUJhclZpc2liaWxpdHkpKSB7XG5cdFx0XHRjb25zdCBuZXdNZW51QmFyVmlzaWJpbGl0eSA9IHRoaXMuZ2V0TWVudUJhclZpc2liaWxpdHkoKTtcblx0XHRcdGlmIChuZXdNZW51QmFyVmlzaWJpbGl0eSAhPT0gdGhpcy5jdXJyZW50TWVudUJhclZpc2liaWxpdHkpIHtcblx0XHRcdFx0dGhpcy5jdXJyZW50TWVudUJhclZpc2liaWxpdHkgPSBuZXdNZW51QmFyVmlzaWJpbGl0eTtcblx0XHRcdFx0dGhpcy5zZXRNZW51QmFyVmlzaWJpbGl0eShuZXdNZW51QmFyVmlzaWJpbGl0eSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUHJveHlcblx0XHRpZiAoIWUgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignaHR0cC5wcm94eScpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2h0dHAubm9Qcm94eScpKSB7XG5cdFx0XHRjb25zdCBpbnNwZWN0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PHN0cmluZz4oJ2h0dHAucHJveHknKTtcblx0XHRcdGxldCBuZXdIdHRwUHJveHkgPSAoaW5zcGVjdC51c2VyTG9jYWxWYWx1ZSB8fCAnJykudHJpbSgpXG5cdFx0XHRcdHx8IChwcm9jZXNzLmVudlsnaHR0cHNfcHJveHknXSB8fCBwcm9jZXNzLmVudlsnSFRUUFNfUFJPWFknXSB8fCBwcm9jZXNzLmVudlsnaHR0cF9wcm94eSddIHx8IHByb2Nlc3MuZW52WydIVFRQX1BST1hZJ10gfHwgJycpLnRyaW0oKSAvLyBOb3Qgc3RhbmRhcmRpemVkLlxuXHRcdFx0XHR8fCB1bmRlZmluZWQ7XG5cblx0XHRcdGlmIChuZXdIdHRwUHJveHk/LmluZGV4T2YoJ0AnKSAhPT0gLTEpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKG5ld0h0dHBQcm94eSEpO1xuXHRcdFx0XHRjb25zdCBpID0gdXJpLmF1dGhvcml0eS5pbmRleE9mKCdAJyk7XG5cdFx0XHRcdGlmIChpICE9PSAtMSkge1xuXHRcdFx0XHRcdG5ld0h0dHBQcm94eSA9IHVyaS53aXRoKHsgYXV0aG9yaXR5OiB1cmkuYXV0aG9yaXR5LnN1YnN0cmluZyhpICsgMSkgfSlcblx0XHRcdFx0XHRcdC50b1N0cmluZygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAobmV3SHR0cFByb3h5Py5lbmRzV2l0aCgnLycpKSB7XG5cdFx0XHRcdG5ld0h0dHBQcm94eSA9IG5ld0h0dHBQcm94eS5zdWJzdHIoMCwgbmV3SHR0cFByb3h5Lmxlbmd0aCAtIDEpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuZXdOb1Byb3h5ID0gKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nW10+KCdodHRwLm5vUHJveHknKSB8fCBbXSkubWFwKChpdGVtKSA9PiBpdGVtLnRyaW0oKSkuam9pbignLCcpXG5cdFx0XHRcdHx8IChwcm9jZXNzLmVudlsnbm9fcHJveHknXSB8fCBwcm9jZXNzLmVudlsnTk9fUFJPWFknXSB8fCAnJykudHJpbSgpIHx8IHVuZGVmaW5lZDsgLy8gTm90IHN0YW5kYXJkaXplZC5cblx0XHRcdGlmICgobmV3SHR0cFByb3h5IHx8ICcnKS5pbmRleE9mKCdAJykgPT09IC0xICYmIChuZXdIdHRwUHJveHkgIT09IHRoaXMuY3VycmVudEh0dHBQcm94eSB8fCBuZXdOb1Byb3h5ICE9PSB0aGlzLmN1cnJlbnROb1Byb3h5KSkge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRIdHRwUHJveHkgPSBuZXdIdHRwUHJveHk7XG5cdFx0XHRcdHRoaXMuY3VycmVudE5vUHJveHkgPSBuZXdOb1Byb3h5O1xuXG5cdFx0XHRcdGNvbnN0IHByb3h5UnVsZXMgPSBuZXdIdHRwUHJveHkgfHwgJyc7XG5cdFx0XHRcdGNvbnN0IHByb3h5QnlwYXNzUnVsZXMgPSBuZXdOb1Byb3h5ID8gYCR7bmV3Tm9Qcm94eX0sPGxvY2FsPmAgOiAnPGxvY2FsPic7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgU2V0dGluZyBwcm94eSB0byAnJHtwcm94eVJ1bGVzfScsIGJ5cGFzc2luZyAnJHtwcm94eUJ5cGFzc1J1bGVzfSdgKTtcblx0XHRcdFx0dGhpcy5fd2luLndlYkNvbnRlbnRzLnNlc3Npb24uc2V0UHJveHkoeyBwcm94eVJ1bGVzLCBwcm94eUJ5cGFzc1J1bGVzLCBwYWNTY3JpcHQ6ICcnIH0pO1xuXHRcdFx0XHRlbGVjdHJvbi5hcHAuc2V0UHJveHkoeyBwcm94eVJ1bGVzLCBwcm94eUJ5cGFzc1J1bGVzLCBwYWNTY3JpcHQ6ICcnIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3dpcGVMaXN0ZW5lckRpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSByZWdpc3RlclN3aXBlTGlzdGVuZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5zd2lwZUxpc3RlbmVyRGlzcG9zYWJsZS52YWx1ZSA9IEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPHN0cmluZz4odGhpcy5fd2luLCAnc3dpcGUnLCAoZXZlbnQ6IEVsZWN0cm9uLkV2ZW50LCBjbWQ6IHN0cmluZykgPT4gY21kKShjbWQgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmlzUmVhZHkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyB3aW5kb3cgbXVzdCBiZSByZWFkeVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY21kID09PSAnbGVmdCcpIHtcblx0XHRcdFx0dGhpcy5zZW5kKCd2c2NvZGU6cnVuQWN0aW9uJywgeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9yJywgZnJvbTogJ21vdXNlJyB9KTtcblx0XHRcdH0gZWxzZSBpZiAoY21kID09PSAncmlnaHQnKSB7XG5cdFx0XHRcdHRoaXMuc2VuZCgndnNjb2RlOnJ1bkFjdGlvbicsIHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5OZXh0UmVjZW50bHlVc2VkRWRpdG9yJywgZnJvbTogJ21vdXNlJyB9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFkZFRhYmJlZFdpbmRvdyh3aW5kb3c6IElDb2RlV2luZG93KTogdm9pZCB7XG5cdFx0aWYgKGlzTWFjaW50b3NoICYmIHdpbmRvdy53aW4pIHtcblx0XHRcdHRoaXMuX3dpbi5hZGRUYWJiZWRXaW5kb3cod2luZG93Lndpbik7XG5cdFx0fVxuXHR9XG5cblx0bG9hZChjb25maWd1cmF0aW9uOiBJTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbiwgb3B0aW9uczogSUxvYWRPcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKSk6IHZvaWQge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgd2luZG93I2xvYWQ6IGF0dGVtcHQgdG8gbG9hZCB3aW5kb3cgKGlkOiAke3RoaXMuX2lkfSlgKTtcblxuXHRcdC8vIENsZWFyIERvY3VtZW50IEVkaXRlZCBpZiBuZWVkZWRcblx0XHRpZiAodGhpcy5pc0RvY3VtZW50RWRpdGVkKCkpIHtcblx0XHRcdGlmICghb3B0aW9ucy5pc1JlbG9hZCB8fCAhdGhpcy5iYWNrdXBNYWluU2VydmljZS5pc0hvdEV4aXRFbmFibGVkKCkpIHtcblx0XHRcdFx0dGhpcy5zZXREb2N1bWVudEVkaXRlZChmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgVGl0bGUgYW5kIEZpbGVuYW1lIGlmIG5lZWRlZFxuXHRcdGlmICghb3B0aW9ucy5pc1JlbG9hZCkge1xuXHRcdFx0aWYgKHRoaXMuZ2V0UmVwcmVzZW50ZWRGaWxlbmFtZSgpKSB7XG5cdFx0XHRcdHRoaXMuc2V0UmVwcmVzZW50ZWRGaWxlbmFtZSgnJyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3dpbi5zZXRUaXRsZSh0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgY29uZmlndXJhdGlvbiB2YWx1ZXMgYmFzZWQgb24gb3VyIHdpbmRvdyBjb250ZXh0XG5cdFx0Ly8gYW5kIHNldCBpdCBpbnRvIHRoZSBjb25maWcgb2JqZWN0IFVSTCBmb3IgdXNhZ2UuXG5cdFx0dGhpcy51cGRhdGVDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb24sIG9wdGlvbnMpO1xuXG5cdFx0Ly8gSWYgdGhpcyBpcyB0aGUgZmlyc3QgdGltZSB0aGUgd2luZG93IGlzIGxvYWRlZCwgd2UgYXNzb2NpYXRlIHRoZSBwYXRoc1xuXHRcdC8vIGRpcmVjdGx5IHdpdGggdGhlIHdpbmRvdyBiZWNhdXNlIHdlIGFzc3VtZSB0aGUgbG9hZGluZyB3aWxsIGp1c3Qgd29ya1xuXHRcdGlmICh0aGlzLnJlYWR5U3RhdGUgPT09IFJlYWR5U3RhdGUuTk9ORSkge1xuXHRcdFx0dGhpcy5fY29uZmlnID0gY29uZmlndXJhdGlvbjtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UsIHRoZSB3aW5kb3cgaXMgY3VycmVudGx5IHNob3dpbmcgYSBmb2xkZXIgYW5kIGlmIHRoZXJlIGlzIGFuXG5cdFx0Ly8gdW5sb2FkIGhhbmRsZXIgcHJldmVudGluZyB0aGUgbG9hZCwgd2UgY2Fubm90IGp1c3QgYXNzb2NpYXRlIHRoZSBwYXRoc1xuXHRcdC8vIGJlY2F1c2UgdGhlIGxvYWRpbmcgbWlnaHQgYmUgdmV0b2VkLiBJbnN0ZWFkIHdlIGFzc29jaWF0ZSBpdCBsYXRlciB3aGVuXG5cdFx0Ly8gdGhlIHdpbmRvdyBsb2FkIGV2ZW50IGhhcyBmaXJlZC5cblx0XHRlbHNlIHtcblx0XHRcdHRoaXMucGVuZGluZ0xvYWRDb25maWcgPSBjb25maWd1cmF0aW9uO1xuXHRcdH1cblxuXHRcdC8vIEluZGljYXRlIHdlIGFyZSBuYXZpZ3Rpbmcgbm93XG5cdFx0dGhpcy5yZWFkeVN0YXRlID0gUmVhZHlTdGF0ZS5OQVZJR0FUSU5HO1xuXG5cdFx0Ly8gTG9hZCBVUkxcblx0XHRsZXQgd2luZG93VXJsOiBzdHJpbmc7XG5cdFx0aWYgKHByb2Nlc3MuZW52LlZTQ09ERV9ERVYgJiYgcHJvY2Vzcy5lbnYuVlNDT0RFX0RFVl9TRVJWRVJfVVJMKSB7XG5cdFx0XHR3aW5kb3dVcmwgPSBwcm9jZXNzLmVudi5WU0NPREVfREVWX1NFUlZFUl9VUkw7IC8vIHN1cHBvcnQgVVJMIG92ZXJyaWRlIGZvciBkZXZlbG9wbWVudFxuXHRcdH0gZWxzZSBpZiAoY29uZmlndXJhdGlvbi5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHR3aW5kb3dVcmwgPSBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaShgdnMvc2Vzc2lvbnMvZWxlY3Ryb24tYnJvd3Nlci9zZXNzaW9ucyR7dGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmlzQnVpbHQgPyAnJyA6ICctZGV2J30uaHRtbGApLnRvU3RyaW5nKHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR3aW5kb3dVcmwgPSBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaShgdnMvY29kZS9lbGVjdHJvbi1icm93c2VyL3dvcmtiZW5jaC93b3JrYmVuY2gke3RoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5pc0J1aWx0ID8gJycgOiAnLWRldid9Lmh0bWxgKS50b1N0cmluZyh0cnVlKTtcblx0XHR9XG5cdFx0dGhpcy5fd2luLmxvYWRVUkwod2luZG93VXJsKTtcblxuXHRcdC8vIFJlbWVtYmVyIHRoYXQgd2UgZGlkIGxvYWRcblx0XHRjb25zdCB3YXNMb2FkZWQgPSB0aGlzLndhc0xvYWRlZDtcblx0XHR0aGlzLndhc0xvYWRlZCA9IHRydWU7XG5cblx0XHQvLyBNYWtlIHdpbmRvdyB2aXNpYmxlIGlmIGl0IGRpZCBub3Qgb3BlbiBpbiBOIHNlY29uZHMgYmVjYXVzZSB0aGlzIGluZGljYXRlcyBhbiBlcnJvclxuXHRcdC8vIE9ubHkgZG8gdGhpcyB3aGVuIHJ1bm5pbmcgb3V0IG9mIHNvdXJjZXMgYW5kIG5vdCB3aGVuIHJ1bm5pbmcgdGVzdHNcblx0XHRpZiAoIXRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5pc0J1aWx0ICYmICF0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fd2luICYmICF0aGlzLl93aW4uaXNWaXNpYmxlKCkgJiYgIXRoaXMuX3dpbi5pc01pbmltaXplZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fd2luLnNob3coKTtcblx0XHRcdFx0XHR0aGlzLmZvY3VzKHsgbW9kZTogRm9jdXNNb2RlLkZvcmNlIH0pO1xuXHRcdFx0XHRcdHRoaXMuX3dpbi53ZWJDb250ZW50cy5vcGVuRGV2VG9vbHMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMTAwMDApKS5zY2hlZHVsZSgpO1xuXHRcdH1cblxuXHRcdC8vIEV2ZW50XG5cdFx0dGhpcy5fb25XaWxsTG9hZC5maXJlKHsgd29ya3NwYWNlOiBjb25maWd1cmF0aW9uLndvcmtzcGFjZSwgcmVhc29uOiBvcHRpb25zLmlzUmVsb2FkID8gTG9hZFJlYXNvbi5SRUxPQUQgOiB3YXNMb2FkZWQgPyBMb2FkUmVhc29uLkxPQUQgOiBMb2FkUmVhc29uLklOSVRJQUwgfSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbjogSU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24sIG9wdGlvbnM6IElMb2FkT3B0aW9ucyk6IHZvaWQge1xuXG5cdFx0Ly8gSWYgdGhpcyB3aW5kb3cgd2FzIGxvYWRlZCBiZWZvcmUgZnJvbSB0aGUgY29tbWFuZCBsaW5lXG5cdFx0Ly8gKGFzIGluZGljYXRlZCBieSBWU0NPREVfQ0xJIGVudmlyb25tZW50KSwgbWFrZSBzdXJlIHRvXG5cdFx0Ly8gcHJlc2VydmUgdGhhdCB1c2VyIGVudmlyb25tZW50IGluIHN1YnNlcXVlbnQgbG9hZHMsXG5cdFx0Ly8gdW5sZXNzIHRoZSBuZXcgY29uZmlndXJhdGlvbiBjb250ZXh0IHdhcyBhbHNvIGEgQ0xJXG5cdFx0Ly8gKGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTA4NTcxKVxuXHRcdC8vIEFsc28sIHByZXNlcnZlIHRoZSBlbnZpcm9ubWVudCBpZiB3ZSdyZSBsb2FkaW5nIGZyb20gYW5cblx0XHQvLyBleHRlbnNpb24gZGV2ZWxvcG1lbnQgaG9zdCB0aGF0IGhhZCBpdHMgZW52aXJvbm1lbnQgc2V0XG5cdFx0Ly8gKGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTIzNTA4KVxuXHRcdGNvbnN0IGN1cnJlbnRVc2VyRW52ID0gKHRoaXMuX2NvbmZpZyA/PyB0aGlzLnBlbmRpbmdMb2FkQ29uZmlnKT8udXNlckVudjtcblx0XHRpZiAoY3VycmVudFVzZXJFbnYpIHtcblx0XHRcdGNvbnN0IHNob3VsZFByZXNlcnZlTGF1bmNoQ2xpRW52aXJvbm1lbnQgPSBpc0xhdW5jaGVkRnJvbUNsaShjdXJyZW50VXNlckVudikgJiYgIWlzTGF1bmNoZWRGcm9tQ2xpKGNvbmZpZ3VyYXRpb24udXNlckVudik7XG5cdFx0XHRjb25zdCBzaG91bGRQcmVzZXJ2ZURlYnVnRW52aXJvbm1uZXQgPSB0aGlzLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnRIb3N0O1xuXHRcdFx0aWYgKHNob3VsZFByZXNlcnZlTGF1bmNoQ2xpRW52aXJvbm1lbnQgfHwgc2hvdWxkUHJlc2VydmVEZWJ1Z0Vudmlyb25tbmV0KSB7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb24udXNlckVudiA9IHsgLi4uY3VycmVudFVzZXJFbnYsIC4uLmNvbmZpZ3VyYXRpb24udXNlckVudiB9OyAvLyBzdGlsbCBhbGxvdyB0byBvdmVycmlkZSBjZXJ0YWluIGVudmlyb25tZW50IGFzIHBhc3NlZCBpblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIG5hbWVkIHBpcGUgd2FzIGluc3RhbnRpYXRlZCBmb3IgdGhlIGNyYXNocGFkX2hhbmRsZXIgcHJvY2VzcywgcmV1c2UgdGhlIHNhbWVcblx0XHQvLyBwaXBlIGZvciBuZXcgYXBwIGluc3RhbmNlcyBjb25uZWN0aW5nIHRvIHRoZSBvcmlnaW5hbCBhcHAgaW5zdGFuY2UuXG5cdFx0Ly8gUmVmOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE1ODc0XG5cdFx0aWYgKHByb2Nlc3MuZW52WydDSFJPTUVfQ1JBU0hQQURfUElQRV9OQU1FJ10pIHtcblx0XHRcdE9iamVjdC5hc3NpZ24oY29uZmlndXJhdGlvbi51c2VyRW52LCB7XG5cdFx0XHRcdENIUk9NRV9DUkFTSFBBRF9QSVBFX05BTUU6IHByb2Nlc3MuZW52WydDSFJPTUVfQ1JBU0hQQURfUElQRV9OQU1FJ11cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBkaXNhYmxlLWV4dGVuc2lvbnMgdG8gdGhlIGNvbmZpZywgYnV0IGRvIG5vdCBwcmVzZXJ2ZSBpdCBvbiBjdXJyZW50Q29uZmlnIG9yXG5cdFx0Ly8gcGVuZGluZ0xvYWRDb25maWcgc28gdGhhdCBpdCBpcyBhcHBsaWVkIG9ubHkgb24gdGhpcyBsb2FkXG5cdFx0aWYgKG9wdGlvbnMuZGlzYWJsZUV4dGVuc2lvbnMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uZmlndXJhdGlvblsnZGlzYWJsZS1leHRlbnNpb25zJ10gPSBvcHRpb25zLmRpc2FibGVFeHRlbnNpb25zO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB3aW5kb3cgcmVsYXRlZCBwcm9wZXJ0aWVzXG5cdFx0dHJ5IHtcblx0XHRcdGNvbmZpZ3VyYXRpb24uaGFuZGxlID0gVlNCdWZmZXIud3JhcCh0aGlzLl93aW4uZ2V0TmF0aXZlV2luZG93SGFuZGxlKCkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIGdldHRpbmcgbmF0aXZlIHdpbmRvdyBoYW5kbGU6ICR7ZXJyb3J9YCk7XG5cdFx0fVxuXHRcdGNvbmZpZ3VyYXRpb24uZnVsbHNjcmVlbiA9IHRoaXMuaXNGdWxsU2NyZWVuO1xuXHRcdGNvbmZpZ3VyYXRpb24ubWF4aW1pemVkID0gdGhpcy5fd2luLmlzTWF4aW1pemVkKCk7XG5cdFx0Y29uZmlndXJhdGlvbi5wYXJ0c1NwbGFzaCA9IHRoaXMudGhlbWVNYWluU2VydmljZS5nZXRXaW5kb3dTcGxhc2goY29uZmlndXJhdGlvbi53b3Jrc3BhY2UpO1xuXHRcdGNvbmZpZ3VyYXRpb24uem9vbUxldmVsID0gdGhpcy5nZXRab29tTGV2ZWwoKTtcblx0XHRjb25maWd1cmF0aW9uLmlzQ3VzdG9tWm9vbUxldmVsID0gdHlwZW9mIHRoaXMuY3VzdG9tWm9vbUxldmVsID09PSAnbnVtYmVyJztcblx0XHRpZiAoY29uZmlndXJhdGlvbi5pc0N1c3RvbVpvb21MZXZlbCAmJiBjb25maWd1cmF0aW9uLnBhcnRzU3BsYXNoKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLnBhcnRzU3BsYXNoLnpvb21MZXZlbCA9IGNvbmZpZ3VyYXRpb24uem9vbUxldmVsO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB3aXRoIGxhdGVzdCBwZXJmIG1hcmtzXG5cdFx0bWFyaygnY29kZS93aWxsT3Blbk5ld1dpbmRvdycpO1xuXHRcdGNvbmZpZ3VyYXRpb24ucGVyZk1hcmtzID0gZ2V0TWFya3MoKTtcblxuXHRcdC8vIFVwZGF0ZSBpbiBjb25maWcgb2JqZWN0IFVSTCBmb3IgdXNhZ2UgaW4gcmVuZGVyZXJcblx0XHR0aGlzLmNvbmZpZ09iamVjdFVybC51cGRhdGUoY29uZmlndXJhdGlvbik7XG5cdH1cblxuXHRhc3luYyByZWxvYWQoY2xpPzogTmF0aXZlUGFyc2VkQXJncyk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gQ29weSBvdXIgY3VycmVudCBjb25maWcgZm9yIHJldXNlXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuX2NvbmZpZyk7XG5cblx0XHQvLyBWYWxpZGF0ZSB3b3Jrc3BhY2Vcblx0XHRjb25maWd1cmF0aW9uLndvcmtzcGFjZSA9IGF3YWl0IHRoaXMudmFsaWRhdGVXb3Jrc3BhY2VCZWZvcmVSZWxvYWQoY29uZmlndXJhdGlvbik7XG5cblx0XHQvLyBEZWxldGUgc29tZSBwcm9wZXJ0aWVzIHdlIGRvIG5vdCB3YW50IGR1cmluZyByZWxvYWRcblx0XHRkZWxldGUgY29uZmlndXJhdGlvbi5maWxlc1RvT3Blbk9yQ3JlYXRlO1xuXHRcdGRlbGV0ZSBjb25maWd1cmF0aW9uLmZpbGVzVG9EaWZmO1xuXHRcdGRlbGV0ZSBjb25maWd1cmF0aW9uLmZpbGVzVG9NZXJnZTtcblx0XHRkZWxldGUgY29uZmlndXJhdGlvbi5maWxlc1RvV2FpdDtcblxuXHRcdC8vIFNvbWUgY29uZmlndXJhdGlvbiB0aGluZ3MgZ2V0IGluaGVyaXRlZCBpZiB0aGUgd2luZG93IGlzIGJlaW5nIHJlbG9hZGVkIGFuZCB3ZSBhcmVcblx0XHQvLyBpbiBleHRlbnNpb24gZGV2ZWxvcG1lbnQgbW9kZS4gVGhlc2Ugb3B0aW9ucyBhcmUgYWxsIGRldmVsb3BtZW50IHJlbGF0ZWQuXG5cdFx0aWYgKHRoaXMuaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3QgJiYgY2xpKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLnZlcmJvc2UgPSBjbGkudmVyYm9zZTtcblx0XHRcdGNvbmZpZ3VyYXRpb24uZGVidWdJZCA9IGNsaS5kZWJ1Z0lkO1xuXHRcdFx0Y29uZmlndXJhdGlvbi5leHRlbnNpb25FbnZpcm9ubWVudCA9IGNsaS5leHRlbnNpb25FbnZpcm9ubWVudDtcblx0XHRcdGNvbmZpZ3VyYXRpb25bJ2luc3BlY3QtZXh0ZW5zaW9ucyddID0gY2xpWydpbnNwZWN0LWV4dGVuc2lvbnMnXTtcblx0XHRcdGNvbmZpZ3VyYXRpb25bJ2luc3BlY3QtYnJrLWV4dGVuc2lvbnMnXSA9IGNsaVsnaW5zcGVjdC1icmstZXh0ZW5zaW9ucyddO1xuXHRcdFx0Y29uZmlndXJhdGlvblsnZXh0ZW5zaW9ucy1kaXInXSA9IGNsaVsnZXh0ZW5zaW9ucy1kaXInXTtcblx0XHR9XG5cblx0XHRjb25maWd1cmF0aW9uLmFjY2Vzc2liaWxpdHlTdXBwb3J0ID0gZWxlY3Ryb24uYXBwLmlzQWNjZXNzaWJpbGl0eVN1cHBvcnRFbmFibGVkKCk7XG5cdFx0Y29uZmlndXJhdGlvbi5pc0luaXRpYWxTdGFydHVwID0gZmFsc2U7IC8vIHNpbmNlIHRoaXMgaXMgYSByZWxvYWRcblx0XHRjb25maWd1cmF0aW9uLnBvbGljaWVzRGF0YSA9IHRoaXMucG9saWN5U2VydmljZS5zZXJpYWxpemUoKTsgLy8gc2V0IHBvbGljaWVzIGRhdGEgYWdhaW5cblx0XHRjb25maWd1cmF0aW9uLmNvbnRpbnVlT24gPSB0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuY29udGludWVPbjtcblx0XHRjb25maWd1cmF0aW9uLnByb2ZpbGVzID0ge1xuXHRcdFx0YWxsOiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLFxuXHRcdFx0cHJvZmlsZTogdGhpcy5wcm9maWxlIHx8IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUsXG5cdFx0XHRob21lOiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzSG9tZVxuXHRcdH07XG5cdFx0Y29uZmlndXJhdGlvbi5sb2dMZXZlbCA9IHRoaXMubG9nZ2VyTWFpblNlcnZpY2UuZ2V0TG9nTGV2ZWwoKTtcblx0XHRjb25maWd1cmF0aW9uLmxvZ2dlcnMgPSB0aGlzLmxvZ2dlck1haW5TZXJ2aWNlLmdldEdsb2JhbExvZ2dlcnMoKTtcblxuXHRcdC8vIExvYWQgY29uZmlnXG5cdFx0dGhpcy5sb2FkKGNvbmZpZ3VyYXRpb24sIHsgaXNSZWxvYWQ6IHRydWUsIGRpc2FibGVFeHRlbnNpb25zOiBjbGk/LlsnZGlzYWJsZS1leHRlbnNpb25zJ10gfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHZhbGlkYXRlV29ya3NwYWNlQmVmb3JlUmVsb2FkKGNvbmZpZ3VyYXRpb246IElOYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uKTogUHJvbWlzZTxJV29ya3NwYWNlSWRlbnRpZmllciB8IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyIHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvLyBNdWx0aSBmb2xkZXJcblx0XHRpZiAoaXNXb3Jrc3BhY2VJZGVudGlmaWVyKGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlKSkge1xuXHRcdFx0Y29uc3QgY29uZmlnUGF0aCA9IGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlLmNvbmZpZ1BhdGg7XG5cdFx0XHRpZiAoY29uZmlnUGF0aC5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VFeGlzdHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhjb25maWdQYXRoKTtcblx0XHRcdFx0aWYgKCF3b3Jrc3BhY2VFeGlzdHMpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2luZ2xlIGZvbGRlclxuXHRcdGVsc2UgaWYgKGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcihjb25maWd1cmF0aW9uLndvcmtzcGFjZSkpIHtcblx0XHRcdGNvbnN0IHVyaSA9IGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlLnVyaTtcblx0XHRcdGlmICh1cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyRXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHModXJpKTtcblx0XHRcdFx0aWYgKCFmb2xkZXJFeGlzdHMpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlIGlzIHZhbGlkXG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlO1xuXHR9XG5cblx0c2VyaWFsaXplV2luZG93U3RhdGUoKTogSVdpbmRvd1N0YXRlIHtcblx0XHRpZiAoIXRoaXMuX3dpbikge1xuXHRcdFx0cmV0dXJuIGRlZmF1bHRXaW5kb3dTdGF0ZSgpO1xuXHRcdH1cblxuXHRcdC8vIGZ1bGxzY3JlZW4gZ2V0cyBzcGVjaWFsIHRyZWF0bWVudFxuXHRcdGlmICh0aGlzLmlzRnVsbFNjcmVlbikge1xuXHRcdFx0bGV0IGRpc3BsYXk6IGVsZWN0cm9uLkRpc3BsYXkgfCB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRkaXNwbGF5ID0gZWxlY3Ryb24uc2NyZWVuLmdldERpc3BsYXlNYXRjaGluZyh0aGlzLmdldEJvdW5kcygpKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIEVsZWN0cm9uIGhhcyB3ZWlyZCBjb25kaXRpb25zIHVuZGVyIHdoaWNoIGl0IHRocm93cyBlcnJvcnNcblx0XHRcdFx0Ly8gZS5nLiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTAwMzM0IHdoZW5cblx0XHRcdFx0Ly8gbGFyZ2UgbnVtYmVycyBhcmUgcGFzc2VkIGluXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlZmF1bHRTdGF0ZSA9IGRlZmF1bHRXaW5kb3dTdGF0ZSgpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRtb2RlOiBXaW5kb3dNb2RlLkZ1bGxzY3JlZW4sXG5cdFx0XHRcdGRpc3BsYXk6IGRpc3BsYXkgPyBkaXNwbGF5LmlkIDogdW5kZWZpbmVkLFxuXG5cdFx0XHRcdC8vIFN0aWxsIGNhcnJ5IG92ZXIgd2luZG93IGRpbWVuc2lvbnMgZnJvbSBwcmV2aW91cyBzZXNzaW9uc1xuXHRcdFx0XHQvLyBpZiB3ZSBjYW4gY29tcHV0ZSBpdCBpbiBmdWxsc2NyZWVuIHN0YXRlLlxuXHRcdFx0XHQvLyBkb2VzIG5vdCBzZWVtIHBvc3NpYmxlIGluIGFsbCBjYXNlcyBvbiBMaW51eCBmb3IgZXhhbXBsZVxuXHRcdFx0XHQvLyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzU4MjE4KSBzbyB3ZVxuXHRcdFx0XHQvLyBmYWxsYmFjayB0byB0aGUgZGVmYXVsdHMgaW4gdGhhdCBjYXNlLlxuXHRcdFx0XHR3aWR0aDogdGhpcy53aW5kb3dTdGF0ZS53aWR0aCB8fCBkZWZhdWx0U3RhdGUud2lkdGgsXG5cdFx0XHRcdGhlaWdodDogdGhpcy53aW5kb3dTdGF0ZS5oZWlnaHQgfHwgZGVmYXVsdFN0YXRlLmhlaWdodCxcblx0XHRcdFx0eDogdGhpcy53aW5kb3dTdGF0ZS54IHx8IDAsXG5cdFx0XHRcdHk6IHRoaXMud2luZG93U3RhdGUueSB8fCAwLFxuXHRcdFx0XHR6b29tTGV2ZWw6IHRoaXMuY3VzdG9tWm9vbUxldmVsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlOiBJV2luZG93U3RhdGUgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGxldCBtb2RlOiBXaW5kb3dNb2RlO1xuXG5cdFx0Ly8gZ2V0IHdpbmRvdyBtb2RlXG5cdFx0aWYgKCFpc01hY2ludG9zaCAmJiB0aGlzLl93aW4uaXNNYXhpbWl6ZWQoKSkge1xuXHRcdFx0bW9kZSA9IFdpbmRvd01vZGUuTWF4aW1pemVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2RlID0gV2luZG93TW9kZS5Ob3JtYWw7XG5cdFx0fVxuXG5cdFx0Ly8gd2UgZG9uJ3Qgd2FudCB0byBzYXZlIG1pbmltaXplZCBzdGF0ZSwgb25seSBtYXhpbWl6ZWQgb3Igbm9ybWFsXG5cdFx0aWYgKG1vZGUgPT09IFdpbmRvd01vZGUuTWF4aW1pemVkKSB7XG5cdFx0XHRzdGF0ZS5tb2RlID0gV2luZG93TW9kZS5NYXhpbWl6ZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXRlLm1vZGUgPSBXaW5kb3dNb2RlLk5vcm1hbDtcblx0XHR9XG5cblx0XHQvLyBvbmx5IGNvbnNpZGVyIG5vbi1taW5pbWl6ZWQgd2luZG93IHN0YXRlc1xuXHRcdGlmIChtb2RlID09PSBXaW5kb3dNb2RlLk5vcm1hbCB8fCBtb2RlID09PSBXaW5kb3dNb2RlLk1heGltaXplZCkge1xuXHRcdFx0bGV0IGJvdW5kczogZWxlY3Ryb24uUmVjdGFuZ2xlO1xuXHRcdFx0aWYgKG1vZGUgPT09IFdpbmRvd01vZGUuTm9ybWFsKSB7XG5cdFx0XHRcdGJvdW5kcyA9IHRoaXMuZ2V0Qm91bmRzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRib3VuZHMgPSB0aGlzLl93aW4uZ2V0Tm9ybWFsQm91bmRzKCk7IC8vIG1ha2Ugc3VyZSB0byBwZXJzaXN0IHRoZSBub3JtYWwgYm91bmRzIHdoZW4gbWF4aW1pemVkIHRvIGJlIGFibGUgdG8gcmVzdG9yZSB0aGVtXG5cdFx0XHR9XG5cblx0XHRcdHN0YXRlLnggPSBib3VuZHMueDtcblx0XHRcdHN0YXRlLnkgPSBib3VuZHMueTtcblx0XHRcdHN0YXRlLndpZHRoID0gYm91bmRzLndpZHRoO1xuXHRcdFx0c3RhdGUuaGVpZ2h0ID0gYm91bmRzLmhlaWdodDtcblx0XHR9XG5cblx0XHRzdGF0ZS56b29tTGV2ZWwgPSB0aGlzLmN1c3RvbVpvb21MZXZlbDtcblxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVzdG9yZVdpbmRvd1N0YXRlKHN0YXRlPzogSVdpbmRvd1N0YXRlKTogW0lXaW5kb3dTdGF0ZSwgYm9vbGVhbj8gLyogaGFzIG11bHRpcGxlIGRpc3BsYXlzICovXSB7XG5cdFx0bWFyaygnY29kZS93aWxsUmVzdG9yZUNvZGVXaW5kb3dTdGF0ZScpO1xuXG5cdFx0bGV0IGhhc011bHRpcGxlRGlzcGxheXMgPSBmYWxzZTtcblx0XHRpZiAoc3RhdGUpIHtcblxuXHRcdFx0Ly8gV2luZG93IHpvb21cblx0XHRcdHRoaXMuY3VzdG9tWm9vbUxldmVsID0gc3RhdGUuem9vbUxldmVsO1xuXG5cdFx0XHQvLyBXaW5kb3cgZGltZW5zaW9uc1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZGlzcGxheXMgPSBlbGVjdHJvbi5zY3JlZW4uZ2V0QWxsRGlzcGxheXMoKTtcblx0XHRcdFx0aGFzTXVsdGlwbGVEaXNwbGF5cyA9IGRpc3BsYXlzLmxlbmd0aCA+IDE7XG5cblx0XHRcdFx0c3RhdGUgPSBXaW5kb3dTdGF0ZVZhbGlkYXRvci52YWxpZGF0ZVdpbmRvd1N0YXRlKHRoaXMubG9nU2VydmljZSwgc3RhdGUsIGRpc3BsYXlzKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgVW5leHBlY3RlZCBlcnJvciB2YWxpZGF0aW5nIHdpbmRvdyBzdGF0ZTogJHtlcnJ9XFxuJHtlcnIuc3RhY2t9YCk7IC8vIHNvbWVob3cgZGlzcGxheSBBUEkgY2FuIGJlIHBpY2t5IGFib3V0IHRoZSBzdGF0ZSB0byB2YWxpZGF0ZVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdG1hcmsoJ2NvZGUvZGlkUmVzdG9yZUNvZGVXaW5kb3dTdGF0ZScpO1xuXG5cdFx0cmV0dXJuIFtzdGF0ZSB8fCBkZWZhdWx0V2luZG93U3RhdGUoKSwgaGFzTXVsdGlwbGVEaXNwbGF5c107XG5cdH1cblxuXHRnZXRCb3VuZHMoKTogZWxlY3Ryb24uUmVjdGFuZ2xlIHtcblx0XHRjb25zdCBbeCwgeV0gPSB0aGlzLl93aW4uZ2V0UG9zaXRpb24oKTtcblx0XHRjb25zdCBbd2lkdGgsIGhlaWdodF0gPSB0aGlzLl93aW4uZ2V0U2l6ZSgpO1xuXG5cdFx0cmV0dXJuIHsgeCwgeSwgd2lkdGgsIGhlaWdodCB9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNldEZ1bGxTY3JlZW4oZnVsbHNjcmVlbjogYm9vbGVhbiwgZnJvbVJlc3RvcmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRzdXBlci5zZXRGdWxsU2NyZWVuKGZ1bGxzY3JlZW4sIGZyb21SZXN0b3JlKTtcblxuXHRcdC8vIEV2ZW50c1xuXHRcdHRoaXMuc2VuZFdoZW5SZWFkeShmdWxsc2NyZWVuID8gJ3ZzY29kZTplbnRlckZ1bGxTY3JlZW4nIDogJ3ZzY29kZTpsZWF2ZUZ1bGxTY3JlZW4nLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdC8vIFJlc3BlY3QgY29uZmlndXJlZCBtZW51IGJhciB2aXNpYmlsaXR5IG9yIGRlZmF1bHQgdG8gdG9nZ2xlIGlmIG5vdCBzZXRcblx0XHRpZiAodGhpcy5jdXJyZW50TWVudUJhclZpc2liaWxpdHkpIHtcblx0XHRcdHRoaXMuc2V0TWVudUJhclZpc2liaWxpdHkodGhpcy5jdXJyZW50TWVudUJhclZpc2liaWxpdHksIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE1lbnVCYXJWaXNpYmlsaXR5KCk6IE1lbnVCYXJWaXNpYmlsaXR5IHtcblx0XHRsZXQgbWVudUJhclZpc2liaWxpdHkgPSBnZXRNZW51QmFyVmlzaWJpbGl0eSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAoWyd2aXNpYmxlJywgJ3RvZ2dsZScsICdoaWRkZW4nXS5pbmRleE9mKG1lbnVCYXJWaXNpYmlsaXR5KSA8IDApIHtcblx0XHRcdG1lbnVCYXJWaXNpYmlsaXR5ID0gJ2NsYXNzaWMnO1xuXHRcdH1cblxuXHRcdHJldHVybiBtZW51QmFyVmlzaWJpbGl0eTtcblx0fVxuXG5cdHByaXZhdGUgc2V0TWVudUJhclZpc2liaWxpdHkodmlzaWJpbGl0eTogTWVudUJhclZpc2liaWxpdHksIG5vdGlmeSA9IHRydWUpOiB2b2lkIHtcblx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdHJldHVybjsgLy8gaWdub3JlIGZvciBtYWNPUyBwbGF0Zm9ybVxuXHRcdH1cblxuXHRcdGlmICh2aXNpYmlsaXR5ID09PSAndG9nZ2xlJykge1xuXHRcdFx0aWYgKG5vdGlmeSkge1xuXHRcdFx0XHR0aGlzLnNlbmQoJ3ZzY29kZTpzaG93SW5mb01lc3NhZ2UnLCBsb2NhbGl6ZSgnaGlkZGVuTWVudUJhcicsIFwiWW91IGNhbiBzdGlsbCBhY2Nlc3MgdGhlIG1lbnUgYmFyIGJ5IHByZXNzaW5nIHRoZSBBbHQta2V5LlwiKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHZpc2liaWxpdHkgPT09ICdoaWRkZW4nKSB7XG5cdFx0XHQvLyBmb3Igc29tZSB3ZWlyZCByZWFzb24gdGhhdCBJIGhhdmUgbm8gZXhwbGFuYXRpb24gZm9yLCB0aGUgbWVudSBiYXIgaXMgbm90IGhpZGluZyB3aGVuIGNhbGxpbmdcblx0XHRcdC8vIHRoaXMgd2l0aG91dCB0aW1lb3V0IChzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE5Nzc3KS4gdGhlcmUgc2VlbXMgdG8gYmVcblx0XHRcdC8vIGEgdGltaW5nIGlzc3VlIHdpdGggdXMgb3BlbmluZyB0aGUgZmlyc3Qgd2luZG93IGFuZCB0aGUgbWVudSBiYXIgZ2V0dGluZyBjcmVhdGVkLiBzb21laG93IHRoZVxuXHRcdFx0Ly8gZmFjdCB0aGF0IHdlIHdhbnQgdG8gaGlkZSB0aGUgbWVudSB3aXRob3V0IGJlaW5nIGFibGUgdG8gYnJpbmcgaXQgYmFjayB2aWEgQWx0IGtleSBtYWtlcyBFbGVjdHJvblxuXHRcdFx0Ly8gc3RpbGwgc2hvdyB0aGUgbWVudS4gVW5hYmxlIHRvIHJlcHJvZHVjZSBmcm9tIGEgc2ltcGxlIEhlbGxvIFdvcmxkIGFwcGxpY2F0aW9uIHRob3VnaC4uLlxuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZG9TZXRNZW51QmFyVmlzaWJpbGl0eSh2aXNpYmlsaXR5KTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRvU2V0TWVudUJhclZpc2liaWxpdHkodmlzaWJpbGl0eSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1NldE1lbnVCYXJWaXNpYmlsaXR5KHZpc2liaWxpdHk6IE1lbnVCYXJWaXNpYmlsaXR5KTogdm9pZCB7XG5cdFx0Y29uc3QgaXNGdWxsc2NyZWVuID0gdGhpcy5pc0Z1bGxTY3JlZW47XG5cblx0XHRzd2l0Y2ggKHZpc2liaWxpdHkpIHtcblx0XHRcdGNhc2UgKCdjbGFzc2ljJyk6XG5cdFx0XHRcdHRoaXMuX3dpbi5zZXRNZW51QmFyVmlzaWJpbGl0eSghaXNGdWxsc2NyZWVuKTtcblx0XHRcdFx0dGhpcy5fd2luLmF1dG9IaWRlTWVudUJhciA9IGlzRnVsbHNjcmVlbjtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgKCd2aXNpYmxlJyk6XG5cdFx0XHRcdHRoaXMuX3dpbi5zZXRNZW51QmFyVmlzaWJpbGl0eSh0cnVlKTtcblx0XHRcdFx0dGhpcy5fd2luLmF1dG9IaWRlTWVudUJhciA9IGZhbHNlO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAoJ3RvZ2dsZScpOlxuXHRcdFx0XHR0aGlzLl93aW4uc2V0TWVudUJhclZpc2liaWxpdHkoZmFsc2UpO1xuXHRcdFx0XHR0aGlzLl93aW4uYXV0b0hpZGVNZW51QmFyID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgKCdoaWRkZW4nKTpcblx0XHRcdFx0dGhpcy5fd2luLnNldE1lbnVCYXJWaXNpYmlsaXR5KGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fd2luLmF1dG9IaWRlTWVudUJhciA9IGZhbHNlO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRub3RpZnlab29tTGV2ZWwoem9vbUxldmVsOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmN1c3RvbVpvb21MZXZlbCA9IHpvb21MZXZlbDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Wm9vbUxldmVsKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLmN1c3RvbVpvb21MZXZlbCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiB0aGlzLmN1c3RvbVpvb21MZXZlbDtcblx0XHR9XG5cblx0XHRjb25zdCB3aW5kb3dTZXR0aW5ncyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVdpbmRvd1NldHRpbmdzIHwgdW5kZWZpbmVkPignd2luZG93Jyk7XG5cdFx0cmV0dXJuIHdpbmRvd1NldHRpbmdzPy56b29tTGV2ZWw7XG5cdH1cblxuXHRjbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl93aW4/LmNsb3NlKCk7XG5cdH1cblxuXHRzZW5kV2hlblJlYWR5KGNoYW5uZWw6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc1JlYWR5KSB7XG5cdFx0XHR0aGlzLnNlbmQoY2hhbm5lbCwgLi4uYXJncyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVhZHkoKS50aGVuKCgpID0+IHtcblx0XHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRoaXMuc2VuZChjaGFubmVsLCAuLi5hcmdzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0c2VuZChjaGFubmVsOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93aW4pIHtcblx0XHRcdGlmICh0aGlzLl93aW4uaXNEZXN0cm95ZWQoKSB8fCB0aGlzLl93aW4ud2ViQ29udGVudHMuaXNEZXN0cm95ZWQoKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgU2VuZGluZyBJUEMgbWVzc2FnZSB0byBjaGFubmVsICcke2NoYW5uZWx9JyBmb3Igd2luZG93IHRoYXQgaXMgZGVzdHJveWVkYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5fd2luLndlYkNvbnRlbnRzLnNlbmQoY2hhbm5lbCwgLi4uYXJncyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRXJyb3Igc2VuZGluZyBJUEMgbWVzc2FnZSB0byBjaGFubmVsICcke2NoYW5uZWx9JyBvZiB3aW5kb3cgJHt0aGlzLl9pZH06ICR7dG9FcnJvck1lc3NhZ2UoZXJyb3IpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZVRvdWNoQmFyKGdyb3VwczogSVNlcmlhbGl6YWJsZUNvbW1hbmRBY3Rpb25bXVtdKTogdm9pZCB7XG5cdFx0aWYgKCFpc01hY2ludG9zaCkge1xuXHRcdFx0cmV0dXJuOyAvLyBvbmx5IHN1cHBvcnRlZCBvbiBtYWNPU1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBzZWdtZW50cyBmb3IgYWxsIGdyb3Vwcy4gU2V0dGluZyB0aGUgc2VnbWVudHMgcHJvcGVydHlcblx0XHQvLyBvZiB0aGUgZ3JvdXAgZGlyZWN0bHkgcHJldmVudHMgdWdseSBmbGlja2VyaW5nIGZyb20gaGFwcGVuaW5nXG5cdFx0dGhpcy50b3VjaEJhckdyb3Vwcy5mb3JFYWNoKCh0b3VjaEJhckdyb3VwLCBpbmRleCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZHMgPSBncm91cHNbaW5kZXhdO1xuXHRcdFx0dG91Y2hCYXJHcm91cC5zZWdtZW50cyA9IHRoaXMuY3JlYXRlVG91Y2hCYXJHcm91cFNlZ21lbnRzKGNvbW1hbmRzKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVG91Y2hCYXIoKTogdm9pZCB7XG5cdFx0aWYgKCFpc01hY2ludG9zaCkge1xuXHRcdFx0cmV0dXJuOyAvLyBvbmx5IHN1cHBvcnRlZCBvbiBtYWNPU1xuXHRcdH1cblxuXHRcdC8vIFRvIGF2b2lkIGZsaWNrZXJpbmcsIHdlIHRyeSB0byByZXVzZSB0aGUgdG91Y2ggYmFyIGdyb3VwXG5cdFx0Ly8gYXMgbXVjaCBhcyBwb3NzaWJsZSBieSBjcmVhdGluZyBhIGxhcmdlIG51bWJlciBvZiBncm91cHNcblx0XHQvLyBmb3IgcmV1c2luZyBsYXRlci5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwOyBpKyspIHtcblx0XHRcdGNvbnN0IGdyb3VwVG91Y2hCYXIgPSB0aGlzLmNyZWF0ZVRvdWNoQmFyR3JvdXAoKTtcblx0XHRcdHRoaXMudG91Y2hCYXJHcm91cHMucHVzaChncm91cFRvdWNoQmFyKTtcblx0XHR9XG5cblx0XHR0aGlzLl93aW4uc2V0VG91Y2hCYXIobmV3IGVsZWN0cm9uLlRvdWNoQmFyKHsgaXRlbXM6IHRoaXMudG91Y2hCYXJHcm91cHMgfSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUb3VjaEJhckdyb3VwKGl0ZW1zOiBJU2VyaWFsaXphYmxlQ29tbWFuZEFjdGlvbltdID0gW10pOiBlbGVjdHJvbi5Ub3VjaEJhclNlZ21lbnRlZENvbnRyb2wge1xuXG5cdFx0Ly8gR3JvdXAgU2VnbWVudHNcblx0XHRjb25zdCBzZWdtZW50cyA9IHRoaXMuY3JlYXRlVG91Y2hCYXJHcm91cFNlZ21lbnRzKGl0ZW1zKTtcblxuXHRcdC8vIEdyb3VwIENvbnRyb2xcblx0XHRjb25zdCBjb250cm9sID0gbmV3IGVsZWN0cm9uLlRvdWNoQmFyLlRvdWNoQmFyU2VnbWVudGVkQ29udHJvbCh7XG5cdFx0XHRzZWdtZW50cyxcblx0XHRcdG1vZGU6ICdidXR0b25zJyxcblx0XHRcdHNlZ21lbnRTdHlsZTogJ2F1dG9tYXRpYycsXG5cdFx0XHRjaGFuZ2U6IChzZWxlY3RlZEluZGV4KSA9PiB7XG5cdFx0XHRcdHRoaXMuc2VuZFdoZW5SZWFkeSgndnNjb2RlOnJ1bkFjdGlvbicsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHsgaWQ6IChjb250cm9sLnNlZ21lbnRzW3NlbGVjdGVkSW5kZXhdIGFzIElUb3VjaEJhclNlZ21lbnQpLmlkLCBmcm9tOiAndG91Y2hiYXInIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGNvbnRyb2w7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRvdWNoQmFyR3JvdXBTZWdtZW50cyhpdGVtczogSVNlcmlhbGl6YWJsZUNvbW1hbmRBY3Rpb25bXSA9IFtdKTogSVRvdWNoQmFyU2VnbWVudFtdIHtcblx0XHRjb25zdCBzZWdtZW50czogSVRvdWNoQmFyU2VnbWVudFtdID0gaXRlbXMubWFwKGl0ZW0gPT4ge1xuXHRcdFx0bGV0IGljb246IGVsZWN0cm9uLk5hdGl2ZUltYWdlIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGl0ZW0uaWNvbiAmJiAhVGhlbWVJY29uLmlzVGhlbWVJY29uKGl0ZW0uaWNvbikgJiYgaXRlbS5pY29uPy5kYXJrPy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRpY29uID0gZWxlY3Ryb24ubmF0aXZlSW1hZ2UuY3JlYXRlRnJvbVBhdGgoVVJJLnJldml2ZShpdGVtLmljb24uZGFyaykuZnNQYXRoKTtcblx0XHRcdFx0aWYgKGljb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdFx0aWNvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsZXQgdGl0bGU6IHN0cmluZztcblx0XHRcdGlmICh0eXBlb2YgaXRlbS50aXRsZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGl0bGUgPSBpdGVtLnRpdGxlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGl0bGUgPSBpdGVtLnRpdGxlLnZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogaXRlbS5pZCxcblx0XHRcdFx0bGFiZWw6ICFpY29uID8gdGl0bGUgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGljb25cblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gc2VnbWVudHM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN0YXJ0Q29sbGVjdGluZ0pTY2FsbFN0YWNrcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuanNDYWxsU3RhY2tDb2xsZWN0b3IuaXNUcmlnZ2VyZWQoKSkge1xuXHRcdFx0Y29uc3Qgc3RhY2sgPSBhd2FpdCB0aGlzLl93aW4/LndlYkNvbnRlbnRzLm1haW5GcmFtZS5jb2xsZWN0SmF2YVNjcmlwdENhbGxTdGFjaygpO1xuXG5cdFx0XHQvLyBJbmNyZW1lbnQgdGhlIGNvdW50IGZvciB0aGlzIHN0YWNrIHRyYWNlXG5cdFx0XHRpZiAoc3RhY2spIHtcblx0XHRcdFx0Y29uc3QgY291bnQgPSB0aGlzLmpzQ2FsbFN0YWNrTWFwLmdldChzdGFjaykgfHwgMDtcblx0XHRcdFx0dGhpcy5qc0NhbGxTdGFja01hcC5zZXQoc3RhY2ssIGNvdW50ICsgMSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuanNDYWxsU3RhY2tDb2xsZWN0b3IudHJpZ2dlcigoKSA9PiB0aGlzLnN0YXJ0Q29sbGVjdGluZ0pTY2FsbFN0YWNrcygpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0b3BDb2xsZWN0aW5nSlNjYWxsU3RhY2tzKCk6IHZvaWQge1xuXHRcdHRoaXMuanNDYWxsU3RhY2tDb2xsZWN0b3JTdG9wU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdHRoaXMuanNDYWxsU3RhY2tDb2xsZWN0b3IuY2FuY2VsKCk7XG5cblx0XHRpZiAodGhpcy5qc0NhbGxTdGFja01hcC5zaXplKSB7XG5cdFx0XHRsZXQgbG9nTWVzc2FnZSA9IGBDb2RlV2luZG93IHVucmVzcG9uc2l2ZSBzYW1wbGVzOlxcbmA7XG5cdFx0XHRsZXQgc2FtcGxlcyA9IDA7XG5cblx0XHRcdGNvbnN0IHNvcnRlZEVudHJpZXMgPSBBcnJheS5mcm9tKHRoaXMuanNDYWxsU3RhY2tNYXAuZW50cmllcygpKVxuXHRcdFx0XHQuc29ydCgoYSwgYikgPT4gYlsxXSAtIGFbMV0pO1xuXG5cdFx0XHRmb3IgKGNvbnN0IFtzdGFjaywgY291bnRdIG9mIHNvcnRlZEVudHJpZXMpIHtcblx0XHRcdFx0c2FtcGxlcyArPSBjb3VudDtcblx0XHRcdFx0Ly8gSWYgdGhlIHN0YWNrIGFwcGVhcnMgbW9yZSB0aGFuIDIwIHBlcmNlbnQgb2YgdGhlIHRpbWUsIGxvZyBpdFxuXHRcdFx0XHQvLyB0byB0aGUgZXJyb3IgdGVsZW1ldHJ5IGFzIFVucmVzcG9uc2l2ZVNhbXBsZUVycm9yLlxuXHRcdFx0XHRpZiAoTWF0aC5yb3VuZCgoY291bnQgKiAxMDApIC8gdGhpcy5qc0NhbGxTdGFja0VmZmVjdGl2ZVNhbXBsZUNvdW50KSA+IDIwKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmFrZUVycm9yID0gbmV3IFVucmVzcG9uc2l2ZUVycm9yKHN0YWNrLCB0aGlzLmlkLCB0aGlzLl93aW4/LndlYkNvbnRlbnRzLmdldE9TUHJvY2Vzc0lkKCkpO1xuXHRcdFx0XHRcdGVycm9ySGFuZGxlci5vblVuZXhwZWN0ZWRFcnJvcihmYWtlRXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxvZ01lc3NhZ2UgKz0gYDwke2NvdW50fT4gJHtzdGFja31cXG5gO1xuXHRcdFx0fVxuXG5cdFx0XHRsb2dNZXNzYWdlICs9IGBUb3RhbCBTYW1wbGVzOiAke3NhbXBsZXN9XFxuYDtcblx0XHRcdGxvZ01lc3NhZ2UgKz0gJ0ZvciBmdWxsIG92ZXJ2aWV3IG9mIHRoZSB1bnJlc3BvbnNpdmUgcGVyaW9kLCBjYXB0dXJlIGNwdSBwcm9maWxlIHZpYSBodHRwczovL2FrYS5tcy92c2NvZGUtdHJhY2luZy1jcHUtcHJvZmlsZSc7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IobG9nTWVzc2FnZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5qc0NhbGxTdGFja01hcC5jbGVhcigpO1xuXHR9XG5cblx0bWF0Y2hlcyh3ZWJDb250ZW50czogZWxlY3Ryb24uV2ViQ29udGVudHMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fd2luPy53ZWJDb250ZW50cy5pZCA9PT0gd2ViQ29udGVudHMuaWQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdC8vIERlcmVnaXN0ZXIgdGhlIGxvZ2dlcnMgZm9yIHRoaXMgd2luZG93XG5cdFx0dGhpcy5sb2dnZXJNYWluU2VydmljZS5kZXJlZ2lzdGVyTG9nZ2Vycyh0aGlzLmlkKTtcblx0fVxufVxuXG5jbGFzcyBVbnJlc3BvbnNpdmVFcnJvciBleHRlbmRzIEVycm9yIHtcblxuXHRjb25zdHJ1Y3RvcihzYW1wbGU6IHN0cmluZywgd2luZG93SWQ6IG51bWJlciwgcGlkID0gMCkge1xuXHRcdC8vIFNpbmNlIHRoZSBzdGFja3MgYXJlIGF2YWlsYWJsZSB2aWEgdGhlIHNhbXBsZVxuXHRcdC8vIHdlIGNhbiBhdm9pZCBjb2xsZWN0aW5nIHRoZW0gd2hlbiBjb25zdHJ1Y3RpbmcgdGhlIGVycm9yLlxuXHRcdGNvbnN0IHN0YWNrVHJhY2VMaW1pdCA9IEVycm9yLnN0YWNrVHJhY2VMaW1pdDtcblx0XHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSAwO1xuXHRcdHN1cGVyKGBVbnJlc3BvbnNpdmVTYW1wbGVFcnJvcjogZnJvbSB3aW5kb3cgd2l0aCBJRCAke3dpbmRvd0lkfSBiZWxvbmdpbmcgdG8gcHJvY2VzcyB3aXRoIHBpZCAke3BpZH1gKTtcblx0XHRFcnJvci5zdGFja1RyYWNlTGltaXQgPSBzdGFja1RyYWNlTGltaXQ7XG5cdFx0dGhpcy5uYW1lID0gJ1VucmVzcG9uc2l2ZVNhbXBsZUVycm9yJztcblx0XHR0aGlzLnN0YWNrID0gc2FtcGxlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU8sWUFBc0QsY0FBYztBQUMzRSxTQUFTLGlCQUFpQixrQkFBa0IsU0FBUyxlQUFlO0FBQ3BFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUMxRixTQUFTLFlBQVksZUFBZTtBQUNwQyxTQUFTLFVBQVUsWUFBWTtBQUMvQixTQUFTLGdCQUFnQixTQUFTLGFBQWEsaUJBQWlCO0FBQ2hFLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFFeEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBb0MsNkJBQTZCO0FBQ2pFLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXdCLDRCQUE0QjtBQUNwRCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGdDQUFnQywyQkFBMkI7QUFDcEUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBdUgsbUJBQW1CLHFCQUFxQiwwQkFBMEIsZ0NBQWdDLGVBQWUsb0JBQW9CO0FBQ3JRLFNBQVMsNkJBQTZCLGlDQUFpQyxxQkFBcUIsYUFBYSw0QkFBNEI7QUFDckksU0FBaUUsbUNBQW1DLHVCQUF1Qiw2QkFBNkI7QUFDeEosU0FBUyx3Q0FBd0M7QUFDakQsU0FBZ0QsWUFBWSxhQUFhLFlBQVksMEJBQXVDO0FBQzVILFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsYUFBYTtBQWtCdEIsSUFBVyxhQUFYLGtCQUFXQSxnQkFBWDtBQU9DLEVBQUFBLHdCQUFBO0FBTUEsRUFBQUEsd0JBQUE7QUFNQSxFQUFBQSx3QkFBQTtBQW5CVSxTQUFBQTtBQUFBLEdBQUE7QUFzQlgsTUFBTSxvQkFBTixNQUFNLGtCQUFpQjtBQUFBLEVBQXZCO0FBSUMsU0FBaUIsVUFBVSxvQkFBSSxJQUFZO0FBQUE7QUFBQSxFQUUzQyxhQUFhLFFBQWtDO0FBQzlDLFNBQUssUUFBUSxJQUFJLE9BQU8sRUFBRTtBQUUxQixhQUFTLElBQUk7QUFBQSxNQUFjLFVBQVUsSUFBaUM7QUFBQTtBQUFBLElBQTJCO0FBRWpHLFdBQU87QUFBQSxNQUNOLFNBQVMsTUFBTTtBQUNkLGFBQUssUUFBUSxPQUFPLE9BQU8sRUFBRTtBQUU3QixZQUFJLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDNUIsbUJBQVMsSUFBSSxjQUFjLENBQUM7QUFBQSxRQUM3QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBckJNLGtCQUVXLFdBQVcsSUFBSSxrQkFBaUI7QUFGakQsSUFBTSxtQkFBTjtBQXVCTyxNQUFlLGNBQWYsTUFBZSxvQkFBbUIsV0FBa0M7QUFBQSxFQWlKMUUsWUFDb0Isc0JBQ0EsY0FDQSx3QkFDQSxZQUNsQjtBQUNELFVBQU07QUFMYTtBQUNBO0FBQ0E7QUFDQTtBQWpKcEI7QUFBQSxTQUFpQixjQUFjLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUNqRSxTQUFTLGFBQWEsS0FBSyxZQUFZO0FBRXZDLFNBQWlCLGlCQUFpQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDcEUsU0FBUyxnQkFBZ0IsS0FBSyxlQUFlO0FBRTdDLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDdEUsU0FBUyxrQkFBa0IsS0FBSyxpQkFBaUI7QUFFakQsU0FBaUIsaUNBQWlDLEtBQUssVUFBVSxJQUFJLFFBQWtDLENBQUM7QUFDeEcsU0FBUyxnQ0FBZ0MsS0FBSywrQkFBK0I7QUFFN0UsU0FBaUIsd0JBQXdCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUMzRSxTQUFTLHVCQUF1QixLQUFLLHNCQUFzQjtBQUUzRCxTQUFpQix3QkFBd0IsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQzNFLFNBQVMsdUJBQXVCLEtBQUssc0JBQXNCO0FBRTNELFNBQWlCLDBCQUEwQixLQUFLLFVBQVUsSUFBSSxRQUFpQixDQUFDO0FBQ2hGLFNBQVMseUJBQXlCLEtBQUssd0JBQXdCO0FBTS9ELFNBQVUsaUJBQWlCLEtBQUssSUFBSTtBQUtwQyxTQUFVLE9BQXNDO0FBME5oRCxTQUFpQix3QkFBd0IsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUE2Qy9FLFNBQVEsdUJBQXVCO0FBNEUvQjtBQUFBO0FBQUEsU0FBUSw4QkFBbUQ7QUFDM0QsU0FBUSxpQ0FBdUU7QUFBQSxFQTlOL0U7QUFBQTtBQUFBLEVBMUhBLElBQUksZ0JBQXdCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBZ0I7QUFBQSxFQUsxRCxJQUFJLE1BQU07QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFNO0FBQUEsRUFDcEIsT0FBTyxLQUE2QixTQUFpRDtBQUM5RixTQUFLLE9BQU87QUFHWixTQUFLLFVBQVUsTUFBTSxxQkFBcUIsS0FBSyxVQUFVLEVBQUUsTUFBTTtBQUNoRSxVQUFJLGFBQWEsS0FBSyx1QkFBdUIsNEJBQTRCLEtBQUssTUFBTTtBQUNuRixjQUFNLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSyxLQUFLLFlBQVk7QUFDckMsY0FBTSxDQUFDLE9BQU8sTUFBTSxJQUFJLEtBQUssS0FBSyxRQUFRO0FBRTFDLGFBQUssdUJBQXVCLEVBQUUsTUFBTSxXQUFXLFdBQVcsT0FBTyxRQUFRLEdBQUcsRUFBRTtBQUM5RSxhQUFLLFdBQVcsTUFBTSwwQkFBMEIsS0FBSyxFQUFFLG1CQUFtQixLQUFLLG9CQUFvQjtBQUFBLE1BQ3BHO0FBRUEsV0FBSyxlQUFlLEtBQUs7QUFBQSxJQUMxQixDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsTUFBTSxxQkFBcUIsS0FBSyxZQUFZLEVBQUUsTUFBTTtBQUNsRSxVQUFJLGFBQWEsS0FBSyx1QkFBdUIsNEJBQTRCLEtBQUssc0JBQXNCO0FBQ25HLGFBQUssdUJBQXVCO0FBRTVCLGFBQUssV0FBVyxNQUFNLDRCQUE0QixLQUFLLEVBQUUsUUFBUTtBQUFBLE1BQ2xFO0FBRUEsV0FBSyxpQkFBaUIsS0FBSztBQUFBLElBQzVCLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxNQUFNLHFCQUFxQixLQUFLLFFBQVEsRUFBRSxNQUFNO0FBQzlELFdBQUssWUFBWSxLQUFLO0FBRXRCLFdBQUssUUFBUTtBQUFBLElBQ2QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLE1BQU0scUJBQXFCLEtBQUssT0FBTyxFQUFFLE1BQU07QUFDN0QsV0FBSyxpQkFBaUI7QUFFdEIsV0FBSyxpQkFBaUIsS0FBSyxJQUFJO0FBQUEsSUFDaEMsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLE1BQU0scUJBQXFCLEtBQUssTUFBTSxtQkFBbUIsRUFBRSxNQUFNLEtBQUssc0JBQXNCLEtBQUssQ0FBQyxDQUFDO0FBQ2xILFNBQUssVUFBVSxNQUFNLHFCQUFxQixLQUFLLE1BQU0sbUJBQW1CLEVBQUUsTUFBTSxLQUFLLHNCQUFzQixLQUFLLENBQUMsQ0FBQztBQUNsSCxTQUFLLFVBQVUsTUFBTSxxQkFBcUIsS0FBSyxNQUFNLHlCQUF5QixDQUFDLEdBQUcsZ0JBQWdCLFdBQVcsRUFBRSxpQkFBZSxLQUFLLHdCQUF3QixLQUFLLFdBQVcsQ0FBQyxDQUFDO0FBRzdLLFVBQU0sc0JBQXNCLENBQUM7QUFBQSxNQUFrQixLQUFLO0FBQUEsTUFBc0IsU0FBUyxrQkFBa0IsV0FBVyxjQUFjLFNBQVM7QUFBQTtBQUFBLElBQXVCO0FBQzlKLFFBQUksZUFBZSxxQkFBcUI7QUFDdkMsVUFBSSxlQUFlLGVBQWUsUUFBUSxDQUFDLElBQUksS0FBSyxFQUFFO0FBQUEsSUFDdkQ7QUFHQSxRQUFJLHVCQUF1Qix5QkFBeUIsS0FBSyxvQkFBb0IsR0FBRztBQUMvRSxZQUFNLDRCQUE0QixLQUFLLGFBQWEsUUFBaUIsWUFBVyxrQ0FBbUM7QUFDbkgsVUFBSSwyQkFBMkI7QUFDOUIsYUFBSyxxQkFBcUIsRUFBRSxRQUFRLDBCQUEwQixDQUFDO0FBQUEsTUFDaEUsT0FBTztBQUNOLGFBQUsscUJBQXFCLEVBQUUsUUFBUSwrQkFBK0IsQ0FBQztBQUFBLE1BQ3JFO0FBQUEsSUFDRDtBQUdBLFNBQUssYUFBYSxZQUFZLHFCQUFxQjtBQUNsRCxXQUFLLFVBQVUsTUFBTSxxQkFBcUIsS0FBSyx1QkFBdUIsQ0FBQyxPQUF1QixXQUEyQixFQUFFLE9BQU8sTUFBTSxFQUFFLEVBQUUsT0FBSztBQUNoSixjQUFNLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxZQUFZO0FBQy9CLGNBQU0sWUFBWSxTQUFTLE9BQU8saUJBQWlCLEVBQUUsS0FBSztBQUMxRCxjQUFNLEtBQUssS0FBSyxNQUFNLFVBQVUsQ0FBQyxJQUFJO0FBQ3JDLGNBQU0sS0FBSyxLQUFLLE1BQU0sVUFBVSxDQUFDLElBQUk7QUFJckMsWUFBSSxTQUFTO0FBQ1osY0FBSSxLQUFLLElBQWlEO0FBQ3pELGNBQUUsTUFBTSxlQUFlO0FBRXZCLGlCQUFLLCtCQUErQixLQUFLLEVBQUUsR0FBRyxJQUFJLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDMUQ7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNIO0FBR0EsUUFBSSxLQUFLLHVCQUF1QixLQUFLLGVBQWUsTUFBTSxNQUFNO0FBQy9ELFVBQUksWUFBWSxhQUFhO0FBQUEsSUFDOUI7QUFHQSxRQUFJLGFBQWE7QUFDaEIsV0FBSyxVQUFVLEtBQUsscUJBQXFCLE1BQU07QUFDOUMsYUFBSyxnQ0FBZ0MsU0FBUyxJQUFJO0FBQUEsTUFDbkQsQ0FBQyxDQUFDO0FBRUYsV0FBSyxVQUFVLEtBQUsscUJBQXFCLE1BQU07QUFDOUMsYUFBSyxnQ0FBZ0MsU0FBUyxJQUFJO0FBQUEsTUFDbkQsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUVBLFFBQUksYUFBYSxLQUFLLHVCQUF1QiwwQkFBMEI7QUFJdEUsV0FBSyxVQUFVLE1BQU0scUJBQXFCLFFBQVEsaUJBQWlCLENBQUMsT0FBdUIsYUFBc0IsRUFBRSxPQUFPLFFBQVEsRUFBRSxFQUFFLENBQUMsTUFBTTtBQUM1SSxhQUFLLGVBQWUsRUFBRSxPQUFPO0FBQUEsTUFDOUIsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGVBQWUsU0FBd0I7QUFDOUMsVUFBTSxRQUFRLEtBQUs7QUFDbkIsUUFBSSxTQUFTLEtBQUssUUFBUSxxQkFBcUIsNkJBQTZCLE9BQU8sT0FBTyxHQUFHO0FBQzVGLFdBQUssV0FBVyxNQUFNLDRCQUE0QixLQUFLLEVBQUUsd0NBQXdDLEtBQUs7QUFFdEcsV0FBSyxLQUFLLFVBQVUsS0FBSztBQUFBLElBQzFCO0FBQUEsRUFDRDtBQUFBLEVBV1UsV0FBVyxPQUFxQixzQkFBc0IsU0FBUyxPQUFPLGVBQWUsRUFBRSxTQUFTLEdBQVM7QUFZbEgsVUFBTSxpQkFBaUIsS0FBSyxxQkFBcUIsU0FBc0MsUUFBUTtBQUMvRixVQUFNLGdCQUFnQixlQUFlLGdCQUFnQixlQUFlO0FBQ3BFLFNBQUssZUFBZSxjQUFjLHdCQUF3QixDQUFDLGlCQUFpQixnQ0FBZ0MsRUFBRSxXQUFXLElBQUk7QUFDNUgsVUFBSSxDQUFDLE1BQU0sT0FBTyxNQUFNLFFBQVEsTUFBTSxHQUFHLE1BQU0sQ0FBQyxFQUFFLE1BQU0sV0FBUyxPQUFPLFVBQVUsUUFBUSxHQUFHO0FBQzVGLGFBQUssTUFBTSxVQUFVO0FBQUEsVUFDcEIsT0FBTyxNQUFNO0FBQUEsVUFDYixRQUFRLE1BQU07QUFBQSxVQUNkLEdBQUcsTUFBTTtBQUFBLFVBQ1QsR0FBRyxNQUFNO0FBQUEsUUFDVixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFFQSxRQUFJLE1BQU0sU0FBUyxXQUFXLGFBQWEsTUFBTSxTQUFTLFdBQVcsWUFBWTtBQU1oRixXQUFLLE1BQU0sU0FBUztBQUVwQixVQUFJLE1BQU0sU0FBUyxXQUFXLFlBQVk7QUFDekMsYUFBSyxjQUFjLE1BQU0sSUFBSTtBQUFBLE1BQzlCO0FBSUEsV0FBSyxNQUFNLEtBQUs7QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFBQSxFQUlBLHVCQUF1QixVQUF3QjtBQUM5QyxRQUFJLGFBQWE7QUFDaEIsV0FBSyxLQUFLLHVCQUF1QixRQUFRO0FBQUEsSUFDMUMsT0FBTztBQUNOLFdBQUssc0JBQXNCO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQUEsRUFFQSx5QkFBNkM7QUFDNUMsUUFBSSxhQUFhO0FBQ2hCLGFBQU8sS0FBSyxLQUFLLHVCQUF1QjtBQUFBLElBQ3pDO0FBRUEsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBSUEsa0JBQWtCLFFBQXVCO0FBQ3hDLFFBQUksYUFBYTtBQUNoQixXQUFLLEtBQUssa0JBQWtCLE1BQU07QUFBQSxJQUNuQztBQUVBLFNBQUssaUJBQWlCO0FBQUEsRUFDdkI7QUFBQSxFQUVBLG1CQUE0QjtBQUMzQixRQUFJLGFBQWE7QUFDaEIsYUFBTyxRQUFRLEtBQUssS0FBSyxpQkFBaUIsQ0FBQztBQUFBLElBQzVDO0FBRUEsV0FBTyxDQUFDLENBQUMsS0FBSztBQUFBLEVBQ2Y7QUFBQSxFQUVBLE1BQU0sU0FBcUM7QUFDMUMsWUFBUSxTQUFTLFFBQVEsVUFBVSxVQUFVO0FBQUEsTUFDNUMsS0FBSyxVQUFVO0FBQ2QsYUFBSyxjQUFjO0FBQ25CO0FBQUEsTUFFRCxLQUFLLFVBQVU7QUFDZCxhQUFLLGdCQUFnQjtBQUNyQjtBQUFBLE1BRUQsS0FBSyxVQUFVO0FBQ2QsWUFBSSxhQUFhO0FBQ2hCLG1CQUFTLElBQUksTUFBTSxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQUEsUUFDbkM7QUFDQSxhQUFLLGNBQWM7QUFDbkI7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBSVEsa0JBQXdCO0FBQy9CLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxTQUFLLHNCQUFzQixRQUFRO0FBR25DLGdCQUFZLElBQUksaUJBQWlCLFNBQVMsYUFBYSxJQUFJLENBQUM7QUFHNUQsUUFBSSxhQUFhLFNBQVM7QUFDekIsV0FBSyxLQUFLLFdBQVcsSUFBSTtBQUN6QixrQkFBWSxJQUFJLGFBQWEsTUFBTSxLQUFLLEtBQUssV0FBVyxLQUFLLENBQUMsQ0FBQztBQUFBLElBQ2hFLFdBQVcsYUFBYTtBQUN2QixlQUFTLElBQUksTUFBTSxPQUFPLGVBQWU7QUFBQSxJQUMxQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLG1CQUF5QjtBQUNoQyxTQUFLLHNCQUFzQixNQUFNO0FBQUEsRUFDbEM7QUFBQSxFQUVRLGdCQUFnQjtBQUN2QixVQUFNLE1BQU0sS0FBSztBQUNqQixRQUFJLENBQUMsS0FBSztBQUNUO0FBQUEsSUFDRDtBQUVBLFFBQUksSUFBSSxZQUFZLEdBQUc7QUFDdEIsVUFBSSxRQUFRO0FBQUEsSUFDYjtBQUVBLFFBQUksTUFBTTtBQU1WLFFBQUksWUFBWSxNQUFNO0FBQUEsRUFDdkI7QUFBQSxFQVNBLHFCQUFxQixTQUEwRztBQUM5SCxVQUFNLE1BQU0sS0FBSztBQUNqQixRQUFJLENBQUMsS0FBSztBQUNUO0FBQUEsSUFDRDtBQUdBLFFBQUksUUFBUSxRQUFRO0FBQ25CLFdBQUssYUFBYSxRQUFTLFdBQVcsb0NBQXFDLFFBQVEsTUFBTTtBQUFBLElBQzFGO0FBR0EsUUFBSSxDQUFDLGVBQWUseUJBQXlCLEtBQUssb0JBQW9CLEdBQUc7QUFHeEUsVUFBSSxRQUFRLFdBQVcsUUFBVztBQUNqQyxhQUFLLHVCQUF1QixRQUFRO0FBQUEsTUFDckM7QUFFQSxZQUFNLGtCQUFrQixRQUFRLG1CQUFtQixLQUFLLHlCQUF5QjtBQUNqRixZQUFNLGtCQUFrQixRQUFRLG1CQUFtQixLQUFLLHlCQUF5QjtBQUVqRixVQUFJLFFBQVEsb0JBQW9CLFVBQWEsUUFBUSxvQkFBb0IsUUFBVztBQUNuRixhQUFLLDBCQUEwQixFQUFFLGlCQUFpQixnQkFBZ0I7QUFBQSxNQUNuRTtBQUVBLFlBQU0sMkJBQTJCLEtBQUssd0JBQXdCLGtCQUFrQixLQUFLLFNBQVMsZUFBZSxJQUFJO0FBQ2pILFlBQU0sMkJBQTJCLEtBQUssd0JBQXdCLGtCQUFrQixLQUFLLFNBQVMsZUFBZSxJQUFJO0FBRWpILFVBQUksbUJBQW1CO0FBQUEsUUFDdEIsT0FBTywwQkFBMEIsS0FBSyxNQUFNLEtBQUssU0FBWTtBQUFBLFFBQzdELGFBQWEsMEJBQTBCLEtBQUssTUFBTSxLQUFLLFNBQVk7QUFBQSxRQUNuRSxRQUFRLFFBQVEsU0FBUyxRQUFRLFNBQVMsSUFBSTtBQUFBO0FBQUEsTUFDL0MsQ0FBQztBQUFBLElBQ0YsV0FHUyxlQUFlLFFBQVEsV0FBVyxRQUFXO0FBSXJELFlBQU0sZUFBZSxlQUFlLFFBQVEsQ0FBQyxJQUFJLEtBQUs7QUFDdEQsWUFBTSxTQUFTLEtBQUssT0FBTyxRQUFRLFNBQVMsZ0JBQWdCLENBQUM7QUFDN0QsVUFBSSxDQUFDLFFBQVE7QUFDWixZQUFJLHdCQUF3QixJQUFJO0FBQUEsTUFDakMsT0FBTztBQUNOLFlBQUksd0JBQXdCLEVBQUUsR0FBRyxTQUFTLEdBQUcsR0FBRyxPQUFPLENBQUM7QUFBQSxNQUN6RDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxTQUFTLE9BQXVCO0FBS3ZDLFVBQU0sU0FBUyxNQUFNLE9BQU8sSUFBSSxNQUFNLEtBQUs7QUFDM0MsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sWUFBWTtBQUNsQixVQUFNLElBQUksS0FBSyxNQUFNLE9BQU8sS0FBSyxJQUFJLFNBQVM7QUFDOUMsVUFBTSxJQUFJLEtBQUssTUFBTSxPQUFPLEtBQUssSUFBSSxTQUFTO0FBQzlDLFVBQU0sSUFBSSxLQUFLLE1BQU0sT0FBTyxLQUFLLElBQUksU0FBUztBQUU5QyxXQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO0FBQUEsRUFDNUI7QUFBQSxFQVNBLG1CQUF5QjtBQUN4QixTQUFLLGNBQWMsQ0FBQyxLQUFLLGNBQWMsS0FBSztBQUFBLEVBQzdDO0FBQUEsRUFFVSxjQUFjLFlBQXFCLGFBQTRCO0FBR3hFLFFBQUksb0JBQW9CLEtBQUssb0JBQW9CLEdBQUc7QUFDbkQsV0FBSyxvQkFBb0IsWUFBWSxXQUFXO0FBQUEsSUFDakQsT0FBTztBQUNOLFdBQUssb0JBQW9CLFVBQVU7QUFBQSxJQUNwQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQUksZUFBd0I7QUFDM0IsUUFBSSxlQUFlLE9BQU8sS0FBSyxnQ0FBZ0MsV0FBVztBQUN6RSxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBRUEsVUFBTSxNQUFNLEtBQUs7QUFDakIsVUFBTSxlQUFlLEtBQUssYUFBYTtBQUN2QyxVQUFNLHFCQUFxQixLQUFLLG1CQUFtQjtBQUVuRCxXQUFPLFFBQVEsZ0JBQWdCLGtCQUFrQjtBQUFBLEVBQ2xEO0FBQUEsRUFFUSxvQkFBb0IsWUFBcUIsYUFBNEI7QUFDNUUsVUFBTSxNQUFNLEtBQUs7QUFDakIsUUFBSSxLQUFLLG1CQUFtQixHQUFHO0FBQzlCLFdBQUssb0JBQW9CLEtBQUs7QUFBQSxJQUMvQjtBQUVBLFNBQUssc0JBQXNCLFlBQVksV0FBVztBQUFBLEVBQ25EO0FBQUEsRUFFUSxzQkFBc0IsWUFBcUIsYUFBNEI7QUFDOUUsUUFBSSxhQUFhO0FBUWhCLFdBQUssOEJBQThCO0FBRW5DLFlBQU0saUNBQWlDLEtBQUssaUNBQWlDLElBQUksZ0JBQXlCO0FBQzFHLE9BQUMsWUFBWTtBQUNaLGNBQU0sZUFBZSxNQUFNLFFBQVEsS0FBSztBQUFBLFVBQ3ZDLCtCQUErQjtBQUFBLFVBQy9CLFFBQVEsR0FBSyxFQUFFLEtBQUssTUFBTSxLQUFLO0FBQUEsUUFDaEMsQ0FBQztBQUVELFlBQUksS0FBSyxtQ0FBbUMsZ0NBQWdDO0FBQzNFO0FBQUEsUUFDRDtBQUVBLGFBQUssOEJBQThCO0FBQ25DLGFBQUssaUNBQWlDO0FBU3RDLFlBQUksQ0FBQyxnQkFBZ0IsY0FBYyxlQUFlLEtBQUssT0FBTyxDQUFDLEtBQUssSUFBSSxhQUFhLEdBQUc7QUFXdkYsZUFBSyxXQUFXLEtBQUsscUZBQXFGO0FBRTFHLGVBQUssc0JBQXNCLEtBQUs7QUFBQSxRQUNqQztBQUFBLE1BQ0QsR0FBRztBQUFBLElBQ0o7QUFFQSxVQUFNLE1BQU0sS0FBSztBQUNqQixTQUFLLGNBQWMsVUFBVTtBQUFBLEVBQzlCO0FBQUEsRUFFUSxvQkFBb0IsWUFBMkI7QUFDdEQsVUFBTSxNQUFNLEtBQUs7QUFDakIsUUFBSSxLQUFLLGFBQWEsR0FBRztBQUN4QixXQUFLLHNCQUFzQixPQUFPLEtBQUs7QUFBQSxJQUN4QztBQUVBLFNBQUssb0JBQW9CLFVBQVU7QUFDbkMsU0FBSyxZQUFZLE1BQU07QUFBQSxFQUN4QjtBQUFBLEVBTVMsVUFBZ0I7QUFDeEIsVUFBTSxRQUFRO0FBRWQsU0FBSyxPQUFPO0FBQUEsRUFDYjtBQUNEO0FBQUE7QUFwZXNCLFlBdVNHLHFDQUFxQztBQXZTdkQsSUFBZSxhQUFmO0FBc2VBLElBQU0sYUFBTixjQUF5QixXQUFrQztBQUFBLEVBMEVqRSxZQUNDLFFBQ2EsWUFDd0IsbUJBQ1osd0JBQ1EsZUFDYyx5QkFDaEIsYUFDa0IsK0JBQ1gsb0JBQ2Ysc0JBQ2Esa0JBQ2UsaUNBQ2QsbUJBQ0Qsa0JBQ0MsbUJBQ0csc0JBQ04sZ0JBQ1oscUJBQ2dCLG9CQUN2QixjQUNRLHNCQUN0QjtBQUNELFVBQU0sc0JBQXNCLGNBQWMsd0JBQXdCLFVBQVU7QUFwQnZDO0FBRUo7QUFDYztBQUNoQjtBQUNrQjtBQUNYO0FBRUY7QUFDZTtBQUNkO0FBQ0Q7QUFDQztBQUNHO0FBQ047QUFFSTtBQXpGdkM7QUFBQSxTQUFpQixjQUFjLEtBQUssVUFBVSxJQUFJLFFBQW9CLENBQUM7QUFDdkUsU0FBUyxhQUFhLEtBQUssWUFBWTtBQUV2QyxTQUFpQixvQkFBb0IsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3ZFLFNBQVMsbUJBQW1CLEtBQUssa0JBQWtCO0FBRW5ELFNBQWlCLGdCQUFnQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDbkUsU0FBUyxlQUFlLEtBQUssY0FBYztBQTZDM0MsU0FBaUIscUJBQXdELENBQUM7QUFFMUUsU0FBaUIsaUJBQXNELENBQUM7QUFFeEUsU0FBUSxtQkFBdUM7QUFDL0MsU0FBUSxpQkFBcUM7QUFFN0MsU0FBUSxrQkFBc0M7QUFJOUMsU0FBUSxZQUFZO0FBZ0dwQixTQUFRLGFBQWE7QUFrWXJCLFNBQWlCLDBCQUEwQixLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQWpjaEY7QUFDQyxXQUFLLGtCQUFrQixLQUFLLFVBQVUsb0JBQW9CLG1CQUErQyxDQUFDO0FBRzFHLFlBQU0sQ0FBQyxPQUFPLG1CQUFtQixJQUFJLEtBQUssbUJBQW1CLE9BQU8sS0FBSztBQUN6RSxXQUFLLGNBQWM7QUFDbkIsV0FBSyxXQUFXLE1BQU0sbUNBQW1DLEtBQUs7QUFFOUQsWUFBTSxpQkFBMEM7QUFBQSxRQUMvQyxTQUFTLFdBQVcsVUFBVSxtREFBbUQsRUFBRTtBQUFBLFFBQ25GLHFCQUFxQixDQUFDLDBCQUEwQixLQUFLLGdCQUFnQixTQUFTLFNBQVMsQ0FBQyxFQUFFO0FBQUEsUUFDMUYsZ0JBQWdCLEtBQUssdUJBQXVCLGVBQWUsb0JBQW9CO0FBQUEsTUFDaEY7QUFDQSxVQUFJLE9BQU8sa0JBQWtCO0FBQzVCLHVCQUFlLHVCQUF1QjtBQUFBLE1BQ3ZDO0FBRUEsWUFBTSxVQUFVLHFCQUFxQixlQUFlLDZCQUE2QixLQUFLLGFBQWEsUUFBVyxjQUFjO0FBRzVILFdBQUssa0NBQWtDO0FBQ3ZDLFdBQUssT0FBTyxJQUFJLFNBQVMsY0FBYyxPQUFPO0FBQzlDLFdBQUssaUNBQWlDO0FBRXRDLFdBQUssTUFBTSxLQUFLLEtBQUs7QUFDckIsV0FBSyxPQUFPLEtBQUssTUFBTSxPQUFPO0FBRzlCLFdBQUssV0FBVyxLQUFLLGFBQWEsbUJBQW1CO0FBRXJELFdBQUssaUJBQWlCLEtBQUssSUFBSTtBQUFBLElBQ2hDO0FBS0EsUUFBSSxpQkFBaUIsU0FBUyxLQUFLLHVCQUF1QixLQUFLLDhCQUE4QixLQUFLLE1BQU07QUFDeEcsUUFBSSxlQUFlLFNBQVMsS0FBSyx1QkFBdUIsS0FBSyw0QkFBNEIsS0FBSyxPQUFPO0FBQ3JHLFFBQUksa0JBQWtCLEtBQUssZ0JBQWdCLEtBQUssaUJBQWlCLGNBQWM7QUFDOUUsV0FBSyxXQUFXLEtBQUsseUNBQXlDLGNBQWMsa0JBQWtCLFlBQVksc0JBQXNCO0FBQ2hJLHVCQUFpQjtBQUNqQixxQkFBZTtBQUFBLElBQ2hCO0FBRUEsU0FBSyxpQkFBaUIsb0JBQUksSUFBb0I7QUFDOUMsU0FBSyxrQ0FBa0MsS0FBSyxNQUFNLGVBQWUsY0FBYztBQUMvRSxTQUFLLHVCQUF1QixLQUFLLFVBQVUsSUFBSSxRQUFjLGNBQWMsQ0FBQztBQUM1RSxTQUFLLG9DQUFvQyxLQUFLLFVBQVUsSUFBSSxpQkFBaUIsTUFBTTtBQUNsRixXQUFLLDJCQUEyQjtBQUFBLElBQ2pDLEdBQUcsWUFBWSxDQUFDO0FBS2hCLFNBQUssdUJBQXVCO0FBRzVCLFNBQUssZUFBZTtBQUdwQixTQUFLLGtCQUFrQjtBQUFBLEVBQ3hCO0FBQUEsRUE5SUEsSUFBSSxLQUFhO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBSztBQUFBLEVBSXBDLElBQUksYUFBaUM7QUFBRSxXQUFPLEtBQUssU0FBUztBQUFBLEVBQVk7QUFBQSxFQUV4RSxJQUFJLGtCQUF1RjtBQUFFLFdBQU8sS0FBSyxTQUFTO0FBQUEsRUFBVztBQUFBLEVBRTdILElBQUksVUFBd0M7QUFDM0MsUUFBSSxDQUFDLEtBQUssUUFBUTtBQUNqQixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sVUFBVSxLQUFLLHdCQUF3QixTQUFTLEtBQUssQ0FBQUMsYUFBV0EsU0FBUSxPQUFPLEtBQUssUUFBUSxTQUFTLFFBQVEsRUFBRTtBQUNySCxRQUFJLEtBQUssOEJBQThCLFNBQVM7QUFDL0MsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEtBQUssd0JBQXdCLHVCQUF1QixLQUFLLE9BQU8sYUFBYSxzQkFBc0IsS0FBSyxZQUFZLEtBQUssMEJBQTBCLENBQUMsS0FBSyxLQUFLLHdCQUF3QjtBQUFBLEVBQzlMO0FBQUEsRUFFQSxJQUFJLGtCQUFzQztBQUFFLFdBQU8sS0FBSyxTQUFTO0FBQUEsRUFBaUI7QUFBQSxFQUdsRixJQUFJLFNBQWlEO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBUztBQUFBLEVBRTVFLElBQUksNkJBQXNDO0FBQUUsV0FBTyxDQUFDLENBQUUsS0FBSyxTQUFTO0FBQUEsRUFBMkI7QUFBQSxFQUUvRixJQUFJLHNCQUErQjtBQUFFLFdBQU8sQ0FBQyxDQUFFLEtBQUssU0FBUztBQUFBLEVBQXFCO0FBQUEsRUFFbEYsSUFBSSxvQ0FBNkM7QUFBRSxXQUFPLEtBQUssOEJBQThCLEtBQUssdUJBQXVCLENBQUMsS0FBSyxTQUFTO0FBQUEsRUFBUztBQUFBLEVBb0hqSixXQUFpQjtBQUNoQixTQUFLLFdBQVcsTUFBTSwyQ0FBMkMsS0FBSyxHQUFHLEdBQUc7QUFFNUUsU0FBSyxhQUFhO0FBR2xCLFdBQU8sS0FBSyxtQkFBbUIsUUFBUTtBQUN0QyxXQUFLLG1CQUFtQixJQUFJLEVBQUcsSUFBSTtBQUFBLElBQ3BDO0FBR0EsU0FBSyxrQkFBa0IsS0FBSztBQUFBLEVBQzdCO0FBQUEsRUFFQSxRQUE4QjtBQUM3QixXQUFPLElBQUksUUFBcUIsYUFBVztBQUMxQyxVQUFJLEtBQUssU0FBUztBQUNqQixlQUFPLFFBQVEsSUFBSTtBQUFBLE1BQ3BCO0FBR0EsV0FBSyxtQkFBbUIsS0FBSyxPQUFPO0FBQUEsSUFDckMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLElBQUksVUFBbUI7QUFDdEIsV0FBTyxLQUFLLGVBQWU7QUFBQSxFQUM1QjtBQUFBLEVBRUEsSUFBSSxxQkFBb0M7QUFDdkMsV0FBTyxJQUFJLFFBQWMsYUFBVztBQUVuQyxlQUFTLFNBQVM7QUFDakIsc0JBQWMsUUFBUTtBQUN0QixxQkFBYSxRQUFRO0FBRXJCLGdCQUFRO0FBQUEsTUFDVDtBQUVBLFlBQU0sZ0JBQWdCLEtBQUssV0FBVyxNQUFNLE9BQU8sQ0FBQztBQUNwRCxZQUFNLGVBQWUsS0FBSyxXQUFXLE1BQU0sT0FBTyxDQUFDO0FBQUEsSUFDcEQsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLG9CQUEwQjtBQUdqQyxTQUFLLFVBQVUsTUFBTSxxQkFBcUIsS0FBSyxNQUFNLGNBQWMsRUFBRSxNQUFNLEtBQUssY0FBYyxZQUFZLFlBQVksQ0FBQyxDQUFDO0FBQ3hILFNBQUssVUFBVSxNQUFNLHFCQUFxQixLQUFLLE1BQU0sWUFBWSxFQUFFLE1BQU0sS0FBSyxjQUFjLFlBQVksVUFBVSxDQUFDLENBQUM7QUFDcEgsU0FBSyxVQUFVLE1BQU0scUJBQXFCLEtBQUssS0FBSyxhQUFhLHVCQUF1QixDQUFDLE9BQU8sWUFBWSxPQUFPLEVBQUUsYUFBVyxLQUFLLGNBQWMsWUFBWSxjQUFjLEVBQUUsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDO0FBQzdMLFNBQUssVUFBVSxNQUFNLHFCQUFxQixLQUFLLEtBQUssYUFBYSxpQkFBaUIsQ0FBQyxPQUFPLFVBQVUsWUFBWSxFQUFFLFVBQVUsT0FBTyxFQUFFLEVBQUUsQ0FBQyxFQUFFLFVBQVUsT0FBTyxNQUFNLEtBQUssY0FBYyxZQUFZLE1BQU0sRUFBRSxRQUFRLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFPNU4sU0FBSyxVQUFVLE1BQU0scUJBQXFDLEtBQUssS0FBSyxhQUFhLHFCQUFxQixFQUFFLFdBQVMsTUFBTSxlQUFlLENBQUMsQ0FBQztBQUd4SSxTQUFLLFVBQVUsTUFBTSxxQkFBcUIsS0FBSyxLQUFLLGFBQWEsaUJBQWlCLEVBQUUsTUFBTTtBQUd6RixVQUFJLEtBQUssbUJBQW1CO0FBQzNCLGFBQUssVUFBVSxLQUFLO0FBRXBCLGFBQUssb0JBQW9CO0FBQUEsTUFDMUI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLFNBQUssVUFBVSxLQUFLLGNBQWMsTUFBTTtBQUN2QyxVQUFJLEtBQUssU0FBUztBQUNqQixhQUFLLFFBQVEsWUFBWTtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxnQkFBZ0IsTUFBTTtBQUN6QyxVQUFJLEtBQUssU0FBUztBQUNqQixhQUFLLFFBQVEsWUFBWTtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixTQUFLLFVBQVUsS0FBSyxxQkFBcUIsTUFBTTtBQUM5QyxXQUFLLGNBQWMsMEJBQTBCLGtCQUFrQixJQUFJO0FBQUEsSUFDcEUsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLEtBQUsscUJBQXFCLE1BQU07QUFDOUMsV0FBSyxjQUFjLDBCQUEwQixrQkFBa0IsSUFBSTtBQUFBLElBQ3BFLENBQUMsQ0FBQztBQUdGLFNBQUssVUFBVSxLQUFLLHFCQUFxQix5QkFBeUIsT0FBSyxLQUFLLHVCQUF1QixDQUFDLENBQUMsQ0FBQztBQUd0RyxTQUFLLFVBQVUsS0FBSyxnQ0FBZ0MsNkJBQTZCLE9BQUssS0FBSyw2QkFBNkIsQ0FBQyxDQUFDLENBQUM7QUFHM0gsVUFBTSxPQUFPLENBQUMseUJBQXlCO0FBQ3ZDLFFBQUksS0FBSyxlQUFlLG1CQUFtQixZQUFZO0FBQ3RELFlBQU0sYUFBYSxJQUFJLE1BQU0sS0FBSyxlQUFlLGtCQUFrQixVQUFVO0FBQzdFLFdBQUssS0FBSyxHQUFHLFdBQVcsTUFBTSxNQUFNLFdBQVcsU0FBUyxJQUFJO0FBQUEsSUFDN0Q7QUFDQSxTQUFLLEtBQUssWUFBWSxRQUFRLFdBQVcsb0JBQW9CLEVBQUUsS0FBSyxHQUFHLE9BQU8sU0FBUyxPQUFPO0FBQzdGLFlBQU0sVUFBVSxNQUFNLEtBQUssc0JBQXNCO0FBRWpELFNBQUcsRUFBRSxRQUFRLE9BQU8sZ0JBQWdCLE9BQU8sT0FBTyxRQUFRLGdCQUFnQixPQUFPLEVBQUUsQ0FBQztBQUFBLElBQ3JGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFHUSx3QkFBeUM7QUFDaEQsUUFBSSxDQUFDLEtBQUssMkJBQTJCO0FBQ3BDLFdBQUssNEJBQTRCO0FBQUEsUUFDaEMsS0FBSyxlQUFlO0FBQUEsUUFDcEIsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLE1BQWdCO0FBQUEsSUFDdkI7QUFFQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFNQSxNQUFjLGNBQWMsTUFBbUIsU0FBaUU7QUFFL0csWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLLFlBQVk7QUFDaEIsYUFBSyxXQUFXLE1BQU0sOENBQThDLFNBQVMsVUFBVSxXQUFXLFdBQVcsU0FBUyxZQUFZLFdBQVcsR0FBRztBQUNoSjtBQUFBLE1BQ0QsS0FBSyxZQUFZO0FBQ2hCLGFBQUssV0FBVyxNQUFNLG1DQUFtQztBQUN6RDtBQUFBLE1BQ0QsS0FBSyxZQUFZO0FBQ2hCLGFBQUssV0FBVyxNQUFNLHlDQUF5QztBQUMvRDtBQUFBLE1BQ0QsS0FBSyxZQUFZO0FBQ2hCLGFBQUssV0FBVyxNQUFNLHVDQUF1QyxTQUFTLFVBQVUsV0FBVyxXQUFXLFNBQVMsWUFBWSxXQUFXLEdBQUc7QUFDekk7QUFBQSxJQUNGO0FBZUEsU0FBSyxpQkFBaUIsV0FBd0QsZUFBZTtBQUFBLE1BQzVGO0FBQUEsTUFDQSxRQUFRLFNBQVM7QUFBQSxNQUNqQixNQUFNLFNBQVM7QUFBQSxJQUNoQixDQUFDO0FBR0QsWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLLFlBQVk7QUFBQSxNQUNqQixLQUFLLFlBQVk7QUFLaEIsWUFBSSxLQUFLLG1DQUFtQztBQUMzQyxlQUFLLHFCQUFxQixLQUFLLENBQUM7QUFDaEM7QUFBQSxRQUNEO0FBS0EsWUFBSSxLQUFLLHVCQUF1QixLQUFLLDBCQUEwQixHQUFHO0FBQ2pFLGdCQUFNLEtBQUssY0FBYyxPQUFPLEtBQUs7QUFDckMsZUFBSyxxQkFBcUIsS0FBSztBQUMvQjtBQUFBLFFBQ0Q7QUFHQSxZQUFJLFNBQVMsWUFBWSxjQUFjO0FBQ3RDLGNBQUksS0FBSyw4QkFBOEIsS0FBSyx1QkFBdUIsS0FBSyxNQUFNLGFBQWEsaUJBQWlCLEdBQUc7QUFPOUc7QUFBQSxVQUNEO0FBR0EsZUFBSyxxQkFBcUIsUUFBUSxNQUFNLEtBQUssNEJBQTRCLENBQUM7QUFLMUUsZUFBSyxrQ0FBa0MsU0FBUztBQUdoRCxnQkFBTSxFQUFFLFVBQVUsZ0JBQWdCLElBQUksTUFBTSxLQUFLLGtCQUFrQixlQUFlO0FBQUEsWUFDakYsTUFBTTtBQUFBLFlBQ04sU0FBUztBQUFBLGNBQ1IsU0FBUyxFQUFFLEtBQUssVUFBVSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxVQUFVO0FBQUEsY0FDMUUsU0FBUyxFQUFFLEtBQUssU0FBUyxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxTQUFTO0FBQUEsY0FDeEUsU0FBUyxFQUFFLEtBQUssUUFBUSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxnQkFBZ0I7QUFBQSxZQUMvRTtBQUFBLFlBQ0EsU0FBUyxTQUFTLGNBQWMsOEJBQThCO0FBQUEsWUFDOUQsUUFBUSxTQUFTLG9CQUFvQixxREFBcUQ7QUFBQSxZQUMxRixlQUFlLEtBQUssU0FBUyxZQUFZLFNBQVMsdUJBQXVCLHVCQUF1QixJQUFJO0FBQUEsVUFDckcsR0FBRyxLQUFLLElBQUk7QUFHWixjQUFJLGFBQWEsR0FBc0I7QUFDdEMsa0JBQU0sU0FBUyxhQUFhO0FBQzVCLGlCQUFLLDJCQUEyQjtBQUNoQyxrQkFBTSxLQUFLLGNBQWMsUUFBUSxlQUFlO0FBQUEsVUFDakQ7QUFBQSxRQUNELFdBR1MsU0FBUyxZQUFZLGNBQWM7QUFDM0MsY0FBSTtBQUNKLGNBQUksQ0FBQyxTQUFTO0FBQ2Isc0JBQVUsU0FBUyxXQUFXLG9DQUFvQztBQUFBLFVBQ25FLE9BQU87QUFDTixzQkFBVSxTQUFTLGtCQUFrQixtRUFBbUUsUUFBUSxRQUFRLFFBQVEsWUFBWSxXQUFXO0FBQUEsVUFDeEo7QUFHQSxnQkFBTSxFQUFFLFVBQVUsZ0JBQWdCLElBQUksTUFBTSxLQUFLLGtCQUFrQixlQUFlO0FBQUEsWUFDakYsTUFBTTtBQUFBLFlBQ04sU0FBUztBQUFBLGNBQ1IsS0FBSyxTQUFTLFlBQVksU0FBUyxFQUFFLEtBQUssVUFBVSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxVQUFVLElBQUksU0FBUyxFQUFFLEtBQUssYUFBYSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxjQUFjO0FBQUEsY0FDekwsU0FBUyxFQUFFLEtBQUssU0FBUyxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxTQUFTO0FBQUEsWUFDekU7QUFBQSxZQUNBO0FBQUEsWUFDQSxRQUFRLEtBQUssU0FBUyxZQUNyQixTQUFTLDBCQUEwQiwrRkFBK0YsSUFDbEksU0FBUyw0QkFBNEIscUZBQXFGO0FBQUEsWUFDM0gsZUFBZSxLQUFLLFNBQVMsWUFBWSxTQUFTLHVCQUF1Qix1QkFBdUIsSUFBSTtBQUFBLFVBQ3JHLEdBQUcsS0FBSyxJQUFJO0FBR1osZ0JBQU0sU0FBUyxhQUFhO0FBQzVCLGdCQUFNLEtBQUssY0FBYyxRQUFRLGVBQWU7QUFBQSxRQUNqRDtBQUNBO0FBQUEsTUFDRCxLQUFLLFlBQVk7QUFDaEIsYUFBSywyQkFBMkI7QUFDaEM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxjQUFjLFFBQWlCLG9CQUE0QztBQUN4RixVQUFNLFlBQVksS0FBSyxTQUFTO0FBR2hDLFFBQUksc0JBQXNCLFdBQVc7QUFDcEMsVUFBSTtBQUNILGNBQU0sbUJBQW1CLEtBQUssbUJBQW1CLGlCQUFpQixTQUFTO0FBQzNFLGNBQU0saUJBQWlCLEtBQUs7QUFDNUIseUJBQWlCLE9BQU8sZ0NBQWdDO0FBQ3hELGNBQU0saUJBQWlCLE1BQU07QUFBQSxNQUM5QixTQUFTLE9BQU87QUFDZixhQUFLLFdBQVcsTUFBTSxLQUFLO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBR0EsU0FBSyxjQUFjLEtBQUs7QUFFeEIsUUFBSTtBQUVILFVBQUksVUFBVSxLQUFLLFNBQVM7QUFHM0IsWUFBSSxZQUEwRDtBQUM5RCxZQUFJLGFBQWE7QUFDakIsWUFBSSxrQ0FBa0MsU0FBUyxHQUFHO0FBQ2pELHNCQUFZLEVBQUUsV0FBVyxVQUFVLElBQUk7QUFBQSxRQUN4QyxXQUFXLHNCQUFzQixTQUFTLEdBQUc7QUFDNUMsc0JBQVksRUFBRSxjQUFjLFVBQVUsV0FBVztBQUFBLFFBQ2xELE9BQU87QUFDTix1QkFBYTtBQUFBLFFBQ2Q7QUFHQSxjQUFNLFVBQVUsTUFBTSxLQUFLLG1CQUFtQixLQUFLO0FBQUEsVUFDbEQsU0FBUyxZQUFZO0FBQUEsVUFDckIsU0FBUyxLQUFLLFFBQVE7QUFBQSxVQUN0QixLQUFLO0FBQUEsWUFDSixHQUFHLEtBQUssdUJBQXVCO0FBQUEsWUFDL0IsR0FBRyxDQUFDO0FBQUE7QUFBQSxVQUNMO0FBQUEsVUFDQSxZQUFZLFlBQVksQ0FBQyxTQUFTLElBQUk7QUFBQSxVQUN0QztBQUFBLFVBQ0EsZ0JBQWdCO0FBQUEsVUFDaEIsaUJBQWlCLEtBQUs7QUFBQSxRQUN2QixDQUFDLEdBQUcsR0FBRyxDQUFDO0FBQ1IsZ0JBQVEsTUFBTTtBQUFBLE1BQ2Y7QUFBQSxJQUNELFVBQUU7QUFJRCxXQUFLLE1BQU0sUUFBUTtBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUFBLEVBRVEsNkJBQTZCLFdBQXVDO0FBSTNFLFFBQUksS0FBSyxTQUFTLFdBQVcsT0FBTyxVQUFVLElBQUk7QUFDakQsV0FBSyxRQUFRLFlBQVk7QUFBQSxJQUMxQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHVCQUF1QixHQUFxQztBQUduRSxRQUFJLGdCQUFnQixDQUFDLEtBQUssRUFBRSxxQkFBcUIsa0NBQWtDLElBQUk7QUFDdEYsWUFBTSxrQkFBa0IsS0FBSyxxQkFBcUIsU0FBa0Isa0NBQWtDO0FBQ3RHLFVBQUksaUJBQWlCO0FBQ3BCLGFBQUssc0JBQXNCO0FBQUEsTUFDNUIsT0FBTztBQUNOLGFBQUssd0JBQXdCLE1BQU07QUFBQSxNQUNwQztBQUFBLElBQ0Q7QUFHQSxRQUFJLENBQUMsS0FBSyxFQUFFLHFCQUFxQixhQUFhLGlCQUFpQixHQUFHO0FBQ2pFLFlBQU0sdUJBQXVCLEtBQUsscUJBQXFCO0FBQ3ZELFVBQUkseUJBQXlCLEtBQUssMEJBQTBCO0FBQzNELGFBQUssMkJBQTJCO0FBQ2hDLGFBQUsscUJBQXFCLG9CQUFvQjtBQUFBLE1BQy9DO0FBQUEsSUFDRDtBQUdBLFFBQUksQ0FBQyxLQUFLLEVBQUUscUJBQXFCLFlBQVksS0FBSyxFQUFFLHFCQUFxQixjQUFjLEdBQUc7QUFDekYsWUFBTSxVQUFVLEtBQUsscUJBQXFCLFFBQWdCLFlBQVk7QUFDdEUsVUFBSSxnQkFBZ0IsUUFBUSxrQkFBa0IsSUFBSSxLQUFLLE1BQ2xELFFBQVEsSUFBSSxhQUFhLEtBQUssUUFBUSxJQUFJLGFBQWEsS0FBSyxRQUFRLElBQUksWUFBWSxLQUFLLFFBQVEsSUFBSSxZQUFZLEtBQUssSUFBSSxLQUFLLEtBQ2hJO0FBRUosVUFBSSxjQUFjLFFBQVEsR0FBRyxNQUFNLElBQUk7QUFDdEMsY0FBTSxNQUFNLElBQUksTUFBTSxZQUFhO0FBQ25DLGNBQU0sSUFBSSxJQUFJLFVBQVUsUUFBUSxHQUFHO0FBQ25DLFlBQUksTUFBTSxJQUFJO0FBQ2IseUJBQWUsSUFBSSxLQUFLLEVBQUUsV0FBVyxJQUFJLFVBQVUsVUFBVSxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQ25FLFNBQVM7QUFBQSxRQUNaO0FBQUEsTUFDRDtBQUNBLFVBQUksY0FBYyxTQUFTLEdBQUcsR0FBRztBQUNoQyx1QkFBZSxhQUFhLE9BQU8sR0FBRyxhQUFhLFNBQVMsQ0FBQztBQUFBLE1BQzlEO0FBRUEsWUFBTSxjQUFjLEtBQUsscUJBQXFCLFNBQW1CLGNBQWMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsS0FBSyxLQUFLLENBQUMsRUFBRSxLQUFLLEdBQUcsTUFDdEgsUUFBUSxJQUFJLFVBQVUsS0FBSyxRQUFRLElBQUksVUFBVSxLQUFLLElBQUksS0FBSyxLQUFLO0FBQ3pFLFdBQUssZ0JBQWdCLElBQUksUUFBUSxHQUFHLE1BQU0sT0FBTyxpQkFBaUIsS0FBSyxvQkFBb0IsZUFBZSxLQUFLLGlCQUFpQjtBQUMvSCxhQUFLLG1CQUFtQjtBQUN4QixhQUFLLGlCQUFpQjtBQUV0QixjQUFNLGFBQWEsZ0JBQWdCO0FBQ25DLGNBQU0sbUJBQW1CLGFBQWEsR0FBRyxVQUFVLGFBQWE7QUFDaEUsYUFBSyxXQUFXLE1BQU0scUJBQXFCLFVBQVUsaUJBQWlCLGdCQUFnQixHQUFHO0FBQ3pGLGFBQUssS0FBSyxZQUFZLFFBQVEsU0FBUyxFQUFFLFlBQVksa0JBQWtCLFdBQVcsR0FBRyxDQUFDO0FBQ3RGLGlCQUFTLElBQUksU0FBUyxFQUFFLFlBQVksa0JBQWtCLFdBQVcsR0FBRyxDQUFDO0FBQUEsTUFDdEU7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBSVEsd0JBQThCO0FBQ3JDLFNBQUssd0JBQXdCLFFBQVEsTUFBTSxxQkFBNkIsS0FBSyxNQUFNLFNBQVMsQ0FBQyxPQUF1QixRQUFnQixHQUFHLEVBQUUsU0FBTztBQUMvSSxVQUFJLENBQUMsS0FBSyxTQUFTO0FBQ2xCO0FBQUEsTUFDRDtBQUVBLFVBQUksUUFBUSxRQUFRO0FBQ25CLGFBQUssS0FBSyxvQkFBb0IsRUFBRSxJQUFJLG1EQUFtRCxNQUFNLFFBQVEsQ0FBQztBQUFBLE1BQ3ZHLFdBQVcsUUFBUSxTQUFTO0FBQzNCLGFBQUssS0FBSyxvQkFBb0IsRUFBRSxJQUFJLCtDQUErQyxNQUFNLFFBQVEsQ0FBQztBQUFBLE1BQ25HO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsZ0JBQWdCLFFBQTJCO0FBQzFDLFFBQUksZUFBZSxPQUFPLEtBQUs7QUFDOUIsV0FBSyxLQUFLLGdCQUFnQixPQUFPLEdBQUc7QUFBQSxJQUNyQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLEtBQUssZUFBMkMsVUFBd0IsdUJBQU8sT0FBTyxJQUFJLEdBQVM7QUFDbEcsU0FBSyxXQUFXLE1BQU0sNENBQTRDLEtBQUssR0FBRyxHQUFHO0FBRzdFLFFBQUksS0FBSyxpQkFBaUIsR0FBRztBQUM1QixVQUFJLENBQUMsUUFBUSxZQUFZLENBQUMsS0FBSyxrQkFBa0IsaUJBQWlCLEdBQUc7QUFDcEUsYUFBSyxrQkFBa0IsS0FBSztBQUFBLE1BQzdCO0FBQUEsSUFDRDtBQUdBLFFBQUksQ0FBQyxRQUFRLFVBQVU7QUFDdEIsVUFBSSxLQUFLLHVCQUF1QixHQUFHO0FBQ2xDLGFBQUssdUJBQXVCLEVBQUU7QUFBQSxNQUMvQjtBQUVBLFdBQUssS0FBSyxTQUFTLEtBQUssZUFBZSxRQUFRO0FBQUEsSUFDaEQ7QUFJQSxTQUFLLG9CQUFvQixlQUFlLE9BQU87QUFJL0MsUUFBSSxLQUFLLGVBQWUsY0FBaUI7QUFDeEMsV0FBSyxVQUFVO0FBQUEsSUFDaEIsT0FNSztBQUNKLFdBQUssb0JBQW9CO0FBQUEsSUFDMUI7QUFHQSxTQUFLLGFBQWE7QUFHbEIsUUFBSTtBQUNKLFFBQUksUUFBUSxJQUFJLGNBQWMsUUFBUSxJQUFJLHVCQUF1QjtBQUNoRSxrQkFBWSxRQUFRLElBQUk7QUFBQSxJQUN6QixXQUFXLGNBQWMsa0JBQWtCO0FBQzFDLGtCQUFZLFdBQVcsYUFBYSx3Q0FBd0MsS0FBSyx1QkFBdUIsVUFBVSxLQUFLLE1BQU0sT0FBTyxFQUFFLFNBQVMsSUFBSTtBQUFBLElBQ3BKLE9BQU87QUFDTixrQkFBWSxXQUFXLGFBQWEsK0NBQStDLEtBQUssdUJBQXVCLFVBQVUsS0FBSyxNQUFNLE9BQU8sRUFBRSxTQUFTLElBQUk7QUFBQSxJQUMzSjtBQUNBLFNBQUssS0FBSyxRQUFRLFNBQVM7QUFHM0IsVUFBTSxZQUFZLEtBQUs7QUFDdkIsU0FBSyxZQUFZO0FBSWpCLFFBQUksQ0FBQyxLQUFLLHVCQUF1QixXQUFXLENBQUMsS0FBSyx1QkFBdUIsMkJBQTJCO0FBQ25HLFdBQUssVUFBVSxJQUFJLGlCQUFpQixNQUFNO0FBQ3pDLFlBQUksS0FBSyxRQUFRLENBQUMsS0FBSyxLQUFLLFVBQVUsS0FBSyxDQUFDLEtBQUssS0FBSyxZQUFZLEdBQUc7QUFDcEUsZUFBSyxLQUFLLEtBQUs7QUFDZixlQUFLLE1BQU0sRUFBRSxNQUFNLFVBQVUsTUFBTSxDQUFDO0FBQ3BDLGVBQUssS0FBSyxZQUFZLGFBQWE7QUFBQSxRQUNwQztBQUFBLE1BQ0QsR0FBRyxHQUFLLENBQUMsRUFBRSxTQUFTO0FBQUEsSUFDckI7QUFHQSxTQUFLLFlBQVksS0FBSyxFQUFFLFdBQVcsY0FBYyxXQUFXLFFBQVEsUUFBUSxXQUFXLFdBQVcsU0FBUyxZQUFZLFdBQVcsT0FBTyxXQUFXLFFBQVEsQ0FBQztBQUFBLEVBQzlKO0FBQUEsRUFFUSxvQkFBb0IsZUFBMkMsU0FBNkI7QUFVbkcsVUFBTSxrQkFBa0IsS0FBSyxXQUFXLEtBQUssb0JBQW9CO0FBQ2pFLFFBQUksZ0JBQWdCO0FBQ25CLFlBQU0scUNBQXFDLGtCQUFrQixjQUFjLEtBQUssQ0FBQyxrQkFBa0IsY0FBYyxPQUFPO0FBQ3hILFlBQU0saUNBQWlDLEtBQUs7QUFDNUMsVUFBSSxzQ0FBc0MsZ0NBQWdDO0FBQ3pFLHNCQUFjLFVBQVUsRUFBRSxHQUFHLGdCQUFnQixHQUFHLGNBQWMsUUFBUTtBQUFBLE1BQ3ZFO0FBQUEsSUFDRDtBQUtBLFFBQUksUUFBUSxJQUFJLDJCQUEyQixHQUFHO0FBQzdDLGFBQU8sT0FBTyxjQUFjLFNBQVM7QUFBQSxRQUNwQywyQkFBMkIsUUFBUSxJQUFJLDJCQUEyQjtBQUFBLE1BQ25FLENBQUM7QUFBQSxJQUNGO0FBSUEsUUFBSSxRQUFRLHNCQUFzQixRQUFXO0FBQzVDLG9CQUFjLG9CQUFvQixJQUFJLFFBQVE7QUFBQSxJQUMvQztBQUdBLFFBQUk7QUFDSCxvQkFBYyxTQUFTLFNBQVMsS0FBSyxLQUFLLEtBQUssc0JBQXNCLENBQUM7QUFBQSxJQUN2RSxTQUFTLE9BQU87QUFDZixXQUFLLFdBQVcsTUFBTSx1Q0FBdUMsS0FBSyxFQUFFO0FBQUEsSUFDckU7QUFDQSxrQkFBYyxhQUFhLEtBQUs7QUFDaEMsa0JBQWMsWUFBWSxLQUFLLEtBQUssWUFBWTtBQUNoRCxrQkFBYyxjQUFjLEtBQUssaUJBQWlCLGdCQUFnQixjQUFjLFNBQVM7QUFDekYsa0JBQWMsWUFBWSxLQUFLLGFBQWE7QUFDNUMsa0JBQWMsb0JBQW9CLE9BQU8sS0FBSyxvQkFBb0I7QUFDbEUsUUFBSSxjQUFjLHFCQUFxQixjQUFjLGFBQWE7QUFDakUsb0JBQWMsWUFBWSxZQUFZLGNBQWM7QUFBQSxJQUNyRDtBQUdBLFNBQUssd0JBQXdCO0FBQzdCLGtCQUFjLFlBQVksU0FBUztBQUduQyxTQUFLLGdCQUFnQixPQUFPLGFBQWE7QUFBQSxFQUMxQztBQUFBLEVBRUEsTUFBTSxPQUFPLEtBQXVDO0FBR25ELFVBQU0sZ0JBQWdCLE9BQU8sT0FBTyxDQUFDLEdBQUcsS0FBSyxPQUFPO0FBR3BELGtCQUFjLFlBQVksTUFBTSxLQUFLLDhCQUE4QixhQUFhO0FBR2hGLFdBQU8sY0FBYztBQUNyQixXQUFPLGNBQWM7QUFDckIsV0FBTyxjQUFjO0FBQ3JCLFdBQU8sY0FBYztBQUlyQixRQUFJLEtBQUssOEJBQThCLEtBQUs7QUFDM0Msb0JBQWMsVUFBVSxJQUFJO0FBQzVCLG9CQUFjLFVBQVUsSUFBSTtBQUM1QixvQkFBYyx1QkFBdUIsSUFBSTtBQUN6QyxvQkFBYyxvQkFBb0IsSUFBSSxJQUFJLG9CQUFvQjtBQUM5RCxvQkFBYyx3QkFBd0IsSUFBSSxJQUFJLHdCQUF3QjtBQUN0RSxvQkFBYyxnQkFBZ0IsSUFBSSxJQUFJLGdCQUFnQjtBQUFBLElBQ3ZEO0FBRUEsa0JBQWMsdUJBQXVCLFNBQVMsSUFBSSw4QkFBOEI7QUFDaEYsa0JBQWMsbUJBQW1CO0FBQ2pDLGtCQUFjLGVBQWUsS0FBSyxjQUFjLFVBQVU7QUFDMUQsa0JBQWMsYUFBYSxLQUFLLHVCQUF1QjtBQUN2RCxrQkFBYyxXQUFXO0FBQUEsTUFDeEIsS0FBSyxLQUFLLHdCQUF3QjtBQUFBLE1BQ2xDLFNBQVMsS0FBSyxXQUFXLEtBQUssd0JBQXdCO0FBQUEsTUFDdEQsTUFBTSxLQUFLLHdCQUF3QjtBQUFBLElBQ3BDO0FBQ0Esa0JBQWMsV0FBVyxLQUFLLGtCQUFrQixZQUFZO0FBQzVELGtCQUFjLFVBQVUsS0FBSyxrQkFBa0IsaUJBQWlCO0FBR2hFLFNBQUssS0FBSyxlQUFlLEVBQUUsVUFBVSxNQUFNLG1CQUFtQixNQUFNLG9CQUFvQixFQUFFLENBQUM7QUFBQSxFQUM1RjtBQUFBLEVBRUEsTUFBYyw4QkFBOEIsZUFBeUg7QUFHcEssUUFBSSxzQkFBc0IsY0FBYyxTQUFTLEdBQUc7QUFDbkQsWUFBTSxhQUFhLGNBQWMsVUFBVTtBQUMzQyxVQUFJLFdBQVcsV0FBVyxRQUFRLE1BQU07QUFDdkMsY0FBTSxrQkFBa0IsTUFBTSxLQUFLLFlBQVksT0FBTyxVQUFVO0FBQ2hFLFlBQUksQ0FBQyxpQkFBaUI7QUFDckIsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0QsV0FHUyxrQ0FBa0MsY0FBYyxTQUFTLEdBQUc7QUFDcEUsWUFBTSxNQUFNLGNBQWMsVUFBVTtBQUNwQyxVQUFJLElBQUksV0FBVyxRQUFRLE1BQU07QUFDaEMsY0FBTSxlQUFlLE1BQU0sS0FBSyxZQUFZLE9BQU8sR0FBRztBQUN0RCxZQUFJLENBQUMsY0FBYztBQUNsQixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFdBQU8sY0FBYztBQUFBLEVBQ3RCO0FBQUEsRUFFQSx1QkFBcUM7QUFDcEMsUUFBSSxDQUFDLEtBQUssTUFBTTtBQUNmLGFBQU8sbUJBQW1CO0FBQUEsSUFDM0I7QUFHQSxRQUFJLEtBQUssY0FBYztBQUN0QixVQUFJO0FBQ0osVUFBSTtBQUNILGtCQUFVLFNBQVMsT0FBTyxtQkFBbUIsS0FBSyxVQUFVLENBQUM7QUFBQSxNQUM5RCxTQUFTLE9BQU87QUFBQSxNQUloQjtBQUVBLFlBQU0sZUFBZSxtQkFBbUI7QUFFeEMsYUFBTztBQUFBLFFBQ04sTUFBTSxXQUFXO0FBQUEsUUFDakIsU0FBUyxVQUFVLFFBQVEsS0FBSztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxRQU9oQyxPQUFPLEtBQUssWUFBWSxTQUFTLGFBQWE7QUFBQSxRQUM5QyxRQUFRLEtBQUssWUFBWSxVQUFVLGFBQWE7QUFBQSxRQUNoRCxHQUFHLEtBQUssWUFBWSxLQUFLO0FBQUEsUUFDekIsR0FBRyxLQUFLLFlBQVksS0FBSztBQUFBLFFBQ3pCLFdBQVcsS0FBSztBQUFBLE1BQ2pCO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBc0IsdUJBQU8sT0FBTyxJQUFJO0FBQzlDLFFBQUk7QUFHSixRQUFJLENBQUMsZUFBZSxLQUFLLEtBQUssWUFBWSxHQUFHO0FBQzVDLGFBQU8sV0FBVztBQUFBLElBQ25CLE9BQU87QUFDTixhQUFPLFdBQVc7QUFBQSxJQUNuQjtBQUdBLFFBQUksU0FBUyxXQUFXLFdBQVc7QUFDbEMsWUFBTSxPQUFPLFdBQVc7QUFBQSxJQUN6QixPQUFPO0FBQ04sWUFBTSxPQUFPLFdBQVc7QUFBQSxJQUN6QjtBQUdBLFFBQUksU0FBUyxXQUFXLFVBQVUsU0FBUyxXQUFXLFdBQVc7QUFDaEUsVUFBSTtBQUNKLFVBQUksU0FBUyxXQUFXLFFBQVE7QUFDL0IsaUJBQVMsS0FBSyxVQUFVO0FBQUEsTUFDekIsT0FBTztBQUNOLGlCQUFTLEtBQUssS0FBSyxnQkFBZ0I7QUFBQSxNQUNwQztBQUVBLFlBQU0sSUFBSSxPQUFPO0FBQ2pCLFlBQU0sSUFBSSxPQUFPO0FBQ2pCLFlBQU0sUUFBUSxPQUFPO0FBQ3JCLFlBQU0sU0FBUyxPQUFPO0FBQUEsSUFDdkI7QUFFQSxVQUFNLFlBQVksS0FBSztBQUV2QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsbUJBQW1CLE9BQTRFO0FBQ3RHLFNBQUssaUNBQWlDO0FBRXRDLFFBQUksc0JBQXNCO0FBQzFCLFFBQUksT0FBTztBQUdWLFdBQUssa0JBQWtCLE1BQU07QUFHN0IsVUFBSTtBQUNILGNBQU0sV0FBVyxTQUFTLE9BQU8sZUFBZTtBQUNoRCw4QkFBc0IsU0FBUyxTQUFTO0FBRXhDLGdCQUFRLHFCQUFxQixvQkFBb0IsS0FBSyxZQUFZLE9BQU8sUUFBUTtBQUFBLE1BQ2xGLFNBQVMsS0FBSztBQUNiLGFBQUssV0FBVyxLQUFLLDZDQUE2QyxHQUFHO0FBQUEsRUFBSyxJQUFJLEtBQUssRUFBRTtBQUFBLE1BQ3RGO0FBQUEsSUFDRDtBQUVBLFNBQUssZ0NBQWdDO0FBRXJDLFdBQU8sQ0FBQyxTQUFTLG1CQUFtQixHQUFHLG1CQUFtQjtBQUFBLEVBQzNEO0FBQUEsRUFFQSxZQUFnQztBQUMvQixVQUFNLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSyxLQUFLLFlBQVk7QUFDckMsVUFBTSxDQUFDLE9BQU8sTUFBTSxJQUFJLEtBQUssS0FBSyxRQUFRO0FBRTFDLFdBQU8sRUFBRSxHQUFHLEdBQUcsT0FBTyxPQUFPO0FBQUEsRUFDOUI7QUFBQSxFQUVtQixjQUFjLFlBQXFCLGFBQTRCO0FBQ2pGLFVBQU0sY0FBYyxZQUFZLFdBQVc7QUFHM0MsU0FBSyxjQUFjLGFBQWEsMkJBQTJCLDBCQUEwQixrQkFBa0IsSUFBSTtBQUczRyxRQUFJLEtBQUssMEJBQTBCO0FBQ2xDLFdBQUsscUJBQXFCLEtBQUssMEJBQTBCLEtBQUs7QUFBQSxJQUMvRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHVCQUEwQztBQUNqRCxRQUFJLG9CQUFvQixxQkFBcUIsS0FBSyxvQkFBb0I7QUFDdEUsUUFBSSxDQUFDLFdBQVcsVUFBVSxRQUFRLEVBQUUsUUFBUSxpQkFBaUIsSUFBSSxHQUFHO0FBQ25FLDBCQUFvQjtBQUFBLElBQ3JCO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHFCQUFxQixZQUErQixTQUFTLE1BQVk7QUFDaEYsUUFBSSxhQUFhO0FBQ2hCO0FBQUEsSUFDRDtBQUVBLFFBQUksZUFBZSxVQUFVO0FBQzVCLFVBQUksUUFBUTtBQUNYLGFBQUssS0FBSywwQkFBMEIsU0FBUyxpQkFBaUIsNERBQTRELENBQUM7QUFBQSxNQUM1SDtBQUFBLElBQ0Q7QUFFQSxRQUFJLGVBQWUsVUFBVTtBQU01QixpQkFBVyxNQUFNO0FBQ2hCLGFBQUssdUJBQXVCLFVBQVU7QUFBQSxNQUN2QyxDQUFDO0FBQUEsSUFDRixPQUFPO0FBQ04sV0FBSyx1QkFBdUIsVUFBVTtBQUFBLElBQ3ZDO0FBQUEsRUFDRDtBQUFBLEVBRVEsdUJBQXVCLFlBQXFDO0FBQ25FLFVBQU0sZUFBZSxLQUFLO0FBRTFCLFlBQVEsWUFBWTtBQUFBLE1BQ25CLEtBQU07QUFDTCxhQUFLLEtBQUsscUJBQXFCLENBQUMsWUFBWTtBQUM1QyxhQUFLLEtBQUssa0JBQWtCO0FBQzVCO0FBQUEsTUFFRCxLQUFNO0FBQ0wsYUFBSyxLQUFLLHFCQUFxQixJQUFJO0FBQ25DLGFBQUssS0FBSyxrQkFBa0I7QUFDNUI7QUFBQSxNQUVELEtBQU07QUFDTCxhQUFLLEtBQUsscUJBQXFCLEtBQUs7QUFDcEMsYUFBSyxLQUFLLGtCQUFrQjtBQUM1QjtBQUFBLE1BRUQsS0FBTTtBQUNMLGFBQUssS0FBSyxxQkFBcUIsS0FBSztBQUNwQyxhQUFLLEtBQUssa0JBQWtCO0FBQzVCO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGdCQUFnQixXQUFxQztBQUNwRCxTQUFLLGtCQUFrQjtBQUFBLEVBQ3hCO0FBQUEsRUFFUSxlQUFtQztBQUMxQyxRQUFJLE9BQU8sS0FBSyxvQkFBb0IsVUFBVTtBQUM3QyxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBRUEsVUFBTSxpQkFBaUIsS0FBSyxxQkFBcUIsU0FBc0MsUUFBUTtBQUMvRixXQUFPLGdCQUFnQjtBQUFBLEVBQ3hCO0FBQUEsRUFFQSxRQUFjO0FBQ2IsU0FBSyxNQUFNLE1BQU07QUFBQSxFQUNsQjtBQUFBLEVBRUEsY0FBYyxTQUFpQixVQUE2QixNQUF1QjtBQUNsRixRQUFJLEtBQUssU0FBUztBQUNqQixXQUFLLEtBQUssU0FBUyxHQUFHLElBQUk7QUFBQSxJQUMzQixPQUFPO0FBQ04sV0FBSyxNQUFNLEVBQUUsS0FBSyxNQUFNO0FBQ3ZCLFlBQUksQ0FBQyxNQUFNLHlCQUF5QjtBQUNuQyxlQUFLLEtBQUssU0FBUyxHQUFHLElBQUk7QUFBQSxRQUMzQjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxLQUFLLFlBQW9CLE1BQXVCO0FBQy9DLFFBQUksS0FBSyxNQUFNO0FBQ2QsVUFBSSxLQUFLLEtBQUssWUFBWSxLQUFLLEtBQUssS0FBSyxZQUFZLFlBQVksR0FBRztBQUNuRSxhQUFLLFdBQVcsS0FBSyxtQ0FBbUMsT0FBTyxnQ0FBZ0M7QUFDL0Y7QUFBQSxNQUNEO0FBRUEsVUFBSTtBQUNILGFBQUssS0FBSyxZQUFZLEtBQUssU0FBUyxHQUFHLElBQUk7QUFBQSxNQUM1QyxTQUFTLE9BQU87QUFDZixhQUFLLFdBQVcsS0FBSyx5Q0FBeUMsT0FBTyxlQUFlLEtBQUssR0FBRyxLQUFLLGVBQWUsS0FBSyxDQUFDLEVBQUU7QUFBQSxNQUN6SDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxlQUFlLFFBQThDO0FBQzVELFFBQUksQ0FBQyxhQUFhO0FBQ2pCO0FBQUEsSUFDRDtBQUlBLFNBQUssZUFBZSxRQUFRLENBQUMsZUFBZSxVQUFVO0FBQ3JELFlBQU0sV0FBVyxPQUFPLEtBQUs7QUFDN0Isb0JBQWMsV0FBVyxLQUFLLDRCQUE0QixRQUFRO0FBQUEsSUFDbkUsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLGlCQUF1QjtBQUM5QixRQUFJLENBQUMsYUFBYTtBQUNqQjtBQUFBLElBQ0Q7QUFLQSxhQUFTLElBQUksR0FBRyxJQUFJLElBQUksS0FBSztBQUM1QixZQUFNLGdCQUFnQixLQUFLLG9CQUFvQjtBQUMvQyxXQUFLLGVBQWUsS0FBSyxhQUFhO0FBQUEsSUFDdkM7QUFFQSxTQUFLLEtBQUssWUFBWSxJQUFJLFNBQVMsU0FBUyxFQUFFLE9BQU8sS0FBSyxlQUFlLENBQUMsQ0FBQztBQUFBLEVBQzVFO0FBQUEsRUFFUSxvQkFBb0IsUUFBc0MsQ0FBQyxHQUFzQztBQUd4RyxVQUFNLFdBQVcsS0FBSyw0QkFBNEIsS0FBSztBQUd2RCxVQUFNLFVBQVUsSUFBSSxTQUFTLFNBQVMseUJBQXlCO0FBQUEsTUFDOUQ7QUFBQSxNQUNBLE1BQU07QUFBQSxNQUNOLGNBQWM7QUFBQSxNQUNkLFFBQVEsQ0FBQyxrQkFBa0I7QUFDMUIsYUFBSyxjQUFjLG9CQUFvQixrQkFBa0IsTUFBTSxFQUFFLElBQUssUUFBUSxTQUFTLGFBQWEsRUFBdUIsSUFBSSxNQUFNLFdBQVcsQ0FBQztBQUFBLE1BQ2xKO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLDRCQUE0QixRQUFzQyxDQUFDLEdBQXVCO0FBQ2pHLFVBQU0sV0FBK0IsTUFBTSxJQUFJLFVBQVE7QUFDdEQsVUFBSTtBQUNKLFVBQUksS0FBSyxRQUFRLENBQUMsVUFBVSxZQUFZLEtBQUssSUFBSSxLQUFLLEtBQUssTUFBTSxNQUFNLFdBQVcsUUFBUSxNQUFNO0FBQy9GLGVBQU8sU0FBUyxZQUFZLGVBQWUsSUFBSSxPQUFPLEtBQUssS0FBSyxJQUFJLEVBQUUsTUFBTTtBQUM1RSxZQUFJLEtBQUssUUFBUSxHQUFHO0FBQ25CLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFFQSxVQUFJO0FBQ0osVUFBSSxPQUFPLEtBQUssVUFBVSxVQUFVO0FBQ25DLGdCQUFRLEtBQUs7QUFBQSxNQUNkLE9BQU87QUFDTixnQkFBUSxLQUFLLE1BQU07QUFBQSxNQUNwQjtBQUVBLGFBQU87QUFBQSxRQUNOLElBQUksS0FBSztBQUFBLFFBQ1QsT0FBTyxDQUFDLE9BQU8sUUFBUTtBQUFBLFFBQ3ZCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLDhCQUE2QztBQUMxRCxRQUFJLENBQUMsS0FBSyxxQkFBcUIsWUFBWSxHQUFHO0FBQzdDLFlBQU0sUUFBUSxNQUFNLEtBQUssTUFBTSxZQUFZLFVBQVUsMkJBQTJCO0FBR2hGLFVBQUksT0FBTztBQUNWLGNBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxLQUFLLEtBQUs7QUFDaEQsYUFBSyxlQUFlLElBQUksT0FBTyxRQUFRLENBQUM7QUFBQSxNQUN6QztBQUVBLFdBQUsscUJBQXFCLFFBQVEsTUFBTSxLQUFLLDRCQUE0QixDQUFDO0FBQUEsSUFDM0U7QUFBQSxFQUNEO0FBQUEsRUFFUSw2QkFBbUM7QUFDMUMsU0FBSyxrQ0FBa0MsT0FBTztBQUM5QyxTQUFLLHFCQUFxQixPQUFPO0FBRWpDLFFBQUksS0FBSyxlQUFlLE1BQU07QUFDN0IsVUFBSSxhQUFhO0FBQUE7QUFDakIsVUFBSSxVQUFVO0FBRWQsWUFBTSxnQkFBZ0IsTUFBTSxLQUFLLEtBQUssZUFBZSxRQUFRLENBQUMsRUFDNUQsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUU1QixpQkFBVyxDQUFDLE9BQU8sS0FBSyxLQUFLLGVBQWU7QUFDM0MsbUJBQVc7QUFHWCxZQUFJLEtBQUssTUFBTyxRQUFRLE1BQU8sS0FBSywrQkFBK0IsSUFBSSxJQUFJO0FBQzFFLGdCQUFNLFlBQVksSUFBSSxrQkFBa0IsT0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLFlBQVksZUFBZSxDQUFDO0FBQy9GLHVCQUFhLGtCQUFrQixTQUFTO0FBQUEsUUFDekM7QUFDQSxzQkFBYyxJQUFJLEtBQUssS0FBSyxLQUFLO0FBQUE7QUFBQSxNQUNsQztBQUVBLG9CQUFjLGtCQUFrQixPQUFPO0FBQUE7QUFDdkMsb0JBQWM7QUFDZCxXQUFLLFdBQVcsTUFBTSxVQUFVO0FBQUEsSUFDakM7QUFFQSxTQUFLLGVBQWUsTUFBTTtBQUFBLEVBQzNCO0FBQUEsRUFFQSxRQUFRLGFBQTRDO0FBQ25ELFdBQU8sS0FBSyxNQUFNLFlBQVksT0FBTyxZQUFZO0FBQUEsRUFDbEQ7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFVBQU0sUUFBUTtBQUdkLFNBQUssa0JBQWtCLGtCQUFrQixLQUFLLEVBQUU7QUFBQSxFQUNqRDtBQUNEO0FBNWxDYSxhQUFOO0FBQUEsRUE0RUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0EvRlU7QUE4bENiLE1BQU0sMEJBQTBCLE1BQU07QUFBQSxFQUVyQyxZQUFZLFFBQWdCLFVBQWtCLE1BQU0sR0FBRztBQUd0RCxVQUFNLGtCQUFrQixNQUFNO0FBQzlCLFVBQU0sa0JBQWtCO0FBQ3hCLFVBQU0sZ0RBQWdELFFBQVEsa0NBQWtDLEdBQUcsRUFBRTtBQUNyRyxVQUFNLGtCQUFrQjtBQUN4QixTQUFLLE9BQU87QUFDWixTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQ0Q7IiwKICAibmFtZXMiOiBbIlJlYWR5U3RhdGUiLCAicHJvZmlsZSJdCn0K
