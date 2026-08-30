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
import { IBuiltinExtensionsScannerService, ExtensionType, TargetPlatform, parseEnabledApiProposalNames } from "../../../../platform/extensions/common/extensions.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { IWebExtensionsScannerService } from "../common/extensionManagement.js";
import { isWeb, Language } from "../../../../base/common/platform.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { FileOperationResult, IFileService } from "../../../../platform/files/common/files.js";
import { Queue } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { IExtensionGalleryService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { areSameExtensions, getGalleryExtensionId, getExtensionId, isMalicious } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localizeManifest } from "../../../../platform/extensionManagement/common/extensionNls.js";
import { localize, localize2 } from "../../../../nls.js";
import * as semver from "../../../../base/common/semver/semver.js";
import { isString, isUndefined } from "../../../../base/common/types.js";
import { getErrorMessage } from "../../../../base/common/errors.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IExtensionManifestPropertiesService } from "../../extensions/common/extensionManifestPropertiesService.js";
import { IExtensionResourceLoaderService, migratePlatformSpecificExtensionGalleryResourceURL } from "../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { basename } from "../../../../base/common/path.js";
import { IExtensionStorageService } from "../../../../platform/extensionManagement/common/extensionStorage.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { validateExtensionManifest } from "../../../../platform/extensions/common/extensionValidator.js";
import Severity from "../../../../base/common/severity.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
function isGalleryExtensionInfo(obj) {
  const galleryExtensionInfo = obj;
  return typeof galleryExtensionInfo?.id === "string" && (galleryExtensionInfo.preRelease === void 0 || typeof galleryExtensionInfo.preRelease === "boolean") && (galleryExtensionInfo.migrateStorageFrom === void 0 || typeof galleryExtensionInfo.migrateStorageFrom === "string");
}
function isUriComponents(obj) {
  if (!obj) {
    return false;
  }
  const thing = obj;
  return typeof thing?.path === "string" && typeof thing?.scheme === "string";
}
let WebExtensionsScannerService = class extends Disposable {
  constructor(environmentService, builtinExtensionsScannerService, fileService, logService, galleryService, extensionManifestPropertiesService, extensionResourceLoaderService, extensionStorageService, storageService, productService, userDataProfilesService, uriIdentityService, lifecycleService) {
    super();
    this.environmentService = environmentService;
    this.builtinExtensionsScannerService = builtinExtensionsScannerService;
    this.fileService = fileService;
    this.logService = logService;
    this.galleryService = galleryService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.extensionResourceLoaderService = extensionResourceLoaderService;
    this.extensionStorageService = extensionStorageService;
    this.storageService = storageService;
    this.productService = productService;
    this.userDataProfilesService = userDataProfilesService;
    this.uriIdentityService = uriIdentityService;
    this.systemExtensionsCacheResource = void 0;
    this.customBuiltinExtensionsCacheResource = void 0;
    this.resourcesAccessQueueMap = new ResourceMap();
    if (isWeb) {
      this.systemExtensionsCacheResource = joinPath(environmentService.userRoamingDataHome, "systemExtensionsCache.json");
      this.customBuiltinExtensionsCacheResource = joinPath(environmentService.userRoamingDataHome, "customBuiltinExtensionsCache.json");
      lifecycleService.when(LifecyclePhase.Eventually).then(() => this.updateCaches());
    }
  }
  readCustomBuiltinExtensionsInfoFromEnv() {
    if (!this._customBuiltinExtensionsInfoPromise) {
      this._customBuiltinExtensionsInfoPromise = (async () => {
        let extensions = [];
        const extensionLocations = [];
        const extensionGalleryResources = [];
        const extensionsToMigrate = [];
        const customBuiltinExtensionsInfo = this.environmentService.options && Array.isArray(this.environmentService.options.additionalBuiltinExtensions) ? this.environmentService.options.additionalBuiltinExtensions.map((additionalBuiltinExtension) => isString(additionalBuiltinExtension) ? { id: additionalBuiltinExtension } : additionalBuiltinExtension) : [];
        for (const e of customBuiltinExtensionsInfo) {
          if (isGalleryExtensionInfo(e)) {
            extensions.push({ id: e.id, preRelease: !!e.preRelease });
            if (e.migrateStorageFrom) {
              extensionsToMigrate.push([e.migrateStorageFrom, e.id]);
            }
          } else if (isUriComponents(e)) {
            const extensionLocation = URI.revive(e);
            if (await this.extensionResourceLoaderService.isExtensionGalleryResource(extensionLocation)) {
              extensionGalleryResources.push(extensionLocation);
            } else {
              extensionLocations.push(extensionLocation);
            }
          }
        }
        if (extensions.length) {
          extensions = await this.checkAdditionalBuiltinExtensions(extensions);
        }
        if (extensions.length) {
          this.logService.info("Found additional builtin gallery extensions in env", extensions);
        }
        if (extensionLocations.length) {
          this.logService.info("Found additional builtin location extensions in env", extensionLocations.map((e) => e.toString()));
        }
        if (extensionGalleryResources.length) {
          this.logService.info("Found additional builtin extension gallery resources in env", extensionGalleryResources.map((e) => e.toString()));
        }
        return { extensions, extensionsToMigrate, extensionLocations, extensionGalleryResources };
      })();
    }
    return this._customBuiltinExtensionsInfoPromise;
  }
  async checkAdditionalBuiltinExtensions(extensions) {
    const extensionsControlManifest = await this.galleryService.getExtensionsControlManifest();
    const result = [];
    for (const extension of extensions) {
      if (isMalicious({ id: extension.id }, extensionsControlManifest.malicious)) {
        this.logService.info(`Checking additional builtin extensions: Ignoring '${extension.id}' because it is reported to be malicious.`);
        continue;
      }
      const deprecationInfo = extensionsControlManifest.deprecated[extension.id.toLowerCase()];
      if (deprecationInfo?.extension?.autoMigrate) {
        const preReleaseExtensionId = deprecationInfo.extension.id;
        this.logService.info(`Checking additional builtin extensions: '${extension.id}' is deprecated, instead using '${preReleaseExtensionId}'`);
        result.push({ id: preReleaseExtensionId, preRelease: !!extension.preRelease });
      } else {
        result.push(extension);
      }
    }
    return result;
  }
  /**
   * All system extensions bundled with the product
   */
  async readSystemExtensions() {
    const systemExtensions = await this.builtinExtensionsScannerService.scanBuiltinExtensions();
    const cachedSystemExtensions = await Promise.all((await this.readSystemExtensionsCache()).map((e) => this.toScannedExtension(e, true, ExtensionType.System)));
    const result = /* @__PURE__ */ new Map();
    for (const extension of [...systemExtensions, ...cachedSystemExtensions]) {
      const existing = result.get(extension.identifier.id.toLowerCase());
      if (existing) {
        if (semver.gt(existing.manifest.version, extension.manifest.version)) {
          continue;
        }
      }
      result.set(extension.identifier.id.toLowerCase(), extension);
    }
    return [...result.values()];
  }
  /**
   * All extensions defined via `additionalBuiltinExtensions` API
   */
  async readCustomBuiltinExtensions(scanOptions) {
    const [customBuiltinExtensionsFromLocations, customBuiltinExtensionsFromGallery] = await Promise.all([
      this.getCustomBuiltinExtensionsFromLocations(scanOptions),
      this.getCustomBuiltinExtensionsFromGallery(scanOptions)
    ]);
    const customBuiltinExtensions = [...customBuiltinExtensionsFromLocations, ...customBuiltinExtensionsFromGallery];
    await this.migrateExtensionsStorage(customBuiltinExtensions);
    return customBuiltinExtensions;
  }
  async getCustomBuiltinExtensionsFromLocations(scanOptions) {
    const { extensionLocations } = await this.readCustomBuiltinExtensionsInfoFromEnv();
    if (!extensionLocations.length) {
      return [];
    }
    const result = [];
    await Promise.allSettled(extensionLocations.map(async (extensionLocation) => {
      try {
        const webExtension = await this.toWebExtension(extensionLocation);
        const extension = await this.toScannedExtension(webExtension, true);
        if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
          result.push(extension);
        } else {
          this.logService.info(`Skipping invalid additional builtin extension ${webExtension.identifier.id}`);
        }
      } catch (error) {
        this.logService.info(`Error while fetching the additional builtin extension ${extensionLocation.toString()}.`, getErrorMessage(error));
      }
    }));
    return result;
  }
  async getCustomBuiltinExtensionsFromGallery(scanOptions) {
    if (!this.galleryService.isEnabled()) {
      this.logService.info("Ignoring fetching additional builtin extensions from gallery as it is disabled.");
      return [];
    }
    const result = [];
    const { extensions, extensionGalleryResources } = await this.readCustomBuiltinExtensionsInfoFromEnv();
    try {
      const cacheValue = JSON.stringify({
        extensions: extensions.sort((a, b) => a.id.localeCompare(b.id)),
        extensionGalleryResources: extensionGalleryResources.map((e) => e.toString()).sort()
      });
      const useCache = this.storageService.get("additionalBuiltinExtensions", StorageScope.APPLICATION, "{}") === cacheValue;
      const webExtensions = await (useCache ? this.getCustomBuiltinExtensionsFromCache() : this.updateCustomBuiltinExtensionsCache());
      if (webExtensions.length) {
        await Promise.all(webExtensions.map(async (webExtension) => {
          try {
            const extension = await this.toScannedExtension(webExtension, true);
            if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
              result.push(extension);
            } else {
              this.logService.info(`Skipping invalid additional builtin gallery extension ${webExtension.identifier.id}`);
            }
          } catch (error) {
            this.logService.info(`Ignoring additional builtin extension ${webExtension.identifier.id} because there is an error while converting it into scanned extension`, getErrorMessage(error));
          }
        }));
      }
      this.storageService.store("additionalBuiltinExtensions", cacheValue, StorageScope.APPLICATION, StorageTarget.MACHINE);
    } catch (error) {
      this.logService.info("Ignoring following additional builtin extensions as there is an error while fetching them from gallery", extensions.map(({ id }) => id), getErrorMessage(error));
    }
    return result;
  }
  async getCustomBuiltinExtensionsFromCache() {
    const cachedCustomBuiltinExtensions = await this.readCustomBuiltinExtensionsCache();
    const webExtensionsMap = /* @__PURE__ */ new Map();
    for (const webExtension of cachedCustomBuiltinExtensions) {
      const existing = webExtensionsMap.get(webExtension.identifier.id.toLowerCase());
      if (existing) {
        if (semver.gt(existing.version, webExtension.version)) {
          continue;
        }
      }
      if (webExtension.metadata?.isPreReleaseVersion && !webExtension.metadata?.preRelease) {
        webExtension.metadata.preRelease = true;
      }
      webExtensionsMap.set(webExtension.identifier.id.toLowerCase(), webExtension);
    }
    return [...webExtensionsMap.values()];
  }
  async migrateExtensionsStorage(customBuiltinExtensions) {
    if (!this._migrateExtensionsStoragePromise) {
      this._migrateExtensionsStoragePromise = (async () => {
        const { extensionsToMigrate } = await this.readCustomBuiltinExtensionsInfoFromEnv();
        if (!extensionsToMigrate.length) {
          return;
        }
        const fromExtensions = await this.galleryService.getExtensions(extensionsToMigrate.map(([id]) => ({ id })), CancellationToken.None);
        try {
          await Promise.allSettled(extensionsToMigrate.map(async ([from, to]) => {
            const toExtension = customBuiltinExtensions.find((extension) => areSameExtensions(extension.identifier, { id: to }));
            if (toExtension) {
              const fromExtension = fromExtensions.find((extension) => areSameExtensions(extension.identifier, { id: from }));
              const fromExtensionManifest = fromExtension ? await this.galleryService.getManifest(fromExtension, CancellationToken.None) : null;
              const fromExtensionId = fromExtensionManifest ? getExtensionId(fromExtensionManifest.publisher, fromExtensionManifest.name) : from;
              const toExtensionId = getExtensionId(toExtension.manifest.publisher, toExtension.manifest.name);
              this.extensionStorageService.addToMigrationList(fromExtensionId, toExtensionId);
            } else {
              this.logService.info(`Skipped migrating extension storage from '${from}' to '${to}', because the '${to}' extension is not found.`);
            }
          }));
        } catch (error) {
          this.logService.error(error);
        }
      })();
    }
    return this._migrateExtensionsStoragePromise;
  }
  async updateCaches() {
    await this.updateSystemExtensionsCache();
    await this.updateCustomBuiltinExtensionsCache();
  }
  async updateSystemExtensionsCache() {
    const systemExtensions = await this.builtinExtensionsScannerService.scanBuiltinExtensions();
    const cachedSystemExtensions = (await this.readSystemExtensionsCache()).filter((cached) => {
      const systemExtension = systemExtensions.find((e) => areSameExtensions(e.identifier, cached.identifier));
      return systemExtension && semver.gt(cached.version, systemExtension.manifest.version);
    });
    await this.writeSystemExtensionsCache(() => cachedSystemExtensions);
  }
  async updateCustomBuiltinExtensionsCache() {
    if (!this._updateCustomBuiltinExtensionsCachePromise) {
      this._updateCustomBuiltinExtensionsCachePromise = (async () => {
        this.logService.info("Updating additional builtin extensions cache");
        const { extensions, extensionGalleryResources } = await this.readCustomBuiltinExtensionsInfoFromEnv();
        const [galleryWebExtensions, extensionGalleryResourceWebExtensions] = await Promise.all([
          this.resolveBuiltinGalleryExtensions(extensions),
          this.resolveBuiltinExtensionGalleryResources(extensionGalleryResources)
        ]);
        const webExtensionsMap = /* @__PURE__ */ new Map();
        for (const webExtension of [...galleryWebExtensions, ...extensionGalleryResourceWebExtensions]) {
          webExtensionsMap.set(webExtension.identifier.id.toLowerCase(), webExtension);
        }
        await this.resolveDependenciesAndPackedExtensions(extensionGalleryResourceWebExtensions, webExtensionsMap);
        const webExtensions = [...webExtensionsMap.values()];
        await this.writeCustomBuiltinExtensionsCache(() => webExtensions);
        return webExtensions;
      })();
    }
    return this._updateCustomBuiltinExtensionsCachePromise;
  }
  async resolveBuiltinExtensionGalleryResources(extensionGalleryResources) {
    if (extensionGalleryResources.length === 0) {
      return [];
    }
    const result = /* @__PURE__ */ new Map();
    const extensionInfos = [];
    await Promise.all(extensionGalleryResources.map(async (extensionGalleryResource) => {
      try {
        const webExtension = await this.toWebExtensionFromExtensionGalleryResource(extensionGalleryResource);
        result.set(webExtension.identifier.id.toLowerCase(), webExtension);
        extensionInfos.push({ id: webExtension.identifier.id, version: webExtension.version });
      } catch (error) {
        this.logService.info(`Ignoring additional builtin extension from gallery resource ${extensionGalleryResource.toString()} because there is an error while converting it into web extension`, getErrorMessage(error));
      }
    }));
    const galleryExtensions = await this.galleryService.getExtensions(extensionInfos, CancellationToken.None);
    for (const galleryExtension of galleryExtensions) {
      const webExtension = result.get(galleryExtension.identifier.id.toLowerCase());
      if (webExtension) {
        result.set(galleryExtension.identifier.id.toLowerCase(), {
          ...webExtension,
          identifier: { id: webExtension.identifier.id, uuid: galleryExtension.identifier.uuid },
          readmeUri: galleryExtension.assets.readme ? URI.parse(galleryExtension.assets.readme.uri) : void 0,
          changelogUri: galleryExtension.assets.changelog ? URI.parse(galleryExtension.assets.changelog.uri) : void 0,
          metadata: { isPreReleaseVersion: galleryExtension.properties.isPreReleaseVersion, preRelease: galleryExtension.properties.isPreReleaseVersion, isBuiltin: true, pinned: true }
        });
      }
    }
    return [...result.values()];
  }
  async resolveBuiltinGalleryExtensions(extensions) {
    if (extensions.length === 0) {
      return [];
    }
    const webExtensions = [];
    const galleryExtensionsMap = await this.getExtensionsWithDependenciesAndPackedExtensions(extensions);
    const missingExtensions = extensions.filter(({ id }) => !galleryExtensionsMap.has(id.toLowerCase()));
    if (missingExtensions.length) {
      this.logService.info("Skipping the additional builtin extensions because their compatible versions are not found.", missingExtensions);
    }
    await Promise.all([...galleryExtensionsMap.values()].map(async (gallery) => {
      try {
        const webExtension = await this.toWebExtensionFromGallery(gallery, { isPreReleaseVersion: gallery.properties.isPreReleaseVersion, preRelease: gallery.properties.isPreReleaseVersion, isBuiltin: true });
        webExtensions.push(webExtension);
      } catch (error) {
        this.logService.info(`Ignoring additional builtin extension ${gallery.identifier.id} because there is an error while converting it into web extension`, getErrorMessage(error));
      }
    }));
    return webExtensions;
  }
  async resolveDependenciesAndPackedExtensions(webExtensions, result) {
    const extensionInfos = [];
    for (const webExtension of webExtensions) {
      for (const e of [...webExtension.manifest?.extensionDependencies ?? [], ...webExtension.manifest?.extensionPack ?? []]) {
        if (!result.has(e.toLowerCase())) {
          extensionInfos.push({ id: e, version: webExtension.version });
        }
      }
    }
    if (extensionInfos.length === 0) {
      return;
    }
    const galleryExtensions = await this.getExtensionsWithDependenciesAndPackedExtensions(extensionInfos, /* @__PURE__ */ new Set([...result.keys()]));
    await Promise.all([...galleryExtensions.values()].map(async (gallery) => {
      try {
        const webExtension = await this.toWebExtensionFromGallery(gallery, { isPreReleaseVersion: gallery.properties.isPreReleaseVersion, preRelease: gallery.properties.isPreReleaseVersion, isBuiltin: true });
        result.set(webExtension.identifier.id.toLowerCase(), webExtension);
      } catch (error) {
        this.logService.info(`Ignoring additional builtin extension ${gallery.identifier.id} because there is an error while converting it into web extension`, getErrorMessage(error));
      }
    }));
  }
  async getExtensionsWithDependenciesAndPackedExtensions(toGet, seen = /* @__PURE__ */ new Set(), result = /* @__PURE__ */ new Map()) {
    if (toGet.length === 0) {
      return result;
    }
    const extensions = await this.galleryService.getExtensions(toGet, { compatible: true, targetPlatform: TargetPlatform.WEB }, CancellationToken.None);
    const packsAndDependencies = /* @__PURE__ */ new Map();
    for (const extension of extensions) {
      result.set(extension.identifier.id.toLowerCase(), extension);
      for (const id of [...isNonEmptyArray(extension.properties.dependencies) ? extension.properties.dependencies : [], ...isNonEmptyArray(extension.properties.extensionPack) ? extension.properties.extensionPack : []]) {
        if (!result.has(id.toLowerCase()) && !packsAndDependencies.has(id.toLowerCase()) && !seen.has(id.toLowerCase())) {
          const extensionInfo = toGet.find((e) => areSameExtensions(e, extension.identifier));
          packsAndDependencies.set(id.toLowerCase(), { id, preRelease: extensionInfo?.preRelease });
        }
      }
    }
    return this.getExtensionsWithDependenciesAndPackedExtensions([...packsAndDependencies.values()].filter(({ id }) => !result.has(id.toLowerCase())), seen, result);
  }
  async scanSystemExtensions() {
    return this.readSystemExtensions();
  }
  async scanUserExtensions(profileLocation, scanOptions) {
    const extensions = /* @__PURE__ */ new Map();
    const customBuiltinExtensions = await this.readCustomBuiltinExtensions(scanOptions);
    for (const extension of customBuiltinExtensions) {
      extensions.set(extension.identifier.id.toLowerCase(), extension);
    }
    const installedExtensions = await this.scanInstalledExtensions(profileLocation, scanOptions);
    for (const extension of installedExtensions) {
      extensions.set(extension.identifier.id.toLowerCase(), extension);
    }
    return [...extensions.values()];
  }
  async scanExtensionsUnderDevelopment() {
    const devExtensions = this.environmentService.options?.developmentOptions?.extensions;
    const result = [];
    if (Array.isArray(devExtensions)) {
      await Promise.allSettled(devExtensions.map(async (devExtension) => {
        try {
          const location = URI.revive(devExtension);
          if (URI.isUri(location)) {
            const webExtension = await this.toWebExtension(location);
            result.push(await this.toScannedExtension(webExtension, false));
          } else {
            this.logService.info(`Skipping the extension under development ${devExtension} as it is not URI type.`);
          }
        } catch (error) {
          this.logService.info(`Error while fetching the extension under development ${devExtension.toString()}.`, getErrorMessage(error));
        }
      }));
    }
    return result;
  }
  async scanExistingExtension(extensionLocation, extensionType, profileLocation) {
    if (extensionType === ExtensionType.System) {
      const systemExtensions = await this.scanSystemExtensions();
      return systemExtensions.find((e) => e.location.toString() === extensionLocation.toString()) || null;
    }
    const userExtensions = await this.scanUserExtensions(profileLocation);
    return userExtensions.find((e) => e.location.toString() === extensionLocation.toString()) || null;
  }
  async scanExtensionManifest(extensionLocation) {
    try {
      return await this.getExtensionManifest(extensionLocation);
    } catch (error) {
      this.logService.warn(`Error while fetching manifest from ${extensionLocation.toString()}`, getErrorMessage(error));
      return null;
    }
  }
  async addExtensionFromGallery(galleryExtension, metadata, profileLocation) {
    const webExtension = await this.toWebExtensionFromGallery(galleryExtension, metadata);
    return this.addWebExtension(webExtension, profileLocation);
  }
  async addExtension(location, metadata, profileLocation) {
    const webExtension = await this.toWebExtension(location, void 0, void 0, void 0, void 0, void 0, void 0, metadata);
    const extension = await this.toScannedExtension(webExtension, false);
    await this.addToInstalledExtensions([webExtension], profileLocation);
    return extension;
  }
  async removeExtension(extension, profileLocation) {
    await this.writeInstalledExtensions(profileLocation, (installedExtensions) => installedExtensions.filter((installedExtension) => !areSameExtensions(installedExtension.identifier, extension.identifier)));
  }
  async updateMetadata(extension, metadata, profileLocation) {
    let updatedExtension = void 0;
    await this.writeInstalledExtensions(profileLocation, (installedExtensions) => {
      const result = [];
      for (const installedExtension of installedExtensions) {
        if (areSameExtensions(extension.identifier, installedExtension.identifier)) {
          installedExtension.metadata = { ...installedExtension.metadata, ...metadata };
          updatedExtension = installedExtension;
          result.push(installedExtension);
        } else {
          result.push(installedExtension);
        }
      }
      return result;
    });
    if (!updatedExtension) {
      throw new Error("Extension not found");
    }
    return this.toScannedExtension(updatedExtension, extension.isBuiltin);
  }
  async copyExtensions(fromProfileLocation, toProfileLocation, filter) {
    const extensionsToCopy = [];
    const fromWebExtensions = await this.readInstalledExtensions(fromProfileLocation);
    await Promise.all(fromWebExtensions.map(async (webExtension) => {
      const scannedExtension = await this.toScannedExtension(webExtension, false);
      if (filter(scannedExtension)) {
        extensionsToCopy.push(webExtension);
      }
    }));
    if (extensionsToCopy.length) {
      await this.addToInstalledExtensions(extensionsToCopy, toProfileLocation);
    }
  }
  async addWebExtension(webExtension, profileLocation) {
    const isSystem = !!(await this.scanSystemExtensions()).find((e) => areSameExtensions(e.identifier, webExtension.identifier));
    const isBuiltin = !!webExtension.metadata?.isBuiltin;
    const extension = await this.toScannedExtension(webExtension, isBuiltin);
    if (isSystem) {
      await this.writeSystemExtensionsCache((systemExtensions) => {
        systemExtensions = systemExtensions.filter((extension2) => !areSameExtensions(extension2.identifier, webExtension.identifier));
        systemExtensions.push(webExtension);
        return systemExtensions;
      });
      return extension;
    }
    if (isBuiltin) {
      await this.writeCustomBuiltinExtensionsCache((customBuiltinExtensions) => {
        customBuiltinExtensions = customBuiltinExtensions.filter((extension2) => !areSameExtensions(extension2.identifier, webExtension.identifier));
        customBuiltinExtensions.push(webExtension);
        return customBuiltinExtensions;
      });
      const installedExtensions = await this.readInstalledExtensions(profileLocation);
      if (installedExtensions.some((e) => areSameExtensions(e.identifier, webExtension.identifier))) {
        await this.addToInstalledExtensions([webExtension], profileLocation);
      }
      return extension;
    }
    await this.addToInstalledExtensions([webExtension], profileLocation);
    return extension;
  }
  async addToInstalledExtensions(webExtensions, profileLocation) {
    await this.writeInstalledExtensions(profileLocation, (installedExtensions) => {
      installedExtensions = installedExtensions.filter((installedExtension) => webExtensions.some((extension) => !areSameExtensions(installedExtension.identifier, extension.identifier)));
      installedExtensions.push(...webExtensions);
      return installedExtensions;
    });
  }
  async scanInstalledExtensions(profileLocation, scanOptions) {
    let installedExtensions = await this.readInstalledExtensions(profileLocation);
    if (!this.uriIdentityService.extUri.isEqual(profileLocation, this.userDataProfilesService.defaultProfile.extensionsResource)) {
      installedExtensions = installedExtensions.filter((i) => !i.metadata?.isApplicationScoped);
      const defaultProfileExtensions = await this.readInstalledExtensions(this.userDataProfilesService.defaultProfile.extensionsResource);
      installedExtensions.push(...defaultProfileExtensions.filter((i) => i.metadata?.isApplicationScoped));
    }
    installedExtensions.sort((a, b) => a.identifier.id < b.identifier.id ? -1 : a.identifier.id > b.identifier.id ? 1 : semver.rcompare(a.version, b.version));
    const result = /* @__PURE__ */ new Map();
    for (const webExtension of installedExtensions) {
      const existing = result.get(webExtension.identifier.id.toLowerCase());
      if (existing && semver.gt(existing.manifest.version, webExtension.version)) {
        continue;
      }
      const extension = await this.toScannedExtension(webExtension, false);
      if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
        result.set(extension.identifier.id.toLowerCase(), extension);
      } else {
        this.logService.info(`Skipping invalid installed extension ${webExtension.identifier.id}`);
      }
    }
    return [...result.values()];
  }
  async toWebExtensionFromGallery(galleryExtension, metadata) {
    const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({
      publisher: galleryExtension.publisher,
      name: galleryExtension.name,
      version: galleryExtension.version,
      targetPlatform: galleryExtension.properties.targetPlatform === TargetPlatform.WEB ? TargetPlatform.WEB : void 0
    }, "extension");
    if (!extensionLocation) {
      throw new Error("No extension gallery service configured.");
    }
    return this.toWebExtensionFromExtensionGalleryResource(
      extensionLocation,
      galleryExtension.identifier,
      galleryExtension.assets.readme ? URI.parse(galleryExtension.assets.readme.uri) : void 0,
      galleryExtension.assets.changelog ? URI.parse(galleryExtension.assets.changelog.uri) : void 0,
      metadata
    );
  }
  async toWebExtensionFromExtensionGalleryResource(extensionLocation, identifier, readmeUri, changelogUri, metadata) {
    const extensionResources = await this.listExtensionResources(extensionLocation);
    const packageNLSResources = this.getPackageNLSResourceMapFromResources(extensionResources);
    const fallbackPackageNLSResource = extensionResources.find((e) => basename(e) === "package.nls.json");
    return this.toWebExtension(
      extensionLocation,
      identifier,
      void 0,
      packageNLSResources,
      fallbackPackageNLSResource ? URI.parse(fallbackPackageNLSResource) : null,
      readmeUri,
      changelogUri,
      metadata
    );
  }
  getPackageNLSResourceMapFromResources(extensionResources) {
    const packageNLSResources = /* @__PURE__ */ new Map();
    extensionResources.forEach((e) => {
      const regexResult = /package\.nls\.([\w-]+)\.json/.exec(basename(e));
      if (regexResult?.[1]) {
        packageNLSResources.set(regexResult[1], URI.parse(e));
      }
    });
    return packageNLSResources;
  }
  async toWebExtension(extensionLocation, identifier, manifest, packageNLSUris, fallbackPackageNLSUri, readmeUri, changelogUri, metadata) {
    if (!manifest) {
      try {
        manifest = await this.getExtensionManifest(extensionLocation);
      } catch (error) {
        throw new Error(`Error while fetching manifest from the location '${extensionLocation.toString()}'. ${getErrorMessage(error)}`);
      }
    }
    if (!this.extensionManifestPropertiesService.canExecuteOnWeb(manifest)) {
      throw new Error(localize("not a web extension", "Cannot add '{0}' because this extension is not a web extension.", manifest.displayName || manifest.name));
    }
    if (fallbackPackageNLSUri === void 0) {
      try {
        fallbackPackageNLSUri = joinPath(extensionLocation, "package.nls.json");
        await this.extensionResourceLoaderService.readExtensionResource(fallbackPackageNLSUri);
      } catch (error) {
        fallbackPackageNLSUri = void 0;
      }
    }
    const defaultManifestTranslations = fallbackPackageNLSUri ? URI.isUri(fallbackPackageNLSUri) ? await this.getTranslations(fallbackPackageNLSUri) : fallbackPackageNLSUri : null;
    return {
      identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name), uuid: identifier?.uuid },
      version: manifest.version,
      location: extensionLocation,
      manifest,
      readmeUri,
      changelogUri,
      packageNLSUris,
      fallbackPackageNLSUri: URI.isUri(fallbackPackageNLSUri) ? fallbackPackageNLSUri : void 0,
      defaultManifestTranslations,
      metadata
    };
  }
  async toScannedExtension(webExtension, isBuiltin, type = ExtensionType.User) {
    const validations = [];
    let manifest = webExtension.manifest;
    if (!manifest) {
      try {
        manifest = await this.getExtensionManifest(webExtension.location);
      } catch (error) {
        validations.push([Severity.Error, `Error while fetching manifest from the location '${webExtension.location}'. ${getErrorMessage(error)}`]);
      }
    }
    if (!manifest) {
      const [publisher, name] = webExtension.identifier.id.split(".");
      manifest = {
        name,
        publisher,
        version: webExtension.version,
        engines: { vscode: "*" }
      };
    }
    const packageNLSUri = webExtension.packageNLSUris?.get(Language.value().toLowerCase());
    const fallbackPackageNLS = webExtension.defaultManifestTranslations ?? webExtension.fallbackPackageNLSUri;
    if (packageNLSUri) {
      manifest = await this.translateManifest(manifest, packageNLSUri, fallbackPackageNLS);
    } else if (fallbackPackageNLS) {
      manifest = await this.translateManifest(manifest, fallbackPackageNLS);
    }
    const uuid = webExtension.metadata?.id;
    validations.push(...validateExtensionManifest(this.productService.version, this.productService.date, webExtension.location, manifest, false));
    let isValid = true;
    for (const [severity, message] of validations) {
      if (severity === Severity.Error) {
        isValid = false;
        this.logService.error(message);
      }
    }
    if (manifest.enabledApiProposals) {
      manifest.enabledApiProposals = parseEnabledApiProposalNames([...manifest.enabledApiProposals]);
    }
    return {
      identifier: { id: webExtension.identifier.id, uuid: webExtension.identifier.uuid || uuid },
      location: webExtension.location,
      manifest,
      type,
      isBuiltin,
      readmeUrl: webExtension.readmeUri,
      changelogUrl: webExtension.changelogUri,
      metadata: webExtension.metadata,
      targetPlatform: TargetPlatform.WEB,
      validations,
      isValid,
      preRelease: !!webExtension.metadata?.preRelease
    };
  }
  async listExtensionResources(extensionLocation) {
    try {
      const result = await this.extensionResourceLoaderService.readExtensionResource(extensionLocation);
      return JSON.parse(result);
    } catch (error) {
      this.logService.warn("Error while fetching extension resources list", getErrorMessage(error));
    }
    return [];
  }
  async translateManifest(manifest, nlsURL, fallbackNLS) {
    try {
      const translations = URI.isUri(nlsURL) ? await this.getTranslations(nlsURL) : nlsURL;
      const fallbackTranslations = URI.isUri(fallbackNLS) ? await this.getTranslations(fallbackNLS) : fallbackNLS;
      if (translations) {
        manifest = localizeManifest(this.logService, manifest, translations, fallbackTranslations);
      }
    } catch (error) {
    }
    return manifest;
  }
  async getExtensionManifest(location) {
    const url = joinPath(location, "package.json");
    const content = await this.extensionResourceLoaderService.readExtensionResource(url);
    return JSON.parse(content);
  }
  async getTranslations(nlsUrl) {
    try {
      const content = await this.extensionResourceLoaderService.readExtensionResource(nlsUrl);
      return JSON.parse(content);
    } catch (error) {
      this.logService.error(`Error while fetching translations of an extension`, nlsUrl.toString(), getErrorMessage(error));
    }
    return void 0;
  }
  async readInstalledExtensions(profileLocation) {
    return this.withWebExtensions(profileLocation);
  }
  writeInstalledExtensions(profileLocation, updateFn) {
    return this.withWebExtensions(profileLocation, updateFn);
  }
  readCustomBuiltinExtensionsCache() {
    return this.withWebExtensions(this.customBuiltinExtensionsCacheResource);
  }
  writeCustomBuiltinExtensionsCache(updateFn) {
    return this.withWebExtensions(this.customBuiltinExtensionsCacheResource, updateFn);
  }
  readSystemExtensionsCache() {
    return this.withWebExtensions(this.systemExtensionsCacheResource);
  }
  writeSystemExtensionsCache(updateFn) {
    return this.withWebExtensions(this.systemExtensionsCacheResource, updateFn);
  }
  async withWebExtensions(file, updateFn) {
    if (!file) {
      return [];
    }
    return this.getResourceAccessQueue(file).queue(async () => {
      let webExtensions = [];
      try {
        const content = await this.fileService.readFile(file);
        const storedWebExtensions = JSON.parse(content.value.toString());
        for (const e of storedWebExtensions) {
          if (!e.location || !e.identifier || !e.version) {
            this.logService.info("Ignoring invalid extension while scanning", storedWebExtensions);
            continue;
          }
          let packageNLSUris;
          if (e.packageNLSUris) {
            packageNLSUris = /* @__PURE__ */ new Map();
            Object.entries(e.packageNLSUris).forEach(([key, value]) => packageNLSUris.set(key, URI.revive(value)));
          }
          webExtensions.push({
            identifier: e.identifier,
            version: e.version,
            location: URI.revive(e.location),
            manifest: e.manifest,
            readmeUri: URI.revive(e.readmeUri),
            changelogUri: URI.revive(e.changelogUri),
            packageNLSUris,
            fallbackPackageNLSUri: URI.revive(e.fallbackPackageNLSUri),
            defaultManifestTranslations: e.defaultManifestTranslations,
            packageNLSUri: URI.revive(e.packageNLSUri),
            metadata: e.metadata
          });
        }
        try {
          webExtensions = await this.migrateWebExtensions(webExtensions, file);
        } catch (error) {
          this.logService.error(`Error while migrating scanned extensions in ${file.toString()}`, getErrorMessage(error));
        }
      } catch (error) {
        if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
          this.logService.error(error);
        }
      }
      if (updateFn) {
        await this.storeWebExtensions(webExtensions = updateFn(webExtensions), file);
      }
      return webExtensions;
    });
  }
  async migrateWebExtensions(webExtensions, file) {
    let update = false;
    webExtensions = await Promise.all(webExtensions.map(async (webExtension) => {
      if (!webExtension.manifest) {
        try {
          webExtension.manifest = await this.getExtensionManifest(webExtension.location);
          update = true;
        } catch (error) {
          this.logService.error(`Error while updating manifest of an extension in ${file.toString()}`, webExtension.identifier.id, getErrorMessage(error));
        }
      }
      if (isUndefined(webExtension.defaultManifestTranslations)) {
        if (webExtension.fallbackPackageNLSUri) {
          try {
            const content = await this.extensionResourceLoaderService.readExtensionResource(webExtension.fallbackPackageNLSUri);
            webExtension.defaultManifestTranslations = JSON.parse(content);
            update = true;
          } catch (error) {
            this.logService.error(`Error while fetching default manifest translations of an extension`, webExtension.identifier.id, getErrorMessage(error));
          }
        } else {
          update = true;
          webExtension.defaultManifestTranslations = null;
        }
      }
      const migratedLocation = migratePlatformSpecificExtensionGalleryResourceURL(webExtension.location, TargetPlatform.WEB);
      if (migratedLocation) {
        update = true;
        webExtension.location = migratedLocation;
      }
      if (isUndefined(webExtension.metadata?.hasPreReleaseVersion) && webExtension.metadata?.preRelease) {
        update = true;
        webExtension.metadata.hasPreReleaseVersion = true;
      }
      return webExtension;
    }));
    if (update) {
      await this.storeWebExtensions(webExtensions, file);
    }
    return webExtensions;
  }
  async storeWebExtensions(webExtensions, file) {
    function toStringDictionary(dictionary) {
      if (!dictionary) {
        return void 0;
      }
      const result = /* @__PURE__ */ Object.create(null);
      dictionary.forEach((value, key) => result[key] = value.toJSON());
      return result;
    }
    const storedWebExtensions = webExtensions.map((e) => ({
      identifier: e.identifier,
      version: e.version,
      manifest: e.manifest,
      location: e.location.toJSON(),
      readmeUri: e.readmeUri?.toJSON(),
      changelogUri: e.changelogUri?.toJSON(),
      packageNLSUris: toStringDictionary(e.packageNLSUris),
      defaultManifestTranslations: e.defaultManifestTranslations,
      fallbackPackageNLSUri: e.fallbackPackageNLSUri?.toJSON(),
      metadata: e.metadata
    }));
    await this.fileService.writeFile(file, VSBuffer.fromString(JSON.stringify(storedWebExtensions)));
  }
  getResourceAccessQueue(file) {
    let resourceQueue = this.resourcesAccessQueueMap.get(file);
    if (!resourceQueue) {
      this.resourcesAccessQueueMap.set(file, resourceQueue = new Queue());
    }
    return resourceQueue;
  }
};
WebExtensionsScannerService = __decorateClass([
  __decorateParam(0, IBrowserWorkbenchEnvironmentService),
  __decorateParam(1, IBuiltinExtensionsScannerService),
  __decorateParam(2, IFileService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IExtensionGalleryService),
  __decorateParam(5, IExtensionManifestPropertiesService),
  __decorateParam(6, IExtensionResourceLoaderService),
  __decorateParam(7, IExtensionStorageService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IUserDataProfilesService),
  __decorateParam(11, IUriIdentityService),
  __decorateParam(12, ILifecycleService)
], WebExtensionsScannerService);
if (isWeb) {
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: "workbench.extensions.action.openInstalledWebExtensionsResource",
        title: localize2("openInstalledWebExtensionsResource", "Open Installed Web Extensions Resource"),
        category: Categories.Developer,
        f1: true,
        precondition: IsWebContext
      });
    }
    run(serviceAccessor) {
      const editorService = serviceAccessor.get(IEditorService);
      const userDataProfileService = serviceAccessor.get(IUserDataProfileService);
      editorService.openEditor({ resource: userDataProfileService.currentProfile.extensionsResource });
    }
  });
}
registerSingleton(IWebExtensionsScannerService, WebExtensionsScannerService, InstantiationType.Delayed);
export {
  WebExtensionsScannerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25NYW5hZ2VtZW50XFxicm93c2VyXFx3ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQnVpbHRpbkV4dGVuc2lvbnNTY2FubmVyU2VydmljZSwgRXh0ZW5zaW9uVHlwZSwgSUV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb24sIElFeHRlbnNpb25NYW5pZmVzdCwgVGFyZ2V0UGxhdGZvcm0sIElSZWxheGVkRXh0ZW5zaW9uTWFuaWZlc3QsIHBhcnNlRW5hYmxlZEFwaVByb3Bvc2FsTmFtZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNjYW5uZWRFeHRlbnNpb24sIElXZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsIFNjYW5PcHRpb25zIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgaXNXZWIsIExhbmd1YWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgUXVldWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUV4dGVuc2lvbkluZm8sIElHYWxsZXJ5RXh0ZW5zaW9uLCBJR2FsbGVyeU1ldGFkYXRhLCBNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMsIGdldEdhbGxlcnlFeHRlbnNpb25JZCwgZ2V0RXh0ZW5zaW9uSWQsIGlzTWFsaWNpb3VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVHJhbnNsYXRpb25zLCBsb2NhbGl6ZU1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTmxzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgc2VtdmVyIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NlbXZlci9zZW12ZXIuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcsIGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLCBtaWdyYXRlUGxhdGZvcm1TcGVjaWZpY0V4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVVSTCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvblJlc291cmNlTG9hZGVyL2NvbW1vbi9leHRlbnNpb25SZXNvdXJjZUxvYWRlci5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgSXNXZWJDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvblN0b3JhZ2UuanMnO1xuaW1wb3J0IHsgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyB2YWxpZGF0ZUV4dGVuc2lvbk1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uVmFsaWRhdG9yLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5cbnR5cGUgR2FsbGVyeUV4dGVuc2lvbkluZm8gPSB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHByZVJlbGVhc2U/OiBib29sZWFuOyBtaWdyYXRlU3RvcmFnZUZyb20/OiBzdHJpbmcgfTtcbnR5cGUgRXh0ZW5zaW9uSW5mbyA9IHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcHJlUmVsZWFzZTogYm9vbGVhbiB9O1xuXG5mdW5jdGlvbiBpc0dhbGxlcnlFeHRlbnNpb25JbmZvKG9iajogdW5rbm93bik6IG9iaiBpcyBHYWxsZXJ5RXh0ZW5zaW9uSW5mbyB7XG5cdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25JbmZvID0gb2JqIGFzIEdhbGxlcnlFeHRlbnNpb25JbmZvIHwgdW5kZWZpbmVkO1xuXHRyZXR1cm4gdHlwZW9mIGdhbGxlcnlFeHRlbnNpb25JbmZvPy5pZCA9PT0gJ3N0cmluZydcblx0XHQmJiAoZ2FsbGVyeUV4dGVuc2lvbkluZm8ucHJlUmVsZWFzZSA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBnYWxsZXJ5RXh0ZW5zaW9uSW5mby5wcmVSZWxlYXNlID09PSAnYm9vbGVhbicpXG5cdFx0JiYgKGdhbGxlcnlFeHRlbnNpb25JbmZvLm1pZ3JhdGVTdG9yYWdlRnJvbSA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBnYWxsZXJ5RXh0ZW5zaW9uSW5mby5taWdyYXRlU3RvcmFnZUZyb20gPT09ICdzdHJpbmcnKTtcbn1cblxuZnVuY3Rpb24gaXNVcmlDb21wb25lbnRzKG9iajogdW5rbm93bik6IG9iaiBpcyBVcmlDb21wb25lbnRzIHtcblx0aWYgKCFvYmopIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgdGhpbmcgPSBvYmogYXMgVXJpQ29tcG9uZW50cyB8IHVuZGVmaW5lZDtcblx0cmV0dXJuIHR5cGVvZiB0aGluZz8ucGF0aCA9PT0gJ3N0cmluZycgJiZcblx0XHR0eXBlb2YgdGhpbmc/LnNjaGVtZSA9PT0gJ3N0cmluZyc7XG59XG5cbmludGVyZmFjZSBJU3RvcmVkV2ViRXh0ZW5zaW9uIHtcblx0cmVhZG9ubHkgaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXI7XG5cdHJlYWRvbmx5IHZlcnNpb246IHN0cmluZztcblx0cmVhZG9ubHkgbG9jYXRpb246IFVyaUNvbXBvbmVudHM7XG5cdHJlYWRvbmx5IG1hbmlmZXN0PzogSUV4dGVuc2lvbk1hbmlmZXN0O1xuXHRyZWFkb25seSByZWFkbWVVcmk/OiBVcmlDb21wb25lbnRzO1xuXHRyZWFkb25seSBjaGFuZ2Vsb2dVcmk/OiBVcmlDb21wb25lbnRzO1xuXHQvLyBkZXByZWNhdGVkIGluIGZhdm9yIG9mIHBhY2thZ2VOTFNVcmlzICYgZmFsbGJhY2tQYWNrYWdlTkxTVXJpXG5cdHJlYWRvbmx5IHBhY2thZ2VOTFNVcmk/OiBVcmlDb21wb25lbnRzO1xuXHRyZWFkb25seSBwYWNrYWdlTkxTVXJpcz86IElTdHJpbmdEaWN0aW9uYXJ5PFVyaUNvbXBvbmVudHM+O1xuXHRyZWFkb25seSBmYWxsYmFja1BhY2thZ2VOTFNVcmk/OiBVcmlDb21wb25lbnRzO1xuXHRyZWFkb25seSBkZWZhdWx0TWFuaWZlc3RUcmFuc2xhdGlvbnM/OiBJVHJhbnNsYXRpb25zIHwgbnVsbDtcblx0cmVhZG9ubHkgbWV0YWRhdGE/OiBNZXRhZGF0YTtcbn1cblxuaW50ZXJmYWNlIElXZWJFeHRlbnNpb24ge1xuXHRpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcjtcblx0dmVyc2lvbjogc3RyaW5nO1xuXHRsb2NhdGlvbjogVVJJO1xuXHRtYW5pZmVzdD86IElFeHRlbnNpb25NYW5pZmVzdDtcblx0cmVhZG1lVXJpPzogVVJJO1xuXHRjaGFuZ2Vsb2dVcmk/OiBVUkk7XG5cdC8vIGRlcHJlY2F0ZWQgaW4gZmF2b3Igb2YgcGFja2FnZU5MU1VyaXMgJiBmYWxsYmFja1BhY2thZ2VOTFNVcmlcblx0cGFja2FnZU5MU1VyaT86IFVSSTtcblx0cGFja2FnZU5MU1VyaXM/OiBNYXA8c3RyaW5nLCBVUkk+O1xuXHRmYWxsYmFja1BhY2thZ2VOTFNVcmk/OiBVUkk7XG5cdGRlZmF1bHRNYW5pZmVzdFRyYW5zbGF0aW9ucz86IElUcmFuc2xhdGlvbnMgfCBudWxsO1xuXHRtZXRhZGF0YT86IE1ldGFkYXRhO1xufVxuXG5leHBvcnQgY2xhc3MgV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3lzdGVtRXh0ZW5zaW9uc0NhY2hlUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBjdXN0b21CdWlsdGluRXh0ZW5zaW9uc0NhY2hlUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZXNBY2Nlc3NRdWV1ZU1hcCA9IG5ldyBSZXNvdXJjZU1hcDxRdWV1ZTxJV2ViRXh0ZW5zaW9uW10+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElCdWlsdGluRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYnVpbHRpbkV4dGVuc2lvbnNTY2FubmVyU2VydmljZTogSUJ1aWx0aW5FeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZTogSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2U6IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlOiBJRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0dGhpcy5zeXN0ZW1FeHRlbnNpb25zQ2FjaGVSZXNvdXJjZSA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLCAnc3lzdGVtRXh0ZW5zaW9uc0NhY2hlLmpzb24nKTtcblx0XHRcdHRoaXMuY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZVJlc291cmNlID0gam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJSb2FtaW5nRGF0YUhvbWUsICdjdXN0b21CdWlsdGluRXh0ZW5zaW9uc0NhY2hlLmpzb24nKTtcblxuXHRcdFx0Ly8gRXZlbnR1YWxseSB1cGRhdGUgY2FjaGVzXG5cdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLndoZW4oTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSkudGhlbigoKSA9PiB0aGlzLnVwZGF0ZUNhY2hlcygpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jdXN0b21CdWlsdGluRXh0ZW5zaW9uc0luZm9Qcm9taXNlOiBQcm9taXNlPHsgZXh0ZW5zaW9uczogRXh0ZW5zaW9uSW5mb1tdOyBleHRlbnNpb25zVG9NaWdyYXRlOiBbc3RyaW5nLCBzdHJpbmddW107IGV4dGVuc2lvbkxvY2F0aW9uczogVVJJW107IGV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZXM6IFVSSVtdIH0+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0luZm9Gcm9tRW52KCk6IFByb21pc2U8eyBleHRlbnNpb25zOiBFeHRlbnNpb25JbmZvW107IGV4dGVuc2lvbnNUb01pZ3JhdGU6IFtzdHJpbmcsIHN0cmluZ11bXTsgZXh0ZW5zaW9uTG9jYXRpb25zOiBVUklbXTsgZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlczogVVJJW10gfT4ge1xuXHRcdGlmICghdGhpcy5fY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNJbmZvUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNJbmZvUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxldCBleHRlbnNpb25zOiBFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uTG9jYXRpb25zOiBVUklbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzOiBVUklbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zVG9NaWdyYXRlOiBbc3RyaW5nLCBzdHJpbmddW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNJbmZvID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucyAmJiBBcnJheS5pc0FycmF5KHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnMuYWRkaXRpb25hbEJ1aWx0aW5FeHRlbnNpb25zKVxuXHRcdFx0XHRcdD8gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucy5hZGRpdGlvbmFsQnVpbHRpbkV4dGVuc2lvbnMubWFwKGFkZGl0aW9uYWxCdWlsdGluRXh0ZW5zaW9uID0+IGlzU3RyaW5nKGFkZGl0aW9uYWxCdWlsdGluRXh0ZW5zaW9uKSA/IHsgaWQ6IGFkZGl0aW9uYWxCdWlsdGluRXh0ZW5zaW9uIH0gOiBhZGRpdGlvbmFsQnVpbHRpbkV4dGVuc2lvbilcblx0XHRcdFx0XHQ6IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGUgb2YgY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNJbmZvKSB7XG5cdFx0XHRcdFx0aWYgKGlzR2FsbGVyeUV4dGVuc2lvbkluZm8oZSkpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbnMucHVzaCh7IGlkOiBlLmlkLCBwcmVSZWxlYXNlOiAhIWUucHJlUmVsZWFzZSB9KTtcblx0XHRcdFx0XHRcdGlmIChlLm1pZ3JhdGVTdG9yYWdlRnJvbSkge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25zVG9NaWdyYXRlLnB1c2goW2UubWlncmF0ZVN0b3JhZ2VGcm9tLCBlLmlkXSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpc1VyaUNvbXBvbmVudHMoZSkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkxvY2F0aW9uID0gVVJJLnJldml2ZShlKTtcblx0XHRcdFx0XHRcdGlmIChhd2FpdCB0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5pc0V4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZShleHRlbnNpb25Mb2NhdGlvbikpIHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlcy5wdXNoKGV4dGVuc2lvbkxvY2F0aW9uKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbkxvY2F0aW9ucy5wdXNoKGV4dGVuc2lvbkxvY2F0aW9uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuY2hlY2tBZGRpdGlvbmFsQnVpbHRpbkV4dGVuc2lvbnMoZXh0ZW5zaW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0ZvdW5kIGFkZGl0aW9uYWwgYnVpbHRpbiBnYWxsZXJ5IGV4dGVuc2lvbnMgaW4gZW52JywgZXh0ZW5zaW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbkxvY2F0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnRm91bmQgYWRkaXRpb25hbCBidWlsdGluIGxvY2F0aW9uIGV4dGVuc2lvbnMgaW4gZW52JywgZXh0ZW5zaW9uTG9jYXRpb25zLm1hcChlID0+IGUudG9TdHJpbmcoKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdGb3VuZCBhZGRpdGlvbmFsIGJ1aWx0aW4gZXh0ZW5zaW9uIGdhbGxlcnkgcmVzb3VyY2VzIGluIGVudicsIGV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZXMubWFwKGUgPT4gZS50b1N0cmluZygpKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsgZXh0ZW5zaW9ucywgZXh0ZW5zaW9uc1RvTWlncmF0ZSwgZXh0ZW5zaW9uTG9jYXRpb25zLCBleHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzIH07XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNJbmZvUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2hlY2tBZGRpdGlvbmFsQnVpbHRpbkV4dGVuc2lvbnMoZXh0ZW5zaW9uczogRXh0ZW5zaW9uSW5mb1tdKTogUHJvbWlzZTxFeHRlbnNpb25JbmZvW10+IHtcblx0XHRjb25zdCBleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0ID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk7XG5cdFx0Y29uc3QgcmVzdWx0OiBFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoaXNNYWxpY2lvdXMoeyBpZDogZXh0ZW5zaW9uLmlkIH0sIGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QubWFsaWNpb3VzKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgQ2hlY2tpbmcgYWRkaXRpb25hbCBidWlsdGluIGV4dGVuc2lvbnM6IElnbm9yaW5nICcke2V4dGVuc2lvbi5pZH0nIGJlY2F1c2UgaXQgaXMgcmVwb3J0ZWQgdG8gYmUgbWFsaWNpb3VzLmApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRlcHJlY2F0aW9uSW5mbyA9IGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QuZGVwcmVjYXRlZFtleHRlbnNpb24uaWQudG9Mb3dlckNhc2UoKV07XG5cdFx0XHRpZiAoZGVwcmVjYXRpb25JbmZvPy5leHRlbnNpb24/LmF1dG9NaWdyYXRlKSB7XG5cdFx0XHRcdGNvbnN0IHByZVJlbGVhc2VFeHRlbnNpb25JZCA9IGRlcHJlY2F0aW9uSW5mby5leHRlbnNpb24uaWQ7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBDaGVja2luZyBhZGRpdGlvbmFsIGJ1aWx0aW4gZXh0ZW5zaW9uczogJyR7ZXh0ZW5zaW9uLmlkfScgaXMgZGVwcmVjYXRlZCwgaW5zdGVhZCB1c2luZyAnJHtwcmVSZWxlYXNlRXh0ZW5zaW9uSWR9J2ApO1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IGlkOiBwcmVSZWxlYXNlRXh0ZW5zaW9uSWQsIHByZVJlbGVhc2U6ICEhZXh0ZW5zaW9uLnByZVJlbGVhc2UgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQucHVzaChleHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIEFsbCBzeXN0ZW0gZXh0ZW5zaW9ucyBidW5kbGVkIHdpdGggdGhlIHByb2R1Y3Rcblx0ICovXG5cdHByaXZhdGUgYXN5bmMgcmVhZFN5c3RlbUV4dGVuc2lvbnMoKTogUHJvbWlzZTxJRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBzeXN0ZW1FeHRlbnNpb25zID0gYXdhaXQgdGhpcy5idWlsdGluRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5CdWlsdGluRXh0ZW5zaW9ucygpO1xuXHRcdGNvbnN0IGNhY2hlZFN5c3RlbUV4dGVuc2lvbnMgPSBhd2FpdCBQcm9taXNlLmFsbCgoYXdhaXQgdGhpcy5yZWFkU3lzdGVtRXh0ZW5zaW9uc0NhY2hlKCkpLm1hcChlID0+IHRoaXMudG9TY2FubmVkRXh0ZW5zaW9uKGUsIHRydWUsIEV4dGVuc2lvblR5cGUuU3lzdGVtKSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIElFeHRlbnNpb24+KCk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgWy4uLnN5c3RlbUV4dGVuc2lvbnMsIC4uLmNhY2hlZFN5c3RlbUV4dGVuc2lvbnNdKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHJlc3VsdC5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0Ly8gSW5jYXNlIHRoZXJlIGFyZSBkdXBsaWNhdGVzIGFsd2F5cyB0YWtlIHRoZSBsYXRlc3QgdmVyc2lvblxuXHRcdFx0XHRpZiAoc2VtdmVyLmd0KGV4aXN0aW5nLm1hbmlmZXN0LnZlcnNpb24sIGV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQuc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCksIGV4dGVuc2lvbik7XG5cdFx0fVxuXHRcdHJldHVybiBbLi4ucmVzdWx0LnZhbHVlcygpXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBbGwgZXh0ZW5zaW9ucyBkZWZpbmVkIHZpYSBgYWRkaXRpb25hbEJ1aWx0aW5FeHRlbnNpb25zYCBBUElcblx0ICovXG5cdHByaXZhdGUgYXN5bmMgcmVhZEN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zKHNjYW5PcHRpb25zPzogU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBbY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNGcm9tTG9jYXRpb25zLCBjdXN0b21CdWlsdGluRXh0ZW5zaW9uc0Zyb21HYWxsZXJ5XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuZ2V0Q3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNGcm9tTG9jYXRpb25zKHNjYW5PcHRpb25zKSxcblx0XHRcdHRoaXMuZ2V0Q3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNGcm9tR2FsbGVyeShzY2FuT3B0aW9ucyksXG5cdFx0XSk7XG5cdFx0Y29uc3QgY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnM6IElTY2FubmVkRXh0ZW5zaW9uW10gPSBbLi4uY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNGcm9tTG9jYXRpb25zLCAuLi5jdXN0b21CdWlsdGluRXh0ZW5zaW9uc0Zyb21HYWxsZXJ5XTtcblx0XHRhd2FpdCB0aGlzLm1pZ3JhdGVFeHRlbnNpb25zU3RvcmFnZShjdXN0b21CdWlsdGluRXh0ZW5zaW9ucyk7XG5cdFx0cmV0dXJuIGN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0Zyb21Mb2NhdGlvbnMoc2Nhbk9wdGlvbnM/OiBTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHsgZXh0ZW5zaW9uTG9jYXRpb25zIH0gPSBhd2FpdCB0aGlzLnJlYWRDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0luZm9Gcm9tRW52KCk7XG5cdFx0aWYgKCFleHRlbnNpb25Mb2NhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogSVNjYW5uZWRFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChleHRlbnNpb25Mb2NhdGlvbnMubWFwKGFzeW5jIGV4dGVuc2lvbkxvY2F0aW9uID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHdlYkV4dGVuc2lvbiA9IGF3YWl0IHRoaXMudG9XZWJFeHRlbnNpb24oZXh0ZW5zaW9uTG9jYXRpb24pO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBhd2FpdCB0aGlzLnRvU2Nhbm5lZEV4dGVuc2lvbih3ZWJFeHRlbnNpb24sIHRydWUpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmlzVmFsaWQgfHwgIXNjYW5PcHRpb25zPy5za2lwSW52YWxpZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBTa2lwcGluZyBpbnZhbGlkIGFkZGl0aW9uYWwgYnVpbHRpbiBleHRlbnNpb24gJHt3ZWJFeHRlbnNpb24uaWRlbnRpZmllci5pZH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEVycm9yIHdoaWxlIGZldGNoaW5nIHRoZSBhZGRpdGlvbmFsIGJ1aWx0aW4gZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uTG9jYXRpb24udG9TdHJpbmcoKX0uYCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zRnJvbUdhbGxlcnkoc2Nhbk9wdGlvbnM/OiBTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdGlmICghdGhpcy5nYWxsZXJ5U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0lnbm9yaW5nIGZldGNoaW5nIGFkZGl0aW9uYWwgYnVpbHRpbiBleHRlbnNpb25zIGZyb20gZ2FsbGVyeSBhcyBpdCBpcyBkaXNhYmxlZC4nKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBJU2Nhbm5lZEV4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgeyBleHRlbnNpb25zLCBleHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzIH0gPSBhd2FpdCB0aGlzLnJlYWRDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0luZm9Gcm9tRW52KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhY2hlVmFsdWUgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKSxcblx0XHRcdFx0ZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlczogZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlcy5tYXAoZSA9PiBlLnRvU3RyaW5nKCkpLnNvcnQoKVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB1c2VDYWNoZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KCdhZGRpdGlvbmFsQnVpbHRpbkV4dGVuc2lvbnMnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sICd7fScpID09PSBjYWNoZVZhbHVlO1xuXHRcdFx0Y29uc3Qgd2ViRXh0ZW5zaW9ucyA9IGF3YWl0ICh1c2VDYWNoZSA/IHRoaXMuZ2V0Q3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNGcm9tQ2FjaGUoKSA6IHRoaXMudXBkYXRlQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZSgpKTtcblx0XHRcdGlmICh3ZWJFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbCh3ZWJFeHRlbnNpb25zLm1hcChhc3luYyB3ZWJFeHRlbnNpb24gPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBhd2FpdCB0aGlzLnRvU2Nhbm5lZEV4dGVuc2lvbih3ZWJFeHRlbnNpb24sIHRydWUpO1xuXHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbi5pc1ZhbGlkIHx8ICFzY2FuT3B0aW9ucz8uc2tpcEludmFsaWRFeHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU2tpcHBpbmcgaW52YWxpZCBhZGRpdGlvbmFsIGJ1aWx0aW4gZ2FsbGVyeSBleHRlbnNpb24gJHt3ZWJFeHRlbnNpb24uaWRlbnRpZmllci5pZH1gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYElnbm9yaW5nIGFkZGl0aW9uYWwgYnVpbHRpbiBleHRlbnNpb24gJHt3ZWJFeHRlbnNpb24uaWRlbnRpZmllci5pZH0gYmVjYXVzZSB0aGVyZSBpcyBhbiBlcnJvciB3aGlsZSBjb252ZXJ0aW5nIGl0IGludG8gc2Nhbm5lZCBleHRlbnNpb25gLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2FkZGl0aW9uYWxCdWlsdGluRXh0ZW5zaW9ucycsIGNhY2hlVmFsdWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0lnbm9yaW5nIGZvbGxvd2luZyBhZGRpdGlvbmFsIGJ1aWx0aW4gZXh0ZW5zaW9ucyBhcyB0aGVyZSBpcyBhbiBlcnJvciB3aGlsZSBmZXRjaGluZyB0aGVtIGZyb20gZ2FsbGVyeScsIGV4dGVuc2lvbnMubWFwKCh7IGlkIH0pID0+IGlkKSwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zRnJvbUNhY2hlKCk6IFByb21pc2U8SVdlYkV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgY2FjaGVkQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnJlYWRDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0NhY2hlKCk7XG5cdFx0Y29uc3Qgd2ViRXh0ZW5zaW9uc01hcCA9IG5ldyBNYXA8c3RyaW5nLCBJV2ViRXh0ZW5zaW9uPigpO1xuXHRcdGZvciAoY29uc3Qgd2ViRXh0ZW5zaW9uIG9mIGNhY2hlZEN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHdlYkV4dGVuc2lvbnNNYXAuZ2V0KHdlYkV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdC8vIEluY2FzZSB0aGVyZSBhcmUgZHVwbGljYXRlcyBhbHdheXMgdGFrZSB0aGUgbGF0ZXN0IHZlcnNpb25cblx0XHRcdFx0aWYgKHNlbXZlci5ndChleGlzdGluZy52ZXJzaW9uLCB3ZWJFeHRlbnNpb24udmVyc2lvbikpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0LyogVXBkYXRlIHByZVJlbGVhc2UgZmxhZyBpbiB0aGUgY2FjaGUgLSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTQyODMxICovXG5cdFx0XHRpZiAod2ViRXh0ZW5zaW9uLm1ldGFkYXRhPy5pc1ByZVJlbGVhc2VWZXJzaW9uICYmICF3ZWJFeHRlbnNpb24ubWV0YWRhdGE/LnByZVJlbGVhc2UpIHtcblx0XHRcdFx0d2ViRXh0ZW5zaW9uLm1ldGFkYXRhLnByZVJlbGVhc2UgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0d2ViRXh0ZW5zaW9uc01hcC5zZXQod2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgd2ViRXh0ZW5zaW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIFsuLi53ZWJFeHRlbnNpb25zTWFwLnZhbHVlcygpXTtcblx0fVxuXG5cdHByaXZhdGUgX21pZ3JhdGVFeHRlbnNpb25zU3RvcmFnZVByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXN5bmMgbWlncmF0ZUV4dGVuc2lvbnNTdG9yYWdlKGN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX21pZ3JhdGVFeHRlbnNpb25zU3RvcmFnZVByb21pc2UpIHtcblx0XHRcdHRoaXMuX21pZ3JhdGVFeHRlbnNpb25zU3RvcmFnZVByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGV4dGVuc2lvbnNUb01pZ3JhdGUgfSA9IGF3YWl0IHRoaXMucmVhZEN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zSW5mb0Zyb21FbnYoKTtcblx0XHRcdFx0aWYgKCFleHRlbnNpb25zVG9NaWdyYXRlLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBmcm9tRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhleHRlbnNpb25zVG9NaWdyYXRlLm1hcCgoW2lkXSkgPT4gKHsgaWQgfSkpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoZXh0ZW5zaW9uc1RvTWlncmF0ZS5tYXAoYXN5bmMgKFtmcm9tLCB0b10pID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRvRXh0ZW5zaW9uID0gY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnMuZmluZChleHRlbnNpb24gPT4gYXJlU2FtZUV4dGVuc2lvbnMoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHsgaWQ6IHRvIH0pKTtcblx0XHRcdFx0XHRcdGlmICh0b0V4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmcm9tRXh0ZW5zaW9uID0gZnJvbUV4dGVuc2lvbnMuZmluZChleHRlbnNpb24gPT4gYXJlU2FtZUV4dGVuc2lvbnMoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHsgaWQ6IGZyb20gfSkpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmcm9tRXh0ZW5zaW9uTWFuaWZlc3QgPSBmcm9tRXh0ZW5zaW9uID8gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRNYW5pZmVzdChmcm9tRXh0ZW5zaW9uLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSA6IG51bGw7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZyb21FeHRlbnNpb25JZCA9IGZyb21FeHRlbnNpb25NYW5pZmVzdCA/IGdldEV4dGVuc2lvbklkKGZyb21FeHRlbnNpb25NYW5pZmVzdC5wdWJsaXNoZXIsIGZyb21FeHRlbnNpb25NYW5pZmVzdC5uYW1lKSA6IGZyb207XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRvRXh0ZW5zaW9uSWQgPSBnZXRFeHRlbnNpb25JZCh0b0V4dGVuc2lvbi5tYW5pZmVzdC5wdWJsaXNoZXIsIHRvRXh0ZW5zaW9uLm1hbmlmZXN0Lm5hbWUpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlLmFkZFRvTWlncmF0aW9uTGlzdChmcm9tRXh0ZW5zaW9uSWQsIHRvRXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFNraXBwZWQgbWlncmF0aW5nIGV4dGVuc2lvbiBzdG9yYWdlIGZyb20gJyR7ZnJvbX0nIHRvICcke3RvfScsIGJlY2F1c2UgdGhlICcke3RvfScgZXh0ZW5zaW9uIGlzIG5vdCBmb3VuZC5gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21pZ3JhdGVFeHRlbnNpb25zU3RvcmFnZVByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUNhY2hlcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnVwZGF0ZVN5c3RlbUV4dGVuc2lvbnNDYWNoZSgpO1xuXHRcdGF3YWl0IHRoaXMudXBkYXRlQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVTeXN0ZW1FeHRlbnNpb25zQ2FjaGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3lzdGVtRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuYnVpbHRpbkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuQnVpbHRpbkV4dGVuc2lvbnMoKTtcblx0XHRjb25zdCBjYWNoZWRTeXN0ZW1FeHRlbnNpb25zID0gKGF3YWl0IHRoaXMucmVhZFN5c3RlbUV4dGVuc2lvbnNDYWNoZSgpKVxuXHRcdFx0LmZpbHRlcihjYWNoZWQgPT4ge1xuXHRcdFx0XHRjb25zdCBzeXN0ZW1FeHRlbnNpb24gPSBzeXN0ZW1FeHRlbnNpb25zLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGNhY2hlZC5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdHJldHVybiBzeXN0ZW1FeHRlbnNpb24gJiYgc2VtdmVyLmd0KGNhY2hlZC52ZXJzaW9uLCBzeXN0ZW1FeHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbik7XG5cdFx0XHR9KTtcblx0XHRhd2FpdCB0aGlzLndyaXRlU3lzdGVtRXh0ZW5zaW9uc0NhY2hlKCgpID0+IGNhY2hlZFN5c3RlbUV4dGVuc2lvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZVByb21pc2U6IFByb21pc2U8SVdlYkV4dGVuc2lvbltdPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0NhY2hlKCk6IFByb21pc2U8SVdlYkV4dGVuc2lvbltdPiB7XG5cdFx0aWYgKCF0aGlzLl91cGRhdGVDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0NhY2hlUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fdXBkYXRlQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZVByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnVXBkYXRpbmcgYWRkaXRpb25hbCBidWlsdGluIGV4dGVuc2lvbnMgY2FjaGUnKTtcblx0XHRcdFx0Y29uc3QgeyBleHRlbnNpb25zLCBleHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzIH0gPSBhd2FpdCB0aGlzLnJlYWRDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0luZm9Gcm9tRW52KCk7XG5cdFx0XHRcdGNvbnN0IFtnYWxsZXJ5V2ViRXh0ZW5zaW9ucywgZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlV2ViRXh0ZW5zaW9uc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0dGhpcy5yZXNvbHZlQnVpbHRpbkdhbGxlcnlFeHRlbnNpb25zKGV4dGVuc2lvbnMpLFxuXHRcdFx0XHRcdHRoaXMucmVzb2x2ZUJ1aWx0aW5FeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzKGV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZXMpXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRjb25zdCB3ZWJFeHRlbnNpb25zTWFwID0gbmV3IE1hcDxzdHJpbmcsIElXZWJFeHRlbnNpb24+KCk7XG5cdFx0XHRcdGZvciAoY29uc3Qgd2ViRXh0ZW5zaW9uIG9mIFsuLi5nYWxsZXJ5V2ViRXh0ZW5zaW9ucywgLi4uZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlV2ViRXh0ZW5zaW9uc10pIHtcblx0XHRcdFx0XHR3ZWJFeHRlbnNpb25zTWFwLnNldCh3ZWJFeHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCB3ZWJFeHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVzb2x2ZURlcGVuZGVuY2llc0FuZFBhY2tlZEV4dGVuc2lvbnMoZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlV2ViRXh0ZW5zaW9ucywgd2ViRXh0ZW5zaW9uc01hcCk7XG5cdFx0XHRcdGNvbnN0IHdlYkV4dGVuc2lvbnMgPSBbLi4ud2ViRXh0ZW5zaW9uc01hcC52YWx1ZXMoKV07XG5cdFx0XHRcdGF3YWl0IHRoaXMud3JpdGVDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0NhY2hlKCgpID0+IHdlYkV4dGVuc2lvbnMpO1xuXHRcdFx0XHRyZXR1cm4gd2ViRXh0ZW5zaW9ucztcblx0XHRcdH0pKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl91cGRhdGVDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0NhY2hlUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUJ1aWx0aW5FeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzKGV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZXM6IFVSSVtdKTogUHJvbWlzZTxJV2ViRXh0ZW5zaW9uW10+IHtcblx0XHRpZiAoZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIElXZWJFeHRlbnNpb24+KCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSW5mb3M6IElFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChleHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzLm1hcChhc3luYyBleHRlbnNpb25HYWxsZXJ5UmVzb3VyY2UgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgd2ViRXh0ZW5zaW9uID0gYXdhaXQgdGhpcy50b1dlYkV4dGVuc2lvbkZyb21FeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2UoZXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlKTtcblx0XHRcdFx0cmVzdWx0LnNldCh3ZWJFeHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCB3ZWJFeHRlbnNpb24pO1xuXHRcdFx0XHRleHRlbnNpb25JbmZvcy5wdXNoKHsgaWQ6IHdlYkV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCB2ZXJzaW9uOiB3ZWJFeHRlbnNpb24udmVyc2lvbiB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBJZ25vcmluZyBhZGRpdGlvbmFsIGJ1aWx0aW4gZXh0ZW5zaW9uIGZyb20gZ2FsbGVyeSByZXNvdXJjZSAke2V4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZS50b1N0cmluZygpfSBiZWNhdXNlIHRoZXJlIGlzIGFuIGVycm9yIHdoaWxlIGNvbnZlcnRpbmcgaXQgaW50byB3ZWIgZXh0ZW5zaW9uYCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKGV4dGVuc2lvbkluZm9zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRmb3IgKGNvbnN0IGdhbGxlcnlFeHRlbnNpb24gb2YgZ2FsbGVyeUV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IHdlYkV4dGVuc2lvbiA9IHJlc3VsdC5nZXQoZ2FsbGVyeUV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0aWYgKHdlYkV4dGVuc2lvbikge1xuXHRcdFx0XHRyZXN1bHQuc2V0KGdhbGxlcnlFeHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCB7XG5cdFx0XHRcdFx0Li4ud2ViRXh0ZW5zaW9uLFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6IHsgaWQ6IHdlYkV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCB1dWlkOiBnYWxsZXJ5RXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCB9LFxuXHRcdFx0XHRcdHJlYWRtZVVyaTogZ2FsbGVyeUV4dGVuc2lvbi5hc3NldHMucmVhZG1lID8gVVJJLnBhcnNlKGdhbGxlcnlFeHRlbnNpb24uYXNzZXRzLnJlYWRtZS51cmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNoYW5nZWxvZ1VyaTogZ2FsbGVyeUV4dGVuc2lvbi5hc3NldHMuY2hhbmdlbG9nID8gVVJJLnBhcnNlKGdhbGxlcnlFeHRlbnNpb24uYXNzZXRzLmNoYW5nZWxvZy51cmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiB7IGlzUHJlUmVsZWFzZVZlcnNpb246IGdhbGxlcnlFeHRlbnNpb24ucHJvcGVydGllcy5pc1ByZVJlbGVhc2VWZXJzaW9uLCBwcmVSZWxlYXNlOiBnYWxsZXJ5RXh0ZW5zaW9uLnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbiwgaXNCdWlsdGluOiB0cnVlLCBwaW5uZWQ6IHRydWUgfVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFsuLi5yZXN1bHQudmFsdWVzKCldO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlQnVpbHRpbkdhbGxlcnlFeHRlbnNpb25zKGV4dGVuc2lvbnM6IElFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPElXZWJFeHRlbnNpb25bXT4ge1xuXHRcdGlmIChleHRlbnNpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCB3ZWJFeHRlbnNpb25zOiBJV2ViRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRjb25zdCBnYWxsZXJ5RXh0ZW5zaW9uc01hcCA9IGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9uc1dpdGhEZXBlbmRlbmNpZXNBbmRQYWNrZWRFeHRlbnNpb25zKGV4dGVuc2lvbnMpO1xuXHRcdGNvbnN0IG1pc3NpbmdFeHRlbnNpb25zID0gZXh0ZW5zaW9ucy5maWx0ZXIoKHsgaWQgfSkgPT4gIWdhbGxlcnlFeHRlbnNpb25zTWFwLmhhcyhpZC50b0xvd2VyQ2FzZSgpKSk7XG5cdFx0aWYgKG1pc3NpbmdFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1NraXBwaW5nIHRoZSBhZGRpdGlvbmFsIGJ1aWx0aW4gZXh0ZW5zaW9ucyBiZWNhdXNlIHRoZWlyIGNvbXBhdGlibGUgdmVyc2lvbnMgYXJlIG5vdCBmb3VuZC4nLCBtaXNzaW5nRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFsuLi5nYWxsZXJ5RXh0ZW5zaW9uc01hcC52YWx1ZXMoKV0ubWFwKGFzeW5jIGdhbGxlcnkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgd2ViRXh0ZW5zaW9uID0gYXdhaXQgdGhpcy50b1dlYkV4dGVuc2lvbkZyb21HYWxsZXJ5KGdhbGxlcnksIHsgaXNQcmVSZWxlYXNlVmVyc2lvbjogZ2FsbGVyeS5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24sIHByZVJlbGVhc2U6IGdhbGxlcnkucHJvcGVydGllcy5pc1ByZVJlbGVhc2VWZXJzaW9uLCBpc0J1aWx0aW46IHRydWUgfSk7XG5cdFx0XHRcdHdlYkV4dGVuc2lvbnMucHVzaCh3ZWJFeHRlbnNpb24pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYElnbm9yaW5nIGFkZGl0aW9uYWwgYnVpbHRpbiBleHRlbnNpb24gJHtnYWxsZXJ5LmlkZW50aWZpZXIuaWR9IGJlY2F1c2UgdGhlcmUgaXMgYW4gZXJyb3Igd2hpbGUgY29udmVydGluZyBpdCBpbnRvIHdlYiBleHRlbnNpb25gLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0cmV0dXJuIHdlYkV4dGVuc2lvbnM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVEZXBlbmRlbmNpZXNBbmRQYWNrZWRFeHRlbnNpb25zKHdlYkV4dGVuc2lvbnM6IElXZWJFeHRlbnNpb25bXSwgcmVzdWx0OiBNYXA8c3RyaW5nLCBJV2ViRXh0ZW5zaW9uPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbkluZm9zOiBJRXh0ZW5zaW9uSW5mb1tdID0gW107XG5cdFx0Zm9yIChjb25zdCB3ZWJFeHRlbnNpb24gb2Ygd2ViRXh0ZW5zaW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBlIG9mIFsuLi4od2ViRXh0ZW5zaW9uLm1hbmlmZXN0Py5leHRlbnNpb25EZXBlbmRlbmNpZXMgPz8gW10pLCAuLi4od2ViRXh0ZW5zaW9uLm1hbmlmZXN0Py5leHRlbnNpb25QYWNrID8/IFtdKV0pIHtcblx0XHRcdFx0aWYgKCFyZXN1bHQuaGFzKGUudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdFx0XHRleHRlbnNpb25JbmZvcy5wdXNoKHsgaWQ6IGUsIHZlcnNpb246IHdlYkV4dGVuc2lvbi52ZXJzaW9uIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb25JbmZvcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnNXaXRoRGVwZW5kZW5jaWVzQW5kUGFja2VkRXh0ZW5zaW9ucyhleHRlbnNpb25JbmZvcywgbmV3IFNldDxzdHJpbmc+KFsuLi5yZXN1bHQua2V5cygpXSkpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFsuLi5nYWxsZXJ5RXh0ZW5zaW9ucy52YWx1ZXMoKV0ubWFwKGFzeW5jIGdhbGxlcnkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgd2ViRXh0ZW5zaW9uID0gYXdhaXQgdGhpcy50b1dlYkV4dGVuc2lvbkZyb21HYWxsZXJ5KGdhbGxlcnksIHsgaXNQcmVSZWxlYXNlVmVyc2lvbjogZ2FsbGVyeS5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24sIHByZVJlbGVhc2U6IGdhbGxlcnkucHJvcGVydGllcy5pc1ByZVJlbGVhc2VWZXJzaW9uLCBpc0J1aWx0aW46IHRydWUgfSk7XG5cdFx0XHRcdHJlc3VsdC5zZXQod2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgd2ViRXh0ZW5zaW9uKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBJZ25vcmluZyBhZGRpdGlvbmFsIGJ1aWx0aW4gZXh0ZW5zaW9uICR7Z2FsbGVyeS5pZGVudGlmaWVyLmlkfSBiZWNhdXNlIHRoZXJlIGlzIGFuIGVycm9yIHdoaWxlIGNvbnZlcnRpbmcgaXQgaW50byB3ZWIgZXh0ZW5zaW9uYCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRFeHRlbnNpb25zV2l0aERlcGVuZGVuY2llc0FuZFBhY2tlZEV4dGVuc2lvbnModG9HZXQ6IElFeHRlbnNpb25JbmZvW10sIHNlZW46IFNldDxzdHJpbmc+ID0gbmV3IFNldDxzdHJpbmc+KCksIHJlc3VsdDogTWFwPHN0cmluZywgSUdhbGxlcnlFeHRlbnNpb24+ID0gbmV3IE1hcDxzdHJpbmcsIElHYWxsZXJ5RXh0ZW5zaW9uPigpKTogUHJvbWlzZTxNYXA8c3RyaW5nLCBJR2FsbGVyeUV4dGVuc2lvbj4+IHtcblx0XHRpZiAodG9HZXQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKHRvR2V0LCB7IGNvbXBhdGlibGU6IHRydWUsIHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybS5XRUIgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgcGFja3NBbmREZXBlbmRlbmNpZXMgPSBuZXcgTWFwPHN0cmluZywgSUV4dGVuc2lvbkluZm8+KCk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0cmVzdWx0LnNldChleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCBleHRlbnNpb24pO1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBbLi4uKGlzTm9uRW1wdHlBcnJheShleHRlbnNpb24ucHJvcGVydGllcy5kZXBlbmRlbmNpZXMpID8gZXh0ZW5zaW9uLnByb3BlcnRpZXMuZGVwZW5kZW5jaWVzIDogW10pLCAuLi4oaXNOb25FbXB0eUFycmF5KGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmV4dGVuc2lvblBhY2spID8gZXh0ZW5zaW9uLnByb3BlcnRpZXMuZXh0ZW5zaW9uUGFjayA6IFtdKV0pIHtcblx0XHRcdFx0aWYgKCFyZXN1bHQuaGFzKGlkLnRvTG93ZXJDYXNlKCkpICYmICFwYWNrc0FuZERlcGVuZGVuY2llcy5oYXMoaWQudG9Mb3dlckNhc2UoKSkgJiYgIXNlZW4uaGFzKGlkLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSW5mbyA9IHRvR2V0LmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLCBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0XHRcdHBhY2tzQW5kRGVwZW5kZW5jaWVzLnNldChpZC50b0xvd2VyQ2FzZSgpLCB7IGlkLCBwcmVSZWxlYXNlOiBleHRlbnNpb25JbmZvPy5wcmVSZWxlYXNlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldEV4dGVuc2lvbnNXaXRoRGVwZW5kZW5jaWVzQW5kUGFja2VkRXh0ZW5zaW9ucyhbLi4ucGFja3NBbmREZXBlbmRlbmNpZXMudmFsdWVzKCldLmZpbHRlcigoeyBpZCB9KSA9PiAhcmVzdWx0LmhhcyhpZC50b0xvd2VyQ2FzZSgpKSksIHNlZW4sIHJlc3VsdCk7XG5cdH1cblxuXHRhc3luYyBzY2FuU3lzdGVtRXh0ZW5zaW9ucygpOiBQcm9taXNlPElFeHRlbnNpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLnJlYWRTeXN0ZW1FeHRlbnNpb25zKCk7XG5cdH1cblxuXHRhc3luYyBzY2FuVXNlckV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uOiBVUkksIHNjYW5PcHRpb25zPzogU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBleHRlbnNpb25zID0gbmV3IE1hcDxzdHJpbmcsIElTY2FubmVkRXh0ZW5zaW9uPigpO1xuXG5cdFx0Ly8gQ3VzdG9tIGJ1aWx0aW4gZXh0ZW5zaW9ucyBkZWZpbmVkIHRocm91Z2ggYGFkZGl0aW9uYWxCdWlsdGluRXh0ZW5zaW9uc2AgQVBJXG5cdFx0Y29uc3QgY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnJlYWRDdXN0b21CdWlsdGluRXh0ZW5zaW9ucyhzY2FuT3B0aW9ucyk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnMpIHtcblx0XHRcdGV4dGVuc2lvbnMuc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCksIGV4dGVuc2lvbik7XG5cdFx0fVxuXG5cdFx0Ly8gVXNlciBJbnN0YWxsZWQgZXh0ZW5zaW9uc1xuXHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnNjYW5JbnN0YWxsZWRFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbiwgc2Nhbk9wdGlvbnMpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGluc3RhbGxlZEV4dGVuc2lvbnMpIHtcblx0XHRcdGV4dGVuc2lvbnMuc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCksIGV4dGVuc2lvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi5leHRlbnNpb25zLnZhbHVlcygpXTtcblx0fVxuXG5cdGFzeW5jIHNjYW5FeHRlbnNpb25zVW5kZXJEZXZlbG9wbWVudCgpOiBQcm9taXNlPElFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IGRldkV4dGVuc2lvbnMgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy5kZXZlbG9wbWVudE9wdGlvbnM/LmV4dGVuc2lvbnM7XG5cdFx0Y29uc3QgcmVzdWx0OiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShkZXZFeHRlbnNpb25zKSkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKGRldkV4dGVuc2lvbnMubWFwKGFzeW5jIGRldkV4dGVuc2lvbiA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgbG9jYXRpb24gPSBVUkkucmV2aXZlKGRldkV4dGVuc2lvbik7XG5cdFx0XHRcdFx0aWYgKFVSSS5pc1VyaShsb2NhdGlvbikpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHdlYkV4dGVuc2lvbiA9IGF3YWl0IHRoaXMudG9XZWJFeHRlbnNpb24obG9jYXRpb24pO1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goYXdhaXQgdGhpcy50b1NjYW5uZWRFeHRlbnNpb24od2ViRXh0ZW5zaW9uLCBmYWxzZSkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU2tpcHBpbmcgdGhlIGV4dGVuc2lvbiB1bmRlciBkZXZlbG9wbWVudCAke2RldkV4dGVuc2lvbn0gYXMgaXQgaXMgbm90IFVSSSB0eXBlLmApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgRXJyb3Igd2hpbGUgZmV0Y2hpbmcgdGhlIGV4dGVuc2lvbiB1bmRlciBkZXZlbG9wbWVudCAke2RldkV4dGVuc2lvbi50b1N0cmluZygpfS5gLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgc2NhbkV4aXN0aW5nRXh0ZW5zaW9uKGV4dGVuc2lvbkxvY2F0aW9uOiBVUkksIGV4dGVuc2lvblR5cGU6IEV4dGVuc2lvblR5cGUsIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbiB8IG51bGw+IHtcblx0XHRpZiAoZXh0ZW5zaW9uVHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0pIHtcblx0XHRcdGNvbnN0IHN5c3RlbUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnNjYW5TeXN0ZW1FeHRlbnNpb25zKCk7XG5cdFx0XHRyZXR1cm4gc3lzdGVtRXh0ZW5zaW9ucy5maW5kKGUgPT4gZS5sb2NhdGlvbi50b1N0cmluZygpID09PSBleHRlbnNpb25Mb2NhdGlvbi50b1N0cmluZygpKSB8fCBudWxsO1xuXHRcdH1cblx0XHRjb25zdCB1c2VyRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuc2NhblVzZXJFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbik7XG5cdFx0cmV0dXJuIHVzZXJFeHRlbnNpb25zLmZpbmQoZSA9PiBlLmxvY2F0aW9uLnRvU3RyaW5nKCkgPT09IGV4dGVuc2lvbkxvY2F0aW9uLnRvU3RyaW5nKCkpIHx8IG51bGw7XG5cdH1cblxuXHRhc3luYyBzY2FuRXh0ZW5zaW9uTWFuaWZlc3QoZXh0ZW5zaW9uTG9jYXRpb246IFVSSSk6IFByb21pc2U8SUV4dGVuc2lvbk1hbmlmZXN0IHwgbnVsbD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25NYW5pZmVzdChleHRlbnNpb25Mb2NhdGlvbik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBFcnJvciB3aGlsZSBmZXRjaGluZyBtYW5pZmVzdCBmcm9tICR7ZXh0ZW5zaW9uTG9jYXRpb24udG9TdHJpbmcoKX1gLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFkZEV4dGVuc2lvbkZyb21HYWxsZXJ5KGdhbGxlcnlFeHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBtZXRhZGF0YTogTWV0YWRhdGEsIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IHdlYkV4dGVuc2lvbiA9IGF3YWl0IHRoaXMudG9XZWJFeHRlbnNpb25Gcm9tR2FsbGVyeShnYWxsZXJ5RXh0ZW5zaW9uLCBtZXRhZGF0YSk7XG5cdFx0cmV0dXJuIHRoaXMuYWRkV2ViRXh0ZW5zaW9uKHdlYkV4dGVuc2lvbiwgcHJvZmlsZUxvY2F0aW9uKTtcblx0fVxuXG5cdGFzeW5jIGFkZEV4dGVuc2lvbihsb2NhdGlvbjogVVJJLCBtZXRhZGF0YTogTWV0YWRhdGEsIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IHdlYkV4dGVuc2lvbiA9IGF3YWl0IHRoaXMudG9XZWJFeHRlbnNpb24obG9jYXRpb24sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIG1ldGFkYXRhKTtcblx0XHRjb25zdCBleHRlbnNpb24gPSBhd2FpdCB0aGlzLnRvU2Nhbm5lZEV4dGVuc2lvbih3ZWJFeHRlbnNpb24sIGZhbHNlKTtcblx0XHRhd2FpdCB0aGlzLmFkZFRvSW5zdGFsbGVkRXh0ZW5zaW9ucyhbd2ViRXh0ZW5zaW9uXSwgcHJvZmlsZUxvY2F0aW9uKTtcblx0XHRyZXR1cm4gZXh0ZW5zaW9uO1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlRXh0ZW5zaW9uKGV4dGVuc2lvbjogSVNjYW5uZWRFeHRlbnNpb24sIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy53cml0ZUluc3RhbGxlZEV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uLCBpbnN0YWxsZWRFeHRlbnNpb25zID0+IGluc3RhbGxlZEV4dGVuc2lvbnMuZmlsdGVyKGluc3RhbGxlZEV4dGVuc2lvbiA9PiAhYXJlU2FtZUV4dGVuc2lvbnMoaW5zdGFsbGVkRXh0ZW5zaW9uLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlTWV0YWRhdGEoZXh0ZW5zaW9uOiBJU2Nhbm5lZEV4dGVuc2lvbiwgbWV0YWRhdGE6IFBhcnRpYWw8TWV0YWRhdGE+LCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb24+IHtcblx0XHRsZXQgdXBkYXRlZEV4dGVuc2lvbjogSVdlYkV4dGVuc2lvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB0aGlzLndyaXRlSW5zdGFsbGVkRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb24sIGluc3RhbGxlZEV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJV2ViRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9uIG9mIGluc3RhbGxlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0aWYgKGFyZVNhbWVFeHRlbnNpb25zKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBpbnN0YWxsZWRFeHRlbnNpb24uaWRlbnRpZmllcikpIHtcblx0XHRcdFx0XHRpbnN0YWxsZWRFeHRlbnNpb24ubWV0YWRhdGEgPSB7IC4uLmluc3RhbGxlZEV4dGVuc2lvbi5tZXRhZGF0YSwgLi4ubWV0YWRhdGEgfTtcblx0XHRcdFx0XHR1cGRhdGVkRXh0ZW5zaW9uID0gaW5zdGFsbGVkRXh0ZW5zaW9uO1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGluc3RhbGxlZEV4dGVuc2lvbik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goaW5zdGFsbGVkRXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblx0XHRpZiAoIXVwZGF0ZWRFeHRlbnNpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRXh0ZW5zaW9uIG5vdCBmb3VuZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy50b1NjYW5uZWRFeHRlbnNpb24odXBkYXRlZEV4dGVuc2lvbiwgZXh0ZW5zaW9uLmlzQnVpbHRpbik7XG5cdH1cblxuXHRhc3luYyBjb3B5RXh0ZW5zaW9ucyhmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkksIGZpbHRlcjogKGV4dGVuc2lvbjogSVNjYW5uZWRFeHRlbnNpb24pID0+IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25zVG9Db3B5OiBJV2ViRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRjb25zdCBmcm9tV2ViRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMucmVhZEluc3RhbGxlZEV4dGVuc2lvbnMoZnJvbVByb2ZpbGVMb2NhdGlvbik7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoZnJvbVdlYkV4dGVuc2lvbnMubWFwKGFzeW5jIHdlYkV4dGVuc2lvbiA9PiB7XG5cdFx0XHRjb25zdCBzY2FubmVkRXh0ZW5zaW9uID0gYXdhaXQgdGhpcy50b1NjYW5uZWRFeHRlbnNpb24od2ViRXh0ZW5zaW9uLCBmYWxzZSk7XG5cdFx0XHRpZiAoZmlsdGVyKHNjYW5uZWRFeHRlbnNpb24pKSB7XG5cdFx0XHRcdGV4dGVuc2lvbnNUb0NvcHkucHVzaCh3ZWJFeHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRpZiAoZXh0ZW5zaW9uc1RvQ29weS5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IHRoaXMuYWRkVG9JbnN0YWxsZWRFeHRlbnNpb25zKGV4dGVuc2lvbnNUb0NvcHksIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFkZFdlYkV4dGVuc2lvbih3ZWJFeHRlbnNpb246IElXZWJFeHRlbnNpb24sIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IGlzU3lzdGVtID0gISEoYXdhaXQgdGhpcy5zY2FuU3lzdGVtRXh0ZW5zaW9ucygpKS5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB3ZWJFeHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdGNvbnN0IGlzQnVpbHRpbiA9ICEhd2ViRXh0ZW5zaW9uLm1ldGFkYXRhPy5pc0J1aWx0aW47XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy50b1NjYW5uZWRFeHRlbnNpb24od2ViRXh0ZW5zaW9uLCBpc0J1aWx0aW4pO1xuXG5cdFx0aWYgKGlzU3lzdGVtKSB7XG5cdFx0XHRhd2FpdCB0aGlzLndyaXRlU3lzdGVtRXh0ZW5zaW9uc0NhY2hlKHN5c3RlbUV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0XHQvLyBSZW1vdmUgdGhlIGV4aXN0aW5nIGV4dGVuc2lvbiB0byBhdm9pZCBkdXBsaWNhdGVzXG5cdFx0XHRcdHN5c3RlbUV4dGVuc2lvbnMgPSBzeXN0ZW1FeHRlbnNpb25zLmZpbHRlcihleHRlbnNpb24gPT4gIWFyZVNhbWVFeHRlbnNpb25zKGV4dGVuc2lvbi5pZGVudGlmaWVyLCB3ZWJFeHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0XHRzeXN0ZW1FeHRlbnNpb25zLnB1c2god2ViRXh0ZW5zaW9uKTtcblx0XHRcdFx0cmV0dXJuIHN5c3RlbUV4dGVuc2lvbnM7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBleHRlbnNpb247XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGN1c3RvbSBidWlsdGluIGV4dGVuc2lvbnMgdG8gY3VzdG9tIGJ1aWx0aW4gZXh0ZW5zaW9ucyBjYWNoZVxuXHRcdGlmIChpc0J1aWx0aW4pIHtcblx0XHRcdGF3YWl0IHRoaXMud3JpdGVDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0NhY2hlKGN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zID0+IHtcblx0XHRcdFx0Ly8gUmVtb3ZlIHRoZSBleGlzdGluZyBleHRlbnNpb24gdG8gYXZvaWQgZHVwbGljYXRlc1xuXHRcdFx0XHRjdXN0b21CdWlsdGluRXh0ZW5zaW9ucyA9IGN1c3RvbUJ1aWx0aW5FeHRlbnNpb25zLmZpbHRlcihleHRlbnNpb24gPT4gIWFyZVNhbWVFeHRlbnNpb25zKGV4dGVuc2lvbi5pZGVudGlmaWVyLCB3ZWJFeHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0XHRjdXN0b21CdWlsdGluRXh0ZW5zaW9ucy5wdXNoKHdlYkV4dGVuc2lvbik7XG5cdFx0XHRcdHJldHVybiBjdXN0b21CdWlsdGluRXh0ZW5zaW9ucztcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5yZWFkSW5zdGFsbGVkRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0Ly8gQWxzbyBhZGQgdG8gaW5zdGFsbGVkIGV4dGVuc2lvbnMgaWYgaXQgaXMgaW5zdGFsbGVkIHRvIHVwZGF0ZSBpdHMgdmVyc2lvblxuXHRcdFx0aWYgKGluc3RhbGxlZEV4dGVuc2lvbnMuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgd2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIpKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmFkZFRvSW5zdGFsbGVkRXh0ZW5zaW9ucyhbd2ViRXh0ZW5zaW9uXSwgcHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBleHRlbnNpb247XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHRvIGluc3RhbGxlZCBleHRlbnNpb25zXG5cdFx0YXdhaXQgdGhpcy5hZGRUb0luc3RhbGxlZEV4dGVuc2lvbnMoW3dlYkV4dGVuc2lvbl0sIHByb2ZpbGVMb2NhdGlvbik7XG5cdFx0cmV0dXJuIGV4dGVuc2lvbjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYWRkVG9JbnN0YWxsZWRFeHRlbnNpb25zKHdlYkV4dGVuc2lvbnM6IElXZWJFeHRlbnNpb25bXSwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLndyaXRlSW5zdGFsbGVkRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb24sIGluc3RhbGxlZEV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0Ly8gUmVtb3ZlIHRoZSBleGlzdGluZyBleHRlbnNpb24gdG8gYXZvaWQgZHVwbGljYXRlc1xuXHRcdFx0aW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGluc3RhbGxlZEV4dGVuc2lvbnMuZmlsdGVyKGluc3RhbGxlZEV4dGVuc2lvbiA9PiB3ZWJFeHRlbnNpb25zLnNvbWUoZXh0ZW5zaW9uID0+ICFhcmVTYW1lRXh0ZW5zaW9ucyhpbnN0YWxsZWRFeHRlbnNpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKSk7XG5cdFx0XHRpbnN0YWxsZWRFeHRlbnNpb25zLnB1c2goLi4ud2ViRXh0ZW5zaW9ucyk7XG5cdFx0XHRyZXR1cm4gaW5zdGFsbGVkRXh0ZW5zaW9ucztcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2Nhbkluc3RhbGxlZEV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uOiBVUkksIHNjYW5PcHRpb25zPzogU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRsZXQgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMucmVhZEluc3RhbGxlZEV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uKTtcblxuXHRcdC8vIElmIGN1cnJlbnQgcHJvZmlsZSBpcyBub3QgYSBkZWZhdWx0IHByb2ZpbGUsIHRoZW4gYWRkIHRoZSBhcHBsaWNhdGlvbiBleHRlbnNpb25zIHRvIHRoZSBsaXN0XG5cdFx0aWYgKCF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChwcm9maWxlTG9jYXRpb24sIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKSkge1xuXHRcdFx0Ly8gUmVtb3ZlIGFwcGxpY2F0aW9uIGV4dGVuc2lvbnMgZnJvbSB0aGUgbm9uIGRlZmF1bHQgcHJvZmlsZVxuXHRcdFx0aW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGluc3RhbGxlZEV4dGVuc2lvbnMuZmlsdGVyKGkgPT4gIWkubWV0YWRhdGE/LmlzQXBwbGljYXRpb25TY29wZWQpO1xuXHRcdFx0Ly8gQWRkIGFwcGxpY2F0aW9uIGV4dGVuc2lvbnMgZnJvbSB0aGUgZGVmYXVsdCBwcm9maWxlIHRvIHRoZSBsaXN0XG5cdFx0XHRjb25zdCBkZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnJlYWRJbnN0YWxsZWRFeHRlbnNpb25zKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKTtcblx0XHRcdGluc3RhbGxlZEV4dGVuc2lvbnMucHVzaCguLi5kZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnMuZmlsdGVyKGkgPT4gaS5tZXRhZGF0YT8uaXNBcHBsaWNhdGlvblNjb3BlZCkpO1xuXHRcdH1cblxuXHRcdGluc3RhbGxlZEV4dGVuc2lvbnMuc29ydCgoYSwgYikgPT4gYS5pZGVudGlmaWVyLmlkIDwgYi5pZGVudGlmaWVyLmlkID8gLTEgOiBhLmlkZW50aWZpZXIuaWQgPiBiLmlkZW50aWZpZXIuaWQgPyAxIDogc2VtdmVyLnJjb21wYXJlKGEudmVyc2lvbiwgYi52ZXJzaW9uKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIElTY2FubmVkRXh0ZW5zaW9uPigpO1xuXHRcdGZvciAoY29uc3Qgd2ViRXh0ZW5zaW9uIG9mIGluc3RhbGxlZEV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gcmVzdWx0LmdldCh3ZWJFeHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdGlmIChleGlzdGluZyAmJiBzZW12ZXIuZ3QoZXhpc3RpbmcubWFuaWZlc3QudmVyc2lvbiwgd2ViRXh0ZW5zaW9uLnZlcnNpb24pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy50b1NjYW5uZWRFeHRlbnNpb24od2ViRXh0ZW5zaW9uLCBmYWxzZSk7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmlzVmFsaWQgfHwgIXNjYW5PcHRpb25zPy5za2lwSW52YWxpZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0cmVzdWx0LnNldChleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLCBleHRlbnNpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFNraXBwaW5nIGludmFsaWQgaW5zdGFsbGVkIGV4dGVuc2lvbiAke3dlYkV4dGVuc2lvbi5pZGVudGlmaWVyLmlkfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gWy4uLnJlc3VsdC52YWx1ZXMoKV07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRvV2ViRXh0ZW5zaW9uRnJvbUdhbGxlcnkoZ2FsbGVyeUV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIG1ldGFkYXRhPzogTWV0YWRhdGEpOiBQcm9taXNlPElXZWJFeHRlbnNpb24+IHtcblx0XHRjb25zdCBleHRlbnNpb25Mb2NhdGlvbiA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLmdldEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVVSTCh7XG5cdFx0XHRwdWJsaXNoZXI6IGdhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyLFxuXHRcdFx0bmFtZTogZ2FsbGVyeUV4dGVuc2lvbi5uYW1lLFxuXHRcdFx0dmVyc2lvbjogZ2FsbGVyeUV4dGVuc2lvbi52ZXJzaW9uLFxuXHRcdFx0dGFyZ2V0UGxhdGZvcm06IGdhbGxlcnlFeHRlbnNpb24ucHJvcGVydGllcy50YXJnZXRQbGF0Zm9ybSA9PT0gVGFyZ2V0UGxhdGZvcm0uV0VCID8gVGFyZ2V0UGxhdGZvcm0uV0VCIDogdW5kZWZpbmVkXG5cdFx0fSwgJ2V4dGVuc2lvbicpO1xuXG5cdFx0aWYgKCFleHRlbnNpb25Mb2NhdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBleHRlbnNpb24gZ2FsbGVyeSBzZXJ2aWNlIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudG9XZWJFeHRlbnNpb25Gcm9tRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlKGV4dGVuc2lvbkxvY2F0aW9uLFxuXHRcdFx0Z2FsbGVyeUV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0Z2FsbGVyeUV4dGVuc2lvbi5hc3NldHMucmVhZG1lID8gVVJJLnBhcnNlKGdhbGxlcnlFeHRlbnNpb24uYXNzZXRzLnJlYWRtZS51cmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0Z2FsbGVyeUV4dGVuc2lvbi5hc3NldHMuY2hhbmdlbG9nID8gVVJJLnBhcnNlKGdhbGxlcnlFeHRlbnNpb24uYXNzZXRzLmNoYW5nZWxvZy51cmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0bWV0YWRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0b1dlYkV4dGVuc2lvbkZyb21FeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2UoZXh0ZW5zaW9uTG9jYXRpb246IFVSSSwgaWRlbnRpZmllcj86IElFeHRlbnNpb25JZGVudGlmaWVyLCByZWFkbWVVcmk/OiBVUkksIGNoYW5nZWxvZ1VyaT86IFVSSSwgbWV0YWRhdGE/OiBNZXRhZGF0YSk6IFByb21pc2U8SVdlYkV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvblJlc291cmNlcyA9IGF3YWl0IHRoaXMubGlzdEV4dGVuc2lvblJlc291cmNlcyhleHRlbnNpb25Mb2NhdGlvbik7XG5cdFx0Y29uc3QgcGFja2FnZU5MU1Jlc291cmNlcyA9IHRoaXMuZ2V0UGFja2FnZU5MU1Jlc291cmNlTWFwRnJvbVJlc291cmNlcyhleHRlbnNpb25SZXNvdXJjZXMpO1xuXG5cdFx0Ly8gVGhlIGZhbGxiYWNrLCBpbiBFbmdsaXNoLCB3aWxsIGZpbGwgaW4gYW55IGdhcHMgbWlzc2luZyBpbiB0aGUgbG9jYWxpemVkIGZpbGUuXG5cdFx0Y29uc3QgZmFsbGJhY2tQYWNrYWdlTkxTUmVzb3VyY2UgPSBleHRlbnNpb25SZXNvdXJjZXMuZmluZChlID0+IGJhc2VuYW1lKGUpID09PSAncGFja2FnZS5ubHMuanNvbicpO1xuXHRcdHJldHVybiB0aGlzLnRvV2ViRXh0ZW5zaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uTG9jYXRpb24sXG5cdFx0XHRpZGVudGlmaWVyLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0cGFja2FnZU5MU1Jlc291cmNlcyxcblx0XHRcdGZhbGxiYWNrUGFja2FnZU5MU1Jlc291cmNlID8gVVJJLnBhcnNlKGZhbGxiYWNrUGFja2FnZU5MU1Jlc291cmNlKSA6IG51bGwsXG5cdFx0XHRyZWFkbWVVcmksXG5cdFx0XHRjaGFuZ2Vsb2dVcmksXG5cdFx0XHRtZXRhZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFBhY2thZ2VOTFNSZXNvdXJjZU1hcEZyb21SZXNvdXJjZXMoZXh0ZW5zaW9uUmVzb3VyY2VzOiBzdHJpbmdbXSk6IE1hcDxzdHJpbmcsIFVSST4ge1xuXHRcdGNvbnN0IHBhY2thZ2VOTFNSZXNvdXJjZXMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHRcdGV4dGVuc2lvblJlc291cmNlcy5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0Ly8gR3JhYiBhbGwgcGFja2FnZS5ubHMue2xhbmd1YWdlfS5qc29uIGZpbGVzXG5cdFx0XHRjb25zdCByZWdleFJlc3VsdCA9IC9wYWNrYWdlXFwubmxzXFwuKFtcXHctXSspXFwuanNvbi8uZXhlYyhiYXNlbmFtZShlKSk7XG5cdFx0XHRpZiAocmVnZXhSZXN1bHQ/LlsxXSkge1xuXHRcdFx0XHRwYWNrYWdlTkxTUmVzb3VyY2VzLnNldChyZWdleFJlc3VsdFsxXSwgVVJJLnBhcnNlKGUpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gcGFja2FnZU5MU1Jlc291cmNlcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdG9XZWJFeHRlbnNpb24oZXh0ZW5zaW9uTG9jYXRpb246IFVSSSwgaWRlbnRpZmllcj86IElFeHRlbnNpb25JZGVudGlmaWVyLCBtYW5pZmVzdD86IElFeHRlbnNpb25NYW5pZmVzdCwgcGFja2FnZU5MU1VyaXM/OiBNYXA8c3RyaW5nLCBVUkk+LCBmYWxsYmFja1BhY2thZ2VOTFNVcmk/OiBVUkkgfCBJVHJhbnNsYXRpb25zIHwgbnVsbCwgcmVhZG1lVXJpPzogVVJJLCBjaGFuZ2Vsb2dVcmk/OiBVUkksIG1ldGFkYXRhPzogTWV0YWRhdGEpOiBQcm9taXNlPElXZWJFeHRlbnNpb24+IHtcblx0XHRpZiAoIW1hbmlmZXN0KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRtYW5pZmVzdCA9IGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9uTWFuaWZlc3QoZXh0ZW5zaW9uTG9jYXRpb24pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFcnJvciB3aGlsZSBmZXRjaGluZyBtYW5pZmVzdCBmcm9tIHRoZSBsb2NhdGlvbiAnJHtleHRlbnNpb25Mb2NhdGlvbi50b1N0cmluZygpfScuICR7Z2V0RXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5jYW5FeGVjdXRlT25XZWIobWFuaWZlc3QpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vdCBhIHdlYiBleHRlbnNpb24nLCBcIkNhbm5vdCBhZGQgJ3swfScgYmVjYXVzZSB0aGlzIGV4dGVuc2lvbiBpcyBub3QgYSB3ZWIgZXh0ZW5zaW9uLlwiLCBtYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBtYW5pZmVzdC5uYW1lKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGZhbGxiYWNrUGFja2FnZU5MU1VyaSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRmYWxsYmFja1BhY2thZ2VOTFNVcmkgPSBqb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgJ3BhY2thZ2UubmxzLmpzb24nKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UucmVhZEV4dGVuc2lvblJlc291cmNlKGZhbGxiYWNrUGFja2FnZU5MU1VyaSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRmYWxsYmFja1BhY2thZ2VOTFNVcmkgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGRlZmF1bHRNYW5pZmVzdFRyYW5zbGF0aW9uczogSVRyYW5zbGF0aW9ucyB8IG51bGwgfCB1bmRlZmluZWQgPSBmYWxsYmFja1BhY2thZ2VOTFNVcmkgPyBVUkkuaXNVcmkoZmFsbGJhY2tQYWNrYWdlTkxTVXJpKSA/IGF3YWl0IHRoaXMuZ2V0VHJhbnNsYXRpb25zKGZhbGxiYWNrUGFja2FnZU5MU1VyaSkgOiBmYWxsYmFja1BhY2thZ2VOTFNVcmkgOiBudWxsO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkZW50aWZpZXI6IHsgaWQ6IGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpLCB1dWlkOiBpZGVudGlmaWVyPy51dWlkIH0sXG5cdFx0XHR2ZXJzaW9uOiBtYW5pZmVzdC52ZXJzaW9uLFxuXHRcdFx0bG9jYXRpb246IGV4dGVuc2lvbkxvY2F0aW9uLFxuXHRcdFx0bWFuaWZlc3QsXG5cdFx0XHRyZWFkbWVVcmksXG5cdFx0XHRjaGFuZ2Vsb2dVcmksXG5cdFx0XHRwYWNrYWdlTkxTVXJpcyxcblx0XHRcdGZhbGxiYWNrUGFja2FnZU5MU1VyaTogVVJJLmlzVXJpKGZhbGxiYWNrUGFja2FnZU5MU1VyaSkgPyBmYWxsYmFja1BhY2thZ2VOTFNVcmkgOiB1bmRlZmluZWQsXG5cdFx0XHRkZWZhdWx0TWFuaWZlc3RUcmFuc2xhdGlvbnMsXG5cdFx0XHRtZXRhZGF0YSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0b1NjYW5uZWRFeHRlbnNpb24od2ViRXh0ZW5zaW9uOiBJV2ViRXh0ZW5zaW9uLCBpc0J1aWx0aW46IGJvb2xlYW4sIHR5cGU6IEV4dGVuc2lvblR5cGUgPSBFeHRlbnNpb25UeXBlLlVzZXIpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uPiB7XG5cdFx0Y29uc3QgdmFsaWRhdGlvbnM6IFtTZXZlcml0eSwgc3RyaW5nXVtdID0gW107XG5cdFx0bGV0IG1hbmlmZXN0OiBJUmVsYXhlZEV4dGVuc2lvbk1hbmlmZXN0IHwgdW5kZWZpbmVkID0gd2ViRXh0ZW5zaW9uLm1hbmlmZXN0O1xuXG5cdFx0aWYgKCFtYW5pZmVzdCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bWFuaWZlc3QgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbk1hbmlmZXN0KHdlYkV4dGVuc2lvbi5sb2NhdGlvbik7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR2YWxpZGF0aW9ucy5wdXNoKFtTZXZlcml0eS5FcnJvciwgYEVycm9yIHdoaWxlIGZldGNoaW5nIG1hbmlmZXN0IGZyb20gdGhlIGxvY2F0aW9uICcke3dlYkV4dGVuc2lvbi5sb2NhdGlvbn0nLiAke2dldEVycm9yTWVzc2FnZShlcnJvcil9YF0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdGNvbnN0IFtwdWJsaXNoZXIsIG5hbWVdID0gd2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQuc3BsaXQoJy4nKTtcblx0XHRcdG1hbmlmZXN0ID0ge1xuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRwdWJsaXNoZXIsXG5cdFx0XHRcdHZlcnNpb246IHdlYkV4dGVuc2lvbi52ZXJzaW9uLFxuXHRcdFx0XHRlbmdpbmVzOiB7IHZzY29kZTogJyonIH0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhY2thZ2VOTFNVcmkgPSB3ZWJFeHRlbnNpb24ucGFja2FnZU5MU1VyaXM/LmdldChMYW5ndWFnZS52YWx1ZSgpLnRvTG93ZXJDYXNlKCkpO1xuXHRcdGNvbnN0IGZhbGxiYWNrUGFja2FnZU5MUyA9IHdlYkV4dGVuc2lvbi5kZWZhdWx0TWFuaWZlc3RUcmFuc2xhdGlvbnMgPz8gd2ViRXh0ZW5zaW9uLmZhbGxiYWNrUGFja2FnZU5MU1VyaTtcblxuXHRcdGlmIChwYWNrYWdlTkxTVXJpKSB7XG5cdFx0XHRtYW5pZmVzdCA9IGF3YWl0IHRoaXMudHJhbnNsYXRlTWFuaWZlc3QobWFuaWZlc3QsIHBhY2thZ2VOTFNVcmksIGZhbGxiYWNrUGFja2FnZU5MUyk7XG5cdFx0fSBlbHNlIGlmIChmYWxsYmFja1BhY2thZ2VOTFMpIHtcblx0XHRcdG1hbmlmZXN0ID0gYXdhaXQgdGhpcy50cmFuc2xhdGVNYW5pZmVzdChtYW5pZmVzdCwgZmFsbGJhY2tQYWNrYWdlTkxTKTtcblx0XHR9XG5cblx0XHRjb25zdCB1dWlkID0gKDxJR2FsbGVyeU1ldGFkYXRhIHwgdW5kZWZpbmVkPndlYkV4dGVuc2lvbi5tZXRhZGF0YSk/LmlkO1xuXG5cdFx0dmFsaWRhdGlvbnMucHVzaCguLi52YWxpZGF0ZUV4dGVuc2lvbk1hbmlmZXN0KHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlLCB3ZWJFeHRlbnNpb24ubG9jYXRpb24sIG1hbmlmZXN0LCBmYWxzZSkpO1xuXHRcdGxldCBpc1ZhbGlkID0gdHJ1ZTtcblx0XHRmb3IgKGNvbnN0IFtzZXZlcml0eSwgbWVzc2FnZV0gb2YgdmFsaWRhdGlvbnMpIHtcblx0XHRcdGlmIChzZXZlcml0eSA9PT0gU2V2ZXJpdHkuRXJyb3IpIHtcblx0XHRcdFx0aXNWYWxpZCA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IobWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG1hbmlmZXN0LmVuYWJsZWRBcGlQcm9wb3NhbHMpIHtcblx0XHRcdG1hbmlmZXN0LmVuYWJsZWRBcGlQcm9wb3NhbHMgPSBwYXJzZUVuYWJsZWRBcGlQcm9wb3NhbE5hbWVzKFsuLi5tYW5pZmVzdC5lbmFibGVkQXBpUHJvcG9zYWxzXSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkZW50aWZpZXI6IHsgaWQ6IHdlYkV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCB1dWlkOiB3ZWJFeHRlbnNpb24uaWRlbnRpZmllci51dWlkIHx8IHV1aWQgfSxcblx0XHRcdGxvY2F0aW9uOiB3ZWJFeHRlbnNpb24ubG9jYXRpb24sXG5cdFx0XHRtYW5pZmVzdCxcblx0XHRcdHR5cGUsXG5cdFx0XHRpc0J1aWx0aW4sXG5cdFx0XHRyZWFkbWVVcmw6IHdlYkV4dGVuc2lvbi5yZWFkbWVVcmksXG5cdFx0XHRjaGFuZ2Vsb2dVcmw6IHdlYkV4dGVuc2lvbi5jaGFuZ2Vsb2dVcmksXG5cdFx0XHRtZXRhZGF0YTogd2ViRXh0ZW5zaW9uLm1ldGFkYXRhLFxuXHRcdFx0dGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtLldFQixcblx0XHRcdHZhbGlkYXRpb25zLFxuXHRcdFx0aXNWYWxpZCxcblx0XHRcdHByZVJlbGVhc2U6ICEhd2ViRXh0ZW5zaW9uLm1ldGFkYXRhPy5wcmVSZWxlYXNlLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxpc3RFeHRlbnNpb25SZXNvdXJjZXMoZXh0ZW5zaW9uTG9jYXRpb246IFVSSSk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UucmVhZEV4dGVuc2lvblJlc291cmNlKGV4dGVuc2lvbkxvY2F0aW9uKTtcblx0XHRcdHJldHVybiBKU09OLnBhcnNlKHJlc3VsdCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdFcnJvciB3aGlsZSBmZXRjaGluZyBleHRlbnNpb24gcmVzb3VyY2VzIGxpc3QnLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0cmFuc2xhdGVNYW5pZmVzdChtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LCBubHNVUkw6IElUcmFuc2xhdGlvbnMgfCBVUkksIGZhbGxiYWNrTkxTPzogSVRyYW5zbGF0aW9ucyB8IFVSSSk6IFByb21pc2U8SVJlbGF4ZWRFeHRlbnNpb25NYW5pZmVzdD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0cmFuc2xhdGlvbnMgPSBVUkkuaXNVcmkobmxzVVJMKSA/IGF3YWl0IHRoaXMuZ2V0VHJhbnNsYXRpb25zKG5sc1VSTCkgOiBubHNVUkw7XG5cdFx0XHRjb25zdCBmYWxsYmFja1RyYW5zbGF0aW9ucyA9IFVSSS5pc1VyaShmYWxsYmFja05MUykgPyBhd2FpdCB0aGlzLmdldFRyYW5zbGF0aW9ucyhmYWxsYmFja05MUykgOiBmYWxsYmFja05MUztcblx0XHRcdGlmICh0cmFuc2xhdGlvbnMpIHtcblx0XHRcdFx0bWFuaWZlc3QgPSBsb2NhbGl6ZU1hbmlmZXN0KHRoaXMubG9nU2VydmljZSwgbWFuaWZlc3QsIHRyYW5zbGF0aW9ucywgZmFsbGJhY2tUcmFuc2xhdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0cmV0dXJuIG1hbmlmZXN0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRFeHRlbnNpb25NYW5pZmVzdChsb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuaWZlc3Q+IHtcblx0XHRjb25zdCB1cmwgPSBqb2luUGF0aChsb2NhdGlvbiwgJ3BhY2thZ2UuanNvbicpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5yZWFkRXh0ZW5zaW9uUmVzb3VyY2UodXJsKTtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZShjb250ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VHJhbnNsYXRpb25zKG5sc1VybDogVVJJKTogUHJvbWlzZTxJVHJhbnNsYXRpb25zIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5yZWFkRXh0ZW5zaW9uUmVzb3VyY2UobmxzVXJsKTtcblx0XHRcdHJldHVybiBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHdoaWxlIGZldGNoaW5nIHRyYW5zbGF0aW9ucyBvZiBhbiBleHRlbnNpb25gLCBubHNVcmwudG9TdHJpbmcoKSwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlYWRJbnN0YWxsZWRFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJV2ViRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy53aXRoV2ViRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSB3cml0ZUluc3RhbGxlZEV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uOiBVUkksIHVwZGF0ZUZuOiAoZXh0ZW5zaW9uczogSVdlYkV4dGVuc2lvbltdKSA9PiBJV2ViRXh0ZW5zaW9uW10pOiBQcm9taXNlPElXZWJFeHRlbnNpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLndpdGhXZWJFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbiwgdXBkYXRlRm4pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkQ3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZSgpOiBQcm9taXNlPElXZWJFeHRlbnNpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLndpdGhXZWJFeHRlbnNpb25zKHRoaXMuY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZVJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgd3JpdGVDdXN0b21CdWlsdGluRXh0ZW5zaW9uc0NhY2hlKHVwZGF0ZUZuOiAoZXh0ZW5zaW9uczogSVdlYkV4dGVuc2lvbltdKSA9PiBJV2ViRXh0ZW5zaW9uW10pOiBQcm9taXNlPElXZWJFeHRlbnNpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLndpdGhXZWJFeHRlbnNpb25zKHRoaXMuY3VzdG9tQnVpbHRpbkV4dGVuc2lvbnNDYWNoZVJlc291cmNlLCB1cGRhdGVGbik7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRTeXN0ZW1FeHRlbnNpb25zQ2FjaGUoKTogUHJvbWlzZTxJV2ViRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy53aXRoV2ViRXh0ZW5zaW9ucyh0aGlzLnN5c3RlbUV4dGVuc2lvbnNDYWNoZVJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgd3JpdGVTeXN0ZW1FeHRlbnNpb25zQ2FjaGUodXBkYXRlRm46IChleHRlbnNpb25zOiBJV2ViRXh0ZW5zaW9uW10pID0+IElXZWJFeHRlbnNpb25bXSk6IFByb21pc2U8SVdlYkV4dGVuc2lvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMud2l0aFdlYkV4dGVuc2lvbnModGhpcy5zeXN0ZW1FeHRlbnNpb25zQ2FjaGVSZXNvdXJjZSwgdXBkYXRlRm4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3aXRoV2ViRXh0ZW5zaW9ucyhmaWxlOiBVUkkgfCB1bmRlZmluZWQsIHVwZGF0ZUZuPzogKGV4dGVuc2lvbnM6IElXZWJFeHRlbnNpb25bXSkgPT4gSVdlYkV4dGVuc2lvbltdKTogUHJvbWlzZTxJV2ViRXh0ZW5zaW9uW10+IHtcblx0XHRpZiAoIWZpbGUpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UmVzb3VyY2VBY2Nlc3NRdWV1ZShmaWxlKS5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgd2ViRXh0ZW5zaW9uczogSVdlYkV4dGVuc2lvbltdID0gW107XG5cblx0XHRcdC8vIFJlYWRcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGZpbGUpO1xuXHRcdFx0XHRjb25zdCBzdG9yZWRXZWJFeHRlbnNpb25zOiBJU3RvcmVkV2ViRXh0ZW5zaW9uW10gPSBKU09OLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgZSBvZiBzdG9yZWRXZWJFeHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0aWYgKCFlLmxvY2F0aW9uIHx8ICFlLmlkZW50aWZpZXIgfHwgIWUudmVyc2lvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0lnbm9yaW5nIGludmFsaWQgZXh0ZW5zaW9uIHdoaWxlIHNjYW5uaW5nJywgc3RvcmVkV2ViRXh0ZW5zaW9ucyk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGV0IHBhY2thZ2VOTFNVcmlzOiBNYXA8c3RyaW5nLCBVUkk+IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChlLnBhY2thZ2VOTFNVcmlzKSB7XG5cdFx0XHRcdFx0XHRwYWNrYWdlTkxTVXJpcyA9IG5ldyBNYXA8c3RyaW5nLCBVUkk+KCk7XG5cdFx0XHRcdFx0XHRPYmplY3QuZW50cmllcyhlLnBhY2thZ2VOTFNVcmlzKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHBhY2thZ2VOTFNVcmlzIS5zZXQoa2V5LCBVUkkucmV2aXZlKHZhbHVlKSkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHdlYkV4dGVuc2lvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRpZGVudGlmaWVyOiBlLmlkZW50aWZpZXIsXG5cdFx0XHRcdFx0XHR2ZXJzaW9uOiBlLnZlcnNpb24sXG5cdFx0XHRcdFx0XHRsb2NhdGlvbjogVVJJLnJldml2ZShlLmxvY2F0aW9uKSxcblx0XHRcdFx0XHRcdG1hbmlmZXN0OiBlLm1hbmlmZXN0LFxuXHRcdFx0XHRcdFx0cmVhZG1lVXJpOiBVUkkucmV2aXZlKGUucmVhZG1lVXJpKSxcblx0XHRcdFx0XHRcdGNoYW5nZWxvZ1VyaTogVVJJLnJldml2ZShlLmNoYW5nZWxvZ1VyaSksXG5cdFx0XHRcdFx0XHRwYWNrYWdlTkxTVXJpcyxcblx0XHRcdFx0XHRcdGZhbGxiYWNrUGFja2FnZU5MU1VyaTogVVJJLnJldml2ZShlLmZhbGxiYWNrUGFja2FnZU5MU1VyaSksXG5cdFx0XHRcdFx0XHRkZWZhdWx0TWFuaWZlc3RUcmFuc2xhdGlvbnM6IGUuZGVmYXVsdE1hbmlmZXN0VHJhbnNsYXRpb25zLFxuXHRcdFx0XHRcdFx0cGFja2FnZU5MU1VyaTogVVJJLnJldml2ZShlLnBhY2thZ2VOTFNVcmkpLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IGUubWV0YWRhdGEsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHdlYkV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLm1pZ3JhdGVXZWJFeHRlbnNpb25zKHdlYkV4dGVuc2lvbnMsIGZpbGUpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRXJyb3Igd2hpbGUgbWlncmF0aW5nIHNjYW5uZWQgZXh0ZW5zaW9ucyBpbiAke2ZpbGUudG9TdHJpbmcoKX1gLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvKiBJZ25vcmUgKi9cblx0XHRcdFx0aWYgKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBVcGRhdGVcblx0XHRcdGlmICh1cGRhdGVGbikge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnN0b3JlV2ViRXh0ZW5zaW9ucyh3ZWJFeHRlbnNpb25zID0gdXBkYXRlRm4od2ViRXh0ZW5zaW9ucyksIGZpbGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gd2ViRXh0ZW5zaW9ucztcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbWlncmF0ZVdlYkV4dGVuc2lvbnMod2ViRXh0ZW5zaW9uczogSVdlYkV4dGVuc2lvbltdLCBmaWxlOiBVUkkpOiBQcm9taXNlPElXZWJFeHRlbnNpb25bXT4ge1xuXHRcdGxldCB1cGRhdGUgPSBmYWxzZTtcblx0XHR3ZWJFeHRlbnNpb25zID0gYXdhaXQgUHJvbWlzZS5hbGwod2ViRXh0ZW5zaW9ucy5tYXAoYXN5bmMgd2ViRXh0ZW5zaW9uID0+IHtcblx0XHRcdGlmICghd2ViRXh0ZW5zaW9uLm1hbmlmZXN0KSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0d2ViRXh0ZW5zaW9uLm1hbmlmZXN0ID0gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25NYW5pZmVzdCh3ZWJFeHRlbnNpb24ubG9jYXRpb24pO1xuXHRcdFx0XHRcdHVwZGF0ZSA9IHRydWU7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciB3aGlsZSB1cGRhdGluZyBtYW5pZmVzdCBvZiBhbiBleHRlbnNpb24gaW4gJHtmaWxlLnRvU3RyaW5nKCl9YCwgd2ViRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNVbmRlZmluZWQod2ViRXh0ZW5zaW9uLmRlZmF1bHRNYW5pZmVzdFRyYW5zbGF0aW9ucykpIHtcblx0XHRcdFx0aWYgKHdlYkV4dGVuc2lvbi5mYWxsYmFja1BhY2thZ2VOTFNVcmkpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLnJlYWRFeHRlbnNpb25SZXNvdXJjZSh3ZWJFeHRlbnNpb24uZmFsbGJhY2tQYWNrYWdlTkxTVXJpKTtcblx0XHRcdFx0XHRcdHdlYkV4dGVuc2lvbi5kZWZhdWx0TWFuaWZlc3RUcmFuc2xhdGlvbnMgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdFx0XHRcdFx0dXBkYXRlID0gdHJ1ZTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciB3aGlsZSBmZXRjaGluZyBkZWZhdWx0IG1hbmlmZXN0IHRyYW5zbGF0aW9ucyBvZiBhbiBleHRlbnNpb25gLCB3ZWJFeHRlbnNpb24uaWRlbnRpZmllci5pZCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHVwZGF0ZSA9IHRydWU7XG5cdFx0XHRcdFx0d2ViRXh0ZW5zaW9uLmRlZmF1bHRNYW5pZmVzdFRyYW5zbGF0aW9ucyA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IG1pZ3JhdGVkTG9jYXRpb24gPSBtaWdyYXRlUGxhdGZvcm1TcGVjaWZpY0V4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVVSTCh3ZWJFeHRlbnNpb24ubG9jYXRpb24sIFRhcmdldFBsYXRmb3JtLldFQik7XG5cdFx0XHRpZiAobWlncmF0ZWRMb2NhdGlvbikge1xuXHRcdFx0XHR1cGRhdGUgPSB0cnVlO1xuXHRcdFx0XHR3ZWJFeHRlbnNpb24ubG9jYXRpb24gPSBtaWdyYXRlZExvY2F0aW9uO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzVW5kZWZpbmVkKHdlYkV4dGVuc2lvbi5tZXRhZGF0YT8uaGFzUHJlUmVsZWFzZVZlcnNpb24pICYmIHdlYkV4dGVuc2lvbi5tZXRhZGF0YT8ucHJlUmVsZWFzZSkge1xuXHRcdFx0XHR1cGRhdGUgPSB0cnVlO1xuXHRcdFx0XHR3ZWJFeHRlbnNpb24ubWV0YWRhdGEuaGFzUHJlUmVsZWFzZVZlcnNpb24gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHdlYkV4dGVuc2lvbjtcblx0XHR9KSk7XG5cdFx0aWYgKHVwZGF0ZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5zdG9yZVdlYkV4dGVuc2lvbnMod2ViRXh0ZW5zaW9ucywgZmlsZSk7XG5cdFx0fVxuXHRcdHJldHVybiB3ZWJFeHRlbnNpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzdG9yZVdlYkV4dGVuc2lvbnMod2ViRXh0ZW5zaW9uczogSVdlYkV4dGVuc2lvbltdLCBmaWxlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmdW5jdGlvbiB0b1N0cmluZ0RpY3Rpb25hcnkoZGljdGlvbmFyeTogTWFwPHN0cmluZywgVVJJPiB8IHVuZGVmaW5lZCk6IElTdHJpbmdEaWN0aW9uYXJ5PFVyaUNvbXBvbmVudHM+IHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmICghZGljdGlvbmFyeSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0OiBJU3RyaW5nRGljdGlvbmFyeTxVcmlDb21wb25lbnRzPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0XHRkaWN0aW9uYXJ5LmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHJlc3VsdFtrZXldID0gdmFsdWUudG9KU09OKCkpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Y29uc3Qgc3RvcmVkV2ViRXh0ZW5zaW9uczogSVN0b3JlZFdlYkV4dGVuc2lvbltdID0gd2ViRXh0ZW5zaW9ucy5tYXAoZSA9PiAoe1xuXHRcdFx0aWRlbnRpZmllcjogZS5pZGVudGlmaWVyLFxuXHRcdFx0dmVyc2lvbjogZS52ZXJzaW9uLFxuXHRcdFx0bWFuaWZlc3Q6IGUubWFuaWZlc3QsXG5cdFx0XHRsb2NhdGlvbjogZS5sb2NhdGlvbi50b0pTT04oKSxcblx0XHRcdHJlYWRtZVVyaTogZS5yZWFkbWVVcmk/LnRvSlNPTigpLFxuXHRcdFx0Y2hhbmdlbG9nVXJpOiBlLmNoYW5nZWxvZ1VyaT8udG9KU09OKCksXG5cdFx0XHRwYWNrYWdlTkxTVXJpczogdG9TdHJpbmdEaWN0aW9uYXJ5KGUucGFja2FnZU5MU1VyaXMpLFxuXHRcdFx0ZGVmYXVsdE1hbmlmZXN0VHJhbnNsYXRpb25zOiBlLmRlZmF1bHRNYW5pZmVzdFRyYW5zbGF0aW9ucyxcblx0XHRcdGZhbGxiYWNrUGFja2FnZU5MU1VyaTogZS5mYWxsYmFja1BhY2thZ2VOTFNVcmk/LnRvSlNPTigpLFxuXHRcdFx0bWV0YWRhdGE6IGUubWV0YWRhdGFcblx0XHR9KSk7XG5cdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUoZmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShzdG9yZWRXZWJFeHRlbnNpb25zKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZXNvdXJjZUFjY2Vzc1F1ZXVlKGZpbGU6IFVSSSk6IFF1ZXVlPElXZWJFeHRlbnNpb25bXT4ge1xuXHRcdGxldCByZXNvdXJjZVF1ZXVlID0gdGhpcy5yZXNvdXJjZXNBY2Nlc3NRdWV1ZU1hcC5nZXQoZmlsZSk7XG5cdFx0aWYgKCFyZXNvdXJjZVF1ZXVlKSB7XG5cdFx0XHR0aGlzLnJlc291cmNlc0FjY2Vzc1F1ZXVlTWFwLnNldChmaWxlLCByZXNvdXJjZVF1ZXVlID0gbmV3IFF1ZXVlPElXZWJFeHRlbnNpb25bXT4oKSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXNvdXJjZVF1ZXVlO1xuXHR9XG5cbn1cblxuaWYgKGlzV2ViKSB7XG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5vcGVuSW5zdGFsbGVkV2ViRXh0ZW5zaW9uc1Jlc291cmNlJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3Blbkluc3RhbGxlZFdlYkV4dGVuc2lvbnNSZXNvdXJjZScsICdPcGVuIEluc3RhbGxlZCBXZWIgRXh0ZW5zaW9ucyBSZXNvdXJjZScpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IElzV2ViQ29udGV4dFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJ1bihzZXJ2aWNlQWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBzZXJ2aWNlQWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgPSBzZXJ2aWNlQWNjZXNzb3IuZ2V0KElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKTtcblx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSB9KTtcblx0XHR9XG5cdH0pO1xufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLCBXZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtDQUFrQyxlQUFxRSxnQkFBMkMsb0NBQW9DO0FBQy9MLFNBQVMsMkNBQTJDO0FBQ3BELFNBQTRCLG9DQUFpRDtBQUM3RSxTQUFTLE9BQU8sZ0JBQWdCO0FBQ2hDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQTBCO0FBQ25DLFNBQTZCLHFCQUFxQixvQkFBb0I7QUFDdEUsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlC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WTtBQUNoQixlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sU0FBMkMsdUJBQU8sT0FBTyxJQUFJO0FBQ25FLGlCQUFXLFFBQVEsQ0FBQyxPQUFPLFFBQVEsT0FBTyxHQUFHLElBQUksTUFBTSxPQUFPLENBQUM7QUFDL0QsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLHNCQUE2QyxjQUFjLElBQUksUUFBTTtBQUFBLE1BQzFFLFlBQVksRUFBRTtBQUFBLE1BQ2QsU0FBUyxFQUFFO0FBQUEsTUFDWCxVQUFVLEVBQUU7QUFBQSxNQUNaLFVBQVUsRUFBRSxTQUFTLE9BQU87QUFBQSxNQUM1QixXQUFXLEVBQUUsV0FBVyxPQUFPO0FBQUEsTUFDL0IsY0FBYyxFQUFFLGNBQWMsT0FBTztBQUFBLE1BQ3JDLGdCQUFnQixtQkFBbUIsRUFBRSxjQUFjO0FBQUEsTUFDbkQsNkJBQTZCLEVBQUU7QUFBQSxNQUMvQix1QkFBdUIsRUFBRSx1QkFBdUIsT0FBTztBQUFBLE1BQ3ZELFVBQVUsRUFBRTtBQUFBLElBQ2IsRUFBRTtBQUNGLFVBQU0sS0FBSyxZQUFZLFVBQVUsTUFBTSxTQUFTLFdBQVcsS0FBSyxVQUFVLG1CQUFtQixDQUFDLENBQUM7QUFBQSxFQUNoRztBQUFBLEVBRVEsdUJBQXVCLE1BQW1DO0FBQ2pFLFFBQUksZ0JBQWdCLEtBQUssd0JBQXdCLElBQUksSUFBSTtBQUN6RCxRQUFJLENBQUMsZUFBZTtBQUNuQixXQUFLLHdCQUF3QixJQUFJLE1BQU0sZ0JBQWdCLElBQUksTUFBdUIsQ0FBQztBQUFBLElBQ3BGO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFFRDtBQWo0QmEsOEJBQU47QUFBQSxFQVNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FyQlU7QUFtNEJiLElBQUksT0FBTztBQUNWLGtCQUFnQixjQUFjLFFBQVE7QUFBQSxJQUNyQyxjQUFjO0FBQ2IsWUFBTTtBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQ0osT0FBTyxVQUFVLHNDQUFzQyx3Q0FBd0M7QUFBQSxRQUMvRixVQUFVLFdBQVc7QUFBQSxRQUNyQixJQUFJO0FBQUEsUUFDSixjQUFjO0FBQUEsTUFDZixDQUFDO0FBQUEsSUFDRjtBQUFBLElBQ0EsSUFBSSxpQkFBeUM7QUFDNUMsWUFBTSxnQkFBZ0IsZ0JBQWdCLElBQUksY0FBYztBQUN4RCxZQUFNLHlCQUF5QixnQkFBZ0IsSUFBSSx1QkFBdUI7QUFDMUUsb0JBQWMsV0FBVyxFQUFFLFVBQVUsdUJBQXVCLGVBQWUsbUJBQW1CLENBQUM7QUFBQSxJQUNoRztBQUFBLEVBQ0QsQ0FBQztBQUNGO0FBRUEsa0JBQWtCLDhCQUE4Qiw2QkFBNkIsa0JBQWtCLE9BQU87IiwKICAibmFtZXMiOiBbImV4dGVuc2lvbiJdCn0K
