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
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { Emitter } from "../../../../base/common/event.js";
import { structuralEquals } from "../../../../base/common/equals.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { localize } from "../../../../nls.js";
import { IPlaywrightService } from "../../../../platform/browserView/common/playwrightService.js";
import {
  BrowserHistoryStore
} from "../../../../platform/browserView/common/browserHistory.js";
import {
  BrowserPermissionStore
} from "../../../../platform/browserView/common/browserPermissions.js";
import {
  BrowserViewStorageScope,
  browserZoomDefaultIndex,
  browserZoomFactors
} from "../../../../platform/browserView/common/browserView.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isLocalhostAuthority } from "../../../../platform/url/common/trustedDomains.js";
import { IAgentNetworkFilterService } from "../../../../platform/networkFilter/common/networkFilterService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IBrowserZoomService } from "./browserZoomService.js";
var BrowserViewSharingState = /* @__PURE__ */ ((BrowserViewSharingState2) => {
  BrowserViewSharingState2["Shared"] = "shared";
  BrowserViewSharingState2["NotShared"] = "notShared";
  BrowserViewSharingState2["Unavailable"] = "unavailable";
  return BrowserViewSharingState2;
})(BrowserViewSharingState || {});
function browserViewUrlMatches(candidateUrl, targetUrl, includeBlank = false) {
  const target = URL.parse(targetUrl);
  if (!target || target.protocol !== "file:" && !target.host) {
    return false;
  }
  if (includeBlank && (!candidateUrl || candidateUrl === "about:blank")) {
    return true;
  }
  const candidate = URL.parse(candidateUrl ?? "");
  return candidate?.host === target.host || target.protocol === "file:" && candidate?.protocol === "file:" || !!(candidate?.host && target.host && (candidate.host.endsWith("." + target.host) || target.host.endsWith("." + candidate.host)));
}
function parseZoomHost(url) {
  const parsed = URL.parse(url);
  if (!parsed?.host || parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return void 0;
  }
  return parsed.host;
}
function parseHistorySnapshot(raw) {
  if (!raw) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return void 0;
    }
    return parsed;
  } catch {
    return void 0;
  }
}
const IBrowserViewWorkbenchService = createDecorator("browserViewWorkbenchService");
const BrowserViewEditorId = "workbench.editor.browser";
const IBrowserViewCDPService = createDecorator("browserViewCDPService");
let BrowserViewModel = class extends Disposable {
  constructor(id, owner, associatedResource, initialState, browserViewService, browserViewWorkbenchService, telemetryService, playwrightService, dialogService, storageService, zoomService, agentNetworkFilterService, logService) {
    super();
    this.id = id;
    this.owner = owner;
    this.associatedResource = associatedResource;
    this.browserViewService = browserViewService;
    this.browserViewWorkbenchService = browserViewWorkbenchService;
    this.telemetryService = telemetryService;
    this.playwrightService = playwrightService;
    this.dialogService = dialogService;
    this.storageService = storageService;
    this.zoomService = zoomService;
    this.agentNetworkFilterService = agentNetworkFilterService;
    this.logService = logService;
    this._url = "";
    this._title = "";
    this._favicon = void 0;
    this._screenshot = void 0;
    this._loading = false;
    this._focused = false;
    this._visible = false;
    this._isDevToolsOpen = false;
    this._canGoBack = false;
    this._canGoForward = false;
    this._error = void 0;
    this._certificateError = void 0;
    this._storageScope = BrowserViewStorageScope.Ephemeral;
    this._isRemoteSession = false;
    this._isEphemeral = false;
    this._zoomHost = void 0;
    this._sharedWithAgent = false;
    this._browserZoomIndex = browserZoomDefaultIndex;
    this._elementSelectionState = { active: false, options: {} };
    this._isAreaSelectionActive = false;
    this.history = this._register(new BrowserHistoryStore());
    this.permissions = this._register(new BrowserPermissionStore());
    this._onDidChangeDevice = this._register(new Emitter());
    this.onDidChangeDevice = this._onDidChangeDevice.event;
    this._onDidChangeSharingState = this._register(new Emitter());
    this.onDidChangeSharingState = this._onDidChangeSharingState.event;
    this._onDidChangeZoom = this._register(new Emitter());
    this.onDidChangeZoom = this._onDidChangeZoom.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._onWillNavigate = this._register(new Emitter());
    this.onWillNavigate = this._onWillNavigate.event;
    this._url = initialState.url;
    this._title = initialState.title;
    this._loading = initialState.loading;
    this._focused = initialState.focused;
    this._visible = initialState.visible;
    this._isDevToolsOpen = initialState.isDevToolsOpen;
    this._canGoBack = initialState.canGoBack;
    this._canGoForward = initialState.canGoForward;
    this._screenshot = initialState.lastScreenshot;
    this._favicon = initialState.lastFavicon;
    this._error = initialState.lastError;
    this._certificateError = initialState.certificateError;
    this._storageScope = initialState.storageScope;
    this._isRemoteSession = initialState.isRemoteSession;
    this._browserZoomIndex = initialState.browserZoomIndex;
    this._elementSelectionState = initialState.elementSelectionState;
    this._isAreaSelectionActive = initialState.isAreaSelectionActive;
    this._device = initialState.device;
    this._isEphemeral = this._storageScope === BrowserViewStorageScope.Ephemeral;
    this._zoomHost = parseZoomHost(this._url);
    const { history: entriesKey, favicons: faviconsKey } = initialState.storageKeys;
    if (entriesKey) {
      this._reloadHistoryEntries(entriesKey);
      this._register(this.storageService.onDidChangeValue(
        StorageScope.APPLICATION,
        entriesKey,
        this._store
      )(() => this._reloadHistoryEntries(entriesKey)));
    }
    if (faviconsKey) {
      this._reloadHistoryFavicons(faviconsKey);
      this._register(this.storageService.onDidChangeValue(
        StorageScope.APPLICATION,
        faviconsKey,
        this._store
      )(() => this._reloadHistoryFavicons(faviconsKey)));
    }
    this.permissions.hydrate(initialState.permissions);
    this._register(this.browserViewService.onDynamicDidChangePermissions(this.id)(
      (snapshot) => this.permissions.hydrate(snapshot)
    ));
    const effectiveZoomIndex = this.zoomService.getEffectiveZoomIndex(this._zoomHost, this._isEphemeral);
    if (effectiveZoomIndex !== this._browserZoomIndex) {
      void this.setBrowserZoomIndex(effectiveZoomIndex).catch((e) => {
        this.logService.warn(`[BrowserViewModel] Failed to set initial zoom:`, e);
      });
    }
    void this.playwrightService.isPageTracked(this.id).then((shared) => this._setSharedWithAgent(shared)).catch((e) => {
      this.logService.warn(`[BrowserViewModel] Failed to check initial page tracking:`, e);
    });
    this._register(this.zoomService.onDidChangeZoom(({ host, isEphemeralChange }) => {
      if (isEphemeralChange && !this._isEphemeral) {
        return;
      }
      if (host === void 0 || host === this._zoomHost) {
        void this.setBrowserZoomIndex(
          this.zoomService.getEffectiveZoomIndex(this._zoomHost, this._isEphemeral)
        ).catch(() => {
        });
      }
    }));
    this._register(this.onDidNavigate((e) => {
      if (URL.parse(e.url)?.host !== URL.parse(this._url)?.host) {
        this._favicon = void 0;
      }
      this._zoomHost = parseZoomHost(e.url);
      this._url = e.url;
      this._title = e.title;
      this._canGoBack = e.canGoBack;
      this._canGoForward = e.canGoForward;
      this._certificateError = e.certificateError;
      void this.setBrowserZoomIndex(
        this.zoomService.getEffectiveZoomIndex(this._zoomHost, this._isEphemeral),
        true
      );
    }));
    this._register(this.onDidChangeLoadingState((e) => {
      this._loading = e.loading;
      this._error = e.error;
    }));
    this._register(this.onDidChangeDevToolsState((e) => {
      this._isDevToolsOpen = e.isDevToolsOpen;
    }));
    this._register(this.onDidChangeTitle((e) => {
      this._title = e.title;
    }));
    this._register(this.onDidChangeFavicon((e) => {
      this._favicon = e.favicon;
    }));
    this._register(this.onDidChangeFocus(({ focused }) => {
      this._focused = focused;
    }));
    this._register(this.onDidChangeVisibility(({ visible }) => {
      this._visible = visible;
    }));
    this._register(this.browserViewService.onDynamicDidChangeDeviceEmulation(this.id)((device) => {
      if (!structuralEquals(this._device, device)) {
        this._device = device;
        this._onDidChangeDevice.fire(device);
      }
    }));
    this._register(this.onDidChangeElementSelectionState((state) => {
      if (state.active && !this._elementSelectionState.active) {
        this.telemetryService.publicLog2("integratedBrowser.addElementToChat.start", {});
      }
      this._elementSelectionState = state;
    }));
    this._register(this.onDidChangeAreaSelectionActive((active) => {
      this._isAreaSelectionActive = active;
    }));
    this._register(this.playwrightService.onDidChangeTrackedPages((ids) => {
      this._setSharedWithAgent(ids.includes(this.id));
    }));
    this._register(this.browserViewWorkbenchService.onDidChangeSharingAvailable(() => {
      this._onDidChangeSharingState.fire(this.sharingState);
    }));
    this._register(this.onDidChangeRemoteStatus((isRemoteSession) => {
      this._isRemoteSession = isRemoteSession;
    }));
  }
  get url() {
    return this._url;
  }
  get title() {
    return this._title;
  }
  get favicon() {
    return this._favicon;
  }
  get loading() {
    return this._loading;
  }
  get focused() {
    return this._focused;
  }
  get visible() {
    return this._visible;
  }
  get isDevToolsOpen() {
    return this._isDevToolsOpen;
  }
  get canGoBack() {
    return this._canGoBack;
  }
  get canGoForward() {
    return this._canGoForward;
  }
  get screenshot() {
    return this._screenshot;
  }
  get error() {
    return this._error;
  }
  get certificateError() {
    return this._certificateError;
  }
  get storageScope() {
    return this._storageScope;
  }
  get isRemoteSession() {
    return this._isRemoteSession;
  }
  get sharingState() {
    if (!this.browserViewWorkbenchService.isSharingAvailable) {
      return "unavailable" /* Unavailable */;
    }
    return this._sharedWithAgent ? "shared" /* Shared */ : "notShared" /* NotShared */;
  }
  get zoomFactor() {
    return browserZoomFactors[this._browserZoomIndex];
  }
  get canZoomIn() {
    return this._browserZoomIndex < browserZoomFactors.length - 1;
  }
  get canZoomOut() {
    return this._browserZoomIndex > 0;
  }
  get elementSelectionState() {
    return this._elementSelectionState;
  }
  get isAreaSelectionActive() {
    return this._isAreaSelectionActive;
  }
  get device() {
    return this._device;
  }
  get onDidNavigate() {
    return this.browserViewService.onDynamicDidNavigate(this.id);
  }
  get onDidChangeLoadingState() {
    return this.browserViewService.onDynamicDidChangeLoadingState(this.id);
  }
  get onDidChangeFocus() {
    return this.browserViewService.onDynamicDidChangeFocus(this.id);
  }
  get onDidChangeDevToolsState() {
    return this.browserViewService.onDynamicDidChangeDevToolsState(this.id);
  }
  get onDidKeyCommand() {
    return this.browserViewService.onDynamicDidKeyCommand(this.id);
  }
  get onDidChangeTitle() {
    return this.browserViewService.onDynamicDidChangeTitle(this.id);
  }
  get onDidChangeFavicon() {
    return this.browserViewService.onDynamicDidChangeFavicon(this.id);
  }
  get onDidFindInPage() {
    return this.browserViewService.onDynamicDidFindInPage(this.id);
  }
  get onDidChangeVisibility() {
    return this.browserViewService.onDynamicDidChangeVisibility(this.id);
  }
  get onDidClose() {
    return this.browserViewService.onDynamicDidClose(this.id);
  }
  get onDidChangeRemoteStatus() {
    return this.browserViewService.onDynamicDidChangeRemoteStatus(this.id);
  }
  get onDidRequestPermission() {
    return this.browserViewService.onDynamicDidRequestPermission(this.id);
  }
  async layout(bounds) {
    return this.browserViewService.layout(this.id, bounds);
  }
  async setVisible(visible) {
    this._visible = visible;
    return this.browserViewService.setVisible(this.id, visible);
  }
  async loadURL(url, options) {
    this.logNavigationTelemetry(options?.source ?? "urlInput", url);
    this._onWillNavigate.fire(url);
    if (/^localhost(:|\/|$)/i.test(url)) {
      url = "http://" + url;
    } else if (!URL.parse(url)?.protocol) {
      url = "http://" + url;
    }
    return this.browserViewService.loadURL(this.id, url);
  }
  async goBack() {
    this.logNavigationTelemetry("goBack", this._url);
    return this.browserViewService.goBack(this.id);
  }
  async goForward() {
    this.logNavigationTelemetry("goForward", this._url);
    return this.browserViewService.goForward(this.id);
  }
  async reload(hard) {
    this.logNavigationTelemetry("reload", this._url);
    return this.browserViewService.reload(this.id, hard);
  }
  async toggleDevTools() {
    return this.browserViewService.toggleDevTools(this.id);
  }
  async captureScreenshot(options) {
    const result = await this.browserViewService.captureScreenshot(this.id, options);
    if (!options?.screenRect && !options?.pageRect && !options?.fullPage) {
      this._screenshot = result;
    }
    return result;
  }
  async focus(force) {
    return this.browserViewService.focus(this.id, force);
  }
  async findInPage(text, options) {
    return this.browserViewService.findInPage(this.id, text, options);
  }
  async stopFindInPage(keepSelection) {
    return this.browserViewService.stopFindInPage(this.id, keepSelection);
  }
  async getSelectedText() {
    return this.browserViewService.getSelectedText(this.id);
  }
  async clearStorage() {
    return this.browserViewService.clearStorage(this.id);
  }
  async trustCertificate(host, fingerprint) {
    return this.browserViewService.trustCertificate(this.id, host, fingerprint);
  }
  async untrustCertificate(host, fingerprint) {
    return this.browserViewService.untrustCertificate(this.id, host, fingerprint);
  }
  async deleteHistory(entryIds) {
    if (entryIds === void 0) {
      this.history.clear();
    } else {
      for (const id of entryIds) {
        this.history.entries.delete(id);
      }
    }
    return this.browserViewService.deleteBrowserHistory(this.id, entryIds);
  }
  async setPermissions(origin, grants) {
    this.permissions.setMany(origin, grants);
    return this.browserViewService.setPermissions(this.id, origin, grants);
  }
  async selectDevice(requestId, deviceId) {
    return this.browserViewService.selectDevice(this.id, requestId, deviceId);
  }
  /**
   * @param forceApply When true, the IPC call is made even if the local cached zoom index
   * already matches the requested value. Pass true after cross-document navigation because
   * Chromium resets the zoom to its per-origin default, making the cache stale.
   */
  async setBrowserZoomIndex(zoomIndex, forceApply = false) {
    const clamped = Math.max(0, Math.min(zoomIndex, browserZoomFactors.length - 1));
    if (!forceApply && clamped === this._browserZoomIndex) {
      return;
    }
    this._browserZoomIndex = clamped;
    await this.browserViewService.setBrowserZoomIndex(this.id, this._browserZoomIndex);
    this._onDidChangeZoom.fire();
  }
  async zoomIn() {
    if (!this.canZoomIn) {
      return;
    }
    await this.setBrowserZoomIndex(this._browserZoomIndex + 1);
    if (this._zoomHost) {
      this.zoomService.setHostZoomIndex(this._zoomHost, this._browserZoomIndex, this._isEphemeral);
    }
  }
  async zoomOut() {
    if (!this.canZoomOut) {
      return;
    }
    await this.setBrowserZoomIndex(this._browserZoomIndex - 1);
    if (this._zoomHost) {
      this.zoomService.setHostZoomIndex(this._zoomHost, this._browserZoomIndex, this._isEphemeral);
    }
  }
  async resetZoom() {
    const defaultIndex = this.zoomService.getEffectiveZoomIndex(void 0, false);
    await this.setBrowserZoomIndex(defaultIndex);
    if (this._zoomHost) {
      this.zoomService.setHostZoomIndex(this._zoomHost, defaultIndex, this._isEphemeral);
    }
  }
  async getConsoleLogs() {
    return this.browserViewService.getConsoleLogs(this.id);
  }
  async toggleElementSelection(enabled, options) {
    return this.browserViewService.toggleElementSelection(this.id, enabled, options);
  }
  async setElementComments(update) {
    return this.browserViewService.setElementComments(this.id, update);
  }
  async toggleAreaSelection(enabled) {
    return this.browserViewService.toggleAreaSelection(this.id, enabled);
  }
  get onDidSelectElement() {
    return this.browserViewService.onDynamicDidSelectElement(this.id);
  }
  get onDidRemoveElementComment() {
    return this.browserViewService.onDynamicDidRemoveElementComment(this.id);
  }
  get onDidChangeElementSelectionState() {
    return this.browserViewService.onDynamicDidChangeElementSelectionState(this.id);
  }
  get onDidPickArea() {
    return this.browserViewService.onDynamicDidPickArea(this.id);
  }
  get onDidChangeAreaSelectionActive() {
    return this.browserViewService.onDynamicDidChangeAreaSelectionActive(this.id);
  }
  async setDevice(device) {
    if (!structuralEquals(this._device, device)) {
      this._device = device;
      this._onDidChangeDevice.fire(device);
    }
    return this.browserViewService.setDeviceEmulation(this.id, device);
  }
  async setSharedWithAgent(shared) {
    if (shared) {
      if (this._url) {
        try {
          const uri = URI.parse(this._url);
          if (!this.agentNetworkFilterService.isUriAllowed(uri)) {
            await this.dialogService.info(
              localize("browserView.shareBlocked.title", "Cannot Share with Agent"),
              this.agentNetworkFilterService.formatError(uri)
            );
            return false;
          }
        } catch {
        }
      }
      const storedChoice = this.storageService.getBoolean(BrowserViewModel.SHARE_DONT_ASK_KEY, StorageScope.PROFILE);
      if (!storedChoice) {
        const result = await this.dialogService.confirm({
          type: "question",
          title: localize("browserView.shareWithAgent.title", "Share with Agent?"),
          message: localize("browserView.shareWithAgent.message", "Share this browser page with the agent?"),
          detail: localize(
            "browserView.shareWithAgent.detail",
            "The agent will be able to read and modify browser content and saved data, including cookies."
          ),
          primaryButton: localize("browserView.shareWithAgent.allow", "&&Allow"),
          cancelButton: localize("browserView.shareWithAgent.deny", "Deny"),
          checkbox: { label: localize("browserView.shareWithAgent.dontAskAgain", "Don't ask again"), checked: false }
        });
        if (result.confirmed && result.checkboxChecked) {
          this.storageService.store(BrowserViewModel.SHARE_DONT_ASK_KEY, result.confirmed, StorageScope.PROFILE, StorageTarget.USER);
        }
        this.telemetryService.publicLog2(
          "integratedBrowser.shareWithAgent",
          {
            shared: result.confirmed,
            dontAskAgain: result.checkboxChecked ?? false
          }
        );
        if (!result.confirmed) {
          return false;
        }
      } else {
        this.telemetryService.publicLog2(
          "integratedBrowser.shareWithAgent",
          {
            shared: true,
            dontAskAgain: true
          }
        );
      }
      await this.playwrightService.startTrackingPage(this.id);
      this._setSharedWithAgent(true);
    } else {
      await this.playwrightService.stopTrackingPage(this.id);
      this._setSharedWithAgent(false);
    }
    return true;
  }
  _setSharedWithAgent(isShared) {
    if (isShared !== this._sharedWithAgent) {
      this._sharedWithAgent = isShared;
      this._onDidChangeSharingState.fire(this.sharingState);
    }
  }
  _reloadHistoryEntries(key) {
    const raw = this.storageService.get(key, StorageScope.APPLICATION);
    this.history.entries.hydrate(parseHistorySnapshot(raw));
  }
  _reloadHistoryFavicons(key) {
    const raw = this.storageService.get(key, StorageScope.APPLICATION);
    this.history.favicons.hydrate(parseHistorySnapshot(raw));
  }
  /**
   * Log navigation telemetry event
   */
  logNavigationTelemetry(navigationType, url) {
    let localhost;
    try {
      localhost = isLocalhostAuthority(new URL(url).host);
    } catch {
      localhost = false;
    }
    this.telemetryService.publicLog2(
      "integratedBrowser.navigation",
      {
        navigationType,
        isLocalhost: localhost
      }
    );
  }
  dispose() {
    this._onWillDispose.fire();
    if (this._sharedWithAgent) {
      void this.playwrightService.stopTrackingPage(this.id);
    }
    void this.browserViewService.destroyBrowserView(this.id);
    super.dispose();
  }
};
BrowserViewModel.SHARE_DONT_ASK_KEY = "browserView.shareWithAgent.dontAskAgain";
BrowserViewModel = __decorateClass([
  __decorateParam(5, IBrowserViewWorkbenchService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IPlaywrightService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IBrowserZoomService),
  __decorateParam(11, IAgentNetworkFilterService),
  __decorateParam(12, ILogService)
], BrowserViewModel);
export {
  BrowserViewEditorId,
  BrowserViewModel,
  BrowserViewSharingState,
  IBrowserViewCDPService,
  IBrowserViewWorkbenchService,
  browserViewUrlMatches
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxjb21tb25cXGJyb3dzZXJWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHN0cnVjdHVyYWxFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENEUEV2ZW50LCBDRFBSZXF1ZXN0LCBDRFBSZXNwb25zZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9jZHAvdHlwZXMuanMnO1xuaW1wb3J0IHsgSVR1bm5lbFByb3h5SW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3R1bm5lbC9jb21tb24vdHVubmVsUHJveHkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJUGxheXdyaWdodFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vcGxheXdyaWdodFNlcnZpY2UuanMnO1xuaW1wb3J0IHtcblx0QnJvd3Nlckhpc3RvcnlTdG9yZSxcblx0SVNlcmlhbGl6ZWRCcm93c2VyRmF2aWNvbnNTbmFwc2hvdCxcblx0SVNlcmlhbGl6ZWRCcm93c2VySGlzdG9yeUVudHJpZXNTbmFwc2hvdCxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJIaXN0b3J5LmpzJztcbmltcG9ydCB7XG5cdEJyb3dzZXJQZXJtaXNzaW9uU3RvcmUsXG5cdElQZXJtaXNzaW9uQ2F0ZWdvcnlTdGF0ZSxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJQZXJtaXNzaW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4vYnJvd3NlckVkaXRvcklucHV0LmpzJztcbmltcG9ydCB0eXBlIHsgUHJlZmVycmVkR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHtcblx0SUJyb3dzZXJWaWV3Qm91bmRzLFxuXHRJQnJvd3NlclZpZXdOYXZpZ2F0aW9uRXZlbnQsXG5cdElCcm93c2VyVmlld0xvYWRpbmdFdmVudCxcblx0SUJyb3dzZXJWaWV3TG9hZEVycm9yLFxuXHRJQnJvd3NlclZpZXdGb2N1c0V2ZW50LFxuXHRJQnJvd3NlclZpZXdLZXlEb3duRXZlbnQsXG5cdElCcm93c2VyVmlld1RpdGxlQ2hhbmdlRXZlbnQsXG5cdElCcm93c2VyVmlld0Zhdmljb25DaGFuZ2VFdmVudCxcblx0SUJyb3dzZXJWaWV3RGV2VG9vbHNTdGF0ZUV2ZW50LFxuXHRJQnJvd3NlclZpZXdTZXJ2aWNlLFxuXHRCcm93c2VyVmlld1N0b3JhZ2VTY29wZSxcblx0SUJyb3dzZXJWaWV3Q2FwdHVyZVNjcmVlbnNob3RPcHRpb25zLFxuXHRJQnJvd3NlclZpZXdGaW5kSW5QYWdlT3B0aW9ucyxcblx0SUJyb3dzZXJWaWV3RmluZEluUGFnZVJlc3VsdCxcblx0SUJyb3dzZXJWaWV3VmlzaWJpbGl0eUV2ZW50LFxuXHRJQnJvd3NlclZpZXdDZXJ0aWZpY2F0ZUVycm9yLFxuXHRJRWxlbWVudERhdGEsXG5cdElCcm93c2VyRWxlbWVudENvbW1lbnRzVXBkYXRlLFxuXHRJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25PcHRpb25zLFxuXHRJQnJvd3NlclZpZXdPd25lcixcblx0SUJyb3dzZXJWaWV3T3Blbk9wdGlvbnMsXG5cdElCcm93c2VyVmlld1JlY3QsXG5cdGJyb3dzZXJab29tRGVmYXVsdEluZGV4LFxuXHRicm93c2VyWm9vbUZhY3RvcnMsXG5cdElCcm93c2VyVmlld1N0YXRlLFxuXHRJQnJvd3NlckRldmljZVByb2ZpbGUsXG5cdElCcm93c2VyVmlld1Blcm1pc3Npb25SZXF1ZXN0RXZlbnQsXG5cdElCcm93c2VyRWxlbWVudFNlbGVjdGlvblN0YXRlLFxufSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBpc0xvY2FsaG9zdEF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VybC9jb21tb24vdHJ1c3RlZERvbWFpbnMuanMnO1xuaW1wb3J0IHsgSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uZXR3b3JrRmlsdGVyL2NvbW1vbi9uZXR3b3JrRmlsdGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElCcm93c2VyWm9vbVNlcnZpY2UgfSBmcm9tICcuL2Jyb3dzZXJab29tU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlIHtcblx0LyoqIFRvb2xzIGFyZSBhdmFpbGFibGUgYW5kIHRoZSBwYWdlIGlzIHNoYXJlZCB3aXRoIHRoZSBhZ2VudC4gKi9cblx0U2hhcmVkID0gJ3NoYXJlZCcsXG5cdC8qKiBUb29scyBhcmUgYXZhaWxhYmxlIGJ1dCB0aGUgcGFnZSBpcyBub3Qgc2hhcmVkLiAqL1xuXHROb3RTaGFyZWQgPSAnbm90U2hhcmVkJyxcblx0LyoqIEJyb3dzZXIgdG9vbHMgYXJlIGRpc2FibGVkIFx1MjAxNCBzaGFyaW5nIGlzIG5vdCBwb3NzaWJsZS4gKi9cblx0VW5hdmFpbGFibGUgPSAndW5hdmFpbGFibGUnLFxufVxuXG4vKiogV2hldGhlciBhIGJyb3dzZXIgVVJMIGJlbG9uZ3MgdG8gdGhlIHNhbWUgZGVzdGluYXRpb24gaG9zdCBhcyB0aGUgdGFyZ2V0IFVSTC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBicm93c2VyVmlld1VybE1hdGNoZXMoY2FuZGlkYXRlVXJsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRhcmdldFVybDogc3RyaW5nLCBpbmNsdWRlQmxhbmsgPSBmYWxzZSk6IGJvb2xlYW4ge1xuXHRjb25zdCB0YXJnZXQgPSBVUkwucGFyc2UodGFyZ2V0VXJsKTtcblx0aWYgKCF0YXJnZXQgfHwgKHRhcmdldC5wcm90b2NvbCAhPT0gJ2ZpbGU6JyAmJiAhdGFyZ2V0Lmhvc3QpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChpbmNsdWRlQmxhbmsgJiYgKCFjYW5kaWRhdGVVcmwgfHwgY2FuZGlkYXRlVXJsID09PSAnYWJvdXQ6YmxhbmsnKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Y29uc3QgY2FuZGlkYXRlID0gVVJMLnBhcnNlKGNhbmRpZGF0ZVVybCA/PyAnJyk7XG5cdHJldHVybiBjYW5kaWRhdGU/Lmhvc3QgPT09IHRhcmdldC5ob3N0IHx8XG5cdFx0KHRhcmdldC5wcm90b2NvbCA9PT0gJ2ZpbGU6JyAmJiBjYW5kaWRhdGU/LnByb3RvY29sID09PSAnZmlsZTonKSB8fFxuXHRcdCEhKGNhbmRpZGF0ZT8uaG9zdCAmJiB0YXJnZXQuaG9zdCAmJiAoXG5cdFx0XHRjYW5kaWRhdGUuaG9zdC5lbmRzV2l0aCgnLicgKyB0YXJnZXQuaG9zdCkgfHxcblx0XHRcdHRhcmdldC5ob3N0LmVuZHNXaXRoKCcuJyArIGNhbmRpZGF0ZS5ob3N0KVxuXHRcdCkpO1xufVxuXG4vKiogRXh0cmFjdHMgdGhlIGhvc3QgZnJvbSBhIFVSTCBzdHJpbmcgZm9yIHpvb20gdHJhY2tpbmcgcHVycG9zZXMuICovXG5mdW5jdGlvbiBwYXJzZVpvb21Ib3N0KHVybDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcGFyc2VkID0gVVJMLnBhcnNlKHVybCk7XG5cdGlmICghcGFyc2VkPy5ob3N0IHx8IChwYXJzZWQucHJvdG9jb2wgIT09ICdodHRwOicgJiYgcGFyc2VkLnByb3RvY29sICE9PSAnaHR0cHM6JykpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBwYXJzZWQuaG9zdDtcbn1cblxuZnVuY3Rpb24gcGFyc2VIaXN0b3J5U25hcHNob3Q8VD4ocmF3OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBUIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFyYXcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHRyeSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFQ7XG5cdFx0aWYgKCFwYXJzZWQgfHwgdHlwZW9mIHBhcnNlZCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJzZWQ7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxudHlwZSBJbnRlZ3JhdGVkQnJvd3Nlck5hdmlnYXRpb25FdmVudCA9IHtcblx0bmF2aWdhdGlvblR5cGU6ICd1cmxJbnB1dCcgfCAnc2VhcmNoSW5wdXQnIHwgJ2dvQmFjaycgfCAnZ29Gb3J3YXJkJyB8ICdyZWxvYWQnO1xuXHRpc0xvY2FsaG9zdDogYm9vbGVhbjtcbn07XG5cbi8qKlxuICogVG8gYmUgdXNlZCBpbiB0ZWxlbWV0cnkuIFRoaXMgaXMgdGhlICBzb3VyY2UgZm9yIGFuIGFkZHJlc3MtYmFyLWluaXRpYXRlZCBuYXZpZ2F0aW9uOlxuICogd2hldGhlciB0aGUgdXNlciB0eXBlZCBhIFVSTCBvciByYW4gYSB3ZWIgc2VhcmNoLiBEZWZhdWx0cyB0byBgJ3VybElucHV0J2Agd2hlbiBvbWl0dGVkLlxuICovXG5leHBvcnQgdHlwZSBCcm93c2VyTmF2aWdhdGlvblNvdXJjZSA9ICd1cmxJbnB1dCcgfCAnc2VhcmNoSW5wdXQnO1xuXG4vKipcbiAqIE9wdGlvbnMgZm9yIGEgbmF2aWdhdGlvbiBpbml0aWF0ZWQgdmlhIHtAbGluayBJQnJvd3NlclZpZXdNb2RlbC5sb2FkVVJMfVxuICogKGFuZCB7QGxpbmsgQnJvd3NlckVkaXRvcklucHV0Lm5hdmlnYXRlfSkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSU5hdmlnYXRlT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBTb3VyY2Ugb2YgdGhlIG5hdmlnYXRpb24sIGZvciB0ZWxlbWV0cnkgcHVycG9zZXMuIERlZmF1bHRzIHRvIGAndXJsSW5wdXQnYCB3aGVuIG9taXR0ZWQuXG5cdCAqL1xuXHRyZWFkb25seSBzb3VyY2U/OiBCcm93c2VyTmF2aWdhdGlvblNvdXJjZTtcbn1cblxudHlwZSBJbnRlZ3JhdGVkQnJvd3Nlck5hdmlnYXRpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0bmF2aWdhdGlvblR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdIb3cgdGhlIG5hdmlnYXRpb24gd2FzIHRyaWdnZXJlZCcgfTtcblx0aXNMb2NhbGhvc3Q6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBVUkwgaXMgYSBsb2NhbGhvc3QgYWRkcmVzcycgfTtcblx0b3duZXI6ICdreWN1dGxlcic7XG5cdGNvbW1lbnQ6ICdUcmFja3MgbmF2aWdhdGlvbiBwYXR0ZXJucyBpbiBpbnRlZ3JhdGVkIGJyb3dzZXInO1xufTtcblxuXG50eXBlIEludGVncmF0ZWRCcm93c2VyU2hhcmVXaXRoQWdlbnRFdmVudCA9IHtcblx0c2hhcmVkOiBib29sZWFuO1xuXHRkb250QXNrQWdhaW46IGJvb2xlYW47XG59O1xuXG50eXBlIEludGVncmF0ZWRCcm93c2VyU2hhcmVXaXRoQWdlbnRDbGFzc2lmaWNhdGlvbiA9IHtcblx0c2hhcmVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgY29udGVudCB3YXMgc2hhcmVkIHdpdGggdGhlIGFnZW50JyB9O1xuXHRkb250QXNrQWdhaW46IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB1c2VyIGNob3NlIHRvIG5vdCBiZSBhc2tlZCBhZ2FpbicgfTtcblx0b3duZXI6ICdreWN1dGxlcic7XG5cdGNvbW1lbnQ6ICdUcmFja3MgdXNlciBjaG9pY2VzIGFyb3VuZCBzaGFyaW5nIGJyb3dzZXIgY29udGVudCB3aXRoIGFnZW50cyc7XG59O1xuXG50eXBlIEludGVncmF0ZWRCcm93c2VyQWRkRWxlbWVudFRvQ2hhdFN0YXJ0RXZlbnQgPSB7fTtcblxudHlwZSBJbnRlZ3JhdGVkQnJvd3NlckFkZEVsZW1lbnRUb0NoYXRTdGFydENsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2pydWFsZXMnO1xuXHRjb21tZW50OiAnVGhlIHVzZXIgaW5pdGlhdGVkIGFuIEFkZCBFbGVtZW50IHRvIENoYXQgYWN0aW9uIGluIEludGVncmF0ZWQgQnJvd3Nlci4nO1xufTtcblxuLyoqXG4gKiBWaWV3IHN0YXRlIHN0b3JlZCBpbiBlZGl0b3Igb3B0aW9ucyB3aGVuIG9wZW5pbmcgYSBicm93c2VyIHZpZXcuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJFZGl0b3JWaWV3U3RhdGUge1xuXHRyZWFkb25seSB1cmw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpdGxlPzogc3RyaW5nO1xuXHRyZWFkb25seSBmYXZpY29uPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBXaGVuIHRydWUsIGluZGljYXRlcyB0aGF0IHRoaXMgYnJvd3NlciB0YWIgd2FzIG9wZW5lZCB2aWEgdGhlIGxvY2FsaG9zdFxuXHQgKiBsaW5rIG9wZW5lciB3aGlsZSB0aGUgdXNlciBoYXMgbm90IGV4cGxpY2l0bHkgY29uZmlndXJlZCB0aGUgc2V0dGluZ1xuXHQgKiAoaS5lLiB0aGUgZGVmYXVsdCB2YWx1ZSB3YXMgdXNlZCkuIFRoaXMgaXMgYSB0cmFuc2llbnQgZmxhZyBhbmQgaXMgbm90XG5cdCAqIHNlcmlhbGl6ZWQuXG5cdCAqL1xuXHRyZWFkb25seSBpc0RlZmF1bHRMaW5rT3Blbj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjb25zdCBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2U+KCdicm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UnKTtcblxuLyoqIFRoZSBlZGl0b3IgdGhhdCByZW5kZXJzIGEgcGFnZSBpbiB0aGUgSW50ZWdyYXRlZCBCcm93c2VyLiAqL1xuZXhwb3J0IGNvbnN0IEJyb3dzZXJWaWV3RWRpdG9ySWQgPSAnd29ya2JlbmNoLmVkaXRvci5icm93c2VyJztcblxuLyoqXG4gKiBBIGZpbHRlciB0aGF0IGNvbnRleHR1YWxseSByZXN0cmljdHMgdGhlIGJyb3dzZXIgdmlld3MgcmV0dXJuZWQgYnlcbiAqIHtAbGluayBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLmdldENvbnRleHR1YWxCcm93c2VyVmlld3N9LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElCcm93c2VyVmlld0NvbnRleHR1YWxGaWx0ZXIge1xuXHQvKipcblx0ICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGdpdmVuIGJyb3dzZXIgdmlldyBzaG91bGQgYmUgcGFydCBvZiB0aGVcblx0ICogY29udGV4dHVhbCBzZXQuXG5cdCAqL1xuXHRpbmNsdWRlKGlucHV0OiBCcm93c2VyRWRpdG9ySW5wdXQsIGNvbnRleHQ6IElCcm93c2VyVmlld0ZpbHRlckNvbnRleHQpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBldmVudCB0aGF0IGZpcmVzIHdoZW4gdGhlIHJlc3VsdCBvZiB7QGxpbmsgaW5jbHVkZX0gbWF5IGhhdmVcblx0ICogY2hhbmdlZCBmb3Igb25lIG9yIG1vcmUgdmlld3MgKGUuZy4gdGhlIGFjdGl2ZSBzZXNzaW9uIGNoYW5nZWQpLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U/OiBFdmVudDx2b2lkPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQnJvd3NlclZpZXdGaWx0ZXJDb250ZXh0IHtcblx0LyoqXG5cdCAqIFRoZSBzZXNzaW9uICpyZXNvdXJjZSogVVJJIHN0cmluZyAoYHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKWApIG9mIHRoZVxuXHQgKiByZWxldmFudCBzZXNzaW9uLCBpZiBhbnkuIFRoaXMgaXMgdGhlIHNhbWUgdmFsdWUgc3RvcmVkIGluXG5cdCAqIHtAbGluayBJQnJvd3NlclZpZXdPd25lci5zZXNzaW9uSWR9IFx1MjAxNCBub3QgdGhlIGNvbXBvc2l0ZVxuXHQgKiBgSVNlc3Npb24uc2Vzc2lvbklkYCAoYHByb3ZpZGVySWQ6cmVzb3VyY2VgKS5cblx0ICovXG5cdGFjdGl2ZVNlc3Npb25JZD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBBIGhhbmRsZXIgdGhhdCBkZWNpZGVzIHdoZXRoZXIgYW4gZWRpdG9yIHNob3VsZCBiZSBvcGVuZWQgZm9yIGEgbmV3bHlcbiAqIGNyZWF0ZWQgYnJvd3NlciB2aWV3LiBSZWdpc3RlcmVkIHZpYVxuICoge0BsaW5rIElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UucmVnaXN0ZXJPcGVuSGFuZGxlcn0uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJWaWV3T3BlbkhhbmRsZXIge1xuXHQvKipcblx0ICogQ2FsbGVkIGJlZm9yZSBhbiBlZGl0b3IgaXMgb3BlbmVkIGZvciBhIG5ld2x5IGNyZWF0ZWQgYnJvd3NlciB2aWV3LlxuXHQgKiBSZXR1cm4gYGZhbHNlYCB0byBwcmV2ZW50IHRoZSBlZGl0b3IgZnJvbSBiZWluZyBvcGVuZWQuIEEgdmlldyBpcyBvcGVuZWRcblx0ICogb25seSB3aGVuIGV2ZXJ5IHJlZ2lzdGVyZWQgaGFuZGxlciBhbGxvd3MgaXQuXG5cdCAqL1xuXHRzaG91bGRPcGVuRWRpdG9yKGlucHV0OiBCcm93c2VyRWRpdG9ySW5wdXQsIG93bmVyOiBJQnJvd3NlclZpZXdPd25lciwgb3Blbk9wdGlvbnM6IElCcm93c2VyVmlld09wZW5PcHRpb25zKTogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBXb3JrYmVuY2gtbGV2ZWwgc2VydmljZSBmb3IgYnJvd3NlciB2aWV3cyB0aGF0IHByb3ZpZGVzIG1vZGVsLWJhc2VkIGFjY2VzcyB0byBicm93c2VyIHZpZXdzLlxuICogVGhpcyBzZXJ2aWNlIG1hbmFnZXMgYnJvd3NlciB2aWV3IG1vZGVscyB0aGF0IHByb3h5IHRvIHRoZSBtYWluIHByb2Nlc3MgYnJvd3NlciB2aWV3IHNlcnZpY2UuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKiogUmV0dXJucyB0cnVlIGlmIHRoZSByZW1vdGUgcHJveHkgaXMgZW5hYmxlZDsgaS5lLiB3ZSBhcmUgaW4gYSByZW1vdGUgd29ya3NwYWNlIGFuZCB0aGUgc2V0dGluZyBpcyBlbmFibGVkLiAqL1xuXHR3aWxsVXNlUmVtb3RlUHJveHkoKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogU2V0IHRoZSB0dW5uZWwtcHJveHkgY3JlZGVudGlhbHMgcmVzb2x2ZWQgYnkgdGhlIHdpbmRvdydzIGxvY2FsIG5vZGVcblx0ICogZXh0ZW5zaW9uIGhvc3QgKHdoaWNoIGhvc3RzIHRoZSBIVFRQUyB0dW5uZWwgcHJveHkpLCBvciBgdW5kZWZpbmVkYCB0b1xuXHQgKiBjbGVhciB0aGVtLiBGb2xkZWQgaW50byB0aGUgd2luZG93IGNvbmZpZ3VyYXRpb24gc2VudCB0byB0aGUgbWFpblxuXHQgKiBwcm9jZXNzIHNvIHRoaXMgd2luZG93J3MgcmVtb3RlIGJyb3dzZXIgdmlld3MgKHJlKWFwcGx5IHRoZSBwcm94eS5cblx0ICovXG5cdHNldFJlbW90ZVByb3h5SW5mbyhpbmZvOiBJVHVubmVsUHJveHlJbmZvIHwgdW5kZWZpbmVkKTogdm9pZDtcblxuXHQvKipcblx0ICogRmlyZXMgd2hlbiB0aGUgc2V0IG9mIGtub3duIGJyb3dzZXIgdmlld3MgY2hhbmdlcywgb3IgYSBtb2RlbCBpcyBjcmVhdGVkIGZvciBhbiBleGlzdGluZyBpbnB1dC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQnJvd3NlclZpZXdzOiBFdmVudDx2b2lkPjtcblxuXHQvKipcblx0ICogV2hldGhlciBzaGFyaW5nIGJyb3dzZXIgcGFnZXMgd2l0aCB0aGUgYWdlbnQgaXMgY3VycmVudGx5IGF2YWlsYWJsZVxuXHQgKiAoY2hhdCBlbmFibGVkLCBhZ2VudCBtb2RlIGVuYWJsZWQsIGJyb3dzZXIgdG9vbHMgc2V0dGluZyBlbmFibGVkLCBldGMuKS5cblx0ICovXG5cdHJlYWRvbmx5IGlzU2hhcmluZ0F2YWlsYWJsZTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogRmlyZXMgd2hlbiB7QGxpbmsgaXNTaGFyaW5nQXZhaWxhYmxlfSBjaGFuZ2VzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTaGFyaW5nQXZhaWxhYmxlOiBFdmVudDxib29sZWFuPjtcblxuXHQvKipcblx0ICogR2V0IGFsbCBrbm93biBicm93c2VyIHZpZXdzLlxuXHQgKi9cblx0Z2V0S25vd25Ccm93c2VyVmlld3MoKTogTWFwPHN0cmluZywgQnJvd3NlckVkaXRvcklucHV0PjtcblxuXHQvKipcblx0ICogUmVnaXN0ZXIgYSBjb250ZXh0dWFsIGZpbHRlciB0aGF0IHJlc3RyaWN0cyB3aGljaCBicm93c2VyIHZpZXdzIGFyZVxuXHQgKiByZXR1cm5lZCBieSB7QGxpbmsgZ2V0Q29udGV4dHVhbEJyb3dzZXJWaWV3c30uIEEgdmlldyBpcyBwYXJ0IG9mIHRoZVxuXHQgKiBjb250ZXh0dWFsIHNldCBvbmx5IHdoZW4gZXZlcnkgcmVnaXN0ZXJlZCBmaWx0ZXIgaW5jbHVkZXMgaXQuXG5cdCAqL1xuXHRyZWdpc3RlckNvbnRleHR1YWxGaWx0ZXIoZmlsdGVyOiBJQnJvd3NlclZpZXdDb250ZXh0dWFsRmlsdGVyKTogSURpc3Bvc2FibGU7XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgYnJvd3NlciB2aWV3cyB0aGF0IHBhc3MgYWxsIHJlZ2lzdGVyZWQgY29udGV4dHVhbCBmaWx0ZXJzLiBXaGVuXG5cdCAqIG5vIGZpbHRlcnMgYXJlIHJlZ2lzdGVyZWQgdGhpcyBpcyBlcXVpdmFsZW50IHRvIHtAbGluayBnZXRLbm93bkJyb3dzZXJWaWV3c30uXG5cdCAqXG5cdCAqIEBwYXJhbSBjb250ZXh0IFRoZSBmaWx0ZXIgY29udGV4dCB0byB1c2UgKG9yIGluZmVycmVkIGlmIG5vdCBwcm92aWRlZClcblx0ICovXG5cdGdldENvbnRleHR1YWxCcm93c2VyVmlld3MoY29udGV4dD86IElCcm93c2VyVmlld0ZpbHRlckNvbnRleHQpOiBNYXA8c3RyaW5nLCBCcm93c2VyRWRpdG9ySW5wdXQ+O1xuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBwcmVmZXJyZWQgZWRpdG9yIGdyb3VwIGZvciBvcGVuaW5nIGFuIGludGVncmF0ZWQgYnJvd3NlclxuXHQgKiBlZGl0b3IuIEhvbm9ycyB0aGUgYHdvcmtiZW5jaC5icm93c2VyLm5ld1RhYlBsYWNlbWVudGAgc2V0dGluZywgcm91dGluZyBuZXdcblx0ICogdGFicyBpbnRvIGEgZGVkaWNhdGVkIChsb2NrZWQpIHNpZGUgZ3JvdXAgb3IgYXV4aWxpYXJ5IHdpbmRvdyB3aGVuXG5cdCAqIGNvbmZpZ3VyZWQuIFdoZW4gdGhlIHdvcmtiZW5jaCBmb3JjZXMgZWRpdG9ycyBpbnRvIGEgbW9kYWwgcGFydFxuXHQgKiAoYHdvcmtiZW5jaC5lZGl0b3IudXNlTW9kYWw6ICdhbGwnYCksIGJyb3dzZXIgb3BlbnMgdGhhdCB0YXJnZXQgdGhlIGFjdGl2ZVxuXHQgKiBncm91cCAob3IgbGVhdmUgaXQgdW5zcGVjaWZpZWQpIGFyZVxuXHQgKiByZWRpcmVjdGVkIHRvIHRoZSBtYWluIGVkaXRvciBhcmVhIHNvIHRoZSBicm93c2VyIGRvY2tzIGluc3RlYWQgb2Ygb3BlbmluZ1xuXHQgKiBhcyBhIG1vZGFsIG92ZXJsYXkuIEV4cGxpY2l0IHBsYWNlbWVudHMgKHNpZGUgZ3JvdXAsIGF1eGlsaWFyeSB3aW5kb3csIGFcblx0ICogc3BlY2lmaWMgZ3JvdXApIGFyZSBsZWZ0IHVudG91Y2hlZC5cblx0ICovXG5cdGdldFByZWZlcnJlZEdyb3VwKHByZWZlcnJlZEdyb3VwPzogUHJlZmVycmVkR3JvdXApOiBQcm9taXNlPFByZWZlcnJlZEdyb3VwIHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0ICogUmVnaXN0ZXIgYSBoYW5kbGVyIHRoYXQgZGVjaWRlcyB3aGV0aGVyIGFuIGVkaXRvciBzaG91bGQgYmUgb3BlbmVkIGZvciBhXG5cdCAqIG5ld2x5IGNyZWF0ZWQgYnJvd3NlciB2aWV3LiBUaGUgZWRpdG9yIGlzIG9wZW5lZCBvbmx5IHdoZW4gZXZlcnlcblx0ICogcmVnaXN0ZXJlZCBoYW5kbGVyIGFsbG93cyBpdC5cblx0ICovXG5cdHJlZ2lzdGVyT3BlbkhhbmRsZXIoaGFuZGxlcjogSUJyb3dzZXJWaWV3T3BlbkhhbmRsZXIpOiBJRGlzcG9zYWJsZTtcblxuXHQvKipcblx0ICogR2V0IGFuIGV4aXN0aW5nIGJyb3dzZXIgdmlldyBmb3IgdGhlIGdpdmVuIElELCBvciBjcmVhdGUgYSBuZXcgb25lIGlmIGl0IGRvZXNuJ3QgZXhpc3QuXG5cdCAqIFRoZSB1bmRlcmx5aW5nIGJyb3dzZXIgdmlldyBpcyBub3QgY3JlYXRlZCB1bnRpbCB0aGUgZWRpdG9yIGlzIG9wZW5lZCBvciB0aGUgbW9kZWwgaXMgcmVzb2x2ZWQuXG5cdCAqL1xuXHRnZXRPckNyZWF0ZUxhenkoaWQ6IHN0cmluZywgaW5pdGlhbFN0YXRlPzogSUJyb3dzZXJFZGl0b3JWaWV3U3RhdGUsIGFzc29jaWF0ZWRSZXNvdXJjZT86IFVSSSk6IEJyb3dzZXJFZGl0b3JJbnB1dDtcblxuXHQvKipcblx0ICogQ2xlYXIgYWxsIHN0b3JhZ2UgZGF0YSBmb3IgdGhlIGdsb2JhbCBicm93c2VyIHNlc3Npb25cblx0ICovXG5cdGNsZWFyR2xvYmFsU3RvcmFnZSgpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBDbGVhciBhbGwgc3RvcmFnZSBkYXRhIGZvciB0aGUgY3VycmVudCB3b3Jrc3BhY2UgYnJvd3NlciBzZXNzaW9uXG5cdCAqL1xuXHRjbGVhcldvcmtzcGFjZVN0b3JhZ2UoKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGNvbnN0IElCcm93c2VyVmlld0NEUFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUJyb3dzZXJWaWV3Q0RQU2VydmljZT4oJ2Jyb3dzZXJWaWV3Q0RQU2VydmljZScpO1xuXG4vKipcbiAqIFdvcmtiZW5jaC1sZXZlbCBzZXJ2aWNlIGZvciBtYW5hZ2luZyBDRFAgKENocm9tZSBEZXZUb29scyBQcm90b2NvbCkgc2Vzc2lvbnNcbiAqIGFnYWluc3QgYnJvd3NlciB2aWV3cy4gSGFuZGxlcyBncm91cCBsaWZlY3ljbGUgYW5kIHdpbmRvdyBJRCByZXNvbHV0aW9uLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElCcm93c2VyVmlld0NEUFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyBDRFAgZ3JvdXAgZm9yIGEgYnJvd3NlciB2aWV3LlxuXHQgKiBUaGUgd2luZG93IElEIGlzIHJlc29sdmVkIGZyb20gdGhlIGVkaXRvciBncm91cCBjb250YWluaW5nIHRoZSBicm93c2VyLlxuXHQgKiBAcGFyYW0gYnJvd3NlcklkIFRoZSBicm93c2VyIHZpZXcgaWRlbnRpZmllci5cblx0ICogQHJldHVybnMgVGhlIElEIG9mIHRoZSBuZXdseSBjcmVhdGVkIGdyb3VwLlxuXHQgKi9cblx0Y3JlYXRlU2Vzc2lvbkdyb3VwKGJyb3dzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+O1xuXG5cdC8qKiBEZXN0cm95IGEgQ0RQIGdyb3VwLiAqL1xuXHRkZXN0cm95U2Vzc2lvbkdyb3VwKGdyb3VwSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqIFNlbmQgYSBDRFAgbWVzc2FnZSB0byBhIGdyb3VwLiAqL1xuXHRzZW5kQ0RQTWVzc2FnZShncm91cElkOiBzdHJpbmcsIG1lc3NhZ2U6IENEUFJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKiBGaXJlcyB3aGVuIGEgQ0RQIG1lc3NhZ2UgaXMgcmVjZWl2ZWQuICovXG5cdG9uQ0RQTWVzc2FnZShncm91cElkOiBzdHJpbmcpOiBFdmVudDxDRFBSZXNwb25zZSB8IENEUEV2ZW50PjtcblxuXHQvKiogRmlyZXMgd2hlbiBhIENEUCBncm91cCBpcyBkZXN0cm95ZWQuICovXG5cdG9uRGlkRGVzdHJveShncm91cElkOiBzdHJpbmcpOiBFdmVudDx2b2lkPjtcbn1cblxuXG4vKipcbiAqIEEgYnJvd3NlciB2aWV3IG1vZGVsIHRoYXQgcmVwcmVzZW50cyBhIHNpbmdsZSBicm93c2VyIHZpZXcgaW5zdGFuY2UgaW4gdGhlIHdvcmtiZW5jaC5cbiAqIFRoaXMgbW9kZWwgcHJveGllcyBjYWxscyB0byB0aGUgbWFpbiBwcm9jZXNzIGJyb3dzZXIgdmlldyBzZXJ2aWNlIHVzaW5nIGl0cyB1bmlxdWUgSUQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJWaWV3TW9kZWwgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG93bmVyOiBJQnJvd3NlclZpZXdPd25lcjtcblx0cmVhZG9ubHkgYXNzb2NpYXRlZFJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHVybDogc3RyaW5nO1xuXHRyZWFkb25seSB0aXRsZTogc3RyaW5nO1xuXHRyZWFkb25seSBmYXZpY29uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNjcmVlbnNob3Q6IFZTQnVmZmVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBsb2FkaW5nOiBib29sZWFuO1xuXHRyZWFkb25seSBmb2N1c2VkOiBib29sZWFuO1xuXHRyZWFkb25seSB2aXNpYmxlOiBib29sZWFuO1xuXHRyZWFkb25seSBjYW5Hb0JhY2s6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzRGV2VG9vbHNPcGVuOiBib29sZWFuO1xuXHRyZWFkb25seSBjYW5Hb0ZvcndhcmQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGVycm9yOiBJQnJvd3NlclZpZXdMb2FkRXJyb3IgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNlcnRpZmljYXRlRXJyb3I6IElCcm93c2VyVmlld0NlcnRpZmljYXRlRXJyb3IgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHN0b3JhZ2VTY29wZTogQnJvd3NlclZpZXdTdG9yYWdlU2NvcGU7XG5cdHJlYWRvbmx5IGhpc3Rvcnk6IEJyb3dzZXJIaXN0b3J5U3RvcmU7XG5cdHJlYWRvbmx5IHBlcm1pc3Npb25zOiBCcm93c2VyUGVybWlzc2lvblN0b3JlO1xuXHRyZWFkb25seSBzaGFyaW5nU3RhdGU6IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlO1xuXHRyZWFkb25seSBpc1JlbW90ZVNlc3Npb246IGJvb2xlYW47XG5cdHJlYWRvbmx5IHpvb21GYWN0b3I6IG51bWJlcjtcblx0cmVhZG9ubHkgY2FuWm9vbUluOiBib29sZWFuO1xuXHRyZWFkb25seSBjYW5ab29tT3V0OiBib29sZWFuO1xuXHRyZWFkb25seSBlbGVtZW50U2VsZWN0aW9uU3RhdGU6IElCcm93c2VyRWxlbWVudFNlbGVjdGlvblN0YXRlO1xuXHRyZWFkb25seSBpc0FyZWFTZWxlY3Rpb25BY3RpdmU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGRldmljZTogSUJyb3dzZXJEZXZpY2VQcm9maWxlIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2hhcmluZ1N0YXRlOiBFdmVudDxCcm93c2VyVmlld1NoYXJpbmdTdGF0ZT47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlWm9vbTogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uV2lsbE5hdmlnYXRlOiBFdmVudDxzdHJpbmc+O1xuXHRyZWFkb25seSBvbkRpZE5hdmlnYXRlOiBFdmVudDxJQnJvd3NlclZpZXdOYXZpZ2F0aW9uRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxvYWRpbmdTdGF0ZTogRXZlbnQ8SUJyb3dzZXJWaWV3TG9hZGluZ0V2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGb2N1czogRXZlbnQ8SUJyb3dzZXJWaWV3Rm9jdXNFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGV2VG9vbHNTdGF0ZTogRXZlbnQ8SUJyb3dzZXJWaWV3RGV2VG9vbHNTdGF0ZUV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRLZXlDb21tYW5kOiBFdmVudDxJQnJvd3NlclZpZXdLZXlEb3duRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRpdGxlOiBFdmVudDxJQnJvd3NlclZpZXdUaXRsZUNoYW5nZUV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGYXZpY29uOiBFdmVudDxJQnJvd3NlclZpZXdGYXZpY29uQ2hhbmdlRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZEZpbmRJblBhZ2U6IEV2ZW50PElCcm93c2VyVmlld0ZpbmRJblBhZ2VSZXN1bHQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2liaWxpdHk6IEV2ZW50PElCcm93c2VyVmlld1Zpc2liaWxpdHlFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2U6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbldpbGxEaXNwb3NlOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRTZWxlY3RFbGVtZW50OiBFdmVudDxJRWxlbWVudERhdGE+O1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZUVsZW1lbnRDb21tZW50OiBFdmVudDxzdHJpbmc+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUVsZW1lbnRTZWxlY3Rpb25TdGF0ZTogRXZlbnQ8SUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uU3RhdGU+O1xuXHRyZWFkb25seSBvbkRpZFBpY2tBcmVhOiBFdmVudDxJQnJvd3NlclZpZXdSZWN0IHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBcmVhU2VsZWN0aW9uQWN0aXZlOiBFdmVudDxib29sZWFuPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEZXZpY2U6IEV2ZW50PElCcm93c2VyRGV2aWNlUHJvZmlsZSB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVtb3RlU3RhdHVzOiBFdmVudDxib29sZWFuPjtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0UGVybWlzc2lvbjogRXZlbnQ8SUJyb3dzZXJWaWV3UGVybWlzc2lvblJlcXVlc3RFdmVudD47XG5cblx0bGF5b3V0KGJvdW5kczogSUJyb3dzZXJWaWV3Qm91bmRzKTogUHJvbWlzZTx2b2lkPjtcblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPjtcblx0bG9hZFVSTCh1cmw6IHN0cmluZywgb3B0aW9ucz86IElOYXZpZ2F0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRnb0JhY2soKTogUHJvbWlzZTx2b2lkPjtcblx0Z29Gb3J3YXJkKCk6IFByb21pc2U8dm9pZD47XG5cdHJlbG9hZChoYXJkPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD47XG5cdHRvZ2dsZURldlRvb2xzKCk6IFByb21pc2U8dm9pZD47XG5cdGNhcHR1cmVTY3JlZW5zaG90KG9wdGlvbnM/OiBJQnJvd3NlclZpZXdDYXB0dXJlU2NyZWVuc2hvdE9wdGlvbnMpOiBQcm9taXNlPFZTQnVmZmVyPjtcblx0Zm9jdXMoZm9yY2U/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPjtcblx0ZmluZEluUGFnZSh0ZXh0OiBzdHJpbmcsIG9wdGlvbnM/OiBJQnJvd3NlclZpZXdGaW5kSW5QYWdlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cdHN0b3BGaW5kSW5QYWdlKGtlZXBTZWxlY3Rpb24/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPjtcblx0Z2V0U2VsZWN0ZWRUZXh0KCk6IFByb21pc2U8c3RyaW5nPjtcblx0Y2xlYXJTdG9yYWdlKCk6IFByb21pc2U8dm9pZD47XG5cdHNldFNoYXJlZFdpdGhBZ2VudChzaGFyZWQ6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+O1xuXHR0cnVzdENlcnRpZmljYXRlKGhvc3Q6IHN0cmluZywgZmluZ2VycHJpbnQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cdHVudHJ1c3RDZXJ0aWZpY2F0ZShob3N0OiBzdHJpbmcsIGZpbmdlcnByaW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXHRkZWxldGVIaXN0b3J5KGVudHJ5SWRzPzogcmVhZG9ubHkgbnVtYmVyW10pOiBQcm9taXNlPHZvaWQ+O1xuXHRzZXRQZXJtaXNzaW9ucyhvcmlnaW46IHN0cmluZywgZ3JhbnRzOiByZWFkb25seSBJUGVybWlzc2lvbkNhdGVnb3J5U3RhdGVbXSk6IFByb21pc2U8dm9pZD47XG5cdHNlbGVjdERldmljZShyZXF1ZXN0SWQ6IHN0cmluZywgZGV2aWNlSWQ6IHN0cmluZyB8IG51bGwpOiBQcm9taXNlPHZvaWQ+O1xuXHR6b29tSW4oKTogUHJvbWlzZTx2b2lkPjtcblx0em9vbU91dCgpOiBQcm9taXNlPHZvaWQ+O1xuXHRyZXNldFpvb20oKTogUHJvbWlzZTx2b2lkPjtcblx0Z2V0Q29uc29sZUxvZ3MoKTogUHJvbWlzZTxzdHJpbmc+O1xuXHR0b2dnbGVFbGVtZW50U2VsZWN0aW9uKGVuYWJsZWQ/OiBib29sZWFuLCBvcHRpb25zPzogSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cdHNldEVsZW1lbnRDb21tZW50cyh1cGRhdGU6IElCcm93c2VyRWxlbWVudENvbW1lbnRzVXBkYXRlKTogUHJvbWlzZTx2b2lkPjtcblx0dG9nZ2xlQXJlYVNlbGVjdGlvbihlbmFibGVkPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD47XG5cdHNldERldmljZShkZXZpY2U6IElCcm93c2VyRGV2aWNlUHJvZmlsZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyVmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElCcm93c2VyVmlld01vZGVsIHtcblx0cHJpdmF0ZSBfdXJsOiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBfdGl0bGU6IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIF9mYXZpY29uOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NjcmVlbnNob3Q6IFZTQnVmZmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sb2FkaW5nOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2ZvY3VzZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfdmlzaWJsZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc0RldlRvb2xzT3BlbjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9jYW5Hb0JhY2s6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfY2FuR29Gb3J3YXJkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2Vycm9yOiBJQnJvd3NlclZpZXdMb2FkRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NlcnRpZmljYXRlRXJyb3I6IElCcm93c2VyVmlld0NlcnRpZmljYXRlRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3N0b3JhZ2VTY29wZTogQnJvd3NlclZpZXdTdG9yYWdlU2NvcGUgPSBCcm93c2VyVmlld1N0b3JhZ2VTY29wZS5FcGhlbWVyYWw7XG5cdHByaXZhdGUgX2lzUmVtb3RlU2Vzc2lvbjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc0VwaGVtZXJhbDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF96b29tSG9zdDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zaGFyZWRXaXRoQWdlbnQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfYnJvd3Nlclpvb21JbmRleDogbnVtYmVyID0gYnJvd3Nlclpvb21EZWZhdWx0SW5kZXg7XG5cdHByaXZhdGUgX2VsZW1lbnRTZWxlY3Rpb25TdGF0ZTogSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uU3RhdGUgPSB7IGFjdGl2ZTogZmFsc2UsIG9wdGlvbnM6IHt9IH07XG5cdHByaXZhdGUgX2lzQXJlYVNlbGVjdGlvbkFjdGl2ZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9kZXZpY2U6IElCcm93c2VyRGV2aWNlUHJvZmlsZSB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBoaXN0b3J5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJyb3dzZXJIaXN0b3J5U3RvcmUoKSk7XG5cdHJlYWRvbmx5IHBlcm1pc3Npb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJyb3dzZXJQZXJtaXNzaW9uU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VEZXZpY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlckRldmljZVByb2ZpbGUgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURldmljZTogRXZlbnQ8SUJyb3dzZXJEZXZpY2VQcm9maWxlIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkQ2hhbmdlRGV2aWNlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2hhcmluZ1N0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8QnJvd3NlclZpZXdTaGFyaW5nU3RhdGU+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNoYXJpbmdTdGF0ZTogRXZlbnQ8QnJvd3NlclZpZXdTaGFyaW5nU3RhdGU+ID0gdGhpcy5fb25EaWRDaGFuZ2VTaGFyaW5nU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2Vab29tID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlWm9vbTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVpvb20uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxEaXNwb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uV2lsbERpc3Bvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsTmF2aWdhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbldpbGxOYXZpZ2F0ZTogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uV2lsbE5hdmlnYXRlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGlkOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgb3duZXI6IElCcm93c2VyVmlld093bmVyLFxuXHRcdHJlYWRvbmx5IGFzc29jaWF0ZWRSZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdGluaXRpYWxTdGF0ZTogSUJyb3dzZXJWaWV3U3RhdGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBicm93c2VyVmlld1NlcnZpY2U6IElCcm93c2VyVmlld1NlcnZpY2UsXG5cdFx0QElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBicm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2U6IElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElQbGF5d3JpZ2h0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBsYXl3cmlnaHRTZXJ2aWNlOiBJUGxheXdyaWdodFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElCcm93c2VyWm9vbVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB6b29tU2VydmljZTogSUJyb3dzZXJab29tU2VydmljZSxcblx0XHRASUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlOiBJQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIEluaXRpYWxpemUgc3RhdGVcblx0XHR0aGlzLl91cmwgPSBpbml0aWFsU3RhdGUudXJsO1xuXHRcdHRoaXMuX3RpdGxlID0gaW5pdGlhbFN0YXRlLnRpdGxlO1xuXHRcdHRoaXMuX2xvYWRpbmcgPSBpbml0aWFsU3RhdGUubG9hZGluZztcblx0XHR0aGlzLl9mb2N1c2VkID0gaW5pdGlhbFN0YXRlLmZvY3VzZWQ7XG5cdFx0dGhpcy5fdmlzaWJsZSA9IGluaXRpYWxTdGF0ZS52aXNpYmxlO1xuXHRcdHRoaXMuX2lzRGV2VG9vbHNPcGVuID0gaW5pdGlhbFN0YXRlLmlzRGV2VG9vbHNPcGVuO1xuXHRcdHRoaXMuX2NhbkdvQmFjayA9IGluaXRpYWxTdGF0ZS5jYW5Hb0JhY2s7XG5cdFx0dGhpcy5fY2FuR29Gb3J3YXJkID0gaW5pdGlhbFN0YXRlLmNhbkdvRm9yd2FyZDtcblx0XHR0aGlzLl9zY3JlZW5zaG90ID0gaW5pdGlhbFN0YXRlLmxhc3RTY3JlZW5zaG90O1xuXHRcdHRoaXMuX2Zhdmljb24gPSBpbml0aWFsU3RhdGUubGFzdEZhdmljb247XG5cdFx0dGhpcy5fZXJyb3IgPSBpbml0aWFsU3RhdGUubGFzdEVycm9yO1xuXHRcdHRoaXMuX2NlcnRpZmljYXRlRXJyb3IgPSBpbml0aWFsU3RhdGUuY2VydGlmaWNhdGVFcnJvcjtcblx0XHR0aGlzLl9zdG9yYWdlU2NvcGUgPSBpbml0aWFsU3RhdGUuc3RvcmFnZVNjb3BlO1xuXHRcdHRoaXMuX2lzUmVtb3RlU2Vzc2lvbiA9IGluaXRpYWxTdGF0ZS5pc1JlbW90ZVNlc3Npb247XG5cdFx0dGhpcy5fYnJvd3Nlclpvb21JbmRleCA9IGluaXRpYWxTdGF0ZS5icm93c2VyWm9vbUluZGV4O1xuXHRcdHRoaXMuX2VsZW1lbnRTZWxlY3Rpb25TdGF0ZSA9IGluaXRpYWxTdGF0ZS5lbGVtZW50U2VsZWN0aW9uU3RhdGU7XG5cdFx0dGhpcy5faXNBcmVhU2VsZWN0aW9uQWN0aXZlID0gaW5pdGlhbFN0YXRlLmlzQXJlYVNlbGVjdGlvbkFjdGl2ZTtcblx0XHR0aGlzLl9kZXZpY2UgPSBpbml0aWFsU3RhdGUuZGV2aWNlO1xuXHRcdHRoaXMuX2lzRXBoZW1lcmFsID0gdGhpcy5fc3RvcmFnZVNjb3BlID09PSBCcm93c2VyVmlld1N0b3JhZ2VTY29wZS5FcGhlbWVyYWw7XG5cdFx0dGhpcy5fem9vbUhvc3QgPSBwYXJzZVpvb21Ib3N0KHRoaXMuX3VybCk7XG5cblx0XHRjb25zdCB7IGhpc3Rvcnk6IGVudHJpZXNLZXksIGZhdmljb25zOiBmYXZpY29uc0tleSB9ID0gaW5pdGlhbFN0YXRlLnN0b3JhZ2VLZXlzO1xuXHRcdGlmIChlbnRyaWVzS2V5KSB7XG5cdFx0XHR0aGlzLl9yZWxvYWRIaXN0b3J5RW50cmllcyhlbnRyaWVzS2V5KTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShcblx0XHRcdFx0U3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBlbnRyaWVzS2V5LCB0aGlzLl9zdG9yZSxcblx0XHRcdCkoKCkgPT4gdGhpcy5fcmVsb2FkSGlzdG9yeUVudHJpZXMoZW50cmllc0tleSkpKTtcblx0XHR9XG5cdFx0aWYgKGZhdmljb25zS2V5KSB7XG5cdFx0XHR0aGlzLl9yZWxvYWRIaXN0b3J5RmF2aWNvbnMoZmF2aWNvbnNLZXkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFxuXHRcdFx0XHRTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhdmljb25zS2V5LCB0aGlzLl9zdG9yZSxcblx0XHRcdCkoKCkgPT4gdGhpcy5fcmVsb2FkSGlzdG9yeUZhdmljb25zKGZhdmljb25zS2V5KSkpO1xuXHRcdH1cblxuXHRcdC8vIFBlcm1pc3Npb25zIGFyZSBzeW5jZWQgdmlhIGJyb3dzZXItdmlldyBzdGF0ZSArIGEgZHluYW1pYyBldmVudCByYXRoZXJcblx0XHQvLyB0aGFuIHN0b3JhZ2UsIHNvIHRoZXkgd29yayBmb3IgZXBoZW1lcmFsIHNlc3Npb25zICh3aGljaCBuZXZlciBwZXJzaXN0KS5cblx0XHR0aGlzLnBlcm1pc3Npb25zLmh5ZHJhdGUoaW5pdGlhbFN0YXRlLnBlcm1pc3Npb25zKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5vbkR5bmFtaWNEaWRDaGFuZ2VQZXJtaXNzaW9ucyh0aGlzLmlkKShcblx0XHRcdHNuYXBzaG90ID0+IHRoaXMucGVybWlzc2lvbnMuaHlkcmF0ZShzbmFwc2hvdCkpKTtcblxuXHRcdC8vIFN5bmMgaW5pdGlhbCB6b29tIGFuZCBzaGFyaW5nIHN0YXRlIChhc3luYywgYnV0IGVtaXRzIGV2ZW50cylcblx0XHRjb25zdCBlZmZlY3RpdmVab29tSW5kZXggPSB0aGlzLnpvb21TZXJ2aWNlLmdldEVmZmVjdGl2ZVpvb21JbmRleCh0aGlzLl96b29tSG9zdCwgdGhpcy5faXNFcGhlbWVyYWwpO1xuXHRcdGlmIChlZmZlY3RpdmVab29tSW5kZXggIT09IHRoaXMuX2Jyb3dzZXJab29tSW5kZXgpIHtcblx0XHRcdHZvaWQgdGhpcy5zZXRCcm93c2VyWm9vbUluZGV4KGVmZmVjdGl2ZVpvb21JbmRleCkuY2F0Y2goZSA9PiB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbQnJvd3NlclZpZXdNb2RlbF0gRmFpbGVkIHRvIHNldCBpbml0aWFsIHpvb206YCwgZSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0dm9pZCB0aGlzLnBsYXl3cmlnaHRTZXJ2aWNlLmlzUGFnZVRyYWNrZWQodGhpcy5pZCkudGhlbihzaGFyZWQgPT4gdGhpcy5fc2V0U2hhcmVkV2l0aEFnZW50KHNoYXJlZCkpLmNhdGNoKGUgPT4ge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtCcm93c2VyVmlld01vZGVsXSBGYWlsZWQgdG8gY2hlY2sgaW5pdGlhbCBwYWdlIHRyYWNraW5nOmAsIGUpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gU2V0IHVwIHN0YXRlIHN5bmNocm9uaXphdGlvblxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy56b29tU2VydmljZS5vbkRpZENoYW5nZVpvb20oKHsgaG9zdCwgaXNFcGhlbWVyYWxDaGFuZ2UgfSkgPT4ge1xuXHRcdFx0aWYgKGlzRXBoZW1lcmFsQ2hhbmdlICYmICF0aGlzLl9pc0VwaGVtZXJhbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoaG9zdCA9PT0gdW5kZWZpbmVkIHx8IGhvc3QgPT09IHRoaXMuX3pvb21Ib3N0KSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5zZXRCcm93c2VyWm9vbUluZGV4KFxuXHRcdFx0XHRcdHRoaXMuem9vbVNlcnZpY2UuZ2V0RWZmZWN0aXZlWm9vbUluZGV4KHRoaXMuX3pvb21Ib3N0LCB0aGlzLl9pc0VwaGVtZXJhbClcblx0XHRcdFx0KS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWROYXZpZ2F0ZShlID0+IHtcblx0XHRcdC8vIENsZWFyIGZhdmljb24gb24gbmF2aWdhdGlvbiB0byBhIGRpZmZlcmVudCBob3N0XG5cdFx0XHRpZiAoVVJMLnBhcnNlKGUudXJsKT8uaG9zdCAhPT0gVVJMLnBhcnNlKHRoaXMuX3VybCk/Lmhvc3QpIHtcblx0XHRcdFx0dGhpcy5fZmF2aWNvbiA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fem9vbUhvc3QgPSBwYXJzZVpvb21Ib3N0KGUudXJsKTtcblx0XHRcdHRoaXMuX3VybCA9IGUudXJsO1xuXHRcdFx0dGhpcy5fdGl0bGUgPSBlLnRpdGxlO1xuXHRcdFx0dGhpcy5fY2FuR29CYWNrID0gZS5jYW5Hb0JhY2s7XG5cdFx0XHR0aGlzLl9jYW5Hb0ZvcndhcmQgPSBlLmNhbkdvRm9yd2FyZDtcblx0XHRcdHRoaXMuX2NlcnRpZmljYXRlRXJyb3IgPSBlLmNlcnRpZmljYXRlRXJyb3I7XG5cblx0XHRcdC8vIEFsd2F5cyBmb3JjZUFwcGx5IGJlY2F1c2UgQ2hyb21pdW0gcmVzZXRzIHpvb20gb24gY3Jvc3Mtb3JpZ2luIG5hdmlnYXRpb24sXG5cdFx0XHQvLyBhbmQgYW4gb3JpZ2luIGNoYW5nZSBtYXkgbm90IGNvcnJlc3BvbmQgdG8gYSBob3N0IGNoYW5nZSAoZS5nLiBodHRwXHUyMTkyaHR0cHMpLlxuXHRcdFx0dm9pZCB0aGlzLnNldEJyb3dzZXJab29tSW5kZXgoXG5cdFx0XHRcdHRoaXMuem9vbVNlcnZpY2UuZ2V0RWZmZWN0aXZlWm9vbUluZGV4KHRoaXMuX3pvb21Ib3N0LCB0aGlzLl9pc0VwaGVtZXJhbCksXG5cdFx0XHRcdHRydWVcblx0XHRcdCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUxvYWRpbmdTdGF0ZShlID0+IHtcblx0XHRcdHRoaXMuX2xvYWRpbmcgPSBlLmxvYWRpbmc7XG5cdFx0XHR0aGlzLl9lcnJvciA9IGUuZXJyb3I7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZURldlRvb2xzU3RhdGUoZSA9PiB7XG5cdFx0XHR0aGlzLl9pc0RldlRvb2xzT3BlbiA9IGUuaXNEZXZUb29sc09wZW47XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZVRpdGxlKGUgPT4ge1xuXHRcdFx0dGhpcy5fdGl0bGUgPSBlLnRpdGxlO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VGYXZpY29uKGUgPT4ge1xuXHRcdFx0dGhpcy5fZmF2aWNvbiA9IGUuZmF2aWNvbjtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlRm9jdXMoKHsgZm9jdXNlZCB9KSA9PiB7XG5cdFx0XHR0aGlzLl9mb2N1c2VkID0gZm9jdXNlZDtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSgoeyB2aXNpYmxlIH0pID0+IHtcblx0XHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLm9uRHluYW1pY0RpZENoYW5nZURldmljZUVtdWxhdGlvbih0aGlzLmlkKShkZXZpY2UgPT4ge1xuXHRcdFx0aWYgKCFzdHJ1Y3R1cmFsRXF1YWxzKHRoaXMuX2RldmljZSwgZGV2aWNlKSkge1xuXHRcdFx0XHR0aGlzLl9kZXZpY2UgPSBkZXZpY2U7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGV2aWNlLmZpcmUoZGV2aWNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlRWxlbWVudFNlbGVjdGlvblN0YXRlKHN0YXRlID0+IHtcblx0XHRcdGlmIChzdGF0ZS5hY3RpdmUgJiYgIXRoaXMuX2VsZW1lbnRTZWxlY3Rpb25TdGF0ZS5hY3RpdmUpIHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW50ZWdyYXRlZEJyb3dzZXJBZGRFbGVtZW50VG9DaGF0U3RhcnRFdmVudCwgSW50ZWdyYXRlZEJyb3dzZXJBZGRFbGVtZW50VG9DaGF0U3RhcnRDbGFzc2lmaWNhdGlvbj4oJ2ludGVncmF0ZWRCcm93c2VyLmFkZEVsZW1lbnRUb0NoYXQuc3RhcnQnLCB7fSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9lbGVtZW50U2VsZWN0aW9uU3RhdGUgPSBzdGF0ZTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQXJlYVNlbGVjdGlvbkFjdGl2ZShhY3RpdmUgPT4ge1xuXHRcdFx0dGhpcy5faXNBcmVhU2VsZWN0aW9uQWN0aXZlID0gYWN0aXZlO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucGxheXdyaWdodFNlcnZpY2Uub25EaWRDaGFuZ2VUcmFja2VkUGFnZXMoaWRzID0+IHtcblx0XHRcdHRoaXMuX3NldFNoYXJlZFdpdGhBZ2VudChpZHMuaW5jbHVkZXModGhpcy5pZCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLm9uRGlkQ2hhbmdlU2hhcmluZ0F2YWlsYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNoYXJpbmdTdGF0ZS5maXJlKHRoaXMuc2hhcmluZ1N0YXRlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlUmVtb3RlU3RhdHVzKGlzUmVtb3RlU2Vzc2lvbiA9PiB7XG5cdFx0XHR0aGlzLl9pc1JlbW90ZVNlc3Npb24gPSBpc1JlbW90ZVNlc3Npb247XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0IHVybCgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fdXJsOyB9XG5cdGdldCB0aXRsZSgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fdGl0bGU7IH1cblx0Z2V0IGZhdmljb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2Zhdmljb247IH1cblx0Z2V0IGxvYWRpbmcoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9sb2FkaW5nOyB9XG5cdGdldCBmb2N1c2VkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fZm9jdXNlZDsgfVxuXHRnZXQgdmlzaWJsZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3Zpc2libGU7IH1cblx0Z2V0IGlzRGV2VG9vbHNPcGVuKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faXNEZXZUb29sc09wZW47IH1cblx0Z2V0IGNhbkdvQmFjaygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2NhbkdvQmFjazsgfVxuXHRnZXQgY2FuR29Gb3J3YXJkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fY2FuR29Gb3J3YXJkOyB9XG5cdGdldCBzY3JlZW5zaG90KCk6IFZTQnVmZmVyIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3NjcmVlbnNob3Q7IH1cblx0Z2V0IGVycm9yKCk6IElCcm93c2VyVmlld0xvYWRFcnJvciB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9lcnJvcjsgfVxuXHRnZXQgY2VydGlmaWNhdGVFcnJvcigpOiBJQnJvd3NlclZpZXdDZXJ0aWZpY2F0ZUVycm9yIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2NlcnRpZmljYXRlRXJyb3I7IH1cblx0Z2V0IHN0b3JhZ2VTY29wZSgpOiBCcm93c2VyVmlld1N0b3JhZ2VTY29wZSB7IHJldHVybiB0aGlzLl9zdG9yYWdlU2NvcGU7IH1cblx0Z2V0IGlzUmVtb3RlU2Vzc2lvbigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2lzUmVtb3RlU2Vzc2lvbjsgfVxuXHRnZXQgc2hhcmluZ1N0YXRlKCk6IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlIHtcblx0XHRpZiAoIXRoaXMuYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLmlzU2hhcmluZ0F2YWlsYWJsZSkge1xuXHRcdFx0cmV0dXJuIEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLlVuYXZhaWxhYmxlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2hhcmVkV2l0aEFnZW50ID8gQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUuU2hhcmVkIDogQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUuTm90U2hhcmVkO1xuXHR9XG5cdGdldCB6b29tRmFjdG9yKCk6IG51bWJlciB7IHJldHVybiBicm93c2VyWm9vbUZhY3RvcnNbdGhpcy5fYnJvd3Nlclpvb21JbmRleF07IH1cblx0Z2V0IGNhblpvb21JbigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2Jyb3dzZXJab29tSW5kZXggPCBicm93c2VyWm9vbUZhY3RvcnMubGVuZ3RoIC0gMTsgfVxuXHRnZXQgY2FuWm9vbU91dCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2Jyb3dzZXJab29tSW5kZXggPiAwOyB9XG5cdGdldCBlbGVtZW50U2VsZWN0aW9uU3RhdGUoKTogSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uU3RhdGUgeyByZXR1cm4gdGhpcy5fZWxlbWVudFNlbGVjdGlvblN0YXRlOyB9XG5cdGdldCBpc0FyZWFTZWxlY3Rpb25BY3RpdmUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9pc0FyZWFTZWxlY3Rpb25BY3RpdmU7IH1cblx0Z2V0IGRldmljZSgpOiBJQnJvd3NlckRldmljZVByb2ZpbGUgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZGV2aWNlOyB9XG5cblx0Z2V0IG9uRGlkTmF2aWdhdGUoKTogRXZlbnQ8SUJyb3dzZXJWaWV3TmF2aWdhdGlvbkV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLm9uRHluYW1pY0RpZE5hdmlnYXRlKHRoaXMuaWQpO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlTG9hZGluZ1N0YXRlKCk6IEV2ZW50PElCcm93c2VyVmlld0xvYWRpbmdFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5vbkR5bmFtaWNEaWRDaGFuZ2VMb2FkaW5nU3RhdGUodGhpcy5pZCk7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VGb2N1cygpOiBFdmVudDxJQnJvd3NlclZpZXdGb2N1c0V2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLm9uRHluYW1pY0RpZENoYW5nZUZvY3VzKHRoaXMuaWQpO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlRGV2VG9vbHNTdGF0ZSgpOiBFdmVudDxJQnJvd3NlclZpZXdEZXZUb29sc1N0YXRlRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uub25EeW5hbWljRGlkQ2hhbmdlRGV2VG9vbHNTdGF0ZSh0aGlzLmlkKTtcblx0fVxuXG5cdGdldCBvbkRpZEtleUNvbW1hbmQoKTogRXZlbnQ8SUJyb3dzZXJWaWV3S2V5RG93bkV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLm9uRHluYW1pY0RpZEtleUNvbW1hbmQodGhpcy5pZCk7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VUaXRsZSgpOiBFdmVudDxJQnJvd3NlclZpZXdUaXRsZUNoYW5nZUV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLm9uRHluYW1pY0RpZENoYW5nZVRpdGxlKHRoaXMuaWQpO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlRmF2aWNvbigpOiBFdmVudDxJQnJvd3NlclZpZXdGYXZpY29uQ2hhbmdlRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uub25EeW5hbWljRGlkQ2hhbmdlRmF2aWNvbih0aGlzLmlkKTtcblx0fVxuXG5cdGdldCBvbkRpZEZpbmRJblBhZ2UoKTogRXZlbnQ8SUJyb3dzZXJWaWV3RmluZEluUGFnZVJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5vbkR5bmFtaWNEaWRGaW5kSW5QYWdlKHRoaXMuaWQpO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eSgpOiBFdmVudDxJQnJvd3NlclZpZXdWaXNpYmlsaXR5RXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uub25EeW5hbWljRGlkQ2hhbmdlVmlzaWJpbGl0eSh0aGlzLmlkKTtcblx0fVxuXG5cdGdldCBvbkRpZENsb3NlKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uub25EeW5hbWljRGlkQ2xvc2UodGhpcy5pZCk7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VSZW1vdGVTdGF0dXMoKTogRXZlbnQ8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5vbkR5bmFtaWNEaWRDaGFuZ2VSZW1vdGVTdGF0dXModGhpcy5pZCk7XG5cdH1cblxuXHRnZXQgb25EaWRSZXF1ZXN0UGVybWlzc2lvbigpOiBFdmVudDxJQnJvd3NlclZpZXdQZXJtaXNzaW9uUmVxdWVzdEV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLm9uRHluYW1pY0RpZFJlcXVlc3RQZXJtaXNzaW9uKHRoaXMuaWQpO1xuXHR9XG5cblx0YXN5bmMgbGF5b3V0KGJvdW5kczogSUJyb3dzZXJWaWV3Qm91bmRzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLmxheW91dCh0aGlzLmlkLCBib3VuZHMpO1xuXHR9XG5cblx0YXN5bmMgc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fdmlzaWJsZSA9IHZpc2libGU7IC8vIFNldCBvcHRpbWlzdGljYWxseSBzbyBtb2RlbCBpcyBpbiBzeW5jIGltbWVkaWF0ZWx5XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLnNldFZpc2libGUodGhpcy5pZCwgdmlzaWJsZSk7XG5cdH1cblxuXHRhc3luYyBsb2FkVVJMKHVybDogc3RyaW5nLCBvcHRpb25zPzogSU5hdmlnYXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nTmF2aWdhdGlvblRlbGVtZXRyeShvcHRpb25zPy5zb3VyY2UgPz8gJ3VybElucHV0JywgdXJsKTtcblx0XHR0aGlzLl9vbldpbGxOYXZpZ2F0ZS5maXJlKHVybCk7XG5cblx0XHQvLyBQcmVwZW5kIGh0dHA6Ly8gZm9yIGJhcmUgbG9jYWxob3N0IGF1dGhvcml0aWVzIChlLmcuIFwibG9jYWxob3N0OjMwMDBcIikuXG5cdFx0aWYgKC9ebG9jYWxob3N0KDp8XFwvfCQpL2kudGVzdCh1cmwpKSB7XG5cdFx0XHR1cmwgPSAnaHR0cDovLycgKyB1cmw7XG5cdFx0fSBlbHNlIGlmICghVVJMLnBhcnNlKHVybCk/LnByb3RvY29sKSB7XG5cdFx0XHQvLyBObyBzY2hlbWUgXHUyMDE0IGRlZmF1bHQgdG8gaHR0cDovLzsgc2l0ZXMgdHlwaWNhbGx5IHVwZ3JhZGUgdG8gaHR0cHM6Ly8uXG5cdFx0XHR1cmwgPSAnaHR0cDovLycgKyB1cmw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLmxvYWRVUkwodGhpcy5pZCwgdXJsKTtcblx0fVxuXG5cdGFzeW5jIGdvQmFjaygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ05hdmlnYXRpb25UZWxlbWV0cnkoJ2dvQmFjaycsIHRoaXMuX3VybCk7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLmdvQmFjayh0aGlzLmlkKTtcblx0fVxuXG5cdGFzeW5jIGdvRm9yd2FyZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ05hdmlnYXRpb25UZWxlbWV0cnkoJ2dvRm9yd2FyZCcsIHRoaXMuX3VybCk7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLmdvRm9yd2FyZCh0aGlzLmlkKTtcblx0fVxuXG5cdGFzeW5jIHJlbG9hZChoYXJkPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nTmF2aWdhdGlvblRlbGVtZXRyeSgncmVsb2FkJywgdGhpcy5fdXJsKTtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2UucmVsb2FkKHRoaXMuaWQsIGhhcmQpO1xuXHR9XG5cblx0YXN5bmMgdG9nZ2xlRGV2VG9vbHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLnRvZ2dsZURldlRvb2xzKHRoaXMuaWQpO1xuXHR9XG5cblx0YXN5bmMgY2FwdHVyZVNjcmVlbnNob3Qob3B0aW9ucz86IElCcm93c2VyVmlld0NhcHR1cmVTY3JlZW5zaG90T3B0aW9ucyk6IFByb21pc2U8VlNCdWZmZXI+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5jYXB0dXJlU2NyZWVuc2hvdCh0aGlzLmlkLCBvcHRpb25zKTtcblx0XHQvLyBTdG9yZSBmdWxsLXBhZ2Ugc2NyZWVuc2hvdHMgZm9yIGRpc3BsYXkgaW4gVUkgYXMgcGxhY2Vob2xkZXJzXG5cdFx0aWYgKCFvcHRpb25zPy5zY3JlZW5SZWN0ICYmICFvcHRpb25zPy5wYWdlUmVjdCAmJiAhb3B0aW9ucz8uZnVsbFBhZ2UpIHtcblx0XHRcdHRoaXMuX3NjcmVlbnNob3QgPSByZXN1bHQ7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBmb2N1cyhmb3JjZT86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2UuZm9jdXModGhpcy5pZCwgZm9yY2UpO1xuXHR9XG5cblx0YXN5bmMgZmluZEluUGFnZSh0ZXh0OiBzdHJpbmcsIG9wdGlvbnM/OiBJQnJvd3NlclZpZXdGaW5kSW5QYWdlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5maW5kSW5QYWdlKHRoaXMuaWQsIHRleHQsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgc3RvcEZpbmRJblBhZ2Uoa2VlcFNlbGVjdGlvbj86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uuc3RvcEZpbmRJblBhZ2UodGhpcy5pZCwga2VlcFNlbGVjdGlvbik7XG5cdH1cblxuXHRhc3luYyBnZXRTZWxlY3RlZFRleHQoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2UuZ2V0U2VsZWN0ZWRUZXh0KHRoaXMuaWQpO1xuXHR9XG5cblx0YXN5bmMgY2xlYXJTdG9yYWdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5jbGVhclN0b3JhZ2UodGhpcy5pZCk7XG5cdH1cblxuXHRhc3luYyB0cnVzdENlcnRpZmljYXRlKGhvc3Q6IHN0cmluZywgZmluZ2VycHJpbnQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS50cnVzdENlcnRpZmljYXRlKHRoaXMuaWQsIGhvc3QsIGZpbmdlcnByaW50KTtcblx0fVxuXG5cdGFzeW5jIHVudHJ1c3RDZXJ0aWZpY2F0ZShob3N0OiBzdHJpbmcsIGZpbmdlcnByaW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2UudW50cnVzdENlcnRpZmljYXRlKHRoaXMuaWQsIGhvc3QsIGZpbmdlcnByaW50KTtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZUhpc3RvcnkoZW50cnlJZHM/OiByZWFkb25seSBudW1iZXJbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE1pcnJvciBsb2NhbGx5IHNvIHRoZSB3b3JrYmVuY2ggdXBkYXRlcyBpbW1lZGlhdGVseTsgdGhlIGV2ZW50dWFsXG5cdFx0Ly8gc3RvcmFnZSBjaGFuZ2UgZXZlbnQgZnJvbSB0aGUgbWFpbi1wcm9jZXNzIGZsdXNoIHdpbGwgcmUtaHlkcmF0ZSB0b1xuXHRcdC8vIHRoZSBzYW1lIGNvbnRlbnQuXG5cdFx0aWYgKGVudHJ5SWRzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuaGlzdG9yeS5jbGVhcigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGVudHJ5SWRzKSB7XG5cdFx0XHRcdHRoaXMuaGlzdG9yeS5lbnRyaWVzLmRlbGV0ZShpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5kZWxldGVCcm93c2VySGlzdG9yeSh0aGlzLmlkLCBlbnRyeUlkcyk7XG5cdH1cblxuXHRhc3luYyBzZXRQZXJtaXNzaW9ucyhvcmlnaW46IHN0cmluZywgZ3JhbnRzOiByZWFkb25seSBJUGVybWlzc2lvbkNhdGVnb3J5U3RhdGVbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE1pcnJvciBsb2NhbGx5IHNvIHRoZSB3b3JrYmVuY2ggcmVmbGVjdHMgdGhlIGRlY2lzaW9uIGltbWVkaWF0ZWx5XG5cdFx0dGhpcy5wZXJtaXNzaW9ucy5zZXRNYW55KG9yaWdpbiwgZ3JhbnRzKTtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uuc2V0UGVybWlzc2lvbnModGhpcy5pZCwgb3JpZ2luLCBncmFudHMpO1xuXHR9XG5cblx0YXN5bmMgc2VsZWN0RGV2aWNlKHJlcXVlc3RJZDogc3RyaW5nLCBkZXZpY2VJZDogc3RyaW5nIHwgbnVsbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5zZWxlY3REZXZpY2UodGhpcy5pZCwgcmVxdWVzdElkLCBkZXZpY2VJZCk7XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIGZvcmNlQXBwbHkgV2hlbiB0cnVlLCB0aGUgSVBDIGNhbGwgaXMgbWFkZSBldmVuIGlmIHRoZSBsb2NhbCBjYWNoZWQgem9vbSBpbmRleFxuXHQgKiBhbHJlYWR5IG1hdGNoZXMgdGhlIHJlcXVlc3RlZCB2YWx1ZS4gUGFzcyB0cnVlIGFmdGVyIGNyb3NzLWRvY3VtZW50IG5hdmlnYXRpb24gYmVjYXVzZVxuXHQgKiBDaHJvbWl1bSByZXNldHMgdGhlIHpvb20gdG8gaXRzIHBlci1vcmlnaW4gZGVmYXVsdCwgbWFraW5nIHRoZSBjYWNoZSBzdGFsZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgc2V0QnJvd3Nlclpvb21JbmRleCh6b29tSW5kZXg6IG51bWJlciwgZm9yY2VBcHBseSA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2xhbXBlZCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHpvb21JbmRleCwgYnJvd3Nlclpvb21GYWN0b3JzLmxlbmd0aCAtIDEpKTtcblx0XHRpZiAoIWZvcmNlQXBwbHkgJiYgY2xhbXBlZCA9PT0gdGhpcy5fYnJvd3Nlclpvb21JbmRleCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9icm93c2VyWm9vbUluZGV4ID0gY2xhbXBlZDtcblx0XHRhd2FpdCB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5zZXRCcm93c2VyWm9vbUluZGV4KHRoaXMuaWQsIHRoaXMuX2Jyb3dzZXJab29tSW5kZXgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlWm9vbS5maXJlKCk7XG5cdH1cblxuXHRhc3luYyB6b29tSW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmNhblpvb21Jbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnNldEJyb3dzZXJab29tSW5kZXgodGhpcy5fYnJvd3Nlclpvb21JbmRleCArIDEpO1xuXHRcdGlmICh0aGlzLl96b29tSG9zdCkge1xuXHRcdFx0dGhpcy56b29tU2VydmljZS5zZXRIb3N0Wm9vbUluZGV4KHRoaXMuX3pvb21Ib3N0LCB0aGlzLl9icm93c2VyWm9vbUluZGV4LCB0aGlzLl9pc0VwaGVtZXJhbCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgem9vbU91dCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuY2FuWm9vbU91dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnNldEJyb3dzZXJab29tSW5kZXgodGhpcy5fYnJvd3Nlclpvb21JbmRleCAtIDEpO1xuXHRcdGlmICh0aGlzLl96b29tSG9zdCkge1xuXHRcdFx0dGhpcy56b29tU2VydmljZS5zZXRIb3N0Wm9vbUluZGV4KHRoaXMuX3pvb21Ib3N0LCB0aGlzLl9icm93c2VyWm9vbUluZGV4LCB0aGlzLl9pc0VwaGVtZXJhbCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzZXRab29tKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlZmF1bHRJbmRleCA9IHRoaXMuem9vbVNlcnZpY2UuZ2V0RWZmZWN0aXZlWm9vbUluZGV4KHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdGF3YWl0IHRoaXMuc2V0QnJvd3Nlclpvb21JbmRleChkZWZhdWx0SW5kZXgpO1xuXHRcdGlmICh0aGlzLl96b29tSG9zdCkge1xuXHRcdFx0dGhpcy56b29tU2VydmljZS5zZXRIb3N0Wm9vbUluZGV4KHRoaXMuX3pvb21Ib3N0LCBkZWZhdWx0SW5kZXgsIHRoaXMuX2lzRXBoZW1lcmFsKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRDb25zb2xlTG9ncygpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5nZXRDb25zb2xlTG9ncyh0aGlzLmlkKTtcblx0fVxuXG5cdGFzeW5jIHRvZ2dsZUVsZW1lbnRTZWxlY3Rpb24oZW5hYmxlZD86IGJvb2xlYW4sIG9wdGlvbnM/OiBJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25PcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLnRvZ2dsZUVsZW1lbnRTZWxlY3Rpb24odGhpcy5pZCwgZW5hYmxlZCwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBzZXRFbGVtZW50Q29tbWVudHModXBkYXRlOiBJQnJvd3NlckVsZW1lbnRDb21tZW50c1VwZGF0ZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5zZXRFbGVtZW50Q29tbWVudHModGhpcy5pZCwgdXBkYXRlKTtcblx0fVxuXG5cdGFzeW5jIHRvZ2dsZUFyZWFTZWxlY3Rpb24oZW5hYmxlZD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2UudG9nZ2xlQXJlYVNlbGVjdGlvbih0aGlzLmlkLCBlbmFibGVkKTtcblx0fVxuXG5cdGdldCBvbkRpZFNlbGVjdEVsZW1lbnQoKTogRXZlbnQ8SUVsZW1lbnREYXRhPiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLm9uRHluYW1pY0RpZFNlbGVjdEVsZW1lbnQodGhpcy5pZCk7XG5cdH1cblxuXHRnZXQgb25EaWRSZW1vdmVFbGVtZW50Q29tbWVudCgpOiBFdmVudDxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uub25EeW5hbWljRGlkUmVtb3ZlRWxlbWVudENvbW1lbnQodGhpcy5pZCk7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VFbGVtZW50U2VsZWN0aW9uU3RhdGUoKTogRXZlbnQ8SUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uU3RhdGU+IHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVmlld1NlcnZpY2Uub25EeW5hbWljRGlkQ2hhbmdlRWxlbWVudFNlbGVjdGlvblN0YXRlKHRoaXMuaWQpO1xuXHR9XG5cblx0Z2V0IG9uRGlkUGlja0FyZWEoKTogRXZlbnQ8SUJyb3dzZXJWaWV3UmVjdCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5vbkR5bmFtaWNEaWRQaWNrQXJlYSh0aGlzLmlkKTtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZUFyZWFTZWxlY3Rpb25BY3RpdmUoKTogRXZlbnQ8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5vbkR5bmFtaWNEaWRDaGFuZ2VBcmVhU2VsZWN0aW9uQWN0aXZlKHRoaXMuaWQpO1xuXHR9XG5cblx0YXN5bmMgc2V0RGV2aWNlKGRldmljZTogSUJyb3dzZXJEZXZpY2VQcm9maWxlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gVXBkYXRlIG1vZGVsIHN0YXRlIG9wdGltaXN0aWNhbGx5IHNvIGRlcGVuZGVudCBVSSByZWFjdHMgaW1tZWRpYXRlbHk7XG5cdFx0Ly8gdGhlIGVjaG8gZnJvbSB0aGUgbWFpbiBwcm9jZXNzIGlzIGZpbHRlcmVkIGJ5IGRlZXAgY29tcGFyaXNvbi5cblx0XHRpZiAoIXN0cnVjdHVyYWxFcXVhbHModGhpcy5fZGV2aWNlLCBkZXZpY2UpKSB7XG5cdFx0XHR0aGlzLl9kZXZpY2UgPSBkZXZpY2U7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURldmljZS5maXJlKGRldmljZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJWaWV3U2VydmljZS5zZXREZXZpY2VFbXVsYXRpb24odGhpcy5pZCwgZGV2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNIQVJFX0RPTlRfQVNLX0tFWSA9ICdicm93c2VyVmlldy5zaGFyZVdpdGhBZ2VudC5kb250QXNrQWdhaW4nO1xuXG5cdGFzeW5jIHNldFNoYXJlZFdpdGhBZ2VudChzaGFyZWQ6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoc2hhcmVkKSB7XG5cdFx0XHQvLyBCbG9jayBzaGFyaW5nIHdoZW4gdGhlIGN1cnJlbnQgcGFnZSBVUkwgaXMgZGVuaWVkIGJ5IG5ldHdvcmsgcG9saWN5LlxuXHRcdFx0aWYgKHRoaXMuX3VybCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSh0aGlzLl91cmwpO1xuXHRcdFx0XHRcdGlmICghdGhpcy5hZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLmlzVXJpQWxsb3dlZCh1cmkpKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuaW5mbyhcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2Jyb3dzZXJWaWV3LnNoYXJlQmxvY2tlZC50aXRsZScsIFwiQ2Fubm90IFNoYXJlIHdpdGggQWdlbnRcIiksXG5cdFx0XHRcdFx0XHRcdHRoaXMuYWdlbnROZXR3b3JrRmlsdGVyU2VydmljZS5mb3JtYXRFcnJvcih1cmkpLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggeyB9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0b3JlZENob2ljZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihCcm93c2VyVmlld01vZGVsLlNIQVJFX0RPTlRfQVNLX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXG5cdFx0XHRpZiAoIXN0b3JlZENob2ljZSkge1xuXHRcdFx0XHQvLyBGaXJzdCB0aW1lIChvciBubyBzdG9yZWQgcHJlZmVyZW5jZSkgLS0gYXNrLlxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0dHlwZTogJ3F1ZXN0aW9uJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2Jyb3dzZXJWaWV3LnNoYXJlV2l0aEFnZW50LnRpdGxlJywgJ1NoYXJlIHdpdGggQWdlbnQ/JyksXG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2Jyb3dzZXJWaWV3LnNoYXJlV2l0aEFnZW50Lm1lc3NhZ2UnLCAnU2hhcmUgdGhpcyBicm93c2VyIHBhZ2Ugd2l0aCB0aGUgYWdlbnQ/JyksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZShcblx0XHRcdFx0XHRcdCdicm93c2VyVmlldy5zaGFyZVdpdGhBZ2VudC5kZXRhaWwnLFxuXHRcdFx0XHRcdFx0J1RoZSBhZ2VudCB3aWxsIGJlIGFibGUgdG8gcmVhZCBhbmQgbW9kaWZ5IGJyb3dzZXIgY29udGVudCBhbmQgc2F2ZWQgZGF0YSwgaW5jbHVkaW5nIGNvb2tpZXMuJ1xuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2Jyb3dzZXJWaWV3LnNoYXJlV2l0aEFnZW50LmFsbG93JywgJyYmQWxsb3cnKSxcblx0XHRcdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdicm93c2VyVmlldy5zaGFyZVdpdGhBZ2VudC5kZW55JywgJ0RlbnknKSxcblx0XHRcdFx0XHRjaGVja2JveDogeyBsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXJWaWV3LnNoYXJlV2l0aEFnZW50LmRvbnRBc2tBZ2FpbicsIFwiRG9uJ3QgYXNrIGFnYWluXCIpLCBjaGVja2VkOiBmYWxzZSB9LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBPbmx5IHBlcnNpc3QgXCJkb24ndCBhc2sgYWdhaW5cIiBpZiB1c2VyIGFjY2VwdGVkIHNoYXJpbmcsIHNvIHRoZSBidXR0b24gZG9lc24ndCBqdXN0IGRvIG5vdGhpbmcuXG5cdFx0XHRcdGlmIChyZXN1bHQuY29uZmlybWVkICYmIHJlc3VsdC5jaGVja2JveENoZWNrZWQpIHtcblx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEJyb3dzZXJWaWV3TW9kZWwuU0hBUkVfRE9OVF9BU0tfS0VZLCByZXN1bHQuY29uZmlybWVkLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEludGVncmF0ZWRCcm93c2VyU2hhcmVXaXRoQWdlbnRFdmVudCwgSW50ZWdyYXRlZEJyb3dzZXJTaGFyZVdpdGhBZ2VudENsYXNzaWZpY2F0aW9uPihcblx0XHRcdFx0XHQnaW50ZWdyYXRlZEJyb3dzZXIuc2hhcmVXaXRoQWdlbnQnLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHNoYXJlZDogcmVzdWx0LmNvbmZpcm1lZCxcblx0XHRcdFx0XHRcdGRvbnRBc2tBZ2FpbjogcmVzdWx0LmNoZWNrYm94Q2hlY2tlZCA/PyBmYWxzZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0KTtcblxuXHRcdFx0XHRpZiAoIXJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEludGVncmF0ZWRCcm93c2VyU2hhcmVXaXRoQWdlbnRFdmVudCwgSW50ZWdyYXRlZEJyb3dzZXJTaGFyZVdpdGhBZ2VudENsYXNzaWZpY2F0aW9uPihcblx0XHRcdFx0XHQnaW50ZWdyYXRlZEJyb3dzZXIuc2hhcmVXaXRoQWdlbnQnLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHNoYXJlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGRvbnRBc2tBZ2FpbjogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5wbGF5d3JpZ2h0U2VydmljZS5zdGFydFRyYWNraW5nUGFnZSh0aGlzLmlkKTtcblx0XHRcdHRoaXMuX3NldFNoYXJlZFdpdGhBZ2VudCh0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5wbGF5d3JpZ2h0U2VydmljZS5zdG9wVHJhY2tpbmdQYWdlKHRoaXMuaWQpO1xuXHRcdFx0dGhpcy5fc2V0U2hhcmVkV2l0aEFnZW50KGZhbHNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFNoYXJlZFdpdGhBZ2VudChpc1NoYXJlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChpc1NoYXJlZCAhPT0gdGhpcy5fc2hhcmVkV2l0aEFnZW50KSB7XG5cdFx0XHR0aGlzLl9zaGFyZWRXaXRoQWdlbnQgPSBpc1NoYXJlZDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2hhcmluZ1N0YXRlLmZpcmUodGhpcy5zaGFyaW5nU3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbG9hZEhpc3RvcnlFbnRyaWVzKGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoa2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdHRoaXMuaGlzdG9yeS5lbnRyaWVzLmh5ZHJhdGUocGFyc2VIaXN0b3J5U25hcHNob3Q8SVNlcmlhbGl6ZWRCcm93c2VySGlzdG9yeUVudHJpZXNTbmFwc2hvdD4ocmF3KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWxvYWRIaXN0b3J5RmF2aWNvbnMoa2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0dGhpcy5oaXN0b3J5LmZhdmljb25zLmh5ZHJhdGUocGFyc2VIaXN0b3J5U25hcHNob3Q8SVNlcmlhbGl6ZWRCcm93c2VyRmF2aWNvbnNTbmFwc2hvdD4ocmF3KSk7XG5cdH1cblxuXHQvKipcblx0ICogTG9nIG5hdmlnYXRpb24gdGVsZW1ldHJ5IGV2ZW50XG5cdCAqL1xuXHRwcml2YXRlIGxvZ05hdmlnYXRpb25UZWxlbWV0cnkobmF2aWdhdGlvblR5cGU6IEludGVncmF0ZWRCcm93c2VyTmF2aWdhdGlvbkV2ZW50WyduYXZpZ2F0aW9uVHlwZSddLCB1cmw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGxldCBsb2NhbGhvc3Q6IGJvb2xlYW47XG5cdFx0dHJ5IHtcblx0XHRcdGxvY2FsaG9zdCA9IGlzTG9jYWxob3N0QXV0aG9yaXR5KG5ldyBVUkwodXJsKS5ob3N0KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdGxvY2FsaG9zdCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEludGVncmF0ZWRCcm93c2VyTmF2aWdhdGlvbkV2ZW50LCBJbnRlZ3JhdGVkQnJvd3Nlck5hdmlnYXRpb25DbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHQnaW50ZWdyYXRlZEJyb3dzZXIubmF2aWdhdGlvbicsXG5cdFx0XHR7XG5cdFx0XHRcdG5hdmlnYXRpb25UeXBlLFxuXHRcdFx0XHRpc0xvY2FsaG9zdDogbG9jYWxob3N0XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25XaWxsRGlzcG9zZS5maXJlKCk7XG5cblx0XHQvLyBTdG9wIHNoYXJpbmcgd2l0aCB0aGUgYWdlbnQgYmVmb3JlIGRlc3Ryb3lpbmcgdGhlIHZpZXcgc28gdGhlXG5cdFx0Ly8gdHJhY2tlZC1wYWdlcyBzZXQgc3RheXMgaW4gc3luYyB3aXRoIGxpdmUgdmlld3MuXG5cdFx0aWYgKHRoaXMuX3NoYXJlZFdpdGhBZ2VudCkge1xuXHRcdFx0dm9pZCB0aGlzLnBsYXl3cmlnaHRTZXJ2aWNlLnN0b3BUcmFja2luZ1BhZ2UodGhpcy5pZCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYW4gdXAgdGhlIGJyb3dzZXIgdmlldyB3aGVuIHRoZSBtb2RlbCBpcyBkaXNwb3NlZFxuXHRcdHZvaWQgdGhpcy5icm93c2VyVmlld1NlcnZpY2UuZGVzdHJveUJyb3dzZXJWaWV3KHRoaXMuaWQpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyxXQUFXO0FBSXBCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DO0FBQUEsRUFDQztBQUFBLE9BR007QUFDUDtBQUFBLEVBQ0M7QUFBQSxPQUVNO0FBR1A7QUFBQSxFQVdDO0FBQUEsRUFZQTtBQUFBLEVBQ0E7QUFBQSxPQUtNO0FBQ1AsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQkFBMkI7QUFFN0IsSUFBVywwQkFBWCxrQkFBV0EsNkJBQVg7QUFFTixFQUFBQSx5QkFBQSxZQUFTO0FBRVQsRUFBQUEseUJBQUEsZUFBWTtBQUVaLEVBQUFBLHlCQUFBLGlCQUFjO0FBTkcsU0FBQUE7QUFBQSxHQUFBO0FBVVgsU0FBUyxzQkFBc0IsY0FBa0MsV0FBbUIsZUFBZSxPQUFnQjtBQUN6SCxRQUFNLFNBQVMsSUFBSSxNQUFNLFNBQVM7QUFDbEMsTUFBSSxDQUFDLFVBQVcsT0FBTyxhQUFhLFdBQVcsQ0FBQyxPQUFPLE1BQU87QUFDN0QsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLGlCQUFpQixDQUFDLGdCQUFnQixpQkFBaUIsZ0JBQWdCO0FBQ3RFLFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxZQUFZLElB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
