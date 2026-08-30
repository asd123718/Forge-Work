import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../../../base/common/errors.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { IProgressService } from "../../../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { IPathService } from "../../../../../services/path/common/pathService.js";
import { ITerminalService } from "../../../../terminal/browser/terminal.js";
import { PluginInstallService } from "../../../browser/pluginInstallService.js";
import { IAgentPluginRepositoryService } from "../../../common/plugins/agentPluginRepositoryService.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IPluginMarketplaceService, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from "../../../common/plugins/pluginMarketplaceService.js";
suite("PluginInstallService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function makeMarketplaceRef(marketplace) {
    const ref = parseMarketplaceReference(marketplace);
    assert.ok(ref);
    return ref;
  }
  function createPlugin(overrides) {
    return {
      name: overrides.name ?? "test-plugin",
      description: overrides.description ?? "",
      version: overrides.version ?? "",
      source: overrides.source ?? "",
      sourceDescriptor: overrides.sourceDescriptor,
      marketplace: overrides.marketplace ?? "microsoft/vscode",
      marketplaceReference: overrides.marketplaceReference ?? makeMarketplaceRef("microsoft/vscode"),
      marketplaceType: overrides.marketplaceType ?? MarketplaceType.Copilot,
      readmeUri: overrides.readmeUri
    };
  }
  function createDefaults() {
    return {
      notifications: [],
      addedPlugins: [],
      dialogConfirmResult: true,
      fileExistsResult: true,
      ensureRepositoryResult: URI.file("/cache/agentPlugins/github.com/microsoft/vscode"),
      ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-package"),
      pluginSourceInstallUris: /* @__PURE__ */ new Map(),
      terminalCommands: [],
      terminalExitCode: 0,
      terminalCompletes: true,
      pullRepositoryCalls: [],
      updatePluginSourceCalls: [],
      marketplaceTrusted: true,
      strictMarketplacePolicyActive: false,
      installedPlugins: [],
      fetchedMarketplacePlugins: [],
      fetchMarketplaceCalls: [],
      autoUpdateByMarketplace: /* @__PURE__ */ new Map(),
      clearUpdatesAvailableCalls: 0,
      trustedMarketplaces: [],
      readPluginsResult: [],
      singlePluginManifestResult: void 0,
      quickPickResult: void 0,
      quickInputResult: void 0,
      configuredMarketplaces: [],
      updatedMarketplaces: void 0,
      resolveIsDirectory: true,
      isPluginDirectoryResult: false,
      configuredPluginLocations: {},
      updatedPluginLocations: void 0,
      userHome: "/home/user"
    };
  }
  function createService(stateOverrides) {
    const state = { ...createDefaults(), ...stateOverrides };
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IFileService, {
      exists: async (resource) => {
        if (typeof state.fileExistsResult === "function") {
          return state.fileExistsResult(resource);
        }
        return state.fileExistsResult;
      },
      resolve: async (resource) => ({ resource, isDirectory: state.resolveIsDirectory })
    });
    instantiationService.stub(INotificationService, {
      notify: (notification) => {
        state.notifications.push({ severity: notification.severity, message: notification.message });
        notification.actions?.primary?.forEach((action) => action.dispose());
        return void 0;
      }
    });
    instantiationService.stub(IDialogService, {
      confirm: async () => ({ confirmed: state.dialogConfirmResult })
    });
    instantiationService.stub(ITerminalService, {
      createTerminal: async () => {
        let finishedCallback;
        return {
          processReady: Promise.resolve(),
          dispose: () => {
          },
          runCommand: (command, _addNewLine) => {
            state.terminalCommands.push(command);
            if (finishedCallback) {
              finishedCallback({ id: "command", exitCode: state.terminalExitCode });
            }
          },
          capabilities: {
            get: () => state.terminalCompletes ? {
              onCommandFinished: (callback) => {
                finishedCallback = callback;
                return { dispose() {
                } };
              }
            } : void 0,
            onDidAddCommandDetectionCapability: () => ({ dispose() {
            } })
          }
        };
      },
      setActiveInstance: () => {
      }
    });
    instantiationService.stub(IProgressService, {
      withProgress: async (_options, callback) => callback()
    });
    instantiationService.stub(ILogService, new NullLogService());
    const makeMockPackageRepo = (kind) => ({
      kind,
      getCleanupTarget: () => URI.file("/mock-cleanup"),
      getInstallUri: () => URI.file("/mock"),
      ensure: async () => state.ensurePluginSourceResult,
      update: async () => true,
      getLabel: (d) => kind === PluginSourceKind.Npm ? d.package : d.package,
      runInstall: async (_installDir, pluginDir, plugin) => {
        if (!state.dialogConfirmResult) {
          return void 0;
        }
        const descriptor = plugin.sourceDescriptor;
        let args;
        if (kind === PluginSourceKind.Npm) {
          const npm = descriptor;
          const packageSpec = npm.version ? `${npm.package}@${npm.version}` : npm.package;
          args = ["npm", "install", "--prefix", _installDir.fsPath, packageSpec];
          if (npm.registry) {
            args.push("--registry", npm.registry);
          }
        } else {
          const pip = descriptor;
          const packageSpec = pip.version ? `${pip.package}==${pip.version}` : pip.package;
          args = ["pip", "install", "--target", _installDir.fsPath, packageSpec];
          if (pip.registry) {
            args.push("--index-url", pip.registry);
          }
        }
        const command = args.join(" ");
        state.terminalCommands.push(command);
        if (state.terminalExitCode !== 0) {
          state.notifications.push({ severity: 3, message: `Plugin installation command failed: Command exited with code ${state.terminalExitCode}` });
          return void 0;
        }
        const exists = typeof state.fileExistsResult === "function" ? await state.fileExistsResult(pluginDir) : state.fileExistsResult;
        if (!exists) {
          const label = kind === PluginSourceKind.Npm ? "npm" : "pip";
          const pkg = descriptor.package;
          state.notifications.push({ severity: 3, message: `${label} package '${pkg}' was not found after installation.` });
          return void 0;
        }
        return { pluginDir };
      }
    });
    const mockSourceRepos = /* @__PURE__ */ new Map([
      [PluginSourceKind.RelativePath, { kind: PluginSourceKind.RelativePath, getCleanupTarget: () => void 0, getInstallUri: () => {
        throw new Error();
      }, ensure: async () => {
        throw new Error();
      }, update: async () => {
        throw new Error();
      }, getLabel: (d) => d.path || "." }],
      [PluginSourceKind.GitHub, { kind: PluginSourceKind.GitHub, getCleanupTarget: () => URI.file("/mock"), getInstallUri: () => URI.file("/mock"), ensure: async () => URI.file("/mock"), update: async () => true, getLabel: (d) => d.repo }],
      [PluginSourceKind.GitUrl, { kind: PluginSourceKind.GitUrl, getCleanupTarget: () => URI.file("/mock"), getInstallUri: () => URI.file("/mock"), ensure: async () => URI.file("/mock"), update: async () => true, getLabel: (d) => d.url }],
      [PluginSourceKind.Npm, makeMockPackageRepo(PluginSourceKind.Npm)],
      [PluginSourceKind.Pip, makeMockPackageRepo(PluginSourceKind.Pip)]
    ]);
    instantiationService.stub(IAgentPluginRepositoryService, {
      getPluginInstallUri: (plugin) => {
        if (plugin.sourceDescriptor.kind !== PluginSourceKind.RelativePath) {
          return state.pluginSourceInstallUris.get(plugin.sourceDescriptor.kind) ?? URI.file(`/cache/agentPlugins/${plugin.sourceDescriptor.kind}/default`);
        }
        return URI.joinPath(state.ensureRepositoryResult, plugin.source);
      },
      getRepositoryUri: () => state.ensureRepositoryResult,
      ensureRepository: async (_marketplace, _options) => {
        return state.ensureRepositoryResult;
      },
      pullRepository: async (marketplace, options) => {
        state.pullRepositoryCalls.push({ marketplace, options });
      },
      getPluginSourceInstallUri: (descriptor) => {
        const key = descriptor.kind;
        return state.pluginSourceInstallUris.get(key) ?? URI.file(`/cache/agentPlugins/${key}/default`);
      },
      ensurePluginSource: async () => state.ensurePluginSourceResult,
      updatePluginSource: async (plugin, options) => {
        state.updatePluginSourceCalls.push({ plugin, options });
      },
      getPluginSource: (kind) => mockSourceRepos.get(kind),
      cleanupPluginSource: async () => {
      }
    });
    instantiationService.stub(IPluginMarketplaceService, {
      installedPlugins: observableValue("test.installedPlugins", state.installedPlugins),
      addInstalledPlugin: (uri, plugin) => {
        state.addedPlugins.push({ uri: uri.toString(), plugin });
      },
      isMarketplaceTrusted: () => state.marketplaceTrusted,
      isStrictMarketplacePolicyActive: () => state.strictMarketplacePolicyActive ?? false,
      isMarketplaceAutoUpdateEnabled: (ref) => state.autoUpdateByMarketplace.get(ref.canonicalId) ?? true,
      fetchMarketplacePlugins: async (_token, marketplaceIds) => {
        state.fetchMarketplaceCalls.push([...marketplaceIds ?? []]);
        return state.fetchedMarketplacePlugins.filter((plugin) => !marketplaceIds || marketplaceIds.has(plugin.marketplaceReference.canonicalId));
      },
      clearUpdatesAvailable: () => state.clearUpdatesAvailableCalls++,
      trustMarketplace: (ref) => {
        state.trustedMarketplaces.push(ref.canonicalId);
      },
      readPluginsFromDirectory: async () => state.readPluginsResult,
      readSinglePluginManifest: async () => state.singlePluginManifestResult,
      isPluginDirectory: async () => state.isPluginDirectoryResult
    });
    instantiationService.stub(IConfigurationService, {
      getValue: (key) => {
        if (key === ChatConfiguration.PluginMarketplaces) {
          return state.configuredMarketplaces;
        }
        if (key === ChatConfiguration.PluginLocations) {
          return state.configuredPluginLocations;
        }
        return void 0;
      },
      inspect: (key) => {
        if (key === ChatConfiguration.PluginMarketplaces) {
          return { userValue: state.configuredMarketplaces, defaultValue: void 0, policyValue: void 0 };
        }
        if (key === ChatConfiguration.PluginLocations) {
          return { userValue: state.configuredPluginLocations, defaultValue: void 0, policyValue: void 0 };
        }
        return { userValue: void 0, defaultValue: void 0, policyValue: void 0 };
      },
      updateValue: async (key, value) => {
        if (key === ChatConfiguration.PluginMarketplaces) {
          state.updatedMarketplaces = value;
        }
        if (key === ChatConfiguration.PluginLocations) {
          state.updatedPluginLocations = value;
        }
      }
    });
    instantiationService.stub(IPathService, {
      userHome: async () => URI.file(state.userHome)
    });
    instantiationService.stub(IQuickInputService, {
      input: async () => state.quickInputResult,
      pick: async (picks) => {
        if (!state.quickPickResult) {
          return void 0;
        }
        return picks.find((p) => p.label === state.quickPickResult.label);
      }
    });
    const service = instantiationService.createInstance(PluginInstallService);
    return { service, state };
  }
  suite("getPluginInstallUri", () => {
    test("delegates to getPluginInstallUri for relative-path plugins", () => {
      const { service } = createService();
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      const uri = service.getPluginInstallUri(plugin);
      assert.strictEqual(uri.path, "/cache/agentPlugins/github.com/microsoft/vscode/plugins/myPlugin");
    });
    test("delegates to getPluginSourceInstallUri for npm plugins", () => {
      const npmUri = URI.file("/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg");
      const { service } = createService({
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["npm", npmUri]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      const uri = service.getPluginInstallUri(plugin);
      assert.strictEqual(uri.path, npmUri.path);
    });
    test("delegates to getPluginSourceInstallUri for pip plugins", () => {
      const pipUri = URI.file("/cache/agentPlugins/pip/my-pkg");
      const { service } = createService({
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["pip", pipUri]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg" }
      });
      const uri = service.getPluginInstallUri(plugin);
      assert.strictEqual(uri.path, pipUri.path);
    });
    test("delegates to getPluginSourceInstallUri for github plugins", () => {
      const ghUri = URI.file("/cache/agentPlugins/github.com/owner/repo");
      const { service } = createService({
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["github", ghUri]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" }
      });
      const uri = service.getPluginInstallUri(plugin);
      assert.strictEqual(uri.path, ghUri.path);
    });
  });
  suite("installPlugin \u2014 relative path", () => {
    test("installs a relative-path plugin when directory exists", async () => {
      const { service, state } = createService();
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.ok(state.addedPlugins[0].uri.includes("plugins/myPlugin"));
      assert.strictEqual(state.notifications.length, 0);
    });
    test("notifies error when plugin directory does not exist", async () => {
      const { service, state } = createService({ fileExistsResult: false });
      const plugin = createPlugin({
        source: "plugins/missing",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/missing" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.notifications.length, 1);
      assert.ok(state.notifications[0].message.includes("not found"));
    });
    test("does not install when ensureRepository throws", async () => {
      const { state } = createService();
      const instantiationService = store.add(new TestInstantiationService());
      const repoService = {
        ensureRepository: async () => {
          throw new Error("clone failed");
        },
        getPluginInstallUri: () => URI.file("/x"),
        getPluginSourceInstallUri: () => URI.file("/x")
      };
      instantiationService.stub(IAgentPluginRepositoryService, repoService);
      instantiationService.stub(IFileService, { exists: async () => true });
      instantiationService.stub(INotificationService, { notify: (n) => {
        state.notifications.push(n);
      } });
      instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed: true }) });
      instantiationService.stub(ITerminalService, {});
      instantiationService.stub(IProgressService, { withProgress: async (_o, cb) => cb() });
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(IPluginMarketplaceService, { addInstalledPlugin: () => {
      } });
      instantiationService.stub(IPluginMarketplaceService, "isMarketplaceTrusted", () => true);
      instantiationService.stub(IPluginMarketplaceService, "trustMarketplace", () => {
      });
      const svc = instantiationService.createInstance(PluginInstallService);
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      await svc.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
  });
  suite("installPlugin \u2014 git sources", () => {
    test("installs a GitHub plugin when source exists after clone", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/repo")
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.notifications.length, 0);
    });
    test("installs a GitUrl plugin when source exists after clone", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/example.com/repo")
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitUrl, url: "https://example.com/repo.git" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.notifications.length, 0);
    });
    test("notifies error when cloned directory does not exist", async () => {
      const { service, state } = createService({
        fileExistsResult: false,
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/repo")
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.notifications.length, 1);
      assert.ok(state.notifications[0].message.includes("not found"));
    });
  });
  suite("installPlugin \u2014 npm", () => {
    test("runs npm install and registers plugin on success", async () => {
      const npmInstallUri = URI.file("/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg");
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["npm", npmInstallUri]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("npm"));
      assert.ok(state.terminalCommands[0].includes("install"));
      assert.ok(state.terminalCommands[0].includes("my-pkg"));
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.notifications.length, 0);
    });
    test("includes version in npm install command", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["npm", URI.file("/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg", version: "1.2.3" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("my-pkg@1.2.3"));
    });
    test("includes registry in npm install command", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["npm", URI.file("/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg", registry: "https://custom.registry.com" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("--registry"));
      assert.ok(state.terminalCommands[0].includes("https://custom.registry.com"));
    });
    test("does not install when user declines confirmation", async () => {
      const { service, state } = createService({ dialogConfirmResult: false });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 0);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("notifies error when npm package directory not found after install", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        // exists returns true for ensurePluginSource but false for the final check
        fileExistsResult: false
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.notifications.length, 1);
      assert.ok(state.notifications[0].message.includes("not found"));
    });
    test("notifies error when terminal command fails with non-zero exit code", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        terminalExitCode: 1
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.notifications.length, 1);
      assert.ok(state.notifications[0].message.includes("failed"));
    });
  });
  suite("installPlugin \u2014 pip", () => {
    test("runs pip install and registers plugin on success", async () => {
      const pipInstallUri = URI.file("/cache/agentPlugins/pip/my-pkg");
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/pip/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["pip", pipInstallUri]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("pip"));
      assert.ok(state.terminalCommands[0].includes("install"));
      assert.ok(state.terminalCommands[0].includes("my-pkg"));
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.notifications.length, 0);
    });
    test("includes version with == syntax in pip install command", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/pip/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["pip", URI.file("/cache/agentPlugins/pip/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg", version: "2.0.0" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("my-pkg==2.0.0"));
    });
    test("includes registry with --index-url in pip install command", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/pip/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["pip", URI.file("/cache/agentPlugins/pip/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg", registry: "https://pypi.custom.com/simple" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("--index-url"));
      assert.ok(state.terminalCommands[0].includes("https://pypi.custom.com/simple"));
    });
    test("does not install when user declines confirmation", async () => {
      const { service, state } = createService({ dialogConfirmResult: false });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 0);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("notifies error when pip package directory not found after install", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/pip/my-pkg"),
        fileExistsResult: false
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.notifications.length, 1);
      assert.ok(state.notifications[0].message.includes("not found"));
    });
  });
  suite("updatePlugin", () => {
    test("calls updatePluginSource for relative-path plugins", async () => {
      const { service, state } = createService();
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      await service.updatePlugin(plugin);
      assert.strictEqual(state.updatePluginSourceCalls.length, 1);
    });
    test("calls updatePluginSource for GitHub plugins", async () => {
      const { service, state } = createService();
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" }
      });
      await service.updatePlugin(plugin);
      assert.strictEqual(state.updatePluginSourceCalls.length, 1);
    });
    test("calls updatePluginSource for GitUrl plugins", async () => {
      const { service, state } = createService();
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitUrl, url: "https://example.com/repo.git" }
      });
      await service.updatePlugin(plugin);
      assert.strictEqual(state.updatePluginSourceCalls.length, 1);
    });
    test("blocks direct updates when the strict marketplace policy disallows the source", async () => {
      const { service, state } = createService({
        strictMarketplacePolicyActive: true,
        marketplaceTrusted: false
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" }
      });
      const updated = await service.updatePlugin(plugin);
      assert.deepStrictEqual({
        updated,
        updateCalls: state.updatePluginSourceCalls.length,
        notifications: state.notifications.map((notification) => notification.message)
      }, {
        updated: false,
        updateCalls: 0,
        notifications: ["Updates from 'microsoft/vscode' are blocked by your organization's policy."]
      });
    });
    test("re-installs for npm plugin updates", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["npm", URI.file("/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      await service.updatePlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("npm"));
    });
    test("does not report npm plugin as updated when install is declined", async () => {
      const { service, state } = createService({
        dialogConfirmResult: false,
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/npm/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["npm", URI.file("/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "my-pkg" }
      });
      const updated = await service.updatePlugin(plugin);
      assert.strictEqual(updated, false);
      assert.strictEqual(state.terminalCommands.length, 0);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("re-installs for pip plugin updates", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/pip/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["pip", URI.file("/cache/agentPlugins/pip/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg" }
      });
      await service.updatePlugin(plugin);
      assert.strictEqual(state.terminalCommands.length, 1);
      assert.ok(state.terminalCommands[0].includes("pip"));
    });
    test("does not report pip plugin as updated when install is declined", async () => {
      const { service, state } = createService({
        dialogConfirmResult: false,
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/pip/my-pkg"),
        pluginSourceInstallUris: /* @__PURE__ */ new Map([["pip", URI.file("/cache/agentPlugins/pip/my-pkg")]])
      });
      const plugin = createPlugin({
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pkg" }
      });
      const updated = await service.updatePlugin(plugin);
      assert.strictEqual(updated, false);
      assert.strictEqual(state.terminalCommands.length, 0);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
  });
  suite("updateAllPlugins", () => {
    function installedPlugin(name, marketplace) {
      const marketplaceReference = makeMarketplaceRef(marketplace);
      const plugin = createPlugin({
        name,
        marketplace,
        marketplaceReference,
        source: `plugins/${name}`,
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: `plugins/${name}` }
      });
      return { pluginUri: URI.file(`/plugins/${name}`), plugin };
    }
    test("updates only the targeted marketplace", async () => {
      const first = installedPlugin("first", "microsoft/first");
      const second = installedPlugin("second", "microsoft/second");
      const { service, state } = createService({ installedPlugins: [first, second] });
      await service.updateAllPlugins({
        silent: true,
        automatic: true,
        marketplaceIds: /* @__PURE__ */ new Set([first.plugin.marketplaceReference.canonicalId])
      }, CancellationToken.None);
      assert.deepStrictEqual({
        pulled: state.pullRepositoryCalls.map((call) => call.marketplace.canonicalId),
        fetched: state.fetchMarketplaceCalls
      }, {
        pulled: [first.plugin.marketplaceReference.canonicalId],
        fetched: [[first.plugin.marketplaceReference.canonicalId]]
      });
    });
    test("rechecks managed auto-update policy before an automatic update", async () => {
      const installed = installedPlugin("blocked", "microsoft/blocked");
      const { service, state } = createService({
        installedPlugins: [installed],
        autoUpdateByMarketplace: /* @__PURE__ */ new Map([[installed.plugin.marketplaceReference.canonicalId, false]])
      });
      await service.updateAllPlugins({
        silent: true,
        automatic: true,
        marketplaceIds: /* @__PURE__ */ new Set([installed.plugin.marketplaceReference.canonicalId])
      }, CancellationToken.None);
      assert.deepStrictEqual(state.pullRepositoryCalls, []);
      assert.deepStrictEqual(state.fetchMarketplaceCalls, []);
    });
    test("blocks updates when the strict marketplace policy disallows the source", async () => {
      const installed = installedPlugin("blocked", "microsoft/blocked");
      const { service, state } = createService({
        installedPlugins: [installed],
        strictMarketplacePolicyActive: true,
        marketplaceTrusted: false
      });
      const result = await service.updateAllPlugins({ silent: true }, CancellationToken.None);
      assert.deepStrictEqual(result.failedNames, [installed.plugin.marketplaceReference.displayLabel]);
      assert.deepStrictEqual(state.pullRepositoryCalls, []);
    });
  });
  suite("installPlugin \u2014 marketplace trust", () => {
    test("skips trust prompt when marketplace is already trusted", async () => {
      const { service, state } = createService({ marketplaceTrusted: true });
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.trustedMarketplaces.length, 0, "should not re-trust");
    });
    test("shows trust prompt and installs when user confirms", async () => {
      const { service, state } = createService({ marketplaceTrusted: false, dialogConfirmResult: true });
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      await service.installPlugin(plugin);
      assert.strictEqual(state.trustedMarketplaces.length, 1);
      assert.strictEqual(state.addedPlugins.length, 1);
    });
    test("does not install when user declines trust", async () => {
      const { service, state } = createService({ marketplaceTrusted: false, dialogConfirmResult: false });
      const plugin = createPlugin({
        source: "plugins/myPlugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/myPlugin" }
      });
      await assert.rejects(() => service.installPlugin(plugin), (err) => isCancellationError(err));
      assert.strictEqual(state.trustedMarketplaces.length, 0);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("trust prompt applies to all source kinds", async () => {
      const { service, state } = createService({ marketplaceTrusted: false, dialogConfirmResult: false });
      const kinds = [
        { kind: PluginSourceKind.RelativePath, path: "p" },
        { kind: PluginSourceKind.GitHub, repo: "owner/repo" },
        { kind: PluginSourceKind.GitUrl, url: "https://example.com/repo.git" },
        { kind: PluginSourceKind.Npm, package: "my-pkg" },
        { kind: PluginSourceKind.Pip, package: "my-pkg" }
      ];
      for (const sourceDescriptor of kinds) {
        await assert.rejects(() => service.installPlugin(createPlugin({ sourceDescriptor })), (err) => isCancellationError(err));
      }
      assert.strictEqual(state.addedPlugins.length, 0, "no plugins should be installed when trust is declined");
    });
  });
  suite("installPluginFromSource", () => {
    test("rejects invalid source strings", async () => {
      const { service, state } = createService();
      const result = await service.installPluginFromSource("not a valid source");
      assert.strictEqual(result.success, false);
      assert.ok(result.message);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("validatePluginSource accepts git and local sources and rejects garbage", () => {
      const { service } = createService();
      assert.strictEqual(service.validatePluginSource("owner/repo"), void 0);
      assert.strictEqual(service.validatePluginSource("https://github.com/owner/repo.git"), void 0);
      assert.strictEqual(service.validatePluginSource("file:///some/path"), void 0);
      assert.strictEqual(service.validatePluginSource("/abs/path"), void 0);
      assert.strictEqual(service.validatePluginSource("~/plugins/foo"), void 0);
      assert.ok(service.validatePluginSource("not a valid source"));
    });
    test("installs a local folder marketplace and registers it under chat.plugins.marketplaces", async () => {
      const ref = makeMarketplaceRef("file:///some/marketplace");
      const discoveredPlugin = createPlugin({
        name: "local-marketplace-plugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.OpenPlugin
      });
      const { service, state } = createService({
        readPluginsResult: [discoveredPlugin]
      });
      await service.installPluginFromSource("file:///some/marketplace");
      assert.strictEqual(state.notifications.length, 0);
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.addedPlugins[0].plugin.name, "local-marketplace-plugin");
      assert.deepStrictEqual(state.updatedMarketplaces, ["file:///some/marketplace"]);
      assert.strictEqual(state.updatedPluginLocations, void 0);
    });
    test("does not persist a local marketplace to config when trust is declined", async () => {
      const ref = makeMarketplaceRef("file:///some/marketplace");
      const discoveredPlugin = createPlugin({
        name: "local-marketplace-plugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.OpenPlugin
      });
      const { service, state } = createService({
        readPluginsResult: [discoveredPlugin],
        marketplaceTrusted: false,
        dialogConfirmResult: false
      });
      const result = await service.installPluginFromSource("file:///some/marketplace");
      assert.strictEqual(result.success, false);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.updatedMarketplaces, void 0);
    });
    test("registers a local folder standalone plugin under chat.pluginLocations", async () => {
      const { service, state } = createService({
        readPluginsResult: [],
        isPluginDirectoryResult: true
      });
      await service.installPluginFromSource("/abs/my-plugin");
      assert.strictEqual(state.notifications.length, 0);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.deepStrictEqual(state.updatedPluginLocations, { "/abs/my-plugin": true });
      assert.strictEqual(state.updatedMarketplaces, void 0);
    });
    test("expands ~ paths but persists the original form in chat.pluginLocations", async () => {
      const { service, state } = createService({
        readPluginsResult: [],
        isPluginDirectoryResult: true,
        userHome: "/home/user"
      });
      await service.installPluginFromSource("~/my-plugin");
      assert.deepStrictEqual(state.updatedPluginLocations, { "~/my-plugin": true });
    });
    test("registers a file:// standalone plugin using its filesystem path", async () => {
      const { service, state } = createService({
        readPluginsResult: [],
        isPluginDirectoryResult: true
      });
      await service.installPluginFromSource("file:///some/plugin");
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.ok(state.updatedPluginLocations);
      assert.deepStrictEqual(Object.values(state.updatedPluginLocations), [true]);
      assert.strictEqual(Object.keys(state.updatedPluginLocations).length, 1);
    });
    test("shows error when local folder does not exist", async () => {
      const { service, state } = createService({
        resolveIsDirectory: false
      });
      const result = await service.installPluginFromSource("/abs/missing");
      assert.strictEqual(result.success, false);
      assert.ok(result.message);
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.updatedPluginLocations, void 0);
    });
    test("shows error when local folder is neither a marketplace nor a plugin", async () => {
      const { service, state } = createService({
        readPluginsResult: [],
        isPluginDirectoryResult: false
      });
      const result = await service.installPluginFromSource("/abs/empty");
      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes("No plugin or marketplace found"));
      assert.strictEqual(state.addedPlugins.length, 0);
      assert.strictEqual(state.updatedPluginLocations, void 0);
    });
    test("installs single plugin from GitHub shorthand with marketplace.json", async () => {
      const ref = makeMarketplaceRef("owner/my-plugin");
      const discoveredPlugin = createPlugin({
        name: "my-discovered-plugin",
        description: "A discovered plugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.OpenPlugin
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/my-plugin"),
        readPluginsResult: [discoveredPlugin]
      });
      await service.installPluginFromSource("owner/my-plugin");
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.addedPlugins[0].plugin.name, "my-discovered-plugin");
    });
    test("shows error when no marketplace.json found", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/cool-tool"),
        readPluginsResult: []
      });
      const result = await service.installPluginFromSource("owner/cool-tool");
      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes("No plugins found"));
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("shows quick pick for multi-plugin repos", async () => {
      const ref = makeMarketplaceRef("owner/multi-repo");
      const pluginA = createPlugin({
        name: "plugin-a",
        source: "plugins/a",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/a" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref
      });
      const pluginB = createPlugin({
        name: "plugin-b",
        source: "plugins/b",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/b" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/multi-repo"),
        readPluginsResult: [pluginA, pluginB],
        quickPickResult: { label: "plugin-b" }
      });
      await service.installPluginFromSource("owner/multi-repo");
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.addedPlugins[0].plugin.name, "plugin-b");
      assert.ok(state.addedPlugins[0].uri.includes("plugins/b"));
    });
    test("does not install when quick pick is cancelled", async () => {
      const ref = makeMarketplaceRef("owner/multi-repo");
      const pluginA = createPlugin({
        name: "plugin-a",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/a" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref
      });
      const pluginB = createPlugin({
        name: "plugin-b",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/b" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/multi-repo"),
        readPluginsResult: [pluginA, pluginB],
        quickPickResult: void 0
      });
      await service.installPluginFromSource("owner/multi-repo");
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("does not install when trust is declined", async () => {
      const { service, state } = createService({
        marketplaceTrusted: false,
        dialogConfirmResult: false,
        readPluginsResult: []
      });
      await service.installPluginFromSource("owner/repo");
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("shows error when no plugins found in git URL", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/my-tool"),
        readPluginsResult: []
      });
      const result = await service.installPluginFromSource("https://github.com/owner/my-tool.git");
      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes("No plugins found"));
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("shows error when clone directory does not exist", async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/missing"),
        fileExistsResult: false
      });
      const result = await service.installPluginFromSource("owner/missing");
      assert.strictEqual(result.success, false);
      assert.ok(result.message);
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test("adds marketplace to config after installing single plugin", async () => {
      const ref = makeMarketplaceRef("owner/my-plugin");
      const discoveredPlugin = createPlugin({
        name: "my-discovered-plugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.OpenPlugin
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/my-plugin"),
        readPluginsResult: [discoveredPlugin]
      });
      await service.installPluginFromSource("owner/my-plugin");
      assert.deepStrictEqual(state.updatedMarketplaces, ["owner/my-plugin"]);
    });
    test("adds marketplace to config after picking from multi-plugin repo", async () => {
      const ref = makeMarketplaceRef("owner/multi-repo");
      const pluginA = createPlugin({
        name: "plugin-a",
        source: "plugins/a",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/a" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref
      });
      const pluginB = createPlugin({
        name: "plugin-b",
        source: "plugins/b",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/b" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/multi-repo"),
        readPluginsResult: [pluginA, pluginB],
        quickPickResult: { label: "plugin-a" }
      });
      await service.installPluginFromSource("owner/multi-repo");
      assert.deepStrictEqual(state.updatedMarketplaces, ["owner/multi-repo"]);
    });
    test("does not duplicate marketplace in config", async () => {
      const ref = makeMarketplaceRef("owner/my-plugin");
      const discoveredPlugin = createPlugin({
        name: "my-discovered-plugin",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.OpenPlugin
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/my-plugin"),
        readPluginsResult: [discoveredPlugin],
        configuredMarketplaces: ["owner/my-plugin"]
      });
      await service.installPluginFromSource("owner/my-plugin");
      assert.strictEqual(state.updatedMarketplaces, void 0);
    });
    test("falls back to single-plugin manifest when no marketplace.json exists", async () => {
      const ref = makeMarketplaceRef("owner/single-plugin-repo");
      const singlePlugin = createPlugin({
        name: "single-plugin-repo",
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/single-plugin-repo" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.Claude
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/single-plugin-repo"),
        readPluginsResult: [],
        singlePluginManifestResult: singlePlugin
      });
      await service.installPluginFromSource("owner/single-plugin-repo");
      assert.strictEqual(state.addedPlugins.length, 1);
      assert.strictEqual(state.addedPlugins[0].plugin.name, "single-plugin-repo");
      assert.strictEqual(state.notifications.length, 0);
      assert.strictEqual(state.updatedMarketplaces, void 0);
    });
    test("reports error when single-plugin manifest name does not match options.plugin", async () => {
      const ref = makeMarketplaceRef("owner/single-plugin-repo");
      const singlePlugin = createPlugin({
        name: "actual-name",
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/single-plugin-repo" },
        marketplace: ref.displayLabel,
        marketplaceReference: ref,
        marketplaceType: MarketplaceType.Claude
      });
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/single-plugin-repo"),
        readPluginsResult: [],
        singlePluginManifestResult: singlePlugin
      });
      const result = await service.installPluginFromSource("owner/single-plugin-repo", { plugin: "requested-name" });
      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes("not found"));
      assert.strictEqual(state.addedPlugins.length, 0);
    });
    test('still reports "no plugins found" when neither marketplace.json nor single-plugin manifest exists', async () => {
      const { service, state } = createService({
        ensurePluginSourceResult: URI.file("/cache/agentPlugins/github.com/owner/empty-repo"),
        readPluginsResult: [],
        singlePluginManifestResult: void 0
      });
      const result = await service.installPluginFromSource("owner/empty-repo");
      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes("No plugins found"));
      assert.strictEqual(state.addedPlugins.length, 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHBsdWdpbnNcXHBsdWdpbkluc3RhbGxTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFBsdWdpbkluc3RhbGxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wbHVnaW5JbnN0YWxsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSwgSUVuc3VyZVJlcG9zaXRvcnlPcHRpb25zLCBJUHVsbFJlcG9zaXRvcnlPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSU1hcmtldHBsYWNlSW5zdGFsbGVkUGx1Z2luLCBJTWFya2V0cGxhY2VQbHVnaW4sIElNYXJrZXRwbGFjZVJlZmVyZW5jZSwgSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSwgSVBsdWdpblNvdXJjZURlc2NyaXB0b3IsIE1hcmtldHBsYWNlVHlwZSwgcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSwgUGx1Z2luU291cmNlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGx1Z2luU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luU291cmNlLmpzJztcblxuc3VpdGUoJ1BsdWdpbkluc3RhbGxTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLSBGYWN0b3J5IGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGZ1bmN0aW9uIG1ha2VNYXJrZXRwbGFjZVJlZihtYXJrZXRwbGFjZTogc3RyaW5nKTogSU1hcmtldHBsYWNlUmVmZXJlbmNlIHtcblx0XHRjb25zdCByZWYgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKG1hcmtldHBsYWNlKTtcblx0XHRhc3NlcnQub2socmVmKTtcblx0XHRyZXR1cm4gcmVmITtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVBsdWdpbihvdmVycmlkZXM6IFBhcnRpYWw8SU1hcmtldHBsYWNlUGx1Z2luPiAmIHsgc291cmNlRGVzY3JpcHRvcjogSVBsdWdpblNvdXJjZURlc2NyaXB0b3IgfSk6IElNYXJrZXRwbGFjZVBsdWdpbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IG92ZXJyaWRlcy5uYW1lID8/ICd0ZXN0LXBsdWdpbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogb3ZlcnJpZGVzLmRlc2NyaXB0aW9uID8/ICcnLFxuXHRcdFx0dmVyc2lvbjogb3ZlcnJpZGVzLnZlcnNpb24gPz8gJycsXG5cdFx0XHRzb3VyY2U6IG92ZXJyaWRlcy5zb3VyY2UgPz8gJycsXG5cdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiBvdmVycmlkZXMuc291cmNlRGVzY3JpcHRvcixcblx0XHRcdG1hcmtldHBsYWNlOiBvdmVycmlkZXMubWFya2V0cGxhY2UgPz8gJ21pY3Jvc29mdC92c2NvZGUnLFxuXHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IG92ZXJyaWRlcy5tYXJrZXRwbGFjZVJlZmVyZW5jZSA/PyBtYWtlTWFya2V0cGxhY2VSZWYoJ21pY3Jvc29mdC92c2NvZGUnKSxcblx0XHRcdG1hcmtldHBsYWNlVHlwZTogb3ZlcnJpZGVzLm1hcmtldHBsYWNlVHlwZSA/PyBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHRcdHJlYWRtZVVyaTogb3ZlcnJpZGVzLnJlYWRtZVVyaSxcblx0XHR9O1xuXHR9XG5cblx0Ly8gLS0tIE1vY2sgdHJhY2tpbmcgdHlwZXMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0aW50ZXJmYWNlIE1vY2tTdGF0ZSB7XG5cdFx0bm90aWZpY2F0aW9uczogeyBzZXZlcml0eTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmcgfVtdO1xuXHRcdGFkZGVkUGx1Z2luczogeyB1cmk6IHN0cmluZzsgcGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4gfVtdO1xuXHRcdGRpYWxvZ0NvbmZpcm1SZXN1bHQ6IGJvb2xlYW47XG5cdFx0ZmlsZUV4aXN0c1Jlc3VsdDogYm9vbGVhbiB8ICgodXJpOiBVUkkpID0+IFByb21pc2U8Ym9vbGVhbj4pO1xuXHRcdGVuc3VyZVJlcG9zaXRvcnlSZXN1bHQ6IFVSSTtcblx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSTtcblx0XHQvKiogUGx1Z2luIHNvdXJjZSBpbnN0YWxsIFVSSSwgcGVyIGtpbmQgKi9cblx0XHRwbHVnaW5Tb3VyY2VJbnN0YWxsVXJpczogTWFwPHN0cmluZywgVVJJPjtcblx0XHQvKiogVGhlIGNvbW1hbmRzIHRoYXQgd2VyZSBzZW50IHRvIHRoZSB0ZXJtaW5hbCAqL1xuXHRcdHRlcm1pbmFsQ29tbWFuZHM6IHN0cmluZ1tdO1xuXHRcdC8qKiBTaW11bGF0ZWQgZXhpdCBjb2RlIGZyb20gdGVybWluYWwgKi9cblx0XHR0ZXJtaW5hbEV4aXRDb2RlOiBudW1iZXI7XG5cdFx0LyoqIFdoZXRoZXIgdGhlIHRlcm1pbmFsIHJlc29sdmVzIHRoZSBjb21tYW5kIGNvbXBsZXRpb24gYXQgYWxsICovXG5cdFx0dGVybWluYWxDb21wbGV0ZXM6IGJvb2xlYW47XG5cdFx0cHVsbFJlcG9zaXRvcnlDYWxsczogeyBtYXJrZXRwbGFjZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlOyBvcHRpb25zPzogSVB1bGxSZXBvc2l0b3J5T3B0aW9ucyB9W107XG5cdFx0dXBkYXRlUGx1Z2luU291cmNlQ2FsbHM6IHsgcGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW47IG9wdGlvbnM/OiBJUHVsbFJlcG9zaXRvcnlPcHRpb25zIH1bXTtcblx0XHQvKiogV2hldGhlciB0aGUgbWFya2V0cGxhY2UgaXMgYWxyZWFkeSB0cnVzdGVkICovXG5cdFx0bWFya2V0cGxhY2VUcnVzdGVkOiBib29sZWFuO1xuXHRcdC8qKiBXaGV0aGVyIHRoZSBzdHJpY3QtbWFya2V0cGxhY2UgZW50ZXJwcmlzZSBwb2xpY3kgaXMgYWN0aXZlICovXG5cdFx0c3RyaWN0TWFya2V0cGxhY2VQb2xpY3lBY3RpdmU/OiBib29sZWFuO1xuXHRcdGluc3RhbGxlZFBsdWdpbnM6IElNYXJrZXRwbGFjZUluc3RhbGxlZFBsdWdpbltdO1xuXHRcdGZldGNoZWRNYXJrZXRwbGFjZVBsdWdpbnM6IElNYXJrZXRwbGFjZVBsdWdpbltdO1xuXHRcdGZldGNoTWFya2V0cGxhY2VDYWxsczogc3RyaW5nW11bXTtcblx0XHRhdXRvVXBkYXRlQnlNYXJrZXRwbGFjZTogTWFwPHN0cmluZywgYm9vbGVhbj47XG5cdFx0Y2xlYXJVcGRhdGVzQXZhaWxhYmxlQ2FsbHM6IG51bWJlcjtcblx0XHQvKiogQ2Fub25pY2FsIElEcyB0aGF0IHdlcmUgdHJ1c3RlZCB2aWEgdHJ1c3RNYXJrZXRwbGFjZSgpICovXG5cdFx0dHJ1c3RlZE1hcmtldHBsYWNlczogc3RyaW5nW107XG5cdFx0LyoqIFBsdWdpbnMgcmV0dXJuZWQgYnkgcmVhZFBsdWdpbnNGcm9tRGlyZWN0b3J5ICovXG5cdFx0cmVhZFBsdWdpbnNSZXN1bHQ6IElNYXJrZXRwbGFjZVBsdWdpbltdO1xuXHRcdC8qKiBQbHVnaW4gcmV0dXJuZWQgYnkgcmVhZFNpbmdsZVBsdWdpbk1hbmlmZXN0IChzaW5nbGUtcGx1Z2luIHJlcG8gZmFsbGJhY2spICovXG5cdFx0c2luZ2xlUGx1Z2luTWFuaWZlc3RSZXN1bHQ6IElNYXJrZXRwbGFjZVBsdWdpbiB8IHVuZGVmaW5lZDtcblx0XHQvKiogUmVzdWx0IG9mIHRoZSBxdWljayBwaWNrIGRpYWxvZyAqL1xuXHRcdHF1aWNrUGlja1Jlc3VsdDogeyBsYWJlbDogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdFx0LyoqIFJlc3VsdCBvZiB0aGUgcXVpY2sgaW5wdXQgZGlhbG9nICovXG5cdFx0cXVpY2tJbnB1dFJlc3VsdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdC8qKiBDdXJyZW50IGNvbmZpZ3VyZWQgbWFya2V0cGxhY2UgdmFsdWVzICovXG5cdFx0Y29uZmlndXJlZE1hcmtldHBsYWNlczogc3RyaW5nW107XG5cdFx0LyoqIFVwZGF0ZWQgbWFya2V0cGxhY2UgY29uZmlnIHZhbHVlcyAqL1xuXHRcdHVwZGF0ZWRNYXJrZXRwbGFjZXM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRcdC8qKiBXaGV0aGVyIHJlYWRSZXN1bHQgcmVzb2x2ZXMgdG8gYSBkaXJlY3RvcnkgKElGaWxlU2VydmljZS5yZXNvbHZlKSAqL1xuXHRcdHJlc29sdmVJc0RpcmVjdG9yeTogYm9vbGVhbjtcblx0XHQvKiogV2hldGhlciB0aGUgZGlyZWN0b3J5IGlzIGEgc3RhbmRhbG9uZSBwbHVnaW4gKGlzUGx1Z2luRGlyZWN0b3J5KSAqL1xuXHRcdGlzUGx1Z2luRGlyZWN0b3J5UmVzdWx0OiBib29sZWFuO1xuXHRcdC8qKiBDdXJyZW50IGNvbmZpZ3VyZWQgcGx1Z2luIGxvY2F0aW9uIHZhbHVlcyAqL1xuXHRcdGNvbmZpZ3VyZWRQbHVnaW5Mb2NhdGlvbnM6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+O1xuXHRcdC8qKiBVcGRhdGVkIHBsdWdpbiBsb2NhdGlvbiBjb25maWcgdmFsdWVzICovXG5cdFx0dXBkYXRlZFBsdWdpbkxvY2F0aW9uczogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cdFx0LyoqIFVzZXIgaG9tZSBkaXJlY3RvcnkgdXNlZCB0byBleHBhbmQgYH5gIHBhdGhzICovXG5cdFx0dXNlckhvbWU6IHN0cmluZztcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZURlZmF1bHRzKCk6IE1vY2tTdGF0ZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5vdGlmaWNhdGlvbnM6IFtdLFxuXHRcdFx0YWRkZWRQbHVnaW5zOiBbXSxcblx0XHRcdGRpYWxvZ0NvbmZpcm1SZXN1bHQ6IHRydWUsXG5cdFx0XHRmaWxlRXhpc3RzUmVzdWx0OiB0cnVlLFxuXHRcdFx0ZW5zdXJlUmVwb3NpdG9yeVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlJyksXG5cdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL25wbS9teS1wYWNrYWdlJyksXG5cdFx0XHRwbHVnaW5Tb3VyY2VJbnN0YWxsVXJpczogbmV3IE1hcCgpLFxuXHRcdFx0dGVybWluYWxDb21tYW5kczogW10sXG5cdFx0XHR0ZXJtaW5hbEV4aXRDb2RlOiAwLFxuXHRcdFx0dGVybWluYWxDb21wbGV0ZXM6IHRydWUsXG5cdFx0XHRwdWxsUmVwb3NpdG9yeUNhbGxzOiBbXSxcblx0XHRcdHVwZGF0ZVBsdWdpblNvdXJjZUNhbGxzOiBbXSxcblx0XHRcdG1hcmtldHBsYWNlVHJ1c3RlZDogdHJ1ZSxcblx0XHRcdHN0cmljdE1hcmtldHBsYWNlUG9saWN5QWN0aXZlOiBmYWxzZSxcblx0XHRcdGluc3RhbGxlZFBsdWdpbnM6IFtdLFxuXHRcdFx0ZmV0Y2hlZE1hcmtldHBsYWNlUGx1Z2luczogW10sXG5cdFx0XHRmZXRjaE1hcmtldHBsYWNlQ2FsbHM6IFtdLFxuXHRcdFx0YXV0b1VwZGF0ZUJ5TWFya2V0cGxhY2U6IG5ldyBNYXAoKSxcblx0XHRcdGNsZWFyVXBkYXRlc0F2YWlsYWJsZUNhbGxzOiAwLFxuXHRcdFx0dHJ1c3RlZE1hcmtldHBsYWNlczogW10sXG5cdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW10sXG5cdFx0XHRzaW5nbGVQbHVnaW5NYW5pZmVzdFJlc3VsdDogdW5kZWZpbmVkLFxuXHRcdFx0cXVpY2tQaWNrUmVzdWx0OiB1bmRlZmluZWQsXG5cdFx0XHRxdWlja0lucHV0UmVzdWx0OiB1bmRlZmluZWQsXG5cdFx0XHRjb25maWd1cmVkTWFya2V0cGxhY2VzOiBbXSxcblx0XHRcdHVwZGF0ZWRNYXJrZXRwbGFjZXM6IHVuZGVmaW5lZCxcblx0XHRcdHJlc29sdmVJc0RpcmVjdG9yeTogdHJ1ZSxcblx0XHRcdGlzUGx1Z2luRGlyZWN0b3J5UmVzdWx0OiBmYWxzZSxcblx0XHRcdGNvbmZpZ3VyZWRQbHVnaW5Mb2NhdGlvbnM6IHt9LFxuXHRcdFx0dXBkYXRlZFBsdWdpbkxvY2F0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0dXNlckhvbWU6ICcvaG9tZS91c2VyJyxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZShzdGF0ZU92ZXJyaWRlcz86IFBhcnRpYWw8TW9ja1N0YXRlPik6IHsgc2VydmljZTogUGx1Z2luSW5zdGFsbFNlcnZpY2U7IHN0YXRlOiBNb2NrU3RhdGUgfSB7XG5cdFx0Y29uc3Qgc3RhdGU6IE1vY2tTdGF0ZSA9IHsgLi4uY3JlYXRlRGVmYXVsdHMoKSwgLi4uc3RhdGVPdmVycmlkZXMgfTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0Ly8gSUZpbGVTZXJ2aWNlXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIHtcblx0XHRcdGV4aXN0czogYXN5bmMgKHJlc291cmNlOiBVUkkpID0+IHtcblx0XHRcdFx0aWYgKHR5cGVvZiBzdGF0ZS5maWxlRXhpc3RzUmVzdWx0ID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHN0YXRlLmZpbGVFeGlzdHNSZXN1bHQocmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdGF0ZS5maWxlRXhpc3RzUmVzdWx0O1xuXHRcdFx0fSxcblx0XHRcdHJlc29sdmU6IGFzeW5jIChyZXNvdXJjZTogVVJJKSA9PiAoeyByZXNvdXJjZSwgaXNEaXJlY3Rvcnk6IHN0YXRlLnJlc29sdmVJc0RpcmVjdG9yeSB9KSxcblx0XHR9IGFzIHVua25vd24gYXMgSUZpbGVTZXJ2aWNlKTtcblxuXHRcdC8vIElOb3RpZmljYXRpb25TZXJ2aWNlXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90aWZpY2F0aW9uU2VydmljZSwge1xuXHRcdFx0bm90aWZ5OiAobm90aWZpY2F0aW9uOiB7IHNldmVyaXR5OiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZzsgYWN0aW9ucz86IHsgcHJpbWFyeT86IHJlYWRvbmx5IHsgZGlzcG9zZSgpOiB2b2lkIH1bXSB9IH0pID0+IHtcblx0XHRcdFx0c3RhdGUubm90aWZpY2F0aW9ucy5wdXNoKHsgc2V2ZXJpdHk6IG5vdGlmaWNhdGlvbi5zZXZlcml0eSwgbWVzc2FnZTogbm90aWZpY2F0aW9uLm1lc3NhZ2UgfSk7XG5cdFx0XHRcdG5vdGlmaWNhdGlvbi5hY3Rpb25zPy5wcmltYXJ5Py5mb3JFYWNoKGFjdGlvbiA9PiBhY3Rpb24uZGlzcG9zZSgpKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblxuXHRcdC8vIElEaWFsb2dTZXJ2aWNlXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlhbG9nU2VydmljZSwge1xuXHRcdFx0Y29uZmlybTogYXN5bmMgKCkgPT4gKHsgY29uZmlybWVkOiBzdGF0ZS5kaWFsb2dDb25maXJtUmVzdWx0IH0pLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJRGlhbG9nU2VydmljZSk7XG5cblx0XHQvLyBJVGVybWluYWxTZXJ2aWNlIFx1MjAxNCB0aGUgbW9jayBjb29yZGluYXRlcyBydW5Db21tYW5kIGFuZCBvbkNvbW1hbmRGaW5pc2hlZFxuXHRcdC8vIHNvIHRoZSBjb21tYW5kIElEIG1hdGNoZXMsIGp1c3QgbGlrZSBhIHJlYWwgdGVybWluYWwgd291bGQuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTZXJ2aWNlLCB7XG5cdFx0XHRjcmVhdGVUZXJtaW5hbDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsZXQgZmluaXNoZWRDYWxsYmFjazogKChjbWQ6IHsgaWQ6IHN0cmluZzsgZXhpdENvZGU6IG51bWJlciB9KSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRwcm9jZXNzUmVhZHk6IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRydW5Db21tYW5kOiAoY29tbWFuZDogc3RyaW5nLCBfYWRkTmV3TGluZT86IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0XHRcdHN0YXRlLnRlcm1pbmFsQ29tbWFuZHMucHVzaChjb21tYW5kKTtcblx0XHRcdFx0XHRcdC8vIFNpbXVsYXRlIGNvbW1hbmQgY29tcGxldGluZyBhZnRlciBydW5Db21tYW5kIGlzIGNhbGxlZFxuXHRcdFx0XHRcdFx0aWYgKGZpbmlzaGVkQ2FsbGJhY2spIHtcblx0XHRcdFx0XHRcdFx0ZmluaXNoZWRDYWxsYmFjayh7IGlkOiAnY29tbWFuZCcsIGV4aXRDb2RlOiBzdGF0ZS50ZXJtaW5hbEV4aXRDb2RlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdFx0XHRnZXQ6ICgpID0+IHN0YXRlLnRlcm1pbmFsQ29tcGxldGVzID8ge1xuXHRcdFx0XHRcdFx0XHRvbkNvbW1hbmRGaW5pc2hlZDogKGNhbGxiYWNrOiAoY21kOiB7IGlkOiBzdHJpbmc7IGV4aXRDb2RlOiBudW1iZXIgfSkgPT4gdm9pZCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGZpbmlzaGVkQ2FsbGJhY2sgPSBjYWxsYmFjaztcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0b25EaWRBZGRDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eTogKCkgPT4gKHsgZGlzcG9zZSgpIHsgfSB9KSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHRcdHNldEFjdGl2ZUluc3RhbmNlOiAoKSA9PiB7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbFNlcnZpY2UpO1xuXG5cdFx0Ly8gSVByb2dyZXNzU2VydmljZVxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2dyZXNzU2VydmljZSwge1xuXHRcdFx0d2l0aFByb2dyZXNzOiBhc3luYyAoX29wdGlvbnM6IHVua25vd24sIGNhbGxiYWNrOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiBQcm9taXNlPHVua25vd24+KSA9PiBjYWxsYmFjaygpLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJUHJvZ3Jlc3NTZXJ2aWNlKTtcblxuXHRcdC8vIElMb2dTZXJ2aWNlXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0Ly8gSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2Vcblx0XHQvLyBCdWlsZCBtb2NrIHNvdXJjZSByZXBvc2l0b3JpZXMgZm9yIG5wbS9waXAgdGhhdCBzaW11bGF0ZSB0ZXJtaW5hbC1iYXNlZCBpbnN0YWxsXG5cdFx0Y29uc3QgbWFrZU1vY2tQYWNrYWdlUmVwbyA9IChraW5kOiBQbHVnaW5Tb3VyY2VLaW5kKTogSVBsdWdpblNvdXJjZSA9PiAoe1xuXHRcdFx0a2luZCxcblx0XHRcdGdldENsZWFudXBUYXJnZXQ6ICgpID0+IFVSSS5maWxlKCcvbW9jay1jbGVhbnVwJyksXG5cdFx0XHRnZXRJbnN0YWxsVXJpOiAoKSA9PiBVUkkuZmlsZSgnL21vY2snKSxcblx0XHRcdGVuc3VyZTogYXN5bmMgKCkgPT4gc3RhdGUuZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0LFxuXHRcdFx0dXBkYXRlOiBhc3luYyAoKSA9PiB0cnVlLFxuXHRcdFx0Z2V0TGFiZWw6IChkKSA9PiBraW5kID09PSBQbHVnaW5Tb3VyY2VLaW5kLk5wbSA/IChkIGFzIHsgcGFja2FnZTogc3RyaW5nIH0pLnBhY2thZ2UgOiAoZCBhcyB7IHBhY2thZ2U6IHN0cmluZyB9KS5wYWNrYWdlLFxuXHRcdFx0cnVuSW5zdGFsbDogYXN5bmMgKF9pbnN0YWxsRGlyOiBVUkksIHBsdWdpbkRpcjogVVJJLCBwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbikgPT4ge1xuXHRcdFx0XHQvLyBTaW11bGF0ZSBjb25maXJtYXRpb24gZGlhbG9nXG5cdFx0XHRcdGlmICghc3RhdGUuZGlhbG9nQ29uZmlybVJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTaW11bGF0ZSBidWlsZGluZyBhbmQgcnVubmluZyB0aGUgY29tbWFuZFxuXHRcdFx0XHRjb25zdCBkZXNjcmlwdG9yID0gcGx1Z2luLnNvdXJjZURlc2NyaXB0b3I7XG5cdFx0XHRcdGxldCBhcmdzOiBzdHJpbmdbXTtcblx0XHRcdFx0aWYgKGtpbmQgPT09IFBsdWdpblNvdXJjZUtpbmQuTnBtKSB7XG5cdFx0XHRcdFx0Y29uc3QgbnBtID0gZGVzY3JpcHRvciBhcyB7IHBhY2thZ2U6IHN0cmluZzsgdmVyc2lvbj86IHN0cmluZzsgcmVnaXN0cnk/OiBzdHJpbmcgfTtcblx0XHRcdFx0XHRjb25zdCBwYWNrYWdlU3BlYyA9IG5wbS52ZXJzaW9uID8gYCR7bnBtLnBhY2thZ2V9QCR7bnBtLnZlcnNpb259YCA6IG5wbS5wYWNrYWdlO1xuXHRcdFx0XHRcdGFyZ3MgPSBbJ25wbScsICdpbnN0YWxsJywgJy0tcHJlZml4JywgX2luc3RhbGxEaXIuZnNQYXRoLCBwYWNrYWdlU3BlY107XG5cdFx0XHRcdFx0aWYgKG5wbS5yZWdpc3RyeSkge1xuXHRcdFx0XHRcdFx0YXJncy5wdXNoKCctLXJlZ2lzdHJ5JywgbnBtLnJlZ2lzdHJ5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgcGlwID0gZGVzY3JpcHRvciBhcyB7IHBhY2thZ2U6IHN0cmluZzsgdmVyc2lvbj86IHN0cmluZzsgcmVnaXN0cnk/OiBzdHJpbmcgfTtcblx0XHRcdFx0XHRjb25zdCBwYWNrYWdlU3BlYyA9IHBpcC52ZXJzaW9uID8gYCR7cGlwLnBhY2thZ2V9PT0ke3BpcC52ZXJzaW9ufWAgOiBwaXAucGFja2FnZTtcblx0XHRcdFx0XHRhcmdzID0gWydwaXAnLCAnaW5zdGFsbCcsICctLXRhcmdldCcsIF9pbnN0YWxsRGlyLmZzUGF0aCwgcGFja2FnZVNwZWNdO1xuXHRcdFx0XHRcdGlmIChwaXAucmVnaXN0cnkpIHtcblx0XHRcdFx0XHRcdGFyZ3MucHVzaCgnLS1pbmRleC11cmwnLCBwaXAucmVnaXN0cnkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjb21tYW5kID0gYXJncy5qb2luKCcgJyk7XG5cdFx0XHRcdHN0YXRlLnRlcm1pbmFsQ29tbWFuZHMucHVzaChjb21tYW5kKTtcblxuXHRcdFx0XHRpZiAoc3RhdGUudGVybWluYWxFeGl0Q29kZSAhPT0gMCkge1xuXHRcdFx0XHRcdHN0YXRlLm5vdGlmaWNhdGlvbnMucHVzaCh7IHNldmVyaXR5OiAzLCBtZXNzYWdlOiBgUGx1Z2luIGluc3RhbGxhdGlvbiBjb21tYW5kIGZhaWxlZDogQ29tbWFuZCBleGl0ZWQgd2l0aCBjb2RlICR7c3RhdGUudGVybWluYWxFeGl0Q29kZX1gIH0pO1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDaGVjayBpZiBwbHVnaW4gZGlyIGV4aXN0c1xuXHRcdFx0XHRjb25zdCBleGlzdHMgPSB0eXBlb2Ygc3RhdGUuZmlsZUV4aXN0c1Jlc3VsdCA9PT0gJ2Z1bmN0aW9uJ1xuXHRcdFx0XHRcdD8gYXdhaXQgc3RhdGUuZmlsZUV4aXN0c1Jlc3VsdChwbHVnaW5EaXIpXG5cdFx0XHRcdFx0OiBzdGF0ZS5maWxlRXhpc3RzUmVzdWx0O1xuXHRcdFx0XHRpZiAoIWV4aXN0cykge1xuXHRcdFx0XHRcdGNvbnN0IGxhYmVsID0ga2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5OcG0gPyAnbnBtJyA6ICdwaXAnO1xuXHRcdFx0XHRcdGNvbnN0IHBrZyA9IChkZXNjcmlwdG9yIGFzIHsgcGFja2FnZTogc3RyaW5nIH0pLnBhY2thZ2U7XG5cdFx0XHRcdFx0c3RhdGUubm90aWZpY2F0aW9ucy5wdXNoKHsgc2V2ZXJpdHk6IDMsIG1lc3NhZ2U6IGAke2xhYmVsfSBwYWNrYWdlICcke3BrZ30nIHdhcyBub3QgZm91bmQgYWZ0ZXIgaW5zdGFsbGF0aW9uLmAgfSk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7IHBsdWdpbkRpciB9O1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IG1vY2tTb3VyY2VSZXBvcyA9IG5ldyBNYXA8UGx1Z2luU291cmNlS2luZCwgSVBsdWdpblNvdXJjZT4oW1xuXHRcdFx0W1BsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBnZXRDbGVhbnVwVGFyZ2V0OiAoKSA9PiB1bmRlZmluZWQsIGdldEluc3RhbGxVcmk6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCk7IH0sIGVuc3VyZTogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoKTsgfSwgdXBkYXRlOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigpOyB9LCBnZXRMYWJlbDogKGQpID0+IChkIGFzIHsgcGF0aDogc3RyaW5nIH0pLnBhdGggfHwgJy4nIH1dLFxuXHRcdFx0W1BsdWdpblNvdXJjZUtpbmQuR2l0SHViLCB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCBnZXRDbGVhbnVwVGFyZ2V0OiAoKSA9PiBVUkkuZmlsZSgnL21vY2snKSwgZ2V0SW5zdGFsbFVyaTogKCkgPT4gVVJJLmZpbGUoJy9tb2NrJyksIGVuc3VyZTogYXN5bmMgKCkgPT4gVVJJLmZpbGUoJy9tb2NrJyksIHVwZGF0ZTogYXN5bmMgKCkgPT4gdHJ1ZSwgZ2V0TGFiZWw6IChkKSA9PiAoZCBhcyB7IHJlcG86IHN0cmluZyB9KS5yZXBvIH1dLFxuXHRcdFx0W1BsdWdpblNvdXJjZUtpbmQuR2l0VXJsLCB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0VXJsLCBnZXRDbGVhbnVwVGFyZ2V0OiAoKSA9PiBVUkkuZmlsZSgnL21vY2snKSwgZ2V0SW5zdGFsbFVyaTogKCkgPT4gVVJJLmZpbGUoJy9tb2NrJyksIGVuc3VyZTogYXN5bmMgKCkgPT4gVVJJLmZpbGUoJy9tb2NrJyksIHVwZGF0ZTogYXN5bmMgKCkgPT4gdHJ1ZSwgZ2V0TGFiZWw6IChkKSA9PiAoZCBhcyB7IHVybDogc3RyaW5nIH0pLnVybCB9XSxcblx0XHRcdFtQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgbWFrZU1vY2tQYWNrYWdlUmVwbyhQbHVnaW5Tb3VyY2VLaW5kLk5wbSldLFxuXHRcdFx0W1BsdWdpblNvdXJjZUtpbmQuUGlwLCBtYWtlTW9ja1BhY2thZ2VSZXBvKFBsdWdpblNvdXJjZUtpbmQuUGlwKV0sXG5cdFx0XSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLCB7XG5cdFx0XHRnZXRQbHVnaW5JbnN0YWxsVXJpOiAocGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4pID0+IHtcblx0XHRcdFx0aWYgKHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmQgIT09IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHN0YXRlLnBsdWdpblNvdXJjZUluc3RhbGxVcmlzLmdldChwbHVnaW4uc291cmNlRGVzY3JpcHRvci5raW5kKSA/PyBVUkkuZmlsZShgL2NhY2hlL2FnZW50UGx1Z2lucy8ke3BsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmR9L2RlZmF1bHRgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gVVJJLmpvaW5QYXRoKHN0YXRlLmVuc3VyZVJlcG9zaXRvcnlSZXN1bHQsIHBsdWdpbi5zb3VyY2UpO1xuXHRcdFx0fSxcblx0XHRcdGdldFJlcG9zaXRvcnlVcmk6ICgpID0+IHN0YXRlLmVuc3VyZVJlcG9zaXRvcnlSZXN1bHQsXG5cdFx0XHRlbnN1cmVSZXBvc2l0b3J5OiBhc3luYyAoX21hcmtldHBsYWNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIF9vcHRpb25zPzogSUVuc3VyZVJlcG9zaXRvcnlPcHRpb25zKSA9PiB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZS5lbnN1cmVSZXBvc2l0b3J5UmVzdWx0O1xuXHRcdFx0fSxcblx0XHRcdHB1bGxSZXBvc2l0b3J5OiBhc3luYyAobWFya2V0cGxhY2U6IElNYXJrZXRwbGFjZVJlZmVyZW5jZSwgb3B0aW9ucz86IElQdWxsUmVwb3NpdG9yeU9wdGlvbnMpID0+IHtcblx0XHRcdFx0c3RhdGUucHVsbFJlcG9zaXRvcnlDYWxscy5wdXNoKHsgbWFya2V0cGxhY2UsIG9wdGlvbnMgfSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0UGx1Z2luU291cmNlSW5zdGFsbFVyaTogKGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IGRlc2NyaXB0b3Iua2luZDtcblx0XHRcdFx0cmV0dXJuIHN0YXRlLnBsdWdpblNvdXJjZUluc3RhbGxVcmlzLmdldChrZXkpID8/IFVSSS5maWxlKGAvY2FjaGUvYWdlbnRQbHVnaW5zLyR7a2V5fS9kZWZhdWx0YCk7XG5cdFx0XHR9LFxuXHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlOiBhc3luYyAoKSA9PiBzdGF0ZS5lbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQsXG5cdFx0XHR1cGRhdGVQbHVnaW5Tb3VyY2U6IGFzeW5jIChwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbiwgb3B0aW9ucz86IElQdWxsUmVwb3NpdG9yeU9wdGlvbnMpID0+IHtcblx0XHRcdFx0c3RhdGUudXBkYXRlUGx1Z2luU291cmNlQ2FsbHMucHVzaCh7IHBsdWdpbiwgb3B0aW9ucyB9KTtcblx0XHRcdH0sXG5cdFx0XHRnZXRQbHVnaW5Tb3VyY2U6IChraW5kOiBQbHVnaW5Tb3VyY2VLaW5kKSA9PiBtb2NrU291cmNlUmVwb3MuZ2V0KGtpbmQpISxcblx0XHRcdGNsZWFudXBQbHVnaW5Tb3VyY2U6IGFzeW5jICgpID0+IHsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UpO1xuXG5cdFx0Ly8gSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZVxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSwge1xuXHRcdFx0aW5zdGFsbGVkUGx1Z2luczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0Lmluc3RhbGxlZFBsdWdpbnMnLCBzdGF0ZS5pbnN0YWxsZWRQbHVnaW5zKSxcblx0XHRcdGFkZEluc3RhbGxlZFBsdWdpbjogKHVyaTogVVJJLCBwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbikgPT4ge1xuXHRcdFx0XHRzdGF0ZS5hZGRlZFBsdWdpbnMucHVzaCh7IHVyaTogdXJpLnRvU3RyaW5nKCksIHBsdWdpbiB9KTtcblx0XHRcdH0sXG5cdFx0XHRpc01hcmtldHBsYWNlVHJ1c3RlZDogKCkgPT4gc3RhdGUubWFya2V0cGxhY2VUcnVzdGVkLFxuXHRcdFx0aXNTdHJpY3RNYXJrZXRwbGFjZVBvbGljeUFjdGl2ZTogKCkgPT4gc3RhdGUuc3RyaWN0TWFya2V0cGxhY2VQb2xpY3lBY3RpdmUgPz8gZmFsc2UsXG5cdFx0XHRpc01hcmtldHBsYWNlQXV0b1VwZGF0ZUVuYWJsZWQ6IChyZWY6IElNYXJrZXRwbGFjZVJlZmVyZW5jZSkgPT4gc3RhdGUuYXV0b1VwZGF0ZUJ5TWFya2V0cGxhY2UuZ2V0KHJlZi5jYW5vbmljYWxJZCkgPz8gdHJ1ZSxcblx0XHRcdGZldGNoTWFya2V0cGxhY2VQbHVnaW5zOiBhc3luYyAoX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgbWFya2V0cGxhY2VJZHM/OiBSZWFkb25seVNldDxzdHJpbmc+KSA9PiB7XG5cdFx0XHRcdHN0YXRlLmZldGNoTWFya2V0cGxhY2VDYWxscy5wdXNoKFsuLi5tYXJrZXRwbGFjZUlkcyA/PyBbXV0pO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGUuZmV0Y2hlZE1hcmtldHBsYWNlUGx1Z2lucy5maWx0ZXIocGx1Z2luID0+ICFtYXJrZXRwbGFjZUlkcyB8fCBtYXJrZXRwbGFjZUlkcy5oYXMocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLmNhbm9uaWNhbElkKSk7XG5cdFx0XHR9LFxuXHRcdFx0Y2xlYXJVcGRhdGVzQXZhaWxhYmxlOiAoKSA9PiBzdGF0ZS5jbGVhclVwZGF0ZXNBdmFpbGFibGVDYWxscysrLFxuXHRcdFx0dHJ1c3RNYXJrZXRwbGFjZTogKHJlZjogSU1hcmtldHBsYWNlUmVmZXJlbmNlKSA9PiB7XG5cdFx0XHRcdHN0YXRlLnRydXN0ZWRNYXJrZXRwbGFjZXMucHVzaChyZWYuY2Fub25pY2FsSWQpO1xuXHRcdFx0fSxcblx0XHRcdHJlYWRQbHVnaW5zRnJvbURpcmVjdG9yeTogYXN5bmMgKCkgPT4gc3RhdGUucmVhZFBsdWdpbnNSZXN1bHQsXG5cdFx0XHRyZWFkU2luZ2xlUGx1Z2luTWFuaWZlc3Q6IGFzeW5jICgpID0+IHN0YXRlLnNpbmdsZVBsdWdpbk1hbmlmZXN0UmVzdWx0LFxuXHRcdFx0aXNQbHVnaW5EaXJlY3Rvcnk6IGFzeW5jICgpID0+IHN0YXRlLmlzUGx1Z2luRGlyZWN0b3J5UmVzdWx0LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlKTtcblxuXHRcdC8vIElDb25maWd1cmF0aW9uU2VydmljZVxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRnZXRWYWx1ZTogKGtleTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlmIChrZXkgPT09IENoYXRDb25maWd1cmF0aW9uLlBsdWdpbk1hcmtldHBsYWNlcykge1xuXHRcdFx0XHRcdHJldHVybiBzdGF0ZS5jb25maWd1cmVkTWFya2V0cGxhY2VzO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChrZXkgPT09IENoYXRDb25maWd1cmF0aW9uLlBsdWdpbkxvY2F0aW9ucykge1xuXHRcdFx0XHRcdHJldHVybiBzdGF0ZS5jb25maWd1cmVkUGx1Z2luTG9jYXRpb25zO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0aW5zcGVjdDogKGtleTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlmIChrZXkgPT09IENoYXRDb25maWd1cmF0aW9uLlBsdWdpbk1hcmtldHBsYWNlcykge1xuXHRcdFx0XHRcdHJldHVybiB7IHVzZXJWYWx1ZTogc3RhdGUuY29uZmlndXJlZE1hcmtldHBsYWNlcywgZGVmYXVsdFZhbHVlOiB1bmRlZmluZWQsIHBvbGljeVZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoa2V5ID09PSBDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5Mb2NhdGlvbnMpIHtcblx0XHRcdFx0XHRyZXR1cm4geyB1c2VyVmFsdWU6IHN0YXRlLmNvbmZpZ3VyZWRQbHVnaW5Mb2NhdGlvbnMsIGRlZmF1bHRWYWx1ZTogdW5kZWZpbmVkLCBwb2xpY3lWYWx1ZTogdW5kZWZpbmVkIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsgdXNlclZhbHVlOiB1bmRlZmluZWQsIGRlZmF1bHRWYWx1ZTogdW5kZWZpbmVkLCBwb2xpY3lWYWx1ZTogdW5kZWZpbmVkIH07XG5cdFx0XHR9LFxuXHRcdFx0dXBkYXRlVmFsdWU6IGFzeW5jIChrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pID0+IHtcblx0XHRcdFx0aWYgKGtleSA9PT0gQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzKSB7XG5cdFx0XHRcdFx0c3RhdGUudXBkYXRlZE1hcmtldHBsYWNlcyA9IHZhbHVlIGFzIHN0cmluZ1tdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChrZXkgPT09IENoYXRDb25maWd1cmF0aW9uLlBsdWdpbkxvY2F0aW9ucykge1xuXHRcdFx0XHRcdHN0YXRlLnVwZGF0ZWRQbHVnaW5Mb2NhdGlvbnMgPSB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPjtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdC8vIElQYXRoU2VydmljZVxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVBhdGhTZXJ2aWNlLCB7XG5cdFx0XHR1c2VySG9tZTogYXN5bmMgKCkgPT4gVVJJLmZpbGUoc3RhdGUudXNlckhvbWUpLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJUGF0aFNlcnZpY2UpO1xuXG5cdFx0Ly8gSVF1aWNrSW5wdXRTZXJ2aWNlXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUXVpY2tJbnB1dFNlcnZpY2UsIHtcblx0XHRcdGlucHV0OiBhc3luYyAoKSA9PiBzdGF0ZS5xdWlja0lucHV0UmVzdWx0LFxuXHRcdFx0cGljazogYXN5bmMgKHBpY2tzOiB7IGxhYmVsOiBzdHJpbmcgfVtdKSA9PiB7XG5cdFx0XHRcdGlmICghc3RhdGUucXVpY2tQaWNrUmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcGlja3MuZmluZChwID0+IHAubGFiZWwgPT09IHN0YXRlLnF1aWNrUGlja1Jlc3VsdCEubGFiZWwpO1xuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQbHVnaW5JbnN0YWxsU2VydmljZSk7XG5cdFx0cmV0dXJuIHsgc2VydmljZSwgc3RhdGUgfTtcblx0fVxuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0Ly8gZ2V0UGx1Z2luSW5zdGFsbFVyaVxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cblx0c3VpdGUoJ2dldFBsdWdpbkluc3RhbGxVcmknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdkZWxlZ2F0ZXMgdG8gZ2V0UGx1Z2luSW5zdGFsbFVyaSBmb3IgcmVsYXRpdmUtcGF0aCBwbHVnaW5zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2U6ICdwbHVnaW5zL215UGx1Z2luJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvbXlQbHVnaW4nIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHVyaSA9IHNlcnZpY2UuZ2V0UGx1Z2luSW5zdGFsbFVyaShwbHVnaW4pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5wYXRoLCAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcGx1Z2lucy9teVBsdWdpbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZWdhdGVzIHRvIGdldFBsdWdpblNvdXJjZUluc3RhbGxVcmkgZm9yIG5wbSBwbHVnaW5zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbnBtVXJpID0gVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvbnBtL215LXBrZy9ub2RlX21vZHVsZXMvbXktcGtnJyk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRwbHVnaW5Tb3VyY2VJbnN0YWxsVXJpczogbmV3IE1hcChbWyducG0nLCBucG1VcmldXSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5OcG0sIHBhY2thZ2U6ICdteS1wa2cnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHVyaSA9IHNlcnZpY2UuZ2V0UGx1Z2luSW5zdGFsbFVyaShwbHVnaW4pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5wYXRoLCBucG1VcmkucGF0aCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxlZ2F0ZXMgdG8gZ2V0UGx1Z2luU291cmNlSW5zdGFsbFVyaSBmb3IgcGlwIHBsdWdpbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwaXBVcmkgPSBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9waXAvbXktcGtnJyk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRwbHVnaW5Tb3VyY2VJbnN0YWxsVXJpczogbmV3IE1hcChbWydwaXAnLCBwaXBVcmldXSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5QaXAsIHBhY2thZ2U6ICdteS1wa2cnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHVyaSA9IHNlcnZpY2UuZ2V0UGx1Z2luSW5zdGFsbFVyaShwbHVnaW4pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5wYXRoLCBwaXBVcmkucGF0aCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxlZ2F0ZXMgdG8gZ2V0UGx1Z2luU291cmNlSW5zdGFsbFVyaSBmb3IgZ2l0aHViIHBsdWdpbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBnaFVyaSA9IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvcmVwbycpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0cGx1Z2luU291cmNlSW5zdGFsbFVyaXM6IG5ldyBNYXAoW1snZ2l0aHViJywgZ2hVcmldXSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIHJlcG86ICdvd25lci9yZXBvJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB1cmkgPSBzZXJ2aWNlLmdldFBsdWdpbkluc3RhbGxVcmkocGx1Z2luKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkucGF0aCwgZ2hVcmkucGF0aCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0Ly8gaW5zdGFsbFBsdWdpbiBcdTIwMTQgcmVsYXRpdmUgcGF0aFxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cblx0c3VpdGUoJ2luc3RhbGxQbHVnaW4gXHUyMDE0IHJlbGF0aXZlIHBhdGgnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdpbnN0YWxscyBhIHJlbGF0aXZlLXBhdGggcGx1Z2luIHdoZW4gZGlyZWN0b3J5IGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZTogJ3BsdWdpbnMvbXlQbHVnaW4nLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncGx1Z2lucy9teVBsdWdpbicgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLmFkZGVkUGx1Z2luc1swXS51cmkuaW5jbHVkZXMoJ3BsdWdpbnMvbXlQbHVnaW4nKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUubm90aWZpY2F0aW9ucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm90aWZpZXMgZXJyb3Igd2hlbiBwbHVnaW4gZGlyZWN0b3J5IGRvZXMgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7IGZpbGVFeGlzdHNSZXN1bHQ6IGZhbHNlIH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlOiAncGx1Z2lucy9taXNzaW5nJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvbWlzc2luZycgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm5vdGlmaWNhdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZS5ub3RpZmljYXRpb25zWzBdLm1lc3NhZ2UuaW5jbHVkZXMoJ25vdCBmb3VuZCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGluc3RhbGwgd2hlbiBlbnN1cmVSZXBvc2l0b3J5IHRocm93cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRcdC8vIE92ZXJyaWRlIGVuc3VyZVJlcG9zaXRvcnkgdG8gdGhyb3dcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCByZXBvU2VydmljZSA9IHtcblx0XHRcdFx0ZW5zdXJlUmVwb3NpdG9yeTogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ2Nsb25lIGZhaWxlZCcpOyB9LFxuXHRcdFx0XHRnZXRQbHVnaW5JbnN0YWxsVXJpOiAoKSA9PiBVUkkuZmlsZSgnL3gnKSxcblx0XHRcdFx0Z2V0UGx1Z2luU291cmNlSW5zdGFsbFVyaTogKCkgPT4gVVJJLmZpbGUoJy94JyksXG5cdFx0XHR9O1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSwgcmVwb1NlcnZpY2UgYXMgdW5rbm93biBhcyBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgeyBleGlzdHM6IGFzeW5jICgpID0+IHRydWUgfSBhcyB1bmtub3duIGFzIElGaWxlU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCB7IG5vdGlmeTogKG46IHsgc2V2ZXJpdHk6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nIH0pID0+IHsgc3RhdGUubm90aWZpY2F0aW9ucy5wdXNoKG4pOyB9IH0gYXMgdW5rbm93biBhcyBJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWFsb2dTZXJ2aWNlLCB7IGNvbmZpcm06IGFzeW5jICgpID0+ICh7IGNvbmZpcm1lZDogdHJ1ZSB9KSB9IGFzIHVua25vd24gYXMgSURpYWxvZ1NlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTZXJ2aWNlLCB7fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbFNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCB7IHdpdGhQcm9ncmVzczogYXN5bmMgKF9vOiB1bmtub3duLCBjYjogKCkgPT4gUHJvbWlzZTx1bmtub3duPikgPT4gY2IoKSB9IGFzIHVua25vd24gYXMgSVByb2dyZXNzU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsIHsgYWRkSW5zdGFsbGVkUGx1Z2luOiAoKSA9PiB7IH0gfSBhcyB1bmtub3duIGFzIElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLCAnaXNNYXJrZXRwbGFjZVRydXN0ZWQnLCAoKSA9PiB0cnVlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSwgJ3RydXN0TWFya2V0cGxhY2UnLCAoKSA9PiB7IH0pO1xuXHRcdFx0Y29uc3Qgc3ZjID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGx1Z2luSW5zdGFsbFNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2U6ICdwbHVnaW5zL215UGx1Z2luJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvbXlQbHVnaW4nIH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHN2Yy5pbnN0YWxsUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdC8vIFNob3VsZCByZXR1cm4gd2l0aG91dCBpbnN0YWxsaW5nIG9yIGNyYXNoaW5nXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0Ly8gaW5zdGFsbFBsdWdpbiBcdTIwMTQgR2l0SHViIC8gR2l0VXJsXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuXHRzdWl0ZSgnaW5zdGFsbFBsdWdpbiBcdTIwMTQgZ2l0IHNvdXJjZXMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdpbnN0YWxscyBhIEdpdEh1YiBwbHVnaW4gd2hlbiBzb3VyY2UgZXhpc3RzIGFmdGVyIGNsb25lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvZ2l0aHViLmNvbS9vd25lci9yZXBvJyksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIHJlcG86ICdvd25lci9yZXBvJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUubm90aWZpY2F0aW9ucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5zdGFsbHMgYSBHaXRVcmwgcGx1Z2luIHdoZW4gc291cmNlIGV4aXN0cyBhZnRlciBjbG9uZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2V4YW1wbGUuY29tL3JlcG8nKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdFVybCwgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9yZXBvLmdpdCcgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm5vdGlmaWNhdGlvbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vdGlmaWVzIGVycm9yIHdoZW4gY2xvbmVkIGRpcmVjdG9yeSBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRmaWxlRXhpc3RzUmVzdWx0OiBmYWxzZSxcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL293bmVyL3JlcG8nKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5ub3RpZmljYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUubm90aWZpY2F0aW9uc1swXS5tZXNzYWdlLmluY2x1ZGVzKCdub3QgZm91bmQnKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0Ly8gaW5zdGFsbFBsdWdpbiBcdTIwMTQgbnBtXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuXHRzdWl0ZSgnaW5zdGFsbFBsdWdpbiBcdTIwMTQgbnBtJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncnVucyBucG0gaW5zdGFsbCBhbmQgcmVnaXN0ZXJzIHBsdWdpbiBvbiBzdWNjZXNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbnBtSW5zdGFsbFVyaSA9IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL25wbS9teS1wa2cvbm9kZV9tb2R1bGVzL215LXBrZycpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvbnBtL215LXBrZycpLFxuXHRcdFx0XHRwbHVnaW5Tb3VyY2VJbnN0YWxsVXJpczogbmV3IE1hcChbWyducG0nLCBucG1JbnN0YWxsVXJpXV0pLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuTnBtLCBwYWNrYWdlOiAnbXktcGtnJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudGVybWluYWxDb21tYW5kcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHNbMF0uaW5jbHVkZXMoJ25wbScpKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZS50ZXJtaW5hbENvbW1hbmRzWzBdLmluY2x1ZGVzKCdpbnN0YWxsJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHNbMF0uaW5jbHVkZXMoJ215LXBrZycpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5ub3RpZmljYXRpb25zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyB2ZXJzaW9uIGluIG5wbSBpbnN0YWxsIGNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9ucG0vbXktcGtnJyksXG5cdFx0XHRcdHBsdWdpblNvdXJjZUluc3RhbGxVcmlzOiBuZXcgTWFwKFtbJ25wbScsIFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL25wbS9teS1wa2cvbm9kZV9tb2R1bGVzL215LXBrZycpXV0pLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuTnBtLCBwYWNrYWdlOiAnbXktcGtnJywgdmVyc2lvbjogJzEuMi4zJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudGVybWluYWxDb21tYW5kcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHNbMF0uaW5jbHVkZXMoJ215LXBrZ0AxLjIuMycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIHJlZ2lzdHJ5IGluIG5wbSBpbnN0YWxsIGNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9ucG0vbXktcGtnJyksXG5cdFx0XHRcdHBsdWdpblNvdXJjZUluc3RhbGxVcmlzOiBuZXcgTWFwKFtbJ25wbScsIFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL25wbS9teS1wa2cvbm9kZV9tb2R1bGVzL215LXBrZycpXV0pLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuTnBtLCBwYWNrYWdlOiAnbXktcGtnJywgcmVnaXN0cnk6ICdodHRwczovL2N1c3RvbS5yZWdpc3RyeS5jb20nIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50ZXJtaW5hbENvbW1hbmRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUudGVybWluYWxDb21tYW5kc1swXS5pbmNsdWRlcygnLS1yZWdpc3RyeScpKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZS50ZXJtaW5hbENvbW1hbmRzWzBdLmluY2x1ZGVzKCdodHRwczovL2N1c3RvbS5yZWdpc3RyeS5jb20nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBpbnN0YWxsIHdoZW4gdXNlciBkZWNsaW5lcyBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHsgZGlhbG9nQ29uZmlybVJlc3VsdDogZmFsc2UgfSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuTnBtLCBwYWNrYWdlOiAnbXktcGtnJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudGVybWluYWxDb21tYW5kcy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm90aWZpZXMgZXJyb3Igd2hlbiBucG0gcGFja2FnZSBkaXJlY3Rvcnkgbm90IGZvdW5kIGFmdGVyIGluc3RhbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9ucG0vbXktcGtnJyksXG5cdFx0XHRcdC8vIGV4aXN0cyByZXR1cm5zIHRydWUgZm9yIGVuc3VyZVBsdWdpblNvdXJjZSBidXQgZmFsc2UgZm9yIHRoZSBmaW5hbCBjaGVja1xuXHRcdFx0XHRmaWxlRXhpc3RzUmVzdWx0OiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgcGFja2FnZTogJ215LXBrZycgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm5vdGlmaWNhdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZS5ub3RpZmljYXRpb25zWzBdLm1lc3NhZ2UuaW5jbHVkZXMoJ25vdCBmb3VuZCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vdGlmaWVzIGVycm9yIHdoZW4gdGVybWluYWwgY29tbWFuZCBmYWlscyB3aXRoIG5vbi16ZXJvIGV4aXQgY29kZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL25wbS9teS1wa2cnKSxcblx0XHRcdFx0dGVybWluYWxFeGl0Q29kZTogMSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgcGFja2FnZTogJ215LXBrZycgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm5vdGlmaWNhdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZS5ub3RpZmljYXRpb25zWzBdLm1lc3NhZ2UuaW5jbHVkZXMoJ2ZhaWxlZCcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBpbnN0YWxsUGx1Z2luIFx1MjAxNCBwaXBcblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHN1aXRlKCdpbnN0YWxsUGx1Z2luIFx1MjAxNCBwaXAnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdydW5zIHBpcCBpbnN0YWxsIGFuZCByZWdpc3RlcnMgcGx1Z2luIG9uIHN1Y2Nlc3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwaXBJbnN0YWxsVXJpID0gVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvcGlwL215LXBrZycpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvcGlwL215LXBrZycpLFxuXHRcdFx0XHRwbHVnaW5Tb3VyY2VJbnN0YWxsVXJpczogbmV3IE1hcChbWydwaXAnLCBwaXBJbnN0YWxsVXJpXV0pLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUGlwLCBwYWNrYWdlOiAnbXktcGtnJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudGVybWluYWxDb21tYW5kcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHNbMF0uaW5jbHVkZXMoJ3BpcCcpKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZS50ZXJtaW5hbENvbW1hbmRzWzBdLmluY2x1ZGVzKCdpbnN0YWxsJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHNbMF0uaW5jbHVkZXMoJ215LXBrZycpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5ub3RpZmljYXRpb25zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyB2ZXJzaW9uIHdpdGggPT0gc3ludGF4IGluIHBpcCBpbnN0YWxsIGNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9waXAvbXktcGtnJyksXG5cdFx0XHRcdHBsdWdpblNvdXJjZUluc3RhbGxVcmlzOiBuZXcgTWFwKFtbJ3BpcCcsIFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL3BpcC9teS1wa2cnKV1dKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlBpcCwgcGFja2FnZTogJ215LXBrZycsIHZlcnNpb246ICcyLjAuMCcgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZS50ZXJtaW5hbENvbW1hbmRzWzBdLmluY2x1ZGVzKCdteS1wa2c9PTIuMC4wJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgcmVnaXN0cnkgd2l0aCAtLWluZGV4LXVybCBpbiBwaXAgaW5zdGFsbCBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvcGlwL215LXBrZycpLFxuXHRcdFx0XHRwbHVnaW5Tb3VyY2VJbnN0YWxsVXJpczogbmV3IE1hcChbWydwaXAnLCBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9waXAvbXktcGtnJyldXSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5QaXAsIHBhY2thZ2U6ICdteS1wa2cnLCByZWdpc3RyeTogJ2h0dHBzOi8vcHlwaS5jdXN0b20uY29tL3NpbXBsZScgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZS50ZXJtaW5hbENvbW1hbmRzWzBdLmluY2x1ZGVzKCctLWluZGV4LXVybCcpKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZS50ZXJtaW5hbENvbW1hbmRzWzBdLmluY2x1ZGVzKCdodHRwczovL3B5cGkuY3VzdG9tLmNvbS9zaW1wbGUnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBpbnN0YWxsIHdoZW4gdXNlciBkZWNsaW5lcyBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHsgZGlhbG9nQ29uZmlybVJlc3VsdDogZmFsc2UgfSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUGlwLCBwYWNrYWdlOiAnbXktcGtnJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudGVybWluYWxDb21tYW5kcy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm90aWZpZXMgZXJyb3Igd2hlbiBwaXAgcGFja2FnZSBkaXJlY3Rvcnkgbm90IGZvdW5kIGFmdGVyIGluc3RhbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9waXAvbXktcGtnJyksXG5cdFx0XHRcdGZpbGVFeGlzdHNSZXN1bHQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUGlwLCBwYWNrYWdlOiAnbXktcGtnJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbihwbHVnaW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUubm90aWZpY2F0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLm5vdGlmaWNhdGlvbnNbMF0ubWVzc2FnZS5pbmNsdWRlcygnbm90IGZvdW5kJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cdC8vIHVwZGF0ZVBsdWdpblxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cblx0c3VpdGUoJ3VwZGF0ZVBsdWdpbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NhbGxzIHVwZGF0ZVBsdWdpblNvdXJjZSBmb3IgcmVsYXRpdmUtcGF0aCBwbHVnaW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlOiAncGx1Z2lucy9teVBsdWdpbicsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICdwbHVnaW5zL215UGx1Z2luJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS51cGRhdGVQbHVnaW5Tb3VyY2VDYWxscy5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FsbHMgdXBkYXRlUGx1Z2luU291cmNlIGZvciBHaXRIdWIgcGx1Z2lucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIHJlcG86ICdvd25lci9yZXBvJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS51cGRhdGVQbHVnaW5Tb3VyY2VDYWxscy5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FsbHMgdXBkYXRlUGx1Z2luU291cmNlIGZvciBHaXRVcmwgcGx1Z2lucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRVcmwsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vcmVwby5naXQnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS51cGRhdGVQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnVwZGF0ZVBsdWdpblNvdXJjZUNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdibG9ja3MgZGlyZWN0IHVwZGF0ZXMgd2hlbiB0aGUgc3RyaWN0IG1hcmtldHBsYWNlIHBvbGljeSBkaXNhbGxvd3MgdGhlIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRzdHJpY3RNYXJrZXRwbGFjZVBvbGljeUFjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0bWFya2V0cGxhY2VUcnVzdGVkOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdXBkYXRlZCA9IGF3YWl0IHNlcnZpY2UudXBkYXRlUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR1cGRhdGVkLFxuXHRcdFx0XHR1cGRhdGVDYWxsczogc3RhdGUudXBkYXRlUGx1Z2luU291cmNlQ2FsbHMubGVuZ3RoLFxuXHRcdFx0XHRub3RpZmljYXRpb25zOiBzdGF0ZS5ub3RpZmljYXRpb25zLm1hcChub3RpZmljYXRpb24gPT4gbm90aWZpY2F0aW9uLm1lc3NhZ2UpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR1cGRhdGVkOiBmYWxzZSxcblx0XHRcdFx0dXBkYXRlQ2FsbHM6IDAsXG5cdFx0XHRcdG5vdGlmaWNhdGlvbnM6IFsnVXBkYXRlcyBmcm9tIFxcJ21pY3Jvc29mdC92c2NvZGVcXCcgYXJlIGJsb2NrZWQgYnkgeW91ciBvcmdhbml6YXRpb25cXCdzIHBvbGljeS4nXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmUtaW5zdGFsbHMgZm9yIG5wbSBwbHVnaW4gdXBkYXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL25wbS9teS1wa2cnKSxcblx0XHRcdFx0cGx1Z2luU291cmNlSW5zdGFsbFVyaXM6IG5ldyBNYXAoW1snbnBtJywgVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvbnBtL215LXBrZy9ub2RlX21vZHVsZXMvbXktcGtnJyldXSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5OcG0sIHBhY2thZ2U6ICdteS1wa2cnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS51cGRhdGVQbHVnaW4ocGx1Z2luKTtcblxuXHRcdFx0Ly8gbnBtIHVwZGF0ZSBnb2VzIHRocm91Z2ggdGhlIHNhbWUgaW5zdGFsbCBmbG93XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudGVybWluYWxDb21tYW5kcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLnRlcm1pbmFsQ29tbWFuZHNbMF0uaW5jbHVkZXMoJ25wbScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHJlcG9ydCBucG0gcGx1Z2luIGFzIHVwZGF0ZWQgd2hlbiBpbnN0YWxsIGlzIGRlY2xpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGRpYWxvZ0NvbmZpcm1SZXN1bHQ6IGZhbHNlLFxuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL25wbS9teS1wa2cnKSxcblx0XHRcdFx0cGx1Z2luU291cmNlSW5zdGFsbFVyaXM6IG5ldyBNYXAoW1snbnBtJywgVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvbnBtL215LXBrZy9ub2RlX21vZHVsZXMvbXktcGtnJyldXSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5OcG0sIHBhY2thZ2U6ICdteS1wa2cnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdXBkYXRlZCA9IGF3YWl0IHNlcnZpY2UudXBkYXRlUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cGRhdGVkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudGVybWluYWxDb21tYW5kcy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmUtaW5zdGFsbHMgZm9yIHBpcCBwbHVnaW4gdXBkYXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL3BpcC9teS1wa2cnKSxcblx0XHRcdFx0cGx1Z2luU291cmNlSW5zdGFsbFVyaXM6IG5ldyBNYXAoW1sncGlwJywgVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvcGlwL215LXBrZycpXV0pLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUGlwLCBwYWNrYWdlOiAnbXktcGtnJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50ZXJtaW5hbENvbW1hbmRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGUudGVybWluYWxDb21tYW5kc1swXS5pbmNsdWRlcygncGlwJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgcmVwb3J0IHBpcCBwbHVnaW4gYXMgdXBkYXRlZCB3aGVuIGluc3RhbGwgaXMgZGVjbGluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZGlhbG9nQ29uZmlybVJlc3VsdDogZmFsc2UsXG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvcGlwL215LXBrZycpLFxuXHRcdFx0XHRwbHVnaW5Tb3VyY2VJbnN0YWxsVXJpczogbmV3IE1hcChbWydwaXAnLCBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9waXAvbXktcGtnJyldXSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5QaXAsIHBhY2thZ2U6ICdteS1wa2cnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdXBkYXRlZCA9IGF3YWl0IHNlcnZpY2UudXBkYXRlUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cGRhdGVkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudGVybWluYWxDb21tYW5kcy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndXBkYXRlQWxsUGx1Z2lucycsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGluc3RhbGxlZFBsdWdpbihuYW1lOiBzdHJpbmcsIG1hcmtldHBsYWNlOiBzdHJpbmcpOiBJTWFya2V0cGxhY2VJbnN0YWxsZWRQbHVnaW4ge1xuXHRcdFx0Y29uc3QgbWFya2V0cGxhY2VSZWZlcmVuY2UgPSBtYWtlTWFya2V0cGxhY2VSZWYobWFya2V0cGxhY2UpO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0bWFya2V0cGxhY2UsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlLFxuXHRcdFx0XHRzb3VyY2U6IGBwbHVnaW5zLyR7bmFtZX1gLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiBgcGx1Z2lucy8ke25hbWV9YCB9LFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4geyBwbHVnaW5Vcmk6IFVSSS5maWxlKGAvcGx1Z2lucy8ke25hbWV9YCksIHBsdWdpbiB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ3VwZGF0ZXMgb25seSB0aGUgdGFyZ2V0ZWQgbWFya2V0cGxhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaXJzdCA9IGluc3RhbGxlZFBsdWdpbignZmlyc3QnLCAnbWljcm9zb2Z0L2ZpcnN0Jyk7XG5cdFx0XHRjb25zdCBzZWNvbmQgPSBpbnN0YWxsZWRQbHVnaW4oJ3NlY29uZCcsICdtaWNyb3NvZnQvc2Vjb25kJyk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHsgaW5zdGFsbGVkUGx1Z2luczogW2ZpcnN0LCBzZWNvbmRdIH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnVwZGF0ZUFsbFBsdWdpbnMoe1xuXHRcdFx0XHRzaWxlbnQ6IHRydWUsXG5cdFx0XHRcdGF1dG9tYXRpYzogdHJ1ZSxcblx0XHRcdFx0bWFya2V0cGxhY2VJZHM6IG5ldyBTZXQoW2ZpcnN0LnBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZS5jYW5vbmljYWxJZF0pLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwdWxsZWQ6IHN0YXRlLnB1bGxSZXBvc2l0b3J5Q2FsbHMubWFwKGNhbGwgPT4gY2FsbC5tYXJrZXRwbGFjZS5jYW5vbmljYWxJZCksXG5cdFx0XHRcdGZldGNoZWQ6IHN0YXRlLmZldGNoTWFya2V0cGxhY2VDYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cHVsbGVkOiBbZmlyc3QucGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLmNhbm9uaWNhbElkXSxcblx0XHRcdFx0ZmV0Y2hlZDogW1tmaXJzdC5wbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UuY2Fub25pY2FsSWRdXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVjaGVja3MgbWFuYWdlZCBhdXRvLXVwZGF0ZSBwb2xpY3kgYmVmb3JlIGFuIGF1dG9tYXRpYyB1cGRhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YWxsZWQgPSBpbnN0YWxsZWRQbHVnaW4oJ2Jsb2NrZWQnLCAnbWljcm9zb2Z0L2Jsb2NrZWQnKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRpbnN0YWxsZWRQbHVnaW5zOiBbaW5zdGFsbGVkXSxcblx0XHRcdFx0YXV0b1VwZGF0ZUJ5TWFya2V0cGxhY2U6IG5ldyBNYXAoW1tpbnN0YWxsZWQucGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLmNhbm9uaWNhbElkLCBmYWxzZV1dKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnVwZGF0ZUFsbFBsdWdpbnMoe1xuXHRcdFx0XHRzaWxlbnQ6IHRydWUsXG5cdFx0XHRcdGF1dG9tYXRpYzogdHJ1ZSxcblx0XHRcdFx0bWFya2V0cGxhY2VJZHM6IG5ldyBTZXQoW2luc3RhbGxlZC5wbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UuY2Fub25pY2FsSWRdKSxcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLnB1bGxSZXBvc2l0b3J5Q2FsbHMsIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuZmV0Y2hNYXJrZXRwbGFjZUNhbGxzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdibG9ja3MgdXBkYXRlcyB3aGVuIHRoZSBzdHJpY3QgbWFya2V0cGxhY2UgcG9saWN5IGRpc2FsbG93cyB0aGUgc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFsbGVkID0gaW5zdGFsbGVkUGx1Z2luKCdibG9ja2VkJywgJ21pY3Jvc29mdC9ibG9ja2VkJyk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0aW5zdGFsbGVkUGx1Z2luczogW2luc3RhbGxlZF0sXG5cdFx0XHRcdHN0cmljdE1hcmtldHBsYWNlUG9saWN5QWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVRydXN0ZWQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UudXBkYXRlQWxsUGx1Z2lucyh7IHNpbGVudDogdHJ1ZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZmFpbGVkTmFtZXMsIFtpbnN0YWxsZWQucGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLmRpc3BsYXlMYWJlbF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5wdWxsUmVwb3NpdG9yeUNhbGxzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0Ly8gaW5zdGFsbFBsdWdpbiBcdTIwMTQgbWFya2V0cGxhY2UgdHJ1c3Rcblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHN1aXRlKCdpbnN0YWxsUGx1Z2luIFx1MjAxNCBtYXJrZXRwbGFjZSB0cnVzdCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3NraXBzIHRydXN0IHByb21wdCB3aGVuIG1hcmtldHBsYWNlIGlzIGFscmVhZHkgdHJ1c3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2UoeyBtYXJrZXRwbGFjZVRydXN0ZWQ6IHRydWUgfSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2U6ICdwbHVnaW5zL215UGx1Z2luJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvbXlQbHVnaW4nIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50cnVzdGVkTWFya2V0cGxhY2VzLmxlbmd0aCwgMCwgJ3Nob3VsZCBub3QgcmUtdHJ1c3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3dzIHRydXN0IHByb21wdCBhbmQgaW5zdGFsbHMgd2hlbiB1c2VyIGNvbmZpcm1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7IG1hcmtldHBsYWNlVHJ1c3RlZDogZmFsc2UsIGRpYWxvZ0NvbmZpcm1SZXN1bHQ6IHRydWUgfSk7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRzb3VyY2U6ICdwbHVnaW5zL215UGx1Z2luJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvbXlQbHVnaW4nIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luKHBsdWdpbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50cnVzdGVkTWFya2V0cGxhY2VzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBpbnN0YWxsIHdoZW4gdXNlciBkZWNsaW5lcyB0cnVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2UoeyBtYXJrZXRwbGFjZVRydXN0ZWQ6IGZhbHNlLCBkaWFsb2dDb25maXJtUmVzdWx0OiBmYWxzZSB9KTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdHNvdXJjZTogJ3BsdWdpbnMvbXlQbHVnaW4nLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncGx1Z2lucy9teVBsdWdpbicgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLmluc3RhbGxQbHVnaW4ocGx1Z2luKSwgKGVycjogdW5rbm93bikgPT4gaXNDYW5jZWxsYXRpb25FcnJvcihlcnIgYXMgRXJyb3IpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnRydXN0ZWRNYXJrZXRwbGFjZXMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RydXN0IHByb21wdCBhcHBsaWVzIHRvIGFsbCBzb3VyY2Uga2luZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHsgbWFya2V0cGxhY2VUcnVzdGVkOiBmYWxzZSwgZGlhbG9nQ29uZmlybVJlc3VsdDogZmFsc2UgfSk7XG5cblx0XHRcdGNvbnN0IGtpbmRzOiBJUGx1Z2luU291cmNlRGVzY3JpcHRvcltdID0gW1xuXHRcdFx0XHR7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncCcgfSxcblx0XHRcdFx0eyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nIH0sXG5cdFx0XHRcdHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRVcmwsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vcmVwby5naXQnIH0sXG5cdFx0XHRcdHsga2luZDogUGx1Z2luU291cmNlS2luZC5OcG0sIHBhY2thZ2U6ICdteS1wa2cnIH0sXG5cdFx0XHRcdHsga2luZDogUGx1Z2luU291cmNlS2luZC5QaXAsIHBhY2thZ2U6ICdteS1wa2cnIH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHNvdXJjZURlc2NyaXB0b3Igb2Yga2luZHMpIHtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gc2VydmljZS5pbnN0YWxsUGx1Z2luKGNyZWF0ZVBsdWdpbih7IHNvdXJjZURlc2NyaXB0b3IgfSkpLCAoZXJyOiB1bmtub3duKSA9PiBpc0NhbmNlbGxhdGlvbkVycm9yKGVyciBhcyBFcnJvcikpO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCwgJ25vIHBsdWdpbnMgc2hvdWxkIGJlIGluc3RhbGxlZCB3aGVuIHRydXN0IGlzIGRlY2xpbmVkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0Ly8gaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2Vcblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHN1aXRlKCdpbnN0YWxsUGx1Z2luRnJvbVNvdXJjZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JlamVjdHMgaW52YWxpZCBzb3VyY2Ugc3RyaW5ncycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UoJ25vdCBhIHZhbGlkIHNvdXJjZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0Lm1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsaWRhdGVQbHVnaW5Tb3VyY2UgYWNjZXB0cyBnaXQgYW5kIGxvY2FsIHNvdXJjZXMgYW5kIHJlamVjdHMgZ2FyYmFnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudmFsaWRhdGVQbHVnaW5Tb3VyY2UoJ293bmVyL3JlcG8nKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnZhbGlkYXRlUGx1Z2luU291cmNlKCdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby5naXQnKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnZhbGlkYXRlUGx1Z2luU291cmNlKCdmaWxlOi8vL3NvbWUvcGF0aCcpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudmFsaWRhdGVQbHVnaW5Tb3VyY2UoJy9hYnMvcGF0aCcpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudmFsaWRhdGVQbHVnaW5Tb3VyY2UoJ34vcGx1Z2lucy9mb28nKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLnZhbGlkYXRlUGx1Z2luU291cmNlKCdub3QgYSB2YWxpZCBzb3VyY2UnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnN0YWxscyBhIGxvY2FsIGZvbGRlciBtYXJrZXRwbGFjZSBhbmQgcmVnaXN0ZXJzIGl0IHVuZGVyIGNoYXQucGx1Z2lucy5tYXJrZXRwbGFjZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWYgPSBtYWtlTWFya2V0cGxhY2VSZWYoJ2ZpbGU6Ly8vc29tZS9tYXJrZXRwbGFjZScpO1xuXHRcdFx0Y29uc3QgZGlzY292ZXJlZFBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdG5hbWU6ICdsb2NhbC1tYXJrZXRwbGFjZS1wbHVnaW4nLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAnJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogcmVmLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHJlZixcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuT3BlblBsdWdpbixcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdHJlYWRQbHVnaW5zUmVzdWx0OiBbZGlzY292ZXJlZFBsdWdpbl0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnZmlsZTovLy9zb21lL21hcmtldHBsYWNlJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5ub3RpZmljYXRpb25zLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zWzBdLnBsdWdpbi5uYW1lLCAnbG9jYWwtbWFya2V0cGxhY2UtcGx1Z2luJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLnVwZGF0ZWRNYXJrZXRwbGFjZXMsIFsnZmlsZTovLy9zb21lL21hcmtldHBsYWNlJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnVwZGF0ZWRQbHVnaW5Mb2NhdGlvbnMsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBwZXJzaXN0IGEgbG9jYWwgbWFya2V0cGxhY2UgdG8gY29uZmlnIHdoZW4gdHJ1c3QgaXMgZGVjbGluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWYgPSBtYWtlTWFya2V0cGxhY2VSZWYoJ2ZpbGU6Ly8vc29tZS9tYXJrZXRwbGFjZScpO1xuXHRcdFx0Y29uc3QgZGlzY292ZXJlZFBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdG5hbWU6ICdsb2NhbC1tYXJrZXRwbGFjZS1wbHVnaW4nLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAnJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogcmVmLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHJlZixcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuT3BlblBsdWdpbixcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdHJlYWRQbHVnaW5zUmVzdWx0OiBbZGlzY292ZXJlZFBsdWdpbl0sXG5cdFx0XHRcdG1hcmtldHBsYWNlVHJ1c3RlZDogZmFsc2UsXG5cdFx0XHRcdGRpYWxvZ0NvbmZpcm1SZXN1bHQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UoJ2ZpbGU6Ly8vc29tZS9tYXJrZXRwbGFjZScpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS51cGRhdGVkTWFya2V0cGxhY2VzLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVnaXN0ZXJzIGEgbG9jYWwgZm9sZGVyIHN0YW5kYWxvbmUgcGx1Z2luIHVuZGVyIGNoYXQucGx1Z2luTG9jYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdHJlYWRQbHVnaW5zUmVzdWx0OiBbXSxcblx0XHRcdFx0aXNQbHVnaW5EaXJlY3RvcnlSZXN1bHQ6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnL2Ficy9teS1wbHVnaW4nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm5vdGlmaWNhdGlvbnMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUudXBkYXRlZFBsdWdpbkxvY2F0aW9ucywgeyAnL2Ficy9teS1wbHVnaW4nOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnVwZGF0ZWRNYXJrZXRwbGFjZXMsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHBhbmRzIH4gcGF0aHMgYnV0IHBlcnNpc3RzIHRoZSBvcmlnaW5hbCBmb3JtIGluIGNoYXQucGx1Z2luTG9jYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdHJlYWRQbHVnaW5zUmVzdWx0OiBbXSxcblx0XHRcdFx0aXNQbHVnaW5EaXJlY3RvcnlSZXN1bHQ6IHRydWUsXG5cdFx0XHRcdHVzZXJIb21lOiAnL2hvbWUvdXNlcicsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnfi9teS1wbHVnaW4nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS51cGRhdGVkUGx1Z2luTG9jYXRpb25zLCB7ICd+L215LXBsdWdpbic6IHRydWUgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWdpc3RlcnMgYSBmaWxlOi8vIHN0YW5kYWxvbmUgcGx1Z2luIHVzaW5nIGl0cyBmaWxlc3lzdGVtIHBhdGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0cmVhZFBsdWdpbnNSZXN1bHQ6IFtdLFxuXHRcdFx0XHRpc1BsdWdpbkRpcmVjdG9yeVJlc3VsdDogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCdmaWxlOi8vL3NvbWUvcGx1Z2luJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZS51cGRhdGVkUGx1Z2luTG9jYXRpb25zKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoT2JqZWN0LnZhbHVlcyhzdGF0ZS51cGRhdGVkUGx1Z2luTG9jYXRpb25zISksIFt0cnVlXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoT2JqZWN0LmtleXMoc3RhdGUudXBkYXRlZFBsdWdpbkxvY2F0aW9ucyEpLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBlcnJvciB3aGVuIGxvY2FsIGZvbGRlciBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRyZXNvbHZlSXNEaXJlY3Rvcnk6IGZhbHNlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UoJy9hYnMvbWlzc2luZycpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQubWVzc2FnZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudXBkYXRlZFBsdWdpbkxvY2F0aW9ucywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3dzIGVycm9yIHdoZW4gbG9jYWwgZm9sZGVyIGlzIG5laXRoZXIgYSBtYXJrZXRwbGFjZSBub3IgYSBwbHVnaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0cmVhZFBsdWdpbnNSZXN1bHQ6IFtdLFxuXHRcdFx0XHRpc1BsdWdpbkRpcmVjdG9yeVJlc3VsdDogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnL2Ficy9lbXB0eScpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQubWVzc2FnZT8uaW5jbHVkZXMoJ05vIHBsdWdpbiBvciBtYXJrZXRwbGFjZSBmb3VuZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS51cGRhdGVkUGx1Z2luTG9jYXRpb25zLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5zdGFsbHMgc2luZ2xlIHBsdWdpbiBmcm9tIEdpdEh1YiBzaG9ydGhhbmQgd2l0aCBtYXJrZXRwbGFjZS5qc29uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVmID0gbWFrZU1hcmtldHBsYWNlUmVmKCdvd25lci9teS1wbHVnaW4nKTtcblx0XHRcdGNvbnN0IGRpc2NvdmVyZWRQbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRuYW1lOiAnbXktZGlzY292ZXJlZC1wbHVnaW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0EgZGlzY292ZXJlZCBwbHVnaW4nLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAnJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogcmVmLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHJlZixcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuT3BlblBsdWdpbixcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdGF0ZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGVuc3VyZVBsdWdpblNvdXJjZVJlc3VsdDogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMvZ2l0aHViLmNvbS9vd25lci9teS1wbHVnaW4nKSxcblx0XHRcdFx0cmVhZFBsdWdpbnNSZXN1bHQ6IFtkaXNjb3ZlcmVkUGx1Z2luXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCdvd25lci9teS1wbHVnaW4nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2luc1swXS5wbHVnaW4ubmFtZSwgJ215LWRpc2NvdmVyZWQtcGx1Z2luJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBlcnJvciB3aGVuIG5vIG1hcmtldHBsYWNlLmpzb24gZm91bmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL293bmVyL2Nvb2wtdG9vbCcpLFxuXHRcdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW10sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnb3duZXIvY29vbC10b29sJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VjY2VzcywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5tZXNzYWdlPy5pbmNsdWRlcygnTm8gcGx1Z2lucyBmb3VuZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3dzIHF1aWNrIHBpY2sgZm9yIG11bHRpLXBsdWdpbiByZXBvcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZiA9IG1ha2VNYXJrZXRwbGFjZVJlZignb3duZXIvbXVsdGktcmVwbycpO1xuXHRcdFx0Y29uc3QgcGx1Z2luQSA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdG5hbWU6ICdwbHVnaW4tYScsXG5cdFx0XHRcdHNvdXJjZTogJ3BsdWdpbnMvYScsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICdwbHVnaW5zL2EnIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiByZWYuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW5CID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0bmFtZTogJ3BsdWdpbi1iJyxcblx0XHRcdFx0c291cmNlOiAncGx1Z2lucy9iJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvYicgfSxcblx0XHRcdFx0bWFya2V0cGxhY2U6IHJlZi5kaXNwbGF5TGFiZWwsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiByZWYsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvbXVsdGktcmVwbycpLFxuXHRcdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW3BsdWdpbkEsIHBsdWdpbkJdLFxuXHRcdFx0XHRxdWlja1BpY2tSZXN1bHQ6IHsgbGFiZWw6ICdwbHVnaW4tYicgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCdvd25lci9tdWx0aS1yZXBvJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnNbMF0ucGx1Z2luLm5hbWUsICdwbHVnaW4tYicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlLmFkZGVkUGx1Z2luc1swXS51cmkuaW5jbHVkZXMoJ3BsdWdpbnMvYicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGluc3RhbGwgd2hlbiBxdWljayBwaWNrIGlzIGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZiA9IG1ha2VNYXJrZXRwbGFjZVJlZignb3duZXIvbXVsdGktcmVwbycpO1xuXHRcdFx0Y29uc3QgcGx1Z2luQSA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdG5hbWU6ICdwbHVnaW4tYScsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICdwbHVnaW5zL2EnIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiByZWYuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwbHVnaW5CID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0bmFtZTogJ3BsdWdpbi1iJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvYicgfSxcblx0XHRcdFx0bWFya2V0cGxhY2U6IHJlZi5kaXNwbGF5TGFiZWwsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiByZWYsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvbXVsdGktcmVwbycpLFxuXHRcdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW3BsdWdpbkEsIHBsdWdpbkJdLFxuXHRcdFx0XHRxdWlja1BpY2tSZXN1bHQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCdvd25lci9tdWx0aS1yZXBvJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGluc3RhbGwgd2hlbiB0cnVzdCBpcyBkZWNsaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRtYXJrZXRwbGFjZVRydXN0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRkaWFsb2dDb25maXJtUmVzdWx0OiBmYWxzZSxcblx0XHRcdFx0cmVhZFBsdWdpbnNSZXN1bHQ6IFtdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UoJ293bmVyL3JlcG8nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgZXJyb3Igd2hlbiBubyBwbHVnaW5zIGZvdW5kIGluIGdpdCBVUkwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL293bmVyL215LXRvb2wnKSxcblx0XHRcdFx0cmVhZFBsdWdpbnNSZXN1bHQ6IFtdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9teS10b29sLmdpdCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQubWVzc2FnZT8uaW5jbHVkZXMoJ05vIHBsdWdpbnMgZm91bmQnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYWRkZWRQbHVnaW5zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBlcnJvciB3aGVuIGNsb25lIGRpcmVjdG9yeSBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvbWlzc2luZycpLFxuXHRcdFx0XHRmaWxlRXhpc3RzUmVzdWx0OiBmYWxzZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmluc3RhbGxQbHVnaW5Gcm9tU291cmNlKCdvd25lci9taXNzaW5nJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VjY2VzcywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5tZXNzYWdlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZHMgbWFya2V0cGxhY2UgdG8gY29uZmlnIGFmdGVyIGluc3RhbGxpbmcgc2luZ2xlIHBsdWdpbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZiA9IG1ha2VNYXJrZXRwbGFjZVJlZignb3duZXIvbXktcGx1Z2luJyk7XG5cdFx0XHRjb25zdCBkaXNjb3ZlcmVkUGx1Z2luID0gY3JlYXRlUGx1Z2luKHtcblx0XHRcdFx0bmFtZTogJ215LWRpc2NvdmVyZWQtcGx1Z2luJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJycgfSxcblx0XHRcdFx0bWFya2V0cGxhY2U6IHJlZi5kaXNwbGF5TGFiZWwsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiByZWYsXG5cdFx0XHRcdG1hcmtldHBsYWNlVHlwZTogTWFya2V0cGxhY2VUeXBlLk9wZW5QbHVnaW4sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgc3RhdGUgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0XHRlbnN1cmVQbHVnaW5Tb3VyY2VSZXN1bHQ6IFVSSS5maWxlKCcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvbXktcGx1Z2luJyksXG5cdFx0XHRcdHJlYWRQbHVnaW5zUmVzdWx0OiBbZGlzY292ZXJlZFBsdWdpbl0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnb3duZXIvbXktcGx1Z2luJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUudXBkYXRlZE1hcmtldHBsYWNlcywgWydvd25lci9teS1wbHVnaW4nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZGRzIG1hcmtldHBsYWNlIHRvIGNvbmZpZyBhZnRlciBwaWNraW5nIGZyb20gbXVsdGktcGx1Z2luIHJlcG8nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWYgPSBtYWtlTWFya2V0cGxhY2VSZWYoJ293bmVyL211bHRpLXJlcG8nKTtcblx0XHRcdGNvbnN0IHBsdWdpbkEgPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRuYW1lOiAncGx1Z2luLWEnLFxuXHRcdFx0XHRzb3VyY2U6ICdwbHVnaW5zL2EnLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncGx1Z2lucy9hJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogcmVmLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHJlZixcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luQiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdG5hbWU6ICdwbHVnaW4tYicsXG5cdFx0XHRcdHNvdXJjZTogJ3BsdWdpbnMvYicsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICdwbHVnaW5zL2InIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiByZWYuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL293bmVyL211bHRpLXJlcG8nKSxcblx0XHRcdFx0cmVhZFBsdWdpbnNSZXN1bHQ6IFtwbHVnaW5BLCBwbHVnaW5CXSxcblx0XHRcdFx0cXVpY2tQaWNrUmVzdWx0OiB7IGxhYmVsOiAncGx1Z2luLWEnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnb3duZXIvbXVsdGktcmVwbycpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLnVwZGF0ZWRNYXJrZXRwbGFjZXMsIFsnb3duZXIvbXVsdGktcmVwbyddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGR1cGxpY2F0ZSBtYXJrZXRwbGFjZSBpbiBjb25maWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWYgPSBtYWtlTWFya2V0cGxhY2VSZWYoJ293bmVyL215LXBsdWdpbicpO1xuXHRcdFx0Y29uc3QgZGlzY292ZXJlZFBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdG5hbWU6ICdteS1kaXNjb3ZlcmVkLXBsdWdpbicsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6ICcnIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiByZWYuZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcmVmLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5PcGVuUGx1Z2luLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL293bmVyL215LXBsdWdpbicpLFxuXHRcdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW2Rpc2NvdmVyZWRQbHVnaW5dLFxuXHRcdFx0XHRjb25maWd1cmVkTWFya2V0cGxhY2VzOiBbJ293bmVyL215LXBsdWdpbiddLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UoJ293bmVyL215LXBsdWdpbicpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudXBkYXRlZE1hcmtldHBsYWNlcywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gc2luZ2xlLXBsdWdpbiBtYW5pZmVzdCB3aGVuIG5vIG1hcmtldHBsYWNlLmpzb24gZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVmID0gbWFrZU1hcmtldHBsYWNlUmVmKCdvd25lci9zaW5nbGUtcGx1Z2luLXJlcG8nKTtcblx0XHRcdGNvbnN0IHNpbmdsZVBsdWdpbiA9IGNyZWF0ZVBsdWdpbih7XG5cdFx0XHRcdG5hbWU6ICdzaW5nbGUtcGx1Z2luLXJlcG8nLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvc2luZ2xlLXBsdWdpbi1yZXBvJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogcmVmLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHJlZixcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ2xhdWRlLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL293bmVyL3NpbmdsZS1wbHVnaW4tcmVwbycpLFxuXHRcdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW10sXG5cdFx0XHRcdHNpbmdsZVBsdWdpbk1hbmlmZXN0UmVzdWx0OiBzaW5nbGVQbHVnaW4sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnb3duZXIvc2luZ2xlLXBsdWdpbi1yZXBvJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hZGRlZFBsdWdpbnNbMF0ucGx1Z2luLm5hbWUsICdzaW5nbGUtcGx1Z2luLXJlcG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5ub3RpZmljYXRpb25zLmxlbmd0aCwgMCk7XG5cdFx0XHQvLyBTaW5nbGUtcGx1Z2luIHJlcG9zIGFyZSBub3QgbWFya2V0cGxhY2VzIFx1MjAxNCBjb25maWcgbXVzdCBOT1QgYmUgdG91Y2hlZC5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS51cGRhdGVkTWFya2V0cGxhY2VzLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwb3J0cyBlcnJvciB3aGVuIHNpbmdsZS1wbHVnaW4gbWFuaWZlc3QgbmFtZSBkb2VzIG5vdCBtYXRjaCBvcHRpb25zLnBsdWdpbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlZiA9IG1ha2VNYXJrZXRwbGFjZVJlZignb3duZXIvc2luZ2xlLXBsdWdpbi1yZXBvJyk7XG5cdFx0XHRjb25zdCBzaW5nbGVQbHVnaW4gPSBjcmVhdGVQbHVnaW4oe1xuXHRcdFx0XHRuYW1lOiAnYWN0dWFsLW5hbWUnLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvc2luZ2xlLXBsdWdpbi1yZXBvJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogcmVmLmRpc3BsYXlMYWJlbCxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHJlZixcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ2xhdWRlLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL293bmVyL3NpbmdsZS1wbHVnaW4tcmVwbycpLFxuXHRcdFx0XHRyZWFkUGx1Z2luc1Jlc3VsdDogW10sXG5cdFx0XHRcdHNpbmdsZVBsdWdpbk1hbmlmZXN0UmVzdWx0OiBzaW5nbGVQbHVnaW4sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5pbnN0YWxsUGx1Z2luRnJvbVNvdXJjZSgnb3duZXIvc2luZ2xlLXBsdWdpbi1yZXBvJywgeyBwbHVnaW46ICdyZXF1ZXN0ZWQtbmFtZScgfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VjY2VzcywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5tZXNzYWdlPy5pbmNsdWRlcygnbm90IGZvdW5kJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RpbGwgcmVwb3J0cyBcIm5vIHBsdWdpbnMgZm91bmRcIiB3aGVuIG5laXRoZXIgbWFya2V0cGxhY2UuanNvbiBub3Igc2luZ2xlLXBsdWdpbiBtYW5pZmVzdCBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHN0YXRlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdFx0ZW5zdXJlUGx1Z2luU291cmNlUmVzdWx0OiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL293bmVyL2VtcHR5LXJlcG8nKSxcblx0XHRcdFx0cmVhZFBsdWdpbnNSZXN1bHQ6IFtdLFxuXHRcdFx0XHRzaW5nbGVQbHVnaW5NYW5pZmVzdFJlc3VsdDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UoJ293bmVyL2VtcHR5LXJlcG8nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0Lm1lc3NhZ2U/LmluY2x1ZGVzKCdObyBwbHVnaW5zIGZvdW5kJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmFkZGVkUGx1Z2lucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMscUNBQXVGO0FBQ2hHLFNBQVMseUJBQXlCO0FBQ2xDLFNBQWlGLDJCQUFvRCxpQkFBaUIsMkJBQTJCLHdCQUF3QjtBQUd6TSxNQUFNLHdCQUF3QixNQUFNO0FBQ25DLFFBQU0sUUFBUSx3Q0FBd0M7QUFJdEQsV0FBUyxtQkFBbUIsYUFBNEM7QUFDdkUsVUFBTSxNQUFNLDBCQUEwQixXQUFXO0FBQ2pELFdBQU8sR0FBRyxHQUFHO0FBQ2IsV0FBTztBQUFBLEVBQ1I7QUFFQSxXQUFTLGFBQWEsV0FBNEc7QUFDakksV0FBTztBQUFBLE1BQ04sTUFBTSxVQUFVLFFBQVE7QUFBQSxNQUN4QixhQUFhLFVBQVUsZUFBZTtBQUFBLE1BQ3RDLFNBQVMsVUFBVSxXQUFXO0FBQUEsTUFDOUIsUUFBUSxVQUFVLFVBQVU7QUFBQSxNQUM1QixrQkFBa0IsVUFBVTtBQUFBLE1BQzVCLGFBQWEsVUFBVSxlQUFlO0FBQUEsTUFDdEMsc0JBQXNCLFVBQVUsd0JBQXdCLG1CQUFtQixrQkFBa0I7QUFBQSxNQUM3RixpQkFBaUIsVUFBVSxtQkFBbUIsZ0JBQWdCO0FBQUEsTUFDOUQsV0FBVyxVQUFVO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBd0RBLFdBQVMsaUJBQTRCO0FBQ3BDLFdBQU87QUFBQSxNQUNOLGVBQWUsQ0FBQztBQUFBLE1BQ2hCLGNBQWMsQ0FBQztBQUFBLE1BQ2YscUJBQXFCO0FBQUEsTUFDckIsa0JBQWtCO0FBQUEsTUFDbEIsd0JBQXdCLElBQUksS0FBSyxpREFBaUQ7QUFBQSxNQUNsRiwwQkFBMEIsSUFBSSxLQUFLLG9DQUFvQztBQUFBLE1BQ3ZFLHlCQUF5QixvQkFBSSxJQUFJO0FBQUEsTUFDakMsa0JBQWtCLENBQUM7QUFBQSxNQUNuQixrQkFBa0I7QUFBQSxNQUNsQixtQkFBbUI7QUFBQSxNQUNuQixxQkFBcUIsQ0FBQztBQUFBLE1BQ3RCLHlCQUF5QixDQUFDO0FBQUEsTUFDMUIsb0JBQW9CO0FBQUEsTUFDcEIsK0JBQStCO0FBQUEsTUFDL0Isa0JBQWtCLENBQUM7QUFBQSxNQUNuQiwyQkFBMkIsQ0FBQztBQUFBLE1BQzVCLHVCQUF1QixDQUFDO0FBQUEsTUFDeEIseUJBQXlCLG9CQUFJLElBQUk7QUFBQSxNQUNqQyw0QkFBNEI7QUFBQSxNQUM1QixxQkFBcUIsQ0FBQztBQUFBLE1BQ3RCLG1CQUFtQixDQUFDO0FBQUEsTUFDcEIsNEJBQTRCO0FBQUEsTUFDNUIsaUJBQWlCO0FBQUEsTUFDakIsa0JBQWtCO0FBQUEsTUFDbEIsd0JBQXdCLENBQUM7QUFBQSxNQUN6QixxQkFBcUI7QUFBQSxNQUNyQixvQkFBb0I7QUFBQSxNQUNwQix5QkFBeUI7QUFBQSxNQUN6QiwyQkFBMkIsQ0FBQztBQUFBLE1BQzVCLHdCQUF3QjtBQUFBLE1BQ3hCLFVBQVU7QUFBQSxJQUNYO0FBQUEsRUFDRDtBQUVBLFdBQVMsY0FBYyxnQkFBMEY7QUFDaEgsVUFBTSxRQUFtQixFQUFFLEdBQUcsZUFBZSxHQUFHLEdBQUcsZUFBZTtBQUNsRSxVQUFNLHVCQUF1QixNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUdyRSx5QkFBcUIsS0FBSyxjQUFjO0FBQUEsTUFDdkMsUUFBUSxPQUFPLGFBQWtCO0FBQ2hDLFlBQUksT0FBTyxNQUFNLHFCQUFxQixZQUFZO0FBQ2pELGlCQUFPLE1BQU0saUJBQWlCLFFBQVE7QUFBQSxRQUN2QztBQUNBLGVBQU8sTUFBTTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLFNBQVMsT0FBTyxjQUFtQixFQUFFLFVBQVUsYUFBYSxNQUFNLG1CQUFtQjtBQUFBLElBQ3RGLENBQTRCO0FBRzVCLHlCQUFxQixLQUFLLHNCQUFzQjtBQUFBLE1BQy9DLFFBQVEsQ0FBQyxpQkFBZ0g7QUFDeEgsY0FBTSxjQUFjLEtBQUssRUFBRSxVQUFVLGFBQWEsVUFBVSxTQUFTLGFBQWEsUUFBUSxDQUFDO0FBQzNGLHFCQUFhLFNBQVMsU0FBUyxRQUFRLFlBQVUsT0FBTyxRQUFRLENBQUM7QUFDakUsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQW9DO0FBR3BDLHlCQUFxQixLQUFLLGdCQUFnQjtBQUFBLE1BQ3pDLFNBQVMsYUFBYSxFQUFFLFdBQVcsTUFBTSxvQkFBb0I7QUFBQSxJQUM5RCxDQUE4QjtBQUk5Qix5QkFBcUIsS0FBSyxrQkFBa0I7QUFBQSxNQUMzQyxnQkFBZ0IsWUFBWTtBQUMzQixZQUFJO0FBQ0osZUFBTztBQUFBLFVBQ04sY0FBYyxRQUFRLFFBQVE7QUFBQSxVQUM5QixTQUFTLE1BQU07QUFBQSxVQUFFO0FBQUEsVUFDakIsWUFBWSxDQUFDLFNBQWlCLGdCQUEwQjtBQUN2RCxrQkFBTSxpQkFBaUIsS0FBSyxPQUFPO0FBRW5DLGdCQUFJLGtCQUFrQjtBQUNyQiwrQkFBaUIsRUFBRSxJQUFJLFdBQVcsVUFBVSxNQUFNLGlCQUFpQixDQUFDO0FBQUEsWUFDckU7QUFBQSxVQUNEO0FBQUEsVUFDQSxjQUFjO0FBQUEsWUFDYixLQUFLLE1BQU0sTUFBTSxvQkFBb0I7QUFBQSxjQUNwQyxtQkFBbUIsQ0FBQyxhQUE4RDtBQUNqRixtQ0FBbUI7QUFDbkIsdUJBQU8sRUFBRSxVQUFVO0FBQUEsZ0JBQUUsRUFBRTtBQUFBLGNBQ3hCO0FBQUEsWUFDRCxJQUFJO0FBQUEsWUFDSixvQ0FBb0MsT0FBTyxFQUFFLFVBQVU7QUFBQSxZQUFFLEVBQUU7QUFBQSxVQUM1RDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsTUFDQSxtQkFBbUIsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUM1QixDQUFnQztBQUdoQyx5QkFBcUIsS0FBSyxrQkFBa0I7QUFBQSxNQUMzQyxjQUFjLE9BQU8sVUFBbUIsYUFBdUQsU0FBUztBQUFBLElBQ3pHLENBQWdDO0FBR2hDLHlCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFJM0QsVUFBTSxzQkFBc0IsQ0FBQyxVQUEyQztBQUFBLE1BQ3ZFO0FBQUEsTUFDQSxrQkFBa0IsTUFBTSxJQUFJLEtBQUssZUFBZTtBQUFBLE1BQ2hELGVBQWUsTUFBTSxJQUFJLEtBQUssT0FBTztBQUFBLE1BQ3JDLFFBQVEsWUFBWSxNQUFNO0FBQUEsTUFDMUIsUUFBUSxZQUFZO0FBQUEsTUFDcEIsVUFBVSxDQUFDLE1BQU0sU0FBUyxpQkFBaUIsTUFBTyxFQUEwQixVQUFXLEVBQTBCO0FBQUEsTUFDakgsWUFBWSxPQUFPLGFBQWtCLFdBQWdCLFdBQStCO0FBRW5GLFlBQUksQ0FBQyxNQUFNLHFCQUFxQjtBQUMvQixpQkFBTztBQUFBLFFBQ1I7QUFHQSxjQUFNLGFBQWEsT0FBTztBQUMxQixZQUFJO0FBQ0osWUFBSSxTQUFTLGlCQUFpQixLQUFLO0FBQ2xDLGdCQUFNLE1BQU07QUFDWixnQkFBTSxjQUFjLElBQUksVUFBVSxHQUFHLElBQUksT0FBTyxJQUFJLElBQUksT0FBTyxLQUFLLElBQUk7QUFDeEUsaUJBQU8sQ0FBQyxPQUFPLFdBQVcsWUFBWSxZQUFZLFFBQVEsV0FBVztBQUNyRSxjQUFJLElBQUksVUFBVTtBQUNqQixpQkFBSyxLQUFLLGNBQWMsSUFBSSxRQUFRO0FBQUEsVUFDckM7QUFBQSxRQUNELE9BQU87QUFDTixnQkFBTSxNQUFNO0FBQ1osZ0JBQU0sY0FBYyxJQUFJLFVBQVUsR0FBRyxJQUFJLE9BQU8sS0FBSyxJQUFJLE9BQU8sS0FBSyxJQUFJO0FBQ3pFLGlCQUFPLENBQUMsT0FBTyxXQUFXLFlBQVksWUFBWSxRQUFRLFdBQVc7QUFDckUsY0FBSSxJQUFJLFVBQVU7QUFDakIsaUJBQUssS0FBSyxlQUFlLElBQUksUUFBUTtBQUFBLFVBQ3RDO0FBQUEsUUFDRDtBQUNBLGNBQU0sVUFBVSxLQUFLLEtBQUssR0FBRztBQUM3QixjQUFNLGlCQUFpQixLQUFLLE9BQU87QUFFbkMsWUFBSSxNQUFNLHFCQUFxQixHQUFHO0FBQ2pDLGdCQUFNLGNBQWMsS0FBSyxFQUFFLFVBQVUsR0FBRyxTQUFTLGdFQUFnRSxNQUFNLGdCQUFnQixHQUFHLENBQUM7QUFDM0ksaUJBQU87QUFBQSxRQUNSO0FBR0EsY0FBTSxTQUFTLE9BQU8sTUFBTSxxQkFBcUIsYUFDOUMsTUFBTSxNQUFNLGlCQUFpQixTQUFTLElBQ3RDLE1BQU07QUFDVCxZQUFJLENBQUMsUUFBUTtBQUNaLGdCQUFNLFFBQVEsU0FBUyxpQkFBaUIsTUFBTSxRQUFRO0FBQ3RELGdCQUFNLE1BQU8sV0FBbUM7QUFDaEQsZ0JBQU0sY0FBYyxLQUFLLEVBQUUsVUFBVSxHQUFHLFNBQVMsR0FBRyxLQUFLLGFBQWEsR0FBRyxzQ0FBc0MsQ0FBQztBQUNoSCxpQkFBTztBQUFBLFFBQ1I7QUFFQSxlQUFPLEVBQUUsVUFBVTtBQUFBLE1BQ3BCO0FBQUEsSUFDRDtBQUVBLFVBQU0sa0JBQWtCLG9CQUFJLElBQXFDO0FBQUEsTUFDaEUsQ0FBQyxpQkFBaUIsY0FBYyxFQUFFLE1BQU0saUJBQWlCLGNBQWMsa0JBQWtCLE1BQU0sUUFBVyxlQUFlLE1BQU07QUFBRSxjQUFNLElBQUksTUFBTTtBQUFBLE1BQUcsR0FBRyxRQUFRLFlBQVk7QUFBRSxjQUFNLElBQUksTUFBTTtBQUFBLE1BQUcsR0FBRyxRQUFRLFlBQVk7QUFBRSxjQUFNLElBQUksTUFBTTtBQUFBLE1BQUcsR0FBRyxVQUFVLENBQUMsTUFBTyxFQUF1QixRQUFRLElBQUksQ0FBQztBQUFBLE1BQ3JTLENBQUMsaUJBQWlCLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixRQUFRLGtCQUFrQixNQUFNLElBQUksS0FBSyxPQUFPLEdBQUcsZUFBZSxNQUFNLElBQUksS0FBSyxPQUFPLEdBQUcsUUFBUSxZQUFZLElBQUksS0FBSyxPQUFPLEdBQUcsUUFBUSxZQUFZLE1BQU0sVUFBVSxDQUFDLE1BQU8sRUFBdUIsS0FBSyxDQUFDO0FBQUEsTUFDOVAsQ0FBQyxpQkFBaUIsUUFBUSxFQUFFLE1BQU0saUJBQWlCLFFBQVEsa0JBQWtCLE1BQU0sSUFBSSxLQUFLLE9BQU8sR0FBRyxlQUFlLE1BQU0sSUFBSSxLQUFLLE9BQU8sR0FBRyxRQUFRLFlBQVksSUFBSSxLQUFLLE9BQU8sR0FBRyxRQUFRLFlBQVksTUFBTSxVQUFVLENBQUMsTUFBTyxFQUFzQixJQUFJLENBQUM7QUFBQSxNQUM1UCxDQUFDLGlCQUFpQixLQUFLLG9CQUFvQixpQkFBaUIsR0FBRyxDQUFDO0FBQUEsTUFDaEUsQ0FBQyxpQkFBaUIsS0FBSyxvQkFBb0IsaUJBQWlCLEdBQUcsQ0FBQztBQUFBLElBQ2pFLENBQUM7QUFFRCx5QkFBcUIsS0FBSywrQkFBK0I7QUFBQSxNQUN4RCxxQkFBcUIsQ0FBQyxXQUErQjtBQUNwRCxZQUFJLE9BQU8saUJBQWlCLFNBQVMsaUJBQWlCLGNBQWM7QUFDbkUsaUJBQU8sTUFBTSx3QkFBd0IsSUFBSSxPQUFPLGlCQUFpQixJQUFJLEtBQUssSUFBSSxLQUFLLHVCQUF1QixPQUFPLGlCQUFpQixJQUFJLFVBQVU7QUFBQSxRQUNqSjtBQUNBLGVBQU8sSUFBSSxTQUFTLE1BQU0sd0JBQXdCLE9BQU8sTUFBTTtBQUFBLE1BQ2hFO0FBQUEsTUFDQSxrQkFBa0IsTUFBTSxNQUFNO0FBQUEsTUFDOUIsa0JBQWtCLE9BQU8sY0FBcUMsYUFBd0M7QUFDckcsZUFBTyxNQUFNO0FBQUEsTUFDZDtBQUFBLE1BQ0EsZ0JBQWdCLE9BQU8sYUFBb0MsWUFBcUM7QUFDL0YsY0FBTSxvQkFBb0IsS0FBSyxFQUFFLGFBQWEsUUFBUSxDQUFDO0FBQUEsTUFDeEQ7QUFBQSxNQUNBLDJCQUEyQixDQUFDLGVBQXdDO0FBQ25FLGNBQU0sTUFBTSxXQUFXO0FBQ3ZCLGVBQU8sTUFBTSx3QkFBd0IsSUFBSSxHQUFHLEtBQUssSUFBSSxLQUFLLHVCQUF1QixHQUFHLFVBQVU7QUFBQSxNQUMvRjtBQUFBLE1BQ0Esb0JBQW9CLFlBQVksTUFBTTtBQUFBLE1BQ3RDLG9CQUFvQixPQUFPLFFBQTRCLFlBQXFDO0FBQzNGLGNBQU0sd0JBQXdCLEtBQUssRUFBRSxRQUFRLFFBQVEsQ0FBQztBQUFBLE1BQ3ZEO0FBQUEsTUFDQSxpQkFBaUIsQ0FBQyxTQUEyQixnQkFBZ0IsSUFBSSxJQUFJO0FBQUEsTUFDckUscUJBQXFCLFlBQVk7QUFBQSxNQUFFO0FBQUEsSUFDcEMsQ0FBNkM7QUFHN0MseUJBQXFCLEtBQUssMkJBQTJCO0FBQUEsTUFDcEQsa0JBQWtCLGdCQUFnQix5QkFBeUIsTUFBTSxnQkFBZ0I7QUFBQSxNQUNqRixvQkFBb0IsQ0FBQyxLQUFVLFdBQStCO0FBQzdELGNBQU0sYUFBYSxLQUFLLEVBQUUsS0FBSyxJQUFJLFNBQVMsR0FBRyxPQUFPLENBQUM7QUFBQSxNQUN4RDtBQUFBLE1BQ0Esc0JBQXNCLE1BQU0sTUFBTTtBQUFBLE1BQ2xDLGlDQUFpQyxNQUFNLE1BQU0saUNBQWlDO0FBQUEsTUFDOUUsZ0NBQWdDLENBQUMsUUFBK0IsTUFBTSx3QkFBd0IsSUFBSSxJQUFJLFdBQVcsS0FBSztBQUFBLE1BQ3RILHlCQUF5QixPQUFPLFFBQTJCLG1CQUF5QztBQUNuRyxjQUFNLHNCQUFzQixLQUFLLENBQUMsR0FBRyxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7QUFDMUQsZUFBTyxNQUFNLDBCQUEwQixPQUFPLFlBQVUsQ0FBQyxrQkFBa0IsZUFBZSxJQUFJLE9BQU8scUJBQXFCLFdBQVcsQ0FBQztBQUFBLE1BQ3ZJO0FBQUEsTUFDQSx1QkFBdUIsTUFBTSxNQUFNO0FBQUEsTUFDbkMsa0JBQWtCLENBQUMsUUFBK0I7QUFDakQsY0FBTSxvQkFBb0IsS0FBSyxJQUFJLFdBQVc7QUFBQSxNQUMvQztBQUFBLE1BQ0EsMEJBQTBCLFlBQVksTUFBTTtBQUFBLE1BQzVDLDBCQUEwQixZQUFZLE1BQU07QUFBQSxNQUM1QyxtQkFBbUIsWUFBWSxNQUFNO0FBQUEsSUFDdEMsQ0FBeUM7QUFHekMseUJBQXFCLEtBQUssdUJBQXVCO0FBQUEsTUFDaEQsVUFBVSxDQUFDLFFBQWdCO0FBQzFCLFlBQUksUUFBUSxrQkFBa0Isb0JBQW9CO0FBQ2pELGlCQUFPLE1BQU07QUFBQSxRQUNkO0FBQ0EsWUFBSSxRQUFRLGtCQUFrQixpQkFBaUI7QUFDOUMsaUJBQU8sTUFBTTtBQUFBLFFBQ2Q7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0EsU0FBUyxDQUFDLFFBQWdCO0FBQ3pCLFlBQUksUUFBUSxrQkFBa0Isb0JBQW9CO0FBQ2pELGlCQUFPLEVBQUUsV0FBVyxNQUFNLHdCQUF3QixjQUFjLFFBQVcsYUFBYSxPQUFVO0FBQUEsUUFDbkc7QUFDQSxZQUFJLFFBQVEsa0JBQWtCLGlCQUFpQjtBQUM5QyxpQkFBTyxFQUFFLFdBQVcsTUFBTSwyQkFBMkIsY0FBYyxRQUFXLGFBQWEsT0FBVTtBQUFBLFFBQ3RHO0FBQ0EsZUFBTyxFQUFFLFdBQVcsUUFBVyxjQUFjLFFBQVcsYUFBYSxPQUFVO0FBQUEsTUFDaEY7QUFBQSxNQUNBLGFBQWEsT0FBTyxLQUFhLFVBQW1CO0FBQ25ELFlBQUksUUFBUSxrQkFBa0Isb0JBQW9CO0FBQ2pELGdCQUFNLHNCQUFzQjtBQUFBLFFBQzdCO0FBQ0EsWUFBSSxRQUFRLGtCQUFrQixpQkFBaUI7QUFDOUMsZ0JBQU0seUJBQXlCO0FBQUEsUUFDaEM7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFxQztBQUdyQyx5QkFBcUIsS0FBSyxjQUFjO0FBQUEsTUFDdkMsVUFBVSxZQUFZLElBQUksS0FBSyxNQUFNLFFBQVE7QUFBQSxJQUM5QyxDQUE0QjtBQUc1Qix5QkFBcUIsS0FBSyxvQkFBb0I7QUFBQSxNQUM3QyxPQUFPLFlBQVksTUFBTTtBQUFBLE1BQ3pCLE1BQU0sT0FBTyxVQUErQjtBQUMzQyxZQUFJLENBQUMsTUFBTSxpQkFBaUI7QUFDM0IsaUJBQU87QUFBQSxRQUNSO0FBQ0EsZUFBTyxNQUFNLEtBQUssT0FBSyxFQUFFLFVBQVUsTUFBTSxnQkFBaUIsS0FBSztBQUFBLE1BQ2hFO0FBQUEsSUFDRCxDQUFrQztBQUVsQyxVQUFNLFVBQVUscUJBQXFCLGVBQWUsb0JBQW9CO0FBQ3hFLFdBQU8sRUFBRSxTQUFTLE1BQU07QUFBQSxFQUN6QjtBQU1BLFFBQU0sdUJBQXVCLE1BQU07QUFFbEMsU0FBSyw4REFBOEQsTUFBTTtBQUN4RSxZQUFNLEVBQUUsUUFBUSxJQUFJLGNBQWM7QUFDbEMsWUFBTSxTQUFTLGFBQWE7QUFBQSxRQUMzQixRQUFRO0FBQUEsUUFDUixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixjQUFjLE1BQU0sbUJBQW1CO0FBQUEsTUFDbkYsQ0FBQztBQUNELFlBQU0sTUFBTSxRQUFRLG9CQUFvQixNQUFNO0FBQzlDLGFBQU8sWUFBWSxJQUFJLE1BQU0sa0VBQWtFO0FBQUEsSUFDaEcsQ0FBQztBQUVELFNBQUssMERBQTBELE1BQU07QUFDcEUsWUFBTSxTQUFTLElBQUksS0FBSyxvREFBb0Q7QUFDNUUsWUFBTSxFQUFFLFFBQVEsSUFBSSxjQUFjO0FBQUEsUUFDakMseUJBQXlCLG9CQUFJLElBQUksQ0FBQyxDQUFDLE9BQU8sTUFBTSxDQUFDLENBQUM7QUFBQSxNQUNuRCxDQUFDO0FBQ0QsWUFBTSxTQUFTLGFBQWE7QUFBQSxRQUMzQixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixLQUFLLFNBQVMsU0FBUztBQUFBLE1BQ25FLENBQUM7QUFDRCxZQUFNLE1BQU0sUUFBUSxvQkFBb0IsTUFBTTtBQUM5QyxhQUFPLFlBQVksSUFBSSxNQUFNLE9BQU8sSUFBSTtBQUFBLElBQ3pDLENBQUM7QUFFRCxTQUFLLDBEQUEwRCxNQUFNO0FBQ3BFLFlBQU0sU0FBUyxJQUFJLEtBQUssZ0NBQWdDO0FBQ3hELFlBQU0sRUFBRSxRQUFRLElBQUksY0FBYztBQUFBLFFBQ2pDLHlCQUF5QixvQkFBSSxJQUFJLENBQUMsQ0FBQyxPQUFPLE1BQU0sQ0FBQyxDQUFDO0FBQUEsTUFDbkQsQ0FBQztBQUNELFlBQU0sU0FBUyxhQUFhO0FBQUEsUUFDM0Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsS0FBSyxTQUFTLFNBQVM7QUFBQSxNQUNuRSxDQUFDO0FBQ0QsWUFBTSxNQUFNLFFBQVEsb0JBQW9CLE1BQU07QUFDOUMsYUFBTyxZQUFZLElBQUksTUFBTSxPQUFPLElBQUk7QUFBQSxJQUN6QyxDQUFDO0FBRUQsU0FBSyw2REFBNkQsTUFBTTtBQUN2RSxZQUFNLFFBQVEsSUFBSSxLQUFLLDJDQUEyQztBQUNsRSxZQUFNLEVBQUUsUUFBUSxJQUFJLGNBQWM7QUFBQSxRQUNqQyx5QkFBeUIsb0JBQUksSUFBSSxDQUFDLENBQUMsVUFBVSxLQUFLLENBQUMsQ0FBQztBQUFBLE1BQ3JELENBQUM7QUFDRCxZQUFNLFNBQVMsYUFBYTtBQUFBLFFBQzNCLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLFFBQVEsTUFBTSxhQUFhO0FBQUEsTUFDdkUsQ0FBQztBQUNELFlBQU0sTUFBTSxRQUFRLG9CQUFvQixNQUFNO0FBQzlDLGFBQU8sWUFBWSxJQUFJLE1BQU0sTUFBTSxJQUFJO0FBQUEsSUFDeEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQU1ELFFBQU0sc0NBQWlDLE1BQU07QUFFNUMsU0FBSyx5REFBeUQsWUFBWTtBQUN6RSxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUN6QyxZQUFNLFNBQVMsYUFBYTtBQUFBLFFBQzNCLFFBQVE7QUFBQSxRQUNSLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLGNBQWMsTUFBTSxtQkFBbUI7QUFBQSxNQUNuRixDQUFDO0FBRUQsWUFBTSxRQUFRLGNBQWMsTUFBTTtBQUVsQyxhQUFPLFlBQVksTUFBTSxhQUFhLFFBQVEsQ0FBQztBQUMvQyxhQUFPLEdBQUcsTUFBTSxhQUFhLENBQUMsRUFBRSxJQUFJLFNBQVMsa0JBQWtCLENBQUM7QUFDaEUsYUFBTyxZQUFZLE1BQU0sY0FBYyxRQUFRLENBQUM7QUFBQSxJQUNqRCxDQUFDO0FBRUQsU0FBSyx1REFBdUQsWUFBWTtBQUN2RSxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYyxFQUFFLGtCQUFrQixNQUFNLENBQUM7QUFDcEUsWUFBTSxTQUFTLGFBQWE7QUFBQSxRQUMzQixRQUFRO0FBQUEsUUFDUixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixjQUFjLE1BQU0sa0JBQWtCO0FBQUEsTUFDbEYsQ0FBQztBQUVELFlBQU0sUUFBUSxjQUFjLE1BQU07QUFFbEMsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFDL0MsYUFBTyxZQUFZLE1BQU0sY0FBYyxRQUFRLENBQUM7QUFDaEQsYUFBTyxHQUFHLE1BQU0sY0FBYyxDQUFDLEVBQUUsUUFBUSxTQUFTLFdBQVcsQ0FBQztBQUFBLElBQy9ELENBQUM7QUFFRCxTQUFLLGlEQUFpRCxZQUFZO0FBQ2pFLFlBQU0sRUFBRSxNQUFNLElBQUksY0FBYztBQUVoQyxZQUFNLHVCQUF1QixNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUNyRSxZQUFNLGNBQWM7QUFBQSxRQUNuQixrQkFBa0IsWUFBWTtBQUFFLGdCQUFNLElBQUksTUFBTSxjQUFjO0FBQUEsUUFBRztBQUFBLFFBQ2pFLHFCQUFxQixNQUFNLElBQUksS0FBSyxJQUFJO0FBQUEsUUFDeEMsMkJBQTJCLE1BQU0sSUFBSSxLQUFLLElBQUk7QUFBQSxNQUMvQztBQUNBLDJCQUFxQixLQUFLLCtCQUErQixXQUF1RDtBQUNoSCwyQkFBcUIsS0FBSyxjQUFjLEVBQUUsUUFBUSxZQUFZLEtBQUssQ0FBNEI7QUFDL0YsMkJBQXFCLEtBQUssc0JBQXNCLEVBQUUsUUFBUSxDQUFDLE1BQTZDO0FBQUUsY0FBTSxjQUFjLEtBQUssQ0FBQztBQUFBLE1BQUcsRUFBRSxDQUFvQztBQUM3SywyQkFBcUIsS0FBSyxnQkFBZ0IsRUFBRSxTQUFTLGFBQWEsRUFBRSxXQUFXLEtBQUssR0FBRyxDQUE4QjtBQUNySCwyQkFBcUIsS0FBSyxrQkFBa0IsQ0FBQyxDQUFnQztBQUM3RSwyQkFBcUIsS0FBSyxrQkFBa0IsRUFBRSxjQUFjLE9BQU8sSUFBYSxPQUErQixHQUFHLEVBQUUsQ0FBZ0M7QUFDcEosMkJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUMzRCwyQkFBcUIsS0FBSywyQkFBMkIsRUFBRSxvQkFBb0IsTUFBTTtBQUFBLE1BQUUsRUFBRSxDQUF5QztBQUM5SCwyQkFBcUIsS0FBSywyQkFBMkIsd0JBQXdCLE1BQU0sSUFBSTtBQUN2RiwyQkFBcUIsS0FBSywyQkFBMkIsb0JBQW9CLE1BQU07QUFBQSxNQUFFLENBQUM7QUFDbEYsWUFBTSxNQUFNLHFCQUFxQixlQUFlLG9CQUFvQjtBQUVwRSxZQUFNLFNBQVMsYUFBYTtBQUFBLFFBQzNCLFFBQVE7QUFBQSxRQUNSLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLGNBQWMsTUFBTSxtQkFBbUI7QUFBQSxNQUNuRixDQUFDO0FBQ0QsWUFBTSxJQUFJLGNBQWMsTUFBTTtBQUc5QixhQUFPLFlBQVksTUFBTSxhQUFhLFFBQVEsQ0FBQztBQUFBLElBQ2hELENBQUM7QUFBQSxFQUNGLENBQUM7QUFNRCxRQUFNLG9DQUErQixNQUFNO0FBRTFDLFNBQUssMkRBQTJELFlBQVk7QUFDM0UsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QywwQkFBMEIsSUFBSSxLQUFLLDJDQUEyQztBQUFBLE1BQy9FLENBQUM7QUFDRCxZQUFNLFNBQVMsYUFBYTtBQUFBLFFBQzNCLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLFFBQVEsTUFBTSxhQUFhO0FBQUEsTUFDdkUsQ0FBQztBQUVELFlBQU0sUUFBUSxjQUFjLE1BQU07QUFFbEMsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFDL0MsYUFBTyxZQUFZLE1BQU0sY0FBYyxRQUFRLENBQUM7QUFBQSxJQUNqRCxDQUFDO0FBRUQsU0FBSywyREFBMkQsWUFBWTtBQUMzRSxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLDBCQUEwQixJQUFJLEtBQUssc0NBQXNDO0FBQUEsTUFDMUUsQ0FBQztBQUNELFlBQU0sU0FBUyxhQUFhO0FBQUEsUUFDM0Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxLQUFLLCtCQUErQjtBQUFBLE1BQ3hGLENBQUM7QUFFRCxZQUFNLFFBQVEsY0FBYyxNQUFNO0FBRWxDLGFBQU8sWUFBWSxNQUFNLGFBQWEsUUFBUSxDQUFDO0FBQy9DLGFBQU8sWUFBWSxNQUFNLGNBQWMsUUFBUSxDQUFDO0FBQUEsSUFDakQsQ0FBQztBQUVELFNBQUssdURBQXVELFlBQVk7QUFDdkUsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QyxrQkFBa0I7QUFBQSxRQUNsQiwwQkFBMEIsSUFBSSxLQUFLLDJDQUEyQztBQUFBLE1BQy9FLENBQUM7QUFDRCxZQUFNLFNBQVMsYUFBYTtBQUFBLFFBQzNCLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLFFBQVEsTUFBTSxhQUFhO0FBQUEsTUFDdkUsQ0FBQztBQUVELFlBQU0sUUFBUSxjQUFjLE1BQU07QUFFbEMsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFDL0MsYUFBTyxZQUFZLE1BQU0sY0FBYyxRQUFRLENBQUM7QUFDaEQsYUFBTyxHQUFHLE1BQU0sY0FBYyxDQUFDLEVBQUUsUUFBUSxTQUFTLFdBQVcsQ0FBQztBQUFBLElBQy9ELENBQUM7QUFBQSxFQUNGLENBQUM7QUFNRCxRQUFNLDRCQUF1QixNQUFNO0FBRWxDLFNBQUssb0RBQW9ELFlBQVk7QUFDcEUsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLG9EQUFvRDtBQUNuRixZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLDBCQUEwQixJQUFJLEtBQUssZ0NBQWdDO0FBQUEsUUFDbkUseUJBQXlCLG9CQUFJLElBQUksQ0FBQyxDQUFDLE9BQU8sYUFBYSxDQUFDLENBQUM7QUFBQSxNQUMxRCxDQUFDO0FBQ0QsWUFBTSxTQUFTLGFBQWE7QUFBQSxRQUMzQixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixLQUFLLFNBQVMsU0FBUztBQUFBLE1BQ25FLENBQUM7QUFFRCxZQUFNLFFBQVEsY0FBYyxNQUFNO0FBRWxDLGFBQU8sWUFBWSxNQUFNLGlCQUFpQixRQUFRLENBQUM7QUFDbkQsYUFBTyxHQUFHLE1BQU0saUJBQWlCLENBQUMsRUFBRSxTQUFTLEtBQUssQ0FBQztBQUNuRCxhQUFPLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxFQUFFLFNBQVMsU0FBUyxDQUFDO0FBQ3ZELGFBQU8sR0FBRyxNQUFNLGlCQUFpQixDQUFDLEVBQUUsU0FBUyxRQUFRLENBQUM7QUFDdEQsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFDL0MsYUFBTyxZQUFZLE1BQU0sY0FBYyxRQUFRLENBQUM7QUFBQSxJQUNqRCxDQUFDO0FBRUQsU0FBSywyQ0FBMkMsWUFBWTtBQUMzRCxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLDBCQUEwQixJQUFJLEtBQUssZ0NBQWdDO0FBQUEsUUFDbkUseUJBQXlCLG9CQUFJLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxLQUFLLG9EQUFvRCxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQzNHLENBQUM7QUFDRCxZQUFNLFNBQVMsYUFBYTtBQUFBLFFBQzNCLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLEtBQUssU0FBUyxVQUFVLFNBQVMsUUFBUTtBQUFBLE1BQ3JGLENBQUM7QUFFRCxZQUFNLFFBQVEsY0FBYyxNQUFNO0FBRWxDLGFBQU8sWUFBWSxNQUFNLGlCQUFpQixRQUFRLENBQUM7QUFDbkQsYUFBTyxHQUFHLE1BQU0saUJBQWlCLENBQUMsRUFBRSxTQUFTLGNBQWMsQ0FBQztBQUFBLElBQzdELENBQUM7QUFFRCxTQUFLLDRDQUE0QyxZQUFZO0FBQzVELFlBQU0sRUFBRSxTQUFTLE1BQU0sSUFBSSxjQUFjO0FBQUEsUUFDeEMsMEJBQTBCLElBQUksS0FBSyxnQ0FBZ0M7QUFBQSxRQUNuRSx5QkFBeUIsb0JBQUksSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLEtBQUssb0RBQW9ELENBQUMsQ0FBQyxDQUFDO0FBQUEsTUFDM0csQ0FBQztBQUNELFlBQU0sU0FBUyxhQUFhO0FBQUEsUUFDM0Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsS0FBSyxTQUFTLFVBQVUsVUFBVSw4QkFBOEI7QUFBQSxNQUM1RyxDQUFDO0FBRUQsWUFBTSxRQUFRLGNBQWMsTUFBTTtBQUVsQyxhQUFPLFlBQVksTUFBTSxpQkFBaUIsUUFBUSxDQUFDO0FBQ25ELGFBQU8sR0FBRyxNQUFNLGlCQUFpQixDQUFDLEVBQUUsU0FBUyxZQUFZLENBQUM7QUFDMUQsYUFBTyxHQUFHLE1BQU0saUJBQWlCLENBQUMsRUFBRSxTQUFTLDZCQUE2QixDQUFDO0FBQUEsSUFDNUUsQ0FBQztBQUVELFNBQUssb0RBQW9ELFlBQVk7QUFDcEUsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWMsRUFBRSxxQkFBcUIsTUFBTSxDQUFDO0FBQ3ZFLFlBQU0sU0FBUyxhQUFhO0FBQUEsUUFDM0Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsS0FBSyxTQUFTLFNBQVM7QUFBQSxNQUNuRSxDQUFDO0FBRUQsWUFBTSxRQUFRLGNBQWMsTUFBTTtBQUVsQyxhQUFPLFlBQVksTUFBTSxpQkFBaUIsUUFBUSxDQUFDO0FBQ25ELGFBQU8sWUFBWSxNQUFNLGFBQWEsUUFBUSxDQUFDO0FBQUEsSUFDaEQsQ0FBQztBQUVELFNBQUsscUVBQXFFLFlBQVk7QUFDckYsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QywwQkFBMEIsSUFBSSxLQUFLLGdDQUFnQztBQUFBO0FBQUEsUUFFbkUsa0JBQWtCO0FBQUEsTUFDbkIsQ0FBQztBQUNELFlBQU0sU0FBUyxhQUFhO0FBQUEsUUFDM0Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsS0FBSyxTQUFTLFNBQVM7QUFBQSxNQUNuRSxDQUFDO0FBRUQsWUFBTSxRQUFRLGNBQWMsTUFBTTtBQUVsQyxhQUFPLFlBQVksTUFBTSxhQUFhLFFBQVEsQ0FBQztBQUMvQyxhQUFPLFlBQVksTUFBTSxjQUFjLFFBQVEsQ0FBQztBQUNoRCxhQUFPLEdBQUcsTUFBTSxjQUFjLENBQUMsRUFBRSxRQUFRLFNBQVMsV0FBVyxDQUFDO0FBQUEsSUFDL0QsQ0FBQztBQUVELFNBQUssc0VBQXNFLFlBQVk7QUFDdEYsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QywwQkFBMEIsSUFBSSxLQUFLLGdDQUFnQztBQUFBLFFBQ25FLGtCQUFrQjtBQUFBLE1BQ25CLENBQUM7QUFDRCxZQUFNLFNBQVMsYUFBYTtBQUFBLFFBQzNCLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLEtBQUssU0FBUyxTQUFTO0FBQUEsTUFDbkUsQ0FBQztBQUVELFlBQU0sUUFBUSxjQUFjLE1BQU07QUFFbEMsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFDL0MsYUFBTyxZQUFZLE1BQU0sY0FBYyxRQUFRLENBQUM7QUFDaEQsYUFBTyxHQUFHLE1BQU0sY0FBYyxDQUFDLEVBQUUsUUFBUSxTQUFTLFFBQVEsQ0FBQztBQUFBLElBQzVELENBQUM7QUFBQSxFQUNGLENBQUM7QUFNRCxRQUFNLDRCQUF1QixNQUFNO0FBRWxDLFNBQUssb0RBQW9ELFlBQVk7QUFDcEUsWUFBTSxnQkFBZ0IsSUFBSSxLQUFLLGdDQUFnQztBQUMvRCxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLDBCQUEwQixJQUFJLEtBQUssZ0NBQWdDO0FBQUEsUUFDbkUseUJBQXlCLG9CQUFJLElBQUksQ0FBQyxDQUFDLE9BQU8sYUFBYSxDQUFDLENBQUM7QUFBQSxNQUMxRCxDQUFDO0FBQ0QsWUFBTSxTQUFTLGFBQWE7QUFBQSxRQUMzQixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixLQUFLLFNBQVMsU0FBUztBQUFBLE1BQ25FLENBQUM7QUFFRCxZQUFNLFFBQVEsY0FBYyxNQUFNO0FBRWxDLGFBQU8sWUFBWSxNQUFNLGlCQUFpQixRQUFRLENBQUM7QUFDbkQsYUFBTyxHQUFHLE1BQU0saUJBQWlCLENBQUMsRUFBRSxTQUFTLEtBQUssQ0FBQztBQUNuRCxhQUFPLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxFQUFFLFNBQVMsU0FBUyxDQUFDO0FBQ3ZELGFBQU8sR0FBRyxNQUFNLGlCQUFpQixDQUFDLEVBQUUsU0FBUyxRQUFRLENBQUM7QUFDdEQsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFDL0MsYUFBTyxZQUFZLE1BQU0sY0FBYyxRQUFRLENBQUM7QUFBQSxJQUNqRCxDQUFDO0FBRUQsU0FBSywwREFBMEQsWUFBWTtBQUMxRSxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLDBCQUEwQixJQUFJLEtBQUssZ0NBQWdDO0FBQUEsUUFDbkUseUJBQXlCLG9CQUFJLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxLQUFLLGdDQUFnQyxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQ3ZGLENBQUM7QUFDRCxZQUFNLFNBQVMsYUFBYTtBQUFBLFFBQzNCLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLEtBQUssU0FBUyxVQUFVLFNBQVMsUUFBUTtBQUFBLE1BQ3JGLENBQUM7QUFFRCxZQUFNLFFBQVEsY0FBYyxNQUFNO0FBRWxDLGFBQU8sWUFBWSxNQUFNLGlCQUFpQixRQUFRLENBQUM7QUFDbkQsYUFBTyxHQUFHLE1BQU0saUJBQWlCLENBQUMsRUFBRSxTQUFTLGVBQWUsQ0FBQztBQUFBLElBQzlELENBQUM7QUFFRCxTQUFLLDZEQUE2RCxZQUFZO0FBQzdFLFlBQU0sRUFBRSxTQUFTLE1BQU0sSUFBSSxjQUFjO0FBQUEsUUFDeEMsMEJBQTBCLElBQUksS0FBSyxnQ0FBZ0M7QUFBQSxRQUNuRSx5QkFBeUIsb0JBQUksSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLEtBQUssZ0NBQWdDLENBQUMsQ0FBQyxDQUFDO0FBQUEsTUFDdkYsQ0FBQztBQUNELFlBQU0sU0FBUyxhQUFhO0FBQUEsUUFDM0Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsS0FBSyxTQUFTLFVBQVUsVUFBVSxpQ0FBaUM7QUFBQSxNQUMvRyxDQUFDO0FBRUQsWUFBTSxRQUFRLGNBQWMsTUFBTTtBQUVsQyxhQUFPLFlBQVksTUFBTSxpQkFBaUIsUUFBUSxDQUFDO0FBQ25ELGFBQU8sR0FBRyxNQUFNLGlCQUFpQixDQUFDLEVBQUUsU0FBUyxhQUFhLENBQUM7QUFDM0QsYUFBTyxHQUFHLE1BQU0saUJBQWlCLENBQUMsRUFBRSxTQUFTLGdDQUFnQyxDQUFDO0FBQUEsSUFDL0UsQ0FBQztBQUVELFNBQUssb0RBQW9ELFlBQVk7QUFDcEUsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWMsRUFBRSxxQkFBcUIsTUFBTSxDQUFDO0FBQ3ZFLFlBQU0sU0FBUyxhQUFhO0FBQUEsUUFDM0Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsS0FBSyxTQUFTLFNBQVM7QUFBQSxNQUNuRSxDQUFDO0FBRUQsWUFBTSxRQUFRLGNBQWMsTUFBTTtBQUVsQyxhQUFPLFlBQVksTUFBTSxpQkFBaUIsUUFBUSxDQUFDO0FBQ25ELGFBQU8sWUFBWSxNQUFNLGFBQWEsUUFBUSxDQUFDO0FBQUEsSUFDaEQsQ0FBQztBQUVELFNBQUsscUVBQXFFLFlBQVk7QUFDckYsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QywwQkFBMEIsSUFBSSxLQUFLLGdDQUFnQztBQUFBLFFBQ25FLGtCQUFrQjtBQUFBLE1BQ25CLENBQUM7QUFDRCxZQUFNLFNBQVMsYUFBYTtBQUFBLFFBQzNCLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLEtBQUssU0FBUyxTQUFTO0FBQUEsTUFDbkUsQ0FBQztBQUVELFlBQU0sUUFBUSxjQUFjLE1BQU07QUFFbEMsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFDL0MsYUFBTyxZQUFZLE1BQU0sY0FBYyxRQUFRLENBQUM7QUFDaEQsYUFBTyxHQUFHLE1BQU0sY0FBYyxDQUFDLEVBQUUsUUFBUSxTQUFTLFdBQVcsQ0FBQztBQUFBLElBQy9ELENBQUM7QUFBQSxFQUNGLENBQUM7QUFNRCxRQUFNLGdCQUFnQixNQUFNO0FBRTNCLFNBQUssc0RBQXNELFlBQVk7QUFDdEUsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFDekMsWUFBTSxTQUFTLGFBQWE7QUFBQSxRQUMzQixRQUFRO0FBQUEsUUFDUixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixjQUFjLE1BQU0sbUJBQW1CO0FBQUEsTUFDbkYsQ0FBQztBQUVELFlBQU0sUUFBUSxhQUFhLE1BQU07QUFFakMsYUFBTyxZQUFZLE1BQU0sd0JBQXdCLFFBQVEsQ0FBQztBQUFBLElBQzNELENBQUM7QUFFRCxTQUFLLCtDQUErQyxZQUFZO0FBQy9ELFlBQU0sRUFBRSxTQUFTLE1BQU0sSUFBSSxjQUFjO0FBQ3pDLFlBQU0sU0FBUyxhQUFhO0FBQUEsUUFDM0Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxNQUFNLGFBQWE7QUFBQSxNQUN2RSxDQUFDO0FBRUQsWUFBTSxRQUFRLGFBQWEsTUFBTTtBQUVqQyxhQUFPLFlBQVksTUFBTSx3QkFBd0IsUUFBUSxDQUFDO0FBQUEsSUFDM0QsQ0FBQztBQUVELFNBQUssK0NBQStDLFlBQVk7QUFDL0QsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFDekMsWUFBTSxTQUFTLGFBQWE7QUFBQSxRQUMzQixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixRQUFRLEtBQUssK0JBQStCO0FBQUEsTUFDeEYsQ0FBQztBQUVELFlBQU0sUUFBUSxhQUFhLE1BQU07QUFFakMsYUFBTyxZQUFZLE1BQU0sd0JBQXdCLFFBQVEsQ0FBQztBQUFBLElBQzNELENBQUM7QUFFRCxTQUFLLGlGQUFpRixZQUFZO0FBQ2pHLFlBQU0sRUFBRSxTQUFTLE1BQU0sSUFBSSxjQUFjO0FBQUEsUUFDeEMsK0JBQStCO0FBQUEsUUFDL0Isb0JBQW9CO0FBQUEsTUFDckIsQ0FBQztBQUNELFlBQU0sU0FBUyxhQUFhO0FBQUEsUUFDM0Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxNQUFNLGFBQWE7QUFBQSxNQUN2RSxDQUFDO0FBRUQsWUFBTSxVQUFVLE1BQU0sUUFBUSxhQUFhLE1BQU07QUFFakQsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QjtBQUFBLFFBQ0EsYUFBYSxNQUFNLHdCQUF3QjtBQUFBLFFBQzNDLGVBQWUsTUFBTSxjQUFjLElBQUksa0JBQWdCLGFBQWEsT0FBTztBQUFBLE1BQzVFLEdBQUc7QUFBQSxRQUNGLFNBQVM7QUFBQSxRQUNULGFBQWE7QUFBQSxRQUNiLGVBQWUsQ0FBQyw0RUFBK0U7QUFBQSxNQUNoRyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxzQ0FBc0MsWUFBWTtBQUN0RCxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLDBCQUEwQixJQUFJLEtBQUssZ0NBQWdDO0FBQUEsUUFDbkUseUJBQXlCLG9CQUFJLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxLQUFLLG9EQUFvRCxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQzNHLENBQUM7QUFDRCxZQUFNLFNBQVMsYUFBYTtBQUFBLFFBQzNCLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLEtBQUssU0FBUyxTQUFTO0FBQUEsTUFDbkUsQ0FBQztBQUVELFlBQU0sUUFBUSxhQUFhLE1BQU07QUFHakMsYUFBTyxZQUFZLE1BQU0saUJBQWlCLFFBQVEsQ0FBQztBQUNuRCxhQUFPLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxFQUFFLFNBQVMsS0FBSyxDQUFDO0FBQUEsSUFDcEQsQ0FBQztBQUVELFNBQUssa0VBQWtFLFlBQVk7QUFDbEYsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QyxxQkFBcUI7QUFBQSxRQUNyQiwwQkFBMEIsSUFBSSxLQUFLLGdDQUFnQztBQUFBLFFBQ25FLHlCQUF5QixvQkFBSSxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksS0FBSyxvREFBb0QsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUMzRyxDQUFDO0FBQ0QsWUFBTSxTQUFTLGFBQWE7QUFBQSxRQUMzQixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixLQUFLLFNBQVMsU0FBUztBQUFBLE1BQ25FLENBQUM7QUFFRCxZQUFNLFVBQVUsTUFBTSxRQUFRLGFBQWEsTUFBTTtBQUVqRCxhQUFPLFlBQVksU0FBUyxLQUFLO0FBQ2pDLGFBQU8sWUFBWSxNQUFNLGlCQUFpQixRQUFRLENBQUM7QUFDbkQsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFBQSxJQUNoRCxDQUFDO0FBRUQsU0FBSyxzQ0FBc0MsWUFBWTtBQUN0RCxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLDBCQUEwQixJQUFJLEtBQUssZ0NBQWdDO0FBQUEsUUFDbkUseUJBQXlCLG9CQUFJLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxLQUFLLGdDQUFnQyxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQ3ZGLENBQUM7QUFDRCxZQUFNLFNBQVMsYUFBYTtBQUFBLFFBQzNCLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLEtBQUssU0FBUyxTQUFTO0FBQUEsTUFDbkUsQ0FBQztBQUVELFlBQU0sUUFBUSxhQUFhLE1BQU07QUFFakMsYUFBTyxZQUFZLE1BQU0saUJBQWlCLFFBQVEsQ0FBQztBQUNuRCxhQUFPLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxFQUFFLFNBQVMsS0FBSyxDQUFDO0FBQUEsSUFDcEQsQ0FBQztBQUVELFNBQUssa0VBQWtFLFlBQVk7QUFDbEYsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QyxxQkFBcUI7QUFBQSxRQUNyQiwwQkFBMEIsSUFBSSxLQUFLLGdDQUFnQztBQUFBLFFBQ25FLHlCQUF5QixvQkFBSSxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksS0FBSyxnQ0FBZ0MsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUN2RixDQUFDO0FBQ0QsWUFBTSxTQUFTLGFBQWE7QUFBQSxRQUMzQixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixLQUFLLFNBQVMsU0FBUztBQUFBLE1BQ25FLENBQUM7QUFFRCxZQUFNLFVBQVUsTUFBTSxRQUFRLGFBQWEsTUFBTTtBQUVqRCxhQUFPLFlBQVksU0FBUyxLQUFLO0FBQ2pDLGFBQU8sWUFBWSxNQUFNLGlCQUFpQixRQUFRLENBQUM7QUFDbkQsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFBQSxJQUNoRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxvQkFBb0IsTUFBTTtBQUUvQixhQUFTLGdCQUFnQixNQUFjLGFBQWtEO0FBQ3hGLFlBQU0sdUJBQXVCLG1CQUFtQixXQUFXO0FBQzNELFlBQU0sU0FBUyxhQUFhO0FBQUEsUUFDM0I7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0EsUUFBUSxXQUFXLElBQUk7QUFBQSxRQUN2QixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixjQUFjLE1BQU0sV0FBVyxJQUFJLEdBQUc7QUFBQSxNQUNsRixDQUFDO0FBQ0QsYUFBTyxFQUFFLFdBQVcsSUFBSSxLQUFLLFlBQVksSUFBSSxFQUFFLEdBQUcsT0FBTztBQUFBLElBQzFEO0FBRUEsU0FBSyx5Q0FBeUMsWUFBWTtBQUN6RCxZQUFNLFFBQVEsZ0JBQWdCLFNBQVMsaUJBQWlCO0FBQ3hELFlBQU0sU0FBUyxnQkFBZ0IsVUFBVSxrQkFBa0I7QUFDM0QsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWMsRUFBRSxrQkFBa0IsQ0FBQyxPQUFPLE1BQU0sRUFBRSxDQUFDO0FBRTlFLFlBQU0sUUFBUSxpQkFBaUI7QUFBQSxRQUM5QixRQUFRO0FBQUEsUUFDUixXQUFXO0FBQUEsUUFDWCxnQkFBZ0Isb0JBQUksSUFBSSxDQUFDLE1BQU0sT0FBTyxxQkFBcUIsV0FBVyxDQUFDO0FBQUEsTUFDeEUsR0FBRyxrQkFBa0IsSUFBSTtBQUV6QixhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFFBQVEsTUFBTSxvQkFBb0IsSUFBSSxVQUFRLEtBQUssWUFBWSxXQUFXO0FBQUEsUUFDMUUsU0FBUyxNQUFNO0FBQUEsTUFDaEIsR0FBRztBQUFBLFFBQ0YsUUFBUSxDQUFDLE1BQU0sT0FBTyxxQkFBcUIsV0FBVztBQUFBLFFBQ3RELFNBQVMsQ0FBQyxDQUFDLE1BQU0sT0FBTyxxQkFBcUIsV0FBVyxDQUFDO0FBQUEsTUFDMUQsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssa0VBQWtFLFlBQVk7QUFDbEYsWUFBTSxZQUFZLGdCQUFnQixXQUFXLG1CQUFtQjtBQUNoRSxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLGtCQUFrQixDQUFDLFNBQVM7QUFBQSxRQUM1Qix5QkFBeUIsb0JBQUksSUFBSSxDQUFDLENBQUMsVUFBVSxPQUFPLHFCQUFxQixhQUFhLEtBQUssQ0FBQyxDQUFDO0FBQUEsTUFDOUYsQ0FBQztBQUVELFlBQU0sUUFBUSxpQkFBaUI7QUFBQSxRQUM5QixRQUFRO0FBQUEsUUFDUixXQUFXO0FBQUEsUUFDWCxnQkFBZ0Isb0JBQUksSUFBSSxDQUFDLFVBQVUsT0FBTyxxQkFBcUIsV0FBVyxDQUFDO0FBQUEsTUFDNUUsR0FBRyxrQkFBa0IsSUFBSTtBQUV6QixhQUFPLGdCQUFnQixNQUFNLHFCQUFxQixDQUFDLENBQUM7QUFDcEQsYUFBTyxnQkFBZ0IsTUFBTSx1QkFBdUIsQ0FBQyxDQUFDO0FBQUEsSUFDdkQsQ0FBQztBQUVELFNBQUssMEVBQTBFLFlBQVk7QUFDMUYsWUFBTSxZQUFZLGdCQUFnQixXQUFXLG1CQUFtQjtBQUNoRSxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLGtCQUFrQixDQUFDLFNBQVM7QUFBQSxRQUM1QiwrQkFBK0I7QUFBQSxRQUMvQixvQkFBb0I7QUFBQSxNQUNyQixDQUFDO0FBRUQsWUFBTSxTQUFTLE1BQU0sUUFBUSxpQkFBaUIsRUFBRSxRQUFRLEtBQUssR0FBRyxrQkFBa0IsSUFBSTtBQUV0RixhQUFPLGdCQUFnQixPQUFPLGFBQWEsQ0FBQyxVQUFVLE9BQU8scUJBQXFCLFlBQVksQ0FBQztBQUMvRixhQUFPLGdCQUFnQixNQUFNLHFCQUFxQixDQUFDLENBQUM7QUFBQSxJQUNyRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBTUQsUUFBTSwwQ0FBcUMsTUFBTTtBQUVoRCxTQUFLLDBEQUEwRCxZQUFZO0FBQzFFLFlBQU0sRUFBRSxTQUFTLE1BQU0sSUFBSSxjQUFjLEVBQUUsb0JBQW9CLEtBQUssQ0FBQztBQUNyRSxZQUFNLFNBQVMsYUFBYTtBQUFBLFFBQzNCLFFBQVE7QUFBQSxRQUNSLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLGNBQWMsTUFBTSxtQkFBbUI7QUFBQSxNQUNuRixDQUFDO0FBRUQsWUFBTSxRQUFRLGNBQWMsTUFBTTtBQUVsQyxhQUFPLFlBQVksTUFBTSxhQUFhLFFBQVEsQ0FBQztBQUMvQyxhQUFPLFlBQVksTUFBTSxvQkFBb0IsUUFBUSxHQUFHLHFCQUFxQjtBQUFBLElBQzlFLENBQUM7QUFFRCxTQUFLLHNEQUFzRCxZQUFZO0FBQ3RFLFlBQU0sRUFBRSxTQUFTLE1BQU0sSUFBSSxjQUFjLEVBQUUsb0JBQW9CLE9BQU8scUJBQXFCLEtBQUssQ0FBQztBQUNqRyxZQUFNLFNBQVMsYUFBYTtBQUFBLFFBQzNCLFFBQVE7QUFBQSxRQUNSLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLGNBQWMsTUFBTSxtQkFBbUI7QUFBQSxNQUNuRixDQUFDO0FBRUQsWUFBTSxRQUFRLGNBQWMsTUFBTTtBQUVsQyxhQUFPLFlBQVksTUFBTSxvQkFBb0IsUUFBUSxDQUFDO0FBQ3RELGFBQU8sWUFBWSxNQUFNLGFBQWEsUUFBUSxDQUFDO0FBQUEsSUFDaEQsQ0FBQztBQUVELFNBQUssNkNBQTZDLFlBQVk7QUFDN0QsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWMsRUFBRSxvQkFBb0IsT0FBTyxxQkFBcUIsTUFBTSxDQUFDO0FBQ2xHLFlBQU0sU0FBUyxhQUFhO0FBQUEsUUFDM0IsUUFBUTtBQUFBLFFBQ1Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsY0FBYyxNQUFNLG1CQUFtQjtBQUFBLE1BQ25GLENBQUM7QUFFRCxZQUFNLE9BQU8sUUFBUSxNQUFNLFFBQVEsY0FBYyxNQUFNLEdBQUcsQ0FBQyxRQUFpQixvQkFBb0IsR0FBWSxDQUFDO0FBRTdHLGFBQU8sWUFBWSxNQUFNLG9CQUFvQixRQUFRLENBQUM7QUFDdEQsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFBQSxJQUNoRCxDQUFDO0FBRUQsU0FBSyw0Q0FBNEMsWUFBWTtBQUM1RCxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYyxFQUFFLG9CQUFvQixPQUFPLHFCQUFxQixNQUFNLENBQUM7QUFFbEcsWUFBTSxRQUFtQztBQUFBLFFBQ3hDLEVBQUUsTUFBTSxpQkFBaUIsY0FBYyxNQUFNLElBQUk7QUFBQSxRQUNqRCxFQUFFLE1BQU0saUJBQWlCLFFBQVEsTUFBTSxhQUFhO0FBQUEsUUFDcEQsRUFBRSxNQUFNLGlCQUFpQixRQUFRLEtBQUssK0JBQStCO0FBQUEsUUFDckUsRUFBRSxNQUFNLGlCQUFpQixLQUFLLFNBQVMsU0FBUztBQUFBLFFBQ2hELEVBQUUsTUFBTSxpQkFBaUIsS0FBSyxTQUFTLFNBQVM7QUFBQSxNQUNqRDtBQUVBLGlCQUFXLG9CQUFvQixPQUFPO0FBQ3JDLGNBQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSxjQUFjLGFBQWEsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFpQixvQkFBb0IsR0FBWSxDQUFDO0FBQUEsTUFDMUk7QUFFQSxhQUFPLFlBQVksTUFBTSxhQUFhLFFBQVEsR0FBRyx1REFBdUQ7QUFBQSxJQUN6RyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBTUQsUUFBTSwyQkFBMkIsTUFBTTtBQUV0QyxTQUFLLGtDQUFrQyxZQUFZO0FBQ2xELFlBQU0sRUFBRSxTQUFTLE1BQU0sSUFBSSxjQUFjO0FBQ3pDLFlBQU0sU0FBUyxNQUFNLFFBQVEsd0JBQXdCLG9CQUFvQjtBQUN6RSxhQUFPLFlBQVksT0FBTyxTQUFTLEtBQUs7QUFDeEMsYUFBTyxHQUFHLE9BQU8sT0FBTztBQUN4QixhQUFPLFlBQVksTUFBTSxhQUFhLFFBQVEsQ0FBQztBQUFBLElBQ2hELENBQUM7QUFFRCxTQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLFlBQU0sRUFBRSxRQUFRLElBQUksY0FBYztBQUNsQyxhQUFPLFlBQVksUUFBUSxxQkFBcUIsWUFBWSxHQUFHLE1BQVM7QUFDeEUsYUFBTyxZQUFZLFFBQVEscUJBQXFCLG1DQUFtQyxHQUFHLE1BQVM7QUFDL0YsYUFBTyxZQUFZLFFBQVEscUJBQXFCLG1CQUFtQixHQUFHLE1BQVM7QUFDL0UsYUFBTyxZQUFZLFFBQVEscUJBQXFCLFdBQVcsR0FBRyxNQUFTO0FBQ3ZFLGFBQU8sWUFBWSxRQUFRLHFCQUFxQixlQUFlLEdBQUcsTUFBUztBQUMzRSxhQUFPLEdBQUcsUUFBUSxxQkFBcUIsb0JBQW9CLENBQUM7QUFBQSxJQUM3RCxDQUFDO0FBRUQsU0FBSyx3RkFBd0YsWUFBWTtBQUN4RyxZQUFNLE1BQU0sbUJBQW1CLDBCQUEwQjtBQUN6RCxZQUFNLG1CQUFtQixhQUFhO0FBQUEsUUFDckMsTUFBTTtBQUFBLFFBQ04sa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsY0FBYyxNQUFNLEdBQUc7QUFBQSxRQUNsRSxhQUFhLElBQUk7QUFBQSxRQUNqQixzQkFBc0I7QUFBQSxRQUN0QixpQkFBaUIsZ0JBQWdCO0FBQUEsTUFDbEMsQ0FBQztBQUNELFlBQU0sRUFBRSxTQUFTLE1BQU0sSUFBSSxjQUFjO0FBQUEsUUFDeEMsbUJBQW1CLENBQUMsZ0JBQWdCO0FBQUEsTUFDckMsQ0FBQztBQUVELFlBQU0sUUFBUSx3QkFBd0IsMEJBQTBCO0FBRWhFLGFBQU8sWUFBWSxNQUFNLGNBQWMsUUFBUSxDQUFDO0FBQ2hELGFBQU8sWUFBWSxNQUFNLGFBQWEsUUFBUSxDQUFDO0FBQy9DLGFBQU8sWUFBWSxNQUFNLGFBQWEsQ0FBQyxFQUFFLE9BQU8sTUFBTSwwQkFBMEI7QUFDaEYsYUFBTyxnQkFBZ0IsTUFBTSxxQkFBcUIsQ0FBQywwQkFBMEIsQ0FBQztBQUM5RSxhQUFPLFlBQVksTUFBTSx3QkFBd0IsTUFBUztBQUFBLElBQzNELENBQUM7QUFFRCxTQUFLLHlFQUF5RSxZQUFZO0FBQ3pGLFlBQU0sTUFBTSxtQkFBbUIsMEJBQTBCO0FBQ3pELFlBQU0sbUJBQW1CLGFBQWE7QUFBQSxRQUNyQyxNQUFNO0FBQUEsUUFDTixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixjQUFjLE1BQU0sR0FBRztBQUFBLFFBQ2xFLGFBQWEsSUFBSTtBQUFBLFFBQ2pCLHNCQUFzQjtBQUFBLFFBQ3RCLGlCQUFpQixnQkFBZ0I7QUFBQSxNQUNsQyxDQUFDO0FBQ0QsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QyxtQkFBbUIsQ0FBQyxnQkFBZ0I7QUFBQSxRQUNwQyxvQkFBb0I7QUFBQSxRQUNwQixxQkFBcUI7QUFBQSxNQUN0QixDQUFDO0FBRUQsWUFBTSxTQUFTLE1BQU0sUUFBUSx3QkFBd0IsMEJBQTBCO0FBRS9FLGFBQU8sWUFBWSxPQUFPLFNBQVMsS0FBSztBQUN4QyxhQUFPLFlBQVksTUFBTSxhQUFhLFFBQVEsQ0FBQztBQUMvQyxhQUFPLFlBQVksTUFBTSxxQkFBcUIsTUFBUztBQUFBLElBQ3hELENBQUM7QUFFRCxTQUFLLHlFQUF5RSxZQUFZO0FBQ3pGLFlBQU0sRUFBRSxTQUFTLE1BQU0sSUFBSSxjQUFjO0FBQUEsUUFDeEMsbUJBQW1CLENBQUM7QUFBQSxRQUNwQix5QkFBeUI7QUFBQSxNQUMxQixDQUFDO0FBRUQsWUFBTSxRQUFRLHdCQUF3QixnQkFBZ0I7QUFFdEQsYUFBTyxZQUFZLE1BQU0sY0FBYyxRQUFRLENBQUM7QUFDaEQsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFDL0MsYUFBTyxnQkFBZ0IsTUFBTSx3QkFBd0IsRUFBRSxrQkFBa0IsS0FBSyxDQUFDO0FBQy9FLGFBQU8sWUFBWSxNQUFNLHFCQUFxQixNQUFTO0FBQUEsSUFDeEQsQ0FBQztBQUVELFNBQUssMEVBQTBFLFlBQVk7QUFDMUYsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QyxtQkFBbUIsQ0FBQztBQUFBLFFBQ3BCLHlCQUF5QjtBQUFBLFFBQ3pCLFVBQVU7QUFBQSxNQUNYLENBQUM7QUFFRCxZQUFNLFFBQVEsd0JBQXdCLGFBQWE7QUFFbkQsYUFBTyxnQkFBZ0IsTUFBTSx3QkFBd0IsRUFBRSxlQUFlLEtBQUssQ0FBQztBQUFBLElBQzdFLENBQUM7QUFFRCxTQUFLLG1FQUFtRSxZQUFZO0FBQ25GLFlBQU0sRUFBRSxTQUFTLE1BQU0sSUFBSSxjQUFjO0FBQUEsUUFDeEMsbUJBQW1CLENBQUM7QUFBQSxRQUNwQix5QkFBeUI7QUFBQSxNQUMxQixDQUFDO0FBRUQsWUFBTSxRQUFRLHdCQUF3QixxQkFBcUI7QUFFM0QsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFDL0MsYUFBTyxHQUFHLE1BQU0sc0JBQXNCO0FBQ3RDLGFBQU8sZ0JBQWdCLE9BQU8sT0FBTyxNQUFNLHNCQUF1QixHQUFHLENBQUMsSUFBSSxDQUFDO0FBQzNFLGFBQU8sWUFBWSxPQUFPLEtBQUssTUFBTSxzQkFBdUIsRUFBRSxRQUFRLENBQUM7QUFBQSxJQUN4RSxDQUFDO0FBRUQsU0FBSyxnREFBZ0QsWUFBWTtBQUNoRSxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLG9CQUFvQjtBQUFBLE1BQ3JCLENBQUM7QUFFRCxZQUFNLFNBQVMsTUFBTSxRQUFRLHdCQUF3QixjQUFjO0FBRW5FLGFBQU8sWUFBWSxPQUFPLFNBQVMsS0FBSztBQUN4QyxhQUFPLEdBQUcsT0FBTyxPQUFPO0FBQ3hCLGFBQU8sWUFBWSxNQUFNLGFBQWEsUUFBUSxDQUFDO0FBQy9DLGFBQU8sWUFBWSxNQUFNLHdCQUF3QixNQUFTO0FBQUEsSUFDM0QsQ0FBQztBQUVELFNBQUssdUVBQXVFLFlBQVk7QUFDdkYsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QyxtQkFBbUIsQ0FBQztBQUFBLFFBQ3BCLHlCQUF5QjtBQUFBLE1BQzFCLENBQUM7QUFFRCxZQUFNLFNBQVMsTUFBTSxRQUFRLHdCQUF3QixZQUFZO0FBRWpFLGFBQU8sWUFBWSxPQUFPLFNBQVMsS0FBSztBQUN4QyxhQUFPLEdBQUcsT0FBTyxTQUFTLFNBQVMsZ0NBQWdDLENBQUM7QUFDcEUsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFDL0MsYUFBTyxZQUFZLE1BQU0sd0JBQXdCLE1BQVM7QUFBQSxJQUMzRCxDQUFDO0FBRUQsU0FBSyxzRUFBc0UsWUFBWTtBQUN0RixZQUFNLE1BQU0sbUJBQW1CLGlCQUFpQjtBQUNoRCxZQUFNLG1CQUFtQixhQUFhO0FBQUEsUUFDckMsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsY0FBYyxNQUFNLEdBQUc7QUFBQSxRQUNsRSxhQUFhLElBQUk7QUFBQSxRQUNqQixzQkFBc0I7QUFBQSxRQUN0QixpQkFBaUIsZ0JBQWdCO0FBQUEsTUFDbEMsQ0FBQztBQUNELFlBQU0sRUFBRSxTQUFTLE1BQU0sSUFBSSxjQUFjO0FBQUEsUUFDeEMsMEJBQTBCLElBQUksS0FBSyxnREFBZ0Q7QUFBQSxRQUNuRixtQkFBbUIsQ0FBQyxnQkFBZ0I7QUFBQSxNQUNyQyxDQUFDO0FBRUQsWUFBTSxRQUFRLHdCQUF3QixpQkFBaUI7QUFFdkQsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFDL0MsYUFBTyxZQUFZLE1BQU0sYUFBYSxDQUFDLEVBQUUsT0FBTyxNQUFNLHNCQUFzQjtBQUFBLElBQzdFLENBQUM7QUFFRCxTQUFLLDhDQUE4QyxZQUFZO0FBQzlELFlBQU0sRUFBRSxTQUFTLE1BQU0sSUFBSSxjQUFjO0FBQUEsUUFDeEMsMEJBQTBCLElBQUksS0FBSyxnREFBZ0Q7QUFBQSxRQUNuRixtQkFBbUIsQ0FBQztBQUFBLE1BQ3JCLENBQUM7QUFFRCxZQUFNLFNBQVMsTUFBTSxRQUFRLHdCQUF3QixpQkFBaUI7QUFFdEUsYUFBTyxZQUFZLE9BQU8sU0FBUyxLQUFLO0FBQ3hDLGFBQU8sR0FBRyxPQUFPLFNBQVMsU0FBUyxrQkFBa0IsQ0FBQztBQUN0RCxhQUFPLFlBQVksTUFBTSxhQUFhLFFBQVEsQ0FBQztBQUFBLElBQ2hELENBQUM7QUFFRCxTQUFLLDJDQUEyQyxZQUFZO0FBQzNELFlBQU0sTUFBTSxtQkFBbUIsa0JBQWtCO0FBQ2pELFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUIsTUFBTTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsY0FBYyxNQUFNLFlBQVk7QUFBQSxRQUMzRSxhQUFhLElBQUk7QUFBQSxRQUNqQixzQkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBQ0QsWUFBTSxVQUFVLGFBQWE7QUFBQSxRQUM1QixNQUFNO0FBQUEsUUFDTixRQUFRO0FBQUEsUUFDUixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixjQUFjLE1BQU0sWUFBWTtBQUFBLFFBQzNFLGFBQWEsSUFBSTtBQUFBLFFBQ2pCLHNCQUFzQjtBQUFBLE1BQ3ZCLENBQUM7QUFDRCxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLDBCQUEwQixJQUFJLEtBQUssaURBQWlEO0FBQUEsUUFDcEYsbUJBQW1CLENBQUMsU0FBUyxPQUFPO0FBQUEsUUFDcEMsaUJBQWlCLEVBQUUsT0FBTyxXQUFXO0FBQUEsTUFDdEMsQ0FBQztBQUVELFlBQU0sUUFBUSx3QkFBd0Isa0JBQWtCO0FBRXhELGFBQU8sWUFBWSxNQUFNLGFBQWEsUUFBUSxDQUFDO0FBQy9DLGFBQU8sWUFBWSxNQUFNLGFBQWEsQ0FBQyxFQUFFLE9BQU8sTUFBTSxVQUFVO0FBQ2hFLGFBQU8sR0FBRyxNQUFNLGFBQWEsQ0FBQyxFQUFFLElBQUksU0FBUyxXQUFXLENBQUM7QUFBQSxJQUMxRCxDQUFDO0FBRUQsU0FBSyxpREFBaUQsWUFBWTtBQUNqRSxZQUFNLE1BQU0sbUJBQW1CLGtCQUFrQjtBQUNqRCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCLE1BQU07QUFBQSxRQUNOLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLGNBQWMsTUFBTSxZQUFZO0FBQUEsUUFDM0UsYUFBYSxJQUFJO0FBQUEsUUFDakIsc0JBQXNCO0FBQUEsTUFDdkIsQ0FBQztBQUNELFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUIsTUFBTTtBQUFBLFFBQ04sa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsY0FBYyxNQUFNLFlBQVk7QUFBQSxRQUMzRSxhQUFhLElBQUk7QUFBQSxRQUNqQixzQkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBQ0QsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QywwQkFBMEIsSUFBSSxLQUFLLGlEQUFpRDtBQUFBLFFBQ3BGLG1CQUFtQixDQUFDLFNBQVMsT0FBTztBQUFBLFFBQ3BDLGlCQUFpQjtBQUFBLE1BQ2xCLENBQUM7QUFFRCxZQUFNLFFBQVEsd0JBQXdCLGtCQUFrQjtBQUV4RCxhQUFPLFlBQVksTUFBTSxhQUFhLFFBQVEsQ0FBQztBQUFBLElBQ2hELENBQUM7QUFFRCxTQUFLLDJDQUEyQyxZQUFZO0FBQzNELFlBQU0sRUFBRSxTQUFTLE1BQU0sSUFBSSxjQUFjO0FBQUEsUUFDeEMsb0JBQW9CO0FBQUEsUUFDcEIscUJBQXFCO0FBQUEsUUFDckIsbUJBQW1CLENBQUM7QUFBQSxNQUNyQixDQUFDO0FBRUQsWUFBTSxRQUFRLHdCQUF3QixZQUFZO0FBRWxELGFBQU8sWUFBWSxNQUFNLGFBQWEsUUFBUSxDQUFDO0FBQUEsSUFDaEQsQ0FBQztBQUVELFNBQUssZ0RBQWdELFlBQVk7QUFDaEUsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QywwQkFBMEIsSUFBSSxLQUFLLDhDQUE4QztBQUFBLFFBQ2pGLG1CQUFtQixDQUFDO0FBQUEsTUFDckIsQ0FBQztBQUVELFlBQU0sU0FBUyxNQUFNLFFBQVEsd0JBQXdCLHNDQUFzQztBQUUzRixhQUFPLFlBQVksT0FBTyxTQUFTLEtBQUs7QUFDeEMsYUFBTyxHQUFHLE9BQU8sU0FBUyxTQUFTLGtCQUFrQixDQUFDO0FBQ3RELGFBQU8sWUFBWSxNQUFNLGFBQWEsUUFBUSxDQUFDO0FBQUEsSUFDaEQsQ0FBQztBQUVELFNBQUssbURBQW1ELFlBQVk7QUFDbkUsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QywwQkFBMEIsSUFBSSxLQUFLLDhDQUE4QztBQUFBLFFBQ2pGLGtCQUFrQjtBQUFBLE1BQ25CLENBQUM7QUFFRCxZQUFNLFNBQVMsTUFBTSxRQUFRLHdCQUF3QixlQUFlO0FBRXBFLGFBQU8sWUFBWSxPQUFPLFNBQVMsS0FBSztBQUN4QyxhQUFPLEdBQUcsT0FBTyxPQUFPO0FBQ3hCLGFBQU8sWUFBWSxNQUFNLGFBQWEsUUFBUSxDQUFDO0FBQUEsSUFDaEQsQ0FBQztBQUVELFNBQUssNkRBQTZELFlBQVk7QUFDN0UsWUFBTSxNQUFNLG1CQUFtQixpQkFBaUI7QUFDaEQsWUFBTSxtQkFBbUIsYUFBYTtBQUFBLFFBQ3JDLE1BQU07QUFBQSxRQUNOLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLGNBQWMsTUFBTSxHQUFHO0FBQUEsUUFDbEUsYUFBYSxJQUFJO0FBQUEsUUFDakIsc0JBQXNCO0FBQUEsUUFDdEIsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQ2xDLENBQUM7QUFDRCxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLDBCQUEwQixJQUFJLEtBQUssZ0RBQWdEO0FBQUEsUUFDbkYsbUJBQW1CLENBQUMsZ0JBQWdCO0FBQUEsTUFDckMsQ0FBQztBQUVELFlBQU0sUUFBUSx3QkFBd0IsaUJBQWlCO0FBRXZELGFBQU8sZ0JBQWdCLE1BQU0scUJBQXFCLENBQUMsaUJBQWlCLENBQUM7QUFBQSxJQUN0RSxDQUFDO0FBRUQsU0FBSyxtRUFBbUUsWUFBWTtBQUNuRixZQUFNLE1BQU0sbUJBQW1CLGtCQUFrQjtBQUNqRCxZQUFNLFVBQVUsYUFBYTtBQUFBLFFBQzVCLE1BQU07QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLGNBQWMsTUFBTSxZQUFZO0FBQUEsUUFDM0UsYUFBYSxJQUFJO0FBQUEsUUFDakIsc0JBQXNCO0FBQUEsTUFDdkIsQ0FBQztBQUNELFlBQU0sVUFBVSxhQUFhO0FBQUEsUUFDNUIsTUFBTTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsY0FBYyxNQUFNLFlBQVk7QUFBQSxRQUMzRSxhQUFhLElBQUk7QUFBQSxRQUNqQixzQkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBQ0QsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QywwQkFBMEIsSUFBSSxLQUFLLGlEQUFpRDtBQUFBLFFBQ3BGLG1CQUFtQixDQUFDLFNBQVMsT0FBTztBQUFBLFFBQ3BDLGlCQUFpQixFQUFFLE9BQU8sV0FBVztBQUFBLE1BQ3RDLENBQUM7QUFFRCxZQUFNLFFBQVEsd0JBQXdCLGtCQUFrQjtBQUV4RCxhQUFPLGdCQUFnQixNQUFNLHFCQUFxQixDQUFDLGtCQUFrQixDQUFDO0FBQUEsSUFDdkUsQ0FBQztBQUVELFNBQUssNENBQTRDLFlBQVk7QUFDNUQsWUFBTSxNQUFNLG1CQUFtQixpQkFBaUI7QUFDaEQsWUFBTSxtQkFBbUIsYUFBYTtBQUFBLFFBQ3JDLE1BQU07QUFBQSxRQUNOLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLGNBQWMsTUFBTSxHQUFHO0FBQUEsUUFDbEUsYUFBYSxJQUFJO0FBQUEsUUFDakIsc0JBQXNCO0FBQUEsUUFDdEIsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQ2xDLENBQUM7QUFDRCxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLDBCQUEwQixJQUFJLEtBQUssZ0RBQWdEO0FBQUEsUUFDbkYsbUJBQW1CLENBQUMsZ0JBQWdCO0FBQUEsUUFDcEMsd0JBQXdCLENBQUMsaUJBQWlCO0FBQUEsTUFDM0MsQ0FBQztBQUVELFlBQU0sUUFBUSx3QkFBd0IsaUJBQWlCO0FBRXZELGFBQU8sWUFBWSxNQUFNLHFCQUFxQixNQUFTO0FBQUEsSUFDeEQsQ0FBQztBQUVELFNBQUssd0VBQXdFLFlBQVk7QUFDeEYsWUFBTSxNQUFNLG1CQUFtQiwwQkFBMEI7QUFDekQsWUFBTSxlQUFlLGFBQWE7QUFBQSxRQUNqQyxNQUFNO0FBQUEsUUFDTixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixRQUFRLE1BQU0sMkJBQTJCO0FBQUEsUUFDcEYsYUFBYSxJQUFJO0FBQUEsUUFDakIsc0JBQXNCO0FBQUEsUUFDdEIsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQ2xDLENBQUM7QUFDRCxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLDBCQUEwQixJQUFJLEtBQUsseURBQXlEO0FBQUEsUUFDNUYsbUJBQW1CLENBQUM7QUFBQSxRQUNwQiw0QkFBNEI7QUFBQSxNQUM3QixDQUFDO0FBRUQsWUFBTSxRQUFRLHdCQUF3QiwwQkFBMEI7QUFFaEUsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFDL0MsYUFBTyxZQUFZLE1BQU0sYUFBYSxDQUFDLEVBQUUsT0FBTyxNQUFNLG9CQUFvQjtBQUMxRSxhQUFPLFlBQVksTUFBTSxjQUFjLFFBQVEsQ0FBQztBQUVoRCxhQUFPLFlBQVksTUFBTSxxQkFBcUIsTUFBUztBQUFBLElBQ3hELENBQUM7QUFFRCxTQUFLLGdGQUFnRixZQUFZO0FBQ2hHLFlBQU0sTUFBTSxtQkFBbUIsMEJBQTBCO0FBQ3pELFlBQU0sZUFBZSxhQUFhO0FBQUEsUUFDakMsTUFBTTtBQUFBLFFBQ04sa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxNQUFNLDJCQUEyQjtBQUFBLFFBQ3BGLGFBQWEsSUFBSTtBQUFBLFFBQ2pCLHNCQUFzQjtBQUFBLFFBQ3RCLGlCQUFpQixnQkFBZ0I7QUFBQSxNQUNsQyxDQUFDO0FBQ0QsWUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUN4QywwQkFBMEIsSUFBSSxLQUFLLHlEQUF5RDtBQUFBLFFBQzVGLG1CQUFtQixDQUFDO0FBQUEsUUFDcEIsNEJBQTRCO0FBQUEsTUFDN0IsQ0FBQztBQUVELFlBQU0sU0FBUyxNQUFNLFFBQVEsd0JBQXdCLDRCQUE0QixFQUFFLFFBQVEsaUJBQWlCLENBQUM7QUFFN0csYUFBTyxZQUFZLE9BQU8sU0FBUyxLQUFLO0FBQ3hDLGFBQU8sR0FBRyxPQUFPLFNBQVMsU0FBUyxXQUFXLENBQUM7QUFDL0MsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFBQSxJQUNoRCxDQUFDO0FBRUQsU0FBSyxvR0FBb0csWUFBWTtBQUNwSCxZQUFNLEVBQUUsU0FBUyxNQUFNLElBQUksY0FBYztBQUFBLFFBQ3hDLDBCQUEwQixJQUFJLEtBQUssaURBQWlEO0FBQUEsUUFDcEYsbUJBQW1CLENBQUM7QUFBQSxRQUNwQiw0QkFBNEI7QUFBQSxNQUM3QixDQUFDO0FBRUQsWUFBTSxTQUFTLE1BQU0sUUFBUSx3QkFBd0Isa0JBQWtCO0FBRXZFLGFBQU8sWUFBWSxPQUFPLFNBQVMsS0FBSztBQUN4QyxhQUFPLEdBQUcsT0FBTyxTQUFTLFNBQVMsa0JBQWtCLENBQUM7QUFDdEQsYUFBTyxZQUFZLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFBQSxJQUNoRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
