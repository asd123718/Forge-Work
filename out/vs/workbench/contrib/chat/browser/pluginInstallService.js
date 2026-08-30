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
import { Action } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { untildify } from "../../../../base/common/labels.js";
import { posix, win32 } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { IAgentPluginRepositoryService } from "../common/plugins/agentPluginRepositoryService.js";
import { ChatConfiguration } from "../common/constants.js";
import { IPluginMarketplaceService, MarketplaceReferenceKind, MarketplaceType, hasSourceChanged, parseMarketplaceReference, parseMarketplaceReferences, PluginSourceKind, readConfiguredMarketplaces } from "../common/plugins/pluginMarketplaceService.js";
let PluginInstallService = class {
  constructor(_pluginRepositoryService, _pluginMarketplaceService, _fileService, _notificationService, _dialogService, _logService, _progressService, _commandService, _quickInputService, _configurationService, _pathService) {
    this._pluginRepositoryService = _pluginRepositoryService;
    this._pluginMarketplaceService = _pluginMarketplaceService;
    this._fileService = _fileService;
    this._notificationService = _notificationService;
    this._dialogService = _dialogService;
    this._logService = _logService;
    this._progressService = _progressService;
    this._commandService = _commandService;
    this._quickInputService = _quickInputService;
    this._configurationService = _configurationService;
    this._pathService = _pathService;
  }
  async installPlugin(plugin) {
    if (!await this._ensureMarketplaceTrusted(plugin)) {
      throw new CancellationError();
    }
    const kind = plugin.sourceDescriptor.kind;
    if (kind === PluginSourceKind.RelativePath) {
      return this._installRelativePathPlugin(plugin);
    }
    if (kind === PluginSourceKind.Npm || kind === PluginSourceKind.Pip) {
      await this._installPackagePlugin(plugin);
      return;
    }
    return this._installGitPlugin(plugin);
  }
  validatePluginSource(source) {
    const reference = parseMarketplaceReference(source);
    if (reference || this._isLocalPathSource(source)) {
      return void 0;
    }
    return localize("invalidSource", "'{0}' is not a valid plugin source. Enter a GitHub repository (owner/repo), a git clone URL, or a local folder path.", source);
  }
  async installPluginFromSource(source, options) {
    const reference = parseMarketplaceReference(source);
    if (reference && reference.kind !== MarketplaceReferenceKind.LocalFileUri) {
      return this._doInstallFromSource(reference, options);
    }
    const local = await this._resolveLocalDirectorySource(source);
    if (local) {
      return this._doInstallFromLocalSource(local.reference, local.configPath, options);
    }
    return {
      success: false,
      message: localize("invalidSource", "'{0}' is not a valid plugin source. Enter a GitHub repository (owner/repo), a git clone URL, or a local folder path.", source)
    };
  }
  async _doInstallFromSource(reference, options) {
    const sourceDescriptor = reference.kind === MarketplaceReferenceKind.GitHubShorthand ? { kind: PluginSourceKind.GitHub, repo: reference.githubRepo } : { kind: PluginSourceKind.GitUrl, url: reference.cloneUrl };
    const tempPlugin = {
      name: reference.displayLabel,
      description: "",
      version: "",
      source: "",
      sourceDescriptor,
      marketplace: reference.displayLabel,
      marketplaceReference: reference,
      marketplaceType: MarketplaceType.OpenPlugin
    };
    if (!await this._ensureMarketplaceTrusted(tempPlugin)) {
      return { success: false };
    }
    let repoDir;
    try {
      repoDir = await this._pluginRepositoryService.ensurePluginSource(tempPlugin, {
        progressTitle: localize("cloningSource", "Cloning plugin source '{0}'...", reference.displayLabel),
        failureLabel: reference.displayLabel,
        marketplaceType: MarketplaceType.OpenPlugin
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        message: localize("cloneFailedDetail", "Failed to clone plugin source '{0}': {1}", reference.displayLabel, detail)
      };
    }
    const repoExists = await this._fileService.exists(repoDir);
    if (!repoExists) {
      return {
        success: false,
        message: localize("cloneFailed", "Failed to clone plugin source '{0}'.", reference.displayLabel)
      };
    }
    const discoveredPlugins = await this._pluginMarketplaceService.readPluginsFromDirectory(repoDir, reference);
    if (discoveredPlugins.length === 0) {
      const singlePlugin = await this._pluginMarketplaceService.readSinglePluginManifest(repoDir, reference);
      if (singlePlugin) {
        if (options?.plugin && options.plugin !== singlePlugin.name) {
          return {
            success: false,
            message: localize("pluginNotFound", "Plugin '{0}' not found in '{1}'.", options.plugin, reference.displayLabel)
          };
        }
        await this.installPlugin(singlePlugin);
        return options?.plugin ? { success: true, matchedPlugin: singlePlugin } : { success: true };
      }
      void this._pluginRepositoryService.cleanupPluginSource(tempPlugin);
      return {
        success: false,
        message: localize("noPluginsFound", "No plugins found in '{0}'. This does not appear to be a valid plugin marketplace.", reference.displayLabel)
      };
    }
    return this._installDiscoveredPlugins(reference, discoveredPlugins, options);
  }
  /**
   * Installs a plugin from a local folder path (`file://` URI, absolute path,
   * or `~`-prefixed path). Inspects the directory to decide whether it is a
   * marketplace or a standalone plugin and writes to the appropriate setting:
   * - a marketplace is registered under `chat.plugins.marketplaces`,
   * - a standalone plugin path is registered under `chat.pluginLocations`.
   */
  async _doInstallFromLocalSource(reference, configPath, options) {
    const repoDir = reference.localRepositoryUri;
    if (!repoDir) {
      return {
        success: false,
        message: localize("invalidSource", "'{0}' is not a valid plugin source. Enter a GitHub repository (owner/repo), a git clone URL, or a local folder path.", reference.rawValue)
      };
    }
    let isDirectory = false;
    try {
      isDirectory = (await this._fileService.resolve(repoDir)).isDirectory;
    } catch {
    }
    if (!isDirectory) {
      return {
        success: false,
        message: localize("localSourceNotFound", "The folder '{0}' does not exist or is not a directory.", repoDir.fsPath)
      };
    }
    const discoveredPlugins = await this._pluginMarketplaceService.readPluginsFromDirectory(repoDir, reference);
    if (discoveredPlugins.length > 0) {
      const tempPlugin = {
        name: reference.displayLabel,
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "" },
        marketplace: reference.displayLabel,
        marketplaceReference: reference,
        marketplaceType: MarketplaceType.OpenPlugin
      };
      if (!await this._ensureMarketplaceTrusted(tempPlugin)) {
        return { success: false };
      }
      return this._installDiscoveredPlugins(reference, discoveredPlugins, options);
    }
    if (await this._pluginMarketplaceService.isPluginDirectory(repoDir)) {
      await this._addPluginLocationToConfig(configPath);
      return { success: true };
    }
    return {
      success: false,
      message: localize("localNoPlugins", "No plugin or marketplace found in '{0}'. This folder does not contain a plugin or marketplace manifest.", repoDir.fsPath)
    };
  }
  /**
   * Registers the marketplace and installs the discovered plugin(s): when a
   * specific plugin is targeted it installs that one, when there is exactly
   * one it installs it directly, and otherwise prompts the user to choose.
   */
  async _installDiscoveredPlugins(reference, discoveredPlugins, options) {
    if (options?.plugin) {
      const matchedPlugin = discoveredPlugins.find((p) => p.name === options.plugin);
      if (!matchedPlugin) {
        return {
          success: false,
          message: localize("pluginNotFound", "Plugin '{0}' not found in '{1}'.", options.plugin, reference.displayLabel)
        };
      }
      await this._addMarketplaceToConfig(reference);
      await this.installPlugin(matchedPlugin);
      return { success: true, matchedPlugin };
    }
    if (discoveredPlugins.length === 1) {
      await this._addMarketplaceToConfig(reference);
      await this.installPlugin(discoveredPlugins[0]);
      return { success: true };
    }
    const picks = discoveredPlugins.map((p) => ({
      label: p.name,
      description: p.description,
      plugin: p
    }));
    const selected = await this._quickInputService.pick(picks, {
      placeHolder: localize("selectPlugin", "Select a plugin to install from '{0}'", reference.displayLabel),
      canPickMany: false
    });
    if (!selected) {
      return { success: false };
    }
    await this._addMarketplaceToConfig(reference);
    await this.installPlugin(selected.plugin);
    return { success: true };
  }
  _addMarketplaceToConfig(reference) {
    const { userValues, effectiveValues } = readConfiguredMarketplaces(this._configurationService);
    const existingRefs = parseMarketplaceReferences(effectiveValues);
    if (existingRefs.some((r) => r.canonicalId === reference.canonicalId)) {
      return;
    }
    return this._configurationService.updateValue(ChatConfiguration.PluginMarketplaces, [...userValues, reference.rawValue]);
  }
  _addPluginLocationToConfig(pathKey) {
    const current = this._configurationService.inspect(ChatConfiguration.PluginLocations).userValue ?? {};
    if (current[pathKey] === true) {
      return;
    }
    return this._configurationService.updateValue(ChatConfiguration.PluginLocations, { ...current, [pathKey]: true });
  }
  /**
   * Returns `true` when the source string looks like a local folder path —
   * a `file://` URI, an absolute filesystem path, or a `~`-prefixed path.
   * This is a synchronous format check only; existence is verified later.
   */
  _isLocalPathSource(source) {
    const trimmed = source.trim();
    if (!trimmed) {
      return false;
    }
    if (/^file:\/\//i.test(trimmed)) {
      return true;
    }
    if (trimmed === "~" || trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
      return true;
    }
    return win32.isAbsolute(trimmed) || posix.isAbsolute(trimmed);
  }
  /**
   * Resolves a local folder source string to a {@link MarketplaceReferenceKind.LocalFileUri}
   * reference plus the path to persist in `chat.pluginLocations`. Tilde paths
   * are expanded against the user home. Returns `undefined` when the string
   * does not resolve to an absolute local folder.
   */
  async _resolveLocalDirectorySource(source) {
    const trimmed = source.trim();
    const parsed = parseMarketplaceReference(trimmed);
    if (parsed?.kind === MarketplaceReferenceKind.LocalFileUri && parsed.localRepositoryUri) {
      return { reference: parsed, configPath: parsed.localRepositoryUri.fsPath };
    }
    if (!this._isLocalPathSource(trimmed)) {
      return void 0;
    }
    let resolvedPath = trimmed;
    if (resolvedPath.startsWith("~")) {
      const userHome = await this._pathService.userHome();
      const home = userHome.scheme === "file" ? userHome.fsPath : userHome.path;
      resolvedPath = untildify(resolvedPath, home);
    }
    if (!win32.isAbsolute(resolvedPath) && !posix.isAbsolute(resolvedPath)) {
      return void 0;
    }
    const reference = parseMarketplaceReference(URI.file(resolvedPath).toString());
    if (reference?.kind !== MarketplaceReferenceKind.LocalFileUri) {
      return void 0;
    }
    return { reference, configPath: trimmed };
  }
  async updatePlugin(plugin, silent) {
    if (this._pluginMarketplaceService.isStrictMarketplacePolicyActive() && !this._pluginMarketplaceService.isMarketplaceTrusted(plugin.marketplaceReference)) {
      this._notificationService.notify({
        severity: Severity.Warning,
        message: localize("strictMarketplaceBlockedUpdate", "Updates from '{0}' are blocked by your organization's policy.", plugin.marketplaceReference.displayLabel)
      });
      return false;
    }
    const kind = plugin.sourceDescriptor.kind;
    if (kind === PluginSourceKind.Npm || kind === PluginSourceKind.Pip) {
      return this._installPackagePlugin(plugin, silent);
    }
    return this._pluginRepositoryService.updatePluginSource(plugin, {
      pluginName: plugin.name,
      failureLabel: plugin.name,
      marketplaceType: plugin.marketplaceType
    });
  }
  async updateAllPlugins(options, token) {
    const allInstalled = this._pluginMarketplaceService.installedPlugins.get();
    const installed = allInstalled.filter(
      (entry) => (!options.marketplaceIds || options.marketplaceIds.has(entry.plugin.marketplaceReference.canonicalId)) && (!options.automatic || this._pluginMarketplaceService.isMarketplaceAutoUpdateEnabled(entry.plugin.marketplaceReference))
    );
    if (installed.length === 0) {
      return { updatedNames: [], failedNames: [] };
    }
    const updatedNames = [];
    const failedNames = [];
    const doUpdate = async () => {
      const gitTasks = [];
      const packagePlugins = [];
      const seenMarketplaces = /* @__PURE__ */ new Set();
      for (const entry of installed) {
        const ref = entry.plugin.marketplaceReference;
        if (seenMarketplaces.has(ref.canonicalId)) {
          continue;
        }
        seenMarketplaces.add(ref.canonicalId);
        if (this._pluginMarketplaceService.isStrictMarketplacePolicyActive() && !this._pluginMarketplaceService.isMarketplaceTrusted(ref)) {
          failedNames.push(ref.displayLabel);
          continue;
        }
        gitTasks.push((async () => {
          if (token.isCancellationRequested) {
            return;
          }
          try {
            const changed = await this._pluginRepositoryService.pullRepository(ref, {
              pluginName: ref.displayLabel,
              failureLabel: ref.displayLabel,
              marketplaceType: entry.plugin.marketplaceType,
              silent: options.silent
            });
            if (changed) {
              updatedNames.push(ref.displayLabel);
            }
          } catch (err) {
            this._logService.error(`[PluginInstallService] Failed to pull marketplace '${ref.displayLabel}':`, err);
            failedNames.push(ref.displayLabel);
          }
        })());
      }
      await Promise.all(gitTasks);
      const marketplaceIds = new Set(installed.map((entry) => entry.plugin.marketplaceReference.canonicalId));
      const marketplacePlugins = await this._pluginMarketplaceService.fetchMarketplacePlugins(token, marketplaceIds);
      const marketplaceByKey = /* @__PURE__ */ new Map();
      for (const mp of marketplacePlugins) {
        marketplaceByKey.set(`${mp.marketplaceReference.canonicalId}::${mp.name}`, mp);
      }
      const independentGitTasks = [];
      for (const entry of installed) {
        if (entry.plugin.sourceDescriptor.kind === PluginSourceKind.RelativePath) {
          continue;
        }
        const livePlugin = marketplaceByKey.get(`${entry.plugin.marketplaceReference.canonicalId}::${entry.plugin.name}`);
        if (!livePlugin || !hasSourceChanged(entry.plugin.sourceDescriptor, livePlugin.sourceDescriptor)) {
          continue;
        }
        const desc = livePlugin.sourceDescriptor;
        if (desc.kind === PluginSourceKind.Npm || desc.kind === PluginSourceKind.Pip) {
          if (!options.force && !desc.version) {
            continue;
          }
          packagePlugins.push({ installed: entry.plugin, marketplace: livePlugin });
          continue;
        }
        independentGitTasks.push((async () => {
          if (token.isCancellationRequested) {
            return;
          }
          try {
            const changed = await this._pluginRepositoryService.updatePluginSource(livePlugin, {
              pluginName: livePlugin.name,
              failureLabel: livePlugin.name,
              marketplaceType: livePlugin.marketplaceType,
              silent: options.silent
            });
            if (changed) {
              updatedNames.push(livePlugin.name);
              this._pluginMarketplaceService.addInstalledPlugin(entry.pluginUri, livePlugin);
            }
          } catch (err) {
            this._logService.error(`[PluginInstallService] Failed to update plugin '${livePlugin.name}':`, err);
            failedNames.push(livePlugin.name);
          }
        })());
      }
      await Promise.all(independentGitTasks);
      for (const { installed: _installed, marketplace } of packagePlugins) {
        if (token.isCancellationRequested) {
          return;
        }
        try {
          const changed = await this.updatePlugin(marketplace, options?.silent);
          if (changed) {
            updatedNames.push(marketplace.name);
            const pluginUri = this._pluginRepositoryService.getPluginSourceInstallUri(marketplace.sourceDescriptor);
            this._pluginMarketplaceService.addInstalledPlugin(pluginUri, marketplace);
          }
        } catch (err) {
          this._logService.error(`[PluginInstallService] Failed to update plugin '${marketplace.name}':`, err);
          failedNames.push(marketplace.name);
        }
      }
    };
    if (options.silent) {
      await doUpdate();
    } else {
      await this._progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          title: localize("updatingAllPlugins", "Updating plugins...")
        },
        doUpdate
      );
    }
    if (failedNames.length > 0) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("updateAllFailed", "Failed to update: {0}", failedNames.join(", ")),
        actions: {
          primary: [new Action("showGitOutput", localize("showOutput", "Show Output"), void 0, true, () => {
            this._commandService.executeCommand("git.showOutput");
          })]
        }
      });
    } else if (updatedNames.length > 0) {
      if (!options.automatic) {
        this._pluginMarketplaceService.clearUpdatesAvailable(options.marketplaceIds);
      }
      this._notificationService.notify({
        severity: Severity.Info,
        message: localize("updateAllSuccess", "Updated plugins: {0}", updatedNames.join(", "))
      });
    } else if (!token.isCancellationRequested) {
      if (!options.automatic) {
        this._pluginMarketplaceService.clearUpdatesAvailable(options.marketplaceIds);
      }
    }
    return { updatedNames, failedNames };
  }
  getPluginInstallUri(plugin) {
    return this._pluginRepositoryService.getPluginInstallUri(plugin);
  }
  // --- Trust gate -------------------------------------------------------------
  async _ensureMarketplaceTrusted(plugin) {
    if (this._pluginMarketplaceService.isMarketplaceTrusted(plugin.marketplaceReference)) {
      return true;
    }
    if (this._pluginMarketplaceService.isStrictMarketplacePolicyActive()) {
      this._notificationService.notify({
        severity: Severity.Warning,
        message: localize("strictMarketplaceBlockedInstall", "Plugins from '{0}' are blocked by your organization's policy.", plugin.marketplaceReference.displayLabel),
        actions: {
          primary: [new Action("chat.plugins.viewMarketplacePolicy", localize("viewPolicySettings", "View Policy Settings"), void 0, true, () => {
            return this._commandService.executeCommand("workbench.action.openSettings", ChatConfiguration.StrictMarketplaces);
          })]
        }
      });
      return false;
    }
    const { confirmed } = await this._dialogService.confirm({
      type: "question",
      message: localize("trustMarketplace", "Trust Plugins from '{0}'?", plugin.marketplaceReference.displayLabel),
      detail: localize("trustMarketplaceDetail", "Plugins can run code on your machine. Only install plugins from sources you trust.\n\nSource: {0}", plugin.marketplaceReference.rawValue),
      primaryButton: localize({ key: "trustAndInstall", comment: ["&& denotes a mnemonic"] }, "&&Trust"),
      custom: {
        icon: Codicon.shield
      }
    });
    if (!confirmed) {
      return false;
    }
    this._pluginMarketplaceService.trustMarketplace(plugin.marketplaceReference);
    return true;
  }
  // --- Relative-path source (existing git-based flow) -----------------------
  async _installRelativePathPlugin(plugin) {
    try {
      await this._pluginRepositoryService.ensureRepository(plugin.marketplaceReference, {
        progressTitle: localize("installingPlugin", "Installing plugin '{0}'...", plugin.name),
        failureLabel: plugin.name,
        marketplaceType: plugin.marketplaceType
      });
    } catch {
      return;
    }
    let pluginDir;
    try {
      pluginDir = this._pluginRepositoryService.getPluginInstallUri(plugin);
    } catch {
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("pluginDirInvalid", "Plugin source directory '{0}' is invalid for repository '{1}'.", plugin.source, plugin.marketplace)
      });
      return;
    }
    const pluginExists = await this._fileService.exists(pluginDir);
    if (!pluginExists) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("pluginDirNotFound", "Plugin source directory '{0}' not found in repository '{1}'.", plugin.source, plugin.marketplace)
      });
      return;
    }
    this._pluginMarketplaceService.addInstalledPlugin(pluginDir, plugin);
  }
  // --- GitHub / Git URL source (independent clone) --------------------------
  async _installGitPlugin(plugin) {
    const repo = this._pluginRepositoryService.getPluginSource(plugin.sourceDescriptor.kind);
    let pluginDir;
    try {
      pluginDir = await this._pluginRepositoryService.ensurePluginSource(plugin, {
        progressTitle: localize("installingPlugin", "Installing plugin '{0}'...", plugin.name),
        failureLabel: plugin.name,
        marketplaceType: plugin.marketplaceType
      });
    } catch {
      return;
    }
    const pluginExists = await this._fileService.exists(pluginDir);
    if (!pluginExists) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: localize("pluginSourceNotFound", "Plugin source '{0}' not found after cloning.", repo.getLabel(plugin.sourceDescriptor))
      });
      return;
    }
    this._pluginMarketplaceService.addInstalledPlugin(pluginDir, plugin);
  }
  // --- Package-manager sources (npm / pip) ----------------------------------
  async _installPackagePlugin(plugin, silent) {
    const repo = this._pluginRepositoryService.getPluginSource(plugin.sourceDescriptor.kind);
    if (!repo.runInstall) {
      this._logService.error(`[PluginInstallService] Expected package repository for kind '${plugin.sourceDescriptor.kind}'`);
      return false;
    }
    const installDir = await this._pluginRepositoryService.ensurePluginSource(plugin);
    const pluginDir = this._pluginRepositoryService.getPluginSourceInstallUri(plugin.sourceDescriptor);
    const result = await repo.runInstall(installDir, pluginDir, plugin, { silent });
    if (!result) {
      return false;
    }
    this._pluginMarketplaceService.addInstalledPlugin(result.pluginDir, plugin);
    return true;
  }
};
PluginInstallService = __decorateClass([
  __decorateParam(0, IAgentPluginRepositoryService),
  __decorateParam(1, IPluginMarketplaceService),
  __decorateParam(2, IFileService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IProgressService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IQuickInputService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IPathService)
], PluginInstallService);
export {
  PluginInstallService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHBsdWdpbkluc3RhbGxTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgdW50aWxkaWZ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IHBvc2l4LCB3aW4zMiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSVBsdWdpbkluc3RhbGxTZXJ2aWNlLCBJSW5zdGFsbFBsdWdpbkZyb21Tb3VyY2VPcHRpb25zLCBJSW5zdGFsbFBsdWdpbkZyb21Tb3VyY2VSZXN1bHQsIElVcGRhdGVBbGxQbHVnaW5zT3B0aW9ucywgSVVwZGF0ZUFsbFBsdWdpbnNSZXN1bHQgfSBmcm9tICcuLi9jb21tb24vcGx1Z2lucy9wbHVnaW5JbnN0YWxsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFya2V0cGxhY2VQbHVnaW4sIElNYXJrZXRwbGFjZVJlZmVyZW5jZSwgSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLCBNYXJrZXRwbGFjZVR5cGUsIGhhc1NvdXJjZUNoYW5nZWQsIHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UsIHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzLCBQbHVnaW5Tb3VyY2VLaW5kLCByZWFkQ29uZmlndXJlZE1hcmtldHBsYWNlcyB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBQbHVnaW5JbnN0YWxsU2VydmljZSBpbXBsZW1lbnRzIElQbHVnaW5JbnN0YWxsU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wbHVnaW5SZXBvc2l0b3J5U2VydmljZTogSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UsXG5cdFx0QElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlOiBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGluc3RhbGxQbHVnaW4ocGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWF3YWl0IHRoaXMuX2Vuc3VyZU1hcmtldHBsYWNlVHJ1c3RlZChwbHVnaW4pKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHRjb25zdCBraW5kID0gcGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZDtcblxuXHRcdGlmIChraW5kID09PSBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2luc3RhbGxSZWxhdGl2ZVBhdGhQbHVnaW4ocGx1Z2luKTtcblx0XHR9XG5cblx0XHRpZiAoa2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5OcG0gfHwga2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5QaXApIHtcblx0XHRcdGF3YWl0IHRoaXMuX2luc3RhbGxQYWNrYWdlUGx1Z2luKHBsdWdpbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gR2l0SHViIC8gR2l0VXJsXG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbGxHaXRQbHVnaW4ocGx1Z2luKTtcblx0fVxuXG5cdHZhbGlkYXRlUGx1Z2luU291cmNlKHNvdXJjZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZWZlcmVuY2UgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKHNvdXJjZSk7XG5cdFx0aWYgKHJlZmVyZW5jZSB8fCB0aGlzLl9pc0xvY2FsUGF0aFNvdXJjZShzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWxpemUoJ2ludmFsaWRTb3VyY2UnLCBcIid7MH0nIGlzIG5vdCBhIHZhbGlkIHBsdWdpbiBzb3VyY2UuIEVudGVyIGEgR2l0SHViIHJlcG9zaXRvcnkgKG93bmVyL3JlcG8pLCBhIGdpdCBjbG9uZSBVUkwsIG9yIGEgbG9jYWwgZm9sZGVyIHBhdGguXCIsIHNvdXJjZSk7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsUGx1Z2luRnJvbVNvdXJjZShzb3VyY2U6IHN0cmluZywgb3B0aW9ucz86IElJbnN0YWxsUGx1Z2luRnJvbVNvdXJjZU9wdGlvbnMpOiBQcm9taXNlPElJbnN0YWxsUGx1Z2luRnJvbVNvdXJjZVJlc3VsdD4ge1xuXHRcdGNvbnN0IHJlZmVyZW5jZSA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2Uoc291cmNlKTtcblx0XHRpZiAocmVmZXJlbmNlICYmIHJlZmVyZW5jZS5raW5kICE9PSBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuTG9jYWxGaWxlVXJpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZG9JbnN0YWxsRnJvbVNvdXJjZShyZWZlcmVuY2UsIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvY2FsID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUxvY2FsRGlyZWN0b3J5U291cmNlKHNvdXJjZSk7XG5cdFx0aWYgKGxvY2FsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZG9JbnN0YWxsRnJvbUxvY2FsU291cmNlKGxvY2FsLnJlZmVyZW5jZSwgbG9jYWwuY29uZmlnUGF0aCwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2ludmFsaWRTb3VyY2UnLCBcIid7MH0nIGlzIG5vdCBhIHZhbGlkIHBsdWdpbiBzb3VyY2UuIEVudGVyIGEgR2l0SHViIHJlcG9zaXRvcnkgKG93bmVyL3JlcG8pLCBhIGdpdCBjbG9uZSBVUkwsIG9yIGEgbG9jYWwgZm9sZGVyIHBhdGguXCIsIHNvdXJjZSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvSW5zdGFsbEZyb21Tb3VyY2UocmVmZXJlbmNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIG9wdGlvbnM/OiBJSW5zdGFsbFBsdWdpbkZyb21Tb3VyY2VPcHRpb25zKTogUHJvbWlzZTxJSW5zdGFsbFBsdWdpbkZyb21Tb3VyY2VSZXN1bHQ+IHtcblx0XHQvLyBCdWlsZCBhIHNvdXJjZSBkZXNjcmlwdG9yIGZvciB0aGUgZ2l0IGNsb25lLlxuXHRcdGNvbnN0IHNvdXJjZURlc2NyaXB0b3IgPSByZWZlcmVuY2Uua2luZCA9PT0gTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdEh1YlNob3J0aGFuZFxuXHRcdFx0PyB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViIGFzIGNvbnN0LCByZXBvOiByZWZlcmVuY2UuZ2l0aHViUmVwbyEgfVxuXHRcdFx0OiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0VXJsIGFzIGNvbnN0LCB1cmw6IHJlZmVyZW5jZS5jbG9uZVVybCB9O1xuXG5cdFx0Ly8gQnVpbGQgYSB0ZW1wb3JhcnkgcGx1Z2luIG9iamVjdCBmb3IgdGhlIHRydXN0IGdhdGUgYW5kIGNsb25lIHN0ZXAuXG5cdFx0Y29uc3QgdGVtcFBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luID0ge1xuXHRcdFx0bmFtZTogcmVmZXJlbmNlLmRpc3BsYXlMYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0c291cmNlOiAnJyxcblx0XHRcdHNvdXJjZURlc2NyaXB0b3IsXG5cdFx0XHRtYXJrZXRwbGFjZTogcmVmZXJlbmNlLmRpc3BsYXlMYWJlbCxcblx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiByZWZlcmVuY2UsXG5cdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5PcGVuUGx1Z2luLFxuXHRcdH07XG5cblx0XHRpZiAoIWF3YWl0IHRoaXMuX2Vuc3VyZU1hcmtldHBsYWNlVHJ1c3RlZCh0ZW1wUGx1Z2luKSkge1xuXHRcdFx0cmV0dXJuIHsgc3VjY2VzczogZmFsc2UgfTtcblx0XHR9XG5cblx0XHQvLyBDbG9uZSB0aGUgcmVwb3NpdG9yeS5cblx0XHRsZXQgcmVwb0RpcjogVVJJO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXBvRGlyID0gYXdhaXQgdGhpcy5fcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuZW5zdXJlUGx1Z2luU291cmNlKHRlbXBQbHVnaW4sIHtcblx0XHRcdFx0cHJvZ3Jlc3NUaXRsZTogbG9jYWxpemUoJ2Nsb25pbmdTb3VyY2UnLCBcIkNsb25pbmcgcGx1Z2luIHNvdXJjZSAnezB9Jy4uLlwiLCByZWZlcmVuY2UuZGlzcGxheUxhYmVsKSxcblx0XHRcdFx0ZmFpbHVyZUxhYmVsOiByZWZlcmVuY2UuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5PcGVuUGx1Z2luLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc3QgZGV0YWlsID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjbG9uZUZhaWxlZERldGFpbCcsIFwiRmFpbGVkIHRvIGNsb25lIHBsdWdpbiBzb3VyY2UgJ3swfSc6IHsxfVwiLCByZWZlcmVuY2UuZGlzcGxheUxhYmVsLCBkZXRhaWwpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCByZXBvRXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHJlcG9EaXIpO1xuXHRcdGlmICghcmVwb0V4aXN0cykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjbG9uZUZhaWxlZCcsIFwiRmFpbGVkIHRvIGNsb25lIHBsdWdpbiBzb3VyY2UgJ3swfScuXCIsIHJlZmVyZW5jZS5kaXNwbGF5TGFiZWwpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBTY2FuIGZvciBtYXJrZXRwbGFjZS5qc29uIHRvIGRpc2NvdmVyIHBsdWdpbnMuXG5cdFx0Y29uc3QgZGlzY292ZXJlZFBsdWdpbnMgPSBhd2FpdCB0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UucmVhZFBsdWdpbnNGcm9tRGlyZWN0b3J5KHJlcG9EaXIsIHJlZmVyZW5jZSk7XG5cblx0XHRpZiAoZGlzY292ZXJlZFBsdWdpbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBGYWxsIGJhY2sgdG8gYSBzaW5nbGUtcGx1Z2luIG1hbmlmZXN0IGF0IHRoZSByZXBvIHJvb3Rcblx0XHRcdC8vIChlLmcuIGAuY2xhdWRlLXBsdWdpbi9wbHVnaW4uanNvbmApLiBTdWNoIHJlcG9zIGFyZSBub3Rcblx0XHRcdC8vIG1hcmtldHBsYWNlcywgc28gd2UgZG8gTk9UIHJlZ2lzdGVyIHRoZSByZWZlcmVuY2UgdW5kZXIgdGhlXG5cdFx0XHQvLyBgY2hhdC5wbHVnaW5zLm1hcmtldHBsYWNlc2AgY29uZmlnIFx1MjAxNCB1cGRhdGVzIGZsb3cgdGhyb3VnaFxuXHRcdFx0Ly8gYHVwZGF0ZVBsdWdpblNvdXJjZWAgdmlhIHRoZSBwbHVnaW4ncyBnaXQgc291cmNlIGRlc2NyaXB0b3IuXG5cdFx0XHRjb25zdCBzaW5nbGVQbHVnaW4gPSBhd2FpdCB0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UucmVhZFNpbmdsZVBsdWdpbk1hbmlmZXN0KHJlcG9EaXIsIHJlZmVyZW5jZSk7XG5cdFx0XHRpZiAoc2luZ2xlUGx1Z2luKSB7XG5cdFx0XHRcdGlmIChvcHRpb25zPy5wbHVnaW4gJiYgb3B0aW9ucy5wbHVnaW4gIT09IHNpbmdsZVBsdWdpbi5uYW1lKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3BsdWdpbk5vdEZvdW5kJywgXCJQbHVnaW4gJ3swfScgbm90IGZvdW5kIGluICd7MX0nLlwiLCBvcHRpb25zLnBsdWdpbiwgcmVmZXJlbmNlLmRpc3BsYXlMYWJlbCksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbGxQbHVnaW4oc2luZ2xlUGx1Z2luKTtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnM/LnBsdWdpblxuXHRcdFx0XHRcdD8geyBzdWNjZXNzOiB0cnVlLCBtYXRjaGVkUGx1Z2luOiBzaW5nbGVQbHVnaW4gfVxuXHRcdFx0XHRcdDogeyBzdWNjZXNzOiB0cnVlIH07XG5cdFx0XHR9XG5cblx0XHRcdHZvaWQgdGhpcy5fcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuY2xlYW51cFBsdWdpblNvdXJjZSh0ZW1wUGx1Z2luKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnbm9QbHVnaW5zRm91bmQnLCBcIk5vIHBsdWdpbnMgZm91bmQgaW4gJ3swfScuIFRoaXMgZG9lcyBub3QgYXBwZWFyIHRvIGJlIGEgdmFsaWQgcGx1Z2luIG1hcmtldHBsYWNlLlwiLCByZWZlcmVuY2UuZGlzcGxheUxhYmVsKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiB0YXJnZXRpbmcgYSBzcGVjaWZpYyBwbHVnaW4sIGZpbmQgaXQsIHJlZ2lzdGVyIGl0LCBhbmQgcmV0dXJuLlxuXHRcdHJldHVybiB0aGlzLl9pbnN0YWxsRGlzY292ZXJlZFBsdWdpbnMocmVmZXJlbmNlLCBkaXNjb3ZlcmVkUGx1Z2lucywgb3B0aW9ucyk7XG5cdH1cblxuXHQvKipcblx0ICogSW5zdGFsbHMgYSBwbHVnaW4gZnJvbSBhIGxvY2FsIGZvbGRlciBwYXRoIChgZmlsZTovL2AgVVJJLCBhYnNvbHV0ZSBwYXRoLFxuXHQgKiBvciBgfmAtcHJlZml4ZWQgcGF0aCkuIEluc3BlY3RzIHRoZSBkaXJlY3RvcnkgdG8gZGVjaWRlIHdoZXRoZXIgaXQgaXMgYVxuXHQgKiBtYXJrZXRwbGFjZSBvciBhIHN0YW5kYWxvbmUgcGx1Z2luIGFuZCB3cml0ZXMgdG8gdGhlIGFwcHJvcHJpYXRlIHNldHRpbmc6XG5cdCAqIC0gYSBtYXJrZXRwbGFjZSBpcyByZWdpc3RlcmVkIHVuZGVyIGBjaGF0LnBsdWdpbnMubWFya2V0cGxhY2VzYCxcblx0ICogLSBhIHN0YW5kYWxvbmUgcGx1Z2luIHBhdGggaXMgcmVnaXN0ZXJlZCB1bmRlciBgY2hhdC5wbHVnaW5Mb2NhdGlvbnNgLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZG9JbnN0YWxsRnJvbUxvY2FsU291cmNlKHJlZmVyZW5jZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlLCBjb25maWdQYXRoOiBzdHJpbmcsIG9wdGlvbnM/OiBJSW5zdGFsbFBsdWdpbkZyb21Tb3VyY2VPcHRpb25zKTogUHJvbWlzZTxJSW5zdGFsbFBsdWdpbkZyb21Tb3VyY2VSZXN1bHQ+IHtcblx0XHRjb25zdCByZXBvRGlyID0gcmVmZXJlbmNlLmxvY2FsUmVwb3NpdG9yeVVyaTtcblx0XHRpZiAoIXJlcG9EaXIpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnaW52YWxpZFNvdXJjZScsIFwiJ3swfScgaXMgbm90IGEgdmFsaWQgcGx1Z2luIHNvdXJjZS4gRW50ZXIgYSBHaXRIdWIgcmVwb3NpdG9yeSAob3duZXIvcmVwbyksIGEgZ2l0IGNsb25lIFVSTCwgb3IgYSBsb2NhbCBmb2xkZXIgcGF0aC5cIiwgcmVmZXJlbmNlLnJhd1ZhbHVlKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0bGV0IGlzRGlyZWN0b3J5ID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGlzRGlyZWN0b3J5ID0gKGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUocmVwb0RpcikpLmlzRGlyZWN0b3J5O1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gcmVzb2x2ZSB0aHJvd3Mgd2hlbiB0aGUgcGF0aCBkb2Vzbid0IGV4aXN0IFx1MjAxNCBoYW5kbGVkIGJlbG93LlxuXHRcdH1cblx0XHRpZiAoIWlzRGlyZWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2xvY2FsU291cmNlTm90Rm91bmQnLCBcIlRoZSBmb2xkZXIgJ3swfScgZG9lcyBub3QgZXhpc3Qgb3IgaXMgbm90IGEgZGlyZWN0b3J5LlwiLCByZXBvRGlyLmZzUGF0aCksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEEgZGlyZWN0b3J5IHdpdGggYSBtYXJrZXRwbGFjZSBpbmRleCBpcyByZWdpc3RlcmVkIGFzIGEgbWFya2V0cGxhY2UuXG5cdFx0Y29uc3QgZGlzY292ZXJlZFBsdWdpbnMgPSBhd2FpdCB0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UucmVhZFBsdWdpbnNGcm9tRGlyZWN0b3J5KHJlcG9EaXIsIHJlZmVyZW5jZSk7XG5cdFx0aWYgKGRpc2NvdmVyZWRQbHVnaW5zLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIFZlcmlmeSB0cnVzdCBiZWZvcmUgd3JpdGluZyB0byBjb25maWcsIG1pcnJvcmluZyB0aGUgZ2l0IHBhdGhcblx0XHRcdC8vIChfZG9JbnN0YWxsRnJvbVNvdXJjZSk6IGRlY2xpbmluZyB0aGUgcHJvbXB0IG11c3Qgbm90IHBlcnNpc3QgdGhlXG5cdFx0XHQvLyBtYXJrZXRwbGFjZSB1bmRlciBgY2hhdC5wbHVnaW5zLm1hcmtldHBsYWNlc2AuXG5cdFx0XHRjb25zdCB0ZW1wUGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4gPSB7XG5cdFx0XHRcdG5hbWU6IHJlZmVyZW5jZS5kaXNwbGF5TGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdFx0dmVyc2lvbjogJycsXG5cdFx0XHRcdHNvdXJjZTogJycsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICcnIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiByZWZlcmVuY2UuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmZXJlbmNlLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5PcGVuUGx1Z2luLFxuXHRcdFx0fTtcblx0XHRcdGlmICghYXdhaXQgdGhpcy5fZW5zdXJlTWFya2V0cGxhY2VUcnVzdGVkKHRlbXBQbHVnaW4pKSB7XG5cdFx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFsbERpc2NvdmVyZWRQbHVnaW5zKHJlZmVyZW5jZSwgZGlzY292ZXJlZFBsdWdpbnMsIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSwgYSBkaXJlY3Rvcnkgd2l0aCBhIHNpbmdsZS1wbHVnaW4gbWFuaWZlc3QgaXMgcmVnaXN0ZXJlZCBhc1xuXHRcdC8vIGEgc3RhbmRhbG9uZSBwbHVnaW4gbG9jYXRpb24uXG5cdFx0aWYgKGF3YWl0IHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5pc1BsdWdpbkRpcmVjdG9yeShyZXBvRGlyKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fYWRkUGx1Z2luTG9jYXRpb25Ub0NvbmZpZyhjb25maWdQYXRoKTtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnbG9jYWxOb1BsdWdpbnMnLCBcIk5vIHBsdWdpbiBvciBtYXJrZXRwbGFjZSBmb3VuZCBpbiAnezB9Jy4gVGhpcyBmb2xkZXIgZG9lcyBub3QgY29udGFpbiBhIHBsdWdpbiBvciBtYXJrZXRwbGFjZSBtYW5pZmVzdC5cIiwgcmVwb0Rpci5mc1BhdGgpLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogUmVnaXN0ZXJzIHRoZSBtYXJrZXRwbGFjZSBhbmQgaW5zdGFsbHMgdGhlIGRpc2NvdmVyZWQgcGx1Z2luKHMpOiB3aGVuIGFcblx0ICogc3BlY2lmaWMgcGx1Z2luIGlzIHRhcmdldGVkIGl0IGluc3RhbGxzIHRoYXQgb25lLCB3aGVuIHRoZXJlIGlzIGV4YWN0bHlcblx0ICogb25lIGl0IGluc3RhbGxzIGl0IGRpcmVjdGx5LCBhbmQgb3RoZXJ3aXNlIHByb21wdHMgdGhlIHVzZXIgdG8gY2hvb3NlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaW5zdGFsbERpc2NvdmVyZWRQbHVnaW5zKHJlZmVyZW5jZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlLCBkaXNjb3ZlcmVkUGx1Z2luczogcmVhZG9ubHkgSU1hcmtldHBsYWNlUGx1Z2luW10sIG9wdGlvbnM/OiBJSW5zdGFsbFBsdWdpbkZyb21Tb3VyY2VPcHRpb25zKTogUHJvbWlzZTxJSW5zdGFsbFBsdWdpbkZyb21Tb3VyY2VSZXN1bHQ+IHtcblx0XHRpZiAob3B0aW9ucz8ucGx1Z2luKSB7XG5cdFx0XHRjb25zdCBtYXRjaGVkUGx1Z2luID0gZGlzY292ZXJlZFBsdWdpbnMuZmluZChwID0+IHAubmFtZSA9PT0gb3B0aW9ucy5wbHVnaW4pO1xuXHRcdFx0aWYgKCFtYXRjaGVkUGx1Z2luKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3BsdWdpbk5vdEZvdW5kJywgXCJQbHVnaW4gJ3swfScgbm90IGZvdW5kIGluICd7MX0nLlwiLCBvcHRpb25zLnBsdWdpbiwgcmVmZXJlbmNlLmRpc3BsYXlMYWJlbCksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9hZGRNYXJrZXRwbGFjZVRvQ29uZmlnKHJlZmVyZW5jZSk7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbGxQbHVnaW4obWF0Y2hlZFBsdWdpbik7XG5cdFx0XHRyZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBtYXRjaGVkUGx1Z2luIH07XG5cdFx0fVxuXG5cdFx0aWYgKGRpc2NvdmVyZWRQbHVnaW5zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fYWRkTWFya2V0cGxhY2VUb0NvbmZpZyhyZWZlcmVuY2UpO1xuXHRcdFx0YXdhaXQgdGhpcy5pbnN0YWxsUGx1Z2luKGRpc2NvdmVyZWRQbHVnaW5zWzBdKTtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcblx0XHR9XG5cblx0XHQvLyBNdWx0aXBsZSBwbHVnaW5zIFx1MjAxNCBsZXQgdGhlIHVzZXIgY2hvb3NlLlxuXHRcdGNvbnN0IHBpY2tzOiAoSVF1aWNrUGlja0l0ZW0gJiB7IHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luIH0pW10gPSBkaXNjb3ZlcmVkUGx1Z2lucy5tYXAocCA9PiAoe1xuXHRcdFx0bGFiZWw6IHAubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBwLmRlc2NyaXB0aW9uLFxuXHRcdFx0cGx1Z2luOiBwLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywge1xuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdzZWxlY3RQbHVnaW4nLCBcIlNlbGVjdCBhIHBsdWdpbiB0byBpbnN0YWxsIGZyb20gJ3swfSdcIiwgcmVmZXJlbmNlLmRpc3BsYXlMYWJlbCksXG5cdFx0XHRjYW5QaWNrTWFueTogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHRpZiAoIXNlbGVjdGVkKSB7XG5cdFx0XHRyZXR1cm4geyBzdWNjZXNzOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2FkZE1hcmtldHBsYWNlVG9Db25maWcocmVmZXJlbmNlKTtcblx0XHRhd2FpdCB0aGlzLmluc3RhbGxQbHVnaW4oc2VsZWN0ZWQucGx1Z2luKTtcblxuXHRcdHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZE1hcmtldHBsYWNlVG9Db25maWcocmVmZXJlbmNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UpIHtcblx0XHRjb25zdCB7IHVzZXJWYWx1ZXMsIGVmZmVjdGl2ZVZhbHVlcyB9ID0gcmVhZENvbmZpZ3VyZWRNYXJrZXRwbGFjZXModGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4aXN0aW5nUmVmcyA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzKGVmZmVjdGl2ZVZhbHVlcyk7XG5cdFx0aWYgKGV4aXN0aW5nUmVmcy5zb21lKHIgPT4gci5jYW5vbmljYWxJZCA9PT0gcmVmZXJlbmNlLmNhbm9uaWNhbElkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzLCBbLi4udXNlclZhbHVlcywgcmVmZXJlbmNlLnJhd1ZhbHVlXSk7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRQbHVnaW5Mb2NhdGlvblRvQ29uZmlnKHBhdGhLZXk6IHN0cmluZykge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PihDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5Mb2NhdGlvbnMpLnVzZXJWYWx1ZSA/PyB7fTtcblx0XHRpZiAoY3VycmVudFtwYXRoS2V5XSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTG9jYXRpb25zLCB7IC4uLmN1cnJlbnQsIFtwYXRoS2V5XTogdHJ1ZSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGB0cnVlYCB3aGVuIHRoZSBzb3VyY2Ugc3RyaW5nIGxvb2tzIGxpa2UgYSBsb2NhbCBmb2xkZXIgcGF0aCBcdTIwMTRcblx0ICogYSBgZmlsZTovL2AgVVJJLCBhbiBhYnNvbHV0ZSBmaWxlc3lzdGVtIHBhdGgsIG9yIGEgYH5gLXByZWZpeGVkIHBhdGguXG5cdCAqIFRoaXMgaXMgYSBzeW5jaHJvbm91cyBmb3JtYXQgY2hlY2sgb25seTsgZXhpc3RlbmNlIGlzIHZlcmlmaWVkIGxhdGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNMb2NhbFBhdGhTb3VyY2Uoc291cmNlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCB0cmltbWVkID0gc291cmNlLnRyaW0oKTtcblx0XHRpZiAoIXRyaW1tZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKC9eZmlsZTpcXC9cXC8vaS50ZXN0KHRyaW1tZWQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRyaW1tZWQgPT09ICd+JyB8fCB0cmltbWVkLnN0YXJ0c1dpdGgoJ34vJykgfHwgdHJpbW1lZC5zdGFydHNXaXRoKCd+XFxcXCcpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHdpbjMyLmlzQWJzb2x1dGUodHJpbW1lZCkgfHwgcG9zaXguaXNBYnNvbHV0ZSh0cmltbWVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBhIGxvY2FsIGZvbGRlciBzb3VyY2Ugc3RyaW5nIHRvIGEge0BsaW5rIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5Mb2NhbEZpbGVVcml9XG5cdCAqIHJlZmVyZW5jZSBwbHVzIHRoZSBwYXRoIHRvIHBlcnNpc3QgaW4gYGNoYXQucGx1Z2luTG9jYXRpb25zYC4gVGlsZGUgcGF0aHNcblx0ICogYXJlIGV4cGFuZGVkIGFnYWluc3QgdGhlIHVzZXIgaG9tZS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBzdHJpbmdcblx0ICogZG9lcyBub3QgcmVzb2x2ZSB0byBhbiBhYnNvbHV0ZSBsb2NhbCBmb2xkZXIuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlTG9jYWxEaXJlY3RvcnlTb3VyY2Uoc291cmNlOiBzdHJpbmcpOiBQcm9taXNlPHsgcmVmZXJlbmNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2U7IGNvbmZpZ1BhdGg6IHN0cmluZyB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdHJpbW1lZCA9IHNvdXJjZS50cmltKCk7XG5cblx0XHQvLyBBbHJlYWR5IGEgYGZpbGU6Ly9gIFVSSSBcdTIwMTQgcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSB5aWVsZHMgYSBMb2NhbEZpbGVVcmkgcmVmZXJlbmNlLlxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UodHJpbW1lZCk7XG5cdFx0aWYgKHBhcnNlZD8ua2luZCA9PT0gTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkxvY2FsRmlsZVVyaSAmJiBwYXJzZWQubG9jYWxSZXBvc2l0b3J5VXJpKSB7XG5cdFx0XHRyZXR1cm4geyByZWZlcmVuY2U6IHBhcnNlZCwgY29uZmlnUGF0aDogcGFyc2VkLmxvY2FsUmVwb3NpdG9yeVVyaS5mc1BhdGggfTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2lzTG9jYWxQYXRoU291cmNlKHRyaW1tZWQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCByZXNvbHZlZFBhdGggPSB0cmltbWVkO1xuXHRcdGlmIChyZXNvbHZlZFBhdGguc3RhcnRzV2l0aCgnficpKSB7XG5cdFx0XHRjb25zdCB1c2VySG9tZSA9IGF3YWl0IHRoaXMuX3BhdGhTZXJ2aWNlLnVzZXJIb21lKCk7XG5cdFx0XHRjb25zdCBob21lID0gdXNlckhvbWUuc2NoZW1lID09PSAnZmlsZScgPyB1c2VySG9tZS5mc1BhdGggOiB1c2VySG9tZS5wYXRoO1xuXHRcdFx0cmVzb2x2ZWRQYXRoID0gdW50aWxkaWZ5KHJlc29sdmVkUGF0aCwgaG9tZSk7XG5cdFx0fVxuXG5cdFx0aWYgKCF3aW4zMi5pc0Fic29sdXRlKHJlc29sdmVkUGF0aCkgJiYgIXBvc2l4LmlzQWJzb2x1dGUocmVzb2x2ZWRQYXRoKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZWZlcmVuY2UgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKFVSSS5maWxlKHJlc29sdmVkUGF0aCkudG9TdHJpbmcoKSk7XG5cdFx0aWYgKHJlZmVyZW5jZT8ua2luZCAhPT0gTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkxvY2FsRmlsZVVyaSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBQcmVzZXJ2ZSB0aGUgdXNlcidzIG9yaWdpbmFsIHBhdGggZm9ybSAoZS5nLiBgfi9wbHVnaW5zL2Zvb2ApIHNvIHRoYXRcblx0XHQvLyB0aGUgcGVyc2lzdGVkIGBjaGF0LnBsdWdpbkxvY2F0aW9uc2Aga2V5IHN0YXlzIHBvcnRhYmxlLlxuXHRcdHJldHVybiB7IHJlZmVyZW5jZSwgY29uZmlnUGF0aDogdHJpbW1lZCB9O1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlUGx1Z2luKHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luLCBzaWxlbnQ/OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5pc1N0cmljdE1hcmtldHBsYWNlUG9saWN5QWN0aXZlKCkgJiYgIXRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5pc01hcmtldHBsYWNlVHJ1c3RlZChwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UpKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnc3RyaWN0TWFya2V0cGxhY2VCbG9ja2VkVXBkYXRlJywgXCJVcGRhdGVzIGZyb20gJ3swfScgYXJlIGJsb2NrZWQgYnkgeW91ciBvcmdhbml6YXRpb24ncyBwb2xpY3kuXCIsIHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZS5kaXNwbGF5TGFiZWwpLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2luZCA9IHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmQ7XG5cblx0XHRpZiAoa2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5OcG0gfHwga2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5QaXApIHtcblx0XHRcdC8vIFBhY2thZ2UtbWFuYWdlciBcInVwZGF0ZVwiIHJlLXJ1bnMgaW5zdGFsbCB2aWEgdGVybWluYWxcblx0XHRcdHJldHVybiB0aGlzLl9pbnN0YWxsUGFja2FnZVBsdWdpbihwbHVnaW4sIHNpbGVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIHJlbGF0aXZlLXBhdGggYW5kIGdpdCBzb3VyY2VzLCBkZWxlZ2F0ZSB0byByZXBvc2l0b3J5IHNlcnZpY2Vcblx0XHRyZXR1cm4gdGhpcy5fcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UudXBkYXRlUGx1Z2luU291cmNlKHBsdWdpbiwge1xuXHRcdFx0cGx1Z2luTmFtZTogcGx1Z2luLm5hbWUsXG5cdFx0XHRmYWlsdXJlTGFiZWw6IHBsdWdpbi5uYW1lLFxuXHRcdFx0bWFya2V0cGxhY2VUeXBlOiBwbHVnaW4ubWFya2V0cGxhY2VUeXBlLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlQWxsUGx1Z2lucyhvcHRpb25zOiBJVXBkYXRlQWxsUGx1Z2luc09wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVVwZGF0ZUFsbFBsdWdpbnNSZXN1bHQ+IHtcblx0XHRjb25zdCBhbGxJbnN0YWxsZWQgPSB0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuaW5zdGFsbGVkUGx1Z2lucy5nZXQoKTtcblx0XHRjb25zdCBpbnN0YWxsZWQgPSBhbGxJbnN0YWxsZWQuZmlsdGVyKGVudHJ5ID0+XG5cdFx0XHQoIW9wdGlvbnMubWFya2V0cGxhY2VJZHMgfHwgb3B0aW9ucy5tYXJrZXRwbGFjZUlkcy5oYXMoZW50cnkucGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLmNhbm9uaWNhbElkKSlcblx0XHRcdCYmICghb3B0aW9ucy5hdXRvbWF0aWMgfHwgdGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmlzTWFya2V0cGxhY2VBdXRvVXBkYXRlRW5hYmxlZChlbnRyeS5wbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UpKVxuXHRcdCk7XG5cdFx0aWYgKGluc3RhbGxlZC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7IHVwZGF0ZWROYW1lczogW10sIGZhaWxlZE5hbWVzOiBbXSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHVwZGF0ZWROYW1lczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBmYWlsZWROYW1lczogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNvbnN0IGRvVXBkYXRlID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2l0VGFza3M6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdFx0Y29uc3QgcGFja2FnZVBsdWdpbnM6IHsgaW5zdGFsbGVkOiBJTWFya2V0cGxhY2VQbHVnaW47IG1hcmtldHBsYWNlOiBJTWFya2V0cGxhY2VQbHVnaW4gfVtdID0gW107XG5cblx0XHRcdC8vIDEuIFB1bGwgZWFjaCB1bmlxdWUgbWFya2V0cGxhY2UgcmVwb3NpdG9yeSBmaXJzdCAoaGFuZGxlcyBhbGxcblx0XHRcdC8vICAgIHJlbGF0aXZlLXBhdGggcGx1Z2lucyBhbmQgZW5zdXJlcyB0aGUgbWFya2V0cGxhY2UgaW5kZXggb25cblx0XHRcdC8vICAgIGRpc2sgaXMgdXAtdG8tZGF0ZSBiZWZvcmUgd2UgcmUtcmVhZCBpdCkuXG5cdFx0XHRjb25zdCBzZWVuTWFya2V0cGxhY2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGluc3RhbGxlZCkge1xuXHRcdFx0XHRjb25zdCByZWYgPSBlbnRyeS5wbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2U7XG5cdFx0XHRcdGlmIChzZWVuTWFya2V0cGxhY2VzLmhhcyhyZWYuY2Fub25pY2FsSWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2Vlbk1hcmtldHBsYWNlcy5hZGQocmVmLmNhbm9uaWNhbElkKTtcblx0XHRcdFx0aWYgKHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5pc1N0cmljdE1hcmtldHBsYWNlUG9saWN5QWN0aXZlKCkgJiYgIXRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5pc01hcmtldHBsYWNlVHJ1c3RlZChyZWYpKSB7XG5cdFx0XHRcdFx0ZmFpbGVkTmFtZXMucHVzaChyZWYuZGlzcGxheUxhYmVsKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRnaXRUYXNrcy5wdXNoKChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNoYW5nZWQgPSBhd2FpdCB0aGlzLl9wbHVnaW5SZXBvc2l0b3J5U2VydmljZS5wdWxsUmVwb3NpdG9yeShyZWYsIHtcblx0XHRcdFx0XHRcdFx0cGx1Z2luTmFtZTogcmVmLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0XHRcdFx0ZmFpbHVyZUxhYmVsOiByZWYuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IGVudHJ5LnBsdWdpbi5tYXJrZXRwbGFjZVR5cGUsXG5cdFx0XHRcdFx0XHRcdHNpbGVudDogb3B0aW9ucy5zaWxlbnQsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHRcdFx0XHRcdHVwZGF0ZWROYW1lcy5wdXNoKHJlZi5kaXNwbGF5TGFiZWwpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW1BsdWdpbkluc3RhbGxTZXJ2aWNlXSBGYWlsZWQgdG8gcHVsbCBtYXJrZXRwbGFjZSAnJHtyZWYuZGlzcGxheUxhYmVsfSc6YCwgZXJyKTtcblx0XHRcdFx0XHRcdGZhaWxlZE5hbWVzLnB1c2gocmVmLmRpc3BsYXlMYWJlbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpKTtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZ2l0VGFza3MpO1xuXG5cdFx0XHQvLyAyLiBSZS1mZXRjaCBtYXJrZXRwbGFjZSBkYXRhICphZnRlciogcHVsbGluZyBzbyB3ZSBzZWUgYW55XG5cdFx0XHQvLyAgICB1cGRhdGVkIHBsdWdpbiBkZXNjcmlwdG9ycyAobmV3IHZlcnNpb25zLCByZWZzLCBldGMuKS5cblx0XHRcdGNvbnN0IG1hcmtldHBsYWNlSWRzID0gbmV3IFNldChpbnN0YWxsZWQubWFwKGVudHJ5ID0+IGVudHJ5LnBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZS5jYW5vbmljYWxJZCkpO1xuXHRcdFx0Y29uc3QgbWFya2V0cGxhY2VQbHVnaW5zID0gYXdhaXQgdGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmZldGNoTWFya2V0cGxhY2VQbHVnaW5zKHRva2VuLCBtYXJrZXRwbGFjZUlkcyk7XG5cdFx0XHRjb25zdCBtYXJrZXRwbGFjZUJ5S2V5ID0gbmV3IE1hcDxzdHJpbmcsIElNYXJrZXRwbGFjZVBsdWdpbj4oKTtcblx0XHRcdGZvciAoY29uc3QgbXAgb2YgbWFya2V0cGxhY2VQbHVnaW5zKSB7XG5cdFx0XHRcdG1hcmtldHBsYWNlQnlLZXkuc2V0KGAke21wLm1hcmtldHBsYWNlUmVmZXJlbmNlLmNhbm9uaWNhbElkfTo6JHttcC5uYW1lfWAsIG1wKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gMy4gVXBkYXRlIG5vbi1yZWxhdGl2ZS1wYXRoIHBsdWdpbnMgaW5kaXZpZHVhbGx5LlxuXHRcdFx0Y29uc3QgaW5kZXBlbmRlbnRHaXRUYXNrczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGluc3RhbGxlZCkge1xuXHRcdFx0XHRpZiAoZW50cnkucGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGxpdmVQbHVnaW4gPSBtYXJrZXRwbGFjZUJ5S2V5LmdldChgJHtlbnRyeS5wbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UuY2Fub25pY2FsSWR9Ojoke2VudHJ5LnBsdWdpbi5uYW1lfWApO1xuXHRcdFx0XHRpZiAoIWxpdmVQbHVnaW4gfHwgIWhhc1NvdXJjZUNoYW5nZWQoZW50cnkucGx1Z2luLnNvdXJjZURlc2NyaXB0b3IsIGxpdmVQbHVnaW4uc291cmNlRGVzY3JpcHRvcikpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGRlc2MgPSBsaXZlUGx1Z2luLnNvdXJjZURlc2NyaXB0b3I7XG5cdFx0XHRcdGlmIChkZXNjLmtpbmQgPT09IFBsdWdpblNvdXJjZUtpbmQuTnBtIHx8IGRlc2Mua2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5QaXApIHtcblx0XHRcdFx0XHRpZiAoIW9wdGlvbnMuZm9yY2UgJiYgIWRlc2MudmVyc2lvbikge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHBhY2thZ2VQbHVnaW5zLnB1c2goeyBpbnN0YWxsZWQ6IGVudHJ5LnBsdWdpbiwgbWFya2V0cGxhY2U6IGxpdmVQbHVnaW4gfSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpbmRlcGVuZGVudEdpdFRhc2tzLnB1c2goKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hhbmdlZCA9IGF3YWl0IHRoaXMuX3BsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLnVwZGF0ZVBsdWdpblNvdXJjZShsaXZlUGx1Z2luLCB7XG5cdFx0XHRcdFx0XHRcdHBsdWdpbk5hbWU6IGxpdmVQbHVnaW4ubmFtZSxcblx0XHRcdFx0XHRcdFx0ZmFpbHVyZUxhYmVsOiBsaXZlUGx1Z2luLm5hbWUsXG5cdFx0XHRcdFx0XHRcdG1hcmtldHBsYWNlVHlwZTogbGl2ZVBsdWdpbi5tYXJrZXRwbGFjZVR5cGUsXG5cdFx0XHRcdFx0XHRcdHNpbGVudDogb3B0aW9ucy5zaWxlbnQsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHRcdFx0XHRcdHVwZGF0ZWROYW1lcy5wdXNoKGxpdmVQbHVnaW4ubmFtZSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5hZGRJbnN0YWxsZWRQbHVnaW4oZW50cnkucGx1Z2luVXJpLCBsaXZlUGx1Z2luKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtQbHVnaW5JbnN0YWxsU2VydmljZV0gRmFpbGVkIHRvIHVwZGF0ZSBwbHVnaW4gJyR7bGl2ZVBsdWdpbi5uYW1lfSc6YCwgZXJyKTtcblx0XHRcdFx0XHRcdGZhaWxlZE5hbWVzLnB1c2gobGl2ZVBsdWdpbi5uYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChpbmRlcGVuZGVudEdpdFRhc2tzKTtcblxuXHRcdFx0Zm9yIChjb25zdCB7IGluc3RhbGxlZDogX2luc3RhbGxlZCwgbWFya2V0cGxhY2UgfSBvZiBwYWNrYWdlUGx1Z2lucykge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGNoYW5nZWQgPSBhd2FpdCB0aGlzLnVwZGF0ZVBsdWdpbihtYXJrZXRwbGFjZSwgb3B0aW9ucz8uc2lsZW50KTtcblx0XHRcdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0dXBkYXRlZE5hbWVzLnB1c2gobWFya2V0cGxhY2UubmFtZSk7XG5cdFx0XHRcdFx0XHRjb25zdCBwbHVnaW5VcmkgPSB0aGlzLl9wbHVnaW5SZXBvc2l0b3J5U2VydmljZS5nZXRQbHVnaW5Tb3VyY2VJbnN0YWxsVXJpKG1hcmtldHBsYWNlLnNvdXJjZURlc2NyaXB0b3IpO1xuXHRcdFx0XHRcdFx0dGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbihwbHVnaW5VcmksIG1hcmtldHBsYWNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtQbHVnaW5JbnN0YWxsU2VydmljZV0gRmFpbGVkIHRvIHVwZGF0ZSBwbHVnaW4gJyR7bWFya2V0cGxhY2UubmFtZX0nOmAsIGVycik7XG5cdFx0XHRcdFx0ZmFpbGVkTmFtZXMucHVzaChtYXJrZXRwbGFjZS5uYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAob3B0aW9ucy5zaWxlbnQpIHtcblx0XHRcdGF3YWl0IGRvVXBkYXRlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Byb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd1cGRhdGluZ0FsbFBsdWdpbnMnLCBcIlVwZGF0aW5nIHBsdWdpbnMuLi5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRvVXBkYXRlLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRpZiAoZmFpbGVkTmFtZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd1cGRhdGVBbGxGYWlsZWQnLCBcIkZhaWxlZCB0byB1cGRhdGU6IHswfVwiLCBmYWlsZWROYW1lcy5qb2luKCcsICcpKSxcblx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdHByaW1hcnk6IFtuZXcgQWN0aW9uKCdzaG93R2l0T3V0cHV0JywgbG9jYWxpemUoJ3Nob3dPdXRwdXQnLCBcIlNob3cgT3V0cHV0XCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdnaXQuc2hvd091dHB1dCcpO1xuXHRcdFx0XHRcdH0pXSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAodXBkYXRlZE5hbWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmICghb3B0aW9ucy5hdXRvbWF0aWMpIHtcblx0XHRcdFx0dGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmNsZWFyVXBkYXRlc0F2YWlsYWJsZShvcHRpb25zLm1hcmtldHBsYWNlSWRzKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd1cGRhdGVBbGxTdWNjZXNzJywgXCJVcGRhdGVkIHBsdWdpbnM6IHswfVwiLCB1cGRhdGVkTmFtZXMuam9pbignLCAnKSksXG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0aWYgKCFvcHRpb25zLmF1dG9tYXRpYykge1xuXHRcdFx0XHR0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuY2xlYXJVcGRhdGVzQXZhaWxhYmxlKG9wdGlvbnMubWFya2V0cGxhY2VJZHMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHVwZGF0ZWROYW1lcywgZmFpbGVkTmFtZXMgfTtcblx0fVxuXG5cdGdldFBsdWdpbkluc3RhbGxVcmkocGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4pOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLl9wbHVnaW5SZXBvc2l0b3J5U2VydmljZS5nZXRQbHVnaW5JbnN0YWxsVXJpKHBsdWdpbik7XG5cdH1cblxuXHQvLyAtLS0gVHJ1c3QgZ2F0ZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlTWFya2V0cGxhY2VUcnVzdGVkKHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5pc01hcmtldHBsYWNlVHJ1c3RlZChwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBVbmRlciB0aGUgc3RyaWN0LW1hcmtldHBsYWNlIGVudGVycHJpc2UgcG9saWN5LCBhIG1hcmtldHBsYWNlIHRoYXQgaXMgbm90XG5cdFx0Ly8gb24gdGhlIGFsbG93bGlzdCBpcyBibG9ja2VkIG91dHJpZ2h0IFx1MjAxNCB0aGUgdXNlciBjYW5ub3QgZ3JhbnQgdHJ1c3QgdG9cblx0XHQvLyBieXBhc3MgaXQuIFN1cmZhY2UgYSBub24tYWN0aW9uYWJsZSBlbnRlcnByaXNlLXBvbGljeSBub3RpZmljYXRpb24gdGhhdFxuXHRcdC8vIHBvaW50cyBhdCB0aGUgbWFuYWdlZCBzZXR0aW5nIChzaG93biBhcyBcIk1hbmFnZWQgYnkgb3JnYW5pemF0aW9uXCIpLlxuXHRcdGlmICh0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuaXNTdHJpY3RNYXJrZXRwbGFjZVBvbGljeUFjdGl2ZSgpKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnc3RyaWN0TWFya2V0cGxhY2VCbG9ja2VkSW5zdGFsbCcsIFwiUGx1Z2lucyBmcm9tICd7MH0nIGFyZSBibG9ja2VkIGJ5IHlvdXIgb3JnYW5pemF0aW9uJ3MgcG9saWN5LlwiLCBwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UuZGlzcGxheUxhYmVsKSxcblx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdHByaW1hcnk6IFtuZXcgQWN0aW9uKCdjaGF0LnBsdWdpbnMudmlld01hcmtldHBsYWNlUG9saWN5JywgbG9jYWxpemUoJ3ZpZXdQb2xpY3lTZXR0aW5ncycsIFwiVmlldyBQb2xpY3kgU2V0dGluZ3NcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncycsIENoYXRDb25maWd1cmF0aW9uLlN0cmljdE1hcmtldHBsYWNlcyk7XG5cdFx0XHRcdFx0fSldLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiAncXVlc3Rpb24nLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3RydXN0TWFya2V0cGxhY2UnLCBcIlRydXN0IFBsdWdpbnMgZnJvbSAnezB9Jz9cIiwgcGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLmRpc3BsYXlMYWJlbCksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCd0cnVzdE1hcmtldHBsYWNlRGV0YWlsJywgXCJQbHVnaW5zIGNhbiBydW4gY29kZSBvbiB5b3VyIG1hY2hpbmUuIE9ubHkgaW5zdGFsbCBwbHVnaW5zIGZyb20gc291cmNlcyB5b3UgdHJ1c3QuXFxuXFxuU291cmNlOiB7MH1cIiwgcGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLnJhd1ZhbHVlKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAndHJ1c3RBbmRJbnN0YWxsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmVHJ1c3RcIiksXG5cdFx0XHRjdXN0b206IHtcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5zaGllbGQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UudHJ1c3RNYXJrZXRwbGFjZShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gLS0tIFJlbGF0aXZlLXBhdGggc291cmNlIChleGlzdGluZyBnaXQtYmFzZWQgZmxvdykgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIGFzeW5jIF9pbnN0YWxsUmVsYXRpdmVQYXRoUGx1Z2luKHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3BsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmVuc3VyZVJlcG9zaXRvcnkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCB7XG5cdFx0XHRcdHByb2dyZXNzVGl0bGU6IGxvY2FsaXplKCdpbnN0YWxsaW5nUGx1Z2luJywgXCJJbnN0YWxsaW5nIHBsdWdpbiAnezB9Jy4uLlwiLCBwbHVnaW4ubmFtZSksXG5cdFx0XHRcdGZhaWx1cmVMYWJlbDogcGx1Z2luLm5hbWUsXG5cdFx0XHRcdG1hcmtldHBsYWNlVHlwZTogcGx1Z2luLm1hcmtldHBsYWNlVHlwZSxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBwbHVnaW5EaXI6IFVSSTtcblx0XHR0cnkge1xuXHRcdFx0cGx1Z2luRGlyID0gdGhpcy5fcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuZ2V0UGx1Z2luSW5zdGFsbFVyaShwbHVnaW4pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdwbHVnaW5EaXJJbnZhbGlkJywgXCJQbHVnaW4gc291cmNlIGRpcmVjdG9yeSAnezB9JyBpcyBpbnZhbGlkIGZvciByZXBvc2l0b3J5ICd7MX0nLlwiLCBwbHVnaW4uc291cmNlLCBwbHVnaW4ubWFya2V0cGxhY2UpLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGx1Z2luRXhpc3RzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHBsdWdpbkRpcik7XG5cdFx0aWYgKCFwbHVnaW5FeGlzdHMpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncGx1Z2luRGlyTm90Rm91bmQnLCBcIlBsdWdpbiBzb3VyY2UgZGlyZWN0b3J5ICd7MH0nIG5vdCBmb3VuZCBpbiByZXBvc2l0b3J5ICd7MX0nLlwiLCBwbHVnaW4uc291cmNlLCBwbHVnaW4ubWFya2V0cGxhY2UpLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbihwbHVnaW5EaXIsIHBsdWdpbik7XG5cdH1cblxuXHQvLyAtLS0gR2l0SHViIC8gR2l0IFVSTCBzb3VyY2UgKGluZGVwZW5kZW50IGNsb25lKSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX2luc3RhbGxHaXRQbHVnaW4ocGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXBvID0gdGhpcy5fcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuZ2V0UGx1Z2luU291cmNlKHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmQpO1xuXHRcdGxldCBwbHVnaW5EaXI6IFVSSTtcblx0XHR0cnkge1xuXHRcdFx0cGx1Z2luRGlyID0gYXdhaXQgdGhpcy5fcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuZW5zdXJlUGx1Z2luU291cmNlKHBsdWdpbiwge1xuXHRcdFx0XHRwcm9ncmVzc1RpdGxlOiBsb2NhbGl6ZSgnaW5zdGFsbGluZ1BsdWdpbicsIFwiSW5zdGFsbGluZyBwbHVnaW4gJ3swfScuLi5cIiwgcGx1Z2luLm5hbWUpLFxuXHRcdFx0XHRmYWlsdXJlTGFiZWw6IHBsdWdpbi5uYW1lLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IHBsdWdpbi5tYXJrZXRwbGFjZVR5cGUsXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwbHVnaW5FeGlzdHMgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHMocGx1Z2luRGlyKTtcblx0XHRpZiAoIXBsdWdpbkV4aXN0cykge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdwbHVnaW5Tb3VyY2VOb3RGb3VuZCcsIFwiUGx1Z2luIHNvdXJjZSAnezB9JyBub3QgZm91bmQgYWZ0ZXIgY2xvbmluZy5cIiwgcmVwby5nZXRMYWJlbChwbHVnaW4uc291cmNlRGVzY3JpcHRvcikpLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbihwbHVnaW5EaXIsIHBsdWdpbik7XG5cdH1cblxuXHQvLyAtLS0gUGFja2FnZS1tYW5hZ2VyIHNvdXJjZXMgKG5wbSAvIHBpcCkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX2luc3RhbGxQYWNrYWdlUGx1Z2luKHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luLCBzaWxlbnQ/OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcmVwbyA9IHRoaXMuX3BsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmdldFBsdWdpblNvdXJjZShwbHVnaW4uc291cmNlRGVzY3JpcHRvci5raW5kKTtcblx0XHRpZiAoIXJlcG8ucnVuSW5zdGFsbCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW1BsdWdpbkluc3RhbGxTZXJ2aWNlXSBFeHBlY3RlZCBwYWNrYWdlIHJlcG9zaXRvcnkgZm9yIGtpbmQgJyR7cGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZH0nYCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIHRoZSBwYXJlbnQgY2FjaGUgZGlyZWN0b3J5IGV4aXN0cyAocmV0dXJucyBucG0vPHBrZz4gb3IgcGlwLzxwa2c+KVxuXHRcdGNvbnN0IGluc3RhbGxEaXIgPSBhd2FpdCB0aGlzLl9wbHVnaW5SZXBvc2l0b3J5U2VydmljZS5lbnN1cmVQbHVnaW5Tb3VyY2UocGx1Z2luKTtcblx0XHQvLyBUaGUgYWN0dWFsIHBsdWdpbiBjb250ZW50IGxvY2F0aW9uIChlLmcuIG5wbS88cGtnPi9ub2RlX21vZHVsZXMvPHBrZz4pXG5cdFx0Y29uc3QgcGx1Z2luRGlyID0gdGhpcy5fcGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuZ2V0UGx1Z2luU291cmNlSW5zdGFsbFVyaShwbHVnaW4uc291cmNlRGVzY3JpcHRvcik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXBvLnJ1bkluc3RhbGwoaW5zdGFsbERpciwgcGx1Z2luRGlyLCBwbHVnaW4sIHsgc2lsZW50IH0pO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbihyZXN1bHQucGx1Z2luRGlyLCBwbHVnaW4pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYztBQUV2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxPQUFPLGFBQWE7QUFDN0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUywwQkFBMEM7QUFDbkQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBb0QsMkJBQTJCLDBCQUEwQixpQkFBaUIsa0JBQWtCLDJCQUEyQiw0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
