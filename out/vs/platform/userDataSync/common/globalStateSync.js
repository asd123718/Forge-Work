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
import { VSBuffer } from "../../../base/common/buffer.js";
import { getErrorMessage } from "../../../base/common/errors.js";
import { Event } from "../../../base/common/event.js";
import { parse } from "../../../base/common/json.js";
import { toFormattedString } from "../../../base/common/jsonFormatter.js";
import { isWeb } from "../../../base/common/platform.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { getServiceMachineId } from "../../externalServices/common/serviceMachineId.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { AbstractInitializer, AbstractSynchroniser, getSyncResourceLogLabel, isSyncData } from "./abstractSynchronizer.js";
import { edit } from "./content.js";
import { merge } from "./globalStateMerge.js";
import { ALL_SYNC_RESOURCES, Change, createSyncHeaders, getEnablementKey, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, SYNC_SERVICE_URL_TYPE, UserDataSyncError, UserDataSyncErrorCode, USER_DATA_SYNC_SCHEME } from "./userDataSync.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { IUserDataProfileStorageService } from "../../userDataProfile/common/userDataProfileStorageService.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
const argvStoragePrefx = "globalState.argv.";
const argvProperties = ["locale"];
function stringify(globalState, format) {
  const storageKeys = globalState.storage ? Object.keys(globalState.storage).sort() : [];
  const storage = {};
  storageKeys.forEach((key) => storage[key] = globalState.storage[key]);
  globalState.storage = storage;
  return format ? toFormattedString(globalState, {}) : JSON.stringify(globalState);
}
const GLOBAL_STATE_DATA_VERSION = 1;
let GlobalStateSynchroniser = class extends AbstractSynchroniser {
  constructor(profile, collection, userDataProfileStorageService, fileService, userDataSyncStoreService, userDataSyncLocalStoreService, logService, environmentService, userDataSyncEnablementService, telemetryService, configurationService, storageService, uriIdentityService, instantiationService) {
    super({ syncResource: SyncResource.GlobalState, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
    this.userDataProfileStorageService = userDataProfileStorageService;
    this.version = GLOBAL_STATE_DATA_VERSION;
    this.previewResource = this.extUri.joinPath(this.syncPreviewFolder, "globalState.json");
    this.baseResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" });
    this.localResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" });
    this.remoteResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" });
    this.acceptedResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" });
    this.localGlobalStateProvider = instantiationService.createInstance(LocalGlobalStateProvider);
    this._register(fileService.watch(this.extUri.dirname(this.environmentService.argvResource)));
    this._register(
      Event.any(
        /* Locale change */
        Event.filter(fileService.onDidFilesChange, (e) => e.contains(this.environmentService.argvResource)),
        Event.filter(userDataProfileStorageService.onDidChange, (e) => {
          if (e.targetChanges.some((profile2) => this.syncResource.profile.id === profile2.id)) {
            return true;
          }
          if (e.valueChanges.some(({ profile: profile2, changes }) => this.syncResource.profile.id === profile2.id && changes.some((change) => change.target === StorageTarget.USER))) {
            return true;
          }
          return false;
        })
      )((() => this.triggerLocalChange()))
    );
  }
  async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine) {
    const remoteGlobalState = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;
    lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
    const lastSyncGlobalState = lastSyncUserData && lastSyncUserData.syncData ? JSON.parse(lastSyncUserData.syncData.content) : null;
    const localGlobalState = await this.localGlobalStateProvider.getLocalGlobalState(this.syncResource.profile);
    if (remoteGlobalState) {
      this.logService.trace(`${this.syncResourceLogLabel}: Merging remote ui state with local ui state...`);
    } else {
      this.logService.trace(`${this.syncResourceLogLabel}: Remote ui state does not exist. Synchronizing ui state for the first time.`);
    }
    const storageKeys = await this.getStorageKeys(lastSyncGlobalState);
    const { local, remote } = merge(localGlobalState.storage, remoteGlobalState ? remoteGlobalState.storage : null, lastSyncGlobalState ? lastSyncGlobalState.storage : null, storageKeys, this.logService);
    const previewResult = {
      content: null,
      local,
      remote,
      localChange: Object.keys(local.added).length > 0 || Object.keys(local.updated).length > 0 || local.removed.length > 0 ? Change.Modified : Change.None,
      remoteChange: remote.all !== null ? Change.Modified : Change.None
    };
    const localContent = stringify(localGlobalState, false);
    return [{
      baseResource: this.baseResource,
      baseContent: lastSyncGlobalState ? stringify(lastSyncGlobalState, false) : localContent,
      localResource: this.localResource,
      localContent,
      localUserData: localGlobalState,
      remoteResource: this.remoteResource,
      remoteContent: remoteGlobalState ? stringify(remoteGlobalState, false) : null,
      previewResource: this.previewResource,
      previewResult,
      localChange: previewResult.localChange,
      remoteChange: previewResult.remoteChange,
      acceptedResource: this.acceptedResource,
      storageKeys
    }];
  }
  async hasRemoteChanged(lastSyncUserData) {
    const lastSyncGlobalState = lastSyncUserData.syncData ? JSON.parse(lastSyncUserData.syncData.content) : null;
    if (lastSyncGlobalState === null) {
      return true;
    }
    const localGlobalState = await this.localGlobalStateProvider.getLocalGlobalState(this.syncResource.profile);
    const storageKeys = await this.getStorageKeys(lastSyncGlobalState);
    const { remote } = merge(localGlobalState.storage, lastSyncGlobalState.storage, lastSyncGlobalState.storage, storageKeys, this.logService);
    return remote.all !== null;
  }
  async getMergeResult(resourcePreview, token) {
    return { ...resourcePreview.previewResult, hasConflicts: false };
  }
  async getAcceptResult(resourcePreview, resource, content, token) {
    if (this.extUri.isEqual(resource, this.localResource)) {
      return this.acceptLocal(resourcePreview);
    }
    if (this.extUri.isEqual(resource, this.remoteResource)) {
      return this.acceptRemote(resourcePreview);
    }
    if (this.extUri.isEqual(resource, this.previewResource)) {
      return resourcePreview.previewResult;
    }
    throw new Error(`Invalid Resource: ${resource.toString()}`);
  }
  async acceptLocal(resourcePreview) {
    if (resourcePreview.remoteContent !== null) {
      const remoteGlobalState = JSON.parse(resourcePreview.remoteContent);
      const { local, remote } = merge(resourcePreview.localUserData.storage, remoteGlobalState.storage, remoteGlobalState.storage, resourcePreview.storageKeys, this.logService);
      return {
        content: resourcePreview.remoteContent,
        local,
        remote,
        localChange: Change.None,
        remoteChange: remote.all !== null ? Change.Modified : Change.None
      };
    } else {
      return {
        content: resourcePreview.localContent,
        local: { added: {}, removed: [], updated: {} },
        remote: { added: Object.keys(resourcePreview.localUserData.storage), removed: [], updated: [], all: resourcePreview.localUserData.storage },
        localChange: Change.None,
        remoteChange: Change.Modified
      };
    }
  }
  async acceptRemote(resourcePreview) {
    if (resourcePreview.remoteContent !== null) {
      const remoteGlobalState = JSON.parse(resourcePreview.remoteContent);
      const { local, remote } = merge(resourcePreview.localUserData.storage, remoteGlobalState.storage, resourcePreview.localUserData.storage, resourcePreview.storageKeys, this.logService);
      return {
        content: resourcePreview.remoteContent,
        local,
        remote,
        localChange: Object.keys(local.added).length > 0 || Object.keys(local.updated).length > 0 || local.removed.length > 0 ? Change.Modified : Change.None,
        remoteChange: Change.None
      };
    } else {
      return {
        content: resourcePreview.remoteContent,
        local: { added: {}, removed: [], updated: {} },
        remote: { added: [], removed: [], updated: [], all: null },
        localChange: Change.None,
        remoteChange: Change.None
      };
    }
  }
  async applyResult(remoteUserData, lastSyncUserData, resourcePreviews, force) {
    const { localUserData } = resourcePreviews[0][0];
    const { local, remote, localChange, remoteChange } = resourcePreviews[0][1];
    if (localChange === Change.None && remoteChange === Change.None) {
      this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing ui state.`);
    }
    if (localChange !== Change.None) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating local ui state...`);
      await this.backupLocal(JSON.stringify(localUserData));
      await this.localGlobalStateProvider.writeLocalGlobalState(local, this.syncResource.profile);
      this.logService.info(`${this.syncResourceLogLabel}: Updated local ui state`);
    }
    if (remoteChange !== Change.None) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating remote ui state...`);
      const content = JSON.stringify({ storage: remote.all });
      remoteUserData = await this.updateRemoteUserData(content, force ? null : remoteUserData.ref);
      this.logService.info(`${this.syncResourceLogLabel}: Updated remote ui state.${remote.added.length ? ` Added: ${remote.added}.` : ""}${remote.updated.length ? ` Updated: ${remote.updated}.` : ""}${remote.removed.length ? ` Removed: ${remote.removed}.` : ""}`);
    }
    if (lastSyncUserData?.ref !== remoteUserData.ref) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized ui state...`);
      await this.updateLastSyncUserData(remoteUserData);
      this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized ui state`);
    }
  }
  async resolveContent(uri) {
    if (this.extUri.isEqual(this.remoteResource, uri) || this.extUri.isEqual(this.baseResource, uri) || this.extUri.isEqual(this.localResource, uri) || this.extUri.isEqual(this.acceptedResource, uri)) {
      const content = await this.resolvePreviewContent(uri);
      return content ? stringify(JSON.parse(content), true) : content;
    }
    return null;
  }
  async hasLocalData() {
    try {
      const { storage } = await this.localGlobalStateProvider.getLocalGlobalState(this.syncResource.profile);
      if (Object.keys(storage).length > 1 || storage[`${argvStoragePrefx}.locale`]?.value !== "en") {
        return true;
      }
    } catch (error) {
    }
    return false;
  }
  async getStorageKeys(lastSyncGlobalState) {
    const storageData = await this.userDataProfileStorageService.readStorageData(this.syncResource.profile);
    const user = [], machine = [];
    for (const [key, value] of storageData) {
      if (value.target === StorageTarget.USER) {
        user.push(key);
      } else if (value.target === StorageTarget.MACHINE) {
        machine.push(key);
      }
    }
    const registered = [...user, ...machine];
    const unregistered = lastSyncGlobalState?.storage ? Object.keys(lastSyncGlobalState.storage).filter((key) => !key.startsWith(argvStoragePrefx) && !registered.includes(key) && storageData.get(key) !== void 0) : [];
    if (!isWeb) {
      const keysSyncedOnlyInWeb = [...ALL_SYNC_RESOURCES.map((resource) => getEnablementKey(resource)), SYNC_SERVICE_URL_TYPE];
      unregistered.push(...keysSyncedOnlyInWeb);
      machine.push(...keysSyncedOnlyInWeb);
    }
    return { user, machine, unregistered };
  }
};
GlobalStateSynchroniser = __decorateClass([
  __decorateParam(2, IUserDataProfileStorageService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IUserDataSyncStoreService),
  __decorateParam(5, IUserDataSyncLocalStoreService),
  __decorateParam(6, IUserDataSyncLogService),
  __decorateParam(7, IEnvironmentService),
  __decorateParam(8, IUserDataSyncEnablementService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IStorageService),
  __decorateParam(12, IUriIdentityService),
  __decorateParam(13, IInstantiationService)
], GlobalStateSynchroniser);
let LocalGlobalStateProvider = class {
  constructor(fileService, environmentService, userDataProfileStorageService, logService) {
    this.fileService = fileService;
    this.environmentService = environmentService;
    this.userDataProfileStorageService = userDataProfileStorageService;
    this.logService = logService;
  }
  async getLocalGlobalState(profile) {
    const storage = {};
    if (profile.isDefault) {
      const argvContent = await this.getLocalArgvContent();
      const argvValue = parse(argvContent);
      for (const argvProperty of argvProperties) {
        if (argvValue[argvProperty] !== void 0) {
          storage[`${argvStoragePrefx}${argvProperty}`] = { version: 1, value: argvValue[argvProperty] };
        }
      }
    }
    const storageData = await this.userDataProfileStorageService.readStorageData(profile);
    for (const [key, value] of storageData) {
      if (value.value && value.target === StorageTarget.USER) {
        storage[key] = { version: 1, value: value.value, scope: value.scope };
      }
    }
    return { storage };
  }
  async getLocalArgvContent() {
    try {
      this.logService.debug("GlobalStateSync#getLocalArgvContent", this.environmentService.argvResource);
      const content = await this.fileService.readFile(this.environmentService.argvResource);
      this.logService.debug("GlobalStateSync#getLocalArgvContent - Resolved", this.environmentService.argvResource);
      return content.value.toString();
    } catch (error) {
      this.logService.debug(getErrorMessage(error));
    }
    return "{}";
  }
  async writeLocalGlobalState({ added, removed, updated }, profile) {
    const syncResourceLogLabel = getSyncResourceLogLabel(SyncResource.GlobalState, profile);
    const argv = {};
    const updatedProfileStorage = /* @__PURE__ */ new Map();
    const updatedSharedStorage = profile.isDefault ? /* @__PURE__ */ new Map() : void 0;
    const storageData = await this.userDataProfileStorageService.readStorageData(profile);
    const handleUpdatedStorage = (keys, storage) => {
      for (const key of keys) {
        if (key.startsWith(argvStoragePrefx)) {
          argv[key.substring(argvStoragePrefx.length)] = storage ? storage[key].value : void 0;
          continue;
        }
        if (storage) {
          const storageValue = storage[key];
          if (storageValue.value !== storageData.get(key)?.value) {
            const targetMap = updatedSharedStorage && storageValue.scope === StorageScope.APPLICATION_SHARED ? updatedSharedStorage : updatedProfileStorage;
            targetMap.set(key, storageValue.value);
          }
        } else {
          if (storageData.get(key) !== void 0) {
            const targetMap = updatedSharedStorage && storageData.get(key)?.scope === StorageScope.APPLICATION_SHARED ? updatedSharedStorage : updatedProfileStorage;
            targetMap.set(key, void 0);
          }
        }
      }
    };
    handleUpdatedStorage(Object.keys(added), added);
    handleUpdatedStorage(Object.keys(updated), updated);
    handleUpdatedStorage(removed);
    if (Object.keys(argv).length) {
      this.logService.trace(`${syncResourceLogLabel}: Updating locale...`);
      const argvContent = await this.getLocalArgvContent();
      let content = argvContent;
      for (const argvProperty of Object.keys(argv)) {
        content = edit(content, [argvProperty], argv[argvProperty], {});
      }
      if (argvContent !== content) {
        this.logService.trace(`${syncResourceLogLabel}: Updating locale...`);
        await this.fileService.writeFile(this.environmentService.argvResource, VSBuffer.fromString(content));
        this.logService.info(`${syncResourceLogLabel}: Updated locale.`);
      }
      this.logService.info(`${syncResourceLogLabel}: Updated locale`);
    }
    if (updatedProfileStorage.size) {
      this.logService.trace(`${syncResourceLogLabel}: Updating global state...`);
      await this.userDataProfileStorageService.updateStorageData(profile, updatedProfileStorage, StorageTarget.USER);
      this.logService.info(`${syncResourceLogLabel}: Updated global state`, [...updatedProfileStorage.keys()]);
    }
    if (updatedSharedStorage?.size) {
      this.logService.trace(`${syncResourceLogLabel}: Updating application shared state...`);
      await this.userDataProfileStorageService.updateStorageData(profile, updatedSharedStorage, StorageTarget.USER, StorageScope.APPLICATION_SHARED);
      this.logService.info(`${syncResourceLogLabel}: Updated application shared state`, [...updatedSharedStorage.keys()]);
    }
  }
};
LocalGlobalStateProvider = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, IUserDataProfileStorageService),
  __decorateParam(3, IUserDataSyncLogService)
], LocalGlobalStateProvider);
let GlobalStateInitializer = class extends AbstractInitializer {
  constructor(storageService, fileService, userDataProfilesService, environmentService, logService, uriIdentityService) {
    super(SyncResource.GlobalState, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
  }
  async doInitialize(remoteUserData) {
    const remoteGlobalState = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;
    if (!remoteGlobalState) {
      this.logService.info("Skipping initializing global state because remote global state does not exist.");
      return;
    }
    const argv = {};
    const isDefaultProfile = this.storageService.hasScope(this.userDataProfilesService.defaultProfile);
    const storage = {};
    for (const key of Object.keys(remoteGlobalState.storage)) {
      if (key.startsWith(argvStoragePrefx)) {
        argv[key.substring(argvStoragePrefx.length)] = remoteGlobalState.storage[key].value;
      } else {
        const isSharedScope = remoteGlobalState.storage[key].scope === StorageScope.APPLICATION_SHARED;
        if (isSharedScope && !isDefaultProfile) {
          continue;
        }
        const scope = isSharedScope ? StorageScope.APPLICATION_SHARED : StorageScope.PROFILE;
        if (this.storageService.get(key, scope) === void 0) {
          storage[key] = { value: remoteGlobalState.storage[key].value, scope };
        }
      }
    }
    if (Object.keys(argv).length) {
      let content = "{}";
      try {
        const fileContent = await this.fileService.readFile(this.environmentService.argvResource);
        content = fileContent.value.toString();
      } catch (error) {
      }
      for (const argvProperty of Object.keys(argv)) {
        content = edit(content, [argvProperty], argv[argvProperty], {});
      }
      await this.fileService.writeFile(this.environmentService.argvResource, VSBuffer.fromString(content));
    }
    if (Object.keys(storage).length) {
      const storageEntries = [];
      for (const key of Object.keys(storage)) {
        storageEntries.push({ key, value: storage[key].value, scope: storage[key].scope, target: StorageTarget.USER });
      }
      this.storageService.storeAll(storageEntries, true);
    }
  }
};
GlobalStateInitializer = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IUserDataProfilesService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, IUserDataSyncLogService),
  __decorateParam(5, IUriIdentityService)
], GlobalStateInitializer);
let UserDataSyncStoreTypeSynchronizer = class {
  constructor(userDataSyncStoreClient, storageService, environmentService, fileService, logService) {
    this.userDataSyncStoreClient = userDataSyncStoreClient;
    this.storageService = storageService;
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.logService = logService;
  }
  getSyncStoreType(userData) {
    const remoteGlobalState = this.parseGlobalState(userData);
    return remoteGlobalState?.storage[SYNC_SERVICE_URL_TYPE]?.value;
  }
  async sync(userDataSyncStoreType) {
    const syncHeaders = createSyncHeaders(generateUuid());
    try {
      return await this.doSync(userDataSyncStoreType, syncHeaders);
    } catch (e) {
      if (e instanceof UserDataSyncError) {
        switch (e.code) {
          case UserDataSyncErrorCode.PreconditionFailed:
            this.logService.info(`Failed to synchronize UserDataSyncStoreType as there is a new remote version available. Synchronizing again...`);
            return this.doSync(userDataSyncStoreType, syncHeaders);
        }
      }
      throw e;
    }
  }
  async doSync(userDataSyncStoreType, syncHeaders) {
    const globalStateUserData = await this.userDataSyncStoreClient.readResource(SyncResource.GlobalState, null, void 0, syncHeaders);
    const remoteGlobalState = this.parseGlobalState(globalStateUserData) || { storage: {} };
    remoteGlobalState.storage[SYNC_SERVICE_URL_TYPE] = { value: userDataSyncStoreType, version: GLOBAL_STATE_DATA_VERSION };
    const machineId = await getServiceMachineId(this.environmentService, this.fileService, this.storageService);
    const syncDataToUpdate = { version: GLOBAL_STATE_DATA_VERSION, machineId, content: stringify(remoteGlobalState, false) };
    await this.userDataSyncStoreClient.writeResource(SyncResource.GlobalState, JSON.stringify(syncDataToUpdate), globalStateUserData.ref, void 0, syncHeaders);
  }
  parseGlobalState({ content }) {
    if (!content) {
      return null;
    }
    const syncData = JSON.parse(content);
    if (isSyncData(syncData)) {
      return syncData ? JSON.parse(syncData.content) : null;
    }
    throw new Error("Invalid remote data");
  }
};
UserDataSyncStoreTypeSynchronizer = __decorateClass([
  __decorateParam(1, IStorageService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IFileService),
  __decorateParam(4, ILogService)
], UserDataSyncStoreTypeSynchronizer);
export {
  GlobalStateInitializer,
  GlobalStateSynchroniser,
  LocalGlobalStateProvider,
  UserDataSyncStoreTypeSynchronizer,
  stringify
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXGdsb2JhbFN0YXRlU3luYy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IHRvRm9ybWF0dGVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkZvcm1hdHRlci5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElIZWFkZXJzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBnZXRTZXJ2aWNlTWFjaGluZUlkIH0gZnJvbSAnLi4vLi4vZXh0ZXJuYWxTZXJ2aWNlcy9jb21tb24vc2VydmljZU1hY2hpbmVJZC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZUVudHJ5LCBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IEFic3RyYWN0SW5pdGlhbGl6ZXIsIEFic3RyYWN0U3luY2hyb25pc2VyLCBnZXRTeW5jUmVzb3VyY2VMb2dMYWJlbCwgSUFjY2VwdFJlc3VsdCwgSU1lcmdlUmVzdWx0LCBJUmVzb3VyY2VQcmV2aWV3LCBpc1N5bmNEYXRhIH0gZnJvbSAnLi9hYnN0cmFjdFN5bmNocm9uaXplci5qcyc7XG5pbXBvcnQgeyBlZGl0IH0gZnJvbSAnLi9jb250ZW50LmpzJztcbmltcG9ydCB7IG1lcmdlIH0gZnJvbSAnLi9nbG9iYWxTdGF0ZU1lcmdlLmpzJztcbmltcG9ydCB7IEFMTF9TWU5DX1JFU09VUkNFUywgQ2hhbmdlLCBjcmVhdGVTeW5jSGVhZGVycywgZ2V0RW5hYmxlbWVudEtleSwgSUdsb2JhbFN0YXRlLCBJUmVtb3RlVXNlckRhdGEsIElTdG9yYWdlVmFsdWUsIElTeW5jRGF0YSwgSVVzZXJEYXRhLCBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsIElVc2VyRGF0YVN5bmNocm9uaXNlciwgSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsIElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgU3luY1Jlc291cmNlLCBTWU5DX1NFUlZJQ0VfVVJMX1RZUEUsIFVzZXJEYXRhU3luY0Vycm9yLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUsIFVzZXJEYXRhU3luY1N0b3JlVHlwZSwgVVNFUl9EQVRBX1NZTkNfU0NIRU1FIH0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFTeW5jU3RvcmVDbGllbnQgfSBmcm9tICcuL3VzZXJEYXRhU3luY1N0b3JlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuXG5jb25zdCBhcmd2U3RvcmFnZVByZWZ4ID0gJ2dsb2JhbFN0YXRlLmFyZ3YuJztcbmNvbnN0IGFyZ3ZQcm9wZXJ0aWVzOiBzdHJpbmdbXSA9IFsnbG9jYWxlJ107XG5cbnR5cGUgU3RvcmFnZUtleXMgPSB7IG1hY2hpbmU6IHN0cmluZ1tdOyB1c2VyOiBzdHJpbmdbXTsgdW5yZWdpc3RlcmVkOiBzdHJpbmdbXSB9O1xuXG5pbnRlcmZhY2UgSUdsb2JhbFN0YXRlUmVzb3VyY2VNZXJnZVJlc3VsdCBleHRlbmRzIElBY2NlcHRSZXN1bHQge1xuXHRyZWFkb25seSBsb2NhbDogeyBhZGRlZDogSVN0cmluZ0RpY3Rpb25hcnk8SVN0b3JhZ2VWYWx1ZT47IHJlbW92ZWQ6IHN0cmluZ1tdOyB1cGRhdGVkOiBJU3RyaW5nRGljdGlvbmFyeTxJU3RvcmFnZVZhbHVlPiB9O1xuXHRyZWFkb25seSByZW1vdGU6IHsgYWRkZWQ6IHN0cmluZ1tdOyByZW1vdmVkOiBzdHJpbmdbXTsgdXBkYXRlZDogc3RyaW5nW107IGFsbDogSVN0cmluZ0RpY3Rpb25hcnk8SVN0b3JhZ2VWYWx1ZT4gfCBudWxsIH07XG59XG5cbmludGVyZmFjZSBJR2xvYmFsU3RhdGVSZXNvdXJjZVByZXZpZXcgZXh0ZW5kcyBJUmVzb3VyY2VQcmV2aWV3IHtcblx0cmVhZG9ubHkgbG9jYWxVc2VyRGF0YTogSUdsb2JhbFN0YXRlO1xuXHRyZWFkb25seSBwcmV2aWV3UmVzdWx0OiBJR2xvYmFsU3RhdGVSZXNvdXJjZU1lcmdlUmVzdWx0O1xuXHRyZWFkb25seSBzdG9yYWdlS2V5czogU3RvcmFnZUtleXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdHJpbmdpZnkoZ2xvYmFsU3RhdGU6IElHbG9iYWxTdGF0ZSwgZm9ybWF0OiBib29sZWFuKTogc3RyaW5nIHtcblx0Y29uc3Qgc3RvcmFnZUtleXMgPSBnbG9iYWxTdGF0ZS5zdG9yYWdlID8gT2JqZWN0LmtleXMoZ2xvYmFsU3RhdGUuc3RvcmFnZSkuc29ydCgpIDogW107XG5cdGNvbnN0IHN0b3JhZ2U6IElTdHJpbmdEaWN0aW9uYXJ5PElTdG9yYWdlVmFsdWU+ID0ge307XG5cdHN0b3JhZ2VLZXlzLmZvckVhY2goa2V5ID0+IHN0b3JhZ2Vba2V5XSA9IGdsb2JhbFN0YXRlLnN0b3JhZ2Vba2V5XSk7XG5cdGdsb2JhbFN0YXRlLnN0b3JhZ2UgPSBzdG9yYWdlO1xuXHRyZXR1cm4gZm9ybWF0ID8gdG9Gb3JtYXR0ZWRTdHJpbmcoZ2xvYmFsU3RhdGUsIHt9KSA6IEpTT04uc3RyaW5naWZ5KGdsb2JhbFN0YXRlKTtcbn1cblxuY29uc3QgR0xPQkFMX1NUQVRFX0RBVEFfVkVSU0lPTiA9IDE7XG5cbi8qKlxuICogU3luY2hyb25pc2VzIGdsb2JhbCBzdGF0ZSB0aGF0IGluY2x1ZGVzXG4gKiBcdC0gR2xvYmFsIHN0b3JhZ2Ugd2l0aCB1c2VyIHNjb3BlXG4gKiBcdC0gTG9jYWxlIGZyb20gYXJndiBwcm9wZXJ0aWVzXG4gKlxuICogR2xvYmFsIHN0b3JhZ2UgaXMgc3luY2VkIHdpdGhvdXQgY2hlY2tpbmcgdmVyc2lvbiBqdXN0IGxpa2Ugb3RoZXIgcmVzb3VyY2VzIChzZXR0aW5ncywga2V5YmluZGluZ3MpLlxuICogSWYgdGhlcmUgaXMgYSBjaGFuZ2UgaW4gZm9ybWF0IG9mIHRoZSB2YWx1ZSBvZiBhIHN0b3JhZ2Uga2V5IHdoaWNoIHJlcXVpcmVzIG1pZ3JhdGlvbiB0aGVuXG4gKiBcdFx0T3duZXIgb2YgdGhhdCBrZXkgc2hvdWxkIHJlbW92ZSB0aGF0IGtleSBmcm9tIHVzZXIgc2NvcGUgYW5kIHJlcGxhY2UgdGhhdCB3aXRoIG5ldyB1c2VyIHNjb3BlZCBrZXkuXG4gKi9cbmV4cG9ydCBjbGFzcyBHbG9iYWxTdGF0ZVN5bmNocm9uaXNlciBleHRlbmRzIEFic3RyYWN0U3luY2hyb25pc2VyIGltcGxlbWVudHMgSVVzZXJEYXRhU3luY2hyb25pc2VyIHtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyID0gR0xPQkFMX1NUQVRFX0RBVEFfVkVSU0lPTjtcblx0cHJpdmF0ZSByZWFkb25seSBwcmV2aWV3UmVzb3VyY2U6IFVSSSA9IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsICdnbG9iYWxTdGF0ZS5qc29uJyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYmFzZVJlc291cmNlOiBVUkkgPSB0aGlzLnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2Jhc2UnIH0pO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxvY2FsUmVzb3VyY2U6IFVSSSA9IHRoaXMucHJldmlld1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlbW90ZVJlc291cmNlOiBVUkkgPSB0aGlzLnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWNjZXB0ZWRSZXNvdXJjZTogVVJJID0gdGhpcy5wcmV2aWV3UmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2NhbEdsb2JhbFN0YXRlUHJvdmlkZXI6IExvY2FsR2xvYmFsU3RhdGVQcm92aWRlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLFxuXHRcdGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UgdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UgdXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgbG9nU2VydmljZTogSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlLCBwcm9maWxlIH0sIGNvbGxlY3Rpb24sIGZpbGVTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIHVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLCB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgbG9nU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0dGhpcy5sb2NhbEdsb2JhbFN0YXRlUHJvdmlkZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbEdsb2JhbFN0YXRlUHJvdmlkZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZpbGVTZXJ2aWNlLndhdGNoKHRoaXMuZXh0VXJpLmRpcm5hbWUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYXJndlJlc291cmNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0RXZlbnQuYW55KFxuXHRcdFx0XHQvKiBMb2NhbGUgY2hhbmdlICovXG5cdFx0XHRcdEV2ZW50LmZpbHRlcihmaWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlLCBlID0+IGUuY29udGFpbnModGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYXJndlJlc291cmNlKSksXG5cdFx0XHRcdEV2ZW50LmZpbHRlcih1c2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZSwgZSA9PiB7XG5cdFx0XHRcdFx0LyogU3RvcmFnZVRhcmdldCBoYXMgY2hhbmdlZCBpbiBwcm9maWxlIHN0b3JhZ2UgKi9cblx0XHRcdFx0XHRpZiAoZS50YXJnZXRDaGFuZ2VzLnNvbWUocHJvZmlsZSA9PiB0aGlzLnN5bmNSZXNvdXJjZS5wcm9maWxlLmlkID09PSBwcm9maWxlLmlkKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8qIFVzZXIgc3RvcmFnZSBkYXRhIGhhcyBjaGFuZ2VkIGluIHByb2ZpbGUgc3RvcmFnZSAqL1xuXHRcdFx0XHRcdGlmIChlLnZhbHVlQ2hhbmdlcy5zb21lKCh7IHByb2ZpbGUsIGNoYW5nZXMgfSkgPT4gdGhpcy5zeW5jUmVzb3VyY2UucHJvZmlsZS5pZCA9PT0gcHJvZmlsZS5pZCAmJiBjaGFuZ2VzLnNvbWUoY2hhbmdlID0+IGNoYW5nZS50YXJnZXQgPT09IFN0b3JhZ2VUYXJnZXQuVVNFUikpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9KSxcblx0XHRcdCkoKCgpID0+IHRoaXMudHJpZ2dlckxvY2FsQ2hhbmdlKCkpKVxuXHRcdCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2VuZXJhdGVTeW5jUHJldmlldyhyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCBpc1JlbW90ZURhdGFGcm9tQ3VycmVudE1hY2hpbmU6IGJvb2xlYW4pOiBQcm9taXNlPElHbG9iYWxTdGF0ZVJlc291cmNlUHJldmlld1tdPiB7XG5cdFx0Y29uc3QgcmVtb3RlR2xvYmFsU3RhdGU6IElHbG9iYWxTdGF0ZSA9IHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhID8gSlNPTi5wYXJzZShyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YS5jb250ZW50KSA6IG51bGw7XG5cblx0XHQvLyBVc2UgcmVtb3RlIGRhdGEgYXMgbGFzdCBzeW5jIGRhdGEgaWYgbGFzdCBzeW5jIGRhdGEgZG9lcyBub3QgZXhpc3QgYW5kIHJlbW90ZSBkYXRhIGlzIGZyb20gc2FtZSBtYWNoaW5lXG5cdFx0bGFzdFN5bmNVc2VyRGF0YSA9IGxhc3RTeW5jVXNlckRhdGEgPT09IG51bGwgJiYgaXNSZW1vdGVEYXRhRnJvbUN1cnJlbnRNYWNoaW5lID8gcmVtb3RlVXNlckRhdGEgOiBsYXN0U3luY1VzZXJEYXRhO1xuXHRcdGNvbnN0IGxhc3RTeW5jR2xvYmFsU3RhdGU6IElHbG9iYWxTdGF0ZSB8IG51bGwgPSBsYXN0U3luY1VzZXJEYXRhICYmIGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEgPyBKU09OLnBhcnNlKGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEuY29udGVudCkgOiBudWxsO1xuXG5cdFx0Y29uc3QgbG9jYWxHbG9iYWxTdGF0ZSA9IGF3YWl0IHRoaXMubG9jYWxHbG9iYWxTdGF0ZVByb3ZpZGVyLmdldExvY2FsR2xvYmFsU3RhdGUodGhpcy5zeW5jUmVzb3VyY2UucHJvZmlsZSk7XG5cblx0XHRpZiAocmVtb3RlR2xvYmFsU3RhdGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogTWVyZ2luZyByZW1vdGUgdWkgc3RhdGUgd2l0aCBsb2NhbCB1aSBzdGF0ZS4uLmApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFJlbW90ZSB1aSBzdGF0ZSBkb2VzIG5vdCBleGlzdC4gU3luY2hyb25pemluZyB1aSBzdGF0ZSBmb3IgdGhlIGZpcnN0IHRpbWUuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmFnZUtleXMgPSBhd2FpdCB0aGlzLmdldFN0b3JhZ2VLZXlzKGxhc3RTeW5jR2xvYmFsU3RhdGUpO1xuXHRcdGNvbnN0IHsgbG9jYWwsIHJlbW90ZSB9ID0gbWVyZ2UobG9jYWxHbG9iYWxTdGF0ZS5zdG9yYWdlLCByZW1vdGVHbG9iYWxTdGF0ZSA/IHJlbW90ZUdsb2JhbFN0YXRlLnN0b3JhZ2UgOiBudWxsLCBsYXN0U3luY0dsb2JhbFN0YXRlID8gbGFzdFN5bmNHbG9iYWxTdGF0ZS5zdG9yYWdlIDogbnVsbCwgc3RvcmFnZUtleXMsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSUdsb2JhbFN0YXRlUmVzb3VyY2VNZXJnZVJlc3VsdCA9IHtcblx0XHRcdGNvbnRlbnQ6IG51bGwsXG5cdFx0XHRsb2NhbCxcblx0XHRcdHJlbW90ZSxcblx0XHRcdGxvY2FsQ2hhbmdlOiBPYmplY3Qua2V5cyhsb2NhbC5hZGRlZCkubGVuZ3RoID4gMCB8fCBPYmplY3Qua2V5cyhsb2NhbC51cGRhdGVkKS5sZW5ndGggPiAwIHx8IGxvY2FsLnJlbW92ZWQubGVuZ3RoID4gMCA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5Ob25lLFxuXHRcdFx0cmVtb3RlQ2hhbmdlOiByZW1vdGUuYWxsICE9PSBudWxsID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLk5vbmUsXG5cdFx0fTtcblxuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShsb2NhbEdsb2JhbFN0YXRlLCBmYWxzZSk7XG5cdFx0cmV0dXJuIFt7XG5cdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuYmFzZVJlc291cmNlLFxuXHRcdFx0YmFzZUNvbnRlbnQ6IGxhc3RTeW5jR2xvYmFsU3RhdGUgPyBzdHJpbmdpZnkobGFzdFN5bmNHbG9iYWxTdGF0ZSwgZmFsc2UpIDogbG9jYWxDb250ZW50LFxuXHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5sb2NhbFJlc291cmNlLFxuXHRcdFx0bG9jYWxDb250ZW50LFxuXHRcdFx0bG9jYWxVc2VyRGF0YTogbG9jYWxHbG9iYWxTdGF0ZSxcblx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLnJlbW90ZVJlc291cmNlLFxuXHRcdFx0cmVtb3RlQ29udGVudDogcmVtb3RlR2xvYmFsU3RhdGUgPyBzdHJpbmdpZnkocmVtb3RlR2xvYmFsU3RhdGUsIGZhbHNlKSA6IG51bGwsXG5cdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMucHJldmlld1Jlc291cmNlLFxuXHRcdFx0cHJldmlld1Jlc3VsdCxcblx0XHRcdGxvY2FsQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdGFjY2VwdGVkUmVzb3VyY2U6IHRoaXMuYWNjZXB0ZWRSZXNvdXJjZSxcblx0XHRcdHN0b3JhZ2VLZXlzXG5cdFx0fV07XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgaGFzUmVtb3RlQ2hhbmdlZChsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBsYXN0U3luY0dsb2JhbFN0YXRlOiBJR2xvYmFsU3RhdGUgfCBudWxsID0gbGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSA/IEpTT04ucGFyc2UobGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YS5jb250ZW50KSA6IG51bGw7XG5cdFx0aWYgKGxhc3RTeW5jR2xvYmFsU3RhdGUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBsb2NhbEdsb2JhbFN0YXRlID0gYXdhaXQgdGhpcy5sb2NhbEdsb2JhbFN0YXRlUHJvdmlkZXIuZ2V0TG9jYWxHbG9iYWxTdGF0ZSh0aGlzLnN5bmNSZXNvdXJjZS5wcm9maWxlKTtcblx0XHRjb25zdCBzdG9yYWdlS2V5cyA9IGF3YWl0IHRoaXMuZ2V0U3RvcmFnZUtleXMobGFzdFN5bmNHbG9iYWxTdGF0ZSk7XG5cdFx0Y29uc3QgeyByZW1vdGUgfSA9IG1lcmdlKGxvY2FsR2xvYmFsU3RhdGUuc3RvcmFnZSwgbGFzdFN5bmNHbG9iYWxTdGF0ZS5zdG9yYWdlLCBsYXN0U3luY0dsb2JhbFN0YXRlLnN0b3JhZ2UsIHN0b3JhZ2VLZXlzLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdHJldHVybiByZW1vdGUuYWxsICE9PSBudWxsO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldE1lcmdlUmVzdWx0KHJlc291cmNlUHJldmlldzogSUdsb2JhbFN0YXRlUmVzb3VyY2VQcmV2aWV3LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElNZXJnZVJlc3VsdD4ge1xuXHRcdHJldHVybiB7IC4uLnJlc291cmNlUHJldmlldy5wcmV2aWV3UmVzdWx0LCBoYXNDb25mbGljdHM6IGZhbHNlIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0QWNjZXB0UmVzdWx0KHJlc291cmNlUHJldmlldzogSUdsb2JhbFN0YXRlUmVzb3VyY2VQcmV2aWV3LCByZXNvdXJjZTogVVJJLCBjb250ZW50OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElHbG9iYWxTdGF0ZVJlc291cmNlTWVyZ2VSZXN1bHQ+IHtcblxuXHRcdC8qIEFjY2VwdCBsb2NhbCByZXNvdXJjZSAqL1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsKHJlc291cmNlLCB0aGlzLmxvY2FsUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hY2NlcHRMb2NhbChyZXNvdXJjZVByZXZpZXcpO1xuXHRcdH1cblxuXHRcdC8qIEFjY2VwdCByZW1vdGUgcmVzb3VyY2UgKi9cblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5yZW1vdGVSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmFjY2VwdFJlbW90ZShyZXNvdXJjZVByZXZpZXcpO1xuXHRcdH1cblxuXHRcdC8qIEFjY2VwdCBwcmV2aWV3IHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwocmVzb3VyY2UsIHRoaXMucHJldmlld1Jlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlUHJldmlldy5wcmV2aWV3UmVzdWx0O1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBSZXNvdXJjZTogJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhY2NlcHRMb2NhbChyZXNvdXJjZVByZXZpZXc6IElHbG9iYWxTdGF0ZVJlc291cmNlUHJldmlldyk6IFByb21pc2U8SUdsb2JhbFN0YXRlUmVzb3VyY2VNZXJnZVJlc3VsdD4ge1xuXHRcdGlmIChyZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCAhPT0gbnVsbCkge1xuXHRcdFx0Y29uc3QgcmVtb3RlR2xvYmFsU3RhdGU6IElHbG9iYWxTdGF0ZSA9IEpTT04ucGFyc2UocmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQpO1xuXHRcdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlIH0gPSBtZXJnZShyZXNvdXJjZVByZXZpZXcubG9jYWxVc2VyRGF0YS5zdG9yYWdlLCByZW1vdGVHbG9iYWxTdGF0ZS5zdG9yYWdlLCByZW1vdGVHbG9iYWxTdGF0ZS5zdG9yYWdlLCByZXNvdXJjZVByZXZpZXcuc3RvcmFnZUtleXMsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCxcblx0XHRcdFx0bG9jYWwsXG5cdFx0XHRcdHJlbW90ZSxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHJlbW90ZS5hbGwgIT09IG51bGwgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuTm9uZSxcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5sb2NhbENvbnRlbnQsXG5cdFx0XHRcdGxvY2FsOiB7IGFkZGVkOiB7fSwgcmVtb3ZlZDogW10sIHVwZGF0ZWQ6IHt9IH0sXG5cdFx0XHRcdHJlbW90ZTogeyBhZGRlZDogT2JqZWN0LmtleXMocmVzb3VyY2VQcmV2aWV3LmxvY2FsVXNlckRhdGEuc3RvcmFnZSksIHJlbW92ZWQ6IFtdLCB1cGRhdGVkOiBbXSwgYWxsOiByZXNvdXJjZVByZXZpZXcubG9jYWxVc2VyRGF0YS5zdG9yYWdlIH0sXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTW9kaWZpZWQsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYWNjZXB0UmVtb3RlKHJlc291cmNlUHJldmlldzogSUdsb2JhbFN0YXRlUmVzb3VyY2VQcmV2aWV3KTogUHJvbWlzZTxJR2xvYmFsU3RhdGVSZXNvdXJjZU1lcmdlUmVzdWx0PiB7XG5cdFx0aWYgKHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50ICE9PSBudWxsKSB7XG5cdFx0XHRjb25zdCByZW1vdGVHbG9iYWxTdGF0ZTogSUdsb2JhbFN0YXRlID0gSlNPTi5wYXJzZShyZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCk7XG5cdFx0XHRjb25zdCB7IGxvY2FsLCByZW1vdGUgfSA9IG1lcmdlKHJlc291cmNlUHJldmlldy5sb2NhbFVzZXJEYXRhLnN0b3JhZ2UsIHJlbW90ZUdsb2JhbFN0YXRlLnN0b3JhZ2UsIHJlc291cmNlUHJldmlldy5sb2NhbFVzZXJEYXRhLnN0b3JhZ2UsIHJlc291cmNlUHJldmlldy5zdG9yYWdlS2V5cywgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50LFxuXHRcdFx0XHRsb2NhbCxcblx0XHRcdFx0cmVtb3RlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogT2JqZWN0LmtleXMobG9jYWwuYWRkZWQpLmxlbmd0aCA+IDAgfHwgT2JqZWN0LmtleXMobG9jYWwudXBkYXRlZCkubGVuZ3RoID4gMCB8fCBsb2NhbC5yZW1vdmVkLmxlbmd0aCA+IDAgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50LFxuXHRcdFx0XHRsb2NhbDogeyBhZGRlZDoge30sIHJlbW92ZWQ6IFtdLCB1cGRhdGVkOiB7fSB9LFxuXHRcdFx0XHRyZW1vdGU6IHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgdXBkYXRlZDogW10sIGFsbDogbnVsbCB9LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBhcHBseVJlc3VsdChyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCByZXNvdXJjZVByZXZpZXdzOiBbSUdsb2JhbFN0YXRlUmVzb3VyY2VQcmV2aWV3LCBJR2xvYmFsU3RhdGVSZXNvdXJjZU1lcmdlUmVzdWx0XVtdLCBmb3JjZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgbG9jYWxVc2VyRGF0YSB9ID0gcmVzb3VyY2VQcmV2aWV3c1swXVswXTtcblx0XHRjb25zdCB7IGxvY2FsLCByZW1vdGUsIGxvY2FsQ2hhbmdlLCByZW1vdGVDaGFuZ2UgfSA9IHJlc291cmNlUHJldmlld3NbMF1bMV07XG5cblx0XHRpZiAobG9jYWxDaGFuZ2UgPT09IENoYW5nZS5Ob25lICYmIHJlbW90ZUNoYW5nZSA9PT0gQ2hhbmdlLk5vbmUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBObyBjaGFuZ2VzIGZvdW5kIGR1cmluZyBzeW5jaHJvbml6aW5nIHVpIHN0YXRlLmApO1xuXHRcdH1cblxuXHRcdGlmIChsb2NhbENoYW5nZSAhPT0gQ2hhbmdlLk5vbmUpIHtcblx0XHRcdC8vIHVwZGF0ZSBsb2NhbFxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyBsb2NhbCB1aSBzdGF0ZS4uLmApO1xuXHRcdFx0YXdhaXQgdGhpcy5iYWNrdXBMb2NhbChKU09OLnN0cmluZ2lmeShsb2NhbFVzZXJEYXRhKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmxvY2FsR2xvYmFsU3RhdGVQcm92aWRlci53cml0ZUxvY2FsR2xvYmFsU3RhdGUobG9jYWwsIHRoaXMuc3luY1Jlc291cmNlLnByb2ZpbGUpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0ZWQgbG9jYWwgdWkgc3RhdGVgKTtcblx0XHR9XG5cblx0XHRpZiAocmVtb3RlQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0Ly8gdXBkYXRlIHJlbW90ZVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyByZW1vdGUgdWkgc3RhdGUuLi5gKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7IHN0b3JhZ2U6IHJlbW90ZS5hbGwgfSk7XG5cdFx0XHRyZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRoaXMudXBkYXRlUmVtb3RlVXNlckRhdGEoY29udGVudCwgZm9yY2UgPyBudWxsIDogcmVtb3RlVXNlckRhdGEucmVmKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGVkIHJlbW90ZSB1aSBzdGF0ZS4ke3JlbW90ZS5hZGRlZC5sZW5ndGggPyBgIEFkZGVkOiAke3JlbW90ZS5hZGRlZH0uYCA6ICcnfSR7cmVtb3RlLnVwZGF0ZWQubGVuZ3RoID8gYCBVcGRhdGVkOiAke3JlbW90ZS51cGRhdGVkfS5gIDogJyd9JHtyZW1vdGUucmVtb3ZlZC5sZW5ndGggPyBgIFJlbW92ZWQ6ICR7cmVtb3RlLnJlbW92ZWR9LmAgOiAnJ31gKTtcblx0XHR9XG5cblx0XHRpZiAobGFzdFN5bmNVc2VyRGF0YT8ucmVmICE9PSByZW1vdGVVc2VyRGF0YS5yZWYpIHtcblx0XHRcdC8vIHVwZGF0ZSBsYXN0IHN5bmNcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRpbmcgbGFzdCBzeW5jaHJvbml6ZWQgdWkgc3RhdGUuLi5gKTtcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTGFzdFN5bmNVc2VyRGF0YShyZW1vdGVVc2VyRGF0YSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBsYXN0IHN5bmNocm9uaXplZCB1aSBzdGF0ZWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc29sdmVDb250ZW50KHVyaTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwodGhpcy5yZW1vdGVSZXNvdXJjZSwgdXJpKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbCh0aGlzLmJhc2VSZXNvdXJjZSwgdXJpKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbCh0aGlzLmxvY2FsUmVzb3VyY2UsIHVyaSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWwodGhpcy5hY2NlcHRlZFJlc291cmNlLCB1cmkpXG5cdFx0KSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5yZXNvbHZlUHJldmlld0NvbnRlbnQodXJpKTtcblx0XHRcdHJldHVybiBjb250ZW50ID8gc3RyaW5naWZ5KEpTT04ucGFyc2UoY29udGVudCksIHRydWUpIDogY29udGVudDtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhc3luYyBoYXNMb2NhbERhdGEoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHsgc3RvcmFnZSB9ID0gYXdhaXQgdGhpcy5sb2NhbEdsb2JhbFN0YXRlUHJvdmlkZXIuZ2V0TG9jYWxHbG9iYWxTdGF0ZSh0aGlzLnN5bmNSZXNvdXJjZS5wcm9maWxlKTtcblx0XHRcdGlmIChPYmplY3Qua2V5cyhzdG9yYWdlKS5sZW5ndGggPiAxIHx8IHN0b3JhZ2VbYCR7YXJndlN0b3JhZ2VQcmVmeH0ubG9jYWxlYF0/LnZhbHVlICE9PSAnZW4nKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvKiBpZ25vcmUgZXJyb3IgKi9cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTdG9yYWdlS2V5cyhsYXN0U3luY0dsb2JhbFN0YXRlOiBJR2xvYmFsU3RhdGUgfCBudWxsKTogUHJvbWlzZTxTdG9yYWdlS2V5cz4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VEYXRhID0gYXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZS5yZWFkU3RvcmFnZURhdGEodGhpcy5zeW5jUmVzb3VyY2UucHJvZmlsZSk7XG5cdFx0Y29uc3QgdXNlcjogc3RyaW5nW10gPSBbXSwgbWFjaGluZTogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBzdG9yYWdlRGF0YSkge1xuXHRcdFx0aWYgKHZhbHVlLnRhcmdldCA9PT0gU3RvcmFnZVRhcmdldC5VU0VSKSB7XG5cdFx0XHRcdHVzZXIucHVzaChrZXkpO1xuXHRcdFx0fSBlbHNlIGlmICh2YWx1ZS50YXJnZXQgPT09IFN0b3JhZ2VUYXJnZXQuTUFDSElORSkge1xuXHRcdFx0XHRtYWNoaW5lLnB1c2goa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IFsuLi51c2VyLCAuLi5tYWNoaW5lXTtcblx0XHRjb25zdCB1bnJlZ2lzdGVyZWQgPSBsYXN0U3luY0dsb2JhbFN0YXRlPy5zdG9yYWdlID8gT2JqZWN0LmtleXMobGFzdFN5bmNHbG9iYWxTdGF0ZS5zdG9yYWdlKS5maWx0ZXIoa2V5ID0+ICFrZXkuc3RhcnRzV2l0aChhcmd2U3RvcmFnZVByZWZ4KSAmJiAhcmVnaXN0ZXJlZC5pbmNsdWRlcyhrZXkpICYmIHN0b3JhZ2VEYXRhLmdldChrZXkpICE9PSB1bmRlZmluZWQpIDogW107XG5cblx0XHRpZiAoIWlzV2ViKSB7XG5cdFx0XHQvLyBGb2xsb3dpbmcga2V5cyBhcmUgc3luY2VkIG9ubHkgaW4gd2ViLiBEbyBub3Qgc3luYyB0aGVzZSBrZXlzIGluIG90aGVyIHBsYXRmb3Jtc1xuXHRcdFx0Y29uc3Qga2V5c1N5bmNlZE9ubHlJbldlYiA9IFsuLi5BTExfU1lOQ19SRVNPVVJDRVMubWFwKHJlc291cmNlID0+IGdldEVuYWJsZW1lbnRLZXkocmVzb3VyY2UpKSwgU1lOQ19TRVJWSUNFX1VSTF9UWVBFXTtcblx0XHRcdHVucmVnaXN0ZXJlZC5wdXNoKC4uLmtleXNTeW5jZWRPbmx5SW5XZWIpO1xuXHRcdFx0bWFjaGluZS5wdXNoKC4uLmtleXNTeW5jZWRPbmx5SW5XZWIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHVzZXIsIG1hY2hpbmUsIHVucmVnaXN0ZXJlZCB9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMb2NhbEdsb2JhbFN0YXRlUHJvdmlkZXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZVxuXHQpIHsgfVxuXG5cdGFzeW5jIGdldExvY2FsR2xvYmFsU3RhdGUocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8SUdsb2JhbFN0YXRlPiB7XG5cdFx0Y29uc3Qgc3RvcmFnZTogSVN0cmluZ0RpY3Rpb25hcnk8SVN0b3JhZ2VWYWx1ZT4gPSB7fTtcblx0XHRpZiAocHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdGNvbnN0IGFyZ3ZDb250ZW50OiBzdHJpbmcgPSBhd2FpdCB0aGlzLmdldExvY2FsQXJndkNvbnRlbnQoKTtcblx0XHRcdGNvbnN0IGFyZ3ZWYWx1ZTogSVN0cmluZ0RpY3Rpb25hcnk8YW55PiA9IHBhcnNlKGFyZ3ZDb250ZW50KTtcblx0XHRcdGZvciAoY29uc3QgYXJndlByb3BlcnR5IG9mIGFyZ3ZQcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdGlmIChhcmd2VmFsdWVbYXJndlByb3BlcnR5XSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0c3RvcmFnZVtgJHthcmd2U3RvcmFnZVByZWZ4fSR7YXJndlByb3BlcnR5fWBdID0geyB2ZXJzaW9uOiAxLCB2YWx1ZTogYXJndlZhbHVlW2FyZ3ZQcm9wZXJ0eV0gfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzdG9yYWdlRGF0YSA9IGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UucmVhZFN0b3JhZ2VEYXRhKHByb2ZpbGUpO1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHN0b3JhZ2VEYXRhKSB7XG5cdFx0XHRpZiAodmFsdWUudmFsdWUgJiYgdmFsdWUudGFyZ2V0ID09PSBTdG9yYWdlVGFyZ2V0LlVTRVIpIHtcblx0XHRcdFx0c3RvcmFnZVtrZXldID0geyB2ZXJzaW9uOiAxLCB2YWx1ZTogdmFsdWUudmFsdWUsIHNjb3BlOiB2YWx1ZS5zY29wZSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBzdG9yYWdlIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldExvY2FsQXJndkNvbnRlbnQoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdHbG9iYWxTdGF0ZVN5bmMjZ2V0TG9jYWxBcmd2Q29udGVudCcsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3ZSZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLmVudmlyb25tZW50U2VydmljZS5hcmd2UmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdHbG9iYWxTdGF0ZVN5bmMjZ2V0TG9jYWxBcmd2Q29udGVudCAtIFJlc29sdmVkJywgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYXJndlJlc291cmNlKTtcblx0XHRcdHJldHVybiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHR9XG5cdFx0cmV0dXJuICd7fSc7XG5cdH1cblxuXHRhc3luYyB3cml0ZUxvY2FsR2xvYmFsU3RhdGUoeyBhZGRlZCwgcmVtb3ZlZCwgdXBkYXRlZCB9OiB7IGFkZGVkOiBJU3RyaW5nRGljdGlvbmFyeTxJU3RvcmFnZVZhbHVlPjsgdXBkYXRlZDogSVN0cmluZ0RpY3Rpb25hcnk8SVN0b3JhZ2VWYWx1ZT47IHJlbW92ZWQ6IHN0cmluZ1tdIH0sIHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzeW5jUmVzb3VyY2VMb2dMYWJlbCA9IGdldFN5bmNSZXNvdXJjZUxvZ0xhYmVsKFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZSwgcHJvZmlsZSk7XG5cdFx0Y29uc3QgYXJndjogSVN0cmluZ0RpY3Rpb25hcnk8YW55PiA9IHt9O1xuXHRcdGNvbnN0IHVwZGF0ZWRQcm9maWxlU3RvcmFnZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+KCk7XG5cdFx0Y29uc3QgdXBkYXRlZFNoYXJlZFN0b3JhZ2UgPSBwcm9maWxlLmlzRGVmYXVsdCA/IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+KCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc3RvcmFnZURhdGEgPSBhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLnJlYWRTdG9yYWdlRGF0YShwcm9maWxlKTtcblx0XHRjb25zdCBoYW5kbGVVcGRhdGVkU3RvcmFnZSA9IChrZXlzOiBzdHJpbmdbXSwgc3RvcmFnZT86IElTdHJpbmdEaWN0aW9uYXJ5PElTdG9yYWdlVmFsdWU+KTogdm9pZCA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHRcdGlmIChrZXkuc3RhcnRzV2l0aChhcmd2U3RvcmFnZVByZWZ4KSkge1xuXHRcdFx0XHRcdGFyZ3Zba2V5LnN1YnN0cmluZyhhcmd2U3RvcmFnZVByZWZ4Lmxlbmd0aCldID0gc3RvcmFnZSA/IHN0b3JhZ2Vba2V5XS52YWx1ZSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3RvcmFnZSkge1xuXHRcdFx0XHRcdGNvbnN0IHN0b3JhZ2VWYWx1ZSA9IHN0b3JhZ2Vba2V5XTtcblx0XHRcdFx0XHRpZiAoc3RvcmFnZVZhbHVlLnZhbHVlICE9PSBzdG9yYWdlRGF0YS5nZXQoa2V5KT8udmFsdWUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldE1hcCA9IHVwZGF0ZWRTaGFyZWRTdG9yYWdlICYmIHN0b3JhZ2VWYWx1ZS5zY29wZSA9PT0gU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCA/IHVwZGF0ZWRTaGFyZWRTdG9yYWdlIDogdXBkYXRlZFByb2ZpbGVTdG9yYWdlO1xuXHRcdFx0XHRcdFx0dGFyZ2V0TWFwLnNldChrZXksIHN0b3JhZ2VWYWx1ZS52YWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChzdG9yYWdlRGF0YS5nZXQoa2V5KSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0YXJnZXRNYXAgPSB1cGRhdGVkU2hhcmVkU3RvcmFnZSAmJiBzdG9yYWdlRGF0YS5nZXQoa2V5KT8uc2NvcGUgPT09IFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRUQgPyB1cGRhdGVkU2hhcmVkU3RvcmFnZSA6IHVwZGF0ZWRQcm9maWxlU3RvcmFnZTtcblx0XHRcdFx0XHRcdHRhcmdldE1hcC5zZXQoa2V5LCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0aGFuZGxlVXBkYXRlZFN0b3JhZ2UoT2JqZWN0LmtleXMoYWRkZWQpLCBhZGRlZCk7XG5cdFx0aGFuZGxlVXBkYXRlZFN0b3JhZ2UoT2JqZWN0LmtleXModXBkYXRlZCksIHVwZGF0ZWQpO1xuXHRcdGhhbmRsZVVwZGF0ZWRTdG9yYWdlKHJlbW92ZWQpO1xuXG5cdFx0aWYgKE9iamVjdC5rZXlzKGFyZ3YpLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRpbmcgbG9jYWxlLi4uYCk7XG5cdFx0XHRjb25zdCBhcmd2Q29udGVudCA9IGF3YWl0IHRoaXMuZ2V0TG9jYWxBcmd2Q29udGVudCgpO1xuXHRcdFx0bGV0IGNvbnRlbnQgPSBhcmd2Q29udGVudDtcblx0XHRcdGZvciAoY29uc3QgYXJndlByb3BlcnR5IG9mIE9iamVjdC5rZXlzKGFyZ3YpKSB7XG5cdFx0XHRcdGNvbnRlbnQgPSBlZGl0KGNvbnRlbnQsIFthcmd2UHJvcGVydHldLCBhcmd2W2FyZ3ZQcm9wZXJ0eV0sIHt9KTtcblx0XHRcdH1cblx0XHRcdGlmIChhcmd2Q29udGVudCAhPT0gY29udGVudCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyBsb2NhbGUuLi5gKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYXJndlJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGVkIGxvY2FsZS5gKTtcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBsb2NhbGVgKTtcblx0XHR9XG5cblx0XHRpZiAodXBkYXRlZFByb2ZpbGVTdG9yYWdlLnNpemUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nIGdsb2JhbCBzdGF0ZS4uLmApO1xuXHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZS51cGRhdGVTdG9yYWdlRGF0YShwcm9maWxlLCB1cGRhdGVkUHJvZmlsZVN0b3JhZ2UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0ZWQgZ2xvYmFsIHN0YXRlYCwgWy4uLnVwZGF0ZWRQcm9maWxlU3RvcmFnZS5rZXlzKCldKTtcblx0XHR9XG5cblx0XHRpZiAodXBkYXRlZFNoYXJlZFN0b3JhZ2U/LnNpemUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nIGFwcGxpY2F0aW9uIHNoYXJlZCBzdGF0ZS4uLmApO1xuXHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZS51cGRhdGVTdG9yYWdlRGF0YShwcm9maWxlLCB1cGRhdGVkU2hhcmVkU3RvcmFnZSwgU3RvcmFnZVRhcmdldC5VU0VSLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBhcHBsaWNhdGlvbiBzaGFyZWQgc3RhdGVgLCBbLi4udXBkYXRlZFNoYXJlZFN0b3JhZ2Uua2V5cygpXSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBHbG9iYWxTdGF0ZUluaXRpYWxpemVyIGV4dGVuZHMgQWJzdHJhY3RJbml0aWFsaXplciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZSwgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgbG9nU2VydmljZSwgZmlsZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGRvSW5pdGlhbGl6ZShyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVtb3RlR2xvYmFsU3RhdGU6IElHbG9iYWxTdGF0ZSA9IHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhID8gSlNPTi5wYXJzZShyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YS5jb250ZW50KSA6IG51bGw7XG5cdFx0aWYgKCFyZW1vdGVHbG9iYWxTdGF0ZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1NraXBwaW5nIGluaXRpYWxpemluZyBnbG9iYWwgc3RhdGUgYmVjYXVzZSByZW1vdGUgZ2xvYmFsIHN0YXRlIGRvZXMgbm90IGV4aXN0LicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFyZ3Y6IElTdHJpbmdEaWN0aW9uYXJ5PGFueT4gPSB7fTtcblx0XHRjb25zdCBpc0RlZmF1bHRQcm9maWxlID0gdGhpcy5zdG9yYWdlU2VydmljZS5oYXNTY29wZSh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlKTtcblx0XHRjb25zdCBzdG9yYWdlOiBJU3RyaW5nRGljdGlvbmFyeTxhbnk+ID0ge307XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocmVtb3RlR2xvYmFsU3RhdGUuc3RvcmFnZSkpIHtcblx0XHRcdGlmIChrZXkuc3RhcnRzV2l0aChhcmd2U3RvcmFnZVByZWZ4KSkge1xuXHRcdFx0XHRhcmd2W2tleS5zdWJzdHJpbmcoYXJndlN0b3JhZ2VQcmVmeC5sZW5ndGgpXSA9IHJlbW90ZUdsb2JhbFN0YXRlLnN0b3JhZ2Vba2V5XS52YWx1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGlzU2hhcmVkU2NvcGUgPSByZW1vdGVHbG9iYWxTdGF0ZS5zdG9yYWdlW2tleV0uc2NvcGUgPT09IFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRUQ7XG5cdFx0XHRcdGlmIChpc1NoYXJlZFNjb3BlICYmICFpc0RlZmF1bHRQcm9maWxlKSB7XG5cdFx0XHRcdFx0Y29udGludWU7IC8vIFNraXAgQVBQTElDQVRJT05fU0hBUkVEIGtleXMgZm9yIG5vbi1kZWZhdWx0IHByb2ZpbGVzXG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc2NvcGUgPSBpc1NoYXJlZFNjb3BlID8gU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCA6IFN0b3JhZ2VTY29wZS5QUk9GSUxFO1xuXHRcdFx0XHRpZiAodGhpcy5zdG9yYWdlU2VydmljZS5nZXQoa2V5LCBzY29wZSkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHN0b3JhZ2Vba2V5XSA9IHsgdmFsdWU6IHJlbW90ZUdsb2JhbFN0YXRlLnN0b3JhZ2Vba2V5XS52YWx1ZSwgc2NvcGUgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChPYmplY3Qua2V5cyhhcmd2KS5sZW5ndGgpIHtcblx0XHRcdGxldCBjb250ZW50ID0gJ3t9Jztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVDb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLmVudmlyb25tZW50U2VydmljZS5hcmd2UmVzb3VyY2UpO1xuXHRcdFx0XHRjb250ZW50ID0gZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7IH1cblx0XHRcdGZvciAoY29uc3QgYXJndlByb3BlcnR5IG9mIE9iamVjdC5rZXlzKGFyZ3YpKSB7XG5cdFx0XHRcdGNvbnRlbnQgPSBlZGl0KGNvbnRlbnQsIFthcmd2UHJvcGVydHldLCBhcmd2W2FyZ3ZQcm9wZXJ0eV0sIHt9KTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3ZSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0fVxuXG5cdFx0aWYgKE9iamVjdC5rZXlzKHN0b3JhZ2UpLmxlbmd0aCkge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZUVudHJpZXM6IEFycmF5PElTdG9yYWdlRW50cnk+ID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhzdG9yYWdlKSkge1xuXHRcdFx0XHRzdG9yYWdlRW50cmllcy5wdXNoKHsga2V5LCB2YWx1ZTogc3RvcmFnZVtrZXldLnZhbHVlLCBzY29wZTogc3RvcmFnZVtrZXldLnNjb3BlLCB0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQuVVNFUiB9KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmVBbGwoc3RvcmFnZUVudHJpZXMsIHRydWUpO1xuXHRcdH1cblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YVN5bmNTdG9yZVR5cGVTeW5jaHJvbml6ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jU3RvcmVDbGllbnQ6IFVzZXJEYXRhU3luY1N0b3JlQ2xpZW50LFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdGdldFN5bmNTdG9yZVR5cGUodXNlckRhdGE6IElVc2VyRGF0YSk6IFVzZXJEYXRhU3luY1N0b3JlVHlwZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVtb3RlR2xvYmFsU3RhdGUgPSB0aGlzLnBhcnNlR2xvYmFsU3RhdGUodXNlckRhdGEpO1xuXHRcdHJldHVybiByZW1vdGVHbG9iYWxTdGF0ZT8uc3RvcmFnZVtTWU5DX1NFUlZJQ0VfVVJMX1RZUEVdPy52YWx1ZSBhcyBVc2VyRGF0YVN5bmNTdG9yZVR5cGU7XG5cdH1cblxuXHRhc3luYyBzeW5jKHVzZXJEYXRhU3luY1N0b3JlVHlwZTogVXNlckRhdGFTeW5jU3RvcmVUeXBlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3luY0hlYWRlcnMgPSBjcmVhdGVTeW5jSGVhZGVycyhnZW5lcmF0ZVV1aWQoKSk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmRvU3luYyh1c2VyRGF0YVN5bmNTdG9yZVR5cGUsIHN5bmNIZWFkZXJzKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY0Vycm9yKSB7XG5cdFx0XHRcdHN3aXRjaCAoZS5jb2RlKSB7XG5cdFx0XHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuUHJlY29uZGl0aW9uRmFpbGVkOlxuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEZhaWxlZCB0byBzeW5jaHJvbml6ZSBVc2VyRGF0YVN5bmNTdG9yZVR5cGUgYXMgdGhlcmUgaXMgYSBuZXcgcmVtb3RlIHZlcnNpb24gYXZhaWxhYmxlLiBTeW5jaHJvbml6aW5nIGFnYWluLi4uYCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5kb1N5bmModXNlckRhdGFTeW5jU3RvcmVUeXBlLCBzeW5jSGVhZGVycyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1N5bmModXNlckRhdGFTeW5jU3RvcmVUeXBlOiBVc2VyRGF0YVN5bmNTdG9yZVR5cGUsIHN5bmNIZWFkZXJzOiBJSGVhZGVycyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFJlYWQgdGhlIGdsb2JhbCBzdGF0ZSBmcm9tIHJlbW90ZVxuXHRcdGNvbnN0IGdsb2JhbFN0YXRlVXNlckRhdGEgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlQ2xpZW50LnJlYWRSZXNvdXJjZShTeW5jUmVzb3VyY2UuR2xvYmFsU3RhdGUsIG51bGwsIHVuZGVmaW5lZCwgc3luY0hlYWRlcnMpO1xuXHRcdGNvbnN0IHJlbW90ZUdsb2JhbFN0YXRlID0gdGhpcy5wYXJzZUdsb2JhbFN0YXRlKGdsb2JhbFN0YXRlVXNlckRhdGEpIHx8IHsgc3RvcmFnZToge30gfTtcblxuXHRcdC8vIFVwZGF0ZSB0aGUgc3luYyBzdG9yZSB0eXBlXG5cdFx0cmVtb3RlR2xvYmFsU3RhdGUuc3RvcmFnZVtTWU5DX1NFUlZJQ0VfVVJMX1RZUEVdID0geyB2YWx1ZTogdXNlckRhdGFTeW5jU3RvcmVUeXBlLCB2ZXJzaW9uOiBHTE9CQUxfU1RBVEVfREFUQV9WRVJTSU9OIH07XG5cblx0XHQvLyBXcml0ZSB0aGUgZ2xvYmFsIHN0YXRlIHRvIHJlbW90ZVxuXHRcdGNvbnN0IG1hY2hpbmVJZCA9IGF3YWl0IGdldFNlcnZpY2VNYWNoaW5lSWQodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMuc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHN5bmNEYXRhVG9VcGRhdGU6IElTeW5jRGF0YSA9IHsgdmVyc2lvbjogR0xPQkFMX1NUQVRFX0RBVEFfVkVSU0lPTiwgbWFjaGluZUlkLCBjb250ZW50OiBzdHJpbmdpZnkocmVtb3RlR2xvYmFsU3RhdGUsIGZhbHNlKSB9O1xuXHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU3RvcmVDbGllbnQud3JpdGVSZXNvdXJjZShTeW5jUmVzb3VyY2UuR2xvYmFsU3RhdGUsIEpTT04uc3RyaW5naWZ5KHN5bmNEYXRhVG9VcGRhdGUpLCBnbG9iYWxTdGF0ZVVzZXJEYXRhLnJlZiwgdW5kZWZpbmVkLCBzeW5jSGVhZGVycyk7XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlR2xvYmFsU3RhdGUoeyBjb250ZW50IH06IElVc2VyRGF0YSk6IElHbG9iYWxTdGF0ZSB8IG51bGwge1xuXHRcdGlmICghY29udGVudCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHN5bmNEYXRhID0gSlNPTi5wYXJzZShjb250ZW50KTtcblx0XHRpZiAoaXNTeW5jRGF0YShzeW5jRGF0YSkpIHtcblx0XHRcdHJldHVybiBzeW5jRGF0YSA/IEpTT04ucGFyc2Uoc3luY0RhdGEuY29udGVudCkgOiBudWxsO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgcmVtb3RlIGRhdGEnKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBR3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGFBQWE7QUFDdEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBRXRCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQXdCLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM1RSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQixzQkFBc0IseUJBQXdFLGtCQUFrQjtBQUM5SSxTQUFTLFlBQVk7QUFDckIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsb0JBQW9CLFFBQVEsbUJBQW1CLGtCQUFzRixn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
