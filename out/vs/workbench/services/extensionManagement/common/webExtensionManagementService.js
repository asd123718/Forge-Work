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
import { ExtensionIdentifier, ExtensionType, TargetPlatform } from "../../../../platform/extensions/common/extensions.js";
import { InstallOperation, IExtensionGalleryService, IAllowedExtensionsService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { URI } from "../../../../base/common/uri.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { areSameExtensions, getGalleryExtensionId } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { IWebExtensionsScannerService } from "./extensionManagement.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { AbstractExtensionManagementService, AbstractExtensionTask, toExtensionManagementError } from "../../../../platform/extensionManagement/common/abstractExtensionManagementService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IExtensionManifestPropertiesService } from "../../extensions/common/extensionManifestPropertiesService.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { isBoolean, isUndefined } from "../../../../base/common/types.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { delta } from "../../../../base/common/arrays.js";
import { compare } from "../../../../base/common/strings.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
let WebExtensionManagementService = class extends AbstractExtensionManagementService {
  constructor(extensionGalleryService, telemetryService, logService, webExtensionsScannerService, extensionManifestPropertiesService, userDataProfileService, productService, allowedExtensionsService, userDataProfilesService, uriIdentityService) {
    super(extensionGalleryService, telemetryService, uriIdentityService, logService, productService, allowedExtensionsService, userDataProfilesService);
    this.webExtensionsScannerService = webExtensionsScannerService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.userDataProfileService = userDataProfileService;
    this.disposables = this._register(new DisposableStore());
    this._onDidChangeProfile = this._register(new Emitter());
    this.onDidChangeProfile = this._onDidChangeProfile.event;
    this._register(userDataProfileService.onDidChangeCurrentProfile((e) => {
      if (!this.uriIdentityService.extUri.isEqual(e.previous.extensionsResource, e.profile.extensionsResource)) {
        e.join(this.whenProfileChanged(e));
      }
    }));
  }
  get onProfileAwareInstallExtension() {
    return super.onInstallExtension;
  }
  get onInstallExtension() {
    return Event.filter(this.onProfileAwareInstallExtension, (e) => this.filterEvent(e), this.disposables);
  }
  get onProfileAwareDidInstallExtensions() {
    return super.onDidInstallExtensions;
  }
  get onDidInstallExtensions() {
    return Event.filter(
      Event.map(this.onProfileAwareDidInstallExtensions, (results) => results.filter((e) => this.filterEvent(e)), this.disposables),
      (results) => results.length > 0,
      this.disposables
    );
  }
  get onProfileAwareUninstallExtension() {
    return super.onUninstallExtension;
  }
  get onUninstallExtension() {
    return Event.filter(this.onProfileAwareUninstallExtension, (e) => this.filterEvent(e), this.disposables);
  }
  get onProfileAwareDidUninstallExtension() {
    return super.onDidUninstallExtension;
  }
  get onDidUninstallExtension() {
    return Event.filter(this.onProfileAwareDidUninstallExtension, (e) => this.filterEvent(e), this.disposables);
  }
  get onProfileAwareDidUpdateExtensionMetadata() {
    return super.onDidUpdateExtensionMetadata;
  }
  filterEvent({ profileLocation, applicationScoped }) {
    profileLocation = profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource;
    return applicationScoped || this.uriIdentityService.extUri.isEqual(this.userDataProfileService.currentProfile.extensionsResource, profileLocation);
  }
  async getTargetPlatform() {
    return TargetPlatform.WEB;
  }
  async isExtensionPlatformCompatible(extension) {
    if (this.isConfiguredToExecuteOnWeb(extension)) {
      return true;
    }
    return super.isExtensionPlatformCompatible(extension);
  }
  async getInstalled(type, profileLocation) {
    const extensions = [];
    if (type === void 0 || type === ExtensionType.System) {
      const systemExtensions = await this.webExtensionsScannerService.scanSystemExtensions();
      extensions.push(...systemExtensions);
    }
    if (type === void 0 || type === ExtensionType.User) {
      const userExtensions = await this.webExtensionsScannerService.scanUserExtensions(profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource);
      extensions.push(...userExtensions);
    }
    return extensions.map((e) => toLocalExtension(e));
  }
  async install(location, options = {}) {
    this.logService.trace("ExtensionManagementService#install", location.toString());
    const manifest = await this.webExtensionsScannerService.scanExtensionManifest(location);
    if (!manifest || !manifest.name || !manifest.version) {
      throw new Error(`Cannot find a valid extension from the location ${location.toString()}`);
    }
    const result = await this.installExtensions([{ manifest, extension: location, options }]);
    if (result[0]?.local) {
      return result[0]?.local;
    }
    if (result[0]?.error) {
      throw result[0].error;
    }
    throw toExtensionManagementError(new Error(`Unknown error while installing extension ${getGalleryExtensionId(manifest.publisher, manifest.name)}`));
  }
  installFromLocation(location, profileLocation) {
    return this.install(location, { profileLocation });
  }
  async deleteExtension(extension) {
  }
  async copyExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
    const target = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, toProfileLocation);
    const source = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, fromProfileLocation);
    metadata = { ...source?.metadata, ...metadata };
    let scanned;
    if (target) {
      scanned = await this.webExtensionsScannerService.updateMetadata(extension, { ...target.metadata, ...metadata }, toProfileLocation);
    } else {
      scanned = await this.webExtensionsScannerService.addExtension(extension.location, metadata, toProfileLocation);
    }
    return toLocalExtension(scanned);
  }
  async moveExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
    const target = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, toProfileLocation);
    const source = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, fromProfileLocation);
    metadata = { ...source?.metadata, ...metadata };
    let scanned;
    if (target) {
      scanned = await this.webExtensionsScannerService.updateMetadata(extension, { ...target.metadata, ...metadata }, toProfileLocation);
    } else {
      scanned = await this.webExtensionsScannerService.addExtension(extension.location, metadata, toProfileLocation);
      if (source) {
        await this.webExtensionsScannerService.removeExtension(source, fromProfileLocation);
      }
    }
    return toLocalExtension(scanned);
  }
  async removeExtension(extension, fromProfileLocation) {
    const source = await this.webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, fromProfileLocation);
    if (source) {
      await this.webExtensionsScannerService.removeExtension(source, fromProfileLocation);
    }
  }
  async installExtensionsFromProfile(extensions, fromProfileLocation, toProfileLocation) {
    const result = [];
    const extensionsToInstall = (await this.webExtensionsScannerService.scanUserExtensions(fromProfileLocation)).filter((e) => extensions.some((id) => areSameExtensions(id, e.identifier)));
    if (extensionsToInstall.length) {
      await Promise.allSettled(extensionsToInstall.map(async (e) => {
        let local = await this.installFromLocation(e.location, toProfileLocation);
        if (e.metadata) {
          local = await this.updateMetadata(local, e.metadata, fromProfileLocation);
        }
        result.push(local);
      }));
    }
    return result;
  }
  async updateMetadata(local, metadata, profileLocation) {
    if (metadata.isMachineScoped === false) {
      metadata.isMachineScoped = void 0;
    }
    if (metadata.isBuiltin === false) {
      metadata.isBuiltin = void 0;
    }
    if (metadata.pinned === false) {
      metadata.pinned = void 0;
    }
    const updatedExtension = await this.webExtensionsScannerService.updateMetadata(local, metadata, profileLocation);
    const updatedLocalExtension = toLocalExtension(updatedExtension);
    this._onDidUpdateExtensionMetadata.fire({ local: updatedLocalExtension, profileLocation });
    return updatedLocalExtension;
  }
  async copyExtensions(fromProfileLocation, toProfileLocation) {
    await this.webExtensionsScannerService.copyExtensions(fromProfileLocation, toProfileLocation, (e) => !e.metadata?.isApplicationScoped);
  }
  async getCompatibleVersion(extension, sameVersion, includePreRelease, productVersion) {
    const compatibleExtension = await super.getCompatibleVersion(extension, sameVersion, includePreRelease, productVersion);
    if (compatibleExtension) {
      return compatibleExtension;
    }
    if (this.isConfiguredToExecuteOnWeb(extension)) {
      return extension;
    }
    return null;
  }
  isConfiguredToExecuteOnWeb(gallery) {
    const configuredExtensionKind = this.extensionManifestPropertiesService.getUserConfiguredExtensionKind(gallery.identifier);
    return !!configuredExtensionKind && configuredExtensionKind.includes("web");
  }
  getCurrentExtensionsManifestLocation() {
    return this.userDataProfileService.currentProfile.extensionsResource;
  }
  createInstallExtensionTask(manifest, extension, options) {
    return new InstallExtensionTask(manifest, extension, options, this.webExtensionsScannerService, this.userDataProfilesService);
  }
  createUninstallExtensionTask(extension, options) {
    return new UninstallExtensionTask(extension, options, this.webExtensionsScannerService);
  }
  zip(extension) {
    throw new Error("unsupported");
  }
  getManifest(vsix) {
    throw new Error("unsupported");
  }
  download() {
    throw new Error("unsupported");
  }
  async cleanUp() {
  }
  async whenProfileChanged(e) {
    const previousProfileLocation = e.previous.extensionsResource;
    const currentProfileLocation = e.profile.extensionsResource;
    if (!previousProfileLocation || !currentProfileLocation) {
      throw new Error("This should not happen");
    }
    const oldExtensions = await this.webExtensionsScannerService.scanUserExtensions(previousProfileLocation);
    const newExtensions = await this.webExtensionsScannerService.scanUserExtensions(currentProfileLocation);
    const { added, removed } = delta(oldExtensions, newExtensions, (a, b) => compare(`${ExtensionIdentifier.toKey(a.identifier.id)}@${a.manifest.version}`, `${ExtensionIdentifier.toKey(b.identifier.id)}@${b.manifest.version}`));
    this._onDidChangeProfile.fire({ added: added.map((e2) => toLocalExtension(e2)), removed: removed.map((e2) => toLocalExtension(e2)) });
  }
};
WebExtensionManagementService = __decorateClass([
  __decorateParam(0, IExtensionGalleryService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IWebExtensionsScannerService),
  __decorateParam(4, IExtensionManifestPropertiesService),
  __decorateParam(5, IUserDataProfileService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IAllowedExtensionsService),
  __decorateParam(8, IUserDataProfilesService),
  __decorateParam(9, IUriIdentityService)
], WebExtensionManagementService);
function toLocalExtension(extension) {
  const metadata = getMetadata(void 0, extension);
  return {
    ...extension,
    identifier: { id: extension.identifier.id, uuid: metadata.id ?? extension.identifier.uuid },
    isMachineScoped: !!metadata.isMachineScoped,
    isApplicationScoped: !!metadata.isApplicationScoped,
    publisherId: metadata.publisherId || null,
    publisherDisplayName: metadata.publisherDisplayName,
    installedTimestamp: metadata.installedTimestamp,
    isPreReleaseVersion: !!metadata.isPreReleaseVersion,
    hasPreReleaseVersion: !!metadata.hasPreReleaseVersion,
    preRelease: extension.preRelease,
    targetPlatform: TargetPlatform.WEB,
    updated: !!metadata.updated,
    pinned: !!metadata?.pinned,
    forceAutoUpdate: false,
    private: !!metadata.private,
    isWorkspaceScoped: false,
    source: metadata?.source ?? (extension.identifier.uuid ? "gallery" : "resource"),
    size: metadata.size ?? 0
  };
}
function getMetadata(options, existingExtension) {
  const metadata = { ...existingExtension?.metadata || {} };
  metadata.isMachineScoped = options?.isMachineScoped || metadata.isMachineScoped;
  return metadata;
}
class InstallExtensionTask extends AbstractExtensionTask {
  constructor(manifest, extension, options, webExtensionsScannerService, userDataProfilesService) {
    super();
    this.manifest = manifest;
    this.extension = extension;
    this.options = options;
    this.webExtensionsScannerService = webExtensionsScannerService;
    this.userDataProfilesService = userDataProfilesService;
    this._operation = InstallOperation.Install;
    this._profileLocation = options.profileLocation;
    this.identifier = URI.isUri(extension) ? { id: getGalleryExtensionId(manifest.publisher, manifest.name) } : extension.identifier;
    this.source = extension;
  }
  get profileLocation() {
    return this._profileLocation;
  }
  get operation() {
    return isUndefined(this.options.operation) ? this._operation : this.options.operation;
  }
  async doRun(token) {
    const userExtensions = await this.webExtensionsScannerService.scanUserExtensions(this.options.profileLocation);
    const existingExtension = userExtensions.find((e) => areSameExtensions(e.identifier, this.identifier));
    if (existingExtension) {
      this._operation = InstallOperation.Update;
    }
    const metadata = getMetadata(this.options, existingExtension);
    if (!URI.isUri(this.extension)) {
      metadata.id = this.extension.identifier.uuid;
      metadata.publisherDisplayName = this.extension.publisherDisplayName;
      metadata.publisherId = this.extension.publisherId;
      metadata.installedTimestamp = Date.now();
      metadata.isPreReleaseVersion = this.extension.properties.isPreReleaseVersion;
      metadata.hasPreReleaseVersion = metadata.hasPreReleaseVersion || this.extension.properties.isPreReleaseVersion;
      metadata.isBuiltin = this.options.isBuiltin || existingExtension?.isBuiltin;
      metadata.isSystem = existingExtension?.type === ExtensionType.System ? true : void 0;
      metadata.updated = !!existingExtension;
      metadata.isApplicationScoped = this.options.isApplicationScoped || metadata.isApplicationScoped;
      metadata.private = this.extension.private;
      metadata.preRelease = isBoolean(this.options.preRelease) ? this.options.preRelease : this.options.installPreReleaseVersion || this.extension.properties.isPreReleaseVersion || metadata.preRelease;
      metadata.source = URI.isUri(this.extension) ? "resource" : "gallery";
    }
    metadata.pinned = this.options.installGivenVersion ? true : this.options.pinned ?? metadata.pinned;
    this._profileLocation = metadata.isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : this.options.profileLocation;
    const scannedExtension = URI.isUri(this.extension) ? await this.webExtensionsScannerService.addExtension(this.extension, metadata, this.profileLocation) : await this.webExtensionsScannerService.addExtensionFromGallery(this.extension, metadata, this.profileLocation);
    return toLocalExtension(scannedExtension);
  }
}
class UninstallExtensionTask extends AbstractExtensionTask {
  constructor(extension, options, webExtensionsScannerService) {
    super();
    this.extension = extension;
    this.options = options;
    this.webExtensionsScannerService = webExtensionsScannerService;
  }
  doRun(token) {
    return this.webExtensionsScannerService.removeExtension(this.extension, this.options.profileLocation);
  }
}
export {
  WebExtensionManagementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25NYW5hZ2VtZW50XFxjb21tb25cXHdlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgRXh0ZW5zaW9uVHlwZSwgSUV4dGVuc2lvbiwgSUV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25NYW5pZmVzdCwgVGFyZ2V0UGxhdGZvcm0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2NhbEV4dGVuc2lvbiwgSUdhbGxlcnlFeHRlbnNpb24sIEluc3RhbGxPcGVyYXRpb24sIElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgTWV0YWRhdGEsIEluc3RhbGxPcHRpb25zLCBJUHJvZHVjdFZlcnNpb24sIElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zLCBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBJUHJvZmlsZUF3YXJlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElTY2FubmVkRXh0ZW5zaW9uLCBJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIH0gZnJvbSAnLi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgQWJzdHJhY3RFeHRlbnNpb25UYXNrLCBJSW5zdGFsbEV4dGVuc2lvblRhc2ssIEluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucywgSVVuaW5zdGFsbEV4dGVuc2lvblRhc2ssIHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yLCBVbmluc3RhbGxFeHRlbnNpb25UYXNrT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2Fic3RyYWN0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNCb29sZWFuLCBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IERpZENoYW5nZVVzZXJEYXRhUHJvZmlsZUV2ZW50LCBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IGRlbHRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGNvbXBhcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuZXhwb3J0IGNsYXNzIFdlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBpbXBsZW1lbnRzIElQcm9maWxlQXdhcmVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Z2V0IG9uUHJvZmlsZUF3YXJlSW5zdGFsbEV4dGVuc2lvbigpIHsgcmV0dXJuIHN1cGVyLm9uSW5zdGFsbEV4dGVuc2lvbjsgfVxuXHRvdmVycmlkZSBnZXQgb25JbnN0YWxsRXh0ZW5zaW9uKCkgeyByZXR1cm4gRXZlbnQuZmlsdGVyKHRoaXMub25Qcm9maWxlQXdhcmVJbnN0YWxsRXh0ZW5zaW9uLCBlID0+IHRoaXMuZmlsdGVyRXZlbnQoZSksIHRoaXMuZGlzcG9zYWJsZXMpOyB9XG5cblx0Z2V0IG9uUHJvZmlsZUF3YXJlRGlkSW5zdGFsbEV4dGVuc2lvbnMoKSB7IHJldHVybiBzdXBlci5vbkRpZEluc3RhbGxFeHRlbnNpb25zOyB9XG5cdG92ZXJyaWRlIGdldCBvbkRpZEluc3RhbGxFeHRlbnNpb25zKCkge1xuXHRcdHJldHVybiBFdmVudC5maWx0ZXIoXG5cdFx0XHRFdmVudC5tYXAodGhpcy5vblByb2ZpbGVBd2FyZURpZEluc3RhbGxFeHRlbnNpb25zLCByZXN1bHRzID0+IHJlc3VsdHMuZmlsdGVyKGUgPT4gdGhpcy5maWx0ZXJFdmVudChlKSksIHRoaXMuZGlzcG9zYWJsZXMpLFxuXHRcdFx0cmVzdWx0cyA9PiByZXN1bHRzLmxlbmd0aCA+IDAsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0Z2V0IG9uUHJvZmlsZUF3YXJlVW5pbnN0YWxsRXh0ZW5zaW9uKCkgeyByZXR1cm4gc3VwZXIub25Vbmluc3RhbGxFeHRlbnNpb247IH1cblx0b3ZlcnJpZGUgZ2V0IG9uVW5pbnN0YWxsRXh0ZW5zaW9uKCkgeyByZXR1cm4gRXZlbnQuZmlsdGVyKHRoaXMub25Qcm9maWxlQXdhcmVVbmluc3RhbGxFeHRlbnNpb24sIGUgPT4gdGhpcy5maWx0ZXJFdmVudChlKSwgdGhpcy5kaXNwb3NhYmxlcyk7IH1cblxuXHRnZXQgb25Qcm9maWxlQXdhcmVEaWRVbmluc3RhbGxFeHRlbnNpb24oKSB7IHJldHVybiBzdXBlci5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbjsgfVxuXHRvdmVycmlkZSBnZXQgb25EaWRVbmluc3RhbGxFeHRlbnNpb24oKSB7IHJldHVybiBFdmVudC5maWx0ZXIodGhpcy5vblByb2ZpbGVBd2FyZURpZFVuaW5zdGFsbEV4dGVuc2lvbiwgZSA9PiB0aGlzLmZpbHRlckV2ZW50KGUpLCB0aGlzLmRpc3Bvc2FibGVzKTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUHJvZmlsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgYWRkZWQ6IElMb2NhbEV4dGVuc2lvbltdOyByZWFkb25seSByZW1vdmVkOiBJTG9jYWxFeHRlbnNpb25bXSB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm9maWxlID0gdGhpcy5fb25EaWRDaGFuZ2VQcm9maWxlLmV2ZW50O1xuXG5cdGdldCBvblByb2ZpbGVBd2FyZURpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhKCkgeyByZXR1cm4gc3VwZXIub25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YTsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlOiBJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIGFsbG93ZWRFeHRlbnNpb25zU2VydmljZSwgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VDdXJyZW50UHJvZmlsZShlID0+IHtcblx0XHRcdGlmICghdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZS5wcmV2aW91cy5leHRlbnNpb25zUmVzb3VyY2UsIGUucHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpKSB7XG5cdFx0XHRcdGUuam9pbih0aGlzLndoZW5Qcm9maWxlQ2hhbmdlZChlKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJFdmVudCh7IHByb2ZpbGVMb2NhdGlvbiwgYXBwbGljYXRpb25TY29wZWQgfTogeyBwcm9maWxlTG9jYXRpb24/OiBVUkk7IGFwcGxpY2F0aW9uU2NvcGVkPzogYm9vbGVhbiB9KTogYm9vbGVhbiB7XG5cdFx0cHJvZmlsZUxvY2F0aW9uID0gcHJvZmlsZUxvY2F0aW9uID8/IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2U7XG5cdFx0cmV0dXJuIGFwcGxpY2F0aW9uU2NvcGVkIHx8IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsIHByb2ZpbGVMb2NhdGlvbik7XG5cdH1cblxuXHRhc3luYyBnZXRUYXJnZXRQbGF0Zm9ybSgpOiBQcm9taXNlPFRhcmdldFBsYXRmb3JtPiB7XG5cdFx0cmV0dXJuIFRhcmdldFBsYXRmb3JtLldFQjtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBpc0V4dGVuc2lvblBsYXRmb3JtQ29tcGF0aWJsZShleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHRoaXMuaXNDb25maWd1cmVkVG9FeGVjdXRlT25XZWIoZXh0ZW5zaW9uKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5pc0V4dGVuc2lvblBsYXRmb3JtQ29tcGF0aWJsZShleHRlbnNpb24pO1xuXHR9XG5cblx0YXN5bmMgZ2V0SW5zdGFsbGVkKHR5cGU/OiBFeHRlbnNpb25UeXBlLCBwcm9maWxlTG9jYXRpb24/OiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IFtdO1xuXHRcdGlmICh0eXBlID09PSB1bmRlZmluZWQgfHwgdHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0pIHtcblx0XHRcdGNvbnN0IHN5c3RlbUV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuU3lzdGVtRXh0ZW5zaW9ucygpO1xuXHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKC4uLnN5c3RlbUV4dGVuc2lvbnMpO1xuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gdW5kZWZpbmVkIHx8IHR5cGUgPT09IEV4dGVuc2lvblR5cGUuVXNlcikge1xuXHRcdFx0Y29uc3QgdXNlckV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuVXNlckV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uID8/IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKC4uLnVzZXJFeHRlbnNpb25zKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4dGVuc2lvbnMubWFwKGUgPT4gdG9Mb2NhbEV4dGVuc2lvbihlKSk7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsKGxvY2F0aW9uOiBVUkksIG9wdGlvbnM6IEluc3RhbGxPcHRpb25zID0ge30pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UjaW5zdGFsbCcsIGxvY2F0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhbkV4dGVuc2lvbk1hbmlmZXN0KGxvY2F0aW9uKTtcblx0XHRpZiAoIW1hbmlmZXN0IHx8ICFtYW5pZmVzdC5uYW1lIHx8ICFtYW5pZmVzdC52ZXJzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBmaW5kIGEgdmFsaWQgZXh0ZW5zaW9uIGZyb20gdGhlIGxvY2F0aW9uICR7bG9jYXRpb24udG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5pbnN0YWxsRXh0ZW5zaW9ucyhbeyBtYW5pZmVzdCwgZXh0ZW5zaW9uOiBsb2NhdGlvbiwgb3B0aW9ucyB9XSk7XG5cdFx0aWYgKHJlc3VsdFswXT8ubG9jYWwpIHtcblx0XHRcdHJldHVybiByZXN1bHRbMF0/LmxvY2FsO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0WzBdPy5lcnJvcikge1xuXHRcdFx0dGhyb3cgcmVzdWx0WzBdLmVycm9yO1xuXHRcdH1cblx0XHR0aHJvdyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihuZXcgRXJyb3IoYFVua25vd24gZXJyb3Igd2hpbGUgaW5zdGFsbGluZyBleHRlbnNpb24gJHtnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKX1gKSk7XG5cdH1cblxuXHRpbnN0YWxsRnJvbUxvY2F0aW9uKGxvY2F0aW9uOiBVUkksIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YWxsKGxvY2F0aW9uLCB7IHByb2ZpbGVMb2NhdGlvbiB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBkZWxldGVFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBkbyBub3RoaW5nXG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgY29weUV4dGVuc2lvbihleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJLCBtZXRhZGF0YTogUGFydGlhbDxNZXRhZGF0YT4pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5FeGlzdGluZ0V4dGVuc2lvbihleHRlbnNpb24ubG9jYXRpb24sIGV4dGVuc2lvbi50eXBlLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhbkV4aXN0aW5nRXh0ZW5zaW9uKGV4dGVuc2lvbi5sb2NhdGlvbiwgZXh0ZW5zaW9uLnR5cGUsIGZyb21Qcm9maWxlTG9jYXRpb24pO1xuXHRcdG1ldGFkYXRhID0geyAuLi5zb3VyY2U/Lm1ldGFkYXRhLCAuLi5tZXRhZGF0YSB9O1xuXG5cdFx0bGV0IHNjYW5uZWQ7XG5cdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0c2Nhbm5lZCA9IGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbiwgeyAuLi50YXJnZXQubWV0YWRhdGEsIC4uLm1ldGFkYXRhIH0sIHRvUHJvZmlsZUxvY2F0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2Nhbm5lZCA9IGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLmFkZEV4dGVuc2lvbihleHRlbnNpb24ubG9jYXRpb24sIG1ldGFkYXRhLCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiB0b0xvY2FsRXh0ZW5zaW9uKHNjYW5uZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIG1vdmVFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSwgbWV0YWRhdGE6IFBhcnRpYWw8TWV0YWRhdGE+KTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuRXhpc3RpbmdFeHRlbnNpb24oZXh0ZW5zaW9uLmxvY2F0aW9uLCBleHRlbnNpb24udHlwZSwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5FeGlzdGluZ0V4dGVuc2lvbihleHRlbnNpb24ubG9jYXRpb24sIGV4dGVuc2lvbi50eXBlLCBmcm9tUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRtZXRhZGF0YSA9IHsgLi4uc291cmNlPy5tZXRhZGF0YSwgLi4ubWV0YWRhdGEgfTtcblxuXHRcdGxldCBzY2FubmVkO1xuXHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdHNjYW5uZWQgPSBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS51cGRhdGVNZXRhZGF0YShleHRlbnNpb24sIHsgLi4udGFyZ2V0Lm1ldGFkYXRhLCAuLi5tZXRhZGF0YSB9LCB0b1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNjYW5uZWQgPSBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5hZGRFeHRlbnNpb24oZXh0ZW5zaW9uLmxvY2F0aW9uLCBtZXRhZGF0YSwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0aWYgKHNvdXJjZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5yZW1vdmVFeHRlbnNpb24oc291cmNlLCBmcm9tUHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRvTG9jYWxFeHRlbnNpb24oc2Nhbm5lZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgcmVtb3ZlRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuRXhpc3RpbmdFeHRlbnNpb24oZXh0ZW5zaW9uLmxvY2F0aW9uLCBleHRlbnNpb24udHlwZSwgZnJvbVByb2ZpbGVMb2NhdGlvbik7XG5cdFx0aWYgKHNvdXJjZSkge1xuXHRcdFx0YXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UucmVtb3ZlRXh0ZW5zaW9uKHNvdXJjZSwgZnJvbVByb2ZpbGVMb2NhdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgaW5zdGFsbEV4dGVuc2lvbnNGcm9tUHJvZmlsZShleHRlbnNpb25zOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJTG9jYWxFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNUb0luc3RhbGwgPSAoYXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhblVzZXJFeHRlbnNpb25zKGZyb21Qcm9maWxlTG9jYXRpb24pKVxuXHRcdFx0LmZpbHRlcihlID0+IGV4dGVuc2lvbnMuc29tZShpZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpZCwgZS5pZGVudGlmaWVyKSkpO1xuXHRcdGlmIChleHRlbnNpb25zVG9JbnN0YWxsLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKGV4dGVuc2lvbnNUb0luc3RhbGwubWFwKGFzeW5jIGUgPT4ge1xuXHRcdFx0XHRsZXQgbG9jYWwgPSBhd2FpdCB0aGlzLmluc3RhbGxGcm9tTG9jYXRpb24oZS5sb2NhdGlvbiwgdG9Qcm9maWxlTG9jYXRpb24pO1xuXHRcdFx0XHRpZiAoZS5tZXRhZGF0YSkge1xuXHRcdFx0XHRcdGxvY2FsID0gYXdhaXQgdGhpcy51cGRhdGVNZXRhZGF0YShsb2NhbCwgZS5tZXRhZGF0YSwgZnJvbVByb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0LnB1c2gobG9jYWwpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlTWV0YWRhdGEobG9jYWw6IElMb2NhbEV4dGVuc2lvbiwgbWV0YWRhdGE6IFBhcnRpYWw8TWV0YWRhdGE+LCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0Ly8gdW5zZXQgaWYgZmFsc2Vcblx0XHRpZiAobWV0YWRhdGEuaXNNYWNoaW5lU2NvcGVkID09PSBmYWxzZSkge1xuXHRcdFx0bWV0YWRhdGEuaXNNYWNoaW5lU2NvcGVkID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAobWV0YWRhdGEuaXNCdWlsdGluID09PSBmYWxzZSkge1xuXHRcdFx0bWV0YWRhdGEuaXNCdWlsdGluID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAobWV0YWRhdGEucGlubmVkID09PSBmYWxzZSkge1xuXHRcdFx0bWV0YWRhdGEucGlubmVkID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB1cGRhdGVkRXh0ZW5zaW9uID0gYXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UudXBkYXRlTWV0YWRhdGEobG9jYWwsIG1ldGFkYXRhLCBwcm9maWxlTG9jYXRpb24pO1xuXHRcdGNvbnN0IHVwZGF0ZWRMb2NhbEV4dGVuc2lvbiA9IHRvTG9jYWxFeHRlbnNpb24odXBkYXRlZEV4dGVuc2lvbik7XG5cdFx0dGhpcy5fb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YS5maXJlKHsgbG9jYWw6IHVwZGF0ZWRMb2NhbEV4dGVuc2lvbiwgcHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdHJldHVybiB1cGRhdGVkTG9jYWxFeHRlbnNpb247XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBjb3B5RXh0ZW5zaW9ucyhmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5jb3B5RXh0ZW5zaW9ucyhmcm9tUHJvZmlsZUxvY2F0aW9uLCB0b1Byb2ZpbGVMb2NhdGlvbiwgZSA9PiAhZS5tZXRhZGF0YT8uaXNBcHBsaWNhdGlvblNjb3BlZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZ2V0Q29tcGF0aWJsZVZlcnNpb24oZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgc2FtZVZlcnNpb246IGJvb2xlYW4sIGluY2x1ZGVQcmVSZWxlYXNlOiBib29sZWFuLCBwcm9kdWN0VmVyc2lvbjogSVByb2R1Y3RWZXJzaW9uKTogUHJvbWlzZTxJR2FsbGVyeUV4dGVuc2lvbiB8IG51bGw+IHtcblx0XHRjb25zdCBjb21wYXRpYmxlRXh0ZW5zaW9uID0gYXdhaXQgc3VwZXIuZ2V0Q29tcGF0aWJsZVZlcnNpb24oZXh0ZW5zaW9uLCBzYW1lVmVyc2lvbiwgaW5jbHVkZVByZVJlbGVhc2UsIHByb2R1Y3RWZXJzaW9uKTtcblx0XHRpZiAoY29tcGF0aWJsZUV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIGNvbXBhdGlibGVFeHRlbnNpb247XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlzQ29uZmlndXJlZFRvRXhlY3V0ZU9uV2ViKGV4dGVuc2lvbikpIHtcblx0XHRcdHJldHVybiBleHRlbnNpb247XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0NvbmZpZ3VyZWRUb0V4ZWN1dGVPbldlYihnYWxsZXJ5OiBJR2FsbGVyeUV4dGVuc2lvbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kID0gdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmdldFVzZXJDb25maWd1cmVkRXh0ZW5zaW9uS2luZChnYWxsZXJ5LmlkZW50aWZpZXIpO1xuXHRcdHJldHVybiAhIWNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kICYmIGNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kLmluY2x1ZGVzKCd3ZWInKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRDdXJyZW50RXh0ZW5zaW9uc01hbmlmZXN0TG9jYXRpb24oKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVJbnN0YWxsRXh0ZW5zaW9uVGFzayhtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LCBleHRlbnNpb246IFVSSSB8IElHYWxsZXJ5RXh0ZW5zaW9uLCBvcHRpb25zOiBJbnN0YWxsRXh0ZW5zaW9uVGFza09wdGlvbnMpOiBJSW5zdGFsbEV4dGVuc2lvblRhc2sge1xuXHRcdHJldHVybiBuZXcgSW5zdGFsbEV4dGVuc2lvblRhc2sobWFuaWZlc3QsIGV4dGVuc2lvbiwgb3B0aW9ucywgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZVVuaW5zdGFsbEV4dGVuc2lvblRhc2soZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIG9wdGlvbnM6IFVuaW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zKTogSVVuaW5zdGFsbEV4dGVuc2lvblRhc2sge1xuXHRcdHJldHVybiBuZXcgVW5pbnN0YWxsRXh0ZW5zaW9uVGFzayhleHRlbnNpb24sIG9wdGlvbnMsIHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlKTtcblx0fVxuXG5cdHppcChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IFByb21pc2U8VVJJPiB7IHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQnKTsgfVxuXHRnZXRNYW5pZmVzdCh2c2l4OiBVUkkpOiBQcm9taXNlPElFeHRlbnNpb25NYW5pZmVzdD4geyB0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkJyk7IH1cblx0ZG93bmxvYWQoKTogUHJvbWlzZTxVUkk+IHsgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCcpOyB9XG5cblx0YXN5bmMgY2xlYW5VcCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdHByaXZhdGUgYXN5bmMgd2hlblByb2ZpbGVDaGFuZ2VkKGU6IERpZENoYW5nZVVzZXJEYXRhUHJvZmlsZUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJldmlvdXNQcm9maWxlTG9jYXRpb24gPSBlLnByZXZpb3VzLmV4dGVuc2lvbnNSZXNvdXJjZTtcblx0XHRjb25zdCBjdXJyZW50UHJvZmlsZUxvY2F0aW9uID0gZS5wcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZTtcblx0XHRpZiAoIXByZXZpb3VzUHJvZmlsZUxvY2F0aW9uIHx8ICFjdXJyZW50UHJvZmlsZUxvY2F0aW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoaXMgc2hvdWxkIG5vdCBoYXBwZW4nKTtcblx0XHR9XG5cdFx0Y29uc3Qgb2xkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5Vc2VyRXh0ZW5zaW9ucyhwcmV2aW91c1Byb2ZpbGVMb2NhdGlvbik7XG5cdFx0Y29uc3QgbmV3RXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5Vc2VyRXh0ZW5zaW9ucyhjdXJyZW50UHJvZmlsZUxvY2F0aW9uKTtcblx0XHRjb25zdCB7IGFkZGVkLCByZW1vdmVkIH0gPSBkZWx0YShvbGRFeHRlbnNpb25zLCBuZXdFeHRlbnNpb25zLCAoYSwgYikgPT4gY29tcGFyZShgJHtFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGEuaWRlbnRpZmllci5pZCl9QCR7YS5tYW5pZmVzdC52ZXJzaW9ufWAsIGAke0V4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoYi5pZGVudGlmaWVyLmlkKX1AJHtiLm1hbmlmZXN0LnZlcnNpb259YCkpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvZmlsZS5maXJlKHsgYWRkZWQ6IGFkZGVkLm1hcChlID0+IHRvTG9jYWxFeHRlbnNpb24oZSkpLCByZW1vdmVkOiByZW1vdmVkLm1hcChlID0+IHRvTG9jYWxFeHRlbnNpb24oZSkpIH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvTG9jYWxFeHRlbnNpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogSUxvY2FsRXh0ZW5zaW9uIHtcblx0Y29uc3QgbWV0YWRhdGEgPSBnZXRNZXRhZGF0YSh1bmRlZmluZWQsIGV4dGVuc2lvbik7XG5cdHJldHVybiB7XG5cdFx0Li4uZXh0ZW5zaW9uLFxuXHRcdGlkZW50aWZpZXI6IHsgaWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCB1dWlkOiBtZXRhZGF0YS5pZCA/PyBleHRlbnNpb24uaWRlbnRpZmllci51dWlkIH0sXG5cdFx0aXNNYWNoaW5lU2NvcGVkOiAhIW1ldGFkYXRhLmlzTWFjaGluZVNjb3BlZCxcblx0XHRpc0FwcGxpY2F0aW9uU2NvcGVkOiAhIW1ldGFkYXRhLmlzQXBwbGljYXRpb25TY29wZWQsXG5cdFx0cHVibGlzaGVySWQ6IG1ldGFkYXRhLnB1Ymxpc2hlcklkIHx8IG51bGwsXG5cdFx0cHVibGlzaGVyRGlzcGxheU5hbWU6IG1ldGFkYXRhLnB1Ymxpc2hlckRpc3BsYXlOYW1lLFxuXHRcdGluc3RhbGxlZFRpbWVzdGFtcDogbWV0YWRhdGEuaW5zdGFsbGVkVGltZXN0YW1wLFxuXHRcdGlzUHJlUmVsZWFzZVZlcnNpb246ICEhbWV0YWRhdGEuaXNQcmVSZWxlYXNlVmVyc2lvbixcblx0XHRoYXNQcmVSZWxlYXNlVmVyc2lvbjogISFtZXRhZGF0YS5oYXNQcmVSZWxlYXNlVmVyc2lvbixcblx0XHRwcmVSZWxlYXNlOiBleHRlbnNpb24ucHJlUmVsZWFzZSxcblx0XHR0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0uV0VCLFxuXHRcdHVwZGF0ZWQ6ICEhbWV0YWRhdGEudXBkYXRlZCxcblx0XHRwaW5uZWQ6ICEhbWV0YWRhdGE/LnBpbm5lZCxcblx0XHRmb3JjZUF1dG9VcGRhdGU6IGZhbHNlLFxuXHRcdHByaXZhdGU6ICEhbWV0YWRhdGEucHJpdmF0ZSxcblx0XHRpc1dvcmtzcGFjZVNjb3BlZDogZmFsc2UsXG5cdFx0c291cmNlOiBtZXRhZGF0YT8uc291cmNlID8/IChleHRlbnNpb24uaWRlbnRpZmllci51dWlkID8gJ2dhbGxlcnknIDogJ3Jlc291cmNlJyksXG5cdFx0c2l6ZTogbWV0YWRhdGEuc2l6ZSA/PyAwLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXRNZXRhZGF0YShvcHRpb25zPzogSW5zdGFsbE9wdGlvbnMsIGV4aXN0aW5nRXh0ZW5zaW9uPzogSUV4dGVuc2lvbik6IE1ldGFkYXRhIHtcblx0Y29uc3QgbWV0YWRhdGE6IE1ldGFkYXRhID0geyAuLi4oKDxJU2Nhbm5lZEV4dGVuc2lvbj5leGlzdGluZ0V4dGVuc2lvbik/Lm1ldGFkYXRhIHx8IHt9KSB9O1xuXHRtZXRhZGF0YS5pc01hY2hpbmVTY29wZWQgPSBvcHRpb25zPy5pc01hY2hpbmVTY29wZWQgfHwgbWV0YWRhdGEuaXNNYWNoaW5lU2NvcGVkO1xuXHRyZXR1cm4gbWV0YWRhdGE7XG59XG5cbmNsYXNzIEluc3RhbGxFeHRlbnNpb25UYXNrIGV4dGVuZHMgQWJzdHJhY3RFeHRlbnNpb25UYXNrPElMb2NhbEV4dGVuc2lvbj4gaW1wbGVtZW50cyBJSW5zdGFsbEV4dGVuc2lvblRhc2sge1xuXG5cdHJlYWRvbmx5IGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyO1xuXHRyZWFkb25seSBzb3VyY2U6IFVSSSB8IElHYWxsZXJ5RXh0ZW5zaW9uO1xuXG5cdHByaXZhdGUgX3Byb2ZpbGVMb2NhdGlvbjogVVJJO1xuXHRnZXQgcHJvZmlsZUxvY2F0aW9uKCkgeyByZXR1cm4gdGhpcy5fcHJvZmlsZUxvY2F0aW9uOyB9XG5cblx0cHJpdmF0ZSBfb3BlcmF0aW9uID0gSW5zdGFsbE9wZXJhdGlvbi5JbnN0YWxsO1xuXHRnZXQgb3BlcmF0aW9uKCkgeyByZXR1cm4gaXNVbmRlZmluZWQodGhpcy5vcHRpb25zLm9wZXJhdGlvbikgPyB0aGlzLl9vcGVyYXRpb24gOiB0aGlzLm9wdGlvbnMub3BlcmF0aW9uOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbjogVVJJIHwgSUdhbGxlcnlFeHRlbnNpb24sXG5cdFx0cmVhZG9ubHkgb3B0aW9uczogSW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlOiBJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm9maWxlTG9jYXRpb24gPSBvcHRpb25zLnByb2ZpbGVMb2NhdGlvbjtcblx0XHR0aGlzLmlkZW50aWZpZXIgPSBVUkkuaXNVcmkoZXh0ZW5zaW9uKSA/IHsgaWQ6IGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpIH0gOiBleHRlbnNpb24uaWRlbnRpZmllcjtcblx0XHR0aGlzLnNvdXJjZSA9IGV4dGVuc2lvbjtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBkb1J1bih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IHVzZXJFeHRlbnNpb25zID0gYXdhaXQgdGhpcy53ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhblVzZXJFeHRlbnNpb25zKHRoaXMub3B0aW9ucy5wcm9maWxlTG9jYXRpb24pO1xuXHRcdGNvbnN0IGV4aXN0aW5nRXh0ZW5zaW9uID0gdXNlckV4dGVuc2lvbnMuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgdGhpcy5pZGVudGlmaWVyKSk7XG5cdFx0aWYgKGV4aXN0aW5nRXh0ZW5zaW9uKSB7XG5cdFx0XHR0aGlzLl9vcGVyYXRpb24gPSBJbnN0YWxsT3BlcmF0aW9uLlVwZGF0ZTtcblx0XHR9XG5cblx0XHRjb25zdCBtZXRhZGF0YSA9IGdldE1ldGFkYXRhKHRoaXMub3B0aW9ucywgZXhpc3RpbmdFeHRlbnNpb24pO1xuXHRcdGlmICghVVJJLmlzVXJpKHRoaXMuZXh0ZW5zaW9uKSkge1xuXHRcdFx0bWV0YWRhdGEuaWQgPSB0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQ7XG5cdFx0XHRtZXRhZGF0YS5wdWJsaXNoZXJEaXNwbGF5TmFtZSA9IHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lO1xuXHRcdFx0bWV0YWRhdGEucHVibGlzaGVySWQgPSB0aGlzLmV4dGVuc2lvbi5wdWJsaXNoZXJJZDtcblx0XHRcdG1ldGFkYXRhLmluc3RhbGxlZFRpbWVzdGFtcCA9IERhdGUubm93KCk7XG5cdFx0XHRtZXRhZGF0YS5pc1ByZVJlbGVhc2VWZXJzaW9uID0gdGhpcy5leHRlbnNpb24ucHJvcGVydGllcy5pc1ByZVJlbGVhc2VWZXJzaW9uO1xuXHRcdFx0bWV0YWRhdGEuaGFzUHJlUmVsZWFzZVZlcnNpb24gPSBtZXRhZGF0YS5oYXNQcmVSZWxlYXNlVmVyc2lvbiB8fCB0aGlzLmV4dGVuc2lvbi5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb247XG5cdFx0XHRtZXRhZGF0YS5pc0J1aWx0aW4gPSB0aGlzLm9wdGlvbnMuaXNCdWlsdGluIHx8IGV4aXN0aW5nRXh0ZW5zaW9uPy5pc0J1aWx0aW47XG5cdFx0XHRtZXRhZGF0YS5pc1N5c3RlbSA9IGV4aXN0aW5nRXh0ZW5zaW9uPy50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbSA/IHRydWUgOiB1bmRlZmluZWQ7XG5cdFx0XHRtZXRhZGF0YS51cGRhdGVkID0gISFleGlzdGluZ0V4dGVuc2lvbjtcblx0XHRcdG1ldGFkYXRhLmlzQXBwbGljYXRpb25TY29wZWQgPSB0aGlzLm9wdGlvbnMuaXNBcHBsaWNhdGlvblNjb3BlZCB8fCBtZXRhZGF0YS5pc0FwcGxpY2F0aW9uU2NvcGVkO1xuXHRcdFx0bWV0YWRhdGEucHJpdmF0ZSA9IHRoaXMuZXh0ZW5zaW9uLnByaXZhdGU7XG5cdFx0XHRtZXRhZGF0YS5wcmVSZWxlYXNlID0gaXNCb29sZWFuKHRoaXMub3B0aW9ucy5wcmVSZWxlYXNlKVxuXHRcdFx0XHQ/IHRoaXMub3B0aW9ucy5wcmVSZWxlYXNlXG5cdFx0XHRcdDogdGhpcy5vcHRpb25zLmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbiB8fCB0aGlzLmV4dGVuc2lvbi5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24gfHwgbWV0YWRhdGEucHJlUmVsZWFzZTtcblx0XHRcdG1ldGFkYXRhLnNvdXJjZSA9IFVSSS5pc1VyaSh0aGlzLmV4dGVuc2lvbikgPyAncmVzb3VyY2UnIDogJ2dhbGxlcnknO1xuXHRcdH1cblx0XHRtZXRhZGF0YS5waW5uZWQgPSB0aGlzLm9wdGlvbnMuaW5zdGFsbEdpdmVuVmVyc2lvbiA/IHRydWUgOiAodGhpcy5vcHRpb25zLnBpbm5lZCA/PyBtZXRhZGF0YS5waW5uZWQpO1xuXG5cdFx0dGhpcy5fcHJvZmlsZUxvY2F0aW9uID0gbWV0YWRhdGEuaXNBcHBsaWNhdGlvblNjb3BlZCA/IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlIDogdGhpcy5vcHRpb25zLnByb2ZpbGVMb2NhdGlvbjtcblx0XHRjb25zdCBzY2FubmVkRXh0ZW5zaW9uID0gVVJJLmlzVXJpKHRoaXMuZXh0ZW5zaW9uKSA/IGF3YWl0IHRoaXMud2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLmFkZEV4dGVuc2lvbih0aGlzLmV4dGVuc2lvbiwgbWV0YWRhdGEsIHRoaXMucHJvZmlsZUxvY2F0aW9uKVxuXHRcdFx0OiBhd2FpdCB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5hZGRFeHRlbnNpb25Gcm9tR2FsbGVyeSh0aGlzLmV4dGVuc2lvbiwgbWV0YWRhdGEsIHRoaXMucHJvZmlsZUxvY2F0aW9uKTtcblx0XHRyZXR1cm4gdG9Mb2NhbEV4dGVuc2lvbihzY2FubmVkRXh0ZW5zaW9uKTtcblx0fVxufVxuXG5jbGFzcyBVbmluc3RhbGxFeHRlbnNpb25UYXNrIGV4dGVuZHMgQWJzdHJhY3RFeHRlbnNpb25UYXNrPHZvaWQ+IGltcGxlbWVudHMgSVVuaW5zdGFsbEV4dGVuc2lvblRhc2sge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLFxuXHRcdHJlYWRvbmx5IG9wdGlvbnM6IFVuaW5zdGFsbEV4dGVuc2lvblRhc2tPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlOiBJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGRvUnVuKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLndlYkV4dGVuc2lvbnNTY2FubmVyU2VydmljZS5yZW1vdmVFeHRlbnNpb24odGhpcy5leHRlbnNpb24sIHRoaXMub3B0aW9ucy5wcm9maWxlTG9jYXRpb24pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMscUJBQXFCLGVBQXFFLHNCQUFzQjtBQUN6SCxTQUE2QyxrQkFBa0IsMEJBQXFFLGlDQUFpQztBQUNySyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxtQkFBbUIsNkJBQTZCO0FBQ3pELFNBQXFFLG9DQUFvQztBQUN6RyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLG9DQUFvQyx1QkFBb0csa0NBQWlFO0FBQ2xOLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVyxtQkFBbUI7QUFDdkMsU0FBd0MsK0JBQStCO0FBQ3ZFLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFFekIsSUFBTSxnQ0FBTixjQUE0QyxtQ0FBc0Y7QUFBQSxFQTJCeEksWUFDMkIseUJBQ1Asa0JBQ04sWUFDa0MsNkJBQ08sb0NBQ1osd0JBQ3pCLGdCQUNVLDBCQUNELHlCQUNMLG9CQUNwQjtBQUNELFVBQU0seUJBQXlCLGtCQUFrQixvQkFBb0IsWUFBWSxnQkFBZ0IsMEJBQTBCLHVCQUF1QjtBQVJuRztBQUNPO0FBQ1o7QUE3QjNDLFNBQWlCLGNBQWMsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFrQm5FLFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxRQUFvRixDQUFDO0FBQy9JLFNBQVMscUJBQXFCLEtBQUssb0JBQW9CO0FBaUJ0RCxTQUFLLFVBQVUsdUJBQXVCLDBCQUEwQixPQUFLO0FBQ3BFLFVBQUksQ0FBQyxLQUFLLG1CQUFtQixPQUFPLFFBQVEsRUFBRSxTQUFTLG9CQUFvQixFQUFFLFFBQVEsa0JBQWtCLEdBQUc7QUFDekcsVUFBRSxLQUFLLEtBQUssbUJBQW1CLENBQUMsQ0FBQztBQUFBLE1BQ2xDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUF2Q0EsSUFBSSxpQ0FBaUM7QUFBRSxXQUFPLE1BQU07QUFBQSxFQUFvQjtBQUFBLEVBQ3hFLElBQWEscUJBQXFCO0FBQUUsV0FBTyxNQUFNLE9BQU8sS0FBSyxnQ0FBZ0MsT0FBSyxLQUFLLFlBQVksQ0FBQyxHQUFHLEtBQUssV0FBVztBQUFBLEVBQUc7QUFBQSxFQUUxSSxJQUFJLHFDQUFxQztBQUFFLFdBQU8sTUFBTTtBQUFBLEVBQXdCO0FBQUEsRUFDaEYsSUFBYSx5QkFBeUI7QUFDckMsV0FBTyxNQUFNO0FBQUEsTUFDWixNQUFNLElBQUksS0FBSyxvQ0FBb0MsYUFBVyxRQUFRLE9BQU8sT0FBSyxLQUFLLFlBQVksQ0FBQyxDQUFDLEdBQUcsS0FBSyxXQUFXO0FBQUEsTUFDeEgsYUFBVyxRQUFRLFNBQVM7QUFBQSxNQUFHLEtBQUs7QUFBQSxJQUFXO0FBQUEsRUFDakQ7QUFBQSxFQUVBLElBQUksbUNBQW1DO0FBQUUsV0FBTyxNQUFNO0FBQUEsRUFBc0I7QUFBQSxFQUM1RSxJQUFhLHVCQUF1QjtBQUFFLFdBQU8sTUFBTSxPQUFPLEtBQUssa0NBQWtDLE9BQUssS0FBSyxZQUFZLENBQUMsR0FBRyxLQUFLLFdBQVc7QUFBQSxFQUFHO0FBQUEsRUFFOUksSUFBSSxzQ0FBc0M7QUFBRSxXQUFPLE1BQU07QUFBQSxFQUF5QjtBQUFBLEVBQ2xGLElBQWEsMEJBQTBCO0FBQUUsV0FBTyxNQUFNLE9BQU8sS0FBSyxxQ0FBcUMsT0FBSyxLQUFLLFlBQVksQ0FBQyxHQUFHLEtBQUssV0FBVztBQUFBLEVBQUc7QUFBQSxFQUtwSixJQUFJLDJDQUEyQztBQUFFLFdBQU8sTUFBTTtBQUFBLEVBQThCO0FBQUEsRUFzQnBGLFlBQVksRUFBRSxpQkFBaUIsa0JBQWtCLEdBQW9FO0FBQzVILHNCQUFrQixtQkFBbUIsS0FBSyx1QkFBdUIsZUFBZTtBQUNoRixXQUFPLHFCQUFxQixLQUFLLG1CQUFtQixPQUFPLFFBQVEsS0FBSyx1QkFBdUIsZUFBZSxvQkFBb0IsZUFBZTtBQUFBLEVBQ2xKO0FBQUEsRUFFQSxNQUFNLG9CQUE2QztBQUNsRCxXQUFPLGVBQWU7QUFBQSxFQUN2QjtBQUFBLEVBRUEsTUFBeUIsOEJBQThCLFdBQWdEO0FBQ3RHLFFBQUksS0FBSywyQkFBMkIsU0FBUyxHQUFHO0FBQy9DLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxNQUFNLDhCQUE4QixTQUFTO0FBQUEsRUFDckQ7QUFBQSxFQUVBLE1BQU0sYUFBYSxNQUFzQixpQkFBbUQ7QUFDM0YsVUFBTSxhQUFhLENBQUM7QUFDcEIsUUFBSSxTQUFTLFVBQWEsU0FBUyxjQUFjLFFBQVE7QUFDeEQsWUFBTSxtQkFBbUIsTUFBTSxLQUFLLDRCQUE0QixxQkFBcUI7QUFDckYsaUJBQVcsS0FBSyxHQUFHLGdCQUFnQjtBQUFBLElBQ3BDO0FBQ0EsUUFBSSxTQUFTLFVBQWEsU0FBUyxjQUFjLE1BQU07QUFDdEQsWUFBTSxpQkFBaUIsTUFBTSxLQUFLLDRCQUE0QixtQkFBbUIsbUJBQW1CLEtBQUssdUJBQXVCLGVBQWUsa0JBQWtCO0FBQ2pLLGlCQUFXLEtBQUssR0FBRyxjQUFjO0FBQUEsSUFDbEM7QUFDQSxXQUFPLFdBQVcsSUFBSSxPQUFLLGlCQUFpQixDQUFDLENBQUM7QUFBQSxFQUMvQztBQUFBLEVBRUEsTUFBTSxRQUFRLFVBQWUsVUFBMEIsQ0FBQyxHQUE2QjtBQUNwRixTQUFLLFdBQVcsTUFBTSxzQ0FBc0MsU0FBUyxTQUFTLENBQUM7QUFDL0UsVUFBTSxXQUFXLE1BQU0sS0FBSyw0QkFBNEIsc0JBQXNCLFFBQVE7QUFDdEYsUUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLFFBQVEsQ0FBQyxTQUFTLFNBQVM7QUFDckQsWUFBTSxJQUFJLE1BQU0sbURBQW1ELFNBQVMsU0FBUyxDQUFDLEVBQUU7QUFBQSxJQUN6RjtBQUNBLFVBQU0sU0FBUyxNQUFNLEtBQUssa0JBQWtCLENBQUMsRUFBRSxVQUFVLFdBQVcsVUFBVSxRQUFRLENBQUMsQ0FBQztBQUN4RixRQUFJLE9BQU8sQ0FBQyxHQUFHLE9BQU87QUFDckIsYUFBTyxPQUFPLENBQUMsR0FBRztBQUFBLElBQ25CO0FBQ0EsUUFBSSxPQUFPLENBQUMsR0FBRyxPQUFPO0FBQ3JCLFlBQU0sT0FBTyxDQUFDLEVBQUU7QUFBQSxJQUNqQjtBQUNBLFVBQU0sMkJBQTJCLElBQUksTUFBTSw0Q0FBNEMsc0JBQXNCLFNBQVMsV0FBVyxTQUFTLElBQUksQ0FBQyxFQUFFLENBQUM7QUFBQSxFQUNuSjtBQUFBLEVBRUEsb0JBQW9CLFVBQWUsaUJBQWdEO0FBQ2xGLFdBQU8sS0FBSyxRQUFRLFVBQVUsRUFBRSxnQkFBZ0IsQ0FBQztBQUFBLEVBQ2xEO0FBQUEsRUFFQSxNQUFnQixnQkFBZ0IsV0FBMkM7QUFBQSxFQUUzRTtBQUFBLEVBRUEsTUFBZ0IsY0FBYyxXQUE0QixxQkFBMEIsbUJBQXdCLFVBQXVEO0FBQ2xLLFVBQU0sU0FBUyxNQUFNLEtBQUssNEJBQTRCLHNCQUFzQixVQUFVLFVBQVUsVUFBVSxNQUFNLGlCQUFpQjtBQUNqSSxVQUFNLFNBQVMsTUFBTSxLQUFLLDRCQUE0QixzQkFBc0IsVUFBVSxVQUFVLFVBQVUsTUFBTSxtQkFBbUI7QUFDbkksZUFBVyxFQUFFLEdBQUcsUUFBUSxVQUFVLEdBQUcsU0FBUztBQUU5QyxRQUFJO0FBQ0osUUFBSSxRQUFRO0FBQ1gsZ0JBQVUsTUFBTSxLQUFLLDRCQUE0QixlQUFlLFdBQVcsRUFBRSxHQUFHLE9BQU8sVUFBVSxHQUFHLFNBQVMsR0FBRyxpQkFBaUI7QUFBQSxJQUNsSSxPQUFPO0FBQ04sZ0JBQVUsTUFBTSxLQUFLLDRCQUE0QixhQUFhLFVBQVUsVUFBVSxVQUFVLGlCQUFpQjtBQUFBLElBQzlHO0FBQ0EsV0FBTyxpQkFBaUIsT0FBTztBQUFBLEVBQ2hDO0FBQUEsRUFFQSxNQUFnQixjQUFjLFdBQTRCLHFCQUEwQixtQkFBd0IsVUFBdUQ7QUFDbEssVUFBTSxTQUFTLE1BQU0sS0FBSyw0QkFBNEIsc0JBQXNCLFVBQVUsVUFBVSxVQUFVLE1BQU0saUJBQWlCO0FBQ2pJLFVBQU0sU0FBUyxNQUFNLEtBQUssNEJBQTRCLHNCQUFzQixVQUFVLFVBQVUsVUFBVSxNQUFNLG1CQUFtQjtBQUNuSSxlQUFXLEVBQUUsR0FBRyxRQUFRLFVBQVUsR0FBRyxTQUFTO0FBRTlDLFFBQUk7QUFDSixRQUFJLFFBQVE7QUFDWCxnQkFBVSxNQUFNLEtBQUssNEJBQTRCLGVBQWUsV0FBVyxFQUFFLEdBQUcsT0FBTyxVQUFVLEdBQUcsU0FBUyxHQUFHLGlCQUFpQjtBQUFBLElBQ2xJLE9BQU87QUFDTixnQkFBVSxNQUFNLEtBQUssNEJBQTRCLGFBQWEsVUFBVSxVQUFVLFVBQVUsaUJBQWlCO0FBQzdHLFVBQUksUUFBUTtBQUNYLGNBQU0sS0FBSyw0QkFBNEIsZ0JBQWdCLFFBQVEsbUJBQW1CO0FBQUEsTUFDbkY7QUFBQSxJQUNEO0FBQ0EsV0FBTyxpQkFBaUIsT0FBTztBQUFBLEVBQ2hDO0FBQUEsRUFFQSxNQUFnQixnQkFBZ0IsV0FBNEIscUJBQXlDO0FBQ3BHLFVBQU0sU0FBUyxNQUFNLEtBQUssNEJBQTRCLHNCQUFzQixVQUFVLFVBQVUsVUFBVSxNQUFNLG1CQUFtQjtBQUNuSSxRQUFJLFFBQVE7QUFDWCxZQUFNLEtBQUssNEJBQTRCLGdCQUFnQixRQUFRLG1CQUFtQjtBQUFBLElBQ25GO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSw2QkFBNkIsWUFBb0MscUJBQTBCLG1CQUFvRDtBQUNwSixVQUFNLFNBQTRCLENBQUM7QUFDbkMsVUFBTSx1QkFBdUIsTUFBTSxLQUFLLDRCQUE0QixtQkFBbUIsbUJBQW1CLEdBQ3hHLE9BQU8sT0FBSyxXQUFXLEtBQUssUUFBTSxrQkFBa0IsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBQ3hFLFFBQUksb0JBQW9CLFFBQVE7QUFDL0IsWUFBTSxRQUFRLFdBQVcsb0JBQW9CLElBQUksT0FBTSxNQUFLO0FBQzNELFlBQUksUUFBUSxNQUFNLEtBQUssb0JBQW9CLEVBQUUsVUFBVSxpQkFBaUI7QUFDeEUsWUFBSSxFQUFFLFVBQVU7QUFDZixrQkFBUSxNQUFNLEtBQUssZUFBZSxPQUFPLEVBQUUsVUFBVSxtQkFBbUI7QUFBQSxRQUN6RTtBQUNBLGVBQU8sS0FBSyxLQUFLO0FBQUEsTUFDbEIsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLGVBQWUsT0FBd0IsVUFBNkIsaUJBQWdEO0FBRXpILFFBQUksU0FBUyxvQkFBb0IsT0FBTztBQUN2QyxlQUFTLGtCQUFrQjtBQUFBLElBQzVCO0FBQ0EsUUFBSSxTQUFTLGNBQWMsT0FBTztBQUNqQyxlQUFTLFlBQVk7QUFBQSxJQUN0QjtBQUNBLFFBQUksU0FBUyxXQUFXLE9BQU87QUFDOUIsZUFBUyxTQUFTO0FBQUEsSUFDbkI7QUFDQSxVQUFNLG1CQUFtQixNQUFNLEtBQUssNEJBQTRCLGVBQWUsT0FBTyxVQUFVLGVBQWU7QUFDL0csVUFBTSx3QkFBd0IsaUJBQWlCLGdCQUFnQjtBQUMvRCxTQUFLLDhCQUE4QixLQUFLLEVBQUUsT0FBTyx1QkFBdUIsZ0JBQWdCLENBQUM7QUFDekYsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWUsZUFBZSxxQkFBMEIsbUJBQXVDO0FBQzlGLFVBQU0sS0FBSyw0QkFBNEIsZUFBZSxxQkFBcUIsbUJBQW1CLE9BQUssQ0FBQyxFQUFFLFVBQVUsbUJBQW1CO0FBQUEsRUFDcEk7QUFBQSxFQUVBLE1BQXlCLHFCQUFxQixXQUE4QixhQUFzQixtQkFBNEIsZ0JBQW9FO0FBQ2pNLFVBQU0sc0JBQXNCLE1BQU0sTUFBTSxxQkFBcUIsV0FBVyxhQUFhLG1CQUFtQixjQUFjO0FBQ3RILFFBQUkscUJBQXFCO0FBQ3hCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLDJCQUEyQixTQUFTLEdBQUc7QUFDL0MsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsMkJBQTJCLFNBQXFDO0FBQ3ZFLFVBQU0sMEJBQTBCLEtBQUssbUNBQW1DLCtCQUErQixRQUFRLFVBQVU7QUFDekgsV0FBTyxDQUFDLENBQUMsMkJBQTJCLHdCQUF3QixTQUFTLEtBQUs7QUFBQSxFQUMzRTtBQUFBLEVBRVUsdUNBQTRDO0FBQ3JELFdBQU8sS0FBSyx1QkFBdUIsZUFBZTtBQUFBLEVBQ25EO0FBQUEsRUFFVSwyQkFBMkIsVUFBOEIsV0FBb0MsU0FBNkQ7QUFDbkssV0FBTyxJQUFJLHFCQUFxQixVQUFVLFdBQVcsU0FBUyxLQUFLLDZCQUE2QixLQUFLLHVCQUF1QjtBQUFBLEVBQzdIO0FBQUEsRUFFVSw2QkFBNkIsV0FBNEIsU0FBaUU7QUFDbkksV0FBTyxJQUFJLHVCQUF1QixXQUFXLFNBQVMsS0FBSywyQkFBMkI7QUFBQSxFQUN2RjtBQUFBLEVBRUEsSUFBSSxXQUEwQztBQUFFLFVBQU0sSUFBSSxNQUFNLGFBQWE7QUFBQSxFQUFHO0FBQUEsRUFDaEYsWUFBWSxNQUF3QztBQUFFLFVBQU0sSUFBSSxNQUFNLGFBQWE7QUFBQSxFQUFHO0FBQUEsRUFDdEYsV0FBeUI7QUFBRSxVQUFNLElBQUksTUFBTSxhQUFhO0FBQUEsRUFBRztBQUFBLEVBRTNELE1BQU0sVUFBeUI7QUFBQSxFQUFFO0FBQUEsRUFFakMsTUFBYyxtQkFBbUIsR0FBaUQ7QUFDakYsVUFBTSwwQkFBMEIsRUFBRSxTQUFTO0FBQzNDLFVBQU0seUJBQXlCLEVBQUUsUUFBUTtBQUN6QyxRQUFJLENBQUMsMkJBQTJCLENBQUMsd0JBQXdCO0FBQ3hELFlBQU0sSUFBSSxNQUFNLHdCQUF3QjtBQUFBLElBQ3pDO0FBQ0EsVUFBTSxnQkFBZ0IsTUFBTSxLQUFLLDRCQUE0QixtQkFBbUIsdUJBQXVCO0FBQ3ZHLFVBQU0sZ0JBQWdCLE1BQU0sS0FBSyw0QkFBNEIsbUJBQW1CLHNCQUFzQjtBQUN0RyxVQUFNLEVBQUUsT0FBTyxRQUFRLElBQUksTUFBTSxlQUFlLGVBQWUsQ0FBQyxHQUFHLE1BQU0sUUFBUSxHQUFHLG9CQUFvQixNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUMsSUFBSSxFQUFFLFNBQVMsT0FBTyxJQUFJLEdBQUcsb0JBQW9CLE1BQU0sRUFBRSxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsU0FBUyxPQUFPLEVBQUUsQ0FBQztBQUM5TixTQUFLLG9CQUFvQixLQUFLLEVBQUUsT0FBTyxNQUFNLElBQUksQ0FBQUEsT0FBSyxpQkFBaUJBLEVBQUMsQ0FBQyxHQUFHLFNBQVMsUUFBUSxJQUFJLENBQUFBLE9BQUssaUJBQWlCQSxFQUFDLENBQUMsRUFBRSxDQUFDO0FBQUEsRUFDN0g7QUFDRDtBQTVOYSxnQ0FBTjtBQUFBLEVBNEJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FyQ1U7QUE4TmIsU0FBUyxpQkFBaUIsV0FBd0M7QUFDakUsUUFBTSxXQUFXLFlBQVksUUFBVyxTQUFTO0FBQ2pELFNBQU87QUFBQSxJQUNOLEdBQUc7QUFBQSxJQUNILFlBQVksRUFBRSxJQUFJLFVBQVUsV0FBVyxJQUFJLE1BQU0sU0FBUyxNQUFNLFVBQVUsV0FBVyxLQUFLO0FBQUEsSUFDMUYsaUJBQWlCLENBQUMsQ0FBQyxTQUFTO0FBQUEsSUFDNUIscUJBQXFCLENBQUMsQ0FBQyxTQUFTO0FBQUEsSUFDaEMsYUFBYSxTQUFTLGVBQWU7QUFBQSxJQUNyQyxzQkFBc0IsU0FBUztBQUFBLElBQy9CLG9CQUFvQixTQUFTO0FBQUEsSUFDN0IscUJBQXFCLENBQUMsQ0FBQyxTQUFTO0FBQUEsSUFDaEMsc0JBQXNCLENBQUMsQ0FBQyxTQUFTO0FBQUEsSUFDakMsWUFBWSxVQUFVO0FBQUEsSUFDdEIsZ0JBQWdCLGVBQWU7QUFBQSxJQUMvQixTQUFTLENBQUMsQ0FBQyxTQUFTO0FBQUEsSUFDcEIsUUFBUSxDQUFDLENBQUMsVUFBVTtBQUFBLElBQ3BCLGlCQUFpQjtBQUFBLElBQ2pCLFNBQVMsQ0FBQyxDQUFDLFNBQVM7QUFBQSxJQUNwQixtQkFBbUI7QUFBQSxJQUNuQixRQUFRLFVBQVUsV0FBVyxVQUFVLFdBQVcsT0FBTyxZQUFZO0FBQUEsSUFDckUsTUFBTSxTQUFTLFFBQVE7QUFBQSxFQUN4QjtBQUNEO0FBRUEsU0FBUyxZQUFZLFNBQTBCLG1CQUEwQztBQUN4RixRQUFNLFdBQXFCLEVBQUUsR0FBd0IsbUJBQW9CLFlBQVksQ0FBQyxFQUFHO0FBQ3pGLFdBQVMsa0JBQWtCLFNBQVMsbUJBQW1CLFNBQVM7QUFDaEUsU0FBTztBQUNSO0FBRUEsTUFBTSw2QkFBNkIsc0JBQXdFO0FBQUEsRUFXMUcsWUFDVSxVQUNRLFdBQ1IsU0FDUSw2QkFDQSx5QkFDaEI7QUFDRCxVQUFNO0FBTkc7QUFDUTtBQUNSO0FBQ1E7QUFDQTtBQVJsQixTQUFRLGFBQWEsaUJBQWlCO0FBV3JDLFNBQUssbUJBQW1CLFFBQVE7QUFDaEMsU0FBSyxhQUFhLElBQUksTUFBTSxTQUFTLElBQUksRUFBRSxJQUFJLHNCQUFzQixTQUFTLFdBQVcsU0FBUyxJQUFJLEVBQUUsSUFBSSxVQUFVO0FBQ3RILFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFBQSxFQWhCQSxJQUFJLGtCQUFrQjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQWtCO0FBQUEsRUFHdEQsSUFBSSxZQUFZO0FBQUUsV0FBTyxZQUFZLEtBQUssUUFBUSxTQUFTLElBQUksS0FBSyxhQUFhLEtBQUssUUFBUTtBQUFBLEVBQVc7QUFBQSxFQWV6RyxNQUFnQixNQUFNLE9BQW9EO0FBQ3pFLFVBQU0saUJBQWlCLE1BQU0sS0FBSyw0QkFBNEIsbUJBQW1CLEtBQUssUUFBUSxlQUFlO0FBQzdHLFVBQU0sb0JBQW9CLGVBQWUsS0FBSyxPQUFLLGtCQUFrQixFQUFFLFlBQVksS0FBSyxVQUFVLENBQUM7QUFDbkcsUUFBSSxtQkFBbUI7QUFDdEIsV0FBSyxhQUFhLGlCQUFpQjtBQUFBLElBQ3BDO0FBRUEsVUFBTSxXQUFXLFlBQVksS0FBSyxTQUFTLGlCQUFpQjtBQUM1RCxRQUFJLENBQUMsSUFBSSxNQUFNLEtBQUssU0FBUyxHQUFHO0FBQy9CLGVBQVMsS0FBSyxLQUFLLFVBQVUsV0FBVztBQUN4QyxlQUFTLHVCQUF1QixLQUFLLFVBQVU7QUFDL0MsZUFBUyxjQUFjLEtBQUssVUFBVTtBQUN0QyxlQUFTLHFCQUFxQixLQUFLLElBQUk7QUFDdkMsZUFBUyxzQkFBc0IsS0FBSyxVQUFVLFdBQVc7QUFDekQsZUFBUyx1QkFBdUIsU0FBUyx3QkFBd0IsS0FBSyxVQUFVLFdBQVc7QUFDM0YsZUFBUyxZQUFZLEtBQUssUUFBUSxhQUFhLG1CQUFtQjtBQUNsRSxlQUFTLFdBQVcsbUJBQW1CLFNBQVMsY0FBYyxTQUFTLE9BQU87QUFDOUUsZUFBUyxVQUFVLENBQUMsQ0FBQztBQUNyQixlQUFTLHNCQUFzQixLQUFLLFFBQVEsdUJBQXVCLFNBQVM7QUFDNUUsZUFBUyxVQUFVLEtBQUssVUFBVTtBQUNsQyxlQUFTLGFBQWEsVUFBVSxLQUFLLFFBQVEsVUFBVSxJQUNwRCxLQUFLLFFBQVEsYUFDYixLQUFLLFFBQVEsNEJBQTRCLEtBQUssVUFBVSxXQUFXLHVCQUF1QixTQUFTO0FBQ3RHLGVBQVMsU0FBUyxJQUFJLE1BQU0sS0FBSyxTQUFTLElBQUksYUFBYTtBQUFBLElBQzVEO0FBQ0EsYUFBUyxTQUFTLEtBQUssUUFBUSxzQkFBc0IsT0FBUSxLQUFLLFFBQVEsVUFBVSxTQUFTO0FBRTdGLFNBQUssbUJBQW1CLFNBQVMsc0JBQXNCLEtBQUssd0JBQXdCLGVBQWUscUJBQXFCLEtBQUssUUFBUTtBQUNySSxVQUFNLG1CQUFtQixJQUFJLE1BQU0sS0FBSyxTQUFTLElBQUksTUFBTSxLQUFLLDRCQUE0QixhQUFhLEtBQUssV0FBVyxVQUFVLEtBQUssZUFBZSxJQUNwSixNQUFNLEtBQUssNEJBQTRCLHdCQUF3QixLQUFLLFdBQVcsVUFBVSxLQUFLLGVBQWU7QUFDaEgsV0FBTyxpQkFBaUIsZ0JBQWdCO0FBQUEsRUFDekM7QUFDRDtBQUVBLE1BQU0sK0JBQStCLHNCQUErRDtBQUFBLEVBRW5HLFlBQ1UsV0FDQSxTQUNRLDZCQUNoQjtBQUNELFVBQU07QUFKRztBQUNBO0FBQ1E7QUFBQSxFQUdsQjtBQUFBLEVBRVUsTUFBTSxPQUF5QztBQUN4RCxXQUFPLEtBQUssNEJBQTRCLGdCQUFnQixLQUFLLFdBQVcsS0FBSyxRQUFRLGVBQWU7QUFBQSxFQUNyRztBQUNEOyIsCiAgIm5hbWVzIjogWyJlIl0KfQo=
