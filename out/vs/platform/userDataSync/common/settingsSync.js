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
import { distinct } from "../../../base/common/arrays.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Event } from "../../../base/common/event.js";
import { localize } from "../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../configuration/common/configuration.js";
import { ConfigurationModelParser } from "../../configuration/common/configurationModels.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { IExtensionManagementService } from "../../extensionManagement/common/extensionManagement.js";
import { ExtensionType } from "../../extensions/common/extensions.js";
import { FileOperationResult, IFileService } from "../../files/common/files.js";
import { IStorageService } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { AbstractInitializer, AbstractJsonFileSynchroniser } from "./abstractSynchronizer.js";
import { getIgnoredSettings, isEmpty, merge, updateIgnoredSettings } from "./settingsMerge.js";
import { Change, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, IUserDataSyncUtilService, SyncResource, UserDataSyncError, UserDataSyncErrorCode, USER_DATA_SYNC_CONFIGURATION_SCOPE, USER_DATA_SYNC_SCHEME, getIgnoredSettingsForExtension } from "./userDataSync.js";
function isSettingsSyncContent(thing) {
  return thing && (thing.settings && typeof thing.settings === "string") && Object.keys(thing).length === 1;
}
function parseSettingsSyncContent(syncContent) {
  const parsed = JSON.parse(syncContent);
  return isSettingsSyncContent(parsed) ? parsed : (
    /* migrate */
    { settings: syncContent }
  );
}
let SettingsSynchroniser = class extends AbstractJsonFileSynchroniser {
  constructor(profile, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, logService, userDataSyncUtilService, configurationService, userDataSyncEnablementService, telemetryService, extensionManagementService, uriIdentityService) {
    super(profile.settingsResource, { syncResource: SyncResource.Settings, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, userDataSyncUtilService, configurationService, uriIdentityService);
    this.profile = profile;
    this.extensionManagementService = extensionManagementService;
    /* Version 2: Change settings from `sync.${setting}` to `settingsSync.{setting}` */
    this.version = 2;
    this.previewResource = this.extUri.joinPath(this.syncPreviewFolder, "settings.json");
    this.baseResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" });
    this.localResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" });
    this.remoteResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" });
    this.acceptedResource = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" });
    this.coreIgnoredSettings = void 0;
    this.systemExtensionsIgnoredSettings = void 0;
    this.userExtensionsIgnoredSettings = void 0;
  }
  async getRemoteUserDataSyncConfiguration(refOrLatestData) {
    const lastSyncUserData = await this.getLastSyncUserData();
    const remoteUserData = await this.getLatestRemoteUserData(refOrLatestData, lastSyncUserData);
    const remoteSettingsSyncContent = this.getSettingsSyncContent(remoteUserData);
    const parser = new ConfigurationModelParser(USER_DATA_SYNC_CONFIGURATION_SCOPE, this.logService);
    if (remoteSettingsSyncContent?.settings) {
      parser.parse(remoteSettingsSyncContent.settings);
    }
    return parser.configurationModel.getValue(USER_DATA_SYNC_CONFIGURATION_SCOPE) || {};
  }
  async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine) {
    const fileContent = await this.getLocalFileContent();
    const formattingOptions = await this.getFormattingOptions();
    const remoteSettingsSyncContent = this.getSettingsSyncContent(remoteUserData);
    lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
    const lastSettingsSyncContent = lastSyncUserData ? this.getSettingsSyncContent(lastSyncUserData) : null;
    const ignoredSettings = await this.getIgnoredSettings();
    let mergedContent = null;
    let hasLocalChanged = false;
    let hasRemoteChanged = false;
    let hasConflicts = false;
    if (remoteSettingsSyncContent) {
      let localContent2 = fileContent ? fileContent.value.toString().trim() : "{}";
      localContent2 = localContent2 || "{}";
      this.validateContent(localContent2);
      this.logService.trace(`${this.syncResourceLogLabel}: Merging remote settings with local settings...`);
      const result = merge(localContent2, remoteSettingsSyncContent.settings, lastSettingsSyncContent ? lastSettingsSyncContent.settings : null, ignoredSettings, [], formattingOptions);
      mergedContent = result.localContent || result.remoteContent;
      hasLocalChanged = result.localContent !== null;
      hasRemoteChanged = result.remoteContent !== null;
      hasConflicts = result.hasConflicts;
    } else if (fileContent) {
      this.logService.trace(`${this.syncResourceLogLabel}: Remote settings does not exist. Synchronizing settings for the first time.`);
      mergedContent = fileContent.value.toString().trim() || "{}";
      this.validateContent(mergedContent);
      hasRemoteChanged = true;
    }
    const localContent = fileContent ? fileContent.value.toString() : null;
    const baseContent = lastSettingsSyncContent?.settings ?? null;
    const previewResult = {
      content: hasConflicts ? baseContent : mergedContent,
      localChange: hasLocalChanged ? Change.Modified : Change.None,
      remoteChange: hasRemoteChanged ? Change.Modified : Change.None,
      hasConflicts
    };
    return [{
      fileContent,
      baseResource: this.baseResource,
      baseContent,
      localResource: this.localResource,
      localContent,
      localChange: previewResult.localChange,
      remoteResource: this.remoteResource,
      remoteContent: remoteSettingsSyncContent ? remoteSettingsSyncContent.settings : null,
      remoteChange: previewResult.remoteChange,
      previewResource: this.previewResource,
      previewResult,
      acceptedResource: this.acceptedResource
    }];
  }
  async hasRemoteChanged(lastSyncUserData) {
    const lastSettingsSyncContent = this.getSettingsSyncContent(lastSyncUserData);
    if (lastSettingsSyncContent === null) {
      return true;
    }
    const fileContent = await this.getLocalFileContent();
    const localContent = fileContent ? fileContent.value.toString().trim() : "";
    const ignoredSettings = await this.getIgnoredSettings();
    const formattingOptions = await this.getFormattingOptions();
    const result = merge(localContent || "{}", lastSettingsSyncContent.settings, lastSettingsSyncContent.settings, ignoredSettings, [], formattingOptions);
    return result.remoteContent !== null;
  }
  async getMergeResult(resourcePreview, token) {
    const formatUtils = await this.getFormattingOptions();
    const ignoredSettings = await this.getIgnoredSettings();
    return {
      ...resourcePreview.previewResult,
      // remove ignored settings from the preview content
      content: resourcePreview.previewResult.content ? updateIgnoredSettings(resourcePreview.previewResult.content, "{}", ignoredSettings, formatUtils) : null
    };
  }
  async getAcceptResult(resourcePreview, resource, content, token) {
    const formattingOptions = await this.getFormattingOptions();
    const ignoredSettings = await this.getIgnoredSettings();
    if (this.extUri.isEqual(resource, this.localResource)) {
      return {
        /* Remove ignored settings */
        content: resourcePreview.fileContent ? updateIgnoredSettings(resourcePreview.fileContent.value.toString(), "{}", ignoredSettings, formattingOptions) : null,
        localChange: Change.None,
        remoteChange: Change.Modified
      };
    }
    if (this.extUri.isEqual(resource, this.remoteResource)) {
      return {
        /* Update ignored settings from local file content */
        content: resourcePreview.remoteContent !== null ? updateIgnoredSettings(resourcePreview.remoteContent, resourcePreview.fileContent ? resourcePreview.fileContent.value.toString() : "{}", ignoredSettings, formattingOptions) : null,
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
          /* Add ignored settings from local file content */
          content: content !== null ? updateIgnoredSettings(content, resourcePreview.fileContent ? resourcePreview.fileContent.value.toString() : "{}", ignoredSettings, formattingOptions) : null,
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
      this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing settings.`);
    }
    content = content ? content.trim() : "{}";
    content = content || "{}";
    this.validateContent(content);
    if (localChange !== Change.None) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating local settings...`);
      if (fileContent) {
        await this.backupLocal(JSON.stringify(this.toSettingsSyncContent(fileContent.value.toString())));
      }
      await this.updateLocalFileContent(content, fileContent, force);
      await this.configurationService.reloadConfiguration(ConfigurationTarget.USER_LOCAL);
      this.logService.info(`${this.syncResourceLogLabel}: Updated local settings`);
    }
    if (remoteChange !== Change.None) {
      const formatUtils = await this.getFormattingOptions();
      const remoteSettingsSyncContent = this.getSettingsSyncContent(remoteUserData);
      const ignoredSettings = await this.getIgnoredSettings(content);
      content = updateIgnoredSettings(content, remoteSettingsSyncContent ? remoteSettingsSyncContent.settings : "{}", ignoredSettings, formatUtils);
      this.logService.trace(`${this.syncResourceLogLabel}: Updating remote settings...`);
      remoteUserData = await this.updateRemoteUserData(JSON.stringify(this.toSettingsSyncContent(content)), force ? null : remoteUserData.ref);
      this.logService.info(`${this.syncResourceLogLabel}: Updated remote settings`);
    }
    try {
      await this.fileService.del(this.previewResource);
    } catch (e) {
    }
    if (lastSyncUserData?.ref !== remoteUserData.ref) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized settings...`);
      await this.updateLastSyncUserData(remoteUserData);
      this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized settings`);
    }
  }
  async hasLocalData() {
    try {
      const localFileContent = await this.getLocalFileContent();
      if (localFileContent) {
        return !isEmpty(localFileContent.value.toString());
      }
    } catch (error) {
      if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
        return true;
      }
    }
    return false;
  }
  async resolveContent(uri) {
    if (this.extUri.isEqual(this.remoteResource, uri) || this.extUri.isEqual(this.localResource, uri) || this.extUri.isEqual(this.acceptedResource, uri) || this.extUri.isEqual(this.baseResource, uri)) {
      return this.resolvePreviewContent(uri);
    }
    return null;
  }
  async resolvePreviewContent(resource) {
    let content = await super.resolvePreviewContent(resource);
    if (content) {
      const formatUtils = await this.getFormattingOptions();
      const ignoredSettings = await this.getIgnoredSettings();
      content = updateIgnoredSettings(content, "{}", ignoredSettings, formatUtils);
    }
    return content;
  }
  getSettingsSyncContent(remoteUserData) {
    return remoteUserData.syncData ? this.parseSettingsSyncContent(remoteUserData.syncData.content) : null;
  }
  parseSettingsSyncContent(syncContent) {
    try {
      return parseSettingsSyncContent(syncContent);
    } catch (e) {
      this.logService.error(e);
    }
    return null;
  }
  toSettingsSyncContent(settings) {
    return { settings };
  }
  async getIgnoredSettings(content) {
    if (!this.coreIgnoredSettings) {
      this.coreIgnoredSettings = this.userDataSyncUtilService.resolveDefaultCoreIgnoredSettings();
    }
    if (!this.systemExtensionsIgnoredSettings) {
      this.systemExtensionsIgnoredSettings = this.getIgnoredSettingForSystemExtensions();
    }
    if (!this.userExtensionsIgnoredSettings) {
      this.userExtensionsIgnoredSettings = this.getIgnoredSettingForUserExtensions();
      const disposable = this._register(Event.any(
        Event.filter(this.extensionManagementService.onDidInstallExtensions, ((e) => e.some(({ local }) => !!local))),
        Event.filter(this.extensionManagementService.onDidUninstallExtension, ((e) => !e.error))
      )(() => {
        disposable.dispose();
        this.userExtensionsIgnoredSettings = void 0;
      }));
    }
    const defaultIgnoredSettings = (await Promise.all([this.coreIgnoredSettings, this.systemExtensionsIgnoredSettings, this.userExtensionsIgnoredSettings])).flat();
    return getIgnoredSettings(defaultIgnoredSettings, this.configurationService, content);
  }
  async getIgnoredSettingForSystemExtensions() {
    const systemExtensions = await this.extensionManagementService.getInstalled(ExtensionType.System);
    return distinct(systemExtensions.map((e) => getIgnoredSettingsForExtension(e.manifest)).flat());
  }
  async getIgnoredSettingForUserExtensions() {
    const userExtensions = await this.extensionManagementService.getInstalled(ExtensionType.User, this.profile.extensionsResource);
    return distinct(userExtensions.map((e) => getIgnoredSettingsForExtension(e.manifest)).flat());
  }
  validateContent(content) {
    if (this.hasErrors(content, false)) {
      throw new UserDataSyncError(localize("errorInvalidSettings", "Unable to sync settings as there are errors/warning in settings file."), UserDataSyncErrorCode.LocalInvalidContent, this.resource);
    }
  }
};
SettingsSynchroniser = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUserDataSyncStoreService),
  __decorateParam(6, IUserDataSyncLocalStoreService),
  __decorateParam(7, IUserDataSyncLogService),
  __decorateParam(8, IUserDataSyncUtilService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IUserDataSyncEnablementService),
  __decorateParam(11, ITelemetryService),
  __decorateParam(12, IExtensionManagementService),
  __decorateParam(13, IUriIdentityService)
], SettingsSynchroniser);
let SettingsInitializer = class extends AbstractInitializer {
  constructor(fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService) {
    super(SyncResource.Settings, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
  }
  async doInitialize(remoteUserData) {
    const settingsSyncContent = remoteUserData.syncData ? this.parseSettingsSyncContent(remoteUserData.syncData.content) : null;
    if (!settingsSyncContent) {
      this.logService.info("Skipping initializing settings because remote settings does not exist.");
      return;
    }
    const isEmpty2 = await this.isEmpty();
    if (!isEmpty2) {
      this.logService.info("Skipping initializing settings because local settings exist.");
      return;
    }
    await this.fileService.writeFile(this.userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(settingsSyncContent.settings));
    await this.updateLastSyncUserData(remoteUserData);
  }
  async isEmpty() {
    try {
      const fileContent = await this.fileService.readFile(this.userDataProfilesService.defaultProfile.settingsResource);
      return isEmpty(fileContent.value.toString().trim());
    } catch (error) {
      return error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND;
    }
  }
  parseSettingsSyncContent(syncContent) {
    try {
      return parseSettingsSyncContent(syncContent);
    } catch (e) {
      this.logService.error(e);
    }
    return null;
  }
};
SettingsInitializer = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IUserDataSyncLogService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUriIdentityService)
], SettingsInitializer);
export {
  SettingsInitializer,
  SettingsSynchroniser,
  parseSettingsSyncContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXHNldHRpbmdzU3luYy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbk1vZGVscy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RJbml0aWFsaXplciwgQWJzdHJhY3RKc29uRmlsZVN5bmNocm9uaXNlciwgSUFjY2VwdFJlc3VsdCwgSUZpbGVSZXNvdXJjZVByZXZpZXcsIElNZXJnZVJlc3VsdCB9IGZyb20gJy4vYWJzdHJhY3RTeW5jaHJvbml6ZXIuanMnO1xuaW1wb3J0IHsgZ2V0SWdub3JlZFNldHRpbmdzLCBpc0VtcHR5LCBtZXJnZSwgdXBkYXRlSWdub3JlZFNldHRpbmdzIH0gZnJvbSAnLi9zZXR0aW5nc01lcmdlLmpzJztcbmltcG9ydCB7IENoYW5nZSwgSVJlbW90ZVVzZXJEYXRhLCBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsIElVc2VyRGF0YVN5bmNDb25maWd1cmF0aW9uLCBJVXNlckRhdGFTeW5jaHJvbmlzZXIsIElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLCBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIElVc2VyRGF0YVN5bmNVdGlsU2VydmljZSwgU3luY1Jlc291cmNlLCBVc2VyRGF0YVN5bmNFcnJvciwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLCBVU0VSX0RBVEFfU1lOQ19DT05GSUdVUkFUSU9OX1NDT1BFLCBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGdldElnbm9yZWRTZXR0aW5nc0ZvckV4dGVuc2lvbiwgSVVzZXJEYXRhIH0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuXG5pbnRlcmZhY2UgSVNldHRpbmdzUmVzb3VyY2VQcmV2aWV3IGV4dGVuZHMgSUZpbGVSZXNvdXJjZVByZXZpZXcge1xuXHRwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNldHRpbmdzU3luY0NvbnRlbnQge1xuXHRzZXR0aW5nczogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBpc1NldHRpbmdzU3luY0NvbnRlbnQodGhpbmc6IGFueSk6IHRoaW5nIGlzIElTZXR0aW5nc1N5bmNDb250ZW50IHtcblx0cmV0dXJuIHRoaW5nXG5cdFx0JiYgKHRoaW5nLnNldHRpbmdzICYmIHR5cGVvZiB0aGluZy5zZXR0aW5ncyA9PT0gJ3N0cmluZycpXG5cdFx0JiYgT2JqZWN0LmtleXModGhpbmcpLmxlbmd0aCA9PT0gMTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlU2V0dGluZ3NTeW5jQ29udGVudChzeW5jQ29udGVudDogc3RyaW5nKTogSVNldHRpbmdzU3luY0NvbnRlbnQge1xuXHRjb25zdCBwYXJzZWQgPSA8SVNldHRpbmdzU3luY0NvbnRlbnQ+SlNPTi5wYXJzZShzeW5jQ29udGVudCk7XG5cdHJldHVybiBpc1NldHRpbmdzU3luY0NvbnRlbnQocGFyc2VkKSA/IHBhcnNlZCA6IC8qIG1pZ3JhdGUgKi8geyBzZXR0aW5nczogc3luY0NvbnRlbnQgfTtcbn1cblxuZXhwb3J0IGNsYXNzIFNldHRpbmdzU3luY2hyb25pc2VyIGV4dGVuZHMgQWJzdHJhY3RKc29uRmlsZVN5bmNocm9uaXNlciBpbXBsZW1lbnRzIElVc2VyRGF0YVN5bmNocm9uaXNlciB7XG5cblx0LyogVmVyc2lvbiAyOiBDaGFuZ2Ugc2V0dGluZ3MgZnJvbSBgc3luYy4ke3NldHRpbmd9YCB0byBgc2V0dGluZ3NTeW5jLntzZXR0aW5nfWAgKi9cblx0cHJvdGVjdGVkIHJlYWRvbmx5IHZlcnNpb246IG51bWJlciA9IDI7XG5cdHJlYWRvbmx5IHByZXZpZXdSZXNvdXJjZTogVVJJID0gdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwgJ3NldHRpbmdzLmpzb24nKTtcblx0cmVhZG9ubHkgYmFzZVJlc291cmNlOiBVUkkgPSB0aGlzLnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2Jhc2UnIH0pO1xuXHRyZWFkb25seSBsb2NhbFJlc291cmNlOiBVUkkgPSB0aGlzLnByZXZpZXdSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KTtcblx0cmVhZG9ubHkgcmVtb3RlUmVzb3VyY2U6IFVSSSA9IHRoaXMucHJldmlld1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KTtcblx0cmVhZG9ubHkgYWNjZXB0ZWRSZXNvdXJjZTogVVJJID0gdGhpcy5wcmV2aWV3UmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLFxuXHRcdGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSB1c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlIHVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlOiBJVXNlckRhdGFTeW5jVXRpbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihwcm9maWxlLnNldHRpbmdzUmVzb3VyY2UsIHsgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHByb2ZpbGUgfSwgY29sbGVjdGlvbiwgZmlsZVNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgdXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsIHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBsb2dTZXJ2aWNlLCB1c2VyRGF0YVN5bmNVdGlsU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdH1cblxuXHRhc3luYyBnZXRSZW1vdGVVc2VyRGF0YVN5bmNDb25maWd1cmF0aW9uKHJlZk9yTGF0ZXN0RGF0YTogc3RyaW5nIHwgSVVzZXJEYXRhIHwgbnVsbCk6IFByb21pc2U8SVVzZXJEYXRhU3luY0NvbmZpZ3VyYXRpb24+IHtcblx0XHRjb25zdCBsYXN0U3luY1VzZXJEYXRhID0gYXdhaXQgdGhpcy5nZXRMYXN0U3luY1VzZXJEYXRhKCk7XG5cdFx0Y29uc3QgcmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0aGlzLmdldExhdGVzdFJlbW90ZVVzZXJEYXRhKHJlZk9yTGF0ZXN0RGF0YSwgbGFzdFN5bmNVc2VyRGF0YSk7XG5cdFx0Y29uc3QgcmVtb3RlU2V0dGluZ3NTeW5jQ29udGVudCA9IHRoaXMuZ2V0U2V0dGluZ3NTeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YSk7XG5cdFx0Y29uc3QgcGFyc2VyID0gbmV3IENvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlcihVU0VSX0RBVEFfU1lOQ19DT05GSUdVUkFUSU9OX1NDT1BFLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdGlmIChyZW1vdGVTZXR0aW5nc1N5bmNDb250ZW50Py5zZXR0aW5ncykge1xuXHRcdFx0cGFyc2VyLnBhcnNlKHJlbW90ZVNldHRpbmdzU3luY0NvbnRlbnQuc2V0dGluZ3MpO1xuXHRcdH1cblx0XHRyZXR1cm4gcGFyc2VyLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZShVU0VSX0RBVEFfU1lOQ19DT05GSUdVUkFUSU9OX1NDT1BFKSB8fCB7fTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZW5lcmF0ZVN5bmNQcmV2aWV3KHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSB8IG51bGwsIGlzUmVtb3RlRGF0YUZyb21DdXJyZW50TWFjaGluZTogYm9vbGVhbik6IFByb21pc2U8SVNldHRpbmdzUmVzb3VyY2VQcmV2aWV3W10+IHtcblx0XHRjb25zdCBmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuZ2V0TG9jYWxGaWxlQ29udGVudCgpO1xuXHRcdGNvbnN0IGZvcm1hdHRpbmdPcHRpb25zID0gYXdhaXQgdGhpcy5nZXRGb3JtYXR0aW5nT3B0aW9ucygpO1xuXHRcdGNvbnN0IHJlbW90ZVNldHRpbmdzU3luY0NvbnRlbnQgPSB0aGlzLmdldFNldHRpbmdzU3luY0NvbnRlbnQocmVtb3RlVXNlckRhdGEpO1xuXG5cdFx0Ly8gVXNlIHJlbW90ZSBkYXRhIGFzIGxhc3Qgc3luYyBkYXRhIGlmIGxhc3Qgc3luYyBkYXRhIGRvZXMgbm90IGV4aXN0IGFuZCByZW1vdGUgZGF0YSBpcyBmcm9tIHNhbWUgbWFjaGluZVxuXHRcdGxhc3RTeW5jVXNlckRhdGEgPSBsYXN0U3luY1VzZXJEYXRhID09PSBudWxsICYmIGlzUmVtb3RlRGF0YUZyb21DdXJyZW50TWFjaGluZSA/IHJlbW90ZVVzZXJEYXRhIDogbGFzdFN5bmNVc2VyRGF0YTtcblx0XHRjb25zdCBsYXN0U2V0dGluZ3NTeW5jQ29udGVudDogSVNldHRpbmdzU3luY0NvbnRlbnQgfCBudWxsID0gbGFzdFN5bmNVc2VyRGF0YSA/IHRoaXMuZ2V0U2V0dGluZ3NTeW5jQ29udGVudChsYXN0U3luY1VzZXJEYXRhKSA6IG51bGw7XG5cdFx0Y29uc3QgaWdub3JlZFNldHRpbmdzID0gYXdhaXQgdGhpcy5nZXRJZ25vcmVkU2V0dGluZ3MoKTtcblxuXHRcdGxldCBtZXJnZWRDb250ZW50OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgaGFzTG9jYWxDaGFuZ2VkOiBib29sZWFuID0gZmFsc2U7XG5cdFx0bGV0IGhhc1JlbW90ZUNoYW5nZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRsZXQgaGFzQ29uZmxpY3RzOiBib29sZWFuID0gZmFsc2U7XG5cblx0XHRpZiAocmVtb3RlU2V0dGluZ3NTeW5jQ29udGVudCkge1xuXHRcdFx0bGV0IGxvY2FsQ29udGVudDogc3RyaW5nID0gZmlsZUNvbnRlbnQgPyBmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpLnRyaW0oKSA6ICd7fSc7XG5cdFx0XHRsb2NhbENvbnRlbnQgPSBsb2NhbENvbnRlbnQgfHwgJ3t9Jztcblx0XHRcdHRoaXMudmFsaWRhdGVDb250ZW50KGxvY2FsQ29udGVudCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IE1lcmdpbmcgcmVtb3RlIHNldHRpbmdzIHdpdGggbG9jYWwgc2V0dGluZ3MuLi5gKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlU2V0dGluZ3NTeW5jQ29udGVudC5zZXR0aW5ncywgbGFzdFNldHRpbmdzU3luY0NvbnRlbnQgPyBsYXN0U2V0dGluZ3NTeW5jQ29udGVudC5zZXR0aW5ncyA6IG51bGwsIGlnbm9yZWRTZXR0aW5ncywgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRcdG1lcmdlZENvbnRlbnQgPSByZXN1bHQubG9jYWxDb250ZW50IHx8IHJlc3VsdC5yZW1vdGVDb250ZW50O1xuXHRcdFx0aGFzTG9jYWxDaGFuZ2VkID0gcmVzdWx0LmxvY2FsQ29udGVudCAhPT0gbnVsbDtcblx0XHRcdGhhc1JlbW90ZUNoYW5nZWQgPSByZXN1bHQucmVtb3RlQ29udGVudCAhPT0gbnVsbDtcblx0XHRcdGhhc0NvbmZsaWN0cyA9IHJlc3VsdC5oYXNDb25mbGljdHM7XG5cdFx0fVxuXG5cdFx0Ly8gRmlyc3QgdGltZSBzeW5jaW5nIHRvIHJlbW90ZVxuXHRcdGVsc2UgaWYgKGZpbGVDb250ZW50KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFJlbW90ZSBzZXR0aW5ncyBkb2VzIG5vdCBleGlzdC4gU3luY2hyb25pemluZyBzZXR0aW5ncyBmb3IgdGhlIGZpcnN0IHRpbWUuYCk7XG5cdFx0XHRtZXJnZWRDb250ZW50ID0gZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKS50cmltKCkgfHwgJ3t9Jztcblx0XHRcdHRoaXMudmFsaWRhdGVDb250ZW50KG1lcmdlZENvbnRlbnQpO1xuXHRcdFx0aGFzUmVtb3RlQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gZmlsZUNvbnRlbnQgPyBmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpIDogbnVsbDtcblx0XHRjb25zdCBiYXNlQ29udGVudCA9IGxhc3RTZXR0aW5nc1N5bmNDb250ZW50Py5zZXR0aW5ncyA/PyBudWxsO1xuXG5cdFx0Y29uc3QgcHJldmlld1Jlc3VsdCA9IHtcblx0XHRcdGNvbnRlbnQ6IGhhc0NvbmZsaWN0cyA/IGJhc2VDb250ZW50IDogbWVyZ2VkQ29udGVudCxcblx0XHRcdGxvY2FsQ2hhbmdlOiBoYXNMb2NhbENoYW5nZWQgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuTm9uZSxcblx0XHRcdHJlbW90ZUNoYW5nZTogaGFzUmVtb3RlQ2hhbmdlZCA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5Ob25lLFxuXHRcdFx0aGFzQ29uZmxpY3RzXG5cdFx0fTtcblxuXHRcdHJldHVybiBbe1xuXHRcdFx0ZmlsZUNvbnRlbnQsXG5cblx0XHRcdGJhc2VSZXNvdXJjZTogdGhpcy5iYXNlUmVzb3VyY2UsXG5cdFx0XHRiYXNlQ29udGVudCxcblxuXHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5sb2NhbFJlc291cmNlLFxuXHRcdFx0bG9jYWxDb250ZW50LFxuXHRcdFx0bG9jYWxDaGFuZ2U6IHByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cblx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLnJlbW90ZVJlc291cmNlLFxuXHRcdFx0cmVtb3RlQ29udGVudDogcmVtb3RlU2V0dGluZ3NTeW5jQ29udGVudCA/IHJlbW90ZVNldHRpbmdzU3luY0NvbnRlbnQuc2V0dGluZ3MgOiBudWxsLFxuXHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblxuXHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLnByZXZpZXdSZXNvdXJjZSxcblx0XHRcdHByZXZpZXdSZXN1bHQsXG5cdFx0XHRhY2NlcHRlZFJlc291cmNlOiB0aGlzLmFjY2VwdGVkUmVzb3VyY2UsXG5cdFx0fV07XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgaGFzUmVtb3RlQ2hhbmdlZChsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBsYXN0U2V0dGluZ3NTeW5jQ29udGVudDogSVNldHRpbmdzU3luY0NvbnRlbnQgfCBudWxsID0gdGhpcy5nZXRTZXR0aW5nc1N5bmNDb250ZW50KGxhc3RTeW5jVXNlckRhdGEpO1xuXHRcdGlmIChsYXN0U2V0dGluZ3NTeW5jQ29udGVudCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnQgPSBhd2FpdCB0aGlzLmdldExvY2FsRmlsZUNvbnRlbnQoKTtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQ6IHN0cmluZyA9IGZpbGVDb250ZW50ID8gZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKS50cmltKCkgOiAnJztcblx0XHRjb25zdCBpZ25vcmVkU2V0dGluZ3MgPSBhd2FpdCB0aGlzLmdldElnbm9yZWRTZXR0aW5ncygpO1xuXHRcdGNvbnN0IGZvcm1hdHRpbmdPcHRpb25zID0gYXdhaXQgdGhpcy5nZXRGb3JtYXR0aW5nT3B0aW9ucygpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG1lcmdlKGxvY2FsQ29udGVudCB8fCAne30nLCBsYXN0U2V0dGluZ3NTeW5jQ29udGVudC5zZXR0aW5ncywgbGFzdFNldHRpbmdzU3luY0NvbnRlbnQuc2V0dGluZ3MsIGlnbm9yZWRTZXR0aW5ncywgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRyZXR1cm4gcmVzdWx0LnJlbW90ZUNvbnRlbnQgIT09IG51bGw7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0TWVyZ2VSZXN1bHQocmVzb3VyY2VQcmV2aWV3OiBJU2V0dGluZ3NSZXNvdXJjZVByZXZpZXcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SU1lcmdlUmVzdWx0PiB7XG5cdFx0Y29uc3QgZm9ybWF0VXRpbHMgPSBhd2FpdCB0aGlzLmdldEZvcm1hdHRpbmdPcHRpb25zKCk7XG5cdFx0Y29uc3QgaWdub3JlZFNldHRpbmdzID0gYXdhaXQgdGhpcy5nZXRJZ25vcmVkU2V0dGluZ3MoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4ucmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQsXG5cblx0XHRcdC8vIHJlbW92ZSBpZ25vcmVkIHNldHRpbmdzIGZyb20gdGhlIHByZXZpZXcgY29udGVudFxuXHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQuY29udGVudCA/IHVwZGF0ZUlnbm9yZWRTZXR0aW5ncyhyZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdC5jb250ZW50LCAne30nLCBpZ25vcmVkU2V0dGluZ3MsIGZvcm1hdFV0aWxzKSA6IG51bGxcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldEFjY2VwdFJlc3VsdChyZXNvdXJjZVByZXZpZXc6IElTZXR0aW5nc1Jlc291cmNlUHJldmlldywgcmVzb3VyY2U6IFVSSSwgY29udGVudDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWNjZXB0UmVzdWx0PiB7XG5cblx0XHRjb25zdCBmb3JtYXR0aW5nT3B0aW9ucyA9IGF3YWl0IHRoaXMuZ2V0Rm9ybWF0dGluZ09wdGlvbnMoKTtcblx0XHRjb25zdCBpZ25vcmVkU2V0dGluZ3MgPSBhd2FpdCB0aGlzLmdldElnbm9yZWRTZXR0aW5ncygpO1xuXG5cdFx0LyogQWNjZXB0IGxvY2FsIHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwocmVzb3VyY2UsIHRoaXMubG9jYWxSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC8qIFJlbW92ZSBpZ25vcmVkIHNldHRpbmdzICovXG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5maWxlQ29udGVudCA/IHVwZGF0ZUlnbm9yZWRTZXR0aW5ncyhyZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJ3t9JywgaWdub3JlZFNldHRpbmdzLCBmb3JtYXR0aW5nT3B0aW9ucykgOiBudWxsLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk1vZGlmaWVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvKiBBY2NlcHQgcmVtb3RlIHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwocmVzb3VyY2UsIHRoaXMucmVtb3RlUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQvKiBVcGRhdGUgaWdub3JlZCBzZXR0aW5ncyBmcm9tIGxvY2FsIGZpbGUgY29udGVudCAqL1xuXHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCAhPT0gbnVsbCA/IHVwZGF0ZUlnbm9yZWRTZXR0aW5ncyhyZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCwgcmVzb3VyY2VQcmV2aWV3LmZpbGVDb250ZW50ID8gcmVzb3VyY2VQcmV2aWV3LmZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkgOiAne30nLCBpZ25vcmVkU2V0dGluZ3MsIGZvcm1hdHRpbmdPcHRpb25zKSA6IG51bGwsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTW9kaWZpZWQsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8qIEFjY2VwdCBwcmV2aWV3IHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWwocmVzb3VyY2UsIHRoaXMucHJldmlld1Jlc291cmNlKSkge1xuXHRcdFx0aWYgKGNvbnRlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5wcmV2aWV3UmVzdWx0LmNvbnRlbnQsXG5cdFx0XHRcdFx0bG9jYWxDaGFuZ2U6IHJlc291cmNlUHJldmlldy5wcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0XHRcdHJlbW90ZUNoYW5nZTogcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQvKiBBZGQgaWdub3JlZCBzZXR0aW5ncyBmcm9tIGxvY2FsIGZpbGUgY29udGVudCAqL1xuXHRcdFx0XHRcdGNvbnRlbnQ6IGNvbnRlbnQgIT09IG51bGwgPyB1cGRhdGVJZ25vcmVkU2V0dGluZ3MoY29udGVudCwgcmVzb3VyY2VQcmV2aWV3LmZpbGVDb250ZW50ID8gcmVzb3VyY2VQcmV2aWV3LmZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkgOiAne30nLCBpZ25vcmVkU2V0dGluZ3MsIGZvcm1hdHRpbmdPcHRpb25zKSA6IG51bGwsXG5cdFx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgUmVzb3VyY2U6ICR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBhcHBseVJlc3VsdChyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCByZXNvdXJjZVByZXZpZXdzOiBbSVNldHRpbmdzUmVzb3VyY2VQcmV2aWV3LCBJQWNjZXB0UmVzdWx0XVtdLCBmb3JjZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgZmlsZUNvbnRlbnQgfSA9IHJlc291cmNlUHJldmlld3NbMF1bMF07XG5cdFx0bGV0IHsgY29udGVudCwgbG9jYWxDaGFuZ2UsIHJlbW90ZUNoYW5nZSB9ID0gcmVzb3VyY2VQcmV2aWV3c1swXVsxXTtcblxuXHRcdGlmIChsb2NhbENoYW5nZSA9PT0gQ2hhbmdlLk5vbmUgJiYgcmVtb3RlQ2hhbmdlID09PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IE5vIGNoYW5nZXMgZm91bmQgZHVyaW5nIHN5bmNocm9uaXppbmcgc2V0dGluZ3MuYCk7XG5cdFx0fVxuXG5cdFx0Y29udGVudCA9IGNvbnRlbnQgPyBjb250ZW50LnRyaW0oKSA6ICd7fSc7XG5cdFx0Y29udGVudCA9IGNvbnRlbnQgfHwgJ3t9Jztcblx0XHR0aGlzLnZhbGlkYXRlQ29udGVudChjb250ZW50KTtcblxuXHRcdGlmIChsb2NhbENoYW5nZSAhPT0gQ2hhbmdlLk5vbmUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRpbmcgbG9jYWwgc2V0dGluZ3MuLi5gKTtcblx0XHRcdGlmIChmaWxlQ29udGVudCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmJhY2t1cExvY2FsKEpTT04uc3RyaW5naWZ5KHRoaXMudG9TZXR0aW5nc1N5bmNDb250ZW50KGZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpKSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUxvY2FsRmlsZUNvbnRlbnQoY29udGVudCwgZmlsZUNvbnRlbnQsIGZvcmNlKTtcblx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UucmVsb2FkQ29uZmlndXJhdGlvbihDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0ZWQgbG9jYWwgc2V0dGluZ3NgKTtcblx0XHR9XG5cblx0XHRpZiAocmVtb3RlQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0Y29uc3QgZm9ybWF0VXRpbHMgPSBhd2FpdCB0aGlzLmdldEZvcm1hdHRpbmdPcHRpb25zKCk7XG5cdFx0XHQvLyBVcGRhdGUgaWdub3JlZCBzZXR0aW5ncyBmcm9tIHJlbW90ZVxuXHRcdFx0Y29uc3QgcmVtb3RlU2V0dGluZ3NTeW5jQ29udGVudCA9IHRoaXMuZ2V0U2V0dGluZ3NTeW5jQ29udGVudChyZW1vdGVVc2VyRGF0YSk7XG5cdFx0XHRjb25zdCBpZ25vcmVkU2V0dGluZ3MgPSBhd2FpdCB0aGlzLmdldElnbm9yZWRTZXR0aW5ncyhjb250ZW50KTtcblx0XHRcdGNvbnRlbnQgPSB1cGRhdGVJZ25vcmVkU2V0dGluZ3MoY29udGVudCwgcmVtb3RlU2V0dGluZ3NTeW5jQ29udGVudCA/IHJlbW90ZVNldHRpbmdzU3luY0NvbnRlbnQuc2V0dGluZ3MgOiAne30nLCBpZ25vcmVkU2V0dGluZ3MsIGZvcm1hdFV0aWxzKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRpbmcgcmVtb3RlIHNldHRpbmdzLi4uYCk7XG5cdFx0XHRyZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRoaXMudXBkYXRlUmVtb3RlVXNlckRhdGEoSlNPTi5zdHJpbmdpZnkodGhpcy50b1NldHRpbmdzU3luY0NvbnRlbnQoY29udGVudCkpLCBmb3JjZSA/IG51bGwgOiByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0ZWQgcmVtb3RlIHNldHRpbmdzYCk7XG5cdFx0fVxuXG5cdFx0Ly8gRGVsZXRlIHRoZSBwcmV2aWV3XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHRoaXMucHJldmlld1Jlc291cmNlKTtcblx0XHR9IGNhdGNoIChlKSB7IC8qIGlnbm9yZSAqLyB9XG5cblx0XHRpZiAobGFzdFN5bmNVc2VyRGF0YT8ucmVmICE9PSByZW1vdGVVc2VyRGF0YS5yZWYpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRpbmcgbGFzdCBzeW5jaHJvbml6ZWQgc2V0dGluZ3MuLi5gKTtcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTGFzdFN5bmNVc2VyRGF0YShyZW1vdGVVc2VyRGF0YSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBsYXN0IHN5bmNocm9uaXplZCBzZXR0aW5nc2ApO1xuXHRcdH1cblxuXHR9XG5cblx0YXN5bmMgaGFzTG9jYWxEYXRhKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBsb2NhbEZpbGVDb250ZW50ID0gYXdhaXQgdGhpcy5nZXRMb2NhbEZpbGVDb250ZW50KCk7XG5cdFx0XHRpZiAobG9jYWxGaWxlQ29udGVudCkge1xuXHRcdFx0XHRyZXR1cm4gIWlzRW1wdHkobG9jYWxGaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlQ29udGVudCh1cmk6IFVSSSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsKHRoaXMucmVtb3RlUmVzb3VyY2UsIHVyaSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWwodGhpcy5sb2NhbFJlc291cmNlLCB1cmkpXG5cdFx0XHR8fCB0aGlzLmV4dFVyaS5pc0VxdWFsKHRoaXMuYWNjZXB0ZWRSZXNvdXJjZSwgdXJpKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbCh0aGlzLmJhc2VSZXNvdXJjZSwgdXJpKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZVByZXZpZXdDb250ZW50KHVyaSk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIHJlc29sdmVQcmV2aWV3Q29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0bGV0IGNvbnRlbnQgPSBhd2FpdCBzdXBlci5yZXNvbHZlUHJldmlld0NvbnRlbnQocmVzb3VyY2UpO1xuXHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRjb25zdCBmb3JtYXRVdGlscyA9IGF3YWl0IHRoaXMuZ2V0Rm9ybWF0dGluZ09wdGlvbnMoKTtcblx0XHRcdC8vIHJlbW92ZSBpZ25vcmVkIHNldHRpbmdzIGZyb20gdGhlIHByZXZpZXcgY29udGVudFxuXHRcdFx0Y29uc3QgaWdub3JlZFNldHRpbmdzID0gYXdhaXQgdGhpcy5nZXRJZ25vcmVkU2V0dGluZ3MoKTtcblx0XHRcdGNvbnRlbnQgPSB1cGRhdGVJZ25vcmVkU2V0dGluZ3MoY29udGVudCwgJ3t9JywgaWdub3JlZFNldHRpbmdzLCBmb3JtYXRVdGlscyk7XG5cdFx0fVxuXHRcdHJldHVybiBjb250ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXR0aW5nc1N5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEpOiBJU2V0dGluZ3NTeW5jQ29udGVudCB8IG51bGwge1xuXHRcdHJldHVybiByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSA/IHRoaXMucGFyc2VTZXR0aW5nc1N5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhLmNvbnRlbnQpIDogbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VTZXR0aW5nc1N5bmNDb250ZW50KHN5bmNDb250ZW50OiBzdHJpbmcpOiBJU2V0dGluZ3NTeW5jQ29udGVudCB8IG51bGwge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gcGFyc2VTZXR0aW5nc1N5bmNDb250ZW50KHN5bmNDb250ZW50KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1NldHRpbmdzU3luY0NvbnRlbnQoc2V0dGluZ3M6IHN0cmluZyk6IElTZXR0aW5nc1N5bmNDb250ZW50IHtcblx0XHRyZXR1cm4geyBzZXR0aW5ncyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBjb3JlSWdub3JlZFNldHRpbmdzOiBQcm9taXNlPHN0cmluZ1tdPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzeXN0ZW1FeHRlbnNpb25zSWdub3JlZFNldHRpbmdzOiBQcm9taXNlPHN0cmluZ1tdPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB1c2VyRXh0ZW5zaW9uc0lnbm9yZWRTZXR0aW5nczogUHJvbWlzZTxzdHJpbmdbXT4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXN5bmMgZ2V0SWdub3JlZFNldHRpbmdzKGNvbnRlbnQ/OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0aWYgKCF0aGlzLmNvcmVJZ25vcmVkU2V0dGluZ3MpIHtcblx0XHRcdHRoaXMuY29yZUlnbm9yZWRTZXR0aW5ncyA9IHRoaXMudXNlckRhdGFTeW5jVXRpbFNlcnZpY2UucmVzb2x2ZURlZmF1bHRDb3JlSWdub3JlZFNldHRpbmdzKCk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5zeXN0ZW1FeHRlbnNpb25zSWdub3JlZFNldHRpbmdzKSB7XG5cdFx0XHR0aGlzLnN5c3RlbUV4dGVuc2lvbnNJZ25vcmVkU2V0dGluZ3MgPSB0aGlzLmdldElnbm9yZWRTZXR0aW5nRm9yU3lzdGVtRXh0ZW5zaW9ucygpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMudXNlckV4dGVuc2lvbnNJZ25vcmVkU2V0dGluZ3MpIHtcblx0XHRcdHRoaXMudXNlckV4dGVuc2lvbnNJZ25vcmVkU2V0dGluZ3MgPSB0aGlzLmdldElnbm9yZWRTZXR0aW5nRm9yVXNlckV4dGVuc2lvbnMoKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihFdmVudC5hbnk8YW55Pihcblx0XHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRJbnN0YWxsRXh0ZW5zaW9ucywgKGUgPT4gZS5zb21lKCh7IGxvY2FsIH0pID0+ICEhbG9jYWwpKSksXG5cdFx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uLCAoZSA9PiAhZS5lcnJvcikpKSgoKSA9PiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy51c2VyRXh0ZW5zaW9uc0lnbm9yZWRTZXR0aW5ncyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fSkpO1xuXHRcdH1cblx0XHRjb25zdCBkZWZhdWx0SWdub3JlZFNldHRpbmdzID0gKGF3YWl0IFByb21pc2UuYWxsKFt0aGlzLmNvcmVJZ25vcmVkU2V0dGluZ3MsIHRoaXMuc3lzdGVtRXh0ZW5zaW9uc0lnbm9yZWRTZXR0aW5ncywgdGhpcy51c2VyRXh0ZW5zaW9uc0lnbm9yZWRTZXR0aW5nc10pKS5mbGF0KCk7XG5cdFx0cmV0dXJuIGdldElnbm9yZWRTZXR0aW5ncyhkZWZhdWx0SWdub3JlZFNldHRpbmdzLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0SWdub3JlZFNldHRpbmdGb3JTeXN0ZW1FeHRlbnNpb25zKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCBzeXN0ZW1FeHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoRXh0ZW5zaW9uVHlwZS5TeXN0ZW0pO1xuXHRcdHJldHVybiBkaXN0aW5jdChzeXN0ZW1FeHRlbnNpb25zLm1hcChlID0+IGdldElnbm9yZWRTZXR0aW5nc0ZvckV4dGVuc2lvbihlLm1hbmlmZXN0KSkuZmxhdCgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0SWdub3JlZFNldHRpbmdGb3JVc2VyRXh0ZW5zaW9ucygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgdXNlckV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIsIHRoaXMucHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdHJldHVybiBkaXN0aW5jdCh1c2VyRXh0ZW5zaW9ucy5tYXAoZSA9PiBnZXRJZ25vcmVkU2V0dGluZ3NGb3JFeHRlbnNpb24oZS5tYW5pZmVzdCkpLmZsYXQoKSk7XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlQ29udGVudChjb250ZW50OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oYXNFcnJvcnMoY29udGVudCwgZmFsc2UpKSB7XG5cdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jRXJyb3IobG9jYWxpemUoJ2Vycm9ySW52YWxpZFNldHRpbmdzJywgXCJVbmFibGUgdG8gc3luYyBzZXR0aW5ncyBhcyB0aGVyZSBhcmUgZXJyb3JzL3dhcm5pbmcgaW4gc2V0dGluZ3MgZmlsZS5cIiksIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Mb2NhbEludmFsaWRDb250ZW50LCB0aGlzLnJlc291cmNlKTtcblx0XHR9XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NJbml0aWFsaXplciBleHRlbmRzIEFic3RyYWN0SW5pdGlhbGl6ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGxvZ1NlcnZpY2UsIGZpbGVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBkb0luaXRpYWxpemUocmVtb3RlVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNldHRpbmdzU3luY0NvbnRlbnQgPSByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSA/IHRoaXMucGFyc2VTZXR0aW5nc1N5bmNDb250ZW50KHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhLmNvbnRlbnQpIDogbnVsbDtcblx0XHRpZiAoIXNldHRpbmdzU3luY0NvbnRlbnQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTa2lwcGluZyBpbml0aWFsaXppbmcgc2V0dGluZ3MgYmVjYXVzZSByZW1vdGUgc2V0dGluZ3MgZG9lcyBub3QgZXhpc3QuJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNFbXB0eSA9IGF3YWl0IHRoaXMuaXNFbXB0eSgpO1xuXHRcdGlmICghaXNFbXB0eSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1NraXBwaW5nIGluaXRpYWxpemluZyBzZXR0aW5ncyBiZWNhdXNlIGxvY2FsIHNldHRpbmdzIGV4aXN0LicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhzZXR0aW5nc1N5bmNDb250ZW50LnNldHRpbmdzKSk7XG5cblx0XHRhd2FpdCB0aGlzLnVwZGF0ZUxhc3RTeW5jVXNlckRhdGEocmVtb3RlVXNlckRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpc0VtcHR5KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlKTtcblx0XHRcdHJldHVybiBpc0VtcHR5KGZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkudHJpbSgpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuICg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcGFyc2VTZXR0aW5nc1N5bmNDb250ZW50KHN5bmNDb250ZW50OiBzdHJpbmcpOiBJU2V0dGluZ3NTeW5jQ29udGVudCB8IG51bGwge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gcGFyc2VTZXR0aW5nc1N5bmNDb250ZW50KHN5bmNDb250ZW50KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxhQUFhO0FBRXRCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHFCQUFxQjtBQUM5QixTQUE2QixxQkFBcUIsb0JBQW9CO0FBQ3RFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQTJCLGdDQUFnQztBQUMzRCxTQUFTLHFCQUFxQixvQ0FBdUY7QUFDckgsU0FBUyxvQkFBb0IsU0FBUyxPQUFPLDZCQUE2QjtBQUMxRSxTQUFTLFFBQXlCLGdDQUFtRix5QkFBeUIsZ0NBQWdDLDJCQUEyQiwwQkFBMEIsY0FBYyxtQkFBbUIsdUJBQXVCLG9DQUFvQyx1QkFBdUIsc0NBQWlEO0FBVXZZLFNBQVMsc0JBQXNCLE9BQTJDO0FBQ3pFLFNBQU8sVUFDRixNQUFNLFlBQVksT0FBTyxNQUFNLGFBQWEsYUFDN0MsT0FBTyxLQUFLLEtBQUssRUFBRSxXQUFXO0FBQ25DO0FBRU8sU0FBUyx5QkFBeUIsYUFBMkM7QUFDbkYsUUFBTSxTQUErQixLQUFLLE1BQU0sV0FBVztBQUMzRCxTQUFPLHNCQUFzQixNQUFNLElBQUk7QUFBQTtBQUFBLElBQXVCLEVBQUUsVUFBVSxZQUFZO0FBQUE7QUFDdkY7QUFFTyxJQUFNLHVCQUFOLGNBQW1DLDZCQUE4RDtBQUFBLEVBVXZHLFlB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RUFBdUUsR0FBRyxzQkFBc0IscUJBQXFCLEtBQUssUUFBUTtBQUFBLElBQ2hNO0FBQUEsRUFDRDtBQUVEO0FBMVRhLHVCQUFOO0FBQUEsRUFhSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F4QlU7QUE0VE4sSUFBTSxzQkFBTixjQUFrQyxvQkFBb0I7QUFBQSxFQUU1RCxZQUNlLGFBQ1kseUJBQ0wsb0JBQ0ksWUFDUixnQkFDSSxvQkFDcEI7QUFDRCxVQUFNLGFBQWEsVUFBVSx5QkFBeUIsb0JBQW9CLFlBQVksYUFBYSxnQkFBZ0Isa0JBQWtCO0FBQUEsRUFDdEk7QUFBQSxFQUVBLE1BQWdCLGFBQWEsZ0JBQWdEO0FBQzVFLFVBQU0sc0JBQXNCLGVBQWUsV0FBVyxLQUFLLHlCQUF5QixlQUFlLFNBQVMsT0FBTyxJQUFJO0FBQ3ZILFFBQUksQ0FBQyxxQkFBcUI7QUFDekIsV0FBSyxXQUFXLEtBQUssd0VBQXdFO0FBQzdGO0FBQUEsSUFDRDtBQUVBLFVBQU1DLFdBQVUsTUFBTSxLQUFLLFFBQVE7QUFDbkMsUUFBSSxDQUFDQSxVQUFTO0FBQ2IsV0FBSyxXQUFXLEtBQUssOERBQThEO0FBQ25GO0FBQUEsSUFDRDtBQUVBLFVBQU0sS0FBSyxZQUFZLFVBQVUsS0FBSyx3QkFBd0IsZUFBZSxrQkFBa0IsU0FBUyxXQUFXLG9CQUFvQixRQUFRLENBQUM7QUFFaEosVUFBTSxLQUFLLHVCQUF1QixjQUFjO0FBQUEsRUFDakQ7QUFBQSxFQUVBLE1BQWMsVUFBNEI7QUFDekMsUUFBSTtBQUNILFlBQU0sY0FBYyxNQUFNLEtBQUssWUFBWSxTQUFTLEtBQUssd0JBQXdCLGVBQWUsZ0JBQWdCO0FBQ2hILGFBQU8sUUFBUSxZQUFZLE1BQU0sU0FBUyxFQUFFLEtBQUssQ0FBQztBQUFBLElBQ25ELFNBQVMsT0FBTztBQUNmLGFBQTRCLE1BQU8sd0JBQXdCLG9CQUFvQjtBQUFBLElBQ2hGO0FBQUEsRUFDRDtBQUFBLEVBRVEseUJBQXlCLGFBQWtEO0FBQ2xGLFFBQUk7QUFDSCxhQUFPLHlCQUF5QixXQUFXO0FBQUEsSUFDNUMsU0FBUyxHQUFHO0FBQ1gsV0FBSyxXQUFXLE1BQU0sQ0FBQztBQUFBLElBQ3hCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFFRDtBQWpEYSxzQkFBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUlU7IiwKICAibmFtZXMiOiBbImxvY2FsQ29udGVudCIsICJpc0VtcHR5Il0KfQo=
