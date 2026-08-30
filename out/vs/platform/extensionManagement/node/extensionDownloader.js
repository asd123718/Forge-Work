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
import { getErrorMessage } from "../../../base/common/errors.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { joinPath } from "../../../base/common/resources.js";
import * as semver from "../../../base/common/semver/semver.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { Promises as FSPromises } from "../../../base/node/pfs.js";
import { buffer, CorruptZipMessage } from "../../../base/node/zip.js";
import { INativeEnvironmentService } from "../../environment/common/environment.js";
import { toExtensionManagementError } from "../common/abstractExtensionManagementService.js";
import { ExtensionManagementError, ExtensionManagementErrorCode, ExtensionSignatureVerificationCode, IExtensionGalleryService } from "../common/extensionManagement.js";
import { ExtensionKey, groupByExtension } from "../common/extensionManagementUtil.js";
import { fromExtractError } from "./extensionManagementUtil.js";
import { IExtensionSignatureVerificationService } from "./extensionSignatureVerificationService.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
let ExtensionsDownloader = class extends Disposable {
  constructor(environmentService, fileService, extensionGalleryService, extensionSignatureVerificationService, telemetryService, uriIdentityService, logService) {
    super();
    this.fileService = fileService;
    this.extensionGalleryService = extensionGalleryService;
    this.extensionSignatureVerificationService = extensionSignatureVerificationService;
    this.telemetryService = telemetryService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this.extensionsDownloadDir = environmentService.extensionsDownloadLocation;
    this.extensionsTrashDir = uriIdentityService.extUri.joinPath(environmentService.extensionsDownloadLocation, `.trash`);
    this.cache = 20;
    this.cleanUpPromise = this.cleanUp();
  }
  async download(extension, operation, verifySignature, clientTargetPlatform) {
    await this.cleanUpPromise;
    const location = await this.downloadVSIX(extension, operation);
    if (!verifySignature) {
      return { location, verificationStatus: void 0 };
    }
    if (!extension.isSigned) {
      return { location, verificationStatus: ExtensionSignatureVerificationCode.NotSigned };
    }
    let signatureArchiveLocation;
    try {
      signatureArchiveLocation = await this.downloadSignatureArchive(extension);
      const verificationStatus = (await this.extensionSignatureVerificationService.verify(extension.identifier.id, extension.version, location.fsPath, signatureArchiveLocation.fsPath, clientTargetPlatform))?.code;
      if (verificationStatus === ExtensionSignatureVerificationCode.PackageIsInvalidZip || verificationStatus === ExtensionSignatureVerificationCode.SignatureArchiveIsInvalidZip) {
        try {
          await this.delete(location);
        } catch (error) {
          this.logService.error(error);
        }
        throw new ExtensionManagementError(CorruptZipMessage, ExtensionManagementErrorCode.CorruptZip);
      }
      return { location, verificationStatus };
    } catch (error) {
      try {
        await this.delete(location);
      } catch (error2) {
        this.logService.error(error2);
      }
      throw error;
    } finally {
      if (signatureArchiveLocation) {
        try {
          await this.delete(signatureArchiveLocation);
        } catch (error) {
          this.logService.error(error);
        }
      }
    }
  }
  async downloadVSIX(extension, operation) {
    try {
      const location = joinPath(this.extensionsDownloadDir, this.getName(extension));
      const attempts = await this.doDownload(extension, "vsix", async () => {
        await this.downloadFile(extension, location, (location2) => this.extensionGalleryService.download(extension, location2, operation));
        try {
          await this.validate(location.fsPath, "extension/package.json");
        } catch (error) {
          try {
            await this.fileService.del(location);
          } catch (e) {
            this.logService.warn(`Error while deleting: ${location.path}`, getErrorMessage(e));
          }
          throw error;
        }
      }, 2);
      if (attempts > 1) {
        this.telemetryService.publicLog2("extensiongallery:downloadvsix:retry", {
          extensionId: extension.identifier.id,
          attempts
        });
      }
      return location;
    } catch (e) {
      throw toExtensionManagementError(e, ExtensionManagementErrorCode.Download);
    }
  }
  async downloadSignatureArchive(extension) {
    try {
      const location = joinPath(this.extensionsDownloadDir, `${this.getName(extension)}${ExtensionsDownloader.SignatureArchiveExtension}`);
      const attempts = await this.doDownload(extension, "sigzip", async () => {
        await this.extensionGalleryService.downloadSignatureArchive(extension, location);
        try {
          await this.validate(location.fsPath, ".signature.p7s");
        } catch (error) {
          try {
            await this.fileService.del(location);
          } catch (e) {
            this.logService.warn(`Error while deleting: ${location.path}`, getErrorMessage(e));
          }
          throw error;
        }
      }, 2);
      if (attempts > 1) {
        this.telemetryService.publicLog2("extensiongallery:downloadsigzip:retry", {
          extensionId: extension.identifier.id,
          attempts
        });
      }
      return location;
    } catch (e) {
      throw toExtensionManagementError(e, ExtensionManagementErrorCode.DownloadSignature);
    }
  }
  async downloadFile(extension, location, downloadFn) {
    if (await this.fileService.exists(location)) {
      return;
    }
    if (location.scheme !== Schemas.file) {
      await downloadFn(location);
      return;
    }
    const tempLocation = joinPath(this.extensionsDownloadDir, `.${generateUuid()}`);
    try {
      await downloadFn(tempLocation);
    } catch (error) {
      try {
        await this.fileService.del(tempLocation);
      } catch (e) {
      }
      throw error;
    }
    try {
      await FSPromises.rename(
        tempLocation.fsPath,
        location.fsPath,
        2 * 60 * 1e3
        /* Retry for 2 minutes */
      );
    } catch (error) {
      try {
        await this.fileService.del(tempLocation);
      } catch (e) {
      }
      let exists = false;
      try {
        exists = await this.fileService.exists(location);
      } catch (e) {
      }
      if (exists) {
        this.logService.info(`Rename failed because the file was downloaded by another source. So ignoring renaming.`, extension.identifier.id, location.path);
      } else {
        this.logService.info(`Rename failed because of ${getErrorMessage(error)}. Deleted the file from downloaded location`, tempLocation.path);
        throw error;
      }
    }
  }
  async doDownload(extension, name, downloadFn, retries) {
    let attempts = 1;
    while (true) {
      try {
        await downloadFn();
        return attempts;
      } catch (e) {
        if (attempts++ > retries) {
          throw e;
        }
        this.logService.warn(`Failed downloading ${name}. ${getErrorMessage(e)}. Retry again...`, extension.identifier.id);
      }
    }
  }
  async validate(zipPath, filePath) {
    try {
      await buffer(zipPath, filePath);
    } catch (e) {
      throw fromExtractError(e);
    }
  }
  async delete(location) {
    await this.cleanUpPromise;
    const trashRelativePath = this.uriIdentityService.extUri.relativePath(this.extensionsDownloadDir, location);
    if (trashRelativePath) {
      await this.fileService.move(location, this.uriIdentityService.extUri.joinPath(this.extensionsTrashDir, trashRelativePath), true);
    } else {
      await this.fileService.del(location);
    }
  }
  async cleanUp() {
    try {
      if (!await this.fileService.exists(this.extensionsDownloadDir)) {
        this.logService.trace("Extension VSIX downloads cache dir does not exist");
        return;
      }
      try {
        await this.fileService.del(this.extensionsTrashDir, { recursive: true });
      } catch (error) {
        if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
          this.logService.error(error);
        }
      }
      const folderStat = await this.fileService.resolve(this.extensionsDownloadDir, { resolveMetadata: true });
      if (folderStat.children) {
        const toDelete = [];
        const vsixs = [];
        const signatureArchives = [];
        for (const stat of folderStat.children) {
          if (stat.name.endsWith(ExtensionsDownloader.SignatureArchiveExtension)) {
            signatureArchives.push(stat.resource);
          } else {
            const extension = ExtensionKey.parse(stat.name);
            if (extension) {
              vsixs.push([extension, stat]);
            }
          }
        }
        const byExtension = groupByExtension(vsixs, ([extension]) => extension);
        const distinct = [];
        for (const p of byExtension) {
          p.sort((a, b) => semver.rcompare(a[0].version, b[0].version));
          toDelete.push(...p.slice(1).map((e) => e[1].resource));
          distinct.push(p[0][1]);
        }
        distinct.sort((a, b) => a.mtime - b.mtime);
        toDelete.push(...distinct.slice(0, Math.max(0, distinct.length - this.cache)).map((s) => s.resource));
        toDelete.push(...signatureArchives);
        await Promises.settled(toDelete.map((resource) => {
          this.logService.trace("Deleting from cache", resource.path);
          return this.fileService.del(resource);
        }));
      }
    } catch (e) {
      this.logService.error(e);
    }
  }
  getName(extension) {
    return ExtensionKey.create(extension).toString().toLowerCase();
  }
};
ExtensionsDownloader.SignatureArchiveExtension = ".sigzip";
ExtensionsDownloader = __decorateClass([
  __decorateParam(0, INativeEnvironmentService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IExtensionGalleryService),
  __decorateParam(3, IExtensionSignatureVerificationService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, ILogService)
], ExtensionsDownloader);
export {
  ExtensionsDownloader
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcbm9kZVxcZXh0ZW5zaW9uRG93bmxvYWRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0ICogYXMgc2VtdmVyIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NlbXZlci9zZW12ZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgYXMgRlNQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgYnVmZmVyLCBDb3JydXB0WmlwTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS96aXAuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvciB9IGZyb20gJy4uL2NvbW1vbi9hYnN0cmFjdEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvciwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZSwgRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZSwgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJR2FsbGVyeUV4dGVuc2lvbiwgSW5zdGFsbE9wZXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbktleSwgZ3JvdXBCeUV4dGVuc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBmcm9tRXh0cmFjdEVycm9yIH0gZnJvbSAnLi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4vZXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUYXJnZXRQbGF0Zm9ybSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXRXaXRoTWV0YWRhdGEsIHRvRmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5cbnR5cGUgUmV0cnlEb3dubG9hZENsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3NhbmR5MDgxJztcblx0Y29tbWVudDogJ0V2ZW50IHJlcG9ydGluZyB0aGUgcmV0cnkgb2YgZG93bmxvYWRpbmcnO1xuXHRleHRlbnNpb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0V4dGVuc2lvbiBJZCcgfTtcblx0YXR0ZW1wdHM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgQXR0ZW1wdHMnIH07XG59O1xudHlwZSBSZXRyeURvd25sb2FkRXZlbnQgPSB7XG5cdGV4dGVuc2lvbklkOiBzdHJpbmc7XG5cdGF0dGVtcHRzOiBudW1iZXI7XG59O1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uc0Rvd25sb2FkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTaWduYXR1cmVBcmNoaXZlRXh0ZW5zaW9uID0gJy5zaWd6aXAnO1xuXG5cdHJlYWRvbmx5IGV4dGVuc2lvbnNEb3dubG9hZERpcjogVVJJO1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNUcmFzaERpcjogVVJJO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNhY2hlOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2xlYW5VcFByb21pc2U6IFByb21pc2U8dm9pZD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvblNlcnZpY2U6IElFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uc0Rvd25sb2FkRGlyID0gZW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvbnNEb3dubG9hZExvY2F0aW9uO1xuXHRcdHRoaXMuZXh0ZW5zaW9uc1RyYXNoRGlyID0gdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uc0Rvd25sb2FkTG9jYXRpb24sIGAudHJhc2hgKTtcblx0XHR0aGlzLmNhY2hlID0gMjA7IC8vIENhY2hlIDIwIGRvd25sb2FkZWQgVlNJWCBmaWxlc1xuXHRcdHRoaXMuY2xlYW5VcFByb21pc2UgPSB0aGlzLmNsZWFuVXAoKTtcblx0fVxuXG5cdGFzeW5jIGRvd25sb2FkKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbiwgdmVyaWZ5U2lnbmF0dXJlOiBib29sZWFuLCBjbGllbnRUYXJnZXRQbGF0Zm9ybT86IFRhcmdldFBsYXRmb3JtKTogUHJvbWlzZTx7IHJlYWRvbmx5IGxvY2F0aW9uOiBVUkk7IHJlYWRvbmx5IHZlcmlmaWNhdGlvblN0YXR1czogRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZSB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0YXdhaXQgdGhpcy5jbGVhblVwUHJvbWlzZTtcblxuXHRcdGNvbnN0IGxvY2F0aW9uID0gYXdhaXQgdGhpcy5kb3dubG9hZFZTSVgoZXh0ZW5zaW9uLCBvcGVyYXRpb24pO1xuXG5cdFx0aWYgKCF2ZXJpZnlTaWduYXR1cmUpIHtcblx0XHRcdHJldHVybiB7IGxvY2F0aW9uLCB2ZXJpZmljYXRpb25TdGF0dXM6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdGlmICghZXh0ZW5zaW9uLmlzU2lnbmVkKSB7XG5cdFx0XHRyZXR1cm4geyBsb2NhdGlvbiwgdmVyaWZpY2F0aW9uU3RhdHVzOiBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlLk5vdFNpZ25lZCB9O1xuXHRcdH1cblxuXHRcdGxldCBzaWduYXR1cmVBcmNoaXZlTG9jYXRpb247XG5cdFx0dHJ5IHtcblx0XHRcdHNpZ25hdHVyZUFyY2hpdmVMb2NhdGlvbiA9IGF3YWl0IHRoaXMuZG93bmxvYWRTaWduYXR1cmVBcmNoaXZlKGV4dGVuc2lvbik7XG5cdFx0XHRjb25zdCB2ZXJpZmljYXRpb25TdGF0dXMgPSAoYXdhaXQgdGhpcy5leHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25TZXJ2aWNlLnZlcmlmeShleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uLnZlcnNpb24sIGxvY2F0aW9uLmZzUGF0aCwgc2lnbmF0dXJlQXJjaGl2ZUxvY2F0aW9uLmZzUGF0aCwgY2xpZW50VGFyZ2V0UGxhdGZvcm0pKT8uY29kZTtcblx0XHRcdGlmICh2ZXJpZmljYXRpb25TdGF0dXMgPT09IEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUuUGFja2FnZUlzSW52YWxpZFppcCB8fCB2ZXJpZmljYXRpb25TdGF0dXMgPT09IEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUuU2lnbmF0dXJlQXJjaGl2ZUlzSW52YWxpZFppcCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIERlbGV0ZSB0aGUgZG93bmxvYWRlZCB2c2l4IGlmIFZTSVggb3Igc2lnbmF0dXJlIGFyY2hpdmUgaXMgaW52YWxpZFxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZGVsZXRlKGxvY2F0aW9uKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoQ29ycnVwdFppcE1lc3NhZ2UsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuQ29ycnVwdFppcCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBsb2NhdGlvbiwgdmVyaWZpY2F0aW9uU3RhdHVzIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIERlbGV0ZSB0aGUgZG93bmxvYWRlZCBWU0lYIGlmIHNpZ25hdHVyZSBhcmNoaXZlIGRvd25sb2FkIGZhaWxzXG5cdFx0XHRcdGF3YWl0IHRoaXMuZGVsZXRlKGxvY2F0aW9uKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHNpZ25hdHVyZUFyY2hpdmVMb2NhdGlvbikge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIERlbGV0ZSBzaWduYXR1cmUgYXJjaGl2ZSBhbHdheXNcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRlbGV0ZShzaWduYXR1cmVBcmNoaXZlTG9jYXRpb24pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvd25sb2FkVlNJWChleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBvcGVyYXRpb246IEluc3RhbGxPcGVyYXRpb24pOiBQcm9taXNlPFVSST4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBsb2NhdGlvbiA9IGpvaW5QYXRoKHRoaXMuZXh0ZW5zaW9uc0Rvd25sb2FkRGlyLCB0aGlzLmdldE5hbWUoZXh0ZW5zaW9uKSk7XG5cdFx0XHRjb25zdCBhdHRlbXB0cyA9IGF3YWl0IHRoaXMuZG9Eb3dubG9hZChleHRlbnNpb24sICd2c2l4JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvd25sb2FkRmlsZShleHRlbnNpb24sIGxvY2F0aW9uLCBsb2NhdGlvbiA9PiB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmRvd25sb2FkKGV4dGVuc2lvbiwgbG9jYXRpb24sIG9wZXJhdGlvbikpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudmFsaWRhdGUobG9jYXRpb24uZnNQYXRoLCAnZXh0ZW5zaW9uL3BhY2thZ2UuanNvbicpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChsb2NhdGlvbik7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEVycm9yIHdoaWxlIGRlbGV0aW5nOiAke2xvY2F0aW9uLnBhdGh9YCwgZ2V0RXJyb3JNZXNzYWdlKGUpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDIpO1xuXG5cdFx0XHRpZiAoYXR0ZW1wdHMgPiAxKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFJldHJ5RG93bmxvYWRFdmVudCwgUmV0cnlEb3dubG9hZENsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uZ2FsbGVyeTpkb3dubG9hZHZzaXg6cmV0cnknLCB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLFxuXHRcdFx0XHRcdGF0dGVtcHRzXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbG9jYXRpb247XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhyb3cgdG9FeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IoZSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5Eb3dubG9hZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb3dubG9hZFNpZ25hdHVyZUFyY2hpdmUoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbik6IFByb21pc2U8VVJJPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxvY2F0aW9uID0gam9pblBhdGgodGhpcy5leHRlbnNpb25zRG93bmxvYWREaXIsIGAke3RoaXMuZ2V0TmFtZShleHRlbnNpb24pfSR7RXh0ZW5zaW9uc0Rvd25sb2FkZXIuU2lnbmF0dXJlQXJjaGl2ZUV4dGVuc2lvbn1gKTtcblx0XHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgdGhpcy5kb0Rvd25sb2FkKGV4dGVuc2lvbiwgJ3NpZ3ppcCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5kb3dubG9hZFNpZ25hdHVyZUFyY2hpdmUoZXh0ZW5zaW9uLCBsb2NhdGlvbik7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy52YWxpZGF0ZShsb2NhdGlvbi5mc1BhdGgsICcuc2lnbmF0dXJlLnA3cycpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChsb2NhdGlvbik7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEVycm9yIHdoaWxlIGRlbGV0aW5nOiAke2xvY2F0aW9uLnBhdGh9YCwgZ2V0RXJyb3JNZXNzYWdlKGUpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDIpO1xuXG5cdFx0XHRpZiAoYXR0ZW1wdHMgPiAxKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFJldHJ5RG93bmxvYWRFdmVudCwgUmV0cnlEb3dubG9hZENsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uZ2FsbGVyeTpkb3dubG9hZHNpZ3ppcDpyZXRyeScsIHtcblx0XHRcdFx0XHRleHRlbnNpb25JZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsXG5cdFx0XHRcdFx0YXR0ZW1wdHNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBsb2NhdGlvbjtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aHJvdyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkRvd25sb2FkU2lnbmF0dXJlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvd25sb2FkRmlsZShleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBsb2NhdGlvbjogVVJJLCBkb3dubG9hZEZuOiAobG9jYXRpb246IFVSSSkgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIERvIG5vdCBkb3dubG9hZCBpZiBleGlzdHNcblx0XHRpZiAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMobG9jYXRpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRG93bmxvYWQgZGlyZWN0bHkgaWYgbG9jYWl0b24gaXMgbm90IGZpbGUgc2NoZW1lXG5cdFx0aWYgKGxvY2F0aW9uLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRhd2FpdCBkb3dubG9hZEZuKGxvY2F0aW9uKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEb3dubG9hZCB0byB0ZW1wb3JhcnkgbG9jYXRpb24gZmlyc3Qgb25seSBpZiBmaWxlIGRvZXMgbm90IGV4aXN0XG5cdFx0Y29uc3QgdGVtcExvY2F0aW9uID0gam9pblBhdGgodGhpcy5leHRlbnNpb25zRG93bmxvYWREaXIsIGAuJHtnZW5lcmF0ZVV1aWQoKX1gKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZG93bmxvYWRGbih0ZW1wTG9jYXRpb24pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbCh0ZW1wTG9jYXRpb24pO1xuXHRcdFx0fSBjYXRjaCAoZSkgeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIFJlbmFtZSB0ZW1wIGxvY2F0aW9uIHRvIG9yaWdpbmFsXG5cdFx0XHRhd2FpdCBGU1Byb21pc2VzLnJlbmFtZSh0ZW1wTG9jYXRpb24uZnNQYXRoLCBsb2NhdGlvbi5mc1BhdGgsIDIgKiA2MCAqIDEwMDAgLyogUmV0cnkgZm9yIDIgbWludXRlcyAqLyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRyeSB7IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHRlbXBMb2NhdGlvbik7IH0gY2F0Y2ggKGUpIHsgLyogaWdub3JlICovIH1cblx0XHRcdGxldCBleGlzdHMgPSBmYWxzZTtcblx0XHRcdHRyeSB7IGV4aXN0cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKGxvY2F0aW9uKTsgfSBjYXRjaCAoZSkgeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0aWYgKGV4aXN0cykge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgUmVuYW1lIGZhaWxlZCBiZWNhdXNlIHRoZSBmaWxlIHdhcyBkb3dubG9hZGVkIGJ5IGFub3RoZXIgc291cmNlLiBTbyBpZ25vcmluZyByZW5hbWluZy5gLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgbG9jYXRpb24ucGF0aCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgUmVuYW1lIGZhaWxlZCBiZWNhdXNlIG9mICR7Z2V0RXJyb3JNZXNzYWdlKGVycm9yKX0uIERlbGV0ZWQgdGhlIGZpbGUgZnJvbSBkb3dubG9hZGVkIGxvY2F0aW9uYCwgdGVtcExvY2F0aW9uLnBhdGgpO1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvRG93bmxvYWQoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgbmFtZTogc3RyaW5nLCBkb3dubG9hZEZuOiAoKSA9PiBQcm9taXNlPHZvaWQ+LCByZXRyaWVzOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGxldCBhdHRlbXB0cyA9IDE7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGRvd25sb2FkRm4oKTtcblx0XHRcdFx0cmV0dXJuIGF0dGVtcHRzO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRpZiAoYXR0ZW1wdHMrKyA+IHJldHJpZXMpIHtcblx0XHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBGYWlsZWQgZG93bmxvYWRpbmcgJHtuYW1lfS4gJHtnZXRFcnJvck1lc3NhZ2UoZSl9LiBSZXRyeSBhZ2Fpbi4uLmAsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgdmFsaWRhdGUoemlwUGF0aDogc3RyaW5nLCBmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGJ1ZmZlcih6aXBQYXRoLCBmaWxlUGF0aCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhyb3cgZnJvbUV4dHJhY3RFcnJvcihlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBkZWxldGUobG9jYXRpb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuY2xlYW5VcFByb21pc2U7XG5cdFx0Y29uc3QgdHJhc2hSZWxhdGl2ZVBhdGggPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkucmVsYXRpdmVQYXRoKHRoaXMuZXh0ZW5zaW9uc0Rvd25sb2FkRGlyLCBsb2NhdGlvbik7XG5cdFx0aWYgKHRyYXNoUmVsYXRpdmVQYXRoKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLm1vdmUobG9jYXRpb24sIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aCh0aGlzLmV4dGVuc2lvbnNUcmFzaERpciwgdHJhc2hSZWxhdGl2ZVBhdGgpLCB0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwobG9jYXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2xlYW5VcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHModGhpcy5leHRlbnNpb25zRG93bmxvYWREaXIpKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dGVuc2lvbiBWU0lYIGRvd25sb2FkcyBjYWNoZSBkaXIgZG9lcyBub3QgZXhpc3QnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbCh0aGlzLmV4dGVuc2lvbnNUcmFzaERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZm9sZGVyU3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZSh0aGlzLmV4dGVuc2lvbnNEb3dubG9hZERpciwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0XHRpZiAoZm9sZGVyU3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHRjb25zdCB0b0RlbGV0ZTogVVJJW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgdnNpeHM6IFtFeHRlbnNpb25LZXksIElGaWxlU3RhdFdpdGhNZXRhZGF0YV1bXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBzaWduYXR1cmVBcmNoaXZlczogVVJJW10gPSBbXTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHN0YXQgb2YgZm9sZGVyU3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGlmIChzdGF0Lm5hbWUuZW5kc1dpdGgoRXh0ZW5zaW9uc0Rvd25sb2FkZXIuU2lnbmF0dXJlQXJjaGl2ZUV4dGVuc2lvbikpIHtcblx0XHRcdFx0XHRcdHNpZ25hdHVyZUFyY2hpdmVzLnB1c2goc3RhdC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IEV4dGVuc2lvbktleS5wYXJzZShzdGF0Lm5hbWUpO1xuXHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0XHR2c2l4cy5wdXNoKFtleHRlbnNpb24sIHN0YXRdKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBieUV4dGVuc2lvbiA9IGdyb3VwQnlFeHRlbnNpb24odnNpeHMsIChbZXh0ZW5zaW9uXSkgPT4gZXh0ZW5zaW9uKTtcblx0XHRcdFx0Y29uc3QgZGlzdGluY3Q6IElGaWxlU3RhdFdpdGhNZXRhZGF0YVtdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgcCBvZiBieUV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHAuc29ydCgoYSwgYikgPT4gc2VtdmVyLnJjb21wYXJlKGFbMF0udmVyc2lvbiwgYlswXS52ZXJzaW9uKSk7XG5cdFx0XHRcdFx0dG9EZWxldGUucHVzaCguLi5wLnNsaWNlKDEpLm1hcChlID0+IGVbMV0ucmVzb3VyY2UpKTsgLy8gRGVsZXRlIG91dGRhdGVkIGV4dGVuc2lvbnNcblx0XHRcdFx0XHRkaXN0aW5jdC5wdXNoKHBbMF1bMV0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRpc3RpbmN0LnNvcnQoKGEsIGIpID0+IGEubXRpbWUgLSBiLm10aW1lKTsgLy8gc29ydCBieSBtb2RpZmllZCB0aW1lXG5cdFx0XHRcdHRvRGVsZXRlLnB1c2goLi4uZGlzdGluY3Quc2xpY2UoMCwgTWF0aC5tYXgoMCwgZGlzdGluY3QubGVuZ3RoIC0gdGhpcy5jYWNoZSkpLm1hcChzID0+IHMucmVzb3VyY2UpKTsgLy8gUmV0YWluIG1pbmltdW0gY2FjaGVTaXplIGFuZCBkZWxldGUgdGhlIHJlc3Rcblx0XHRcdFx0dG9EZWxldGUucHVzaCguLi5zaWduYXR1cmVBcmNoaXZlcyk7IC8vIERlbGV0ZSBhbGwgc2lnbmF0dXJlIGFyY2hpdmVzXG5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZCh0b0RlbGV0ZS5tYXAocmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRGVsZXRpbmcgZnJvbSBjYWNoZScsIHJlc291cmNlLnBhdGgpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmZpbGVTZXJ2aWNlLmRlbChyZXNvdXJjZSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXROYW1lKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24pOiBzdHJpbmcge1xuXHRcdHJldHVybiBFeHRlbnNpb25LZXkuY3JlYXRlKGV4dGVuc2lvbikudG9TdHJpbmcoKS50b0xvd2VyQ2FzZSgpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksWUFBWTtBQUV4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFlBQVksa0JBQWtCO0FBQ3ZDLFNBQVMsUUFBUSx5QkFBeUI7QUFDMUMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywwQkFBMEIsOEJBQThCLG9DQUFvQyxnQ0FBcUU7QUFDMUssU0FBUyxjQUFjLHdCQUF3QjtBQUMvQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDhDQUE4QztBQUV2RCxTQUFTLHFCQUFxQixjQUFxQyw2QkFBNkI7QUFDaEcsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBMkI7QUFhN0IsSUFBTSx1QkFBTixjQUFtQyxXQUFXO0FBQUEsRUFTcEQsWUFDNEIsb0JBQ0ksYUFDWSx5QkFDYyx1Q0FDckIsa0JBQ0Usb0JBQ1IsWUFDN0I7QUFDRCxVQUFNO0FBUHlCO0FBQ1k7QUFDYztBQUNyQjtBQUNFO0FBQ1I7QUFHOUIsU0FBSyx3QkFBd0IsbUJBQW1CO0FBQ2hELFNBQUsscUJBQXFCLG1CQUFtQixPQUFPLFNBQVMsbUJBQW1CLDRCQUE0QixRQUFRO0FBQ3BILFNBQUssUUFBUTtBQUNiLFNBQUssaUJBQWlCLEtBQUssUUFBUTtBQUFBLEVBQ3BDO0FBQUEsRUFFQSxNQUFNLFNBQVMsV0FBOEIsV0FBNkIsaUJBQTBCLHNCQUF5SjtBQUM1UCxVQUFNLEtBQUs7QUFFWCxVQUFNLFdBQVcsTUFBTSxLQUFLLGFBQWEsV0FBVyxTQUFTO0FBRTdELFFBQUksQ0FBQyxpQkFBaUI7QUFDckIsYUFBTyxFQUFFLFVBQVUsb0JBQW9CLE9BQVU7QUFBQSxJQUNsRDtBQUVBLFFBQUksQ0FBQyxVQUFVLFVBQVU7QUFDeEIsYUFBTyxFQUFFLFVBQVUsb0JBQW9CLG1DQUFtQyxVQUFVO0FBQUEsSUFDckY7QUFFQSxRQUFJO0FBQ0osUUFBSTtBQUNILGlDQUEyQixNQUFNLEtBQUsseUJBQXlCLFNBQVM7QUFDeEUsWUFBTSxzQkFBc0IsTUFBTSxLQUFLLHNDQUFzQyxPQUFPLFVBQVUsV0FBVyxJQUFJLFVBQVUsU0FBUyxTQUFTLFFBQVEseUJBQXlCLFFBQVEsb0JBQW9CLElBQUk7QUFDMU0sVUFBSSx1QkFBdUIsbUNBQW1DLHVCQUF1Qix1QkFBdUIsbUNBQW1DLDhCQUE4QjtBQUM1SyxZQUFJO0FBRUgsZ0JBQU0sS0FBSyxPQUFPLFFBQVE7QUFBQSxRQUMzQixTQUFTLE9BQU87QUFDZixlQUFLLFdBQVcsTUFBTSxLQUFLO0FBQUEsUUFDNUI7QUFDQSxjQUFNLElBQUkseUJBQXlCLG1CQUFtQiw2QkFBNkIsVUFBVTtBQUFBLE1BQzlGO0FBQ0EsYUFBTyxFQUFFLFVBQVUsbUJBQW1CO0FBQUEsSUFDdkMsU0FBUyxPQUFPO0FBQ2YsVUFBSTtBQUVILGNBQU0sS0FBSyxPQUFPLFFBQVE7QUFBQSxNQUMzQixTQUFTQSxRQUFPO0FBQ2YsYUFBSyxXQUFXLE1BQU1BLE1BQUs7QUFBQSxNQUM1QjtBQUNBLFlBQU07QUFBQSxJQUNQLFVBQUU7QUFDRCxVQUFJLDBCQUEwQjtBQUM3QixZQUFJO0FBRUgsZ0JBQU0sS0FBSyxPQUFPLHdCQUF3QjtBQUFBLFFBQzNDLFNBQVMsT0FBTztBQUNmLGVBQUssV0FBVyxNQUFNLEtBQUs7QUFBQSxRQUM1QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxhQUFhLFdBQThCLFdBQTJDO0FBQ25HLFFBQUk7QUFDSCxZQUFNLFdBQVcsU0FBUyxLQUFLLHVCQUF1QixLQUFLLFFBQVEsU0FBUyxDQUFDO0FBQzdFLFlBQU0sV0FBVyxNQUFNLEtBQUssV0FBVyxXQUFXLFFBQVEsWUFBWTtBQUNyRSxjQUFNLEtBQUssYUFBYSxXQUFXLFVBQVUsQ0FBQUMsY0FBWSxLQUFLLHdCQUF3QixTQUFTLFdBQVdBLFdBQVUsU0FBUyxDQUFDO0FBQzlILFlBQUk7QUFDSCxnQkFBTSxLQUFLLFNBQVMsU0FBUyxRQUFRLHdCQUF3QjtBQUFBLFFBQzlELFNBQVMsT0FBTztBQUNmLGNBQUk7QUFDSCxrQkFBTSxLQUFLLFlBQVksSUFBSSxRQUFRO0FBQUEsVUFDcEMsU0FBUyxHQUFHO0FBQ1gsaUJBQUssV0FBVyxLQUFLLHlCQUF5QixTQUFTLElBQUksSUFBSSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQUEsVUFDbEY7QUFDQSxnQkFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNELEdBQUcsQ0FBQztBQUVKLFVBQUksV0FBVyxHQUFHO0FBQ2pCLGFBQUssaUJBQWlCLFdBQTRELHVDQUF1QztBQUFBLFVBQ3hILGFBQWEsVUFBVSxXQUFXO0FBQUEsVUFDbEM7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBRUEsYUFBTztBQUFBLElBQ1IsU0FBUyxHQUFHO0FBQ1gsWUFBTSwyQkFBMkIsR0FBRyw2QkFBNkIsUUFBUTtBQUFBLElBQzFFO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyx5QkFBeUIsV0FBNEM7QUFDbEYsUUFBSTtBQUNILFlBQU0sV0FBVyxTQUFTLEtBQUssdUJBQXVCLEdBQUcsS0FBSyxRQUFRLFNBQVMsQ0FBQyxHQUFHLHFCQUFxQix5QkFBeUIsRUFBRTtBQUNuSSxZQUFNLFdBQVcsTUFBTSxLQUFLLFdBQVcsV0FBVyxVQUFVLFlBQVk7QUFDdkUsY0FBTSxLQUFLLHdCQUF3Qix5QkFBeUIsV0FBVyxRQUFRO0FBQy9FLFlBQUk7QUFDSCxnQkFBTSxLQUFLLFNBQVMsU0FBUyxRQUFRLGdCQUFnQjtBQUFBLFFBQ3RELFNBQVMsT0FBTztBQUNmLGNBQUk7QUFDSCxrQkFBTSxLQUFLLFlBQVksSUFBSSxRQUFRO0FBQUEsVUFDcEMsU0FBUyxHQUFHO0FBQ1gsaUJBQUssV0FBVyxLQUFLLHlCQUF5QixTQUFTLElBQUksSUFBSSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQUEsVUFDbEY7QUFDQSxnQkFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNELEdBQUcsQ0FBQztBQUVKLFVBQUksV0FBVyxHQUFHO0FBQ2pCLGFBQUssaUJBQWlCLFdBQTRELHlDQUF5QztBQUFBLFVBQzFILGFBQWEsVUFBVSxXQUFXO0FBQUEsVUFDbEM7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBRUEsYUFBTztBQUFBLElBQ1IsU0FBUyxHQUFHO0FBQ1gsWUFBTSwyQkFBMkIsR0FBRyw2QkFBNkIsaUJBQWlCO0FBQUEsSUFDbkY7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGFBQWEsV0FBOEIsVUFBZSxZQUE2RDtBQUVwSSxRQUFJLE1BQU0sS0FBSyxZQUFZLE9BQU8sUUFBUSxHQUFHO0FBQzVDO0FBQUEsSUFDRDtBQUdBLFFBQUksU0FBUyxXQUFXLFFBQVEsTUFBTTtBQUNyQyxZQUFNLFdBQVcsUUFBUTtBQUN6QjtBQUFBLElBQ0Q7QUFHQSxVQUFNLGVBQWUsU0FBUyxLQUFLLHVCQUF1QixJQUFJLGFBQWEsQ0FBQyxFQUFFO0FBQzlFLFFBQUk7QUFDSCxZQUFNLFdBQVcsWUFBWTtBQUFBLElBQzlCLFNBQVMsT0FBTztBQUNmLFVBQUk7QUFDSCxjQUFNLEtBQUssWUFBWSxJQUFJLFlBQVk7QUFBQSxNQUN4QyxTQUFTLEdBQUc7QUFBQSxNQUFlO0FBQzNCLFlBQU07QUFBQSxJQUNQO0FBRUEsUUFBSTtBQUVILFlBQU0sV0FBVztBQUFBLFFBQU8sYUFBYTtBQUFBLFFBQVEsU0FBUztBQUFBLFFBQVEsSUFBSSxLQUFLO0FBQUE7QUFBQSxNQUE4QjtBQUFBLElBQ3RHLFNBQVMsT0FBTztBQUNmLFVBQUk7QUFBRSxjQUFNLEtBQUssWUFBWSxJQUFJLFlBQVk7QUFBQSxNQUFHLFNBQVMsR0FBRztBQUFBLE1BQWU7QUFDM0UsVUFBSSxTQUFTO0FBQ2IsVUFBSTtBQUFFLGlCQUFTLE1BQU0sS0FBSyxZQUFZLE9BQU8sUUFBUTtBQUFBLE1BQUcsU0FBUyxHQUFHO0FBQUEsTUFBZTtBQUNuRixVQUFJLFFBQVE7QUFDWCxhQUFLLFdBQVcsS0FBSywwRkFBMEYsVUFBVSxXQUFXLElBQUksU0FBUyxJQUFJO0FBQUEsTUFDdEosT0FBTztBQUNOLGFBQUssV0FBVyxLQUFLLDRCQUE0QixnQkFBZ0IsS0FBSyxDQUFDLCtDQUErQyxhQUFhLElBQUk7QUFDdkksY0FBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxXQUFXLFdBQThCLE1BQWMsWUFBaUMsU0FBa0M7QUFDdkksUUFBSSxXQUFXO0FBQ2YsV0FBTyxNQUFNO0FBQ1osVUFBSTtBQUNILGNBQU0sV0FBVztBQUNqQixlQUFPO0FBQUEsTUFDUixTQUFTLEdBQUc7QUFDWCxZQUFJLGFBQWEsU0FBUztBQUN6QixnQkFBTTtBQUFBLFFBQ1A7QUFDQSxhQUFLLFdBQVcsS0FBSyxzQkFBc0IsSUFBSSxLQUFLLGdCQUFnQixDQUFDLENBQUMsb0JBQW9CLFVBQVUsV0FBVyxFQUFFO0FBQUEsTUFDbEg7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBZ0IsU0FBUyxTQUFpQixVQUFpQztBQUMxRSxRQUFJO0FBQ0gsWUFBTSxPQUFPLFNBQVMsUUFBUTtBQUFBLElBQy9CLFNBQVMsR0FBRztBQUNYLFlBQU0saUJBQWlCLENBQUM7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sT0FBTyxVQUE4QjtBQUMxQyxVQUFNLEtBQUs7QUFDWCxVQUFNLG9CQUFvQixLQUFLLG1CQUFtQixPQUFPLGFBQWEsS0FBSyx1QkFBdUIsUUFBUTtBQUMxRyxRQUFJLG1CQUFtQjtBQUN0QixZQUFNLEtBQUssWUFBWSxLQUFLLFVBQVUsS0FBSyxtQkFBbUIsT0FBTyxTQUFTLEtBQUssb0JBQW9CLGlCQUFpQixHQUFHLElBQUk7QUFBQSxJQUNoSSxPQUFPO0FBQ04sWUFBTSxLQUFLLFlBQVksSUFBSSxRQUFRO0FBQUEsSUFDcEM7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLFVBQXlCO0FBQ3RDLFFBQUk7QUFDSCxVQUFJLENBQUUsTUFBTSxLQUFLLFlBQVksT0FBTyxLQUFLLHFCQUFxQixHQUFJO0FBQ2pFLGFBQUssV0FBVyxNQUFNLG1EQUFtRDtBQUN6RTtBQUFBLE1BQ0Q7QUFFQSxVQUFJO0FBQ0gsY0FBTSxLQUFLLFlBQVksSUFBSSxLQUFLLG9CQUFvQixFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQUEsTUFDeEUsU0FBUyxPQUFPO0FBQ2YsWUFBSSxzQkFBc0IsS0FBSyxNQUFNLG9CQUFvQixnQkFBZ0I7QUFDeEUsZUFBSyxXQUFXLE1BQU0sS0FBSztBQUFBLFFBQzVCO0FBQUEsTUFDRDtBQUVBLFlBQU0sYUFBYSxNQUFNLEtBQUssWUFBWSxRQUFRLEtBQUssdUJBQXVCLEVBQUUsaUJBQWlCLEtBQUssQ0FBQztBQUN2RyxVQUFJLFdBQVcsVUFBVTtBQUN4QixjQUFNLFdBQWtCLENBQUM7QUFDekIsY0FBTSxRQUFpRCxDQUFDO0FBQ3hELGNBQU0sb0JBQTJCLENBQUM7QUFFbEMsbUJBQVcsUUFBUSxXQUFXLFVBQVU7QUFDdkMsY0FBSSxLQUFLLEtBQUssU0FBUyxxQkFBcUIseUJBQXlCLEdBQUc7QUFDdkUsOEJBQWtCLEtBQUssS0FBSyxRQUFRO0FBQUEsVUFDckMsT0FBTztBQUNOLGtCQUFNLFlBQVksYUFBYSxNQUFNLEtBQUssSUFBSTtBQUM5QyxnQkFBSSxXQUFXO0FBQ2Qsb0JBQU0sS0FBSyxDQUFDLFdBQVcsSUFBSSxDQUFDO0FBQUEsWUFDN0I7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUVBLGNBQU0sY0FBYyxpQkFBaUIsT0FBTyxDQUFDLENBQUMsU0FBUyxNQUFNLFNBQVM7QUFDdEUsY0FBTSxXQUFvQyxDQUFDO0FBQzNDLG1CQUFXLEtBQUssYUFBYTtBQUM1QixZQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sT0FBTyxTQUFTLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsT0FBTyxDQUFDO0FBQzVELG1CQUFTLEtBQUssR0FBRyxFQUFFLE1BQU0sQ0FBQyxFQUFFLElBQUksT0FBSyxFQUFFLENBQUMsRUFBRSxRQUFRLENBQUM7QUFDbkQsbUJBQVMsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7QUFBQSxRQUN0QjtBQUNBLGlCQUFTLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxRQUFRLEVBQUUsS0FBSztBQUN6QyxpQkFBUyxLQUFLLEdBQUcsU0FBUyxNQUFNLEdBQUcsS0FBSyxJQUFJLEdBQUcsU0FBUyxTQUFTLEtBQUssS0FBSyxDQUFDLEVBQUUsSUFBSSxPQUFLLEVBQUUsUUFBUSxDQUFDO0FBQ2xHLGlCQUFTLEtBQUssR0FBRyxpQkFBaUI7QUFFbEMsY0FBTSxTQUFTLFFBQVEsU0FBUyxJQUFJLGNBQVk7QUFDL0MsZUFBSyxXQUFXLE1BQU0sdUJBQXVCLFNBQVMsSUFBSTtBQUMxRCxpQkFBTyxLQUFLLFlBQVksSUFBSSxRQUFRO0FBQUEsUUFDckMsQ0FBQyxDQUFDO0FBQUEsTUFDSDtBQUFBLElBQ0QsU0FBUyxHQUFHO0FBQ1gsV0FBSyxXQUFXLE1BQU0sQ0FBQztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUFBLEVBRVEsUUFBUSxXQUFzQztBQUNyRCxXQUFPLGFBQWEsT0FBTyxTQUFTLEVBQUUsU0FBUyxFQUFFLFlBQVk7QUFBQSxFQUM5RDtBQUVEO0FBclFhLHFCQUVZLDRCQUE0QjtBQUZ4Qyx1QkFBTjtBQUFBLEVBVUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWhCVTsiLAogICJuYW1lcyI6IFsiZXJyb3IiLCAibG9jYXRpb24iXQp9Cg==
