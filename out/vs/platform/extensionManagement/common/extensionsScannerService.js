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
import { coalesce } from "../../../base/common/arrays.js";
import { ThrottledDelayer } from "../../../base/common/async.js";
import * as objects from "../../../base/common/objects.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { getErrorMessage } from "../../../base/common/errors.js";
import { getNodeType, parse } from "../../../base/common/json.js";
import { getParseErrorMessage } from "../../../base/common/jsonErrorMessages.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { FileAccess, Schemas } from "../../../base/common/network.js";
import * as path from "../../../base/common/path.js";
import * as platform from "../../../base/common/platform.js";
import { basename, isEqual, joinPath } from "../../../base/common/resources.js";
import * as semver from "../../../base/common/semver/semver.js";
import Severity from "../../../base/common/severity.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { areSameExtensions, computeTargetPlatform, getExtensionId, getGalleryExtensionId } from "./extensionManagementUtil.js";
import { ExtensionType, ExtensionIdentifier, TargetPlatform, UNDEFINED_PUBLISHER, BUILTIN_MANIFEST_CACHE_FILE, USER_MANIFEST_CACHE_FILE, ExtensionIdentifierMap, parseEnabledApiProposalNames } from "../../extensions/common/extensions.js";
import { validateExtensionManifest } from "../../extensions/common/extensionValidator.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { createDecorator, IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { Emitter } from "../../../base/common/event.js";
import { revive } from "../../../base/common/marshalling.js";
import { ExtensionsProfileScanningError, ExtensionsProfileScanningErrorCode, IExtensionsProfileScannerService } from "./extensionsProfileScannerService.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { localizeManifest } from "./extensionNls.js";
var Translations;
((Translations2) => {
  function equals(a, b) {
    if (a === b) {
      return true;
    }
    const aKeys = Object.keys(a);
    const bKeys = /* @__PURE__ */ new Set();
    for (const key of Object.keys(b)) {
      bKeys.add(key);
    }
    if (aKeys.length !== bKeys.size) {
      return false;
    }
    for (const key of aKeys) {
      if (a[key] !== b[key]) {
        return false;
      }
      bKeys.delete(key);
    }
    return bKeys.size === 0;
  }
  Translations2.equals = equals;
})(Translations || (Translations = {}));
function getProductBuiltInExtensionsEnabledWithAutoUpdates(productService, environmentService) {
  const result = /* @__PURE__ */ new Set();
  for (const id of productService.builtInExtensionsEnabledWithAutoUpdates) {
    const toLowerCaseId = id.toLowerCase();
    if (environmentService.skipBuiltinExtensions?.some((skipId) => skipId.toLowerCase() === toLowerCaseId)) {
      continue;
    }
    result.add(toLowerCaseId);
  }
  return result;
}
const IExtensionsScannerService = createDecorator("IExtensionsScannerService");
let AbstractExtensionsScannerService = class extends Disposable {
  constructor(systemExtensionsLocation, userExtensionsLocation, extensionsControlLocation, currentProfile, userDataProfilesService, extensionsProfileScannerService, fileService, logService, environmentService, productService, uriIdentityService, instantiationService) {
    super();
    this.systemExtensionsLocation = systemExtensionsLocation;
    this.userExtensionsLocation = userExtensionsLocation;
    this.extensionsControlLocation = extensionsControlLocation;
    this.userDataProfilesService = userDataProfilesService;
    this.extensionsProfileScannerService = extensionsProfileScannerService;
    this.fileService = fileService;
    this.logService = logService;
    this.environmentService = environmentService;
    this.productService = productService;
    this.uriIdentityService = uriIdentityService;
    this.instantiationService = instantiationService;
    this._onDidChangeCache = this._register(new Emitter());
    this.onDidChangeCache = this._onDidChangeCache.event;
    this.initializeDefaultProfileExtensionsPromise = void 0;
    this.systemExtensionsCachedScanner = this._register(this.instantiationService.createInstance(CachedExtensionsScanner, currentProfile));
    this.userExtensionsCachedScanner = this._register(this.instantiationService.createInstance(CachedExtensionsScanner, currentProfile));
    this.extensionsScanner = this._register(this.instantiationService.createInstance(ExtensionsScanner));
    this._register(this.systemExtensionsCachedScanner.onDidChangeCache(() => this._onDidChangeCache.fire(ExtensionType.System)));
    this._register(this.userExtensionsCachedScanner.onDidChangeCache(() => this._onDidChangeCache.fire(ExtensionType.User)));
  }
  getTargetPlatform() {
    if (!this._targetPlatformPromise) {
      this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
    }
    return this._targetPlatformPromise;
  }
  async scanAllExtensions(systemScanOptions, userScanOptions) {
    const [system, user] = await Promise.all([
      this.scanSystemExtensions(systemScanOptions),
      this.scanUserExtensions(userScanOptions)
    ]);
    return this.dedupExtensions(system, user, [], await this.getTargetPlatform(), true);
  }
  async scanSystemExtensions(scanOptions) {
    const promises = [];
    promises.push(this.scanDefaultSystemExtensions(scanOptions.language));
    promises.push(this.scanDevSystemExtensions(scanOptions.language, !!scanOptions.checkControlFile));
    const [defaultSystemExtensions, devSystemExtensions] = await Promise.all(promises);
    let allSystemExtensions = [...defaultSystemExtensions, ...devSystemExtensions];
    if (this.environmentService.skipBuiltinExtensions?.length) {
      const skipSet = new Set(this.environmentService.skipBuiltinExtensions.map((id) => id.toLowerCase()));
      allSystemExtensions = allSystemExtensions.filter((ext) => !skipSet.has(ext.identifier.id.toLowerCase()));
    }
    return this.applyScanOptions(allSystemExtensions, ExtensionType.System, { pickLatest: false });
  }
  async scanUserExtensions(scanOptions) {
    this.logService.trace("Started scanning user extensions", scanOptions.profileLocation);
    const profileScanOptions = this.uriIdentityService.extUri.isEqual(scanOptions.profileLocation, this.userDataProfilesService.defaultProfile.extensionsResource) ? { bailOutWhenFileNotFound: true } : void 0;
    const extensionsScannerInput = await this.createExtensionScannerInput(scanOptions.profileLocation, true, ExtensionType.User, scanOptions.language, true, profileScanOptions, scanOptions.productVersion ?? this.getProductVersion());
    const extensionsScanner = scanOptions.useCache && !extensionsScannerInput.devMode ? this.userExtensionsCachedScanner : this.extensionsScanner;
    let extensions;
    try {
      extensions = await extensionsScanner.scanExtensions(extensionsScannerInput);
    } catch (error) {
      if (error instanceof ExtensionsProfileScanningError && error.code === ExtensionsProfileScanningErrorCode.ERROR_PROFILE_NOT_FOUND) {
        await this.doInitializeDefaultProfileExtensions();
        extensions = await extensionsScanner.scanExtensions(extensionsScannerInput);
      } else {
        throw error;
      }
    }
    extensions = await this.applyScanOptions(extensions, ExtensionType.User, { includeInvalid: scanOptions.includeInvalid, pickLatest: true });
    this.logService.trace("Scanned user extensions:", extensions.length);
    return extensions;
  }
  async scanAllUserExtensions(scanOptions = { includeInvalid: true, includeAllVersions: true }) {
    const extensionsScannerInput = await this.createExtensionScannerInput(this.userExtensionsLocation, false, ExtensionType.User, void 0, true, void 0, this.getProductVersion());
    const extensions = await this.extensionsScanner.scanExtensions(extensionsScannerInput);
    return this.applyScanOptions(extensions, ExtensionType.User, { includeAllVersions: scanOptions.includeAllVersions, includeInvalid: scanOptions.includeInvalid });
  }
  async scanExtensionsUnderDevelopment(existingExtensions, scanOptions) {
    if (this.environmentService.isExtensionDevelopment && this.environmentService.extensionDevelopmentLocationURI) {
      const extensions = (await Promise.all(this.environmentService.extensionDevelopmentLocationURI.filter((extLoc) => extLoc.scheme === Schemas.file).map(async (extensionDevelopmentLocationURI) => {
        const input = await this.createExtensionScannerInput(extensionDevelopmentLocationURI, false, ExtensionType.User, scanOptions.language, false, void 0, this.getProductVersion());
        const extensions2 = await this.extensionsScanner.scanOneOrMultipleExtensions(input);
        return extensions2.map((extension) => {
          extension.type = existingExtensions.find((e) => areSameExtensions(e.identifier, extension.identifier))?.type ?? extension.type;
          return this.extensionsScanner.validate(extension, input);
        });
      }))).flat();
      return this.applyScanOptions(extensions, "development", { includeInvalid: scanOptions.includeInvalid, pickLatest: true });
    }
    return [];
  }
  async scanExistingExtension(extensionLocation, extensionType, scanOptions) {
    const extensionsScannerInput = await this.createExtensionScannerInput(extensionLocation, false, extensionType, scanOptions.language, true, void 0, this.getProductVersion());
    const extension = await this.extensionsScanner.scanExtension(extensionsScannerInput);
    if (!extension) {
      return null;
    }
    if (!scanOptions.includeInvalid && !extension.isValid) {
      return null;
    }
    return extension;
  }
  async scanOneOrMultipleExtensions(extensionLocation, extensionType, scanOptions) {
    const extensionsScannerInput = await this.createExtensionScannerInput(extensionLocation, false, extensionType, scanOptions.language, true, void 0, this.getProductVersion());
    const extensions = await this.extensionsScanner.scanOneOrMultipleExtensions(extensionsScannerInput);
    return this.applyScanOptions(extensions, extensionType, { includeInvalid: scanOptions.includeInvalid, pickLatest: true });
  }
  async scanMultipleExtensions(extensionLocations, extensionType, scanOptions) {
    const extensions = [];
    await Promise.all(extensionLocations.map(async (extensionLocation) => {
      const scannedExtensions = await this.scanOneOrMultipleExtensions(extensionLocation, extensionType, scanOptions);
      extensions.push(...scannedExtensions);
    }));
    return this.applyScanOptions(extensions, extensionType, { includeInvalid: scanOptions.includeInvalid, pickLatest: true });
  }
  async updateManifestMetadata(extensionLocation, metaData) {
    const manifestLocation = joinPath(extensionLocation, "package.json");
    const content = (await this.fileService.readFile(manifestLocation)).value.toString();
    const manifest = JSON.parse(content);
    manifest.__metadata = { ...manifest.__metadata, ...metaData };
    await this.fileService.writeFile(joinPath(extensionLocation, "package.json"), VSBuffer.fromString(JSON.stringify(manifest, null, "	")));
  }
  async initializeDefaultProfileExtensions() {
    try {
      await this.extensionsProfileScannerService.scanProfileExtensions(this.userDataProfilesService.defaultProfile.extensionsResource, { bailOutWhenFileNotFound: true });
    } catch (error) {
      if (error instanceof ExtensionsProfileScanningError && error.code === ExtensionsProfileScanningErrorCode.ERROR_PROFILE_NOT_FOUND) {
        await this.doInitializeDefaultProfileExtensions();
      } else {
        throw error;
      }
    }
  }
  async doInitializeDefaultProfileExtensions() {
    if (!this.initializeDefaultProfileExtensionsPromise) {
      this.initializeDefaultProfileExtensionsPromise = (async () => {
        try {
          this.logService.info("Started initializing default profile extensions in extensions installation folder.", this.userExtensionsLocation.toString());
          const userExtensions = await this.scanAllUserExtensions({ includeInvalid: true });
          if (userExtensions.length) {
            await this.extensionsProfileScannerService.addExtensionsToProfile(userExtensions.map((e) => [e, e.metadata]), this.userDataProfilesService.defaultProfile.extensionsResource);
          } else {
            try {
              await this.fileService.createFile(this.userDataProfilesService.defaultProfile.extensionsResource, VSBuffer.fromString(JSON.stringify([])));
            } catch (error) {
              if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
                this.logService.warn("Failed to create default profile extensions manifest in extensions installation folder.", this.userExtensionsLocation.toString(), getErrorMessage(error));
              }
            }
          }
          this.logService.info("Completed initializing default profile extensions in extensions installation folder.", this.userExtensionsLocation.toString());
        } catch (error) {
          this.logService.error(error);
        } finally {
          this.initializeDefaultProfileExtensionsPromise = void 0;
        }
      })();
    }
    return this.initializeDefaultProfileExtensionsPromise;
  }
  async applyScanOptions(extensions, type, scanOptions = {}) {
    if (!scanOptions.includeAllVersions) {
      extensions = this.dedupExtensions(type === ExtensionType.System ? extensions : void 0, type === ExtensionType.User ? extensions : void 0, type === "development" ? extensions : void 0, await this.getTargetPlatform(), !!scanOptions.pickLatest);
    }
    if (!scanOptions.includeInvalid) {
      extensions = extensions.filter((extension) => extension.isValid);
    }
    return extensions.sort((a, b) => {
      const aLastSegment = path.basename(a.location.fsPath);
      const bLastSegment = path.basename(b.location.fsPath);
      if (aLastSegment < bLastSegment) {
        return -1;
      }
      if (aLastSegment > bLastSegment) {
        return 1;
      }
      return 0;
    });
  }
  dedupExtensions(system, user, development, targetPlatform, pickLatest) {
    const pick = (existing, extension, isDevelopment) => {
      if (!isDevelopment && !(existing.isBuiltin || extension.isBuiltin)) {
        if (existing.metadata?.isApplicationScoped && !extension.metadata?.isApplicationScoped) {
          return false;
        }
        if (!existing.metadata?.isApplicationScoped && extension.metadata?.isApplicationScoped) {
          return true;
        }
      }
      if (existing.isValid && !extension.isValid) {
        return false;
      }
      if (existing.isValid === extension.isValid) {
        if (pickLatest && semver.gt(existing.manifest.version, extension.manifest.version)) {
          this.logService.debug(`Skipping extension ${extension.location.path} with lower version ${extension.manifest.version} in favour of ${existing.location.path} with version ${existing.manifest.version}`);
          return false;
        }
        if (semver.eq(existing.manifest.version, extension.manifest.version)) {
          if (existing.type === ExtensionType.System) {
            this.logService.debug(`Skipping extension ${extension.location.path} in favour of system extension ${existing.location.path} with same version`);
            return false;
          }
          if (existing.targetPlatform === targetPlatform) {
            this.logService.debug(`Skipping extension ${extension.location.path} from different target platform ${extension.targetPlatform}`);
            return false;
          }
        }
      }
      if (isDevelopment) {
        this.logService.warn(`Overwriting user extension ${existing.location.path} with ${extension.location.path}.`);
      } else {
        this.logService.debug(`Overwriting user extension ${existing.location.path} with ${extension.location.path}.`);
      }
      return true;
    };
    const result = new ExtensionIdentifierMap();
    system?.forEach((extension) => {
      const existing = result.get(extension.identifier.id);
      if (!existing || pick(existing, extension, false)) {
        result.set(extension.identifier.id, extension);
      }
    });
    const productBuiltInExtensionsEnabledWithAutoUpdates = getProductBuiltInExtensionsEnabledWithAutoUpdates(this.productService, this.environmentService);
    user?.forEach((extension) => {
      const existing = result.get(extension.identifier.id);
      if (!existing && system && extension.type === ExtensionType.System) {
        this.logService.debug(`Skipping obsolete system extension ${extension.location.path}.`);
        return;
      }
      if (productBuiltInExtensionsEnabledWithAutoUpdates.has(extension.identifier.id.toLowerCase()) && !extension.forceAutoUpdate) {
        this.logService.info(`Skipping user installed builtin extension ${extension.identifier.id} with version ${extension.manifest.version} because it is not allowed to in the current product quality ${this.productService.quality}`);
        return;
      }
      if (!existing || pick(existing, extension, false)) {
        result.set(extension.identifier.id, extension);
      }
    });
    development?.forEach((extension) => {
      const existing = result.get(extension.identifier.id);
      if (!existing || pick(existing, extension, true)) {
        result.set(extension.identifier.id, extension);
      }
      result.set(extension.identifier.id, extension);
    });
    return [...result.values()];
  }
  async scanDefaultSystemExtensions(language) {
    this.logService.trace("Started scanning system extensions");
    const extensionsScannerInput = await this.createExtensionScannerInput(this.systemExtensionsLocation, false, ExtensionType.System, language, true, void 0, this.getProductVersion());
    const extensionsScanner = extensionsScannerInput.devMode ? this.extensionsScanner : this.systemExtensionsCachedScanner;
    const result = await extensionsScanner.scanExtensions(extensionsScannerInput);
    this.logService.trace("Scanned system extensions:", result.length);
    return result;
  }
  async scanDevSystemExtensions(language, checkControlFile) {
    const devSystemExtensionsList = this.environmentService.isBuilt ? [] : this.productService.builtInExtensions;
    if (!devSystemExtensionsList?.length) {
      return [];
    }
    this.logService.trace("Started scanning dev system extensions");
    const builtinExtensionControl = checkControlFile ? await this.getBuiltInExtensionControl() : {};
    const devSystemExtensionsLocations = [];
    const devSystemExtensionsLocation = URI.file(path.normalize(path.join(FileAccess.asFileUri("").fsPath, "..", ".build", "builtInExtensions")));
    for (const extension of devSystemExtensionsList) {
      const controlState = builtinExtensionControl[extension.name] || "marketplace";
      switch (controlState) {
        case "disabled":
          break;
        case "marketplace":
          devSystemExtensionsLocations.push(joinPath(devSystemExtensionsLocation, extension.name));
          break;
        default:
          devSystemExtensionsLocations.push(URI.file(controlState));
          break;
      }
    }
    const result = await Promise.all(devSystemExtensionsLocations.map(async (location) => this.extensionsScanner.scanExtension(await this.createExtensionScannerInput(location, false, ExtensionType.System, language, true, void 0, this.getProductVersion()))));
    this.logService.trace("Scanned dev system extensions:", result.length);
    return coalesce(result);
  }
  async getBuiltInExtensionControl() {
    try {
      const content = await this.fileService.readFile(this.extensionsControlLocation);
      return JSON.parse(content.value.toString());
    } catch (error) {
      return {};
    }
  }
  async createExtensionScannerInput(location, profile, type, language, validate, profileScanOptions, productVersion) {
    const translations = await this.getTranslations(language ?? platform.language);
    const mtime = await this.getMtime(location);
    const applicationExtensionsLocation = profile && !this.uriIdentityService.extUri.isEqual(location, this.userDataProfilesService.defaultProfile.extensionsResource) ? this.userDataProfilesService.defaultProfile.extensionsResource : void 0;
    const applicationExtensionsLocationMtime = applicationExtensionsLocation ? await this.getMtime(applicationExtensionsLocation) : void 0;
    return new ExtensionScannerInput(
      location,
      mtime,
      applicationExtensionsLocation,
      applicationExtensionsLocationMtime,
      profile,
      profileScanOptions,
      type,
      validate,
      productVersion.version,
      productVersion.date,
      this.productService.commit,
      !this.environmentService.isBuilt,
      language,
      translations
    );
  }
  async getMtime(location) {
    try {
      const stat = await this.fileService.stat(location);
      if (typeof stat.mtime === "number") {
        return stat.mtime;
      }
    } catch (err) {
    }
    return void 0;
  }
  getProductVersion() {
    return {
      version: this.productService.version,
      date: this.productService.date
    };
  }
};
AbstractExtensionsScannerService = __decorateClass([
  __decorateParam(4, IUserDataProfilesService),
  __decorateParam(5, IExtensionsProfileScannerService),
  __decorateParam(6, IFileService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IEnvironmentService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IUriIdentityService),
  __decorateParam(11, IInstantiationService)
], AbstractExtensionsScannerService);
class ExtensionScannerInput {
  constructor(location, mtime, applicationExtensionslocation, applicationExtensionslocationMtime, profile, profileScanOptions, type, validate, productVersion, productDate, productCommit, devMode, language, translations) {
    this.location = location;
    this.mtime = mtime;
    this.applicationExtensionslocation = applicationExtensionslocation;
    this.applicationExtensionslocationMtime = applicationExtensionslocationMtime;
    this.profile = profile;
    this.profileScanOptions = profileScanOptions;
    this.type = type;
    this.validate = validate;
    this.productVersion = productVersion;
    this.productDate = productDate;
    this.productCommit = productCommit;
    this.devMode = devMode;
    this.language = language;
    this.translations = translations;
  }
  static createNlsConfiguration(input) {
    return {
      language: input.language,
      pseudo: input.language === "pseudo",
      devMode: input.devMode,
      translations: input.translations
    };
  }
  static equals(a, b) {
    return isEqual(a.location, b.location) && a.mtime === b.mtime && isEqual(a.applicationExtensionslocation, b.applicationExtensionslocation) && a.applicationExtensionslocationMtime === b.applicationExtensionslocationMtime && a.profile === b.profile && objects.equals(a.profileScanOptions, b.profileScanOptions) && a.type === b.type && a.validate === b.validate && a.productVersion === b.productVersion && a.productDate === b.productDate && a.productCommit === b.productCommit && a.devMode === b.devMode && a.language === b.language && Translations.equals(a.translations, b.translations);
  }
}
let ExtensionsScanner = class extends Disposable {
  constructor(extensionsProfileScannerService, uriIdentityService, fileService, productService, environmentService, logService) {
    super();
    this.extensionsProfileScannerService = extensionsProfileScannerService;
    this.uriIdentityService = uriIdentityService;
    this.fileService = fileService;
    this.logService = logService;
    this.productQuality = productService.quality;
    this.productBuiltInExtensionsEnabledWithAutoUpdates = getProductBuiltInExtensionsEnabledWithAutoUpdates(productService, environmentService);
  }
  async scanExtensions(input) {
    return input.profile ? this.scanExtensionsFromProfile(input) : this.scanExtensionsFromLocation(input);
  }
  async scanExtensionsFromLocation(input) {
    const stat = await this.fileService.resolve(input.location);
    if (!stat.children?.length) {
      return [];
    }
    const extensions = await Promise.all(
      stat.children.map(async (c) => {
        if (!c.isDirectory) {
          return null;
        }
        if (input.type === ExtensionType.User && basename(c.resource).indexOf(".") === 0) {
          return null;
        }
        const extensionScannerInput = new ExtensionScannerInput(c.resource, input.mtime, input.applicationExtensionslocation, input.applicationExtensionslocationMtime, input.profile, input.profileScanOptions, input.type, input.validate, input.productVersion, input.productDate, input.productCommit, input.devMode, input.language, input.translations);
        return this.scanExtension(extensionScannerInput);
      })
    );
    return coalesce(extensions).sort((a, b) => a.location.path < b.location.path ? -1 : 1);
  }
  async scanExtensionsFromProfile(input) {
    let profileExtensions = await this.scanExtensionsFromProfileResource(input.location, () => true, input);
    if (input.applicationExtensionslocation && !this.uriIdentityService.extUri.isEqual(input.location, input.applicationExtensionslocation)) {
      profileExtensions = profileExtensions.filter((e) => !e.metadata?.isApplicationScoped);
      const applicationExtensions = await this.scanExtensionsFromProfileResource(input.applicationExtensionslocation, (e) => !!e.metadata?.isBuiltin || !!e.metadata?.isApplicationScoped, input);
      profileExtensions.push(...applicationExtensions);
    }
    return profileExtensions;
  }
  async scanExtensionsFromProfileResource(profileResource, filter, input) {
    const scannedProfileExtensions = await this.extensionsProfileScannerService.scanProfileExtensions(profileResource, input.profileScanOptions);
    if (!scannedProfileExtensions.length) {
      return [];
    }
    const extensions = await Promise.all(
      scannedProfileExtensions.map(async (extensionInfo) => {
        if (filter(extensionInfo)) {
          const extensionScannerInput = new ExtensionScannerInput(extensionInfo.location, input.mtime, input.applicationExtensionslocation, input.applicationExtensionslocationMtime, input.profile, input.profileScanOptions, input.type, input.validate, input.productVersion, input.productDate, input.productCommit, input.devMode, input.language, input.translations);
          return this.scanExtension(extensionScannerInput, extensionInfo);
        }
        return null;
      })
    );
    return coalesce(extensions);
  }
  async scanOneOrMultipleExtensions(input) {
    try {
      if (await this.fileService.exists(joinPath(input.location, "package.json"))) {
        const extension = await this.scanExtension(input);
        return extension ? [extension] : [];
      } else {
        return await this.scanExtensions(input);
      }
    } catch (error) {
      this.logService.error(`Error scanning extensions at ${input.location.path}:`, getErrorMessage(error));
      return [];
    }
  }
  async scanExtension(input, scannedProfileExtension) {
    const validations = [];
    let isValid = true;
    let manifest;
    try {
      manifest = await this.scanExtensionManifest(input.location);
    } catch (e) {
      if (scannedProfileExtension) {
        validations.push([Severity.Error, getErrorMessage(e)]);
        isValid = false;
        const [publisher, name] = scannedProfileExtension.identifier.id.split(".");
        manifest = {
          name,
          publisher,
          version: scannedProfileExtension.version,
          engines: { vscode: "" }
        };
      } else {
        if (input.type !== ExtensionType.System) {
          this.logService.error(e);
        }
        return null;
      }
    }
    if (!manifest.publisher) {
      manifest.publisher = UNDEFINED_PUBLISHER;
    }
    let metadata;
    if (scannedProfileExtension) {
      metadata = {
        ...scannedProfileExtension.metadata,
        size: manifest.__metadata?.size
      };
    } else if (manifest.__metadata) {
      metadata = {
        installedTimestamp: manifest.__metadata.installedTimestamp,
        size: manifest.__metadata.size,
        targetPlatform: manifest.__metadata.targetPlatform
      };
    }
    delete manifest.__metadata;
    const id = getGalleryExtensionId(manifest.publisher, manifest.name);
    const identifier = metadata?.id ? { id, uuid: metadata.id } : { id };
    const type = metadata?.isSystem ? ExtensionType.System : input.type;
    const isBuiltin = type === ExtensionType.System || !!metadata?.isBuiltin;
    try {
      manifest = await this.translateManifest(input.location, manifest, ExtensionScannerInput.createNlsConfiguration(input));
    } catch (error) {
      this.logService.warn("Failed to translate manifest", getErrorMessage(error));
    }
    let extension = {
      type,
      identifier,
      manifest,
      location: input.location,
      isBuiltin,
      targetPlatform: metadata?.targetPlatform ?? TargetPlatform.UNDEFINED,
      publisherDisplayName: metadata?.publisherDisplayName,
      metadata,
      isValid,
      validations,
      preRelease: !!metadata?.preRelease,
      forceAutoUpdate: this.productBuiltInExtensionsEnabledWithAutoUpdates.has(id.toLowerCase()) && this.productQuality === "stable"
    };
    if (input.validate) {
      extension = this.validate(extension, input);
    }
    if (manifest.enabledApiProposals) {
      manifest.originalEnabledApiProposals = manifest.enabledApiProposals;
      manifest.enabledApiProposals = parseEnabledApiProposalNames([...manifest.enabledApiProposals]);
    }
    return extension;
  }
  validate(extension, input) {
    let isValid = extension.isValid;
    const validations = validateExtensionManifest(input.productVersion, input.productDate, input.location, extension.manifest, extension.isBuiltin);
    for (const [severity, message] of validations) {
      if (severity === Severity.Error) {
        isValid = false;
        this.logService.error(this.formatMessage(input.location, message));
      }
    }
    extension.isValid = isValid;
    extension.validations = [...extension.validations, ...validations];
    return extension;
  }
  async scanExtensionManifest(extensionLocation) {
    const manifestLocation = joinPath(extensionLocation, "package.json");
    let content;
    try {
      content = (await this.fileService.readFile(manifestLocation)).value.toString();
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.error(this.formatMessage(extensionLocation, localize("fileReadFail", "Cannot read file {0}: {1}.", manifestLocation.path, error.message)));
      }
      throw error;
    }
    let manifest;
    try {
      manifest = JSON.parse(content);
    } catch (err) {
      const errors = [];
      parse(content, errors);
      for (const e of errors) {
        this.logService.error(this.formatMessage(extensionLocation, localize("jsonParseFail", "Failed to parse {0}: [{1}, {2}] {3}.", manifestLocation.path, e.offset, e.length, getParseErrorMessage(e.error))));
      }
      throw err;
    }
    if (getNodeType(manifest) !== "object") {
      const errorMessage = this.formatMessage(extensionLocation, localize("jsonParseInvalidType", "Invalid manifest file {0}: Not a JSON object.", manifestLocation.path));
      this.logService.error(errorMessage);
      throw new Error(errorMessage);
    }
    return manifest;
  }
  async translateManifest(extensionLocation, extensionManifest, nlsConfiguration) {
    const localizedMessages = await this.getLocalizedMessages(extensionLocation, extensionManifest, nlsConfiguration);
    if (localizedMessages) {
      try {
        const errors = [];
        const defaults = await this.resolveOriginalMessageBundle(localizedMessages.default, errors);
        if (errors.length > 0) {
          errors.forEach((error) => {
            this.logService.error(this.formatMessage(extensionLocation, localize("jsonsParseReportErrors", "Failed to parse {0}: {1}.", localizedMessages.default?.path, getParseErrorMessage(error.error))));
          });
          return extensionManifest;
        } else if (getNodeType(localizedMessages) !== "object") {
          this.logService.error(this.formatMessage(extensionLocation, localize("jsonInvalidFormat", "Invalid format {0}: JSON object expected.", localizedMessages.default?.path)));
          return extensionManifest;
        }
        const localized = localizedMessages.values || /* @__PURE__ */ Object.create(null);
        return localizeManifest(this.logService, extensionManifest, localized, defaults);
      } catch (error) {
      }
    }
    return extensionManifest;
  }
  async getLocalizedMessages(extensionLocation, extensionManifest, nlsConfiguration) {
    const defaultPackageNLS = joinPath(extensionLocation, "package.nls.json");
    const reportErrors = (localized, errors) => {
      errors.forEach((error) => {
        this.logService.error(this.formatMessage(extensionLocation, localize("jsonsParseReportErrors", "Failed to parse {0}: {1}.", localized?.path, getParseErrorMessage(error.error))));
      });
    };
    const reportInvalidFormat = (localized) => {
      this.logService.error(this.formatMessage(extensionLocation, localize("jsonInvalidFormat", "Invalid format {0}: JSON object expected.", localized?.path)));
    };
    const translationId = `${extensionManifest.publisher}.${extensionManifest.name}`;
    const translationPath = nlsConfiguration.translations[translationId];
    if (translationPath) {
      try {
        const translationResource = URI.file(translationPath);
        const content = (await this.fileService.readFile(translationResource)).value.toString();
        const errors = [];
        const translationBundle = parse(content, errors);
        if (errors.length > 0) {
          reportErrors(translationResource, errors);
          return { values: void 0, default: defaultPackageNLS };
        } else if (getNodeType(translationBundle) !== "object") {
          reportInvalidFormat(translationResource);
          return { values: void 0, default: defaultPackageNLS };
        } else {
          const values = translationBundle.contents ? translationBundle.contents.package : void 0;
          return { values, default: defaultPackageNLS };
        }
      } catch (error) {
        return { values: void 0, default: defaultPackageNLS };
      }
    } else {
      const exists = await this.fileService.exists(defaultPackageNLS);
      if (!exists) {
        return void 0;
      }
      let messageBundle;
      try {
        messageBundle = await this.findMessageBundles(extensionLocation, nlsConfiguration);
      } catch (error) {
        return void 0;
      }
      if (!messageBundle.localized) {
        return { values: void 0, default: messageBundle.original };
      }
      try {
        const messageBundleContent = (await this.fileService.readFile(messageBundle.localized)).value.toString();
        const errors = [];
        const messages = parse(messageBundleContent, errors);
        if (errors.length > 0) {
          reportErrors(messageBundle.localized, errors);
          return { values: void 0, default: messageBundle.original };
        } else if (getNodeType(messages) !== "object") {
          reportInvalidFormat(messageBundle.localized);
          return { values: void 0, default: messageBundle.original };
        }
        return { values: messages, default: messageBundle.original };
      } catch (error) {
        return { values: void 0, default: messageBundle.original };
      }
    }
  }
  /**
   * Parses original message bundle, returns null if the original message bundle is null.
   */
  async resolveOriginalMessageBundle(originalMessageBundle, errors) {
    if (originalMessageBundle) {
      try {
        const originalBundleContent = (await this.fileService.readFile(originalMessageBundle)).value.toString();
        return parse(originalBundleContent, errors);
      } catch (error) {
      }
    }
    return;
  }
  /**
   * Finds localized message bundle and the original (unlocalized) one.
   * If the localized file is not present, returns null for the original and marks original as localized.
   */
  findMessageBundles(extensionLocation, nlsConfiguration) {
    return new Promise((c, e) => {
      const loop = (locale) => {
        const toCheck = joinPath(extensionLocation, `package.nls.${locale}.json`);
        this.fileService.exists(toCheck).then((exists) => {
          if (exists) {
            c({ localized: toCheck, original: joinPath(extensionLocation, "package.nls.json") });
          }
          const index = locale.lastIndexOf("-");
          if (index === -1) {
            c({ localized: joinPath(extensionLocation, "package.nls.json"), original: null });
          } else {
            locale = locale.substring(0, index);
            loop(locale);
          }
        });
      };
      if (nlsConfiguration.devMode || nlsConfiguration.pseudo || !nlsConfiguration.language) {
        return c({ localized: joinPath(extensionLocation, "package.nls.json"), original: null });
      }
      loop(nlsConfiguration.language);
    });
  }
  formatMessage(extensionLocation, message) {
    return `[${extensionLocation.path}]: ${message}`;
  }
};
ExtensionsScanner = __decorateClass([
  __decorateParam(0, IExtensionsProfileScannerService),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IProductService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, ILogService)
], ExtensionsScanner);
let CachedExtensionsScanner = class extends ExtensionsScanner {
  constructor(currentProfile, userDataProfilesService, extensionsProfileScannerService, uriIdentityService, fileService, productService, environmentService, logService) {
    super(extensionsProfileScannerService, uriIdentityService, fileService, productService, environmentService, logService);
    this.currentProfile = currentProfile;
    this.userDataProfilesService = userDataProfilesService;
    this.cacheValidatorThrottler = this._register(new ThrottledDelayer(3e3));
    this._onDidChangeCache = this._register(new Emitter());
    this.onDidChangeCache = this._onDidChangeCache.event;
  }
  async scanExtensions(input) {
    const cacheFile = this.getCacheFile(input);
    const cacheContents = await this.readExtensionCache(cacheFile);
    this.input = input;
    if (cacheContents && cacheContents.input && ExtensionScannerInput.equals(cacheContents.input, this.input)) {
      this.logService.debug("Using cached extensions scan result", input.type === ExtensionType.System ? "system" : "user", input.location.toString());
      this.cacheValidatorThrottler.trigger(() => this.validateCache());
      return cacheContents.result.map((extension) => {
        extension.location = URI.revive(extension.location);
        return extension;
      });
    }
    const result = await super.scanExtensions(input);
    await this.writeExtensionCache(cacheFile, { input, result });
    return result;
  }
  async readExtensionCache(cacheFile) {
    try {
      const cacheRawContents = await this.fileService.readFile(cacheFile);
      const extensionCacheData = JSON.parse(cacheRawContents.value.toString());
      return { result: extensionCacheData.result, input: revive(extensionCacheData.input) };
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.debug("Error while reading the extension cache file:", cacheFile.path, getErrorMessage(error));
      }
    }
    return null;
  }
  async writeExtensionCache(cacheFile, cacheContents) {
    try {
      await this.fileService.writeFile(cacheFile, VSBuffer.fromString(JSON.stringify(cacheContents)));
    } catch (error) {
      this.logService.debug("Error while writing the extension cache file:", cacheFile.path, getErrorMessage(error));
    }
  }
  async validateCache() {
    if (!this.input) {
      return;
    }
    const cacheFile = this.getCacheFile(this.input);
    const cacheContents = await this.readExtensionCache(cacheFile);
    if (!cacheContents) {
      return;
    }
    const actual = cacheContents.result;
    const expected = JSON.parse(JSON.stringify(await super.scanExtensions(this.input)));
    if (objects.equals(expected, actual)) {
      return;
    }
    try {
      this.logService.info("Invalidating Cache", actual, expected);
      await this.fileService.del(cacheFile);
      this._onDidChangeCache.fire();
    } catch (error) {
      this.logService.error(error);
    }
  }
  getCacheFile(input) {
    const profile = this.getProfile(input);
    return this.uriIdentityService.extUri.joinPath(profile.cacheHome, input.type === ExtensionType.System ? BUILTIN_MANIFEST_CACHE_FILE : USER_MANIFEST_CACHE_FILE);
  }
  getProfile(input) {
    if (input.type === ExtensionType.System) {
      return this.userDataProfilesService.defaultProfile;
    }
    if (!input.profile) {
      return this.userDataProfilesService.defaultProfile;
    }
    if (this.uriIdentityService.extUri.isEqual(input.location, this.currentProfile.extensionsResource)) {
      return this.currentProfile;
    }
    return this.userDataProfilesService.profiles.find((p) => this.uriIdentityService.extUri.isEqual(input.location, p.extensionsResource)) ?? this.currentProfile;
  }
};
CachedExtensionsScanner = __decorateClass([
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IExtensionsProfileScannerService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IProductService),
  __decorateParam(6, IEnvironmentService),
  __decorateParam(7, ILogService)
], CachedExtensionsScanner);
function toExtensionDescription(extension, isUnderDevelopment) {
  const id = getExtensionId(extension.manifest.publisher, extension.manifest.name);
  return {
    id,
    identifier: new ExtensionIdentifier(id),
    isBuiltin: extension.type === ExtensionType.System,
    isUserBuiltin: extension.type === ExtensionType.User && extension.isBuiltin,
    isUnderDevelopment,
    extensionLocation: extension.location,
    uuid: extension.identifier.uuid,
    targetPlatform: extension.targetPlatform,
    publisherDisplayName: extension.publisherDisplayName,
    preRelease: extension.preRelease,
    ...extension.manifest
  };
}
class NativeExtensionsScannerService extends AbstractExtensionsScannerService {
  constructor(systemExtensionsLocation, userExtensionsLocation, userHome, currentProfile, userDataProfilesService, extensionsProfileScannerService, fileService, logService, environmentService, productService, uriIdentityService, instantiationService) {
    super(
      systemExtensionsLocation,
      userExtensionsLocation,
      joinPath(userHome, ".vscode-oss-dev", "extensions", "control.json"),
      currentProfile,
      userDataProfilesService,
      extensionsProfileScannerService,
      fileService,
      logService,
      environmentService,
      productService,
      uriIdentityService,
      instantiationService
    );
    this.translationsPromise = (async () => {
      if (platform.translationsConfigFile) {
        try {
          const content = await this.fileService.readFile(URI.file(platform.translationsConfigFile));
          return JSON.parse(content.value.toString());
        } catch (err) {
        }
      }
      return /* @__PURE__ */ Object.create(null);
    })();
  }
  getTranslations(language) {
    return this.translationsPromise;
  }
}
export {
  AbstractExtensionsScannerService,
  ExtensionScannerInput,
  IExtensionsScannerService,
  NativeExtensionsScannerService,
  Translations,
  toExtensionDescription
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcY29tbW9uXFxleHRlbnNpb25zU2Nhbm5lclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBnZXROb2RlVHlwZSwgcGFyc2UsIFBhcnNlRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IGdldFBhcnNlRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkVycm9yTWVzc2FnZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzLCBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGlzRXF1YWwsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCAqIGFzIHNlbXZlciBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZW12ZXIvc2VtdmVyLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFZlcnNpb24sIE1ldGFkYXRhIH0gZnJvbSAnLi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zLCBjb21wdXRlVGFyZ2V0UGxhdGZvcm0sIGdldEV4dGVuc2lvbklkLCBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQgfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblR5cGUsIEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25NYW5pZmVzdCwgVGFyZ2V0UGxhdGZvcm0sIElFeHRlbnNpb25JZGVudGlmaWVyLCBJUmVsYXhlZEV4dGVuc2lvbk1hbmlmZXN0LCBVTkRFRklORURfUFVCTElTSEVSLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIEJVSUxUSU5fTUFOSUZFU1RfQ0FDSEVfRklMRSwgVVNFUl9NQU5JRkVTVF9DQUNIRV9GSUxFLCBFeHRlbnNpb25JZGVudGlmaWVyTWFwLCBwYXJzZUVuYWJsZWRBcGlQcm9wb3NhbE5hbWVzIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyB2YWxpZGF0ZUV4dGVuc2lvbk1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uVmFsaWRhdG9yLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU2VydmljZSwgdG9GaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmluZ0Vycm9yLCBFeHRlbnNpb25zUHJvZmlsZVNjYW5uaW5nRXJyb3JDb2RlLCBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSwgSVByb2ZpbGVFeHRlbnNpb25zU2Nhbk9wdGlvbnMsIElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbiB9IGZyb20gJy4vZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IGxvY2FsaXplTWFuaWZlc3QgfSBmcm9tICcuL2V4dGVuc2lvbk5scy5qcyc7XG5cbmV4cG9ydCB0eXBlIE1hbmlmZXN0TWV0YWRhdGEgPSBQYXJ0aWFsPHtcblx0dGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtO1xuXHRpbnN0YWxsZWRUaW1lc3RhbXA6IG51bWJlcjtcblx0c2l6ZTogbnVtYmVyO1xufT47XG5cbmV4cG9ydCB0eXBlIElTY2FubmVkRXh0ZW5zaW9uTWFuaWZlc3QgPSBJUmVsYXhlZEV4dGVuc2lvbk1hbmlmZXN0ICYgeyBfX21ldGFkYXRhPzogTWFuaWZlc3RNZXRhZGF0YSB9O1xuXG5pbnRlcmZhY2UgSVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uIHtcblx0dHlwZTogRXh0ZW5zaW9uVHlwZTtcblx0aXNCdWlsdGluOiBib29sZWFuO1xuXHRpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcjtcblx0bWFuaWZlc3Q6IElSZWxheGVkRXh0ZW5zaW9uTWFuaWZlc3Q7XG5cdGxvY2F0aW9uOiBVUkk7XG5cdHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybTtcblx0cHVibGlzaGVyRGlzcGxheU5hbWU/OiBzdHJpbmc7XG5cdG1ldGFkYXRhOiBNZXRhZGF0YSB8IHVuZGVmaW5lZDtcblx0aXNWYWxpZDogYm9vbGVhbjtcblx0dmFsaWRhdGlvbnM6IHJlYWRvbmx5IFtTZXZlcml0eSwgc3RyaW5nXVtdO1xuXHRwcmVSZWxlYXNlOiBib29sZWFuO1xuXHRmb3JjZUF1dG9VcGRhdGU6IGJvb2xlYW47XG59XG5cbmV4cG9ydCB0eXBlIElTY2FubmVkRXh0ZW5zaW9uID0gUmVhZG9ubHk8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uPiAmIHsgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIFRyYW5zbGF0aW9ucyB7XG5cdFtpZDogc3RyaW5nXTogc3RyaW5nO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRyYW5zbGF0aW9ucyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBlcXVhbHMoYTogVHJhbnNsYXRpb25zLCBiOiBUcmFuc2xhdGlvbnMpOiBib29sZWFuIHtcblx0XHRpZiAoYSA9PT0gYikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGFLZXlzID0gT2JqZWN0LmtleXMoYSk7XG5cdFx0Y29uc3QgYktleXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoYikpIHtcblx0XHRcdGJLZXlzLmFkZChrZXkpO1xuXHRcdH1cblx0XHRpZiAoYUtleXMubGVuZ3RoICE9PSBiS2V5cy5zaXplKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgYUtleXMpIHtcblx0XHRcdGlmIChhW2tleV0gIT09IGJba2V5XSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRiS2V5cy5kZWxldGUoa2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGJLZXlzLnNpemUgPT09IDA7XG5cdH1cbn1cblxuaW50ZXJmYWNlIE1lc3NhZ2VCYWcge1xuXHRba2V5OiBzdHJpbmddOiBzdHJpbmcgfCB7IG1lc3NhZ2U6IHN0cmluZzsgY29tbWVudDogc3RyaW5nW10gfTtcbn1cblxuaW50ZXJmYWNlIFRyYW5zbGF0aW9uQnVuZGxlIHtcblx0Y29udGVudHM6IHtcblx0XHRwYWNrYWdlOiBNZXNzYWdlQmFnO1xuXHR9O1xufVxuXG5pbnRlcmZhY2UgTG9jYWxpemVkTWVzc2FnZXMge1xuXHR2YWx1ZXM6IE1lc3NhZ2VCYWcgfCB1bmRlZmluZWQ7XG5cdGRlZmF1bHQ6IFVSSSB8IG51bGw7XG59XG5cbmludGVyZmFjZSBJQnVpbHRJbkV4dGVuc2lvbkNvbnRyb2wge1xuXHRbbmFtZTogc3RyaW5nXTogJ21hcmtldHBsYWNlJyB8ICdkaXNhYmxlZCcgfCBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGdldFByb2R1Y3RCdWlsdEluRXh0ZW5zaW9uc0VuYWJsZWRXaXRoQXV0b1VwZGF0ZXMocHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlKTogU2V0PHN0cmluZz4ge1xuXHRjb25zdCByZXN1bHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Zm9yIChjb25zdCBpZCBvZiBwcm9kdWN0U2VydmljZS5idWlsdEluRXh0ZW5zaW9uc0VuYWJsZWRXaXRoQXV0b1VwZGF0ZXMpIHtcblx0XHRjb25zdCB0b0xvd2VyQ2FzZUlkID0gaWQudG9Mb3dlckNhc2UoKTtcblx0XHRpZiAoZW52aXJvbm1lbnRTZXJ2aWNlLnNraXBCdWlsdGluRXh0ZW5zaW9ucz8uc29tZShza2lwSWQgPT4gc2tpcElkLnRvTG93ZXJDYXNlKCkgPT09IHRvTG93ZXJDYXNlSWQpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0cmVzdWx0LmFkZCh0b0xvd2VyQ2FzZUlkKTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgdHlwZSBTeXN0ZW1FeHRlbnNpb25zU2Nhbk9wdGlvbnMgPSB7XG5cdHJlYWRvbmx5IGNoZWNrQ29udHJvbEZpbGU/OiBib29sZWFuO1xuXHRyZWFkb25seSBsYW5ndWFnZT86IHN0cmluZztcbn07XG5cbmV4cG9ydCB0eXBlIFVzZXJFeHRlbnNpb25zU2Nhbk9wdGlvbnMgPSB7XG5cdHJlYWRvbmx5IHByb2ZpbGVMb2NhdGlvbjogVVJJO1xuXHRyZWFkb25seSBpbmNsdWRlSW52YWxpZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGxhbmd1YWdlPzogc3RyaW5nO1xuXHRyZWFkb25seSB1c2VDYWNoZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHByb2R1Y3RWZXJzaW9uPzogSVByb2R1Y3RWZXJzaW9uO1xufTtcblxuZXhwb3J0IHR5cGUgU2Nhbk9wdGlvbnMgPSB7XG5cdHJlYWRvbmx5IGluY2x1ZGVJbnZhbGlkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbGFuZ3VhZ2U/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgY29uc3QgSUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlPignSUV4dGVuc2lvbnNTY2FubmVyU2VydmljZScpO1xuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHN5c3RlbUV4dGVuc2lvbnNMb2NhdGlvbjogVVJJO1xuXHRyZWFkb25seSB1c2VyRXh0ZW5zaW9uc0xvY2F0aW9uOiBVUkk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2FjaGU6IEV2ZW50PEV4dGVuc2lvblR5cGU+O1xuXG5cdHNjYW5BbGxFeHRlbnNpb25zKHN5c3RlbVNjYW5PcHRpb25zOiBTeXN0ZW1FeHRlbnNpb25zU2Nhbk9wdGlvbnMsIHVzZXJTY2FuT3B0aW9uczogVXNlckV4dGVuc2lvbnNTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT47XG5cdHNjYW5TeXN0ZW1FeHRlbnNpb25zKHNjYW5PcHRpb25zOiBTeXN0ZW1FeHRlbnNpb25zU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+O1xuXHRzY2FuVXNlckV4dGVuc2lvbnMoc2Nhbk9wdGlvbnM6IFVzZXJFeHRlbnNpb25zU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+O1xuXHRzY2FuQWxsVXNlckV4dGVuc2lvbnMoKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbltdPjtcblxuXHRzY2FuRXh0ZW5zaW9uc1VuZGVyRGV2ZWxvcG1lbnQoZXhpc3RpbmdFeHRlbnNpb25zOiBJU2Nhbm5lZEV4dGVuc2lvbltdLCBzY2FuT3B0aW9uczogU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+O1xuXHRzY2FuRXhpc3RpbmdFeHRlbnNpb24oZXh0ZW5zaW9uTG9jYXRpb246IFVSSSwgZXh0ZW5zaW9uVHlwZTogRXh0ZW5zaW9uVHlwZSwgc2Nhbk9wdGlvbnM6IFNjYW5PcHRpb25zKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbiB8IG51bGw+O1xuXHRzY2FuTXVsdGlwbGVFeHRlbnNpb25zKGV4dGVuc2lvbkxvY2F0aW9uczogVVJJW10sIGV4dGVuc2lvblR5cGU6IEV4dGVuc2lvblR5cGUsIHNjYW5PcHRpb25zOiBTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT47XG5cdHNjYW5PbmVPck11bHRpcGxlRXh0ZW5zaW9ucyhleHRlbnNpb25Mb2NhdGlvbjogVVJJLCBleHRlbnNpb25UeXBlOiBFeHRlbnNpb25UeXBlLCBzY2FuT3B0aW9uczogU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+O1xuXG5cdHVwZGF0ZU1hbmlmZXN0TWV0YWRhdGEoZXh0ZW5zaW9uTG9jYXRpb246IFVSSSwgbWV0YWRhdGE6IE1hbmlmZXN0TWV0YWRhdGEpOiBQcm9taXNlPHZvaWQ+O1xuXHRpbml0aWFsaXplRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zKCk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEV4dGVuc2lvbnNTY2FubmVyU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldFRyYW5zbGF0aW9ucyhsYW5ndWFnZTogc3RyaW5nKTogUHJvbWlzZTxUcmFuc2xhdGlvbnM+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ2FjaGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxFeHRlbnNpb25UeXBlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDYWNoZSA9IHRoaXMuX29uRGlkQ2hhbmdlQ2FjaGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzeXN0ZW1FeHRlbnNpb25zQ2FjaGVkU2Nhbm5lcjogQ2FjaGVkRXh0ZW5zaW9uc1NjYW5uZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgdXNlckV4dGVuc2lvbnNDYWNoZWRTY2FubmVyOiBDYWNoZWRFeHRlbnNpb25zU2Nhbm5lcjtcblx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zU2Nhbm5lcjogRXh0ZW5zaW9uc1NjYW5uZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgc3lzdGVtRXh0ZW5zaW9uc0xvY2F0aW9uOiBVUkksXG5cdFx0cmVhZG9ubHkgdXNlckV4dGVuc2lvbnNMb2NhdGlvbjogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc0NvbnRyb2xMb2NhdGlvbjogVVJJLFxuXHRcdGN1cnJlbnRQcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZTogSUV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zeXN0ZW1FeHRlbnNpb25zQ2FjaGVkU2Nhbm5lciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2FjaGVkRXh0ZW5zaW9uc1NjYW5uZXIsIGN1cnJlbnRQcm9maWxlKSk7XG5cdFx0dGhpcy51c2VyRXh0ZW5zaW9uc0NhY2hlZFNjYW5uZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENhY2hlZEV4dGVuc2lvbnNTY2FubmVyLCBjdXJyZW50UHJvZmlsZSkpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNTY2FubmVyKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN5c3RlbUV4dGVuc2lvbnNDYWNoZWRTY2FubmVyLm9uRGlkQ2hhbmdlQ2FjaGUoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VDYWNoZS5maXJlKEV4dGVuc2lvblR5cGUuU3lzdGVtKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXNlckV4dGVuc2lvbnNDYWNoZWRTY2FubmVyLm9uRGlkQ2hhbmdlQ2FjaGUoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VDYWNoZS5maXJlKEV4dGVuc2lvblR5cGUuVXNlcikpKTtcblx0fVxuXG5cdHByaXZhdGUgX3RhcmdldFBsYXRmb3JtUHJvbWlzZTogUHJvbWlzZTxUYXJnZXRQbGF0Zm9ybT4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0VGFyZ2V0UGxhdGZvcm0oKTogUHJvbWlzZTxUYXJnZXRQbGF0Zm9ybT4ge1xuXHRcdGlmICghdGhpcy5fdGFyZ2V0UGxhdGZvcm1Qcm9taXNlKSB7XG5cdFx0XHR0aGlzLl90YXJnZXRQbGF0Zm9ybVByb21pc2UgPSBjb21wdXRlVGFyZ2V0UGxhdGZvcm0odGhpcy5maWxlU2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3RhcmdldFBsYXRmb3JtUHJvbWlzZTtcblx0fVxuXG5cdGFzeW5jIHNjYW5BbGxFeHRlbnNpb25zKHN5c3RlbVNjYW5PcHRpb25zOiBTeXN0ZW1FeHRlbnNpb25zU2Nhbk9wdGlvbnMsIHVzZXJTY2FuT3B0aW9uczogVXNlckV4dGVuc2lvbnNTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IFtzeXN0ZW0sIHVzZXJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5zY2FuU3lzdGVtRXh0ZW5zaW9ucyhzeXN0ZW1TY2FuT3B0aW9ucyksXG5cdFx0XHR0aGlzLnNjYW5Vc2VyRXh0ZW5zaW9ucyh1c2VyU2Nhbk9wdGlvbnMpLFxuXHRcdF0pO1xuXHRcdHJldHVybiB0aGlzLmRlZHVwRXh0ZW5zaW9ucyhzeXN0ZW0sIHVzZXIsIFtdLCBhd2FpdCB0aGlzLmdldFRhcmdldFBsYXRmb3JtKCksIHRydWUpO1xuXHR9XG5cblx0YXN5bmMgc2NhblN5c3RlbUV4dGVuc2lvbnMoc2Nhbk9wdGlvbnM6IFN5c3RlbUV4dGVuc2lvbnNTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPElSZWxheGVkU2Nhbm5lZEV4dGVuc2lvbltdPltdID0gW107XG5cdFx0cHJvbWlzZXMucHVzaCh0aGlzLnNjYW5EZWZhdWx0U3lzdGVtRXh0ZW5zaW9ucyhzY2FuT3B0aW9ucy5sYW5ndWFnZSkpO1xuXHRcdHByb21pc2VzLnB1c2godGhpcy5zY2FuRGV2U3lzdGVtRXh0ZW5zaW9ucyhzY2FuT3B0aW9ucy5sYW5ndWFnZSwgISFzY2FuT3B0aW9ucy5jaGVja0NvbnRyb2xGaWxlKSk7XG5cdFx0Y29uc3QgW2RlZmF1bHRTeXN0ZW1FeHRlbnNpb25zLCBkZXZTeXN0ZW1FeHRlbnNpb25zXSA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0XHRsZXQgYWxsU3lzdGVtRXh0ZW5zaW9ucyA9IFsuLi5kZWZhdWx0U3lzdGVtRXh0ZW5zaW9ucywgLi4uZGV2U3lzdGVtRXh0ZW5zaW9uc107XG5cblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uuc2tpcEJ1aWx0aW5FeHRlbnNpb25zPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHNraXBTZXQgPSBuZXcgU2V0KHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnNraXBCdWlsdGluRXh0ZW5zaW9ucy5tYXAoaWQgPT4gaWQudG9Mb3dlckNhc2UoKSkpO1xuXHRcdFx0YWxsU3lzdGVtRXh0ZW5zaW9ucyA9IGFsbFN5c3RlbUV4dGVuc2lvbnMuZmlsdGVyKGV4dCA9PiAhc2tpcFNldC5oYXMoZXh0LmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmFwcGx5U2Nhbk9wdGlvbnMoYWxsU3lzdGVtRXh0ZW5zaW9ucywgRXh0ZW5zaW9uVHlwZS5TeXN0ZW0sIHsgcGlja0xhdGVzdDogZmFsc2UgfSk7XG5cdH1cblxuXHRhc3luYyBzY2FuVXNlckV4dGVuc2lvbnMoc2Nhbk9wdGlvbnM6IFVzZXJFeHRlbnNpb25zU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1N0YXJ0ZWQgc2Nhbm5pbmcgdXNlciBleHRlbnNpb25zJywgc2Nhbk9wdGlvbnMucHJvZmlsZUxvY2F0aW9uKTtcblx0XHRjb25zdCBwcm9maWxlU2Nhbk9wdGlvbnM6IElQcm9maWxlRXh0ZW5zaW9uc1NjYW5PcHRpb25zIHwgdW5kZWZpbmVkID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoc2Nhbk9wdGlvbnMucHJvZmlsZUxvY2F0aW9uLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSkgPyB7IGJhaWxPdXRXaGVuRmlsZU5vdEZvdW5kOiB0cnVlIH0gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1NjYW5uZXJJbnB1dCA9IGF3YWl0IHRoaXMuY3JlYXRlRXh0ZW5zaW9uU2Nhbm5lcklucHV0KHNjYW5PcHRpb25zLnByb2ZpbGVMb2NhdGlvbiwgdHJ1ZSwgRXh0ZW5zaW9uVHlwZS5Vc2VyLCBzY2FuT3B0aW9ucy5sYW5ndWFnZSwgdHJ1ZSwgcHJvZmlsZVNjYW5PcHRpb25zLCBzY2FuT3B0aW9ucy5wcm9kdWN0VmVyc2lvbiA/PyB0aGlzLmdldFByb2R1Y3RWZXJzaW9uKCkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNTY2FubmVyID0gc2Nhbk9wdGlvbnMudXNlQ2FjaGUgJiYgIWV4dGVuc2lvbnNTY2FubmVySW5wdXQuZGV2TW9kZSA/IHRoaXMudXNlckV4dGVuc2lvbnNDYWNoZWRTY2FubmVyIDogdGhpcy5leHRlbnNpb25zU2Nhbm5lcjtcblx0XHRsZXQgZXh0ZW5zaW9uczogSVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uW107XG5cdFx0dHJ5IHtcblx0XHRcdGV4dGVuc2lvbnMgPSBhd2FpdCBleHRlbnNpb25zU2Nhbm5lci5zY2FuRXh0ZW5zaW9ucyhleHRlbnNpb25zU2Nhbm5lcklucHV0KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmluZ0Vycm9yICYmIGVycm9yLmNvZGUgPT09IEV4dGVuc2lvbnNQcm9maWxlU2Nhbm5pbmdFcnJvckNvZGUuRVJST1JfUFJPRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb0luaXRpYWxpemVEZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnMoKTtcblx0XHRcdFx0ZXh0ZW5zaW9ucyA9IGF3YWl0IGV4dGVuc2lvbnNTY2FubmVyLnNjYW5FeHRlbnNpb25zKGV4dGVuc2lvbnNTY2FubmVySW5wdXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmFwcGx5U2Nhbk9wdGlvbnMoZXh0ZW5zaW9ucywgRXh0ZW5zaW9uVHlwZS5Vc2VyLCB7IGluY2x1ZGVJbnZhbGlkOiBzY2FuT3B0aW9ucy5pbmNsdWRlSW52YWxpZCwgcGlja0xhdGVzdDogdHJ1ZSB9KTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1NjYW5uZWQgdXNlciBleHRlbnNpb25zOicsIGV4dGVuc2lvbnMubGVuZ3RoKTtcblx0XHRyZXR1cm4gZXh0ZW5zaW9ucztcblx0fVxuXG5cdGFzeW5jIHNjYW5BbGxVc2VyRXh0ZW5zaW9ucyhzY2FuT3B0aW9uczogeyBpbmNsdWRlQWxsVmVyc2lvbnM/OiBib29sZWFuOyBpbmNsdWRlSW52YWxpZDogYm9vbGVhbiB9ID0geyBpbmNsdWRlSW52YWxpZDogdHJ1ZSwgaW5jbHVkZUFsbFZlcnNpb25zOiB0cnVlIH0pOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBleHRlbnNpb25zU2Nhbm5lcklucHV0ID0gYXdhaXQgdGhpcy5jcmVhdGVFeHRlbnNpb25TY2FubmVySW5wdXQodGhpcy51c2VyRXh0ZW5zaW9uc0xvY2F0aW9uLCBmYWxzZSwgRXh0ZW5zaW9uVHlwZS5Vc2VyLCB1bmRlZmluZWQsIHRydWUsIHVuZGVmaW5lZCwgdGhpcy5nZXRQcm9kdWN0VmVyc2lvbigpKTtcblx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25zU2Nhbm5lci5zY2FuRXh0ZW5zaW9ucyhleHRlbnNpb25zU2Nhbm5lcklucHV0KTtcblx0XHRyZXR1cm4gdGhpcy5hcHBseVNjYW5PcHRpb25zKGV4dGVuc2lvbnMsIEV4dGVuc2lvblR5cGUuVXNlciwgeyBpbmNsdWRlQWxsVmVyc2lvbnM6IHNjYW5PcHRpb25zLmluY2x1ZGVBbGxWZXJzaW9ucywgaW5jbHVkZUludmFsaWQ6IHNjYW5PcHRpb25zLmluY2x1ZGVJbnZhbGlkIH0pO1xuXHR9XG5cblx0YXN5bmMgc2NhbkV4dGVuc2lvbnNVbmRlckRldmVsb3BtZW50KGV4aXN0aW5nRXh0ZW5zaW9uczogSVNjYW5uZWRFeHRlbnNpb25bXSwgc2Nhbk9wdGlvbnM6IFNjYW5PcHRpb25zKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbltdPiB7XG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQgJiYgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSSkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IChhd2FpdCBQcm9taXNlLmFsbCh0aGlzLmVudmlyb25tZW50U2VydmljZS5leHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJLmZpbHRlcihleHRMb2MgPT4gZXh0TG9jLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKVxuXHRcdFx0XHQubWFwKGFzeW5jIGV4dGVuc2lvbkRldmVsb3BtZW50TG9jYXRpb25VUkkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGlucHV0ID0gYXdhaXQgdGhpcy5jcmVhdGVFeHRlbnNpb25TY2FubmVySW5wdXQoZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSSwgZmFsc2UsIEV4dGVuc2lvblR5cGUuVXNlciwgc2Nhbk9wdGlvbnMubGFuZ3VhZ2UsIGZhbHNlIC8qIGRvIG5vdCB2YWxpZGF0ZSAqLywgdW5kZWZpbmVkLCB0aGlzLmdldFByb2R1Y3RWZXJzaW9uKCkpO1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnNjYW5PbmVPck11bHRpcGxlRXh0ZW5zaW9ucyhpbnB1dCk7XG5cdFx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRcdFx0XHQvLyBPdmVycmlkZSB0aGUgZXh0ZW5zaW9uIHR5cGUgZnJvbSB0aGUgZXhpc3RpbmcgZXh0ZW5zaW9uc1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLnR5cGUgPSBleGlzdGluZ0V4dGVuc2lvbnMuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKT8udHlwZSA/PyBleHRlbnNpb24udHlwZTtcblx0XHRcdFx0XHRcdC8vIFZhbGlkYXRlIHRoZSBleHRlbnNpb25cblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnZhbGlkYXRlKGV4dGVuc2lvbiwgaW5wdXQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KSkpXG5cdFx0XHRcdC5mbGF0KCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5hcHBseVNjYW5PcHRpb25zKGV4dGVuc2lvbnMsICdkZXZlbG9wbWVudCcsIHsgaW5jbHVkZUludmFsaWQ6IHNjYW5PcHRpb25zLmluY2x1ZGVJbnZhbGlkLCBwaWNrTGF0ZXN0OiB0cnVlIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRhc3luYyBzY2FuRXhpc3RpbmdFeHRlbnNpb24oZXh0ZW5zaW9uTG9jYXRpb246IFVSSSwgZXh0ZW5zaW9uVHlwZTogRXh0ZW5zaW9uVHlwZSwgc2Nhbk9wdGlvbnM6IFNjYW5PcHRpb25zKTogUHJvbWlzZTxJU2Nhbm5lZEV4dGVuc2lvbiB8IG51bGw+IHtcblx0XHRjb25zdCBleHRlbnNpb25zU2Nhbm5lcklucHV0ID0gYXdhaXQgdGhpcy5jcmVhdGVFeHRlbnNpb25TY2FubmVySW5wdXQoZXh0ZW5zaW9uTG9jYXRpb24sIGZhbHNlLCBleHRlbnNpb25UeXBlLCBzY2FuT3B0aW9ucy5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB0aGlzLmdldFByb2R1Y3RWZXJzaW9uKCkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuc2NhbkV4dGVuc2lvbihleHRlbnNpb25zU2Nhbm5lcklucHV0KTtcblx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmICghc2Nhbk9wdGlvbnMuaW5jbHVkZUludmFsaWQgJiYgIWV4dGVuc2lvbi5pc1ZhbGlkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIGV4dGVuc2lvbjtcblx0fVxuXG5cdGFzeW5jIHNjYW5PbmVPck11bHRpcGxlRXh0ZW5zaW9ucyhleHRlbnNpb25Mb2NhdGlvbjogVVJJLCBleHRlbnNpb25UeXBlOiBFeHRlbnNpb25UeXBlLCBzY2FuT3B0aW9uczogU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBleHRlbnNpb25zU2Nhbm5lcklucHV0ID0gYXdhaXQgdGhpcy5jcmVhdGVFeHRlbnNpb25TY2FubmVySW5wdXQoZXh0ZW5zaW9uTG9jYXRpb24sIGZhbHNlLCBleHRlbnNpb25UeXBlLCBzY2FuT3B0aW9ucy5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB0aGlzLmdldFByb2R1Y3RWZXJzaW9uKCkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNTY2FubmVyLnNjYW5PbmVPck11bHRpcGxlRXh0ZW5zaW9ucyhleHRlbnNpb25zU2Nhbm5lcklucHV0KTtcblx0XHRyZXR1cm4gdGhpcy5hcHBseVNjYW5PcHRpb25zKGV4dGVuc2lvbnMsIGV4dGVuc2lvblR5cGUsIHsgaW5jbHVkZUludmFsaWQ6IHNjYW5PcHRpb25zLmluY2x1ZGVJbnZhbGlkLCBwaWNrTGF0ZXN0OiB0cnVlIH0pO1xuXHR9XG5cblx0YXN5bmMgc2Nhbk11bHRpcGxlRXh0ZW5zaW9ucyhleHRlbnNpb25Mb2NhdGlvbnM6IFVSSVtdLCBleHRlbnNpb25UeXBlOiBFeHRlbnNpb25UeXBlLCBzY2FuT3B0aW9uczogU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBleHRlbnNpb25zOiBJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKGV4dGVuc2lvbkxvY2F0aW9ucy5tYXAoYXN5bmMgZXh0ZW5zaW9uTG9jYXRpb24gPT4ge1xuXHRcdFx0Y29uc3Qgc2Nhbm5lZEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnNjYW5PbmVPck11bHRpcGxlRXh0ZW5zaW9ucyhleHRlbnNpb25Mb2NhdGlvbiwgZXh0ZW5zaW9uVHlwZSwgc2Nhbk9wdGlvbnMpO1xuXHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKC4uLnNjYW5uZWRFeHRlbnNpb25zKTtcblx0XHR9KSk7XG5cdFx0cmV0dXJuIHRoaXMuYXBwbHlTY2FuT3B0aW9ucyhleHRlbnNpb25zLCBleHRlbnNpb25UeXBlLCB7IGluY2x1ZGVJbnZhbGlkOiBzY2FuT3B0aW9ucy5pbmNsdWRlSW52YWxpZCwgcGlja0xhdGVzdDogdHJ1ZSB9KTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZU1hbmlmZXN0TWV0YWRhdGEoZXh0ZW5zaW9uTG9jYXRpb246IFVSSSwgbWV0YURhdGE6IE1hbmlmZXN0TWV0YWRhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtYW5pZmVzdExvY2F0aW9uID0gam9pblBhdGgoZXh0ZW5zaW9uTG9jYXRpb24sICdwYWNrYWdlLmpzb24nKTtcblx0XHRjb25zdCBjb250ZW50ID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUobWFuaWZlc3RMb2NhdGlvbikpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgbWFuaWZlc3Q6IElTY2FubmVkRXh0ZW5zaW9uTWFuaWZlc3QgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdG1hbmlmZXN0Ll9fbWV0YWRhdGEgPSB7IC4uLm1hbmlmZXN0Ll9fbWV0YWRhdGEsIC4uLm1ldGFEYXRhIH07XG5cblx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShqb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgJ3BhY2thZ2UuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0LCBudWxsLCAnXFx0JykpKTtcblx0fVxuXG5cdGFzeW5jIGluaXRpYWxpemVEZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZS5zY2FuUHJvZmlsZUV4dGVuc2lvbnModGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsIHsgYmFpbE91dFdoZW5GaWxlTm90Rm91bmQ6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIEV4dGVuc2lvbnNQcm9maWxlU2Nhbm5pbmdFcnJvciAmJiBlcnJvci5jb2RlID09PSBFeHRlbnNpb25zUHJvZmlsZVNjYW5uaW5nRXJyb3JDb2RlLkVSUk9SX1BST0ZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9Jbml0aWFsaXplRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluaXRpYWxpemVEZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnNQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFzeW5jIGRvSW5pdGlhbGl6ZURlZmF1bHRQcm9maWxlRXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaW5pdGlhbGl6ZURlZmF1bHRQcm9maWxlRXh0ZW5zaW9uc1Byb21pc2UpIHtcblx0XHRcdHRoaXMuaW5pdGlhbGl6ZURlZmF1bHRQcm9maWxlRXh0ZW5zaW9uc1Byb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTdGFydGVkIGluaXRpYWxpemluZyBkZWZhdWx0IHByb2ZpbGUgZXh0ZW5zaW9ucyBpbiBleHRlbnNpb25zIGluc3RhbGxhdGlvbiBmb2xkZXIuJywgdGhpcy51c2VyRXh0ZW5zaW9uc0xvY2F0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdGNvbnN0IHVzZXJFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5zY2FuQWxsVXNlckV4dGVuc2lvbnMoeyBpbmNsdWRlSW52YWxpZDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRpZiAodXNlckV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UuYWRkRXh0ZW5zaW9uc1RvUHJvZmlsZSh1c2VyRXh0ZW5zaW9ucy5tYXAoZSA9PiBbZSwgZS5tZXRhZGF0YV0pLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlRmlsZSh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShbXSkpKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ0ZhaWxlZCB0byBjcmVhdGUgZGVmYXVsdCBwcm9maWxlIGV4dGVuc2lvbnMgbWFuaWZlc3QgaW4gZXh0ZW5zaW9ucyBpbnN0YWxsYXRpb24gZm9sZGVyLicsIHRoaXMudXNlckV4dGVuc2lvbnNMb2NhdGlvbi50b1N0cmluZygpLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnQ29tcGxldGVkIGluaXRpYWxpemluZyBkZWZhdWx0IHByb2ZpbGUgZXh0ZW5zaW9ucyBpbiBleHRlbnNpb25zIGluc3RhbGxhdGlvbiBmb2xkZXIuJywgdGhpcy51c2VyRXh0ZW5zaW9uc0xvY2F0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0dGhpcy5pbml0aWFsaXplRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuaW5pdGlhbGl6ZURlZmF1bHRQcm9maWxlRXh0ZW5zaW9uc1Byb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFwcGx5U2Nhbk9wdGlvbnMoZXh0ZW5zaW9uczogSVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uW10sIHR5cGU6IEV4dGVuc2lvblR5cGUgfCAnZGV2ZWxvcG1lbnQnLCBzY2FuT3B0aW9uczogeyBpbmNsdWRlQWxsVmVyc2lvbnM/OiBib29sZWFuOyBpbmNsdWRlSW52YWxpZD86IGJvb2xlYW47IHBpY2tMYXRlc3Q/OiBib29sZWFuIH0gPSB7fSk6IFByb21pc2U8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRpZiAoIXNjYW5PcHRpb25zLmluY2x1ZGVBbGxWZXJzaW9ucykge1xuXHRcdFx0ZXh0ZW5zaW9ucyA9IHRoaXMuZGVkdXBFeHRlbnNpb25zKHR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtID8gZXh0ZW5zaW9ucyA6IHVuZGVmaW5lZCwgdHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5Vc2VyID8gZXh0ZW5zaW9ucyA6IHVuZGVmaW5lZCwgdHlwZSA9PT0gJ2RldmVsb3BtZW50JyA/IGV4dGVuc2lvbnMgOiB1bmRlZmluZWQsIGF3YWl0IHRoaXMuZ2V0VGFyZ2V0UGxhdGZvcm0oKSwgISFzY2FuT3B0aW9ucy5waWNrTGF0ZXN0KTtcblx0XHR9XG5cdFx0aWYgKCFzY2FuT3B0aW9ucy5pbmNsdWRlSW52YWxpZCkge1xuXHRcdFx0ZXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnMuZmlsdGVyKGV4dGVuc2lvbiA9PiBleHRlbnNpb24uaXNWYWxpZCk7XG5cdFx0fVxuXHRcdHJldHVybiBleHRlbnNpb25zLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGNvbnN0IGFMYXN0U2VnbWVudCA9IHBhdGguYmFzZW5hbWUoYS5sb2NhdGlvbi5mc1BhdGgpO1xuXHRcdFx0Y29uc3QgYkxhc3RTZWdtZW50ID0gcGF0aC5iYXNlbmFtZShiLmxvY2F0aW9uLmZzUGF0aCk7XG5cdFx0XHRpZiAoYUxhc3RTZWdtZW50IDwgYkxhc3RTZWdtZW50KSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH1cblx0XHRcdGlmIChhTGFzdFNlZ21lbnQgPiBiTGFzdFNlZ21lbnQpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZGVkdXBFeHRlbnNpb25zKHN5c3RlbTogSVNjYW5uZWRFeHRlbnNpb25bXSB8IHVuZGVmaW5lZCwgdXNlcjogSVNjYW5uZWRFeHRlbnNpb25bXSB8IHVuZGVmaW5lZCwgZGV2ZWxvcG1lbnQ6IElTY2FubmVkRXh0ZW5zaW9uW10gfCB1bmRlZmluZWQsIHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybSwgcGlja0xhdGVzdDogYm9vbGVhbik6IElTY2FubmVkRXh0ZW5zaW9uW10ge1xuXHRcdGNvbnN0IHBpY2sgPSAoZXhpc3Rpbmc6IElTY2FubmVkRXh0ZW5zaW9uLCBleHRlbnNpb246IElTY2FubmVkRXh0ZW5zaW9uLCBpc0RldmVsb3BtZW50OiBib29sZWFuKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRpZiAoIWlzRGV2ZWxvcG1lbnQgJiYgIShleGlzdGluZy5pc0J1aWx0aW4gfHwgZXh0ZW5zaW9uLmlzQnVpbHRpbikpIHtcblx0XHRcdFx0aWYgKGV4aXN0aW5nLm1ldGFkYXRhPy5pc0FwcGxpY2F0aW9uU2NvcGVkICYmICFleHRlbnNpb24ubWV0YWRhdGE/LmlzQXBwbGljYXRpb25TY29wZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFleGlzdGluZy5tZXRhZGF0YT8uaXNBcHBsaWNhdGlvblNjb3BlZCAmJiBleHRlbnNpb24ubWV0YWRhdGE/LmlzQXBwbGljYXRpb25TY29wZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGV4aXN0aW5nLmlzVmFsaWQgJiYgIWV4dGVuc2lvbi5pc1ZhbGlkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChleGlzdGluZy5pc1ZhbGlkID09PSBleHRlbnNpb24uaXNWYWxpZCkge1xuXHRcdFx0XHRpZiAocGlja0xhdGVzdCAmJiBzZW12ZXIuZ3QoZXhpc3RpbmcubWFuaWZlc3QudmVyc2lvbiwgZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24pKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBTa2lwcGluZyBleHRlbnNpb24gJHtleHRlbnNpb24ubG9jYXRpb24ucGF0aH0gd2l0aCBsb3dlciB2ZXJzaW9uICR7ZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb259IGluIGZhdm91ciBvZiAke2V4aXN0aW5nLmxvY2F0aW9uLnBhdGh9IHdpdGggdmVyc2lvbiAke2V4aXN0aW5nLm1hbmlmZXN0LnZlcnNpb259YCk7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzZW12ZXIuZXEoZXhpc3RpbmcubWFuaWZlc3QudmVyc2lvbiwgZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24pKSB7XG5cdFx0XHRcdFx0aWYgKGV4aXN0aW5nLnR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFNraXBwaW5nIGV4dGVuc2lvbiAke2V4dGVuc2lvbi5sb2NhdGlvbi5wYXRofSBpbiBmYXZvdXIgb2Ygc3lzdGVtIGV4dGVuc2lvbiAke2V4aXN0aW5nLmxvY2F0aW9uLnBhdGh9IHdpdGggc2FtZSB2ZXJzaW9uYCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChleGlzdGluZy50YXJnZXRQbGF0Zm9ybSA9PT0gdGFyZ2V0UGxhdGZvcm0pIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgU2tpcHBpbmcgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uLmxvY2F0aW9uLnBhdGh9IGZyb20gZGlmZmVyZW50IHRhcmdldCBwbGF0Zm9ybSAke2V4dGVuc2lvbi50YXJnZXRQbGF0Zm9ybX1gKTtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChpc0RldmVsb3BtZW50KSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBPdmVyd3JpdGluZyB1c2VyIGV4dGVuc2lvbiAke2V4aXN0aW5nLmxvY2F0aW9uLnBhdGh9IHdpdGggJHtleHRlbnNpb24ubG9jYXRpb24ucGF0aH0uYCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYE92ZXJ3cml0aW5nIHVzZXIgZXh0ZW5zaW9uICR7ZXhpc3RpbmcubG9jYXRpb24ucGF0aH0gd2l0aCAke2V4dGVuc2lvbi5sb2NhdGlvbi5wYXRofS5gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8SVNjYW5uZWRFeHRlbnNpb24+KCk7XG5cdFx0c3lzdGVtPy5mb3JFYWNoKChleHRlbnNpb24pID0+IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gcmVzdWx0LmdldChleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHRpZiAoIWV4aXN0aW5nIHx8IHBpY2soZXhpc3RpbmcsIGV4dGVuc2lvbiwgZmFsc2UpKSB7XG5cdFx0XHRcdHJlc3VsdC5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgcHJvZHVjdEJ1aWx0SW5FeHRlbnNpb25zRW5hYmxlZFdpdGhBdXRvVXBkYXRlcyA9IGdldFByb2R1Y3RCdWlsdEluRXh0ZW5zaW9uc0VuYWJsZWRXaXRoQXV0b1VwZGF0ZXModGhpcy5wcm9kdWN0U2VydmljZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdHVzZXI/LmZvckVhY2goKGV4dGVuc2lvbikgPT4ge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSByZXN1bHQuZ2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdGlmICghZXhpc3RpbmcgJiYgc3lzdGVtICYmIGV4dGVuc2lvbi50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFNraXBwaW5nIG9ic29sZXRlIHN5c3RlbSBleHRlbnNpb24gJHtleHRlbnNpb24ubG9jYXRpb24ucGF0aH0uYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChwcm9kdWN0QnVpbHRJbkV4dGVuc2lvbnNFbmFibGVkV2l0aEF1dG9VcGRhdGVzLmhhcyhleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKSAmJiAhZXh0ZW5zaW9uLmZvcmNlQXV0b1VwZGF0ZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU2tpcHBpbmcgdXNlciBpbnN0YWxsZWQgYnVpbHRpbiBleHRlbnNpb24gJHtleHRlbnNpb24uaWRlbnRpZmllci5pZH0gd2l0aCB2ZXJzaW9uICR7ZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb259IGJlY2F1c2UgaXQgaXMgbm90IGFsbG93ZWQgdG8gaW4gdGhlIGN1cnJlbnQgcHJvZHVjdCBxdWFsaXR5ICR7dGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5fWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWV4aXN0aW5nIHx8IHBpY2soZXhpc3RpbmcsIGV4dGVuc2lvbiwgZmFsc2UpKSB7XG5cdFx0XHRcdHJlc3VsdC5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0ZGV2ZWxvcG1lbnQ/LmZvckVhY2goZXh0ZW5zaW9uID0+IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gcmVzdWx0LmdldChleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHRpZiAoIWV4aXN0aW5nIHx8IHBpY2soZXhpc3RpbmcsIGV4dGVuc2lvbiwgdHJ1ZSkpIHtcblx0XHRcdFx0cmVzdWx0LnNldChleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbik7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIFsuLi5yZXN1bHQudmFsdWVzKCldO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzY2FuRGVmYXVsdFN5c3RlbUV4dGVuc2lvbnMobGFuZ3VhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1N0YXJ0ZWQgc2Nhbm5pbmcgc3lzdGVtIGV4dGVuc2lvbnMnKTtcblx0XHRjb25zdCBleHRlbnNpb25zU2Nhbm5lcklucHV0ID0gYXdhaXQgdGhpcy5jcmVhdGVFeHRlbnNpb25TY2FubmVySW5wdXQodGhpcy5zeXN0ZW1FeHRlbnNpb25zTG9jYXRpb24sIGZhbHNlLCBFeHRlbnNpb25UeXBlLlN5c3RlbSwgbGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdGhpcy5nZXRQcm9kdWN0VmVyc2lvbigpKTtcblx0XHRjb25zdCBleHRlbnNpb25zU2Nhbm5lciA9IGV4dGVuc2lvbnNTY2FubmVySW5wdXQuZGV2TW9kZSA/IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIgOiB0aGlzLnN5c3RlbUV4dGVuc2lvbnNDYWNoZWRTY2FubmVyO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4dGVuc2lvbnNTY2FubmVyLnNjYW5FeHRlbnNpb25zKGV4dGVuc2lvbnNTY2FubmVySW5wdXQpO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnU2Nhbm5lZCBzeXN0ZW0gZXh0ZW5zaW9uczonLCByZXN1bHQubGVuZ3RoKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzY2FuRGV2U3lzdGVtRXh0ZW5zaW9ucyhsYW5ndWFnZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBjaGVja0NvbnRyb2xGaWxlOiBib29sZWFuKTogUHJvbWlzZTxJUmVsYXhlZFNjYW5uZWRFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IGRldlN5c3RlbUV4dGVuc2lvbnNMaXN0ID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCA/IFtdIDogdGhpcy5wcm9kdWN0U2VydmljZS5idWlsdEluRXh0ZW5zaW9ucztcblx0XHRpZiAoIWRldlN5c3RlbUV4dGVuc2lvbnNMaXN0Py5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1N0YXJ0ZWQgc2Nhbm5pbmcgZGV2IHN5c3RlbSBleHRlbnNpb25zJyk7XG5cdFx0Y29uc3QgYnVpbHRpbkV4dGVuc2lvbkNvbnRyb2wgPSBjaGVja0NvbnRyb2xGaWxlID8gYXdhaXQgdGhpcy5nZXRCdWlsdEluRXh0ZW5zaW9uQ29udHJvbCgpIDoge307XG5cdFx0Y29uc3QgZGV2U3lzdGVtRXh0ZW5zaW9uc0xvY2F0aW9uczogVVJJW10gPSBbXTtcblx0XHRjb25zdCBkZXZTeXN0ZW1FeHRlbnNpb25zTG9jYXRpb24gPSBVUkkuZmlsZShwYXRoLm5vcm1hbGl6ZShwYXRoLmpvaW4oRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJycpLmZzUGF0aCwgJy4uJywgJy5idWlsZCcsICdidWlsdEluRXh0ZW5zaW9ucycpKSk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGV2U3lzdGVtRXh0ZW5zaW9uc0xpc3QpIHtcblx0XHRcdGNvbnN0IGNvbnRyb2xTdGF0ZSA9IGJ1aWx0aW5FeHRlbnNpb25Db250cm9sW2V4dGVuc2lvbi5uYW1lXSB8fCAnbWFya2V0cGxhY2UnO1xuXHRcdFx0c3dpdGNoIChjb250cm9sU3RhdGUpIHtcblx0XHRcdFx0Y2FzZSAnZGlzYWJsZWQnOlxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdtYXJrZXRwbGFjZSc6XG5cdFx0XHRcdFx0ZGV2U3lzdGVtRXh0ZW5zaW9uc0xvY2F0aW9ucy5wdXNoKGpvaW5QYXRoKGRldlN5c3RlbUV4dGVuc2lvbnNMb2NhdGlvbiwgZXh0ZW5zaW9uLm5hbWUpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRkZXZTeXN0ZW1FeHRlbnNpb25zTG9jYXRpb25zLnB1c2goVVJJLmZpbGUoY29udHJvbFN0YXRlKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFByb21pc2UuYWxsKGRldlN5c3RlbUV4dGVuc2lvbnNMb2NhdGlvbnMubWFwKGFzeW5jIGxvY2F0aW9uID0+IHRoaXMuZXh0ZW5zaW9uc1NjYW5uZXIuc2NhbkV4dGVuc2lvbigoYXdhaXQgdGhpcy5jcmVhdGVFeHRlbnNpb25TY2FubmVySW5wdXQobG9jYXRpb24sIGZhbHNlLCBFeHRlbnNpb25UeXBlLlN5c3RlbSwgbGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdGhpcy5nZXRQcm9kdWN0VmVyc2lvbigpKSkpKSk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdTY2FubmVkIGRldiBzeXN0ZW0gZXh0ZW5zaW9uczonLCByZXN1bHQubGVuZ3RoKTtcblx0XHRyZXR1cm4gY29hbGVzY2UocmVzdWx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0QnVpbHRJbkV4dGVuc2lvbkNvbnRyb2woKTogUHJvbWlzZTxJQnVpbHRJbkV4dGVuc2lvbkNvbnRyb2w+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodGhpcy5leHRlbnNpb25zQ29udHJvbExvY2F0aW9uKTtcblx0XHRcdHJldHVybiBKU09OLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZUV4dGVuc2lvblNjYW5uZXJJbnB1dChsb2NhdGlvbjogVVJJLCBwcm9maWxlOiBib29sZWFuLCB0eXBlOiBFeHRlbnNpb25UeXBlLCBsYW5ndWFnZTogc3RyaW5nIHwgdW5kZWZpbmVkLCB2YWxpZGF0ZTogYm9vbGVhbiwgcHJvZmlsZVNjYW5PcHRpb25zOiBJUHJvZmlsZUV4dGVuc2lvbnNTY2FuT3B0aW9ucyB8IHVuZGVmaW5lZCwgcHJvZHVjdFZlcnNpb246IElQcm9kdWN0VmVyc2lvbik6IFByb21pc2U8RXh0ZW5zaW9uU2Nhbm5lcklucHV0PiB7XG5cdFx0Y29uc3QgdHJhbnNsYXRpb25zID0gYXdhaXQgdGhpcy5nZXRUcmFuc2xhdGlvbnMobGFuZ3VhZ2UgPz8gcGxhdGZvcm0ubGFuZ3VhZ2UpO1xuXHRcdGNvbnN0IG10aW1lID0gYXdhaXQgdGhpcy5nZXRNdGltZShsb2NhdGlvbik7XG5cdFx0Y29uc3QgYXBwbGljYXRpb25FeHRlbnNpb25zTG9jYXRpb24gPSBwcm9maWxlICYmICF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChsb2NhdGlvbiwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpID8gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYXBwbGljYXRpb25FeHRlbnNpb25zTG9jYXRpb25NdGltZSA9IGFwcGxpY2F0aW9uRXh0ZW5zaW9uc0xvY2F0aW9uID8gYXdhaXQgdGhpcy5nZXRNdGltZShhcHBsaWNhdGlvbkV4dGVuc2lvbnNMb2NhdGlvbikgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIG5ldyBFeHRlbnNpb25TY2FubmVySW5wdXQoXG5cdFx0XHRsb2NhdGlvbixcblx0XHRcdG10aW1lLFxuXHRcdFx0YXBwbGljYXRpb25FeHRlbnNpb25zTG9jYXRpb24sXG5cdFx0XHRhcHBsaWNhdGlvbkV4dGVuc2lvbnNMb2NhdGlvbk10aW1lLFxuXHRcdFx0cHJvZmlsZSxcblx0XHRcdHByb2ZpbGVTY2FuT3B0aW9ucyxcblx0XHRcdHR5cGUsXG5cdFx0XHR2YWxpZGF0ZSxcblx0XHRcdHByb2R1Y3RWZXJzaW9uLnZlcnNpb24sXG5cdFx0XHRwcm9kdWN0VmVyc2lvbi5kYXRlLFxuXHRcdFx0dGhpcy5wcm9kdWN0U2VydmljZS5jb21taXQsXG5cdFx0XHQhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCxcblx0XHRcdGxhbmd1YWdlLFxuXHRcdFx0dHJhbnNsYXRpb25zLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE10aW1lKGxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KGxvY2F0aW9uKTtcblx0XHRcdGlmICh0eXBlb2Ygc3RhdC5tdGltZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0cmV0dXJuIHN0YXQubXRpbWU7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBUaGF0J3Mgb2suLi5cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHJvZHVjdFZlcnNpb24oKTogSVByb2R1Y3RWZXJzaW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dmVyc2lvbjogdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0ZGF0ZTogdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlLFxuXHRcdH07XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uU2Nhbm5lcklucHV0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbG9jYXRpb246IFVSSSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbXRpbWU6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYXBwbGljYXRpb25FeHRlbnNpb25zbG9jYXRpb246IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYXBwbGljYXRpb25FeHRlbnNpb25zbG9jYXRpb25NdGltZTogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBwcm9maWxlOiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSBwcm9maWxlU2Nhbk9wdGlvbnM6IElQcm9maWxlRXh0ZW5zaW9uc1NjYW5PcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSB0eXBlOiBFeHRlbnNpb25UeXBlLFxuXHRcdHB1YmxpYyByZWFkb25seSB2YWxpZGF0ZTogYm9vbGVhbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJvZHVjdFZlcnNpb246IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJvZHVjdERhdGU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJvZHVjdENvbW1pdDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBkZXZNb2RlOiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSBsYW5ndWFnZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSB0cmFuc2xhdGlvbnM6IFRyYW5zbGF0aW9uc1xuXHQpIHtcblx0XHQvLyBLZWVwIGVtcHR5ISEgKEpTT04ucGFyc2UpXG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZU5sc0NvbmZpZ3VyYXRpb24oaW5wdXQ6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCk6IE5sc0NvbmZpZ3VyYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYW5ndWFnZTogaW5wdXQubGFuZ3VhZ2UsXG5cdFx0XHRwc2V1ZG86IGlucHV0Lmxhbmd1YWdlID09PSAncHNldWRvJyxcblx0XHRcdGRldk1vZGU6IGlucHV0LmRldk1vZGUsXG5cdFx0XHR0cmFuc2xhdGlvbnM6IGlucHV0LnRyYW5zbGF0aW9uc1xuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGVxdWFscyhhOiBFeHRlbnNpb25TY2FubmVySW5wdXQsIGI6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHRpc0VxdWFsKGEubG9jYXRpb24sIGIubG9jYXRpb24pXG5cdFx0XHQmJiBhLm10aW1lID09PSBiLm10aW1lXG5cdFx0XHQmJiBpc0VxdWFsKGEuYXBwbGljYXRpb25FeHRlbnNpb25zbG9jYXRpb24sIGIuYXBwbGljYXRpb25FeHRlbnNpb25zbG9jYXRpb24pXG5cdFx0XHQmJiBhLmFwcGxpY2F0aW9uRXh0ZW5zaW9uc2xvY2F0aW9uTXRpbWUgPT09IGIuYXBwbGljYXRpb25FeHRlbnNpb25zbG9jYXRpb25NdGltZVxuXHRcdFx0JiYgYS5wcm9maWxlID09PSBiLnByb2ZpbGVcblx0XHRcdCYmIG9iamVjdHMuZXF1YWxzKGEucHJvZmlsZVNjYW5PcHRpb25zLCBiLnByb2ZpbGVTY2FuT3B0aW9ucylcblx0XHRcdCYmIGEudHlwZSA9PT0gYi50eXBlXG5cdFx0XHQmJiBhLnZhbGlkYXRlID09PSBiLnZhbGlkYXRlXG5cdFx0XHQmJiBhLnByb2R1Y3RWZXJzaW9uID09PSBiLnByb2R1Y3RWZXJzaW9uXG5cdFx0XHQmJiBhLnByb2R1Y3REYXRlID09PSBiLnByb2R1Y3REYXRlXG5cdFx0XHQmJiBhLnByb2R1Y3RDb21taXQgPT09IGIucHJvZHVjdENvbW1pdFxuXHRcdFx0JiYgYS5kZXZNb2RlID09PSBiLmRldk1vZGVcblx0XHRcdCYmIGEubGFuZ3VhZ2UgPT09IGIubGFuZ3VhZ2Vcblx0XHRcdCYmIFRyYW5zbGF0aW9ucy5lcXVhbHMoYS50cmFuc2xhdGlvbnMsIGIudHJhbnNsYXRpb25zKVxuXHRcdCk7XG5cdH1cbn1cblxudHlwZSBObHNDb25maWd1cmF0aW9uID0ge1xuXHRsYW5ndWFnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwc2V1ZG86IGJvb2xlYW47XG5cdGRldk1vZGU6IGJvb2xlYW47XG5cdHRyYW5zbGF0aW9uczogVHJhbnNsYXRpb25zO1xufTtcblxuY2xhc3MgRXh0ZW5zaW9uc1NjYW5uZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RRdWFsaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdEJ1aWx0SW5FeHRlbnNpb25zRW5hYmxlZFdpdGhBdXRvVXBkYXRlczogU2V0PHN0cmluZz47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBleHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5wcm9kdWN0UXVhbGl0eSA9IHByb2R1Y3RTZXJ2aWNlLnF1YWxpdHk7XG5cdFx0dGhpcy5wcm9kdWN0QnVpbHRJbkV4dGVuc2lvbnNFbmFibGVkV2l0aEF1dG9VcGRhdGVzID0gZ2V0UHJvZHVjdEJ1aWx0SW5FeHRlbnNpb25zRW5hYmxlZFdpdGhBdXRvVXBkYXRlcyhwcm9kdWN0U2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0fVxuXG5cdGFzeW5jIHNjYW5FeHRlbnNpb25zKGlucHV0OiBFeHRlbnNpb25TY2FubmVySW5wdXQpOiBQcm9taXNlPElSZWxheGVkU2Nhbm5lZEV4dGVuc2lvbltdPiB7XG5cdFx0cmV0dXJuIGlucHV0LnByb2ZpbGVcblx0XHRcdD8gdGhpcy5zY2FuRXh0ZW5zaW9uc0Zyb21Qcm9maWxlKGlucHV0KVxuXHRcdFx0OiB0aGlzLnNjYW5FeHRlbnNpb25zRnJvbUxvY2F0aW9uKGlucHV0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2NhbkV4dGVuc2lvbnNGcm9tTG9jYXRpb24oaW5wdXQ6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCk6IFByb21pc2U8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKGlucHV0LmxvY2F0aW9uKTtcblx0XHRpZiAoIXN0YXQuY2hpbGRyZW4/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgUHJvbWlzZS5hbGw8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uIHwgbnVsbD4oXG5cdFx0XHRzdGF0LmNoaWxkcmVuLm1hcChhc3luYyBjID0+IHtcblx0XHRcdFx0aWYgKCFjLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRG8gbm90IGNvbnNpZGVyIHVzZXIgZXh0ZW5zaW9uIGZvbGRlciBzdGFydGluZyB3aXRoIGAuYFxuXHRcdFx0XHRpZiAoaW5wdXQudHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5Vc2VyICYmIGJhc2VuYW1lKGMucmVzb3VyY2UpLmluZGV4T2YoJy4nKSA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblNjYW5uZXJJbnB1dCA9IG5ldyBFeHRlbnNpb25TY2FubmVySW5wdXQoYy5yZXNvdXJjZSwgaW5wdXQubXRpbWUsIGlucHV0LmFwcGxpY2F0aW9uRXh0ZW5zaW9uc2xvY2F0aW9uLCBpbnB1dC5hcHBsaWNhdGlvbkV4dGVuc2lvbnNsb2NhdGlvbk10aW1lLCBpbnB1dC5wcm9maWxlLCBpbnB1dC5wcm9maWxlU2Nhbk9wdGlvbnMsIGlucHV0LnR5cGUsIGlucHV0LnZhbGlkYXRlLCBpbnB1dC5wcm9kdWN0VmVyc2lvbiwgaW5wdXQucHJvZHVjdERhdGUsIGlucHV0LnByb2R1Y3RDb21taXQsIGlucHV0LmRldk1vZGUsIGlucHV0Lmxhbmd1YWdlLCBpbnB1dC50cmFuc2xhdGlvbnMpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zY2FuRXh0ZW5zaW9uKGV4dGVuc2lvblNjYW5uZXJJbnB1dCk7XG5cdFx0XHR9KSk7XG5cdFx0cmV0dXJuIGNvYWxlc2NlKGV4dGVuc2lvbnMpXG5cdFx0XHQvLyBTb3J0OiBNYWtlIHN1cmUgZXh0ZW5zaW9ucyBhcmUgaW4gdGhlIHNhbWUgb3JkZXIgYWx3YXlzLiBIZWxwcyBjYWNoZSBpbnZhbGlkYXRpb24gZXZlbiBpZiB0aGUgb3JkZXIgY2hhbmdlcy5cblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLmxvY2F0aW9uLnBhdGggPCBiLmxvY2F0aW9uLnBhdGggPyAtMSA6IDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzY2FuRXh0ZW5zaW9uc0Zyb21Qcm9maWxlKGlucHV0OiBFeHRlbnNpb25TY2FubmVySW5wdXQpOiBQcm9taXNlPElSZWxheGVkU2Nhbm5lZEV4dGVuc2lvbltdPiB7XG5cdFx0bGV0IHByb2ZpbGVFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5zY2FuRXh0ZW5zaW9uc0Zyb21Qcm9maWxlUmVzb3VyY2UoaW5wdXQubG9jYXRpb24sICgpID0+IHRydWUsIGlucHV0KTtcblx0XHRpZiAoaW5wdXQuYXBwbGljYXRpb25FeHRlbnNpb25zbG9jYXRpb24gJiYgIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGlucHV0LmxvY2F0aW9uLCBpbnB1dC5hcHBsaWNhdGlvbkV4dGVuc2lvbnNsb2NhdGlvbikpIHtcblx0XHRcdHByb2ZpbGVFeHRlbnNpb25zID0gcHJvZmlsZUV4dGVuc2lvbnMuZmlsdGVyKGUgPT4gIWUubWV0YWRhdGE/LmlzQXBwbGljYXRpb25TY29wZWQpO1xuXHRcdFx0Y29uc3QgYXBwbGljYXRpb25FeHRlbnNpb25zID0gYXdhaXQgdGhpcy5zY2FuRXh0ZW5zaW9uc0Zyb21Qcm9maWxlUmVzb3VyY2UoaW5wdXQuYXBwbGljYXRpb25FeHRlbnNpb25zbG9jYXRpb24sIChlKSA9PiAhIWUubWV0YWRhdGE/LmlzQnVpbHRpbiB8fCAhIWUubWV0YWRhdGE/LmlzQXBwbGljYXRpb25TY29wZWQsIGlucHV0KTtcblx0XHRcdHByb2ZpbGVFeHRlbnNpb25zLnB1c2goLi4uYXBwbGljYXRpb25FeHRlbnNpb25zKTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb2ZpbGVFeHRlbnNpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzY2FuRXh0ZW5zaW9uc0Zyb21Qcm9maWxlUmVzb3VyY2UocHJvZmlsZVJlc291cmNlOiBVUkksIGZpbHRlcjogKGV4dGVuc2lvbkluZm86IElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbikgPT4gYm9vbGVhbiwgaW5wdXQ6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCk6IFByb21pc2U8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBzY2FubmVkUHJvZmlsZUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2Uuc2NhblByb2ZpbGVFeHRlbnNpb25zKHByb2ZpbGVSZXNvdXJjZSwgaW5wdXQucHJvZmlsZVNjYW5PcHRpb25zKTtcblx0XHRpZiAoIXNjYW5uZWRQcm9maWxlRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IFByb21pc2UuYWxsPElSZWxheGVkU2Nhbm5lZEV4dGVuc2lvbiB8IG51bGw+KFxuXHRcdFx0c2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25zLm1hcChhc3luYyBleHRlbnNpb25JbmZvID0+IHtcblx0XHRcdFx0aWYgKGZpbHRlcihleHRlbnNpb25JbmZvKSkge1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvblNjYW5uZXJJbnB1dCA9IG5ldyBFeHRlbnNpb25TY2FubmVySW5wdXQoZXh0ZW5zaW9uSW5mby5sb2NhdGlvbiwgaW5wdXQubXRpbWUsIGlucHV0LmFwcGxpY2F0aW9uRXh0ZW5zaW9uc2xvY2F0aW9uLCBpbnB1dC5hcHBsaWNhdGlvbkV4dGVuc2lvbnNsb2NhdGlvbk10aW1lLCBpbnB1dC5wcm9maWxlLCBpbnB1dC5wcm9maWxlU2Nhbk9wdGlvbnMsIGlucHV0LnR5cGUsIGlucHV0LnZhbGlkYXRlLCBpbnB1dC5wcm9kdWN0VmVyc2lvbiwgaW5wdXQucHJvZHVjdERhdGUsIGlucHV0LnByb2R1Y3RDb21taXQsIGlucHV0LmRldk1vZGUsIGlucHV0Lmxhbmd1YWdlLCBpbnB1dC50cmFuc2xhdGlvbnMpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnNjYW5FeHRlbnNpb24oZXh0ZW5zaW9uU2Nhbm5lcklucHV0LCBleHRlbnNpb25JbmZvKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH0pKTtcblx0XHRyZXR1cm4gY29hbGVzY2UoZXh0ZW5zaW9ucyk7XG5cdH1cblxuXHRhc3luYyBzY2FuT25lT3JNdWx0aXBsZUV4dGVuc2lvbnMoaW5wdXQ6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCk6IFByb21pc2U8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKGpvaW5QYXRoKGlucHV0LmxvY2F0aW9uLCAncGFja2FnZS5qc29uJykpKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuc2NhbkV4dGVuc2lvbihpbnB1dCk7XG5cdFx0XHRcdHJldHVybiBleHRlbnNpb24gPyBbZXh0ZW5zaW9uXSA6IFtdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuc2NhbkV4dGVuc2lvbnMoaW5wdXQpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHNjYW5uaW5nIGV4dGVuc2lvbnMgYXQgJHtpbnB1dC5sb2NhdGlvbi5wYXRofTpgLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzY2FuRXh0ZW5zaW9uKGlucHV0OiBFeHRlbnNpb25TY2FubmVySW5wdXQpOiBQcm9taXNlPElSZWxheGVkU2Nhbm5lZEV4dGVuc2lvbiB8IG51bGw+O1xuXHRhc3luYyBzY2FuRXh0ZW5zaW9uKGlucHV0OiBFeHRlbnNpb25TY2FubmVySW5wdXQsIHNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uOiBJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb24pOiBQcm9taXNlPElSZWxheGVkU2Nhbm5lZEV4dGVuc2lvbj47XG5cdGFzeW5jIHNjYW5FeHRlbnNpb24oaW5wdXQ6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCwgc2Nhbm5lZFByb2ZpbGVFeHRlbnNpb24/OiBJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb24pOiBQcm9taXNlPElSZWxheGVkU2Nhbm5lZEV4dGVuc2lvbiB8IG51bGw+IHtcblx0XHRjb25zdCB2YWxpZGF0aW9uczogW1NldmVyaXR5LCBzdHJpbmddW10gPSBbXTtcblx0XHRsZXQgaXNWYWxpZCA9IHRydWU7XG5cdFx0bGV0IG1hbmlmZXN0OiBJU2Nhbm5lZEV4dGVuc2lvbk1hbmlmZXN0O1xuXHRcdHRyeSB7XG5cdFx0XHRtYW5pZmVzdCA9IGF3YWl0IHRoaXMuc2NhbkV4dGVuc2lvbk1hbmlmZXN0KGlucHV0LmxvY2F0aW9uKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoc2Nhbm5lZFByb2ZpbGVFeHRlbnNpb24pIHtcblx0XHRcdFx0dmFsaWRhdGlvbnMucHVzaChbU2V2ZXJpdHkuRXJyb3IsIGdldEVycm9yTWVzc2FnZShlKV0pO1xuXHRcdFx0XHRpc1ZhbGlkID0gZmFsc2U7XG5cdFx0XHRcdGNvbnN0IFtwdWJsaXNoZXIsIG5hbWVdID0gc2Nhbm5lZFByb2ZpbGVFeHRlbnNpb24uaWRlbnRpZmllci5pZC5zcGxpdCgnLicpO1xuXHRcdFx0XHRtYW5pZmVzdCA9IHtcblx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdHB1Ymxpc2hlcixcblx0XHRcdFx0XHR2ZXJzaW9uOiBzY2FubmVkUHJvZmlsZUV4dGVuc2lvbi52ZXJzaW9uLFxuXHRcdFx0XHRcdGVuZ2luZXM6IHsgdnNjb2RlOiAnJyB9XG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoaW5wdXQudHlwZSAhPT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0pIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gYWxsb3cgcHVibGlzaGVyIHRvIGJlIHVuZGVmaW5lZCB0byBtYWtlIHRoZSBpbml0aWFsIGV4dGVuc2lvbiBhdXRob3JpbmcgZXhwZXJpZW5jZSBzbW9vdGhlclxuXHRcdGlmICghbWFuaWZlc3QucHVibGlzaGVyKSB7XG5cdFx0XHRtYW5pZmVzdC5wdWJsaXNoZXIgPSBVTkRFRklORURfUFVCTElTSEVSO1xuXHRcdH1cblxuXHRcdGxldCBtZXRhZGF0YTogTWV0YWRhdGEgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uKSB7XG5cdFx0XHRtZXRhZGF0YSA9IHtcblx0XHRcdFx0Li4uc2Nhbm5lZFByb2ZpbGVFeHRlbnNpb24ubWV0YWRhdGEsXG5cdFx0XHRcdHNpemU6IG1hbmlmZXN0Ll9fbWV0YWRhdGE/LnNpemUsXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAobWFuaWZlc3QuX19tZXRhZGF0YSkge1xuXHRcdFx0bWV0YWRhdGEgPSB7XG5cdFx0XHRcdGluc3RhbGxlZFRpbWVzdGFtcDogbWFuaWZlc3QuX19tZXRhZGF0YS5pbnN0YWxsZWRUaW1lc3RhbXAsXG5cdFx0XHRcdHNpemU6IG1hbmlmZXN0Ll9fbWV0YWRhdGEuc2l6ZSxcblx0XHRcdFx0dGFyZ2V0UGxhdGZvcm06IG1hbmlmZXN0Ll9fbWV0YWRhdGEudGFyZ2V0UGxhdGZvcm0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGRlbGV0ZSBtYW5pZmVzdC5fX21ldGFkYXRhO1xuXHRcdGNvbnN0IGlkID0gZ2V0R2FsbGVyeUV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSk7XG5cdFx0Y29uc3QgaWRlbnRpZmllciA9IG1ldGFkYXRhPy5pZCA/IHsgaWQsIHV1aWQ6IG1ldGFkYXRhLmlkIH0gOiB7IGlkIH07XG5cdFx0Y29uc3QgdHlwZSA9IG1ldGFkYXRhPy5pc1N5c3RlbSA/IEV4dGVuc2lvblR5cGUuU3lzdGVtIDogaW5wdXQudHlwZTtcblx0XHRjb25zdCBpc0J1aWx0aW4gPSB0eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbSB8fCAhIW1ldGFkYXRhPy5pc0J1aWx0aW47XG5cdFx0dHJ5IHtcblx0XHRcdG1hbmlmZXN0ID0gYXdhaXQgdGhpcy50cmFuc2xhdGVNYW5pZmVzdChpbnB1dC5sb2NhdGlvbiwgbWFuaWZlc3QsIEV4dGVuc2lvblNjYW5uZXJJbnB1dC5jcmVhdGVObHNDb25maWd1cmF0aW9uKGlucHV0KSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdGYWlsZWQgdG8gdHJhbnNsYXRlIG1hbmlmZXN0JywgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0fVxuXHRcdGxldCBleHRlbnNpb246IElSZWxheGVkU2Nhbm5lZEV4dGVuc2lvbiA9IHtcblx0XHRcdHR5cGUsXG5cdFx0XHRpZGVudGlmaWVyLFxuXHRcdFx0bWFuaWZlc3QsXG5cdFx0XHRsb2NhdGlvbjogaW5wdXQubG9jYXRpb24sXG5cdFx0XHRpc0J1aWx0aW4sXG5cdFx0XHR0YXJnZXRQbGF0Zm9ybTogbWV0YWRhdGE/LnRhcmdldFBsYXRmb3JtID8/IFRhcmdldFBsYXRmb3JtLlVOREVGSU5FRCxcblx0XHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBtZXRhZGF0YT8ucHVibGlzaGVyRGlzcGxheU5hbWUsXG5cdFx0XHRtZXRhZGF0YSxcblx0XHRcdGlzVmFsaWQsXG5cdFx0XHR2YWxpZGF0aW9ucyxcblx0XHRcdHByZVJlbGVhc2U6ICEhbWV0YWRhdGE/LnByZVJlbGVhc2UsXG5cdFx0XHRmb3JjZUF1dG9VcGRhdGU6IHRoaXMucHJvZHVjdEJ1aWx0SW5FeHRlbnNpb25zRW5hYmxlZFdpdGhBdXRvVXBkYXRlcy5oYXMoaWQudG9Mb3dlckNhc2UoKSkgJiYgdGhpcy5wcm9kdWN0UXVhbGl0eSA9PT0gJ3N0YWJsZScsXG5cdFx0fTtcblx0XHRpZiAoaW5wdXQudmFsaWRhdGUpIHtcblx0XHRcdGV4dGVuc2lvbiA9IHRoaXMudmFsaWRhdGUoZXh0ZW5zaW9uLCBpbnB1dCk7XG5cdFx0fVxuXHRcdGlmIChtYW5pZmVzdC5lbmFibGVkQXBpUHJvcG9zYWxzKSB7XG5cdFx0XHRtYW5pZmVzdC5vcmlnaW5hbEVuYWJsZWRBcGlQcm9wb3NhbHMgPSBtYW5pZmVzdC5lbmFibGVkQXBpUHJvcG9zYWxzO1xuXHRcdFx0bWFuaWZlc3QuZW5hYmxlZEFwaVByb3Bvc2FscyA9IHBhcnNlRW5hYmxlZEFwaVByb3Bvc2FsTmFtZXMoWy4uLm1hbmlmZXN0LmVuYWJsZWRBcGlQcm9wb3NhbHNdKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4dGVuc2lvbjtcblx0fVxuXG5cdHZhbGlkYXRlKGV4dGVuc2lvbjogSVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uLCBpbnB1dDogRXh0ZW5zaW9uU2Nhbm5lcklucHV0KTogSVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uIHtcblx0XHRsZXQgaXNWYWxpZCA9IGV4dGVuc2lvbi5pc1ZhbGlkO1xuXHRcdGNvbnN0IHZhbGlkYXRpb25zID0gdmFsaWRhdGVFeHRlbnNpb25NYW5pZmVzdChpbnB1dC5wcm9kdWN0VmVyc2lvbiwgaW5wdXQucHJvZHVjdERhdGUsIGlucHV0LmxvY2F0aW9uLCBleHRlbnNpb24ubWFuaWZlc3QsIGV4dGVuc2lvbi5pc0J1aWx0aW4pO1xuXHRcdGZvciAoY29uc3QgW3NldmVyaXR5LCBtZXNzYWdlXSBvZiB2YWxpZGF0aW9ucykge1xuXHRcdFx0aWYgKHNldmVyaXR5ID09PSBTZXZlcml0eS5FcnJvcikge1xuXHRcdFx0XHRpc1ZhbGlkID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcih0aGlzLmZvcm1hdE1lc3NhZ2UoaW5wdXQubG9jYXRpb24sIG1lc3NhZ2UpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZXh0ZW5zaW9uLmlzVmFsaWQgPSBpc1ZhbGlkO1xuXHRcdGV4dGVuc2lvbi52YWxpZGF0aW9ucyA9IFsuLi5leHRlbnNpb24udmFsaWRhdGlvbnMsIC4uLnZhbGlkYXRpb25zXTtcblx0XHRyZXR1cm4gZXh0ZW5zaW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzY2FuRXh0ZW5zaW9uTWFuaWZlc3QoZXh0ZW5zaW9uTG9jYXRpb246IFVSSSk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25NYW5pZmVzdD4ge1xuXHRcdGNvbnN0IG1hbmlmZXN0TG9jYXRpb24gPSBqb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgJ3BhY2thZ2UuanNvbicpO1xuXHRcdGxldCBjb250ZW50O1xuXHRcdHRyeSB7XG5cdFx0XHRjb250ZW50ID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUobWFuaWZlc3RMb2NhdGlvbikpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcih0aGlzLmZvcm1hdE1lc3NhZ2UoZXh0ZW5zaW9uTG9jYXRpb24sIGxvY2FsaXplKCdmaWxlUmVhZEZhaWwnLCBcIkNhbm5vdCByZWFkIGZpbGUgezB9OiB7MX0uXCIsIG1hbmlmZXN0TG9jYXRpb24ucGF0aCwgZXJyb3IubWVzc2FnZSkpKTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0XHRsZXQgbWFuaWZlc3Q6IElTY2FubmVkRXh0ZW5zaW9uTWFuaWZlc3Q7XG5cdFx0dHJ5IHtcblx0XHRcdG1hbmlmZXN0ID0gSlNPTi5wYXJzZShjb250ZW50KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIGludmFsaWQgSlNPTiwgbGV0J3MgZ2V0IGdvb2QgZXJyb3JzXG5cdFx0XHRjb25zdCBlcnJvcnM6IFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdFx0cGFyc2UoY29udGVudCwgZXJyb3JzKTtcblx0XHRcdGZvciAoY29uc3QgZSBvZiBlcnJvcnMpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKHRoaXMuZm9ybWF0TWVzc2FnZShleHRlbnNpb25Mb2NhdGlvbiwgbG9jYWxpemUoJ2pzb25QYXJzZUZhaWwnLCBcIkZhaWxlZCB0byBwYXJzZSB7MH06IFt7MX0sIHsyfV0gezN9LlwiLCBtYW5pZmVzdExvY2F0aW9uLnBhdGgsIGUub2Zmc2V0LCBlLmxlbmd0aCwgZ2V0UGFyc2VFcnJvck1lc3NhZ2UoZS5lcnJvcikpKSk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHRcdGlmIChnZXROb2RlVHlwZShtYW5pZmVzdCkgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSB0aGlzLmZvcm1hdE1lc3NhZ2UoZXh0ZW5zaW9uTG9jYXRpb24sIGxvY2FsaXplKCdqc29uUGFyc2VJbnZhbGlkVHlwZScsIFwiSW52YWxpZCBtYW5pZmVzdCBmaWxlIHswfTogTm90IGEgSlNPTiBvYmplY3QuXCIsIG1hbmlmZXN0TG9jYXRpb24ucGF0aCkpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yTWVzc2FnZSk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoZXJyb3JNZXNzYWdlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1hbmlmZXN0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0cmFuc2xhdGVNYW5pZmVzdChleHRlbnNpb25Mb2NhdGlvbjogVVJJLCBleHRlbnNpb25NYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LCBubHNDb25maWd1cmF0aW9uOiBObHNDb25maWd1cmF0aW9uKTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuaWZlc3Q+IHtcblx0XHRjb25zdCBsb2NhbGl6ZWRNZXNzYWdlcyA9IGF3YWl0IHRoaXMuZ2V0TG9jYWxpemVkTWVzc2FnZXMoZXh0ZW5zaW9uTG9jYXRpb24sIGV4dGVuc2lvbk1hbmlmZXN0LCBubHNDb25maWd1cmF0aW9uKTtcblx0XHRpZiAobG9jYWxpemVkTWVzc2FnZXMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGVycm9yczogUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRcdC8vIHJlc29sdmVPcmlnaW5hbE1lc3NhZ2VCdW5kbGUgcmV0dXJucyBudWxsIGlmIGxvY2FsaXplZE1lc3NhZ2VzLmRlZmF1bHQgPT09IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdHMgPSBhd2FpdCB0aGlzLnJlc29sdmVPcmlnaW5hbE1lc3NhZ2VCdW5kbGUobG9jYWxpemVkTWVzc2FnZXMuZGVmYXVsdCwgZXJyb3JzKTtcblx0XHRcdFx0aWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0ZXJyb3JzLmZvckVhY2goKGVycm9yKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IodGhpcy5mb3JtYXRNZXNzYWdlKGV4dGVuc2lvbkxvY2F0aW9uLCBsb2NhbGl6ZSgnanNvbnNQYXJzZVJlcG9ydEVycm9ycycsIFwiRmFpbGVkIHRvIHBhcnNlIHswfTogezF9LlwiLCBsb2NhbGl6ZWRNZXNzYWdlcy5kZWZhdWx0Py5wYXRoLCBnZXRQYXJzZUVycm9yTWVzc2FnZShlcnJvci5lcnJvcikpKSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvbk1hbmlmZXN0O1xuXHRcdFx0XHR9IGVsc2UgaWYgKGdldE5vZGVUeXBlKGxvY2FsaXplZE1lc3NhZ2VzKSAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IodGhpcy5mb3JtYXRNZXNzYWdlKGV4dGVuc2lvbkxvY2F0aW9uLCBsb2NhbGl6ZSgnanNvbkludmFsaWRGb3JtYXQnLCBcIkludmFsaWQgZm9ybWF0IHswfTogSlNPTiBvYmplY3QgZXhwZWN0ZWQuXCIsIGxvY2FsaXplZE1lc3NhZ2VzLmRlZmF1bHQ/LnBhdGgpKSk7XG5cdFx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvbk1hbmlmZXN0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGxvY2FsaXplZCA9IGxvY2FsaXplZE1lc3NhZ2VzLnZhbHVlcyB8fCBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemVNYW5pZmVzdCh0aGlzLmxvZ1NlcnZpY2UsIGV4dGVuc2lvbk1hbmlmZXN0LCBsb2NhbGl6ZWQsIGRlZmF1bHRzKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8qSWdub3JlIEVycm9yKi9cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGV4dGVuc2lvbk1hbmlmZXN0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRMb2NhbGl6ZWRNZXNzYWdlcyhleHRlbnNpb25Mb2NhdGlvbjogVVJJLCBleHRlbnNpb25NYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LCBubHNDb25maWd1cmF0aW9uOiBObHNDb25maWd1cmF0aW9uKTogUHJvbWlzZTxMb2NhbGl6ZWRNZXNzYWdlcyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRlZmF1bHRQYWNrYWdlTkxTID0gam9pblBhdGgoZXh0ZW5zaW9uTG9jYXRpb24sICdwYWNrYWdlLm5scy5qc29uJyk7XG5cdFx0Y29uc3QgcmVwb3J0RXJyb3JzID0gKGxvY2FsaXplZDogVVJJIHwgbnVsbCwgZXJyb3JzOiBQYXJzZUVycm9yW10pOiB2b2lkID0+IHtcblx0XHRcdGVycm9ycy5mb3JFYWNoKChlcnJvcikgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IodGhpcy5mb3JtYXRNZXNzYWdlKGV4dGVuc2lvbkxvY2F0aW9uLCBsb2NhbGl6ZSgnanNvbnNQYXJzZVJlcG9ydEVycm9ycycsIFwiRmFpbGVkIHRvIHBhcnNlIHswfTogezF9LlwiLCBsb2NhbGl6ZWQ/LnBhdGgsIGdldFBhcnNlRXJyb3JNZXNzYWdlKGVycm9yLmVycm9yKSkpKTtcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0Y29uc3QgcmVwb3J0SW52YWxpZEZvcm1hdCA9IChsb2NhbGl6ZWQ6IFVSSSB8IG51bGwpOiB2b2lkID0+IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcih0aGlzLmZvcm1hdE1lc3NhZ2UoZXh0ZW5zaW9uTG9jYXRpb24sIGxvY2FsaXplKCdqc29uSW52YWxpZEZvcm1hdCcsIFwiSW52YWxpZCBmb3JtYXQgezB9OiBKU09OIG9iamVjdCBleHBlY3RlZC5cIiwgbG9jYWxpemVkPy5wYXRoKSkpO1xuXHRcdH07XG5cblx0XHRjb25zdCB0cmFuc2xhdGlvbklkID0gYCR7ZXh0ZW5zaW9uTWFuaWZlc3QucHVibGlzaGVyfS4ke2V4dGVuc2lvbk1hbmlmZXN0Lm5hbWV9YDtcblx0XHRjb25zdCB0cmFuc2xhdGlvblBhdGggPSBubHNDb25maWd1cmF0aW9uLnRyYW5zbGF0aW9uc1t0cmFuc2xhdGlvbklkXTtcblxuXHRcdGlmICh0cmFuc2xhdGlvblBhdGgpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHRyYW5zbGF0aW9uUmVzb3VyY2UgPSBVUkkuZmlsZSh0cmFuc2xhdGlvblBhdGgpO1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodHJhbnNsYXRpb25SZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGNvbnN0IGVycm9yczogUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRcdGNvbnN0IHRyYW5zbGF0aW9uQnVuZGxlOiBUcmFuc2xhdGlvbkJ1bmRsZSA9IHBhcnNlKGNvbnRlbnQsIGVycm9ycyk7XG5cdFx0XHRcdGlmIChlcnJvcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHJlcG9ydEVycm9ycyh0cmFuc2xhdGlvblJlc291cmNlLCBlcnJvcnMpO1xuXHRcdFx0XHRcdHJldHVybiB7IHZhbHVlczogdW5kZWZpbmVkLCBkZWZhdWx0OiBkZWZhdWx0UGFja2FnZU5MUyB9O1xuXHRcdFx0XHR9IGVsc2UgaWYgKGdldE5vZGVUeXBlKHRyYW5zbGF0aW9uQnVuZGxlKSAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRyZXBvcnRJbnZhbGlkRm9ybWF0KHRyYW5zbGF0aW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdHJldHVybiB7IHZhbHVlczogdW5kZWZpbmVkLCBkZWZhdWx0OiBkZWZhdWx0UGFja2FnZU5MUyB9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlcyA9IHRyYW5zbGF0aW9uQnVuZGxlLmNvbnRlbnRzID8gdHJhbnNsYXRpb25CdW5kbGUuY29udGVudHMucGFja2FnZSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRyZXR1cm4geyB2YWx1ZXM6IHZhbHVlcywgZGVmYXVsdDogZGVmYXVsdFBhY2thZ2VOTFMgfTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIHsgdmFsdWVzOiB1bmRlZmluZWQsIGRlZmF1bHQ6IGRlZmF1bHRQYWNrYWdlTkxTIH07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKGRlZmF1bHRQYWNrYWdlTkxTKTtcblx0XHRcdGlmICghZXhpc3RzKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRsZXQgbWVzc2FnZUJ1bmRsZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdG1lc3NhZ2VCdW5kbGUgPSBhd2FpdCB0aGlzLmZpbmRNZXNzYWdlQnVuZGxlcyhleHRlbnNpb25Mb2NhdGlvbiwgbmxzQ29uZmlndXJhdGlvbik7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFtZXNzYWdlQnVuZGxlLmxvY2FsaXplZCkge1xuXHRcdFx0XHRyZXR1cm4geyB2YWx1ZXM6IHVuZGVmaW5lZCwgZGVmYXVsdDogbWVzc2FnZUJ1bmRsZS5vcmlnaW5hbCB9O1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZUJ1bmRsZUNvbnRlbnQgPSAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShtZXNzYWdlQnVuZGxlLmxvY2FsaXplZCkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGNvbnN0IGVycm9yczogUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2VzOiBNZXNzYWdlQmFnID0gcGFyc2UobWVzc2FnZUJ1bmRsZUNvbnRlbnQsIGVycm9ycyk7XG5cdFx0XHRcdGlmIChlcnJvcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHJlcG9ydEVycm9ycyhtZXNzYWdlQnVuZGxlLmxvY2FsaXplZCwgZXJyb3JzKTtcblx0XHRcdFx0XHRyZXR1cm4geyB2YWx1ZXM6IHVuZGVmaW5lZCwgZGVmYXVsdDogbWVzc2FnZUJ1bmRsZS5vcmlnaW5hbCB9O1xuXHRcdFx0XHR9IGVsc2UgaWYgKGdldE5vZGVUeXBlKG1lc3NhZ2VzKSAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRyZXBvcnRJbnZhbGlkRm9ybWF0KG1lc3NhZ2VCdW5kbGUubG9jYWxpemVkKTtcblx0XHRcdFx0XHRyZXR1cm4geyB2YWx1ZXM6IHVuZGVmaW5lZCwgZGVmYXVsdDogbWVzc2FnZUJ1bmRsZS5vcmlnaW5hbCB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IHZhbHVlczogbWVzc2FnZXMsIGRlZmF1bHQ6IG1lc3NhZ2VCdW5kbGUub3JpZ2luYWwgfTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB7IHZhbHVlczogdW5kZWZpbmVkLCBkZWZhdWx0OiBtZXNzYWdlQnVuZGxlLm9yaWdpbmFsIH07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFBhcnNlcyBvcmlnaW5hbCBtZXNzYWdlIGJ1bmRsZSwgcmV0dXJucyBudWxsIGlmIHRoZSBvcmlnaW5hbCBtZXNzYWdlIGJ1bmRsZSBpcyBudWxsLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlT3JpZ2luYWxNZXNzYWdlQnVuZGxlKG9yaWdpbmFsTWVzc2FnZUJ1bmRsZTogVVJJIHwgbnVsbCwgZXJyb3JzOiBQYXJzZUVycm9yW10pOiBQcm9taXNlPHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAob3JpZ2luYWxNZXNzYWdlQnVuZGxlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBvcmlnaW5hbEJ1bmRsZUNvbnRlbnQgPSAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShvcmlnaW5hbE1lc3NhZ2VCdW5kbGUpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0XHRyZXR1cm4gcGFyc2Uob3JpZ2luYWxCdW5kbGVDb250ZW50LCBlcnJvcnMpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0LyogSWdub3JlIEVycm9yICovXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kcyBsb2NhbGl6ZWQgbWVzc2FnZSBidW5kbGUgYW5kIHRoZSBvcmlnaW5hbCAodW5sb2NhbGl6ZWQpIG9uZS5cblx0ICogSWYgdGhlIGxvY2FsaXplZCBmaWxlIGlzIG5vdCBwcmVzZW50LCByZXR1cm5zIG51bGwgZm9yIHRoZSBvcmlnaW5hbCBhbmQgbWFya3Mgb3JpZ2luYWwgYXMgbG9jYWxpemVkLlxuXHQgKi9cblx0cHJpdmF0ZSBmaW5kTWVzc2FnZUJ1bmRsZXMoZXh0ZW5zaW9uTG9jYXRpb246IFVSSSwgbmxzQ29uZmlndXJhdGlvbjogTmxzQ29uZmlndXJhdGlvbik6IFByb21pc2U8eyBsb2NhbGl6ZWQ6IFVSSTsgb3JpZ2luYWw6IFVSSSB8IG51bGwgfT4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx7IGxvY2FsaXplZDogVVJJOyBvcmlnaW5hbDogVVJJIHwgbnVsbCB9PigoYywgZSkgPT4ge1xuXHRcdFx0Y29uc3QgbG9vcCA9IChsb2NhbGU6IHN0cmluZyk6IHZvaWQgPT4ge1xuXHRcdFx0XHRjb25zdCB0b0NoZWNrID0gam9pblBhdGgoZXh0ZW5zaW9uTG9jYXRpb24sIGBwYWNrYWdlLm5scy4ke2xvY2FsZX0uanNvbmApO1xuXHRcdFx0XHR0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh0b0NoZWNrKS50aGVuKGV4aXN0cyA9PiB7XG5cdFx0XHRcdFx0aWYgKGV4aXN0cykge1xuXHRcdFx0XHRcdFx0Yyh7IGxvY2FsaXplZDogdG9DaGVjaywgb3JpZ2luYWw6IGpvaW5QYXRoKGV4dGVuc2lvbkxvY2F0aW9uLCAncGFja2FnZS5ubHMuanNvbicpIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBpbmRleCA9IGxvY2FsZS5sYXN0SW5kZXhPZignLScpO1xuXHRcdFx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdGMoeyBsb2NhbGl6ZWQ6IGpvaW5QYXRoKGV4dGVuc2lvbkxvY2F0aW9uLCAncGFja2FnZS5ubHMuanNvbicpLCBvcmlnaW5hbDogbnVsbCB9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bG9jYWxlID0gbG9jYWxlLnN1YnN0cmluZygwLCBpbmRleCk7XG5cdFx0XHRcdFx0XHRsb29wKGxvY2FsZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cdFx0XHRpZiAobmxzQ29uZmlndXJhdGlvbi5kZXZNb2RlIHx8IG5sc0NvbmZpZ3VyYXRpb24ucHNldWRvIHx8ICFubHNDb25maWd1cmF0aW9uLmxhbmd1YWdlKSB7XG5cdFx0XHRcdHJldHVybiBjKHsgbG9jYWxpemVkOiBqb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgJ3BhY2thZ2UubmxzLmpzb24nKSwgb3JpZ2luYWw6IG51bGwgfSk7XG5cdFx0XHR9XG5cdFx0XHRsb29wKG5sc0NvbmZpZ3VyYXRpb24ubGFuZ3VhZ2UpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBmb3JtYXRNZXNzYWdlKGV4dGVuc2lvbkxvY2F0aW9uOiBVUkksIG1lc3NhZ2U6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGBbJHtleHRlbnNpb25Mb2NhdGlvbi5wYXRofV06ICR7bWVzc2FnZX1gO1xuXHR9XG5cbn1cblxuaW50ZXJmYWNlIElFeHRlbnNpb25DYWNoZURhdGEge1xuXHRpbnB1dDogRXh0ZW5zaW9uU2Nhbm5lcklucHV0O1xuXHRyZXN1bHQ6IElSZWxheGVkU2Nhbm5lZEV4dGVuc2lvbltdO1xufVxuXG5jbGFzcyBDYWNoZWRFeHRlbnNpb25zU2Nhbm5lciBleHRlbmRzIEV4dGVuc2lvbnNTY2FubmVyIHtcblxuXHRwcml2YXRlIGlucHV0OiBFeHRlbnNpb25TY2FubmVySW5wdXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2FjaGVWYWxpZGF0b3JUaHJvdHRsZXI6IFRocm90dGxlZERlbGF5ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcigzMDAwKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDYWNoZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNhY2hlID0gdGhpcy5fb25EaWRDaGFuZ2VDYWNoZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGN1cnJlbnRQcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSBleHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgZmlsZVNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2NhbkV4dGVuc2lvbnMoaW5wdXQ6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCk6IFByb21pc2U8SVJlbGF4ZWRTY2FubmVkRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBjYWNoZUZpbGUgPSB0aGlzLmdldENhY2hlRmlsZShpbnB1dCk7XG5cdFx0Y29uc3QgY2FjaGVDb250ZW50cyA9IGF3YWl0IHRoaXMucmVhZEV4dGVuc2lvbkNhY2hlKGNhY2hlRmlsZSk7XG5cdFx0dGhpcy5pbnB1dCA9IGlucHV0O1xuXHRcdGlmIChjYWNoZUNvbnRlbnRzICYmIGNhY2hlQ29udGVudHMuaW5wdXQgJiYgRXh0ZW5zaW9uU2Nhbm5lcklucHV0LmVxdWFscyhjYWNoZUNvbnRlbnRzLmlucHV0LCB0aGlzLmlucHV0KSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdVc2luZyBjYWNoZWQgZXh0ZW5zaW9ucyBzY2FuIHJlc3VsdCcsIGlucHV0LnR5cGUgPT09IEV4dGVuc2lvblR5cGUuU3lzdGVtID8gJ3N5c3RlbScgOiAndXNlcicsIGlucHV0LmxvY2F0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0dGhpcy5jYWNoZVZhbGlkYXRvclRocm90dGxlci50cmlnZ2VyKCgpID0+IHRoaXMudmFsaWRhdGVDYWNoZSgpKTtcblx0XHRcdHJldHVybiBjYWNoZUNvbnRlbnRzLnJlc3VsdC5tYXAoKGV4dGVuc2lvbikgPT4ge1xuXHRcdFx0XHQvLyByZXZpdmUgVVJJIG9iamVjdFxuXHRcdFx0XHRleHRlbnNpb24ubG9jYXRpb24gPSBVUkkucmV2aXZlKGV4dGVuc2lvbi5sb2NhdGlvbik7XG5cdFx0XHRcdHJldHVybiBleHRlbnNpb247XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3VwZXIuc2NhbkV4dGVuc2lvbnMoaW5wdXQpO1xuXHRcdGF3YWl0IHRoaXMud3JpdGVFeHRlbnNpb25DYWNoZShjYWNoZUZpbGUsIHsgaW5wdXQsIHJlc3VsdCB9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWFkRXh0ZW5zaW9uQ2FjaGUoY2FjaGVGaWxlOiBVUkkpOiBQcm9taXNlPElFeHRlbnNpb25DYWNoZURhdGEgfCBudWxsPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhY2hlUmF3Q29udGVudHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGNhY2hlRmlsZSk7XG5cdFx0XHRjb25zdCBleHRlbnNpb25DYWNoZURhdGE6IElFeHRlbnNpb25DYWNoZURhdGEgPSBKU09OLnBhcnNlKGNhY2hlUmF3Q29udGVudHMudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6IGV4dGVuc2lvbkNhY2hlRGF0YS5yZXN1bHQsIGlucHV0OiByZXZpdmUoZXh0ZW5zaW9uQ2FjaGVEYXRhLmlucHV0KSB9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ0Vycm9yIHdoaWxlIHJlYWRpbmcgdGhlIGV4dGVuc2lvbiBjYWNoZSBmaWxlOicsIGNhY2hlRmlsZS5wYXRoLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdyaXRlRXh0ZW5zaW9uQ2FjaGUoY2FjaGVGaWxlOiBVUkksIGNhY2hlQ29udGVudHM6IElFeHRlbnNpb25DYWNoZURhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUoY2FjaGVGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGNhY2hlQ29udGVudHMpKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnRXJyb3Igd2hpbGUgd3JpdGluZyB0aGUgZXh0ZW5zaW9uIGNhY2hlIGZpbGU6JywgY2FjaGVGaWxlLnBhdGgsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdmFsaWRhdGVDYWNoZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaW5wdXQpIHtcblx0XHRcdC8vIElucHV0IGhhcyBiZWVuIHVuc2V0IGJ5IHRoZSB0aW1lIHdlIGdldCBoZXJlLCBzbyBza2lwIHZhbGlkYXRpb25cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjYWNoZUZpbGUgPSB0aGlzLmdldENhY2hlRmlsZSh0aGlzLmlucHV0KTtcblx0XHRjb25zdCBjYWNoZUNvbnRlbnRzID0gYXdhaXQgdGhpcy5yZWFkRXh0ZW5zaW9uQ2FjaGUoY2FjaGVGaWxlKTtcblx0XHRpZiAoIWNhY2hlQ29udGVudHMpIHtcblx0XHRcdC8vIENhY2hlIGhhcyBiZWVuIGRlbGV0ZWQgYnkgc29tZW9uZSBlbHNlLCB3aGljaCBpcyBwZXJmZWN0bHkgZmluZS4uLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdHVhbCA9IGNhY2hlQ29udGVudHMucmVzdWx0O1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShhd2FpdCBzdXBlci5zY2FuRXh0ZW5zaW9ucyh0aGlzLmlucHV0KSkpO1xuXHRcdGlmIChvYmplY3RzLmVxdWFscyhleHBlY3RlZCwgYWN0dWFsKSkge1xuXHRcdFx0Ly8gQ2FjaGUgaXMgdmFsaWQgYW5kIHJ1bm5pbmcgd2l0aCBpdCBpcyBwZXJmZWN0bHkgZmluZS4uLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnSW52YWxpZGF0aW5nIENhY2hlJywgYWN0dWFsLCBleHBlY3RlZCk7XG5cdFx0XHQvLyBDYWNoZSBpcyBpbnZhbGlkLCBkZWxldGUgaXRcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKGNhY2hlRmlsZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNhY2hlLmZpcmUoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldENhY2hlRmlsZShpbnB1dDogRXh0ZW5zaW9uU2Nhbm5lcklucHV0KTogVVJJIHtcblx0XHRjb25zdCBwcm9maWxlID0gdGhpcy5nZXRQcm9maWxlKGlucHV0KTtcblx0XHRyZXR1cm4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKHByb2ZpbGUuY2FjaGVIb21lLCBpbnB1dC50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbSA/IEJVSUxUSU5fTUFOSUZFU1RfQ0FDSEVfRklMRSA6IFVTRVJfTUFOSUZFU1RfQ0FDSEVfRklMRSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFByb2ZpbGUoaW5wdXQ6IEV4dGVuc2lvblNjYW5uZXJJbnB1dCk6IElVc2VyRGF0YVByb2ZpbGUge1xuXHRcdGlmIChpbnB1dC50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGU7XG5cdFx0fVxuXHRcdGlmICghaW5wdXQucHJvZmlsZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChpbnB1dC5sb2NhdGlvbiwgdGhpcy5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jdXJyZW50UHJvZmlsZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmluZChwID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGlucHV0LmxvY2F0aW9uLCBwLmV4dGVuc2lvbnNSZXNvdXJjZSkpID8/IHRoaXMuY3VycmVudFByb2ZpbGU7XG5cdH1cblxufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9FeHRlbnNpb25EZXNjcmlwdGlvbihleHRlbnNpb246IElTY2FubmVkRXh0ZW5zaW9uLCBpc1VuZGVyRGV2ZWxvcG1lbnQ6IGJvb2xlYW4pOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24ge1xuXHRjb25zdCBpZCA9IGdldEV4dGVuc2lvbklkKGV4dGVuc2lvbi5tYW5pZmVzdC5wdWJsaXNoZXIsIGV4dGVuc2lvbi5tYW5pZmVzdC5uYW1lKTtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHRpZGVudGlmaWVyOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcihpZCksXG5cdFx0aXNCdWlsdGluOiBleHRlbnNpb24udHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0sXG5cdFx0aXNVc2VyQnVpbHRpbjogZXh0ZW5zaW9uLnR5cGUgPT09IEV4dGVuc2lvblR5cGUuVXNlciAmJiBleHRlbnNpb24uaXNCdWlsdGluLFxuXHRcdGlzVW5kZXJEZXZlbG9wbWVudCxcblx0XHRleHRlbnNpb25Mb2NhdGlvbjogZXh0ZW5zaW9uLmxvY2F0aW9uLFxuXHRcdHV1aWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQsXG5cdFx0dGFyZ2V0UGxhdGZvcm06IGV4dGVuc2lvbi50YXJnZXRQbGF0Zm9ybSxcblx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lLFxuXHRcdHByZVJlbGVhc2U6IGV4dGVuc2lvbi5wcmVSZWxlYXNlLFxuXHRcdC4uLmV4dGVuc2lvbi5tYW5pZmVzdCxcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIE5hdGl2ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSBleHRlbmRzIEFic3RyYWN0RXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIGltcGxlbWVudHMgSUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0cmFuc2xhdGlvbnNQcm9taXNlOiBQcm9taXNlPFRyYW5zbGF0aW9ucz47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c3lzdGVtRXh0ZW5zaW9uc0xvY2F0aW9uOiBVUkksXG5cdFx0dXNlckV4dGVuc2lvbnNMb2NhdGlvbjogVVJJLFxuXHRcdHVzZXJIb21lOiBVUkksXG5cdFx0Y3VycmVudFByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsXG5cdFx0dXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRleHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSxcblx0XHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdHN5c3RlbUV4dGVuc2lvbnNMb2NhdGlvbixcblx0XHRcdHVzZXJFeHRlbnNpb25zTG9jYXRpb24sXG5cdFx0XHRqb2luUGF0aCh1c2VySG9tZSwgJy52c2NvZGUtb3NzLWRldicsICdleHRlbnNpb25zJywgJ2NvbnRyb2wuanNvbicpLFxuXHRcdFx0Y3VycmVudFByb2ZpbGUsXG5cdFx0XHR1c2VyRGF0YVByb2ZpbGVzU2VydmljZSwgZXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMudHJhbnNsYXRpb25zUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAocGxhdGZvcm0udHJhbnNsYXRpb25zQ29uZmlnRmlsZSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5maWxlKHBsYXRmb3JtLnRyYW5zbGF0aW9uc0NvbmZpZ0ZpbGUpKTtcblx0XHRcdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHsgLyogSWdub3JlIEVycm9yICovIH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdH0pKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0VHJhbnNsYXRpb25zKGxhbmd1YWdlOiBzdHJpbmcpOiBQcm9taXNlPFRyYW5zbGF0aW9ucz4ge1xuXHRcdHJldHVybiB0aGlzLnRyYW5zbGF0aW9uc1Byb21pc2U7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxZQUFZLGFBQWE7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxhQUFhLGFBQXlCO0FBQy9DLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsWUFBWSxlQUFlO0FBQ3BDLFlBQVksVUFBVTtBQUN0QixZQUFZLGNBQWM7QUFDMUIsU0FBUyxVQUFVLFNBQVMsZ0JBQWdCO0FBQzVDLFlBQVksWUFBWTtBQUN4QixPQUFPLGNBQWM7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsbUJBQW1CLHVCQUF1QixnQkFBZ0IsNkJBQTZCO0FBQ2hHLFNBQVMsZUFBZSxxQkFBeUMsZ0JBQWlFLHFCQUE0Qyw2QkFBNkIsMEJBQTBCLHdCQUF3QixvQ0FBb0M7QUFDalMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxxQkFBcUIsY0FBYyw2QkFBNkI7QUFDekUsU0FBUyxpQkFBaUIs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TSxVQUFVLEVBQUUsa0JBQWtCLENBQUMsS0FBSyxLQUFLO0FBQUEsRUFDOUk7QUFFRDtBQTVHTSwwQkFBTjtBQUFBLEVBVUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWhCRztBQThHQyxTQUFTLHVCQUF1QixXQUE4QixvQkFBb0Q7QUFDeEgsUUFBTSxLQUFLLGVBQWUsVUFBVSxTQUFTLFdBQVcsVUFBVSxTQUFTLElBQUk7QUFDL0UsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBLFlBQVksSUFBSSxvQkFBb0IsRUFBRTtBQUFBLElBQ3RDLFdBQVcsVUFBVSxTQUFTLGNBQWM7QUFBQSxJQUM1QyxlQUFlLFVBQVUsU0FBUyxjQUFjLFFBQVEsVUFBVTtBQUFBLElBQ2xFO0FBQUEsSUFDQSxtQkFBbUIsVUFBVTtBQUFBLElBQzdCLE1BQU0sVUFBVSxXQUFXO0FBQUEsSUFDM0IsZ0JBQWdCLFVBQVU7QUFBQSxJQUMxQixzQkFBc0IsVUFBVTtBQUFBLElBQ2hDLFlBQVksVUFBVTtBQUFBLElBQ3RCLEdBQUcsVUFBVTtBQUFBLEVBQ2Q7QUFDRDtBQUVPLE1BQU0sdUNBQXVDLGlDQUFzRTtBQUFBLEVBSXpILFlBQ0MsMEJBQ0Esd0JBQ0EsVUFDQSxnQkFDQSx5QkFDQSxpQ0FDQSxhQUNBLFlBQ0Esb0JBQ0EsZ0JBQ0Esb0JBQ0Esc0JBQ0M7QUFDRDtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsTUFDQSxTQUFTLFVBQVUsbUJBQW1CLGNBQWMsY0FBYztBQUFBLE1BQ2xFO0FBQUEsTUFDQTtBQUFBLE1BQXlCO0FBQUEsTUFBaUM7QUFBQSxNQUFhO0FBQUEsTUFBWTtBQUFBLE1BQW9CO0FBQUEsTUFBZ0I7QUFBQSxNQUFvQjtBQUFBLElBQW9CO0FBQ2hLLFNBQUssdUJBQXVCLFlBQVk7QUFDdkMsVUFBSSxTQUFTLHdCQUF3QjtBQUNwQyxZQUFJO0FBQ0gsZ0JBQU0sVUFBVSxNQUFNLEtBQUssWUFBWSxTQUFTLElBQUksS0FBSyxTQUFTLHNCQUFzQixDQUFDO0FBQ3pGLGlCQUFPLEtBQUssTUFBTSxRQUFRLE1BQU0sU0FBUyxDQUFDO0FBQUEsUUFDM0MsU0FBUyxLQUFLO0FBQUEsUUFBcUI7QUFBQSxNQUNwQztBQUNBLGFBQU8sdUJBQU8sT0FBTyxJQUFJO0FBQUEsSUFDMUIsR0FBRztBQUFBLEVBQ0o7QUFBQSxFQUVVLGdCQUFnQixVQUF5QztBQUNsRSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBRUQ7IiwKICAibmFtZXMiOiBbIlRyYW5zbGF0aW9ucyIsICJleHRlbnNpb25zIl0KfQo=
