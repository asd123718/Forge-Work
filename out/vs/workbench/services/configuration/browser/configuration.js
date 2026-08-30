import { Event, Emitter } from "../../../../base/common/event.js";
import * as errors from "../../../../base/common/errors.js";
import { Disposable, dispose, toDisposable, MutableDisposable, combinedDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { FileChangeType, whenProviderRegistered, FileOperationResult, FileOperation } from "../../../../platform/files/common/files.js";
import { ConfigurationModel, ConfigurationModelParser, UserSettings } from "../../../../platform/configuration/common/configurationModels.js";
import { WorkspaceConfigurationModelParser, StandaloneConfigurationModelParser } from "../common/configurationModels.js";
import { TASKS_CONFIGURATION_KEY, FOLDER_SETTINGS_NAME, LAUNCH_CONFIGURATION_KEY, REMOTE_MACHINE_SCOPES, FOLDER_SCOPES, WORKSPACE_SCOPES, APPLY_ALL_PROFILES_SETTING, APPLICATION_SCOPES, MCP_CONFIGURATION_KEY } from "../common/configuration.js";
import { WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { Extensions, OVERRIDE_PROPERTY_REGEX } from "../../../../platform/configuration/common/configurationRegistry.js";
import { equals } from "../../../../base/common/objects.js";
import { hash } from "../../../../base/common/hash.js";
import { joinPath } from "../../../../base/common/resources.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { isEmptyObject, isObject } from "../../../../base/common/types.js";
import { DefaultConfiguration as BaseDefaultConfiguration } from "../../../../platform/configuration/common/configurations.js";
const _DefaultConfiguration = class _DefaultConfiguration extends BaseDefaultConfiguration {
  constructor(cacheScope, configurationCache, environmentService, logService) {
    super(logService);
    this.configurationCache = configurationCache;
    this.configurationRegistry = Registry.as(Extensions.Configuration);
    this.cachedConfigurationDefaultsOverrides = {};
    this.cacheKey = { type: "defaults", key: `${cacheScope}-configurationDefaultsOverrides` };
    if (environmentService.options?.configurationDefaults) {
      this.configurationRegistry.registerDefaultConfigurations([{ overrides: environmentService.options.configurationDefaults }]);
    }
  }
  getConfigurationDefaultOverrides() {
    return this.cachedConfigurationDefaultsOverrides;
  }
  async initialize() {
    await this.initializeCachedConfigurationDefaultsOverrides();
    return super.initialize();
  }
  reload() {
    this.cachedConfigurationDefaultsOverrides = {};
    this.updateCachedConfigurationDefaultsOverrides();
    return super.reload();
  }
  hasCachedConfigurationDefaultsOverrides() {
    return !isEmptyObject(this.cachedConfigurationDefaultsOverrides);
  }
  initializeCachedConfigurationDefaultsOverrides() {
    if (!this.initiaizeCachedConfigurationDefaultsOverridesPromise) {
      this.initiaizeCachedConfigurationDefaultsOverridesPromise = (async () => {
        try {
          if (localStorage.getItem(_DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY)) {
            const content = await this.configurationCache.read(this.cacheKey);
            if (content) {
              this.cachedConfigurationDefaultsOverrides = JSON.parse(content);
            }
          }
        } catch (error) {
        }
        this.cachedConfigurationDefaultsOverrides = isObject(this.cachedConfigurationDefaultsOverrides) ? this.cachedConfigurationDefaultsOverrides : {};
      })();
    }
    return this.initiaizeCachedConfigurationDefaultsOverridesPromise;
  }
  onDidUpdateConfiguration(properties, defaultsOverrides) {
    super.onDidUpdateConfiguration(properties, defaultsOverrides);
    if (defaultsOverrides) {
      this.updateCachedConfigurationDefaultsOverrides();
    }
  }
  async updateCachedConfigurationDefaultsOverrides() {
    const cachedConfigurationDefaultsOverrides = {};
    const defaultConfigurations = this.configurationRegistry.getRegisteredDefaultConfigurations();
    for (const defaultConfiguration of defaultConfigurations) {
      if (defaultConfiguration.donotCache) {
        continue;
      }
      for (const [key, value] of Object.entries(defaultConfiguration.overrides)) {
        if (!OVERRIDE_PROPERTY_REGEX.test(key) && value !== void 0) {
          const existingValue = cachedConfigurationDefaultsOverrides[key];
          if (isObject(existingValue) && isObject(value)) {
            cachedConfigurationDefaultsOverrides[key] = { ...existingValue, ...value };
          } else {
            cachedConfigurationDefaultsOverrides[key] = value;
          }
        }
      }
    }
    try {
      if (Object.keys(cachedConfigurationDefaultsOverrides).length) {
        localStorage.setItem(_DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY, "yes");
        await this.configurationCache.write(this.cacheKey, JSON.stringify(cachedConfigurationDefaultsOverrides));
      } else {
        localStorage.removeItem(_DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY);
        await this.configurationCache.remove(this.cacheKey);
      }
    } catch (error) {
    }
  }
};
_DefaultConfiguration.DEFAULT_OVERRIDES_CACHE_EXISTS_KEY = "DefaultOverridesCacheExists";
let DefaultConfiguration = _DefaultConfiguration;
class ApplicationConfiguration extends UserSettings {
  constructor(userDataProfilesService, fileService, uriIdentityService, logService) {
    super(userDataProfilesService.defaultProfile.settingsResource, { scopes: APPLICATION_SCOPES, skipUnregistered: true }, uriIdentityService.extUri, fileService, logService);
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this._register(this.onDidChange(() => this.reloadConfigurationScheduler.schedule()));
    this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.loadConfiguration().then((configurationModel) => this._onDidChangeConfiguration.fire(configurationModel)), 50));
  }
  async initialize() {
    return this.loadConfiguration();
  }
  async loadConfiguration() {
    const model = await super.loadConfiguration();
    const value = model.getValue(APPLY_ALL_PROFILES_SETTING);
    const allProfilesSettings = Array.isArray(value) ? value : [];
    return this.parseOptions.include || allProfilesSettings.length ? this.reparse({ ...this.parseOptions, include: allProfilesSettings }) : model;
  }
}
class UserConfiguration extends Disposable {
  constructor(settingsResource, tasksResource, mcpResource, configurationParseOptions, fileService, uriIdentityService, logService) {
    super();
    this.settingsResource = settingsResource;
    this.tasksResource = tasksResource;
    this.mcpResource = mcpResource;
    this.configurationParseOptions = configurationParseOptions;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this.userConfiguration = this._register(new MutableDisposable());
    this.userConfigurationChangeDisposable = this._register(new MutableDisposable());
    this.userConfiguration.value = new UserSettings(settingsResource, this.configurationParseOptions, uriIdentityService.extUri, this.fileService, logService);
    this.userConfigurationChangeDisposable.value = this.userConfiguration.value.onDidChange(() => this.reloadConfigurationScheduler.schedule());
    this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.userConfiguration.value.loadConfiguration().then((configurationModel) => this._onDidChangeConfiguration.fire(configurationModel)), 50));
  }
  get hasTasksLoaded() {
    return this.userConfiguration.value instanceof FileServiceBasedConfiguration;
  }
  async reset(settingsResource, tasksResource, mcpResource, configurationParseOptions) {
    this.settingsResource = settingsResource;
    this.tasksResource = tasksResource;
    this.mcpResource = mcpResource;
    this.configurationParseOptions = configurationParseOptions;
    return this.doReset();
  }
  async doReset(settingsConfiguration) {
    const folder = this.uriIdentityService.extUri.dirname(this.settingsResource);
    const standAloneConfigurationResources = [];
    if (this.tasksResource) {
      standAloneConfigurationResources.push([TASKS_CONFIGURATION_KEY, this.tasksResource]);
    }
    if (this.mcpResource) {
      standAloneConfigurationResources.push([MCP_CONFIGURATION_KEY, this.mcpResource]);
    }
    const fileServiceBasedConfiguration = new FileServiceBasedConfiguration(folder.toString(), this.settingsResource, standAloneConfigurationResources, this.configurationParseOptions, this.fileService, this.uriIdentityService, this.logService);
    const configurationModel = await fileServiceBasedConfiguration.loadConfiguration(settingsConfiguration);
    this.userConfiguration.value = fileServiceBasedConfiguration;
    if (this.userConfigurationChangeDisposable.value) {
      this.userConfigurationChangeDisposable.value = this.userConfiguration.value.onDidChange(() => this.reloadConfigurationScheduler.schedule());
    }
    return configurationModel;
  }
  async initialize() {
    return this.userConfiguration.value.loadConfiguration();
  }
  async reload(settingsConfiguration) {
    if (this.hasTasksLoaded) {
      return this.userConfiguration.value.loadConfiguration();
    }
    return this.doReset(settingsConfiguration);
  }
  reparse(parseOptions) {
    this.configurationParseOptions = { ...this.configurationParseOptions, ...parseOptions };
    return this.userConfiguration.value.reparse(this.configurationParseOptions);
  }
  getRestrictedSettings() {
    return this.userConfiguration.value.getRestrictedSettings();
  }
}
class FileServiceBasedConfiguration extends Disposable {
  constructor(name, settingsResource, standAloneConfigurationResources, configurationParseOptions, fileService, uriIdentityService, logService) {
    super();
    this.settingsResource = settingsResource;
    this.standAloneConfigurationResources = standAloneConfigurationResources;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.allResources = [this.settingsResource, ...this.standAloneConfigurationResources.map(([, resource]) => resource)];
    this._register(combinedDisposable(...this.allResources.map((resource) => combinedDisposable(
      this.fileService.watch(uriIdentityService.extUri.dirname(resource)),
      // Also listen to the resource incase the resource is a symlink - https://github.com/microsoft/vscode/issues/118134
      this.fileService.watch(resource)
    ))));
    this._folderSettingsModelParser = new ConfigurationModelParser(name, logService);
    this._folderSettingsParseOptions = configurationParseOptions;
    this._standAloneConfigurations = [];
    this._cache = ConfigurationModel.createEmptyModel(this.logService);
    this._register(Event.debounce(
      Event.any(
        Event.filter(this.fileService.onDidFilesChange, (e) => this.handleFileChangesEvent(e)),
        Event.filter(this.fileService.onDidRunOperation, (e) => this.handleFileOperationEvent(e))
      ),
      () => void 0,
      100
    )(() => this._onDidChange.fire()));
  }
  async resolveContents(donotResolveSettings) {
    const resolveContents = async (resources) => {
      return Promise.all(resources.map(async (resource) => {
        try {
          const content = await this.fileService.readFile(resource, { atomic: true });
          return content.value.toString();
        } catch (error) {
          this.logService.trace(`Error while resolving configuration file '${resource.toString()}': ${errors.getErrorMessage(error)}`);
          if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND && error.fileOperationResult !== FileOperationResult.FILE_NOT_DIRECTORY) {
            this.logService.error(error);
          }
        }
        return "{}";
      }));
    };
    const [[settingsContent], standAloneConfigurationContents] = await Promise.all([
      donotResolveSettings ? Promise.resolve([void 0]) : resolveContents([this.settingsResource]),
      resolveContents(this.standAloneConfigurationResources.map(([, resource]) => resource))
    ]);
    return [settingsContent, standAloneConfigurationContents.map((content, index) => [this.standAloneConfigurationResources[index][0], content])];
  }
  async loadConfiguration(settingsConfiguration) {
    const [settingsContent, standAloneConfigurationContents] = await this.resolveContents(!!settingsConfiguration);
    this._standAloneConfigurations = [];
    this._folderSettingsModelParser.parse("", this._folderSettingsParseOptions);
    if (settingsContent !== void 0) {
      this._folderSettingsModelParser.parse(settingsContent, this._folderSettingsParseOptions);
    }
    for (let index = 0; index < standAloneConfigurationContents.length; index++) {
      const contents = standAloneConfigurationContents[index][1];
      if (contents !== void 0) {
        const standAloneConfigurationModelParser = new StandaloneConfigurationModelParser(this.standAloneConfigurationResources[index][1].toString(), this.standAloneConfigurationResources[index][0], this.logService);
        standAloneConfigurationModelParser.parse(contents);
        this._standAloneConfigurations.push(standAloneConfigurationModelParser.configurationModel);
      }
    }
    this.consolidate(settingsConfiguration);
    return this._cache;
  }
  getRestrictedSettings() {
    return this._folderSettingsModelParser.restrictedConfigurations;
  }
  reparse(configurationParseOptions) {
    const oldContents = this._folderSettingsModelParser.configurationModel.contents;
    this._folderSettingsParseOptions = configurationParseOptions;
    this._folderSettingsModelParser.reparse(this._folderSettingsParseOptions);
    if (!equals(oldContents, this._folderSettingsModelParser.configurationModel.contents)) {
      this.consolidate();
    }
    return this._cache;
  }
  consolidate(settingsConfiguration) {
    this._cache = (settingsConfiguration ?? this._folderSettingsModelParser.configurationModel).merge(...this._standAloneConfigurations);
  }
  handleFileChangesEvent(event) {
    if (this.allResources.some((resource) => event.contains(resource))) {
      return true;
    }
    if (this.allResources.some((resource) => event.contains(this.uriIdentityService.extUri.dirname(resource), FileChangeType.DELETED))) {
      return true;
    }
    return false;
  }
  handleFileOperationEvent(event) {
    if ((event.isOperation(FileOperation.CREATE) || event.isOperation(FileOperation.COPY) || event.isOperation(FileOperation.DELETE) || event.isOperation(FileOperation.WRITE)) && this.allResources.some((resource) => this.uriIdentityService.extUri.isEqual(event.resource, resource))) {
      return true;
    }
    if (event.isOperation(FileOperation.DELETE) && this.allResources.some((resource) => this.uriIdentityService.extUri.isEqual(event.resource, this.uriIdentityService.extUri.dirname(resource)))) {
      return true;
    }
    return false;
  }
}
class RemoteUserConfiguration extends Disposable {
  constructor(remoteAuthority, configurationCache, fileService, uriIdentityService, remoteAgentService, logService) {
    super();
    this._userConfigurationInitializationPromise = null;
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this._onDidInitialize = this._register(new Emitter());
    this.onDidInitialize = this._onDidInitialize.event;
    this._fileService = fileService;
    this._userConfiguration = this._cachedConfiguration = new CachedRemoteUserConfiguration(remoteAuthority, configurationCache, { scopes: REMOTE_MACHINE_SCOPES }, logService);
    remoteAgentService.getEnvironment().then(async (environment) => {
      if (environment) {
        const userConfiguration = this._register(new FileServiceBasedRemoteUserConfiguration(environment.settingsPath, { scopes: REMOTE_MACHINE_SCOPES }, this._fileService, uriIdentityService, logService));
        this._register(userConfiguration.onDidChangeConfiguration((configurationModel2) => this.onDidUserConfigurationChange(configurationModel2)));
        this._userConfigurationInitializationPromise = userConfiguration.initialize();
        const configurationModel = await this._userConfigurationInitializationPromise;
        this._userConfiguration.dispose();
        this._userConfiguration = userConfiguration;
        this.onDidUserConfigurationChange(configurationModel);
        this._onDidInitialize.fire(configurationModel);
      }
    });
  }
  async initialize() {
    if (this._userConfiguration instanceof FileServiceBasedRemoteUserConfiguration) {
      return this._userConfiguration.initialize();
    }
    let configurationModel = await this._userConfiguration.initialize();
    if (this._userConfigurationInitializationPromise) {
      configurationModel = await this._userConfigurationInitializationPromise;
      this._userConfigurationInitializationPromise = null;
    }
    return configurationModel;
  }
  reload() {
    return this._userConfiguration.reload();
  }
  reparse() {
    return this._userConfiguration.reparse({ scopes: REMOTE_MACHINE_SCOPES });
  }
  getRestrictedSettings() {
    return this._userConfiguration.getRestrictedSettings();
  }
  onDidUserConfigurationChange(configurationModel) {
    this.updateCache();
    this._onDidChangeConfiguration.fire(configurationModel);
  }
  async updateCache() {
    if (this._userConfiguration instanceof FileServiceBasedRemoteUserConfiguration) {
      let content;
      try {
        content = await this._userConfiguration.resolveContent();
      } catch (error) {
        if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
          return;
        }
      }
      await this._cachedConfiguration.updateConfiguration(content);
    }
  }
}
class FileServiceBasedRemoteUserConfiguration extends Disposable {
  constructor(configurationResource, configurationParseOptions, fileService, uriIdentityService, logService) {
    super();
    this.configurationResource = configurationResource;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this.fileWatcherDisposable = this._register(new MutableDisposable());
    this.directoryWatcherDisposable = this._register(new MutableDisposable());
    this.parser = new ConfigurationModelParser(this.configurationResource.toString(), logService);
    this.parseOptions = configurationParseOptions;
    this._register(fileService.onDidFilesChange((e) => this.handleFileChangesEvent(e)));
    this._register(fileService.onDidRunOperation((e) => this.handleFileOperationEvent(e)));
    this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then((configurationModel) => this._onDidChangeConfiguration.fire(configurationModel)), 50));
    this._register(toDisposable(() => {
      this.stopWatchingResource();
      this.stopWatchingDirectory();
    }));
  }
  watchResource() {
    this.fileWatcherDisposable.value = this.fileService.watch(this.configurationResource);
  }
  stopWatchingResource() {
    this.fileWatcherDisposable.value = void 0;
  }
  watchDirectory() {
    const directory = this.uriIdentityService.extUri.dirname(this.configurationResource);
    this.directoryWatcherDisposable.value = this.fileService.watch(directory);
  }
  stopWatchingDirectory() {
    this.directoryWatcherDisposable.value = void 0;
  }
  async initialize() {
    const exists = await this.fileService.exists(this.configurationResource);
    this.onResourceExists(exists);
    return this.reload();
  }
  async resolveContent() {
    const content = await this.fileService.readFile(this.configurationResource, { atomic: true });
    return content.value.toString();
  }
  async reload() {
    try {
      const content = await this.resolveContent();
      this.parser.parse(content, this.parseOptions);
      return this.parser.configurationModel;
    } catch (e) {
      return ConfigurationModel.createEmptyModel(this.logService);
    }
  }
  reparse(configurationParseOptions) {
    this.parseOptions = configurationParseOptions;
    this.parser.reparse(this.parseOptions);
    return this.parser.configurationModel;
  }
  getRestrictedSettings() {
    return this.parser.restrictedConfigurations;
  }
  handleFileChangesEvent(event) {
    let affectedByChanges = false;
    if (event.contains(this.configurationResource, FileChangeType.ADDED)) {
      affectedByChanges = true;
      this.onResourceExists(true);
    } else if (event.contains(this.configurationResource, FileChangeType.DELETED)) {
      affectedByChanges = true;
      this.onResourceExists(false);
    } else if (event.contains(this.configurationResource, FileChangeType.UPDATED)) {
      affectedByChanges = true;
    }
    if (affectedByChanges) {
      this.reloadConfigurationScheduler.schedule();
    }
  }
  handleFileOperationEvent(event) {
    if ((event.isOperation(FileOperation.CREATE) || event.isOperation(FileOperation.COPY) || event.isOperation(FileOperation.DELETE) || event.isOperation(FileOperation.WRITE)) && this.uriIdentityService.extUri.isEqual(event.resource, this.configurationResource)) {
      this.reloadConfigurationScheduler.schedule();
    }
  }
  onResourceExists(exists) {
    if (exists) {
      this.stopWatchingDirectory();
      this.watchResource();
    } else {
      this.stopWatchingResource();
      this.watchDirectory();
    }
  }
}
class CachedRemoteUserConfiguration extends Disposable {
  constructor(remoteAuthority, configurationCache, configurationParseOptions, logService) {
    super();
    this.configurationCache = configurationCache;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.key = { type: "user", key: remoteAuthority };
    this.parser = new ConfigurationModelParser("CachedRemoteUserConfiguration", logService);
    this.parseOptions = configurationParseOptions;
    this.configurationModel = ConfigurationModel.createEmptyModel(logService);
  }
  getConfigurationModel() {
    return this.configurationModel;
  }
  initialize() {
    return this.reload();
  }
  reparse(configurationParseOptions) {
    this.parseOptions = configurationParseOptions;
    this.parser.reparse(this.parseOptions);
    this.configurationModel = this.parser.configurationModel;
    return this.configurationModel;
  }
  getRestrictedSettings() {
    return this.parser.restrictedConfigurations;
  }
  async reload() {
    try {
      const content = await this.configurationCache.read(this.key);
      const parsed = JSON.parse(content);
      if (parsed.content) {
        this.parser.parse(parsed.content, this.parseOptions);
        this.configurationModel = this.parser.configurationModel;
      }
    } catch (e) {
    }
    return this.configurationModel;
  }
  async updateConfiguration(content) {
    if (content) {
      return this.configurationCache.write(this.key, JSON.stringify({ content }));
    } else {
      return this.configurationCache.remove(this.key);
    }
  }
}
class WorkspaceConfiguration extends Disposable {
  constructor(configurationCache, fileService, uriIdentityService, logService) {
    super();
    this.configurationCache = configurationCache;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this._workspaceConfigurationDisposables = this._register(new DisposableStore());
    this._workspaceIdentifier = null;
    this._isWorkspaceTrusted = false;
    this._onDidUpdateConfiguration = this._register(new Emitter());
    this.onDidUpdateConfiguration = this._onDidUpdateConfiguration.event;
    this._initialized = false;
    this.fileService = fileService;
    this._workspaceConfiguration = this._cachedConfiguration = new CachedWorkspaceConfiguration(configurationCache, logService);
  }
  get initialized() {
    return this._initialized;
  }
  async initialize(workspaceIdentifier, workspaceTrusted) {
    this._workspaceIdentifier = workspaceIdentifier;
    this._isWorkspaceTrusted = workspaceTrusted;
    if (!this._initialized) {
      if (this.configurationCache.needsCaching(this._workspaceIdentifier.configPath)) {
        this._workspaceConfiguration = this._cachedConfiguration;
        this.waitAndInitialize(this._workspaceIdentifier);
      } else {
        this.doInitialize(new FileServiceBasedWorkspaceConfiguration(this.fileService, this.uriIdentityService, this.logService));
      }
    }
    await this.reload();
  }
  async reload() {
    if (this._workspaceIdentifier) {
      await this._workspaceConfiguration.load(this._workspaceIdentifier, { scopes: WORKSPACE_SCOPES, skipRestricted: this.isUntrusted() });
    }
  }
  getFolders() {
    return this._workspaceConfiguration.getFolders();
  }
  setFolders(folders, jsonEditingService) {
    if (this._workspaceIdentifier) {
      return jsonEditingService.write(this._workspaceIdentifier.configPath, [{ path: ["folders"], value: folders }], true).then(() => this.reload());
    }
    return Promise.resolve();
  }
  isTransient() {
    return this._workspaceConfiguration.isTransient();
  }
  getConfiguration() {
    return this._workspaceConfiguration.getWorkspaceSettings();
  }
  updateWorkspaceTrust(trusted) {
    this._isWorkspaceTrusted = trusted;
    return this.reparseWorkspaceSettings();
  }
  reparseWorkspaceSettings(configurationParseOptions) {
    this._workspaceConfiguration.reparseWorkspaceSettings({ scopes: WORKSPACE_SCOPES, skipRestricted: this.isUntrusted(), ...configurationParseOptions });
    return this.getConfiguration();
  }
  getRestrictedSettings() {
    return this._workspaceConfiguration.getRestrictedSettings();
  }
  async waitAndInitialize(workspaceIdentifier) {
    await whenProviderRegistered(workspaceIdentifier.configPath, this.fileService);
    if (!(this._workspaceConfiguration instanceof FileServiceBasedWorkspaceConfiguration)) {
      const fileServiceBasedWorkspaceConfiguration = this._register(new FileServiceBasedWorkspaceConfiguration(this.fileService, this.uriIdentityService, this.logService));
      await fileServiceBasedWorkspaceConfiguration.load(workspaceIdentifier, { scopes: WORKSPACE_SCOPES, skipRestricted: this.isUntrusted() });
      this.doInitialize(fileServiceBasedWorkspaceConfiguration);
      this.onDidWorkspaceConfigurationChange(false, true);
    }
  }
  doInitialize(fileServiceBasedWorkspaceConfiguration) {
    this._workspaceConfigurationDisposables.clear();
    this._workspaceConfiguration = this._workspaceConfigurationDisposables.add(fileServiceBasedWorkspaceConfiguration);
    this._workspaceConfigurationDisposables.add(this._workspaceConfiguration.onDidChange((e) => this.onDidWorkspaceConfigurationChange(true, false)));
    this._initialized = true;
  }
  isUntrusted() {
    return !this._isWorkspaceTrusted;
  }
  async onDidWorkspaceConfigurationChange(reload, fromCache) {
    if (reload) {
      await this.reload();
    }
    this.updateCache();
    this._onDidUpdateConfiguration.fire(fromCache);
  }
  async updateCache() {
    if (this._workspaceIdentifier && this.configurationCache.needsCaching(this._workspaceIdentifier.configPath) && this._workspaceConfiguration instanceof FileServiceBasedWorkspaceConfiguration) {
      const content = await this._workspaceConfiguration.resolveContent(this._workspaceIdentifier);
      await this._cachedConfiguration.updateWorkspace(this._workspaceIdentifier, content);
    }
  }
}
class FileServiceBasedWorkspaceConfiguration extends Disposable {
  constructor(fileService, uriIdentityService, logService) {
    super();
    this.fileService = fileService;
    this.logService = logService;
    this._workspaceIdentifier = null;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser("", logService);
    this.workspaceSettings = ConfigurationModel.createEmptyModel(logService);
    this._register(Event.any(
      Event.filter(this.fileService.onDidFilesChange, (e) => !!this._workspaceIdentifier && e.contains(this._workspaceIdentifier.configPath)),
      Event.filter(this.fileService.onDidRunOperation, (e) => !!this._workspaceIdentifier && (e.isOperation(FileOperation.CREATE) || e.isOperation(FileOperation.COPY) || e.isOperation(FileOperation.DELETE) || e.isOperation(FileOperation.WRITE)) && uriIdentityService.extUri.isEqual(e.resource, this._workspaceIdentifier.configPath))
    )(() => this.reloadConfigurationScheduler.schedule()));
    this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this._onDidChange.fire(), 50));
    this.workspaceConfigWatcher = this._register(this.watchWorkspaceConfigurationFile());
  }
  get workspaceIdentifier() {
    return this._workspaceIdentifier;
  }
  async resolveContent(workspaceIdentifier) {
    const content = await this.fileService.readFile(workspaceIdentifier.configPath, { atomic: true });
    return content.value.toString();
  }
  async load(workspaceIdentifier, configurationParseOptions) {
    if (!this._workspaceIdentifier || this._workspaceIdentifier.id !== workspaceIdentifier.id) {
      this._workspaceIdentifier = workspaceIdentifier;
      this.workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser(this._workspaceIdentifier.id, this.logService);
      dispose(this.workspaceConfigWatcher);
      this.workspaceConfigWatcher = this._register(this.watchWorkspaceConfigurationFile());
    }
    let contents = "";
    try {
      contents = await this.resolveContent(this._workspaceIdentifier);
    } catch (error) {
      const exists = await this.fileService.exists(this._workspaceIdentifier.configPath);
      if (exists) {
        this.logService.error(error);
      }
    }
    this.workspaceConfigurationModelParser.parse(contents, configurationParseOptions);
    this.consolidate();
  }
  getConfigurationModel() {
    return this.workspaceConfigurationModelParser.configurationModel;
  }
  getFolders() {
    return this.workspaceConfigurationModelParser.folders;
  }
  isTransient() {
    return this.workspaceConfigurationModelParser.transient;
  }
  getWorkspaceSettings() {
    return this.workspaceSettings;
  }
  reparseWorkspaceSettings(configurationParseOptions) {
    this.workspaceConfigurationModelParser.reparseWorkspaceSettings(configurationParseOptions);
    this.consolidate();
    return this.getWorkspaceSettings();
  }
  getRestrictedSettings() {
    return this.workspaceConfigurationModelParser.getRestrictedWorkspaceSettings();
  }
  consolidate() {
    this.workspaceSettings = this.workspaceConfigurationModelParser.settingsModel.merge(this.workspaceConfigurationModelParser.launchModel, this.workspaceConfigurationModelParser.tasksModel);
  }
  watchWorkspaceConfigurationFile() {
    return this._workspaceIdentifier ? this.fileService.watch(this._workspaceIdentifier.configPath) : Disposable.None;
  }
}
class CachedWorkspaceConfiguration {
  constructor(configurationCache, logService) {
    this.configurationCache = configurationCache;
    this.logService = logService;
    this.onDidChange = Event.None;
    this.workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser("", logService);
    this.workspaceSettings = ConfigurationModel.createEmptyModel(logService);
  }
  async load(workspaceIdentifier, configurationParseOptions) {
    try {
      const key = this.getKey(workspaceIdentifier);
      const contents = await this.configurationCache.read(key);
      const parsed = JSON.parse(contents);
      if (parsed.content) {
        this.workspaceConfigurationModelParser = new WorkspaceConfigurationModelParser(key.key, this.logService);
        this.workspaceConfigurationModelParser.parse(parsed.content, configurationParseOptions);
        this.consolidate();
      }
    } catch (e) {
    }
  }
  get workspaceIdentifier() {
    return null;
  }
  getConfigurationModel() {
    return this.workspaceConfigurationModelParser.configurationModel;
  }
  getFolders() {
    return this.workspaceConfigurationModelParser.folders;
  }
  isTransient() {
    return this.workspaceConfigurationModelParser.transient;
  }
  getWorkspaceSettings() {
    return this.workspaceSettings;
  }
  reparseWorkspaceSettings(configurationParseOptions) {
    this.workspaceConfigurationModelParser.reparseWorkspaceSettings(configurationParseOptions);
    this.consolidate();
    return this.getWorkspaceSettings();
  }
  getRestrictedSettings() {
    return this.workspaceConfigurationModelParser.getRestrictedWorkspaceSettings();
  }
  consolidate() {
    this.workspaceSettings = this.workspaceConfigurationModelParser.settingsModel.merge(this.workspaceConfigurationModelParser.launchModel, this.workspaceConfigurationModelParser.tasksModel);
  }
  async updateWorkspace(workspaceIdentifier, content) {
    try {
      const key = this.getKey(workspaceIdentifier);
      if (content) {
        await this.configurationCache.write(key, JSON.stringify({ content }));
      } else {
        await this.configurationCache.remove(key);
      }
    } catch (error) {
    }
  }
  getKey(workspaceIdentifier) {
    return {
      type: "workspaces",
      key: workspaceIdentifier.id
    };
  }
}
class CachedFolderConfiguration {
  constructor(folder, configFolderRelativePath, configurationParseOptions, configurationCache, logService) {
    this.configurationCache = configurationCache;
    this.logService = logService;
    this.onDidChange = Event.None;
    this.key = { type: "folder", key: hash(joinPath(folder, configFolderRelativePath).toString()).toString(16) };
    this._folderSettingsModelParser = new ConfigurationModelParser("CachedFolderConfiguration", logService);
    this._folderSettingsParseOptions = configurationParseOptions;
    this._standAloneConfigurations = [];
    this.configurationModel = ConfigurationModel.createEmptyModel(logService);
  }
  async loadConfiguration() {
    try {
      const contents = await this.configurationCache.read(this.key);
      const { content: configurationContents } = JSON.parse(contents.toString());
      if (configurationContents) {
        for (const key of Object.keys(configurationContents)) {
          if (key === FOLDER_SETTINGS_NAME) {
            this._folderSettingsModelParser.parse(configurationContents[key], this._folderSettingsParseOptions);
          } else {
            const standAloneConfigurationModelParser = new StandaloneConfigurationModelParser(key, key, this.logService);
            standAloneConfigurationModelParser.parse(configurationContents[key]);
            this._standAloneConfigurations.push(standAloneConfigurationModelParser.configurationModel);
          }
        }
      }
      this.consolidate();
    } catch (e) {
    }
    return this.configurationModel;
  }
  async updateConfiguration(settingsContent, standAloneConfigurationContents) {
    const content = {};
    if (settingsContent) {
      content[FOLDER_SETTINGS_NAME] = settingsContent;
    }
    standAloneConfigurationContents.forEach(([key, contents]) => {
      if (contents) {
        content[key] = contents;
      }
    });
    if (Object.keys(content).length) {
      await this.configurationCache.write(this.key, JSON.stringify({ content }));
    } else {
      await this.configurationCache.remove(this.key);
    }
  }
  getRestrictedSettings() {
    return this._folderSettingsModelParser.restrictedConfigurations;
  }
  reparse(configurationParseOptions) {
    this._folderSettingsParseOptions = configurationParseOptions;
    this._folderSettingsModelParser.reparse(this._folderSettingsParseOptions);
    this.consolidate();
    return this.configurationModel;
  }
  consolidate() {
    this.configurationModel = this._folderSettingsModelParser.configurationModel.merge(...this._standAloneConfigurations);
  }
  getUnsupportedKeys() {
    return [];
  }
}
class FolderConfiguration extends Disposable {
  constructor(useCache, workspaceFolder, configFolderRelativePath, workbenchState, workspaceTrusted, fileService, uriIdentityService, logService, configurationCache) {
    super();
    this.workspaceFolder = workspaceFolder;
    this.workbenchState = workbenchState;
    this.workspaceTrusted = workspaceTrusted;
    this.configurationCache = configurationCache;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.scopes = WorkbenchState.WORKSPACE === this.workbenchState ? FOLDER_SCOPES : WORKSPACE_SCOPES;
    this.configurationFolder = uriIdentityService.extUri.joinPath(workspaceFolder.uri, configFolderRelativePath);
    this.cachedFolderConfiguration = new CachedFolderConfiguration(workspaceFolder.uri, configFolderRelativePath, { scopes: this.scopes, skipRestricted: this.isUntrusted() }, configurationCache, logService);
    if (useCache && this.configurationCache.needsCaching(workspaceFolder.uri)) {
      this.folderConfiguration = this.cachedFolderConfiguration;
      whenProviderRegistered(workspaceFolder.uri, fileService).then(() => {
        this.folderConfiguration = this._register(this.createFileServiceBasedConfiguration(fileService, uriIdentityService, logService));
        this._register(this.folderConfiguration.onDidChange((e) => this.onDidFolderConfigurationChange()));
        this.onDidFolderConfigurationChange();
      });
    } else {
      this.folderConfiguration = this._register(this.createFileServiceBasedConfiguration(fileService, uriIdentityService, logService));
      this._register(this.folderConfiguration.onDidChange((e) => this.onDidFolderConfigurationChange()));
    }
  }
  loadConfiguration() {
    return this.folderConfiguration.loadConfiguration();
  }
  updateWorkspaceTrust(trusted) {
    this.workspaceTrusted = trusted;
    return this.reparse();
  }
  reparse() {
    const configurationModel = this.folderConfiguration.reparse({ scopes: this.scopes, skipRestricted: this.isUntrusted() });
    this.updateCache();
    return configurationModel;
  }
  getRestrictedSettings() {
    return this.folderConfiguration.getRestrictedSettings();
  }
  isUntrusted() {
    return !this.workspaceTrusted;
  }
  onDidFolderConfigurationChange() {
    this.updateCache();
    this._onDidChange.fire();
  }
  createFileServiceBasedConfiguration(fileService, uriIdentityService, logService) {
    const settingsResource = uriIdentityService.extUri.joinPath(this.configurationFolder, `${FOLDER_SETTINGS_NAME}.json`);
    const standAloneConfigurationResources = [TASKS_CONFIGURATION_KEY, LAUNCH_CONFIGURATION_KEY, MCP_CONFIGURATION_KEY].map((name) => [name, uriIdentityService.extUri.joinPath(this.configurationFolder, `${name}.json`)]);
    return new FileServiceBasedConfiguration(this.configurationFolder.toString(), settingsResource, standAloneConfigurationResources, { scopes: this.scopes, skipRestricted: this.isUntrusted() }, fileService, uriIdentityService, logService);
  }
  async updateCache() {
    if (this.configurationCache.needsCaching(this.configurationFolder) && this.folderConfiguration instanceof FileServiceBasedConfiguration) {
      const [settingsContent, standAloneConfigurationContents] = await this.folderConfiguration.resolveContents();
      this.cachedFolderConfiguration.updateConfiguration(settingsContent, standAloneConfigurationContents);
    }
  }
  addRelated(disposable) {
    this._register(disposable);
  }
}
export {
  ApplicationConfiguration,
  DefaultConfiguration,
  FolderConfiguration,
  RemoteUserConfiguration,
  UserConfiguration,
  WorkspaceConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxjb25maWd1cmF0aW9uXFxicm93c2VyXFxjb25maWd1cmF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0ICogYXMgZXJyb3JzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgZGlzcG9zZSwgdG9EaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgY29tYmluZWREaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VUeXBlLCBGaWxlQ2hhbmdlc0V2ZW50LCBJRmlsZVNlcnZpY2UsIHdoZW5Qcm92aWRlclJlZ2lzdGVyZWQsIEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZU9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbkV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25Nb2RlbCwgQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyLCBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zLCBVc2VyU2V0dGluZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uTW9kZWxzLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZUNvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlciwgU3RhbmRhbG9uZUNvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlciB9IGZyb20gJy4uL2NvbW1vbi9jb25maWd1cmF0aW9uTW9kZWxzLmpzJztcbmltcG9ydCB7IFRBU0tTX0NPTkZJR1VSQVRJT05fS0VZLCBGT0xERVJfU0VUVElOR1NfTkFNRSwgTEFVTkNIX0NPTkZJR1VSQVRJT05fS0VZLCBJQ29uZmlndXJhdGlvbkNhY2hlLCBDb25maWd1cmF0aW9uS2V5LCBSRU1PVEVfTUFDSElORV9TQ09QRVMsIEZPTERFUl9TQ09QRVMsIFdPUktTUEFDRV9TQ09QRVMsIEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HLCBBUFBMSUNBVElPTl9TQ09QRVMsIE1DUF9DT05GSUdVUkFUSU9OX0tFWSB9IGZyb20gJy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yZWRXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFN0YXRlLCBJV29ya3NwYWNlRm9sZGVyLCBJV29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgaXNFbXB0eU9iamVjdCwgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0Q29uZmlndXJhdGlvbiBhcyBCYXNlRGVmYXVsdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSlNPTkVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2pzb25FZGl0aW5nLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgRGVmYXVsdENvbmZpZ3VyYXRpb24gZXh0ZW5kcyBCYXNlRGVmYXVsdENvbmZpZ3VyYXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBERUZBVUxUX09WRVJSSURFU19DQUNIRV9FWElTVFNfS0VZID0gJ0RlZmF1bHRPdmVycmlkZXNDYWNoZUV4aXN0cyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRwcml2YXRlIGNhY2hlZENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlczogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gPSB7fTtcblx0cHJpdmF0ZSByZWFkb25seSBjYWNoZUtleTogQ29uZmlndXJhdGlvbktleTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjYWNoZVNjb3BlOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uQ2FjaGU6IElDb25maWd1cmF0aW9uQ2FjaGUsXG5cdFx0ZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobG9nU2VydmljZSk7XG5cdFx0dGhpcy5jYWNoZUtleSA9IHsgdHlwZTogJ2RlZmF1bHRzJywga2V5OiBgJHtjYWNoZVNjb3BlfS1jb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXNgIH07XG5cdFx0aWYgKGVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy5jb25maWd1cmF0aW9uRGVmYXVsdHMpIHtcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKFt7IG92ZXJyaWRlczogZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnMuY29uZmlndXJhdGlvbkRlZmF1bHRzIGFzIElTdHJpbmdEaWN0aW9uYXJ5PElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+PiB9XSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldENvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzKCk6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHtcblx0XHRyZXR1cm4gdGhpcy5jYWNoZWRDb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXM7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8Q29uZmlndXJhdGlvbk1vZGVsPiB7XG5cdFx0YXdhaXQgdGhpcy5pbml0aWFsaXplQ2FjaGVkQ29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzKCk7XG5cdFx0cmV0dXJuIHN1cGVyLmluaXRpYWxpemUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbG9hZCgpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHRoaXMuY2FjaGVkQ29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzID0ge307XG5cdFx0dGhpcy51cGRhdGVDYWNoZWRDb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMoKTtcblx0XHRyZXR1cm4gc3VwZXIucmVsb2FkKCk7XG5cdH1cblxuXHRoYXNDYWNoZWRDb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICFpc0VtcHR5T2JqZWN0KHRoaXMuY2FjaGVkQ29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzKTtcblx0fVxuXG5cdHByaXZhdGUgaW5pdGlhaXplQ2FjaGVkQ29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBpbml0aWFsaXplQ2FjaGVkQ29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pbml0aWFpemVDYWNoZWRDb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXNQcm9taXNlKSB7XG5cdFx0XHR0aGlzLmluaXRpYWl6ZUNhY2hlZENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlc1Byb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIFJlYWQgb25seSB3aGVuIHRoZSBjYWNoZSBleGlzdHNcblx0XHRcdFx0XHRpZiAobG9jYWxTdG9yYWdlLmdldEl0ZW0oRGVmYXVsdENvbmZpZ3VyYXRpb24uREVGQVVMVF9PVkVSUklERVNfQ0FDSEVfRVhJU1RTX0tFWSkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25DYWNoZS5yZWFkKHRoaXMuY2FjaGVLZXkpO1xuXHRcdFx0XHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5jYWNoZWRDb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHsgLyogaWdub3JlICovIH1cblx0XHRcdFx0dGhpcy5jYWNoZWRDb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMgPSBpc09iamVjdCh0aGlzLmNhY2hlZENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcykgPyB0aGlzLmNhY2hlZENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcyA6IHt9O1xuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuaW5pdGlhaXplQ2FjaGVkQ29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzUHJvbWlzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24ocHJvcGVydGllczogc3RyaW5nW10sIGRlZmF1bHRzT3ZlcnJpZGVzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHN1cGVyLm9uRGlkVXBkYXRlQ29uZmlndXJhdGlvbihwcm9wZXJ0aWVzLCBkZWZhdWx0c092ZXJyaWRlcyk7XG5cdFx0aWYgKGRlZmF1bHRzT3ZlcnJpZGVzKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNhY2hlZENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlQ2FjaGVkQ29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNhY2hlZENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlczogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gPSB7fTtcblx0XHRjb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbnMgPSB0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRSZWdpc3RlcmVkRGVmYXVsdENvbmZpZ3VyYXRpb25zKCk7XG5cdFx0Zm9yIChjb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbiBvZiBkZWZhdWx0Q29uZmlndXJhdGlvbnMpIHtcblx0XHRcdGlmIChkZWZhdWx0Q29uZmlndXJhdGlvbi5kb25vdENhY2hlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZGVmYXVsdENvbmZpZ3VyYXRpb24ub3ZlcnJpZGVzKSkge1xuXHRcdFx0XHRpZiAoIU9WRVJSSURFX1BST1BFUlRZX1JFR0VYLnRlc3Qoa2V5KSAmJiB2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXhpc3RpbmdWYWx1ZSA9IGNhY2hlZENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlc1trZXldO1xuXHRcdFx0XHRcdGlmIChpc09iamVjdChleGlzdGluZ1ZhbHVlKSAmJiBpc09iamVjdCh2YWx1ZSkpIHtcblx0XHRcdFx0XHRcdGNhY2hlZENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlc1trZXldID0geyAuLi5leGlzdGluZ1ZhbHVlLCAuLi52YWx1ZSB9O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjYWNoZWRDb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXNba2V5XSA9IHZhbHVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0aWYgKE9iamVjdC5rZXlzKGNhY2hlZENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcykubGVuZ3RoKSB7XG5cdFx0XHRcdGxvY2FsU3RvcmFnZS5zZXRJdGVtKERlZmF1bHRDb25maWd1cmF0aW9uLkRFRkFVTFRfT1ZFUlJJREVTX0NBQ0hFX0VYSVNUU19LRVksICd5ZXMnKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uQ2FjaGUud3JpdGUodGhpcy5jYWNoZUtleSwgSlNPTi5zdHJpbmdpZnkoY2FjaGVkQ29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShEZWZhdWx0Q29uZmlndXJhdGlvbi5ERUZBVUxUX09WRVJSSURFU19DQUNIRV9FWElTVFNfS0VZKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uQ2FjaGUucmVtb3ZlKHRoaXMuY2FjaGVLZXkpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7LyogSWdub3JlIGVycm9yICovIH1cblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gZXh0ZW5kcyBVc2VyU2V0dGluZ3Mge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbjogRW1pdHRlcjxDb25maWd1cmF0aW9uTW9kZWw+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Q29uZmlndXJhdGlvbk1vZGVsPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uOiBFdmVudDxDb25maWd1cmF0aW9uTW9kZWw+ID0gdGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVsb2FkQ29uZmlndXJhdGlvblNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0dXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlLCB7IHNjb3BlczogQVBQTElDQVRJT05fU0NPUEVTLCBza2lwVW5yZWdpc3RlcmVkOiB0cnVlIH0sIHVyaUlkZW50aXR5U2VydmljZS5leHRVcmksIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMucmVsb2FkQ29uZmlndXJhdGlvblNjaGVkdWxlci5zY2hlZHVsZSgpKSk7XG5cdFx0dGhpcy5yZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5sb2FkQ29uZmlndXJhdGlvbigpLnRoZW4oY29uZmlndXJhdGlvbk1vZGVsID0+IHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5maXJlKGNvbmZpZ3VyYXRpb25Nb2RlbCkpLCA1MCkpO1xuXHR9XG5cblx0YXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD4ge1xuXHRcdHJldHVybiB0aGlzLmxvYWRDb25maWd1cmF0aW9uKCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBsb2FkQ29uZmlndXJhdGlvbigpOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgc3VwZXIubG9hZENvbmZpZ3VyYXRpb24oKTtcblx0XHRjb25zdCB2YWx1ZSA9IG1vZGVsLmdldFZhbHVlPHN0cmluZ1tdPihBUFBMWV9BTExfUFJPRklMRVNfU0VUVElORyk7XG5cdFx0Y29uc3QgYWxsUHJvZmlsZXNTZXR0aW5ncyA9IEFycmF5LmlzQXJyYXkodmFsdWUpID8gdmFsdWUgOiBbXTtcblx0XHRyZXR1cm4gdGhpcy5wYXJzZU9wdGlvbnMuaW5jbHVkZSB8fCBhbGxQcm9maWxlc1NldHRpbmdzLmxlbmd0aFxuXHRcdFx0PyB0aGlzLnJlcGFyc2UoeyAuLi50aGlzLnBhcnNlT3B0aW9ucywgaW5jbHVkZTogYWxsUHJvZmlsZXNTZXR0aW5ncyB9KVxuXHRcdFx0OiBtb2RlbDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVXNlckNvbmZpZ3VyYXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb246IEVtaXR0ZXI8Q29uZmlndXJhdGlvbk1vZGVsPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENvbmZpZ3VyYXRpb25Nb2RlbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbjogRXZlbnQ8Q29uZmlndXJhdGlvbk1vZGVsPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHVzZXJDb25maWd1cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPFVzZXJTZXR0aW5ncyB8IEZpbGVTZXJ2aWNlQmFzZWRDb25maWd1cmF0aW9uPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSB1c2VyQ29uZmlndXJhdGlvbkNoYW5nZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlbG9hZENvbmZpZ3VyYXRpb25TY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0Z2V0IGhhc1Rhc2tzTG9hZGVkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy51c2VyQ29uZmlndXJhdGlvbi52YWx1ZSBpbnN0YW5jZW9mIEZpbGVTZXJ2aWNlQmFzZWRDb25maWd1cmF0aW9uOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBzZXR0aW5nc1Jlc291cmNlOiBVUkksXG5cdFx0cHJpdmF0ZSB0YXNrc1Jlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBtY3BSZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgY29uZmlndXJhdGlvblBhcnNlT3B0aW9uczogQ29uZmlndXJhdGlvblBhcnNlT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnVzZXJDb25maWd1cmF0aW9uLnZhbHVlID0gbmV3IFVzZXJTZXR0aW5ncyhzZXR0aW5nc1Jlc291cmNlLCB0aGlzLmNvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMsIHVyaUlkZW50aXR5U2VydmljZS5leHRVcmksIHRoaXMuZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMudXNlckNvbmZpZ3VyYXRpb25DaGFuZ2VEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy51c2VyQ29uZmlndXJhdGlvbi52YWx1ZS5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLnJlbG9hZENvbmZpZ3VyYXRpb25TY2hlZHVsZXIuc2NoZWR1bGUoKSk7XG5cdFx0dGhpcy5yZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy51c2VyQ29uZmlndXJhdGlvbi52YWx1ZSEubG9hZENvbmZpZ3VyYXRpb24oKS50aGVuKGNvbmZpZ3VyYXRpb25Nb2RlbCA9PiB0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZShjb25maWd1cmF0aW9uTW9kZWwpKSwgNTApKTtcblx0fVxuXG5cdGFzeW5jIHJlc2V0KHNldHRpbmdzUmVzb3VyY2U6IFVSSSwgdGFza3NSZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBtY3BSZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uUGFyc2VPcHRpb25zOiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zKTogUHJvbWlzZTxDb25maWd1cmF0aW9uTW9kZWw+IHtcblx0XHR0aGlzLnNldHRpbmdzUmVzb3VyY2UgPSBzZXR0aW5nc1Jlc291cmNlO1xuXHRcdHRoaXMudGFza3NSZXNvdXJjZSA9IHRhc2tzUmVzb3VyY2U7XG5cdFx0dGhpcy5tY3BSZXNvdXJjZSA9IG1jcFJlc291cmNlO1xuXHRcdHRoaXMuY29uZmlndXJhdGlvblBhcnNlT3B0aW9ucyA9IGNvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnM7XG5cdFx0cmV0dXJuIHRoaXMuZG9SZXNldCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1Jlc2V0KHNldHRpbmdzQ29uZmlndXJhdGlvbj86IENvbmZpZ3VyYXRpb25Nb2RlbCk6IFByb21pc2U8Q29uZmlndXJhdGlvbk1vZGVsPiB7XG5cdFx0Y29uc3QgZm9sZGVyID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmRpcm5hbWUodGhpcy5zZXR0aW5nc1Jlc291cmNlKTtcblx0XHRjb25zdCBzdGFuZEFsb25lQ29uZmlndXJhdGlvblJlc291cmNlczogW3N0cmluZywgVVJJXVtdID0gW107XG5cdFx0aWYgKHRoaXMudGFza3NSZXNvdXJjZSkge1xuXHRcdFx0c3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25SZXNvdXJjZXMucHVzaChbVEFTS1NfQ09ORklHVVJBVElPTl9LRVksIHRoaXMudGFza3NSZXNvdXJjZV0pO1xuXHRcdH1cblx0XHRpZiAodGhpcy5tY3BSZXNvdXJjZSkge1xuXHRcdFx0c3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25SZXNvdXJjZXMucHVzaChbTUNQX0NPTkZJR1VSQVRJT05fS0VZLCB0aGlzLm1jcFJlc291cmNlXSk7XG5cdFx0fVxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlQmFzZWRDb25maWd1cmF0aW9uID0gbmV3IEZpbGVTZXJ2aWNlQmFzZWRDb25maWd1cmF0aW9uKGZvbGRlci50b1N0cmluZygpLCB0aGlzLnNldHRpbmdzUmVzb3VyY2UsIHN0YW5kQWxvbmVDb25maWd1cmF0aW9uUmVzb3VyY2VzLCB0aGlzLmNvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Nb2RlbCA9IGF3YWl0IGZpbGVTZXJ2aWNlQmFzZWRDb25maWd1cmF0aW9uLmxvYWRDb25maWd1cmF0aW9uKHNldHRpbmdzQ29uZmlndXJhdGlvbik7XG5cdFx0dGhpcy51c2VyQ29uZmlndXJhdGlvbi52YWx1ZSA9IGZpbGVTZXJ2aWNlQmFzZWRDb25maWd1cmF0aW9uO1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIHZhbHVlIGJlY2F1c2UgdXNlckNvbmZpZ3VyYXRpb24gbWlnaHQgaGF2ZSBiZWVuIGRpc3Bvc2VkLlxuXHRcdGlmICh0aGlzLnVzZXJDb25maWd1cmF0aW9uQ2hhbmdlRGlzcG9zYWJsZS52YWx1ZSkge1xuXHRcdFx0dGhpcy51c2VyQ29uZmlndXJhdGlvbkNoYW5nZURpc3Bvc2FibGUudmFsdWUgPSB0aGlzLnVzZXJDb25maWd1cmF0aW9uLnZhbHVlLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMucmVsb2FkQ29uZmlndXJhdGlvblNjaGVkdWxlci5zY2hlZHVsZSgpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29uZmlndXJhdGlvbk1vZGVsO1xuXHR9XG5cblx0YXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD4ge1xuXHRcdHJldHVybiB0aGlzLnVzZXJDb25maWd1cmF0aW9uLnZhbHVlIS5sb2FkQ29uZmlndXJhdGlvbigpO1xuXHR9XG5cblx0YXN5bmMgcmVsb2FkKHNldHRpbmdzQ29uZmlndXJhdGlvbj86IENvbmZpZ3VyYXRpb25Nb2RlbCk6IFByb21pc2U8Q29uZmlndXJhdGlvbk1vZGVsPiB7XG5cdFx0aWYgKHRoaXMuaGFzVGFza3NMb2FkZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLnVzZXJDb25maWd1cmF0aW9uLnZhbHVlIS5sb2FkQ29uZmlndXJhdGlvbigpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5kb1Jlc2V0KHNldHRpbmdzQ29uZmlndXJhdGlvbik7XG5cdH1cblxuXHRyZXBhcnNlKHBhcnNlT3B0aW9ucz86IFBhcnRpYWw8Q29uZmlndXJhdGlvblBhcnNlT3B0aW9ucz4pOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHRoaXMuY29uZmlndXJhdGlvblBhcnNlT3B0aW9ucyA9IHsgLi4udGhpcy5jb25maWd1cmF0aW9uUGFyc2VPcHRpb25zLCAuLi5wYXJzZU9wdGlvbnMgfTtcblx0XHRyZXR1cm4gdGhpcy51c2VyQ29uZmlndXJhdGlvbi52YWx1ZSEucmVwYXJzZSh0aGlzLmNvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMpO1xuXHR9XG5cblx0Z2V0UmVzdHJpY3RlZFNldHRpbmdzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy51c2VyQ29uZmlndXJhdGlvbi52YWx1ZSEuZ2V0UmVzdHJpY3RlZFNldHRpbmdzKCk7XG5cdH1cbn1cblxuY2xhc3MgRmlsZVNlcnZpY2VCYXNlZENvbmZpZ3VyYXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFsbFJlc291cmNlczogVVJJW107XG5cdHByaXZhdGUgX2ZvbGRlclNldHRpbmdzTW9kZWxQYXJzZXI6IENvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlcjtcblx0cHJpdmF0ZSBfZm9sZGVyU2V0dGluZ3NQYXJzZU9wdGlvbnM6IENvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnM7XG5cdHByaXZhdGUgX3N0YW5kQWxvbmVDb25maWd1cmF0aW9uczogQ29uZmlndXJhdGlvbk1vZGVsW107XG5cdHByaXZhdGUgX2NhY2hlOiBDb25maWd1cmF0aW9uTW9kZWw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2U6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bmFtZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2V0dGluZ3NSZXNvdXJjZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25SZXNvdXJjZXM6IFtzdHJpbmcsIFVSSV1bXSxcblx0XHRjb25maWd1cmF0aW9uUGFyc2VPcHRpb25zOiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuYWxsUmVzb3VyY2VzID0gW3RoaXMuc2V0dGluZ3NSZXNvdXJjZSwgLi4udGhpcy5zdGFuZEFsb25lQ29uZmlndXJhdGlvblJlc291cmNlcy5tYXAoKFssIHJlc291cmNlXSkgPT4gcmVzb3VyY2UpXTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb21iaW5lZERpc3Bvc2FibGUoLi4udGhpcy5hbGxSZXNvdXJjZXMubWFwKHJlc291cmNlID0+IGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRcdHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2godXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKHJlc291cmNlKSksXG5cdFx0XHQvLyBBbHNvIGxpc3RlbiB0byB0aGUgcmVzb3VyY2UgaW5jYXNlIHRoZSByZXNvdXJjZSBpcyBhIHN5bWxpbmsgLSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4MTM0XG5cdFx0XHR0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKHJlc291cmNlKVxuXHRcdCkpKSk7XG5cblx0XHR0aGlzLl9mb2xkZXJTZXR0aW5nc01vZGVsUGFyc2VyID0gbmV3IENvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlcihuYW1lLCBsb2dTZXJ2aWNlKTtcblx0XHR0aGlzLl9mb2xkZXJTZXR0aW5nc1BhcnNlT3B0aW9ucyA9IGNvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnM7XG5cdFx0dGhpcy5fc3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25zID0gW107XG5cdFx0dGhpcy5fY2FjaGUgPSBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbCh0aGlzLmxvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZGVib3VuY2UoXG5cdFx0XHRFdmVudC5hbnkoXG5cdFx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UsIGUgPT4gdGhpcy5oYW5kbGVGaWxlQ2hhbmdlc0V2ZW50KGUpKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24sIGUgPT4gdGhpcy5oYW5kbGVGaWxlT3BlcmF0aW9uRXZlbnQoZSkpXG5cdFx0XHQpLCAoKSA9PiB1bmRlZmluZWQsIDEwMCkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpKSk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlQ29udGVudHMoZG9ub3RSZXNvbHZlU2V0dGluZ3M/OiBib29sZWFuKTogUHJvbWlzZTxbc3RyaW5nIHwgdW5kZWZpbmVkLCBbc3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWRdW11dPiB7XG5cblx0XHRjb25zdCByZXNvbHZlQ29udGVudHMgPSBhc3luYyAocmVzb3VyY2VzOiBVUklbXSk6IFByb21pc2U8KHN0cmluZyB8IHVuZGVmaW5lZClbXT4gPT4ge1xuXHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKHJlc291cmNlcy5tYXAoYXN5bmMgcmVzb3VyY2UgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlLCB7IGF0b21pYzogdHJ1ZSB9KTtcblx0XHRcdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRXJyb3Igd2hpbGUgcmVzb2x2aW5nIGNvbmZpZ3VyYXRpb24gZmlsZSAnJHtyZXNvdXJjZS50b1N0cmluZygpfSc6ICR7ZXJyb3JzLmdldEVycm9yTWVzc2FnZShlcnJvcil9YCk7XG5cdFx0XHRcdFx0aWYgKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EXG5cdFx0XHRcdFx0XHQmJiAoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9ESVJFQ1RPUlkpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiAne30nO1xuXHRcdFx0fSkpO1xuXHRcdH07XG5cblx0XHRjb25zdCBbW3NldHRpbmdzQ29udGVudF0sIHN0YW5kQWxvbmVDb25maWd1cmF0aW9uQ29udGVudHNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0ZG9ub3RSZXNvbHZlU2V0dGluZ3MgPyBQcm9taXNlLnJlc29sdmUoW3VuZGVmaW5lZF0pIDogcmVzb2x2ZUNvbnRlbnRzKFt0aGlzLnNldHRpbmdzUmVzb3VyY2VdKSxcblx0XHRcdHJlc29sdmVDb250ZW50cyh0aGlzLnN0YW5kQWxvbmVDb25maWd1cmF0aW9uUmVzb3VyY2VzLm1hcCgoWywgcmVzb3VyY2VdKSA9PiByZXNvdXJjZSkpLFxuXHRcdF0pO1xuXG5cdFx0cmV0dXJuIFtzZXR0aW5nc0NvbnRlbnQsIHN0YW5kQWxvbmVDb25maWd1cmF0aW9uQ29udGVudHMubWFwKChjb250ZW50LCBpbmRleCkgPT4gKFt0aGlzLnN0YW5kQWxvbmVDb25maWd1cmF0aW9uUmVzb3VyY2VzW2luZGV4XVswXSwgY29udGVudF0pKV07XG5cdH1cblxuXHRhc3luYyBsb2FkQ29uZmlndXJhdGlvbihzZXR0aW5nc0NvbmZpZ3VyYXRpb24/OiBDb25maWd1cmF0aW9uTW9kZWwpOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD4ge1xuXG5cdFx0Y29uc3QgW3NldHRpbmdzQ29udGVudCwgc3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25Db250ZW50c10gPSBhd2FpdCB0aGlzLnJlc29sdmVDb250ZW50cyghIXNldHRpbmdzQ29uZmlndXJhdGlvbik7XG5cblx0XHQvLyByZXNldFxuXHRcdHRoaXMuX3N0YW5kQWxvbmVDb25maWd1cmF0aW9ucyA9IFtdO1xuXHRcdHRoaXMuX2ZvbGRlclNldHRpbmdzTW9kZWxQYXJzZXIucGFyc2UoJycsIHRoaXMuX2ZvbGRlclNldHRpbmdzUGFyc2VPcHRpb25zKTtcblxuXHRcdC8vIHBhcnNlXG5cdFx0aWYgKHNldHRpbmdzQ29udGVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9mb2xkZXJTZXR0aW5nc01vZGVsUGFyc2VyLnBhcnNlKHNldHRpbmdzQ29udGVudCwgdGhpcy5fZm9sZGVyU2V0dGluZ3NQYXJzZU9wdGlvbnMpO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgc3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25Db250ZW50cy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IGNvbnRlbnRzID0gc3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25Db250ZW50c1tpbmRleF1bMV07XG5cdFx0XHRpZiAoY29udGVudHMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBzdGFuZEFsb25lQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyID0gbmV3IFN0YW5kYWxvbmVDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIodGhpcy5zdGFuZEFsb25lQ29uZmlndXJhdGlvblJlc291cmNlc1tpbmRleF1bMV0udG9TdHJpbmcoKSwgdGhpcy5zdGFuZEFsb25lQ29uZmlndXJhdGlvblJlc291cmNlc1tpbmRleF1bMF0sIHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHRcdHN0YW5kQWxvbmVDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIucGFyc2UoY29udGVudHMpO1xuXHRcdFx0XHR0aGlzLl9zdGFuZEFsb25lQ29uZmlndXJhdGlvbnMucHVzaChzdGFuZEFsb25lQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyLmNvbmZpZ3VyYXRpb25Nb2RlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ29uc29saWRhdGUgKHN1cHBvcnQgKi5qc29uIGZpbGVzIGluIHRoZSB3b3Jrc3BhY2Ugc2V0dGluZ3MgZm9sZGVyKVxuXHRcdHRoaXMuY29uc29saWRhdGUoc2V0dGluZ3NDb25maWd1cmF0aW9uKTtcblxuXHRcdHJldHVybiB0aGlzLl9jYWNoZTtcblx0fVxuXG5cdGdldFJlc3RyaWN0ZWRTZXR0aW5ncygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZvbGRlclNldHRpbmdzTW9kZWxQYXJzZXIucmVzdHJpY3RlZENvbmZpZ3VyYXRpb25zO1xuXHR9XG5cblx0cmVwYXJzZShjb25maWd1cmF0aW9uUGFyc2VPcHRpb25zOiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRjb25zdCBvbGRDb250ZW50cyA9IHRoaXMuX2ZvbGRlclNldHRpbmdzTW9kZWxQYXJzZXIuY29uZmlndXJhdGlvbk1vZGVsLmNvbnRlbnRzO1xuXHRcdHRoaXMuX2ZvbGRlclNldHRpbmdzUGFyc2VPcHRpb25zID0gY29uZmlndXJhdGlvblBhcnNlT3B0aW9ucztcblx0XHR0aGlzLl9mb2xkZXJTZXR0aW5nc01vZGVsUGFyc2VyLnJlcGFyc2UodGhpcy5fZm9sZGVyU2V0dGluZ3NQYXJzZU9wdGlvbnMpO1xuXHRcdGlmICghZXF1YWxzKG9sZENvbnRlbnRzLCB0aGlzLl9mb2xkZXJTZXR0aW5nc01vZGVsUGFyc2VyLmNvbmZpZ3VyYXRpb25Nb2RlbC5jb250ZW50cykpIHtcblx0XHRcdHRoaXMuY29uc29saWRhdGUoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25zb2xpZGF0ZShzZXR0aW5nc0NvbmZpZ3VyYXRpb24/OiBDb25maWd1cmF0aW9uTW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl9jYWNoZSA9IChzZXR0aW5nc0NvbmZpZ3VyYXRpb24gPz8gdGhpcy5fZm9sZGVyU2V0dGluZ3NNb2RlbFBhcnNlci5jb25maWd1cmF0aW9uTW9kZWwpLm1lcmdlKC4uLnRoaXMuX3N0YW5kQWxvbmVDb25maWd1cmF0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUZpbGVDaGFuZ2VzRXZlbnQoZXZlbnQ6IEZpbGVDaGFuZ2VzRXZlbnQpOiBib29sZWFuIHtcblx0XHQvLyBPbmUgb2YgdGhlIHJlc291cmNlcyBoYXMgY2hhbmdlZFxuXHRcdGlmICh0aGlzLmFsbFJlc291cmNlcy5zb21lKHJlc291cmNlID0+IGV2ZW50LmNvbnRhaW5zKHJlc291cmNlKSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHQvLyBPbmUgb2YgdGhlIHJlc291cmNlJ3MgcGFyZW50IGdvdCBkZWxldGVkXG5cdFx0aWYgKHRoaXMuYWxsUmVzb3VyY2VzLnNvbWUocmVzb3VyY2UgPT4gZXZlbnQuY29udGFpbnModGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmRpcm5hbWUocmVzb3VyY2UpLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUZpbGVPcGVyYXRpb25FdmVudChldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Ly8gT25lIG9mIHRoZSByZXNvdXJjZXMgaGFzIGNoYW5nZWRcblx0XHRpZiAoKGV2ZW50LmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uQ1JFQVRFKSB8fCBldmVudC5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLkNPUFkpIHx8IGV2ZW50LmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uREVMRVRFKSB8fCBldmVudC5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLldSSVRFKSlcblx0XHRcdCYmIHRoaXMuYWxsUmVzb3VyY2VzLnNvbWUocmVzb3VyY2UgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZXZlbnQucmVzb3VyY2UsIHJlc291cmNlKSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHQvLyBPbmUgb2YgdGhlIHJlc291cmNlJ3MgcGFyZW50IGdvdCBkZWxldGVkXG5cdFx0aWYgKGV2ZW50LmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uREVMRVRFKSAmJiB0aGlzLmFsbFJlc291cmNlcy5zb21lKHJlc291cmNlID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGV2ZW50LnJlc291cmNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZGlybmFtZShyZXNvdXJjZSkpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBSZW1vdGVVc2VyQ29uZmlndXJhdGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlZENvbmZpZ3VyYXRpb246IENhY2hlZFJlbW90ZVVzZXJDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlO1xuXHRwcml2YXRlIF91c2VyQ29uZmlndXJhdGlvbjogRmlsZVNlcnZpY2VCYXNlZFJlbW90ZVVzZXJDb25maWd1cmF0aW9uIHwgQ2FjaGVkUmVtb3RlVXNlckNvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgX3VzZXJDb25maWd1cmF0aW9uSW5pdGlhbGl6YXRpb25Qcm9taXNlOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD4gfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb246IEVtaXR0ZXI8Q29uZmlndXJhdGlvbk1vZGVsPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENvbmZpZ3VyYXRpb25Nb2RlbD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb246IEV2ZW50PENvbmZpZ3VyYXRpb25Nb2RlbD4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbml0aWFsaXplID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Q29uZmlndXJhdGlvbk1vZGVsPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkSW5pdGlhbGl6ZSA9IHRoaXMuX29uRGlkSW5pdGlhbGl6ZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZW1vdGVBdXRob3JpdHk6IHN0cmluZyxcblx0XHRjb25maWd1cmF0aW9uQ2FjaGU6IElDb25maWd1cmF0aW9uQ2FjaGUsXG5cdFx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHR1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0cmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZmlsZVNlcnZpY2UgPSBmaWxlU2VydmljZTtcblx0XHR0aGlzLl91c2VyQ29uZmlndXJhdGlvbiA9IHRoaXMuX2NhY2hlZENvbmZpZ3VyYXRpb24gPSBuZXcgQ2FjaGVkUmVtb3RlVXNlckNvbmZpZ3VyYXRpb24ocmVtb3RlQXV0aG9yaXR5LCBjb25maWd1cmF0aW9uQ2FjaGUsIHsgc2NvcGVzOiBSRU1PVEVfTUFDSElORV9TQ09QRVMgfSwgbG9nU2VydmljZSk7XG5cdFx0cmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCkudGhlbihhc3luYyBlbnZpcm9ubWVudCA9PiB7XG5cdFx0XHRpZiAoZW52aXJvbm1lbnQpIHtcblx0XHRcdFx0Y29uc3QgdXNlckNvbmZpZ3VyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRmlsZVNlcnZpY2VCYXNlZFJlbW90ZVVzZXJDb25maWd1cmF0aW9uKGVudmlyb25tZW50LnNldHRpbmdzUGF0aCwgeyBzY29wZXM6IFJFTU9URV9NQUNISU5FX1NDT1BFUyB9LCB0aGlzLl9maWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJDb25maWd1cmF0aW9uLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uTW9kZWwgPT4gdGhpcy5vbkRpZFVzZXJDb25maWd1cmF0aW9uQ2hhbmdlKGNvbmZpZ3VyYXRpb25Nb2RlbCkpKTtcblx0XHRcdFx0dGhpcy5fdXNlckNvbmZpZ3VyYXRpb25Jbml0aWFsaXphdGlvblByb21pc2UgPSB1c2VyQ29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Nb2RlbCA9IGF3YWl0IHRoaXMuX3VzZXJDb25maWd1cmF0aW9uSW5pdGlhbGl6YXRpb25Qcm9taXNlO1xuXHRcdFx0XHR0aGlzLl91c2VyQ29uZmlndXJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX3VzZXJDb25maWd1cmF0aW9uID0gdXNlckNvbmZpZ3VyYXRpb247XG5cdFx0XHRcdHRoaXMub25EaWRVc2VyQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uTW9kZWwpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEluaXRpYWxpemUuZmlyZShjb25maWd1cmF0aW9uTW9kZWwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD4ge1xuXHRcdGlmICh0aGlzLl91c2VyQ29uZmlndXJhdGlvbiBpbnN0YW5jZW9mIEZpbGVTZXJ2aWNlQmFzZWRSZW1vdGVVc2VyQ29uZmlndXJhdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3VzZXJDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblx0XHR9XG5cblx0XHQvLyBJbml0aWFsaXplIGNhY2hlZCBjb25maWd1cmF0aW9uXG5cdFx0bGV0IGNvbmZpZ3VyYXRpb25Nb2RlbCA9IGF3YWl0IHRoaXMuX3VzZXJDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblx0XHRpZiAodGhpcy5fdXNlckNvbmZpZ3VyYXRpb25Jbml0aWFsaXphdGlvblByb21pc2UpIHtcblx0XHRcdC8vIFVzZSB1c2VyIGNvbmZpZ3VyYXRpb25cblx0XHRcdGNvbmZpZ3VyYXRpb25Nb2RlbCA9IGF3YWl0IHRoaXMuX3VzZXJDb25maWd1cmF0aW9uSW5pdGlhbGl6YXRpb25Qcm9taXNlO1xuXHRcdFx0dGhpcy5fdXNlckNvbmZpZ3VyYXRpb25Jbml0aWFsaXphdGlvblByb21pc2UgPSBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb25maWd1cmF0aW9uTW9kZWw7XG5cdH1cblxuXHRyZWxvYWQoKTogUHJvbWlzZTxDb25maWd1cmF0aW9uTW9kZWw+IHtcblx0XHRyZXR1cm4gdGhpcy5fdXNlckNvbmZpZ3VyYXRpb24ucmVsb2FkKCk7XG5cdH1cblxuXHRyZXBhcnNlKCk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3VzZXJDb25maWd1cmF0aW9uLnJlcGFyc2UoeyBzY29wZXM6IFJFTU9URV9NQUNISU5FX1NDT1BFUyB9KTtcblx0fVxuXG5cdGdldFJlc3RyaWN0ZWRTZXR0aW5ncygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3VzZXJDb25maWd1cmF0aW9uLmdldFJlc3RyaWN0ZWRTZXR0aW5ncygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFVzZXJDb25maWd1cmF0aW9uQ2hhbmdlKGNvbmZpZ3VyYXRpb25Nb2RlbDogQ29uZmlndXJhdGlvbk1vZGVsKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVDYWNoZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5maXJlKGNvbmZpZ3VyYXRpb25Nb2RlbCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUNhY2hlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl91c2VyQ29uZmlndXJhdGlvbiBpbnN0YW5jZW9mIEZpbGVTZXJ2aWNlQmFzZWRSZW1vdGVVc2VyQ29uZmlndXJhdGlvbikge1xuXHRcdFx0bGV0IGNvbnRlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnRlbnQgPSBhd2FpdCB0aGlzLl91c2VyQ29uZmlndXJhdGlvbi5yZXNvbHZlQ29udGVudCgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9jYWNoZWRDb25maWd1cmF0aW9uLnVwZGF0ZUNvbmZpZ3VyYXRpb24oY29udGVudCk7XG5cdFx0fVxuXHR9XG5cbn1cblxuY2xhc3MgRmlsZVNlcnZpY2VCYXNlZFJlbW90ZVVzZXJDb25maWd1cmF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwYXJzZXI6IENvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlcjtcblx0cHJpdmF0ZSBwYXJzZU9wdGlvbnM6IENvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVsb2FkQ29uZmlndXJhdGlvblNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb246IEVtaXR0ZXI8Q29uZmlndXJhdGlvbk1vZGVsPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENvbmZpZ3VyYXRpb25Nb2RlbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbjogRXZlbnQ8Q29uZmlndXJhdGlvbk1vZGVsPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGZpbGVXYXRjaGVyRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBkaXJlY3RvcnlXYXRjaGVyRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogVVJJLFxuXHRcdGNvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnM6IENvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnBhcnNlciA9IG5ldyBDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIodGhpcy5jb25maWd1cmF0aW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgbG9nU2VydmljZSk7XG5cdFx0dGhpcy5wYXJzZU9wdGlvbnMgPSBjb25maWd1cmF0aW9uUGFyc2VPcHRpb25zO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB0aGlzLmhhbmRsZUZpbGVDaGFuZ2VzRXZlbnQoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihmaWxlU2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IHRoaXMuaGFuZGxlRmlsZU9wZXJhdGlvbkV2ZW50KGUpKSk7XG5cdFx0dGhpcy5yZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5yZWxvYWQoKS50aGVuKGNvbmZpZ3VyYXRpb25Nb2RlbCA9PiB0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZShjb25maWd1cmF0aW9uTW9kZWwpKSwgNTApKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5zdG9wV2F0Y2hpbmdSZXNvdXJjZSgpO1xuXHRcdFx0dGhpcy5zdG9wV2F0Y2hpbmdEaXJlY3RvcnkoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHdhdGNoUmVzb3VyY2UoKTogdm9pZCB7XG5cdFx0dGhpcy5maWxlV2F0Y2hlckRpc3Bvc2FibGUudmFsdWUgPSB0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKHRoaXMuY29uZmlndXJhdGlvblJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgc3RvcFdhdGNoaW5nUmVzb3VyY2UoKTogdm9pZCB7XG5cdFx0dGhpcy5maWxlV2F0Y2hlckRpc3Bvc2FibGUudmFsdWUgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHdhdGNoRGlyZWN0b3J5KCk6IHZvaWQge1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKHRoaXMuY29uZmlndXJhdGlvblJlc291cmNlKTtcblx0XHR0aGlzLmRpcmVjdG9yeVdhdGNoZXJEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5maWxlU2VydmljZS53YXRjaChkaXJlY3RvcnkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdG9wV2F0Y2hpbmdEaXJlY3RvcnkoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXJlY3RvcnlXYXRjaGVyRGlzcG9zYWJsZS52YWx1ZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTxDb25maWd1cmF0aW9uTW9kZWw+IHtcblx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh0aGlzLmNvbmZpZ3VyYXRpb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5vblJlc291cmNlRXhpc3RzKGV4aXN0cyk7XG5cdFx0cmV0dXJuIHRoaXMucmVsb2FkKCk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlQ29udGVudCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMuY29uZmlndXJhdGlvblJlc291cmNlLCB7IGF0b21pYzogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHR9XG5cblx0YXN5bmMgcmVsb2FkKCk6IFByb21pc2U8Q29uZmlndXJhdGlvbk1vZGVsPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnJlc29sdmVDb250ZW50KCk7XG5cdFx0XHR0aGlzLnBhcnNlci5wYXJzZShjb250ZW50LCB0aGlzLnBhcnNlT3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gdGhpcy5wYXJzZXIuY29uZmlndXJhdGlvbk1vZGVsO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbCh0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdH1cblx0fVxuXG5cdHJlcGFyc2UoY29uZmlndXJhdGlvblBhcnNlT3B0aW9uczogQ29uZmlndXJhdGlvblBhcnNlT3B0aW9ucyk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0dGhpcy5wYXJzZU9wdGlvbnMgPSBjb25maWd1cmF0aW9uUGFyc2VPcHRpb25zO1xuXHRcdHRoaXMucGFyc2VyLnJlcGFyc2UodGhpcy5wYXJzZU9wdGlvbnMpO1xuXHRcdHJldHVybiB0aGlzLnBhcnNlci5jb25maWd1cmF0aW9uTW9kZWw7XG5cdH1cblxuXHRnZXRSZXN0cmljdGVkU2V0dGluZ3MoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLnBhcnNlci5yZXN0cmljdGVkQ29uZmlndXJhdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUZpbGVDaGFuZ2VzRXZlbnQoZXZlbnQ6IEZpbGVDaGFuZ2VzRXZlbnQpOiB2b2lkIHtcblxuXHRcdC8vIEZpbmQgY2hhbmdlcyB0aGF0IGFmZmVjdCB0aGUgcmVzb3VyY2Vcblx0XHRsZXQgYWZmZWN0ZWRCeUNoYW5nZXMgPSBmYWxzZTtcblx0XHRpZiAoZXZlbnQuY29udGFpbnModGhpcy5jb25maWd1cmF0aW9uUmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKSkge1xuXHRcdFx0YWZmZWN0ZWRCeUNoYW5nZXMgPSB0cnVlO1xuXHRcdFx0dGhpcy5vblJlc291cmNlRXhpc3RzKHRydWUpO1xuXHRcdH0gZWxzZSBpZiAoZXZlbnQuY29udGFpbnModGhpcy5jb25maWd1cmF0aW9uUmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpKSB7XG5cdFx0XHRhZmZlY3RlZEJ5Q2hhbmdlcyA9IHRydWU7XG5cdFx0XHR0aGlzLm9uUmVzb3VyY2VFeGlzdHMoZmFsc2UpO1xuXHRcdH0gZWxzZSBpZiAoZXZlbnQuY29udGFpbnModGhpcy5jb25maWd1cmF0aW9uUmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpKSB7XG5cdFx0XHRhZmZlY3RlZEJ5Q2hhbmdlcyA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKGFmZmVjdGVkQnlDaGFuZ2VzKSB7XG5cdFx0XHR0aGlzLnJlbG9hZENvbmZpZ3VyYXRpb25TY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUZpbGVPcGVyYXRpb25FdmVudChldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKChldmVudC5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLkNSRUFURSkgfHwgZXZlbnQuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5DT1BZKSB8fCBldmVudC5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLkRFTEVURSkgfHwgZXZlbnQuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5XUklURSkpXG5cdFx0XHQmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChldmVudC5yZXNvdXJjZSwgdGhpcy5jb25maWd1cmF0aW9uUmVzb3VyY2UpKSB7XG5cdFx0XHR0aGlzLnJlbG9hZENvbmZpZ3VyYXRpb25TY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uUmVzb3VyY2VFeGlzdHMoZXhpc3RzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGV4aXN0cykge1xuXHRcdFx0dGhpcy5zdG9wV2F0Y2hpbmdEaXJlY3RvcnkoKTtcblx0XHRcdHRoaXMud2F0Y2hSZXNvdXJjZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3BXYXRjaGluZ1Jlc291cmNlKCk7XG5cdFx0XHR0aGlzLndhdGNoRGlyZWN0b3J5KCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIENhY2hlZFJlbW90ZVVzZXJDb25maWd1cmF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2U6IEVtaXR0ZXI8Q29uZmlndXJhdGlvbk1vZGVsPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENvbmZpZ3VyYXRpb25Nb2RlbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxDb25maWd1cmF0aW9uTW9kZWw+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBrZXk6IENvbmZpZ3VyYXRpb25LZXk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcGFyc2VyOiBDb25maWd1cmF0aW9uTW9kZWxQYXJzZXI7XG5cdHByaXZhdGUgcGFyc2VPcHRpb25zOiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zO1xuXHRwcml2YXRlIGNvbmZpZ3VyYXRpb25Nb2RlbDogQ29uZmlndXJhdGlvbk1vZGVsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlbW90ZUF1dGhvcml0eTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvbkNhY2hlOiBJQ29uZmlndXJhdGlvbkNhY2hlLFxuXHRcdGNvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnM6IENvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMsXG5cdFx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5rZXkgPSB7IHR5cGU6ICd1c2VyJywga2V5OiByZW1vdGVBdXRob3JpdHkgfTtcblx0XHR0aGlzLnBhcnNlciA9IG5ldyBDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIoJ0NhY2hlZFJlbW90ZVVzZXJDb25maWd1cmF0aW9uJywgbG9nU2VydmljZSk7XG5cdFx0dGhpcy5wYXJzZU9wdGlvbnMgPSBjb25maWd1cmF0aW9uUGFyc2VPcHRpb25zO1xuXHRcdHRoaXMuY29uZmlndXJhdGlvbk1vZGVsID0gQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSk7XG5cdH1cblxuXHRnZXRDb25maWd1cmF0aW9uTW9kZWwoKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uTW9kZWw7XG5cdH1cblxuXHRpbml0aWFsaXplKCk6IFByb21pc2U8Q29uZmlndXJhdGlvbk1vZGVsPiB7XG5cdFx0cmV0dXJuIHRoaXMucmVsb2FkKCk7XG5cdH1cblxuXHRyZXBhcnNlKGNvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnM6IENvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHRoaXMucGFyc2VPcHRpb25zID0gY29uZmlndXJhdGlvblBhcnNlT3B0aW9ucztcblx0XHR0aGlzLnBhcnNlci5yZXBhcnNlKHRoaXMucGFyc2VPcHRpb25zKTtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25Nb2RlbCA9IHRoaXMucGFyc2VyLmNvbmZpZ3VyYXRpb25Nb2RlbDtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uTW9kZWw7XG5cdH1cblxuXHRnZXRSZXN0cmljdGVkU2V0dGluZ3MoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLnBhcnNlci5yZXN0cmljdGVkQ29uZmlndXJhdGlvbnM7XG5cdH1cblxuXHRhc3luYyByZWxvYWQoKTogUHJvbWlzZTxDb25maWd1cmF0aW9uTW9kZWw+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuY29uZmlndXJhdGlvbkNhY2hlLnJlYWQodGhpcy5rZXkpO1xuXHRcdFx0Y29uc3QgcGFyc2VkOiB7IGNvbnRlbnQ6IHN0cmluZyB9ID0gSlNPTi5wYXJzZShjb250ZW50KTtcblx0XHRcdGlmIChwYXJzZWQuY29udGVudCkge1xuXHRcdFx0XHR0aGlzLnBhcnNlci5wYXJzZShwYXJzZWQuY29udGVudCwgdGhpcy5wYXJzZU9wdGlvbnMpO1xuXHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25Nb2RlbCA9IHRoaXMucGFyc2VyLmNvbmZpZ3VyYXRpb25Nb2RlbDtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7IC8qIElnbm9yZSBlcnJvciAqLyB9XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvbk1vZGVsO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlQ29uZmlndXJhdGlvbihjb250ZW50OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvbkNhY2hlLndyaXRlKHRoaXMua2V5LCBKU09OLnN0cmluZ2lmeSh7IGNvbnRlbnQgfSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uQ2FjaGUucmVtb3ZlKHRoaXMua2V5KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZWRDb25maWd1cmF0aW9uOiBDYWNoZWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIF93b3Jrc3BhY2VDb25maWd1cmF0aW9uOiBDYWNoZWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uIHwgRmlsZVNlcnZpY2VCYXNlZFdvcmtzcGFjZUNvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbmZpZ3VyYXRpb25EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX3dvcmtzcGFjZUlkZW50aWZpZXI6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2lzV29ya3NwYWNlVHJ1c3RlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVXBkYXRlQ29uZmlndXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRVcGRhdGVDb25maWd1cmF0aW9uID0gdGhpcy5fb25EaWRVcGRhdGVDb25maWd1cmF0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgX2luaXRpYWxpemVkOiBib29sZWFuID0gZmFsc2U7XG5cdGdldCBpbml0aWFsaXplZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2luaXRpYWxpemVkOyB9XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvbkNhY2hlOiBJQ29uZmlndXJhdGlvbkNhY2hlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZmlsZVNlcnZpY2UgPSBmaWxlU2VydmljZTtcblx0XHR0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uID0gdGhpcy5fY2FjaGVkQ29uZmlndXJhdGlvbiA9IG5ldyBDYWNoZWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25DYWNoZSwgbG9nU2VydmljZSk7XG5cdH1cblxuXHRhc3luYyBpbml0aWFsaXplKHdvcmtzcGFjZUlkZW50aWZpZXI6IElXb3Jrc3BhY2VJZGVudGlmaWVyLCB3b3Jrc3BhY2VUcnVzdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fd29ya3NwYWNlSWRlbnRpZmllciA9IHdvcmtzcGFjZUlkZW50aWZpZXI7XG5cdFx0dGhpcy5faXNXb3Jrc3BhY2VUcnVzdGVkID0gd29ya3NwYWNlVHJ1c3RlZDtcblx0XHRpZiAoIXRoaXMuX2luaXRpYWxpemVkKSB7XG5cdFx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uQ2FjaGUubmVlZHNDYWNoaW5nKHRoaXMuX3dvcmtzcGFjZUlkZW50aWZpZXIuY29uZmlnUGF0aCkpIHtcblx0XHRcdFx0dGhpcy5fd29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IHRoaXMuX2NhY2hlZENvbmZpZ3VyYXRpb247XG5cdFx0XHRcdHRoaXMud2FpdEFuZEluaXRpYWxpemUodGhpcy5fd29ya3NwYWNlSWRlbnRpZmllcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmRvSW5pdGlhbGl6ZShuZXcgRmlsZVNlcnZpY2VCYXNlZFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24odGhpcy5maWxlU2VydmljZSwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnJlbG9hZCgpO1xuXHR9XG5cblx0YXN5bmMgcmVsb2FkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl93b3Jrc3BhY2VJZGVudGlmaWVyKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uLmxvYWQodGhpcy5fd29ya3NwYWNlSWRlbnRpZmllciwgeyBzY29wZXM6IFdPUktTUEFDRV9TQ09QRVMsIHNraXBSZXN0cmljdGVkOiB0aGlzLmlzVW50cnVzdGVkKCkgfSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0Rm9sZGVycygpOiBJU3RvcmVkV29ya3NwYWNlRm9sZGVyW10ge1xuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uLmdldEZvbGRlcnMoKTtcblx0fVxuXG5cdHNldEZvbGRlcnMoZm9sZGVyczogSVN0b3JlZFdvcmtzcGFjZUZvbGRlcltdLCBqc29uRWRpdGluZ1NlcnZpY2U6IElKU09ORWRpdGluZ1NlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fd29ya3NwYWNlSWRlbnRpZmllcikge1xuXHRcdFx0cmV0dXJuIGpzb25FZGl0aW5nU2VydmljZS53cml0ZSh0aGlzLl93b3Jrc3BhY2VJZGVudGlmaWVyLmNvbmZpZ1BhdGgsIFt7IHBhdGg6IFsnZm9sZGVycyddLCB2YWx1ZTogZm9sZGVycyB9XSwgdHJ1ZSlcblx0XHRcdFx0LnRoZW4oKCkgPT4gdGhpcy5yZWxvYWQoKSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdGlzVHJhbnNpZW50KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uLmlzVHJhbnNpZW50KCk7XG5cdH1cblxuXHRnZXRDb25maWd1cmF0aW9uKCk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZUNvbmZpZ3VyYXRpb24uZ2V0V29ya3NwYWNlU2V0dGluZ3MoKTtcblx0fVxuXG5cdHVwZGF0ZVdvcmtzcGFjZVRydXN0KHRydXN0ZWQ6IGJvb2xlYW4pOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHRoaXMuX2lzV29ya3NwYWNlVHJ1c3RlZCA9IHRydXN0ZWQ7XG5cdFx0cmV0dXJuIHRoaXMucmVwYXJzZVdvcmtzcGFjZVNldHRpbmdzKCk7XG5cdH1cblxuXHRyZXBhcnNlV29ya3NwYWNlU2V0dGluZ3MoY29uZmlndXJhdGlvblBhcnNlT3B0aW9ucz86IENvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHRoaXMuX3dvcmtzcGFjZUNvbmZpZ3VyYXRpb24ucmVwYXJzZVdvcmtzcGFjZVNldHRpbmdzKHsgc2NvcGVzOiBXT1JLU1BBQ0VfU0NPUEVTLCBza2lwUmVzdHJpY3RlZDogdGhpcy5pc1VudHJ1c3RlZCgpLCAuLi5jb25maWd1cmF0aW9uUGFyc2VPcHRpb25zIH0pO1xuXHRcdHJldHVybiB0aGlzLmdldENvbmZpZ3VyYXRpb24oKTtcblx0fVxuXG5cdGdldFJlc3RyaWN0ZWRTZXR0aW5ncygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZUNvbmZpZ3VyYXRpb24uZ2V0UmVzdHJpY3RlZFNldHRpbmdzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdhaXRBbmRJbml0aWFsaXplKHdvcmtzcGFjZUlkZW50aWZpZXI6IElXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgd2hlblByb3ZpZGVyUmVnaXN0ZXJlZCh3b3Jrc3BhY2VJZGVudGlmaWVyLmNvbmZpZ1BhdGgsIHRoaXMuZmlsZVNlcnZpY2UpO1xuXHRcdGlmICghKHRoaXMuX3dvcmtzcGFjZUNvbmZpZ3VyYXRpb24gaW5zdGFuY2VvZiBGaWxlU2VydmljZUJhc2VkV29ya3NwYWNlQ29uZmlndXJhdGlvbikpIHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlQmFzZWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEZpbGVTZXJ2aWNlQmFzZWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uKHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlQmFzZWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uLmxvYWQod29ya3NwYWNlSWRlbnRpZmllciwgeyBzY29wZXM6IFdPUktTUEFDRV9TQ09QRVMsIHNraXBSZXN0cmljdGVkOiB0aGlzLmlzVW50cnVzdGVkKCkgfSk7XG5cdFx0XHR0aGlzLmRvSW5pdGlhbGl6ZShmaWxlU2VydmljZUJhc2VkV29ya3NwYWNlQ29uZmlndXJhdGlvbik7XG5cdFx0XHR0aGlzLm9uRGlkV29ya3NwYWNlQ29uZmlndXJhdGlvbkNoYW5nZShmYWxzZSwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb0luaXRpYWxpemUoZmlsZVNlcnZpY2VCYXNlZFdvcmtzcGFjZUNvbmZpZ3VyYXRpb246IEZpbGVTZXJ2aWNlQmFzZWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya3NwYWNlQ29uZmlndXJhdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fd29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IHRoaXMuX3dvcmtzcGFjZUNvbmZpZ3VyYXRpb25EaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2VCYXNlZFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24pO1xuXHRcdHRoaXMuX3dvcmtzcGFjZUNvbmZpZ3VyYXRpb25EaXNwb3NhYmxlcy5hZGQodGhpcy5fd29ya3NwYWNlQ29uZmlndXJhdGlvbi5vbkRpZENoYW5nZShlID0+IHRoaXMub25EaWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uQ2hhbmdlKHRydWUsIGZhbHNlKSkpO1xuXHRcdHRoaXMuX2luaXRpYWxpemVkID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgaXNVbnRydXN0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLl9pc1dvcmtzcGFjZVRydXN0ZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkV29ya3NwYWNlQ29uZmlndXJhdGlvbkNoYW5nZShyZWxvYWQ6IGJvb2xlYW4sIGZyb21DYWNoZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChyZWxvYWQpIHtcblx0XHRcdGF3YWl0IHRoaXMucmVsb2FkKCk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlQ2FjaGUoKTtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24uZmlyZShmcm9tQ2FjaGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVDYWNoZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fd29ya3NwYWNlSWRlbnRpZmllciAmJiB0aGlzLmNvbmZpZ3VyYXRpb25DYWNoZS5uZWVkc0NhY2hpbmcodGhpcy5fd29ya3NwYWNlSWRlbnRpZmllci5jb25maWdQYXRoKSAmJiB0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uIGluc3RhbmNlb2YgRmlsZVNlcnZpY2VCYXNlZFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uLnJlc29sdmVDb250ZW50KHRoaXMuX3dvcmtzcGFjZUlkZW50aWZpZXIpO1xuXHRcdFx0YXdhaXQgdGhpcy5fY2FjaGVkQ29uZmlndXJhdGlvbi51cGRhdGVXb3Jrc3BhY2UodGhpcy5fd29ya3NwYWNlSWRlbnRpZmllciwgY29udGVudCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEZpbGVTZXJ2aWNlQmFzZWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0d29ya3NwYWNlQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyOiBXb3Jrc3BhY2VDb25maWd1cmF0aW9uTW9kZWxQYXJzZXI7XG5cdHdvcmtzcGFjZVNldHRpbmdzOiBDb25maWd1cmF0aW9uTW9kZWw7XG5cdHByaXZhdGUgX3dvcmtzcGFjZUlkZW50aWZpZXI6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgd29ya3NwYWNlQ29uZmlnV2F0Y2hlcjogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVsb2FkQ29uZmlndXJhdGlvblNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHR1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyID0gbmV3IFdvcmtzcGFjZUNvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlcignJywgbG9nU2VydmljZSk7XG5cdFx0dGhpcy53b3Jrc3BhY2VTZXR0aW5ncyA9IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KFxuXHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZSwgZSA9PiAhIXRoaXMuX3dvcmtzcGFjZUlkZW50aWZpZXIgJiYgZS5jb250YWlucyh0aGlzLl93b3Jrc3BhY2VJZGVudGlmaWVyLmNvbmZpZ1BhdGgpKSxcblx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uLCBlID0+ICEhdGhpcy5fd29ya3NwYWNlSWRlbnRpZmllciAmJiAoZS5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLkNSRUFURSkgfHwgZS5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLkNPUFkpIHx8IGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5ERUxFVEUpIHx8IGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5XUklURSkpICYmIHVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlLnJlc291cmNlLCB0aGlzLl93b3Jrc3BhY2VJZGVudGlmaWVyLmNvbmZpZ1BhdGgpKVxuXHRcdCkoKCkgPT4gdGhpcy5yZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyLnNjaGVkdWxlKCkpKTtcblx0XHR0aGlzLnJlbG9hZENvbmZpZ3VyYXRpb25TY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9vbkRpZENoYW5nZS5maXJlKCksIDUwKSk7XG5cdFx0dGhpcy53b3Jrc3BhY2VDb25maWdXYXRjaGVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy53YXRjaFdvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlKCkpO1xuXHR9XG5cblx0Z2V0IHdvcmtzcGFjZUlkZW50aWZpZXIoKTogSVdvcmtzcGFjZUlkZW50aWZpZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlSWRlbnRpZmllcjtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVDb250ZW50KHdvcmtzcGFjZUlkZW50aWZpZXI6IElXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh3b3Jrc3BhY2VJZGVudGlmaWVyLmNvbmZpZ1BhdGgsIHsgYXRvbWljOiB0cnVlIH0pO1xuXHRcdHJldHVybiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRhc3luYyBsb2FkKHdvcmtzcGFjZUlkZW50aWZpZXI6IElXb3Jrc3BhY2VJZGVudGlmaWVyLCBjb25maWd1cmF0aW9uUGFyc2VPcHRpb25zOiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl93b3Jrc3BhY2VJZGVudGlmaWVyIHx8IHRoaXMuX3dvcmtzcGFjZUlkZW50aWZpZXIuaWQgIT09IHdvcmtzcGFjZUlkZW50aWZpZXIuaWQpIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZUlkZW50aWZpZXIgPSB3b3Jrc3BhY2VJZGVudGlmaWVyO1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIgPSBuZXcgV29ya3NwYWNlQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyKHRoaXMuX3dvcmtzcGFjZUlkZW50aWZpZXIuaWQsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHRkaXNwb3NlKHRoaXMud29ya3NwYWNlQ29uZmlnV2F0Y2hlcik7XG5cdFx0XHR0aGlzLndvcmtzcGFjZUNvbmZpZ1dhdGNoZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLndhdGNoV29ya3NwYWNlQ29uZmlndXJhdGlvbkZpbGUoKSk7XG5cdFx0fVxuXHRcdGxldCBjb250ZW50cyA9ICcnO1xuXHRcdHRyeSB7XG5cdFx0XHRjb250ZW50cyA9IGF3YWl0IHRoaXMucmVzb2x2ZUNvbnRlbnQodGhpcy5fd29ya3NwYWNlSWRlbnRpZmllcik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHRoaXMuX3dvcmtzcGFjZUlkZW50aWZpZXIuY29uZmlnUGF0aCk7XG5cdFx0XHRpZiAoZXhpc3RzKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyLnBhcnNlKGNvbnRlbnRzLCBjb25maWd1cmF0aW9uUGFyc2VPcHRpb25zKTtcblx0XHR0aGlzLmNvbnNvbGlkYXRlKCk7XG5cdH1cblxuXHRnZXRDb25maWd1cmF0aW9uTW9kZWwoKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIuY29uZmlndXJhdGlvbk1vZGVsO1xuXHR9XG5cblx0Z2V0Rm9sZGVycygpOiBJU3RvcmVkV29ya3NwYWNlRm9sZGVyW10ge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlci5mb2xkZXJzO1xuXHR9XG5cblx0aXNUcmFuc2llbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyLnRyYW5zaWVudDtcblx0fVxuXG5cdGdldFdvcmtzcGFjZVNldHRpbmdzKCk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlU2V0dGluZ3M7XG5cdH1cblxuXHRyZXBhcnNlV29ya3NwYWNlU2V0dGluZ3MoY29uZmlndXJhdGlvblBhcnNlT3B0aW9uczogQ29uZmlndXJhdGlvblBhcnNlT3B0aW9ucyk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0dGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIucmVwYXJzZVdvcmtzcGFjZVNldHRpbmdzKGNvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMpO1xuXHRcdHRoaXMuY29uc29saWRhdGUoKTtcblx0XHRyZXR1cm4gdGhpcy5nZXRXb3Jrc3BhY2VTZXR0aW5ncygpO1xuXHR9XG5cblx0Z2V0UmVzdHJpY3RlZFNldHRpbmdzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIuZ2V0UmVzdHJpY3RlZFdvcmtzcGFjZVNldHRpbmdzKCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbnNvbGlkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMud29ya3NwYWNlU2V0dGluZ3MgPSB0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlci5zZXR0aW5nc01vZGVsLm1lcmdlKHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyLmxhdW5jaE1vZGVsLCB0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlci50YXNrc01vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgd2F0Y2hXb3Jrc3BhY2VDb25maWd1cmF0aW9uRmlsZSgpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZUlkZW50aWZpZXIgPyB0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKHRoaXMuX3dvcmtzcGFjZUlkZW50aWZpZXIuY29uZmlnUGF0aCkgOiBEaXNwb3NhYmxlLk5vbmU7XG5cdH1cblxufVxuXG5jbGFzcyBDYWNoZWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uIHtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSBFdmVudC5Ob25lO1xuXG5cdHdvcmtzcGFjZUNvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlcjogV29ya3NwYWNlQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyO1xuXHR3b3Jrc3BhY2VTZXR0aW5nczogQ29uZmlndXJhdGlvbk1vZGVsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvbkNhY2hlOiBJQ29uZmlndXJhdGlvbkNhY2hlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIgPSBuZXcgV29ya3NwYWNlQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyKCcnLCBsb2dTZXJ2aWNlKTtcblx0XHR0aGlzLndvcmtzcGFjZVNldHRpbmdzID0gQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSk7XG5cdH1cblxuXHRhc3luYyBsb2FkKHdvcmtzcGFjZUlkZW50aWZpZXI6IElXb3Jrc3BhY2VJZGVudGlmaWVyLCBjb25maWd1cmF0aW9uUGFyc2VPcHRpb25zOiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGtleSA9IHRoaXMuZ2V0S2V5KHdvcmtzcGFjZUlkZW50aWZpZXIpO1xuXHRcdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25DYWNoZS5yZWFkKGtleSk7XG5cdFx0XHRjb25zdCBwYXJzZWQ6IHsgY29udGVudDogc3RyaW5nIH0gPSBKU09OLnBhcnNlKGNvbnRlbnRzKTtcblx0XHRcdGlmIChwYXJzZWQuY29udGVudCkge1xuXHRcdFx0XHR0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlciA9IG5ldyBXb3Jrc3BhY2VDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIoa2V5LmtleSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdFx0dGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIucGFyc2UocGFyc2VkLmNvbnRlbnQsIGNvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMpO1xuXHRcdFx0XHR0aGlzLmNvbnNvbGlkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdH1cblx0fVxuXG5cdGdldCB3b3Jrc3BhY2VJZGVudGlmaWVyKCk6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRnZXRDb25maWd1cmF0aW9uTW9kZWwoKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIuY29uZmlndXJhdGlvbk1vZGVsO1xuXHR9XG5cblx0Z2V0Rm9sZGVycygpOiBJU3RvcmVkV29ya3NwYWNlRm9sZGVyW10ge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlci5mb2xkZXJzO1xuXHR9XG5cblx0aXNUcmFuc2llbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyLnRyYW5zaWVudDtcblx0fVxuXG5cdGdldFdvcmtzcGFjZVNldHRpbmdzKCk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlU2V0dGluZ3M7XG5cdH1cblxuXHRyZXBhcnNlV29ya3NwYWNlU2V0dGluZ3MoY29uZmlndXJhdGlvblBhcnNlT3B0aW9uczogQ29uZmlndXJhdGlvblBhcnNlT3B0aW9ucyk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0dGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIucmVwYXJzZVdvcmtzcGFjZVNldHRpbmdzKGNvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMpO1xuXHRcdHRoaXMuY29uc29saWRhdGUoKTtcblx0XHRyZXR1cm4gdGhpcy5nZXRXb3Jrc3BhY2VTZXR0aW5ncygpO1xuXHR9XG5cblx0Z2V0UmVzdHJpY3RlZFNldHRpbmdzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIuZ2V0UmVzdHJpY3RlZFdvcmtzcGFjZVNldHRpbmdzKCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbnNvbGlkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMud29ya3NwYWNlU2V0dGluZ3MgPSB0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlci5zZXR0aW5nc01vZGVsLm1lcmdlKHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyLmxhdW5jaE1vZGVsLCB0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlci50YXNrc01vZGVsKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVdvcmtzcGFjZSh3b3Jrc3BhY2VJZGVudGlmaWVyOiBJV29ya3NwYWNlSWRlbnRpZmllciwgY29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGtleSA9IHRoaXMuZ2V0S2V5KHdvcmtzcGFjZUlkZW50aWZpZXIpO1xuXHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uQ2FjaGUud3JpdGUoa2V5LCBKU09OLnN0cmluZ2lmeSh7IGNvbnRlbnQgfSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uQ2FjaGUucmVtb3ZlKGtleSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEtleSh3b3Jrc3BhY2VJZGVudGlmaWVyOiBJV29ya3NwYWNlSWRlbnRpZmllcik6IENvbmZpZ3VyYXRpb25LZXkge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnd29ya3NwYWNlcycsXG5cdFx0XHRrZXk6IHdvcmtzcGFjZUlkZW50aWZpZXIuaWRcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIENhY2hlZEZvbGRlckNvbmZpZ3VyYXRpb24ge1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblxuXHRwcml2YXRlIF9mb2xkZXJTZXR0aW5nc01vZGVsUGFyc2VyOiBDb25maWd1cmF0aW9uTW9kZWxQYXJzZXI7XG5cdHByaXZhdGUgX2ZvbGRlclNldHRpbmdzUGFyc2VPcHRpb25zOiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zO1xuXHRwcml2YXRlIF9zdGFuZEFsb25lQ29uZmlndXJhdGlvbnM6IENvbmZpZ3VyYXRpb25Nb2RlbFtdO1xuXHRwcml2YXRlIGNvbmZpZ3VyYXRpb25Nb2RlbDogQ29uZmlndXJhdGlvbk1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IGtleTogQ29uZmlndXJhdGlvbktleTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRmb2xkZXI6IFVSSSxcblx0XHRjb25maWdGb2xkZXJSZWxhdGl2ZVBhdGg6IHN0cmluZyxcblx0XHRjb25maWd1cmF0aW9uUGFyc2VPcHRpb25zOiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvbkNhY2hlOiBJQ29uZmlndXJhdGlvbkNhY2hlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5rZXkgPSB7IHR5cGU6ICdmb2xkZXInLCBrZXk6IGhhc2goam9pblBhdGgoZm9sZGVyLCBjb25maWdGb2xkZXJSZWxhdGl2ZVBhdGgpLnRvU3RyaW5nKCkpLnRvU3RyaW5nKDE2KSB9O1xuXHRcdHRoaXMuX2ZvbGRlclNldHRpbmdzTW9kZWxQYXJzZXIgPSBuZXcgQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyKCdDYWNoZWRGb2xkZXJDb25maWd1cmF0aW9uJywgbG9nU2VydmljZSk7XG5cdFx0dGhpcy5fZm9sZGVyU2V0dGluZ3NQYXJzZU9wdGlvbnMgPSBjb25maWd1cmF0aW9uUGFyc2VPcHRpb25zO1xuXHRcdHRoaXMuX3N0YW5kQWxvbmVDb25maWd1cmF0aW9ucyA9IFtdO1xuXHRcdHRoaXMuY29uZmlndXJhdGlvbk1vZGVsID0gQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSk7XG5cdH1cblxuXHRhc3luYyBsb2FkQ29uZmlndXJhdGlvbigpOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuY29uZmlndXJhdGlvbkNhY2hlLnJlYWQodGhpcy5rZXkpO1xuXHRcdFx0Y29uc3QgeyBjb250ZW50OiBjb25maWd1cmF0aW9uQ29udGVudHMgfTogeyBjb250ZW50OiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IH0gPSBKU09OLnBhcnNlKGNvbnRlbnRzLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKGNvbmZpZ3VyYXRpb25Db250ZW50cykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhjb25maWd1cmF0aW9uQ29udGVudHMpKSB7XG5cdFx0XHRcdFx0aWYgKGtleSA9PT0gRk9MREVSX1NFVFRJTkdTX05BTUUpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2ZvbGRlclNldHRpbmdzTW9kZWxQYXJzZXIucGFyc2UoY29uZmlndXJhdGlvbkNvbnRlbnRzW2tleV0sIHRoaXMuX2ZvbGRlclNldHRpbmdzUGFyc2VPcHRpb25zKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlciA9IG5ldyBTdGFuZGFsb25lQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyKGtleSwga2V5LCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRcdFx0c3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlci5wYXJzZShjb25maWd1cmF0aW9uQ29udGVudHNba2V5XSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9zdGFuZEFsb25lQ29uZmlndXJhdGlvbnMucHVzaChzdGFuZEFsb25lQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyLmNvbmZpZ3VyYXRpb25Nb2RlbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNvbnNvbGlkYXRlKCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uTW9kZWw7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVDb25maWd1cmF0aW9uKHNldHRpbmdzQ29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkLCBzdGFuZEFsb25lQ29uZmlndXJhdGlvbkNvbnRlbnRzOiBbc3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWRdW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZW50OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiA9IHt9O1xuXHRcdGlmIChzZXR0aW5nc0NvbnRlbnQpIHtcblx0XHRcdGNvbnRlbnRbRk9MREVSX1NFVFRJTkdTX05BTUVdID0gc2V0dGluZ3NDb250ZW50O1xuXHRcdH1cblx0XHRzdGFuZEFsb25lQ29uZmlndXJhdGlvbkNvbnRlbnRzLmZvckVhY2goKFtrZXksIGNvbnRlbnRzXSkgPT4ge1xuXHRcdFx0aWYgKGNvbnRlbnRzKSB7XG5cdFx0XHRcdGNvbnRlbnRba2V5XSA9IGNvbnRlbnRzO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGlmIChPYmplY3Qua2V5cyhjb250ZW50KS5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvbkNhY2hlLndyaXRlKHRoaXMua2V5LCBKU09OLnN0cmluZ2lmeSh7IGNvbnRlbnQgfSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25DYWNoZS5yZW1vdmUodGhpcy5rZXkpO1xuXHRcdH1cblx0fVxuXG5cdGdldFJlc3RyaWN0ZWRTZXR0aW5ncygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZvbGRlclNldHRpbmdzTW9kZWxQYXJzZXIucmVzdHJpY3RlZENvbmZpZ3VyYXRpb25zO1xuXHR9XG5cblx0cmVwYXJzZShjb25maWd1cmF0aW9uUGFyc2VPcHRpb25zOiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHR0aGlzLl9mb2xkZXJTZXR0aW5nc1BhcnNlT3B0aW9ucyA9IGNvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnM7XG5cdFx0dGhpcy5fZm9sZGVyU2V0dGluZ3NNb2RlbFBhcnNlci5yZXBhcnNlKHRoaXMuX2ZvbGRlclNldHRpbmdzUGFyc2VPcHRpb25zKTtcblx0XHR0aGlzLmNvbnNvbGlkYXRlKCk7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvbk1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25zb2xpZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25Nb2RlbCA9IHRoaXMuX2ZvbGRlclNldHRpbmdzTW9kZWxQYXJzZXIuY29uZmlndXJhdGlvbk1vZGVsLm1lcmdlKC4uLnRoaXMuX3N0YW5kQWxvbmVDb25maWd1cmF0aW9ucyk7XG5cdH1cblxuXHRnZXRVbnN1cHBvcnRlZEtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRm9sZGVyQ29uZmlndXJhdGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2U6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBmb2xkZXJDb25maWd1cmF0aW9uOiBDYWNoZWRGb2xkZXJDb25maWd1cmF0aW9uIHwgRmlsZVNlcnZpY2VCYXNlZENvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgc2NvcGVzOiBDb25maWd1cmF0aW9uU2NvcGVbXTtcblx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uRm9sZGVyOiBVUkk7XG5cdHByaXZhdGUgY2FjaGVkRm9sZGVyQ29uZmlndXJhdGlvbjogQ2FjaGVkRm9sZGVyQ29uZmlndXJhdGlvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR1c2VDYWNoZTogYm9vbGVhbixcblx0XHRyZWFkb25seSB3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIsXG5cdFx0Y29uZmlnRm9sZGVyUmVsYXRpdmVQYXRoOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3b3JrYmVuY2hTdGF0ZTogV29ya2JlbmNoU3RhdGUsXG5cdFx0cHJpdmF0ZSB3b3Jrc3BhY2VUcnVzdGVkOiBib29sZWFuLFxuXHRcdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0dXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvbkNhY2hlOiBJQ29uZmlndXJhdGlvbkNhY2hlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnNjb3BlcyA9IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSA9PT0gdGhpcy53b3JrYmVuY2hTdGF0ZSA/IEZPTERFUl9TQ09QRVMgOiBXT1JLU1BBQ0VfU0NPUEVTO1xuXHRcdHRoaXMuY29uZmlndXJhdGlvbkZvbGRlciA9IHVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgod29ya3NwYWNlRm9sZGVyLnVyaSwgY29uZmlnRm9sZGVyUmVsYXRpdmVQYXRoKTtcblx0XHR0aGlzLmNhY2hlZEZvbGRlckNvbmZpZ3VyYXRpb24gPSBuZXcgQ2FjaGVkRm9sZGVyQ29uZmlndXJhdGlvbih3b3Jrc3BhY2VGb2xkZXIudXJpLCBjb25maWdGb2xkZXJSZWxhdGl2ZVBhdGgsIHsgc2NvcGVzOiB0aGlzLnNjb3Blcywgc2tpcFJlc3RyaWN0ZWQ6IHRoaXMuaXNVbnRydXN0ZWQoKSB9LCBjb25maWd1cmF0aW9uQ2FjaGUsIGxvZ1NlcnZpY2UpO1xuXHRcdGlmICh1c2VDYWNoZSAmJiB0aGlzLmNvbmZpZ3VyYXRpb25DYWNoZS5uZWVkc0NhY2hpbmcod29ya3NwYWNlRm9sZGVyLnVyaSkpIHtcblx0XHRcdHRoaXMuZm9sZGVyQ29uZmlndXJhdGlvbiA9IHRoaXMuY2FjaGVkRm9sZGVyQ29uZmlndXJhdGlvbjtcblx0XHRcdHdoZW5Qcm92aWRlclJlZ2lzdGVyZWQod29ya3NwYWNlRm9sZGVyLnVyaSwgZmlsZVNlcnZpY2UpXG5cdFx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmZvbGRlckNvbmZpZ3VyYXRpb24gPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZUZpbGVTZXJ2aWNlQmFzZWRDb25maWd1cmF0aW9uKGZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZvbGRlckNvbmZpZ3VyYXRpb24ub25EaWRDaGFuZ2UoZSA9PiB0aGlzLm9uRGlkRm9sZGVyQ29uZmlndXJhdGlvbkNoYW5nZSgpKSk7XG5cdFx0XHRcdFx0dGhpcy5vbkRpZEZvbGRlckNvbmZpZ3VyYXRpb25DaGFuZ2UoKTtcblx0XHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZm9sZGVyQ29uZmlndXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlRmlsZVNlcnZpY2VCYXNlZENvbmZpZ3VyYXRpb24oZmlsZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgbG9nU2VydmljZSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5mb2xkZXJDb25maWd1cmF0aW9uLm9uRGlkQ2hhbmdlKGUgPT4gdGhpcy5vbkRpZEZvbGRlckNvbmZpZ3VyYXRpb25DaGFuZ2UoKSkpO1xuXHRcdH1cblx0fVxuXG5cdGxvYWRDb25maWd1cmF0aW9uKCk6IFByb21pc2U8Q29uZmlndXJhdGlvbk1vZGVsPiB7XG5cdFx0cmV0dXJuIHRoaXMuZm9sZGVyQ29uZmlndXJhdGlvbi5sb2FkQ29uZmlndXJhdGlvbigpO1xuXHR9XG5cblx0dXBkYXRlV29ya3NwYWNlVHJ1c3QodHJ1c3RlZDogYm9vbGVhbik6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0dGhpcy53b3Jrc3BhY2VUcnVzdGVkID0gdHJ1c3RlZDtcblx0XHRyZXR1cm4gdGhpcy5yZXBhcnNlKCk7XG5cdH1cblxuXHRyZXBhcnNlKCk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbk1vZGVsID0gdGhpcy5mb2xkZXJDb25maWd1cmF0aW9uLnJlcGFyc2UoeyBzY29wZXM6IHRoaXMuc2NvcGVzLCBza2lwUmVzdHJpY3RlZDogdGhpcy5pc1VudHJ1c3RlZCgpIH0pO1xuXHRcdHRoaXMudXBkYXRlQ2FjaGUoKTtcblx0XHRyZXR1cm4gY29uZmlndXJhdGlvbk1vZGVsO1xuXHR9XG5cblx0Z2V0UmVzdHJpY3RlZFNldHRpbmdzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5mb2xkZXJDb25maWd1cmF0aW9uLmdldFJlc3RyaWN0ZWRTZXR0aW5ncygpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1VudHJ1c3RlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMud29ya3NwYWNlVHJ1c3RlZDtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRGb2xkZXJDb25maWd1cmF0aW9uQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlQ2FjaGUoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUZpbGVTZXJ2aWNlQmFzZWRDb25maWd1cmF0aW9uKGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpIHtcblx0XHRjb25zdCBzZXR0aW5nc1Jlc291cmNlID0gdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aCh0aGlzLmNvbmZpZ3VyYXRpb25Gb2xkZXIsIGAke0ZPTERFUl9TRVRUSU5HU19OQU1FfS5qc29uYCk7XG5cdFx0Y29uc3Qgc3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25SZXNvdXJjZXM6IFtzdHJpbmcsIFVSSV1bXSA9IFtUQVNLU19DT05GSUdVUkFUSU9OX0tFWSwgTEFVTkNIX0NPTkZJR1VSQVRJT05fS0VZLCBNQ1BfQ09ORklHVVJBVElPTl9LRVldLm1hcChuYW1lID0+IChbbmFtZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aCh0aGlzLmNvbmZpZ3VyYXRpb25Gb2xkZXIsIGAke25hbWV9Lmpzb25gKV0pKTtcblx0XHRyZXR1cm4gbmV3IEZpbGVTZXJ2aWNlQmFzZWRDb25maWd1cmF0aW9uKHRoaXMuY29uZmlndXJhdGlvbkZvbGRlci50b1N0cmluZygpLCBzZXR0aW5nc1Jlc291cmNlLCBzdGFuZEFsb25lQ29uZmlndXJhdGlvblJlc291cmNlcywgeyBzY29wZXM6IHRoaXMuc2NvcGVzLCBza2lwUmVzdHJpY3RlZDogdGhpcy5pc1VudHJ1c3RlZCgpIH0sIGZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVDYWNoZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uQ2FjaGUubmVlZHNDYWNoaW5nKHRoaXMuY29uZmlndXJhdGlvbkZvbGRlcikgJiYgdGhpcy5mb2xkZXJDb25maWd1cmF0aW9uIGluc3RhbmNlb2YgRmlsZVNlcnZpY2VCYXNlZENvbmZpZ3VyYXRpb24pIHtcblx0XHRcdGNvbnN0IFtzZXR0aW5nc0NvbnRlbnQsIHN0YW5kQWxvbmVDb25maWd1cmF0aW9uQ29udGVudHNdID0gYXdhaXQgdGhpcy5mb2xkZXJDb25maWd1cmF0aW9uLnJlc29sdmVDb250ZW50cygpO1xuXHRcdFx0dGhpcy5jYWNoZWRGb2xkZXJDb25maWd1cmF0aW9uLnVwZGF0ZUNvbmZpZ3VyYXRpb24oc2V0dGluZ3NDb250ZW50LCBzdGFuZEFsb25lQ29uZmlndXJhdGlvbkNvbnRlbnRzKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYWRkUmVsYXRlZChkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLE9BQU8sZUFBZTtBQUMvQixZQUFZLFlBQVk7QUFDeEIsU0FBUyxZQUF5QixTQUFTLGNBQWMsbUJBQW1CLG9CQUFvQix1QkFBdUI7QUFDdkgsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0Qsd0JBQTRDLHFCQUFxQixxQkFBeUM7QUFDbkssU0FBUyxvQkFBb0IsMEJBQXFELG9CQUFvQjtBQUN0RyxTQUFTLG1DQUFtQywwQ0FBMEM7QUFDdEYsU0FBUyx5QkFBeUIsc0JBQXNCLDBCQUFpRSx1QkFBdUIsZUFBZSxrQkFBa0IsNEJBQTRCLG9CQUFvQiw2QkFBNkI7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
