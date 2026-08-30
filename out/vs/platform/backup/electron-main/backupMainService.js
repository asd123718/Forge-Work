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
import { createHash } from "crypto";
import { isEqual } from "../../../base/common/extpath.js";
import { Schemas } from "../../../base/common/network.js";
import { join } from "../../../base/common/path.js";
import { isLinux } from "../../../base/common/platform.js";
import { extUriBiasedIgnorePathCase } from "../../../base/common/resources.js";
import { Promises, RimRafMode } from "../../../base/node/pfs.js";
import { isEmptyWindowBackupInfo, deserializeWorkspaceInfos, deserializeFolderInfos } from "../node/backup.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { IStateService } from "../../state/node/state.js";
import { HotExitConfiguration } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { isFolderBackupInfo } from "../common/backup.js";
import { isWorkspaceIdentifier } from "../../workspace/common/workspace.js";
import { createEmptyWorkspaceIdentifier } from "../../workspaces/node/workspaces.js";
let BackupMainService = class {
  constructor(environmentMainService, configurationService, logService, stateService) {
    this.configurationService = configurationService;
    this.logService = logService;
    this.stateService = stateService;
    this.workspaces = [];
    this.folders = [];
    this.emptyWindows = [];
    // Comparers for paths and resources that will
    // - ignore path casing on Windows/macOS
    // - respect path casing on Linux
    this.backupUriComparer = extUriBiasedIgnorePathCase;
    this.backupPathComparer = { isEqual: (pathA, pathB) => isEqual(pathA, pathB, !isLinux) };
    this.backupHome = environmentMainService.backupHome;
  }
  async initialize() {
    const serializedBackupWorkspaces = this.stateService.getItem(BackupMainService.backupWorkspacesMetadataStorageKey) ?? { workspaces: [], folders: [], emptyWindows: [] };
    this.emptyWindows = await this.validateEmptyWorkspaces(serializedBackupWorkspaces.emptyWindows);
    this.workspaces = await this.validateWorkspaces(deserializeWorkspaceInfos(serializedBackupWorkspaces));
    this.folders = await this.validateFolders(deserializeFolderInfos(serializedBackupWorkspaces));
    this.storeWorkspacesMetadata();
  }
  getWorkspaceBackups() {
    if (this.isHotExitOnExitAndWindowClose()) {
      return [];
    }
    return this.workspaces.slice(0);
  }
  getFolderBackups() {
    if (this.isHotExitOnExitAndWindowClose()) {
      return [];
    }
    return this.folders.slice(0);
  }
  isHotExitEnabled() {
    return this.getHotExitConfig() !== HotExitConfiguration.OFF;
  }
  isHotExitOnExitAndWindowClose() {
    return this.getHotExitConfig() === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE;
  }
  getHotExitConfig() {
    const config = this.configurationService.getValue();
    return config?.files?.hotExit || HotExitConfiguration.ON_EXIT;
  }
  getEmptyWindowBackups() {
    return this.emptyWindows.slice(0);
  }
  registerWorkspaceBackup(workspaceInfo, migrateFrom) {
    if (!this.workspaces.some((workspace) => workspaceInfo.workspace.id === workspace.workspace.id)) {
      this.workspaces.push(workspaceInfo);
      this.storeWorkspacesMetadata();
    }
    const backupPath = join(this.backupHome, workspaceInfo.workspace.id);
    if (migrateFrom) {
      return this.moveBackupFolder(backupPath, migrateFrom).then(() => backupPath);
    }
    return backupPath;
  }
  async moveBackupFolder(backupPath, moveFromPath) {
    if (await Promises.exists(backupPath)) {
      await this.convertToEmptyWindowBackup(backupPath);
    }
    if (await Promises.exists(moveFromPath)) {
      try {
        await Promises.rename(
          moveFromPath,
          backupPath,
          false
          /* no retry */
        );
      } catch (error) {
        this.logService.error(`Backup: Could not move backup folder to new location: ${error.toString()}`);
      }
    }
  }
  registerFolderBackup(folderInfo) {
    if (!this.folders.some((folder) => this.backupUriComparer.isEqual(folderInfo.folderUri, folder.folderUri))) {
      this.folders.push(folderInfo);
      this.storeWorkspacesMetadata();
    }
    return join(this.backupHome, this.getFolderHash(folderInfo));
  }
  registerEmptyWindowBackup(emptyWindowInfo) {
    if (!this.emptyWindows.some((emptyWindow) => !!emptyWindow.backupFolder && this.backupPathComparer.isEqual(emptyWindow.backupFolder, emptyWindowInfo.backupFolder))) {
      this.emptyWindows.push(emptyWindowInfo);
      this.storeWorkspacesMetadata();
    }
    return join(this.backupHome, emptyWindowInfo.backupFolder);
  }
  async validateWorkspaces(rootWorkspaces) {
    if (!Array.isArray(rootWorkspaces)) {
      return [];
    }
    const seenIds = /* @__PURE__ */ new Set();
    const result = [];
    for (const workspaceInfo of rootWorkspaces) {
      const workspace = workspaceInfo.workspace;
      if (!isWorkspaceIdentifier(workspace)) {
        return [];
      }
      if (!seenIds.has(workspace.id)) {
        seenIds.add(workspace.id);
        const backupPath = join(this.backupHome, workspace.id);
        const hasBackups = await this.doHasBackups(backupPath);
        if (hasBackups) {
          if (workspace.configPath.scheme !== Schemas.file || await Promises.exists(workspace.configPath.fsPath)) {
            result.push(workspaceInfo);
          } else {
            await this.convertToEmptyWindowBackup(backupPath);
          }
        } else {
          await this.deleteStaleBackup(backupPath);
        }
      }
    }
    return result;
  }
  async validateFolders(folderWorkspaces) {
    if (!Array.isArray(folderWorkspaces)) {
      return [];
    }
    const result = [];
    const seenIds = /* @__PURE__ */ new Set();
    for (const folderInfo of folderWorkspaces) {
      const folderURI = folderInfo.folderUri;
      const key = this.backupUriComparer.getComparisonKey(folderURI);
      if (!seenIds.has(key)) {
        seenIds.add(key);
        const backupPath = join(this.backupHome, this.getFolderHash(folderInfo));
        const hasBackups = await this.doHasBackups(backupPath);
        if (hasBackups) {
          if (folderURI.scheme !== Schemas.file || await Promises.exists(folderURI.fsPath)) {
            result.push(folderInfo);
          } else {
            await this.convertToEmptyWindowBackup(backupPath);
          }
        } else {
          await this.deleteStaleBackup(backupPath);
        }
      }
    }
    return result;
  }
  async validateEmptyWorkspaces(emptyWorkspaces) {
    if (!Array.isArray(emptyWorkspaces)) {
      return [];
    }
    const result = [];
    const seenIds = /* @__PURE__ */ new Set();
    for (const backupInfo of emptyWorkspaces) {
      const backupFolder = backupInfo.backupFolder;
      if (typeof backupFolder !== "string") {
        return [];
      }
      if (!seenIds.has(backupFolder)) {
        seenIds.add(backupFolder);
        const backupPath = join(this.backupHome, backupFolder);
        if (await this.doHasBackups(backupPath)) {
          result.push(backupInfo);
        } else {
          await this.deleteStaleBackup(backupPath);
        }
      }
    }
    return result;
  }
  async deleteStaleBackup(backupPath) {
    try {
      await Promises.rm(backupPath, RimRafMode.MOVE);
    } catch (error) {
      this.logService.error(`Backup: Could not delete stale backup: ${error.toString()}`);
    }
  }
  prepareNewEmptyWindowBackup() {
    let emptyWorkspaceIdentifier = createEmptyWorkspaceIdentifier();
    while (this.emptyWindows.some((emptyWindow) => !!emptyWindow.backupFolder && this.backupPathComparer.isEqual(emptyWindow.backupFolder, emptyWorkspaceIdentifier.id))) {
      emptyWorkspaceIdentifier = createEmptyWorkspaceIdentifier();
    }
    return { backupFolder: emptyWorkspaceIdentifier.id };
  }
  async convertToEmptyWindowBackup(backupPath) {
    const newEmptyWindowBackupInfo = this.prepareNewEmptyWindowBackup();
    const newEmptyWindowBackupPath = join(this.backupHome, newEmptyWindowBackupInfo.backupFolder);
    try {
      await Promises.rename(
        backupPath,
        newEmptyWindowBackupPath,
        false
        /* no retry */
      );
    } catch (error) {
      this.logService.error(`Backup: Could not rename backup folder: ${error.toString()}`);
      return false;
    }
    this.emptyWindows.push(newEmptyWindowBackupInfo);
    return true;
  }
  async getDirtyWorkspaces() {
    const dirtyWorkspaces = [];
    for (const workspace of this.workspaces) {
      if (await this.hasBackups(workspace)) {
        dirtyWorkspaces.push(workspace);
      }
    }
    for (const folder of this.folders) {
      if (await this.hasBackups(folder)) {
        dirtyWorkspaces.push(folder);
      }
    }
    return dirtyWorkspaces;
  }
  hasBackups(backupLocation) {
    let backupPath;
    if (isEmptyWindowBackupInfo(backupLocation)) {
      backupPath = join(this.backupHome, backupLocation.backupFolder);
    } else if (isFolderBackupInfo(backupLocation)) {
      backupPath = join(this.backupHome, this.getFolderHash(backupLocation));
    } else {
      backupPath = join(this.backupHome, backupLocation.workspace.id);
    }
    return this.doHasBackups(backupPath);
  }
  async doHasBackups(backupPath) {
    try {
      const backupSchemas = await Promises.readdir(backupPath);
      for (const backupSchema of backupSchemas) {
        try {
          const backupSchemaChildren = await Promises.readdir(join(backupPath, backupSchema));
          if (backupSchemaChildren.length > 0) {
            return true;
          }
        } catch {
        }
      }
    } catch {
    }
    return false;
  }
  storeWorkspacesMetadata() {
    const serializedBackupWorkspaces = {
      workspaces: this.workspaces.map(({ workspace, remoteAuthority }) => {
        const serializedWorkspaceBackupInfo = {
          id: workspace.id,
          configURIPath: workspace.configPath.toString()
        };
        if (remoteAuthority) {
          serializedWorkspaceBackupInfo.remoteAuthority = remoteAuthority;
        }
        return serializedWorkspaceBackupInfo;
      }),
      folders: this.folders.map(({ folderUri, remoteAuthority }) => {
        const serializedFolderBackupInfo = {
          folderUri: folderUri.toString()
        };
        if (remoteAuthority) {
          serializedFolderBackupInfo.remoteAuthority = remoteAuthority;
        }
        return serializedFolderBackupInfo;
      }),
      emptyWindows: this.emptyWindows.map(({ backupFolder, remoteAuthority }) => {
        const serializedEmptyWindowBackupInfo = {
          backupFolder
        };
        if (remoteAuthority) {
          serializedEmptyWindowBackupInfo.remoteAuthority = remoteAuthority;
        }
        return serializedEmptyWindowBackupInfo;
      })
    };
    this.stateService.setItem(BackupMainService.backupWorkspacesMetadataStorageKey, serializedBackupWorkspaces);
  }
  getFolderHash(folder) {
    const folderUri = folder.folderUri;
    let key;
    if (folderUri.scheme === Schemas.file) {
      key = isLinux ? folderUri.fsPath : folderUri.fsPath.toLowerCase();
    } else {
      key = folderUri.toString().toLowerCase();
    }
    return createHash("md5").update(key).digest("hex");
  }
};
BackupMainService.backupWorkspacesMetadataStorageKey = "backupWorkspaces";
BackupMainService = __decorateClass([
  __decorateParam(0, IEnvironmentMainService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IStateService)
], BackupMainService);
export {
  BackupMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYmFja3VwXFxlbGVjdHJvbi1tYWluXFxiYWNrdXBNYWluU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNMaW51eCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFByb21pc2VzLCBSaW1SYWZNb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBJQmFja3VwTWFpblNlcnZpY2UgfSBmcm9tICcuL2JhY2t1cC5qcyc7XG5pbXBvcnQgeyBJU2VyaWFsaXplZEJhY2t1cFdvcmtzcGFjZXMsIElFbXB0eVdpbmRvd0JhY2t1cEluZm8sIGlzRW1wdHlXaW5kb3dCYWNrdXBJbmZvLCBkZXNlcmlhbGl6ZVdvcmtzcGFjZUluZm9zLCBkZXNlcmlhbGl6ZUZvbGRlckluZm9zLCBJU2VyaWFsaXplZFdvcmtzcGFjZUJhY2t1cEluZm8sIElTZXJpYWxpemVkRm9sZGVyQmFja3VwSW5mbywgSVNlcmlhbGl6ZWRFbXB0eVdpbmRvd0JhY2t1cEluZm8gfSBmcm9tICcuLi9ub2RlL2JhY2t1cC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdGF0ZS9ub2RlL3N0YXRlLmpzJztcbmltcG9ydCB7IEhvdEV4aXRDb25maWd1cmF0aW9uLCBJRmlsZXNDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUZvbGRlckJhY2t1cEluZm8sIGlzRm9sZGVyQmFja3VwSW5mbywgSVdvcmtzcGFjZUJhY2t1cEluZm8gfSBmcm9tICcuLi9jb21tb24vYmFja3VwLmpzJztcbmltcG9ydCB7IGlzV29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUVtcHR5V29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL3dvcmtzcGFjZXMvbm9kZS93b3Jrc3BhY2VzLmpzJztcblxuZXhwb3J0IGNsYXNzIEJhY2t1cE1haW5TZXJ2aWNlIGltcGxlbWVudHMgSUJhY2t1cE1haW5TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBiYWNrdXBXb3Jrc3BhY2VzTWV0YWRhdGFTdG9yYWdlS2V5ID0gJ2JhY2t1cFdvcmtzcGFjZXMnO1xuXG5cdHByb3RlY3RlZCBiYWNrdXBIb21lOiBzdHJpbmc7XG5cblx0cHJpdmF0ZSB3b3Jrc3BhY2VzOiBJV29ya3NwYWNlQmFja3VwSW5mb1tdID0gW107XG5cdHByaXZhdGUgZm9sZGVyczogSUZvbGRlckJhY2t1cEluZm9bXSA9IFtdO1xuXHRwcml2YXRlIGVtcHR5V2luZG93czogSUVtcHR5V2luZG93QmFja3VwSW5mb1tdID0gW107XG5cblx0Ly8gQ29tcGFyZXJzIGZvciBwYXRocyBhbmQgcmVzb3VyY2VzIHRoYXQgd2lsbFxuXHQvLyAtIGlnbm9yZSBwYXRoIGNhc2luZyBvbiBXaW5kb3dzL21hY09TXG5cdC8vIC0gcmVzcGVjdCBwYXRoIGNhc2luZyBvbiBMaW51eFxuXHRwcml2YXRlIHJlYWRvbmx5IGJhY2t1cFVyaUNvbXBhcmVyID0gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgYmFja3VwUGF0aENvbXBhcmVyID0geyBpc0VxdWFsOiAocGF0aEE6IHN0cmluZywgcGF0aEI6IHN0cmluZykgPT4gaXNFcXVhbChwYXRoQSwgcGF0aEIsICFpc0xpbnV4KSB9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRW52aXJvbm1lbnRNYWluU2VydmljZSBlbnZpcm9ubWVudE1haW5TZXJ2aWNlOiBJRW52aXJvbm1lbnRNYWluU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVN0YXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXRlU2VydmljZTogSVN0YXRlU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLmJhY2t1cEhvbWUgPSBlbnZpcm9ubWVudE1haW5TZXJ2aWNlLmJhY2t1cEhvbWU7XG5cdH1cblxuXHRhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gcmVhZCBiYWNrdXAgd29ya3NwYWNlc1xuXHRcdGNvbnN0IHNlcmlhbGl6ZWRCYWNrdXBXb3Jrc3BhY2VzID0gdGhpcy5zdGF0ZVNlcnZpY2UuZ2V0SXRlbTxJU2VyaWFsaXplZEJhY2t1cFdvcmtzcGFjZXM+KEJhY2t1cE1haW5TZXJ2aWNlLmJhY2t1cFdvcmtzcGFjZXNNZXRhZGF0YVN0b3JhZ2VLZXkpID8/IHsgd29ya3NwYWNlczogW10sIGZvbGRlcnM6IFtdLCBlbXB0eVdpbmRvd3M6IFtdIH07XG5cblx0XHQvLyB2YWxpZGF0ZSBlbXB0eSB3b3Jrc3BhY2VzIGJhY2t1cHMgZmlyc3Rcblx0XHR0aGlzLmVtcHR5V2luZG93cyA9IGF3YWl0IHRoaXMudmFsaWRhdGVFbXB0eVdvcmtzcGFjZXMoc2VyaWFsaXplZEJhY2t1cFdvcmtzcGFjZXMuZW1wdHlXaW5kb3dzKTtcblxuXHRcdC8vIHZhbGlkYXRlIHdvcmtzcGFjZSBiYWNrdXBzXG5cdFx0dGhpcy53b3Jrc3BhY2VzID0gYXdhaXQgdGhpcy52YWxpZGF0ZVdvcmtzcGFjZXMoZGVzZXJpYWxpemVXb3Jrc3BhY2VJbmZvcyhzZXJpYWxpemVkQmFja3VwV29ya3NwYWNlcykpO1xuXG5cdFx0Ly8gdmFsaWRhdGUgZm9sZGVyIGJhY2t1cHNcblx0XHR0aGlzLmZvbGRlcnMgPSBhd2FpdCB0aGlzLnZhbGlkYXRlRm9sZGVycyhkZXNlcmlhbGl6ZUZvbGRlckluZm9zKHNlcmlhbGl6ZWRCYWNrdXBXb3Jrc3BhY2VzKSk7XG5cblx0XHQvLyBzdG9yZSBtZXRhZGF0YSBpbiBjYXNlIHNvbWUgd29ya3NwYWNlcyBvciBmb2xkZXJzIGhhdmUgYmVlbiByZW1vdmVkXG5cdFx0dGhpcy5zdG9yZVdvcmtzcGFjZXNNZXRhZGF0YSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFdvcmtzcGFjZUJhY2t1cHMoKTogSVdvcmtzcGFjZUJhY2t1cEluZm9bXSB7XG5cdFx0aWYgKHRoaXMuaXNIb3RFeGl0T25FeGl0QW5kV2luZG93Q2xvc2UoKSkge1xuXHRcdFx0Ly8gT25seSBub24tZm9sZGVyIHdpbmRvd3MgYXJlIHJlc3RvcmVkIG9uIG1haW4gcHJvY2VzcyBsYXVuY2ggd2hlblxuXHRcdFx0Ly8gaG90IGV4aXQgaXMgY29uZmlndXJlZCBhcyBvbkV4aXRBbmRXaW5kb3dDbG9zZS5cblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VzLnNsaWNlKDApOyAvLyByZXR1cm4gYSBjb3B5XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0Rm9sZGVyQmFja3VwcygpOiBJRm9sZGVyQmFja3VwSW5mb1tdIHtcblx0XHRpZiAodGhpcy5pc0hvdEV4aXRPbkV4aXRBbmRXaW5kb3dDbG9zZSgpKSB7XG5cdFx0XHQvLyBPbmx5IG5vbi1mb2xkZXIgd2luZG93cyBhcmUgcmVzdG9yZWQgb24gbWFpbiBwcm9jZXNzIGxhdW5jaCB3aGVuXG5cdFx0XHQvLyBob3QgZXhpdCBpcyBjb25maWd1cmVkIGFzIG9uRXhpdEFuZFdpbmRvd0Nsb3NlLlxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmZvbGRlcnMuc2xpY2UoMCk7IC8vIHJldHVybiBhIGNvcHlcblx0fVxuXG5cdGlzSG90RXhpdEVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0SG90RXhpdENvbmZpZygpICE9PSBIb3RFeGl0Q29uZmlndXJhdGlvbi5PRkY7XG5cdH1cblxuXHRwcml2YXRlIGlzSG90RXhpdE9uRXhpdEFuZFdpbmRvd0Nsb3NlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmdldEhvdEV4aXRDb25maWcoKSA9PT0gSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRIb3RFeGl0Q29uZmlnKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPigpO1xuXG5cdFx0cmV0dXJuIGNvbmZpZz8uZmlsZXM/LmhvdEV4aXQgfHwgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVDtcblx0fVxuXG5cdGdldEVtcHR5V2luZG93QmFja3VwcygpOiBJRW1wdHlXaW5kb3dCYWNrdXBJbmZvW10ge1xuXHRcdHJldHVybiB0aGlzLmVtcHR5V2luZG93cy5zbGljZSgwKTsgLy8gcmV0dXJuIGEgY29weVxuXHR9XG5cblx0cmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAod29ya3NwYWNlSW5mbzogSVdvcmtzcGFjZUJhY2t1cEluZm8pOiBzdHJpbmc7XG5cdHJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHdvcmtzcGFjZUluZm86IElXb3Jrc3BhY2VCYWNrdXBJbmZvLCBtaWdyYXRlRnJvbTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+O1xuXHRyZWdpc3RlcldvcmtzcGFjZUJhY2t1cCh3b3Jrc3BhY2VJbmZvOiBJV29ya3NwYWNlQmFja3VwSW5mbywgbWlncmF0ZUZyb20/OiBzdHJpbmcpOiBzdHJpbmcgfCBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICghdGhpcy53b3Jrc3BhY2VzLnNvbWUod29ya3NwYWNlID0+IHdvcmtzcGFjZUluZm8ud29ya3NwYWNlLmlkID09PSB3b3Jrc3BhY2Uud29ya3NwYWNlLmlkKSkge1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VzLnB1c2god29ya3NwYWNlSW5mbyk7XG5cdFx0XHR0aGlzLnN0b3JlV29ya3NwYWNlc01ldGFkYXRhKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFja3VwUGF0aCA9IGpvaW4odGhpcy5iYWNrdXBIb21lLCB3b3Jrc3BhY2VJbmZvLndvcmtzcGFjZS5pZCk7XG5cblx0XHRpZiAobWlncmF0ZUZyb20pIHtcblx0XHRcdHJldHVybiB0aGlzLm1vdmVCYWNrdXBGb2xkZXIoYmFja3VwUGF0aCwgbWlncmF0ZUZyb20pLnRoZW4oKCkgPT4gYmFja3VwUGF0aCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGJhY2t1cFBhdGg7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1vdmVCYWNrdXBGb2xkZXIoYmFja3VwUGF0aDogc3RyaW5nLCBtb3ZlRnJvbVBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gVGFyZ2V0IGV4aXN0czogbWFrZSBzdXJlIHRvIGNvbnZlcnQgZXhpc3RpbmcgYmFja3VwcyB0byBlbXB0eSB3aW5kb3cgYmFja3Vwc1xuXHRcdGlmIChhd2FpdCBQcm9taXNlcy5leGlzdHMoYmFja3VwUGF0aCkpIHtcblx0XHRcdGF3YWl0IHRoaXMuY29udmVydFRvRW1wdHlXaW5kb3dCYWNrdXAoYmFja3VwUGF0aCk7XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiB3ZSBoYXZlIGRhdGEgdG8gbWlncmF0ZSBmcm9tLCBtb3ZlIGl0IG92ZXIgdG8gdGhlIHRhcmdldCBsb2NhdGlvblxuXHRcdGlmIChhd2FpdCBQcm9taXNlcy5leGlzdHMobW92ZUZyb21QYXRoKSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZXMucmVuYW1lKG1vdmVGcm9tUGF0aCwgYmFja3VwUGF0aCwgZmFsc2UgLyogbm8gcmV0cnkgKi8pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBCYWNrdXA6IENvdWxkIG5vdCBtb3ZlIGJhY2t1cCBmb2xkZXIgdG8gbmV3IGxvY2F0aW9uOiAke2Vycm9yLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmVnaXN0ZXJGb2xkZXJCYWNrdXAoZm9sZGVySW5mbzogSUZvbGRlckJhY2t1cEluZm8pOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5mb2xkZXJzLnNvbWUoZm9sZGVyID0+IHRoaXMuYmFja3VwVXJpQ29tcGFyZXIuaXNFcXVhbChmb2xkZXJJbmZvLmZvbGRlclVyaSwgZm9sZGVyLmZvbGRlclVyaSkpKSB7XG5cdFx0XHR0aGlzLmZvbGRlcnMucHVzaChmb2xkZXJJbmZvKTtcblx0XHRcdHRoaXMuc3RvcmVXb3Jrc3BhY2VzTWV0YWRhdGEoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gam9pbih0aGlzLmJhY2t1cEhvbWUsIHRoaXMuZ2V0Rm9sZGVySGFzaChmb2xkZXJJbmZvKSk7XG5cdH1cblxuXHRyZWdpc3RlckVtcHR5V2luZG93QmFja3VwKGVtcHR5V2luZG93SW5mbzogSUVtcHR5V2luZG93QmFja3VwSW5mbyk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLmVtcHR5V2luZG93cy5zb21lKGVtcHR5V2luZG93ID0+ICEhZW1wdHlXaW5kb3cuYmFja3VwRm9sZGVyICYmIHRoaXMuYmFja3VwUGF0aENvbXBhcmVyLmlzRXF1YWwoZW1wdHlXaW5kb3cuYmFja3VwRm9sZGVyLCBlbXB0eVdpbmRvd0luZm8uYmFja3VwRm9sZGVyKSkpIHtcblx0XHRcdHRoaXMuZW1wdHlXaW5kb3dzLnB1c2goZW1wdHlXaW5kb3dJbmZvKTtcblx0XHRcdHRoaXMuc3RvcmVXb3Jrc3BhY2VzTWV0YWRhdGEoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gam9pbih0aGlzLmJhY2t1cEhvbWUsIGVtcHR5V2luZG93SW5mby5iYWNrdXBGb2xkZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZVdvcmtzcGFjZXMocm9vdFdvcmtzcGFjZXM6IElXb3Jrc3BhY2VCYWNrdXBJbmZvW10pOiBQcm9taXNlPElXb3Jrc3BhY2VCYWNrdXBJbmZvW10+IHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkocm9vdFdvcmtzcGFjZXMpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VlbklkczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdFx0Y29uc3QgcmVzdWx0OiBJV29ya3NwYWNlQmFja3VwSW5mb1tdID0gW107XG5cblx0XHQvLyBWYWxpZGF0ZSBXb3Jrc3BhY2VzXG5cdFx0Zm9yIChjb25zdCB3b3Jrc3BhY2VJbmZvIG9mIHJvb3RXb3Jrc3BhY2VzKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSB3b3Jrc3BhY2VJbmZvLndvcmtzcGFjZTtcblx0XHRcdGlmICghaXNXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZSkpIHtcblx0XHRcdFx0cmV0dXJuIFtdOyAvLyB3cm9uZyBmb3JtYXQsIHNraXAgYWxsIGVudHJpZXNcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFzZWVuSWRzLmhhcyh3b3Jrc3BhY2UuaWQpKSB7XG5cdFx0XHRcdHNlZW5JZHMuYWRkKHdvcmtzcGFjZS5pZCk7XG5cblx0XHRcdFx0Y29uc3QgYmFja3VwUGF0aCA9IGpvaW4odGhpcy5iYWNrdXBIb21lLCB3b3Jrc3BhY2UuaWQpO1xuXHRcdFx0XHRjb25zdCBoYXNCYWNrdXBzID0gYXdhaXQgdGhpcy5kb0hhc0JhY2t1cHMoYmFja3VwUGF0aCk7XG5cblx0XHRcdFx0Ly8gSWYgdGhlIHdvcmtzcGFjZSBoYXMgbm8gYmFja3VwcywgaWdub3JlIGl0XG5cdFx0XHRcdGlmIChoYXNCYWNrdXBzKSB7XG5cdFx0XHRcdFx0aWYgKHdvcmtzcGFjZS5jb25maWdQYXRoLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlIHx8IGF3YWl0IFByb21pc2VzLmV4aXN0cyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh3b3Jrc3BhY2VJbmZvKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gSWYgdGhlIHdvcmtzcGFjZSBoYXMgYmFja3VwcywgYnV0IHRoZSB0YXJnZXQgd29ya3NwYWNlIGlzIG1pc3NpbmcsIGNvbnZlcnQgYmFja3VwcyB0byBlbXB0eSBvbmVzXG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbnZlcnRUb0VtcHR5V2luZG93QmFja3VwKGJhY2t1cFBhdGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRlbGV0ZVN0YWxlQmFja3VwKGJhY2t1cFBhdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdmFsaWRhdGVGb2xkZXJzKGZvbGRlcldvcmtzcGFjZXM6IElGb2xkZXJCYWNrdXBJbmZvW10pOiBQcm9taXNlPElGb2xkZXJCYWNrdXBJbmZvW10+IHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoZm9sZGVyV29ya3NwYWNlcykpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IElGb2xkZXJCYWNrdXBJbmZvW10gPSBbXTtcblx0XHRjb25zdCBzZWVuSWRzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblx0XHRmb3IgKGNvbnN0IGZvbGRlckluZm8gb2YgZm9sZGVyV29ya3NwYWNlcykge1xuXHRcdFx0Y29uc3QgZm9sZGVyVVJJID0gZm9sZGVySW5mby5mb2xkZXJVcmk7XG5cdFx0XHRjb25zdCBrZXkgPSB0aGlzLmJhY2t1cFVyaUNvbXBhcmVyLmdldENvbXBhcmlzb25LZXkoZm9sZGVyVVJJKTtcblx0XHRcdGlmICghc2Vlbklkcy5oYXMoa2V5KSkge1xuXHRcdFx0XHRzZWVuSWRzLmFkZChrZXkpO1xuXG5cdFx0XHRcdGNvbnN0IGJhY2t1cFBhdGggPSBqb2luKHRoaXMuYmFja3VwSG9tZSwgdGhpcy5nZXRGb2xkZXJIYXNoKGZvbGRlckluZm8pKTtcblx0XHRcdFx0Y29uc3QgaGFzQmFja3VwcyA9IGF3YWl0IHRoaXMuZG9IYXNCYWNrdXBzKGJhY2t1cFBhdGgpO1xuXG5cdFx0XHRcdC8vIElmIHRoZSBmb2xkZXIgaGFzIG5vIGJhY2t1cHMsIGlnbm9yZSBpdFxuXHRcdFx0XHRpZiAoaGFzQmFja3Vwcykge1xuXHRcdFx0XHRcdGlmIChmb2xkZXJVUkkuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUgfHwgYXdhaXQgUHJvbWlzZXMuZXhpc3RzKGZvbGRlclVSSS5mc1BhdGgpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChmb2xkZXJJbmZvKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gSWYgdGhlIGZvbGRlciBoYXMgYmFja3VwcywgYnV0IHRoZSB0YXJnZXQgd29ya3NwYWNlIGlzIG1pc3NpbmcsIGNvbnZlcnQgYmFja3VwcyB0byBlbXB0eSBvbmVzXG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbnZlcnRUb0VtcHR5V2luZG93QmFja3VwKGJhY2t1cFBhdGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRlbGV0ZVN0YWxlQmFja3VwKGJhY2t1cFBhdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdmFsaWRhdGVFbXB0eVdvcmtzcGFjZXMoZW1wdHlXb3Jrc3BhY2VzOiBJRW1wdHlXaW5kb3dCYWNrdXBJbmZvW10pOiBQcm9taXNlPElFbXB0eVdpbmRvd0JhY2t1cEluZm9bXT4ge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShlbXB0eVdvcmtzcGFjZXMpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBJRW1wdHlXaW5kb3dCYWNrdXBJbmZvW10gPSBbXTtcblx0XHRjb25zdCBzZWVuSWRzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblxuXHRcdC8vIFZhbGlkYXRlIEVtcHR5IFdpbmRvd3Ncblx0XHRmb3IgKGNvbnN0IGJhY2t1cEluZm8gb2YgZW1wdHlXb3Jrc3BhY2VzKSB7XG5cdFx0XHRjb25zdCBiYWNrdXBGb2xkZXIgPSBiYWNrdXBJbmZvLmJhY2t1cEZvbGRlcjtcblx0XHRcdGlmICh0eXBlb2YgYmFja3VwRm9sZGVyICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdGlmICghc2Vlbklkcy5oYXMoYmFja3VwRm9sZGVyKSkge1xuXHRcdFx0XHRzZWVuSWRzLmFkZChiYWNrdXBGb2xkZXIpO1xuXG5cdFx0XHRcdGNvbnN0IGJhY2t1cFBhdGggPSBqb2luKHRoaXMuYmFja3VwSG9tZSwgYmFja3VwRm9sZGVyKTtcblx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuZG9IYXNCYWNrdXBzKGJhY2t1cFBhdGgpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goYmFja3VwSW5mbyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kZWxldGVTdGFsZUJhY2t1cChiYWNrdXBQYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRlbGV0ZVN0YWxlQmFja3VwKGJhY2t1cFBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy5ybShiYWNrdXBQYXRoLCBSaW1SYWZNb2RlLk1PVkUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEJhY2t1cDogQ291bGQgbm90IGRlbGV0ZSBzdGFsZSBiYWNrdXA6ICR7ZXJyb3IudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHByZXBhcmVOZXdFbXB0eVdpbmRvd0JhY2t1cCgpOiBJRW1wdHlXaW5kb3dCYWNrdXBJbmZvIHtcblxuXHRcdC8vIFdlIGFyZSBhc2tlZCB0byBwcmVwYXJlIGEgbmV3IGVtcHR5IHdpbmRvdyBiYWNrdXAgZm9sZGVyLlxuXHRcdC8vIEVtcHR5IHdpbmRvd3MgYmFja3VwIGZvbGRlcnMgYXJlIGRlcml2ZWQgZnJvbSBhIHdvcmtzcGFjZVxuXHRcdC8vIGlkZW50aWZpZXIsIHNvIHdlIGdlbmVyYXRlIGEgbmV3IGVtcHR5IHdvcmtzcGFjZSBpZGVudGlmaWVyXG5cdFx0Ly8gdW50aWwgd2UgZm91bmQgYSB1bmlxdWUgb25lLlxuXG5cdFx0bGV0IGVtcHR5V29ya3NwYWNlSWRlbnRpZmllciA9IGNyZWF0ZUVtcHR5V29ya3NwYWNlSWRlbnRpZmllcigpO1xuXHRcdHdoaWxlICh0aGlzLmVtcHR5V2luZG93cy5zb21lKGVtcHR5V2luZG93ID0+ICEhZW1wdHlXaW5kb3cuYmFja3VwRm9sZGVyICYmIHRoaXMuYmFja3VwUGF0aENvbXBhcmVyLmlzRXF1YWwoZW1wdHlXaW5kb3cuYmFja3VwRm9sZGVyLCBlbXB0eVdvcmtzcGFjZUlkZW50aWZpZXIuaWQpKSkge1xuXHRcdFx0ZW1wdHlXb3Jrc3BhY2VJZGVudGlmaWVyID0gY3JlYXRlRW1wdHlXb3Jrc3BhY2VJZGVudGlmaWVyKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgYmFja3VwRm9sZGVyOiBlbXB0eVdvcmtzcGFjZUlkZW50aWZpZXIuaWQgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29udmVydFRvRW1wdHlXaW5kb3dCYWNrdXAoYmFja3VwUGF0aDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgbmV3RW1wdHlXaW5kb3dCYWNrdXBJbmZvID0gdGhpcy5wcmVwYXJlTmV3RW1wdHlXaW5kb3dCYWNrdXAoKTtcblxuXHRcdC8vIFJlbmFtZSBiYWNrdXBQYXRoIHRvIG5ldyBlbXB0eSB3aW5kb3cgYmFja3VwIHBhdGhcblx0XHRjb25zdCBuZXdFbXB0eVdpbmRvd0JhY2t1cFBhdGggPSBqb2luKHRoaXMuYmFja3VwSG9tZSwgbmV3RW1wdHlXaW5kb3dCYWNrdXBJbmZvLmJhY2t1cEZvbGRlcik7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZShiYWNrdXBQYXRoLCBuZXdFbXB0eVdpbmRvd0JhY2t1cFBhdGgsIGZhbHNlIC8qIG5vIHJldHJ5ICovKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBCYWNrdXA6IENvdWxkIG5vdCByZW5hbWUgYmFja3VwIGZvbGRlcjogJHtlcnJvci50b1N0cmluZygpfWApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLmVtcHR5V2luZG93cy5wdXNoKG5ld0VtcHR5V2luZG93QmFja3VwSW5mbyk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIGdldERpcnR5V29ya3NwYWNlcygpOiBQcm9taXNlPEFycmF5PElXb3Jrc3BhY2VCYWNrdXBJbmZvIHwgSUZvbGRlckJhY2t1cEluZm8+PiB7XG5cdFx0Y29uc3QgZGlydHlXb3Jrc3BhY2VzOiBBcnJheTxJV29ya3NwYWNlQmFja3VwSW5mbyB8IElGb2xkZXJCYWNrdXBJbmZvPiA9IFtdO1xuXG5cdFx0Ly8gV29ya3NwYWNlcyB3aXRoIGJhY2t1cHNcblx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZSBvZiB0aGlzLndvcmtzcGFjZXMpIHtcblx0XHRcdGlmICgoYXdhaXQgdGhpcy5oYXNCYWNrdXBzKHdvcmtzcGFjZSkpKSB7XG5cdFx0XHRcdGRpcnR5V29ya3NwYWNlcy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRm9sZGVycyB3aXRoIGJhY2t1cHNcblx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiB0aGlzLmZvbGRlcnMpIHtcblx0XHRcdGlmICgoYXdhaXQgdGhpcy5oYXNCYWNrdXBzKGZvbGRlcikpKSB7XG5cdFx0XHRcdGRpcnR5V29ya3NwYWNlcy5wdXNoKGZvbGRlcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpcnR5V29ya3NwYWNlcztcblx0fVxuXG5cdHByaXZhdGUgaGFzQmFja3VwcyhiYWNrdXBMb2NhdGlvbjogSVdvcmtzcGFjZUJhY2t1cEluZm8gfCBJRW1wdHlXaW5kb3dCYWNrdXBJbmZvIHwgSUZvbGRlckJhY2t1cEluZm8pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgYmFja3VwUGF0aDogc3RyaW5nO1xuXG5cdFx0Ly8gRW1wdHlcblx0XHRpZiAoaXNFbXB0eVdpbmRvd0JhY2t1cEluZm8oYmFja3VwTG9jYXRpb24pKSB7XG5cdFx0XHRiYWNrdXBQYXRoID0gam9pbih0aGlzLmJhY2t1cEhvbWUsIGJhY2t1cExvY2F0aW9uLmJhY2t1cEZvbGRlcik7XG5cdFx0fVxuXG5cdFx0Ly8gRm9sZGVyXG5cdFx0ZWxzZSBpZiAoaXNGb2xkZXJCYWNrdXBJbmZvKGJhY2t1cExvY2F0aW9uKSkge1xuXHRcdFx0YmFja3VwUGF0aCA9IGpvaW4odGhpcy5iYWNrdXBIb21lLCB0aGlzLmdldEZvbGRlckhhc2goYmFja3VwTG9jYXRpb24pKTtcblx0XHR9XG5cblx0XHQvLyBXb3Jrc3BhY2Vcblx0XHRlbHNlIHtcblx0XHRcdGJhY2t1cFBhdGggPSBqb2luKHRoaXMuYmFja3VwSG9tZSwgYmFja3VwTG9jYXRpb24ud29ya3NwYWNlLmlkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kb0hhc0JhY2t1cHMoYmFja3VwUGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvSGFzQmFja3VwcyhiYWNrdXBQYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYmFja3VwU2NoZW1hcyA9IGF3YWl0IFByb21pc2VzLnJlYWRkaXIoYmFja3VwUGF0aCk7XG5cblx0XHRcdGZvciAoY29uc3QgYmFja3VwU2NoZW1hIG9mIGJhY2t1cFNjaGVtYXMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBiYWNrdXBTY2hlbWFDaGlsZHJlbiA9IGF3YWl0IFByb21pc2VzLnJlYWRkaXIoam9pbihiYWNrdXBQYXRoLCBiYWNrdXBTY2hlbWEpKTtcblx0XHRcdFx0XHRpZiAoYmFja3VwU2NoZW1hQ2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBpbnZhbGlkIGZvbGRlclxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBiYWNrdXAgcGF0aCBkb2VzIG5vdCBleGlzdFxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cblx0cHJpdmF0ZSBzdG9yZVdvcmtzcGFjZXNNZXRhZGF0YSgpOiB2b2lkIHtcblx0XHRjb25zdCBzZXJpYWxpemVkQmFja3VwV29ya3NwYWNlczogSVNlcmlhbGl6ZWRCYWNrdXBXb3Jrc3BhY2VzID0ge1xuXHRcdFx0d29ya3NwYWNlczogdGhpcy53b3Jrc3BhY2VzLm1hcCgoeyB3b3Jrc3BhY2UsIHJlbW90ZUF1dGhvcml0eSB9KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlcmlhbGl6ZWRXb3Jrc3BhY2VCYWNrdXBJbmZvOiBJU2VyaWFsaXplZFdvcmtzcGFjZUJhY2t1cEluZm8gPSB7XG5cdFx0XHRcdFx0aWQ6IHdvcmtzcGFjZS5pZCxcblx0XHRcdFx0XHRjb25maWdVUklQYXRoOiB3b3Jrc3BhY2UuY29uZmlnUGF0aC50b1N0cmluZygpXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0aWYgKHJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdHNlcmlhbGl6ZWRXb3Jrc3BhY2VCYWNrdXBJbmZvLnJlbW90ZUF1dGhvcml0eSA9IHJlbW90ZUF1dGhvcml0eTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBzZXJpYWxpemVkV29ya3NwYWNlQmFja3VwSW5mbztcblx0XHRcdH0pLFxuXHRcdFx0Zm9sZGVyczogdGhpcy5mb2xkZXJzLm1hcCgoeyBmb2xkZXJVcmksIHJlbW90ZUF1dGhvcml0eSB9KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlcmlhbGl6ZWRGb2xkZXJCYWNrdXBJbmZvOiBJU2VyaWFsaXplZEZvbGRlckJhY2t1cEluZm8gPVxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Zm9sZGVyVXJpOiBmb2xkZXJVcmkudG9TdHJpbmcoKVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGlmIChyZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0XHRzZXJpYWxpemVkRm9sZGVyQmFja3VwSW5mby5yZW1vdGVBdXRob3JpdHkgPSByZW1vdGVBdXRob3JpdHk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gc2VyaWFsaXplZEZvbGRlckJhY2t1cEluZm87XG5cdFx0XHR9KSxcblx0XHRcdGVtcHR5V2luZG93czogdGhpcy5lbXB0eVdpbmRvd3MubWFwKCh7IGJhY2t1cEZvbGRlciwgcmVtb3RlQXV0aG9yaXR5IH0pID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VyaWFsaXplZEVtcHR5V2luZG93QmFja3VwSW5mbzogSVNlcmlhbGl6ZWRFbXB0eVdpbmRvd0JhY2t1cEluZm8gPSB7XG5cdFx0XHRcdFx0YmFja3VwRm9sZGVyXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0aWYgKHJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdHNlcmlhbGl6ZWRFbXB0eVdpbmRvd0JhY2t1cEluZm8ucmVtb3RlQXV0aG9yaXR5ID0gcmVtb3RlQXV0aG9yaXR5O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHNlcmlhbGl6ZWRFbXB0eVdpbmRvd0JhY2t1cEluZm87XG5cdFx0XHR9KVxuXHRcdH07XG5cblx0XHR0aGlzLnN0YXRlU2VydmljZS5zZXRJdGVtKEJhY2t1cE1haW5TZXJ2aWNlLmJhY2t1cFdvcmtzcGFjZXNNZXRhZGF0YVN0b3JhZ2VLZXksIHNlcmlhbGl6ZWRCYWNrdXBXb3Jrc3BhY2VzKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRGb2xkZXJIYXNoKGZvbGRlcjogSUZvbGRlckJhY2t1cEluZm8pOiBzdHJpbmcge1xuXHRcdGNvbnN0IGZvbGRlclVyaSA9IGZvbGRlci5mb2xkZXJVcmk7XG5cblx0XHRsZXQga2V5OiBzdHJpbmc7XG5cdFx0aWYgKGZvbGRlclVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0a2V5ID0gaXNMaW51eCA/IGZvbGRlclVyaS5mc1BhdGggOiBmb2xkZXJVcmkuZnNQYXRoLnRvTG93ZXJDYXNlKCk7IC8vIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5LCB1c2UgdGhlIGZzcGF0aCBhcyBrZXlcblx0XHR9IGVsc2Uge1xuXHRcdFx0a2V5ID0gZm9sZGVyVXJpLnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3JlYXRlSGFzaCgnbWQ1JykudXBkYXRlKGtleSkuZGlnZXN0KCdoZXgnKTsgLy8gQ29kZVFMIFtTTTA0NTE0XSBVc2luZyBNRDUgdG8gY29udmVydCBhIGZpbGUgcGF0aCB0byBhIGZpeGVkIGxlbmd0aFxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLFVBQVUsa0JBQWtCO0FBRXJDLFNBQThELHlCQUF5QiwyQkFBMkIsOEJBQTZIO0FBQy9PLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNEJBQWlEO0FBQzFELFNBQVMsbUJBQW1CO0FBQzVCLFNBQTRCLDBCQUFnRDtBQUM1RSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNDQUFz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QUFBQSxNQUNEO0FBQUEsSUFDRCxRQUFRO0FBQUEsSUFFUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFHUSwwQkFBZ0M7QUFDdkMsVUFBTSw2QkFBMEQ7QUFBQSxNQUMvRCxZQUFZLEtBQUssV0FBVyxJQUFJLENBQUMsRUFBRSxXQUFXLGdCQUFnQixNQUFNO0FBQ25FLGNBQU0sZ0NBQWdFO0FBQUEsVUFDckUsSUFBSSxVQUFVO0FBQUEsVUFDZCxlQUFlLFVBQVUsV0FBVyxTQUFTO0FBQUEsUUFDOUM7QUFFQSxZQUFJLGlCQUFpQjtBQUNwQix3Q0FBOEIsa0JBQWtCO0FBQUEsUUFDakQ7QUFFQSxlQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsTUFDRCxTQUFTLEtBQUssUUFBUSxJQUFJLENBQUMsRUFBRSxXQUFXLGdCQUFnQixNQUFNO0FBQzdELGNBQU0sNkJBQ047QUFBQSxVQUNDLFdBQVcsVUFBVSxTQUFTO0FBQUEsUUFDL0I7QUFFQSxZQUFJLGlCQUFpQjtBQUNwQixxQ0FBMkIsa0JBQWtCO0FBQUEsUUFDOUM7QUFFQSxlQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsTUFDRCxjQUFjLEtBQUssYUFBYSxJQUFJLENBQUMsRUFBRSxjQUFjLGdCQUFnQixNQUFNO0FBQzFFLGNBQU0sa0NBQW9FO0FBQUEsVUFDekU7QUFBQSxRQUNEO0FBRUEsWUFBSSxpQkFBaUI7QUFDcEIsMENBQWdDLGtCQUFrQjtBQUFBLFFBQ25EO0FBRUEsZUFBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLElBQ0Y7QUFFQSxTQUFLLGFBQWEsUUFBUSxrQkFBa0Isb0NBQW9DLDBCQUEwQjtBQUFBLEVBQzNHO0FBQUEsRUFFVSxjQUFjLFFBQW1DO0FBQzFELFVBQU0sWUFBWSxPQUFPO0FBRXpCLFFBQUk7QUFDSixRQUFJLFVBQVUsV0FBVyxRQUFRLE1BQU07QUFDdEMsWUFBTSxVQUFVLFVBQVUsU0FBUyxVQUFVLE9BQU8sWUFBWTtBQUFBLElBQ2pFLE9BQU87QUFDTixZQUFNLFVBQVUsU0FBUyxFQUFFLFlBQVk7QUFBQSxJQUN4QztBQUVBLFdBQU8sV0FBVyxLQUFLLEVBQUUsT0FBTyxHQUFHLEVBQUUsT0FBTyxLQUFLO0FBQUEsRUFDbEQ7QUFDRDtBQXhZYSxrQkFJWSxxQ0FBcUM7QUFKakQsb0JBQU47QUFBQSxFQW1CSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdEJVOyIsCiAgIm5hbWVzIjogW10KfQo=
