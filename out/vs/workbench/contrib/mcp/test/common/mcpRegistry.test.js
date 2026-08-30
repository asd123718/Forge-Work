import * as assert from "assert";
import * as sinon from "sinon";
import { timeout } from "../../../../../base/common/async.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { upcast } from "../../../../../base/common/types.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILoggerService, ILogService, NullLogger, NullLogService } from "../../../../../platform/log/common/log.js";
import { mcpAccessConfig, McpAccessValue } from "../../../../../platform/mcp/common/mcpManagement.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../../platform/notification/test/common/testNotificationService.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { ISecretStorageService } from "../../../../../platform/secrets/common/secrets.js";
import { TestSecretStorageService } from "../../../../../platform/secrets/test/common/testSecretStorageService.js";
import { IStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { observableConfigValue } from "../../../../../platform/observable/common/platformObservableUtils.js";
import { IConfigurationResolverService } from "../../../../services/configurationResolver/common/configurationResolver.js";
import { ConfigurationResolverExpression } from "../../../../services/configurationResolver/common/configurationResolverExpression.js";
import { IOutputService } from "../../../../services/output/common/output.js";
import { TestLoggerService, TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { ContributionEnablementState, EnablementModel, isContributionEnabled } from "../../../chat/common/enablement.js";
import { McpCollisionBehavior, mcpServerCollisionBehaviorSection } from "../../common/mcpConfiguration.js";
import { McpRegistry } from "../../common/mcpRegistry.js";
import { IMcpSandboxService } from "../../common/mcpSandboxService.js";
import { McpCollisionEnablementModel } from "../../common/mcpService.js";
import { McpTaskManager } from "../../common/mcpTaskManager.js";
import { LazyCollectionState, MCP_PLUGIN_COLLECTION_ID_PREFIX, McpCollectionProvenance, McpServerTransportType, McpServerTrust, McpStartServerInteraction } from "../../common/mcpTypes.js";
import { TestMcpMessageTransport } from "./mcpRegistryTypes.js";
import { COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from "../../../../../platform/policy/common/copilotManagedSettings.js";
class TestConfigurationResolverService {
  constructor() {
    this.interactiveCounter = 0;
    // Used to simulate stored/resolved variables
    this.resolvedVariables = /* @__PURE__ */ new Map();
    this.resolvedVariables.set("workspaceFolder", "/test/workspace");
    this.resolvedVariables.set("fileBasename", "test.txt");
  }
  resolveAsync(folder, value) {
    const parsed = ConfigurationResolverExpression.parse(value);
    for (const variable of parsed.unresolved()) {
      const resolved = this.resolvedVariables.get(variable.inner);
      if (resolved) {
        parsed.resolve(variable, resolved);
      }
    }
    return Promise.resolve(parsed.toObject());
  }
  resolveWithInteraction(folder, config, section, variables, target) {
    const parsed = ConfigurationResolverExpression.parse(config);
    const result = /* @__PURE__ */ new Map();
    result.set("input:testInteractive", `interactiveValue${this.interactiveCounter++}`);
    result.set("command:testCommand", `commandOutput${this.interactiveCounter++}}`);
    for (const [k, v] of result.entries()) {
      const replacement = {
        id: "${" + k + "}",
        inner: k,
        name: k.split(":")[0] || k,
        arg: k.split(":")[1]
      };
      parsed.resolve(replacement, v);
    }
    return Promise.resolve(result);
  }
}
class TestMcpHostDelegate {
  constructor() {
    this.priority = 0;
  }
  substituteVariables(serverDefinition, launch) {
    return Promise.resolve(launch);
  }
  canStart() {
    return true;
  }
  start() {
    return new TestMcpMessageTransport();
  }
  waitForInitialProviderPromises() {
    return Promise.resolve();
  }
}
class TestDialogService {
  constructor() {
    this._promptResult = true;
    this._promptSpy = sinon.stub();
    this._promptSpy.callsFake(() => {
      return Promise.resolve({ result: this._promptResult });
    });
  }
  setPromptResult(result) {
    this._promptResult = result;
  }
  get promptSpy() {
    return this._promptSpy;
  }
  prompt(options) {
    return this._promptSpy(options);
  }
}
class TestMcpRegistry extends McpRegistry {
  _promptForTrustOpenDialog() {
    return Promise.resolve(this.nextDefinitionIdsToTrust);
  }
}
class TestMcpSandboxService {
  constructor() {
    this.callCount = 0;
    this.enabled = false;
  }
  launchInSandboxIfEnabled(serverDef, launch, remoteAuthority, configTarget) {
    this.callCount++;
    this.lastLaunchCallArgs = { serverDef, launch, remoteAuthority, configTarget };
    if (this.enabled && launch.type === McpServerTransportType.Stdio) {
      return Promise.resolve({
        ...launch,
        command: "sandboxed-command"
      });
    }
    return Promise.resolve(launch);
  }
  isEnabled(serverDef) {
    return Promise.resolve(this.enabled);
  }
  getSandboxConfigSuggestionMessage(_serverLabel, _potentialBlocks, _existingSandboxConfig) {
    return void 0;
  }
  applySandboxConfigSuggestion(_serverDef, _mcpResource, _configTarget, _potentialBlocks, _suggestedSandboxConfig) {
    return Promise.resolve(false);
  }
}
suite("Workbench - MCP - Registry", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let registry;
  let testStorageService;
  let testConfigResolverService;
  let testDialogService;
  let testCollection;
  let baseDefinition;
  let configurationService;
  let logger;
  let trustNonceBearer;
  let taskManager;
  let testMcpSandboxService;
  setup(() => {
    testConfigResolverService = new TestConfigurationResolverService();
    testStorageService = store.add(new TestStorageService());
    testDialogService = new TestDialogService();
    configurationService = new TestConfigurationService({ [mcpAccessConfig]: McpAccessValue.All });
    trustNonceBearer = { trustedAtNonce: void 0 };
    testMcpSandboxService = new TestMcpSandboxService();
    const services = new ServiceCollection(
      [IConfigurationService, configurationService],
      [IConfigurationResolverService, testConfigResolverService],
      [IStorageService, testStorageService],
      [ISecretStorageService, new TestSecretStorageService()],
      [ILoggerService, store.add(new TestLoggerService())],
      [ILogService, store.add(new NullLogService())],
      [INotificationService, new TestNotificationService()],
      [IOutputService, upcast({ showChannel: () => {
      } })],
      [IDialogService, testDialogService],
      [IMcpSandboxService, testMcpSandboxService],
      [IProductService, {}]
    );
    logger = new NullLogger();
    taskManager = store.add(new McpTaskManager());
    const instaService = store.add(new TestInstantiationService(services));
    registry = store.add(instaService.createInstance(TestMcpRegistry));
    testCollection = {
      id: "test-collection",
      label: "Test Collection",
      remoteAuthority: null,
      serverDefinitions: observableValue("serverDefs", []),
      trustBehavior: McpServerTrust.Kind.Trusted,
      scope: StorageScope.APPLICATION,
      configTarget: ConfigurationTarget.USER,
      order: 0
    };
    baseDefinition = {
      id: "test-server",
      label: "Test Server",
      cacheNonce: "a",
      launch: {
        type: McpServerTransportType.Stdio,
        command: "test-command",
        args: [],
        env: {},
        envFile: void 0,
        cwd: "/test",
        sandbox: void 0
      }
    };
  });
  test("registerCollection adds collection to registry", () => {
    const disposable = registry.registerCollection(testCollection);
    store.add(disposable);
    assert.strictEqual(registry.collections.get().length, 1);
    assert.strictEqual(registry.collections.get()[0], testCollection);
    disposable.dispose();
    assert.strictEqual(registry.collections.get().length, 0);
  });
  test("strict plugin-only customization hides non-plugin MCP collections and blocks direct lookup", () => {
    store.add(registry.registerCollection(testCollection));
    const pluginCollection = {
      ...testCollection,
      id: `${MCP_PLUGIN_COLLECTION_ID_PREFIX}test`,
      provenance: McpCollectionProvenance.Plugin,
      serverDefinitions: observableValue("pluginDefinitions", [baseDefinition])
    };
    store.add(registry.registerCollection(pluginCollection));
    const spoofedCollection = {
      ...testCollection,
      id: `${MCP_PLUGIN_COLLECTION_ID_PREFIX}spoofed-extension/collection`,
      serverDefinitions: observableValue("spoofedDefinitions", [baseDefinition])
    };
    store.add(registry.registerCollection(spoofedCollection));
    configurationService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
    configurationService.onDidChangeConfigurationEmitter.fire({
      affectsConfiguration: (key) => key === COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG
    });
    assert.deepStrictEqual(registry.collections.get().map((collection) => collection.id), [pluginCollection.id]);
    assert.deepStrictEqual(registry.getServerDefinition(testCollection, baseDefinition).get(), { collection: void 0, server: void 0 });
    assert.deepStrictEqual(registry.getServerDefinition(spoofedCollection, baseDefinition).get(), { collection: void 0, server: void 0 });
    assert.strictEqual(registry.getServerDefinition(pluginCollection, baseDefinition).get().server, baseDefinition);
  });
  test("collections are not visible when not enabled", () => {
    const disposable = registry.registerCollection(testCollection);
    store.add(disposable);
    assert.strictEqual(registry.collections.get().length, 1);
    configurationService.setUserConfiguration(mcpAccessConfig, McpAccessValue.None);
    configurationService.onDidChangeConfigurationEmitter.fire({
      affectsConfiguration: () => true,
      affectedKeys: /* @__PURE__ */ new Set([mcpAccessConfig]),
      change: { keys: [mcpAccessConfig], overrides: [] },
      source: ConfigurationTarget.USER
    });
    assert.strictEqual(registry.collections.get().length, 0);
    configurationService.setUserConfiguration(mcpAccessConfig, McpAccessValue.All);
    configurationService.onDidChangeConfigurationEmitter.fire({
      affectsConfiguration: () => true,
      affectedKeys: /* @__PURE__ */ new Set([mcpAccessConfig]),
      change: { keys: [mcpAccessConfig], overrides: [] },
      source: ConfigurationTarget.USER
    });
  });
  test("registerDelegate adds delegate to registry", () => {
    const delegate = new TestMcpHostDelegate();
    const disposable = registry.registerDelegate(delegate);
    store.add(disposable);
    assert.strictEqual(registry.delegates.get().length, 1);
    assert.strictEqual(registry.delegates.get()[0], delegate);
    disposable.dispose();
    assert.strictEqual(registry.delegates.get().length, 0);
  });
  test("resolveConnection creates connection with resolved variables and memorizes them until cleared", async () => {
    const definition = {
      ...baseDefinition,
      launch: {
        type: McpServerTransportType.Stdio,
        command: "${workspaceFolder}/cmd",
        args: ["--file", "${fileBasename}"],
        env: {
          PATH: "${input:testInteractive}"
        },
        envFile: void 0,
        cwd: "/test",
        sandbox: void 0
      },
      variableReplacement: {
        section: "mcp",
        target: ConfigurationTarget.WORKSPACE
      }
    };
    const delegate = new TestMcpHostDelegate();
    store.add(registry.registerDelegate(delegate));
    testCollection.serverDefinitions.set([definition], void 0);
    store.add(registry.registerCollection(testCollection));
    const connection = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger, trustNonceBearer, taskManager });
    assert.ok(connection);
    assert.strictEqual(connection.definition, definition);
    assert.strictEqual(connection.launchDefinition.command, "/test/workspace/cmd");
    assert.strictEqual(connection.launchDefinition.env.PATH, "interactiveValue0");
    connection.dispose();
    const connection2 = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger, trustNonceBearer, taskManager });
    assert.ok(connection2);
    assert.strictEqual(connection2.launchDefinition.env.PATH, "interactiveValue0");
    connection2.dispose();
    registry.clearSavedInputs(StorageScope.WORKSPACE);
    const connection3 = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger, trustNonceBearer, taskManager });
    assert.ok(connection3);
    assert.strictEqual(connection3.launchDefinition.env.PATH, "interactiveValue4");
    connection3.dispose();
  });
  test("resolveConnection preserves URI in resolved HTTP launch", async () => {
    const definition = {
      ...baseDefinition,
      launch: {
        type: McpServerTransportType.HTTP,
        uri: URI.parse("https://mcp.example.com/mcp"),
        headers: []
      },
      variableReplacement: {
        section: "mcp",
        target: ConfigurationTarget.WORKSPACE
      }
    };
    const delegate = new TestMcpHostDelegate();
    store.add(registry.registerDelegate(delegate));
    testCollection.serverDefinitions.set([definition], void 0);
    store.add(registry.registerCollection(testCollection));
    const connection = await registry.resolveConnection({ collectionRef: testCollection, definitionRef: definition, logger, trustNonceBearer, taskManager });
    const launch = connection.launchDefinition;
    assert.deepStrictEqual(launch.type === McpServerTransportType.HTTP ? {
      isUri: URI.isUri(launch.uri),
      url: launch.uri.toString(true)
    } : { type: launch.type }, {
      isUri: true,
      url: "https://mcp.example.com/mcp"
    });
    connection.dispose();
  });
  test("resolveConnection uses user-provided launch configuration", async () => {
    const customCollection = {
      ...testCollection,
      resolveServerLanch: async (def) => {
        return {
          ...def.launch,
          env: { CUSTOM_ENV: "value" }
        };
      }
    };
    const definition = {
      ...baseDefinition,
      variableReplacement: {
        section: "mcp",
        target: ConfigurationTarget.WORKSPACE
      }
    };
    const delegate = new TestMcpHostDelegate();
    store.add(registry.registerDelegate(delegate));
    testCollection.serverDefinitions.set([definition], void 0);
    store.add(registry.registerCollection(customCollection));
    const connection = await registry.resolveConnection({
      collectionRef: customCollection,
      definitionRef: definition,
      logger,
      trustNonceBearer,
      taskManager
    });
    assert.ok(connection);
    assert.deepStrictEqual(connection.launchDefinition.env, { CUSTOM_ENV: "value" });
    connection.dispose();
  });
  test("resolveConnection calls launchInSandboxIfEnabled with expected arguments when sandboxing is enabled", async () => {
    testMcpSandboxService.enabled = true;
    const mcpResource = URI.file("/test/mcp.json");
    const sandboxCollection = {
      ...testCollection,
      id: "sandbox-collection",
      remoteAuthority: "ssh-remote+test",
      presentation: {
        origin: mcpResource
      }
    };
    const definition = {
      ...baseDefinition,
      id: "sandbox-server",
      launch: {
        type: McpServerTransportType.Stdio,
        command: "test-command",
        args: ["--flag"],
        env: {},
        envFile: void 0,
        cwd: "/test",
        sandbox: void 0
      }
    };
    const delegate = new TestMcpHostDelegate();
    store.add(registry.registerDelegate(delegate));
    sandboxCollection.serverDefinitions.set([definition], void 0);
    store.add(registry.registerCollection(sandboxCollection));
    const connection = await registry.resolveConnection({
      collectionRef: sandboxCollection,
      definitionRef: definition,
      logger,
      trustNonceBearer,
      taskManager
    });
    assert.ok(connection);
    assert.strictEqual(testMcpSandboxService.callCount, 1);
    assert.strictEqual(testMcpSandboxService.lastLaunchCallArgs?.serverDef, definition);
    assert.deepStrictEqual(testMcpSandboxService.lastLaunchCallArgs?.launch, definition.launch);
    assert.strictEqual(testMcpSandboxService.lastLaunchCallArgs?.remoteAuthority, "ssh-remote+test");
    assert.strictEqual(testMcpSandboxService.lastLaunchCallArgs?.configTarget, ConfigurationTarget.USER);
    assert.strictEqual(connection.launchDefinition.command, "sandboxed-command");
    connection.dispose();
  });
  suite("Lazy Collections", () => {
    let lazyCollection;
    let normalCollection;
    let removedCalled;
    setup(() => {
      removedCalled = false;
      lazyCollection = {
        ...testCollection,
        id: "lazy-collection",
        lazy: {
          isCached: false,
          load: () => Promise.resolve(),
          removed: () => {
            removedCalled = true;
          }
        }
      };
      normalCollection = {
        ...testCollection,
        id: "lazy-collection",
        serverDefinitions: observableValue("serverDefs", [baseDefinition])
      };
    });
    test("registers lazy collection", () => {
      const disposable = registry.registerCollection(lazyCollection);
      store.add(disposable);
      assert.strictEqual(registry.collections.get().length, 1);
      assert.strictEqual(registry.collections.get()[0], lazyCollection);
      assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.HasUnknown);
    });
    test("lazy collection is replaced by normal collection", () => {
      store.add(registry.registerCollection(lazyCollection));
      store.add(registry.registerCollection(normalCollection));
      const collections = registry.collections.get();
      assert.strictEqual(collections.length, 1);
      assert.strictEqual(collections[0], normalCollection);
      assert.strictEqual(collections[0].lazy, void 0);
      assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.AllKnown);
    });
    test("lazyCollectionState updates correctly during loading", async () => {
      lazyCollection = {
        ...lazyCollection,
        lazy: {
          ...lazyCollection.lazy,
          load: async () => {
            await timeout(0);
            store.add(registry.registerCollection(normalCollection));
            return Promise.resolve();
          }
        }
      };
      store.add(registry.registerCollection(lazyCollection));
      assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.HasUnknown);
      const loadingPromise = registry.discoverCollections();
      assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.LoadingUnknown);
      await loadingPromise;
      assert.strictEqual(registry.collections.get().length, 1);
      assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.AllKnown);
      assert.strictEqual(removedCalled, false);
    });
    test("removed callback is called when lazy collection is not replaced", async () => {
      store.add(registry.registerCollection(lazyCollection));
      await registry.discoverCollections();
      assert.strictEqual(removedCalled, true);
    });
    test("blocked lazy collection is rejected before activation", async () => {
      let loadCalled = false;
      lazyCollection = {
        ...lazyCollection,
        lazy: {
          ...lazyCollection.lazy,
          load: async () => {
            loadCalled = true;
          }
        }
      };
      store.add(registry.registerCollection(lazyCollection));
      configurationService.setUserConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, true);
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: (key) => key === COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG
      });
      await assert.rejects(
        registry.resolveConnection({ collectionRef: lazyCollection, definitionRef: baseDefinition, logger, trustNonceBearer, taskManager }),
        /blocked by enterprise customization policy/
      );
      assert.strictEqual(loadCalled, false);
    });
    test("cached lazy collections are tracked correctly", () => {
      lazyCollection.lazy.isCached = true;
      store.add(registry.registerCollection(lazyCollection));
      assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.AllKnown);
      const uncachedLazy = {
        ...lazyCollection,
        id: "uncached-lazy",
        lazy: {
          ...lazyCollection.lazy,
          isCached: false
        }
      };
      store.add(registry.registerCollection(uncachedLazy));
      assert.strictEqual(registry.lazyCollectionState.get().state, LazyCollectionState.HasUnknown);
    });
  });
  suite("Duplicate Collection Prevention", () => {
    test("prevents duplicate non-lazy collections with same ID", () => {
      const collection1 = {
        ...testCollection,
        id: "duplicate-test",
        label: "Collection 1"
      };
      const collection2 = {
        ...testCollection,
        id: "duplicate-test",
        label: "Collection 2"
      };
      store.add(registry.registerCollection(collection1));
      const disposable2 = registry.registerCollection(collection2);
      assert.strictEqual(disposable2, Disposable.None);
      assert.strictEqual(registry.collections.get().length, 1);
      assert.strictEqual(registry.collections.get()[0], collection1);
      assert.strictEqual(registry.collections.get()[0].label, "Collection 1");
    });
    test("allows lazy collection to be replaced by non-lazy with same ID", () => {
      const lazyCollection = {
        ...testCollection,
        id: "replaceable-test",
        label: "Lazy Collection",
        lazy: {
          isCached: false,
          load: () => Promise.resolve()
        }
      };
      const nonLazyCollection = {
        ...testCollection,
        id: "replaceable-test",
        label: "Non-Lazy Collection"
      };
      store.add(registry.registerCollection(lazyCollection));
      const disposable2 = store.add(registry.registerCollection(nonLazyCollection));
      assert.notStrictEqual(disposable2, Disposable.None);
      assert.strictEqual(registry.collections.get().length, 1);
      assert.strictEqual(registry.collections.get()[0], nonLazyCollection);
      assert.strictEqual(registry.collections.get()[0].label, "Non-Lazy Collection");
      assert.strictEqual(registry.collections.get()[0].lazy, void 0);
    });
    test("prevents lazy collection from duplicating existing non-lazy collection", () => {
      const nonLazyCollection = {
        ...testCollection,
        id: "protected-test",
        label: "Non-Lazy Collection"
      };
      const lazyCollection = {
        ...testCollection,
        id: "protected-test",
        label: "Lazy Collection",
        lazy: {
          isCached: false,
          load: () => Promise.resolve()
        }
      };
      store.add(registry.registerCollection(nonLazyCollection));
      const disposable2 = registry.registerCollection(lazyCollection);
      assert.strictEqual(disposable2, Disposable.None);
      assert.strictEqual(registry.collections.get().length, 1);
      assert.strictEqual(registry.collections.get()[0], nonLazyCollection);
      assert.strictEqual(registry.collections.get()[0].label, "Non-Lazy Collection");
    });
    test("allows different collection IDs to coexist", () => {
      const collection1 = {
        ...testCollection,
        id: "collection-1",
        label: "Collection 1"
      };
      const collection2 = {
        ...testCollection,
        id: "collection-2",
        label: "Collection 2"
      };
      store.add(registry.registerCollection(collection1));
      store.add(registry.registerCollection(collection2));
      assert.strictEqual(registry.collections.get().length, 2);
      assert.ok(registry.collections.get().some((c) => c.id === "collection-1"));
      assert.ok(registry.collections.get().some((c) => c.id === "collection-2"));
    });
    test("disposal of duplicate-preventing registration does not affect original", () => {
      const collection1 = {
        ...testCollection,
        id: "disposal-test",
        label: "Original Collection"
      };
      const collection2 = {
        ...testCollection,
        id: "disposal-test",
        label: "Duplicate Attempt"
      };
      const disposable1 = store.add(registry.registerCollection(collection1));
      const disposable2 = registry.registerCollection(collection2);
      assert.strictEqual(disposable2, Disposable.None);
      disposable2.dispose();
      assert.strictEqual(registry.collections.get().length, 1);
      assert.strictEqual(registry.collections.get()[0], collection1);
      disposable1.dispose();
      assert.strictEqual(registry.collections.get().length, 0);
    });
    test("simulates extension host restart scenario with when clause", async () => {
      const lazyCollection = {
        ...testCollection,
        id: "ext-restart-test",
        label: "Cached Lazy Collection",
        lazy: {
          isCached: true,
          load: () => Promise.resolve()
        }
      };
      store.add(registry.registerCollection(lazyCollection));
      assert.strictEqual(registry.collections.get().length, 1);
      const nonLazyFromExtension = {
        ...testCollection,
        id: "ext-restart-test",
        label: "Extension-Provided Collection"
      };
      store.add(registry.registerCollection(nonLazyFromExtension));
      assert.strictEqual(registry.collections.get().length, 1);
      assert.strictEqual(registry.collections.get()[0].lazy, void 0);
      const duplicateAttempt = {
        ...testCollection,
        id: "ext-restart-test",
        label: "Should Not Duplicate"
      };
      const disposable = registry.registerCollection(duplicateAttempt);
      assert.strictEqual(disposable, Disposable.None);
      assert.strictEqual(registry.collections.get().length, 1);
      assert.strictEqual(registry.collections.get()[0], nonLazyFromExtension);
    });
  });
  suite("Server Label Collision Enablement", () => {
    let enablementModel;
    let baseEnablement;
    function createCollectionWithServers(id, order, servers) {
      return {
        id,
        label: `Collection ${id}`,
        remoteAuthority: null,
        order,
        serverDefinitions: observableValue("serverDefs", servers.map((s) => ({
          ...baseDefinition,
          id: s.id,
          label: s.label
        }))),
        trustBehavior: McpServerTrust.Kind.Trusted,
        scope: StorageScope.APPLICATION,
        configTarget: ConfigurationTarget.USER
      };
    }
    function setupModel() {
      baseEnablement = store.add(new EnablementModel("mcp.enablement.test", testStorageService));
      const collisionBehavior = observableConfigValue(mcpServerCollisionBehaviorSection, McpCollisionBehavior.Disable, configurationService);
      enablementModel = new McpCollisionEnablementModel(baseEnablement, registry, collisionBehavior);
    }
    test("disables lower-priority servers with same label", () => {
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv-a", label: "My Server" }]);
      const col2 = createCollectionWithServers("col-2", 100, [{ id: "col-2.srv-a", label: "My Server" }]);
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      setupModel();
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv-a")));
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-2.srv-a")));
    });
    test("does not disable servers with different labels", () => {
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv-a", label: "Server A" }]);
      const col2 = createCollectionWithServers("col-2", 100, [{ id: "col-2.srv-b", label: "Server B" }]);
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      setupModel();
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv-a")));
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-2.srv-b")));
    });
    test("label collision is case-insensitive", () => {
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv-a", label: "My Server" }]);
      const col2 = createCollectionWithServers("col-2", 100, [{ id: "col-2.srv-a", label: "my server" }]);
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      setupModel();
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv-a")));
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-2.srv-a")));
    });
    test("respects collection order for priority", () => {
      const col2 = createCollectionWithServers("col-2", 200, [{ id: "col-2.srv-a", label: "My Server" }]);
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv-a", label: "My Server" }]);
      store.add(registry.registerCollection(col2));
      store.add(registry.registerCollection(col1));
      setupModel();
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv-a")));
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-2.srv-a")));
    });
    test("enabling a colliding server disables others with same label", () => {
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv-a", label: "My Server" }]);
      const col2 = createCollectionWithServers("col-2", 100, [{ id: "col-2.srv-a", label: "My Server" }]);
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      setupModel();
      enablementModel.setEnabled("col-2.srv-a", ContributionEnablementState.EnabledWorkspace);
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-2.srv-a")));
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-1.srv-a")));
      assert.strictEqual(enablementModel.readEnabled("col-1.srv-a"), ContributionEnablementState.DisabledWorkspace);
    });
    test('no collision effect when behavior is "suffix"', () => {
      configurationService.setUserConfiguration("chat.mcp.collisionBehavior", McpCollisionBehavior.Suffix);
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: (key) => key === "chat.mcp.collisionBehavior"
      });
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv-a", label: "My Server" }]);
      const col2 = createCollectionWithServers("col-2", 100, [{ id: "col-2.srv-a", label: "My Server" }]);
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      setupModel();
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv-a")));
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-2.srv-a")));
    });
    test("non-winner becomes enabled when winner is explicitly disabled", () => {
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv-a", label: "My Server" }]);
      const col2 = createCollectionWithServers("col-2", 100, [{ id: "col-2.srv-a", label: "My Server" }]);
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      setupModel();
      enablementModel.setEnabled("col-1.srv-a", ContributionEnablementState.DisabledProfile);
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-1.srv-a")));
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-2.srv-a")));
    });
    test("updates when server definitions change", () => {
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv-a", label: "Server A" }]);
      const col2 = {
        ...createCollectionWithServers("col-2", 100, [])
      };
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      setupModel();
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv-a")));
      col2.serverDefinitions.set([{ ...baseDefinition, id: "col-2.srv-a", label: "Server A" }], void 0);
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv-a")));
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-2.srv-a")));
    });
    test("three-way collision: only highest priority is enabled", () => {
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv", label: "My Server" }]);
      const col2 = createCollectionWithServers("col-2", 100, [{ id: "col-2.srv", label: "My Server" }]);
      const col3 = createCollectionWithServers("col-3", 200, [{ id: "col-3.srv", label: "My Server" }]);
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      store.add(registry.registerCollection(col3));
      setupModel();
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv")));
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-2.srv")));
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-3.srv")));
    });
    test("three-way collision: enabling lowest disables both others", () => {
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv", label: "My Server" }]);
      const col2 = createCollectionWithServers("col-2", 100, [{ id: "col-2.srv", label: "My Server" }]);
      const col3 = createCollectionWithServers("col-3", 200, [{ id: "col-3.srv", label: "My Server" }]);
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      store.add(registry.registerCollection(col3));
      setupModel();
      enablementModel.setEnabled("col-3.srv", ContributionEnablementState.EnabledWorkspace);
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-1.srv")));
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-2.srv")));
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-3.srv")));
    });
    test("disabling winner cascades to next in priority", () => {
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv", label: "My Server" }]);
      const col2 = createCollectionWithServers("col-2", 100, [{ id: "col-2.srv", label: "My Server" }]);
      const col3 = createCollectionWithServers("col-3", 200, [{ id: "col-3.srv", label: "My Server" }]);
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      store.add(registry.registerCollection(col3));
      setupModel();
      enablementModel.setEnabled("col-1.srv", ContributionEnablementState.DisabledProfile);
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-1.srv")));
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-2.srv")));
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-3.srv")));
    });
    test("both servers in same collection with same label: only first enabled", () => {
      const col = createCollectionWithServers("col-1", 0, [
        { id: "col-1.srv-a", label: "My Server" },
        { id: "col-1.srv-b", label: "My Server" }
      ]);
      store.add(registry.registerCollection(col));
      setupModel();
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv-a")));
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-1.srv-b")));
    });
    test("EnabledWorkspace non-winner still suppressed if winner also enabled", () => {
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv", label: "My Server" }]);
      const col2 = createCollectionWithServers("col-2", 100, [{ id: "col-2.srv", label: "My Server" }]);
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      setupModel();
      baseEnablement.setEnabled("col-1.srv", ContributionEnablementState.EnabledWorkspace);
      baseEnablement.setEnabled("col-2.srv", ContributionEnablementState.EnabledWorkspace);
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv")));
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-2.srv")));
    });
    test("remove clears collision override and restores default behavior", () => {
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv", label: "My Server" }]);
      const col2 = createCollectionWithServers("col-2", 100, [{ id: "col-2.srv", label: "My Server" }]);
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      setupModel();
      enablementModel.setEnabled("col-2.srv", ContributionEnablementState.EnabledWorkspace);
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-1.srv")));
      enablementModel.remove("col-1.srv");
      enablementModel.remove("col-2.srv");
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv")));
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-2.srv")));
    });
    test("non-colliding servers in same collection as colliding ones are unaffected", () => {
      const col1 = createCollectionWithServers("col-1", 0, [
        { id: "col-1.srv-a", label: "My Server" },
        { id: "col-1.srv-b", label: "Unique Server" }
      ]);
      const col2 = createCollectionWithServers("col-2", 100, [
        { id: "col-2.srv-a", label: "My Server" },
        { id: "col-2.srv-c", label: "Another Unique" }
      ]);
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      setupModel();
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv-a")));
      assert.ok(!isContributionEnabled(enablementModel.readEnabled("col-2.srv-a")));
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv-b")));
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-2.srv-c")));
    });
    test("setEnabled with non-colliding server does not affect others", () => {
      const col1 = createCollectionWithServers("col-1", 0, [{ id: "col-1.srv-a", label: "Server A" }]);
      const col2 = createCollectionWithServers("col-2", 100, [{ id: "col-2.srv-b", label: "Server B" }]);
      store.add(registry.registerCollection(col1));
      store.add(registry.registerCollection(col2));
      setupModel();
      enablementModel.setEnabled("col-2.srv-b", ContributionEnablementState.EnabledWorkspace);
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-1.srv-a")));
      assert.ok(isContributionEnabled(enablementModel.readEnabled("col-2.srv-b")));
    });
  });
  suite("Trust Flow", () => {
    function createTestCollection(trustBehavior, id = "test-collection") {
      return {
        id,
        label: "Test Collection",
        remoteAuthority: null,
        serverDefinitions: observableValue("serverDefs", []),
        trustBehavior,
        scope: StorageScope.APPLICATION,
        configTarget: ConfigurationTarget.USER,
        order: 0
      };
    }
    function createTestDefinition(id = "test-server", cacheNonce = "nonce-a") {
      return {
        id,
        label: "Test Server",
        cacheNonce,
        launch: {
          type: McpServerTransportType.Stdio,
          command: "test-command",
          args: [],
          env: {},
          envFile: void 0,
          cwd: "/test",
          sandbox: void 0
        }
      };
    }
    function setupRegistry(trustBehavior = McpServerTrust.Kind.TrustedOnNonce, cacheNonce = "nonce-a") {
      const delegate = new TestMcpHostDelegate();
      store.add(registry.registerDelegate(delegate));
      const collection = createTestCollection(trustBehavior);
      const definition = createTestDefinition("test-server", cacheNonce);
      collection.serverDefinitions.set([definition], void 0);
      store.add(registry.registerCollection(collection));
      return { collection, definition, delegate };
    }
    test("trusted collection allows connection without prompting", async () => {
      const { collection, definition } = setupRegistry(McpServerTrust.Kind.Trusted);
      const connection = await registry.resolveConnection({
        collectionRef: collection,
        definitionRef: definition,
        logger,
        trustNonceBearer,
        taskManager
      });
      assert.ok(connection, "Connection should be created for trusted collection");
      assert.strictEqual(registry.nextDefinitionIdsToTrust, void 0, "Trust dialog should not have been called");
      connection.dispose();
    });
    test("nonce-based trust allows connection when nonce matches", async () => {
      const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, "nonce-a");
      trustNonceBearer.trustedAtNonce = "nonce-a";
      const connection = await registry.resolveConnection({
        collectionRef: collection,
        definitionRef: definition,
        logger,
        trustNonceBearer,
        taskManager
      });
      assert.ok(connection, "Connection should be created when nonce matches");
      assert.strictEqual(registry.nextDefinitionIdsToTrust, void 0, "Trust dialog should not have been called");
      connection.dispose();
    });
    test("nonce-based trust prompts when nonce changes", async () => {
      const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, "nonce-b");
      trustNonceBearer.trustedAtNonce = "nonce-a";
      registry.nextDefinitionIdsToTrust = [definition.id];
      const connection = await registry.resolveConnection({
        collectionRef: collection,
        definitionRef: definition,
        logger,
        trustNonceBearer,
        taskManager
      });
      assert.ok(connection, "Connection should be created when user trusts");
      assert.strictEqual(trustNonceBearer.trustedAtNonce, "nonce-b", "Nonce should be updated");
      connection.dispose();
    });
    test("nonce-based trust denies connection when user rejects", async () => {
      const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, "nonce-b");
      trustNonceBearer.trustedAtNonce = "nonce-a";
      registry.nextDefinitionIdsToTrust = [];
      const connection = await registry.resolveConnection({
        collectionRef: collection,
        definitionRef: definition,
        logger,
        trustNonceBearer,
        taskManager
      });
      assert.strictEqual(connection, void 0, "Connection should not be created when user rejects");
      assert.strictEqual(trustNonceBearer.trustedAtNonce, "__vscode_not_trusted", "Should mark as explicitly not trusted");
    });
    test("autoTrustChanges bypasses prompt when nonce changes", async () => {
      const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, "nonce-b");
      trustNonceBearer.trustedAtNonce = "nonce-a";
      const connection = await registry.resolveConnection({
        collectionRef: collection,
        definitionRef: definition,
        logger,
        trustNonceBearer,
        autoTrustChanges: true,
        taskManager
      });
      assert.ok(connection, "Connection should be created with autoTrustChanges");
      assert.strictEqual(trustNonceBearer.trustedAtNonce, "nonce-b", "Nonce should be updated");
      assert.strictEqual(registry.nextDefinitionIdsToTrust, void 0, "Trust dialog should not have been called");
      connection.dispose();
    });
    test('promptType "never" skips prompt and fails silently', async () => {
      const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, "nonce-b");
      trustNonceBearer.trustedAtNonce = "nonce-a";
      const connection = await registry.resolveConnection({
        collectionRef: collection,
        definitionRef: definition,
        logger,
        trustNonceBearer,
        promptType: "never",
        taskManager
      });
      assert.strictEqual(connection, void 0, 'Connection should not be created with promptType "never"');
      assert.strictEqual(registry.nextDefinitionIdsToTrust, void 0, "Trust dialog should not have been called");
    });
    test('promptType "only-new" skips previously untrusted servers', async () => {
      const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, "nonce-b");
      trustNonceBearer.trustedAtNonce = "__vscode_not_trusted";
      const connection = await registry.resolveConnection({
        collectionRef: collection,
        definitionRef: definition,
        logger,
        trustNonceBearer,
        promptType: "only-new",
        taskManager
      });
      assert.strictEqual(connection, void 0, "Connection should not be created for previously untrusted server");
      assert.strictEqual(registry.nextDefinitionIdsToTrust, void 0, "Trust dialog should not have been called");
    });
    test('promptType "all-untrusted" prompts for previously untrusted servers', async () => {
      const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, "nonce-b");
      trustNonceBearer.trustedAtNonce = "__vscode_not_trusted";
      registry.nextDefinitionIdsToTrust = [definition.id];
      const connection = await registry.resolveConnection({
        collectionRef: collection,
        definitionRef: definition,
        logger,
        trustNonceBearer,
        promptType: "all-untrusted",
        taskManager
      });
      assert.ok(connection, "Connection should be created when user trusts previously untrusted server");
      assert.strictEqual(trustNonceBearer.trustedAtNonce, "nonce-b", "Nonce should be updated");
      connection.dispose();
    });
    test("concurrent resolveConnection calls with same interaction are grouped", async () => {
      const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, "nonce-b");
      trustNonceBearer.trustedAtNonce = "nonce-a";
      const definition2 = createTestDefinition("test-server-2", "nonce-c");
      collection.serverDefinitions.set([definition, definition2], void 0);
      const interaction = new McpStartServerInteraction();
      interaction.participants.set(definition.id, { s: "unknown" });
      interaction.participants.set(definition2.id, { s: "unknown" });
      const trustNonceBearer2 = { trustedAtNonce: "nonce-b" };
      registry.nextDefinitionIdsToTrust = [definition.id, definition2.id];
      const [connection1, connection2] = await Promise.all([
        registry.resolveConnection({
          collectionRef: collection,
          definitionRef: definition,
          logger,
          trustNonceBearer,
          interaction,
          taskManager
        }),
        registry.resolveConnection({
          collectionRef: collection,
          definitionRef: definition2,
          logger,
          trustNonceBearer: trustNonceBearer2,
          interaction,
          taskManager
        })
      ]);
      assert.ok(connection1, "First connection should be created");
      assert.ok(connection2, "Second connection should be created");
      assert.strictEqual(trustNonceBearer.trustedAtNonce, "nonce-b", "First nonce should be updated");
      assert.strictEqual(trustNonceBearer2.trustedAtNonce, "nonce-c", "Second nonce should be updated");
      connection1.dispose();
      connection2.dispose();
    });
    test("user cancelling trust dialog returns undefined for all pending connections", async () => {
      const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, "nonce-b");
      trustNonceBearer.trustedAtNonce = "nonce-a";
      const definition2 = createTestDefinition("test-server-2", "nonce-c");
      collection.serverDefinitions.set([definition, definition2], void 0);
      const interaction = new McpStartServerInteraction();
      interaction.participants.set(definition.id, { s: "unknown" });
      interaction.participants.set(definition2.id, { s: "unknown" });
      const trustNonceBearer2 = { trustedAtNonce: "nonce-b" };
      registry.nextDefinitionIdsToTrust = void 0;
      const [connection1, connection2] = await Promise.all([
        registry.resolveConnection({
          collectionRef: collection,
          definitionRef: definition,
          logger,
          trustNonceBearer,
          interaction,
          taskManager
        }),
        registry.resolveConnection({
          collectionRef: collection,
          definitionRef: definition2,
          logger,
          trustNonceBearer: trustNonceBearer2,
          interaction,
          taskManager
        })
      ]);
      assert.strictEqual(connection1, void 0, "First connection should not be created when user cancels");
      assert.strictEqual(connection2, void 0, "Second connection should not be created when user cancels");
    });
    test("partial trust selection in grouped interaction", async () => {
      const { collection, definition } = setupRegistry(McpServerTrust.Kind.TrustedOnNonce, "nonce-b");
      trustNonceBearer.trustedAtNonce = "nonce-a";
      const definition2 = createTestDefinition("test-server-2", "nonce-c");
      collection.serverDefinitions.set([definition, definition2], void 0);
      const interaction = new McpStartServerInteraction();
      interaction.participants.set(definition.id, { s: "unknown" });
      interaction.participants.set(definition2.id, { s: "unknown" });
      const trustNonceBearer2 = { trustedAtNonce: "nonce-b" };
      registry.nextDefinitionIdsToTrust = [definition.id];
      const [connection1, connection2] = await Promise.all([
        registry.resolveConnection({
          collectionRef: collection,
          definitionRef: definition,
          logger,
          trustNonceBearer,
          interaction,
          taskManager
        }),
        registry.resolveConnection({
          collectionRef: collection,
          definitionRef: definition2,
          logger,
          trustNonceBearer: trustNonceBearer2,
          interaction,
          taskManager
        })
      ]);
      assert.ok(connection1, "First connection should be created when trusted");
      assert.strictEqual(connection2, void 0, "Second connection should not be created when not trusted");
      assert.strictEqual(trustNonceBearer.trustedAtNonce, "nonce-b", "First nonce should be updated");
      assert.strictEqual(trustNonceBearer2.trustedAtNonce, "__vscode_not_trusted", "Second nonce should be marked as not trusted");
      connection1.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcdGVzdFxcY29tbW9uXFxtY3BSZWdpc3RyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyB1cGNhc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UsIElQcm9tcHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ2dlciwgSUxvZ2dlclNlcnZpY2UsIElMb2dTZXJ2aWNlLCBOdWxsTG9nZ2VyLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IG1jcEFjY2Vzc0NvbmZpZywgTWNwQWNjZXNzVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcE1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSU1jcFNhbmRib3hDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vdGVzdC9jb21tb24vdGVzdE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlY3JldFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc2VjcmV0cy9jb21tb24vc2VjcmV0cy5qcyc7XG5pbXBvcnQgeyBUZXN0U2VjcmV0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zZWNyZXRzL3Rlc3QvY29tbW9uL3Rlc3RTZWNyZXRTdG9yYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUZvbGRlckRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24sIFJlcGxhY2VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLmpzJztcbmltcG9ydCB7IElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuaW1wb3J0IHsgVGVzdExvZ2dlclNlcnZpY2UsIFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUsIEVuYWJsZW1lbnRNb2RlbCwgaXNDb250cmlidXRpb25FbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9jb21tb24vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBNY3BDb2xsaXNpb25CZWhhdmlvciwgbWNwU2VydmVyQ29sbGlzaW9uQmVoYXZpb3JTZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL21jcENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTWNwUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb21tb24vbWNwUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSU1jcEhvc3REZWxlZ2F0ZSwgSU1jcE1lc3NhZ2VUcmFuc3BvcnQgfSBmcm9tICcuLi8uLi9jb21tb24vbWNwUmVnaXN0cnlUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTWNwU2FuZGJveFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbWNwU2FuZGJveFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyQ29ubmVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BTZXJ2ZXJDb25uZWN0aW9uLmpzJztcbmltcG9ydCB7IE1jcENvbGxpc2lvbkVuYWJsZW1lbnRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1jcFRhc2tNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL21jcFRhc2tNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElNY3BQb3RlbnRpYWxTYW5kYm94QmxvY2ssIExhenlDb2xsZWN0aW9uU3RhdGUsIE1DUF9QTFVHSU5fQ09MTEVDVElPTl9JRF9QUkVGSVgsIE1jcENvbGxlY3Rpb25EZWZpbml0aW9uLCBNY3BDb2xsZWN0aW9uUHJvdmVuYW5jZSwgTWNwU2VydmVyRGVmaW5pdGlvbiwgTWNwU2VydmVyTGF1bmNoLCBNY3BTZXJ2ZXJUcmFuc3BvcnRTdGRpbywgTWNwU2VydmVyVHJhbnNwb3J0VHlwZSwgTWNwU2VydmVyVHJ1c3QsIE1jcFN0YXJ0U2VydmVySW50ZXJhY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgVGVzdE1jcE1lc3NhZ2VUcmFuc3BvcnQgfSBmcm9tICcuL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL2NvcGlsb3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuXG5jbGFzcyBUZXN0Q29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgaW50ZXJhY3RpdmVDb3VudGVyID0gMDtcblxuXHQvLyBVc2VkIHRvIHNpbXVsYXRlIHN0b3JlZC9yZXNvbHZlZCB2YXJpYWJsZXNcblx0cHJpdmF0ZSByZWFkb25seSByZXNvbHZlZFZhcmlhYmxlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Ly8gQWRkIHNvbWUgdGVzdCB2YXJpYWJsZXNcblx0XHR0aGlzLnJlc29sdmVkVmFyaWFibGVzLnNldCgnd29ya3NwYWNlRm9sZGVyJywgJy90ZXN0L3dvcmtzcGFjZScpO1xuXHRcdHRoaXMucmVzb2x2ZWRWYXJpYWJsZXMuc2V0KCdmaWxlQmFzZW5hbWUnLCAndGVzdC50eHQnKTtcblx0fVxuXG5cdHJlc29sdmVBc3luYzxUPihmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXJEYXRhIHwgdW5kZWZpbmVkLCB2YWx1ZTogVCk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24ucGFyc2UodmFsdWUpO1xuXHRcdGZvciAoY29uc3QgdmFyaWFibGUgb2YgcGFyc2VkLnVucmVzb2x2ZWQoKSkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVkVmFyaWFibGVzLmdldCh2YXJpYWJsZS5pbm5lcik7XG5cdFx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdFx0cGFyc2VkLnJlc29sdmUodmFyaWFibGUsIHJlc29sdmVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHBhcnNlZC50b09iamVjdCgpKTtcblx0fVxuXG5cdHJlc29sdmVXaXRoSW50ZXJhY3Rpb24oZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyRGF0YSB8IHVuZGVmaW5lZCwgY29uZmlnOiB1bmtub3duLCBzZWN0aW9uPzogc3RyaW5nLCB2YXJpYWJsZXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCB0YXJnZXQ/OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogUHJvbWlzZTxNYXA8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGFyc2VkID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZShjb25maWcpO1xuXHRcdC8vIEZvciB0ZXN0aW5nLCB3ZSBzaW11bGF0ZSBpbnRlcmFjdGlvbiBieSByZXR1cm5pbmcgYSBtYXAgd2l0aCBzb21lIHZhcmlhYmxlc1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0cmVzdWx0LnNldCgnaW5wdXQ6dGVzdEludGVyYWN0aXZlJywgYGludGVyYWN0aXZlVmFsdWUke3RoaXMuaW50ZXJhY3RpdmVDb3VudGVyKyt9YCk7XG5cdFx0cmVzdWx0LnNldCgnY29tbWFuZDp0ZXN0Q29tbWFuZCcsIGBjb21tYW5kT3V0cHV0JHt0aGlzLmludGVyYWN0aXZlQ291bnRlcisrfX1gKTtcblxuXHRcdC8vIElmIHZhcmlhYmxlcyBhcmUgcHJvdmlkZWQsIGluY2x1ZGUgdGhvc2UgdG9vXG5cdFx0Zm9yIChjb25zdCBbaywgdl0gb2YgcmVzdWx0LmVudHJpZXMoKSkge1xuXHRcdFx0Y29uc3QgcmVwbGFjZW1lbnQ6IFJlcGxhY2VtZW50ID0ge1xuXHRcdFx0XHRpZDogJyR7JyArIGsgKyAnfScsXG5cdFx0XHRcdGlubmVyOiBrLFxuXHRcdFx0XHRuYW1lOiBrLnNwbGl0KCc6JylbMF0gfHwgayxcblx0XHRcdFx0YXJnOiBrLnNwbGl0KCc6JylbMV1cblx0XHRcdH07XG5cdFx0XHRwYXJzZWQucmVzb2x2ZShyZXBsYWNlbWVudCwgdik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RNY3BIb3N0RGVsZWdhdGUgaW1wbGVtZW50cyBJTWNwSG9zdERlbGVnYXRlIHtcblx0cHJpb3JpdHkgPSAwO1xuXG5cdHN1YnN0aXR1dGVWYXJpYWJsZXMoc2VydmVyRGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbiwgbGF1bmNoOiBNY3BTZXJ2ZXJMYXVuY2gpOiBQcm9taXNlPE1jcFNlcnZlckxhdW5jaD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobGF1bmNoKTtcblx0fVxuXG5cdGNhblN0YXJ0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0c3RhcnQoKTogSU1jcE1lc3NhZ2VUcmFuc3BvcnQge1xuXHRcdHJldHVybiBuZXcgVGVzdE1jcE1lc3NhZ2VUcmFuc3BvcnQoKTtcblx0fVxuXG5cdHdhaXRGb3JJbml0aWFsUHJvdmlkZXJQcm9taXNlcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdERpYWxvZ1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9wcm9tcHRSZXN1bHQ6IGJvb2xlYW4gfCB1bmRlZmluZWQgPSB0cnVlO1xuXHRwcml2YXRlIF9wcm9tcHRTcHk6IHNpbm9uLlNpbm9uU3R1YjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl9wcm9tcHRTcHkgPSBzaW5vbi5zdHViKCk7XG5cdFx0dGhpcy5fcHJvbXB0U3B5LmNhbGxzRmFrZSgoKSA9PiB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgcmVzdWx0OiB0aGlzLl9wcm9tcHRSZXN1bHQgfSk7XG5cdFx0fSk7XG5cdH1cblxuXHRzZXRQcm9tcHRSZXN1bHQocmVzdWx0OiBib29sZWFuIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJvbXB0UmVzdWx0ID0gcmVzdWx0O1xuXHR9XG5cblx0Z2V0IHByb21wdFNweSgpOiBzaW5vbi5TaW5vblN0dWIge1xuXHRcdHJldHVybiB0aGlzLl9wcm9tcHRTcHk7XG5cdH1cblxuXHRwcm9tcHQ8VD4ob3B0aW9uczogSVByb21wdDxUPik6IFByb21pc2U8eyByZXN1bHQ/OiBUIH0+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvbXB0U3B5KG9wdGlvbnMpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RNY3BSZWdpc3RyeSBleHRlbmRzIE1jcFJlZ2lzdHJ5IHtcblx0cHVibGljIG5leHREZWZpbml0aW9uSWRzVG9UcnVzdDogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9wcm9tcHRGb3JUcnVzdE9wZW5EaWFsb2coKTogUHJvbWlzZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5uZXh0RGVmaW5pdGlvbklkc1RvVHJ1c3QpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RNY3BTYW5kYm94U2VydmljZSBpbXBsZW1lbnRzIElNY3BTYW5kYm94U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwdWJsaWMgY2FsbENvdW50ID0gMDtcblx0cHVibGljIGVuYWJsZWQgPSBmYWxzZTtcblx0cHVibGljIGxhc3RMYXVuY2hDYWxsQXJnczogeyBzZXJ2ZXJEZWY6IE1jcFNlcnZlckRlZmluaXRpb247IGxhdW5jaDogTWNwU2VydmVyTGF1bmNoOyByZW1vdGVBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZDsgY29uZmlnVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0IH0gfCB1bmRlZmluZWQ7XG5cblx0bGF1bmNoSW5TYW5kYm94SWZFbmFibGVkKHNlcnZlckRlZjogTWNwU2VydmVyRGVmaW5pdGlvbiwgbGF1bmNoOiBNY3BTZXJ2ZXJMYXVuY2gsIHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkLCBjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQpOiBQcm9taXNlPE1jcFNlcnZlckxhdW5jaD4ge1xuXHRcdHRoaXMuY2FsbENvdW50Kys7XG5cdFx0dGhpcy5sYXN0TGF1bmNoQ2FsbEFyZ3MgPSB7IHNlcnZlckRlZiwgbGF1bmNoLCByZW1vdGVBdXRob3JpdHksIGNvbmZpZ1RhcmdldCB9O1xuXG5cdFx0aWYgKHRoaXMuZW5hYmxlZCAmJiBsYXVuY2gudHlwZSA9PT0gTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdC4uLmxhdW5jaCxcblx0XHRcdFx0Y29tbWFuZDogJ3NhbmRib3hlZC1jb21tYW5kJyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobGF1bmNoKTtcblx0fVxuXG5cdGlzRW5hYmxlZChzZXJ2ZXJEZWY6IE1jcFNlcnZlckRlZmluaXRpb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuZW5hYmxlZCk7XG5cdH1cblxuXHRnZXRTYW5kYm94Q29uZmlnU3VnZ2VzdGlvbk1lc3NhZ2UoX3NlcnZlckxhYmVsOiBzdHJpbmcsIF9wb3RlbnRpYWxCbG9ja3M6IHJlYWRvbmx5IElNY3BQb3RlbnRpYWxTYW5kYm94QmxvY2tbXSwgX2V4aXN0aW5nU2FuZGJveENvbmZpZz86IElNY3BTYW5kYm94Q29uZmlndXJhdGlvbik6IHsgbWVzc2FnZTogc3RyaW5nOyBzYW5kYm94Q29uZmlnOiBJTWNwU2FuZGJveENvbmZpZ3VyYXRpb24gfSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFwcGx5U2FuZGJveENvbmZpZ1N1Z2dlc3Rpb24oX3NlcnZlckRlZjogTWNwU2VydmVyRGVmaW5pdGlvbiwgX21jcFJlc291cmNlOiBVUkksIF9jb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIF9wb3RlbnRpYWxCbG9ja3M6IHJlYWRvbmx5IElNY3BQb3RlbnRpYWxTYW5kYm94QmxvY2tbXSwgX3N1Z2dlc3RlZFNhbmRib3hDb25maWc/OiBJTWNwU2FuZGJveENvbmZpZ3VyYXRpb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcblx0fVxufVxuXG5zdWl0ZSgnV29ya2JlbmNoIC0gTUNQIC0gUmVnaXN0cnknLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHJlZ2lzdHJ5OiBUZXN0TWNwUmVnaXN0cnk7XG5cdGxldCB0ZXN0U3RvcmFnZVNlcnZpY2U6IFRlc3RTdG9yYWdlU2VydmljZTtcblx0bGV0IHRlc3RDb25maWdSZXNvbHZlclNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlO1xuXHRsZXQgdGVzdERpYWxvZ1NlcnZpY2U6IFRlc3REaWFsb2dTZXJ2aWNlO1xuXHRsZXQgdGVzdENvbGxlY3Rpb246IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uICYgeyBzZXJ2ZXJEZWZpbml0aW9uczogSVNldHRhYmxlT2JzZXJ2YWJsZTxNY3BTZXJ2ZXJEZWZpbml0aW9uW10+IH07XG5cdGxldCBiYXNlRGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbjtcblx0bGV0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCBsb2dnZXI6IElMb2dnZXI7XG5cdGxldCB0cnVzdE5vbmNlQmVhcmVyOiB7IHRydXN0ZWRBdE5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblx0bGV0IHRhc2tNYW5hZ2VyOiBNY3BUYXNrTWFuYWdlcjtcblx0bGV0IHRlc3RNY3BTYW5kYm94U2VydmljZTogVGVzdE1jcFNhbmRib3hTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHR0ZXN0Q29uZmlnUmVzb2x2ZXJTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCk7XG5cdFx0dGVzdFN0b3JhZ2VTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0dGVzdERpYWxvZ1NlcnZpY2UgPSBuZXcgVGVzdERpYWxvZ1NlcnZpY2UoKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBbbWNwQWNjZXNzQ29uZmlnXTogTWNwQWNjZXNzVmFsdWUuQWxsIH0pO1xuXHRcdHRydXN0Tm9uY2VCZWFyZXIgPSB7IHRydXN0ZWRBdE5vbmNlOiB1bmRlZmluZWQgfTtcblx0XHR0ZXN0TWNwU2FuZGJveFNlcnZpY2UgPSBuZXcgVGVzdE1jcFNhbmRib3hTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlXSxcblx0XHRcdFtJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSwgdGVzdENvbmZpZ1Jlc29sdmVyU2VydmljZV0sXG5cdFx0XHRbSVN0b3JhZ2VTZXJ2aWNlLCB0ZXN0U3RvcmFnZVNlcnZpY2VdLFxuXHRcdFx0W0lTZWNyZXRTdG9yYWdlU2VydmljZSwgbmV3IFRlc3RTZWNyZXRTdG9yYWdlU2VydmljZSgpXSxcblx0XHRcdFtJTG9nZ2VyU2VydmljZSwgc3RvcmUuYWRkKG5ldyBUZXN0TG9nZ2VyU2VydmljZSgpKV0sXG5cdFx0XHRbSUxvZ1NlcnZpY2UsIHN0b3JlLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSldLFxuXHRcdFx0W0lOb3RpZmljYXRpb25TZXJ2aWNlLCBuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKV0sXG5cdFx0XHRbSU91dHB1dFNlcnZpY2UsIHVwY2FzdCh7IHNob3dDaGFubmVsOiAoKSA9PiB7IH0gfSldLFxuXHRcdFx0W0lEaWFsb2dTZXJ2aWNlLCB0ZXN0RGlhbG9nU2VydmljZV0sXG5cdFx0XHRbSU1jcFNhbmRib3hTZXJ2aWNlLCB0ZXN0TWNwU2FuZGJveFNlcnZpY2VdLFxuXHRcdFx0W0lQcm9kdWN0U2VydmljZSwge31dLFxuXHRcdCk7XG5cblx0XHRsb2dnZXIgPSBuZXcgTnVsbExvZ2dlcigpO1xuXHRcdHRhc2tNYW5hZ2VyID0gc3RvcmUuYWRkKG5ldyBNY3BUYXNrTWFuYWdlcigpKTtcblxuXHRcdGNvbnN0IGluc3RhU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VzKSk7XG5cdFx0cmVnaXN0cnkgPSBzdG9yZS5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RNY3BSZWdpc3RyeSkpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRlc3QgY29sbGVjdGlvbiB0aGF0IGNhbiBiZSByZXVzZWRcblx0XHR0ZXN0Q29sbGVjdGlvbiA9IHtcblx0XHRcdGlkOiAndGVzdC1jb2xsZWN0aW9uJyxcblx0XHRcdGxhYmVsOiAnVGVzdCBDb2xsZWN0aW9uJyxcblx0XHRcdHJlbW90ZUF1dGhvcml0eTogbnVsbCxcblx0XHRcdHNlcnZlckRlZmluaXRpb25zOiBvYnNlcnZhYmxlVmFsdWUoJ3NlcnZlckRlZnMnLCBbXSksXG5cdFx0XHR0cnVzdEJlaGF2aW9yOiBNY3BTZXJ2ZXJUcnVzdC5LaW5kLlRydXN0ZWQsXG5cdFx0XHRzY29wZTogU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0Y29uZmlnVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRvcmRlcjogMCxcblx0XHR9O1xuXG5cdFx0Ly8gQ3JlYXRlIGJhc2UgZGVmaW5pdGlvbiB0aGF0IGNhbiBiZSByZXVzZWRcblx0XHRiYXNlRGVmaW5pdGlvbiA9IHtcblx0XHRcdGlkOiAndGVzdC1zZXJ2ZXInLFxuXHRcdFx0bGFiZWw6ICdUZXN0IFNlcnZlcicsXG5cdFx0XHRjYWNoZU5vbmNlOiAnYScsXG5cdFx0XHRsYXVuY2g6IHtcblx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbyxcblx0XHRcdFx0Y29tbWFuZDogJ3Rlc3QtY29tbWFuZCcsXG5cdFx0XHRcdGFyZ3M6IFtdLFxuXHRcdFx0XHRlbnY6IHt9LFxuXHRcdFx0XHRlbnZGaWxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdGN3ZDogJy90ZXN0Jyxcblx0XHRcdFx0c2FuZGJveDogdW5kZWZpbmVkXG5cdFx0XHR9XG5cdFx0fTtcblx0fSk7XG5cblx0dGVzdCgncmVnaXN0ZXJDb2xsZWN0aW9uIGFkZHMgY29sbGVjdGlvbiB0byByZWdpc3RyeScsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gcmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKHRlc3RDb2xsZWN0aW9uKTtcblx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KClbMF0sIHRlc3RDb2xsZWN0aW9uKTtcblxuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpY3QgcGx1Z2luLW9ubHkgY3VzdG9taXphdGlvbiBoaWRlcyBub24tcGx1Z2luIE1DUCBjb2xsZWN0aW9ucyBhbmQgYmxvY2tzIGRpcmVjdCBsb29rdXAnLCAoKSA9PiB7XG5cdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbih0ZXN0Q29sbGVjdGlvbikpO1xuXHRcdGNvbnN0IHBsdWdpbkNvbGxlY3Rpb24gPSB7XG5cdFx0XHQuLi50ZXN0Q29sbGVjdGlvbixcblx0XHRcdGlkOiBgJHtNQ1BfUExVR0lOX0NPTExFQ1RJT05fSURfUFJFRklYfXRlc3RgLFxuXHRcdFx0cHJvdmVuYW5jZTogTWNwQ29sbGVjdGlvblByb3ZlbmFuY2UuUGx1Z2luLFxuXHRcdFx0c2VydmVyRGVmaW5pdGlvbnM6IG9ic2VydmFibGVWYWx1ZTxNY3BTZXJ2ZXJEZWZpbml0aW9uW10+KCdwbHVnaW5EZWZpbml0aW9ucycsIFtiYXNlRGVmaW5pdGlvbl0pLFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihwbHVnaW5Db2xsZWN0aW9uKSk7XG5cdFx0Y29uc3Qgc3Bvb2ZlZENvbGxlY3Rpb24gPSB7XG5cdFx0XHQuLi50ZXN0Q29sbGVjdGlvbixcblx0XHRcdGlkOiBgJHtNQ1BfUExVR0lOX0NPTExFQ1RJT05fSURfUFJFRklYfXNwb29mZWQtZXh0ZW5zaW9uL2NvbGxlY3Rpb25gLFxuXHRcdFx0c2VydmVyRGVmaW5pdGlvbnM6IG9ic2VydmFibGVWYWx1ZTxNY3BTZXJ2ZXJEZWZpbml0aW9uW10+KCdzcG9vZmVkRGVmaW5pdGlvbnMnLCBbYmFzZURlZmluaXRpb25dKSxcblx0XHR9O1xuXHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oc3Bvb2ZlZENvbGxlY3Rpb24pKTtcblxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENPUElMT1RfU1RSSUNUX1BMVUdJTl9PTkxZX0NVU1RPTUlaQVRJT05fQ09ORklHLCB0cnVlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChrZXk6IHN0cmluZykgPT4ga2V5ID09PSBDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0NPTkZJRyxcblx0XHR9IGFzIHVua25vd24gYXMgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmNvbGxlY3Rpb25zLmdldCgpLm1hcChjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uaWQpLCBbcGx1Z2luQ29sbGVjdGlvbi5pZF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0U2VydmVyRGVmaW5pdGlvbih0ZXN0Q29sbGVjdGlvbiwgYmFzZURlZmluaXRpb24pLmdldCgpLCB7IGNvbGxlY3Rpb246IHVuZGVmaW5lZCwgc2VydmVyOiB1bmRlZmluZWQgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRTZXJ2ZXJEZWZpbml0aW9uKHNwb29mZWRDb2xsZWN0aW9uLCBiYXNlRGVmaW5pdGlvbikuZ2V0KCksIHsgY29sbGVjdGlvbjogdW5kZWZpbmVkLCBzZXJ2ZXI6IHVuZGVmaW5lZCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0U2VydmVyRGVmaW5pdGlvbihwbHVnaW5Db2xsZWN0aW9uLCBiYXNlRGVmaW5pdGlvbikuZ2V0KCkuc2VydmVyLCBiYXNlRGVmaW5pdGlvbik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGxlY3Rpb25zIGFyZSBub3QgdmlzaWJsZSB3aGVuIG5vdCBlbmFibGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSByZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24odGVzdENvbGxlY3Rpb24pO1xuXHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKS5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24obWNwQWNjZXNzQ29uZmlnLCBNY3BBY2Nlc3NWYWx1ZS5Ob25lKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246ICgpID0+IHRydWUsXG5cdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoW21jcEFjY2Vzc0NvbmZpZ10pLFxuXHRcdFx0Y2hhbmdlOiB7IGtleXM6IFttY3BBY2Nlc3NDb25maWddLCBvdmVycmlkZXM6IFtdIH0sXG5cdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUlxuXHRcdH0gYXMgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk7IGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKS5sZW5ndGgsIDApO1xuXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24obWNwQWNjZXNzQ29uZmlnLCBNY3BBY2Nlc3NWYWx1ZS5BbGwpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKCkgPT4gdHJ1ZSxcblx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbbWNwQWNjZXNzQ29uZmlnXSksXG5cdFx0XHRjaGFuZ2U6IHsga2V5czogW21jcEFjY2Vzc0NvbmZpZ10sIG92ZXJyaWRlczogW10gfSxcblx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSXG5cdFx0fSBhcyBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTtcblx0fSk7XG5cblx0dGVzdCgncmVnaXN0ZXJEZWxlZ2F0ZSBhZGRzIGRlbGVnYXRlIHRvIHJlZ2lzdHJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IFRlc3RNY3BIb3N0RGVsZWdhdGUoKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gcmVnaXN0cnkucmVnaXN0ZXJEZWxlZ2F0ZShkZWxlZ2F0ZSk7XG5cdFx0c3RvcmUuYWRkKGRpc3Bvc2FibGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmRlbGVnYXRlcy5nZXQoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5kZWxlZ2F0ZXMuZ2V0KClbMF0sIGRlbGVnYXRlKTtcblxuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5kZWxlZ2F0ZXMuZ2V0KCkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUNvbm5lY3Rpb24gY3JlYXRlcyBjb25uZWN0aW9uIHdpdGggcmVzb2x2ZWQgdmFyaWFibGVzIGFuZCBtZW1vcml6ZXMgdGhlbSB1bnRpbCBjbGVhcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRlZmluaXRpb246IE1jcFNlcnZlckRlZmluaXRpb24gPSB7XG5cdFx0XHQuLi5iYXNlRGVmaW5pdGlvbixcblx0XHRcdGxhdW5jaDoge1xuXHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLlN0ZGlvLFxuXHRcdFx0XHRjb21tYW5kOiAnJHt3b3Jrc3BhY2VGb2xkZXJ9L2NtZCcsXG5cdFx0XHRcdGFyZ3M6IFsnLS1maWxlJywgJyR7ZmlsZUJhc2VuYW1lfSddLFxuXHRcdFx0XHRlbnY6IHtcblx0XHRcdFx0XHRQQVRIOiAnJHtpbnB1dDp0ZXN0SW50ZXJhY3RpdmV9J1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbnZGaWxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdGN3ZDogJy90ZXN0Jyxcblx0XHRcdFx0c2FuZGJveDogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0dmFyaWFibGVSZXBsYWNlbWVudDoge1xuXHRcdFx0XHRzZWN0aW9uOiAnbWNwJyxcblx0XHRcdFx0dGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSxcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBuZXcgVGVzdE1jcEhvc3REZWxlZ2F0ZSgpO1xuXHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckRlbGVnYXRlKGRlbGVnYXRlKSk7XG5cdFx0dGVzdENvbGxlY3Rpb24uc2VydmVyRGVmaW5pdGlvbnMuc2V0KFtkZWZpbml0aW9uXSwgdW5kZWZpbmVkKTtcblx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKHRlc3RDb2xsZWN0aW9uKSk7XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgcmVnaXN0cnkucmVzb2x2ZUNvbm5lY3Rpb24oeyBjb2xsZWN0aW9uUmVmOiB0ZXN0Q29sbGVjdGlvbiwgZGVmaW5pdGlvblJlZjogZGVmaW5pdGlvbiwgbG9nZ2VyLCB0cnVzdE5vbmNlQmVhcmVyLCB0YXNrTWFuYWdlciB9KSBhcyBNY3BTZXJ2ZXJDb25uZWN0aW9uO1xuXG5cdFx0YXNzZXJ0Lm9rKGNvbm5lY3Rpb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLmRlZmluaXRpb24sIGRlZmluaXRpb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoY29ubmVjdGlvbi5sYXVuY2hEZWZpbml0aW9uIGFzIHVua25vd24gYXMgeyBjb21tYW5kOiBzdHJpbmcgfSkuY29tbWFuZCwgJy90ZXN0L3dvcmtzcGFjZS9jbWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGNvbm5lY3Rpb24ubGF1bmNoRGVmaW5pdGlvbiBhcyB1bmtub3duIGFzIHsgZW52OiB7IFBBVEg6IHN0cmluZyB9IH0pLmVudi5QQVRILCAnaW50ZXJhY3RpdmVWYWx1ZTAnKTtcblx0XHRjb25uZWN0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IGNvbm5lY3Rpb24yID0gYXdhaXQgcmVnaXN0cnkucmVzb2x2ZUNvbm5lY3Rpb24oeyBjb2xsZWN0aW9uUmVmOiB0ZXN0Q29sbGVjdGlvbiwgZGVmaW5pdGlvblJlZjogZGVmaW5pdGlvbiwgbG9nZ2VyLCB0cnVzdE5vbmNlQmVhcmVyLCB0YXNrTWFuYWdlciB9KSBhcyBNY3BTZXJ2ZXJDb25uZWN0aW9uO1xuXG5cdFx0YXNzZXJ0Lm9rKGNvbm5lY3Rpb24yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGNvbm5lY3Rpb24yLmxhdW5jaERlZmluaXRpb24gYXMgdW5rbm93biBhcyB7IGVudjogeyBQQVRIOiBzdHJpbmcgfSB9KS5lbnYuUEFUSCwgJ2ludGVyYWN0aXZlVmFsdWUwJyk7XG5cdFx0Y29ubmVjdGlvbjIuZGlzcG9zZSgpO1xuXG5cdFx0cmVnaXN0cnkuY2xlYXJTYXZlZElucHV0cyhTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblxuXHRcdGNvbnN0IGNvbm5lY3Rpb24zID0gYXdhaXQgcmVnaXN0cnkucmVzb2x2ZUNvbm5lY3Rpb24oeyBjb2xsZWN0aW9uUmVmOiB0ZXN0Q29sbGVjdGlvbiwgZGVmaW5pdGlvblJlZjogZGVmaW5pdGlvbiwgbG9nZ2VyLCB0cnVzdE5vbmNlQmVhcmVyLCB0YXNrTWFuYWdlciB9KSBhcyBNY3BTZXJ2ZXJDb25uZWN0aW9uO1xuXG5cdFx0YXNzZXJ0Lm9rKGNvbm5lY3Rpb24zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGNvbm5lY3Rpb24zLmxhdW5jaERlZmluaXRpb24gYXMgdW5rbm93biBhcyB7IGVudjogeyBQQVRIOiBzdHJpbmcgfSB9KS5lbnYuUEFUSCwgJ2ludGVyYWN0aXZlVmFsdWU0Jyk7XG5cdFx0Y29ubmVjdGlvbjMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlQ29ubmVjdGlvbiBwcmVzZXJ2ZXMgVVJJIGluIHJlc29sdmVkIEhUVFAgbGF1bmNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRlZmluaXRpb246IE1jcFNlcnZlckRlZmluaXRpb24gPSB7XG5cdFx0XHQuLi5iYXNlRGVmaW5pdGlvbixcblx0XHRcdGxhdW5jaDoge1xuXHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLkhUVFAsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdodHRwczovL21jcC5leGFtcGxlLmNvbS9tY3AnKSxcblx0XHRcdFx0aGVhZGVyczogW10sXG5cdFx0XHR9LFxuXHRcdFx0dmFyaWFibGVSZXBsYWNlbWVudDoge1xuXHRcdFx0XHRzZWN0aW9uOiAnbWNwJyxcblx0XHRcdFx0dGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSxcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBuZXcgVGVzdE1jcEhvc3REZWxlZ2F0ZSgpO1xuXHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckRlbGVnYXRlKGRlbGVnYXRlKSk7XG5cdFx0dGVzdENvbGxlY3Rpb24uc2VydmVyRGVmaW5pdGlvbnMuc2V0KFtkZWZpbml0aW9uXSwgdW5kZWZpbmVkKTtcblx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKHRlc3RDb2xsZWN0aW9uKSk7XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgcmVnaXN0cnkucmVzb2x2ZUNvbm5lY3Rpb24oeyBjb2xsZWN0aW9uUmVmOiB0ZXN0Q29sbGVjdGlvbiwgZGVmaW5pdGlvblJlZjogZGVmaW5pdGlvbiwgbG9nZ2VyLCB0cnVzdE5vbmNlQmVhcmVyLCB0YXNrTWFuYWdlciB9KSBhcyBNY3BTZXJ2ZXJDb25uZWN0aW9uO1xuXHRcdGNvbnN0IGxhdW5jaCA9IGNvbm5lY3Rpb24ubGF1bmNoRGVmaW5pdGlvbjtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF1bmNoLnR5cGUgPT09IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuSFRUUCA/IHtcblx0XHRcdGlzVXJpOiBVUkkuaXNVcmkobGF1bmNoLnVyaSksXG5cdFx0XHR1cmw6IGxhdW5jaC51cmkudG9TdHJpbmcodHJ1ZSksXG5cdFx0fSA6IHsgdHlwZTogbGF1bmNoLnR5cGUgfSwge1xuXHRcdFx0aXNVcmk6IHRydWUsXG5cdFx0XHR1cmw6ICdodHRwczovL21jcC5leGFtcGxlLmNvbS9tY3AnLFxuXHRcdH0pO1xuXHRcdGNvbm5lY3Rpb24uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlQ29ubmVjdGlvbiB1c2VzIHVzZXItcHJvdmlkZWQgbGF1bmNoIGNvbmZpZ3VyYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQ3JlYXRlIGEgY29sbGVjdGlvbiB3aXRoIGN1c3RvbSBsYXVuY2ggcmVzb2x2ZXJcblx0XHRjb25zdCBjdXN0b21Db2xsZWN0aW9uOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiA9IHtcblx0XHRcdC4uLnRlc3RDb2xsZWN0aW9uLFxuXHRcdFx0cmVzb2x2ZVNlcnZlckxhbmNoOiBhc3luYyAoZGVmKSA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uKGRlZi5sYXVuY2ggYXMgTWNwU2VydmVyVHJhbnNwb3J0U3RkaW8pLFxuXHRcdFx0XHRcdGVudjogeyBDVVNUT01fRU5WOiAndmFsdWUnIH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIENyZWF0ZSBhIGRlZmluaXRpb24gd2l0aCB2YXJpYWJsZSByZXBsYWNlbWVudFxuXHRcdGNvbnN0IGRlZmluaXRpb246IE1jcFNlcnZlckRlZmluaXRpb24gPSB7XG5cdFx0XHQuLi5iYXNlRGVmaW5pdGlvbixcblx0XHRcdHZhcmlhYmxlUmVwbGFjZW1lbnQ6IHtcblx0XHRcdFx0c2VjdGlvbjogJ21jcCcsXG5cdFx0XHRcdHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UsXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IFRlc3RNY3BIb3N0RGVsZWdhdGUoKTtcblx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJEZWxlZ2F0ZShkZWxlZ2F0ZSkpO1xuXHRcdHRlc3RDb2xsZWN0aW9uLnNlcnZlckRlZmluaXRpb25zLnNldChbZGVmaW5pdGlvbl0sIHVuZGVmaW5lZCk7XG5cdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjdXN0b21Db2xsZWN0aW9uKSk7XG5cblx0XHQvLyBSZXNvbHZlIGNvbm5lY3Rpb24gc2hvdWxkIHVzZSB0aGUgY3VzdG9tIGxhdW5jaCBjb25maWd1cmF0aW9uXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHJlZ2lzdHJ5LnJlc29sdmVDb25uZWN0aW9uKHtcblx0XHRcdGNvbGxlY3Rpb25SZWY6IGN1c3RvbUNvbGxlY3Rpb24sXG5cdFx0XHRkZWZpbml0aW9uUmVmOiBkZWZpbml0aW9uLFxuXHRcdFx0bG9nZ2VyLFxuXHRcdFx0dHJ1c3ROb25jZUJlYXJlcixcblx0XHRcdHRhc2tNYW5hZ2VyLFxuXHRcdH0pIGFzIE1jcFNlcnZlckNvbm5lY3Rpb247XG5cblx0XHRhc3NlcnQub2soY29ubmVjdGlvbik7XG5cblx0XHQvLyBWZXJpZnkgdGhlIGxhdW5jaCBjb25maWd1cmF0aW9uIHBhc3NlZCB0byBfcmVwbGFjZVZhcmlhYmxlc0luTGF1bmNoIHdhcyB0aGUgY3VzdG9tIG9uZVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGNvbm5lY3Rpb24ubGF1bmNoRGVmaW5pdGlvbiBhcyBNY3BTZXJ2ZXJUcmFuc3BvcnRTdGRpbykuZW52LCB7IENVU1RPTV9FTlY6ICd2YWx1ZScgfSk7XG5cblx0XHRjb25uZWN0aW9uLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUNvbm5lY3Rpb24gY2FsbHMgbGF1bmNoSW5TYW5kYm94SWZFbmFibGVkIHdpdGggZXhwZWN0ZWQgYXJndW1lbnRzIHdoZW4gc2FuZGJveGluZyBpcyBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHRlc3RNY3BTYW5kYm94U2VydmljZS5lbmFibGVkID0gdHJ1ZTtcblx0XHRjb25zdCBtY3BSZXNvdXJjZSA9IFVSSS5maWxlKCcvdGVzdC9tY3AuanNvbicpO1xuXG5cdFx0Y29uc3Qgc2FuZGJveENvbGxlY3Rpb246IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uICYgeyBzZXJ2ZXJEZWZpbml0aW9uczogSVNldHRhYmxlT2JzZXJ2YWJsZTxNY3BTZXJ2ZXJEZWZpbml0aW9uW10+IH0gPSB7XG5cdFx0XHQuLi50ZXN0Q29sbGVjdGlvbixcblx0XHRcdGlkOiAnc2FuZGJveC1jb2xsZWN0aW9uJyxcblx0XHRcdHJlbW90ZUF1dGhvcml0eTogJ3NzaC1yZW1vdGUrdGVzdCcsXG5cdFx0XHRwcmVzZW50YXRpb246IHtcblx0XHRcdFx0b3JpZ2luOiBtY3BSZXNvdXJjZSxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGRlZmluaXRpb246IE1jcFNlcnZlckRlZmluaXRpb24gPSB7XG5cdFx0XHQuLi5iYXNlRGVmaW5pdGlvbixcblx0XHRcdGlkOiAnc2FuZGJveC1zZXJ2ZXInLFxuXHRcdFx0bGF1bmNoOiB7XG5cdFx0XHRcdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8sXG5cdFx0XHRcdGNvbW1hbmQ6ICd0ZXN0LWNvbW1hbmQnLFxuXHRcdFx0XHRhcmdzOiBbJy0tZmxhZyddLFxuXHRcdFx0XHRlbnY6IHt9LFxuXHRcdFx0XHRlbnZGaWxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdGN3ZDogJy90ZXN0Jyxcblx0XHRcdFx0c2FuZGJveDogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBUZXN0TWNwSG9zdERlbGVnYXRlKCk7XG5cdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyRGVsZWdhdGUoZGVsZWdhdGUpKTtcblx0XHRzYW5kYm94Q29sbGVjdGlvbi5zZXJ2ZXJEZWZpbml0aW9ucy5zZXQoW2RlZmluaXRpb25dLCB1bmRlZmluZWQpO1xuXHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oc2FuZGJveENvbGxlY3Rpb24pKTtcblxuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCByZWdpc3RyeS5yZXNvbHZlQ29ubmVjdGlvbih7XG5cdFx0XHRjb2xsZWN0aW9uUmVmOiBzYW5kYm94Q29sbGVjdGlvbixcblx0XHRcdGRlZmluaXRpb25SZWY6IGRlZmluaXRpb24sXG5cdFx0XHRsb2dnZXIsXG5cdFx0XHR0cnVzdE5vbmNlQmVhcmVyLFxuXHRcdFx0dGFza01hbmFnZXIsXG5cdFx0fSkgYXMgTWNwU2VydmVyQ29ubmVjdGlvbjtcblxuXHRcdGFzc2VydC5vayhjb25uZWN0aW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE1jcFNhbmRib3hTZXJ2aWNlLmNhbGxDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RNY3BTYW5kYm94U2VydmljZS5sYXN0TGF1bmNoQ2FsbEFyZ3M/LnNlcnZlckRlZiwgZGVmaW5pdGlvbik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0TWNwU2FuZGJveFNlcnZpY2UubGFzdExhdW5jaENhbGxBcmdzPy5sYXVuY2gsIGRlZmluaXRpb24ubGF1bmNoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE1jcFNhbmRib3hTZXJ2aWNlLmxhc3RMYXVuY2hDYWxsQXJncz8ucmVtb3RlQXV0aG9yaXR5LCAnc3NoLXJlbW90ZSt0ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RNY3BTYW5kYm94U2VydmljZS5sYXN0TGF1bmNoQ2FsbEFyZ3M/LmNvbmZpZ1RhcmdldCwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGNvbm5lY3Rpb24ubGF1bmNoRGVmaW5pdGlvbiBhcyBNY3BTZXJ2ZXJUcmFuc3BvcnRTdGRpbykuY29tbWFuZCwgJ3NhbmRib3hlZC1jb21tYW5kJyk7XG5cblx0XHRjb25uZWN0aW9uLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0c3VpdGUoJ0xhenkgQ29sbGVjdGlvbnMnLCAoKSA9PiB7XG5cdFx0bGV0IGxhenlDb2xsZWN0aW9uOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbjtcblx0XHRsZXQgbm9ybWFsQ29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb247XG5cdFx0bGV0IHJlbW92ZWRDYWxsZWQ6IGJvb2xlYW47XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRyZW1vdmVkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRsYXp5Q29sbGVjdGlvbiA9IHtcblx0XHRcdFx0Li4udGVzdENvbGxlY3Rpb24sXG5cdFx0XHRcdGlkOiAnbGF6eS1jb2xsZWN0aW9uJyxcblx0XHRcdFx0bGF6eToge1xuXHRcdFx0XHRcdGlzQ2FjaGVkOiBmYWxzZSxcblx0XHRcdFx0XHRsb2FkOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdFx0XHRyZW1vdmVkOiAoKSA9PiB7IHJlbW92ZWRDYWxsZWQgPSB0cnVlOyB9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRub3JtYWxDb2xsZWN0aW9uID0ge1xuXHRcdFx0XHQuLi50ZXN0Q29sbGVjdGlvbixcblx0XHRcdFx0aWQ6ICdsYXp5LWNvbGxlY3Rpb24nLFxuXHRcdFx0XHRzZXJ2ZXJEZWZpbml0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCdzZXJ2ZXJEZWZzJywgW2Jhc2VEZWZpbml0aW9uXSlcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWdpc3RlcnMgbGF6eSBjb2xsZWN0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihsYXp5Q29sbGVjdGlvbik7XG5cdFx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKS5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmNvbGxlY3Rpb25zLmdldCgpWzBdLCBsYXp5Q29sbGVjdGlvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkubGF6eUNvbGxlY3Rpb25TdGF0ZS5nZXQoKS5zdGF0ZSwgTGF6eUNvbGxlY3Rpb25TdGF0ZS5IYXNVbmtub3duKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xhenkgY29sbGVjdGlvbiBpcyByZXBsYWNlZCBieSBub3JtYWwgY29sbGVjdGlvbicsICgpID0+IHtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24obGF6eUNvbGxlY3Rpb24pKTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24obm9ybWFsQ29sbGVjdGlvbikpO1xuXG5cdFx0XHRjb25zdCBjb2xsZWN0aW9ucyA9IHJlZ2lzdHJ5LmNvbGxlY3Rpb25zLmdldCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxlY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGVjdGlvbnNbMF0sIG5vcm1hbENvbGxlY3Rpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxlY3Rpb25zWzBdLmxhenksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkubGF6eUNvbGxlY3Rpb25TdGF0ZS5nZXQoKS5zdGF0ZSwgTGF6eUNvbGxlY3Rpb25TdGF0ZS5BbGxLbm93bik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsYXp5Q29sbGVjdGlvblN0YXRlIHVwZGF0ZXMgY29ycmVjdGx5IGR1cmluZyBsb2FkaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGF6eUNvbGxlY3Rpb24gPSB7XG5cdFx0XHRcdC4uLmxhenlDb2xsZWN0aW9uLFxuXHRcdFx0XHRsYXp5OiB7XG5cdFx0XHRcdFx0Li4ubGF6eUNvbGxlY3Rpb24ubGF6eSEsXG5cdFx0XHRcdFx0bG9hZDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdFx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24obm9ybWFsQ29sbGVjdGlvbikpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihsYXp5Q29sbGVjdGlvbikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmxhenlDb2xsZWN0aW9uU3RhdGUuZ2V0KCkuc3RhdGUsIExhenlDb2xsZWN0aW9uU3RhdGUuSGFzVW5rbm93bik7XG5cblx0XHRcdGNvbnN0IGxvYWRpbmdQcm9taXNlID0gcmVnaXN0cnkuZGlzY292ZXJDb2xsZWN0aW9ucygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmxhenlDb2xsZWN0aW9uU3RhdGUuZ2V0KCkuc3RhdGUsIExhenlDb2xsZWN0aW9uU3RhdGUuTG9hZGluZ1Vua25vd24pO1xuXG5cdFx0XHRhd2FpdCBsb2FkaW5nUHJvbWlzZTtcblxuXHRcdFx0Ly8gVGhlIGNvbGxlY3Rpb24gd2Fzbid0IHJlcGxhY2VkLCBzbyBpdCBzaG91bGQgYmUgcmVtb3ZlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmNvbGxlY3Rpb25zLmdldCgpLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkubGF6eUNvbGxlY3Rpb25TdGF0ZS5nZXQoKS5zdGF0ZSwgTGF6eUNvbGxlY3Rpb25TdGF0ZS5BbGxLbm93bik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlZENhbGxlZCwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlZCBjYWxsYmFjayBpcyBjYWxsZWQgd2hlbiBsYXp5IGNvbGxlY3Rpb24gaXMgbm90IHJlcGxhY2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihsYXp5Q29sbGVjdGlvbikpO1xuXHRcdFx0YXdhaXQgcmVnaXN0cnkuZGlzY292ZXJDb2xsZWN0aW9ucygpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlZENhbGxlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdibG9ja2VkIGxhenkgY29sbGVjdGlvbiBpcyByZWplY3RlZCBiZWZvcmUgYWN0aXZhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBsb2FkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRsYXp5Q29sbGVjdGlvbiA9IHtcblx0XHRcdFx0Li4ubGF6eUNvbGxlY3Rpb24sXG5cdFx0XHRcdGxhenk6IHtcblx0XHRcdFx0XHQuLi5sYXp5Q29sbGVjdGlvbi5sYXp5ISxcblx0XHRcdFx0XHRsb2FkOiBhc3luYyAoKSA9PiB7IGxvYWRDYWxsZWQgPSB0cnVlOyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24obGF6eUNvbGxlY3Rpb24pKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENPUElMT1RfU1RSSUNUX1BMVUdJTl9PTkxZX0NVU1RPTUlaQVRJT05fQ09ORklHLCB0cnVlKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoa2V5OiBzdHJpbmcpID0+IGtleSA9PT0gQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUcsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRyZWdpc3RyeS5yZXNvbHZlQ29ubmVjdGlvbih7IGNvbGxlY3Rpb25SZWY6IGxhenlDb2xsZWN0aW9uLCBkZWZpbml0aW9uUmVmOiBiYXNlRGVmaW5pdGlvbiwgbG9nZ2VyLCB0cnVzdE5vbmNlQmVhcmVyLCB0YXNrTWFuYWdlciB9KSxcblx0XHRcdFx0L2Jsb2NrZWQgYnkgZW50ZXJwcmlzZSBjdXN0b21pemF0aW9uIHBvbGljeS8sXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvYWRDYWxsZWQsIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhY2hlZCBsYXp5IGNvbGxlY3Rpb25zIGFyZSB0cmFja2VkIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRcdGxhenlDb2xsZWN0aW9uLmxhenkhLmlzQ2FjaGVkID0gdHJ1ZTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24obGF6eUNvbGxlY3Rpb24pKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmxhenlDb2xsZWN0aW9uU3RhdGUuZ2V0KCkuc3RhdGUsIExhenlDb2xsZWN0aW9uU3RhdGUuQWxsS25vd24pO1xuXG5cdFx0XHQvLyBBZGRpbmcgYW4gdW5jYWNoZWQgbGF6eSBjb2xsZWN0aW9uIGNoYW5nZXMgdGhlIHN0YXRlXG5cdFx0XHRjb25zdCB1bmNhY2hlZExhenkgPSB7XG5cdFx0XHRcdC4uLmxhenlDb2xsZWN0aW9uLFxuXHRcdFx0XHRpZDogJ3VuY2FjaGVkLWxhenknLFxuXHRcdFx0XHRsYXp5OiB7XG5cdFx0XHRcdFx0Li4ubGF6eUNvbGxlY3Rpb24ubGF6eSEsXG5cdFx0XHRcdFx0aXNDYWNoZWQ6IGZhbHNlXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKHVuY2FjaGVkTGF6eSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkubGF6eUNvbGxlY3Rpb25TdGF0ZS5nZXQoKS5zdGF0ZSwgTGF6eUNvbGxlY3Rpb25TdGF0ZS5IYXNVbmtub3duKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0R1cGxpY2F0ZSBDb2xsZWN0aW9uIFByZXZlbnRpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgncHJldmVudHMgZHVwbGljYXRlIG5vbi1sYXp5IGNvbGxlY3Rpb25zIHdpdGggc2FtZSBJRCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbGxlY3Rpb24xID0ge1xuXHRcdFx0XHQuLi50ZXN0Q29sbGVjdGlvbixcblx0XHRcdFx0aWQ6ICdkdXBsaWNhdGUtdGVzdCcsXG5cdFx0XHRcdGxhYmVsOiAnQ29sbGVjdGlvbiAxJyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBjb2xsZWN0aW9uMiA9IHtcblx0XHRcdFx0Li4udGVzdENvbGxlY3Rpb24sXG5cdFx0XHRcdGlkOiAnZHVwbGljYXRlLXRlc3QnLFxuXHRcdFx0XHRsYWJlbDogJ0NvbGxlY3Rpb24gMicsXG5cdFx0XHR9O1xuXG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbGxlY3Rpb24xKSk7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlMiA9IHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2xsZWN0aW9uMik7XG5cblx0XHRcdC8vIFNlY29uZCByZWdpc3RyYXRpb24gc2hvdWxkIHJldHVybiBEaXNwb3NhYmxlLk5vbmUgYW5kIG5vdCBhZGQgZHVwbGljYXRlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zYWJsZTIsIERpc3Bvc2FibGUuTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKVswXSwgY29sbGVjdGlvbjEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmNvbGxlY3Rpb25zLmdldCgpWzBdLmxhYmVsLCAnQ29sbGVjdGlvbiAxJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbGxvd3MgbGF6eSBjb2xsZWN0aW9uIHRvIGJlIHJlcGxhY2VkIGJ5IG5vbi1sYXp5IHdpdGggc2FtZSBJRCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGxhenlDb2xsZWN0aW9uID0ge1xuXHRcdFx0XHQuLi50ZXN0Q29sbGVjdGlvbixcblx0XHRcdFx0aWQ6ICdyZXBsYWNlYWJsZS10ZXN0Jyxcblx0XHRcdFx0bGFiZWw6ICdMYXp5IENvbGxlY3Rpb24nLFxuXHRcdFx0XHRsYXp5OiB7XG5cdFx0XHRcdFx0aXNDYWNoZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGxvYWQ6ICgpID0+IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgbm9uTGF6eUNvbGxlY3Rpb24gPSB7XG5cdFx0XHRcdC4uLnRlc3RDb2xsZWN0aW9uLFxuXHRcdFx0XHRpZDogJ3JlcGxhY2VhYmxlLXRlc3QnLFxuXHRcdFx0XHRsYWJlbDogJ05vbi1MYXp5IENvbGxlY3Rpb24nLFxuXHRcdFx0fTtcblxuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihsYXp5Q29sbGVjdGlvbikpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZTIgPSBzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKG5vbkxhenlDb2xsZWN0aW9uKSk7XG5cblx0XHRcdC8vIFNob3VsZCByZXBsYWNlIGxhenkgd2l0aCBub24tbGF6eVxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGRpc3Bvc2FibGUyLCBEaXNwb3NhYmxlLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmNvbGxlY3Rpb25zLmdldCgpLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KClbMF0sIG5vbkxhenlDb2xsZWN0aW9uKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKVswXS5sYWJlbCwgJ05vbi1MYXp5IENvbGxlY3Rpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKVswXS5sYXp5LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJldmVudHMgbGF6eSBjb2xsZWN0aW9uIGZyb20gZHVwbGljYXRpbmcgZXhpc3Rpbmcgbm9uLWxhenkgY29sbGVjdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vbkxhenlDb2xsZWN0aW9uID0ge1xuXHRcdFx0XHQuLi50ZXN0Q29sbGVjdGlvbixcblx0XHRcdFx0aWQ6ICdwcm90ZWN0ZWQtdGVzdCcsXG5cdFx0XHRcdGxhYmVsOiAnTm9uLUxhenkgQ29sbGVjdGlvbicsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbGF6eUNvbGxlY3Rpb24gPSB7XG5cdFx0XHRcdC4uLnRlc3RDb2xsZWN0aW9uLFxuXHRcdFx0XHRpZDogJ3Byb3RlY3RlZC10ZXN0Jyxcblx0XHRcdFx0bGFiZWw6ICdMYXp5IENvbGxlY3Rpb24nLFxuXHRcdFx0XHRsYXp5OiB7XG5cdFx0XHRcdFx0aXNDYWNoZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGxvYWQ6ICgpID0+IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKG5vbkxhenlDb2xsZWN0aW9uKSk7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlMiA9IHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihsYXp5Q29sbGVjdGlvbik7XG5cblx0XHRcdC8vIExhenkgY29sbGVjdGlvbiBzaG91bGQgbm90IHJlcGxhY2Ugb3IgZHVwbGljYXRlIG5vbi1sYXp5XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zYWJsZTIsIERpc3Bvc2FibGUuTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKVswXSwgbm9uTGF6eUNvbGxlY3Rpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmNvbGxlY3Rpb25zLmdldCgpWzBdLmxhYmVsLCAnTm9uLUxhenkgQ29sbGVjdGlvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxsb3dzIGRpZmZlcmVudCBjb2xsZWN0aW9uIElEcyB0byBjb2V4aXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29sbGVjdGlvbjEgPSB7XG5cdFx0XHRcdC4uLnRlc3RDb2xsZWN0aW9uLFxuXHRcdFx0XHRpZDogJ2NvbGxlY3Rpb24tMScsXG5cdFx0XHRcdGxhYmVsOiAnQ29sbGVjdGlvbiAxJyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBjb2xsZWN0aW9uMiA9IHtcblx0XHRcdFx0Li4udGVzdENvbGxlY3Rpb24sXG5cdFx0XHRcdGlkOiAnY29sbGVjdGlvbi0yJyxcblx0XHRcdFx0bGFiZWw6ICdDb2xsZWN0aW9uIDInLFxuXHRcdFx0fTtcblxuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2xsZWN0aW9uMSkpO1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2xsZWN0aW9uMikpO1xuXG5cdFx0XHQvLyBCb3RoIHNob3VsZCBiZSByZWdpc3RlcmVkIHNpbmNlIHRoZXkgaGF2ZSBkaWZmZXJlbnQgSURzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KCkubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5vayhyZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKS5zb21lKGMgPT4gYy5pZCA9PT0gJ2NvbGxlY3Rpb24tMScpKTtcblx0XHRcdGFzc2VydC5vayhyZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKS5zb21lKGMgPT4gYy5pZCA9PT0gJ2NvbGxlY3Rpb24tMicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2FsIG9mIGR1cGxpY2F0ZS1wcmV2ZW50aW5nIHJlZ2lzdHJhdGlvbiBkb2VzIG5vdCBhZmZlY3Qgb3JpZ2luYWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb2xsZWN0aW9uMSA9IHtcblx0XHRcdFx0Li4udGVzdENvbGxlY3Rpb24sXG5cdFx0XHRcdGlkOiAnZGlzcG9zYWwtdGVzdCcsXG5cdFx0XHRcdGxhYmVsOiAnT3JpZ2luYWwgQ29sbGVjdGlvbicsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgY29sbGVjdGlvbjIgPSB7XG5cdFx0XHRcdC4uLnRlc3RDb2xsZWN0aW9uLFxuXHRcdFx0XHRpZDogJ2Rpc3Bvc2FsLXRlc3QnLFxuXHRcdFx0XHRsYWJlbDogJ0R1cGxpY2F0ZSBBdHRlbXB0Jyxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUxID0gc3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2xsZWN0aW9uMSkpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZTIgPSByZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oY29sbGVjdGlvbjIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zYWJsZTIsIERpc3Bvc2FibGUuTm9uZSk7XG5cblx0XHRcdC8vIERpc3Bvc2luZyB0aGUgRGlzcG9zYWJsZS5Ob25lIHNob3VsZCBkbyBub3RoaW5nXG5cdFx0XHRkaXNwb3NhYmxlMi5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKVswXSwgY29sbGVjdGlvbjEpO1xuXG5cdFx0XHQvLyBEaXNwb3NpbmcgdGhlIG9yaWdpbmFsIHNob3VsZCByZW1vdmUgaXRcblx0XHRcdGRpc3Bvc2FibGUxLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKS5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2ltdWxhdGVzIGV4dGVuc2lvbiBob3N0IHJlc3RhcnQgc2NlbmFyaW8gd2l0aCB3aGVuIGNsYXVzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFNpbXVsYXRlcyB0aGUgYnVnOiBFeHRlbnNpb25NY3BEaXNjb3ZlcnkgcmVnaXN0ZXJzIGxhenkgY29sbGVjdGlvbixcblx0XHRcdC8vIHRoZW4gTWFpblRocmVhZE1jcCB0cmllcyB0byByZWdpc3RlciBub24tbGF6eSB2ZXJzaW9uIG9uIGV4dCBob3N0IHJlc3RhcnRcblxuXHRcdFx0Ly8gU3RlcCAxOiBFeHRlbnNpb25NY3BEaXNjb3ZlcnkgcmVnaXN0ZXJzIGNhY2hlZCBsYXp5IGNvbGxlY3Rpb25cblx0XHRcdGNvbnN0IGxhenlDb2xsZWN0aW9uID0ge1xuXHRcdFx0XHQuLi50ZXN0Q29sbGVjdGlvbixcblx0XHRcdFx0aWQ6ICdleHQtcmVzdGFydC10ZXN0Jyxcblx0XHRcdFx0bGFiZWw6ICdDYWNoZWQgTGF6eSBDb2xsZWN0aW9uJyxcblx0XHRcdFx0bGF6eToge1xuXHRcdFx0XHRcdGlzQ2FjaGVkOiB0cnVlLFxuXHRcdFx0XHRcdGxvYWQ6ICgpID0+IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihsYXp5Q29sbGVjdGlvbikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmNvbGxlY3Rpb25zLmdldCgpLmxlbmd0aCwgMSk7XG5cblx0XHRcdC8vIFN0ZXAgMjogRXh0ZW5zaW9uIGFjdGl2YXRlcywgTWFpblRocmVhZE1jcC4kdXBzZXJ0TWNwQ29sbGVjdGlvbiBjYWxsZWRcblx0XHRcdC8vIFRoaXMgcmVwbGFjZXMgbGF6eSB3aXRoIG5vbi1sYXp5IChub3JtYWwgZmxvdylcblx0XHRcdGNvbnN0IG5vbkxhenlGcm9tRXh0ZW5zaW9uID0ge1xuXHRcdFx0XHQuLi50ZXN0Q29sbGVjdGlvbixcblx0XHRcdFx0aWQ6ICdleHQtcmVzdGFydC10ZXN0Jyxcblx0XHRcdFx0bGFiZWw6ICdFeHRlbnNpb24tUHJvdmlkZWQgQ29sbGVjdGlvbicsXG5cdFx0XHR9O1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihub25MYXp5RnJvbUV4dGVuc2lvbikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmNvbGxlY3Rpb25zLmdldCgpLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KClbMF0ubGF6eSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gU3RlcCAzOiBFeHRlbnNpb24gaG9zdCByZXN0YXJ0cywgTWFpblRocmVhZE1jcCBkaXNwb3NlZFxuXHRcdFx0Ly8gRXh0ZW5zaW9uTWNwRGlzY292ZXJ5J3MgY29udGV4dCBsaXN0ZW5lciBmaXJlcyBhZ2FpbiBhbmQgdHJpZXMgdG8gcmUtcmVnaXN0ZXJcblx0XHRcdC8vIFRoaXMgc2hvdWxkIE5PVCBjcmVhdGUgYSBkdXBsaWNhdGVcblx0XHRcdGNvbnN0IGR1cGxpY2F0ZUF0dGVtcHQgPSB7XG5cdFx0XHRcdC4uLnRlc3RDb2xsZWN0aW9uLFxuXHRcdFx0XHRpZDogJ2V4dC1yZXN0YXJ0LXRlc3QnLFxuXHRcdFx0XHRsYWJlbDogJ1Nob3VsZCBOb3QgRHVwbGljYXRlJyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gcmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGR1cGxpY2F0ZUF0dGVtcHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zYWJsZSwgRGlzcG9zYWJsZS5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKS5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmNvbGxlY3Rpb25zLmdldCgpWzBdLCBub25MYXp5RnJvbUV4dGVuc2lvbik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdTZXJ2ZXIgTGFiZWwgQ29sbGlzaW9uIEVuYWJsZW1lbnQnLCAoKSA9PiB7XG5cdFx0bGV0IGVuYWJsZW1lbnRNb2RlbDogTWNwQ29sbGlzaW9uRW5hYmxlbWVudE1vZGVsO1xuXHRcdGxldCBiYXNlRW5hYmxlbWVudDogRW5hYmxlbWVudE1vZGVsO1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlQ29sbGVjdGlvbldpdGhTZXJ2ZXJzKFxuXHRcdFx0aWQ6IHN0cmluZyxcblx0XHRcdG9yZGVyOiBudW1iZXIsXG5cdFx0XHRzZXJ2ZXJzOiB7IGlkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmcgfVtdLFxuXHRcdCk6IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uICYgeyBzZXJ2ZXJEZWZpbml0aW9uczogSVNldHRhYmxlT2JzZXJ2YWJsZTxNY3BTZXJ2ZXJEZWZpbml0aW9uW10+IH0ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGxhYmVsOiBgQ29sbGVjdGlvbiAke2lkfWAsXG5cdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogbnVsbCxcblx0XHRcdFx0b3JkZXIsXG5cdFx0XHRcdHNlcnZlckRlZmluaXRpb25zOiBvYnNlcnZhYmxlVmFsdWUoJ3NlcnZlckRlZnMnLCBzZXJ2ZXJzLm1hcChzID0+ICh7XG5cdFx0XHRcdFx0Li4uYmFzZURlZmluaXRpb24sXG5cdFx0XHRcdFx0aWQ6IHMuaWQsXG5cdFx0XHRcdFx0bGFiZWw6IHMubGFiZWwsXG5cdFx0XHRcdH0pKSksXG5cdFx0XHRcdHRydXN0QmVoYXZpb3I6IE1jcFNlcnZlclRydXN0LktpbmQuVHJ1c3RlZCxcblx0XHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFx0Y29uZmlnVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHNldHVwTW9kZWwoKSB7XG5cdFx0XHRiYXNlRW5hYmxlbWVudCA9IHN0b3JlLmFkZChuZXcgRW5hYmxlbWVudE1vZGVsKCdtY3AuZW5hYmxlbWVudC50ZXN0JywgdGVzdFN0b3JhZ2VTZXJ2aWNlKSk7XG5cdFx0XHRjb25zdCBjb2xsaXNpb25CZWhhdmlvciA9IG9ic2VydmFibGVDb25maWdWYWx1ZShtY3BTZXJ2ZXJDb2xsaXNpb25CZWhhdmlvclNlY3Rpb24sIE1jcENvbGxpc2lvbkJlaGF2aW9yLkRpc2FibGUsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGVuYWJsZW1lbnRNb2RlbCA9IG5ldyBNY3BDb2xsaXNpb25FbmFibGVtZW50TW9kZWwoYmFzZUVuYWJsZW1lbnQsIHJlZ2lzdHJ5LCBjb2xsaXNpb25CZWhhdmlvcik7XG5cdFx0fVxuXG5cdFx0dGVzdCgnZGlzYWJsZXMgbG93ZXItcHJpb3JpdHkgc2VydmVycyB3aXRoIHNhbWUgbGFiZWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb2wxID0gY3JlYXRlQ29sbGVjdGlvbldpdGhTZXJ2ZXJzKCdjb2wtMScsIDAsIFt7IGlkOiAnY29sLTEuc3J2LWEnLCBsYWJlbDogJ015IFNlcnZlcicgfV0pO1xuXHRcdFx0Y29uc3QgY29sMiA9IGNyZWF0ZUNvbGxlY3Rpb25XaXRoU2VydmVycygnY29sLTInLCAxMDAsIFt7IGlkOiAnY29sLTIuc3J2LWEnLCBsYWJlbDogJ015IFNlcnZlcicgfV0pO1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2wxKSk7XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbDIpKTtcblx0XHRcdHNldHVwTW9kZWwoKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGlzQ29udHJpYnV0aW9uRW5hYmxlZChlbmFibGVtZW50TW9kZWwucmVhZEVuYWJsZWQoJ2NvbC0xLnNydi1hJykpKTtcblx0XHRcdGFzc2VydC5vayghaXNDb250cmlidXRpb25FbmFibGVkKGVuYWJsZW1lbnRNb2RlbC5yZWFkRW5hYmxlZCgnY29sLTIuc3J2LWEnKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZGlzYWJsZSBzZXJ2ZXJzIHdpdGggZGlmZmVyZW50IGxhYmVscycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbDEgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0xJywgMCwgW3sgaWQ6ICdjb2wtMS5zcnYtYScsIGxhYmVsOiAnU2VydmVyIEEnIH1dKTtcblx0XHRcdGNvbnN0IGNvbDIgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0yJywgMTAwLCBbeyBpZDogJ2NvbC0yLnNydi1iJywgbGFiZWw6ICdTZXJ2ZXIgQicgfV0pO1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2wxKSk7XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbDIpKTtcblx0XHRcdHNldHVwTW9kZWwoKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGlzQ29udHJpYnV0aW9uRW5hYmxlZChlbmFibGVtZW50TW9kZWwucmVhZEVuYWJsZWQoJ2NvbC0xLnNydi1hJykpKTtcblx0XHRcdGFzc2VydC5vayhpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMi5zcnYtYicpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsYWJlbCBjb2xsaXNpb24gaXMgY2FzZS1pbnNlbnNpdGl2ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbDEgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0xJywgMCwgW3sgaWQ6ICdjb2wtMS5zcnYtYScsIGxhYmVsOiAnTXkgU2VydmVyJyB9XSk7XG5cdFx0XHRjb25zdCBjb2wyID0gY3JlYXRlQ29sbGVjdGlvbldpdGhTZXJ2ZXJzKCdjb2wtMicsIDEwMCwgW3sgaWQ6ICdjb2wtMi5zcnYtYScsIGxhYmVsOiAnbXkgc2VydmVyJyB9XSk7XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbDEpKTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oY29sMikpO1xuXHRcdFx0c2V0dXBNb2RlbCgpO1xuXG5cdFx0XHRhc3NlcnQub2soaXNDb250cmlidXRpb25FbmFibGVkKGVuYWJsZW1lbnRNb2RlbC5yZWFkRW5hYmxlZCgnY29sLTEuc3J2LWEnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMi5zcnYtYScpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNwZWN0cyBjb2xsZWN0aW9uIG9yZGVyIGZvciBwcmlvcml0eScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbDIgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0yJywgMjAwLCBbeyBpZDogJ2NvbC0yLnNydi1hJywgbGFiZWw6ICdNeSBTZXJ2ZXInIH1dKTtcblx0XHRcdGNvbnN0IGNvbDEgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0xJywgMCwgW3sgaWQ6ICdjb2wtMS5zcnYtYScsIGxhYmVsOiAnTXkgU2VydmVyJyB9XSk7XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbDIpKTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oY29sMSkpO1xuXHRcdFx0c2V0dXBNb2RlbCgpO1xuXG5cdFx0XHRhc3NlcnQub2soaXNDb250cmlidXRpb25FbmFibGVkKGVuYWJsZW1lbnRNb2RlbC5yZWFkRW5hYmxlZCgnY29sLTEuc3J2LWEnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMi5zcnYtYScpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbmFibGluZyBhIGNvbGxpZGluZyBzZXJ2ZXIgZGlzYWJsZXMgb3RoZXJzIHdpdGggc2FtZSBsYWJlbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbDEgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0xJywgMCwgW3sgaWQ6ICdjb2wtMS5zcnYtYScsIGxhYmVsOiAnTXkgU2VydmVyJyB9XSk7XG5cdFx0XHRjb25zdCBjb2wyID0gY3JlYXRlQ29sbGVjdGlvbldpdGhTZXJ2ZXJzKCdjb2wtMicsIDEwMCwgW3sgaWQ6ICdjb2wtMi5zcnYtYScsIGxhYmVsOiAnTXkgU2VydmVyJyB9XSk7XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbDEpKTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oY29sMikpO1xuXHRcdFx0c2V0dXBNb2RlbCgpO1xuXG5cdFx0XHQvLyBFbmFibGUgdGhlIGxvd2VyLXByaW9yaXR5IHNlcnZlciBleHBsaWNpdGx5XG5cdFx0XHRlbmFibGVtZW50TW9kZWwuc2V0RW5hYmxlZCgnY29sLTIuc3J2LWEnLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSk7XG5cblx0XHRcdC8vIGNvbC0yIGlzIG5vdyBlbmFibGVkLCBjb2wtMSBzaG91bGQgYmUgZGlzYWJsZWQgKHNldCB0byBEaXNhYmxlZFdvcmtzcGFjZSlcblx0XHRcdGFzc2VydC5vayhpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMi5zcnYtYScpKSk7XG5cdFx0XHRhc3NlcnQub2soIWlzQ29udHJpYnV0aW9uRW5hYmxlZChlbmFibGVtZW50TW9kZWwucmVhZEVuYWJsZWQoJ2NvbC0xLnNydi1hJykpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVtZW50TW9kZWwucmVhZEVuYWJsZWQoJ2NvbC0xLnNydi1hJyksIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBjb2xsaXNpb24gZWZmZWN0IHdoZW4gYmVoYXZpb3IgaXMgXCJzdWZmaXhcIicsICgpID0+IHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0Lm1jcC5jb2xsaXNpb25CZWhhdmlvcicsIE1jcENvbGxpc2lvbkJlaGF2aW9yLlN1ZmZpeCk7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09ICdjaGF0Lm1jcC5jb2xsaXNpb25CZWhhdmlvcicsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk7XG5cblx0XHRcdGNvbnN0IGNvbDEgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0xJywgMCwgW3sgaWQ6ICdjb2wtMS5zcnYtYScsIGxhYmVsOiAnTXkgU2VydmVyJyB9XSk7XG5cdFx0XHRjb25zdCBjb2wyID0gY3JlYXRlQ29sbGVjdGlvbldpdGhTZXJ2ZXJzKCdjb2wtMicsIDEwMCwgW3sgaWQ6ICdjb2wtMi5zcnYtYScsIGxhYmVsOiAnTXkgU2VydmVyJyB9XSk7XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbDEpKTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oY29sMikpO1xuXHRcdFx0c2V0dXBNb2RlbCgpO1xuXG5cdFx0XHQvLyBCb3RoIHNob3VsZCBiZSBlbmFibGVkIHdoZW4gY29sbGlzaW9uIGJlaGF2aW9yIGlzIFwic3VmZml4XCJcblx0XHRcdGFzc2VydC5vayhpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMS5zcnYtYScpKSk7XG5cdFx0XHRhc3NlcnQub2soaXNDb250cmlidXRpb25FbmFibGVkKGVuYWJsZW1lbnRNb2RlbC5yZWFkRW5hYmxlZCgnY29sLTIuc3J2LWEnKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9uLXdpbm5lciBiZWNvbWVzIGVuYWJsZWQgd2hlbiB3aW5uZXIgaXMgZXhwbGljaXRseSBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbDEgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0xJywgMCwgW3sgaWQ6ICdjb2wtMS5zcnYtYScsIGxhYmVsOiAnTXkgU2VydmVyJyB9XSk7XG5cdFx0XHRjb25zdCBjb2wyID0gY3JlYXRlQ29sbGVjdGlvbldpdGhTZXJ2ZXJzKCdjb2wtMicsIDEwMCwgW3sgaWQ6ICdjb2wtMi5zcnYtYScsIGxhYmVsOiAnTXkgU2VydmVyJyB9XSk7XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbDEpKTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oY29sMikpO1xuXHRcdFx0c2V0dXBNb2RlbCgpO1xuXG5cdFx0XHQvLyBFeHBsaWNpdGx5IGRpc2FibGUgdGhlIHdpbm5lclxuXHRcdFx0ZW5hYmxlbWVudE1vZGVsLnNldEVuYWJsZWQoJ2NvbC0xLnNydi1hJywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSk7XG5cblx0XHRcdC8vIGNvbC0xIGlzIGRpc2FibGVkLCBjb2wtMiBiZWNvbWVzIHRoZSBmaXJzdCBlbmFibGVkIHNlcnZlciBpbiB0aGUgZ3JvdXBcblx0XHRcdGFzc2VydC5vayghaXNDb250cmlidXRpb25FbmFibGVkKGVuYWJsZW1lbnRNb2RlbC5yZWFkRW5hYmxlZCgnY29sLTEuc3J2LWEnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGlzQ29udHJpYnV0aW9uRW5hYmxlZChlbmFibGVtZW50TW9kZWwucmVhZEVuYWJsZWQoJ2NvbC0yLnNydi1hJykpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VwZGF0ZXMgd2hlbiBzZXJ2ZXIgZGVmaW5pdGlvbnMgY2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29sMSA9IGNyZWF0ZUNvbGxlY3Rpb25XaXRoU2VydmVycygnY29sLTEnLCAwLCBbeyBpZDogJ2NvbC0xLnNydi1hJywgbGFiZWw6ICdTZXJ2ZXIgQScgfV0pO1xuXHRcdFx0Y29uc3QgY29sMjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24gJiB7IHNlcnZlckRlZmluaXRpb25zOiBJU2V0dGFibGVPYnNlcnZhYmxlPE1jcFNlcnZlckRlZmluaXRpb25bXT4gfSA9IHtcblx0XHRcdFx0Li4uY3JlYXRlQ29sbGVjdGlvbldpdGhTZXJ2ZXJzKCdjb2wtMicsIDEwMCwgW10pLFxuXHRcdFx0fTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oY29sMSkpO1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2wyKSk7XG5cdFx0XHRzZXR1cE1vZGVsKCk7XG5cblx0XHRcdC8vIEluaXRpYWxseSBubyBjb2xsaXNpb24gXHUyMDE0IGJvdGggZW5hYmxlZFxuXHRcdFx0YXNzZXJ0Lm9rKGlzQ29udHJpYnV0aW9uRW5hYmxlZChlbmFibGVtZW50TW9kZWwucmVhZEVuYWJsZWQoJ2NvbC0xLnNydi1hJykpKTtcblxuXHRcdFx0Ly8gQWRkIGEgY29uZmxpY3Rpbmcgc2VydmVyIHRvIGNvbDJcblx0XHRcdGNvbDIuc2VydmVyRGVmaW5pdGlvbnMuc2V0KFt7IC4uLmJhc2VEZWZpbml0aW9uLCBpZDogJ2NvbC0yLnNydi1hJywgbGFiZWw6ICdTZXJ2ZXIgQScgfV0sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQub2soaXNDb250cmlidXRpb25FbmFibGVkKGVuYWJsZW1lbnRNb2RlbC5yZWFkRW5hYmxlZCgnY29sLTEuc3J2LWEnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMi5zcnYtYScpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0aHJlZS13YXkgY29sbGlzaW9uOiBvbmx5IGhpZ2hlc3QgcHJpb3JpdHkgaXMgZW5hYmxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbDEgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0xJywgMCwgW3sgaWQ6ICdjb2wtMS5zcnYnLCBsYWJlbDogJ015IFNlcnZlcicgfV0pO1xuXHRcdFx0Y29uc3QgY29sMiA9IGNyZWF0ZUNvbGxlY3Rpb25XaXRoU2VydmVycygnY29sLTInLCAxMDAsIFt7IGlkOiAnY29sLTIuc3J2JywgbGFiZWw6ICdNeSBTZXJ2ZXInIH1dKTtcblx0XHRcdGNvbnN0IGNvbDMgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0zJywgMjAwLCBbeyBpZDogJ2NvbC0zLnNydicsIGxhYmVsOiAnTXkgU2VydmVyJyB9XSk7XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbDEpKTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oY29sMikpO1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2wzKSk7XG5cdFx0XHRzZXR1cE1vZGVsKCk7XG5cblx0XHRcdGFzc2VydC5vayhpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMS5zcnYnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMi5zcnYnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMy5zcnYnKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyZWUtd2F5IGNvbGxpc2lvbjogZW5hYmxpbmcgbG93ZXN0IGRpc2FibGVzIGJvdGggb3RoZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29sMSA9IGNyZWF0ZUNvbGxlY3Rpb25XaXRoU2VydmVycygnY29sLTEnLCAwLCBbeyBpZDogJ2NvbC0xLnNydicsIGxhYmVsOiAnTXkgU2VydmVyJyB9XSk7XG5cdFx0XHRjb25zdCBjb2wyID0gY3JlYXRlQ29sbGVjdGlvbldpdGhTZXJ2ZXJzKCdjb2wtMicsIDEwMCwgW3sgaWQ6ICdjb2wtMi5zcnYnLCBsYWJlbDogJ015IFNlcnZlcicgfV0pO1xuXHRcdFx0Y29uc3QgY29sMyA9IGNyZWF0ZUNvbGxlY3Rpb25XaXRoU2VydmVycygnY29sLTMnLCAyMDAsIFt7IGlkOiAnY29sLTMuc3J2JywgbGFiZWw6ICdNeSBTZXJ2ZXInIH1dKTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oY29sMSkpO1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2wyKSk7XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbDMpKTtcblx0XHRcdHNldHVwTW9kZWwoKTtcblxuXHRcdFx0ZW5hYmxlbWVudE1vZGVsLnNldEVuYWJsZWQoJ2NvbC0zLnNydicsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKCFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMS5zcnYnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMi5zcnYnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGlzQ29udHJpYnV0aW9uRW5hYmxlZChlbmFibGVtZW50TW9kZWwucmVhZEVuYWJsZWQoJ2NvbC0zLnNydicpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNhYmxpbmcgd2lubmVyIGNhc2NhZGVzIHRvIG5leHQgaW4gcHJpb3JpdHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb2wxID0gY3JlYXRlQ29sbGVjdGlvbldpdGhTZXJ2ZXJzKCdjb2wtMScsIDAsIFt7IGlkOiAnY29sLTEuc3J2JywgbGFiZWw6ICdNeSBTZXJ2ZXInIH1dKTtcblx0XHRcdGNvbnN0IGNvbDIgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0yJywgMTAwLCBbeyBpZDogJ2NvbC0yLnNydicsIGxhYmVsOiAnTXkgU2VydmVyJyB9XSk7XG5cdFx0XHRjb25zdCBjb2wzID0gY3JlYXRlQ29sbGVjdGlvbldpdGhTZXJ2ZXJzKCdjb2wtMycsIDIwMCwgW3sgaWQ6ICdjb2wtMy5zcnYnLCBsYWJlbDogJ015IFNlcnZlcicgfV0pO1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2wxKSk7XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbDIpKTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oY29sMykpO1xuXHRcdFx0c2V0dXBNb2RlbCgpO1xuXG5cdFx0XHQvLyBEaXNhYmxlIHRoZSB3aW5uZXIgXHUyMDE0IGNvbC0yIChuZXh0IHByaW9yaXR5KSBiZWNvbWVzIHRoZSBhY3RpdmUgb25lXG5cdFx0XHRlbmFibGVtZW50TW9kZWwuc2V0RW5hYmxlZCgnY29sLTEuc3J2JywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSk7XG5cblx0XHRcdGFzc2VydC5vayghaXNDb250cmlidXRpb25FbmFibGVkKGVuYWJsZW1lbnRNb2RlbC5yZWFkRW5hYmxlZCgnY29sLTEuc3J2JykpKTtcblx0XHRcdGFzc2VydC5vayhpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMi5zcnYnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMy5zcnYnKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYm90aCBzZXJ2ZXJzIGluIHNhbWUgY29sbGVjdGlvbiB3aXRoIHNhbWUgbGFiZWw6IG9ubHkgZmlyc3QgZW5hYmxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbCA9IGNyZWF0ZUNvbGxlY3Rpb25XaXRoU2VydmVycygnY29sLTEnLCAwLCBbXG5cdFx0XHRcdHsgaWQ6ICdjb2wtMS5zcnYtYScsIGxhYmVsOiAnTXkgU2VydmVyJyB9LFxuXHRcdFx0XHR7IGlkOiAnY29sLTEuc3J2LWInLCBsYWJlbDogJ015IFNlcnZlcicgfSxcblx0XHRcdF0pO1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2wpKTtcblx0XHRcdHNldHVwTW9kZWwoKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGlzQ29udHJpYnV0aW9uRW5hYmxlZChlbmFibGVtZW50TW9kZWwucmVhZEVuYWJsZWQoJ2NvbC0xLnNydi1hJykpKTtcblx0XHRcdGFzc2VydC5vayghaXNDb250cmlidXRpb25FbmFibGVkKGVuYWJsZW1lbnRNb2RlbC5yZWFkRW5hYmxlZCgnY29sLTEuc3J2LWInKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnRW5hYmxlZFdvcmtzcGFjZSBub24td2lubmVyIHN0aWxsIHN1cHByZXNzZWQgaWYgd2lubmVyIGFsc28gZW5hYmxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbDEgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0xJywgMCwgW3sgaWQ6ICdjb2wtMS5zcnYnLCBsYWJlbDogJ015IFNlcnZlcicgfV0pO1xuXHRcdFx0Y29uc3QgY29sMiA9IGNyZWF0ZUNvbGxlY3Rpb25XaXRoU2VydmVycygnY29sLTInLCAxMDAsIFt7IGlkOiAnY29sLTIuc3J2JywgbGFiZWw6ICdNeSBTZXJ2ZXInIH1dKTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oY29sMSkpO1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2wyKSk7XG5cdFx0XHRzZXR1cE1vZGVsKCk7XG5cblx0XHRcdC8vIE1hbnVhbGx5IHNldCBib3RoIHRvIEVuYWJsZWRXb3Jrc3BhY2UgaW4gdGhlIGJhc2UgbW9kZWxcblx0XHRcdGJhc2VFbmFibGVtZW50LnNldEVuYWJsZWQoJ2NvbC0xLnNydicsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKTtcblx0XHRcdGJhc2VFbmFibGVtZW50LnNldEVuYWJsZWQoJ2NvbC0yLnNydicsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKTtcblxuXHRcdFx0Ly8gRXZlbiB0aG91Z2ggYm90aCBhcmUgZXhwbGljaXRseSBlbmFibGVkLCBvbmx5IHRoZSBoaWdoZXItcHJpb3JpdHkgb25lIHdpbnNcblx0XHRcdGFzc2VydC5vayhpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMS5zcnYnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMi5zcnYnKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlIGNsZWFycyBjb2xsaXNpb24gb3ZlcnJpZGUgYW5kIHJlc3RvcmVzIGRlZmF1bHQgYmVoYXZpb3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb2wxID0gY3JlYXRlQ29sbGVjdGlvbldpdGhTZXJ2ZXJzKCdjb2wtMScsIDAsIFt7IGlkOiAnY29sLTEuc3J2JywgbGFiZWw6ICdNeSBTZXJ2ZXInIH1dKTtcblx0XHRcdGNvbnN0IGNvbDIgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0yJywgMTAwLCBbeyBpZDogJ2NvbC0yLnNydicsIGxhYmVsOiAnTXkgU2VydmVyJyB9XSk7XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbDEpKTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oY29sMikpO1xuXHRcdFx0c2V0dXBNb2RlbCgpO1xuXG5cdFx0XHQvLyBFbmFibGUgY29sLTIsIHdoaWNoIGRpc2FibGVzIGNvbC0xIHZpYSBEaXNhYmxlZFdvcmtzcGFjZVxuXHRcdFx0ZW5hYmxlbWVudE1vZGVsLnNldEVuYWJsZWQoJ2NvbC0yLnNydicsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKTtcblx0XHRcdGFzc2VydC5vayghaXNDb250cmlidXRpb25FbmFibGVkKGVuYWJsZW1lbnRNb2RlbC5yZWFkRW5hYmxlZCgnY29sLTEuc3J2JykpKTtcblxuXHRcdFx0Ly8gUmVtb3ZlIGJvdGggb3ZlcnJpZGVzIFx1MjAxNCByZXN0b3JlcyBkZWZhdWx0IGNvbGxpc2lvbiBiZWhhdmlvclxuXHRcdFx0ZW5hYmxlbWVudE1vZGVsLnJlbW92ZSgnY29sLTEuc3J2Jyk7XG5cdFx0XHRlbmFibGVtZW50TW9kZWwucmVtb3ZlKCdjb2wtMi5zcnYnKTtcblx0XHRcdGFzc2VydC5vayhpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMS5zcnYnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMi5zcnYnKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9uLWNvbGxpZGluZyBzZXJ2ZXJzIGluIHNhbWUgY29sbGVjdGlvbiBhcyBjb2xsaWRpbmcgb25lcyBhcmUgdW5hZmZlY3RlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbDEgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0xJywgMCwgW1xuXHRcdFx0XHR7IGlkOiAnY29sLTEuc3J2LWEnLCBsYWJlbDogJ015IFNlcnZlcicgfSxcblx0XHRcdFx0eyBpZDogJ2NvbC0xLnNydi1iJywgbGFiZWw6ICdVbmlxdWUgU2VydmVyJyB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBjb2wyID0gY3JlYXRlQ29sbGVjdGlvbldpdGhTZXJ2ZXJzKCdjb2wtMicsIDEwMCwgW1xuXHRcdFx0XHR7IGlkOiAnY29sLTIuc3J2LWEnLCBsYWJlbDogJ015IFNlcnZlcicgfSxcblx0XHRcdFx0eyBpZDogJ2NvbC0yLnNydi1jJywgbGFiZWw6ICdBbm90aGVyIFVuaXF1ZScgfSxcblx0XHRcdF0pO1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2wxKSk7XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbDIpKTtcblx0XHRcdHNldHVwTW9kZWwoKTtcblxuXHRcdFx0Ly8gQ29sbGlkaW5nIHNlcnZlcnM6IG9ubHkgY29sLTEncyB3aW5zXG5cdFx0XHRhc3NlcnQub2soaXNDb250cmlidXRpb25FbmFibGVkKGVuYWJsZW1lbnRNb2RlbC5yZWFkRW5hYmxlZCgnY29sLTEuc3J2LWEnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMi5zcnYtYScpKSk7XG5cdFx0XHQvLyBOb24tY29sbGlkaW5nIHNlcnZlcnM6IGJvdGggZW5hYmxlZFxuXHRcdFx0YXNzZXJ0Lm9rKGlzQ29udHJpYnV0aW9uRW5hYmxlZChlbmFibGVtZW50TW9kZWwucmVhZEVuYWJsZWQoJ2NvbC0xLnNydi1iJykpKTtcblx0XHRcdGFzc2VydC5vayhpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKCdjb2wtMi5zcnYtYycpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRFbmFibGVkIHdpdGggbm9uLWNvbGxpZGluZyBzZXJ2ZXIgZG9lcyBub3QgYWZmZWN0IG90aGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbDEgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0xJywgMCwgW3sgaWQ6ICdjb2wtMS5zcnYtYScsIGxhYmVsOiAnU2VydmVyIEEnIH1dKTtcblx0XHRcdGNvbnN0IGNvbDIgPSBjcmVhdGVDb2xsZWN0aW9uV2l0aFNlcnZlcnMoJ2NvbC0yJywgMTAwLCBbeyBpZDogJ2NvbC0yLnNydi1iJywgbGFiZWw6ICdTZXJ2ZXIgQicgfV0pO1xuXHRcdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyQ29sbGVjdGlvbihjb2wxKSk7XG5cdFx0XHRzdG9yZS5hZGQocmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbDIpKTtcblx0XHRcdHNldHVwTW9kZWwoKTtcblxuXHRcdFx0ZW5hYmxlbWVudE1vZGVsLnNldEVuYWJsZWQoJ2NvbC0yLnNydi1iJywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpO1xuXG5cdFx0XHQvLyBObyBjb2xsaXNpb24gZ3JvdXAgXHUyMDE0IGNvbC0xIHNob3VsZCBiZSB1bmFmZmVjdGVkXG5cdFx0XHRhc3NlcnQub2soaXNDb250cmlidXRpb25FbmFibGVkKGVuYWJsZW1lbnRNb2RlbC5yZWFkRW5hYmxlZCgnY29sLTEuc3J2LWEnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGlzQ29udHJpYnV0aW9uRW5hYmxlZChlbmFibGVtZW50TW9kZWwucmVhZEVuYWJsZWQoJ2NvbC0yLnNydi1iJykpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1RydXN0IEZsb3cnLCAoKSA9PiB7XG5cdFx0LyoqXG5cdFx0ICogSGVscGVyIHRvIGNyZWF0ZSBhIHRlc3QgTUNQIGNvbGxlY3Rpb24gd2l0aCBhIHNwZWNpZmljIHRydXN0IGJlaGF2aW9yXG5cdFx0ICovXG5cdFx0ZnVuY3Rpb24gY3JlYXRlVGVzdENvbGxlY3Rpb24odHJ1c3RCZWhhdmlvcjogTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkIHwgTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkT25Ob25jZSwgaWQgPSAndGVzdC1jb2xsZWN0aW9uJyk6IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uICYgeyBzZXJ2ZXJEZWZpbml0aW9uczogSVNldHRhYmxlT2JzZXJ2YWJsZTxNY3BTZXJ2ZXJEZWZpbml0aW9uW10+IH0ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBDb2xsZWN0aW9uJyxcblx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiBudWxsLFxuXHRcdFx0XHRzZXJ2ZXJEZWZpbml0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCdzZXJ2ZXJEZWZzJywgW10pLFxuXHRcdFx0XHR0cnVzdEJlaGF2aW9yLFxuXHRcdFx0XHRzY29wZTogU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0XHRjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCAqIEhlbHBlciB0byBjcmVhdGUgYSB0ZXN0IHNlcnZlciBkZWZpbml0aW9uIHdpdGggYSBzcGVjaWZpYyBjYWNoZSBub25jZVxuXHRcdCAqL1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZVRlc3REZWZpbml0aW9uKGlkID0gJ3Rlc3Qtc2VydmVyJywgY2FjaGVOb25jZSA9ICdub25jZS1hJyk6IE1jcFNlcnZlckRlZmluaXRpb24ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBTZXJ2ZXInLFxuXHRcdFx0XHRjYWNoZU5vbmNlLFxuXHRcdFx0XHRsYXVuY2g6IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLlN0ZGlvLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICd0ZXN0LWNvbW1hbmQnLFxuXHRcdFx0XHRcdGFyZ3M6IFtdLFxuXHRcdFx0XHRcdGVudjoge30sXG5cdFx0XHRcdFx0ZW52RmlsZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGN3ZDogJy90ZXN0Jyxcblx0XHRcdFx0XHRzYW5kYm94OiB1bmRlZmluZWRcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBIZWxwZXIgdG8gc2V0IHVwIGEgYmFzaWMgcmVnaXN0cnkgd2l0aCBkZWxlZ2F0ZSBhbmQgY29sbGVjdGlvblxuXHRcdCAqL1xuXHRcdGZ1bmN0aW9uIHNldHVwUmVnaXN0cnkodHJ1c3RCZWhhdmlvcjogTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkIHwgTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkT25Ob25jZSA9IE1jcFNlcnZlclRydXN0LktpbmQuVHJ1c3RlZE9uTm9uY2UsIGNhY2hlTm9uY2UgPSAnbm9uY2UtYScpIHtcblx0XHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IFRlc3RNY3BIb3N0RGVsZWdhdGUoKTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckRlbGVnYXRlKGRlbGVnYXRlKSk7XG5cblx0XHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBjcmVhdGVUZXN0Q29sbGVjdGlvbih0cnVzdEJlaGF2aW9yKTtcblx0XHRcdGNvbnN0IGRlZmluaXRpb24gPSBjcmVhdGVUZXN0RGVmaW5pdGlvbigndGVzdC1zZXJ2ZXInLCBjYWNoZU5vbmNlKTtcblx0XHRcdGNvbGxlY3Rpb24uc2VydmVyRGVmaW5pdGlvbnMuc2V0KFtkZWZpbml0aW9uXSwgdW5kZWZpbmVkKTtcblx0XHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oY29sbGVjdGlvbikpO1xuXG5cdFx0XHRyZXR1cm4geyBjb2xsZWN0aW9uLCBkZWZpbml0aW9uLCBkZWxlZ2F0ZSB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ3RydXN0ZWQgY29sbGVjdGlvbiBhbGxvd3MgY29ubmVjdGlvbiB3aXRob3V0IHByb21wdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgY29sbGVjdGlvbiwgZGVmaW5pdGlvbiB9ID0gc2V0dXBSZWdpc3RyeShNY3BTZXJ2ZXJUcnVzdC5LaW5kLlRydXN0ZWQpO1xuXG5cdFx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgcmVnaXN0cnkucmVzb2x2ZUNvbm5lY3Rpb24oe1xuXHRcdFx0XHRjb2xsZWN0aW9uUmVmOiBjb2xsZWN0aW9uLFxuXHRcdFx0XHRkZWZpbml0aW9uUmVmOiBkZWZpbml0aW9uLFxuXHRcdFx0XHRsb2dnZXIsXG5cdFx0XHRcdHRydXN0Tm9uY2VCZWFyZXIsXG5cdFx0XHRcdHRhc2tNYW5hZ2VyLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhjb25uZWN0aW9uLCAnQ29ubmVjdGlvbiBzaG91bGQgYmUgY3JlYXRlZCBmb3IgdHJ1c3RlZCBjb2xsZWN0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkubmV4dERlZmluaXRpb25JZHNUb1RydXN0LCB1bmRlZmluZWQsICdUcnVzdCBkaWFsb2cgc2hvdWxkIG5vdCBoYXZlIGJlZW4gY2FsbGVkJyk7XG5cdFx0XHRjb25uZWN0aW9uIS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub25jZS1iYXNlZCB0cnVzdCBhbGxvd3MgY29ubmVjdGlvbiB3aGVuIG5vbmNlIG1hdGNoZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGNvbGxlY3Rpb24sIGRlZmluaXRpb24gfSA9IHNldHVwUmVnaXN0cnkoTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkT25Ob25jZSwgJ25vbmNlLWEnKTtcblx0XHRcdHRydXN0Tm9uY2VCZWFyZXIudHJ1c3RlZEF0Tm9uY2UgPSAnbm9uY2UtYSc7XG5cblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCByZWdpc3RyeS5yZXNvbHZlQ29ubmVjdGlvbih7XG5cdFx0XHRcdGNvbGxlY3Rpb25SZWY6IGNvbGxlY3Rpb24sXG5cdFx0XHRcdGRlZmluaXRpb25SZWY6IGRlZmluaXRpb24sXG5cdFx0XHRcdGxvZ2dlcixcblx0XHRcdFx0dHJ1c3ROb25jZUJlYXJlcixcblx0XHRcdFx0dGFza01hbmFnZXIsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGNvbm5lY3Rpb24sICdDb25uZWN0aW9uIHNob3VsZCBiZSBjcmVhdGVkIHdoZW4gbm9uY2UgbWF0Y2hlcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5Lm5leHREZWZpbml0aW9uSWRzVG9UcnVzdCwgdW5kZWZpbmVkLCAnVHJ1c3QgZGlhbG9nIHNob3VsZCBub3QgaGF2ZSBiZWVuIGNhbGxlZCcpO1xuXHRcdFx0Y29ubmVjdGlvbiEuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9uY2UtYmFzZWQgdHJ1c3QgcHJvbXB0cyB3aGVuIG5vbmNlIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGNvbGxlY3Rpb24sIGRlZmluaXRpb24gfSA9IHNldHVwUmVnaXN0cnkoTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkT25Ob25jZSwgJ25vbmNlLWInKTtcblx0XHRcdHRydXN0Tm9uY2VCZWFyZXIudHJ1c3RlZEF0Tm9uY2UgPSAnbm9uY2UtYSc7IC8vIERpZmZlcmVudCBub25jZVxuXHRcdFx0cmVnaXN0cnkubmV4dERlZmluaXRpb25JZHNUb1RydXN0ID0gW2RlZmluaXRpb24uaWRdOyAvLyBVc2VyIHRydXN0cyB0aGUgc2VydmVyXG5cblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCByZWdpc3RyeS5yZXNvbHZlQ29ubmVjdGlvbih7XG5cdFx0XHRcdGNvbGxlY3Rpb25SZWY6IGNvbGxlY3Rpb24sXG5cdFx0XHRcdGRlZmluaXRpb25SZWY6IGRlZmluaXRpb24sXG5cdFx0XHRcdGxvZ2dlcixcblx0XHRcdFx0dHJ1c3ROb25jZUJlYXJlciwgdGFza01hbmFnZXIsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGNvbm5lY3Rpb24sICdDb25uZWN0aW9uIHNob3VsZCBiZSBjcmVhdGVkIHdoZW4gdXNlciB0cnVzdHMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdE5vbmNlQmVhcmVyLnRydXN0ZWRBdE5vbmNlLCAnbm9uY2UtYicsICdOb25jZSBzaG91bGQgYmUgdXBkYXRlZCcpO1xuXHRcdFx0Y29ubmVjdGlvbiEuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9uY2UtYmFzZWQgdHJ1c3QgZGVuaWVzIGNvbm5lY3Rpb24gd2hlbiB1c2VyIHJlamVjdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGNvbGxlY3Rpb24sIGRlZmluaXRpb24gfSA9IHNldHVwUmVnaXN0cnkoTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkT25Ob25jZSwgJ25vbmNlLWInKTtcblx0XHRcdHRydXN0Tm9uY2VCZWFyZXIudHJ1c3RlZEF0Tm9uY2UgPSAnbm9uY2UtYSc7IC8vIERpZmZlcmVudCBub25jZVxuXHRcdFx0cmVnaXN0cnkubmV4dERlZmluaXRpb25JZHNUb1RydXN0ID0gW107IC8vIFVzZXIgZG9lcyBub3QgdHJ1c3QgdGhlIHNlcnZlclxuXG5cdFx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgcmVnaXN0cnkucmVzb2x2ZUNvbm5lY3Rpb24oe1xuXHRcdFx0XHRjb2xsZWN0aW9uUmVmOiBjb2xsZWN0aW9uLFxuXHRcdFx0XHRkZWZpbml0aW9uUmVmOiBkZWZpbml0aW9uLFxuXHRcdFx0XHRsb2dnZXIsXG5cdFx0XHRcdHRydXN0Tm9uY2VCZWFyZXIsIHRhc2tNYW5hZ2VyLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLCB1bmRlZmluZWQsICdDb25uZWN0aW9uIHNob3VsZCBub3QgYmUgY3JlYXRlZCB3aGVuIHVzZXIgcmVqZWN0cycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0Tm9uY2VCZWFyZXIudHJ1c3RlZEF0Tm9uY2UsICdfX3ZzY29kZV9ub3RfdHJ1c3RlZCcsICdTaG91bGQgbWFyayBhcyBleHBsaWNpdGx5IG5vdCB0cnVzdGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdXRvVHJ1c3RDaGFuZ2VzIGJ5cGFzc2VzIHByb21wdCB3aGVuIG5vbmNlIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGNvbGxlY3Rpb24sIGRlZmluaXRpb24gfSA9IHNldHVwUmVnaXN0cnkoTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkT25Ob25jZSwgJ25vbmNlLWInKTtcblx0XHRcdHRydXN0Tm9uY2VCZWFyZXIudHJ1c3RlZEF0Tm9uY2UgPSAnbm9uY2UtYSc7IC8vIERpZmZlcmVudCBub25jZVxuXG5cdFx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgcmVnaXN0cnkucmVzb2x2ZUNvbm5lY3Rpb24oe1xuXHRcdFx0XHRjb2xsZWN0aW9uUmVmOiBjb2xsZWN0aW9uLFxuXHRcdFx0XHRkZWZpbml0aW9uUmVmOiBkZWZpbml0aW9uLFxuXHRcdFx0XHRsb2dnZXIsXG5cdFx0XHRcdHRydXN0Tm9uY2VCZWFyZXIsXG5cdFx0XHRcdGF1dG9UcnVzdENoYW5nZXM6IHRydWUsXG5cdFx0XHRcdHRhc2tNYW5hZ2VyLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhjb25uZWN0aW9uLCAnQ29ubmVjdGlvbiBzaG91bGQgYmUgY3JlYXRlZCB3aXRoIGF1dG9UcnVzdENoYW5nZXMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdE5vbmNlQmVhcmVyLnRydXN0ZWRBdE5vbmNlLCAnbm9uY2UtYicsICdOb25jZSBzaG91bGQgYmUgdXBkYXRlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5Lm5leHREZWZpbml0aW9uSWRzVG9UcnVzdCwgdW5kZWZpbmVkLCAnVHJ1c3QgZGlhbG9nIHNob3VsZCBub3QgaGF2ZSBiZWVuIGNhbGxlZCcpO1xuXHRcdFx0Y29ubmVjdGlvbiEuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvbXB0VHlwZSBcIm5ldmVyXCIgc2tpcHMgcHJvbXB0IGFuZCBmYWlscyBzaWxlbnRseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgY29sbGVjdGlvbiwgZGVmaW5pdGlvbiB9ID0gc2V0dXBSZWdpc3RyeShNY3BTZXJ2ZXJUcnVzdC5LaW5kLlRydXN0ZWRPbk5vbmNlLCAnbm9uY2UtYicpO1xuXHRcdFx0dHJ1c3ROb25jZUJlYXJlci50cnVzdGVkQXROb25jZSA9ICdub25jZS1hJzsgLy8gRGlmZmVyZW50IG5vbmNlXG5cblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCByZWdpc3RyeS5yZXNvbHZlQ29ubmVjdGlvbih7XG5cdFx0XHRcdGNvbGxlY3Rpb25SZWY6IGNvbGxlY3Rpb24sXG5cdFx0XHRcdGRlZmluaXRpb25SZWY6IGRlZmluaXRpb24sXG5cdFx0XHRcdGxvZ2dlcixcblx0XHRcdFx0dHJ1c3ROb25jZUJlYXJlcixcblx0XHRcdFx0cHJvbXB0VHlwZTogJ25ldmVyJyxcblx0XHRcdFx0dGFza01hbmFnZXIsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24sIHVuZGVmaW5lZCwgJ0Nvbm5lY3Rpb24gc2hvdWxkIG5vdCBiZSBjcmVhdGVkIHdpdGggcHJvbXB0VHlwZSBcIm5ldmVyXCInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5uZXh0RGVmaW5pdGlvbklkc1RvVHJ1c3QsIHVuZGVmaW5lZCwgJ1RydXN0IGRpYWxvZyBzaG91bGQgbm90IGhhdmUgYmVlbiBjYWxsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb21wdFR5cGUgXCJvbmx5LW5ld1wiIHNraXBzIHByZXZpb3VzbHkgdW50cnVzdGVkIHNlcnZlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGNvbGxlY3Rpb24sIGRlZmluaXRpb24gfSA9IHNldHVwUmVnaXN0cnkoTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkT25Ob25jZSwgJ25vbmNlLWInKTtcblx0XHRcdHRydXN0Tm9uY2VCZWFyZXIudHJ1c3RlZEF0Tm9uY2UgPSAnX192c2NvZGVfbm90X3RydXN0ZWQnOyAvLyBQcmV2aW91c2x5IGV4cGxpY2l0bHkgZGVuaWVkXG5cblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCByZWdpc3RyeS5yZXNvbHZlQ29ubmVjdGlvbih7XG5cdFx0XHRcdGNvbGxlY3Rpb25SZWY6IGNvbGxlY3Rpb24sXG5cdFx0XHRcdGRlZmluaXRpb25SZWY6IGRlZmluaXRpb24sXG5cdFx0XHRcdGxvZ2dlcixcblx0XHRcdFx0dHJ1c3ROb25jZUJlYXJlcixcblx0XHRcdFx0cHJvbXB0VHlwZTogJ29ubHktbmV3Jyxcblx0XHRcdFx0dGFza01hbmFnZXIsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24sIHVuZGVmaW5lZCwgJ0Nvbm5lY3Rpb24gc2hvdWxkIG5vdCBiZSBjcmVhdGVkIGZvciBwcmV2aW91c2x5IHVudHJ1c3RlZCBzZXJ2ZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5uZXh0RGVmaW5pdGlvbklkc1RvVHJ1c3QsIHVuZGVmaW5lZCwgJ1RydXN0IGRpYWxvZyBzaG91bGQgbm90IGhhdmUgYmVlbiBjYWxsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb21wdFR5cGUgXCJhbGwtdW50cnVzdGVkXCIgcHJvbXB0cyBmb3IgcHJldmlvdXNseSB1bnRydXN0ZWQgc2VydmVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgY29sbGVjdGlvbiwgZGVmaW5pdGlvbiB9ID0gc2V0dXBSZWdpc3RyeShNY3BTZXJ2ZXJUcnVzdC5LaW5kLlRydXN0ZWRPbk5vbmNlLCAnbm9uY2UtYicpO1xuXHRcdFx0dHJ1c3ROb25jZUJlYXJlci50cnVzdGVkQXROb25jZSA9ICdfX3ZzY29kZV9ub3RfdHJ1c3RlZCc7IC8vIFByZXZpb3VzbHkgZXhwbGljaXRseSBkZW5pZWRcblx0XHRcdHJlZ2lzdHJ5Lm5leHREZWZpbml0aW9uSWRzVG9UcnVzdCA9IFtkZWZpbml0aW9uLmlkXTsgLy8gVXNlciBub3cgdHJ1c3RzIHRoZSBzZXJ2ZXJcblxuXHRcdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHJlZ2lzdHJ5LnJlc29sdmVDb25uZWN0aW9uKHtcblx0XHRcdFx0Y29sbGVjdGlvblJlZjogY29sbGVjdGlvbixcblx0XHRcdFx0ZGVmaW5pdGlvblJlZjogZGVmaW5pdGlvbixcblx0XHRcdFx0bG9nZ2VyLFxuXHRcdFx0XHR0cnVzdE5vbmNlQmVhcmVyLFxuXHRcdFx0XHRwcm9tcHRUeXBlOiAnYWxsLXVudHJ1c3RlZCcsXG5cdFx0XHRcdHRhc2tNYW5hZ2VyLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhjb25uZWN0aW9uLCAnQ29ubmVjdGlvbiBzaG91bGQgYmUgY3JlYXRlZCB3aGVuIHVzZXIgdHJ1c3RzIHByZXZpb3VzbHkgdW50cnVzdGVkIHNlcnZlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0Tm9uY2VCZWFyZXIudHJ1c3RlZEF0Tm9uY2UsICdub25jZS1iJywgJ05vbmNlIHNob3VsZCBiZSB1cGRhdGVkJyk7XG5cdFx0XHRjb25uZWN0aW9uIS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb25jdXJyZW50IHJlc29sdmVDb25uZWN0aW9uIGNhbGxzIHdpdGggc2FtZSBpbnRlcmFjdGlvbiBhcmUgZ3JvdXBlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgY29sbGVjdGlvbiwgZGVmaW5pdGlvbiB9ID0gc2V0dXBSZWdpc3RyeShNY3BTZXJ2ZXJUcnVzdC5LaW5kLlRydXN0ZWRPbk5vbmNlLCAnbm9uY2UtYicpO1xuXHRcdFx0dHJ1c3ROb25jZUJlYXJlci50cnVzdGVkQXROb25jZSA9ICdub25jZS1hJzsgLy8gRGlmZmVyZW50IG5vbmNlXG5cblx0XHRcdC8vIENyZWF0ZSBhIHNlY29uZCBkZWZpbml0aW9uIHRoYXQgYWxzbyBuZWVkcyB0cnVzdFxuXHRcdFx0Y29uc3QgZGVmaW5pdGlvbjIgPSBjcmVhdGVUZXN0RGVmaW5pdGlvbigndGVzdC1zZXJ2ZXItMicsICdub25jZS1jJyk7XG5cdFx0XHRjb2xsZWN0aW9uLnNlcnZlckRlZmluaXRpb25zLnNldChbZGVmaW5pdGlvbiwgZGVmaW5pdGlvbjJdLCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBDcmVhdGUgc2hhcmVkIGludGVyYWN0aW9uXG5cdFx0XHRjb25zdCBpbnRlcmFjdGlvbiA9IG5ldyBNY3BTdGFydFNlcnZlckludGVyYWN0aW9uKCk7XG5cblx0XHRcdC8vIE1hbnVhbGx5IHNldCBwYXJ0aWNpcGFudHMgYXMgbWVudGlvbmVkIGluIHRoZSByZXF1aXJlbWVudHNcblx0XHRcdGludGVyYWN0aW9uLnBhcnRpY2lwYW50cy5zZXQoZGVmaW5pdGlvbi5pZCwgeyBzOiAndW5rbm93bicgfSk7XG5cdFx0XHRpbnRlcmFjdGlvbi5wYXJ0aWNpcGFudHMuc2V0KGRlZmluaXRpb24yLmlkLCB7IHM6ICd1bmtub3duJyB9KTtcblxuXHRcdFx0Y29uc3QgdHJ1c3ROb25jZUJlYXJlcjIgPSB7IHRydXN0ZWRBdE5vbmNlOiAnbm9uY2UtYicgfTsgLy8gRGlmZmVyZW50IG5vbmNlIGZvciBzZWNvbmQgc2VydmVyXG5cblx0XHRcdC8vIFRydXN0IGJvdGggc2VydmVyc1xuXHRcdFx0cmVnaXN0cnkubmV4dERlZmluaXRpb25JZHNUb1RydXN0ID0gW2RlZmluaXRpb24uaWQsIGRlZmluaXRpb24yLmlkXTtcblxuXHRcdFx0Ly8gU3RhcnQgYm90aCBjb25uZWN0aW9ucyBjb25jdXJyZW50bHkgd2l0aCB0aGUgc2FtZSBpbnRlcmFjdGlvblxuXHRcdFx0Y29uc3QgW2Nvbm5lY3Rpb24xLCBjb25uZWN0aW9uMl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHJlZ2lzdHJ5LnJlc29sdmVDb25uZWN0aW9uKHtcblx0XHRcdFx0XHRjb2xsZWN0aW9uUmVmOiBjb2xsZWN0aW9uLFxuXHRcdFx0XHRcdGRlZmluaXRpb25SZWY6IGRlZmluaXRpb24sXG5cdFx0XHRcdFx0bG9nZ2VyLFxuXHRcdFx0XHRcdHRydXN0Tm9uY2VCZWFyZXIsXG5cdFx0XHRcdFx0aW50ZXJhY3Rpb24sXG5cdFx0XHRcdFx0dGFza01hbmFnZXIsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRyZWdpc3RyeS5yZXNvbHZlQ29ubmVjdGlvbih7XG5cdFx0XHRcdFx0Y29sbGVjdGlvblJlZjogY29sbGVjdGlvbixcblx0XHRcdFx0XHRkZWZpbml0aW9uUmVmOiBkZWZpbml0aW9uMixcblx0XHRcdFx0XHRsb2dnZXIsXG5cdFx0XHRcdFx0dHJ1c3ROb25jZUJlYXJlcjogdHJ1c3ROb25jZUJlYXJlcjIsXG5cdFx0XHRcdFx0aW50ZXJhY3Rpb24sXG5cdFx0XHRcdFx0dGFza01hbmFnZXIsXG5cdFx0XHRcdH0pXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGNvbm5lY3Rpb24xLCAnRmlyc3QgY29ubmVjdGlvbiBzaG91bGQgYmUgY3JlYXRlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbm5lY3Rpb24yLCAnU2Vjb25kIGNvbm5lY3Rpb24gc2hvdWxkIGJlIGNyZWF0ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdE5vbmNlQmVhcmVyLnRydXN0ZWRBdE5vbmNlLCAnbm9uY2UtYicsICdGaXJzdCBub25jZSBzaG91bGQgYmUgdXBkYXRlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0Tm9uY2VCZWFyZXIyLnRydXN0ZWRBdE5vbmNlLCAnbm9uY2UtYycsICdTZWNvbmQgbm9uY2Ugc2hvdWxkIGJlIHVwZGF0ZWQnKTtcblxuXHRcdFx0Y29ubmVjdGlvbjEhLmRpc3Bvc2UoKTtcblx0XHRcdGNvbm5lY3Rpb24yIS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VyIGNhbmNlbGxpbmcgdHJ1c3QgZGlhbG9nIHJldHVybnMgdW5kZWZpbmVkIGZvciBhbGwgcGVuZGluZyBjb25uZWN0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgY29sbGVjdGlvbiwgZGVmaW5pdGlvbiB9ID0gc2V0dXBSZWdpc3RyeShNY3BTZXJ2ZXJUcnVzdC5LaW5kLlRydXN0ZWRPbk5vbmNlLCAnbm9uY2UtYicpO1xuXHRcdFx0dHJ1c3ROb25jZUJlYXJlci50cnVzdGVkQXROb25jZSA9ICdub25jZS1hJzsgLy8gRGlmZmVyZW50IG5vbmNlXG5cblx0XHRcdC8vIENyZWF0ZSBhIHNlY29uZCBkZWZpbml0aW9uIHRoYXQgYWxzbyBuZWVkcyB0cnVzdFxuXHRcdFx0Y29uc3QgZGVmaW5pdGlvbjIgPSBjcmVhdGVUZXN0RGVmaW5pdGlvbigndGVzdC1zZXJ2ZXItMicsICdub25jZS1jJyk7XG5cdFx0XHRjb2xsZWN0aW9uLnNlcnZlckRlZmluaXRpb25zLnNldChbZGVmaW5pdGlvbiwgZGVmaW5pdGlvbjJdLCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBDcmVhdGUgc2hhcmVkIGludGVyYWN0aW9uXG5cdFx0XHRjb25zdCBpbnRlcmFjdGlvbiA9IG5ldyBNY3BTdGFydFNlcnZlckludGVyYWN0aW9uKCk7XG5cblx0XHRcdC8vIE1hbnVhbGx5IHNldCBwYXJ0aWNpcGFudHMgYXMgbWVudGlvbmVkIGluIHRoZSByZXF1aXJlbWVudHNcblx0XHRcdGludGVyYWN0aW9uLnBhcnRpY2lwYW50cy5zZXQoZGVmaW5pdGlvbi5pZCwgeyBzOiAndW5rbm93bicgfSk7XG5cdFx0XHRpbnRlcmFjdGlvbi5wYXJ0aWNpcGFudHMuc2V0KGRlZmluaXRpb24yLmlkLCB7IHM6ICd1bmtub3duJyB9KTtcblxuXHRcdFx0Y29uc3QgdHJ1c3ROb25jZUJlYXJlcjIgPSB7IHRydXN0ZWRBdE5vbmNlOiAnbm9uY2UtYicgfTsgLy8gRGlmZmVyZW50IG5vbmNlIGZvciBzZWNvbmQgc2VydmVyXG5cblx0XHRcdC8vIFVzZXIgY2FuY2VscyB0aGUgZGlhbG9nXG5cdFx0XHRyZWdpc3RyeS5uZXh0RGVmaW5pdGlvbklkc1RvVHJ1c3QgPSB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIFN0YXJ0IGJvdGggY29ubmVjdGlvbnMgY29uY3VycmVudGx5IHdpdGggdGhlIHNhbWUgaW50ZXJhY3Rpb25cblx0XHRcdGNvbnN0IFtjb25uZWN0aW9uMSwgY29ubmVjdGlvbjJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRyZWdpc3RyeS5yZXNvbHZlQ29ubmVjdGlvbih7XG5cdFx0XHRcdFx0Y29sbGVjdGlvblJlZjogY29sbGVjdGlvbixcblx0XHRcdFx0XHRkZWZpbml0aW9uUmVmOiBkZWZpbml0aW9uLFxuXHRcdFx0XHRcdGxvZ2dlcixcblx0XHRcdFx0XHR0cnVzdE5vbmNlQmVhcmVyLFxuXHRcdFx0XHRcdGludGVyYWN0aW9uLFxuXHRcdFx0XHRcdHRhc2tNYW5hZ2VyLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0cmVnaXN0cnkucmVzb2x2ZUNvbm5lY3Rpb24oe1xuXHRcdFx0XHRcdGNvbGxlY3Rpb25SZWY6IGNvbGxlY3Rpb24sXG5cdFx0XHRcdFx0ZGVmaW5pdGlvblJlZjogZGVmaW5pdGlvbjIsXG5cdFx0XHRcdFx0bG9nZ2VyLFxuXHRcdFx0XHRcdHRydXN0Tm9uY2VCZWFyZXI6IHRydXN0Tm9uY2VCZWFyZXIyLFxuXHRcdFx0XHRcdGludGVyYWN0aW9uLFxuXHRcdFx0XHRcdHRhc2tNYW5hZ2VyLFxuXHRcdFx0XHR9KVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uMSwgdW5kZWZpbmVkLCAnRmlyc3QgY29ubmVjdGlvbiBzaG91bGQgbm90IGJlIGNyZWF0ZWQgd2hlbiB1c2VyIGNhbmNlbHMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uMiwgdW5kZWZpbmVkLCAnU2Vjb25kIGNvbm5lY3Rpb24gc2hvdWxkIG5vdCBiZSBjcmVhdGVkIHdoZW4gdXNlciBjYW5jZWxzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJ0aWFsIHRydXN0IHNlbGVjdGlvbiBpbiBncm91cGVkIGludGVyYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBjb2xsZWN0aW9uLCBkZWZpbml0aW9uIH0gPSBzZXR1cFJlZ2lzdHJ5KE1jcFNlcnZlclRydXN0LktpbmQuVHJ1c3RlZE9uTm9uY2UsICdub25jZS1iJyk7XG5cdFx0XHR0cnVzdE5vbmNlQmVhcmVyLnRydXN0ZWRBdE5vbmNlID0gJ25vbmNlLWEnOyAvLyBEaWZmZXJlbnQgbm9uY2VcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgc2Vjb25kIGRlZmluaXRpb24gdGhhdCBhbHNvIG5lZWRzIHRydXN0XG5cdFx0XHRjb25zdCBkZWZpbml0aW9uMiA9IGNyZWF0ZVRlc3REZWZpbml0aW9uKCd0ZXN0LXNlcnZlci0yJywgJ25vbmNlLWMnKTtcblx0XHRcdGNvbGxlY3Rpb24uc2VydmVyRGVmaW5pdGlvbnMuc2V0KFtkZWZpbml0aW9uLCBkZWZpbml0aW9uMl0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIENyZWF0ZSBzaGFyZWQgaW50ZXJhY3Rpb25cblx0XHRcdGNvbnN0IGludGVyYWN0aW9uID0gbmV3IE1jcFN0YXJ0U2VydmVySW50ZXJhY3Rpb24oKTtcblxuXHRcdFx0Ly8gTWFudWFsbHkgc2V0IHBhcnRpY2lwYW50cyBhcyBtZW50aW9uZWQgaW4gdGhlIHJlcXVpcmVtZW50c1xuXHRcdFx0aW50ZXJhY3Rpb24ucGFydGljaXBhbnRzLnNldChkZWZpbml0aW9uLmlkLCB7IHM6ICd1bmtub3duJyB9KTtcblx0XHRcdGludGVyYWN0aW9uLnBhcnRpY2lwYW50cy5zZXQoZGVmaW5pdGlvbjIuaWQsIHsgczogJ3Vua25vd24nIH0pO1xuXG5cdFx0XHRjb25zdCB0cnVzdE5vbmNlQmVhcmVyMiA9IHsgdHJ1c3RlZEF0Tm9uY2U6ICdub25jZS1iJyB9OyAvLyBEaWZmZXJlbnQgbm9uY2UgZm9yIHNlY29uZCBzZXJ2ZXJcblxuXHRcdFx0Ly8gVXNlciB0cnVzdHMgb25seSB0aGUgZmlyc3Qgc2VydmVyXG5cdFx0XHRyZWdpc3RyeS5uZXh0RGVmaW5pdGlvbklkc1RvVHJ1c3QgPSBbZGVmaW5pdGlvbi5pZF07XG5cblx0XHRcdC8vIFN0YXJ0IGJvdGggY29ubmVjdGlvbnMgY29uY3VycmVudGx5IHdpdGggdGhlIHNhbWUgaW50ZXJhY3Rpb25cblx0XHRcdGNvbnN0IFtjb25uZWN0aW9uMSwgY29ubmVjdGlvbjJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRyZWdpc3RyeS5yZXNvbHZlQ29ubmVjdGlvbih7XG5cdFx0XHRcdFx0Y29sbGVjdGlvblJlZjogY29sbGVjdGlvbixcblx0XHRcdFx0XHRkZWZpbml0aW9uUmVmOiBkZWZpbml0aW9uLFxuXHRcdFx0XHRcdGxvZ2dlcixcblx0XHRcdFx0XHR0cnVzdE5vbmNlQmVhcmVyLFxuXHRcdFx0XHRcdGludGVyYWN0aW9uLFxuXHRcdFx0XHRcdHRhc2tNYW5hZ2VyLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0cmVnaXN0cnkucmVzb2x2ZUNvbm5lY3Rpb24oe1xuXHRcdFx0XHRcdGNvbGxlY3Rpb25SZWY6IGNvbGxlY3Rpb24sXG5cdFx0XHRcdFx0ZGVmaW5pdGlvblJlZjogZGVmaW5pdGlvbjIsXG5cdFx0XHRcdFx0bG9nZ2VyLFxuXHRcdFx0XHRcdHRydXN0Tm9uY2VCZWFyZXI6IHRydXN0Tm9uY2VCZWFyZXIyLFxuXHRcdFx0XHRcdGludGVyYWN0aW9uLFxuXHRcdFx0XHRcdHRhc2tNYW5hZ2VyLFxuXHRcdFx0XHR9KVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5vayhjb25uZWN0aW9uMSwgJ0ZpcnN0IGNvbm5lY3Rpb24gc2hvdWxkIGJlIGNyZWF0ZWQgd2hlbiB0cnVzdGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbjIsIHVuZGVmaW5lZCwgJ1NlY29uZCBjb25uZWN0aW9uIHNob3VsZCBub3QgYmUgY3JlYXRlZCB3aGVuIG5vdCB0cnVzdGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1c3ROb25jZUJlYXJlci50cnVzdGVkQXROb25jZSwgJ25vbmNlLWInLCAnRmlyc3Qgbm9uY2Ugc2hvdWxkIGJlIHVwZGF0ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdE5vbmNlQmVhcmVyMi50cnVzdGVkQXROb25jZSwgJ19fdnNjb2RlX25vdF90cnVzdGVkJywgJ1NlY29uZCBub25jZSBzaG91bGQgYmUgbWFya2VkIGFzIG5vdCB0cnVzdGVkJyk7XG5cblx0XHRcdGNvbm5lY3Rpb24xIS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixZQUFZLFdBQVc7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQThCLHVCQUF1QjtBQUNyRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUJBQWdELDZCQUE2QjtBQUN0RixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNCQUErQjtBQUN4QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFrQixnQkFBZ0IsYUFBYSxZQUFZLHNCQUFzQjtBQUNqRixTQUFTLGlCQUFpQixzQkFBc0I7QUFFaEQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxpQkFBaUIsb0JBQW9C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
