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
import { Promises } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { getErrorMessage } from "../../../base/common/errors.js";
import { Event } from "../../../base/common/event.js";
import { toFormattedString } from "../../../base/common/jsonFormatter.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { compare } from "../../../base/common/strings.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { GlobalExtensionEnablementService } from "../../extensionManagement/common/extensionEnablementService.js";
import { IExtensionGalleryService, IExtensionManagementService, ExtensionManagementError, ExtensionManagementErrorCode, DISABLED_EXTENSIONS_STORAGE_PATH, EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, EXTENSION_INSTALL_SOURCE_CONTEXT, ExtensionInstallSource, EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT } from "../../extensionManagement/common/extensionManagement.js";
import { areSameExtensions } from "../../extensionManagement/common/extensionManagementUtil.js";
import { ExtensionStorageService, IExtensionStorageService } from "../../extensionManagement/common/extensionStorage.js";
import { ExtensionType, isApplicationScopedExtension } from "../../extensions/common/extensions.js";
import { IFileService } from "../../files/common/files.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ServiceCollection } from "../../instantiation/common/serviceCollection.js";
import { ILogService } from "../../log/common/log.js";
import { IStorageService } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { AbstractInitializer, AbstractSynchroniser, getSyncResourceLogLabel } from "./abstractSynchronizer.js";
import { merge } from "./extensionsMerge.js";
import { IIgnoredExtensionsManagementService } from "./ignoredExtensions.js";
import { Change, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, USER_DATA_SYNC_SCHEME } from "./userDataSync.js";
import { IUserDataProfileStorageService } from "../../userDataProfile/common/userDataProfileStorageService.js";
import { IProductService } from "../../product/common/productService.js";
async function parseAndMigrateExtensions(syncData, extensionManagementService) {
  const extensions = JSON.parse(syncData.content);
  if (syncData.version === 1 || syncData.version === 2) {
    const builtinExtensions = (await extensionManagementService.getInstalled(ExtensionType.System)).filter((e) => e.isBuiltin);
    for (const extension of extensions) {
      if (syncData.version === 1) {
        if (extension.enabled === false) {
          extension.disabled = true;
        }
        delete extension.enabled;
      }
      if (syncData.version === 2) {
        if (builtinExtensions.every((installed) => !areSameExtensions(installed.identifier, extension.identifier))) {
          extension.installed = true;
        }
      }
    }
  }
  return extensions;
}
function parseExtensions(syncData) {
  return JSON.parse(syncData.content);
}
function stringify(extensions, format) {
  extensions.sort((e1, e2) => {
    if (!e1.identifier.uuid && e2.identifier.uuid) {
      return -1;
    }
    if (e1.identifier.uuid && !e2.identifier.uuid) {
      return 1;
    }
    return compare(e1.identifier.id, e2.identifier.id);
  });
  return format ? toFormattedString(extensions, {}) : JSON.stringify(extensions);
}
let ExtensionsSynchroniser = class extends AbstractSynchroniser {
  constructor(profile, collection, environmentService, fileService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, extensionManagementService, ignoredExtensionsManagementService, logService, configurationService, userDataSyncEnablementService, telemetryService, extensionStorageService, uriIdentityService, userDataProfileStorageService, instantiationService) {
    super({ syncResource: SyncResource.Extensions, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
    this.extensionManagementService = extensionManagementService;
    this.ignoredExtensionsManagementService = ignoredExtensionsManagementService;
    this.instantiationService = instantiationService;
    /*
    	Version 3 - Introduce installed property to skip installing built in extensions
    	protected readonly version: number = 3;
    */
    /* Version 4: Change settings from `sync.${setting}` to `settingsSync.{setting}` */
    /* Version 5: Introduce extension state */
    /* Version 6: Added isApplicationScoped property */
    this.version = 6;
    this.previewResource = this.extUri.joinPath(this.syncPreviewFolder, "extensions.json");
    this.baseResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" });
    this.localResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" });
    this.remoteResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" });
    this.acceptedResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" });
    this.localExtensionsProvider = this.instantiationService.createInstance(LocalExtensionsProvider);
    this._register(
      Event.any(
        Event.filter(this.extensionManagementService.onDidInstallExtensions, ((e) => e.some(({ local }) => !!local))),
        Event.filter(this.extensionManagementService.onDidUninstallExtension, ((e) => !e.error)),
        Event.filter(userDataProfileStorageService.onDidChange, (e) => e.valueChanges.some(({ profile: profile2, changes }) => this.syncResource.profile.id === profile2.id && changes.some((change) => change.key === DISABLED_EXTENSIONS_STORAGE_PATH))),
        extensionStorageService.onDidChangeExtensionStorageToSync
      )(() => this.triggerLocalChange())
    );
  }
  async generateSyncPreview(remoteUserData, lastSyncUserData) {
    const remoteExtensions = remoteUserData.syncData ? await parseAndMigrateExtensions(remoteUserData.syncData, this.extensionManagementService) : null;
    const skippedExtensions = lastSyncUserData?.skippedExtensions ?? [];
    const builtinExtensions = lastSyncUserData?.builtinExtensions ?? null;
    const lastSyncExtensions = lastSyncUserData?.syncData ? await parseAndMigrateExtensions(lastSyncUserData.syncData, this.extensionManagementService) : null;
    const { localExtensions, ignoredExtensions } = await this.localExtensionsProvider.getLocalExtensions(this.syncResource.profile);
    if (remoteExtensions) {
      this.logService.trace(`${this.syncResourceLogLabel}: Merging remote extensions with local extensions...`);
    } else {
      this.logService.trace(`${this.syncResourceLogLabel}: Remote extensions does not exist. Synchronizing extensions for the first time.`);
    }
    const { local, remote } = merge(localExtensions, remoteExtensions, lastSyncExtensions, skippedExtensions, ignoredExtensions, builtinExtensions);
    const previewResult = {
      local,
      remote,
      content: this.getPreviewContent(localExtensions, local.added, local.updated, local.removed),
      localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
      remoteChange: remote !== null ? Change.Modified : Change.None
    };
    const localContent = this.stringify(localExtensions, false);
    return [{
      skippedExtensions,
      builtinExtensions,
      baseResource: this.baseResource,
      baseContent: lastSyncExtensions ? this.stringify(lastSyncExtensions, false) : localContent,
      localResource: this.localResource,
      localContent,
      localExtensions,
      remoteResource: this.remoteResource,
      remoteExtensions,
      remoteContent: remoteExtensions ? this.stringify(remoteExtensions, false) : null,
      previewResource: this.previewResource,
      previewResult,
      localChange: previewResult.localChange,
      remoteChange: previewResult.remoteChange,
      acceptedResource: this.acceptedResource
    }];
  }
  async hasRemoteChanged(lastSyncUserData) {
    const lastSyncExtensions = lastSyncUserData.syncData ? await parseAndMigrateExtensions(lastSyncUserData.syncData, this.extensionManagementService) : null;
    const { localExtensions, ignoredExtensions } = await this.localExtensionsProvider.getLocalExtensions(this.syncResource.profile);
    const { remote } = merge(localExtensions, lastSyncExtensions, lastSyncExtensions, lastSyncUserData.skippedExtensions || [], ignoredExtensions, lastSyncUserData.builtinExtensions || []);
    return remote !== null;
  }
  getPreviewContent(localExtensions, added, updated, removed) {
    const preview = [...added, ...updated];
    const idsOrUUIDs = /* @__PURE__ */ new Set();
    const addIdentifier = (identifier) => {
      idsOrUUIDs.add(identifier.id.toLowerCase());
      if (identifier.uuid) {
        idsOrUUIDs.add(identifier.uuid);
      }
    };
    preview.forEach(({ identifier }) => addIdentifier(identifier));
    removed.forEach(addIdentifier);
    for (const localExtension of localExtensions) {
      if (idsOrUUIDs.has(localExtension.identifier.id.toLowerCase()) || localExtension.identifier.uuid && idsOrUUIDs.has(localExtension.identifier.uuid)) {
        continue;
      }
      preview.push(localExtension);
    }
    return this.stringify(preview, false);
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
    const installedExtensions = await this.extensionManagementService.getInstalled(void 0, this.syncResource.profile.extensionsResource);
    const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);
    const remoteExtensions = resourcePreview.remoteContent ? JSON.parse(resourcePreview.remoteContent) : null;
    const mergeResult = merge(resourcePreview.localExtensions, remoteExtensions, remoteExtensions, resourcePreview.skippedExtensions, ignoredExtensions, resourcePreview.builtinExtensions);
    const { local, remote } = mergeResult;
    return {
      content: resourcePreview.localContent,
      local,
      remote,
      localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
      remoteChange: remote !== null ? Change.Modified : Change.None
    };
  }
  async acceptRemote(resourcePreview) {
    const installedExtensions = await this.extensionManagementService.getInstalled(void 0, this.syncResource.profile.extensionsResource);
    const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);
    const remoteExtensions = resourcePreview.remoteContent ? JSON.parse(resourcePreview.remoteContent) : null;
    if (remoteExtensions !== null) {
      const mergeResult = merge(resourcePreview.localExtensions, remoteExtensions, resourcePreview.localExtensions, [], ignoredExtensions, resourcePreview.builtinExtensions);
      const { local, remote } = mergeResult;
      return {
        content: resourcePreview.remoteContent,
        local,
        remote,
        localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
        remoteChange: remote !== null ? Change.Modified : Change.None
      };
    } else {
      return {
        content: resourcePreview.remoteContent,
        local: { added: [], removed: [], updated: [] },
        remote: null,
        localChange: Change.None,
        remoteChange: Change.None
      };
    }
  }
  async applyResult(remoteUserData, lastSyncUserData, resourcePreviews, force) {
    let { skippedExtensions, builtinExtensions, localExtensions } = resourcePreviews[0][0];
    const { local, remote, localChange, remoteChange } = resourcePreviews[0][1];
    if (localChange === Change.None && remoteChange === Change.None) {
      this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing extensions.`);
    }
    if (localChange !== Change.None) {
      await this.backupLocal(JSON.stringify(localExtensions));
      skippedExtensions = await this.localExtensionsProvider.updateLocalExtensions(local.added, local.removed, local.updated, skippedExtensions, this.syncResource.profile);
    }
    if (remote) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating remote extensions...`);
      const content = JSON.stringify(remote.all);
      remoteUserData = await this.updateRemoteUserData(content, force ? null : remoteUserData.ref);
      this.logService.info(`${this.syncResourceLogLabel}: Updated remote extensions.${remote.added.length ? ` Added: ${JSON.stringify(remote.added.map((e) => e.identifier.id))}.` : ""}${remote.updated.length ? ` Updated: ${JSON.stringify(remote.updated.map((e) => e.identifier.id))}.` : ""}${remote.removed.length ? ` Removed: ${JSON.stringify(remote.removed.map((e) => e.identifier.id))}.` : ""}`);
    }
    if (lastSyncUserData?.ref !== remoteUserData.ref) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized extensions...`);
      builtinExtensions = this.computeBuiltinExtensions(localExtensions, builtinExtensions);
      await this.updateLastSyncUserData(remoteUserData, { skippedExtensions, builtinExtensions });
      this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized extensions.${skippedExtensions.length ? ` Skipped: ${JSON.stringify(skippedExtensions.map((e) => e.identifier.id))}.` : ""}`);
    }
  }
  computeBuiltinExtensions(localExtensions, previousBuiltinExtensions) {
    const localExtensionsSet = /* @__PURE__ */ new Set();
    const builtinExtensions = [];
    for (const localExtension of localExtensions) {
      localExtensionsSet.add(localExtension.identifier.id.toLowerCase());
      if (!localExtension.installed) {
        builtinExtensions.push(localExtension.identifier);
      }
    }
    if (previousBuiltinExtensions) {
      for (const builtinExtension of previousBuiltinExtensions) {
        if (!localExtensionsSet.has(builtinExtension.id.toLowerCase())) {
          builtinExtensions.push(builtinExtension);
        }
      }
    }
    return builtinExtensions;
  }
  async resolveContent(uri) {
    if (this.extUri.isEqual(this.remoteResource, uri) || this.extUri.isEqual(this.baseResource, uri) || this.extUri.isEqual(this.localResource, uri) || this.extUri.isEqual(this.acceptedResource, uri)) {
      const content = await this.resolvePreviewContent(uri);
      return content ? this.stringify(JSON.parse(content), true) : content;
    }
    return null;
  }
  stringify(extensions, format) {
    return stringify(extensions, format);
  }
  async hasLocalData() {
    try {
      const { localExtensions } = await this.localExtensionsProvider.getLocalExtensions(this.syncResource.profile);
      if (localExtensions.some((e) => e.installed || e.disabled)) {
        return true;
      }
    } catch (error) {
    }
    return false;
  }
};
ExtensionsSynchroniser = __decorateClass([
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUserDataSyncStoreService),
  __decorateParam(6, IUserDataSyncLocalStoreService),
  __decorateParam(7, IExtensionManagementService),
  __decorateParam(8, IIgnoredExtensionsManagementService),
  __decorateParam(9, IUserDataSyncLogService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IUserDataSyncEnablementService),
  __decorateParam(12, ITelemetryService),
  __decorateParam(13, IExtensionStorageService),
  __decorateParam(14, IUriIdentityService),
  __decorateParam(15, IUserDataProfileStorageService),
  __decorateParam(16, IInstantiationService)
], ExtensionsSynchroniser);
let LocalExtensionsProvider = class {
  constructor(extensionManagementService, userDataProfileStorageService, extensionGalleryService, ignoredExtensionsManagementService, instantiationService, logService, productService) {
    this.extensionManagementService = extensionManagementService;
    this.userDataProfileStorageService = userDataProfileStorageService;
    this.extensionGalleryService = extensionGalleryService;
    this.ignoredExtensionsManagementService = ignoredExtensionsManagementService;
    this.instantiationService = instantiationService;
    this.logService = logService;
    this.productService = productService;
  }
  async getLocalExtensions(profile) {
    const installedExtensions = await this.extensionManagementService.getInstalled(void 0, profile.extensionsResource);
    const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);
    const localExtensions = await this.withProfileScopedServices(profile, async (extensionEnablementService, extensionStorageService) => {
      const disabledExtensions = extensionEnablementService.getDisabledExtensions();
      return installedExtensions.map((extension) => {
        const { identifier, isBuiltin, manifest, preRelease, pinned, isApplicationScoped } = extension;
        const syncExtension = { identifier, preRelease, version: manifest.version, pinned: !!pinned };
        if (isApplicationScoped && !isApplicationScopedExtension(manifest)) {
          syncExtension.isApplicationScoped = isApplicationScoped;
        }
        if (this.productService.builtInExtensionsEnabledWithAutoUpdates?.some((id) => id.toLowerCase() === identifier.id.toLowerCase())) {
          syncExtension.isApplicationScoped = true;
        }
        if (disabledExtensions.some((disabledExtension) => areSameExtensions(disabledExtension, identifier))) {
          syncExtension.disabled = true;
        }
        if (!isBuiltin) {
          syncExtension.installed = true;
        }
        try {
          const keys = extensionStorageService.getKeysForSync({ id: identifier.id, version: manifest.version });
          if (keys) {
            const extensionStorageState = extensionStorageService.getExtensionState(extension, true) || {};
            syncExtension.state = Object.keys(extensionStorageState).reduce((state, key) => {
              if (keys.includes(key)) {
                state[key] = extensionStorageState[key];
              }
              return state;
            }, {});
          }
        } catch (error) {
          this.logService.info(`${getSyncResourceLogLabel(SyncResource.Extensions, profile)}: Error while parsing extension state`, getErrorMessage(error));
        }
        return syncExtension;
      });
    });
    return { localExtensions, ignoredExtensions };
  }
  async updateLocalExtensions(added, removed, updated, skippedExtensions, profile) {
    const syncResourceLogLabel = getSyncResourceLogLabel(SyncResource.Extensions, profile);
    const extensionsToInstall = [];
    const syncExtensionsToInstall = /* @__PURE__ */ new Map();
    const removeFromSkipped = [];
    const addToSkipped = [];
    const installedExtensions = await this.extensionManagementService.getInstalled(void 0, profile.extensionsResource);
    if (added.length || updated.length) {
      await this.withProfileScopedServices(profile, async (extensionEnablementService, extensionStorageService) => {
        await Promises.settled([...added, ...updated].map(async (e) => {
          const installedExtension = installedExtensions.find((installed) => areSameExtensions(installed.identifier, e.identifier));
          if (installedExtension && installedExtension.isBuiltin) {
            if (e.state && installedExtension.manifest.version === e.version) {
              this.updateExtensionState(e.state, installedExtension, installedExtension.manifest.version, extensionStorageService);
            }
            const isDisabled = extensionEnablementService.getDisabledExtensions().some((disabledExtension) => areSameExtensions(disabledExtension, e.identifier));
            if (isDisabled !== !!e.disabled) {
              if (e.disabled) {
                this.logService.trace(`${syncResourceLogLabel}: Disabling extension...`, e.identifier.id);
                await extensionEnablementService.disableExtension(e.identifier);
                this.logService.info(`${syncResourceLogLabel}: Disabled extension`, e.identifier.id);
              } else {
                this.logService.trace(`${syncResourceLogLabel}: Enabling extension...`, e.identifier.id);
                await extensionEnablementService.enableExtension(e.identifier);
                this.logService.info(`${syncResourceLogLabel}: Enabled extension`, e.identifier.id);
              }
            }
            removeFromSkipped.push(e.identifier);
            return;
          }
          const version = e.pinned ? e.version : void 0;
          const extension = (await this.extensionGalleryService.getExtensions([{ ...e.identifier, version, preRelease: version ? void 0 : e.preRelease }], CancellationToken.None))[0];
          if (e.state && (installedExtension ? installedExtension.manifest.version === e.version : !!extension)) {
            this.updateExtensionState(e.state, installedExtension || extension, installedExtension?.manifest.version, extensionStorageService);
          }
          if (extension) {
            try {
              const isDisabled = extensionEnablementService.getDisabledExtensions().some((disabledExtension) => areSameExtensions(disabledExtension, e.identifier));
              if (isDisabled !== !!e.disabled) {
                if (e.disabled) {
                  this.logService.trace(`${syncResourceLogLabel}: Disabling extension...`, e.identifier.id, extension.version);
                  await extensionEnablementService.disableExtension(extension.identifier);
                  this.logService.info(`${syncResourceLogLabel}: Disabled extension`, e.identifier.id, extension.version);
                } else {
                  this.logService.trace(`${syncResourceLogLabel}: Enabling extension...`, e.identifier.id, extension.version);
                  await extensionEnablementService.enableExtension(extension.identifier);
                  this.logService.info(`${syncResourceLogLabel}: Enabled extension`, e.identifier.id, extension.version);
                }
              }
              if (!installedExtension || installedExtension.preRelease !== e.preRelease || installedExtension.pinned !== e.pinned || version && installedExtension.manifest.version !== version) {
                if (await this.extensionManagementService.canInstall(extension) === true) {
                  extensionsToInstall.push({
                    extension,
                    options: {
                      isMachineScoped: false,
                      donotIncludePackAndDependencies: true,
                      installGivenVersion: e.pinned && !!e.version,
                      pinned: e.pinned,
                      installPreReleaseVersion: e.preRelease,
                      preRelease: e.preRelease,
                      profileLocation: profile.extensionsResource,
                      isApplicationScoped: e.isApplicationScoped,
                      context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true, [EXTENSION_INSTALL_SOURCE_CONTEXT]: ExtensionInstallSource.SETTINGS_SYNC, [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true }
                    }
                  });
                  syncExtensionsToInstall.set(extension.identifier.id.toLowerCase(), e);
                } else {
                  this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension because it cannot be installed.`, extension.displayName || extension.identifier.id);
                  addToSkipped.push(e);
                }
              }
            } catch (error) {
              addToSkipped.push(e);
              this.logService.error(error);
              this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension`, extension.displayName || extension.identifier.id);
            }
          } else {
            addToSkipped.push(e);
            this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension because the extension is not found.`, e.identifier.id);
          }
        }));
      });
    }
    if (removed.length) {
      const extensionsToRemove = installedExtensions.filter(({ identifier, isBuiltin }) => !isBuiltin && removed.some((r) => areSameExtensions(identifier, r)));
      await Promises.settled(extensionsToRemove.map(async (extensionToRemove) => {
        this.logService.trace(`${syncResourceLogLabel}: Uninstalling local extension...`, extensionToRemove.identifier.id);
        await this.extensionManagementService.uninstall(extensionToRemove, { donotIncludePack: true, donotCheckDependents: true, profileLocation: profile.extensionsResource });
        this.logService.info(`${syncResourceLogLabel}: Uninstalled local extension.`, extensionToRemove.identifier.id);
        removeFromSkipped.push(extensionToRemove.identifier);
      }));
    }
    const results = await this.extensionManagementService.installGalleryExtensions(extensionsToInstall);
    for (const { identifier, local, error, source } of results) {
      const gallery = source;
      if (local) {
        this.logService.info(`${syncResourceLogLabel}: Installed extension.`, identifier.id, gallery.version);
        removeFromSkipped.push(identifier);
      } else {
        const e = syncExtensionsToInstall.get(identifier.id.toLowerCase());
        if (e) {
          addToSkipped.push(e);
          this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension`, gallery.displayName || gallery.identifier.id);
        }
        if (error instanceof ExtensionManagementError && [ExtensionManagementErrorCode.Incompatible, ExtensionManagementErrorCode.IncompatibleApi, ExtensionManagementErrorCode.IncompatibleTargetPlatform].includes(error.code)) {
          this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension because the compatible extension is not found.`, gallery.displayName || gallery.identifier.id);
        } else if (error) {
          this.logService.error(error);
        }
      }
    }
    const newSkippedExtensions = [];
    for (const skippedExtension of skippedExtensions) {
      if (!removeFromSkipped.some((e) => areSameExtensions(e, skippedExtension.identifier))) {
        newSkippedExtensions.push(skippedExtension);
      }
    }
    for (const skippedExtension of addToSkipped) {
      if (!newSkippedExtensions.some((e) => areSameExtensions(e.identifier, skippedExtension.identifier))) {
        newSkippedExtensions.push(skippedExtension);
      }
    }
    return newSkippedExtensions;
  }
  updateExtensionState(state, extension, version, extensionStorageService) {
    const extensionState = extensionStorageService.getExtensionState(extension, true) || {};
    const keys = version ? extensionStorageService.getKeysForSync({ id: extension.identifier.id, version }) : void 0;
    if (keys) {
      keys.forEach((key) => {
        extensionState[key] = state[key];
      });
    } else {
      Object.keys(state).forEach((key) => extensionState[key] = state[key]);
    }
    extensionStorageService.setExtensionState(extension, extensionState, true);
  }
  async withProfileScopedServices(profile, fn) {
    return this.userDataProfileStorageService.withProfileScopedStorageService(
      profile,
      async (storageService) => {
        const disposables = new DisposableStore();
        const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IStorageService, storageService])));
        const extensionEnablementService = disposables.add(instantiationService.createInstance(GlobalExtensionEnablementService));
        const extensionStorageService = disposables.add(instantiationService.createInstance(ExtensionStorageService));
        try {
          return await fn(extensionEnablementService, extensionStorageService);
        } finally {
          disposables.dispose();
        }
      }
    );
  }
};
LocalExtensionsProvider = __decorateClass([
  __decorateParam(0, IExtensionManagementService),
  __decorateParam(1, IUserDataProfileStorageService),
  __decorateParam(2, IExtensionGalleryService),
  __decorateParam(3, IIgnoredExtensionsManagementService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IUserDataSyncLogService),
  __decorateParam(6, IProductService)
], LocalExtensionsProvider);
let AbstractExtensionsInitializer = class extends AbstractInitializer {
  constructor(extensionManagementService, ignoredExtensionsManagementService, fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService) {
    super(SyncResource.Extensions, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
    this.extensionManagementService = extensionManagementService;
    this.ignoredExtensionsManagementService = ignoredExtensionsManagementService;
  }
  async parseExtensions(remoteUserData) {
    return remoteUserData.syncData ? await parseAndMigrateExtensions(remoteUserData.syncData, this.extensionManagementService) : null;
  }
  generatePreview(remoteExtensions, localExtensions) {
    const installedExtensions = [];
    const newExtensions = [];
    const disabledExtensions = [];
    for (const extension of remoteExtensions) {
      if (this.ignoredExtensionsManagementService.hasToNeverSyncExtension(extension.identifier.id)) {
        continue;
      }
      const installedExtension = localExtensions.find((i) => areSameExtensions(i.identifier, extension.identifier));
      if (installedExtension) {
        installedExtensions.push(installedExtension);
        if (extension.disabled) {
          disabledExtensions.push(extension.identifier);
        }
      } else if (extension.installed) {
        newExtensions.push({ ...extension.identifier, preRelease: !!extension.preRelease });
        if (extension.disabled) {
          disabledExtensions.push(extension.identifier);
        }
      }
    }
    return { installedExtensions, newExtensions, disabledExtensions, remoteExtensions };
  }
};
AbstractExtensionsInitializer = __decorateClass([
  __decorateParam(0, IExtensionManagementService),
  __decorateParam(1, IIgnoredExtensionsManagementService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IUserDataProfilesService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IUriIdentityService)
], AbstractExtensionsInitializer);
export {
  AbstractExtensionsInitializer,
  ExtensionsSynchroniser,
  LocalExtensionsProvider,
  parseExtensions,
  stringify
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXGV4dGVuc2lvbnNTeW5jLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHRvRm9ybWF0dGVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkZvcm1hdHRlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29tcGFyZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIElMb2NhbEV4dGVuc2lvbiwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLCBJR2FsbGVyeUV4dGVuc2lvbiwgRElTQUJMRURfRVhURU5TSU9OU19TVE9SQUdFX1BBVEgsIEVYVEVOU0lPTl9JTlNUQUxMX1NLSVBfV0FMS1RIUk9VR0hfQ09OVEVYVCwgRVhURU5TSU9OX0lOU1RBTExfU09VUkNFX0NPTlRFWFQsIEluc3RhbGxFeHRlbnNpb25JbmZvLCBFeHRlbnNpb25JbnN0YWxsU291cmNlLCBFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1BVQkxJU0hFUl9UUlVTVF9DT05URVhUIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlLCBJRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25TdG9yYWdlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblR5cGUsIElFeHRlbnNpb25JZGVudGlmaWVyLCBpc0FwcGxpY2F0aW9uU2NvcGVkRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RJbml0aWFsaXplciwgQWJzdHJhY3RTeW5jaHJvbmlzZXIsIGdldFN5bmNSZXNvdXJjZUxvZ0xhYmVsLCBJQWNjZXB0UmVzdWx0LCBJTWVyZ2VSZXN1bHQsIElSZXNvdXJjZVByZXZpZXcgfSBmcm9tICcuL2Fic3RyYWN0U3luY2hyb25pemVyLmpzJztcbmltcG9ydCB7IElNZXJnZVJlc3VsdCBhcyBJRXh0ZW5zaW9uTWVyZ2VSZXN1bHQsIG1lcmdlIH0gZnJvbSAnLi9leHRlbnNpb25zTWVyZ2UuanMnO1xuaW1wb3J0IHsgSUlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuL2lnbm9yZWRFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENoYW5nZSwgSVJlbW90ZVVzZXJEYXRhLCBJU3luY0RhdGEsIElTeW5jRXh0ZW5zaW9uLCBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsIElVc2VyRGF0YVN5bmNocm9uaXNlciwgSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsIElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgU3luY1Jlc291cmNlLCBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIElMb2NhbFN5bmNFeHRlbnNpb24gfSBmcm9tICcuL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcblxudHlwZSBJRXh0ZW5zaW9uUmVzb3VyY2VNZXJnZVJlc3VsdCA9IElBY2NlcHRSZXN1bHQgJiBJRXh0ZW5zaW9uTWVyZ2VSZXN1bHQ7XG5cbmludGVyZmFjZSBJRXh0ZW5zaW9uUmVzb3VyY2VQcmV2aWV3IGV4dGVuZHMgSVJlc291cmNlUHJldmlldyB7XG5cdHJlYWRvbmx5IGxvY2FsRXh0ZW5zaW9uczogSUxvY2FsU3luY0V4dGVuc2lvbltdO1xuXHRyZWFkb25seSByZW1vdGVFeHRlbnNpb25zOiBJU3luY0V4dGVuc2lvbltdIHwgbnVsbDtcblx0cmVhZG9ubHkgc2tpcHBlZEV4dGVuc2lvbnM6IElTeW5jRXh0ZW5zaW9uW107XG5cdHJlYWRvbmx5IGJ1aWx0aW5FeHRlbnNpb25zOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdIHwgbnVsbDtcblx0cmVhZG9ubHkgcHJldmlld1Jlc3VsdDogSUV4dGVuc2lvblJlc291cmNlTWVyZ2VSZXN1bHQ7XG59XG5cbmludGVyZmFjZSBJTGFzdFN5bmNVc2VyRGF0YSBleHRlbmRzIElSZW1vdGVVc2VyRGF0YSB7XG5cdHNraXBwZWRFeHRlbnNpb25zOiBJU3luY0V4dGVuc2lvbltdIHwgdW5kZWZpbmVkO1xuXHRidWlsdGluRXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSB8IHVuZGVmaW5lZDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGFyc2VBbmRNaWdyYXRlRXh0ZW5zaW9ucyhzeW5jRGF0YTogSVN5bmNEYXRhLCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlKTogUHJvbWlzZTxJU3luY0V4dGVuc2lvbltdPiB7XG5cdGNvbnN0IGV4dGVuc2lvbnMgPSBKU09OLnBhcnNlKHN5bmNEYXRhLmNvbnRlbnQpO1xuXHRpZiAoc3luY0RhdGEudmVyc2lvbiA9PT0gMVxuXHRcdHx8IHN5bmNEYXRhLnZlcnNpb24gPT09IDJcblx0KSB7XG5cdFx0Y29uc3QgYnVpbHRpbkV4dGVuc2lvbnMgPSAoYXdhaXQgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKEV4dGVuc2lvblR5cGUuU3lzdGVtKSkuZmlsdGVyKGUgPT4gZS5pc0J1aWx0aW4pO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdC8vICNyZWdpb24gTWlncmF0aW9uIGZyb20gdjEgKGVuYWJsZWQgLT4gZGlzYWJsZWQpXG5cdFx0XHRpZiAoc3luY0RhdGEudmVyc2lvbiA9PT0gMSkge1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmVuYWJsZWQgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uLmRpc2FibGVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWxldGUgZXh0ZW5zaW9uLmVuYWJsZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyAjZW5kcmVnaW9uXG5cblx0XHRcdC8vICNyZWdpb24gTWlncmF0aW9uIGZyb20gdjIgKHNldCBpbnN0YWxsZWQgcHJvcGVydHkgb24gZXh0ZW5zaW9uKVxuXHRcdFx0aWYgKHN5bmNEYXRhLnZlcnNpb24gPT09IDIpIHtcblx0XHRcdFx0aWYgKGJ1aWx0aW5FeHRlbnNpb25zLmV2ZXJ5KGluc3RhbGxlZCA9PiAhYXJlU2FtZUV4dGVuc2lvbnMoaW5zdGFsbGVkLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0XHRleHRlbnNpb24uaW5zdGFsbGVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gI2VuZHJlZ2lvblxuXHRcdH1cblx0fVxuXHRyZXR1cm4gZXh0ZW5zaW9ucztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlRXh0ZW5zaW9ucyhzeW5jRGF0YTogSVN5bmNEYXRhKTogSVN5bmNFeHRlbnNpb25bXSB7XG5cdHJldHVybiBKU09OLnBhcnNlKHN5bmNEYXRhLmNvbnRlbnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RyaW5naWZ5KGV4dGVuc2lvbnM6IElTeW5jRXh0ZW5zaW9uW10sIGZvcm1hdDogYm9vbGVhbik6IHN0cmluZyB7XG5cdGV4dGVuc2lvbnMuc29ydCgoZTEsIGUyKSA9PiB7XG5cdFx0aWYgKCFlMS5pZGVudGlmaWVyLnV1aWQgJiYgZTIuaWRlbnRpZmllci51dWlkKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdGlmIChlMS5pZGVudGlmaWVyLnV1aWQgJiYgIWUyLmlkZW50aWZpZXIudXVpZCkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdHJldHVybiBjb21wYXJlKGUxLmlkZW50aWZpZXIuaWQsIGUyLmlkZW50aWZpZXIuaWQpO1xuXHR9KTtcblx0cmV0dXJuIGZvcm1hdCA/IHRvRm9ybWF0dGVkU3RyaW5nKGV4dGVuc2lvbnMsIHt9KSA6IEpTT04uc3RyaW5naWZ5KGV4dGVuc2lvbnMpO1xufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uc1N5bmNocm9uaXNlciBleHRlbmRzIEFic3RyYWN0U3luY2hyb25pc2VyIGltcGxlbWVudHMgSVVzZXJEYXRhU3luY2hyb25pc2VyIHtcblxuXHQvKlxuXHRcdFZlcnNpb24gMyAtIEludHJvZHVjZSBpbnN0YWxsZWQgcHJvcGVydHkgdG8gc2tpcCBpbnN0YWxsaW5nIGJ1aWx0IGluIGV4dGVuc2lvbnNcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyID0gMztcblx0Ki9cblx0LyogVmVyc2lvbiA0OiBDaGFuZ2Ugc2V0dGluZ3MgZnJvbSBgc3luYy4ke3NldHRpbmd9YCB0byBgc2V0dGluZ3NTeW5jLntzZXR0aW5nfWAgKi9cblx0LyogVmVyc2lvbiA1OiBJbnRyb2R1Y2UgZXh0ZW5zaW9uIHN0YXRlICovXG5cdC8qIFZlcnNpb24gNjogQWRkZWQgaXNBcHBsaWNhdGlvblNjb3BlZCBwcm9wZXJ0eSAqL1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyID0gNjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByZXZpZXdSZXNvdXJjZTogVVJJID0gdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwgJ2V4dGVuc2lvbnMuanNvbicpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGJhc2VSZXNvdXJjZTogVVJJID0gdGhpcy5wcmV2aWV3UmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KTtcblx0cHJpdmF0ZSByZWFkb25seSBsb2NhbFJlc291cmNlOiBVUkkgPSB0aGlzLnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KTtcblx0cHJpdmF0ZSByZWFkb25seSByZW1vdGVSZXNvdXJjZTogVVJJID0gdGhpcy5wcmV2aWV3UmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjY2VwdGVkUmVzb3VyY2U6IFVSSSA9IHRoaXMucHJldmlld1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYWNjZXB0ZWQnIH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbG9jYWxFeHRlbnNpb25zUHJvdmlkZXI6IExvY2FsRXh0ZW5zaW9uc1Byb3ZpZGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdC8vIHByb2ZpbGVMb2NhdGlvbiBjaGFuZ2VzIGZvciBkZWZhdWx0IHByb2ZpbGVcblx0XHRwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLFxuXHRcdGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2U6IElJZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlIGV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlOiBJRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UgdXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoeyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5FeHRlbnNpb25zLCBwcm9maWxlIH0sIGNvbGxlY3Rpb24sIGZpbGVTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIHVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLCB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgbG9nU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0dGhpcy5sb2NhbEV4dGVuc2lvbnNQcm92aWRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxFeHRlbnNpb25zUHJvdmlkZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0RXZlbnQuYW55PGFueT4oXG5cdFx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkSW5zdGFsbEV4dGVuc2lvbnMsIChlID0+IGUuc29tZSgoeyBsb2NhbCB9KSA9PiAhIWxvY2FsKSkpLFxuXHRcdFx0XHRFdmVudC5maWx0ZXIodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbiwgKGUgPT4gIWUuZXJyb3IpKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKHVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlLCBlID0+IGUudmFsdWVDaGFuZ2VzLnNvbWUoKHsgcHJvZmlsZSwgY2hhbmdlcyB9KSA9PiB0aGlzLnN5bmNSZXNvdXJjZS5wcm9maWxlLmlkID09PSBwcm9maWxlLmlkICYmIGNoYW5nZXMuc29tZShjaGFuZ2UgPT4gY2hhbmdlLmtleSA9PT0gRElTQUJMRURfRVhURU5TSU9OU19TVE9SQUdFX1BBVEgpKSksXG5cdFx0XHRcdGV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uU3RvcmFnZVRvU3luYykoKCkgPT4gdGhpcy50cmlnZ2VyTG9jYWxDaGFuZ2UoKSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdlbmVyYXRlU3luY1ByZXZpZXcocmVtb3RlVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSwgbGFzdFN5bmNVc2VyRGF0YTogSUxhc3RTeW5jVXNlckRhdGEgfCBudWxsKTogUHJvbWlzZTxJRXh0ZW5zaW9uUmVzb3VyY2VQcmV2aWV3W10+IHtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gcmVtb3RlVXNlckRhdGEuc3luY0RhdGEgPyBhd2FpdCBwYXJzZUFuZE1pZ3JhdGVFeHRlbnNpb25zKHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhLCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlKSA6IG51bGw7XG5cdFx0Y29uc3Qgc2tpcHBlZEV4dGVuc2lvbnMgPSBsYXN0U3luY1VzZXJEYXRhPy5za2lwcGVkRXh0ZW5zaW9ucyA/PyBbXTtcblx0XHRjb25zdCBidWlsdGluRXh0ZW5zaW9ucyA9IGxhc3RTeW5jVXNlckRhdGE/LmJ1aWx0aW5FeHRlbnNpb25zID8/IG51bGw7XG5cdFx0Y29uc3QgbGFzdFN5bmNFeHRlbnNpb25zID0gbGFzdFN5bmNVc2VyRGF0YT8uc3luY0RhdGEgPyBhd2FpdCBwYXJzZUFuZE1pZ3JhdGVFeHRlbnNpb25zKGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEsIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UpIDogbnVsbDtcblxuXHRcdGNvbnN0IHsgbG9jYWxFeHRlbnNpb25zLCBpZ25vcmVkRXh0ZW5zaW9ucyB9ID0gYXdhaXQgdGhpcy5sb2NhbEV4dGVuc2lvbnNQcm92aWRlci5nZXRMb2NhbEV4dGVuc2lvbnModGhpcy5zeW5jUmVzb3VyY2UucHJvZmlsZSk7XG5cblx0XHRpZiAocmVtb3RlRXh0ZW5zaW9ucykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBNZXJnaW5nIHJlbW90ZSBleHRlbnNpb25zIHdpdGggbG9jYWwgZXh0ZW5zaW9ucy4uLmApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFJlbW90ZSBleHRlbnNpb25zIGRvZXMgbm90IGV4aXN0LiBTeW5jaHJvbml6aW5nIGV4dGVuc2lvbnMgZm9yIHRoZSBmaXJzdCB0aW1lLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgbG9jYWwsIHJlbW90ZSB9ID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBsYXN0U3luY0V4dGVuc2lvbnMsIHNraXBwZWRFeHRlbnNpb25zLCBpZ25vcmVkRXh0ZW5zaW9ucywgYnVpbHRpbkV4dGVuc2lvbnMpO1xuXHRcdGNvbnN0IHByZXZpZXdSZXN1bHQ6IElFeHRlbnNpb25SZXNvdXJjZU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0bG9jYWwsIHJlbW90ZSxcblx0XHRcdGNvbnRlbnQ6IHRoaXMuZ2V0UHJldmlld0NvbnRlbnQobG9jYWxFeHRlbnNpb25zLCBsb2NhbC5hZGRlZCwgbG9jYWwudXBkYXRlZCwgbG9jYWwucmVtb3ZlZCksXG5cdFx0XHRsb2NhbENoYW5nZTogbG9jYWwuYWRkZWQubGVuZ3RoID4gMCB8fCBsb2NhbC5yZW1vdmVkLmxlbmd0aCA+IDAgfHwgbG9jYWwudXBkYXRlZC5sZW5ndGggPiAwID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLk5vbmUsXG5cdFx0XHRyZW1vdGVDaGFuZ2U6IHJlbW90ZSAhPT0gbnVsbCA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5Ob25lLFxuXHRcdH07XG5cblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSB0aGlzLnN0cmluZ2lmeShsb2NhbEV4dGVuc2lvbnMsIGZhbHNlKTtcblx0XHRyZXR1cm4gW3tcblx0XHRcdHNraXBwZWRFeHRlbnNpb25zLFxuXHRcdFx0YnVpbHRpbkV4dGVuc2lvbnMsXG5cdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuYmFzZVJlc291cmNlLFxuXHRcdFx0YmFzZUNvbnRlbnQ6IGxhc3RTeW5jRXh0ZW5zaW9ucyA/IHRoaXMuc3RyaW5naWZ5KGxhc3RTeW5jRXh0ZW5zaW9ucywgZmFsc2UpIDogbG9jYWxDb250ZW50LFxuXHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5sb2NhbFJlc291cmNlLFxuXHRcdFx0bG9jYWxDb250ZW50LFxuXHRcdFx0bG9jYWxFeHRlbnNpb25zLFxuXHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMucmVtb3RlUmVzb3VyY2UsXG5cdFx0XHRyZW1vdGVFeHRlbnNpb25zLFxuXHRcdFx0cmVtb3RlQ29udGVudDogcmVtb3RlRXh0ZW5zaW9ucyA/IHRoaXMuc3RyaW5naWZ5KHJlbW90ZUV4dGVuc2lvbnMsIGZhbHNlKSA6IG51bGwsXG5cdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMucHJldmlld1Jlc291cmNlLFxuXHRcdFx0cHJldmlld1Jlc3VsdCxcblx0XHRcdGxvY2FsQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdGFjY2VwdGVkUmVzb3VyY2U6IHRoaXMuYWNjZXB0ZWRSZXNvdXJjZSxcblx0XHR9XTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBoYXNSZW1vdGVDaGFuZ2VkKGxhc3RTeW5jVXNlckRhdGE6IElMYXN0U3luY1VzZXJEYXRhKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgbGFzdFN5bmNFeHRlbnNpb25zOiBJU3luY0V4dGVuc2lvbltdIHwgbnVsbCA9IGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEgPyBhd2FpdCBwYXJzZUFuZE1pZ3JhdGVFeHRlbnNpb25zKGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEsIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UpIDogbnVsbDtcblx0XHRjb25zdCB7IGxvY2FsRXh0ZW5zaW9ucywgaWdub3JlZEV4dGVuc2lvbnMgfSA9IGF3YWl0IHRoaXMubG9jYWxFeHRlbnNpb25zUHJvdmlkZXIuZ2V0TG9jYWxFeHRlbnNpb25zKHRoaXMuc3luY1Jlc291cmNlLnByb2ZpbGUpO1xuXHRcdGNvbnN0IHsgcmVtb3RlIH0gPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIGxhc3RTeW5jRXh0ZW5zaW9ucywgbGFzdFN5bmNFeHRlbnNpb25zLCBsYXN0U3luY1VzZXJEYXRhLnNraXBwZWRFeHRlbnNpb25zIHx8IFtdLCBpZ25vcmVkRXh0ZW5zaW9ucywgbGFzdFN5bmNVc2VyRGF0YS5idWlsdGluRXh0ZW5zaW9ucyB8fCBbXSk7XG5cdFx0cmV0dXJuIHJlbW90ZSAhPT0gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHJldmlld0NvbnRlbnQobG9jYWxFeHRlbnNpb25zOiBJU3luY0V4dGVuc2lvbltdLCBhZGRlZDogSVN5bmNFeHRlbnNpb25bXSwgdXBkYXRlZDogSVN5bmNFeHRlbnNpb25bXSwgcmVtb3ZlZDogSUV4dGVuc2lvbklkZW50aWZpZXJbXSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcHJldmlldzogSVN5bmNFeHRlbnNpb25bXSA9IFsuLi5hZGRlZCwgLi4udXBkYXRlZF07XG5cblx0XHRjb25zdCBpZHNPclVVSURzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGFkZElkZW50aWZpZXIgPSAoaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIpID0+IHtcblx0XHRcdGlkc09yVVVJRHMuYWRkKGlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRpZiAoaWRlbnRpZmllci51dWlkKSB7XG5cdFx0XHRcdGlkc09yVVVJRHMuYWRkKGlkZW50aWZpZXIudXVpZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRwcmV2aWV3LmZvckVhY2goKHsgaWRlbnRpZmllciB9KSA9PiBhZGRJZGVudGlmaWVyKGlkZW50aWZpZXIpKTtcblx0XHRyZW1vdmVkLmZvckVhY2goYWRkSWRlbnRpZmllcik7XG5cblx0XHRmb3IgKGNvbnN0IGxvY2FsRXh0ZW5zaW9uIG9mIGxvY2FsRXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKGlkc09yVVVJRHMuaGFzKGxvY2FsRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSkgfHwgKGxvY2FsRXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCAmJiBpZHNPclVVSURzLmhhcyhsb2NhbEV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQpKSkge1xuXHRcdFx0XHQvLyBza2lwXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cHJldmlldy5wdXNoKGxvY2FsRXh0ZW5zaW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5zdHJpbmdpZnkocHJldmlldywgZmFsc2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldE1lcmdlUmVzdWx0KHJlc291cmNlUHJldmlldzogSUV4dGVuc2lvblJlc291cmNlUHJldmlldywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWVyZ2VSZXN1bHQ+IHtcblx0XHRyZXR1cm4geyAuLi5yZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdCwgaGFzQ29uZmxpY3RzOiBmYWxzZSB9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldEFjY2VwdFJlc3VsdChyZXNvdXJjZVByZXZpZXc6IElFeHRlbnNpb25SZXNvdXJjZVByZXZpZXcsIHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUV4dGVuc2lvblJlc291cmNlTWVyZ2VSZXN1bHQ+IHtcblxuXHRcdC8qIEFjY2VwdCBsb2NhbCByZXNvdXJjZSAqL1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsKHJlc291cmNlLCB0aGlzLmxvY2FsUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hY2NlcHRMb2NhbChyZXNvdXJjZVByZXZpZXcpO1xuXHRcdH1cblxuXHRcdC8qIEFjY2VwdCByZW1vdGUgcmVzb3VyY2UgKi9cblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5yZW1vdGVSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmFjY2VwdFJlbW90ZShyZXNvdXJjZVByZXZpZXcpO1xuXHRcdH1cblxuXHRcdC8qIEFjY2VwdCBwcmV2aWV3IHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwocmVzb3VyY2UsIHRoaXMucHJldmlld1Jlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlUHJldmlldy5wcmV2aWV3UmVzdWx0O1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBSZXNvdXJjZTogJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhY2NlcHRMb2NhbChyZXNvdXJjZVByZXZpZXc6IElFeHRlbnNpb25SZXNvdXJjZVByZXZpZXcpOiBQcm9taXNlPElFeHRlbnNpb25SZXNvdXJjZU1lcmdlUmVzdWx0PiB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKHVuZGVmaW5lZCwgdGhpcy5zeW5jUmVzb3VyY2UucHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGlnbm9yZWRFeHRlbnNpb25zID0gdGhpcy5pZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldElnbm9yZWRFeHRlbnNpb25zKGluc3RhbGxlZEV4dGVuc2lvbnMpO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSByZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCA/IEpTT04ucGFyc2UocmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQpIDogbnVsbDtcblx0XHRjb25zdCBtZXJnZVJlc3VsdCA9IG1lcmdlKHJlc291cmNlUHJldmlldy5sb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIHJlc291cmNlUHJldmlldy5za2lwcGVkRXh0ZW5zaW9ucywgaWdub3JlZEV4dGVuc2lvbnMsIHJlc291cmNlUHJldmlldy5idWlsdGluRXh0ZW5zaW9ucyk7XG5cdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlIH0gPSBtZXJnZVJlc3VsdDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LmxvY2FsQ29udGVudCxcblx0XHRcdGxvY2FsLFxuXHRcdFx0cmVtb3RlLFxuXHRcdFx0bG9jYWxDaGFuZ2U6IGxvY2FsLmFkZGVkLmxlbmd0aCA+IDAgfHwgbG9jYWwucmVtb3ZlZC5sZW5ndGggPiAwIHx8IGxvY2FsLnVwZGF0ZWQubGVuZ3RoID4gMCA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5Ob25lLFxuXHRcdFx0cmVtb3RlQ2hhbmdlOiByZW1vdGUgIT09IG51bGwgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuTm9uZSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhY2NlcHRSZW1vdGUocmVzb3VyY2VQcmV2aWV3OiBJRXh0ZW5zaW9uUmVzb3VyY2VQcmV2aWV3KTogUHJvbWlzZTxJRXh0ZW5zaW9uUmVzb3VyY2VNZXJnZVJlc3VsdD4ge1xuXHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCh1bmRlZmluZWQsIHRoaXMuc3luY1Jlc291cmNlLnByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRjb25zdCBpZ25vcmVkRXh0ZW5zaW9ucyA9IHRoaXMuaWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRJZ25vcmVkRXh0ZW5zaW9ucyhpbnN0YWxsZWRFeHRlbnNpb25zKTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gcmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQgPyBKU09OLnBhcnNlKHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50KSA6IG51bGw7XG5cdFx0aWYgKHJlbW90ZUV4dGVuc2lvbnMgIT09IG51bGwpIHtcblx0XHRcdGNvbnN0IG1lcmdlUmVzdWx0ID0gbWVyZ2UocmVzb3VyY2VQcmV2aWV3LmxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVzb3VyY2VQcmV2aWV3LmxvY2FsRXh0ZW5zaW9ucywgW10sIGlnbm9yZWRFeHRlbnNpb25zLCByZXNvdXJjZVByZXZpZXcuYnVpbHRpbkV4dGVuc2lvbnMpO1xuXHRcdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlIH0gPSBtZXJnZVJlc3VsdDtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50LFxuXHRcdFx0XHRsb2NhbCxcblx0XHRcdFx0cmVtb3RlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogbG9jYWwuYWRkZWQubGVuZ3RoID4gMCB8fCBsb2NhbC5yZW1vdmVkLmxlbmd0aCA+IDAgfHwgbG9jYWwudXBkYXRlZC5sZW5ndGggPiAwID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLk5vbmUsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogcmVtb3RlICE9PSBudWxsID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLk5vbmUsXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCxcblx0XHRcdFx0bG9jYWw6IHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgdXBkYXRlZDogW10gfSxcblx0XHRcdFx0cmVtb3RlOiBudWxsLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBhcHBseVJlc3VsdChyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCByZXNvdXJjZVByZXZpZXdzOiBbSUV4dGVuc2lvblJlc291cmNlUHJldmlldywgSUV4dGVuc2lvblJlc291cmNlTWVyZ2VSZXN1bHRdW10sIGZvcmNlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHsgc2tpcHBlZEV4dGVuc2lvbnMsIGJ1aWx0aW5FeHRlbnNpb25zLCBsb2NhbEV4dGVuc2lvbnMgfSA9IHJlc291cmNlUHJldmlld3NbMF1bMF07XG5cdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlLCBsb2NhbENoYW5nZSwgcmVtb3RlQ2hhbmdlIH0gPSByZXNvdXJjZVByZXZpZXdzWzBdWzFdO1xuXG5cdFx0aWYgKGxvY2FsQ2hhbmdlID09PSBDaGFuZ2UuTm9uZSAmJiByZW1vdGVDaGFuZ2UgPT09IENoYW5nZS5Ob25lKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogTm8gY2hhbmdlcyBmb3VuZCBkdXJpbmcgc3luY2hyb25pemluZyBleHRlbnNpb25zLmApO1xuXHRcdH1cblxuXHRcdGlmIChsb2NhbENoYW5nZSAhPT0gQ2hhbmdlLk5vbmUpIHtcblx0XHRcdGF3YWl0IHRoaXMuYmFja3VwTG9jYWwoSlNPTi5zdHJpbmdpZnkobG9jYWxFeHRlbnNpb25zKSk7XG5cdFx0XHRza2lwcGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMubG9jYWxFeHRlbnNpb25zUHJvdmlkZXIudXBkYXRlTG9jYWxFeHRlbnNpb25zKGxvY2FsLmFkZGVkLCBsb2NhbC5yZW1vdmVkLCBsb2NhbC51cGRhdGVkLCBza2lwcGVkRXh0ZW5zaW9ucywgdGhpcy5zeW5jUmVzb3VyY2UucHJvZmlsZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlbW90ZSkge1xuXHRcdFx0Ly8gdXBkYXRlIHJlbW90ZVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyByZW1vdGUgZXh0ZW5zaW9ucy4uLmApO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHJlbW90ZS5hbGwpO1xuXHRcdFx0cmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0aGlzLnVwZGF0ZVJlbW90ZVVzZXJEYXRhKGNvbnRlbnQsIGZvcmNlID8gbnVsbCA6IHJlbW90ZVVzZXJEYXRhLnJlZik7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCByZW1vdGUgZXh0ZW5zaW9ucy4ke3JlbW90ZS5hZGRlZC5sZW5ndGggPyBgIEFkZGVkOiAke0pTT04uc3RyaW5naWZ5KHJlbW90ZS5hZGRlZC5tYXAoZSA9PiBlLmlkZW50aWZpZXIuaWQpKX0uYCA6ICcnfSR7cmVtb3RlLnVwZGF0ZWQubGVuZ3RoID8gYCBVcGRhdGVkOiAke0pTT04uc3RyaW5naWZ5KHJlbW90ZS51cGRhdGVkLm1hcChlID0+IGUuaWRlbnRpZmllci5pZCkpfS5gIDogJyd9JHtyZW1vdGUucmVtb3ZlZC5sZW5ndGggPyBgIFJlbW92ZWQ6ICR7SlNPTi5zdHJpbmdpZnkocmVtb3RlLnJlbW92ZWQubWFwKGUgPT4gZS5pZGVudGlmaWVyLmlkKSl9LmAgOiAnJ31gKTtcblx0XHR9XG5cblx0XHRpZiAobGFzdFN5bmNVc2VyRGF0YT8ucmVmICE9PSByZW1vdGVVc2VyRGF0YS5yZWYpIHtcblx0XHRcdC8vIHVwZGF0ZSBsYXN0IHN5bmNcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRpbmcgbGFzdCBzeW5jaHJvbml6ZWQgZXh0ZW5zaW9ucy4uLmApO1xuXHRcdFx0YnVpbHRpbkV4dGVuc2lvbnMgPSB0aGlzLmNvbXB1dGVCdWlsdGluRXh0ZW5zaW9ucyhsb2NhbEV4dGVuc2lvbnMsIGJ1aWx0aW5FeHRlbnNpb25zKTtcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTGFzdFN5bmNVc2VyRGF0YShyZW1vdGVVc2VyRGF0YSwgeyBza2lwcGVkRXh0ZW5zaW9ucywgYnVpbHRpbkV4dGVuc2lvbnMgfSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBsYXN0IHN5bmNocm9uaXplZCBleHRlbnNpb25zLiR7c2tpcHBlZEV4dGVuc2lvbnMubGVuZ3RoID8gYCBTa2lwcGVkOiAke0pTT04uc3RyaW5naWZ5KHNraXBwZWRFeHRlbnNpb25zLm1hcChlID0+IGUuaWRlbnRpZmllci5pZCkpfS5gIDogJyd9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlQnVpbHRpbkV4dGVuc2lvbnMobG9jYWxFeHRlbnNpb25zOiBJTG9jYWxTeW5jRXh0ZW5zaW9uW10sIHByZXZpb3VzQnVpbHRpbkV4dGVuc2lvbnM6IElFeHRlbnNpb25JZGVudGlmaWVyW10gfCBudWxsKTogSUV4dGVuc2lvbklkZW50aWZpZXJbXSB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zU2V0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgYnVpbHRpbkV4dGVuc2lvbnM6IElFeHRlbnNpb25JZGVudGlmaWVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGxvY2FsRXh0ZW5zaW9uIG9mIGxvY2FsRXh0ZW5zaW9ucykge1xuXHRcdFx0bG9jYWxFeHRlbnNpb25zU2V0LmFkZChsb2NhbEV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0aWYgKCFsb2NhbEV4dGVuc2lvbi5pbnN0YWxsZWQpIHtcblx0XHRcdFx0YnVpbHRpbkV4dGVuc2lvbnMucHVzaChsb2NhbEV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHByZXZpb3VzQnVpbHRpbkV4dGVuc2lvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgYnVpbHRpbkV4dGVuc2lvbiBvZiBwcmV2aW91c0J1aWx0aW5FeHRlbnNpb25zKSB7XG5cdFx0XHRcdC8vIEFkZCBwcmV2aW91cyBidWlsdGluIGV4dGVuc2lvbiBpZiBpdCBkb2VzIG5vdCBleGlzdCBpbiBsb2NhbCBleHRlbnNpb25zXG5cdFx0XHRcdGlmICghbG9jYWxFeHRlbnNpb25zU2V0LmhhcyhidWlsdGluRXh0ZW5zaW9uLmlkLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRcdFx0YnVpbHRpbkV4dGVuc2lvbnMucHVzaChidWlsdGluRXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gYnVpbHRpbkV4dGVuc2lvbnM7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlQ29udGVudCh1cmk6IFVSSSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsKHRoaXMucmVtb3RlUmVzb3VyY2UsIHVyaSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWwodGhpcy5iYXNlUmVzb3VyY2UsIHVyaSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWwodGhpcy5sb2NhbFJlc291cmNlLCB1cmkpXG5cdFx0XHR8fCB0aGlzLmV4dFVyaS5pc0VxdWFsKHRoaXMuYWNjZXB0ZWRSZXNvdXJjZSwgdXJpKVxuXHRcdCkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMucmVzb2x2ZVByZXZpZXdDb250ZW50KHVyaSk7XG5cdFx0XHRyZXR1cm4gY29udGVudCA/IHRoaXMuc3RyaW5naWZ5KEpTT04ucGFyc2UoY29udGVudCksIHRydWUpIDogY29udGVudDtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0cmluZ2lmeShleHRlbnNpb25zOiBJU3luY0V4dGVuc2lvbltdLCBmb3JtYXQ6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdHJldHVybiBzdHJpbmdpZnkoZXh0ZW5zaW9ucywgZm9ybWF0KTtcblx0fVxuXG5cdGFzeW5jIGhhc0xvY2FsRGF0YSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBsb2NhbEV4dGVuc2lvbnMgfSA9IGF3YWl0IHRoaXMubG9jYWxFeHRlbnNpb25zUHJvdmlkZXIuZ2V0TG9jYWxFeHRlbnNpb25zKHRoaXMuc3luY1Jlc291cmNlLnByb2ZpbGUpO1xuXHRcdFx0aWYgKGxvY2FsRXh0ZW5zaW9ucy5zb21lKGUgPT4gZS5pbnN0YWxsZWQgfHwgZS5kaXNhYmxlZCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8qIGlnbm9yZSBlcnJvciAqL1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgTG9jYWxFeHRlbnNpb25zUHJvdmlkZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJSWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2U6IElJZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGdldExvY2FsRXh0ZW5zaW9ucyhwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTx7IGxvY2FsRXh0ZW5zaW9uczogSUxvY2FsU3luY0V4dGVuc2lvbltdOyBpZ25vcmVkRXh0ZW5zaW9uczogc3RyaW5nW10gfT4ge1xuXHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCh1bmRlZmluZWQsIHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRjb25zdCBpZ25vcmVkRXh0ZW5zaW9ucyA9IHRoaXMuaWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRJZ25vcmVkRXh0ZW5zaW9ucyhpbnN0YWxsZWRFeHRlbnNpb25zKTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLndpdGhQcm9maWxlU2NvcGVkU2VydmljZXMocHJvZmlsZSwgYXN5bmMgKGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBleHRlbnNpb25TdG9yYWdlU2VydmljZSkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzYWJsZWRFeHRlbnNpb25zID0gZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZ2V0RGlzYWJsZWRFeHRlbnNpb25zKCk7XG5cdFx0XHRyZXR1cm4gaW5zdGFsbGVkRXh0ZW5zaW9uc1xuXHRcdFx0XHQubWFwKGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgeyBpZGVudGlmaWVyLCBpc0J1aWx0aW4sIG1hbmlmZXN0LCBwcmVSZWxlYXNlLCBwaW5uZWQsIGlzQXBwbGljYXRpb25TY29wZWQgfSA9IGV4dGVuc2lvbjtcblx0XHRcdFx0XHRjb25zdCBzeW5jRXh0ZW5zaW9uOiBJTG9jYWxTeW5jRXh0ZW5zaW9uID0geyBpZGVudGlmaWVyLCBwcmVSZWxlYXNlLCB2ZXJzaW9uOiBtYW5pZmVzdC52ZXJzaW9uLCBwaW5uZWQ6ICEhcGlubmVkIH07XG5cdFx0XHRcdFx0aWYgKGlzQXBwbGljYXRpb25TY29wZWQgJiYgIWlzQXBwbGljYXRpb25TY29wZWRFeHRlbnNpb24obWFuaWZlc3QpKSB7XG5cdFx0XHRcdFx0XHRzeW5jRXh0ZW5zaW9uLmlzQXBwbGljYXRpb25TY29wZWQgPSBpc0FwcGxpY2F0aW9uU2NvcGVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy5wcm9kdWN0U2VydmljZS5idWlsdEluRXh0ZW5zaW9uc0VuYWJsZWRXaXRoQXV0b1VwZGF0ZXM/LnNvbWUoaWQgPT4gaWQudG9Mb3dlckNhc2UoKSA9PT0gaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdFx0c3luY0V4dGVuc2lvbi5pc0FwcGxpY2F0aW9uU2NvcGVkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGRpc2FibGVkRXh0ZW5zaW9ucy5zb21lKGRpc2FibGVkRXh0ZW5zaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGRpc2FibGVkRXh0ZW5zaW9uLCBpZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0XHRcdHN5bmNFeHRlbnNpb24uZGlzYWJsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIWlzQnVpbHRpbikge1xuXHRcdFx0XHRcdFx0c3luY0V4dGVuc2lvbi5pbnN0YWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3Qga2V5cyA9IGV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlLmdldEtleXNGb3JTeW5jKHsgaWQ6IGlkZW50aWZpZXIuaWQsIHZlcnNpb246IG1hbmlmZXN0LnZlcnNpb24gfSk7XG5cdFx0XHRcdFx0XHRpZiAoa2V5cykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25TdG9yYWdlU3RhdGUgPSBleHRlbnNpb25TdG9yYWdlU2VydmljZS5nZXRFeHRlbnNpb25TdGF0ZShleHRlbnNpb24sIHRydWUpIHx8IHt9O1xuXHRcdFx0XHRcdFx0XHRzeW5jRXh0ZW5zaW9uLnN0YXRlID0gT2JqZWN0LmtleXMoZXh0ZW5zaW9uU3RvcmFnZVN0YXRlKS5yZWR1Y2UoKHN0YXRlOiBJU3RyaW5nRGljdGlvbmFyeTxhbnk+LCBrZXkpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoa2V5cy5pbmNsdWRlcyhrZXkpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzdGF0ZVtrZXldID0gZXh0ZW5zaW9uU3RvcmFnZVN0YXRlW2tleV07XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdFx0XHRcdFx0fSwge30pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHtnZXRTeW5jUmVzb3VyY2VMb2dMYWJlbChTeW5jUmVzb3VyY2UuRXh0ZW5zaW9ucywgcHJvZmlsZSl9OiBFcnJvciB3aGlsZSBwYXJzaW5nIGV4dGVuc2lvbiBzdGF0ZWAsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gc3luY0V4dGVuc2lvbjtcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHsgbG9jYWxFeHRlbnNpb25zLCBpZ25vcmVkRXh0ZW5zaW9ucyB9O1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlTG9jYWxFeHRlbnNpb25zKGFkZGVkOiBJU3luY0V4dGVuc2lvbltdLCByZW1vdmVkOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdLCB1cGRhdGVkOiBJU3luY0V4dGVuc2lvbltdLCBza2lwcGVkRXh0ZW5zaW9uczogSVN5bmNFeHRlbnNpb25bXSwgcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8SVN5bmNFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHN5bmNSZXNvdXJjZUxvZ0xhYmVsID0gZ2V0U3luY1Jlc291cmNlTG9nTGFiZWwoU3luY1Jlc291cmNlLkV4dGVuc2lvbnMsIHByb2ZpbGUpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNUb0luc3RhbGw6IEluc3RhbGxFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRjb25zdCBzeW5jRXh0ZW5zaW9uc1RvSW5zdGFsbCA9IG5ldyBNYXA8c3RyaW5nLCBJU3luY0V4dGVuc2lvbj4oKTtcblx0XHRjb25zdCByZW1vdmVGcm9tU2tpcHBlZDogSUV4dGVuc2lvbklkZW50aWZpZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGFkZFRvU2tpcHBlZDogSVN5bmNFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCh1bmRlZmluZWQsIHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblxuXHRcdC8vIDEuIFN5bmMgZXh0ZW5zaW9ucyBzdGF0ZSBmaXJzdCBzbyB0aGF0IHRoZSBzdG9yYWdlIGlzIGZsdXNoZWQgYW5kIHVwZGF0ZWQgaW4gYWxsIG9wZW5lZCB3aW5kb3dzXG5cdFx0aWYgKGFkZGVkLmxlbmd0aCB8fCB1cGRhdGVkLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgdGhpcy53aXRoUHJvZmlsZVNjb3BlZFNlcnZpY2VzKHByb2ZpbGUsIGFzeW5jIChleHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UpID0+IHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChbLi4uYWRkZWQsIC4uLnVwZGF0ZWRdLm1hcChhc3luYyBlID0+IHtcblx0XHRcdFx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb24gPSBpbnN0YWxsZWRFeHRlbnNpb25zLmZpbmQoaW5zdGFsbGVkID0+IGFyZVNhbWVFeHRlbnNpb25zKGluc3RhbGxlZC5pZGVudGlmaWVyLCBlLmlkZW50aWZpZXIpKTtcblxuXHRcdFx0XHRcdC8vIEJ1aWx0aW4gRXh0ZW5zaW9uIFN5bmM6IEVuYWJsZW1lbnQgJiBTdGF0ZVxuXHRcdFx0XHRcdGlmIChpbnN0YWxsZWRFeHRlbnNpb24gJiYgaW5zdGFsbGVkRXh0ZW5zaW9uLmlzQnVpbHRpbikge1xuXHRcdFx0XHRcdFx0aWYgKGUuc3RhdGUgJiYgaW5zdGFsbGVkRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24gPT09IGUudmVyc2lvbikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvblN0YXRlKGUuc3RhdGUsIGluc3RhbGxlZEV4dGVuc2lvbiwgaW5zdGFsbGVkRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24sIGV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGlzRGlzYWJsZWQgPSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXREaXNhYmxlZEV4dGVuc2lvbnMoKS5zb21lKGRpc2FibGVkRXh0ZW5zaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGRpc2FibGVkRXh0ZW5zaW9uLCBlLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0XHRcdGlmIChpc0Rpc2FibGVkICE9PSAhIWUuZGlzYWJsZWQpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGUuZGlzYWJsZWQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBEaXNhYmxpbmcgZXh0ZW5zaW9uLi4uYCwgZS5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5kaXNhYmxlRXh0ZW5zaW9uKGUuaWRlbnRpZmllcik7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBEaXNhYmxlZCBleHRlbnNpb25gLCBlLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IEVuYWJsaW5nIGV4dGVuc2lvbi4uLmAsIGUuaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlRXh0ZW5zaW9uKGUuaWRlbnRpZmllcik7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBFbmFibGVkIGV4dGVuc2lvbmAsIGUuaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJlbW92ZUZyb21Ta2lwcGVkLnB1c2goZS5pZGVudGlmaWVyKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBVc2VyIEV4dGVuc2lvbiBTeW5jOiBJbnN0YWxsL1VwZGF0ZSwgRW5hYmxlbWVudCAmIFN0YXRlXG5cdFx0XHRcdFx0Y29uc3QgdmVyc2lvbiA9IGUucGlubmVkID8gZS52ZXJzaW9uIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IChhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgLi4uZS5pZGVudGlmaWVyLCB2ZXJzaW9uLCBwcmVSZWxlYXNlOiB2ZXJzaW9uID8gdW5kZWZpbmVkIDogZS5wcmVSZWxlYXNlIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlbMF07XG5cblx0XHRcdFx0XHQvKiBVcGRhdGUgZXh0ZW5zaW9uIHN0YXRlIG9ubHkgaWZcblx0XHRcdFx0XHQgKlx0ZXh0ZW5zaW9uIGlzIGluc3RhbGxlZCBhbmQgdmVyc2lvbiBpcyBzYW1lIGFzIHN5bmNlZCB2ZXJzaW9uIG9yXG5cdFx0XHRcdFx0ICpcdGV4dGVuc2lvbiBpcyBub3QgaW5zdGFsbGVkIGFuZCBpbnN0YWxsYWJsZVxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdGlmIChlLnN0YXRlICYmXG5cdFx0XHRcdFx0XHQoaW5zdGFsbGVkRXh0ZW5zaW9uID8gaW5zdGFsbGVkRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24gPT09IGUudmVyc2lvbiAvKiBJbnN0YWxsZWQgYW5kIHJlbW90ZSBoYXMgc2FtZSB2ZXJzaW9uICovXG5cdFx0XHRcdFx0XHRcdDogISFleHRlbnNpb24gLyogSW5zdGFsbGFibGUgKi8pXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvblN0YXRlKGUuc3RhdGUsIGluc3RhbGxlZEV4dGVuc2lvbiB8fCBleHRlbnNpb24sIGluc3RhbGxlZEV4dGVuc2lvbj8ubWFuaWZlc3QudmVyc2lvbiwgZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGlzRGlzYWJsZWQgPSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXREaXNhYmxlZEV4dGVuc2lvbnMoKS5zb21lKGRpc2FibGVkRXh0ZW5zaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGRpc2FibGVkRXh0ZW5zaW9uLCBlLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0XHRcdFx0aWYgKGlzRGlzYWJsZWQgIT09ICEhZS5kaXNhYmxlZCkge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChlLmRpc2FibGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBEaXNhYmxpbmcgZXh0ZW5zaW9uLi4uYCwgZS5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24udmVyc2lvbik7XG5cdFx0XHRcdFx0XHRcdFx0XHRhd2FpdCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5kaXNhYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogRGlzYWJsZWQgZXh0ZW5zaW9uYCwgZS5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24udmVyc2lvbik7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IEVuYWJsaW5nIGV4dGVuc2lvbi4uLmAsIGUuaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uLnZlcnNpb24pO1xuXHRcdFx0XHRcdFx0XHRcdFx0YXdhaXQgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogRW5hYmxlZCBleHRlbnNpb25gLCBlLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbi52ZXJzaW9uKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRpZiAoIWluc3RhbGxlZEV4dGVuc2lvbiAvLyBJbnN0YWxsIGlmIHRoZSBleHRlbnNpb24gZG9lcyBub3QgZXhpc3Rcblx0XHRcdFx0XHRcdFx0XHR8fCBpbnN0YWxsZWRFeHRlbnNpb24ucHJlUmVsZWFzZSAhPT0gZS5wcmVSZWxlYXNlIC8vIEluc3RhbGwgaWYgdGhlIGV4dGVuc2lvbiBwcmUtcmVsZWFzZSBwcmVmZXJlbmNlIGhhcyBjaGFuZ2VkXG5cdFx0XHRcdFx0XHRcdFx0fHwgaW5zdGFsbGVkRXh0ZW5zaW9uLnBpbm5lZCAhPT0gZS5waW5uZWQgIC8vIEluc3RhbGwgaWYgdGhlIGV4dGVuc2lvbiBwaW5uZWQgcHJlZmVyZW5jZSBoYXMgY2hhbmdlZFxuXHRcdFx0XHRcdFx0XHRcdHx8ICh2ZXJzaW9uICYmIGluc3RhbGxlZEV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uICE9PSB2ZXJzaW9uKSAgLy8gSW5zdGFsbCBpZiB0aGUgZXh0ZW5zaW9uIHZlcnNpb24gaGFzIGNoYW5nZWRcblx0XHRcdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuY2FuSW5zdGFsbChleHRlbnNpb24pID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb25zVG9JbnN0YWxsLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb24sIG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpc01hY2hpbmVTY29wZWQ6IGZhbHNlIC8qIHNldCBpc01hY2hpbmVTY29wZWQgdmFsdWUgdG8gcHJldmVudCBpbnN0YWxsIGFuZCBzeW5jIGRpYWxvZyBpbiB3ZWIgKi8sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZG9ub3RJbmNsdWRlUGFja0FuZERlcGVuZGVuY2llczogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpbnN0YWxsR2l2ZW5WZXJzaW9uOiBlLnBpbm5lZCAmJiAhIWUudmVyc2lvbixcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRwaW5uZWQ6IGUucGlubmVkLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbjogZS5wcmVSZWxlYXNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHByZVJlbGVhc2U6IGUucHJlUmVsZWFzZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRwcm9maWxlTG9jYXRpb246IHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGlzQXBwbGljYXRpb25TY29wZWQ6IGUuaXNBcHBsaWNhdGlvblNjb3BlZCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb250ZXh0OiB7IFtFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1dBTEtUSFJPVUdIX0NPTlRFWFRdOiB0cnVlLCBbRVhURU5TSU9OX0lOU1RBTExfU09VUkNFX0NPTlRFWFRdOiBFeHRlbnNpb25JbnN0YWxsU291cmNlLlNFVFRJTkdTX1NZTkMsIFtFWFRFTlNJT05fSU5TVEFMTF9TS0lQX1BVQkxJU0hFUl9UUlVTVF9DT05URVhUXTogdHJ1ZSB9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0c3luY0V4dGVuc2lvbnNUb0luc3RhbGwuc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCksIGUpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IFNraXBwZWQgc3luY2hyb25pemluZyBleHRlbnNpb24gYmVjYXVzZSBpdCBjYW5ub3QgYmUgaW5zdGFsbGVkLmAsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRhZGRUb1NraXBwZWQucHVzaChlKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdGFkZFRvU2tpcHBlZC5wdXNoKGUpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IFNraXBwZWQgc3luY2hyb25pemluZyBleHRlbnNpb25gLCBleHRlbnNpb24uZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhZGRUb1NraXBwZWQucHVzaChlKTtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogU2tpcHBlZCBzeW5jaHJvbml6aW5nIGV4dGVuc2lvbiBiZWNhdXNlIHRoZSBleHRlbnNpb24gaXMgbm90IGZvdW5kLmAsIGUuaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyAyLiBOZXh0IHVuaW5zdGFsbCB0aGUgcmVtb3ZlZCBleHRlbnNpb25zXG5cdFx0aWYgKHJlbW92ZWQubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zVG9SZW1vdmUgPSBpbnN0YWxsZWRFeHRlbnNpb25zLmZpbHRlcigoeyBpZGVudGlmaWVyLCBpc0J1aWx0aW4gfSkgPT4gIWlzQnVpbHRpbiAmJiByZW1vdmVkLnNvbWUociA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpZGVudGlmaWVyLCByKSkpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChleHRlbnNpb25zVG9SZW1vdmUubWFwKGFzeW5jIGV4dGVuc2lvblRvUmVtb3ZlID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3N5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVW5pbnN0YWxsaW5nIGxvY2FsIGV4dGVuc2lvbi4uLmAsIGV4dGVuc2lvblRvUmVtb3ZlLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnVuaW5zdGFsbChleHRlbnNpb25Ub1JlbW92ZSwgeyBkb25vdEluY2x1ZGVQYWNrOiB0cnVlLCBkb25vdENoZWNrRGVwZW5kZW50czogdHJ1ZSwgcHJvZmlsZUxvY2F0aW9uOiBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSB9KTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBVbmluc3RhbGxlZCBsb2NhbCBleHRlbnNpb24uYCwgZXh0ZW5zaW9uVG9SZW1vdmUuaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdHJlbW92ZUZyb21Ta2lwcGVkLnB1c2goZXh0ZW5zaW9uVG9SZW1vdmUuaWRlbnRpZmllcik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gMy4gSW5zdGFsbCBleHRlbnNpb25zIGF0IHRoZSBlbmRcblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoZXh0ZW5zaW9uc1RvSW5zdGFsbCk7XG5cdFx0Zm9yIChjb25zdCB7IGlkZW50aWZpZXIsIGxvY2FsLCBlcnJvciwgc291cmNlIH0gb2YgcmVzdWx0cykge1xuXHRcdFx0Y29uc3QgZ2FsbGVyeSA9IHNvdXJjZSBhcyBJR2FsbGVyeUV4dGVuc2lvbjtcblx0XHRcdGlmIChsb2NhbCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IEluc3RhbGxlZCBleHRlbnNpb24uYCwgaWRlbnRpZmllci5pZCwgZ2FsbGVyeS52ZXJzaW9uKTtcblx0XHRcdFx0cmVtb3ZlRnJvbVNraXBwZWQucHVzaChpZGVudGlmaWVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGUgPSBzeW5jRXh0ZW5zaW9uc1RvSW5zdGFsbC5nZXQoaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0aWYgKGUpIHtcblx0XHRcdFx0XHRhZGRUb1NraXBwZWQucHVzaChlKTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHtzeW5jUmVzb3VyY2VMb2dMYWJlbH06IFNraXBwZWQgc3luY2hyb25pemluZyBleHRlbnNpb25gLCBnYWxsZXJ5LmRpc3BsYXlOYW1lIHx8IGdhbGxlcnkuaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yICYmIFtFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkluY29tcGF0aWJsZSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbmNvbXBhdGlibGVBcGksIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuSW5jb21wYXRpYmxlVGFyZ2V0UGxhdGZvcm1dLmluY2x1ZGVzKGVycm9yLmNvZGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7c3luY1Jlc291cmNlTG9nTGFiZWx9OiBTa2lwcGVkIHN5bmNocm9uaXppbmcgZXh0ZW5zaW9uIGJlY2F1c2UgdGhlIGNvbXBhdGlibGUgZXh0ZW5zaW9uIGlzIG5vdCBmb3VuZC5gLCBnYWxsZXJ5LmRpc3BsYXlOYW1lIHx8IGdhbGxlcnkuaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3U2tpcHBlZEV4dGVuc2lvbnM6IElTeW5jRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNraXBwZWRFeHRlbnNpb24gb2Ygc2tpcHBlZEV4dGVuc2lvbnMpIHtcblx0XHRcdGlmICghcmVtb3ZlRnJvbVNraXBwZWQuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUsIHNraXBwZWRFeHRlbnNpb24uaWRlbnRpZmllcikpKSB7XG5cdFx0XHRcdG5ld1NraXBwZWRFeHRlbnNpb25zLnB1c2goc2tpcHBlZEV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc2tpcHBlZEV4dGVuc2lvbiBvZiBhZGRUb1NraXBwZWQpIHtcblx0XHRcdGlmICghbmV3U2tpcHBlZEV4dGVuc2lvbnMuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgc2tpcHBlZEV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0bmV3U2tpcHBlZEV4dGVuc2lvbnMucHVzaChza2lwcGVkRXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5ld1NraXBwZWRFeHRlbnNpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFeHRlbnNpb25TdGF0ZShzdGF0ZTogSVN0cmluZ0RpY3Rpb25hcnk8YW55PiwgZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24gfCBJR2FsbGVyeUV4dGVuc2lvbiwgdmVyc2lvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBleHRlbnNpb25TdG9yYWdlU2VydmljZTogSUV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlKTogdm9pZCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU3RhdGUgPSBleHRlbnNpb25TdG9yYWdlU2VydmljZS5nZXRFeHRlbnNpb25TdGF0ZShleHRlbnNpb24sIHRydWUpIHx8IHt9O1xuXHRcdGNvbnN0IGtleXMgPSB2ZXJzaW9uID8gZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UuZ2V0S2V5c0ZvclN5bmMoeyBpZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHZlcnNpb24gfSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGtleXMpIHtcblx0XHRcdGtleXMuZm9yRWFjaChrZXkgPT4geyBleHRlbnNpb25TdGF0ZVtrZXldID0gc3RhdGVba2V5XTsgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdE9iamVjdC5rZXlzKHN0YXRlKS5mb3JFYWNoKGtleSA9PiBleHRlbnNpb25TdGF0ZVtrZXldID0gc3RhdGVba2V5XSk7XG5cdFx0fVxuXHRcdGV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlLnNldEV4dGVuc2lvblN0YXRlKGV4dGVuc2lvbiwgZXh0ZW5zaW9uU3RhdGUsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3aXRoUHJvZmlsZVNjb3BlZFNlcnZpY2VzPFQ+KHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsIGZuOiAoZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2U6IElFeHRlbnNpb25TdG9yYWdlU2VydmljZSkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuXHRcdHJldHVybiB0aGlzLnVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLndpdGhQcm9maWxlU2NvcGVkU3RvcmFnZVNlcnZpY2UocHJvZmlsZSxcblx0XHRcdGFzeW5jIHN0b3JhZ2VTZXJ2aWNlID0+IHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlXSkpKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UpKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UpKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgZm4oZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIGV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uc0luaXRpYWxpemVyUHJldmlld1Jlc3VsdCB7XG5cdHJlYWRvbmx5IGluc3RhbGxlZEV4dGVuc2lvbnM6IElMb2NhbEV4dGVuc2lvbltdO1xuXHRyZWFkb25seSBkaXNhYmxlZEV4dGVuc2lvbnM6IElFeHRlbnNpb25JZGVudGlmaWVyW107XG5cdHJlYWRvbmx5IG5ld0V4dGVuc2lvbnM6IChJRXh0ZW5zaW9uSWRlbnRpZmllciAmIHsgcHJlUmVsZWFzZTogYm9vbGVhbiB9KVtdO1xuXHRyZWFkb25seSByZW1vdGVFeHRlbnNpb25zOiBJU3luY0V4dGVuc2lvbltdO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RFeHRlbnNpb25zSW5pdGlhbGl6ZXIgZXh0ZW5kcyBBYnN0cmFjdEluaXRpYWxpemVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2U6IElJZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihTeW5jUmVzb3VyY2UuRXh0ZW5zaW9ucywgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgbG9nU2VydmljZSwgZmlsZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHBhcnNlRXh0ZW5zaW9ucyhyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhKTogUHJvbWlzZTxJU3luY0V4dGVuc2lvbltdIHwgbnVsbD4ge1xuXHRcdHJldHVybiByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSA/IGF3YWl0IHBhcnNlQW5kTWlncmF0ZUV4dGVuc2lvbnMocmVtb3RlVXNlckRhdGEuc3luY0RhdGEsIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UpIDogbnVsbDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZW5lcmF0ZVByZXZpZXcocmVtb3RlRXh0ZW5zaW9uczogSVN5bmNFeHRlbnNpb25bXSwgbG9jYWxFeHRlbnNpb25zOiBJTG9jYWxFeHRlbnNpb25bXSk6IElFeHRlbnNpb25zSW5pdGlhbGl6ZXJQcmV2aWV3UmVzdWx0IHtcblx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zOiBJTG9jYWxFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IG5ld0V4dGVuc2lvbnM6IChJRXh0ZW5zaW9uSWRlbnRpZmllciAmIHsgcHJlUmVsZWFzZTogYm9vbGVhbiB9KVtdID0gW107XG5cdFx0Y29uc3QgZGlzYWJsZWRFeHRlbnNpb25zOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdID0gW107XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgcmVtb3RlRXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKHRoaXMuaWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZS5oYXNUb05ldmVyU3luY0V4dGVuc2lvbihleHRlbnNpb24uaWRlbnRpZmllci5pZCkpIHtcblx0XHRcdFx0Ly8gU2tpcCBleHRlbnNpb24gaWdub3JlZCB0byBzeW5jXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb24gPSBsb2NhbEV4dGVuc2lvbnMuZmluZChpID0+IGFyZVNhbWVFeHRlbnNpb25zKGkuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdGlmIChpbnN0YWxsZWRFeHRlbnNpb24pIHtcblx0XHRcdFx0aW5zdGFsbGVkRXh0ZW5zaW9ucy5wdXNoKGluc3RhbGxlZEV4dGVuc2lvbik7XG5cdFx0XHRcdGlmIChleHRlbnNpb24uZGlzYWJsZWQpIHtcblx0XHRcdFx0XHRkaXNhYmxlZEV4dGVuc2lvbnMucHVzaChleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoZXh0ZW5zaW9uLmluc3RhbGxlZCkge1xuXHRcdFx0XHRuZXdFeHRlbnNpb25zLnB1c2goeyAuLi5leHRlbnNpb24uaWRlbnRpZmllciwgcHJlUmVsZWFzZTogISFleHRlbnNpb24ucHJlUmVsZWFzZSB9KTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbi5kaXNhYmxlZCkge1xuXHRcdFx0XHRcdGRpc2FibGVkRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBpbnN0YWxsZWRFeHRlbnNpb25zLCBuZXdFeHRlbnNpb25zLCBkaXNhYmxlZEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMgfTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFFeEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUywwQkFBMEIsNkJBQWlGLDBCQUEwQiw4QkFBaUQsa0NBQWtDLDRDQUE0QyxrQ0FBd0Qsd0JBQXdCLHNEQUFzRDtBQUNuWixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QixnQ0FBZ0M7QUFDbEUsU0FBUyxlQUFxQyxvQ0FBb0M7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
