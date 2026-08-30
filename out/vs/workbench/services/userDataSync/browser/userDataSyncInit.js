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
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { AbstractExtensionsInitializer } from "../../../../platform/userDataSync/common/extensionsSync.js";
import { GlobalStateInitializer, UserDataSyncStoreTypeSynchronizer } from "../../../../platform/userDataSync/common/globalStateSync.js";
import { KeybindingsInitializer } from "../../../../platform/userDataSync/common/keybindingsSync.js";
import { SettingsInitializer } from "../../../../platform/userDataSync/common/settingsSync.js";
import { SnippetsInitializer } from "../../../../platform/userDataSync/common/snippetsSync.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { UserDataSyncStoreClient } from "../../../../platform/userDataSync/common/userDataSyncStoreService.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IRequestService } from "../../../../platform/request/common/request.js";
import { IUserDataSyncLogService, IUserDataSyncStoreManagementService, SyncResource } from "../../../../platform/userDataSync/common/userDataSync.js";
import { getCurrentAuthenticationSessionInfo } from "../../authentication/browser/authenticationService.js";
import { getSyncAreaLabel } from "../common/userDataSync.js";
import { isWeb } from "../../../../base/common/platform.js";
import { Barrier, Promises } from "../../../../base/common/async.js";
import { EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT, IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IExtensionService, toExtensionDescription } from "../../extensions/common/extensions.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { IIgnoredExtensionsManagementService } from "../../../../platform/userDataSync/common/ignoredExtensions.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IExtensionStorageService } from "../../../../platform/extensionManagement/common/extensionStorage.js";
import { TasksInitializer } from "../../../../platform/userDataSync/common/tasksSync.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
let UserDataSyncInitializer = class {
  constructor(environmentService, secretStorageService, userDataSyncStoreManagementService, fileService, userDataProfilesService, storageService, productService, requestService, logService, uriIdentityService) {
    this.environmentService = environmentService;
    this.secretStorageService = secretStorageService;
    this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
    this.fileService = fileService;
    this.userDataProfilesService = userDataProfilesService;
    this.storageService = storageService;
    this.productService = productService;
    this.requestService = requestService;
    this.logService = logService;
    this.uriIdentityService = uriIdentityService;
    this.initialized = [];
    this.initializationFinished = new Barrier();
    this.globalStateUserData = null;
    this.createUserDataSyncStoreClient().then((userDataSyncStoreClient) => {
      if (!userDataSyncStoreClient) {
        this.initializationFinished.open();
      }
    });
  }
  createUserDataSyncStoreClient() {
    if (!this._userDataSyncStoreClientPromise) {
      this._userDataSyncStoreClientPromise = (async () => {
        try {
          if (!isWeb) {
            this.logService.trace(`Skipping initializing user data in desktop`);
            return;
          }
          if (!this.storageService.isNew(StorageScope.APPLICATION)) {
            this.logService.trace(`Skipping initializing user data as application was opened before`);
            return;
          }
          if (!this.storageService.isNew(StorageScope.WORKSPACE)) {
            this.logService.trace(`Skipping initializing user data as workspace was opened before`);
            return;
          }
          if (this.environmentService.options?.settingsSyncOptions?.authenticationProvider && !this.environmentService.options.settingsSyncOptions.enabled) {
            this.logService.trace(`Skipping initializing user data as settings sync is disabled`);
            return;
          }
          let authenticationSession;
          try {
            authenticationSession = await getCurrentAuthenticationSessionInfo(this.secretStorageService, this.productService);
          } catch (error) {
            this.logService.error(error);
          }
          if (!authenticationSession) {
            this.logService.trace(`Skipping initializing user data as authentication session is not set`);
            return;
          }
          await this.initializeUserDataSyncStore(authenticationSession);
          const userDataSyncStore = this.userDataSyncStoreManagementService.userDataSyncStore;
          if (!userDataSyncStore) {
            this.logService.trace(`Skipping initializing user data as sync service is not provided`);
            return;
          }
          const userDataSyncStoreClient = new UserDataSyncStoreClient(userDataSyncStore.url, this.productService, this.requestService, this.logService, this.environmentService, this.fileService, this.storageService);
          userDataSyncStoreClient.setAuthToken(authenticationSession.accessToken, authenticationSession.providerId);
          const manifest = await userDataSyncStoreClient.manifest(null);
          if (manifest === null) {
            userDataSyncStoreClient.dispose();
            this.logService.trace(`Skipping initializing user data as there is no data`);
            return;
          }
          this.logService.info(`Using settings sync service ${userDataSyncStore.url.toString()} for initialization`);
          return userDataSyncStoreClient;
        } catch (error) {
          this.logService.error(error);
          return;
        }
      })();
    }
    return this._userDataSyncStoreClientPromise;
  }
  async initializeUserDataSyncStore(authenticationSession) {
    const userDataSyncStore = this.userDataSyncStoreManagementService.userDataSyncStore;
    if (!userDataSyncStore?.canSwitch) {
      return;
    }
    const disposables = new DisposableStore();
    try {
      const userDataSyncStoreClient = disposables.add(new UserDataSyncStoreClient(userDataSyncStore.url, this.productService, this.requestService, this.logService, this.environmentService, this.fileService, this.storageService));
      userDataSyncStoreClient.setAuthToken(authenticationSession.accessToken, authenticationSession.providerId);
      this.globalStateUserData = await userDataSyncStoreClient.readResource(SyncResource.GlobalState, null);
      if (this.globalStateUserData) {
        const userDataSyncStoreType = new UserDataSyncStoreTypeSynchronizer(userDataSyncStoreClient, this.storageService, this.environmentService, this.fileService, this.logService).getSyncStoreType(this.globalStateUserData);
        if (userDataSyncStoreType) {
          await this.userDataSyncStoreManagementService.switch(userDataSyncStoreType);
          if (!isEqual(userDataSyncStore.url, this.userDataSyncStoreManagementService.userDataSyncStore?.url)) {
            this.logService.info("Switched settings sync store");
            this.globalStateUserData = null;
          }
        }
      }
    } finally {
      disposables.dispose();
    }
  }
  async whenInitializationFinished() {
    await this.initializationFinished.wait();
  }
  async requiresInitialization() {
    this.logService.trace(`UserDataInitializationService#requiresInitialization`);
    const userDataSyncStoreClient = await this.createUserDataSyncStoreClient();
    return !!userDataSyncStoreClient;
  }
  async initializeRequiredResources() {
    this.logService.trace(`UserDataInitializationService#initializeRequiredResources`);
    return this.initialize([SyncResource.Settings, SyncResource.GlobalState]);
  }
  async initializeOtherResources(instantiationService) {
    try {
      this.logService.trace(`UserDataInitializationService#initializeOtherResources`);
      await Promise.allSettled([this.initialize([SyncResource.Keybindings, SyncResource.Snippets, SyncResource.Tasks]), this.initializeExtensions(instantiationService)]);
    } finally {
      this.initializationFinished.open();
    }
  }
  async initializeExtensions(instantiationService) {
    try {
      await Promise.all([this.initializeInstalledExtensions(instantiationService), this.initializeNewExtensions(instantiationService)]);
    } finally {
      this.initialized.push(SyncResource.Extensions);
    }
  }
  async initializeInstalledExtensions(instantiationService) {
    if (!this.initializeInstalledExtensionsPromise) {
      this.initializeInstalledExtensionsPromise = (async () => {
        this.logService.trace(`UserDataInitializationService#initializeInstalledExtensions`);
        const extensionsPreviewInitializer = await this.getExtensionsPreviewInitializer(instantiationService);
        if (extensionsPreviewInitializer) {
          await instantiationService.createInstance(InstalledExtensionsInitializer, extensionsPreviewInitializer).initialize();
        }
      })();
    }
    return this.initializeInstalledExtensionsPromise;
  }
  async initializeNewExtensions(instantiationService) {
    if (!this.initializeNewExtensionsPromise) {
      this.initializeNewExtensionsPromise = (async () => {
        this.logService.trace(`UserDataInitializationService#initializeNewExtensions`);
        const extensionsPreviewInitializer = await this.getExtensionsPreviewInitializer(instantiationService);
        if (extensionsPreviewInitializer) {
          await instantiationService.createInstance(NewExtensionsInitializer, extensionsPreviewInitializer).initialize();
        }
      })();
    }
    return this.initializeNewExtensionsPromise;
  }
  getExtensionsPreviewInitializer(instantiationService) {
    if (!this.extensionsPreviewInitializerPromise) {
      this.extensionsPreviewInitializerPromise = (async () => {
        const userDataSyncStoreClient = await this.createUserDataSyncStoreClient();
        if (!userDataSyncStoreClient) {
          return null;
        }
        const userData = await userDataSyncStoreClient.readResource(SyncResource.Extensions, null);
        return instantiationService.createInstance(ExtensionsPreviewInitializer, userData);
      })();
    }
    return this.extensionsPreviewInitializerPromise;
  }
  async initialize(syncResources) {
    const userDataSyncStoreClient = await this.createUserDataSyncStoreClient();
    if (!userDataSyncStoreClient) {
      return;
    }
    await Promises.settled(syncResources.map(async (syncResource) => {
      try {
        if (this.initialized.includes(syncResource)) {
          this.logService.info(`${getSyncAreaLabel(syncResource)} initialized already.`);
          return;
        }
        this.initialized.push(syncResource);
        this.logService.trace(`Initializing ${getSyncAreaLabel(syncResource)}`);
        const initializer = this.createSyncResourceInitializer(syncResource);
        const userData = await userDataSyncStoreClient.readResource(syncResource, syncResource === SyncResource.GlobalState ? this.globalStateUserData : null);
        await initializer.initialize(userData);
        this.logService.info(`Initialized ${getSyncAreaLabel(syncResource)}`);
      } catch (error) {
        this.logService.info(`Error while initializing ${getSyncAreaLabel(syncResource)}`);
        this.logService.error(error);
      }
    }));
  }
  createSyncResourceInitializer(syncResource) {
    switch (syncResource) {
      case SyncResource.Settings:
        return new SettingsInitializer(this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.storageService, this.uriIdentityService);
      case SyncResource.Keybindings:
        return new KeybindingsInitializer(this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.storageService, this.uriIdentityService);
      case SyncResource.Tasks:
        return new TasksInitializer(this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.storageService, this.uriIdentityService);
      case SyncResource.Snippets:
        return new SnippetsInitializer(this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.storageService, this.uriIdentityService);
      case SyncResource.GlobalState:
        return new GlobalStateInitializer(this.storageService, this.fileService, this.userDataProfilesService, this.environmentService, this.logService, this.uriIdentityService);
    }
    throw new Error(`Cannot create initializer for ${syncResource}`);
  }
};
UserDataSyncInitializer = __decorateClass([
  __decorateParam(0, IBrowserWorkbenchEnvironmentService),
  __decorateParam(1, ISecretStorageService),
  __decorateParam(2, IUserDataSyncStoreManagementService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IUserDataProfilesService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IRequestService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IUriIdentityService)
], UserDataSyncInitializer);
let ExtensionsPreviewInitializer = class extends AbstractExtensionsInitializer {
  constructor(extensionsData, extensionManagementService, ignoredExtensionsManagementService, fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService) {
    super(extensionManagementService, ignoredExtensionsManagementService, fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService);
    this.extensionsData = extensionsData;
    this.preview = null;
  }
  getPreview() {
    if (!this.previewPromise) {
      this.previewPromise = super.initialize(this.extensionsData).then(() => this.preview);
    }
    return this.previewPromise;
  }
  initialize() {
    throw new Error("should not be called directly");
  }
  async doInitialize(remoteUserData) {
    const remoteExtensions = await this.parseExtensions(remoteUserData);
    if (!remoteExtensions) {
      this.logService.info("Skipping initializing extensions because remote extensions does not exist.");
      return;
    }
    const installedExtensions = await this.extensionManagementService.getInstalled();
    this.preview = this.generatePreview(remoteExtensions, installedExtensions);
  }
};
ExtensionsPreviewInitializer = __decorateClass([
  __decorateParam(1, IExtensionManagementService),
  __decorateParam(2, IIgnoredExtensionsManagementService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IUserDataProfilesService),
  __decorateParam(5, IEnvironmentService),
  __decorateParam(6, IUserDataSyncLogService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IUriIdentityService)
], ExtensionsPreviewInitializer);
let InstalledExtensionsInitializer = class {
  constructor(extensionsPreviewInitializer, extensionEnablementService, extensionStorageService, logService) {
    this.extensionsPreviewInitializer = extensionsPreviewInitializer;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionStorageService = extensionStorageService;
    this.logService = logService;
  }
  async initialize() {
    const preview = await this.extensionsPreviewInitializer.getPreview();
    if (!preview) {
      return;
    }
    for (const installedExtension of preview.installedExtensions) {
      const syncExtension = preview.remoteExtensions.find(({ identifier }) => areSameExtensions(identifier, installedExtension.identifier));
      if (syncExtension?.state) {
        const extensionState = this.extensionStorageService.getExtensionState(installedExtension, true) || {};
        Object.keys(syncExtension.state).forEach((key) => extensionState[key] = syncExtension.state[key]);
        this.extensionStorageService.setExtensionState(installedExtension, extensionState, true);
      }
    }
    if (preview.disabledExtensions.length) {
      for (const identifier of preview.disabledExtensions) {
        this.logService.trace(`Disabling extension...`, identifier.id);
        await this.extensionEnablementService.disableExtension(identifier);
        this.logService.info(`Disabling extension`, identifier.id);
      }
    }
  }
};
InstalledExtensionsInitializer = __decorateClass([
  __decorateParam(1, IGlobalExtensionEnablementService),
  __decorateParam(2, IExtensionStorageService),
  __decorateParam(3, IUserDataSyncLogService)
], InstalledExtensionsInitializer);
let NewExtensionsInitializer = class {
  constructor(extensionsPreviewInitializer, extensionService, extensionStorageService, galleryService, extensionManagementService, logService) {
    this.extensionsPreviewInitializer = extensionsPreviewInitializer;
    this.extensionService = extensionService;
    this.extensionStorageService = extensionStorageService;
    this.galleryService = galleryService;
    this.extensionManagementService = extensionManagementService;
    this.logService = logService;
  }
  async initialize() {
    const preview = await this.extensionsPreviewInitializer.getPreview();
    if (!preview) {
      return;
    }
    const newlyEnabledExtensions = [];
    const targetPlatform = await this.extensionManagementService.getTargetPlatform();
    const galleryExtensions = await this.galleryService.getExtensions(preview.newExtensions, { targetPlatform, compatible: true }, CancellationToken.None);
    for (const galleryExtension of galleryExtensions) {
      try {
        const extensionToSync = preview.remoteExtensions.find(({ identifier }) => areSameExtensions(identifier, galleryExtension.identifier));
        if (!extensionToSync) {
          continue;
        }
        if (extensionToSync.state) {
          this.extensionStorageService.setExtensionState(galleryExtension, extensionToSync.state, true);
        }
        this.logService.trace(`Installing extension...`, galleryExtension.identifier.id);
        const local = await this.extensionManagementService.installFromGallery(galleryExtension, {
          isMachineScoped: false,
          /* set isMachineScoped to prevent install and sync dialog in web */
          donotIncludePackAndDependencies: true,
          installGivenVersion: !!extensionToSync.version,
          installPreReleaseVersion: extensionToSync.preRelease,
          context: { [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true }
        });
        if (!preview.disabledExtensions.some((identifier) => areSameExtensions(identifier, galleryExtension.identifier))) {
          newlyEnabledExtensions.push(local);
        }
        this.logService.info(`Installed extension.`, galleryExtension.identifier.id);
      } catch (error) {
        this.logService.error(error);
      }
    }
    const canEnabledExtensions = newlyEnabledExtensions.filter((e) => this.extensionService.canAddExtension(toExtensionDescription(e)));
    if (!await this.areExtensionsRunning(canEnabledExtensions)) {
      await new Promise((c, e) => {
        const disposable = this.extensionService.onDidChangeExtensions(async () => {
          try {
            if (await this.areExtensionsRunning(canEnabledExtensions)) {
              disposable.dispose();
              c();
            }
          } catch (error) {
            e(error);
          }
        });
      });
    }
  }
  async areExtensionsRunning(extensions) {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const runningExtensions = this.extensionService.extensions;
    return extensions.every((e) => runningExtensions.some((r) => areSameExtensions({ id: r.identifier.value }, e.identifier)));
  }
};
NewExtensionsInitializer = __decorateClass([
  __decorateParam(1, IExtensionService),
  __decorateParam(2, IExtensionStorageService),
  __decorateParam(3, IExtensionGalleryService),
  __decorateParam(4, IExtensionManagementService),
  __decorateParam(5, IUserDataSyncLogService)
], NewExtensionsInitializer);
export {
  UserDataSyncInitializer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx1c2VyRGF0YVN5bmNcXGJyb3dzZXJcXHVzZXJEYXRhU3luY0luaXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RFeHRlbnNpb25zSW5pdGlhbGl6ZXIsIElFeHRlbnNpb25zSW5pdGlhbGl6ZXJQcmV2aWV3UmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi9leHRlbnNpb25zU3luYy5qcyc7XG5pbXBvcnQgeyBHbG9iYWxTdGF0ZUluaXRpYWxpemVyLCBVc2VyRGF0YVN5bmNTdG9yZVR5cGVTeW5jaHJvbml6ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL2dsb2JhbFN0YXRlU3luYy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc0luaXRpYWxpemVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi9rZXliaW5kaW5nc1N5bmMuanMnO1xuaW1wb3J0IHsgU2V0dGluZ3NJbml0aWFsaXplciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vc2V0dGluZ3NTeW5jLmpzJztcbmltcG9ydCB7IFNuaXBwZXRzSW5pdGlhbGl6ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3NuaXBwZXRzU3luYy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhU3luY1N0b3JlQ2xpZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlVXNlckRhdGEsIElVc2VyRGF0YSwgSVVzZXJEYXRhU3luY1Jlc291cmNlSW5pdGlhbGl6ZXIsIElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSwgU3luY1Jlc291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uSW5mbywgZ2V0Q3VycmVudEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8gfSBmcm9tICcuLi8uLi9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRTeW5jQXJlYUxhYmVsIH0gZnJvbSAnLi4vY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEJhcnJpZXIsIFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OX0lOU1RBTExfU0tJUF9QVUJMSVNIRVJfVFJVU1RfQ09OVEVYVCwgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgSUxvY2FsRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlLCB0b0V4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IElJZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi9pZ25vcmVkRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvblN0b3JhZ2UuanMnO1xuaW1wb3J0IHsgVGFza3NJbml0aWFsaXplciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdGFza3NTeW5jLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhSW5pdGlhbGl6ZXIgfSBmcm9tICcuLi8uLi91c2VyRGF0YS9icm93c2VyL3VzZXJEYXRhSW5pdC5qcyc7XG5pbXBvcnQgeyBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zZWNyZXRzL2NvbW1vbi9zZWNyZXRzLmpzJztcblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhU3luY0luaXRpYWxpemVyIGltcGxlbWVudHMgSVVzZXJEYXRhSW5pdGlhbGl6ZXIge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGluaXRpYWxpemVkOiBTeW5jUmVzb3VyY2VbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGluaXRpYWxpemF0aW9uRmluaXNoZWQgPSBuZXcgQmFycmllcigpO1xuXHRwcml2YXRlIGdsb2JhbFN0YXRlVXNlckRhdGE6IElVc2VyRGF0YSB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElTZWNyZXRTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlY3JldFN0b3JhZ2VTZXJ2aWNlOiBJU2VjcmV0U3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZTogSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuY3JlYXRlVXNlckRhdGFTeW5jU3RvcmVDbGllbnQoKS50aGVuKHVzZXJEYXRhU3luY1N0b3JlQ2xpZW50ID0+IHtcblx0XHRcdGlmICghdXNlckRhdGFTeW5jU3RvcmVDbGllbnQpIHtcblx0XHRcdFx0dGhpcy5pbml0aWFsaXphdGlvbkZpbmlzaGVkLm9wZW4oKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3VzZXJEYXRhU3luY1N0b3JlQ2xpZW50UHJvbWlzZTogUHJvbWlzZTxVc2VyRGF0YVN5bmNTdG9yZUNsaWVudCB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3JlYXRlVXNlckRhdGFTeW5jU3RvcmVDbGllbnQoKTogUHJvbWlzZTxVc2VyRGF0YVN5bmNTdG9yZUNsaWVudCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5fdXNlckRhdGFTeW5jU3RvcmVDbGllbnRQcm9taXNlKSB7XG5cdFx0XHR0aGlzLl91c2VyRGF0YVN5bmNTdG9yZUNsaWVudFByb21pc2UgPSAoYXN5bmMgKCk6IFByb21pc2U8VXNlckRhdGFTeW5jU3RvcmVDbGllbnQgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAoIWlzV2ViKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFNraXBwaW5nIGluaXRpYWxpemluZyB1c2VyIGRhdGEgaW4gZGVza3RvcGApO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghdGhpcy5zdG9yYWdlU2VydmljZS5pc05ldyhTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFNraXBwaW5nIGluaXRpYWxpemluZyB1c2VyIGRhdGEgYXMgYXBwbGljYXRpb24gd2FzIG9wZW5lZCBiZWZvcmVgKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIXRoaXMuc3RvcmFnZVNlcnZpY2UuaXNOZXcoU3RvcmFnZVNjb3BlLldPUktTUEFDRSkpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgU2tpcHBpbmcgaW5pdGlhbGl6aW5nIHVzZXIgZGF0YSBhcyB3b3Jrc3BhY2Ugd2FzIG9wZW5lZCBiZWZvcmVgKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8uc2V0dGluZ3NTeW5jT3B0aW9ucz8uYXV0aGVudGljYXRpb25Qcm92aWRlciAmJiAhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucy5zZXR0aW5nc1N5bmNPcHRpb25zLmVuYWJsZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgU2tpcHBpbmcgaW5pdGlhbGl6aW5nIHVzZXIgZGF0YSBhcyBzZXR0aW5ncyBzeW5jIGlzIGRpc2FibGVkYCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bGV0IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbjtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXV0aGVudGljYXRpb25TZXNzaW9uID0gYXdhaXQgZ2V0Q3VycmVudEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8odGhpcy5zZWNyZXRTdG9yYWdlU2VydmljZSwgdGhpcy5wcm9kdWN0U2VydmljZSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghYXV0aGVudGljYXRpb25TZXNzaW9uKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFNraXBwaW5nIGluaXRpYWxpemluZyB1c2VyIGRhdGEgYXMgYXV0aGVudGljYXRpb24gc2Vzc2lvbiBpcyBub3Qgc2V0YCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5pbml0aWFsaXplVXNlckRhdGFTeW5jU3RvcmUoYXV0aGVudGljYXRpb25TZXNzaW9uKTtcblxuXHRcdFx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY1N0b3JlID0gdGhpcy51c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlO1xuXHRcdFx0XHRcdGlmICghdXNlckRhdGFTeW5jU3RvcmUpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgU2tpcHBpbmcgaW5pdGlhbGl6aW5nIHVzZXIgZGF0YSBhcyBzeW5jIHNlcnZpY2UgaXMgbm90IHByb3ZpZGVkYCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgdXNlckRhdGFTeW5jU3RvcmVDbGllbnQgPSBuZXcgVXNlckRhdGFTeW5jU3RvcmVDbGllbnQodXNlckRhdGFTeW5jU3RvcmUudXJsLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLCB0aGlzLnJlcXVlc3RTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdFx0XHR1c2VyRGF0YVN5bmNTdG9yZUNsaWVudC5zZXRBdXRoVG9rZW4oYXV0aGVudGljYXRpb25TZXNzaW9uLmFjY2Vzc1Rva2VuLCBhdXRoZW50aWNhdGlvblNlc3Npb24ucHJvdmlkZXJJZCk7XG5cblx0XHRcdFx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHVzZXJEYXRhU3luY1N0b3JlQ2xpZW50Lm1hbmlmZXN0KG51bGwpO1xuXHRcdFx0XHRcdGlmIChtYW5pZmVzdCA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0dXNlckRhdGFTeW5jU3RvcmVDbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBTa2lwcGluZyBpbml0aWFsaXppbmcgdXNlciBkYXRhIGFzIHRoZXJlIGlzIG5vIGRhdGFgKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgVXNpbmcgc2V0dGluZ3Mgc3luYyBzZXJ2aWNlICR7dXNlckRhdGFTeW5jU3RvcmUudXJsLnRvU3RyaW5nKCl9IGZvciBpbml0aWFsaXphdGlvbmApO1xuXHRcdFx0XHRcdHJldHVybiB1c2VyRGF0YVN5bmNTdG9yZUNsaWVudDtcblxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl91c2VyRGF0YVN5bmNTdG9yZUNsaWVudFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluaXRpYWxpemVVc2VyRGF0YVN5bmNTdG9yZShhdXRoZW50aWNhdGlvblNlc3Npb246IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1c2VyRGF0YVN5bmNTdG9yZSA9IHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZTtcblx0XHRpZiAoIXVzZXJEYXRhU3luY1N0b3JlPy5jYW5Td2l0Y2gpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdXNlckRhdGFTeW5jU3RvcmVDbGllbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFVzZXJEYXRhU3luY1N0b3JlQ2xpZW50KHVzZXJEYXRhU3luY1N0b3JlLnVybCwgdGhpcy5wcm9kdWN0U2VydmljZSwgdGhpcy5yZXF1ZXN0U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSkpO1xuXHRcdFx0dXNlckRhdGFTeW5jU3RvcmVDbGllbnQuc2V0QXV0aFRva2VuKGF1dGhlbnRpY2F0aW9uU2Vzc2lvbi5hY2Nlc3NUb2tlbiwgYXV0aGVudGljYXRpb25TZXNzaW9uLnByb3ZpZGVySWQpO1xuXG5cdFx0XHQvLyBDYWNoZSBnbG9iYWwgc3RhdGUgZGF0YSBmb3IgZ2xvYmFsIHN0YXRlIGluaXRpYWxpemF0aW9uXG5cdFx0XHR0aGlzLmdsb2JhbFN0YXRlVXNlckRhdGEgPSBhd2FpdCB1c2VyRGF0YVN5bmNTdG9yZUNsaWVudC5yZWFkUmVzb3VyY2UoU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlLCBudWxsKTtcblxuXHRcdFx0aWYgKHRoaXMuZ2xvYmFsU3RhdGVVc2VyRGF0YSkge1xuXHRcdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNTdG9yZVR5cGUgPSBuZXcgVXNlckRhdGFTeW5jU3RvcmVUeXBlU3luY2hyb25pemVyKHVzZXJEYXRhU3luY1N0b3JlQ2xpZW50LCB0aGlzLnN0b3JhZ2VTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlKS5nZXRTeW5jU3RvcmVUeXBlKHRoaXMuZ2xvYmFsU3RhdGVVc2VyRGF0YSk7XG5cdFx0XHRcdGlmICh1c2VyRGF0YVN5bmNTdG9yZVR5cGUpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2Uuc3dpdGNoKHVzZXJEYXRhU3luY1N0b3JlVHlwZSk7XG5cblx0XHRcdFx0XHQvLyBVbnNldCBjYWNoZWQgZ2xvYmFsIHN0YXRlIGRhdGEgaWYgdXJscyBhcmUgY2hhbmdlZFxuXHRcdFx0XHRcdGlmICghaXNFcXVhbCh1c2VyRGF0YVN5bmNTdG9yZS51cmwsIHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZT8udXJsKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1N3aXRjaGVkIHNldHRpbmdzIHN5bmMgc3RvcmUnKTtcblx0XHRcdFx0XHRcdHRoaXMuZ2xvYmFsU3RhdGVVc2VyRGF0YSA9IG51bGw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB3aGVuSW5pdGlhbGl6YXRpb25GaW5pc2hlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmluaXRpYWxpemF0aW9uRmluaXNoZWQud2FpdCgpO1xuXHR9XG5cblx0YXN5bmMgcmVxdWlyZXNJbml0aWFsaXphdGlvbigpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlI3JlcXVpcmVzSW5pdGlhbGl6YXRpb25gKTtcblx0XHRjb25zdCB1c2VyRGF0YVN5bmNTdG9yZUNsaWVudCA9IGF3YWl0IHRoaXMuY3JlYXRlVXNlckRhdGFTeW5jU3RvcmVDbGllbnQoKTtcblx0XHRyZXR1cm4gISF1c2VyRGF0YVN5bmNTdG9yZUNsaWVudDtcblx0fVxuXG5cdGFzeW5jIGluaXRpYWxpemVSZXF1aXJlZFJlc291cmNlcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlI2luaXRpYWxpemVSZXF1aXJlZFJlc291cmNlc2ApO1xuXHRcdHJldHVybiB0aGlzLmluaXRpYWxpemUoW1N5bmNSZXNvdXJjZS5TZXR0aW5ncywgU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlXSk7XG5cdH1cblxuXHRhc3luYyBpbml0aWFsaXplT3RoZXJSZXNvdXJjZXMoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlI2luaXRpYWxpemVPdGhlclJlc291cmNlc2ApO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKFt0aGlzLmluaXRpYWxpemUoW1N5bmNSZXNvdXJjZS5LZXliaW5kaW5ncywgU3luY1Jlc291cmNlLlNuaXBwZXRzLCBTeW5jUmVzb3VyY2UuVGFza3NdKSwgdGhpcy5pbml0aWFsaXplRXh0ZW5zaW9ucyhpbnN0YW50aWF0aW9uU2VydmljZSldKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5pbml0aWFsaXphdGlvbkZpbmlzaGVkLm9wZW4oKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluaXRpYWxpemVFeHRlbnNpb25zKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3RoaXMuaW5pdGlhbGl6ZUluc3RhbGxlZEV4dGVuc2lvbnMoaW5zdGFudGlhdGlvblNlcnZpY2UpLCB0aGlzLmluaXRpYWxpemVOZXdFeHRlbnNpb25zKGluc3RhbnRpYXRpb25TZXJ2aWNlKV0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmluaXRpYWxpemVkLnB1c2goU3luY1Jlc291cmNlLkV4dGVuc2lvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaW5pdGlhbGl6ZUluc3RhbGxlZEV4dGVuc2lvbnNQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRhc3luYyBpbml0aWFsaXplSW5zdGFsbGVkRXh0ZW5zaW9ucyhpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmluaXRpYWxpemVJbnN0YWxsZWRFeHRlbnNpb25zUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5pbml0aWFsaXplSW5zdGFsbGVkRXh0ZW5zaW9uc1Byb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlI2luaXRpYWxpemVJbnN0YWxsZWRFeHRlbnNpb25zYCk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXIgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uc1ByZXZpZXdJbml0aWFsaXplcikge1xuXHRcdFx0XHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxlZEV4dGVuc2lvbnNJbml0aWFsaXplciwgZXh0ZW5zaW9uc1ByZXZpZXdJbml0aWFsaXplcikuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5pbml0aWFsaXplSW5zdGFsbGVkRXh0ZW5zaW9uc1Byb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGluaXRpYWxpemVOZXdFeHRlbnNpb25zUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplTmV3RXh0ZW5zaW9ucyhpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmluaXRpYWxpemVOZXdFeHRlbnNpb25zUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5pbml0aWFsaXplTmV3RXh0ZW5zaW9uc1Byb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlI2luaXRpYWxpemVOZXdFeHRlbnNpb25zYCk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXIgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uc1ByZXZpZXdJbml0aWFsaXplcikge1xuXHRcdFx0XHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld0V4dGVuc2lvbnNJbml0aWFsaXplciwgZXh0ZW5zaW9uc1ByZXZpZXdJbml0aWFsaXplcikuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5pbml0aWFsaXplTmV3RXh0ZW5zaW9uc1Byb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXJQcm9taXNlOiBQcm9taXNlPEV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXIgfCBudWxsPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXRFeHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBQcm9taXNlPEV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXIgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXJQcm9taXNlKSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXJQcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdXNlckRhdGFTeW5jU3RvcmVDbGllbnQgPSBhd2FpdCB0aGlzLmNyZWF0ZVVzZXJEYXRhU3luY1N0b3JlQ2xpZW50KCk7XG5cdFx0XHRcdGlmICghdXNlckRhdGFTeW5jU3RvcmVDbGllbnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB1c2VyRGF0YSA9IGF3YWl0IHVzZXJEYXRhU3luY1N0b3JlQ2xpZW50LnJlYWRSZXNvdXJjZShTeW5jUmVzb3VyY2UuRXh0ZW5zaW9ucywgbnVsbCk7XG5cdFx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyLCB1c2VyRGF0YSk7XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5pdGlhbGl6ZShzeW5jUmVzb3VyY2VzOiBTeW5jUmVzb3VyY2VbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHVzZXJEYXRhU3luY1N0b3JlQ2xpZW50ID0gYXdhaXQgdGhpcy5jcmVhdGVVc2VyRGF0YVN5bmNTdG9yZUNsaWVudCgpO1xuXHRcdGlmICghdXNlckRhdGFTeW5jU3RvcmVDbGllbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKHN5bmNSZXNvdXJjZXMubWFwKGFzeW5jIHN5bmNSZXNvdXJjZSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAodGhpcy5pbml0aWFsaXplZC5pbmNsdWRlcyhzeW5jUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7Z2V0U3luY0FyZWFMYWJlbChzeW5jUmVzb3VyY2UpfSBpbml0aWFsaXplZCBhbHJlYWR5LmApO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmluaXRpYWxpemVkLnB1c2goc3luY1Jlc291cmNlKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBJbml0aWFsaXppbmcgJHtnZXRTeW5jQXJlYUxhYmVsKHN5bmNSZXNvdXJjZSl9YCk7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxpemVyID0gdGhpcy5jcmVhdGVTeW5jUmVzb3VyY2VJbml0aWFsaXplcihzeW5jUmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCB1c2VyRGF0YSA9IGF3YWl0IHVzZXJEYXRhU3luY1N0b3JlQ2xpZW50LnJlYWRSZXNvdXJjZShzeW5jUmVzb3VyY2UsIHN5bmNSZXNvdXJjZSA9PT0gU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlID8gdGhpcy5nbG9iYWxTdGF0ZVVzZXJEYXRhIDogbnVsbCk7XG5cdFx0XHRcdGF3YWl0IGluaXRpYWxpemVyLmluaXRpYWxpemUodXNlckRhdGEpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgSW5pdGlhbGl6ZWQgJHtnZXRTeW5jQXJlYUxhYmVsKHN5bmNSZXNvdXJjZSl9YCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgRXJyb3Igd2hpbGUgaW5pdGlhbGl6aW5nICR7Z2V0U3luY0FyZWFMYWJlbChzeW5jUmVzb3VyY2UpfWApO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU3luY1Jlc291cmNlSW5pdGlhbGl6ZXIoc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UpOiBJVXNlckRhdGFTeW5jUmVzb3VyY2VJbml0aWFsaXplciB7XG5cdFx0c3dpdGNoIChzeW5jUmVzb3VyY2UpIHtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlNldHRpbmdzOiByZXR1cm4gbmV3IFNldHRpbmdzSW5pdGlhbGl6ZXIodGhpcy5maWxlU2VydmljZSwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3M6IHJldHVybiBuZXcgS2V5YmluZGluZ3NJbml0aWFsaXplcih0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5UYXNrczogcmV0dXJuIG5ldyBUYXNrc0luaXRpYWxpemVyKHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuc3RvcmFnZVNlcnZpY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlNuaXBwZXRzOiByZXR1cm4gbmV3IFNuaXBwZXRzSW5pdGlhbGl6ZXIodGhpcy5maWxlU2VydmljZSwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuR2xvYmFsU3RhdGU6IHJldHVybiBuZXcgR2xvYmFsU3RhdGVJbml0aWFsaXplcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNyZWF0ZSBpbml0aWFsaXplciBmb3IgJHtzeW5jUmVzb3VyY2V9YCk7XG5cdH1cblxufVxuXG5jbGFzcyBFeHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyIGV4dGVuZHMgQWJzdHJhY3RFeHRlbnNpb25zSW5pdGlhbGl6ZXIge1xuXG5cdHByaXZhdGUgcHJldmlld1Byb21pc2U6IFByb21pc2U8SUV4dGVuc2lvbnNJbml0aWFsaXplclByZXZpZXdSZXN1bHQgfCBudWxsPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwcmV2aWV3OiBJRXh0ZW5zaW9uc0luaXRpYWxpemVyUHJldmlld1Jlc3VsdCB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc0RhdGE6IElVc2VyRGF0YSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElJZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlIGlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2U6IElJZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgaWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgZmlsZVNlcnZpY2UsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGxvZ1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHR9XG5cblx0Z2V0UHJldmlldygpOiBQcm9taXNlPElFeHRlbnNpb25zSW5pdGlhbGl6ZXJQcmV2aWV3UmVzdWx0IHwgbnVsbD4ge1xuXHRcdGlmICghdGhpcy5wcmV2aWV3UHJvbWlzZSkge1xuXHRcdFx0dGhpcy5wcmV2aWV3UHJvbWlzZSA9IHN1cGVyLmluaXRpYWxpemUodGhpcy5leHRlbnNpb25zRGF0YSkudGhlbigoKSA9PiB0aGlzLnByZXZpZXcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5wcmV2aWV3UHJvbWlzZTtcblx0fVxuXG5cdG92ZXJyaWRlIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdzaG91bGQgbm90IGJlIGNhbGxlZCBkaXJlY3RseScpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGRvSW5pdGlhbGl6ZShyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMucGFyc2VFeHRlbnNpb25zKHJlbW90ZVVzZXJEYXRhKTtcblx0XHRpZiAoIXJlbW90ZUV4dGVuc2lvbnMpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTa2lwcGluZyBpbml0aWFsaXppbmcgZXh0ZW5zaW9ucyBiZWNhdXNlIHJlbW90ZSBleHRlbnNpb25zIGRvZXMgbm90IGV4aXN0LicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoKTtcblx0XHR0aGlzLnByZXZpZXcgPSB0aGlzLmdlbmVyYXRlUHJldmlldyhyZW1vdGVFeHRlbnNpb25zLCBpbnN0YWxsZWRFeHRlbnNpb25zKTtcblx0fVxufVxuXG5jbGFzcyBJbnN0YWxsZWRFeHRlbnNpb25zSW5pdGlhbGl6ZXIgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jUmVzb3VyY2VJbml0aWFsaXplciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyOiBFeHRlbnNpb25zUHJldmlld0luaXRpYWxpemVyLFxuXHRcdEBJR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSUdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TdG9yYWdlU2VydmljZTogSUV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJldmlldyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1ByZXZpZXdJbml0aWFsaXplci5nZXRQcmV2aWV3KCk7XG5cdFx0aWYgKCFwcmV2aWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gMS4gSW5pdGlhbGlzZSBhbHJlYWR5IGluc3RhbGxlZCBleHRlbnNpb25zIHN0YXRlXG5cdFx0Zm9yIChjb25zdCBpbnN0YWxsZWRFeHRlbnNpb24gb2YgcHJldmlldy5pbnN0YWxsZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBzeW5jRXh0ZW5zaW9uID0gcHJldmlldy5yZW1vdGVFeHRlbnNpb25zLmZpbmQoKHsgaWRlbnRpZmllciB9KSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpZGVudGlmaWVyLCBpbnN0YWxsZWRFeHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0aWYgKHN5bmNFeHRlbnNpb24/LnN0YXRlKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblN0YXRlID0gdGhpcy5leHRlbnNpb25TdG9yYWdlU2VydmljZS5nZXRFeHRlbnNpb25TdGF0ZShpbnN0YWxsZWRFeHRlbnNpb24sIHRydWUpIHx8IHt9O1xuXHRcdFx0XHRPYmplY3Qua2V5cyhzeW5jRXh0ZW5zaW9uLnN0YXRlKS5mb3JFYWNoKGtleSA9PiBleHRlbnNpb25TdGF0ZVtrZXldID0gc3luY0V4dGVuc2lvbi5zdGF0ZSFba2V5XSk7XG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2Uuc2V0RXh0ZW5zaW9uU3RhdGUoaW5zdGFsbGVkRXh0ZW5zaW9uLCBleHRlbnNpb25TdGF0ZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gMi4gSW5pdGlhbGlzZSBleHRlbnNpb25zIGVuYWJsZW1lbnRcblx0XHRpZiAocHJldmlldy5kaXNhYmxlZEV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGlkZW50aWZpZXIgb2YgcHJldmlldy5kaXNhYmxlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBEaXNhYmxpbmcgZXh0ZW5zaW9uLi4uYCwgaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZGlzYWJsZUV4dGVuc2lvbihpZGVudGlmaWVyKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYERpc2FibGluZyBleHRlbnNpb25gLCBpZGVudGlmaWVyLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTmV3RXh0ZW5zaW9uc0luaXRpYWxpemVyIGltcGxlbWVudHMgSVVzZXJEYXRhU3luY1Jlc291cmNlSW5pdGlhbGl6ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1ByZXZpZXdJbml0aWFsaXplcjogRXh0ZW5zaW9uc1ByZXZpZXdJbml0aWFsaXplcixcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2U6IElFeHRlbnNpb25TdG9yYWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZ2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByZXZpZXcgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcmV2aWV3SW5pdGlhbGl6ZXIuZ2V0UHJldmlldygpO1xuXHRcdGlmICghcHJldmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld2x5RW5hYmxlZEV4dGVuc2lvbnM6IElMb2NhbEV4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgdGFyZ2V0UGxhdGZvcm0gPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldFRhcmdldFBsYXRmb3JtKCk7XG5cdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMocHJldmlldy5uZXdFeHRlbnNpb25zLCB7IHRhcmdldFBsYXRmb3JtLCBjb21wYXRpYmxlOiB0cnVlIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGZvciAoY29uc3QgZ2FsbGVyeUV4dGVuc2lvbiBvZiBnYWxsZXJ5RXh0ZW5zaW9ucykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVG9TeW5jID0gcHJldmlldy5yZW1vdGVFeHRlbnNpb25zLmZpbmQoKHsgaWRlbnRpZmllciB9KSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpZGVudGlmaWVyLCBnYWxsZXJ5RXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0aWYgKCFleHRlbnNpb25Ub1N5bmMpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uVG9TeW5jLnN0YXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5leHRlbnNpb25TdG9yYWdlU2VydmljZS5zZXRFeHRlbnNpb25TdGF0ZShnYWxsZXJ5RXh0ZW5zaW9uLCBleHRlbnNpb25Ub1N5bmMuc3RhdGUsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgSW5zdGFsbGluZyBleHRlbnNpb24uLi5gLCBnYWxsZXJ5RXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRjb25zdCBsb2NhbCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEZyb21HYWxsZXJ5KGdhbGxlcnlFeHRlbnNpb24sIHtcblx0XHRcdFx0XHRpc01hY2hpbmVTY29wZWQ6IGZhbHNlLCAvKiBzZXQgaXNNYWNoaW5lU2NvcGVkIHRvIHByZXZlbnQgaW5zdGFsbCBhbmQgc3luYyBkaWFsb2cgaW4gd2ViICovXG5cdFx0XHRcdFx0ZG9ub3RJbmNsdWRlUGFja0FuZERlcGVuZGVuY2llczogdHJ1ZSxcblx0XHRcdFx0XHRpbnN0YWxsR2l2ZW5WZXJzaW9uOiAhIWV4dGVuc2lvblRvU3luYy52ZXJzaW9uLFxuXHRcdFx0XHRcdGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbjogZXh0ZW5zaW9uVG9TeW5jLnByZVJlbGVhc2UsXG5cdFx0XHRcdFx0Y29udGV4dDogeyBbRVhURU5TSU9OX0lOU1RBTExfU0tJUF9QVUJMSVNIRVJfVFJVU1RfQ09OVEVYVF06IHRydWUgfVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCFwcmV2aWV3LmRpc2FibGVkRXh0ZW5zaW9ucy5zb21lKGlkZW50aWZpZXIgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaWRlbnRpZmllciwgZ2FsbGVyeUV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0XHRuZXdseUVuYWJsZWRFeHRlbnNpb25zLnB1c2gobG9jYWwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBJbnN0YWxsZWQgZXh0ZW5zaW9uLmAsIGdhbGxlcnlFeHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNhbkVuYWJsZWRFeHRlbnNpb25zID0gbmV3bHlFbmFibGVkRXh0ZW5zaW9ucy5maWx0ZXIoZSA9PiB0aGlzLmV4dGVuc2lvblNlcnZpY2UuY2FuQWRkRXh0ZW5zaW9uKHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24oZSkpKTtcblx0XHRpZiAoIShhd2FpdCB0aGlzLmFyZUV4dGVuc2lvbnNSdW5uaW5nKGNhbkVuYWJsZWRFeHRlbnNpb25zKSkpIHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChjLCBlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLmV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuYXJlRXh0ZW5zaW9uc1J1bm5pbmcoY2FuRW5hYmxlZEV4dGVuc2lvbnMpKSB7XG5cdFx0XHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRjKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdGUoZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFyZUV4dGVuc2lvbnNSdW5uaW5nKGV4dGVuc2lvbnM6IElMb2NhbEV4dGVuc2lvbltdKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXHRcdGNvbnN0IHJ1bm5pbmdFeHRlbnNpb25zID0gdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnM7XG5cdFx0cmV0dXJuIGV4dGVuc2lvbnMuZXZlcnkoZSA9PiBydW5uaW5nRXh0ZW5zaW9ucy5zb21lKHIgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZDogci5pZGVudGlmaWVyLnZhbHVlIH0sIGUuaWRlbnRpZmllcikpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxxQ0FBMEU7QUFDbkYsU0FBUyx3QkFBd0IseUNBQXlDO0FBQzFFLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXVFLHlCQUF5QixxQ0FBcUMsb0JBQW9CO0FBQ3pKLFNBQW9DLDJDQUEyQztBQUMvRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLGdCQUFnQjtBQUNsQyxTQUFTLGdEQUFnRCwwQkFBMEIsNkJBQTZCLHlDQUEwRDtBQUMxSyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQiw4QkFBOEI7QUFD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
