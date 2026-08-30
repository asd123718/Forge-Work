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
import * as os from "os";
import { IntervalTimer, Throttler, timeout } from "../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { isMacintosh, isWindows } from "../../../base/common/platform.js";
import { getWindowsReleaseSync } from "../../../base/node/windowsVersion.js";
import { IMeteredConnectionService } from "../../meteredConnection/common/meteredConnection.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { ILifecycleMainService, LifecycleMainPhase } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { IRequestService } from "../../request/common/request.js";
import { StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { IApplicationStorageMainService } from "../../storage/electron-main/storageMainService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { DisablementReason, State, StateType, UpdateType } from "../common/update.js";
const LAST_KNOWN_VERSION_STORAGE_KEY = "abstractUpdateService/lastKnownVersion";
function createUpdateURL(baseUpdateUrl, platform, quality, commit, options) {
  const url = new URL(`${baseUpdateUrl}/api/update/${platform}/${quality}/${commit}`);
  if (options?.background) {
    url.searchParams.set("bg", "true");
  }
  url.searchParams.set("u", options?.internalOrg ?? "none");
  return url.toString();
}
function getUpdateRequestHeaders(productVersion) {
  if (isMacintosh) {
    const darwinVersion = os.release();
    return {
      "User-Agent": `Code/${productVersion} Darwin/${darwinVersion}`
    };
  }
  if (isWindows) {
    const match = getWindowsReleaseSync().match(/^(\d+\.\d+)/);
    if (match) {
      return {
        "User-Agent": `Code/${productVersion} Electron/${process.versions.electron} Windows NT ${match[1]}`
      };
    }
  }
  return void 0;
}
function isCancellableState(type) {
  switch (type) {
    case StateType.CheckingForUpdates:
    case StateType.AvailableForDownload:
    case StateType.Downloading:
    case StateType.Downloaded:
    case StateType.Updating:
    case StateType.Ready:
    case StateType.Overwriting:
      return true;
    default:
      return false;
  }
}
let AbstractUpdateService = class extends Disposable {
  constructor(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService, telemetryService, applicationStorageMainService, meteredConnectionService, supportsUpdateOverwrite) {
    super();
    this.lifecycleMainService = lifecycleMainService;
    this.configurationService = configurationService;
    this.environmentMainService = environmentMainService;
    this.requestService = requestService;
    this.logService = logService;
    this.productService = productService;
    this.telemetryService = telemetryService;
    this.applicationStorageMainService = applicationStorageMainService;
    this.meteredConnectionService = meteredConnectionService;
    this.supportsUpdateOverwrite = supportsUpdateOverwrite;
    this._state = State.Uninitialized;
    this._overwrite = false;
    this._hasCheckedForOverwriteOnQuit = false;
    this.overwriteUpdatesCheckInterval = this._register(new IntervalTimer());
    this._internalOrg = void 0;
    /** Disabled for a non-reversible reason (e.g. not built, missing config); ignores `update.mode` changes. */
    this._disabledPermanently = false;
    /** Whether one-time platform init (e.g. background update GC, pending update resume) has run. */
    this._postInitialized = false;
    /** Cancels the pending scheduled update check, if any. */
    this.scheduler = this._register(new MutableDisposable());
    /** Serializes reconfiguration so overlapping `update.mode` changes settle on the latest value. */
    this.reconfigureThrottler = this._register(new Throttler());
    this._onStateChange = this._register(new Emitter());
    this.onStateChange = this._onStateChange.event;
    lifecycleMainService.when(LifecycleMainPhase.AfterWindowOpen).finally(() => this.initialize());
  }
  get state() {
    return this._state;
  }
  setState(state) {
    if (state.type === StateType.Updating) {
      this.logService.trace("update#setState", state.type);
    } else {
      this.logService.info("update#setState", state.type);
    }
    this._state = state;
    this._onStateChange.fire(state);
    if (state.type === StateType.Idle && (state.error || state.notAvailable)) {
      this._state = State.Idle(state.updateType);
    }
    if (this.supportsUpdateOverwrite) {
      if (state.type === StateType.Ready) {
        this.overwriteUpdatesCheckInterval.cancelAndSet(() => this.checkForOverwriteUpdates(), 5 * 60 * 1e3);
      } else {
        this.overwriteUpdatesCheckInterval.cancel();
      }
    }
  }
  /**
   * This must be called before any other call. This is a performance
   * optimization, to avoid using extra CPU cycles before first window open.
   * https://github.com/microsoft/vscode/issues/89784
   */
  async initialize() {
    if (!this.environmentMainService.isBuilt) {
      this.setDisabledPermanently(DisablementReason.NotBuilt);
      return;
    }
    await this.trackVersionChange();
    if (this.environmentMainService.disableUpdates) {
      this.setDisabledPermanently(DisablementReason.DisabledByEnvironment);
      this.logService.info("update#ctor - updates are disabled by the environment");
      return;
    }
    if (!this.productService.updateUrl || !this.productService.commit) {
      this.setDisabledPermanently(DisablementReason.MissingConfiguration);
      this.logService.info("update#ctor - updates are disabled as there is no update URL");
      return;
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("update.mode")) {
        this.reconfigure().catch((err) => this.logService.error("update#reconfigure - failed to apply update mode change", err));
      }
    }));
    await this.reconfigure();
  }
  /**
   * Evaluates the current `update.mode` setting (and its policy) and brings the service into the matching state.
   * Runs on startup and on every change, enabling or disabling updates without a restart.
   */
  reconfigure() {
    return this.reconfigureThrottler.queue(() => this.doReconfigure());
  }
  async doReconfigure() {
    if (this._disabledPermanently) {
      return;
    }
    const updateMode = this.configurationService.getValue("update.mode");
    const updateModeInspection = this.configurationService.inspect("update.mode");
    const policyDisablesUpdates = updateModeInspection.policyValue !== void 0 && !this.getProductQuality(updateModeInspection.policyValue);
    const quality = this.getProductQuality(updateMode);
    if (!quality) {
      const reason = policyDisablesUpdates ? DisablementReason.Policy : DisablementReason.ManuallyDisabled;
      if (this._state.type === StateType.Disabled && this._state.reason === reason) {
        return;
      }
      await this.disable(reason);
      return;
    }
    if (!this.buildUpdateFeedUrl(quality, this.productService.commit)) {
      this.setDisabledPermanently(DisablementReason.InvalidConfiguration);
      this.logService.info("update#ctor - updates are disabled as the update URL is badly formed");
      return;
    }
    this.quality = quality;
    if (this._state.type === StateType.Disabled || this._state.type === StateType.Uninitialized) {
      this.setState(State.Idle(this.getUpdateType()));
    }
    if (!this._postInitialized) {
      this._postInitialized = true;
      await this.postInitialize();
    }
    this.scheduleAccordingToMode(updateMode);
  }
  /**
   * Disables updates for a reversible reason (user preference or policy), cancelling the scheduled check loop
   * and any in-flight or pending update before moving to Disabled.
   */
  async disable(reason) {
    this.scheduler.clear();
    if (isCancellableState(this._state.type)) {
      this.setState(State.Cancelling);
    }
    try {
      await this.cancelUpdate();
    } catch (err) {
      this.logService.warn("update#disable - failed to cancel pending update", err);
    }
    this.quality = void 0;
    if (reason === DisablementReason.Policy) {
      this.logService.info("update#disable - updates are disabled by policy");
    } else {
      this.logService.info("update#disable - updates are disabled by user preference");
    }
    this.setState(State.Disabled(reason));
  }
  /** Disables updates for a non-reversible reason; subsequent `update.mode` changes are ignored. */
  setDisabledPermanently(reason) {
    this._disabledPermanently = true;
    this.scheduler.clear();
    this.setState(State.Disabled(reason));
  }
  scheduleAccordingToMode(updateMode) {
    this.scheduler.clear();
    if (updateMode === "manual") {
      this.logService.info("update#ctor - manual checks only; automatic updates are disabled by user preference");
      return;
    }
    if (updateMode === "start") {
      this.logService.info("update#ctor - startup checks only; automatic updates are disabled by user preference");
      this.scheduleCheckForUpdates(30 * 1e3, false);
    } else {
      this.scheduleCheckForUpdates(30 * 1e3, true);
    }
  }
  async trackVersionChange() {
    await this.applicationStorageMainService.whenReady;
    let from;
    const raw = this.applicationStorageMainService.get(LAST_KNOWN_VERSION_STORAGE_KEY, StorageScope.APPLICATION);
    if (typeof raw === "string") {
      try {
        from = JSON.parse(raw);
      } catch (error) {
      }
    }
    const to = {
      version: this.productService.version,
      commit: this.productService.commit,
      timestamp: Date.now()
    };
    if (from?.commit === to.commit) {
      return;
    }
    this.applicationStorageMainService.store(LAST_KNOWN_VERSION_STORAGE_KEY, JSON.stringify(to), StorageScope.APPLICATION, StorageTarget.MACHINE);
    if (!from) {
      return;
    }
    this.telemetryService.publicLog2("update:versionChanged", {
      fromVersion: from.version,
      fromCommit: from.commit,
      fromVersionTime: from.timestamp,
      toVersion: to.version,
      toCommit: to.commit,
      timeToUpdateMs: to.timestamp - from.timestamp,
      updateMode: this.configurationService.getValue("update.mode")
    });
  }
  getProductQuality(updateMode) {
    return updateMode === "none" ? void 0 : this.productService.quality;
  }
  scheduleCheckForUpdates(delay = 60 * 60 * 1e3, repeat = true) {
    const promise = timeout(delay);
    this.scheduler.value = toDisposable(() => promise.cancel());
    promise.then(() => this.checkForUpdates(false)).then(() => {
      if (repeat) {
        this.scheduleCheckForUpdates(60 * 60 * 1e3, true);
      }
    }).catch((err) => {
      if (!isCancellationError(err)) {
        this.logService.error(err);
      }
    });
  }
  async checkForUpdates(explicit) {
    this.logService.trace("update#checkForUpdates, state = ", this.state.type);
    if (this.state.type !== StateType.Idle) {
      return;
    }
    this.doCheckForUpdates(explicit);
  }
  async downloadUpdate(explicit) {
    this.logService.trace("update#downloadUpdate, state = ", this.state.type);
    if (this.state.type !== StateType.AvailableForDownload) {
      return;
    }
    if (!explicit && this.meteredConnectionService.isConnectionMetered) {
      this.logService.info("update#downloadUpdate - skipping download because connection is metered");
      return;
    }
    await this.doDownloadUpdate(this.state);
  }
  async doDownloadUpdate(state) {
  }
  async applyUpdate() {
    this.logService.trace("update#applyUpdate, state = ", this.state.type);
    if (this.state.type !== StateType.Downloaded) {
      return;
    }
    await this.doApplyUpdate();
  }
  async doApplyUpdate() {
  }
  async quitAndInstall() {
    this.logService.trace("update#quitAndInstall, state = ", this.state.type);
    if (this.state.type !== StateType.Ready) {
      return void 0;
    }
    if (this.supportsUpdateOverwrite && !this._hasCheckedForOverwriteOnQuit) {
      this._hasCheckedForOverwriteOnQuit = true;
      const didOverwrite = await this.checkForOverwriteUpdates(true);
      if (didOverwrite) {
        this.logService.info("update#quitAndInstall(): overwrite update detected, postponing quitAndInstall");
        return;
      }
    }
    const readyState = this.state;
    this.setState(State.Restarting(this.state.update));
    this.logService.trace("update#quitAndInstall(): before lifecycle quit()");
    this.lifecycleMainService.quit(
      true
      /* will restart */
    ).then((vetod) => {
      this.logService.trace(`update#quitAndInstall(): after lifecycle quit() with veto: ${vetod}`);
      if (vetod) {
        this.logService.info("update#quitAndInstall(): quit was vetoed, restoring Ready state");
        this.setState(readyState);
        return;
      }
      this.logService.trace("update#quitAndInstall(): running raw#quitAndInstall()");
      this.doQuitAndInstall();
    });
    return Promise.resolve(void 0);
  }
  async checkForOverwriteUpdates(explicit = false) {
    if (this._state.type !== StateType.Ready) {
      return false;
    }
    const pendingUpdateCommit = this._state.update.version;
    if (!pendingUpdateCommit || pendingUpdateCommit === "unknown") {
      return false;
    }
    let isLatest;
    try {
      const cts = new CancellationTokenSource();
      const timeoutPromise = timeout(2e3).then(() => {
        cts.cancel();
        return void 0;
      });
      isLatest = await Promise.race([this.isLatestVersion(pendingUpdateCommit, cts.token), timeoutPromise]);
      cts.dispose();
    } catch (error) {
      this.logService.warn("update#checkForOverwriteUpdates(): failed to check for updates, proceeding with restart");
      this.logService.warn(error);
      return false;
    }
    if (isLatest === false && this._state.type === StateType.Ready) {
      this.logService.info("update#readyStateCheck: newer update available, restarting update machinery");
      try {
        await this.cancelPendingUpdate();
      } catch (error) {
        this.logService.error("update#checkForOverwriteUpdates(): failed to cancel pending update, aborting overwrite");
        this.logService.error(error);
        return false;
      }
      this._overwrite = true;
      this.setState(State.Overwriting(this._state.update, explicit));
      this.doCheckForUpdates(explicit, pendingUpdateCommit);
      return true;
    }
    return false;
  }
  async isLatestVersion(commit, token = CancellationToken.None) {
    if (!this.quality) {
      return void 0;
    }
    const mode = this.configurationService.getValue("update.mode");
    if (mode === "none") {
      return void 0;
    }
    const url = this.buildUpdateFeedUrl(this.quality, commit ?? this.productService.commit, { internalOrg: this.getInternalOrg() });
    if (!url) {
      return void 0;
    }
    const headers = getUpdateRequestHeaders(this.productService.version);
    this.logService.trace("update#isLatestVersion() - checking update server", { url, headers });
    try {
      const context = await this.requestService.request({ url, headers, callSite: "updateService.isLatestVersion" }, token);
      const statusCode = context.res.statusCode;
      this.logService.trace("update#isLatestVersion() - response", { statusCode });
      return statusCode === 204;
    } catch (error) {
      this.logService.error("update#isLatestVersion(): failed to check for updates");
      this.logService.error(error);
      return void 0;
    }
  }
  async _applySpecificUpdate(packagePath) {
  }
  async setInternalOrg(internalOrg) {
    if (this._internalOrg === internalOrg) {
      return;
    }
    this.logService.info("update#setInternalOrg", internalOrg);
    this._internalOrg = internalOrg;
  }
  getInternalOrg() {
    return this._internalOrg;
  }
  getUpdateType() {
    return UpdateType.Archive;
  }
  doQuitAndInstall() {
  }
  async postInitialize() {
  }
  async cancelPendingUpdate() {
  }
  /**
   * Aborts in-flight or pending update work when updates are being disabled at runtime. The default cancels a
   * pending update; platform services override this to also abort in-flight checks/downloads.
   */
  async cancelUpdate() {
    await this.cancelPendingUpdate();
  }
};
AbstractUpdateService = __decorateClass([
  __decorateParam(0, ILifecycleMainService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IEnvironmentMainService),
  __decorateParam(3, IRequestService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IProductService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IApplicationStorageMainService),
  __decorateParam(8, IMeteredConnectionService)
], AbstractUpdateService);
export {
  AbstractUpdateService,
  createUpdateURL,
  getUpdateRequestHeaders
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXBkYXRlXFxlbGVjdHJvbi1tYWluXFxhYnN0cmFjdFVwZGF0ZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgSW50ZXJ2YWxUaW1lciwgVGhyb3R0bGVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZ2V0V2luZG93c1JlbGVhc2VTeW5jIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3dpbmRvd3NWZXJzaW9uLmpzJztcbmltcG9ydCB7IElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9tZXRlcmVkQ29ubmVjdGlvbi9jb21tb24vbWV0ZXJlZENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2VsZWN0cm9uLW1haW4vZW52aXJvbm1lbnRNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlTWFpblNlcnZpY2UsIExpZmVjeWNsZU1haW5QaGFzZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9lbGVjdHJvbi1tYWluL2xpZmVjeWNsZU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElBcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvZWxlY3Ryb24tbWFpbi9zdG9yYWdlTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBdmFpbGFibGVGb3JEb3dubG9hZCwgRGlzYWJsZW1lbnRSZWFzb24sIElVcGRhdGVTZXJ2aWNlLCBTdGF0ZSwgU3RhdGVUeXBlLCBVcGRhdGVUeXBlIH0gZnJvbSAnLi4vY29tbW9uL3VwZGF0ZS5qcyc7XG5cbmNvbnN0IExBU1RfS05PV05fVkVSU0lPTl9TVE9SQUdFX0tFWSA9ICdhYnN0cmFjdFVwZGF0ZVNlcnZpY2UvbGFzdEtub3duVmVyc2lvbic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVVwZGF0ZVVSTE9wdGlvbnMge1xuXHRyZWFkb25seSBiYWNrZ3JvdW5kPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaW50ZXJuYWxPcmc/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVVcGRhdGVVUkwoYmFzZVVwZGF0ZVVybDogc3RyaW5nLCBwbGF0Zm9ybTogc3RyaW5nLCBxdWFsaXR5OiBzdHJpbmcsIGNvbW1pdDogc3RyaW5nLCBvcHRpb25zPzogSVVwZGF0ZVVSTE9wdGlvbnMpOiBzdHJpbmcge1xuXHRjb25zdCB1cmwgPSBuZXcgVVJMKGAke2Jhc2VVcGRhdGVVcmx9L2FwaS91cGRhdGUvJHtwbGF0Zm9ybX0vJHtxdWFsaXR5fS8ke2NvbW1pdH1gKTtcblxuXHRpZiAob3B0aW9ucz8uYmFja2dyb3VuZCkge1xuXHRcdHVybC5zZWFyY2hQYXJhbXMuc2V0KCdiZycsICd0cnVlJyk7XG5cdH1cblxuXHR1cmwuc2VhcmNoUGFyYW1zLnNldCgndScsIG9wdGlvbnM/LmludGVybmFsT3JnID8/ICdub25lJyk7XG5cblx0cmV0dXJuIHVybC50b1N0cmluZygpO1xufVxuXG4vKipcbiAqIEJ1aWxkcyBjb21tb24gaGVhZGVycyBmb3IgdXBkYXRlIHJlcXVlc3RzLCBpbmNsdWRpbmcgdGhvc2UgaXNzdWVkXG4gKiB2aWEgRWxlY3Ryb24ncyBhdXRvLXVwZGF0ZXIgKGUuZy4gc2V0RmVlZFVSTCh7IHVybCwgaGVhZGVycyB9KSkgYW5kXG4gKiBtYW51YWwgSFRUUCByZXF1ZXN0cyB0aGF0IGJ5cGFzcyB0aGUgYXV0by11cGRhdGVyLiBUaGUgaGVhZGVycyBpbmNsdWRlXG4gKiBPUyB2ZXJzaW9uIGluZm9ybWF0aW9uIHdoaWNoIHRoZSB1cGRhdGUgc2VydmVyIHVzZXMgZm9yIEVPTCBkZXRlY3Rpb24uXG4gKlxuICogT24gbWFjT1MsIHRoZSBVc2VyLUFnZW50IGluY2x1ZGVzIHRoZSBEYXJ3aW4ga2VybmVsIHZlcnNpb24uXG4gKiBPbiBXaW5kb3dzLCB0aGUgVXNlci1BZ2VudCBpbmNsdWRlcyBhY2N1cmF0ZSBXaW5kb3dzIHZlcnNpb24gZnJvbSB0aGUgcmVnaXN0cnkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRVcGRhdGVSZXF1ZXN0SGVhZGVycyhwcm9kdWN0VmVyc2lvbjogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc01hY2ludG9zaCkge1xuXHRcdGNvbnN0IGRhcndpblZlcnNpb24gPSBvcy5yZWxlYXNlKCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdCdVc2VyLUFnZW50JzogYENvZGUvJHtwcm9kdWN0VmVyc2lvbn0gRGFyd2luLyR7ZGFyd2luVmVyc2lvbn1gXG5cdFx0fTtcblx0fVxuXG5cdGlmIChpc1dpbmRvd3MpIHtcblx0XHRjb25zdCBtYXRjaCA9IGdldFdpbmRvd3NSZWxlYXNlU3luYygpLm1hdGNoKC9eKFxcZCtcXC5cXGQrKS8pO1xuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0J1VzZXItQWdlbnQnOiBgQ29kZS8ke3Byb2R1Y3RWZXJzaW9ufSBFbGVjdHJvbi8ke3Byb2Nlc3MudmVyc2lvbnMuZWxlY3Ryb259IFdpbmRvd3MgTlQgJHttYXRjaFsxXX1gXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCB0eXBlIFVwZGF0ZUVycm9yQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnam9hb21vcmVubyc7XG5cdG1lc3NhZ2VIYXNoOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGhhc2ggb2YgdGhlIGVycm9yIG1lc3NhZ2UuJyB9O1xuXHRjb21tZW50OiAnVGhpcyBpcyB1c2VkIHRvIGtub3cgaG93IG9mdGVuIFZTIENvZGUgdXBkYXRlcyBoYXZlIGZhaWxlZC4nO1xufTtcblxuLyoqXG4gKiBTdGF0ZXMgcmVwcmVzZW50aW5nIGluLWZsaWdodCBvciBwZW5kaW5nIHVwZGF0ZSB3b3JrIHRoYXQgdGFrZXMgdGltZSB0byB0ZWFyIGRvd24gd2hlbiB1cGRhdGVzXG4gKiBhcmUgZGlzYWJsZWQgYXQgcnVudGltZS4gVXNlZCB0byBkZWNpZGUgd2hldGhlciB0byBzdXJmYWNlIGEgdHJhbnNpZW50IGBDYW5jZWxsaW5nYCBzdGF0ZS5cbiAqL1xuZnVuY3Rpb24gaXNDYW5jZWxsYWJsZVN0YXRlKHR5cGU6IFN0YXRlVHlwZSk6IGJvb2xlYW4ge1xuXHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRjYXNlIFN0YXRlVHlwZS5DaGVja2luZ0ZvclVwZGF0ZXM6XG5cdFx0Y2FzZSBTdGF0ZVR5cGUuQXZhaWxhYmxlRm9yRG93bmxvYWQ6XG5cdFx0Y2FzZSBTdGF0ZVR5cGUuRG93bmxvYWRpbmc6XG5cdFx0Y2FzZSBTdGF0ZVR5cGUuRG93bmxvYWRlZDpcblx0XHRjYXNlIFN0YXRlVHlwZS5VcGRhdGluZzpcblx0XHRjYXNlIFN0YXRlVHlwZS5SZWFkeTpcblx0XHRjYXNlIFN0YXRlVHlwZS5PdmVyd3JpdGluZzpcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0VXBkYXRlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVXBkYXRlU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIHF1YWxpdHk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9zdGF0ZTogU3RhdGUgPSBTdGF0ZS5VbmluaXRpYWxpemVkO1xuXHRwcm90ZWN0ZWQgX292ZXJ3cml0ZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9oYXNDaGVja2VkRm9yT3ZlcndyaXRlT25RdWl0OiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgb3ZlcndyaXRlVXBkYXRlc0NoZWNrSW50ZXJ2YWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJ2YWxUaW1lcigpKTtcblx0cHJpdmF0ZSBfaW50ZXJuYWxPcmc6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHQvKiogRGlzYWJsZWQgZm9yIGEgbm9uLXJldmVyc2libGUgcmVhc29uIChlLmcuIG5vdCBidWlsdCwgbWlzc2luZyBjb25maWcpOyBpZ25vcmVzIGB1cGRhdGUubW9kZWAgY2hhbmdlcy4gKi9cblx0cHJpdmF0ZSBfZGlzYWJsZWRQZXJtYW5lbnRseTogYm9vbGVhbiA9IGZhbHNlO1xuXHQvKiogV2hldGhlciBvbmUtdGltZSBwbGF0Zm9ybSBpbml0IChlLmcuIGJhY2tncm91bmQgdXBkYXRlIEdDLCBwZW5kaW5nIHVwZGF0ZSByZXN1bWUpIGhhcyBydW4uICovXG5cdHByaXZhdGUgX3Bvc3RJbml0aWFsaXplZDogYm9vbGVhbiA9IGZhbHNlO1xuXHQvKiogQ2FuY2VscyB0aGUgcGVuZGluZyBzY2hlZHVsZWQgdXBkYXRlIGNoZWNrLCBpZiBhbnkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgc2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0LyoqIFNlcmlhbGl6ZXMgcmVjb25maWd1cmF0aW9uIHNvIG92ZXJsYXBwaW5nIGB1cGRhdGUubW9kZWAgY2hhbmdlcyBzZXR0bGUgb24gdGhlIGxhdGVzdCB2YWx1ZS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSByZWNvbmZpZ3VyZVRocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZXIoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25TdGF0ZUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFN0YXRlPigpKTtcblx0cmVhZG9ubHkgb25TdGF0ZUNoYW5nZTogRXZlbnQ8U3RhdGU+ID0gdGhpcy5fb25TdGF0ZUNoYW5nZS5ldmVudDtcblxuXHRnZXQgc3RhdGUoKTogU3RhdGUge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBzZXRTdGF0ZShzdGF0ZTogU3RhdGUpOiB2b2lkIHtcblx0XHRpZiAoc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLlVwZGF0aW5nKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3VwZGF0ZSNzZXRTdGF0ZScsIHN0YXRlLnR5cGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI3NldFN0YXRlJywgc3RhdGUudHlwZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXRlID0gc3RhdGU7XG5cdFx0dGhpcy5fb25TdGF0ZUNoYW5nZS5maXJlKHN0YXRlKTtcblxuXHRcdC8vIENsZWFyIHRyYW5zaWVudCBvbmUtdGltZSBwcm9wZXJ0aWVzIGZyb20gSWRsZSBzdGF0ZSBhZnRlciBkZWxpdmVyaW5nIHRoZSBldmVudC5cblx0XHQvLyBUaGlzIHByZXZlbnRzIG5ldyB3aW5kb3dzIGZyb20gc2VlaW5nIHN0YWxlIGVycm9yL25vdEF2YWlsYWJsZSBtZXNzYWdlcy5cblx0XHRpZiAoc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLklkbGUgJiYgKHN0YXRlLmVycm9yIHx8IHN0YXRlLm5vdEF2YWlsYWJsZSkpIHtcblx0XHRcdHRoaXMuX3N0YXRlID0gU3RhdGUuSWRsZShzdGF0ZS51cGRhdGVUeXBlKTtcblx0XHR9XG5cblx0XHQvLyBTY2hlZHVsZSA1LW1pbnV0ZSBjaGVja3Mgd2hlbiBpbiBSZWFkeSBzdGF0ZSBhbmQgb3ZlcndyaXRlIGlzIHN1cHBvcnRlZFxuXHRcdGlmICh0aGlzLnN1cHBvcnRzVXBkYXRlT3ZlcndyaXRlKSB7XG5cdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLlJlYWR5KSB7XG5cdFx0XHRcdHRoaXMub3ZlcndyaXRlVXBkYXRlc0NoZWNrSW50ZXJ2YWwuY2FuY2VsQW5kU2V0KCgpID0+IHRoaXMuY2hlY2tGb3JPdmVyd3JpdGVVcGRhdGVzKCksIDUgKiA2MCAqIDEwMDApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5vdmVyd3JpdGVVcGRhdGVzQ2hlY2tJbnRlcnZhbC5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxpZmVjeWNsZU1haW5TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBsaWZlY3ljbGVNYWluU2VydmljZTogSUxpZmVjeWNsZU1haW5TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIHByb3RlY3RlZCBlbnZpcm9ubWVudE1haW5TZXJ2aWNlOiBJRW52aXJvbm1lbnRNYWluU2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByb3RlY3RlZCByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlOiBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UsXG5cdFx0QElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IG1ldGVyZWRDb25uZWN0aW9uU2VydmljZTogSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgc3VwcG9ydHNVcGRhdGVPdmVyd3JpdGU6IGJvb2xlYW4sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRsaWZlY3ljbGVNYWluU2VydmljZS53aGVuKExpZmVjeWNsZU1haW5QaGFzZS5BZnRlcldpbmRvd09wZW4pXG5cdFx0XHQuZmluYWxseSgoKSA9PiB0aGlzLmluaXRpYWxpemUoKSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhpcyBtdXN0IGJlIGNhbGxlZCBiZWZvcmUgYW55IG90aGVyIGNhbGwuIFRoaXMgaXMgYSBwZXJmb3JtYW5jZVxuXHQgKiBvcHRpbWl6YXRpb24sIHRvIGF2b2lkIHVzaW5nIGV4dHJhIENQVSBjeWNsZXMgYmVmb3JlIGZpcnN0IHdpbmRvdyBvcGVuLlxuXHQgKiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvODk3ODRcblx0ICovXG5cdHByb3RlY3RlZCBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmlzQnVpbHQpIHtcblx0XHRcdHRoaXMuc2V0RGlzYWJsZWRQZXJtYW5lbnRseShEaXNhYmxlbWVudFJlYXNvbi5Ob3RCdWlsdCk7XG5cdFx0XHRyZXR1cm47IC8vIHVwZGF0ZXMgYXJlIG5ldmVyIGVuYWJsZWQgd2hlbiBydW5uaW5nIG91dCBvZiBzb3VyY2VzXG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy50cmFja1ZlcnNpb25DaGFuZ2UoKTtcblxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuZGlzYWJsZVVwZGF0ZXMpIHtcblx0XHRcdHRoaXMuc2V0RGlzYWJsZWRQZXJtYW5lbnRseShEaXNhYmxlbWVudFJlYXNvbi5EaXNhYmxlZEJ5RW52aXJvbm1lbnQpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ3VwZGF0ZSNjdG9yIC0gdXBkYXRlcyBhcmUgZGlzYWJsZWQgYnkgdGhlIGVudmlyb25tZW50Jyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnByb2R1Y3RTZXJ2aWNlLnVwZGF0ZVVybCB8fCAhdGhpcy5wcm9kdWN0U2VydmljZS5jb21taXQpIHtcblx0XHRcdHRoaXMuc2V0RGlzYWJsZWRQZXJtYW5lbnRseShEaXNhYmxlbWVudFJlYXNvbi5NaXNzaW5nQ29uZmlndXJhdGlvbik7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI2N0b3IgLSB1cGRhdGVzIGFyZSBkaXNhYmxlZCBhcyB0aGVyZSBpcyBubyB1cGRhdGUgVVJMJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVhY3QgdG8gcnVudGltZSBgdXBkYXRlLm1vZGVgL3BvbGljeSBjaGFuZ2VzIHNvIHN3aXRjaGluZyB0by9mcm9tIGBub25lYCBhcHBsaWVzIHdpdGhvdXQgYSByZXN0YXJ0LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3VwZGF0ZS5tb2RlJykpIHtcblx0XHRcdFx0dGhpcy5yZWNvbmZpZ3VyZSgpLmNhdGNoKGVyciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ3VwZGF0ZSNyZWNvbmZpZ3VyZSAtIGZhaWxlZCB0byBhcHBseSB1cGRhdGUgbW9kZSBjaGFuZ2UnLCBlcnIpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBBcHBseSB0aGUgY3VycmVudGx5IGNvbmZpZ3VyZWQgdXBkYXRlIG1vZGUuXG5cdFx0YXdhaXQgdGhpcy5yZWNvbmZpZ3VyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV2YWx1YXRlcyB0aGUgY3VycmVudCBgdXBkYXRlLm1vZGVgIHNldHRpbmcgKGFuZCBpdHMgcG9saWN5KSBhbmQgYnJpbmdzIHRoZSBzZXJ2aWNlIGludG8gdGhlIG1hdGNoaW5nIHN0YXRlLlxuXHQgKiBSdW5zIG9uIHN0YXJ0dXAgYW5kIG9uIGV2ZXJ5IGNoYW5nZSwgZW5hYmxpbmcgb3IgZGlzYWJsaW5nIHVwZGF0ZXMgd2l0aG91dCBhIHJlc3RhcnQuXG5cdCAqL1xuXHRwcml2YXRlIHJlY29uZmlndXJlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnJlY29uZmlndXJlVGhyb3R0bGVyLnF1ZXVlKCgpID0+IHRoaXMuZG9SZWNvbmZpZ3VyZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZWNvbmZpZ3VyZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fZGlzYWJsZWRQZXJtYW5lbnRseSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVwZGF0ZU1vZGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdub25lJyB8ICdtYW51YWwnIHwgJ3N0YXJ0JyB8ICdkZWZhdWx0Jz4oJ3VwZGF0ZS5tb2RlJyk7XG5cdFx0Y29uc3QgdXBkYXRlTW9kZUluc3BlY3Rpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8J25vbmUnIHwgJ21hbnVhbCcgfCAnc3RhcnQnIHwgJ2RlZmF1bHQnPigndXBkYXRlLm1vZGUnKTtcblx0XHRjb25zdCBwb2xpY3lEaXNhYmxlc1VwZGF0ZXMgPSB1cGRhdGVNb2RlSW5zcGVjdGlvbi5wb2xpY3lWYWx1ZSAhPT0gdW5kZWZpbmVkICYmICF0aGlzLmdldFByb2R1Y3RRdWFsaXR5KHVwZGF0ZU1vZGVJbnNwZWN0aW9uLnBvbGljeVZhbHVlKTtcblx0XHRjb25zdCBxdWFsaXR5ID0gdGhpcy5nZXRQcm9kdWN0UXVhbGl0eSh1cGRhdGVNb2RlKTtcblxuXHRcdGlmICghcXVhbGl0eSkge1xuXHRcdFx0Y29uc3QgcmVhc29uID0gcG9saWN5RGlzYWJsZXNVcGRhdGVzID8gRGlzYWJsZW1lbnRSZWFzb24uUG9saWN5IDogRGlzYWJsZW1lbnRSZWFzb24uTWFudWFsbHlEaXNhYmxlZDtcblxuXHRcdFx0Ly8gU2tpcCBpZiBhbHJlYWR5IGRpc2FibGVkIGZvciB0aGlzIHJlYXNvbiwgc28gYSByZXBlYXRlZCB3cml0ZSBvciBwb2xpY3kgcmVmcmVzaCBpcyBhIG5vLW9wLlxuXHRcdFx0aWYgKHRoaXMuX3N0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5EaXNhYmxlZCAmJiB0aGlzLl9zdGF0ZS5yZWFzb24gPT09IHJlYXNvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMuZGlzYWJsZShyZWFzb24pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5idWlsZFVwZGF0ZUZlZWRVcmwocXVhbGl0eSwgdGhpcy5wcm9kdWN0U2VydmljZS5jb21taXQhKSkge1xuXHRcdFx0dGhpcy5zZXREaXNhYmxlZFBlcm1hbmVudGx5KERpc2FibGVtZW50UmVhc29uLkludmFsaWRDb25maWd1cmF0aW9uKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCd1cGRhdGUjY3RvciAtIHVwZGF0ZXMgYXJlIGRpc2FibGVkIGFzIHRoZSB1cGRhdGUgVVJMIGlzIGJhZGx5IGZvcm1lZCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucXVhbGl0eSA9IHF1YWxpdHk7XG5cblx0XHQvLyBNb3ZlIHRvIElkbGUgc28gb25lLXRpbWUgcGxhdGZvcm0gaW5pdCAod2hpY2ggbWF5IHJlc3VtZSBhIHBlbmRpbmcgdXBkYXRlKSBjYW4gYWN0OyBpdCByZXF1aXJlcyBJZGxlLlxuXHRcdGlmICh0aGlzLl9zdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuRGlzYWJsZWQgfHwgdGhpcy5fc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLlVuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdHRoaXMuc2V0U3RhdGUoU3RhdGUuSWRsZSh0aGlzLmdldFVwZGF0ZVR5cGUoKSkpO1xuXHRcdH1cblxuXHRcdC8vIE9uZS10aW1lIHBsYXRmb3JtIGluaXQsIGdhdGVkIGJlaGluZCB1cGRhdGVzIGJlaW5nIGVuYWJsZWQgc28gYSBwZW5kaW5nIHVwZGF0ZSBpcyBuZXZlciByZXN1bWVkIHVuZGVyIGBub25lYC5cblx0XHRpZiAoIXRoaXMuX3Bvc3RJbml0aWFsaXplZCkge1xuXHRcdFx0dGhpcy5fcG9zdEluaXRpYWxpemVkID0gdHJ1ZTtcblx0XHRcdGF3YWl0IHRoaXMucG9zdEluaXRpYWxpemUoKTtcblx0XHR9XG5cblx0XHR0aGlzLnNjaGVkdWxlQWNjb3JkaW5nVG9Nb2RlKHVwZGF0ZU1vZGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc2FibGVzIHVwZGF0ZXMgZm9yIGEgcmV2ZXJzaWJsZSByZWFzb24gKHVzZXIgcHJlZmVyZW5jZSBvciBwb2xpY3kpLCBjYW5jZWxsaW5nIHRoZSBzY2hlZHVsZWQgY2hlY2sgbG9vcFxuXHQgKiBhbmQgYW55IGluLWZsaWdodCBvciBwZW5kaW5nIHVwZGF0ZSBiZWZvcmUgbW92aW5nIHRvIERpc2FibGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBkaXNhYmxlKHJlYXNvbjogRGlzYWJsZW1lbnRSZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnNjaGVkdWxlci5jbGVhcigpO1xuXG5cdFx0Ly8gU2hvdyBhIHRyYW5zaWVudCBDYW5jZWxsaW5nIHN0YXRlIG9ubHkgd2hlbiB0aGVyZSBpcyBpbi1mbGlnaHQgb3IgcGVuZGluZyB3b3JrIHRvIHRlYXIgZG93bi5cblx0XHRpZiAoaXNDYW5jZWxsYWJsZVN0YXRlKHRoaXMuX3N0YXRlLnR5cGUpKSB7XG5cdFx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLkNhbmNlbGxpbmcpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNhbmNlbFVwZGF0ZSgpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ3VwZGF0ZSNkaXNhYmxlIC0gZmFpbGVkIHRvIGNhbmNlbCBwZW5kaW5nIHVwZGF0ZScsIGVycik7XG5cdFx0fVxuXG5cdFx0dGhpcy5xdWFsaXR5ID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHJlYXNvbiA9PT0gRGlzYWJsZW1lbnRSZWFzb24uUG9saWN5KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI2Rpc2FibGUgLSB1cGRhdGVzIGFyZSBkaXNhYmxlZCBieSBwb2xpY3knKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ3VwZGF0ZSNkaXNhYmxlIC0gdXBkYXRlcyBhcmUgZGlzYWJsZWQgYnkgdXNlciBwcmVmZXJlbmNlJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5EaXNhYmxlZChyZWFzb24pKTtcblx0fVxuXG5cdC8qKiBEaXNhYmxlcyB1cGRhdGVzIGZvciBhIG5vbi1yZXZlcnNpYmxlIHJlYXNvbjsgc3Vic2VxdWVudCBgdXBkYXRlLm1vZGVgIGNoYW5nZXMgYXJlIGlnbm9yZWQuICovXG5cdHByaXZhdGUgc2V0RGlzYWJsZWRQZXJtYW5lbnRseShyZWFzb246IERpc2FibGVtZW50UmVhc29uKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzYWJsZWRQZXJtYW5lbnRseSA9IHRydWU7XG5cdFx0dGhpcy5zY2hlZHVsZXIuY2xlYXIoKTtcblx0XHR0aGlzLnNldFN0YXRlKFN0YXRlLkRpc2FibGVkKHJlYXNvbikpO1xuXHR9XG5cblx0cHJpdmF0ZSBzY2hlZHVsZUFjY29yZGluZ1RvTW9kZSh1cGRhdGVNb2RlOiAnbm9uZScgfCAnbWFudWFsJyB8ICdzdGFydCcgfCAnZGVmYXVsdCcpOiB2b2lkIHtcblx0XHR0aGlzLnNjaGVkdWxlci5jbGVhcigpO1xuXG5cdFx0aWYgKHVwZGF0ZU1vZGUgPT09ICdtYW51YWwnKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI2N0b3IgLSBtYW51YWwgY2hlY2tzIG9ubHk7IGF1dG9tYXRpYyB1cGRhdGVzIGFyZSBkaXNhYmxlZCBieSB1c2VyIHByZWZlcmVuY2UnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodXBkYXRlTW9kZSA9PT0gJ3N0YXJ0Jykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ3VwZGF0ZSNjdG9yIC0gc3RhcnR1cCBjaGVja3Mgb25seTsgYXV0b21hdGljIHVwZGF0ZXMgYXJlIGRpc2FibGVkIGJ5IHVzZXIgcHJlZmVyZW5jZScpO1xuXG5cdFx0XHQvLyBDaGVjayBmb3IgdXBkYXRlcyBvbmx5IG9uY2UgYWZ0ZXIgMzAgc2Vjb25kc1xuXHRcdFx0dGhpcy5zY2hlZHVsZUNoZWNrRm9yVXBkYXRlcygzMCAqIDEwMDAsIGZhbHNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gU3RhcnQgY2hlY2tpbmcgZm9yIHVwZGF0ZXMgYWZ0ZXIgMzAgc2Vjb25kc1xuXHRcdFx0dGhpcy5zY2hlZHVsZUNoZWNrRm9yVXBkYXRlcygzMCAqIDEwMDAsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJhY2tWZXJzaW9uQ2hhbmdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuYXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2Uud2hlblJlYWR5O1xuXG5cdFx0aW50ZXJmYWNlIElMYXN0S25vd25WZXJzaW9uIHtcblx0XHRcdHJlYWRvbmx5IHZlcnNpb246IHN0cmluZztcblx0XHRcdHJlYWRvbmx5IGNvbW1pdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0cmVhZG9ubHkgdGltZXN0YW1wOiBudW1iZXI7XG5cdFx0fVxuXG5cdFx0bGV0IGZyb206IElMYXN0S25vd25WZXJzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuYXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UuZ2V0KExBU1RfS05PV05fVkVSU0lPTl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAodHlwZW9mIHJhdyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZyb20gPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB0bzogSUxhc3RLbm93blZlcnNpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sXG5cdFx0XHRjb21taXQ6IHRoaXMucHJvZHVjdFNlcnZpY2UuY29tbWl0LFxuXHRcdFx0dGltZXN0YW1wOiBEYXRlLm5vdygpLFxuXHRcdH07XG5cblx0XHRpZiAoZnJvbT8uY29tbWl0ID09PSB0by5jb21taXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlLnN0b3JlKExBU1RfS05PV05fVkVSU0lPTl9TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkodG8pLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRpZiAoIWZyb20pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0eXBlIFZlcnNpb25DaGFuZ2VFdmVudCA9IHtcblx0XHRcdGZyb21WZXJzaW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRmcm9tQ29tbWl0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRmcm9tVmVyc2lvblRpbWU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdHRvVmVyc2lvbjogc3RyaW5nO1xuXHRcdFx0dG9Db21taXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdHRpbWVUb1VwZGF0ZU1zOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHR1cGRhdGVNb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0fTtcblxuXHRcdHR5cGUgVmVyc2lvbkNoYW5nZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdkbWl0cml2Jztcblx0XHRcdGNvbW1lbnQ6ICdGaXJlZCB3aGVuIFZTIENvZGUgZGV0ZWN0cyBhIHZlcnNpb24gY2hhbmdlIG9uIHN0YXJ0dXAuJztcblx0XHRcdGZyb21WZXJzaW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHByZXZpb3VzIHZlcnNpb24gb2YgVlMgQ29kZS4nIH07XG5cdFx0XHRmcm9tQ29tbWl0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGNvbW1pdCBoYXNoIG9mIHRoZSBwcmV2aW91cyB2ZXJzaW9uLicgfTtcblx0XHRcdGZyb21WZXJzaW9uVGltZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RpbWVzdGFtcCB3aGVuIHRoZSBwcmV2aW91cyB2ZXJzaW9uIHdhcyBmaXJzdCBkZXRlY3RlZC4nIH07XG5cdFx0XHR0b1ZlcnNpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY3VycmVudCB2ZXJzaW9uIG9mIFZTIENvZGUuJyB9O1xuXHRcdFx0dG9Db21taXQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY29tbWl0IGhhc2ggb2YgdGhlIGN1cnJlbnQgdmVyc2lvbi4nIH07XG5cdFx0XHR0aW1lVG9VcGRhdGVNczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ01pbGxpc2Vjb25kcyBiZXR3ZWVuIHRoZSBwcmV2aW91cyB2ZXJzaW9uIGluc3RhbGwgYW5kIHRoaXMgdmVyc2lvbiBpbnN0YWxsLicgfTtcblx0XHRcdHVwZGF0ZU1vZGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgdXBkYXRlIG1vZGUgY29uZmlndXJlZCBieSB0aGUgdXNlci4nIH07XG5cdFx0fTtcblxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFZlcnNpb25DaGFuZ2VFdmVudCwgVmVyc2lvbkNoYW5nZUNsYXNzaWZpY2F0aW9uPigndXBkYXRlOnZlcnNpb25DaGFuZ2VkJywge1xuXHRcdFx0ZnJvbVZlcnNpb246IGZyb20udmVyc2lvbixcblx0XHRcdGZyb21Db21taXQ6IGZyb20uY29tbWl0LFxuXHRcdFx0ZnJvbVZlcnNpb25UaW1lOiBmcm9tLnRpbWVzdGFtcCxcblx0XHRcdHRvVmVyc2lvbjogdG8udmVyc2lvbixcblx0XHRcdHRvQ29tbWl0OiB0by5jb21taXQsXG5cdFx0XHR0aW1lVG9VcGRhdGVNczogdG8udGltZXN0YW1wIC0gZnJvbS50aW1lc3RhbXAsXG5cdFx0XHR1cGRhdGVNb2RlOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3VwZGF0ZS5tb2RlJyksXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFByb2R1Y3RRdWFsaXR5KHVwZGF0ZU1vZGU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVwZGF0ZU1vZGUgPT09ICdub25lJyA/IHVuZGVmaW5lZCA6IHRoaXMucHJvZHVjdFNlcnZpY2UucXVhbGl0eTtcblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVDaGVja0ZvclVwZGF0ZXMoZGVsYXkgPSA2MCAqIDYwICogMTAwMCwgcmVwZWF0ID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+ID0gdGltZW91dChkZWxheSk7XG5cdFx0dGhpcy5zY2hlZHVsZXIudmFsdWUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4gcHJvbWlzZS5jYW5jZWwoKSk7XG5cblx0XHRwcm9taXNlXG5cdFx0XHQudGhlbigoKSA9PiB0aGlzLmNoZWNrRm9yVXBkYXRlcyhmYWxzZSkpXG5cdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdGlmIChyZXBlYXQpIHtcblx0XHRcdFx0XHQvLyBDaGVjayBhZ2FpbiBhZnRlciAxIGhvdXJcblx0XHRcdFx0XHR0aGlzLnNjaGVkdWxlQ2hlY2tGb3JVcGRhdGVzKDYwICogNjAgKiAxMDAwLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHRcdC5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGNoZWNrRm9yVXBkYXRlcyhleHBsaWNpdDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgndXBkYXRlI2NoZWNrRm9yVXBkYXRlcywgc3RhdGUgPSAnLCB0aGlzLnN0YXRlLnR5cGUpO1xuXG5cdFx0aWYgKHRoaXMuc3RhdGUudHlwZSAhPT0gU3RhdGVUeXBlLklkbGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmRvQ2hlY2tGb3JVcGRhdGVzKGV4cGxpY2l0KTtcblx0fVxuXG5cdGFzeW5jIGRvd25sb2FkVXBkYXRlKGV4cGxpY2l0OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd1cGRhdGUjZG93bmxvYWRVcGRhdGUsIHN0YXRlID0gJywgdGhpcy5zdGF0ZS50eXBlKTtcblxuXHRcdGlmICh0aGlzLnN0YXRlLnR5cGUgIT09IFN0YXRlVHlwZS5BdmFpbGFibGVGb3JEb3dubG9hZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghZXhwbGljaXQgJiYgdGhpcy5tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UuaXNDb25uZWN0aW9uTWV0ZXJlZCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ3VwZGF0ZSNkb3dubG9hZFVwZGF0ZSAtIHNraXBwaW5nIGRvd25sb2FkIGJlY2F1c2UgY29ubmVjdGlvbiBpcyBtZXRlcmVkJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5kb0Rvd25sb2FkVXBkYXRlKHRoaXMuc3RhdGUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGRvRG93bmxvYWRVcGRhdGUoc3RhdGU6IEF2YWlsYWJsZUZvckRvd25sb2FkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gbm9vcFxuXHR9XG5cblx0YXN5bmMgYXBwbHlVcGRhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd1cGRhdGUjYXBwbHlVcGRhdGUsIHN0YXRlID0gJywgdGhpcy5zdGF0ZS50eXBlKTtcblxuXHRcdGlmICh0aGlzLnN0YXRlLnR5cGUgIT09IFN0YXRlVHlwZS5Eb3dubG9hZGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5kb0FwcGx5VXBkYXRlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZG9BcHBseVVwZGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBub29wXG5cdH1cblxuXHRhc3luYyBxdWl0QW5kSW5zdGFsbCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3VwZGF0ZSNxdWl0QW5kSW5zdGFsbCwgc3RhdGUgPSAnLCB0aGlzLnN0YXRlLnR5cGUpO1xuXG5cdFx0aWYgKHRoaXMuc3RhdGUudHlwZSAhPT0gU3RhdGVUeXBlLlJlYWR5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnN1cHBvcnRzVXBkYXRlT3ZlcndyaXRlICYmICF0aGlzLl9oYXNDaGVja2VkRm9yT3ZlcndyaXRlT25RdWl0KSB7XG5cdFx0XHR0aGlzLl9oYXNDaGVja2VkRm9yT3ZlcndyaXRlT25RdWl0ID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGRpZE92ZXJ3cml0ZSA9IGF3YWl0IHRoaXMuY2hlY2tGb3JPdmVyd3JpdGVVcGRhdGVzKHRydWUpO1xuXG5cdFx0XHRpZiAoZGlkT3ZlcndyaXRlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCd1cGRhdGUjcXVpdEFuZEluc3RhbGwoKTogb3ZlcndyaXRlIHVwZGF0ZSBkZXRlY3RlZCwgcG9zdHBvbmluZyBxdWl0QW5kSW5zdGFsbCcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVtZW1iZXIgdGhlIFJlYWR5IHN0YXRlIHNvIHdlIGNhbiByZXN0b3JlIGl0IGlmIHRoZSBxdWl0IGlzIHZldG9lZFxuXHRcdGNvbnN0IHJlYWR5U3RhdGUgPSB0aGlzLnN0YXRlO1xuXG5cdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5SZXN0YXJ0aW5nKHRoaXMuc3RhdGUudXBkYXRlKSk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd1cGRhdGUjcXVpdEFuZEluc3RhbGwoKTogYmVmb3JlIGxpZmVjeWNsZSBxdWl0KCknKTtcblxuXHRcdHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2UucXVpdCh0cnVlIC8qIHdpbGwgcmVzdGFydCAqLykudGhlbih2ZXRvZCA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYHVwZGF0ZSNxdWl0QW5kSW5zdGFsbCgpOiBhZnRlciBsaWZlY3ljbGUgcXVpdCgpIHdpdGggdmV0bzogJHt2ZXRvZH1gKTtcblx0XHRcdGlmICh2ZXRvZCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygndXBkYXRlI3F1aXRBbmRJbnN0YWxsKCk6IHF1aXQgd2FzIHZldG9lZCwgcmVzdG9yaW5nIFJlYWR5IHN0YXRlJyk7XG5cdFx0XHRcdHRoaXMuc2V0U3RhdGUocmVhZHlTdGF0ZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd1cGRhdGUjcXVpdEFuZEluc3RhbGwoKTogcnVubmluZyByYXcjcXVpdEFuZEluc3RhbGwoKScpO1xuXHRcdFx0dGhpcy5kb1F1aXRBbmRJbnN0YWxsKCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNoZWNrRm9yT3ZlcndyaXRlVXBkYXRlcyhleHBsaWNpdDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLnR5cGUgIT09IFN0YXRlVHlwZS5SZWFkeSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlbmRpbmdVcGRhdGVDb21taXQgPSB0aGlzLl9zdGF0ZS51cGRhdGUudmVyc2lvbjtcblxuXHRcdGlmICghcGVuZGluZ1VwZGF0ZUNvbW1pdCB8fCBwZW5kaW5nVXBkYXRlQ29tbWl0ID09PSAndW5rbm93bicpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgaXNMYXRlc3Q6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRjb25zdCB0aW1lb3V0UHJvbWlzZSA9IHRpbWVvdXQoMjAwMCkudGhlbigoKSA9PiB7IGN0cy5jYW5jZWwoKTsgcmV0dXJuIHVuZGVmaW5lZDsgfSk7XG5cdFx0XHRpc0xhdGVzdCA9IGF3YWl0IFByb21pc2UucmFjZShbdGhpcy5pc0xhdGVzdFZlcnNpb24ocGVuZGluZ1VwZGF0ZUNvbW1pdCwgY3RzLnRva2VuKSwgdGltZW91dFByb21pc2VdKTtcblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCd1cGRhdGUjY2hlY2tGb3JPdmVyd3JpdGVVcGRhdGVzKCk6IGZhaWxlZCB0byBjaGVjayBmb3IgdXBkYXRlcywgcHJvY2VlZGluZyB3aXRoIHJlc3RhcnQnKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGVycm9yKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoaXNMYXRlc3QgPT09IGZhbHNlICYmIHRoaXMuX3N0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5SZWFkeSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ3VwZGF0ZSNyZWFkeVN0YXRlQ2hlY2s6IG5ld2VyIHVwZGF0ZSBhdmFpbGFibGUsIHJlc3RhcnRpbmcgdXBkYXRlIG1hY2hpbmVyeScpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNhbmNlbFBlbmRpbmdVcGRhdGUoKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcigndXBkYXRlI2NoZWNrRm9yT3ZlcndyaXRlVXBkYXRlcygpOiBmYWlsZWQgdG8gY2FuY2VsIHBlbmRpbmcgdXBkYXRlLCBhYm9ydGluZyBvdmVyd3JpdGUnKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vdmVyd3JpdGUgPSB0cnVlO1xuXHRcdFx0dGhpcy5zZXRTdGF0ZShTdGF0ZS5PdmVyd3JpdGluZyh0aGlzLl9zdGF0ZS51cGRhdGUsIGV4cGxpY2l0KSk7XG5cdFx0XHR0aGlzLmRvQ2hlY2tGb3JVcGRhdGVzKGV4cGxpY2l0LCBwZW5kaW5nVXBkYXRlQ29tbWl0KTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIGlzTGF0ZXN0VmVyc2lvbihjb21taXQ/OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMucXVhbGl0eSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnbm9uZScgfCAnbWFudWFsJyB8ICdzdGFydCcgfCAnZGVmYXVsdCc+KCd1cGRhdGUubW9kZScpO1xuXG5cdFx0aWYgKG1vZGUgPT09ICdub25lJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB1cmwgPSB0aGlzLmJ1aWxkVXBkYXRlRmVlZFVybCh0aGlzLnF1YWxpdHksIGNvbW1pdCA/PyB0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdCEsIHsgaW50ZXJuYWxPcmc6IHRoaXMuZ2V0SW50ZXJuYWxPcmcoKSB9KTtcblxuXHRcdGlmICghdXJsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBnZXRVcGRhdGVSZXF1ZXN0SGVhZGVycyh0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24pO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgndXBkYXRlI2lzTGF0ZXN0VmVyc2lvbigpIC0gY2hlY2tpbmcgdXBkYXRlIHNlcnZlcicsIHsgdXJsLCBoZWFkZXJzIH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3QoeyB1cmwsIGhlYWRlcnMsIGNhbGxTaXRlOiAndXBkYXRlU2VydmljZS5pc0xhdGVzdFZlcnNpb24nIH0sIHRva2VuKTtcblx0XHRcdGNvbnN0IHN0YXR1c0NvZGUgPSBjb250ZXh0LnJlcy5zdGF0dXNDb2RlO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd1cGRhdGUjaXNMYXRlc3RWZXJzaW9uKCkgLSByZXNwb25zZScsIHsgc3RhdHVzQ29kZSB9KTtcblx0XHRcdC8vIFRoZSB1cGRhdGUgc2VydmVyIHJlcGxpZXMgd2l0aCAyMDQgKE5vIENvbnRlbnQpIHdoZW4gbm8gdXBkYXRlIGlzIGF2YWlsYWJsZS5cblx0XHRcdHJldHVybiBzdGF0dXNDb2RlID09PSAyMDQ7XG5cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCd1cGRhdGUjaXNMYXRlc3RWZXJzaW9uKCk6IGZhaWxlZCB0byBjaGVjayBmb3IgdXBkYXRlcycpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgX2FwcGx5U3BlY2lmaWNVcGRhdGUocGFja2FnZVBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdGFzeW5jIHNldEludGVybmFsT3JnKGludGVybmFsT3JnOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faW50ZXJuYWxPcmcgPT09IGludGVybmFsT3JnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ3VwZGF0ZSNzZXRJbnRlcm5hbE9yZycsIGludGVybmFsT3JnKTtcblx0XHR0aGlzLl9pbnRlcm5hbE9yZyA9IGludGVybmFsT3JnO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEludGVybmFsT3JnKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2ludGVybmFsT3JnO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFVwZGF0ZVR5cGUoKTogVXBkYXRlVHlwZSB7XG5cdFx0cmV0dXJuIFVwZGF0ZVR5cGUuQXJjaGl2ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBkb1F1aXRBbmRJbnN0YWxsKCk6IHZvaWQge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBwb3N0SW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBub29wXG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgY2FuY2VsUGVuZGluZ1VwZGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBub29wXG5cdH1cblxuXHQvKipcblx0ICogQWJvcnRzIGluLWZsaWdodCBvciBwZW5kaW5nIHVwZGF0ZSB3b3JrIHdoZW4gdXBkYXRlcyBhcmUgYmVpbmcgZGlzYWJsZWQgYXQgcnVudGltZS4gVGhlIGRlZmF1bHQgY2FuY2VscyBhXG5cdCAqIHBlbmRpbmcgdXBkYXRlOyBwbGF0Zm9ybSBzZXJ2aWNlcyBvdmVycmlkZSB0aGlzIHRvIGFsc28gYWJvcnQgaW4tZmxpZ2h0IGNoZWNrcy9kb3dubG9hZHMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgYXN5bmMgY2FuY2VsVXBkYXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuY2FuY2VsUGVuZGluZ1VwZGF0ZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGJ1aWxkVXBkYXRlRmVlZFVybChxdWFsaXR5OiBzdHJpbmcsIGNvbW1pdDogc3RyaW5nLCBvcHRpb25zPzogSVVwZGF0ZVVSTE9wdGlvbnMpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBkb0NoZWNrRm9yVXBkYXRlcyhleHBsaWNpdDogYm9vbGVhbiwgcGVuZGluZ0NvbW1pdD86IHN0cmluZyk6IHZvaWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksUUFBUTtBQUNwQixTQUE0QixlQUFlLFdBQVcsZUFBZTtBQUNyRSxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQXlCLG1CQUFtQixvQkFBb0I7QUFDekUsU0FBUyxhQUFhLGlCQUFpQjtBQUN2QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHVCQUF1QiwwQkFBMEI7QUFDMUQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxjQUFjLHFCQUFxQjtBQUM1QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUErQixtQkFBbUMsT0FBTyxXQUFXLGtCQUFrQjtBQUV0RyxNQUFNLGlDQUFpQztBQU9oQyxTQUFTLGdCQUFnQixlQUF1QixVQUFrQixTQUFpQixRQUFnQixTQUFxQztBQUM5SSxRQUFNLE1BQU0sSUFBSSxJQUFJLEdBQUcsYUFBYSxlQUFlLFFBQVEsSUFBSSxPQUFPLElBQUksTUFBTSxFQUFFO0FBRWxGLE1BQUksU0FBUyxZQUFZO0FBQ3hCLFFBQUksYUFBYSxJQUFJLE1BQU0sTUFBTTtBQUFBLEVBQ2xDO0FBRUEsTUFBSSxhQUFhLElBQUksS0FBSyxTQUFTLGVBQWUsTUFBTTtBQUV4RCxTQUFPLElBQUksU0FBUztBQUNyQjtBQVdPLFNBQVMsd0JBQXdCLGdCQUE0RDtBQUNuRyxNQUFJLGFBQWE7QUFDaEIsVUFBTSxnQkFBZ0IsR0FBRyxRQUFRO0FBQ2pDLFdBQU87QUFBQSxNQUNOLGNBQWMsUUFBUSxjQUFjLFdBQVcsYUFBYTtBQUFBLElBQzdEO0FBQUEsRUFDRDtBQUVBLE1BQUksV0FBVztBQUNkLFVBQU0sUUFBUSxzQkFBc0IsRUFBRSxNQUFNLGFBQWE7QUFDekQsUUFBSSxPQUFPO0FBQ1YsYUFBTztBQUFBLFFBQ04sY0FBYyxRQUFRLGNBQWMsYUFBYSxRQUFRLFNBQVMsUUFBUSxlQUFlLE1BQU0sQ0FBQyxDQUFDO0FBQUEsTUFDbEc7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjtBQVlBLFNBQVMsbUJBQW1CLE1BQTBCO0FBQ3JELFVBQVEsTUFBTTtBQUFBLElBQ2IsS0FBSyxVQUFVO0FBQUEsSUFDZixLQUFLLFVBQVU7QUFBQSxJQUNmLEtBQUssVUFBVTtBQUFBLElBQ2YsS0FBSyxVQUFVO0FBQUEsSUFDZixLQUFLLFVBQVU7QUFBQSxJQUNmLEtBQUssVUFBVTtBQUFBLElBQ2YsS0FBSyxVQUFVO0FBQ2QsYUFBTztBQUFBLElBQ1I7QUFDQyxhQUFPO0FBQUEsRUFDVDtBQUNEO0FBRU8sSUFBZSx3QkFBZixjQUE2QyxXQUFxQztBQUFBLEVBcUR4RixZQUMyQyxzQkFDVCxzQkFDRSx3QkFDUixnQkFDSixZQUNhLGdCQUNFLGtCQUNhLCtCQUNMLDBCQUMzQix5QkFDbEI7QUFDRCxVQUFNO0FBWG9DO0FBQ1Q7QUFDRTtBQUNSO0FBQ0o7QUFDYTtBQUNFO0FBQ2E7QUFDTDtBQUMzQjtBQXpEcEIsU0FBUSxTQUFnQixNQUFNO0FBQzlCLFNBQVUsYUFBc0I7QUFDaEMsU0FBUSxnQ0FBeUM7QUFDakQsU0FBaUIsZ0NBQWdDLEtBQUssVUFBVSxJQUFJLGNBQWMsQ0FBQztBQUNuRixTQUFRLGVBQW1DO0FBRzNDO0FBQUEsU0FBUSx1QkFBZ0M7QUFFeEM7QUFBQSxTQUFRLG1CQUE0QjtBQUVwQztBQUFBLFNBQWlCLFlBQVksS0FBSyxVQUFVLElBQUksa0JBQStCLENBQUM7QUFFaEY7QUFBQSxTQUFpQix1QkFBdUIsS0FBSyxVQUFVLElBQUksVUFBVSxDQUFDO0FBRXRFLFNBQWlCLGlCQUFpQixLQUFLLFVBQVUsSUFBSSxRQUFlLENBQUM7QUFDckUsU0FBUyxnQkFBOEIsS0FBSyxlQUFlO0FBNkMxRCx5QkFBcUIsS0FBSyxtQkFBbUIsZUFBZSxFQUMxRCxRQUFRLE1BQU0sS0FBSyxXQUFXLENBQUM7QUFBQSxFQUNsQztBQUFBLEVBN0NBLElBQUksUUFBZTtBQUNsQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFVSxTQUFTLE9BQW9CO0FBQ3RDLFFBQUksTUFBTSxTQUFTLFVBQVUsVUFBVTtBQUN0QyxXQUFLLFdBQVcsTUFBTSxtQkFBbUIsTUFBTSxJQUFJO0FBQUEsSUFDcEQsT0FBTztBQUNOLFdBQUssV0FBVyxLQUFLLG1CQUFtQixNQUFNLElBQUk7QUFBQSxJQUNuRDtBQUNBLFNBQUssU0FBUztBQUNkLFNBQUssZUFBZSxLQUFLLEtBQUs7QUFJOUIsUUFBSSxNQUFNLFNBQVMsVUFBVSxTQUFTLE1BQU0sU0FBUyxNQUFNLGVBQWU7QUFDekUsV0FBSyxTQUFTLE1BQU0sS0FBSyxNQUFNLFVBQVU7QUFBQSxJQUMxQztBQUdBLFFBQUksS0FBSyx5QkFBeUI7QUFDakMsVUFBSSxNQUFNLFNBQVMsVUFBVSxPQUFPO0FBQ25DLGFBQUssOEJBQThCLGFBQWEsTUFBTSxLQUFLLHlCQUF5QixHQUFHLElBQUksS0FBSyxHQUFJO0FBQUEsTUFDckcsT0FBTztBQUNOLGFBQUssOEJBQThCLE9BQU87QUFBQSxNQUMzQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBeUJBLE1BQWdCLGFBQTRCO0FBQzNDLFFBQUksQ0FBQyxLQUFLLHVCQUF1QixTQUFTO0FBQ3pDLFdBQUssdUJBQXVCLGtCQUFrQixRQUFRO0FBQ3REO0FBQUEsSUFDRDtBQUVBLFVBQU0sS0FBSyxtQkFBbUI7QUFFOUIsUUFBSSxLQUFLLHVCQUF1QixnQkFBZ0I7QUFDL0MsV0FBSyx1QkFBdUIsa0JBQWtCLHFCQUFxQjtBQUNuRSxXQUFLLFdBQVcsS0FBSyx1REFBdUQ7QUFDNUU7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLEtBQUssZUFBZSxhQUFhLENBQUMsS0FBSyxlQUFlLFFBQVE7QUFDbEUsV0FBSyx1QkFBdUIsa0JBQWtCLG9CQUFvQjtBQUNsRSxXQUFLLFdBQVcsS0FBSyw4REFBOEQ7QUFDbkY7QUFBQSxJQUNEO0FBR0EsU0FBSyxVQUFVLEtBQUsscUJBQXFCLHlCQUF5QixPQUFLO0FBQ3RFLFVBQUksRUFBRSxxQkFBcUIsYUFBYSxHQUFHO0FBQzFDLGFBQUssWUFBWSxFQUFFLE1BQU0sU0FBTyxLQUFLLFdBQVcsTUFBTSwyREFBMkQsR0FBRyxDQUFDO0FBQUEsTUFDdEg7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLFVBQU0sS0FBSyxZQUFZO0FBQUEsRUFDeEI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsY0FBNkI7QUFDcEMsV0FBTyxLQUFLLHFCQUFxQixNQUFNLE1BQU0sS0FBSyxjQUFjLENBQUM7QUFBQSxFQUNsRTtBQUFBLEVBRUEsTUFBYyxnQkFBK0I7QUFDNUMsUUFBSSxLQUFLLHNCQUFzQjtBQUM5QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWEsS0FBSyxxQkFBcUIsU0FBa0QsYUFBYTtBQUM1RyxVQUFNLHVCQUF1QixLQUFLLHFCQUFxQixRQUFpRCxhQUFhO0FBQ3JILFVBQU0sd0JBQXdCLHFCQUFxQixnQkFBZ0IsVUFBYSxDQUFDLEtBQUssa0JBQWtCLHFCQUFxQixXQUFXO0FBQ3hJLFVBQU0sVUFBVSxLQUFLLGtCQUFrQixVQUFVO0FBRWpELFFBQUksQ0FBQyxTQUFTO0FBQ2IsWUFBTSxTQUFTLHdCQUF3QixrQkFBa0IsU0FBUyxrQkFBa0I7QUFHcEYsVUFBSSxLQUFLLE9BQU8sU0FBUyxVQUFVLFlBQVksS0FBSyxPQUFPLFdBQVcsUUFBUTtBQUM3RTtBQUFBLE1BQ0Q7QUFFQSxZQUFNLEtBQUssUUFBUSxNQUFNO0FBQ3pCO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxLQUFLLG1CQUFtQixTQUFTLEtBQUssZUFBZSxNQUFPLEdBQUc7QUFDbkUsV0FBSyx1QkFBdUIsa0JBQWtCLG9CQUFvQjtBQUNsRSxXQUFLLFdBQVcsS0FBSyxzRUFBc0U7QUFDM0Y7QUFBQSxJQUNEO0FBRUEsU0FBSyxVQUFVO0FBR2YsUUFBSSxLQUFLLE9BQU8sU0FBUyxVQUFVLFlBQVksS0FBSyxPQUFPLFNBQVMsVUFBVSxlQUFlO0FBQzVGLFdBQUssU0FBUyxNQUFNLEtBQUssS0FBSyxjQUFjLENBQUMsQ0FBQztBQUFBLElBQy9DO0FBR0EsUUFBSSxDQUFDLEtBQUssa0JBQWtCO0FBQzNCLFdBQUssbUJBQW1CO0FBQ3hCLFlBQU0sS0FBSyxlQUFlO0FBQUEsSUFDM0I7QUFFQSxTQUFLLHdCQUF3QixVQUFVO0FBQUEsRUFDeEM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsTUFBYyxRQUFRLFFBQTBDO0FBQy9ELFNBQUssVUFBVSxNQUFNO0FBR3JCLFFBQUksbUJBQW1CLEtBQUssT0FBTyxJQUFJLEdBQUc7QUFDekMsV0FBSyxTQUFTLE1BQU0sVUFBVTtBQUFBLElBQy9CO0FBRUEsUUFBSTtBQUNILFlBQU0sS0FBSyxhQUFhO0FBQUEsSUFDekIsU0FBUyxLQUFLO0FBQ2IsV0FBSyxXQUFXLEtBQUssb0RBQW9ELEdBQUc7QUFBQSxJQUM3RTtBQUVBLFNBQUssVUFBVTtBQUVmLFFBQUksV0FBVyxrQkFBa0IsUUFBUTtBQUN4QyxXQUFLLFdBQVcsS0FBSyxpREFBaUQ7QUFBQSxJQUN2RSxPQUFPO0FBQ04sV0FBSyxXQUFXLEtBQUssMERBQTBEO0FBQUEsSUFDaEY7QUFFQSxTQUFLLFNBQVMsTUFBTSxTQUFTLE1BQU0sQ0FBQztBQUFBLEVBQ3JDO0FBQUE7QUFBQSxFQUdRLHVCQUF1QixRQUFpQztBQUMvRCxTQUFLLHVCQUF1QjtBQUM1QixTQUFLLFVBQVUsTUFBTTtBQUNyQixTQUFLLFNBQVMsTUFBTSxTQUFTLE1BQU0sQ0FBQztBQUFBLEVBQ3JDO0FBQUEsRUFFUSx3QkFBd0IsWUFBMkQ7QUFDMUYsU0FBSyxVQUFVLE1BQU07QUFFckIsUUFBSSxlQUFlLFVBQVU7QUFDNUIsV0FBSyxXQUFXLEtBQUsscUZBQXFGO0FBQzFHO0FBQUEsSUFDRDtBQUVBLFFBQUksZUFBZSxTQUFTO0FBQzNCLFdBQUssV0FBVyxLQUFLLHNGQUFzRjtBQUczRyxXQUFLLHdCQUF3QixLQUFLLEtBQU0sS0FBSztBQUFBLElBQzlDLE9BQU87QUFFTixXQUFLLHdCQUF3QixLQUFLLEtBQU0sSUFBSTtBQUFBLElBQzdDO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxxQkFBb0M7QUFDakQsVUFBTSxLQUFLLDhCQUE4QjtBQVF6QyxRQUFJO0FBQ0osVUFBTSxNQUFNLEtBQUssOEJBQThCLElBQUksZ0NBQWdDLGFBQWEsV0FBVztBQUMzRyxRQUFJLE9BQU8sUUFBUSxVQUFVO0FBQzVCLFVBQUk7QUFDSCxlQUFPLEtBQUssTUFBTSxHQUFHO0FBQUEsTUFDdEIsU0FBUyxPQUFPO0FBQUEsTUFFaEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxLQUF3QjtBQUFBLE1BQzdCLFNBQVMsS0FBSyxlQUFlO0FBQUEsTUFDN0IsUUFBUSxLQUFLLGVBQWU7QUFBQSxNQUM1QixXQUFXLEtBQUssSUFBSTtBQUFBLElBQ3JCO0FBRUEsUUFBSSxNQUFNLFdBQVcsR0FBRyxRQUFRO0FBQy9CO0FBQUEsSUFDRDtBQUVBLFNBQUssOEJBQThCLE1BQU0sZ0NBQWdDLEtBQUssVUFBVSxFQUFFLEdBQUcsYUFBYSxhQUFhLGNBQWMsT0FBTztBQUU1SSxRQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsSUFDRDtBQXdCQSxTQUFLLGlCQUFpQixXQUE0RCx5QkFBeUI7QUFBQSxNQUMxRyxhQUFhLEtBQUs7QUFBQSxNQUNsQixZQUFZLEtBQUs7QUFBQSxNQUNqQixpQkFBaUIsS0FBSztBQUFBLE1BQ3RCLFdBQVcsR0FBRztBQUFBLE1BQ2QsVUFBVSxHQUFHO0FBQUEsTUFDYixnQkFBZ0IsR0FBRyxZQUFZLEtBQUs7QUFBQSxNQUNwQyxZQUFZLEtBQUsscUJBQXFCLFNBQWlCLGFBQWE7QUFBQSxJQUNyRSxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsa0JBQWtCLFlBQXdDO0FBQ2pFLFdBQU8sZUFBZSxTQUFTLFNBQVksS0FBSyxlQUFlO0FBQUEsRUFDaEU7QUFBQSxFQUVRLHdCQUF3QixRQUFRLEtBQUssS0FBSyxLQUFNLFNBQVMsTUFBWTtBQUM1RSxVQUFNLFVBQW1DLFFBQVEsS0FBSztBQUN0RCxTQUFLLFVBQVUsUUFBUSxhQUFhLE1BQU0sUUFBUSxPQUFPLENBQUM7QUFFMUQsWUFDRSxLQUFLLE1BQU0sS0FBSyxnQkFBZ0IsS0FBSyxDQUFDLEVBQ3RDLEtBQUssTUFBTTtBQUNYLFVBQUksUUFBUTtBQUVYLGFBQUssd0JBQXdCLEtBQUssS0FBSyxLQUFNLElBQUk7QUFBQSxNQUNsRDtBQUFBLElBQ0QsQ0FBQyxFQUNBLE1BQU0sU0FBTztBQUNiLFVBQUksQ0FBQyxvQkFBb0IsR0FBRyxHQUFHO0FBQzlCLGFBQUssV0FBVyxNQUFNLEdBQUc7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLE1BQU0sZ0JBQWdCLFVBQWtDO0FBQ3ZELFNBQUssV0FBVyxNQUFNLG9DQUFvQyxLQUFLLE1BQU0sSUFBSTtBQUV6RSxRQUFJLEtBQUssTUFBTSxTQUFTLFVBQVUsTUFBTTtBQUN2QztBQUFBLElBQ0Q7QUFFQSxTQUFLLGtCQUFrQixRQUFRO0FBQUEsRUFDaEM7QUFBQSxFQUVBLE1BQU0sZUFBZSxVQUFrQztBQUN0RCxTQUFLLFdBQVcsTUFBTSxtQ0FBbUMsS0FBSyxNQUFNLElBQUk7QUFFeEUsUUFBSSxLQUFLLE1BQU0sU0FBUyxVQUFVLHNCQUFzQjtBQUN2RDtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsWUFBWSxLQUFLLHlCQUF5QixxQkFBcUI7QUFDbkUsV0FBSyxXQUFXLEtBQUsseUVBQXlFO0FBQzlGO0FBQUEsSUFDRDtBQUVBLFVBQU0sS0FBSyxpQkFBaUIsS0FBSyxLQUFLO0FBQUEsRUFDdkM7QUFBQSxFQUVBLE1BQWdCLGlCQUFpQixPQUE0QztBQUFBLEVBRTdFO0FBQUEsRUFFQSxNQUFNLGNBQTZCO0FBQ2xDLFNBQUssV0FBVyxNQUFNLGdDQUFnQyxLQUFLLE1BQU0sSUFBSTtBQUVyRSxRQUFJLEtBQUssTUFBTSxTQUFTLFVBQVUsWUFBWTtBQUM3QztBQUFBLElBQ0Q7QUFFQSxVQUFNLEtBQUssY0FBYztBQUFBLEVBQzFCO0FBQUEsRUFFQSxNQUFnQixnQkFBK0I7QUFBQSxFQUUvQztBQUFBLEVBRUEsTUFBTSxpQkFBZ0M7QUFDckMsU0FBSyxXQUFXLE1BQU0sbUNBQW1DLEtBQUssTUFBTSxJQUFJO0FBRXhFLFFBQUksS0FBSyxNQUFNLFNBQVMsVUFBVSxPQUFPO0FBQ3hDLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxLQUFLLDJCQUEyQixDQUFDLEtBQUssK0JBQStCO0FBQ3hFLFdBQUssZ0NBQWdDO0FBQ3JDLFlBQU0sZUFBZSxNQUFNLEtBQUsseUJBQXlCLElBQUk7QUFFN0QsVUFBSSxjQUFjO0FBQ2pCLGFBQUssV0FBVyxLQUFLLCtFQUErRTtBQUNwRztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsVUFBTSxhQUFhLEtBQUs7QUFFeEIsU0FBSyxTQUFTLE1BQU0sV0FBVyxLQUFLLE1BQU0sTUFBTSxDQUFDO0FBQ2pELFNBQUssV0FBVyxNQUFNLGtEQUFrRDtBQUV4RSxTQUFLLHFCQUFxQjtBQUFBLE1BQUs7QUFBQTtBQUFBLElBQXVCLEVBQUUsS0FBSyxXQUFTO0FBQ3JFLFdBQUssV0FBVyxNQUFNLDhEQUE4RCxLQUFLLEVBQUU7QUFDM0YsVUFBSSxPQUFPO0FBQ1YsYUFBSyxXQUFXLEtBQUssaUVBQWlFO0FBQ3RGLGFBQUssU0FBUyxVQUFVO0FBQ3hCO0FBQUEsTUFDRDtBQUVBLFdBQUssV0FBVyxNQUFNLHVEQUF1RDtBQUM3RSxXQUFLLGlCQUFpQjtBQUFBLElBQ3ZCLENBQUM7QUFFRCxXQUFPLFFBQVEsUUFBUSxNQUFTO0FBQUEsRUFDakM7QUFBQSxFQUVBLE1BQWMseUJBQXlCLFdBQW9CLE9BQXlCO0FBQ25GLFFBQUksS0FBSyxPQUFPLFNBQVMsVUFBVSxPQUFPO0FBQ3pDLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxzQkFBc0IsS0FBSyxPQUFPLE9BQU87QUFFL0MsUUFBSSxDQUFDLHVCQUF1Qix3QkFBd0IsV0FBVztBQUM5RCxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUk7QUFFSixRQUFJO0FBQ0gsWUFBTSxNQUFNLElBQUksd0JBQXdCO0FBQ3hDLFlBQU0saUJBQWlCLFFBQVEsR0FBSSxFQUFFLEtBQUssTUFBTTtBQUFFLFlBQUksT0FBTztBQUFHLGVBQU87QUFBQSxNQUFXLENBQUM7QUFDbkYsaUJBQVcsTUFBTSxRQUFRLEtBQUssQ0FBQyxLQUFLLGdCQUFnQixxQkFBcUIsSUFBSSxLQUFLLEdBQUcsY0FBYyxDQUFDO0FBQ3BHLFVBQUksUUFBUTtBQUFBLElBQ2IsU0FBUyxPQUFPO0FBQ2YsV0FBSyxXQUFXLEtBQUsseUZBQXlGO0FBQzlHLFdBQUssV0FBVyxLQUFLLEtBQUs7QUFDMUIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLGFBQWEsU0FBUyxLQUFLLE9BQU8sU0FBUyxVQUFVLE9BQU87QUFDL0QsV0FBSyxXQUFXLEtBQUssNkVBQTZFO0FBRWxHLFVBQUk7QUFDSCxjQUFNLEtBQUssb0JBQW9CO0FBQUEsTUFDaEMsU0FBUyxPQUFPO0FBQ2YsYUFBSyxXQUFXLE1BQU0sd0ZBQXdGO0FBQzlHLGFBQUssV0FBVyxNQUFNLEtBQUs7QUFDM0IsZUFBTztBQUFBLE1BQ1I7QUFFQSxXQUFLLGFBQWE7QUFDbEIsV0FBSyxTQUFTLE1BQU0sWUFBWSxLQUFLLE9BQU8sUUFBUSxRQUFRLENBQUM7QUFDN0QsV0FBSyxrQkFBa0IsVUFBVSxtQkFBbUI7QUFDcEQsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxnQkFBZ0IsUUFBaUIsUUFBMkIsa0JBQWtCLE1BQW9DO0FBQ3ZILFFBQUksQ0FBQyxLQUFLLFNBQVM7QUFDbEIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLE9BQU8sS0FBSyxxQkFBcUIsU0FBa0QsYUFBYTtBQUV0RyxRQUFJLFNBQVMsUUFBUTtBQUNwQixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sTUFBTSxLQUFLLG1CQUFtQixLQUFLLFNBQVMsVUFBVSxLQUFLLGVBQWUsUUFBUyxFQUFFLGFBQWEsS0FBSyxlQUFlLEVBQUUsQ0FBQztBQUUvSCxRQUFJLENBQUMsS0FBSztBQUNULGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxVQUFVLHdCQUF3QixLQUFLLGVBQWUsT0FBTztBQUNuRSxTQUFLLFdBQVcsTUFBTSxxREFBcUQsRUFBRSxLQUFLLFFBQVEsQ0FBQztBQUUzRixRQUFJO0FBQ0gsWUFBTSxVQUFVLE1BQU0sS0FBSyxlQUFlLFFBQVEsRUFBRSxLQUFLLFNBQVMsVUFBVSxnQ0FBZ0MsR0FBRyxLQUFLO0FBQ3BILFlBQU0sYUFBYSxRQUFRLElBQUk7QUFDL0IsV0FBSyxXQUFXLE1BQU0sdUNBQXVDLEVBQUUsV0FBVyxDQUFDO0FBRTNFLGFBQU8sZUFBZTtBQUFBLElBRXZCLFNBQVMsT0FBTztBQUNmLFdBQUssV0FBVyxNQUFNLHVEQUF1RDtBQUM3RSxXQUFLLFdBQVcsTUFBTSxLQUFLO0FBQzNCLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxxQkFBcUIsYUFBb0M7QUFBQSxFQUUvRDtBQUFBLEVBRUEsTUFBTSxlQUFlLGFBQWdEO0FBQ3BFLFFBQUksS0FBSyxpQkFBaUIsYUFBYTtBQUN0QztBQUFBLElBQ0Q7QUFFQSxTQUFLLFdBQVcsS0FBSyx5QkFBeUIsV0FBVztBQUN6RCxTQUFLLGVBQWU7QUFBQSxFQUNyQjtBQUFBLEVBRVUsaUJBQXFDO0FBQzlDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVVLGdCQUE0QjtBQUNyQyxXQUFPLFdBQVc7QUFBQSxFQUNuQjtBQUFBLEVBRVUsbUJBQXlCO0FBQUEsRUFFbkM7QUFBQSxFQUVBLE1BQWdCLGlCQUFnQztBQUFBLEVBRWhEO0FBQUEsRUFFQSxNQUFnQixzQkFBcUM7QUFBQSxFQUVyRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFnQixlQUE4QjtBQUM3QyxVQUFNLEtBQUssb0JBQW9CO0FBQUEsRUFDaEM7QUFJRDtBQTNmc0Isd0JBQWY7QUFBQSxFQXNESjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0E5RG1COyIsCiAgIm5hbWVzIjogW10KfQo=
