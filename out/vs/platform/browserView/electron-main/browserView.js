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
import { screen, WebContentsView, webContents } from "electron";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { browserViewIsolatedWorldId, browserZoomFactors, browserZoomDefaultIndex, isBrowserViewAssociatedResourceNavigation } from "../common/browserView.js";
import { BrowserViewEmulator } from "./browserViewEmulator.js";
import { BrowserViewInspector } from "./browserViewInspector.js";
import { IWindowsMainService } from "../../windows/electron-main/windows.js";
import { LoadReason } from "../../window/electron-main/window.js";
import { IAuxiliaryWindowsMainService } from "../../auxiliaryWindow/electron-main/auxiliaryWindows.js";
import { BrowserViewDebugger } from "./browserViewDebugger.js";
import { ILogService } from "../../log/common/log.js";
import { PermissionCategory } from "../common/browserPermissions.js";
import { SCAN_CODE_STR_TO_EVENT_KEY_CODE } from "../../../base/common/keyCodes.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { logBrowserOpen } from "../common/browserViewTelemetry.js";
var NewPageLocation = /* @__PURE__ */ ((NewPageLocation2) => {
  NewPageLocation2["Foreground"] = "foreground";
  NewPageLocation2["Background"] = "background";
  NewPageLocation2["NewWindow"] = "newWindow";
  return NewPageLocation2;
})(NewPageLocation || {});
let BrowserView = class extends Disposable {
  constructor(id, owner, associatedResource, session, _createChildView, openContextMenu, options, windowsMainService, auxiliaryWindowsMainService, logService, telemetryService) {
    super();
    this.id = id;
    this.owner = owner;
    this.associatedResource = associatedResource;
    this.session = session;
    this._createChildView = _createChildView;
    this.windowsMainService = windowsMainService;
    this.auxiliaryWindowsMainService = auxiliaryWindowsMainService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this._faviconRequestCache = /* @__PURE__ */ new Map();
    this._lastScreenshot = void 0;
    this._lastFavicon = void 0;
    this._lastError = void 0;
    this._lastUserGestureTimestamp = -Infinity;
    this._browserZoomIndex = browserZoomDefaultIndex;
    this._explicitNavigationPending = false;
    /**
     * Active index in the webContents navigation history list.
     * Used to tell whether a navigation appended a new entry or replaced the current one in place.
     */
    this._lastCommittedEntryIndex = -1;
    this._isDisposed = false;
    this._wantsVisibility = false;
    this._hasBeenLaidOut = false;
    this._consoleLogs = [];
    this._onDidNavigate = this._register(new Emitter());
    this.onDidNavigate = this._onDidNavigate.event;
    this._onDidChangeLoadingState = this._register(new Emitter());
    this.onDidChangeLoadingState = this._onDidChangeLoadingState.event;
    this._onDidChangeFocus = this._register(new Emitter());
    this.onDidChangeFocus = this._onDidChangeFocus.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onDidChangeDevToolsState = this._register(new Emitter());
    this.onDidChangeDevToolsState = this._onDidChangeDevToolsState.event;
    this._onDidKeyCommand = this._register(new Emitter());
    this.onDidKeyCommand = this._onDidKeyCommand.event;
    this._onDidChangeTitle = this._register(new Emitter());
    this.onDidChangeTitle = this._onDidChangeTitle.event;
    this._onDidChangeFavicon = this._register(new Emitter());
    this.onDidChangeFavicon = this._onDidChangeFavicon.event;
    this._onDidFindInPage = this._register(new Emitter());
    this.onDidFindInPage = this._onDidFindInPage.event;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._onDidChangeRemoteStatus = this._register(new Emitter());
    this.onDidChangeRemoteStatus = this._onDidChangeRemoteStatus.event;
    this._onDidRequestPermission = this._register(new Emitter());
    this.onDidRequestPermission = this._onDidRequestPermission.event;
    this._onDidChangePermissions = this._register(new Emitter());
    this.onDidChangePermissions = this._onDidChangePermissions.event;
    const webPreferences = {
      ...options?.webPreferences,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // NOTE: When `sandbox` is enabled, `nodeIntegrationInSubFrames` doesn't actually enable node integration or prevent sandboxing.
      //       It allows preload scripts to run in subframes, which is important for our features like keyboard shortcut forwarding.
      nodeIntegrationInSubFrames: true,
      webviewTag: false,
      session: this.session.electronSession,
      focusOnNavigation: false
    };
    this._view = new WebContentsView({
      webPreferences,
      // Passing an `undefined` webContents triggers an error in Electron.
      ...options?.webContents ? { webContents: options.webContents } : {}
    });
    this._view.setBounds({ x: 0, y: 0, width: 1024, height: 768 });
    this._view.setBackgroundColor("#FFFFFF");
    this._ownerWindow = this.windowsMainService.getWindowById(owner.mainWindowId);
    if (!this._ownerWindow) {
      throw new Error(`Window with ID ${owner.mainWindowId} not found`);
    }
    this._register(this._ownerWindow.onDidClose(() => this.dispose()));
    this._register(this._ownerWindow.onWillLoad((e) => {
      if (e.reason === LoadReason.LOAD) {
        this.dispose();
      } else if (e.reason === LoadReason.RELOAD) {
        this.setVisible(false);
      }
    }));
    this._view.setVisible(false);
    this._ownerWindow.win?.contentView.addChildView(this._view);
    this._view.webContents.setWindowOpenHandler((details) => {
      const location = (() => {
        switch (details.disposition) {
          case "background-tab":
            return "background" /* Background */;
          case "foreground-tab":
            return "foreground" /* Foreground */;
          case "new-window":
            return "newWindow" /* NewWindow */;
          default:
            return void 0;
        }
      })();
      if (!location || !this.consumePopupPermission(location)) {
        return { action: "deny" };
      }
      return {
        action: "allow",
        createWindow: (options2) => {
          logBrowserOpen(this.telemetryService, (() => {
            switch (location) {
              case "newWindow" /* NewWindow */:
                return "browserLinkNewWindow";
              case "background" /* Background */:
                return "browserLinkBackground";
              case "foreground" /* Foreground */:
                return "browserLinkForeground";
            }
          })());
          const childView = this._createChildView(details.url, options2, {
            pinned: true,
            background: location === "background" /* Background */,
            parentViewId: id,
            auxiliaryWindow: location === "newWindow" /* NewWindow */ ? { x: options2.x, y: options2.y, width: options2.width, height: options2.height } : void 0
          });
          return childView.webContents;
        },
        // We want the standard browser behavior as opposed to Electron's default of closing the new window when the parent is closed
        outlivesOpener: true
      };
    });
    this._view.webContents.on("context-menu", (_event, params) => {
      openContextMenu(this, params);
    });
    this._view.webContents.on("destroyed", () => {
      this.dispose();
    });
    this.debugger = new BrowserViewDebugger(this, this.logService);
    this.emulator = this._register(new BrowserViewEmulator(this, this.logService));
    this.inspector = this._register(new BrowserViewInspector(this));
    const fireRemoteStatus = () => this._onDidChangeRemoteStatus.fire(this.session.remote.isRemote);
    this._register(this.session.remote.onDidStart(fireRemoteStatus));
    this._register(this.session.remote.onDidStop(fireRemoteStatus));
    this._register(this.session.permissions.onDidRequestPermission((e) => {
      if (e.webContents === this.webContents && !this._isDisposed) {
        e.claim();
        this._onDidRequestPermission.fire(e.request);
      }
    }));
    this._register(this.session.permissions.onDidRequestDevice((e) => {
      if (e.webContents === this.webContents && !this._isDisposed) {
        e.claim();
        this._onDidRequestPermission.fire({
          origin: e.origin,
          category: PermissionCategory.Devices,
          device: {
            requestId: e.requestId,
            deviceType: e.deviceType,
            devices: e.devices
          }
        });
      }
    }));
    this._register(this.session.permissions.onDidChange(() => {
      this._onDidChangePermissions.fire(this.session.permissions.serialize());
    }));
    this.setupEventListeners();
  }
  setupEventListeners() {
    const webContents2 = this._view.webContents;
    webContents2.on("devtools-opened", () => {
      this._onDidChangeDevToolsState.fire({ isDevToolsOpen: true });
    });
    webContents2.on("devtools-closed", () => {
      this._onDidChangeDevToolsState.fire({ isDevToolsOpen: false });
    });
    webContents2.on("page-favicon-updated", async (_event, favicons) => {
      for (const url of favicons) {
        if (!this._faviconRequestCache.has(url)) {
          this._faviconRequestCache.set(url, (async () => {
            if (url.startsWith("data:image/")) {
              return url;
            }
            const response = await webContents2.session.fetch(url, {
              cache: "force-cache"
            });
            if (!response.ok) {
              throw new Error(`Failed to fetch favicon: ${response.status} ${response.statusText}`);
            }
            const type = await response.headers.get("content-type");
            if (!type?.startsWith("image/")) {
              throw new Error(`Favicon is not an image: ${type}`);
            }
            const buffer = await response.arrayBuffer();
            return `data:${type};base64,${Buffer.from(buffer).toString("base64")}`;
          })());
        }
        try {
          this._lastFavicon = await this._faviconRequestCache.get(url);
          this._onDidChangeFavicon.fire({ favicon: this._lastFavicon });
          this._currentHistoryHandle?.update({ favicon: this._lastFavicon });
          return;
        } catch (e) {
        }
      }
      if (this._lastFavicon) {
        this._lastFavicon = void 0;
        this._onDidChangeFavicon.fire({ favicon: this._lastFavicon });
        this._currentHistoryHandle?.update({ favicon: null });
      }
    });
    webContents2.on("will-navigate", (event) => {
      if (this._redirectPinnedNavigation(event.url)) {
        event.preventDefault();
        return;
      }
      const host = URL.parse(event.url)?.host;
      const currHost = URL.parse(this.webContents.getURL())?.host;
      if (host !== currHost) {
        this._lastFavicon = void 0;
      }
    });
    webContents2.on("will-redirect", (event) => {
      if (this._redirectPinnedNavigation(event.url)) {
        event.preventDefault();
      }
    });
    webContents2.on("page-title-updated", (_event, title) => {
      this._onDidChangeTitle.fire({ title });
      this._currentHistoryHandle?.update({ title });
    });
    const fireNavigationEvent = (url) => {
      this._onDidNavigate.fire({
        url,
        title: webContents2.getTitle(),
        canGoBack: webContents2.navigationHistory.canGoBack(),
        canGoForward: webContents2.navigationHistory.canGoForward(),
        certificateError: this.session.trust.getCertificateError(url)
      });
      this._recordNavigation(url);
    };
    const fireLoadingEvent = (loading) => {
      this._onDidChangeLoadingState.fire({ loading, error: this._lastError });
    };
    webContents2.on("did-start-loading", () => {
      this._lastError = void 0;
      if (webContents2.isLoadingMainFrame()) {
        fireLoadingEvent(true);
      }
    });
    webContents2.on("did-stop-loading", () => fireLoadingEvent(false));
    webContents2.on("did-fail-load", (e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame) {
        if (errorCode === -3) {
          fireLoadingEvent(false);
          return;
        }
        this._lastError = {
          url: validatedURL,
          errorCode,
          errorDescription,
          // -200 - -220 are the range of certificate errors in Chromium.
          certificateError: errorCode <= -200 && errorCode >= -220 ? this.session.trust.getCertificateError(validatedURL) : void 0
        };
        fireLoadingEvent(false);
        this._onDidNavigate.fire({
          url: validatedURL,
          title: "",
          canGoBack: webContents2.navigationHistory.canGoBack(),
          canGoForward: webContents2.navigationHistory.canGoForward(),
          certificateError: this.session.trust.getCertificateError(validatedURL)
        });
      }
    });
    webContents2.on("did-finish-load", () => fireLoadingEvent(false));
    this.session.trust.installCertErrorHandler(webContents2);
    webContents2.on("login", (event, _details, authInfo, callback) => {
      if (this.session.remote.proxy) {
        const { username, password } = this.session.remote.proxy.credentials;
        const proxyPort = this.session.remote.proxy.port;
        if (authInfo.isProxy && authInfo.host === "127.0.0.1" && authInfo.port === proxyPort) {
          event.preventDefault();
          callback(username, password);
        }
      }
    });
    webContents2.on("render-process-gone", (_event, details) => {
      this._lastError = {
        url: webContents2.getURL(),
        errorCode: details.exitCode,
        errorDescription: `Render process gone: ${details.reason}`
      };
      fireLoadingEvent(false);
    });
    webContents2.on("did-navigate", (_, url) => fireNavigationEvent(url));
    webContents2.on("did-navigate-in-page", (_, url, isMainFrame) => {
      if (isMainFrame) {
        fireNavigationEvent(url);
      }
    });
    webContents2.on("did-navigate", () => {
      this._consoleLogs.length = 0;
      this._view.webContents.setZoomFactor(browserZoomFactors[this._browserZoomIndex]);
      void this._view.webContents.setVisualZoomLevelLimits(1, 3).catch((error) => {
        this.logService.error("Failed to set visual zoom level limits for browser view webContents.", error);
      });
    });
    webContents2.on("select-bluetooth-device", (event, devices, callback) => {
      event.preventDefault();
      this.session.permissions.beginBluetoothRequest(this.webContents, devices, callback);
    });
    webContents2.on("focus", () => {
      this._onDidChangeFocus.fire({ focused: true });
    });
    webContents2.on("blur", () => {
      this._onDidChangeFocus.fire({ focused: false });
    });
    const onCommandKeydown = (_event, keyEvent) => {
      this._onDidKeyCommand.fire(keyEvent);
    };
    webContents2.ipc.on("vscode:browserView:keydown", onCommandKeydown);
    webContents2.on("devtools-opened", () => {
      webContents2.devToolsWebContents?.ipc.off("vscode:browserView:keydown", onCommandKeydown);
      webContents2.devToolsWebContents?.ipc.on("vscode:browserView:keydown", onCommandKeydown);
    });
    webContents2.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") {
        return;
      }
      const pageIsAvailable = this._view.getVisible() && !webContents2.isCrashed() && !this.debugger.isPaused;
      if (pageIsAvailable) {
        return;
      }
      if (!(input.control || input.alt || input.meta) && input.key.length === 1) {
        return;
      }
      event.preventDefault();
      const eventKeyCode = SCAN_CODE_STR_TO_EVENT_KEY_CODE[input.code] || 0;
      this._onDidKeyCommand.fire({
        key: input.key,
        keyCode: eventKeyCode,
        code: input.code,
        ctrlKey: input.control,
        shiftKey: input.shift,
        altKey: input.alt,
        metaKey: input.meta,
        repeat: input.isAutoRepeat
      });
    });
    webContents2.on("input-event", (_event, input) => {
      switch (input.type) {
        case "rawKeyDown":
        case "keyDown":
        case "mouseDown":
        case "pointerDown":
        case "pointerUp":
        case "touchEnd":
          this._lastUserGestureTimestamp = Date.now();
      }
    });
    webContents2.on("will-prevent-unload", (e) => {
      e.preventDefault();
    });
    webContents2.on("found-in-page", (_event, result) => {
      this._onDidFindInPage.fire({
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
        selectionArea: result.selectionArea,
        finalUpdate: result.finalUpdate
      });
    });
    this._view.webContents.on("console-message", (event) => {
      this._consoleLogs.push(`[${event.level}] ${event.message}`);
      if (this._consoleLogs.length > BrowserView.MAX_CONSOLE_LOG_ENTRIES) {
        this._consoleLogs.splice(0, this._consoleLogs.length - BrowserView.MAX_CONSOLE_LOG_ENTRIES);
      }
    });
  }
  consumePopupPermission(location) {
    switch (location) {
      case "foreground" /* Foreground */:
      case "background" /* Background */:
        return true;
      case "newWindow" /* NewWindow */:
        if (this._lastUserGestureTimestamp > Date.now() - 1e3) {
          this._lastUserGestureTimestamp = -Infinity;
          return true;
        }
        return false;
    }
  }
  /**
   * Record a committed navigation in the session's history.
   */
  _recordNavigation(url) {
    const webContents2 = this._view.webContents;
    const activeIndex = webContents2.navigationHistory.getActiveIndex();
    if (!isTrackableHistoryUrl(url)) {
      this._currentHistoryHandle = void 0;
      this._lastCommittedEntryIndex = activeIndex;
      return;
    }
    const handle = this._currentHistoryHandle;
    if (handle && activeIndex === this._lastCommittedEntryIndex) {
      handle.update({ url, title: webContents2.getTitle() });
      return;
    }
    this._lastCommittedEntryIndex = activeIndex;
    const userInitiated = this._explicitNavigationPending;
    this._explicitNavigationPending = false;
    this._currentHistoryHandle = this.session.history.add(
      url,
      webContents2.getTitle(),
      this._lastFavicon,
      userInitiated
    );
  }
  get webContents() {
    return this._view.webContents;
  }
  /**
   * Get the current state of this browser view
   */
  getState() {
    const webContents2 = this._view.webContents;
    const url = webContents2.getURL();
    return {
      url,
      title: webContents2.getTitle(),
      canGoBack: webContents2.navigationHistory.canGoBack(),
      canGoForward: webContents2.navigationHistory.canGoForward(),
      loading: webContents2.isLoading(),
      focused: webContents2.isFocused(),
      visible: this._view.getVisible(),
      isDevToolsOpen: webContents2.isDevToolsOpened(),
      lastScreenshot: this._lastScreenshot,
      lastFavicon: this._lastFavicon,
      lastError: this._lastError,
      certificateError: this.session.trust.getCertificateError(url),
      storageScope: this.session.storageScope,
      storageKeys: { ...this.session.history.storageKeys, ...this.session.permissions.storageKeys },
      permissions: this.session.permissions.serialize(),
      browserZoomIndex: this._browserZoomIndex,
      elementSelectionState: this.inspector.elementSelectionState,
      isRemoteSession: this.session.remote.isRemote,
      isAreaSelectionActive: this.inspector.isAreaSelectionActive,
      device: this.emulator.device
    };
  }
  /**
   * Toggle developer tools for this browser view.
   */
  toggleDevTools() {
    this._view.webContents.toggleDevTools();
  }
  /**
   * Update the layout bounds of this view
   */
  layout(bounds) {
    if (this._currentWindow?.win?.id !== bounds.windowId) {
      const newWindow = this._windowById(bounds.windowId);
      if (newWindow) {
        this._currentWindow?.win?.contentView.removeChildView(this._view);
        this._currentWindow = newWindow;
        newWindow.win?.contentView.addChildView(this._view);
      }
    }
    this._view.setBorderRadius(Math.round(bounds.cornerRadius * bounds.zoomFactor));
    if (bounds.emulation) {
      this.emulator.applyScreenEmulation(bounds.width, bounds.height, bounds.emulation.scale, bounds.zoomFactor);
    }
    this._view.setBounds({
      x: Math.round(bounds.x * bounds.zoomFactor),
      y: Math.round(bounds.y * bounds.zoomFactor),
      width: Math.round(bounds.width * bounds.zoomFactor),
      height: Math.round(bounds.height * bounds.zoomFactor)
    });
    this._hasBeenLaidOut = true;
    if (this._wantsVisibility && !this._view.getVisible()) {
      this._view.setVisible(true);
    }
  }
  setBrowserZoomIndex(zoomIndex) {
    this._browserZoomIndex = Math.max(0, Math.min(zoomIndex, browserZoomFactors.length - 1));
    const browserZoomFactor = browserZoomFactors[this._browserZoomIndex];
    this._view.webContents.setZoomFactor(browserZoomFactor);
  }
  /**
   * Set the visibility of this view
   */
  setVisible(visible) {
    if (this._wantsVisibility === visible) {
      return;
    }
    if (!visible && this._view.webContents.isFocused()) {
      this._currentWindow?.win?.webContents.focus();
    }
    if (this._hasBeenLaidOut || !visible) {
      this._view.setVisible(visible);
    }
    this._wantsVisibility = visible;
    this._onDidChangeVisibility.fire({ visible });
  }
  /**
   * Get captured console logs.
   */
  getConsoleLogs() {
    return this._consoleLogs.join("\n");
  }
  /**
   * Load a URL in this view
   */
  async loadURL(url) {
    if (this._redirectPinnedNavigation(url)) {
      return;
    }
    this._explicitNavigationPending = true;
    await this.session.remote.whenReady;
    await this._view.webContents.loadURL(url);
  }
  _redirectPinnedNavigation(url) {
    if (!this.associatedResource || isBrowserViewAssociatedResourceNavigation(this.associatedResource, url)) {
      return false;
    }
    logBrowserOpen(this.telemetryService, "browserLinkForeground");
    this._createChildView(url, void 0, {
      pinned: true,
      parentViewId: this.id
    });
    return true;
  }
  /**
   * Get the current URL
   */
  getURL() {
    return this._view.webContents.getURL();
  }
  /**
   * Navigate back in history
   */
  goBack() {
    if (this._view.webContents.navigationHistory.canGoBack()) {
      this._view.webContents.navigationHistory.goBack();
    }
  }
  /**
   * Navigate forward in history
   */
  goForward() {
    if (this._view.webContents.navigationHistory.canGoForward()) {
      this._view.webContents.navigationHistory.goForward();
    }
  }
  /**
   * Reload the current page
   */
  reload(hard) {
    if (hard) {
      this._view.webContents.reloadIgnoringCache();
    } else {
      this._view.webContents.reload();
    }
  }
  /**
   * Check if the view can navigate back
   */
  canGoBack() {
    return this._view.webContents.navigationHistory.canGoBack();
  }
  /**
   * Check if the view can navigate forward
   */
  canGoForward() {
    return this._view.webContents.navigationHistory.canGoForward();
  }
  /**
   * Capture a screenshot of this view
   */
  async captureScreenshot(options) {
    if (!this._view.getVisible()) {
      this._view.setVisible(true);
      this._view.setVisible(false);
    }
    const quality = options?.quality ?? 80;
    const format = options?.format ?? "jpeg";
    if (options?.fullPage && !options.screenRect && !options.pageRect) {
      return this._captureFullPageScreenshot(format, quality);
    }
    if (options?.pageRect) {
      const zoomFactor = this._view.webContents.getZoomFactor();
      const visualViewportScale = await this.inspector.getVisualViewportScale();
      const emulationScale = this.emulator.emulatedScaleFactor;
      options.screenRect = {
        x: options.pageRect.x * visualViewportScale * zoomFactor * emulationScale,
        y: options.pageRect.y * visualViewportScale * zoomFactor * emulationScale,
        width: options.pageRect.width * visualViewportScale * zoomFactor * emulationScale,
        height: options.pageRect.height * visualViewportScale * zoomFactor * emulationScale
      };
    }
    if (options?.awaitNextPaint) {
      await this._waitForNextPaint();
    }
    const image = await (async () => {
      const maxAttempts = 5;
      let lastError;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          return await this._view.webContents.capturePage(options?.screenRect, {
            stayHidden: true
          });
        } catch (error) {
          if (error instanceof Error && error.message === "UnknownVizError") {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 16));
            continue;
          } else {
            throw error;
          }
        }
      }
      throw new Error(`Failed to capture screenshot after ${maxAttempts} attempts`, { cause: lastError });
    })();
    const buffer = format === "png" ? image.toPNG() : image.toJPEG(quality);
    const screenshot = VSBuffer.wrap(buffer);
    if (!options?.screenRect) {
      this._lastScreenshot = screenshot;
    }
    return screenshot;
  }
  // Capture a screenshot of the full scrollable document (beyond the viewport) via CDP.
  async _captureFullPageScreenshot(format, quality) {
    const metrics = await this.debugger.sendCommand("Page.getLayoutMetrics");
    const size = metrics.cssContentSize;
    if (!size) {
      throw new Error("Page.getLayoutMetrics did not return a cssContentSize");
    }
    const zoomFactor = this._view.webContents.getZoomFactor();
    const clipWidth = size.width * zoomFactor;
    const clipHeight = size.height * zoomFactor;
    const hostWindow = this._hostWindow;
    const display = hostWindow ? screen.getDisplayMatching(hostWindow.getBounds()) : screen.getPrimaryDisplay();
    const devicePixelRatio = display.scaleFactor;
    const maxClipDimension = BrowserView.MAX_FULL_PAGE_SCREENSHOT_DIMENSION / Math.max(devicePixelRatio, 1);
    const scale = Math.min(1, maxClipDimension / Math.max(clipWidth, clipHeight));
    try {
      const result = await this.debugger.sendCommand("Page.captureScreenshot", {
        format,
        ...format === "jpeg" ? { quality } : {},
        captureBeyondViewport: true,
        // In theory, `clip` defaults to the full area when not explicitly passed, but in practice it doesn't work when
        // the zoom level isn't 100, because it doesn't multiply the width and height by zoomFactor like we do here.
        // Setting the clip explicitly, we can multiply by zoomFactor and thus work around this Chromium bug.
        // Note that even with this workaround, we often see that the page isn't fully captured and might repeat
        // visual content from the top at the bottom, instead of showing the bottom of the page.
        // - Another sidenote: Currently the scrollbar width isn't accounted for. If a scrollbar exists, we should add the
        //   vertical scrollbar's width and horizontal scrollbar's height to the clip dimensions, since the image is currently
        //   clipped by that amount (this also happens when no clip parameter is provided; ideally it should be fixed upstream
        //   in Chromium).
        clip: { x: 0, y: 0, width: clipWidth, height: clipHeight, scale }
      });
      return VSBuffer.wrap(Buffer.from(result.data, "base64"));
    } finally {
      void this._view.webContents.setVisualZoomLevelLimits(1, 3).catch((error) => {
        this.logService.error("Failed to restore visual zoom level limits after full-page screenshot.", error);
      });
    }
  }
  async _waitForNextPaint() {
    const WAIT_TIMEOUT_MS = 100;
    try {
      await Promise.race([
        this.debugger.sendCommand("Runtime.evaluate", {
          expression: "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))",
          awaitPromise: true
        }),
        new Promise((resolve) => setTimeout(resolve, WAIT_TIMEOUT_MS))
      ]);
    } catch {
    }
  }
  /**
   * Focus this view
   */
  async focus(force) {
    if (!force && !this._currentWindow?.win?.isFocused()) {
      return;
    }
    this._view.webContents.focus();
  }
  /**
   * Find text in the page
   */
  async findInPage(text, options) {
    this._view.webContents.findInPage(text, {
      matchCase: options?.matchCase ?? false,
      forward: options?.forward ?? true,
      // `findNext` is not very clearly named. From Electron docs: `Whether to begin a new text finding session with this request`.
      // It needs to be set to `true` if we want a new search to be performed, such as when the text changes.
      // We name it `recompute` in our internal options to better reflect its purpose / behavior.
      findNext: options?.recompute ?? false
    });
  }
  /**
   * Stop finding in page
   */
  async stopFindInPage(keepSelection) {
    this._view.webContents.stopFindInPage(keepSelection ? "keepSelection" : "clearSelection");
  }
  /**
   * Get the currently selected text in the browser view.
   * Returns immediately with empty string if the page is still loading.
   */
  async getSelectedText() {
    if (this._view.webContents.isLoading()) {
      return "";
    }
    try {
      return await this._view.webContents.executeJavaScriptInIsolatedWorld(browserViewIsolatedWorldId, [{ code: 'window.browserViewAPI?.getSelectedText?.() ?? ""' }]);
    } catch {
      return "";
    }
  }
  /**
   * Clear all storage data for this browser view's session
   */
  async clearStorage() {
    await this.session.clearData();
  }
  /**
   * Answer an in-progress hardware-device chooser. Pass the chosen device id,
   * or `null` to cancel the chooser.
   */
  selectDevice(requestId, deviceId) {
    this.session.permissions.resolveDevice(requestId, deviceId);
  }
  /**
   * Trust a certificate for a given host and reload the page.
   */
  async trustCertificate(host, fingerprint) {
    await this.session.trust.trustCertificate(host, fingerprint);
    this._view.webContents.reload();
  }
  /**
   * Revoke trust for a previously trusted certificate and close the view.
   */
  async untrustCertificate(host, fingerprint) {
    await this.session.trust.untrustCertificate(host, fingerprint);
    this.dispose();
  }
  /**
   * Get the underlying WebContentsView
   */
  getWebContentsView() {
    return this._view;
  }
  /**
   * Get the hosting Electron window for this view, if any.
   * This can be an auxiliary window, depending on where the view is currently hosted.
   */
  getElectronWindow() {
    return this._currentWindow?.win ?? void 0;
  }
  /**
   * The Electron window that currently hosts this view, if any. Before `layout()` is first
   * called this is the owner window; after that it's whichever window the view was last moved
   * to. Returns `undefined` if no host window can be resolved (e.g. during teardown).
   */
  get _hostWindow() {
    return this._currentWindow?.win ?? this._ownerWindow.win ?? void 0;
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this.debugger.dispose();
    const currentWin = this._currentWindow?.win;
    if (currentWin && !currentWin.isDestroyed()) {
      currentWin.contentView.removeChildView(this._view);
    }
    this._onDidClose.fire();
    if (!this._view.webContents.isDestroyed()) {
      this._view.webContents.close({ waitForBeforeUnload: false });
    }
    super.dispose();
  }
  _windowById(windowId) {
    return this._codeWindowById(windowId) ?? this._auxiliaryWindowById(windowId);
  }
  _codeWindowById(windowId) {
    if (typeof windowId !== "number") {
      return void 0;
    }
    return this.windowsMainService.getWindowById(windowId);
  }
  _auxiliaryWindowById(windowId) {
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
BrowserView.MAX_CONSOLE_LOG_ENTRIES = 1e3;
/**
 * Resize a full-page screenshot so its largest dimension never exceeds this many pixels. A very tall
 * or wide page would otherwise request an enormous bitmap, which is costly to allocate/encode and
 * can stress the browser process. We downscale via `scale` (rather than cropping) so the whole page
 * still fits in the result.
 */
BrowserView.MAX_FULL_PAGE_SCREENSHOT_DIMENSION = 2576;
BrowserView = __decorateClass([
  __decorateParam(7, IWindowsMainService),
  __decorateParam(8, IAuxiliaryWindowsMainService),
  __decorateParam(9, ILogService),
  __decorateParam(10, ITelemetryService)
], BrowserView);
function isTrackableHistoryUrl(url) {
  if (!url) {
    return false;
  }
  const colon = url.indexOf(":");
  if (colon <= 0) {
    return false;
  }
  const scheme = url.substring(0, colon).toLowerCase();
  return scheme === "http" || scheme === "https" || scheme === "file";
}
export {
  BrowserView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYnJvd3NlclZpZXdcXGVsZWN0cm9uLW1haW5cXGJyb3dzZXJWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgc2NyZWVuLCBXZWJDb250ZW50c1ZpZXcsIHdlYkNvbnRlbnRzIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElCcm93c2VyVmlld0JvdW5kcywgSUJyb3dzZXJWaWV3RGV2VG9vbHNTdGF0ZUV2ZW50LCBJQnJvd3NlclZpZXdGb2N1c0V2ZW50LCBJQnJvd3NlclZpZXdLZXlEb3duRXZlbnQsIElCcm93c2VyVmlld1N0YXRlLCBJQnJvd3NlclZpZXdOYXZpZ2F0aW9uRXZlbnQsIElCcm93c2VyVmlld0xvYWRpbmdFdmVudCwgSUJyb3dzZXJWaWV3TG9hZEVycm9yLCBJQnJvd3NlclZpZXdUaXRsZUNoYW5nZUV2ZW50LCBJQnJvd3NlclZpZXdGYXZpY29uQ2hhbmdlRXZlbnQsIElCcm93c2VyVmlld0NhcHR1cmVTY3JlZW5zaG90T3B0aW9ucywgSUJyb3dzZXJWaWV3RmluZEluUGFnZU9wdGlvbnMsIElCcm93c2VyVmlld0ZpbmRJblBhZ2VSZXN1bHQsIElCcm93c2VyVmlld1Zpc2liaWxpdHlFdmVudCwgYnJvd3NlclZpZXdJc29sYXRlZFdvcmxkSWQsIGJyb3dzZXJab29tRmFjdG9ycywgYnJvd3Nlclpvb21EZWZhdWx0SW5kZXgsIElCcm93c2VyVmlld093bmVyLCBJQnJvd3NlclZpZXdPcGVuT3B0aW9ucywgSUJyb3dzZXJWaWV3UGVybWlzc2lvblJlcXVlc3RFdmVudCwgaXNCcm93c2VyVmlld0Fzc29jaWF0ZWRSZXNvdXJjZU5hdmlnYXRpb24gfSBmcm9tICcuLi9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdFbXVsYXRvciB9IGZyb20gJy4vYnJvd3NlclZpZXdFbXVsYXRvci5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVmlld0luc3BlY3RvciB9IGZyb20gJy4vYnJvd3NlclZpZXdJbnNwZWN0b3IuanMnO1xuaW1wb3J0IHsgSVdpbmRvd3NNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3dpbmRvd3MvZWxlY3Ryb24tbWFpbi93aW5kb3dzLmpzJztcbmltcG9ydCB7IElDb2RlV2luZG93LCBMb2FkUmVhc29uIH0gZnJvbSAnLi4vLi4vd2luZG93L2VsZWN0cm9uLW1haW4vd2luZG93LmpzJztcbmltcG9ydCB7IElBdXhpbGlhcnlXaW5kb3dzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9hdXhpbGlhcnlXaW5kb3cvZWxlY3Ryb24tbWFpbi9hdXhpbGlhcnlXaW5kb3dzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3RGVidWdnZXIgfSBmcm9tICcuL2Jyb3dzZXJWaWV3RGVidWdnZXIuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyU2Vzc2lvbiB9IGZyb20gJy4vYnJvd3NlclNlc3Npb24uanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJIaXN0b3J5SXRlbUhhbmRsZSB9IGZyb20gJy4uL2NvbW1vbi9icm93c2VySGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJU2VyaWFsaXplZEJyb3dzZXJQZXJtaXNzaW9uc1NuYXBzaG90LCBQZXJtaXNzaW9uQ2F0ZWdvcnkgfSBmcm9tICcuLi9jb21tb24vYnJvd3NlclBlcm1pc3Npb25zLmpzJztcbmltcG9ydCB7IElBdXhpbGlhcnlXaW5kb3cgfSBmcm9tICcuLi8uLi9hdXhpbGlhcnlXaW5kb3cvZWxlY3Ryb24tbWFpbi9hdXhpbGlhcnlXaW5kb3cuanMnO1xuaW1wb3J0IHsgU0NBTl9DT0RFX1NUUl9UT19FVkVOVF9LRVlfQ09ERSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgbG9nQnJvd3Nlck9wZW4gfSBmcm9tICcuLi9jb21tb24vYnJvd3NlclZpZXdUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuZW51bSBOZXdQYWdlTG9jYXRpb24ge1xuXHRGb3JlZ3JvdW5kID0gJ2ZvcmVncm91bmQnLFxuXHRCYWNrZ3JvdW5kID0gJ2JhY2tncm91bmQnLFxuXHROZXdXaW5kb3cgPSAnbmV3V2luZG93J1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBzaW5nbGUgYnJvd3NlciB2aWV3IGluc3RhbmNlIHdpdGggaXRzIFdlYkNvbnRlbnRzVmlldyBhbmQgYWxsIGFzc29jaWF0ZWQgbG9naWMuXG4gKiBUaGlzIGNsYXNzIGVuY2Fwc3VsYXRlcyBhbGwgb3BlcmF0aW9ucyBhbmQgZXZlbnRzIGZvciBhIHNpbmdsZSBicm93c2VyIHZpZXcuXG4gKi9cbmV4cG9ydCBjbGFzcyBCcm93c2VyVmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3OiBXZWJDb250ZW50c1ZpZXc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Zhdmljb25SZXF1ZXN0Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxzdHJpbmc+PigpO1xuXG5cdHByaXZhdGUgX2xhc3RTY3JlZW5zaG90OiBWU0J1ZmZlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdEZhdmljb246IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdEVycm9yOiBJQnJvd3NlclZpZXdMb2FkRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RVc2VyR2VzdHVyZVRpbWVzdGFtcDogbnVtYmVyID0gLUluZmluaXR5O1xuXHRwcml2YXRlIF9icm93c2VyWm9vbUluZGV4OiBudW1iZXIgPSBicm93c2VyWm9vbURlZmF1bHRJbmRleDtcblxuXHRwcml2YXRlIF9jdXJyZW50SGlzdG9yeUhhbmRsZTogSUJyb3dzZXJIaXN0b3J5SXRlbUhhbmRsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZXhwbGljaXROYXZpZ2F0aW9uUGVuZGluZyA9IGZhbHNlO1xuXHQvKipcblx0ICogQWN0aXZlIGluZGV4IGluIHRoZSB3ZWJDb250ZW50cyBuYXZpZ2F0aW9uIGhpc3RvcnkgbGlzdC5cblx0ICogVXNlZCB0byB0ZWxsIHdoZXRoZXIgYSBuYXZpZ2F0aW9uIGFwcGVuZGVkIGEgbmV3IGVudHJ5IG9yIHJlcGxhY2VkIHRoZSBjdXJyZW50IG9uZSBpbiBwbGFjZS5cblx0ICovXG5cdHByaXZhdGUgX2xhc3RDb21taXR0ZWRFbnRyeUluZGV4ID0gLTE7XG5cblx0cmVhZG9ubHkgZGVidWdnZXI6IEJyb3dzZXJWaWV3RGVidWdnZXI7XG5cdHJlYWRvbmx5IGVtdWxhdG9yOiBCcm93c2VyVmlld0VtdWxhdG9yO1xuXHRyZWFkb25seSBpbnNwZWN0b3I6IEJyb3dzZXJWaWV3SW5zcGVjdG9yO1xuXG5cdHByaXZhdGUgX293bmVyV2luZG93OiBJQ29kZVdpbmRvdztcblx0cHJpdmF0ZSBfY3VycmVudFdpbmRvdzogSUNvZGVXaW5kb3cgfCBJQXV4aWxpYXJ5V2luZG93IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfd2FudHNWaXNpYmlsaXR5ID0gZmFsc2U7XG5cdHByaXZhdGUgX2hhc0JlZW5MYWlkT3V0ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0NPTlNPTEVfTE9HX0VOVFJJRVMgPSAxMDAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25zb2xlTG9nczogc3RyaW5nW10gPSBbXTtcblxuXHQvKipcblx0ICogUmVzaXplIGEgZnVsbC1wYWdlIHNjcmVlbnNob3Qgc28gaXRzIGxhcmdlc3QgZGltZW5zaW9uIG5ldmVyIGV4Y2VlZHMgdGhpcyBtYW55IHBpeGVscy4gQSB2ZXJ5IHRhbGxcblx0ICogb3Igd2lkZSBwYWdlIHdvdWxkIG90aGVyd2lzZSByZXF1ZXN0IGFuIGVub3Jtb3VzIGJpdG1hcCwgd2hpY2ggaXMgY29zdGx5IHRvIGFsbG9jYXRlL2VuY29kZSBhbmRcblx0ICogY2FuIHN0cmVzcyB0aGUgYnJvd3NlciBwcm9jZXNzLiBXZSBkb3duc2NhbGUgdmlhIGBzY2FsZWAgKHJhdGhlciB0aGFuIGNyb3BwaW5nKSBzbyB0aGUgd2hvbGUgcGFnZVxuXHQgKiBzdGlsbCBmaXRzIGluIHRoZSByZXN1bHQuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfRlVMTF9QQUdFX1NDUkVFTlNIT1RfRElNRU5TSU9OID0gMjU3NjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE5hdmlnYXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyb3dzZXJWaWV3TmF2aWdhdGlvbkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWROYXZpZ2F0ZTogRXZlbnQ8SUJyb3dzZXJWaWV3TmF2aWdhdGlvbkV2ZW50PiA9IHRoaXMuX29uRGlkTmF2aWdhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMb2FkaW5nU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlclZpZXdMb2FkaW5nRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxvYWRpbmdTdGF0ZTogRXZlbnQ8SUJyb3dzZXJWaWV3TG9hZGluZ0V2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlTG9hZGluZ1N0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRm9jdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlclZpZXdGb2N1c0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGb2N1czogRXZlbnQ8SUJyb3dzZXJWaWV3Rm9jdXNFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZUZvY3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElCcm93c2VyVmlld1Zpc2liaWxpdHlFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQ8SUJyb3dzZXJWaWV3VmlzaWJpbGl0eUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURldlRvb2xzU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlclZpZXdEZXZUb29sc1N0YXRlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURldlRvb2xzU3RhdGU6IEV2ZW50PElCcm93c2VyVmlld0RldlRvb2xzU3RhdGVFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZURldlRvb2xzU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRLZXlDb21tYW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyb3dzZXJWaWV3S2V5RG93bkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRLZXlDb21tYW5kOiBFdmVudDxJQnJvd3NlclZpZXdLZXlEb3duRXZlbnQ+ID0gdGhpcy5fb25EaWRLZXlDb21tYW5kLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVGl0bGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlclZpZXdUaXRsZUNoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUaXRsZTogRXZlbnQ8SUJyb3dzZXJWaWV3VGl0bGVDaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZVRpdGxlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRmF2aWNvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElCcm93c2VyVmlld0Zhdmljb25DaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmF2aWNvbjogRXZlbnQ8SUJyb3dzZXJWaWV3RmF2aWNvbkNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlRmF2aWNvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZpbmRJblBhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlclZpZXdGaW5kSW5QYWdlUmVzdWx0PigpKTtcblx0cmVhZG9ubHkgb25EaWRGaW5kSW5QYWdlOiBFdmVudDxJQnJvd3NlclZpZXdGaW5kSW5QYWdlUmVzdWx0PiA9IHRoaXMuX29uRGlkRmluZEluUGFnZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJlbW90ZVN0YXR1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlbW90ZVN0YXR1czogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZENoYW5nZVJlbW90ZVN0YXR1cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RQZXJtaXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyb3dzZXJWaWV3UGVybWlzc2lvblJlcXVlc3RFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdFBlcm1pc3Npb246IEV2ZW50PElCcm93c2VyVmlld1Blcm1pc3Npb25SZXF1ZXN0RXZlbnQ+ID0gdGhpcy5fb25EaWRSZXF1ZXN0UGVybWlzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVBlcm1pc3Npb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlcmlhbGl6ZWRCcm93c2VyUGVybWlzc2lvbnNTbmFwc2hvdD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGVybWlzc2lvbnM6IEV2ZW50PElTZXJpYWxpemVkQnJvd3NlclBlcm1pc3Npb25zU25hcHNob3Q+ID0gdGhpcy5fb25EaWRDaGFuZ2VQZXJtaXNzaW9ucy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgb3duZXI6IElCcm93c2VyVmlld093bmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBhc3NvY2lhdGVkUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2Vzc2lvbjogQnJvd3NlclNlc3Npb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY3JlYXRlQ2hpbGRWaWV3OiAodXJsOiBzdHJpbmcsIGVsZWN0cm9uT3B0aW9uczogRWxlY3Ryb24uV2ViQ29udGVudHNWaWV3Q29uc3RydWN0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBvcGVuT3B0aW9uczogSUJyb3dzZXJWaWV3T3Blbk9wdGlvbnMpID0+IEJyb3dzZXJWaWV3LFxuXHRcdG9wZW5Db250ZXh0TWVudTogKHZpZXc6IEJyb3dzZXJWaWV3LCBwYXJhbXM6IEVsZWN0cm9uLkNvbnRleHRNZW51UGFyYW1zKSA9PiB2b2lkLFxuXHRcdG9wdGlvbnM6IEVsZWN0cm9uLldlYkNvbnRlbnRzVmlld0NvbnN0cnVjdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRASVdpbmRvd3NNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdpbmRvd3NNYWluU2VydmljZTogSVdpbmRvd3NNYWluU2VydmljZSxcblx0XHRASUF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZTogSUF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHdlYlByZWZlcmVuY2VzOiBFbGVjdHJvbi5XZWJQcmVmZXJlbmNlcyA9IHtcblx0XHRcdC4uLm9wdGlvbnM/LndlYlByZWZlcmVuY2VzLFxuXG5cdFx0XHRub2RlSW50ZWdyYXRpb246IGZhbHNlLFxuXHRcdFx0Y29udGV4dElzb2xhdGlvbjogdHJ1ZSxcblx0XHRcdHNhbmRib3g6IHRydWUsXG5cblx0XHRcdC8vIE5PVEU6IFdoZW4gYHNhbmRib3hgIGlzIGVuYWJsZWQsIGBub2RlSW50ZWdyYXRpb25JblN1YkZyYW1lc2AgZG9lc24ndCBhY3R1YWxseSBlbmFibGUgbm9kZSBpbnRlZ3JhdGlvbiBvciBwcmV2ZW50IHNhbmRib3hpbmcuXG5cdFx0XHQvLyAgICAgICBJdCBhbGxvd3MgcHJlbG9hZCBzY3JpcHRzIHRvIHJ1biBpbiBzdWJmcmFtZXMsIHdoaWNoIGlzIGltcG9ydGFudCBmb3Igb3VyIGZlYXR1cmVzIGxpa2Uga2V5Ym9hcmQgc2hvcnRjdXQgZm9yd2FyZGluZy5cblx0XHRcdG5vZGVJbnRlZ3JhdGlvbkluU3ViRnJhbWVzOiB0cnVlLFxuXG5cdFx0XHR3ZWJ2aWV3VGFnOiBmYWxzZSxcblx0XHRcdHNlc3Npb246IHRoaXMuc2Vzc2lvbi5lbGVjdHJvblNlc3Npb24sXG5cblx0XHRcdGZvY3VzT25OYXZpZ2F0aW9uOiBmYWxzZVxuXHRcdH07XG5cblx0XHR0aGlzLl92aWV3ID0gbmV3IFdlYkNvbnRlbnRzVmlldyh7XG5cdFx0XHR3ZWJQcmVmZXJlbmNlcyxcblx0XHRcdC8vIFBhc3NpbmcgYW4gYHVuZGVmaW5lZGAgd2ViQ29udGVudHMgdHJpZ2dlcnMgYW4gZXJyb3IgaW4gRWxlY3Ryb24uXG5cdFx0XHQuLi4ob3B0aW9ucz8ud2ViQ29udGVudHMgPyB7IHdlYkNvbnRlbnRzOiBvcHRpb25zLndlYkNvbnRlbnRzIH0gOiB7fSlcblx0XHR9KTtcblxuXHRcdC8vIFVzZSBhIGRlZmF1bHQgc2l6ZSBvZiAxMDI0eDc2OC5cblx0XHQvLyBJbXBvcnRhbnQ6IFRoZSBib3VuZHMgaGVyZSBtdXN0IGJlIG9uLXNjcmVlbiwgb3RoZXJ3aXNlIHNvbWUgT1NlcyAobGlrZSBtYWNPUykgbWF5IG5vdCBhY3R1YWxseSBzdGFydCByZW5kZXJpbmcuXG5cdFx0Ly8gICAgICAgICAgICBXZSBqdXN0IGhhdmUgdG8gYmUgY2FyZWZ1bCB0byBub3Qgc2hvdyB0aGUgdmlldyB1bnRpbCBhIGxheW91dCBoYXMgaGFwcGVuZWQgaW4gdGhlIGNvcnJlY3QgbG9jYXRpb24uXG5cdFx0dGhpcy5fdmlldy5zZXRCb3VuZHMoeyB4OiAwLCB5OiAwLCB3aWR0aDogMTAyNCwgaGVpZ2h0OiA3NjggfSk7XG5cdFx0dGhpcy5fdmlldy5zZXRCYWNrZ3JvdW5kQ29sb3IoJyNGRkZGRkYnKTtcblxuXHRcdHRoaXMuX293bmVyV2luZG93ID0gdGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93QnlJZChvd25lci5tYWluV2luZG93SWQpITtcblx0XHRpZiAoIXRoaXMuX293bmVyV2luZG93KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFdpbmRvdyB3aXRoIElEICR7b3duZXIubWFpbldpbmRvd0lkfSBub3QgZm91bmRgKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fb3duZXJXaW5kb3cub25EaWRDbG9zZSgoKSA9PiB0aGlzLmRpc3Bvc2UoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX293bmVyV2luZG93Lm9uV2lsbExvYWQoKGUpID0+IHtcblx0XHRcdGlmIChlLnJlYXNvbiA9PT0gTG9hZFJlYXNvbi5MT0FEKSB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpOyAvLyBEaXNwb3NlIHdoZW4gc3dpdGNoaW5nIHdvcmtzcGFjZXMuXG5cdFx0XHR9IGVsc2UgaWYgKGUucmVhc29uID09PSBMb2FkUmVhc29uLlJFTE9BRCkge1xuXHRcdFx0XHR0aGlzLnNldFZpc2libGUoZmFsc2UpOyAvLyBIaWRlIHdoZW4gcmVsb2FkaW5nLlxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3ZpZXcuc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0dGhpcy5fb3duZXJXaW5kb3cud2luPy5jb250ZW50Vmlldy5hZGRDaGlsZFZpZXcodGhpcy5fdmlldyk7XG5cblx0XHR0aGlzLl92aWV3LndlYkNvbnRlbnRzLnNldFdpbmRvd09wZW5IYW5kbGVyKChkZXRhaWxzKSA9PiB7XG5cdFx0XHRjb25zdCBsb2NhdGlvbiA9ICgoKSA9PiB7XG5cdFx0XHRcdHN3aXRjaCAoZGV0YWlscy5kaXNwb3NpdGlvbikge1xuXHRcdFx0XHRcdGNhc2UgJ2JhY2tncm91bmQtdGFiJzogcmV0dXJuIE5ld1BhZ2VMb2NhdGlvbi5CYWNrZ3JvdW5kO1xuXHRcdFx0XHRcdGNhc2UgJ2ZvcmVncm91bmQtdGFiJzogcmV0dXJuIE5ld1BhZ2VMb2NhdGlvbi5Gb3JlZ3JvdW5kO1xuXHRcdFx0XHRcdGNhc2UgJ25ldy13aW5kb3cnOiByZXR1cm4gTmV3UGFnZUxvY2F0aW9uLk5ld1dpbmRvdztcblx0XHRcdFx0XHRkZWZhdWx0OiByZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSgpO1xuXG5cdFx0XHRpZiAoIWxvY2F0aW9uIHx8ICF0aGlzLmNvbnN1bWVQb3B1cFBlcm1pc3Npb24obG9jYXRpb24pKSB7XG5cdFx0XHRcdC8vIEV2ZW50dWFsbHkgd2UgbWF5IHdhbnQgdG8gc3VyZmFjZSB0aGlzLiBGb3Igbm93LCBqdXN0IHNpbGVudGx5IGJsb2NrIGl0LlxuXHRcdFx0XHRyZXR1cm4geyBhY3Rpb246ICdkZW55JyB9O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRhY3Rpb246ICdhbGxvdycsXG5cdFx0XHRcdGNyZWF0ZVdpbmRvdzogKG9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRsb2dCcm93c2VyT3Blbih0aGlzLnRlbGVtZXRyeVNlcnZpY2UsICgoKSA9PiB7XG5cdFx0XHRcdFx0XHRzd2l0Y2ggKGxvY2F0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGNhc2UgTmV3UGFnZUxvY2F0aW9uLk5ld1dpbmRvdzogcmV0dXJuICdicm93c2VyTGlua05ld1dpbmRvdyc7XG5cdFx0XHRcdFx0XHRcdGNhc2UgTmV3UGFnZUxvY2F0aW9uLkJhY2tncm91bmQ6IHJldHVybiAnYnJvd3NlckxpbmtCYWNrZ3JvdW5kJztcblx0XHRcdFx0XHRcdFx0Y2FzZSBOZXdQYWdlTG9jYXRpb24uRm9yZWdyb3VuZDogcmV0dXJuICdicm93c2VyTGlua0ZvcmVncm91bmQnO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKCkpO1xuXG5cdFx0XHRcdFx0Y29uc3QgY2hpbGRWaWV3ID0gdGhpcy5fY3JlYXRlQ2hpbGRWaWV3KGRldGFpbHMudXJsLCBvcHRpb25zLCB7XG5cdFx0XHRcdFx0XHRwaW5uZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kOiBsb2NhdGlvbiA9PT0gTmV3UGFnZUxvY2F0aW9uLkJhY2tncm91bmQsXG5cdFx0XHRcdFx0XHRwYXJlbnRWaWV3SWQ6IGlkLFxuXHRcdFx0XHRcdFx0YXV4aWxpYXJ5V2luZG93OiBsb2NhdGlvbiA9PT0gTmV3UGFnZUxvY2F0aW9uLk5ld1dpbmRvd1xuXHRcdFx0XHRcdFx0XHQ/IHsgeDogb3B0aW9ucy54LCB5OiBvcHRpb25zLnksIHdpZHRoOiBvcHRpb25zLndpZHRoLCBoZWlnaHQ6IG9wdGlvbnMuaGVpZ2h0IH1cblx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHQvLyBSZXR1cm4gdGhlIHdlYkNvbnRlbnRzIHNvIEVsZWN0cm9uIGNhbiBjb21wbGV0ZSB0aGUgd2luZG93Lm9wZW4oKSBjYWxsXG5cdFx0XHRcdFx0cmV0dXJuIGNoaWxkVmlldy53ZWJDb250ZW50cztcblx0XHRcdFx0fSxcblxuXHRcdFx0XHQvLyBXZSB3YW50IHRoZSBzdGFuZGFyZCBicm93c2VyIGJlaGF2aW9yIGFzIG9wcG9zZWQgdG8gRWxlY3Ryb24ncyBkZWZhdWx0IG9mIGNsb3NpbmcgdGhlIG5ldyB3aW5kb3cgd2hlbiB0aGUgcGFyZW50IGlzIGNsb3NlZFxuXHRcdFx0XHRvdXRsaXZlc09wZW5lcjogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3ZpZXcud2ViQ29udGVudHMub24oJ2NvbnRleHQtbWVudScsIChfZXZlbnQsIHBhcmFtcykgPT4ge1xuXHRcdFx0b3BlbkNvbnRleHRNZW51KHRoaXMsIHBhcmFtcyk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl92aWV3LndlYkNvbnRlbnRzLm9uKCdkZXN0cm95ZWQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuZGVidWdnZXIgPSBuZXcgQnJvd3NlclZpZXdEZWJ1Z2dlcih0aGlzLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuZW11bGF0b3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgQnJvd3NlclZpZXdFbXVsYXRvcih0aGlzLCB0aGlzLmxvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLmluc3BlY3RvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCcm93c2VyVmlld0luc3BlY3Rvcih0aGlzKSk7XG5cblx0XHRjb25zdCBmaXJlUmVtb3RlU3RhdHVzID0gKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VSZW1vdGVTdGF0dXMuZmlyZSh0aGlzLnNlc3Npb24ucmVtb3RlLmlzUmVtb3RlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb24ucmVtb3RlLm9uRGlkU3RhcnQoZmlyZVJlbW90ZVN0YXR1cykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2Vzc2lvbi5yZW1vdGUub25EaWRTdG9wKGZpcmVSZW1vdGVTdGF0dXMpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2Vzc2lvbi5wZXJtaXNzaW9ucy5vbkRpZFJlcXVlc3RQZXJtaXNzaW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUud2ViQ29udGVudHMgPT09IHRoaXMud2ViQ29udGVudHMgJiYgIXRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdFx0ZS5jbGFpbSgpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RQZXJtaXNzaW9uLmZpcmUoZS5yZXF1ZXN0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uLnBlcm1pc3Npb25zLm9uRGlkUmVxdWVzdERldmljZShlID0+IHtcblx0XHRcdGlmIChlLndlYkNvbnRlbnRzID09PSB0aGlzLndlYkNvbnRlbnRzICYmICF0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdGUuY2xhaW0oKTtcblx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0UGVybWlzc2lvbi5maXJlKHtcblx0XHRcdFx0XHRvcmlnaW46IGUub3JpZ2luLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQZXJtaXNzaW9uQ2F0ZWdvcnkuRGV2aWNlcyxcblx0XHRcdFx0XHRkZXZpY2U6IHtcblx0XHRcdFx0XHRcdHJlcXVlc3RJZDogZS5yZXF1ZXN0SWQsXG5cdFx0XHRcdFx0XHRkZXZpY2VUeXBlOiBlLmRldmljZVR5cGUsXG5cdFx0XHRcdFx0XHRkZXZpY2VzOiBlLmRldmljZXMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2Vzc2lvbi5wZXJtaXNzaW9ucy5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVBlcm1pc3Npb25zLmZpcmUodGhpcy5zZXNzaW9uLnBlcm1pc3Npb25zLnNlcmlhbGl6ZSgpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnNldHVwRXZlbnRMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0dXBFdmVudExpc3RlbmVycygpOiB2b2lkIHtcblx0XHRjb25zdCB3ZWJDb250ZW50cyA9IHRoaXMuX3ZpZXcud2ViQ29udGVudHM7XG5cblx0XHQvLyBEZXZUb29scyBzdGF0ZSBldmVudHNcblx0XHR3ZWJDb250ZW50cy5vbignZGV2dG9vbHMtb3BlbmVkJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZXZUb29sc1N0YXRlLmZpcmUoeyBpc0RldlRvb2xzT3BlbjogdHJ1ZSB9KTtcblx0XHR9KTtcblxuXHRcdHdlYkNvbnRlbnRzLm9uKCdkZXZ0b29scy1jbG9zZWQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURldlRvb2xzU3RhdGUuZmlyZSh7IGlzRGV2VG9vbHNPcGVuOiBmYWxzZSB9KTtcblx0XHR9KTtcblxuXHRcdC8vIEZhdmljb24gZXZlbnRzXG5cdFx0d2ViQ29udGVudHMub24oJ3BhZ2UtZmF2aWNvbi11cGRhdGVkJywgYXN5bmMgKF9ldmVudCwgZmF2aWNvbnMpID0+IHtcblx0XHRcdC8vIHRyeSBlYWNoIHVybCBpbiBvcmRlciB1bnRpbCBvbmUgd29ya3Ncblx0XHRcdGZvciAoY29uc3QgdXJsIG9mIGZhdmljb25zKSB7XG5cdFx0XHRcdGlmICghdGhpcy5fZmF2aWNvblJlcXVlc3RDYWNoZS5oYXModXJsKSkge1xuXHRcdFx0XHRcdHRoaXMuX2Zhdmljb25SZXF1ZXN0Q2FjaGUuc2V0KHVybCwgKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh1cmwuc3RhcnRzV2l0aCgnZGF0YTppbWFnZS8nKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdXJsO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB3ZWJDb250ZW50cy5zZXNzaW9uLmZldGNoKHVybCwge1xuXHRcdFx0XHRcdFx0XHRjYWNoZTogJ2ZvcmNlLWNhY2hlJ1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGZhdmljb246ICR7cmVzcG9uc2Uuc3RhdHVzfSAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCB0eXBlID0gYXdhaXQgcmVzcG9uc2UuaGVhZGVycy5nZXQoJ2NvbnRlbnQtdHlwZScpO1xuXHRcdFx0XHRcdFx0aWYgKCF0eXBlPy5zdGFydHNXaXRoKCdpbWFnZS8nKSkge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhdmljb24gaXMgbm90IGFuIGltYWdlOiAke3R5cGV9YCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCByZXNwb25zZS5hcnJheUJ1ZmZlcigpO1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gYGRhdGE6JHt0eXBlfTtiYXNlNjQsJHtCdWZmZXIuZnJvbShidWZmZXIpLnRvU3RyaW5nKCdiYXNlNjQnKX1gO1xuXHRcdFx0XHRcdH0pKCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR0aGlzLl9sYXN0RmF2aWNvbiA9IGF3YWl0IHRoaXMuX2Zhdmljb25SZXF1ZXN0Q2FjaGUuZ2V0KHVybCkhO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRmF2aWNvbi5maXJlKHsgZmF2aWNvbjogdGhpcy5fbGFzdEZhdmljb24gfSk7XG5cdFx0XHRcdFx0dGhpcy5fY3VycmVudEhpc3RvcnlIYW5kbGU/LnVwZGF0ZSh7IGZhdmljb246IHRoaXMuX2xhc3RGYXZpY29uIH0pO1xuXHRcdFx0XHRcdC8vIE9uIHN1Y2Nlc3MsIHN0b3Agc2VhcmNoaW5nXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Ly8gT24gZmFpbHVyZSwganVzdCB0cnkgdGhlIG5leHQgb25lXG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgd2Ugc2VhcmNoZWQgYWxsIGZhdmljb25zIGFuZCBub25lIHdvcmtlZCwgY2xlYXIgdGhlIGZhdmljb25cblx0XHRcdGlmICh0aGlzLl9sYXN0RmF2aWNvbikge1xuXHRcdFx0XHR0aGlzLl9sYXN0RmF2aWNvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VGYXZpY29uLmZpcmUoeyBmYXZpY29uOiB0aGlzLl9sYXN0RmF2aWNvbiB9KTtcblx0XHRcdFx0dGhpcy5fY3VycmVudEhpc3RvcnlIYW5kbGU/LnVwZGF0ZSh7IGZhdmljb246IG51bGwgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d2ViQ29udGVudHMub24oJ3dpbGwtbmF2aWdhdGUnLCAoZXZlbnQpID0+IHtcblx0XHRcdGlmICh0aGlzLl9yZWRpcmVjdFBpbm5lZE5hdmlnYXRpb24oZXZlbnQudXJsKSkge1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBVUkwucGFyc2UgKHZzIGBuZXcgVVJMYCkgdG9sZXJhdGVzIGFib3V0Oi9ibG9iOi9lbXB0eSBzdHJpbmdzIHdpdGhvdXQgdGhyb3dpbmcuXG5cdFx0XHRjb25zdCBob3N0ID0gVVJMLnBhcnNlKGV2ZW50LnVybCk/Lmhvc3Q7XG5cdFx0XHRjb25zdCBjdXJySG9zdCA9IFVSTC5wYXJzZSh0aGlzLndlYkNvbnRlbnRzLmdldFVSTCgpKT8uaG9zdDtcblx0XHRcdGlmIChob3N0ICE9PSBjdXJySG9zdCkge1xuXHRcdFx0XHR0aGlzLl9sYXN0RmF2aWNvbiA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR3ZWJDb250ZW50cy5vbignd2lsbC1yZWRpcmVjdCcsIGV2ZW50ID0+IHtcblx0XHRcdGlmICh0aGlzLl9yZWRpcmVjdFBpbm5lZE5hdmlnYXRpb24oZXZlbnQudXJsKSkge1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gVGl0bGUgZXZlbnRzXG5cdFx0d2ViQ29udGVudHMub24oJ3BhZ2UtdGl0bGUtdXBkYXRlZCcsIChfZXZlbnQsIHRpdGxlKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRpdGxlLmZpcmUoeyB0aXRsZSB9KTtcblx0XHRcdHRoaXMuX2N1cnJlbnRIaXN0b3J5SGFuZGxlPy51cGRhdGUoeyB0aXRsZSB9KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGZpcmVOYXZpZ2F0aW9uRXZlbnQgPSAodXJsOiBzdHJpbmcpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkTmF2aWdhdGUuZmlyZSh7XG5cdFx0XHRcdHVybCxcblx0XHRcdFx0dGl0bGU6IHdlYkNvbnRlbnRzLmdldFRpdGxlKCksXG5cdFx0XHRcdGNhbkdvQmFjazogd2ViQ29udGVudHMubmF2aWdhdGlvbkhpc3RvcnkuY2FuR29CYWNrKCksXG5cdFx0XHRcdGNhbkdvRm9yd2FyZDogd2ViQ29udGVudHMubmF2aWdhdGlvbkhpc3RvcnkuY2FuR29Gb3J3YXJkKCksXG5cdFx0XHRcdGNlcnRpZmljYXRlRXJyb3I6IHRoaXMuc2Vzc2lvbi50cnVzdC5nZXRDZXJ0aWZpY2F0ZUVycm9yKHVybClcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcmVjb3JkTmF2aWdhdGlvbih1cmwpO1xuXHRcdH07XG5cblx0XHRjb25zdCBmaXJlTG9hZGluZ0V2ZW50ID0gKGxvYWRpbmc6IGJvb2xlYW4pID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTG9hZGluZ1N0YXRlLmZpcmUoeyBsb2FkaW5nLCBlcnJvcjogdGhpcy5fbGFzdEVycm9yIH0pO1xuXHRcdH07XG5cblx0XHQvLyBMb2FkaW5nIHN0YXRlIGV2ZW50c1xuXHRcdHdlYkNvbnRlbnRzLm9uKCdkaWQtc3RhcnQtbG9hZGluZycsICgpID0+IHtcblx0XHRcdHRoaXMuX2xhc3RFcnJvciA9IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gRG9uJ3QgZmlyZSBsb2FkaW5nIGV2ZW50cyBmb3IgZS5nLiBzYW1lLWRvY3VtZW50IG5hdmlnYXRpb25zXG5cdFx0XHRpZiAod2ViQ29udGVudHMuaXNMb2FkaW5nTWFpbkZyYW1lKCkpIHtcblx0XHRcdFx0ZmlyZUxvYWRpbmdFdmVudCh0cnVlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR3ZWJDb250ZW50cy5vbignZGlkLXN0b3AtbG9hZGluZycsICgpID0+IGZpcmVMb2FkaW5nRXZlbnQoZmFsc2UpKTtcblx0XHR3ZWJDb250ZW50cy5vbignZGlkLWZhaWwtbG9hZCcsIChlLCBlcnJvckNvZGUsIGVycm9yRGVzY3JpcHRpb24sIHZhbGlkYXRlZFVSTCwgaXNNYWluRnJhbWUpID0+IHtcblx0XHRcdGlmIChpc01haW5GcmFtZSkge1xuXHRcdFx0XHQvLyBJZ25vcmUgRVJSX0FCT1JURUQgKC0zKSB3aGljaCBpcyB0aGUgZXhwZWN0ZWQgZXJyb3Igd2hlbiB1c2VyIHN0b3BzIGEgcGFnZSBsb2FkLlxuXHRcdFx0XHRpZiAoZXJyb3JDb2RlID09PSAtMykge1xuXHRcdFx0XHRcdGZpcmVMb2FkaW5nRXZlbnQoZmFsc2UpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2xhc3RFcnJvciA9IHtcblx0XHRcdFx0XHR1cmw6IHZhbGlkYXRlZFVSTCxcblx0XHRcdFx0XHRlcnJvckNvZGUsXG5cdFx0XHRcdFx0ZXJyb3JEZXNjcmlwdGlvbixcblx0XHRcdFx0XHQvLyAtMjAwIC0gLTIyMCBhcmUgdGhlIHJhbmdlIG9mIGNlcnRpZmljYXRlIGVycm9ycyBpbiBDaHJvbWl1bS5cblx0XHRcdFx0XHRjZXJ0aWZpY2F0ZUVycm9yOiBlcnJvckNvZGUgPD0gLTIwMCAmJiBlcnJvckNvZGUgPj0gLTIyMCA/IHRoaXMuc2Vzc2lvbi50cnVzdC5nZXRDZXJ0aWZpY2F0ZUVycm9yKHZhbGlkYXRlZFVSTCkgOiB1bmRlZmluZWRcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRmaXJlTG9hZGluZ0V2ZW50KGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fb25EaWROYXZpZ2F0ZS5maXJlKHtcblx0XHRcdFx0XHR1cmw6IHZhbGlkYXRlZFVSTCxcblx0XHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdFx0Y2FuR29CYWNrOiB3ZWJDb250ZW50cy5uYXZpZ2F0aW9uSGlzdG9yeS5jYW5Hb0JhY2soKSxcblx0XHRcdFx0XHRjYW5Hb0ZvcndhcmQ6IHdlYkNvbnRlbnRzLm5hdmlnYXRpb25IaXN0b3J5LmNhbkdvRm9yd2FyZCgpLFxuXHRcdFx0XHRcdGNlcnRpZmljYXRlRXJyb3I6IHRoaXMuc2Vzc2lvbi50cnVzdC5nZXRDZXJ0aWZpY2F0ZUVycm9yKHZhbGlkYXRlZFVSTClcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d2ViQ29udGVudHMub24oJ2RpZC1maW5pc2gtbG9hZCcsICgpID0+IGZpcmVMb2FkaW5nRXZlbnQoZmFsc2UpKTtcblxuXHRcdHRoaXMuc2Vzc2lvbi50cnVzdC5pbnN0YWxsQ2VydEVycm9ySGFuZGxlcih3ZWJDb250ZW50cyk7XG5cblx0XHR3ZWJDb250ZW50cy5vbignbG9naW4nLCAoZXZlbnQsIF9kZXRhaWxzLCBhdXRoSW5mbywgY2FsbGJhY2spID0+IHtcblx0XHRcdC8vIEF1dG9tYXRpY2FsbHkgc3VwcGx5IHByb3h5IGF1dGggY3JlZGVudGlhbHMgZm9yIHRoZSB0dW5uZWwgcHJveHkuXG5cdFx0XHRpZiAodGhpcy5zZXNzaW9uLnJlbW90ZS5wcm94eSkge1xuXHRcdFx0XHRjb25zdCB7IHVzZXJuYW1lLCBwYXNzd29yZCB9ID0gdGhpcy5zZXNzaW9uLnJlbW90ZS5wcm94eS5jcmVkZW50aWFscztcblx0XHRcdFx0Y29uc3QgcHJveHlQb3J0ID0gdGhpcy5zZXNzaW9uLnJlbW90ZS5wcm94eS5wb3J0O1xuXHRcdFx0XHRpZiAoYXV0aEluZm8uaXNQcm94eSAmJiBhdXRoSW5mby5ob3N0ID09PSAnMTI3LjAuMC4xJyAmJiBhdXRoSW5mby5wb3J0ID09PSBwcm94eVBvcnQpIHtcblx0XHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGNhbGxiYWNrKHVzZXJuYW1lLCBwYXNzd29yZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHdlYkNvbnRlbnRzLm9uKCdyZW5kZXItcHJvY2Vzcy1nb25lJywgKF9ldmVudCwgZGV0YWlscykgPT4ge1xuXHRcdFx0dGhpcy5fbGFzdEVycm9yID0ge1xuXHRcdFx0XHR1cmw6IHdlYkNvbnRlbnRzLmdldFVSTCgpLFxuXHRcdFx0XHRlcnJvckNvZGU6IGRldGFpbHMuZXhpdENvZGUsXG5cdFx0XHRcdGVycm9yRGVzY3JpcHRpb246IGBSZW5kZXIgcHJvY2VzcyBnb25lOiAke2RldGFpbHMucmVhc29ufWBcblx0XHRcdH07XG5cblx0XHRcdGZpcmVMb2FkaW5nRXZlbnQoZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gTmF2aWdhdGlvbiBldmVudHMgKHdoZW4gVVJMIGFjdHVhbGx5IGNoYW5nZXMpXG5cdFx0d2ViQ29udGVudHMub24oJ2RpZC1uYXZpZ2F0ZScsIChfLCB1cmwpID0+IGZpcmVOYXZpZ2F0aW9uRXZlbnQodXJsKSk7XG5cdFx0d2ViQ29udGVudHMub24oJ2RpZC1uYXZpZ2F0ZS1pbi1wYWdlJywgKF8sIHVybCwgaXNNYWluRnJhbWUpID0+IHtcblx0XHRcdC8vIElnbm9yZSBzdWJmcmFtZSAoaWZyYW1lKSBuYXZpZ2F0aW9uczogdGhleSBtdXN0IG5vdCByZXdyaXRlIHRoZVxuXHRcdFx0Ly8gbWFpbiBmcmFtZSdzIFVSTCBiYXIgb3IgaXRzIGhpc3RvcnkgZW50cnkuXG5cdFx0XHRpZiAoaXNNYWluRnJhbWUpIHtcblx0XHRcdFx0ZmlyZU5hdmlnYXRpb25FdmVudCh1cmwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0d2ViQ29udGVudHMub24oJ2RpZC1uYXZpZ2F0ZScsICgpID0+IHtcblx0XHRcdC8vIENocm9taXVtIHJlc2V0cyB0aGUgem9vbSBmYWN0b3IgdG8gaXRzIHBlci1vcmlnaW4gZGVmYXVsdCAoMTAwJSkgd2hlblxuXHRcdFx0Ly8gbmF2aWdhdGluZyB0byBhIG5ldyBkb2N1bWVudC4gUmUtYXBwbHkgb3VyIHN0b3JlZCB6b29tIHRvIG92ZXJyaWRlIGl0LlxuXHRcdFx0dGhpcy5fY29uc29sZUxvZ3MubGVuZ3RoID0gMDsgLy8gQ2xlYXIgY29uc29sZSBsb2dzIG9uIG5hdmlnYXRpb24gc2luY2UgdGhleSBhcmUgcGVyLXBhZ2Vcblx0XHRcdHRoaXMuX3ZpZXcud2ViQ29udGVudHMuc2V0Wm9vbUZhY3Rvcihicm93c2VyWm9vbUZhY3RvcnNbdGhpcy5fYnJvd3Nlclpvb21JbmRleF0pO1xuXG5cdFx0XHQvLyBFbmFibGUgcGluY2gtdG8tem9vbVxuXHRcdFx0dm9pZCB0aGlzLl92aWV3LndlYkNvbnRlbnRzLnNldFZpc3VhbFpvb21MZXZlbExpbWl0cygxLCAzKS5jYXRjaChlcnJvciA9PiB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIHNldCB2aXN1YWwgem9vbSBsZXZlbCBsaW1pdHMgZm9yIGJyb3dzZXIgdmlldyB3ZWJDb250ZW50cy4nLCBlcnJvcik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHdlYkNvbnRlbnRzLm9uKCdzZWxlY3QtYmx1ZXRvb3RoLWRldmljZScsIChldmVudCwgZGV2aWNlcywgY2FsbGJhY2spID0+IHtcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLnNlc3Npb24ucGVybWlzc2lvbnMuYmVnaW5CbHVldG9vdGhSZXF1ZXN0KHRoaXMud2ViQ29udGVudHMsIGRldmljZXMsIGNhbGxiYWNrKTtcblx0XHR9KTtcblxuXHRcdC8vIEZvY3VzIGV2ZW50c1xuXHRcdHdlYkNvbnRlbnRzLm9uKCdmb2N1cycsICgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRm9jdXMuZmlyZSh7IGZvY3VzZWQ6IHRydWUgfSk7XG5cdFx0fSk7XG5cblx0XHR3ZWJDb250ZW50cy5vbignYmx1cicsICgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRm9jdXMuZmlyZSh7IGZvY3VzZWQ6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb25Db21tYW5kS2V5ZG93biA9IChfZXZlbnQ6IHVua25vd24sIGtleUV2ZW50OiBJQnJvd3NlclZpZXdLZXlEb3duRXZlbnQpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkS2V5Q29tbWFuZC5maXJlKGtleUV2ZW50KTtcblx0XHR9O1xuXG5cdFx0Ly8gRm9yd2FyZCBrZXkgZG93biBldmVudHMgdGhhdCB3ZXJlbid0IGhhbmRsZWQgYnkgdGhlIHBhZ2UgdG8gdGhlIHdvcmtiZW5jaCBmb3Igc2hvcnRjdXQgaGFuZGxpbmcuXG5cdFx0d2ViQ29udGVudHMuaXBjLm9uKCd2c2NvZGU6YnJvd3NlclZpZXc6a2V5ZG93bicsIG9uQ29tbWFuZEtleWRvd24pO1xuXHRcdHdlYkNvbnRlbnRzLm9uKCdkZXZ0b29scy1vcGVuZWQnLCAoKSA9PiB7XG5cdFx0XHQvLyBBdm9pZCBkb3VibGUtcmVnaXN0cmF0aW9uIGlmIHRoZSB3ZWJDb250ZW50cyBpcyByZXVzZWQuXG5cdFx0XHR3ZWJDb250ZW50cy5kZXZUb29sc1dlYkNvbnRlbnRzPy5pcGMub2ZmKCd2c2NvZGU6YnJvd3NlclZpZXc6a2V5ZG93bicsIG9uQ29tbWFuZEtleWRvd24pO1xuXHRcdFx0d2ViQ29udGVudHMuZGV2VG9vbHNXZWJDb250ZW50cz8uaXBjLm9uKCd2c2NvZGU6YnJvd3NlclZpZXc6a2V5ZG93bicsIG9uQ29tbWFuZEtleWRvd24pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gSWYgdGhlIHBhZ2Ugd29uJ3QgYmUgYWJsZSB0byBoYW5kbGUgZXZlbnRzLCBmb3J3YXJkIGtleSBkb3duIGV2ZW50cyBkaXJlY3RseS5cblx0XHR3ZWJDb250ZW50cy5vbignYmVmb3JlLWlucHV0LWV2ZW50JywgKGV2ZW50LCBpbnB1dCkgPT4ge1xuXHRcdFx0aWYgKGlucHV0LnR5cGUgIT09ICdrZXlEb3duJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBhZ2VJc0F2YWlsYWJsZSA9IHRoaXMuX3ZpZXcuZ2V0VmlzaWJsZSgpXG5cdFx0XHRcdCYmICF3ZWJDb250ZW50cy5pc0NyYXNoZWQoKVxuXHRcdFx0XHQmJiAhdGhpcy5kZWJ1Z2dlci5pc1BhdXNlZDtcblx0XHRcdGlmIChwYWdlSXNBdmFpbGFibGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUaGlzIGxvZ2ljIHNob3VsZCBtaXJyb3IgdGhhdCBpbiBwcmVsb2FkLWJyb3dzZXJWaWV3LnRzLlxuXHRcdFx0aWYgKCEoaW5wdXQuY29udHJvbCB8fCBpbnB1dC5hbHQgfHwgaW5wdXQubWV0YSkgJiYgaW5wdXQua2V5Lmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdGNvbnN0IGV2ZW50S2V5Q29kZSA9IFNDQU5fQ09ERV9TVFJfVE9fRVZFTlRfS0VZX0NPREVbaW5wdXQuY29kZV0gfHwgMDtcblx0XHRcdHRoaXMuX29uRGlkS2V5Q29tbWFuZC5maXJlKHtcblx0XHRcdFx0a2V5OiBpbnB1dC5rZXksXG5cdFx0XHRcdGtleUNvZGU6IGV2ZW50S2V5Q29kZSxcblx0XHRcdFx0Y29kZTogaW5wdXQuY29kZSxcblx0XHRcdFx0Y3RybEtleTogaW5wdXQuY29udHJvbCxcblx0XHRcdFx0c2hpZnRLZXk6IGlucHV0LnNoaWZ0LFxuXHRcdFx0XHRhbHRLZXk6IGlucHV0LmFsdCxcblx0XHRcdFx0bWV0YUtleTogaW5wdXQubWV0YSxcblx0XHRcdFx0cmVwZWF0OiBpbnB1dC5pc0F1dG9SZXBlYXRcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVHJhY2sgdXNlciBnZXN0dXJlcyBmb3IgcG9wdXAgYmxvY2tpbmcgbG9naWMuXG5cdFx0Ly8gUm91Z2hseSBiYXNlZCBvbiBodHRwczovL2h0bWwuc3BlYy53aGF0d2cub3JnL211bHRpcGFnZS9pbnRlcmFjdGlvbi5odG1sI3RyYWNraW5nLXVzZXItYWN0aXZhdGlvbi5cblx0XHR3ZWJDb250ZW50cy5vbignaW5wdXQtZXZlbnQnLCAoX2V2ZW50LCBpbnB1dCkgPT4ge1xuXHRcdFx0c3dpdGNoIChpbnB1dC50eXBlKSB7XG5cdFx0XHRcdGNhc2UgJ3Jhd0tleURvd24nOlxuXHRcdFx0XHRjYXNlICdrZXlEb3duJzpcblx0XHRcdFx0Y2FzZSAnbW91c2VEb3duJzpcblx0XHRcdFx0Y2FzZSAncG9pbnRlckRvd24nOlxuXHRcdFx0XHRjYXNlICdwb2ludGVyVXAnOlxuXHRcdFx0XHRjYXNlICd0b3VjaEVuZCc6XG5cdFx0XHRcdFx0dGhpcy5fbGFzdFVzZXJHZXN0dXJlVGltZXN0YW1wID0gRGF0ZS5ub3coKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIEZvciBub3csIGFsd2F5cyBwcmV2ZW50IHNpdGVzIGZyb20gYmxvY2tpbmcgdW5sb2FkLlxuXHRcdC8vIEluIHRoZSBmdXR1cmUgd2UgbWF5IHdhbnQgdG8gc2hvdyBhIGRpYWxvZyB0byBhc2sgdGhlIHVzZXIsXG5cdFx0Ly8gd2l0aCBoZWF2eSByZXN0cmljdGlvbnMgcmVnYXJkaW5nIGludGVyYWN0aW9uIGFuZCByZXBlYXRlZCBwcm9tcHRzLlxuXHRcdHdlYkNvbnRlbnRzLm9uKCd3aWxsLXByZXZlbnQtdW5sb2FkJywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHR9KTtcblxuXHRcdC8vIEZpbmQgaW4gcGFnZSBldmVudHNcblx0XHR3ZWJDb250ZW50cy5vbignZm91bmQtaW4tcGFnZScsIChfZXZlbnQsIHJlc3VsdCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRGaW5kSW5QYWdlLmZpcmUoe1xuXHRcdFx0XHRhY3RpdmVNYXRjaE9yZGluYWw6IHJlc3VsdC5hY3RpdmVNYXRjaE9yZGluYWwsXG5cdFx0XHRcdG1hdGNoZXM6IHJlc3VsdC5tYXRjaGVzLFxuXHRcdFx0XHRzZWxlY3Rpb25BcmVhOiByZXN1bHQuc2VsZWN0aW9uQXJlYSxcblx0XHRcdFx0ZmluYWxVcGRhdGU6IHJlc3VsdC5maW5hbFVwZGF0ZVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyBDYXB0dXJlIGNvbnNvbGUgbWVzc2FnZXMgZm9yIHNoYXJpbmcgd2l0aCBjaGF0XG5cdFx0dGhpcy5fdmlldy53ZWJDb250ZW50cy5vbignY29uc29sZS1tZXNzYWdlJywgKGV2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLl9jb25zb2xlTG9ncy5wdXNoKGBbJHtldmVudC5sZXZlbH1dICR7ZXZlbnQubWVzc2FnZX1gKTtcblx0XHRcdGlmICh0aGlzLl9jb25zb2xlTG9ncy5sZW5ndGggPiBCcm93c2VyVmlldy5NQVhfQ09OU09MRV9MT0dfRU5UUklFUykge1xuXHRcdFx0XHR0aGlzLl9jb25zb2xlTG9ncy5zcGxpY2UoMCwgdGhpcy5fY29uc29sZUxvZ3MubGVuZ3RoIC0gQnJvd3NlclZpZXcuTUFYX0NPTlNPTEVfTE9HX0VOVFJJRVMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25zdW1lUG9wdXBQZXJtaXNzaW9uKGxvY2F0aW9uOiBOZXdQYWdlTG9jYXRpb24pOiBib29sZWFuIHtcblx0XHRzd2l0Y2ggKGxvY2F0aW9uKSB7XG5cdFx0XHRjYXNlIE5ld1BhZ2VMb2NhdGlvbi5Gb3JlZ3JvdW5kOlxuXHRcdFx0Y2FzZSBOZXdQYWdlTG9jYXRpb24uQmFja2dyb3VuZDpcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIE5ld1BhZ2VMb2NhdGlvbi5OZXdXaW5kb3c6XG5cdFx0XHRcdC8vIEVhY2ggdXNlciBnZXN0dXJlIGFsbG93cyBvbmUgcG9wdXAgd2luZG93IHdpdGhpbiAxIHNlY29uZFxuXHRcdFx0XHRpZiAodGhpcy5fbGFzdFVzZXJHZXN0dXJlVGltZXN0YW1wID4gRGF0ZS5ub3coKSAtIDEwMDApIHtcblx0XHRcdFx0XHR0aGlzLl9sYXN0VXNlckdlc3R1cmVUaW1lc3RhbXAgPSAtSW5maW5pdHk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29yZCBhIGNvbW1pdHRlZCBuYXZpZ2F0aW9uIGluIHRoZSBzZXNzaW9uJ3MgaGlzdG9yeS5cblx0ICovXG5cdHByaXZhdGUgX3JlY29yZE5hdmlnYXRpb24odXJsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB3ZWJDb250ZW50cyA9IHRoaXMuX3ZpZXcud2ViQ29udGVudHM7XG5cdFx0Y29uc3QgYWN0aXZlSW5kZXggPSB3ZWJDb250ZW50cy5uYXZpZ2F0aW9uSGlzdG9yeS5nZXRBY3RpdmVJbmRleCgpO1xuXG5cdFx0aWYgKCFpc1RyYWNrYWJsZUhpc3RvcnlVcmwodXJsKSkge1xuXHRcdFx0dGhpcy5fY3VycmVudEhpc3RvcnlIYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9sYXN0Q29tbWl0dGVkRW50cnlJbmRleCA9IGFjdGl2ZUluZGV4O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEEgY29tbWl0IHRoYXQgbGVhdmVzIHRoZSBhY3RpdmUgaW5kZXggdW5jaGFuZ2VkIHJlcGxhY2VkIHRoZSBjdXJyZW50XG5cdFx0Ly8gZW50cnkgaW4gcGxhY2U7IHJlZmluZSB0aGUgZXhpc3RpbmcgaGlzdG9yeSBpdGVtIHJhdGhlciB0aGFuIGFwcGVuZGluZ1xuXHRcdC8vIGEgZHVwbGljYXRlLlxuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2N1cnJlbnRIaXN0b3J5SGFuZGxlO1xuXHRcdGlmIChoYW5kbGUgJiYgYWN0aXZlSW5kZXggPT09IHRoaXMuX2xhc3RDb21taXR0ZWRFbnRyeUluZGV4KSB7XG5cdFx0XHRoYW5kbGUudXBkYXRlKHsgdXJsLCB0aXRsZTogd2ViQ29udGVudHMuZ2V0VGl0bGUoKSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdENvbW1pdHRlZEVudHJ5SW5kZXggPSBhY3RpdmVJbmRleDtcblxuXHRcdGNvbnN0IHVzZXJJbml0aWF0ZWQgPSB0aGlzLl9leHBsaWNpdE5hdmlnYXRpb25QZW5kaW5nO1xuXHRcdHRoaXMuX2V4cGxpY2l0TmF2aWdhdGlvblBlbmRpbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9jdXJyZW50SGlzdG9yeUhhbmRsZSA9IHRoaXMuc2Vzc2lvbi5oaXN0b3J5LmFkZChcblx0XHRcdHVybCxcblx0XHRcdHdlYkNvbnRlbnRzLmdldFRpdGxlKCksXG5cdFx0XHR0aGlzLl9sYXN0RmF2aWNvbixcblx0XHRcdHVzZXJJbml0aWF0ZWQsXG5cdFx0KTtcblx0fVxuXG5cdGdldCB3ZWJDb250ZW50cygpOiBFbGVjdHJvbi5XZWJDb250ZW50cyB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXcud2ViQ29udGVudHM7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBjdXJyZW50IHN0YXRlIG9mIHRoaXMgYnJvd3NlciB2aWV3XG5cdCAqL1xuXHRnZXRTdGF0ZSgpOiBJQnJvd3NlclZpZXdTdGF0ZSB7XG5cdFx0Y29uc3Qgd2ViQ29udGVudHMgPSB0aGlzLl92aWV3LndlYkNvbnRlbnRzO1xuXHRcdGNvbnN0IHVybCA9IHdlYkNvbnRlbnRzLmdldFVSTCgpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHVybCxcblx0XHRcdHRpdGxlOiB3ZWJDb250ZW50cy5nZXRUaXRsZSgpLFxuXHRcdFx0Y2FuR29CYWNrOiB3ZWJDb250ZW50cy5uYXZpZ2F0aW9uSGlzdG9yeS5jYW5Hb0JhY2soKSxcblx0XHRcdGNhbkdvRm9yd2FyZDogd2ViQ29udGVudHMubmF2aWdhdGlvbkhpc3RvcnkuY2FuR29Gb3J3YXJkKCksXG5cdFx0XHRsb2FkaW5nOiB3ZWJDb250ZW50cy5pc0xvYWRpbmcoKSxcblx0XHRcdGZvY3VzZWQ6IHdlYkNvbnRlbnRzLmlzRm9jdXNlZCgpLFxuXHRcdFx0dmlzaWJsZTogdGhpcy5fdmlldy5nZXRWaXNpYmxlKCksXG5cdFx0XHRpc0RldlRvb2xzT3Blbjogd2ViQ29udGVudHMuaXNEZXZUb29sc09wZW5lZCgpLFxuXHRcdFx0bGFzdFNjcmVlbnNob3Q6IHRoaXMuX2xhc3RTY3JlZW5zaG90LFxuXHRcdFx0bGFzdEZhdmljb246IHRoaXMuX2xhc3RGYXZpY29uLFxuXHRcdFx0bGFzdEVycm9yOiB0aGlzLl9sYXN0RXJyb3IsXG5cdFx0XHRjZXJ0aWZpY2F0ZUVycm9yOiB0aGlzLnNlc3Npb24udHJ1c3QuZ2V0Q2VydGlmaWNhdGVFcnJvcih1cmwpLFxuXHRcdFx0c3RvcmFnZVNjb3BlOiB0aGlzLnNlc3Npb24uc3RvcmFnZVNjb3BlLFxuXHRcdFx0c3RvcmFnZUtleXM6IHsgLi4udGhpcy5zZXNzaW9uLmhpc3Rvcnkuc3RvcmFnZUtleXMsIC4uLnRoaXMuc2Vzc2lvbi5wZXJtaXNzaW9ucy5zdG9yYWdlS2V5cyB9LFxuXHRcdFx0cGVybWlzc2lvbnM6IHRoaXMuc2Vzc2lvbi5wZXJtaXNzaW9ucy5zZXJpYWxpemUoKSxcblx0XHRcdGJyb3dzZXJab29tSW5kZXg6IHRoaXMuX2Jyb3dzZXJab29tSW5kZXgsXG5cdFx0XHRlbGVtZW50U2VsZWN0aW9uU3RhdGU6IHRoaXMuaW5zcGVjdG9yLmVsZW1lbnRTZWxlY3Rpb25TdGF0ZSxcblx0XHRcdGlzUmVtb3RlU2Vzc2lvbjogdGhpcy5zZXNzaW9uLnJlbW90ZS5pc1JlbW90ZSxcblx0XHRcdGlzQXJlYVNlbGVjdGlvbkFjdGl2ZTogdGhpcy5pbnNwZWN0b3IuaXNBcmVhU2VsZWN0aW9uQWN0aXZlLFxuXHRcdFx0ZGV2aWNlOiB0aGlzLmVtdWxhdG9yLmRldmljZVxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogVG9nZ2xlIGRldmVsb3BlciB0b29scyBmb3IgdGhpcyBicm93c2VyIHZpZXcuXG5cdCAqL1xuXHR0b2dnbGVEZXZUb29scygpOiB2b2lkIHtcblx0XHR0aGlzLl92aWV3LndlYkNvbnRlbnRzLnRvZ2dsZURldlRvb2xzKCk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSBsYXlvdXQgYm91bmRzIG9mIHRoaXMgdmlld1xuXHQgKi9cblx0bGF5b3V0KGJvdW5kczogSUJyb3dzZXJWaWV3Qm91bmRzKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRXaW5kb3c/Lndpbj8uaWQgIT09IGJvdW5kcy53aW5kb3dJZCkge1xuXHRcdFx0Y29uc3QgbmV3V2luZG93ID0gdGhpcy5fd2luZG93QnlJZChib3VuZHMud2luZG93SWQpO1xuXHRcdFx0aWYgKG5ld1dpbmRvdykge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50V2luZG93Py53aW4/LmNvbnRlbnRWaWV3LnJlbW92ZUNoaWxkVmlldyh0aGlzLl92aWV3KTtcblx0XHRcdFx0dGhpcy5fY3VycmVudFdpbmRvdyA9IG5ld1dpbmRvdztcblx0XHRcdFx0bmV3V2luZG93Lndpbj8uY29udGVudFZpZXcuYWRkQ2hpbGRWaWV3KHRoaXMuX3ZpZXcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3ZpZXcuc2V0Qm9yZGVyUmFkaXVzKE1hdGgucm91bmQoYm91bmRzLmNvcm5lclJhZGl1cyAqIGJvdW5kcy56b29tRmFjdG9yKSk7XG5cblx0XHRpZiAoYm91bmRzLmVtdWxhdGlvbikge1xuXHRcdFx0dGhpcy5lbXVsYXRvci5hcHBseVNjcmVlbkVtdWxhdGlvbihib3VuZHMud2lkdGgsIGJvdW5kcy5oZWlnaHQsIGJvdW5kcy5lbXVsYXRpb24uc2NhbGUsIGJvdW5kcy56b29tRmFjdG9yKTtcblx0XHR9XG5cblx0XHR0aGlzLl92aWV3LnNldEJvdW5kcyh7XG5cdFx0XHR4OiBNYXRoLnJvdW5kKGJvdW5kcy54ICogYm91bmRzLnpvb21GYWN0b3IpLFxuXHRcdFx0eTogTWF0aC5yb3VuZChib3VuZHMueSAqIGJvdW5kcy56b29tRmFjdG9yKSxcblx0XHRcdHdpZHRoOiBNYXRoLnJvdW5kKGJvdW5kcy53aWR0aCAqIGJvdW5kcy56b29tRmFjdG9yKSxcblx0XHRcdGhlaWdodDogTWF0aC5yb3VuZChib3VuZHMuaGVpZ2h0ICogYm91bmRzLnpvb21GYWN0b3IpXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9oYXNCZWVuTGFpZE91dCA9IHRydWU7XG5cdFx0aWYgKHRoaXMuX3dhbnRzVmlzaWJpbGl0eSAmJiAhdGhpcy5fdmlldy5nZXRWaXNpYmxlKCkpIHtcblx0XHRcdHRoaXMuX3ZpZXcuc2V0VmlzaWJsZSh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRzZXRCcm93c2VyWm9vbUluZGV4KHpvb21JbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYnJvd3Nlclpvb21JbmRleCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHpvb21JbmRleCwgYnJvd3Nlclpvb21GYWN0b3JzLmxlbmd0aCAtIDEpKTtcblx0XHRjb25zdCBicm93c2VyWm9vbUZhY3RvciA9IGJyb3dzZXJab29tRmFjdG9yc1t0aGlzLl9icm93c2VyWm9vbUluZGV4XTtcblx0XHR0aGlzLl92aWV3LndlYkNvbnRlbnRzLnNldFpvb21GYWN0b3IoYnJvd3Nlclpvb21GYWN0b3IpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgdmlzaWJpbGl0eSBvZiB0aGlzIHZpZXdcblx0ICovXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93YW50c1Zpc2liaWxpdHkgPT09IHZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgdmlldyBpcyBmb2N1c2VkLCBwYXNzIGZvY3VzIGJhY2sgdG8gdGhlIHdpbmRvdyB3aGVuIGhpZGluZ1xuXHRcdGlmICghdmlzaWJsZSAmJiB0aGlzLl92aWV3LndlYkNvbnRlbnRzLmlzRm9jdXNlZCgpKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50V2luZG93Py53aW4/LndlYkNvbnRlbnRzLmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2hhc0JlZW5MYWlkT3V0IHx8ICF2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl92aWV3LnNldFZpc2libGUodmlzaWJsZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fd2FudHNWaXNpYmlsaXR5ID0gdmlzaWJsZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZmlyZSh7IHZpc2libGUgfSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGNhcHR1cmVkIGNvbnNvbGUgbG9ncy5cblx0ICovXG5cdGdldENvbnNvbGVMb2dzKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnNvbGVMb2dzLmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExvYWQgYSBVUkwgaW4gdGhpcyB2aWV3XG5cdCAqL1xuXHRhc3luYyBsb2FkVVJMKHVybDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3JlZGlyZWN0UGlubmVkTmF2aWdhdGlvbih1cmwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2V4cGxpY2l0TmF2aWdhdGlvblBlbmRpbmcgPSB0cnVlO1xuXHRcdC8vIFdhaXQgZm9yIHRoZSB0dW5uZWwgcHJveHkgKGlmIGFueSkgdG8gYmUgYXBwbGllZCBzbyB0aGUgbmF2aWdhdGlvblxuXHRcdC8vIGFuZCB0aGUgcmVxdWVzdHMgaXQgdHJpZ2dlcnMgZmxvdyB0aHJvdWdoIHRoZSBwcm94eS5cblx0XHRhd2FpdCB0aGlzLnNlc3Npb24ucmVtb3RlLndoZW5SZWFkeTtcblx0XHRhd2FpdCB0aGlzLl92aWV3LndlYkNvbnRlbnRzLmxvYWRVUkwodXJsKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZGlyZWN0UGlubmVkTmF2aWdhdGlvbih1cmw6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5hc3NvY2lhdGVkUmVzb3VyY2UgfHwgaXNCcm93c2VyVmlld0Fzc29jaWF0ZWRSZXNvdXJjZU5hdmlnYXRpb24odGhpcy5hc3NvY2lhdGVkUmVzb3VyY2UsIHVybCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsb2dCcm93c2VyT3Blbih0aGlzLnRlbGVtZXRyeVNlcnZpY2UsICdicm93c2VyTGlua0ZvcmVncm91bmQnKTtcblx0XHR0aGlzLl9jcmVhdGVDaGlsZFZpZXcodXJsLCB1bmRlZmluZWQsIHtcblx0XHRcdHBpbm5lZDogdHJ1ZSxcblx0XHRcdHBhcmVudFZpZXdJZDogdGhpcy5pZFxuXHRcdH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgY3VycmVudCBVUkxcblx0ICovXG5cdGdldFVSTCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl92aWV3LndlYkNvbnRlbnRzLmdldFVSTCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE5hdmlnYXRlIGJhY2sgaW4gaGlzdG9yeVxuXHQgKi9cblx0Z29CYWNrKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl92aWV3LndlYkNvbnRlbnRzLm5hdmlnYXRpb25IaXN0b3J5LmNhbkdvQmFjaygpKSB7XG5cdFx0XHR0aGlzLl92aWV3LndlYkNvbnRlbnRzLm5hdmlnYXRpb25IaXN0b3J5LmdvQmFjaygpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBOYXZpZ2F0ZSBmb3J3YXJkIGluIGhpc3Rvcnlcblx0ICovXG5cdGdvRm9yd2FyZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdmlldy53ZWJDb250ZW50cy5uYXZpZ2F0aW9uSGlzdG9yeS5jYW5Hb0ZvcndhcmQoKSkge1xuXHRcdFx0dGhpcy5fdmlldy53ZWJDb250ZW50cy5uYXZpZ2F0aW9uSGlzdG9yeS5nb0ZvcndhcmQoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVsb2FkIHRoZSBjdXJyZW50IHBhZ2Vcblx0ICovXG5cdHJlbG9hZChoYXJkPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChoYXJkKSB7XG5cdFx0XHR0aGlzLl92aWV3LndlYkNvbnRlbnRzLnJlbG9hZElnbm9yaW5nQ2FjaGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdmlldy53ZWJDb250ZW50cy5yZWxvYWQoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2sgaWYgdGhlIHZpZXcgY2FuIG5hdmlnYXRlIGJhY2tcblx0ICovXG5cdGNhbkdvQmFjaygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlldy53ZWJDb250ZW50cy5uYXZpZ2F0aW9uSGlzdG9yeS5jYW5Hb0JhY2soKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVjayBpZiB0aGUgdmlldyBjYW4gbmF2aWdhdGUgZm9yd2FyZFxuXHQgKi9cblx0Y2FuR29Gb3J3YXJkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl92aWV3LndlYkNvbnRlbnRzLm5hdmlnYXRpb25IaXN0b3J5LmNhbkdvRm9yd2FyZCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhcHR1cmUgYSBzY3JlZW5zaG90IG9mIHRoaXMgdmlld1xuXHQgKi9cblx0YXN5bmMgY2FwdHVyZVNjcmVlbnNob3Qob3B0aW9ucz86IElCcm93c2VyVmlld0NhcHR1cmVTY3JlZW5zaG90T3B0aW9ucyk6IFByb21pc2U8VlNCdWZmZXI+IHtcblx0XHRpZiAoIXRoaXMuX3ZpZXcuZ2V0VmlzaWJsZSgpKSB7XG5cdFx0XHQvLyBUaGlzIGVuc3VyZXMgdGhlIHdlYkNvbnRlbnRzIHJlbmRlcmluZyBwaXBlbGluZSBpcyByZWFkeSBzbyBiYWNrZ3JvdW5kIHRhYnMgY2FuIGJlIGNhcHR1cmVkIHRvby5cblx0XHRcdHRoaXMuX3ZpZXcuc2V0VmlzaWJsZSh0cnVlKTtcblx0XHRcdHRoaXMuX3ZpZXcuc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVhbGl0eSA9IG9wdGlvbnM/LnF1YWxpdHkgPz8gODA7XG5cdFx0Y29uc3QgZm9ybWF0ID0gb3B0aW9ucz8uZm9ybWF0ID8/ICdqcGVnJztcblxuXHRcdGlmIChvcHRpb25zPy5mdWxsUGFnZSAmJiAhb3B0aW9ucy5zY3JlZW5SZWN0ICYmICFvcHRpb25zLnBhZ2VSZWN0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2FwdHVyZUZ1bGxQYWdlU2NyZWVuc2hvdChmb3JtYXQsIHF1YWxpdHkpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy5wYWdlUmVjdCkge1xuXHRcdFx0Y29uc3Qgem9vbUZhY3RvciA9IHRoaXMuX3ZpZXcud2ViQ29udGVudHMuZ2V0Wm9vbUZhY3RvcigpO1xuXHRcdFx0Ly8gVGhlIHZpc3VhbCB2aWV3cG9ydCBzY2FsZSBhY2NvdW50cyBmb3IgcGluY2gtdG8tem9vbSBtYWduaWZpY2F0aW9uLCB3aGljaCBpcyBzZXBhcmF0ZSBmcm9tIHRoZSByZWd1bGFyIHpvb20gZmFjdG9yLlxuXHRcdFx0Y29uc3QgdmlzdWFsVmlld3BvcnRTY2FsZSA9IGF3YWl0IHRoaXMuaW5zcGVjdG9yLmdldFZpc3VhbFZpZXdwb3J0U2NhbGUoKTtcblx0XHRcdGNvbnN0IGVtdWxhdGlvblNjYWxlID0gdGhpcy5lbXVsYXRvci5lbXVsYXRlZFNjYWxlRmFjdG9yO1xuXHRcdFx0b3B0aW9ucy5zY3JlZW5SZWN0ID0ge1xuXHRcdFx0XHR4OiBvcHRpb25zLnBhZ2VSZWN0LnggKiB2aXN1YWxWaWV3cG9ydFNjYWxlICogem9vbUZhY3RvciAqIGVtdWxhdGlvblNjYWxlLFxuXHRcdFx0XHR5OiBvcHRpb25zLnBhZ2VSZWN0LnkgKiB2aXN1YWxWaWV3cG9ydFNjYWxlICogem9vbUZhY3RvciAqIGVtdWxhdGlvblNjYWxlLFxuXHRcdFx0XHR3aWR0aDogb3B0aW9ucy5wYWdlUmVjdC53aWR0aCAqIHZpc3VhbFZpZXdwb3J0U2NhbGUgKiB6b29tRmFjdG9yICogZW11bGF0aW9uU2NhbGUsXG5cdFx0XHRcdGhlaWdodDogb3B0aW9ucy5wYWdlUmVjdC5oZWlnaHQgKiB2aXN1YWxWaWV3cG9ydFNjYWxlICogem9vbUZhY3RvciAqIGVtdWxhdGlvblNjYWxlXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucz8uYXdhaXROZXh0UGFpbnQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3dhaXRGb3JOZXh0UGFpbnQoKTtcblx0XHR9XG5cdFx0Y29uc3QgaW1hZ2UgPSBhd2FpdCAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWF4QXR0ZW1wdHMgPSA1O1xuXHRcdFx0bGV0IGxhc3RFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1heEF0dGVtcHRzOyBpKyspIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fdmlldy53ZWJDb250ZW50cy5jYXB0dXJlUGFnZShvcHRpb25zPy5zY3JlZW5SZWN0LCB7XG5cdFx0XHRcdFx0XHRzdGF5SGlkZGVuOiB0cnVlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0Ly8gYFVua25vd25WaXpFcnJvcmAgaXMgYSB0cmFuc2llbnQgRWxlY3Ryb24gZXJyb3Igd2hlbiBubyBmcmFtZSBpcyBhdmFpbGFibGUgeWV0XG5cdFx0XHRcdFx0Ly8gKGUuZy4gb2Zmc2NyZWVuIHNjZW5hcmlvcyB3aGVyZSByZW5kZXJpbmcgaGFzIGp1c3QgYmVlbiBraWNrZWQgb2ZmIGJ5IGBzZXRWaXNpYmxlKHRydWUpYCksXG5cdFx0XHRcdFx0Ly8gc28gcmV0cnkgYSBmZXcgdGltZXMuXG5cdFx0XHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZSA9PT0gJ1Vua25vd25WaXpFcnJvcicpIHtcblx0XHRcdFx0XHRcdGxhc3RFcnJvciA9IGVycm9yO1xuXHRcdFx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDE2KSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBjYXB0dXJlIHNjcmVlbnNob3QgYWZ0ZXIgJHttYXhBdHRlbXB0c30gYXR0ZW1wdHNgLCB7IGNhdXNlOiBsYXN0RXJyb3IgfSk7XG5cdFx0fSkoKTtcblx0XHRjb25zdCBidWZmZXIgPSBmb3JtYXQgPT09ICdwbmcnID8gaW1hZ2UudG9QTkcoKSA6IGltYWdlLnRvSlBFRyhxdWFsaXR5KTtcblx0XHRjb25zdCBzY3JlZW5zaG90ID0gVlNCdWZmZXIud3JhcChidWZmZXIpO1xuXHRcdC8vIE9ubHkgdXBkYXRlIF9sYXN0U2NyZWVuc2hvdCBpZiBjYXB0dXJpbmcgdGhlIGZ1bGwgdmlld1xuXHRcdGlmICghb3B0aW9ucz8uc2NyZWVuUmVjdCkge1xuXHRcdFx0dGhpcy5fbGFzdFNjcmVlbnNob3QgPSBzY3JlZW5zaG90O1xuXHRcdH1cblx0XHRyZXR1cm4gc2NyZWVuc2hvdDtcblx0fVxuXG5cdC8vIENhcHR1cmUgYSBzY3JlZW5zaG90IG9mIHRoZSBmdWxsIHNjcm9sbGFibGUgZG9jdW1lbnQgKGJleW9uZCB0aGUgdmlld3BvcnQpIHZpYSBDRFAuXG5cdHByaXZhdGUgYXN5bmMgX2NhcHR1cmVGdWxsUGFnZVNjcmVlbnNob3QoZm9ybWF0OiAnanBlZycgfCAncG5nJywgcXVhbGl0eTogbnVtYmVyKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdGNvbnN0IG1ldHJpY3MgPSBhd2FpdCB0aGlzLmRlYnVnZ2VyLnNlbmRDb21tYW5kKCdQYWdlLmdldExheW91dE1ldHJpY3MnKSBhcyB7IGNzc0NvbnRlbnRTaXplPzogeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IH07XG5cdFx0Ly8gU2l6ZSBpbiBDU1MgcGl4ZWxzXG5cdFx0Y29uc3Qgc2l6ZSA9IG1ldHJpY3MuY3NzQ29udGVudFNpemU7XG5cdFx0aWYgKCFzaXplKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1BhZ2UuZ2V0TGF5b3V0TWV0cmljcyBkaWQgbm90IHJldHVybiBhIGNzc0NvbnRlbnRTaXplJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHpvb21GYWN0b3IgPSB0aGlzLl92aWV3LndlYkNvbnRlbnRzLmdldFpvb21GYWN0b3IoKTtcblx0XHRjb25zdCBjbGlwV2lkdGggPSBzaXplLndpZHRoICogem9vbUZhY3Rvcjtcblx0XHRjb25zdCBjbGlwSGVpZ2h0ID0gc2l6ZS5oZWlnaHQgKiB6b29tRmFjdG9yO1xuXHRcdC8vIENEUCByZW5kZXJzIHRoZSBzY3JlZW5zaG90IGF0IGRldmljZSBwaXhlbHMsIHNvIHRoZSBvdXRwdXQgYml0bWFwIGRpbWVuc2lvbnMgYXJlIHJvdWdobHlcblx0XHQvLyBgY2xpcC53aWR0aCAqIHNjYWxlICogZGV2aWNlUGl4ZWxSYXRpb2AuIERpdmlkZSBieSBEUFIgaGVyZSBzbyBgTUFYX0ZVTExfUEFHRV9TQ1JFRU5TSE9UX0RJTUVOU0lPTmBcblx0XHQvLyBpcyBhbiB1cHBlciBib3VuZCBvbiB0aGUgZmluYWwgaW1hZ2UgcGl4ZWwgc2l6ZSAobm90IGp1c3QgdGhlIENTUy1waXhlbCBjbGlwIHNpemUpLlxuXHRcdC8vIFdlIHJlYWQgdGhlIERQUiBmcm9tIHRoZSBkaXNwbGF5IGhvc3RpbmcgdGhlIHZpZXcncyB3aW5kb3cgKHJhdGhlciB0aGFuIGV2YWx1YXRpbmdcblx0XHQvLyBgd2luZG93LmRldmljZVBpeGVsUmF0aW9gIGluIHRoZSBwYWdlKSBzbyB0aGlzIHdvcmtzIHdpdGhvdXQgYSByZW5kZXJlciByb3VuZC10cmlwIGFuZFxuXHRcdC8vIHdoaWxlIHRoZSBwYWdlIGlzIHBhdXNlZCBhdCBhIGJyZWFrcG9pbnQuIEZhbGwgYmFjayB0byB0aGUgcHJpbWFyeSBkaXNwbGF5IGlmIG5vIGhvc3Rcblx0XHQvLyB3aW5kb3cgY2FuIGJlIHJlc29sdmVkIChlLmcuIGR1cmluZyB0ZWFyZG93bikuXG5cdFx0Y29uc3QgaG9zdFdpbmRvdyA9IHRoaXMuX2hvc3RXaW5kb3c7XG5cdFx0Y29uc3QgZGlzcGxheSA9IGhvc3RXaW5kb3cgPyBzY3JlZW4uZ2V0RGlzcGxheU1hdGNoaW5nKGhvc3RXaW5kb3cuZ2V0Qm91bmRzKCkpIDogc2NyZWVuLmdldFByaW1hcnlEaXNwbGF5KCk7XG5cdFx0Y29uc3QgZGV2aWNlUGl4ZWxSYXRpbyA9IGRpc3BsYXkuc2NhbGVGYWN0b3I7XG5cdFx0Y29uc3QgbWF4Q2xpcERpbWVuc2lvbiA9IEJyb3dzZXJWaWV3Lk1BWF9GVUxMX1BBR0VfU0NSRUVOU0hPVF9ESU1FTlNJT04gLyBNYXRoLm1heChkZXZpY2VQaXhlbFJhdGlvLCAxKTtcblx0XHRjb25zdCBzY2FsZSA9IE1hdGgubWluKDEsIG1heENsaXBEaW1lbnNpb24gLyBNYXRoLm1heChjbGlwV2lkdGgsIGNsaXBIZWlnaHQpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZWJ1Z2dlci5zZW5kQ29tbWFuZCgnUGFnZS5jYXB0dXJlU2NyZWVuc2hvdCcsIHtcblx0XHRcdFx0Zm9ybWF0LFxuXHRcdFx0XHQuLi4oZm9ybWF0ID09PSAnanBlZycgPyB7IHF1YWxpdHkgfSA6IHt9KSxcblx0XHRcdFx0Y2FwdHVyZUJleW9uZFZpZXdwb3J0OiB0cnVlLFxuXHRcdFx0XHQvLyBJbiB0aGVvcnksIGBjbGlwYCBkZWZhdWx0cyB0byB0aGUgZnVsbCBhcmVhIHdoZW4gbm90IGV4cGxpY2l0bHkgcGFzc2VkLCBidXQgaW4gcHJhY3RpY2UgaXQgZG9lc24ndCB3b3JrIHdoZW5cblx0XHRcdFx0Ly8gdGhlIHpvb20gbGV2ZWwgaXNuJ3QgMTAwLCBiZWNhdXNlIGl0IGRvZXNuJ3QgbXVsdGlwbHkgdGhlIHdpZHRoIGFuZCBoZWlnaHQgYnkgem9vbUZhY3RvciBsaWtlIHdlIGRvIGhlcmUuXG5cdFx0XHRcdC8vIFNldHRpbmcgdGhlIGNsaXAgZXhwbGljaXRseSwgd2UgY2FuIG11bHRpcGx5IGJ5IHpvb21GYWN0b3IgYW5kIHRodXMgd29yayBhcm91bmQgdGhpcyBDaHJvbWl1bSBidWcuXG5cdFx0XHRcdC8vIE5vdGUgdGhhdCBldmVuIHdpdGggdGhpcyB3b3JrYXJvdW5kLCB3ZSBvZnRlbiBzZWUgdGhhdCB0aGUgcGFnZSBpc24ndCBmdWxseSBjYXB0dXJlZCBhbmQgbWlnaHQgcmVwZWF0XG5cdFx0XHRcdC8vIHZpc3VhbCBjb250ZW50IGZyb20gdGhlIHRvcCBhdCB0aGUgYm90dG9tLCBpbnN0ZWFkIG9mIHNob3dpbmcgdGhlIGJvdHRvbSBvZiB0aGUgcGFnZS5cblx0XHRcdFx0Ly8gLSBBbm90aGVyIHNpZGVub3RlOiBDdXJyZW50bHkgdGhlIHNjcm9sbGJhciB3aWR0aCBpc24ndCBhY2NvdW50ZWQgZm9yLiBJZiBhIHNjcm9sbGJhciBleGlzdHMsIHdlIHNob3VsZCBhZGQgdGhlXG5cdFx0XHRcdC8vICAgdmVydGljYWwgc2Nyb2xsYmFyJ3Mgd2lkdGggYW5kIGhvcml6b250YWwgc2Nyb2xsYmFyJ3MgaGVpZ2h0IHRvIHRoZSBjbGlwIGRpbWVuc2lvbnMsIHNpbmNlIHRoZSBpbWFnZSBpcyBjdXJyZW50bHlcblx0XHRcdFx0Ly8gICBjbGlwcGVkIGJ5IHRoYXQgYW1vdW50ICh0aGlzIGFsc28gaGFwcGVucyB3aGVuIG5vIGNsaXAgcGFyYW1ldGVyIGlzIHByb3ZpZGVkOyBpZGVhbGx5IGl0IHNob3VsZCBiZSBmaXhlZCB1cHN0cmVhbVxuXHRcdFx0XHQvLyAgIGluIENocm9taXVtKS5cblx0XHRcdFx0Y2xpcDogeyB4OiAwLCB5OiAwLCB3aWR0aDogY2xpcFdpZHRoLCBoZWlnaHQ6IGNsaXBIZWlnaHQsIHNjYWxlIH1cblx0XHRcdH0pIGFzIHsgZGF0YTogc3RyaW5nIH07XG5cdFx0XHRyZXR1cm4gVlNCdWZmZXIud3JhcChCdWZmZXIuZnJvbShyZXN1bHQuZGF0YSwgJ2Jhc2U2NCcpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Ly8gYFBhZ2UuY2FwdHVyZVNjcmVlbnNob3RgIHdpdGggYGNhcHR1cmVCZXlvbmRWaWV3cG9ydGAgcmVzZXRzIGFuZFxuXHRcdFx0Ly8gZGlzYWJsZXMgcGluY2gtdG8tem9vbSB1bnRpbCB0aGUgbmV4dCBuYXZpZ2F0aW9uLiBSZS1lbmFibGUgaXQgc29cblx0XHRcdC8vIHRoZSB1c2VyIGNhbiBzdGlsbCBwaW5jaC10by16b29tIGV2ZW4gaW1tZWRpYXRlbHkgYWZ0ZXJcblx0XHRcdC8vIGNhcHR1cmluZyBhIGZ1bGwtcGFnZSBzY3JlZW5zaG90LlxuXHRcdFx0dm9pZCB0aGlzLl92aWV3LndlYkNvbnRlbnRzLnNldFZpc3VhbFpvb21MZXZlbExpbWl0cygxLCAzKS5jYXRjaChlcnJvciA9PiB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIHJlc3RvcmUgdmlzdWFsIHpvb20gbGV2ZWwgbGltaXRzIGFmdGVyIGZ1bGwtcGFnZSBzY3JlZW5zaG90LicsIGVycm9yKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dhaXRGb3JOZXh0UGFpbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgV0FJVF9USU1FT1VUX01TID0gMTAwO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHR0aGlzLmRlYnVnZ2VyLnNlbmRDb21tYW5kKCdSdW50aW1lLmV2YWx1YXRlJywge1xuXHRcdFx0XHRcdGV4cHJlc3Npb246ICduZXcgUHJvbWlzZShyID0+IHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocikpKScsXG5cdFx0XHRcdFx0YXdhaXRQcm9taXNlOiB0cnVlXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgV0FJVF9USU1FT1VUX01TKSlcblx0XHRcdF0pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gYFJ1bnRpbWUuZXZhbHVhdGVgIGNhbiB0aHJvdyBpZiB0aGUgcGFnZSBuYXZpZ2F0ZXMgd2hpbGUgd2UncmUgd2FpdGluZztcblx0XHRcdC8vIGp1c3QgcHJvY2VlZCBpbiB0aGF0IGNhc2UuXG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZvY3VzIHRoaXMgdmlld1xuXHQgKi9cblx0YXN5bmMgZm9jdXMoZm9yY2U/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQnkgZGVmYXVsdCwgb25seSBmb2N1cyB0aGUgdmlldyBpZiBpdHMgd2luZG93IGlzIGFscmVhZHkgZm9jdXNlZC5cblx0XHRpZiAoIWZvcmNlICYmICF0aGlzLl9jdXJyZW50V2luZG93Py53aW4/LmlzRm9jdXNlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3ZpZXcud2ViQ29udGVudHMuZm9jdXMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kIHRleHQgaW4gdGhlIHBhZ2Vcblx0ICovXG5cdGFzeW5jIGZpbmRJblBhZ2UodGV4dDogc3RyaW5nLCBvcHRpb25zPzogSUJyb3dzZXJWaWV3RmluZEluUGFnZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl92aWV3LndlYkNvbnRlbnRzLmZpbmRJblBhZ2UodGV4dCwge1xuXHRcdFx0bWF0Y2hDYXNlOiBvcHRpb25zPy5tYXRjaENhc2UgPz8gZmFsc2UsXG5cdFx0XHRmb3J3YXJkOiBvcHRpb25zPy5mb3J3YXJkID8/IHRydWUsXG5cblx0XHRcdC8vIGBmaW5kTmV4dGAgaXMgbm90IHZlcnkgY2xlYXJseSBuYW1lZC4gRnJvbSBFbGVjdHJvbiBkb2NzOiBgV2hldGhlciB0byBiZWdpbiBhIG5ldyB0ZXh0IGZpbmRpbmcgc2Vzc2lvbiB3aXRoIHRoaXMgcmVxdWVzdGAuXG5cdFx0XHQvLyBJdCBuZWVkcyB0byBiZSBzZXQgdG8gYHRydWVgIGlmIHdlIHdhbnQgYSBuZXcgc2VhcmNoIHRvIGJlIHBlcmZvcm1lZCwgc3VjaCBhcyB3aGVuIHRoZSB0ZXh0IGNoYW5nZXMuXG5cdFx0XHQvLyBXZSBuYW1lIGl0IGByZWNvbXB1dGVgIGluIG91ciBpbnRlcm5hbCBvcHRpb25zIHRvIGJldHRlciByZWZsZWN0IGl0cyBwdXJwb3NlIC8gYmVoYXZpb3IuXG5cdFx0XHRmaW5kTmV4dDogb3B0aW9ucz8ucmVjb21wdXRlID8/IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU3RvcCBmaW5kaW5nIGluIHBhZ2Vcblx0ICovXG5cdGFzeW5jIHN0b3BGaW5kSW5QYWdlKGtlZXBTZWxlY3Rpb24/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fdmlldy53ZWJDb250ZW50cy5zdG9wRmluZEluUGFnZShrZWVwU2VsZWN0aW9uID8gJ2tlZXBTZWxlY3Rpb24nIDogJ2NsZWFyU2VsZWN0aW9uJyk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgdGV4dCBpbiB0aGUgYnJvd3NlciB2aWV3LlxuXHQgKiBSZXR1cm5zIGltbWVkaWF0ZWx5IHdpdGggZW1wdHkgc3RyaW5nIGlmIHRoZSBwYWdlIGlzIHN0aWxsIGxvYWRpbmcuXG5cdCAqL1xuXHRhc3luYyBnZXRTZWxlY3RlZFRleHQoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHQvLyB3ZSBkb24ndCB3YW50IHRvIHdhaXQgZm9yIHRoZSBwYWdlIHRvIGZpbmlzaCBsb2FkaW5nLCB3aGljaCBleGVjdXRlSmF2YVNjcmlwdCBub3JtYWxseSBkb2VzLlxuXHRcdGlmICh0aGlzLl92aWV3LndlYkNvbnRlbnRzLmlzTG9hZGluZygpKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHQvLyBVc2VzIG91ciBwcmVsb2FkZWQgY29udGV4dEJyaWRnZS1leHBvc2VkIEFQSS5cblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl92aWV3LndlYkNvbnRlbnRzLmV4ZWN1dGVKYXZhU2NyaXB0SW5Jc29sYXRlZFdvcmxkKGJyb3dzZXJWaWV3SXNvbGF0ZWRXb3JsZElkLCBbeyBjb2RlOiAnd2luZG93LmJyb3dzZXJWaWV3QVBJPy5nZXRTZWxlY3RlZFRleHQ/LigpID8/IFwiXCInIH1dKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXIgYWxsIHN0b3JhZ2UgZGF0YSBmb3IgdGhpcyBicm93c2VyIHZpZXcncyBzZXNzaW9uXG5cdCAqL1xuXHRhc3luYyBjbGVhclN0b3JhZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5zZXNzaW9uLmNsZWFyRGF0YSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFuc3dlciBhbiBpbi1wcm9ncmVzcyBoYXJkd2FyZS1kZXZpY2UgY2hvb3Nlci4gUGFzcyB0aGUgY2hvc2VuIGRldmljZSBpZCxcblx0ICogb3IgYG51bGxgIHRvIGNhbmNlbCB0aGUgY2hvb3Nlci5cblx0ICovXG5cdHNlbGVjdERldmljZShyZXF1ZXN0SWQ6IHN0cmluZywgZGV2aWNlSWQ6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLnNlc3Npb24ucGVybWlzc2lvbnMucmVzb2x2ZURldmljZShyZXF1ZXN0SWQsIGRldmljZUlkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcnVzdCBhIGNlcnRpZmljYXRlIGZvciBhIGdpdmVuIGhvc3QgYW5kIHJlbG9hZCB0aGUgcGFnZS5cblx0ICovXG5cdGFzeW5jIHRydXN0Q2VydGlmaWNhdGUoaG9zdDogc3RyaW5nLCBmaW5nZXJwcmludDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5zZXNzaW9uLnRydXN0LnRydXN0Q2VydGlmaWNhdGUoaG9zdCwgZmluZ2VycHJpbnQpO1xuXHRcdHRoaXMuX3ZpZXcud2ViQ29udGVudHMucmVsb2FkKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV2b2tlIHRydXN0IGZvciBhIHByZXZpb3VzbHkgdHJ1c3RlZCBjZXJ0aWZpY2F0ZSBhbmQgY2xvc2UgdGhlIHZpZXcuXG5cdCAqL1xuXHRhc3luYyB1bnRydXN0Q2VydGlmaWNhdGUoaG9zdDogc3RyaW5nLCBmaW5nZXJwcmludDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5zZXNzaW9uLnRydXN0LnVudHJ1c3RDZXJ0aWZpY2F0ZShob3N0LCBmaW5nZXJwcmludCk7XG5cdFx0dGhpcy5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSB1bmRlcmx5aW5nIFdlYkNvbnRlbnRzVmlld1xuXHQgKi9cblx0Z2V0V2ViQ29udGVudHNWaWV3KCk6IFdlYkNvbnRlbnRzVmlldyB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXc7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBob3N0aW5nIEVsZWN0cm9uIHdpbmRvdyBmb3IgdGhpcyB2aWV3LCBpZiBhbnkuXG5cdCAqIFRoaXMgY2FuIGJlIGFuIGF1eGlsaWFyeSB3aW5kb3csIGRlcGVuZGluZyBvbiB3aGVyZSB0aGUgdmlldyBpcyBjdXJyZW50bHkgaG9zdGVkLlxuXHQgKi9cblx0Z2V0RWxlY3Ryb25XaW5kb3coKTogRWxlY3Ryb24uQnJvd3NlcldpbmRvdyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRXaW5kb3c/LndpbiA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIEVsZWN0cm9uIHdpbmRvdyB0aGF0IGN1cnJlbnRseSBob3N0cyB0aGlzIHZpZXcsIGlmIGFueS4gQmVmb3JlIGBsYXlvdXQoKWAgaXMgZmlyc3Rcblx0ICogY2FsbGVkIHRoaXMgaXMgdGhlIG93bmVyIHdpbmRvdzsgYWZ0ZXIgdGhhdCBpdCdzIHdoaWNoZXZlciB3aW5kb3cgdGhlIHZpZXcgd2FzIGxhc3QgbW92ZWRcblx0ICogdG8uIFJldHVybnMgYHVuZGVmaW5lZGAgaWYgbm8gaG9zdCB3aW5kb3cgY2FuIGJlIHJlc29sdmVkIChlLmcuIGR1cmluZyB0ZWFyZG93bikuXG5cdCAqL1xuXHRwcml2YXRlIGdldCBfaG9zdFdpbmRvdygpOiBFbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VycmVudFdpbmRvdz8ud2luID8/IHRoaXMuX293bmVyV2luZG93LndpbiA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXG5cdFx0Ly8gRGlzcG9zZSBkZWJ1Z2dlci4gVGhpcyBkZXRhY2hlcyBkZWJ1ZyBzZXNzaW9ucyBmaXJzdC5cblx0XHR0aGlzLmRlYnVnZ2VyLmRpc3Bvc2UoKTtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIHBhcmVudCB3aW5kb3cgKGd1YXJkIGFnYWluc3QgYWxyZWFkeS1kZXN0cm95ZWQgd2luZG93KVxuXHRcdGNvbnN0IGN1cnJlbnRXaW4gPSB0aGlzLl9jdXJyZW50V2luZG93Py53aW47XG5cdFx0aWYgKGN1cnJlbnRXaW4gJiYgIWN1cnJlbnRXaW4uaXNEZXN0cm95ZWQoKSkge1xuXHRcdFx0Y3VycmVudFdpbi5jb250ZW50Vmlldy5yZW1vdmVDaGlsZFZpZXcodGhpcy5fdmlldyk7XG5cdFx0fVxuXG5cdFx0Ly8gRmlyZSBjbG9zZSBldmVudCBCRUZPUkUgZGlzcG9zaW5nIGVtaXR0ZXJzLiBUaGlzIHNpZ25hbHMgdGhlIHZpZXcgaGFzIGJlZW4gZGVzdHJveWVkLlxuXHRcdHRoaXMuX29uRGlkQ2xvc2UuZmlyZSgpO1xuXG5cdFx0Ly8gQ2xlYW4gdXAgdGhlIHZpZXcgYW5kIGFsbCBpdHMgZXZlbnQgbGlzdGVuZXJzXG5cdFx0aWYgKCF0aGlzLl92aWV3LndlYkNvbnRlbnRzLmlzRGVzdHJveWVkKCkpIHtcblx0XHRcdHRoaXMuX3ZpZXcud2ViQ29udGVudHMuY2xvc2UoeyB3YWl0Rm9yQmVmb3JlVW5sb2FkOiBmYWxzZSB9KTtcblx0XHR9XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF93aW5kb3dCeUlkKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBJQ29kZVdpbmRvdyB8IElBdXhpbGlhcnlXaW5kb3cgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb2RlV2luZG93QnlJZCh3aW5kb3dJZCkgPz8gdGhpcy5fYXV4aWxpYXJ5V2luZG93QnlJZCh3aW5kb3dJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb2RlV2luZG93QnlJZCh3aW5kb3dJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogSUNvZGVXaW5kb3cgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2Ygd2luZG93SWQgIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dCeUlkKHdpbmRvd0lkKTtcblx0fVxuXG5cdHByaXZhdGUgX2F1eGlsaWFyeVdpbmRvd0J5SWQod2luZG93SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IElBdXhpbGlhcnlXaW5kb3cgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2Ygd2luZG93SWQgIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnRzID0gd2ViQ29udGVudHMuZnJvbUlkKHdpbmRvd0lkKTtcblx0XHRpZiAoIWNvbnRlbnRzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmF1eGlsaWFyeVdpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dCeVdlYkNvbnRlbnRzKGNvbnRlbnRzKTtcblx0fVxufVxuXG4vKiogVHJ1ZSBpZmYgdGhpcyBVUkwgc2hvdWxkIGJlIHJlY29yZGVkIGluIGJyb3dzZXIgaGlzdG9yeS4gKi9cbmZ1bmN0aW9uIGlzVHJhY2thYmxlSGlzdG9yeVVybCh1cmw6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoIXVybCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHQvLyBDaGVhcCBzY2hlbWUgZmlsdGVyIGF2b2lkcyBVUkwgcGFyc2luZyBvbiB0aGUgaG90IHBhdGguXG5cdGNvbnN0IGNvbG9uID0gdXJsLmluZGV4T2YoJzonKTtcblx0aWYgKGNvbG9uIDw9IDApIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3Qgc2NoZW1lID0gdXJsLnN1YnN0cmluZygwLCBjb2xvbikudG9Mb3dlckNhc2UoKTtcblx0cmV0dXJuIHNjaGVtZSA9PT0gJ2h0dHAnIHx8IHNjaGVtZSA9PT0gJ2h0dHBzJyB8fCBzY2hlbWUgPT09ICdmaWxlJztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxRQUFRLGlCQUFpQixtQkFBbUI7QUFDckQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUE4WSw0QkFBNEIsb0JBQW9CLHlCQUF5RyxpREFBaUQ7QUFDeGxCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQXNCLGtCQUFrQjtBQUN4QyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQjtBQUc1QixTQUFnRCwwQkFBMEI7QUFFMUUsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFHL0IsSUFBSyxrQkFBTCxrQkFBS0EscUJBQUw7QUFDQyxFQUFBQSxpQkFBQSxnQkFBYTtBQUNiLEVBQUFBLGlCQUFBLGdCQUFhO0FBQ2IsRUFBQUEsaUJBQUEsZUFBWTtBQUhSLFNBQUFBO0FBQUEsR0FBQTtBQVVFLElBQU0sY0FBTixjQUEwQixXQUFXO0FBQUEsRUErRTNDLFlBQ2lCLElBQ0EsT0FDQSxvQkFDQSxTQUNDLGtCQUNqQixpQkFDQSxTQUNzQyxvQkFDUyw2QkFDakIsWUFDTSxrQkFDbkM7QUFDRCxVQUFNO0FBWlU7QUFDQTtBQUNBO0FBQ0E7QUFDQztBQUdxQjtBQUNTO0FBQ2pCO0FBQ007QUF4RnJDLFNBQWlCLHVCQUF1QixvQkFBSSxJQUE2QjtBQUV6RSxTQUFRLGtCQUF3QztBQUNoRCxTQUFRLGVBQW1DO0FBQzNDLFNBQVEsYUFBZ0Q7QUFDeEQsU0FBUSw0QkFBb0M7QUFDNUMsU0FBUSxvQkFBNEI7QUFHcEMsU0FBUSw2QkFBNkI7QUFLckM7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFRLDJCQUEyQjtBQVFuQyxT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
