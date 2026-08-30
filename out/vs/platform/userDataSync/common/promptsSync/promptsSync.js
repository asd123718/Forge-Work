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
import { Event } from "../../../../base/common/event.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { deepClone } from "../../../../base/common/objects.js";
import { IStorageService } from "../../../storage/common/storage.js";
import { ITelemetryService } from "../../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../../uriIdentity/common/uriIdentity.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { areSame, merge } from "./promptsMerge.js";
import { AbstractSynchroniser } from "../abstractSynchronizer.js";
import { FileOperationError, FileOperationResult, IFileService } from "../../../files/common/files.js";
import { Change, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, USER_DATA_SYNC_SCHEME } from "../userDataSync.js";
function parsePrompts(syncData) {
  return JSON.parse(syncData.content);
}
let PromptsSynchronizer = class extends AbstractSynchroniser {
  constructor(profile, collection, environmentService, fileService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, logService, configurationService, userDataSyncEnablementService, telemetryService, uriIdentityService) {
    const syncResource = { syncResource: SyncResource.Prompts, profile };
    super(
      syncResource,
      collection,
      fileService,
      environmentService,
      storageService,
      userDataSyncStoreService,
      userDataSyncLocalStoreService,
      userDataSyncEnablementService,
      telemetryService,
      logService,
      configurationService,
      uriIdentityService
    );
    this.version = 1;
    this.promptsFolder = profile.promptsHome;
    this._register(this.fileService.watch(environmentService.userRoamingDataHome));
    this._register(this.fileService.watch(this.promptsFolder));
    this._register(Event.filter(this.fileService.onDidFilesChange, (e) => e.affects(this.promptsFolder))(() => this.triggerLocalChange()));
  }
  async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine) {
    const local = await this.getPromptsFileContents();
    const localPrompts = this.toPromptContents(local);
    const remotePrompts = remoteUserData.syncData ? this.parsePrompts(remoteUserData.syncData) : null;
    lastSyncUserData = lastSyncUserData === null && isRemoteDataFromCurrentMachine ? remoteUserData : lastSyncUserData;
    const lastSyncPrompts = lastSyncUserData && lastSyncUserData.syncData ? this.parsePrompts(lastSyncUserData.syncData) : null;
    if (remotePrompts) {
      this.logService.trace(`${this.syncResourceLogLabel}: Merging remote prompts with local prompts...`);
    } else {
      this.logService.trace(`${this.syncResourceLogLabel}: Remote prompts does not exist. Synchronizing prompts for the first time.`);
    }
    const mergeResult = merge(localPrompts, remotePrompts, lastSyncPrompts);
    return this.getResourcePreviews(mergeResult, local, remotePrompts || {}, lastSyncPrompts || {});
  }
  async hasRemoteChanged(lastSyncUserData) {
    const lastSync = lastSyncUserData.syncData ? this.parsePrompts(lastSyncUserData.syncData) : null;
    if (lastSync === null) {
      return true;
    }
    const local = await this.getPromptsFileContents();
    const localPrompts = this.toPromptContents(local);
    const mergeResult = merge(localPrompts, lastSync, lastSync);
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
      this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing prompts.`);
    }
    if (accptedResourcePreviews.some(({ localChange }) => localChange !== Change.None)) {
      await this.updateLocalBackup(accptedResourcePreviews);
      await this.updateLocalPrompts(accptedResourcePreviews, force);
    }
    if (accptedResourcePreviews.some(({ remoteChange }) => remoteChange !== Change.None)) {
      remoteUserData = await this.updateRemotePrompts(accptedResourcePreviews, remoteUserData, force);
    }
    if (lastSyncUserData?.ref !== remoteUserData.ref) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized prompts...`);
      await this.updateLastSyncUserData(remoteUserData);
      this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized prompts`);
    }
    for (const { previewResource } of accptedResourcePreviews) {
      try {
        await this.fileService.del(previewResource);
      } catch (e) {
      }
    }
  }
  getResourcePreviews(mergeResult, localFileContent, remote, base) {
    const resourcePreviews = /* @__PURE__ */ new Map();
    for (const key of Object.keys(mergeResult.local.added)) {
      const previewResult = {
        content: mergeResult.local.added[key],
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
        remoteContent: remote[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of Object.keys(mergeResult.local.updated)) {
      const previewResult = {
        content: mergeResult.local.updated[key],
        hasConflicts: false,
        localChange: Change.Modified,
        remoteChange: Change.None
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: base[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key],
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remote[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of mergeResult.local.removed) {
      const previewResult = {
        content: null,
        hasConflicts: false,
        localChange: Change.Deleted,
        remoteChange: Change.None
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: base[key] ?? null,
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
    for (const key of Object.keys(mergeResult.remote.added)) {
      const previewResult = {
        content: mergeResult.remote.added[key],
        hasConflicts: false,
        localChange: Change.None,
        remoteChange: Change.Added
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: base[key] ?? null,
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
    for (const key of Object.keys(mergeResult.remote.updated)) {
      const previewResult = {
        content: mergeResult.remote.updated[key],
        hasConflicts: false,
        localChange: Change.None,
        remoteChange: Change.Modified
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: base[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key],
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remote[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of mergeResult.remote.removed) {
      const previewResult = {
        content: null,
        hasConflicts: false,
        localChange: Change.None,
        remoteChange: Change.Deleted
      };
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: base[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: null,
        localContent: null,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remote[key],
        previewResource: this.extUri.joinPath(this.syncPreviewFolder, key),
        previewResult,
        localChange: previewResult.localChange,
        remoteChange: previewResult.remoteChange,
        acceptedResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "accepted" })
      });
    }
    for (const key of mergeResult.conflicts) {
      const previewResult = {
        content: base[key] ?? null,
        hasConflicts: true,
        localChange: localFileContent[key] ? Change.Modified : Change.Added,
        remoteChange: remote[key] ? Change.Modified : Change.Added
      };
      const localContent = localFileContent[key] ? localFileContent[key].value.toString() : null;
      resourcePreviews.set(key, {
        baseResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "base" }),
        baseContent: base[key] ?? null,
        localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
        fileContent: localFileContent[key] || null,
        localContent,
        remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
        remoteContent: remote[key] || null,
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
          baseContent: base[key] ?? null,
          localResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "local" }),
          fileContent: localFileContent[key] || null,
          localContent,
          remoteResource: this.extUri.joinPath(this.syncPreviewFolder, key).with({ scheme: USER_DATA_SYNC_SCHEME, authority: "remote" }),
          remoteContent: remote[key] || null,
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
      const local = await this.getPromptsFileContents();
      if (Object.keys(local).length) {
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
    await this.backupLocal(JSON.stringify(this.toPromptContents(local)));
  }
  async updateLocalPrompts(resourcePreviews, force) {
    for (const { fileContent, acceptResult, localResource, remoteResource, localChange } of resourcePreviews) {
      if (localChange !== Change.None) {
        const key = remoteResource ? this.extUri.basename(remoteResource) : this.extUri.basename(localResource);
        const resource = this.extUri.joinPath(this.promptsFolder, key);
        if (localChange === Change.Deleted) {
          this.logService.trace(`${this.syncResourceLogLabel}: Deleting prompt...`, this.extUri.basename(resource));
          await this.fileService.del(resource);
          this.logService.info(`${this.syncResourceLogLabel}: Deleted prompt`, this.extUri.basename(resource));
        } else if (localChange === Change.Added) {
          this.logService.trace(`${this.syncResourceLogLabel}: Creating prompt...`, this.extUri.basename(resource));
          await this.fileService.createFile(resource, VSBuffer.fromString(acceptResult.content), { overwrite: force });
          this.logService.info(`${this.syncResourceLogLabel}: Created prompt`, this.extUri.basename(resource));
        } else {
          this.logService.trace(`${this.syncResourceLogLabel}: Updating prompt...`, this.extUri.basename(resource));
          await this.fileService.writeFile(resource, VSBuffer.fromString(acceptResult.content), force ? void 0 : fileContent);
          this.logService.info(`${this.syncResourceLogLabel}: Updated prompt`, this.extUri.basename(resource));
        }
      }
    }
  }
  async updateRemotePrompts(resourcePreviews, remoteUserData, forcePush) {
    const currentPrompts = remoteUserData.syncData ? this.parsePrompts(remoteUserData.syncData) : {};
    const newPrompts = deepClone(currentPrompts);
    for (const { acceptResult, localResource, remoteResource, remoteChange } of resourcePreviews) {
      if (remoteChange !== Change.None) {
        const key = localResource ? this.extUri.basename(localResource) : this.extUri.basename(remoteResource);
        if (remoteChange === Change.Deleted) {
          delete newPrompts[key];
        } else {
          newPrompts[key] = acceptResult.content;
        }
      }
    }
    if (!areSame(currentPrompts, newPrompts)) {
      this.logService.trace(`${this.syncResourceLogLabel}: Updating remote prompts...`);
      remoteUserData = await this.updateRemoteUserData(JSON.stringify(newPrompts), forcePush ? null : remoteUserData.ref);
      this.logService.info(`${this.syncResourceLogLabel}: Updated remote prompts`);
    }
    return remoteUserData;
  }
  parsePrompts(syncData) {
    return parsePrompts(syncData);
  }
  toPromptContents(fileContents) {
    const prompts = {};
    for (const key of Object.keys(fileContents)) {
      prompts[key] = fileContents[key].value.toString();
    }
    return prompts;
  }
  async getPromptsFileContents() {
    const prompts = {};
    let stat;
    try {
      stat = await this.fileService.resolve(this.promptsFolder);
    } catch (e) {
      if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
        return prompts;
      } else {
        throw e;
      }
    }
    for (const entry of stat.children || []) {
      const resource = entry.resource;
      const path = resource.path;
      if ([".prompt.md", ".instructions.md", ".chatmode.md", ".agent.md"].some((ext) => path.endsWith(ext))) {
        const key = this.extUri.relativePath(this.promptsFolder, resource);
        const content = await this.fileService.readFile(resource);
        prompts[key] = content;
      }
    }
    return prompts;
  }
};
PromptsSynchronizer = __decorateClass([
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
], PromptsSynchronizer);
export {
  PromptsSynchronizer,
  parsePrompts
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXHByb21wdHNTeW5jXFxwcm9tcHRzU3luYy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcblxuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSB9IGZyb20gJy4uLy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgYXJlU2FtZSwgSU1lcmdlUmVzdWx0IGFzIElQcm9tcHRzTWVyZ2VSZXN1bHQsIG1lcmdlIH0gZnJvbSAnLi9wcm9tcHRzTWVyZ2UuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RTeW5jaHJvbmlzZXIsIElBY2NlcHRSZXN1bHQsIElGaWxlUmVzb3VyY2VQcmV2aWV3LCBJTWVyZ2VSZXN1bHQgfSBmcm9tICcuLi9hYnN0cmFjdFN5bmNocm9uaXplci5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlQ29udGVudCwgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXQgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgQ2hhbmdlLCBJUmVtb3RlVXNlckRhdGEsIElTeW5jRGF0YSwgSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLCBJVXNlckRhdGFTeW5jaHJvbmlzZXIsIElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLCBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIFN5bmNSZXNvdXJjZSwgVVNFUl9EQVRBX1NZTkNfU0NIRU1FIH0gZnJvbSAnLi4vdXNlckRhdGFTeW5jLmpzJztcblxuaW50ZXJmYWNlIElQcm9tcHRzUmVzb3VyY2VQcmV2aWV3IGV4dGVuZHMgSUZpbGVSZXNvdXJjZVByZXZpZXcge1xuXHRwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQ7XG59XG5cbmludGVyZmFjZSBJUHJvbXB0c0FjY2VwdGVkUmVzb3VyY2VQcmV2aWV3IGV4dGVuZHMgSUZpbGVSZXNvdXJjZVByZXZpZXcge1xuXHRhY2NlcHRSZXN1bHQ6IElBY2NlcHRSZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVByb21wdHMoc3luY0RhdGE6IElTeW5jRGF0YSk6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4ge1xuXHRyZXR1cm4gSlNPTi5wYXJzZShzeW5jRGF0YS5jb250ZW50KTtcbn1cblxuLyoqXG4gKiBTeW5jaHJvbml6ZXIgY2xhc3MgZm9yIHRoZSBcInVzZXJcIiBwcm9tcHQgZmlsZXMuXG4gKiBBZG9wdGVkIGZyb20ge0BsaW5rIFNuaXBwZXRzU3luY2hyb25pc2VyfS5cbiAqL1xuZXhwb3J0IGNsYXNzIFByb21wdHNTeW5jaHJvbml6ZXIgZXh0ZW5kcyBBYnN0cmFjdFN5bmNocm9uaXNlciBpbXBsZW1lbnRzIElVc2VyRGF0YVN5bmNocm9uaXNlciB7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IHZlcnNpb246IG51bWJlciA9IDE7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvbXB0c0ZvbGRlcjogVVJJO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsXG5cdFx0Y29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlIHVzZXJEYXRhU3luY1N0b3JlU2VydmljZTogSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlIHVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3Qgc3luY1Jlc291cmNlID0geyBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5Qcm9tcHRzLCBwcm9maWxlIH07XG5cdFx0c3VwZXIoXG5cdFx0XHRzeW5jUmVzb3VyY2UsXG5cdFx0XHRjb2xsZWN0aW9uLFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRlbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdHVzZXJEYXRhU3luY1N0b3JlU2VydmljZSxcblx0XHRcdHVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLFxuXHRcdFx0dXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0dXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdCk7XG5cblx0XHR0aGlzLnByb21wdHNGb2xkZXIgPSBwcm9maWxlLnByb21wdHNIb21lO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2goZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJSb2FtaW5nRGF0YUhvbWUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKHRoaXMucHJvbXB0c0ZvbGRlcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UsIGUgPT4gZS5hZmZlY3RzKHRoaXMucHJvbXB0c0ZvbGRlcikpKCgpID0+IHRoaXMudHJpZ2dlckxvY2FsQ2hhbmdlKCkpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZW5lcmF0ZVN5bmNQcmV2aWV3KHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSB8IG51bGwsIGlzUmVtb3RlRGF0YUZyb21DdXJyZW50TWFjaGluZTogYm9vbGVhbik6IFByb21pc2U8SVByb21wdHNSZXNvdXJjZVByZXZpZXdbXT4ge1xuXHRcdGNvbnN0IGxvY2FsID0gYXdhaXQgdGhpcy5nZXRQcm9tcHRzRmlsZUNvbnRlbnRzKCk7XG5cdFx0Y29uc3QgbG9jYWxQcm9tcHRzID0gdGhpcy50b1Byb21wdENvbnRlbnRzKGxvY2FsKTtcblx0XHRjb25zdCByZW1vdGVQcm9tcHRzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IHwgbnVsbCA9IHJlbW90ZVVzZXJEYXRhLnN5bmNEYXRhID8gdGhpcy5wYXJzZVByb21wdHMocmVtb3RlVXNlckRhdGEuc3luY0RhdGEpIDogbnVsbDtcblxuXHRcdC8vIFVzZSByZW1vdGUgZGF0YSBhcyBsYXN0IHN5bmMgZGF0YSBpZiBsYXN0IHN5bmMgZGF0YSBkb2VzIG5vdCBleGlzdCBhbmQgcmVtb3RlIGRhdGEgaXMgZnJvbSBzYW1lIG1hY2hpbmVcblx0XHRsYXN0U3luY1VzZXJEYXRhID0gbGFzdFN5bmNVc2VyRGF0YSA9PT0gbnVsbCAmJiBpc1JlbW90ZURhdGFGcm9tQ3VycmVudE1hY2hpbmUgPyByZW1vdGVVc2VyRGF0YSA6IGxhc3RTeW5jVXNlckRhdGE7XG5cdFx0Y29uc3QgbGFzdFN5bmNQcm9tcHRzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IHwgbnVsbCA9IGxhc3RTeW5jVXNlckRhdGEgJiYgbGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSA/IHRoaXMucGFyc2VQcm9tcHRzKGxhc3RTeW5jVXNlckRhdGEuc3luY0RhdGEpIDogbnVsbDtcblxuXHRcdGlmIChyZW1vdGVQcm9tcHRzKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IE1lcmdpbmcgcmVtb3RlIHByb21wdHMgd2l0aCBsb2NhbCBwcm9tcHRzLi4uYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogUmVtb3RlIHByb21wdHMgZG9lcyBub3QgZXhpc3QuIFN5bmNocm9uaXppbmcgcHJvbXB0cyBmb3IgdGhlIGZpcnN0IHRpbWUuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVyZ2VSZXN1bHQgPSBtZXJnZShsb2NhbFByb21wdHMsIHJlbW90ZVByb21wdHMsIGxhc3RTeW5jUHJvbXB0cyk7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UmVzb3VyY2VQcmV2aWV3cyhtZXJnZVJlc3VsdCwgbG9jYWwsIHJlbW90ZVByb21wdHMgfHwge30sIGxhc3RTeW5jUHJvbXB0cyB8fCB7fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgaGFzUmVtb3RlQ2hhbmdlZChsYXN0U3luY1VzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBsYXN0U3luYzogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiB8IG51bGwgPSBsYXN0U3luY1VzZXJEYXRhLnN5bmNEYXRhID8gdGhpcy5wYXJzZVByb21wdHMobGFzdFN5bmNVc2VyRGF0YS5zeW5jRGF0YSkgOiBudWxsO1xuXHRcdGlmIChsYXN0U3luYyA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGxvY2FsID0gYXdhaXQgdGhpcy5nZXRQcm9tcHRzRmlsZUNvbnRlbnRzKCk7XG5cdFx0Y29uc3QgbG9jYWxQcm9tcHRzID0gdGhpcy50b1Byb21wdENvbnRlbnRzKGxvY2FsKTtcblx0XHRjb25zdCBtZXJnZVJlc3VsdCA9IG1lcmdlKGxvY2FsUHJvbXB0cywgbGFzdFN5bmMsIGxhc3RTeW5jKTtcblx0XHRyZXR1cm4gT2JqZWN0LmtleXMobWVyZ2VSZXN1bHQucmVtb3RlLmFkZGVkKS5sZW5ndGggPiAwIHx8IE9iamVjdC5rZXlzKG1lcmdlUmVzdWx0LnJlbW90ZS51cGRhdGVkKS5sZW5ndGggPiAwIHx8IG1lcmdlUmVzdWx0LnJlbW90ZS5yZW1vdmVkLmxlbmd0aCA+IDAgfHwgbWVyZ2VSZXN1bHQuY29uZmxpY3RzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0TWVyZ2VSZXN1bHQocmVzb3VyY2VQcmV2aWV3OiBJUHJvbXB0c1Jlc291cmNlUHJldmlldywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWVyZ2VSZXN1bHQ+IHtcblx0XHRyZXR1cm4gcmVzb3VyY2VQcmV2aWV3LnByZXZpZXdSZXN1bHQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0QWNjZXB0UmVzdWx0KHJlc291cmNlUHJldmlldzogSVByb21wdHNSZXNvdXJjZVByZXZpZXcsIHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFjY2VwdFJlc3VsdD4ge1xuXG5cdFx0LyogQWNjZXB0IGxvY2FsIHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgdGhpcy5zeW5jUHJldmlld0ZvbGRlci53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5maWxlQ29udGVudCA/IHJlc291cmNlUHJldmlldy5maWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpIDogbnVsbCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHJlc291cmNlUHJldmlldy5maWxlQ29udGVudFxuXHRcdFx0XHRcdD8gcmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQgIT09IG51bGwgPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuQWRkZWRcblx0XHRcdFx0XHQ6IENoYW5nZS5EZWxldGVkXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8qIEFjY2VwdCByZW1vdGUgcmVzb3VyY2UgKi9cblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHJlc291cmNlLCB0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlUHJldmlldy5yZW1vdGVDb250ZW50LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogcmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQgIT09IG51bGxcblx0XHRcdFx0XHQ/IHJlc291cmNlUHJldmlldy5maWxlQ29udGVudCA/IENoYW5nZS5Nb2RpZmllZCA6IENoYW5nZS5BZGRlZFxuXHRcdFx0XHRcdDogQ2hhbmdlLkRlbGV0ZWQsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8qIEFjY2VwdCBwcmV2aWV3IHJlc291cmNlICovXG5cdFx0aWYgKHRoaXMuZXh0VXJpLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgdGhpcy5zeW5jUHJldmlld0ZvbGRlcikpIHtcblx0XHRcdGlmIChjb250ZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjb250ZW50OiByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdC5jb250ZW50LFxuXHRcdFx0XHRcdGxvY2FsQ2hhbmdlOiByZXNvdXJjZVByZXZpZXcucHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHJlc291cmNlUHJldmlldy5wcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0XHRsb2NhbENoYW5nZTogY29udGVudCA9PT0gbnVsbFxuXHRcdFx0XHRcdFx0PyByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQgIT09IG51bGwgPyBDaGFuZ2UuRGVsZXRlZCA6IENoYW5nZS5Ob25lXG5cdFx0XHRcdFx0XHQ6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdFx0XHRyZW1vdGVDaGFuZ2U6IGNvbnRlbnQgPT09IG51bGxcblx0XHRcdFx0XHRcdD8gcmVzb3VyY2VQcmV2aWV3LnJlbW90ZUNvbnRlbnQgIT09IG51bGwgPyBDaGFuZ2UuRGVsZXRlZCA6IENoYW5nZS5Ob25lXG5cdFx0XHRcdFx0XHQ6IENoYW5nZS5Nb2RpZmllZFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBSZXNvdXJjZTogJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGFwcGx5UmVzdWx0KHJlbW90ZVVzZXJEYXRhOiBJUmVtb3RlVXNlckRhdGEsIGxhc3RTeW5jVXNlckRhdGE6IElSZW1vdGVVc2VyRGF0YSB8IG51bGwsIHJlc291cmNlUHJldmlld3M6IFtJUHJvbXB0c1Jlc291cmNlUHJldmlldywgSUFjY2VwdFJlc3VsdF1bXSwgZm9yY2U6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhY2NwdGVkUmVzb3VyY2VQcmV2aWV3czogSVByb21wdHNBY2NlcHRlZFJlc291cmNlUHJldmlld1tdID0gcmVzb3VyY2VQcmV2aWV3cy5tYXAoKFtyZXNvdXJjZVByZXZpZXcsIGFjY2VwdFJlc3VsdF0pID0+ICh7IC4uLnJlc291cmNlUHJldmlldywgYWNjZXB0UmVzdWx0IH0pKTtcblx0XHRpZiAoYWNjcHRlZFJlc291cmNlUHJldmlld3MuZXZlcnkoKHsgbG9jYWxDaGFuZ2UsIHJlbW90ZUNoYW5nZSB9KSA9PiBsb2NhbENoYW5nZSA9PT0gQ2hhbmdlLk5vbmUgJiYgcmVtb3RlQ2hhbmdlID09PSBDaGFuZ2UuTm9uZSkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBObyBjaGFuZ2VzIGZvdW5kIGR1cmluZyBzeW5jaHJvbml6aW5nIHByb21wdHMuYCk7XG5cdFx0fVxuXG5cdFx0aWYgKGFjY3B0ZWRSZXNvdXJjZVByZXZpZXdzLnNvbWUoKHsgbG9jYWxDaGFuZ2UgfSkgPT4gbG9jYWxDaGFuZ2UgIT09IENoYW5nZS5Ob25lKSkge1xuXHRcdFx0Ly8gYmFjayB1cCBhbGwgcHJvbXB0c1xuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVMb2NhbEJhY2t1cChhY2NwdGVkUmVzb3VyY2VQcmV2aWV3cyk7XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUxvY2FsUHJvbXB0cyhhY2NwdGVkUmVzb3VyY2VQcmV2aWV3cywgZm9yY2UpO1xuXHRcdH1cblxuXHRcdGlmIChhY2NwdGVkUmVzb3VyY2VQcmV2aWV3cy5zb21lKCh7IHJlbW90ZUNoYW5nZSB9KSA9PiByZW1vdGVDaGFuZ2UgIT09IENoYW5nZS5Ob25lKSkge1xuXHRcdFx0cmVtb3RlVXNlckRhdGEgPSBhd2FpdCB0aGlzLnVwZGF0ZVJlbW90ZVByb21wdHMoYWNjcHRlZFJlc291cmNlUHJldmlld3MsIHJlbW90ZVVzZXJEYXRhLCBmb3JjZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGxhc3RTeW5jVXNlckRhdGE/LnJlZiAhPT0gcmVtb3RlVXNlckRhdGEucmVmKSB7XG5cdFx0XHQvLyB1cGRhdGUgbGFzdCBzeW5jXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nIGxhc3Qgc3luY2hyb25pemVkIHByb21wdHMuLi5gKTtcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTGFzdFN5bmNVc2VyRGF0YShyZW1vdGVVc2VyRGF0YSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogVXBkYXRlZCBsYXN0IHN5bmNocm9uaXplZCBwcm9tcHRzYCk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB7IHByZXZpZXdSZXNvdXJjZSB9IG9mIGFjY3B0ZWRSZXNvdXJjZVByZXZpZXdzKSB7XG5cdFx0XHQvLyBEZWxldGUgdGhlIHByZXZpZXdcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHByZXZpZXdSZXNvdXJjZSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0fVxuXG5cdH1cblxuXHRwcml2YXRlIGdldFJlc291cmNlUHJldmlld3MoXG5cdFx0bWVyZ2VSZXN1bHQ6IElQcm9tcHRzTWVyZ2VSZXN1bHQsXG5cdFx0bG9jYWxGaWxlQ29udGVudDogSVN0cmluZ0RpY3Rpb25hcnk8SUZpbGVDb250ZW50Pixcblx0XHRyZW1vdGU6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4sXG5cdFx0YmFzZTogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPixcblx0KTogSVByb21wdHNSZXNvdXJjZVByZXZpZXdbXSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VQcmV2aWV3czogTWFwPHN0cmluZywgSVByb21wdHNSZXNvdXJjZVByZXZpZXc+ID0gbmV3IE1hcDxzdHJpbmcsIElQcm9tcHRzUmVzb3VyY2VQcmV2aWV3PigpO1xuXG5cdFx0LyogUHJvbXB0cyBhZGRlZCByZW1vdGVseSAtPiBhZGQgbG9jYWxseSAqL1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKG1lcmdlUmVzdWx0LmxvY2FsLmFkZGVkKSkge1xuXHRcdFx0Y29uc3QgcHJldmlld1Jlc3VsdDogSU1lcmdlUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBtZXJnZVJlc3VsdC5sb2NhbC5hZGRlZFtrZXldLFxuXHRcdFx0XHRoYXNDb25mbGljdHM6IGZhbHNlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLkFkZGVkLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0fTtcblx0XHRcdHJlc291cmNlUHJldmlld3Muc2V0KGtleSwge1xuXHRcdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSxcblx0XHRcdFx0YmFzZUNvbnRlbnQ6IG51bGwsXG5cdFx0XHRcdGZpbGVDb250ZW50OiBudWxsLFxuXHRcdFx0XHRsb2NhbFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pLFxuXHRcdFx0XHRsb2NhbENvbnRlbnQ6IG51bGwsXG5cdFx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSxcblx0XHRcdFx0cmVtb3RlQ29udGVudDogcmVtb3RlW2tleV0sXG5cdFx0XHRcdHByZXZpZXdSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KSxcblx0XHRcdFx0cHJldmlld1Jlc3VsdCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IHByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogcHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2UsXG5cdFx0XHRcdGFjY2VwdGVkUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8qIFByb21wdHMgdXBkYXRlZCByZW1vdGVseSAtPiB1cGRhdGUgbG9jYWxseSAqL1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKG1lcmdlUmVzdWx0LmxvY2FsLnVwZGF0ZWQpKSB7XG5cdFx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IG1lcmdlUmVzdWx0LmxvY2FsLnVwZGF0ZWRba2V5XSxcblx0XHRcdFx0aGFzQ29uZmxpY3RzOiBmYWxzZSxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Nb2RpZmllZCxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBsb2NhbEZpbGVDb250ZW50W2tleV0gPyBsb2NhbEZpbGVDb250ZW50W2tleV0udmFsdWUudG9TdHJpbmcoKSA6IG51bGw7XG5cdFx0XHRyZXNvdXJjZVByZXZpZXdzLnNldChrZXksIHtcblx0XHRcdFx0YmFzZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSksXG5cdFx0XHRcdGJhc2VDb250ZW50OiBiYXNlW2tleV0gPz8gbnVsbCxcblx0XHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSxcblx0XHRcdFx0ZmlsZUNvbnRlbnQ6IGxvY2FsRmlsZUNvbnRlbnRba2V5XSxcblx0XHRcdFx0bG9jYWxDb250ZW50LFxuXHRcdFx0XHRyZW1vdGVSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSksXG5cdFx0XHRcdHJlbW90ZUNvbnRlbnQ6IHJlbW90ZVtrZXldLFxuXHRcdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSksXG5cdFx0XHRcdHByZXZpZXdSZXN1bHQsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0XHRhY2NlcHRlZFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYWNjZXB0ZWQnIH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvKiBQcm9tcHRzIHJlbW92ZWQgcmVtb3RlbHkgLT4gcmVtb3ZlIGxvY2FsbHkgKi9cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBtZXJnZVJlc3VsdC5sb2NhbC5yZW1vdmVkKSB7XG5cdFx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IG51bGwsXG5cdFx0XHRcdGhhc0NvbmZsaWN0czogZmFsc2UsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuRGVsZXRlZCxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBsb2NhbEZpbGVDb250ZW50W2tleV0gPyBsb2NhbEZpbGVDb250ZW50W2tleV0udmFsdWUudG9TdHJpbmcoKSA6IG51bGw7XG5cdFx0XHRyZXNvdXJjZVByZXZpZXdzLnNldChrZXksIHtcblx0XHRcdFx0YmFzZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSksXG5cdFx0XHRcdGJhc2VDb250ZW50OiBiYXNlW2tleV0gPz8gbnVsbCxcblx0XHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSxcblx0XHRcdFx0ZmlsZUNvbnRlbnQ6IGxvY2FsRmlsZUNvbnRlbnRba2V5XSxcblx0XHRcdFx0bG9jYWxDb250ZW50LFxuXHRcdFx0XHRyZW1vdGVSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSksXG5cdFx0XHRcdHJlbW90ZUNvbnRlbnQ6IG51bGwsXG5cdFx0XHRcdHByZXZpZXdSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KSxcblx0XHRcdFx0cHJldmlld1Jlc3VsdCxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IHByZXZpZXdSZXN1bHQubG9jYWxDaGFuZ2UsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogcHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2UsXG5cdFx0XHRcdGFjY2VwdGVkUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdhY2NlcHRlZCcgfSlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8qIFByb21wdHMgYWRkZWQgbG9jYWxseSAtPiBhZGQgcmVtb3RlbHkgKi9cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhtZXJnZVJlc3VsdC5yZW1vdGUuYWRkZWQpKSB7XG5cdFx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IG1lcmdlUmVzdWx0LnJlbW90ZS5hZGRlZFtrZXldLFxuXHRcdFx0XHRoYXNDb25mbGljdHM6IGZhbHNlLFxuXHRcdFx0XHRsb2NhbENoYW5nZTogQ2hhbmdlLk5vbmUsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLkFkZGVkLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGxvY2FsRmlsZUNvbnRlbnRba2V5XSA/IGxvY2FsRmlsZUNvbnRlbnRba2V5XS52YWx1ZS50b1N0cmluZygpIDogbnVsbDtcblx0XHRcdHJlc291cmNlUHJldmlld3Muc2V0KGtleSwge1xuXHRcdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSxcblx0XHRcdFx0YmFzZUNvbnRlbnQ6IGJhc2Vba2V5XSA/PyBudWxsLFxuXHRcdFx0XHRsb2NhbFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pLFxuXHRcdFx0XHRmaWxlQ29udGVudDogbG9jYWxGaWxlQ29udGVudFtrZXldLFxuXHRcdFx0XHRsb2NhbENvbnRlbnQsXG5cdFx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSxcblx0XHRcdFx0cmVtb3RlQ29udGVudDogbnVsbCxcblx0XHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLFxuXHRcdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0LyogUHJvbXB0cyB1cGRhdGVkIGxvY2FsbHkgLT4gdXBkYXRlIHJlbW90ZWx5ICovXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMobWVyZ2VSZXN1bHQucmVtb3RlLnVwZGF0ZWQpKSB7XG5cdFx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IG1lcmdlUmVzdWx0LnJlbW90ZS51cGRhdGVkW2tleV0sXG5cdFx0XHRcdGhhc0NvbmZsaWN0czogZmFsc2UsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBDaGFuZ2UuTm9uZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBDaGFuZ2UuTW9kaWZpZWQsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gbG9jYWxGaWxlQ29udGVudFtrZXldID8gbG9jYWxGaWxlQ29udGVudFtrZXldLnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsO1xuXHRcdFx0cmVzb3VyY2VQcmV2aWV3cy5zZXQoa2V5LCB7XG5cdFx0XHRcdGJhc2VSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2Jhc2UnIH0pLFxuXHRcdFx0XHRiYXNlQ29udGVudDogYmFzZVtrZXldID8/IG51bGwsXG5cdFx0XHRcdGxvY2FsUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdsb2NhbCcgfSksXG5cdFx0XHRcdGZpbGVDb250ZW50OiBsb2NhbEZpbGVDb250ZW50W2tleV0sXG5cdFx0XHRcdGxvY2FsQ29udGVudCxcblx0XHRcdFx0cmVtb3RlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUnIH0pLFxuXHRcdFx0XHRyZW1vdGVDb250ZW50OiByZW1vdGVba2V5XSxcblx0XHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLFxuXHRcdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0LyogUHJvbXB0cyByZW1vdmVkIGxvY2FsbHkgLT4gcmVtb3ZlIHJlbW90ZWx5ICovXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgbWVyZ2VSZXN1bHQucmVtb3RlLnJlbW92ZWQpIHtcblx0XHRcdGNvbnN0IHByZXZpZXdSZXN1bHQ6IElNZXJnZVJlc3VsdCA9IHtcblx0XHRcdFx0Y29udGVudDogbnVsbCxcblx0XHRcdFx0aGFzQ29uZmxpY3RzOiBmYWxzZSxcblx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IENoYW5nZS5EZWxldGVkLFxuXHRcdFx0fTtcblx0XHRcdHJlc291cmNlUHJldmlld3Muc2V0KGtleSwge1xuXHRcdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSxcblx0XHRcdFx0YmFzZUNvbnRlbnQ6IGJhc2Vba2V5XSA/PyBudWxsLFxuXHRcdFx0XHRsb2NhbFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pLFxuXHRcdFx0XHRmaWxlQ29udGVudDogbnVsbCxcblx0XHRcdFx0bG9jYWxDb250ZW50OiBudWxsLFxuXHRcdFx0XHRyZW1vdGVSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSksXG5cdFx0XHRcdHJlbW90ZUNvbnRlbnQ6IHJlbW90ZVtrZXldLFxuXHRcdFx0XHRwcmV2aWV3UmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSksXG5cdFx0XHRcdHByZXZpZXdSZXN1bHQsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0XHRyZW1vdGVDaGFuZ2U6IHByZXZpZXdSZXN1bHQucmVtb3RlQ2hhbmdlLFxuXHRcdFx0XHRhY2NlcHRlZFJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYWNjZXB0ZWQnIH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvKiBQcm9tcHRzIHdpdGggY29uZmxpY3RzICovXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgbWVyZ2VSZXN1bHQuY29uZmxpY3RzKSB7XG5cdFx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IGJhc2Vba2V5XSA/PyBudWxsLFxuXHRcdFx0XHRoYXNDb25mbGljdHM6IHRydWUsXG5cdFx0XHRcdGxvY2FsQ2hhbmdlOiBsb2NhbEZpbGVDb250ZW50W2tleV0gPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuQWRkZWQsXG5cdFx0XHRcdHJlbW90ZUNoYW5nZTogcmVtb3RlW2tleV0gPyBDaGFuZ2UuTW9kaWZpZWQgOiBDaGFuZ2UuQWRkZWRcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBsb2NhbEZpbGVDb250ZW50W2tleV0gPyBsb2NhbEZpbGVDb250ZW50W2tleV0udmFsdWUudG9TdHJpbmcoKSA6IG51bGw7XG5cdFx0XHRyZXNvdXJjZVByZXZpZXdzLnNldChrZXksIHtcblx0XHRcdFx0YmFzZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnYmFzZScgfSksXG5cdFx0XHRcdGJhc2VDb250ZW50OiBiYXNlW2tleV0gPz8gbnVsbCxcblx0XHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSxcblx0XHRcdFx0ZmlsZUNvbnRlbnQ6IGxvY2FsRmlsZUNvbnRlbnRba2V5XSB8fCBudWxsLFxuXHRcdFx0XHRsb2NhbENvbnRlbnQsXG5cdFx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSxcblx0XHRcdFx0cmVtb3RlQ29udGVudDogcmVtb3RlW2tleV0gfHwgbnVsbCxcblx0XHRcdFx0cHJldmlld1Jlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLFxuXHRcdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0XHRsb2NhbENoYW5nZTogcHJldmlld1Jlc3VsdC5sb2NhbENoYW5nZSxcblx0XHRcdFx0cmVtb3RlQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LnJlbW90ZUNoYW5nZSxcblx0XHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0LyogVW5tb2RpZmllZCBQcm9tcHRzICovXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMobG9jYWxGaWxlQ29udGVudCkpIHtcblx0XHRcdGlmICghcmVzb3VyY2VQcmV2aWV3cy5oYXMoa2V5KSkge1xuXHRcdFx0XHRjb25zdCBwcmV2aWV3UmVzdWx0OiBJTWVyZ2VSZXN1bHQgPSB7XG5cdFx0XHRcdFx0Y29udGVudDogbG9jYWxGaWxlQ29udGVudFtrZXldID8gbG9jYWxGaWxlQ29udGVudFtrZXldLnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsLFxuXHRcdFx0XHRcdGhhc0NvbmZsaWN0czogZmFsc2UsXG5cdFx0XHRcdFx0bG9jYWxDaGFuZ2U6IENoYW5nZS5Ob25lLFxuXHRcdFx0XHRcdHJlbW90ZUNoYW5nZTogQ2hhbmdlLk5vbmVcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gbG9jYWxGaWxlQ29udGVudFtrZXldID8gbG9jYWxGaWxlQ29udGVudFtrZXldLnZhbHVlLnRvU3RyaW5nKCkgOiBudWxsO1xuXHRcdFx0XHRyZXNvdXJjZVByZXZpZXdzLnNldChrZXksIHtcblx0XHRcdFx0XHRiYXNlUmVzb3VyY2U6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHRoaXMuc3luY1ByZXZpZXdGb2xkZXIsIGtleSkud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBhdXRob3JpdHk6ICdiYXNlJyB9KSxcblx0XHRcdFx0XHRiYXNlQ29udGVudDogYmFzZVtrZXldID8/IG51bGwsXG5cdFx0XHRcdFx0bG9jYWxSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2xvY2FsJyB9KSxcblx0XHRcdFx0XHRmaWxlQ29udGVudDogbG9jYWxGaWxlQ29udGVudFtrZXldIHx8IG51bGwsXG5cdFx0XHRcdFx0bG9jYWxDb250ZW50LFxuXHRcdFx0XHRcdHJlbW90ZVJlc291cmNlOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLCBrZXkpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlJyB9KSxcblx0XHRcdFx0XHRyZW1vdGVDb250ZW50OiByZW1vdGVba2V5XSB8fCBudWxsLFxuXHRcdFx0XHRcdHByZXZpZXdSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KSxcblx0XHRcdFx0XHRwcmV2aWV3UmVzdWx0LFxuXHRcdFx0XHRcdGxvY2FsQ2hhbmdlOiBwcmV2aWV3UmVzdWx0LmxvY2FsQ2hhbmdlLFxuXHRcdFx0XHRcdHJlbW90ZUNoYW5nZTogcHJldmlld1Jlc3VsdC5yZW1vdGVDaGFuZ2UsXG5cdFx0XHRcdFx0YWNjZXB0ZWRSZXNvdXJjZTogdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5zeW5jUHJldmlld0ZvbGRlciwga2V5KS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gWy4uLnJlc291cmNlUHJldmlld3MudmFsdWVzKCldO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZUNvbnRlbnQodXJpOiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0XHRpZiAodGhpcy5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHVyaSwgdGhpcy5zeW5jUHJldmlld0ZvbGRlci53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZScgfSkpXG5cdFx0XHR8fCB0aGlzLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQodXJpLCB0aGlzLnN5bmNQcmV2aWV3Rm9sZGVyLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5OiAnbG9jYWwnIH0pKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHVyaSwgdGhpcy5zeW5jUHJldmlld0ZvbGRlci53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2Jhc2UnIH0pKVxuXHRcdFx0fHwgdGhpcy5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHVyaSwgdGhpcy5zeW5jUHJldmlld0ZvbGRlci53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIGF1dGhvcml0eTogJ2FjY2VwdGVkJyB9KSkpIHtcblx0XHRcdHJldHVybiB0aGlzLnJlc29sdmVQcmV2aWV3Q29udGVudCh1cmkpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGFzeW5jIGhhc0xvY2FsRGF0YSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbG9jYWwgPSBhd2FpdCB0aGlzLmdldFByb21wdHNGaWxlQ29udGVudHMoKTtcblx0XHRcdGlmIChPYmplY3Qua2V5cyhsb2NhbCkubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvKiBpZ25vcmUgZXJyb3IgKi9cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVMb2NhbEJhY2t1cChyZXNvdXJjZVByZXZpZXdzOiBJRmlsZVJlc291cmNlUHJldmlld1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbG9jYWw6IElTdHJpbmdEaWN0aW9uYXJ5PElGaWxlQ29udGVudD4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlUHJldmlldyBvZiByZXNvdXJjZVByZXZpZXdzKSB7XG5cdFx0XHRpZiAocmVzb3VyY2VQcmV2aWV3LmZpbGVDb250ZW50KSB7XG5cdFx0XHRcdGxvY2FsW3RoaXMuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlUHJldmlldy5sb2NhbFJlc291cmNlKV0gPSByZXNvdXJjZVByZXZpZXcuZmlsZUNvbnRlbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuYmFja3VwTG9jYWwoSlNPTi5zdHJpbmdpZnkodGhpcy50b1Byb21wdENvbnRlbnRzKGxvY2FsKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVMb2NhbFByb21wdHMocmVzb3VyY2VQcmV2aWV3czogSVByb21wdHNBY2NlcHRlZFJlc291cmNlUHJldmlld1tdLCBmb3JjZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3QgeyBmaWxlQ29udGVudCwgYWNjZXB0UmVzdWx0LCBsb2NhbFJlc291cmNlLCByZW1vdGVSZXNvdXJjZSwgbG9jYWxDaGFuZ2UgfSBvZiByZXNvdXJjZVByZXZpZXdzKSB7XG5cdFx0XHRpZiAobG9jYWxDaGFuZ2UgIT09IENoYW5nZS5Ob25lKSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IHJlbW90ZVJlc291cmNlID8gdGhpcy5leHRVcmkuYmFzZW5hbWUocmVtb3RlUmVzb3VyY2UpIDogdGhpcy5leHRVcmkuYmFzZW5hbWUobG9jYWxSZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5leHRVcmkuam9pblBhdGgodGhpcy5wcm9tcHRzRm9sZGVyLCBrZXkpO1xuXG5cdFx0XHRcdC8vIFJlbW92ZWRcblx0XHRcdFx0aWYgKGxvY2FsQ2hhbmdlID09PSBDaGFuZ2UuRGVsZXRlZCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogRGVsZXRpbmcgcHJvbXB0Li4uYCwgdGhpcy5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChyZXNvdXJjZSk7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IERlbGV0ZWQgcHJvbXB0YCwgdGhpcy5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEFkZGVkXG5cdFx0XHRcdGVsc2UgaWYgKGxvY2FsQ2hhbmdlID09PSBDaGFuZ2UuQWRkZWQpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IENyZWF0aW5nIHByb21wdC4uLmAsIHRoaXMuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5jcmVhdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGFjY2VwdFJlc3VsdC5jb250ZW50ISksIHsgb3ZlcndyaXRlOiBmb3JjZSB9KTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgJHt0aGlzLnN5bmNSZXNvdXJjZUxvZ0xhYmVsfTogQ3JlYXRlZCBwcm9tcHRgLCB0aGlzLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVXBkYXRlZFxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nIHByb21wdC4uLmAsIHRoaXMuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoYWNjZXB0UmVzdWx0LmNvbnRlbnQhKSwgZm9yY2UgPyB1bmRlZmluZWQgOiBmaWxlQ29udGVudCEpO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGAke3RoaXMuc3luY1Jlc291cmNlTG9nTGFiZWx9OiBVcGRhdGVkIHByb21wdGAsIHRoaXMuZXh0VXJpLmJhc2VuYW1lKHJlc291cmNlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZVJlbW90ZVByb21wdHMocmVzb3VyY2VQcmV2aWV3czogSVByb21wdHNBY2NlcHRlZFJlc291cmNlUHJldmlld1tdLCByZW1vdGVVc2VyRGF0YTogSVJlbW90ZVVzZXJEYXRhLCBmb3JjZVB1c2g6IGJvb2xlYW4pOiBQcm9taXNlPElSZW1vdGVVc2VyRGF0YT4ge1xuXHRcdGNvbnN0IGN1cnJlbnRQcm9tcHRzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+ID0gcmVtb3RlVXNlckRhdGEuc3luY0RhdGEgPyB0aGlzLnBhcnNlUHJvbXB0cyhyZW1vdGVVc2VyRGF0YS5zeW5jRGF0YSkgOiB7fTtcblx0XHRjb25zdCBuZXdQcm9tcHRzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+ID0gZGVlcENsb25lKGN1cnJlbnRQcm9tcHRzKTtcblxuXHRcdGZvciAoY29uc3QgeyBhY2NlcHRSZXN1bHQsIGxvY2FsUmVzb3VyY2UsIHJlbW90ZVJlc291cmNlLCByZW1vdGVDaGFuZ2UgfSBvZiByZXNvdXJjZVByZXZpZXdzKSB7XG5cdFx0XHRpZiAocmVtb3RlQ2hhbmdlICE9PSBDaGFuZ2UuTm9uZSkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBsb2NhbFJlc291cmNlID8gdGhpcy5leHRVcmkuYmFzZW5hbWUobG9jYWxSZXNvdXJjZSkgOiB0aGlzLmV4dFVyaS5iYXNlbmFtZShyZW1vdGVSZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChyZW1vdGVDaGFuZ2UgPT09IENoYW5nZS5EZWxldGVkKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIG5ld1Byb21wdHNba2V5XTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRuZXdQcm9tcHRzW2tleV0gPSBhY2NlcHRSZXN1bHQuY29udGVudCE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWFyZVNhbWUoY3VycmVudFByb21wdHMsIG5ld1Byb21wdHMpKSB7XG5cdFx0XHQvLyB1cGRhdGUgcmVtb3RlXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0aW5nIHJlbW90ZSBwcm9tcHRzLi4uYCk7XG5cdFx0XHRyZW1vdGVVc2VyRGF0YSA9IGF3YWl0IHRoaXMudXBkYXRlUmVtb3RlVXNlckRhdGEoSlNPTi5zdHJpbmdpZnkobmV3UHJvbXB0cyksIGZvcmNlUHVzaCA/IG51bGwgOiByZW1vdGVVc2VyRGF0YS5yZWYpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYCR7dGhpcy5zeW5jUmVzb3VyY2VMb2dMYWJlbH06IFVwZGF0ZWQgcmVtb3RlIHByb21wdHNgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlbW90ZVVzZXJEYXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZVByb21wdHMoc3luY0RhdGE6IElTeW5jRGF0YSk6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4ge1xuXHRcdHJldHVybiBwYXJzZVByb21wdHMoc3luY0RhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1Byb21wdENvbnRlbnRzKGZpbGVDb250ZW50czogSVN0cmluZ0RpY3Rpb25hcnk8SUZpbGVDb250ZW50Pik6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4ge1xuXHRcdGNvbnN0IHByb21wdHM6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhmaWxlQ29udGVudHMpKSB7XG5cdFx0XHRwcm9tcHRzW2tleV0gPSBmaWxlQ29udGVudHNba2V5XS52YWx1ZS50b1N0cmluZygpO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvbXB0cztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0UHJvbXB0c0ZpbGVDb250ZW50cygpOiBQcm9taXNlPElTdHJpbmdEaWN0aW9uYXJ5PElGaWxlQ29udGVudD4+IHtcblx0XHRjb25zdCBwcm9tcHRzOiBJU3RyaW5nRGljdGlvbmFyeTxJRmlsZUNvbnRlbnQ+ID0ge307XG5cdFx0bGV0IHN0YXQ6IElGaWxlU3RhdDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZSh0aGlzLnByb21wdHNGb2xkZXIpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIE5vIHByb21wdHNcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgRmlsZU9wZXJhdGlvbkVycm9yICYmIGUuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRyZXR1cm4gcHJvbXB0cztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZW50cnkgb2Ygc3RhdC5jaGlsZHJlbiB8fCBbXSkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBlbnRyeS5yZXNvdXJjZTtcblx0XHRcdGNvbnN0IHBhdGggPSByZXNvdXJjZS5wYXRoO1xuXHRcdFx0aWYgKFsnLnByb21wdC5tZCcsICcuaW5zdHJ1Y3Rpb25zLm1kJywgJy5jaGF0bW9kZS5tZCcsICcuYWdlbnQubWQnXS5zb21lKGV4dCA9PiBwYXRoLmVuZHNXaXRoKGV4dCkpKSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IHRoaXMuZXh0VXJpLnJlbGF0aXZlUGF0aCh0aGlzLnByb21wdHNGb2xkZXIsIHJlc291cmNlKSE7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRcdFx0cHJvbXB0c1trZXldID0gY29udGVudDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcHJvbXB0cztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFHbEMsU0FBUywyQkFBMkI7QUFD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
