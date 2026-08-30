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
import { Queue } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import { ResourceMap } from "../../../base/common/map.js";
import { URI } from "../../../base/common/uri.js";
import { isIExtensionIdentifier } from "./extensionManagement.js";
import { areSameExtensions } from "./extensionManagementUtil.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { isObject, isString, isUndefined } from "../../../base/common/types.js";
import { getErrorMessage } from "../../../base/common/errors.js";
var ExtensionsProfileScanningErrorCode = /* @__PURE__ */ ((ExtensionsProfileScanningErrorCode2) => {
  ExtensionsProfileScanningErrorCode2["ERROR_PROFILE_NOT_FOUND"] = "ERROR_PROFILE_NOT_FOUND";
  ExtensionsProfileScanningErrorCode2["ERROR_INVALID_CONTENT"] = "ERROR_INVALID_CONTENT";
  return ExtensionsProfileScanningErrorCode2;
})(ExtensionsProfileScanningErrorCode || {});
class ExtensionsProfileScanningError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
const IExtensionsProfileScannerService = createDecorator("IExtensionsProfileScannerService");
let AbstractExtensionsProfileScannerService = class extends Disposable {
  constructor(extensionsLocation, fileService, userDataProfilesService, uriIdentityService, logService) {
    super();
    this.extensionsLocation = extensionsLocation;
    this.fileService = fileService;
    this.userDataProfilesService = userDataProfilesService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this._onAddExtensions = this._register(new Emitter());
    this.onAddExtensions = this._onAddExtensions.event;
    this._onDidAddExtensions = this._register(new Emitter());
    this.onDidAddExtensions = this._onDidAddExtensions.event;
    this._onRemoveExtensions = this._register(new Emitter());
    this.onRemoveExtensions = this._onRemoveExtensions.event;
    this._onDidRemoveExtensions = this._register(new Emitter());
    this.onDidRemoveExtensions = this._onDidRemoveExtensions.event;
    this.resourcesAccessQueueMap = new ResourceMap();
  }
  scanProfileExtensions(profileLocation, options) {
    return this.withProfileExtensions(profileLocation, void 0, options);
  }
  async addExtensionsToProfile(extensions, profileLocation, keepExistingVersions) {
    const extensionsToRemove = [];
    const extensionsToAdd = [];
    try {
      await this.withProfileExtensions(profileLocation, (existingExtensions) => {
        const result = [];
        if (keepExistingVersions) {
          result.push(...existingExtensions);
        } else {
          for (const existing of existingExtensions) {
            if (extensions.some(([e]) => areSameExtensions(e.identifier, existing.identifier) && e.manifest.version !== existing.version)) {
              extensionsToRemove.push(existing);
            } else {
              result.push(existing);
            }
          }
        }
        for (const [extension, metadata] of extensions) {
          const index = result.findIndex((e) => areSameExtensions(e.identifier, extension.identifier) && e.version === extension.manifest.version);
          const extensionToAdd = { identifier: extension.identifier, version: extension.manifest.version, location: extension.location, metadata };
          if (index === -1) {
            extensionsToAdd.push(extensionToAdd);
            result.push(extensionToAdd);
          } else {
            result.splice(index, 1, extensionToAdd);
          }
        }
        if (extensionsToAdd.length) {
          this._onAddExtensions.fire({ extensions: extensionsToAdd, profileLocation });
        }
        if (extensionsToRemove.length) {
          this._onRemoveExtensions.fire({ extensions: extensionsToRemove, profileLocation });
        }
        return result;
      });
      if (extensionsToAdd.length) {
        this._onDidAddExtensions.fire({ extensions: extensionsToAdd, profileLocation });
      }
      if (extensionsToRemove.length) {
        this._onDidRemoveExtensions.fire({ extensions: extensionsToRemove, profileLocation });
      }
      return extensionsToAdd;
    } catch (error) {
      if (extensionsToAdd.length) {
        this._onDidAddExtensions.fire({ extensions: extensionsToAdd, error, profileLocation });
      }
      if (extensionsToRemove.length) {
        this._onDidRemoveExtensions.fire({ extensions: extensionsToRemove, error, profileLocation });
      }
      throw error;
    }
  }
  async updateMetadata(extensions, profileLocation) {
    const updatedExtensions = [];
    await this.withProfileExtensions(profileLocation, (profileExtensions) => {
      const result = [];
      for (const profileExtension of profileExtensions) {
        const extension = extensions.find(([e]) => areSameExtensions({ id: e.identifier.id }, { id: profileExtension.identifier.id }) && e.manifest.version === profileExtension.version);
        if (extension) {
          profileExtension.metadata = { ...profileExtension.metadata, ...extension[1] };
          updatedExtensions.push(profileExtension);
          result.push(profileExtension);
        } else {
          result.push(profileExtension);
        }
      }
      return result;
    });
    return updatedExtensions;
  }
  async removeExtensionsFromProfile(extensions, profileLocation) {
    const extensionsToRemove = [];
    try {
      await this.withProfileExtensions(profileLocation, (profileExtensions) => {
        const result = [];
        for (const e of profileExtensions) {
          if (extensions.some((extension) => areSameExtensions(e.identifier, extension))) {
            extensionsToRemove.push(e);
          } else {
            result.push(e);
          }
        }
        if (extensionsToRemove.length) {
          this._onRemoveExtensions.fire({ extensions: extensionsToRemove, profileLocation });
        }
        return result;
      });
      if (extensionsToRemove.length) {
        this._onDidRemoveExtensions.fire({ extensions: extensionsToRemove, profileLocation });
      }
    } catch (error) {
      if (extensionsToRemove.length) {
        this._onDidRemoveExtensions.fire({ extensions: extensionsToRemove, error, profileLocation });
      }
      throw error;
    }
  }
  async withProfileExtensions(file, updateFn, options) {
    return this.getResourceAccessQueue(file).queue(async () => {
      let extensions = [];
      let storedProfileExtensions;
      try {
        const content = await this.fileService.readFile(file);
        storedProfileExtensions = JSON.parse(content.value.toString().trim() || "[]");
      } catch (error) {
        if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
          throw error;
        }
        if (this.uriIdentityService.extUri.isEqual(file, this.userDataProfilesService.defaultProfile.extensionsResource)) {
          storedProfileExtensions = await this.migrateFromOldDefaultProfileExtensionsLocation();
        }
        if (!storedProfileExtensions && options?.bailOutWhenFileNotFound) {
          throw new ExtensionsProfileScanningError(getErrorMessage(error), "ERROR_PROFILE_NOT_FOUND" /* ERROR_PROFILE_NOT_FOUND */);
        }
      }
      if (storedProfileExtensions) {
        if (!Array.isArray(storedProfileExtensions)) {
          this.throwInvalidConentError(file);
        }
        let migrate = false;
        for (const e of storedProfileExtensions) {
          if (!isStoredProfileExtension(e)) {
            this.throwInvalidConentError(file);
          }
          let location;
          if (isString(e.relativeLocation) && e.relativeLocation) {
            location = this.resolveExtensionLocation(e.relativeLocation);
          } else if (isString(e.location)) {
            this.logService.warn(`Extensions profile: Ignoring extension with invalid location: ${e.location}`);
            continue;
          } else {
            location = URI.revive(e.location);
            const relativePath = this.toRelativePath(location);
            if (relativePath) {
              migrate = true;
              e.relativeLocation = relativePath;
            }
          }
          if (isUndefined(e.metadata?.hasPreReleaseVersion) && e.metadata?.preRelease) {
            migrate = true;
            e.metadata.hasPreReleaseVersion = true;
          }
          const uuid = e.metadata?.id ?? e.identifier.uuid;
          extensions.push({
            identifier: uuid ? { id: e.identifier.id, uuid } : { id: e.identifier.id },
            location,
            version: e.version,
            metadata: e.metadata
          });
        }
        if (migrate) {
          await this.fileService.writeFile(file, VSBuffer.fromString(JSON.stringify(storedProfileExtensions)));
        }
      }
      if (updateFn) {
        extensions = updateFn(extensions);
        const storedProfileExtensions2 = extensions.map((e) => ({
          identifier: e.identifier,
          version: e.version,
          // retain old format so that old clients can read it
          location: e.location.toJSON(),
          relativeLocation: this.toRelativePath(e.location),
          metadata: e.metadata
        }));
        await this.fileService.writeFile(file, VSBuffer.fromString(JSON.stringify(storedProfileExtensions2)));
      }
      return extensions;
    });
  }
  throwInvalidConentError(file) {
    throw new ExtensionsProfileScanningError(`Invalid extensions content in ${file.toString()}`, "ERROR_INVALID_CONTENT" /* ERROR_INVALID_CONTENT */);
  }
  toRelativePath(extensionLocation) {
    return this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.dirname(extensionLocation), this.extensionsLocation) ? this.uriIdentityService.extUri.basename(extensionLocation) : void 0;
  }
  resolveExtensionLocation(path) {
    return this.uriIdentityService.extUri.joinPath(this.extensionsLocation, path);
  }
  async migrateFromOldDefaultProfileExtensionsLocation() {
    if (!this._migrationPromise) {
      this._migrationPromise = (async () => {
        const oldDefaultProfileExtensionsLocation = this.uriIdentityService.extUri.joinPath(this.userDataProfilesService.defaultProfile.location, "extensions.json");
        const oldDefaultProfileExtensionsInitLocation = this.uriIdentityService.extUri.joinPath(this.extensionsLocation, ".init-default-profile-extensions");
        let content;
        try {
          content = (await this.fileService.readFile(oldDefaultProfileExtensionsLocation)).value.toString();
        } catch (error) {
          if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
            return void 0;
          }
          throw error;
        }
        this.logService.info("Migrating extensions from old default profile location", oldDefaultProfileExtensionsLocation.toString());
        let storedProfileExtensions;
        try {
          const parsedData = JSON.parse(content);
          if (Array.isArray(parsedData) && parsedData.every((candidate) => isStoredProfileExtension(candidate))) {
            storedProfileExtensions = parsedData;
          } else {
            this.logService.warn("Skipping migrating from old default profile locaiton: Found invalid data", parsedData);
          }
        } catch (error) {
          this.logService.error(error);
        }
        if (storedProfileExtensions) {
          try {
            await this.fileService.createFile(this.userDataProfilesService.defaultProfile.extensionsResource, VSBuffer.fromString(JSON.stringify(storedProfileExtensions)), { overwrite: false });
            this.logService.info("Migrated extensions from old default profile location to new location", oldDefaultProfileExtensionsLocation.toString(), this.userDataProfilesService.defaultProfile.extensionsResource.toString());
          } catch (error) {
            if (toFileOperationResult(error) === FileOperationResult.FILE_MODIFIED_SINCE) {
              this.logService.info("Migration from old default profile location to new location is done by another window", oldDefaultProfileExtensionsLocation.toString(), this.userDataProfilesService.defaultProfile.extensionsResource.toString());
            } else {
              throw error;
            }
          }
        }
        try {
          await this.fileService.del(oldDefaultProfileExtensionsLocation);
        } catch (error) {
          if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
            this.logService.error(error);
          }
        }
        try {
          await this.fileService.del(oldDefaultProfileExtensionsInitLocation);
        } catch (error) {
          if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
            this.logService.error(error);
          }
        }
        return storedProfileExtensions;
      })();
    }
    return this._migrationPromise;
  }
  getResourceAccessQueue(file) {
    let resourceQueue = this.resourcesAccessQueueMap.get(file);
    if (!resourceQueue) {
      resourceQueue = new Queue();
      this.resourcesAccessQueueMap.set(file, resourceQueue);
    }
    return resourceQueue;
  }
};
AbstractExtensionsProfileScannerService = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IUserDataProfilesService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, ILogService)
], AbstractExtensionsProfileScannerService);
function isStoredProfileExtension(obj) {
  const candidate = obj;
  return isObject(candidate) && isIExtensionIdentifier(candidate.identifier) && (isUriComponents(candidate.location) || isString(candidate.location) && !!candidate.location) && (isUndefined(candidate.relativeLocation) || isString(candidate.relativeLocation)) && !!candidate.version && isString(candidate.version);
}
function isUriComponents(obj) {
  if (!obj) {
    return false;
  }
  const thing = obj;
  return typeof thing?.path === "string" && typeof thing?.scheme === "string";
}
export {
  AbstractExtensionsProfileScannerService,
  ExtensionsProfileScanningError,
  ExtensionsProfileScanningErrorCode,
  IExtensionsProfileScannerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcY29tbW9uXFxleHRlbnNpb25zUHJvZmlsZVNjYW5uZXJTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUXVldWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE1ldGFkYXRhLCBpc0lFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zIH0gZnJvbSAnLi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlLCB0b0ZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgTXV0YWJsZSwgaXNPYmplY3QsIGlzU3RyaW5nLCBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5cbmludGVyZmFjZSBJU3RvcmVkUHJvZmlsZUV4dGVuc2lvbiB7XG5cdGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyO1xuXHRsb2NhdGlvbjogVXJpQ29tcG9uZW50cyB8IHN0cmluZztcblx0cmVsYXRpdmVMb2NhdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR2ZXJzaW9uOiBzdHJpbmc7XG5cdG1ldGFkYXRhPzogTWV0YWRhdGE7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEV4dGVuc2lvbnNQcm9maWxlU2Nhbm5pbmdFcnJvckNvZGUge1xuXG5cdC8qKlxuXHQgKiBFcnJvciB3aGVuIHRyeWluZyB0byBzY2FuIGV4dGVuc2lvbnMgZnJvbSBhIHByb2ZpbGUgdGhhdCBkb2VzIG5vdCBleGlzdC5cblx0ICovXG5cdEVSUk9SX1BST0ZJTEVfTk9UX0ZPVU5EID0gJ0VSUk9SX1BST0ZJTEVfTk9UX0ZPVU5EJyxcblxuXHQvKipcblx0ICogRXJyb3Igd2hlbiBwcm9maWxlIGZpbGUgaXMgaW52YWxpZC5cblx0ICovXG5cdEVSUk9SX0lOVkFMSURfQ09OVEVOVCA9ICdFUlJPUl9JTlZBTElEX0NPTlRFTlQnLFxuXG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25zUHJvZmlsZVNjYW5uaW5nRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZywgcHVibGljIGNvZGU6IEV4dGVuc2lvbnNQcm9maWxlU2Nhbm5pbmdFcnJvckNvZGUpIHtcblx0XHRzdXBlcihtZXNzYWdlKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbiB7XG5cdHJlYWRvbmx5IGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyO1xuXHRyZWFkb25seSB2ZXJzaW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxvY2F0aW9uOiBVUkk7XG5cdHJlYWRvbmx5IG1ldGFkYXRhPzogTWV0YWRhdGE7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvZmlsZUV4dGVuc2lvbnNFdmVudCB7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbnM6IHJlYWRvbmx5IElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdO1xuXHRyZWFkb25seSBwcm9maWxlTG9jYXRpb246IFVSSTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEaWRBZGRQcm9maWxlRXh0ZW5zaW9uc0V2ZW50IGV4dGVuZHMgUHJvZmlsZUV4dGVuc2lvbnNFdmVudCB7XG5cdHJlYWRvbmx5IGVycm9yPzogRXJyb3I7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlkUmVtb3ZlUHJvZmlsZUV4dGVuc2lvbnNFdmVudCBleHRlbmRzIFByb2ZpbGVFeHRlbnNpb25zRXZlbnQge1xuXHRyZWFkb25seSBlcnJvcj86IEVycm9yO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9maWxlRXh0ZW5zaW9uc1NjYW5PcHRpb25zIHtcblx0cmVhZG9ubHkgYmFpbE91dFdoZW5GaWxlTm90Rm91bmQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY29uc3QgSUV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dGVuc2lvbnNQcm9maWxlU2Nhbm5lclNlcnZpY2U+KCdJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZScpO1xuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkFkZEV4dGVuc2lvbnM6IEV2ZW50PFByb2ZpbGVFeHRlbnNpb25zRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZEFkZEV4dGVuc2lvbnM6IEV2ZW50PERpZEFkZFByb2ZpbGVFeHRlbnNpb25zRXZlbnQ+O1xuXHRyZWFkb25seSBvblJlbW92ZUV4dGVuc2lvbnM6IEV2ZW50PFByb2ZpbGVFeHRlbnNpb25zRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZUV4dGVuc2lvbnM6IEV2ZW50PERpZFJlbW92ZVByb2ZpbGVFeHRlbnNpb25zRXZlbnQ+O1xuXG5cdHNjYW5Qcm9maWxlRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb246IFVSSSwgb3B0aW9ucz86IElQcm9maWxlRXh0ZW5zaW9uc1NjYW5PcHRpb25zKTogUHJvbWlzZTxJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXT47XG5cdGFkZEV4dGVuc2lvbnNUb1Byb2ZpbGUoZXh0ZW5zaW9uczogW0lFeHRlbnNpb24sIE1ldGFkYXRhIHwgdW5kZWZpbmVkXVtdLCBwcm9maWxlTG9jYXRpb246IFVSSSwga2VlcEV4aXN0aW5nVmVyc2lvbnM/OiBib29sZWFuKTogUHJvbWlzZTxJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXT47XG5cdHVwZGF0ZU1ldGFkYXRhKGV4dGVuc2lvbnM6IFtJRXh0ZW5zaW9uLCBNZXRhZGF0YSB8IHVuZGVmaW5lZF1bXSwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdPjtcblx0cmVtb3ZlRXh0ZW5zaW9uc0Zyb21Qcm9maWxlKGV4dGVuc2lvbnM6IElFeHRlbnNpb25JZGVudGlmaWVyW10sIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0RXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmVyU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkFkZEV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxQcm9maWxlRXh0ZW5zaW9uc0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25BZGRFeHRlbnNpb25zID0gdGhpcy5fb25BZGRFeHRlbnNpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWRkRXh0ZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERpZEFkZFByb2ZpbGVFeHRlbnNpb25zRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFkZEV4dGVuc2lvbnMgPSB0aGlzLl9vbkRpZEFkZEV4dGVuc2lvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25SZW1vdmVFeHRlbnNpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UHJvZmlsZUV4dGVuc2lvbnNFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uUmVtb3ZlRXh0ZW5zaW9ucyA9IHRoaXMuX29uUmVtb3ZlRXh0ZW5zaW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZUV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxEaWRSZW1vdmVQcm9maWxlRXh0ZW5zaW9uc0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmVFeHRlbnNpb25zID0gdGhpcy5fb25EaWRSZW1vdmVFeHRlbnNpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVzb3VyY2VzQWNjZXNzUXVldWVNYXAgPSBuZXcgUmVzb3VyY2VNYXA8UXVldWU8SVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uW10+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc0xvY2F0aW9uOiBVUkksXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRzY2FuUHJvZmlsZUV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uOiBVUkksIG9wdGlvbnM/OiBJUHJvZmlsZUV4dGVuc2lvbnNTY2FuT3B0aW9ucyk6IFByb21pc2U8SVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy53aXRoUHJvZmlsZUV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uLCB1bmRlZmluZWQsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgYWRkRXh0ZW5zaW9uc1RvUHJvZmlsZShleHRlbnNpb25zOiBbSUV4dGVuc2lvbiwgTWV0YWRhdGEgfCB1bmRlZmluZWRdW10sIHByb2ZpbGVMb2NhdGlvbjogVVJJLCBrZWVwRXhpc3RpbmdWZXJzaW9ucz86IGJvb2xlYW4pOiBQcm9taXNlPElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvUmVtb3ZlOiBJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNUb0FkZDogSVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uW10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy53aXRoUHJvZmlsZUV4dGVuc2lvbnMocHJvZmlsZUxvY2F0aW9uLCBleGlzdGluZ0V4dGVuc2lvbnMgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQ6IElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdID0gW107XG5cdFx0XHRcdGlmIChrZWVwRXhpc3RpbmdWZXJzaW9ucykge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKC4uLmV4aXN0aW5nRXh0ZW5zaW9ucyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBleGlzdGluZyBvZiBleGlzdGluZ0V4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRcdGlmIChleHRlbnNpb25zLnNvbWUoKFtlXSkgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleGlzdGluZy5pZGVudGlmaWVyKSAmJiBlLm1hbmlmZXN0LnZlcnNpb24gIT09IGV4aXN0aW5nLnZlcnNpb24pKSB7XG5cdFx0XHRcdFx0XHRcdC8vIFJlbW92ZSB0aGUgZXhpc3RpbmcgZXh0ZW5zaW9uIHdpdGggZGlmZmVyZW50IHZlcnNpb25cblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uc1RvUmVtb3ZlLnB1c2goZXhpc3RpbmcpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goZXhpc3RpbmcpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IFtleHRlbnNpb24sIG1ldGFkYXRhXSBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSByZXN1bHQuZmluZEluZGV4KGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikgJiYgZS52ZXJzaW9uID09PSBleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbik7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVG9BZGQgPSB7IGlkZW50aWZpZXI6IGV4dGVuc2lvbi5pZGVudGlmaWVyLCB2ZXJzaW9uOiBleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiwgbG9jYXRpb246IGV4dGVuc2lvbi5sb2NhdGlvbiwgbWV0YWRhdGEgfTtcblx0XHRcdFx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb25zVG9BZGQucHVzaChleHRlbnNpb25Ub0FkZCk7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChleHRlbnNpb25Ub0FkZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5zcGxpY2UoaW5kZXgsIDEsIGV4dGVuc2lvblRvQWRkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbnNUb0FkZC5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkFkZEV4dGVuc2lvbnMuZmlyZSh7IGV4dGVuc2lvbnM6IGV4dGVuc2lvbnNUb0FkZCwgcHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb25zVG9SZW1vdmUubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25SZW1vdmVFeHRlbnNpb25zLmZpcmUoeyBleHRlbnNpb25zOiBleHRlbnNpb25zVG9SZW1vdmUsIHByb2ZpbGVMb2NhdGlvbiB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fSk7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvQWRkLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEFkZEV4dGVuc2lvbnMuZmlyZSh7IGV4dGVuc2lvbnM6IGV4dGVuc2lvbnNUb0FkZCwgcHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbnNUb1JlbW92ZS5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRSZW1vdmVFeHRlbnNpb25zLmZpcmUoeyBleHRlbnNpb25zOiBleHRlbnNpb25zVG9SZW1vdmUsIHByb2ZpbGVMb2NhdGlvbiB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBleHRlbnNpb25zVG9BZGQ7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChleHRlbnNpb25zVG9BZGQubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQWRkRXh0ZW5zaW9ucy5maXJlKHsgZXh0ZW5zaW9uczogZXh0ZW5zaW9uc1RvQWRkLCBlcnJvciwgcHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbnNUb1JlbW92ZS5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRSZW1vdmVFeHRlbnNpb25zLmZpcmUoeyBleHRlbnNpb25zOiBleHRlbnNpb25zVG9SZW1vdmUsIGVycm9yLCBwcm9maWxlTG9jYXRpb24gfSk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB1cGRhdGVNZXRhZGF0YShleHRlbnNpb25zOiBbSUV4dGVuc2lvbiwgTWV0YWRhdGFdW10sIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHVwZGF0ZWRFeHRlbnNpb25zOiBJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGF3YWl0IHRoaXMud2l0aFByb2ZpbGVFeHRlbnNpb25zKHByb2ZpbGVMb2NhdGlvbiwgcHJvZmlsZUV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBwcm9maWxlRXh0ZW5zaW9uIG9mIHByb2ZpbGVFeHRlbnNpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGV4dGVuc2lvbnMuZmluZCgoW2VdKSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkOiBlLmlkZW50aWZpZXIuaWQgfSwgeyBpZDogcHJvZmlsZUV4dGVuc2lvbi5pZGVudGlmaWVyLmlkIH0pICYmIGUubWFuaWZlc3QudmVyc2lvbiA9PT0gcHJvZmlsZUV4dGVuc2lvbi52ZXJzaW9uKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHByb2ZpbGVFeHRlbnNpb24ubWV0YWRhdGEgPSB7IC4uLnByb2ZpbGVFeHRlbnNpb24ubWV0YWRhdGEsIC4uLmV4dGVuc2lvblsxXSB9O1xuXHRcdFx0XHRcdHVwZGF0ZWRFeHRlbnNpb25zLnB1c2gocHJvZmlsZUV4dGVuc2lvbik7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2gocHJvZmlsZUV4dGVuc2lvbik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2gocHJvZmlsZUV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHVwZGF0ZWRFeHRlbnNpb25zO1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlRXh0ZW5zaW9uc0Zyb21Qcm9maWxlKGV4dGVuc2lvbnM6IElFeHRlbnNpb25JZGVudGlmaWVyW10sIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvUmVtb3ZlOiBJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLndpdGhQcm9maWxlRXh0ZW5zaW9ucyhwcm9maWxlTG9jYXRpb24sIHByb2ZpbGVFeHRlbnNpb25zID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiBJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGUgb2YgcHJvZmlsZUV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9ucy5zb21lKGV4dGVuc2lvbiA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbikpKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb25zVG9SZW1vdmUucHVzaChlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb25zVG9SZW1vdmUubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25SZW1vdmVFeHRlbnNpb25zLmZpcmUoeyBleHRlbnNpb25zOiBleHRlbnNpb25zVG9SZW1vdmUsIHByb2ZpbGVMb2NhdGlvbiB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fSk7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvUmVtb3ZlLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlbW92ZUV4dGVuc2lvbnMuZmlyZSh7IGV4dGVuc2lvbnM6IGV4dGVuc2lvbnNUb1JlbW92ZSwgcHJvZmlsZUxvY2F0aW9uIH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uc1RvUmVtb3ZlLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlbW92ZUV4dGVuc2lvbnMuZmlyZSh7IGV4dGVuc2lvbnM6IGV4dGVuc2lvbnNUb1JlbW92ZSwgZXJyb3IsIHByb2ZpbGVMb2NhdGlvbiB9KTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2l0aFByb2ZpbGVFeHRlbnNpb25zKGZpbGU6IFVSSSwgdXBkYXRlRm4/OiAoZXh0ZW5zaW9uczogTXV0YWJsZTxJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb24+W10pID0+IElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdLCBvcHRpb25zPzogSVByb2ZpbGVFeHRlbnNpb25zU2Nhbk9wdGlvbnMpOiBQcm9taXNlPElTY2FubmVkUHJvZmlsZUV4dGVuc2lvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UmVzb3VyY2VBY2Nlc3NRdWV1ZShmaWxlKS5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgZXh0ZW5zaW9uczogSVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uW10gPSBbXTtcblxuXHRcdFx0Ly8gUmVhZFxuXHRcdFx0bGV0IHN0b3JlZFByb2ZpbGVFeHRlbnNpb25zOiBJU3RvcmVkUHJvZmlsZUV4dGVuc2lvbltdIHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoZmlsZSk7XG5cdFx0XHRcdHN0b3JlZFByb2ZpbGVFeHRlbnNpb25zID0gSlNPTi5wYXJzZShjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkudHJpbSgpIHx8ICdbXScpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBtaWdyYXRlIGZyb20gb2xkIGxvY2F0aW9uLCByZW1vdmUgdGhpcyBhZnRlciBjb3VwbGUgb2YgcmVsZWFzZXNcblx0XHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGZpbGUsIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKSkge1xuXHRcdFx0XHRcdHN0b3JlZFByb2ZpbGVFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5taWdyYXRlRnJvbU9sZERlZmF1bHRQcm9maWxlRXh0ZW5zaW9uc0xvY2F0aW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFzdG9yZWRQcm9maWxlRXh0ZW5zaW9ucyAmJiBvcHRpb25zPy5iYWlsT3V0V2hlbkZpbGVOb3RGb3VuZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25zUHJvZmlsZVNjYW5uaW5nRXJyb3IoZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSwgRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmluZ0Vycm9yQ29kZS5FUlJPUl9QUk9GSUxFX05PVF9GT1VORCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChzdG9yZWRQcm9maWxlRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc3RvcmVkUHJvZmlsZUV4dGVuc2lvbnMpKSB7XG5cdFx0XHRcdFx0dGhpcy50aHJvd0ludmFsaWRDb25lbnRFcnJvcihmaWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBUT0RPIEBzYW5keTA4MTogUmVtb3ZlIHRoaXMgbWlncmF0aW9uIGFmdGVyIGNvdXBsZSBvZiByZWxlYXNlc1xuXHRcdFx0XHRsZXQgbWlncmF0ZSA9IGZhbHNlO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGUgb2Ygc3RvcmVkUHJvZmlsZUV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRpZiAoIWlzU3RvcmVkUHJvZmlsZUV4dGVuc2lvbihlKSkge1xuXHRcdFx0XHRcdFx0dGhpcy50aHJvd0ludmFsaWRDb25lbnRFcnJvcihmaWxlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGV0IGxvY2F0aW9uOiBVUkk7XG5cdFx0XHRcdFx0aWYgKGlzU3RyaW5nKGUucmVsYXRpdmVMb2NhdGlvbikgJiYgZS5yZWxhdGl2ZUxvY2F0aW9uKSB7XG5cdFx0XHRcdFx0XHQvLyBFeHRlbnNpb24gaW4gbmV3IGZvcm1hdC4gTm8gbWlncmF0aW9uIG5lZWRlZC5cblx0XHRcdFx0XHRcdGxvY2F0aW9uID0gdGhpcy5yZXNvbHZlRXh0ZW5zaW9uTG9jYXRpb24oZS5yZWxhdGl2ZUxvY2F0aW9uKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzU3RyaW5nKGUubG9jYXRpb24pKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRXh0ZW5zaW9ucyBwcm9maWxlOiBJZ25vcmluZyBleHRlbnNpb24gd2l0aCBpbnZhbGlkIGxvY2F0aW9uOiAke2UubG9jYXRpb259YCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bG9jYXRpb24gPSBVUkkucmV2aXZlKGUubG9jYXRpb24pO1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVsYXRpdmVQYXRoID0gdGhpcy50b1JlbGF0aXZlUGF0aChsb2NhdGlvbik7XG5cdFx0XHRcdFx0XHRpZiAocmVsYXRpdmVQYXRoKSB7XG5cdFx0XHRcdFx0XHRcdC8vIEV4dGVuc2lvbiBpbiBvbGQgZm9ybWF0LiBNaWdyYXRlIHRvIG5ldyBmb3JtYXQuXG5cdFx0XHRcdFx0XHRcdG1pZ3JhdGUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRlLnJlbGF0aXZlTG9jYXRpb24gPSByZWxhdGl2ZVBhdGg7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChpc1VuZGVmaW5lZChlLm1ldGFkYXRhPy5oYXNQcmVSZWxlYXNlVmVyc2lvbikgJiYgZS5tZXRhZGF0YT8ucHJlUmVsZWFzZSkge1xuXHRcdFx0XHRcdFx0bWlncmF0ZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRlLm1ldGFkYXRhLmhhc1ByZVJlbGVhc2VWZXJzaW9uID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgdXVpZCA9IGUubWV0YWRhdGE/LmlkID8/IGUuaWRlbnRpZmllci51dWlkO1xuXHRcdFx0XHRcdGV4dGVuc2lvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRpZGVudGlmaWVyOiB1dWlkID8geyBpZDogZS5pZGVudGlmaWVyLmlkLCB1dWlkIH0gOiB7IGlkOiBlLmlkZW50aWZpZXIuaWQgfSxcblx0XHRcdFx0XHRcdGxvY2F0aW9uLFxuXHRcdFx0XHRcdFx0dmVyc2lvbjogZS52ZXJzaW9uLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IGUubWV0YWRhdGEsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1pZ3JhdGUpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShmaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHN0b3JlZFByb2ZpbGVFeHRlbnNpb25zKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVwZGF0ZVxuXHRcdFx0aWYgKHVwZGF0ZUZuKSB7XG5cdFx0XHRcdGV4dGVuc2lvbnMgPSB1cGRhdGVGbihleHRlbnNpb25zKTtcblx0XHRcdFx0Y29uc3Qgc3RvcmVkUHJvZmlsZUV4dGVuc2lvbnM6IElTdG9yZWRQcm9maWxlRXh0ZW5zaW9uW10gPSBleHRlbnNpb25zLm1hcChlID0+ICh7XG5cdFx0XHRcdFx0aWRlbnRpZmllcjogZS5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdHZlcnNpb246IGUudmVyc2lvbixcblx0XHRcdFx0XHQvLyByZXRhaW4gb2xkIGZvcm1hdCBzbyB0aGF0IG9sZCBjbGllbnRzIGNhbiByZWFkIGl0XG5cdFx0XHRcdFx0bG9jYXRpb246IGUubG9jYXRpb24udG9KU09OKCksXG5cdFx0XHRcdFx0cmVsYXRpdmVMb2NhdGlvbjogdGhpcy50b1JlbGF0aXZlUGF0aChlLmxvY2F0aW9uKSxcblx0XHRcdFx0XHRtZXRhZGF0YTogZS5tZXRhZGF0YVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoc3RvcmVkUHJvZmlsZUV4dGVuc2lvbnMpKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBleHRlbnNpb25zO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB0aHJvd0ludmFsaWRDb25lbnRFcnJvcihmaWxlOiBVUkkpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uc1Byb2ZpbGVTY2FubmluZ0Vycm9yKGBJbnZhbGlkIGV4dGVuc2lvbnMgY29udGVudCBpbiAke2ZpbGUudG9TdHJpbmcoKX1gLCBFeHRlbnNpb25zUHJvZmlsZVNjYW5uaW5nRXJyb3JDb2RlLkVSUk9SX0lOVkFMSURfQ09OVEVOVCk7XG5cdH1cblxuXHRwcml2YXRlIHRvUmVsYXRpdmVQYXRoKGV4dGVuc2lvbkxvY2F0aW9uOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZGlybmFtZShleHRlbnNpb25Mb2NhdGlvbiksIHRoaXMuZXh0ZW5zaW9uc0xvY2F0aW9uKVxuXHRcdFx0PyB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuYmFzZW5hbWUoZXh0ZW5zaW9uTG9jYXRpb24pXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZUV4dGVuc2lvbkxvY2F0aW9uKHBhdGg6IHN0cmluZyk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aCh0aGlzLmV4dGVuc2lvbnNMb2NhdGlvbiwgcGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIF9taWdyYXRpb25Qcm9taXNlOiBQcm9taXNlPElTdG9yZWRQcm9maWxlRXh0ZW5zaW9uW10gfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFzeW5jIG1pZ3JhdGVGcm9tT2xkRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zTG9jYXRpb24oKTogUHJvbWlzZTxJU3RvcmVkUHJvZmlsZUV4dGVuc2lvbltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9taWdyYXRpb25Qcm9taXNlKSB7XG5cdFx0XHR0aGlzLl9taWdyYXRpb25Qcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2xkRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zTG9jYXRpb24gPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5sb2NhdGlvbiwgJ2V4dGVuc2lvbnMuanNvbicpO1xuXHRcdFx0XHRjb25zdCBvbGREZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnNJbml0TG9jYXRpb24gPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgodGhpcy5leHRlbnNpb25zTG9jYXRpb24sICcuaW5pdC1kZWZhdWx0LXByb2ZpbGUtZXh0ZW5zaW9ucycpO1xuXHRcdFx0XHRsZXQgY29udGVudDogc3RyaW5nO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnRlbnQgPSAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShvbGREZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnNMb2NhdGlvbikpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ01pZ3JhdGluZyBleHRlbnNpb25zIGZyb20gb2xkIGRlZmF1bHQgcHJvZmlsZSBsb2NhdGlvbicsIG9sZERlZmF1bHRQcm9maWxlRXh0ZW5zaW9uc0xvY2F0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRsZXQgc3RvcmVkUHJvZmlsZUV4dGVuc2lvbnM6IElTdG9yZWRQcm9maWxlRXh0ZW5zaW9uW10gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VkRGF0YSA9IEpTT04ucGFyc2UoY29udGVudCk7XG5cdFx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocGFyc2VkRGF0YSkgJiYgcGFyc2VkRGF0YS5ldmVyeShjYW5kaWRhdGUgPT4gaXNTdG9yZWRQcm9maWxlRXh0ZW5zaW9uKGNhbmRpZGF0ZSkpKSB7XG5cdFx0XHRcdFx0XHRzdG9yZWRQcm9maWxlRXh0ZW5zaW9ucyA9IHBhcnNlZERhdGE7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdTa2lwcGluZyBtaWdyYXRpbmcgZnJvbSBvbGQgZGVmYXVsdCBwcm9maWxlIGxvY2FpdG9uOiBGb3VuZCBpbnZhbGlkIGRhdGEnLCBwYXJzZWREYXRhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0LyogSWdub3JlICovXG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzdG9yZWRQcm9maWxlRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNyZWF0ZUZpbGUodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoc3RvcmVkUHJvZmlsZUV4dGVuc2lvbnMpKSwgeyBvdmVyd3JpdGU6IGZhbHNlIH0pO1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ01pZ3JhdGVkIGV4dGVuc2lvbnMgZnJvbSBvbGQgZGVmYXVsdCBwcm9maWxlIGxvY2F0aW9uIHRvIG5ldyBsb2NhdGlvbicsIG9sZERlZmF1bHRQcm9maWxlRXh0ZW5zaW9uc0xvY2F0aW9uLnRvU3RyaW5nKCksIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PRElGSUVEX1NJTkNFKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdNaWdyYXRpb24gZnJvbSBvbGQgZGVmYXVsdCBwcm9maWxlIGxvY2F0aW9uIHRvIG5ldyBsb2NhdGlvbiBpcyBkb25lIGJ5IGFub3RoZXIgd2luZG93Jywgb2xkRGVmYXVsdFByb2ZpbGVFeHRlbnNpb25zTG9jYXRpb24udG9TdHJpbmcoKSwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKG9sZERlZmF1bHRQcm9maWxlRXh0ZW5zaW9uc0xvY2F0aW9uKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKG9sZERlZmF1bHRQcm9maWxlRXh0ZW5zaW9uc0luaXRMb2NhdGlvbik7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHN0b3JlZFByb2ZpbGVFeHRlbnNpb25zO1xuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21pZ3JhdGlvblByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGdldFJlc291cmNlQWNjZXNzUXVldWUoZmlsZTogVVJJKTogUXVldWU8SVNjYW5uZWRQcm9maWxlRXh0ZW5zaW9uW10+IHtcblx0XHRsZXQgcmVzb3VyY2VRdWV1ZSA9IHRoaXMucmVzb3VyY2VzQWNjZXNzUXVldWVNYXAuZ2V0KGZpbGUpO1xuXHRcdGlmICghcmVzb3VyY2VRdWV1ZSkge1xuXHRcdFx0cmVzb3VyY2VRdWV1ZSA9IG5ldyBRdWV1ZTxJU2Nhbm5lZFByb2ZpbGVFeHRlbnNpb25bXT4oKTtcblx0XHRcdHRoaXMucmVzb3VyY2VzQWNjZXNzUXVldWVNYXAuc2V0KGZpbGUsIHJlc291cmNlUXVldWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzb3VyY2VRdWV1ZTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc1N0b3JlZFByb2ZpbGVFeHRlbnNpb24ob2JqOiB1bmtub3duKTogb2JqIGlzIElTdG9yZWRQcm9maWxlRXh0ZW5zaW9uIHtcblx0Y29uc3QgY2FuZGlkYXRlID0gb2JqIGFzIElTdG9yZWRQcm9maWxlRXh0ZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRyZXR1cm4gaXNPYmplY3QoY2FuZGlkYXRlKVxuXHRcdCYmIGlzSUV4dGVuc2lvbklkZW50aWZpZXIoY2FuZGlkYXRlLmlkZW50aWZpZXIpXG5cdFx0JiYgKGlzVXJpQ29tcG9uZW50cyhjYW5kaWRhdGUubG9jYXRpb24pIHx8IChpc1N0cmluZyhjYW5kaWRhdGUubG9jYXRpb24pICYmICEhY2FuZGlkYXRlLmxvY2F0aW9uKSlcblx0XHQmJiAoaXNVbmRlZmluZWQoY2FuZGlkYXRlLnJlbGF0aXZlTG9jYXRpb24pIHx8IGlzU3RyaW5nKGNhbmRpZGF0ZS5yZWxhdGl2ZUxvY2F0aW9uKSlcblx0XHQmJiAhIWNhbmRpZGF0ZS52ZXJzaW9uXG5cdFx0JiYgaXNTdHJpbmcoY2FuZGlkYXRlLnZlcnNpb24pO1xufVxuXG5mdW5jdGlvbiBpc1VyaUNvbXBvbmVudHMob2JqOiB1bmtub3duKTogb2JqIGlzIFVyaUNvbXBvbmVudHMge1xuXHRpZiAoIW9iaikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCB0aGluZyA9IG9iaiBhcyBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkO1xuXHRyZXR1cm4gdHlwZW9mIHRoaW5nPy5wYXRoID09PSAnc3RyaW5nJyAmJlxuXHRcdHR5cGVvZiB0aGluZz8uc2NoZW1lID09PSAnc3RyaW5nJztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxXQUEwQjtBQUNuQyxTQUFtQiw4QkFBOEI7QUFDakQsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxxQkFBcUIsY0FBYyw2QkFBNkI7QUFDekUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFDcEMsU0FBa0IsVUFBVSxVQUFVLG1CQUFtQjtBQUN6RCxTQUFTLHVCQUF1QjtBQVV6QixJQUFXLHFDQUFYLGtCQUFXQSx3Q0FBWDtBQUtOLEVBQUFBLG9DQUFBLDZCQUEwQjtBQUsxQixFQUFBQSxvQ0FBQSwyQkFBd0I7QUFWUCxTQUFBQTtBQUFBLEdBQUE7QUFjWCxNQUFNLHVDQUF1QyxNQUFNO0FBQUEsRUFDekQsWUFBWSxTQUF3QixNQUEwQztBQUM3RSxVQUFNLE9BQU87QUFEc0I7QUFBQSxFQUVwQztBQUNEO0FBMEJPLE1BQU0sbUNBQW1DLGdCQUFrRCxrQ0FBa0M7QUFlN0gsSUFBZSwwQ0FBZixjQUErRCxXQUF1RDtBQUFBLEVBaUI1SCxZQUNrQixvQkFDYyxhQUNZLHlCQUNMLG9CQUNSLFlBQzdCO0FBQ0QsVUFBTTtBQU5XO0FBQ2M7QUFDWTtBQUNMO0FBQ1I7QUFuQi9CLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxRQUFnQyxDQUFDO0FBQ3hGLFNBQVMsa0JBQWtCLEtBQUssaUJBQWlCO0FBRWpELFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxRQUFzQyxDQUFDO0FBQ2pHLFNBQVMscUJBQXFCLEtBQUssb0JBQW9CO0FBRXZELFNBQWlCLHNCQUFzQixLQUFLLFVBQVUs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QUNKO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRVEsdUJBQXVCLE1BQThDO0FBQzVFLFFBQUksZ0JBQWdCLEtBQUssd0JBQXdCLElBQUksSUFBSTtBQUN6RCxRQUFJLENBQUMsZUFBZTtBQUNuQixzQkFBZ0IsSUFBSSxNQUFrQztBQUN0RCxXQUFLLHdCQUF3QixJQUFJLE1BQU0sYUFBYTtBQUFBLElBQ3JEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQTdTc0IsMENBQWY7QUFBQSxFQW1CSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdEJtQjtBQStTdEIsU0FBUyx5QkFBeUIsS0FBOEM7QUFDL0UsUUFBTSxZQUFZO0FBQ2xCLFNBQU8sU0FBUyxTQUFTLEtBQ3JCLHVCQUF1QixVQUFVLFVBQVUsTUFDMUMsZ0JBQWdCLFVBQVUsUUFBUSxLQUFNLFNBQVMsVUFBVSxRQUFRLEtBQUssQ0FBQyxDQUFDLFVBQVUsY0FDcEYsWUFBWSxVQUFVLGdCQUFnQixLQUFLLFNBQVMsVUFBVSxnQkFBZ0IsTUFDL0UsQ0FBQyxDQUFDLFVBQVUsV0FDWixTQUFTLFVBQVUsT0FBTztBQUMvQjtBQUVBLFNBQVMsZ0JBQWdCLEtBQW9DO0FBQzVELE1BQUksQ0FBQyxLQUFLO0FBQ1QsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLFFBQVE7QUFDZCxTQUFPLE9BQU8sT0FBTyxTQUFTLFlBQzdCLE9BQU8sT0FBTyxXQUFXO0FBQzNCOyIsCiAgIm5hbWVzIjogWyJFeHRlbnNpb25zUHJvZmlsZVNjYW5uaW5nRXJyb3JDb2RlIiwgInN0b3JlZFByb2ZpbGVFeHRlbnNpb25zIl0KfQo=
