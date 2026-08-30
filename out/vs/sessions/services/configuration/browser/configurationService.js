import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { Promises, Queue } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { parse } from "../../../../base/common/json.js";
import { applyEdits, setProperty } from "../../../../base/common/jsonEdit.js";
import { deepClone, equals } from "../../../../base/common/objects.js";
import { distinct, equals as arrayEquals } from "../../../../base/common/arrays.js";
import { OS, OperatingSystem } from "../../../../base/common/platform.js";
import { ConfigurationTarget, isConfigurationOverrides, isConfigurationUpdateOverrides } from "../../../../platform/configuration/common/configuration.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
import { ConfigurationChangeEvent, ConfigurationModel } from "../../../../platform/configuration/common/configurationModels.js";
import { NullPolicyConfiguration, PolicyConfiguration } from "../../../../platform/configuration/common/configurations.js";
import { Extensions, keyFromOverrideIdentifiers } from "../../../../platform/configuration/common/configurationRegistry.js";
import { FileOperationResult } from "../../../../platform/files/common/files.js";
import { NullPolicyService } from "../../../../platform/policy/common/policy.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { DefaultConfiguration, FolderConfiguration, UserConfiguration, WorkspaceConfiguration } from "../../../../workbench/services/configuration/browser/configuration.js";
import { APPLICATION_SCOPES, APPLY_ALL_PROFILES_SETTING, FOLDER_CONFIG_FOLDER_NAME, FOLDER_SETTINGS_PATH } from "../../../../workbench/services/configuration/common/configuration.js";
import { Configuration } from "../../../../workbench/services/configuration/common/configurationModels.js";
import "../../../../workbench/services/configuration/browser/configurationService.js";
class SessionsDefaultConfiguration extends DefaultConfiguration {
  getDefaultValue(_key, propertySchema) {
    if (propertySchema.agentsWindow && propertySchema.defaultValueSource !== "experiments") {
      return deepClone(propertySchema.agentsWindow.default);
    }
    return super.getDefaultValue(_key, propertySchema);
  }
}
class ConfigurationService extends Disposable {
  constructor(userDataProfileService, workspaceService, uriIdentityService, fileService, policyService, logService, configurationCache, environmentService) {
    super();
    this.workspaceService = workspaceService;
    this.uriIdentityService = uriIdentityService;
    this.fileService = fileService;
    this.logService = logService;
    this.cachedFolderConfigs = this._register(new DisposableMap(new ResourceMap()));
    this.agentsWindowReadOnlyKeys = /* @__PURE__ */ new Set();
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this.onDidChangeRestrictedSettings = Event.None;
    this.restrictedSettings = { default: [] };
    this.configurationRegistry = Registry.as(Extensions.Configuration);
    this.settingsResource = userDataProfileService.currentProfile.settingsResource;
    this.defaultConfiguration = this._register(new SessionsDefaultConfiguration(userDataProfileService.currentProfile.id, configurationCache, environmentService, logService));
    this.policyConfiguration = policyService instanceof NullPolicyService ? new NullPolicyConfiguration() : this._register(new PolicyConfiguration(this.defaultConfiguration, policyService, logService));
    this.initAgentsWindowReadOnlyKeys();
    this.userConfiguration = this._register(new UserConfiguration(userDataProfileService.currentProfile.settingsResource, userDataProfileService.currentProfile.tasksResource, userDataProfileService.currentProfile.mcpResource, { exclude: [...this.agentsWindowReadOnlyKeys] }, fileService, uriIdentityService, logService));
    this.workspaceConfiguration = this._register(new WorkspaceConfiguration({ needsCaching: () => false, read: async () => "", write: async () => {
    }, remove: async () => {
    } }, fileService, uriIdentityService, logService));
    this.configurationEditing = new ConfigurationEditing(fileService, this);
    this._configuration = new Configuration(
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      new ResourceMap(),
      ConfigurationModel.createEmptyModel(logService),
      new ResourceMap(),
      this.workspaceService.getWorkspace(),
      this.logService
    );
    this._register(this.defaultConfiguration.onDidChangeConfiguration(({ defaults, properties }) => this.onDefaultConfigurationChanged(defaults, properties)));
    this._register(this.policyConfiguration.onDidChangeConfiguration((configurationModel) => this.onPolicyConfigurationChanged(configurationModel)));
    this._register(this.userConfiguration.onDidChangeConfiguration((userConfiguration) => this.onUserConfigurationChanged(userConfiguration)));
    this._register(this.workspaceConfiguration.onDidUpdateConfiguration(() => this.onWorkspaceConfigurationChanged()));
    this._register(this.workspaceService.onWillChangeWorkspaceFolders((e) => e.join(this.loadFolderConfigurations(e.changes.added))));
    this._register(this.workspaceService.onDidChangeWorkspaceFolders((e) => this.onWorkspaceFoldersChanged(e)));
  }
  async initialize() {
    const workspace = this.workspaceService.getWorkspace();
    const workspaceIdentifier = { id: workspace.id, configPath: workspace.configuration };
    const [defaultModel, policyModel, userModel] = await Promise.all([
      this.defaultConfiguration.initialize(),
      this.policyConfiguration.initialize(),
      this.userConfiguration.initialize(),
      this.workspaceConfiguration.initialize(workspaceIdentifier, true)
    ]);
    this.workspaceConfiguration.reparseWorkspaceSettings({ exclude: [...this.agentsWindowReadOnlyKeys] });
    this._configuration = new Configuration(
      defaultModel,
      policyModel,
      ConfigurationModel.createEmptyModel(this.logService),
      userModel,
      ConfigurationModel.createEmptyModel(this.logService),
      this.workspaceConfiguration.getConfiguration(),
      new ResourceMap(),
      ConfigurationModel.createEmptyModel(this.logService),
      new ResourceMap(),
      workspace,
      this.logService
    );
    await this.loadFolderConfigurations(workspace.folders);
  }
  // #region IWorkbenchConfigurationService
  getConfigurationData() {
    return this._configuration.toData();
  }
  getValue(arg1, arg2) {
    const section = typeof arg1 === "string" ? arg1 : void 0;
    const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : void 0;
    return this._configuration.getValue(section, overrides);
  }
  async updateValue(key, value, arg3, arg4, _options) {
    const overrides = isConfigurationUpdateOverrides(arg3) ? arg3 : isConfigurationOverrides(arg3) ? { resource: arg3.resource, overrideIdentifiers: arg3.overrideIdentifier ? [arg3.overrideIdentifier] : void 0 } : void 0;
    let target = overrides ? arg4 : arg3;
    if (key === ChatAIDisabledSettingId) {
      target = ConfigurationTarget.WORKSPACE;
    }
    const targets = target ? [target] : [];
    if (overrides?.overrideIdentifiers) {
      overrides.overrideIdentifiers = distinct(overrides.overrideIdentifiers);
      overrides.overrideIdentifiers = overrides.overrideIdentifiers.length ? overrides.overrideIdentifiers : void 0;
    }
    const inspect = this.inspect(key, { resource: overrides?.resource, overrideIdentifier: overrides?.overrideIdentifiers ? overrides.overrideIdentifiers[0] : void 0 });
    if (inspect.policyValue !== void 0) {
      throw new Error(`Unable to write ${key} because it is configured in system policy.`);
    }
    if (this.agentsWindowReadOnlyKeys.has(key)) {
      throw new Error(`Unable to write ${key} because it is read-only in the Agents window.`);
    }
    if (!targets.length) {
      targets.push(...this.deriveConfigurationTargets(key, value, inspect));
      if (equals(value, inspect.defaultValue) && targets.length === 1 && targets[0] === ConfigurationTarget.USER) {
        value = void 0;
      }
    }
    if (overrides?.overrideIdentifiers?.length && overrides.overrideIdentifiers.length > 1) {
      const overrideIdentifiers = overrides.overrideIdentifiers.sort();
      const existingOverrides = this._configuration.localUserConfiguration.overrides.find((override) => arrayEquals([...override.identifiers].sort(), overrideIdentifiers));
      if (existingOverrides) {
        overrides.overrideIdentifiers = existingOverrides.identifiers;
      }
    }
    await Promises.settled(targets.map((t) => this.writeConfigurationValue(key, value, t, overrides)));
  }
  async writeConfigurationValue(key, value, target, overrides) {
    let path = overrides?.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key];
    const settingsResource = this.getSettingsResource(target, overrides?.resource ?? void 0);
    if (this.isWorkspaceConfigurationResource(settingsResource)) {
      path = ["settings", ...path];
    }
    await this.configurationEditing.write(settingsResource, path, value);
    await this.reloadConfiguration();
  }
  deriveConfigurationTargets(_key, value, inspect) {
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
    if (inspect.userValue !== void 0) {
      definedTargets.push(ConfigurationTarget.USER);
    }
    if (value === void 0) {
      return definedTargets;
    }
    return [definedTargets[0] || ConfigurationTarget.USER];
  }
  isWorkspaceConfigurationResource(resource) {
    const workspace = this.workspaceService.getWorkspace();
    return !!(workspace.configuration && this.uriIdentityService.extUri.isEqual(workspace.configuration, resource));
  }
  getSettingsResource(target, resource) {
    if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
      if (resource) {
        const folder = this.workspaceService.getWorkspaceFolder(resource);
        if (folder) {
          return this.uriIdentityService.extUri.joinPath(folder.uri, FOLDER_SETTINGS_PATH);
        }
      }
    }
    if (target === ConfigurationTarget.WORKSPACE) {
      const workspace = this.workspaceService.getWorkspace();
      if (workspace.configuration) {
        return workspace.configuration;
      }
    }
    return this.settingsResource;
  }
  inspect(key, overrides) {
    return this._configuration.inspect(key, overrides);
  }
  keys() {
    return this._configuration.keys();
  }
  async reloadConfiguration(_target) {
    this.reloadDefaultConfiguration();
    if (_target === ConfigurationTarget.DEFAULT) {
      return;
    }
    const userModel = await this.userConfiguration.initialize();
    const previousData = this._configuration.toData();
    const change = this._configuration.compareAndUpdateLocalUserConfiguration(userModel);
    const workspaceChange = await this.loadWorkspaceConfiguration();
    change.keys.push(...workspaceChange.keys);
    change.overrides.push(...workspaceChange.overrides);
    for (const folder of this.workspaceService.getWorkspace().folders) {
      const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
      if (folderConfiguration) {
        const folderModel = await folderConfiguration.loadConfiguration();
        const folderChange = this._configuration.compareAndUpdateFolderConfiguration(folder.uri, folderModel);
        change.keys.push(...folderChange.keys);
        change.overrides.push(...folderChange.overrides);
      }
    }
    this.triggerConfigurationChange(change, previousData, ConfigurationTarget.USER);
  }
  reloadDefaultConfiguration() {
    this.onDefaultConfigurationChanged(this.defaultConfiguration.reload());
  }
  hasCachedConfigurationDefaultsOverrides() {
    return this.defaultConfiguration.hasCachedConfigurationDefaultsOverrides();
  }
  async whenRemoteConfigurationLoaded() {
  }
  isSettingAppliedForAllProfiles(key) {
    const scope = this.configurationRegistry.getConfigurationProperties()[key]?.scope;
    if (scope && APPLICATION_SCOPES.includes(scope)) {
      return true;
    }
    const allProfilesSettings = this.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
    return Array.isArray(allProfilesSettings) && allProfilesSettings.includes(key);
  }
  // #endregion
  initAgentsWindowReadOnlyKeys() {
    const properties = this.configurationRegistry.getConfigurationProperties();
    for (const key in properties) {
      if (properties[key].agentsWindow?.readOnly) {
        this.agentsWindowReadOnlyKeys.add(key);
      }
    }
  }
  updateAgentsWindowReadOnlyKeys(changedProperties) {
    const properties = this.configurationRegistry.getConfigurationProperties();
    for (const key of changedProperties) {
      if (properties[key]?.agentsWindow?.readOnly) {
        this.agentsWindowReadOnlyKeys.add(key);
      } else {
        this.agentsWindowReadOnlyKeys.delete(key);
      }
    }
  }
  // #region Configuration change handlers
  onDefaultConfigurationChanged(defaults, properties) {
    if (properties) {
      this.updateAgentsWindowReadOnlyKeys(properties);
    }
    const previousData = this._configuration.toData();
    const change = this._configuration.compareAndUpdateDefaultConfiguration(defaults, properties);
    this._configuration.updateLocalUserConfiguration(this.userConfiguration.reparse({ exclude: [...this.agentsWindowReadOnlyKeys] }));
    this._configuration.updateWorkspaceConfiguration(this.workspaceConfiguration.reparseWorkspaceSettings({ exclude: [...this.agentsWindowReadOnlyKeys] }));
    for (const folder of this.workspaceService.getWorkspace().folders) {
      const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
      if (folderConfiguration) {
        this._configuration.updateFolderConfiguration(folder.uri, folderConfiguration.reparse());
      }
    }
    this.triggerConfigurationChange(change, previousData, ConfigurationTarget.DEFAULT);
  }
  onPolicyConfigurationChanged(policyConfiguration) {
    const previousData = this._configuration.toData();
    const change = this._configuration.compareAndUpdatePolicyConfiguration(policyConfiguration);
    this.triggerConfigurationChange(change, previousData, ConfigurationTarget.DEFAULT);
  }
  onUserConfigurationChanged(userConfiguration) {
    const previousData = this._configuration.toData();
    const change = this._configuration.compareAndUpdateLocalUserConfiguration(userConfiguration);
    this.triggerConfigurationChange(change, previousData, ConfigurationTarget.USER);
  }
  async onWorkspaceConfigurationChanged() {
    const previousData = this._configuration.toData();
    const change = await this.loadWorkspaceConfiguration();
    this.triggerConfigurationChange(change, previousData, ConfigurationTarget.WORKSPACE);
  }
  async loadWorkspaceConfiguration() {
    await this.workspaceConfiguration.reload();
    this.workspaceConfiguration.reparseWorkspaceSettings({ exclude: [...this.agentsWindowReadOnlyKeys] });
    return this._configuration.compareAndUpdateWorkspaceConfiguration(this.workspaceConfiguration.getConfiguration());
  }
  onWorkspaceFoldersChanged(e) {
    const previousData = this._configuration.toData();
    const keys = [];
    const overrides = [];
    for (const folder of e.removed) {
      const change = this._configuration.compareAndDeleteFolderConfiguration(folder.uri);
      keys.push(...change.keys);
      overrides.push(...change.overrides);
      this.cachedFolderConfigs.deleteAndDispose(folder.uri);
    }
    if (keys.length || overrides.length) {
      this.triggerConfigurationChange({ keys, overrides }, previousData, ConfigurationTarget.WORKSPACE_FOLDER);
    }
  }
  onWorkspaceFolderConfigurationChanged(folder) {
    const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
    if (folderConfiguration) {
      folderConfiguration.loadConfiguration().then((configurationModel) => {
        const previousData = this._configuration.toData();
        const change = this._configuration.compareAndUpdateFolderConfiguration(folder.uri, configurationModel);
        this.triggerConfigurationChange(change, previousData, ConfigurationTarget.WORKSPACE_FOLDER);
      }, onUnexpectedError);
    }
  }
  async loadFolderConfigurations(folders) {
    for (const folder of folders) {
      let folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
      if (!folderConfiguration) {
        folderConfiguration = new FolderConfiguration(false, folder, FOLDER_CONFIG_FOLDER_NAME, WorkbenchState.WORKSPACE, true, this.fileService, this.uriIdentityService, this.logService, { needsCaching: () => false, read: async () => "", write: async () => {
        }, remove: async () => {
        } });
        folderConfiguration.addRelated(folderConfiguration.onDidChange(() => this.onWorkspaceFolderConfigurationChanged(folder)));
        this.cachedFolderConfigs.set(folder.uri, folderConfiguration);
      }
      const configurationModel = await folderConfiguration.loadConfiguration();
      this._configuration.updateFolderConfiguration(folder.uri, configurationModel);
    }
  }
  triggerConfigurationChange(change, previousData, target) {
    if (change.keys.length) {
      const workspace = this.workspaceService.getWorkspace();
      const event = new ConfigurationChangeEvent(change, { data: previousData, workspace }, this._configuration, workspace, this.logService);
      event.source = target;
      this._onDidChangeConfiguration.fire(event);
    }
  }
  // #endregion
}
class ConfigurationEditing {
  constructor(fileService, configurationService) {
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.queue = new Queue();
  }
  write(settingsResource, path, value) {
    return this.queue.queue(() => this.doWriteConfiguration(settingsResource, path, value));
  }
  async doWriteConfiguration(settingsResource, path, value) {
    let content;
    try {
      const fileContent = await this.fileService.readFile(settingsResource);
      content = fileContent.value.toString();
    } catch (error) {
      if (error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
        content = "{}";
      } else {
        throw error;
      }
    }
    const parseErrors = [];
    parse(content, parseErrors, { allowTrailingComma: true, allowEmptyContent: true });
    if (parseErrors.length > 0) {
      throw new Error("Unable to write into the settings file. Please open the file to correct errors/warnings in the file and try again.");
    }
    const edits = this.getEdits(content, path, value);
    content = applyEdits(content, edits);
    await this.fileService.writeFile(settingsResource, VSBuffer.fromString(content));
  }
  getEdits(content, path, value) {
    const { tabSize, insertSpaces, eol } = this.formattingOptions;
    if (!path.length) {
      const newContent = JSON.stringify(value, null, insertSpaces ? " ".repeat(tabSize) : "	");
      return [{
        content: newContent,
        length: content.length,
        offset: 0
      }];
    }
    return setProperty(content, path, value, { tabSize, insertSpaces, eol });
  }
  get formattingOptions() {
    if (!this._formattingOptions) {
      let eol = OS === OperatingSystem.Linux || OS === OperatingSystem.Macintosh ? "\n" : "\r\n";
      const configuredEol = this.configurationService.getValue("files.eol", { overrideIdentifier: "jsonc" });
      if (configuredEol && typeof configuredEol === "string" && configuredEol !== "auto") {
        eol = configuredEol;
      }
      this._formattingOptions = {
        eol,
        insertSpaces: !!this.configurationService.getValue("editor.insertSpaces", { overrideIdentifier: "jsonc" }),
        tabSize: this.configurationService.getValue("editor.tabSize", { overrideIdentifier: "jsonc" })
      };
    }
    return this._formattingOptions;
  }
}
export {
  ConfigurationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcc2VydmljZXNcXGNvbmZpZ3VyYXRpb25cXGJyb3dzZXJcXGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgUXVldWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBKU09OUGF0aCwgUGFyc2VFcnJvciwgcGFyc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IGFwcGx5RWRpdHMsIHNldFByb3BlcnR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkVkaXQuanMnO1xuaW1wb3J0IHsgRWRpdCwgRm9ybWF0dGluZ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uRm9ybWF0dGVyLmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSwgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdCwgZXF1YWxzIGFzIGFycmF5RXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IE9TLCBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbkNoYW5nZSwgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSUNvbmZpZ3VyYXRpb25EYXRhLCBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcywgSUNvbmZpZ3VyYXRpb25VcGRhdGVPcHRpb25zLCBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcywgSUNvbmZpZ3VyYXRpb25WYWx1ZSwgQ29uZmlndXJhdGlvblRhcmdldCwgaXNDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCBpc0NvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRBSURpc2FibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2hhdC9jb21tb24vY2hhdFNldHRpbmdzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgQ29uZmlndXJhdGlvbk1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbk1vZGVscy5qcyc7XG5pbXBvcnQgeyBJUG9saWN5Q29uZmlndXJhdGlvbiwgTnVsbFBvbGljeUNvbmZpZ3VyYXRpb24sIFBvbGljeUNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwga2V5RnJvbU92ZXJyaWRlSWRlbnRpZmllcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUG9saWN5U2VydmljZSwgTnVsbFBvbGljeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL3BvbGljeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudCwgSVdvcmtzcGFjZUZvbGRlciwgV29ya2JlbmNoU3RhdGUsIFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IERlZmF1bHRDb25maWd1cmF0aW9uLCBGb2xkZXJDb25maWd1cmF0aW9uLCBVc2VyQ29uZmlndXJhdGlvbiwgV29ya3NwYWNlQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2Jyb3dzZXIvY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBUFBMSUNBVElPTl9TQ09QRVMsIEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HLCBGT0xERVJfQ09ORklHX0ZPTERFUl9OQU1FLCBGT0xERVJfU0VUVElOR1NfUEFUSCwgSUNvbmZpZ3VyYXRpb25DYWNoZSwgSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBSZXN0cmljdGVkU2V0dGluZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25Nb2RlbHMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuXG4vLyBJbXBvcnQgdG8gcmVnaXN0ZXIgY29uZmlndXJhdGlvbiBjb250cmlidXRpb25zXG5pbXBvcnQgJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2Jyb3dzZXIvY29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuXG5jbGFzcyBTZXNzaW9uc0RlZmF1bHRDb25maWd1cmF0aW9uIGV4dGVuZHMgRGVmYXVsdENvbmZpZ3VyYXRpb24ge1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXREZWZhdWx0VmFsdWUoX2tleTogc3RyaW5nLCBwcm9wZXJ0eVNjaGVtYTogSVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEpOiB1bmtub3duIHtcblx0XHRpZiAocHJvcGVydHlTY2hlbWEuYWdlbnRzV2luZG93ICYmIHByb3BlcnR5U2NoZW1hLmRlZmF1bHRWYWx1ZVNvdXJjZSAhPT0gJ2V4cGVyaW1lbnRzJykge1xuXHRcdFx0cmV0dXJuIGRlZXBDbG9uZShwcm9wZXJ0eVNjaGVtYS5hZ2VudHNXaW5kb3cuZGVmYXVsdCk7XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5nZXREZWZhdWx0VmFsdWUoX2tleSwgcHJvcGVydHlTY2hlbWEpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZ3VyYXRpb25TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfY29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0Q29uZmlndXJhdGlvbjogRGVmYXVsdENvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgcG9saWN5Q29uZmlndXJhdGlvbjogSVBvbGljeUNvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgdXNlckNvbmZpZ3VyYXRpb246IFVzZXJDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbmZpZ3VyYXRpb246IFdvcmtzcGFjZUNvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgY2FjaGVkRm9sZGVyQ29uZmlncyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPFVSSSwgRm9sZGVyQ29uZmlndXJhdGlvbj4obmV3IFJlc291cmNlTWFwKCkpKTtcblx0cHJpdmF0ZSByZWFkb25seSBhZ2VudHNXaW5kb3dSZWFkT25seUtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLmV2ZW50O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVzdHJpY3RlZFNldHRpbmdzID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgcmVzdHJpY3RlZFNldHRpbmdzOiBSZXN0cmljdGVkU2V0dGluZ3MgPSB7IGRlZmF1bHQ6IFtdIH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2V0dGluZ3NSZXNvdXJjZTogVVJJO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25FZGl0aW5nOiBDb25maWd1cmF0aW9uRWRpdGluZztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0cG9saWN5U2VydmljZTogSVBvbGljeVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRjb25maWd1cmF0aW9uQ2FjaGU6IElDb25maWd1cmF0aW9uQ2FjaGUsXG5cdFx0ZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuc2V0dGluZ3NSZXNvdXJjZSA9IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZTtcblx0XHR0aGlzLmRlZmF1bHRDb25maWd1cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNlc3Npb25zRGVmYXVsdENvbmZpZ3VyYXRpb24odXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pZCwgY29uZmlndXJhdGlvbkNhY2hlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLnBvbGljeUNvbmZpZ3VyYXRpb24gPSBwb2xpY3lTZXJ2aWNlIGluc3RhbmNlb2YgTnVsbFBvbGljeVNlcnZpY2UgPyBuZXcgTnVsbFBvbGljeUNvbmZpZ3VyYXRpb24oKSA6IHRoaXMuX3JlZ2lzdGVyKG5ldyBQb2xpY3lDb25maWd1cmF0aW9uKHRoaXMuZGVmYXVsdENvbmZpZ3VyYXRpb24sIHBvbGljeVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLmluaXRBZ2VudHNXaW5kb3dSZWFkT25seUtleXMoKTtcblx0XHR0aGlzLnVzZXJDb25maWd1cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IFVzZXJDb25maWd1cmF0aW9uKHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSwgdXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS50YXNrc1Jlc291cmNlLCB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm1jcFJlc291cmNlLCB7IGV4Y2x1ZGU6IFsuLi50aGlzLmFnZW50c1dpbmRvd1JlYWRPbmx5S2V5c10gfSwgZmlsZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgbG9nU2VydmljZSkpO1xuXHRcdHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBXb3Jrc3BhY2VDb25maWd1cmF0aW9uKHsgbmVlZHNDYWNoaW5nOiAoKSA9PiBmYWxzZSwgcmVhZDogYXN5bmMgKCkgPT4gJycsIHdyaXRlOiBhc3luYyAoKSA9PiB7IH0sIHJlbW92ZTogYXN5bmMgKCkgPT4geyB9IH0sIGZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25FZGl0aW5nID0gbmV3IENvbmZpZ3VyYXRpb25FZGl0aW5nKGZpbGVTZXJ2aWNlLCB0aGlzKTtcblxuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24gPSBuZXcgQ29uZmlndXJhdGlvbihcblx0XHRcdENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLFxuXHRcdFx0Q29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSksXG5cdFx0XHRDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChsb2dTZXJ2aWNlKSxcblx0XHRcdENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLFxuXHRcdFx0Q29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSksXG5cdFx0XHRDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChsb2dTZXJ2aWNlKSxcblx0XHRcdG5ldyBSZXNvdXJjZU1hcCgpLFxuXHRcdFx0Q29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSksXG5cdFx0XHRuZXcgUmVzb3VyY2VNYXA8Q29uZmlndXJhdGlvbk1vZGVsPigpLFxuXHRcdFx0dGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpIGFzIFdvcmtzcGFjZSxcblx0XHRcdHRoaXMubG9nU2VydmljZVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlZmF1bHRDb25maWd1cmF0aW9uLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoeyBkZWZhdWx0cywgcHJvcGVydGllcyB9KSA9PiB0aGlzLm9uRGVmYXVsdENvbmZpZ3VyYXRpb25DaGFuZ2VkKGRlZmF1bHRzLCBwcm9wZXJ0aWVzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucG9saWN5Q29uZmlndXJhdGlvbi5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbk1vZGVsID0+IHRoaXMub25Qb2xpY3lDb25maWd1cmF0aW9uQ2hhbmdlZChjb25maWd1cmF0aW9uTW9kZWwpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyQ29uZmlndXJhdGlvbi5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24odXNlckNvbmZpZ3VyYXRpb24gPT4gdGhpcy5vblVzZXJDb25maWd1cmF0aW9uQ2hhbmdlZCh1c2VyQ29uZmlndXJhdGlvbikpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24ub25EaWRVcGRhdGVDb25maWd1cmF0aW9uKCgpID0+IHRoaXMub25Xb3Jrc3BhY2VDb25maWd1cmF0aW9uQ2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLm9uV2lsbENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoZSA9PiBlLmpvaW4odGhpcy5sb2FkRm9sZGVyQ29uZmlndXJhdGlvbnMoZS5jaGFuZ2VzLmFkZGVkKSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZVNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKGUgPT4gdGhpcy5vbldvcmtzcGFjZUZvbGRlcnNDaGFuZ2VkKGUpKSk7XG5cdH1cblxuXHRhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKSBhcyBXb3Jrc3BhY2U7XG5cdFx0Y29uc3Qgd29ya3NwYWNlSWRlbnRpZmllciA9IHsgaWQ6IHdvcmtzcGFjZS5pZCwgY29uZmlnUGF0aDogd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24hIH07XG5cdFx0Y29uc3QgW2RlZmF1bHRNb2RlbCwgcG9saWN5TW9kZWwsIHVzZXJNb2RlbF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLmRlZmF1bHRDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKSxcblx0XHRcdHRoaXMucG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCksXG5cdFx0XHR0aGlzLnVzZXJDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKSxcblx0XHRcdHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5pbml0aWFsaXplKHdvcmtzcGFjZUlkZW50aWZpZXIsIHRydWUpLFxuXHRcdF0pO1xuXHRcdHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5yZXBhcnNlV29ya3NwYWNlU2V0dGluZ3MoeyBleGNsdWRlOiBbLi4udGhpcy5hZ2VudHNXaW5kb3dSZWFkT25seUtleXNdIH0pO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24gPSBuZXcgQ29uZmlndXJhdGlvbihcblx0XHRcdGRlZmF1bHRNb2RlbCxcblx0XHRcdHBvbGljeU1vZGVsLFxuXHRcdFx0Q29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwodGhpcy5sb2dTZXJ2aWNlKSxcblx0XHRcdHVzZXJNb2RlbCxcblx0XHRcdENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKHRoaXMubG9nU2VydmljZSksXG5cdFx0XHR0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24uZ2V0Q29uZmlndXJhdGlvbigpLFxuXHRcdFx0bmV3IFJlc291cmNlTWFwKCksXG5cdFx0XHRDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbCh0aGlzLmxvZ1NlcnZpY2UpLFxuXHRcdFx0bmV3IFJlc291cmNlTWFwPENvbmZpZ3VyYXRpb25Nb2RlbD4oKSxcblx0XHRcdHdvcmtzcGFjZSxcblx0XHRcdHRoaXMubG9nU2VydmljZVxuXHRcdCk7XG5cdFx0YXdhaXQgdGhpcy5sb2FkRm9sZGVyQ29uZmlndXJhdGlvbnMod29ya3NwYWNlLmZvbGRlcnMpO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2VcblxuXHRnZXRDb25maWd1cmF0aW9uRGF0YSgpOiBJQ29uZmlndXJhdGlvbkRhdGEge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uLnRvRGF0YSgpO1xuXHR9XG5cblx0Z2V0VmFsdWU8VD4oKTogVDtcblx0Z2V0VmFsdWU8VD4oc2VjdGlvbjogc3RyaW5nKTogVDtcblx0Z2V0VmFsdWU8VD4ob3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyk6IFQ7XG5cdGdldFZhbHVlPFQ+KHNlY3Rpb246IHN0cmluZywgb3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyk6IFQ7XG5cdGdldFZhbHVlKGFyZzE/OiB1bmtub3duLCBhcmcyPzogdW5rbm93bik6IHVua25vd24ge1xuXHRcdGNvbnN0IHNlY3Rpb24gPSB0eXBlb2YgYXJnMSA9PT0gJ3N0cmluZycgPyBhcmcxIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG92ZXJyaWRlcyA9IGlzQ29uZmlndXJhdGlvbk92ZXJyaWRlcyhhcmcxKSA/IGFyZzEgOiBpc0NvbmZpZ3VyYXRpb25PdmVycmlkZXMoYXJnMikgPyBhcmcyIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uLmdldFZhbHVlKHNlY3Rpb24sIG92ZXJyaWRlcyk7XG5cdH1cblxuXHR1cGRhdGVWYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+O1xuXHR1cGRhdGVWYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMgfCBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcyk6IFByb21pc2U8dm9pZD47XG5cdHVwZGF0ZVZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogUHJvbWlzZTx2b2lkPjtcblx0dXBkYXRlVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBvdmVycmlkZXM6IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzIHwgSUNvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMsIHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCwgb3B0aW9ucz86IElDb25maWd1cmF0aW9uVXBkYXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cdGFzeW5jIHVwZGF0ZVZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgYXJnMz86IHVua25vd24sIGFyZzQ/OiB1bmtub3duLCBfb3B0aW9ucz86IElDb25maWd1cmF0aW9uVXBkYXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMgfCB1bmRlZmluZWQgPSBpc0NvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMoYXJnMykgPyBhcmczXG5cdFx0XHQ6IGlzQ29uZmlndXJhdGlvbk92ZXJyaWRlcyhhcmczKSA/IHsgcmVzb3VyY2U6IGFyZzMucmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcnM6IGFyZzMub3ZlcnJpZGVJZGVudGlmaWVyID8gW2FyZzMub3ZlcnJpZGVJZGVudGlmaWVyXSA6IHVuZGVmaW5lZCB9IDogdW5kZWZpbmVkO1xuXHRcdGxldCB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQgfCB1bmRlZmluZWQgPSAob3ZlcnJpZGVzID8gYXJnNCA6IGFyZzMpIGFzIENvbmZpZ3VyYXRpb25UYXJnZXQgfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBBbHdheXMgdXBkYXRlIGNoYXQuZGlzYWJsZUFJRmVhdHVyZXMgYXQgd29ya3NwYWNlIHNjb3BlIGluIHRoZSBhZ2VudHMgd2luZG93XG5cdFx0aWYgKGtleSA9PT0gQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpIHtcblx0XHRcdHRhcmdldCA9IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldHM6IENvbmZpZ3VyYXRpb25UYXJnZXRbXSA9IHRhcmdldCA/IFt0YXJnZXRdIDogW107XG5cblx0XHRpZiAob3ZlcnJpZGVzPy5vdmVycmlkZUlkZW50aWZpZXJzKSB7XG5cdFx0XHRvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycyA9IGRpc3RpbmN0KG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzKTtcblx0XHRcdG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzID0gb3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcnMubGVuZ3RoID8gb3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcnMgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zcGVjdCA9IHRoaXMuaW5zcGVjdChrZXksIHsgcmVzb3VyY2U6IG92ZXJyaWRlcz8ucmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogb3ZlcnJpZGVzPy5vdmVycmlkZUlkZW50aWZpZXJzID8gb3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcnNbMF0gOiB1bmRlZmluZWQgfSk7XG5cdFx0aWYgKGluc3BlY3QucG9saWN5VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gd3JpdGUgJHtrZXl9IGJlY2F1c2UgaXQgaXMgY29uZmlndXJlZCBpbiBzeXN0ZW0gcG9saWN5LmApO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmFnZW50c1dpbmRvd1JlYWRPbmx5S2V5cy5oYXMoa2V5KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gd3JpdGUgJHtrZXl9IGJlY2F1c2UgaXQgaXMgcmVhZC1vbmx5IGluIHRoZSBBZ2VudHMgd2luZG93LmApO1xuXHRcdH1cblxuXHRcdGlmICghdGFyZ2V0cy5sZW5ndGgpIHtcblx0XHRcdHRhcmdldHMucHVzaCguLi50aGlzLmRlcml2ZUNvbmZpZ3VyYXRpb25UYXJnZXRzKGtleSwgdmFsdWUsIGluc3BlY3QpKTtcblxuXHRcdFx0Ly8gUmVtb3ZlIHRoZSBzZXR0aW5nLCBpZiB0aGUgdmFsdWUgaXMgc2FtZSBhcyBkZWZhdWx0IHZhbHVlIGFuZCBpcyB1cGRhdGVkIG9ubHkgaW4gdXNlciB0YXJnZXRcblx0XHRcdGlmIChlcXVhbHModmFsdWUsIGluc3BlY3QuZGVmYXVsdFZhbHVlKSAmJiB0YXJnZXRzLmxlbmd0aCA9PT0gMSAmJiB0YXJnZXRzWzBdID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpIHtcblx0XHRcdFx0dmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG92ZXJyaWRlcz8ub3ZlcnJpZGVJZGVudGlmaWVycz8ubGVuZ3RoICYmIG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzLmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IG92ZXJyaWRlSWRlbnRpZmllcnMgPSBvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycy5zb3J0KCk7XG5cdFx0XHRjb25zdCBleGlzdGluZ092ZXJyaWRlcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24ubG9jYWxVc2VyQ29uZmlndXJhdGlvbi5vdmVycmlkZXMuZmluZChvdmVycmlkZSA9PiBhcnJheUVxdWFscyhbLi4ub3ZlcnJpZGUuaWRlbnRpZmllcnNdLnNvcnQoKSwgb3ZlcnJpZGVJZGVudGlmaWVycykpO1xuXHRcdFx0aWYgKGV4aXN0aW5nT3ZlcnJpZGVzKSB7XG5cdFx0XHRcdG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzID0gZXhpc3RpbmdPdmVycmlkZXMuaWRlbnRpZmllcnM7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZCh0YXJnZXRzLm1hcCh0ID0+IHRoaXMud3JpdGVDb25maWd1cmF0aW9uVmFsdWUoa2V5LCB2YWx1ZSwgdCwgb3ZlcnJpZGVzKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3cml0ZUNvbmZpZ3VyYXRpb25WYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCwgb3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBwYXRoID0gb3ZlcnJpZGVzPy5vdmVycmlkZUlkZW50aWZpZXJzPy5sZW5ndGggPyBba2V5RnJvbU92ZXJyaWRlSWRlbnRpZmllcnMob3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcnMpLCBrZXldIDogW2tleV07XG5cblx0XHRjb25zdCBzZXR0aW5nc1Jlc291cmNlID0gdGhpcy5nZXRTZXR0aW5nc1Jlc291cmNlKHRhcmdldCwgb3ZlcnJpZGVzPy5yZXNvdXJjZSA/PyB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gV2hlbiB3cml0aW5nIHRvIHRoZSB3b3Jrc3BhY2UgY29uZmlndXJhdGlvbiBmaWxlLCBzZXR0aW5ncyBnbyB1bmRlciB0aGUgXCJzZXR0aW5nc1wiIGtleVxuXHRcdGlmICh0aGlzLmlzV29ya3NwYWNlQ29uZmlndXJhdGlvblJlc291cmNlKHNldHRpbmdzUmVzb3VyY2UpKSB7XG5cdFx0XHRwYXRoID0gWydzZXR0aW5ncycsIC4uLnBhdGhdO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvbkVkaXRpbmcud3JpdGUoc2V0dGluZ3NSZXNvdXJjZSwgcGF0aCwgdmFsdWUpO1xuXHRcdGF3YWl0IHRoaXMucmVsb2FkQ29uZmlndXJhdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBkZXJpdmVDb25maWd1cmF0aW9uVGFyZ2V0cyhfa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBpbnNwZWN0OiBJQ29uZmlndXJhdGlvblZhbHVlPHVua25vd24+KTogQ29uZmlndXJhdGlvblRhcmdldFtdIHtcblx0XHRpZiAoZXF1YWxzKHZhbHVlLCBpbnNwZWN0LnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmluZWRUYXJnZXRzOiBDb25maWd1cmF0aW9uVGFyZ2V0W10gPSBbXTtcblx0XHRpZiAoaW5zcGVjdC53b3Jrc3BhY2VGb2xkZXJWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRkZWZpbmVkVGFyZ2V0cy5wdXNoKENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUik7XG5cdFx0fVxuXHRcdGlmIChpbnNwZWN0LndvcmtzcGFjZVZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGRlZmluZWRUYXJnZXRzLnB1c2goQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpO1xuXHRcdH1cblx0XHRpZiAoaW5zcGVjdC51c2VyVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZGVmaW5lZFRhcmdldHMucHVzaChDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdH1cblxuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBSZW1vdmUgdGhlIHNldHRpbmcgaW4gYWxsIGRlZmluZWQgdGFyZ2V0c1xuXHRcdFx0cmV0dXJuIGRlZmluZWRUYXJnZXRzO1xuXHRcdH1cblxuXHRcdHJldHVybiBbZGVmaW5lZFRhcmdldHNbMF0gfHwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSXTtcblx0fVxuXG5cdHByaXZhdGUgaXNXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRyZXR1cm4gISEod29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwod29ya3NwYWNlLmNvbmZpZ3VyYXRpb24sIHJlc291cmNlKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNldHRpbmdzUmVzb3VyY2UodGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0IHwgdW5kZWZpbmVkLCByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogVVJJIHtcblx0XHRpZiAodGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpIHtcblx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRjb25zdCBmb2xkZXIgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlKTtcblx0XHRcdFx0aWYgKGZvbGRlcikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgoZm9sZGVyLnVyaSwgRk9MREVSX1NFVFRJTkdTX1BBVEgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0XHRpZiAod29ya3NwYWNlLmNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIHdvcmtzcGFjZS5jb25maWd1cmF0aW9uO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5zZXR0aW5nc1Jlc291cmNlO1xuXHR9XG5cblx0aW5zcGVjdDxUPihrZXk6IHN0cmluZywgb3ZlcnJpZGVzPzogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBJQ29uZmlndXJhdGlvblZhbHVlPFQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi5pbnNwZWN0PFQ+KGtleSwgb3ZlcnJpZGVzKTtcblx0fVxuXG5cdGtleXMoKTogeyBkZWZhdWx0OiBzdHJpbmdbXTsgcG9saWN5OiBzdHJpbmdbXTsgdXNlcjogc3RyaW5nW107IHdvcmtzcGFjZTogc3RyaW5nW107IHdvcmtzcGFjZUZvbGRlcjogc3RyaW5nW10gfSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24ua2V5cygpO1xuXHR9XG5cblx0YXN5bmMgcmVsb2FkQ29uZmlndXJhdGlvbihfdGFyZ2V0PzogQ29uZmlndXJhdGlvblRhcmdldCB8IElXb3Jrc3BhY2VGb2xkZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnJlbG9hZERlZmF1bHRDb25maWd1cmF0aW9uKCk7XG5cdFx0aWYgKF90YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVzZXJNb2RlbCA9IGF3YWl0IHRoaXMudXNlckNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IHByZXZpb3VzRGF0YSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCk7XG5cdFx0Y29uc3QgY2hhbmdlID0gdGhpcy5fY29uZmlndXJhdGlvbi5jb21wYXJlQW5kVXBkYXRlTG9jYWxVc2VyQ29uZmlndXJhdGlvbih1c2VyTW9kZWwpO1xuXG5cdFx0Ly8gUmVsb2FkIHdvcmtzcGFjZSBjb25maWd1cmF0aW9uXG5cdFx0Y29uc3Qgd29ya3NwYWNlQ2hhbmdlID0gYXdhaXQgdGhpcy5sb2FkV29ya3NwYWNlQ29uZmlndXJhdGlvbigpO1xuXHRcdGNoYW5nZS5rZXlzLnB1c2goLi4ud29ya3NwYWNlQ2hhbmdlLmtleXMpO1xuXHRcdGNoYW5nZS5vdmVycmlkZXMucHVzaCguLi53b3Jrc3BhY2VDaGFuZ2Uub3ZlcnJpZGVzKTtcblxuXHRcdC8vIFJlbG9hZCBmb2xkZXIgY29uZmlndXJhdGlvbnNcblx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycykge1xuXHRcdFx0Y29uc3QgZm9sZGVyQ29uZmlndXJhdGlvbiA9IHRoaXMuY2FjaGVkRm9sZGVyQ29uZmlncy5nZXQoZm9sZGVyLnVyaSk7XG5cdFx0XHRpZiAoZm9sZGVyQ29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRjb25zdCBmb2xkZXJNb2RlbCA9IGF3YWl0IGZvbGRlckNvbmZpZ3VyYXRpb24ubG9hZENvbmZpZ3VyYXRpb24oKTtcblx0XHRcdFx0Y29uc3QgZm9sZGVyQ2hhbmdlID0gdGhpcy5fY29uZmlndXJhdGlvbi5jb21wYXJlQW5kVXBkYXRlRm9sZGVyQ29uZmlndXJhdGlvbihmb2xkZXIudXJpLCBmb2xkZXJNb2RlbCk7XG5cdFx0XHRcdGNoYW5nZS5rZXlzLnB1c2goLi4uZm9sZGVyQ2hhbmdlLmtleXMpO1xuXHRcdFx0XHRjaGFuZ2Uub3ZlcnJpZGVzLnB1c2goLi4uZm9sZGVyQ2hhbmdlLm92ZXJyaWRlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy50cmlnZ2VyQ29uZmlndXJhdGlvbkNoYW5nZShjaGFuZ2UsIHByZXZpb3VzRGF0YSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgcmVsb2FkRGVmYXVsdENvbmZpZ3VyYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5vbkRlZmF1bHRDb25maWd1cmF0aW9uQ2hhbmdlZCh0aGlzLmRlZmF1bHRDb25maWd1cmF0aW9uLnJlbG9hZCgpKTtcblx0fVxuXG5cdGhhc0NhY2hlZENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0Q29uZmlndXJhdGlvbi5oYXNDYWNoZWRDb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMoKTtcblx0fVxuXG5cdGFzeW5jIHdoZW5SZW1vdGVDb25maWd1cmF0aW9uTG9hZGVkKCk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0aXNTZXR0aW5nQXBwbGllZEZvckFsbFByb2ZpbGVzKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2NvcGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpW2tleV0/LnNjb3BlO1xuXHRcdGlmIChzY29wZSAmJiBBUFBMSUNBVElPTl9TQ09QRVMuaW5jbHVkZXMoc2NvcGUpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgYWxsUHJvZmlsZXNTZXR0aW5ncyA9IHRoaXMuZ2V0VmFsdWU8c3RyaW5nW10+KEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HKSA/PyBbXTtcblx0XHRyZXR1cm4gQXJyYXkuaXNBcnJheShhbGxQcm9maWxlc1NldHRpbmdzKSAmJiBhbGxQcm9maWxlc1NldHRpbmdzLmluY2x1ZGVzKGtleSk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSBpbml0QWdlbnRzV2luZG93UmVhZE9ubHlLZXlzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGZvciAoY29uc3Qga2V5IGluIHByb3BlcnRpZXMpIHtcblx0XHRcdGlmIChwcm9wZXJ0aWVzW2tleV0uYWdlbnRzV2luZG93Py5yZWFkT25seSkge1xuXHRcdFx0XHR0aGlzLmFnZW50c1dpbmRvd1JlYWRPbmx5S2V5cy5hZGQoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFnZW50c1dpbmRvd1JlYWRPbmx5S2V5cyhjaGFuZ2VkUHJvcGVydGllczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBjaGFuZ2VkUHJvcGVydGllcykge1xuXHRcdFx0aWYgKHByb3BlcnRpZXNba2V5XT8uYWdlbnRzV2luZG93Py5yZWFkT25seSkge1xuXHRcdFx0XHR0aGlzLmFnZW50c1dpbmRvd1JlYWRPbmx5S2V5cy5hZGQoa2V5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuYWdlbnRzV2luZG93UmVhZE9ubHlLZXlzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vICNyZWdpb24gQ29uZmlndXJhdGlvbiBjaGFuZ2UgaGFuZGxlcnNcblxuXHRwcml2YXRlIG9uRGVmYXVsdENvbmZpZ3VyYXRpb25DaGFuZ2VkKGRlZmF1bHRzOiBDb25maWd1cmF0aW9uTW9kZWwsIHByb3BlcnRpZXM/OiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGlmIChwcm9wZXJ0aWVzKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUFnZW50c1dpbmRvd1JlYWRPbmx5S2V5cyhwcm9wZXJ0aWVzKTtcblx0XHR9XG5cdFx0Y29uc3QgcHJldmlvdXNEYXRhID0gdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKTtcblx0XHRjb25zdCBjaGFuZ2UgPSB0aGlzLl9jb25maWd1cmF0aW9uLmNvbXBhcmVBbmRVcGRhdGVEZWZhdWx0Q29uZmlndXJhdGlvbihkZWZhdWx0cywgcHJvcGVydGllcyk7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVMb2NhbFVzZXJDb25maWd1cmF0aW9uKHRoaXMudXNlckNvbmZpZ3VyYXRpb24ucmVwYXJzZSh7IGV4Y2x1ZGU6IFsuLi50aGlzLmFnZW50c1dpbmRvd1JlYWRPbmx5S2V5c10gfSkpO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlV29ya3NwYWNlQ29uZmlndXJhdGlvbih0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24ucmVwYXJzZVdvcmtzcGFjZVNldHRpbmdzKHsgZXhjbHVkZTogWy4uLnRoaXMuYWdlbnRzV2luZG93UmVhZE9ubHlLZXlzXSB9KSk7XG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMpIHtcblx0XHRcdGNvbnN0IGZvbGRlckNvbmZpZ3VyYXRpb24gPSB0aGlzLmNhY2hlZEZvbGRlckNvbmZpZ3MuZ2V0KGZvbGRlci51cmkpO1xuXHRcdFx0aWYgKGZvbGRlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVGb2xkZXJDb25maWd1cmF0aW9uKGZvbGRlci51cmksIGZvbGRlckNvbmZpZ3VyYXRpb24ucmVwYXJzZSgpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy50cmlnZ2VyQ29uZmlndXJhdGlvbkNoYW5nZShjaGFuZ2UsIHByZXZpb3VzRGF0YSwgQ29uZmlndXJhdGlvblRhcmdldC5ERUZBVUxUKTtcblx0fVxuXG5cdHByaXZhdGUgb25Qb2xpY3lDb25maWd1cmF0aW9uQ2hhbmdlZChwb2xpY3lDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c0RhdGEgPSB0aGlzLl9jb25maWd1cmF0aW9uLnRvRGF0YSgpO1xuXHRcdGNvbnN0IGNoYW5nZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZFVwZGF0ZVBvbGljeUNvbmZpZ3VyYXRpb24ocG9saWN5Q29uZmlndXJhdGlvbik7XG5cdFx0dGhpcy50cmlnZ2VyQ29uZmlndXJhdGlvbkNoYW5nZShjaGFuZ2UsIHByZXZpb3VzRGF0YSwgQ29uZmlndXJhdGlvblRhcmdldC5ERUZBVUxUKTtcblx0fVxuXG5cdHByaXZhdGUgb25Vc2VyQ29uZmlndXJhdGlvbkNoYW5nZWQodXNlckNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzRGF0YSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCk7XG5cdFx0Y29uc3QgY2hhbmdlID0gdGhpcy5fY29uZmlndXJhdGlvbi5jb21wYXJlQW5kVXBkYXRlTG9jYWxVc2VyQ29uZmlndXJhdGlvbih1c2VyQ29uZmlndXJhdGlvbik7XG5cdFx0dGhpcy50cmlnZ2VyQ29uZmlndXJhdGlvbkNoYW5nZShjaGFuZ2UsIHByZXZpb3VzRGF0YSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25Xb3Jrc3BhY2VDb25maWd1cmF0aW9uQ2hhbmdlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcmV2aW91c0RhdGEgPSB0aGlzLl9jb25maWd1cmF0aW9uLnRvRGF0YSgpO1xuXHRcdGNvbnN0IGNoYW5nZSA9IGF3YWl0IHRoaXMubG9hZFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24oKTtcblx0XHR0aGlzLnRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKGNoYW5nZSwgcHJldmlvdXNEYXRhLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxvYWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uKCk6IFByb21pc2U8SUNvbmZpZ3VyYXRpb25DaGFuZ2U+IHtcblx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24ucmVsb2FkKCk7XG5cdFx0dGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLnJlcGFyc2VXb3Jrc3BhY2VTZXR0aW5ncyh7IGV4Y2x1ZGU6IFsuLi50aGlzLmFnZW50c1dpbmRvd1JlYWRPbmx5S2V5c10gfSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZFVwZGF0ZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb24odGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLmdldENvbmZpZ3VyYXRpb24oKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uV29ya3NwYWNlRm9sZGVyc0NoYW5nZWQoZTogSVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdC8vIFJlbW92ZSBjb25maWd1cmF0aW9ucyBmb3IgcmVtb3ZlZCBmb2xkZXJzXG5cdFx0Y29uc3QgcHJldmlvdXNEYXRhID0gdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKTtcblx0XHRjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IG92ZXJyaWRlczogW3N0cmluZywgc3RyaW5nW11dW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiBlLnJlbW92ZWQpIHtcblx0XHRcdGNvbnN0IGNoYW5nZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZERlbGV0ZUZvbGRlckNvbmZpZ3VyYXRpb24oZm9sZGVyLnVyaSk7XG5cdFx0XHRrZXlzLnB1c2goLi4uY2hhbmdlLmtleXMpO1xuXHRcdFx0b3ZlcnJpZGVzLnB1c2goLi4uY2hhbmdlLm92ZXJyaWRlcyk7XG5cdFx0XHR0aGlzLmNhY2hlZEZvbGRlckNvbmZpZ3MuZGVsZXRlQW5kRGlzcG9zZShmb2xkZXIudXJpKTtcblx0XHR9XG5cdFx0aWYgKGtleXMubGVuZ3RoIHx8IG92ZXJyaWRlcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoeyBrZXlzLCBvdmVycmlkZXMgfSwgcHJldmlvdXNEYXRhLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Xb3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uQ2hhbmdlZChmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBmb2xkZXJDb25maWd1cmF0aW9uID0gdGhpcy5jYWNoZWRGb2xkZXJDb25maWdzLmdldChmb2xkZXIudXJpKTtcblx0XHRpZiAoZm9sZGVyQ29uZmlndXJhdGlvbikge1xuXHRcdFx0Zm9sZGVyQ29uZmlndXJhdGlvbi5sb2FkQ29uZmlndXJhdGlvbigpLnRoZW4oY29uZmlndXJhdGlvbk1vZGVsID0+IHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNEYXRhID0gdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKTtcblx0XHRcdFx0Y29uc3QgY2hhbmdlID0gdGhpcy5fY29uZmlndXJhdGlvbi5jb21wYXJlQW5kVXBkYXRlRm9sZGVyQ29uZmlndXJhdGlvbihmb2xkZXIudXJpLCBjb25maWd1cmF0aW9uTW9kZWwpO1xuXHRcdFx0XHR0aGlzLnRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKGNoYW5nZSwgcHJldmlvdXNEYXRhLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpO1xuXHRcdFx0fSwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZEZvbGRlckNvbmZpZ3VyYXRpb25zKGZvbGRlcnM6IHJlYWRvbmx5IElXb3Jrc3BhY2VGb2xkZXJbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIGZvbGRlcnMpIHtcblx0XHRcdGxldCBmb2xkZXJDb25maWd1cmF0aW9uID0gdGhpcy5jYWNoZWRGb2xkZXJDb25maWdzLmdldChmb2xkZXIudXJpKTtcblx0XHRcdGlmICghZm9sZGVyQ29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRmb2xkZXJDb25maWd1cmF0aW9uID0gbmV3IEZvbGRlckNvbmZpZ3VyYXRpb24oZmFsc2UsIGZvbGRlciwgRk9MREVSX0NPTkZJR19GT0xERVJfTkFNRSwgV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFLCB0cnVlLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCB7IG5lZWRzQ2FjaGluZzogKCkgPT4gZmFsc2UsIHJlYWQ6IGFzeW5jICgpID0+ICcnLCB3cml0ZTogYXN5bmMgKCkgPT4geyB9LCByZW1vdmU6IGFzeW5jICgpID0+IHsgfSB9KTtcblx0XHRcdFx0Zm9sZGVyQ29uZmlndXJhdGlvbi5hZGRSZWxhdGVkKGZvbGRlckNvbmZpZ3VyYXRpb24ub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5vbldvcmtzcGFjZUZvbGRlckNvbmZpZ3VyYXRpb25DaGFuZ2VkKGZvbGRlcikpKTtcblx0XHRcdFx0dGhpcy5jYWNoZWRGb2xkZXJDb25maWdzLnNldChmb2xkZXIudXJpLCBmb2xkZXJDb25maWd1cmF0aW9uKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Nb2RlbCA9IGF3YWl0IGZvbGRlckNvbmZpZ3VyYXRpb24ubG9hZENvbmZpZ3VyYXRpb24oKTtcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlRm9sZGVyQ29uZmlndXJhdGlvbihmb2xkZXIudXJpLCBjb25maWd1cmF0aW9uTW9kZWwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoY2hhbmdlOiBJQ29uZmlndXJhdGlvbkNoYW5nZSwgcHJldmlvdXNEYXRhOiBJQ29uZmlndXJhdGlvbkRhdGEsIHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCk6IHZvaWQge1xuXHRcdGlmIChjaGFuZ2Uua2V5cy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKSBhcyBXb3Jrc3BhY2U7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQoY2hhbmdlLCB7IGRhdGE6IHByZXZpb3VzRGF0YSwgd29ya3NwYWNlIH0sIHRoaXMuX2NvbmZpZ3VyYXRpb24sIHdvcmtzcGFjZSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdGV2ZW50LnNvdXJjZSA9IHRhcmdldDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5maXJlKGV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG59XG5cbmNsYXNzIENvbmZpZ3VyYXRpb25FZGl0aW5nIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHF1ZXVlID0gbmV3IFF1ZXVlPHZvaWQ+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHdyaXRlKHNldHRpbmdzUmVzb3VyY2U6IFVSSSwgcGF0aDogSlNPTlBhdGgsIHZhbHVlOiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMucXVldWUucXVldWUoKCkgPT4gdGhpcy5kb1dyaXRlQ29uZmlndXJhdGlvbihzZXR0aW5nc1Jlc291cmNlLCBwYXRoLCB2YWx1ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1dyaXRlQ29uZmlndXJhdGlvbihzZXR0aW5nc1Jlc291cmNlOiBVUkksIHBhdGg6IEpTT05QYXRoLCB2YWx1ZTogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBjb250ZW50OiBzdHJpbmc7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGZpbGVDb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShzZXR0aW5nc1Jlc291cmNlKTtcblx0XHRcdGNvbnRlbnQgPSBmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoKGVycm9yIGFzIEZpbGVPcGVyYXRpb25FcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRjb250ZW50ID0gJ3t9Jztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnNlRXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcblx0XHRwYXJzZShjb250ZW50LCBwYXJzZUVycm9ycywgeyBhbGxvd1RyYWlsaW5nQ29tbWE6IHRydWUsIGFsbG93RW1wdHlDb250ZW50OiB0cnVlIH0pO1xuXHRcdGlmIChwYXJzZUVycm9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VuYWJsZSB0byB3cml0ZSBpbnRvIHRoZSBzZXR0aW5ncyBmaWxlLiBQbGVhc2Ugb3BlbiB0aGUgZmlsZSB0byBjb3JyZWN0IGVycm9ycy93YXJuaW5ncyBpbiB0aGUgZmlsZSBhbmQgdHJ5IGFnYWluLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRzID0gdGhpcy5nZXRFZGl0cyhjb250ZW50LCBwYXRoLCB2YWx1ZSk7XG5cdFx0Y29udGVudCA9IGFwcGx5RWRpdHMoY29udGVudCwgZWRpdHMpO1xuXG5cdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUoc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEVkaXRzKGNvbnRlbnQ6IHN0cmluZywgcGF0aDogSlNPTlBhdGgsIHZhbHVlOiB1bmtub3duKTogRWRpdFtdIHtcblx0XHRjb25zdCB7IHRhYlNpemUsIGluc2VydFNwYWNlcywgZW9sIH0gPSB0aGlzLmZvcm1hdHRpbmdPcHRpb25zO1xuXG5cdFx0aWYgKCFwYXRoLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbmV3Q29udGVudCA9IEpTT04uc3RyaW5naWZ5KHZhbHVlLCBudWxsLCBpbnNlcnRTcGFjZXMgPyAnICcucmVwZWF0KHRhYlNpemUpIDogJ1xcdCcpO1xuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdGNvbnRlbnQ6IG5ld0NvbnRlbnQsXG5cdFx0XHRcdGxlbmd0aDogY29udGVudC5sZW5ndGgsXG5cdFx0XHRcdG9mZnNldDogMFxuXHRcdFx0fV07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNldFByb3BlcnR5KGNvbnRlbnQsIHBhdGgsIHZhbHVlLCB7IHRhYlNpemUsIGluc2VydFNwYWNlcywgZW9sIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9ybWF0dGluZ09wdGlvbnM6IFJlcXVpcmVkPEZvcm1hdHRpbmdPcHRpb25zPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgZm9ybWF0dGluZ09wdGlvbnMoKTogUmVxdWlyZWQ8Rm9ybWF0dGluZ09wdGlvbnM+IHtcblx0XHRpZiAoIXRoaXMuX2Zvcm1hdHRpbmdPcHRpb25zKSB7XG5cdFx0XHRsZXQgZW9sID0gT1MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCB8fCBPUyA9PT0gT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCA/ICdcXG4nIDogJ1xcclxcbic7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkRW9sID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdmaWxlcy5lb2wnLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogJ2pzb25jJyB9KTtcblx0XHRcdGlmIChjb25maWd1cmVkRW9sICYmIHR5cGVvZiBjb25maWd1cmVkRW9sID09PSAnc3RyaW5nJyAmJiBjb25maWd1cmVkRW9sICE9PSAnYXV0bycpIHtcblx0XHRcdFx0ZW9sID0gY29uZmlndXJlZEVvbDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2Zvcm1hdHRpbmdPcHRpb25zID0ge1xuXHRcdFx0XHRlb2wsXG5cdFx0XHRcdGluc2VydFNwYWNlczogISF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3IuaW5zZXJ0U3BhY2VzJywgeyBvdmVycmlkZUlkZW50aWZpZXI6ICdqc29uYycgfSksXG5cdFx0XHRcdHRhYlNpemU6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci50YWJTaXplJywgeyBvdmVycmlkZUlkZW50aWZpZXI6ICdqc29uYycgfSlcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9mb3JtYXR0aW5nT3B0aW9ucztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHFCQUFxQjtBQUMxQyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLFVBQVUsYUFBYTtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUErQixhQUFhO0FBQzVDLFNBQVMsWUFBWSxtQkFBbUI7QUFFeEMsU0FBUyxXQUFXLGNBQWM7QUFDbEMsU0FBUyxVQUFVLFVBQVUsbUJBQW1CO0FBQ2hELFNBQVMsSUFBSSx1QkFBdUI7QUFDcEMsU0FBd0wscUJBQXFCLDBCQUEwQixzQ0FBc0M7QUFDN1EsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywwQkFBMEIsMEJBQTBCO0FBQzdELFNBQStCLHlCQUF5QiwyQkFBMkI7QUFDbkYsU0FBUyxZQUE0RSxrQ0FB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
