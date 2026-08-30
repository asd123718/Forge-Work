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
import { localize } from "../../../../nls.js";
import { hasWorkspaceFileExtension, isSavedWorkspace, isUntitledWorkspace, isWorkspaceIdentifier, IWorkspaceContextService, toWorkspaceIdentifier, WorkbenchState, WORKSPACE_EXTENSION, WORKSPACE_FILTER } from "../../../../platform/workspace/common/workspace.js";
import { IJSONEditingService, JSONEditingErrorCode } from "../../configuration/common/jsonEditing.js";
import { IWorkspacesService, rewriteWorkspaceFileForNewLocation } from "../../../../platform/workspaces/common/workspaces.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { distinct } from "../../../../base/common/arrays.js";
import { basename, isEqual, isEqualAuthority, joinPath, removeTrailingPathSeparator } from "../../../../base/common/resources.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IFileDialogService, IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ITextFileService } from "../../textfile/common/textfiles.js";
import { IHostService } from "../../host/browser/host.js";
import { Schemas } from "../../../../base/common/network.js";
import { SaveReason } from "../../../common/editor.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IWorkbenchConfigurationService } from "../../configuration/common/configuration.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Promises } from "../../../../base/common/async.js";
class DidEnterWorkspaceEvent {
  constructor(oldWorkspace, newWorkspace) {
    this.oldWorkspace = oldWorkspace;
    this.newWorkspace = newWorkspace;
    this.promises = [];
  }
  join(promise) {
    this.promises.push(promise);
  }
  async wait() {
    await Promises.settled(this.promises);
  }
}
let AbstractWorkspaceEditingService = class extends Disposable {
  constructor(jsonEditingService, contextService, configurationService, notificationService, commandService, fileService, textFileService, workspacesService, environmentService, fileDialogService, dialogService, hostService, uriIdentityService, workspaceTrustManagementService, userDataProfilesService, userDataProfileService, logService) {
    super();
    this.jsonEditingService = jsonEditingService;
    this.contextService = contextService;
    this.configurationService = configurationService;
    this.notificationService = notificationService;
    this.commandService = commandService;
    this.fileService = fileService;
    this.textFileService = textFileService;
    this.workspacesService = workspacesService;
    this.environmentService = environmentService;
    this.fileDialogService = fileDialogService;
    this.dialogService = dialogService;
    this.hostService = hostService;
    this.uriIdentityService = uriIdentityService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.userDataProfilesService = userDataProfilesService;
    this.userDataProfileService = userDataProfileService;
    this.logService = logService;
    this._onDidEnterWorkspace = this._register(new Emitter());
    this.onDidEnterWorkspace = this._onDidEnterWorkspace.event;
  }
  async pickNewWorkspacePath() {
    const availableFileSystems = [Schemas.file];
    if (this.environmentService.remoteAuthority) {
      availableFileSystems.unshift(Schemas.vscodeRemote);
    }
    let workspacePath = await this.fileDialogService.showSaveDialog({
      saveLabel: localize("save", "Save"),
      title: localize("saveWorkspace", "Save Workspace"),
      filters: WORKSPACE_FILTER,
      defaultUri: joinPath(await this.fileDialogService.defaultWorkspacePath(), this.getNewWorkspaceName()),
      availableFileSystems
    });
    if (!workspacePath) {
      return;
    }
    if (!hasWorkspaceFileExtension(workspacePath)) {
      workspacePath = workspacePath.with({ path: `${workspacePath.path}.${WORKSPACE_EXTENSION}` });
    }
    return workspacePath;
  }
  getNewWorkspaceName() {
    const configPathURI = this.getCurrentWorkspaceIdentifier()?.configPath;
    if (configPathURI && isSavedWorkspace(configPathURI, this.environmentService)) {
      return basename(configPathURI);
    }
    const folder = this.contextService.getWorkspace().folders.at(0);
    if (folder) {
      return `${basename(folder.uri)}.${WORKSPACE_EXTENSION}`;
    }
    return `workspace.${WORKSPACE_EXTENSION}`;
  }
  async updateFolders(index, deleteCount, foldersToAddCandidates, donotNotifyError) {
    const folders = this.contextService.getWorkspace().folders;
    let foldersToDelete = [];
    if (typeof deleteCount === "number") {
      foldersToDelete = folders.slice(index, index + deleteCount).map((folder) => folder.uri);
    }
    let foldersToAdd = [];
    if (Array.isArray(foldersToAddCandidates)) {
      foldersToAdd = foldersToAddCandidates.map((folderToAdd) => ({ uri: removeTrailingPathSeparator(folderToAdd.uri), name: folderToAdd.name }));
    }
    const wantsToDelete = foldersToDelete.length > 0;
    const wantsToAdd = foldersToAdd.length > 0;
    if (!wantsToAdd && !wantsToDelete) {
      return;
    }
    if (wantsToAdd && !wantsToDelete) {
      return this.doAddFolders(foldersToAdd, index, donotNotifyError);
    }
    if (wantsToDelete && !wantsToAdd) {
      return this.removeFolders(foldersToDelete);
    } else {
      if (this.includesSingleFolderWorkspace(foldersToDelete)) {
        return this.createAndEnterWorkspace(foldersToAdd);
      }
      if (this.contextService.getWorkbenchState() !== WorkbenchState.WORKSPACE) {
        return this.doAddFolders(foldersToAdd, index, donotNotifyError);
      }
      return this.doUpdateFolders(foldersToAdd, foldersToDelete, index, donotNotifyError);
    }
  }
  async doUpdateFolders(foldersToAdd, foldersToDelete, index, donotNotifyError = false) {
    try {
      await this.contextService.updateFolders(foldersToAdd, foldersToDelete, index);
    } catch (error) {
      if (donotNotifyError) {
        throw error;
      }
      this.handleWorkspaceConfigurationEditingError(error);
    }
  }
  addFolders(foldersToAddCandidates, donotNotifyError = false) {
    const foldersToAdd = foldersToAddCandidates.map((folderToAdd) => ({ uri: removeTrailingPathSeparator(folderToAdd.uri), name: folderToAdd.name }));
    return this.doAddFolders(foldersToAdd, void 0, donotNotifyError);
  }
  async doAddFolders(foldersToAdd, index, donotNotifyError = false) {
    const state = this.contextService.getWorkbenchState();
    const remoteAuthority = this.environmentService.remoteAuthority;
    if (remoteAuthority) {
      foldersToAdd = foldersToAdd.filter((folder) => folder.uri.scheme !== Schemas.file && (folder.uri.scheme !== Schemas.vscodeRemote || isEqualAuthority(folder.uri.authority, remoteAuthority)));
    }
    if (state !== WorkbenchState.WORKSPACE) {
      let newWorkspaceFolders = this.contextService.getWorkspace().folders.map((folder) => ({ uri: folder.uri }));
      newWorkspaceFolders.splice(typeof index === "number" ? index : newWorkspaceFolders.length, 0, ...foldersToAdd);
      newWorkspaceFolders = distinct(newWorkspaceFolders, (folder) => this.uriIdentityService.extUri.getComparisonKey(folder.uri));
      if (state === WorkbenchState.EMPTY && newWorkspaceFolders.length === 0 || state === WorkbenchState.FOLDER && newWorkspaceFolders.length === 1) {
        return;
      }
      return this.createAndEnterWorkspace(newWorkspaceFolders);
    }
    try {
      await this.contextService.addFolders(foldersToAdd, index);
    } catch (error) {
      if (donotNotifyError) {
        throw error;
      }
      this.handleWorkspaceConfigurationEditingError(error);
    }
  }
  async removeFolders(foldersToRemove, donotNotifyError = false) {
    if (this.includesSingleFolderWorkspace(foldersToRemove)) {
      return this.createAndEnterWorkspace([]);
    }
    try {
      await this.contextService.removeFolders(foldersToRemove);
    } catch (error) {
      if (donotNotifyError) {
        throw error;
      }
      this.handleWorkspaceConfigurationEditingError(error);
    }
  }
  includesSingleFolderWorkspace(folders) {
    if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
      const workspaceFolder = this.contextService.getWorkspace().folders[0];
      return folders.some((folder) => this.uriIdentityService.extUri.isEqual(folder, workspaceFolder.uri));
    }
    return false;
  }
  async createAndEnterWorkspace(folders, path) {
    if (path && !await this.isValidTargetWorkspacePath(path)) {
      return;
    }
    const remoteAuthority = this.environmentService.remoteAuthority;
    const untitledWorkspace = await this.workspacesService.createUntitledWorkspace(folders, remoteAuthority);
    if (path) {
      try {
        await this.saveWorkspaceAs(untitledWorkspace, path);
      } finally {
        await this.workspacesService.deleteUntitledWorkspace(untitledWorkspace);
      }
    } else {
      path = untitledWorkspace.configPath;
      if (!this.userDataProfileService.currentProfile.isDefault) {
        await this.userDataProfilesService.setProfileForWorkspace(untitledWorkspace, this.userDataProfileService.currentProfile);
      }
    }
    return this.enterWorkspace(path);
  }
  async saveAndEnterWorkspace(workspaceUri) {
    const workspaceIdentifier = this.getCurrentWorkspaceIdentifier();
    if (!workspaceIdentifier) {
      return;
    }
    if (isEqual(workspaceIdentifier.configPath, workspaceUri)) {
      return this.saveWorkspace(workspaceIdentifier);
    }
    if (!await this.isValidTargetWorkspacePath(workspaceUri)) {
      return;
    }
    await this.saveWorkspaceAs(workspaceIdentifier, workspaceUri);
    return this.enterWorkspace(workspaceUri);
  }
  async isValidTargetWorkspacePath(workspaceUri) {
    return true;
  }
  async saveWorkspaceAs(workspace, targetConfigPathURI) {
    const configPathURI = workspace.configPath;
    const isNotUntitledWorkspace = !isUntitledWorkspace(targetConfigPathURI, this.environmentService);
    if (isNotUntitledWorkspace && !this.userDataProfileService.currentProfile.isDefault) {
      const newWorkspace = await this.workspacesService.getWorkspaceIdentifier(targetConfigPathURI);
      await this.userDataProfilesService.setProfileForWorkspace(newWorkspace, this.userDataProfileService.currentProfile);
    }
    if (this.uriIdentityService.extUri.isEqual(configPathURI, targetConfigPathURI)) {
      return;
    }
    const isFromUntitledWorkspace = isUntitledWorkspace(configPathURI, this.environmentService);
    const raw = await this.fileService.readFile(configPathURI);
    const newRawWorkspaceContents = rewriteWorkspaceFileForNewLocation(raw.value.toString(), configPathURI, isFromUntitledWorkspace, targetConfigPathURI, this.uriIdentityService.extUri);
    await this.textFileService.create([{ resource: targetConfigPathURI, value: newRawWorkspaceContents, options: { overwrite: true } }]);
    await this.trustWorkspaceConfiguration(targetConfigPathURI);
  }
  async saveWorkspace(workspace) {
    const configPathURI = workspace.configPath;
    const existingModel = this.textFileService.files.get(configPathURI);
    if (existingModel) {
      await existingModel.save({ force: true, reason: SaveReason.EXPLICIT });
      return;
    }
    const workspaceFileExists = await this.fileService.exists(configPathURI);
    if (workspaceFileExists) {
      return;
    }
    const newWorkspace = { folders: [] };
    const newRawWorkspaceContents = rewriteWorkspaceFileForNewLocation(JSON.stringify(newWorkspace, null, "	"), configPathURI, false, configPathURI, this.uriIdentityService.extUri);
    await this.textFileService.create([{ resource: configPathURI, value: newRawWorkspaceContents }]);
  }
  handleWorkspaceConfigurationEditingError(error) {
    switch (error.code) {
      case JSONEditingErrorCode.ERROR_INVALID_FILE:
        this.onInvalidWorkspaceConfigurationFileError();
        break;
      default:
        this.notificationService.error(error.message);
    }
  }
  onInvalidWorkspaceConfigurationFileError() {
    const message = localize("errorInvalidTaskConfiguration", "Unable to write into workspace configuration file. Please open the file to correct errors/warnings in it and try again.");
    this.askToOpenWorkspaceConfigurationFile(message);
  }
  askToOpenWorkspaceConfigurationFile(message) {
    this.notificationService.prompt(
      Severity.Error,
      message,
      [{
        label: localize("openWorkspaceConfigurationFile", "Open Workspace Configuration"),
        run: () => this.commandService.executeCommand("workbench.action.openWorkspaceConfigFile")
      }]
    );
  }
  async fireDidEnterWorkspace(oldWorkspace, newWorkspace) {
    const event = new DidEnterWorkspaceEvent(oldWorkspace, newWorkspace);
    this._onDidEnterWorkspace.fire(event);
    try {
      await event.wait();
    } catch (error) {
      this.logService.error("Error while waiting for participants of onDidEnterWorkspace to join:", error);
    }
  }
  async doEnterWorkspace(workspaceUri) {
    if (this.environmentService.extensionTestsLocationURI) {
      throw new Error("Entering a new workspace is not possible in tests.");
    }
    const workspace = await this.workspacesService.getWorkspaceIdentifier(workspaceUri);
    if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
      await this.migrateWorkspaceSettings(workspace);
    }
    await this.configurationService.initialize(workspace);
    return this.workspacesService.enterWorkspace(workspaceUri);
  }
  migrateWorkspaceSettings(toWorkspace) {
    return this.doCopyWorkspaceSettings(toWorkspace, (setting) => setting.scope === ConfigurationScope.WINDOW);
  }
  copyWorkspaceSettings(toWorkspace) {
    return this.doCopyWorkspaceSettings(toWorkspace);
  }
  doCopyWorkspaceSettings(toWorkspace, filter) {
    const configurationProperties = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
    const targetWorkspaceConfiguration = {};
    for (const key of this.configurationService.keys().workspace) {
      if (configurationProperties[key]) {
        if (filter && !filter(configurationProperties[key])) {
          continue;
        }
        targetWorkspaceConfiguration[key] = this.configurationService.inspect(key).workspaceValue;
      }
    }
    return this.jsonEditingService.write(toWorkspace.configPath, [{ path: ["settings"], value: targetWorkspaceConfiguration }], true);
  }
  async trustWorkspaceConfiguration(configPathURI) {
    if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      await this.workspaceTrustManagementService.setUrisTrust([configPathURI], true);
    }
  }
  getCurrentWorkspaceIdentifier() {
    const identifier = toWorkspaceIdentifier(this.contextService.getWorkspace());
    if (isWorkspaceIdentifier(identifier)) {
      return identifier;
    }
    return void 0;
  }
};
AbstractWorkspaceEditingService = __decorateClass([
  __decorateParam(0, IJSONEditingService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IWorkbenchConfigurationService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IFileService),
  __decorateParam(6, ITextFileService),
  __decorateParam(7, IWorkspacesService),
  __decorateParam(8, IWorkbenchEnvironmentService),
  __decorateParam(9, IFileDialogService),
  __decorateParam(10, IDialogService),
  __decorateParam(11, IHostService),
  __decorateParam(12, IUriIdentityService),
  __decorateParam(13, IWorkspaceTrustManagementService),
  __decorateParam(14, IUserDataProfilesService),
  __decorateParam(15, IUserDataProfileService),
  __decorateParam(16, ILogService)
], AbstractWorkspaceEditingService);
export {
  AbstractWorkspaceEditingService,
  DidEnterWorkspaceEvent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3Jrc3BhY2VzXFxicm93c2VyXFxhYnN0cmFjdFdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSURpZEVudGVyV29ya3NwYWNlRXZlbnQsIElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi93b3Jrc3BhY2VFZGl0aW5nLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBoYXNXb3Jrc3BhY2VGaWxlRXh0ZW5zaW9uLCBJQW55V29ya3NwYWNlSWRlbnRpZmllciwgaXNTYXZlZFdvcmtzcGFjZSwgaXNVbnRpdGxlZFdvcmtzcGFjZSwgaXNXb3Jrc3BhY2VJZGVudGlmaWVyLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VJZGVudGlmaWVyLCB0b1dvcmtzcGFjZUlkZW50aWZpZXIsIFdvcmtiZW5jaFN0YXRlLCBXT1JLU1BBQ0VfRVhURU5TSU9OLCBXT1JLU1BBQ0VfRklMVEVSIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUpTT05FZGl0aW5nU2VydmljZSwgSlNPTkVkaXRpbmdFcnJvciwgSlNPTkVkaXRpbmdFcnJvckNvZGUgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9qc29uRWRpdGluZy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyQ3JlYXRpb25EYXRhLCBJV29ya3NwYWNlc1NlcnZpY2UsIHJld3JpdGVXb3Jrc3BhY2VGaWxlRm9yTmV3TG9jYXRpb24sIElFbnRlcldvcmtzcGFjZVJlc3VsdCwgSVN0b3JlZFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZXMuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vYnJvd3Nlci9jb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIElDb25maWd1cmF0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0VxdWFsLCBpc0VxdWFsQXV0aG9yaXR5LCBqb2luUGF0aCwgcmVtb3ZlVHJhaWxpbmdQYXRoU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UsIElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBTYXZlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEaWRFbnRlcldvcmtzcGFjZUV2ZW50IGltcGxlbWVudHMgSURpZEVudGVyV29ya3NwYWNlRXZlbnQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG9sZFdvcmtzcGFjZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIsXG5cdFx0cmVhZG9ubHkgbmV3V29ya3NwYWNlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllclxuXHQpIHsgfVxuXG5cdGpvaW4ocHJvbWlzZTogUHJvbWlzZTx2b2lkPik6IHZvaWQge1xuXHRcdHRoaXMucHJvbWlzZXMucHVzaChwcm9taXNlKTtcblx0fVxuXG5cdGFzeW5jIHdhaXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZCh0aGlzLnByb21pc2VzKTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRW50ZXJXb3Jrc3BhY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRGlkRW50ZXJXb3Jrc3BhY2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRW50ZXJXb3Jrc3BhY2U6IEV2ZW50PElEaWRFbnRlcldvcmtzcGFjZUV2ZW50PiA9IHRoaXMuX29uRGlkRW50ZXJXb3Jrc3BhY2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElKU09ORWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBqc29uRWRpdGluZ1NlcnZpY2U6IElKU09ORWRpdGluZ1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IFdvcmtzcGFjZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZXNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB3b3Jrc3BhY2VzU2VydmljZTogSVdvcmtzcGFjZXNTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIHBpY2tOZXdXb3Jrc3BhY2VQYXRoKCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYXZhaWxhYmxlRmlsZVN5c3RlbXMgPSBbU2NoZW1hcy5maWxlXTtcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRhdmFpbGFibGVGaWxlU3lzdGVtcy51bnNoaWZ0KFNjaGVtYXMudnNjb2RlUmVtb3RlKTtcblx0XHR9XG5cdFx0bGV0IHdvcmtzcGFjZVBhdGggPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dTYXZlRGlhbG9nKHtcblx0XHRcdHNhdmVMYWJlbDogbG9jYWxpemUoJ3NhdmUnLCBcIlNhdmVcIiksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NhdmVXb3Jrc3BhY2UnLCBcIlNhdmUgV29ya3NwYWNlXCIpLFxuXHRcdFx0ZmlsdGVyczogV09SS1NQQUNFX0ZJTFRFUixcblx0XHRcdGRlZmF1bHRVcmk6IGpvaW5QYXRoKGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdFdvcmtzcGFjZVBhdGgoKSwgdGhpcy5nZXROZXdXb3Jrc3BhY2VOYW1lKCkpLFxuXHRcdFx0YXZhaWxhYmxlRmlsZVN5c3RlbXNcblx0XHR9KTtcblxuXHRcdGlmICghd29ya3NwYWNlUGF0aCkge1xuXHRcdFx0cmV0dXJuOyAvLyBjYW5jZWxlZFxuXHRcdH1cblxuXHRcdGlmICghaGFzV29ya3NwYWNlRmlsZUV4dGVuc2lvbih3b3Jrc3BhY2VQYXRoKSkge1xuXHRcdFx0Ly8gQWx3YXlzIGVuc3VyZSB3ZSBoYXZlIHdvcmtzcGFjZSBmaWxlIGV4dGVuc2lvblxuXHRcdFx0Ly8gKHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvODQ4MTgpXG5cdFx0XHR3b3Jrc3BhY2VQYXRoID0gd29ya3NwYWNlUGF0aC53aXRoKHsgcGF0aDogYCR7d29ya3NwYWNlUGF0aC5wYXRofS4ke1dPUktTUEFDRV9FWFRFTlNJT059YCB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gd29ya3NwYWNlUGF0aDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TmV3V29ya3NwYWNlTmFtZSgpOiBzdHJpbmcge1xuXG5cdFx0Ly8gRmlyc3QgdHJ5IHdpdGggZXhpc3Rpbmcgd29ya3NwYWNlIG5hbWVcblx0XHRjb25zdCBjb25maWdQYXRoVVJJID0gdGhpcy5nZXRDdXJyZW50V29ya3NwYWNlSWRlbnRpZmllcigpPy5jb25maWdQYXRoO1xuXHRcdGlmIChjb25maWdQYXRoVVJJICYmIGlzU2F2ZWRXb3Jrc3BhY2UoY29uZmlnUGF0aFVSSSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm4gYmFzZW5hbWUoY29uZmlnUGF0aFVSSSk7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlbiBmYWxsYmFjayB0byBmaXJzdCBmb2xkZXIgaWYgYW55XG5cdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLmF0KDApO1xuXHRcdGlmIChmb2xkZXIpIHtcblx0XHRcdHJldHVybiBgJHtiYXNlbmFtZShmb2xkZXIudXJpKX0uJHtXT1JLU1BBQ0VfRVhURU5TSU9OfWA7XG5cdFx0fVxuXG5cdFx0Ly8gRmluYWxseSBwaWNrIGEgZ29vZCBkZWZhdWx0XG5cdFx0cmV0dXJuIGB3b3Jrc3BhY2UuJHtXT1JLU1BBQ0VfRVhURU5TSU9OfWA7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVGb2xkZXJzKGluZGV4OiBudW1iZXIsIGRlbGV0ZUNvdW50PzogbnVtYmVyLCBmb2xkZXJzVG9BZGRDYW5kaWRhdGVzPzogSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YVtdLCBkb25vdE5vdGlmeUVycm9yPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cblx0XHRsZXQgZm9sZGVyc1RvRGVsZXRlOiBVUklbXSA9IFtdO1xuXHRcdGlmICh0eXBlb2YgZGVsZXRlQ291bnQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRmb2xkZXJzVG9EZWxldGUgPSBmb2xkZXJzLnNsaWNlKGluZGV4LCBpbmRleCArIGRlbGV0ZUNvdW50KS5tYXAoZm9sZGVyID0+IGZvbGRlci51cmkpO1xuXHRcdH1cblxuXHRcdGxldCBmb2xkZXJzVG9BZGQ6IElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGFbXSA9IFtdO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGZvbGRlcnNUb0FkZENhbmRpZGF0ZXMpKSB7XG5cdFx0XHRmb2xkZXJzVG9BZGQgPSBmb2xkZXJzVG9BZGRDYW5kaWRhdGVzLm1hcChmb2xkZXJUb0FkZCA9PiAoeyB1cmk6IHJlbW92ZVRyYWlsaW5nUGF0aFNlcGFyYXRvcihmb2xkZXJUb0FkZC51cmkpLCBuYW1lOiBmb2xkZXJUb0FkZC5uYW1lIH0pKTsgLy8gTm9ybWFsaXplXG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2FudHNUb0RlbGV0ZSA9IGZvbGRlcnNUb0RlbGV0ZS5sZW5ndGggPiAwO1xuXHRcdGNvbnN0IHdhbnRzVG9BZGQgPSBmb2xkZXJzVG9BZGQubGVuZ3RoID4gMDtcblxuXHRcdGlmICghd2FudHNUb0FkZCAmJiAhd2FudHNUb0RlbGV0ZSkge1xuXHRcdFx0cmV0dXJuOyAvLyByZXR1cm4gZWFybHkgaWYgdGhlcmUgaXMgbm90aGluZyB0byBkb1xuXHRcdH1cblxuXHRcdC8vIEFkZCBGb2xkZXJzXG5cdFx0aWYgKHdhbnRzVG9BZGQgJiYgIXdhbnRzVG9EZWxldGUpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvQWRkRm9sZGVycyhmb2xkZXJzVG9BZGQsIGluZGV4LCBkb25vdE5vdGlmeUVycm9yKTtcblx0XHR9XG5cblx0XHQvLyBEZWxldGUgRm9sZGVyc1xuXHRcdGlmICh3YW50c1RvRGVsZXRlICYmICF3YW50c1RvQWRkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZW1vdmVGb2xkZXJzKGZvbGRlcnNUb0RlbGV0ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkICYgRGVsZXRlIEZvbGRlcnNcblx0XHRlbHNlIHtcblxuXHRcdFx0Ly8gaWYgd2UgYXJlIGluIHNpbmdsZS1mb2xkZXIgc3RhdGUgYW5kIHRoZSBmb2xkZXIgaXMgcmVwbGFjZWQgd2l0aFxuXHRcdFx0Ly8gb3RoZXIgZm9sZGVycywgd2UgaGFuZGxlIHRoaXMgc3BlY2lhbGx5IGFuZCBqdXN0IGVudGVyIHdvcmtzcGFjZVxuXHRcdFx0Ly8gbW9kZSB3aXRoIHRoZSBmb2xkZXJzIHRoYXQgYXJlIGJlaW5nIGFkZGVkLlxuXHRcdFx0aWYgKHRoaXMuaW5jbHVkZXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2UoZm9sZGVyc1RvRGVsZXRlKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVBbmRFbnRlcldvcmtzcGFjZShmb2xkZXJzVG9BZGQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBpZiB3ZSBhcmUgbm90IGluIHdvcmtzcGFjZS1zdGF0ZSwgd2UganVzdCBhZGQgdGhlIGZvbGRlcnNcblx0XHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5kb0FkZEZvbGRlcnMoZm9sZGVyc1RvQWRkLCBpbmRleCwgZG9ub3ROb3RpZnlFcnJvcik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGZpbmFsbHksIHVwZGF0ZSBmb2xkZXJzIHdpdGhpbiB0aGUgd29ya3NwYWNlXG5cdFx0XHRyZXR1cm4gdGhpcy5kb1VwZGF0ZUZvbGRlcnMoZm9sZGVyc1RvQWRkLCBmb2xkZXJzVG9EZWxldGUsIGluZGV4LCBkb25vdE5vdGlmeUVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvVXBkYXRlRm9sZGVycyhmb2xkZXJzVG9BZGQ6IElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGFbXSwgZm9sZGVyc1RvRGVsZXRlOiBVUklbXSwgaW5kZXg/OiBudW1iZXIsIGRvbm90Tm90aWZ5RXJyb3IgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbnRleHRTZXJ2aWNlLnVwZGF0ZUZvbGRlcnMoZm9sZGVyc1RvQWRkLCBmb2xkZXJzVG9EZWxldGUsIGluZGV4KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGRvbm90Tm90aWZ5RXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuaGFuZGxlV29ya3NwYWNlQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0YWRkRm9sZGVycyhmb2xkZXJzVG9BZGRDYW5kaWRhdGVzOiBJV29ya3NwYWNlRm9sZGVyQ3JlYXRpb25EYXRhW10sIGRvbm90Tm90aWZ5RXJyb3IgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gTm9ybWFsaXplXG5cdFx0Y29uc3QgZm9sZGVyc1RvQWRkID0gZm9sZGVyc1RvQWRkQ2FuZGlkYXRlcy5tYXAoZm9sZGVyVG9BZGQgPT4gKHsgdXJpOiByZW1vdmVUcmFpbGluZ1BhdGhTZXBhcmF0b3IoZm9sZGVyVG9BZGQudXJpKSwgbmFtZTogZm9sZGVyVG9BZGQubmFtZSB9KSk7XG5cblx0XHRyZXR1cm4gdGhpcy5kb0FkZEZvbGRlcnMoZm9sZGVyc1RvQWRkLCB1bmRlZmluZWQsIGRvbm90Tm90aWZ5RXJyb3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0FkZEZvbGRlcnMoZm9sZGVyc1RvQWRkOiBJV29ya3NwYWNlRm9sZGVyQ3JlYXRpb25EYXRhW10sIGluZGV4PzogbnVtYmVyLCBkb25vdE5vdGlmeUVycm9yID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKTtcblx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0aWYgKHJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzk0MTkxXG5cdFx0XHRmb2xkZXJzVG9BZGQgPSBmb2xkZXJzVG9BZGQuZmlsdGVyKGZvbGRlciA9PiBmb2xkZXIudXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlICYmIChmb2xkZXIudXJpLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVSZW1vdGUgfHwgaXNFcXVhbEF1dGhvcml0eShmb2xkZXIudXJpLmF1dGhvcml0eSwgcmVtb3RlQXV0aG9yaXR5KSkpO1xuXHRcdH1cblxuXHRcdC8vIElmIHdlIGFyZSBpbiBuby13b3Jrc3BhY2Ugb3Igc2luZ2xlLWZvbGRlciB3b3Jrc3BhY2UsIGFkZGluZyBmb2xkZXJzIGhhcyB0b1xuXHRcdC8vIGVudGVyIGEgd29ya3NwYWNlLlxuXHRcdGlmIChzdGF0ZSAhPT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFKSB7XG5cdFx0XHRsZXQgbmV3V29ya3NwYWNlRm9sZGVycyA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5tYXAoZm9sZGVyID0+ICh7IHVyaTogZm9sZGVyLnVyaSB9KSk7XG5cdFx0XHRuZXdXb3Jrc3BhY2VGb2xkZXJzLnNwbGljZSh0eXBlb2YgaW5kZXggPT09ICdudW1iZXInID8gaW5kZXggOiBuZXdXb3Jrc3BhY2VGb2xkZXJzLmxlbmd0aCwgMCwgLi4uZm9sZGVyc1RvQWRkKTtcblx0XHRcdG5ld1dvcmtzcGFjZUZvbGRlcnMgPSBkaXN0aW5jdChuZXdXb3Jrc3BhY2VGb2xkZXJzLCBmb2xkZXIgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmdldENvbXBhcmlzb25LZXkoZm9sZGVyLnVyaSkpO1xuXG5cdFx0XHRpZiAoc3RhdGUgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZICYmIG5ld1dvcmtzcGFjZUZvbGRlcnMubGVuZ3RoID09PSAwIHx8IHN0YXRlID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIgJiYgbmV3V29ya3NwYWNlRm9sZGVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyByZXR1cm4gaWYgdGhlIG9wZXJhdGlvbiBpcyBhIG5vLW9wIGZvciB0aGUgY3VycmVudCBzdGF0ZVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVBbmRFbnRlcldvcmtzcGFjZShuZXdXb3Jrc3BhY2VGb2xkZXJzKTtcblx0XHR9XG5cblx0XHQvLyBEZWxlZ2F0ZSBhZGRpdGlvbiBvZiBmb2xkZXJzIHRvIHdvcmtzcGFjZSBzZXJ2aWNlIG90aGVyd2lzZVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbnRleHRTZXJ2aWNlLmFkZEZvbGRlcnMoZm9sZGVyc1RvQWRkLCBpbmRleCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChkb25vdE5vdGlmeUVycm9yKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmhhbmRsZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlbW92ZUZvbGRlcnMoZm9sZGVyc1RvUmVtb3ZlOiBVUklbXSwgZG9ub3ROb3RpZnlFcnJvciA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBJZiB3ZSBhcmUgaW4gc2luZ2xlLWZvbGRlciBzdGF0ZSBhbmQgdGhlIG9wZW5lZCBmb2xkZXIgaXMgdG8gYmUgcmVtb3ZlZCxcblx0XHQvLyB3ZSBjcmVhdGUgYW4gZW1wdHkgd29ya3NwYWNlIGFuZCBlbnRlciBpdC5cblx0XHRpZiAodGhpcy5pbmNsdWRlc1NpbmdsZUZvbGRlcldvcmtzcGFjZShmb2xkZXJzVG9SZW1vdmUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVBbmRFbnRlcldvcmtzcGFjZShbXSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGVsZWdhdGUgcmVtb3ZhbCBvZiBmb2xkZXJzIHRvIHdvcmtzcGFjZSBzZXJ2aWNlIG90aGVyd2lzZVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbnRleHRTZXJ2aWNlLnJlbW92ZUZvbGRlcnMoZm9sZGVyc1RvUmVtb3ZlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGRvbm90Tm90aWZ5RXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuaGFuZGxlV29ya3NwYWNlQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpbmNsdWRlc1NpbmdsZUZvbGRlcldvcmtzcGFjZShmb2xkZXJzOiBVUklbXSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUikge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdO1xuXHRcdFx0cmV0dXJuIChmb2xkZXJzLnNvbWUoZm9sZGVyID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGZvbGRlciwgd29ya3NwYWNlRm9sZGVyLnVyaSkpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVBbmRFbnRlcldvcmtzcGFjZShmb2xkZXJzOiBJV29ya3NwYWNlRm9sZGVyQ3JlYXRpb25EYXRhW10sIHBhdGg/OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAocGF0aCAmJiAhYXdhaXQgdGhpcy5pc1ZhbGlkVGFyZ2V0V29ya3NwYWNlUGF0aChwYXRoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHRjb25zdCB1bnRpdGxlZFdvcmtzcGFjZSA9IGF3YWl0IHRoaXMud29ya3NwYWNlc1NlcnZpY2UuY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoZm9sZGVycywgcmVtb3RlQXV0aG9yaXR5KTtcblx0XHRpZiAocGF0aCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zYXZlV29ya3NwYWNlQXModW50aXRsZWRXb3Jrc3BhY2UsIHBhdGgpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VzU2VydmljZS5kZWxldGVVbnRpdGxlZFdvcmtzcGFjZSh1bnRpdGxlZFdvcmtzcGFjZSk7IC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDAyNzZcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cGF0aCA9IHVudGl0bGVkV29ya3NwYWNlLmNvbmZpZ1BhdGg7XG5cdFx0XHRpZiAoIXRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5zZXRQcm9maWxlRm9yV29ya3NwYWNlKHVudGl0bGVkV29ya3NwYWNlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmVudGVyV29ya3NwYWNlKHBhdGgpO1xuXHR9XG5cblx0YXN5bmMgc2F2ZUFuZEVudGVyV29ya3NwYWNlKHdvcmtzcGFjZVVyaTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlSWRlbnRpZmllciA9IHRoaXMuZ2V0Q3VycmVudFdvcmtzcGFjZUlkZW50aWZpZXIoKTtcblx0XHRpZiAoIXdvcmtzcGFjZUlkZW50aWZpZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBbGxvdyB0byBzYXZlIHRoZSB3b3Jrc3BhY2Ugb2YgdGhlIGN1cnJlbnQgd2luZG93XG5cdFx0Ly8gaWYgd2UgaGF2ZSBhbiBpZGVudGljYWwgbWF0Y2ggb24gdGhlIHBhdGhcblx0XHRpZiAoaXNFcXVhbCh3b3Jrc3BhY2VJZGVudGlmaWVyLmNvbmZpZ1BhdGgsIHdvcmtzcGFjZVVyaSkpIHtcblx0XHRcdHJldHVybiB0aGlzLnNhdmVXb3Jrc3BhY2Uod29ya3NwYWNlSWRlbnRpZmllcik7XG5cdFx0fVxuXG5cdFx0Ly8gRnJvbSB0aGlzIG1vbWVudCBvbiB3ZSByZXF1aXJlIGEgdmFsaWQgdGFyZ2V0IHRoYXQgaXMgbm90IG9wZW5lZCBhbHJlYWR5XG5cdFx0aWYgKCFhd2FpdCB0aGlzLmlzVmFsaWRUYXJnZXRXb3Jrc3BhY2VQYXRoKHdvcmtzcGFjZVVyaSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnNhdmVXb3Jrc3BhY2VBcyh3b3Jrc3BhY2VJZGVudGlmaWVyLCB3b3Jrc3BhY2VVcmkpO1xuXG5cdFx0cmV0dXJuIHRoaXMuZW50ZXJXb3Jrc3BhY2Uod29ya3NwYWNlVXJpKTtcblx0fVxuXG5cdGFzeW5jIGlzVmFsaWRUYXJnZXRXb3Jrc3BhY2VQYXRoKHdvcmtzcGFjZVVyaTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRydWU7IC8vIE9LXG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgc2F2ZVdvcmtzcGFjZUFzKHdvcmtzcGFjZTogSVdvcmtzcGFjZUlkZW50aWZpZXIsIHRhcmdldENvbmZpZ1BhdGhVUkk6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbmZpZ1BhdGhVUkkgPSB3b3Jrc3BhY2UuY29uZmlnUGF0aDtcblxuXHRcdGNvbnN0IGlzTm90VW50aXRsZWRXb3Jrc3BhY2UgPSAhaXNVbnRpdGxlZFdvcmtzcGFjZSh0YXJnZXRDb25maWdQYXRoVVJJLCB0aGlzLmVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aWYgKGlzTm90VW50aXRsZWRXb3Jrc3BhY2UgJiYgIXRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdGNvbnN0IG5ld1dvcmtzcGFjZSA9IGF3YWl0IHRoaXMud29ya3NwYWNlc1NlcnZpY2UuZ2V0V29ya3NwYWNlSWRlbnRpZmllcih0YXJnZXRDb25maWdQYXRoVVJJKTtcblx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2Uuc2V0UHJvZmlsZUZvcldvcmtzcGFjZShuZXdXb3Jrc3BhY2UsIHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIHRhcmdldCBpcyBzYW1lIGFzIHNvdXJjZVxuXHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChjb25maWdQYXRoVVJJLCB0YXJnZXRDb25maWdQYXRoVVJJKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzRnJvbVVudGl0bGVkV29ya3NwYWNlID0gaXNVbnRpdGxlZFdvcmtzcGFjZShjb25maWdQYXRoVVJJLCB0aGlzLmVudmlyb25tZW50U2VydmljZSk7XG5cblx0XHQvLyBSZWFkIHRoZSBjb250ZW50cyBvZiB0aGUgd29ya3NwYWNlIGZpbGUsIHVwZGF0ZSBpdCB0byBuZXcgbG9jYXRpb24gYW5kIHNhdmUgaXQuXG5cdFx0Y29uc3QgcmF3ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShjb25maWdQYXRoVVJJKTtcblx0XHRjb25zdCBuZXdSYXdXb3Jrc3BhY2VDb250ZW50cyA9IHJld3JpdGVXb3Jrc3BhY2VGaWxlRm9yTmV3TG9jYXRpb24ocmF3LnZhbHVlLnRvU3RyaW5nKCksIGNvbmZpZ1BhdGhVUkksIGlzRnJvbVVudGl0bGVkV29ya3NwYWNlLCB0YXJnZXRDb25maWdQYXRoVVJJLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkpO1xuXHRcdGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLmNyZWF0ZShbeyByZXNvdXJjZTogdGFyZ2V0Q29uZmlnUGF0aFVSSSwgdmFsdWU6IG5ld1Jhd1dvcmtzcGFjZUNvbnRlbnRzLCBvcHRpb25zOiB7IG92ZXJ3cml0ZTogdHJ1ZSB9IH1dKTtcblxuXHRcdC8vIFNldCB0cnVzdCBmb3IgdGhlIHdvcmtzcGFjZSBmaWxlXG5cdFx0YXdhaXQgdGhpcy50cnVzdFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24odGFyZ2V0Q29uZmlnUGF0aFVSSSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgc2F2ZVdvcmtzcGFjZSh3b3Jrc3BhY2U6IElXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlnUGF0aFVSSSA9IHdvcmtzcGFjZS5jb25maWdQYXRoO1xuXG5cdFx0Ly8gRmlyc3Q6IHRyeSB0byBzYXZlIGFueSBleGlzdGluZyBtb2RlbCBhcyBpdCBjb3VsZCBiZSBkaXJ0eVxuXHRcdGNvbnN0IGV4aXN0aW5nTW9kZWwgPSB0aGlzLnRleHRGaWxlU2VydmljZS5maWxlcy5nZXQoY29uZmlnUGF0aFVSSSk7XG5cdFx0aWYgKGV4aXN0aW5nTW9kZWwpIHtcblx0XHRcdGF3YWl0IGV4aXN0aW5nTW9kZWwuc2F2ZSh7IGZvcmNlOiB0cnVlLCByZWFzb246IFNhdmVSZWFzb24uRVhQTElDSVQgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2Vjb25kOiBpZiB0aGUgZmlsZSBleGlzdHMgb24gZGlzaywgc2ltcGx5IHJldHVyblxuXHRcdGNvbnN0IHdvcmtzcGFjZUZpbGVFeGlzdHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhjb25maWdQYXRoVVJJKTtcblx0XHRpZiAod29ya3NwYWNlRmlsZUV4aXN0cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZpbmFsbHksIHdlIG5lZWQgdG8gcmUtY3JlYXRlIHRoZSBmaWxlIGFzIGl0IHdhcyBkZWxldGVkXG5cdFx0Y29uc3QgbmV3V29ya3NwYWNlOiBJU3RvcmVkV29ya3NwYWNlID0geyBmb2xkZXJzOiBbXSB9O1xuXHRcdGNvbnN0IG5ld1Jhd1dvcmtzcGFjZUNvbnRlbnRzID0gcmV3cml0ZVdvcmtzcGFjZUZpbGVGb3JOZXdMb2NhdGlvbihKU09OLnN0cmluZ2lmeShuZXdXb3Jrc3BhY2UsIG51bGwsICdcXHQnKSwgY29uZmlnUGF0aFVSSSwgZmFsc2UsIGNvbmZpZ1BhdGhVUkksIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaSk7XG5cdFx0YXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2UuY3JlYXRlKFt7IHJlc291cmNlOiBjb25maWdQYXRoVVJJLCB2YWx1ZTogbmV3UmF3V29ya3NwYWNlQ29udGVudHMgfV0pO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVXb3Jrc3BhY2VDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKGVycm9yOiBKU09ORWRpdGluZ0Vycm9yKTogdm9pZCB7XG5cdFx0c3dpdGNoIChlcnJvci5jb2RlKSB7XG5cdFx0XHRjYXNlIEpTT05FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0lOVkFMSURfRklMRTpcblx0XHRcdFx0dGhpcy5vbkludmFsaWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uRmlsZUVycm9yKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yLm1lc3NhZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25JbnZhbGlkV29ya3NwYWNlQ29uZmlndXJhdGlvbkZpbGVFcnJvcigpOiB2b2lkIHtcblx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoJ2Vycm9ySW52YWxpZFRhc2tDb25maWd1cmF0aW9uJywgXCJVbmFibGUgdG8gd3JpdGUgaW50byB3b3Jrc3BhY2UgY29uZmlndXJhdGlvbiBmaWxlLiBQbGVhc2Ugb3BlbiB0aGUgZmlsZSB0byBjb3JyZWN0IGVycm9ycy93YXJuaW5ncyBpbiBpdCBhbmQgdHJ5IGFnYWluLlwiKTtcblx0XHR0aGlzLmFza1RvT3BlbldvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlKG1lc3NhZ2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc2tUb09wZW5Xb3Jrc3BhY2VDb25maWd1cmF0aW9uRmlsZShtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5LkVycm9yLCBtZXNzYWdlLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdvcGVuV29ya3NwYWNlQ29uZmlndXJhdGlvbkZpbGUnLCBcIk9wZW4gV29ya3NwYWNlIENvbmZpZ3VyYXRpb25cIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuV29ya3NwYWNlQ29uZmlnRmlsZScpXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH1cblxuXHRhYnN0cmFjdCBlbnRlcldvcmtzcGFjZSh3b3Jrc3BhY2VVcmk6IFVSSSk6IFByb21pc2U8dm9pZD47XG5cblx0cHJvdGVjdGVkIGFzeW5jIGZpcmVEaWRFbnRlcldvcmtzcGFjZShvbGRXb3Jrc3BhY2U6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyLCBuZXdXb3Jrc3BhY2U6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgRGlkRW50ZXJXb3Jrc3BhY2VFdmVudChvbGRXb3Jrc3BhY2UsIG5ld1dvcmtzcGFjZSk7XG5cdFx0dGhpcy5fb25EaWRFbnRlcldvcmtzcGFjZS5maXJlKGV2ZW50KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBldmVudC53YWl0KCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXJyb3Igd2hpbGUgd2FpdGluZyBmb3IgcGFydGljaXBhbnRzIG9mIG9uRGlkRW50ZXJXb3Jrc3BhY2UgdG8gam9pbjonLCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGRvRW50ZXJXb3Jrc3BhY2Uod29ya3NwYWNlVXJpOiBVUkkpOiBQcm9taXNlPElFbnRlcldvcmtzcGFjZVJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0VudGVyaW5nIGEgbmV3IHdvcmtzcGFjZSBpcyBub3QgcG9zc2libGUgaW4gdGVzdHMuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VzU2VydmljZS5nZXRXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZVVyaSk7XG5cblx0XHQvLyBTZXR0aW5ncyBtaWdyYXRpb24gKG9ubHkgaWYgd2UgY29tZSBmcm9tIGEgZm9sZGVyIHdvcmtzcGFjZSlcblx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIpIHtcblx0XHRcdGF3YWl0IHRoaXMubWlncmF0ZVdvcmtzcGFjZVNldHRpbmdzKHdvcmtzcGFjZSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbml0aWFsaXplKHdvcmtzcGFjZSk7XG5cblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VzU2VydmljZS5lbnRlcldvcmtzcGFjZSh3b3Jrc3BhY2VVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBtaWdyYXRlV29ya3NwYWNlU2V0dGluZ3ModG9Xb3Jrc3BhY2U6IElXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZG9Db3B5V29ya3NwYWNlU2V0dGluZ3ModG9Xb3Jrc3BhY2UsIHNldHRpbmcgPT4gc2V0dGluZy5zY29wZSA9PT0gQ29uZmlndXJhdGlvblNjb3BlLldJTkRPVyk7XG5cdH1cblxuXHRjb3B5V29ya3NwYWNlU2V0dGluZ3ModG9Xb3Jrc3BhY2U6IElXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZG9Db3B5V29ya3NwYWNlU2V0dGluZ3ModG9Xb3Jrc3BhY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0NvcHlXb3Jrc3BhY2VTZXR0aW5ncyh0b1dvcmtzcGFjZTogSVdvcmtzcGFjZUlkZW50aWZpZXIsIGZpbHRlcj86IChjb25maWc6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEpID0+IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUHJvcGVydGllcyA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0Y29uc3QgdGFyZ2V0V29ya3NwYWNlQ29uZmlndXJhdGlvbjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmtleXMoKS53b3Jrc3BhY2UpIHtcblx0XHRcdGlmIChjb25maWd1cmF0aW9uUHJvcGVydGllc1trZXldKSB7XG5cdFx0XHRcdGlmIChmaWx0ZXIgJiYgIWZpbHRlcihjb25maWd1cmF0aW9uUHJvcGVydGllc1trZXldKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGFyZ2V0V29ya3NwYWNlQ29uZmlndXJhdGlvbltrZXldID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KGtleSkud29ya3NwYWNlVmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuanNvbkVkaXRpbmdTZXJ2aWNlLndyaXRlKHRvV29ya3NwYWNlLmNvbmZpZ1BhdGgsIFt7IHBhdGg6IFsnc2V0dGluZ3MnXSwgdmFsdWU6IHRhcmdldFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24gfV0sIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0cnVzdFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24oY29uZmlnUGF0aFVSSTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgJiYgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uuc2V0VXJpc1RydXN0KFtjb25maWdQYXRoVVJJXSwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGdldEN1cnJlbnRXb3Jrc3BhY2VJZGVudGlmaWVyKCk6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpZGVudGlmaWVyID0gdG9Xb3Jrc3BhY2VJZGVudGlmaWVyKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpO1xuXHRcdGlmIChpc1dvcmtzcGFjZUlkZW50aWZpZXIoaWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybiBpZGVudGlmaWVyO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBT0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBb0Qsa0JBQWtCLHFCQUFxQix1QkFBdUIsMEJBQWdELHVCQUF1QixnQkFBZ0IscUJBQXFCLHdCQUF3QjtBQUMvUCxTQUFTLHFCQUF1Qyw0QkFBNEI7QUFDNUUsU0FBdUMsb0JBQW9CLDBDQUFtRjtBQUU5SSxTQUFTLG9CQUE0QyxjQUFjLCtCQUE2RDtBQUNoSSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFVBQVUsU0FBUyxrQkFBa0IsVUFBVSxtQ0FBbUM7QUFDM0YsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsb0JBQW9CLHNCQUFzQjtBQUNuRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFzQjtBQUMvQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUVsQixNQUFNLHVCQUEwRDtBQUFBLEVBSXRFLFlBQ1Us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
