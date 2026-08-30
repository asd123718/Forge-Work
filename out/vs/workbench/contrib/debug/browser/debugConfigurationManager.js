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
import { distinct } from "../../../../base/common/arrays.js";
import { sequence } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import * as json from "../../../../base/common/json.js";
import { DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import * as resources from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI as uri } from "../../../../base/common/uri.js";
import * as nls from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { OS } from "../../../../base/common/platform.js";
import { launchSchemaId } from "../../../services/configuration/common/configuration.js";
import { ACTIVE_GROUP, IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { CONTEXT_DEBUG_CONFIGURATION_TYPE, DebugConfigurationProviderTriggerKind, isDebugConfig } from "../common/debug.js";
import { launchSchema } from "../common/debugSchemas.js";
import { getEffectiveConfigForPlatform, getVisibleAndSorted } from "../common/debugUtils.js";
import { debugConfigure } from "./debugIcons.js";
const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
jsonRegistry.registerSchema(launchSchemaId, launchSchema);
const DEBUG_SELECTED_CONFIG_NAME_KEY = "debug.selectedconfigname";
const DEBUG_SELECTED_ROOT = "debug.selectedroot";
const DEBUG_SELECTED_TYPE = "debug.selectedtype";
const DEBUG_RECENT_DYNAMIC_CONFIGURATIONS = "debug.recentdynamicconfigurations";
const ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME = "onDebugDynamicConfigurations";
let ConfigurationManager = class {
  constructor(adapterManager, contextService, configurationService, quickInputService, instantiationService, storageService, extensionService, historyService, uriIdentityService, remoteAgentService, contextKeyService, logService) {
    this.adapterManager = adapterManager;
    this.contextService = contextService;
    this.configurationService = configurationService;
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.extensionService = extensionService;
    this.historyService = historyService;
    this.uriIdentityService = uriIdentityService;
    this.remoteAgentService = remoteAgentService;
    this.logService = logService;
    this.getSelectedConfig = () => Promise.resolve(void 0);
    this.selectedDynamic = false;
    this._onDidSelectConfigurationName = new Emitter();
    this._onDidChangeConfigurationProviders = new Emitter();
    this.onDidChangeConfigurationProviders = this._onDidChangeConfigurationProviders.event;
    this.targetOperatingSystem = OS;
    this.configProviders = [];
    this.toDispose = [this._onDidChangeConfigurationProviders, this._onDidSelectConfigurationName];
    this.initLaunches();
    this.setCompoundSchemaValues();
    this.registerListeners();
    const previousSelectedRoot = this.storageService.get(DEBUG_SELECTED_ROOT, StorageScope.WORKSPACE);
    const previousSelectedType = this.storageService.get(DEBUG_SELECTED_TYPE, StorageScope.WORKSPACE);
    const previousSelectedLaunch = this.launches.find((l) => l.uri.toString() === previousSelectedRoot);
    const previousSelectedName = this.storageService.get(DEBUG_SELECTED_CONFIG_NAME_KEY, StorageScope.WORKSPACE);
    this.debugConfigurationTypeContext = CONTEXT_DEBUG_CONFIGURATION_TYPE.bindTo(contextKeyService);
    const dynamicConfig = previousSelectedType ? { type: previousSelectedType } : void 0;
    if (previousSelectedLaunch && previousSelectedLaunch.getConfigurationNames().length) {
      this.selectConfiguration(previousSelectedLaunch, previousSelectedName, void 0, dynamicConfig);
    } else if (this.launches.length > 0) {
      this.selectConfiguration(void 0, previousSelectedName, void 0, dynamicConfig);
    }
    this.resolveTargetOperatingSystem();
  }
  resolveTargetOperatingSystem() {
    this.remoteAgentService.getEnvironment().then((environment) => {
      const targetOperatingSystem = environment?.os ?? OS;
      if (this.targetOperatingSystem !== targetOperatingSystem) {
        this.targetOperatingSystem = targetOperatingSystem;
        this._onDidSelectConfigurationName.fire();
      }
    }, () => {
    });
  }
  getTargetOperatingSystem() {
    return this.targetOperatingSystem;
  }
  registerDebugConfigurationProvider(debugConfigurationProvider) {
    this.configProviders.push(debugConfigurationProvider);
    this._onDidChangeConfigurationProviders.fire();
    return {
      dispose: () => {
        this.unregisterDebugConfigurationProvider(debugConfigurationProvider);
        this._onDidChangeConfigurationProviders.fire();
      }
    };
  }
  unregisterDebugConfigurationProvider(debugConfigurationProvider) {
    const ix = this.configProviders.indexOf(debugConfigurationProvider);
    if (ix >= 0) {
      this.configProviders.splice(ix, 1);
    }
  }
  /**
   * if scope is not specified,a value of DebugConfigurationProvideTrigger.Initial is assumed.
   */
  hasDebugConfigurationProvider(debugType, triggerKind) {
    if (triggerKind === void 0) {
      triggerKind = DebugConfigurationProviderTriggerKind.Initial;
    }
    const provider = this.configProviders.find((p) => p.provideDebugConfigurations && p.type === debugType && p.triggerKind === triggerKind);
    return !!provider;
  }
  async resolveConfigurationByProviders(folderUri, type, config, token) {
    const resolveDebugConfigurationForType = async (type2, config2) => {
      if (type2 !== "*") {
        await this.adapterManager.activateDebuggers("onDebugResolve", type2);
      }
      for (const p of this.configProviders) {
        if (p.type === type2 && p.resolveDebugConfiguration && config2) {
          config2 = await p.resolveDebugConfiguration(folderUri, config2, token);
        }
      }
      return config2;
    };
    let resolvedType = config.type ?? type;
    let result = config;
    for (let seen = /* @__PURE__ */ new Set(); result && !seen.has(resolvedType); ) {
      seen.add(resolvedType);
      result = await resolveDebugConfigurationForType(resolvedType, result);
      result = await resolveDebugConfigurationForType("*", result);
      resolvedType = result?.type ?? type;
    }
    return result;
  }
  async resolveDebugConfigurationWithSubstitutedVariables(folderUri, type, config, token) {
    const providers = this.configProviders.filter((p) => p.type === type && p.resolveDebugConfigurationWithSubstitutedVariables).concat(this.configProviders.filter((p) => p.type === "*" && p.resolveDebugConfigurationWithSubstitutedVariables));
    let result = config;
    await sequence(providers.map((provider) => async () => {
      if (result) {
        result = await provider.resolveDebugConfigurationWithSubstitutedVariables(folderUri, result, token);
      }
    }));
    return result;
  }
  async provideDebugConfigurations(folderUri, type, token) {
    await this.adapterManager.activateDebuggers("onDebugInitialConfigurations");
    const results = await Promise.all(this.configProviders.filter((p) => p.type === type && p.triggerKind === DebugConfigurationProviderTriggerKind.Initial && p.provideDebugConfigurations).map((p) => p.provideDebugConfigurations(folderUri, token)));
    return results.reduce((first, second) => first.concat(second), []);
  }
  async getDynamicProviders() {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const debugDynamicExtensionsTypes = this.extensionService.extensions.reduce((acc, e) => {
      if (!e.activationEvents) {
        return acc;
      }
      const explicitTypes = [];
      let hasGenericEvent = false;
      for (const event of e.activationEvents) {
        if (event === ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME) {
          hasGenericEvent = true;
        } else if (event.startsWith(`${ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME}:`)) {
          explicitTypes.push(event.slice(ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME.length + 1));
        }
      }
      if (explicitTypes.length) {
        explicitTypes.forEach((t) => acc.add(t));
      } else if (hasGenericEvent) {
        const debuggerType = e.contributes?.debuggers?.[0].type;
        if (debuggerType) {
          acc.add(debuggerType);
        }
      }
      return acc;
    }, /* @__PURE__ */ new Set());
    for (const configProvider of this.configProviders) {
      if (configProvider.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic) {
        debugDynamicExtensionsTypes.add(configProvider.type);
      }
    }
    return [...debugDynamicExtensionsTypes].map((type) => {
      return {
        label: this.adapterManager.getDebuggerLabel(type),
        getProvider: async () => {
          await this.adapterManager.activateDebuggers(ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME, type);
          return this.configProviders.find((p) => p.type === type && p.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic && p.provideDebugConfigurations);
        },
        type,
        pick: async () => {
          await this.adapterManager.activateDebuggers(ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME, type);
          const disposables = new DisposableStore();
          const token = new CancellationTokenSource();
          disposables.add(token);
          const input = disposables.add(this.quickInputService.createQuickPick());
          input.busy = true;
          input.placeholder = nls.localize("selectConfiguration", "Select Launch Configuration");
          const chosenPromise = new Promise((resolve) => {
            disposables.add(input.onDidAccept(() => resolve(input.activeItems[0])));
            disposables.add(input.onDidTriggerItemButton(async (context) => {
              resolve(void 0);
              const { launch, config } = context.item;
              await launch.openConfigFile({ preserveFocus: false, type: config.type, suppressInitialConfigs: true });
              await launch.writeConfiguration(config);
              await this.selectConfiguration(launch, config.name);
              this.removeRecentDynamicConfigurations(config.name, config.type);
            }));
            disposables.add(input.onDidHide(() => resolve(void 0)));
          }).finally(() => token.cancel());
          let items;
          try {
            items = await this.getDynamicConfigurationsByType(type, token.token);
          } catch (err) {
            this.logService.error(err);
            disposables.dispose();
            return;
          }
          input.items = items;
          input.busy = false;
          input.show();
          const chosen = await chosenPromise;
          disposables.dispose();
          return chosen;
        }
      };
    });
  }
  async getDynamicConfigurationsByType(type, token = CancellationToken.None) {
    await this.adapterManager.activateDebuggers(ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME, type);
    const picks = [];
    const provider = this.configProviders.find((p) => p.type === type && p.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic && p.provideDebugConfigurations);
    this.getLaunches().forEach((launch) => {
      if (provider) {
        picks.push(provider.provideDebugConfigurations(launch.workspace?.uri, token).then((configurations) => configurations.map((config) => ({
          label: config.name,
          description: launch.name,
          config,
          buttons: [{
            iconClass: ThemeIcon.asClassName(debugConfigure),
            tooltip: nls.localize("editLaunchConfig", "Edit Debug Configuration in launch.json")
          }],
          launch
        }))));
      }
    });
    return (await Promise.all(picks)).flat();
  }
  getAllConfigurations() {
    const all = [];
    for (const l of this.launches) {
      for (const name of l.getConfigurationNames()) {
        const config = l.getConfiguration(name) || l.getCompound(name);
        if (config) {
          all.push({ launch: l, name, presentation: config.presentation });
        }
      }
    }
    return getVisibleAndSorted(all);
  }
  removeRecentDynamicConfigurations(name, type) {
    const remaining = this.getRecentDynamicConfigurations().filter((c) => c.name !== name || c.type !== type);
    this.storageService.store(DEBUG_RECENT_DYNAMIC_CONFIGURATIONS, JSON.stringify(remaining), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    if (this.selectedConfiguration.name === name && this.selectedType === type && this.selectedDynamic) {
      this.selectConfiguration(void 0, void 0);
    } else {
      this._onDidSelectConfigurationName.fire();
    }
  }
  getRecentDynamicConfigurations() {
    return JSON.parse(this.storageService.get(DEBUG_RECENT_DYNAMIC_CONFIGURATIONS, StorageScope.WORKSPACE, "[]"));
  }
  registerListeners() {
    this.toDispose.push(Event.any(this.contextService.onDidChangeWorkspaceFolders, this.contextService.onDidChangeWorkbenchState)(() => {
      this.initLaunches();
      this.selectConfiguration(void 0);
      this.setCompoundSchemaValues();
    }));
    this.toDispose.push(this.configurationService.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("launch")) {
        await this.selectConfiguration(void 0);
        this.setCompoundSchemaValues();
      }
    }));
    this.toDispose.push(this.adapterManager.onDidDebuggersExtPointRead(() => {
      this.setCompoundSchemaValues();
    }));
  }
  initLaunches() {
    this.launches = this.contextService.getWorkspace().folders.map((folder) => this.instantiationService.createInstance(Launch, this, this.adapterManager, folder));
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      this.launches.push(this.instantiationService.createInstance(WorkspaceLaunch, this, this.adapterManager));
    }
    this.launches.push(this.instantiationService.createInstance(UserLaunch, this, this.adapterManager));
    if (this.selectedLaunch && this.launches.indexOf(this.selectedLaunch) === -1) {
      this.selectConfiguration(void 0);
    }
  }
  setCompoundSchemaValues() {
    const compoundConfigurationsSchema = launchSchema.properties["compounds"].items.properties["configurations"];
    const launchNames = this.launches.map((l) => l.getConfigurationNames(true)).reduce((first, second) => first.concat(second), []);
    compoundConfigurationsSchema.items.oneOf[0].enum = launchNames;
    compoundConfigurationsSchema.items.oneOf[1].properties.name.enum = launchNames;
    const folderNames = this.contextService.getWorkspace().folders.map((f) => f.name);
    compoundConfigurationsSchema.items.oneOf[1].properties.folder.enum = folderNames;
    jsonRegistry.registerSchema(launchSchemaId, launchSchema);
  }
  getLaunches() {
    return this.launches;
  }
  getLaunch(workspaceUri) {
    if (!uri.isUri(workspaceUri)) {
      return void 0;
    }
    return this.launches.find((l) => l.workspace && this.uriIdentityService.extUri.isEqual(l.workspace.uri, workspaceUri));
  }
  get selectedConfiguration() {
    return {
      launch: this.selectedLaunch,
      name: this.selectedName,
      getConfig: this.getSelectedConfig,
      type: this.selectedType
    };
  }
  get onDidSelectConfiguration() {
    return this._onDidSelectConfigurationName.event;
  }
  getWorkspaceLaunch() {
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      return this.launches[this.launches.length - 1];
    }
    return void 0;
  }
  async selectConfiguration(launch, name, config, dynamicConfig) {
    if (typeof launch === "undefined") {
      const rootUri = this.historyService.getLastActiveWorkspaceRoot();
      launch = this.getLaunch(rootUri);
      if (!launch || launch.getConfigurationNames().length === 0) {
        launch = this.launches.find((l) => !!(l && l.getConfigurationNames().length)) || launch || this.launches[0];
      }
    }
    const previousLaunch = this.selectedLaunch;
    const previousName = this.selectedName;
    const previousSelectedDynamic = this.selectedDynamic;
    this.selectedLaunch = launch;
    if (this.selectedLaunch) {
      this.storageService.store(DEBUG_SELECTED_ROOT, this.selectedLaunch.uri.toString(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(DEBUG_SELECTED_ROOT, StorageScope.WORKSPACE);
    }
    const names = launch ? launch.getConfigurationNames() : [];
    this.getSelectedConfig = () => {
      const selected = this.selectedName ? launch?.getConfiguration(this.selectedName) : void 0;
      return Promise.resolve(selected || config);
    };
    let type = config?.type;
    if (name && names.indexOf(name) >= 0) {
      this.setSelectedLaunchName(name);
    } else if (dynamicConfig && dynamicConfig.type) {
      type = dynamicConfig.type;
      if (!config) {
        const providers = (await this.getDynamicProviders()).filter((p) => p.type === type);
        this.getSelectedConfig = async () => {
          const activatedProviders = await Promise.all(providers.map((p) => p.getProvider()));
          const provider = activatedProviders.length > 0 ? activatedProviders[0] : void 0;
          if (provider && launch && launch.workspace) {
            const token = new CancellationTokenSource();
            const dynamicConfigs = await provider.provideDebugConfigurations(launch.workspace.uri, token.token);
            const dynamicConfig2 = dynamicConfigs.find((c) => c.name === name);
            if (dynamicConfig2) {
              return dynamicConfig2;
            }
          }
          return void 0;
        };
      }
      this.setSelectedLaunchName(name);
      let recentDynamicProviders = this.getRecentDynamicConfigurations();
      if (name && dynamicConfig.type) {
        recentDynamicProviders.unshift({ name, type: dynamicConfig.type });
        recentDynamicProviders = distinct(recentDynamicProviders, (t) => `${t.name} : ${t.type}`);
        this.storageService.store(DEBUG_RECENT_DYNAMIC_CONFIGURATIONS, JSON.stringify(recentDynamicProviders), StorageScope.WORKSPACE, StorageTarget.MACHINE);
      }
    } else if (!this.selectedName || names.indexOf(this.selectedName) === -1) {
      const nameToSet = names.length ? names[0] : void 0;
      this.setSelectedLaunchName(nameToSet);
    }
    if (!config && launch && this.selectedName) {
      config = launch.getConfiguration(this.selectedName);
      type = config?.type;
    }
    this.selectedType = dynamicConfig?.type || config?.type;
    this.selectedDynamic = !!dynamicConfig;
    this.storageService.store(DEBUG_SELECTED_TYPE, dynamicConfig ? this.selectedType : void 0, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    if (type) {
      this.debugConfigurationTypeContext.set(type);
    } else {
      this.debugConfigurationTypeContext.reset();
    }
    if (this.selectedLaunch !== previousLaunch || this.selectedName !== previousName || previousSelectedDynamic !== this.selectedDynamic) {
      this._onDidSelectConfigurationName.fire();
    }
  }
  setSelectedLaunchName(selectedName) {
    this.selectedName = selectedName;
    if (this.selectedName) {
      this.storageService.store(DEBUG_SELECTED_CONFIG_NAME_KEY, this.selectedName, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(DEBUG_SELECTED_CONFIG_NAME_KEY, StorageScope.WORKSPACE);
    }
  }
  dispose() {
    this.toDispose = dispose(this.toDispose);
  }
};
ConfigurationManager = __decorateClass([
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, IHistoryService),
  __decorateParam(8, IUriIdentityService),
  __decorateParam(9, IRemoteAgentService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, ILogService)
], ConfigurationManager);
class AbstractLaunch {
  constructor(configurationManager, adapterManager) {
    this.configurationManager = configurationManager;
    this.adapterManager = adapterManager;
  }
  getCompound(name) {
    const config = this.getDeduplicatedConfig();
    if (!config || !config.compounds) {
      return void 0;
    }
    return config.compounds.find((compound) => compound.name === name);
  }
  getConfigurationNames(ignoreCompoundsAndPresentation = false) {
    const config = this.getDeduplicatedConfig();
    if (!config || !Array.isArray(config.configurations) && !Array.isArray(config.compounds)) {
      return [];
    } else {
      const configurations = [];
      if (config.configurations) {
        configurations.push(...config.configurations.filter((cfg) => cfg && typeof cfg.name === "string"));
      }
      if (ignoreCompoundsAndPresentation) {
        return configurations.map((c) => c.name);
      }
      if (config.compounds) {
        configurations.push(...config.compounds.filter((compound) => typeof compound.name === "string" && compound.configurations && compound.configurations.length));
      }
      const resolved = configurations.map((c) => isDebugConfig(c) ? getEffectiveConfigForPlatform(c, this.configurationManager.getTargetOperatingSystem()) : c);
      return getVisibleAndSorted(resolved).map((c) => c.name);
    }
  }
  getConfiguration(name) {
    const config = this.getDeduplicatedConfig();
    if (!config || !config.configurations) {
      return void 0;
    }
    const configuration = config.configurations.find((config2) => config2 && config2.name === name);
    if (!configuration) {
      return;
    }
    const effectiveConfiguration = getEffectiveConfigForPlatform(configuration, this.configurationManager.getTargetOperatingSystem());
    if (this instanceof UserLaunch) {
      return { ...effectiveConfiguration, __configurationTarget: ConfigurationTarget.USER };
    } else if (this instanceof WorkspaceLaunch) {
      return { ...effectiveConfiguration, __configurationTarget: ConfigurationTarget.WORKSPACE };
    } else {
      return { ...effectiveConfiguration, __configurationTarget: ConfigurationTarget.WORKSPACE_FOLDER };
    }
  }
  async getInitialConfigurationContent(folderUri, type, useInitialConfigs, token) {
    let content = "";
    const adapter = type ? { debugger: this.adapterManager.getEnabledDebugger(type) } : await this.adapterManager.guessDebugger(true);
    if (adapter?.withConfig && adapter.debugger) {
      content = await adapter.debugger.getInitialConfigurationContent([adapter.withConfig.config]);
    } else if (adapter?.debugger) {
      const initialConfigs = useInitialConfigs ? await this.configurationManager.provideDebugConfigurations(folderUri, adapter.debugger.type, token || CancellationToken.None) : [];
      content = await adapter.debugger.getInitialConfigurationContent(initialConfigs);
    }
    return content;
  }
  get hidden() {
    return false;
  }
  getDeduplicatedConfig() {
    const original = this.getConfig();
    if (!original) {
      return void 0;
    }
    const compounds = original.compounds?.filter((compound) => !!compound && typeof compound.name === "string") ?? [];
    const configurations = original.configurations?.filter((configuration) => !!configuration && typeof configuration.name === "string") ?? [];
    return {
      version: original.version,
      compounds: distinguishConfigsByName(compounds),
      configurations: distinguishConfigsByName(configurations)
    };
  }
}
function distinguishConfigsByName(things) {
  const seen = /* @__PURE__ */ new Map();
  return things.map((thing) => {
    const no = seen.get(thing.name) || 0;
    seen.set(thing.name, no + 1);
    return no === 0 ? thing : { ...thing, name: `${thing.name} (${no})` };
  });
}
let Launch = class extends AbstractLaunch {
  constructor(configurationManager, adapterManager, workspace, fileService, textFileService, editorService, configurationService) {
    super(configurationManager, adapterManager);
    this.workspace = workspace;
    this.fileService = fileService;
    this.textFileService = textFileService;
    this.editorService = editorService;
    this.configurationService = configurationService;
  }
  get uri() {
    return resources.joinPath(this.workspace.uri, "/.vscode/launch.json");
  }
  get name() {
    return this.workspace.name;
  }
  getConfig() {
    return this.configurationService.inspect("launch", { resource: this.workspace.uri }).workspaceFolderValue;
  }
  async openConfigFile({ preserveFocus, type, suppressInitialConfigs }, token) {
    const resource = this.uri;
    let created = false;
    let content = "";
    try {
      const fileContent = await this.fileService.readFile(resource);
      content = fileContent.value.toString();
    } catch {
      content = await this.getInitialConfigurationContent(this.workspace.uri, type, !suppressInitialConfigs, token);
      if (!content) {
        return { editor: null, created: false };
      }
      created = true;
      try {
        await this.textFileService.write(resource, content);
      } catch (error) {
        throw new Error(nls.localize("DebugConfig.failed", "Unable to create 'launch.json' file inside the '.vscode' folder ({0}).", error.message));
      }
    }
    const index = content.indexOf(`"${this.configurationManager.selectedConfiguration.name}"`);
    let startLineNumber = 1;
    for (let i = 0; i < index; i++) {
      if (content.charAt(i) === "\n") {
        startLineNumber++;
      }
    }
    const selection = startLineNumber > 1 ? { startLineNumber, startColumn: 4 } : void 0;
    const editor = await this.editorService.openEditor({
      resource,
      options: {
        selection,
        preserveFocus,
        pinned: created,
        revealIfVisible: true
      }
    }, ACTIVE_GROUP);
    return {
      editor: editor ?? null,
      created
    };
  }
  async writeConfiguration(configuration) {
    const fullConfig = { ...this.getConfig() ?? {} };
    fullConfig.configurations = [...fullConfig.configurations || [], configuration];
    await this.configurationService.updateValue("launch", fullConfig, { resource: this.workspace.uri }, ConfigurationTarget.WORKSPACE_FOLDER);
  }
};
Launch = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, ITextFileService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IConfigurationService)
], Launch);
let WorkspaceLaunch = class extends AbstractLaunch {
  constructor(configurationManager, adapterManager, editorService, configurationService, contextService) {
    super(configurationManager, adapterManager);
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.contextService = contextService;
  }
  get workspace() {
    return void 0;
  }
  get uri() {
    return this.contextService.getWorkspace().configuration;
  }
  get name() {
    return nls.localize("workspace", "workspace");
  }
  getConfig() {
    return this.configurationService.inspect("launch").workspaceValue;
  }
  async openConfigFile({ preserveFocus, type, useInitialConfigs }, token) {
    const launchExistInFile = !!this.getConfig();
    if (!launchExistInFile) {
      const content = await this.getInitialConfigurationContent(void 0, type, useInitialConfigs, token);
      if (content) {
        await this.configurationService.updateValue("launch", json.parse(content), ConfigurationTarget.WORKSPACE);
      } else {
        return { editor: null, created: false };
      }
    }
    const editor = await this.editorService.openEditor({
      resource: this.contextService.getWorkspace().configuration,
      options: { preserveFocus }
    }, ACTIVE_GROUP);
    return {
      editor: editor ?? null,
      created: false
    };
  }
};
WorkspaceLaunch = __decorateClass([
  __decorateParam(2, IEditorService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IWorkspaceContextService)
], WorkspaceLaunch);
let UserLaunch = class extends AbstractLaunch {
  constructor(configurationManager, adapterManager, configurationService, preferencesService) {
    super(configurationManager, adapterManager);
    this.configurationService = configurationService;
    this.preferencesService = preferencesService;
  }
  get workspace() {
    return void 0;
  }
  get uri() {
    return this.preferencesService.userSettingsResource;
  }
  get name() {
    return nls.localize("user settings", "user settings");
  }
  get hidden() {
    return true;
  }
  getConfig() {
    return this.configurationService.inspect("launch").userValue;
  }
  async openConfigFile({ preserveFocus, type, useInitialContent }) {
    const editor = await this.preferencesService.openUserSettings({ jsonEditor: true, preserveFocus, revealSetting: { key: "launch" } });
    return {
      editor: editor ?? null,
      created: false
    };
  }
};
UserLaunch = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IPreferencesService)
], UserLaunch);
export {
  ConfigurationManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z0NvbmZpZ3VyYXRpb25NYW5hZ2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgc2VxdWVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgKiBhcyBqc29uIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIGFzIHVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciwgSVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudCwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBsYXVuY2hTY2hlbWFJZCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQLCBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0RFQlVHX0NPTkZJR1VSQVRJT05fVFlQRSwgRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJUcmlnZ2VyS2luZCwgSUFkYXB0ZXJNYW5hZ2VyLCBJQ29tcG91bmQsIElDb25maWcsIElDb25maWdQcmVzZW50YXRpb24sIElDb25maWd1cmF0aW9uTWFuYWdlciwgSURlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyLCBJR2xvYmFsQ29uZmlnLCBJR3Vlc3NlZERlYnVnZ2VyLCBJTGF1bmNoLCBpc0RlYnVnQ29uZmlnIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IGxhdW5jaFNjaGVtYSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1NjaGVtYXMuanMnO1xuaW1wb3J0IHsgZ2V0RWZmZWN0aXZlQ29uZmlnRm9yUGxhdGZvcm0sIGdldFZpc2libGVBbmRTb3J0ZWQgfSBmcm9tICcuLi9jb21tb24vZGVidWdVdGlscy5qcyc7XG5pbXBvcnQgeyBkZWJ1Z0NvbmZpZ3VyZSB9IGZyb20gJy4vZGVidWdJY29ucy5qcyc7XG5cbmNvbnN0IGpzb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnk+KEpTT05FeHRlbnNpb25zLkpTT05Db250cmlidXRpb24pO1xuanNvblJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKGxhdW5jaFNjaGVtYUlkLCBsYXVuY2hTY2hlbWEpO1xuXG5jb25zdCBERUJVR19TRUxFQ1RFRF9DT05GSUdfTkFNRV9LRVkgPSAnZGVidWcuc2VsZWN0ZWRjb25maWduYW1lJztcbmNvbnN0IERFQlVHX1NFTEVDVEVEX1JPT1QgPSAnZGVidWcuc2VsZWN0ZWRyb290Jztcbi8vIERlYnVnIHR5cGUgaXMgb25seSBzdG9yZWQgaWYgYSBkeW5hbWljIGNvbmZpZ3VyYXRpb24gaXMgdXNlZCBmb3IgYmV0dGVyIHJlc3RvcmVcbmNvbnN0IERFQlVHX1NFTEVDVEVEX1RZUEUgPSAnZGVidWcuc2VsZWN0ZWR0eXBlJztcbmNvbnN0IERFQlVHX1JFQ0VOVF9EWU5BTUlDX0NPTkZJR1VSQVRJT05TID0gJ2RlYnVnLnJlY2VudGR5bmFtaWNjb25maWd1cmF0aW9ucyc7XG5jb25zdCBPTl9ERUJVR19EWU5BTUlDX0NPTkZJR1VSQVRJT05TX05BTUUgPSAnb25EZWJ1Z0R5bmFtaWNDb25maWd1cmF0aW9ucyc7XG5cbmludGVyZmFjZSBJRHluYW1pY1BpY2tJdGVtIHsgbGFiZWw6IHN0cmluZzsgbGF1bmNoOiBJTGF1bmNoOyBjb25maWc6IElDb25maWcgfVxuXG5leHBvcnQgY2xhc3MgQ29uZmlndXJhdGlvbk1hbmFnZXIgaW1wbGVtZW50cyBJQ29uZmlndXJhdGlvbk1hbmFnZXIge1xuXHRwcml2YXRlIGxhdW5jaGVzITogSUxhdW5jaFtdO1xuXHRwcml2YXRlIHNlbGVjdGVkTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlbGVjdGVkTGF1bmNoOiBJTGF1bmNoIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldFNlbGVjdGVkQ29uZmlnOiAoKSA9PiBQcm9taXNlPElDb25maWcgfCB1bmRlZmluZWQ+ID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgc2VsZWN0ZWRUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2VsZWN0ZWREeW5hbWljID0gZmFsc2U7XG5cdHByaXZhdGUgdG9EaXNwb3NlOiBJRGlzcG9zYWJsZVtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlbGVjdENvbmZpZ3VyYXRpb25OYW1lID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cHJpdmF0ZSBjb25maWdQcm92aWRlcnM6IElEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcltdO1xuXHRwcml2YXRlIGRlYnVnQ29uZmlndXJhdGlvblR5cGVDb250ZXh0OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25Qcm92aWRlcnMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uUHJvdmlkZXJzID0gdGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uUHJvdmlkZXJzLmV2ZW50O1xuXHRwcml2YXRlIHRhcmdldE9wZXJhdGluZ1N5c3RlbSA9IE9TO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWRhcHRlck1hbmFnZXI6IElBZGFwdGVyTWFuYWdlcixcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUhpc3RvcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaGlzdG9yeVNlcnZpY2U6IElIaXN0b3J5U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuY29uZmlnUHJvdmlkZXJzID0gW107XG5cdFx0dGhpcy50b0Rpc3Bvc2UgPSBbdGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uUHJvdmlkZXJzLCB0aGlzLl9vbkRpZFNlbGVjdENvbmZpZ3VyYXRpb25OYW1lXTtcblx0XHR0aGlzLmluaXRMYXVuY2hlcygpO1xuXHRcdHRoaXMuc2V0Q29tcG91bmRTY2hlbWFWYWx1ZXMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdFx0Y29uc3QgcHJldmlvdXNTZWxlY3RlZFJvb3QgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChERUJVR19TRUxFQ1RFRF9ST09ULCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRjb25zdCBwcmV2aW91c1NlbGVjdGVkVHlwZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KERFQlVHX1NFTEVDVEVEX1RZUEUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGNvbnN0IHByZXZpb3VzU2VsZWN0ZWRMYXVuY2ggPSB0aGlzLmxhdW5jaGVzLmZpbmQobCA9PiBsLnVyaS50b1N0cmluZygpID09PSBwcmV2aW91c1NlbGVjdGVkUm9vdCk7XG5cdFx0Y29uc3QgcHJldmlvdXNTZWxlY3RlZE5hbWUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChERUJVR19TRUxFQ1RFRF9DT05GSUdfTkFNRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdHRoaXMuZGVidWdDb25maWd1cmF0aW9uVHlwZUNvbnRleHQgPSBDT05URVhUX0RFQlVHX0NPTkZJR1VSQVRJT05fVFlQRS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGR5bmFtaWNDb25maWcgPSBwcmV2aW91c1NlbGVjdGVkVHlwZSA/IHsgdHlwZTogcHJldmlvdXNTZWxlY3RlZFR5cGUgfSA6IHVuZGVmaW5lZDtcblx0XHRpZiAocHJldmlvdXNTZWxlY3RlZExhdW5jaCAmJiBwcmV2aW91c1NlbGVjdGVkTGF1bmNoLmdldENvbmZpZ3VyYXRpb25OYW1lcygpLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5zZWxlY3RDb25maWd1cmF0aW9uKHByZXZpb3VzU2VsZWN0ZWRMYXVuY2gsIHByZXZpb3VzU2VsZWN0ZWROYW1lLCB1bmRlZmluZWQsIGR5bmFtaWNDb25maWcpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5sYXVuY2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLnNlbGVjdENvbmZpZ3VyYXRpb24odW5kZWZpbmVkLCBwcmV2aW91c1NlbGVjdGVkTmFtZSwgdW5kZWZpbmVkLCBkeW5hbWljQ29uZmlnKTtcblx0XHR9XG5cdFx0dGhpcy5yZXNvbHZlVGFyZ2V0T3BlcmF0aW5nU3lzdGVtKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVUYXJnZXRPcGVyYXRpbmdTeXN0ZW0oKTogdm9pZCB7XG5cdFx0dGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKS50aGVuKGVudmlyb25tZW50ID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldE9wZXJhdGluZ1N5c3RlbSA9IGVudmlyb25tZW50Py5vcyA/PyBPUztcblx0XHRcdGlmICh0aGlzLnRhcmdldE9wZXJhdGluZ1N5c3RlbSAhPT0gdGFyZ2V0T3BlcmF0aW5nU3lzdGVtKSB7XG5cdFx0XHRcdHRoaXMudGFyZ2V0T3BlcmF0aW5nU3lzdGVtID0gdGFyZ2V0T3BlcmF0aW5nU3lzdGVtO1xuXHRcdFx0XHR0aGlzLl9vbkRpZFNlbGVjdENvbmZpZ3VyYXRpb25OYW1lLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9LCAoKSA9PiB7XG5cdFx0XHQvLyBJZ25vcmUgcmVtb3RlIGVudmlyb25tZW50IGZhaWx1cmVzIGFuZCBmYWxsIGJhY2sgdG8gdGhlIGxvY2FsIE9TLlxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0VGFyZ2V0T3BlcmF0aW5nU3lzdGVtKCkge1xuXHRcdHJldHVybiB0aGlzLnRhcmdldE9wZXJhdGluZ1N5c3RlbTtcblx0fVxuXG5cdHJlZ2lzdGVyRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIoZGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXI6IElEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLmNvbmZpZ1Byb3ZpZGVycy5wdXNoKGRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25Qcm92aWRlcnMuZmlyZSgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMudW5yZWdpc3RlckRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKGRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uUHJvdmlkZXJzLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0dW5yZWdpc3RlckRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKGRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyOiBJRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBpeCA9IHRoaXMuY29uZmlnUHJvdmlkZXJzLmluZGV4T2YoZGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIpO1xuXHRcdGlmIChpeCA+PSAwKSB7XG5cdFx0XHR0aGlzLmNvbmZpZ1Byb3ZpZGVycy5zcGxpY2UoaXgsIDEpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBpZiBzY29wZSBpcyBub3Qgc3BlY2lmaWVkLGEgdmFsdWUgb2YgRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZVRyaWdnZXIuSW5pdGlhbCBpcyBhc3N1bWVkLlxuXHQgKi9cblx0aGFzRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIoZGVidWdUeXBlOiBzdHJpbmcsIHRyaWdnZXJLaW5kPzogRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJUcmlnZ2VyS2luZCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0cmlnZ2VyS2luZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0cmlnZ2VyS2luZCA9IERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyVHJpZ2dlcktpbmQuSW5pdGlhbDtcblx0XHR9XG5cdFx0Ly8gY2hlY2sgaWYgdGhlcmUgYXJlIHByb3ZpZGVycyBmb3IgdGhlIGdpdmVuIHR5cGUgdGhhdCBjb250cmlidXRlIGEgcHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMgbWV0aG9kXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmNvbmZpZ1Byb3ZpZGVycy5maW5kKHAgPT4gcC5wcm92aWRlRGVidWdDb25maWd1cmF0aW9ucyAmJiAocC50eXBlID09PSBkZWJ1Z1R5cGUpICYmIChwLnRyaWdnZXJLaW5kID09PSB0cmlnZ2VyS2luZCkpO1xuXHRcdHJldHVybiAhIXByb3ZpZGVyO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUNvbmZpZ3VyYXRpb25CeVByb3ZpZGVycyhmb2xkZXJVcmk6IHVyaSB8IHVuZGVmaW5lZCwgdHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBjb25maWc6IElDb25maWcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNvbmZpZyB8IG51bGwgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXNvbHZlRGVidWdDb25maWd1cmF0aW9uRm9yVHlwZSA9IGFzeW5jICh0eXBlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbmZpZzogSUNvbmZpZyB8IG51bGwgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGlmICh0eXBlICE9PSAnKicpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5hZGFwdGVyTWFuYWdlci5hY3RpdmF0ZURlYnVnZ2Vycygnb25EZWJ1Z1Jlc29sdmUnLCB0eXBlKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBwIG9mIHRoaXMuY29uZmlnUHJvdmlkZXJzKSB7XG5cdFx0XHRcdGlmIChwLnR5cGUgPT09IHR5cGUgJiYgcC5yZXNvbHZlRGVidWdDb25maWd1cmF0aW9uICYmIGNvbmZpZykge1xuXHRcdFx0XHRcdGNvbmZpZyA9IGF3YWl0IHAucmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbihmb2xkZXJVcmksIGNvbmZpZywgdG9rZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjb25maWc7XG5cdFx0fTtcblxuXHRcdGxldCByZXNvbHZlZFR5cGUgPSBjb25maWcudHlwZSA/PyB0eXBlO1xuXHRcdGxldCByZXN1bHQ6IElDb25maWcgfCBudWxsIHwgdW5kZWZpbmVkID0gY29uZmlnO1xuXHRcdGZvciAobGV0IHNlZW4gPSBuZXcgU2V0KCk7IHJlc3VsdCAmJiAhc2Vlbi5oYXMocmVzb2x2ZWRUeXBlKTspIHtcblx0XHRcdHNlZW4uYWRkKHJlc29sdmVkVHlwZSk7XG5cdFx0XHRyZXN1bHQgPSBhd2FpdCByZXNvbHZlRGVidWdDb25maWd1cmF0aW9uRm9yVHlwZShyZXNvbHZlZFR5cGUsIHJlc3VsdCk7XG5cdFx0XHRyZXN1bHQgPSBhd2FpdCByZXNvbHZlRGVidWdDb25maWd1cmF0aW9uRm9yVHlwZSgnKicsIHJlc3VsdCk7XG5cdFx0XHRyZXNvbHZlZFR5cGUgPSByZXN1bHQ/LnR5cGUgPz8gdHlwZSE7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb25XaXRoU3Vic3RpdHV0ZWRWYXJpYWJsZXMoZm9sZGVyVXJpOiB1cmkgfCB1bmRlZmluZWQsIHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29uZmlnOiBJQ29uZmlnLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDb25maWcgfCBudWxsIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gcGlwZSB0aGUgY29uZmlnIHRocm91Z2ggdGhlIHByb21pc2VzIHNlcXVlbnRpYWxseS4gQXBwZW5kIGF0IHRoZSBlbmQgdGhlICcqJyB0eXBlc1xuXHRcdGNvbnN0IHByb3ZpZGVycyA9IHRoaXMuY29uZmlnUHJvdmlkZXJzLmZpbHRlcihwID0+IHAudHlwZSA9PT0gdHlwZSAmJiBwLnJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb25XaXRoU3Vic3RpdHV0ZWRWYXJpYWJsZXMpXG5cdFx0XHQuY29uY2F0KHRoaXMuY29uZmlnUHJvdmlkZXJzLmZpbHRlcihwID0+IHAudHlwZSA9PT0gJyonICYmIHAucmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbldpdGhTdWJzdGl0dXRlZFZhcmlhYmxlcykpO1xuXG5cdFx0bGV0IHJlc3VsdDogSUNvbmZpZyB8IG51bGwgfCB1bmRlZmluZWQgPSBjb25maWc7XG5cdFx0YXdhaXQgc2VxdWVuY2UocHJvdmlkZXJzLm1hcChwcm92aWRlciA9PiBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBJZiBhbnkgcHJvdmlkZXIgcmV0dXJuZWQgdW5kZWZpbmVkIG9yIG51bGwgbWFrZSBzdXJlIHRvIHJlc3BlY3QgdGhhdCBhbmQgZG8gbm90IHBhc3MgdGhlIHJlc3VsdCB0byBtb3JlIHJlc29sdmVyXG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb25XaXRoU3Vic3RpdHV0ZWRWYXJpYWJsZXMhKGZvbGRlclVyaSwgcmVzdWx0LCB0b2tlbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVEZWJ1Z0NvbmZpZ3VyYXRpb25zKGZvbGRlclVyaTogdXJpIHwgdW5kZWZpbmVkLCB0eXBlOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8YW55W10+IHtcblx0XHRhd2FpdCB0aGlzLmFkYXB0ZXJNYW5hZ2VyLmFjdGl2YXRlRGVidWdnZXJzKCdvbkRlYnVnSW5pdGlhbENvbmZpZ3VyYXRpb25zJyk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHRoaXMuY29uZmlnUHJvdmlkZXJzLmZpbHRlcihwID0+IHAudHlwZSA9PT0gdHlwZSAmJiBwLnRyaWdnZXJLaW5kID09PSBEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlclRyaWdnZXJLaW5kLkluaXRpYWwgJiYgcC5wcm92aWRlRGVidWdDb25maWd1cmF0aW9ucykubWFwKHAgPT4gcC5wcm92aWRlRGVidWdDb25maWd1cmF0aW9ucyEoZm9sZGVyVXJpLCB0b2tlbikpKTtcblxuXHRcdHJldHVybiByZXN1bHRzLnJlZHVjZSgoZmlyc3QsIHNlY29uZCkgPT4gZmlyc3QuY29uY2F0KHNlY29uZCksIFtdKTtcblx0fVxuXG5cdGFzeW5jIGdldER5bmFtaWNQcm92aWRlcnMoKTogUHJvbWlzZTx7IGxhYmVsOiBzdHJpbmc7IHR5cGU6IHN0cmluZzsgZ2V0UHJvdmlkZXI6ICgpID0+IFByb21pc2U8SURlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyIHwgdW5kZWZpbmVkPjsgcGljazogKCkgPT4gUHJvbWlzZTx7IGxhdW5jaDogSUxhdW5jaDsgY29uZmlnOiBJQ29uZmlnOyBsYWJlbDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+IH1bXT4ge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRjb25zdCBkZWJ1Z0R5bmFtaWNFeHRlbnNpb25zVHlwZXMgPSB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5yZWR1Y2UoKGFjYywgZSkgPT4ge1xuXHRcdFx0aWYgKCFlLmFjdGl2YXRpb25FdmVudHMpIHtcblx0XHRcdFx0cmV0dXJuIGFjYztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZXhwbGljaXRUeXBlczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGxldCBoYXNHZW5lcmljRXZlbnQgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgZXZlbnQgb2YgZS5hY3RpdmF0aW9uRXZlbnRzKSB7XG5cdFx0XHRcdGlmIChldmVudCA9PT0gT05fREVCVUdfRFlOQU1JQ19DT05GSUdVUkFUSU9OU19OQU1FKSB7XG5cdFx0XHRcdFx0aGFzR2VuZXJpY0V2ZW50ID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIGlmIChldmVudC5zdGFydHNXaXRoKGAke09OX0RFQlVHX0RZTkFNSUNfQ09ORklHVVJBVElPTlNfTkFNRX06YCkpIHtcblx0XHRcdFx0XHRleHBsaWNpdFR5cGVzLnB1c2goZXZlbnQuc2xpY2UoT05fREVCVUdfRFlOQU1JQ19DT05GSUdVUkFUSU9OU19OQU1FLmxlbmd0aCArIDEpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXhwbGljaXRUeXBlcy5sZW5ndGgpIHtcblx0XHRcdFx0ZXhwbGljaXRUeXBlcy5mb3JFYWNoKHQgPT4gYWNjLmFkZCh0KSk7XG5cdFx0XHR9IGVsc2UgaWYgKGhhc0dlbmVyaWNFdmVudCkge1xuXHRcdFx0XHRjb25zdCBkZWJ1Z2dlclR5cGUgPSBlLmNvbnRyaWJ1dGVzPy5kZWJ1Z2dlcnM/LlswXS50eXBlO1xuXHRcdFx0XHRpZiAoZGVidWdnZXJUeXBlKSB7XG5cdFx0XHRcdFx0YWNjLmFkZChkZWJ1Z2dlclR5cGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBhY2M7XG5cdFx0fSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXG5cdFx0Zm9yIChjb25zdCBjb25maWdQcm92aWRlciBvZiB0aGlzLmNvbmZpZ1Byb3ZpZGVycykge1xuXHRcdFx0aWYgKGNvbmZpZ1Byb3ZpZGVyLnRyaWdnZXJLaW5kID09PSBEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlclRyaWdnZXJLaW5kLkR5bmFtaWMpIHtcblx0XHRcdFx0ZGVidWdEeW5hbWljRXh0ZW5zaW9uc1R5cGVzLmFkZChjb25maWdQcm92aWRlci50eXBlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gWy4uLmRlYnVnRHluYW1pY0V4dGVuc2lvbnNUeXBlc10ubWFwKHR5cGUgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IHRoaXMuYWRhcHRlck1hbmFnZXIuZ2V0RGVidWdnZXJMYWJlbCh0eXBlKSEsXG5cdFx0XHRcdGdldFByb3ZpZGVyOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5hZGFwdGVyTWFuYWdlci5hY3RpdmF0ZURlYnVnZ2VycyhPTl9ERUJVR19EWU5BTUlDX0NPTkZJR1VSQVRJT05TX05BTUUsIHR5cGUpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNvbmZpZ1Byb3ZpZGVycy5maW5kKHAgPT4gcC50eXBlID09PSB0eXBlICYmIHAudHJpZ2dlcktpbmQgPT09IERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyVHJpZ2dlcktpbmQuRHluYW1pYyAmJiBwLnByb3ZpZGVEZWJ1Z0NvbmZpZ3VyYXRpb25zKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0dHlwZSxcblx0XHRcdFx0cGljazogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdC8vIERvIGEgbGF0ZSAnb25EZWJ1Z0R5bmFtaWNDb25maWd1cmF0aW9uc05hbWUnIGFjdGl2YXRpb24gc28gZXh0ZW5zaW9ucyBhcmUgbm90IGFjdGl2YXRlZCB0b28gZWFybHkgIzEwODU3OFxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuYWRhcHRlck1hbmFnZXIuYWN0aXZhdGVEZWJ1Z2dlcnMoT05fREVCVUdfRFlOQU1JQ19DT05GSUdVUkFUSU9OU19OQU1FLCB0eXBlKTtcblxuXHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRcdGNvbnN0IHRva2VuID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuKTtcblx0XHRcdFx0XHRjb25zdCBpbnB1dCA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJRHluYW1pY1BpY2tJdGVtPigpKTtcblx0XHRcdFx0XHRpbnB1dC5idXN5ID0gdHJ1ZTtcblx0XHRcdFx0XHRpbnB1dC5wbGFjZWhvbGRlciA9IG5scy5sb2NhbGl6ZSgnc2VsZWN0Q29uZmlndXJhdGlvbicsIFwiU2VsZWN0IExhdW5jaCBDb25maWd1cmF0aW9uXCIpO1xuXG5cdFx0XHRcdFx0Y29uc3QgY2hvc2VuUHJvbWlzZSA9IG5ldyBQcm9taXNlPElEeW5hbWljUGlja0l0ZW0gfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uRGlkQWNjZXB0KCgpID0+IHJlc29sdmUoaW5wdXQuYWN0aXZlSXRlbXNbMF0pKSk7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihhc3luYyAoY29udGV4dCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHsgbGF1bmNoLCBjb25maWcgfSA9IGNvbnRleHQuaXRlbTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgbGF1bmNoLm9wZW5Db25maWdGaWxlKHsgcHJlc2VydmVGb2N1czogZmFsc2UsIHR5cGU6IGNvbmZpZy50eXBlLCBzdXBwcmVzc0luaXRpYWxDb25maWdzOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0XHQvLyBPbmx5IExhdW5jaCBoYXZlIGEgcGluIHRyaWdnZXIgYnV0dG9uXG5cdFx0XHRcdFx0XHRcdGF3YWl0IChsYXVuY2ggYXMgTGF1bmNoKS53cml0ZUNvbmZpZ3VyYXRpb24oY29uZmlnKTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5zZWxlY3RDb25maWd1cmF0aW9uKGxhdW5jaCwgY29uZmlnLm5hbWUpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnJlbW92ZVJlY2VudER5bmFtaWNDb25maWd1cmF0aW9ucyhjb25maWcubmFtZSwgY29uZmlnLnR5cGUpO1xuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uRGlkSGlkZSgoKSA9PiByZXNvbHZlKHVuZGVmaW5lZCkpKTtcblx0XHRcdFx0XHR9KS5maW5hbGx5KCgpID0+IHRva2VuLmNhbmNlbCgpKTtcblxuXHRcdFx0XHRcdGxldCBpdGVtczogSUR5bmFtaWNQaWNrSXRlbVtdO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHQvLyBUaGlzIGF3YWl0IGludm9rZXMgdGhlIGV4dGVuc2lvbiBwcm92aWRlcnMsIHdoaWNoIG1pZ2h0IGZhaWwgZHVlIHRvIHNldmVyYWwgcmVhc29ucyxcblx0XHRcdFx0XHRcdC8vIHRoZXJlZm9yZSB3ZSBnYXRlIHRoaXMgbG9naWMgdW5kZXIgYSB0cnkvY2F0Y2ggdG8gcHJldmVudCBsZWF2aW5nIHRoZSBEZWJ1ZyBUYWJcblx0XHRcdFx0XHRcdC8vIHNlbGVjdG9yIGluIGEgYm9ya2VkIHN0YXRlLlxuXHRcdFx0XHRcdFx0aXRlbXMgPSBhd2FpdCB0aGlzLmdldER5bmFtaWNDb25maWd1cmF0aW9uc0J5VHlwZSh0eXBlLCB0b2tlbi50b2tlbik7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpbnB1dC5pdGVtcyA9IGl0ZW1zO1xuXHRcdFx0XHRcdGlucHV0LmJ1c3kgPSBmYWxzZTtcblx0XHRcdFx0XHRpbnB1dC5zaG93KCk7XG5cdFx0XHRcdFx0Y29uc3QgY2hvc2VuID0gYXdhaXQgY2hvc2VuUHJvbWlzZTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHRcdFx0XHRyZXR1cm4gY2hvc2VuO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0RHluYW1pY0NvbmZpZ3VyYXRpb25zQnlUeXBlKHR5cGU6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8SUR5bmFtaWNQaWNrSXRlbVtdPiB7XG5cdFx0Ly8gRG8gYSBsYXRlICdvbkRlYnVnRHluYW1pY0NvbmZpZ3VyYXRpb25zTmFtZScgYWN0aXZhdGlvbiBzbyBleHRlbnNpb25zIGFyZSBub3QgYWN0aXZhdGVkIHRvbyBlYXJseSAjMTA4NTc4XG5cdFx0YXdhaXQgdGhpcy5hZGFwdGVyTWFuYWdlci5hY3RpdmF0ZURlYnVnZ2VycyhPTl9ERUJVR19EWU5BTUlDX0NPTkZJR1VSQVRJT05TX05BTUUsIHR5cGUpO1xuXG5cdFx0Y29uc3QgcGlja3M6IFByb21pc2U8SUR5bmFtaWNQaWNrSXRlbVtdPltdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmNvbmZpZ1Byb3ZpZGVycy5maW5kKHAgPT4gcC50eXBlID09PSB0eXBlICYmIHAudHJpZ2dlcktpbmQgPT09IERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyVHJpZ2dlcktpbmQuRHluYW1pYyAmJiBwLnByb3ZpZGVEZWJ1Z0NvbmZpZ3VyYXRpb25zKTtcblx0XHR0aGlzLmdldExhdW5jaGVzKCkuZm9yRWFjaChsYXVuY2ggPT4ge1xuXHRcdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRcdHBpY2tzLnB1c2gocHJvdmlkZXIucHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMhKGxhdW5jaC53b3Jrc3BhY2U/LnVyaSwgdG9rZW4pLnRoZW4oY29uZmlndXJhdGlvbnMgPT4gY29uZmlndXJhdGlvbnMubWFwKGNvbmZpZyA9PiAoe1xuXHRcdFx0XHRcdGxhYmVsOiBjb25maWcubmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbGF1bmNoLm5hbWUsXG5cdFx0XHRcdFx0Y29uZmlnLFxuXHRcdFx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShkZWJ1Z0NvbmZpZ3VyZSksXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBubHMubG9jYWxpemUoJ2VkaXRMYXVuY2hDb25maWcnLCBcIkVkaXQgRGVidWcgQ29uZmlndXJhdGlvbiBpbiBsYXVuY2guanNvblwiKVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdGxhdW5jaFxuXHRcdFx0XHR9KSkpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiAoYXdhaXQgUHJvbWlzZS5hbGwocGlja3MpKS5mbGF0KCk7XG5cdH1cblxuXHRnZXRBbGxDb25maWd1cmF0aW9ucygpOiB7IGxhdW5jaDogSUxhdW5jaDsgbmFtZTogc3RyaW5nOyBwcmVzZW50YXRpb24/OiBJQ29uZmlnUHJlc2VudGF0aW9uIH1bXSB7XG5cdFx0Y29uc3QgYWxsOiB7IGxhdW5jaDogSUxhdW5jaDsgbmFtZTogc3RyaW5nOyBwcmVzZW50YXRpb24/OiBJQ29uZmlnUHJlc2VudGF0aW9uIH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgbCBvZiB0aGlzLmxhdW5jaGVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG5hbWUgb2YgbC5nZXRDb25maWd1cmF0aW9uTmFtZXMoKSkge1xuXHRcdFx0XHRjb25zdCBjb25maWcgPSBsLmdldENvbmZpZ3VyYXRpb24obmFtZSkgfHwgbC5nZXRDb21wb3VuZChuYW1lKTtcblx0XHRcdFx0aWYgKGNvbmZpZykge1xuXHRcdFx0XHRcdGFsbC5wdXNoKHsgbGF1bmNoOiBsLCBuYW1lLCBwcmVzZW50YXRpb246IGNvbmZpZy5wcmVzZW50YXRpb24gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZ2V0VmlzaWJsZUFuZFNvcnRlZChhbGwpO1xuXHR9XG5cblx0cmVtb3ZlUmVjZW50RHluYW1pY0NvbmZpZ3VyYXRpb25zKG5hbWU6IHN0cmluZywgdHlwZTogc3RyaW5nKSB7XG5cdFx0Y29uc3QgcmVtYWluaW5nID0gdGhpcy5nZXRSZWNlbnREeW5hbWljQ29uZmlndXJhdGlvbnMoKS5maWx0ZXIoYyA9PiBjLm5hbWUgIT09IG5hbWUgfHwgYy50eXBlICE9PSB0eXBlKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKERFQlVHX1JFQ0VOVF9EWU5BTUlDX0NPTkZJR1VSQVRJT05TLCBKU09OLnN0cmluZ2lmeShyZW1haW5pbmcpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdGlmICh0aGlzLnNlbGVjdGVkQ29uZmlndXJhdGlvbi5uYW1lID09PSBuYW1lICYmIHRoaXMuc2VsZWN0ZWRUeXBlID09PSB0eXBlICYmIHRoaXMuc2VsZWN0ZWREeW5hbWljKSB7XG5cdFx0XHR0aGlzLnNlbGVjdENvbmZpZ3VyYXRpb24odW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vbkRpZFNlbGVjdENvbmZpZ3VyYXRpb25OYW1lLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRnZXRSZWNlbnREeW5hbWljQ29uZmlndXJhdGlvbnMoKTogeyBuYW1lOiBzdHJpbmc7IHR5cGU6IHN0cmluZyB9W10ge1xuXHRcdHJldHVybiBKU09OLnBhcnNlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KERFQlVHX1JFQ0VOVF9EWU5BTUlDX0NPTkZJR1VSQVRJT05TLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAnW10nKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2goRXZlbnQuYW55PElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQgfCBXb3JrYmVuY2hTdGF0ZT4odGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMsIHRoaXMuY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZSkoKCkgPT4ge1xuXHRcdFx0dGhpcy5pbml0TGF1bmNoZXMoKTtcblx0XHRcdHRoaXMuc2VsZWN0Q29uZmlndXJhdGlvbih1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5zZXRDb21wb3VuZFNjaGVtYVZhbHVlcygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2xhdW5jaCcpKSB7XG5cdFx0XHRcdC8vIEEgY2hhbmdlIGhhcHBlbiBpbiB0aGUgbGF1bmNoLmpzb24uIElmIHRoZXJlIGlzIGFscmVhZHkgYSBsYXVuY2ggY29uZmlndXJhdGlvbiBzZWxlY3RlZCwgZG8gbm90IGNoYW5nZSB0aGUgc2VsZWN0aW9uLlxuXHRcdFx0XHRhd2FpdCB0aGlzLnNlbGVjdENvbmZpZ3VyYXRpb24odW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5zZXRDb21wb3VuZFNjaGVtYVZhbHVlcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuYWRhcHRlck1hbmFnZXIub25EaWREZWJ1Z2dlcnNFeHRQb2ludFJlYWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZXRDb21wb3VuZFNjaGVtYVZhbHVlcygpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgaW5pdExhdW5jaGVzKCk6IHZvaWQge1xuXHRcdHRoaXMubGF1bmNoZXMgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKGZvbGRlciA9PiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhdW5jaCwgdGhpcywgdGhpcy5hZGFwdGVyTWFuYWdlciwgZm9sZGVyKSk7XG5cdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFKSB7XG5cdFx0XHR0aGlzLmxhdW5jaGVzLnB1c2godGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3Jrc3BhY2VMYXVuY2gsIHRoaXMsIHRoaXMuYWRhcHRlck1hbmFnZXIpKTtcblx0XHR9XG5cdFx0dGhpcy5sYXVuY2hlcy5wdXNoKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlckxhdW5jaCwgdGhpcywgdGhpcy5hZGFwdGVyTWFuYWdlcikpO1xuXG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRMYXVuY2ggJiYgdGhpcy5sYXVuY2hlcy5pbmRleE9mKHRoaXMuc2VsZWN0ZWRMYXVuY2gpID09PSAtMSkge1xuXHRcdFx0dGhpcy5zZWxlY3RDb25maWd1cmF0aW9uKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRDb21wb3VuZFNjaGVtYVZhbHVlcygpOiB2b2lkIHtcblx0XHRjb25zdCBjb21wb3VuZENvbmZpZ3VyYXRpb25zU2NoZW1hID0gKDxJSlNPTlNjaGVtYT5sYXVuY2hTY2hlbWEucHJvcGVydGllcyFbJ2NvbXBvdW5kcyddLml0ZW1zKS5wcm9wZXJ0aWVzIVsnY29uZmlndXJhdGlvbnMnXTtcblx0XHRjb25zdCBsYXVuY2hOYW1lcyA9IHRoaXMubGF1bmNoZXMubWFwKGwgPT5cblx0XHRcdGwuZ2V0Q29uZmlndXJhdGlvbk5hbWVzKHRydWUpKS5yZWR1Y2UoKGZpcnN0LCBzZWNvbmQpID0+IGZpcnN0LmNvbmNhdChzZWNvbmQpLCBbXSk7XG5cdFx0KDxJSlNPTlNjaGVtYT5jb21wb3VuZENvbmZpZ3VyYXRpb25zU2NoZW1hLml0ZW1zKS5vbmVPZiFbMF0uZW51bSA9IGxhdW5jaE5hbWVzO1xuXHRcdCg8SUpTT05TY2hlbWE+Y29tcG91bmRDb25maWd1cmF0aW9uc1NjaGVtYS5pdGVtcykub25lT2YhWzFdLnByb3BlcnRpZXMhLm5hbWUuZW51bSA9IGxhdW5jaE5hbWVzO1xuXG5cdFx0Y29uc3QgZm9sZGVyTmFtZXMgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKGYgPT4gZi5uYW1lKTtcblx0XHQoPElKU09OU2NoZW1hPmNvbXBvdW5kQ29uZmlndXJhdGlvbnNTY2hlbWEuaXRlbXMpLm9uZU9mIVsxXS5wcm9wZXJ0aWVzIS5mb2xkZXIuZW51bSA9IGZvbGRlck5hbWVzO1xuXG5cdFx0anNvblJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKGxhdW5jaFNjaGVtYUlkLCBsYXVuY2hTY2hlbWEpO1xuXHR9XG5cblx0Z2V0TGF1bmNoZXMoKTogSUxhdW5jaFtdIHtcblx0XHRyZXR1cm4gdGhpcy5sYXVuY2hlcztcblx0fVxuXG5cdGdldExhdW5jaCh3b3Jrc3BhY2VVcmk6IHVyaSB8IHVuZGVmaW5lZCk6IElMYXVuY2ggfCB1bmRlZmluZWQge1xuXHRcdGlmICghdXJpLmlzVXJpKHdvcmtzcGFjZVVyaSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubGF1bmNoZXMuZmluZChsID0+IGwud29ya3NwYWNlICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGwud29ya3NwYWNlLnVyaSwgd29ya3NwYWNlVXJpKSk7XG5cdH1cblxuXHRnZXQgc2VsZWN0ZWRDb25maWd1cmF0aW9uKCk6IHsgbGF1bmNoOiBJTGF1bmNoIHwgdW5kZWZpbmVkOyBuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGdldENvbmZpZzogKCkgPT4gUHJvbWlzZTxJQ29uZmlnIHwgdW5kZWZpbmVkPjsgdHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYXVuY2g6IHRoaXMuc2VsZWN0ZWRMYXVuY2gsXG5cdFx0XHRuYW1lOiB0aGlzLnNlbGVjdGVkTmFtZSxcblx0XHRcdGdldENvbmZpZzogdGhpcy5nZXRTZWxlY3RlZENvbmZpZyxcblx0XHRcdHR5cGU6IHRoaXMuc2VsZWN0ZWRUeXBlXG5cdFx0fTtcblx0fVxuXG5cdGdldCBvbkRpZFNlbGVjdENvbmZpZ3VyYXRpb24oKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZFNlbGVjdENvbmZpZ3VyYXRpb25OYW1lLmV2ZW50O1xuXHR9XG5cblx0Z2V0V29ya3NwYWNlTGF1bmNoKCk6IElMYXVuY2ggfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSkge1xuXHRcdFx0cmV0dXJuIHRoaXMubGF1bmNoZXNbdGhpcy5sYXVuY2hlcy5sZW5ndGggLSAxXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgc2VsZWN0Q29uZmlndXJhdGlvbihsYXVuY2g6IElMYXVuY2ggfCB1bmRlZmluZWQsIG5hbWU/OiBzdHJpbmcsIGNvbmZpZz86IElDb25maWcsIGR5bmFtaWNDb25maWc/OiB7IHR5cGU/OiBzdHJpbmcgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0eXBlb2YgbGF1bmNoID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Y29uc3Qgcm9vdFVyaSA9IHRoaXMuaGlzdG9yeVNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVdvcmtzcGFjZVJvb3QoKTtcblx0XHRcdGxhdW5jaCA9IHRoaXMuZ2V0TGF1bmNoKHJvb3RVcmkpO1xuXHRcdFx0aWYgKCFsYXVuY2ggfHwgbGF1bmNoLmdldENvbmZpZ3VyYXRpb25OYW1lcygpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRsYXVuY2ggPSB0aGlzLmxhdW5jaGVzLmZpbmQobCA9PiAhIShsICYmIGwuZ2V0Q29uZmlndXJhdGlvbk5hbWVzKCkubGVuZ3RoKSkgfHwgbGF1bmNoIHx8IHRoaXMubGF1bmNoZXNbMF07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXNMYXVuY2ggPSB0aGlzLnNlbGVjdGVkTGF1bmNoO1xuXHRcdGNvbnN0IHByZXZpb3VzTmFtZSA9IHRoaXMuc2VsZWN0ZWROYW1lO1xuXHRcdGNvbnN0IHByZXZpb3VzU2VsZWN0ZWREeW5hbWljID0gdGhpcy5zZWxlY3RlZER5bmFtaWM7XG5cdFx0dGhpcy5zZWxlY3RlZExhdW5jaCA9IGxhdW5jaDtcblxuXHRcdGlmICh0aGlzLnNlbGVjdGVkTGF1bmNoKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKERFQlVHX1NFTEVDVEVEX1JPT1QsIHRoaXMuc2VsZWN0ZWRMYXVuY2gudXJpLnRvU3RyaW5nKCksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKERFQlVHX1NFTEVDVEVEX1JPT1QsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5hbWVzID0gbGF1bmNoID8gbGF1bmNoLmdldENvbmZpZ3VyYXRpb25OYW1lcygpIDogW107XG5cdFx0dGhpcy5nZXRTZWxlY3RlZENvbmZpZyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkID0gdGhpcy5zZWxlY3RlZE5hbWUgPyBsYXVuY2g/LmdldENvbmZpZ3VyYXRpb24odGhpcy5zZWxlY3RlZE5hbWUpIDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShzZWxlY3RlZCB8fCBjb25maWcpO1xuXHRcdH07XG5cblx0XHRsZXQgdHlwZSA9IGNvbmZpZz8udHlwZTtcblx0XHRpZiAobmFtZSAmJiBuYW1lcy5pbmRleE9mKG5hbWUpID49IDApIHtcblx0XHRcdHRoaXMuc2V0U2VsZWN0ZWRMYXVuY2hOYW1lKG5hbWUpO1xuXHRcdH0gZWxzZSBpZiAoZHluYW1pY0NvbmZpZyAmJiBkeW5hbWljQ29uZmlnLnR5cGUpIHtcblx0XHRcdC8vIFdlIGNvdWxkIG5vdCBmaW5kIHRoZSBwcmV2aW91c2x5IHVzZWQgbmFtZSBhbmQgY29uZmlnIGlzIG5vdCBwYXNzZWQuIFdlIHNob3VsZCBnZXQgYWxsIGR5bmFtaWMgY29uZmlndXJhdGlvbnMgZnJvbSBwcm92aWRlcnNcblx0XHRcdC8vIEFuZCBwb3RlbnRpYWxseSBhdXRvIHNlbGVjdCB0aGUgcHJldmlvdXNseSB1c2VkIGR5bmFtaWMgY29uZmlndXJhdGlvbiAjOTYyOTNcblx0XHRcdHR5cGUgPSBkeW5hbWljQ29uZmlnLnR5cGU7XG5cdFx0XHRpZiAoIWNvbmZpZykge1xuXHRcdFx0XHRjb25zdCBwcm92aWRlcnMgPSAoYXdhaXQgdGhpcy5nZXREeW5hbWljUHJvdmlkZXJzKCkpLmZpbHRlcihwID0+IHAudHlwZSA9PT0gdHlwZSk7XG5cdFx0XHRcdHRoaXMuZ2V0U2VsZWN0ZWRDb25maWcgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZhdGVkUHJvdmlkZXJzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvdmlkZXJzLm1hcChwID0+IHAuZ2V0UHJvdmlkZXIoKSkpO1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gYWN0aXZhdGVkUHJvdmlkZXJzLmxlbmd0aCA+IDAgPyBhY3RpdmF0ZWRQcm92aWRlcnNbMF0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKHByb3ZpZGVyICYmIGxhdW5jaCAmJiBsYXVuY2gud29ya3NwYWNlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0b2tlbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZHluYW1pY0NvbmZpZ3MgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlRGVidWdDb25maWd1cmF0aW9ucyEobGF1bmNoLndvcmtzcGFjZS51cmksIHRva2VuLnRva2VuKTtcblx0XHRcdFx0XHRcdGNvbnN0IGR5bmFtaWNDb25maWcgPSBkeW5hbWljQ29uZmlncy5maW5kKGMgPT4gYy5uYW1lID09PSBuYW1lKTtcblx0XHRcdFx0XHRcdGlmIChkeW5hbWljQ29uZmlnKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBkeW5hbWljQ29uZmlnO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNldFNlbGVjdGVkTGF1bmNoTmFtZShuYW1lKTtcblxuXHRcdFx0bGV0IHJlY2VudER5bmFtaWNQcm92aWRlcnMgPSB0aGlzLmdldFJlY2VudER5bmFtaWNDb25maWd1cmF0aW9ucygpO1xuXHRcdFx0aWYgKG5hbWUgJiYgZHluYW1pY0NvbmZpZy50eXBlKSB7XG5cdFx0XHRcdC8vIFdlIG5lZWQgdG8gc3RvcmUgdGhlIHJlY2VudGx5IHVzZWQgZHluYW1pYyBjb25maWd1cmF0aW9ucyB0byBiZSBhYmxlIHRvIHNob3cgdGhlbSBpbiBVSSAjMTEwMDA5XG5cdFx0XHRcdHJlY2VudER5bmFtaWNQcm92aWRlcnMudW5zaGlmdCh7IG5hbWUsIHR5cGU6IGR5bmFtaWNDb25maWcudHlwZSB9KTtcblx0XHRcdFx0cmVjZW50RHluYW1pY1Byb3ZpZGVycyA9IGRpc3RpbmN0KHJlY2VudER5bmFtaWNQcm92aWRlcnMsIHQgPT4gYCR7dC5uYW1lfSA6ICR7dC50eXBlfWApO1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKERFQlVHX1JFQ0VOVF9EWU5BTUlDX0NPTkZJR1VSQVRJT05TLCBKU09OLnN0cmluZ2lmeShyZWNlbnREeW5hbWljUHJvdmlkZXJzKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCF0aGlzLnNlbGVjdGVkTmFtZSB8fCBuYW1lcy5pbmRleE9mKHRoaXMuc2VsZWN0ZWROYW1lKSA9PT0gLTEpIHtcblx0XHRcdC8vIFdlIGNvdWxkIG5vdCBmaW5kIHRoZSBjb25maWd1cmF0aW9uIHRvIHNlbGVjdCwgcGljayB0aGUgZmlyc3Qgb25lLCBvciByZXNldCB0aGUgc2VsZWN0aW9uIGlmIHRoZXJlIGlzIG5vIGxhdW5jaCBjb25maWd1cmF0aW9uXG5cdFx0XHRjb25zdCBuYW1lVG9TZXQgPSBuYW1lcy5sZW5ndGggPyBuYW1lc1swXSA6IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuc2V0U2VsZWN0ZWRMYXVuY2hOYW1lKG5hbWVUb1NldCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFjb25maWcgJiYgbGF1bmNoICYmIHRoaXMuc2VsZWN0ZWROYW1lKSB7XG5cdFx0XHRjb25maWcgPSBsYXVuY2guZ2V0Q29uZmlndXJhdGlvbih0aGlzLnNlbGVjdGVkTmFtZSk7XG5cdFx0XHR0eXBlID0gY29uZmlnPy50eXBlO1xuXHRcdH1cblxuXHRcdHRoaXMuc2VsZWN0ZWRUeXBlID0gZHluYW1pY0NvbmZpZz8udHlwZSB8fCBjb25maWc/LnR5cGU7XG5cdFx0dGhpcy5zZWxlY3RlZER5bmFtaWMgPSAhIWR5bmFtaWNDb25maWc7XG5cdFx0Ly8gT25seSBzdG9yZSB0aGUgc2VsZWN0ZWQgdHlwZSBpZiB3ZSBhcmUgaGF2aW5nIGEgZHluYW1pYyBjb25maWd1cmF0aW9uLiBPdGhlcndpc2UgcmVzdG9yaW5nIHRoaXMgY29uZmlndXJhdGlvbiBmcm9tIHN0b3JhZ2UgbWlnaHQgYmUgbWlzaW5kZW50aWZpZWQgYXMgYSBkeW5hbWljIGNvbmZpZ3VyYXRpb25cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKERFQlVHX1NFTEVDVEVEX1RZUEUsIGR5bmFtaWNDb25maWcgPyB0aGlzLnNlbGVjdGVkVHlwZSA6IHVuZGVmaW5lZCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGlmICh0eXBlKSB7XG5cdFx0XHR0aGlzLmRlYnVnQ29uZmlndXJhdGlvblR5cGVDb250ZXh0LnNldCh0eXBlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kZWJ1Z0NvbmZpZ3VyYXRpb25UeXBlQ29udGV4dC5yZXNldCgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNlbGVjdGVkTGF1bmNoICE9PSBwcmV2aW91c0xhdW5jaCB8fCB0aGlzLnNlbGVjdGVkTmFtZSAhPT0gcHJldmlvdXNOYW1lIHx8IHByZXZpb3VzU2VsZWN0ZWREeW5hbWljICE9PSB0aGlzLnNlbGVjdGVkRHluYW1pYykge1xuXHRcdFx0dGhpcy5fb25EaWRTZWxlY3RDb25maWd1cmF0aW9uTmFtZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRTZWxlY3RlZExhdW5jaE5hbWUoc2VsZWN0ZWROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLnNlbGVjdGVkTmFtZSA9IHNlbGVjdGVkTmFtZTtcblxuXHRcdGlmICh0aGlzLnNlbGVjdGVkTmFtZSkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShERUJVR19TRUxFQ1RFRF9DT05GSUdfTkFNRV9LRVksIHRoaXMuc2VsZWN0ZWROYW1lLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShERUJVR19TRUxFQ1RFRF9DT05GSUdfTkFNRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy50b0Rpc3Bvc2UgPSBkaXNwb3NlKHRoaXMudG9EaXNwb3NlKTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBBYnN0cmFjdExhdW5jaCBpbXBsZW1lbnRzIElMYXVuY2gge1xuXHRhYnN0cmFjdCByZWFkb25seSB1cmk6IHVyaTtcblx0YWJzdHJhY3QgcmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRhYnN0cmFjdCByZWFkb25seSB3b3Jrc3BhY2U6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRDb25maWcoKTogSUdsb2JhbENvbmZpZyB8IHVuZGVmaW5lZDtcblx0YWJzdHJhY3Qgb3BlbkNvbmZpZ0ZpbGUob3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuOyB0eXBlPzogc3RyaW5nIHwgdW5kZWZpbmVkOyBzdXBwcmVzc0luaXRpYWxDb25maWdzPzogYm9vbGVhbiB8IHVuZGVmaW5lZCB9LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx7IGVkaXRvcjogSUVkaXRvclBhbmUgfCBudWxsOyBjcmVhdGVkOiBib29sZWFuIH0+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCBjb25maWd1cmF0aW9uTWFuYWdlcjogQ29uZmlndXJhdGlvbk1hbmFnZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhZGFwdGVyTWFuYWdlcjogSUFkYXB0ZXJNYW5hZ2VyXG5cdCkgeyB9XG5cblx0Z2V0Q29tcG91bmQobmFtZTogc3RyaW5nKTogSUNvbXBvdW5kIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLmdldERlZHVwbGljYXRlZENvbmZpZygpO1xuXHRcdGlmICghY29uZmlnIHx8ICFjb25maWcuY29tcG91bmRzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb25maWcuY29tcG91bmRzLmZpbmQoY29tcG91bmQgPT4gY29tcG91bmQubmFtZSA9PT0gbmFtZSk7XG5cdH1cblxuXHRnZXRDb25maWd1cmF0aW9uTmFtZXMoaWdub3JlQ29tcG91bmRzQW5kUHJlc2VudGF0aW9uID0gZmFsc2UpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5nZXREZWR1cGxpY2F0ZWRDb25maWcoKTtcblx0XHRpZiAoIWNvbmZpZyB8fCAoIUFycmF5LmlzQXJyYXkoY29uZmlnLmNvbmZpZ3VyYXRpb25zKSAmJiAhQXJyYXkuaXNBcnJheShjb25maWcuY29tcG91bmRzKSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbnM6IChJQ29uZmlnIHwgSUNvbXBvdW5kKVtdID0gW107XG5cdFx0XHRpZiAoY29uZmlnLmNvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25zLnB1c2goLi4uY29uZmlnLmNvbmZpZ3VyYXRpb25zLmZpbHRlcihjZmcgPT4gY2ZnICYmIHR5cGVvZiBjZmcubmFtZSA9PT0gJ3N0cmluZycpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlnbm9yZUNvbXBvdW5kc0FuZFByZXNlbnRhdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gY29uZmlndXJhdGlvbnMubWFwKGMgPT4gYy5uYW1lKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbmZpZy5jb21wb3VuZHMpIHtcblx0XHRcdFx0Y29uZmlndXJhdGlvbnMucHVzaCguLi5jb25maWcuY29tcG91bmRzLmZpbHRlcihjb21wb3VuZCA9PiB0eXBlb2YgY29tcG91bmQubmFtZSA9PT0gJ3N0cmluZycgJiYgY29tcG91bmQuY29uZmlndXJhdGlvbnMgJiYgY29tcG91bmQuY29uZmlndXJhdGlvbnMubGVuZ3RoKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IGNvbmZpZ3VyYXRpb25zLm1hcChjID0+IGlzRGVidWdDb25maWcoYykgPyBnZXRFZmZlY3RpdmVDb25maWdGb3JQbGF0Zm9ybShjLCB0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLmdldFRhcmdldE9wZXJhdGluZ1N5c3RlbSgpKSA6IGMpO1xuXHRcdFx0cmV0dXJuIGdldFZpc2libGVBbmRTb3J0ZWQocmVzb2x2ZWQpLm1hcChjID0+IGMubmFtZSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0Q29uZmlndXJhdGlvbihuYW1lOiBzdHJpbmcpOiBJQ29uZmlnIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBXZSBuZWVkIHRvIGNsb25lIHRoZSBjb25maWd1cmF0aW9uIGluIG9yZGVyIHRvIGJlIGFibGUgdG8gbWFrZSBjaGFuZ2VzIHRvIGl0ICM0MjE5OFxuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuZ2V0RGVkdXBsaWNhdGVkQ29uZmlnKCk7XG5cdFx0aWYgKCFjb25maWcgfHwgIWNvbmZpZy5jb25maWd1cmF0aW9ucykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IGNvbmZpZy5jb25maWd1cmF0aW9ucy5maW5kKGNvbmZpZyA9PiBjb25maWcgJiYgY29uZmlnLm5hbWUgPT09IG5hbWUpO1xuXHRcdGlmICghY29uZmlndXJhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVmZmVjdGl2ZUNvbmZpZ3VyYXRpb24gPSBnZXRFZmZlY3RpdmVDb25maWdGb3JQbGF0Zm9ybShjb25maWd1cmF0aW9uLCB0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLmdldFRhcmdldE9wZXJhdGluZ1N5c3RlbSgpKTtcblxuXHRcdGlmICh0aGlzIGluc3RhbmNlb2YgVXNlckxhdW5jaCkge1xuXHRcdFx0cmV0dXJuIHsgLi4uZWZmZWN0aXZlQ29uZmlndXJhdGlvbiwgX19jb25maWd1cmF0aW9uVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIgfTtcblx0XHR9IGVsc2UgaWYgKHRoaXMgaW5zdGFuY2VvZiBXb3Jrc3BhY2VMYXVuY2gpIHtcblx0XHRcdHJldHVybiB7IC4uLmVmZmVjdGl2ZUNvbmZpZ3VyYXRpb24sIF9fY29uZmlndXJhdGlvblRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHsgLi4uZWZmZWN0aXZlQ29uZmlndXJhdGlvbiwgX19jb25maWd1cmF0aW9uVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIgfTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRJbml0aWFsQ29uZmlndXJhdGlvbkNvbnRlbnQoZm9sZGVyVXJpPzogdXJpLCB0eXBlPzogc3RyaW5nLCB1c2VJbml0aWFsQ29uZmlncz86IGJvb2xlYW4sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGxldCBjb250ZW50ID0gJyc7XG5cdFx0Y29uc3QgYWRhcHRlcjogUGFydGlhbDxJR3Vlc3NlZERlYnVnZ2VyPiB8IHVuZGVmaW5lZCA9IHR5cGVcblx0XHRcdD8geyBkZWJ1Z2dlcjogdGhpcy5hZGFwdGVyTWFuYWdlci5nZXRFbmFibGVkRGVidWdnZXIodHlwZSkgfVxuXHRcdFx0OiBhd2FpdCB0aGlzLmFkYXB0ZXJNYW5hZ2VyLmd1ZXNzRGVidWdnZXIodHJ1ZSk7XG5cblx0XHRpZiAoYWRhcHRlcj8ud2l0aENvbmZpZyAmJiBhZGFwdGVyLmRlYnVnZ2VyKSB7XG5cdFx0XHRjb250ZW50ID0gYXdhaXQgYWRhcHRlci5kZWJ1Z2dlci5nZXRJbml0aWFsQ29uZmlndXJhdGlvbkNvbnRlbnQoW2FkYXB0ZXIud2l0aENvbmZpZy5jb25maWddKTtcblx0XHR9IGVsc2UgaWYgKGFkYXB0ZXI/LmRlYnVnZ2VyKSB7XG5cdFx0XHRjb25zdCBpbml0aWFsQ29uZmlncyA9IHVzZUluaXRpYWxDb25maWdzID9cblx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uTWFuYWdlci5wcm92aWRlRGVidWdDb25maWd1cmF0aW9ucyhmb2xkZXJVcmksIGFkYXB0ZXIuZGVidWdnZXIudHlwZSwgdG9rZW4gfHwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkgOlxuXHRcdFx0XHRbXTtcblx0XHRcdGNvbnRlbnQgPSBhd2FpdCBhZGFwdGVyLmRlYnVnZ2VyLmdldEluaXRpYWxDb25maWd1cmF0aW9uQ29udGVudChpbml0aWFsQ29uZmlncyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdH1cblxuXG5cdGdldCBoaWRkZW4oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREZWR1cGxpY2F0ZWRDb25maWcoKTogSUdsb2JhbENvbmZpZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSB0aGlzLmdldENvbmZpZygpO1xuXHRcdGlmICghb3JpZ2luYWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbXBvdW5kcyA9IG9yaWdpbmFsLmNvbXBvdW5kcz8uZmlsdGVyKChjb21wb3VuZCk6IGNvbXBvdW5kIGlzIElDb21wb3VuZCA9PiAhIWNvbXBvdW5kICYmIHR5cGVvZiBjb21wb3VuZC5uYW1lID09PSAnc3RyaW5nJykgPz8gW107XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbnMgPSBvcmlnaW5hbC5jb25maWd1cmF0aW9ucz8uZmlsdGVyKChjb25maWd1cmF0aW9uKTogY29uZmlndXJhdGlvbiBpcyBJQ29uZmlnID0+ICEhY29uZmlndXJhdGlvbiAmJiB0eXBlb2YgY29uZmlndXJhdGlvbi5uYW1lID09PSAnc3RyaW5nJykgPz8gW107XG5cdFx0cmV0dXJuIHtcblx0XHRcdHZlcnNpb246IG9yaWdpbmFsLnZlcnNpb24sXG5cdFx0XHRjb21wb3VuZHM6IGRpc3Rpbmd1aXNoQ29uZmlnc0J5TmFtZShjb21wb3VuZHMpLFxuXHRcdFx0Y29uZmlndXJhdGlvbnM6IGRpc3Rpbmd1aXNoQ29uZmlnc0J5TmFtZShjb25maWd1cmF0aW9ucyksXG5cdFx0fTtcblx0fVxufVxuXG5mdW5jdGlvbiBkaXN0aW5ndWlzaENvbmZpZ3NCeU5hbWU8VCBleHRlbmRzIHsgbmFtZTogc3RyaW5nIH0+KHRoaW5nczogcmVhZG9ubHkgVFtdKTogVFtdIHtcblx0Y29uc3Qgc2VlbiA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdHJldHVybiB0aGluZ3MubWFwKHRoaW5nID0+IHtcblx0XHRjb25zdCBubyA9IHNlZW4uZ2V0KHRoaW5nLm5hbWUpIHx8IDA7XG5cdFx0c2Vlbi5zZXQodGhpbmcubmFtZSwgbm8gKyAxKTtcblx0XHRyZXR1cm4gbm8gPT09IDAgPyB0aGluZyA6IHsgLi4udGhpbmcsIG5hbWU6IGAke3RoaW5nLm5hbWV9ICgke25vfSlgIH07XG5cdH0pO1xufVxuXG5jbGFzcyBMYXVuY2ggZXh0ZW5kcyBBYnN0cmFjdExhdW5jaCBpbXBsZW1lbnRzIElMYXVuY2gge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbmZpZ3VyYXRpb25NYW5hZ2VyOiBDb25maWd1cmF0aW9uTWFuYWdlcixcblx0XHRhZGFwdGVyTWFuYWdlcjogSUFkYXB0ZXJNYW5hZ2VyLFxuXHRcdHB1YmxpYyB3b3Jrc3BhY2U6IElXb3Jrc3BhY2VGb2xkZXIsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoY29uZmlndXJhdGlvbk1hbmFnZXIsIGFkYXB0ZXJNYW5hZ2VyKTtcblx0fVxuXG5cdGdldCB1cmkoKTogdXJpIHtcblx0XHRyZXR1cm4gcmVzb3VyY2VzLmpvaW5QYXRoKHRoaXMud29ya3NwYWNlLnVyaSwgJy8udnNjb2RlL2xhdW5jaC5qc29uJyk7XG5cdH1cblxuXHRnZXQgbmFtZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZS5uYW1lO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldENvbmZpZygpOiBJR2xvYmFsQ29uZmlnIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PElHbG9iYWxDb25maWc+KCdsYXVuY2gnLCB7IHJlc291cmNlOiB0aGlzLndvcmtzcGFjZS51cmkgfSkud29ya3NwYWNlRm9sZGVyVmFsdWU7XG5cdH1cblxuXHRhc3luYyBvcGVuQ29uZmlnRmlsZSh7IHByZXNlcnZlRm9jdXMsIHR5cGUsIHN1cHByZXNzSW5pdGlhbENvbmZpZ3MgfTogeyBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuOyB0eXBlPzogc3RyaW5nOyBzdXBwcmVzc0luaXRpYWxDb25maWdzPzogYm9vbGVhbiB9LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IGVkaXRvcjogSUVkaXRvclBhbmUgfCBudWxsOyBjcmVhdGVkOiBib29sZWFuIH0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMudXJpO1xuXHRcdGxldCBjcmVhdGVkID0gZmFsc2U7XG5cdFx0bGV0IGNvbnRlbnQgPSAnJztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZmlsZUNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRcdGNvbnRlbnQgPSBmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gbGF1bmNoLmpzb24gbm90IGZvdW5kOiBjcmVhdGUgb25lIGJ5IGNvbGxlY3RpbmcgbGF1bmNoIGNvbmZpZ3MgZnJvbSBkZWJ1Z0NvbmZpZ1Byb3ZpZGVyc1xuXHRcdFx0Y29udGVudCA9IGF3YWl0IHRoaXMuZ2V0SW5pdGlhbENvbmZpZ3VyYXRpb25Db250ZW50KHRoaXMud29ya3NwYWNlLnVyaSwgdHlwZSwgIXN1cHByZXNzSW5pdGlhbENvbmZpZ3MsIHRva2VuKTtcblx0XHRcdGlmICghY29udGVudCkge1xuXHRcdFx0XHQvLyBDYW5jZWxsZWRcblx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBudWxsLCBjcmVhdGVkOiBmYWxzZSB9O1xuXHRcdFx0fVxuXG5cdFx0XHRjcmVhdGVkID0gdHJ1ZTsgLy8gcGluIG9ubHkgaWYgY29uZmlnIGZpbGUgaXMgY3JlYXRlZCAjODcyN1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2Uud3JpdGUocmVzb3VyY2UsIGNvbnRlbnQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnRGVidWdDb25maWcuZmFpbGVkJywgXCJVbmFibGUgdG8gY3JlYXRlICdsYXVuY2guanNvbicgZmlsZSBpbnNpZGUgdGhlICcudnNjb2RlJyBmb2xkZXIgKHswfSkuXCIsIGVycm9yLm1lc3NhZ2UpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpbmRleCA9IGNvbnRlbnQuaW5kZXhPZihgXCIke3RoaXMuY29uZmlndXJhdGlvbk1hbmFnZXIuc2VsZWN0ZWRDb25maWd1cmF0aW9uLm5hbWV9XCJgKTtcblx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gMTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGluZGV4OyBpKyspIHtcblx0XHRcdGlmIChjb250ZW50LmNoYXJBdChpKSA9PT0gJ1xcbicpIHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyKys7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHN0YXJ0TGluZU51bWJlciA+IDEgPyB7IHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW46IDQgfSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRzZWxlY3Rpb24sXG5cdFx0XHRcdHByZXNlcnZlRm9jdXMsXG5cdFx0XHRcdHBpbm5lZDogY3JlYXRlZCxcblx0XHRcdFx0cmV2ZWFsSWZWaXNpYmxlOiB0cnVlXG5cdFx0XHR9LFxuXHRcdH0sIEFDVElWRV9HUk9VUCk7XG5cblx0XHRyZXR1cm4gKHtcblx0XHRcdGVkaXRvcjogZWRpdG9yID8/IG51bGwsXG5cdFx0XHRjcmVhdGVkXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyB3cml0ZUNvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbjogSUNvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIG5vdGU6IHdlIGRvbid0IGdldCB0aGUgZGVkdXBsaWNhdGVkIGNvbmZpZyBzaW5jZSB3ZSBkb24ndCB3YW50IHRoYXQgdG8gJ2xlYWsnIGludG8gdGhlIGZpbGVcblx0XHRjb25zdCBmdWxsQ29uZmlnOiBQYXJ0aWFsPElHbG9iYWxDb25maWc+ID0geyAuLi4odGhpcy5nZXRDb25maWcoKSA/PyB7fSkgfTtcblx0XHRmdWxsQ29uZmlnLmNvbmZpZ3VyYXRpb25zID0gWy4uLmZ1bGxDb25maWcuY29uZmlndXJhdGlvbnMgfHwgW10sIGNvbmZpZ3VyYXRpb25dO1xuXHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2xhdW5jaCcsIGZ1bGxDb25maWcsIHsgcmVzb3VyY2U6IHRoaXMud29ya3NwYWNlLnVyaSB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpO1xuXHR9XG59XG5cbmNsYXNzIFdvcmtzcGFjZUxhdW5jaCBleHRlbmRzIEFic3RyYWN0TGF1bmNoIGltcGxlbWVudHMgSUxhdW5jaCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbmZpZ3VyYXRpb25NYW5hZ2VyOiBDb25maWd1cmF0aW9uTWFuYWdlcixcblx0XHRhZGFwdGVyTWFuYWdlcjogSUFkYXB0ZXJNYW5hZ2VyLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGNvbmZpZ3VyYXRpb25NYW5hZ2VyLCBhZGFwdGVyTWFuYWdlcik7XG5cdH1cblxuXHRnZXQgd29ya3NwYWNlKCk6IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCB1cmkoKTogdXJpIHtcblx0XHRyZXR1cm4gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5jb25maWd1cmF0aW9uITtcblx0fVxuXG5cdGdldCBuYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlJywgXCJ3b3Jrc3BhY2VcIik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0Q29uZmlnKCk6IElHbG9iYWxDb25maWcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8SUdsb2JhbENvbmZpZz4oJ2xhdW5jaCcpLndvcmtzcGFjZVZhbHVlO1xuXHR9XG5cblx0YXN5bmMgb3BlbkNvbmZpZ0ZpbGUoeyBwcmVzZXJ2ZUZvY3VzLCB0eXBlLCB1c2VJbml0aWFsQ29uZmlncyB9OiB7IHByZXNlcnZlRm9jdXM6IGJvb2xlYW47IHR5cGU/OiBzdHJpbmc7IHVzZUluaXRpYWxDb25maWdzPzogYm9vbGVhbiB9LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IGVkaXRvcjogSUVkaXRvclBhbmUgfCBudWxsOyBjcmVhdGVkOiBib29sZWFuIH0+IHtcblx0XHRjb25zdCBsYXVuY2hFeGlzdEluRmlsZSA9ICEhdGhpcy5nZXRDb25maWcoKTtcblx0XHRpZiAoIWxhdW5jaEV4aXN0SW5GaWxlKSB7XG5cdFx0XHQvLyBMYXVuY2ggcHJvcGVydHkgaW4gd29ya3NwYWNlIGNvbmZpZyBub3QgZm91bmQ6IGNyZWF0ZSBvbmUgYnkgY29sbGVjdGluZyBsYXVuY2ggY29uZmlncyBmcm9tIGRlYnVnQ29uZmlnUHJvdmlkZXJzXG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5nZXRJbml0aWFsQ29uZmlndXJhdGlvbkNvbnRlbnQodW5kZWZpbmVkLCB0eXBlLCB1c2VJbml0aWFsQ29uZmlncywgdG9rZW4pO1xuXHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnbGF1bmNoJywganNvbi5wYXJzZShjb250ZW50KSwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBudWxsLCBjcmVhdGVkOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmNvbmZpZ3VyYXRpb24hLFxuXHRcdFx0b3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzIH1cblx0XHR9LCBBQ1RJVkVfR1JPVVApO1xuXG5cdFx0cmV0dXJuICh7XG5cdFx0XHRlZGl0b3I6IGVkaXRvciA/PyBudWxsLFxuXHRcdFx0Y3JlYXRlZDogZmFsc2Vcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBVc2VyTGF1bmNoIGV4dGVuZHMgQWJzdHJhY3RMYXVuY2ggaW1wbGVtZW50cyBJTGF1bmNoIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb25maWd1cmF0aW9uTWFuYWdlcjogQ29uZmlndXJhdGlvbk1hbmFnZXIsXG5cdFx0YWRhcHRlck1hbmFnZXI6IElBZGFwdGVyTWFuYWdlcixcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihjb25maWd1cmF0aW9uTWFuYWdlciwgYWRhcHRlck1hbmFnZXIpO1xuXHR9XG5cblx0Z2V0IHdvcmtzcGFjZSgpOiB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgdXJpKCk6IHVyaSB7XG5cdFx0cmV0dXJuIHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLnVzZXJTZXR0aW5nc1Jlc291cmNlO1xuXHR9XG5cblx0Z2V0IG5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd1c2VyIHNldHRpbmdzJywgXCJ1c2VyIHNldHRpbmdzXCIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGhpZGRlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRDb25maWcoKTogSUdsb2JhbENvbmZpZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxJR2xvYmFsQ29uZmlnPignbGF1bmNoJykudXNlclZhbHVlO1xuXHR9XG5cblx0YXN5bmMgb3BlbkNvbmZpZ0ZpbGUoeyBwcmVzZXJ2ZUZvY3VzLCB0eXBlLCB1c2VJbml0aWFsQ29udGVudCB9OiB7IHByZXNlcnZlRm9jdXM6IGJvb2xlYW47IHR5cGU/OiBzdHJpbmc7IHVzZUluaXRpYWxDb250ZW50PzogYm9vbGVhbiB9KTogUHJvbWlzZTx7IGVkaXRvcjogSUVkaXRvclBhbmUgfCBudWxsOyBjcmVhdGVkOiBib29sZWFuIH0+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCB0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuVXNlclNldHRpbmdzKHsganNvbkVkaXRvcjogdHJ1ZSwgcHJlc2VydmVGb2N1cywgcmV2ZWFsU2V0dGluZzogeyBrZXk6ICdsYXVuY2gnIH0gfSk7XG5cdFx0cmV0dXJuICh7XG5cdFx0XHRlZGl0b3I6IGVkaXRvciA/PyBudWxsLFxuXHRcdFx0Y3JlYXRlZDogZmFsc2Vcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxTQUFTLGFBQWE7QUFDL0IsWUFBWSxVQUFVO0FB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
