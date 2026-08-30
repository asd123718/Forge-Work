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
import * as fs from "fs";
import { Promises, Queue } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationError, getErrorMessage } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { hash } from "../../../base/common/hash.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../base/common/map.js";
import { Schemas } from "../../../base/common/network.js";
import * as path from "../../../base/common/path.js";
import { joinPath } from "../../../base/common/resources.js";
import * as semver from "../../../base/common/semver/semver.js";
import { isBoolean, isDefined, isUndefined } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import * as pfs from "../../../base/node/pfs.js";
import { extract, zip } from "../../../base/node/zip.js";
import * as nls from "../../../nls.js";
import { IDownloadService } from "../../download/common/download.js";
import { IEnvironmentService, INativeEnvironmentService } from "../../environment/common/environment.js";
import { AbstractExtensionManagementService, AbstractExtensionTask, toExtensionManagementError } from "../common/abstractExtensionManagementService.js";
import {
  ExtensionManagementError,
  ExtensionManagementErrorCode,
  IExtensionGalleryService,
  IExtensionManagementService,
  InstallOperation,
  EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT,
  ExtensionSignatureVerificationCode,
  computeSize,
  IAllowedExtensionsService,
  VerifyExtensionSignatureConfigKey,
  shouldRequireRepositorySignatureFor
} from "../common/extensionManagement.js";
import { areSameExtensions, computeTargetPlatform, ExtensionKey, getGalleryExtensionId, groupByExtension } from "../common/extensionManagementUtil.js";
import { IExtensionsProfileScannerService } from "../common/extensionsProfileScannerService.js";
import { IExtensionsScannerService } from "../common/extensionsScannerService.js";
import { ExtensionsDownloader } from "./extensionDownloader.js";
import { ExtensionsLifecycle } from "./extensionLifecycle.js";
import { fromExtractError, getManifest } from "./extensionManagementUtil.js";
import { ExtensionsManifestCache } from "./extensionsManifestCache.js";
import { ExtensionsWatcher } from "./extensionsWatcher.js";
import { ExtensionType, TargetPlatform } from "../../extensions/common/extensions.js";
import { isEngineValid } from "../../extensions/common/extensionValidator.js";
import { FileChangeType, FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { IInstantiationService, refineServiceDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IExtensionGalleryManifestService } from "../common/extensionGalleryManifest.js";
const INativeServerExtensionManagementService = refineServiceDecorator(IExtensionManagementService);
const DELETED_FOLDER_POSTFIX = ".vsctmp";
let ExtensionManagementService = class extends AbstractExtensionManagementService {
  constructor(galleryService, telemetryService, logService, environmentService, extensionsScannerService, extensionsProfileScannerService, downloadService, instantiationService, fileService, configurationService, extensionGalleryManifestService, productService, allowedExtensionsService, uriIdentityService, userDataProfilesService) {
    super(galleryService, telemetryService, uriIdentityService, logService, productService, allowedExtensionsService, userDataProfilesService);
    this.environmentService = environmentService;
    this.extensionsScannerService = extensionsScannerService;
    this.extensionsProfileScannerService = extensionsProfileScannerService;
    this.downloadService = downloadService;
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.extractingGalleryExtensions = /* @__PURE__ */ new Map();
    this.knownDirectories = new ResourceSet();
    const extensionLifecycle = this._register(instantiationService.createInstance(ExtensionsLifecycle));
    this.extensionsScanner = this._register(instantiationService.createInstance(ExtensionsScanner, (extension) => extensionLifecycle.postUninstall(extension)));
    this.manifestCache = this._register(new ExtensionsManifestCache(userDataProfilesService, fileService, uriIdentityService, this, this.logService));
    this.extensionsDownloader = this._register(instantiationService.createInstance(ExtensionsDownloader));
    const extensionsWatcher = this._register(new ExtensionsWatcher(this, this.extensionsScannerService, userDataProfilesService, extensionsProfileScannerService, uriIdentityService, fileService, logService));
    this._register(extensionsWatcher.onDidChangeExtensionsByAnotherSource((e) => this.onDidChangeExtensionsFromAnotherSource(e)));
    this.watchForExtensionsNotInstalledBySystem();
  }
  getTargetPlatform() {
    if (!this._targetPlatformPromise) {
      this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
    }
    return this._targetPlatformPromise;
  }
  async zip(extension) {
    this.logService.trace("ExtensionManagementService#zip", extension.identifier.id);
    const files = await this.collectFiles(extension);
    const location = await zip(joinPath(this.extensionsDownloader.extensionsDownloadDir, generateUuid()).fsPath, files);
    return URI.file(location);
  }
  async getManifest(vsix) {
    const { location, cleanup } = await this.downloadVsix(vsix);
    const zipPath = path.resolve(location.fsPath);
    try {
      return await getManifest(zipPath);
    } finally {
      await cleanup();
    }
  }
  getInstalled(type, profileLocation = this.userDataProfilesService.defaultProfile.extensionsResource, productVersion = { version: this.productService.version, date: this.productService.date }, language) {
    return this.extensionsScanner.scanExtensions(type ?? null, profileLocation, productVersion, language);
  }
  scanAllUserInstalledExtensions() {
    return this.extensionsScanner.scanAllUserExtensions();
  }
  scanInstalledExtensionAtLocation(location) {
    return this.extensionsScanner.scanUserExtensionAtLocation(location);
  }
  async install(vsix, options = {}) {
    this.logService.trace("ExtensionManagementService#install", vsix.toString());
    const { location, cleanup } = await this.downloadVsix(vsix);
    try {
      const manifest = await getManifest(path.resolve(location.fsPath));
      const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
      if (manifest.engines && manifest.engines.vscode && !isEngineValid(manifest.engines.vscode, this.productService.version, this.productService.date)) {
        throw new Error(nls.localize("incompatible", "Unable to install extension '{0}' as it is not compatible with VS Code '{1}'.", extensionId, this.productService.version));
      }
      const allowedToInstall = this.allowedExtensionsService.isAllowed({ id: extensionId, version: manifest.version, publisherDisplayName: void 0 });
      if (allowedToInstall !== true) {
        throw new Error(nls.localize("notAllowed", "This extension cannot be installed because {0}", allowedToInstall.value));
      }
      const results = await this.installExtensions([{ manifest, extension: location, options }]);
      const result = results.find(({ identifier }) => areSameExtensions(identifier, { id: extensionId }));
      if (result?.local) {
        return result.local;
      }
      if (result?.error) {
        throw result.error;
      }
      throw toExtensionManagementError(new Error(`Unknown error while installing extension ${extensionId}`));
    } finally {
      await cleanup();
    }
  }
  async installFromLocation(location, profileLocation) {
    this.logService.trace("ExtensionManagementService#installFromLocation", location.toString());
    const local = await this.extensionsScanner.scanUserExtensionAtLocation(location);
    if (!local || !local.manifest.name || !local.manifest.version) {
      throw new Error(`Cannot find a valid extension from the location ${location.toString()}`);
    }
    await this.addExtensionsToProfile([[local, { source: "resource" }]], profileLocation);
    this.logService.info("Successfully installed extension", local.identifier.id, profileLocation.toString());
    return local;
  }
  async installExtensionsFromProfile(extensions, fromProfileLocation, toProfileLocation) {
    this.logService.trace("ExtensionManagementService#installExtensionsFromProfile", extensions, fromProfileLocation.toString(), toProfileLocation.toString());
    const extensionsToInstall = (await this.getInstalled(ExtensionType.User, fromProfileLocation)).filter((e) => extensions.some((id) => areSameExtensions(id, e.identifier)));
    if (extensionsToInstall.length) {
      const metadata = await Promise.all(extensionsToInstall.map((e) => this.extensionsScanner.scanMetadata(e, fromProfileLocation)));
      await this.addExtensionsToProfile(extensionsToInstall.map((e, index) => [e, metadata[index]]), toProfileLocation);
      this.logService.info("Successfully installed extensions", extensionsToInstall.map((e) => e.identifier.id), toProfileLocation.toString());
    }
    return extensionsToInstall;
  }
  async updateMetadata(local, metadata, profileLocation) {
    this.logService.trace("ExtensionManagementService#updateMetadata", local.identifier.id);
    if (metadata.isPreReleaseVersion) {
      metadata.preRelease = true;
      metadata.hasPreReleaseVersion = true;
    }
    if (metadata.isMachineScoped === false) {
      metadata.isMachineScoped = void 0;
    }
    if (metadata.isBuiltin === false) {
      metadata.isBuiltin = void 0;
    }
    if (metadata.pinned === false) {
      metadata.pinned = void 0;
    }
    local = await this.extensionsScanner.updateMetadata(local, metadata, profileLocation);
    this.manifestCache.invalidate(profileLocation);
    this._onDidUpdateExtensionMetadata.fire({ local, profileLocation });
    return local;
  }
  deleteExtension(extension) {
    return this.extensionsScanner.deleteExtension(extension, "remove");
  }
  copyExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
    return this.extensionsScanner.copyExtension(extension, fromProfileLocation, toProfileLocation, metadata);
  }
  moveExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
    return this.extensionsScanner.moveExtension(extension, fromProfileLocation, toProfileLocation, metadata);
  }
  removeExtension(extension, fromProfileLocation) {
    return this.extensionsScanner.removeExtension(extension.identifier, fromProfileLocation);
  }
  copyExtensions(fromProfileLocation, toProfileLocation) {
    return this.extensionsScanner.copyExtensions(fromProfileLocation, toProfileLocation, { version: this.productService.version, date: this.productService.date });
  }
  deleteExtensions(...extensions) {
    return this.extensionsScanner.setExtensionsForRemoval(...extensions);
  }
  async cleanUp() {
    this.logService.trace("ExtensionManagementService#cleanUp");
    try {
      await this.extensionsScanner.cleanUp();
    } catch (error) {
      this.logService.error(error);
    }
  }
  async download(extension, operation, donotVerifySignature) {
    const { location } = await this.downloadExtension(extension, operation, !donotVerifySignature);
    return location;
  }
  async downloadVsix(vsix) {
    if (vsix.scheme === Schemas.file) {
      return { location: vsix, async cleanup() {
      } };
    }
    this.logService.trace("Downloading extension from", vsix.toString());
    const location = joinPath(this.extensionsDownloader.extensionsDownloadDir, generateUuid());
    await this.downloadService.download(vsix, location, "extensionManagement.downloadVsix");
    this.logService.info("Downloaded extension to", location.toString());
    const cleanup = async () => {
      try {
        await this.fileService.del(location);
      } catch (error) {
        this.logService.error(error);
      }
    };
    return { location, cleanup };
  }
  getCurrentExtensionsManifestLocation() {
    return this.userDataProfilesService.defaultProfile.extensionsResource;
  }
  createInstallExtensionTask(manifest, extension, options) {
    const extensionKey = extension instanceof URI ? new ExtensionKey({ id: getGalleryExtensionId(manifest.publisher, manifest.name) }, manifest.version) : ExtensionKey.create(extension);
    return this.instantiationService.createInstance(InstallExtensionInProfileTask, extensionKey, manifest, extension, options, (operation, token) => {
      if (extension instanceof URI) {
        return this.extractVSIX(extensionKey, extension, options, token);
      }
      let promise = this.extractingGalleryExtensions.get(extensionKey.toString());
      if (!promise) {
        this.extractingGalleryExtensions.set(extensionKey.toString(), promise = this.downloadAndExtractGalleryExtension(extensionKey, extension, operation, options, token));
        promise.finally(() => this.extractingGalleryExtensions.delete(extensionKey.toString()));
      }
      return promise;
    }, this.extensionsScanner);
  }
  createUninstallExtensionTask(extension, options) {
    return new UninstallExtensionInProfileTask(extension, options, this.extensionsProfileScannerService);
  }
  async downloadAndExtractGalleryExtension(extensionKey, gallery, operation, options, token) {
    const { verificationStatus, location } = await this.downloadExtension(gallery, operation, !options.donotVerifySignature, options.context?.[EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT]);
    try {
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      const manifest = await getManifest(location.fsPath);
      if (!new ExtensionKey(gallery.identifier, gallery.version).equals(new ExtensionKey({ id: getGalleryExtensionId(manifest.publisher, manifest.name) }, manifest.version))) {
        throw new ExtensionManagementError(nls.localize("invalidManifest", "Cannot install '{0}' extension because of manifest mismatch with Marketplace", gallery.identifier.id), ExtensionManagementErrorCode.Invalid);
      }
      const local = await this.extensionsScanner.extractUserExtension(
        extensionKey,
        location.fsPath,
        false,
        token
      );
      if (verificationStatus !== ExtensionSignatureVerificationCode.Success && this.environmentService.isBuilt) {
        try {
          await this.extensionsDownloader.delete(location);
        } catch (e) {
          this.logService.warn(`Error while deleting the downloaded file`, location.toString(), getErrorMessage(e));
        }
      }
      return { local, verificationStatus };
    } catch (error) {
      try {
        await this.extensionsDownloader.delete(location);
      } catch (e) {
        this.logService.warn(`Error while deleting the downloaded file`, location.toString(), getErrorMessage(e));
      }
      throw toExtensionManagementError(error);
    }
  }
  async downloadExtension(extension, operation, verifySignature, clientTargetPlatform) {
    if (verifySignature) {
      const value = this.configurationService.getValue(VerifyExtensionSignatureConfigKey);
      verifySignature = isBoolean(value) ? value : true;
    }
    const { location, verificationStatus } = await this.extensionsDownloader.download(extension, operation, verifySignature, clientTargetPlatform);
    const shouldRequireSignature = shouldRequireRepositorySignatureFor(extension.private, await this.extensionGalleryManifestService.getExtensionGalleryManifest());
    if (verificationStatus !== ExtensionSignatureVerificationCode.Success && !(verificationStatus === ExtensionSignatureVerificationCode.NotSigned && !shouldRequireSignature) && verifySignature && this.environmentService.isBuilt && await this.getTargetPlatform() !== TargetPlatform.LINUX_ARMHF) {
      try {
        await this.extensionsDownloader.delete(location);
      } catch (e) {
        this.logService.warn(`Error while deleting the downloaded file`, location.toString(), getErrorMessage(e));
      }
      if (!verificationStatus) {
        throw new ExtensionManagementError(nls.localize("signature verification not executed", "Signature verification was not executed."), ExtensionManagementErrorCode.SignatureVerificationInternal);
      }
      switch (verificationStatus) {
        case ExtensionSignatureVerificationCode.PackageIntegrityCheckFailed:
        case ExtensionSignatureVerificationCode.SignatureIsInvalid:
        case ExtensionSignatureVerificationCode.SignatureManifestIsInvalid:
        case ExtensionSignatureVerificationCode.SignatureIntegrityCheckFailed:
        case ExtensionSignatureVerificationCode.EntryIsMissing:
        case ExtensionSignatureVerificationCode.EntryIsTampered:
        case ExtensionSignatureVerificationCode.Untrusted:
        case ExtensionSignatureVerificationCode.CertificateRevoked:
        case ExtensionSignatureVerificationCode.SignatureIsNotValid:
        case ExtensionSignatureVerificationCode.SignatureArchiveHasTooManyEntries:
        case ExtensionSignatureVerificationCode.NotSigned:
          throw new ExtensionManagementError(nls.localize("signature verification failed", "Signature verification failed with '{0}' error.", verificationStatus), ExtensionManagementErrorCode.SignatureVerificationFailed);
      }
      throw new ExtensionManagementError(nls.localize("signature verification failed", "Signature verification failed with '{0}' error.", verificationStatus), ExtensionManagementErrorCode.SignatureVerificationInternal);
    }
    return { location, verificationStatus };
  }
  async extractVSIX(extensionKey, location, options, token) {
    const local = await this.extensionsScanner.extractUserExtension(
      extensionKey,
      path.resolve(location.fsPath),
      isBoolean(options.keepExisting) ? !options.keepExisting : true,
      token
    );
    return { local };
  }
  async collectFiles(extension) {
    const collectFilesFromDirectory = async (dir) => {
      let entries = await pfs.Promises.readdir(dir);
      entries = entries.map((e) => path.join(dir, e));
      const stats = await Promise.all(entries.map((e) => fs.promises.stat(e)));
      let promise = Promise.resolve([]);
      stats.forEach((stat, index) => {
        const entry = entries[index];
        if (stat.isFile()) {
          promise = promise.then((result) => [...result, entry]);
        }
        if (stat.isDirectory()) {
          promise = promise.then((result) => collectFilesFromDirectory(entry).then((files2) => [...result, ...files2]));
        }
      });
      return promise;
    };
    const files = await collectFilesFromDirectory(extension.location.fsPath);
    return files.map((f) => ({ path: `extension/${path.relative(extension.location.fsPath, f)}`, localPath: f }));
  }
  async onDidChangeExtensionsFromAnotherSource({ added, removed }) {
    if (removed) {
      const removedExtensions = added && this.uriIdentityService.extUri.isEqual(removed.profileLocation, added.profileLocation) ? removed.extensions.filter((e) => added.extensions.every((identifier) => !areSameExtensions(identifier, e))) : removed.extensions;
      for (const identifier of removedExtensions) {
        this.logService.info("Extensions removed from another source", identifier.id, removed.profileLocation.toString());
        this._onDidUninstallExtension.fire({ identifier, profileLocation: removed.profileLocation });
      }
    }
    if (added) {
      const extensions = await this.getInstalled(ExtensionType.User, added.profileLocation);
      const addedExtensions = extensions.filter((e) => added.extensions.some((identifier) => areSameExtensions(identifier, e.identifier)));
      this._onDidInstallExtensions.fire(addedExtensions.map((local) => {
        this.logService.info("Extensions added from another source", local.identifier.id, added.profileLocation.toString());
        return { identifier: local.identifier, local, profileLocation: added.profileLocation, operation: InstallOperation.None };
      }));
    }
  }
  async watchForExtensionsNotInstalledBySystem() {
    this._register(this.extensionsScanner.onExtract((resource) => this.knownDirectories.add(resource)));
    const stat = await this.fileService.resolve(this.extensionsScannerService.userExtensionsLocation);
    for (const childStat of stat.children ?? []) {
      if (childStat.isDirectory) {
        this.knownDirectories.add(childStat.resource);
      }
    }
    this._register(this.fileService.watch(this.extensionsScannerService.userExtensionsLocation));
    this._register(this.fileService.onDidFilesChange((e) => this.onDidFilesChange(e)));
  }
  async onDidFilesChange(e) {
    if (!e.affects(this.extensionsScannerService.userExtensionsLocation, FileChangeType.ADDED)) {
      return;
    }
    const added = [];
    for (const resource of e.rawAdded) {
      if (this.knownDirectories.has(resource)) {
        continue;
      }
      if (!this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.dirname(resource), this.extensionsScannerService.userExtensionsLocation)) {
        continue;
      }
      if (this.uriIdentityService.extUri.isEqual(resource, this.uriIdentityService.extUri.joinPath(this.extensionsScannerService.userExtensionsLocation, ".obsolete"))) {
        continue;
      }
      if (this.uriIdentityService.extUri.basename(resource).startsWith(".")) {
        continue;
      }
      if (this.uriIdentityService.extUri.basename(resource).endsWith(DELETED_FOLDER_POSTFIX)) {
        continue;
      }
      try {
        if (!(await this.fileService.stat(resource)).isDirectory) {
          continue;
        }
      } catch (error) {
        if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
          this.logService.error(error);
        }
        continue;
      }
      const extension = await this.extensionsScanner.scanUserExtensionAtLocation(resource);
      if (extension && extension.installedTimestamp === void 0) {
        this.knownDirectories.add(resource);
        added.push(extension);
      }
    }
    if (added.length) {
      await this.addExtensionsToProfile(added.map((e2) => [e2, void 0]), this.userDataProfilesService.defaultProfile.extensionsResource);
      this.logService.info("Added extensions to default profile from external source", added.map((e2) => e2.identifier.id));
    }
  }
  async addExtensionsToProfile(extensions, profileLocation) {
    const localExtensions = extensions.map((e) => e[0]);
    await this.extensionsScanner.unsetExtensionsForRemoval(...localExtensions.map((extension) => ExtensionKey.create(extension)));
    await this.extensionsProfileScannerService.addExtensionsToProfile(extensions, profileLocation);
    this._onDidInstallExtensions.fire(localExtensions.map((local) => ({ local, identifier: local.identifier, operation: InstallOperation.None, profileLocation })));
  }
};
ExtensionManagementService = __decorateClass([
  __decorateParam(0, IExtensionGalleryService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, ILogService),
  __decorateParam(3, INativeEnvironmentService),
  __decorateParam(4, IExtensionsScannerService),
  __decorateParam(5, IExtensionsProfileScannerService),
  __decorateParam(6, IDownloadService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IExtensionGalleryManifestService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IAllowedExtensionsService),
  __decorateParam(13, IUriIdentityService),
  __decorateParam(14, IUserDataProfilesService)
], ExtensionManagementService);
let ExtensionsScanner = class extends Disposable {
  constructor(beforeRemovingExtension, environmentService, fileService, extensionsScannerService, extensionsProfileScannerService, uriIdentityService, telemetryService, productService, userDataProfilesService, logService) {
    super();
    this.beforeRemovingExtension = beforeRemovingExtension;
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.extensionsScannerService = extensionsScannerService;
    this.extensionsProfileScannerService = extensionsProfileScannerService;
    this.uriIdentityService = uriIdentityService;
    this.telemetryService = telemetryService;
    this.productService = productService;
    this.userDataProfilesService = userDataProfilesService;
    this.logService = logService;
    this._onExtract = this._register(new Emitter());
    this.onExtract = this._onExtract.event;
    this.scanAllExtensionPromise = new ResourceMap();
    this.scanUserExtensionsPromise = new ResourceMap();
    this.obsoletedResource = joinPath(this.extensionsScannerService.userExtensionsLocation, ".obsolete");
    this.obsoleteFileLimiter = new Queue();
  }
  async cleanUp() {
    await this.removeTemporarilyDeletedFolders();
    await this.removeStaleAutoUpdateBuiltinExtensions();
    await this.deleteExtensionsMarkedForRemoval();
    await this.initializeExtensionSize();
  }
  async scanExtensions(type, profileLocation, productVersion, language) {
    try {
      const cacheKey = profileLocation.with({ query: language });
      const userScanOptions = { includeInvalid: true, profileLocation, productVersion, language };
      let scannedExtensions = [];
      if (type === null || type === ExtensionType.System) {
        let scanAllExtensionsPromise = this.scanAllExtensionPromise.get(cacheKey);
        if (!scanAllExtensionsPromise) {
          scanAllExtensionsPromise = this.extensionsScannerService.scanAllExtensions({ language }, userScanOptions).finally(() => this.scanAllExtensionPromise.delete(cacheKey));
          this.scanAllExtensionPromise.set(cacheKey, scanAllExtensionsPromise);
        }
        scannedExtensions.push(...await scanAllExtensionsPromise);
      } else if (type === ExtensionType.User) {
        let scanUserExtensionsPromise = this.scanUserExtensionsPromise.get(cacheKey);
        if (!scanUserExtensionsPromise) {
          scanUserExtensionsPromise = this.extensionsScannerService.scanUserExtensions(userScanOptions).finally(() => this.scanUserExtensionsPromise.delete(cacheKey));
          this.scanUserExtensionsPromise.set(cacheKey, scanUserExtensionsPromise);
        }
        scannedExtensions.push(...await scanUserExtensionsPromise);
      }
      scannedExtensions = type !== null ? scannedExtensions.filter((r) => r.type === type) : scannedExtensions;
      return await Promise.all(scannedExtensions.map((extension) => this.toLocalExtension(extension)));
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.Scanning);
    }
  }
  async scanAllUserExtensions() {
    try {
      const scannedExtensions = await this.extensionsScannerService.scanAllUserExtensions();
      return await Promise.all(scannedExtensions.map((extension) => this.toLocalExtension(extension)));
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.Scanning);
    }
  }
  async scanUserExtensionAtLocation(location) {
    try {
      const scannedExtension = await this.extensionsScannerService.scanExistingExtension(location, ExtensionType.User, { includeInvalid: true });
      if (scannedExtension) {
        return await this.toLocalExtension(scannedExtension);
      }
    } catch (error) {
      this.logService.error(error);
    }
    return null;
  }
  async extractUserExtension(extensionKey, zipPath, removeIfExists, token) {
    const folderName = extensionKey.toString();
    const tempLocation = URI.file(path.join(this.extensionsScannerService.userExtensionsLocation.fsPath, `.${generateUuid()}`));
    const extensionLocation = URI.file(path.join(this.extensionsScannerService.userExtensionsLocation.fsPath, folderName));
    if (await this.fileService.exists(extensionLocation)) {
      if (!removeIfExists) {
        try {
          return await this.scanLocalExtension(extensionLocation, ExtensionType.User);
        } catch (error) {
          this.logService.warn(`Error while scanning the existing extension at ${extensionLocation.path}. Deleting the existing extension and extracting it.`, getErrorMessage(error));
        }
      }
      try {
        await this.deleteExtensionFromLocation(extensionKey.id, extensionLocation, "removeExisting");
      } catch (error) {
        throw new ExtensionManagementError(nls.localize("errorDeleting", "Unable to delete the existing folder '{0}' while installing the extension '{1}'. Please delete the folder manually and try again", extensionLocation.fsPath, extensionKey.id), ExtensionManagementErrorCode.Delete);
      }
    }
    try {
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      try {
        this.logService.trace(`Started extracting the extension from ${zipPath} to ${extensionLocation.fsPath}`);
        await extract(zipPath, tempLocation.fsPath, { sourcePath: "extension", overwrite: true }, token);
        this.logService.info(`Extracted extension to ${extensionLocation}:`, extensionKey.id);
      } catch (e) {
        throw fromExtractError(e);
      }
      const metadata = { installedTimestamp: Date.now(), targetPlatform: extensionKey.targetPlatform };
      try {
        metadata.size = await computeSize(tempLocation, this.fileService);
      } catch (error) {
        this.logService.warn(`Error while getting the size of the extracted extension : ${tempLocation.fsPath}`, getErrorMessage(error));
      }
      try {
        await this.extensionsScannerService.updateManifestMetadata(tempLocation, metadata);
      } catch (error) {
        this.telemetryService.publicLog2("extension:extract", { extensionId: extensionKey.id, code: `${toFileOperationResult(error)}` });
        throw toExtensionManagementError(error, ExtensionManagementErrorCode.UpdateMetadata);
      }
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      try {
        this.logService.trace(`Started renaming the extension from ${tempLocation.fsPath} to ${extensionLocation.fsPath}`);
        await this.rename(tempLocation.fsPath, extensionLocation.fsPath);
        this.logService.info("Renamed to", extensionLocation.fsPath);
      } catch (error) {
        if (error.code === "ENOTEMPTY") {
          this.logService.info(`Rename failed because extension was installed by another source. So ignoring renaming.`, extensionKey.id);
          try {
            await this.fileService.del(tempLocation, { recursive: true });
          } catch (e) {
          }
        } else {
          this.logService.info(`Rename failed because of ${getErrorMessage(error)}. Deleted from extracted location`, tempLocation);
          throw error;
        }
      }
      this._onExtract.fire(extensionLocation);
    } catch (error) {
      try {
        await this.fileService.del(tempLocation, { recursive: true });
      } catch (e) {
      }
      throw error;
    }
    return this.scanLocalExtension(extensionLocation, ExtensionType.User);
  }
  async scanMetadata(local, profileLocation) {
    const extension = await this.getScannedExtension(local, profileLocation);
    return extension?.metadata;
  }
  async getScannedExtension(local, profileLocation) {
    const extensions = await this.extensionsProfileScannerService.scanProfileExtensions(profileLocation);
    return extensions.find((e) => areSameExtensions(e.identifier, local.identifier));
  }
  async updateMetadata(local, metadata, profileLocation) {
    try {
      await this.extensionsProfileScannerService.updateMetadata([[local, metadata]], profileLocation);
    } catch (error) {
      this.telemetryService.publicLog2("extension:extract", { extensionId: local.identifier.id, code: `${toFileOperationResult(error)}`, isProfile: !!profileLocation });
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.UpdateMetadata);
    }
    return this.scanLocalExtension(local.location, local.type, profileLocation);
  }
  async setExtensionsForRemoval(...extensions) {
    const extensionsToRemove = [];
    for (const extension of extensions) {
      if (await this.fileService.exists(extension.location)) {
        extensionsToRemove.push(extension);
      }
    }
    const extensionKeys = extensionsToRemove.map((e) => ExtensionKey.create(e));
    await this.withRemovedExtensions((removedExtensions) => extensionKeys.forEach((extensionKey) => {
      removedExtensions[extensionKey.toString()] = true;
      this.logService.info("Marked extension as removed", extensionKey.toString());
    }));
  }
  async unsetExtensionsForRemoval(...extensionKeys) {
    try {
      const results = [];
      await this.withRemovedExtensions((removedExtensions) => extensionKeys.forEach((extensionKey) => {
        if (removedExtensions[extensionKey.toString()]) {
          results.push(true);
          delete removedExtensions[extensionKey.toString()];
        } else {
          results.push(false);
        }
      }));
      return results;
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.UnsetRemoved);
    }
  }
  async deleteExtension(extension, type) {
    if (this.uriIdentityService.extUri.isEqualOrParent(extension.location, this.extensionsScannerService.userExtensionsLocation)) {
      await this.deleteExtensionFromLocation(extension.identifier.id, extension.location, type);
      await this.unsetExtensionsForRemoval(ExtensionKey.create(extension));
    }
  }
  async copyExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
    const source = await this.getScannedExtension(extension, fromProfileLocation);
    const target = await this.getScannedExtension(extension, toProfileLocation);
    metadata = { ...source?.metadata, ...metadata };
    if (target) {
      if (this.uriIdentityService.extUri.isEqual(target.location, extension.location)) {
        await this.extensionsProfileScannerService.updateMetadata([[extension, { ...target.metadata, ...metadata }]], toProfileLocation);
      } else {
        const targetExtension = await this.scanLocalExtension(target.location, extension.type, toProfileLocation);
        await this.extensionsProfileScannerService.removeExtensionsFromProfile([targetExtension.identifier], toProfileLocation);
        await this.extensionsProfileScannerService.addExtensionsToProfile([[extension, { ...target.metadata, ...metadata }]], toProfileLocation);
      }
    } else {
      await this.extensionsProfileScannerService.addExtensionsToProfile([[extension, metadata]], toProfileLocation);
    }
    return this.scanLocalExtension(extension.location, extension.type, toProfileLocation);
  }
  async moveExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
    const source = await this.getScannedExtension(extension, fromProfileLocation);
    const target = await this.getScannedExtension(extension, toProfileLocation);
    metadata = { ...source?.metadata, ...metadata };
    if (target) {
      if (this.uriIdentityService.extUri.isEqual(target.location, extension.location)) {
        await this.extensionsProfileScannerService.updateMetadata([[extension, { ...target.metadata, ...metadata }]], toProfileLocation);
      } else {
        const targetExtension = await this.scanLocalExtension(target.location, extension.type, toProfileLocation);
        await this.removeExtension(targetExtension.identifier, toProfileLocation);
        await this.extensionsProfileScannerService.addExtensionsToProfile([[extension, { ...target.metadata, ...metadata }]], toProfileLocation);
      }
    } else {
      await this.extensionsProfileScannerService.addExtensionsToProfile([[extension, metadata]], toProfileLocation);
      if (source) {
        await this.removeExtension(source.identifier, fromProfileLocation);
      }
    }
    return this.scanLocalExtension(extension.location, extension.type, toProfileLocation);
  }
  async removeExtension(identifier, fromProfileLocation) {
    await this.extensionsProfileScannerService.removeExtensionsFromProfile([identifier], fromProfileLocation);
  }
  async copyExtensions(fromProfileLocation, toProfileLocation, productVersion) {
    const fromExtensions = await this.scanExtensions(ExtensionType.User, fromProfileLocation, productVersion);
    const extensions = await Promise.all(fromExtensions.filter((e) => !e.isApplicationScoped).map(async (e) => [e, await this.scanMetadata(e, fromProfileLocation)]));
    await this.extensionsProfileScannerService.addExtensionsToProfile(extensions, toProfileLocation);
  }
  async deleteExtensionFromLocation(id, location, type) {
    this.logService.trace(`Deleting ${type} extension from disk`, id, location.fsPath);
    const renamedLocation = this.uriIdentityService.extUri.joinPath(this.uriIdentityService.extUri.dirname(location), `${this.uriIdentityService.extUri.basename(location)}.${hash(generateUuid()).toString(16)}${DELETED_FOLDER_POSTFIX}`);
    await this.rename(location.fsPath, renamedLocation.fsPath);
    await this.fileService.del(renamedLocation, { recursive: true });
    this.logService.info(`Deleted ${type} extension from disk`, id, location.fsPath);
  }
  withRemovedExtensions(updateFn) {
    return this.obsoleteFileLimiter.queue(async () => {
      let raw;
      try {
        const content = await this.fileService.readFile(this.obsoletedResource, "utf8");
        raw = content.value.toString();
      } catch (error) {
        if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
          throw error;
        }
      }
      let removed = {};
      if (raw) {
        try {
          removed = JSON.parse(raw);
        } catch (e) {
        }
      }
      if (updateFn) {
        updateFn(removed);
        if (Object.keys(removed).length) {
          await this.fileService.writeFile(this.obsoletedResource, VSBuffer.fromString(JSON.stringify(removed)));
        } else {
          try {
            await this.fileService.del(this.obsoletedResource);
          } catch (error) {
            if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
              throw error;
            }
          }
        }
      }
      return removed;
    });
  }
  async rename(extractPath, renamePath) {
    try {
      await pfs.Promises.rename(
        extractPath,
        renamePath,
        2 * 60 * 1e3
        /* Retry for 2 minutes */
      );
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.Rename);
    }
  }
  async scanLocalExtension(location, type, profileLocation) {
    try {
      if (profileLocation) {
        const scannedExtensions = await this.extensionsScannerService.scanUserExtensions({ profileLocation });
        const scannedExtension = scannedExtensions.find((e) => this.uriIdentityService.extUri.isEqual(e.location, location));
        if (scannedExtension) {
          return await this.toLocalExtension(scannedExtension);
        }
      } else {
        const scannedExtension = await this.extensionsScannerService.scanExistingExtension(location, type, { includeInvalid: true });
        if (scannedExtension) {
          return await this.toLocalExtension(scannedExtension);
        }
      }
      throw new ExtensionManagementError(nls.localize("cannot read", "Cannot read the extension from {0}", location.path), ExtensionManagementErrorCode.ScanningExtension);
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.ScanningExtension);
    }
  }
  async toLocalExtension(extension) {
    let stat;
    try {
      stat = await this.fileService.resolve(extension.location);
    } catch (error) {
    }
    let readmeUrl;
    let changelogUrl;
    if (stat?.children) {
      readmeUrl = stat.children.find(({ name }) => /^readme(\.txt|\.md|)$/i.test(name))?.resource;
      changelogUrl = stat.children.find(({ name }) => /^changelog(\.txt|\.md|)$/i.test(name))?.resource;
    }
    return {
      identifier: extension.identifier,
      type: extension.type,
      isBuiltin: extension.isBuiltin || !!extension.metadata?.isBuiltin,
      location: extension.location,
      manifest: extension.manifest,
      targetPlatform: extension.targetPlatform,
      validations: extension.validations,
      isValid: extension.isValid,
      readmeUrl,
      changelogUrl,
      publisherDisplayName: extension.metadata?.publisherDisplayName,
      publisherId: extension.metadata?.publisherId || null,
      isApplicationScoped: !!extension.metadata?.isApplicationScoped,
      isMachineScoped: !!extension.metadata?.isMachineScoped,
      isPreReleaseVersion: !!extension.metadata?.isPreReleaseVersion,
      hasPreReleaseVersion: !!extension.metadata?.hasPreReleaseVersion,
      preRelease: extension.preRelease,
      installedTimestamp: extension.metadata?.installedTimestamp,
      updated: !!extension.metadata?.updated,
      pinned: !!extension.metadata?.pinned,
      forceAutoUpdate: extension.forceAutoUpdate,
      private: !!extension.metadata?.private,
      isWorkspaceScoped: false,
      source: extension.metadata?.source ?? (extension.identifier.uuid ? "gallery" : "vsix"),
      size: extension.metadata?.size ?? 0
    };
  }
  async initializeExtensionSize() {
    const extensions = await this.extensionsScannerService.scanAllUserExtensions();
    await Promise.all(extensions.map(async (extension) => {
      if (isDefined(extension.metadata?.installedTimestamp) && isUndefined(extension.metadata?.size)) {
        const size = await computeSize(extension.location, this.fileService);
        await this.extensionsScannerService.updateManifestMetadata(extension.location, { size });
      }
    }));
  }
  async removeStaleAutoUpdateBuiltinExtensions() {
    if (this.environmentService.extensionTestsLocationURI) {
      return;
    }
    const builtinExtensions = await this.extensionsScannerService.scanSystemExtensions({});
    const userExtensions = await this.extensionsScannerService.scanAllUserExtensions();
    const staleExtensions = userExtensions.filter((userExtension) => {
      if (!this.productService.builtInExtensionsEnabledWithAutoUpdates.some((id) => id.toLowerCase() === userExtension.identifier.id.toLowerCase())) {
        return false;
      }
      const builtinExtension = builtinExtensions.find((e) => areSameExtensions(e.identifier, userExtension.identifier));
      return builtinExtension && semver.lt(userExtension.manifest.version, builtinExtension.manifest.version);
    });
    if (staleExtensions.length) {
      this.logService.info("Removing stale auto-update builtin extensions:", staleExtensions.map((e) => `${e.identifier.id}@${e.manifest.version}`).join(", "));
      await this.extensionsProfileScannerService.removeExtensionsFromProfile(staleExtensions.map((e) => e.identifier), this.userDataProfilesService.defaultProfile.extensionsResource);
      await Promise.allSettled(staleExtensions.map((e) => this.deleteExtension(e, "stale auto-update builtin")));
    }
  }
  async deleteExtensionsMarkedForRemoval() {
    let removed;
    try {
      removed = await this.withRemovedExtensions();
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.ReadRemoved);
    }
    if (Object.keys(removed).length === 0) {
      this.logService.debug(`No extensions are marked as removed.`);
      return;
    }
    this.logService.debug(`Deleting extensions marked as removed:`, Object.keys(removed));
    const extensions = await this.scanAllUserExtensions();
    const installed = /* @__PURE__ */ new Set();
    for (const e of extensions) {
      if (!removed[ExtensionKey.create(e).toString()]) {
        installed.add(e.identifier.id.toLowerCase());
      }
    }
    try {
      const byExtension = groupByExtension(extensions, (e) => e.identifier);
      await Promises.settled(byExtension.map(async (e) => {
        const latest = e.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version))[0];
        if (!installed.has(latest.identifier.id.toLowerCase())) {
          await this.beforeRemovingExtension(latest);
        }
      }));
    } catch (error) {
      this.logService.error(error);
    }
    const toRemove = extensions.filter((e) => e.installedTimestamp && removed[ExtensionKey.create(e).toString()]);
    await Promise.allSettled(toRemove.map((e) => this.deleteExtension(e, "marked for removal")));
  }
  async removeTemporarilyDeletedFolders() {
    this.logService.trace("ExtensionManagementService#removeTempDeleteFolders");
    let stat;
    try {
      stat = await this.fileService.resolve(this.extensionsScannerService.userExtensionsLocation);
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.error(error);
      }
      return;
    }
    if (!stat?.children) {
      return;
    }
    try {
      await Promise.allSettled(stat.children.map(async (child) => {
        if (!child.isDirectory || !child.name.endsWith(DELETED_FOLDER_POSTFIX)) {
          return;
        }
        this.logService.trace("Deleting the temporarily deleted folder", child.resource.toString());
        try {
          await this.fileService.del(child.resource, { recursive: true });
          this.logService.trace("Deleted the temporarily deleted folder", child.resource.toString());
        } catch (error) {
          if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
            this.logService.error(error);
          }
        }
      }));
    } catch (error) {
    }
  }
};
ExtensionsScanner = __decorateClass([
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IExtensionsScannerService),
  __decorateParam(4, IExtensionsProfileScannerService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IProductService),
  __decorateParam(8, IUserDataProfilesService),
  __decorateParam(9, ILogService)
], ExtensionsScanner);
let InstallExtensionInProfileTask = class extends AbstractExtensionTask {
  constructor(extensionKey, manifest, source, options, extractExtensionFn, extensionsScanner, uriIdentityService, galleryService, userDataProfilesService, extensionsScannerService, extensionsProfileScannerService, productService, logService) {
    super();
    this.extensionKey = extensionKey;
    this.manifest = manifest;
    this.source = source;
    this.options = options;
    this.extractExtensionFn = extractExtensionFn;
    this.extensionsScanner = extensionsScanner;
    this.uriIdentityService = uriIdentityService;
    this.galleryService = galleryService;
    this.userDataProfilesService = userDataProfilesService;
    this.extensionsScannerService = extensionsScannerService;
    this.extensionsProfileScannerService = extensionsProfileScannerService;
    this.productService = productService;
    this.logService = logService;
    this._operation = InstallOperation.Install;
    this.identifier = this.extensionKey.identifier;
  }
  get operation() {
    return this.options.operation ?? this._operation;
  }
  get verificationStatus() {
    return this._verificationStatus;
  }
  async doRun(token) {
    const installed = await this.extensionsScanner.scanExtensions(ExtensionType.User, this.options.profileLocation, this.options.productVersion);
    const existingExtension = installed.find((i) => areSameExtensions(i.identifier, this.identifier));
    if (existingExtension) {
      this._operation = InstallOperation.Update;
    }
    const system = await this.extensionsScanner.scanExtensions(ExtensionType.System, this.options.profileLocation, this.options.productVersion);
    const existingSystemExtension = system.find((i) => areSameExtensions(i.identifier, this.identifier));
    if (existingSystemExtension) {
      if (!existingSystemExtension.forceAutoUpdate) {
        throw new ExtensionManagementError(nls.localize("builtinAutoUpdate", "Extension '{0}' is a built-in extension and not allowed to be updated in the current product quality '{1}'.", existingSystemExtension.identifier.id, this.productService.quality), ExtensionManagementErrorCode.Incompatible);
      }
      if (semver.gt(existingSystemExtension.manifest.version, this.manifest.version)) {
        throw new ExtensionManagementError(nls.localize("builtinVersion", "Extension '{0}' is a built-in extension with version '{1}' and cannot be downgraded to version '{2}'.", existingSystemExtension.identifier.id, existingSystemExtension.manifest.version, this.manifest.version), ExtensionManagementErrorCode.Incompatible);
      }
    }
    const metadata = {
      isApplicationScoped: this.options.isApplicationScoped || existingExtension?.isApplicationScoped,
      isMachineScoped: this.options.isMachineScoped || existingExtension?.isMachineScoped,
      isBuiltin: this.options.isBuiltin || existingExtension?.isBuiltin,
      isSystem: existingExtension?.type === ExtensionType.System ? true : void 0,
      installedTimestamp: Date.now(),
      pinned: this.options.installGivenVersion ? true : this.options.pinned ?? existingExtension?.pinned,
      source: this.source instanceof URI ? "vsix" : "gallery"
    };
    let local;
    if (this.source instanceof URI) {
      if (existingExtension) {
        if (this.extensionKey.equals(new ExtensionKey(existingExtension.identifier, existingExtension.manifest.version))) {
          try {
            await this.extensionsScanner.deleteExtension(existingExtension, "existing");
          } catch (e) {
            throw new Error(nls.localize("restartCode", "Please restart VS Code before reinstalling {0}.", this.manifest.displayName || this.manifest.name));
          }
        }
      }
      const existingWithSameVersion = await this.unsetIfRemoved(this.extensionKey);
      if (existingWithSameVersion) {
        try {
          await this.extensionsScanner.deleteExtension(existingWithSameVersion, "existing");
        } catch (e) {
          throw new Error(nls.localize("restartCode", "Please restart VS Code before reinstalling {0}.", this.manifest.displayName || this.manifest.name));
        }
      }
    } else {
      metadata.id = this.source.identifier.uuid;
      metadata.publisherId = this.source.publisherId;
      metadata.publisherDisplayName = this.source.publisherDisplayName;
      metadata.targetPlatform = this.source.properties.targetPlatform;
      metadata.updated = !!existingExtension;
      metadata.private = this.source.private;
      metadata.isPreReleaseVersion = this.source.properties.isPreReleaseVersion;
      metadata.hasPreReleaseVersion = existingExtension?.hasPreReleaseVersion || this.source.properties.isPreReleaseVersion;
      metadata.preRelease = isBoolean(this.options.preRelease) ? this.options.preRelease : this.options.installPreReleaseVersion || this.source.properties.isPreReleaseVersion || existingExtension?.preRelease;
      if (existingExtension && existingExtension.type !== ExtensionType.System && existingExtension.manifest.version === this.source.version) {
        return this.extensionsScanner.updateMetadata(existingExtension, metadata, this.options.profileLocation);
      }
      local = await this.unsetIfRemoved(this.extensionKey);
    }
    if (token.isCancellationRequested) {
      throw toExtensionManagementError(new CancellationError());
    }
    if (!local) {
      const result2 = await this.extractExtensionFn(this.operation, token);
      local = result2.local;
      this._verificationStatus = result2.verificationStatus;
    }
    if (this.uriIdentityService.extUri.isEqual(this.userDataProfilesService.defaultProfile.extensionsResource, this.options.profileLocation)) {
      try {
        await this.extensionsScannerService.initializeDefaultProfileExtensions();
      } catch (error) {
        throw toExtensionManagementError(error, ExtensionManagementErrorCode.IntializeDefaultProfile);
      }
    }
    if (token.isCancellationRequested) {
      throw toExtensionManagementError(new CancellationError());
    }
    try {
      await this.extensionsProfileScannerService.addExtensionsToProfile([[local, metadata]], this.options.profileLocation, !local.isValid);
    } catch (error) {
      throw toExtensionManagementError(error, ExtensionManagementErrorCode.AddToProfile);
    }
    const result = await this.extensionsScanner.scanLocalExtension(local.location, ExtensionType.User, this.options.profileLocation);
    if (!result) {
      throw new ExtensionManagementError("Cannot find the installed extension", ExtensionManagementErrorCode.InstalledExtensionNotFound);
    }
    if (this.source instanceof URI) {
      this.updateMetadata(local, token);
    }
    return result;
  }
  async unsetIfRemoved(extensionKey) {
    const [removed] = await this.extensionsScanner.unsetExtensionsForRemoval(extensionKey);
    if (removed) {
      this.logService.info("Removed the extension from removed list:", extensionKey.id);
      const userExtensions = await this.extensionsScanner.scanAllUserExtensions();
      return userExtensions.find((i) => ExtensionKey.create(i).equals(extensionKey));
    }
    return void 0;
  }
  async updateMetadata(extension, token) {
    try {
      let [galleryExtension] = await this.galleryService.getExtensions([{ id: extension.identifier.id, version: extension.manifest.version }], token);
      if (!galleryExtension) {
        [galleryExtension] = await this.galleryService.getExtensions([{ id: extension.identifier.id }], token);
      }
      if (galleryExtension) {
        const metadata = {
          id: galleryExtension.identifier.uuid,
          publisherDisplayName: galleryExtension.publisherDisplayName,
          publisherId: galleryExtension.publisherId,
          isPreReleaseVersion: galleryExtension.properties.isPreReleaseVersion,
          hasPreReleaseVersion: extension.hasPreReleaseVersion || galleryExtension.properties.isPreReleaseVersion,
          preRelease: galleryExtension.properties.isPreReleaseVersion || this.options.installPreReleaseVersion
        };
        await this.extensionsScanner.updateMetadata(extension, metadata, this.options.profileLocation);
      }
    } catch (error) {
    }
  }
};
InstallExtensionInProfileTask = __decorateClass([
  __decorateParam(6, IUriIdentityService),
  __decorateParam(7, IExtensionGalleryService),
  __decorateParam(8, IUserDataProfilesService),
  __decorateParam(9, IExtensionsScannerService),
  __decorateParam(10, IExtensionsProfileScannerService),
  __decorateParam(11, IProductService),
  __decorateParam(12, ILogService)
], InstallExtensionInProfileTask);
class UninstallExtensionInProfileTask extends AbstractExtensionTask {
  constructor(extension, options, extensionsProfileScannerService) {
    super();
    this.extension = extension;
    this.options = options;
    this.extensionsProfileScannerService = extensionsProfileScannerService;
  }
  doRun(token) {
    return this.extensionsProfileScannerService.removeExtensionsFromProfile([this.extension.identifier], this.options.profileLocation);
  }
}
export {
  ExtensionManagementService,
  ExtensionsScanner,
  INativeServerExtensionManagementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcbm9kZVxcZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgUXVldWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBnZXRFcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAsIFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgKiBhcyBzZW12ZXIgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc2VtdmVyL3NlbXZlci5qcyc7XG5pbXBvcnQgeyBpc0Jvb2xlYW4sIGlzRGVmaW5lZCwgaXNVbmRlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgKiBhcyBwZnMgZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBleHRyYWN0LCBJRmlsZSwgemlwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3ppcC5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElEb3dubG9hZFNlcnZpY2UgfSBmcm9tICcuLi8uLi9kb3dubG9hZC9jb21tb24vZG93bmxvYWQuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSwgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBBYnN0cmFjdEV4dGVuc2lvblRhc2ssIElJbnN0YWxsRXh0ZW5zaW9uVGFzaywgSW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zLCBJVW5pbnN0YWxsRXh0ZW5zaW9uVGFzaywgdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IsIFVuaW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zIH0gZnJvbSAnLi4vY29tbW9uL2Fic3RyYWN0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHtcblx0RXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLCBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIElFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElHYWxsZXJ5RXh0ZW5zaW9uLCBJTG9jYWxFeHRlbnNpb24sIEluc3RhbGxPcGVyYXRpb24sXG5cdE1ldGFkYXRhLCBJbnN0YWxsT3B0aW9ucyxcblx0SVByb2R1Y3RWZXJzaW9uLFxuXHRFWFRFTlNJT05fSU5TVEFMTF9DTElFTlRfVEFSR0VUX1BMQVRGT1JNX0NPTlRFWFQsXG5cdEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUsXG5cdGNvbXB1dGVTaXplLFxuXHRJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLFxuXHRWZXJpZnlFeHRlbnNpb25TaWduYXR1cmVDb25maWdLZXksXG5cdHNob3VsZFJlcXVpcmVSZXBvc2l0b3J5U2lnbmF0dXJlRm9yLFxufSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucywgY29tcHV0ZVRhcmdldFBsYXRmb3JtLCBFeHRlbnNpb25LZXksIGdldEdhbGxlcnlFeHRlbnNpb25JZCwgZ3JvdXBCeUV4dGVuc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSwgSVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSwgSVNjYW5uZWRFeHRlbnNpb24sIE1hbmlmZXN0TWV0YWRhdGEsIFVzZXJFeHRlbnNpb25zU2Nhbk9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNEb3dubG9hZGVyIH0gZnJvbSAnLi9leHRlbnNpb25Eb3dubG9hZGVyLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNMaWZlY3ljbGUgfSBmcm9tICcuL2V4dGVuc2lvbkxpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBmcm9tRXh0cmFjdEVycm9yLCBnZXRNYW5pZmVzdCB9IGZyb20gJy4vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc01hbmlmZXN0Q2FjaGUgfSBmcm9tICcuL2V4dGVuc2lvbnNNYW5pZmVzdENhY2hlLmpzJztcbmltcG9ydCB7IERpZENoYW5nZVByb2ZpbGVFeHRlbnNpb25zRXZlbnQsIEV4dGVuc2lvbnNXYXRjaGVyIH0gZnJvbSAnLi9leHRlbnNpb25zV2F0Y2hlci5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25UeXBlLCBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uTWFuaWZlc3QsIFRhcmdldFBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBpc0VuZ2luZVZhbGlkIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uVmFsaWRhdG9yLmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VzRXZlbnQsIEZpbGVDaGFuZ2VUeXBlLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdCwgdG9GaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgcmVmaW5lU2VydmljZURlY29yYXRvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QuanMnO1xuXG5leHBvcnQgY29uc3QgSU5hdGl2ZVNlcnZlckV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlID0gcmVmaW5lU2VydmljZURlY29yYXRvcjxJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElOYXRpdmVTZXJ2ZXJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZT4oSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlKTtcbmV4cG9ydCBpbnRlcmZhY2UgSU5hdGl2ZVNlcnZlckV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRzY2FuQWxsVXNlckluc3RhbGxlZEV4dGVuc2lvbnMoKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT47XG5cdHNjYW5JbnN0YWxsZWRFeHRlbnNpb25BdExvY2F0aW9uKGxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbiB8IG51bGw+O1xuXHRkZWxldGVFeHRlbnNpb25zKC4uLmV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSk6IFByb21pc2U8dm9pZD47XG59XG5cbnR5cGUgRXh0cmFjdEV4dGVuc2lvblJlc3VsdCA9IHsgcmVhZG9ubHkgbG9jYWw6IElMb2NhbEV4dGVuc2lvbjsgcmVhZG9ubHkgdmVyaWZpY2F0aW9uU3RhdHVzPzogRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZSB9O1xuXG5jb25zdCBERUxFVEVEX0ZPTERFUl9QT1NURklYID0gJy52c2N0bXAnO1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGltcGxlbWVudHMgSU5hdGl2ZVNlcnZlckV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNTY2FubmVyOiBFeHRlbnNpb25zU2Nhbm5lcjtcblx0cHJpdmF0ZSByZWFkb25seSBtYW5pZmVzdENhY2hlOiBFeHRlbnNpb25zTWFuaWZlc3RDYWNoZTtcblx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zRG93bmxvYWRlcjogRXh0ZW5zaW9uc0Rvd25sb2FkZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBleHRyYWN0aW5nR2FsbGVyeUV4dGVuc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxFeHRyYWN0RXh0ZW5zaW9uUmVzdWx0Pj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIGdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNTY2FubmVyU2VydmljZTogSUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSxcblx0XHRASURvd25sb2FkU2VydmljZSBwcml2YXRlIGRvd25sb2FkU2VydmljZTogSURvd25sb2FkU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihnYWxsZXJ5U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uTGlmZWN5Y2xlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc0xpZmVjeWNsZSkpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zU2Nhbm5lciwgZXh0ZW5zaW9uID0+IGV4dGVuc2lvbkxpZmVjeWNsZS5wb3N0VW5pbnN0YWxsKGV4dGVuc2lvbikpKTtcblx0XHR0aGlzLm1hbmlmZXN0Q2FjaGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRXh0ZW5zaW9uc01hbmlmZXN0Q2FjaGUodXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIGZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIHRoaXMsIHRoaXMubG9nU2VydmljZSkpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uc0Rvd25sb2FkZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zRG93bmxvYWRlcikpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1dhdGNoZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRXh0ZW5zaW9uc1dhdGNoZXIodGhpcywgdGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCBleHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZXh0ZW5zaW9uc1dhdGNoZXIub25EaWRDaGFuZ2VFeHRlbnNpb25zQnlBbm90aGVyU291cmNlKGUgPT4gdGhpcy5vbkRpZENoYW5nZUV4dGVuc2lvbnNGcm9tQW5vdGhlclNvdXJjZShlKSkpO1xuXHRcdHRoaXMud2F0Y2hGb3JFeHRlbnNpb25zTm90SW5zdGFsbGVkQnlTeXN0ZW0oKTtcblx0fVxuXG5cdHByaXZhdGUgX3RhcmdldFBsYXRmb3JtUHJvbWlzZTogUHJvbWlzZTxUYXJnZXRQbGF0Zm9ybT4gfCB1bmRlZmluZWQ7XG5cdGdldFRhcmdldFBsYXRmb3JtKCk6IFByb21pc2U8VGFyZ2V0UGxhdGZvcm0+IHtcblx0XHRpZiAoIXRoaXMuX3RhcmdldFBsYXRmb3JtUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fdGFyZ2V0UGxhdGZvcm1Qcm9taXNlID0gY29tcHV0ZVRhcmdldFBsYXRmb3JtKHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90YXJnZXRQbGF0Zm9ybVByb21pc2U7XG5cdH1cblxuXHRhc3luYyB6aXAoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPFVSST4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UjemlwJywgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdGNvbnN0IGZpbGVzID0gYXdhaXQgdGhpcy5jb2xsZWN0RmlsZXMoZXh0ZW5zaW9uKTtcblx0XHRjb25zdCBsb2NhdGlvbiA9IGF3YWl0IHppcChqb2luUGF0aCh0aGlzLmV4dGVuc2lvbnNEb3dubG9hZGVyLmV4dGVuc2lvbnNEb3dubG9hZERpciwgZ2VuZXJhdGVVdWlkKCkpLmZzUGF0aCwgZmlsZXMpO1xuXHRcdHJldHVybiBVUkkuZmlsZShsb2NhdGlvbik7XG5cdH1cblxuXHRhc3luYyBnZXRNYW5pZmVzdCh2c2l4OiBVUkkpOiBQcm9taXNlPElFeHRlbnNpb25NYW5pZmVzdD4ge1xuXHRcdGNvbnN0IHsgbG9jYXRpb24sIGNsZWFudXAgfSA9IGF3YWl0IHRoaXMuZG93bmxvYWRWc2l4KHZzaXgpO1xuXHRcdGNvbnN0IHppcFBhdGggPSBwYXRoLnJlc29sdmUobG9jYXRpb24uZnNQYXRoKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IGdldE1hbmlmZXN0KHppcFBhdGgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBjbGVhbnVwKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0SW5zdGFsbGVkKHR5cGU/OiBFeHRlbnNpb25UeXBlLCBwcm9maWxlTG9jYXRpb246IFVSSSA9IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLCBwcm9kdWN0VmVyc2lvbjogSVByb2R1Y3RWZXJzaW9uID0geyB2ZXJzaW9uOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIGRhdGU6IHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSB9LCBsYW5ndWFnZT86IHN0cmluZyk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zU2Nhbm5lci5zY2FuRXh0ZW5zaW9ucyh0eXBlID8/IG51bGwsIHByb2ZpbGVMb2NhdGlvbiwgcHJvZHVjdFZlcnNpb24sIGxhbmd1YWdlKTtcblx0fVxuXG5cdHNjYW5BbGxVc2VySW5zdGFsbGVkRXh0ZW5zaW9ucygpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuc2NhbkFsbFVzZXJFeHRlbnNpb25zKCk7XG5cdH1cblxuXHRzY2FuSW5zdGFsbGVkRXh0ZW5zaW9uQXRMb2NhdGlvbihsb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24gfCBudWxsPiB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuc2NhblVzZXJFeHRlbnNpb25BdExvY2F0aW9uKGxvY2F0aW9uKTtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGwodnNpeDogVVJJLCBvcHRpb25zOiBJbnN0YWxsT3B0aW9ucyA9IHt9KTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlI2luc3RhbGwnLCB2c2l4LnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3QgeyBsb2NhdGlvbiwgY2xlYW51cCB9ID0gYXdhaXQgdGhpcy5kb3dubG9hZFZzaXgodnNpeCk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdChwYXRoLnJlc29sdmUobG9jYXRpb24uZnNQYXRoKSk7XG5cdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpO1xuXHRcdFx0aWYgKG1hbmlmZXN0LmVuZ2luZXMgJiYgbWFuaWZlc3QuZW5naW5lcy52c2NvZGUgJiYgIWlzRW5naW5lVmFsaWQobWFuaWZlc3QuZW5naW5lcy52c2NvZGUsIHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdpbmNvbXBhdGlibGUnLCBcIlVuYWJsZSB0byBpbnN0YWxsIGV4dGVuc2lvbiAnezB9JyBhcyBpdCBpcyBub3QgY29tcGF0aWJsZSB3aXRoIFZTIENvZGUgJ3sxfScuXCIsIGV4dGVuc2lvbklkLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24pKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWxsb3dlZFRvSW5zdGFsbCA9IHRoaXMuYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmlzQWxsb3dlZCh7IGlkOiBleHRlbnNpb25JZCwgdmVyc2lvbjogbWFuaWZlc3QudmVyc2lvbiwgcHVibGlzaGVyRGlzcGxheU5hbWU6IHVuZGVmaW5lZCB9KTtcblx0XHRcdGlmIChhbGxvd2VkVG9JbnN0YWxsICE9PSB0cnVlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ25vdEFsbG93ZWQnLCBcIlRoaXMgZXh0ZW5zaW9uIGNhbm5vdCBiZSBpbnN0YWxsZWQgYmVjYXVzZSB7MH1cIiwgYWxsb3dlZFRvSW5zdGFsbC52YWx1ZSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5pbnN0YWxsRXh0ZW5zaW9ucyhbeyBtYW5pZmVzdCwgZXh0ZW5zaW9uOiBsb2NhdGlvbiwgb3B0aW9ucyB9XSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXN1bHRzLmZpbmQoKHsgaWRlbnRpZmllciB9KSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpZGVudGlmaWVyLCB7IGlkOiBleHRlbnNpb25JZCB9KSk7XG5cdFx0XHRpZiAocmVzdWx0Py5sb2NhbCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0LmxvY2FsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdD8uZXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgcmVzdWx0LmVycm9yO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmV3IEVycm9yKGBVbmtub3duIGVycm9yIHdoaWxlIGluc3RhbGxpbmcgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uSWR9YCkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBjbGVhbnVwKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgaW5zdGFsbEZyb21Mb2NhdGlvbihsb2NhdGlvbjogVVJJLCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSNpbnN0YWxsRnJvbUxvY2F0aW9uJywgbG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgbG9jYWwgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnNjYW5Vc2VyRXh0ZW5zaW9uQXRMb2NhdGlvbihsb2NhdGlvbik7XG5cdFx0aWYgKCFsb2NhbCB8fCAhbG9jYWwubWFuaWZlc3QubmFtZSB8fCAhbG9jYWwubWFuaWZlc3QudmVyc2lvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZmluZCBhIHZhbGlkIGV4dGVuc2lvbiBmcm9tIHRoZSBsb2NhdGlvbiAke2xvY2F0aW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuYWRkRXh0ZW5zaW9uc1RvUHJvZmlsZShbW2xvY2FsLCB7IHNvdXJjZTogJ3Jlc291cmNlJyB9XV0sIHByb2ZpbGVMb2NhdGlvbik7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1N1Y2Nlc3NmdWxseSBpbnN0YWxsZWQgZXh0ZW5zaW9uJywgbG9jYWwuaWRlbnRpZmllci5pZCwgcHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdHJldHVybiBsb2NhbDtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGxFeHRlbnNpb25zRnJvbVByb2ZpbGUoZXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UjaW5zdGFsbEV4dGVuc2lvbnNGcm9tUHJvZmlsZScsIGV4dGVuc2lvbnMsIGZyb21Qcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKSwgdG9Qcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvSW5zdGFsbCA9IChhd2FpdCB0aGlzLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIsIGZyb21Qcm9maWxlTG9jYXRpb24pKS5maWx0ZXIoZSA9PiBleHRlbnNpb25zLnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaWQsIGUuaWRlbnRpZmllcikpKTtcblx0XHRpZiAoZXh0ZW5zaW9uc1RvSW5zdGFsbC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgUHJvbWlzZS5hbGwoZXh0ZW5zaW9uc1RvSW5zdGFsbC5tYXAoZSA9PiB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnNjYW5NZXRhZGF0YShlLCBmcm9tUHJvZmlsZUxvY2F0aW9uKSkpO1xuXHRcdFx0YXdhaXQgdGhpcy5hZGRFeHRlbnNpb25zVG9Qcm9maWxlKGV4dGVuc2lvbnNUb0luc3RhbGwubWFwKChlLCBpbmRleCkgPT4gW2UsIG1ldGFkYXRhW2luZGV4XV0pLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnU3VjY2Vzc2Z1bGx5IGluc3RhbGxlZCBleHRlbnNpb25zJywgZXh0ZW5zaW9uc1RvSW5zdGFsbC5tYXAoZSA9PiBlLmlkZW50aWZpZXIuaWQpLCB0b1Byb2ZpbGVMb2NhdGlvbi50b1N0cmluZygpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4dGVuc2lvbnNUb0luc3RhbGw7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVNZXRhZGF0YShsb2NhbDogSUxvY2FsRXh0ZW5zaW9uLCBtZXRhZGF0YTogUGFydGlhbDxNZXRhZGF0YT4sIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlI3VwZGF0ZU1ldGFkYXRhJywgbG9jYWwuaWRlbnRpZmllci5pZCk7XG5cdFx0aWYgKG1ldGFkYXRhLmlzUHJlUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdG1ldGFkYXRhLnByZVJlbGVhc2UgPSB0cnVlO1xuXHRcdFx0bWV0YWRhdGEuaGFzUHJlUmVsZWFzZVZlcnNpb24gPSB0cnVlO1xuXHRcdH1cblx0XHQvLyB1bnNldCBpZiBmYWxzZVxuXHRcdGlmIChtZXRhZGF0YS5pc01hY2hpbmVTY29wZWQgPT09IGZhbHNlKSB7XG5cdFx0XHRtZXRhZGF0YS5pc01hY2hpbmVTY29wZWQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChtZXRhZGF0YS5pc0J1aWx0aW4gPT09IGZhbHNlKSB7XG5cdFx0XHRtZXRhZGF0YS5pc0J1aWx0aW4gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChtZXRhZGF0YS5waW5uZWQgPT09IGZhbHNlKSB7XG5cdFx0XHRtZXRhZGF0YS5waW5uZWQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxvY2FsID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lci51cGRhdGVNZXRhZGF0YShsb2NhbCwgbWV0YWRhdGEsIHByb2ZpbGVMb2NhdGlvbik7XG5cdFx0dGhpcy5tYW5pZmVzdENhY2hlLmludmFsaWRhdGUocHJvZmlsZUxvY2F0aW9uKTtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhLmZpcmUoeyBsb2NhbCwgcHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdHJldHVybiBsb2NhbDtcblx0fVxuXG5cdHByb3RlY3RlZCBkZWxldGVFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zU2Nhbm5lci5kZWxldGVFeHRlbnNpb24oZXh0ZW5zaW9uLCAncmVtb3ZlJyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY29weUV4dGVuc2lvbihleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJLCBtZXRhZGF0YTogUGFydGlhbDxNZXRhZGF0YT4pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLmNvcHlFeHRlbnNpb24oZXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uLCB0b1Byb2ZpbGVMb2NhdGlvbiwgbWV0YWRhdGEpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG1vdmVFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSwgbWV0YWRhdGE6IFBhcnRpYWw8TWV0YWRhdGE+KTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zU2Nhbm5lci5tb3ZlRXh0ZW5zaW9uKGV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbiwgdG9Qcm9maWxlTG9jYXRpb24sIG1ldGFkYXRhKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZW1vdmVFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnJlbW92ZUV4dGVuc2lvbihleHRlbnNpb24uaWRlbnRpZmllciwgZnJvbVByb2ZpbGVMb2NhdGlvbik7XG5cdH1cblxuXHRjb3B5RXh0ZW5zaW9ucyhmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zU2Nhbm5lci5jb3B5RXh0ZW5zaW9ucyhmcm9tUHJvZmlsZUxvY2F0aW9uLCB0b1Byb2ZpbGVMb2NhdGlvbiwgeyB2ZXJzaW9uOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIGRhdGU6IHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSB9KTtcblx0fVxuXG5cdGRlbGV0ZUV4dGVuc2lvbnMoLi4uZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuc2V0RXh0ZW5zaW9uc0ZvclJlbW92YWwoLi4uZXh0ZW5zaW9ucyk7XG5cdH1cblxuXHRhc3luYyBjbGVhblVwKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UjY2xlYW5VcCcpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLmNsZWFuVXAoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBkb3dubG9hZChleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24sIGRvbm90VmVyaWZ5U2lnbmF0dXJlOiBib29sZWFuKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCB7IGxvY2F0aW9uIH0gPSBhd2FpdCB0aGlzLmRvd25sb2FkRXh0ZW5zaW9uKGV4dGVuc2lvbiwgb3BlcmF0aW9uLCAhZG9ub3RWZXJpZnlTaWduYXR1cmUpO1xuXHRcdHJldHVybiBsb2NhdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG93bmxvYWRWc2l4KHZzaXg6IFVSSSk6IFByb21pc2U8eyBsb2NhdGlvbjogVVJJOyBjbGVhbnVwOiAoKSA9PiBQcm9taXNlPHZvaWQ+IH0+IHtcblx0XHRpZiAodnNpeC5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0cmV0dXJuIHsgbG9jYXRpb246IHZzaXgsIGFzeW5jIGNsZWFudXAoKSB7IH0gfTtcblx0XHR9XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdEb3dubG9hZGluZyBleHRlbnNpb24gZnJvbScsIHZzaXgudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSBqb2luUGF0aCh0aGlzLmV4dGVuc2lvbnNEb3dubG9hZGVyLmV4dGVuc2lvbnNEb3dubG9hZERpciwgZ2VuZXJhdGVVdWlkKCkpO1xuXHRcdGF3YWl0IHRoaXMuZG93bmxvYWRTZXJ2aWNlLmRvd25sb2FkKHZzaXgsIGxvY2F0aW9uLCAnZXh0ZW5zaW9uTWFuYWdlbWVudC5kb3dubG9hZFZzaXgnKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnRG93bmxvYWRlZCBleHRlbnNpb24gdG8nLCBsb2NhdGlvbi50b1N0cmluZygpKTtcblx0XHRjb25zdCBjbGVhbnVwID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwobG9jYXRpb24pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHJldHVybiB7IGxvY2F0aW9uLCBjbGVhbnVwIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0Q3VycmVudEV4dGVuc2lvbnNNYW5pZmVzdExvY2F0aW9uKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUluc3RhbGxFeHRlbnNpb25UYXNrKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QsIGV4dGVuc2lvbjogVVJJIHwgSUdhbGxlcnlFeHRlbnNpb24sIG9wdGlvbnM6IEluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyk6IElJbnN0YWxsRXh0ZW5zaW9uVGFzayB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uS2V5ID0gZXh0ZW5zaW9uIGluc3RhbmNlb2YgVVJJID8gbmV3IEV4dGVuc2lvbktleSh7IGlkOiBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKSB9LCBtYW5pZmVzdC52ZXJzaW9uKSA6IEV4dGVuc2lvbktleS5jcmVhdGUoZXh0ZW5zaW9uKTtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsRXh0ZW5zaW9uSW5Qcm9maWxlVGFzaywgZXh0ZW5zaW9uS2V5LCBtYW5pZmVzdCwgZXh0ZW5zaW9uLCBvcHRpb25zLCAob3BlcmF0aW9uLCB0b2tlbikgPT4ge1xuXHRcdFx0aWYgKGV4dGVuc2lvbiBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5leHRyYWN0VlNJWChleHRlbnNpb25LZXksIGV4dGVuc2lvbiwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHByb21pc2UgPSB0aGlzLmV4dHJhY3RpbmdHYWxsZXJ5RXh0ZW5zaW9ucy5nZXQoZXh0ZW5zaW9uS2V5LnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKCFwcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMuZXh0cmFjdGluZ0dhbGxlcnlFeHRlbnNpb25zLnNldChleHRlbnNpb25LZXkudG9TdHJpbmcoKSwgcHJvbWlzZSA9IHRoaXMuZG93bmxvYWRBbmRFeHRyYWN0R2FsbGVyeUV4dGVuc2lvbihleHRlbnNpb25LZXksIGV4dGVuc2lvbiwgb3BlcmF0aW9uLCBvcHRpb25zLCB0b2tlbikpO1xuXHRcdFx0XHRwcm9taXNlLmZpbmFsbHkoKCkgPT4gdGhpcy5leHRyYWN0aW5nR2FsbGVyeUV4dGVuc2lvbnMuZGVsZXRlKGV4dGVuc2lvbktleS50b1N0cmluZygpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcHJvbWlzZTtcblx0XHR9LCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVVbmluc3RhbGxFeHRlbnNpb25UYXNrKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBvcHRpb25zOiBVbmluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyk6IElVbmluc3RhbGxFeHRlbnNpb25UYXNrIHtcblx0XHRyZXR1cm4gbmV3IFVuaW5zdGFsbEV4dGVuc2lvbkluUHJvZmlsZVRhc2soZXh0ZW5zaW9uLCBvcHRpb25zLCB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb3dubG9hZEFuZEV4dHJhY3RHYWxsZXJ5RXh0ZW5zaW9uKGV4dGVuc2lvbktleTogRXh0ZW5zaW9uS2V5LCBnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbiwgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLCBvcHRpb25zOiBJbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RXh0cmFjdEV4dGVuc2lvblJlc3VsdD4ge1xuXHRcdGNvbnN0IHsgdmVyaWZpY2F0aW9uU3RhdHVzLCBsb2NhdGlvbiB9ID0gYXdhaXQgdGhpcy5kb3dubG9hZEV4dGVuc2lvbihnYWxsZXJ5LCBvcGVyYXRpb24sICFvcHRpb25zLmRvbm90VmVyaWZ5U2lnbmF0dXJlLCBvcHRpb25zLmNvbnRleHQ/LltFWFRFTlNJT05fSU5TVEFMTF9DTElFTlRfVEFSR0VUX1BMQVRGT1JNX0NPTlRFWFRdIGFzIFRhcmdldFBsYXRmb3JtIHwgdW5kZWZpbmVkKTtcblx0XHR0cnkge1xuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHZhbGlkYXRlIG1hbmlmZXN0XG5cdFx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KGxvY2F0aW9uLmZzUGF0aCk7XG5cdFx0XHRpZiAoIW5ldyBFeHRlbnNpb25LZXkoZ2FsbGVyeS5pZGVudGlmaWVyLCBnYWxsZXJ5LnZlcnNpb24pLmVxdWFscyhuZXcgRXh0ZW5zaW9uS2V5KHsgaWQ6IGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpIH0sIG1hbmlmZXN0LnZlcnNpb24pKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZE1hbmlmZXN0JywgXCJDYW5ub3QgaW5zdGFsbCAnezB9JyBleHRlbnNpb24gYmVjYXVzZSBvZiBtYW5pZmVzdCBtaXNtYXRjaCB3aXRoIE1hcmtldHBsYWNlXCIsIGdhbGxlcnkuaWRlbnRpZmllci5pZCksIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuSW52YWxpZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxvY2FsID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lci5leHRyYWN0VXNlckV4dGVuc2lvbihcblx0XHRcdFx0ZXh0ZW5zaW9uS2V5LFxuXHRcdFx0XHRsb2NhdGlvbi5mc1BhdGgsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHR0b2tlbik7XG5cblx0XHRcdGlmICh2ZXJpZmljYXRpb25TdGF0dXMgIT09IEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUuU3VjY2VzcyAmJiB0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0J1aWx0KSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zRG93bmxvYWRlci5kZWxldGUobG9jYXRpb24pO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0LyogSWdub3JlICovXG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEVycm9yIHdoaWxlIGRlbGV0aW5nIHRoZSBkb3dubG9hZGVkIGZpbGVgLCBsb2NhdGlvbi50b1N0cmluZygpLCBnZXRFcnJvck1lc3NhZ2UoZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IGxvY2FsLCB2ZXJpZmljYXRpb25TdGF0dXMgfTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zRG93bmxvYWRlci5kZWxldGUobG9jYXRpb24pO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvKiBJZ25vcmUgKi9cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEVycm9yIHdoaWxlIGRlbGV0aW5nIHRoZSBkb3dubG9hZGVkIGZpbGVgLCBsb2NhdGlvbi50b1N0cmluZygpLCBnZXRFcnJvck1lc3NhZ2UoZSkpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG93bmxvYWRFeHRlbnNpb24oZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLCB2ZXJpZnlTaWduYXR1cmU6IGJvb2xlYW4sIGNsaWVudFRhcmdldFBsYXRmb3JtPzogVGFyZ2V0UGxhdGZvcm0pOiBQcm9taXNlPHsgcmVhZG9ubHkgbG9jYXRpb246IFVSSTsgcmVhZG9ubHkgdmVyaWZpY2F0aW9uU3RhdHVzOiBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRpZiAodmVyaWZ5U2lnbmF0dXJlKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVmVyaWZ5RXh0ZW5zaW9uU2lnbmF0dXJlQ29uZmlnS2V5KTtcblx0XHRcdHZlcmlmeVNpZ25hdHVyZSA9IGlzQm9vbGVhbih2YWx1ZSkgPyB2YWx1ZSA6IHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHsgbG9jYXRpb24sIHZlcmlmaWNhdGlvblN0YXR1cyB9ID0gYXdhaXQgdGhpcy5leHRlbnNpb25zRG93bmxvYWRlci5kb3dubG9hZChleHRlbnNpb24sIG9wZXJhdGlvbiwgdmVyaWZ5U2lnbmF0dXJlLCBjbGllbnRUYXJnZXRQbGF0Zm9ybSk7XG5cdFx0Y29uc3Qgc2hvdWxkUmVxdWlyZVNpZ25hdHVyZSA9IHNob3VsZFJlcXVpcmVSZXBvc2l0b3J5U2lnbmF0dXJlRm9yKGV4dGVuc2lvbi5wcml2YXRlLCBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KCkpO1xuXG5cdFx0aWYgKFxuXHRcdFx0dmVyaWZpY2F0aW9uU3RhdHVzICE9PSBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlLlN1Y2Nlc3Ncblx0XHRcdCYmICEodmVyaWZpY2F0aW9uU3RhdHVzID09PSBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlLk5vdFNpZ25lZCAmJiAhc2hvdWxkUmVxdWlyZVNpZ25hdHVyZSlcblx0XHRcdCYmIHZlcmlmeVNpZ25hdHVyZVxuXHRcdFx0JiYgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdFxuXHRcdFx0JiYgKGF3YWl0IHRoaXMuZ2V0VGFyZ2V0UGxhdGZvcm0oKSkgIT09IFRhcmdldFBsYXRmb3JtLkxJTlVYX0FSTUhGXG5cdFx0KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNEb3dubG9hZGVyLmRlbGV0ZShsb2NhdGlvbik7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8qIElnbm9yZSAqL1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRXJyb3Igd2hpbGUgZGVsZXRpbmcgdGhlIGRvd25sb2FkZWQgZmlsZWAsIGxvY2F0aW9uLnRvU3RyaW5nKCksIGdldEVycm9yTWVzc2FnZShlKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdmVyaWZpY2F0aW9uU3RhdHVzKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmxzLmxvY2FsaXplKCdzaWduYXR1cmUgdmVyaWZpY2F0aW9uIG5vdCBleGVjdXRlZCcsIFwiU2lnbmF0dXJlIHZlcmlmaWNhdGlvbiB3YXMgbm90IGV4ZWN1dGVkLlwiKSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5TaWduYXR1cmVWZXJpZmljYXRpb25JbnRlcm5hbCk7XG5cdFx0XHR9XG5cblx0XHRcdHN3aXRjaCAodmVyaWZpY2F0aW9uU3RhdHVzKSB7XG5cdFx0XHRcdGNhc2UgRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5QYWNrYWdlSW50ZWdyaXR5Q2hlY2tGYWlsZWQ6XG5cdFx0XHRcdGNhc2UgRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5TaWduYXR1cmVJc0ludmFsaWQ6XG5cdFx0XHRcdGNhc2UgRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5TaWduYXR1cmVNYW5pZmVzdElzSW52YWxpZDpcblx0XHRcdFx0Y2FzZSBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlLlNpZ25hdHVyZUludGVncml0eUNoZWNrRmFpbGVkOlxuXHRcdFx0XHRjYXNlIEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUuRW50cnlJc01pc3Npbmc6XG5cdFx0XHRcdGNhc2UgRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5FbnRyeUlzVGFtcGVyZWQ6XG5cdFx0XHRcdGNhc2UgRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5VbnRydXN0ZWQ6XG5cdFx0XHRcdGNhc2UgRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5DZXJ0aWZpY2F0ZVJldm9rZWQ6XG5cdFx0XHRcdGNhc2UgRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5TaWduYXR1cmVJc05vdFZhbGlkOlxuXHRcdFx0XHRjYXNlIEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUuU2lnbmF0dXJlQXJjaGl2ZUhhc1Rvb01hbnlFbnRyaWVzOlxuXHRcdFx0XHRjYXNlIEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUuTm90U2lnbmVkOlxuXHRcdFx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IobmxzLmxvY2FsaXplKCdzaWduYXR1cmUgdmVyaWZpY2F0aW9uIGZhaWxlZCcsIFwiU2lnbmF0dXJlIHZlcmlmaWNhdGlvbiBmYWlsZWQgd2l0aCAnezB9JyBlcnJvci5cIiwgdmVyaWZpY2F0aW9uU3RhdHVzKSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5TaWduYXR1cmVWZXJpZmljYXRpb25GYWlsZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKG5scy5sb2NhbGl6ZSgnc2lnbmF0dXJlIHZlcmlmaWNhdGlvbiBmYWlsZWQnLCBcIlNpZ25hdHVyZSB2ZXJpZmljYXRpb24gZmFpbGVkIHdpdGggJ3swfScgZXJyb3IuXCIsIHZlcmlmaWNhdGlvblN0YXR1cyksIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuU2lnbmF0dXJlVmVyaWZpY2F0aW9uSW50ZXJuYWwpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGxvY2F0aW9uLCB2ZXJpZmljYXRpb25TdGF0dXMgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZXh0cmFjdFZTSVgoZXh0ZW5zaW9uS2V5OiBFeHRlbnNpb25LZXksIGxvY2F0aW9uOiBVUkksIG9wdGlvbnM6IEluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxFeHRyYWN0RXh0ZW5zaW9uUmVzdWx0PiB7XG5cdFx0Y29uc3QgbG9jYWwgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLmV4dHJhY3RVc2VyRXh0ZW5zaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uS2V5LFxuXHRcdFx0cGF0aC5yZXNvbHZlKGxvY2F0aW9uLmZzUGF0aCksXG5cdFx0XHRpc0Jvb2xlYW4ob3B0aW9ucy5rZWVwRXhpc3RpbmcpID8gIW9wdGlvbnMua2VlcEV4aXN0aW5nIDogdHJ1ZSxcblx0XHRcdHRva2VuKTtcblx0XHRyZXR1cm4geyBsb2NhbCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb2xsZWN0RmlsZXMoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPElGaWxlW10+IHtcblxuXHRcdGNvbnN0IGNvbGxlY3RGaWxlc0Zyb21EaXJlY3RvcnkgPSBhc3luYyAoZGlyOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiA9PiB7XG5cdFx0XHRsZXQgZW50cmllcyA9IGF3YWl0IHBmcy5Qcm9taXNlcy5yZWFkZGlyKGRpcik7XG5cdFx0XHRlbnRyaWVzID0gZW50cmllcy5tYXAoZSA9PiBwYXRoLmpvaW4oZGlyLCBlKSk7XG5cdFx0XHRjb25zdCBzdGF0cyA9IGF3YWl0IFByb21pc2UuYWxsKGVudHJpZXMubWFwKGUgPT4gZnMucHJvbWlzZXMuc3RhdChlKSkpO1xuXHRcdFx0bGV0IHByb21pc2U6IFByb21pc2U8c3RyaW5nW10+ID0gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHRcdHN0YXRzLmZvckVhY2goKHN0YXQsIGluZGV4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gZW50cmllc1tpbmRleF07XG5cdFx0XHRcdGlmIChzdGF0LmlzRmlsZSgpKSB7XG5cdFx0XHRcdFx0cHJvbWlzZSA9IHByb21pc2UudGhlbihyZXN1bHQgPT4gKFsuLi5yZXN1bHQsIGVudHJ5XSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5KCkpIHtcblx0XHRcdFx0XHRwcm9taXNlID0gcHJvbWlzZVxuXHRcdFx0XHRcdFx0LnRoZW4ocmVzdWx0ID0+IGNvbGxlY3RGaWxlc0Zyb21EaXJlY3RvcnkoZW50cnkpXG5cdFx0XHRcdFx0XHRcdC50aGVuKGZpbGVzID0+IChbLi4ucmVzdWx0LCAuLi5maWxlc10pKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHByb21pc2U7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGZpbGVzID0gYXdhaXQgY29sbGVjdEZpbGVzRnJvbURpcmVjdG9yeShleHRlbnNpb24ubG9jYXRpb24uZnNQYXRoKTtcblx0XHRyZXR1cm4gZmlsZXMubWFwKGYgPT4gKHsgcGF0aDogYGV4dGVuc2lvbi8ke3BhdGgucmVsYXRpdmUoZXh0ZW5zaW9uLmxvY2F0aW9uLmZzUGF0aCwgZil9YCwgbG9jYWxQYXRoOiBmIH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRDaGFuZ2VFeHRlbnNpb25zRnJvbUFub3RoZXJTb3VyY2UoeyBhZGRlZCwgcmVtb3ZlZCB9OiBEaWRDaGFuZ2VQcm9maWxlRXh0ZW5zaW9uc0V2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHJlbW92ZWQpIHtcblx0XHRcdGNvbnN0IHJlbW92ZWRFeHRlbnNpb25zID0gYWRkZWQgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocmVtb3ZlZC5wcm9maWxlTG9jYXRpb24sIGFkZGVkLnByb2ZpbGVMb2NhdGlvbilcblx0XHRcdFx0PyByZW1vdmVkLmV4dGVuc2lvbnMuZmlsdGVyKGUgPT4gYWRkZWQuZXh0ZW5zaW9ucy5ldmVyeShpZGVudGlmaWVyID0+ICFhcmVTYW1lRXh0ZW5zaW9ucyhpZGVudGlmaWVyLCBlKSkpXG5cdFx0XHRcdDogcmVtb3ZlZC5leHRlbnNpb25zO1xuXHRcdFx0Zm9yIChjb25zdCBpZGVudGlmaWVyIG9mIHJlbW92ZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdFeHRlbnNpb25zIHJlbW92ZWQgZnJvbSBhbm90aGVyIHNvdXJjZScsIGlkZW50aWZpZXIuaWQsIHJlbW92ZWQucHJvZmlsZUxvY2F0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbi5maXJlKHsgaWRlbnRpZmllciwgcHJvZmlsZUxvY2F0aW9uOiByZW1vdmVkLnByb2ZpbGVMb2NhdGlvbiB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGFkZGVkKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5nZXRJbnN0YWxsZWQoRXh0ZW5zaW9uVHlwZS5Vc2VyLCBhZGRlZC5wcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0Y29uc3QgYWRkZWRFeHRlbnNpb25zID0gZXh0ZW5zaW9ucy5maWx0ZXIoZSA9PiBhZGRlZC5leHRlbnNpb25zLnNvbWUoaWRlbnRpZmllciA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpZGVudGlmaWVyLCBlLmlkZW50aWZpZXIpKSk7XG5cdFx0XHR0aGlzLl9vbkRpZEluc3RhbGxFeHRlbnNpb25zLmZpcmUoYWRkZWRFeHRlbnNpb25zLm1hcChsb2NhbCA9PiB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdFeHRlbnNpb25zIGFkZGVkIGZyb20gYW5vdGhlciBzb3VyY2UnLCBsb2NhbC5pZGVudGlmaWVyLmlkLCBhZGRlZC5wcm9maWxlTG9jYXRpb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdHJldHVybiB7IGlkZW50aWZpZXI6IGxvY2FsLmlkZW50aWZpZXIsIGxvY2FsLCBwcm9maWxlTG9jYXRpb246IGFkZGVkLnByb2ZpbGVMb2NhdGlvbiwgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLk5vbmUgfTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGtub3duRGlyZWN0b3JpZXMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0cHJpdmF0ZSBhc3luYyB3YXRjaEZvckV4dGVuc2lvbnNOb3RJbnN0YWxsZWRCeVN5c3RlbSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbnNTY2FubmVyLm9uRXh0cmFjdChyZXNvdXJjZSA9PiB0aGlzLmtub3duRGlyZWN0b3JpZXMuYWRkKHJlc291cmNlKSkpO1xuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUodGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2UudXNlckV4dGVuc2lvbnNMb2NhdGlvbik7XG5cdFx0Zm9yIChjb25zdCBjaGlsZFN0YXQgb2Ygc3RhdC5jaGlsZHJlbiA/PyBbXSkge1xuXHRcdFx0aWYgKGNoaWxkU3RhdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHR0aGlzLmtub3duRGlyZWN0b3JpZXMuYWRkKGNoaWxkU3RhdC5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2godGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2UudXNlckV4dGVuc2lvbnNMb2NhdGlvbikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHRoaXMub25EaWRGaWxlc0NoYW5nZShlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZEZpbGVzQ2hhbmdlKGU6IEZpbGVDaGFuZ2VzRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWUuYWZmZWN0cyh0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS51c2VyRXh0ZW5zaW9uc0xvY2F0aW9uLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhZGRlZDogSUxvY2FsRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGUucmF3QWRkZWQpIHtcblx0XHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgYSBrbm93biBkaXJlY3Rvcnlcblx0XHRcdGlmICh0aGlzLmtub3duRGlyZWN0b3JpZXMuaGFzKHJlc291cmNlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSXMgbm90IGltbWVkaWF0ZSBjaGlsZCBvZiBleHRlbnNpb25zIHJlc291cmNlXG5cdFx0XHRpZiAoIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKHJlc291cmNlKSwgdGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2UudXNlckV4dGVuc2lvbnNMb2NhdGlvbikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIC5vYnNvbGV0ZSBmaWxlIGNoYW5nZWRcblx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnVzZXJFeHRlbnNpb25zTG9jYXRpb24sICcub2Jzb2xldGUnKSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElnbm9yZSBjaGFuZ2VzIHRvIGZpbGVzIHN0YXJ0aW5nIHdpdGggYC5gXG5cdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKS5zdGFydHNXaXRoKCcuJykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElnbm9yZSBjaGFuZ2VzIHRvIHRoZSBkZWxldGVkIGZvbGRlclxuXHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSkuZW5kc1dpdGgoREVMRVRFRF9GT0xERVJfUE9TVEZJWCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgYSBkaXJlY3Rvcnlcblx0XHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KHJlc291cmNlKSkuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBpZiB0aGlzIGlzIGFuIGV4dGVuc2lvbiBhZGRlZCBieSBhbm90aGVyIHNvdXJjZVxuXHRcdFx0Ly8gRXh0ZW5zaW9uIGFkZGVkIGJ5IGFub3RoZXIgc291cmNlIHdpbGwgbm90IGhhdmUgaW5zdGFsbGVkIHRpbWVzdGFtcFxuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lci5zY2FuVXNlckV4dGVuc2lvbkF0TG9jYXRpb24ocmVzb3VyY2UpO1xuXHRcdFx0aWYgKGV4dGVuc2lvbiAmJiBleHRlbnNpb24uaW5zdGFsbGVkVGltZXN0YW1wID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5rbm93bkRpcmVjdG9yaWVzLmFkZChyZXNvdXJjZSk7XG5cdFx0XHRcdGFkZGVkLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoYWRkZWQubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmFkZEV4dGVuc2lvbnNUb1Byb2ZpbGUoYWRkZWQubWFwKGUgPT4gW2UsIHVuZGVmaW5lZF0pLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnQWRkZWQgZXh0ZW5zaW9ucyB0byBkZWZhdWx0IHByb2ZpbGUgZnJvbSBleHRlcm5hbCBzb3VyY2UnLCBhZGRlZC5tYXAoZSA9PiBlLmlkZW50aWZpZXIuaWQpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFkZEV4dGVuc2lvbnNUb1Byb2ZpbGUoZXh0ZW5zaW9uczogW0lMb2NhbEV4dGVuc2lvbiwgTWV0YWRhdGEgfCB1bmRlZmluZWRdW10sIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gZXh0ZW5zaW9ucy5tYXAoZSA9PiBlWzBdKTtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnVuc2V0RXh0ZW5zaW9uc0ZvclJlbW92YWwoLi4ubG9jYWxFeHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gRXh0ZW5zaW9uS2V5LmNyZWF0ZShleHRlbnNpb24pKSk7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLmFkZEV4dGVuc2lvbnNUb1Byb2ZpbGUoZXh0ZW5zaW9ucywgcHJvZmlsZUxvY2F0aW9uKTtcblx0XHR0aGlzLl9vbkRpZEluc3RhbGxFeHRlbnNpb25zLmZpcmUobG9jYWxFeHRlbnNpb25zLm1hcChsb2NhbCA9PiAoeyBsb2NhbCwgaWRlbnRpZmllcjogbG9jYWwuaWRlbnRpZmllciwgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLk5vbmUsIHByb2ZpbGVMb2NhdGlvbiB9KSkpO1xuXHR9XG59XG5cbnR5cGUgVXBkYXRlTWV0YWRhdGFFcnJvckNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3NhbmR5MDgxJztcblx0Y29tbWVudDogJ1VwZGF0ZSBtZXRhZGF0YSBlcnJvcic7XG5cdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnZXh0ZW5zaW9uIGlkZW50aWZpZXInIH07XG5cdGNvZGU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnZXJyb3IgY29kZScgfTtcblx0aXNQcm9maWxlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lzIHdyaXRpbmcgaW50byBwcm9maWxlJyB9O1xufTtcbnR5cGUgVXBkYXRlTWV0YWRhdGFFcnJvckV2ZW50ID0ge1xuXHRleHRlbnNpb25JZDogc3RyaW5nO1xuXHRjb2RlPzogc3RyaW5nO1xuXHRpc1Byb2ZpbGU/OiBib29sZWFuO1xufTtcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNTY2FubmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBvYnNvbGV0ZWRSZXNvdXJjZTogVVJJO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9ic29sZXRlRmlsZUxpbWl0ZXI6IFF1ZXVlPElTdHJpbmdEaWN0aW9uYXJ5PGJvb2xlYW4+PjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkV4dHJhY3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVUkk+KCkpO1xuXHRyZWFkb25seSBvbkV4dHJhY3QgPSB0aGlzLl9vbkV4dHJhY3QuZXZlbnQ7XG5cblx0cHJpdmF0ZSBzY2FuQWxsRXh0ZW5zaW9uUHJvbWlzZSA9IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+PigpO1xuXHRwcml2YXRlIHNjYW5Vc2VyRXh0ZW5zaW9uc1Byb21pc2UgPSBuZXcgUmVzb3VyY2VNYXA8UHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbltdPj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGJlZm9yZVJlbW92aW5nRXh0ZW5zaW9uOiAoZTogSUxvY2FsRXh0ZW5zaW9uKSA9PiBQcm9taXNlPHZvaWQ+LFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2U6IElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMub2Jzb2xldGVkUmVzb3VyY2UgPSBqb2luUGF0aCh0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS51c2VyRXh0ZW5zaW9uc0xvY2F0aW9uLCAnLm9ic29sZXRlJyk7XG5cdFx0dGhpcy5vYnNvbGV0ZUZpbGVMaW1pdGVyID0gbmV3IFF1ZXVlKCk7XG5cdH1cblxuXHRhc3luYyBjbGVhblVwKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucmVtb3ZlVGVtcG9yYXJpbHlEZWxldGVkRm9sZGVycygpO1xuXHRcdGF3YWl0IHRoaXMucmVtb3ZlU3RhbGVBdXRvVXBkYXRlQnVpbHRpbkV4dGVuc2lvbnMoKTtcblx0XHRhd2FpdCB0aGlzLmRlbGV0ZUV4dGVuc2lvbnNNYXJrZWRGb3JSZW1vdmFsKCk7XG5cdFx0Ly9UT0RPOiBSZW1vdmUgdGhpcyBpbml0aWlhbGl6YXRpb24gYWZ0ZXIgY291cGUgb2YgcmVsZWFzZXNcblx0XHRhd2FpdCB0aGlzLmluaXRpYWxpemVFeHRlbnNpb25TaXplKCk7XG5cdH1cblxuXHRhc3luYyBzY2FuRXh0ZW5zaW9ucyh0eXBlOiBFeHRlbnNpb25UeXBlIHwgbnVsbCwgcHJvZmlsZUxvY2F0aW9uOiBVUkksIHByb2R1Y3RWZXJzaW9uOiBJUHJvZHVjdFZlcnNpb24sIGxhbmd1YWdlPzogc3RyaW5nKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjYWNoZUtleTogVVJJID0gcHJvZmlsZUxvY2F0aW9uLndpdGgoeyBxdWVyeTogbGFuZ3VhZ2UgfSk7XG5cdFx0XHRjb25zdCB1c2VyU2Nhbk9wdGlvbnM6IFVzZXJFeHRlbnNpb25zU2Nhbk9wdGlvbnMgPSB7IGluY2x1ZGVJbnZhbGlkOiB0cnVlLCBwcm9maWxlTG9jYXRpb24sIHByb2R1Y3RWZXJzaW9uLCBsYW5ndWFnZSB9O1xuXHRcdFx0bGV0IHNjYW5uZWRFeHRlbnNpb25zOiBJU2Nhbm5lZEV4dGVuc2lvbltdID0gW107XG5cdFx0XHRpZiAodHlwZSA9PT0gbnVsbCB8fCB0eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbSkge1xuXHRcdFx0XHRsZXQgc2NhbkFsbEV4dGVuc2lvbnNQcm9taXNlID0gdGhpcy5zY2FuQWxsRXh0ZW5zaW9uUHJvbWlzZS5nZXQoY2FjaGVLZXkpO1xuXHRcdFx0XHRpZiAoIXNjYW5BbGxFeHRlbnNpb25zUHJvbWlzZSkge1xuXHRcdFx0XHRcdHNjYW5BbGxFeHRlbnNpb25zUHJvbWlzZSA9IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5BbGxFeHRlbnNpb25zKHsgbGFuZ3VhZ2UgfSwgdXNlclNjYW5PcHRpb25zKVxuXHRcdFx0XHRcdFx0LmZpbmFsbHkoKCkgPT4gdGhpcy5zY2FuQWxsRXh0ZW5zaW9uUHJvbWlzZS5kZWxldGUoY2FjaGVLZXkpKTtcblx0XHRcdFx0XHR0aGlzLnNjYW5BbGxFeHRlbnNpb25Qcm9taXNlLnNldChjYWNoZUtleSwgc2NhbkFsbEV4dGVuc2lvbnNQcm9taXNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzY2FubmVkRXh0ZW5zaW9ucy5wdXNoKC4uLmF3YWl0IHNjYW5BbGxFeHRlbnNpb25zUHJvbWlzZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGUgPT09IEV4dGVuc2lvblR5cGUuVXNlcikge1xuXHRcdFx0XHRsZXQgc2NhblVzZXJFeHRlbnNpb25zUHJvbWlzZSA9IHRoaXMuc2NhblVzZXJFeHRlbnNpb25zUHJvbWlzZS5nZXQoY2FjaGVLZXkpO1xuXHRcdFx0XHRpZiAoIXNjYW5Vc2VyRXh0ZW5zaW9uc1Byb21pc2UpIHtcblx0XHRcdFx0XHRzY2FuVXNlckV4dGVuc2lvbnNQcm9taXNlID0gdGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhblVzZXJFeHRlbnNpb25zKHVzZXJTY2FuT3B0aW9ucylcblx0XHRcdFx0XHRcdC5maW5hbGx5KCgpID0+IHRoaXMuc2NhblVzZXJFeHRlbnNpb25zUHJvbWlzZS5kZWxldGUoY2FjaGVLZXkpKTtcblx0XHRcdFx0XHR0aGlzLnNjYW5Vc2VyRXh0ZW5zaW9uc1Byb21pc2Uuc2V0KGNhY2hlS2V5LCBzY2FuVXNlckV4dGVuc2lvbnNQcm9taXNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzY2FubmVkRXh0ZW5zaW9ucy5wdXNoKC4uLmF3YWl0IHNjYW5Vc2VyRXh0ZW5zaW9uc1Byb21pc2UpO1xuXHRcdFx0fVxuXHRcdFx0c2Nhbm5lZEV4dGVuc2lvbnMgPSB0eXBlICE9PSBudWxsID8gc2Nhbm5lZEV4dGVuc2lvbnMuZmlsdGVyKHIgPT4gci50eXBlID09PSB0eXBlKSA6IHNjYW5uZWRFeHRlbnNpb25zO1xuXHRcdFx0cmV0dXJuIGF3YWl0IFByb21pc2UuYWxsKHNjYW5uZWRFeHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gdGhpcy50b0xvY2FsRXh0ZW5zaW9uKGV4dGVuc2lvbikpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZXJyb3IsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuU2Nhbm5pbmcpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNjYW5BbGxVc2VyRXh0ZW5zaW9ucygpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbltdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNjYW5uZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhbkFsbFVzZXJFeHRlbnNpb25zKCk7XG5cdFx0XHRyZXR1cm4gYXdhaXQgUHJvbWlzZS5hbGwoc2Nhbm5lZEV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiB0aGlzLnRvTG9jYWxFeHRlbnNpb24oZXh0ZW5zaW9uKSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlcnJvciwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5TY2FubmluZyk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2NhblVzZXJFeHRlbnNpb25BdExvY2F0aW9uKGxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbiB8IG51bGw+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Nhbm5lZEV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5FeGlzdGluZ0V4dGVuc2lvbihsb2NhdGlvbiwgRXh0ZW5zaW9uVHlwZS5Vc2VyLCB7IGluY2x1ZGVJbnZhbGlkOiB0cnVlIH0pO1xuXHRcdFx0aWYgKHNjYW5uZWRFeHRlbnNpb24pIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMudG9Mb2NhbEV4dGVuc2lvbihzY2FubmVkRXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhc3luYyBleHRyYWN0VXNlckV4dGVuc2lvbihleHRlbnNpb25LZXk6IEV4dGVuc2lvbktleSwgemlwUGF0aDogc3RyaW5nLCByZW1vdmVJZkV4aXN0czogYm9vbGVhbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRjb25zdCBmb2xkZXJOYW1lID0gZXh0ZW5zaW9uS2V5LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgdGVtcExvY2F0aW9uID0gVVJJLmZpbGUocGF0aC5qb2luKHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnVzZXJFeHRlbnNpb25zTG9jYXRpb24uZnNQYXRoLCBgLiR7Z2VuZXJhdGVVdWlkKCl9YCkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbkxvY2F0aW9uID0gVVJJLmZpbGUocGF0aC5qb2luKHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnVzZXJFeHRlbnNpb25zTG9jYXRpb24uZnNQYXRoLCBmb2xkZXJOYW1lKSk7XG5cblx0XHRpZiAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMoZXh0ZW5zaW9uTG9jYXRpb24pKSB7XG5cdFx0XHRpZiAoIXJlbW92ZUlmRXhpc3RzKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuc2NhbkxvY2FsRXh0ZW5zaW9uKGV4dGVuc2lvbkxvY2F0aW9uLCBFeHRlbnNpb25UeXBlLlVzZXIpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBFcnJvciB3aGlsZSBzY2FubmluZyB0aGUgZXhpc3RpbmcgZXh0ZW5zaW9uIGF0ICR7ZXh0ZW5zaW9uTG9jYXRpb24ucGF0aH0uIERlbGV0aW5nIHRoZSBleGlzdGluZyBleHRlbnNpb24gYW5kIGV4dHJhY3RpbmcgaXQuYCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kZWxldGVFeHRlbnNpb25Gcm9tTG9jYXRpb24oZXh0ZW5zaW9uS2V5LmlkLCBleHRlbnNpb25Mb2NhdGlvbiwgJ3JlbW92ZUV4aXN0aW5nJyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKG5scy5sb2NhbGl6ZSgnZXJyb3JEZWxldGluZycsIFwiVW5hYmxlIHRvIGRlbGV0ZSB0aGUgZXhpc3RpbmcgZm9sZGVyICd7MH0nIHdoaWxlIGluc3RhbGxpbmcgdGhlIGV4dGVuc2lvbiAnezF9Jy4gUGxlYXNlIGRlbGV0ZSB0aGUgZm9sZGVyIG1hbnVhbGx5IGFuZCB0cnkgYWdhaW5cIiwgZXh0ZW5zaW9uTG9jYXRpb24uZnNQYXRoLCBleHRlbnNpb25LZXkuaWQpLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkRlbGV0ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRXh0cmFjdFxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBTdGFydGVkIGV4dHJhY3RpbmcgdGhlIGV4dGVuc2lvbiBmcm9tICR7emlwUGF0aH0gdG8gJHtleHRlbnNpb25Mb2NhdGlvbi5mc1BhdGh9YCk7XG5cdFx0XHRcdGF3YWl0IGV4dHJhY3QoemlwUGF0aCwgdGVtcExvY2F0aW9uLmZzUGF0aCwgeyBzb3VyY2VQYXRoOiAnZXh0ZW5zaW9uJywgb3ZlcndyaXRlOiB0cnVlIH0sIHRva2VuKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEV4dHJhY3RlZCBleHRlbnNpb24gdG8gJHtleHRlbnNpb25Mb2NhdGlvbn06YCwgZXh0ZW5zaW9uS2V5LmlkKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhyb3cgZnJvbUV4dHJhY3RFcnJvcihlKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWV0YWRhdGE6IE1hbmlmZXN0TWV0YWRhdGEgPSB7IGluc3RhbGxlZFRpbWVzdGFtcDogRGF0ZS5ub3coKSwgdGFyZ2V0UGxhdGZvcm06IGV4dGVuc2lvbktleS50YXJnZXRQbGF0Zm9ybSB9O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bWV0YWRhdGEuc2l6ZSA9IGF3YWl0IGNvbXB1dGVTaXplKHRlbXBMb2NhdGlvbiwgdGhpcy5maWxlU2VydmljZSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBMb2cgJiBpZ25vcmVcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEVycm9yIHdoaWxlIGdldHRpbmcgdGhlIHNpemUgb2YgdGhlIGV4dHJhY3RlZCBleHRlbnNpb24gOiAke3RlbXBMb2NhdGlvbi5mc1BhdGh9YCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnVwZGF0ZU1hbmlmZXN0TWV0YWRhdGEodGVtcExvY2F0aW9uLCBtZXRhZGF0YSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxVcGRhdGVNZXRhZGF0YUVycm9yRXZlbnQsIFVwZGF0ZU1ldGFkYXRhRXJyb3JDbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbjpleHRyYWN0JywgeyBleHRlbnNpb25JZDogZXh0ZW5zaW9uS2V5LmlkLCBjb2RlOiBgJHt0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpfWAgfSk7XG5cdFx0XHRcdHRocm93IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGVycm9yLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlVwZGF0ZU1ldGFkYXRhKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZW5hbWVcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgU3RhcnRlZCByZW5hbWluZyB0aGUgZXh0ZW5zaW9uIGZyb20gJHt0ZW1wTG9jYXRpb24uZnNQYXRofSB0byAke2V4dGVuc2lvbkxvY2F0aW9uLmZzUGF0aH1gKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5yZW5hbWUodGVtcExvY2F0aW9uLmZzUGF0aCwgZXh0ZW5zaW9uTG9jYXRpb24uZnNQYXRoKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1JlbmFtZWQgdG8nLCBleHRlbnNpb25Mb2NhdGlvbi5mc1BhdGgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKGVycm9yLmNvZGUgPT09ICdFTk9URU1QVFknKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFJlbmFtZSBmYWlsZWQgYmVjYXVzZSBleHRlbnNpb24gd2FzIGluc3RhbGxlZCBieSBhbm90aGVyIHNvdXJjZS4gU28gaWdub3JpbmcgcmVuYW1pbmcuYCwgZXh0ZW5zaW9uS2V5LmlkKTtcblx0XHRcdFx0XHR0cnkgeyBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbCh0ZW1wTG9jYXRpb24sIHsgcmVjdXJzaXZlOiB0cnVlIH0pOyB9IGNhdGNoIChlKSB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFJlbmFtZSBmYWlsZWQgYmVjYXVzZSBvZiAke2dldEVycm9yTWVzc2FnZShlcnJvcil9LiBEZWxldGVkIGZyb20gZXh0cmFjdGVkIGxvY2F0aW9uYCwgdGVtcExvY2F0aW9uKTtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbkV4dHJhY3QuZmlyZShleHRlbnNpb25Mb2NhdGlvbik7XG5cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dHJ5IHsgYXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwodGVtcExvY2F0aW9uLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTsgfSBjYXRjaCAoZSkgeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2NhbkxvY2FsRXh0ZW5zaW9uKGV4dGVuc2lvbkxvY2F0aW9uLCBFeHRlbnNpb25UeXBlLlVzZXIpO1xuXHR9XG5cblx0YXN5bmMgc2Nhbk1ldGFkYXRhKGxvY2FsOiBJTG9jYWxFeHRlbnNpb24sIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxNZXRhZGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuZ2V0U2Nhbm5lZEV4dGVuc2lvbihsb2NhbCwgcHJvZmlsZUxvY2F0aW9uKTtcblx0XHRyZXR1cm4gZXh0ZW5zaW9uPy5tZXRhZGF0YTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0U2Nhbm5lZEV4dGVuc2lvbihsb2NhbDogSUxvY2FsRXh0ZW5zaW9uLCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5zY2FuUHJvZmlsZUV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uKTtcblx0XHRyZXR1cm4gZXh0ZW5zaW9ucy5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBsb2NhbC5pZGVudGlmaWVyKSk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVNZXRhZGF0YShsb2NhbDogSUxvY2FsRXh0ZW5zaW9uLCBtZXRhZGF0YTogUGFydGlhbDxNZXRhZGF0YT4sIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKFtbbG9jYWwsIG1ldGFkYXRhXV0sIHByb2ZpbGVMb2NhdGlvbik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFVwZGF0ZU1ldGFkYXRhRXJyb3JFdmVudCwgVXBkYXRlTWV0YWRhdGFFcnJvckNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uOmV4dHJhY3QnLCB7IGV4dGVuc2lvbklkOiBsb2NhbC5pZGVudGlmaWVyLmlkLCBjb2RlOiBgJHt0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpfWAsIGlzUHJvZmlsZTogISFwcm9maWxlTG9jYXRpb24gfSk7XG5cdFx0XHR0aHJvdyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlcnJvciwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5VcGRhdGVNZXRhZGF0YSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnNjYW5Mb2NhbEV4dGVuc2lvbihsb2NhbC5sb2NhdGlvbiwgbG9jYWwudHlwZSwgcHJvZmlsZUxvY2F0aW9uKTtcblx0fVxuXG5cdGFzeW5jIHNldEV4dGVuc2lvbnNGb3JSZW1vdmFsKC4uLmV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNUb1JlbW92ZSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhleHRlbnNpb24ubG9jYXRpb24pKSB7XG5cdFx0XHRcdGV4dGVuc2lvbnNUb1JlbW92ZS5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGV4dGVuc2lvbktleXM6IEV4dGVuc2lvbktleVtdID0gZXh0ZW5zaW9uc1RvUmVtb3ZlLm1hcChlID0+IEV4dGVuc2lvbktleS5jcmVhdGUoZSkpO1xuXHRcdGF3YWl0IHRoaXMud2l0aFJlbW92ZWRFeHRlbnNpb25zKHJlbW92ZWRFeHRlbnNpb25zID0+XG5cdFx0XHRleHRlbnNpb25LZXlzLmZvckVhY2goZXh0ZW5zaW9uS2V5ID0+IHtcblx0XHRcdFx0cmVtb3ZlZEV4dGVuc2lvbnNbZXh0ZW5zaW9uS2V5LnRvU3RyaW5nKCldID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ01hcmtlZCBleHRlbnNpb24gYXMgcmVtb3ZlZCcsIGV4dGVuc2lvbktleS50b1N0cmluZygpKTtcblx0XHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIHVuc2V0RXh0ZW5zaW9uc0ZvclJlbW92YWwoLi4uZXh0ZW5zaW9uS2V5czogRXh0ZW5zaW9uS2V5W10pOiBQcm9taXNlPGJvb2xlYW5bXT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHRzOiBib29sZWFuW10gPSBbXTtcblx0XHRcdGF3YWl0IHRoaXMud2l0aFJlbW92ZWRFeHRlbnNpb25zKHJlbW92ZWRFeHRlbnNpb25zID0+XG5cdFx0XHRcdGV4dGVuc2lvbktleXMuZm9yRWFjaChleHRlbnNpb25LZXkgPT4ge1xuXHRcdFx0XHRcdGlmIChyZW1vdmVkRXh0ZW5zaW9uc1tleHRlbnNpb25LZXkudG9TdHJpbmcoKV0pIHtcblx0XHRcdFx0XHRcdHJlc3VsdHMucHVzaCh0cnVlKTtcblx0XHRcdFx0XHRcdGRlbGV0ZSByZW1vdmVkRXh0ZW5zaW9uc1tleHRlbnNpb25LZXkudG9TdHJpbmcoKV07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlc3VsdHMucHVzaChmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0cztcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZXJyb3IsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuVW5zZXRSZW1vdmVkKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBkZWxldGVFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24gfCBJU2Nhbm5lZEV4dGVuc2lvbiwgdHlwZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQoZXh0ZW5zaW9uLmxvY2F0aW9uLCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS51c2VyRXh0ZW5zaW9uc0xvY2F0aW9uKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5kZWxldGVFeHRlbnNpb25Gcm9tTG9jYXRpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbi5sb2NhdGlvbiwgdHlwZSk7XG5cdFx0XHRhd2FpdCB0aGlzLnVuc2V0RXh0ZW5zaW9uc0ZvclJlbW92YWwoRXh0ZW5zaW9uS2V5LmNyZWF0ZShleHRlbnNpb24pKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjb3B5RXh0ZW5zaW9uKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkksIG1ldGFkYXRhOiBQYXJ0aWFsPE1ldGFkYXRhPik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgdGhpcy5nZXRTY2FubmVkRXh0ZW5zaW9uKGV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbik7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgdGhpcy5nZXRTY2FubmVkRXh0ZW5zaW9uKGV4dGVuc2lvbiwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdG1ldGFkYXRhID0geyAuLi5zb3VyY2U/Lm1ldGFkYXRhLCAuLi5tZXRhZGF0YSB9O1xuXG5cdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHRhcmdldC5sb2NhdGlvbiwgZXh0ZW5zaW9uLmxvY2F0aW9uKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UudXBkYXRlTWV0YWRhdGEoW1tleHRlbnNpb24sIHsgLi4udGFyZ2V0Lm1ldGFkYXRhLCAuLi5tZXRhZGF0YSB9XV0sIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldEV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuc2NhbkxvY2FsRXh0ZW5zaW9uKHRhcmdldC5sb2NhdGlvbiwgZXh0ZW5zaW9uLnR5cGUsIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLnJlbW92ZUV4dGVuc2lvbnNGcm9tUHJvZmlsZShbdGFyZ2V0RXh0ZW5zaW9uLmlkZW50aWZpZXJdLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5hZGRFeHRlbnNpb25zVG9Qcm9maWxlKFtbZXh0ZW5zaW9uLCB7IC4uLnRhcmdldC5tZXRhZGF0YSwgLi4ubWV0YWRhdGEgfV1dLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5hZGRFeHRlbnNpb25zVG9Qcm9maWxlKFtbZXh0ZW5zaW9uLCBtZXRhZGF0YV1dLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2NhbkxvY2FsRXh0ZW5zaW9uKGV4dGVuc2lvbi5sb2NhdGlvbiwgZXh0ZW5zaW9uLnR5cGUsIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0fVxuXG5cdGFzeW5jIG1vdmVFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSwgbWV0YWRhdGE6IFBhcnRpYWw8TWV0YWRhdGE+KTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCB0aGlzLmdldFNjYW5uZWRFeHRlbnNpb24oZXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCB0aGlzLmdldFNjYW5uZWRFeHRlbnNpb24oZXh0ZW5zaW9uLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0bWV0YWRhdGEgPSB7IC4uLnNvdXJjZT8ubWV0YWRhdGEsIC4uLm1ldGFkYXRhIH07XG5cblx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodGFyZ2V0LmxvY2F0aW9uLCBleHRlbnNpb24ubG9jYXRpb24pKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS51cGRhdGVNZXRhZGF0YShbW2V4dGVuc2lvbiwgeyAuLi50YXJnZXQubWV0YWRhdGEsIC4uLm1ldGFkYXRhIH1dXSwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0RXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5zY2FuTG9jYWxFeHRlbnNpb24odGFyZ2V0LmxvY2F0aW9uLCBleHRlbnNpb24udHlwZSwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJlbW92ZUV4dGVuc2lvbih0YXJnZXRFeHRlbnNpb24uaWRlbnRpZmllciwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UuYWRkRXh0ZW5zaW9uc1RvUHJvZmlsZShbW2V4dGVuc2lvbiwgeyAuLi50YXJnZXQubWV0YWRhdGEsIC4uLm1ldGFkYXRhIH1dXSwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UuYWRkRXh0ZW5zaW9uc1RvUHJvZmlsZShbW2V4dGVuc2lvbiwgbWV0YWRhdGFdXSwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0aWYgKHNvdXJjZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJlbW92ZUV4dGVuc2lvbihzb3VyY2UuaWRlbnRpZmllciwgZnJvbVByb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2NhbkxvY2FsRXh0ZW5zaW9uKGV4dGVuc2lvbi5sb2NhdGlvbiwgZXh0ZW5zaW9uLnR5cGUsIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0fVxuXG5cdGFzeW5jIHJlbW92ZUV4dGVuc2lvbihpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllciwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLnJlbW92ZUV4dGVuc2lvbnNGcm9tUHJvZmlsZShbaWRlbnRpZmllcl0sIGZyb21Qcm9maWxlTG9jYXRpb24pO1xuXHR9XG5cblx0YXN5bmMgY29weUV4dGVuc2lvbnMoZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJLCBwcm9kdWN0VmVyc2lvbjogSVByb2R1Y3RWZXJzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZnJvbUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnNjYW5FeHRlbnNpb25zKEV4dGVuc2lvblR5cGUuVXNlciwgZnJvbVByb2ZpbGVMb2NhdGlvbiwgcHJvZHVjdFZlcnNpb24pO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnM6IFtJTG9jYWxFeHRlbnNpb24sIE1ldGFkYXRhIHwgdW5kZWZpbmVkXVtdID0gYXdhaXQgUHJvbWlzZS5hbGwoZnJvbUV4dGVuc2lvbnNcblx0XHRcdC5maWx0ZXIoZSA9PiAhZS5pc0FwcGxpY2F0aW9uU2NvcGVkKSAvKiByZW1vdmUgYXBwbGljYXRpb24gc2NvcGVkIGV4dGVuc2lvbnMgKi9cblx0XHRcdC5tYXAoYXN5bmMgZSA9PiAoW2UsIGF3YWl0IHRoaXMuc2Nhbk1ldGFkYXRhKGUsIGZyb21Qcm9maWxlTG9jYXRpb24pXSkpKTtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UuYWRkRXh0ZW5zaW9uc1RvUHJvZmlsZShleHRlbnNpb25zLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRlbGV0ZUV4dGVuc2lvbkZyb21Mb2NhdGlvbihpZDogc3RyaW5nLCBsb2NhdGlvbjogVVJJLCB0eXBlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYERlbGV0aW5nICR7dHlwZX0gZXh0ZW5zaW9uIGZyb20gZGlza2AsIGlkLCBsb2NhdGlvbi5mc1BhdGgpO1xuXHRcdGNvbnN0IHJlbmFtZWRMb2NhdGlvbiA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aCh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZGlybmFtZShsb2NhdGlvbiksIGAke3RoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5iYXNlbmFtZShsb2NhdGlvbil9LiR7aGFzaChnZW5lcmF0ZVV1aWQoKSkudG9TdHJpbmcoMTYpfSR7REVMRVRFRF9GT0xERVJfUE9TVEZJWH1gKTtcblx0XHRhd2FpdCB0aGlzLnJlbmFtZShsb2NhdGlvbi5mc1BhdGgsIHJlbmFtZWRMb2NhdGlvbi5mc1BhdGgpO1xuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHJlbmFtZWRMb2NhdGlvbiwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYERlbGV0ZWQgJHt0eXBlfSBleHRlbnNpb24gZnJvbSBkaXNrYCwgaWQsIGxvY2F0aW9uLmZzUGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIHdpdGhSZW1vdmVkRXh0ZW5zaW9ucyh1cGRhdGVGbj86IChyZW1vdmVkOiBJU3RyaW5nRGljdGlvbmFyeTxib29sZWFuPikgPT4gdm9pZCk6IFByb21pc2U8SVN0cmluZ0RpY3Rpb25hcnk8Ym9vbGVhbj4+IHtcblx0XHRyZXR1cm4gdGhpcy5vYnNvbGV0ZUZpbGVMaW1pdGVyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGxldCByYXc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMub2Jzb2xldGVkUmVzb3VyY2UsICd1dGY4Jyk7XG5cdFx0XHRcdHJhdyA9IGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGV0IHJlbW92ZWQgPSB7fTtcblx0XHRcdGlmIChyYXcpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZW1vdmVkID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh1cGRhdGVGbikge1xuXHRcdFx0XHR1cGRhdGVGbihyZW1vdmVkKTtcblx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKHJlbW92ZWQpLmxlbmd0aCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRoaXMub2Jzb2xldGVkUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkocmVtb3ZlZCkpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwodGhpcy5vYnNvbGV0ZWRSZXNvdXJjZSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVtb3ZlZDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVuYW1lKGV4dHJhY3RQYXRoOiBzdHJpbmcsIHJlbmFtZVBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwZnMuUHJvbWlzZXMucmVuYW1lKGV4dHJhY3RQYXRoLCByZW5hbWVQYXRoLCAyICogNjAgKiAxMDAwIC8qIFJldHJ5IGZvciAyIG1pbnV0ZXMgKi8pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlcnJvciwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5SZW5hbWUpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNjYW5Mb2NhbEV4dGVuc2lvbihsb2NhdGlvbjogVVJJLCB0eXBlOiBFeHRlbnNpb25UeXBlLCBwcm9maWxlTG9jYXRpb24/OiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAocHJvZmlsZUxvY2F0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IHNjYW5uZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhblVzZXJFeHRlbnNpb25zKHsgcHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdFx0XHRjb25zdCBzY2FubmVkRXh0ZW5zaW9uID0gc2Nhbm5lZEV4dGVuc2lvbnMuZmluZChlID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGUubG9jYXRpb24sIGxvY2F0aW9uKSk7XG5cdFx0XHRcdGlmIChzY2FubmVkRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMudG9Mb2NhbEV4dGVuc2lvbihzY2FubmVkRXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgc2Nhbm5lZEV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5FeGlzdGluZ0V4dGVuc2lvbihsb2NhdGlvbiwgdHlwZSwgeyBpbmNsdWRlSW52YWxpZDogdHJ1ZSB9KTtcblx0XHRcdFx0aWYgKHNjYW5uZWRFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy50b0xvY2FsRXh0ZW5zaW9uKHNjYW5uZWRFeHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKG5scy5sb2NhbGl6ZSgnY2Fubm90IHJlYWQnLCBcIkNhbm5vdCByZWFkIHRoZSBleHRlbnNpb24gZnJvbSB7MH1cIiwgbG9jYXRpb24ucGF0aCksIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuU2Nhbm5pbmdFeHRlbnNpb24pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlcnJvciwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5TY2FubmluZ0V4dGVuc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0b0xvY2FsRXh0ZW5zaW9uKGV4dGVuc2lvbjogSVNjYW5uZWRFeHRlbnNpb24pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGxldCBzdGF0OiBJRmlsZVN0YXQgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUoZXh0ZW5zaW9uLmxvY2F0aW9uKTtcblx0XHR9IGNhdGNoIChlcnJvcikgey8qIGlnbm9yZSAqLyB9XG5cblx0XHRsZXQgcmVhZG1lVXJsOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNoYW5nZWxvZ1VybDogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChzdGF0Py5jaGlsZHJlbikge1xuXHRcdFx0cmVhZG1lVXJsID0gc3RhdC5jaGlsZHJlbi5maW5kKCh7IG5hbWUgfSkgPT4gL15yZWFkbWUoXFwudHh0fFxcLm1kfCkkL2kudGVzdChuYW1lKSk/LnJlc291cmNlO1xuXHRcdFx0Y2hhbmdlbG9nVXJsID0gc3RhdC5jaGlsZHJlbi5maW5kKCh7IG5hbWUgfSkgPT4gL15jaGFuZ2Vsb2coXFwudHh0fFxcLm1kfCkkL2kudGVzdChuYW1lKSk/LnJlc291cmNlO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWRlbnRpZmllcjogZXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHR0eXBlOiBleHRlbnNpb24udHlwZSxcblx0XHRcdGlzQnVpbHRpbjogZXh0ZW5zaW9uLmlzQnVpbHRpbiB8fCAhIWV4dGVuc2lvbi5tZXRhZGF0YT8uaXNCdWlsdGluLFxuXHRcdFx0bG9jYXRpb246IGV4dGVuc2lvbi5sb2NhdGlvbixcblx0XHRcdG1hbmlmZXN0OiBleHRlbnNpb24ubWFuaWZlc3QsXG5cdFx0XHR0YXJnZXRQbGF0Zm9ybTogZXh0ZW5zaW9uLnRhcmdldFBsYXRmb3JtLFxuXHRcdFx0dmFsaWRhdGlvbnM6IGV4dGVuc2lvbi52YWxpZGF0aW9ucyxcblx0XHRcdGlzVmFsaWQ6IGV4dGVuc2lvbi5pc1ZhbGlkLFxuXHRcdFx0cmVhZG1lVXJsLFxuXHRcdFx0Y2hhbmdlbG9nVXJsLFxuXHRcdFx0cHVibGlzaGVyRGlzcGxheU5hbWU6IGV4dGVuc2lvbi5tZXRhZGF0YT8ucHVibGlzaGVyRGlzcGxheU5hbWUsXG5cdFx0XHRwdWJsaXNoZXJJZDogZXh0ZW5zaW9uLm1ldGFkYXRhPy5wdWJsaXNoZXJJZCB8fCBudWxsLFxuXHRcdFx0aXNBcHBsaWNhdGlvblNjb3BlZDogISFleHRlbnNpb24ubWV0YWRhdGE/LmlzQXBwbGljYXRpb25TY29wZWQsXG5cdFx0XHRpc01hY2hpbmVTY29wZWQ6ICEhZXh0ZW5zaW9uLm1ldGFkYXRhPy5pc01hY2hpbmVTY29wZWQsXG5cdFx0XHRpc1ByZVJlbGVhc2VWZXJzaW9uOiAhIWV4dGVuc2lvbi5tZXRhZGF0YT8uaXNQcmVSZWxlYXNlVmVyc2lvbixcblx0XHRcdGhhc1ByZVJlbGVhc2VWZXJzaW9uOiAhIWV4dGVuc2lvbi5tZXRhZGF0YT8uaGFzUHJlUmVsZWFzZVZlcnNpb24sXG5cdFx0XHRwcmVSZWxlYXNlOiBleHRlbnNpb24ucHJlUmVsZWFzZSxcblx0XHRcdGluc3RhbGxlZFRpbWVzdGFtcDogZXh0ZW5zaW9uLm1ldGFkYXRhPy5pbnN0YWxsZWRUaW1lc3RhbXAsXG5cdFx0XHR1cGRhdGVkOiAhIWV4dGVuc2lvbi5tZXRhZGF0YT8udXBkYXRlZCxcblx0XHRcdHBpbm5lZDogISFleHRlbnNpb24ubWV0YWRhdGE/LnBpbm5lZCxcblx0XHRcdGZvcmNlQXV0b1VwZGF0ZTogZXh0ZW5zaW9uLmZvcmNlQXV0b1VwZGF0ZSxcblx0XHRcdHByaXZhdGU6ICEhZXh0ZW5zaW9uLm1ldGFkYXRhPy5wcml2YXRlLFxuXHRcdFx0aXNXb3Jrc3BhY2VTY29wZWQ6IGZhbHNlLFxuXHRcdFx0c291cmNlOiBleHRlbnNpb24ubWV0YWRhdGE/LnNvdXJjZSA/PyAoZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCA/ICdnYWxsZXJ5JyA6ICd2c2l4JyksXG5cdFx0XHRzaXplOiBleHRlbnNpb24ubWV0YWRhdGE/LnNpemUgPz8gMCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplRXh0ZW5zaW9uU2l6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhbkFsbFVzZXJFeHRlbnNpb25zKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoZXh0ZW5zaW9ucy5tYXAoYXN5bmMgZXh0ZW5zaW9uID0+IHtcblx0XHRcdC8vIHNldCBzaXplIGlmIG5vdCBzZXQgYmVmb3JlXG5cdFx0XHRpZiAoaXNEZWZpbmVkKGV4dGVuc2lvbi5tZXRhZGF0YT8uaW5zdGFsbGVkVGltZXN0YW1wKSAmJiBpc1VuZGVmaW5lZChleHRlbnNpb24ubWV0YWRhdGE/LnNpemUpKSB7XG5cdFx0XHRcdGNvbnN0IHNpemUgPSBhd2FpdCBjb21wdXRlU2l6ZShleHRlbnNpb24ubG9jYXRpb24sIHRoaXMuZmlsZVNlcnZpY2UpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS51cGRhdGVNYW5pZmVzdE1ldGFkYXRhKGV4dGVuc2lvbi5sb2NhdGlvbiwgeyBzaXplIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVtb3ZlU3RhbGVBdXRvVXBkYXRlQnVpbHRpbkV4dGVuc2lvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYnVpbHRpbkV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuU3lzdGVtRXh0ZW5zaW9ucyh7fSk7XG5cdFx0Y29uc3QgdXNlckV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuQWxsVXNlckV4dGVuc2lvbnMoKTtcblx0XHRjb25zdCBzdGFsZUV4dGVuc2lvbnMgPSB1c2VyRXh0ZW5zaW9ucy5maWx0ZXIodXNlckV4dGVuc2lvbiA9PiB7XG5cdFx0XHRpZiAoIXRoaXMucHJvZHVjdFNlcnZpY2UuYnVpbHRJbkV4dGVuc2lvbnNFbmFibGVkV2l0aEF1dG9VcGRhdGVzLnNvbWUoaWQgPT4gaWQudG9Mb3dlckNhc2UoKSA9PT0gdXNlckV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJ1aWx0aW5FeHRlbnNpb24gPSBidWlsdGluRXh0ZW5zaW9ucy5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB1c2VyRXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdHJldHVybiBidWlsdGluRXh0ZW5zaW9uICYmIHNlbXZlci5sdCh1c2VyRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24sIGJ1aWx0aW5FeHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbik7XG5cdFx0fSk7XG5cdFx0aWYgKHN0YWxlRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdSZW1vdmluZyBzdGFsZSBhdXRvLXVwZGF0ZSBidWlsdGluIGV4dGVuc2lvbnM6Jywgc3RhbGVFeHRlbnNpb25zLm1hcChlID0+IGAke2UuaWRlbnRpZmllci5pZH1AJHtlLm1hbmlmZXN0LnZlcnNpb259YCkuam9pbignLCAnKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UucmVtb3ZlRXh0ZW5zaW9uc0Zyb21Qcm9maWxlKHN0YWxlRXh0ZW5zaW9ucy5tYXAoZSA9PiBlLmlkZW50aWZpZXIpLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoc3RhbGVFeHRlbnNpb25zLm1hcChlID0+IHRoaXMuZGVsZXRlRXh0ZW5zaW9uKGUsICdzdGFsZSBhdXRvLXVwZGF0ZSBidWlsdGluJykpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRlbGV0ZUV4dGVuc2lvbnNNYXJrZWRGb3JSZW1vdmFsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCByZW1vdmVkOiBJU3RyaW5nRGljdGlvbmFyeTxib29sZWFuPjtcblx0XHR0cnkge1xuXHRcdFx0cmVtb3ZlZCA9IGF3YWl0IHRoaXMud2l0aFJlbW92ZWRFeHRlbnNpb25zKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGVycm9yLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlJlYWRSZW1vdmVkKTtcblx0XHR9XG5cblx0XHRpZiAoT2JqZWN0LmtleXMocmVtb3ZlZCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYE5vIGV4dGVuc2lvbnMgYXJlIG1hcmtlZCBhcyByZW1vdmVkLmApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgRGVsZXRpbmcgZXh0ZW5zaW9ucyBtYXJrZWQgYXMgcmVtb3ZlZDpgLCBPYmplY3Qua2V5cyhyZW1vdmVkKSk7XG5cblx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5zY2FuQWxsVXNlckV4dGVuc2lvbnMoKTtcblx0XHRjb25zdCBpbnN0YWxsZWQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBlIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGlmICghcmVtb3ZlZFtFeHRlbnNpb25LZXkuY3JlYXRlKGUpLnRvU3RyaW5nKCldKSB7XG5cdFx0XHRcdGluc3RhbGxlZC5hZGQoZS5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBydW5uaW5nIHBvc3QgdW5pbnN0YWxsIHRhc2tzIGZvciBleHRlbnNpb25zIHRoYXQgYXJlIG5vdCBpbnN0YWxsZWQgYW55bW9yZVxuXHRcdFx0Y29uc3QgYnlFeHRlbnNpb24gPSBncm91cEJ5RXh0ZW5zaW9uKGV4dGVuc2lvbnMsIGUgPT4gZS5pZGVudGlmaWVyKTtcblx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoYnlFeHRlbnNpb24ubWFwKGFzeW5jIGUgPT4ge1xuXHRcdFx0XHRjb25zdCBsYXRlc3QgPSBlLnNvcnQoKGEsIGIpID0+IHNlbXZlci5yY29tcGFyZShhLm1hbmlmZXN0LnZlcnNpb24sIGIubWFuaWZlc3QudmVyc2lvbikpWzBdO1xuXHRcdFx0XHRpZiAoIWluc3RhbGxlZC5oYXMobGF0ZXN0LmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmJlZm9yZVJlbW92aW5nRXh0ZW5zaW9uKGxhdGVzdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cblx0XHRjb25zdCB0b1JlbW92ZSA9IGV4dGVuc2lvbnMuZmlsdGVyKGUgPT4gZS5pbnN0YWxsZWRUaW1lc3RhbXAgLyogSW5zdGFsbGVkIGJ5IFN5c3RlbSAqLyAmJiByZW1vdmVkW0V4dGVuc2lvbktleS5jcmVhdGUoZSkudG9TdHJpbmcoKV0pO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh0b1JlbW92ZS5tYXAoZSA9PiB0aGlzLmRlbGV0ZUV4dGVuc2lvbihlLCAnbWFya2VkIGZvciByZW1vdmFsJykpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVtb3ZlVGVtcG9yYXJpbHlEZWxldGVkRm9sZGVycygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlI3JlbW92ZVRlbXBEZWxldGVGb2xkZXJzJyk7XG5cblx0XHRsZXQgc3RhdDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZSh0aGlzLmV4dGVuc2lvbnNTY2FubmVyU2VydmljZS51c2VyRXh0ZW5zaW9uc0xvY2F0aW9uKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXN0YXQ/LmNoaWxkcmVuKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChzdGF0LmNoaWxkcmVuLm1hcChhc3luYyBjaGlsZCA9PiB7XG5cdFx0XHRcdGlmICghY2hpbGQuaXNEaXJlY3RvcnkgfHwgIWNoaWxkLm5hbWUuZW5kc1dpdGgoREVMRVRFRF9GT0xERVJfUE9TVEZJWCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdEZWxldGluZyB0aGUgdGVtcG9yYXJpbHkgZGVsZXRlZCBmb2xkZXInLCBjaGlsZC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChjaGlsZC5yZXNvdXJjZSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdEZWxldGVkIHRoZSB0ZW1wb3JhcmlseSBkZWxldGVkIGZvbGRlcicsIGNoaWxkLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7IC8qIGlnbm9yZSAqLyB9XG5cdH1cblxufVxuXG5jbGFzcyBJbnN0YWxsRXh0ZW5zaW9uSW5Qcm9maWxlVGFzayBleHRlbmRzIEFic3RyYWN0RXh0ZW5zaW9uVGFzazxJTG9jYWxFeHRlbnNpb24+IGltcGxlbWVudHMgSUluc3RhbGxFeHRlbnNpb25UYXNrIHtcblxuXHRwcml2YXRlIF9vcGVyYXRpb24gPSBJbnN0YWxsT3BlcmF0aW9uLkluc3RhbGw7XG5cdGdldCBvcGVyYXRpb24oKSB7IHJldHVybiB0aGlzLm9wdGlvbnMub3BlcmF0aW9uID8/IHRoaXMuX29wZXJhdGlvbjsgfVxuXG5cdHByaXZhdGUgX3ZlcmlmaWNhdGlvblN0YXR1czogRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZSB8IHVuZGVmaW5lZDtcblx0Z2V0IHZlcmlmaWNhdGlvblN0YXR1cygpIHsgcmV0dXJuIHRoaXMuX3ZlcmlmaWNhdGlvblN0YXR1czsgfVxuXG5cdHJlYWRvbmx5IGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uS2V5OiBFeHRlbnNpb25LZXksXG5cdFx0cmVhZG9ubHkgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCxcblx0XHRyZWFkb25seSBzb3VyY2U6IElHYWxsZXJ5RXh0ZW5zaW9uIHwgVVJJLFxuXHRcdHJlYWRvbmx5IG9wdGlvbnM6IEluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dHJhY3RFeHRlbnNpb25GbjogKG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPEV4dHJhY3RFeHRlbnNpb25SZXN1bHQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1NjYW5uZXI6IEV4dGVuc2lvbnNTY2FubmVyLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBnYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2U6IElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuaWRlbnRpZmllciA9IHRoaXMuZXh0ZW5zaW9uS2V5LmlkZW50aWZpZXI7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZG9SdW4odG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnNjYW5FeHRlbnNpb25zKEV4dGVuc2lvblR5cGUuVXNlciwgdGhpcy5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbiwgdGhpcy5vcHRpb25zLnByb2R1Y3RWZXJzaW9uKTtcblx0XHRjb25zdCBleGlzdGluZ0V4dGVuc2lvbiA9IGluc3RhbGxlZC5maW5kKGkgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaS5pZGVudGlmaWVyLCB0aGlzLmlkZW50aWZpZXIpKTtcblx0XHRpZiAoZXhpc3RpbmdFeHRlbnNpb24pIHtcblx0XHRcdHRoaXMuX29wZXJhdGlvbiA9IEluc3RhbGxPcGVyYXRpb24uVXBkYXRlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN5c3RlbSA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuc2NhbkV4dGVuc2lvbnMoRXh0ZW5zaW9uVHlwZS5TeXN0ZW0sIHRoaXMub3B0aW9ucy5wcm9maWxlTG9jYXRpb24sIHRoaXMub3B0aW9ucy5wcm9kdWN0VmVyc2lvbik7XG5cdFx0Y29uc3QgZXhpc3RpbmdTeXN0ZW1FeHRlbnNpb24gPSBzeXN0ZW0uZmluZChpID0+IGFyZVNhbWVFeHRlbnNpb25zKGkuaWRlbnRpZmllciwgdGhpcy5pZGVudGlmaWVyKSk7XG5cdFx0aWYgKGV4aXN0aW5nU3lzdGVtRXh0ZW5zaW9uKSB7XG5cdFx0XHRpZiAoIWV4aXN0aW5nU3lzdGVtRXh0ZW5zaW9uLmZvcmNlQXV0b1VwZGF0ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKG5scy5sb2NhbGl6ZSgnYnVpbHRpbkF1dG9VcGRhdGUnLCBcIkV4dGVuc2lvbiAnezB9JyBpcyBhIGJ1aWx0LWluIGV4dGVuc2lvbiBhbmQgbm90IGFsbG93ZWQgdG8gYmUgdXBkYXRlZCBpbiB0aGUgY3VycmVudCBwcm9kdWN0IHF1YWxpdHkgJ3sxfScuXCIsIGV4aXN0aW5nU3lzdGVtRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UucXVhbGl0eSksIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuSW5jb21wYXRpYmxlKTtcblx0XHRcdH1cblx0XHRcdGlmIChzZW12ZXIuZ3QoZXhpc3RpbmdTeXN0ZW1FeHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiwgdGhpcy5tYW5pZmVzdC52ZXJzaW9uKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKG5scy5sb2NhbGl6ZSgnYnVpbHRpblZlcnNpb24nLCBcIkV4dGVuc2lvbiAnezB9JyBpcyBhIGJ1aWx0LWluIGV4dGVuc2lvbiB3aXRoIHZlcnNpb24gJ3sxfScgYW5kIGNhbm5vdCBiZSBkb3duZ3JhZGVkIHRvIHZlcnNpb24gJ3syfScuXCIsIGV4aXN0aW5nU3lzdGVtRXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4aXN0aW5nU3lzdGVtRXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24sIHRoaXMubWFuaWZlc3QudmVyc2lvbiksIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuSW5jb21wYXRpYmxlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtZXRhZGF0YTogTWV0YWRhdGEgPSB7XG5cdFx0XHRpc0FwcGxpY2F0aW9uU2NvcGVkOiB0aGlzLm9wdGlvbnMuaXNBcHBsaWNhdGlvblNjb3BlZCB8fCBleGlzdGluZ0V4dGVuc2lvbj8uaXNBcHBsaWNhdGlvblNjb3BlZCxcblx0XHRcdGlzTWFjaGluZVNjb3BlZDogdGhpcy5vcHRpb25zLmlzTWFjaGluZVNjb3BlZCB8fCBleGlzdGluZ0V4dGVuc2lvbj8uaXNNYWNoaW5lU2NvcGVkLFxuXHRcdFx0aXNCdWlsdGluOiB0aGlzLm9wdGlvbnMuaXNCdWlsdGluIHx8IGV4aXN0aW5nRXh0ZW5zaW9uPy5pc0J1aWx0aW4sXG5cdFx0XHRpc1N5c3RlbTogZXhpc3RpbmdFeHRlbnNpb24/LnR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtID8gdHJ1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdGluc3RhbGxlZFRpbWVzdGFtcDogRGF0ZS5ub3coKSxcblx0XHRcdHBpbm5lZDogdGhpcy5vcHRpb25zLmluc3RhbGxHaXZlblZlcnNpb24gPyB0cnVlIDogKHRoaXMub3B0aW9ucy5waW5uZWQgPz8gZXhpc3RpbmdFeHRlbnNpb24/LnBpbm5lZCksXG5cdFx0XHRzb3VyY2U6IHRoaXMuc291cmNlIGluc3RhbmNlb2YgVVJJID8gJ3ZzaXgnIDogJ2dhbGxlcnknLFxuXHRcdH07XG5cblx0XHRsZXQgbG9jYWw6IElMb2NhbEV4dGVuc2lvbiB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIFZTSVhcblx0XHRpZiAodGhpcy5zb3VyY2UgaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdGlmIChleGlzdGluZ0V4dGVuc2lvbikge1xuXHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb25LZXkuZXF1YWxzKG5ldyBFeHRlbnNpb25LZXkoZXhpc3RpbmdFeHRlbnNpb24uaWRlbnRpZmllciwgZXhpc3RpbmdFeHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbikpKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuZGVsZXRlRXh0ZW5zaW9uKGV4aXN0aW5nRXh0ZW5zaW9uLCAnZXhpc3RpbmcnKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdyZXN0YXJ0Q29kZScsIFwiUGxlYXNlIHJlc3RhcnQgVlMgQ29kZSBiZWZvcmUgcmVpbnN0YWxsaW5nIHswfS5cIiwgdGhpcy5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCB0aGlzLm1hbmlmZXN0Lm5hbWUpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVtb3ZlIHRoZSBleHRlbnNpb24gd2l0aCBzYW1lIHZlcnNpb24gaWYgaXQgaXMgYWxyZWFkeSB1bmluc3RhbGxlZC5cblx0XHRcdC8vIEluc3RhbGxpbmcgYSBWU0lYIGV4dGVuc2lvbiBzaGFsbCByZXBsYWNlIHRoZSBleGlzdGluZyBleHRlbnNpb24gYWx3YXlzLlxuXHRcdFx0Y29uc3QgZXhpc3RpbmdXaXRoU2FtZVZlcnNpb24gPSBhd2FpdCB0aGlzLnVuc2V0SWZSZW1vdmVkKHRoaXMuZXh0ZW5zaW9uS2V5KTtcblx0XHRcdGlmIChleGlzdGluZ1dpdGhTYW1lVmVyc2lvbikge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuZGVsZXRlRXh0ZW5zaW9uKGV4aXN0aW5nV2l0aFNhbWVWZXJzaW9uLCAnZXhpc3RpbmcnKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ3Jlc3RhcnRDb2RlJywgXCJQbGVhc2UgcmVzdGFydCBWUyBDb2RlIGJlZm9yZSByZWluc3RhbGxpbmcgezB9LlwiLCB0aGlzLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IHRoaXMubWFuaWZlc3QubmFtZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9XG5cblx0XHQvLyBHYWxsZXJ5XG5cdFx0ZWxzZSB7XG5cdFx0XHRtZXRhZGF0YS5pZCA9IHRoaXMuc291cmNlLmlkZW50aWZpZXIudXVpZDtcblx0XHRcdG1ldGFkYXRhLnB1Ymxpc2hlcklkID0gdGhpcy5zb3VyY2UucHVibGlzaGVySWQ7XG5cdFx0XHRtZXRhZGF0YS5wdWJsaXNoZXJEaXNwbGF5TmFtZSA9IHRoaXMuc291cmNlLnB1Ymxpc2hlckRpc3BsYXlOYW1lO1xuXHRcdFx0bWV0YWRhdGEudGFyZ2V0UGxhdGZvcm0gPSB0aGlzLnNvdXJjZS5wcm9wZXJ0aWVzLnRhcmdldFBsYXRmb3JtO1xuXHRcdFx0bWV0YWRhdGEudXBkYXRlZCA9ICEhZXhpc3RpbmdFeHRlbnNpb247XG5cdFx0XHRtZXRhZGF0YS5wcml2YXRlID0gdGhpcy5zb3VyY2UucHJpdmF0ZTtcblx0XHRcdG1ldGFkYXRhLmlzUHJlUmVsZWFzZVZlcnNpb24gPSB0aGlzLnNvdXJjZS5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb247XG5cdFx0XHRtZXRhZGF0YS5oYXNQcmVSZWxlYXNlVmVyc2lvbiA9IGV4aXN0aW5nRXh0ZW5zaW9uPy5oYXNQcmVSZWxlYXNlVmVyc2lvbiB8fCB0aGlzLnNvdXJjZS5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb247XG5cdFx0XHRtZXRhZGF0YS5wcmVSZWxlYXNlID0gaXNCb29sZWFuKHRoaXMub3B0aW9ucy5wcmVSZWxlYXNlKVxuXHRcdFx0XHQ/IHRoaXMub3B0aW9ucy5wcmVSZWxlYXNlXG5cdFx0XHRcdDogdGhpcy5vcHRpb25zLmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbiB8fCB0aGlzLnNvdXJjZS5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24gfHwgZXhpc3RpbmdFeHRlbnNpb24/LnByZVJlbGVhc2U7XG5cblx0XHRcdGlmIChleGlzdGluZ0V4dGVuc2lvbiAmJiBleGlzdGluZ0V4dGVuc2lvbi50eXBlICE9PSBFeHRlbnNpb25UeXBlLlN5c3RlbSAmJiBleGlzdGluZ0V4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uID09PSB0aGlzLnNvdXJjZS52ZXJzaW9uKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnVwZGF0ZU1ldGFkYXRhKGV4aXN0aW5nRXh0ZW5zaW9uLCBtZXRhZGF0YSwgdGhpcy5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVuc2V0IGlmIHRoZSBleHRlbnNpb24gaXMgdW5pbnN0YWxsZWQgYW5kIHJldHVybiB0aGUgdW5zZXQgZXh0ZW5zaW9uLlxuXHRcdFx0bG9jYWwgPSBhd2FpdCB0aGlzLnVuc2V0SWZSZW1vdmVkKHRoaXMuZXh0ZW5zaW9uS2V5KTtcblx0XHR9XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRocm93IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHR9XG5cblx0XHRpZiAoIWxvY2FsKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4dHJhY3RFeHRlbnNpb25Gbih0aGlzLm9wZXJhdGlvbiwgdG9rZW4pO1xuXHRcdFx0bG9jYWwgPSByZXN1bHQubG9jYWw7XG5cdFx0XHR0aGlzLl92ZXJpZmljYXRpb25TdGF0dXMgPSByZXN1bHQudmVyaWZpY2F0aW9uU3RhdHVzO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSwgdGhpcy5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbikpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLmluaXRpYWxpemVEZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnMoKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRocm93IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGVycm9yLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkludGlhbGl6ZURlZmF1bHRQcm9maWxlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRocm93IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLmFkZEV4dGVuc2lvbnNUb1Byb2ZpbGUoW1tsb2NhbCwgbWV0YWRhdGFdXSwgdGhpcy5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbiwgIWxvY2FsLmlzVmFsaWQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aHJvdyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlcnJvciwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5BZGRUb1Byb2ZpbGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuc2NhbkxvY2FsRXh0ZW5zaW9uKGxvY2FsLmxvY2F0aW9uLCBFeHRlbnNpb25UeXBlLlVzZXIsIHRoaXMub3B0aW9ucy5wcm9maWxlTG9jYXRpb24pO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKCdDYW5ub3QgZmluZCB0aGUgaW5zdGFsbGVkIGV4dGVuc2lvbicsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuSW5zdGFsbGVkRXh0ZW5zaW9uTm90Rm91bmQpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNvdXJjZSBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0dGhpcy51cGRhdGVNZXRhZGF0YShsb2NhbCwgdG9rZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVuc2V0SWZSZW1vdmVkKGV4dGVuc2lvbktleTogRXh0ZW5zaW9uS2V5KTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24gfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBJZiB0aGUgc2FtZSB2ZXJzaW9uIG9mIGV4dGVuc2lvbiBpcyBtYXJrZWQgYXMgcmVtb3ZlZCwgcmVtb3ZlIGl0IGZyb20gdGhlcmUgYW5kIHJldHVybiB0aGUgbG9jYWwuXG5cdFx0Y29uc3QgW3JlbW92ZWRdID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lci51bnNldEV4dGVuc2lvbnNGb3JSZW1vdmFsKGV4dGVuc2lvbktleSk7XG5cdFx0aWYgKHJlbW92ZWQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdSZW1vdmVkIHRoZSBleHRlbnNpb24gZnJvbSByZW1vdmVkIGxpc3Q6JywgZXh0ZW5zaW9uS2V5LmlkKTtcblx0XHRcdGNvbnN0IHVzZXJFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lci5zY2FuQWxsVXNlckV4dGVuc2lvbnMoKTtcblx0XHRcdHJldHVybiB1c2VyRXh0ZW5zaW9ucy5maW5kKGkgPT4gRXh0ZW5zaW9uS2V5LmNyZWF0ZShpKS5lcXVhbHMoZXh0ZW5zaW9uS2V5KSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0bGV0IFtnYWxsZXJ5RXh0ZW5zaW9uXSA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHZlcnNpb246IGV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uIH1dLCB0b2tlbik7XG5cdFx0XHRpZiAoIWdhbGxlcnlFeHRlbnNpb24pIHtcblx0XHRcdFx0W2dhbGxlcnlFeHRlbnNpb25dID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFt7IGlkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCB9XSwgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGdhbGxlcnlFeHRlbnNpb24pIHtcblx0XHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB7XG5cdFx0XHRcdFx0aWQ6IGdhbGxlcnlFeHRlbnNpb24uaWRlbnRpZmllci51dWlkLFxuXHRcdFx0XHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBnYWxsZXJ5RXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdHB1Ymxpc2hlcklkOiBnYWxsZXJ5RXh0ZW5zaW9uLnB1Ymxpc2hlcklkLFxuXHRcdFx0XHRcdGlzUHJlUmVsZWFzZVZlcnNpb246IGdhbGxlcnlFeHRlbnNpb24ucHJvcGVydGllcy5pc1ByZVJlbGVhc2VWZXJzaW9uLFxuXHRcdFx0XHRcdGhhc1ByZVJlbGVhc2VWZXJzaW9uOiBleHRlbnNpb24uaGFzUHJlUmVsZWFzZVZlcnNpb24gfHwgZ2FsbGVyeUV4dGVuc2lvbi5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24sXG5cdFx0XHRcdFx0cHJlUmVsZWFzZTogZ2FsbGVyeUV4dGVuc2lvbi5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24gfHwgdGhpcy5vcHRpb25zLmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvblxuXHRcdFx0XHR9O1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbiwgbWV0YWRhdGEsIHRoaXMub3B0aW9ucy5wcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvKiBJZ25vcmUgRXJyb3IgKi9cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVW5pbnN0YWxsRXh0ZW5zaW9uSW5Qcm9maWxlVGFzayBleHRlbmRzIEFic3RyYWN0RXh0ZW5zaW9uVGFzazx2b2lkPiBpbXBsZW1lbnRzIElVbmluc3RhbGxFeHRlbnNpb25UYXNrIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbixcblx0XHRyZWFkb25seSBvcHRpb25zOiBVbmluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2U6IElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGRvUnVuKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UucmVtb3ZlRXh0ZW5zaW9uc0Zyb21Qcm9maWxlKFt0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyXSwgdGhpcy5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbik7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxVQUFVLGFBQWE7QUFDaEMsU0FBUyxnQkFBZ0I7QUFHekIsU0FBUyxtQkFBbUIsdUJBQXVCO0FBQ25ELFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVk7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLGVBQWU7QUFDeEIsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksWUFBWTtBQUN4QixTQUFTLFdBQVcsV0FBVyxtQkFBbUI7QUFDbEQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFlBQVksU0FBUztBQUNyQixTQUFTLFNBQWdCLFdBQVc7QUFDcEMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCLGlDQUFpQztBQUMvRCxTQUFTLG9DQUFvQyx1QkFBb0csa0NBQWlFO0FBQ2xOO0FBQUEsRUFDQztBQUFBLEVBQTBCO0FBQUEsRUFBOEI7QUFBQSxFQUFnRDtBQUFBLEVBQWlFO0FBQUEsRUFHeks7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEs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LEtBQUs7QUFBQSxJQUNqQztBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLGVBQWUsY0FBa0U7QUFFOUYsVUFBTSxDQUFDLE9BQU8sSUFBSSxNQUFNLEtBQUssa0JBQWtCLDBCQUEwQixZQUFZO0FBQ3JGLFFBQUksU0FBUztBQUNaLFdBQUssV0FBVyxLQUFLLDRDQUE0QyxhQUFhLEVBQUU7QUFDaEYsWUFBTSxpQkFBaUIsTUFBTSxLQUFLLGtCQUFrQixzQkFBc0I7QUFDMUUsYUFBTyxlQUFlLEtBQUssT0FBSyxhQUFhLE9BQU8sQ0FBQyxFQUFFLE9BQU8sWUFBWSxDQUFDO0FBQUEsSUFDNUU7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxlQUFlLFdBQTRCLE9BQXlDO0FBQ2pHLFFBQUk7QUFDSCxVQUFJLENBQUMsZ0JBQWdCLElBQUksTUFBTSxLQUFLLGVBQWUsY0FBYyxDQUFDLEVBQUUsSUFBSSxVQUFVLFdBQVcsSUFBSSxTQUFTLFVBQVUsU0FBUyxRQUFRLENBQUMsR0FBRyxLQUFLO0FBQzlJLFVBQUksQ0FBQyxrQkFBa0I7QUFDdEIsU0FBQyxnQkFBZ0IsSUFBSSxNQUFNLEtBQUssZUFBZSxjQUFjLENBQUMsRUFBRSxJQUFJLFVBQVUsV0FBVyxHQUFHLENBQUMsR0FBRyxLQUFLO0FBQUEsTUFDdEc7QUFDQSxVQUFJLGtCQUFrQjtBQUNyQixjQUFNLFdBQVc7QUFBQSxVQUNoQixJQUFJLGlCQUFpQixXQUFXO0FBQUEsVUFDaEMsc0JBQXNCLGlCQUFpQjtBQUFBLFVBQ3ZDLGFBQWEsaUJBQWlCO0FBQUEsVUFDOUIscUJBQXFCLGlCQUFpQixXQUFXO0FBQUEsVUFDakQsc0JBQXNCLFVBQVUsd0JBQXdCLGlCQUFpQixXQUFXO0FBQUEsVUFDcEYsWUFBWSxpQkFBaUIsV0FBVyx1QkFBdUIsS0FBSyxRQUFRO0FBQUEsUUFDN0U7QUFDQSxjQUFNLEtBQUssa0JBQWtCLGVBQWUsV0FBVyxVQUFVLEtBQUssUUFBUSxlQUFlO0FBQUEsTUFDOUY7QUFBQSxJQUNELFNBQVMsT0FBTztBQUFBLElBRWhCO0FBQUEsRUFDRDtBQUNEO0FBbExNLGdDQUFOO0FBQUEsRUFpQkc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXZCRztBQW9MTixNQUFNLHdDQUF3QyxzQkFBK0Q7QUFBQSxFQUU1RyxZQUNVLFdBQ0EsU0FDUSxpQ0FDaEI7QUFDRCxVQUFNO0FBSkc7QUFDQTtBQUNRO0FBQUEsRUFHbEI7QUFBQSxFQUVVLE1BQU0sT0FBeUM7QUFDeEQsV0FBTyxLQUFLLGdDQUFnQyw0QkFBNEIsQ0FBQyxLQUFLLFVBQVUsVUFBVSxHQUFHLEtBQUssUUFBUSxlQUFlO0FBQUEsRUFDbEk7QUFFRDsiLAogICJuYW1lcyI6IFsiZmlsZXMiLCAiZSIsICJyZXN1bHQiXQp9Cg==
