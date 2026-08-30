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
import { isNonEmptyArray } from "../../../base/common/arrays.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Event } from "../../../base/common/event.js";
import { parse } from "../../../base/common/json.js";
import { OperatingSystem, OS } from "../../../base/common/platform.js";
import { isUndefined } from "../../../base/common/types.js";
import { localize } from "../../../nls.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationResult, IFileService } from "../../files/common/files.js";
import { IStorageService } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { AbstractInitializer, AbstractJsonFileSynchroniser } from "./abstractSynchronizer.js";
import { merge } from "./keybindingsMerge.js";
import { Change, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, IUserDataSyncUtilService, SyncResource, UserDataSyncError, UserDataSyncErrorCode, USER_DATA_SYNC_SCHEME, CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM } from "./userDataSync.js";
function getKeybindingsContentFromSyncContent(syncContent, platformSpecific, logService) {
  try {
    const parsed = JSON.parse(syncContent);
    if (!platformSpecific) {
      return isUndefined(parsed.all) ? null : parsed.all;
    }
    switch (OS) {
      case OperatingSystem.Macintosh:
        return isUndefined(parsed.mac) ? null : parsed.mac;
      case OperatingSystem.Linux:
        return isUndefined(parsed.linux) ? null : parsed.linux;
      case OperatingSystem.Windows:
        return isUndefined(parsed.windows) ? null : parsed.windows;
    }
  } catch (e) {
    logService.error(e);
    return null;
  }
}
let KeybindingsSynchroniser = class extends AbstractJsonFileSynchroniser {
  constructor(profile, collection, userDataSyncStoreService, userDataSyncLocalStoreService, logService, configurationService, userDataSyncEnablementService, fileService, environmentService, storageService, userDataSyncUtilService, telemetryService, uriIdentityService) {
    super(profile.keybindingsResource, { syncResource: SyncResource.Keybindings, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, userDataSyncUtilService, configurationService, uriIdentityService);
    /* Version 2: Change settings from `sync.${setting}` to `settingsSync.{setting}` */
    this.version = 2;
    this.previewResource = this.extUri.joinPath(this.syncPreviewFolder, "keybindings.json");
    this.baseResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" });
    this.localResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" });
    this.remoteResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" });
    this.acceptedResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" });
    this._register(Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("settingsSync.keybindingsPerPlatform"))(() => this.triggerLocalChange()));
  }
  async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine, userDataSyncConfiguration) {
    const remoteContent = remoteUserData.syncData ? getKeybindingsContentFromSyncContent(remoteUserData.syncData.content, userDataSyncConfiguration.keybindingsPerPlatform ?? this.syncKeybindingsPerPlatform(), this.logService) : null;
    lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
    const lastSyncContent = lastSyncUserData ? this.getKeybindingsContentFromLastSyncUserData(lastSyncUserData) : null;
    const fileContent = await this.getLocalFileContent();
    const formattingOptions = await this.getFormattingOptions();
    let mergedContent = null;
    let hasLocalChanged = false;
    let hasRemoteChanged = false;
    let hasConflicts = false;
    if (remoteContent) {
      let localContent2 = fileContent ? fileContent.value.toString() : "[]";
      localContent2 = localContent2 || "[]";
      if (this.hasErrors(localContent2, true)) {
        throw new UserDataSyncError(localize("errorInvalidSettings", "Unable to sync keybindings because the content in the file is not valid. Please open the file and correct it."), UserDataSyncErrorCode.LocalInvalidContent, this.resource);
      }
      if (!lastSyncContent || lastSyncContent !== localContent2 || lastSyncContent !== remoteContent) {
        this.logService.trace(`${this.syncResourceLogLabel}: Merging remote keybindings with local keybindings...`);
        const result = await merge(localContent2, remoteContent, lastSyncContent, formattingOptions, this.userDataSyncUtilService);
        if (result.hasChanges) {
          mergedContent = result.mergeContent;
          hasConflicts = result.hasConflicts;
          hasLocalChanged = hasConflicts || result.mergeContent !== localContent2;
          hasRemoteChanged = hasConflicts || result.mergeContent !== remoteContent;
        }
      }
    } else if (fileContent) {
      this.logService.trace(`${this.syncResourceLogLabel}: Remote keybindings does not exist. Synchronizing keybindings for the first time.`);
      mergedContent = fileContent.value.toString();
      hasRemoteChanged = true;
    }
    const previewResult = {
      content: hasConflicts ? lastSyncContent : mergedContent,
      localChange: hasLocalChanged ? fileContent ? Change.Modified : Change.Added : Change.None,
      remoteChange: hasRemoteChanged ? Change.Modified : Change.None,
      hasConflicts
    };
    const localContent = fileContent ? fileContent.value.toString() : null;
    return [{
      fileContent,
      baseResource: this.baseResource,
      baseContent: lastSyncContent,
      localResource: this.localResource,
      localContent,
      localChange: previewResult.localChange,
      remoteResource: this.remoteResource,
      remoteContent,
      remoteChange: previewResult.remoteChange,
      previewResource: this.previewResource,
      previewResult,
      acceptedResource: this.acceptedResource
    }];
  }
  async hasRemoteChanged(lastSyncUserData) {
    const lastSyncContent = this.getKeybindingsContentFromLastSyncUserData(lastSyncUserData);
    if (lastSyncContent === null) {
      return true;
    }
    const fileContent = await this.getLocalFileContent();
    const localContent = fileContent ? fileContent.value.toString() : "";
    const formattingOptions = await this.getFormattingOptions();
    const result = await merge(localContent || "[]", lastSyncContent, lastSyncContent, formattingOptions, this.userDataSyncUtilService);
    return result.hasConflicts || result.mergeContent !== lastSyncContent;
  }
  async getMergeResult(resourcePreview, token) {
    return resourcePreview.previewResult;
  }
  async getAcceptResult(resourcePreview, resource, content, token) {
    if (this.extUri.isEqual(resource, this.localResource)) {
      return {
        content: resourcePreview.fileContent ? resourcePreview.fileContent.value.toString() : null,
        localChange: Change.None,
        remoteChange: Change.Modified
      };
    }
    if (this.extUri.isEqual(resource, this.remoteResource)) {
      return {
        content: resourcePreview.remoteContent,
        localChange: Change.Modified,
        remoteChange: Change.None
      };
    }
    if (this.extUri.isEqual(resource, this.previewResource)) {
      if (content === void 0) {
        return {
          content: resourcePreview.previewResult.content,
          localChange: resourcePreview.previewResult.localChange,
          remoteChange: resourcePreview.previewResult.remoteChange
        };
      } else {
        return {
          content,
          localChange: Change.Modified,
          remoteChange: Change.Modified
        };
      }
    }
    throw new Error(`Invalid Resource: ${resource.toString()}`);
  }
  async applyResult(remoteUserData, lastSyncUserData, resourcePreviews, force) {
    const { fileContent } = resourcePreviews[0][0];
    let { content, localChange, remoteChange } = resourcePreviews[0][1];
    if (localChange === Change.None && remoteChange === Change.None) {
      this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing keybindings.`);
    }
    if (content !== null) {
      content = content.trim();
      content = content || "[]";
      if (this.hasErrors(content, true)) {
        throw new UserDataSyncError(localize("errorInvalidSettings", "Unable to sync keybindings because the content in the file is not valid. Please open the file and correct it."), UserDataSyncErrorCode.LocalInvalidContent, this.resource);
      }
    }
    if (localChange !== Change.None) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating local keybindings...`);
      if (fileContent) {
        await this.backupLocal(this.toSyncContent(fileContent.value.toString()));
      }
      await this.updateLocalFileContent(content || "[]", fileContent, force);
      this.logService.info(`${this.syncResourceLogLabel}: Updated local keybindings`);
    }
    if (remoteChange !== Change.None) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating remote keybindings...`);
      const remoteContents = this.toSyncContent(content || "[]", remoteUserData.syncData?.content);
      remoteUserData = await this.updateRemoteUserData(remoteContents, force ? null : remoteUserData.ref);
      this.logService.info(`${this.syncResourceLogLabel}: Updated remote keybindings`);
    }
    try {
      await this.fileService.del(this.previewResource);
    } catch (e) {
    }
    if (lastSyncUserData?.ref !== remoteUserData.ref) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized keybindings...`);
      await this.updateLastSyncUserData(remoteUserData, { platformSpecific: this.syncKeybindingsPerPlatform() });
      this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized keybindings`);
    }
  }
  async hasLocalData() {
    try {
      const localFileContent = await this.getLocalFileContent();
      if (localFileContent) {
        const keybindings = parse(localFileContent.value.toString());
        if (isNonEmptyArray(keybindings)) {
          return true;
        }
      }
    } catch (error) {
      if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
        return true;
      }
    }
    return false;
  }
  async resolveContent(uri) {
    if (this.extUri.isEqual(this.remoteResource, uri) || this.extUri.isEqual(this.baseResource, uri) || this.extUri.isEqual(this.localResource, uri) || this.extUri.isEqual(this.acceptedResource, uri)) {
      return this.resolvePreviewContent(uri);
    }
    return null;
  }
  getKeybindingsContentFromLastSyncUserData(lastSyncUserData) {
    if (!lastSyncUserData.syncData) {
      return null;
    }
    if (lastSyncUserData.platformSpecific !== void 0 && lastSyncUserData.platformSpecific !== this.syncKeybindingsPerPlatform()) {
      return null;
    }
    return getKeybindingsContentFromSyncContent(lastSyncUserData.syncData.content, this.syncKeybindingsPerPlatform(), this.logService);
  }
  toSyncContent(keybindingsContent, syncContent) {
    let parsed = {};
    try {
      parsed = JSON.parse(syncContent || "{}");
    } catch (e) {
      this.logService.error(e);
    }
    if (this.syncKeybindingsPerPlatform()) {
      delete parsed.all;
    } else {
      parsed.all = keybindingsContent;
    }
    switch (OS) {
      case OperatingSystem.Macintosh:
        parsed.mac = keybindingsContent;
        break;
      case OperatingSystem.Linux:
        parsed.linux = keybindingsContent;
        break;
      case OperatingSystem.Windows:
        parsed.windows = keybindingsContent;
        break;
    }
    return JSON.stringify(parsed);
  }
  syncKeybindingsPerPlatform() {
    return !!this.configurationService.getValue(CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM);
  }
};
KeybindingsSynchroniser = __decorateClass([
  __decorateParam(2, IUserDataSyncStoreService),
  __decorateParam(3, IUserDataSyncLocalStoreService),
  __decorateParam(4, IUserDataSyncLogService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IUserDataSyncEnablementService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IEnvironmentService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IUserDataSyncUtilService),
  __decorateParam(11, ITelemetryService),
  __decorateParam(12, IUriIdentityService)
], KeybindingsSynchroniser);
let KeybindingsInitializer = class extends AbstractInitializer {
  constructor(fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService) {
    super(SyncResource.Keybindings, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
  }
  async doInitialize(remoteUserData) {
    const keybindingsContent = remoteUserData.syncData ? this.getKeybindingsContentFromSyncContent(remoteUserData.syncData.content) : null;
    if (!keybindingsContent) {
      this.logService.info("Skipping initializing keybindings because remote keybindings does not exist.");
      return;
    }
    const isEmpty = await this.isEmpty();
    if (!isEmpty) {
      this.logService.info("Skipping initializing keybindings because local keybindings exist.");
      return;
    }
    await this.fileService.writeFile(this.userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(keybindingsContent));
    await this.updateLastSyncUserData(remoteUserData);
  }
  async isEmpty() {
    try {
      const fileContent = await this.fileService.readFile(this.userDataProfilesService.defaultProfile.settingsResource);
      const keybindings = parse(fileContent.value.toString());
      return !isNonEmptyArray(keybindings);
    } catch (error) {
      return error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND;
    }
  }
  getKeybindingsContentFromSyncContent(syncContent) {
    try {
      return getKeybindingsContentFromSyncContent(syncContent, true, this.logService);
    } catch (e) {
      this.logService.error(e);
      return null;
    }
  }
};
KeybindingsInitializer = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IUserDataSyncLogService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUriIdentityService)
], KeybindingsInitializer);
export {
  KeybindingsInitializer,
  KeybindingsSynchroniser,
  getKeybindingsContentFromSyncContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXGtleWJpbmRpbmdzU3luYy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0sIE9TIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgaXNVbmRlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RJbml0aWFsaXplciwgQWJzdHJhY3RKc29uRmlsZVN5bmNocm9uaXNlciwgSUFjY2VwdFJlc3VsdCwgSUZpbGVSZXNvdXJjZVByZXZpZXcsIElNZXJnZVJlc3VsdCB9IGZyb20gJy4vYWJzdHJhY3RTeW5jaHJvbml6ZXIuanMnO1xuaW1wb3J0IHsgbWVyZ2UgfSBmcm9tICcuL2tleWJpbmRpbmdzTWVyZ2UuanMnO1xuaW1wb3J0IHsgQ2hhbmdlLCBJUmVtb3RlVXNlckRhdGEsIElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSwgSVVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24sIElVc2VyRGF0YVN5bmNocm9uaXNlciwgSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsIElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgSVVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlLCBTeW5jUmVzb3VyY2UsIFVzZXJEYXRhU3luY0Vycm9yLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUsIFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgQ09ORklHX1NZTkNfS0VZQklORElOR1NfUEVSX1BMQVRGT1JNIH0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuXG5pbnRlcmZhY2UgSVN5bmNDb250ZW50IHtcblx0bWFjPzogc3RyaW5nO1xuXHRsaW51eD86IHN0cmluZztcblx0d2luZG93cz86IHN0cmluZztcblx0YWxsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSUtleWJpbmRpbmdzUmVzb3VyY2VQcmV2aWV3IGV4dGVuZHMgSUZpbGVSZXNvdXJjZVByZXZpZXcge1xuXHRwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQ7XG59XG5cbmludGVyZmFjZSBJTGFzdFN5bmNVc2VyRGF0YSBleHRlbmRzIElSZW1vdGVVc2VyRGF0YSB7XG5cdHBsYXRmb3JtU3BlY2lmaWM/OiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0S2V5YmluZGluZ3NDb250ZW50RnJvbVN5bmNDb250ZW50KHN5bmNDb250ZW50OiBzdHJpbmcsIHBsYXRmb3JtU3BlY2lmaWM6IGJvb2xlYW4sIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKTogc3RyaW5nIHwgbnVsbCB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gPElTeW5jQ29udGVudD5KU09OLnBhcnNlKHN5bmNDb250ZW50KTtcblx0XHRpZiAoIXBsYXRmb3JtU3BlY2lmaWMpIHtcblx0XHRcdHJldHVybiBpc1VuZGVmaW5lZChwYXJzZWQuYWxsKSA/IG51bGwgOiBwYXJzZWQuYWxsO1xuXHRcdH1cblx0XHRzd2l0Y2ggKE9TKSB7XG5cdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdHJldHVybiBpc1VuZGVmaW5lZChwYXJzZWQubWFjKSA/IG51bGwgOiBwYXJzZWQubWFjO1xuXHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdHJldHVybiBpc1VuZGVmaW5lZChwYXJzZWQubGludXgpID8gbnVsbCA6IHBhcnNlZC5saW51eDtcblx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3M6XG5cdFx0XHRcdHJldHVybiBpc1VuZGVmaW5lZChwYXJzZWQud2luZG93cykgPyBudWxsIDogcGFyc2VkLndpbmRvd3M7XG5cdFx0fVxuXHR9IGNhdGNoIChlKSB7XG5cdFx0bG9nU2VydmljZS5lcnJvcihlKTtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgS2V5YmluZGluZ3NTeW5jaHJvbmlzZXIgZXh0ZW5kcyBBYnN0cmFjdEpzb25GaWxlU3luY2hyb25pc2VyIGltcGxlbWVudHMgSVVzZXJEYXRhU3luY2hyb25pc2VyIHtcblxuXHQvKiBWZXJzaW9uIDI6IENoYW5nZSBzZXR0aW5ncyBmcm9tIGBzeW5jLiR7c2V0dGluZ31gIHRvIGBzZXR0aW5nc1N5bmMue3NldHRpbmd9YCAqL1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyID0gMjtcblx0cHJpdmF0ZSByZWFkb25seSBwcmV2aWV3UmVzb3VyY2U6IFVSSSA9IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsICdrZXliaW5kaW5ncy5qc29uJyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYmFzZVJlc291cmNlOiBVUkkgPSB0aGlzLnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2Jhc2UnIH0pO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxvY2FsUmVzb3VyY2U6IFVSSSA9IHRoaXMucHJldmlld1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlbW90ZVJlc291cmNlOiBVUkkgPSB0aGlzLnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWNjZXB0ZWRSZXNvdXJjZTogVVJJID0gdGhpcy5wcmV2aWV3UmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSxcblx0XHRjb2xsZWN0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0QElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UgdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UgdXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgbG9nU2VydmljZTogSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlIHVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlOiBJVXNlckRhdGFTeW5jVXRpbFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIocHJvZmlsZS5rZXliaW5kaW5nc1Jlc291cmNlLCB7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLktleWJpbmRpbmdzLCBwcm9maWxlIH0sIGNvbGxlY3Rpb24sIGZpbGVTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIHVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLCB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgbG9nU2VydmljZSwgdXNlckRhdGFTeW5jVXRpbFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2V0dGluZ3NTeW5jLmtleWJpbmRpbmdzUGVyUGxhdGZvcm0nKSkoKCkgPT4gdGhpcy50cmlnZ2VyTG9jYWxDaGFuZ2UoKSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdlbmVyYXRlU3luY1ByZXZpZXcocmVtb3RlVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSwgbGFzdFN5bmNVc2VyRGF0YTogSUxhc3RTeW5jVXNlckRhdGEgfCBudWxsLCBpc1JlbW90ZURhdGFGcm9tQ3VycmVudE1hY2hpbmU6IGJvb2xlYW4sIHVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb246IElVc2VyRGF0YVN5bmNDb25maWd1cmF0aW9uKTogUHJvbWlzZTxJS2V5YmluZGluZ3NSZXNvdXJjZVByZXZpZXdbXT4ge1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSA/IGdldEtleWJpbmRpbmdzQ29udGVudEZyb21TeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YS5jb250ZW50LCB1c2VyRGF0YVN5bmNDb25maWd1cmF0aW9uLmtleWJpbmRpbmdzUGVyUGxhdGZvcm0gPz8gdGhpcy5zeW5jS2V5YmluZGluZ3NQZXJQbGF0Zm9ybSgpLCB0aGlzLmxvZ1NlcnZpY2UpIDogbnVsbDtcblxuXHRcdC8vIFVzZSByZW1vdGUgZGF0YSBhcyBsYXN0IHN5bmMgZGF0YSBpZiBsYXN0IHN5bmMgZGF0YSBkb2VzIG5vdCBleGlzdCBhbmQgcmVtb3RlIGRhdGEgaXMgZnJvbSBzYW1lIG1hY2hpbmVcblx0XHRsYXN0U3luY1VzZXJEYXRhID0gbGFzdFN5bmNVc2VyRGF0YSA9PT0gbnVsbCAmJiBpc1JlbW90ZURhdGFGcm9tQ3VycmVudE1hY2hpbmUgPyByZW1vdGVVc2VyRGF0YSA6IGxhc3RTeW5jVXNlckRhdGE7XG5cdFx0Y29uc3QgbGFzdFN5bmNDb250ZW50OiBzdHJpbmcgfCBudWxsID0gbGFzdFN5bmNVc2VyRGF0YSA/IHRoaXMuZ2V0S2V5YmluZGluZ3NDb250ZW50RnJvbUxhc3RTeW5jVXNlckRhdGEobGFzdFN5bmNVc2VyRGF0YSkgOiBudWxsO1xuXG5cdFx0Ly8gR2V0IGZpbGUgY29udGVudCBsYXN0IHRvIGdldCB0aGUgbGF0ZXN0XG5cdFx0Y29uc3QgZmlsZUNvbnRlbnQgPSBhd2FpdCB0aGlzLmdldExvY2FsRmlsZUNvbnRlbnQoKTtcblx0XHRjb25zdCBmb3JtYXR0aW5nT3B0aW9ucyA9IGF3YWl0IHRoaXMuZ2V0Rm9ybWF0dGluZ09wdGlvbnMoKTtcblxuXHRcdGxldCBtZXJnZWRDb250ZW50OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgaGFzTG9jYWxDaGFuZ2VkOiBib29sZWFuID0gZmFsc2U7XG5cdFx0bGV0IGhhc1JlbW90ZUNoYW5nZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRsZXQgaGFzQ29uZmxpY3RzOiBib29sZWFuID0gZmFsc2U7XG5cblx0XHRpZiAocmVtb3RlQ29udGVudCkge1xuXHRcdFx0bGV0IGxvY2FsQ29udGVudDogc3RyaW5nID0gZmlsZUNvbnRlbnQgPyBmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpIDogJ1tdJztcblx0XHRcdGxvY2FsQ29udGVudCA9IGxvY2FsQ29udGVudCB8fCAnW10nO1xuXHRcdFx0aWYgKHRoaXMuaGFzRXJyb3JzKGxvY2FsQ29udGVudCwgdHJ1ZSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY0Vycm9yKGxvY2FsaXplKCdlcnJvckludmFsaWRTZXR0aW5ncycsIFwiVW5hYmxlIHRvIHN5bmMga2V5YmluZGluZ3MgYmVjYXVzZSB0aGUgY29udGVudCBpbiB0aGUgZmlsZSBpcyBub3QgdmFsaWQuIFBsZWFzZSBvcGVuIHRoZSBmaWxlIGFuZCBjb3JyZWN0IGl0LlwiKSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkxvY2FsSW52YWxpZENvbnRlbnQsIHRoaXMucmVzb3VyY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWxhc3RTeW5jQ29udGVudCAvLyBGaXJzdCB0aW1lIHN5bmNcblx0XHRcdFx0fHwgbGFzdFN5bmNDb250ZW50ICE9PSBsb2NhbENvbnRlbnQgLy8gTG9jYWwgaGFzIGZvcndhcmRlZFxuXHRcdFx0XHR8fCBsYXN0U3luY0NvbnRlbnQgIT09IHJlbW90ZUNvbnRlbnQgLy8gUmVtb3RlIGhhcyBmb3J3YXJkZWRcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IE1lcmdpbmcgcmVtb3RlIGtleWJpbmRpbmdzIHdpdGggbG9jYWwga2V5YmluZGluZ3MuLi5gKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBsYXN0U3luY0NvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zLCB0aGlzLnVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlKTtcblx0XHRcdFx0Ly8gU3luYyBvbmx5IGlmIHRoZXJlIGFyZSBjaGFuZ2VzXG5cdFx0XHRcdGlmIChyZXN1bHQuaGFzQ2hhbmdlcykge1xuXHRcdFx0XHRcdG1lcmdlZENvbnRlbnQgPSByZXN1bHQubWVyZ2VDb250ZW50O1xuXHRcdFx0XHRcdGhhc0NvbmZsaWN0cyA9IHJlc3VsdC5oYXNDb25mbGljdHM7XG5cdFx0XHRcdFx0aGFzTG9jYWxDaGFuZ2VkID0gaGFzQ29uZmxpY3RzIHx8IHJlc3VsdC5tZXJnZUNvbnRlbnQgIT09IGxvY2FsQ29udGVudDtcblx0XHRcdFx0XHRoYXNSZW1vdGVDaGFuZ2VkID0gaGFzQ29uZmxpY3RzIHx8IHJlc3VsdC5tZXJnZUNvbnRlbnQgIT09IHJlbW90ZUNvbnRlbnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaXJzdCB0aW1lIHN5bmNpbmcgdG8gcmVtb3RlXG5cdFx0ZWxzZSBpZiAoZmlsZUNvbnRlbnQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogUmVtb3RlIGtleWJpbmRpbmdzIGRvZXMgbm90IGV4aXN0LiBTeW5jaHJvbml6aW5nIGtleWJpbmRpbmdzIGZvciB0aGUgZmlyc3QgdGltZS5gKTtcblx0XHRcdG1lcmdlZENvbnRlbnQgPSBmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0aGFzUmVtb3RlQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0Y29udGVudDogaGFzQ29uZmxpY3RzID8gbGFzdFN5bmNDb250ZW50IDogbWVyZ2VkQ29udGVudCxcblx0XHRcdGxvY2FsQ2hhbmdlOiBoYXNMb2NhbENoYW5nZWQgPyBmaWxlQ29udGVudCA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5BZGRlZCA6IENoYW5nZS5Ob25lLFxuXHRcdFx0cmVtb3RlQ2hhbmdlOiBoYXNSZW1vdGVDaGFuZ2VkID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLk5vbmUsXG5cdFx0XHRoYXNDb25mbGljdHNcblx0XHR9O1xuXG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gZmlsZUNvbnRlbnQgPyBmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpIDogbnVsbDtcblx0XHRyZXR1cm4gW3tcblx0XHRcdGZpbGVDb250ZW50LFxuXG5cdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuYmFzZVJlc291cmNlLFxuXHRcdFx0YmFzZUNvbnRlbnQ6IGxhc3RTeW5jQ29udGVudCxcblxuXHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5sb2NhbFJlc291cmNlLFxuXHRcdFx0bG9jYWxDb250ZW50LFxuXHRcdFx0bG9jYWxDaGFuZ2U6IHByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cblx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLnJlbW90ZVJlc291cmNlLFxuXHRcdFx0cmVtb3RlQ29udGVudCxcblx0XHRcdHJlbW90ZUNoYW5nZTogcHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2UsXG5cblx0XHRcdHByZXZpZXdSZXNvdXJjZTogdGhpcy5wcmV2aWV3UmVzb3VyY2UsXG5cdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5hY2NlcHRlZFJlc291cmNlLFxuXHRcdH1dO1xuXG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgaGFzUmVtb3RlQ2hhbmdlZChsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBsYXN0U3luY0NvbnRlbnQgPSB0aGlzLmdldEtleWJpbmRpbmdzQ29udGVudEZyb21MYXN0U3luY1VzZXJEYXRhKGxhc3RTeW5jVXNlckRhdGEpO1xuXHRcdGlmIChsYXN0U3luY0NvbnRlbnQgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbGVDb250ZW50ID0gYXdhaXQgdGhpcy5nZXRMb2NhbEZpbGVDb250ZW50KCk7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50OiBzdHJpbmcgPSBmaWxlQ29udGVudCA/IGZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkgOiAnJztcblx0XHRjb25zdCBmb3JtYXR0aW5nT3B0aW9ucyA9IGF3YWl0IHRoaXMuZ2V0Rm9ybWF0dGluZ09wdGlvbnMoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtZXJnZShsb2NhbENvbnRlbnQgfHwgJ1tdJywgbGFzdFN5bmNDb250ZW50LCBsYXN0U3luY0NvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zLCB0aGlzLnVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlKTtcblx0XHRyZXR1cm4gcmVzdWx0Lmhhc0NvbmZsaWN0cyB8fCByZXN1bHQubWVyZ2VDb250ZW50ICE9PSBsYXN0U3luY0NvbnRlbnQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0TWVyZ2VSZXN1bHQocmVzb3VyY2VQcmV2aWV3OiBJS2V5YmluZGluZ3NSZXNvdXJjZVByZXZpZXcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SU1lcmdlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHJlc291cmNlUHJldmlldy5wcmV2aWV3UmVzdWx0O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldEFjY2VwdFJlc3VsdChyZXNvdXJjZVByZXZpZXc6IElLZXliaW5kaW5nc1Jlc291cmNlUHJldmlldywgcmVzb3VyY2U6IFVSSSwgY29udGVudDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWNjZXB0UmVzdWx0PiB7XG5cblx0XHQvKiBBY2NlcHQgbG9jYWwgcmVzb3VyY2UgKi9cblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5sb2NhbFJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LmZpbGVDb250ZW50ID8gcmVzb3VyY2VQcmV2aWV3LmZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk1vZGlmaWVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvKiBBY2NlcHQgcmVtb3RlIHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwocmVzb3VyY2UsIHRoaXMucmVtb3RlUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0LyogQWNjZXB0IHByZXZpZXcgcmVzb3VyY2UgKi9cblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5wcmV2aWV3UmVzb3VyY2UpKSB7XG5cdFx0XHRpZiAoY29udGVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQuY29udGVudCxcblx0XHRcdFx0XHRsb2NhbENoYW5nZTogcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRcdFx0cmVtb3RlQ2hhbmdlOiByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2UsXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgUmVzb3VyY2U6ICR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBhcHBseVJlc3VsdChyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCByZXNvdXJjZVByZXZpZXdzOiBbSUtleWJpbmRpbmdzUmVzb3VyY2VQcmV2aWV3LCBJQWNjZXB0UmVzdWx0XVtdLCBmb3JjZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgZmlsZUNvbnRlbnQgfSA9IHJlc291cmNlUHJldmlld3NbMF1bMF07XG5cdFx0bGV0IHsgY29udGVudCwgbG9jYWxDaGFuZ2UsIHJlbW90ZUNoYW5nZSB9ID0gcmVzb3VyY2VQcmV2aWV3c1swXVsxXTtcblxuXHRcdGlmIChsb2NhbENoYW5nZSA9PT0gQ2hhbmdlLk5vbmUgJiYgcmVtb3RlQ2hhbmdlID09PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IE5vIGNoYW5nZXMgZm91bmQgZHVyaW5nIHN5bmNocm9uaXppbmcga2V5YmluZGluZ3MuYCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRlbnQgIT09IG51bGwpIHtcblx0XHRcdGNvbnRlbnQgPSBjb250ZW50LnRyaW0oKTtcblx0XHRcdGNvbnRlbnQgPSBjb250ZW50IHx8ICdbXSc7XG5cdFx0XHRpZiAodGhpcy5oYXNFcnJvcnMoY29udGVudCwgdHJ1ZSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY0Vycm9yKGxvY2FsaXplKCdlcnJvckludmFsaWRTZXR0aW5ncycsIFwiVW5hYmxlIHRvIHN5bmMga2V5YmluZGluZ3MgYmVjYXVzZSB0aGUgY29udGVudCBpbiB0aGUgZmlsZSBpcyBub3QgdmFsaWQuIFBsZWFzZSBvcGVuIHRoZSBmaWxlIGFuZCBjb3JyZWN0IGl0LlwiKSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkxvY2FsSW52YWxpZENvbnRlbnQsIHRoaXMucmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChsb2NhbENoYW5nZSAhPT0gQ2hhbmdlLk5vbmUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRpbmcgbG9jYWwga2V5YmluZGluZ3MuLi5gKTtcblx0XHRcdGlmIChmaWxlQ29udGVudCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmJhY2t1cExvY2FsKHRoaXMudG9TeW5jQ29udGVudChmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpKSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUxvY2FsRmlsZUNvbnRlbnQoY29udGVudCB8fCAnW10nLCBmaWxlQ29udGVudCwgZm9yY2UpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0ZWQgbG9jYWwga2V5YmluZGluZ3NgKTtcblx0XHR9XG5cblx0XHRpZiAocmVtb3RlQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyByZW1vdGUga2V5YmluZGluZ3MuLi5gKTtcblx0XHRcdGNvbnN0IHJlbW90ZUNvbnRlbnRzID0gdGhpcy50b1N5bmNDb250ZW50KGNvbnRlbnQgfHwgJ1tdJywgcmVtb3RlVXNlckRhdGEuc3luY0RhdGE/LmNvbnRlbnQpO1xuXHRcdFx0cmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0aGlzLnVwZGF0ZVJlbW90ZVVzZXJEYXRhKHJlbW90ZUNvbnRlbnRzLCBmb3JjZSA/IG51bGwgOiByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0ZWQgcmVtb3RlIGtleWJpbmRpbmdzYCk7XG5cdFx0fVxuXG5cdFx0Ly8gRGVsZXRlIHRoZSBwcmV2aWV3XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHRoaXMucHJldmlld1Jlc291cmNlKTtcblx0XHR9IGNhdGNoIChlKSB7IC8qIGlnbm9yZSAqLyB9XG5cblx0XHRpZiAobGFzdFN5bmNVc2VyRGF0YT8ucmVmICE9PSByZW1vdGVVc2VyRGF0YS5yZWYpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRpbmcgbGFzdCBzeW5jaHJvbml6ZWQga2V5YmluZGluZ3MuLi5gKTtcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTGFzdFN5bmNVc2VyRGF0YShyZW1vdGVVc2VyRGF0YSwgeyBwbGF0Zm9ybVNwZWNpZmljOiB0aGlzLnN5bmNLZXliaW5kaW5nc1BlclBsYXRmb3JtKCkgfSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBsYXN0IHN5bmNocm9uaXplZCBrZXliaW5kaW5nc2ApO1xuXHRcdH1cblxuXHR9XG5cblx0YXN5bmMgaGFzTG9jYWxEYXRhKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBsb2NhbEZpbGVDb250ZW50ID0gYXdhaXQgdGhpcy5nZXRMb2NhbEZpbGVDb250ZW50KCk7XG5cdFx0XHRpZiAobG9jYWxGaWxlQ29udGVudCkge1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5ncyA9IHBhcnNlKGxvY2FsRmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGlmIChpc05vbkVtcHR5QXJyYXkoa2V5YmluZGluZ3MpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlQ29udGVudCh1cmk6IFVSSSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsKHRoaXMucmVtb3RlUmVzb3VyY2UsIHVyaSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWwodGhpcy5iYXNlUmVzb3VyY2UsIHVyaSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWwodGhpcy5sb2NhbFJlc291cmNlLCB1cmkpXG5cdFx0XHR8fCB0aGlzLmV4dFVyaS5pc0VxdWFsKHRoaXMuYWNjZXB0ZWRSZXNvdXJjZSwgdXJpKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZVByZXZpZXdDb250ZW50KHVyaSk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRLZXliaW5kaW5nc0NvbnRlbnRGcm9tTGFzdFN5bmNVc2VyRGF0YShsYXN0U3luY1VzZXJEYXRhOiBJTGFzdFN5bmNVc2VyRGF0YSk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmICghbGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIG51bGwgaWYgdGhlcmUgaXMgYSBjaGFuZ2UgaW4gcGxhdGZvcm0gc3BlY2lmaWMgcHJvcGVydHkgZnJvbSBsYXN0IHRpbWUgc3luYy5cblx0XHRpZiAobGFzdFN5bmNVc2VyRGF0YS5wbGF0Zm9ybVNwZWNpZmljICE9PSB1bmRlZmluZWQgJiYgbGFzdFN5bmNVc2VyRGF0YS5wbGF0Zm9ybVNwZWNpZmljICE9PSB0aGlzLnN5bmNLZXliaW5kaW5nc1BlclBsYXRmb3JtKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiBnZXRLZXliaW5kaW5nc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQobGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YS5jb250ZW50LCB0aGlzLnN5bmNLZXliaW5kaW5nc1BlclBsYXRmb3JtKCksIHRoaXMubG9nU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIHRvU3luY0NvbnRlbnQoa2V5YmluZGluZ3NDb250ZW50OiBzdHJpbmcsIHN5bmNDb250ZW50Pzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRsZXQgcGFyc2VkOiBJU3luY0NvbnRlbnQgPSB7fTtcblx0XHR0cnkge1xuXHRcdFx0cGFyc2VkID0gSlNPTi5wYXJzZShzeW5jQ29udGVudCB8fCAne30nKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnN5bmNLZXliaW5kaW5nc1BlclBsYXRmb3JtKCkpIHtcblx0XHRcdGRlbGV0ZSBwYXJzZWQuYWxsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwYXJzZWQuYWxsID0ga2V5YmluZGluZ3NDb250ZW50O1xuXHRcdH1cblx0XHRzd2l0Y2ggKE9TKSB7XG5cdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdHBhcnNlZC5tYWMgPSBrZXliaW5kaW5nc0NvbnRlbnQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdHBhcnNlZC5saW51eCA9IGtleWJpbmRpbmdzQ29udGVudDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzOlxuXHRcdFx0XHRwYXJzZWQud2luZG93cyA9IGtleWJpbmRpbmdzQ29udGVudDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShwYXJzZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzeW5jS2V5YmluZGluZ3NQZXJQbGF0Zm9ybSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKENPTkZJR19TWU5DX0tFWUJJTkRJTkdTX1BFUl9QTEFURk9STSk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgS2V5YmluZGluZ3NJbml0aWFsaXplciBleHRlbmRzIEFic3RyYWN0SW5pdGlhbGl6ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3MsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGxvZ1NlcnZpY2UsIGZpbGVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBkb0luaXRpYWxpemUocmVtb3RlVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGtleWJpbmRpbmdzQ29udGVudCA9IHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhID8gdGhpcy5nZXRLZXliaW5kaW5nc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEuc3luY0RhdGEuY29udGVudCkgOiBudWxsO1xuXHRcdGlmICgha2V5YmluZGluZ3NDb250ZW50KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnU2tpcHBpbmcgaW5pdGlhbGl6aW5nIGtleWJpbmRpbmdzIGJlY2F1c2UgcmVtb3RlIGtleWJpbmRpbmdzIGRvZXMgbm90IGV4aXN0LicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzRW1wdHkgPSBhd2FpdCB0aGlzLmlzRW1wdHkoKTtcblx0XHRpZiAoIWlzRW1wdHkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTa2lwcGluZyBpbml0aWFsaXppbmcga2V5YmluZGluZ3MgYmVjYXVzZSBsb2NhbCBrZXliaW5kaW5ncyBleGlzdC4nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmtleWJpbmRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoa2V5YmluZGluZ3NDb250ZW50KSk7XG5cblx0XHRhd2FpdCB0aGlzLnVwZGF0ZUxhc3RTeW5jVXNlckRhdGEocmVtb3RlVXNlckRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpc0VtcHR5KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlKTtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmdzID0gcGFyc2UoZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHRyZXR1cm4gIWlzTm9uRW1wdHlBcnJheShrZXliaW5kaW5ncyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJldHVybiAoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEtleWJpbmRpbmdzQ29udGVudEZyb21TeW5jQ29udGVudChzeW5jQ29udGVudDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBnZXRLZXliaW5kaW5nc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQoc3luY0NvbnRlbnQsIHRydWUsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQixVQUFVO0FBQ3BDLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQTZCLHFCQUFxQixvQkFBb0I7QUFFdEUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBMkIsZ0NBQWdDO0FBQzNELFNBQVMscUJBQXFCLG9DQUF1RjtBQUNySCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxRQUF5QixnQ0FBbUYseUJBQXlCLGdDQUFnQywyQkFBMkIsMEJBQTBCLGNBQWMsbUJBQW1CLHVCQUF1Qix1QkFBdUIsNENBQTRDO0FBaUJ2VixTQUFTLHFDQUFxQyxhQUFxQixrQkFBMkIsWUFBd0M7QUFDNUksTUFBSTtBQUNILFVBQU0sU0FBdUIsS0FBSyxNQUFNLFdBQVc7QUFDbkQsUUFBSSxDQUFDLGtCQUFrQjtBQUN0QixhQUFPLFlBQVksT0FBTyxHQUFHLElBQUksT0FBTyxPQUFPO0FBQUEsSUFDaEQ7QUFDQSxZQUFRLElBQUk7QUFBQSxNQUNYLEtBQUssZ0JBQWdCO0FBQ3BCLGVBQU8sWUFBWSxPQUFPLEdBQUcsSUFBSSxPQUFPLE9BQU87QUFBQSxNQUNoRCxLQUFLLGdCQUFnQjtBQUNwQixlQUFPLFlBQVksT0FBTyxL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
