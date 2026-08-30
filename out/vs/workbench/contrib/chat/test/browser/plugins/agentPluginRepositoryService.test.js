import assert from "assert";
import { CancellationError } from "../../../../../../base/common/errors.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IEnvironmentService } from "../../../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { IProgressService } from "../../../../../../platform/progress/common/progress.js";
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { IUserDataProfileService } from "../../../../../services/userDataProfile/common/userDataProfile.js";
import { AgentPluginRepositoryService } from "../../../browser/agentPluginRepositoryService.js";
import { MarketplaceType, parseMarketplaceReference, PluginSourceKind } from "../../../common/plugins/pluginMarketplaceService.js";
import { IPluginGitService } from "../../../common/plugins/pluginGitService.js";
suite("AgentPluginRepositoryService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function stubPluginGit(overrides) {
    return {
      _serviceBrand: void 0,
      cloneRepository: async () => {
      },
      pull: async () => false,
      checkout: async () => {
      },
      revParse: async () => "",
      fetch: async () => {
      },
      fetchRepository: async () => {
      },
      revListCount: async () => 0,
      ...overrides
    };
  }
  function createPlugin(marketplace, source) {
    const marketplaceReference = parseMarketplaceReference(marketplace);
    assert.ok(marketplaceReference);
    if (!marketplaceReference) {
      throw new Error("Expected marketplace reference to parse.");
    }
    return {
      name: "test-plugin",
      description: "",
      version: "",
      source,
      sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: source },
      marketplace: marketplaceReference.displayLabel,
      marketplaceReference,
      marketplaceType: MarketplaceType.Copilot
    };
  }
  function createService(onExists, onExecuteCommand, pluginGitStub) {
    const instantiationService = store.add(new TestInstantiationService());
    const fileService = {
      exists: async (resource) => onExists ? onExists(resource) : true,
      createFolder: async () => void 0
    };
    const progressService = {
      withProgress: async (_options, callback) => callback()
    };
    instantiationService.stub(ICommandService, {
      executeCommand: async (id, ...args) => {
        onExecuteCommand?.(id, ...args);
        return void 0;
      }
    });
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file("/cache/agentPlugins") } });
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(INotificationService, { notify: () => void 0 });
    instantiationService.stub(IPluginGitService, stubPluginGit({
      ...pluginGitStub
    }));
    instantiationService.stub(IProgressService, progressService);
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    return instantiationService.createInstance(AgentPluginRepositoryService);
  }
  test("uses cacheSegments path for GitHub shorthand plugin references", () => {
    const service = createService();
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
    assert.strictEqual(uri.path, "/cache/agentPlugins/github.com/microsoft/vscode");
  });
  test("uses ref-specific cache path for GitHub shorthand plugin references", () => {
    const service = createService();
    const plugin = createPlugin("microsoft/vscode#marketplace", "plugins/myPlugin");
    const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
    assert.strictEqual(uri.path, "/cache/agentPlugins/github.com/microsoft/vscode/ref_marketplace");
  });
  test("uses marketplaces cache path for direct git URI plugin references", () => {
    const service = createService();
    const plugin = createPlugin("https://example.com/org/repo.git", "plugins/myPlugin");
    const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
    assert.strictEqual(uri.path, "/cache/agentPlugins/example.com/org/repo");
  });
  test("uses same cache path for equivalent GitHub shorthand and URI references", () => {
    const service = createService();
    const shorthandPlugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const uriPlugin = createPlugin("https://github.com/microsoft/vscode.git", "plugins/myPlugin");
    const shorthandUri = service.getRepositoryUri(shorthandPlugin.marketplaceReference, shorthandPlugin.marketplaceType);
    const uriRefUri = service.getRepositoryUri(uriPlugin.marketplaceReference, uriPlugin.marketplaceType);
    assert.strictEqual(shorthandUri.path, "/cache/agentPlugins/github.com/microsoft/vscode");
    assert.strictEqual(uriRefUri.path, "/cache/agentPlugins/github.com/microsoft/vscode");
  });
  test("ensures plugin repositories via cacheSegments path", async () => {
    let checkedPath;
    const service = createService(async (resource) => {
      checkedPath = resource.path;
      return true;
    });
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const uri = await service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType });
    assert.strictEqual(checkedPath, "/cache/agentPlugins/github.com/microsoft/vscode");
    assert.strictEqual(uri.path, "/cache/agentPlugins/github.com/microsoft/vscode");
  });
  test("refreshes an existing repository without a recorded refresh timestamp", async () => {
    let pullCount = 0;
    const service = createService(async () => true, void 0, {
      pull: async () => {
        pullCount++;
        return false;
      }
    });
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const uri = await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 8 * 60 * 60 * 1e3 });
    assert.deepStrictEqual({ pullCount, uri: uri.path }, { pullCount: 1, uri: "/cache/agentPlugins/github.com/microsoft/vscode" });
  });
  test("does not refresh an existing repository with a recent refresh timestamp", async () => {
    let pullCount = 0;
    const service = createService(async () => true, void 0, {
      pull: async () => {
        pullCount++;
        return false;
      }
    });
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 8 * 60 * 60 * 1e3 });
    await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 8 * 60 * 60 * 1e3 });
    assert.strictEqual(pullCount, 1);
  });
  test("records a refresh timestamp for a newly cloned repository", async () => {
    let repoExists = false;
    let cloneCount = 0;
    let pullCount = 0;
    const service = createService(async () => repoExists, void 0, {
      cloneRepository: async () => {
        cloneCount++;
        repoExists = true;
      },
      pull: async () => {
        pullCount++;
        return false;
      }
    });
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 8 * 60 * 60 * 1e3 });
    await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 8 * 60 * 60 * 1e3 });
    assert.deepStrictEqual({ cloneCount, pullCount }, { cloneCount: 1, pullCount: 0 });
  });
  test("refreshes an existing repository when refresh age is zero", async () => {
    let pullCount = 0;
    const service = createService(async () => true, void 0, {
      pull: async () => {
        pullCount++;
        return false;
      }
    });
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 8 * 60 * 60 * 1e3 });
    await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 0 });
    assert.strictEqual(pullCount, 2);
  });
  test("does not refresh an existing repository without a refresh policy", async () => {
    let pullCount = 0;
    const service = createService(async () => true, void 0, {
      pull: async () => {
        pullCount++;
        return false;
      }
    });
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    await service.ensureRepository(plugin.marketplaceReference);
    assert.strictEqual(pullCount, 0);
  });
  test("does not refresh a local file marketplace repository", async () => {
    let pullCount = 0;
    const service = createService(async () => true, void 0, {
      pull: async () => {
        pullCount++;
        return false;
      }
    });
    const plugin = createPlugin("file:///marketplace-repo", "plugins/myPlugin");
    await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 0 });
    assert.strictEqual(pullCount, 0);
  });
  test("does not refresh a repository pinned to a commit SHA", async () => {
    let pullCount = 0;
    const service = createService(async () => true, void 0, {
      pull: async () => {
        pullCount++;
        return false;
      }
    });
    const plugin = createPlugin("microsoft/vscode#a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0", "plugins/myPlugin");
    await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 0 });
    assert.strictEqual(pullCount, 0);
  });
  test("does not refresh again after an explicit pull already updated the repository", async () => {
    let pullCount = 0;
    const service = createService(async () => true, void 0, {
      pull: async () => {
        pullCount++;
        return false;
      }
    });
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    await service.pullRepository(plugin.marketplaceReference, { silent: true });
    await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 8 * 60 * 60 * 1e3 });
    assert.strictEqual(pullCount, 1);
  });
  test("keeps an existing repository after a refresh failure and records the attempt", async () => {
    let pullCount = 0;
    const service = createService(async () => true, void 0, {
      pull: async () => {
        pullCount++;
        throw new Error("Network unavailable");
      }
    });
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const first = await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 8 * 60 * 60 * 1e3 });
    const second = await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 8 * 60 * 60 * 1e3 });
    assert.deepStrictEqual({ pullCount, first: first.path, second: second.path }, {
      pullCount: 1,
      first: "/cache/agentPlugins/github.com/microsoft/vscode",
      second: "/cache/agentPlugins/github.com/microsoft/vscode"
    });
  });
  test("cancels a first-time clone when the caller token is cancelled", async () => {
    const cts = store.add(new CancellationTokenSource());
    let cloneCancelled = false;
    const service = createService(async () => false, void 0, {
      cloneRepository: async (_cloneUrl, _targetDir, _ref, token) => {
        cts.cancel();
        cloneCancelled = !!token?.isCancellationRequested;
      }
    });
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    await service.ensureRepository(plugin.marketplaceReference, { token: cts.token });
    assert.strictEqual(cloneCancelled, true);
  });
  test("does not record a cancelled refresh attempt", async () => {
    let pullCount = 0;
    const service = createService(async () => true, void 0, {
      pull: async () => {
        pullCount++;
        throw new CancellationError();
      }
    });
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const first = await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 8 * 60 * 60 * 1e3 });
    const second = await service.ensureRepository(plugin.marketplaceReference, { refreshIfOlderThanMs: 8 * 60 * 60 * 1e3 });
    assert.deepStrictEqual({ pullCount, first: first.path, second: second.path }, {
      pullCount: 2,
      first: "/cache/agentPlugins/github.com/microsoft/vscode",
      second: "/cache/agentPlugins/github.com/microsoft/vscode"
    });
  });
  test("passes marketplace refs through cloneRepository", async () => {
    let clonedRef;
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(ICommandService, { executeCommand: async () => void 0 });
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file("/cache/agentPlugins") } });
    instantiationService.stub(IFileService, {
      exists: async () => false,
      createFolder: async () => void 0
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(INotificationService, { notify: () => void 0 });
    instantiationService.stub(IPluginGitService, stubPluginGit({
      cloneRepository: async (_cloneUrl, _targetDir, ref) => {
        clonedRef = ref;
      }
    }));
    instantiationService.stub(IProgressService, {
      withProgress: async (_options, callback) => callback()
    });
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    const service = instantiationService.createInstance(AgentPluginRepositoryService);
    const plugin = createPlugin("microsoft/vscode#marketplace", "plugins/myPlugin");
    await service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType });
    assert.strictEqual(clonedRef, "marketplace");
  });
  test("concurrent ensureRepository calls for the same marketplace clone only once", async () => {
    let cloneCount = 0;
    const instantiationService = store.add(new TestInstantiationService());
    let repoExists = false;
    const fileService = {
      exists: async (_resource) => repoExists,
      createFolder: async () => void 0
    };
    const progressService = {
      withProgress: async (_options, callback) => callback()
    };
    instantiationService.stub(ICommandService, {
      executeCommand: async () => void 0
    });
    instantiationService.stub(IPluginGitService, stubPluginGit({
      cloneRepository: async () => {
        cloneCount++;
        await new Promise((r) => setTimeout(r, 0));
        repoExists = true;
      }
    }));
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file("/cache/agentPlugins") } });
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(INotificationService, { notify: () => void 0 });
    instantiationService.stub(IProgressService, progressService);
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    const service = instantiationService.createInstance(AgentPluginRepositoryService);
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const [uri1, uri2] = await Promise.all([
      service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType }),
      service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType })
    ]);
    assert.strictEqual(cloneCount, 1);
    assert.strictEqual(uri1.path, "/cache/agentPlugins/github.com/microsoft/vscode");
    assert.strictEqual(uri2.path, "/cache/agentPlugins/github.com/microsoft/vscode");
  });
  test("builds install URI from source inside repository root", () => {
    const service = createService();
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const uri = service.getPluginInstallUri(plugin);
    assert.strictEqual(uri.path, "/cache/agentPlugins/github.com/microsoft/vscode/plugins/myPlugin");
  });
  test("uses indexed repository URI when available", () => {
    const storage = store.add(new InMemoryStorageService());
    storage.store("chat.plugins.marketplaces.index.v1", JSON.stringify({
      "github:microsoft/vscode": {
        repositoryUri: URI.file("/cache/agentPlugins/indexed/microsoft/vscode"),
        marketplaceType: MarketplaceType.Copilot
      }
    }), StorageScope.APPLICATION, StorageTarget.MACHINE);
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(ICommandService, { executeCommand: async () => void 0 });
    instantiationService.stub(IPluginGitService, stubPluginGit());
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file("/cache/agentPlugins") } });
    instantiationService.stub(IFileService, { exists: async () => true });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(INotificationService, { notify: () => void 0 });
    instantiationService.stub(IProgressService, { withProgress: async (_options, callback) => callback() });
    instantiationService.stub(IStorageService, storage);
    const service = instantiationService.createInstance(AgentPluginRepositoryService);
    const plugin = createPlugin("microsoft/vscode", "plugins/myPlugin");
    const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
    assert.strictEqual(uri.path, "/cache/agentPlugins/indexed/microsoft/vscode");
  });
  test("rejects plugin source paths that escape repository root", () => {
    const service = createService();
    const plugin = createPlugin("microsoft/vscode", "../outside");
    assert.throws(() => service.getPluginInstallUri(plugin));
  });
  test("uses local repository URI for file marketplace references", () => {
    const service = createService();
    const plugin = createPlugin("file:///tmp/marketplace-repo", "plugins/myPlugin");
    const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
    assert.strictEqual(uri.scheme, "file");
    assert.strictEqual(uri.path, "/tmp/marketplace-repo");
  });
  test("does not invoke clone command when ensuring existing local file repository", async () => {
    let commandInvocationCount = 0;
    const service = createService(async () => true, () => {
      commandInvocationCount++;
    });
    const plugin = createPlugin("file:///tmp/marketplace-repo", "plugins/myPlugin");
    const uri = await service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType });
    assert.strictEqual(uri.path, "/tmp/marketplace-repo");
    assert.strictEqual(commandInvocationCount, 0);
  });
  test("builds revision-aware install URI for github plugin sources", () => {
    const service = createService();
    const uri = service.getPluginSourceInstallUri({
      kind: PluginSourceKind.GitHub,
      repo: "owner/repo",
      ref: "release/v1"
    });
    assert.strictEqual(uri.path, "/cache/agentPlugins/github.com/owner/repo/ref_release_v1");
  });
  test("updates git plugin source by pulling and checking out requested revision", async () => {
    const calls = [];
    const service = createService(async () => true, void 0, {
      revParse: async () => {
        calls.push("revParse");
        return "";
      },
      fetch: async () => {
        calls.push("fetch");
      },
      checkout: async () => {
        calls.push("checkout");
      },
      pull: async () => {
        calls.push("pull");
        return false;
      }
    });
    await service.updatePluginSource({
      name: "my-plugin",
      description: "",
      version: "",
      source: "",
      sourceDescriptor: {
        kind: PluginSourceKind.GitHub,
        repo: "owner/repo",
        sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
      },
      marketplace: "owner/repo",
      marketplaceReference: parseMarketplaceReference("owner/repo"),
      marketplaceType: MarketplaceType.Copilot
    }, {
      pluginName: "my-plugin",
      failureLabel: "my-plugin",
      marketplaceType: MarketplaceType.Copilot
    });
    assert.deepStrictEqual(calls, ["revParse", "fetch", "checkout", "revParse"]);
  });
  suite("cleanupPluginSource", () => {
    function createServiceWithDel(onDel, options) {
      const instantiationService = store.add(new TestInstantiationService());
      instantiationService.stub(ICommandService, { executeCommand: async () => void 0 });
      instantiationService.stub(IPluginGitService, stubPluginGit());
      instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
      instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file("/cache/agentPlugins") } });
      instantiationService.stub(IFileService, {
        exists: async () => true,
        del: async (resource) => {
          onDel(resource);
        },
        createFolder: async () => void 0,
        resolve: async (resource) => options?.resolve?.(resource) ?? { children: [] }
      });
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(INotificationService, { notify: () => void 0 });
      instantiationService.stub(IProgressService, { withProgress: async (_o, cb) => cb() });
      instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
      return instantiationService.createInstance(AgentPluginRepositoryService);
    }
    test("does not delete files for relative-path (marketplace) plugin", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource({
        name: "marketplace-plugin",
        description: "",
        version: "",
        source: "plugins/foo",
        sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/foo" },
        marketplace: "microsoft/vscode",
        marketplaceReference: parseMarketplaceReference("microsoft/vscode"),
        marketplaceType: MarketplaceType.Copilot
      });
      assert.strictEqual(deleted.length, 0);
    });
    test("deletes cache for github plugin source", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource({
        name: "gh-plugin",
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" },
        marketplace: "owner/marketplace",
        marketplaceReference: parseMarketplaceReference("owner/marketplace"),
        marketplaceType: MarketplaceType.Copilot
      });
      assert.ok(deleted.length >= 1);
      assert.ok(deleted[0].includes("github.com/owner/repo"));
    });
    test("deletes parent cache dir for npm plugin source", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource({
        name: "npm-plugin",
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.Npm, package: "@acme/plugin" },
        marketplace: "owner/marketplace",
        marketplaceReference: parseMarketplaceReference("owner/marketplace"),
        marketplaceType: MarketplaceType.Copilot
      });
      assert.ok(deleted.length >= 1);
      assert.ok(deleted[0].includes("/npm/"), `Expected npm path, got: ${deleted[0]}`);
    });
    test("deletes cache for pip plugin source", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource({
        name: "pip-plugin",
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.Pip, package: "my-pip-pkg" },
        marketplace: "owner/marketplace",
        marketplaceReference: parseMarketplaceReference("owner/marketplace"),
        marketplaceType: MarketplaceType.Copilot
      });
      assert.ok(deleted.length >= 1);
      assert.ok(deleted[0].includes("pip/my-pip-pkg"));
    });
    test("does not throw when delete fails", async () => {
      const instantiationService = store.add(new TestInstantiationService());
      instantiationService.stub(ICommandService, { executeCommand: async () => void 0 });
      instantiationService.stub(IPluginGitService, stubPluginGit());
      instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
      instantiationService.stub(IUserDataProfileService, { currentProfile: { agentPluginsHome: URI.file("/cache/agentPlugins") } });
      instantiationService.stub(IFileService, {
        exists: async () => true,
        del: async () => {
          throw new Error("permission denied");
        },
        createFolder: async () => void 0,
        resolve: async () => ({ children: [] })
      });
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(INotificationService, { notify: () => void 0 });
      instantiationService.stub(IProgressService, { withProgress: async (_o, cb) => cb() });
      instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
      const service = instantiationService.createInstance(AgentPluginRepositoryService);
      await service.cleanupPluginSource({
        name: "gh-plugin",
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" },
        marketplace: "owner/marketplace",
        marketplaceReference: parseMarketplaceReference("owner/marketplace"),
        marketplaceType: MarketplaceType.Copilot
      });
    });
    test("prunes empty parent directories up to cache root", async () => {
      const deleted = [];
      const service = createServiceWithDel(
        (r) => deleted.push(r.path),
        { resolve: () => ({ children: [] }) }
      );
      await service.cleanupPluginSource({
        name: "gh-plugin",
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" },
        marketplace: "owner/marketplace",
        marketplaceReference: parseMarketplaceReference("owner/marketplace"),
        marketplaceType: MarketplaceType.Copilot
      });
      assert.ok(deleted.length >= 2, `Expected at least 2 deletions (repo + parent), got ${deleted.length}: ${deleted.join(", ")}`);
      assert.ok(deleted[0].includes("github.com/owner/repo"), "First delete should be the repo dir");
      assert.ok(deleted.some((p) => p.endsWith("/owner")), "Should prune empty owner directory");
    });
    test("stops pruning at non-empty parent", async () => {
      const deleted = [];
      const service = createServiceWithDel(
        (r) => deleted.push(r.path),
        {
          resolve: (resource) => {
            if (resource.path.endsWith("/owner")) {
              return { children: [{ name: "other-repo" }] };
            }
            return { children: [] };
          }
        }
      );
      await service.cleanupPluginSource({
        name: "gh-plugin",
        description: "",
        version: "",
        source: "",
        sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" },
        marketplace: "owner/marketplace",
        marketplaceReference: parseMarketplaceReference("owner/marketplace"),
        marketplaceType: MarketplaceType.Copilot
      });
      assert.strictEqual(deleted.length, 1);
      assert.ok(deleted[0].includes("github.com/owner/repo"));
    });
    test("skips deletion when another installed plugin shares the same cleanup target", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource(
        {
          name: "plugin-a",
          description: "",
          version: "",
          source: "",
          sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo", path: "plugins/a" },
          marketplace: "owner/marketplace",
          marketplaceReference: parseMarketplaceReference("owner/marketplace"),
          marketplaceType: MarketplaceType.Copilot
        },
        // Another plugin from the same repo still installed
        [{ kind: PluginSourceKind.GitHub, repo: "owner/repo", path: "plugins/b" }]
      );
      assert.strictEqual(deleted.length, 0);
    });
    test("proceeds with deletion when no other plugin shares the cleanup target", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource(
        {
          name: "plugin-a",
          description: "",
          version: "",
          source: "",
          sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo", path: "plugins/a" },
          marketplace: "owner/marketplace",
          marketplaceReference: parseMarketplaceReference("owner/marketplace"),
          marketplaceType: MarketplaceType.Copilot
        },
        // Only unrelated plugins remain
        [{ kind: PluginSourceKind.GitHub, repo: "other-owner/other-repo" }]
      );
      assert.ok(deleted.length >= 1);
      assert.ok(deleted[0].includes("github.com/owner/repo"));
    });
    test("proceeds with deletion when otherInstalledDescriptors is empty", async () => {
      const deleted = [];
      const service = createServiceWithDel((r) => deleted.push(r.path));
      await service.cleanupPluginSource(
        {
          name: "plugin-a",
          description: "",
          version: "",
          source: "",
          sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "owner/repo" },
          marketplace: "owner/marketplace",
          marketplaceReference: parseMarketplaceReference("owner/marketplace"),
          marketplaceType: MarketplaceType.Copilot
        },
        []
      );
      assert.ok(deleted.length >= 1);
      assert.ok(deleted[0].includes("github.com/owner/repo"));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHBsdWdpbnNcXGFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFya2V0cGxhY2VQbHVnaW4sIE1hcmtldHBsYWNlVHlwZSwgcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSwgUGx1Z2luU291cmNlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGx1Z2luR2l0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbkdpdFNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzdHViUGx1Z2luR2l0KG92ZXJyaWRlcz86IFBhcnRpYWw8SVBsdWdpbkdpdFNlcnZpY2U+KTogSVBsdWdpbkdpdFNlcnZpY2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRjbG9uZVJlcG9zaXRvcnk6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdHB1bGw6IGFzeW5jICgpID0+IGZhbHNlLFxuXHRcdFx0Y2hlY2tvdXQ6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdHJldlBhcnNlOiBhc3luYyAoKSA9PiAnJyxcblx0XHRcdGZldGNoOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRmZXRjaFJlcG9zaXRvcnk6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdHJldkxpc3RDb3VudDogYXN5bmMgKCkgPT4gMCxcblx0XHRcdC4uLm92ZXJyaWRlcyxcblx0XHR9IGFzIElQbHVnaW5HaXRTZXJ2aWNlO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlUGx1Z2luKG1hcmtldHBsYWNlOiBzdHJpbmcsIHNvdXJjZTogc3RyaW5nKTogSU1hcmtldHBsYWNlUGx1Z2luIHtcblx0XHRjb25zdCBtYXJrZXRwbGFjZVJlZmVyZW5jZSA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UobWFya2V0cGxhY2UpO1xuXHRcdGFzc2VydC5vayhtYXJrZXRwbGFjZVJlZmVyZW5jZSk7XG5cdFx0aWYgKCFtYXJrZXRwbGFjZVJlZmVyZW5jZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBtYXJrZXRwbGFjZSByZWZlcmVuY2UgdG8gcGFyc2UuJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6ICd0ZXN0LXBsdWdpbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHR2ZXJzaW9uOiAnJyxcblx0XHRcdHNvdXJjZSxcblx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5SZWxhdGl2ZVBhdGgsIHBhdGg6IHNvdXJjZSB9LFxuXHRcdFx0bWFya2V0cGxhY2U6IG1hcmtldHBsYWNlUmVmZXJlbmNlLmRpc3BsYXlMYWJlbCxcblx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlLFxuXHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZShcblx0XHRvbkV4aXN0cz86IChyZXNvdXJjZTogVVJJKSA9PiBQcm9taXNlPGJvb2xlYW4+LFxuXHRcdG9uRXhlY3V0ZUNvbW1hbmQ/OiAoaWQ6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkLFxuXHRcdHBsdWdpbkdpdFN0dWI/OiBQYXJ0aWFsPElQbHVnaW5HaXRTZXJ2aWNlPixcblx0KTogQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0ge1xuXHRcdFx0ZXhpc3RzOiBhc3luYyAocmVzb3VyY2U6IFVSSSkgPT4gb25FeGlzdHMgPyBvbkV4aXN0cyhyZXNvdXJjZSkgOiB0cnVlLFxuXHRcdFx0Y3JlYXRlRm9sZGVyOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSBhcyB1bmtub3duIGFzIElGaWxlU2VydmljZTtcblxuXHRcdGNvbnN0IHByb2dyZXNzU2VydmljZSA9IHtcblx0XHRcdHdpdGhQcm9ncmVzczogYXN5bmMgKF9vcHRpb25zOiB1bmtub3duLCBjYWxsYmFjazogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gUHJvbWlzZTx1bmtub3duPikgPT4gY2FsbGJhY2soKSxcblx0XHR9IGFzIHVua25vd24gYXMgSVByb2dyZXNzU2VydmljZTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCB7XG5cdFx0XHRleGVjdXRlQ29tbWFuZDogYXN5bmMgKGlkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0XHRvbkV4ZWN1dGVDb21tYW5kPy4oaWQsIC4uLmFyZ3MpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFNlcnZpY2UsIHsgY2FjaGVIb21lOiBVUkkuZmlsZSgnL2NhY2hlJykgfSBhcyB1bmtub3duIGFzIElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIHsgY3VycmVudFByb2ZpbGU6IHsgYWdlbnRQbHVnaW5zSG9tZTogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMnKSB9IH0gYXMgdW5rbm93biBhcyBJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90aWZpY2F0aW9uU2VydmljZSwgeyBub3RpZnk6ICgpID0+IHVuZGVmaW5lZCB9IGFzIHVua25vd24gYXMgSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVBsdWdpbkdpdFNlcnZpY2UsIHN0dWJQbHVnaW5HaXQoe1xuXHRcdFx0Li4ucGx1Z2luR2l0U3R1Yixcblx0XHR9KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBwcm9ncmVzc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UpO1xuXHR9XG5cblx0dGVzdCgndXNlcyBjYWNoZVNlZ21lbnRzIHBhdGggZm9yIEdpdEh1YiBzaG9ydGhhbmQgcGx1Z2luIHJlZmVyZW5jZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXHRcdGNvbnN0IHVyaSA9IHNlcnZpY2UuZ2V0UmVwb3NpdG9yeVVyaShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHBsdWdpbi5tYXJrZXRwbGFjZVR5cGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5wYXRoLCAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyByZWYtc3BlY2lmaWMgY2FjaGUgcGF0aCBmb3IgR2l0SHViIHNob3J0aGFuZCBwbHVnaW4gcmVmZXJlbmNlcycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbignbWljcm9zb2Z0L3ZzY29kZSNtYXJrZXRwbGFjZScsICdwbHVnaW5zL215UGx1Z2luJyk7XG5cdFx0Y29uc3QgdXJpID0gc2VydmljZS5nZXRSZXBvc2l0b3J5VXJpKHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgcGx1Z2luLm1hcmtldHBsYWNlVHlwZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9yZWZfbWFya2V0cGxhY2UnKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBtYXJrZXRwbGFjZXMgY2FjaGUgcGF0aCBmb3IgZGlyZWN0IGdpdCBVUkkgcGx1Z2luIHJlZmVyZW5jZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ2h0dHBzOi8vZXhhbXBsZS5jb20vb3JnL3JlcG8uZ2l0JywgJ3BsdWdpbnMvbXlQbHVnaW4nKTtcblx0XHRjb25zdCB1cmkgPSBzZXJ2aWNlLmdldFJlcG9zaXRvcnlVcmkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCBwbHVnaW4ubWFya2V0cGxhY2VUeXBlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkucGF0aCwgJy9jYWNoZS9hZ2VudFBsdWdpbnMvZXhhbXBsZS5jb20vb3JnL3JlcG8nKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBzYW1lIGNhY2hlIHBhdGggZm9yIGVxdWl2YWxlbnQgR2l0SHViIHNob3J0aGFuZCBhbmQgVVJJIHJlZmVyZW5jZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBzaG9ydGhhbmRQbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXHRcdGNvbnN0IHVyaVBsdWdpbiA9IGNyZWF0ZVBsdWdpbignaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUuZ2l0JywgJ3BsdWdpbnMvbXlQbHVnaW4nKTtcblxuXHRcdGNvbnN0IHNob3J0aGFuZFVyaSA9IHNlcnZpY2UuZ2V0UmVwb3NpdG9yeVVyaShzaG9ydGhhbmRQbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHNob3J0aGFuZFBsdWdpbi5tYXJrZXRwbGFjZVR5cGUpO1xuXHRcdGNvbnN0IHVyaVJlZlVyaSA9IHNlcnZpY2UuZ2V0UmVwb3NpdG9yeVVyaSh1cmlQbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHVyaVBsdWdpbi5tYXJrZXRwbGFjZVR5cGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3J0aGFuZFVyaS5wYXRoLCAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpUmVmVXJpLnBhdGgsICcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbnN1cmVzIHBsdWdpbiByZXBvc2l0b3JpZXMgdmlhIGNhY2hlU2VnbWVudHMgcGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY2hlY2tlZFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyByZXNvdXJjZSA9PiB7XG5cdFx0XHRjaGVja2VkUGF0aCA9IHJlc291cmNlLnBhdGg7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXHRcdGNvbnN0IHVyaSA9IGF3YWl0IHNlcnZpY2UuZW5zdXJlUmVwb3NpdG9yeShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHsgbWFya2V0cGxhY2VUeXBlOiBwbHVnaW4ubWFya2V0cGxhY2VUeXBlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoZWNrZWRQYXRoLCAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZyZXNoZXMgYW4gZXhpc3RpbmcgcmVwb3NpdG9yeSB3aXRob3V0IGEgcmVjb3JkZWQgcmVmcmVzaCB0aW1lc3RhbXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHB1bGxDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKCkgPT4gdHJ1ZSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRwdWxsOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHB1bGxDb3VudCsrO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbignbWljcm9zb2Z0L3ZzY29kZScsICdwbHVnaW5zL215UGx1Z2luJyk7XG5cblx0XHRjb25zdCB1cmkgPSBhd2FpdCBzZXJ2aWNlLmVuc3VyZVJlcG9zaXRvcnkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCB7IHJlZnJlc2hJZk9sZGVyVGhhbk1zOiA4ICogNjAgKiA2MCAqIDEwMDAgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcHVsbENvdW50LCB1cmk6IHVyaS5wYXRoIH0sIHsgcHVsbENvdW50OiAxLCB1cmk6ICcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlZnJlc2ggYW4gZXhpc3RpbmcgcmVwb3NpdG9yeSB3aXRoIGEgcmVjZW50IHJlZnJlc2ggdGltZXN0YW1wJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBwdWxsQ291bnQgPSAwO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jICgpID0+IHRydWUsIHVuZGVmaW5lZCwge1xuXHRcdFx0cHVsbDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRwdWxsQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5lbnN1cmVSZXBvc2l0b3J5KHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgeyByZWZyZXNoSWZPbGRlclRoYW5NczogOCAqIDYwICogNjAgKiAxMDAwIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuZW5zdXJlUmVwb3NpdG9yeShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHsgcmVmcmVzaElmT2xkZXJUaGFuTXM6IDggKiA2MCAqIDYwICogMTAwMCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwdWxsQ291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvcmRzIGEgcmVmcmVzaCB0aW1lc3RhbXAgZm9yIGEgbmV3bHkgY2xvbmVkIHJlcG9zaXRvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHJlcG9FeGlzdHMgPSBmYWxzZTtcblx0XHRsZXQgY2xvbmVDb3VudCA9IDA7XG5cdFx0bGV0IHB1bGxDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKCkgPT4gcmVwb0V4aXN0cywgdW5kZWZpbmVkLCB7XG5cdFx0XHRjbG9uZVJlcG9zaXRvcnk6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y2xvbmVDb3VudCsrO1xuXHRcdFx0XHRyZXBvRXhpc3RzID0gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0XHRwdWxsOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHB1bGxDb3VudCsrO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbignbWljcm9zb2Z0L3ZzY29kZScsICdwbHVnaW5zL215UGx1Z2luJyk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmVuc3VyZVJlcG9zaXRvcnkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCB7IHJlZnJlc2hJZk9sZGVyVGhhbk1zOiA4ICogNjAgKiA2MCAqIDEwMDAgfSk7XG5cdFx0YXdhaXQgc2VydmljZS5lbnN1cmVSZXBvc2l0b3J5KHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgeyByZWZyZXNoSWZPbGRlclRoYW5NczogOCAqIDYwICogNjAgKiAxMDAwIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNsb25lQ291bnQsIHB1bGxDb3VudCB9LCB7IGNsb25lQ291bnQ6IDEsIHB1bGxDb3VudDogMCB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaGVzIGFuIGV4aXN0aW5nIHJlcG9zaXRvcnkgd2hlbiByZWZyZXNoIGFnZSBpcyB6ZXJvJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBwdWxsQ291bnQgPSAwO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jICgpID0+IHRydWUsIHVuZGVmaW5lZCwge1xuXHRcdFx0cHVsbDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRwdWxsQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5lbnN1cmVSZXBvc2l0b3J5KHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgeyByZWZyZXNoSWZPbGRlclRoYW5NczogOCAqIDYwICogNjAgKiAxMDAwIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuZW5zdXJlUmVwb3NpdG9yeShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHsgcmVmcmVzaElmT2xkZXJUaGFuTXM6IDAgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHVsbENvdW50LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVmcmVzaCBhbiBleGlzdGluZyByZXBvc2l0b3J5IHdpdGhvdXQgYSByZWZyZXNoIHBvbGljeScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgcHVsbENvdW50ID0gMDtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoKSA9PiB0cnVlLCB1bmRlZmluZWQsIHtcblx0XHRcdHB1bGw6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0cHVsbENvdW50Kys7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKCdtaWNyb3NvZnQvdnNjb2RlJywgJ3BsdWdpbnMvbXlQbHVnaW4nKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZW5zdXJlUmVwb3NpdG9yeShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHB1bGxDb3VudCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlZnJlc2ggYSBsb2NhbCBmaWxlIG1hcmtldHBsYWNlIHJlcG9zaXRvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHB1bGxDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKCkgPT4gdHJ1ZSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRwdWxsOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHB1bGxDb3VudCsrO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbignZmlsZTovLy9tYXJrZXRwbGFjZS1yZXBvJywgJ3BsdWdpbnMvbXlQbHVnaW4nKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZW5zdXJlUmVwb3NpdG9yeShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHsgcmVmcmVzaElmT2xkZXJUaGFuTXM6IDAgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHVsbENvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVmcmVzaCBhIHJlcG9zaXRvcnkgcGlubmVkIHRvIGEgY29tbWl0IFNIQScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgcHVsbENvdW50ID0gMDtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoKSA9PiB0cnVlLCB1bmRlZmluZWQsIHtcblx0XHRcdHB1bGw6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0cHVsbENvdW50Kys7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKCdtaWNyb3NvZnQvdnNjb2RlI2ExYjJjM2Q0ZTVmNmE3YjhjOWQwZTFmMmEzYjRjNWQ2ZTdmOGE5YjAnLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5lbnN1cmVSZXBvc2l0b3J5KHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgeyByZWZyZXNoSWZPbGRlclRoYW5NczogMCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwdWxsQ291bnQsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZWZyZXNoIGFnYWluIGFmdGVyIGFuIGV4cGxpY2l0IHB1bGwgYWxyZWFkeSB1cGRhdGVkIHRoZSByZXBvc2l0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBwdWxsQ291bnQgPSAwO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jICgpID0+IHRydWUsIHVuZGVmaW5lZCwge1xuXHRcdFx0cHVsbDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRwdWxsQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXG5cdFx0Ly8gYHVwZGF0ZUFsbFBsdWdpbnNgIHB1bGxzIGVhY2ggaW5zdGFsbGVkIG1hcmtldHBsYWNlIGFuZCB0aGVuIHJlLXJlYWRzXG5cdFx0Ly8gaXQsIHdoaWNoIG11c3Qgbm90IHB1bGwgdGhlIHNhbWUgcmVwb3NpdG9yeSBhIHNlY29uZCB0aW1lLlxuXHRcdGF3YWl0IHNlcnZpY2UucHVsbFJlcG9zaXRvcnkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCB7IHNpbGVudDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmVuc3VyZVJlcG9zaXRvcnkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCB7IHJlZnJlc2hJZk9sZGVyVGhhbk1zOiA4ICogNjAgKiA2MCAqIDEwMDAgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHVsbENvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgYW4gZXhpc3RpbmcgcmVwb3NpdG9yeSBhZnRlciBhIHJlZnJlc2ggZmFpbHVyZSBhbmQgcmVjb3JkcyB0aGUgYXR0ZW1wdCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgcHVsbENvdW50ID0gMDtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoKSA9PiB0cnVlLCB1bmRlZmluZWQsIHtcblx0XHRcdHB1bGw6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0cHVsbENvdW50Kys7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignTmV0d29yayB1bmF2YWlsYWJsZScpO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBzZXJ2aWNlLmVuc3VyZVJlcG9zaXRvcnkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCB7IHJlZnJlc2hJZk9sZGVyVGhhbk1zOiA4ICogNjAgKiA2MCAqIDEwMDAgfSk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgc2VydmljZS5lbnN1cmVSZXBvc2l0b3J5KHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgeyByZWZyZXNoSWZPbGRlclRoYW5NczogOCAqIDYwICogNjAgKiAxMDAwIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHB1bGxDb3VudCwgZmlyc3Q6IGZpcnN0LnBhdGgsIHNlY29uZDogc2Vjb25kLnBhdGggfSwge1xuXHRcdFx0cHVsbENvdW50OiAxLFxuXHRcdFx0Zmlyc3Q6ICcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRzZWNvbmQ6ICcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbHMgYSBmaXJzdC10aW1lIGNsb25lIHdoZW4gdGhlIGNhbGxlciB0b2tlbiBpcyBjYW5jZWxsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3RzID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRsZXQgY2xvbmVDYW5jZWxsZWQgPSBmYWxzZTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoKSA9PiBmYWxzZSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRjbG9uZVJlcG9zaXRvcnk6IGFzeW5jIChfY2xvbmVVcmwsIF90YXJnZXREaXIsIF9yZWYsIHRva2VuKSA9PiB7XG5cdFx0XHRcdC8vIFNpbXVsYXRlIGEgbG9uZy1ydW5uaW5nIGNsb25lIHRoYXQgdGhlIGNhbGxlciBhYm9ydHMuXG5cdFx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdFx0Y2xvbmVDYW5jZWxsZWQgPSAhIXRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZDtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKCdtaWNyb3NvZnQvdnNjb2RlJywgJ3BsdWdpbnMvbXlQbHVnaW4nKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZW5zdXJlUmVwb3NpdG9yeShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHsgdG9rZW46IGN0cy50b2tlbiB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9uZUNhbmNlbGxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlY29yZCBhIGNhbmNlbGxlZCByZWZyZXNoIGF0dGVtcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHB1bGxDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKCkgPT4gdHJ1ZSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRwdWxsOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHB1bGxDb3VudCsrO1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKCdtaWNyb3NvZnQvdnNjb2RlJywgJ3BsdWdpbnMvbXlQbHVnaW4nKTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgc2VydmljZS5lbnN1cmVSZXBvc2l0b3J5KHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgeyByZWZyZXNoSWZPbGRlclRoYW5NczogOCAqIDYwICogNjAgKiAxMDAwIH0pO1xuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IHNlcnZpY2UuZW5zdXJlUmVwb3NpdG9yeShwbHVnaW4ubWFya2V0cGxhY2VSZWZlcmVuY2UsIHsgcmVmcmVzaElmT2xkZXJUaGFuTXM6IDggKiA2MCAqIDYwICogMTAwMCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBwdWxsQ291bnQsIGZpcnN0OiBmaXJzdC5wYXRoLCBzZWNvbmQ6IHNlY29uZC5wYXRoIH0sIHtcblx0XHRcdHB1bGxDb3VudDogMixcblx0XHRcdGZpcnN0OiAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnLFxuXHRcdFx0c2Vjb25kOiAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXNzZXMgbWFya2V0cGxhY2UgcmVmcyB0aHJvdWdoIGNsb25lUmVwb3NpdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY2xvbmVkUmVmOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgeyBleGVjdXRlQ29tbWFuZDogYXN5bmMgKCkgPT4gdW5kZWZpbmVkIH0gYXMgdW5rbm93biBhcyBJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwgeyBjYWNoZUhvbWU6IFVSSS5maWxlKCcvY2FjaGUnKSB9IGFzIHVua25vd24gYXMgSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlU2VydmljZSwgeyBjdXJyZW50UHJvZmlsZTogeyBhZ2VudFBsdWdpbnNIb21lOiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucycpIH0gfSBhcyB1bmtub3duIGFzIElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge1xuXHRcdFx0ZXhpc3RzOiBhc3luYyAoKSA9PiBmYWxzZSxcblx0XHRcdGNyZWF0ZUZvbGRlcjogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJRmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCB7IG5vdGlmeTogKCkgPT4gdW5kZWZpbmVkIH0gYXMgdW5rbm93biBhcyBJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUGx1Z2luR2l0U2VydmljZSwgc3R1YlBsdWdpbkdpdCh7XG5cdFx0XHRjbG9uZVJlcG9zaXRvcnk6IGFzeW5jIChfY2xvbmVVcmwsIF90YXJnZXREaXIsIHJlZikgPT4ge1xuXHRcdFx0XHRjbG9uZWRSZWYgPSByZWY7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIHtcblx0XHRcdHdpdGhQcm9ncmVzczogYXN5bmMgKF9vcHRpb25zOiB1bmtub3duLCBjYWxsYmFjazogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gUHJvbWlzZTx1bmtub3duPikgPT4gY2FsbGJhY2soKSxcblx0XHR9IGFzIHVua25vd24gYXMgSVByb2dyZXNzU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSk7XG5cdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKCdtaWNyb3NvZnQvdnNjb2RlI21hcmtldHBsYWNlJywgJ3BsdWdpbnMvbXlQbHVnaW4nKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmVuc3VyZVJlcG9zaXRvcnkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCB7IG1hcmtldHBsYWNlVHlwZTogcGx1Z2luLm1hcmtldHBsYWNlVHlwZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9uZWRSZWYsICdtYXJrZXRwbGFjZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25jdXJyZW50IGVuc3VyZVJlcG9zaXRvcnkgY2FsbHMgZm9yIHRoZSBzYW1lIG1hcmtldHBsYWNlIGNsb25lIG9ubHkgb25jZScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY2xvbmVDb3VudCA9IDA7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblxuXHRcdC8vIFRyYWNrIHdoZXRoZXIgdGhlIHJlcG8gZXhpc3RzIChzZXQgdG8gdHJ1ZSBhZnRlciB0aGUgZmlyc3QgY2xvbmUgY29tcGxldGVzKVxuXHRcdGxldCByZXBvRXhpc3RzID0gZmFsc2U7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSB7XG5cdFx0XHRleGlzdHM6IGFzeW5jIChfcmVzb3VyY2U6IFVSSSkgPT4gcmVwb0V4aXN0cyxcblx0XHRcdGNyZWF0ZUZvbGRlcjogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJRmlsZVNlcnZpY2U7XG5cblx0XHRjb25zdCBwcm9ncmVzc1NlcnZpY2UgPSB7XG5cdFx0XHR3aXRoUHJvZ3Jlc3M6IGFzeW5jIChfb3B0aW9uczogdW5rbm93biwgY2FsbGJhY2s6ICguLi5hcmdzOiB1bmtub3duW10pID0+IFByb21pc2U8dW5rbm93bj4pID0+IGNhbGxiYWNrKCksXG5cdFx0fSBhcyB1bmtub3duIGFzIElQcm9ncmVzc1NlcnZpY2U7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwge1xuXHRcdFx0ZXhlY3V0ZUNvbW1hbmQ6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHR9IGFzIHVua25vd24gYXMgSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQbHVnaW5HaXRTZXJ2aWNlLCBzdHViUGx1Z2luR2l0KHtcblx0XHRcdGNsb25lUmVwb3NpdG9yeTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjbG9uZUNvdW50Kys7XG5cdFx0XHRcdC8vIFNpbXVsYXRlIGFzeW5jIGNsb25lIGJ5IHlpZWxkaW5nLCB0aGVuIG1hcmsgcmVwbyBhcyBleGlzdGluZ1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXHRcdFx0XHRyZXBvRXhpc3RzID0gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwgeyBjYWNoZUhvbWU6IFVSSS5maWxlKCcvY2FjaGUnKSB9IGFzIHVua25vd24gYXMgSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlU2VydmljZSwgeyBjdXJyZW50UHJvZmlsZTogeyBhZ2VudFBsdWdpbnNIb21lOiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucycpIH0gfSBhcyB1bmtub3duIGFzIElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCB7IG5vdGlmeTogKCkgPT4gdW5kZWZpbmVkIH0gYXMgdW5rbm93biBhcyBJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBwcm9ncmVzc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UpO1xuXHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbignbWljcm9zb2Z0L3ZzY29kZScsICdwbHVnaW5zL215UGx1Z2luJyk7XG5cblx0XHQvLyBGaXJlIHR3byBjb25jdXJyZW50IGVuc3VyZVJlcG9zaXRvcnkgY2FsbHMgZm9yIHRoZSBzYW1lIG1hcmtldHBsYWNlXG5cdFx0Y29uc3QgW3VyaTEsIHVyaTJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0c2VydmljZS5lbnN1cmVSZXBvc2l0b3J5KHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgeyBtYXJrZXRwbGFjZVR5cGU6IHBsdWdpbi5tYXJrZXRwbGFjZVR5cGUgfSksXG5cdFx0XHRzZXJ2aWNlLmVuc3VyZVJlcG9zaXRvcnkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCB7IG1hcmtldHBsYWNlVHlwZTogcGx1Z2luLm1hcmtldHBsYWNlVHlwZSB9KSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9uZUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpMS5wYXRoLCAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpMi5wYXRoLCAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnKTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRzIGluc3RhbGwgVVJJIGZyb20gc291cmNlIGluc2lkZSByZXBvc2l0b3J5IHJvb3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXHRcdGNvbnN0IHVyaSA9IHNlcnZpY2UuZ2V0UGx1Z2luSW5zdGFsbFVyaShwbHVnaW4pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5wYXRoLCAnL2NhY2hlL2FnZW50UGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcGx1Z2lucy9teVBsdWdpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGluZGV4ZWQgcmVwb3NpdG9yeSBVUkkgd2hlbiBhdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlLnN0b3JlKCdjaGF0LnBsdWdpbnMubWFya2V0cGxhY2VzLmluZGV4LnYxJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0J2dpdGh1YjptaWNyb3NvZnQvdnNjb2RlJzoge1xuXHRcdFx0XHRyZXBvc2l0b3J5VXJpOiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9pbmRleGVkL21pY3Jvc29mdC92c2NvZGUnKSxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHRcdH0sXG5cdFx0fSksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29tbWFuZFNlcnZpY2UsIHsgZXhlY3V0ZUNvbW1hbmQ6IGFzeW5jICgpID0+IHVuZGVmaW5lZCB9IGFzIHVua25vd24gYXMgSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQbHVnaW5HaXRTZXJ2aWNlLCBzdHViUGx1Z2luR2l0KCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwgeyBjYWNoZUhvbWU6IFVSSS5maWxlKCcvY2FjaGUnKSB9IGFzIHVua25vd24gYXMgSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlU2VydmljZSwgeyBjdXJyZW50UHJvZmlsZTogeyBhZ2VudFBsdWdpbnNIb21lOiBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucycpIH0gfSBhcyB1bmtub3duIGFzIElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgeyBleGlzdHM6IGFzeW5jICgpID0+IHRydWUgfSBhcyB1bmtub3duIGFzIElGaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIHsgbm90aWZ5OiAoKSA9PiB1bmRlZmluZWQgfSBhcyB1bmtub3duIGFzIElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIHsgd2l0aFByb2dyZXNzOiBhc3luYyAoX29wdGlvbnM6IHVua25vd24sIGNhbGxiYWNrOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiBQcm9taXNlPHVua25vd24+KSA9PiBjYWxsYmFjaygpIH0gYXMgdW5rbm93biBhcyBJUHJvZ3Jlc3NTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSk7XG5cdFx0Y29uc3QgcGx1Z2luID0gY3JlYXRlUGx1Z2luKCdtaWNyb3NvZnQvdnNjb2RlJywgJ3BsdWdpbnMvbXlQbHVnaW4nKTtcblx0XHRjb25zdCB1cmkgPSBzZXJ2aWNlLmdldFJlcG9zaXRvcnlVcmkocGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLCBwbHVnaW4ubWFya2V0cGxhY2VUeXBlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkucGF0aCwgJy9jYWNoZS9hZ2VudFBsdWdpbnMvaW5kZXhlZC9taWNyb3NvZnQvdnNjb2RlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgcGx1Z2luIHNvdXJjZSBwYXRocyB0aGF0IGVzY2FwZSByZXBvc2l0b3J5IHJvb3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ21pY3Jvc29mdC92c2NvZGUnLCAnLi4vb3V0c2lkZScpO1xuXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBzZXJ2aWNlLmdldFBsdWdpbkluc3RhbGxVcmkocGx1Z2luKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgbG9jYWwgcmVwb3NpdG9yeSBVUkkgZm9yIGZpbGUgbWFya2V0cGxhY2UgcmVmZXJlbmNlcycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IHBsdWdpbiA9IGNyZWF0ZVBsdWdpbignZmlsZTovLy90bXAvbWFya2V0cGxhY2UtcmVwbycsICdwbHVnaW5zL215UGx1Z2luJyk7XG5cdFx0Y29uc3QgdXJpID0gc2VydmljZS5nZXRSZXBvc2l0b3J5VXJpKHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgcGx1Z2luLm1hcmtldHBsYWNlVHlwZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvdG1wL21hcmtldHBsYWNlLXJlcG8nKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgaW52b2tlIGNsb25lIGNvbW1hbmQgd2hlbiBlbnN1cmluZyBleGlzdGluZyBsb2NhbCBmaWxlIHJlcG9zaXRvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGNvbW1hbmRJbnZvY2F0aW9uQ291bnQgPSAwO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jICgpID0+IHRydWUsICgpID0+IHtcblx0XHRcdGNvbW1hbmRJbnZvY2F0aW9uQ291bnQrKztcblx0XHR9KTtcblx0XHRjb25zdCBwbHVnaW4gPSBjcmVhdGVQbHVnaW4oJ2ZpbGU6Ly8vdG1wL21hcmtldHBsYWNlLXJlcG8nLCAncGx1Z2lucy9teVBsdWdpbicpO1xuXG5cdFx0Y29uc3QgdXJpID0gYXdhaXQgc2VydmljZS5lbnN1cmVSZXBvc2l0b3J5KHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSwgeyBtYXJrZXRwbGFjZVR5cGU6IHBsdWdpbi5tYXJrZXRwbGFjZVR5cGUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvdG1wL21hcmtldHBsYWNlLXJlcG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tbWFuZEludm9jYXRpb25Db3VudCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkcyByZXZpc2lvbi1hd2FyZSBpbnN0YWxsIFVSSSBmb3IgZ2l0aHViIHBsdWdpbiBzb3VyY2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdXJpID0gc2VydmljZS5nZXRQbHVnaW5Tb3VyY2VJbnN0YWxsVXJpKHtcblx0XHRcdGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLFxuXHRcdFx0cmVwbzogJ293bmVyL3JlcG8nLFxuXHRcdFx0cmVmOiAncmVsZWFzZS92MScsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvY2FjaGUvYWdlbnRQbHVnaW5zL2dpdGh1Yi5jb20vb3duZXIvcmVwby9yZWZfcmVsZWFzZV92MScpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIGdpdCBwbHVnaW4gc291cmNlIGJ5IHB1bGxpbmcgYW5kIGNoZWNraW5nIG91dCByZXF1ZXN0ZWQgcmV2aXNpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKCkgPT4gdHJ1ZSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRyZXZQYXJzZTogYXN5bmMgKCkgPT4geyBjYWxscy5wdXNoKCdyZXZQYXJzZScpOyByZXR1cm4gJyc7IH0sXG5cdFx0XHRmZXRjaDogYXN5bmMgKCkgPT4geyBjYWxscy5wdXNoKCdmZXRjaCcpOyB9LFxuXHRcdFx0Y2hlY2tvdXQ6IGFzeW5jICgpID0+IHsgY2FsbHMucHVzaCgnY2hlY2tvdXQnKTsgfSxcblx0XHRcdHB1bGw6IGFzeW5jICgpID0+IHsgY2FsbHMucHVzaCgncHVsbCcpOyByZXR1cm4gZmFsc2U7IH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnVwZGF0ZVBsdWdpblNvdXJjZSh7XG5cdFx0XHRuYW1lOiAnbXktcGx1Z2luJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0c291cmNlOiAnJyxcblx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHtcblx0XHRcdFx0a2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsXG5cdFx0XHRcdHJlcG86ICdvd25lci9yZXBvJyxcblx0XHRcdFx0c2hhOiAnYTFiMmMzZDRlNWY2YTdiOGM5ZDBlMWYyYTNiNGM1ZDZlN2Y4YTliMCcsXG5cdFx0XHR9LFxuXHRcdFx0bWFya2V0cGxhY2U6ICdvd25lci9yZXBvJyxcblx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdvd25lci9yZXBvJykhLFxuXHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHR9LCB7XG5cdFx0XHRwbHVnaW5OYW1lOiAnbXktcGx1Z2luJyxcblx0XHRcdGZhaWx1cmVMYWJlbDogJ215LXBsdWdpbicsXG5cdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWydyZXZQYXJzZScsICdmZXRjaCcsICdjaGVja291dCcsICdyZXZQYXJzZSddKTtcblx0fSk7XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBjbGVhbnVwUGx1Z2luU291cmNlIFx1MjAxNCBpc3N1ZSAjMjk3MjUxIHJlZ3Jlc3Npb25cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHN1aXRlKCdjbGVhbnVwUGx1Z2luU291cmNlJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZVdpdGhEZWwoXG5cdFx0XHRvbkRlbDogKHJlc291cmNlOiBVUkkpID0+IHZvaWQsXG5cdFx0XHRvcHRpb25zPzogeyByZXNvbHZlPzogKHJlc291cmNlOiBVUkkpID0+IHsgY2hpbGRyZW4/OiB1bmtub3duW10gfSB9LFxuXHRcdCkge1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCB7IGV4ZWN1dGVDb21tYW5kOiBhc3luYyAoKSA9PiB1bmRlZmluZWQgfSBhcyB1bmtub3duIGFzIElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQbHVnaW5HaXRTZXJ2aWNlLCBzdHViUGx1Z2luR2l0KCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRW52aXJvbm1lbnRTZXJ2aWNlLCB7IGNhY2hlSG9tZTogVVJJLmZpbGUoJy9jYWNoZScpIH0gYXMgdW5rbm93biBhcyBJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIHsgY3VycmVudFByb2ZpbGU6IHsgYWdlbnRQbHVnaW5zSG9tZTogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMnKSB9IH0gYXMgdW5rbm93biBhcyBJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge1xuXHRcdFx0XHRleGlzdHM6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0XHRcdGRlbDogYXN5bmMgKHJlc291cmNlOiBVUkkpID0+IHsgb25EZWwocmVzb3VyY2UpOyB9LFxuXHRcdFx0XHRjcmVhdGVGb2xkZXI6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzb2x2ZTogYXN5bmMgKHJlc291cmNlOiBVUkkpID0+IG9wdGlvbnM/LnJlc29sdmU/LihyZXNvdXJjZSkgPz8geyBjaGlsZHJlbjogW10gfSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJRmlsZVNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90aWZpY2F0aW9uU2VydmljZSwgeyBub3RpZnk6ICgpID0+IHVuZGVmaW5lZCB9IGFzIHVua25vd24gYXMgSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCB7IHdpdGhQcm9ncmVzczogYXN5bmMgKF9vOiB1bmtub3duLCBjYjogKC4uLmE6IHVua25vd25bXSkgPT4gUHJvbWlzZTx1bmtub3duPikgPT4gY2IoKSB9IGFzIHVua25vd24gYXMgSVByb2dyZXNzU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmUuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBkZWxldGUgZmlsZXMgZm9yIHJlbGF0aXZlLXBhdGggKG1hcmtldHBsYWNlKSBwbHVnaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWxldGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2VXaXRoRGVsKHIgPT4gZGVsZXRlZC5wdXNoKHIucGF0aCkpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNsZWFudXBQbHVnaW5Tb3VyY2Uoe1xuXHRcdFx0XHRuYW1lOiAnbWFya2V0cGxhY2UtcGx1Z2luJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHR2ZXJzaW9uOiAnJyxcblx0XHRcdFx0c291cmNlOiAncGx1Z2lucy9mb28nLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncGx1Z2lucy9mb28nIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdtaWNyb3NvZnQvdnNjb2RlJykhLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxldGVzIGNhY2hlIGZvciBnaXRodWIgcGx1Z2luIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZVdpdGhEZWwociA9PiBkZWxldGVkLnB1c2goci5wYXRoKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuY2xlYW51cFBsdWdpblNvdXJjZSh7XG5cdFx0XHRcdG5hbWU6ICdnaC1wbHVnaW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0XHRzb3VyY2U6ICcnLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycgfSxcblx0XHRcdFx0bWFya2V0cGxhY2U6ICdvd25lci9tYXJrZXRwbGFjZScsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdvd25lci9tYXJrZXRwbGFjZScpISxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZC5sZW5ndGggPj0gMSk7XG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZFswXS5pbmNsdWRlcygnZ2l0aHViLmNvbS9vd25lci9yZXBvJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRlcyBwYXJlbnQgY2FjaGUgZGlyIGZvciBucG0gcGx1Z2luIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZVdpdGhEZWwociA9PiBkZWxldGVkLnB1c2goci5wYXRoKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuY2xlYW51cFBsdWdpblNvdXJjZSh7XG5cdFx0XHRcdG5hbWU6ICducG0tcGx1Z2luJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHR2ZXJzaW9uOiAnJyxcblx0XHRcdFx0c291cmNlOiAnJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgcGFja2FnZTogJ0BhY21lL3BsdWdpbicgfSxcblx0XHRcdFx0bWFya2V0cGxhY2U6ICdvd25lci9tYXJrZXRwbGFjZScsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdvd25lci9tYXJrZXRwbGFjZScpISxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZC5sZW5ndGggPj0gMSk7XG5cdFx0XHQvLyBGaXJzdCBkZWxldGUgc2hvdWxkIGJlIHRoZSBucG0vPHNhbml0aXplZC1wYWNrYWdlPiBjYWNoZSBkaXJcblx0XHRcdGFzc2VydC5vayhkZWxldGVkWzBdLmluY2x1ZGVzKCcvbnBtLycpLCBgRXhwZWN0ZWQgbnBtIHBhdGgsIGdvdDogJHtkZWxldGVkWzBdfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRlcyBjYWNoZSBmb3IgcGlwIHBsdWdpbiBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWxldGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2VXaXRoRGVsKHIgPT4gZGVsZXRlZC5wdXNoKHIucGF0aCkpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNsZWFudXBQbHVnaW5Tb3VyY2Uoe1xuXHRcdFx0XHRuYW1lOiAncGlwLXBsdWdpbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdFx0dmVyc2lvbjogJycsXG5cdFx0XHRcdHNvdXJjZTogJycsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5QaXAsIHBhY2thZ2U6ICdteS1waXAtcGtnJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogJ293bmVyL21hcmtldHBsYWNlJyxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ293bmVyL21hcmtldHBsYWNlJykhLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhkZWxldGVkLmxlbmd0aCA+PSAxKTtcblx0XHRcdGFzc2VydC5vayhkZWxldGVkWzBdLmluY2x1ZGVzKCdwaXAvbXktcGlwLXBrZycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHRocm93IHdoZW4gZGVsZXRlIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCB7IGV4ZWN1dGVDb21tYW5kOiBhc3luYyAoKSA9PiB1bmRlZmluZWQgfSBhcyB1bmtub3duIGFzIElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQbHVnaW5HaXRTZXJ2aWNlLCBzdHViUGx1Z2luR2l0KCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRW52aXJvbm1lbnRTZXJ2aWNlLCB7IGNhY2hlSG9tZTogVVJJLmZpbGUoJy9jYWNoZScpIH0gYXMgdW5rbm93biBhcyBJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIHsgY3VycmVudFByb2ZpbGU6IHsgYWdlbnRQbHVnaW5zSG9tZTogVVJJLmZpbGUoJy9jYWNoZS9hZ2VudFBsdWdpbnMnKSB9IH0gYXMgdW5rbm93biBhcyBJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge1xuXHRcdFx0XHRleGlzdHM6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0XHRcdGRlbDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3Blcm1pc3Npb24gZGVuaWVkJyk7IH0sXG5cdFx0XHRcdGNyZWF0ZUZvbGRlcjogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXNvbHZlOiBhc3luYyAoKSA9PiAoeyBjaGlsZHJlbjogW10gfSksXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUZpbGVTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIHsgbm90aWZ5OiAoKSA9PiB1bmRlZmluZWQgfSBhcyB1bmtub3duIGFzIElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2dyZXNzU2VydmljZSwgeyB3aXRoUHJvZ3Jlc3M6IGFzeW5jIChfbzogdW5rbm93biwgY2I6ICguLi5hOiB1bmtub3duW10pID0+IFByb21pc2U8dW5rbm93bj4pID0+IGNiKCkgfSBhcyB1bmtub3duIGFzIElQcm9ncmVzc1NlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSk7XG5cblx0XHRcdC8vIFNob3VsZCBub3QgdGhyb3cgXHUyMDE0IGNsZWFudXAgaXMgYmVzdC1lZmZvcnRcblx0XHRcdGF3YWl0IHNlcnZpY2UuY2xlYW51cFBsdWdpblNvdXJjZSh7XG5cdFx0XHRcdG5hbWU6ICdnaC1wbHVnaW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0XHRzb3VyY2U6ICcnLFxuXHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycgfSxcblx0XHRcdFx0bWFya2V0cGxhY2U6ICdvd25lci9tYXJrZXRwbGFjZScsXG5cdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdvd25lci9tYXJrZXRwbGFjZScpISxcblx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJ1bmVzIGVtcHR5IHBhcmVudCBkaXJlY3RvcmllcyB1cCB0byBjYWNoZSByb290JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQWZ0ZXIgZGVsZXRpbmcgZ2l0aHViLmNvbS9vd25lci9yZXBvLCB0aGUgXCJvd25lclwiIGRpciBpcyBlbXB0eVxuXHRcdFx0Ly8gYW5kIHNob3VsZCBhbHNvIGJlIHJlbW92ZWQuXG5cdFx0XHRjb25zdCBkZWxldGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2VXaXRoRGVsKFxuXHRcdFx0XHRyID0+IGRlbGV0ZWQucHVzaChyLnBhdGgpLFxuXHRcdFx0XHR7IHJlc29sdmU6ICgpID0+ICh7IGNoaWxkcmVuOiBbXSB9KSB9LFxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5jbGVhbnVwUGx1Z2luU291cmNlKHtcblx0XHRcdFx0bmFtZTogJ2doLXBsdWdpbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdFx0dmVyc2lvbjogJycsXG5cdFx0XHRcdHNvdXJjZTogJycsXG5cdFx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIHJlcG86ICdvd25lci9yZXBvJyB9LFxuXHRcdFx0XHRtYXJrZXRwbGFjZTogJ293bmVyL21hcmtldHBsYWNlJyxcblx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ293bmVyL21hcmtldHBsYWNlJykhLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFNob3VsZCBoYXZlIGRlbGV0ZWQgdGhlIHJlcG8gZGlyICsgZW1wdHkgcGFyZW50cyAob3duZXIsIGdpdGh1Yi5jb20pXG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZC5sZW5ndGggPj0gMiwgYEV4cGVjdGVkIGF0IGxlYXN0IDIgZGVsZXRpb25zIChyZXBvICsgcGFyZW50KSwgZ290ICR7ZGVsZXRlZC5sZW5ndGh9OiAke2RlbGV0ZWQuam9pbignLCAnKX1gKTtcblx0XHRcdGFzc2VydC5vayhkZWxldGVkWzBdLmluY2x1ZGVzKCdnaXRodWIuY29tL293bmVyL3JlcG8nKSwgJ0ZpcnN0IGRlbGV0ZSBzaG91bGQgYmUgdGhlIHJlcG8gZGlyJyk7XG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZC5zb21lKHAgPT4gcC5lbmRzV2l0aCgnL293bmVyJykpLCAnU2hvdWxkIHBydW5lIGVtcHR5IG93bmVyIGRpcmVjdG9yeScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcHMgcHJ1bmluZyBhdCBub24tZW1wdHkgcGFyZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVsZXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlV2l0aERlbChcblx0XHRcdFx0ciA9PiBkZWxldGVkLnB1c2goci5wYXRoKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHJlc29sdmU6IChyZXNvdXJjZTogVVJJKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBvd25lciBkaXIgc3RpbGwgaGFzIGFub3RoZXIgcmVwb1xuXHRcdFx0XHRcdFx0aWYgKHJlc291cmNlLnBhdGguZW5kc1dpdGgoJy9vd25lcicpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IGNoaWxkcmVuOiBbeyBuYW1lOiAnb3RoZXItcmVwbycgfV0gfTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiB7IGNoaWxkcmVuOiBbXSB9O1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNsZWFudXBQbHVnaW5Tb3VyY2Uoe1xuXHRcdFx0XHRuYW1lOiAnZ2gtcGx1Z2luJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHR2ZXJzaW9uOiAnJyxcblx0XHRcdFx0c291cmNlOiAnJyxcblx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nIH0sXG5cdFx0XHRcdG1hcmtldHBsYWNlOiAnb3duZXIvbWFya2V0cGxhY2UnLFxuXHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnb3duZXIvbWFya2V0cGxhY2UnKSEsXG5cdFx0XHRcdG1hcmtldHBsYWNlVHlwZTogTWFya2V0cGxhY2VUeXBlLkNvcGlsb3QsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU2hvdWxkIG9ubHkgZGVsZXRlIHRoZSByZXBvIGRpciwgc3RvcCBhdCBub24tZW1wdHkgb3duZXIgZGlyXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsZXRlZC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRlbGV0ZWRbMF0uaW5jbHVkZXMoJ2dpdGh1Yi5jb20vb3duZXIvcmVwbycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIGRlbGV0aW9uIHdoZW4gYW5vdGhlciBpbnN0YWxsZWQgcGx1Z2luIHNoYXJlcyB0aGUgc2FtZSBjbGVhbnVwIHRhcmdldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZVdpdGhEZWwociA9PiBkZWxldGVkLnB1c2goci5wYXRoKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuY2xlYW51cFBsdWdpblNvdXJjZShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6ICdwbHVnaW4tYScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0XHRcdHNvdXJjZTogJycsXG5cdFx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nLCBwYXRoOiAncGx1Z2lucy9hJyB9LFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlOiAnb3duZXIvbWFya2V0cGxhY2UnLFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdvd25lci9tYXJrZXRwbGFjZScpISxcblx0XHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBBbm90aGVyIHBsdWdpbiBmcm9tIHRoZSBzYW1lIHJlcG8gc3RpbGwgaW5zdGFsbGVkXG5cdFx0XHRcdFt7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycsIHBhdGg6ICdwbHVnaW5zL2InIH1dLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGV0ZWQubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb2NlZWRzIHdpdGggZGVsZXRpb24gd2hlbiBubyBvdGhlciBwbHVnaW4gc2hhcmVzIHRoZSBjbGVhbnVwIHRhcmdldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZVdpdGhEZWwociA9PiBkZWxldGVkLnB1c2goci5wYXRoKSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuY2xlYW51cFBsdWdpblNvdXJjZShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6ICdwbHVnaW4tYScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0XHRcdHNvdXJjZTogJycsXG5cdFx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nLCBwYXRoOiAncGx1Z2lucy9hJyB9LFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlOiAnb3duZXIvbWFya2V0cGxhY2UnLFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdvd25lci9tYXJrZXRwbGFjZScpISxcblx0XHRcdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBPbmx5IHVucmVsYXRlZCBwbHVnaW5zIHJlbWFpblxuXHRcdFx0XHRbeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ290aGVyLW93bmVyL290aGVyLXJlcG8nIH1dLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGRlbGV0ZWQubGVuZ3RoID49IDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRlbGV0ZWRbMF0uaW5jbHVkZXMoJ2dpdGh1Yi5jb20vb3duZXIvcmVwbycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb2NlZWRzIHdpdGggZGVsZXRpb24gd2hlbiBvdGhlckluc3RhbGxlZERlc2NyaXB0b3JzIGlzIGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVsZXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlV2l0aERlbChyID0+IGRlbGV0ZWQucHVzaChyLnBhdGgpKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5jbGVhbnVwUGx1Z2luU291cmNlKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ3BsdWdpbi1hJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRcdFx0dmVyc2lvbjogJycsXG5cdFx0XHRcdFx0c291cmNlOiAnJyxcblx0XHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycgfSxcblx0XHRcdFx0XHRtYXJrZXRwbGFjZTogJ293bmVyL21hcmtldHBsYWNlJyxcblx0XHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnb3duZXIvbWFya2V0cGxhY2UnKSEsXG5cdFx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHRcdFx0fSxcblx0XHRcdFx0W10sXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZC5sZW5ndGggPj0gMSk7XG5cdFx0XHRhc3NlcnQub2soZGVsZXRlZFswXS5pbmNsdWRlcygnZ2l0aHViLmNvbS9vd25lci9yZXBvJykpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsaUJBQWlCLHdCQUF3QixjQUFjLHFCQUFxQjtBQUNyRixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG9DQUFvQztBQUM3QyxTQUE2QixpQkFBaUIsMkJBQTJCLHdCQUF3QjtBQUNqRyxTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLGdDQUFnQyxNQUFNO0FBQzNDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsV0FBUyxjQUFjLFdBQTJEO0FBQ2pGLFdBQU87QUFBQSxNQUNOLGVBQWU7QUFBQSxNQUNmLGlCQUFpQixZQUFZO0FBQUEsTUFBRTtBQUFBLE1BQy9CLE1BQU0sWUFBWTtBQUFBLE1BQ2xCLFVBQVUsWUFBWTtBQUFBLE1BQUU7QUFBQSxNQUN4QixVQUFVLFlBQVk7QUFBQSxNQUN0QixPQUFPLFlBQVk7QUFBQSxNQUFFO0FBQUEsTUFDckIsaUJBQWlCLFlBQVk7QUFBQSxNQUFFO0FBQUEsTUFDL0IsY0FBYyxZQUFZO0FBQUEsTUFDMUIsR0FBRztBQUFBLElBQ0o7QUFBQSxFQUNEO0FBRUEsV0FBUyxhQUFhLGFBQXFCLFFBQW9DO0FBQzlFLFVBQU0sdUJBQXVCLDBCQUEwQixXQUFXO0FBQ2xFLFdBQU8sR0FBRyxvQkFBb0I7QUFDOUIsUUFBSSxDQUFDLHNCQUFzQjtBQUMxQixZQUFNLElBQUksTUFBTSwwQ0FBMEM7QUFBQSxJQUMzRDtBQUVBLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLGFBQWE7QUFBQSxNQUNiLFNBQVM7QUFBQSxNQUNUO0FBQUEsTUFDQSxrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixjQUFjLE1BQU0sT0FBTztBQUFBLE1BQ3RFLGFBQWEscUJBQXFCO0FBQUEsTUFDbEM7QUFBQSxNQUNBLGlCQUFpQixnQkFBZ0I7QUFBQSxJQUNsQztBQUFBLEVBQ0Q7QUFFQSxXQUFTLGNBQ1IsVUFDQSxrQkFDQSxlQUMrQjtBQUMvQixVQUFNLHVCQUF1QixNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUVyRSxVQUFNLGNBQWM7QUFBQSxNQUNuQixRQUFRLE9BQU8sYUFBa0IsV0FBVyxTQUFTLFFBQVEsSUFBSTtBQUFBLE1BQ2pFLGNBQWMsWUFBWTtBQUFBLElBQzNCO0FBRUEsVUFBTSxrQkFBa0I7QUFBQSxNQUN2QixjQUFjLE9BQU8sVUFBbUIsYUFBdUQsU0FBUztBQUFBLElBQ3pHO0FBRUEseUJBQXFCLEtBQUssaUJBQWlCO0FBQUEsTUFDMUMsZ0JBQWdCLE9BQU8sT0FBZSxTQUFvQjtBQUN6RCwyQkFBbUIsSUFBSSxHQUFHLElBQUk7QUFDOUIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQStCO0FBQy9CLHlCQUFxQixLQUFLLHFCQUFxQixFQUFFLFdBQVcsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFtQztBQUNsSCx5QkFBcUIsS0FBSyx5QkFBeUIsRUFBRSxnQkFBZ0IsRUFBRSxrQkFBa0IsSUFBSSxLQUFLLHFCQUFxQixFQUFFLEVBQUUsQ0FBdUM7QUFDbEsseUJBQXFCLEtBQUssY0FBYyxXQUFXO0FBQ25ELHlCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDM0QseUJBQXFCLEtBQUssc0JBQXNCLEVBQUUsUUFBUSxNQUFNLE9BQVUsQ0FBb0M7QUFDOUcseUJBQXFCLEtBQUssbUJBQW1CLGNBQWM7QUFBQSxNQUMxRCxHQUFHO0FBQUEsSUFDSixDQUFDLENBQUM7QUFDRix5QkFBcUIsS0FBSyxrQkFBa0IsZUFBZTtBQUMzRCx5QkFBcUIsS0FBSyxpQkFBaUIsTUFBTSxJQUFJLElBQUksdUJBQXVCLENBQUMsQ0FBQztBQUVsRixXQUFPLHFCQUFxQixlQUFlLDRCQUE0QjtBQUFBLEVBQ3hFO0FBRUEsT0FBSyxrRUFBa0UsTUFBTTtBQUM1RSxVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLFNBQVMsYUFBYSxvQkFBb0Isa0JBQWtCO0FBQ2xFLFVBQU0sTUFBTSxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixPQUFPLGVBQWU7QUFFeEYsV0FBTyxZQUFZLElBQUksTUFBTSxpREFBaUQ7QUFBQSxFQUMvRSxDQUFDO0FBRUQsT0FBSyx1RUFBdUUsTUFBTTtBQUNqRixVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLFNBQVMsYUFBYSxnQ0FBZ0Msa0JBQWtCO0FBQzlFLFVBQU0sTUFBTSxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixPQUFPLGVBQWU7QUFFeEYsV0FBTyxZQUFZLElBQUksTUFBTSxpRUFBaUU7QUFBQSxFQUMvRixDQUFDO0FBRUQsT0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLFNBQVMsYUFBYSxvQ0FBb0Msa0JBQWtCO0FBQ2xGLFVBQU0sTUFBTSxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixPQUFPLGVBQWU7QUFFeEYsV0FBTyxZQUFZLElBQUksTUFBTSwwQ0FBMEM7QUFBQSxFQUN4RSxDQUFDO0FBRUQsT0FBSywyRUFBMkUsTUFBTTtBQUNyRixVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLGtCQUFrQixhQUFhLG9CQUFvQixrQkFBa0I7QUFDM0UsVUFBTSxZQUFZLGFBQWEsMkNBQTJDLGtCQUFrQjtBQUU1RixVQUFNLGVBQWUsUUFBUSxpQkFBaUIsZ0JBQWdCLHNCQUFzQixnQkFBZ0IsZUFBZTtBQUNuSCxVQUFNLFlBQVksUUFBUSxpQkFBaUIsVUFBVSxzQkFBc0IsVUFBVSxlQUFlO0FBRXBHLFdBQU8sWUFBWSxhQUFhLE1BQU0saURBQWlEO0FBQ3ZGLFdBQU8sWUFBWSxVQUFVLE1BQU0saURBQWlEO0FBQUEsRUFDckYsQ0FBQztBQUVELE9BQUssc0RBQXNELFlBQVk7QUFDdEUsUUFBSTtBQUNKLFVBQU0sVUFBVSxjQUFjLE9BQU0sYUFBWTtBQUMvQyxvQkFBYyxTQUFTO0FBQ3ZCLGFBQU87QUFBQSxJQUNSLENBQUM7QUFDRCxVQUFNLFNBQVMsYUFBYSxvQkFBb0Isa0JBQWtCO0FBQ2xFLFVBQU0sTUFBTSxNQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLEVBQUUsaUJBQWlCLE9BQU8sZ0JBQWdCLENBQUM7QUFFbkgsV0FBTyxZQUFZLGFBQWEsaURBQWlEO0FBQ2pGLFdBQU8sWUFBWSxJQUFJLE1BQU0saURBQWlEO0FBQUEsRUFDL0UsQ0FBQztBQUVELE9BQUsseUVBQXlFLFlBQVk7QUFDekYsUUFBSSxZQUFZO0FBQ2hCLFVBQU0sVUFBVSxjQUFjLFlBQVksTUFBTSxRQUFXO0FBQUEsTUFDMUQsTUFBTSxZQUFZO0FBQ2pCO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFNBQVMsYUFBYSxvQkFBb0Isa0JBQWtCO0FBRWxFLFVBQU0sTUFBTSxNQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLEVBQUUsc0JBQXNCLElBQUksS0FBSyxLQUFLLElBQUssQ0FBQztBQUVwSCxXQUFPLGdCQUFnQixFQUFFLFdBQVcsS0FBSyxJQUFJLEtBQUssR0FBRyxFQUFFLFdBQVcsR0FBRyxLQUFLLGtEQUFrRCxDQUFDO0FBQUEsRUFDOUgsQ0FBQztBQUVELE9BQUssMkVBQTJFLFlBQVk7QUFDM0YsUUFBSSxZQUFZO0FBQ2hCLFVBQU0sVUFBVSxjQUFjLFlBQVksTUFBTSxRQUFXO0FBQUEsTUFDMUQsTUFBTSxZQUFZO0FBQ2pCO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFNBQVMsYUFBYSxvQkFBb0Isa0JBQWtCO0FBRWxFLFVBQU0sUUFBUSxpQkFBaUIsT0FBTyxzQkFBc0IsRUFBRSxzQkFBc0IsSUFBSSxLQUFLLEtBQUssSUFBSyxDQUFDO0FBQ3hHLFVBQU0sUUFBUSxpQkFBaUIsT0FBTyxzQkFBc0IsRUFBRSxzQkFBc0IsSUFBSSxLQUFLLEtBQUssSUFBSyxDQUFDO0FBRXhHLFdBQU8sWUFBWSxXQUFXLENBQUM7QUFBQSxFQUNoQyxDQUFDO0FBRUQsT0FBSyw2REFBNkQsWUFBWTtBQUM3RSxRQUFJLGFBQWE7QUFDakIsUUFBSSxhQUFhO0FBQ2pCLFFBQUksWUFBWTtBQUNoQixVQUFNLFVBQVUsY0FBYyxZQUFZLFlBQVksUUFBVztBQUFBLE1BQ2hFLGlCQUFpQixZQUFZO0FBQzVCO0FBQ0EscUJBQWE7QUFBQSxNQUNkO0FBQUEsTUFDQSxNQUFNLFlBQVk7QUFDakI7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sU0FBUyxhQUFhLG9CQUFvQixrQkFBa0I7QUFFbEUsVUFBTSxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixFQUFFLHNCQUFzQixJQUFJLEtBQUssS0FBSyxJQUFLLENBQUM7QUFDeEcsVUFBTSxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixFQUFFLHNCQUFzQixJQUFJLEtBQUssS0FBSyxJQUFLLENBQUM7QUFFeEcsV0FBTyxnQkFBZ0IsRUFBRSxZQUFZLFVBQVUsR0FBRyxFQUFFLFlBQVksR0FBRyxXQUFXLEVBQUUsQ0FBQztBQUFBLEVBQ2xGLENBQUM7QUFFRCxPQUFLLDZEQUE2RCxZQUFZO0FBQzdFLFFBQUksWUFBWTtBQUNoQixVQUFNLFVBQVUsY0FBYyxZQUFZLE1BQU0sUUFBVztBQUFBLE1BQzFELE1BQU0sWUFBWTtBQUNqQjtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxTQUFTLGFBQWEsb0JBQW9CLGtCQUFrQjtBQUVsRSxVQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLEVBQUUsc0JBQXNCLElBQUksS0FBSyxLQUFLLElBQUssQ0FBQztBQUN4RyxVQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQztBQUV2RixXQUFPLFlBQVksV0FBVyxDQUFDO0FBQUEsRUFDaEMsQ0FBQztBQUVELE9BQUssb0VBQW9FLFlBQVk7QUFDcEYsUUFBSSxZQUFZO0FBQ2hCLFVBQU0sVUFBVSxjQUFjLFlBQVksTUFBTSxRQUFXO0FBQUEsTUFDMUQsTUFBTSxZQUFZO0FBQ2pCO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFNBQVMsYUFBYSxvQkFBb0Isa0JBQWtCO0FBRWxFLFVBQU0sUUFBUSxpQkFBaUIsT0FBTyxvQkFBb0I7QUFFMUQsV0FBTyxZQUFZLFdBQVcsQ0FBQztBQUFBLEVBQ2hDLENBQUM7QUFFRCxPQUFLLHdEQUF3RCxZQUFZO0FBQ3hFLFFBQUksWUFBWTtBQUNoQixVQUFNLFVBQVUsY0FBYyxZQUFZLE1BQU0sUUFBVztBQUFBLE1BQzFELE1BQU0sWUFBWTtBQUNqQjtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxTQUFTLGFBQWEsNEJBQTRCLGtCQUFrQjtBQUUxRSxVQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQztBQUV2RixXQUFPLFlBQVksV0FBVyxDQUFDO0FBQUEsRUFDaEMsQ0FBQztBQUVELE9BQUssd0RBQXdELFlBQVk7QUFDeEUsUUFBSSxZQUFZO0FBQ2hCLFVBQU0sVUFBVSxjQUFjLFlBQVksTUFBTSxRQUFXO0FBQUEsTUFDMUQsTUFBTSxZQUFZO0FBQ2pCO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFNBQVMsYUFBYSw2REFBNkQsa0JBQWtCO0FBRTNHLFVBQU0sUUFBUSxpQkFBaUIsT0FBTyxzQkFBc0IsRUFBRSxzQkFBc0IsRUFBRSxDQUFDO0FBRXZGLFdBQU8sWUFBWSxXQUFXLENBQUM7QUFBQSxFQUNoQyxDQUFDO0FBRUQsT0FBSyxnRkFBZ0YsWUFBWTtBQUNoRyxRQUFJLFlBQVk7QUFDaEIsVUFBTSxVQUFVLGNBQWMsWUFBWSxNQUFNLFFBQVc7QUFBQSxNQUMxRCxNQUFNLFlBQVk7QUFDakI7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sU0FBUyxhQUFhLG9CQUFvQixrQkFBa0I7QUFJbEUsVUFBTSxRQUFRLGVBQWUsT0FBTyxzQkFBc0IsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUMxRSxVQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLEVBQUUsc0JBQXNCLElBQUksS0FBSyxLQUFLLElBQUssQ0FBQztBQUV4RyxXQUFPLFlBQVksV0FBVyxDQUFDO0FBQUEsRUFDaEMsQ0FBQztBQUVELE9BQUssZ0ZBQWdGLFlBQVk7QUFDaEcsUUFBSSxZQUFZO0FBQ2hCLFVBQU0sVUFBVSxjQUFjLFlBQVksTUFBTSxRQUFXO0FBQUEsTUFDMUQsTUFBTSxZQUFZO0FBQ2pCO0FBQ0EsY0FBTSxJQUFJLE1BQU0scUJBQXFCO0FBQUEsTUFDdEM7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFNBQVMsYUFBYSxvQkFBb0Isa0JBQWtCO0FBRWxFLFVBQU0sUUFBUSxNQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLEVBQUUsc0JBQXNCLElBQUksS0FBSyxLQUFLLElBQUssQ0FBQztBQUN0SCxVQUFNLFNBQVMsTUFBTSxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixFQUFFLHNCQUFzQixJQUFJLEtBQUssS0FBSyxJQUFLLENBQUM7QUFFdkgsV0FBTyxnQkFBZ0IsRUFBRSxXQUFXLE9BQU8sTUFBTSxNQUFNLFFBQVEsT0FBTyxLQUFLLEdBQUc7QUFBQSxNQUM3RSxXQUFXO0FBQUEsTUFDWCxPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsSUFDVCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpRUFBaUUsWUFBWTtBQUNqRixVQUFNLE1BQU0sTUFBTSxJQUFJLElBQUksd0JBQXdCLENBQUM7QUFDbkQsUUFBSSxpQkFBaUI7QUFDckIsVUFBTSxVQUFVLGNBQWMsWUFBWSxPQUFPLFFBQVc7QUFBQSxNQUMzRCxpQkFBaUIsT0FBTyxXQUFXLFlBQVksTUFBTSxVQUFVO0FBRTlELFlBQUksT0FBTztBQUNYLHlCQUFpQixDQUFDLENBQUMsT0FBTztBQUFBLE1BQzNCO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxTQUFTLGFBQWEsb0JBQW9CLGtCQUFrQjtBQUVsRSxVQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLEVBQUUsT0FBTyxJQUFJLE1BQU0sQ0FBQztBQUVoRixXQUFPLFlBQVksZ0JBQWdCLElBQUk7QUFBQSxFQUN4QyxDQUFDO0FBRUQsT0FBSywrQ0FBK0MsWUFBWTtBQUMvRCxRQUFJLFlBQVk7QUFDaEIsVUFBTSxVQUFVLGNBQWMsWUFBWSxNQUFNLFFBQVc7QUFBQSxNQUMxRCxNQUFNLFlBQVk7QUFDakI7QUFDQSxjQUFNLElBQUksa0JBQWtCO0FBQUEsTUFDN0I7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFNBQVMsYUFBYSxvQkFBb0Isa0JBQWtCO0FBRWxFLFVBQU0sUUFBUSxNQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLEVBQUUsc0JBQXNCLElBQUksS0FBSyxLQUFLLElBQUssQ0FBQztBQUN0SCxVQUFNLFNBQVMsTUFBTSxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixFQUFFLHNCQUFzQixJQUFJLEtBQUssS0FBSyxJQUFLLENBQUM7QUFFdkgsV0FBTyxnQkFBZ0IsRUFBRSxXQUFXLE9BQU8sTUFBTSxNQUFNLFFBQVEsT0FBTyxLQUFLLEdBQUc7QUFBQSxNQUM3RSxXQUFXO0FBQUEsTUFDWCxPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsSUFDVCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxtREFBbUQsWUFBWTtBQUNuRSxRQUFJO0FBQ0osVUFBTSx1QkFBdUIsTUFBTSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDckUseUJBQXFCLEtBQUssaUJBQWlCLEVBQUUsZ0JBQWdCLFlBQVksT0FBVSxDQUErQjtBQUNsSCx5QkFBcUIsS0FBSyxxQkFBcUIsRUFBRSxXQUFXLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBbUM7QUFDbEgseUJBQXFCLEtBQUsseUJBQXlCLEVBQUUsZ0JBQWdCLEVBQUUsa0JBQWtCLElBQUksS0FBSyxxQkFBcUIsRUFBRSxFQUFFLENBQXVDO0FBQ2xLLHlCQUFxQixLQUFLLGNBQWM7QUFBQSxNQUN2QyxRQUFRLFlBQVk7QUFBQSxNQUNwQixjQUFjLFlBQVk7QUFBQSxJQUMzQixDQUE0QjtBQUM1Qix5QkFBcUIsS0FBSyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQzNELHlCQUFxQixLQUFLLHNCQUFzQixFQUFFLFFBQVEsTUFBTSxPQUFVLENBQW9DO0FBQzlHLHlCQUFxQixLQUFLLG1CQUFtQixjQUFjO0FBQUEsTUFDMUQsaUJBQWlCLE9BQU8sV0FBVyxZQUFZLFFBQVE7QUFDdEQsb0JBQVk7QUFBQSxNQUNiO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRix5QkFBcUIsS0FBSyxrQkFBa0I7QUFBQSxNQUMzQyxjQUFjLE9BQU8sVUFBbUIsYUFBdUQsU0FBUztBQUFBLElBQ3pHLENBQWdDO0FBQ2hDLHlCQUFxQixLQUFLLGlCQUFpQixNQUFNLElBQUksSUFBSSx1QkFBdUIsQ0FBQyxDQUFDO0FBRWxGLFVBQU0sVUFBVSxxQkFBcUIsZUFBZSw0QkFBNEI7QUFDaEYsVUFBTSxTQUFTLGFBQWEsZ0NBQWdDLGtCQUFrQjtBQUM5RSxVQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLEVBQUUsaUJBQWlCLE9BQU8sZ0JBQWdCLENBQUM7QUFFdkcsV0FBTyxZQUFZLFdBQVcsYUFBYTtBQUFBLEVBQzVDLENBQUM7QUFFRCxPQUFLLDhFQUE4RSxZQUFZO0FBQzlGLFFBQUksYUFBYTtBQUNqQixVQUFNLHVCQUF1QixNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUdyRSxRQUFJLGFBQWE7QUFDakIsVUFBTSxjQUFjO0FBQUEsTUFDbkIsUUFBUSxPQUFPLGNBQW1CO0FBQUEsTUFDbEMsY0FBYyxZQUFZO0FBQUEsSUFDM0I7QUFFQSxVQUFNLGtCQUFrQjtBQUFBLE1BQ3ZCLGNBQWMsT0FBTyxVQUFtQixhQUF1RCxTQUFTO0FBQUEsSUFDekc7QUFFQSx5QkFBcUIsS0FBSyxpQkFBaUI7QUFBQSxNQUMxQyxnQkFBZ0IsWUFBWTtBQUFBLElBQzdCLENBQStCO0FBQy9CLHlCQUFxQixLQUFLLG1CQUFtQixjQUFjO0FBQUEsTUFDMUQsaUJBQWlCLFlBQVk7QUFDNUI7QUFFQSxjQUFNLElBQUksUUFBYyxPQUFLLFdBQVcsR0FBRyxDQUFDLENBQUM7QUFDN0MscUJBQWE7QUFBQSxNQUNkO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRix5QkFBcUIsS0FBSyxxQkFBcUIsRUFBRSxXQUFXLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBbUM7QUFDbEgseUJBQXFCLEtBQUsseUJBQXlCLEVBQUUsZ0JBQWdCLEVBQUUsa0JBQWtCLElBQUksS0FBSyxxQkFBcUIsRUFBRSxFQUFFLENBQXVDO0FBQ2xLLHlCQUFxQixLQUFLLGNBQWMsV0FBVztBQUNuRCx5QkFBcUIsS0FBSyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQzNELHlCQUFxQixLQUFLLHNCQUFzQixFQUFFLFFBQVEsTUFBTSxPQUFVLENBQW9DO0FBQzlHLHlCQUFxQixLQUFLLGtCQUFrQixlQUFlO0FBQzNELHlCQUFxQixLQUFLLGlCQUFpQixNQUFNLElBQUksSUFBSSx1QkFBdUIsQ0FBQyxDQUFDO0FBRWxGLFVBQU0sVUFBVSxxQkFBcUIsZUFBZSw0QkFBNEI7QUFDaEYsVUFBTSxTQUFTLGFBQWEsb0JBQW9CLGtCQUFrQjtBQUdsRSxVQUFNLENBQUMsTUFBTSxJQUFJLElBQUksTUFBTSxRQUFRLElBQUk7QUFBQSxNQUN0QyxRQUFRLGlCQUFpQixPQUFPLHNCQUFzQixFQUFFLGlCQUFpQixPQUFPLGdCQUFnQixDQUFDO0FBQUEsTUFDakcsUUFBUSxpQkFBaUIsT0FBTyxzQkFBc0IsRUFBRSxpQkFBaUIsT0FBTyxnQkFBZ0IsQ0FBQztBQUFBLElBQ2xHLENBQUM7QUFFRCxXQUFPLFlBQVksWUFBWSxDQUFDO0FBQ2hDLFdBQU8sWUFBWSxLQUFLLE1BQU0saURBQWlEO0FBQy9FLFdBQU8sWUFBWSxLQUFLLE1BQU0saURBQWlEO0FBQUEsRUFDaEYsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsVUFBTSxVQUFVLGNBQWM7QUFDOUIsVUFBTSxTQUFTLGFBQWEsb0JBQW9CLGtCQUFrQjtBQUNsRSxVQUFNLE1BQU0sUUFBUSxvQkFBb0IsTUFBTTtBQUU5QyxXQUFPLFlBQVksSUFBSSxNQUFNLGtFQUFrRTtBQUFBLEVBQ2hHLENBQUM7QUFFRCxPQUFLLDhDQUE4QyxNQUFNO0FBQ3hELFVBQU0sVUFBVSxNQUFNLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN0RCxZQUFRLE1BQU0sc0NBQXNDLEtBQUssVUFBVTtBQUFBLE1BQ2xFLDJCQUEyQjtBQUFBLFFBQzFCLGVBQWUsSUFBSSxLQUFLLDhDQUE4QztBQUFBLFFBQ3RFLGlCQUFpQixnQkFBZ0I7QUFBQSxNQUNsQztBQUFBLElBQ0QsQ0FBQyxHQUFHLGFBQWEsYUFBYSxjQUFjLE9BQU87QUFFbkQsVUFBTSx1QkFBdUIsTUFBTSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDckUseUJBQXFCLEtBQUssaUJBQWlCLEVBQUUsZ0JBQWdCLFlBQVksT0FBVSxDQUErQjtBQUNsSCx5QkFBcUIsS0FBSyxtQkFBbUIsY0FBYyxDQUFDO0FBQzVELHlCQUFxQixLQUFLLHFCQUFxQixFQUFFLFdBQVcsSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFtQztBQUNsSCx5QkFBcUIsS0FBSyx5QkFBeUIsRUFBRSxnQkFBZ0IsRUFBRSxrQkFBa0IsSUFBSSxLQUFLLHFCQUFxQixFQUFFLEVBQUUsQ0FBdUM7QUFDbEsseUJBQXFCLEtBQUssY0FBYyxFQUFFLFFBQVEsWUFBWSxLQUFLLENBQTRCO0FBQy9GLHlCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDM0QseUJBQXFCLEtBQUssc0JBQXNCLEVBQUUsUUFBUSxNQUFNLE9BQVUsQ0FBb0M7QUFDOUcseUJBQXFCLEtBQUssa0JBQWtCLEVBQUUsY0FBYyxPQUFPLFVBQW1CLGFBQXVELFNBQVMsRUFBRSxDQUFnQztBQUN4TCx5QkFBcUIsS0FBSyxpQkFBaUIsT0FBTztBQUVsRCxVQUFNLFVBQVUscUJBQXFCLGVBQWUsNEJBQTRCO0FBQ2hGLFVBQU0sU0FBUyxhQUFhLG9CQUFvQixrQkFBa0I7QUFDbEUsVUFBTSxNQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLE9BQU8sZUFBZTtBQUV4RixXQUFPLFlBQVksSUFBSSxNQUFNLDhDQUE4QztBQUFBLEVBQzVFLENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLFVBQU0sVUFBVSxjQUFjO0FBQzlCLFVBQU0sU0FBUyxhQUFhLG9CQUFvQixZQUFZO0FBRTVELFdBQU8sT0FBTyxNQUFNLFFBQVEsb0JBQW9CLE1BQU0sQ0FBQztBQUFBLEVBQ3hELENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLFVBQU0sVUFBVSxjQUFjO0FBQzlCLFVBQU0sU0FBUyxhQUFhLGdDQUFnQyxrQkFBa0I7QUFDOUUsVUFBTSxNQUFNLFFBQVEsaUJBQWlCLE9BQU8sc0JBQXNCLE9BQU8sZUFBZTtBQUV4RixXQUFPLFlBQVksSUFBSSxRQUFRLE1BQU07QUFDckMsV0FBTyxZQUFZLElBQUksTUFBTSx1QkFBdUI7QUFBQSxFQUNyRCxDQUFDO0FBRUQsT0FBSyw4RUFBOEUsWUFBWTtBQUM5RixRQUFJLHlCQUF5QjtBQUM3QixVQUFNLFVBQVUsY0FBYyxZQUFZLE1BQU0sTUFBTTtBQUNyRDtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sU0FBUyxhQUFhLGdDQUFnQyxrQkFBa0I7QUFFOUUsVUFBTSxNQUFNLE1BQU0sUUFBUSxpQkFBaUIsT0FBTyxzQkFBc0IsRUFBRSxpQkFBaUIsT0FBTyxnQkFBZ0IsQ0FBQztBQUVuSCxXQUFPLFlBQVksSUFBSSxNQUFNLHVCQUF1QjtBQUNwRCxXQUFPLFlBQVksd0JBQXdCLENBQUM7QUFBQSxFQUM3QyxDQUFDO0FBRUQsT0FBSywrREFBK0QsTUFBTTtBQUN6RSxVQUFNLFVBQVUsY0FBYztBQUM5QixVQUFNLE1BQU0sUUFBUSwwQkFBMEI7QUFBQSxNQUM3QyxNQUFNLGlCQUFpQjtBQUFBLE1BQ3ZCLE1BQU07QUFBQSxNQUNOLEtBQUs7QUFBQSxJQUNOLENBQUM7QUFFRCxXQUFPLFlBQVksSUFBSSxNQUFNLDBEQUEwRDtBQUFBLEVBQ3hGLENBQUM7QUFFRCxPQUFLLDRFQUE0RSxZQUFZO0FBQzVGLFVBQU0sUUFBa0IsQ0FBQztBQUN6QixVQUFNLFVBQVUsY0FBYyxZQUFZLE1BQU0sUUFBVztBQUFBLE1BQzFELFVBQVUsWUFBWTtBQUFFLGNBQU0sS0FBSyxVQUFVO0FBQUcsZUFBTztBQUFBLE1BQUk7QUFBQSxNQUMzRCxPQUFPLFlBQVk7QUFBRSxjQUFNLEtBQUssT0FBTztBQUFBLE1BQUc7QUFBQSxNQUMxQyxVQUFVLFlBQVk7QUFBRSxjQUFNLEtBQUssVUFBVTtBQUFBLE1BQUc7QUFBQSxNQUNoRCxNQUFNLFlBQVk7QUFBRSxjQUFNLEtBQUssTUFBTTtBQUFHLGVBQU87QUFBQSxNQUFPO0FBQUEsSUFDdkQsQ0FBQztBQUVELFVBQU0sUUFBUSxtQkFBbUI7QUFBQSxNQUNoQyxNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixTQUFTO0FBQUEsTUFDVCxRQUFRO0FBQUEsTUFDUixrQkFBa0I7QUFBQSxRQUNqQixNQUFNLGlCQUFpQjtBQUFBLFFBQ3ZCLE1BQU07QUFBQSxRQUNOLEtBQUs7QUFBQSxNQUNOO0FBQUEsTUFDQSxhQUFhO0FBQUEsTUFDYixzQkFBc0IsMEJBQTBCLFlBQVk7QUFBQSxNQUM1RCxpQkFBaUIsZ0JBQWdCO0FBQUEsSUFDbEMsR0FBRztBQUFBLE1BQ0YsWUFBWTtBQUFBLE1BQ1osY0FBYztBQUFBLE1BQ2QsaUJBQWlCLGdCQUFnQjtBQUFBLElBQ2xDLENBQUM7QUFFRCxXQUFPLGdCQUFnQixPQUFPLENBQUMsWUFBWSxTQUFTLFlBQVksVUFBVSxDQUFDO0FBQUEsRUFDNUUsQ0FBQztBQU1ELFFBQU0sdUJBQXVCLE1BQU07QUFFbEMsYUFBUyxxQkFDUixPQUNBLFNBQ0M7QUFDRCxZQUFNLHVCQUF1QixNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUNyRSwyQkFBcUIsS0FBSyxpQkFBaUIsRUFBRSxnQkFBZ0IsWUFBWSxPQUFVLENBQStCO0FBQ2xILDJCQUFxQixLQUFLLG1CQUFtQixjQUFjLENBQUM7QUFDNUQsMkJBQXFCLEtBQUsscUJBQXFCLEVBQUUsV0FBVyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQW1DO0FBQ2xILDJCQUFxQixLQUFLLHlCQUF5QixFQUFFLGdCQUFnQixFQUFFLGtCQUFrQixJQUFJLEtBQUsscUJBQXFCLEVBQUUsRUFBRSxDQUF1QztBQUNsSywyQkFBcUIsS0FBSyxjQUFjO0FBQUEsUUFDdkMsUUFBUSxZQUFZO0FBQUEsUUFDcEIsS0FBSyxPQUFPLGFBQWtCO0FBQUUsZ0JBQU0sUUFBUTtBQUFBLFFBQUc7QUFBQSxRQUNqRCxjQUFjLFlBQVk7QUFBQSxRQUMxQixTQUFTLE9BQU8sYUFBa0IsU0FBUyxVQUFVLFFBQVEsS0FBSyxFQUFFLFVBQVUsQ0FBQyxFQUFFO0FBQUEsTUFDbEYsQ0FBNEI7QUFDNUIsMkJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUMzRCwyQkFBcUIsS0FBSyxzQkFBc0IsRUFBRSxRQUFRLE1BQU0sT0FBVSxDQUFvQztBQUM5RywyQkFBcUIsS0FBSyxrQkFBa0IsRUFBRSxjQUFjLE9BQU8sSUFBYSxPQUE4QyxHQUFHLEVBQUUsQ0FBZ0M7QUFDbkssMkJBQXFCLEtBQUssaUJBQWlCLE1BQU0sSUFBSSxJQUFJLHVCQUF1QixDQUFDLENBQUM7QUFDbEYsYUFBTyxxQkFBcUIsZUFBZSw0QkFBNEI7QUFBQSxJQUN4RTtBQUVBLFNBQUssZ0VBQWdFLFlBQVk7QUFDaEYsWUFBTSxVQUFvQixDQUFDO0FBQzNCLFlBQU0sVUFBVSxxQkFBcUIsT0FBSyxRQUFRLEtBQUssRUFBRSxJQUFJLENBQUM7QUFFOUQsWUFBTSxRQUFRLG9CQUFvQjtBQUFBLFFBQ2pDLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLFNBQVM7QUFBQSxRQUNULFFBQVE7QUFBQSxRQUNSLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLGNBQWMsTUFBTSxjQUFjO0FBQUEsUUFDN0UsYUFBYTtBQUFBLFFBQ2Isc0JBQXNCLDBCQUEwQixrQkFBa0I7QUFBQSxRQUNsRSxpQkFBaUIsZ0JBQWdCO0FBQUEsTUFDbEMsQ0FBQztBQUVELGFBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUFBLElBQ3JDLENBQUM7QUFFRCxTQUFLLDBDQUEwQyxZQUFZO0FBQzFELFlBQU0sVUFBb0IsQ0FBQztBQUMzQixZQUFNLFVBQVUscUJBQXFCLE9BQUssUUFBUSxLQUFLLEVBQUUsSUFBSSxDQUFDO0FBRTlELFlBQU0sUUFBUSxvQkFBb0I7QUFBQSxRQUNqQyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixTQUFTO0FBQUEsUUFDVCxRQUFRO0FBQUEsUUFDUixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixRQUFRLE1BQU0sYUFBYTtBQUFBLFFBQ3RFLGFBQWE7QUFBQSxRQUNiLHNCQUFzQiwwQkFBMEIsbUJBQW1CO0FBQUEsUUFDbkUsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQ2xDLENBQUM7QUFFRCxhQUFPLEdBQUcsUUFBUSxVQUFVLENBQUM7QUFDN0IsYUFBTyxHQUFHLFFBQVEsQ0FBQyxFQUFFLFNBQVMsdUJBQXVCLENBQUM7QUFBQSxJQUN2RCxDQUFDO0FBRUQsU0FBSyxrREFBa0QsWUFBWTtBQUNsRSxZQUFNLFVBQW9CLENBQUM7QUFDM0IsWUFBTSxVQUFVLHFCQUFxQixPQUFLLFFBQVEsS0FBSyxFQUFFLElBQUksQ0FBQztBQUU5RCxZQUFNLFFBQVEsb0JBQW9CO0FBQUEsUUFDakMsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLFFBQ1Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsS0FBSyxTQUFTLGVBQWU7QUFBQSxRQUN4RSxhQUFhO0FBQUEsUUFDYixzQkFBc0IsMEJBQTBCLG1CQUFtQjtBQUFBLFFBQ25FLGlCQUFpQixnQkFBZ0I7QUFBQSxNQUNsQyxDQUFDO0FBRUQsYUFBTyxHQUFHLFFBQVEsVUFBVSxDQUFDO0FBRTdCLGFBQU8sR0FBRyxRQUFRLENBQUMsRUFBRSxTQUFTLE9BQU8sR0FBRywyQkFBMkIsUUFBUSxDQUFDLENBQUMsRUFBRTtBQUFBLElBQ2hGLENBQUM7QUFFRCxTQUFLLHVDQUF1QyxZQUFZO0FBQ3ZELFlBQU0sVUFBb0IsQ0FBQztBQUMzQixZQUFNLFVBQVUscUJBQXFCLE9BQUssUUFBUSxLQUFLLEVBQUUsSUFBSSxDQUFDO0FBRTlELFlBQU0sUUFBUSxvQkFBb0I7QUFBQSxRQUNqQyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixTQUFTO0FBQUEsUUFDVCxRQUFRO0FBQUEsUUFDUixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixLQUFLLFNBQVMsYUFBYTtBQUFBLFFBQ3RFLGFBQWE7QUFBQSxRQUNiLHNCQUFzQiwwQkFBMEIsbUJBQW1CO0FBQUEsUUFDbkUsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQ2xDLENBQUM7QUFFRCxhQUFPLEdBQUcsUUFBUSxVQUFVLENBQUM7QUFDN0IsYUFBTyxHQUFHLFFBQVEsQ0FBQyxFQUFFLFNBQVMsZ0JBQWdCLENBQUM7QUFBQSxJQUNoRCxDQUFDO0FBRUQsU0FBSyxvQ0FBb0MsWUFBWTtBQUNwRCxZQUFNLHVCQUF1QixNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUNyRSwyQkFBcUIsS0FBSyxpQkFBaUIsRUFBRSxnQkFBZ0IsWUFBWSxPQUFVLENBQStCO0FBQ2xILDJCQUFxQixLQUFLLG1CQUFtQixjQUFjLENBQUM7QUFDNUQsMkJBQXFCLEtBQUsscUJBQXFCLEVBQUUsV0FBVyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQW1DO0FBQ2xILDJCQUFxQixLQUFLLHlCQUF5QixFQUFFLGdCQUFnQixFQUFFLGtCQUFrQixJQUFJLEtBQUsscUJBQXFCLEVBQUUsRUFBRSxDQUF1QztBQUNsSywyQkFBcUIsS0FBSyxjQUFjO0FBQUEsUUFDdkMsUUFBUSxZQUFZO0FBQUEsUUFDcEIsS0FBSyxZQUFZO0FBQUUsZ0JBQU0sSUFBSSxNQUFNLG1CQUFtQjtBQUFBLFFBQUc7QUFBQSxRQUN6RCxjQUFjLFlBQVk7QUFBQSxRQUMxQixTQUFTLGFBQWEsRUFBRSxVQUFVLENBQUMsRUFBRTtBQUFBLE1BQ3RDLENBQTRCO0FBQzVCLDJCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDM0QsMkJBQXFCLEtBQUssc0JBQXNCLEVBQUUsUUFBUSxNQUFNLE9BQVUsQ0FBb0M7QUFDOUcsMkJBQXFCLEtBQUssa0JBQWtCLEVBQUUsY0FBYyxPQUFPLElBQWEsT0FBOEMsR0FBRyxFQUFFLENBQWdDO0FBQ25LLDJCQUFxQixLQUFLLGlCQUFpQixNQUFNLElBQUksSUFBSSx1QkFBdUIsQ0FBQyxDQUFDO0FBQ2xGLFlBQU0sVUFBVSxxQkFBcUIsZUFBZSw0QkFBNEI7QUFHaEYsWUFBTSxRQUFRLG9CQUFvQjtBQUFBLFFBQ2pDLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLFNBQVM7QUFBQSxRQUNULFFBQVE7QUFBQSxRQUNSLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLFFBQVEsTUFBTSxhQUFhO0FBQUEsUUFDdEUsYUFBYTtBQUFBLFFBQ2Isc0JBQXNCLDBCQUEwQixtQkFBbUI7QUFBQSxRQUNuRSxpQkFBaUIsZ0JBQWdCO0FBQUEsTUFDbEMsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssb0RBQW9ELFlBQVk7QUFHcEUsWUFBTSxVQUFvQixDQUFDO0FBQzNCLFlBQU0sVUFBVTtBQUFBLFFBQ2YsT0FBSyxRQUFRLEtBQUssRUFBRSxJQUFJO0FBQUEsUUFDeEIsRUFBRSxTQUFTLE9BQU8sRUFBRSxVQUFVLENBQUMsRUFBRSxHQUFHO0FBQUEsTUFDckM7QUFFQSxZQUFNLFFBQVEsb0JBQW9CO0FBQUEsUUFDakMsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLFFBQ1Isa0JBQWtCLEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxNQUFNLGFBQWE7QUFBQSxRQUN0RSxhQUFhO0FBQUEsUUFDYixzQkFBc0IsMEJBQTBCLG1CQUFtQjtBQUFBLFFBQ25FLGlCQUFpQixnQkFBZ0I7QUFBQSxNQUNsQyxDQUFDO0FBR0QsYUFBTyxHQUFHLFFBQVEsVUFBVSxHQUFHLHNEQUFzRCxRQUFRLE1BQU0sS0FBSyxRQUFRLEtBQUssSUFBSSxDQUFDLEVBQUU7QUFDNUgsYUFBTyxHQUFHLFFBQVEsQ0FBQyxFQUFFLFNBQVMsdUJBQXVCLEdBQUcscUNBQXFDO0FBQzdGLGFBQU8sR0FBRyxRQUFRLEtBQUssT0FBSyxFQUFFLFNBQVMsUUFBUSxDQUFDLEdBQUcsb0NBQW9DO0FBQUEsSUFDeEYsQ0FBQztBQUVELFNBQUsscUNBQXFDLFlBQVk7QUFDckQsWUFBTSxVQUFvQixDQUFDO0FBQzNCLFlBQU0sVUFBVTtBQUFBLFFBQ2YsT0FBSyxRQUFRLEtBQUssRUFBRSxJQUFJO0FBQUEsUUFDeEI7QUFBQSxVQUNDLFNBQVMsQ0FBQyxhQUFrQjtBQUUzQixnQkFBSSxTQUFTLEtBQUssU0FBUyxRQUFRLEdBQUc7QUFDckMscUJBQU8sRUFBRSxVQUFVLENBQUMsRUFBRSxNQUFNLGFBQWEsQ0FBQyxFQUFFO0FBQUEsWUFDN0M7QUFDQSxtQkFBTyxFQUFFLFVBQVUsQ0FBQyxFQUFFO0FBQUEsVUFDdkI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFlBQU0sUUFBUSxvQkFBb0I7QUFBQSxRQUNqQyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixTQUFTO0FBQUEsUUFDVCxRQUFRO0FBQUEsUUFDUixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixRQUFRLE1BQU0sYUFBYTtBQUFBLFFBQ3RFLGFBQWE7QUFBQSxRQUNiLHNCQUFzQiwwQkFBMEIsbUJBQW1CO0FBQUEsUUFDbkUsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQ2xDLENBQUM7QUFHRCxhQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFDcEMsYUFBTyxHQUFHLFFBQVEsQ0FBQyxFQUFFLFNBQVMsdUJBQXVCLENBQUM7QUFBQSxJQUN2RCxDQUFDO0FBRUQsU0FBSywrRUFBK0UsWUFBWTtBQUMvRixZQUFNLFVBQW9CLENBQUM7QUFDM0IsWUFBTSxVQUFVLHFCQUFxQixPQUFLLFFBQVEsS0FBSyxFQUFFLElBQUksQ0FBQztBQUU5RCxZQUFNLFFBQVE7QUFBQSxRQUNiO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixTQUFTO0FBQUEsVUFDVCxRQUFRO0FBQUEsVUFDUixrQkFBa0IsRUFBRSxNQUFNLGlCQUFpQixRQUFRLE1BQU0sY0FBYyxNQUFNLFlBQVk7QUFBQSxVQUN6RixhQUFhO0FBQUEsVUFDYixzQkFBc0IsMEJBQTBCLG1CQUFtQjtBQUFBLFVBQ25FLGlCQUFpQixnQkFBZ0I7QUFBQSxRQUNsQztBQUFBO0FBQUEsUUFFQSxDQUFDLEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxNQUFNLGNBQWMsTUFBTSxZQUFZLENBQUM7QUFBQSxNQUMxRTtBQUVBLGFBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUFBLElBQ3JDLENBQUM7QUFFRCxTQUFLLHlFQUF5RSxZQUFZO0FBQ3pGLFlBQU0sVUFBb0IsQ0FBQztBQUMzQixZQUFNLFVBQVUscUJBQXFCLE9BQUssUUFBUSxLQUFLLEVBQUUsSUFBSSxDQUFDO0FBRTlELFlBQU0sUUFBUTtBQUFBLFFBQ2I7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFNBQVM7QUFBQSxVQUNULFFBQVE7QUFBQSxVQUNSLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLFFBQVEsTUFBTSxjQUFjLE1BQU0sWUFBWTtBQUFBLFVBQ3pGLGFBQWE7QUFBQSxVQUNiLHNCQUFzQiwwQkFBMEIsbUJBQW1CO0FBQUEsVUFDbkUsaUJBQWlCLGdCQUFnQjtBQUFBLFFBQ2xDO0FBQUE7QUFBQSxRQUVBLENBQUMsRUFBRSxNQUFNLGlCQUFpQixRQUFRLE1BQU0seUJBQXlCLENBQUM7QUFBQSxNQUNuRTtBQUVBLGFBQU8sR0FBRyxRQUFRLFVBQVUsQ0FBQztBQUM3QixhQUFPLEdBQUcsUUFBUSxDQUFDLEVBQUUsU0FBUyx1QkFBdUIsQ0FBQztBQUFBLElBQ3ZELENBQUM7QUFFRCxTQUFLLGtFQUFrRSxZQUFZO0FBQ2xGLFlBQU0sVUFBb0IsQ0FBQztBQUMzQixZQUFNLFVBQVUscUJBQXFCLE9BQUssUUFBUSxLQUFLLEVBQUUsSUFBSSxDQUFDO0FBRTlELFlBQU0sUUFBUTtBQUFBLFFBQ2I7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFNBQVM7QUFBQSxVQUNULFFBQVE7QUFBQSxVQUNSLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLFFBQVEsTUFBTSxhQUFhO0FBQUEsVUFDdEUsYUFBYTtBQUFBLFVBQ2Isc0JBQXNCLDBCQUEwQixtQkFBbUI7QUFBQSxVQUNuRSxpQkFBaUIsZ0JBQWdCO0FBQUEsUUFDbEM7QUFBQSxRQUNBLENBQUM7QUFBQSxNQUNGO0FBRUEsYUFBTyxHQUFHLFFBQVEsVUFBVSxDQUFDO0FBQzdCLGFBQU8sR0FBRyxRQUFRLENBQUMsRUFBRSxTQUFTLHVCQUF1QixDQUFDO0FBQUEsSUFDdkQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
