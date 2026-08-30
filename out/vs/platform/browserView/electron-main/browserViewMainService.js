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
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableMap } from "../../../base/common/lifecycle.js";
import { BrowserViewCommandId } from "../common/browserView.js";
import { clipboard, Menu, MenuItem } from "electron";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { createDecorator, IInstantiationService } from "../../instantiation/common/instantiation.js";
import { BrowserView } from "./browserView.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { IWindowsMainService } from "../../windows/electron-main/windows.js";
import { BrowserSession } from "./browserSession.js";
import { IApplicationStorageMainService } from "../../storage/electron-main/storageMainService.js";
import { logBrowserOpen } from "../common/browserViewTelemetry.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { localize } from "../../../nls.js";
import { INativeHostMainService } from "../../native/electron-main/nativeHostMainService.js";
import { htmlAttributeEncodeValue } from "../../../base/common/strings.js";
import { BrowserViewInspectElementId } from "./browserViewInspector.js";
import { equals } from "../../../base/common/objects.js";
import { URI } from "../../../base/common/uri.js";
const IBrowserViewMainService = createDecorator("browserViewMainService");
let BrowserViewMainService = class extends Disposable {
  constructor(environmentMainService, instantiationService, windowsMainService, telemetryService, nativeHostMainService, applicationStorageMainService) {
    super();
    this.environmentMainService = environmentMainService;
    this.instantiationService = instantiationService;
    this.windowsMainService = windowsMainService;
    this.telemetryService = telemetryService;
    this.nativeHostMainService = nativeHostMainService;
    this.applicationStorageMainService = applicationStorageMainService;
    this.browserViews = this._register(new DisposableMap());
    /**
     * Per-window configuration applied to the browser views that window owns.
     * Entries are dropped when the window is destroyed.
     */
    this._windowConfigurations = /* @__PURE__ */ new Map();
    this._windowCloseSubscriptions = this._register(new DisposableMap());
    this._onDidCreateBrowserView = this._register(new Emitter());
    this.onDidCreateBrowserView = this._onDidCreateBrowserView.event;
  }
  /**
   * Check if a webContents belongs to an integrated browser view.
   * Delegates to {@link BrowserSession.isBrowserViewWebContents}.
   */
  static isBrowserViewWebContents(contents) {
    return BrowserSession.isBrowserViewWebContents(contents);
  }
  async getOrCreateBrowserView(id, options) {
    const associatedResource = URI.revive(options.associatedResource);
    if (this.browserViews.has(id)) {
      const view2 = this.browserViews.get(id);
      return this._getViewInfo(view2);
    }
    const ownerWindow = this.windowsMainService.getWindowById(options.owner.mainWindowId);
    if (!ownerWindow) {
      throw new Error(`Owner window with ID ${options.owner.mainWindowId} not found`);
    }
    const browserSession = BrowserSession.getOrCreate(
      this.instantiationService,
      id,
      options.sessionOptions,
      this.environmentMainService.workspaceStorageHome,
      ownerWindow.openedWorkspace?.id
    );
    const view = this.createBrowserView(id, options.owner, browserSession, associatedResource);
    if (options.initialState?.url) {
      void view.loadURL(options.initialState.url);
    }
    return {
      ...this._getViewInfo(view),
      state: {
        ...view.getState(),
        ...options.initialState
      }
    };
  }
  tryGetBrowserView(id) {
    return this.browserViews.get(id);
  }
  async createTarget(url, owner, browserContextId) {
    const browserSession = browserContextId ? BrowserSession.get(browserContextId) : void 0;
    return this.openNew(url, {
      owner,
      session: browserSession,
      openOptions: { preserveFocus: true },
      source: "cdpCreated"
    });
  }
  /**
   * Get a browser view or throw if not found
   */
  _getBrowserView(id) {
    const view = this.browserViews.get(id);
    if (!view) {
      throw new Error(`Browser view ${id} not found`);
    }
    return view;
  }
  _getViewInfo(view) {
    return {
      id: view.id,
      owner: view.owner,
      associatedResource: view.associatedResource,
      state: view.getState()
    };
  }
  async getBrowserViews(windowId) {
    const result = [];
    for (const [, view] of this.browserViews) {
      if (windowId !== void 0 && view.owner.mainWindowId !== windowId) {
        continue;
      }
      result.push(this._getViewInfo(view));
    }
    return result;
  }
  onDynamicDidNavigate(id) {
    return this._getBrowserView(id).onDidNavigate;
  }
  onDynamicDidChangeLoadingState(id) {
    return this._getBrowserView(id).onDidChangeLoadingState;
  }
  onDynamicDidChangeFocus(id) {
    return this._getBrowserView(id).onDidChangeFocus;
  }
  onDynamicDidChangeVisibility(id) {
    return this._getBrowserView(id).onDidChangeVisibility;
  }
  onDynamicDidChangeDevToolsState(id) {
    return this._getBrowserView(id).onDidChangeDevToolsState;
  }
  onDynamicDidKeyCommand(id) {
    return this._getBrowserView(id).onDidKeyCommand;
  }
  onDynamicDidChangeTitle(id) {
    return this._getBrowserView(id).onDidChangeTitle;
  }
  onDynamicDidChangeFavicon(id) {
    return this._getBrowserView(id).onDidChangeFavicon;
  }
  onDynamicDidFindInPage(id) {
    return this._getBrowserView(id).onDidFindInPage;
  }
  onDynamicDidClose(id) {
    return this._getBrowserView(id).onDidClose;
  }
  onDynamicDidSelectElement(id) {
    return this._getBrowserView(id).inspector.onDidSelectElement;
  }
  onDynamicDidRemoveElementComment(id) {
    return this._getBrowserView(id).inspector.onDidRemoveElementComment;
  }
  onDynamicDidChangeElementSelectionState(id) {
    return this._getBrowserView(id).inspector.onDidChangeElementSelectionState;
  }
  onDynamicDidPickArea(id) {
    return this._getBrowserView(id).inspector.onDidPickArea;
  }
  onDynamicDidChangeAreaSelectionActive(id) {
    return this._getBrowserView(id).inspector.onDidChangeAreaSelectionActive;
  }
  onDynamicDidChangeDeviceEmulation(id) {
    return this._getBrowserView(id).emulator.onDidChange;
  }
  onDynamicDidChangeRemoteStatus(id) {
    return this._getBrowserView(id).onDidChangeRemoteStatus;
  }
  onDynamicDidRequestPermission(id) {
    return this._getBrowserView(id).onDidRequestPermission;
  }
  onDynamicDidChangePermissions(id) {
    return this._getBrowserView(id).onDidChangePermissions;
  }
  async getState(id) {
    return this._getBrowserView(id).getState();
  }
  async destroyBrowserView(id) {
    return this.browserViews.deleteAndDispose(id);
  }
  async layout(id, bounds) {
    return this._getBrowserView(id).layout(bounds);
  }
  async setVisible(id, visible) {
    return this._getBrowserView(id).setVisible(visible);
  }
  async loadURL(id, url) {
    return this._getBrowserView(id).loadURL(url);
  }
  async getURL(id) {
    return this._getBrowserView(id).getURL();
  }
  async goBack(id) {
    return this._getBrowserView(id).goBack();
  }
  async goForward(id) {
    return this._getBrowserView(id).goForward();
  }
  async reload(id, hard) {
    return this._getBrowserView(id).reload(hard);
  }
  async toggleDevTools(id) {
    return this._getBrowserView(id).toggleDevTools();
  }
  async canGoBack(id) {
    return this._getBrowserView(id).canGoBack();
  }
  async canGoForward(id) {
    return this._getBrowserView(id).canGoForward();
  }
  async captureScreenshot(id, options) {
    return this._getBrowserView(id).captureScreenshot(options);
  }
  async focus(id, force) {
    return this._getBrowserView(id).focus(force);
  }
  async findInPage(id, text, options) {
    return this._getBrowserView(id).findInPage(text, options);
  }
  async stopFindInPage(id, keepSelection) {
    return this._getBrowserView(id).stopFindInPage(keepSelection);
  }
  async getSelectedText(id) {
    return this._getBrowserView(id).getSelectedText();
  }
  async clearStorage(id) {
    return this._getBrowserView(id).clearStorage();
  }
  async setBrowserZoomIndex(id, zoomIndex) {
    return this._getBrowserView(id).setBrowserZoomIndex(zoomIndex);
  }
  async setDeviceEmulation(id, device) {
    return this._getBrowserView(id).emulator.setDevice(device);
  }
  async trustCertificate(id, host, fingerprint) {
    return this._getBrowserView(id).trustCertificate(host, fingerprint);
  }
  async untrustCertificate(id, host, fingerprint) {
    return this._getBrowserView(id).untrustCertificate(host, fingerprint);
  }
  async deleteBrowserHistory(id, entryIds) {
    this._getBrowserView(id).session.history.delete(entryIds);
  }
  async setPermissions(id, origin, grants) {
    this._getBrowserView(id).session.permissions.set(origin, grants);
  }
  async selectDevice(id, requestId, deviceId) {
    this._getBrowserView(id).selectDevice(requestId, deviceId);
  }
  async clearGlobalStorage() {
    const browserSession = BrowserSession.getOrCreateGlobal(this.instantiationService);
    browserSession.connectStorage(this.applicationStorageMainService);
    await browserSession.clearData();
  }
  async clearWorkspaceStorage(workspaceId) {
    const browserSession = BrowserSession.getOrCreateWorkspace(
      this.instantiationService,
      workspaceId,
      this.environmentMainService.workspaceStorageHome
    );
    browserSession.connectStorage(this.applicationStorageMainService);
    await browserSession.clearData();
  }
  async getConsoleLogs(id) {
    return this._getBrowserView(id).getConsoleLogs();
  }
  async toggleElementSelection(id, enabled, options) {
    return this._getBrowserView(id).inspector.toggleElementSelection(enabled, options);
  }
  async setElementComments(id, update) {
    this._getBrowserView(id).inspector.setElementComments(update);
  }
  async toggleAreaSelection(id, enabled) {
    return this._getBrowserView(id).inspector.toggleAreaSelection(enabled);
  }
  async updateWindowConfiguration(windowId, config) {
    const oldConfig = this._windowConfigurations.get(windowId);
    const didThemeChange = !equals(oldConfig?.theme, config.theme);
    const didProxyChange = !equals(oldConfig?.proxyInfo, config.proxyInfo);
    this._windowConfigurations.set(windowId, config);
    this._ensureWindowCloseSubscription(windowId);
    for (const [, view] of this.browserViews) {
      if (view.owner.mainWindowId === windowId) {
        if (didThemeChange) {
          view.inspector.setTheme(config.theme);
        }
        if (didProxyChange) {
          view.session.remote.acquire(view.id, config.proxyInfo);
        }
        if (typeof config.maxHistoryEntries === "number") {
          view.session.history.setMaxEntries(config.maxHistoryEntries);
        }
      }
    }
    this._recomputeTrustedFileRoots();
  }
  _ensureWindowCloseSubscription(windowId) {
    if (this._windowCloseSubscriptions.has(windowId)) {
      return;
    }
    const window = this.windowsMainService.getWindowById(windowId);
    if (!window) {
      return;
    }
    const onWindowGone = Event.any(window.onDidClose, window.onDidDestroy);
    this._windowCloseSubscriptions.set(windowId, Event.once(onWindowGone)(() => {
      this._windowCloseSubscriptions.deleteAndDispose(windowId);
      if (this._windowConfigurations.delete(windowId)) {
        this._recomputeTrustedFileRoots();
      }
    }));
  }
  _recomputeTrustedFileRoots() {
    const roots = /* @__PURE__ */ new Set();
    let trustAllFiles = false;
    for (const configuration of this._windowConfigurations.values()) {
      for (const root of configuration.trustedFileRoots) {
        roots.add(root);
      }
      trustAllFiles ||= configuration.trustAllFiles;
    }
    BrowserSession.setTrustedFileRoots([...roots], trustAllFiles);
  }
  /**
   * Create a browser view backed by the given {@link BrowserSession}.
   */
  createBrowserView(id, owner, browserSession, associatedResource, options) {
    if (this.browserViews.has(id)) {
      throw new Error(`Browser view with id ${id} already exists`);
    }
    browserSession.connectStorage(this.applicationStorageMainService);
    const windowConfiguration = this._windowConfigurations.get(owner.mainWindowId);
    if (typeof windowConfiguration?.maxHistoryEntries === "number") {
      browserSession.history.setMaxEntries(windowConfiguration.maxHistoryEntries);
    }
    browserSession.remote.acquire(id, windowConfiguration?.proxyInfo);
    const view = this.instantiationService.createInstance(
      BrowserView,
      id,
      owner,
      associatedResource,
      browserSession,
      // Recursive factory for nested windows (child views share the same session and owner).
      (url, electronOptions, openOptions) => {
        const child = this.createBrowserView(generateUuid(), owner, browserSession, void 0, electronOptions);
        if (url) {
          void child.loadURL(url).catch(() => {
          });
        }
        const info = this._getViewInfo(child);
        this._onDidCreateBrowserView.fire({
          info: url ? { ...info, state: { ...info.state, url } } : info,
          openOptions
        });
        return child;
      },
      (v, params) => this.showContextMenu(v, params),
      options
    );
    this.browserViews.set(id, view);
    if (windowConfiguration?.theme) {
      view.inspector.setTheme(windowConfiguration.theme);
    }
    Event.once(view.onDidClose)(() => {
      browserSession.remote.release(id);
      this.browserViews.deleteAndDispose(id);
    });
    return view;
  }
  async openNew(url, {
    owner,
    session,
    openOptions,
    source
  }) {
    const targetId = generateUuid();
    const view = this.createBrowserView(targetId, owner, session || BrowserSession.getOrCreateEphemeral(this.instantiationService, targetId));
    if (url) {
      void view.loadURL(url).catch(() => {
      });
    }
    logBrowserOpen(this.telemetryService, source);
    const info = this._getViewInfo(view);
    this._onDidCreateBrowserView.fire({
      info: url ? { ...info, state: { ...info.state, url } } : info,
      openOptions
    });
    return view;
  }
  async showContextMenu(view, params) {
    const win = view.getElectronWindow();
    if (!win) {
      return;
    }
    const webContents = view.webContents;
    if (webContents.isDestroyed()) {
      return;
    }
    const windowConfiguration = this._windowConfigurations.get(view.owner.mainWindowId);
    const inspectTarget = windowConfiguration?.aiFeaturesDisabled ? void 0 : params.frame && await view.inspector.getElementHandle(BrowserViewInspectElementId.ContextMenuTarget, params.frame);
    const menu = new Menu();
    if (params.linkURL) {
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.openLinkInNewTab", "Open Link in New Tab"),
        click: () => {
          void this.openNew(params.linkURL, {
            owner: view.owner,
            session: view.session,
            openOptions: { preserveFocus: true, background: true },
            source: "browserLinkBackground"
          });
        }
      }));
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.openLinkInExternalBrowser", "Open Link in External Browser"),
        click: () => {
          void this.nativeHostMainService.openExternal(void 0, params.linkURL);
        }
      }));
      menu.append(new MenuItem({ type: "separator" }));
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.copyLink", "Copy Link"),
        click: () => {
          clipboard.write({
            text: params.linkURL,
            html: `<a href="${encodeURI(params.linkURL)}">${htmlAttributeEncodeValue(params.linkText || params.linkURL)}</a>`
          });
        }
      }));
    }
    if (params.hasImageContents && params.srcURL) {
      if (menu.items.length > 0) {
        menu.append(new MenuItem({ type: "separator" }));
      }
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.openImageInNewTab", "Open Image in New Tab"),
        click: () => {
          void this.openNew(params.srcURL, {
            owner: view.owner,
            session: view.session,
            openOptions: { preserveFocus: true, background: true },
            source: "browserLinkBackground"
          });
        }
      }));
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.copyImage", "Copy Image"),
        click: () => {
          view.webContents.copyImageAt(params.x, params.y);
        }
      }));
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.copyImageUrl", "Copy Image URL"),
        click: () => {
          clipboard.writeText(params.srcURL);
        }
      }));
    }
    if (params.isEditable) {
      menu.append(new MenuItem({ role: "cut", enabled: params.editFlags.canCut }));
      menu.append(new MenuItem({ role: "copy", enabled: params.editFlags.canCopy }));
      menu.append(new MenuItem({ role: "paste", enabled: params.editFlags.canPaste }));
      menu.append(new MenuItem({ role: "pasteAndMatchStyle", enabled: params.editFlags.canPaste }));
      menu.append(new MenuItem({ role: "selectAll", enabled: params.editFlags.canSelectAll }));
    } else if (params.selectionText) {
      menu.append(new MenuItem({ role: "copy" }));
    }
    if (menu.items.length === 0) {
      if (webContents.navigationHistory.canGoBack()) {
        menu.append(new MenuItem({
          label: localize("browser.contextMenu.back", "Back"),
          accelerator: windowConfiguration?.keybindings[BrowserViewCommandId.GoBack],
          click: () => webContents.navigationHistory.goBack()
        }));
      }
      if (webContents.navigationHistory.canGoForward()) {
        menu.append(new MenuItem({
          label: localize("browser.contextMenu.forward", "Forward"),
          accelerator: windowConfiguration?.keybindings[BrowserViewCommandId.GoForward],
          click: () => webContents.navigationHistory.goForward()
        }));
      }
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.reload", "Reload"),
        accelerator: windowConfiguration?.keybindings[BrowserViewCommandId.Reload],
        click: () => webContents.reload()
      }));
    }
    if (inspectTarget) {
      menu.append(new MenuItem({ type: "separator" }));
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.addElementToChat", "Add Element to Chat"),
        click: () => inspectTarget.addToChat()
      }));
      menu.append(new MenuItem({
        label: localize("browser.contextMenu.addComment", "Add Comment..."),
        click: () => inspectTarget.addComment()
      }));
      void inspectTarget.highlight().catch(() => {
      });
      menu.on("menu-will-close", () => inspectTarget.dispose());
    }
    menu.append(new MenuItem({ type: "separator" }));
    menu.append(new MenuItem({
      label: localize("browser.contextMenu.inspect", "Inspect"),
      click: () => webContents.inspectElement(params.x, params.y)
    }));
    const viewBounds = view.getWebContentsView().getBounds();
    menu.popup({
      window: win,
      x: viewBounds.x + params.x,
      y: viewBounds.y + params.y,
      sourceType: params.menuSourceType
    });
  }
};
BrowserViewMainService = __decorateClass([
  __decorateParam(0, IEnvironmentMainService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IWindowsMainService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, INativeHostMainService),
  __decorateParam(5, IApplicationStorageMainService)
], BrowserViewMainService);
export {
  BrowserViewMainService,
  IBrowserViewMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYnJvd3NlclZpZXdcXGVsZWN0cm9uLW1haW5cXGJyb3dzZXJWaWV3TWFpblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJFbGVtZW50Q29tbWVudHNVcGRhdGUsIElCcm93c2VyRWxlbWVudFNlbGVjdGlvbk9wdGlvbnMsIElCcm93c2VyVmlld0JvdW5kcywgSUJyb3dzZXJWaWV3U3RhdGUsIElCcm93c2VyVmlld1NlcnZpY2UsIElCcm93c2VyVmlld0NhcHR1cmVTY3JlZW5zaG90T3B0aW9ucywgSUJyb3dzZXJWaWV3RmluZEluUGFnZU9wdGlvbnMsIEJyb3dzZXJWaWV3Q29tbWFuZElkLCBJQnJvd3NlclZpZXdPd25lciwgSUJyb3dzZXJWaWV3SW5mbywgSUJyb3dzZXJWaWV3Q3JlYXRlZEV2ZW50LCBJQnJvd3NlclZpZXdPcGVuT3B0aW9ucywgSUJyb3dzZXJWaWV3Q3JlYXRlT3B0aW9ucywgSUJyb3dzZXJWaWV3V2luZG93Q29uZmlndXJhdGlvbiwgSUJyb3dzZXJEZXZpY2VQcm9maWxlIH0gZnJvbSAnLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IGNsaXBib2FyZCwgTWVudSwgTWVudUl0ZW0gfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2VsZWN0cm9uLW1haW4vZW52aXJvbm1lbnRNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXcgfSBmcm9tICcuL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVdpbmRvd3NNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3dpbmRvd3MvZWxlY3Ryb24tbWFpbi93aW5kb3dzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJTZXNzaW9uIH0gZnJvbSAnLi9icm93c2VyU2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2VsZWN0cm9uLW1haW4vc3RvcmFnZU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQZXJtaXNzaW9uQ2F0ZWdvcnlTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9icm93c2VyUGVybWlzc2lvbnMuanMnO1xuaW1wb3J0IHsgSW50ZWdyYXRlZEJyb3dzZXJPcGVuU291cmNlLCBsb2dCcm93c2VyT3BlbiB9IGZyb20gJy4uL2NvbW1vbi9icm93c2VyVmlld1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9uYXRpdmUvZWxlY3Ryb24tbWFpbi9uYXRpdmVIb3N0TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaHRtbEF0dHJpYnV0ZUVuY29kZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVmlld0luc3BlY3RFbGVtZW50SWQgfSBmcm9tICcuL2Jyb3dzZXJWaWV3SW5zcGVjdG9yLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuZXhwb3J0IGNvbnN0IElCcm93c2VyVmlld01haW5TZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElCcm93c2VyVmlld01haW5TZXJ2aWNlPignYnJvd3NlclZpZXdNYWluU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElCcm93c2VyVmlld01haW5TZXJ2aWNlIGV4dGVuZHMgSUJyb3dzZXJWaWV3U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHR0cnlHZXRCcm93c2VyVmlldyhpZDogc3RyaW5nKTogQnJvd3NlclZpZXcgfCB1bmRlZmluZWQ7XG5cblx0LyoqIENyZWF0ZSBhIG5ldyB0YXJnZXQgYW5kIHJldHVybiBpdC4gKi9cblx0Y3JlYXRlVGFyZ2V0KHVybDogc3RyaW5nLCBvd25lcjogSUJyb3dzZXJWaWV3T3duZXIsIGJyb3dzZXJDb250ZXh0SWQ/OiBzdHJpbmcpOiBQcm9taXNlPEJyb3dzZXJWaWV3Pjtcbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJWaWV3TWFpblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUJyb3dzZXJWaWV3TWFpblNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogQ2hlY2sgaWYgYSB3ZWJDb250ZW50cyBiZWxvbmdzIHRvIGFuIGludGVncmF0ZWQgYnJvd3NlciB2aWV3LlxuXHQgKiBEZWxlZ2F0ZXMgdG8ge0BsaW5rIEJyb3dzZXJTZXNzaW9uLmlzQnJvd3NlclZpZXdXZWJDb250ZW50c30uXG5cdCAqL1xuXHRzdGF0aWMgaXNCcm93c2VyVmlld1dlYkNvbnRlbnRzKGNvbnRlbnRzOiBFbGVjdHJvbi5XZWJDb250ZW50cyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBCcm93c2VyU2Vzc2lvbi5pc0Jyb3dzZXJWaWV3V2ViQ29udGVudHMoY29udGVudHMpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBicm93c2VyVmlld3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIEJyb3dzZXJWaWV3PigpKTtcblxuXHQvKipcblx0ICogUGVyLXdpbmRvdyBjb25maWd1cmF0aW9uIGFwcGxpZWQgdG8gdGhlIGJyb3dzZXIgdmlld3MgdGhhdCB3aW5kb3cgb3ducy5cblx0ICogRW50cmllcyBhcmUgZHJvcHBlZCB3aGVuIHRoZSB3aW5kb3cgaXMgZGVzdHJveWVkLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfd2luZG93Q29uZmlndXJhdGlvbnMgPSBuZXcgTWFwPG51bWJlciwgSUJyb3dzZXJWaWV3V2luZG93Q29uZmlndXJhdGlvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfd2luZG93Q2xvc2VTdWJzY3JpcHRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENyZWF0ZUJyb3dzZXJWaWV3ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyb3dzZXJWaWV3Q3JlYXRlZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDcmVhdGVCcm93c2VyVmlldzogRXZlbnQ8SUJyb3dzZXJWaWV3Q3JlYXRlZEV2ZW50PiA9IHRoaXMuX29uRGlkQ3JlYXRlQnJvd3NlclZpZXcuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRNYWluU2VydmljZTogSUVudmlyb25tZW50TWFpblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXaW5kb3dzTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3aW5kb3dzTWFpblNlcnZpY2U6IElXaW5kb3dzTWFpblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0TWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBuYXRpdmVIb3N0TWFpblNlcnZpY2U6IElOYXRpdmVIb3N0TWFpblNlcnZpY2UsXG5cdFx0QElBcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlOiBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIGdldE9yQ3JlYXRlQnJvd3NlclZpZXcoaWQ6IHN0cmluZywgb3B0aW9uczogSUJyb3dzZXJWaWV3Q3JlYXRlT3B0aW9ucyk6IFByb21pc2U8SUJyb3dzZXJWaWV3SW5mbz4ge1xuXHRcdGNvbnN0IGFzc29jaWF0ZWRSZXNvdXJjZSA9IFVSSS5yZXZpdmUob3B0aW9ucy5hc3NvY2lhdGVkUmVzb3VyY2UpO1xuXHRcdGlmICh0aGlzLmJyb3dzZXJWaWV3cy5oYXMoaWQpKSB7XG5cdFx0XHRjb25zdCB2aWV3ID0gdGhpcy5icm93c2VyVmlld3MuZ2V0KGlkKSE7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0Vmlld0luZm8odmlldyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3duZXJXaW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dCeUlkKG9wdGlvbnMub3duZXIubWFpbldpbmRvd0lkKTtcblx0XHRpZiAoIW93bmVyV2luZG93KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE93bmVyIHdpbmRvdyB3aXRoIElEICR7b3B0aW9ucy5vd25lci5tYWluV2luZG93SWR9IG5vdCBmb3VuZGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJyb3dzZXJTZXNzaW9uID0gQnJvd3NlclNlc3Npb24uZ2V0T3JDcmVhdGUoXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0aWQsXG5cdFx0XHRvcHRpb25zLnNlc3Npb25PcHRpb25zLFxuXHRcdFx0dGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLndvcmtzcGFjZVN0b3JhZ2VIb21lLFxuXHRcdFx0b3duZXJXaW5kb3cub3BlbmVkV29ya3NwYWNlPy5pZFxuXHRcdCk7XG5cblx0XHRjb25zdCB2aWV3ID0gdGhpcy5jcmVhdGVCcm93c2VyVmlldyhpZCwgb3B0aW9ucy5vd25lciwgYnJvd3NlclNlc3Npb24sIGFzc29jaWF0ZWRSZXNvdXJjZSk7XG5cblx0XHRpZiAob3B0aW9ucy5pbml0aWFsU3RhdGU/LnVybCkge1xuXHRcdFx0dm9pZCB2aWV3LmxvYWRVUkwob3B0aW9ucy5pbml0aWFsU3RhdGUudXJsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4udGhpcy5fZ2V0Vmlld0luZm8odmlldyksXG5cdFx0XHRzdGF0ZToge1xuXHRcdFx0XHQuLi52aWV3LmdldFN0YXRlKCksXG5cdFx0XHRcdC4uLm9wdGlvbnMuaW5pdGlhbFN0YXRlXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHRyeUdldEJyb3dzZXJWaWV3KGlkOiBzdHJpbmcpOiBCcm93c2VyVmlldyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdzLmdldChpZCk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVUYXJnZXQodXJsOiBzdHJpbmcsIG93bmVyOiBJQnJvd3NlclZpZXdPd25lciwgYnJvd3NlckNvbnRleHRJZD86IHN0cmluZyk6IFByb21pc2U8QnJvd3NlclZpZXc+IHtcblx0XHRjb25zdCBicm93c2VyU2Vzc2lvbiA9IGJyb3dzZXJDb250ZXh0SWQgPyBCcm93c2VyU2Vzc2lvbi5nZXQoYnJvd3NlckNvbnRleHRJZCkgOiB1bmRlZmluZWQ7XG5cblx0XHRyZXR1cm4gdGhpcy5vcGVuTmV3KHVybCwge1xuXHRcdFx0b3duZXIsXG5cdFx0XHRzZXNzaW9uOiBicm93c2VyU2Vzc2lvbixcblx0XHRcdG9wZW5PcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSxcblx0XHRcdHNvdXJjZTogJ2NkcENyZWF0ZWQnXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGEgYnJvd3NlciB2aWV3IG9yIHRocm93IGlmIG5vdCBmb3VuZFxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0QnJvd3NlclZpZXcoaWQ6IHN0cmluZyk6IEJyb3dzZXJWaWV3IHtcblx0XHRjb25zdCB2aWV3ID0gdGhpcy5icm93c2VyVmlld3MuZ2V0KGlkKTtcblx0XHRpZiAoIXZpZXcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQnJvd3NlciB2aWV3ICR7aWR9IG5vdCBmb3VuZGApO1xuXHRcdH1cblx0XHRyZXR1cm4gdmlldztcblx0fVxuXG5cdHByaXZhdGUgX2dldFZpZXdJbmZvKHZpZXc6IEJyb3dzZXJWaWV3KTogSUJyb3dzZXJWaWV3SW5mbyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiB2aWV3LmlkLFxuXHRcdFx0b3duZXI6IHZpZXcub3duZXIsXG5cdFx0XHRhc3NvY2lhdGVkUmVzb3VyY2U6IHZpZXcuYXNzb2NpYXRlZFJlc291cmNlLFxuXHRcdFx0c3RhdGU6IHZpZXcuZ2V0U3RhdGUoKVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBnZXRCcm93c2VyVmlld3Mod2luZG93SWQ/OiBudW1iZXIpOiBQcm9taXNlPElCcm93c2VyVmlld0luZm9bXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUJyb3dzZXJWaWV3SW5mb1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBbLCB2aWV3XSBvZiB0aGlzLmJyb3dzZXJWaWV3cykge1xuXHRcdFx0aWYgKHdpbmRvd0lkICE9PSB1bmRlZmluZWQgJiYgdmlldy5vd25lci5tYWluV2luZG93SWQgIT09IHdpbmRvd0lkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2godGhpcy5fZ2V0Vmlld0luZm8odmlldykpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0b25EeW5hbWljRGlkTmF2aWdhdGUoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkub25EaWROYXZpZ2F0ZTtcblx0fVxuXG5cdG9uRHluYW1pY0RpZENoYW5nZUxvYWRpbmdTdGF0ZShpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5vbkRpZENoYW5nZUxvYWRpbmdTdGF0ZTtcblx0fVxuXG5cdG9uRHluYW1pY0RpZENoYW5nZUZvY3VzKGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLm9uRGlkQ2hhbmdlRm9jdXM7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRDaGFuZ2VWaXNpYmlsaXR5KGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eTtcblx0fVxuXG5cdG9uRHluYW1pY0RpZENoYW5nZURldlRvb2xzU3RhdGUoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkub25EaWRDaGFuZ2VEZXZUb29sc1N0YXRlO1xuXHR9XG5cblx0b25EeW5hbWljRGlkS2V5Q29tbWFuZChpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5vbkRpZEtleUNvbW1hbmQ7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRDaGFuZ2VUaXRsZShpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5vbkRpZENoYW5nZVRpdGxlO1xuXHR9XG5cblx0b25EeW5hbWljRGlkQ2hhbmdlRmF2aWNvbihpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5vbkRpZENoYW5nZUZhdmljb247XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRGaW5kSW5QYWdlKGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLm9uRGlkRmluZEluUGFnZTtcblx0fVxuXG5cdG9uRHluYW1pY0RpZENsb3NlKGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLm9uRGlkQ2xvc2U7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRTZWxlY3RFbGVtZW50KGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLmluc3BlY3Rvci5vbkRpZFNlbGVjdEVsZW1lbnQ7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRSZW1vdmVFbGVtZW50Q29tbWVudChpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5pbnNwZWN0b3Iub25EaWRSZW1vdmVFbGVtZW50Q29tbWVudDtcblx0fVxuXG5cdG9uRHluYW1pY0RpZENoYW5nZUVsZW1lbnRTZWxlY3Rpb25TdGF0ZShpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5pbnNwZWN0b3Iub25EaWRDaGFuZ2VFbGVtZW50U2VsZWN0aW9uU3RhdGU7XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRQaWNrQXJlYShpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5pbnNwZWN0b3Iub25EaWRQaWNrQXJlYTtcblx0fVxuXG5cdG9uRHluYW1pY0RpZENoYW5nZUFyZWFTZWxlY3Rpb25BY3RpdmUoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuaW5zcGVjdG9yLm9uRGlkQ2hhbmdlQXJlYVNlbGVjdGlvbkFjdGl2ZTtcblx0fVxuXG5cdG9uRHluYW1pY0RpZENoYW5nZURldmljZUVtdWxhdGlvbihpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5lbXVsYXRvci5vbkRpZENoYW5nZTtcblx0fVxuXG5cdG9uRHluYW1pY0RpZENoYW5nZVJlbW90ZVN0YXR1cyhpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5vbkRpZENoYW5nZVJlbW90ZVN0YXR1cztcblx0fVxuXG5cdG9uRHluYW1pY0RpZFJlcXVlc3RQZXJtaXNzaW9uKGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLm9uRGlkUmVxdWVzdFBlcm1pc3Npb247XG5cdH1cblxuXHRvbkR5bmFtaWNEaWRDaGFuZ2VQZXJtaXNzaW9ucyhpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5vbkRpZENoYW5nZVBlcm1pc3Npb25zO1xuXHR9XG5cblx0YXN5bmMgZ2V0U3RhdGUoaWQ6IHN0cmluZyk6IFByb21pc2U8SUJyb3dzZXJWaWV3U3RhdGU+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLmdldFN0YXRlKCk7XG5cdH1cblxuXHRhc3luYyBkZXN0cm95QnJvd3NlclZpZXcoaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3cy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0fVxuXG5cdGFzeW5jIGxheW91dChpZDogc3RyaW5nLCBib3VuZHM6IElCcm93c2VyVmlld0JvdW5kcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkubGF5b3V0KGJvdW5kcyk7XG5cdH1cblxuXHRhc3luYyBzZXRWaXNpYmxlKGlkOiBzdHJpbmcsIHZpc2libGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLnNldFZpc2libGUodmlzaWJsZSk7XG5cdH1cblxuXHRhc3luYyBsb2FkVVJMKGlkOiBzdHJpbmcsIHVybDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5sb2FkVVJMKHVybCk7XG5cdH1cblxuXHRhc3luYyBnZXRVUkwoaWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5nZXRVUkwoKTtcblx0fVxuXG5cdGFzeW5jIGdvQmFjayhpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5nb0JhY2soKTtcblx0fVxuXG5cdGFzeW5jIGdvRm9yd2FyZChpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5nb0ZvcndhcmQoKTtcblx0fVxuXG5cdGFzeW5jIHJlbG9hZChpZDogc3RyaW5nLCBoYXJkPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkucmVsb2FkKGhhcmQpO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlRGV2VG9vbHMoaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkudG9nZ2xlRGV2VG9vbHMoKTtcblx0fVxuXG5cdGFzeW5jIGNhbkdvQmFjayhpZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5jYW5Hb0JhY2soKTtcblx0fVxuXG5cdGFzeW5jIGNhbkdvRm9yd2FyZChpZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5jYW5Hb0ZvcndhcmQoKTtcblx0fVxuXG5cdGFzeW5jIGNhcHR1cmVTY3JlZW5zaG90KGlkOiBzdHJpbmcsIG9wdGlvbnM/OiBJQnJvd3NlclZpZXdDYXB0dXJlU2NyZWVuc2hvdE9wdGlvbnMpOiBQcm9taXNlPFZTQnVmZmVyPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5jYXB0dXJlU2NyZWVuc2hvdChvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIGZvY3VzKGlkOiBzdHJpbmcsIGZvcmNlPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuZm9jdXMoZm9yY2UpO1xuXHR9XG5cblx0YXN5bmMgZmluZEluUGFnZShpZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcsIG9wdGlvbnM/OiBJQnJvd3NlclZpZXdGaW5kSW5QYWdlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuZmluZEluUGFnZSh0ZXh0LCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHN0b3BGaW5kSW5QYWdlKGlkOiBzdHJpbmcsIGtlZXBTZWxlY3Rpb24/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5zdG9wRmluZEluUGFnZShrZWVwU2VsZWN0aW9uKTtcblx0fVxuXG5cdGFzeW5jIGdldFNlbGVjdGVkVGV4dChpZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLmdldFNlbGVjdGVkVGV4dCgpO1xuXHR9XG5cblx0YXN5bmMgY2xlYXJTdG9yYWdlKGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLmNsZWFyU3RvcmFnZSgpO1xuXHR9XG5cblx0YXN5bmMgc2V0QnJvd3Nlclpvb21JbmRleChpZDogc3RyaW5nLCB6b29tSW5kZXg6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuc2V0QnJvd3Nlclpvb21JbmRleCh6b29tSW5kZXgpO1xuXHR9XG5cblx0YXN5bmMgc2V0RGV2aWNlRW11bGF0aW9uKGlkOiBzdHJpbmcsIGRldmljZTogSUJyb3dzZXJEZXZpY2VQcm9maWxlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5lbXVsYXRvci5zZXREZXZpY2UoZGV2aWNlKTtcblx0fVxuXG5cdGFzeW5jIHRydXN0Q2VydGlmaWNhdGUoaWQ6IHN0cmluZywgaG9zdDogc3RyaW5nLCBmaW5nZXJwcmludDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS50cnVzdENlcnRpZmljYXRlKGhvc3QsIGZpbmdlcnByaW50KTtcblx0fVxuXG5cdGFzeW5jIHVudHJ1c3RDZXJ0aWZpY2F0ZShpZDogc3RyaW5nLCBob3N0OiBzdHJpbmcsIGZpbmdlcnByaW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLnVudHJ1c3RDZXJ0aWZpY2F0ZShob3N0LCBmaW5nZXJwcmludCk7XG5cdH1cblxuXHRhc3luYyBkZWxldGVCcm93c2VySGlzdG9yeShpZDogc3RyaW5nLCBlbnRyeUlkcz86IHJlYWRvbmx5IG51bWJlcltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLnNlc3Npb24uaGlzdG9yeS5kZWxldGUoZW50cnlJZHMpO1xuXHR9XG5cblx0YXN5bmMgc2V0UGVybWlzc2lvbnMoaWQ6IHN0cmluZywgb3JpZ2luOiBzdHJpbmcsIGdyYW50czogcmVhZG9ubHkgSVBlcm1pc3Npb25DYXRlZ29yeVN0YXRlW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuc2Vzc2lvbi5wZXJtaXNzaW9ucy5zZXQob3JpZ2luLCBncmFudHMpO1xuXHR9XG5cblx0YXN5bmMgc2VsZWN0RGV2aWNlKGlkOiBzdHJpbmcsIHJlcXVlc3RJZDogc3RyaW5nLCBkZXZpY2VJZDogc3RyaW5nIHwgbnVsbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5zZWxlY3REZXZpY2UocmVxdWVzdElkLCBkZXZpY2VJZCk7XG5cdH1cblxuXHRhc3luYyBjbGVhckdsb2JhbFN0b3JhZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYnJvd3NlclNlc3Npb24gPSBCcm93c2VyU2Vzc2lvbi5nZXRPckNyZWF0ZUdsb2JhbCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRicm93c2VyU2Vzc2lvbi5jb25uZWN0U3RvcmFnZSh0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlKTtcblx0XHRhd2FpdCBicm93c2VyU2Vzc2lvbi5jbGVhckRhdGEoKTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyV29ya3NwYWNlU3RvcmFnZSh3b3Jrc3BhY2VJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYnJvd3NlclNlc3Npb24gPSBCcm93c2VyU2Vzc2lvbi5nZXRPckNyZWF0ZVdvcmtzcGFjZShcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHR3b3Jrc3BhY2VJZCxcblx0XHRcdHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS53b3Jrc3BhY2VTdG9yYWdlSG9tZVxuXHRcdCk7XG5cdFx0YnJvd3NlclNlc3Npb24uY29ubmVjdFN0b3JhZ2UodGhpcy5hcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSk7XG5cdFx0YXdhaXQgYnJvd3NlclNlc3Npb24uY2xlYXJEYXRhKCk7XG5cdH1cblxuXHRhc3luYyBnZXRDb25zb2xlTG9ncyhpZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QnJvd3NlclZpZXcoaWQpLmdldENvbnNvbGVMb2dzKCk7XG5cdH1cblxuXHRhc3luYyB0b2dnbGVFbGVtZW50U2VsZWN0aW9uKGlkOiBzdHJpbmcsIGVuYWJsZWQ/OiBib29sZWFuLCBvcHRpb25zPzogSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCcm93c2VyVmlldyhpZCkuaW5zcGVjdG9yLnRvZ2dsZUVsZW1lbnRTZWxlY3Rpb24oZW5hYmxlZCwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBzZXRFbGVtZW50Q29tbWVudHMoaWQ6IHN0cmluZywgdXBkYXRlOiBJQnJvd3NlckVsZW1lbnRDb21tZW50c1VwZGF0ZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5pbnNwZWN0b3Iuc2V0RWxlbWVudENvbW1lbnRzKHVwZGF0ZSk7XG5cdH1cblxuXHRhc3luYyB0b2dnbGVBcmVhU2VsZWN0aW9uKGlkOiBzdHJpbmcsIGVuYWJsZWQ/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJyb3dzZXJWaWV3KGlkKS5pbnNwZWN0b3IudG9nZ2xlQXJlYVNlbGVjdGlvbihlbmFibGVkKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVdpbmRvd0NvbmZpZ3VyYXRpb24od2luZG93SWQ6IG51bWJlciwgY29uZmlnOiBJQnJvd3NlclZpZXdXaW5kb3dDb25maWd1cmF0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb2xkQ29uZmlnID0gdGhpcy5fd2luZG93Q29uZmlndXJhdGlvbnMuZ2V0KHdpbmRvd0lkKTtcblx0XHRjb25zdCBkaWRUaGVtZUNoYW5nZSA9ICFlcXVhbHMob2xkQ29uZmlnPy50aGVtZSwgY29uZmlnLnRoZW1lKTtcblx0XHRjb25zdCBkaWRQcm94eUNoYW5nZSA9ICFlcXVhbHMob2xkQ29uZmlnPy5wcm94eUluZm8sIGNvbmZpZy5wcm94eUluZm8pO1xuXG5cdFx0dGhpcy5fd2luZG93Q29uZmlndXJhdGlvbnMuc2V0KHdpbmRvd0lkLCBjb25maWcpO1xuXHRcdHRoaXMuX2Vuc3VyZVdpbmRvd0Nsb3NlU3Vic2NyaXB0aW9uKHdpbmRvd0lkKTtcblxuXHRcdGZvciAoY29uc3QgWywgdmlld10gb2YgdGhpcy5icm93c2VyVmlld3MpIHtcblx0XHRcdGlmICh2aWV3Lm93bmVyLm1haW5XaW5kb3dJZCA9PT0gd2luZG93SWQpIHtcblx0XHRcdFx0aWYgKGRpZFRoZW1lQ2hhbmdlKSB7XG5cdFx0XHRcdFx0dmlldy5pbnNwZWN0b3Iuc2V0VGhlbWUoY29uZmlnLnRoZW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZGlkUHJveHlDaGFuZ2UpIHtcblx0XHRcdFx0XHR2aWV3LnNlc3Npb24ucmVtb3RlLmFjcXVpcmUodmlldy5pZCwgY29uZmlnLnByb3h5SW5mbyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHR5cGVvZiBjb25maWcubWF4SGlzdG9yeUVudHJpZXMgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0dmlldy5zZXNzaW9uLmhpc3Rvcnkuc2V0TWF4RW50cmllcyhjb25maWcubWF4SGlzdG9yeUVudHJpZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVjb21wdXRlVHJ1c3RlZEZpbGVSb290cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlV2luZG93Q2xvc2VTdWJzY3JpcHRpb24od2luZG93SWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93aW5kb3dDbG9zZVN1YnNjcmlwdGlvbnMuaGFzKHdpbmRvd0lkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB3aW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dCeUlkKHdpbmRvd0lkKTtcblx0XHRpZiAoIXdpbmRvdykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBvbldpbmRvd0dvbmUgPSBFdmVudC5hbnkod2luZG93Lm9uRGlkQ2xvc2UsIHdpbmRvdy5vbkRpZERlc3Ryb3kpO1xuXHRcdHRoaXMuX3dpbmRvd0Nsb3NlU3Vic2NyaXB0aW9ucy5zZXQod2luZG93SWQsIEV2ZW50Lm9uY2Uob25XaW5kb3dHb25lKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl93aW5kb3dDbG9zZVN1YnNjcmlwdGlvbnMuZGVsZXRlQW5kRGlzcG9zZSh3aW5kb3dJZCk7XG5cdFx0XHRpZiAodGhpcy5fd2luZG93Q29uZmlndXJhdGlvbnMuZGVsZXRlKHdpbmRvd0lkKSkge1xuXHRcdFx0XHR0aGlzLl9yZWNvbXB1dGVUcnVzdGVkRmlsZVJvb3RzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb21wdXRlVHJ1c3RlZEZpbGVSb290cygpOiB2b2lkIHtcblx0XHRjb25zdCByb290cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGxldCB0cnVzdEFsbEZpbGVzID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBjb25maWd1cmF0aW9uIG9mIHRoaXMuX3dpbmRvd0NvbmZpZ3VyYXRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJvb3Qgb2YgY29uZmlndXJhdGlvbi50cnVzdGVkRmlsZVJvb3RzKSB7XG5cdFx0XHRcdHJvb3RzLmFkZChyb290KTtcblx0XHRcdH1cblx0XHRcdHRydXN0QWxsRmlsZXMgfHw9IGNvbmZpZ3VyYXRpb24udHJ1c3RBbGxGaWxlcztcblx0XHR9XG5cdFx0QnJvd3NlclNlc3Npb24uc2V0VHJ1c3RlZEZpbGVSb290cyhbLi4ucm9vdHNdLCB0cnVzdEFsbEZpbGVzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBicm93c2VyIHZpZXcgYmFja2VkIGJ5IHRoZSBnaXZlbiB7QGxpbmsgQnJvd3NlclNlc3Npb259LlxuXHQgKi9cblx0cHJpdmF0ZSBjcmVhdGVCcm93c2VyVmlldyhpZDogc3RyaW5nLCBvd25lcjogSUJyb3dzZXJWaWV3T3duZXIsIGJyb3dzZXJTZXNzaW9uOiBCcm93c2VyU2Vzc2lvbiwgYXNzb2NpYXRlZFJlc291cmNlPzogVVJJLCBvcHRpb25zPzogRWxlY3Ryb24uV2ViQ29udGVudHNWaWV3Q29uc3RydWN0b3JPcHRpb25zKTogQnJvd3NlclZpZXcge1xuXHRcdGlmICh0aGlzLmJyb3dzZXJWaWV3cy5oYXMoaWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEJyb3dzZXIgdmlldyB3aXRoIGlkICR7aWR9IGFscmVhZHkgZXhpc3RzYCk7XG5cdFx0fVxuXG5cdFx0YnJvd3NlclNlc3Npb24uY29ubmVjdFN0b3JhZ2UodGhpcy5hcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSk7XG5cdFx0Y29uc3Qgd2luZG93Q29uZmlndXJhdGlvbiA9IHRoaXMuX3dpbmRvd0NvbmZpZ3VyYXRpb25zLmdldChvd25lci5tYWluV2luZG93SWQpO1xuXHRcdGlmICh0eXBlb2Ygd2luZG93Q29uZmlndXJhdGlvbj8ubWF4SGlzdG9yeUVudHJpZXMgPT09ICdudW1iZXInKSB7XG5cdFx0XHRicm93c2VyU2Vzc2lvbi5oaXN0b3J5LnNldE1heEVudHJpZXMod2luZG93Q29uZmlndXJhdGlvbi5tYXhIaXN0b3J5RW50cmllcyk7XG5cdFx0fVxuXG5cdFx0Ly8gSG9sZCBhIHJlZiB0byB0aGUgdHVubmVsIHByb3h5IGZvciBhcyBsb25nIGFzIHRoaXMgdmlldyBpcyBhbGl2ZS5cblx0XHRicm93c2VyU2Vzc2lvbi5yZW1vdGUuYWNxdWlyZShpZCwgd2luZG93Q29uZmlndXJhdGlvbj8ucHJveHlJbmZvKTtcblxuXHRcdGNvbnN0IHZpZXcgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0QnJvd3NlclZpZXcsXG5cdFx0XHRpZCxcblx0XHRcdG93bmVyLFxuXHRcdFx0YXNzb2NpYXRlZFJlc291cmNlLFxuXHRcdFx0YnJvd3NlclNlc3Npb24sXG5cdFx0XHQvLyBSZWN1cnNpdmUgZmFjdG9yeSBmb3IgbmVzdGVkIHdpbmRvd3MgKGNoaWxkIHZpZXdzIHNoYXJlIHRoZSBzYW1lIHNlc3Npb24gYW5kIG93bmVyKS5cblx0XHRcdCh1cmwsIGVsZWN0cm9uT3B0aW9ucywgb3Blbk9wdGlvbnMpID0+IHtcblx0XHRcdFx0Y29uc3QgY2hpbGQgPSB0aGlzLmNyZWF0ZUJyb3dzZXJWaWV3KGdlbmVyYXRlVXVpZCgpLCBvd25lciwgYnJvd3NlclNlc3Npb24sIHVuZGVmaW5lZCwgZWxlY3Ryb25PcHRpb25zKTtcblxuXHRcdFx0XHRpZiAodXJsKSB7XG5cdFx0XHRcdFx0dm9pZCBjaGlsZC5sb2FkVVJMKHVybCkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9nZXRWaWV3SW5mbyhjaGlsZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ3JlYXRlQnJvd3NlclZpZXcuZmlyZSh7XG5cdFx0XHRcdFx0aW5mbzogdXJsID8geyAuLi5pbmZvLCBzdGF0ZTogeyAuLi5pbmZvLnN0YXRlLCB1cmwgfSB9IDogaW5mbyxcblx0XHRcdFx0XHRvcGVuT3B0aW9uc1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRyZXR1cm4gY2hpbGQ7XG5cdFx0XHR9LFxuXHRcdFx0KHYsIHBhcmFtcykgPT4gdGhpcy5zaG93Q29udGV4dE1lbnUodiwgcGFyYW1zKSxcblx0XHRcdG9wdGlvbnNcblx0XHQpO1xuXHRcdHRoaXMuYnJvd3NlclZpZXdzLnNldChpZCwgdmlldyk7XG5cdFx0aWYgKHdpbmRvd0NvbmZpZ3VyYXRpb24/LnRoZW1lKSB7XG5cdFx0XHR2aWV3Lmluc3BlY3Rvci5zZXRUaGVtZSh3aW5kb3dDb25maWd1cmF0aW9uLnRoZW1lKTtcblx0XHR9XG5cblx0XHRFdmVudC5vbmNlKHZpZXcub25EaWRDbG9zZSkoKCkgPT4ge1xuXHRcdFx0YnJvd3NlclNlc3Npb24ucmVtb3RlLnJlbGVhc2UoaWQpO1xuXHRcdFx0dGhpcy5icm93c2VyVmlld3MuZGVsZXRlQW5kRGlzcG9zZShpZCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdmlldztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3Blbk5ldyhcblx0XHR1cmw6IHN0cmluZyxcblx0XHR7XG5cdFx0XHRvd25lcixcblx0XHRcdHNlc3Npb24sXG5cdFx0XHRvcGVuT3B0aW9ucyxcblx0XHRcdHNvdXJjZVxuXHRcdH06IHtcblx0XHRcdG93bmVyOiBJQnJvd3NlclZpZXdPd25lcjtcblx0XHRcdHNlc3Npb246IEJyb3dzZXJTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0b3Blbk9wdGlvbnM6IElCcm93c2VyVmlld09wZW5PcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRcdFx0c291cmNlOiBJbnRlZ3JhdGVkQnJvd3Nlck9wZW5Tb3VyY2U7XG5cdFx0fVxuXHQpOiBQcm9taXNlPEJyb3dzZXJWaWV3PiB7XG5cdFx0Y29uc3QgdGFyZ2V0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCB2aWV3ID0gdGhpcy5jcmVhdGVCcm93c2VyVmlldyh0YXJnZXRJZCwgb3duZXIsIHNlc3Npb24gfHwgQnJvd3NlclNlc3Npb24uZ2V0T3JDcmVhdGVFcGhlbWVyYWwodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGFyZ2V0SWQpKTtcblxuXHRcdGlmICh1cmwpIHtcblx0XHRcdHZvaWQgdmlldy5sb2FkVVJMKHVybCkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHR9XG5cblx0XHRsb2dCcm93c2VyT3Blbih0aGlzLnRlbGVtZXRyeVNlcnZpY2UsIHNvdXJjZSk7XG5cblx0XHQvLyBGaXJlIGNyZWF0aW9uIGV2ZW50IHNvIHRoZSB3b3JrYmVuY2ggY2FuIG9wZW4gYW4gZWRpdG9yIHRhYlxuXHRcdGNvbnN0IGluZm8gPSB0aGlzLl9nZXRWaWV3SW5mbyh2aWV3KTtcblx0XHR0aGlzLl9vbkRpZENyZWF0ZUJyb3dzZXJWaWV3LmZpcmUoe1xuXHRcdFx0aW5mbzogdXJsID8geyAuLi5pbmZvLCBzdGF0ZTogeyAuLi5pbmZvLnN0YXRlLCB1cmwgfSB9IDogaW5mbyxcblx0XHRcdG9wZW5PcHRpb25zXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdmlldztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0NvbnRleHRNZW51KHZpZXc6IEJyb3dzZXJWaWV3LCBwYXJhbXM6IEVsZWN0cm9uLkNvbnRleHRNZW51UGFyYW1zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2luID0gdmlldy5nZXRFbGVjdHJvbldpbmRvdygpO1xuXHRcdGlmICghd2luKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHdlYkNvbnRlbnRzID0gdmlldy53ZWJDb250ZW50cztcblx0XHRpZiAod2ViQ29udGVudHMuaXNEZXN0cm95ZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpbmRvd0NvbmZpZ3VyYXRpb24gPSB0aGlzLl93aW5kb3dDb25maWd1cmF0aW9ucy5nZXQodmlldy5vd25lci5tYWluV2luZG93SWQpO1xuXHRcdGNvbnN0IGluc3BlY3RUYXJnZXQgPSB3aW5kb3dDb25maWd1cmF0aW9uPy5haUZlYXR1cmVzRGlzYWJsZWRcblx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHQ6IHBhcmFtcy5mcmFtZSAmJiBhd2FpdCB2aWV3Lmluc3BlY3Rvci5nZXRFbGVtZW50SGFuZGxlKEJyb3dzZXJWaWV3SW5zcGVjdEVsZW1lbnRJZC5Db250ZXh0TWVudVRhcmdldCwgcGFyYW1zLmZyYW1lKTtcblx0XHRjb25zdCBtZW51ID0gbmV3IE1lbnUoKTtcblxuXHRcdGlmIChwYXJhbXMubGlua1VSTCkge1xuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmNvbnRleHRNZW51Lm9wZW5MaW5rSW5OZXdUYWInLCAnT3BlbiBMaW5rIGluIE5ldyBUYWInKSxcblx0XHRcdFx0Y2xpY2s6ICgpID0+IHtcblx0XHRcdFx0XHR2b2lkIHRoaXMub3Blbk5ldyhwYXJhbXMubGlua1VSTCwge1xuXHRcdFx0XHRcdFx0b3duZXI6IHZpZXcub3duZXIsXG5cdFx0XHRcdFx0XHRzZXNzaW9uOiB2aWV3LnNlc3Npb24sXG5cdFx0XHRcdFx0XHRvcGVuT3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlLCBiYWNrZ3JvdW5kOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHRzb3VyY2U6ICdicm93c2VyTGlua0JhY2tncm91bmQnXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdG1lbnUuYXBwZW5kKG5ldyBNZW51SXRlbSh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYnJvd3Nlci5jb250ZXh0TWVudS5vcGVuTGlua0luRXh0ZXJuYWxCcm93c2VyJywgJ09wZW4gTGluayBpbiBFeHRlcm5hbCBCcm93c2VyJyksXG5cdFx0XHRcdGNsaWNrOiAoKSA9PiB7IHZvaWQgdGhpcy5uYXRpdmVIb3N0TWFpblNlcnZpY2Uub3BlbkV4dGVybmFsKHVuZGVmaW5lZCwgcGFyYW1zLmxpbmtVUkwpOyB9XG5cdFx0XHR9KSk7XG5cdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oeyB0eXBlOiAnc2VwYXJhdG9yJyB9KSk7XG5cdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuY29udGV4dE1lbnUuY29weUxpbmsnLCAnQ29weSBMaW5rJyksXG5cdFx0XHRcdGNsaWNrOiAoKSA9PiB7XG5cdFx0XHRcdFx0Y2xpcGJvYXJkLndyaXRlKHtcblx0XHRcdFx0XHRcdHRleHQ6IHBhcmFtcy5saW5rVVJMLFxuXHRcdFx0XHRcdFx0aHRtbDogYDxhIGhyZWY9XCIke2VuY29kZVVSSShwYXJhbXMubGlua1VSTCl9XCI+JHtodG1sQXR0cmlidXRlRW5jb2RlVmFsdWUocGFyYW1zLmxpbmtUZXh0IHx8IHBhcmFtcy5saW5rVVJMKX08L2E+YFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKHBhcmFtcy5oYXNJbWFnZUNvbnRlbnRzICYmIHBhcmFtcy5zcmNVUkwpIHtcblx0XHRcdGlmIChtZW51Lml0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHsgdHlwZTogJ3NlcGFyYXRvcicgfSkpO1xuXHRcdFx0fVxuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmNvbnRleHRNZW51Lm9wZW5JbWFnZUluTmV3VGFiJywgJ09wZW4gSW1hZ2UgaW4gTmV3IFRhYicpLFxuXHRcdFx0XHRjbGljazogKCkgPT4ge1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5vcGVuTmV3KHBhcmFtcy5zcmNVUkwhLCB7XG5cdFx0XHRcdFx0XHRvd25lcjogdmlldy5vd25lcixcblx0XHRcdFx0XHRcdHNlc3Npb246IHZpZXcuc2Vzc2lvbixcblx0XHRcdFx0XHRcdG9wZW5PcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRydWUsIGJhY2tncm91bmQ6IHRydWUgfSxcblx0XHRcdFx0XHRcdHNvdXJjZTogJ2Jyb3dzZXJMaW5rQmFja2dyb3VuZCdcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmNvbnRleHRNZW51LmNvcHlJbWFnZScsICdDb3B5IEltYWdlJyksXG5cdFx0XHRcdGNsaWNrOiAoKSA9PiB7IHZpZXcud2ViQ29udGVudHMuY29weUltYWdlQXQocGFyYW1zLngsIHBhcmFtcy55KTsgfVxuXHRcdFx0fSkpO1xuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmNvbnRleHRNZW51LmNvcHlJbWFnZVVybCcsICdDb3B5IEltYWdlIFVSTCcpLFxuXHRcdFx0XHRjbGljazogKCkgPT4geyBjbGlwYm9hcmQud3JpdGVUZXh0KHBhcmFtcy5zcmNVUkwhKTsgfVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmIChwYXJhbXMuaXNFZGl0YWJsZSkge1xuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHsgcm9sZTogJ2N1dCcsIGVuYWJsZWQ6IHBhcmFtcy5lZGl0RmxhZ3MuY2FuQ3V0IH0pKTtcblx0XHRcdG1lbnUuYXBwZW5kKG5ldyBNZW51SXRlbSh7IHJvbGU6ICdjb3B5JywgZW5hYmxlZDogcGFyYW1zLmVkaXRGbGFncy5jYW5Db3B5IH0pKTtcblx0XHRcdG1lbnUuYXBwZW5kKG5ldyBNZW51SXRlbSh7IHJvbGU6ICdwYXN0ZScsIGVuYWJsZWQ6IHBhcmFtcy5lZGl0RmxhZ3MuY2FuUGFzdGUgfSkpO1xuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHsgcm9sZTogJ3Bhc3RlQW5kTWF0Y2hTdHlsZScsIGVuYWJsZWQ6IHBhcmFtcy5lZGl0RmxhZ3MuY2FuUGFzdGUgfSkpO1xuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHsgcm9sZTogJ3NlbGVjdEFsbCcsIGVuYWJsZWQ6IHBhcmFtcy5lZGl0RmxhZ3MuY2FuU2VsZWN0QWxsIH0pKTtcblx0XHR9IGVsc2UgaWYgKHBhcmFtcy5zZWxlY3Rpb25UZXh0KSB7XG5cdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oeyByb2xlOiAnY29weScgfSkpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBuYXZpZ2F0aW9uIGl0ZW1zIGFzIGRlZmF1bHRzXG5cdFx0aWYgKG1lbnUuaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRpZiAod2ViQ29udGVudHMubmF2aWdhdGlvbkhpc3RvcnkuY2FuR29CYWNrKCkpIHtcblx0XHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuY29udGV4dE1lbnUuYmFjaycsICdCYWNrJyksXG5cdFx0XHRcdFx0YWNjZWxlcmF0b3I6IHdpbmRvd0NvbmZpZ3VyYXRpb24/LmtleWJpbmRpbmdzW0Jyb3dzZXJWaWV3Q29tbWFuZElkLkdvQmFja10sXG5cdFx0XHRcdFx0Y2xpY2s6ICgpID0+IHdlYkNvbnRlbnRzLm5hdmlnYXRpb25IaXN0b3J5LmdvQmFjaygpXG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdGlmICh3ZWJDb250ZW50cy5uYXZpZ2F0aW9uSGlzdG9yeS5jYW5Hb0ZvcndhcmQoKSkge1xuXHRcdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYnJvd3Nlci5jb250ZXh0TWVudS5mb3J3YXJkJywgJ0ZvcndhcmQnKSxcblx0XHRcdFx0XHRhY2NlbGVyYXRvcjogd2luZG93Q29uZmlndXJhdGlvbj8ua2V5YmluZGluZ3NbQnJvd3NlclZpZXdDb21tYW5kSWQuR29Gb3J3YXJkXSxcblx0XHRcdFx0XHRjbGljazogKCkgPT4gd2ViQ29udGVudHMubmF2aWdhdGlvbkhpc3RvcnkuZ29Gb3J3YXJkKClcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0bWVudS5hcHBlbmQobmV3IE1lbnVJdGVtKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmNvbnRleHRNZW51LnJlbG9hZCcsICdSZWxvYWQnKSxcblx0XHRcdFx0YWNjZWxlcmF0b3I6IHdpbmRvd0NvbmZpZ3VyYXRpb24/LmtleWJpbmRpbmdzW0Jyb3dzZXJWaWV3Q29tbWFuZElkLlJlbG9hZF0sXG5cdFx0XHRcdGNsaWNrOiAoKSA9PiB3ZWJDb250ZW50cy5yZWxvYWQoKVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmIChpbnNwZWN0VGFyZ2V0KSB7XG5cdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oeyB0eXBlOiAnc2VwYXJhdG9yJyB9KSk7XG5cdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuY29udGV4dE1lbnUuYWRkRWxlbWVudFRvQ2hhdCcsICdBZGQgRWxlbWVudCB0byBDaGF0JyksXG5cdFx0XHRcdGNsaWNrOiAoKSA9PiBpbnNwZWN0VGFyZ2V0LmFkZFRvQ2hhdCgpXG5cdFx0XHR9KSk7XG5cdFx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuY29udGV4dE1lbnUuYWRkQ29tbWVudCcsICdBZGQgQ29tbWVudC4uLicpLFxuXHRcdFx0XHRjbGljazogKCkgPT4gaW5zcGVjdFRhcmdldC5hZGRDb21tZW50KClcblx0XHRcdH0pKTtcblx0XHRcdHZvaWQgaW5zcGVjdFRhcmdldC5oaWdobGlnaHQoKS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdFx0bWVudS5vbignbWVudS13aWxsLWNsb3NlJywgKCkgPT4gaW5zcGVjdFRhcmdldC5kaXNwb3NlKCkpO1xuXHRcdH1cblxuXHRcdG1lbnUuYXBwZW5kKG5ldyBNZW51SXRlbSh7IHR5cGU6ICdzZXBhcmF0b3InIH0pKTtcblx0XHRtZW51LmFwcGVuZChuZXcgTWVudUl0ZW0oe1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmNvbnRleHRNZW51Lmluc3BlY3QnLCAnSW5zcGVjdCcpLFxuXHRcdFx0Y2xpY2s6ICgpID0+IHdlYkNvbnRlbnRzLmluc3BlY3RFbGVtZW50KHBhcmFtcy54LCBwYXJhbXMueSlcblx0XHR9KSk7XG5cblx0XHRjb25zdCB2aWV3Qm91bmRzID0gdmlldy5nZXRXZWJDb250ZW50c1ZpZXcoKS5nZXRCb3VuZHMoKTtcblx0XHRtZW51LnBvcHVwKHtcblx0XHRcdHdpbmRvdzogd2luLFxuXHRcdFx0eDogdmlld0JvdW5kcy54ICsgcGFyYW1zLngsXG5cdFx0XHR5OiB2aWV3Qm91bmRzLnkgKyBwYXJhbXMueSxcblx0XHRcdHNvdXJjZVR5cGU6IHBhcmFtcy5tZW51U291cmNlVHlwZVxuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxxQkFBcUI7QUFFMUMsU0FBME0sNEJBQXVNO0FBQ2paLFNBQVMsV0FBVyxNQUFNLGdCQUFnQjtBQUMxQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGlCQUFpQiw2QkFBNkI7QUFDdkQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkI7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
