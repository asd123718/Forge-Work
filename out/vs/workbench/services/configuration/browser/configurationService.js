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
import { URI } from "../../../../base/common/uri.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { equals } from "../../../../base/common/objects.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Queue, Barrier, Promises, Delayer, Throttler } from "../../../../base/common/async.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { IWorkspaceContextService, Workspace as BaseWorkspace, WorkbenchState, toWorkspaceFolder, isWorkspaceFolder, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from "../../../../platform/workspace/common/workspace.js";
import { ConfigurationModel, ConfigurationChangeEvent, mergeChanges } from "../../../../platform/configuration/common/configurationModels.js";
import { ConfigurationTarget, isConfigurationOverrides, ConfigurationTargetToString, isConfigurationUpdateOverrides, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { NullPolicyConfiguration, PolicyConfiguration } from "../../../../platform/configuration/common/configurations.js";
import { Configuration } from "../common/configurationModels.js";
import { FOLDER_CONFIG_FOLDER_NAME, defaultSettingsSchemaId, userSettingsSchemaId, workspaceSettingsSchemaId, folderSettingsSchemaId, machineSettingsSchemaId, LOCAL_MACHINE_SCOPES, PROFILE_SCOPES, LOCAL_MACHINE_PROFILE_SCOPES, profileSettingsSchemaId, APPLY_ALL_PROFILES_SETTING, APPLICATION_SCOPES } from "../common/configuration.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions, allSettings, windowSettings, resourceSettings, applicationSettings, machineSettings, machineOverridableSettings, ConfigurationScope, keyFromOverrideIdentifiers, OVERRIDE_PROPERTY_PATTERN, resourceLanguageSettingsSchemaId, configurationDefaultsSchemaId, applicationMachineSettings, isConfigurationDefaultSourceEquals } from "../../../../platform/configuration/common/configurationRegistry.js";
import { isStoredWorkspaceFolder, getStoredWorkspaceFolder, toWorkspaceFolders } from "../../../../platform/workspaces/common/workspaces.js";
import { ConfigurationEditing, EditableConfigurationTarget } from "../common/configurationEditing.js";
import { WorkspaceConfiguration, FolderConfiguration, RemoteUserConfiguration, UserConfiguration, DefaultConfiguration, ApplicationConfiguration } from "./configuration.js";
import { mark } from "../../../../base/common/performance.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { WorkbenchPhase, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { delta, distinct, equals as arrayEquals } from "../../../../base/common/arrays.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IWorkbenchAssignmentService } from "../../assignment/common/assignmentService.js";
import { isUndefined } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { NullPolicyService } from "../../../../platform/policy/common/policy.js";
import { IJSONEditingService } from "../common/jsonEditing.js";
import { workbenchConfigurationNodeBase } from "../../../common/configuration.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { runWhenWindowIdle } from "../../../../base/browser/dom.js";
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { fixSettingLinks } from "../../preferences/common/preferencesModels.js";
function getLocalUserConfigurationScopes(userDataProfile, hasRemote) {
  const isDefaultProfile = userDataProfile.isDefault || userDataProfile.useDefaultFlags?.settings;
  if (isDefaultProfile) {
    return hasRemote ? LOCAL_MACHINE_SCOPES : void 0;
  }
  return hasRemote ? LOCAL_MACHINE_PROFILE_SCOPES : PROFILE_SCOPES;
}
class Workspace extends BaseWorkspace {
  constructor() {
    super(...arguments);
    this.initialized = false;
  }
}
class WorkspaceService extends Disposable {
  constructor({ remoteAuthority, configurationCache }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, logService, policyService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.fileService = fileService;
    this.remoteAgentService = remoteAgentService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this.initialized = false;
    this.applicationConfiguration = null;
    this.remoteUserConfiguration = null;
    this.cachedFolderConfigs = this._register(new DisposableMap(new ResourceMap()));
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this._onWillChangeWorkspaceFolders = this._register(new Emitter());
    this.onWillChangeWorkspaceFolders = this._onWillChangeWorkspaceFolders.event;
    this._onDidChangeWorkspaceFolders = this._register(new Emitter());
    this.onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;
    this._onDidChangeWorkspaceName = this._register(new Emitter());
    this.onDidChangeWorkspaceName = this._onDidChangeWorkspaceName.event;
    this._onDidChangeWorkbenchState = this._register(new Emitter());
    this.onDidChangeWorkbenchState = this._onDidChangeWorkbenchState.event;
    this.isWorkspaceTrusted = true;
    this._restrictedSettings = { default: [] };
    this._onDidChangeRestrictedSettings = this._register(new Emitter());
    this.onDidChangeRestrictedSettings = this._onDidChangeRestrictedSettings.event;
    this.configurationRegistry = Registry.as(Extensions.Configuration);
    this.initRemoteUserConfigurationBarrier = new Barrier();
    this.completeWorkspaceBarrier = new Barrier();
    this.defaultConfiguration = this._register(new DefaultConfiguration(userDataProfileService.currentProfile.id, configurationCache, environmentService, logService));
    this.policyConfiguration = policyService instanceof NullPolicyService ? new NullPolicyConfiguration() : this._register(new PolicyConfiguration(this.defaultConfiguration, policyService, logService));
    this.configurationCache = configurationCache;
    this._configuration = new Configuration(this.defaultConfiguration.configurationModel, this.policyConfiguration.configurationModel, ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), new ResourceMap(), ConfigurationModel.createEmptyModel(logService), new ResourceMap(), this.workspace, logService);
    this.applicationConfigurationDisposables = this._register(new DisposableStore());
    this.createApplicationConfiguration();
    this.localUserConfiguration = this._register(new UserConfiguration(userDataProfileService.currentProfile.settingsResource, userDataProfileService.currentProfile.tasksResource, userDataProfileService.currentProfile.mcpResource, { scopes: getLocalUserConfigurationScopes(userDataProfileService.currentProfile, !!remoteAuthority) }, fileService, uriIdentityService, logService));
    this._register(this.localUserConfiguration.onDidChangeConfiguration((userConfiguration) => this.onLocalUserConfigurationChanged(userConfiguration)));
    if (remoteAuthority) {
      const remoteUserConfiguration = this.remoteUserConfiguration = this._register(new RemoteUserConfiguration(remoteAuthority, configurationCache, fileService, uriIdentityService, remoteAgentService, logService));
      this._register(remoteUserConfiguration.onDidInitialize((remoteUserConfigurationModel) => {
        this._register(remoteUserConfiguration.onDidChangeConfiguration((remoteUserConfigurationModel2) => this.onRemoteUserConfigurationChanged(remoteUserConfigurationModel2)));
        this.onRemoteUserConfigurationChanged(remoteUserConfigurationModel);
        this.initRemoteUserConfigurationBarrier.open();
      }));
    } else {
      this.initRemoteUserConfigurationBarrier.open();
    }
    this.workspaceConfiguration = this._register(new WorkspaceConfiguration(configurationCache, fileService, uriIdentityService, logService));
    this._register(this.workspaceConfiguration.onDidUpdateConfiguration((fromCache) => {
      this.onWorkspaceConfigurationChanged(fromCache).then(() => {
        this.workspace.initialized = this.workspaceConfiguration.initialized;
        this.checkAndMarkWorkspaceComplete(fromCache);
      });
    }));
    this._register(this.defaultConfiguration.onDidChangeConfiguration(({ properties, defaults }) => this.onDefaultConfigurationChanged(defaults, properties)));
    this._register(this.policyConfiguration.onDidChangeConfiguration((configurationModel) => this.onPolicyConfigurationChanged(configurationModel)));
    this._register(userDataProfileService.onDidChangeCurrentProfile((e) => this.onUserDataProfileChanged(e)));
    this.workspaceEditingQueue = new Queue();
  }
  get restrictedSettings() {
    return this._restrictedSettings;
  }
  createApplicationConfiguration() {
    this.applicationConfigurationDisposables.clear();
    if (this.userDataProfileService.currentProfile.isDefault || this.userDataProfileService.currentProfile.useDefaultFlags?.settings) {
      this.applicationConfiguration = null;
    } else {
      this.applicationConfiguration = this.applicationConfigurationDisposables.add(this._register(new ApplicationConfiguration(this.userDataProfilesService, this.fileService, this.uriIdentityService, this.logService)));
      this.applicationConfigurationDisposables.add(this.applicationConfiguration.onDidChangeConfiguration((configurationModel) => this.onApplicationConfigurationChanged(configurationModel)));
    }
  }
  // Workspace Context Service Impl
  async getCompleteWorkspace() {
    await this.completeWorkspaceBarrier.wait();
    return this.getWorkspace();
  }
  getWorkspace() {
    return this.workspace;
  }
  getWorkbenchState() {
    if (this.workspace.configuration) {
      return WorkbenchState.WORKSPACE;
    }
    if (this.workspace.folders.length === 1) {
      return WorkbenchState.FOLDER;
    }
    return WorkbenchState.EMPTY;
  }
  hasWorkspaceData() {
    return this.getWorkbenchState() !== WorkbenchState.EMPTY;
  }
  getWorkspaceFolder(resource) {
    return this.workspace.getFolder(resource);
  }
  addFolders(foldersToAdd, index) {
    return this.updateFolders(foldersToAdd, [], index);
  }
  removeFolders(foldersToRemove) {
    return this.updateFolders([], foldersToRemove);
  }
  async updateFolders(foldersToAdd, foldersToRemove, index) {
    return this.workspaceEditingQueue.queue(() => this.doUpdateFolders(foldersToAdd, foldersToRemove, index));
  }
  isInsideWorkspace(resource) {
    return !!this.getWorkspaceFolder(resource);
  }
  isCurrentWorkspace(workspaceIdOrFolder) {
    switch (this.getWorkbenchState()) {
      case WorkbenchState.FOLDER: {
        let folderUri = void 0;
        if (URI.isUri(workspaceIdOrFolder)) {
          folderUri = workspaceIdOrFolder;
        } else if (isSingleFolderWorkspaceIdentifier(workspaceIdOrFolder)) {
          folderUri = workspaceIdOrFolder.uri;
        }
        return URI.isUri(folderUri) && this.uriIdentityService.extUri.isEqual(folderUri, this.workspace.folders[0].uri);
      }
      case WorkbenchState.WORKSPACE:
        return isWorkspaceIdentifier(workspaceIdOrFolder) && this.workspace.id === workspaceIdOrFolder.id;
    }
    return false;
  }
  async doUpdateFolders(foldersToAdd, foldersToRemove, index) {
    if (this.getWorkbenchState() !== WorkbenchState.WORKSPACE) {
      return Promise.resolve(void 0);
    }
    if (foldersToAdd.length + foldersToRemove.length === 0) {
      return Promise.resolve(void 0);
    }
    let foldersHaveChanged = false;
    let currentWorkspaceFolders = this.getWorkspace().folders;
    let newStoredFolders = currentWorkspaceFolders.map((f) => f.raw).filter((folder, index2) => {
      if (!isStoredWorkspaceFolder(folder)) {
        return true;
      }
      return !this.contains(foldersToRemove, currentWorkspaceFolders[index2].uri);
    });
    foldersHaveChanged = currentWorkspaceFolders.length !== newStoredFolders.length;
    if (foldersToAdd.length) {
      const workspaceConfigPath = this.getWorkspace().configuration;
      const workspaceConfigFolder = this.uriIdentityService.extUri.dirname(workspaceConfigPath);
      currentWorkspaceFolders = toWorkspaceFolders(newStoredFolders, workspaceConfigPath, this.uriIdentityService.extUri);
      const currentWorkspaceFolderUris = currentWorkspaceFolders.map((folder) => folder.uri);
      const storedFoldersToAdd = [];
      for (const folderToAdd of foldersToAdd) {
        const folderURI = folderToAdd.uri;
        if (this.contains(currentWorkspaceFolderUris, folderURI)) {
          continue;
        }
        try {
          const result = await this.fileService.stat(folderURI);
          if (!result.isDirectory) {
            continue;
          }
        } catch (e) {
        }
        storedFoldersToAdd.push(getStoredWorkspaceFolder(folderURI, false, folderToAdd.name, workspaceConfigFolder, this.uriIdentityService.extUri));
      }
      if (storedFoldersToAdd.length > 0) {
        foldersHaveChanged = true;
        if (typeof index === "number" && index >= 0 && index < newStoredFolders.length) {
          newStoredFolders = newStoredFolders.slice(0);
          newStoredFolders.splice(index, 0, ...storedFoldersToAdd);
        } else {
          newStoredFolders = [...newStoredFolders, ...storedFoldersToAdd];
        }
      }
    }
    if (foldersHaveChanged) {
      return this.setFolders(newStoredFolders);
    }
    return Promise.resolve(void 0);
  }
  async setFolders(folders) {
    if (!this.instantiationService) {
      throw new Error("Cannot update workspace folders because workspace service is not yet ready to accept writes.");
    }
    await this.instantiationService.invokeFunction((accessor) => this.workspaceConfiguration.setFolders(folders, accessor.get(IJSONEditingService)));
    return this.onWorkspaceConfigurationChanged(false);
  }
  contains(resources, toCheck) {
    return resources.some((resource) => this.uriIdentityService.extUri.isEqual(resource, toCheck));
  }
  // Workspace Configuration Service Impl
  getConfigurationData() {
    return this._configuration.toData();
  }
  getValue(arg1, arg2) {
    const section = typeof arg1 === "string" ? arg1 : void 0;
    const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : void 0;
    return this._configuration.getValue(section, overrides);
  }
  async updateValue(key, value, arg3, arg4, options) {
    const overrides = isConfigurationUpdateOverrides(arg3) ? arg3 : isConfigurationOverrides(arg3) ? { resource: arg3.resource, overrideIdentifiers: arg3.overrideIdentifier ? [arg3.overrideIdentifier] : void 0 } : void 0;
    const target = overrides ? arg4 : arg3;
    const targets = target ? [target] : [];
    if (overrides?.overrideIdentifiers) {
      overrides.overrideIdentifiers = distinct(overrides.overrideIdentifiers);
      overrides.overrideIdentifiers = overrides.overrideIdentifiers.length ? overrides.overrideIdentifiers : void 0;
    }
    if (!targets.length) {
      if (overrides?.overrideIdentifiers && overrides.overrideIdentifiers.length > 1) {
        throw new Error("Configuration Target is required while updating the value for multiple override identifiers");
      }
      const inspect = this.inspect(key, { resource: overrides?.resource, overrideIdentifier: overrides?.overrideIdentifiers ? overrides.overrideIdentifiers[0] : void 0 });
      targets.push(...this.deriveConfigurationTargets(key, value, inspect));
      if (equals(value, inspect.defaultValue) && targets.length === 1 && (targets[0] === ConfigurationTarget.USER || targets[0] === ConfigurationTarget.USER_LOCAL)) {
        value = void 0;
      }
    }
    await Promises.settled(targets.map((target2) => this.writeConfigurationValue(key, value, target2, overrides, options)));
  }
  async reloadConfiguration(target) {
    if (target === void 0) {
      this.reloadDefaultConfiguration();
      const application = await this.reloadApplicationConfiguration(true);
      const { local, remote } = await this.reloadUserConfiguration();
      await this.reloadWorkspaceConfiguration();
      await this.loadConfiguration(application, local, remote, true);
      return;
    }
    if (isWorkspaceFolder(target)) {
      await this.reloadWorkspaceFolderConfiguration(target);
      return;
    }
    switch (target) {
      case ConfigurationTarget.DEFAULT:
        this.reloadDefaultConfiguration();
        return;
      case ConfigurationTarget.USER: {
        const { local, remote } = await this.reloadUserConfiguration();
        await this.loadConfiguration(this._configuration.applicationConfiguration, local, remote, true);
        return;
      }
      case ConfigurationTarget.USER_LOCAL:
        await this.reloadLocalUserConfiguration();
        return;
      case ConfigurationTarget.USER_REMOTE:
        await this.reloadRemoteUserConfiguration();
        return;
      case ConfigurationTarget.WORKSPACE:
      case ConfigurationTarget.WORKSPACE_FOLDER:
        await this.reloadWorkspaceConfiguration();
        return;
    }
  }
  hasCachedConfigurationDefaultsOverrides() {
    return this.defaultConfiguration.hasCachedConfigurationDefaultsOverrides();
  }
  inspect(key, overrides) {
    return this._configuration.inspect(key, overrides);
  }
  keys() {
    return this._configuration.keys();
  }
  async whenRemoteConfigurationLoaded() {
    await this.initRemoteUserConfigurationBarrier.wait();
  }
  /**
   * At present, all workspaces (empty, single-folder, multi-root) in local and remote
   * can be initialized without requiring extension host except following case:
   *
   * A multi root workspace with .code-workspace file that has to be resolved by an extension.
   * Because of readonly `rootPath` property in extension API we have to resolve multi root workspace
   * before extension host starts so that `rootPath` can be set to first folder.
   *
   * This restriction is lifted partially for web in `MainThreadWorkspace`.
   * In web, we start extension host with empty `rootPath` in this case.
   *
   * Related root path issue discussion is being tracked here - https://github.com/microsoft/vscode/issues/69335
   */
  async initialize(arg) {
    mark("code/willInitWorkspaceService");
    const trigger = this.initialized;
    this.initialized = false;
    const workspace = await this.createWorkspace(arg);
    await this.updateWorkspaceAndInitializeConfiguration(workspace, trigger);
    this.checkAndMarkWorkspaceComplete(false);
    mark("code/didInitWorkspaceService");
  }
  updateWorkspaceTrust(trusted) {
    if (this.isWorkspaceTrusted !== trusted) {
      this.isWorkspaceTrusted = trusted;
      const data = this._configuration.toData();
      const folderConfigurationModels = [];
      for (const folder of this.workspace.folders) {
        const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
        let configurationModel;
        if (folderConfiguration) {
          configurationModel = folderConfiguration.updateWorkspaceTrust(this.isWorkspaceTrusted);
          this._configuration.updateFolderConfiguration(folder.uri, configurationModel);
        }
        folderConfigurationModels.push(configurationModel);
      }
      if (this.getWorkbenchState() === WorkbenchState.FOLDER) {
        if (folderConfigurationModels[0]) {
          this._configuration.updateWorkspaceConfiguration(folderConfigurationModels[0]);
        }
      } else {
        this._configuration.updateWorkspaceConfiguration(this.workspaceConfiguration.updateWorkspaceTrust(this.isWorkspaceTrusted));
      }
      this.updateRestrictedSettings();
      let keys = [];
      if (this.restrictedSettings.userLocal) {
        keys.push(...this.restrictedSettings.userLocal);
      }
      if (this.restrictedSettings.userRemote) {
        keys.push(...this.restrictedSettings.userRemote);
      }
      if (this.restrictedSettings.workspace) {
        keys.push(...this.restrictedSettings.workspace);
      }
      this.restrictedSettings.workspaceFolder?.forEach((value) => keys.push(...value));
      keys = distinct(keys);
      if (keys.length) {
        this.triggerConfigurationChange({ keys, overrides: [] }, { data, workspace: this.workspace }, ConfigurationTarget.WORKSPACE);
      }
    }
  }
  acquireInstantiationService(instantiationService) {
    this.instantiationService = instantiationService;
  }
  isSettingAppliedForAllProfiles(key) {
    const scope = this.configurationRegistry.getConfigurationProperties()[key]?.scope;
    if (scope && APPLICATION_SCOPES.includes(scope)) {
      return true;
    }
    const allProfilesSettings = this.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
    return Array.isArray(allProfilesSettings) && allProfilesSettings.includes(key);
  }
  async createWorkspace(arg) {
    if (isWorkspaceIdentifier(arg)) {
      return this.createMultiFolderWorkspace(arg);
    }
    if (isSingleFolderWorkspaceIdentifier(arg)) {
      return this.createSingleFolderWorkspace(arg);
    }
    return this.createEmptyWorkspace(arg);
  }
  async createMultiFolderWorkspace(workspaceIdentifier) {
    await this.workspaceConfiguration.initialize({ id: workspaceIdentifier.id, configPath: workspaceIdentifier.configPath }, this.isWorkspaceTrusted);
    const workspaceConfigPath = workspaceIdentifier.configPath;
    const workspaceFolders = toWorkspaceFolders(this.workspaceConfiguration.getFolders(), workspaceConfigPath, this.uriIdentityService.extUri);
    const workspaceId = workspaceIdentifier.id;
    const workspace = new Workspace(workspaceId, workspaceFolders, this.workspaceConfiguration.isTransient(), workspaceConfigPath, (uri) => this.uriIdentityService.extUri.ignorePathCasing(uri));
    workspace.initialized = this.workspaceConfiguration.initialized;
    return workspace;
  }
  createSingleFolderWorkspace(singleFolderWorkspaceIdentifier) {
    const workspace = new Workspace(singleFolderWorkspaceIdentifier.id, [toWorkspaceFolder(singleFolderWorkspaceIdentifier.uri)], false, null, (uri) => this.uriIdentityService.extUri.ignorePathCasing(uri));
    workspace.initialized = true;
    return workspace;
  }
  createEmptyWorkspace(emptyWorkspaceIdentifier) {
    const workspace = new Workspace(emptyWorkspaceIdentifier.id, [], false, null, (uri) => this.uriIdentityService.extUri.ignorePathCasing(uri));
    workspace.initialized = true;
    return Promise.resolve(workspace);
  }
  checkAndMarkWorkspaceComplete(fromCache) {
    if (!this.completeWorkspaceBarrier.isOpen() && this.workspace.initialized) {
      this.completeWorkspaceBarrier.open();
      this.validateWorkspaceFoldersAndReload(fromCache);
    }
  }
  async updateWorkspaceAndInitializeConfiguration(workspace, trigger) {
    const hasWorkspaceBefore = !!this.workspace;
    let previousState;
    let previousWorkspacePath;
    let previousFolders = [];
    if (hasWorkspaceBefore) {
      previousState = this.getWorkbenchState();
      previousWorkspacePath = this.workspace.configuration ? this.workspace.configuration.fsPath : void 0;
      previousFolders = this.workspace.folders;
      this.workspace.update(workspace);
    } else {
      this.workspace = workspace;
    }
    await this.initializeConfiguration(trigger);
    if (hasWorkspaceBefore) {
      const newState = this.getWorkbenchState();
      if (previousState && newState !== previousState) {
        this._onDidChangeWorkbenchState.fire(newState);
      }
      const newWorkspacePath = this.workspace.configuration ? this.workspace.configuration.fsPath : void 0;
      if (previousWorkspacePath && newWorkspacePath !== previousWorkspacePath || newState !== previousState) {
        this._onDidChangeWorkspaceName.fire();
      }
      const folderChanges = this.compareFolders(previousFolders, this.workspace.folders);
      if (folderChanges && (folderChanges.added.length || folderChanges.removed.length || folderChanges.changed.length)) {
        await this.handleWillChangeWorkspaceFolders(folderChanges, false);
        this._onDidChangeWorkspaceFolders.fire(folderChanges);
      }
    }
    if (!this.localUserConfiguration.hasTasksLoaded) {
      this._register(runWhenWindowIdle(mainWindow, () => this.reloadLocalUserConfiguration(false, this._configuration.localUserConfiguration)));
    }
  }
  compareFolders(currentFolders, newFolders) {
    const result = { added: [], removed: [], changed: [] };
    result.added = newFolders.filter((newFolder) => !currentFolders.some((currentFolder) => newFolder.uri.toString() === currentFolder.uri.toString()));
    for (let currentIndex = 0; currentIndex < currentFolders.length; currentIndex++) {
      const currentFolder = currentFolders[currentIndex];
      let newIndex = 0;
      for (newIndex = 0; newIndex < newFolders.length && currentFolder.uri.toString() !== newFolders[newIndex].uri.toString(); newIndex++) {
      }
      if (newIndex < newFolders.length) {
        if (currentIndex !== newIndex || currentFolder.name !== newFolders[newIndex].name) {
          result.changed.push(currentFolder);
        }
      } else {
        result.removed.push(currentFolder);
      }
    }
    return result;
  }
  async initializeConfiguration(trigger) {
    await this.defaultConfiguration.initialize();
    const initPolicyConfigurationPromise = this.policyConfiguration.initialize();
    const initApplicationConfigurationPromise = this.applicationConfiguration ? this.applicationConfiguration.initialize() : Promise.resolve(ConfigurationModel.createEmptyModel(this.logService));
    const initUserConfiguration = async () => {
      mark("code/willInitUserConfiguration");
      const result = await Promise.all([this.localUserConfiguration.initialize(), this.remoteUserConfiguration ? this.remoteUserConfiguration.initialize() : Promise.resolve(ConfigurationModel.createEmptyModel(this.logService))]);
      if (this.applicationConfiguration) {
        const applicationConfigurationModel = await initApplicationConfigurationPromise;
        result[0] = this.localUserConfiguration.reparse({ exclude: applicationConfigurationModel.getValue(APPLY_ALL_PROFILES_SETTING) });
      }
      mark("code/didInitUserConfiguration");
      return result;
    };
    const [, application, [local, remote]] = await Promise.all([
      initPolicyConfigurationPromise,
      initApplicationConfigurationPromise,
      initUserConfiguration()
    ]);
    mark("code/willInitWorkspaceConfiguration");
    await this.loadConfiguration(application, local, remote, trigger);
    mark("code/didInitWorkspaceConfiguration");
  }
  reloadDefaultConfiguration() {
    this.onDefaultConfigurationChanged(this.defaultConfiguration.reload());
  }
  async reloadApplicationConfiguration(donotTrigger) {
    if (!this.applicationConfiguration) {
      return ConfigurationModel.createEmptyModel(this.logService);
    }
    const model = await this.applicationConfiguration.loadConfiguration();
    if (!donotTrigger) {
      this.onApplicationConfigurationChanged(model);
    }
    return model;
  }
  async reloadUserConfiguration() {
    const [local, remote] = await Promise.all([this.reloadLocalUserConfiguration(true), this.reloadRemoteUserConfiguration(true)]);
    return { local, remote };
  }
  async reloadLocalUserConfiguration(donotTrigger, settingsConfiguration) {
    const model = await this.localUserConfiguration.reload(settingsConfiguration);
    if (!donotTrigger) {
      this.onLocalUserConfigurationChanged(model);
    }
    return model;
  }
  async reloadRemoteUserConfiguration(donotTrigger) {
    if (this.remoteUserConfiguration) {
      const model = await this.remoteUserConfiguration.reload();
      if (!donotTrigger) {
        this.onRemoteUserConfigurationChanged(model);
      }
      return model;
    }
    return ConfigurationModel.createEmptyModel(this.logService);
  }
  async reloadWorkspaceConfiguration() {
    const workbenchState = this.getWorkbenchState();
    if (workbenchState === WorkbenchState.FOLDER) {
      return this.onWorkspaceFolderConfigurationChanged(this.workspace.folders[0]);
    }
    if (workbenchState === WorkbenchState.WORKSPACE) {
      return this.workspaceConfiguration.reload().then(() => this.onWorkspaceConfigurationChanged(false));
    }
  }
  reloadWorkspaceFolderConfiguration(folder) {
    return this.onWorkspaceFolderConfigurationChanged(folder);
  }
  async loadConfiguration(applicationConfigurationModel, userConfigurationModel, remoteUserConfigurationModel, trigger) {
    this.cachedFolderConfigs.clearAndDisposeAll();
    const folders = this.workspace.folders;
    const folderConfigurations = await this.loadFolderConfigurations(folders);
    const workspaceConfiguration = this.getWorkspaceConfigurationModel(folderConfigurations);
    const folderConfigurationModels = new ResourceMap();
    folderConfigurations.forEach((folderConfiguration, index) => folderConfigurationModels.set(folders[index].uri, folderConfiguration));
    const currentConfiguration = this._configuration;
    this._configuration = new Configuration(this.defaultConfiguration.configurationModel, this.policyConfiguration.configurationModel, applicationConfigurationModel, userConfigurationModel, remoteUserConfigurationModel, workspaceConfiguration, folderConfigurationModels, ConfigurationModel.createEmptyModel(this.logService), new ResourceMap(), this.workspace, this.logService);
    this.initialized = true;
    if (trigger) {
      const change = this._configuration.compare(currentConfiguration);
      this.triggerConfigurationChange(change, { data: currentConfiguration.toData(), workspace: this.workspace }, ConfigurationTarget.WORKSPACE);
    }
    this.updateRestrictedSettings();
  }
  getWorkspaceConfigurationModel(folderConfigurations) {
    switch (this.getWorkbenchState()) {
      case WorkbenchState.FOLDER:
        return folderConfigurations[0];
      case WorkbenchState.WORKSPACE:
        return this.workspaceConfiguration.getConfiguration();
      default:
        return ConfigurationModel.createEmptyModel(this.logService);
    }
  }
  onUserDataProfileChanged(e) {
    e.join((async () => {
      const promises = [];
      promises.push(this.localUserConfiguration.reset(e.profile.settingsResource, e.profile.tasksResource, e.profile.mcpResource, { scopes: getLocalUserConfigurationScopes(e.profile, !!this.remoteUserConfiguration) }));
      if (e.previous.isDefault !== e.profile.isDefault || !!e.previous.useDefaultFlags?.settings !== !!e.profile.useDefaultFlags?.settings) {
        this.createApplicationConfiguration();
        if (this.applicationConfiguration) {
          promises.push(this.reloadApplicationConfiguration(true));
        }
      }
      let [localUser, application] = await Promise.all(promises);
      application = application ?? this._configuration.applicationConfiguration;
      if (this.applicationConfiguration) {
        localUser = this.localUserConfiguration.reparse({ exclude: application.getValue(APPLY_ALL_PROFILES_SETTING) });
      }
      await this.loadConfiguration(application, localUser, this._configuration.remoteUserConfiguration, true);
    })());
  }
  onDefaultConfigurationChanged(configurationModel, properties) {
    if (this.workspace) {
      const previousData = this._configuration.toData();
      const change = this._configuration.compareAndUpdateDefaultConfiguration(configurationModel, properties);
      if (this.applicationConfiguration) {
        this._configuration.updateApplicationConfiguration(this.applicationConfiguration.reparse());
      }
      if (this.remoteUserConfiguration) {
        this._configuration.updateLocalUserConfiguration(this.localUserConfiguration.reparse());
        this._configuration.updateRemoteUserConfiguration(this.remoteUserConfiguration.reparse());
      }
      if (this.getWorkbenchState() === WorkbenchState.FOLDER) {
        const folderConfiguration = this.cachedFolderConfigs.get(this.workspace.folders[0].uri);
        if (folderConfiguration) {
          this._configuration.updateWorkspaceConfiguration(folderConfiguration.reparse());
          this._configuration.updateFolderConfiguration(this.workspace.folders[0].uri, folderConfiguration.reparse());
        }
      } else {
        this._configuration.updateWorkspaceConfiguration(this.workspaceConfiguration.reparseWorkspaceSettings());
        for (const folder of this.workspace.folders) {
          const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
          if (folderConfiguration) {
            this._configuration.updateFolderConfiguration(folder.uri, folderConfiguration.reparse());
          }
        }
      }
      this.triggerConfigurationChange(change, { data: previousData, workspace: this.workspace }, ConfigurationTarget.DEFAULT);
      this.updateRestrictedSettings();
    }
  }
  onPolicyConfigurationChanged(policyConfiguration) {
    const previous = { data: this._configuration.toData(), workspace: this.workspace };
    const change = this._configuration.compareAndUpdatePolicyConfiguration(policyConfiguration);
    this.triggerConfigurationChange(change, previous, ConfigurationTarget.DEFAULT);
  }
  onApplicationConfigurationChanged(applicationConfiguration) {
    const previous = { data: this._configuration.toData(), workspace: this.workspace };
    const previousAllProfilesSettings = this._configuration.applicationConfiguration.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
    const change = this._configuration.compareAndUpdateApplicationConfiguration(applicationConfiguration);
    const currentAllProfilesSettings = this.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
    const configurationProperties = this.configurationRegistry.getConfigurationProperties();
    const changedKeys = [];
    for (const changedKey of change.keys) {
      const scope = configurationProperties[changedKey]?.scope;
      if (scope && APPLICATION_SCOPES.includes(scope)) {
        changedKeys.push(changedKey);
        if (changedKey === APPLY_ALL_PROFILES_SETTING) {
          for (const previousAllProfileSetting of previousAllProfilesSettings) {
            if (!currentAllProfilesSettings.includes(previousAllProfileSetting)) {
              changedKeys.push(previousAllProfileSetting);
            }
          }
          for (const currentAllProfileSetting of currentAllProfilesSettings) {
            if (!previousAllProfilesSettings.includes(currentAllProfileSetting)) {
              changedKeys.push(currentAllProfileSetting);
            }
          }
        }
      } else if (currentAllProfilesSettings.includes(changedKey)) {
        changedKeys.push(changedKey);
      }
    }
    change.keys = changedKeys;
    if (change.keys.includes(APPLY_ALL_PROFILES_SETTING)) {
      this._configuration.updateLocalUserConfiguration(this.localUserConfiguration.reparse({ exclude: currentAllProfilesSettings }));
    }
    this.triggerConfigurationChange(change, previous, ConfigurationTarget.USER);
  }
  onLocalUserConfigurationChanged(userConfiguration) {
    const previous = { data: this._configuration.toData(), workspace: this.workspace };
    const change = this._configuration.compareAndUpdateLocalUserConfiguration(userConfiguration);
    this.triggerConfigurationChange(change, previous, ConfigurationTarget.USER);
  }
  onRemoteUserConfigurationChanged(userConfiguration) {
    const previous = { data: this._configuration.toData(), workspace: this.workspace };
    const change = this._configuration.compareAndUpdateRemoteUserConfiguration(userConfiguration);
    this.triggerConfigurationChange(change, previous, ConfigurationTarget.USER);
  }
  async onWorkspaceConfigurationChanged(fromCache) {
    if (this.workspace && this.workspace.configuration) {
      let newFolders = toWorkspaceFolders(this.workspaceConfiguration.getFolders(), this.workspace.configuration, this.uriIdentityService.extUri);
      if (this.workspace.initialized) {
        const { added, removed, changed } = this.compareFolders(this.workspace.folders, newFolders);
        if (added.length || removed.length || changed.length) {
          newFolders = await this.toValidWorkspaceFolders(newFolders);
        } else {
          newFolders = this.workspace.folders;
        }
      }
      await this.updateWorkspaceConfiguration(newFolders, this.workspaceConfiguration.getConfiguration(), fromCache);
    }
  }
  updateRestrictedSettings() {
    const changed = [];
    const allProperties = this.configurationRegistry.getConfigurationProperties();
    const defaultRestrictedSettings = Object.keys(allProperties).filter((key) => allProperties[key].restricted).sort((a, b) => a.localeCompare(b));
    const defaultDelta = delta(defaultRestrictedSettings, this._restrictedSettings.default, (a, b) => a.localeCompare(b));
    changed.push(...defaultDelta.added, ...defaultDelta.removed);
    const application = (this.applicationConfiguration?.getRestrictedSettings() || []).sort((a, b) => a.localeCompare(b));
    const applicationDelta = delta(application, this._restrictedSettings.application || [], (a, b) => a.localeCompare(b));
    changed.push(...applicationDelta.added, ...applicationDelta.removed);
    const userLocal = this.localUserConfiguration.getRestrictedSettings().sort((a, b) => a.localeCompare(b));
    const userLocalDelta = delta(userLocal, this._restrictedSettings.userLocal || [], (a, b) => a.localeCompare(b));
    changed.push(...userLocalDelta.added, ...userLocalDelta.removed);
    const userRemote = (this.remoteUserConfiguration?.getRestrictedSettings() || []).sort((a, b) => a.localeCompare(b));
    const userRemoteDelta = delta(userRemote, this._restrictedSettings.userRemote || [], (a, b) => a.localeCompare(b));
    changed.push(...userRemoteDelta.added, ...userRemoteDelta.removed);
    const workspaceFolderMap = new ResourceMap();
    for (const workspaceFolder of this.workspace.folders) {
      const cachedFolderConfig = this.cachedFolderConfigs.get(workspaceFolder.uri);
      const folderRestrictedSettings = (cachedFolderConfig?.getRestrictedSettings() || []).sort((a, b) => a.localeCompare(b));
      if (folderRestrictedSettings.length) {
        workspaceFolderMap.set(workspaceFolder.uri, folderRestrictedSettings);
      }
      const previous = this._restrictedSettings.workspaceFolder?.get(workspaceFolder.uri) || [];
      const workspaceFolderDelta = delta(folderRestrictedSettings, previous, (a, b) => a.localeCompare(b));
      changed.push(...workspaceFolderDelta.added, ...workspaceFolderDelta.removed);
    }
    const workspace = this.getWorkbenchState() === WorkbenchState.WORKSPACE ? this.workspaceConfiguration.getRestrictedSettings().sort((a, b) => a.localeCompare(b)) : this.workspace.folders[0] ? workspaceFolderMap.get(this.workspace.folders[0].uri) || [] : [];
    const workspaceDelta = delta(workspace, this._restrictedSettings.workspace || [], (a, b) => a.localeCompare(b));
    changed.push(...workspaceDelta.added, ...workspaceDelta.removed);
    if (changed.length) {
      this._restrictedSettings = {
        default: defaultRestrictedSettings,
        application: application.length ? application : void 0,
        userLocal: userLocal.length ? userLocal : void 0,
        userRemote: userRemote.length ? userRemote : void 0,
        workspace: workspace.length ? workspace : void 0,
        workspaceFolder: workspaceFolderMap.size ? workspaceFolderMap : void 0
      };
      this._onDidChangeRestrictedSettings.fire(this.restrictedSettings);
    }
  }
  async updateWorkspaceConfiguration(workspaceFolders, configuration, fromCache) {
    const previous = { data: this._configuration.toData(), workspace: this.workspace };
    const change = this._configuration.compareAndUpdateWorkspaceConfiguration(configuration);
    const changes = this.compareFolders(this.workspace.folders, workspaceFolders);
    if (changes.added.length || changes.removed.length || changes.changed.length) {
      this.workspace.folders = workspaceFolders;
      const change2 = await this.onFoldersChanged();
      await this.handleWillChangeWorkspaceFolders(changes, fromCache);
      this.triggerConfigurationChange(change2, previous, ConfigurationTarget.WORKSPACE_FOLDER);
      this._onDidChangeWorkspaceFolders.fire(changes);
    } else {
      this.triggerConfigurationChange(change, previous, ConfigurationTarget.WORKSPACE);
    }
    this.updateRestrictedSettings();
  }
  async handleWillChangeWorkspaceFolders(changes, fromCache) {
    const joiners = [];
    this._onWillChangeWorkspaceFolders.fire({
      join(updateWorkspaceTrustStatePromise) {
        joiners.push(updateWorkspaceTrustStatePromise);
      },
      changes,
      fromCache
    });
    try {
      await Promises.settled(joiners);
    } catch (error) {
    }
  }
  async onWorkspaceFolderConfigurationChanged(folder) {
    const [folderConfiguration] = await this.loadFolderConfigurations([folder]);
    const previous = { data: this._configuration.toData(), workspace: this.workspace };
    const folderConfigurationChange = this._configuration.compareAndUpdateFolderConfiguration(folder.uri, folderConfiguration);
    if (this.getWorkbenchState() === WorkbenchState.FOLDER) {
      const workspaceConfigurationChange = this._configuration.compareAndUpdateWorkspaceConfiguration(folderConfiguration);
      this.triggerConfigurationChange(mergeChanges(folderConfigurationChange, workspaceConfigurationChange), previous, ConfigurationTarget.WORKSPACE);
    } else {
      this.triggerConfigurationChange(folderConfigurationChange, previous, ConfigurationTarget.WORKSPACE_FOLDER);
    }
    this.updateRestrictedSettings();
  }
  async onFoldersChanged() {
    const changes = [];
    for (const key of this.cachedFolderConfigs.keys()) {
      if (!this.workspace.folders.filter((folder) => folder.uri.toString() === key.toString())[0]) {
        this.cachedFolderConfigs.deleteAndDispose(key);
        changes.push(this._configuration.compareAndDeleteFolderConfiguration(key));
      }
    }
    const toInitialize = this.workspace.folders.filter((folder) => !this.cachedFolderConfigs.has(folder.uri));
    if (toInitialize.length) {
      const folderConfigurations = await this.loadFolderConfigurations(toInitialize);
      folderConfigurations.forEach((folderConfiguration, index) => {
        changes.push(this._configuration.compareAndUpdateFolderConfiguration(toInitialize[index].uri, folderConfiguration));
      });
    }
    return mergeChanges(...changes);
  }
  loadFolderConfigurations(folders) {
    return Promise.all([...folders.map((folder) => {
      let folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
      if (!folderConfiguration) {
        folderConfiguration = new FolderConfiguration(!this.initialized, folder, FOLDER_CONFIG_FOLDER_NAME, this.getWorkbenchState(), this.isWorkspaceTrusted, this.fileService, this.uriIdentityService, this.logService, this.configurationCache);
        folderConfiguration.addRelated(folderConfiguration.onDidChange(() => this.onWorkspaceFolderConfigurationChanged(folder)));
        this.cachedFolderConfigs.set(folder.uri, folderConfiguration);
      }
      return folderConfiguration.loadConfiguration();
    })]);
  }
  async validateWorkspaceFoldersAndReload(fromCache) {
    const validWorkspaceFolders = await this.toValidWorkspaceFolders(this.workspace.folders);
    const { removed } = this.compareFolders(this.workspace.folders, validWorkspaceFolders);
    if (removed.length) {
      await this.updateWorkspaceConfiguration(validWorkspaceFolders, this.workspaceConfiguration.getConfiguration(), fromCache);
    }
  }
  // Filter out workspace folders which are files (not directories)
  // Workspace folders those cannot be resolved are not filtered because they are handled by the Explorer.
  async toValidWorkspaceFolders(workspaceFolders) {
    const validWorkspaceFolders = [];
    for (const workspaceFolder of workspaceFolders) {
      try {
        const result = await this.fileService.stat(workspaceFolder.uri);
        if (!result.isDirectory) {
          continue;
        }
      } catch (e) {
        this.logService.warn(`Ignoring the error while validating workspace folder ${workspaceFolder.uri.toString()} - ${toErrorMessage(e)}`);
      }
      validWorkspaceFolders.push(workspaceFolder);
    }
    return validWorkspaceFolders;
  }
  async writeConfigurationValue(key, value, target, overrides, options) {
    if (!this.instantiationService) {
      throw new Error("Cannot write configuration because the configuration service is not yet ready to accept writes.");
    }
    if (target === ConfigurationTarget.DEFAULT) {
      throw new Error("Invalid configuration target");
    }
    if (target === ConfigurationTarget.MEMORY) {
      const previous = { data: this._configuration.toData(), workspace: this.workspace };
      this._configuration.updateValue(key, value, overrides);
      this.triggerConfigurationChange({ keys: overrides?.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key], overrides: overrides?.overrideIdentifiers?.length ? overrides.overrideIdentifiers.map((overrideIdentifier) => [overrideIdentifier, [key]]) : [] }, previous, target);
      return;
    }
    const editableConfigurationTarget = this.toEditableConfigurationTarget(target, key);
    if (!editableConfigurationTarget) {
      throw new Error("Invalid configuration target");
    }
    if (editableConfigurationTarget === EditableConfigurationTarget.USER_REMOTE && !this.remoteUserConfiguration) {
      throw new Error("Invalid configuration target");
    }
    if (overrides?.overrideIdentifiers?.length && overrides.overrideIdentifiers.length > 1) {
      const configurationModel = this.getConfigurationModelForEditableConfigurationTarget(editableConfigurationTarget, overrides.resource);
      if (configurationModel) {
        const overrideIdentifiers = overrides.overrideIdentifiers.sort();
        const existingOverrides = configurationModel.overrides.find((override) => arrayEquals([...override.identifiers].sort(), overrideIdentifiers));
        if (existingOverrides) {
          overrides.overrideIdentifiers = existingOverrides.identifiers;
        }
      }
    }
    this.configurationEditing = this.configurationEditing ?? this.createConfigurationEditingService(this.instantiationService);
    await (await this.configurationEditing).writeConfiguration(editableConfigurationTarget, { key, value }, { scopes: overrides, ...options });
    switch (editableConfigurationTarget) {
      case EditableConfigurationTarget.USER_LOCAL:
        if (this.applicationConfiguration && this.isSettingAppliedForAllProfiles(key)) {
          await this.reloadApplicationConfiguration();
        } else {
          await this.reloadLocalUserConfiguration();
        }
        return;
      case EditableConfigurationTarget.USER_REMOTE:
        return this.reloadRemoteUserConfiguration().then(() => void 0);
      case EditableConfigurationTarget.WORKSPACE:
        return this.reloadWorkspaceConfiguration();
      case EditableConfigurationTarget.WORKSPACE_FOLDER: {
        const workspaceFolder = overrides && overrides.resource ? this.workspace.getFolder(overrides.resource) : null;
        if (workspaceFolder) {
          return this.reloadWorkspaceFolderConfiguration(workspaceFolder);
        }
      }
    }
  }
  async createConfigurationEditingService(instantiationService) {
    const remoteSettingsResource = (await this.remoteAgentService.getEnvironment())?.settingsPath ?? null;
    return instantiationService.createInstance(ConfigurationEditing, remoteSettingsResource);
  }
  getConfigurationModelForEditableConfigurationTarget(target, resource) {
    switch (target) {
      case EditableConfigurationTarget.USER_LOCAL:
        return this._configuration.localUserConfiguration;
      case EditableConfigurationTarget.USER_REMOTE:
        return this._configuration.remoteUserConfiguration;
      case EditableConfigurationTarget.WORKSPACE:
        return this._configuration.workspaceConfiguration;
      case EditableConfigurationTarget.WORKSPACE_FOLDER:
        return resource ? this._configuration.folderConfigurations.get(resource) : void 0;
    }
  }
  getConfigurationModel(target, resource) {
    switch (target) {
      case ConfigurationTarget.USER_LOCAL:
        return this._configuration.localUserConfiguration;
      case ConfigurationTarget.USER_REMOTE:
        return this._configuration.remoteUserConfiguration;
      case ConfigurationTarget.WORKSPACE:
        return this._configuration.workspaceConfiguration;
      case ConfigurationTarget.WORKSPACE_FOLDER:
        return resource ? this._configuration.folderConfigurations.get(resource) : void 0;
      default:
        return void 0;
    }
  }
  deriveConfigurationTargets(key, value, inspect) {
    if (equals(value, inspect.value)) {
      return [];
    }
    const definedTargets = [];
    if (inspect.workspaceFolderValue !== void 0) {
      definedTargets.push(ConfigurationTarget.WORKSPACE_FOLDER);
    }
    if (inspect.workspaceValue !== void 0) {
      definedTargets.push(ConfigurationTarget.WORKSPACE);
    }
    if (inspect.userRemoteValue !== void 0) {
      definedTargets.push(ConfigurationTarget.USER_REMOTE);
    }
    if (inspect.userLocalValue !== void 0) {
      definedTargets.push(ConfigurationTarget.USER_LOCAL);
    }
    if (inspect.applicationValue !== void 0) {
      definedTargets.push(ConfigurationTarget.APPLICATION);
    }
    if (value === void 0) {
      return definedTargets;
    }
    return [definedTargets[0] || ConfigurationTarget.USER];
  }
  triggerConfigurationChange(change, previous, target) {
    if (change.keys.length) {
      if (target !== ConfigurationTarget.DEFAULT) {
        this.logService.debug(`Configuration keys changed in ${ConfigurationTargetToString(target)} target`, ...change.keys);
      }
      const configurationChangeEvent = new ConfigurationChangeEvent(change, previous, this._configuration, this.workspace, this.logService);
      configurationChangeEvent.source = target;
      this._onDidChangeConfiguration.fire(configurationChangeEvent);
    }
  }
  toEditableConfigurationTarget(target, key) {
    if (target === ConfigurationTarget.APPLICATION) {
      return EditableConfigurationTarget.USER_LOCAL;
    }
    if (target === ConfigurationTarget.USER) {
      if (this.remoteUserConfiguration) {
        const scope = this.configurationRegistry.getConfigurationProperties()[key]?.scope;
        if (scope === ConfigurationScope.MACHINE || scope === ConfigurationScope.MACHINE_OVERRIDABLE || scope === ConfigurationScope.APPLICATION_MACHINE) {
          return EditableConfigurationTarget.USER_REMOTE;
        }
        if (this.inspect(key).userRemoteValue !== void 0) {
          return EditableConfigurationTarget.USER_REMOTE;
        }
      }
      return EditableConfigurationTarget.USER_LOCAL;
    }
    if (target === ConfigurationTarget.USER_LOCAL) {
      return EditableConfigurationTarget.USER_LOCAL;
    }
    if (target === ConfigurationTarget.USER_REMOTE) {
      return EditableConfigurationTarget.USER_REMOTE;
    }
    if (target === ConfigurationTarget.WORKSPACE) {
      return EditableConfigurationTarget.WORKSPACE;
    }
    if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
      return EditableConfigurationTarget.WORKSPACE_FOLDER;
    }
    return null;
  }
}
let RegisterConfigurationSchemasContribution = class extends Disposable {
  constructor(workspaceContextService, environmentService, workspaceTrustManagementService, extensionService, lifecycleService) {
    super();
    this.workspaceContextService = workspaceContextService;
    this.environmentService = environmentService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    extensionService.whenInstalledExtensionsRegistered().then(() => {
      this.registerConfigurationSchemas();
      const configurationRegistry2 = Registry.as(Extensions.Configuration);
      const delayer = this._register(new Delayer(50));
      this._register(Event.any(configurationRegistry2.onDidUpdateConfiguration, configurationRegistry2.onDidSchemaChange, workspaceTrustManagementService.onDidChangeTrust)(() => delayer.trigger(
        () => this.registerConfigurationSchemas(),
        lifecycleService.phase === LifecyclePhase.Eventually ? void 0 : 2500
        /* delay longer in early phases */
      )));
    });
  }
  registerConfigurationSchemas() {
    for (const key of Object.keys(allSettings.properties)) {
      const prop = allSettings.properties[key];
      if (prop.markdownDeprecationMessage && prop.deprecationMessage === prop.markdownDeprecationMessage) {
        prop.deprecationMessage = renderAsPlaintext({ value: fixSettingLinks(prop.markdownDeprecationMessage) });
      }
    }
    const allSettingsSchema = {
      properties: allSettings.properties,
      patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    const userSettingsSchema = this.environmentService.remoteAuthority ? {
      properties: Object.assign(
        {},
        applicationSettings.properties,
        windowSettings.properties,
        resourceSettings.properties
      ),
      patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    } : allSettingsSchema;
    const profileSettingsSchema = {
      properties: Object.assign(
        {},
        machineSettings.properties,
        machineOverridableSettings.properties,
        windowSettings.properties,
        resourceSettings.properties
      ),
      patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    const machineSettingsSchema = {
      properties: Object.assign(
        {},
        applicationMachineSettings.properties,
        machineSettings.properties,
        machineOverridableSettings.properties,
        windowSettings.properties,
        resourceSettings.properties
      ),
      patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    const workspaceSettingsSchema = {
      properties: Object.assign(
        {},
        this.checkAndFilterPropertiesRequiringTrust(machineOverridableSettings.properties),
        this.checkAndFilterPropertiesRequiringTrust(windowSettings.properties),
        this.checkAndFilterPropertiesRequiringTrust(resourceSettings.properties)
      ),
      patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    const defaultSettingsSchema = {
      properties: Object.keys(allSettings.properties).reduce((result, key) => {
        result[key] = Object.assign({ deprecationMessage: void 0 }, allSettings.properties[key]);
        return result;
      }, {}),
      patternProperties: Object.keys(allSettings.patternProperties).reduce((result, key) => {
        result[key] = Object.assign({ deprecationMessage: void 0 }, allSettings.patternProperties[key]);
        return result;
      }, {}),
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    const folderSettingsSchema = WorkbenchState.WORKSPACE === this.workspaceContextService.getWorkbenchState() ? {
      properties: Object.assign(
        {},
        this.checkAndFilterPropertiesRequiringTrust(machineOverridableSettings.properties),
        this.checkAndFilterPropertiesRequiringTrust(resourceSettings.properties)
      ),
      patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    } : workspaceSettingsSchema;
    const configDefaultsSchema = {
      type: "object",
      description: localize("configurationDefaults.description", "Contribute defaults for configurations"),
      properties: Object.assign(
        {},
        this.filterDefaultOverridableProperties(machineOverridableSettings.properties),
        this.filterDefaultOverridableProperties(windowSettings.properties),
        this.filterDefaultOverridableProperties(resourceSettings.properties)
      ),
      patternProperties: {
        [OVERRIDE_PROPERTY_PATTERN]: {
          type: "object",
          default: {},
          $ref: resourceLanguageSettingsSchemaId
        }
      },
      additionalProperties: false
    };
    this.registerSchemas({
      defaultSettingsSchema,
      userSettingsSchema,
      profileSettingsSchema,
      machineSettingsSchema,
      workspaceSettingsSchema,
      folderSettingsSchema,
      configDefaultsSchema
    });
  }
  registerSchemas(schemas) {
    const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
    jsonRegistry.registerSchema(defaultSettingsSchemaId, schemas.defaultSettingsSchema);
    jsonRegistry.registerSchema(userSettingsSchemaId, schemas.userSettingsSchema);
    jsonRegistry.registerSchema(profileSettingsSchemaId, schemas.profileSettingsSchema);
    jsonRegistry.registerSchema(machineSettingsSchemaId, schemas.machineSettingsSchema);
    jsonRegistry.registerSchema(workspaceSettingsSchemaId, schemas.workspaceSettingsSchema);
    jsonRegistry.registerSchema(folderSettingsSchemaId, schemas.folderSettingsSchema);
    jsonRegistry.registerSchema(configurationDefaultsSchemaId, schemas.configDefaultsSchema);
  }
  checkAndFilterPropertiesRequiringTrust(properties) {
    if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      return properties;
    }
    const result = {};
    Object.entries(properties).forEach(([key, value]) => {
      if (!value.restricted) {
        result[key] = value;
      }
    });
    return result;
  }
  filterDefaultOverridableProperties(properties) {
    const result = {};
    Object.entries(properties).forEach(([key, value]) => {
      if (!value.disallowConfigurationDefault) {
        result[key] = value;
      }
    });
    return result;
  }
};
RegisterConfigurationSchemasContribution = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, IWorkbenchEnvironmentService),
  __decorateParam(2, IWorkspaceTrustManagementService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, ILifecycleService)
], RegisterConfigurationSchemasContribution);
let ConfigurationDefaultOverridesContribution = class extends Disposable {
  constructor(workbenchAssignmentService, extensionService, configurationService, environmentService, logService) {
    super();
    this.workbenchAssignmentService = workbenchAssignmentService;
    this.extensionService = extensionService;
    this.configurationService = configurationService;
    this.environmentService = environmentService;
    this.logService = logService;
    this.processedExperimentalSettings = /* @__PURE__ */ new Set();
    this.autoExperimentalSettings = /* @__PURE__ */ new Set();
    this.configurationRegistry = Registry.as(Extensions.Configuration);
    this.throttler = this._register(new Throttler());
    this.throttler.queue(() => this.updateDefaults());
    this._register(workbenchAssignmentService.onDidRefetchAssignments(() => this.throttler.queue(() => this.processExperimentalSettings(this.autoExperimentalSettings, true))));
    this._register(this.configurationRegistry.onDidUpdateConfiguration(({ properties }) => this.processExperimentalSettings(properties, false)));
  }
  async updateDefaults() {
    this.logService.trace("ConfigurationService#updateDefaults: begin");
    try {
      await this.processExperimentalSettings(Object.keys(this.configurationRegistry.getConfigurationProperties()), false);
    } finally {
      await this.extensionService.whenInstalledExtensionsRegistered();
      this.logService.trace("ConfigurationService#updateDefaults: resetting the defaults");
      this.configurationService.reloadConfiguration(ConfigurationTarget.DEFAULT);
    }
  }
  async processExperimentalSettings(properties, autoRefetch) {
    const overrides = {};
    const allProperties = this.configurationRegistry.getConfigurationProperties();
    const defaultConfigurationsPreventingExperimentOverrides = this.configurationRegistry.getRegisteredDefaultConfigurations().filter((configuration) => configuration.preventExperimentOverride);
    for (const property of properties) {
      const schema = allProperties[property];
      if (!schema?.experiment) {
        continue;
      }
      const defaultValueSource = schema.defaultValueSource && !(schema.defaultValueSource instanceof Map) ? schema.defaultValueSource : void 0;
      if (defaultValueSource && defaultConfigurationsPreventingExperimentOverrides.some((configuration) => isConfigurationDefaultSourceEquals(configuration.source, defaultValueSource) && configuration.overrides?.[property] !== void 0)) {
        continue;
      }
      if (!autoRefetch && this.processedExperimentalSettings.has(property)) {
        continue;
      }
      this.processedExperimentalSettings.add(property);
      if (schema.experiment.mode === "auto") {
        this.autoExperimentalSettings.add(property);
      }
      try {
        const value = await this.workbenchAssignmentService.getTreatment(schema.experiment.name ?? `config.${property}`);
        if (this.shouldOverride(value, schema)) {
          overrides[property] = value;
        }
      } catch (error) {
      }
    }
    if (Object.keys(overrides).length) {
      this.configurationRegistry.registerDefaultConfigurations([{ overrides, source: "experiments" }]);
    }
  }
  shouldOverride(value, schema) {
    if (isUndefined(value)) {
      return false;
    }
    if (this.environmentService.isSessionsWindow && schema.agentsWindow?.default !== void 0) {
      return !equals(value, schema.agentsWindow?.default);
    }
    return !equals(value, schema.default);
  }
};
ConfigurationDefaultOverridesContribution.ID = "workbench.contrib.configurationDefaultOverridesContribution";
ConfigurationDefaultOverridesContribution = __decorateClass([
  __decorateParam(0, IWorkbenchAssignmentService),
  __decorateParam(1, IExtensionService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IWorkbenchEnvironmentService),
  __decorateParam(4, ILogService)
], ConfigurationDefaultOverridesContribution);
const workbenchContributionsRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(RegisterConfigurationSchemasContribution, LifecyclePhase.Restored);
registerWorkbenchContribution2(ConfigurationDefaultOverridesContribution.ID, ConfigurationDefaultOverridesContribution, WorkbenchPhase.BlockRestore);
const configurationRegistry = Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
  ...workbenchConfigurationNodeBase,
  properties: {
    [APPLY_ALL_PROFILES_SETTING]: {
      "type": "array",
      description: localize("setting description", "Configure settings to be applied for all profiles."),
      "default": [],
      "scope": ConfigurationScope.APPLICATION,
      additionalProperties: true,
      uniqueItems: true
    }
  }
});
export {
  WorkspaceService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxjb25maWd1cmF0aW9uXFxicm93c2VyXFxjb25maWd1cmF0aW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFF1ZXVlLCBCYXJyaWVyLCBQcm9taXNlcywgRGVsYXllciwgVGhyb3R0bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3Jrc3BhY2UgYXMgQmFzZVdvcmtzcGFjZSwgV29ya2JlbmNoU3RhdGUsIElXb3Jrc3BhY2VGb2xkZXIsIElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQsIFdvcmtzcGFjZUZvbGRlciwgdG9Xb3Jrc3BhY2VGb2xkZXIsIGlzV29ya3NwYWNlRm9sZGVyLCBJV29ya3NwYWNlRm9sZGVyc1dpbGxDaGFuZ2VFdmVudCwgSUVtcHR5V29ya3NwYWNlSWRlbnRpZmllciwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgaXNXb3Jrc3BhY2VJZGVudGlmaWVyLCBJV29ya3NwYWNlSWRlbnRpZmllciwgSUFueVdvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uTW9kZWwsIENvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgbWVyZ2VDaGFuZ2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbk1vZGVscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcywgaXNDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCBJQ29uZmlndXJhdGlvbkRhdGEsIElDb25maWd1cmF0aW9uVmFsdWUsIElDb25maWd1cmF0aW9uQ2hhbmdlLCBDb25maWd1cmF0aW9uVGFyZ2V0VG9TdHJpbmcsIElDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzLCBpc0NvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMsIElDb25maWd1cmF0aW9uU2VydmljZSwgSUNvbmZpZ3VyYXRpb25VcGRhdGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUG9saWN5Q29uZmlndXJhdGlvbiwgTnVsbFBvbGljeUNvbmZpZ3VyYXRpb24sIFBvbGljeUNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2NvbmZpZ3VyYXRpb25Nb2RlbHMuanMnO1xuaW1wb3J0IHsgRk9MREVSX0NPTkZJR19GT0xERVJfTkFNRSwgZGVmYXVsdFNldHRpbmdzU2NoZW1hSWQsIHVzZXJTZXR0aW5nc1NjaGVtYUlkLCB3b3Jrc3BhY2VTZXR0aW5nc1NjaGVtYUlkLCBmb2xkZXJTZXR0aW5nc1NjaGVtYUlkLCBJQ29uZmlndXJhdGlvbkNhY2hlLCBtYWNoaW5lU2V0dGluZ3NTY2hlbWFJZCwgTE9DQUxfTUFDSElORV9TQ09QRVMsIElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSwgUmVzdHJpY3RlZFNldHRpbmdzLCBQUk9GSUxFX1NDT1BFUywgTE9DQUxfTUFDSElORV9QUk9GSUxFX1NDT1BFUywgcHJvZmlsZVNldHRpbmdzU2NoZW1hSWQsIEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HLCBBUFBMSUNBVElPTl9TQ09QRVMgfSBmcm9tICcuLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zLCBhbGxTZXR0aW5ncywgd2luZG93U2V0dGluZ3MsIHJlc291cmNlU2V0dGluZ3MsIGFwcGxpY2F0aW9uU2V0dGluZ3MsIG1hY2hpbmVTZXR0aW5ncywgbWFjaGluZU92ZXJyaWRhYmxlU2V0dGluZ3MsIENvbmZpZ3VyYXRpb25TY29wZSwgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwga2V5RnJvbU92ZXJyaWRlSWRlbnRpZmllcnMsIE9WRVJSSURFX1BST1BFUlRZX1BBVFRFUk4sIHJlc291cmNlTGFuZ3VhZ2VTZXR0aW5nc1NjaGVtYUlkLCBjb25maWd1cmF0aW9uRGVmYXVsdHNTY2hlbWFJZCwgYXBwbGljYXRpb25NYWNoaW5lU2V0dGluZ3MsIGlzQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2VFcXVhbHMsIENvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElTdG9yZWRXb3Jrc3BhY2VGb2xkZXIsIGlzU3RvcmVkV29ya3NwYWNlRm9sZGVyLCBJV29ya3NwYWNlRm9sZGVyQ3JlYXRpb25EYXRhLCBnZXRTdG9yZWRXb3Jrc3BhY2VGb2xkZXIsIHRvV29ya3NwYWNlRm9sZGVycyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uRWRpdGluZywgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vY29tbW9uL2NvbmZpZ3VyYXRpb25FZGl0aW5nLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24sIEZvbGRlckNvbmZpZ3VyYXRpb24sIFJlbW90ZVVzZXJDb25maWd1cmF0aW9uLCBVc2VyQ29uZmlndXJhdGlvbiwgRGVmYXVsdENvbmZpZ3VyYXRpb24sIEFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbiB9IGZyb20gJy4vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSwgSUpTT05TY2hlbWFNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IG1hcmsgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIFdvcmtiZW5jaFBoYXNlLCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgZGVsdGEsIGRpc3RpbmN0LCBlcXVhbHMgYXMgYXJyYXlFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNVbmRlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBEaWRDaGFuZ2VVc2VyRGF0YVByb2ZpbGVFdmVudCwgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJUG9saWN5U2VydmljZSwgTnVsbFBvbGljeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL3BvbGljeS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJSlNPTkVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2pzb25FZGl0aW5nLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoQ29uZmlndXJhdGlvbk5vZGVCYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgcnVuV2hlbldpbmRvd0lkbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgZml4U2V0dGluZ0xpbmtzIH0gZnJvbSAnLi4vLi4vcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzTW9kZWxzLmpzJztcblxuZnVuY3Rpb24gZ2V0TG9jYWxVc2VyQ29uZmlndXJhdGlvblNjb3Blcyh1c2VyRGF0YVByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsIGhhc1JlbW90ZTogYm9vbGVhbik6IENvbmZpZ3VyYXRpb25TY29wZVtdIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgaXNEZWZhdWx0UHJvZmlsZSA9IHVzZXJEYXRhUHJvZmlsZS5pc0RlZmF1bHQgfHwgdXNlckRhdGFQcm9maWxlLnVzZURlZmF1bHRGbGFncz8uc2V0dGluZ3M7XG5cdGlmIChpc0RlZmF1bHRQcm9maWxlKSB7XG5cdFx0cmV0dXJuIGhhc1JlbW90ZSA/IExPQ0FMX01BQ0hJTkVfU0NPUEVTIDogdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBoYXNSZW1vdGUgPyBMT0NBTF9NQUNISU5FX1BST0ZJTEVfU0NPUEVTIDogUFJPRklMRV9TQ09QRVM7XG59XG5cbmNsYXNzIFdvcmtzcGFjZSBleHRlbmRzIEJhc2VXb3Jrc3BhY2Uge1xuXHRpbml0aWFsaXplZDogYm9vbGVhbiA9IGZhbHNlO1xufVxuXG5leHBvcnQgY2xhc3MgV29ya3NwYWNlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB7XG5cblx0cHVibGljIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHdvcmtzcGFjZSE6IFdvcmtzcGFjZTtcblx0cHJpdmF0ZSBpbml0UmVtb3RlVXNlckNvbmZpZ3VyYXRpb25CYXJyaWVyOiBCYXJyaWVyO1xuXHRwcml2YXRlIGNvbXBsZXRlV29ya3NwYWNlQmFycmllcjogQmFycmllcjtcblx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uQ2FjaGU6IElDb25maWd1cmF0aW9uQ2FjaGU7XG5cdHByaXZhdGUgX2NvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgaW5pdGlhbGl6ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0Q29uZmlndXJhdGlvbjogRGVmYXVsdENvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgcG9saWN5Q29uZmlndXJhdGlvbjogSVBvbGljeUNvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgYXBwbGljYXRpb25Db25maWd1cmF0aW9uOiBBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBhcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb25EaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxvY2FsVXNlckNvbmZpZ3VyYXRpb246IFVzZXJDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlbW90ZVVzZXJDb25maWd1cmF0aW9uOiBSZW1vdGVVc2VyQ29uZmlndXJhdGlvbiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbmZpZ3VyYXRpb246IFdvcmtzcGFjZUNvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgY2FjaGVkRm9sZGVyQ29uZmlnczogRGlzcG9zYWJsZU1hcDxVUkksIEZvbGRlckNvbmZpZ3VyYXRpb24+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXAobmV3IFJlc291cmNlTWFwKCkpKTtcblx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VFZGl0aW5nUXVldWU6IFF1ZXVlPHZvaWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbjogRW1pdHRlcjxJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uOiBFdmVudDxJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uV2lsbENoYW5nZVdvcmtzcGFjZUZvbGRlcnM6IEVtaXR0ZXI8SVdvcmtzcGFjZUZvbGRlcnNXaWxsQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtzcGFjZUZvbGRlcnNXaWxsQ2hhbmdlRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25XaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVyczogRXZlbnQ8SVdvcmtzcGFjZUZvbGRlcnNXaWxsQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25XaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVycy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnM6IEVtaXR0ZXI8SVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVyczogRXZlbnQ8SVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VXb3Jrc3BhY2VOYW1lOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVdvcmtzcGFjZU5hbWU6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VXb3Jrc3BhY2VOYW1lLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGU6IEVtaXR0ZXI8V29ya2JlbmNoU3RhdGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8V29ya2JlbmNoU3RhdGU+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZTogRXZlbnQ8V29ya2JlbmNoU3RhdGU+ID0gdGhpcy5fb25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZS5ldmVudDtcblxuXHRwcml2YXRlIGlzV29ya3NwYWNlVHJ1c3RlZDogYm9vbGVhbiA9IHRydWU7XG5cblx0cHJpdmF0ZSBfcmVzdHJpY3RlZFNldHRpbmdzOiBSZXN0cmljdGVkU2V0dGluZ3MgPSB7IGRlZmF1bHQ6IFtdIH07XG5cdGdldCByZXN0cmljdGVkU2V0dGluZ3MoKSB7IHJldHVybiB0aGlzLl9yZXN0cmljdGVkU2V0dGluZ3M7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZXN0cmljdGVkU2V0dGluZ3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxSZXN0cmljdGVkU2V0dGluZ3M+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VSZXN0cmljdGVkU2V0dGluZ3MgPSB0aGlzLl9vbkRpZENoYW5nZVJlc3RyaWN0ZWRTZXR0aW5ncy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25SZWdpc3RyeTogSUNvbmZpZ3VyYXRpb25SZWdpc3RyeTtcblxuXHRwcml2YXRlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29uZmlndXJhdGlvbkVkaXRpbmc6IFByb21pc2U8Q29uZmlndXJhdGlvbkVkaXRpbmc+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHsgcmVtb3RlQXV0aG9yaXR5LCBjb25maWd1cmF0aW9uQ2FjaGUgfTogeyByZW1vdGVBdXRob3JpdHk/OiBzdHJpbmc7IGNvbmZpZ3VyYXRpb25DYWNoZTogSUNvbmZpZ3VyYXRpb25DYWNoZSB9LFxuXHRcdGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cG9saWN5U2VydmljZTogSVBvbGljeVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblxuXHRcdHRoaXMuaW5pdFJlbW90ZVVzZXJDb25maWd1cmF0aW9uQmFycmllciA9IG5ldyBCYXJyaWVyKCk7XG5cdFx0dGhpcy5jb21wbGV0ZVdvcmtzcGFjZUJhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXHRcdHRoaXMuZGVmYXVsdENvbmZpZ3VyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24odXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pZCwgY29uZmlndXJhdGlvbkNhY2hlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLnBvbGljeUNvbmZpZ3VyYXRpb24gPSBwb2xpY3lTZXJ2aWNlIGluc3RhbmNlb2YgTnVsbFBvbGljeVNlcnZpY2UgPyBuZXcgTnVsbFBvbGljeUNvbmZpZ3VyYXRpb24oKSA6IHRoaXMuX3JlZ2lzdGVyKG5ldyBQb2xpY3lDb25maWd1cmF0aW9uKHRoaXMuZGVmYXVsdENvbmZpZ3VyYXRpb24sIHBvbGljeVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25DYWNoZSA9IGNvbmZpZ3VyYXRpb25DYWNoZTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uID0gbmV3IENvbmZpZ3VyYXRpb24odGhpcy5kZWZhdWx0Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwsIHRoaXMucG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwsIENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLCBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChsb2dTZXJ2aWNlKSwgQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSksIENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLCBuZXcgUmVzb3VyY2VNYXAoKSwgQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSksIG5ldyBSZXNvdXJjZU1hcDxDb25maWd1cmF0aW9uTW9kZWw+KCksIHRoaXMud29ya3NwYWNlLCBsb2dTZXJ2aWNlKTtcblx0XHR0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbkRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHR0aGlzLmNyZWF0ZUFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbigpO1xuXHRcdHRoaXMubG9jYWxVc2VyQ29uZmlndXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBVc2VyQ29uZmlndXJhdGlvbih1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UsIHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUudGFza3NSZXNvdXJjZSwgdXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5tY3BSZXNvdXJjZSwgeyBzY29wZXM6IGdldExvY2FsVXNlckNvbmZpZ3VyYXRpb25TY29wZXModXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZSwgISFyZW1vdGVBdXRob3JpdHkpIH0sIGZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24ub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKHVzZXJDb25maWd1cmF0aW9uID0+IHRoaXMub25Mb2NhbFVzZXJDb25maWd1cmF0aW9uQ2hhbmdlZCh1c2VyQ29uZmlndXJhdGlvbikpKTtcblx0XHRpZiAocmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRjb25zdCByZW1vdGVVc2VyQ29uZmlndXJhdGlvbiA9IHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVtb3RlVXNlckNvbmZpZ3VyYXRpb24ocmVtb3RlQXV0aG9yaXR5LCBjb25maWd1cmF0aW9uQ2FjaGUsIGZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIHJlbW90ZUFnZW50U2VydmljZSwgbG9nU2VydmljZSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVtb3RlVXNlckNvbmZpZ3VyYXRpb24ub25EaWRJbml0aWFsaXplKHJlbW90ZVVzZXJDb25maWd1cmF0aW9uTW9kZWwgPT4ge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihyZW1vdGVVc2VyQ29uZmlndXJhdGlvbi5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24ocmVtb3RlVXNlckNvbmZpZ3VyYXRpb25Nb2RlbCA9PiB0aGlzLm9uUmVtb3RlVXNlckNvbmZpZ3VyYXRpb25DaGFuZ2VkKHJlbW90ZVVzZXJDb25maWd1cmF0aW9uTW9kZWwpKSk7XG5cdFx0XHRcdHRoaXMub25SZW1vdGVVc2VyQ29uZmlndXJhdGlvbkNoYW5nZWQocmVtb3RlVXNlckNvbmZpZ3VyYXRpb25Nb2RlbCk7XG5cdFx0XHRcdHRoaXMuaW5pdFJlbW90ZVVzZXJDb25maWd1cmF0aW9uQmFycmllci5vcGVuKCk7XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaW5pdFJlbW90ZVVzZXJDb25maWd1cmF0aW9uQmFycmllci5vcGVuKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbkNhY2hlLCBmaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLm9uRGlkVXBkYXRlQ29uZmlndXJhdGlvbihmcm9tQ2FjaGUgPT4ge1xuXHRcdFx0dGhpcy5vbldvcmtzcGFjZUNvbmZpZ3VyYXRpb25DaGFuZ2VkKGZyb21DYWNoZSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdHRoaXMud29ya3NwYWNlLmluaXRpYWxpemVkID0gdGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLmluaXRpYWxpemVkO1xuXHRcdFx0XHR0aGlzLmNoZWNrQW5kTWFya1dvcmtzcGFjZUNvbXBsZXRlKGZyb21DYWNoZSk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlZmF1bHRDb25maWd1cmF0aW9uLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoeyBwcm9wZXJ0aWVzLCBkZWZhdWx0cyB9KSA9PiB0aGlzLm9uRGVmYXVsdENvbmZpZ3VyYXRpb25DaGFuZ2VkKGRlZmF1bHRzLCBwcm9wZXJ0aWVzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucG9saWN5Q29uZmlndXJhdGlvbi5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbk1vZGVsID0+IHRoaXMub25Qb2xpY3lDb25maWd1cmF0aW9uQ2hhbmdlZChjb25maWd1cmF0aW9uTW9kZWwpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodXNlckRhdGFQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlKGUgPT4gdGhpcy5vblVzZXJEYXRhUHJvZmlsZUNoYW5nZWQoZSkpKTtcblxuXHRcdHRoaXMud29ya3NwYWNlRWRpdGluZ1F1ZXVlID0gbmV3IFF1ZXVlPHZvaWQ+KCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pc0RlZmF1bHQgfHwgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnVzZURlZmF1bHRGbGFncz8uc2V0dGluZ3MpIHtcblx0XHRcdHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uID0gbnVsbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gPSB0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbkRpc3Bvc2FibGVzLmFkZCh0aGlzLl9yZWdpc3RlcihuZXcgQXBwbGljYXRpb25Db25maWd1cmF0aW9uKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpKSk7XG5cdFx0XHR0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbkRpc3Bvc2FibGVzLmFkZCh0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbi5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbk1vZGVsID0+IHRoaXMub25BcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGNvbmZpZ3VyYXRpb25Nb2RlbCkpKTtcblx0XHR9XG5cdH1cblxuXHQvLyBXb3Jrc3BhY2UgQ29udGV4dCBTZXJ2aWNlIEltcGxcblxuXHRwdWJsaWMgYXN5bmMgZ2V0Q29tcGxldGVXb3Jrc3BhY2UoKTogUHJvbWlzZTxXb3Jrc3BhY2U+IHtcblx0XHRhd2FpdCB0aGlzLmNvbXBsZXRlV29ya3NwYWNlQmFycmllci53YWl0KCk7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0V29ya3NwYWNlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V29ya3NwYWNlKCk6IFdvcmtzcGFjZSB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlO1xuXHR9XG5cblx0cHVibGljIGdldFdvcmtiZW5jaFN0YXRlKCk6IFdvcmtiZW5jaFN0YXRlIHtcblx0XHQvLyBXb3Jrc3BhY2UgaGFzIGNvbmZpZ3VyYXRpb24gZmlsZVxuXHRcdGlmICh0aGlzLndvcmtzcGFjZS5jb25maWd1cmF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFO1xuXHRcdH1cblxuXHRcdC8vIEZvbGRlciBoYXMgc2luZ2xlIHJvb3Rcblx0XHRpZiAodGhpcy53b3Jrc3BhY2UuZm9sZGVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBXb3JrYmVuY2hTdGF0ZS5GT0xERVI7XG5cdFx0fVxuXG5cdFx0Ly8gRW1wdHlcblx0XHRyZXR1cm4gV29ya2JlbmNoU3RhdGUuRU1QVFk7XG5cdH1cblxuXHRwdWJsaWMgaGFzV29ya3NwYWNlRGF0YSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWTtcblx0fVxuXG5cdHB1YmxpYyBnZXRXb3Jrc3BhY2VGb2xkZXIocmVzb3VyY2U6IFVSSSk6IElXb3Jrc3BhY2VGb2xkZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2UuZ2V0Rm9sZGVyKHJlc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBhZGRGb2xkZXJzKGZvbGRlcnNUb0FkZDogSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YVtdLCBpbmRleD86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnVwZGF0ZUZvbGRlcnMoZm9sZGVyc1RvQWRkLCBbXSwgaW5kZXgpO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZUZvbGRlcnMoZm9sZGVyc1RvUmVtb3ZlOiBVUklbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnVwZGF0ZUZvbGRlcnMoW10sIGZvbGRlcnNUb1JlbW92ZSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdXBkYXRlRm9sZGVycyhmb2xkZXJzVG9BZGQ6IElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGFbXSwgZm9sZGVyc1RvUmVtb3ZlOiBVUklbXSwgaW5kZXg/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VFZGl0aW5nUXVldWUucXVldWUoKCkgPT4gdGhpcy5kb1VwZGF0ZUZvbGRlcnMoZm9sZGVyc1RvQWRkLCBmb2xkZXJzVG9SZW1vdmUsIGluZGV4KSk7XG5cdH1cblxuXHRwdWJsaWMgaXNJbnNpZGVXb3Jrc3BhY2UocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuZ2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBpc0N1cnJlbnRXb3Jrc3BhY2Uod29ya3NwYWNlSWRPckZvbGRlcjogSVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciB8IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHN3aXRjaCAodGhpcy5nZXRXb3JrYmVuY2hTdGF0ZSgpKSB7XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLkZPTERFUjoge1xuXHRcdFx0XHRsZXQgZm9sZGVyVXJpOiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChVUkkuaXNVcmkod29ya3NwYWNlSWRPckZvbGRlcikpIHtcblx0XHRcdFx0XHRmb2xkZXJVcmkgPSB3b3Jrc3BhY2VJZE9yRm9sZGVyO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih3b3Jrc3BhY2VJZE9yRm9sZGVyKSkge1xuXHRcdFx0XHRcdGZvbGRlclVyaSA9IHdvcmtzcGFjZUlkT3JGb2xkZXIudXJpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIFVSSS5pc1VyaShmb2xkZXJVcmkpICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGZvbGRlclVyaSwgdGhpcy53b3Jrc3BhY2UuZm9sZGVyc1swXS51cmkpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0U6XG5cdFx0XHRcdHJldHVybiBpc1dvcmtzcGFjZUlkZW50aWZpZXIod29ya3NwYWNlSWRPckZvbGRlcikgJiYgdGhpcy53b3Jrc3BhY2UuaWQgPT09IHdvcmtzcGFjZUlkT3JGb2xkZXIuaWQ7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9VcGRhdGVGb2xkZXJzKGZvbGRlcnNUb0FkZDogSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YVtdLCBmb2xkZXJzVG9SZW1vdmU6IFVSSVtdLCBpbmRleD86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpOyAvLyB3ZSBuZWVkIGEgd29ya3NwYWNlIHRvIGJlZ2luIHdpdGhcblx0XHR9XG5cblx0XHRpZiAoZm9sZGVyc1RvQWRkLmxlbmd0aCArIGZvbGRlcnNUb1JlbW92ZS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTsgLy8gbm90aGluZyB0byBkb1xuXHRcdH1cblxuXHRcdGxldCBmb2xkZXJzSGF2ZUNoYW5nZWQgPSBmYWxzZTtcblxuXHRcdC8vIFJlbW92ZSBmaXJzdCAoaWYgYW55KVxuXHRcdGxldCBjdXJyZW50V29ya3NwYWNlRm9sZGVycyA9IHRoaXMuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRsZXQgbmV3U3RvcmVkRm9sZGVyczogSVN0b3JlZFdvcmtzcGFjZUZvbGRlcltdID0gY3VycmVudFdvcmtzcGFjZUZvbGRlcnMubWFwKGYgPT4gZi5yYXcpLmZpbHRlcigoZm9sZGVyLCBpbmRleCk6IGZvbGRlciBpcyBJU3RvcmVkV29ya3NwYWNlRm9sZGVyID0+IHtcblx0XHRcdGlmICghaXNTdG9yZWRXb3Jrc3BhY2VGb2xkZXIoZm9sZGVyKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTsgLy8ga2VlcCBlbnRyaWVzIHdoaWNoIGFyZSB1bnJlbGF0ZWRcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuICF0aGlzLmNvbnRhaW5zKGZvbGRlcnNUb1JlbW92ZSwgY3VycmVudFdvcmtzcGFjZUZvbGRlcnNbaW5kZXhdLnVyaSk7IC8vIGtlZXAgZW50cmllcyB3aGljaCBhcmUgdW5yZWxhdGVkXG5cdFx0fSk7XG5cblx0XHRmb2xkZXJzSGF2ZUNoYW5nZWQgPSBjdXJyZW50V29ya3NwYWNlRm9sZGVycy5sZW5ndGggIT09IG5ld1N0b3JlZEZvbGRlcnMubGVuZ3RoO1xuXG5cdFx0Ly8gQWRkIGFmdGVyd2FyZHMgKGlmIGFueSlcblx0XHRpZiAoZm9sZGVyc1RvQWRkLmxlbmd0aCkge1xuXG5cdFx0XHQvLyBSZWNvbXB1dGUgY3VycmVudCB3b3Jrc3BhY2UgZm9sZGVycyBpZiB3ZSBoYXZlIGZvbGRlcnMgdG8gYWRkXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VDb25maWdQYXRoID0gdGhpcy5nZXRXb3Jrc3BhY2UoKS5jb25maWd1cmF0aW9uITtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUNvbmZpZ0ZvbGRlciA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKHdvcmtzcGFjZUNvbmZpZ1BhdGgpO1xuXHRcdFx0Y3VycmVudFdvcmtzcGFjZUZvbGRlcnMgPSB0b1dvcmtzcGFjZUZvbGRlcnMobmV3U3RvcmVkRm9sZGVycywgd29ya3NwYWNlQ29uZmlnUGF0aCwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRXb3Jrc3BhY2VGb2xkZXJVcmlzID0gY3VycmVudFdvcmtzcGFjZUZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIudXJpKTtcblxuXHRcdFx0Y29uc3Qgc3RvcmVkRm9sZGVyc1RvQWRkOiBJU3RvcmVkV29ya3NwYWNlRm9sZGVyW10gPSBbXTtcblxuXHRcdFx0Zm9yIChjb25zdCBmb2xkZXJUb0FkZCBvZiBmb2xkZXJzVG9BZGQpIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyVVJJID0gZm9sZGVyVG9BZGQudXJpO1xuXHRcdFx0XHRpZiAodGhpcy5jb250YWlucyhjdXJyZW50V29ya3NwYWNlRm9sZGVyVXJpcywgZm9sZGVyVVJJKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlOyAvLyBhbHJlYWR5IGV4aXN0aW5nXG5cdFx0XHRcdH1cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQoZm9sZGVyVVJJKTtcblx0XHRcdFx0XHRpZiAoIXJlc3VsdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlKSB7IC8qIElnbm9yZSAqLyB9XG5cdFx0XHRcdHN0b3JlZEZvbGRlcnNUb0FkZC5wdXNoKGdldFN0b3JlZFdvcmtzcGFjZUZvbGRlcihmb2xkZXJVUkksIGZhbHNlLCBmb2xkZXJUb0FkZC5uYW1lLCB3b3Jrc3BhY2VDb25maWdGb2xkZXIsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBcHBseSB0byBhcnJheSBvZiBuZXdTdG9yZWRGb2xkZXJzXG5cdFx0XHRpZiAoc3RvcmVkRm9sZGVyc1RvQWRkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Zm9sZGVyc0hhdmVDaGFuZ2VkID0gdHJ1ZTtcblxuXHRcdFx0XHRpZiAodHlwZW9mIGluZGV4ID09PSAnbnVtYmVyJyAmJiBpbmRleCA+PSAwICYmIGluZGV4IDwgbmV3U3RvcmVkRm9sZGVycy5sZW5ndGgpIHtcblx0XHRcdFx0XHRuZXdTdG9yZWRGb2xkZXJzID0gbmV3U3RvcmVkRm9sZGVycy5zbGljZSgwKTtcblx0XHRcdFx0XHRuZXdTdG9yZWRGb2xkZXJzLnNwbGljZShpbmRleCwgMCwgLi4uc3RvcmVkRm9sZGVyc1RvQWRkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRuZXdTdG9yZWRGb2xkZXJzID0gWy4uLm5ld1N0b3JlZEZvbGRlcnMsIC4uLnN0b3JlZEZvbGRlcnNUb0FkZF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTZXQgZm9sZGVycyBpZiB3ZSByZWNvcmRlZCBhIGNoYW5nZVxuXHRcdGlmIChmb2xkZXJzSGF2ZUNoYW5nZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLnNldEZvbGRlcnMobmV3U3RvcmVkRm9sZGVycyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZXRGb2xkZXJzKGZvbGRlcnM6IElTdG9yZWRXb3Jrc3BhY2VGb2xkZXJbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdXBkYXRlIHdvcmtzcGFjZSBmb2xkZXJzIGJlY2F1c2Ugd29ya3NwYWNlIHNlcnZpY2UgaXMgbm90IHlldCByZWFkeSB0byBhY2NlcHQgd3JpdGVzLicpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gdGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLnNldEZvbGRlcnMoZm9sZGVycywgYWNjZXNzb3IuZ2V0KElKU09ORWRpdGluZ1NlcnZpY2UpKSk7XG5cdFx0cmV0dXJuIHRoaXMub25Xb3Jrc3BhY2VDb25maWd1cmF0aW9uQ2hhbmdlZChmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGNvbnRhaW5zKHJlc291cmNlczogVVJJW10sIHRvQ2hlY2s6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiByZXNvdXJjZXMuc29tZShyZXNvdXJjZSA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdG9DaGVjaykpO1xuXHR9XG5cblx0Ly8gV29ya3NwYWNlIENvbmZpZ3VyYXRpb24gU2VydmljZSBJbXBsXG5cblx0Z2V0Q29uZmlndXJhdGlvbkRhdGEoKTogSUNvbmZpZ3VyYXRpb25EYXRhIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKTtcblx0fVxuXG5cdGdldFZhbHVlPFQ+KCk6IFQ7XG5cdGdldFZhbHVlPFQ+KHNlY3Rpb246IHN0cmluZyk6IFQ7XG5cdGdldFZhbHVlPFQ+KG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBUO1xuXHRnZXRWYWx1ZTxUPihzZWN0aW9uOiBzdHJpbmcsIG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBUO1xuXHRnZXRWYWx1ZShhcmcxPzogdW5rbm93biwgYXJnMj86IHVua25vd24pOiB1bmtub3duIHtcblx0XHRjb25zdCBzZWN0aW9uID0gdHlwZW9mIGFyZzEgPT09ICdzdHJpbmcnID8gYXJnMSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvdmVycmlkZXMgPSBpc0NvbmZpZ3VyYXRpb25PdmVycmlkZXMoYXJnMSkgPyBhcmcxIDogaXNDb25maWd1cmF0aW9uT3ZlcnJpZGVzKGFyZzIpID8gYXJnMiA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi5nZXRWYWx1ZShzZWN0aW9uLCBvdmVycmlkZXMpO1xuXHR9XG5cblx0dXBkYXRlVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogUHJvbWlzZTx2b2lkPjtcblx0dXBkYXRlVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBvdmVycmlkZXM6IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzIHwgSUNvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMpOiBQcm9taXNlPHZvaWQ+O1xuXHR1cGRhdGVWYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCk6IFByb21pc2U8dm9pZD47XG5cdHVwZGF0ZVZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgb3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyB8IElDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzLCB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIG9wdGlvbnM/OiBJQ29uZmlndXJhdGlvblVwZGF0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRhc3luYyB1cGRhdGVWYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIGFyZzM/OiB1bmtub3duLCBhcmc0PzogdW5rbm93biwgb3B0aW9ucz86IElDb25maWd1cmF0aW9uVXBkYXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMgfCB1bmRlZmluZWQgPSBpc0NvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMoYXJnMykgPyBhcmczXG5cdFx0XHQ6IGlzQ29uZmlndXJhdGlvbk92ZXJyaWRlcyhhcmczKSA/IHsgcmVzb3VyY2U6IGFyZzMucmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcnM6IGFyZzMub3ZlcnJpZGVJZGVudGlmaWVyID8gW2FyZzMub3ZlcnJpZGVJZGVudGlmaWVyXSA6IHVuZGVmaW5lZCB9IDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCB8IHVuZGVmaW5lZCA9IChvdmVycmlkZXMgPyBhcmc0IDogYXJnMykgYXMgQ29uZmlndXJhdGlvblRhcmdldCB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCB0YXJnZXRzOiBDb25maWd1cmF0aW9uVGFyZ2V0W10gPSB0YXJnZXQgPyBbdGFyZ2V0XSA6IFtdO1xuXG5cdFx0aWYgKG92ZXJyaWRlcz8ub3ZlcnJpZGVJZGVudGlmaWVycykge1xuXHRcdFx0b3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcnMgPSBkaXN0aW5jdChvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycyk7XG5cdFx0XHRvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycyA9IG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzLmxlbmd0aCA/IG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzIDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghdGFyZ2V0cy5sZW5ndGgpIHtcblx0XHRcdGlmIChvdmVycmlkZXM/Lm92ZXJyaWRlSWRlbnRpZmllcnMgJiYgb3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvbmZpZ3VyYXRpb24gVGFyZ2V0IGlzIHJlcXVpcmVkIHdoaWxlIHVwZGF0aW5nIHRoZSB2YWx1ZSBmb3IgbXVsdGlwbGUgb3ZlcnJpZGUgaWRlbnRpZmllcnMnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGluc3BlY3QgPSB0aGlzLmluc3BlY3Qoa2V5LCB7IHJlc291cmNlOiBvdmVycmlkZXM/LnJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IG92ZXJyaWRlcz8ub3ZlcnJpZGVJZGVudGlmaWVycyA/IG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzWzBdIDogdW5kZWZpbmVkIH0pO1xuXHRcdFx0dGFyZ2V0cy5wdXNoKC4uLnRoaXMuZGVyaXZlQ29uZmlndXJhdGlvblRhcmdldHMoa2V5LCB2YWx1ZSwgaW5zcGVjdCkpO1xuXG5cdFx0XHQvLyBSZW1vdmUgdGhlIHNldHRpbmcsIGlmIHRoZSB2YWx1ZSBpcyBzYW1lIGFzIGRlZmF1bHQgdmFsdWUgYW5kIGlzIHVwZGF0ZWQgb25seSBpbiB1c2VyIHRhcmdldFxuXHRcdFx0aWYgKGVxdWFscyh2YWx1ZSwgaW5zcGVjdC5kZWZhdWx0VmFsdWUpICYmIHRhcmdldHMubGVuZ3RoID09PSAxICYmICh0YXJnZXRzWzBdID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIgfHwgdGFyZ2V0c1swXSA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKSkge1xuXHRcdFx0XHR2YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKHRhcmdldHMubWFwKHRhcmdldCA9PiB0aGlzLndyaXRlQ29uZmlndXJhdGlvblZhbHVlKGtleSwgdmFsdWUsIHRhcmdldCwgb3ZlcnJpZGVzLCBvcHRpb25zKSkpO1xuXHR9XG5cblx0YXN5bmMgcmVsb2FkQ29uZmlndXJhdGlvbih0YXJnZXQ/OiBDb25maWd1cmF0aW9uVGFyZ2V0IHwgSVdvcmtzcGFjZUZvbGRlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5yZWxvYWREZWZhdWx0Q29uZmlndXJhdGlvbigpO1xuXHRcdFx0Y29uc3QgYXBwbGljYXRpb24gPSBhd2FpdCB0aGlzLnJlbG9hZEFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbih0cnVlKTtcblx0XHRcdGNvbnN0IHsgbG9jYWwsIHJlbW90ZSB9ID0gYXdhaXQgdGhpcy5yZWxvYWRVc2VyQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0YXdhaXQgdGhpcy5yZWxvYWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRhd2FpdCB0aGlzLmxvYWRDb25maWd1cmF0aW9uKGFwcGxpY2F0aW9uLCBsb2NhbCwgcmVtb3RlLCB0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNXb3Jrc3BhY2VGb2xkZXIodGFyZ2V0KSkge1xuXHRcdFx0YXdhaXQgdGhpcy5yZWxvYWRXb3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uKHRhcmdldCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3dpdGNoICh0YXJnZXQpIHtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5ERUZBVUxUOlxuXHRcdFx0XHR0aGlzLnJlbG9hZERlZmF1bHRDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRcdHJldHVybjtcblxuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVI6IHtcblx0XHRcdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlIH0gPSBhd2FpdCB0aGlzLnJlbG9hZFVzZXJDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMubG9hZENvbmZpZ3VyYXRpb24odGhpcy5fY29uZmlndXJhdGlvbi5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24sIGxvY2FsLCByZW1vdGUsIHRydWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDpcblx0XHRcdFx0YXdhaXQgdGhpcy5yZWxvYWRMb2NhbFVzZXJDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRcdHJldHVybjtcblxuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFOlxuXHRcdFx0XHRhd2FpdCB0aGlzLnJlbG9hZFJlbW90ZVVzZXJDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRcdHJldHVybjtcblxuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTpcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSOlxuXHRcdFx0XHRhd2FpdCB0aGlzLnJlbG9hZFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdGhhc0NhY2hlZENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0Q29uZmlndXJhdGlvbi5oYXNDYWNoZWRDb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMoKTtcblx0fVxuXG5cdGluc3BlY3Q8VD4oa2V5OiBzdHJpbmcsIG92ZXJyaWRlcz86IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzKTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxUPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24uaW5zcGVjdDxUPihrZXksIG92ZXJyaWRlcyk7XG5cdH1cblxuXHRrZXlzKCk6IHtcblx0XHRkZWZhdWx0OiBzdHJpbmdbXTtcblx0XHRwb2xpY3k6IHN0cmluZ1tdO1xuXHRcdHVzZXI6IHN0cmluZ1tdO1xuXHRcdHdvcmtzcGFjZTogc3RyaW5nW107XG5cdFx0d29ya3NwYWNlRm9sZGVyOiBzdHJpbmdbXTtcblx0fSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24ua2V5cygpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHdoZW5SZW1vdGVDb25maWd1cmF0aW9uTG9hZGVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuaW5pdFJlbW90ZVVzZXJDb25maWd1cmF0aW9uQmFycmllci53YWl0KCk7XG5cdH1cblxuXHQvKipcblx0ICogQXQgcHJlc2VudCwgYWxsIHdvcmtzcGFjZXMgKGVtcHR5LCBzaW5nbGUtZm9sZGVyLCBtdWx0aS1yb290KSBpbiBsb2NhbCBhbmQgcmVtb3RlXG5cdCAqIGNhbiBiZSBpbml0aWFsaXplZCB3aXRob3V0IHJlcXVpcmluZyBleHRlbnNpb24gaG9zdCBleGNlcHQgZm9sbG93aW5nIGNhc2U6XG5cdCAqXG5cdCAqIEEgbXVsdGkgcm9vdCB3b3Jrc3BhY2Ugd2l0aCAuY29kZS13b3Jrc3BhY2UgZmlsZSB0aGF0IGhhcyB0byBiZSByZXNvbHZlZCBieSBhbiBleHRlbnNpb24uXG5cdCAqIEJlY2F1c2Ugb2YgcmVhZG9ubHkgYHJvb3RQYXRoYCBwcm9wZXJ0eSBpbiBleHRlbnNpb24gQVBJIHdlIGhhdmUgdG8gcmVzb2x2ZSBtdWx0aSByb290IHdvcmtzcGFjZVxuXHQgKiBiZWZvcmUgZXh0ZW5zaW9uIGhvc3Qgc3RhcnRzIHNvIHRoYXQgYHJvb3RQYXRoYCBjYW4gYmUgc2V0IHRvIGZpcnN0IGZvbGRlci5cblx0ICpcblx0ICogVGhpcyByZXN0cmljdGlvbiBpcyBsaWZ0ZWQgcGFydGlhbGx5IGZvciB3ZWIgaW4gYE1haW5UaHJlYWRXb3Jrc3BhY2VgLlxuXHQgKiBJbiB3ZWIsIHdlIHN0YXJ0IGV4dGVuc2lvbiBob3N0IHdpdGggZW1wdHkgYHJvb3RQYXRoYCBpbiB0aGlzIGNhc2UuXG5cdCAqXG5cdCAqIFJlbGF0ZWQgcm9vdCBwYXRoIGlzc3VlIGRpc2N1c3Npb24gaXMgYmVpbmcgdHJhY2tlZCBoZXJlIC0gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzY5MzM1XG5cdCAqL1xuXHRhc3luYyBpbml0aWFsaXplKGFyZzogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRtYXJrKCdjb2RlL3dpbGxJbml0V29ya3NwYWNlU2VydmljZScpO1xuXG5cdFx0Y29uc3QgdHJpZ2dlciA9IHRoaXMuaW5pdGlhbGl6ZWQ7XG5cdFx0dGhpcy5pbml0aWFsaXplZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IHRoaXMuY3JlYXRlV29ya3NwYWNlKGFyZyk7XG5cdFx0YXdhaXQgdGhpcy51cGRhdGVXb3Jrc3BhY2VBbmRJbml0aWFsaXplQ29uZmlndXJhdGlvbih3b3Jrc3BhY2UsIHRyaWdnZXIpO1xuXHRcdHRoaXMuY2hlY2tBbmRNYXJrV29ya3NwYWNlQ29tcGxldGUoZmFsc2UpO1xuXG5cdFx0bWFyaygnY29kZS9kaWRJbml0V29ya3NwYWNlU2VydmljZScpO1xuXHR9XG5cblx0dXBkYXRlV29ya3NwYWNlVHJ1c3QodHJ1c3RlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzV29ya3NwYWNlVHJ1c3RlZCAhPT0gdHJ1c3RlZCkge1xuXHRcdFx0dGhpcy5pc1dvcmtzcGFjZVRydXN0ZWQgPSB0cnVzdGVkO1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCk7XG5cdFx0XHRjb25zdCBmb2xkZXJDb25maWd1cmF0aW9uTW9kZWxzOiAoQ29uZmlndXJhdGlvbk1vZGVsIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiB0aGlzLndvcmtzcGFjZS5mb2xkZXJzKSB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlckNvbmZpZ3VyYXRpb24gPSB0aGlzLmNhY2hlZEZvbGRlckNvbmZpZ3MuZ2V0KGZvbGRlci51cmkpO1xuXHRcdFx0XHRsZXQgY29uZmlndXJhdGlvbk1vZGVsOiBDb25maWd1cmF0aW9uTW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChmb2xkZXJDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdFx0Y29uZmlndXJhdGlvbk1vZGVsID0gZm9sZGVyQ29uZmlndXJhdGlvbi51cGRhdGVXb3Jrc3BhY2VUcnVzdCh0aGlzLmlzV29ya3NwYWNlVHJ1c3RlZCk7XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVGb2xkZXJDb25maWd1cmF0aW9uKGZvbGRlci51cmksIGNvbmZpZ3VyYXRpb25Nb2RlbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9sZGVyQ29uZmlndXJhdGlvbk1vZGVscy5wdXNoKGNvbmZpZ3VyYXRpb25Nb2RlbCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIpIHtcblx0XHRcdFx0aWYgKGZvbGRlckNvbmZpZ3VyYXRpb25Nb2RlbHNbMF0pIHtcblx0XHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnVwZGF0ZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb24oZm9sZGVyQ29uZmlndXJhdGlvbk1vZGVsc1swXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlV29ya3NwYWNlQ29uZmlndXJhdGlvbih0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24udXBkYXRlV29ya3NwYWNlVHJ1c3QodGhpcy5pc1dvcmtzcGFjZVRydXN0ZWQpKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudXBkYXRlUmVzdHJpY3RlZFNldHRpbmdzKCk7XG5cblx0XHRcdGxldCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0aWYgKHRoaXMucmVzdHJpY3RlZFNldHRpbmdzLnVzZXJMb2NhbCkge1xuXHRcdFx0XHRrZXlzLnB1c2goLi4udGhpcy5yZXN0cmljdGVkU2V0dGluZ3MudXNlckxvY2FsKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnJlc3RyaWN0ZWRTZXR0aW5ncy51c2VyUmVtb3RlKSB7XG5cdFx0XHRcdGtleXMucHVzaCguLi50aGlzLnJlc3RyaWN0ZWRTZXR0aW5ncy51c2VyUmVtb3RlKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnJlc3RyaWN0ZWRTZXR0aW5ncy53b3Jrc3BhY2UpIHtcblx0XHRcdFx0a2V5cy5wdXNoKC4uLnRoaXMucmVzdHJpY3RlZFNldHRpbmdzLndvcmtzcGFjZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnJlc3RyaWN0ZWRTZXR0aW5ncy53b3Jrc3BhY2VGb2xkZXI/LmZvckVhY2goKHZhbHVlKSA9PiBrZXlzLnB1c2goLi4udmFsdWUpKTtcblx0XHRcdGtleXMgPSBkaXN0aW5jdChrZXlzKTtcblx0XHRcdGlmIChrZXlzLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLnRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKHsga2V5cywgb3ZlcnJpZGVzOiBbXSB9LCB7IGRhdGEsIHdvcmtzcGFjZTogdGhpcy53b3Jrc3BhY2UgfSwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFjcXVpcmVJbnN0YW50aWF0aW9uU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHR9XG5cblx0aXNTZXR0aW5nQXBwbGllZEZvckFsbFByb2ZpbGVzKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2NvcGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpW2tleV0/LnNjb3BlO1xuXHRcdGlmIChzY29wZSAmJiBBUFBMSUNBVElPTl9TQ09QRVMuaW5jbHVkZXMoc2NvcGUpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgYWxsUHJvZmlsZXNTZXR0aW5ncyA9IHRoaXMuZ2V0VmFsdWU8c3RyaW5nW10+KEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HKSA/PyBbXTtcblx0XHRyZXR1cm4gQXJyYXkuaXNBcnJheShhbGxQcm9maWxlc1NldHRpbmdzKSAmJiBhbGxQcm9maWxlc1NldHRpbmdzLmluY2x1ZGVzKGtleSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZVdvcmtzcGFjZShhcmc6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTxXb3Jrc3BhY2U+IHtcblx0XHRpZiAoaXNXb3Jrc3BhY2VJZGVudGlmaWVyKGFyZykpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZU11bHRpRm9sZGVyV29ya3NwYWNlKGFyZyk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcihhcmcpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVTaW5nbGVGb2xkZXJXb3Jrc3BhY2UoYXJnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVFbXB0eVdvcmtzcGFjZShhcmcpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVNdWx0aUZvbGRlcldvcmtzcGFjZSh3b3Jrc3BhY2VJZGVudGlmaWVyOiBJV29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8V29ya3NwYWNlPiB7XG5cdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLmluaXRpYWxpemUoeyBpZDogd29ya3NwYWNlSWRlbnRpZmllci5pZCwgY29uZmlnUGF0aDogd29ya3NwYWNlSWRlbnRpZmllci5jb25maWdQYXRoIH0sIHRoaXMuaXNXb3Jrc3BhY2VUcnVzdGVkKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb25maWdQYXRoID0gd29ya3NwYWNlSWRlbnRpZmllci5jb25maWdQYXRoO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB0b1dvcmtzcGFjZUZvbGRlcnModGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLmdldEZvbGRlcnMoKSwgd29ya3NwYWNlQ29uZmlnUGF0aCwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VJZCA9IHdvcmtzcGFjZUlkZW50aWZpZXIuaWQ7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbmV3IFdvcmtzcGFjZSh3b3Jrc3BhY2VJZCwgd29ya3NwYWNlRm9sZGVycywgdGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLmlzVHJhbnNpZW50KCksIHdvcmtzcGFjZUNvbmZpZ1BhdGgsIHVyaSA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaWdub3JlUGF0aENhc2luZyh1cmkpKTtcblx0XHR3b3Jrc3BhY2UuaW5pdGlhbGl6ZWQgPSB0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZWQ7XG5cdFx0cmV0dXJuIHdvcmtzcGFjZTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2luZ2xlRm9sZGVyV29ya3NwYWNlKHNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXI6IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKTogV29ya3NwYWNlIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBuZXcgV29ya3NwYWNlKHNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIuaWQsIFt0b1dvcmtzcGFjZUZvbGRlcihzaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLnVyaSldLCBmYWxzZSwgbnVsbCwgdXJpID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pZ25vcmVQYXRoQ2FzaW5nKHVyaSkpO1xuXHRcdHdvcmtzcGFjZS5pbml0aWFsaXplZCA9IHRydWU7XG5cdFx0cmV0dXJuIHdvcmtzcGFjZTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRW1wdHlXb3Jrc3BhY2UoZW1wdHlXb3Jrc3BhY2VJZGVudGlmaWVyOiBJRW1wdHlXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTxXb3Jrc3BhY2U+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBuZXcgV29ya3NwYWNlKGVtcHR5V29ya3NwYWNlSWRlbnRpZmllci5pZCwgW10sIGZhbHNlLCBudWxsLCB1cmkgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlnbm9yZVBhdGhDYXNpbmcodXJpKSk7XG5cdFx0d29ya3NwYWNlLmluaXRpYWxpemVkID0gdHJ1ZTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHdvcmtzcGFjZSk7XG5cdH1cblxuXHRwcml2YXRlIGNoZWNrQW5kTWFya1dvcmtzcGFjZUNvbXBsZXRlKGZyb21DYWNoZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb21wbGV0ZVdvcmtzcGFjZUJhcnJpZXIuaXNPcGVuKCkgJiYgdGhpcy53b3Jrc3BhY2UuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdHRoaXMuY29tcGxldGVXb3Jrc3BhY2VCYXJyaWVyLm9wZW4oKTtcblx0XHRcdHRoaXMudmFsaWRhdGVXb3Jrc3BhY2VGb2xkZXJzQW5kUmVsb2FkKGZyb21DYWNoZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVXb3Jrc3BhY2VBbmRJbml0aWFsaXplQ29uZmlndXJhdGlvbih3b3Jrc3BhY2U6IFdvcmtzcGFjZSwgdHJpZ2dlcjogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGhhc1dvcmtzcGFjZUJlZm9yZSA9ICEhdGhpcy53b3Jrc3BhY2U7XG5cdFx0bGV0IHByZXZpb3VzU3RhdGU6IFdvcmtiZW5jaFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBwcmV2aW91c1dvcmtzcGFjZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcHJldmlvdXNGb2xkZXJzOiBXb3Jrc3BhY2VGb2xkZXJbXSA9IFtdO1xuXG5cdFx0aWYgKGhhc1dvcmtzcGFjZUJlZm9yZSkge1xuXHRcdFx0cHJldmlvdXNTdGF0ZSA9IHRoaXMuZ2V0V29ya2JlbmNoU3RhdGUoKTtcblx0XHRcdHByZXZpb3VzV29ya3NwYWNlUGF0aCA9IHRoaXMud29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gPyB0aGlzLndvcmtzcGFjZS5jb25maWd1cmF0aW9uLmZzUGF0aCA6IHVuZGVmaW5lZDtcblx0XHRcdHByZXZpb3VzRm9sZGVycyA9IHRoaXMud29ya3NwYWNlLmZvbGRlcnM7XG5cdFx0XHR0aGlzLndvcmtzcGFjZS51cGRhdGUod29ya3NwYWNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy53b3Jrc3BhY2UgPSB3b3Jrc3BhY2U7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5pbml0aWFsaXplQ29uZmlndXJhdGlvbih0cmlnZ2VyKTtcblxuXHRcdC8vIFRyaWdnZXIgY2hhbmdlcyBhZnRlciBjb25maWd1cmF0aW9uIGluaXRpYWxpemF0aW9uIHNvIHRoYXQgY29uZmlndXJhdGlvbiBpcyB1cCB0byBkYXRlLlxuXHRcdGlmIChoYXNXb3Jrc3BhY2VCZWZvcmUpIHtcblx0XHRcdGNvbnN0IG5ld1N0YXRlID0gdGhpcy5nZXRXb3JrYmVuY2hTdGF0ZSgpO1xuXHRcdFx0aWYgKHByZXZpb3VzU3RhdGUgJiYgbmV3U3RhdGUgIT09IHByZXZpb3VzU3RhdGUpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZS5maXJlKG5ld1N0YXRlKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV3V29ya3NwYWNlUGF0aCA9IHRoaXMud29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gPyB0aGlzLndvcmtzcGFjZS5jb25maWd1cmF0aW9uLmZzUGF0aCA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChwcmV2aW91c1dvcmtzcGFjZVBhdGggJiYgbmV3V29ya3NwYWNlUGF0aCAhPT0gcHJldmlvdXNXb3Jrc3BhY2VQYXRoIHx8IG5ld1N0YXRlICE9PSBwcmV2aW91c1N0YXRlKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlV29ya3NwYWNlTmFtZS5maXJlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZvbGRlckNoYW5nZXMgPSB0aGlzLmNvbXBhcmVGb2xkZXJzKHByZXZpb3VzRm9sZGVycywgdGhpcy53b3Jrc3BhY2UuZm9sZGVycyk7XG5cdFx0XHRpZiAoZm9sZGVyQ2hhbmdlcyAmJiAoZm9sZGVyQ2hhbmdlcy5hZGRlZC5sZW5ndGggfHwgZm9sZGVyQ2hhbmdlcy5yZW1vdmVkLmxlbmd0aCB8fCBmb2xkZXJDaGFuZ2VzLmNoYW5nZWQubGVuZ3RoKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmhhbmRsZVdpbGxDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKGZvbGRlckNoYW5nZXMsIGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzLmZpcmUoZm9sZGVyQ2hhbmdlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24uaGFzVGFza3NMb2FkZWQpIHtcblx0XHRcdC8vIFJlbG9hZCBsb2NhbCB1c2VyIGNvbmZpZ3VyYXRpb24gYWdhaW4gdG8gbG9hZCB1c2VyIHRhc2tzXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihydW5XaGVuV2luZG93SWRsZShtYWluV2luZG93LCAoKSA9PiB0aGlzLnJlbG9hZExvY2FsVXNlckNvbmZpZ3VyYXRpb24oZmFsc2UsIHRoaXMuX2NvbmZpZ3VyYXRpb24ubG9jYWxVc2VyQ29uZmlndXJhdGlvbikpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNvbXBhcmVGb2xkZXJzKGN1cnJlbnRGb2xkZXJzOiBJV29ya3NwYWNlRm9sZGVyW10sIG5ld0ZvbGRlcnM6IElXb3Jrc3BhY2VGb2xkZXJbXSk6IElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQge1xuXHRcdGNvbnN0IHJlc3VsdDogSVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudCA9IHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW10gfTtcblx0XHRyZXN1bHQuYWRkZWQgPSBuZXdGb2xkZXJzLmZpbHRlcihuZXdGb2xkZXIgPT4gIWN1cnJlbnRGb2xkZXJzLnNvbWUoY3VycmVudEZvbGRlciA9PiBuZXdGb2xkZXIudXJpLnRvU3RyaW5nKCkgPT09IGN1cnJlbnRGb2xkZXIudXJpLnRvU3RyaW5nKCkpKTtcblx0XHRmb3IgKGxldCBjdXJyZW50SW5kZXggPSAwOyBjdXJyZW50SW5kZXggPCBjdXJyZW50Rm9sZGVycy5sZW5ndGg7IGN1cnJlbnRJbmRleCsrKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50Rm9sZGVyID0gY3VycmVudEZvbGRlcnNbY3VycmVudEluZGV4XTtcblx0XHRcdGxldCBuZXdJbmRleCA9IDA7XG5cdFx0XHRmb3IgKG5ld0luZGV4ID0gMDsgbmV3SW5kZXggPCBuZXdGb2xkZXJzLmxlbmd0aCAmJiBjdXJyZW50Rm9sZGVyLnVyaS50b1N0cmluZygpICE9PSBuZXdGb2xkZXJzW25ld0luZGV4XS51cmkudG9TdHJpbmcoKTsgbmV3SW5kZXgrKykgeyB9XG5cdFx0XHRpZiAobmV3SW5kZXggPCBuZXdGb2xkZXJzLmxlbmd0aCkge1xuXHRcdFx0XHRpZiAoY3VycmVudEluZGV4ICE9PSBuZXdJbmRleCB8fCBjdXJyZW50Rm9sZGVyLm5hbWUgIT09IG5ld0ZvbGRlcnNbbmV3SW5kZXhdLm5hbWUpIHtcblx0XHRcdFx0XHRyZXN1bHQuY2hhbmdlZC5wdXNoKGN1cnJlbnRGb2xkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQucmVtb3ZlZC5wdXNoKGN1cnJlbnRGb2xkZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplQ29uZmlndXJhdGlvbih0cmlnZ2VyOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5kZWZhdWx0Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHRjb25zdCBpbml0UG9saWN5Q29uZmlndXJhdGlvblByb21pc2UgPSB0aGlzLnBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGluaXRBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb25Qcm9taXNlID0gdGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gPyB0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbi5pbml0aWFsaXplKCkgOiBQcm9taXNlLnJlc29sdmUoQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwodGhpcy5sb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaW5pdFVzZXJDb25maWd1cmF0aW9uID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0bWFyaygnY29kZS93aWxsSW5pdFVzZXJDb25maWd1cmF0aW9uJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlLmFsbChbdGhpcy5sb2NhbFVzZXJDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKSwgdGhpcy5yZW1vdGVVc2VyQ29uZmlndXJhdGlvbiA/IHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpIDogUHJvbWlzZS5yZXNvbHZlKENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKHRoaXMubG9nU2VydmljZSkpXSk7XG5cdFx0XHRpZiAodGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0Y29uc3QgYXBwbGljYXRpb25Db25maWd1cmF0aW9uTW9kZWwgPSBhd2FpdCBpbml0QXBwbGljYXRpb25Db25maWd1cmF0aW9uUHJvbWlzZTtcblx0XHRcdFx0cmVzdWx0WzBdID0gdGhpcy5sb2NhbFVzZXJDb25maWd1cmF0aW9uLnJlcGFyc2UoeyBleGNsdWRlOiBhcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZShBUFBMWV9BTExfUFJPRklMRVNfU0VUVElORykgfSk7XG5cdFx0XHR9XG5cdFx0XHRtYXJrKCdjb2RlL2RpZEluaXRVc2VyQ29uZmlndXJhdGlvbicpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgWywgYXBwbGljYXRpb24sIFtsb2NhbCwgcmVtb3RlXV0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRpbml0UG9saWN5Q29uZmlndXJhdGlvblByb21pc2UsXG5cdFx0XHRpbml0QXBwbGljYXRpb25Db25maWd1cmF0aW9uUHJvbWlzZSxcblx0XHRcdGluaXRVc2VyQ29uZmlndXJhdGlvbigpXG5cdFx0XSk7XG5cblx0XHRtYXJrKCdjb2RlL3dpbGxJbml0V29ya3NwYWNlQ29uZmlndXJhdGlvbicpO1xuXHRcdGF3YWl0IHRoaXMubG9hZENvbmZpZ3VyYXRpb24oYXBwbGljYXRpb24sIGxvY2FsLCByZW1vdGUsIHRyaWdnZXIpO1xuXHRcdG1hcmsoJ2NvZGUvZGlkSW5pdFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24nKTtcblx0fVxuXG5cdHByaXZhdGUgcmVsb2FkRGVmYXVsdENvbmZpZ3VyYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5vbkRlZmF1bHRDb25maWd1cmF0aW9uQ2hhbmdlZCh0aGlzLmRlZmF1bHRDb25maWd1cmF0aW9uLnJlbG9hZCgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVsb2FkQXBwbGljYXRpb25Db25maWd1cmF0aW9uKGRvbm90VHJpZ2dlcj86IGJvb2xlYW4pOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD4ge1xuXHRcdGlmICghdGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbCh0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uLmxvYWRDb25maWd1cmF0aW9uKCk7XG5cdFx0aWYgKCFkb25vdFRyaWdnZXIpIHtcblx0XHRcdHRoaXMub25BcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKG1vZGVsKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWxvYWRVc2VyQ29uZmlndXJhdGlvbigpOiBQcm9taXNlPHsgbG9jYWw6IENvbmZpZ3VyYXRpb25Nb2RlbDsgcmVtb3RlOiBDb25maWd1cmF0aW9uTW9kZWwgfT4ge1xuXHRcdGNvbnN0IFtsb2NhbCwgcmVtb3RlXSA9IGF3YWl0IFByb21pc2UuYWxsKFt0aGlzLnJlbG9hZExvY2FsVXNlckNvbmZpZ3VyYXRpb24odHJ1ZSksIHRoaXMucmVsb2FkUmVtb3RlVXNlckNvbmZpZ3VyYXRpb24odHJ1ZSldKTtcblx0XHRyZXR1cm4geyBsb2NhbCwgcmVtb3RlIH07XG5cdH1cblxuXHRhc3luYyByZWxvYWRMb2NhbFVzZXJDb25maWd1cmF0aW9uKGRvbm90VHJpZ2dlcj86IGJvb2xlYW4sIHNldHRpbmdzQ29uZmlndXJhdGlvbj86IENvbmZpZ3VyYXRpb25Nb2RlbCk6IFByb21pc2U8Q29uZmlndXJhdGlvbk1vZGVsPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24ucmVsb2FkKHNldHRpbmdzQ29uZmlndXJhdGlvbik7XG5cdFx0aWYgKCFkb25vdFRyaWdnZXIpIHtcblx0XHRcdHRoaXMub25Mb2NhbFVzZXJDb25maWd1cmF0aW9uQ2hhbmdlZChtb2RlbCk7XG5cdFx0fVxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVsb2FkUmVtb3RlVXNlckNvbmZpZ3VyYXRpb24oZG9ub3RUcmlnZ2VyPzogYm9vbGVhbik6IFByb21pc2U8Q29uZmlndXJhdGlvbk1vZGVsPiB7XG5cdFx0aWYgKHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5yZW1vdGVVc2VyQ29uZmlndXJhdGlvbi5yZWxvYWQoKTtcblx0XHRcdGlmICghZG9ub3RUcmlnZ2VyKSB7XG5cdFx0XHRcdHRoaXMub25SZW1vdGVVc2VyQ29uZmlndXJhdGlvbkNoYW5nZWQobW9kZWwpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1vZGVsO1xuXHRcdH1cblx0XHRyZXR1cm4gQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwodGhpcy5sb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVsb2FkV29ya3NwYWNlQ29uZmlndXJhdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3JrYmVuY2hTdGF0ZSA9IHRoaXMuZ2V0V29ya2JlbmNoU3RhdGUoKTtcblx0XHRpZiAod29ya2JlbmNoU3RhdGUgPT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUikge1xuXHRcdFx0cmV0dXJuIHRoaXMub25Xb3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uQ2hhbmdlZCh0aGlzLndvcmtzcGFjZS5mb2xkZXJzWzBdKTtcblx0XHR9XG5cdFx0aWYgKHdvcmtiZW5jaFN0YXRlID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UpIHtcblx0XHRcdHJldHVybiB0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24ucmVsb2FkKCkudGhlbigoKSA9PiB0aGlzLm9uV29ya3NwYWNlQ29uZmlndXJhdGlvbkNoYW5nZWQoZmFsc2UpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbG9hZFdvcmtzcGFjZUZvbGRlckNvbmZpZ3VyYXRpb24oZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMub25Xb3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uQ2hhbmdlZChmb2xkZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2FkQ29uZmlndXJhdGlvbihhcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb25Nb2RlbDogQ29uZmlndXJhdGlvbk1vZGVsLCB1c2VyQ29uZmlndXJhdGlvbk1vZGVsOiBDb25maWd1cmF0aW9uTW9kZWwsIHJlbW90ZVVzZXJDb25maWd1cmF0aW9uTW9kZWw6IENvbmZpZ3VyYXRpb25Nb2RlbCwgdHJpZ2dlcjogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIHJlc2V0IGNhY2hlc1xuXHRcdHRoaXMuY2FjaGVkRm9sZGVyQ29uZmlncy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblxuXHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZS5mb2xkZXJzO1xuXHRcdGNvbnN0IGZvbGRlckNvbmZpZ3VyYXRpb25zID0gYXdhaXQgdGhpcy5sb2FkRm9sZGVyQ29uZmlndXJhdGlvbnMoZm9sZGVycyk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VDb25maWd1cmF0aW9uID0gdGhpcy5nZXRXb3Jrc3BhY2VDb25maWd1cmF0aW9uTW9kZWwoZm9sZGVyQ29uZmlndXJhdGlvbnMpO1xuXHRcdGNvbnN0IGZvbGRlckNvbmZpZ3VyYXRpb25Nb2RlbHMgPSBuZXcgUmVzb3VyY2VNYXA8Q29uZmlndXJhdGlvbk1vZGVsPigpO1xuXHRcdGZvbGRlckNvbmZpZ3VyYXRpb25zLmZvckVhY2goKGZvbGRlckNvbmZpZ3VyYXRpb24sIGluZGV4KSA9PiBmb2xkZXJDb25maWd1cmF0aW9uTW9kZWxzLnNldChmb2xkZXJzW2luZGV4XS51cmksIGZvbGRlckNvbmZpZ3VyYXRpb24pKTtcblxuXHRcdGNvbnN0IGN1cnJlbnRDb25maWd1cmF0aW9uID0gdGhpcy5fY29uZmlndXJhdGlvbjtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uID0gbmV3IENvbmZpZ3VyYXRpb24odGhpcy5kZWZhdWx0Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwsIHRoaXMucG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwsIGFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbk1vZGVsLCB1c2VyQ29uZmlndXJhdGlvbk1vZGVsLCByZW1vdGVVc2VyQ29uZmlndXJhdGlvbk1vZGVsLCB3b3Jrc3BhY2VDb25maWd1cmF0aW9uLCBmb2xkZXJDb25maWd1cmF0aW9uTW9kZWxzLCBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbCh0aGlzLmxvZ1NlcnZpY2UpLCBuZXcgUmVzb3VyY2VNYXA8Q29uZmlndXJhdGlvbk1vZGVsPigpLCB0aGlzLndvcmtzcGFjZSwgdGhpcy5sb2dTZXJ2aWNlKTtcblxuXHRcdHRoaXMuaW5pdGlhbGl6ZWQgPSB0cnVlO1xuXG5cdFx0aWYgKHRyaWdnZXIpIHtcblx0XHRcdGNvbnN0IGNoYW5nZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZShjdXJyZW50Q29uZmlndXJhdGlvbik7XG5cdFx0XHR0aGlzLnRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKGNoYW5nZSwgeyBkYXRhOiBjdXJyZW50Q29uZmlndXJhdGlvbi50b0RhdGEoKSwgd29ya3NwYWNlOiB0aGlzLndvcmtzcGFjZSB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVSZXN0cmljdGVkU2V0dGluZ3MoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0V29ya3NwYWNlQ29uZmlndXJhdGlvbk1vZGVsKGZvbGRlckNvbmZpZ3VyYXRpb25zOiBDb25maWd1cmF0aW9uTW9kZWxbXSk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0c3dpdGNoICh0aGlzLmdldFdvcmtiZW5jaFN0YXRlKCkpIHtcblx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuRk9MREVSOlxuXHRcdFx0XHRyZXR1cm4gZm9sZGVyQ29uZmlndXJhdGlvbnNbMF07XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTpcblx0XHRcdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5nZXRDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwodGhpcy5sb2dTZXJ2aWNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uVXNlckRhdGFQcm9maWxlQ2hhbmdlZChlOiBEaWRDaGFuZ2VVc2VyRGF0YVByb2ZpbGVFdmVudCk6IHZvaWQge1xuXHRcdGUuam9pbigoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8Q29uZmlndXJhdGlvbk1vZGVsPltdID0gW107XG5cdFx0XHRwcm9taXNlcy5wdXNoKHRoaXMubG9jYWxVc2VyQ29uZmlndXJhdGlvbi5yZXNldChlLnByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSwgZS5wcm9maWxlLnRhc2tzUmVzb3VyY2UsIGUucHJvZmlsZS5tY3BSZXNvdXJjZSwgeyBzY29wZXM6IGdldExvY2FsVXNlckNvbmZpZ3VyYXRpb25TY29wZXMoZS5wcm9maWxlLCAhIXRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24pIH0pKTtcblx0XHRcdGlmIChlLnByZXZpb3VzLmlzRGVmYXVsdCAhPT0gZS5wcm9maWxlLmlzRGVmYXVsdFxuXHRcdFx0XHR8fCAhIWUucHJldmlvdXMudXNlRGVmYXVsdEZsYWdzPy5zZXR0aW5ncyAhPT0gISFlLnByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy5zZXR0aW5ncykge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZUFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0XHRpZiAodGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0XHRwcm9taXNlcy5wdXNoKHRoaXMucmVsb2FkQXBwbGljYXRpb25Db25maWd1cmF0aW9uKHRydWUpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0bGV0IFtsb2NhbFVzZXIsIGFwcGxpY2F0aW9uXSA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0XHRcdGFwcGxpY2F0aW9uID0gYXBwbGljYXRpb24gPz8gdGhpcy5fY29uZmlndXJhdGlvbi5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb247XG5cdFx0XHRpZiAodGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0bG9jYWxVc2VyID0gdGhpcy5sb2NhbFVzZXJDb25maWd1cmF0aW9uLnJlcGFyc2UoeyBleGNsdWRlOiBhcHBsaWNhdGlvbi5nZXRWYWx1ZShBUFBMWV9BTExfUFJPRklMRVNfU0VUVElORykgfSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLmxvYWRDb25maWd1cmF0aW9uKGFwcGxpY2F0aW9uLCBsb2NhbFVzZXIsIHRoaXMuX2NvbmZpZ3VyYXRpb24ucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24sIHRydWUpO1xuXHRcdH0pKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRlZmF1bHRDb25maWd1cmF0aW9uQ2hhbmdlZChjb25maWd1cmF0aW9uTW9kZWw6IENvbmZpZ3VyYXRpb25Nb2RlbCwgcHJvcGVydGllcz86IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlKSB7XG5cdFx0XHRjb25zdCBwcmV2aW91c0RhdGEgPSB0aGlzLl9jb25maWd1cmF0aW9uLnRvRGF0YSgpO1xuXHRcdFx0Y29uc3QgY2hhbmdlID0gdGhpcy5fY29uZmlndXJhdGlvbi5jb21wYXJlQW5kVXBkYXRlRGVmYXVsdENvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbk1vZGVsLCBwcm9wZXJ0aWVzKTtcblx0XHRcdGlmICh0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbikge1xuXHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnVwZGF0ZUFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbih0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbi5yZXBhcnNlKCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVMb2NhbFVzZXJDb25maWd1cmF0aW9uKHRoaXMubG9jYWxVc2VyQ29uZmlndXJhdGlvbi5yZXBhcnNlKCkpO1xuXHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnVwZGF0ZVJlbW90ZVVzZXJDb25maWd1cmF0aW9uKHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24ucmVwYXJzZSgpKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUikge1xuXHRcdFx0XHRjb25zdCBmb2xkZXJDb25maWd1cmF0aW9uID0gdGhpcy5jYWNoZWRGb2xkZXJDb25maWdzLmdldCh0aGlzLndvcmtzcGFjZS5mb2xkZXJzWzBdLnVyaSk7XG5cdFx0XHRcdGlmIChmb2xkZXJDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVXb3Jrc3BhY2VDb25maWd1cmF0aW9uKGZvbGRlckNvbmZpZ3VyYXRpb24ucmVwYXJzZSgpKTtcblx0XHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnVwZGF0ZUZvbGRlckNvbmZpZ3VyYXRpb24odGhpcy53b3Jrc3BhY2UuZm9sZGVyc1swXS51cmksIGZvbGRlckNvbmZpZ3VyYXRpb24ucmVwYXJzZSgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVXb3Jrc3BhY2VDb25maWd1cmF0aW9uKHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5yZXBhcnNlV29ya3NwYWNlU2V0dGluZ3MoKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIHRoaXMud29ya3NwYWNlLmZvbGRlcnMpIHtcblx0XHRcdFx0XHRjb25zdCBmb2xkZXJDb25maWd1cmF0aW9uID0gdGhpcy5jYWNoZWRGb2xkZXJDb25maWdzLmdldChmb2xkZXIudXJpKTtcblx0XHRcdFx0XHRpZiAoZm9sZGVyQ29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVGb2xkZXJDb25maWd1cmF0aW9uKGZvbGRlci51cmksIGZvbGRlckNvbmZpZ3VyYXRpb24ucmVwYXJzZSgpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoY2hhbmdlLCB7IGRhdGE6IHByZXZpb3VzRGF0YSwgd29ya3NwYWNlOiB0aGlzLndvcmtzcGFjZSB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LkRFRkFVTFQpO1xuXHRcdFx0dGhpcy51cGRhdGVSZXN0cmljdGVkU2V0dGluZ3MoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uUG9saWN5Q29uZmlndXJhdGlvbkNoYW5nZWQocG9saWN5Q29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB7IGRhdGE6IHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCksIHdvcmtzcGFjZTogdGhpcy53b3Jrc3BhY2UgfTtcblx0XHRjb25zdCBjaGFuZ2UgPSB0aGlzLl9jb25maWd1cmF0aW9uLmNvbXBhcmVBbmRVcGRhdGVQb2xpY3lDb25maWd1cmF0aW9uKHBvbGljeUNvbmZpZ3VyYXRpb24pO1xuXHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoY2hhbmdlLCBwcmV2aW91cywgQ29uZmlndXJhdGlvblRhcmdldC5ERUZBVUxUKTtcblx0fVxuXG5cdHByaXZhdGUgb25BcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB7IGRhdGE6IHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCksIHdvcmtzcGFjZTogdGhpcy53b3Jrc3BhY2UgfTtcblx0XHRjb25zdCBwcmV2aW91c0FsbFByb2ZpbGVzU2V0dGluZ3MgPSB0aGlzLl9jb25maWd1cmF0aW9uLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbi5nZXRWYWx1ZTxzdHJpbmdbXT4oQVBQTFlfQUxMX1BST0ZJTEVTX1NFVFRJTkcpID8/IFtdO1xuXHRcdGNvbnN0IGNoYW5nZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZFVwZGF0ZUFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbihhcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IGN1cnJlbnRBbGxQcm9maWxlc1NldHRpbmdzID0gdGhpcy5nZXRWYWx1ZTxzdHJpbmdbXT4oQVBQTFlfQUxMX1BST0ZJTEVTX1NFVFRJTkcpID8/IFtdO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRjb25zdCBjaGFuZ2VkS2V5czogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNoYW5nZWRLZXkgb2YgY2hhbmdlLmtleXMpIHtcblx0XHRcdGNvbnN0IHNjb3BlID0gY29uZmlndXJhdGlvblByb3BlcnRpZXNbY2hhbmdlZEtleV0/LnNjb3BlO1xuXHRcdFx0aWYgKHNjb3BlICYmIEFQUExJQ0FUSU9OX1NDT1BFUy5pbmNsdWRlcyhzY29wZSkpIHtcblx0XHRcdFx0Y2hhbmdlZEtleXMucHVzaChjaGFuZ2VkS2V5KTtcblx0XHRcdFx0aWYgKGNoYW5nZWRLZXkgPT09IEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBwcmV2aW91c0FsbFByb2ZpbGVTZXR0aW5nIG9mIHByZXZpb3VzQWxsUHJvZmlsZXNTZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0aWYgKCFjdXJyZW50QWxsUHJvZmlsZXNTZXR0aW5ncy5pbmNsdWRlcyhwcmV2aW91c0FsbFByb2ZpbGVTZXR0aW5nKSkge1xuXHRcdFx0XHRcdFx0XHRjaGFuZ2VkS2V5cy5wdXNoKHByZXZpb3VzQWxsUHJvZmlsZVNldHRpbmcpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGN1cnJlbnRBbGxQcm9maWxlU2V0dGluZyBvZiBjdXJyZW50QWxsUHJvZmlsZXNTZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0aWYgKCFwcmV2aW91c0FsbFByb2ZpbGVzU2V0dGluZ3MuaW5jbHVkZXMoY3VycmVudEFsbFByb2ZpbGVTZXR0aW5nKSkge1xuXHRcdFx0XHRcdFx0XHRjaGFuZ2VkS2V5cy5wdXNoKGN1cnJlbnRBbGxQcm9maWxlU2V0dGluZyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChjdXJyZW50QWxsUHJvZmlsZXNTZXR0aW5ncy5pbmNsdWRlcyhjaGFuZ2VkS2V5KSkge1xuXHRcdFx0XHRjaGFuZ2VkS2V5cy5wdXNoKGNoYW5nZWRLZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjaGFuZ2Uua2V5cyA9IGNoYW5nZWRLZXlzO1xuXHRcdGlmIChjaGFuZ2Uua2V5cy5pbmNsdWRlcyhBUFBMWV9BTExfUFJPRklMRVNfU0VUVElORykpIHtcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlTG9jYWxVc2VyQ29uZmlndXJhdGlvbih0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24ucmVwYXJzZSh7IGV4Y2x1ZGU6IGN1cnJlbnRBbGxQcm9maWxlc1NldHRpbmdzIH0pKTtcblx0XHR9XG5cdFx0dGhpcy50cmlnZ2VyQ29uZmlndXJhdGlvbkNoYW5nZShjaGFuZ2UsIHByZXZpb3VzLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkxvY2FsVXNlckNvbmZpZ3VyYXRpb25DaGFuZ2VkKHVzZXJDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHsgZGF0YTogdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKSwgd29ya3NwYWNlOiB0aGlzLndvcmtzcGFjZSB9O1xuXHRcdGNvbnN0IGNoYW5nZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZFVwZGF0ZUxvY2FsVXNlckNvbmZpZ3VyYXRpb24odXNlckNvbmZpZ3VyYXRpb24pO1xuXHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoY2hhbmdlLCBwcmV2aW91cywgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgb25SZW1vdGVVc2VyQ29uZmlndXJhdGlvbkNoYW5nZWQodXNlckNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzID0geyBkYXRhOiB0aGlzLl9jb25maWd1cmF0aW9uLnRvRGF0YSgpLCB3b3Jrc3BhY2U6IHRoaXMud29ya3NwYWNlIH07XG5cdFx0Y29uc3QgY2hhbmdlID0gdGhpcy5fY29uZmlndXJhdGlvbi5jb21wYXJlQW5kVXBkYXRlUmVtb3RlVXNlckNvbmZpZ3VyYXRpb24odXNlckNvbmZpZ3VyYXRpb24pO1xuXHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoY2hhbmdlLCBwcmV2aW91cywgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25Xb3Jrc3BhY2VDb25maWd1cmF0aW9uQ2hhbmdlZChmcm9tQ2FjaGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2UgJiYgdGhpcy53b3Jrc3BhY2UuY29uZmlndXJhdGlvbikge1xuXHRcdFx0bGV0IG5ld0ZvbGRlcnMgPSB0b1dvcmtzcGFjZUZvbGRlcnModGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLmdldEZvbGRlcnMoKSwgdGhpcy53b3Jrc3BhY2UuY29uZmlndXJhdGlvbiwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpKTtcblxuXHRcdFx0Ly8gVmFsaWRhdGUgb25seSBpZiB3b3Jrc3BhY2UgaXMgaW5pdGlhbGl6ZWRcblx0XHRcdGlmICh0aGlzLndvcmtzcGFjZS5pbml0aWFsaXplZCkge1xuXHRcdFx0XHRjb25zdCB7IGFkZGVkLCByZW1vdmVkLCBjaGFuZ2VkIH0gPSB0aGlzLmNvbXBhcmVGb2xkZXJzKHRoaXMud29ya3NwYWNlLmZvbGRlcnMsIG5ld0ZvbGRlcnMpO1xuXG5cdFx0XHRcdC8qIElmIGNoYW5nZWQgdmFsaWRhdGUgbmV3IGZvbGRlcnMgKi9cblx0XHRcdFx0aWYgKGFkZGVkLmxlbmd0aCB8fCByZW1vdmVkLmxlbmd0aCB8fCBjaGFuZ2VkLmxlbmd0aCkge1xuXHRcdFx0XHRcdG5ld0ZvbGRlcnMgPSBhd2FpdCB0aGlzLnRvVmFsaWRXb3Jrc3BhY2VGb2xkZXJzKG5ld0ZvbGRlcnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8qIE90aGVyd2lzZSB1c2UgZXhpc3RpbmcgKi9cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0bmV3Rm9sZGVycyA9IHRoaXMud29ya3NwYWNlLmZvbGRlcnM7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVXb3Jrc3BhY2VDb25maWd1cmF0aW9uKG5ld0ZvbGRlcnMsIHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5nZXRDb25maWd1cmF0aW9uKCksIGZyb21DYWNoZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVSZXN0cmljdGVkU2V0dGluZ3MoKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbmdlZDogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNvbnN0IGFsbFByb3BlcnRpZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGNvbnN0IGRlZmF1bHRSZXN0cmljdGVkU2V0dGluZ3M6IHN0cmluZ1tdID0gT2JqZWN0LmtleXMoYWxsUHJvcGVydGllcykuZmlsdGVyKGtleSA9PiBhbGxQcm9wZXJ0aWVzW2tleV0ucmVzdHJpY3RlZCkuc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcblx0XHRjb25zdCBkZWZhdWx0RGVsdGEgPSBkZWx0YShkZWZhdWx0UmVzdHJpY3RlZFNldHRpbmdzLCB0aGlzLl9yZXN0cmljdGVkU2V0dGluZ3MuZGVmYXVsdCwgKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cdFx0Y2hhbmdlZC5wdXNoKC4uLmRlZmF1bHREZWx0YS5hZGRlZCwgLi4uZGVmYXVsdERlbHRhLnJlbW92ZWQpO1xuXG5cdFx0Y29uc3QgYXBwbGljYXRpb24gPSAodGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24/LmdldFJlc3RyaWN0ZWRTZXR0aW5ncygpIHx8IFtdKS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXHRcdGNvbnN0IGFwcGxpY2F0aW9uRGVsdGEgPSBkZWx0YShhcHBsaWNhdGlvbiwgdGhpcy5fcmVzdHJpY3RlZFNldHRpbmdzLmFwcGxpY2F0aW9uIHx8IFtdLCAoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcblx0XHRjaGFuZ2VkLnB1c2goLi4uYXBwbGljYXRpb25EZWx0YS5hZGRlZCwgLi4uYXBwbGljYXRpb25EZWx0YS5yZW1vdmVkKTtcblxuXHRcdGNvbnN0IHVzZXJMb2NhbCA9IHRoaXMubG9jYWxVc2VyQ29uZmlndXJhdGlvbi5nZXRSZXN0cmljdGVkU2V0dGluZ3MoKS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXHRcdGNvbnN0IHVzZXJMb2NhbERlbHRhID0gZGVsdGEodXNlckxvY2FsLCB0aGlzLl9yZXN0cmljdGVkU2V0dGluZ3MudXNlckxvY2FsIHx8IFtdLCAoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcblx0XHRjaGFuZ2VkLnB1c2goLi4udXNlckxvY2FsRGVsdGEuYWRkZWQsIC4uLnVzZXJMb2NhbERlbHRhLnJlbW92ZWQpO1xuXG5cdFx0Y29uc3QgdXNlclJlbW90ZSA9ICh0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uPy5nZXRSZXN0cmljdGVkU2V0dGluZ3MoKSB8fCBbXSkuc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcblx0XHRjb25zdCB1c2VyUmVtb3RlRGVsdGEgPSBkZWx0YSh1c2VyUmVtb3RlLCB0aGlzLl9yZXN0cmljdGVkU2V0dGluZ3MudXNlclJlbW90ZSB8fCBbXSwgKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cdFx0Y2hhbmdlZC5wdXNoKC4uLnVzZXJSZW1vdGVEZWx0YS5hZGRlZCwgLi4udXNlclJlbW90ZURlbHRhLnJlbW92ZWQpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyTWFwID0gbmV3IFJlc291cmNlTWFwPFJlYWRvbmx5QXJyYXk8c3RyaW5nPj4oKTtcblx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZUZvbGRlciBvZiB0aGlzLndvcmtzcGFjZS5mb2xkZXJzKSB7XG5cdFx0XHRjb25zdCBjYWNoZWRGb2xkZXJDb25maWcgPSB0aGlzLmNhY2hlZEZvbGRlckNvbmZpZ3MuZ2V0KHdvcmtzcGFjZUZvbGRlci51cmkpO1xuXHRcdFx0Y29uc3QgZm9sZGVyUmVzdHJpY3RlZFNldHRpbmdzID0gKGNhY2hlZEZvbGRlckNvbmZpZz8uZ2V0UmVzdHJpY3RlZFNldHRpbmdzKCkgfHwgW10pLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cdFx0XHRpZiAoZm9sZGVyUmVzdHJpY3RlZFNldHRpbmdzLmxlbmd0aCkge1xuXHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXJNYXAuc2V0KHdvcmtzcGFjZUZvbGRlci51cmksIGZvbGRlclJlc3RyaWN0ZWRTZXR0aW5ncyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX3Jlc3RyaWN0ZWRTZXR0aW5ncy53b3Jrc3BhY2VGb2xkZXI/LmdldCh3b3Jrc3BhY2VGb2xkZXIudXJpKSB8fCBbXTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlckRlbHRhID0gZGVsdGEoZm9sZGVyUmVzdHJpY3RlZFNldHRpbmdzLCBwcmV2aW91cywgKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cdFx0XHRjaGFuZ2VkLnB1c2goLi4ud29ya3NwYWNlRm9sZGVyRGVsdGEuYWRkZWQsIC4uLndvcmtzcGFjZUZvbGRlckRlbHRhLnJlbW92ZWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFID8gdGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLmdldFJlc3RyaWN0ZWRTZXR0aW5ncygpLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSlcblx0XHRcdDogdGhpcy53b3Jrc3BhY2UuZm9sZGVyc1swXSA/ICh3b3Jrc3BhY2VGb2xkZXJNYXAuZ2V0KHRoaXMud29ya3NwYWNlLmZvbGRlcnNbMF0udXJpKSB8fCBbXSkgOiBbXTtcblx0XHRjb25zdCB3b3Jrc3BhY2VEZWx0YSA9IGRlbHRhKHdvcmtzcGFjZSwgdGhpcy5fcmVzdHJpY3RlZFNldHRpbmdzLndvcmtzcGFjZSB8fCBbXSwgKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cdFx0Y2hhbmdlZC5wdXNoKC4uLndvcmtzcGFjZURlbHRhLmFkZGVkLCAuLi53b3Jrc3BhY2VEZWx0YS5yZW1vdmVkKTtcblxuXHRcdGlmIChjaGFuZ2VkLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fcmVzdHJpY3RlZFNldHRpbmdzID0ge1xuXHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0UmVzdHJpY3RlZFNldHRpbmdzLFxuXHRcdFx0XHRhcHBsaWNhdGlvbjogYXBwbGljYXRpb24ubGVuZ3RoID8gYXBwbGljYXRpb24gOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzZXJMb2NhbDogdXNlckxvY2FsLmxlbmd0aCA/IHVzZXJMb2NhbCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dXNlclJlbW90ZTogdXNlclJlbW90ZS5sZW5ndGggPyB1c2VyUmVtb3RlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR3b3Jrc3BhY2U6IHdvcmtzcGFjZS5sZW5ndGggPyB3b3Jrc3BhY2UgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHdvcmtzcGFjZUZvbGRlcjogd29ya3NwYWNlRm9sZGVyTWFwLnNpemUgPyB3b3Jrc3BhY2VGb2xkZXJNYXAgOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXN0cmljdGVkU2V0dGluZ3MuZmlyZSh0aGlzLnJlc3RyaWN0ZWRTZXR0aW5ncyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVXb3Jrc3BhY2VDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlcnM6IFdvcmtzcGFjZUZvbGRlcltdLCBjb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwsIGZyb21DYWNoZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByZXZpb3VzID0geyBkYXRhOiB0aGlzLl9jb25maWd1cmF0aW9uLnRvRGF0YSgpLCB3b3Jrc3BhY2U6IHRoaXMud29ya3NwYWNlIH07XG5cdFx0Y29uc3QgY2hhbmdlID0gdGhpcy5fY29uZmlndXJhdGlvbi5jb21wYXJlQW5kVXBkYXRlV29ya3NwYWNlQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uKTtcblx0XHRjb25zdCBjaGFuZ2VzID0gdGhpcy5jb21wYXJlRm9sZGVycyh0aGlzLndvcmtzcGFjZS5mb2xkZXJzLCB3b3Jrc3BhY2VGb2xkZXJzKTtcblx0XHRpZiAoY2hhbmdlcy5hZGRlZC5sZW5ndGggfHwgY2hhbmdlcy5yZW1vdmVkLmxlbmd0aCB8fCBjaGFuZ2VzLmNoYW5nZWQubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLndvcmtzcGFjZS5mb2xkZXJzID0gd29ya3NwYWNlRm9sZGVycztcblx0XHRcdGNvbnN0IGNoYW5nZSA9IGF3YWl0IHRoaXMub25Gb2xkZXJzQ2hhbmdlZCgpO1xuXHRcdFx0YXdhaXQgdGhpcy5oYW5kbGVXaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVycyhjaGFuZ2VzLCBmcm9tQ2FjaGUpO1xuXHRcdFx0dGhpcy50cmlnZ2VyQ29uZmlndXJhdGlvbkNoYW5nZShjaGFuZ2UsIHByZXZpb3VzLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzLmZpcmUoY2hhbmdlcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoY2hhbmdlLCBwcmV2aW91cywgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZVJlc3RyaWN0ZWRTZXR0aW5ncygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVXaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVycyhjaGFuZ2VzOiBJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50LCBmcm9tQ2FjaGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBqb2luZXJzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHR0aGlzLl9vbldpbGxDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzLmZpcmUoe1xuXHRcdFx0am9pbih1cGRhdGVXb3Jrc3BhY2VUcnVzdFN0YXRlUHJvbWlzZSkge1xuXHRcdFx0XHRqb2luZXJzLnB1c2godXBkYXRlV29ya3NwYWNlVHJ1c3RTdGF0ZVByb21pc2UpO1xuXHRcdFx0fSxcblx0XHRcdGNoYW5nZXMsXG5cdFx0XHRmcm9tQ2FjaGVcblx0XHR9KTtcblx0XHR0cnkgeyBhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGpvaW5lcnMpOyB9IGNhdGNoIChlcnJvcikgeyAvKiBJZ25vcmUgKi8gfVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbldvcmtzcGFjZUZvbGRlckNvbmZpZ3VyYXRpb25DaGFuZ2VkKGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IFtmb2xkZXJDb25maWd1cmF0aW9uXSA9IGF3YWl0IHRoaXMubG9hZEZvbGRlckNvbmZpZ3VyYXRpb25zKFtmb2xkZXJdKTtcblx0XHRjb25zdCBwcmV2aW91cyA9IHsgZGF0YTogdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKSwgd29ya3NwYWNlOiB0aGlzLndvcmtzcGFjZSB9O1xuXHRcdGNvbnN0IGZvbGRlckNvbmZpZ3VyYXRpb25DaGFuZ2UgPSB0aGlzLl9jb25maWd1cmF0aW9uLmNvbXBhcmVBbmRVcGRhdGVGb2xkZXJDb25maWd1cmF0aW9uKGZvbGRlci51cmksIGZvbGRlckNvbmZpZ3VyYXRpb24pO1xuXHRcdGlmICh0aGlzLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUikge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlQ29uZmlndXJhdGlvbkNoYW5nZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZFVwZGF0ZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb24oZm9sZGVyQ29uZmlndXJhdGlvbik7XG5cdFx0XHR0aGlzLnRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKG1lcmdlQ2hhbmdlcyhmb2xkZXJDb25maWd1cmF0aW9uQ2hhbmdlLCB3b3Jrc3BhY2VDb25maWd1cmF0aW9uQ2hhbmdlKSwgcHJldmlvdXMsIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50cmlnZ2VyQ29uZmlndXJhdGlvbkNoYW5nZShmb2xkZXJDb25maWd1cmF0aW9uQ2hhbmdlLCBwcmV2aW91cywgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSKTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVSZXN0cmljdGVkU2V0dGluZ3MoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25Gb2xkZXJzQ2hhbmdlZCgpOiBQcm9taXNlPElDb25maWd1cmF0aW9uQ2hhbmdlPiB7XG5cdFx0Y29uc3QgY2hhbmdlczogSUNvbmZpZ3VyYXRpb25DaGFuZ2VbXSA9IFtdO1xuXG5cdFx0Ly8gUmVtb3ZlIHRoZSBjb25maWd1cmF0aW9ucyBvZiBkZWxldGVkIGZvbGRlcnNcblx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGlzLmNhY2hlZEZvbGRlckNvbmZpZ3Mua2V5cygpKSB7XG5cdFx0XHRpZiAoIXRoaXMud29ya3NwYWNlLmZvbGRlcnMuZmlsdGVyKGZvbGRlciA9PiBmb2xkZXIudXJpLnRvU3RyaW5nKCkgPT09IGtleS50b1N0cmluZygpKVswXSkge1xuXHRcdFx0XHR0aGlzLmNhY2hlZEZvbGRlckNvbmZpZ3MuZGVsZXRlQW5kRGlzcG9zZShrZXkpO1xuXHRcdFx0XHRjaGFuZ2VzLnB1c2godGhpcy5fY29uZmlndXJhdGlvbi5jb21wYXJlQW5kRGVsZXRlRm9sZGVyQ29uZmlndXJhdGlvbihrZXkpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB0b0luaXRpYWxpemUgPSB0aGlzLndvcmtzcGFjZS5mb2xkZXJzLmZpbHRlcihmb2xkZXIgPT4gIXRoaXMuY2FjaGVkRm9sZGVyQ29uZmlncy5oYXMoZm9sZGVyLnVyaSkpO1xuXHRcdGlmICh0b0luaXRpYWxpemUubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBmb2xkZXJDb25maWd1cmF0aW9ucyA9IGF3YWl0IHRoaXMubG9hZEZvbGRlckNvbmZpZ3VyYXRpb25zKHRvSW5pdGlhbGl6ZSk7XG5cdFx0XHRmb2xkZXJDb25maWd1cmF0aW9ucy5mb3JFYWNoKChmb2xkZXJDb25maWd1cmF0aW9uLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRjaGFuZ2VzLnB1c2godGhpcy5fY29uZmlndXJhdGlvbi5jb21wYXJlQW5kVXBkYXRlRm9sZGVyQ29uZmlndXJhdGlvbih0b0luaXRpYWxpemVbaW5kZXhdLnVyaSwgZm9sZGVyQ29uZmlndXJhdGlvbikpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBtZXJnZUNoYW5nZXMoLi4uY2hhbmdlcyk7XG5cdH1cblxuXHRwcml2YXRlIGxvYWRGb2xkZXJDb25maWd1cmF0aW9ucyhmb2xkZXJzOiBJV29ya3NwYWNlRm9sZGVyW10pOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbFtdPiB7XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKFsuLi5mb2xkZXJzLm1hcChmb2xkZXIgPT4ge1xuXHRcdFx0bGV0IGZvbGRlckNvbmZpZ3VyYXRpb24gPSB0aGlzLmNhY2hlZEZvbGRlckNvbmZpZ3MuZ2V0KGZvbGRlci51cmkpO1xuXHRcdFx0aWYgKCFmb2xkZXJDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdGZvbGRlckNvbmZpZ3VyYXRpb24gPSBuZXcgRm9sZGVyQ29uZmlndXJhdGlvbighdGhpcy5pbml0aWFsaXplZCwgZm9sZGVyLCBGT0xERVJfQ09ORklHX0ZPTERFUl9OQU1FLCB0aGlzLmdldFdvcmtiZW5jaFN0YXRlKCksIHRoaXMuaXNXb3Jrc3BhY2VUcnVzdGVkLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25DYWNoZSk7XG5cdFx0XHRcdGZvbGRlckNvbmZpZ3VyYXRpb24uYWRkUmVsYXRlZChmb2xkZXJDb25maWd1cmF0aW9uLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMub25Xb3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uQ2hhbmdlZChmb2xkZXIpKSk7XG5cdFx0XHRcdHRoaXMuY2FjaGVkRm9sZGVyQ29uZmlncy5zZXQoZm9sZGVyLnVyaSwgZm9sZGVyQ29uZmlndXJhdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZm9sZGVyQ29uZmlndXJhdGlvbi5sb2FkQ29uZmlndXJhdGlvbigpO1xuXHRcdH0pXSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHZhbGlkYXRlV29ya3NwYWNlRm9sZGVyc0FuZFJlbG9hZChmcm9tQ2FjaGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2YWxpZFdvcmtzcGFjZUZvbGRlcnMgPSBhd2FpdCB0aGlzLnRvVmFsaWRXb3Jrc3BhY2VGb2xkZXJzKHRoaXMud29ya3NwYWNlLmZvbGRlcnMpO1xuXHRcdGNvbnN0IHsgcmVtb3ZlZCB9ID0gdGhpcy5jb21wYXJlRm9sZGVycyh0aGlzLndvcmtzcGFjZS5mb2xkZXJzLCB2YWxpZFdvcmtzcGFjZUZvbGRlcnMpO1xuXHRcdGlmIChyZW1vdmVkLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVXb3Jrc3BhY2VDb25maWd1cmF0aW9uKHZhbGlkV29ya3NwYWNlRm9sZGVycywgdGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLmdldENvbmZpZ3VyYXRpb24oKSwgZnJvbUNhY2hlKTtcblx0XHR9XG5cdH1cblxuXHQvLyBGaWx0ZXIgb3V0IHdvcmtzcGFjZSBmb2xkZXJzIHdoaWNoIGFyZSBmaWxlcyAobm90IGRpcmVjdG9yaWVzKVxuXHQvLyBXb3Jrc3BhY2UgZm9sZGVycyB0aG9zZSBjYW5ub3QgYmUgcmVzb2x2ZWQgYXJlIG5vdCBmaWx0ZXJlZCBiZWNhdXNlIHRoZXkgYXJlIGhhbmRsZWQgYnkgdGhlIEV4cGxvcmVyLlxuXHRwcml2YXRlIGFzeW5jIHRvVmFsaWRXb3Jrc3BhY2VGb2xkZXJzKHdvcmtzcGFjZUZvbGRlcnM6IFdvcmtzcGFjZUZvbGRlcltdKTogUHJvbWlzZTxXb3Jrc3BhY2VGb2xkZXJbXT4ge1xuXHRcdGNvbnN0IHZhbGlkV29ya3NwYWNlRm9sZGVyczogV29ya3NwYWNlRm9sZGVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZUZvbGRlciBvZiB3b3Jrc3BhY2VGb2xkZXJzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQod29ya3NwYWNlRm9sZGVyLnVyaSk7XG5cdFx0XHRcdGlmICghcmVzdWx0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYElnbm9yaW5nIHRoZSBlcnJvciB3aGlsZSB2YWxpZGF0aW5nIHdvcmtzcGFjZSBmb2xkZXIgJHt3b3Jrc3BhY2VGb2xkZXIudXJpLnRvU3RyaW5nKCl9IC0gJHt0b0Vycm9yTWVzc2FnZShlKX1gKTtcblx0XHRcdH1cblx0XHRcdHZhbGlkV29ya3NwYWNlRm9sZGVycy5wdXNoKHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0fVxuXHRcdHJldHVybiB2YWxpZFdvcmtzcGFjZUZvbGRlcnM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdyaXRlQ29uZmlndXJhdGlvblZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCBvdmVycmlkZXM6IElDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSUNvbmZpZ3VyYXRpb25VcGRhdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB3cml0ZSBjb25maWd1cmF0aW9uIGJlY2F1c2UgdGhlIGNvbmZpZ3VyYXRpb24gc2VydmljZSBpcyBub3QgeWV0IHJlYWR5IHRvIGFjY2VwdCB3cml0ZXMuJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5ERUZBVUxUKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY29uZmlndXJhdGlvbiB0YXJnZXQnKTtcblx0XHR9XG5cblx0XHRpZiAodGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0Lk1FTU9SWSkge1xuXHRcdFx0Y29uc3QgcHJldmlvdXMgPSB7IGRhdGE6IHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCksIHdvcmtzcGFjZTogdGhpcy53b3Jrc3BhY2UgfTtcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlVmFsdWUoa2V5LCB2YWx1ZSwgb3ZlcnJpZGVzKTtcblx0XHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoeyBrZXlzOiBvdmVycmlkZXM/Lm92ZXJyaWRlSWRlbnRpZmllcnM/Lmxlbmd0aCA/IFtrZXlGcm9tT3ZlcnJpZGVJZGVudGlmaWVycyhvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycyksIGtleV0gOiBba2V5XSwgb3ZlcnJpZGVzOiBvdmVycmlkZXM/Lm92ZXJyaWRlSWRlbnRpZmllcnM/Lmxlbmd0aCA/IG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzLm1hcChvdmVycmlkZUlkZW50aWZpZXIgPT4gKFtvdmVycmlkZUlkZW50aWZpZXIsIFtrZXldXSkpIDogW10gfSwgcHJldmlvdXMsIHRhcmdldCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0ID0gdGhpcy50b0VkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldCh0YXJnZXQsIGtleSk7XG5cdFx0aWYgKCFlZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb25maWd1cmF0aW9uIHRhcmdldCcpO1xuXHRcdH1cblxuXHRcdGlmIChlZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQgPT09IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSAmJiAhdGhpcy5yZW1vdGVVc2VyQ29uZmlndXJhdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbmZpZ3VyYXRpb24gdGFyZ2V0Jyk7XG5cdFx0fVxuXG5cdFx0aWYgKG92ZXJyaWRlcz8ub3ZlcnJpZGVJZGVudGlmaWVycz8ubGVuZ3RoICYmIG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzLmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Nb2RlbCA9IHRoaXMuZ2V0Q29uZmlndXJhdGlvbk1vZGVsRm9yRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0KGVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldCwgb3ZlcnJpZGVzLnJlc291cmNlKTtcblx0XHRcdGlmIChjb25maWd1cmF0aW9uTW9kZWwpIHtcblx0XHRcdFx0Y29uc3Qgb3ZlcnJpZGVJZGVudGlmaWVycyA9IG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzLnNvcnQoKTtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmdPdmVycmlkZXMgPSBjb25maWd1cmF0aW9uTW9kZWwub3ZlcnJpZGVzLmZpbmQob3ZlcnJpZGUgPT4gYXJyYXlFcXVhbHMoWy4uLm92ZXJyaWRlLmlkZW50aWZpZXJzXS5zb3J0KCksIG92ZXJyaWRlSWRlbnRpZmllcnMpKTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nT3ZlcnJpZGVzKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcnMgPSBleGlzdGluZ092ZXJyaWRlcy5pZGVudGlmaWVycztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVzZSBzYW1lIGluc3RhbmNlIG9mIENvbmZpZ3VyYXRpb25FZGl0aW5nIHRvIG1ha2Ugc3VyZSBhbGwgd3JpdGVzIGdvIHRocm91Z2ggdGhlIHNhbWUgcXVldWVcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25FZGl0aW5nID0gdGhpcy5jb25maWd1cmF0aW9uRWRpdGluZyA/PyB0aGlzLmNyZWF0ZUNvbmZpZ3VyYXRpb25FZGl0aW5nU2VydmljZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRhd2FpdCAoYXdhaXQgdGhpcy5jb25maWd1cmF0aW9uRWRpdGluZykud3JpdGVDb25maWd1cmF0aW9uKGVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldCwgeyBrZXksIHZhbHVlIH0sIHsgc2NvcGVzOiBvdmVycmlkZXMsIC4uLm9wdGlvbnMgfSk7XG5cdFx0c3dpdGNoIChlZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQpIHtcblx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw6XG5cdFx0XHRcdGlmICh0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbiAmJiB0aGlzLmlzU2V0dGluZ0FwcGxpZWRGb3JBbGxQcm9maWxlcyhrZXkpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZWxvYWRBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlbG9hZExvY2FsVXNlckNvbmZpZ3VyYXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTpcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVsb2FkUmVtb3RlVXNlckNvbmZpZ3VyYXRpb24oKS50aGVuKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U6XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbG9hZFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24oKTtcblx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6IHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gb3ZlcnJpZGVzICYmIG92ZXJyaWRlcy5yZXNvdXJjZSA/IHRoaXMud29ya3NwYWNlLmdldEZvbGRlcihvdmVycmlkZXMucmVzb3VyY2UpIDogbnVsbDtcblx0XHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnJlbG9hZFdvcmtzcGFjZUZvbGRlckNvbmZpZ3VyYXRpb24od29ya3NwYWNlRm9sZGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlQ29uZmlndXJhdGlvbkVkaXRpbmdTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBQcm9taXNlPENvbmZpZ3VyYXRpb25FZGl0aW5nPiB7XG5cdFx0Y29uc3QgcmVtb3RlU2V0dGluZ3NSZXNvdXJjZSA9IChhd2FpdCB0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpKT8uc2V0dGluZ3NQYXRoID8/IG51bGw7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbmZpZ3VyYXRpb25FZGl0aW5nLCByZW1vdGVTZXR0aW5nc1Jlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uZmlndXJhdGlvbk1vZGVsRm9yRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0KHRhcmdldDogRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LCByZXNvdXJjZT86IFVSSSB8IG51bGwpOiBDb25maWd1cmF0aW9uTW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAodGFyZ2V0KSB7XG5cdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMOiByZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi5sb2NhbFVzZXJDb25maWd1cmF0aW9uO1xuXHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU6IHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uO1xuXHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOiByZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi53b3Jrc3BhY2VDb25maWd1cmF0aW9uO1xuXHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUjogcmV0dXJuIHJlc291cmNlID8gdGhpcy5fY29uZmlndXJhdGlvbi5mb2xkZXJDb25maWd1cmF0aW9ucy5nZXQocmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGdldENvbmZpZ3VyYXRpb25Nb2RlbCh0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIHJlc291cmNlPzogVVJJIHwgbnVsbCk6IENvbmZpZ3VyYXRpb25Nb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoICh0YXJnZXQpIHtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMOiByZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi5sb2NhbFVzZXJDb25maWd1cmF0aW9uO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFOiByZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi5yZW1vdGVVc2VyQ29uZmlndXJhdGlvbjtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U6IHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uLndvcmtzcGFjZUNvbmZpZ3VyYXRpb247XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUjogcmV0dXJuIHJlc291cmNlID8gdGhpcy5fY29uZmlndXJhdGlvbi5mb2xkZXJDb25maWd1cmF0aW9ucy5nZXQocmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRlcml2ZUNvbmZpZ3VyYXRpb25UYXJnZXRzKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgaW5zcGVjdDogSUNvbmZpZ3VyYXRpb25WYWx1ZTx1bmtub3duPik6IENvbmZpZ3VyYXRpb25UYXJnZXRbXSB7XG5cdFx0aWYgKGVxdWFscyh2YWx1ZSwgaW5zcGVjdC52YWx1ZSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZpbmVkVGFyZ2V0czogQ29uZmlndXJhdGlvblRhcmdldFtdID0gW107XG5cdFx0aWYgKGluc3BlY3Qud29ya3NwYWNlRm9sZGVyVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZGVmaW5lZFRhcmdldHMucHVzaChDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpO1xuXHRcdH1cblx0XHRpZiAoaW5zcGVjdC53b3Jrc3BhY2VWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRkZWZpbmVkVGFyZ2V0cy5wdXNoKENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKTtcblx0XHR9XG5cdFx0aWYgKGluc3BlY3QudXNlclJlbW90ZVZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGRlZmluZWRUYXJnZXRzLnB1c2goQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSk7XG5cdFx0fVxuXHRcdGlmIChpbnNwZWN0LnVzZXJMb2NhbFZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGRlZmluZWRUYXJnZXRzLnB1c2goQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKTtcblx0XHR9XG5cdFx0aWYgKGluc3BlY3QuYXBwbGljYXRpb25WYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRkZWZpbmVkVGFyZ2V0cy5wdXNoKENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT04pO1xuXHRcdH1cblxuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBSZW1vdmUgdGhlIHNldHRpbmcgaW4gYWxsIGRlZmluZWQgdGFyZ2V0c1xuXHRcdFx0cmV0dXJuIGRlZmluZWRUYXJnZXRzO1xuXHRcdH1cblxuXHRcdHJldHVybiBbZGVmaW5lZFRhcmdldHNbMF0gfHwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSXTtcblx0fVxuXG5cdHByaXZhdGUgdHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoY2hhbmdlOiBJQ29uZmlndXJhdGlvbkNoYW5nZSwgcHJldmlvdXM6IHsgZGF0YTogSUNvbmZpZ3VyYXRpb25EYXRhOyB3b3Jrc3BhY2U/OiBXb3Jrc3BhY2UgfSB8IHVuZGVmaW5lZCwgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogdm9pZCB7XG5cdFx0aWYgKGNoYW5nZS5rZXlzLmxlbmd0aCkge1xuXHRcdFx0aWYgKHRhcmdldCAhPT0gQ29uZmlndXJhdGlvblRhcmdldC5ERUZBVUxUKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgQ29uZmlndXJhdGlvbiBrZXlzIGNoYW5nZWQgaW4gJHtDb25maWd1cmF0aW9uVGFyZ2V0VG9TdHJpbmcodGFyZ2V0KX0gdGFyZ2V0YCwgLi4uY2hhbmdlLmtleXMpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbkNoYW5nZUV2ZW50ID0gbmV3IENvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudChjaGFuZ2UsIHByZXZpb3VzLCB0aGlzLl9jb25maWd1cmF0aW9uLCB0aGlzLndvcmtzcGFjZSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudC5zb3VyY2UgPSB0YXJnZXQ7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZShjb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdG9FZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQodGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCBrZXk6IHN0cmluZyk6IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldCB8IG51bGwge1xuXHRcdGlmICh0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT04pIHtcblx0XHRcdHJldHVybiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDtcblx0XHR9XG5cdFx0aWYgKHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKSB7XG5cdFx0XHRpZiAodGhpcy5yZW1vdGVVc2VyQ29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRjb25zdCBzY29wZSA9IHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClba2V5XT8uc2NvcGU7XG5cdFx0XHRcdGlmIChzY29wZSA9PT0gQ29uZmlndXJhdGlvblNjb3BlLk1BQ0hJTkUgfHwgc2NvcGUgPT09IENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FX09WRVJSSURBQkxFIHx8IHNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT05fTUFDSElORSkge1xuXHRcdFx0XHRcdHJldHVybiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuaW5zcGVjdChrZXkpLnVzZXJSZW1vdGVWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMO1xuXHRcdH1cblx0XHRpZiAodGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpIHtcblx0XHRcdHJldHVybiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDtcblx0XHR9XG5cdFx0aWYgKHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSkge1xuXHRcdFx0cmV0dXJuIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTtcblx0XHR9XG5cdFx0aWYgKHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpIHtcblx0XHRcdHJldHVybiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFO1xuXHRcdH1cblx0XHRpZiAodGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpIHtcblx0XHRcdHJldHVybiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUjtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxuY2xhc3MgUmVnaXN0ZXJDb25maWd1cmF0aW9uU2NoZW1hc0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCkudGhlbigoKSA9PiB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyQ29uZmlndXJhdGlvblNjaGVtYXMoKTtcblxuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRcdGNvbnN0IGRlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPig1MCkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5vbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24sIGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5vbkRpZFNjaGVtYUNoYW5nZSwgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVRydXN0KSgoKSA9PlxuXHRcdFx0XHRkZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5yZWdpc3RlckNvbmZpZ3VyYXRpb25TY2hlbWFzKCksIGxpZmVjeWNsZVNlcnZpY2UucGhhc2UgPT09IExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkgPyB1bmRlZmluZWQgOiAyNTAwIC8qIGRlbGF5IGxvbmdlciBpbiBlYXJseSBwaGFzZXMgKi8pKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQ29uZmlndXJhdGlvblNjaGVtYXMoKTogdm9pZCB7XG5cdFx0Ly8gRW5zdXJlIGRlcHJlY2F0aW9uTWVzc2FnZSBpcyBwbGFpbiB0ZXh0IGZvciBwcm9wZXJ0aWVzIHdoZXJlIGl0IHdhcyBkZXJpdmVkIGZyb21cblx0XHQvLyBtYXJrZG93bkRlcHJlY2F0aW9uTWVzc2FnZSwgc2luY2UgdGhlIEpTT04gZWRpdG9yIGRpYWdub3N0aWNzIGRvbid0IHN1cHBvcnQgbWFya2Rvd24uXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoYWxsU2V0dGluZ3MucHJvcGVydGllcykpIHtcblx0XHRcdGNvbnN0IHByb3AgPSBhbGxTZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRpZiAocHJvcC5tYXJrZG93bkRlcHJlY2F0aW9uTWVzc2FnZSAmJiBwcm9wLmRlcHJlY2F0aW9uTWVzc2FnZSA9PT0gcHJvcC5tYXJrZG93bkRlcHJlY2F0aW9uTWVzc2FnZSkge1xuXHRcdFx0XHRwcm9wLmRlcHJlY2F0aW9uTWVzc2FnZSA9IHJlbmRlckFzUGxhaW50ZXh0KHsgdmFsdWU6IGZpeFNldHRpbmdMaW5rcyhwcm9wLm1hcmtkb3duRGVwcmVjYXRpb25NZXNzYWdlKSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBhbGxTZXR0aW5nc1NjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHRwcm9wZXJ0aWVzOiBhbGxTZXR0aW5ncy5wcm9wZXJ0aWVzLFxuXHRcdFx0cGF0dGVyblByb3BlcnRpZXM6IGFsbFNldHRpbmdzLnBhdHRlcm5Qcm9wZXJ0aWVzLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHRydWUsXG5cdFx0XHRhbGxvd1RyYWlsaW5nQ29tbWFzOiB0cnVlLFxuXHRcdFx0YWxsb3dDb21tZW50czogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCB1c2VyU2V0dGluZ3NTY2hlbWE6IElKU09OU2NoZW1hID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ID9cblx0XHRcdHtcblx0XHRcdFx0cHJvcGVydGllczogT2JqZWN0LmFzc2lnbih7fSxcblx0XHRcdFx0XHRhcHBsaWNhdGlvblNldHRpbmdzLnByb3BlcnRpZXMsXG5cdFx0XHRcdFx0d2luZG93U2V0dGluZ3MucHJvcGVydGllcyxcblx0XHRcdFx0XHRyZXNvdXJjZVNldHRpbmdzLnByb3BlcnRpZXNcblx0XHRcdFx0KSxcblx0XHRcdFx0cGF0dGVyblByb3BlcnRpZXM6IGFsbFNldHRpbmdzLnBhdHRlcm5Qcm9wZXJ0aWVzLFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogdHJ1ZSxcblx0XHRcdFx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0XHRcdFx0YWxsb3dDb21tZW50czogdHJ1ZVxuXHRcdFx0fVxuXHRcdFx0OiBhbGxTZXR0aW5nc1NjaGVtYTtcblxuXHRcdGNvbnN0IHByb2ZpbGVTZXR0aW5nc1NjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHRwcm9wZXJ0aWVzOiBPYmplY3QuYXNzaWduKHt9LFxuXHRcdFx0XHRtYWNoaW5lU2V0dGluZ3MucHJvcGVydGllcyxcblx0XHRcdFx0bWFjaGluZU92ZXJyaWRhYmxlU2V0dGluZ3MucHJvcGVydGllcyxcblx0XHRcdFx0d2luZG93U2V0dGluZ3MucHJvcGVydGllcyxcblx0XHRcdFx0cmVzb3VyY2VTZXR0aW5ncy5wcm9wZXJ0aWVzXG5cdFx0XHQpLFxuXHRcdFx0cGF0dGVyblByb3BlcnRpZXM6IGFsbFNldHRpbmdzLnBhdHRlcm5Qcm9wZXJ0aWVzLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHRydWUsXG5cdFx0XHRhbGxvd1RyYWlsaW5nQ29tbWFzOiB0cnVlLFxuXHRcdFx0YWxsb3dDb21tZW50czogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCBtYWNoaW5lU2V0dGluZ3NTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0cHJvcGVydGllczogT2JqZWN0LmFzc2lnbih7fSxcblx0XHRcdFx0YXBwbGljYXRpb25NYWNoaW5lU2V0dGluZ3MucHJvcGVydGllcyxcblx0XHRcdFx0bWFjaGluZVNldHRpbmdzLnByb3BlcnRpZXMsXG5cdFx0XHRcdG1hY2hpbmVPdmVycmlkYWJsZVNldHRpbmdzLnByb3BlcnRpZXMsXG5cdFx0XHRcdHdpbmRvd1NldHRpbmdzLnByb3BlcnRpZXMsXG5cdFx0XHRcdHJlc291cmNlU2V0dGluZ3MucHJvcGVydGllc1xuXHRcdFx0KSxcblx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiBhbGxTZXR0aW5ncy5wYXR0ZXJuUHJvcGVydGllcyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB0cnVlLFxuXHRcdFx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0XHRcdGFsbG93Q29tbWVudHM6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlU2V0dGluZ3NTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0cHJvcGVydGllczogT2JqZWN0LmFzc2lnbih7fSxcblx0XHRcdFx0dGhpcy5jaGVja0FuZEZpbHRlclByb3BlcnRpZXNSZXF1aXJpbmdUcnVzdChtYWNoaW5lT3ZlcnJpZGFibGVTZXR0aW5ncy5wcm9wZXJ0aWVzKSxcblx0XHRcdFx0dGhpcy5jaGVja0FuZEZpbHRlclByb3BlcnRpZXNSZXF1aXJpbmdUcnVzdCh3aW5kb3dTZXR0aW5ncy5wcm9wZXJ0aWVzKSxcblx0XHRcdFx0dGhpcy5jaGVja0FuZEZpbHRlclByb3BlcnRpZXNSZXF1aXJpbmdUcnVzdChyZXNvdXJjZVNldHRpbmdzLnByb3BlcnRpZXMpXG5cdFx0XHQpLFxuXHRcdFx0cGF0dGVyblByb3BlcnRpZXM6IGFsbFNldHRpbmdzLnBhdHRlcm5Qcm9wZXJ0aWVzLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHRydWUsXG5cdFx0XHRhbGxvd1RyYWlsaW5nQ29tbWFzOiB0cnVlLFxuXHRcdFx0YWxsb3dDb21tZW50czogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCBkZWZhdWx0U2V0dGluZ3NTY2hlbWEgPSB7XG5cdFx0XHRwcm9wZXJ0aWVzOiBPYmplY3Qua2V5cyhhbGxTZXR0aW5ncy5wcm9wZXJ0aWVzKS5yZWR1Y2U8SUpTT05TY2hlbWFNYXA+KChyZXN1bHQsIGtleSkgPT4ge1xuXHRcdFx0XHRyZXN1bHRba2V5XSA9IE9iamVjdC5hc3NpZ24oeyBkZXByZWNhdGlvbk1lc3NhZ2U6IHVuZGVmaW5lZCB9LCBhbGxTZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV0pO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fSwge30pLFxuXHRcdFx0cGF0dGVyblByb3BlcnRpZXM6IE9iamVjdC5rZXlzKGFsbFNldHRpbmdzLnBhdHRlcm5Qcm9wZXJ0aWVzKS5yZWR1Y2U8SUpTT05TY2hlbWFNYXA+KChyZXN1bHQsIGtleSkgPT4ge1xuXHRcdFx0XHRyZXN1bHRba2V5XSA9IE9iamVjdC5hc3NpZ24oeyBkZXByZWNhdGlvbk1lc3NhZ2U6IHVuZGVmaW5lZCB9LCBhbGxTZXR0aW5ncy5wYXR0ZXJuUHJvcGVydGllc1trZXldKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0sIHt9KSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB0cnVlLFxuXHRcdFx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0XHRcdGFsbG93Q29tbWVudHM6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3QgZm9sZGVyU2V0dGluZ3NTY2hlbWE6IElKU09OU2NoZW1hID0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFID09PSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgP1xuXHRcdFx0e1xuXHRcdFx0XHRwcm9wZXJ0aWVzOiBPYmplY3QuYXNzaWduKHt9LFxuXHRcdFx0XHRcdHRoaXMuY2hlY2tBbmRGaWx0ZXJQcm9wZXJ0aWVzUmVxdWlyaW5nVHJ1c3QobWFjaGluZU92ZXJyaWRhYmxlU2V0dGluZ3MucHJvcGVydGllcyksXG5cdFx0XHRcdFx0dGhpcy5jaGVja0FuZEZpbHRlclByb3BlcnRpZXNSZXF1aXJpbmdUcnVzdChyZXNvdXJjZVNldHRpbmdzLnByb3BlcnRpZXMpXG5cdFx0XHRcdCksXG5cdFx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiBhbGxTZXR0aW5ncy5wYXR0ZXJuUHJvcGVydGllcyxcblx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHRydWUsXG5cdFx0XHRcdGFsbG93VHJhaWxpbmdDb21tYXM6IHRydWUsXG5cdFx0XHRcdGFsbG93Q29tbWVudHM6IHRydWVcblx0XHRcdH0gOiB3b3Jrc3BhY2VTZXR0aW5nc1NjaGVtYTtcblxuXHRcdGNvbnN0IGNvbmZpZ0RlZmF1bHRzU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb25maWd1cmF0aW9uRGVmYXVsdHMuZGVzY3JpcHRpb24nLCAnQ29udHJpYnV0ZSBkZWZhdWx0cyBmb3IgY29uZmlndXJhdGlvbnMnKSxcblx0XHRcdHByb3BlcnRpZXM6IE9iamVjdC5hc3NpZ24oe30sXG5cdFx0XHRcdHRoaXMuZmlsdGVyRGVmYXVsdE92ZXJyaWRhYmxlUHJvcGVydGllcyhtYWNoaW5lT3ZlcnJpZGFibGVTZXR0aW5ncy5wcm9wZXJ0aWVzKSxcblx0XHRcdFx0dGhpcy5maWx0ZXJEZWZhdWx0T3ZlcnJpZGFibGVQcm9wZXJ0aWVzKHdpbmRvd1NldHRpbmdzLnByb3BlcnRpZXMpLFxuXHRcdFx0XHR0aGlzLmZpbHRlckRlZmF1bHRPdmVycmlkYWJsZVByb3BlcnRpZXMocmVzb3VyY2VTZXR0aW5ncy5wcm9wZXJ0aWVzKVxuXHRcdFx0KSxcblx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFtPVkVSUklERV9QUk9QRVJUWV9QQVRURVJOXToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHt9LFxuXHRcdFx0XHRcdCRyZWY6IHJlc291cmNlTGFuZ3VhZ2VTZXR0aW5nc1NjaGVtYUlkLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlXG5cdFx0fTtcblx0XHR0aGlzLnJlZ2lzdGVyU2NoZW1hcyh7XG5cdFx0XHRkZWZhdWx0U2V0dGluZ3NTY2hlbWEsXG5cdFx0XHR1c2VyU2V0dGluZ3NTY2hlbWEsXG5cdFx0XHRwcm9maWxlU2V0dGluZ3NTY2hlbWEsXG5cdFx0XHRtYWNoaW5lU2V0dGluZ3NTY2hlbWEsXG5cdFx0XHR3b3Jrc3BhY2VTZXR0aW5nc1NjaGVtYSxcblx0XHRcdGZvbGRlclNldHRpbmdzU2NoZW1hLFxuXHRcdFx0Y29uZmlnRGVmYXVsdHNTY2hlbWEsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU2NoZW1hcyhzY2hlbWFzOiB7XG5cdFx0ZGVmYXVsdFNldHRpbmdzU2NoZW1hOiBJSlNPTlNjaGVtYTtcblx0XHR1c2VyU2V0dGluZ3NTY2hlbWE6IElKU09OU2NoZW1hO1xuXHRcdHByb2ZpbGVTZXR0aW5nc1NjaGVtYTogSUpTT05TY2hlbWE7XG5cdFx0bWFjaGluZVNldHRpbmdzU2NoZW1hOiBJSlNPTlNjaGVtYTtcblx0XHR3b3Jrc3BhY2VTZXR0aW5nc1NjaGVtYTogSUpTT05TY2hlbWE7XG5cdFx0Zm9sZGVyU2V0dGluZ3NTY2hlbWE6IElKU09OU2NoZW1hO1xuXHRcdGNvbmZpZ0RlZmF1bHRzU2NoZW1hOiBJSlNPTlNjaGVtYTtcblx0fSk6IHZvaWQge1xuXHRcdGNvbnN0IGpzb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnk+KEpTT05FeHRlbnNpb25zLkpTT05Db250cmlidXRpb24pO1xuXHRcdGpzb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYShkZWZhdWx0U2V0dGluZ3NTY2hlbWFJZCwgc2NoZW1hcy5kZWZhdWx0U2V0dGluZ3NTY2hlbWEpO1xuXHRcdGpzb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYSh1c2VyU2V0dGluZ3NTY2hlbWFJZCwgc2NoZW1hcy51c2VyU2V0dGluZ3NTY2hlbWEpO1xuXHRcdGpzb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYShwcm9maWxlU2V0dGluZ3NTY2hlbWFJZCwgc2NoZW1hcy5wcm9maWxlU2V0dGluZ3NTY2hlbWEpO1xuXHRcdGpzb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYShtYWNoaW5lU2V0dGluZ3NTY2hlbWFJZCwgc2NoZW1hcy5tYWNoaW5lU2V0dGluZ3NTY2hlbWEpO1xuXHRcdGpzb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYSh3b3Jrc3BhY2VTZXR0aW5nc1NjaGVtYUlkLCBzY2hlbWFzLndvcmtzcGFjZVNldHRpbmdzU2NoZW1hKTtcblx0XHRqc29uUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEoZm9sZGVyU2V0dGluZ3NTY2hlbWFJZCwgc2NoZW1hcy5mb2xkZXJTZXR0aW5nc1NjaGVtYSk7XG5cdFx0anNvblJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKGNvbmZpZ3VyYXRpb25EZWZhdWx0c1NjaGVtYUlkLCBzY2hlbWFzLmNvbmZpZ0RlZmF1bHRzU2NoZW1hKTtcblx0fVxuXG5cdHByaXZhdGUgY2hlY2tBbmRGaWx0ZXJQcm9wZXJ0aWVzUmVxdWlyaW5nVHJ1c3QocHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4pOiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPiB7XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0cmV0dXJuIHByb3BlcnRpZXM7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPiA9IHt9O1xuXHRcdE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuXHRcdFx0aWYgKCF2YWx1ZS5yZXN0cmljdGVkKSB7XG5cdFx0XHRcdHJlc3VsdFtrZXldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyRGVmYXVsdE92ZXJyaWRhYmxlUHJvcGVydGllcyhwcm9wZXJ0aWVzOiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPik6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+IHtcblx0XHRjb25zdCByZXN1bHQ6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+ID0ge307XG5cdFx0T2JqZWN0LmVudHJpZXMocHJvcGVydGllcykuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG5cdFx0XHRpZiAoIXZhbHVlLmRpc2FsbG93Q29uZmlndXJhdGlvbkRlZmF1bHQpIHtcblx0XHRcdFx0cmVzdWx0W2tleV0gPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmNsYXNzIENvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlc0NvbnRyaWJ1dGlvbic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm9jZXNzZWRFeHBlcmltZW50YWxTZXR0aW5ncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGF1dG9FeHBlcmltZW50YWxTZXR0aW5ncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGhyb3R0bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlcigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2U6IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IFdvcmtzcGFjZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudGhyb3R0bGVyLnF1ZXVlKCgpID0+IHRoaXMudXBkYXRlRGVmYXVsdHMoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2Uub25EaWRSZWZldGNoQXNzaWdubWVudHMoKCkgPT4gdGhpcy50aHJvdHRsZXIucXVldWUoKCkgPT4gdGhpcy5wcm9jZXNzRXhwZXJpbWVudGFsU2V0dGluZ3ModGhpcy5hdXRvRXhwZXJpbWVudGFsU2V0dGluZ3MsIHRydWUpKSkpO1xuXG5cdFx0Ly8gV2hlbiBjb25maWd1cmF0aW9uIGlzIHVwZGF0ZWQgbWFrZSBzdXJlIHRvIGFwcGx5IGV4cGVyaW1lbnRhbCBjb25maWd1cmF0aW9uIG92ZXJyaWRlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5Lm9uRGlkVXBkYXRlQ29uZmlndXJhdGlvbigoeyBwcm9wZXJ0aWVzIH0pID0+IHRoaXMucHJvY2Vzc0V4cGVyaW1lbnRhbFNldHRpbmdzKHByb3BlcnRpZXMsIGZhbHNlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVEZWZhdWx0cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0NvbmZpZ3VyYXRpb25TZXJ2aWNlI3VwZGF0ZURlZmF1bHRzOiBiZWdpbicpO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBDaGVjayBmb3IgZXhwZXJpbWVudHNcblx0XHRcdGF3YWl0IHRoaXMucHJvY2Vzc0V4cGVyaW1lbnRhbFNldHRpbmdzKE9iamVjdC5rZXlzKHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCkpLCBmYWxzZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdC8vIEludmFsaWRhdGUgZGVmYXVsdHMgY2FjaGUgYWZ0ZXIgZXh0ZW5zaW9ucyBoYXZlIHJlZ2lzdGVyZWRcblx0XHRcdC8vIGFuZCBhZnRlciB0aGUgZXhwZXJpbWVudHMgaGF2ZSBiZWVuIHJlc29sdmVkIHRvIHByZXZlbnRcblx0XHRcdC8vIHJlc2V0dGluZyB0aGUgb3ZlcnJpZGVzIHRvbyBlYXJseS5cblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnQ29uZmlndXJhdGlvblNlcnZpY2UjdXBkYXRlRGVmYXVsdHM6IHJlc2V0dGluZyB0aGUgZGVmYXVsdHMnKTtcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UucmVsb2FkQ29uZmlndXJhdGlvbihDb25maWd1cmF0aW9uVGFyZ2V0LkRFRkFVTFQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJvY2Vzc0V4cGVyaW1lbnRhbFNldHRpbmdzKHByb3BlcnRpZXM6IEl0ZXJhYmxlPHN0cmluZz4sIGF1dG9SZWZldGNoOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiA9IHt9O1xuXHRcdGNvbnN0IGFsbFByb3BlcnRpZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGNvbnN0IGRlZmF1bHRDb25maWd1cmF0aW9uc1ByZXZlbnRpbmdFeHBlcmltZW50T3ZlcnJpZGVzID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UmVnaXN0ZXJlZERlZmF1bHRDb25maWd1cmF0aW9ucygpLmZpbHRlcihjb25maWd1cmF0aW9uID0+IGNvbmZpZ3VyYXRpb24ucHJldmVudEV4cGVyaW1lbnRPdmVycmlkZSk7XG5cdFx0Zm9yIChjb25zdCBwcm9wZXJ0eSBvZiBwcm9wZXJ0aWVzKSB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBhbGxQcm9wZXJ0aWVzW3Byb3BlcnR5XTtcblx0XHRcdGlmICghc2NoZW1hPy5leHBlcmltZW50KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVmYXVsdFZhbHVlU291cmNlOiBDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZSB8IHVuZGVmaW5lZCA9IHNjaGVtYS5kZWZhdWx0VmFsdWVTb3VyY2UgJiYgIShzY2hlbWEuZGVmYXVsdFZhbHVlU291cmNlIGluc3RhbmNlb2YgTWFwKSA/IHNjaGVtYS5kZWZhdWx0VmFsdWVTb3VyY2UgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZGVmYXVsdFZhbHVlU291cmNlICYmIGRlZmF1bHRDb25maWd1cmF0aW9uc1ByZXZlbnRpbmdFeHBlcmltZW50T3ZlcnJpZGVzLnNvbWUoY29uZmlndXJhdGlvbiA9PiBpc0NvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlRXF1YWxzKGNvbmZpZ3VyYXRpb24uc291cmNlLCBkZWZhdWx0VmFsdWVTb3VyY2UpICYmIGNvbmZpZ3VyYXRpb24ub3ZlcnJpZGVzPy5bcHJvcGVydHldICE9PSB1bmRlZmluZWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFhdXRvUmVmZXRjaCAmJiB0aGlzLnByb2Nlc3NlZEV4cGVyaW1lbnRhbFNldHRpbmdzLmhhcyhwcm9wZXJ0eSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnByb2Nlc3NlZEV4cGVyaW1lbnRhbFNldHRpbmdzLmFkZChwcm9wZXJ0eSk7XG5cdFx0XHRpZiAoc2NoZW1hLmV4cGVyaW1lbnQubW9kZSA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRcdHRoaXMuYXV0b0V4cGVyaW1lbnRhbFNldHRpbmdzLmFkZChwcm9wZXJ0eSk7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMud29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UuZ2V0VHJlYXRtZW50KHNjaGVtYS5leHBlcmltZW50Lm5hbWUgPz8gYGNvbmZpZy4ke3Byb3BlcnR5fWApO1xuXHRcdFx0XHRpZiAodGhpcy5zaG91bGRPdmVycmlkZSh2YWx1ZSwgc2NoZW1hKSkge1xuXHRcdFx0XHRcdG92ZXJyaWRlc1twcm9wZXJ0eV0gPSB2YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHsvKmlnbm9yZSAqLyB9XG5cdFx0fVxuXHRcdGlmIChPYmplY3Qua2V5cyhvdmVycmlkZXMpLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW3sgb3ZlcnJpZGVzLCBzb3VyY2U6ICdleHBlcmltZW50cycgfV0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkT3ZlcnJpZGUodmFsdWU6IHVua25vd24sIHNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc1VuZGVmaW5lZCh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cgJiYgc2NoZW1hLmFnZW50c1dpbmRvdz8uZGVmYXVsdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gIWVxdWFscyh2YWx1ZSwgc2NoZW1hLmFnZW50c1dpbmRvdz8uZGVmYXVsdCk7XG5cdFx0fVxuXHRcdHJldHVybiAhZXF1YWxzKHZhbHVlLCBzY2hlbWEuZGVmYXVsdCk7XG5cdH1cbn1cblxuY29uc3Qgd29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpO1xud29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFJlZ2lzdGVyQ29uZmlndXJhdGlvblNjaGVtYXNDb250cmlidXRpb24sIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlc0NvbnRyaWJ1dGlvbi5JRCwgQ29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXNDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5cbmNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0Li4ud29ya2JlbmNoQ29uZmlndXJhdGlvbk5vZGVCYXNlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0W0FQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HXToge1xuXHRcdFx0J3R5cGUnOiAnYXJyYXknLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzZXR0aW5nIGRlc2NyaXB0aW9uJywgXCJDb25maWd1cmUgc2V0dGluZ3MgdG8gYmUgYXBwbGllZCBmb3IgYWxsIHByb2ZpbGVzLlwiKSxcblx0XHRcdCdkZWZhdWx0JzogW10sXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogdHJ1ZSxcblx0XHRcdHVuaXF1ZUl0ZW1zOiB0cnVlLFxuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBVztBQUNwQixTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxZQUFZLGVBQWUsdUJBQXVCO0FBQzNELFNBQVMsT0FBTyxTQUFTLFVBQVUsU0FBUyxpQkFBaUI7QUFDN0QsU0FBb0MsY0FBYyxzQkFBc0I7QUFDeEUsU0FBUywwQkFBMEIsYUFBYSxlQUFlLGdCQUFpRixtQkFBbUIsbUJBQWtILG1DQUFtQyw2QkFBNEU7QUFDcFksU0FBUyxvQkFBb0IsMEJBQTBCLG9CQUFvQjtBQUMzRSxTQUFvQyxxQkFBOEMsMEJBQXlGLDZCQUE0RCxnQ0FBZ0MsNkJBQTBEO0FBQ2pVLFNBQStCLHlCQUF5QiwyQkFBMkI7QUFDbkYsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywyQkFBMkIseUJBQXlCLHNCQUFzQiwyQkFBMkIsd0JBQTZDLHlCQUF5QixzQkFBMEUsZ0JBQWdCLDhCQUE4Qix5QkFBeUIsNEJBQTRCLDBCQUEwQjtBQUMzWCxTQUFTLGdCQUFnQjtBQUN6QixTQUFpQyxZQUFZLGFBQWEsZ0JBQWdCLGtCQUFrQixxQkFBcUIsaUJBQWlCLDRCQUE0QixvQkFBa0QsNEJBQTRCLDJCQUEyQixrQ0FBa0MsK0JBQStCLDRCQUE0QiwwQ0FBc0U7QUFDMWEsU0FBaUMseUJBQXVELDBCQUEwQiwwQkFBMEI7QUFFNUksU0FBUyxzQkFBc0IsbUNBQW1DO0FBQ2xFLFNBQVMsd0JBQXdCLHFCQUFxQix5QkFBeUIsbUJBQW1CLHNCQUFzQixnQ0FBZ0M7QUFFeEosU0FBUyxZQUFZO0FBR3JCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQWtFLGdCQUFnQixjQUFjLHFCQUFxQixzQ0FBc0M7QUFDM0osU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsT0FBTyxVQUFVLFVBQVUsbUJBQW1CO0FBRXZELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQXlCLHlCQUF5QjtBQUVsRCxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGdDQUFnQyxpQkFBbUMsV0FBc0Q7QUFDakksUUFBTSxtQkFBbUIsZ0JBQWdCLGFBQWEsZ0JBQWdCLGlCQUFpQjtBQUN2RixNQUFJLGtCQUFrQjtBQUNyQixXQUFPLFlBQVksdUJBQXVCO0FBQUEsRUFDM0M7QUFDQSxTQUFPLFlBQVksK0JBQStCO0FBQ25EO0FBRUEsTUFBTSxrQkFBa0IsY0FBYztBQUFBLEVBQXRDO0FBQUE7QUFDQyx1QkFBdUI7QUFBQTtBQUN4QjtBQUVPLE1BQU0seUJBQXlCLFdBQStFO0FBQUEsRUErQ3BILFlBQ0MsRUFBRSxpQkFBaUIsbUJBQW1CLEdBQ3RDLG9CQUNpQix3QkFDQSx5QkFDQSxhQUNBLG9CQUNBLG9CQUNBLFlBQ2pCLGVBQ0M7QUFDRCxVQUFNO0FBUlc7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBOUNsQixTQUFRLGNBQXVCO0FBRy9CLFNBQVEsMkJBQTREO0FBR3BFLFNBQWlCLDBCQUEwRDtBQUUzRSxTQUFRLHNCQUErRCxLQUFLLFVBQVUsSUFBSSxjQUFjLElBQUksWUFBWSxDQUFDLENBQUM7QUFHMUgsU0FBaUIsNEJBQWdFLEtBQUssVUFBVSxJQUFJLFFBQW1DLENBQUM7QUFDeEksU0FBZ0IsMkJBQTZELEtBQUssMEJBQTBCO0FBRTVHLFNBQW1CLGdDQUEyRSxLQUFLLFVBQVUsSUFBSSxRQUEwQyxDQUFDO0FBQzVKLFNBQWdCLCtCQUF3RSxLQUFLLDhCQUE4QjtBQUUzSCxTQUFpQiwrQkFBc0UsS0FBSyxVQUFVLElBQUksUUFBc0MsQ0FBQztBQUNqSixTQUFnQiw4QkFBbUUsS0FBSyw2QkFBNkI7QUFFckgsU0FBaUIsNEJBQTJDLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUM5RixTQUFnQiwyQkFBd0MsS0FBSywwQkFBMEI7QUFFdkYsU0FBaUIsNkJBQXNELEtBQUssVUFBVSxJQUFJLFFBQXdCLENBQUM7QUFDbkgsU0FBZ0IsNEJBQW1ELEtBQUssMkJBQTJCO0FBRW5HLFNBQVEscUJBQThCO0FBRXRDLFNBQVEsc0JBQTBDLEVBQUUsU0FBUyxDQUFDLEVBQUU7QUFFaEUsU0FBaUIsaUNBQWlDLEtBQUssVUFBVSxJQUFJLFFBQTRCLENBQUM7QUFDbEcsU0FBZ0IsZ0NBQWdDLEtBQUssK0JBQStCO0FBb0JuRixTQUFLLHdCQUF3QixTQUFTLEdBQTJCLFdBQVcsYUFBYTtBQUV6RixTQUFLLHFDQUFxQyxJQUFJLFFBQVE7QUFDdEQsU0FBSywyQkFBMkIsSUFBSSxRQUFRO0FBQzVDLFNBQUssdUJBQXVCLEtBQUssVUFBVSxJQUFJLHFCQUFxQix1QkFBdUIsZUFBZSxJQUFJLG9CQUFvQixvQkFBb0IsVUFBVSxDQUFDO0FBQ2pLLFNBQUssc0JBQXNCLHlCQUF5QixvQkFBb0IsSUFBSSx3QkFBd0IsSUFBSSxLQUFLLFVBQVUsSUFBSSxvQkFBb0IsS0FBSyxzQkFBc0IsZUFBZSxVQUFVLENBQUM7QUFDcE0sU0FBSyxxQkFBcUI7QUFDMUIsU0FBSyxpQkFBaUIsSUFBSSxjQUFjLEtBQUsscUJBQXFCLG9CQUFvQixLQUFLLG9CQUFvQixvQkFBb0IsbUJBQW1CLGlCQUFpQixVQUFVLEdBQUcsbUJBQW1CLGlCQUFpQixVQUFVLEdBQUcsbUJBQW1CLGlCQUFpQixVQUFVLEdBQUcsbUJBQW1CLGlCQUFpQixVQUFVLEdBQUcsSUFBSSxZQUFZLEdBQUcsbUJBQW1CLGlCQUFpQixVQUFVLEdBQUcsSUFBSSxZQUFnQyxHQUFHLEtBQUssV0FBVyxVQUFVO0FBQzVjLFNBQUssc0NBQXNDLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBQy9FLFNBQUssK0JBQStCO0FBQ3BDLFNBQUsseUJBQXlCLEtBQUssVUFBVSxJQUFJLGtCQUFrQix1QkFBdUIsZUFBZSxrQkFBa0IsdUJBQXVCLGVBQWUsZUFBZSx1QkFBdUIsZUFBZSxhQUFhLEVBQUUsUUFBUSxnQ0FBZ0MsdUJBQXVCLGdCQUFnQixDQUFDLENBQUMsZUFBZSxFQUFFLEdBQUcsYUFBYSxvQkFBb0IsVUFBVSxDQUFDO0FBQ3RYLFNBQUssVUFBVSxLQUFLLHVCQUF1Qix5QkFBeUIsdUJBQXFCLEtBQUssZ0NBQWdDLGlCQUFpQixDQUFDLENBQUM7QUFDakosUUFBSSxpQkFBaUI7QUFDcEIsWUFBTSwwQkFBMEIsS0FBSywwQkFBMEIsS0FBSyxVQUFVLElBQUksd0JBQXdCLGlCQUFpQixvQkFBb0IsYUFBYSxvQkFBb0Isb0JBQW9CLFVBQVUsQ0FBQztBQUMvTSxXQUFLLFVBQVUsd0JBQXdCLGdCQUFnQixrQ0FBZ0M7QUFDdEYsYUFBSyxVQUFVLHdCQUF3Qix5QkFBeUIsQ0FBQUEsa0NBQWdDLEtBQUssaUNBQWlDQSw2QkFBNEIsQ0FBQyxDQUFDO0FBQ3BLLGFBQUssaUNBQWlDLDRCQUE0QjtBQUNsRSxhQUFLLG1DQUFtQyxLQUFLO0FBQUEsTUFDOUMsQ0FBQyxDQUFDO0FBQUEsSUFDSCxPQUFPO0FBQ04sV0FBSyxtQ0FBbUMsS0FBSztBQUFBLElBQzlDO0FBRUEsU0FBSyx5QkFBeUIsS0FBSyxVQUFVLElBQUksdUJBQXVCLG9CQUFvQixhQUFhLG9CQUFvQixVQUFVLENBQUM7QUFDeEksU0FBSyxVQUFVLEtBQUssdUJBQXVCLHlCQUF5QixlQUFhO0FBQ2hGLFdBQUssZ0NBQWdDLFNBQVMsRUFBRSxLQUFLLE1BQU07QUFDMUQsYUFBSyxVQUFVLGNBQWMsS0FBSyx1QkFBdUI7QUFDekQsYUFBSyw4QkFBOEIsU0FBUztBQUFBLE1BQzdDLENBQUM7QUFBQSxJQUNGLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLHFCQUFxQix5QkFBeUIsQ0FBQyxFQUFFLFlBQVksU0FBUyxNQUFNLEtBQUssOEJBQThCLFVBQVUsVUFBVSxDQUFDLENBQUM7QUFDekosU0FBSyxVQUFVLEtBQUssb0JBQW9CLHlCQUF5Qix3QkFBc0IsS0FBSyw2QkFBNkIsa0JBQWtCLENBQUMsQ0FBQztBQUM3SSxTQUFLLFVBQVUsdUJBQXVCLDBCQUEwQixPQUFLLEtBQUsseUJBQXlCLENBQUMsQ0FBQyxDQUFDO0FBRXRHLFNBQUssd0JBQXdCLElBQUksTUFBWTtBQUFBLEVBQzlDO0FBQUEsRUExREEsSUFBSSxxQkFBcUI7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFxQjtBQUFBLEVBNERwRCxpQ0FBdUM7QUFDOUMsU0FBSyxvQ0FBb0MsTUFBTTtBQUMvQyxRQUFJLEtBQUssdUJBQXVCLGVBQWUsYUFBYSxLQUFLLHVCQUF1QixlQUFlLGlCQUFpQixVQUFVO0FBQ2pJLFdBQUssMkJBQTJCO0FBQUEsSUFDakMsT0FBTztBQUNOLFdBQUssMkJBQTJCLEtBQUssb0NBQW9DLElBQUksS0FBSyxVQUFVLElBQUkseUJBQXlCLEtBQUsseUJBQXlCLEtBQUssYUFBYSxLQUFLLG9CQUFvQixLQUFLLFVBQVUsQ0FBQyxDQUFDO0FBQ25OLFdBQUssb0NBQW9DLElBQUksS0FBSyx5QkFBeUIseUJBQXlCLHdCQUFzQixLQUFLLGtDQUFrQyxrQkFBa0IsQ0FBQyxDQUFDO0FBQUEsSUFDdEw7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUlBLE1BQWEsdUJBQTJDO0FBQ3ZELFVBQU0sS0FBSyx5QkFBeUIsS0FBSztBQUN6QyxXQUFPLEtBQUssYUFBYTtBQUFBLEVBQzFCO0FBQUEsRUFFTyxlQUEwQjtBQUNoQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxvQkFBb0M7QUFFMUMsUUFBSSxLQUFLLFVBQVUsZUFBZTtBQUNqQyxhQUFPLGVBQWU7QUFBQSxJQUN2QjtBQUdBLFFBQUksS0FBSyxVQUFVLFFBQVEsV0FBVyxHQUFHO0FBQ3hDLGFBQU8sZUFBZTtBQUFBLElBQ3ZCO0FBR0EsV0FBTyxlQUFlO0FBQUEsRUFDdkI7QUFBQSxFQUVPLG1CQUE0QjtBQUNsQyxXQUFPLEtBQUssa0JBQWtCLE1BQU0sZUFBZTtBQUFBLEVBQ3BEO0FBQUEsRUFFTyxtQkFBbUIsVUFBd0M7QUFDakUsV0FBTyxLQUFLLFVBQVUsVUFBVSxRQUFRO0FBQUEsRUFDekM7QUFBQSxFQUVPLFdBQVcsY0FBOEMsT0FBK0I7QUFDOUYsV0FBTyxLQUFLLGNBQWMsY0FBYyxDQUFDLEdBQUcsS0FBSztBQUFBLEVBQ2xEO0FBQUEsRUFFTyxjQUFjLGlCQUF1QztBQUMzRCxXQUFPLEtBQUssY0FBYyxDQUFDLEdBQUcsZUFBZTtBQUFBLEVBQzlDO0FBQUEsRUFFQSxNQUFhLGNBQWMsY0FBOEMsaUJBQXdCLE9BQStCO0FBQy9ILFdBQU8sS0FBSyxzQkFBc0IsTUFBTSxNQUFNLEtBQUssZ0JBQWdCLGNBQWMsaUJBQWlCLEtBQUssQ0FBQztBQUFBLEVBQ3pHO0FBQUEsRUFFTyxrQkFBa0IsVUFBd0I7QUFDaEQsV0FBTyxDQUFDLENBQUMsS0FBSyxtQkFBbUIsUUFBUTtBQUFBLEVBQzFDO0FBQUEsRUFFTyxtQkFBbUIscUJBQTZGO0FBQ3RILFlBQVEsS0FBSyxrQkFBa0IsR0FBRztBQUFBLE1BQ2pDLEtBQUssZUFBZSxRQUFRO0FBQzNCLFlBQUksWUFBNkI7QUFDakMsWUFBSSxJQUFJLE1BQU0sbUJBQW1CLEdBQUc7QUFDbkMsc0JBQVk7QUFBQSxRQUNiLFdBQVcsa0NBQWtDLG1CQUFtQixHQUFHO0FBQ2xFLHNCQUFZLG9CQUFvQjtBQUFBLFFBQ2pDO0FBRUEsZUFBTyxJQUFJLE1BQU0sU0FBUyxLQUFLLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxXQUFXLEtBQUssVUFBVSxRQUFRLENBQUMsRUFBRSxHQUFHO0FBQUEsTUFDL0c7QUFBQSxNQUNBLEtBQUssZUFBZTtBQUNuQixlQUFPLHNCQUFzQixtQkFBbUIsS0FBSyxLQUFLLFVBQVUsT0FBTyxvQkFBb0I7QUFBQSxJQUNqRztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLGdCQUFnQixjQUE4QyxpQkFBd0IsT0FBK0I7QUFDbEksUUFBSSxLQUFLLGtCQUFrQixNQUFNLGVBQWUsV0FBVztBQUMxRCxhQUFPLFFBQVEsUUFBUSxNQUFTO0FBQUEsSUFDakM7QUFFQSxRQUFJLGFBQWEsU0FBUyxnQkFBZ0IsV0FBVyxHQUFHO0FBQ3ZELGFBQU8sUUFBUSxRQUFRLE1BQVM7QUFBQSxJQUNqQztBQUVBLFFBQUkscUJBQXFCO0FBR3pCLFFBQUksMEJBQTBCLEtBQUssYUFBYSxFQUFFO0FBQ2xELFFBQUksbUJBQTZDLHdCQUF3QixJQUFJLE9BQUssRUFBRSxHQUFHLEVBQUUsT0FBTyxDQUFDLFFBQVFDLFdBQTRDO0FBQ3BKLFVBQUksQ0FBQyx3QkFBd0IsTUFBTSxHQUFHO0FBQ3JDLGVBQU87QUFBQSxNQUNSO0FBRUEsYUFBTyxDQUFDLEtBQUssU0FBUyxpQkFBaUIsd0JBQXdCQSxNQUFLLEVBQUUsR0FBRztBQUFBLElBQzFFLENBQUM7QUFFRCx5QkFBcUIsd0JBQXdCLFdBQVcsaUJBQWlCO0FBR3pFLFFBQUksYUFBYSxRQUFRO0FBR3hCLFlBQU0sc0JBQXNCLEtBQUssYUFBYSxFQUFFO0FBQ2hELFlBQU0sd0JBQXdCLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxtQkFBbUI7QUFDeEYsZ0NBQTBCLG1CQUFtQixrQkFBa0IscUJBQXFCLEtBQUssbUJBQW1CLE1BQU07QUFDbEgsWUFBTSw2QkFBNkIsd0JBQXdCLElBQUksWUFBVSxPQUFPLEdBQUc7QUFFbkYsWUFBTSxxQkFBK0MsQ0FBQztBQUV0RCxpQkFBVyxlQUFlLGNBQWM7QUFDdkMsY0FBTSxZQUFZLFlBQVk7QUFDOUIsWUFBSSxLQUFLLFNBQVMsNEJBQTRCLFNBQVMsR0FBRztBQUN6RDtBQUFBLFFBQ0Q7QUFDQSxZQUFJO0FBQ0gsZ0JBQU0sU0FBUyxNQUFNLEtBQUssWUFBWSxLQUFLLFNBQVM7QUFDcEQsY0FBSSxDQUFDLE9BQU8sYUFBYTtBQUN4QjtBQUFBLFVBQ0Q7QUFBQSxRQUNELFNBQVMsR0FBRztBQUFBLFFBQWU7QUFDM0IsMkJBQW1CLEtBQUsseUJBQXlCLFdBQVcsT0FBTyxZQUFZLE1BQU0sdUJBQXVCLEtBQUssbUJBQW1CLE1BQU0sQ0FBQztBQUFBLE1BQzVJO0FBR0EsVUFBSSxtQkFBbUIsU0FBUyxHQUFHO0FBQ2xDLDZCQUFxQjtBQUVyQixZQUFJLE9BQU8sVUFBVSxZQUFZLFNBQVMsS0FBSyxRQUFRLGlCQUFpQixRQUFRO0FBQy9FLDZCQUFtQixpQkFBaUIsTUFBTSxDQUFDO0FBQzNDLDJCQUFpQixPQUFPLE9BQU8sR0FBRyxHQUFHLGtCQUFrQjtBQUFBLFFBQ3hELE9BQU87QUFDTiw2QkFBbUIsQ0FBQyxHQUFHLGtCQUFrQixHQUFHLGtCQUFrQjtBQUFBLFFBQy9EO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxRQUFJLG9CQUFvQjtBQUN2QixhQUFPLEtBQUssV0FBVyxnQkFBZ0I7QUFBQSxJQUN4QztBQUVBLFdBQU8sUUFBUSxRQUFRLE1BQVM7QUFBQSxFQUNqQztBQUFBLEVBRUEsTUFBYyxXQUFXLFNBQWtEO0FBQzFFLFFBQUksQ0FBQyxLQUFLLHNCQUFzQjtBQUMvQixZQUFNLElBQUksTUFBTSw4RkFBOEY7QUFBQSxJQUMvRztBQUVBLFVBQU0sS0FBSyxxQkFBcUIsZUFBZSxjQUFZLEtBQUssdUJBQXVCLFdBQVcsU0FBUyxTQUFTLElBQUksbUJBQW1CLENBQUMsQ0FBQztBQUM3SSxXQUFPLEtBQUssZ0NBQWdDLEtBQUs7QUFBQSxFQUNsRDtBQUFBLEVBRVEsU0FBUyxXQUFrQixTQUF1QjtBQUN6RCxXQUFPLFVBQVUsS0FBSyxjQUFZLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxVQUFVLE9BQU8sQ0FBQztBQUFBLEVBQzVGO0FBQUE7QUFBQSxFQUlBLHVCQUEyQztBQUMxQyxXQUFPLEtBQUssZUFBZSxPQUFPO0FBQUEsRUFDbkM7QUFBQSxFQU1BLFNBQVMsTUFBZ0IsTUFBeUI7QUFDakQsVUFBTSxVQUFVLE9BQU8sU0FBUyxXQUFXLE9BQU87QUFDbEQsVUFBTSxZQUFZLHlCQUF5QixJQUFJLElBQUksT0FBTyx5QkFBeUIsSUFBSSxJQUFJLE9BQU87QUFDbEcsV0FBTyxLQUFLLGVBQWUsU0FBUyxTQUFTLFNBQVM7QUFBQSxFQUN2RDtBQUFBLEVBTUEsTUFBTSxZQUFZLEtBQWEsT0FBZ0IsTUFBZ0IsTUFBZ0IsU0FBc0Q7QUFDcEksVUFBTSxZQUF1RCwrQkFBK0IsSUFBSSxJQUFJLE9BQ2pHLHlCQUF5QixJQUFJLElBQUksRUFBRSxVQUFVLEtBQUssVUFBVSxxQkFBcUIsS0FBSyxxQkFBcUIsQ0FBQyxLQUFLLGtCQUFrQixJQUFJLE9BQVUsSUFBSTtBQUN4SixVQUFNLFNBQTJDLFlBQVksT0FBTztBQUNwRSxVQUFNLFVBQWlDLFNBQVMsQ0FBQyxNQUFNLElBQUksQ0FBQztBQUU1RCxRQUFJLFdBQVcscUJBQXFCO0FBQ25DLGdCQUFVLHNCQUFzQixTQUFTLFVBQVUsbUJBQW1CO0FBQ3RFLGdCQUFVLHNCQUFzQixVQUFVLG9CQUFvQixTQUFTLFVBQVUsc0JBQXNCO0FBQUEsSUFDeEc7QUFFQSxRQUFJLENBQUMsUUFBUSxRQUFRO0FBQ3BCLFVBQUksV0FBVyx1QkFBdUIsVUFBVSxvQkFBb0IsU0FBUyxHQUFHO0FBQy9FLGNBQU0sSUFBSSxNQUFNLDZGQUE2RjtBQUFBLE1BQzlHO0FBQ0EsWUFBTSxVQUFVLEtBQUssUUFBUSxLQUFLLEVBQUUsVUFBVSxXQUFXLFVBQVUsb0JBQW9CLFdBQVcsc0JBQXNCLFVBQVUsb0JBQW9CLENBQUMsSUFBSSxPQUFVLENBQUM7QUFDdEssY0FBUSxLQUFLLEdBQUcsS0FBSywyQkFBMkIsS0FBSyxPQUFPLE9BQU8sQ0FBQztBQUdwRSxVQUFJLE9BQU8sT0FBTyxRQUFRLFlBQVksS0FBSyxRQUFRLFdBQVcsTUFBTSxRQUFRLENBQUMsTUFBTSxvQkFBb0IsUUFBUSxRQUFRLENBQUMsTUFBTSxvQkFBb0IsYUFBYTtBQUM5SixnQkFBUTtBQUFBLE1BQ1Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLFFBQVEsUUFBUSxJQUFJLENBQUFDLFlBQVUsS0FBSyx3QkFBd0IsS0FBSyxPQUFPQSxTQUFRLFdBQVcsT0FBTyxDQUFDLENBQUM7QUFBQSxFQUNuSDtBQUFBLEVBRUEsTUFBTSxvQkFBb0IsUUFBZ0U7QUFDekYsUUFBSSxXQUFXLFFBQVc7QUFDekIsV0FBSywyQkFBMkI7QUFDaEMsWUFBTSxjQUFjLE1BQU0sS0FBSywrQkFBK0IsSUFBSTtBQUNsRSxZQUFNLEVBQUUsT0FBTyxPQUFPLElBQUksTUFBTSxLQUFLLHdCQUF3QjtBQUM3RCxZQUFNLEtBQUssNkJBQTZCO0FBQ3hDLFlBQU0sS0FBSyxrQkFBa0IsYUFBYSxPQUFPLFFBQVEsSUFBSTtBQUM3RDtBQUFBLElBQ0Q7QUFFQSxRQUFJLGtCQUFrQixNQUFNLEdBQUc7QUFDOUIsWUFBTSxLQUFLLG1DQUFtQyxNQUFNO0FBQ3BEO0FBQUEsSUFDRDtBQUVBLFlBQVEsUUFBUTtBQUFBLE1BQ2YsS0FBSyxvQkFBb0I7QUFDeEIsYUFBSywyQkFBMkI7QUFDaEM7QUFBQSxNQUVELEtBQUssb0JBQW9CLE1BQU07QUFDOUIsY0FBTSxFQUFFLE9BQU8sT0FBTyxJQUFJLE1BQU0sS0FBSyx3QkFBd0I7QUFDN0QsY0FBTSxLQUFLLGtCQUFrQixLQUFLLGVBQWUsMEJBQTBCLE9BQU8sUUFBUSxJQUFJO0FBQzlGO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxvQkFBb0I7QUFDeEIsY0FBTSxLQUFLLDZCQUE2QjtBQUN4QztBQUFBLE1BRUQsS0FBSyxvQkFBb0I7QUFDeEIsY0FBTSxLQUFLLDhCQUE4QjtBQUN6QztBQUFBLE1BRUQsS0FBSyxvQkFBb0I7QUFBQSxNQUN6QixLQUFLLG9CQUFvQjtBQUN4QixjQUFNLEtBQUssNkJBQTZCO0FBQ3hDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLDBDQUFtRDtBQUNsRCxXQUFPLEtBQUsscUJBQXFCLHdDQUF3QztBQUFBLEVBQzFFO0FBQUEsRUFFQSxRQUFXLEtBQWEsV0FBNkQ7QUFDcEYsV0FBTyxLQUFLLGVBQWUsUUFBVyxLQUFLLFNBQVM7QUFBQSxFQUNyRDtBQUFBLEVBRUEsT0FNRTtBQUNELFdBQU8sS0FBSyxlQUFlLEtBQUs7QUFBQSxFQUNqQztBQUFBLEVBRUEsTUFBYSxnQ0FBK0M7QUFDM0QsVUFBTSxLQUFLLG1DQUFtQyxLQUFLO0FBQUEsRUFDcEQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBZUEsTUFBTSxXQUFXLEtBQTZDO0FBQzdELFNBQUssK0JBQStCO0FBRXBDLFVBQU0sVUFBVSxLQUFLO0FBQ3JCLFNBQUssY0FBYztBQUNuQixVQUFNLFlBQVksTUFBTSxLQUFLLGdCQUFnQixHQUFHO0FBQ2hELFVBQU0sS0FBSywwQ0FBMEMsV0FBVyxPQUFPO0FBQ3ZFLFNBQUssOEJBQThCLEtBQUs7QUFFeEMsU0FBSyw4QkFBOEI7QUFBQSxFQUNwQztBQUFBLEVBRUEscUJBQXFCLFNBQXdCO0FBQzVDLFFBQUksS0FBSyx1QkFBdUIsU0FBUztBQUN4QyxXQUFLLHFCQUFxQjtBQUMxQixZQUFNLE9BQU8sS0FBSyxlQUFlLE9BQU87QUFDeEMsWUFBTSw0QkFBZ0UsQ0FBQztBQUN2RSxpQkFBVyxVQUFVLEtBQUssVUFBVSxTQUFTO0FBQzVDLGNBQU0sc0JBQXNCLEtBQUssb0JBQW9CLElBQUksT0FBTyxHQUFHO0FBQ25FLFlBQUk7QUFDSixZQUFJLHFCQUFxQjtBQUN4QiwrQkFBcUIsb0JBQW9CLHFCQUFxQixLQUFLLGtCQUFrQjtBQUNyRixlQUFLLGVBQWUsMEJBQTBCLE9BQU8sS0FBSyxrQkFBa0I7QUFBQSxRQUM3RTtBQUNBLGtDQUEwQixLQUFLLGtCQUFrQjtBQUFBLE1BQ2xEO0FBQ0EsVUFBSSxLQUFLLGtCQUFrQixNQUFNLGVBQWUsUUFBUTtBQUN2RCxZQUFJLDBCQUEwQixDQUFDLEdBQUc7QUFDakMsZUFBSyxlQUFlLDZCQUE2QiwwQkFBMEIsQ0FBQyxDQUFDO0FBQUEsUUFDOUU7QUFBQSxNQUNELE9BQU87QUFDTixhQUFLLGVBQWUsNkJBQTZCLEtBQUssdUJBQXVCLHFCQUFxQixLQUFLLGtCQUFrQixDQUFDO0FBQUEsTUFDM0g7QUFDQSxXQUFLLHlCQUF5QjtBQUU5QixVQUFJLE9BQWlCLENBQUM7QUFDdEIsVUFBSSxLQUFLLG1CQUFtQixXQUFXO0FBQ3RDLGFBQUssS0FBSyxHQUFHLEtBQUssbUJBQW1CLFNBQVM7QUFBQSxNQUMvQztBQUNBLFVBQUksS0FBSyxtQkFBbUIsWUFBWTtBQUN2QyxhQUFLLEtBQUssR0FBRyxLQUFLLG1CQUFtQixVQUFVO0FBQUEsTUFDaEQ7QUFDQSxVQUFJLEtBQUssbUJBQW1CLFdBQVc7QUFDdEMsYUFBSyxLQUFLLEdBQUcsS0FBSyxtQkFBbUIsU0FBUztBQUFBLE1BQy9DO0FBQ0EsV0FBSyxtQkFBbUIsaUJBQWlCLFFBQVEsQ0FBQyxVQUFVLEtBQUssS0FBSyxHQUFHLEtBQUssQ0FBQztBQUMvRSxhQUFPLFNBQVMsSUFBSTtBQUNwQixVQUFJLEtBQUssUUFBUTtBQUNoQixhQUFLLDJCQUEyQixFQUFFLE1BQU0sV0FBVyxDQUFDLEVBQUUsR0FBRyxFQUFFLE1BQU0sV0FBVyxLQUFLLFVBQVUsR0FBRyxvQkFBb0IsU0FBUztBQUFBLE1BQzVIO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLDRCQUE0QixzQkFBbUQ7QUFDOUUsU0FBSyx1QkFBdUI7QUFBQSxFQUM3QjtBQUFBLEVBRUEsK0JBQStCLEtBQXNCO0FBQ3BELFVBQU0sUUFBUSxLQUFLLHNCQUFzQiwyQkFBMkIsRUFBRSxHQUFHLEdBQUc7QUFDNUUsUUFBSSxTQUFTLG1CQUFtQixTQUFTLEtBQUssR0FBRztBQUNoRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sc0JBQXNCLEtBQUssU0FBbUIsMEJBQTBCLEtBQUssQ0FBQztBQUNwRixXQUFPLE1BQU0sUUFBUSxtQkFBbUIsS0FBSyxvQkFBb0IsU0FBUyxHQUFHO0FBQUEsRUFDOUU7QUFBQSxFQUVBLE1BQWMsZ0JBQWdCLEtBQWtEO0FBQy9FLFFBQUksc0JBQXNCLEdBQUcsR0FBRztBQUMvQixhQUFPLEtBQUssMkJBQTJCLEdBQUc7QUFBQSxJQUMzQztBQUVBLFFBQUksa0NBQWtDLEdBQUcsR0FBRztBQUMzQyxhQUFPLEtBQUssNEJBQTRCLEdBQUc7QUFBQSxJQUM1QztBQUVBLFdBQU8sS0FBSyxxQkFBcUIsR0FBRztBQUFBLEVBQ3JDO0FBQUEsRUFFQSxNQUFjLDJCQUEyQixxQkFBK0Q7QUFDdkcsVUFBTSxLQUFLLHVCQUF1QixXQUFXLEVBQUUsSUFBSSxvQkFBb0IsSUFBSSxZQUFZLG9CQUFvQixXQUFXLEdBQUcsS0FBSyxrQkFBa0I7QUFDaEosVUFBTSxzQkFBc0Isb0JBQW9CO0FBQ2hELFVBQU0sbUJBQW1CLG1CQUFtQixLQUFLLHVCQUF1QixXQUFXLEdBQUcscUJBQXFCLEtBQUssbUJBQW1CLE1BQU07QUFDekksVUFBTSxjQUFjLG9CQUFvQjtBQUN4QyxVQUFNLFlBQVksSUFBSSxVQUFVLGFBQWEsa0JBQWtCLEtBQUssdUJBQXVCLFlBQVksR0FBRyxxQkFBcUIsU0FBTyxLQUFLLG1CQUFtQixPQUFPLGlCQUFpQixHQUFHLENBQUM7QUFDMUwsY0FBVSxjQUFjLEtBQUssdUJBQXVCO0FBQ3BELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSw0QkFBNEIsaUNBQThFO0FBQ2pILFVBQU0sWUFBWSxJQUFJLFVBQVUsZ0NBQWdDLElBQUksQ0FBQyxrQkFBa0IsZ0NBQWdDLEdBQUcsQ0FBQyxHQUFHLE9BQU8sTUFBTSxTQUFPLEtBQUssbUJBQW1CLE9BQU8saUJBQWlCLEdBQUcsQ0FBQztBQUN0TSxjQUFVLGNBQWM7QUFDeEIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHFCQUFxQiwwQkFBeUU7QUFDckcsVUFBTSxZQUFZLElBQUksVUFBVSx5QkFBeUIsSUFBSSxDQUFDLEdBQUcsT0FBTyxNQUFNLFNBQU8sS0FBSyxtQkFBbUIsT0FBTyxpQkFBaUIsR0FBRyxDQUFDO0FBQ3pJLGNBQVUsY0FBYztBQUN4QixXQUFPLFFBQVEsUUFBUSxTQUFTO0FBQUEsRUFDakM7QUFBQSxFQUVRLDhCQUE4QixXQUEwQjtBQUMvRCxRQUFJLENBQUMsS0FBSyx5QkFBeUIsT0FBTyxLQUFLLEtBQUssVUFBVSxhQUFhO0FBQzFFLFdBQUsseUJBQXlCLEtBQUs7QUFDbkMsV0FBSyxrQ0FBa0MsU0FBUztBQUFBLElBQ2pEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYywwQ0FBMEMsV0FBc0IsU0FBaUM7QUFDOUcsVUFBTSxxQkFBcUIsQ0FBQyxDQUFDLEtBQUs7QUFDbEMsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJLGtCQUFxQyxDQUFDO0FBRTFDLFFBQUksb0JBQW9CO0FBQ3ZCLHNCQUFnQixLQUFLLGtCQUFrQjtBQUN2Qyw4QkFBd0IsS0FBSyxVQUFVLGdCQUFnQixLQUFLLFVBQVUsY0FBYyxTQUFTO0FBQzdGLHdCQUFrQixLQUFLLFVBQVU7QUFDakMsV0FBSyxVQUFVLE9BQU8sU0FBUztBQUFBLElBQ2hDLE9BQU87QUFDTixXQUFLLFlBQVk7QUFBQSxJQUNsQjtBQUVBLFVBQU0sS0FBSyx3QkFBd0IsT0FBTztBQUcxQyxRQUFJLG9CQUFvQjtBQUN2QixZQUFNLFdBQVcsS0FBSyxrQkFBa0I7QUFDeEMsVUFBSSxpQkFBaUIsYUFBYSxlQUFlO0FBQ2hELGFBQUssMkJBQTJCLEtBQUssUUFBUTtBQUFBLE1BQzlDO0FBRUEsWUFBTSxtQkFBbUIsS0FBSyxVQUFVLGdCQUFnQixLQUFLLFVBQVUsY0FBYyxTQUFTO0FBQzlGLFVBQUkseUJBQXlCLHFCQUFxQix5QkFBeUIsYUFBYSxlQUFlO0FBQ3RHLGFBQUssMEJBQTBCLEtBQUs7QUFBQSxNQUNyQztBQUVBLFlBQU0sZ0JBQWdCLEtBQUssZUFBZSxpQkFBaUIsS0FBSyxVQUFVLE9BQU87QUFDakYsVUFBSSxrQkFBa0IsY0FBYyxNQUFNLFVBQVUsY0FBYyxRQUFRLFVBQVUsY0FBYyxRQUFRLFNBQVM7QUFDbEgsY0FBTSxLQUFLLGlDQUFpQyxlQUFlLEtBQUs7QUFDaEUsYUFBSyw2QkFBNkIsS0FBSyxhQUFhO0FBQUEsTUFDckQ7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLEtBQUssdUJBQXVCLGdCQUFnQjtBQUVoRCxXQUFLLFVBQVUsa0JBQWtCLFlBQVksTUFBTSxLQUFLLDZCQUE2QixPQUFPLEtBQUssZUFBZSxzQkFBc0IsQ0FBQyxDQUFDO0FBQUEsSUFDekk7QUFBQSxFQUNEO0FBQUEsRUFFUSxlQUFlLGdCQUFvQyxZQUE4RDtBQUN4SCxVQUFNLFNBQXVDLEVBQUUsT0FBTyxDQUFDLEdBQUcsU0FBUyxDQUFDLEdBQUcsU0FBUyxDQUFDLEVBQUU7QUFDbkYsV0FBTyxRQUFRLFdBQVcsT0FBTyxlQUFhLENBQUMsZUFBZSxLQUFLLG1CQUFpQixVQUFVLElBQUksU0FBUyxNQUFNLGNBQWMsSUFBSSxTQUFTLENBQUMsQ0FBQztBQUM5SSxhQUFTLGVBQWUsR0FBRyxlQUFlLGVBQWUsUUFBUSxnQkFBZ0I7QUFDaEYsWUFBTSxnQkFBZ0IsZUFBZSxZQUFZO0FBQ2pELFVBQUksV0FBVztBQUNmLFdBQUssV0FBVyxHQUFHLFdBQVcsV0FBVyxVQUFVLGNBQWMsSUFBSSxTQUFTLE1BQU0sV0FBVyxRQUFRLEVBQUUsSUFBSSxTQUFTLEdBQUcsWUFBWTtBQUFBLE1BQUU7QUFDdkksVUFBSSxXQUFXLFdBQVcsUUFBUTtBQUNqQyxZQUFJLGlCQUFpQixZQUFZLGNBQWMsU0FBUyxXQUFXLFFBQVEsRUFBRSxNQUFNO0FBQ2xGLGlCQUFPLFFBQVEsS0FBSyxhQUFhO0FBQUEsUUFDbEM7QUFBQSxNQUNELE9BQU87QUFDTixlQUFPLFFBQVEsS0FBSyxhQUFhO0FBQUEsTUFDbEM7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsd0JBQXdCLFNBQWlDO0FBQ3RFLFVBQU0sS0FBSyxxQkFBcUIsV0FBVztBQUUzQyxVQUFNLGlDQUFpQyxLQUFLLG9CQUFvQixXQUFXO0FBQzNFLFVBQU0sc0NBQXNDLEtBQUssMkJBQTJCLEtBQUsseUJBQXlCLFdBQVcsSUFBSSxRQUFRLFFBQVEsbUJBQW1CLGlCQUFpQixLQUFLLFVBQVUsQ0FBQztBQUM3TCxVQUFNLHdCQUF3QixZQUFZO0FBQ3pDLFdBQUssZ0NBQWdDO0FBQ3JDLFlBQU0sU0FBUyxNQUFNLFFBQVEsSUFBSSxDQUFDLEtBQUssdUJBQXVCLFdBQVcsR0FBRyxLQUFLLDBCQUEwQixLQUFLLHdCQUF3QixXQUFXLElBQUksUUFBUSxRQUFRLG1CQUFtQixpQkFBaUIsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDO0FBQzdOLFVBQUksS0FBSywwQkFBMEI7QUFDbEMsY0FBTSxnQ0FBZ0MsTUFBTTtBQUM1QyxlQUFPLENBQUMsSUFBSSxLQUFLLHVCQUF1QixRQUFRLEVBQUUsU0FBUyw4QkFBOEIsU0FBUywwQkFBMEIsRUFBRSxDQUFDO0FBQUEsTUFDaEk7QUFDQSxXQUFLLCtCQUErQjtBQUNwQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sQ0FBQyxFQUFFLGFBQWEsQ0FBQyxPQUFPLE1BQU0sQ0FBQyxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQUEsTUFDMUQ7QUFBQSxNQUNBO0FBQUEsTUFDQSxzQkFBc0I7QUFBQSxJQUN2QixDQUFDO0FBRUQsU0FBSyxxQ0FBcUM7QUFDMUMsVUFBTSxLQUFLLGtCQUFrQixhQUFhLE9BQU8sUUFBUSxPQUFPO0FBQ2hFLFNBQUssb0NBQW9DO0FBQUEsRUFDMUM7QUFBQSxFQUVRLDZCQUFtQztBQUMxQyxTQUFLLDhCQUE4QixLQUFLLHFCQUFxQixPQUFPLENBQUM7QUFBQSxFQUN0RTtBQUFBLEVBRUEsTUFBYywrQkFBK0IsY0FBcUQ7QUFDakcsUUFBSSxDQUFDLEtBQUssMEJBQTBCO0FBQ25DLGFBQU8sbUJBQW1CLGlCQUFpQixLQUFLLFVBQVU7QUFBQSxJQUMzRDtBQUNBLFVBQU0sUUFBUSxNQUFNLEtBQUsseUJBQXlCLGtCQUFrQjtBQUNwRSxRQUFJLENBQUMsY0FBYztBQUNsQixXQUFLLGtDQUFrQyxLQUFLO0FBQUEsSUFDN0M7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYywwQkFBOEY7QUFDM0csVUFBTSxDQUFDLE9BQU8sTUFBTSxJQUFJLE1BQU0sUUFBUSxJQUFJLENBQUMsS0FBSyw2QkFBNkIsSUFBSSxHQUFHLEtBQUssOEJBQThCLElBQUksQ0FBQyxDQUFDO0FBQzdILFdBQU8sRUFBRSxPQUFPLE9BQU87QUFBQSxFQUN4QjtBQUFBLEVBRUEsTUFBTSw2QkFBNkIsY0FBd0IsdUJBQXlFO0FBQ25JLFVBQU0sUUFBUSxNQUFNLEtBQUssdUJBQXVCLE9BQU8scUJBQXFCO0FBQzVFLFFBQUksQ0FBQyxjQUFjO0FBQ2xCLFdBQUssZ0NBQWdDLEtBQUs7QUFBQSxJQUMzQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLDhCQUE4QixjQUFxRDtBQUNoRyxRQUFJLEtBQUsseUJBQXlCO0FBQ2pDLFlBQU0sUUFBUSxNQUFNLEtBQUssd0JBQXdCLE9BQU87QUFDeEQsVUFBSSxDQUFDLGNBQWM7QUFDbEIsYUFBSyxpQ0FBaUMsS0FBSztBQUFBLE1BQzVDO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLG1CQUFtQixpQkFBaUIsS0FBSyxVQUFVO0FBQUEsRUFDM0Q7QUFBQSxFQUVBLE1BQWMsK0JBQThDO0FBQzNELFVBQU0saUJBQWlCLEtBQUssa0JBQWtCO0FBQzlDLFFBQUksbUJBQW1CLGVBQWUsUUFBUTtBQUM3QyxhQUFPLEtBQUssc0NBQXNDLEtBQUssVUFBVSxRQUFRLENBQUMsQ0FBQztBQUFBLElBQzVFO0FBQ0EsUUFBSSxtQkFBbUIsZUFBZSxXQUFXO0FBQ2hELGFBQU8sS0FBSyx1QkFBdUIsT0FBTyxFQUFFLEtBQUssTUFBTSxLQUFLLGdDQUFnQyxLQUFLLENBQUM7QUFBQSxJQUNuRztBQUFBLEVBQ0Q7QUFBQSxFQUVRLG1DQUFtQyxRQUF5QztBQUNuRixXQUFPLEtBQUssc0NBQXNDLE1BQU07QUFBQSxFQUN6RDtBQUFBLEVBRUEsTUFBYyxrQkFBa0IsK0JBQW1ELHdCQUE0Qyw4QkFBa0QsU0FBaUM7QUFFak4sU0FBSyxvQkFBb0IsbUJBQW1CO0FBRTVDLFVBQU0sVUFBVSxLQUFLLFVBQVU7QUFDL0IsVUFBTSx1QkFBdUIsTUFBTSxLQUFLLHlCQUF5QixPQUFPO0FBRXhFLFVBQU0seUJBQXlCLEtBQUssK0JBQStCLG9CQUFvQjtBQUN2RixVQUFNLDRCQUE0QixJQUFJLFlBQWdDO0FBQ3RFLHlCQUFxQixRQUFRLENBQUMscUJBQXFCLFVBQVUsMEJBQTBCLElBQUksUUFBUSxLQUFLLEVBQUUsS0FBSyxtQkFBbUIsQ0FBQztBQUVuSSxVQUFNLHVCQUF1QixLQUFLO0FBQ2xDLFNBQUssaUJBQWlCLElBQUksY0FBYyxLQUFLLHFCQUFxQixvQkFBb0IsS0FBSyxvQkFBb0Isb0JBQW9CLCtCQUErQix3QkFBd0IsOEJBQThCLHdCQUF3QiwyQkFBMkIsbUJBQW1CLGlCQUFpQixLQUFLLFVBQVUsR0FBRyxJQUFJLFlBQWdDLEdBQUcsS0FBSyxXQUFXLEtBQUssVUFBVTtBQUV2WSxTQUFLLGNBQWM7QUFFbkIsUUFBSSxTQUFTO0FBQ1osWUFBTSxTQUFTLEtBQUssZUFBZSxRQUFRLG9CQUFvQjtBQUMvRCxXQUFLLDJCQUEyQixRQUFRLEVBQUUsTUFBTSxxQkFBcUIsT0FBTyxHQUFHLFdBQVcsS0FBSyxVQUFVLEdBQUcsb0JBQW9CLFNBQVM7QUFBQSxJQUMxSTtBQUVBLFNBQUsseUJBQXlCO0FBQUEsRUFDL0I7QUFBQSxFQUVRLCtCQUErQixzQkFBZ0U7QUFDdEcsWUFBUSxLQUFLLGtCQUFrQixHQUFHO0FBQUEsTUFDakMsS0FBSyxlQUFlO0FBQ25CLGVBQU8scUJBQXFCLENBQUM7QUFBQSxNQUM5QixLQUFLLGVBQWU7QUFDbkIsZUFBTyxLQUFLLHVCQUF1QixpQkFBaUI7QUFBQSxNQUNyRDtBQUNDLGVBQU8sbUJBQW1CLGlCQUFpQixLQUFLLFVBQVU7QUFBQSxJQUM1RDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHlCQUF5QixHQUF3QztBQUN4RSxNQUFFLE1BQU0sWUFBWTtBQUNuQixZQUFNLFdBQTBDLENBQUM7QUFDakQsZUFBUyxLQUFLLEtBQUssdUJBQXVCLE1BQU0sRUFBRSxRQUFRLGtCQUFrQixFQUFFLFFBQVEsZUFBZSxFQUFFLFFBQVEsYUFBYSxFQUFFLFFBQVEsZ0NBQWdDLEVBQUUsU0FBUyxDQUFDLENBQUMsS0FBSyx1QkFBdUIsRUFBRSxDQUFDLENBQUM7QUFDbk4sVUFBSSxFQUFFLFNBQVMsY0FBYyxFQUFFLFFBQVEsYUFDbkMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxpQkFBaUIsYUFBYSxDQUFDLENBQUMsRUFBRSxRQUFRLGlCQUFpQixVQUFVO0FBQ3JGLGFBQUssK0JBQStCO0FBQ3BDLFlBQUksS0FBSywwQkFBMEI7QUFDbEMsbUJBQVMsS0FBSyxLQUFLLCtCQUErQixJQUFJLENBQUM7QUFBQSxRQUN4RDtBQUFBLE1BQ0Q7QUFDQSxVQUFJLENBQUMsV0FBVyxXQUFXLElBQUksTUFBTSxRQUFRLElBQUksUUFBUTtBQUN6RCxvQkFBYyxlQUFlLEtBQUssZUFBZTtBQUNqRCxVQUFJLEtBQUssMEJBQTBCO0FBQ2xDLG9CQUFZLEtBQUssdUJBQXVCLFFBQVEsRUFBRSxTQUFTLFlBQVksU0FBUywwQkFBMEIsRUFBRSxDQUFDO0FBQUEsTUFDOUc7QUFDQSxZQUFNLEtBQUssa0JBQWtCLGFBQWEsV0FBVyxLQUFLLGVBQWUseUJBQXlCLElBQUk7QUFBQSxJQUN2RyxHQUFHLENBQUM7QUFBQSxFQUNMO0FBQUEsRUFFUSw4QkFBOEIsb0JBQXdDLFlBQTZCO0FBQzFHLFFBQUksS0FBSyxXQUFXO0FBQ25CLFlBQU0sZUFBZSxLQUFLLGVBQWUsT0FBTztBQUNoRCxZQUFNLFNBQVMsS0FBSyxlQUFlLHFDQUFxQyxvQkFBb0IsVUFBVTtBQUN0RyxVQUFJLEtBQUssMEJBQTBCO0FBQ2xDLGFBQUssZUFBZSwrQkFBK0IsS0FBSyx5QkFBeUIsUUFBUSxDQUFDO0FBQUEsTUFDM0Y7QUFDQSxVQUFJLEtBQUsseUJBQXlCO0FBQ2pDLGFBQUssZUFBZSw2QkFBNkIsS0FBSyx1QkFBdUIsUUFBUSxDQUFDO0FBQ3RGLGFBQUssZUFBZSw4QkFBOEIsS0FBSyx3QkFBd0IsUUFBUSxDQUFDO0FBQUEsTUFDekY7QUFDQSxVQUFJLEtBQUssa0JBQWtCLE1BQU0sZUFBZSxRQUFRO0FBQ3ZELGNBQU0sc0JBQXNCLEtBQUssb0JBQW9CLElBQUksS0FBSyxVQUFVLFFBQVEsQ0FBQyxFQUFFLEdBQUc7QUFDdEYsWUFBSSxxQkFBcUI7QUFDeEIsZUFBSyxlQUFlLDZCQUE2QixvQkFBb0IsUUFBUSxDQUFDO0FBQzlFLGVBQUssZUFBZSwwQkFBMEIsS0FBSyxVQUFVLFFBQVEsQ0FBQyxFQUFFLEtBQUssb0JBQW9CLFFBQVEsQ0FBQztBQUFBLFFBQzNHO0FBQUEsTUFDRCxPQUFPO0FBQ04sYUFBSyxlQUFlLDZCQUE2QixLQUFLLHVCQUF1Qix5QkFBeUIsQ0FBQztBQUN2RyxtQkFBVyxVQUFVLEtBQUssVUFBVSxTQUFTO0FBQzVDLGdCQUFNLHNCQUFzQixLQUFLLG9CQUFvQixJQUFJLE9BQU8sR0FBRztBQUNuRSxjQUFJLHFCQUFxQjtBQUN4QixpQkFBSyxlQUFlLDBCQUEwQixPQUFPLEtBQUssb0JBQW9CLFFBQVEsQ0FBQztBQUFBLFVBQ3hGO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxXQUFLLDJCQUEyQixRQUFRLEVBQUUsTUFBTSxjQUFjLFdBQVcsS0FBSyxVQUFVLEdBQUcsb0JBQW9CLE9BQU87QUFDdEgsV0FBSyx5QkFBeUI7QUFBQSxJQUMvQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDZCQUE2QixxQkFBK0M7QUFDbkYsVUFBTSxXQUFXLEVBQUUsTUFBTSxLQUFLLGVBQWUsT0FBTyxHQUFHLFdBQVcsS0FBSyxVQUFVO0FBQ2pGLFVBQU0sU0FBUyxLQUFLLGVBQWUsb0NBQW9DLG1CQUFtQjtBQUMxRixTQUFLLDJCQUEyQixRQUFRLFVBQVUsb0JBQW9CLE9BQU87QUFBQSxFQUM5RTtBQUFBLEVBRVEsa0NBQWtDLDBCQUFvRDtBQUM3RixVQUFNLFdBQVcsRUFBRSxNQUFNLEtBQUssZUFBZSxPQUFPLEdBQUcsV0FBVyxLQUFLLFVBQVU7QUFDakYsVUFBTSw4QkFBOEIsS0FBSyxlQUFlLHlCQUF5QixTQUFtQiwwQkFBMEIsS0FBSyxDQUFDO0FBQ3BJLFVBQU0sU0FBUyxLQUFLLGVBQWUseUNBQXlDLHdCQUF3QjtBQUNwRyxVQUFNLDZCQUE2QixLQUFLLFNBQW1CLDBCQUEwQixLQUFLLENBQUM7QUFDM0YsVUFBTSwwQkFBMEIsS0FBSyxzQkFBc0IsMkJBQTJCO0FBQ3RGLFVBQU0sY0FBd0IsQ0FBQztBQUMvQixlQUFXLGNBQWMsT0FBTyxNQUFNO0FBQ3JDLFlBQU0sUUFBUSx3QkFBd0IsVUFBVSxHQUFHO0FBQ25ELFVBQUksU0FBUyxtQkFBbUIsU0FBUyxLQUFLLEdBQUc7QUFDaEQsb0JBQVksS0FBSyxVQUFVO0FBQzNCLFlBQUksZUFBZSw0QkFBNEI7QUFDOUMscUJBQVcsNkJBQTZCLDZCQUE2QjtBQUNwRSxnQkFBSSxDQUFDLDJCQUEyQixTQUFTLHlCQUF5QixHQUFHO0FBQ3BFLDBCQUFZLEtBQUsseUJBQXlCO0FBQUEsWUFDM0M7QUFBQSxVQUNEO0FBQ0EscUJBQVcsNEJBQTRCLDRCQUE0QjtBQUNsRSxnQkFBSSxDQUFDLDRCQUE0QixTQUFTLHdCQUF3QixHQUFHO0FBQ3BFLDBCQUFZLEtBQUssd0JBQXdCO0FBQUEsWUFDMUM7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsV0FDUywyQkFBMkIsU0FBUyxVQUFVLEdBQUc7QUFDekQsb0JBQVksS0FBSyxVQUFVO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBQ0EsV0FBTyxPQUFPO0FBQ2QsUUFBSSxPQUFPLEtBQUssU0FBUywwQkFBMEIsR0FBRztBQUNyRCxXQUFLLGVBQWUsNkJBQTZCLEtBQUssdUJBQXVCLFFBQVEsRUFBRSxTQUFTLDJCQUEyQixDQUFDLENBQUM7QUFBQSxJQUM5SDtBQUNBLFNBQUssMkJBQTJCLFFBQVEsVUFBVSxvQkFBb0IsSUFBSTtBQUFBLEVBQzNFO0FBQUEsRUFFUSxnQ0FBZ0MsbUJBQTZDO0FBQ3BGLFVBQU0sV0FBVyxFQUFFLE1BQU0sS0FBSyxlQUFlLE9BQU8sR0FBRyxXQUFXLEtBQUssVUFBVTtBQUNqRixVQUFNLFNBQVMsS0FBSyxlQUFlLHVDQUF1QyxpQkFBaUI7QUFDM0YsU0FBSywyQkFBMkIsUUFBUSxVQUFVLG9CQUFvQixJQUFJO0FBQUEsRUFDM0U7QUFBQSxFQUVRLGlDQUFpQyxtQkFBNkM7QUFDckYsVUFBTSxXQUFXLEVBQUUsTUFBTSxLQUFLLGVBQWUsT0FBTyxHQUFHLFdBQVcsS0FBSyxVQUFVO0FBQ2pGLFVBQU0sU0FBUyxLQUFLLGVBQWUsd0NBQXdDLGlCQUFpQjtBQUM1RixTQUFLLDJCQUEyQixRQUFRLFVBQVUsb0JBQW9CLElBQUk7QUFBQSxFQUMzRTtBQUFBLEVBRUEsTUFBYyxnQ0FBZ0MsV0FBbUM7QUFDaEYsUUFBSSxLQUFLLGFBQWEsS0FBSyxVQUFVLGVBQWU7QUFDbkQsVUFBSSxhQUFhLG1CQUFtQixLQUFLLHVCQUF1QixXQUFXLEdBQUcsS0FBSyxVQUFVLGVBQWUsS0FBSyxtQkFBbUIsTUFBTTtBQUcxSSxVQUFJLEtBQUssVUFBVSxhQUFhO0FBQy9CLGNBQU0sRUFBRSxPQUFPLFNBQVMsUUFBUSxJQUFJLEtBQUssZUFBZSxLQUFLLFVBQVUsU0FBUyxVQUFVO0FBRzFGLFlBQUksTUFBTSxVQUFVLFFBQVEsVUFBVSxRQUFRLFFBQVE7QUFDckQsdUJBQWEsTUFBTSxLQUFLLHdCQUF3QixVQUFVO0FBQUEsUUFDM0QsT0FFSztBQUNKLHVCQUFhLEtBQUssVUFBVTtBQUFBLFFBQzdCO0FBQUEsTUFDRDtBQUVBLFlBQU0sS0FBSyw2QkFBNkIsWUFBWSxLQUFLLHVCQUF1QixpQkFBaUIsR0FBRyxTQUFTO0FBQUEsSUFDOUc7QUFBQSxFQUNEO0FBQUEsRUFFUSwyQkFBaUM7QUFDeEMsVUFBTSxVQUFvQixDQUFDO0FBRTNCLFVBQU0sZ0JBQWdCLEtBQUssc0JBQXNCLDJCQUEyQjtBQUM1RSxVQUFNLDRCQUFzQyxPQUFPLEtBQUssYUFBYSxFQUFFLE9BQU8sU0FBTyxjQUFjLEdBQUcsRUFBRSxVQUFVLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQ3JKLFVBQU0sZUFBZSxNQUFNLDJCQUEyQixLQUFLLG9CQUFvQixTQUFTLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFDcEgsWUFBUSxLQUFLLEdBQUcsYUFBYSxPQUFPLEdBQUcsYUFBYSxPQUFPO0FBRTNELFVBQU0sZUFBZSxLQUFLLDBCQUEwQixzQkFBc0IsS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQ3BILFVBQU0sbUJBQW1CLE1BQU0sYUFBYSxLQUFLLG9CQUFvQixlQUFlLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBTSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQ3BILFlBQVEsS0FBSyxHQUFHLGlCQUFpQixPQUFPLEdBQUcsaUJBQWlCLE9BQU87QUFFbkUsVUFBTSxZQUFZLEtBQUssdUJBQXVCLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQztBQUN2RyxVQUFNLGlCQUFpQixNQUFNLFdBQVcsS0FBSyxvQkFBb0IsYUFBYSxDQUFDLEdBQUcsQ0FBQyxHQUFHLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQztBQUM5RyxZQUFRLEtBQUssR0FBRyxlQUFlLE9BQU8sR0FBRyxlQUFlLE9BQU87QUFFL0QsVUFBTSxjQUFjLEtBQUsseUJBQXlCLHNCQUFzQixLQUFLLENBQUMsR0FBRyxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFDbEgsVUFBTSxrQkFBa0IsTUFBTSxZQUFZLEtBQUssb0JBQW9CLGNBQWMsQ0FBQyxHQUFHLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFDakgsWUFBUSxLQUFLLEdBQUcsZ0JBQWdCLE9BQU8sR0FBRyxnQkFBZ0IsT0FBTztBQUVqRSxVQUFNLHFCQUFxQixJQUFJLFlBQW1DO0FBQ2xFLGVBQVcsbUJBQW1CLEtBQUssVUFBVSxTQUFTO0FBQ3JELFlBQU0scUJBQXFCLEtBQUssb0JBQW9CLElBQUksZ0JBQWdCLEdBQUc7QUFDM0UsWUFBTSw0QkFBNEIsb0JBQW9CLHNCQUFzQixLQUFLLENBQUMsR0FBRyxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFDdEgsVUFBSSx5QkFBeUIsUUFBUTtBQUNwQywyQkFBbUIsSUFBSSxnQkFBZ0IsS0FBSyx3QkFBd0I7QUFBQSxNQUNyRTtBQUNBLFlBQU0sV0FBVyxLQUFLLG9CQUFvQixpQkFBaUIsSUFBSSxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7QUFDeEYsWUFBTSx1QkFBdUIsTUFBTSwwQkFBMEIsVUFBVSxDQUFDLEdBQUcsTUFBTSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQ25HLGNBQVEsS0FBSyxHQUFHLHFCQUFxQixPQUFPLEdBQUcscUJBQXFCLE9BQU87QUFBQSxJQUM1RTtBQUVBLFVBQU0sWUFBWSxLQUFLLGtCQUFrQixNQUFNLGVBQWUsWUFBWSxLQUFLLHVCQUF1QixzQkFBc0IsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUMsSUFDNUosS0FBSyxVQUFVLFFBQVEsQ0FBQyxJQUFLLG1CQUFtQixJQUFJLEtBQUssVUFBVSxRQUFRLENBQUMsRUFBRSxHQUFHLEtBQUssQ0FBQyxJQUFLLENBQUM7QUFDaEcsVUFBTSxpQkFBaUIsTUFBTSxXQUFXLEtBQUssb0JBQW9CLGFBQWEsQ0FBQyxHQUFHLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFDOUcsWUFBUSxLQUFLLEdBQUcsZUFBZSxPQUFPLEdBQUcsZUFBZSxPQUFPO0FBRS9ELFFBQUksUUFBUSxRQUFRO0FBQ25CLFdBQUssc0JBQXNCO0FBQUEsUUFDMUIsU0FBUztBQUFBLFFBQ1QsYUFBYSxZQUFZLFNBQVMsY0FBYztBQUFBLFFBQ2hELFdBQVcsVUFBVSxTQUFTLFlBQVk7QUFBQSxRQUMxQyxZQUFZLFdBQVcsU0FBUyxhQUFhO0FBQUEsUUFDN0MsV0FBVyxVQUFVLFNBQVMsWUFBWTtBQUFBLFFBQzFDLGlCQUFpQixtQkFBbUIsT0FBTyxxQkFBcUI7QUFBQSxNQUNqRTtBQUNBLFdBQUssK0JBQStCLEtBQUssS0FBSyxrQkFBa0I7QUFBQSxJQUNqRTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsNkJBQTZCLGtCQUFxQyxlQUFtQyxXQUFtQztBQUNySixVQUFNLFdBQVcsRUFBRSxNQUFNLEtBQUssZUFBZSxPQUFPLEdBQUcsV0FBVyxLQUFLLFVBQVU7QUFDakYsVUFBTSxTQUFTLEtBQUssZUFBZSx1Q0FBdUMsYUFBYTtBQUN2RixVQUFNLFVBQVUsS0FBSyxlQUFlLEtBQUssVUFBVSxTQUFTLGdCQUFnQjtBQUM1RSxRQUFJLFFBQVEsTUFBTSxVQUFVLFFBQVEsUUFBUSxVQUFVLFFBQVEsUUFBUSxRQUFRO0FBQzdFLFdBQUssVUFBVSxVQUFVO0FBQ3pCLFlBQU1DLFVBQVMsTUFBTSxLQUFLLGlCQUFpQjtBQUMzQyxZQUFNLEtBQUssaUNBQWlDLFNBQVMsU0FBUztBQUM5RCxXQUFLLDJCQUEyQkEsU0FBUSxVQUFVLG9CQUFvQixnQkFBZ0I7QUFDdEYsV0FBSyw2QkFBNkIsS0FBSyxPQUFPO0FBQUEsSUFDL0MsT0FBTztBQUNOLFdBQUssMkJBQTJCLFFBQVEsVUFBVSxvQkFBb0IsU0FBUztBQUFBLElBQ2hGO0FBQ0EsU0FBSyx5QkFBeUI7QUFBQSxFQUMvQjtBQUFBLEVBRUEsTUFBYyxpQ0FBaUMsU0FBdUMsV0FBbUM7QUFDeEgsVUFBTSxVQUEyQixDQUFDO0FBQ2xDLFNBQUssOEJBQThCLEtBQUs7QUFBQSxNQUN2QyxLQUFLLGtDQUFrQztBQUN0QyxnQkFBUSxLQUFLLGdDQUFnQztBQUFBLE1BQzlDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFDRCxRQUFJO0FBQUUsWUFBTSxTQUFTLFFBQVEsT0FBTztBQUFBLElBQUcsU0FBUyxPQUFPO0FBQUEsSUFBZTtBQUFBLEVBQ3ZFO0FBQUEsRUFFQSxNQUFjLHNDQUFzQyxRQUF5QztBQUM1RixVQUFNLENBQUMsbUJBQW1CLElBQUksTUFBTSxLQUFLLHlCQUF5QixDQUFDLE1BQU0sQ0FBQztBQUMxRSxVQUFNLFdBQVcsRUFBRSxNQUFNLEtBQUssZUFBZSxPQUFPLEdBQUcsV0FBVyxLQUFLLFVBQVU7QUFDakYsVUFBTSw0QkFBNEIsS0FBSyxlQUFlLG9DQUFvQyxPQUFPLEtBQUssbUJBQW1CO0FBQ3pILFFBQUksS0FBSyxrQkFBa0IsTUFBTSxlQUFlLFFBQVE7QUFDdkQsWUFBTSwrQkFBK0IsS0FBSyxlQUFlLHVDQUF1QyxtQkFBbUI7QUFDbkgsV0FBSywyQkFBMkIsYUFBYSwyQkFBMkIsNEJBQTRCLEdBQUcsVUFBVSxvQkFBb0IsU0FBUztBQUFBLElBQy9JLE9BQU87QUFDTixXQUFLLDJCQUEyQiwyQkFBMkIsVUFBVSxvQkFBb0IsZ0JBQWdCO0FBQUEsSUFDMUc7QUFDQSxTQUFLLHlCQUF5QjtBQUFBLEVBQy9CO0FBQUEsRUFFQSxNQUFjLG1CQUFrRDtBQUMvRCxVQUFNLFVBQWtDLENBQUM7QUFHekMsZUFBVyxPQUFPLEtBQUssb0JBQW9CLEtBQUssR0FBRztBQUNsRCxVQUFJLENBQUMsS0FBSyxVQUFVLFFBQVEsT0FBTyxZQUFVLE9BQU8sSUFBSSxTQUFTLE1BQU0sSUFBSSxTQUFTLENBQUMsRUFBRSxDQUFDLEdBQUc7QUFDMUYsYUFBSyxvQkFBb0IsaUJBQWlCLEdBQUc7QUFDN0MsZ0JBQVEsS0FBSyxLQUFLLGVBQWUsb0NBQW9DLEdBQUcsQ0FBQztBQUFBLE1BQzFFO0FBQUEsSUFDRDtBQUVBLFVBQU0sZUFBZSxLQUFLLFVBQVUsUUFBUSxPQUFPLFlBQVUsQ0FBQyxLQUFLLG9CQUFvQixJQUFJLE9BQU8sR0FBRyxDQUFDO0FBQ3RHLFFBQUksYUFBYSxRQUFRO0FBQ3hCLFlBQU0sdUJBQXVCLE1BQU0sS0FBSyx5QkFBeUIsWUFBWTtBQUM3RSwyQkFBcUIsUUFBUSxDQUFDLHFCQUFxQixVQUFVO0FBQzVELGdCQUFRLEtBQUssS0FBSyxlQUFlLG9DQUFvQyxhQUFhLEtBQUssRUFBRSxLQUFLLG1CQUFtQixDQUFDO0FBQUEsTUFDbkgsQ0FBQztBQUFBLElBQ0Y7QUFDQSxXQUFPLGFBQWEsR0FBRyxPQUFPO0FBQUEsRUFDL0I7QUFBQSxFQUVRLHlCQUF5QixTQUE0RDtBQUM1RixXQUFPLFFBQVEsSUFBSSxDQUFDLEdBQUcsUUFBUSxJQUFJLFlBQVU7QUFDNUMsVUFBSSxzQkFBc0IsS0FBSyxvQkFBb0IsSUFBSSxPQUFPLEdBQUc7QUFDakUsVUFBSSxDQUFDLHFCQUFxQjtBQUN6Qiw4QkFBc0IsSUFBSSxvQkFBb0IsQ0FBQyxLQUFLLGFBQWEsUUFBUSwyQkFBMkIsS0FBSyxrQkFBa0IsR0FBRyxLQUFLLG9CQUFvQixLQUFLLGFBQWEsS0FBSyxvQkFBb0IsS0FBSyxZQUFZLEtBQUssa0JBQWtCO0FBQzFPLDRCQUFvQixXQUFXLG9CQUFvQixZQUFZLE1BQU0sS0FBSyxzQ0FBc0MsTUFBTSxDQUFDLENBQUM7QUFDeEgsYUFBSyxvQkFBb0IsSUFBSSxPQUFPLEtBQUssbUJBQW1CO0FBQUEsTUFDN0Q7QUFDQSxhQUFPLG9CQUFvQixrQkFBa0I7QUFBQSxJQUM5QyxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ0o7QUFBQSxFQUVBLE1BQWMsa0NBQWtDLFdBQW1DO0FBQ2xGLFVBQU0sd0JBQXdCLE1BQU0sS0FBSyx3QkFBd0IsS0FBSyxVQUFVLE9BQU87QUFDdkYsVUFBTSxFQUFFLFFBQVEsSUFBSSxLQUFLLGVBQWUsS0FBSyxVQUFVLFNBQVMscUJBQXFCO0FBQ3JGLFFBQUksUUFBUSxRQUFRO0FBQ25CLFlBQU0sS0FBSyw2QkFBNkIsdUJBQXVCLEtBQUssdUJBQXVCLGlCQUFpQixHQUFHLFNBQVM7QUFBQSxJQUN6SDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUEsRUFJQSxNQUFjLHdCQUF3QixrQkFBaUU7QUFDdEcsVUFBTSx3QkFBMkMsQ0FBQztBQUNsRCxlQUFXLG1CQUFtQixrQkFBa0I7QUFDL0MsVUFBSTtBQUNILGNBQU0sU0FBUyxNQUFNLEtBQUssWUFBWSxLQUFLLGdCQUFnQixHQUFHO0FBQzlELFlBQUksQ0FBQyxPQUFPLGFBQWE7QUFDeEI7QUFBQSxRQUNEO0FBQUEsTUFDRCxTQUFTLEdBQUc7QUFDWCxhQUFLLFdBQVcsS0FBSyx3REFBd0QsZ0JBQWdCLElBQUksU0FBUyxDQUFDLE1BQU0sZUFBZSxDQUFDLENBQUMsRUFBRTtBQUFBLE1BQ3JJO0FBQ0EsNEJBQXNCLEtBQUssZUFBZTtBQUFBLElBQzNDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsd0JBQXdCLEtBQWEsT0FBZ0IsUUFBNkIsV0FBc0QsU0FBc0Q7QUFDM00sUUFBSSxDQUFDLEtBQUssc0JBQXNCO0FBQy9CLFlBQU0sSUFBSSxNQUFNLGlHQUFpRztBQUFBLElBQ2xIO0FBRUEsUUFBSSxXQUFXLG9CQUFvQixTQUFTO0FBQzNDLFlBQU0sSUFBSSxNQUFNLDhCQUE4QjtBQUFBLElBQy9DO0FBRUEsUUFBSSxXQUFXLG9CQUFvQixRQUFRO0FBQzFDLFlBQU0sV0FBVyxFQUFFLE1BQU0sS0FBSyxlQUFlLE9BQU8sR0FBRyxXQUFXLEtBQUssVUFBVTtBQUNqRixXQUFLLGVBQWUsWUFBWSxLQUFLLE9BQU8sU0FBUztBQUNyRCxXQUFLLDJCQUEyQixFQUFFLE1BQU0sV0FBVyxxQkFBcUIsU0FBUyxDQUFDLDJCQUEyQixVQUFVLG1CQUFtQixHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsR0FBRyxXQUFXLFdBQVcscUJBQXFCLFNBQVMsVUFBVSxvQkFBb0IsSUFBSSx3QkFBdUIsQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsQ0FBRSxJQUFJLENBQUMsRUFBRSxHQUFHLFVBQVUsTUFBTTtBQUM5VDtBQUFBLElBQ0Q7QUFFQSxVQUFNLDhCQUE4QixLQUFLLDhCQUE4QixRQUFRLEdBQUc7QUFDbEYsUUFBSSxDQUFDLDZCQUE2QjtBQUNqQyxZQUFNLElBQUksTUFBTSw4QkFBOEI7QUFBQSxJQUMvQztBQUVBLFFBQUksZ0NBQWdDLDRCQUE0QixlQUFlLENBQUMsS0FBSyx5QkFBeUI7QUFDN0csWUFBTSxJQUFJLE1BQU0sOEJBQThCO0FBQUEsSUFDL0M7QUFFQSxRQUFJLFdBQVcscUJBQXFCLFVBQVUsVUFBVSxvQkFBb0IsU0FBUyxHQUFHO0FBQ3ZGLFlBQU0scUJBQXFCLEtBQUssb0RBQW9ELDZCQUE2QixVQUFVLFFBQVE7QUFDbkksVUFBSSxvQkFBb0I7QUFDdkIsY0FBTSxzQkFBc0IsVUFBVSxvQkFBb0IsS0FBSztBQUMvRCxjQUFNLG9CQUFvQixtQkFBbUIsVUFBVSxLQUFLLGNBQVksWUFBWSxDQUFDLEdBQUcsU0FBUyxXQUFXLEVBQUUsS0FBSyxHQUFHLG1CQUFtQixDQUFDO0FBQzFJLFlBQUksbUJBQW1CO0FBQ3RCLG9CQUFVLHNCQUFzQixrQkFBa0I7QUFBQSxRQUNuRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsU0FBSyx1QkFBdUIsS0FBSyx3QkFBd0IsS0FBSyxrQ0FBa0MsS0FBSyxvQkFBb0I7QUFDekgsV0FBTyxNQUFNLEtBQUssc0JBQXNCLG1CQUFtQiw2QkFBNkIsRUFBRSxLQUFLLE1BQU0sR0FBRyxFQUFFLFFBQVEsV0FBVyxHQUFHLFFBQVEsQ0FBQztBQUN6SSxZQUFRLDZCQUE2QjtBQUFBLE1BQ3BDLEtBQUssNEJBQTRCO0FBQ2hDLFlBQUksS0FBSyw0QkFBNEIsS0FBSywrQkFBK0IsR0FBRyxHQUFHO0FBQzlFLGdCQUFNLEtBQUssK0JBQStCO0FBQUEsUUFDM0MsT0FBTztBQUNOLGdCQUFNLEtBQUssNkJBQTZCO0FBQUEsUUFDekM7QUFDQTtBQUFBLE1BQ0QsS0FBSyw0QkFBNEI7QUFDaEMsZUFBTyxLQUFLLDhCQUE4QixFQUFFLEtBQUssTUFBTSxNQUFTO0FBQUEsTUFDakUsS0FBSyw0QkFBNEI7QUFDaEMsZUFBTyxLQUFLLDZCQUE2QjtBQUFBLE1BQzFDLEtBQUssNEJBQTRCLGtCQUFrQjtBQUNsRCxjQUFNLGtCQUFrQixhQUFhLFVBQVUsV0FBVyxLQUFLLFVBQVUsVUFBVSxVQUFVLFFBQVEsSUFBSTtBQUN6RyxZQUFJLGlCQUFpQjtBQUNwQixpQkFBTyxLQUFLLG1DQUFtQyxlQUFlO0FBQUEsUUFDL0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsa0NBQWtDLHNCQUE0RTtBQUMzSCxVQUFNLDBCQUEwQixNQUFNLEtBQUssbUJBQW1CLGVBQWUsSUFBSSxnQkFBZ0I7QUFDakcsV0FBTyxxQkFBcUIsZUFBZSxzQkFBc0Isc0JBQXNCO0FBQUEsRUFDeEY7QUFBQSxFQUVRLG9EQUFvRCxRQUFxQyxVQUF1RDtBQUN2SixZQUFRLFFBQVE7QUFBQSxNQUNmLEtBQUssNEJBQTRCO0FBQVksZUFBTyxLQUFLLGVBQWU7QUFBQSxNQUN4RSxLQUFLLDRCQUE0QjtBQUFhLGVBQU8sS0FBSyxlQUFlO0FBQUEsTUFDekUsS0FBSyw0QkFBNEI7QUFBVyxlQUFPLEtBQUssZUFBZTtBQUFBLE1BQ3ZFLEtBQUssNEJBQTRCO0FBQWtCLGVBQU8sV0FBVyxLQUFLLGVBQWUscUJBQXFCLElBQUksUUFBUSxJQUFJO0FBQUEsSUFDL0g7QUFBQSxFQUNEO0FBQUEsRUFFQSxzQkFBc0IsUUFBNkIsVUFBdUQ7QUFDekcsWUFBUSxRQUFRO0FBQUEsTUFDZixLQUFLLG9CQUFvQjtBQUFZLGVBQU8sS0FBSyxlQUFlO0FBQUEsTUFDaEUsS0FBSyxvQkFBb0I7QUFBYSxlQUFPLEtBQUssZUFBZTtBQUFBLE1BQ2pFLEtBQUssb0JBQW9CO0FBQVcsZUFBTyxLQUFLLGVBQWU7QUFBQSxNQUMvRCxLQUFLLG9CQUFvQjtBQUFrQixlQUFPLFdBQVcsS0FBSyxlQUFlLHFCQUFxQixJQUFJLFFBQVEsSUFBSTtBQUFBLE1BQ3RIO0FBQVMsZUFBTztBQUFBLElBQ2pCO0FBQUEsRUFDRDtBQUFBLEVBRVEsMkJBQTJCLEtBQWEsT0FBZ0IsU0FBOEQ7QUFDN0gsUUFBSSxPQUFPLE9BQU8sUUFBUSxLQUFLLEdBQUc7QUFDakMsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFVBQU0saUJBQXdDLENBQUM7QUFDL0MsUUFBSSxRQUFRLHlCQUF5QixRQUFXO0FBQy9DLHFCQUFlLEtBQUssb0JBQW9CLGdCQUFnQjtBQUFBLElBQ3pEO0FBQ0EsUUFBSSxRQUFRLG1CQUFtQixRQUFXO0FBQ3pDLHFCQUFlLEtBQUssb0JBQW9CLFNBQVM7QUFBQSxJQUNsRDtBQUNBLFFBQUksUUFBUSxvQkFBb0IsUUFBVztBQUMxQyxxQkFBZSxLQUFLLG9CQUFvQixXQUFXO0FBQUEsSUFDcEQ7QUFDQSxRQUFJLFFBQVEsbUJBQW1CLFFBQVc7QUFDekMscUJBQWUsS0FBSyxvQkFBb0IsVUFBVTtBQUFBLElBQ25EO0FBQ0EsUUFBSSxRQUFRLHFCQUFxQixRQUFXO0FBQzNDLHFCQUFlLEtBQUssb0JBQW9CLFdBQVc7QUFBQSxJQUNwRDtBQUVBLFFBQUksVUFBVSxRQUFXO0FBRXhCLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxDQUFDLGVBQWUsQ0FBQyxLQUFLLG9CQUFvQixJQUFJO0FBQUEsRUFDdEQ7QUFBQSxFQUVRLDJCQUEyQixRQUE4QixVQUEyRSxRQUFtQztBQUM5SyxRQUFJLE9BQU8sS0FBSyxRQUFRO0FBQ3ZCLFVBQUksV0FBVyxvQkFBb0IsU0FBUztBQUMzQyxhQUFLLFdBQVcsTUFBTSxpQ0FBaUMsNEJBQTRCLE1BQU0sQ0FBQyxXQUFXLEdBQUcsT0FBTyxJQUFJO0FBQUEsTUFDcEg7QUFDQSxZQUFNLDJCQUEyQixJQUFJLHlCQUF5QixRQUFRLFVBQVUsS0FBSyxnQkFBZ0IsS0FBSyxXQUFXLEtBQUssVUFBVTtBQUNwSSwrQkFBeUIsU0FBUztBQUNsQyxXQUFLLDBCQUEwQixLQUFLLHdCQUF3QjtBQUFBLElBQzdEO0FBQUEsRUFDRDtBQUFBLEVBRVEsOEJBQThCLFFBQTZCLEtBQWlEO0FBQ25ILFFBQUksV0FBVyxvQkFBb0IsYUFBYTtBQUMvQyxhQUFPLDRCQUE0QjtBQUFBLElBQ3BDO0FBQ0EsUUFBSSxXQUFXLG9CQUFvQixNQUFNO0FBQ3hDLFVBQUksS0FBSyx5QkFBeUI7QUFDakMsY0FBTSxRQUFRLEtBQUssc0JBQXNCLDJCQUEyQixFQUFFLEdBQUcsR0FBRztBQUM1RSxZQUFJLFVBQVUsbUJBQW1CLFdBQVcsVUFBVSxtQkFBbUIsdUJBQXVCLFVBQVUsbUJBQW1CLHFCQUFxQjtBQUNqSixpQkFBTyw0QkFBNEI7QUFBQSxRQUNwQztBQUNBLFlBQUksS0FBSyxRQUFRLEdBQUcsRUFBRSxvQkFBb0IsUUFBVztBQUNwRCxpQkFBTyw0QkFBNEI7QUFBQSxRQUNwQztBQUFBLE1BQ0Q7QUFDQSxhQUFPLDRCQUE0QjtBQUFBLElBQ3BDO0FBQ0EsUUFBSSxXQUFXLG9CQUFvQixZQUFZO0FBQzlDLGFBQU8sNEJBQTRCO0FBQUEsSUFDcEM7QUFDQSxRQUFJLFdBQVcsb0JBQW9CLGFBQWE7QUFDL0MsYUFBTyw0QkFBNEI7QUFBQSxJQUNwQztBQUNBLFFBQUksV0FBVyxvQkFBb0IsV0FBVztBQUM3QyxhQUFPLDRCQUE0QjtBQUFBLElBQ3BDO0FBQ0EsUUFBSSxXQUFXLG9CQUFvQixrQkFBa0I7QUFDcEQsYUFBTyw0QkFBNEI7QUFBQSxJQUNwQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFQSxJQUFNLDJDQUFOLGNBQXVELFdBQTZDO0FBQUEsRUFDbkcsWUFDNEMseUJBQ0ksb0JBQ0ksaUNBQ2hDLGtCQUNBLGtCQUNsQjtBQUNELFVBQU07QUFOcUM7QUFDSTtBQUNJO0FBTW5ELHFCQUFpQixrQ0FBa0MsRUFBRSxLQUFLLE1BQU07QUFDL0QsV0FBSyw2QkFBNkI7QUFFbEMsWUFBTUMseUJBQXdCLFNBQVMsR0FBMkIsV0FBVyxhQUFhO0FBQzFGLFlBQU0sVUFBVSxLQUFLLFVBQVUsSUFBSSxRQUFjLEVBQUUsQ0FBQztBQUNwRCxXQUFLLFVBQVUsTUFBTSxJQUFJQSx1QkFBc0IsMEJBQTBCQSx1QkFBc0IsbUJBQW1CLGdDQUFnQyxnQkFBZ0IsRUFBRSxNQUNuSyxRQUFRO0FBQUEsUUFBUSxNQUFNLEtBQUssNkJBQTZCO0FBQUEsUUFBRyxpQkFBaUIsVUFBVSxlQUFlLGFBQWEsU0FBWTtBQUFBO0FBQUEsTUFBdUMsQ0FBQyxDQUFDO0FBQUEsSUFDekssQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLCtCQUFxQztBQUc1QyxlQUFXLE9BQU8sT0FBTyxLQUFLLFlBQVksVUFBVSxHQUFHO0FBQ3RELFlBQU0sT0FBTyxZQUFZLFdBQVcsR0FBRztBQUN2QyxVQUFJLEtBQUssOEJBQThCLEtBQUssdUJBQXVCLEtBQUssNEJBQTRCO0FBQ25HLGFBQUsscUJBQXFCLGtCQUFrQixFQUFFLE9BQU8sZ0JBQWdCLEtBQUssMEJBQTBCLEVBQUUsQ0FBQztBQUFBLE1BQ3hHO0FBQUEsSUFDRDtBQUVBLFVBQU0sb0JBQWlDO0FBQUEsTUFDdEMsWUFBWSxZQUFZO0FBQUEsTUFDeEIsbUJBQW1CLFlBQVk7QUFBQSxNQUMvQixzQkFBc0I7QUFBQSxNQUN0QixxQkFBcUI7QUFBQSxNQUNyQixlQUFlO0FBQUEsSUFDaEI7QUFFQSxVQUFNLHFCQUFrQyxLQUFLLG1CQUFtQixrQkFDL0Q7QUFBQSxNQUNDLFlBQVksT0FBTztBQUFBLFFBQU8sQ0FBQztBQUFBLFFBQzFCLG9CQUFvQjtBQUFBLFFBQ3BCLGVBQWU7QUFBQSxRQUNmLGlCQUFpQjtBQUFBLE1BQ2xCO0FBQUEsTUFDQSxtQkFBbUIsWUFBWTtBQUFBLE1BQy9CLHNCQUFzQjtBQUFBLE1BQ3RCLHFCQUFxQjtBQUFBLE1BQ3JCLGVBQWU7QUFBQSxJQUNoQixJQUNFO0FBRUgsVUFBTSx3QkFBcUM7QUFBQSxNQUMxQyxZQUFZLE9BQU87QUFBQSxRQUFPLENBQUM7QUFBQSxRQUMxQixnQkFBZ0I7QUFBQSxRQUNoQiwyQkFBMkI7QUFBQSxRQUMzQixlQUFlO0FBQUEsUUFDZixpQkFBaUI7QUFBQSxNQUNsQjtBQUFBLE1BQ0EsbUJBQW1CLFlBQVk7QUFBQSxNQUMvQixzQkFBc0I7QUFBQSxNQUN0QixxQkFBcUI7QUFBQSxNQUNyQixlQUFlO0FBQUEsSUFDaEI7QUFFQSxVQUFNLHdCQUFxQztBQUFBLE1BQzFDLFlBQVksT0FBTztBQUFBLFFBQU8sQ0FBQztBQUFBLFFBQzFCLDJCQUEyQjtBQUFBLFFBQzNCLGdCQUFnQjtBQUFBLFFBQ2hCLDJCQUEyQjtBQUFBLFFBQzNCLGVBQWU7QUFBQSxRQUNmLGlCQUFpQjtBQUFBLE1BQ2xCO0FBQUEsTUFDQSxtQkFBbUIsWUFBWTtBQUFBLE1BQy9CLHNCQUFzQjtBQUFBLE1BQ3RCLHFCQUFxQjtBQUFBLE1BQ3JCLGVBQWU7QUFBQSxJQUNoQjtBQUVBLFVBQU0sMEJBQXVDO0FBQUEsTUFDNUMsWUFBWSxPQUFPO0FBQUEsUUFBTyxDQUFDO0FBQUEsUUFDMUIsS0FBSyx1Q0FBdUMsMkJBQTJCLFVBQVU7QUFBQSxRQUNqRixLQUFLLHVDQUF1QyxlQUFlLFVBQVU7QUFBQSxRQUNyRSxLQUFLLHVDQUF1QyxpQkFBaUIsVUFBVTtBQUFBLE1BQ3hFO0FBQUEsTUFDQSxtQkFBbUIsWUFBWTtBQUFBLE1BQy9CLHNCQUFzQjtBQUFBLE1BQ3RCLHFCQUFxQjtBQUFBLE1BQ3JCLGVBQWU7QUFBQSxJQUNoQjtBQUVBLFVBQU0sd0JBQXdCO0FBQUEsTUFDN0IsWUFBWSxPQUFPLEtBQUssWUFBWSxVQUFVLEVBQUUsT0FBdUIsQ0FBQyxRQUFRLFFBQVE7QUFDdkYsZUFBTyxHQUFHLElBQUksT0FBTyxPQUFPLEVBQUUsb0JBQW9CLE9BQVUsR0FBRyxZQUFZLFdBQVcsR0FBRyxDQUFDO0FBQzFGLGVBQU87QUFBQSxNQUNSLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDTCxtQkFBbUIsT0FBTyxLQUFLLFlBQVksaUJBQWlCLEVBQUUsT0FBdUIsQ0FBQyxRQUFRLFFBQVE7QUFDckcsZUFBTyxHQUFHLElBQUksT0FBTyxPQUFPLEVBQUUsb0JBQW9CLE9BQVUsR0FBRyxZQUFZLGtCQUFrQixHQUFHLENBQUM7QUFDakcsZUFBTztBQUFBLE1BQ1IsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNMLHNCQUFzQjtBQUFBLE1BQ3RCLHFCQUFxQjtBQUFBLE1BQ3JCLGVBQWU7QUFBQSxJQUNoQjtBQUVBLFVBQU0sdUJBQW9DLGVBQWUsY0FBYyxLQUFLLHdCQUF3QixrQkFBa0IsSUFDckg7QUFBQSxNQUNDLFlBQVksT0FBTztBQUFBLFFBQU8sQ0FBQztBQUFBLFFBQzFCLEtBQUssdUNBQXVDLDJCQUEyQixVQUFVO0FBQUEsUUFDakYsS0FBSyx1Q0FBdUMsaUJBQWlCLFVBQVU7QUFBQSxNQUN4RTtBQUFBLE1BQ0EsbUJBQW1CLFlBQVk7QUFBQSxNQUMvQixzQkFBc0I7QUFBQSxNQUN0QixxQkFBcUI7QUFBQSxNQUNyQixlQUFlO0FBQUEsSUFDaEIsSUFBSTtBQUVMLFVBQU0sdUJBQW9DO0FBQUEsTUFDekMsTUFBTTtBQUFBLE1BQ04sYUFBYSxTQUFTLHFDQUFxQyx3Q0FBd0M7QUFBQSxNQUNuRyxZQUFZLE9BQU87QUFBQSxRQUFPLENBQUM7QUFBQSxRQUMxQixLQUFLLG1DQUFtQywyQkFBMkIsVUFBVTtBQUFBLFFBQzdFLEtBQUssbUNBQW1DLGVBQWUsVUFBVTtBQUFBLFFBQ2pFLEtBQUssbUNBQW1DLGlCQUFpQixVQUFVO0FBQUEsTUFDcEU7QUFBQSxNQUNBLG1CQUFtQjtBQUFBLFFBQ2xCLENBQUMseUJBQXlCLEdBQUc7QUFBQSxVQUM1QixNQUFNO0FBQUEsVUFDTixTQUFTLENBQUM7QUFBQSxVQUNWLE1BQU07QUFBQSxRQUNQO0FBQUEsTUFDRDtBQUFBLE1BQ0Esc0JBQXNCO0FBQUEsSUFDdkI7QUFDQSxTQUFLLGdCQUFnQjtBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsZ0JBQWdCLFNBUWY7QUFDUixVQUFNLGVBQWUsU0FBUyxHQUE4QixlQUFlLGdCQUFnQjtBQUMzRixpQkFBYSxlQUFlLHlCQUF5QixRQUFRLHFCQUFxQjtBQUNsRixpQkFBYSxlQUFlLHNCQUFzQixRQUFRLGtCQUFrQjtBQUM1RSxpQkFBYSxlQUFlLHlCQUF5QixRQUFRLHFCQUFxQjtBQUNsRixpQkFBYSxlQUFlLHlCQUF5QixRQUFRLHFCQUFxQjtBQUNsRixpQkFBYSxlQUFlLDJCQUEyQixRQUFRLHVCQUF1QjtBQUN0RixpQkFBYSxlQUFlLHdCQUF3QixRQUFRLG9CQUFvQjtBQUNoRixpQkFBYSxlQUFlLCtCQUErQixRQUFRLG9CQUFvQjtBQUFBLEVBQ3hGO0FBQUEsRUFFUSx1Q0FBdUMsWUFBOEc7QUFDNUosUUFBSSxLQUFLLGdDQUFnQyxtQkFBbUIsR0FBRztBQUM5RCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sU0FBMEQsQ0FBQztBQUNqRSxXQUFPLFFBQVEsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDLEtBQUssS0FBSyxNQUFNO0FBQ3BELFVBQUksQ0FBQyxNQUFNLFlBQVk7QUFDdEIsZUFBTyxHQUFHLElBQUk7QUFBQSxNQUNmO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLG1DQUFtQyxZQUE4RztBQUN4SixVQUFNLFNBQTBELENBQUM7QUFDakUsV0FBTyxRQUFRLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQyxLQUFLLEtBQUssTUFBTTtBQUNwRCxVQUFJLENBQUMsTUFBTSw4QkFBOEI7QUFDeEMsZUFBTyxHQUFHLElBQUk7QUFBQSxNQUNmO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQTNMTSwyQ0FBTjtBQUFBLEVBRUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FORztBQTZMTixJQUFNLDRDQUFOLGNBQXdELFdBQTZDO0FBQUEsRUFTcEcsWUFDK0MsNEJBQ1Ysa0JBQ0ksc0JBQ08sb0JBQ2pCLFlBQzdCO0FBQ0QsVUFBTTtBQU53QztBQUNWO0FBQ0k7QUFDTztBQUNqQjtBQVYvQixTQUFpQixnQ0FBZ0Msb0JBQUksSUFBWTtBQUNqRSxTQUFpQiwyQkFBMkIsb0JBQUksSUFBWTtBQUM1RCxTQUFpQix3QkFBd0IsU0FBUyxHQUEyQixXQUFXLGFBQWE7QUFDckcsU0FBaUIsWUFBWSxLQUFLLFVBQVUsSUFBSSxVQUFVLENBQUM7QUFXMUQsU0FBSyxVQUFVLE1BQU0sTUFBTSxLQUFLLGVBQWUsQ0FBQztBQUNoRCxTQUFLLFVBQVUsMkJBQTJCLHdCQUF3QixNQUFNLEtBQUssVUFBVSxNQUFNLE1BQU0sS0FBSyw0QkFBNEIsS0FBSywwQkFBMEIsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUcxSyxTQUFLLFVBQVUsS0FBSyxzQkFBc0IseUJBQXlCLENBQUMsRUFBRSxXQUFXLE1BQU0sS0FBSyw0QkFBNEIsWUFBWSxLQUFLLENBQUMsQ0FBQztBQUFBLEVBQzVJO0FBQUEsRUFFQSxNQUFjLGlCQUFnQztBQUM3QyxTQUFLLFdBQVcsTUFBTSw0Q0FBNEM7QUFDbEUsUUFBSTtBQUVILFlBQU0sS0FBSyw0QkFBNEIsT0FBTyxLQUFLLEtBQUssc0JBQXNCLDJCQUEyQixDQUFDLEdBQUcsS0FBSztBQUFBLElBQ25ILFVBQUU7QUFJRCxZQUFNLEtBQUssaUJBQWlCLGtDQUFrQztBQUM5RCxXQUFLLFdBQVcsTUFBTSw2REFBNkQ7QUFDbkYsV0FBSyxxQkFBcUIsb0JBQW9CLG9CQUFvQixPQUFPO0FBQUEsSUFDMUU7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLDRCQUE0QixZQUE4QixhQUFxQztBQUM1RyxVQUFNLFlBQXdDLENBQUM7QUFDL0MsVUFBTSxnQkFBZ0IsS0FBSyxzQkFBc0IsMkJBQTJCO0FBQzVFLFVBQU0scURBQXFELEtBQUssc0JBQXNCLG1DQUFtQyxFQUFFLE9BQU8sbUJBQWlCLGNBQWMseUJBQXlCO0FBQzFMLGVBQVcsWUFBWSxZQUFZO0FBQ2xDLFlBQU0sU0FBUyxjQUFjLFFBQVE7QUFDckMsVUFBSSxDQUFDLFFBQVEsWUFBWTtBQUN4QjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLHFCQUE2RCxPQUFPLHNCQUFzQixFQUFFLE9BQU8sOEJBQThCLE9BQU8sT0FBTyxxQkFBcUI7QUFDMUssVUFBSSxzQkFBc0IsbURBQW1ELEtBQUssbUJBQWlCLG1DQUFtQyxjQUFjLFFBQVEsa0JBQWtCLEtBQUssY0FBYyxZQUFZLFFBQVEsTUFBTSxNQUFTLEdBQUc7QUFDdE87QUFBQSxNQUNEO0FBQ0EsVUFBSSxDQUFDLGVBQWUsS0FBSyw4QkFBOEIsSUFBSSxRQUFRLEdBQUc7QUFDckU7QUFBQSxNQUNEO0FBQ0EsV0FBSyw4QkFBOEIsSUFBSSxRQUFRO0FBQy9DLFVBQUksT0FBTyxXQUFXLFNBQVMsUUFBUTtBQUN0QyxhQUFLLHlCQUF5QixJQUFJLFFBQVE7QUFBQSxNQUMzQztBQUNBLFVBQUk7QUFDSCxjQUFNLFFBQVEsTUFBTSxLQUFLLDJCQUEyQixhQUFhLE9BQU8sV0FBVyxRQUFRLFVBQVUsUUFBUSxFQUFFO0FBQy9HLFlBQUksS0FBSyxlQUFlLE9BQU8sTUFBTSxHQUFHO0FBQ3ZDLG9CQUFVLFFBQVEsSUFBSTtBQUFBLFFBQ3ZCO0FBQUEsTUFDRCxTQUFTLE9BQU87QUFBQSxNQUFhO0FBQUEsSUFDOUI7QUFDQSxRQUFJLE9BQU8sS0FBSyxTQUFTLEVBQUUsUUFBUTtBQUNsQyxXQUFLLHNCQUFzQiw4QkFBOEIsQ0FBQyxFQUFFLFdBQVcsUUFBUSxjQUFjLENBQUMsQ0FBQztBQUFBLElBQ2hHO0FBQUEsRUFDRDtBQUFBLEVBRVEsZUFBZSxPQUFnQixRQUErQztBQUNyRixRQUFJLFlBQVksS0FBSyxHQUFHO0FBQ3ZCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLG1CQUFtQixvQkFBb0IsT0FBTyxjQUFjLFlBQVksUUFBVztBQUMzRixhQUFPLENBQUMsT0FBTyxPQUFPLE9BQU8sY0FBYyxPQUFPO0FBQUEsSUFDbkQ7QUFDQSxXQUFPLENBQUMsT0FBTyxPQUFPLE9BQU8sT0FBTztBQUFBLEVBQ3JDO0FBQ0Q7QUFqRk0sMENBRVcsS0FBSztBQUZoQiw0Q0FBTjtBQUFBLEVBVUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FkRztBQW1GTixNQUFNLGlDQUFpQyxTQUFTLEdBQW9DLG9CQUFvQixTQUFTO0FBQ2pILCtCQUErQiw4QkFBOEIsMENBQTBDLGVBQWUsUUFBUTtBQUM5SCwrQkFBK0IsMENBQTBDLElBQUksMkNBQTJDLGVBQWUsWUFBWTtBQUVuSixNQUFNLHdCQUF3QixTQUFTLEdBQTJCLFdBQVcsYUFBYTtBQUMxRixzQkFBc0Isc0JBQXNCO0FBQUEsRUFDM0MsR0FBRztBQUFBLEVBQ0gsWUFBWTtBQUFBLElBQ1gsQ0FBQywwQkFBMEIsR0FBRztBQUFBLE1BQzdCLFFBQVE7QUFBQSxNQUNSLGFBQWEsU0FBUyx1QkFBdUIsb0RBQW9EO0FBQUEsTUFDakcsV0FBVyxDQUFDO0FBQUEsTUFDWixTQUFTLG1CQUFtQjtBQUFBLE1BQzVCLHNCQUFzQjtBQUFBLE1BQ3RCLGFBQWE7QUFBQSxJQUNkO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbInJlbW90ZVVzZXJDb25maWd1cmF0aW9uTW9kZWwiLCAiaW5kZXgiLCAidGFyZ2V0IiwgImNoYW5nZSIsICJjb25maWd1cmF0aW9uUmVnaXN0cnkiXQp9Cg==
