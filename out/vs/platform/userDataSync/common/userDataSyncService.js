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
import { equals } from "../../../base/common/arrays.js";
import { createCancelablePromise, RunOnceScheduler } from "../../../base/common/async.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { isEqual } from "../../../base/common/resources.js";
import { isBoolean, isUndefined } from "../../../base/common/types.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IExtensionGalleryService } from "../../extensionManagement/common/extensionManagement.js";
import { IFileService } from "../../files/common/files.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { ExtensionsSynchroniser } from "./extensionsSync.js";
import { GlobalStateSynchroniser } from "./globalStateSync.js";
import { KeybindingsSynchroniser } from "./keybindingsSync.js";
import { PromptsSynchronizer } from "./promptsSync/promptsSync.js";
import { SettingsSynchroniser } from "./settingsSync.js";
import { SnippetsSynchroniser } from "./snippetsSync.js";
import { TasksSynchroniser } from "./tasksSync.js";
import { McpSynchroniser } from "./mcpSync.js";
import { UserDataProfilesManifestSynchroniser } from "./userDataProfilesManifestSync.js";
import {
  ALL_SYNC_RESOURCES,
  createSyncHeaders,
  IUserDataSyncEnablementService,
  IUserDataSyncLogService,
  IUserDataSyncStoreManagementService,
  IUserDataSyncStoreService,
  SyncResource,
  SyncStatus,
  UserDataSyncError,
  UserDataSyncErrorCode,
  UserDataSyncStoreError,
  USER_DATA_SYNC_CONFIGURATION_SCOPE,
  IUserDataSyncResourceProviderService,
  IUserDataSyncLocalStoreService,
  isUserDataManifest
} from "./userDataSync.js";
const LAST_SYNC_TIME_KEY = "sync.lastSyncTime";
let UserDataSyncService = class extends Disposable {
  constructor(fileService, userDataSyncStoreService, userDataSyncStoreManagementService, instantiationService, logService, telemetryService, storageService, userDataSyncEnablementService, userDataProfilesService, userDataSyncResourceProviderService, userDataSyncLocalStoreService) {
    super();
    this.fileService = fileService;
    this.userDataSyncStoreService = userDataSyncStoreService;
    this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
    this.instantiationService = instantiationService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this.storageService = storageService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.userDataProfilesService = userDataProfilesService;
    this.userDataSyncResourceProviderService = userDataSyncResourceProviderService;
    this.userDataSyncLocalStoreService = userDataSyncLocalStoreService;
    this._status = SyncStatus.Uninitialized;
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
    this._onDidChangeLocal = this._register(new Emitter());
    this.onDidChangeLocal = this._onDidChangeLocal.event;
    this._conflicts = [];
    this._onDidChangeConflicts = this._register(new Emitter());
    this.onDidChangeConflicts = this._onDidChangeConflicts.event;
    this._syncErrors = [];
    this._onSyncErrors = this._register(new Emitter());
    this.onSyncErrors = this._onSyncErrors.event;
    this._lastSyncTime = void 0;
    this._onDidChangeLastSyncTime = this._register(new Emitter());
    this.onDidChangeLastSyncTime = this._onDidChangeLastSyncTime.event;
    this._onDidResetLocal = this._register(new Emitter());
    this.onDidResetLocal = this._onDidResetLocal.event;
    this._onDidResetRemote = this._register(new Emitter());
    this.onDidResetRemote = this._onDidResetRemote.event;
    this.activeProfileSynchronizers = /* @__PURE__ */ new Map();
    this._status = userDataSyncStoreManagementService.userDataSyncStore ? SyncStatus.Idle : SyncStatus.Uninitialized;
    this._lastSyncTime = this.storageService.getNumber(LAST_SYNC_TIME_KEY, StorageScope.APPLICATION, void 0);
    this._register(toDisposable(() => this.clearActiveProfileSynchronizers()));
    this._register(new RunOnceScheduler(
      () => this.cleanUpStaleStorageData(),
      5 * 1e3
      /* after 5s */
    )).schedule();
  }
  get status() {
    return this._status;
  }
  get conflicts() {
    return this._conflicts;
  }
  get lastSyncTime() {
    return this._lastSyncTime;
  }
  async createSyncTask(manifest, disableCache) {
    this.checkEnablement();
    this.logService.info("Sync started.");
    const startTime = (/* @__PURE__ */ new Date()).getTime();
    const executionId = generateUuid();
    try {
      const syncHeaders = createSyncHeaders(executionId);
      if (disableCache) {
        syncHeaders["Cache-Control"] = "no-cache";
      }
      manifest = await this.userDataSyncStoreService.manifest(manifest, syncHeaders);
    } catch (error) {
      const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
      reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
      throw userDataSyncError;
    }
    const executed = false;
    const that = this;
    let cancellablePromise;
    return {
      manifest,
      async run() {
        if (executed) {
          throw new Error("Can run a task only once");
        }
        cancellablePromise = createCancelablePromise((token) => that.sync(manifest, false, executionId, token));
        await cancellablePromise.finally(() => cancellablePromise = void 0);
        that.logService.info(`Sync done. Took ${(/* @__PURE__ */ new Date()).getTime() - startTime}ms`);
        that.updateLastSyncTime();
      },
      stop() {
        cancellablePromise?.cancel();
        return that.stop();
      }
    };
  }
  async createManualSyncTask() {
    this.checkEnablement();
    if (this.userDataSyncEnablementService.isEnabled()) {
      throw new UserDataSyncError("Cannot start manual sync when sync is enabled", UserDataSyncErrorCode.LocalError);
    }
    this.logService.info("Sync started.");
    const startTime = (/* @__PURE__ */ new Date()).getTime();
    const executionId = generateUuid();
    const syncHeaders = createSyncHeaders(executionId);
    let latestUserDataOrManifest;
    try {
      latestUserDataOrManifest = await this.userDataSyncStoreService.getLatestData(syncHeaders);
    } catch (error) {
      const userDataSyncError = UserDataSyncError.toUserDataSyncError(error);
      this.telemetryService.publicLog2(
        "sync.download.latest",
        {
          code: userDataSyncError.code,
          serverCode: userDataSyncError instanceof UserDataSyncStoreError ? String(userDataSyncError.serverCode) : void 0,
          url: userDataSyncError instanceof UserDataSyncStoreError ? userDataSyncError.url : void 0,
          resource: userDataSyncError.resource,
          executionId,
          service: this.userDataSyncStoreManagementService.userDataSyncStore.url.toString()
        }
      );
      try {
        latestUserDataOrManifest = await this.userDataSyncStoreService.manifest(null, syncHeaders);
      } catch (error2) {
        const userDataSyncError2 = UserDataSyncError.toUserDataSyncError(error2);
        reportUserDataSyncError(userDataSyncError2, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
        throw userDataSyncError2;
      }
    }
    await this.resetLocal();
    const that = this;
    const cancellableToken = new CancellationTokenSource();
    return {
      id: executionId,
      async merge() {
        return that.sync(latestUserDataOrManifest, true, executionId, cancellableToken.token);
      },
      async apply() {
        try {
          try {
            await that.applyManualSync(latestUserDataOrManifest, executionId, cancellableToken.token);
          } catch (error) {
            if (UserDataSyncError.toUserDataSyncError(error).code === UserDataSyncErrorCode.MethodNotFound) {
              that.logService.info("Client is making invalid requests. Cleaning up data...");
              await that.cleanUpRemoteData();
              that.logService.info("Applying manual sync again...");
              await that.applyManualSync(latestUserDataOrManifest, executionId, cancellableToken.token);
            } else {
              throw error;
            }
          }
        } catch (error) {
          that.logService.error(error);
          throw error;
        }
        that.logService.info(`Sync done. Took ${(/* @__PURE__ */ new Date()).getTime() - startTime}ms`);
        that.updateLastSyncTime();
      },
      async stop() {
        cancellableToken.cancel();
        await that.stop();
        await that.resetLocal();
      }
    };
  }
  async sync(manifestOrLatestData, preview, executionId, token) {
    this._syncErrors = [];
    try {
      if (this.status !== SyncStatus.HasConflicts) {
        this.setStatus(SyncStatus.Syncing);
      }
      const defaultProfileSynchronizer = this.getOrCreateActiveProfileSynchronizer(this.userDataProfilesService.defaultProfile, void 0);
      this._syncErrors.push(...await this.syncProfile(defaultProfileSynchronizer, manifestOrLatestData, preview, executionId, token));
      const userDataProfileManifestSynchronizer = defaultProfileSynchronizer.enabled.find((s) => s.resource === SyncResource.Profiles);
      if (userDataProfileManifestSynchronizer) {
        const syncProfiles = await userDataProfileManifestSynchronizer.getLastSyncedProfiles() || [];
        if (token.isCancellationRequested) {
          return;
        }
        await this.syncRemoteProfiles(syncProfiles, manifestOrLatestData, preview, executionId, token);
      }
    } finally {
      if (this.status !== SyncStatus.HasConflicts) {
        this.setStatus(SyncStatus.Idle);
      }
      this._onSyncErrors.fire(this._syncErrors);
    }
  }
  async syncRemoteProfiles(remoteProfiles, manifest, preview, executionId, token) {
    for (const syncProfile of remoteProfiles) {
      if (token.isCancellationRequested) {
        return;
      }
      const profile = this.userDataProfilesService.profiles.find((p) => p.id === syncProfile.id);
      if (!profile) {
        this.logService.error(`Profile with id:${syncProfile.id} and name: ${syncProfile.name} does not exist locally to sync.`);
        continue;
      }
      this.logService.info("Syncing profile.", syncProfile.name);
      const profileSynchronizer = this.getOrCreateActiveProfileSynchronizer(profile, syncProfile);
      this._syncErrors.push(...await this.syncProfile(profileSynchronizer, manifest, preview, executionId, token));
    }
    for (const [key, profileSynchronizerItem] of this.activeProfileSynchronizers.entries()) {
      if (this.userDataProfilesService.profiles.some((p) => p.id === profileSynchronizerItem[0].profile.id)) {
        continue;
      }
      await profileSynchronizerItem[0].resetLocal();
      profileSynchronizerItem[1].dispose();
      this.activeProfileSynchronizers.delete(key);
    }
  }
  async applyManualSync(manifestOrLatestData, executionId, token) {
    try {
      this.setStatus(SyncStatus.Syncing);
      const profileSynchronizers = this.getActiveProfileSynchronizers();
      for (const profileSynchronizer of profileSynchronizers) {
        if (token.isCancellationRequested) {
          return;
        }
        await profileSynchronizer.apply(executionId, token);
      }
      const defaultProfileSynchronizer = profileSynchronizers.find((s) => s.profile.isDefault);
      if (!defaultProfileSynchronizer) {
        return;
      }
      const userDataProfileManifestSynchronizer = defaultProfileSynchronizer.enabled.find((s) => s.resource === SyncResource.Profiles);
      if (!userDataProfileManifestSynchronizer) {
        return;
      }
      const remoteProfiles = await userDataProfileManifestSynchronizer.getRemoteSyncedProfiles(getRefOrUserData(manifestOrLatestData, void 0, SyncResource.Profiles) ?? null) || [];
      const remoteProfilesToSync = remoteProfiles.filter((remoteProfile) => profileSynchronizers.every((s) => s.profile.id !== remoteProfile.id));
      if (remoteProfilesToSync.length) {
        await this.syncRemoteProfiles(remoteProfilesToSync, manifestOrLatestData, false, executionId, token);
      }
    } finally {
      this.setStatus(SyncStatus.Idle);
    }
  }
  async syncProfile(profileSynchronizer, manifestOrLatestData, preview, executionId, token) {
    const errors = await profileSynchronizer.sync(manifestOrLatestData, preview, executionId, token);
    return errors.map(([syncResource, error]) => ({ profile: profileSynchronizer.profile, syncResource, error }));
  }
  async stop() {
    if (this.status !== SyncStatus.Idle) {
      await Promise.allSettled(this.getActiveProfileSynchronizers().map((profileSynchronizer) => profileSynchronizer.stop()));
    }
  }
  async resolveContent(resource) {
    const content = await this.userDataSyncResourceProviderService.resolveContent(resource);
    if (content) {
      return content;
    }
    for (const profileSynchronizer of this.getActiveProfileSynchronizers()) {
      for (const synchronizer of profileSynchronizer.enabled) {
        const content2 = await synchronizer.resolveContent(resource);
        if (content2) {
          return content2;
        }
      }
    }
    return null;
  }
  async replace(syncResourceHandle) {
    this.checkEnablement();
    const profileSyncResource = this.userDataSyncResourceProviderService.resolveUserDataSyncResource(syncResourceHandle);
    if (!profileSyncResource) {
      return;
    }
    const content = await this.resolveContent(syncResourceHandle.uri);
    if (!content) {
      return;
    }
    await this.performAction(profileSyncResource.profile, async (synchronizer) => {
      if (profileSyncResource.syncResource === synchronizer.resource) {
        await synchronizer.replace(content);
        return true;
      }
      return void 0;
    });
    return;
  }
  async accept(syncResource, resource, content, apply) {
    this.checkEnablement();
    await this.performAction(syncResource.profile, async (synchronizer) => {
      if (syncResource.syncResource === synchronizer.resource) {
        await synchronizer.accept(resource, content);
        if (apply) {
          await synchronizer.apply(isBoolean(apply) ? false : apply.force, createSyncHeaders(generateUuid()));
        }
        return true;
      }
      return void 0;
    });
  }
  async hasLocalData() {
    const result = await this.performAction(this.userDataProfilesService.defaultProfile, async (synchronizer) => {
      if (synchronizer.resource !== SyncResource.GlobalState && await synchronizer.hasLocalData()) {
        return true;
      }
      return void 0;
    });
    return !!result;
  }
  async hasPreviouslySynced() {
    const result = await this.performAction(this.userDataProfilesService.defaultProfile, async (synchronizer) => {
      if (await synchronizer.hasPreviouslySynced()) {
        return true;
      }
      return void 0;
    });
    return !!result;
  }
  async reset() {
    this.checkEnablement();
    await this.resetRemote();
    await this.resetLocal();
  }
  async resetRemote() {
    this.checkEnablement();
    try {
      await this.userDataSyncStoreService.clear();
      this.logService.info("Cleared data on server");
    } catch (e) {
      this.logService.error(e);
    }
    this._onDidResetRemote.fire();
  }
  async resetLocal() {
    this.checkEnablement();
    this._lastSyncTime = void 0;
    this.storageService.remove(LAST_SYNC_TIME_KEY, StorageScope.APPLICATION);
    for (const [synchronizer] of this.activeProfileSynchronizers.values()) {
      try {
        await synchronizer.resetLocal();
      } catch (e) {
        this.logService.error(e);
      }
    }
    this.clearActiveProfileSynchronizers();
    this._onDidResetLocal.fire();
    this.logService.info("Did reset the local sync state.");
  }
  async cleanUpStaleStorageData() {
    const allKeys = this.storageService.keys(StorageScope.APPLICATION, StorageTarget.MACHINE);
    const lastSyncProfileKeys = [];
    for (const key of allKeys) {
      if (!key.endsWith(".lastSyncUserData")) {
        continue;
      }
      const segments = key.split(".");
      if (segments.length === 3) {
        lastSyncProfileKeys.push([key, segments[0]]);
      }
    }
    if (!lastSyncProfileKeys.length) {
      return;
    }
    const disposables = new DisposableStore();
    try {
      let defaultProfileSynchronizer = this.activeProfileSynchronizers.get(this.userDataProfilesService.defaultProfile.id)?.[0];
      if (!defaultProfileSynchronizer) {
        defaultProfileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, this.userDataProfilesService.defaultProfile, void 0));
      }
      const userDataProfileManifestSynchronizer = defaultProfileSynchronizer.enabled.find((s) => s.resource === SyncResource.Profiles);
      if (!userDataProfileManifestSynchronizer) {
        return;
      }
      const lastSyncedProfiles = await userDataProfileManifestSynchronizer.getLastSyncedProfiles();
      const lastSyncedCollections = lastSyncedProfiles?.map((p) => p.collection) ?? [];
      for (const [key, collection] of lastSyncProfileKeys) {
        if (!lastSyncedCollections.includes(collection)) {
          this.logService.info(`Removing last sync state for stale profile: ${collection}`);
          this.storageService.remove(key, StorageScope.APPLICATION);
        }
      }
    } finally {
      disposables.dispose();
    }
  }
  async cleanUpRemoteData() {
    const remoteProfiles = await this.userDataSyncResourceProviderService.getRemoteSyncedProfiles();
    const remoteProfileCollections = remoteProfiles.map((profile) => profile.collection);
    const allCollections = await this.userDataSyncStoreService.getAllCollections();
    const redundantCollections = allCollections.filter((c) => !remoteProfileCollections.includes(c));
    if (redundantCollections.length) {
      this.logService.info(`Deleting ${redundantCollections.length} redundant collections on server`);
      await Promise.allSettled(redundantCollections.map((collectionId) => this.userDataSyncStoreService.deleteCollection(collectionId)));
      this.logService.info(`Deleted redundant collections on server`);
    }
    const updatedRemoteProfiles = remoteProfiles.filter((profile) => allCollections.includes(profile.collection));
    if (updatedRemoteProfiles.length !== remoteProfiles.length) {
      const profileManifestSynchronizer = this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, this.userDataProfilesService.defaultProfile, void 0);
      try {
        this.logService.info("Resetting the last synced state of profiles");
        await profileManifestSynchronizer.resetLocal();
        this.logService.info("Did reset the last synced state of profiles");
        this.logService.info(`Updating remote profiles with invalid collections on server`);
        await profileManifestSynchronizer.updateRemoteProfiles(updatedRemoteProfiles, null);
        this.logService.info(`Updated remote profiles on server`);
      } finally {
        profileManifestSynchronizer.dispose();
      }
    }
  }
  async saveRemoteActivityData(location) {
    this.checkEnablement();
    const data = await this.userDataSyncStoreService.getActivityData();
    await this.fileService.writeFile(location, data);
  }
  async extractActivityData(activityDataResource, location) {
    const content = (await this.fileService.readFile(activityDataResource)).value.toString();
    const activityData = JSON.parse(content);
    if (activityData.resources) {
      for (const resource in activityData.resources) {
        for (const version of activityData.resources[resource]) {
          await this.userDataSyncLocalStoreService.writeResource(resource, version.content, new Date(version.created * 1e3), void 0, location);
        }
      }
    }
    if (activityData.collections) {
      for (const collection in activityData.collections) {
        for (const resource in activityData.collections[collection].resources) {
          for (const version of activityData.collections[collection].resources?.[resource] ?? []) {
            await this.userDataSyncLocalStoreService.writeResource(resource, version.content, new Date(version.created * 1e3), collection, location);
          }
        }
      }
    }
  }
  async performAction(profile, action) {
    const disposables = new DisposableStore();
    try {
      const activeProfileSyncronizer = this.activeProfileSynchronizers.get(profile.id);
      if (activeProfileSyncronizer) {
        const result = await this.performActionWithProfileSynchronizer(activeProfileSyncronizer[0], action, disposables);
        return isUndefined(result) ? null : result;
      }
      if (profile.isDefault) {
        const defaultProfileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, profile, void 0));
        const result = await this.performActionWithProfileSynchronizer(defaultProfileSynchronizer, action, disposables);
        return isUndefined(result) ? null : result;
      }
      const userDataProfileManifestSynchronizer = disposables.add(this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, profile, void 0));
      const manifest = await this.userDataSyncStoreService.manifest(null);
      const syncProfiles = await userDataProfileManifestSynchronizer.getRemoteSyncedProfiles(manifest?.latest?.profiles ?? null) || [];
      const syncProfile = syncProfiles.find((syncProfile2) => syncProfile2.id === profile.id);
      if (syncProfile) {
        const profileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, profile, syncProfile.collection));
        const result = await this.performActionWithProfileSynchronizer(profileSynchronizer, action, disposables);
        return isUndefined(result) ? null : result;
      }
      return null;
    } finally {
      disposables.dispose();
    }
  }
  async performActionWithProfileSynchronizer(profileSynchronizer, action, disposables) {
    const allSynchronizers = [...profileSynchronizer.enabled, ...profileSynchronizer.disabled.reduce((synchronizers, syncResource) => {
      if (syncResource !== SyncResource.WorkspaceState) {
        synchronizers.push(disposables.add(profileSynchronizer.createSynchronizer(syncResource)));
      }
      return synchronizers;
    }, [])];
    for (const synchronizer of allSynchronizers) {
      const result = await action(synchronizer);
      if (!isUndefined(result)) {
        return result;
      }
    }
    return void 0;
  }
  setStatus(status) {
    const oldStatus = this._status;
    if (this._status !== status) {
      this._status = status;
      this._onDidChangeStatus.fire(status);
      if (oldStatus === SyncStatus.HasConflicts) {
        this.updateLastSyncTime();
      }
    }
  }
  updateConflicts() {
    const conflicts = this.getActiveProfileSynchronizers().map((synchronizer) => synchronizer.conflicts).flat();
    if (!equals(this._conflicts, conflicts, (a, b) => a.profile.id === b.profile.id && a.syncResource === b.syncResource && equals(a.conflicts, b.conflicts, (a2, b2) => isEqual(a2.previewResource, b2.previewResource)))) {
      this._conflicts = conflicts;
      this._onDidChangeConflicts.fire(conflicts);
    }
  }
  updateLastSyncTime() {
    if (this.status === SyncStatus.Idle) {
      this._lastSyncTime = (/* @__PURE__ */ new Date()).getTime();
      this.storageService.store(LAST_SYNC_TIME_KEY, this._lastSyncTime, StorageScope.APPLICATION, StorageTarget.MACHINE);
      this._onDidChangeLastSyncTime.fire(this._lastSyncTime);
    }
  }
  getOrCreateActiveProfileSynchronizer(profile, syncProfile) {
    let activeProfileSynchronizer = this.activeProfileSynchronizers.get(profile.id);
    if (activeProfileSynchronizer && activeProfileSynchronizer[0].collection !== syncProfile?.collection) {
      this.logService.error("Profile synchronizer collection does not match with the remote sync profile collection");
      activeProfileSynchronizer[1].dispose();
      activeProfileSynchronizer = void 0;
      this.activeProfileSynchronizers.delete(profile.id);
    }
    if (!activeProfileSynchronizer) {
      const disposables = new DisposableStore();
      const profileSynchronizer = disposables.add(this.instantiationService.createInstance(ProfileSynchronizer, profile, syncProfile?.collection));
      disposables.add(profileSynchronizer.onDidChangeStatus((e) => this.setStatus(e)));
      disposables.add(profileSynchronizer.onDidChangeConflicts((conflicts) => this.updateConflicts()));
      disposables.add(profileSynchronizer.onDidChangeLocal((e) => this._onDidChangeLocal.fire(e)));
      this.activeProfileSynchronizers.set(profile.id, activeProfileSynchronizer = [profileSynchronizer, disposables]);
    }
    return activeProfileSynchronizer[0];
  }
  getActiveProfileSynchronizers() {
    const profileSynchronizers = [];
    for (const [profileSynchronizer] of this.activeProfileSynchronizers.values()) {
      profileSynchronizers.push(profileSynchronizer);
    }
    return profileSynchronizers;
  }
  clearActiveProfileSynchronizers() {
    this.activeProfileSynchronizers.forEach(([, disposable]) => disposable.dispose());
    this.activeProfileSynchronizers.clear();
  }
  checkEnablement() {
    if (!this.userDataSyncStoreManagementService.userDataSyncStore) {
      throw new Error("Not enabled");
    }
  }
};
UserDataSyncService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUserDataSyncStoreService),
  __decorateParam(2, IUserDataSyncStoreManagementService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IUserDataSyncLogService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IUserDataSyncEnablementService),
  __decorateParam(8, IUserDataProfilesService),
  __decorateParam(9, IUserDataSyncResourceProviderService),
  __decorateParam(10, IUserDataSyncLocalStoreService)
], UserDataSyncService);
let ProfileSynchronizer = class extends Disposable {
  constructor(profile, collection, userDataSyncEnablementService, instantiationService, extensionGalleryService, userDataSyncStoreManagementService, telemetryService, logService, configurationService) {
    super();
    this.profile = profile;
    this.collection = collection;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.instantiationService = instantiationService;
    this.extensionGalleryService = extensionGalleryService;
    this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.configurationService = configurationService;
    this._enabled = [];
    this._status = SyncStatus.Idle;
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
    this._onDidChangeLocal = this._register(new Emitter());
    this.onDidChangeLocal = this._onDidChangeLocal.event;
    this._conflicts = [];
    this._onDidChangeConflicts = this._register(new Emitter());
    this.onDidChangeConflicts = this._onDidChangeConflicts.event;
    this._register(userDataSyncEnablementService.onDidChangeResourceEnablement(([syncResource, enablement]) => this.onDidChangeResourceEnablement(syncResource, enablement)));
    this._register(toDisposable(() => this._enabled.splice(0, this._enabled.length).forEach(([, , disposable]) => disposable.dispose())));
    for (const syncResource of ALL_SYNC_RESOURCES) {
      if (userDataSyncEnablementService.isResourceEnabled(syncResource)) {
        this.registerSynchronizer(syncResource);
      }
    }
  }
  get enabled() {
    return this._enabled.sort((a, b) => a[1] - b[1]).map(([synchronizer]) => synchronizer);
  }
  get disabled() {
    return ALL_SYNC_RESOURCES.filter((syncResource) => !this.userDataSyncEnablementService.isResourceEnabled(syncResource));
  }
  get status() {
    return this._status;
  }
  get conflicts() {
    return this._conflicts;
  }
  onDidChangeResourceEnablement(syncResource, enabled) {
    if (enabled) {
      this.registerSynchronizer(syncResource);
    } else {
      this.deRegisterSynchronizer(syncResource);
    }
  }
  registerSynchronizer(syncResource) {
    if (this._enabled.some(([synchronizer2]) => synchronizer2.resource === syncResource)) {
      return;
    }
    if (syncResource === SyncResource.Extensions && !this.extensionGalleryService.isEnabled()) {
      this.logService.info("Skipping extensions sync because gallery is not configured");
      return;
    }
    if (syncResource === SyncResource.Profiles) {
      if (!this.profile.isDefault) {
        return;
      }
    }
    if (syncResource === SyncResource.WorkspaceState) {
      return;
    }
    if (syncResource !== SyncResource.Profiles && this.profile.useDefaultFlags?.[syncResource]) {
      this.logService.debug(`Skipping syncing ${syncResource} in ${this.profile.name} because it is already synced by default profile`);
      return;
    }
    const disposables = new DisposableStore();
    const synchronizer = disposables.add(this.createSynchronizer(syncResource));
    disposables.add(synchronizer.onDidChangeStatus(() => this.updateStatus()));
    disposables.add(synchronizer.onDidChangeConflicts(() => this.updateConflicts()));
    disposables.add(synchronizer.onDidChangeLocal(() => this._onDidChangeLocal.fire(syncResource)));
    const order = this.getOrder(syncResource);
    this._enabled.push([synchronizer, order, disposables]);
  }
  deRegisterSynchronizer(syncResource) {
    const index = this._enabled.findIndex(([synchronizer]) => synchronizer.resource === syncResource);
    if (index !== -1) {
      const [[synchronizer, , disposable]] = this._enabled.splice(index, 1);
      disposable.dispose();
      this.updateStatus();
      synchronizer.stop().then(null, (error) => this.logService.error(error));
    }
  }
  createSynchronizer(syncResource) {
    switch (syncResource) {
      case SyncResource.Settings:
        return this.instantiationService.createInstance(SettingsSynchroniser, this.profile, this.collection);
      case SyncResource.Keybindings:
        return this.instantiationService.createInstance(KeybindingsSynchroniser, this.profile, this.collection);
      case SyncResource.Snippets:
        return this.instantiationService.createInstance(SnippetsSynchroniser, this.profile, this.collection);
      case SyncResource.Prompts:
        return this.instantiationService.createInstance(PromptsSynchronizer, this.profile, this.collection);
      case SyncResource.Tasks:
        return this.instantiationService.createInstance(TasksSynchroniser, this.profile, this.collection);
      case SyncResource.Mcp:
        return this.instantiationService.createInstance(McpSynchroniser, this.profile, this.collection);
      case SyncResource.GlobalState:
        return this.instantiationService.createInstance(GlobalStateSynchroniser, this.profile, this.collection);
      case SyncResource.Extensions:
        return this.instantiationService.createInstance(ExtensionsSynchroniser, this.profile, this.collection);
      case SyncResource.Profiles:
        return this.instantiationService.createInstance(UserDataProfilesManifestSynchroniser, this.profile, this.collection);
    }
  }
  async sync(manifestOrLatestData, preview, executionId, token) {
    if (token.isCancellationRequested) {
      return [];
    }
    const synchronizers = this.enabled;
    if (!synchronizers.length) {
      return [];
    }
    try {
      const syncErrors = [];
      const syncHeaders = createSyncHeaders(executionId);
      const userDataSyncConfiguration = preview ? await this.getUserDataSyncConfiguration(manifestOrLatestData) : this.getLocalUserDataSyncConfiguration();
      for (const synchroniser of synchronizers) {
        if (token.isCancellationRequested) {
          return [];
        }
        if (!this.userDataSyncEnablementService.isResourceEnabled(synchroniser.resource)) {
          return [];
        }
        try {
          const refOrUserData = getRefOrUserData(manifestOrLatestData, this.collection, synchroniser.resource) ?? null;
          await synchroniser.sync(refOrUserData, preview, userDataSyncConfiguration, syncHeaders);
        } catch (e) {
          const userDataSyncError = UserDataSyncError.toUserDataSyncError(e);
          reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
          if (canBailout(e)) {
            throw userDataSyncError;
          }
          this.logService.error(e);
          this.logService.error(`${synchroniser.resource}: ${toErrorMessage(e)}`);
          syncErrors.push([synchroniser.resource, userDataSyncError]);
        }
      }
      return syncErrors;
    } finally {
      this.updateStatus();
    }
  }
  async apply(executionId, token) {
    const syncHeaders = createSyncHeaders(executionId);
    for (const synchroniser of this.enabled) {
      if (token.isCancellationRequested) {
        return;
      }
      try {
        await synchroniser.apply(false, syncHeaders);
      } catch (e) {
        const userDataSyncError = UserDataSyncError.toUserDataSyncError(e);
        reportUserDataSyncError(userDataSyncError, executionId, this.userDataSyncStoreManagementService, this.telemetryService);
        if (canBailout(e)) {
          throw userDataSyncError;
        }
        this.logService.error(e);
        this.logService.error(`${synchroniser.resource}: ${toErrorMessage(e)}`);
      }
    }
  }
  async stop() {
    for (const synchroniser of this.enabled) {
      try {
        if (synchroniser.status !== SyncStatus.Idle) {
          await synchroniser.stop();
        }
      } catch (e) {
        this.logService.error(e);
      }
    }
  }
  async resetLocal() {
    for (const synchroniser of this.enabled) {
      try {
        await synchroniser.resetLocal();
      } catch (e) {
        this.logService.error(`${synchroniser.resource}: ${toErrorMessage(e)}`);
        this.logService.error(e);
      }
    }
  }
  async getUserDataSyncConfiguration(manifestOrLatestData) {
    if (!this.profile.isDefault) {
      return {};
    }
    const local = this.getLocalUserDataSyncConfiguration();
    const settingsSynchronizer = this.enabled.find((synchronizer) => synchronizer instanceof SettingsSynchroniser);
    if (settingsSynchronizer) {
      const remote = await settingsSynchronizer.getRemoteUserDataSyncConfiguration(getRefOrUserData(manifestOrLatestData, this.collection, SyncResource.Settings) ?? null);
      return { ...local, ...remote };
    }
    return local;
  }
  getLocalUserDataSyncConfiguration() {
    return this.configurationService.getValue(USER_DATA_SYNC_CONFIGURATION_SCOPE);
  }
  setStatus(status) {
    if (this._status !== status) {
      this._status = status;
      this._onDidChangeStatus.fire(status);
    }
  }
  updateStatus() {
    this.updateConflicts();
    if (this.enabled.some((s) => s.status === SyncStatus.HasConflicts)) {
      return this.setStatus(SyncStatus.HasConflicts);
    }
    if (this.enabled.some((s) => s.status === SyncStatus.Syncing)) {
      return this.setStatus(SyncStatus.Syncing);
    }
    return this.setStatus(SyncStatus.Idle);
  }
  updateConflicts() {
    const conflicts = this.enabled.filter((s) => s.status === SyncStatus.HasConflicts).filter((s) => s.conflicts.conflicts.length > 0).map((s) => s.conflicts);
    if (!equals(this._conflicts, conflicts, (a, b) => a.syncResource === b.syncResource && equals(a.conflicts, b.conflicts, (a2, b2) => isEqual(a2.previewResource, b2.previewResource)))) {
      this._conflicts = conflicts;
      this._onDidChangeConflicts.fire(conflicts);
    }
  }
  getOrder(syncResource) {
    switch (syncResource) {
      case SyncResource.Settings:
        return 0;
      case SyncResource.Keybindings:
        return 1;
      case SyncResource.Snippets:
        return 2;
      case SyncResource.Tasks:
        return 3;
      case SyncResource.Mcp:
        return 4;
      case SyncResource.GlobalState:
        return 5;
      case SyncResource.Extensions:
        return 6;
      case SyncResource.Prompts:
        return 7;
      case SyncResource.Profiles:
        return 8;
      case SyncResource.WorkspaceState:
        return 9;
    }
  }
};
ProfileSynchronizer = __decorateClass([
  __decorateParam(2, IUserDataSyncEnablementService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IExtensionGalleryService),
  __decorateParam(5, IUserDataSyncStoreManagementService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IUserDataSyncLogService),
  __decorateParam(8, IConfigurationService)
], ProfileSynchronizer);
function canBailout(e) {
  if (e instanceof UserDataSyncError) {
    switch (e.code) {
      case UserDataSyncErrorCode.MethodNotFound:
      case UserDataSyncErrorCode.TooLarge:
      case UserDataSyncErrorCode.TooManyRequests:
      case UserDataSyncErrorCode.TooManyRequestsAndRetryAfter:
      case UserDataSyncErrorCode.LocalTooManyRequests:
      case UserDataSyncErrorCode.LocalTooManyProfiles:
      case UserDataSyncErrorCode.Gone:
      case UserDataSyncErrorCode.UpgradeRequired:
      case UserDataSyncErrorCode.IncompatibleRemoteContent:
      case UserDataSyncErrorCode.IncompatibleLocalContent:
        return true;
    }
  }
  return false;
}
function reportUserDataSyncError(userDataSyncError, executionId, userDataSyncStoreManagementService, telemetryService) {
  telemetryService.publicLog2(
    "sync/error",
    {
      code: userDataSyncError.code,
      serverCode: userDataSyncError instanceof UserDataSyncStoreError ? String(userDataSyncError.serverCode) : void 0,
      url: userDataSyncError instanceof UserDataSyncStoreError ? userDataSyncError.url : void 0,
      resource: userDataSyncError.resource,
      executionId,
      service: userDataSyncStoreManagementService.userDataSyncStore.url.toString()
    }
  );
}
function getRefOrUserData(manifestOrLatestData, collection, resource) {
  if (isUserDataManifest(manifestOrLatestData)) {
    if (collection) {
      return manifestOrLatestData?.collections?.[collection]?.latest?.[resource];
    }
    return manifestOrLatestData?.latest?.[resource];
  }
  if (collection) {
    return manifestOrLatestData?.collections?.[collection]?.resources?.[resource];
  }
  return manifestOrLatestData?.resources?.[resource];
}
export {
  UserDataSyncService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXHVzZXJEYXRhU3luY1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNCb29sZWFuLCBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zU3luY2hyb25pc2VyIH0gZnJvbSAnLi9leHRlbnNpb25zU3luYy5qcyc7XG5pbXBvcnQgeyBHbG9iYWxTdGF0ZVN5bmNocm9uaXNlciB9IGZyb20gJy4vZ2xvYmFsU3RhdGVTeW5jLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzU3luY2hyb25pc2VyIH0gZnJvbSAnLi9rZXliaW5kaW5nc1N5bmMuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1N5bmNocm9uaXplciB9IGZyb20gJy4vcHJvbXB0c1N5bmMvcHJvbXB0c1N5bmMuanMnO1xuaW1wb3J0IHsgU2V0dGluZ3NTeW5jaHJvbmlzZXIgfSBmcm9tICcuL3NldHRpbmdzU3luYy5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0c1N5bmNocm9uaXNlciB9IGZyb20gJy4vc25pcHBldHNTeW5jLmpzJztcbmltcG9ydCB7IFRhc2tzU3luY2hyb25pc2VyIH0gZnJvbSAnLi90YXNrc1N5bmMuanMnO1xuaW1wb3J0IHsgTWNwU3luY2hyb25pc2VyIH0gZnJvbSAnLi9tY3BTeW5jLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhUHJvZmlsZXNNYW5pZmVzdFN5bmNocm9uaXNlciB9IGZyb20gJy4vdXNlckRhdGFQcm9maWxlc01hbmlmZXN0U3luYy5qcyc7XG5pbXBvcnQge1xuXHRBTExfU1lOQ19SRVNPVVJDRVMsIGNyZWF0ZVN5bmNIZWFkZXJzLCBJVXNlckRhdGFNYW51YWxTeW5jVGFzaywgSVVzZXJEYXRhU3luY1Jlc291cmNlQ29uZmxpY3RzLCBJVXNlckRhdGFTeW5jUmVzb3VyY2VFcnJvcixcblx0SVVzZXJEYXRhU3luY1Jlc291cmNlLCBJU3luY1Jlc291cmNlSGFuZGxlLCBJVXNlckRhdGFTeW5jVGFzaywgSVN5bmNVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YU1hbmlmZXN0LCBJVXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbixcblx0SVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFTeW5jaHJvbmlzZXIsIElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsIElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFN5bmNSZXNvdXJjZSwgU3luY1N0YXR1cywgVXNlckRhdGFTeW5jRXJyb3IsIFVzZXJEYXRhU3luY0Vycm9yQ29kZSwgVXNlckRhdGFTeW5jU3RvcmVFcnJvciwgVVNFUl9EQVRBX1NZTkNfQ09ORklHVVJBVElPTl9TQ09QRSwgSVVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLCBJVXNlckRhdGFTeW5jQWN0aXZpdHlEYXRhLCBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsXG5cdElVc2VyRGF0YVN5bmNMYXRlc3REYXRhLFxuXHRJVXNlckRhdGEsXG5cdGlzVXNlckRhdGFNYW5pZmVzdCxcbn0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuXG50eXBlIFN5bmNFcnJvckNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3NhbmR5MDgxJztcblx0Y29tbWVudDogJ0luZm9ybWF0aW9uIGFib3V0IHRoZSBlcnJvciB0aGF0IG9jY3VycmVkIHdoaWxlIHN5bmNpbmcnO1xuXHRjb2RlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnZXJyb3IgY29kZScgfTtcblx0c2VydmljZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1NldHRpbmdzIFN5bmMgc2VydmljZSBmb3Igd2hpY2ggdGhpcyBlcnJvciBoYXMgb2NjdXJyZWQnIH07XG5cdHNlcnZlckNvZGU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnU2V0dGluZ3MgU3luYyBzZXJ2aWNlIGVycm9yIGNvZGUnIH07XG5cdHVybD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdTZXR0aW5ncyBTeW5jIHJlc291cmNlIFVSTCBmb3Igd2hpY2ggdGhpcyBlcnJvciBoYXMgb2NjdXJyZWQnIH07XG5cdHJlc291cmNlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1NldHRpbmdzIFN5bmMgcmVzb3VyY2UgZm9yIHdoaWNoIHRoaXMgZXJyb3IgaGFzIG9jY3VycmVkJyB9O1xuXHRleGVjdXRpb25JZD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdTZXR0aW5ncyBTeW5jIGV4ZWN1dGlvbiBpZCBmb3Igd2hpY2ggdGhpcyBlcnJvciBoYXMgb2NjdXJyZWQnIH07XG59O1xuXG50eXBlIFN5bmNFcnJvckV2ZW50ID0ge1xuXHRjb2RlOiBzdHJpbmc7XG5cdHNlcnZpY2U6IHN0cmluZztcblx0c2VydmVyQ29kZT86IHN0cmluZztcblx0dXJsPzogc3RyaW5nO1xuXHRyZXNvdXJjZT86IHN0cmluZztcblx0ZXhlY3V0aW9uSWQ/OiBzdHJpbmc7XG59O1xuXG5jb25zdCBMQVNUX1NZTkNfVElNRV9LRVkgPSAnc3luYy5sYXN0U3luY1RpbWUnO1xuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFTeW5jU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jU2VydmljZSB7XG5cblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3N0YXR1czogU3luY1N0YXR1cyA9IFN5bmNTdGF0dXMuVW5pbml0aWFsaXplZDtcblx0Z2V0IHN0YXR1cygpOiBTeW5jU3RhdHVzIHsgcmV0dXJuIHRoaXMuX3N0YXR1czsgfVxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVN0YXR1czogRW1pdHRlcjxTeW5jU3RhdHVzPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFN5bmNTdGF0dXM+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVN0YXR1czogRXZlbnQ8U3luY1N0YXR1cz4gPSB0aGlzLl9vbkRpZENoYW5nZVN0YXR1cy5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUxvY2FsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U3luY1Jlc291cmNlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMb2NhbCA9IHRoaXMuX29uRGlkQ2hhbmdlTG9jYWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfY29uZmxpY3RzOiBJVXNlckRhdGFTeW5jUmVzb3VyY2VDb25mbGljdHNbXSA9IFtdO1xuXHRnZXQgY29uZmxpY3RzKCk6IElVc2VyRGF0YVN5bmNSZXNvdXJjZUNvbmZsaWN0c1tdIHsgcmV0dXJuIHRoaXMuX2NvbmZsaWN0czsgfVxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUNvbmZsaWN0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElVc2VyRGF0YVN5bmNSZXNvdXJjZUNvbmZsaWN0c1tdPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb25mbGljdHMgPSB0aGlzLl9vbkRpZENoYW5nZUNvbmZsaWN0cy5ldmVudDtcblxuXHRwcml2YXRlIF9zeW5jRXJyb3JzOiBJVXNlckRhdGFTeW5jUmVzb3VyY2VFcnJvcltdID0gW107XG5cdHByaXZhdGUgX29uU3luY0Vycm9ycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElVc2VyRGF0YVN5bmNSZXNvdXJjZUVycm9yW10+KCkpO1xuXHRyZWFkb25seSBvblN5bmNFcnJvcnMgPSB0aGlzLl9vblN5bmNFcnJvcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfbGFzdFN5bmNUaW1lOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCBsYXN0U3luY1RpbWUoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2xhc3RTeW5jVGltZTsgfVxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUxhc3RTeW5jVGltZTogRW1pdHRlcjxudW1iZXI+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMYXN0U3luY1RpbWU6IEV2ZW50PG51bWJlcj4gPSB0aGlzLl9vbkRpZENoYW5nZUxhc3RTeW5jVGltZS5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZFJlc2V0TG9jYWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXNldExvY2FsID0gdGhpcy5fb25EaWRSZXNldExvY2FsLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkUmVzZXRSZW1vdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXNldFJlbW90ZSA9IHRoaXMuX29uRGlkUmVzZXRSZW1vdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBhY3RpdmVQcm9maWxlU3luY2hyb25pemVycyA9IG5ldyBNYXA8c3RyaW5nLCBbUHJvZmlsZVN5bmNocm9uaXplciwgSURpc3Bvc2FibGVdPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZTogSVVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3N0YXR1cyA9IHVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UudXNlckRhdGFTeW5jU3RvcmUgPyBTeW5jU3RhdHVzLklkbGUgOiBTeW5jU3RhdHVzLlVuaW5pdGlhbGl6ZWQ7XG5cdFx0dGhpcy5fbGFzdFN5bmNUaW1lID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXROdW1iZXIoTEFTVF9TWU5DX1RJTUVfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY2xlYXJBY3RpdmVQcm9maWxlU3luY2hyb25pemVycygpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLmNsZWFuVXBTdGFsZVN0b3JhZ2VEYXRhKCksIDUgKiAxMDAwIC8qIGFmdGVyIDVzICovKSkuc2NoZWR1bGUoKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVN5bmNUYXNrKG1hbmlmZXN0OiBJVXNlckRhdGFNYW5pZmVzdCB8IG51bGwsIGRpc2FibGVDYWNoZT86IGJvb2xlYW4pOiBQcm9taXNlPElVc2VyRGF0YVN5bmNUYXNrPiB7XG5cdFx0dGhpcy5jaGVja0VuYWJsZW1lbnQoKTtcblxuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTeW5jIHN0YXJ0ZWQuJyk7XG5cdFx0Y29uc3Qgc3RhcnRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cdFx0Y29uc3QgZXhlY3V0aW9uSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3luY0hlYWRlcnMgPSBjcmVhdGVTeW5jSGVhZGVycyhleGVjdXRpb25JZCk7XG5cdFx0XHRpZiAoZGlzYWJsZUNhY2hlKSB7XG5cdFx0XHRcdHN5bmNIZWFkZXJzWydDYWNoZS1Db250cm9sJ10gPSAnbm8tY2FjaGUnO1xuXHRcdFx0fVxuXHRcdFx0bWFuaWZlc3QgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5tYW5pZmVzdChtYW5pZmVzdCwgc3luY0hlYWRlcnMpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNFcnJvciA9IFVzZXJEYXRhU3luY0Vycm9yLnRvVXNlckRhdGFTeW5jRXJyb3IoZXJyb3IpO1xuXHRcdFx0cmVwb3J0VXNlckRhdGFTeW5jRXJyb3IodXNlckRhdGFTeW5jRXJyb3IsIGV4ZWN1dGlvbklkLCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsIHRoaXMudGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0XHR0aHJvdyB1c2VyRGF0YVN5bmNFcnJvcjtcblx0XHR9XG5cblx0XHRjb25zdCBleGVjdXRlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGxldCBjYW5jZWxsYWJsZVByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRcdHJldHVybiB7XG5cdFx0XHRtYW5pZmVzdCxcblx0XHRcdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0aWYgKGV4ZWN1dGVkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW4gcnVuIGEgdGFzayBvbmx5IG9uY2UnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYW5jZWxsYWJsZVByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSh0b2tlbiA9PiB0aGF0LnN5bmMobWFuaWZlc3QsIGZhbHNlLCBleGVjdXRpb25JZCwgdG9rZW4pKTtcblx0XHRcdFx0YXdhaXQgY2FuY2VsbGFibGVQcm9taXNlLmZpbmFsbHkoKCkgPT4gY2FuY2VsbGFibGVQcm9taXNlID0gdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhhdC5sb2dTZXJ2aWNlLmluZm8oYFN5bmMgZG9uZS4gVG9vayAke25ldyBEYXRlKCkuZ2V0VGltZSgpIC0gc3RhcnRUaW1lfW1zYCk7XG5cdFx0XHRcdHRoYXQudXBkYXRlTGFzdFN5bmNUaW1lKCk7XG5cdFx0XHR9LFxuXHRcdFx0c3RvcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y2FuY2VsbGFibGVQcm9taXNlPy5jYW5jZWwoKTtcblx0XHRcdFx0cmV0dXJuIHRoYXQuc3RvcCgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBjcmVhdGVNYW51YWxTeW5jVGFzaygpOiBQcm9taXNlPElVc2VyRGF0YU1hbnVhbFN5bmNUYXNrPiB7XG5cdFx0dGhpcy5jaGVja0VuYWJsZW1lbnQoKTtcblxuXHRcdGlmICh0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jRXJyb3IoJ0Nhbm5vdCBzdGFydCBtYW51YWwgc3luYyB3aGVuIHN5bmMgaXMgZW5hYmxlZCcsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Mb2NhbEVycm9yKTtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnU3luYyBzdGFydGVkLicpO1xuXHRcdGNvbnN0IHN0YXJ0VGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXHRcdGNvbnN0IGV4ZWN1dGlvbklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3Qgc3luY0hlYWRlcnMgPSBjcmVhdGVTeW5jSGVhZGVycyhleGVjdXRpb25JZCk7XG5cdFx0bGV0IGxhdGVzdFVzZXJEYXRhT3JNYW5pZmVzdDogSVVzZXJEYXRhU3luY0xhdGVzdERhdGEgfCBJVXNlckRhdGFNYW5pZmVzdCB8IG51bGw7XG5cdFx0dHJ5IHtcblx0XHRcdGxhdGVzdFVzZXJEYXRhT3JNYW5pZmVzdCA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLmdldExhdGVzdERhdGEoc3luY0hlYWRlcnMpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNFcnJvciA9IFVzZXJEYXRhU3luY0Vycm9yLnRvVXNlckRhdGFTeW5jRXJyb3IoZXJyb3IpO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8U3luY0Vycm9yRXZlbnQsIFN5bmNFcnJvckNsYXNzaWZpY2F0aW9uPignc3luYy5kb3dubG9hZC5sYXRlc3QnLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29kZTogdXNlckRhdGFTeW5jRXJyb3IuY29kZSxcblx0XHRcdFx0XHRzZXJ2ZXJDb2RlOiB1c2VyRGF0YVN5bmNFcnJvciBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY1N0b3JlRXJyb3IgPyBTdHJpbmcodXNlckRhdGFTeW5jRXJyb3Iuc2VydmVyQ29kZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJsOiB1c2VyRGF0YVN5bmNFcnJvciBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY1N0b3JlRXJyb3IgPyB1c2VyRGF0YVN5bmNFcnJvci51cmwgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHVzZXJEYXRhU3luY0Vycm9yLnJlc291cmNlLFxuXHRcdFx0XHRcdGV4ZWN1dGlvbklkLFxuXHRcdFx0XHRcdHNlcnZpY2U6IHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZSEudXJsLnRvU3RyaW5nKClcblx0XHRcdFx0fSk7XG5cblx0XHRcdC8vIEZhbGxiYWNrIHRvIG1hbmlmZXN0IGluIHN0YWJsZVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bGF0ZXN0VXNlckRhdGFPck1hbmlmZXN0ID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UubWFuaWZlc3QobnVsbCwgc3luY0hlYWRlcnMpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Y29uc3QgdXNlckRhdGFTeW5jRXJyb3IgPSBVc2VyRGF0YVN5bmNFcnJvci50b1VzZXJEYXRhU3luY0Vycm9yKGVycm9yKTtcblx0XHRcdFx0cmVwb3J0VXNlckRhdGFTeW5jRXJyb3IodXNlckRhdGFTeW5jRXJyb3IsIGV4ZWN1dGlvbklkLCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsIHRoaXMudGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0XHRcdHRocm93IHVzZXJEYXRhU3luY0Vycm9yO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8qIE1hbnVhbCBzeW5jIHNoYWxsIHN0YXJ0IG9uIGNsZWFuIGxvY2FsIHN0YXRlICovXG5cdFx0YXdhaXQgdGhpcy5yZXNldExvY2FsKCk7XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCBjYW5jZWxsYWJsZVRva2VuID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBleGVjdXRpb25JZCxcblx0XHRcdGFzeW5jIG1lcmdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5zeW5jKGxhdGVzdFVzZXJEYXRhT3JNYW5pZmVzdCwgdHJ1ZSwgZXhlY3V0aW9uSWQsIGNhbmNlbGxhYmxlVG9rZW4udG9rZW4pO1xuXHRcdFx0fSxcblx0XHRcdGFzeW5jIGFwcGx5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGF0LmFwcGx5TWFudWFsU3luYyhsYXRlc3RVc2VyRGF0YU9yTWFuaWZlc3QsIGV4ZWN1dGlvbklkLCBjYW5jZWxsYWJsZVRva2VuLnRva2VuKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0aWYgKFVzZXJEYXRhU3luY0Vycm9yLnRvVXNlckRhdGFTeW5jRXJyb3IoZXJyb3IpLmNvZGUgPT09IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5NZXRob2ROb3RGb3VuZCkge1xuXHRcdFx0XHRcdFx0XHR0aGF0LmxvZ1NlcnZpY2UuaW5mbygnQ2xpZW50IGlzIG1ha2luZyBpbnZhbGlkIHJlcXVlc3RzLiBDbGVhbmluZyB1cCBkYXRhLi4uJyk7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoYXQuY2xlYW5VcFJlbW90ZURhdGEoKTtcblx0XHRcdFx0XHRcdFx0dGhhdC5sb2dTZXJ2aWNlLmluZm8oJ0FwcGx5aW5nIG1hbnVhbCBzeW5jIGFnYWluLi4uJyk7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoYXQuYXBwbHlNYW51YWxTeW5jKGxhdGVzdFVzZXJEYXRhT3JNYW5pZmVzdCwgZXhlY3V0aW9uSWQsIGNhbmNlbGxhYmxlVG9rZW4udG9rZW4pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoYXQubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhhdC5sb2dTZXJ2aWNlLmluZm8oYFN5bmMgZG9uZS4gVG9vayAke25ldyBEYXRlKCkuZ2V0VGltZSgpIC0gc3RhcnRUaW1lfW1zYCk7XG5cdFx0XHRcdHRoYXQudXBkYXRlTGFzdFN5bmNUaW1lKCk7XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgc3RvcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y2FuY2VsbGFibGVUb2tlbi5jYW5jZWwoKTtcblx0XHRcdFx0YXdhaXQgdGhhdC5zdG9wKCk7XG5cdFx0XHRcdGF3YWl0IHRoYXQucmVzZXRMb2NhbCgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN5bmMobWFuaWZlc3RPckxhdGVzdERhdGE6IElVc2VyRGF0YU1hbmlmZXN0IHwgSVVzZXJEYXRhU3luY0xhdGVzdERhdGEgfCBudWxsLCBwcmV2aWV3OiBib29sZWFuLCBleGVjdXRpb25JZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zeW5jRXJyb3JzID0gW107XG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0aGlzLnN0YXR1cyAhPT0gU3luY1N0YXR1cy5IYXNDb25mbGljdHMpIHtcblx0XHRcdFx0dGhpcy5zZXRTdGF0dXMoU3luY1N0YXR1cy5TeW5jaW5nKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3luYyBEZWZhdWx0IFByb2ZpbGUgRmlyc3Rcblx0XHRcdGNvbnN0IGRlZmF1bHRQcm9maWxlU3luY2hyb25pemVyID0gdGhpcy5nZXRPckNyZWF0ZUFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXIodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3N5bmNFcnJvcnMucHVzaCguLi5hd2FpdCB0aGlzLnN5bmNQcm9maWxlKGRlZmF1bHRQcm9maWxlU3luY2hyb25pemVyLCBtYW5pZmVzdE9yTGF0ZXN0RGF0YSwgcHJldmlldywgZXhlY3V0aW9uSWQsIHRva2VuKSk7XG5cblx0XHRcdC8vIFN5bmMgb3RoZXIgcHJvZmlsZXNcblx0XHRcdGNvbnN0IHVzZXJEYXRhUHJvZmlsZU1hbmlmZXN0U3luY2hyb25pemVyID0gZGVmYXVsdFByb2ZpbGVTeW5jaHJvbml6ZXIuZW5hYmxlZC5maW5kKHMgPT4gcy5yZXNvdXJjZSA9PT0gU3luY1Jlc291cmNlLlByb2ZpbGVzKTtcblx0XHRcdGlmICh1c2VyRGF0YVByb2ZpbGVNYW5pZmVzdFN5bmNocm9uaXplcikge1xuXHRcdFx0XHRjb25zdCBzeW5jUHJvZmlsZXMgPSAoYXdhaXQgKHVzZXJEYXRhUHJvZmlsZU1hbmlmZXN0U3luY2hyb25pemVyIGFzIFVzZXJEYXRhUHJvZmlsZXNNYW5pZmVzdFN5bmNocm9uaXNlcikuZ2V0TGFzdFN5bmNlZFByb2ZpbGVzKCkpIHx8IFtdO1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy5zeW5jUmVtb3RlUHJvZmlsZXMoc3luY1Byb2ZpbGVzLCBtYW5pZmVzdE9yTGF0ZXN0RGF0YSwgcHJldmlldywgZXhlY3V0aW9uSWQsIHRva2VuKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHRoaXMuc3RhdHVzICE9PSBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cykge1xuXHRcdFx0XHR0aGlzLnNldFN0YXR1cyhTeW5jU3RhdHVzLklkbGUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25TeW5jRXJyb3JzLmZpcmUodGhpcy5fc3luY0Vycm9ycyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzeW5jUmVtb3RlUHJvZmlsZXMocmVtb3RlUHJvZmlsZXM6IElTeW5jVXNlckRhdGFQcm9maWxlW10sIG1hbmlmZXN0OiBJVXNlckRhdGFNYW5pZmVzdCB8IElVc2VyRGF0YVN5bmNMYXRlc3REYXRhIHwgbnVsbCwgcHJldmlldzogYm9vbGVhbiwgZXhlY3V0aW9uSWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBzeW5jUHJvZmlsZSBvZiByZW1vdGVQcm9maWxlcykge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHByb2ZpbGUgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLmZpbmQocCA9PiBwLmlkID09PSBzeW5jUHJvZmlsZS5pZCk7XG5cdFx0XHRpZiAoIXByb2ZpbGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBQcm9maWxlIHdpdGggaWQ6JHtzeW5jUHJvZmlsZS5pZH0gYW5kIG5hbWU6ICR7c3luY1Byb2ZpbGUubmFtZX0gZG9lcyBub3QgZXhpc3QgbG9jYWxseSB0byBzeW5jLmApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTeW5jaW5nIHByb2ZpbGUuJywgc3luY1Byb2ZpbGUubmFtZSk7XG5cdFx0XHRjb25zdCBwcm9maWxlU3luY2hyb25pemVyID0gdGhpcy5nZXRPckNyZWF0ZUFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXIocHJvZmlsZSwgc3luY1Byb2ZpbGUpO1xuXHRcdFx0dGhpcy5fc3luY0Vycm9ycy5wdXNoKC4uLmF3YWl0IHRoaXMuc3luY1Byb2ZpbGUocHJvZmlsZVN5bmNocm9uaXplciwgbWFuaWZlc3QsIHByZXZpZXcsIGV4ZWN1dGlvbklkLCB0b2tlbikpO1xuXHRcdH1cblx0XHQvLyBEaXNwb3NlICYgRGVsZXRlIHByb2ZpbGUgc3luY2hyb25pemVycyB3aGljaCBkbyBub3QgZXhpc3QgYW55bW9yZVxuXHRcdGZvciAoY29uc3QgW2tleSwgcHJvZmlsZVN5bmNocm9uaXplckl0ZW1dIG9mIHRoaXMuYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMuZW50cmllcygpKSB7XG5cdFx0XHRpZiAodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5zb21lKHAgPT4gcC5pZCA9PT0gcHJvZmlsZVN5bmNocm9uaXplckl0ZW1bMF0ucHJvZmlsZS5pZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBwcm9maWxlU3luY2hyb25pemVySXRlbVswXS5yZXNldExvY2FsKCk7XG5cdFx0XHRwcm9maWxlU3luY2hyb25pemVySXRlbVsxXS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXJzLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXBwbHlNYW51YWxTeW5jKG1hbmlmZXN0T3JMYXRlc3REYXRhOiBJVXNlckRhdGFNYW5pZmVzdCB8IElVc2VyRGF0YVN5bmNMYXRlc3REYXRhIHwgbnVsbCwgZXhlY3V0aW9uSWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuc2V0U3RhdHVzKFN5bmNTdGF0dXMuU3luY2luZyk7XG5cdFx0XHRjb25zdCBwcm9maWxlU3luY2hyb25pemVycyA9IHRoaXMuZ2V0QWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMoKTtcblx0XHRcdGZvciAoY29uc3QgcHJvZmlsZVN5bmNocm9uaXplciBvZiBwcm9maWxlU3luY2hyb25pemVycykge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgcHJvZmlsZVN5bmNocm9uaXplci5hcHBseShleGVjdXRpb25JZCwgdG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWZhdWx0UHJvZmlsZVN5bmNocm9uaXplciA9IHByb2ZpbGVTeW5jaHJvbml6ZXJzLmZpbmQocyA9PiBzLnByb2ZpbGUuaXNEZWZhdWx0KTtcblx0XHRcdGlmICghZGVmYXVsdFByb2ZpbGVTeW5jaHJvbml6ZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVNYW5pZmVzdFN5bmNocm9uaXplciA9IGRlZmF1bHRQcm9maWxlU3luY2hyb25pemVyLmVuYWJsZWQuZmluZChzID0+IHMucmVzb3VyY2UgPT09IFN5bmNSZXNvdXJjZS5Qcm9maWxlcyk7XG5cdFx0XHRpZiAoIXVzZXJEYXRhUHJvZmlsZU1hbmlmZXN0U3luY2hyb25pemVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3luYyByZW1vdGUgcHJvZmlsZXMgd2hpY2ggYXJlIG5vdCBzeW5jZWQgbG9jYWxseVxuXHRcdFx0Y29uc3QgcmVtb3RlUHJvZmlsZXMgPSAoYXdhaXQgKHVzZXJEYXRhUHJvZmlsZU1hbmlmZXN0U3luY2hyb25pemVyIGFzIFVzZXJEYXRhUHJvZmlsZXNNYW5pZmVzdFN5bmNocm9uaXNlcikuZ2V0UmVtb3RlU3luY2VkUHJvZmlsZXMoZ2V0UmVmT3JVc2VyRGF0YShtYW5pZmVzdE9yTGF0ZXN0RGF0YSwgdW5kZWZpbmVkLCBTeW5jUmVzb3VyY2UuUHJvZmlsZXMpID8/IG51bGwpKSB8fCBbXTtcblx0XHRcdGNvbnN0IHJlbW90ZVByb2ZpbGVzVG9TeW5jID0gcmVtb3RlUHJvZmlsZXMuZmlsdGVyKHJlbW90ZVByb2ZpbGUgPT4gcHJvZmlsZVN5bmNocm9uaXplcnMuZXZlcnkocyA9PiBzLnByb2ZpbGUuaWQgIT09IHJlbW90ZVByb2ZpbGUuaWQpKTtcblx0XHRcdGlmIChyZW1vdGVQcm9maWxlc1RvU3luYy5sZW5ndGgpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zeW5jUmVtb3RlUHJvZmlsZXMocmVtb3RlUHJvZmlsZXNUb1N5bmMsIG1hbmlmZXN0T3JMYXRlc3REYXRhLCBmYWxzZSwgZXhlY3V0aW9uSWQsIHRva2VuKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5zZXRTdGF0dXMoU3luY1N0YXR1cy5JZGxlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN5bmNQcm9maWxlKHByb2ZpbGVTeW5jaHJvbml6ZXI6IFByb2ZpbGVTeW5jaHJvbml6ZXIsIG1hbmlmZXN0T3JMYXRlc3REYXRhOiBJVXNlckRhdGFNYW5pZmVzdCB8IElVc2VyRGF0YVN5bmNMYXRlc3REYXRhIHwgbnVsbCwgcHJldmlldzogYm9vbGVhbiwgZXhlY3V0aW9uSWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVXNlckRhdGFTeW5jUmVzb3VyY2VFcnJvcltdPiB7XG5cdFx0Y29uc3QgZXJyb3JzID0gYXdhaXQgcHJvZmlsZVN5bmNocm9uaXplci5zeW5jKG1hbmlmZXN0T3JMYXRlc3REYXRhLCBwcmV2aWV3LCBleGVjdXRpb25JZCwgdG9rZW4pO1xuXHRcdHJldHVybiBlcnJvcnMubWFwKChbc3luY1Jlc291cmNlLCBlcnJvcl0pID0+ICh7IHByb2ZpbGU6IHByb2ZpbGVTeW5jaHJvbml6ZXIucHJvZmlsZSwgc3luY1Jlc291cmNlLCBlcnJvciB9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc3RhdHVzICE9PSBTeW5jU3RhdHVzLklkbGUpIHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh0aGlzLmdldEFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXJzKCkubWFwKHByb2ZpbGVTeW5jaHJvbml6ZXIgPT4gcHJvZmlsZVN5bmNocm9uaXplci5zdG9wKCkpKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXNvbHZlQ29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UucmVzb2x2ZUNvbnRlbnQocmVzb3VyY2UpO1xuXHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRyZXR1cm4gY29udGVudDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwcm9maWxlU3luY2hyb25pemVyIG9mIHRoaXMuZ2V0QWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBzeW5jaHJvbml6ZXIgb2YgcHJvZmlsZVN5bmNocm9uaXplci5lbmFibGVkKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBzeW5jaHJvbml6ZXIucmVzb2x2ZUNvbnRlbnQocmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0XHRcdHJldHVybiBjb250ZW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0YXN5bmMgcmVwbGFjZShzeW5jUmVzb3VyY2VIYW5kbGU6IElTeW5jUmVzb3VyY2VIYW5kbGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNoZWNrRW5hYmxlbWVudCgpO1xuXG5cdFx0Y29uc3QgcHJvZmlsZVN5bmNSZXNvdXJjZSA9IHRoaXMudXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UucmVzb2x2ZVVzZXJEYXRhU3luY1Jlc291cmNlKHN5bmNSZXNvdXJjZUhhbmRsZSk7XG5cdFx0aWYgKCFwcm9maWxlU3luY1Jlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMucmVzb2x2ZUNvbnRlbnQoc3luY1Jlc291cmNlSGFuZGxlLnVyaSk7XG5cdFx0aWYgKCFjb250ZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5wZXJmb3JtQWN0aW9uKHByb2ZpbGVTeW5jUmVzb3VyY2UucHJvZmlsZSwgYXN5bmMgc3luY2hyb25pemVyID0+IHtcblx0XHRcdGlmIChwcm9maWxlU3luY1Jlc291cmNlLnN5bmNSZXNvdXJjZSA9PT0gc3luY2hyb25pemVyLnJlc291cmNlKSB7XG5cdFx0XHRcdGF3YWl0IHN5bmNocm9uaXplci5yZXBsYWNlKGNvbnRlbnQpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm47XG5cdH1cblxuXHRhc3luYyBhY2NlcHQoc3luY1Jlc291cmNlOiBJVXNlckRhdGFTeW5jUmVzb3VyY2UsIHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIGFwcGx5OiBib29sZWFuIHwgeyBmb3JjZTogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jaGVja0VuYWJsZW1lbnQoKTtcblxuXHRcdGF3YWl0IHRoaXMucGVyZm9ybUFjdGlvbihzeW5jUmVzb3VyY2UucHJvZmlsZSwgYXN5bmMgc3luY2hyb25pemVyID0+IHtcblx0XHRcdGlmIChzeW5jUmVzb3VyY2Uuc3luY1Jlc291cmNlID09PSBzeW5jaHJvbml6ZXIucmVzb3VyY2UpIHtcblx0XHRcdFx0YXdhaXQgc3luY2hyb25pemVyLmFjY2VwdChyZXNvdXJjZSwgY29udGVudCk7XG5cdFx0XHRcdGlmIChhcHBseSkge1xuXHRcdFx0XHRcdGF3YWl0IHN5bmNocm9uaXplci5hcHBseShpc0Jvb2xlYW4oYXBwbHkpID8gZmFsc2UgOiBhcHBseS5mb3JjZSwgY3JlYXRlU3luY0hlYWRlcnMoZ2VuZXJhdGVVdWlkKCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBoYXNMb2NhbERhdGEoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wZXJmb3JtQWN0aW9uKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUsIGFzeW5jIHN5bmNocm9uaXplciA9PiB7XG5cdFx0XHQvLyBza2lwIGdsb2JhbCBzdGF0ZSBzeW5jaHJvbml6ZXJcblx0XHRcdGlmIChzeW5jaHJvbml6ZXIucmVzb3VyY2UgIT09IFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZSAmJiBhd2FpdCBzeW5jaHJvbml6ZXIuaGFzTG9jYWxEYXRhKCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHRcdHJldHVybiAhIXJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIGhhc1ByZXZpb3VzbHlTeW5jZWQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wZXJmb3JtQWN0aW9uKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUsIGFzeW5jIHN5bmNocm9uaXplciA9PiB7XG5cdFx0XHRpZiAoYXdhaXQgc3luY2hyb25pemVyLmhhc1ByZXZpb3VzbHlTeW5jZWQoKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0cmV0dXJuICEhcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgcmVzZXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jaGVja0VuYWJsZW1lbnQoKTtcblx0XHRhd2FpdCB0aGlzLnJlc2V0UmVtb3RlKCk7XG5cdFx0YXdhaXQgdGhpcy5yZXNldExvY2FsKCk7XG5cdH1cblxuXHRhc3luYyByZXNldFJlbW90ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNoZWNrRW5hYmxlbWVudCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5jbGVhcigpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0NsZWFyZWQgZGF0YSBvbiBzZXJ2ZXInKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkUmVzZXRSZW1vdGUuZmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgcmVzZXRMb2NhbCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNoZWNrRW5hYmxlbWVudCgpO1xuXHRcdHRoaXMuX2xhc3RTeW5jVGltZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShMQVNUX1NZTkNfVElNRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0Zm9yIChjb25zdCBbc3luY2hyb25pemVyXSBvZiB0aGlzLmFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXJzLnZhbHVlcygpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBzeW5jaHJvbml6ZXIucmVzZXRMb2NhbCgpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuY2xlYXJBY3RpdmVQcm9maWxlU3luY2hyb25pemVycygpO1xuXHRcdHRoaXMuX29uRGlkUmVzZXRMb2NhbC5maXJlKCk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0RpZCByZXNldCB0aGUgbG9jYWwgc3luYyBzdGF0ZS4nKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2xlYW5VcFN0YWxlU3RvcmFnZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWxsS2V5cyA9IHRoaXMuc3RvcmFnZVNlcnZpY2Uua2V5cyhTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Y29uc3QgbGFzdFN5bmNQcm9maWxlS2V5czogW3N0cmluZywgc3RyaW5nXVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgYWxsS2V5cykge1xuXHRcdFx0aWYgKCFrZXkuZW5kc1dpdGgoJy5sYXN0U3luY1VzZXJEYXRhJykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZWdtZW50cyA9IGtleS5zcGxpdCgnLicpO1xuXHRcdFx0aWYgKHNlZ21lbnRzLmxlbmd0aCA9PT0gMykge1xuXHRcdFx0XHRsYXN0U3luY1Byb2ZpbGVLZXlzLnB1c2goW2tleSwgc2VnbWVudHNbMF1dKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFsYXN0U3luY1Byb2ZpbGVLZXlzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGxldCBkZWZhdWx0UHJvZmlsZVN5bmNocm9uaXplciA9IHRoaXMuYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMuZ2V0KHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuaWQpPy5bMF07XG5cdFx0XHRpZiAoIWRlZmF1bHRQcm9maWxlU3luY2hyb25pemVyKSB7XG5cdFx0XHRcdGRlZmF1bHRQcm9maWxlU3luY2hyb25pemVyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvZmlsZVN5bmNocm9uaXplciwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSwgdW5kZWZpbmVkKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVNYW5pZmVzdFN5bmNocm9uaXplciA9IGRlZmF1bHRQcm9maWxlU3luY2hyb25pemVyLmVuYWJsZWQuZmluZChzID0+IHMucmVzb3VyY2UgPT09IFN5bmNSZXNvdXJjZS5Qcm9maWxlcykgYXMgVXNlckRhdGFQcm9maWxlc01hbmlmZXN0U3luY2hyb25pc2VyO1xuXHRcdFx0aWYgKCF1c2VyRGF0YVByb2ZpbGVNYW5pZmVzdFN5bmNocm9uaXplcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsYXN0U3luY2VkUHJvZmlsZXMgPSBhd2FpdCB1c2VyRGF0YVByb2ZpbGVNYW5pZmVzdFN5bmNocm9uaXplci5nZXRMYXN0U3luY2VkUHJvZmlsZXMoKTtcblx0XHRcdGNvbnN0IGxhc3RTeW5jZWRDb2xsZWN0aW9ucyA9IGxhc3RTeW5jZWRQcm9maWxlcz8ubWFwKHAgPT4gcC5jb2xsZWN0aW9uKSA/PyBbXTtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgY29sbGVjdGlvbl0gb2YgbGFzdFN5bmNQcm9maWxlS2V5cykge1xuXHRcdFx0XHRpZiAoIWxhc3RTeW5jZWRDb2xsZWN0aW9ucy5pbmNsdWRlcyhjb2xsZWN0aW9uKSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBSZW1vdmluZyBsYXN0IHN5bmMgc3RhdGUgZm9yIHN0YWxlIHByb2ZpbGU6ICR7Y29sbGVjdGlvbn1gKTtcblx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNsZWFuVXBSZW1vdGVEYXRhKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlbW90ZVByb2ZpbGVzID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5nZXRSZW1vdGVTeW5jZWRQcm9maWxlcygpO1xuXHRcdGNvbnN0IHJlbW90ZVByb2ZpbGVDb2xsZWN0aW9ucyA9IHJlbW90ZVByb2ZpbGVzLm1hcChwcm9maWxlID0+IHByb2ZpbGUuY29sbGVjdGlvbik7XG5cdFx0Y29uc3QgYWxsQ29sbGVjdGlvbnMgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5nZXRBbGxDb2xsZWN0aW9ucygpO1xuXHRcdGNvbnN0IHJlZHVuZGFudENvbGxlY3Rpb25zID0gYWxsQ29sbGVjdGlvbnMuZmlsdGVyKGMgPT4gIXJlbW90ZVByb2ZpbGVDb2xsZWN0aW9ucy5pbmNsdWRlcyhjKSk7XG5cdFx0aWYgKHJlZHVuZGFudENvbGxlY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYERlbGV0aW5nICR7cmVkdW5kYW50Q29sbGVjdGlvbnMubGVuZ3RofSByZWR1bmRhbnQgY29sbGVjdGlvbnMgb24gc2VydmVyYCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQocmVkdW5kYW50Q29sbGVjdGlvbnMubWFwKGNvbGxlY3Rpb25JZCA9PiB0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5kZWxldGVDb2xsZWN0aW9uKGNvbGxlY3Rpb25JZCkpKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBEZWxldGVkIHJlZHVuZGFudCBjb2xsZWN0aW9ucyBvbiBzZXJ2ZXJgKTtcblx0XHR9XG5cdFx0Y29uc3QgdXBkYXRlZFJlbW90ZVByb2ZpbGVzID0gcmVtb3RlUHJvZmlsZXMuZmlsdGVyKHByb2ZpbGUgPT4gYWxsQ29sbGVjdGlvbnMuaW5jbHVkZXMocHJvZmlsZS5jb2xsZWN0aW9uKSk7XG5cdFx0aWYgKHVwZGF0ZWRSZW1vdGVQcm9maWxlcy5sZW5ndGggIT09IHJlbW90ZVByb2ZpbGVzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcHJvZmlsZU1hbmlmZXN0U3luY2hyb25pemVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVByb2ZpbGVzTWFuaWZlc3RTeW5jaHJvbmlzZXIsIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUsIHVuZGVmaW5lZCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnUmVzZXR0aW5nIHRoZSBsYXN0IHN5bmNlZCBzdGF0ZSBvZiBwcm9maWxlcycpO1xuXHRcdFx0XHRhd2FpdCBwcm9maWxlTWFuaWZlc3RTeW5jaHJvbml6ZXIucmVzZXRMb2NhbCgpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnRGlkIHJlc2V0IHRoZSBsYXN0IHN5bmNlZCBzdGF0ZSBvZiBwcm9maWxlcycpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgVXBkYXRpbmcgcmVtb3RlIHByb2ZpbGVzIHdpdGggaW52YWxpZCBjb2xsZWN0aW9ucyBvbiBzZXJ2ZXJgKTtcblx0XHRcdFx0YXdhaXQgcHJvZmlsZU1hbmlmZXN0U3luY2hyb25pemVyLnVwZGF0ZVJlbW90ZVByb2ZpbGVzKHVwZGF0ZWRSZW1vdGVQcm9maWxlcywgbnVsbCk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBVcGRhdGVkIHJlbW90ZSBwcm9maWxlcyBvbiBzZXJ2ZXJgKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHByb2ZpbGVNYW5pZmVzdFN5bmNocm9uaXplci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2F2ZVJlbW90ZUFjdGl2aXR5RGF0YShsb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jaGVja0VuYWJsZW1lbnQoKTtcblx0XHRjb25zdCBkYXRhID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UuZ2V0QWN0aXZpdHlEYXRhKCk7XG5cdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUobG9jYXRpb24sIGRhdGEpO1xuXHR9XG5cblx0YXN5bmMgZXh0cmFjdEFjdGl2aXR5RGF0YShhY3Rpdml0eURhdGFSZXNvdXJjZTogVVJJLCBsb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udGVudCA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGFjdGl2aXR5RGF0YVJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRjb25zdCBhY3Rpdml0eURhdGE6IElVc2VyRGF0YVN5bmNBY3Rpdml0eURhdGEgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXG5cdFx0aWYgKGFjdGl2aXR5RGF0YS5yZXNvdXJjZXMpIHtcblx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2UgaW4gYWN0aXZpdHlEYXRhLnJlc291cmNlcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHZlcnNpb24gb2YgYWN0aXZpdHlEYXRhLnJlc291cmNlc1tyZXNvdXJjZV0pIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLndyaXRlUmVzb3VyY2UocmVzb3VyY2UgYXMgU3luY1Jlc291cmNlLCB2ZXJzaW9uLmNvbnRlbnQsIG5ldyBEYXRlKHZlcnNpb24uY3JlYXRlZCAqIDEwMDApLCB1bmRlZmluZWQsIGxvY2F0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChhY3Rpdml0eURhdGEuY29sbGVjdGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgY29sbGVjdGlvbiBpbiBhY3Rpdml0eURhdGEuY29sbGVjdGlvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBpbiBhY3Rpdml0eURhdGEuY29sbGVjdGlvbnNbY29sbGVjdGlvbl0ucmVzb3VyY2VzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB2ZXJzaW9uIG9mIGFjdGl2aXR5RGF0YS5jb2xsZWN0aW9uc1tjb2xsZWN0aW9uXS5yZXNvdXJjZXM/LltyZXNvdXJjZV0gPz8gW10pIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2Uud3JpdGVSZXNvdXJjZShyZXNvdXJjZSBhcyBTeW5jUmVzb3VyY2UsIHZlcnNpb24uY29udGVudCwgbmV3IERhdGUodmVyc2lvbi5jcmVhdGVkICogMTAwMCksIGNvbGxlY3Rpb24sIGxvY2F0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHBlcmZvcm1BY3Rpb248VD4ocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSwgYWN0aW9uOiAoc3luY2hyb25pc2VyOiBJVXNlckRhdGFTeW5jaHJvbmlzZXIpID0+IFByb21pc2U8VCB8IHVuZGVmaW5lZD4pOiBQcm9taXNlPFQgfCBudWxsPiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVByb2ZpbGVTeW5jcm9uaXplciA9IHRoaXMuYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMuZ2V0KHByb2ZpbGUuaWQpO1xuXHRcdFx0aWYgKGFjdGl2ZVByb2ZpbGVTeW5jcm9uaXplcikge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBlcmZvcm1BY3Rpb25XaXRoUHJvZmlsZVN5bmNocm9uaXplcihhY3RpdmVQcm9maWxlU3luY3Jvbml6ZXJbMF0sIGFjdGlvbiwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRyZXR1cm4gaXNVbmRlZmluZWQocmVzdWx0KSA/IG51bGwgOiByZXN1bHQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0UHJvZmlsZVN5bmNocm9uaXplciA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb2ZpbGVTeW5jaHJvbml6ZXIsIHByb2ZpbGUsIHVuZGVmaW5lZCkpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBlcmZvcm1BY3Rpb25XaXRoUHJvZmlsZVN5bmNocm9uaXplcihkZWZhdWx0UHJvZmlsZVN5bmNocm9uaXplciwgYWN0aW9uLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdHJldHVybiBpc1VuZGVmaW5lZChyZXN1bHQpID8gbnVsbCA6IHJlc3VsdDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlTWFuaWZlc3RTeW5jaHJvbml6ZXIgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVByb2ZpbGVzTWFuaWZlc3RTeW5jaHJvbmlzZXIsIHByb2ZpbGUsIHVuZGVmaW5lZCkpO1xuXHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5tYW5pZmVzdChudWxsKTtcblx0XHRcdGNvbnN0IHN5bmNQcm9maWxlcyA9IChhd2FpdCB1c2VyRGF0YVByb2ZpbGVNYW5pZmVzdFN5bmNocm9uaXplci5nZXRSZW1vdGVTeW5jZWRQcm9maWxlcyhtYW5pZmVzdD8ubGF0ZXN0Py5wcm9maWxlcyA/PyBudWxsKSkgfHwgW107XG5cdFx0XHRjb25zdCBzeW5jUHJvZmlsZSA9IHN5bmNQcm9maWxlcy5maW5kKHN5bmNQcm9maWxlID0+IHN5bmNQcm9maWxlLmlkID09PSBwcm9maWxlLmlkKTtcblx0XHRcdGlmIChzeW5jUHJvZmlsZSkge1xuXHRcdFx0XHRjb25zdCBwcm9maWxlU3luY2hyb25pemVyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvZmlsZVN5bmNocm9uaXplciwgcHJvZmlsZSwgc3luY1Byb2ZpbGUuY29sbGVjdGlvbikpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBlcmZvcm1BY3Rpb25XaXRoUHJvZmlsZVN5bmNocm9uaXplcihwcm9maWxlU3luY2hyb25pemVyLCBhY3Rpb24sIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0cmV0dXJuIGlzVW5kZWZpbmVkKHJlc3VsdCkgPyBudWxsIDogcmVzdWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcGVyZm9ybUFjdGlvbldpdGhQcm9maWxlU3luY2hyb25pemVyPFQ+KHByb2ZpbGVTeW5jaHJvbml6ZXI6IFByb2ZpbGVTeW5jaHJvbml6ZXIsIGFjdGlvbjogKHN5bmNocm9uaXNlcjogSVVzZXJEYXRhU3luY2hyb25pc2VyKSA9PiBQcm9taXNlPFQgfCB1bmRlZmluZWQ+LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogUHJvbWlzZTxUIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWxsU3luY2hyb25pemVycyA9IFsuLi5wcm9maWxlU3luY2hyb25pemVyLmVuYWJsZWQsIC4uLnByb2ZpbGVTeW5jaHJvbml6ZXIuZGlzYWJsZWQucmVkdWNlPChJVXNlckRhdGFTeW5jaHJvbmlzZXIgJiBJRGlzcG9zYWJsZSlbXT4oKHN5bmNocm9uaXplcnMsIHN5bmNSZXNvdXJjZSkgPT4ge1xuXHRcdFx0aWYgKHN5bmNSZXNvdXJjZSAhPT0gU3luY1Jlc291cmNlLldvcmtzcGFjZVN0YXRlKSB7XG5cdFx0XHRcdHN5bmNocm9uaXplcnMucHVzaChkaXNwb3NhYmxlcy5hZGQocHJvZmlsZVN5bmNocm9uaXplci5jcmVhdGVTeW5jaHJvbml6ZXIoc3luY1Jlc291cmNlKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHN5bmNocm9uaXplcnM7XG5cdFx0fSwgW10pXTtcblx0XHRmb3IgKGNvbnN0IHN5bmNocm9uaXplciBvZiBhbGxTeW5jaHJvbml6ZXJzKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhY3Rpb24oc3luY2hyb25pemVyKTtcblx0XHRcdGlmICghaXNVbmRlZmluZWQocmVzdWx0KSkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRTdGF0dXMoc3RhdHVzOiBTeW5jU3RhdHVzKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2xkU3RhdHVzID0gdGhpcy5fc3RhdHVzO1xuXHRcdGlmICh0aGlzLl9zdGF0dXMgIT09IHN0YXR1cykge1xuXHRcdFx0dGhpcy5fc3RhdHVzID0gc3RhdHVzO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0dXMuZmlyZShzdGF0dXMpO1xuXHRcdFx0aWYgKG9sZFN0YXR1cyA9PT0gU3luY1N0YXR1cy5IYXNDb25mbGljdHMpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVMYXN0U3luY1RpbWUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbmZsaWN0cygpOiB2b2lkIHtcblx0XHRjb25zdCBjb25mbGljdHMgPSB0aGlzLmdldEFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXJzKCkubWFwKHN5bmNocm9uaXplciA9PiBzeW5jaHJvbml6ZXIuY29uZmxpY3RzKS5mbGF0KCk7XG5cdFx0aWYgKCFlcXVhbHModGhpcy5fY29uZmxpY3RzLCBjb25mbGljdHMsIChhLCBiKSA9PiBhLnByb2ZpbGUuaWQgPT09IGIucHJvZmlsZS5pZCAmJiBhLnN5bmNSZXNvdXJjZSA9PT0gYi5zeW5jUmVzb3VyY2UgJiYgZXF1YWxzKGEuY29uZmxpY3RzLCBiLmNvbmZsaWN0cywgKGEsIGIpID0+IGlzRXF1YWwoYS5wcmV2aWV3UmVzb3VyY2UsIGIucHJldmlld1Jlc291cmNlKSkpKSB7XG5cdFx0XHR0aGlzLl9jb25mbGljdHMgPSBjb25mbGljdHM7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZsaWN0cy5maXJlKGNvbmZsaWN0cyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVMYXN0U3luY1RpbWUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3RhdHVzID09PSBTeW5jU3RhdHVzLklkbGUpIHtcblx0XHRcdHRoaXMuX2xhc3RTeW5jVGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShMQVNUX1NZTkNfVElNRV9LRVksIHRoaXMuX2xhc3RTeW5jVGltZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMYXN0U3luY1RpbWUuZmlyZSh0aGlzLl9sYXN0U3luY1RpbWUpO1xuXHRcdH1cblx0fVxuXG5cdGdldE9yQ3JlYXRlQWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcihwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLCBzeW5jUHJvZmlsZTogSVN5bmNVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQpOiBQcm9maWxlU3luY2hyb25pemVyIHtcblx0XHRsZXQgYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplciA9IHRoaXMuYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMuZ2V0KHByb2ZpbGUuaWQpO1xuXHRcdGlmIChhY3RpdmVQcm9maWxlU3luY2hyb25pemVyICYmIGFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXJbMF0uY29sbGVjdGlvbiAhPT0gc3luY1Byb2ZpbGU/LmNvbGxlY3Rpb24pIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignUHJvZmlsZSBzeW5jaHJvbml6ZXIgY29sbGVjdGlvbiBkb2VzIG5vdCBtYXRjaCB3aXRoIHRoZSByZW1vdGUgc3luYyBwcm9maWxlIGNvbGxlY3Rpb24nKTtcblx0XHRcdGFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXJbMV0uZGlzcG9zZSgpO1xuXHRcdFx0YWN0aXZlUHJvZmlsZVN5bmNocm9uaXplciA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMuZGVsZXRlKHByb2ZpbGUuaWQpO1xuXHRcdH1cblx0XHRpZiAoIWFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXIpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgcHJvZmlsZVN5bmNocm9uaXplciA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb2ZpbGVTeW5jaHJvbml6ZXIsIHByb2ZpbGUsIHN5bmNQcm9maWxlPy5jb2xsZWN0aW9uKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvZmlsZVN5bmNocm9uaXplci5vbkRpZENoYW5nZVN0YXR1cyhlID0+IHRoaXMuc2V0U3RhdHVzKGUpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvZmlsZVN5bmNocm9uaXplci5vbkRpZENoYW5nZUNvbmZsaWN0cyhjb25mbGljdHMgPT4gdGhpcy51cGRhdGVDb25mbGljdHMoKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb2ZpbGVTeW5jaHJvbml6ZXIub25EaWRDaGFuZ2VMb2NhbChlID0+IHRoaXMuX29uRGlkQ2hhbmdlTG9jYWwuZmlyZShlKSkpO1xuXHRcdFx0dGhpcy5hY3RpdmVQcm9maWxlU3luY2hyb25pemVycy5zZXQocHJvZmlsZS5pZCwgYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplciA9IFtwcm9maWxlU3luY2hyb25pemVyLCBkaXNwb3NhYmxlc10pO1xuXHRcdH1cblx0XHRyZXR1cm4gYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplclswXTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMoKTogUHJvZmlsZVN5bmNocm9uaXplcltdIHtcblx0XHRjb25zdCBwcm9maWxlU3luY2hyb25pemVyczogUHJvZmlsZVN5bmNocm9uaXplcltdID0gW107XG5cdFx0Zm9yIChjb25zdCBbcHJvZmlsZVN5bmNocm9uaXplcl0gb2YgdGhpcy5hY3RpdmVQcm9maWxlU3luY2hyb25pemVycy52YWx1ZXMoKSkge1xuXHRcdFx0cHJvZmlsZVN5bmNocm9uaXplcnMucHVzaChwcm9maWxlU3luY2hyb25pemVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb2ZpbGVTeW5jaHJvbml6ZXJzO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuYWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcnMuZm9yRWFjaCgoWywgZGlzcG9zYWJsZV0pID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblx0XHR0aGlzLmFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXJzLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIGNoZWNrRW5hYmxlbWVudCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOb3QgZW5hYmxlZCcpO1xuXHRcdH1cblx0fVxuXG59XG5cblxuY2xhc3MgUHJvZmlsZVN5bmNocm9uaXplciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX2VuYWJsZWQ6IFtJVXNlckRhdGFTeW5jaHJvbmlzZXIsIG51bWJlciwgSURpc3Bvc2FibGVdW10gPSBbXTtcblx0Z2V0IGVuYWJsZWQoKTogSVVzZXJEYXRhU3luY2hyb25pc2VyW10geyByZXR1cm4gdGhpcy5fZW5hYmxlZC5zb3J0KChhLCBiKSA9PiBhWzFdIC0gYlsxXSkubWFwKChbc3luY2hyb25pemVyXSkgPT4gc3luY2hyb25pemVyKTsgfVxuXG5cdGdldCBkaXNhYmxlZCgpOiBTeW5jUmVzb3VyY2VbXSB7IHJldHVybiBBTExfU1lOQ19SRVNPVVJDRVMuZmlsdGVyKHN5bmNSZXNvdXJjZSA9PiAhdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc1Jlc291cmNlRW5hYmxlZChzeW5jUmVzb3VyY2UpKTsgfVxuXG5cdHByaXZhdGUgX3N0YXR1czogU3luY1N0YXR1cyA9IFN5bmNTdGF0dXMuSWRsZTtcblx0Z2V0IHN0YXR1cygpOiBTeW5jU3RhdHVzIHsgcmV0dXJuIHRoaXMuX3N0YXR1czsgfVxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVN0YXR1czogRW1pdHRlcjxTeW5jU3RhdHVzPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFN5bmNTdGF0dXM+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVN0YXR1czogRXZlbnQ8U3luY1N0YXR1cz4gPSB0aGlzLl9vbkRpZENoYW5nZVN0YXR1cy5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUxvY2FsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U3luY1Jlc291cmNlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMb2NhbCA9IHRoaXMuX29uRGlkQ2hhbmdlTG9jYWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfY29uZmxpY3RzOiBJVXNlckRhdGFTeW5jUmVzb3VyY2VDb25mbGljdHNbXSA9IFtdO1xuXHRnZXQgY29uZmxpY3RzKCk6IElVc2VyRGF0YVN5bmNSZXNvdXJjZUNvbmZsaWN0c1tdIHsgcmV0dXJuIHRoaXMuX2NvbmZsaWN0czsgfVxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUNvbmZsaWN0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElVc2VyRGF0YVN5bmNSZXNvdXJjZUNvbmZsaWN0c1tdPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb25mbGljdHMgPSB0aGlzLl9vbkRpZENoYW5nZUNvbmZsaWN0cy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLFxuXHRcdHJlYWRvbmx5IGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5vbkRpZENoYW5nZVJlc291cmNlRW5hYmxlbWVudCgoW3N5bmNSZXNvdXJjZSwgZW5hYmxlbWVudF0pID0+IHRoaXMub25EaWRDaGFuZ2VSZXNvdXJjZUVuYWJsZW1lbnQoc3luY1Jlc291cmNlLCBlbmFibGVtZW50KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9lbmFibGVkLnNwbGljZSgwLCB0aGlzLl9lbmFibGVkLmxlbmd0aCkuZm9yRWFjaCgoWywgLCBkaXNwb3NhYmxlXSkgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkpKSk7XG5cdFx0Zm9yIChjb25zdCBzeW5jUmVzb3VyY2Ugb2YgQUxMX1NZTkNfUkVTT1VSQ0VTKSB7XG5cdFx0XHRpZiAodXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNSZXNvdXJjZUVuYWJsZWQoc3luY1Jlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyU3luY2hyb25pemVyKHN5bmNSZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVJlc291cmNlRW5hYmxlbWVudChzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZSwgZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChlbmFibGVkKSB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyU3luY2hyb25pemVyKHN5bmNSZXNvdXJjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZGVSZWdpc3RlclN5bmNocm9uaXplcihzeW5jUmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCByZWdpc3RlclN5bmNocm9uaXplcihzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9lbmFibGVkLnNvbWUoKFtzeW5jaHJvbml6ZXJdKSA9PiBzeW5jaHJvbml6ZXIucmVzb3VyY2UgPT09IHN5bmNSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHN5bmNSZXNvdXJjZSA9PT0gU3luY1Jlc291cmNlLkV4dGVuc2lvbnMgJiYgIXRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTa2lwcGluZyBleHRlbnNpb25zIHN5bmMgYmVjYXVzZSBnYWxsZXJ5IGlzIG5vdCBjb25maWd1cmVkJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChzeW5jUmVzb3VyY2UgPT09IFN5bmNSZXNvdXJjZS5Qcm9maWxlcykge1xuXHRcdFx0aWYgKCF0aGlzLnByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHN5bmNSZXNvdXJjZSA9PT0gU3luY1Jlc291cmNlLldvcmtzcGFjZVN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChzeW5jUmVzb3VyY2UgIT09IFN5bmNSZXNvdXJjZS5Qcm9maWxlcyAmJiB0aGlzLnByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy5bc3luY1Jlc291cmNlXSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBTa2lwcGluZyBzeW5jaW5nICR7c3luY1Jlc291cmNlfSBpbiAke3RoaXMucHJvZmlsZS5uYW1lfSBiZWNhdXNlIGl0IGlzIGFscmVhZHkgc3luY2VkIGJ5IGRlZmF1bHQgcHJvZmlsZWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBzeW5jaHJvbml6ZXIgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5jcmVhdGVTeW5jaHJvbml6ZXIoc3luY1Jlc291cmNlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN5bmNocm9uaXplci5vbkRpZENoYW5nZVN0YXR1cygoKSA9PiB0aGlzLnVwZGF0ZVN0YXR1cygpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN5bmNocm9uaXplci5vbkRpZENoYW5nZUNvbmZsaWN0cygoKSA9PiB0aGlzLnVwZGF0ZUNvbmZsaWN0cygpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN5bmNocm9uaXplci5vbkRpZENoYW5nZUxvY2FsKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlTG9jYWwuZmlyZShzeW5jUmVzb3VyY2UpKSk7XG5cdFx0Y29uc3Qgb3JkZXIgPSB0aGlzLmdldE9yZGVyKHN5bmNSZXNvdXJjZSk7XG5cdFx0dGhpcy5fZW5hYmxlZC5wdXNoKFtzeW5jaHJvbml6ZXIsIG9yZGVyLCBkaXNwb3NhYmxlc10pO1xuXHR9XG5cblx0cHJpdmF0ZSBkZVJlZ2lzdGVyU3luY2hyb25pemVyKHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9lbmFibGVkLmZpbmRJbmRleCgoW3N5bmNocm9uaXplcl0pID0+IHN5bmNocm9uaXplci5yZXNvdXJjZSA9PT0gc3luY1Jlc291cmNlKTtcblx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRjb25zdCBbW3N5bmNocm9uaXplciwgLCBkaXNwb3NhYmxlXV0gPSB0aGlzLl9lbmFibGVkLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKCk7XG5cdFx0XHRzeW5jaHJvbml6ZXIuc3RvcCgpLnRoZW4obnVsbCwgZXJyb3IgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKSk7XG5cdFx0fVxuXHR9XG5cblx0Y3JlYXRlU3luY2hyb25pemVyKHN5bmNSZXNvdXJjZTogRXhjbHVkZTxTeW5jUmVzb3VyY2UsIFN5bmNSZXNvdXJjZS5Xb3Jrc3BhY2VTdGF0ZT4pOiBJVXNlckRhdGFTeW5jaHJvbmlzZXIgJiBJRGlzcG9zYWJsZSB7XG5cdFx0c3dpdGNoIChzeW5jUmVzb3VyY2UpIHtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlNldHRpbmdzOiByZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nc1N5bmNocm9uaXNlciwgdGhpcy5wcm9maWxlLCB0aGlzLmNvbGxlY3Rpb24pO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3M6IHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEtleWJpbmRpbmdzU3luY2hyb25pc2VyLCB0aGlzLnByb2ZpbGUsIHRoaXMuY29sbGVjdGlvbik7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5TbmlwcGV0czogcmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldHNTeW5jaHJvbmlzZXIsIHRoaXMucHJvZmlsZSwgdGhpcy5jb2xsZWN0aW9uKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlByb21wdHM6IHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdHNTeW5jaHJvbml6ZXIsIHRoaXMucHJvZmlsZSwgdGhpcy5jb2xsZWN0aW9uKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlRhc2tzOiByZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYXNrc1N5bmNocm9uaXNlciwgdGhpcy5wcm9maWxlLCB0aGlzLmNvbGxlY3Rpb24pO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuTWNwOiByZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BTeW5jaHJvbmlzZXIsIHRoaXMucHJvZmlsZSwgdGhpcy5jb2xsZWN0aW9uKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlOiByZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShHbG9iYWxTdGF0ZVN5bmNocm9uaXNlciwgdGhpcy5wcm9maWxlLCB0aGlzLmNvbGxlY3Rpb24pO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuRXh0ZW5zaW9uczogcmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc1N5bmNocm9uaXNlciwgdGhpcy5wcm9maWxlLCB0aGlzLmNvbGxlY3Rpb24pO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuUHJvZmlsZXM6IHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhUHJvZmlsZXNNYW5pZmVzdFN5bmNocm9uaXNlciwgdGhpcy5wcm9maWxlLCB0aGlzLmNvbGxlY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN5bmMobWFuaWZlc3RPckxhdGVzdERhdGE6IElVc2VyRGF0YU1hbmlmZXN0IHwgSVVzZXJEYXRhU3luY0xhdGVzdERhdGEgfCBudWxsLCBwcmV2aWV3OiBib29sZWFuLCBleGVjdXRpb25JZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFtTeW5jUmVzb3VyY2UsIFVzZXJEYXRhU3luY0Vycm9yXVtdPiB7XG5cblx0XHQvLyBSZXR1cm4gaWYgY2FuY2VsbGF0aW9uIGlzIHJlcXVlc3RlZFxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN5bmNocm9uaXplcnMgPSB0aGlzLmVuYWJsZWQ7XG5cdFx0aWYgKCFzeW5jaHJvbml6ZXJzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzeW5jRXJyb3JzOiBbU3luY1Jlc291cmNlLCBVc2VyRGF0YVN5bmNFcnJvcl1bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc3luY0hlYWRlcnMgPSBjcmVhdGVTeW5jSGVhZGVycyhleGVjdXRpb25JZCk7XG5cdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNDb25maWd1cmF0aW9uID0gcHJldmlldyA/IGF3YWl0IHRoaXMuZ2V0VXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbihtYW5pZmVzdE9yTGF0ZXN0RGF0YSkgOiB0aGlzLmdldExvY2FsVXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0Zm9yIChjb25zdCBzeW5jaHJvbmlzZXIgb2Ygc3luY2hyb25pemVycykge1xuXHRcdFx0XHQvLyBSZXR1cm4gaWYgY2FuY2VsbGF0aW9uIGlzIHJlcXVlc3RlZFxuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZXR1cm4gaWYgcmVzb3VyY2UgaXMgbm90IGVuYWJsZWRcblx0XHRcdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzUmVzb3VyY2VFbmFibGVkKHN5bmNocm9uaXNlci5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJlZk9yVXNlckRhdGEgPSBnZXRSZWZPclVzZXJEYXRhKG1hbmlmZXN0T3JMYXRlc3REYXRhLCB0aGlzLmNvbGxlY3Rpb24sIHN5bmNocm9uaXNlci5yZXNvdXJjZSkgPz8gbnVsbDtcblx0XHRcdFx0XHRhd2FpdCBzeW5jaHJvbmlzZXIuc3luYyhyZWZPclVzZXJEYXRhLCBwcmV2aWV3LCB1c2VyRGF0YVN5bmNDb25maWd1cmF0aW9uLCBzeW5jSGVhZGVycyk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNFcnJvciA9IFVzZXJEYXRhU3luY0Vycm9yLnRvVXNlckRhdGFTeW5jRXJyb3IoZSk7XG5cdFx0XHRcdFx0cmVwb3J0VXNlckRhdGFTeW5jRXJyb3IodXNlckRhdGFTeW5jRXJyb3IsIGV4ZWN1dGlvbklkLCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsIHRoaXMudGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0XHRcdFx0aWYgKGNhbkJhaWxvdXQoZSkpIHtcblx0XHRcdFx0XHRcdHRocm93IHVzZXJEYXRhU3luY0Vycm9yO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIExvZyBhbmQgYW5kIGNvbnRpbnVlXG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgJHtzeW5jaHJvbmlzZXIucmVzb3VyY2V9OiAke3RvRXJyb3JNZXNzYWdlKGUpfWApO1xuXHRcdFx0XHRcdHN5bmNFcnJvcnMucHVzaChbc3luY2hyb25pc2VyLnJlc291cmNlLCB1c2VyRGF0YVN5bmNFcnJvcl0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBzeW5jRXJyb3JzO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cygpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFwcGx5KGV4ZWN1dGlvbklkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN5bmNIZWFkZXJzID0gY3JlYXRlU3luY0hlYWRlcnMoZXhlY3V0aW9uSWQpO1xuXHRcdGZvciAoY29uc3Qgc3luY2hyb25pc2VyIG9mIHRoaXMuZW5hYmxlZCkge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHN5bmNocm9uaXNlci5hcHBseShmYWxzZSwgc3luY0hlYWRlcnMpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNFcnJvciA9IFVzZXJEYXRhU3luY0Vycm9yLnRvVXNlckRhdGFTeW5jRXJyb3IoZSk7XG5cdFx0XHRcdHJlcG9ydFVzZXJEYXRhU3luY0Vycm9yKHVzZXJEYXRhU3luY0Vycm9yLCBleGVjdXRpb25JZCwgdGhpcy51c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLCB0aGlzLnRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdFx0XHRpZiAoY2FuQmFpbG91dChlKSkge1xuXHRcdFx0XHRcdHRocm93IHVzZXJEYXRhU3luY0Vycm9yO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTG9nIGFuZCBhbmQgY29udGludWVcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYCR7c3luY2hyb25pc2VyLnJlc291cmNlfTogJHt0b0Vycm9yTWVzc2FnZShlKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdG9wKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3Qgc3luY2hyb25pc2VyIG9mIHRoaXMuZW5hYmxlZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKHN5bmNocm9uaXNlci5zdGF0dXMgIT09IFN5bmNTdGF0dXMuSWRsZSkge1xuXHRcdFx0XHRcdGF3YWl0IHN5bmNocm9uaXNlci5zdG9wKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc2V0TG9jYWwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBzeW5jaHJvbmlzZXIgb2YgdGhpcy5lbmFibGVkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBzeW5jaHJvbmlzZXIucmVzZXRMb2NhbCgpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYCR7c3luY2hyb25pc2VyLnJlc291cmNlfTogJHt0b0Vycm9yTWVzc2FnZShlKX1gKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VXNlckRhdGFTeW5jQ29uZmlndXJhdGlvbihtYW5pZmVzdE9yTGF0ZXN0RGF0YTogSVVzZXJEYXRhTWFuaWZlc3QgfCBJVXNlckRhdGFTeW5jTGF0ZXN0RGF0YSB8IG51bGwpOiBQcm9taXNlPElVc2VyRGF0YVN5bmNDb25maWd1cmF0aW9uPiB7XG5cdFx0aWYgKCF0aGlzLnByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdGNvbnN0IGxvY2FsID0gdGhpcy5nZXRMb2NhbFVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24oKTtcblx0XHRjb25zdCBzZXR0aW5nc1N5bmNocm9uaXplciA9IHRoaXMuZW5hYmxlZC5maW5kKHN5bmNocm9uaXplciA9PiBzeW5jaHJvbml6ZXIgaW5zdGFuY2VvZiBTZXR0aW5nc1N5bmNocm9uaXNlcik7XG5cdFx0aWYgKHNldHRpbmdzU3luY2hyb25pemVyKSB7XG5cdFx0XHRjb25zdCByZW1vdGUgPSBhd2FpdCBzZXR0aW5nc1N5bmNocm9uaXplci5nZXRSZW1vdGVVc2VyRGF0YVN5bmNDb25maWd1cmF0aW9uKGdldFJlZk9yVXNlckRhdGEobWFuaWZlc3RPckxhdGVzdERhdGEsIHRoaXMuY29sbGVjdGlvbiwgU3luY1Jlc291cmNlLlNldHRpbmdzKSA/PyBudWxsKTtcblx0XHRcdHJldHVybiB7IC4uLmxvY2FsLCAuLi5yZW1vdGUgfTtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRMb2NhbFVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24oKTogSVVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFVTRVJfREFUQV9TWU5DX0NPTkZJR1VSQVRJT05fU0NPUEUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRTdGF0dXMoc3RhdHVzOiBTeW5jU3RhdHVzKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXR1cyAhPT0gc3RhdHVzKSB7XG5cdFx0XHR0aGlzLl9zdGF0dXMgPSBzdGF0dXM7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXR1cy5maXJlKHN0YXR1cyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGF0dXMoKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVDb25mbGljdHMoKTtcblx0XHRpZiAodGhpcy5lbmFibGVkLnNvbWUocyA9PiBzLnN0YXR1cyA9PT0gU3luY1N0YXR1cy5IYXNDb25mbGljdHMpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZXRTdGF0dXMoU3luY1N0YXR1cy5IYXNDb25mbGljdHMpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5lbmFibGVkLnNvbWUocyA9PiBzLnN0YXR1cyA9PT0gU3luY1N0YXR1cy5TeW5jaW5nKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2V0U3RhdHVzKFN5bmNTdGF0dXMuU3luY2luZyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnNldFN0YXR1cyhTeW5jU3RhdHVzLklkbGUpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb25mbGljdHMoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmxpY3RzID0gdGhpcy5lbmFibGVkLmZpbHRlcihzID0+IHMuc3RhdHVzID09PSBTeW5jU3RhdHVzLkhhc0NvbmZsaWN0cylcblx0XHRcdC5maWx0ZXIocyA9PiBzLmNvbmZsaWN0cy5jb25mbGljdHMubGVuZ3RoID4gMClcblx0XHRcdC5tYXAocyA9PiBzLmNvbmZsaWN0cyk7XG5cdFx0aWYgKCFlcXVhbHModGhpcy5fY29uZmxpY3RzLCBjb25mbGljdHMsIChhLCBiKSA9PiBhLnN5bmNSZXNvdXJjZSA9PT0gYi5zeW5jUmVzb3VyY2UgJiYgZXF1YWxzKGEuY29uZmxpY3RzLCBiLmNvbmZsaWN0cywgKGEsIGIpID0+IGlzRXF1YWwoYS5wcmV2aWV3UmVzb3VyY2UsIGIucHJldmlld1Jlc291cmNlKSkpKSB7XG5cdFx0XHR0aGlzLl9jb25mbGljdHMgPSBjb25mbGljdHM7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZsaWN0cy5maXJlKGNvbmZsaWN0cyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRPcmRlcihzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZSk6IG51bWJlciB7XG5cdFx0c3dpdGNoIChzeW5jUmVzb3VyY2UpIHtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlNldHRpbmdzOiByZXR1cm4gMDtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLktleWJpbmRpbmdzOiByZXR1cm4gMTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlNuaXBwZXRzOiByZXR1cm4gMjtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlRhc2tzOiByZXR1cm4gMztcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLk1jcDogcmV0dXJuIDQ7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZTogcmV0dXJuIDU7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5FeHRlbnNpb25zOiByZXR1cm4gNjtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlByb21wdHM6IHJldHVybiA3O1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuUHJvZmlsZXM6IHJldHVybiA4O1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuV29ya3NwYWNlU3RhdGU6IHJldHVybiA5O1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBjYW5CYWlsb3V0KGU6IHVua25vd24pOiBib29sZWFuIHtcblx0aWYgKGUgaW5zdGFuY2VvZiBVc2VyRGF0YVN5bmNFcnJvcikge1xuXHRcdHN3aXRjaCAoZS5jb2RlKSB7XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5NZXRob2ROb3RGb3VuZDpcblx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlRvb0xhcmdlOlxuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVG9vTWFueVJlcXVlc3RzOlxuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVG9vTWFueVJlcXVlc3RzQW5kUmV0cnlBZnRlcjpcblx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkxvY2FsVG9vTWFueVJlcXVlc3RzOlxuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTG9jYWxUb29NYW55UHJvZmlsZXM6XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Hb25lOlxuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVXBncmFkZVJlcXVpcmVkOlxuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuSW5jb21wYXRpYmxlUmVtb3RlQ29udGVudDpcblx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkluY29tcGF0aWJsZUxvY2FsQ29udGVudDpcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gcmVwb3J0VXNlckRhdGFTeW5jRXJyb3IodXNlckRhdGFTeW5jRXJyb3I6IFVzZXJEYXRhU3luY0Vycm9yLCBleGVjdXRpb25JZDogc3RyaW5nLCB1c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UpOiB2b2lkIHtcblx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFN5bmNFcnJvckV2ZW50LCBTeW5jRXJyb3JDbGFzc2lmaWNhdGlvbj4oJ3N5bmMvZXJyb3InLFxuXHRcdHtcblx0XHRcdGNvZGU6IHVzZXJEYXRhU3luY0Vycm9yLmNvZGUsXG5cdFx0XHRzZXJ2ZXJDb2RlOiB1c2VyRGF0YVN5bmNFcnJvciBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY1N0b3JlRXJyb3IgPyBTdHJpbmcodXNlckRhdGFTeW5jRXJyb3Iuc2VydmVyQ29kZSkgOiB1bmRlZmluZWQsXG5cdFx0XHR1cmw6IHVzZXJEYXRhU3luY0Vycm9yIGluc3RhbmNlb2YgVXNlckRhdGFTeW5jU3RvcmVFcnJvciA/IHVzZXJEYXRhU3luY0Vycm9yLnVybCA6IHVuZGVmaW5lZCxcblx0XHRcdHJlc291cmNlOiB1c2VyRGF0YVN5bmNFcnJvci5yZXNvdXJjZSxcblx0XHRcdGV4ZWN1dGlvbklkLFxuXHRcdFx0c2VydmljZTogdXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZSEudXJsLnRvU3RyaW5nKClcblx0XHR9KTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVmT3JVc2VyRGF0YShtYW5pZmVzdE9yTGF0ZXN0RGF0YTogSVVzZXJEYXRhTWFuaWZlc3QgfCBJVXNlckRhdGFTeW5jTGF0ZXN0RGF0YSB8IG51bGwsIGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVzb3VyY2U6IFN5bmNSZXNvdXJjZSk6IHN0cmluZyB8IElVc2VyRGF0YSB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc1VzZXJEYXRhTWFuaWZlc3QobWFuaWZlc3RPckxhdGVzdERhdGEpKSB7XG5cdFx0aWYgKGNvbGxlY3Rpb24pIHtcblx0XHRcdHJldHVybiBtYW5pZmVzdE9yTGF0ZXN0RGF0YT8uY29sbGVjdGlvbnM/Lltjb2xsZWN0aW9uXT8ubGF0ZXN0Py5bcmVzb3VyY2VdO1xuXHRcdH1cblx0XHRyZXR1cm4gbWFuaWZlc3RPckxhdGVzdERhdGE/LmxhdGVzdD8uW3Jlc291cmNlXTtcblx0fVxuXHRpZiAoY29sbGVjdGlvbikge1xuXHRcdHJldHVybiBtYW5pZmVzdE9yTGF0ZXN0RGF0YT8uY29sbGVjdGlvbnM/Lltjb2xsZWN0aW9uXT8ucmVzb3VyY2VzPy5bcmVzb3VyY2VdO1xuXHR9XG5cdHJldHVybiBtYW5pZmVzdE9yTGF0ZXN0RGF0YT8ucmVzb3VyY2VzPy5bcmVzb3VyY2VdO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGNBQWM7QUFDdkIsU0FBNEIseUJBQXlCLHdCQUF3QjtBQUM3RSxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXLG1CQUFtQjtBQUV2QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUEyQixnQ0FBZ0M7QUFDM0QsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0Q0FBNEM7QUFDckQ7QUFBQSxFQUNDO0FBQUEsRUFBb0I7QUFBQSxFQUVwQjtBQUFBLEVBQXVEO0FBQUEsRUFBK0M7QUFBQSxFQUFxQztBQUFBLEVBQzNJO0FBQUEsRUFBYztBQUFBLEVBQVk7QUFBQSxFQUFtQjtBQUFBLEVBQXVCO0FBQUEsRUFBd0I7QUFBQSxF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QUEsTUFDbkMsS0FBSyxhQUFhO0FBQU8sZUFBTztBQUFBLE1BQ2hDLEtBQUssYUFBYTtBQUFLLGVBQU87QUFBQSxNQUM5QixLQUFLLGFBQWE7QUFBYSxlQUFPO0FBQUEsTUFDdEMsS0FBSyxhQUFhO0FBQVksZUFBTztBQUFBLE1BQ3JDLEtBQUssYUFBYTtBQUFTLGVBQU87QUFBQSxNQUNsQyxLQUFLLGFBQWE7QUFBVSxlQUFPO0FBQUEsTUFDbkMsS0FBSyxhQUFhO0FBQWdCLGVBQU87QUFBQSxJQUMxQztBQUFBLEVBQ0Q7QUFDRDtBQWhRTSxzQkFBTjtBQUFBLEVBdUJHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0E3Qkc7QUFrUU4sU0FBUyxXQUFXLEdBQXFCO0FBQ3hDLE1BQUksYUFBYSxtQkFBbUI7QUFDbkMsWUFBUSxFQUFFLE1BQU07QUFBQSxNQUNmLEtBQUssc0JBQXNCO0FBQUEsTUFDM0IsS0FBSyxzQkFBc0I7QUFBQSxNQUMzQixLQUFLLHNCQUFzQjtBQUFBLE1BQzNCLEtBQUssc0JBQXNCO0FBQUEsTUFDM0IsS0FBSyxzQkFBc0I7QUFBQSxNQUMzQixLQUFLLHNCQUFzQjtBQUFBLE1BQzNCLEtBQUssc0JBQXNCO0FBQUEsTUFDM0IsS0FBSyxzQkFBc0I7QUFBQSxNQUMzQixLQUFLLHNCQUFzQjtBQUFBLE1BQzNCLEtBQUssc0JBQXNCO0FBQzFCLGVBQU87QUFBQSxJQUNUO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsd0JBQXdCLG1CQUFzQyxhQUFxQixvQ0FBeUUsa0JBQTJDO0FBQy9NLG1CQUFpQjtBQUFBLElBQW9EO0FBQUEsSUFDcEU7QUFBQSxNQUNDLE1BQU0sa0JBQWtCO0FBQUEsTUFDeEIsWUFBWSw2QkFBNkIseUJBQXlCLE9BQU8sa0JBQWtCLFVBQVUsSUFBSTtBQUFBLE1BQ3pHLEtBQUssNkJBQTZCLHlCQUF5QixrQkFBa0IsTUFBTTtBQUFBLE1BQ25GLFVBQVUsa0JBQWtCO0FBQUEsTUFDNUI7QUFBQSxNQUNBLFNBQVMsbUNBQW1DLGtCQUFtQixJQUFJLFNBQVM7QUFBQSxJQUM3RTtBQUFBLEVBQUM7QUFDSDtBQUVBLFNBQVMsaUJBQWlCLHNCQUEwRSxZQUFnQyxVQUF3RDtBQUMzTCxNQUFJLG1CQUFtQixvQkFBb0IsR0FBRztBQUM3QyxRQUFJLFlBQVk7QUFDZixhQUFPLHNCQUFzQixjQUFjLFVBQVUsR0FBRyxTQUFTLFFBQVE7QUFBQSxJQUMxRTtBQUNBLFdBQU8sc0JBQXNCLFNBQVMsUUFBUTtBQUFBLEVBQy9DO0FBQ0EsTUFBSSxZQUFZO0FBQ2YsV0FBTyxzQkFBc0IsY0FBYyxVQUFVLEdBQUcsWUFBWSxRQUFRO0FBQUEsRUFDN0U7QUFDQSxTQUFPLHNCQUFzQixZQUFZLFFBQVE7QUFDbEQ7IiwKICAibmFtZXMiOiBbImVycm9yIiwgInVzZXJEYXRhU3luY0Vycm9yIiwgImNvbnRlbnQiLCAic3luY1Byb2ZpbGUiLCAiYSIsICJiIiwgInN5bmNocm9uaXplciJdCn0K
