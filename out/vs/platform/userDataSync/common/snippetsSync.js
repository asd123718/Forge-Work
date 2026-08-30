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
import { VSBuffer } from "../../../base/common/buffer.js";
import { Event } from "../../../base/common/event.js";
import { deepClone } from "../../../base/common/objects.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationError, FileOperationResult, IFileService } from "../../files/common/files.js";
import { IStorageService } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { AbstractInitializer, AbstractSynchroniser } from "./abstractSynchronizer.js";
import { areSame, merge } from "./snippetsMerge.js";
import { Change, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, USER_DATA_SYNC_SCHEME } from "./userDataSync.js";
function parseSnippets(syncData) {
  return JSON.parse(syncData.content);
}
let SnippetsSynchroniser = class extends AbstractSynchroniser {
  constructor(profile, collection, environmentService, fileService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, logService, configurationService, userDataSyncEnablementService, telemetryService, uriIdentityService) {
    super({ syncResource: SyncResource.Snippets, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
    this.version = 1;
    this.snippetsFolder = profile.snippetsHome;
    this._register(this.fileService.watch(environmentService.userRoamingDataHome));
    this._register(this.fileService.watch(this.snippetsFolder));
    this._register(Event.filter(this.fileService.onDidFilesChange, (e) => e.affects(this.snippetsFolder))(() => this.triggerLocalChange()));
  }
  async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine) {
    const local = await this.getSnippetsFileContents();
    const localSnippets = this.toSnippetsContents(local);
    const remoteSnippets = remoteUserData.syncData ? this.parseSnippets(remoteUserData.syncData) : null;
    lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
    const lastSyncSnippets = lastSyncUserData && lastSyncUserData.syncData ? this.parseSnippets(lastSyncUserData.syncData) : null;
    if (remoteSnippets) {
      this.logService.trace(`${this.syncResourceLogLabel}: Merging remote snippets with local snippets...`);
    } else {
      this.logService.trace(`${this.syncResourceLogLabel}: Remote snippets does not exist. Synchronizing snippets for the first time.`);
    }
    const mergeResult = merge(localSnippets, remoteSnippets, lastSyncSnippets);
    return this.getResourcePreviews(mergeResult, local, remoteSnippets || {}, lastSyncSnippets || {});
  }
  async hasRemoteChanged(lastSyncUserData) {
    const lastSyncSnippets = lastSyncUserData.syncData ? this.parseSnippets(lastSyncUserData.syncData) : null;
    if (lastSyncSnippets === null) {
      return true;
    }
    const local = await this.getSnippetsFileContents();
    const localSnippets = this.toSnippetsContents(local);
    const mergeResult = merge(localSnippets, lastSyncSnippets, lastSyncSnippets);
    return Object.keys(mergeResult.remote.added).length > 0 || Object.keys(mergeResult.remote.updated).length > 0 || mergeResult.remote.removed.length > 0 || mergeResult.conflicts.length > 0;
  }
  async getMergeResult(resourcePreview, token) {
    return resourcePreview.previewResult;
  }
  async getAcceptResult(resourcePreview, resource, content, token) {
    if (this.extUri.isEqualOrParent(resource, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }))) {
      return {
        content: resourcePreview.fileContent ? resourcePreview.fileContent.value.toString() : null,
        localChange: Change.None,
        remoteChange: resourcePreview.fileContent ? resourcePreview.remoteContent !== null ? Change.Modified : Change.Added : Change.Deleted
      };
    }
    if (this.extUri.isEqualOrParent(resource, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }))) {
      return {
        content: resourcePreview.remoteContent,
        localChange: resourcePreview.remoteContent !== null ? resourcePreview.fileContent ? Change.Modified : Change.Added : Change.Deleted,
        remoteChange: Change.None
      };
    }
    if (this.extUri.isEqualOrParent(resource, this.syncPreviewFolder)) {
      if (content === void 0) {
        return {
          content: resourcePreview.previewResult.content,
          localChange: resourcePreview.previewResult.localChange,
          remoteChange: resourcePreview.previewResult.remoteChange
        };
      } else {
        return {
          content,
          localChange: content === null ? resourcePreview.fileContent !== null ? Change.Deleted : Change.None : Change.Modified,
          remoteChange: content === null ? resourcePreview.remoteContent !== null ? Change.Deleted : Change.None : Change.Modified
        };
      }
    }
    throw new Error(`Invalid Resource: ${resource.toString()}`);
  }
  async applyResult(remoteUserData, lastSyncUserData, resourcePreviews, force) {
    const accptedResourcePreviews = resourcePreviews.map(([resourcePreview, acceptResult]) => ({ ...resourcePreview, acceptResult }));
    if (accptedResourcePreviews.every(({ localChange, remoteChange }) => localChange === Change.None && remoteChange === Change.None)) {
      this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing snippets.`);
    }
    if (accptedResourcePreviews.some(({ localChange }) => localChange !== Change.None)) {
      await this.updateLocalBackup(accptedResourcePreviews);
      await this.updateLocalSnippets(accptedResourcePreviews, force);
    }
    if (accptedResourcePreviews.some(({ remoteChange }) => remoteChange !== Change.None)) {
      remoteUserData = await this.updateRemoteSnippets(accptedResourcePreviews, remoteUserData, force);
    }
    if (lastSyncUserData?.ref !== remoteUserData.ref) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized snippets...`);
      await this.updateLastSyncUserData(remoteUserData);
      this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized snippets`);
    }
    for (const { previewResource } of accptedResourcePreviews) {
      try {
        await this.fileService.del(previewResource);
      } catch (e) {
      }
    }
  }
  getResourcePreviews(snippetsMergeResult, localFileContent, remoteSnippets, baseSnippets) {
    const resourcePreviews = /* @__PURE__ */ new Map();
    for (const key of Object.keys(snippetsMergeResult.local.added)) {
      const previewResult = {
        content: snippetsMergeResult.local.added[key],
        hasConflicts: false,
        localChange: Change.Added,
        remoteChange: Change.None
      };
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: null,
        fileContent: null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        localContent: null,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remoteSnippets[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of Object.keys(snippetsMergeResult.local.updated)) {
      const previewResult = {
        content: snippetsMergeResult.local.updated[key],
        hasConflicts: false,
        localChange: Change.Modified,
        remoteChange: Change.None
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: baseSnippets[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key],
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remoteSnippets[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of snippetsMergeResult.local.removed) {
      const previewResult = {
        content: null,
        hasConflicts: false,
        localChange: Change.Deleted,
        remoteChange: Change.None
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: baseSnippets[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key],
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: null,
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of Object.keys(snippetsMergeResult.remote.added)) {
      const previewResult = {
        content: snippetsMergeResult.remote.added[key],
        hasConflicts: false,
        localChange: Change.None,
        remoteChange: Change.Added
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: baseSnippets[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key],
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: null,
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of Object.keys(snippetsMergeResult.remote.updated)) {
      const previewResult = {
        content: snippetsMergeResult.remote.updated[key],
        hasConflicts: false,
        localChange: Change.None,
        remoteChange: Change.Modified
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: baseSnippets[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key],
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remoteSnippets[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of snippetsMergeResult.remote.removed) {
      const previewResult = {
        content: null,
        hasConflicts: false,
        localChange: Change.None,
        remoteChange: Change.Deleted
      };
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: baseSnippets[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: null,
        localContent: null,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remoteSnippets[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of snippetsMergeResult.conflicts) {
      const previewResult = {
        content: baseSnippets[key] ?? null,
        hasConflicts: true,
        localChange: localFileContent[key] ? Change.Modified : Change.Added,
        remoteChange: remoteSnippets[key] ? Change.Modified : Change.Added
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: baseSnippets[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key] || null,
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remoteSnippets[key] || null,
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of Object.keys(localFileContent)) {
      if (!resourcePreviews.has(key)) {
        const previewResult = {
          content: localFileContent[key] ? localFileContent[key].value.toString() : null,
          hasConflicts: false,
          localChange: Change.None,
          remoteChange: Change.None
        };
        const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
        resourcePreviews.set(key, {
          baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
          baseContent: baseSnippets[key] ?? null,
          localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
          fileContent: localFileContent[key] || null,
          localContent,
          remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
          remoteContent: remoteSnippets[key] || null,
          previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
          previewResult,
          localChange: previewResult.localChange,
          remoteChange: previewResult.remoteChange,
          acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
        });
      }
    }
    return [...resourcePreviews.values()];
  }
  async resolveContent(uri) {
    if (this.extUri.isEqualOrParent(uri, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" })) || this.extUri.isEqualOrParent(uri, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" })) || this.extUri.isEqualOrParent(uri, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" })) || this.extUri.isEqualOrParent(uri, this.syncPreviewFolder.with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" }))) {
      return this.resolvePreviewContent(uri);
    }
    return null;
  }
  async hasLocalData() {
    try {
      const localSnippets = await this.getSnippetsFileContents();
      if (Object.keys(localSnippets).length) {
        return true;
      }
    } catch (error) {
    }
    return false;
  }
  async updateLocalBackup(resourcePreviews) {
    const local = {};
    for (const resourcePreview of resourcePreviews) {
      if (resourcePreview.fileContent) {
        local[this.extUri.basename(resourcePreview.localResource)] = resourcePreview.fileContent;
      }
    }
    await this.backupLocal(JSON.stringify(this.toSnippetsContents(local)));
  }
  async updateLocalSnippets(resourcePreviews, force) {
    for (const { fileContent, acceptResult, localResource, remoteResource, localChange } of resourcePreviews) {
      if (localChange !== Change.None) {
        const key = remoteResource ? this.extUri.basename(remoteResource) : this.extUri.basename(localResource);
        const resource = this.extUri.joinPath(this.snippetsFolder, key);
        if (localChange === Change.Deleted) {
          this.logService.trace(`${this.syncResourceLogLabel}: Deleting snippet...`, this.extUri.basename(resource));
          await this.fileService.del(resource);
          this.logService.info(`${this.syncResourceLogLabel}: Deleted snippet`, this.extUri.basename(resource));
        } else if (localChange === Change.Added) {
          this.logService.trace(`${this.syncResourceLogLabel}: Creating snippet...`, this.extUri.basename(resource));
          await this.fileService.createFile(resource, VSBuffer.fromString(acceptResult.content), { overwrite: force });
          this.logService.info(`${this.syncResourceLogLabel}: Created snippet`, this.extUri.basename(resource));
        } else {
          this.logService.trace(`${this.syncResourceLogLabel}: Updating snippet...`, this.extUri.basename(resource));
          await this.fileService.writeFile(resource, VSBuffer.fromString(acceptResult.content), force ? void 0 : fileContent);
          this.logService.info(`${this.syncResourceLogLabel}: Updated snippet`, this.extUri.basename(resource));
        }
      }
    }
  }
  async updateRemoteSnippets(resourcePreviews, remoteUserData, forcePush) {
    const currentSnippets = remoteUserData.syncData ? this.parseSnippets(remoteUserData.syncData) : {};
    const newSnippets = deepClone(currentSnippets);
    for (const { acceptResult, localResource, remoteResource, remoteChange } of resourcePreviews) {
      if (remoteChange !== Change.None) {
        const key = localResource ? this.extUri.basename(localResource) : this.extUri.basename(remoteResource);
        if (remoteChange === Change.Deleted) {
          delete newSnippets[key];
        } else {
          newSnippets[key] = acceptResult.content;
        }
      }
    }
    if (!areSame(currentSnippets, newSnippets)) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating remote snippets...`);
      remoteUserData = await this.updateRemoteUserData(JSON.stringify(newSnippets), forcePush ? null : remoteUserData.ref);
      this.logService.info(`${this.syncResourceLogLabel}: Updated remote snippets`);
    }
    return remoteUserData;
  }
  parseSnippets(syncData) {
    return parseSnippets(syncData);
  }
  toSnippetsContents(snippetsFileContents) {
    const snippets = {};
    for (const key of Object.keys(snippetsFileContents)) {
      snippets[key] = snippetsFileContents[key].value.toString();
    }
    return snippets;
  }
  async getSnippetsFileContents() {
    const snippets = {};
    let stat;
    try {
      stat = await this.fileService.resolve(this.snippetsFolder);
    } catch (e) {
      if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
        return snippets;
      } else {
        throw e;
      }
    }
    for (const entry of stat.children || []) {
      const resource = entry.resource;
      const extension = this.extUri.extname(resource);
      if (extension === ".json" || extension === ".code-snippets") {
        const key = this.extUri.relativePath(this.snippetsFolder, resource);
        const content = await this.fileService.readFile(resource);
        snippets[key] = content;
      }
    }
    return snippets;
  }
};
SnippetsSynchroniser = __decorateClass([
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUserDataSyncStoreService),
  __decorateParam(6, IUserDataSyncLocalStoreService),
  __decorateParam(7, IUserDataSyncLogService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IUserDataSyncEnablementService),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, IUriIdentityService)
], SnippetsSynchroniser);
let SnippetsInitializer = class extends AbstractInitializer {
  constructor(fileService, userDataProfilesService, environmentService, logService, storageService, uriIdentityService) {
    super(SyncResource.Snippets, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
  }
  async doInitialize(remoteUserData) {
    const remoteSnippets = remoteUserData.syncData ? JSON.parse(remoteUserData.syncData.content) : null;
    if (!remoteSnippets) {
      this.logService.info("Skipping initializing snippets because remote snippets does not exist.");
      return;
    }
    const isEmpty = await this.isEmpty();
    if (!isEmpty) {
      this.logService.info("Skipping initializing snippets because local snippets exist.");
      return;
    }
    for (const key of Object.keys(remoteSnippets)) {
      const content = remoteSnippets[key];
      if (content) {
        const resource = this.extUri.joinPath(this.userDataProfilesService.defaultProfile.snippetsHome, key);
        await this.fileService.createFile(resource, VSBuffer.fromString(content));
        this.logService.info("Created snippet", this.extUri.basename(resource));
      }
    }
    await this.updateLastSyncUserData(remoteUserData);
  }
  async isEmpty() {
    try {
      const stat = await this.fileService.resolve(this.userDataProfilesService.defaultProfile.snippetsHome);
      return !stat.children?.length;
    } catch (error) {
      return error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND;
    }
  }
};
SnippetsInitializer = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IUserDataSyncLogService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IUriIdentityService)
], SnippetsInitializer);
export {
  SnippetsInitializer,
  SnippetsSynchroniser,
  parseSnippets
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXHNuaXBwZXRzU3luYy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZUNvbnRlbnQsIElGaWxlU2VydmljZSwgSUZpbGVTdGF0IH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0SW5pdGlhbGl6ZXIsIEFic3RyYWN0U3luY2hyb25pc2VyLCBJQWNjZXB0UmVzdWx0LCBJRmlsZVJlc291cmNlUHJldmlldywgSU1lcmdlUmVzdWx0IH0gZnJvbSAnLi9hYnN0cmFjdFN5bmNocm9uaXplci5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lLCBJTWVyZ2VSZXN1bHQgYXMgSVNuaXBwZXRzTWVyZ2VSZXN1bHQsIG1lcmdlIH0gZnJvbSAnLi9zbmlwcGV0c01lcmdlLmpzJztcbmltcG9ydCB7IENoYW5nZSwgSVJlbW90ZVVzZXJEYXRhLCBJU3luY0RhdGEsIElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSwgSVVzZXJEYXRhU3luY2hyb25pc2VyLCBJVXNlckRhdGFTeW5jTG9nU2VydmljZSwgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCBTeW5jUmVzb3VyY2UsIFVTRVJfREFUQV9TWU5DX1NDSEVNRSB9IGZyb20gJy4vdXNlckRhdGFTeW5jLmpzJztcblxuaW50ZXJmYWNlIElTbmlwcGV0c1Jlc291cmNlUHJldmlldyBleHRlbmRzIElGaWxlUmVzb3VyY2VQcmV2aWV3IHtcblx0cHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0O1xufVxuXG5pbnRlcmZhY2UgSVNuaXBwZXRzQWNjZXB0ZWRSZXNvdXJjZVByZXZpZXcgZXh0ZW5kcyBJRmlsZVJlc291cmNlUHJldmlldyB7XG5cdGFjY2VwdFJlc3VsdDogSUFjY2VwdFJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlU25pcHBldHMoc3luY0RhdGE6IElTeW5jRGF0YSk6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4ge1xuXHRyZXR1cm4gSlNPTi5wYXJzZShzeW5jRGF0YS5jb250ZW50KTtcbn1cblxuZXhwb3J0IGNsYXNzIFNuaXBwZXRzU3luY2hyb25pc2VyIGV4dGVuZHMgQWJzdHJhY3RTeW5jaHJvbmlzZXIgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jaHJvbmlzZXIge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSB2ZXJzaW9uOiBudW1iZXIgPSAxO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNuaXBwZXRzRm9sZGVyOiBVUkk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSxcblx0XHRjb2xsZWN0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UgdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UgdXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgbG9nU2VydmljZTogSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih7IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLlNuaXBwZXRzLCBwcm9maWxlIH0sIGNvbGxlY3Rpb24sIGZpbGVTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIHVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLCB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgbG9nU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0dGhpcy5zbmlwcGV0c0ZvbGRlciA9IHByb2ZpbGUuc25pcHBldHNIb21lO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2goZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJSb2FtaW5nRGF0YUhvbWUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKHRoaXMuc25pcHBldHNGb2xkZXIpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlLCBlID0+IGUuYWZmZWN0cyh0aGlzLnNuaXBwZXRzRm9sZGVyKSkoKCkgPT4gdGhpcy50cmlnZ2VyTG9jYWxDaGFuZ2UoKSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdlbmVyYXRlU3luY1ByZXZpZXcocmVtb3RlVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSwgbGFzdFN5bmNVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhIHwgbnVsbCwgaXNSZW1vdGVEYXRhRnJvbUN1cnJlbnRNYWNoaW5lOiBib29sZWFuKTogUHJvbWlzZTxJU25pcHBldHNSZXNvdXJjZVByZXZpZXdbXT4ge1xuXHRcdGNvbnN0IGxvY2FsID0gYXdhaXQgdGhpcy5nZXRTbmlwcGV0c0ZpbGVDb250ZW50cygpO1xuXHRcdGNvbnN0IGxvY2FsU25pcHBldHMgPSB0aGlzLnRvU25pcHBldHNDb250ZW50cyhsb2NhbCk7XG5cdFx0Y29uc3QgcmVtb3RlU25pcHBldHM6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4gfCBudWxsID0gcmVtb3RlVXNlckRhdGEuc3luY0RhdGEgPyB0aGlzLnBhcnNlU25pcHBldHMocmVtb3RlVXNlckRhdGEuc3luY0RhdGEpIDogbnVsbDtcblxuXHRcdC8vIFVzZSByZW1vdGUgZGF0YSBhcyBsYXN0IHN5bmMgZGF0YSBpZiBsYXN0IHN5bmMgZGF0YSBkb2VzIG5vdCBleGlzdCBhbmQgcmVtb3RlIGRhdGEgaXMgZnJvbSBzYW1lIG1hY2hpbmVcblx0XHRsYXN0U3luY1VzZXJEYXRhID0gbGFzdFN5bmNVc2VyRGF0YSA9PT0gbnVsbCAmJiBpc1JlbW90ZURhdGFGcm9tQ3VycmVudE1hY2hpbmUgPyByZW1vdGVVc2VyRGF0YSA6IGxhc3RTeW5jVXNlckRhdGE7XG5cdFx0Y29uc3QgbGFzdFN5bmNTbmlwcGV0czogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiB8IG51bGwgPSBsYXN0U3luY1VzZXJEYXRhICYmIGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEgPyB0aGlzLnBhcnNlU25pcHBldHMobGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSkgOiBudWxsO1xuXG5cdFx0aWYgKHJlbW90ZVNuaXBwZXRzKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IE1lcmdpbmcgcmVtb3RlIHNuaXBwZXRzIHdpdGggbG9jYWwgc25pcHBldHMuLi5gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBSZW1vdGUgc25pcHBldHMgZG9lcyBub3QgZXhpc3QuIFN5bmNocm9uaXppbmcgc25pcHBldHMgZm9yIHRoZSBmaXJzdCB0aW1lLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lcmdlUmVzdWx0ID0gbWVyZ2UobG9jYWxTbmlwcGV0cywgcmVtb3RlU25pcHBldHMsIGxhc3RTeW5jU25pcHBldHMpO1xuXHRcdHJldHVybiB0aGlzLmdldFJlc291cmNlUHJldmlld3MobWVyZ2VSZXN1bHQsIGxvY2FsLCByZW1vdGVTbmlwcGV0cyB8fCB7fSwgbGFzdFN5bmNTbmlwcGV0cyB8fCB7fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgaGFzUmVtb3RlQ2hhbmdlZChsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBsYXN0U3luY1NuaXBwZXRzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IHwgbnVsbCA9IGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEgPyB0aGlzLnBhcnNlU25pcHBldHMobGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSkgOiBudWxsO1xuXHRcdGlmIChsYXN0U3luY1NuaXBwZXRzID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgbG9jYWwgPSBhd2FpdCB0aGlzLmdldFNuaXBwZXRzRmlsZUNvbnRlbnRzKCk7XG5cdFx0Y29uc3QgbG9jYWxTbmlwcGV0cyA9IHRoaXMudG9TbmlwcGV0c0NvbnRlbnRzKGxvY2FsKTtcblx0XHRjb25zdCBtZXJnZVJlc3VsdCA9IG1lcmdlKGxvY2FsU25pcHBldHMsIGxhc3RTeW5jU25pcHBldHMsIGxhc3RTeW5jU25pcHBldHMpO1xuXHRcdHJldHVybiBPYmplY3Qua2V5cyhtZXJnZVJlc3VsdC5yZW1vdGUuYWRkZWQpLmxlbmd0aCA+IDAgfHwgT2JqZWN0LmtleXMobWVyZ2VSZXN1bHQucmVtb3RlLnVwZGF0ZWQpLmxlbmd0aCA+IDAgfHwgbWVyZ2VSZXN1bHQucmVtb3RlLnJlbW92ZWQubGVuZ3RoID4gMCB8fCBtZXJnZVJlc3VsdC5jb25mbGljdHMubGVuZ3RoID4gMDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZXRNZXJnZVJlc3VsdChyZXNvdXJjZVByZXZpZXc6IElTbmlwcGV0c1Jlc291cmNlUHJldmlldywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWVyZ2VSZXN1bHQ+IHtcblx0XHRyZXR1cm4gcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0QWNjZXB0UmVzdWx0KHJlc291cmNlUHJldmlldzogSVNuaXBwZXRzUmVzb3VyY2VQcmV2aWV3LCByZXNvdXJjZTogVVJJLCBjb250ZW50OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY2NlcHRSZXN1bHQ+IHtcblxuXHRcdC8qIEFjY2VwdCBsb2NhbCByZXNvdXJjZSAqL1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQocmVzb3VyY2UsIHRoaXMuc3luY1ByZXZpZXdGb2xkZXIud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSkpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQgPyByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSA6IG51bGwsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnRcblx0XHRcdFx0XHQ/IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50ICE9PSBudWxsID8gQ2hhbmdlLk1vZGlmaWVkIDogQ2hhbmdlLkFkZGVkXG5cdFx0XHRcdFx0OiBDaGFuZ2UuRGVsZXRlZFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvKiBBY2NlcHQgcmVtb3RlIHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgdGhpcy5zeW5jUHJldmlld0ZvbGRlci53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSkpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcucmVtb3RlQ29udGVudCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50ICE9PSBudWxsXG5cdFx0XHRcdFx0PyByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuQWRkZWRcblx0XHRcdFx0XHQ6IENoYW5nZS5EZWxldGVkLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvKiBBY2NlcHQgcHJldmlldyByZXNvdXJjZSAqL1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQocmVzb3VyY2UsIHRoaXMuc3luY1ByZXZpZXdGb2xkZXIpKSB7XG5cdFx0XHRpZiAoY29udGVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29udGVudDogcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQuY29udGVudCxcblx0XHRcdFx0XHRsb2NhbENoYW5nZTogcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRcdFx0cmVtb3RlQ2hhbmdlOiByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2UsXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdFx0bG9jYWxDaGFuZ2U6IGNvbnRlbnQgPT09IG51bGxcblx0XHRcdFx0XHRcdD8gcmVzb3VyY2VQcmV2aWV3LmZpbGVDb250ZW50ICE9PSBudWxsID8gQ2hhbmdlLkRlbGV0ZWQgOiBDaGFuZ2UuTm9uZVxuXHRcdFx0XHRcdFx0OiBDaGFuZ2UuTW9kaWZpZWQsXG5cdFx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBjb250ZW50ID09PSBudWxsXG5cdFx0XHRcdFx0XHQ/IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50ICE9PSBudWxsID8gQ2hhbmdlLkRlbGV0ZWQgOiBDaGFuZ2UuTm9uZVxuXHRcdFx0XHRcdFx0OiBDaGFuZ2UuTW9kaWZpZWRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgUmVzb3VyY2U6ICR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBhcHBseVJlc3VsdChyZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEgfCBudWxsLCByZXNvdXJjZVByZXZpZXdzOiBbSVNuaXBwZXRzUmVzb3VyY2VQcmV2aWV3LCBJQWNjZXB0UmVzdWx0XVtdLCBmb3JjZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFjY3B0ZWRSZXNvdXJjZVByZXZpZXdzOiBJU25pcHBldHNBY2NlcHRlZFJlc291cmNlUHJldmlld1tdID0gcmVzb3VyY2VQcmV2aWV3cy5tYXAoKFtyZXNvdXJjZVByZXZpZXcsIGFjY2VwdFJlc3VsdF0pID0+ICh7IC4uLnJlc291cmNlUHJldmlldywgYWNjZXB0UmVzdWx0IH0pKTtcblx0XHRpZiAoYWNjcHRlZFJlc291cmNlUHJldmlld3MuZXZlcnkoKHsgbG9jYWxDaGFuZ2UsIHJlbW90ZUNoYW5nZSB9KSA9PiBsb2NhbENoYW5nZSA9PT0gQ2hhbmdlLk5vbmUgJiYgcmVtb3RlQ2hhbmdlID09PSBDaGFuZ2UuTm9uZSkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBObyBjaGFuZ2VzIGZvdW5kIGR1cmluZyBzeW5jaHJvbml6aW5nIHNuaXBwZXRzLmApO1xuXHRcdH1cblxuXHRcdGlmIChhY2NwdGVkUmVzb3VyY2VQcmV2aWV3cy5zb21lKCh7IGxvY2FsQ2hhbmdlIH0pID0+IGxvY2FsQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkpIHtcblx0XHRcdC8vIGJhY2sgdXAgYWxsIHNuaXBwZXRzXG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUxvY2FsQmFja3VwKGFjY3B0ZWRSZXNvdXJjZVByZXZpZXdzKTtcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTG9jYWxTbmlwcGV0cyhhY2NwdGVkUmVzb3VyY2VQcmV2aWV3cywgZm9yY2UpO1xuXHRcdH1cblxuXHRcdGlmIChhY2NwdGVkUmVzb3VyY2VQcmV2aWV3cy5zb21lKCh7IHJlbW90ZUNoYW5nZSB9KSA9PiByZW1vdGVDaGFuZ2UgIT09IENoYW5nZS5Ob25lKSkge1xuXHRcdFx0cmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0aGlzLnVwZGF0ZVJlbW90ZVNuaXBwZXRzKGFjY3B0ZWRSZXNvdXJjZVByZXZpZXdzLCByZW1vdGVVc2VyRGF0YSwgZm9yY2UpO1xuXHRcdH1cblxuXHRcdGlmIChsYXN0U3luY1VzZXJEYXRhPy5yZWYgIT09IHJlbW90ZVVzZXJEYXRhLnJlZikge1xuXHRcdFx0Ly8gdXBkYXRlIGxhc3Qgc3luY1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyBsYXN0IHN5bmNocm9uaXplZCBzbmlwcGV0cy4uLmApO1xuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVMYXN0U3luY1VzZXJEYXRhKHJlbW90ZVVzZXJEYXRhKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGVkIGxhc3Qgc3luY2hyb25pemVkIHNuaXBwZXRzYCk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB7IHByZXZpZXdSZXNvdXJjZSB9IG9mIGFjY3B0ZWRSZXNvdXJjZVByZXZpZXdzKSB7XG5cdFx0XHQvLyBEZWxldGUgdGhlIHByZXZpZXdcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHByZXZpZXdSZXNvdXJjZSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0fVxuXG5cdH1cblxuXHRwcml2YXRlIGdldFJlc291cmNlUHJldmlld3Moc25pcHBldHNNZXJnZVJlc3VsdDogSVNuaXBwZXRzTWVyZ2VSZXN1bHQsIGxvY2FsRmlsZUNvbnRlbnQ6IElTdHJpbmdEaWN0aW9uYXJ5PElGaWxlQ29udGVudD4sIHJlbW90ZVNuaXBwZXRzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+LCBiYXNlU25pcHBldHM6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4pOiBJU25pcHBldHNSZXNvdXJjZVByZXZpZXdbXSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VQcmV2aWV3czogTWFwPHN0cmluZywgSVNuaXBwZXRzUmVzb3VyY2VQcmV2aWV3PiA9IG5ldyBNYXA8c3RyaW5nLCBJU25pcHBldHNSZXNvdXJjZVByZXZpZXc+KCk7XG5cblx0XHQvKiBTbmlwcGV0cyBhZGRlZCByZW1vdGVseSAtPiBhZGQgbG9jYWxseSAqL1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHNuaXBwZXRzTWVyZ2VSZXN1bHQubG9jYWwuYWRkZWQpKSB7XG5cdFx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IHNuaXBwZXRzTWVyZ2VSZXN1bHQubG9jYWwuYWRkZWRba2V5XSxcblx0XHRcdFx0aGFzQ29uZmxpY3RzOiBmYWxzZSxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5BZGRlZCxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdH07XG5cdFx0XHRyZXNvdXJjZVByZXZpZXdzLnNldChrZXksIHtcblx0XHRcdFx0YmFzZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSksXG5cdFx0XHRcdGJhc2VDb250ZW50OiBudWxsLFxuXHRcdFx0XHRmaWxlQ29udGVudDogbnVsbCxcblx0XHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSxcblx0XHRcdFx0bG9jYWxDb250ZW50OiBudWxsLFxuXHRcdFx0XHRyZW1vdGVSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSksXG5cdFx0XHRcdHJlbW90ZUNvbnRlbnQ6IHJlbW90ZVNuaXBwZXRzW2tleV0sXG5cdFx0XHRcdHByZXZpZXdSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KSxcblx0XHRcdFx0cHJldmlld1Jlc3VsdCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IHByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogcHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2UsXG5cdFx0XHRcdGFjY2VwdGVkUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8qIFNuaXBwZXRzIHVwZGF0ZWQgcmVtb3RlbHkgLT4gdXBkYXRlIGxvY2FsbHkgKi9cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhzbmlwcGV0c01lcmdlUmVzdWx0LmxvY2FsLnVwZGF0ZWQpKSB7XG5cdFx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IHNuaXBwZXRzTWVyZ2VSZXN1bHQubG9jYWwudXBkYXRlZFtrZXldLFxuXHRcdFx0XHRoYXNDb25mbGljdHM6IGZhbHNlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk1vZGlmaWVkLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGxvY2FsRmlsZUNvbnRlbnRba2V5XSA/IGxvY2FsRmlsZUNvbnRlbnRba2V5XS52YWx1ZS50b1N0cmluZygpIDogbnVsbDtcblx0XHRcdHJlc291cmNlUHJldmlld3Muc2V0KGtleSwge1xuXHRcdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSxcblx0XHRcdFx0YmFzZUNvbnRlbnQ6IGJhc2VTbmlwcGV0c1trZXldID8/IG51bGwsXG5cdFx0XHRcdGxvY2FsUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSksXG5cdFx0XHRcdGZpbGVDb250ZW50OiBsb2NhbEZpbGVDb250ZW50W2tleV0sXG5cdFx0XHRcdGxvY2FsQ29udGVudCxcblx0XHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pLFxuXHRcdFx0XHRyZW1vdGVDb250ZW50OiByZW1vdGVTbmlwcGV0c1trZXldLFxuXHRcdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSksXG5cdFx0XHRcdHByZXZpZXdSZXN1bHQsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0XHRhY2NlcHRlZFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYWNjZXB0ZWQnIH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvKiBTbmlwcGV0cyByZW1vdmVkIHJlbW90ZWx5IC0+IHJlbW92ZSBsb2NhbGx5ICovXG5cdFx0Zm9yIChjb25zdCBrZXkgb2Ygc25pcHBldHNNZXJnZVJlc3VsdC5sb2NhbC5yZW1vdmVkKSB7XG5cdFx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IG51bGwsXG5cdFx0XHRcdGhhc0NvbmZsaWN0czogZmFsc2UsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuRGVsZXRlZCxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBsb2NhbEZpbGVDb250ZW50W2tleV0gPyBsb2NhbEZpbGVDb250ZW50W2tleV0udmFsdWUudG9TdHJpbmcoKSA6IG51bGw7XG5cdFx0XHRyZXNvdXJjZVByZXZpZXdzLnNldChrZXksIHtcblx0XHRcdFx0YmFzZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSksXG5cdFx0XHRcdGJhc2VDb250ZW50OiBiYXNlU25pcHBldHNba2V5XSA/PyBudWxsLFxuXHRcdFx0XHRsb2NhbFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pLFxuXHRcdFx0XHRmaWxlQ29udGVudDogbG9jYWxGaWxlQ29udGVudFtrZXldLFxuXHRcdFx0XHRsb2NhbENvbnRlbnQsXG5cdFx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSxcblx0XHRcdFx0cmVtb3RlQ29udGVudDogbnVsbCxcblx0XHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLFxuXHRcdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0LyogU25pcHBldHMgYWRkZWQgbG9jYWxseSAtPiBhZGQgcmVtb3RlbHkgKi9cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhzbmlwcGV0c01lcmdlUmVzdWx0LnJlbW90ZS5hZGRlZCkpIHtcblx0XHRcdGNvbnN0IHByZXZpZXdSZXN1bHQ6IElNZXJnZVJlc3VsdCA9IHtcblx0XHRcdFx0Y29udGVudDogc25pcHBldHNNZXJnZVJlc3VsdC5yZW1vdGUuYWRkZWRba2V5XSxcblx0XHRcdFx0aGFzQ29uZmxpY3RzOiBmYWxzZSxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5BZGRlZCxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBsb2NhbEZpbGVDb250ZW50W2tleV0gPyBsb2NhbEZpbGVDb250ZW50W2tleV0udmFsdWUudG9TdHJpbmcoKSA6IG51bGw7XG5cdFx0XHRyZXNvdXJjZVByZXZpZXdzLnNldChrZXksIHtcblx0XHRcdFx0YmFzZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSksXG5cdFx0XHRcdGJhc2VDb250ZW50OiBiYXNlU25pcHBldHNba2V5XSA/PyBudWxsLFxuXHRcdFx0XHRsb2NhbFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pLFxuXHRcdFx0XHRmaWxlQ29udGVudDogbG9jYWxGaWxlQ29udGVudFtrZXldLFxuXHRcdFx0XHRsb2NhbENvbnRlbnQsXG5cdFx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSxcblx0XHRcdFx0cmVtb3RlQ29udGVudDogbnVsbCxcblx0XHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLFxuXHRcdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0LyogU25pcHBldHMgdXBkYXRlZCBsb2NhbGx5IC0+IHVwZGF0ZSByZW1vdGVseSAqL1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHNuaXBwZXRzTWVyZ2VSZXN1bHQucmVtb3RlLnVwZGF0ZWQpKSB7XG5cdFx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IHNuaXBwZXRzTWVyZ2VSZXN1bHQucmVtb3RlLnVwZGF0ZWRba2V5XSxcblx0XHRcdFx0aGFzQ29uZmxpY3RzOiBmYWxzZSxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBsb2NhbEZpbGVDb250ZW50W2tleV0gPyBsb2NhbEZpbGVDb250ZW50W2tleV0udmFsdWUudG9TdHJpbmcoKSA6IG51bGw7XG5cdFx0XHRyZXNvdXJjZVByZXZpZXdzLnNldChrZXksIHtcblx0XHRcdFx0YmFzZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSksXG5cdFx0XHRcdGJhc2VDb250ZW50OiBiYXNlU25pcHBldHNba2V5XSA/PyBudWxsLFxuXHRcdFx0XHRsb2NhbFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pLFxuXHRcdFx0XHRmaWxlQ29udGVudDogbG9jYWxGaWxlQ29udGVudFtrZXldLFxuXHRcdFx0XHRsb2NhbENvbnRlbnQsXG5cdFx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSxcblx0XHRcdFx0cmVtb3RlQ29udGVudDogcmVtb3RlU25pcHBldHNba2V5XSxcblx0XHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLFxuXHRcdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0LyogU25pcHBldHMgcmVtb3ZlZCBsb2NhbGx5IC0+IHJlbW92ZSByZW1vdGVseSAqL1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHNuaXBwZXRzTWVyZ2VSZXN1bHQucmVtb3RlLnJlbW92ZWQpIHtcblx0XHRcdGNvbnN0IHByZXZpZXdSZXN1bHQ6IElNZXJnZVJlc3VsdCA9IHtcblx0XHRcdFx0Y29udGVudDogbnVsbCxcblx0XHRcdFx0aGFzQ29uZmxpY3RzOiBmYWxzZSxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5EZWxldGVkLFxuXHRcdFx0fTtcblx0XHRcdHJlc291cmNlUHJldmlld3Muc2V0KGtleSwge1xuXHRcdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSxcblx0XHRcdFx0YmFzZUNvbnRlbnQ6IGJhc2VTbmlwcGV0c1trZXldID8/IG51bGwsXG5cdFx0XHRcdGxvY2FsUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSksXG5cdFx0XHRcdGZpbGVDb250ZW50OiBudWxsLFxuXHRcdFx0XHRsb2NhbENvbnRlbnQ6IG51bGwsXG5cdFx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSxcblx0XHRcdFx0cmVtb3RlQ29udGVudDogcmVtb3RlU25pcHBldHNba2V5XSxcblx0XHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLFxuXHRcdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0LyogU25pcHBldHMgd2l0aCBjb25mbGljdHMgKi9cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBzbmlwcGV0c01lcmdlUmVzdWx0LmNvbmZsaWN0cykge1xuXHRcdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBiYXNlU25pcHBldHNba2V5XSA/PyBudWxsLFxuXHRcdFx0XHRoYXNDb25mbGljdHM6IHRydWUsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBsb2NhbEZpbGVDb250ZW50W2tleV0gPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuQWRkZWQsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogcmVtb3RlU25pcHBldHNba2V5XSA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5BZGRlZFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGxvY2FsRmlsZUNvbnRlbnRba2V5XSA/IGxvY2FsRmlsZUNvbnRlbnRba2V5XS52YWx1ZS50b1N0cmluZygpIDogbnVsbDtcblx0XHRcdHJlc291cmNlUHJldmlld3Muc2V0KGtleSwge1xuXHRcdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSxcblx0XHRcdFx0YmFzZUNvbnRlbnQ6IGJhc2VTbmlwcGV0c1trZXldID8/IG51bGwsXG5cdFx0XHRcdGxvY2FsUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSksXG5cdFx0XHRcdGZpbGVDb250ZW50OiBsb2NhbEZpbGVDb250ZW50W2tleV0gfHwgbnVsbCxcblx0XHRcdFx0bG9jYWxDb250ZW50LFxuXHRcdFx0XHRyZW1vdGVSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSksXG5cdFx0XHRcdHJlbW90ZUNvbnRlbnQ6IHJlbW90ZVNuaXBwZXRzW2tleV0gfHwgbnVsbCxcblx0XHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLFxuXHRcdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0LyogVW5tb2RpZmllZCBTbmlwcGV0cyAqL1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGxvY2FsRmlsZUNvbnRlbnQpKSB7XG5cdFx0XHRpZiAoIXJlc291cmNlUHJldmlld3MuaGFzKGtleSkpIHtcblx0XHRcdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0XHRcdGNvbnRlbnQ6IGxvY2FsRmlsZUNvbnRlbnRba2V5XSA/IGxvY2FsRmlsZUNvbnRlbnRba2V5XS52YWx1ZS50b1N0cmluZygpIDogbnVsbCxcblx0XHRcdFx0XHRoYXNDb25mbGljdHM6IGZhbHNlLFxuXHRcdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Ob25lXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGxvY2FsRmlsZUNvbnRlbnRba2V5XSA/IGxvY2FsRmlsZUNvbnRlbnRba2V5XS52YWx1ZS50b1N0cmluZygpIDogbnVsbDtcblx0XHRcdFx0cmVzb3VyY2VQcmV2aWV3cy5zZXQoa2V5LCB7XG5cdFx0XHRcdFx0YmFzZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSksXG5cdFx0XHRcdFx0YmFzZUNvbnRlbnQ6IGJhc2VTbmlwcGV0c1trZXldID8/IG51bGwsXG5cdFx0XHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSxcblx0XHRcdFx0XHRmaWxlQ29udGVudDogbG9jYWxGaWxlQ29udGVudFtrZXldIHx8IG51bGwsXG5cdFx0XHRcdFx0bG9jYWxDb250ZW50LFxuXHRcdFx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSxcblx0XHRcdFx0XHRyZW1vdGVDb250ZW50OiByZW1vdGVTbmlwcGV0c1trZXldIHx8IG51bGwsXG5cdFx0XHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLFxuXHRcdFx0XHRcdHByZXZpZXdSZXN1bHQsXG5cdFx0XHRcdFx0bG9jYWxDaGFuZ2U6IHByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0XHRhY2NlcHRlZFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYWNjZXB0ZWQnIH0pXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBbLi4ucmVzb3VyY2VQcmV2aWV3cy52YWx1ZXMoKV07XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZXNvbHZlQ29udGVudCh1cmk6IFVSSSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdGlmICh0aGlzLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQodXJpLCB0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSlcblx0XHRcdHx8IHRoaXMuZXh0VXJpLmlzRXF1YWxPclBhcmVudCh1cmksIHRoaXMuc3luY1ByZXZpZXdGb2xkZXIud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSkpXG5cdFx0XHR8fCB0aGlzLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQodXJpLCB0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSkpXG5cdFx0XHR8fCB0aGlzLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQodXJpLCB0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYWNjZXB0ZWQnIH0pKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZVByZXZpZXdDb250ZW50KHVyaSk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0YXN5bmMgaGFzTG9jYWxEYXRhKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBsb2NhbFNuaXBwZXRzID0gYXdhaXQgdGhpcy5nZXRTbmlwcGV0c0ZpbGVDb250ZW50cygpO1xuXHRcdFx0aWYgKE9iamVjdC5rZXlzKGxvY2FsU25pcHBldHMpLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0LyogaWdub3JlIGVycm9yICovXG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlTG9jYWxCYWNrdXAocmVzb3VyY2VQcmV2aWV3czogSUZpbGVSZXNvdXJjZVByZXZpZXdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxvY2FsOiBJU3RyaW5nRGljdGlvbmFyeTxJRmlsZUNvbnRlbnQ+ID0ge307XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZVByZXZpZXcgb2YgcmVzb3VyY2VQcmV2aWV3cykge1xuXHRcdFx0aWYgKHJlc291cmNlUHJldmlldy5maWxlQ29udGVudCkge1xuXHRcdFx0XHRsb2NhbFt0aGlzLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZVByZXZpZXcubG9jYWxSZXNvdXJjZSldID0gcmVzb3VyY2VQcmV2aWV3LmZpbGVDb250ZW50O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmJhY2t1cExvY2FsKEpTT04uc3RyaW5naWZ5KHRoaXMudG9TbmlwcGV0c0NvbnRlbnRzKGxvY2FsKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVMb2NhbFNuaXBwZXRzKHJlc291cmNlUHJldmlld3M6IElTbmlwcGV0c0FjY2VwdGVkUmVzb3VyY2VQcmV2aWV3W10sIGZvcmNlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCB7IGZpbGVDb250ZW50LCBhY2NlcHRSZXN1bHQsIGxvY2FsUmVzb3VyY2UsIHJlbW90ZVJlc291cmNlLCBsb2NhbENoYW5nZSB9IG9mIHJlc291cmNlUHJldmlld3MpIHtcblx0XHRcdGlmIChsb2NhbENoYW5nZSAhPT0gQ2hhbmdlLk5vbmUpIHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gcmVtb3RlUmVzb3VyY2UgPyB0aGlzLmV4dFVyaS5iYXNlbmFtZShyZW1vdGVSZXNvdXJjZSkgOiB0aGlzLmV4dFVyaS5iYXNlbmFtZShsb2NhbFJlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnNuaXBwZXRzRm9sZGVyLCBrZXkpO1xuXG5cdFx0XHRcdC8vIFJlbW92ZWRcblx0XHRcdFx0aWYgKGxvY2FsQ2hhbmdlID09PSBDaGFuZ2UuRGVsZXRlZCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogRGVsZXRpbmcgc25pcHBldC4uLmAsIHRoaXMuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwocmVzb3VyY2UpO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBEZWxldGVkIHNuaXBwZXRgLCB0aGlzLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQWRkZWRcblx0XHRcdFx0ZWxzZSBpZiAobG9jYWxDaGFuZ2UgPT09IENoYW5nZS5BZGRlZCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogQ3JlYXRpbmcgc25pcHBldC4uLmAsIHRoaXMuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5jcmVhdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGFjY2VwdFJlc3VsdC5jb250ZW50ISksIHsgb3ZlcndyaXRlOiBmb3JjZSB9KTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogQ3JlYXRlZCBzbmlwcGV0YCwgdGhpcy5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFVwZGF0ZWRcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyBzbmlwcGV0Li4uYCwgdGhpcy5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhhY2NlcHRSZXN1bHQuY29udGVudCEpLCBmb3JjZSA/IHVuZGVmaW5lZCA6IGZpbGVDb250ZW50ISk7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0ZWQgc25pcHBldGAsIHRoaXMuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZVJlbW90ZVNuaXBwZXRzKHJlc291cmNlUHJldmlld3M6IElTbmlwcGV0c0FjY2VwdGVkUmVzb3VyY2VQcmV2aWV3W10sIHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGZvcmNlUHVzaDogYm9vbGVhbik6IFByb21pc2U8SVJlbW90ZVVzZXJEYXRhPiB7XG5cdFx0Y29uc3QgY3VycmVudFNuaXBwZXRzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+ID0gcmVtb3RlVXNlckRhdGEuc3luY0RhdGEgPyB0aGlzLnBhcnNlU25pcHBldHMocmVtb3RlVXNlckRhdGEuc3luY0RhdGEpIDoge307XG5cdFx0Y29uc3QgbmV3U25pcHBldHM6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4gPSBkZWVwQ2xvbmUoY3VycmVudFNuaXBwZXRzKTtcblxuXHRcdGZvciAoY29uc3QgeyBhY2NlcHRSZXN1bHQsIGxvY2FsUmVzb3VyY2UsIHJlbW90ZVJlc291cmNlLCByZW1vdGVDaGFuZ2UgfSBvZiByZXNvdXJjZVByZXZpZXdzKSB7XG5cdFx0XHRpZiAocmVtb3RlQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBsb2NhbFJlc291cmNlID8gdGhpcy5leHRVcmkuYmFzZW5hbWUobG9jYWxSZXNvdXJjZSkgOiB0aGlzLmV4dFVyaS5iYXNlbmFtZShyZW1vdGVSZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChyZW1vdGVDaGFuZ2UgPT09IENoYW5nZS5EZWxldGVkKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIG5ld1NuaXBwZXRzW2tleV07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmV3U25pcHBldHNba2V5XSA9IGFjY2VwdFJlc3VsdC5jb250ZW50ITtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghYXJlU2FtZShjdXJyZW50U25pcHBldHMsIG5ld1NuaXBwZXRzKSkge1xuXHRcdFx0Ly8gdXBkYXRlIHJlbW90ZVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGluZyByZW1vdGUgc25pcHBldHMuLi5gKTtcblx0XHRcdHJlbW90ZVVzZXJEYXRhID0gYXdhaXQgdGhpcy51cGRhdGVSZW1vdGVVc2VyRGF0YShKU09OLnN0cmluZ2lmeShuZXdTbmlwcGV0cyksIGZvcmNlUHVzaCA/IG51bGwgOiByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0ZWQgcmVtb3RlIHNuaXBwZXRzYCk7XG5cdFx0fVxuXHRcdHJldHVybiByZW1vdGVVc2VyRGF0YTtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VTbmlwcGV0cyhzeW5jRGF0YTogSVN5bmNEYXRhKTogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHBhcnNlU25pcHBldHMoc3luY0RhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1NuaXBwZXRzQ29udGVudHMoc25pcHBldHNGaWxlQ29udGVudHM6IElTdHJpbmdEaWN0aW9uYXJ5PElGaWxlQ29udGVudD4pOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IHtcblx0XHRjb25zdCBzbmlwcGV0czogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiA9IHt9O1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHNuaXBwZXRzRmlsZUNvbnRlbnRzKSkge1xuXHRcdFx0c25pcHBldHNba2V5XSA9IHNuaXBwZXRzRmlsZUNvbnRlbnRzW2tleV0udmFsdWUudG9TdHJpbmcoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHNuaXBwZXRzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTbmlwcGV0c0ZpbGVDb250ZW50cygpOiBQcm9taXNlPElTdHJpbmdEaWN0aW9uYXJ5PElGaWxlQ29udGVudD4+IHtcblx0XHRjb25zdCBzbmlwcGV0czogSVN0cmluZ0RpY3Rpb25hcnk8SUZpbGVDb250ZW50PiA9IHt9O1xuXHRcdGxldCBzdGF0OiBJRmlsZVN0YXQ7XG5cdFx0dHJ5IHtcblx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUodGhpcy5zbmlwcGV0c0ZvbGRlcik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gTm8gc25pcHBldHNcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgRmlsZU9wZXJhdGlvbkVycm9yICYmIGUuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRyZXR1cm4gc25pcHBldHM7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHN0YXQuY2hpbGRyZW4gfHwgW10pIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gZW50cnkucmVzb3VyY2U7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLmV4dFVyaS5leHRuYW1lKHJlc291cmNlKTtcblx0XHRcdGlmIChleHRlbnNpb24gPT09ICcuanNvbicgfHwgZXh0ZW5zaW9uID09PSAnLmNvZGUtc25pcHBldHMnKSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IHRoaXMuZXh0VXJpLnJlbGF0aXZlUGF0aCh0aGlzLnNuaXBwZXRzRm9sZGVyLCByZXNvdXJjZSkhO1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0XHRcdHNuaXBwZXRzW2tleV0gPSBjb250ZW50O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc25pcHBldHM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNuaXBwZXRzSW5pdGlhbGl6ZXIgZXh0ZW5kcyBBYnN0cmFjdEluaXRpYWxpemVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgbG9nU2VydmljZTogSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoU3luY1Jlc291cmNlLlNuaXBwZXRzLCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBmaWxlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZG9Jbml0aWFsaXplKHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZW1vdGVTbmlwcGV0czogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiB8IG51bGwgPSByZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSA/IEpTT04ucGFyc2UocmVtb3RlVXNlckRhdGEuc3luY0RhdGEuY29udGVudCkgOiBudWxsO1xuXHRcdGlmICghcmVtb3RlU25pcHBldHMpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTa2lwcGluZyBpbml0aWFsaXppbmcgc25pcHBldHMgYmVjYXVzZSByZW1vdGUgc25pcHBldHMgZG9lcyBub3QgZXhpc3QuJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNFbXB0eSA9IGF3YWl0IHRoaXMuaXNFbXB0eSgpO1xuXHRcdGlmICghaXNFbXB0eSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1NraXBwaW5nIGluaXRpYWxpemluZyBzbmlwcGV0cyBiZWNhdXNlIGxvY2FsIHNuaXBwZXRzIGV4aXN0LicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHJlbW90ZVNuaXBwZXRzKSkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IHJlbW90ZVNuaXBwZXRzW2tleV07XG5cdFx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lLCBrZXkpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNyZWF0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnQ3JlYXRlZCBzbmlwcGV0JywgdGhpcy5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnVwZGF0ZUxhc3RTeW5jVXNlckRhdGEocmVtb3RlVXNlckRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpc0VtcHR5KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lKTtcblx0XHRcdHJldHVybiAhc3RhdC5jaGlsZHJlbj8ubGVuZ3RoO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZXR1cm4gKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQ7XG5cdFx0fVxuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFHekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CLHFCQUFtQyxvQkFBK0I7QUFDL0YsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBMkIsZ0NBQWdDO0FBQzNELFNBQVMscUJBQXFCLDRCQUErRTtBQUM3RyxTQUFTLFNBQStDLGFBQWE7QUFDckUsU0FBUyxRQUFvQyxnQ0FBdUQseUJBQXlCLGdDQUFnQywyQkFBMkIsY0FBYyw2QkFBNkI7QUFVNU4sU0FBUyxjQUFjLFVBQWdEO0FBQzdFLFNBQU8sS0FBSyxNQUFNLFNBQVMsT0FBTztBQUNuQztBQUVPLElBQU0sdUJBQU4sY0FBbUMscUJBQXNEO0FBQUEsRUFLL0YsWUFDQyxTQUNBLFlBQ3FCLG9CQUNQLGFBQ0csZ0JBQ1UsMEJBQ0ssK0JBQ1AsWUFDRixzQkFDUywrQkFDYixrQkFDRSxvQkFDcEI7QUFDRCxVQUFNLEVBQUUsY0FBYyxhQUFhLFVBQVUsUUFBUSxHQUFHLFlBQVksYUFBYSxvQkFBb0IsZ0JBQWdCLDBCQUEwQiwrQkFBK0IsK0JBQStCLGtCQUFrQixZQUFZLHNCQUFzQixrQkFBa0I7QUFqQnBSLFNBQW1CLFVBQWtCO0FBa0JwQyxTQUFLLGlCQUFpQixRQUFRO0FBQzlCLFNBQUssVUFBVSxLQUFLLFlBQVksTUFBTSxtQkFBbUIsbUJBQW1CLENBQUM7QUFDN0UsU0FBSyxVQUFVLEtBQUssWUFB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
