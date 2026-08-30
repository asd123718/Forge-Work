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
import { createCancelablePromise, disposableTimeout, ThrottledDelayer, timeout } from "../../../base/common/async.js";
import { toLocalISOString } from "../../../base/common/date.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { isWeb } from "../../../base/common/platform.js";
import { isEqual } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IMeteredConnectionService } from "../../meteredConnection/common/meteredConnection.js";
import { IProductService } from "../../product/common/productService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, UserDataAutoSyncError, UserDataSyncError, UserDataSyncErrorCode } from "./userDataSync.js";
import { IUserDataSyncAccountService } from "./userDataSyncAccount.js";
import { IUserDataSyncMachinesService } from "./userDataSyncMachines.js";
const disableMachineEventuallyKey = "sync.disableMachineEventually";
const sessionIdKey = "sync.sessionId";
const storeUrlKey = "sync.storeUrl";
const productQualityKey = "sync.productQuality";
let UserDataAutoSyncService = class extends Disposable {
  constructor(productService, userDataSyncStoreManagementService, userDataSyncStoreService, userDataSyncEnablementService, userDataSyncService, logService, userDataSyncAccountService, telemetryService, userDataSyncMachinesService, storageService, meteredConnectionService) {
    super();
    this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
    this.userDataSyncStoreService = userDataSyncStoreService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.userDataSyncService = userDataSyncService;
    this.logService = logService;
    this.userDataSyncAccountService = userDataSyncAccountService;
    this.telemetryService = telemetryService;
    this.userDataSyncMachinesService = userDataSyncMachinesService;
    this.storageService = storageService;
    this.meteredConnectionService = meteredConnectionService;
    this.autoSync = this._register(new MutableDisposable());
    this.successiveFailures = 0;
    this.lastSyncTriggerTime = void 0;
    this.suspendUntilRestart = false;
    this._onError = this._register(new Emitter());
    this.onError = this._onError.event;
    this.sources = [];
    this.syncTriggerDelayer = this._register(new ThrottledDelayer(this.getSyncTriggerDelayTime()));
    this.lastSyncUrl = this.syncUrl;
    this.syncUrl = userDataSyncStoreManagementService.userDataSyncStore?.url;
    this.previousProductQuality = this.productQuality;
    this.productQuality = productService.quality;
    if (this.syncUrl) {
      this.logService.info("[AutoSync] Using settings sync service", this.syncUrl.toString());
      this._register(userDataSyncStoreManagementService.onDidChangeUserDataSyncStore(() => {
        if (!isEqual(this.syncUrl, userDataSyncStoreManagementService.userDataSyncStore?.url)) {
          this.lastSyncUrl = this.syncUrl;
          this.syncUrl = userDataSyncStoreManagementService.userDataSyncStore?.url;
          if (this.syncUrl) {
            this.logService.info("[AutoSync] Using settings sync service", this.syncUrl.toString());
          }
        }
      }));
      if (this.userDataSyncEnablementService.isEnabled()) {
        this.logService.info("[AutoSync] Enabled.");
      } else {
        this.logService.info("[AutoSync] Disabled.");
      }
      this.updateAutoSync();
      if (this.hasToDisableMachineEventually()) {
        this.disableMachineEventually();
      }
      this._register(userDataSyncAccountService.onDidChangeAccount(() => this.updateAutoSync()));
      this._register(userDataSyncStoreService.onDidChangeDonotMakeRequestsUntil(() => this.updateAutoSync()));
      this._register(userDataSyncService.onDidChangeLocal((source) => this.triggerSync([source])));
      this._register(Event.filter(this.userDataSyncEnablementService.onDidChangeResourceEnablement, ([, enabled]) => enabled)(() => this.triggerSync(["resourceEnablement"])));
      this._register(this.userDataSyncStoreManagementService.onDidChangeUserDataSyncStore(() => this.triggerSync(["userDataSyncStoreChanged"])));
      this._register(meteredConnectionService.onDidChangeIsConnectionMetered(() => this.updateAutoSync()));
    }
  }
  get syncUrl() {
    const value = this.storageService.get(storeUrlKey, StorageScope.APPLICATION);
    return value ? URI.parse(value) : void 0;
  }
  set syncUrl(syncUrl) {
    if (syncUrl) {
      this.storageService.store(storeUrlKey, syncUrl.toString(), StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(storeUrlKey, StorageScope.APPLICATION);
    }
  }
  get productQuality() {
    return this.storageService.get(productQualityKey, StorageScope.APPLICATION);
  }
  set productQuality(productQuality) {
    if (productQuality) {
      this.storageService.store(productQualityKey, productQuality, StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(productQualityKey, StorageScope.APPLICATION);
    }
  }
  updateAutoSync() {
    const { enabled, message } = this.isAutoSyncEnabled();
    if (enabled) {
      if (this.autoSync.value === void 0) {
        this.autoSync.value = new AutoSync(this.lastSyncUrl, 1e3 * 60 * 5, this.userDataSyncStoreManagementService, this.userDataSyncStoreService, this.userDataSyncService, this.userDataSyncMachinesService, this.logService, this.telemetryService, this.storageService);
        this.autoSync.value.register(this.autoSync.value.onDidStartSync(() => this.lastSyncTriggerTime = (/* @__PURE__ */ new Date()).getTime()));
        this.autoSync.value.register(this.autoSync.value.onDidFinishSync((e) => this.onDidFinishSync(e)));
        if (this.startAutoSync()) {
          this.autoSync.value.start();
        }
      }
    } else {
      this.syncTriggerDelayer.cancel();
      if (this.autoSync.value !== void 0) {
        if (message) {
          this.logService.info(message);
        }
        this.autoSync.clear();
      } else if (message && this.userDataSyncEnablementService.isEnabled()) {
        this.logService.info(message);
      }
    }
  }
  // For tests purpose only
  startAutoSync() {
    return true;
  }
  isAutoSyncEnabled() {
    if (!this.userDataSyncEnablementService.isEnabled()) {
      return { enabled: false, message: "[AutoSync] Disabled." };
    }
    if (!this.userDataSyncAccountService.account) {
      return { enabled: false, message: "[AutoSync] Suspended until auth token is available." };
    }
    if (this.userDataSyncStoreService.donotMakeRequestsUntil) {
      return { enabled: false, message: `[AutoSync] Suspended until ${toLocalISOString(this.userDataSyncStoreService.donotMakeRequestsUntil)} because server is not accepting requests until then.` };
    }
    if (this.suspendUntilRestart) {
      return { enabled: false, message: "[AutoSync] Suspended until restart." };
    }
    if (this.meteredConnectionService.isConnectionMetered) {
      return { enabled: false, message: "[AutoSync] Suspended because connection is metered." };
    }
    return { enabled: true };
  }
  async turnOn() {
    this.stopDisableMachineEventually();
    this.lastSyncUrl = this.syncUrl;
    this.updateEnablement(true);
  }
  async turnOff(everywhere, softTurnOffOnError, donotRemoveMachine) {
    try {
      if (this.userDataSyncAccountService.account && !donotRemoveMachine) {
        await this.userDataSyncMachinesService.removeCurrentMachine();
      }
      this.updateEnablement(false);
      this.storageService.remove(sessionIdKey, StorageScope.APPLICATION);
      if (everywhere) {
        await this.userDataSyncService.reset();
      } else {
        await this.userDataSyncService.resetLocal();
      }
    } catch (error) {
      this.logService.error(error);
      if (softTurnOffOnError) {
        this.updateEnablement(false);
      } else {
        throw error;
      }
    }
  }
  updateEnablement(enabled) {
    if (this.userDataSyncEnablementService.isEnabled() !== enabled) {
      this.userDataSyncEnablementService.setEnablement(enabled);
      this.updateAutoSync();
    }
  }
  hasProductQualityChanged() {
    return !!this.previousProductQuality && !!this.productQuality && this.previousProductQuality !== this.productQuality;
  }
  async onDidFinishSync(error) {
    this.logService.debug("[AutoSync] Sync Finished");
    if (!error) {
      this.successiveFailures = 0;
      return;
    }
    const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
    if (userDataSyncError.code === UserDataSyncErrorCode.SessionExpired) {
      await this.turnOff(
        false,
        true
        /* force soft turnoff on error */
      );
      this.logService.info("[AutoSync] Turned off sync because current session is expired");
    } else if (userDataSyncError.code === UserDataSyncErrorCode.TurnedOff) {
      await this.turnOff(
        false,
        true
        /* force soft turnoff on error */
      );
      this.logService.info("[AutoSync] Turned off sync because sync is turned off in the cloud");
    } else if (userDataSyncError.code === UserDataSyncErrorCode.LocalTooManyRequests) {
      this.suspendUntilRestart = true;
      this.logService.info("[AutoSync] Suspended sync because of making too many requests to server");
      this.updateAutoSync();
    } else if (userDataSyncError.code === UserDataSyncErrorCode.TooManyRequests) {
      await this.turnOff(
        false,
        true,
        true
        /* do not disable machine because disabling a machine makes request to server and can fail with TooManyRequests */
      );
      this.disableMachineEventually();
      this.logService.info("[AutoSync] Turned off sync because of making too many requests to server");
    } else if (userDataSyncError.code === UserDataSyncErrorCode.MethodNotFound) {
      await this.turnOff(
        false,
        true
        /* force soft turnoff on error */
      );
      this.logService.info("[AutoSync] Turned off sync because current client is making requests to server that are not supported");
    } else if (userDataSyncError.code === UserDataSyncErrorCode.UpgradeRequired || userDataSyncError.code === UserDataSyncErrorCode.Gone) {
      await this.turnOff(
        false,
        true,
        true
        /* do not disable machine because disabling a machine makes request to server and can fail with upgrade required or gone */
      );
      this.disableMachineEventually();
      this.logService.info("[AutoSync] Turned off sync because current client is not compatible with server. Requires client upgrade.");
    } else if (userDataSyncError.code === UserDataSyncErrorCode.IncompatibleLocalContent) {
      await this.turnOff(
        false,
        true
        /* force soft turnoff on error */
      );
      this.logService.info(`[AutoSync] Turned off sync because server has ${userDataSyncError.resource} content with newer version than of client. Requires client upgrade.`);
    } else if (userDataSyncError.code === UserDataSyncErrorCode.IncompatibleRemoteContent) {
      await this.turnOff(
        false,
        true
        /* force soft turnoff on error */
      );
      this.logService.info(`[AutoSync] Turned off sync because server has ${userDataSyncError.resource} content with older version than of client. Requires server reset.`);
    } else if (userDataSyncError.code === UserDataSyncErrorCode.ServiceChanged || userDataSyncError.code === UserDataSyncErrorCode.DefaultServiceChanged) {
      if (isWeb && userDataSyncError.code === UserDataSyncErrorCode.DefaultServiceChanged && !this.hasProductQualityChanged()) {
        await this.turnOff(
          false,
          true
          /* force soft turnoff on error */
        );
        this.logService.info("[AutoSync] Turned off sync because default sync service is changed.");
      } else {
        await this.turnOff(
          false,
          true,
          true
          /* do not disable machine */
        );
        await this.turnOn();
        this.logService.info("[AutoSync] Sync Service changed. Turned off auto sync, reset local state and turned on auto sync.");
      }
    } else {
      this.logService.error(userDataSyncError);
      this.successiveFailures++;
    }
    this._onError.fire(userDataSyncError);
  }
  async disableMachineEventually() {
    this.storageService.store(disableMachineEventuallyKey, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
    await timeout(1e3 * 60 * 10);
    if (!this.hasToDisableMachineEventually()) {
      return;
    }
    this.stopDisableMachineEventually();
    if (!this.userDataSyncEnablementService.isEnabled() && this.userDataSyncAccountService.account) {
      await this.userDataSyncMachinesService.removeCurrentMachine();
    }
  }
  hasToDisableMachineEventually() {
    return this.storageService.getBoolean(disableMachineEventuallyKey, StorageScope.APPLICATION, false);
  }
  stopDisableMachineEventually() {
    this.storageService.remove(disableMachineEventuallyKey, StorageScope.APPLICATION);
  }
  async triggerSync(sources, options) {
    if (this.autoSync.value === void 0) {
      return this.syncTriggerDelayer.cancel();
    }
    if (options?.skipIfSyncedRecently && this.lastSyncTriggerTime && (/* @__PURE__ */ new Date()).getTime() - this.lastSyncTriggerTime < 1e4) {
      this.logService.debug("[AutoSync] Skipping because sync was triggered recently.", sources);
      return;
    }
    this.sources.push(...sources);
    return this.syncTriggerDelayer.trigger(async () => {
      this.logService.trace("[AutoSync] Activity sources", ...this.sources);
      this.sources = [];
      if (this.autoSync.value) {
        await this.autoSync.value.sync("Activity", !!options?.disableCache);
      }
    }, this.successiveFailures ? Math.min(this.getSyncTriggerDelayTime() * this.successiveFailures, 6e4) : options?.immediately ? 0 : this.getSyncTriggerDelayTime());
  }
  getSyncTriggerDelayTime() {
    if (this.lastSyncTriggerTime && (/* @__PURE__ */ new Date()).getTime() - this.lastSyncTriggerTime > 1e4) {
      this.logService.debug("[AutoSync] Sync immediately because last sync was triggered more than 10 seconds ago.");
      return 0;
    }
    return 3e3;
  }
};
UserDataAutoSyncService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IUserDataSyncStoreManagementService),
  __decorateParam(2, IUserDataSyncStoreService),
  __decorateParam(3, IUserDataSyncEnablementService),
  __decorateParam(4, IUserDataSyncService),
  __decorateParam(5, IUserDataSyncLogService),
  __decorateParam(6, IUserDataSyncAccountService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IUserDataSyncMachinesService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IMeteredConnectionService)
], UserDataAutoSyncService);
const _AutoSync = class _AutoSync extends Disposable {
  constructor(lastSyncUrl, interval, userDataSyncStoreManagementService, userDataSyncStoreService, userDataSyncService, userDataSyncMachinesService, logService, telemetryService, storageService) {
    super();
    this.lastSyncUrl = lastSyncUrl;
    this.interval = interval;
    this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
    this.userDataSyncStoreService = userDataSyncStoreService;
    this.userDataSyncService = userDataSyncService;
    this.userDataSyncMachinesService = userDataSyncMachinesService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this.storageService = storageService;
    this.intervalHandler = this._register(new MutableDisposable());
    this._onDidStartSync = this._register(new Emitter());
    this.onDidStartSync = this._onDidStartSync.event;
    this._onDidFinishSync = this._register(new Emitter());
    this.onDidFinishSync = this._onDidFinishSync.event;
    this.manifest = null;
  }
  start() {
    this._register(this.onDidFinishSync(() => this.waitUntilNextIntervalAndSync()));
    this._register(toDisposable(() => {
      if (this.syncPromise) {
        this.syncPromise.cancel();
        this.logService.info("[AutoSync] Cancelled sync that is in progress");
        this.syncPromise = void 0;
      }
      this.syncTask?.stop();
      this.logService.info("[AutoSync] Stopped");
    }));
    this.sync(_AutoSync.INTERVAL_SYNCING, false);
  }
  waitUntilNextIntervalAndSync() {
    this.intervalHandler.value = disposableTimeout(() => {
      this.sync(_AutoSync.INTERVAL_SYNCING, false);
      this.intervalHandler.value = void 0;
    }, this.interval);
  }
  sync(reason, disableCache) {
    const syncPromise = createCancelablePromise(async (token) => {
      if (this.syncPromise) {
        try {
          this.logService.debug("[AutoSync] Waiting until sync is finished.");
          await this.syncPromise;
        } catch (error) {
          if (isCancellationError(error)) {
            return;
          }
        }
      }
      return this.doSync(reason, disableCache, token);
    });
    this.syncPromise = syncPromise;
    this.syncPromise.finally(() => this.syncPromise = void 0);
    return this.syncPromise;
  }
  hasSyncServiceChanged() {
    return this.lastSyncUrl !== void 0 && !isEqual(this.lastSyncUrl, this.userDataSyncStoreManagementService.userDataSyncStore?.url);
  }
  async hasDefaultServiceChanged() {
    const previous = await this.userDataSyncStoreManagementService.getPreviousUserDataSyncStore();
    const current = this.userDataSyncStoreManagementService.userDataSyncStore;
    return !!current && !!previous && (!isEqual(current.defaultUrl, previous.defaultUrl) || !isEqual(current.insidersUrl, previous.insidersUrl) || !isEqual(current.stableUrl, previous.stableUrl));
  }
  async doSync(reason, disableCache, token) {
    this.logService.info(`[AutoSync] Triggered by ${reason}`);
    this._onDidStartSync.fire();
    let error;
    try {
      await this.createAndRunSyncTask(disableCache, token);
    } catch (e) {
      this.logService.error(e);
      error = e;
      if (UserDataSyncError.toUserDataSyncError(e).code === UserDataSyncErrorCode.MethodNotFound) {
        try {
          this.logService.info("[AutoSync] Client is making invalid requests. Cleaning up data...");
          await this.userDataSyncService.cleanUpRemoteData();
          this.logService.info("[AutoSync] Retrying sync...");
          await this.createAndRunSyncTask(disableCache, token);
          error = void 0;
        } catch (e1) {
          this.logService.error(e1);
          error = e1;
        }
      }
    }
    this._onDidFinishSync.fire(error);
  }
  async createAndRunSyncTask(disableCache, token) {
    this.syncTask = await this.userDataSyncService.createSyncTask(this.manifest, disableCache);
    if (token.isCancellationRequested) {
      return;
    }
    this.manifest = this.syncTask.manifest;
    if (this.manifest === null && await this.userDataSyncService.hasPreviouslySynced()) {
      if (this.hasSyncServiceChanged()) {
        if (await this.hasDefaultServiceChanged()) {
          throw new UserDataAutoSyncError(localize("default service changed", "Cannot sync because default service has changed"), UserDataSyncErrorCode.DefaultServiceChanged);
        } else {
          throw new UserDataAutoSyncError(localize("service changed", "Cannot sync because sync service has changed"), UserDataSyncErrorCode.ServiceChanged);
        }
      } else {
        throw new UserDataAutoSyncError(localize("turned off", "Cannot sync because syncing is turned off in the cloud"), UserDataSyncErrorCode.TurnedOff);
      }
    }
    const sessionId = this.storageService.get(sessionIdKey, StorageScope.APPLICATION);
    if (sessionId && this.manifest && sessionId !== this.manifest.session) {
      if (this.hasSyncServiceChanged()) {
        if (await this.hasDefaultServiceChanged()) {
          throw new UserDataAutoSyncError(localize("default service changed", "Cannot sync because default service has changed"), UserDataSyncErrorCode.DefaultServiceChanged);
        } else {
          throw new UserDataAutoSyncError(localize("service changed", "Cannot sync because sync service has changed"), UserDataSyncErrorCode.ServiceChanged);
        }
      } else {
        throw new UserDataAutoSyncError(localize("session expired", "Cannot sync because current session is expired"), UserDataSyncErrorCode.SessionExpired);
      }
    }
    const machines = await this.userDataSyncMachinesService.getMachines(this.manifest || void 0);
    if (token.isCancellationRequested) {
      return;
    }
    const currentMachine = machines.find((machine) => machine.isCurrent);
    if (currentMachine?.disabled) {
      throw new UserDataAutoSyncError(localize("turned off machine", "Cannot sync because syncing is turned off on this machine from another machine."), UserDataSyncErrorCode.TurnedOff);
    }
    const startTime = (/* @__PURE__ */ new Date()).getTime();
    await this.syncTask.run();
    this.telemetryService.publicLog2("settingsSync:sync", { duration: (/* @__PURE__ */ new Date()).getTime() - startTime });
    if (this.manifest === null) {
      try {
        this.manifest = await this.userDataSyncStoreService.manifest(null);
      } catch (error) {
        throw new UserDataAutoSyncError(toErrorMessage(error), error instanceof UserDataSyncError ? error.code : UserDataSyncErrorCode.Unknown);
      }
    }
    if (this.manifest && this.manifest.session !== sessionId) {
      this.storageService.store(sessionIdKey, this.manifest.session, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (!currentMachine) {
      await this.userDataSyncMachinesService.addCurrentMachine(this.manifest || void 0);
    }
  }
  register(t) {
    return super._register(t);
  }
};
_AutoSync.INTERVAL_SYNCING = "Interval";
let AutoSync = _AutoSync;
export {
  UserDataAutoSyncService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXHVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBkaXNwb3NhYmxlVGltZW91dCwgVGhyb3R0bGVkRGVsYXllciwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IHRvTG9jYWxJU09TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRlLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9tZXRlcmVkQ29ubmVjdGlvbi9jb21tb24vbWV0ZXJlZENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY1Rhc2ssIElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSwgSVVzZXJEYXRhTWFuaWZlc3QsIElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLCBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIElVc2VyRGF0YVN5bmNTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgVXNlckRhdGFBdXRvU3luY0Vycm9yLCBVc2VyRGF0YVN5bmNFcnJvciwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLCBTeW5jT3B0aW9ucyB9IGZyb20gJy4vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNBY2NvdW50U2VydmljZSB9IGZyb20gJy4vdXNlckRhdGFTeW5jQWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlIH0gZnJvbSAnLi91c2VyRGF0YVN5bmNNYWNoaW5lcy5qcyc7XG5cbmNvbnN0IGRpc2FibGVNYWNoaW5lRXZlbnR1YWxseUtleSA9ICdzeW5jLmRpc2FibGVNYWNoaW5lRXZlbnR1YWxseSc7XG5jb25zdCBzZXNzaW9uSWRLZXkgPSAnc3luYy5zZXNzaW9uSWQnO1xuY29uc3Qgc3RvcmVVcmxLZXkgPSAnc3luYy5zdG9yZVVybCc7XG5jb25zdCBwcm9kdWN0UXVhbGl0eUtleSA9ICdzeW5jLnByb2R1Y3RRdWFsaXR5JztcblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSB7XG5cblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYXV0b1N5bmMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8QXV0b1N5bmM+KCkpO1xuXHRwcml2YXRlIHN1Y2Nlc3NpdmVGYWlsdXJlczogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBsYXN0U3luY1RyaWdnZXJUaW1lOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc3luY1RyaWdnZXJEZWxheWVyOiBUaHJvdHRsZWREZWxheWVyPHZvaWQ+O1xuXHRwcml2YXRlIHN1c3BlbmRVbnRpbFJlc3RhcnQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkVycm9yOiBFbWl0dGVyPFVzZXJEYXRhU3luY0Vycm9yPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVzZXJEYXRhU3luY0Vycm9yPigpKTtcblx0cmVhZG9ubHkgb25FcnJvcjogRXZlbnQ8VXNlckRhdGFTeW5jRXJyb3I+ID0gdGhpcy5fb25FcnJvci5ldmVudDtcblxuXHRwcml2YXRlIGxhc3RTeW5jVXJsOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IHN5bmNVcmwoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHN0b3JlVXJsS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdHJldHVybiB2YWx1ZSA/IFVSSS5wYXJzZSh2YWx1ZSkgOiB1bmRlZmluZWQ7XG5cdH1cblx0cHJpdmF0ZSBzZXQgc3luY1VybChzeW5jVXJsOiBVUkkgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoc3luY1VybCkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShzdG9yZVVybEtleSwgc3luY1VybC50b1N0cmluZygpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKHN0b3JlVXJsS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcHJldmlvdXNQcm9kdWN0UXVhbGl0eTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBwcm9kdWN0UXVhbGl0eSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChwcm9kdWN0UXVhbGl0eUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0fVxuXHRwcml2YXRlIHNldCBwcm9kdWN0UXVhbGl0eShwcm9kdWN0UXVhbGl0eTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHByb2R1Y3RRdWFsaXR5KSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHByb2R1Y3RRdWFsaXR5S2V5LCBwcm9kdWN0UXVhbGl0eSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShwcm9kdWN0UXVhbGl0eUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZTogSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jU2VydmljZTogSVVzZXJEYXRhU3luY1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNBY2NvdW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jQWNjb3VudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2U6IElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZXRlcmVkQ29ubmVjdGlvblNlcnZpY2U6IElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zeW5jVHJpZ2dlckRlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcjx2b2lkPih0aGlzLmdldFN5bmNUcmlnZ2VyRGVsYXlUaW1lKCkpKTtcblxuXHRcdHRoaXMubGFzdFN5bmNVcmwgPSB0aGlzLnN5bmNVcmw7XG5cdFx0dGhpcy5zeW5jVXJsID0gdXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZT8udXJsO1xuXG5cdFx0dGhpcy5wcmV2aW91c1Byb2R1Y3RRdWFsaXR5ID0gdGhpcy5wcm9kdWN0UXVhbGl0eTtcblx0XHR0aGlzLnByb2R1Y3RRdWFsaXR5ID0gcHJvZHVjdFNlcnZpY2UucXVhbGl0eTtcblxuXHRcdGlmICh0aGlzLnN5bmNVcmwpIHtcblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBdXRvU3luY10gVXNpbmcgc2V0dGluZ3Mgc3luYyBzZXJ2aWNlJywgdGhpcy5zeW5jVXJsLnRvU3RyaW5nKCkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVVzZXJEYXRhU3luY1N0b3JlKCgpID0+IHtcblx0XHRcdFx0aWYgKCFpc0VxdWFsKHRoaXMuc3luY1VybCwgdXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZT8udXJsKSkge1xuXHRcdFx0XHRcdHRoaXMubGFzdFN5bmNVcmwgPSB0aGlzLnN5bmNVcmw7XG5cdFx0XHRcdFx0dGhpcy5zeW5jVXJsID0gdXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZT8udXJsO1xuXHRcdFx0XHRcdGlmICh0aGlzLnN5bmNVcmwpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbQXV0b1N5bmNdIFVzaW5nIHNldHRpbmdzIHN5bmMgc2VydmljZScsIHRoaXMuc3luY1VybC50b1N0cmluZygpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0aWYgKHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBdXRvU3luY10gRW5hYmxlZC4nKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbQXV0b1N5bmNdIERpc2FibGVkLicpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVBdXRvU3luYygpO1xuXG5cdFx0XHRpZiAodGhpcy5oYXNUb0Rpc2FibGVNYWNoaW5lRXZlbnR1YWxseSgpKSB7XG5cdFx0XHRcdHRoaXMuZGlzYWJsZU1hY2hpbmVFdmVudHVhbGx5KCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWNjb3VudCgoKSA9PiB0aGlzLnVwZGF0ZUF1dG9TeW5jKCkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5vbkRpZENoYW5nZURvbm90TWFrZVJlcXVlc3RzVW50aWwoKCkgPT4gdGhpcy51cGRhdGVBdXRvU3luYygpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkQ2hhbmdlTG9jYWwoc291cmNlID0+IHRoaXMudHJpZ2dlclN5bmMoW3NvdXJjZV0pKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5vbkRpZENoYW5nZVJlc291cmNlRW5hYmxlbWVudCwgKFssIGVuYWJsZWRdKSA9PiBlbmFibGVkKSgoKSA9PiB0aGlzLnRyaWdnZXJTeW5jKFsncmVzb3VyY2VFbmFibGVtZW50J10pKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VVc2VyRGF0YVN5bmNTdG9yZSgoKSA9PiB0aGlzLnRyaWdnZXJTeW5jKFsndXNlckRhdGFTeW5jU3RvcmVDaGFuZ2VkJ10pKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihtZXRlcmVkQ29ubmVjdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VJc0Nvbm5lY3Rpb25NZXRlcmVkKCgpID0+IHRoaXMudXBkYXRlQXV0b1N5bmMoKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQXV0b1N5bmMoKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBlbmFibGVkLCBtZXNzYWdlIH0gPSB0aGlzLmlzQXV0b1N5bmNFbmFibGVkKCk7XG5cdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdGlmICh0aGlzLmF1dG9TeW5jLnZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5hdXRvU3luYy52YWx1ZSA9IG5ldyBBdXRvU3luYyh0aGlzLmxhc3RTeW5jVXJsLCAxMDAwICogNjAgKiA1IC8qIDUgbWl1dGVzICovLCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsIHRoaXMudXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UsIHRoaXMudXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMudGVsZW1ldHJ5U2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdFx0XHRcdHRoaXMuYXV0b1N5bmMudmFsdWUucmVnaXN0ZXIodGhpcy5hdXRvU3luYy52YWx1ZS5vbkRpZFN0YXJ0U3luYygoKSA9PiB0aGlzLmxhc3RTeW5jVHJpZ2dlclRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSkpO1xuXHRcdFx0XHR0aGlzLmF1dG9TeW5jLnZhbHVlLnJlZ2lzdGVyKHRoaXMuYXV0b1N5bmMudmFsdWUub25EaWRGaW5pc2hTeW5jKGUgPT4gdGhpcy5vbkRpZEZpbmlzaFN5bmMoZSkpKTtcblx0XHRcdFx0aWYgKHRoaXMuc3RhcnRBdXRvU3luYygpKSB7XG5cdFx0XHRcdFx0dGhpcy5hdXRvU3luYy52YWx1ZS5zdGFydCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3luY1RyaWdnZXJEZWxheWVyLmNhbmNlbCgpO1xuXHRcdFx0aWYgKHRoaXMuYXV0b1N5bmMudmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpZiAobWVzc2FnZSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKG1lc3NhZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuYXV0b1N5bmMuY2xlYXIoKTtcblx0XHRcdH1cblxuXHRcdFx0LyogbG9nIG1lc3NhZ2Ugd2hlbiBhdXRvIHN5bmMgaXMgbm90IGRpc2FibGVkIGJ5IHVzZXIgKi9cblx0XHRcdGVsc2UgaWYgKG1lc3NhZ2UgJiYgdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBGb3IgdGVzdHMgcHVycG9zZSBvbmx5XG5cdHByb3RlY3RlZCBzdGFydEF1dG9TeW5jKCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXG5cdHByaXZhdGUgaXNBdXRvU3luY0VuYWJsZWQoKTogeyBlbmFibGVkOiBib29sZWFuOyBtZXNzYWdlPzogc3RyaW5nIH0ge1xuXHRcdGlmICghdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIHsgZW5hYmxlZDogZmFsc2UsIG1lc3NhZ2U6ICdbQXV0b1N5bmNdIERpc2FibGVkLicgfTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlLmFjY291bnQpIHtcblx0XHRcdHJldHVybiB7IGVuYWJsZWQ6IGZhbHNlLCBtZXNzYWdlOiAnW0F1dG9TeW5jXSBTdXNwZW5kZWQgdW50aWwgYXV0aCB0b2tlbiBpcyBhdmFpbGFibGUuJyB9O1xuXHRcdH1cblx0XHRpZiAodGhpcy51c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UuZG9ub3RNYWtlUmVxdWVzdHNVbnRpbCkge1xuXHRcdFx0cmV0dXJuIHsgZW5hYmxlZDogZmFsc2UsIG1lc3NhZ2U6IGBbQXV0b1N5bmNdIFN1c3BlbmRlZCB1bnRpbCAke3RvTG9jYWxJU09TdHJpbmcodGhpcy51c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UuZG9ub3RNYWtlUmVxdWVzdHNVbnRpbCl9IGJlY2F1c2Ugc2VydmVyIGlzIG5vdCBhY2NlcHRpbmcgcmVxdWVzdHMgdW50aWwgdGhlbi5gIH07XG5cdFx0fVxuXHRcdGlmICh0aGlzLnN1c3BlbmRVbnRpbFJlc3RhcnQpIHtcblx0XHRcdHJldHVybiB7IGVuYWJsZWQ6IGZhbHNlLCBtZXNzYWdlOiAnW0F1dG9TeW5jXSBTdXNwZW5kZWQgdW50aWwgcmVzdGFydC4nIH07XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1ldGVyZWRDb25uZWN0aW9uU2VydmljZS5pc0Nvbm5lY3Rpb25NZXRlcmVkKSB7XG5cdFx0XHRyZXR1cm4geyBlbmFibGVkOiBmYWxzZSwgbWVzc2FnZTogJ1tBdXRvU3luY10gU3VzcGVuZGVkIGJlY2F1c2UgY29ubmVjdGlvbiBpcyBtZXRlcmVkLicgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgZW5hYmxlZDogdHJ1ZSB9O1xuXHR9XG5cblx0YXN5bmMgdHVybk9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc3RvcERpc2FibGVNYWNoaW5lRXZlbnR1YWxseSgpO1xuXHRcdHRoaXMubGFzdFN5bmNVcmwgPSB0aGlzLnN5bmNVcmw7XG5cdFx0dGhpcy51cGRhdGVFbmFibGVtZW50KHRydWUpO1xuXHR9XG5cblx0YXN5bmMgdHVybk9mZihldmVyeXdoZXJlOiBib29sZWFuLCBzb2Z0VHVybk9mZk9uRXJyb3I/OiBib29sZWFuLCBkb25vdFJlbW92ZU1hY2hpbmU/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblxuXHRcdFx0Ly8gUmVtb3ZlIG1hY2hpbmVcblx0XHRcdGlmICh0aGlzLnVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlLmFjY291bnQgJiYgIWRvbm90UmVtb3ZlTWFjaGluZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZS5yZW1vdmVDdXJyZW50TWFjaGluZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEaXNhYmxlIEF1dG8gU3luY1xuXHRcdFx0dGhpcy51cGRhdGVFbmFibGVtZW50KGZhbHNlKTtcblxuXHRcdFx0Ly8gUmVzZXQgU2Vzc2lvblxuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoc2Vzc2lvbklkS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXG5cdFx0XHQvLyBSZXNldFxuXHRcdFx0aWYgKGV2ZXJ5d2hlcmUpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLnJlc2V0KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UucmVzZXRMb2NhbCgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0aWYgKHNvZnRUdXJuT2ZmT25FcnJvcikge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUVuYWJsZW1lbnQoZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFbmFibGVtZW50KGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSAhPT0gZW5hYmxlZCkge1xuXHRcdFx0dGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5zZXRFbmFibGVtZW50KGVuYWJsZWQpO1xuXHRcdFx0dGhpcy51cGRhdGVBdXRvU3luYygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFzUHJvZHVjdFF1YWxpdHlDaGFuZ2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMucHJldmlvdXNQcm9kdWN0UXVhbGl0eSAmJiAhIXRoaXMucHJvZHVjdFF1YWxpdHkgJiYgdGhpcy5wcmV2aW91c1Byb2R1Y3RRdWFsaXR5ICE9PSB0aGlzLnByb2R1Y3RRdWFsaXR5O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZEZpbmlzaFN5bmMoZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbQXV0b1N5bmNdIFN5bmMgRmluaXNoZWQnKTtcblx0XHRpZiAoIWVycm9yKSB7XG5cdFx0XHQvLyBTeW5jIGZpbmlzaGVkIHdpdGhvdXQgZXJyb3JzXG5cdFx0XHR0aGlzLnN1Y2Nlc3NpdmVGYWlsdXJlcyA9IDA7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRXJyb3Igd2hpbGUgc3luY2luZ1xuXHRcdGNvbnN0IHVzZXJEYXRhU3luY0Vycm9yID0gVXNlckRhdGFTeW5jRXJyb3IudG9Vc2VyRGF0YVN5bmNFcnJvcihlcnJvcik7XG5cblx0XHQvLyBTZXNzaW9uIGdvdCBleHBpcmVkXG5cdFx0aWYgKHVzZXJEYXRhU3luY0Vycm9yLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5TZXNzaW9uRXhwaXJlZCkge1xuXHRcdFx0YXdhaXQgdGhpcy50dXJuT2ZmKGZhbHNlLCB0cnVlIC8qIGZvcmNlIHNvZnQgdHVybm9mZiBvbiBlcnJvciAqLyk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW0F1dG9TeW5jXSBUdXJuZWQgb2ZmIHN5bmMgYmVjYXVzZSBjdXJyZW50IHNlc3Npb24gaXMgZXhwaXJlZCcpO1xuXHRcdH1cblxuXHRcdC8vIFR1cm5lZCBvZmYgZnJvbSBhbm90aGVyIGRldmljZVxuXHRcdGVsc2UgaWYgKHVzZXJEYXRhU3luY0Vycm9yLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5UdXJuZWRPZmYpIHtcblx0XHRcdGF3YWl0IHRoaXMudHVybk9mZihmYWxzZSwgdHJ1ZSAvKiBmb3JjZSBzb2Z0IHR1cm5vZmYgb24gZXJyb3IgKi8pO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBdXRvU3luY10gVHVybmVkIG9mZiBzeW5jIGJlY2F1c2Ugc3luYyBpcyB0dXJuZWQgb2ZmIGluIHRoZSBjbG91ZCcpO1xuXHRcdH1cblxuXHRcdC8vIEV4Y2VlZGVkIFJhdGUgTGltaXQgb24gQ2xpZW50XG5cdFx0ZWxzZSBpZiAodXNlckRhdGFTeW5jRXJyb3IuY29kZSA9PT0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLkxvY2FsVG9vTWFueVJlcXVlc3RzKSB7XG5cdFx0XHR0aGlzLnN1c3BlbmRVbnRpbFJlc3RhcnQgPSB0cnVlO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBdXRvU3luY10gU3VzcGVuZGVkIHN5bmMgYmVjYXVzZSBvZiBtYWtpbmcgdG9vIG1hbnkgcmVxdWVzdHMgdG8gc2VydmVyJyk7XG5cdFx0XHR0aGlzLnVwZGF0ZUF1dG9TeW5jKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRXhjZWVkZWQgUmF0ZSBMaW1pdCBvbiBTZXJ2ZXJcblx0XHRlbHNlIGlmICh1c2VyRGF0YVN5bmNFcnJvci5jb2RlID09PSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVG9vTWFueVJlcXVlc3RzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnR1cm5PZmYoZmFsc2UsIHRydWUgLyogZm9yY2Ugc29mdCB0dXJub2ZmIG9uIGVycm9yICovLFxuXHRcdFx0XHR0cnVlIC8qIGRvIG5vdCBkaXNhYmxlIG1hY2hpbmUgYmVjYXVzZSBkaXNhYmxpbmcgYSBtYWNoaW5lIG1ha2VzIHJlcXVlc3QgdG8gc2VydmVyIGFuZCBjYW4gZmFpbCB3aXRoIFRvb01hbnlSZXF1ZXN0cyAqLyk7XG5cdFx0XHR0aGlzLmRpc2FibGVNYWNoaW5lRXZlbnR1YWxseSgpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBdXRvU3luY10gVHVybmVkIG9mZiBzeW5jIGJlY2F1c2Ugb2YgbWFraW5nIHRvbyBtYW55IHJlcXVlc3RzIHRvIHNlcnZlcicpO1xuXHRcdH1cblxuXHRcdC8vIE1ldGhvZCBOb3QgRm91bmRcblx0XHRlbHNlIGlmICh1c2VyRGF0YVN5bmNFcnJvci5jb2RlID09PSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTWV0aG9kTm90Rm91bmQpIHtcblx0XHRcdGF3YWl0IHRoaXMudHVybk9mZihmYWxzZSwgdHJ1ZSAvKiBmb3JjZSBzb2Z0IHR1cm5vZmYgb24gZXJyb3IgKi8pO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tBdXRvU3luY10gVHVybmVkIG9mZiBzeW5jIGJlY2F1c2UgY3VycmVudCBjbGllbnQgaXMgbWFraW5nIHJlcXVlc3RzIHRvIHNlcnZlciB0aGF0IGFyZSBub3Qgc3VwcG9ydGVkJyk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBncmFkZSBSZXF1aXJlZCBvciBHb25lXG5cdFx0ZWxzZSBpZiAodXNlckRhdGFTeW5jRXJyb3IuY29kZSA9PT0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLlVwZ3JhZGVSZXF1aXJlZCB8fCB1c2VyRGF0YVN5bmNFcnJvci5jb2RlID09PSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuR29uZSkge1xuXHRcdFx0YXdhaXQgdGhpcy50dXJuT2ZmKGZhbHNlLCB0cnVlIC8qIGZvcmNlIHNvZnQgdHVybm9mZiBvbiBlcnJvciAqLyxcblx0XHRcdFx0dHJ1ZSAvKiBkbyBub3QgZGlzYWJsZSBtYWNoaW5lIGJlY2F1c2UgZGlzYWJsaW5nIGEgbWFjaGluZSBtYWtlcyByZXF1ZXN0IHRvIHNlcnZlciBhbmQgY2FuIGZhaWwgd2l0aCB1cGdyYWRlIHJlcXVpcmVkIG9yIGdvbmUgKi8pO1xuXHRcdFx0dGhpcy5kaXNhYmxlTWFjaGluZUV2ZW50dWFsbHkoKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbQXV0b1N5bmNdIFR1cm5lZCBvZmYgc3luYyBiZWNhdXNlIGN1cnJlbnQgY2xpZW50IGlzIG5vdCBjb21wYXRpYmxlIHdpdGggc2VydmVyLiBSZXF1aXJlcyBjbGllbnQgdXBncmFkZS4nKTtcblx0XHR9XG5cblx0XHQvLyBJbmNvbXBhdGlibGUgTG9jYWwgQ29udGVudFxuXHRcdGVsc2UgaWYgKHVzZXJEYXRhU3luY0Vycm9yLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5JbmNvbXBhdGlibGVMb2NhbENvbnRlbnQpIHtcblx0XHRcdGF3YWl0IHRoaXMudHVybk9mZihmYWxzZSwgdHJ1ZSAvKiBmb3JjZSBzb2Z0IHR1cm5vZmYgb24gZXJyb3IgKi8pO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtBdXRvU3luY10gVHVybmVkIG9mZiBzeW5jIGJlY2F1c2Ugc2VydmVyIGhhcyAke3VzZXJEYXRhU3luY0Vycm9yLnJlc291cmNlfSBjb250ZW50IHdpdGggbmV3ZXIgdmVyc2lvbiB0aGFuIG9mIGNsaWVudC4gUmVxdWlyZXMgY2xpZW50IHVwZ3JhZGUuYCk7XG5cdFx0fVxuXG5cdFx0Ly8gSW5jb21wYXRpYmxlIFJlbW90ZSBDb250ZW50XG5cdFx0ZWxzZSBpZiAodXNlckRhdGFTeW5jRXJyb3IuY29kZSA9PT0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLkluY29tcGF0aWJsZVJlbW90ZUNvbnRlbnQpIHtcblx0XHRcdGF3YWl0IHRoaXMudHVybk9mZihmYWxzZSwgdHJ1ZSAvKiBmb3JjZSBzb2Z0IHR1cm5vZmYgb24gZXJyb3IgKi8pO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtBdXRvU3luY10gVHVybmVkIG9mZiBzeW5jIGJlY2F1c2Ugc2VydmVyIGhhcyAke3VzZXJEYXRhU3luY0Vycm9yLnJlc291cmNlfSBjb250ZW50IHdpdGggb2xkZXIgdmVyc2lvbiB0aGFuIG9mIGNsaWVudC4gUmVxdWlyZXMgc2VydmVyIHJlc2V0LmApO1xuXHRcdH1cblxuXHRcdC8vIFNlcnZpY2UgY2hhbmdlZFxuXHRcdGVsc2UgaWYgKHVzZXJEYXRhU3luY0Vycm9yLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5TZXJ2aWNlQ2hhbmdlZCB8fCB1c2VyRGF0YVN5bmNFcnJvci5jb2RlID09PSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuRGVmYXVsdFNlcnZpY2VDaGFuZ2VkKSB7XG5cblx0XHRcdC8vIENoZWNrIGlmIGRlZmF1bHQgc2V0dGluZ3Mgc3luYyBzZXJ2aWNlIGhhcyBjaGFuZ2VkIGluIHdlYiB3aXRob3V0IGNoYW5naW5nIHRoZSBwcm9kdWN0IHF1YWxpdHlcblx0XHRcdC8vIFRoZW4gdHVybiBvZmYgc2V0dGluZ3Mgc3luYyBhbmQgYXNrIHVzZXIgdG8gdHVybiBvbiBhZ2FpblxuXHRcdFx0aWYgKGlzV2ViICYmIHVzZXJEYXRhU3luY0Vycm9yLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5EZWZhdWx0U2VydmljZUNoYW5nZWQgJiYgIXRoaXMuaGFzUHJvZHVjdFF1YWxpdHlDaGFuZ2VkKCkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy50dXJuT2ZmKGZhbHNlLCB0cnVlIC8qIGZvcmNlIHNvZnQgdHVybm9mZiBvbiBlcnJvciAqLyk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbQXV0b1N5bmNdIFR1cm5lZCBvZmYgc3luYyBiZWNhdXNlIGRlZmF1bHQgc3luYyBzZXJ2aWNlIGlzIGNoYW5nZWQuJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNlcnZpY2UgaGFzIGNoYW5nZWQgYnkgdGhlIHVzZXIuIFNvIHR1cm4gb2ZmIGFuZCB0dXJuIG9uIHN5bmMuXG5cdFx0XHQvLyBTaG93IGEgcHJvbXB0IHRvIHRoZSB1c2VyIGFib3V0IHNlcnZpY2UgY2hhbmdlLlxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudHVybk9mZihmYWxzZSwgdHJ1ZSAvKiBmb3JjZSBzb2Z0IHR1cm5vZmYgb24gZXJyb3IgKi8sIHRydWUgLyogZG8gbm90IGRpc2FibGUgbWFjaGluZSAqLyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMudHVybk9uKCk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbQXV0b1N5bmNdIFN5bmMgU2VydmljZSBjaGFuZ2VkLiBUdXJuZWQgb2ZmIGF1dG8gc3luYywgcmVzZXQgbG9jYWwgc3RhdGUgYW5kIHR1cm5lZCBvbiBhdXRvIHN5bmMuJyk7XG5cdFx0XHR9XG5cblx0XHR9XG5cblx0XHRlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcih1c2VyRGF0YVN5bmNFcnJvcik7XG5cdFx0XHR0aGlzLnN1Y2Nlc3NpdmVGYWlsdXJlcysrO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRXJyb3IuZmlyZSh1c2VyRGF0YVN5bmNFcnJvcik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRpc2FibGVNYWNoaW5lRXZlbnR1YWxseSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGRpc2FibGVNYWNoaW5lRXZlbnR1YWxseUtleSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTAwMCAqIDYwICogMTApO1xuXG5cdFx0Ly8gUmV0dXJuIGlmIGdvdCBzdG9wcGVkIG1lYW53aGlsZS5cblx0XHRpZiAoIXRoaXMuaGFzVG9EaXNhYmxlTWFjaGluZUV2ZW50dWFsbHkoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RvcERpc2FibGVNYWNoaW5lRXZlbnR1YWxseSgpO1xuXG5cdFx0Ly8gZGlzYWJsZSBvbmx5IGlmIHN5bmMgaXMgZGlzYWJsZWRcblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkgJiYgdGhpcy51c2VyRGF0YVN5bmNBY2NvdW50U2VydmljZS5hY2NvdW50KSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZS5yZW1vdmVDdXJyZW50TWFjaGluZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFzVG9EaXNhYmxlTWFjaGluZUV2ZW50dWFsbHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihkaXNhYmxlTWFjaGluZUV2ZW50dWFsbHlLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdG9wRGlzYWJsZU1hY2hpbmVFdmVudHVhbGx5KCk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKGRpc2FibGVNYWNoaW5lRXZlbnR1YWxseUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0fVxuXG5cdHByaXZhdGUgc291cmNlczogc3RyaW5nW10gPSBbXTtcblx0YXN5bmMgdHJpZ2dlclN5bmMoc291cmNlczogc3RyaW5nW10sIG9wdGlvbnM/OiBTeW5jT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmF1dG9TeW5jLnZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLnN5bmNUcmlnZ2VyRGVsYXllci5jYW5jZWwoKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucz8uc2tpcElmU3luY2VkUmVjZW50bHkgJiYgdGhpcy5sYXN0U3luY1RyaWdnZXJUaW1lICYmIG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gdGhpcy5sYXN0U3luY1RyaWdnZXJUaW1lIDwgMTBfMDAwKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tBdXRvU3luY10gU2tpcHBpbmcgYmVjYXVzZSBzeW5jIHdhcyB0cmlnZ2VyZWQgcmVjZW50bHkuJywgc291cmNlcyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zb3VyY2VzLnB1c2goLi4uc291cmNlcyk7XG5cdFx0cmV0dXJuIHRoaXMuc3luY1RyaWdnZXJEZWxheWVyLnRyaWdnZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQXV0b1N5bmNdIEFjdGl2aXR5IHNvdXJjZXMnLCAuLi50aGlzLnNvdXJjZXMpO1xuXHRcdFx0dGhpcy5zb3VyY2VzID0gW107XG5cdFx0XHRpZiAodGhpcy5hdXRvU3luYy52YWx1ZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmF1dG9TeW5jLnZhbHVlLnN5bmMoJ0FjdGl2aXR5JywgISFvcHRpb25zPy5kaXNhYmxlQ2FjaGUpO1xuXHRcdFx0fVxuXHRcdH0sIHRoaXMuc3VjY2Vzc2l2ZUZhaWx1cmVzXG5cdFx0XHQ/IE1hdGgubWluKHRoaXMuZ2V0U3luY1RyaWdnZXJEZWxheVRpbWUoKSAqIHRoaXMuc3VjY2Vzc2l2ZUZhaWx1cmVzLCA2MF8wMDApIC8qIERlbGF5IGxpbmVhcmx5IHVudGlsIG1heCAxIG1pbnV0ZSAqL1xuXHRcdFx0OiBvcHRpb25zPy5pbW1lZGlhdGVseSA/IDAgOiB0aGlzLmdldFN5bmNUcmlnZ2VyRGVsYXlUaW1lKCkpO1xuXG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0U3luY1RyaWdnZXJEZWxheVRpbWUoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5sYXN0U3luY1RyaWdnZXJUaW1lICYmIG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gdGhpcy5sYXN0U3luY1RyaWdnZXJUaW1lID4gMTBfMDAwKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tBdXRvU3luY10gU3luYyBpbW1lZGlhdGVseSBiZWNhdXNlIGxhc3Qgc3luYyB3YXMgdHJpZ2dlcmVkIG1vcmUgdGhhbiAxMCBzZWNvbmRzIGFnby4nKTtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRyZXR1cm4gM18wMDA7IC8qIERlYm91bmNlIGZvciAzIHNlY29uZHMgaWYgdGhlcmUgYXJlIG5vIGZhaWx1cmVzICovXG5cdH1cblxufVxuXG5jbGFzcyBBdXRvU3luYyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IElOVEVSVkFMX1NZTkNJTkcgPSAnSW50ZXJ2YWwnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaW50ZXJ2YWxIYW5kbGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFN0YXJ0U3luYyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFN0YXJ0U3luYyA9IHRoaXMuX29uRGlkU3RhcnRTeW5jLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRmluaXNoU3luYyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEVycm9yIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRGaW5pc2hTeW5jID0gdGhpcy5fb25EaWRGaW5pc2hTeW5jLmV2ZW50O1xuXG5cdHByaXZhdGUgbWFuaWZlc3Q6IElVc2VyRGF0YU1hbmlmZXN0IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgc3luY1Rhc2s6IElVc2VyRGF0YVN5bmNUYXNrIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHN5bmNQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhc3RTeW5jVXJsOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbnRlcnZhbDogbnVtYmVyIC8qIGluIG1pbGxpc2Vjb25kcyAqLyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jU2VydmljZTogSVVzZXJEYXRhU3luY1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2U6IElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHN0YXJ0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRGaW5pc2hTeW5jKCgpID0+IHRoaXMud2FpdFVudGlsTmV4dEludGVydmFsQW5kU3luYygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnN5bmNQcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMuc3luY1Byb21pc2UuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbQXV0b1N5bmNdIENhbmNlbGxlZCBzeW5jIHRoYXQgaXMgaW4gcHJvZ3Jlc3MnKTtcblx0XHRcdFx0dGhpcy5zeW5jUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuc3luY1Rhc2s/LnN0b3AoKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbQXV0b1N5bmNdIFN0b3BwZWQnKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5zeW5jKEF1dG9TeW5jLklOVEVSVkFMX1NZTkNJTkcsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgd2FpdFVudGlsTmV4dEludGVydmFsQW5kU3luYygpOiB2b2lkIHtcblx0XHR0aGlzLmludGVydmFsSGFuZGxlci52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuc3luYyhBdXRvU3luYy5JTlRFUlZBTF9TWU5DSU5HLCBmYWxzZSk7XG5cdFx0XHR0aGlzLmludGVydmFsSGFuZGxlci52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR9LCB0aGlzLmludGVydmFsKTtcblx0fVxuXG5cdHN5bmMocmVhc29uOiBzdHJpbmcsIGRpc2FibGVDYWNoZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN5bmNQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgdG9rZW4gPT4ge1xuXHRcdFx0aWYgKHRoaXMuc3luY1Byb21pc2UpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHQvLyBXYWl0IHVudGlsIGV4aXN0aW5nIHN5bmMgaXMgZmluaXNoZWRcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tBdXRvU3luY10gV2FpdGluZyB1bnRpbCBzeW5jIGlzIGZpbmlzaGVkLicpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuc3luY1Byb21pc2U7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdFx0XHQvLyBDYW5jZWxsZWQgPT4gRGlzcG9zZWQuIERvbm90IGNvbnRpbnVlIHN5bmMuXG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5kb1N5bmMocmVhc29uLCBkaXNhYmxlQ2FjaGUsIHRva2VuKTtcblx0XHR9KTtcblx0XHR0aGlzLnN5bmNQcm9taXNlID0gc3luY1Byb21pc2U7XG5cdFx0dGhpcy5zeW5jUHJvbWlzZS5maW5hbGx5KCgpID0+IHRoaXMuc3luY1Byb21pc2UgPSB1bmRlZmluZWQpO1xuXHRcdHJldHVybiB0aGlzLnN5bmNQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNTeW5jU2VydmljZUNoYW5nZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubGFzdFN5bmNVcmwgIT09IHVuZGVmaW5lZCAmJiAhaXNFcXVhbCh0aGlzLmxhc3RTeW5jVXJsLCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UudXNlckRhdGFTeW5jU3RvcmU/LnVybCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhc0RlZmF1bHRTZXJ2aWNlQ2hhbmdlZCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBwcmV2aW91cyA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS5nZXRQcmV2aW91c1VzZXJEYXRhU3luY1N0b3JlKCk7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZTtcblx0XHQvLyBjaGVjayBpZiBkZWZhdWx0cyBjaGFuZ2VkXG5cdFx0cmV0dXJuICEhY3VycmVudCAmJiAhIXByZXZpb3VzICYmXG5cdFx0XHQoIWlzRXF1YWwoY3VycmVudC5kZWZhdWx0VXJsLCBwcmV2aW91cy5kZWZhdWx0VXJsKSB8fFxuXHRcdFx0XHQhaXNFcXVhbChjdXJyZW50Lmluc2lkZXJzVXJsLCBwcmV2aW91cy5pbnNpZGVyc1VybCkgfHxcblx0XHRcdFx0IWlzRXF1YWwoY3VycmVudC5zdGFibGVVcmwsIHByZXZpb3VzLnN0YWJsZVVybCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1N5bmMocmVhc29uOiBzdHJpbmcsIGRpc2FibGVDYWNoZTogYm9vbGVhbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtBdXRvU3luY10gVHJpZ2dlcmVkIGJ5ICR7cmVhc29ufWApO1xuXG5cdFx0dGhpcy5fb25EaWRTdGFydFN5bmMuZmlyZSgpO1xuXG5cdFx0bGV0IGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5jcmVhdGVBbmRSdW5TeW5jVGFzayhkaXNhYmxlQ2FjaGUsIHRva2VuKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHRlcnJvciA9IGU7XG5cdFx0XHRpZiAoVXNlckRhdGFTeW5jRXJyb3IudG9Vc2VyRGF0YVN5bmNFcnJvcihlKS5jb2RlID09PSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTWV0aG9kTm90Rm91bmQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW0F1dG9TeW5jXSBDbGllbnQgaXMgbWFraW5nIGludmFsaWQgcmVxdWVzdHMuIENsZWFuaW5nIHVwIGRhdGEuLi4nKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UuY2xlYW5VcFJlbW90ZURhdGEoKTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW0F1dG9TeW5jXSBSZXRyeWluZyBzeW5jLi4uJyk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jcmVhdGVBbmRSdW5TeW5jVGFzayhkaXNhYmxlQ2FjaGUsIHRva2VuKTtcblx0XHRcdFx0XHRlcnJvciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fSBjYXRjaCAoZTEpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZTEpO1xuXHRcdFx0XHRcdGVycm9yID0gZTE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZEZpbmlzaFN5bmMuZmlyZShlcnJvcik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZUFuZFJ1blN5bmNUYXNrKGRpc2FibGVDYWNoZTogYm9vbGVhbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zeW5jVGFzayA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5jcmVhdGVTeW5jVGFzayh0aGlzLm1hbmlmZXN0LCBkaXNhYmxlQ2FjaGUpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLm1hbmlmZXN0ID0gdGhpcy5zeW5jVGFzay5tYW5pZmVzdDtcblxuXHRcdC8vIFNlcnZlciBoYXMgbm8gZGF0YSBidXQgdGhpcyBtYWNoaW5lIHdhcyBzeW5jZWQgYmVmb3JlXG5cdFx0aWYgKHRoaXMubWFuaWZlc3QgPT09IG51bGwgJiYgYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLmhhc1ByZXZpb3VzbHlTeW5jZWQoKSkge1xuXHRcdFx0aWYgKHRoaXMuaGFzU3luY1NlcnZpY2VDaGFuZ2VkKCkpIHtcblx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuaGFzRGVmYXVsdFNlcnZpY2VDaGFuZ2VkKCkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFBdXRvU3luY0Vycm9yKGxvY2FsaXplKCdkZWZhdWx0IHNlcnZpY2UgY2hhbmdlZCcsIFwiQ2Fubm90IHN5bmMgYmVjYXVzZSBkZWZhdWx0IHNlcnZpY2UgaGFzIGNoYW5nZWRcIiksIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5EZWZhdWx0U2VydmljZUNoYW5nZWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IG5ldyBVc2VyRGF0YUF1dG9TeW5jRXJyb3IobG9jYWxpemUoJ3NlcnZpY2UgY2hhbmdlZCcsIFwiQ2Fubm90IHN5bmMgYmVjYXVzZSBzeW5jIHNlcnZpY2UgaGFzIGNoYW5nZWRcIiksIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5TZXJ2aWNlQ2hhbmdlZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFN5bmMgd2FzIHR1cm5lZCBvZmYgaW4gdGhlIGNsb3VkXG5cdFx0XHRcdHRocm93IG5ldyBVc2VyRGF0YUF1dG9TeW5jRXJyb3IobG9jYWxpemUoJ3R1cm5lZCBvZmYnLCBcIkNhbm5vdCBzeW5jIGJlY2F1c2Ugc3luY2luZyBpcyB0dXJuZWQgb2ZmIGluIHRoZSBjbG91ZFwiKSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlR1cm5lZE9mZik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoc2Vzc2lvbklkS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdC8vIFNlcnZlciBzZXNzaW9uIGlzIGRpZmZlcmVudCBmcm9tIGNsaWVudCBzZXNzaW9uXG5cdFx0aWYgKHNlc3Npb25JZCAmJiB0aGlzLm1hbmlmZXN0ICYmIHNlc3Npb25JZCAhPT0gdGhpcy5tYW5pZmVzdC5zZXNzaW9uKSB7XG5cdFx0XHRpZiAodGhpcy5oYXNTeW5jU2VydmljZUNoYW5nZWQoKSkge1xuXHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5oYXNEZWZhdWx0U2VydmljZUNoYW5nZWQoKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBVc2VyRGF0YUF1dG9TeW5jRXJyb3IobG9jYWxpemUoJ2RlZmF1bHQgc2VydmljZSBjaGFuZ2VkJywgXCJDYW5ub3Qgc3luYyBiZWNhdXNlIGRlZmF1bHQgc2VydmljZSBoYXMgY2hhbmdlZFwiKSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkRlZmF1bHRTZXJ2aWNlQ2hhbmdlZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhQXV0b1N5bmNFcnJvcihsb2NhbGl6ZSgnc2VydmljZSBjaGFuZ2VkJywgXCJDYW5ub3Qgc3luYyBiZWNhdXNlIHN5bmMgc2VydmljZSBoYXMgY2hhbmdlZFwiKSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlNlcnZpY2VDaGFuZ2VkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhQXV0b1N5bmNFcnJvcihsb2NhbGl6ZSgnc2Vzc2lvbiBleHBpcmVkJywgXCJDYW5ub3Qgc3luYyBiZWNhdXNlIGN1cnJlbnQgc2Vzc2lvbiBpcyBleHBpcmVkXCIpLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuU2Vzc2lvbkV4cGlyZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1hY2hpbmVzID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UuZ2V0TWFjaGluZXModGhpcy5tYW5pZmVzdCB8fCB1bmRlZmluZWQpO1xuXHRcdC8vIFJldHVybiBpZiBjYW5jZWxsYXRpb24gaXMgcmVxdWVzdGVkXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudE1hY2hpbmUgPSBtYWNoaW5lcy5maW5kKG1hY2hpbmUgPT4gbWFjaGluZS5pc0N1cnJlbnQpO1xuXHRcdC8vIENoZWNrIGlmIHN5bmMgd2FzIHR1cm5lZCBvZmYgZnJvbSBvdGhlciBtYWNoaW5lXG5cdFx0aWYgKGN1cnJlbnRNYWNoaW5lPy5kaXNhYmxlZCkge1xuXHRcdFx0Ly8gVGhyb3cgVHVybmVkT2ZmIGVycm9yXG5cdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFBdXRvU3luY0Vycm9yKGxvY2FsaXplKCd0dXJuZWQgb2ZmIG1hY2hpbmUnLCBcIkNhbm5vdCBzeW5jIGJlY2F1c2Ugc3luY2luZyBpcyB0dXJuZWQgb2ZmIG9uIHRoaXMgbWFjaGluZSBmcm9tIGFub3RoZXIgbWFjaGluZS5cIiksIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5UdXJuZWRPZmYpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0VGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXHRcdGF3YWl0IHRoaXMuc3luY1Rhc2sucnVuKCk7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8e1xuXHRcdFx0ZHVyYXRpb246IG51bWJlcjtcblx0XHR9LCB7XG5cdFx0XHRvd25lcjogJ3NhbmR5MDgxJztcblx0XHRcdGNvbW1lbnQ6ICdSZXBvcnQgd2hlbiBydW5uaW5nIGEgc3luYyBvcGVyYXRpb24nO1xuXHRcdFx0ZHVyYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaW1lIHRha2VuIHRvIHJ1biBzeW5jIG9wZXJhdGlvbicgfTtcblx0XHR9Pignc2V0dGluZ3NTeW5jOnN5bmMnLCB7IGR1cmF0aW9uOiBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHN0YXJ0VGltZSB9KTtcblxuXHRcdC8vIEFmdGVyIHN5bmNpbmcsIGdldCB0aGUgbWFuaWZlc3QgaWYgaXQgd2FzIG5vdCBhdmFpbGFibGUgYmVmb3JlXG5cdFx0aWYgKHRoaXMubWFuaWZlc3QgPT09IG51bGwpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMubWFuaWZlc3QgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5tYW5pZmVzdChudWxsKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRocm93IG5ldyBVc2VyRGF0YUF1dG9TeW5jRXJyb3IodG9FcnJvck1lc3NhZ2UoZXJyb3IpLCBlcnJvciBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY0Vycm9yID8gZXJyb3IuY29kZSA6IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Vbmtub3duKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgbG9jYWwgc2Vzc2lvbiBpZFxuXHRcdGlmICh0aGlzLm1hbmlmZXN0ICYmIHRoaXMubWFuaWZlc3Quc2Vzc2lvbiAhPT0gc2Vzc2lvbklkKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHNlc3Npb25JZEtleSwgdGhpcy5tYW5pZmVzdC5zZXNzaW9uLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIGlmIGNhbmNlbGxhdGlvbiBpcyByZXF1ZXN0ZWRcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBZGQgY3VycmVudCBtYWNoaW5lXG5cdFx0aWYgKCFjdXJyZW50TWFjaGluZSkge1xuXHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UuYWRkQ3VycmVudE1hY2hpbmUodGhpcy5tYW5pZmVzdCB8fCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHJlZ2lzdGVyPFQgZXh0ZW5kcyBJRGlzcG9zYWJsZT4odDogVCk6IFQge1xuXHRcdHJldHVybiBzdXBlci5fcmVnaXN0ZXIodCk7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUE0Qix5QkFBeUIsbUJBQW1CLGtCQUFrQixlQUFlO0FBRXpHLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBeUIsbUJBQW1CLG9CQUFvQjtBQUN6RSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUF5RSx5QkFBeUIsZ0NBQWdDLHNCQUFzQixxQ0FBcUMsMkJBQTJCLHVCQUF1QixtQkFBbUIsNkJBQTBDO0FBQzVTLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsb0NBQW9DO0FBRTdDLE1BQU0sOEJBQThCO0FBQ3BDLE1BQU0sZUFBZTtBQUNyQixNQUFNLGNBQWM7QUFDcEIsTUFBTSxvQkFBb0I7QUFFbkIsSUFBTSwwQkFBTixjQUFzQyxXQUErQztBQUFBLEVBc0MzRixZQUNrQixnQkFDcUMsb0NBQ1YsMEJBQ0ssK0JBQ1YscUJBQ0csWUFDSSw0QkFDVixrQkFDVyw2QkFDYixnQkFDVSwwQkFDM0M7QUFDRCxVQUFNO0FBWGdEO0FBQ1Y7QUFDSztBQUNWO0FBQ0c7QUFDSTtBQUNWO0FBQ1c7QUFDYjtBQUNVO0FBN0M3QyxTQUFpQixXQUFXLEtBQUssVUFBVSxJQUFJLGtCQUE0QixDQUFDO0FBQzVFLFNB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
