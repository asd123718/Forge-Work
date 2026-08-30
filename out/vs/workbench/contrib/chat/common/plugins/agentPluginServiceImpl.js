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
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { Event } from "../../../../../base/common/event.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { parse as parseJSONC } from "../../../../../base/common/json.js";
import { untildify } from "../../../../../base/common/labels.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { equals } from "../../../../../base/common/objects.js";
import { autorun, derived, derivedOpts, observableFromEvent, ObservablePromise, observableSignal, observableValue, transaction } from "../../../../../base/common/observable.js";
import {
  posix,
  win32
} from "../../../../../base/common/path.js";
import {
  basename,
  isEqual,
  isEqualOrParent,
  joinPath
} from "../../../../../base/common/resources.js";
import { hasKey } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { observableConfigValue } from "../../../../../platform/observable/common/platformObservableUtils.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { localize } from "../../../../../nls.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import {
  resolvePluginComponentDirs,
  getPluginManifestComponent,
  readPluginSkills,
  readMarkdownComponents,
  readPluginManifest,
  readPluginMcpServers,
  parseMcpServerDefinitionMap,
  detectPluginFormat
} from "../../../../../platform/agentPlugins/common/pluginParsers.js";
import { Extensions } from "../../../../services/extensionManagement/common/extensionFeatures.js";
import * as extensionsRegistry from "../../../../services/extensions/common/extensionsRegistry.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { ChatConfiguration } from "../constants.js";
import { ContributionEnablementState, EnablementModel } from "../enablement.js";
import { HookType } from "../promptSyntax/hookTypes.js";
import { AgentPluginCollisionEnablementModel, getAgentPluginPolicyId, getCanonicalAgentPluginCollisionGroups, getSortedAgentPlugins, isAgentPluginBlockedByPolicy } from "./agentPluginEnablement.js";
import { IAgentPluginRepositoryService } from "./agentPluginRepositoryService.js";
import { agentPluginDiscoveryRegistry } from "./agentPluginService.js";
import { IPluginMarketplaceService } from "./pluginMarketplaceService.js";
import { shellQuotePluginRootInCommand, resolveMcpServersMap, convertBareEnvVarsToVsCodeSyntax } from "../../../../../platform/agentPlugins/common/pluginParsers.js";
function toAgentPluginHooks(groups) {
  return groups.filter((g) => Object.values(HookType).includes(g.type)).map((g) => ({
    type: g.type,
    hooks: g.commands,
    uri: g.uri,
    originalId: g.originalId
  }));
}
const RULE_FILE_SUFFIXES = [".instructions.md", ".mdc", ".md"];
function resolveWorkspaceRoot(pluginUri, workspaceContextService) {
  const defaultFolder = workspaceContextService.getWorkspace().folders[0];
  const folder = workspaceContextService.getWorkspaceFolder(pluginUri) ?? defaultFolder;
  return folder?.uri;
}
let AgentPluginService = class extends Disposable {
  constructor(instantiationService, configurationService, storageService, logService) {
    super();
    const baseEnablementModel = this._register(new EnablementModel("agentPlugins.enablement", storageService));
    const pluginsEnabled = observableConfigValue(ChatConfiguration.PluginsEnabled, true, configurationService);
    const discoveries = [];
    for (const registration of agentPluginDiscoveryRegistry.getAll()) {
      const discovery = instantiationService.createInstance(registration.descriptor);
      this._register(discovery);
      discoveries.push({ discovery, priority: registration.priority, order: registration.order });
    }
    const enabledPluginsPolicy = observableFromEvent(
      this,
      Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(ChatConfiguration.EnabledPlugins)),
      () => configurationService.inspect(ChatConfiguration.EnabledPlugins).policyValue
    );
    const collisionGroups = derived((reader) => {
      if (!pluginsEnabled.read(reader)) {
        return /* @__PURE__ */ new Map();
      }
      const discoveredPlugins = readDiscoveredAgentPlugins(discoveries, reader);
      if (!discoveredPlugins) {
        return /* @__PURE__ */ new Map();
      }
      const policy = enabledPluginsPolicy.read(reader);
      return getCanonicalAgentPluginCollisionGroups(discoveredPlugins, (plugin) => isAgentPluginBlockedByPolicy(plugin, policy));
    });
    this.enablementModel = new AgentPluginCollisionEnablementModel(baseEnablementModel, collisionGroups);
    for (const { discovery } of discoveries) {
      discovery.start(this.enablementModel);
    }
    this.plugins = derived((read) => {
      if (!pluginsEnabled.read(read)) {
        return [];
      }
      const discoveredPlugins = readDiscoveredAgentPlugins(discoveries, read);
      if (!discoveredPlugins) {
        return [];
      }
      return getSortedAgentPlugins(discoveredPlugins);
    });
    this._register(autorun((reader) => {
      const plugins = this.plugins.read(reader);
      const policy = enabledPluginsPolicy.read(reader);
      transaction((tx) => {
        for (const plugin of plugins) {
          const blocked = isAgentPluginBlockedByPolicy(plugin, policy);
          if (setPolicyBlocked(plugin, blocked, tx) && blocked) {
            logService.debug(`[AgentPluginService] Plugin '${getAgentPluginPolicyId(plugin) ?? plugin.uri.toString()}' blocked \u2014 disabled by ChatEnabledPlugins policy`);
          }
        }
      });
    }));
  }
};
AgentPluginService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, ILogService)
], AgentPluginService);
function readDiscoveredAgentPlugins(discoveries, reader) {
  const result = [];
  for (const { discovery, priority, order } of discoveries) {
    const plugins = discovery.plugins.read(reader);
    if (!plugins) {
      return void 0;
    }
    result.push({ plugins, priority, order });
  }
  return result;
}
function setPolicyBlocked(plugin, blocked, tx) {
  const obs = plugin.policyBlocked;
  if (obs && typeof obs.set === "function") {
    if (obs.get() === blocked) {
      return false;
    }
    obs.set(blocked, tx);
    return true;
  }
  return false;
}
class AbstractAgentPluginDiscovery extends Disposable {
  constructor(_fileService, _pathService, _logService, _workspaceContextService) {
    super();
    this._fileService = _fileService;
    this._pathService = _pathService;
    this._logService = _logService;
    this._workspaceContextService = _workspaceContextService;
    this._pluginEntries = /* @__PURE__ */ new Map();
    this._plugins = observableValue("discoveredAgentPlugins", void 0);
    this.plugins = this._plugins;
    this._discoverVersion = 0;
  }
  async _refreshPlugins() {
    const version = ++this._discoverVersion;
    const plugins = await this._discoverAndBuildPlugins(version);
    if (!this._isCurrentRefresh(version)) {
      return;
    }
    this._plugins.set(plugins, void 0);
  }
  async _discoverAndBuildPlugins(version) {
    const sources = await this._discoverPluginSources();
    if (!this._isCurrentRefresh(version)) {
      return [];
    }
    const plugins = [];
    const seenPluginUris = /* @__PURE__ */ new Set();
    const attemptedPluginUris = /* @__PURE__ */ new Set();
    for (const source of sources) {
      const key = source.uri.toString();
      if (!attemptedPluginUris.has(key)) {
        attemptedPluginUris.add(key);
        try {
          const format = await detectPluginFormat(source.uri, this._fileService);
          if (!this._isCurrentRefresh(version)) {
            return [];
          }
          const plugin = await this._toPlugin(source.uri, format, source.fromMarketplace, source.repositoryUri, source.remove, version);
          seenPluginUris.add(key);
          plugins.push(plugin);
        } catch (error) {
          this._logService.warn(`[AgentPluginDiscovery] Rejected plugin '${source.uri.toString()}': ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    if (this._isCurrentRefresh(version)) {
      this._disposePluginEntriesExcept(seenPluginUris);
    }
    plugins.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
    return plugins;
  }
  _isCurrentRefresh(version) {
    return version === this._discoverVersion && !this._store.isDisposed;
  }
  async _pathExists(resource) {
    try {
      await this._fileService.resolve(resource);
      return true;
    } catch {
      return false;
    }
  }
  async _toPlugin(uri, format, fromMarketplace, repositoryUri, removeCallback, version) {
    const key = uri.toString();
    const existing = this._pluginEntries.get(key);
    if (existing) {
      if (!this._isCurrentRefresh(version)) {
        return existing.plugin;
      }
      if (existing.format.format !== format.format) {
        existing.store.dispose();
        this._pluginEntries.delete(key);
      } else {
        existing.plugin.remove = removeCallback;
        return existing.plugin;
      }
    }
    const store = new DisposableStore();
    const policyBlocked = observableValue("policyBlocked", false);
    const enablement = derived((r) => policyBlocked.read(r) ? ContributionEnablementState.DisabledProfile : this._enablementModel.readEnabled(key, r));
    const initialManifest = await readPluginManifest(uri, format, this._fileService);
    const manifest = observableValue("agentPluginManifest", initialManifest);
    const observeComponent = (prop, doRead, tryReadEmbedded, defaultPath = prop) => {
      const secondObs = derivedOpts({ equalsFn: equals }, (reader) => getPluginManifestComponent(format, prop, manifest.read(reader)));
      const wrapped = derived((reader) => {
        if (format.requiresManifest && !manifest.read(reader)) {
          return { kind: "dirs", dirs: [] };
        }
        const section = secondObs.read(reader);
        if (tryReadEmbedded) {
          if (section && typeof section === "object" && !Array.isArray(section) && !hasKey(section, { paths: true })) {
            return { kind: "const", data: new ObservablePromise(tryReadEmbedded(section)) };
          }
        }
        const dirs = resolvePluginComponentDirs(uri, format, prop, defaultPath, section, repositoryUri);
        for (const d of dirs) {
          const watcher = this._fileService.createWatcher(d, { recursive: false, excludes: [] });
          reader.store.add(watcher);
          reader.store.add(watcher.onDidChange(() => changeTrigger.trigger(void 0)));
        }
        return { kind: "dirs", dirs };
      });
      const changeTrigger = observableSignal("fileChange");
      const promised = derived((reader) => {
        const w = wrapped.read(reader);
        if (w.kind === "const") {
          return w.data.promiseResult;
        } else {
          changeTrigger.read(reader);
          const promise = new ObservablePromise(doRead(w.dirs));
          return promise.promiseResult;
        }
      });
      const result = promised.map((w, r) => w.read(r)?.data ?? Iterable.empty());
      return result.recomputeInitiallyAndOnChange(store);
    };
    const manifestUri = joinPath(uri, format.manifestPath);
    const commands = observeComponent("commands", (d) => readMarkdownComponents(d, this._fileService));
    const skills = observeComponent("skills", (d) => readPluginSkills(uri, d, format, this._fileService));
    const agents = observeComponent("agents", (d) => readMarkdownComponents(d, this._fileService));
    const instructions = observeComponent("rules", (d) => this._readRules(d));
    const hooks = observeComponent(
      "hooks",
      (paths) => this._readHooksFromPaths(uri, paths, format),
      async (section) => {
        const userHome = await this._pathService.userHome();
        const workspaceRoot = resolveWorkspaceRoot(uri, this._workspaceContextService);
        return toAgentPluginHooks(format.parseHooks(manifestUri, section, uri, workspaceRoot, userHome));
      },
      format.hookConfigPath
    );
    const mcpServerDefinitions = observeComponent(
      "mcpServers",
      (paths) => readPluginMcpServers(uri, paths, format, this._fileService),
      async (section) => parseMcpServerDefinitionMap(manifestUri, { mcpServers: section }, uri.fsPath, format),
      ".mcp.json"
    );
    const readManifest = async () => {
      try {
        const latestFormat = await detectPluginFormat(uri, this._fileService);
        if (latestFormat.format !== format.format) {
          await this._refreshPlugins();
          return;
        }
        manifest.set(await readPluginManifest(uri, format, this._fileService), void 0);
      } catch (error) {
        manifest.set(void 0, void 0);
        this._logService.warn(`[AgentPluginDiscovery] Rejected updated plugin '${uri.toString()}': ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    const agentManifestUri = joinPath(uri, "plugin.json");
    const rootWatcher = this._fileService.createWatcher(uri, { recursive: false, excludes: [] });
    store.add(rootWatcher);
    store.add(rootWatcher.onDidChange((change) => {
      if (change.affects(agentManifestUri)) {
        void readManifest();
      }
    }));
    store.add(this._fileService.onDidRunOperation((event) => {
      if (isEqual(event.resource, agentManifestUri)) {
        void readManifest();
      }
    }));
    if (!isEqual(manifestUri, agentManifestUri)) {
      const manifestWatcher = this._fileService.createWatcher(manifestUri, { recursive: false, excludes: [] });
      store.add(manifestWatcher);
      store.add(manifestWatcher.onDidChange(() => readManifest()));
    }
    const manifestName = typeof initialManifest?.name === "string" && initialManifest.name.trim() ? initialManifest.name.trim() : void 0;
    const plugin = {
      uri,
      format: format.format,
      label: fromMarketplace?.name ?? manifestName ?? basename(uri),
      enablement,
      policyBlocked,
      remove: removeCallback,
      hooks,
      commands,
      skills,
      agents,
      instructions,
      mcpServerDefinitions,
      fromMarketplace
    };
    if (this._isCurrentRefresh(version)) {
      this._pluginEntries.set(key, { store, plugin, format });
    } else {
      store.dispose();
    }
    return plugin;
  }
  /**
   * Reads hook definitions from a list of resolved paths (JSON files).
   * Each path is tried in order; the first one that contains valid hook
   * JSON is used.
   */
  async _readHooksFromPaths(pluginUri, paths, format) {
    const userHome = await this._pathService.userHome();
    const workspaceRoot = resolveWorkspaceRoot(pluginUri, this._workspaceContextService);
    for (const hookPath of paths) {
      const json = await this._readJsonFile(hookPath);
      if (json) {
        try {
          return toAgentPluginHooks(format.parseHooks(hookPath, json, pluginUri, workspaceRoot, userHome));
        } catch (e) {
          this._logService.info(`[AgentPluginDiscovery] Failed to parse hooks from ${hookPath.toString()}:`, e);
        }
      }
    }
    return [];
  }
  async _readJsonFile(uri) {
    try {
      const fileContents = await this._fileService.readFile(uri);
      return parseJSONC(fileContents.value.toString());
    } catch {
      return void 0;
    }
  }
  /**
   * Scans directories for rule/instruction files (`.mdc`, `.md`,
   * `.instructions.md`), returning `{ uri, name }` entries where name is
   * derived from the filename minus the matched suffix.
   */
  async _readRules(dirs) {
    const seen = /* @__PURE__ */ new Set();
    const items = [];
    const matchSuffix = (filename) => {
      const lower = filename.toLowerCase();
      return RULE_FILE_SUFFIXES.find((s) => lower.endsWith(s));
    };
    const addItem = (name, uri) => {
      if (!seen.has(name)) {
        seen.add(name);
        items.push({ uri, name });
      }
    };
    for (const dir of dirs) {
      let stat;
      try {
        stat = await this._fileService.resolve(dir);
      } catch {
        continue;
      }
      if (stat.isFile) {
        const suffix = matchSuffix(basename(dir));
        if (suffix) {
          addItem(basename(dir).slice(0, -suffix.length), dir);
        }
        continue;
      }
      if (!stat.isDirectory || !stat.children) {
        continue;
      }
      for (const child of stat.children) {
        if (!child.isFile) {
          continue;
        }
        const suffix = matchSuffix(child.name);
        if (suffix) {
          addItem(child.name.slice(0, -suffix.length), child.resource);
        }
      }
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }
  _disposePluginEntriesExcept(keep) {
    for (const [key, entry] of this._pluginEntries) {
      if (!keep.has(key)) {
        entry.store.dispose();
        this._pluginEntries.delete(key);
      }
    }
  }
  dispose() {
    this._disposePluginEntriesExcept(/* @__PURE__ */ new Set());
    super.dispose();
  }
}
let ConfiguredAgentPluginDiscovery = class extends AbstractAgentPluginDiscovery {
  constructor(_configurationService, fileService, _pluginMarketplaceService, workspaceContextService, pathService, logService) {
    super(fileService, pathService, logService, workspaceContextService);
    this._configurationService = _configurationService;
    this._pluginMarketplaceService = _pluginMarketplaceService;
    this._pluginLocationsConfig = observableConfigValue(ChatConfiguration.PluginLocations, {}, _configurationService);
    this._enterpriseEnabledPluginsConfig = observableFromEvent(
      this,
      Event.filter(this._configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(ChatConfiguration.EnabledPlugins)),
      () => {
        const inspected = this._configurationService.inspect(ChatConfiguration.EnabledPlugins);
        return { ...inspected.defaultValue, ...inspected.userValue, ...inspected.policyValue };
      }
    );
  }
  start(enablementModel) {
    this._enablementModel = enablementModel;
    const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
    this._register(autorun((reader) => {
      this._pluginLocationsConfig.read(reader);
      this._enterpriseEnabledPluginsConfig.read(reader);
      scheduler.schedule();
    }));
    scheduler.schedule();
  }
  async _discoverPluginSources() {
    const sources = [];
    const userHome = await this._getUserHome();
    for (const [key, enabled] of Object.entries(this._pluginLocationsConfig.get())) {
      const trimmed = key.trim();
      if (!trimmed || enabled === false) {
        continue;
      }
      for (const resource of this._resolvePluginPath(trimmed, userHome)) {
        await this._addPluginSource(sources, resource, "plugin path", () => this._removePluginPath(key));
      }
    }
    for (const [key, enabled] of Object.entries(this._enterpriseEnabledPluginsConfig.get())) {
      const trimmed = key.trim();
      if (!trimmed || enabled === false) {
        continue;
      }
      const resource = this._resolveEnterprisePluginId(trimmed, userHome);
      if (!resource) {
        this._logService.debug(`[ConfiguredAgentPluginDiscovery] Skipping enterprise plugin entry that is not in <plugin>@<marketplace> form: ${trimmed}`);
        continue;
      }
      await this._addPluginSource(sources, resource, "enterprise plugin path");
    }
    return sources;
  }
  async _addPluginSource(sources, resource, label, remove) {
    let stat;
    try {
      stat = await this._fileService.resolve(resource);
    } catch {
      this._logService.debug(`[ConfiguredAgentPluginDiscovery] Could not resolve ${label}: ${resource.toString()}`);
      return;
    }
    if (!stat.isDirectory) {
      this._logService.debug(`[ConfiguredAgentPluginDiscovery] ${label} is not a directory: ${resource.toString()}`);
      return;
    }
    sources.push({
      uri: stat.resource,
      fromMarketplace: this._pluginMarketplaceService.getMarketplacePluginMetadata(stat.resource),
      remove
    });
  }
  async _getUserHome() {
    const userHome = await this._pathService.userHome();
    return userHome.scheme === "file" ? userHome.fsPath : userHome.path;
  }
  /**
   * Resolves a user-configured plugin path to one or more resource URIs.
   * Supports absolute paths, tilde paths (expanded to user home), and
   * workspace-relative paths.
   */
  _resolvePluginPath(path, userHome) {
    if (path.startsWith("~")) {
      path = untildify(path, userHome);
    }
    if (win32.isAbsolute(path) || posix.isAbsolute(path)) {
      return [URI.file(path)];
    }
    return this._workspaceContextService.getWorkspace().folders.map(
      (folder) => joinPath(folder.uri, path)
    );
  }
  /**
   * Resolves an enterprise plugin ID of the form `<plugin>@<marketplace>` to
   * the Copilot CLI install convention `~/.copilot/installed-plugins/<marketplace>/<plugin>/`.
   * Returns `undefined` for anything that doesn't match the ID shape.
   */
  _resolveEnterprisePluginId(id, userHome) {
    const idMatch = id.match(/^([^@/\\~]+)@([^@/\\~]+)$/);
    if (!idMatch) {
      return void 0;
    }
    const [, plugin, marketplace] = idMatch;
    return URI.file(`${userHome}/.copilot/installed-plugins/${marketplace}/${plugin}`);
  }
  /**
   * Removes a plugin path from `chat.pluginLocations` in the most specific
   * config target where the key is defined.
   */
  _removePluginPath(configKey) {
    const inspected = this._configurationService.inspect(ChatConfiguration.PluginLocations);
    const targets = [
      ConfigurationTarget.WORKSPACE_FOLDER,
      ConfigurationTarget.WORKSPACE,
      ConfigurationTarget.USER_LOCAL,
      ConfigurationTarget.USER_REMOTE,
      ConfigurationTarget.USER,
      ConfigurationTarget.APPLICATION
    ];
    for (const target of targets) {
      const mapping = getConfigValueInTarget(inspected, target);
      if (mapping && Object.prototype.hasOwnProperty.call(mapping, configKey)) {
        const updated = { ...mapping };
        delete updated[configKey];
        this._configurationService.updateValue(
          ChatConfiguration.PluginLocations,
          updated,
          target
        );
        return;
      }
    }
  }
};
ConfiguredAgentPluginDiscovery = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IPluginMarketplaceService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IPathService),
  __decorateParam(5, ILogService)
], ConfiguredAgentPluginDiscovery);
let MarketplaceAgentPluginDiscovery = class extends AbstractAgentPluginDiscovery {
  constructor(_pluginMarketplaceService, _pluginRepositoryService, fileService, pathService, logService, workspaceContextService) {
    super(fileService, pathService, logService, workspaceContextService);
    this._pluginMarketplaceService = _pluginMarketplaceService;
    this._pluginRepositoryService = _pluginRepositoryService;
  }
  start(enablementModel) {
    this._enablementModel = enablementModel;
    const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
    this._register(autorun((reader) => {
      this._pluginMarketplaceService.installedPlugins.read(reader);
      scheduler.schedule();
    }));
    scheduler.schedule();
  }
  async _discoverPluginSources() {
    const installed = this._pluginMarketplaceService.installedPlugins.get();
    const sources = [];
    for (const entry of installed) {
      let stat;
      try {
        stat = await this._fileService.resolve(entry.pluginUri);
      } catch {
        this._logService.debug(`[MarketplaceAgentPluginDiscovery] Could not resolve installed plugin: ${entry.pluginUri.toString()}`);
        continue;
      }
      if (!stat.isDirectory) {
        this._logService.debug(`[MarketplaceAgentPluginDiscovery] Installed plugin path is not a directory: ${entry.pluginUri.toString()}`);
        continue;
      }
      const repositoryUri = this._pluginRepositoryService.getRepositoryUri(entry.plugin.marketplaceReference, entry.plugin.marketplaceType);
      sources.push({
        uri: stat.resource,
        fromMarketplace: entry.plugin,
        repositoryUri,
        remove: () => {
          this._enablementModel.remove(stat.resource.toString());
          this._pluginMarketplaceService.removeInstalledPlugin(entry.pluginUri);
          const remaining = this._pluginMarketplaceService.installedPlugins.get();
          this._pluginRepositoryService.cleanupPluginSource(
            entry.plugin,
            remaining.map((e) => e.plugin.sourceDescriptor)
          ).catch((error) => {
            this._logService.error("[MarketplaceAgentPluginDiscovery] Failed to clean up plugin source", error);
          });
        }
      });
    }
    return sources;
  }
};
MarketplaceAgentPluginDiscovery = __decorateClass([
  __decorateParam(0, IPluginMarketplaceService),
  __decorateParam(1, IAgentPluginRepositoryService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IPathService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IWorkspaceContextService)
], MarketplaceAgentPluginDiscovery);
const COPILOT_CLI_INSTALLED_PLUGINS_DIR = ".copilot/installed-plugins";
let CopilotCliAgentPluginDiscovery = class extends AbstractAgentPluginDiscovery {
  constructor(fileService, pathService, logService, workspaceContextService, _dialogService) {
    super(fileService, pathService, logService, workspaceContextService);
    this._dialogService = _dialogService;
  }
  start(enablementModel) {
    this._enablementModel = enablementModel;
    const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
    const watcherStore = this._register(new DisposableStore());
    const setupWatchers = async () => {
      watcherStore.clear();
      if (this._store.isDisposed) {
        return;
      }
      const root = await this._getInstalledPluginsDir();
      const dirsToWatch = [];
      let candidate = root;
      while (candidate) {
        dirsToWatch.unshift(candidate);
        const parent = joinPath(candidate, "..");
        if (parent.toString() === candidate.toString()) {
          break;
        }
        if (await this._pathExists(parent)) {
          dirsToWatch.unshift(parent);
          break;
        }
        candidate = parent;
      }
      for (const dir of dirsToWatch) {
        if (!await this._pathExists(dir)) {
          continue;
        }
        const watcher = this._fileService.createWatcher(dir, { recursive: false, excludes: [] });
        watcherStore.add(watcher);
        watcherStore.add(watcher.onDidChange(() => {
          scheduler.schedule();
          setupWatchers().catch(() => {
          });
        }));
      }
      let rootStat;
      try {
        rootStat = await this._fileService.resolve(root);
      } catch {
        return;
      }
      if (!rootStat.children) {
        return;
      }
      for (const marketplaceDir of rootStat.children) {
        if (!marketplaceDir.isDirectory) {
          continue;
        }
        const watcher = this._fileService.createWatcher(marketplaceDir.resource, { recursive: false, excludes: [] });
        watcherStore.add(watcher);
        watcherStore.add(watcher.onDidChange(() => scheduler.schedule()));
      }
    };
    setupWatchers().catch(() => {
    });
    scheduler.schedule();
  }
  async _getInstalledPluginsDir() {
    const userHome = await this._pathService.userHome();
    return joinPath(userHome, COPILOT_CLI_INSTALLED_PLUGINS_DIR);
  }
  async _discoverPluginSources() {
    const root = await this._getInstalledPluginsDir();
    let rootStat;
    try {
      rootStat = await this._fileService.resolve(root);
    } catch {
      return [];
    }
    if (!rootStat.isDirectory || !rootStat.children) {
      return [];
    }
    const sources = [];
    for (const marketplaceDir of rootStat.children) {
      if (!marketplaceDir.isDirectory) {
        continue;
      }
      let marketplaceStat;
      try {
        marketplaceStat = await this._fileService.resolve(marketplaceDir.resource);
      } catch {
        continue;
      }
      if (!marketplaceStat.children) {
        continue;
      }
      for (const pluginDir of marketplaceStat.children) {
        if (!pluginDir.isDirectory) {
          continue;
        }
        sources.push({
          uri: pluginDir.resource,
          fromMarketplace: void 0,
          remove: () => this._promptRemove(pluginDir.resource)
        });
      }
    }
    return sources;
  }
  async _promptRemove(resource) {
    const { confirmed } = await this._dialogService.confirm({
      message: localize("copilotCliPlugin.remove.confirm", "This plugin was installed by the Copilot CLI. Remove it from disk?"),
      detail: localize("copilotCliPlugin.remove.detail", "The plugin directory '{0}' will be moved to the trash. You can reinstall it later via the Copilot CLI.", resource.fsPath),
      primaryButton: localize("copilotCliPlugin.remove.primary", "Remove")
    });
    if (!confirmed) {
      return;
    }
    try {
      await this._fileService.del(resource, { recursive: true, useTrash: true });
      this._enablementModel.remove(resource.toString());
    } catch (error) {
      this._logService.error("[CopilotCliAgentPluginDiscovery] Failed to remove plugin", error);
    }
  }
};
CopilotCliAgentPluginDiscovery = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IPathService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IDialogService)
], CopilotCliAgentPluginDiscovery);
const epPlugins = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "chatPlugins",
  jsonSchema: {
    description: localize("chatPlugins.schema.description", "Contributes agent plugins for chat."),
    type: "array",
    items: {
      additionalProperties: false,
      type: "object",
      defaultSnippets: [{
        body: {
          path: "./relative/path/to/plugin/"
        }
      }],
      required: ["path"],
      properties: {
        path: {
          description: localize("chatPlugins.property.path", "Path to the agent plugin root directory relative to the extension root."),
          type: "string"
        },
        when: {
          description: localize("chatPlugins.property.when", "(Optional) A condition which must be true to enable this plugin."),
          type: "string"
        }
      }
    }
  }
});
let ExtensionAgentPluginDiscovery = class extends AbstractAgentPluginDiscovery {
  constructor(_commandService, _contextKeyService, _dialogService, fileService, pathService, logService, workspaceContextService) {
    super(fileService, pathService, logService, workspaceContextService);
    this._commandService = _commandService;
    this._contextKeyService = _contextKeyService;
    this._dialogService = _dialogService;
    this._extensionPlugins = /* @__PURE__ */ new Map();
    this._whenKeys = /* @__PURE__ */ new Set();
  }
  start(enablementModel) {
    this._enablementModel = enablementModel;
    const scheduler = this._register(new RunOnceScheduler(() => this._refreshPlugins(), 0));
    this._register(this._contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(this._whenKeys)) {
        scheduler.schedule();
      }
    }));
    epPlugins.setHandler((_extensions, delta) => {
      for (const ext of delta.added) {
        for (const raw of ext.value) {
          if (!raw.path) {
            ext.collector.error(localize("extension.plugin.missing.path", "Extension '{0}' cannot register a chatPlugins entry without a path.", ext.description.identifier.value));
            continue;
          }
          const pluginUri = joinPath(ext.description.extensionLocation, raw.path);
          if (!isEqualOrParent(pluginUri, ext.description.extensionLocation)) {
            ext.collector.error(localize("extension.plugin.invalid.path", "Extension '{0}' chatPlugins entry '{1}' resolves outside the extension.", ext.description.identifier.value, raw.path));
            continue;
          }
          let whenExpr;
          if (raw.when) {
            whenExpr = ContextKeyExpr.deserialize(raw.when);
            if (!whenExpr) {
              ext.collector.error(localize("extension.plugin.invalid.when", "Extension '{0}' chatPlugins entry '{1}' has an invalid when clause: '{2}'.", ext.description.identifier.value, raw.path, raw.when));
              continue;
            }
          }
          this._extensionPlugins.set(extensionPluginKey(ext.description.identifier, raw.path), { uri: pluginUri, when: whenExpr, extensionId: ext.description.identifier.value });
        }
      }
      for (const ext of delta.removed) {
        for (const raw of ext.value) {
          this._extensionPlugins.delete(extensionPluginKey(ext.description.identifier, raw.path));
        }
      }
      this._rebuildWhenKeys();
      scheduler.schedule();
    });
    scheduler.schedule();
  }
  _rebuildWhenKeys() {
    this._whenKeys.clear();
    for (const { when } of this._extensionPlugins.values()) {
      if (when) {
        for (const key of when.keys()) {
          this._whenKeys.add(key);
        }
      }
    }
  }
  async _discoverPluginSources() {
    const sources = [];
    for (const [, entry] of this._extensionPlugins) {
      if (entry.when && !this._contextKeyService.contextMatchesRules(entry.when)) {
        continue;
      }
      let stat;
      try {
        stat = await this._fileService.resolve(entry.uri);
      } catch {
        this._logService.debug(`[ExtensionAgentPluginDiscovery] Could not resolve extension plugin path: ${entry.uri.toString()}`);
        continue;
      }
      if (!stat.isDirectory) {
        this._logService.debug(`[ExtensionAgentPluginDiscovery] Extension plugin path is not a directory: ${entry.uri.toString()}`);
        continue;
      }
      sources.push({
        uri: stat.resource,
        fromMarketplace: void 0,
        remove: () => this._promptUninstallExtension(entry.extensionId)
      });
    }
    return sources;
  }
  async _promptUninstallExtension(extensionId) {
    const { confirmed } = await this._dialogService.confirm({
      message: localize("uninstallExtensionForPlugin", "This plugin is provided by the extension '{0}'. Do you want to uninstall the extension?", extensionId)
    });
    if (confirmed) {
      await this._commandService.executeCommand("workbench.extensions.uninstallExtension", extensionId);
    }
  }
};
ExtensionAgentPluginDiscovery = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IPathService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IWorkspaceContextService)
], ExtensionAgentPluginDiscovery);
function extensionPluginKey(extensionId, path) {
  return `${extensionId.value}/${path}`;
}
class ChatPluginsDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.chatPlugins?.length;
  }
  render(manifest) {
    const contributions = manifest.contributes?.chatPlugins ?? [];
    if (!contributions.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("chatPluginsPath", "Path"),
      localize("chatPluginsWhen", "When")
    ];
    const rows = contributions.map((d) => [
      d.path,
      d.when ?? "-"
    ]);
    return {
      data: { headers, rows },
      dispose: () => {
      }
    };
  }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "chatPlugins",
  label: localize("chatPlugins", "Chat Plugins"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ChatPluginsDataRenderer)
});
export {
  AbstractAgentPluginDiscovery,
  AgentPluginService,
  ConfiguredAgentPluginDiscovery,
  CopilotCliAgentPluginDiscovery,
  ExtensionAgentPluginDiscovery,
  MarketplaceAgentPluginDiscovery,
  convertBareEnvVarsToVsCodeSyntax,
  resolveMcpServersMap,
  shellQuotePluginRootInCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccGx1Z2luc1xcYWdlbnRQbHVnaW5TZXJ2aWNlSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgcGFyc2UgYXMgcGFyc2VKU09OQyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgdW50aWxkaWZ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSwgSVJlYWRlciwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBPYnNlcnZhYmxlUHJvbWlzZSwgb2JzZXJ2YWJsZVNpZ25hbCwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHtcblx0cG9zaXgsXG5cdHdpbjMyXG59IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHtcblx0YmFzZW5hbWUsIGlzRXF1YWwsIGlzRXF1YWxPclBhcmVudCwgam9pblBhdGhcbn0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgZ2V0Q29uZmlnVmFsdWVJblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24sIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHtcblx0cmVzb2x2ZVBsdWdpbkNvbXBvbmVudERpcnMsXG5cdGdldFBsdWdpbk1hbmlmZXN0Q29tcG9uZW50LFxuXHRyZWFkUGx1Z2luU2tpbGxzLFxuXHRyZWFkTWFya2Rvd25Db21wb25lbnRzLFxuXHRyZWFkUGx1Z2luTWFuaWZlc3QsXG5cdHJlYWRQbHVnaW5NY3BTZXJ2ZXJzLFxuXHRwYXJzZU1jcFNlcnZlckRlZmluaXRpb25NYXAsXG5cdGRldGVjdFBsdWdpbkZvcm1hdCxcblx0dHlwZSBQbHVnaW5Db21wb25lbnQsXG5cdHR5cGUgSVBsdWdpbkZvcm1hdENvbmZpZyxcblx0dHlwZSBJUGFyc2VkSG9va0dyb3VwLFxufSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudFBsdWdpbnMvY29tbW9uL3BsdWdpblBhcnNlcnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnksIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciwgSVJlbmRlcmVkRGF0YSwgSVJvd0RhdGEsIElUYWJsZURhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgKiBhcyBleHRlbnNpb25zUmVnaXN0cnkgZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSwgRW5hYmxlbWVudE1vZGVsLCBJRW5hYmxlbWVudE1vZGVsIH0gZnJvbSAnLi4vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBIb29rVHlwZSB9IGZyb20gJy4uL3Byb21wdFN5bnRheC9ob29rVHlwZXMuanMnO1xuaW1wb3J0IHsgQWdlbnRQbHVnaW5Db2xsaXNpb25FbmFibGVtZW50TW9kZWwsIGdldEFnZW50UGx1Z2luUG9saWN5SWQsIGdldENhbm9uaWNhbEFnZW50UGx1Z2luQ29sbGlzaW9uR3JvdXBzLCBnZXRTb3J0ZWRBZ2VudFBsdWdpbnMsIElEaXNjb3ZlcmVkQWdlbnRQbHVnaW5zLCBpc0FnZW50UGx1Z2luQmxvY2tlZEJ5UG9saWN5IH0gZnJvbSAnLi9hZ2VudFBsdWdpbkVuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UgfSBmcm9tICcuL2FnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRQbHVnaW5EaXNjb3ZlcnlQcmlvcml0eSwgYWdlbnRQbHVnaW5EaXNjb3ZlcnlSZWdpc3RyeSwgSUFnZW50UGx1Z2luLCBJQWdlbnRQbHVnaW5EaXNjb3ZlcnksIElBZ2VudFBsdWdpbkhvb2ssIElBZ2VudFBsdWdpbkluc3RydWN0aW9uLCBJQWdlbnRQbHVnaW5TZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudFBsdWdpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1hcmtldHBsYWNlUGx1Z2luLCBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIH0gZnJvbSAnLi9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuanMnO1xuXG4vLyBSZS1leHBvcnQgc2hhcmVkIGhlbHBlcnMgc28gZXhpc3RpbmcgY29uc3VtZXJzIChpbmNsdWRpbmcgdGVzdHMpIGNvbnRpbnVlIHRvIHdvcmsuXG5leHBvcnQgeyBzaGVsbFF1b3RlUGx1Z2luUm9vdEluQ29tbWFuZCwgcmVzb2x2ZU1jcFNlcnZlcnNNYXAsIGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRQbHVnaW5zL2NvbW1vbi9wbHVnaW5QYXJzZXJzLmpzJztcblxuLyoqXG4gKiBDb252ZXJ0cyBwbGF0Zm9ybS1sYXllciBwYXJzZWQgaG9vayBncm91cHMgdG8gdGhlIHdvcmtiZW5jaCdzIHtAbGluayBJQWdlbnRQbHVnaW5Ib29rfSB0eXBlLlxuICogVGhlIGNhbm9uaWNhbCB0eXBlIHN0cmluZ3MgZnJvbSB0aGUgcGxhdGZvcm0gbGF5ZXIgbWFwIGRpcmVjdGx5IHRvIHtAbGluayBIb29rVHlwZX0gZW51bSB2YWx1ZXMuXG4gKi9cbmZ1bmN0aW9uIHRvQWdlbnRQbHVnaW5Ib29rcyhncm91cHM6IHJlYWRvbmx5IElQYXJzZWRIb29rR3JvdXBbXSk6IElBZ2VudFBsdWdpbkhvb2tbXSB7XG5cdHJldHVybiBncm91cHNcblx0XHQuZmlsdGVyKGcgPT4gT2JqZWN0LnZhbHVlcyhIb29rVHlwZSkuaW5jbHVkZXMoZy50eXBlIGFzIEhvb2tUeXBlKSlcblx0XHQubWFwKGcgPT4gKHtcblx0XHRcdHR5cGU6IGcudHlwZSBhcyBIb29rVHlwZSxcblx0XHRcdGhvb2tzOiBnLmNvbW1hbmRzLFxuXHRcdFx0dXJpOiBnLnVyaSxcblx0XHRcdG9yaWdpbmFsSWQ6IGcub3JpZ2luYWxJZCxcblx0XHR9KSk7XG59XG5cbi8qKiBGaWxlIHN1ZmZpeGVzIGFjY2VwdGVkIGZvciBydWxlL2luc3RydWN0aW9uIGZpbGVzIChsb25nZXN0IGZpcnN0IGZvciBjb3JyZWN0IG5hbWUgc3RyaXBwaW5nKS4gKi9cbmNvbnN0IFJVTEVfRklMRV9TVUZGSVhFUyA9IFsnLmluc3RydWN0aW9ucy5tZCcsICcubWRjJywgJy5tZCddO1xuXG4vKipcbiAqIFJlc29sdmVzIHRoZSB3b3Jrc3BhY2UgZm9sZGVyIHRoYXQgY29udGFpbnMgdGhlIHBsdWdpbiBVUkkgZm9yIGN3ZCByZXNvbHV0aW9uLFxuICogZmFsbGluZyBiYWNrIHRvIHRoZSBmaXJzdCB3b3Jrc3BhY2UgZm9sZGVyIGZvciBwbHVnaW5zIG91dHNpZGUgdGhlIHdvcmtzcGFjZS5cbiAqL1xuZnVuY3Rpb24gcmVzb2x2ZVdvcmtzcGFjZVJvb3QocGx1Z2luVXJpOiBVUkksIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRjb25zdCBkZWZhdWx0Rm9sZGVyID0gd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXTtcblx0Y29uc3QgZm9sZGVyID0gd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHBsdWdpblVyaSkgPz8gZGVmYXVsdEZvbGRlcjtcblx0cmV0dXJuIGZvbGRlcj8udXJpO1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRQbHVnaW5TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudFBsdWdpblNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyByZWFkb25seSBwbHVnaW5zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQWdlbnRQbHVnaW5bXT47XG5cdHB1YmxpYyByZWFkb25seSBlbmFibGVtZW50TW9kZWw6IElFbmFibGVtZW50TW9kZWw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgYmFzZUVuYWJsZW1lbnRNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbmFibGVtZW50TW9kZWwoJ2FnZW50UGx1Z2lucy5lbmFibGVtZW50Jywgc3RvcmFnZVNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHBsdWdpbnNFbmFibGVkID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKENoYXRDb25maWd1cmF0aW9uLlBsdWdpbnNFbmFibGVkLCB0cnVlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcmllczogSUFnZW50UGx1Z2luRGlzY292ZXJ5V2l0aFByaW9yaXR5W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlZ2lzdHJhdGlvbiBvZiBhZ2VudFBsdWdpbkRpc2NvdmVyeVJlZ2lzdHJ5LmdldEFsbCgpKSB7XG5cdFx0XHRjb25zdCBkaXNjb3ZlcnkgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShyZWdpc3RyYXRpb24uZGVzY3JpcHRvcik7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihkaXNjb3ZlcnkpO1xuXHRcdFx0ZGlzY292ZXJpZXMucHVzaCh7IGRpc2NvdmVyeSwgcHJpb3JpdHk6IHJlZ2lzdHJhdGlvbi5wcmlvcml0eSwgb3JkZXI6IHJlZ2lzdHJhdGlvbi5vcmRlciB9KTtcblx0XHR9XG5cblx0XHQvLyBQb2xpY3ktZHJpdmVuIGVuZm9yY2VtZW50LCBhcHBsaWVkIGFmdGVyIGRpc2NvdmVyeSBzbyB0aGF0IGVudGVycHJpc2Vcblx0XHQvLyBwb2xpY3kgaXMgaG9ub3JlZCByZWdhcmRsZXNzIG9mIHdoaWNoIGRpc2NvdmVyeSBzb3VyY2Ugc3VyZmFjZXMgYVxuXHRcdC8vIHBsdWdpbiAobG9jYWwgcGF0aHMsIG1hcmtldHBsYWNlLCBDTEkgaW5zdGFsbCBkaXIpLlxuXHRcdGNvbnN0IGVuYWJsZWRQbHVnaW5zUG9saWN5ID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0RXZlbnQuZmlsdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkVuYWJsZWRQbHVnaW5zKSksXG5cdFx0XHQoKSA9PiBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PihDaGF0Q29uZmlndXJhdGlvbi5FbmFibGVkUGx1Z2lucykucG9saWN5VmFsdWUsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGNvbGxpc2lvbkdyb3VwcyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGlmICghcGx1Z2luc0VuYWJsZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgTWFwPHN0cmluZywgcmVhZG9ubHkgc3RyaW5nW10+KCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkaXNjb3ZlcmVkUGx1Z2lucyA9IHJlYWREaXNjb3ZlcmVkQWdlbnRQbHVnaW5zKGRpc2NvdmVyaWVzLCByZWFkZXIpO1xuXHRcdFx0aWYgKCFkaXNjb3ZlcmVkUGx1Z2lucykge1xuXHRcdFx0XHRyZXR1cm4gbmV3IE1hcDxzdHJpbmcsIHJlYWRvbmx5IHN0cmluZ1tdPigpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcG9saWN5ID0gZW5hYmxlZFBsdWdpbnNQb2xpY3kucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIGdldENhbm9uaWNhbEFnZW50UGx1Z2luQ29sbGlzaW9uR3JvdXBzKGRpc2NvdmVyZWRQbHVnaW5zLCBwbHVnaW4gPT4gaXNBZ2VudFBsdWdpbkJsb2NrZWRCeVBvbGljeShwbHVnaW4sIHBvbGljeSkpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5lbmFibGVtZW50TW9kZWwgPSBuZXcgQWdlbnRQbHVnaW5Db2xsaXNpb25FbmFibGVtZW50TW9kZWwoYmFzZUVuYWJsZW1lbnRNb2RlbCwgY29sbGlzaW9uR3JvdXBzKTtcblxuXHRcdGZvciAoY29uc3QgeyBkaXNjb3ZlcnkgfSBvZiBkaXNjb3Zlcmllcykge1xuXHRcdFx0ZGlzY292ZXJ5LnN0YXJ0KHRoaXMuZW5hYmxlbWVudE1vZGVsKTtcblx0XHR9XG5cblx0XHR0aGlzLnBsdWdpbnMgPSBkZXJpdmVkKHJlYWQgPT4ge1xuXHRcdFx0aWYgKCFwbHVnaW5zRW5hYmxlZC5yZWFkKHJlYWQpKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRpc2NvdmVyZWRQbHVnaW5zID0gcmVhZERpc2NvdmVyZWRBZ2VudFBsdWdpbnMoZGlzY292ZXJpZXMsIHJlYWQpO1xuXHRcdFx0aWYgKCFkaXNjb3ZlcmVkUGx1Z2lucykge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZ2V0U29ydGVkQWdlbnRQbHVnaW5zKGRpc2NvdmVyZWRQbHVnaW5zKTtcblx0XHR9KTtcblxuXHRcdC8vIE1hcmsgcG9saWN5LWJsb2NrZWQgcGx1Z2lucyByYXRoZXIgdGhhbiBoaWRpbmcgdGhlbTogYSBibG9ja2VkIHBsdWdpblxuXHRcdC8vIHN0YXlzIHZpc2libGUgKHNob3duIGFzIGRpc2FibGVkKSBidXQgaXRzIGBlbmFibGVtZW50YCBpcyBmb3JjZWQgdG9cblx0XHQvLyBkaXNhYmxlZCAoc2VlIGBfdG9QbHVnaW5gKSwgc28gaXQgaXMgaW5hY3RpdmUgYW5kIGNhbm5vdCBiZSByZS1lbmFibGVkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpbnMgPSB0aGlzLnBsdWdpbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcG9saWN5ID0gZW5hYmxlZFBsdWdpbnNQb2xpY3kucmVhZChyZWFkZXIpO1xuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHBsdWdpbiBvZiBwbHVnaW5zKSB7XG5cdFx0XHRcdFx0Y29uc3QgYmxvY2tlZCA9IGlzQWdlbnRQbHVnaW5CbG9ja2VkQnlQb2xpY3kocGx1Z2luLCBwb2xpY3kpO1xuXHRcdFx0XHRcdGlmIChzZXRQb2xpY3lCbG9ja2VkKHBsdWdpbiwgYmxvY2tlZCwgdHgpICYmIGJsb2NrZWQpIHtcblx0XHRcdFx0XHRcdGxvZ1NlcnZpY2UuZGVidWcoYFtBZ2VudFBsdWdpblNlcnZpY2VdIFBsdWdpbiAnJHtnZXRBZ2VudFBsdWdpblBvbGljeUlkKHBsdWdpbikgPz8gcGx1Z2luLnVyaS50b1N0cmluZygpfScgYmxvY2tlZCBcdTIwMTQgZGlzYWJsZWQgYnkgQ2hhdEVuYWJsZWRQbHVnaW5zIHBvbGljeWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQWdlbnRQbHVnaW5EaXNjb3ZlcnlXaXRoUHJpb3JpdHkge1xuXHRyZWFkb25seSBkaXNjb3Zlcnk6IElBZ2VudFBsdWdpbkRpc2NvdmVyeTtcblx0cmVhZG9ubHkgcHJpb3JpdHk6IEFnZW50UGx1Z2luRGlzY292ZXJ5UHJpb3JpdHk7XG5cdHJlYWRvbmx5IG9yZGVyOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIHJlYWREaXNjb3ZlcmVkQWdlbnRQbHVnaW5zKGRpc2NvdmVyaWVzOiByZWFkb25seSBJQWdlbnRQbHVnaW5EaXNjb3ZlcnlXaXRoUHJpb3JpdHlbXSwgcmVhZGVyOiBJUmVhZGVyKTogcmVhZG9ubHkgSURpc2NvdmVyZWRBZ2VudFBsdWdpbnNbXSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHJlc3VsdDogSURpc2NvdmVyZWRBZ2VudFBsdWdpbnNbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IHsgZGlzY292ZXJ5LCBwcmlvcml0eSwgb3JkZXIgfSBvZiBkaXNjb3Zlcmllcykge1xuXHRcdGNvbnN0IHBsdWdpbnMgPSBkaXNjb3ZlcnkucGx1Z2lucy5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFwbHVnaW5zKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXN1bHQucHVzaCh7IHBsdWdpbnMsIHByaW9yaXR5LCBvcmRlciB9KTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEEgZGlzY292ZXJlZCBwbHVnaW4uIEV4dGVuZHMgdGhlIHB1YmxpYyB7QGxpbmsgSUFnZW50UGx1Z2lufSB3aXRoIGEgc2V0dGFibGVcbiAqIGBwb2xpY3lCbG9ja2VkYCBvYnNlcnZhYmxlIHRoYXQgdGhlIHNlcnZpY2Ugd3JpdGVzIHRvIHdoZW4gZW50ZXJwcmlzZSBwb2xpY3lcbiAqIGJsb2NrcyB0aGUgcGx1Z2luLlxuICovXG5pbnRlcmZhY2UgUGx1Z2luRW50cnkgZXh0ZW5kcyBJQWdlbnRQbHVnaW4ge1xuXHRyZWFkb25seSBwb2xpY3lCbG9ja2VkOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+O1xufVxuXG4vKipcbiAqIE1hcmtzIGEgcGx1Z2luIGFzIGJsb2NrZWQgKG9yIHVuYmxvY2tlZCkgYnkgZW50ZXJwcmlzZSBwb2xpY3kuIFNhZmUgdG8gY2FsbFxuICogZm9yIGFueSB7QGxpbmsgSUFnZW50UGx1Z2lufTsgZW50cmllcyB3aXRob3V0IGEgc2V0dGFibGUgb2JzZXJ2YWJsZSAoZS5nLiB0ZXN0XG4gKiBkb3VibGVzKSBhcmUgaWdub3JlZC5cbiAqL1xuZnVuY3Rpb24gc2V0UG9saWN5QmxvY2tlZChwbHVnaW46IElBZ2VudFBsdWdpbiwgYmxvY2tlZDogYm9vbGVhbiwgdHg6IElUcmFuc2FjdGlvbik6IGJvb2xlYW4ge1xuXHRjb25zdCBvYnMgPSBwbHVnaW4ucG9saWN5QmxvY2tlZCBhcyBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXHRpZiAob2JzICYmIHR5cGVvZiBvYnMuc2V0ID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0aWYgKG9icy5nZXQoKSA9PT0gYmxvY2tlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRvYnMuc2V0KGJsb2NrZWQsIHR4KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbi8qKlxuICogTWluaW1hbCBzaGFwZSBvZiBhIHBhcnNlZCBwbHVnaW4gbWFuaWZlc3QuIEtub3duIGZpZWxkcyBhcmUgdHlwZWQ7IHVua25vd25cbiAqIGtleXMgKGUuZy4gYGNvbW1hbmRzYCwgYHNraWxsc2AsIGBob29rc2AsIGBtY3BTZXJ2ZXJzYCkgcmVtYWluIGB1bmtub3duYCBhbmRcbiAqIGFyZSBwYXJzZWQgYnkgdGhlIGNvbXBvbmVudCByZWFkZXJzLlxuICpcbiAqIE5PVEU6IGBuYW1lYCBpcyB0eXBlZCBhcyBgc3RyaW5nIHwgdW5kZWZpbmVkYCB0byBleHByZXNzIGludGVudCwgYnV0XG4gKiBjb25zdW1lcnMgbXVzdCBzdGlsbCBydW50aW1lLXZhbGlkYXRlIGl0IChtYW5pZmVzdHMgYXJlIHVudHJ1c3RlZCBKU09OKS5cbiAqL1xuaW50ZXJmYWNlIElQbHVnaW5NYW5pZmVzdCB7XG5cdHJlYWRvbmx5IG5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IHVua25vd247XG59XG5cbi8qKlxuICogRGVzY3JpYmVzIGEgc2luZ2xlIGRpc2NvdmVyZWQgcGx1Z2luIHNvdXJjZSwgYmVmb3JlIHRoZSBzaGFyZWRcbiAqIGluZnJhc3RydWN0dXJlIGJ1aWxkcyB0aGUgZnVsbCB7QGxpbmsgSUFnZW50UGx1Z2lufSBmcm9tIGl0LlxuICovXG5pbnRlcmZhY2UgSVBsdWdpblNvdXJjZSB7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRyZWFkb25seSBmcm9tTWFya2V0cGxhY2U6IElNYXJrZXRwbGFjZVBsdWdpbiB8IHVuZGVmaW5lZDtcblx0LyoqIFJlcG9zaXRvcnkgcm9vdCB0aGF0IHNlcnZlcyBhcyB0aGUgYm91bmRhcnkgZm9yIGNvbXBvbmVudCBwYXRoIHJlc29sdXRpb24uICovXG5cdHJlYWRvbmx5IHJlcG9zaXRvcnlVcmk/OiBVUkk7XG5cdC8qKiBDYWxsZWQgd2hlbiByZW1vdmUgaXMgaW52b2tlZCBvbiB0aGUgcGx1Z2luOyBhYnNlbnQgZm9yIHBvbGljeS1tYW5hZ2VkIHBsdWdpbnMgKi9cblx0cmVtb3ZlPygpOiB2b2lkO1xufVxuXG4vKipcbiAqIFNoYXJlZCBiYXNlIGNsYXNzIGZvciBwbHVnaW4gZGlzY292ZXJ5IGltcGxlbWVudGF0aW9ucy4gQ29udGFpbnMgdGhlIGNvbW1vblxuICogbG9naWMgZm9yIHJlYWRpbmcgcGx1Z2luIGNvbnRlbnRzIChjb21tYW5kcywgc2tpbGxzLCBhZ2VudHMsIGhvb2tzLCBNQ1Agc2VydmVyXG4gKiBkZWZpbml0aW9ucykgZnJvbSB0aGUgZmlsZXN5c3RlbSBhbmQgd2F0Y2hpbmcgZm9yIGxpdmUgdXBkYXRlcy5cbiAqXG4gKiBTdWJjbGFzc2VzIGltcGxlbWVudCB7QGxpbmsgX2Rpc2NvdmVyUGx1Z2luU291cmNlc30gdG8gZGV0ZXJtaW5lICp3aGljaCpcbiAqIHBsdWdpbnMgZXhpc3QsIHdoaWxlIHRoaXMgY2xhc3MgaGFuZGxlcyB0aGUgcmVzdC5cbiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0QWdlbnRQbHVnaW5EaXNjb3ZlcnkgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50UGx1Z2luRGlzY292ZXJ5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wbHVnaW5FbnRyaWVzID0gbmV3IE1hcDxzdHJpbmcsIHsgcGx1Z2luOiBQbHVnaW5FbnRyeTsgc3RvcmU6IERpc3Bvc2FibGVTdG9yZTsgZm9ybWF0OiBJUGx1Z2luRm9ybWF0Q29uZmlnIH0+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGx1Z2lucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5bXSB8IHVuZGVmaW5lZD4oJ2Rpc2NvdmVyZWRBZ2VudFBsdWdpbnMnLCB1bmRlZmluZWQpO1xuXHRwdWJsaWMgcmVhZG9ubHkgcGx1Z2luczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUFnZW50UGx1Z2luW10gfCB1bmRlZmluZWQ+ID0gdGhpcy5fcGx1Z2lucztcblxuXHRwcml2YXRlIF9kaXNjb3ZlclZlcnNpb24gPSAwO1xuXHRwcm90ZWN0ZWQgX2VuYWJsZW1lbnRNb2RlbCE6IElFbmFibGVtZW50TW9kZWw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBhYnN0cmFjdCBzdGFydChlbmFibGVtZW50TW9kZWw6IElFbmFibGVtZW50TW9kZWwpOiB2b2lkO1xuXG5cdHByb3RlY3RlZCBhc3luYyBfcmVmcmVzaFBsdWdpbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdmVyc2lvbiA9ICsrdGhpcy5fZGlzY292ZXJWZXJzaW9uO1xuXHRcdGNvbnN0IHBsdWdpbnMgPSBhd2FpdCB0aGlzLl9kaXNjb3ZlckFuZEJ1aWxkUGx1Z2lucyh2ZXJzaW9uKTtcblx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudFJlZnJlc2godmVyc2lvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9wbHVnaW5zLnNldChwbHVnaW5zLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqIFN1YmNsYXNzZXMgcmV0dXJuIHBsdWdpbiBzb3VyY2VzIHRvIGRpc2NvdmVyLiAqL1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2Rpc2NvdmVyUGx1Z2luU291cmNlcygpOiBQcm9taXNlPHJlYWRvbmx5IElQbHVnaW5Tb3VyY2VbXT47XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlzY292ZXJBbmRCdWlsZFBsdWdpbnModmVyc2lvbjogbnVtYmVyKTogUHJvbWlzZTxyZWFkb25seSBJQWdlbnRQbHVnaW5bXT4ge1xuXHRcdGNvbnN0IHNvdXJjZXMgPSBhd2FpdCB0aGlzLl9kaXNjb3ZlclBsdWdpblNvdXJjZXMoKTtcblx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudFJlZnJlc2godmVyc2lvbikpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBwbHVnaW5zOiBJQWdlbnRQbHVnaW5bXSA9IFtdO1xuXHRcdGNvbnN0IHNlZW5QbHVnaW5VcmlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgYXR0ZW1wdGVkUGx1Z2luVXJpcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0Zm9yIChjb25zdCBzb3VyY2Ugb2Ygc291cmNlcykge1xuXHRcdFx0Y29uc3Qga2V5ID0gc291cmNlLnVyaS50b1N0cmluZygpO1xuXHRcdFx0aWYgKCFhdHRlbXB0ZWRQbHVnaW5VcmlzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdGF0dGVtcHRlZFBsdWdpblVyaXMuYWRkKGtleSk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9ybWF0ID0gYXdhaXQgZGV0ZWN0UGx1Z2luRm9ybWF0KHNvdXJjZS51cmksIHRoaXMuX2ZpbGVTZXJ2aWNlKTtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudFJlZnJlc2godmVyc2lvbikpIHtcblx0XHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcGx1Z2luID0gYXdhaXQgdGhpcy5fdG9QbHVnaW4oc291cmNlLnVyaSwgZm9ybWF0LCBzb3VyY2UuZnJvbU1hcmtldHBsYWNlLCBzb3VyY2UucmVwb3NpdG9yeVVyaSwgc291cmNlLnJlbW92ZSwgdmVyc2lvbik7XG5cdFx0XHRcdFx0c2VlblBsdWdpblVyaXMuYWRkKGtleSk7XG5cdFx0XHRcdFx0cGx1Z2lucy5wdXNoKHBsdWdpbik7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRQbHVnaW5EaXNjb3ZlcnldIFJlamVjdGVkIHBsdWdpbiAnJHtzb3VyY2UudXJpLnRvU3RyaW5nKCl9JzogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5faXNDdXJyZW50UmVmcmVzaCh2ZXJzaW9uKSkge1xuXHRcdFx0dGhpcy5fZGlzcG9zZVBsdWdpbkVudHJpZXNFeGNlcHQoc2VlblBsdWdpblVyaXMpO1xuXHRcdH1cblxuXHRcdHBsdWdpbnMuc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKTtcblx0XHRyZXR1cm4gcGx1Z2lucztcblx0fVxuXG5cdHByaXZhdGUgX2lzQ3VycmVudFJlZnJlc2godmVyc2lvbjogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHZlcnNpb24gPT09IHRoaXMuX2Rpc2NvdmVyVmVyc2lvbiAmJiAhdGhpcy5fc3RvcmUuaXNEaXNwb3NlZDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfcGF0aEV4aXN0cyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdG9QbHVnaW4odXJpOiBVUkksIGZvcm1hdDogSVBsdWdpbkZvcm1hdENvbmZpZywgZnJvbU1hcmtldHBsYWNlOiBJTWFya2V0cGxhY2VQbHVnaW4gfCB1bmRlZmluZWQsIHJlcG9zaXRvcnlVcmk6IFVSSSB8IHVuZGVmaW5lZCwgcmVtb3ZlQ2FsbGJhY2s6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCwgdmVyc2lvbjogbnVtYmVyKTogUHJvbWlzZTxJQWdlbnRQbHVnaW4+IHtcblx0XHRjb25zdCBrZXkgPSB1cmkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3BsdWdpbkVudHJpZXMuZ2V0KGtleSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzQ3VycmVudFJlZnJlc2godmVyc2lvbikpIHtcblx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nLnBsdWdpbjtcblx0XHRcdH1cblx0XHRcdGlmIChleGlzdGluZy5mb3JtYXQuZm9ybWF0ICE9PSBmb3JtYXQuZm9ybWF0KSB7XG5cdFx0XHRcdGV4aXN0aW5nLnN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fcGx1Z2luRW50cmllcy5kZWxldGUoa2V5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGV4aXN0aW5nLnBsdWdpbi5yZW1vdmUgPSByZW1vdmVDYWxsYmFjaztcblx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nLnBsdWdpbjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHQvLyBTZXQgYnkgdGhlIHNlcnZpY2Ugd2hlbiBlbnRlcnByaXNlIHBvbGljeSBibG9ja3MgdGhpcyBwbHVnaW47IHdoZW4gc2V0LFxuXHRcdC8vIHRoZSBwbHVnaW4gaXMgZm9yY2VkIGRpc2FibGVkIHJlZ2FyZGxlc3Mgb2YgdGhlIHVzZXIncyBlbmFibGVtZW50IGNob2ljZS5cblx0XHRjb25zdCBwb2xpY3lCbG9ja2VkID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdwb2xpY3lCbG9ja2VkJywgZmFsc2UpO1xuXHRcdGNvbnN0IGVuYWJsZW1lbnQgPSBkZXJpdmVkKHIgPT4gcG9saWN5QmxvY2tlZC5yZWFkKHIpXG5cdFx0XHQ/IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFByb2ZpbGVcblx0XHRcdDogdGhpcy5fZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKGtleSwgcikpO1xuXG5cdFx0Ly8gUmVhZCB0aGUgbWFuaWZlc3QgdXAgZnJvbnQgc28gaXRzIGBuYW1lYCBmaWVsZCBjYW4gYmUgdXNlZCBpbiB0aGVcblx0XHQvLyBwbHVnaW4gbGFiZWwgKGZvciBkaXJlY3QgaW5zdGFsbHMgdGhhdCBoYXZlIG5vIG1hcmtldHBsYWNlIG1ldGFkYXRhKS5cblx0XHQvLyBDb21wb25lbnQgZGlyZWN0b3JpZXMgYXJlIHRyYWNrZWQgdmlhIG9ic2VydmVycyBkb3duc3RyZWFtIGFuZFxuXHRcdC8vIHJlLXJlYWQgd2hlbmV2ZXIgdGhlIG1hbmlmZXN0IGNoYW5nZXMgb24gZGlzay5cblx0XHRjb25zdCBpbml0aWFsTWFuaWZlc3QgPSBhd2FpdCByZWFkUGx1Z2luTWFuaWZlc3QodXJpLCBmb3JtYXQsIHRoaXMuX2ZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBtYW5pZmVzdCA9IG9ic2VydmFibGVWYWx1ZTxJUGx1Z2luTWFuaWZlc3QgfCB1bmRlZmluZWQ+KCdhZ2VudFBsdWdpbk1hbmlmZXN0JywgaW5pdGlhbE1hbmlmZXN0KTtcblxuXHRcdGNvbnN0IG9ic2VydmVDb21wb25lbnQgPSA8VD4oXG5cdFx0XHRwcm9wOiBQbHVnaW5Db21wb25lbnQsXG5cdFx0XHRkb1JlYWQ6ICh1cmlzOiByZWFkb25seSBVUklbXSkgPT4gUHJvbWlzZTxyZWFkb25seSBUW10+LFxuXHRcdFx0dHJ5UmVhZEVtYmVkZGVkPzogKHNlY3Rpb246IHVua25vd24pID0+IFByb21pc2U8VFtdIHwgdW5kZWZpbmVkPixcblx0XHRcdGRlZmF1bHRQYXRoOiBzdHJpbmcgPSBwcm9wLFxuXHRcdCk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IFRbXT4gPT4ge1xuXHRcdFx0Y29uc3Qgc2Vjb25kT2JzID0gZGVyaXZlZE9wdHMoeyBlcXVhbHNGbjogZXF1YWxzIH0sIHJlYWRlciA9PiBnZXRQbHVnaW5NYW5pZmVzdENvbXBvbmVudChmb3JtYXQsIHByb3AsIG1hbmlmZXN0LnJlYWQocmVhZGVyKSkpO1xuXG5cdFx0XHRjb25zdCB3cmFwcGVkID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRpZiAoZm9ybWF0LnJlcXVpcmVzTWFuaWZlc3QgJiYgIW1hbmlmZXN0LnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdkaXJzJywgZGlyczogW10gfSBhcyBjb25zdDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzZWN0aW9uID0gc2Vjb25kT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKHRyeVJlYWRFbWJlZGRlZCkge1xuXHRcdFx0XHRcdGlmIChzZWN0aW9uICYmIHR5cGVvZiBzZWN0aW9uID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShzZWN0aW9uKSAmJiAhKGhhc0tleShzZWN0aW9uLCB7IHBhdGhzOiB0cnVlIH0pKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2NvbnN0JywgZGF0YTogbmV3IE9ic2VydmFibGVQcm9taXNlKHRyeVJlYWRFbWJlZGRlZChzZWN0aW9uKSkgfSBhcyBjb25zdDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBkaXJzID0gcmVzb2x2ZVBsdWdpbkNvbXBvbmVudERpcnModXJpLCBmb3JtYXQsIHByb3AsIGRlZmF1bHRQYXRoLCBzZWN0aW9uLCByZXBvc2l0b3J5VXJpKTtcblx0XHRcdFx0Zm9yIChjb25zdCBkIG9mIGRpcnMpIHtcblx0XHRcdFx0XHRjb25zdCB3YXRjaGVyID0gdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlV2F0Y2hlcihkLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KTtcblx0XHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHdhdGNoZXIpO1xuXHRcdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQod2F0Y2hlci5vbkRpZENoYW5nZSgoKSA9PiBjaGFuZ2VUcmlnZ2VyLnRyaWdnZXIodW5kZWZpbmVkKSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2RpcnMnLCBkaXJzOiBkaXJzIH0gYXMgY29uc3Q7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlVHJpZ2dlciA9IG9ic2VydmFibGVTaWduYWwoJ2ZpbGVDaGFuZ2UnKTtcblxuXHRcdFx0Y29uc3QgcHJvbWlzZWQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHcgPSB3cmFwcGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKHcua2luZCA9PT0gJ2NvbnN0Jykge1xuXHRcdFx0XHRcdHJldHVybiB3LmRhdGEucHJvbWlzZVJlc3VsdDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjaGFuZ2VUcmlnZ2VyLnJlYWQocmVhZGVyKTsgLy8gcmUtcnVuIHdoZW4gYSByZWxldmFudCBmaWxlIGNoYW5nZSBvY2N1cnNcblx0XHRcdFx0XHRjb25zdCBwcm9taXNlID0gbmV3IE9ic2VydmFibGVQcm9taXNlKGRvUmVhZCh3LmRpcnMpKTtcblx0XHRcdFx0XHRyZXR1cm4gcHJvbWlzZS5wcm9taXNlUmVzdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcHJvbWlzZWQubWFwKCh3LCByKSA9PiB3LnJlYWQocik/LmRhdGEgPz8gSXRlcmFibGUuZW1wdHkoKSk7XG5cblx0XHRcdHJldHVybiByZXN1bHQucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2Uoc3RvcmUpO1xuXHRcdH07XG5cblx0XHRjb25zdCBtYW5pZmVzdFVyaSA9IGpvaW5QYXRoKHVyaSwgZm9ybWF0Lm1hbmlmZXN0UGF0aCk7XG5cdFx0Y29uc3QgY29tbWFuZHMgPSBvYnNlcnZlQ29tcG9uZW50KCdjb21tYW5kcycsIGQgPT4gcmVhZE1hcmtkb3duQ29tcG9uZW50cyhkLCB0aGlzLl9maWxlU2VydmljZSkpO1xuXHRcdGNvbnN0IHNraWxscyA9IG9ic2VydmVDb21wb25lbnQoJ3NraWxscycsIGQgPT4gcmVhZFBsdWdpblNraWxscyh1cmksIGQsIGZvcm1hdCwgdGhpcy5fZmlsZVNlcnZpY2UpKTtcblx0XHRjb25zdCBhZ2VudHMgPSBvYnNlcnZlQ29tcG9uZW50KCdhZ2VudHMnLCBkID0+IHJlYWRNYXJrZG93bkNvbXBvbmVudHMoZCwgdGhpcy5fZmlsZVNlcnZpY2UpKTtcblx0XHRjb25zdCBpbnN0cnVjdGlvbnMgPSBvYnNlcnZlQ29tcG9uZW50KCdydWxlcycsIGQgPT4gdGhpcy5fcmVhZFJ1bGVzKGQpKTtcblx0XHRjb25zdCBob29rcyA9IG9ic2VydmVDb21wb25lbnQoXG5cdFx0XHQnaG9va3MnLFxuXHRcdFx0cGF0aHMgPT4gdGhpcy5fcmVhZEhvb2tzRnJvbVBhdGhzKHVyaSwgcGF0aHMsIGZvcm1hdCksXG5cdFx0XHRhc3luYyBzZWN0aW9uID0+IHtcblx0XHRcdFx0Y29uc3QgdXNlckhvbWUgPSBhd2FpdCB0aGlzLl9wYXRoU2VydmljZS51c2VySG9tZSgpO1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VSb290ID0gcmVzb2x2ZVdvcmtzcGFjZVJvb3QodXJpLCB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0XHRcdHJldHVybiB0b0FnZW50UGx1Z2luSG9va3MoZm9ybWF0LnBhcnNlSG9va3MobWFuaWZlc3RVcmksIHNlY3Rpb24sIHVyaSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpKTtcblx0XHRcdH0sXG5cdFx0XHRmb3JtYXQuaG9va0NvbmZpZ1BhdGgsXG5cdFx0KTtcblxuXHRcdGNvbnN0IG1jcFNlcnZlckRlZmluaXRpb25zID0gb2JzZXJ2ZUNvbXBvbmVudChcblx0XHRcdCdtY3BTZXJ2ZXJzJyxcblx0XHRcdHBhdGhzID0+IHJlYWRQbHVnaW5NY3BTZXJ2ZXJzKHVyaSwgcGF0aHMsIGZvcm1hdCwgdGhpcy5fZmlsZVNlcnZpY2UpLFxuXHRcdFx0YXN5bmMgc2VjdGlvbiA9PiBwYXJzZU1jcFNlcnZlckRlZmluaXRpb25NYXAobWFuaWZlc3RVcmksIHsgbWNwU2VydmVyczogc2VjdGlvbiB9LCB1cmkuZnNQYXRoLCBmb3JtYXQpLFxuXHRcdFx0Jy5tY3AuanNvbicsXG5cdFx0KTtcblxuXHRcdC8vIFJlLXJlYWQgdGhlIG1hbmlmZXN0IHdoZW5ldmVyIGl0IGNoYW5nZXMgb24gZGlzay4gVGhlIGluaXRpYWwgdmFsdWVcblx0XHQvLyB3YXMgYWxyZWFkeSBwb3B1bGF0ZWQgYWJvdmUgYmVmb3JlIGNvbnN0cnVjdGluZyB0aGUgb2JzZXJ2YWJsZS5cblx0XHRjb25zdCByZWFkTWFuaWZlc3QgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBsYXRlc3RGb3JtYXQgPSBhd2FpdCBkZXRlY3RQbHVnaW5Gb3JtYXQodXJpLCB0aGlzLl9maWxlU2VydmljZSk7XG5cdFx0XHRcdGlmIChsYXRlc3RGb3JtYXQuZm9ybWF0ICE9PSBmb3JtYXQuZm9ybWF0KSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fcmVmcmVzaFBsdWdpbnMoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0bWFuaWZlc3Quc2V0KGF3YWl0IHJlYWRQbHVnaW5NYW5pZmVzdCh1cmksIGZvcm1hdCwgdGhpcy5fZmlsZVNlcnZpY2UpLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0bWFuaWZlc3Quc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRQbHVnaW5EaXNjb3ZlcnldIFJlamVjdGVkIHVwZGF0ZWQgcGx1Z2luICcke3VyaS50b1N0cmluZygpfSc6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBhZ2VudE1hbmlmZXN0VXJpID0gam9pblBhdGgodXJpLCAncGx1Z2luLmpzb24nKTtcblx0XHRjb25zdCByb290V2F0Y2hlciA9IHRoaXMuX2ZpbGVTZXJ2aWNlLmNyZWF0ZVdhdGNoZXIodXJpLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KTtcblx0XHRzdG9yZS5hZGQocm9vdFdhdGNoZXIpO1xuXHRcdHN0b3JlLmFkZChyb290V2F0Y2hlci5vbkRpZENoYW5nZShjaGFuZ2UgPT4ge1xuXHRcdFx0aWYgKGNoYW5nZS5hZmZlY3RzKGFnZW50TWFuaWZlc3RVcmkpKSB7XG5cdFx0XHRcdHZvaWQgcmVhZE1hbmlmZXN0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZCh0aGlzLl9maWxlU2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihldmVudCA9PiB7XG5cdFx0XHRpZiAoaXNFcXVhbChldmVudC5yZXNvdXJjZSwgYWdlbnRNYW5pZmVzdFVyaSkpIHtcblx0XHRcdFx0dm9pZCByZWFkTWFuaWZlc3QoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0aWYgKCFpc0VxdWFsKG1hbmlmZXN0VXJpLCBhZ2VudE1hbmlmZXN0VXJpKSkge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3RXYXRjaGVyID0gdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlV2F0Y2hlcihtYW5pZmVzdFVyaSwgeyByZWN1cnNpdmU6IGZhbHNlLCBleGNsdWRlczogW10gfSk7XG5cdFx0XHRzdG9yZS5hZGQobWFuaWZlc3RXYXRjaGVyKTtcblx0XHRcdHN0b3JlLmFkZChtYW5pZmVzdFdhdGNoZXIub25EaWRDaGFuZ2UoKCkgPT4gcmVhZE1hbmlmZXN0KCkpKTtcblx0XHR9XG5cblx0XHRjb25zdCBtYW5pZmVzdE5hbWUgPSB0eXBlb2YgaW5pdGlhbE1hbmlmZXN0Py5uYW1lID09PSAnc3RyaW5nJyAmJiBpbml0aWFsTWFuaWZlc3QubmFtZS50cmltKClcblx0XHRcdD8gaW5pdGlhbE1hbmlmZXN0Lm5hbWUudHJpbSgpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHBsdWdpbjogUGx1Z2luRW50cnkgPSB7XG5cdFx0XHR1cmksXG5cdFx0XHRmb3JtYXQ6IGZvcm1hdC5mb3JtYXQsXG5cdFx0XHRsYWJlbDogZnJvbU1hcmtldHBsYWNlPy5uYW1lID8/IG1hbmlmZXN0TmFtZSA/PyBiYXNlbmFtZSh1cmkpLFxuXHRcdFx0ZW5hYmxlbWVudCxcblx0XHRcdHBvbGljeUJsb2NrZWQsXG5cdFx0XHRyZW1vdmU6IHJlbW92ZUNhbGxiYWNrLFxuXHRcdFx0aG9va3MsXG5cdFx0XHRjb21tYW5kcyxcblx0XHRcdHNraWxscyxcblx0XHRcdGFnZW50cyxcblx0XHRcdGluc3RydWN0aW9ucyxcblx0XHRcdG1jcFNlcnZlckRlZmluaXRpb25zLFxuXHRcdFx0ZnJvbU1hcmtldHBsYWNlLFxuXHRcdH07XG5cblx0XHRpZiAodGhpcy5faXNDdXJyZW50UmVmcmVzaCh2ZXJzaW9uKSkge1xuXHRcdFx0dGhpcy5fcGx1Z2luRW50cmllcy5zZXQoa2V5LCB7IHN0b3JlLCBwbHVnaW4sIGZvcm1hdCB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwbHVnaW47XG5cdH1cblxuXHQvKipcblx0ICogUmVhZHMgaG9vayBkZWZpbml0aW9ucyBmcm9tIGEgbGlzdCBvZiByZXNvbHZlZCBwYXRocyAoSlNPTiBmaWxlcykuXG5cdCAqIEVhY2ggcGF0aCBpcyB0cmllZCBpbiBvcmRlcjsgdGhlIGZpcnN0IG9uZSB0aGF0IGNvbnRhaW5zIHZhbGlkIGhvb2tcblx0ICogSlNPTiBpcyB1c2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVhZEhvb2tzRnJvbVBhdGhzKHBsdWdpblVyaTogVVJJLCBwYXRoczogcmVhZG9ubHkgVVJJW10sIGZvcm1hdDogSVBsdWdpbkZvcm1hdENvbmZpZyk6IFByb21pc2U8cmVhZG9ubHkgSUFnZW50UGx1Z2luSG9va1tdPiB7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSBhd2FpdCB0aGlzLl9wYXRoU2VydmljZS51c2VySG9tZSgpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVJvb3QgPSByZXNvbHZlV29ya3NwYWNlUm9vdChwbHVnaW5VcmksIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRmb3IgKGNvbnN0IGhvb2tQYXRoIG9mIHBhdGhzKSB7XG5cdFx0XHRjb25zdCBqc29uID0gYXdhaXQgdGhpcy5fcmVhZEpzb25GaWxlKGhvb2tQYXRoKTtcblx0XHRcdGlmIChqc29uKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRvQWdlbnRQbHVnaW5Ib29rcyhmb3JtYXQucGFyc2VIb29rcyhob29rUGF0aCwganNvbiwgcGx1Z2luVXJpLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSkpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRQbHVnaW5EaXNjb3ZlcnldIEZhaWxlZCB0byBwYXJzZSBob29rcyBmcm9tICR7aG9va1BhdGgudG9TdHJpbmcoKX06YCwgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZEpzb25GaWxlKHVyaTogVVJJKTogUHJvbWlzZTx1bmtub3duIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGZpbGVDb250ZW50cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSk7XG5cdFx0XHRyZXR1cm4gcGFyc2VKU09OQyhmaWxlQ29udGVudHMudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTY2FucyBkaXJlY3RvcmllcyBmb3IgcnVsZS9pbnN0cnVjdGlvbiBmaWxlcyAoYC5tZGNgLCBgLm1kYCxcblx0ICogYC5pbnN0cnVjdGlvbnMubWRgKSwgcmV0dXJuaW5nIGB7IHVyaSwgbmFtZSB9YCBlbnRyaWVzIHdoZXJlIG5hbWUgaXNcblx0ICogZGVyaXZlZCBmcm9tIHRoZSBmaWxlbmFtZSBtaW51cyB0aGUgbWF0Y2hlZCBzdWZmaXguXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWFkUnVsZXMoZGlyczogcmVhZG9ubHkgVVJJW10pOiBQcm9taXNlPHJlYWRvbmx5IElBZ2VudFBsdWdpbkluc3RydWN0aW9uW10+IHtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgaXRlbXM6IElBZ2VudFBsdWdpbkluc3RydWN0aW9uW10gPSBbXTtcblxuXHRcdGNvbnN0IG1hdGNoU3VmZml4ID0gKGZpbGVuYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3QgbG93ZXIgPSBmaWxlbmFtZS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0cmV0dXJuIFJVTEVfRklMRV9TVUZGSVhFUy5maW5kKHMgPT4gbG93ZXIuZW5kc1dpdGgocykpO1xuXHRcdH07XG5cblx0XHRjb25zdCBhZGRJdGVtID0gKG5hbWU6IHN0cmluZywgdXJpOiBVUkkpID0+IHtcblx0XHRcdGlmICghc2Vlbi5oYXMobmFtZSkpIHtcblx0XHRcdFx0c2Vlbi5hZGQobmFtZSk7XG5cdFx0XHRcdGl0ZW1zLnB1c2goeyB1cmksIG5hbWUgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgZGlyIG9mIGRpcnMpIHtcblx0XHRcdGxldCBzdGF0O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUoZGlyKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0YXQuaXNGaWxlKSB7XG5cdFx0XHRcdGNvbnN0IHN1ZmZpeCA9IG1hdGNoU3VmZml4KGJhc2VuYW1lKGRpcikpO1xuXHRcdFx0XHRpZiAoc3VmZml4KSB7XG5cdFx0XHRcdFx0YWRkSXRlbShiYXNlbmFtZShkaXIpLnNsaWNlKDAsIC1zdWZmaXgubGVuZ3RoKSwgZGlyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFzdGF0LmlzRGlyZWN0b3J5IHx8ICFzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0aWYgKCFjaGlsZC5pc0ZpbGUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdWZmaXggPSBtYXRjaFN1ZmZpeChjaGlsZC5uYW1lKTtcblx0XHRcdFx0aWYgKHN1ZmZpeCkge1xuXHRcdFx0XHRcdGFkZEl0ZW0oY2hpbGQubmFtZS5zbGljZSgwLCAtc3VmZml4Lmxlbmd0aCksIGNoaWxkLnJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGl0ZW1zLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VQbHVnaW5FbnRyaWVzRXhjZXB0KGtlZXA6IFNldDxzdHJpbmc+KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBba2V5LCBlbnRyeV0gb2YgdGhpcy5fcGx1Z2luRW50cmllcykge1xuXHRcdFx0aWYgKCFrZWVwLmhhcyhrZXkpKSB7XG5cdFx0XHRcdGVudHJ5LnN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fcGx1Z2luRW50cmllcy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NlUGx1Z2luRW50cmllc0V4Y2VwdChuZXcgU2V0PHN0cmluZz4oKSk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb25maWd1cmVkQWdlbnRQbHVnaW5EaXNjb3ZlcnkgZXh0ZW5kcyBBYnN0cmFjdEFnZW50UGx1Z2luRGlzY292ZXJ5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wbHVnaW5Mb2NhdGlvbnNDb25maWc6IElPYnNlcnZhYmxlPFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfZW50ZXJwcmlzZUVuYWJsZWRQbHVnaW5zQ29uZmlnOiBJT2JzZXJ2YWJsZTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2U6IElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGZpbGVTZXJ2aWNlLCBwYXRoU2VydmljZSwgbG9nU2VydmljZSwgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdHRoaXMuX3BsdWdpbkxvY2F0aW9uc0NvbmZpZyA9IG9ic2VydmFibGVDb25maWdWYWx1ZTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj4oQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTG9jYXRpb25zLCB7fSwgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHQvLyBFbnRlcnByaXNlLW1hbmFnZWQgcGx1Z2luLUlEIGVudHJpZXMgKGRlbGl2ZXJlZCB2aWEgdGhlIGBDaGF0RW5hYmxlZFBsdWdpbnNgIHBvbGljeSkuXG5cdFx0Ly8gVGhlc2UgYXJlIHBsdWdpbiBJRHMgaW4gYDxwbHVnaW4+QDxtYXJrZXRwbGFjZT5gIGZvcm0sIGRpc3RpbmN0IGZyb20gZmlsZXN5c3RlbSBwYXRocy5cblx0XHQvLyBSZWFkIHZpYSBgaW5zcGVjdCgpYCBzbyB1c2VyLXNldCBlbnRyaWVzIHN1cnZpdmUgd2hlbiB0aGUgcG9saWN5IGlzIGFsc28gc2V0IFx1MjAxNFxuXHRcdC8vIGBnZXRWYWx1ZSgpYCBhbG9uZSB3b3VsZCBzdXJmYWNlIG9ubHkgdGhlIHBvbGljeSB2YWx1ZS5cblx0XHR0aGlzLl9lbnRlcnByaXNlRW5hYmxlZFBsdWdpbnNDb25maWcgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHRFdmVudC5maWx0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRW5hYmxlZFBsdWdpbnMpKSxcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zcGVjdGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj4oQ2hhdENvbmZpZ3VyYXRpb24uRW5hYmxlZFBsdWdpbnMpO1xuXHRcdFx0XHRyZXR1cm4geyAuLi5pbnNwZWN0ZWQuZGVmYXVsdFZhbHVlLCAuLi5pbnNwZWN0ZWQudXNlclZhbHVlLCAuLi5pbnNwZWN0ZWQucG9saWN5VmFsdWUgfTtcblx0XHRcdH0sXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBzdGFydChlbmFibGVtZW50TW9kZWw6IElFbmFibGVtZW50TW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl9lbmFibGVtZW50TW9kZWwgPSBlbmFibGVtZW50TW9kZWw7XG5cdFx0Y29uc3Qgc2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fcmVmcmVzaFBsdWdpbnMoKSwgMCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3BsdWdpbkxvY2F0aW9uc0NvbmZpZy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9lbnRlcnByaXNlRW5hYmxlZFBsdWdpbnNDb25maWcucmVhZChyZWFkZXIpO1xuXHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fSkpO1xuXHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9kaXNjb3ZlclBsdWdpblNvdXJjZXMoKTogUHJvbWlzZTxyZWFkb25seSBJUGx1Z2luU291cmNlW10+IHtcblx0XHRjb25zdCBzb3VyY2VzOiBJUGx1Z2luU291cmNlW10gPSBbXTtcblx0XHRjb25zdCB1c2VySG9tZSA9IGF3YWl0IHRoaXMuX2dldFVzZXJIb21lKCk7XG5cblx0XHQvLyBVc2VyLWNvbmZpZ3VyZWQgZmlsZXN5c3RlbSBwYXRocyBpbiBgY2hhdC5wbHVnaW5Mb2NhdGlvbnNgIFx1MjAxNCByZW1vdmFibGVcblx0XHQvLyBieSByZS13cml0aW5nIHRoZSB1c2VyIHNldHRpbmcuIEZpbGVzeXN0ZW0tb25seTsgYW4gZW50cnkgdGhhdCBoYXBwZW5zXG5cdFx0Ly8gdG8gbG9vayBsaWtlIGBuYW1lQG1hcmtldHBsYWNlYCBpcyB0cmVhdGVkIGFzIGEgcmVsYXRpdmUgcGF0aCwgbm90IGFuIElELlxuXHRcdGZvciAoY29uc3QgW2tleSwgZW5hYmxlZF0gb2YgT2JqZWN0LmVudHJpZXModGhpcy5fcGx1Z2luTG9jYXRpb25zQ29uZmlnLmdldCgpKSkge1xuXHRcdFx0Y29uc3QgdHJpbW1lZCA9IGtleS50cmltKCk7XG5cdFx0XHRpZiAoIXRyaW1tZWQgfHwgZW5hYmxlZCA9PT0gZmFsc2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHRoaXMuX3Jlc29sdmVQbHVnaW5QYXRoKHRyaW1tZWQsIHVzZXJIb21lKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9hZGRQbHVnaW5Tb3VyY2Uoc291cmNlcywgcmVzb3VyY2UsICdwbHVnaW4gcGF0aCcsICgpID0+IHRoaXMuX3JlbW92ZVBsdWdpblBhdGgoa2V5KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRW50ZXJwcmlzZS1tYW5hZ2VkIHBsdWdpbiBJRHMgaW4gYGNoYXQucGx1Z2lucy5lbmFibGVkUGx1Z2luc2AgKGRlbGl2ZXJlZFxuXHRcdC8vIHZpYSB0aGUgYENoYXRFbmFibGVkUGx1Z2luc2AgcG9saWN5KSBcdTIwMTQgSURzIG9mIHRoZSBmb3JtXG5cdFx0Ly8gYDxwbHVnaW4+QDxtYXJrZXRwbGFjZT5gLCByZXNvbHZlZCB0byB0aGUgQ29waWxvdCBDTEkgaW5zdGFsbCBjb252ZW50aW9uLlxuXHRcdC8vIE5vbi1yZW1vdmFibGUgZnJvbSB0aGUgVUkgKGVudGVycHJpc2UtbWFuYWdlZCkuXG5cdFx0Zm9yIChjb25zdCBba2V5LCBlbmFibGVkXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLl9lbnRlcnByaXNlRW5hYmxlZFBsdWdpbnNDb25maWcuZ2V0KCkpKSB7XG5cdFx0XHRjb25zdCB0cmltbWVkID0ga2V5LnRyaW0oKTtcblx0XHRcdGlmICghdHJpbW1lZCB8fCBlbmFibGVkID09PSBmYWxzZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5fcmVzb2x2ZUVudGVycHJpc2VQbHVnaW5JZCh0cmltbWVkLCB1c2VySG9tZSk7XG5cdFx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtDb25maWd1cmVkQWdlbnRQbHVnaW5EaXNjb3ZlcnldIFNraXBwaW5nIGVudGVycHJpc2UgcGx1Z2luIGVudHJ5IHRoYXQgaXMgbm90IGluIDxwbHVnaW4+QDxtYXJrZXRwbGFjZT4gZm9ybTogJHt0cmltbWVkfWApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX2FkZFBsdWdpblNvdXJjZShzb3VyY2VzLCByZXNvdXJjZSwgJ2VudGVycHJpc2UgcGx1Z2luIHBhdGgnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc291cmNlcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FkZFBsdWdpblNvdXJjZShzb3VyY2VzOiBJUGx1Z2luU291cmNlW10sIHJlc291cmNlOiBVUkksIGxhYmVsOiBzdHJpbmcsIHJlbW92ZT86ICgpID0+IHZvaWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgc3RhdDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW0NvbmZpZ3VyZWRBZ2VudFBsdWdpbkRpc2NvdmVyeV0gQ291bGQgbm90IHJlc29sdmUgJHtsYWJlbH06ICR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXN0YXQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtDb25maWd1cmVkQWdlbnRQbHVnaW5EaXNjb3ZlcnldICR7bGFiZWx9IGlzIG5vdCBhIGRpcmVjdG9yeTogJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHNvdXJjZXMucHVzaCh7XG5cdFx0XHR1cmk6IHN0YXQucmVzb3VyY2UsXG5cdFx0XHRmcm9tTWFya2V0cGxhY2U6IHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5nZXRNYXJrZXRwbGFjZVBsdWdpbk1ldGFkYXRhKHN0YXQucmVzb3VyY2UpLFxuXHRcdFx0cmVtb3ZlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0VXNlckhvbWUoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCB1c2VySG9tZSA9IGF3YWl0IHRoaXMuX3BhdGhTZXJ2aWNlLnVzZXJIb21lKCk7XG5cdFx0cmV0dXJuIHVzZXJIb21lLnNjaGVtZSA9PT0gJ2ZpbGUnID8gdXNlckhvbWUuZnNQYXRoIDogdXNlckhvbWUucGF0aDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBhIHVzZXItY29uZmlndXJlZCBwbHVnaW4gcGF0aCB0byBvbmUgb3IgbW9yZSByZXNvdXJjZSBVUklzLlxuXHQgKiBTdXBwb3J0cyBhYnNvbHV0ZSBwYXRocywgdGlsZGUgcGF0aHMgKGV4cGFuZGVkIHRvIHVzZXIgaG9tZSksIGFuZFxuXHQgKiB3b3Jrc3BhY2UtcmVsYXRpdmUgcGF0aHMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlUGx1Z2luUGF0aChwYXRoOiBzdHJpbmcsIHVzZXJIb21lOiBzdHJpbmcpOiBVUklbXSB7XG5cdFx0aWYgKHBhdGguc3RhcnRzV2l0aCgnficpKSB7XG5cdFx0XHRwYXRoID0gdW50aWxkaWZ5KHBhdGgsIHVzZXJIb21lKTtcblx0XHR9XG5cblx0XHRpZiAod2luMzIuaXNBYnNvbHV0ZShwYXRoKSB8fCBwb3NpeC5pc0Fic29sdXRlKHBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gW1VSSS5maWxlKHBhdGgpXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5tYXAoXG5cdFx0XHRmb2xkZXIgPT4gam9pblBhdGgoZm9sZGVyLnVyaSwgcGF0aClcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIGFuIGVudGVycHJpc2UgcGx1Z2luIElEIG9mIHRoZSBmb3JtIGA8cGx1Z2luPkA8bWFya2V0cGxhY2U+YCB0b1xuXHQgKiB0aGUgQ29waWxvdCBDTEkgaW5zdGFsbCBjb252ZW50aW9uIGB+Ly5jb3BpbG90L2luc3RhbGxlZC1wbHVnaW5zLzxtYXJrZXRwbGFjZT4vPHBsdWdpbj4vYC5cblx0ICogUmV0dXJucyBgdW5kZWZpbmVkYCBmb3IgYW55dGhpbmcgdGhhdCBkb2Vzbid0IG1hdGNoIHRoZSBJRCBzaGFwZS5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVFbnRlcnByaXNlUGx1Z2luSWQoaWQ6IHN0cmluZywgdXNlckhvbWU6IHN0cmluZyk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaWRNYXRjaCA9IGlkLm1hdGNoKC9eKFteQC9cXFxcfl0rKUAoW15AL1xcXFx+XSspJC8pO1xuXHRcdGlmICghaWRNYXRjaCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgWywgcGx1Z2luLCBtYXJrZXRwbGFjZV0gPSBpZE1hdGNoO1xuXHRcdHJldHVybiBVUkkuZmlsZShgJHt1c2VySG9tZX0vLmNvcGlsb3QvaW5zdGFsbGVkLXBsdWdpbnMvJHttYXJrZXRwbGFjZX0vJHtwbHVnaW59YCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlcyBhIHBsdWdpbiBwYXRoIGZyb20gYGNoYXQucGx1Z2luTG9jYXRpb25zYCBpbiB0aGUgbW9zdCBzcGVjaWZpY1xuXHQgKiBjb25maWcgdGFyZ2V0IHdoZXJlIHRoZSBrZXkgaXMgZGVmaW5lZC5cblx0ICovXG5cdHByaXZhdGUgX3JlbW92ZVBsdWdpblBhdGgoY29uZmlnS2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBpbnNwZWN0ZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PihDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5Mb2NhdGlvbnMpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0cyA9IFtcblx0XHRcdENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUixcblx0XHRcdENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFLFxuXHRcdFx0Q29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMLFxuXHRcdFx0Q29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSxcblx0XHRcdENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT04sXG5cdFx0XTtcblxuXHRcdGZvciAoY29uc3QgdGFyZ2V0IG9mIHRhcmdldHMpIHtcblx0XHRcdGNvbnN0IG1hcHBpbmcgPSBnZXRDb25maWdWYWx1ZUluVGFyZ2V0KGluc3BlY3RlZCwgdGFyZ2V0KTtcblx0XHRcdGlmIChtYXBwaW5nICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChtYXBwaW5nLCBjb25maWdLZXkpKSB7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZWQgPSB7IC4uLm1hcHBpbmcgfTtcblx0XHRcdFx0ZGVsZXRlIHVwZGF0ZWRbY29uZmlnS2V5XTtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoXG5cdFx0XHRcdFx0Q2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTG9jYXRpb25zLFxuXHRcdFx0XHRcdHVwZGF0ZWQsXG5cdFx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrZXRwbGFjZUFnZW50UGx1Z2luRGlzY292ZXJ5IGV4dGVuZHMgQWJzdHJhY3RBZ2VudFBsdWdpbkRpc2NvdmVyeSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlOiBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLFxuXHRcdEBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wbHVnaW5SZXBvc2l0b3J5U2VydmljZTogSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihmaWxlU2VydmljZSwgcGF0aFNlcnZpY2UsIGxvZ1NlcnZpY2UsIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBzdGFydChlbmFibGVtZW50TW9kZWw6IElFbmFibGVtZW50TW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl9lbmFibGVtZW50TW9kZWwgPSBlbmFibGVtZW50TW9kZWw7XG5cdFx0Y29uc3Qgc2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fcmVmcmVzaFBsdWdpbnMoKSwgMCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5pbnN0YWxsZWRQbHVnaW5zLnJlYWQocmVhZGVyKTtcblx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfZGlzY292ZXJQbHVnaW5Tb3VyY2VzKCk6IFByb21pc2U8cmVhZG9ubHkgSVBsdWdpblNvdXJjZVtdPiB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gdGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmluc3RhbGxlZFBsdWdpbnMuZ2V0KCk7XG5cdFx0Y29uc3Qgc291cmNlczogSVBsdWdpblNvdXJjZVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGluc3RhbGxlZCkge1xuXHRcdFx0bGV0IHN0YXQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShlbnRyeS5wbHVnaW5VcmkpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtNYXJrZXRwbGFjZUFnZW50UGx1Z2luRGlzY292ZXJ5XSBDb3VsZCBub3QgcmVzb2x2ZSBpbnN0YWxsZWQgcGx1Z2luOiAke2VudHJ5LnBsdWdpblVyaS50b1N0cmluZygpfWApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtNYXJrZXRwbGFjZUFnZW50UGx1Z2luRGlzY292ZXJ5XSBJbnN0YWxsZWQgcGx1Z2luIHBhdGggaXMgbm90IGEgZGlyZWN0b3J5OiAke2VudHJ5LnBsdWdpblVyaS50b1N0cmluZygpfWApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVwb3NpdG9yeVVyaSA9IHRoaXMuX3BsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmdldFJlcG9zaXRvcnlVcmkoZW50cnkucGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCBlbnRyeS5wbHVnaW4ubWFya2V0cGxhY2VUeXBlKTtcblxuXHRcdFx0c291cmNlcy5wdXNoKHtcblx0XHRcdFx0dXJpOiBzdGF0LnJlc291cmNlLFxuXHRcdFx0XHRmcm9tTWFya2V0cGxhY2U6IGVudHJ5LnBsdWdpbixcblx0XHRcdFx0cmVwb3NpdG9yeVVyaSxcblx0XHRcdFx0cmVtb3ZlOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fZW5hYmxlbWVudE1vZGVsLnJlbW92ZShzdGF0LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5yZW1vdmVJbnN0YWxsZWRQbHVnaW4oZW50cnkucGx1Z2luVXJpKTtcblxuXHRcdFx0XHRcdC8vIFBhc3MgcmVtYWluaW5nIGluc3RhbGxlZCBkZXNjcmlwdG9ycyBzbyB0aGUgcmVwb3NpdG9yeSBzZXJ2aWNlXG5cdFx0XHRcdFx0Ly8gY2FuIHNraXAgZGVsZXRpb24gd2hlbiBvdGhlciBwbHVnaW5zIHNoYXJlIHRoZSBzYW1lIGNhY2hlIGRpci5cblx0XHRcdFx0XHRjb25zdCByZW1haW5pbmcgPSB0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuaW5zdGFsbGVkUGx1Z2lucy5nZXQoKTtcblx0XHRcdFx0XHR0aGlzLl9wbHVnaW5SZXBvc2l0b3J5U2VydmljZS5jbGVhbnVwUGx1Z2luU291cmNlKFxuXHRcdFx0XHRcdFx0ZW50cnkucGx1Z2luLFxuXHRcdFx0XHRcdFx0cmVtYWluaW5nLm1hcChlID0+IGUucGx1Z2luLnNvdXJjZURlc2NyaXB0b3IpLFxuXHRcdFx0XHRcdCkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW01hcmtldHBsYWNlQWdlbnRQbHVnaW5EaXNjb3ZlcnldIEZhaWxlZCB0byBjbGVhbiB1cCBwbHVnaW4gc291cmNlJywgZXJyb3IpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNvdXJjZXM7XG5cdH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBDb3BpbG90IENMSSBwbHVnaW4gZGlzY292ZXJ5XG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBEaXJlY3RvcnkgdW5kZXIgdGhlIENvcGlsb3QgQ0xJIGhvbWUgd2hlcmUgaW5zdGFsbGVkIHBsdWdpbnMgYXJlIGNhY2hlZC5cbiAqIExheW91dCBpcyB0d28gbGV2ZWxzIGRlZXA6IGA8bWFya2V0cGxhY2U+LzxwbHVnaW4+L2AuIERpcmVjdCAobm9uLW1hcmtldHBsYWNlKVxuICogaW5zdGFsbHMgdXNlIHRoZSByZXNlcnZlZCBtYXJrZXRwbGFjZSBzZWdtZW50IGBfZGlyZWN0YC5cbiAqXG4gKiBTZWUgYHNyYy9wbHVnaW5zL21hbmFnZXIudHNgIGluIHRoZSBjb3BpbG90LWFnZW50LXJ1bnRpbWUgcmVwby5cbiAqL1xuY29uc3QgQ09QSUxPVF9DTElfSU5TVEFMTEVEX1BMVUdJTlNfRElSID0gJy5jb3BpbG90L2luc3RhbGxlZC1wbHVnaW5zJztcblxuLyoqXG4gKiBEaXNjb3ZlcnMgcGx1Z2lucyBpbnN0YWxsZWQgYnkgdGhlIENvcGlsb3QgQ0xJIHVuZGVyXG4gKiBgfi8uY29waWxvdC9pbnN0YWxsZWQtcGx1Z2lucy88bWFya2V0cGxhY2U+LzxwbHVnaW4+L2AuIEVhY2ggbGVhZiBkaXJlY3RvcnlcbiAqIGlzIHRyZWF0ZWQgYXMgYSBwbHVnaW4gcm9vdCwgYWxsb3dpbmcgQ0xJLWluc3RhbGxlZCBwbHVnaW5zIChib3RoXG4gKiBtYXJrZXRwbGFjZSBhbmQgZGlyZWN0KSB0byBzdXJmYWNlIGluIFZTIENvZGUgd2l0aG91dCBhIHNlcGFyYXRlIGluc3RhbGwuXG4gKi9cbmV4cG9ydCBjbGFzcyBDb3BpbG90Q2xpQWdlbnRQbHVnaW5EaXNjb3ZlcnkgZXh0ZW5kcyBBYnN0cmFjdEFnZW50UGx1Z2luRGlzY292ZXJ5IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihmaWxlU2VydmljZSwgcGF0aFNlcnZpY2UsIGxvZ1NlcnZpY2UsIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBzdGFydChlbmFibGVtZW50TW9kZWw6IElFbmFibGVtZW50TW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl9lbmFibGVtZW50TW9kZWwgPSBlbmFibGVtZW50TW9kZWw7XG5cdFx0Y29uc3Qgc2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fcmVmcmVzaFBsdWdpbnMoKSwgMCkpO1xuXG5cdFx0Y29uc3Qgd2F0Y2hlclN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBzZXR1cFdhdGNoZXJzID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0d2F0Y2hlclN0b3JlLmNsZWFyKCk7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJvb3QgPSBhd2FpdCB0aGlzLl9nZXRJbnN0YWxsZWRQbHVnaW5zRGlyKCk7XG5cblx0XHRcdC8vIFdhbGsgdXAgdG8gdGhlIGRlZXBlc3QgZXhpc3RpbmcgYW5jZXN0b3IgYW5kIHdhdGNoIGVhY2ggZGlyZWN0b3J5XG5cdFx0XHQvLyBmcm9tIHRoZXJlIGRvd24uIE5vbi1yZWN1cnNpdmUgd2F0Y2hlcnMgZmFpbCBpZiB0aGUgdGFyZ2V0IGRvZXNuJ3Rcblx0XHRcdC8vIGV4aXN0LCBzbyB3ZSBuZWVkIHRvIHdhdGNoIGFuIGV4aXN0aW5nIHBhcmVudCAoZS5nLiB+Ly5jb3BpbG90IG9yXG5cdFx0XHQvLyB1c2VySG9tZSkgdG8gZGV0ZWN0IHRoZSBmaXJzdC1ldmVyIHBsdWdpbiBpbnN0YWxsLlxuXHRcdFx0Y29uc3QgZGlyc1RvV2F0Y2g6IFVSSVtdID0gW107XG5cdFx0XHRsZXQgY2FuZGlkYXRlOiBVUkkgfCB1bmRlZmluZWQgPSByb290O1xuXHRcdFx0d2hpbGUgKGNhbmRpZGF0ZSkge1xuXHRcdFx0XHRkaXJzVG9XYXRjaC51bnNoaWZ0KGNhbmRpZGF0ZSk7XG5cdFx0XHRcdGNvbnN0IHBhcmVudCA9IGpvaW5QYXRoKGNhbmRpZGF0ZSwgJy4uJyk7XG5cdFx0XHRcdGlmIChwYXJlbnQudG9TdHJpbmcoKSA9PT0gY2FuZGlkYXRlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5fcGF0aEV4aXN0cyhwYXJlbnQpKSB7XG5cdFx0XHRcdFx0ZGlyc1RvV2F0Y2gudW5zaGlmdChwYXJlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhbmRpZGF0ZSA9IHBhcmVudDtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBkaXIgb2YgZGlyc1RvV2F0Y2gpIHtcblx0XHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5fcGF0aEV4aXN0cyhkaXIpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHdhdGNoZXIgPSB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVXYXRjaGVyKGRpciwgeyByZWN1cnNpdmU6IGZhbHNlLCBleGNsdWRlczogW10gfSk7XG5cdFx0XHRcdHdhdGNoZXJTdG9yZS5hZGQod2F0Y2hlcik7XG5cdFx0XHRcdHdhdGNoZXJTdG9yZS5hZGQod2F0Y2hlci5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHRcdFx0Ly8gUmUtYXR0YWNoIHdhdGNoZXJzIGluIGNhc2UgZGlyZWN0b3JpZXMgYXBwZWFyZWQvZGlzYXBwZWFyZWQuXG5cdFx0XHRcdFx0c2V0dXBXYXRjaGVycygpLmNhdGNoKCgpID0+IHsgLyogd2F0Y2hlcnMgYXJlIGJlc3QtZWZmb3J0ICovIH0pO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdhdGNoIGVhY2ggbWFya2V0cGxhY2UgYnVja2V0IG5vbi1yZWN1cnNpdmVseSBmb3IgcGx1Z2luXG5cdFx0XHQvLyBpbnN0YWxsL3VuaW5zdGFsbCBldmVudHMuXG5cdFx0XHRsZXQgcm9vdFN0YXQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyb290U3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUocm9vdCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFyb290U3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IG1hcmtldHBsYWNlRGlyIG9mIHJvb3RTdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGlmICghbWFya2V0cGxhY2VEaXIuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB3YXRjaGVyID0gdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlV2F0Y2hlcihtYXJrZXRwbGFjZURpci5yZXNvdXJjZSwgeyByZWN1cnNpdmU6IGZhbHNlLCBleGNsdWRlczogW10gfSk7XG5cdFx0XHRcdHdhdGNoZXJTdG9yZS5hZGQod2F0Y2hlcik7XG5cdFx0XHRcdHdhdGNoZXJTdG9yZS5hZGQod2F0Y2hlci5vbkRpZENoYW5nZSgoKSA9PiBzY2hlZHVsZXIuc2NoZWR1bGUoKSkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRzZXR1cFdhdGNoZXJzKCkuY2F0Y2goKCkgPT4geyAvKiB3YXRjaGVycyBhcmUgYmVzdC1lZmZvcnQgKi8gfSk7XG5cdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRJbnN0YWxsZWRQbHVnaW5zRGlyKCk6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSBhd2FpdCB0aGlzLl9wYXRoU2VydmljZS51c2VySG9tZSgpO1xuXHRcdHJldHVybiBqb2luUGF0aCh1c2VySG9tZSwgQ09QSUxPVF9DTElfSU5TVEFMTEVEX1BMVUdJTlNfRElSKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfZGlzY292ZXJQbHVnaW5Tb3VyY2VzKCk6IFByb21pc2U8cmVhZG9ubHkgSVBsdWdpblNvdXJjZVtdPiB7XG5cdFx0Y29uc3Qgcm9vdCA9IGF3YWl0IHRoaXMuX2dldEluc3RhbGxlZFBsdWdpbnNEaXIoKTtcblxuXHRcdGxldCByb290U3RhdDtcblx0XHR0cnkge1xuXHRcdFx0cm9vdFN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZXNvbHZlKHJvb3QpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gRGlyZWN0b3J5IGRvZXNuJ3QgZXhpc3QgXHUyMDE0IENvcGlsb3QgQ0xJIGhhc24ndCBpbnN0YWxsZWQgYW55IHBsdWdpbnMuXG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0aWYgKCFyb290U3RhdC5pc0RpcmVjdG9yeSB8fCAhcm9vdFN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBzb3VyY2VzOiBJUGx1Z2luU291cmNlW10gPSBbXTtcblx0XHQvLyBFYWNoIGltbWVkaWF0ZSBjaGlsZCBpcyBhIG1hcmtldHBsYWNlIGJ1Y2tldCAoZS5nLiBgX2RpcmVjdGAsXG5cdFx0Ly8gYDxtYXJrZXRwbGFjZS1uYW1lPmApOyBlYWNoIGdyYW5kY2hpbGQgaXMgYSBwbHVnaW4gcm9vdC5cblx0XHRmb3IgKGNvbnN0IG1hcmtldHBsYWNlRGlyIG9mIHJvb3RTdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoIW1hcmtldHBsYWNlRGlyLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgbWFya2V0cGxhY2VTdGF0O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bWFya2V0cGxhY2VTdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShtYXJrZXRwbGFjZURpci5yZXNvdXJjZSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghbWFya2V0cGxhY2VTdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHBsdWdpbkRpciBvZiBtYXJrZXRwbGFjZVN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0aWYgKCFwbHVnaW5EaXIuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzb3VyY2VzLnB1c2goe1xuXHRcdFx0XHRcdHVyaTogcGx1Z2luRGlyLnJlc291cmNlLFxuXHRcdFx0XHRcdGZyb21NYXJrZXRwbGFjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJlbW92ZTogKCkgPT4gdGhpcy5fcHJvbXB0UmVtb3ZlKHBsdWdpbkRpci5yZXNvdXJjZSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBzb3VyY2VzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcHJvbXB0UmVtb3ZlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb3BpbG90Q2xpUGx1Z2luLnJlbW92ZS5jb25maXJtJywgXCJUaGlzIHBsdWdpbiB3YXMgaW5zdGFsbGVkIGJ5IHRoZSBDb3BpbG90IENMSS4gUmVtb3ZlIGl0IGZyb20gZGlzaz9cIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjb3BpbG90Q2xpUGx1Z2luLnJlbW92ZS5kZXRhaWwnLCBcIlRoZSBwbHVnaW4gZGlyZWN0b3J5ICd7MH0nIHdpbGwgYmUgbW92ZWQgdG8gdGhlIHRyYXNoLiBZb3UgY2FuIHJlaW5zdGFsbCBpdCBsYXRlciB2aWEgdGhlIENvcGlsb3QgQ0xJLlwiLCByZXNvdXJjZS5mc1BhdGgpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2NvcGlsb3RDbGlQbHVnaW4ucmVtb3ZlLnByaW1hcnknLCBcIlJlbW92ZVwiKSxcblx0XHR9KTtcblx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5kZWwocmVzb3VyY2UsIHsgcmVjdXJzaXZlOiB0cnVlLCB1c2VUcmFzaDogdHJ1ZSB9KTtcblx0XHRcdHRoaXMuX2VuYWJsZW1lbnRNb2RlbC5yZW1vdmUocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tDb3BpbG90Q2xpQWdlbnRQbHVnaW5EaXNjb3ZlcnldIEZhaWxlZCB0byByZW1vdmUgcGx1Z2luJywgZXJyb3IpO1xuXHRcdH1cblx0fVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEV4dGVuc2lvbi1jb250cmlidXRlZCBwbHVnaW4gZGlzY292ZXJ5XG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuaW50ZXJmYWNlIElSYXdDaGF0UGx1Z2luQ29udHJpYnV0aW9uIHtcblx0cmVhZG9ubHkgcGF0aDogc3RyaW5nO1xuXHRyZWFkb25seSB3aGVuPzogc3RyaW5nO1xufVxuXG5jb25zdCBlcFBsdWdpbnMgPSBleHRlbnNpb25zUmVnaXN0cnkuRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SVJhd0NoYXRQbHVnaW5Db250cmlidXRpb25bXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ2NoYXRQbHVnaW5zJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFBsdWdpbnMuc2NoZW1hLmRlc2NyaXB0aW9uJywgJ0NvbnRyaWJ1dGVzIGFnZW50IHBsdWdpbnMgZm9yIGNoYXQuJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczoge1xuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7XG5cdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRwYXRoOiAnLi9yZWxhdGl2ZS9wYXRoL3RvL3BsdWdpbi8nLFxuXHRcdFx0XHR9XG5cdFx0XHR9XSxcblx0XHRcdHJlcXVpcmVkOiBbJ3BhdGgnXSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFBsdWdpbnMucHJvcGVydHkucGF0aCcsICdQYXRoIHRvIHRoZSBhZ2VudCBwbHVnaW4gcm9vdCBkaXJlY3RvcnkgcmVsYXRpdmUgdG8gdGhlIGV4dGVuc2lvbiByb290LicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdoZW46IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRQbHVnaW5zLnByb3BlcnR5LndoZW4nLCAnKE9wdGlvbmFsKSBBIGNvbmRpdGlvbiB3aGljaCBtdXN0IGJlIHRydWUgdG8gZW5hYmxlIHRoaXMgcGx1Z2luLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uQWdlbnRQbHVnaW5EaXNjb3ZlcnkgZXh0ZW5kcyBBYnN0cmFjdEFnZW50UGx1Z2luRGlzY292ZXJ5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25QbHVnaW5zID0gbmV3IE1hcDxzdHJpbmcsIHsgdXJpOiBVUkk7IHdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkOyBleHRlbnNpb25JZDogc3RyaW5nIH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3doZW5LZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihmaWxlU2VydmljZSwgcGF0aFNlcnZpY2UsIGxvZ1NlcnZpY2UsIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBzdGFydChlbmFibGVtZW50TW9kZWw6IElFbmFibGVtZW50TW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl9lbmFibGVtZW50TW9kZWwgPSBlbmFibGVtZW50TW9kZWw7XG5cdFx0Y29uc3Qgc2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fcmVmcmVzaFBsdWdpbnMoKSwgMCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKHRoaXMuX3doZW5LZXlzKSkge1xuXHRcdFx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZXBQbHVnaW5zLnNldEhhbmRsZXIoKF9leHRlbnNpb25zLCBkZWx0YSkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBleHQgb2YgZGVsdGEuYWRkZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCByYXcgb2YgZXh0LnZhbHVlKSB7XG5cdFx0XHRcdFx0aWYgKCFyYXcucGF0aCkge1xuXHRcdFx0XHRcdFx0ZXh0LmNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnZXh0ZW5zaW9uLnBsdWdpbi5taXNzaW5nLnBhdGgnLCBcIkV4dGVuc2lvbiAnezB9JyBjYW5ub3QgcmVnaXN0ZXIgYSBjaGF0UGx1Z2lucyBlbnRyeSB3aXRob3V0IGEgcGF0aC5cIiwgZXh0LmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUpKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBwbHVnaW5VcmkgPSBqb2luUGF0aChleHQuZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIHJhdy5wYXRoKTtcblx0XHRcdFx0XHRpZiAoIWlzRXF1YWxPclBhcmVudChwbHVnaW5VcmksIGV4dC5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbikpIHtcblx0XHRcdFx0XHRcdGV4dC5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ2V4dGVuc2lvbi5wbHVnaW4uaW52YWxpZC5wYXRoJywgXCJFeHRlbnNpb24gJ3swfScgY2hhdFBsdWdpbnMgZW50cnkgJ3sxfScgcmVzb2x2ZXMgb3V0c2lkZSB0aGUgZXh0ZW5zaW9uLlwiLCBleHQuZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSwgcmF3LnBhdGgpKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsZXQgd2hlbkV4cHI6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChyYXcud2hlbikge1xuXHRcdFx0XHRcdFx0d2hlbkV4cHIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShyYXcud2hlbik7XG5cdFx0XHRcdFx0XHRpZiAoIXdoZW5FeHByKSB7XG5cdFx0XHRcdFx0XHRcdGV4dC5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ2V4dGVuc2lvbi5wbHVnaW4uaW52YWxpZC53aGVuJywgXCJFeHRlbnNpb24gJ3swfScgY2hhdFBsdWdpbnMgZW50cnkgJ3sxfScgaGFzIGFuIGludmFsaWQgd2hlbiBjbGF1c2U6ICd7Mn0nLlwiLCBleHQuZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSwgcmF3LnBhdGgsIHJhdy53aGVuKSk7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9leHRlbnNpb25QbHVnaW5zLnNldChleHRlbnNpb25QbHVnaW5LZXkoZXh0LmRlc2NyaXB0aW9uLmlkZW50aWZpZXIsIHJhdy5wYXRoKSwgeyB1cmk6IHBsdWdpblVyaSwgd2hlbjogd2hlbkV4cHIsIGV4dGVuc2lvbklkOiBleHQuZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBleHQgb2YgZGVsdGEucmVtb3ZlZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJhdyBvZiBleHQudmFsdWUpIHtcblx0XHRcdFx0XHR0aGlzLl9leHRlbnNpb25QbHVnaW5zLmRlbGV0ZShleHRlbnNpb25QbHVnaW5LZXkoZXh0LmRlc2NyaXB0aW9uLmlkZW50aWZpZXIsIHJhdy5wYXRoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlYnVpbGRXaGVuS2V5cygpO1xuXHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fSk7XG5cblx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlYnVpbGRXaGVuS2V5cygpOiB2b2lkIHtcblx0XHR0aGlzLl93aGVuS2V5cy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgeyB3aGVuIH0gb2YgdGhpcy5fZXh0ZW5zaW9uUGx1Z2lucy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHdoZW4pIHtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2Ygd2hlbi5rZXlzKCkpIHtcblx0XHRcdFx0XHR0aGlzLl93aGVuS2V5cy5hZGQoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfZGlzY292ZXJQbHVnaW5Tb3VyY2VzKCk6IFByb21pc2U8cmVhZG9ubHkgSVBsdWdpblNvdXJjZVtdPiB7XG5cdFx0Y29uc3Qgc291cmNlczogSVBsdWdpblNvdXJjZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbLCBlbnRyeV0gb2YgdGhpcy5fZXh0ZW5zaW9uUGx1Z2lucykge1xuXHRcdFx0aWYgKGVudHJ5LndoZW4gJiYgIXRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoZW50cnkud2hlbikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRsZXQgc3RhdDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZXNvbHZlKGVudHJ5LnVyaSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW0V4dGVuc2lvbkFnZW50UGx1Z2luRGlzY292ZXJ5XSBDb3VsZCBub3QgcmVzb2x2ZSBleHRlbnNpb24gcGx1Z2luIHBhdGg6ICR7ZW50cnkudXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtFeHRlbnNpb25BZ2VudFBsdWdpbkRpc2NvdmVyeV0gRXh0ZW5zaW9uIHBsdWdpbiBwYXRoIGlzIG5vdCBhIGRpcmVjdG9yeTogJHtlbnRyeS51cmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRzb3VyY2VzLnB1c2goe1xuXHRcdFx0XHR1cmk6IHN0YXQucmVzb3VyY2UsXG5cdFx0XHRcdGZyb21NYXJrZXRwbGFjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZW1vdmU6ICgpID0+IHRoaXMuX3Byb21wdFVuaW5zdGFsbEV4dGVuc2lvbihlbnRyeS5leHRlbnNpb25JZCksXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHNvdXJjZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wcm9tcHRVbmluc3RhbGxFeHRlbnNpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3VuaW5zdGFsbEV4dGVuc2lvbkZvclBsdWdpbicsIFwiVGhpcyBwbHVnaW4gaXMgcHJvdmlkZWQgYnkgdGhlIGV4dGVuc2lvbiAnezB9Jy4gRG8geW91IHdhbnQgdG8gdW5pbnN0YWxsIHRoZSBleHRlbnNpb24/XCIsIGV4dGVuc2lvbklkKSxcblx0XHR9KTtcblx0XHRpZiAoY29uZmlybWVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmV4dGVuc2lvbnMudW5pbnN0YWxsRXh0ZW5zaW9uJywgZXh0ZW5zaW9uSWQpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBleHRlbnNpb25QbHVnaW5LZXkoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgJHtleHRlbnNpb25JZC52YWx1ZX0vJHtwYXRofWA7XG59XG5cbmNsYXNzIENoYXRQbHVnaW5zRGF0YVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciB7XG5cdHJlYWRvbmx5IHR5cGUgPSAndGFibGUnIGFzIGNvbnN0O1xuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/LmNoYXRQbHVnaW5zPy5sZW5ndGg7XG5cdH1cblxuXHRyZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElSZW5kZXJlZERhdGE8SVRhYmxlRGF0YT4ge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbnMgPSBtYW5pZmVzdC5jb250cmlidXRlcz8uY2hhdFBsdWdpbnMgPz8gW107XG5cdFx0aWYgKCFjb250cmlidXRpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBoZWFkZXJzOiBbXSwgcm93czogW10gfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtcblx0XHRcdGxvY2FsaXplKCdjaGF0UGx1Z2luc1BhdGgnLCBcIlBhdGhcIiksXG5cdFx0XHRsb2NhbGl6ZSgnY2hhdFBsdWdpbnNXaGVuJywgXCJXaGVuXCIpLFxuXHRcdF07XG5cblx0XHRjb25zdCByb3dzOiBJUm93RGF0YVtdW10gPSBjb250cmlidXRpb25zLm1hcChkID0+IFtcblx0XHRcdGQucGF0aCxcblx0XHRcdGQud2hlbiA/PyAnLScsXG5cdFx0XSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YTogeyBoZWFkZXJzLCByb3dzIH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHR9O1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLnJlZ2lzdGVyRXh0ZW5zaW9uRmVhdHVyZSh7XG5cdGlkOiAnY2hhdFBsdWdpbnMnLFxuXHRsYWJlbDogbG9jYWxpemUoJ2NoYXRQbHVnaW5zJywgXCJDaGF0IFBsdWdpbnNcIiksXG5cdGFjY2Vzczoge1xuXHRcdGNhblRvZ2dsZTogZmFsc2Vcblx0fSxcblx0cmVuZGVyZXI6IG5ldyBTeW5jRGVzY3JpcHRvcihDaGF0UGx1Z2luc0RhdGFSZW5kZXJlciksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxhQUFhO0FBQ3RCLFNB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
