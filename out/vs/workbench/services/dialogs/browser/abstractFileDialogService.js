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
import * as nls from "../../../../nls.js";
import { isWorkspaceToOpen, isFileToOpen } from "../../../../platform/window/common/window.js";
import { IDialogService, ConfirmResult, getFileNamesMessage } from "../../../../platform/dialogs/common/dialogs.js";
import { isSavedWorkspace, isTemporaryWorkspace, IWorkspaceContextService, WorkbenchState, WORKSPACE_EXTENSION } from "../../../../platform/workspace/common/workspace.js";
import { IHistoryService } from "../../history/common/history.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import * as resources from "../../../../base/common/resources.js";
import { isAbsolute as localPathIsAbsolute, normalize as localPathNormalize } from "../../../../base/common/path.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { SimpleFileDialog } from "./simpleFileDialog.js";
import { IWorkspacesService } from "../../../../platform/workspaces/common/workspaces.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IHostService } from "../../host/browser/host.js";
import Severity from "../../../../base/common/severity.js";
import { coalesce, distinct } from "../../../../base/common/arrays.js";
import { trim } from "../../../../base/common/strings.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IPathService } from "../../path/common/pathService.js";
import { Schemas } from "../../../../base/common/network.js";
import { PLAINTEXT_EXTENSION } from "../../../../editor/common/languages/modesRegistry.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { EditorOpenSource } from "../../../../platform/editor/common/editor.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
let AbstractFileDialogService = class {
  constructor(hostService, contextService, historyService, environmentService, instantiationService, configurationService, fileService, openerService, dialogService, languageService, workspacesService, labelService, pathService, commandService, editorService, codeEditorService, logService, remoteAgentService) {
    this.hostService = hostService;
    this.contextService = contextService;
    this.historyService = historyService;
    this.environmentService = environmentService;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.fileService = fileService;
    this.openerService = openerService;
    this.dialogService = dialogService;
    this.languageService = languageService;
    this.workspacesService = workspacesService;
    this.labelService = labelService;
    this.pathService = pathService;
    this.commandService = commandService;
    this.editorService = editorService;
    this.codeEditorService = codeEditorService;
    this.logService = logService;
    this.remoteAgentService = remoteAgentService;
  }
  async defaultFilePath(schemeFilter = this.getSchemeFilterForWindow(), authorityFilter = this.getAuthorityFilterForWindow()) {
    let candidate = this.historyService.getLastActiveFile(schemeFilter, authorityFilter);
    if (candidate && await this.isRemoteUserData(candidate)) {
      this.logService.debug(`[FileDialogService] Skipping last active file as it is a remote user data resource: ${candidate}`);
      candidate = void 0;
    }
    if (!candidate) {
      candidate = this.historyService.getLastActiveWorkspaceRoot(schemeFilter, authorityFilter);
      if (candidate) {
        this.logService.debug(`[FileDialogService] Default file path using last active workspace root: ${candidate}`);
      }
    } else {
      this.logService.debug(`[FileDialogService] Default file path using parent of last active file: ${candidate}`);
      candidate = resources.dirname(candidate);
    }
    if (!candidate) {
      candidate = await this.preferredHome(schemeFilter);
      this.logService.debug(`[FileDialogService] Default file path using preferred home: ${candidate}`);
    }
    return candidate;
  }
  async defaultFolderPath(schemeFilter = this.getSchemeFilterForWindow(), authorityFilter = this.getAuthorityFilterForWindow()) {
    let candidate = this.historyService.getLastActiveWorkspaceRoot(schemeFilter, authorityFilter);
    if (!candidate) {
      candidate = this.historyService.getLastActiveFile(schemeFilter, authorityFilter);
      if (candidate && await this.isRemoteUserData(candidate)) {
        this.logService.debug(`[FileDialogService] Skipping last active file as it is a remote user data resource: ${candidate}`);
        candidate = void 0;
      }
      if (candidate) {
        this.logService.debug(`[FileDialogService] Default folder path using parent of last active file: ${candidate}`);
      }
    } else {
      this.logService.debug(`[FileDialogService] Default folder path using last active workspace root: ${candidate}`);
    }
    if (!candidate) {
      const preferredHome = await this.preferredHome(schemeFilter);
      this.logService.debug(`[FileDialogService] Default folder path using preferred home: ${preferredHome}`);
      return preferredHome;
    }
    return resources.dirname(candidate);
  }
  async preferredHome(schemeFilter = this.getSchemeFilterForWindow()) {
    const preferLocal = schemeFilter === Schemas.file;
    const preferredHomeConfig = this.configurationService.inspect("files.dialog.defaultPath");
    const preferredHomeCandidate = preferLocal ? preferredHomeConfig.userLocalValue : preferredHomeConfig.userRemoteValue;
    this.logService.debug(`[FileDialogService] Preferred home: preferLocal=${preferLocal}, userLocalValue=${preferredHomeConfig.userLocalValue}, userRemoteValue=${preferredHomeConfig.userRemoteValue}`);
    if (preferredHomeCandidate) {
      const isPreferredHomeCandidateAbsolute = preferLocal ? localPathIsAbsolute(preferredHomeCandidate) : (await this.pathService.path).isAbsolute(preferredHomeCandidate);
      if (isPreferredHomeCandidateAbsolute) {
        const preferredHomeNormalized = preferLocal ? localPathNormalize(preferredHomeCandidate) : (await this.pathService.path).normalize(preferredHomeCandidate);
        const preferredHome = resources.toLocalResource(await this.pathService.fileURI(preferredHomeNormalized), this.environmentService.remoteAuthority, this.pathService.defaultUriScheme);
        if (await this.fileService.exists(preferredHome)) {
          this.logService.debug(`[FileDialogService] Preferred home using files.dialog.defaultPath setting: ${preferredHome}`);
          return preferredHome;
        }
        this.logService.debug(`[FileDialogService] Preferred home files.dialog.defaultPath path does not exist: ${preferredHome}`);
      } else {
        this.logService.debug(`[FileDialogService] Preferred home files.dialog.defaultPath is not absolute: ${preferredHomeCandidate}`);
      }
    }
    const userHome = this.pathService.userHome({ preferLocal });
    this.logService.debug(`[FileDialogService] Preferred home using user home: ${userHome}`);
    return userHome;
  }
  async defaultWorkspacePath(schemeFilter = this.getSchemeFilterForWindow()) {
    let defaultWorkspacePath;
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      const configuration = this.contextService.getWorkspace().configuration;
      if (configuration?.scheme === schemeFilter && isSavedWorkspace(configuration, this.environmentService) && !isTemporaryWorkspace(configuration)) {
        defaultWorkspacePath = resources.dirname(configuration);
      }
    }
    if (!defaultWorkspacePath) {
      defaultWorkspacePath = await this.defaultFilePath(schemeFilter);
    }
    return defaultWorkspacePath;
  }
  async showSaveConfirm(fileNamesOrResources) {
    if (this.skipDialogs()) {
      this.logService.trace("FileDialogService: refused to show save confirmation dialog in tests.");
      return ConfirmResult.DONT_SAVE;
    }
    return this.doShowSaveConfirm(fileNamesOrResources);
  }
  skipDialogs() {
    if (this.environmentService.enableSmokeTestDriver) {
      this.logService.warn("DialogService: Dialog requested during smoke test.");
    }
    return this.environmentService.isExtensionDevelopment && !!this.environmentService.extensionTestsLocationURI;
  }
  async doShowSaveConfirm(fileNamesOrResources) {
    if (fileNamesOrResources.length === 0) {
      return ConfirmResult.DONT_SAVE;
    }
    let message;
    let detail = nls.localize("saveChangesDetail", "Your changes will be lost if you don't save them.");
    if (fileNamesOrResources.length === 1) {
      message = nls.localize("saveChangesMessage", "Do you want to save the changes you made to {0}?", typeof fileNamesOrResources[0] === "string" ? fileNamesOrResources[0] : resources.basename(fileNamesOrResources[0]));
    } else {
      message = nls.localize("saveChangesMessages", "Do you want to save the changes to the following {0} files?", fileNamesOrResources.length);
      detail = getFileNamesMessage(fileNamesOrResources) + "\n" + detail;
    }
    const { result } = await this.dialogService.prompt({
      type: Severity.Warning,
      message,
      detail,
      buttons: [
        {
          label: fileNamesOrResources.length > 1 ? nls.localize({ key: "saveAll", comment: ["&& denotes a mnemonic"] }, "&&Save All") : nls.localize({ key: "save", comment: ["&& denotes a mnemonic"] }, "&&Save"),
          run: () => ConfirmResult.SAVE
        },
        {
          label: nls.localize({ key: "dontSave", comment: ["&& denotes a mnemonic"] }, "Do&&n't Save"),
          run: () => ConfirmResult.DONT_SAVE
        }
      ],
      cancelButton: {
        run: () => ConfirmResult.CANCEL
      }
    });
    return result;
  }
  addFileSchemaIfNeeded(schema, _isFolder) {
    return schema === Schemas.untitled ? [Schemas.file] : schema !== Schemas.file ? [schema, Schemas.file] : [schema];
  }
  async pickFileFolderAndOpenSimplified(schema, options, preferNewWindow) {
    const title = nls.localize("openFileOrFolder.title", "Open File or Folder");
    const availableFileSystems = this.addFileSchemaIfNeeded(schema);
    const uris = await this.pickResource({ canSelectFiles: true, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
    const uri = uris?.[0];
    if (uri) {
      const stat = await this.fileService.stat(uri);
      const toOpen = stat.isDirectory ? { folderUri: uri } : { fileUri: uri };
      if (!isWorkspaceToOpen(toOpen) && isFileToOpen(toOpen)) {
        this.addFileToRecentlyOpened(toOpen.fileUri);
      }
      if (stat.isDirectory || options.forceNewWindow || preferNewWindow) {
        await this.hostService.openWindow([toOpen], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
      } else {
        await this.editorService.openEditors([{ resource: uri, options: { source: EditorOpenSource.USER, pinned: true } }], void 0, { validateTrust: true });
      }
    }
  }
  async pickFileAndOpenSimplified(schema, options, preferNewWindow) {
    const title = nls.localize("openFile.title", "Open File");
    const availableFileSystems = this.addFileSchemaIfNeeded(schema);
    const uris = await this.pickResource({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
    const uri = uris?.[0];
    if (uri) {
      this.addFileToRecentlyOpened(uri);
      if (options.forceNewWindow || preferNewWindow) {
        await this.hostService.openWindow([{ fileUri: uri }], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
      } else {
        await this.editorService.openEditors([{ resource: uri, options: { source: EditorOpenSource.USER, pinned: true } }], void 0, { validateTrust: true });
      }
    }
  }
  addFileToRecentlyOpened(uri) {
    this.workspacesService.addRecentlyOpened([{ fileUri: uri, label: this.labelService.getUriLabel(uri, { appendWorkspaceSuffix: true }) }]);
  }
  async pickFolderAndOpenSimplified(schema, options) {
    const title = nls.localize("openFolder.title", "Open Folder");
    const availableFileSystems = this.addFileSchemaIfNeeded(schema, true);
    const uris = await this.pickResource({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
    const uri = uris?.[0];
    if (uri) {
      return this.hostService.openWindow([{ folderUri: uri }], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
    }
  }
  async pickWorkspaceAndOpenSimplified(schema, options) {
    const title = nls.localize("openWorkspace.title", "Open Workspace from File");
    const filters = [{ name: nls.localize("filterName.workspace", "Workspace"), extensions: [WORKSPACE_EXTENSION] }];
    const availableFileSystems = this.addFileSchemaIfNeeded(schema, true);
    const uris = await this.pickResource({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, filters, availableFileSystems });
    const uri = uris?.[0];
    if (uri) {
      return this.hostService.openWindow([{ workspaceUri: uri }], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
    }
  }
  async pickFileToSaveSimplified(schema, options) {
    if (!options.availableFileSystems) {
      options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
    }
    options.title = nls.localize("saveFileAs.title", "Save As");
    const uri = await this.saveRemoteResource(options);
    if (uri) {
      this.addFileToRecentlyOpened(uri);
    }
    return uri;
  }
  async showSaveDialogSimplified(schema, options) {
    if (!options.availableFileSystems) {
      options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
    }
    return this.saveRemoteResource(options);
  }
  async showOpenDialogSimplified(schema, options) {
    if (!options.availableFileSystems) {
      options.availableFileSystems = this.addFileSchemaIfNeeded(schema, options.canSelectFolders);
    }
    return this.pickResource(options);
  }
  getSimpleFileDialog() {
    return this.instantiationService.createInstance(SimpleFileDialog);
  }
  pickResource(options) {
    return this.getSimpleFileDialog().showOpenDialog(options);
  }
  saveRemoteResource(options) {
    return this.getSimpleFileDialog().showSaveDialog(options);
  }
  /**
   * Checks whether the given resource is a remote user data file
   * that should not be used as a default file dialog path candidate.
   * This covers remote user data files such as settings.json, keybindings.json, etc.
   */
  async isRemoteUserData(resource) {
    if (!this.environmentService.remoteAuthority) {
      return false;
    }
    const remoteEnv = await this.remoteAgentService.getEnvironment();
    if (remoteEnv) {
      const remoteDataHome = resources.dirname(resources.dirname(remoteEnv.settingsPath));
      if (!resources.isEqual(remoteDataHome, remoteDataHome.with({ path: "/" })) && resources.isEqualOrParent(resource, remoteDataHome)) {
        return true;
      }
    }
    return false;
  }
  getSchemeFilterForWindow(defaultUriScheme) {
    return defaultUriScheme ?? this.pathService.defaultUriScheme;
  }
  getAuthorityFilterForWindow() {
    return this.environmentService.remoteAuthority;
  }
  getFileSystemSchema(options) {
    return options.availableFileSystems?.[0] || this.getSchemeFilterForWindow(options.defaultUri?.scheme);
  }
  getWorkspaceAvailableFileSystems(options) {
    if (options.availableFileSystems && options.availableFileSystems.length > 0) {
      return options.availableFileSystems;
    }
    const availableFileSystems = [Schemas.file];
    if (this.environmentService.remoteAuthority) {
      availableFileSystems.unshift(Schemas.vscodeRemote);
    }
    return availableFileSystems;
  }
  getPickFileToSaveDialogOptions(defaultUri, availableFileSystems) {
    const options = {
      defaultUri,
      title: nls.localize("saveAsTitle", "Save As"),
      availableFileSystems
    };
    const ext = defaultUri ? resources.extname(defaultUri) : void 0;
    let matchingFilter;
    const registeredLanguageNames = this.languageService.getSortedRegisteredLanguageNames();
    const registeredLanguageFilters = coalesce(registeredLanguageNames.map(({ languageName, languageId }) => {
      const extensions = this.languageService.getExtensions(languageId);
      if (!extensions.length) {
        return null;
      }
      const filter = { name: languageName, extensions: distinct(extensions).slice(0, 10).map((e) => trim(e, ".")) };
      const extOrPlaintext = ext || PLAINTEXT_EXTENSION;
      if (!matchingFilter && extensions.includes(extOrPlaintext)) {
        matchingFilter = filter;
        const trimmedExt = trim(extOrPlaintext, ".");
        if (!filter.extensions.includes(trimmedExt)) {
          filter.extensions.unshift(trimmedExt);
        }
        return null;
      }
      return filter;
    }));
    if (!matchingFilter && ext) {
      matchingFilter = { name: trim(ext, ".").toUpperCase(), extensions: [trim(ext, ".")] };
    }
    options.filters = coalesce([
      { name: nls.localize("allFiles", "All Files"), extensions: ["*"] },
      matchingFilter,
      ...registeredLanguageFilters,
      { name: nls.localize("noExt", "No Extension"), extensions: [""] }
    ]);
    return options;
  }
};
AbstractFileDialogService = __decorateClass([
  __decorateParam(0, IHostService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IHistoryService),
  __decorateParam(3, IWorkbenchEnvironmentService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, ILanguageService),
  __decorateParam(10, IWorkspacesService),
  __decorateParam(11, ILabelService),
  __decorateParam(12, IPathService),
  __decorateParam(13, ICommandService),
  __decorateParam(14, IEditorService),
  __decorateParam(15, ICodeEditorService),
  __decorateParam(16, ILogService),
  __decorateParam(17, IRemoteAgentService)
], AbstractFileDialogService);
export {
  AbstractFileDialogService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxkaWFsb2dzXFxicm93c2VyXFxhYnN0cmFjdEZpbGVEaWFsb2dTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJV2luZG93T3BlbmFibGUsIGlzV29ya3NwYWNlVG9PcGVuLCBpc0ZpbGVUb09wZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJUGlja0FuZE9wZW5PcHRpb25zLCBJU2F2ZURpYWxvZ09wdGlvbnMsIElPcGVuRGlhbG9nT3B0aW9ucywgRmlsZUZpbHRlciwgSUZpbGVEaWFsb2dTZXJ2aWNlLCBJRGlhbG9nU2VydmljZSwgQ29uZmlybVJlc3VsdCwgZ2V0RmlsZU5hbWVzTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgaXNTYXZlZFdvcmtzcGFjZSwgaXNUZW1wb3JhcnlXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUsIFdPUktTUEFDRV9FWFRFTlNJT04gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzQWJzb2x1dGUgYXMgbG9jYWxQYXRoSXNBYnNvbHV0ZSwgbm9ybWFsaXplIGFzIGxvY2FsUGF0aE5vcm1hbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVNpbXBsZUZpbGVEaWFsb2csIFNpbXBsZUZpbGVEaWFsb2cgfSBmcm9tICcuL3NpbXBsZUZpbGVEaWFsb2cuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSwgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgdHJpbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0VYVEVOU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvck9wZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEZpbGVEaWFsb2dTZXJ2aWNlIGltcGxlbWVudHMgSUZpbGVEaWFsb2dTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUhvc3RTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElIaXN0b3J5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaGlzdG9yeVNlcnZpY2U6IElIaXN0b3J5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlc1NlcnZpY2U6IElXb3Jrc3BhY2VzU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZVxuXHQpIHsgfVxuXG5cdGFzeW5jIGRlZmF1bHRGaWxlUGF0aChzY2hlbWVGaWx0ZXIgPSB0aGlzLmdldFNjaGVtZUZpbHRlckZvcldpbmRvdygpLCBhdXRob3JpdHlGaWx0ZXIgPSB0aGlzLmdldEF1dGhvcml0eUZpbHRlckZvcldpbmRvdygpKTogUHJvbWlzZTxVUkk+IHtcblxuXHRcdC8vIENoZWNrIGZvciBsYXN0IGFjdGl2ZSBmaWxlIGZpcnN0Li4uXG5cdFx0bGV0IGNhbmRpZGF0ZSA9IHRoaXMuaGlzdG9yeVNlcnZpY2UuZ2V0TGFzdEFjdGl2ZUZpbGUoc2NoZW1lRmlsdGVyLCBhdXRob3JpdHlGaWx0ZXIpO1xuXG5cdFx0Ly8gU2tpcCB1c2VyIGRhdGEgZmlsZXMgKGUuZy4gTWFjaGluZS9zZXR0aW5ncy5qc29uKSBhcyBkZWZhdWx0IHBhdGggY2FuZGlkYXRlc1xuXHRcdGlmIChjYW5kaWRhdGUgJiYgYXdhaXQgdGhpcy5pc1JlbW90ZVVzZXJEYXRhKGNhbmRpZGF0ZSkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0ZpbGVEaWFsb2dTZXJ2aWNlXSBTa2lwcGluZyBsYXN0IGFjdGl2ZSBmaWxlIGFzIGl0IGlzIGEgcmVtb3RlIHVzZXIgZGF0YSByZXNvdXJjZTogJHtjYW5kaWRhdGV9YCk7XG5cdFx0XHRjYW5kaWRhdGUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gLi4udGhlbiBmb3IgbGFzdCBhY3RpdmUgZmlsZSByb290XG5cdFx0aWYgKCFjYW5kaWRhdGUpIHtcblx0XHRcdGNhbmRpZGF0ZSA9IHRoaXMuaGlzdG9yeVNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVdvcmtzcGFjZVJvb3Qoc2NoZW1lRmlsdGVyLCBhdXRob3JpdHlGaWx0ZXIpO1xuXHRcdFx0aWYgKGNhbmRpZGF0ZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtGaWxlRGlhbG9nU2VydmljZV0gRGVmYXVsdCBmaWxlIHBhdGggdXNpbmcgbGFzdCBhY3RpdmUgd29ya3NwYWNlIHJvb3Q6ICR7Y2FuZGlkYXRlfWApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtGaWxlRGlhbG9nU2VydmljZV0gRGVmYXVsdCBmaWxlIHBhdGggdXNpbmcgcGFyZW50IG9mIGxhc3QgYWN0aXZlIGZpbGU6ICR7Y2FuZGlkYXRlfWApO1xuXHRcdFx0Y2FuZGlkYXRlID0gcmVzb3VyY2VzLmRpcm5hbWUoY2FuZGlkYXRlKTtcblx0XHR9XG5cblx0XHRpZiAoIWNhbmRpZGF0ZSkge1xuXHRcdFx0Y2FuZGlkYXRlID0gYXdhaXQgdGhpcy5wcmVmZXJyZWRIb21lKHNjaGVtZUZpbHRlcik7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtGaWxlRGlhbG9nU2VydmljZV0gRGVmYXVsdCBmaWxlIHBhdGggdXNpbmcgcHJlZmVycmVkIGhvbWU6ICR7Y2FuZGlkYXRlfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiBjYW5kaWRhdGU7XG5cdH1cblxuXHRhc3luYyBkZWZhdWx0Rm9sZGVyUGF0aChzY2hlbWVGaWx0ZXIgPSB0aGlzLmdldFNjaGVtZUZpbHRlckZvcldpbmRvdygpLCBhdXRob3JpdHlGaWx0ZXIgPSB0aGlzLmdldEF1dGhvcml0eUZpbHRlckZvcldpbmRvdygpKTogUHJvbWlzZTxVUkk+IHtcblxuXHRcdC8vIENoZWNrIGZvciBsYXN0IGFjdGl2ZSBmaWxlIHJvb3QgZmlyc3QuLi5cblx0XHRsZXQgY2FuZGlkYXRlID0gdGhpcy5oaXN0b3J5U2VydmljZS5nZXRMYXN0QWN0aXZlV29ya3NwYWNlUm9vdChzY2hlbWVGaWx0ZXIsIGF1dGhvcml0eUZpbHRlcik7XG5cblx0XHQvLyAuLi50aGVuIGZvciBsYXN0IGFjdGl2ZSBmaWxlXG5cdFx0aWYgKCFjYW5kaWRhdGUpIHtcblx0XHRcdGNhbmRpZGF0ZSA9IHRoaXMuaGlzdG9yeVNlcnZpY2UuZ2V0TGFzdEFjdGl2ZUZpbGUoc2NoZW1lRmlsdGVyLCBhdXRob3JpdHlGaWx0ZXIpO1xuXG5cdFx0XHQvLyBTa2lwIHVzZXIgZGF0YSBmaWxlcyAoZS5nLiBNYWNoaW5lL3NldHRpbmdzLmpzb24pIGFzIGRlZmF1bHQgcGF0aCBjYW5kaWRhdGVzXG5cdFx0XHRpZiAoY2FuZGlkYXRlICYmIGF3YWl0IHRoaXMuaXNSZW1vdGVVc2VyRGF0YShjYW5kaWRhdGUpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0ZpbGVEaWFsb2dTZXJ2aWNlXSBTa2lwcGluZyBsYXN0IGFjdGl2ZSBmaWxlIGFzIGl0IGlzIGEgcmVtb3RlIHVzZXIgZGF0YSByZXNvdXJjZTogJHtjYW5kaWRhdGV9YCk7XG5cdFx0XHRcdGNhbmRpZGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNhbmRpZGF0ZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtGaWxlRGlhbG9nU2VydmljZV0gRGVmYXVsdCBmb2xkZXIgcGF0aCB1c2luZyBwYXJlbnQgb2YgbGFzdCBhY3RpdmUgZmlsZTogJHtjYW5kaWRhdGV9YCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0ZpbGVEaWFsb2dTZXJ2aWNlXSBEZWZhdWx0IGZvbGRlciBwYXRoIHVzaW5nIGxhc3QgYWN0aXZlIHdvcmtzcGFjZSByb290OiAke2NhbmRpZGF0ZX1gKTtcblx0XHR9XG5cblx0XHRpZiAoIWNhbmRpZGF0ZSkge1xuXHRcdFx0Y29uc3QgcHJlZmVycmVkSG9tZSA9IGF3YWl0IHRoaXMucHJlZmVycmVkSG9tZShzY2hlbWVGaWx0ZXIpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbRmlsZURpYWxvZ1NlcnZpY2VdIERlZmF1bHQgZm9sZGVyIHBhdGggdXNpbmcgcHJlZmVycmVkIGhvbWU6ICR7cHJlZmVycmVkSG9tZX1gKTtcblx0XHRcdHJldHVybiBwcmVmZXJyZWRIb21lO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXNvdXJjZXMuZGlybmFtZShjYW5kaWRhdGUpO1xuXHR9XG5cblx0YXN5bmMgcHJlZmVycmVkSG9tZShzY2hlbWVGaWx0ZXIgPSB0aGlzLmdldFNjaGVtZUZpbHRlckZvcldpbmRvdygpKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCBwcmVmZXJMb2NhbCA9IHNjaGVtZUZpbHRlciA9PT0gU2NoZW1hcy5maWxlO1xuXHRcdGNvbnN0IHByZWZlcnJlZEhvbWVDb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8c3RyaW5nPignZmlsZXMuZGlhbG9nLmRlZmF1bHRQYXRoJyk7XG5cdFx0Y29uc3QgcHJlZmVycmVkSG9tZUNhbmRpZGF0ZSA9IHByZWZlckxvY2FsID8gcHJlZmVycmVkSG9tZUNvbmZpZy51c2VyTG9jYWxWYWx1ZSA6IHByZWZlcnJlZEhvbWVDb25maWcudXNlclJlbW90ZVZhbHVlO1xuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0ZpbGVEaWFsb2dTZXJ2aWNlXSBQcmVmZXJyZWQgaG9tZTogcHJlZmVyTG9jYWw9JHtwcmVmZXJMb2NhbH0sIHVzZXJMb2NhbFZhbHVlPSR7cHJlZmVycmVkSG9tZUNvbmZpZy51c2VyTG9jYWxWYWx1ZX0sIHVzZXJSZW1vdGVWYWx1ZT0ke3ByZWZlcnJlZEhvbWVDb25maWcudXNlclJlbW90ZVZhbHVlfWApO1xuXHRcdGlmIChwcmVmZXJyZWRIb21lQ2FuZGlkYXRlKSB7XG5cdFx0XHRjb25zdCBpc1ByZWZlcnJlZEhvbWVDYW5kaWRhdGVBYnNvbHV0ZSA9IHByZWZlckxvY2FsID8gbG9jYWxQYXRoSXNBYnNvbHV0ZShwcmVmZXJyZWRIb21lQ2FuZGlkYXRlKSA6IChhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLnBhdGgpLmlzQWJzb2x1dGUocHJlZmVycmVkSG9tZUNhbmRpZGF0ZSk7XG5cdFx0XHRpZiAoaXNQcmVmZXJyZWRIb21lQ2FuZGlkYXRlQWJzb2x1dGUpIHtcblx0XHRcdFx0Y29uc3QgcHJlZmVycmVkSG9tZU5vcm1hbGl6ZWQgPSBwcmVmZXJMb2NhbCA/IGxvY2FsUGF0aE5vcm1hbGl6ZShwcmVmZXJyZWRIb21lQ2FuZGlkYXRlKSA6IChhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLnBhdGgpLm5vcm1hbGl6ZShwcmVmZXJyZWRIb21lQ2FuZGlkYXRlKTtcblx0XHRcdFx0Y29uc3QgcHJlZmVycmVkSG9tZSA9IHJlc291cmNlcy50b0xvY2FsUmVzb3VyY2UoYXdhaXQgdGhpcy5wYXRoU2VydmljZS5maWxlVVJJKHByZWZlcnJlZEhvbWVOb3JtYWxpemVkKSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5LCB0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWUpO1xuXHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMocHJlZmVycmVkSG9tZSkpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtGaWxlRGlhbG9nU2VydmljZV0gUHJlZmVycmVkIGhvbWUgdXNpbmcgZmlsZXMuZGlhbG9nLmRlZmF1bHRQYXRoIHNldHRpbmc6ICR7cHJlZmVycmVkSG9tZX1gKTtcblx0XHRcdFx0XHRyZXR1cm4gcHJlZmVycmVkSG9tZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtGaWxlRGlhbG9nU2VydmljZV0gUHJlZmVycmVkIGhvbWUgZmlsZXMuZGlhbG9nLmRlZmF1bHRQYXRoIHBhdGggZG9lcyBub3QgZXhpc3Q6ICR7cHJlZmVycmVkSG9tZX1gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0ZpbGVEaWFsb2dTZXJ2aWNlXSBQcmVmZXJyZWQgaG9tZSBmaWxlcy5kaWFsb2cuZGVmYXVsdFBhdGggaXMgbm90IGFic29sdXRlOiAke3ByZWZlcnJlZEhvbWVDYW5kaWRhdGV9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXNlckhvbWUgPSB0aGlzLnBhdGhTZXJ2aWNlLnVzZXJIb21lKHsgcHJlZmVyTG9jYWwgfSk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbRmlsZURpYWxvZ1NlcnZpY2VdIFByZWZlcnJlZCBob21lIHVzaW5nIHVzZXIgaG9tZTogJHt1c2VySG9tZX1gKTtcblx0XHRyZXR1cm4gdXNlckhvbWU7XG5cdH1cblxuXHRhc3luYyBkZWZhdWx0V29ya3NwYWNlUGF0aChzY2hlbWVGaWx0ZXIgPSB0aGlzLmdldFNjaGVtZUZpbHRlckZvcldpbmRvdygpKTogUHJvbWlzZTxVUkk+IHtcblx0XHRsZXQgZGVmYXVsdFdvcmtzcGFjZVBhdGg6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIENoZWNrIGZvciBjdXJyZW50IHdvcmtzcGFjZSBjb25maWcgZmlsZSBmaXJzdC4uLlxuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSkge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuY29uZmlndXJhdGlvbjtcblx0XHRcdGlmIChjb25maWd1cmF0aW9uPy5zY2hlbWUgPT09IHNjaGVtZUZpbHRlciAmJiBpc1NhdmVkV29ya3NwYWNlKGNvbmZpZ3VyYXRpb24sIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlKSAmJiAhaXNUZW1wb3JhcnlXb3Jrc3BhY2UoY29uZmlndXJhdGlvbikpIHtcblx0XHRcdFx0ZGVmYXVsdFdvcmtzcGFjZVBhdGggPSByZXNvdXJjZXMuZGlybmFtZShjb25maWd1cmF0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyAuLi50aGVuIGZhbGxiYWNrIHRvIGRlZmF1bHQgZmlsZSBwYXRoXG5cdFx0aWYgKCFkZWZhdWx0V29ya3NwYWNlUGF0aCkge1xuXHRcdFx0ZGVmYXVsdFdvcmtzcGFjZVBhdGggPSBhd2FpdCB0aGlzLmRlZmF1bHRGaWxlUGF0aChzY2hlbWVGaWx0ZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBkZWZhdWx0V29ya3NwYWNlUGF0aDtcblx0fVxuXG5cdGFzeW5jIHNob3dTYXZlQ29uZmlybShmaWxlTmFtZXNPclJlc291cmNlczogKHN0cmluZyB8IFVSSSlbXSk6IFByb21pc2U8Q29uZmlybVJlc3VsdD4ge1xuXHRcdGlmICh0aGlzLnNraXBEaWFsb2dzKCkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRmlsZURpYWxvZ1NlcnZpY2U6IHJlZnVzZWQgdG8gc2hvdyBzYXZlIGNvbmZpcm1hdGlvbiBkaWFsb2cgaW4gdGVzdHMuJyk7XG5cblx0XHRcdC8vIG5vIHZldG8gd2hlbiB3ZSBhcmUgaW4gZXh0ZW5zaW9uIGRldiB0ZXN0aW5nIG1vZGUgYmVjYXVzZSB3ZSBjYW5ub3QgYXNzdW1lIHdlIHJ1biBpbnRlcmFjdGl2ZVxuXHRcdFx0cmV0dXJuIENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRvU2hvd1NhdmVDb25maXJtKGZpbGVOYW1lc09yUmVzb3VyY2VzKTtcblx0fVxuXG5cdHByaXZhdGUgc2tpcERpYWxvZ3MoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmVuYWJsZVNtb2tlVGVzdERyaXZlcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ0RpYWxvZ1NlcnZpY2U6IERpYWxvZyByZXF1ZXN0ZWQgZHVyaW5nIHNtb2tlIHRlc3QuJyk7XG5cdFx0fVxuXHRcdC8vIGludGVncmF0aW9uIHRlc3RzXG5cdFx0cmV0dXJuIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQgJiYgISF0aGlzLmVudmlyb25tZW50U2VydmljZS5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1Nob3dTYXZlQ29uZmlybShmaWxlTmFtZXNPclJlc291cmNlczogKHN0cmluZyB8IFVSSSlbXSk6IFByb21pc2U8Q29uZmlybVJlc3VsdD4ge1xuXHRcdGlmIChmaWxlTmFtZXNPclJlc291cmNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBDb25maXJtUmVzdWx0LkRPTlRfU0FWRTtcblx0XHR9XG5cblx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXHRcdGxldCBkZXRhaWwgPSBubHMubG9jYWxpemUoJ3NhdmVDaGFuZ2VzRGV0YWlsJywgXCJZb3VyIGNoYW5nZXMgd2lsbCBiZSBsb3N0IGlmIHlvdSBkb24ndCBzYXZlIHRoZW0uXCIpO1xuXHRcdGlmIChmaWxlTmFtZXNPclJlc291cmNlcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3NhdmVDaGFuZ2VzTWVzc2FnZScsIFwiRG8geW91IHdhbnQgdG8gc2F2ZSB0aGUgY2hhbmdlcyB5b3UgbWFkZSB0byB7MH0/XCIsIHR5cGVvZiBmaWxlTmFtZXNPclJlc291cmNlc1swXSA9PT0gJ3N0cmluZycgPyBmaWxlTmFtZXNPclJlc291cmNlc1swXSA6IHJlc291cmNlcy5iYXNlbmFtZShmaWxlTmFtZXNPclJlc291cmNlc1swXSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdzYXZlQ2hhbmdlc01lc3NhZ2VzJywgXCJEbyB5b3Ugd2FudCB0byBzYXZlIHRoZSBjaGFuZ2VzIHRvIHRoZSBmb2xsb3dpbmcgezB9IGZpbGVzP1wiLCBmaWxlTmFtZXNPclJlc291cmNlcy5sZW5ndGgpO1xuXHRcdFx0ZGV0YWlsID0gZ2V0RmlsZU5hbWVzTWVzc2FnZShmaWxlTmFtZXNPclJlc291cmNlcykgKyAnXFxuJyArIGRldGFpbDtcblx0XHR9XG5cblx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdDxDb25maXJtUmVzdWx0Pih7XG5cdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdGRldGFpbCxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBmaWxlTmFtZXNPclJlc291cmNlcy5sZW5ndGggPiAxID9cblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSh7IGtleTogJ3NhdmVBbGwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTYXZlIEFsbFwiKSA6XG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoeyBrZXk6ICdzYXZlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmU2F2ZVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IENvbmZpcm1SZXN1bHQuU0FWRVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSh7IGtleTogJ2RvbnRTYXZlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkRvJiZuJ3QgU2F2ZVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFXG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0cnVuOiAoKSA9PiBDb25maXJtUmVzdWx0LkNBTkNFTFxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByb3RlY3RlZCBhZGRGaWxlU2NoZW1hSWZOZWVkZWQoc2NoZW1hOiBzdHJpbmcsIF9pc0ZvbGRlcj86IGJvb2xlYW4pOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHNjaGVtYSA9PT0gU2NoZW1hcy51bnRpdGxlZCA/IFtTY2hlbWFzLmZpbGVdIDogKHNjaGVtYSAhPT0gU2NoZW1hcy5maWxlID8gW3NjaGVtYSwgU2NoZW1hcy5maWxlXSA6IFtzY2hlbWFdKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBwaWNrRmlsZUZvbGRlckFuZE9wZW5TaW1wbGlmaWVkKHNjaGVtYTogc3RyaW5nLCBvcHRpb25zOiBJUGlja0FuZE9wZW5PcHRpb25zLCBwcmVmZXJOZXdXaW5kb3c6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0aXRsZSA9IG5scy5sb2NhbGl6ZSgnb3BlbkZpbGVPckZvbGRlci50aXRsZScsICdPcGVuIEZpbGUgb3IgRm9sZGVyJyk7XG5cdFx0Y29uc3QgYXZhaWxhYmxlRmlsZVN5c3RlbXMgPSB0aGlzLmFkZEZpbGVTY2hlbWFJZk5lZWRlZChzY2hlbWEpO1xuXG5cdFx0Y29uc3QgdXJpcyA9IGF3YWl0IHRoaXMucGlja1Jlc291cmNlKHsgY2FuU2VsZWN0RmlsZXM6IHRydWUsIGNhblNlbGVjdEZvbGRlcnM6IHRydWUsIGNhblNlbGVjdE1hbnk6IGZhbHNlLCBkZWZhdWx0VXJpOiBvcHRpb25zLmRlZmF1bHRVcmksIHRpdGxlLCBhdmFpbGFibGVGaWxlU3lzdGVtcyB9KTtcblx0XHRjb25zdCB1cmkgPSB1cmlzPy5bMF07XG5cblx0XHRpZiAodXJpKSB7XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KHVyaSk7XG5cblx0XHRcdGNvbnN0IHRvT3BlbjogSVdpbmRvd09wZW5hYmxlID0gc3RhdC5pc0RpcmVjdG9yeSA/IHsgZm9sZGVyVXJpOiB1cmkgfSA6IHsgZmlsZVVyaTogdXJpIH07XG5cdFx0XHRpZiAoIWlzV29ya3NwYWNlVG9PcGVuKHRvT3BlbikgJiYgaXNGaWxlVG9PcGVuKHRvT3BlbikpIHtcblx0XHRcdFx0dGhpcy5hZGRGaWxlVG9SZWNlbnRseU9wZW5lZCh0b09wZW4uZmlsZVVyaSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5IHx8IG9wdGlvbnMuZm9yY2VOZXdXaW5kb3cgfHwgcHJlZmVyTmV3V2luZG93KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuaG9zdFNlcnZpY2Uub3BlbldpbmRvdyhbdG9PcGVuXSwgeyBmb3JjZU5ld1dpbmRvdzogb3B0aW9ucy5mb3JjZU5ld1dpbmRvdywgcmVtb3RlQXV0aG9yaXR5OiBvcHRpb25zLnJlbW90ZUF1dGhvcml0eSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9ycyhbeyByZXNvdXJjZTogdXJpLCBvcHRpb25zOiB7IHNvdXJjZTogRWRpdG9yT3BlblNvdXJjZS5VU0VSLCBwaW5uZWQ6IHRydWUgfSB9XSwgdW5kZWZpbmVkLCB7IHZhbGlkYXRlVHJ1c3Q6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHBpY2tGaWxlQW5kT3BlblNpbXBsaWZpZWQoc2NoZW1hOiBzdHJpbmcsIG9wdGlvbnM6IElQaWNrQW5kT3Blbk9wdGlvbnMsIHByZWZlck5ld1dpbmRvdzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRpdGxlID0gbmxzLmxvY2FsaXplKCdvcGVuRmlsZS50aXRsZScsICdPcGVuIEZpbGUnKTtcblx0XHRjb25zdCBhdmFpbGFibGVGaWxlU3lzdGVtcyA9IHRoaXMuYWRkRmlsZVNjaGVtYUlmTmVlZGVkKHNjaGVtYSk7XG5cblx0XHRjb25zdCB1cmlzID0gYXdhaXQgdGhpcy5waWNrUmVzb3VyY2UoeyBjYW5TZWxlY3RGaWxlczogdHJ1ZSwgY2FuU2VsZWN0Rm9sZGVyczogZmFsc2UsIGNhblNlbGVjdE1hbnk6IGZhbHNlLCBkZWZhdWx0VXJpOiBvcHRpb25zLmRlZmF1bHRVcmksIHRpdGxlLCBhdmFpbGFibGVGaWxlU3lzdGVtcyB9KTtcblx0XHRjb25zdCB1cmkgPSB1cmlzPy5bMF07XG5cdFx0aWYgKHVyaSkge1xuXHRcdFx0dGhpcy5hZGRGaWxlVG9SZWNlbnRseU9wZW5lZCh1cmkpO1xuXG5cdFx0XHRpZiAob3B0aW9ucy5mb3JjZU5ld1dpbmRvdyB8fCBwcmVmZXJOZXdXaW5kb3cpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5ob3N0U2VydmljZS5vcGVuV2luZG93KFt7IGZpbGVVcmk6IHVyaSB9XSwgeyBmb3JjZU5ld1dpbmRvdzogb3B0aW9ucy5mb3JjZU5ld1dpbmRvdywgcmVtb3RlQXV0aG9yaXR5OiBvcHRpb25zLnJlbW90ZUF1dGhvcml0eSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9ycyhbeyByZXNvdXJjZTogdXJpLCBvcHRpb25zOiB7IHNvdXJjZTogRWRpdG9yT3BlblNvdXJjZS5VU0VSLCBwaW5uZWQ6IHRydWUgfSB9XSwgdW5kZWZpbmVkLCB7IHZhbGlkYXRlVHJ1c3Q6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFkZEZpbGVUb1JlY2VudGx5T3BlbmVkKHVyaTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy53b3Jrc3BhY2VzU2VydmljZS5hZGRSZWNlbnRseU9wZW5lZChbeyBmaWxlVXJpOiB1cmksIGxhYmVsOiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh1cmksIHsgYXBwZW5kV29ya3NwYWNlU3VmZml4OiB0cnVlIH0pIH1dKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBwaWNrRm9sZGVyQW5kT3BlblNpbXBsaWZpZWQoc2NoZW1hOiBzdHJpbmcsIG9wdGlvbnM6IElQaWNrQW5kT3Blbk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0aXRsZSA9IG5scy5sb2NhbGl6ZSgnb3BlbkZvbGRlci50aXRsZScsICdPcGVuIEZvbGRlcicpO1xuXHRcdGNvbnN0IGF2YWlsYWJsZUZpbGVTeXN0ZW1zID0gdGhpcy5hZGRGaWxlU2NoZW1hSWZOZWVkZWQoc2NoZW1hLCB0cnVlKTtcblxuXHRcdGNvbnN0IHVyaXMgPSBhd2FpdCB0aGlzLnBpY2tSZXNvdXJjZSh7IGNhblNlbGVjdEZpbGVzOiBmYWxzZSwgY2FuU2VsZWN0Rm9sZGVyczogdHJ1ZSwgY2FuU2VsZWN0TWFueTogZmFsc2UsIGRlZmF1bHRVcmk6IG9wdGlvbnMuZGVmYXVsdFVyaSwgdGl0bGUsIGF2YWlsYWJsZUZpbGVTeXN0ZW1zIH0pO1xuXHRcdGNvbnN0IHVyaSA9IHVyaXM/LlswXTtcblx0XHRpZiAodXJpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ob3N0U2VydmljZS5vcGVuV2luZG93KFt7IGZvbGRlclVyaTogdXJpIH1dLCB7IGZvcmNlTmV3V2luZG93OiBvcHRpb25zLmZvcmNlTmV3V2luZG93LCByZW1vdGVBdXRob3JpdHk6IG9wdGlvbnMucmVtb3RlQXV0aG9yaXR5IH0pO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBwaWNrV29ya3NwYWNlQW5kT3BlblNpbXBsaWZpZWQoc2NoZW1hOiBzdHJpbmcsIG9wdGlvbnM6IElQaWNrQW5kT3Blbk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0aXRsZSA9IG5scy5sb2NhbGl6ZSgnb3BlbldvcmtzcGFjZS50aXRsZScsICdPcGVuIFdvcmtzcGFjZSBmcm9tIEZpbGUnKTtcblx0XHRjb25zdCBmaWx0ZXJzOiBGaWxlRmlsdGVyW10gPSBbeyBuYW1lOiBubHMubG9jYWxpemUoJ2ZpbHRlck5hbWUud29ya3NwYWNlJywgJ1dvcmtzcGFjZScpLCBleHRlbnNpb25zOiBbV09SS1NQQUNFX0VYVEVOU0lPTl0gfV07XG5cdFx0Y29uc3QgYXZhaWxhYmxlRmlsZVN5c3RlbXMgPSB0aGlzLmFkZEZpbGVTY2hlbWFJZk5lZWRlZChzY2hlbWEsIHRydWUpO1xuXG5cdFx0Y29uc3QgdXJpcyA9IGF3YWl0IHRoaXMucGlja1Jlc291cmNlKHsgY2FuU2VsZWN0RmlsZXM6IHRydWUsIGNhblNlbGVjdEZvbGRlcnM6IGZhbHNlLCBjYW5TZWxlY3RNYW55OiBmYWxzZSwgZGVmYXVsdFVyaTogb3B0aW9ucy5kZWZhdWx0VXJpLCB0aXRsZSwgZmlsdGVycywgYXZhaWxhYmxlRmlsZVN5c3RlbXMgfSk7XG5cdFx0Y29uc3QgdXJpID0gdXJpcz8uWzBdO1xuXHRcdGlmICh1cmkpIHtcblx0XHRcdHJldHVybiB0aGlzLmhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coW3sgd29ya3NwYWNlVXJpOiB1cmkgfV0sIHsgZm9yY2VOZXdXaW5kb3c6IG9wdGlvbnMuZm9yY2VOZXdXaW5kb3csIHJlbW90ZUF1dGhvcml0eTogb3B0aW9ucy5yZW1vdGVBdXRob3JpdHkgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHBpY2tGaWxlVG9TYXZlU2ltcGxpZmllZChzY2hlbWE6IHN0cmluZywgb3B0aW9uczogSVNhdmVEaWFsb2dPcHRpb25zKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIW9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMpIHtcblx0XHRcdG9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMgPSB0aGlzLmFkZEZpbGVTY2hlbWFJZk5lZWRlZChzY2hlbWEpO1xuXHRcdH1cblxuXHRcdG9wdGlvbnMudGl0bGUgPSBubHMubG9jYWxpemUoJ3NhdmVGaWxlQXMudGl0bGUnLCAnU2F2ZSBBcycpO1xuXHRcdGNvbnN0IHVyaSA9IGF3YWl0IHRoaXMuc2F2ZVJlbW90ZVJlc291cmNlKG9wdGlvbnMpO1xuXG5cdFx0aWYgKHVyaSkge1xuXHRcdFx0dGhpcy5hZGRGaWxlVG9SZWNlbnRseU9wZW5lZCh1cmkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1cmk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgc2hvd1NhdmVEaWFsb2dTaW1wbGlmaWVkKHNjaGVtYTogc3RyaW5nLCBvcHRpb25zOiBJU2F2ZURpYWxvZ09wdGlvbnMpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghb3B0aW9ucy5hdmFpbGFibGVGaWxlU3lzdGVtcykge1xuXHRcdFx0b3B0aW9ucy5hdmFpbGFibGVGaWxlU3lzdGVtcyA9IHRoaXMuYWRkRmlsZVNjaGVtYUlmTmVlZGVkKHNjaGVtYSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2F2ZVJlbW90ZVJlc291cmNlKG9wdGlvbnMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHNob3dPcGVuRGlhbG9nU2ltcGxpZmllZChzY2hlbWE6IHN0cmluZywgb3B0aW9uczogSU9wZW5EaWFsb2dPcHRpb25zKTogUHJvbWlzZTxVUklbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghb3B0aW9ucy5hdmFpbGFibGVGaWxlU3lzdGVtcykge1xuXHRcdFx0b3B0aW9ucy5hdmFpbGFibGVGaWxlU3lzdGVtcyA9IHRoaXMuYWRkRmlsZVNjaGVtYUlmTmVlZGVkKHNjaGVtYSwgb3B0aW9ucy5jYW5TZWxlY3RGb2xkZXJzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5waWNrUmVzb3VyY2Uob3B0aW9ucyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0U2ltcGxlRmlsZURpYWxvZygpOiBJU2ltcGxlRmlsZURpYWxvZyB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2ltcGxlRmlsZURpYWxvZyk7XG5cdH1cblxuXHRwcml2YXRlIHBpY2tSZXNvdXJjZShvcHRpb25zOiBJT3BlbkRpYWxvZ09wdGlvbnMpOiBQcm9taXNlPFVSSVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U2ltcGxlRmlsZURpYWxvZygpLnNob3dPcGVuRGlhbG9nKG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlUmVtb3RlUmVzb3VyY2Uob3B0aW9uczogSVNhdmVEaWFsb2dPcHRpb25zKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTaW1wbGVGaWxlRGlhbG9nKCkuc2hvd1NhdmVEaWFsb2cob3B0aW9ucyk7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2tzIHdoZXRoZXIgdGhlIGdpdmVuIHJlc291cmNlIGlzIGEgcmVtb3RlIHVzZXIgZGF0YSBmaWxlXG5cdCAqIHRoYXQgc2hvdWxkIG5vdCBiZSB1c2VkIGFzIGEgZGVmYXVsdCBmaWxlIGRpYWxvZyBwYXRoIGNhbmRpZGF0ZS5cblx0ICogVGhpcyBjb3ZlcnMgcmVtb3RlIHVzZXIgZGF0YSBmaWxlcyBzdWNoIGFzIHNldHRpbmdzLmpzb24sIGtleWJpbmRpbmdzLmpzb24sIGV0Yy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgaXNSZW1vdGVVc2VyRGF0YShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCF0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCByZW1vdGVFbnYgPSBhd2FpdCB0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdGlmIChyZW1vdGVFbnYpIHtcblxuXHRcdFx0Y29uc3QgcmVtb3RlRGF0YUhvbWUgPSByZXNvdXJjZXMuZGlybmFtZShyZXNvdXJjZXMuZGlybmFtZShyZW1vdGVFbnYuc2V0dGluZ3NQYXRoKSk7XG5cdFx0XHRpZiAoIXJlc291cmNlcy5pc0VxdWFsKHJlbW90ZURhdGFIb21lLCByZW1vdGVEYXRhSG9tZS53aXRoKHsgcGF0aDogJy8nIH0pKSAmJiByZXNvdXJjZXMuaXNFcXVhbE9yUGFyZW50KHJlc291cmNlLCByZW1vdGVEYXRhSG9tZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTY2hlbWVGaWx0ZXJGb3JXaW5kb3coZGVmYXVsdFVyaVNjaGVtZT86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGRlZmF1bHRVcmlTY2hlbWUgPz8gdGhpcy5wYXRoU2VydmljZS5kZWZhdWx0VXJpU2NoZW1lO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBdXRob3JpdHlGaWx0ZXJGb3JXaW5kb3coKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEZpbGVTeXN0ZW1TY2hlbWEob3B0aW9uczogeyBhdmFpbGFibGVGaWxlU3lzdGVtcz86IHJlYWRvbmx5IHN0cmluZ1tdOyBkZWZhdWx0VXJpPzogVVJJIH0pOiBzdHJpbmcge1xuXHRcdHJldHVybiBvcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zPy5bMF0gfHwgdGhpcy5nZXRTY2hlbWVGaWx0ZXJGb3JXaW5kb3cob3B0aW9ucy5kZWZhdWx0VXJpPy5zY2hlbWUpO1xuXHR9XG5cblx0YWJzdHJhY3QgcGlja0ZpbGVGb2xkZXJBbmRPcGVuKG9wdGlvbnM6IElQaWNrQW5kT3Blbk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRhYnN0cmFjdCBwaWNrRmlsZUFuZE9wZW4ob3B0aW9uczogSVBpY2tBbmRPcGVuT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cdGFic3RyYWN0IHBpY2tGb2xkZXJBbmRPcGVuKG9wdGlvbnM6IElQaWNrQW5kT3Blbk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRhYnN0cmFjdCBwaWNrV29ya3NwYWNlQW5kT3BlbihvcHRpb25zOiBJUGlja0FuZE9wZW5PcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIGdldFdvcmtzcGFjZUF2YWlsYWJsZUZpbGVTeXN0ZW1zKG9wdGlvbnM6IElQaWNrQW5kT3Blbk9wdGlvbnMpOiBzdHJpbmdbXSB7XG5cdFx0aWYgKG9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMgJiYgKG9wdGlvbnMuYXZhaWxhYmxlRmlsZVN5c3RlbXMubGVuZ3RoID4gMCkpIHtcblx0XHRcdHJldHVybiBvcHRpb25zLmF2YWlsYWJsZUZpbGVTeXN0ZW1zO1xuXHRcdH1cblx0XHRjb25zdCBhdmFpbGFibGVGaWxlU3lzdGVtcyA9IFtTY2hlbWFzLmZpbGVdO1xuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdGF2YWlsYWJsZUZpbGVTeXN0ZW1zLnVuc2hpZnQoU2NoZW1hcy52c2NvZGVSZW1vdGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gYXZhaWxhYmxlRmlsZVN5c3RlbXM7XG5cdH1cblx0YWJzdHJhY3Qgc2hvd1NhdmVEaWFsb2cob3B0aW9uczogSVNhdmVEaWFsb2dPcHRpb25zKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+O1xuXHRhYnN0cmFjdCBzaG93T3BlbkRpYWxvZyhvcHRpb25zOiBJT3BlbkRpYWxvZ09wdGlvbnMpOiBQcm9taXNlPFVSSVtdIHwgdW5kZWZpbmVkPjtcblxuXHRhYnN0cmFjdCBwaWNrRmlsZVRvU2F2ZShkZWZhdWx0VXJpOiBVUkksIGF2YWlsYWJsZUZpbGVTeXN0ZW1zPzogc3RyaW5nW10pOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD47XG5cblx0cHJvdGVjdGVkIGdldFBpY2tGaWxlVG9TYXZlRGlhbG9nT3B0aW9ucyhkZWZhdWx0VXJpOiBVUkksIGF2YWlsYWJsZUZpbGVTeXN0ZW1zPzogc3RyaW5nW10pOiBJU2F2ZURpYWxvZ09wdGlvbnMge1xuXHRcdGNvbnN0IG9wdGlvbnM6IElTYXZlRGlhbG9nT3B0aW9ucyA9IHtcblx0XHRcdGRlZmF1bHRVcmksXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzYXZlQXNUaXRsZScsIFwiU2F2ZSBBc1wiKSxcblx0XHRcdGF2YWlsYWJsZUZpbGVTeXN0ZW1zXG5cdFx0fTtcblxuXHRcdGludGVyZmFjZSBJRmlsdGVyIHsgbmFtZTogc3RyaW5nOyBleHRlbnNpb25zOiBzdHJpbmdbXSB9XG5cblx0XHQvLyBCdWlsZCB0aGUgZmlsZSBmaWx0ZXIgYnkgdXNpbmcgb3VyIGtub3duIGxhbmd1YWdlc1xuXHRcdGNvbnN0IGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkID0gZGVmYXVsdFVyaSA/IHJlc291cmNlcy5leHRuYW1lKGRlZmF1bHRVcmkpIDogdW5kZWZpbmVkO1xuXHRcdGxldCBtYXRjaGluZ0ZpbHRlcjogSUZpbHRlciB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHJlZ2lzdGVyZWRMYW5ndWFnZU5hbWVzID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0U29ydGVkUmVnaXN0ZXJlZExhbmd1YWdlTmFtZXMoKTtcblx0XHRjb25zdCByZWdpc3RlcmVkTGFuZ3VhZ2VGaWx0ZXJzOiBJRmlsdGVyW10gPSBjb2FsZXNjZShyZWdpc3RlcmVkTGFuZ3VhZ2VOYW1lcy5tYXAoKHsgbGFuZ3VhZ2VOYW1lLCBsYW5ndWFnZUlkIH0pID0+IHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSB0aGlzLmxhbmd1YWdlU2VydmljZS5nZXRFeHRlbnNpb25zKGxhbmd1YWdlSWQpO1xuXHRcdFx0aWYgKCFleHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmlsdGVyOiBJRmlsdGVyID0geyBuYW1lOiBsYW5ndWFnZU5hbWUsIGV4dGVuc2lvbnM6IGRpc3RpbmN0KGV4dGVuc2lvbnMpLnNsaWNlKDAsIDEwKS5tYXAoZSA9PiB0cmltKGUsICcuJykpIH07XG5cblx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTU4NjBcblx0XHRcdGNvbnN0IGV4dE9yUGxhaW50ZXh0ID0gZXh0IHx8IFBMQUlOVEVYVF9FWFRFTlNJT047XG5cdFx0XHRpZiAoIW1hdGNoaW5nRmlsdGVyICYmIGV4dGVuc2lvbnMuaW5jbHVkZXMoZXh0T3JQbGFpbnRleHQpKSB7XG5cdFx0XHRcdG1hdGNoaW5nRmlsdGVyID0gZmlsdGVyO1xuXG5cdFx0XHRcdC8vIFRoZSBzZWxlY3RlZCBleHRlbnNpb24gbXVzdCBiZSBpbiB0aGUgc2V0IG9mIGV4dGVuc2lvbnMgdGhhdCBhcmUgaW4gdGhlIGZpbHRlciBsaXN0IHRoYXQgaXMgc2VudCB0byB0aGUgc2F2ZSBkaWFsb2cuXG5cdFx0XHRcdC8vIElmIGl0IGlzbid0LCBhZGQgaXQgbWFudWFsbHkuIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNDc2NTdcblx0XHRcdFx0Y29uc3QgdHJpbW1lZEV4dCA9IHRyaW0oZXh0T3JQbGFpbnRleHQsICcuJyk7XG5cdFx0XHRcdGlmICghZmlsdGVyLmV4dGVuc2lvbnMuaW5jbHVkZXModHJpbW1lZEV4dCkpIHtcblx0XHRcdFx0XHRmaWx0ZXIuZXh0ZW5zaW9ucy51bnNoaWZ0KHRyaW1tZWRFeHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIG51bGw7IC8vIGZpcnN0IG1hdGNoaW5nIGZpbHRlciB3aWxsIGJlIGFkZGVkIHRvIHRoZSB0b3Bcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZpbHRlcjtcblx0XHR9KSk7XG5cblx0XHQvLyBXZSBoYXZlIG5vIG1hdGNoaW5nIGZpbHRlciwgZS5nLiBiZWNhdXNlIHRoZSBsYW5ndWFnZVxuXHRcdC8vIGlzIHVua25vd24uIFdlIHN0aWxsIGFkZCB0aGUgZXh0ZW5zaW9uIHRvIHRoZSBsaXN0IG9mXG5cdFx0Ly8gZmlsdGVycyB0aG91Z2ggc28gdGhhdCBpdCBjYW4gYmUgcGlja2VkXG5cdFx0Ly8gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85NjI4Mylcblx0XHRpZiAoIW1hdGNoaW5nRmlsdGVyICYmIGV4dCkge1xuXHRcdFx0bWF0Y2hpbmdGaWx0ZXIgPSB7IG5hbWU6IHRyaW0oZXh0LCAnLicpLnRvVXBwZXJDYXNlKCksIGV4dGVuc2lvbnM6IFt0cmltKGV4dCwgJy4nKV0gfTtcblx0XHR9XG5cblx0XHQvLyBPcmRlciBvZiBmaWx0ZXJzIGlzXG5cdFx0Ly8gLSBBbGwgRmlsZXMgKHdlIE1VU1QgZG8gdGhpcyB0byBmaXggbWFjT1MgaXNzdWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwMjcxMylcblx0XHQvLyAtIEZpbGUgRXh0ZW5zaW9uIE1hdGNoIChpZiBhbnkpXG5cdFx0Ly8gLSBBbGwgTGFuZ3VhZ2VzXG5cdFx0Ly8gLSBObyBFeHRlbnNpb25cblx0XHRvcHRpb25zLmZpbHRlcnMgPSBjb2FsZXNjZShbXG5cdFx0XHR7IG5hbWU6IG5scy5sb2NhbGl6ZSgnYWxsRmlsZXMnLCBcIkFsbCBGaWxlc1wiKSwgZXh0ZW5zaW9uczogWycqJ10gfSxcblx0XHRcdG1hdGNoaW5nRmlsdGVyLFxuXHRcdFx0Li4ucmVnaXN0ZXJlZExhbmd1YWdlRmlsdGVycyxcblx0XHRcdHsgbmFtZTogbmxzLmxvY2FsaXplKCdub0V4dCcsIFwiTm8gRXh0ZW5zaW9uXCIpLCBleHRlbnNpb25zOiBbJyddIH1cblx0XHRdKTtcblxuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUEwQixtQkFBbUIsb0JBQW9CO0FBQ2pFLFNBQXNHLGdCQUFnQixlQUFlLDJCQUEyQjtBQUNoSyxTQUFTLGtCQUFrQixzQkFBc0IsMEJBQTBCLGdCQUFnQiwyQkFBMkI7QUFDdEgsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQ0FBb0M7QUFFN0MsWUFBWSxlQUFlO0FBQzNCLFNBQVMsY0FBYyxxQkFBcUIsYUFBYSwwQkFBMEI7QUFDbkYsU0FBUyw2QkFBOEI7QUFDdkMsU0FBNEIsd0JBQXdCO0FBQ3BELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0JBQW9CO0FBQzdCLE9BQU8sY0FBYztBQUNyQixTQUFTLFVBQVUsZ0JBQWdCO0FBQ25DLFNBQVMsWUFBWTtBQUNyQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQjtB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QUFDdEYsVUFBTSw0QkFBdUMsU0FBUyx3QkFBd0IsSUFBSSxDQUFDLEVBQUUsY0FBYyxXQUFXLE1BQU07QUFDbkgsWUFBTSxhQUFhLEtBQUssZ0JBQWdCLGNBQWMsVUFBVTtBQUNoRSxVQUFJLENBQUMsV0FBVyxRQUFRO0FBQ3ZCLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxTQUFrQixFQUFFLE1BQU0sY0FBYyxZQUFZLFNBQVMsVUFBVSxFQUFFLE1BQU0sR0FBRyxFQUFFLEVBQUUsSUFBSSxPQUFLLEtBQUssR0FBRyxHQUFHLENBQUMsRUFBRTtBQUduSCxZQUFNLGlCQUFpQixPQUFPO0FBQzlCLFVBQUksQ0FBQyxrQkFBa0IsV0FBVyxTQUFTLGNBQWMsR0FBRztBQUMzRCx5QkFBaUI7QUFJakIsY0FBTSxhQUFhLEtBQUssZ0JBQWdCLEdBQUc7QUFDM0MsWUFBSSxDQUFDLE9BQU8sV0FBVyxTQUFTLFVBQVUsR0FBRztBQUM1QyxpQkFBTyxXQUFXLFFBQVEsVUFBVTtBQUFBLFFBQ3JDO0FBRUEsZUFBTztBQUFBLE1BQ1I7QUFFQSxhQUFPO0FBQUEsSUFDUixDQUFDLENBQUM7QUFNRixRQUFJLENBQUMsa0JBQWtCLEtBQUs7QUFDM0IsdUJBQWlCLEVBQUUsTUFBTSxLQUFLLEtBQUssR0FBRyxFQUFFLFlBQVksR0FBRyxZQUFZLENBQUMsS0FBSyxLQUFLLEdBQUcsQ0FBQyxFQUFFO0FBQUEsSUFDckY7QUFPQSxZQUFRLFVBQVUsU0FBUztBQUFBLE1BQzFCLEVBQUUsTUFBTSxJQUFJLFNBQVMsWUFBWSxXQUFXLEdBQUcsWUFBWSxDQUFDLEdBQUcsRUFBRTtBQUFBLE1BQ2pFO0FBQUEsTUFDQSxHQUFHO0FBQUEsTUFDSCxFQUFFLE1BQU0sSUFBSSxTQUFTLFNBQVMsY0FBYyxHQUFHLFlBQVksQ0FBQyxFQUFFLEVBQUU7QUFBQSxJQUNqRSxDQUFDO0FBRUQsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQWhhc0IsNEJBQWY7QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXRCbUI7IiwKICAibmFtZXMiOiBbXQp9Cg==
