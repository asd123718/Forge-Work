import assert from "assert";
import { timeout } from "../../../../../../base/common/async.js";
import { bufferToStream, VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Event } from "../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { joinPath } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { AGENT_PLUGIN_SCHEMA } from "../../../../../../platform/agentPlugins/common/agentPluginParser.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IRequestService } from "../../../../../../platform/request/common/request.js";
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { IEnvironmentService } from "../../../../../../platform/environment/common/environment.js";
import { IExtensionsWorkbenchService } from "../../../../extensions/common/extensions.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IAgentPluginRepositoryService } from "../../../common/plugins/agentPluginRepositoryService.js";
import { MarketplaceReferenceKind, MarketplaceType, PluginMarketplaceService, PluginSourceKind, extraKnownMarketplacesToConfigDict, getPluginSourceLabel, parseMarketplaceReference, parseMarketplaceReferences, parsePluginSource, readConfiguredMarketplaces } from "../../../common/plugins/pluginMarketplaceService.js";
import { IWorkspacePluginSettingsService } from "../../../common/plugins/workspacePluginSettingsService.js";
suite("PluginMarketplaceService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("parses GitHub shorthand marketplace", () => {
    const parsed = parseMarketplaceReference("microsoft/vscode");
    assert.ok(parsed);
    if (!parsed) {
      return;
    }
    assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitHubShorthand);
    assert.strictEqual(parsed.cloneUrl, "https://github.com/microsoft/vscode.git");
    assert.strictEqual(parsed.canonicalId, "github:microsoft/vscode");
    assert.strictEqual(parsed.displayLabel, "microsoft/vscode");
    assert.deepStrictEqual(parsed.cacheSegments, ["github.com", "microsoft", "vscode"]);
    assert.strictEqual(parsed.githubRepo, "microsoft/vscode");
  });
  test("parses GitHub shorthand marketplace with ref suffix", () => {
    const parsed = parseMarketplaceReference("microsoft/vscode#marketplace");
    assert.ok(parsed);
    if (!parsed) {
      return;
    }
    assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitHubShorthand);
    assert.strictEqual(parsed.cloneUrl, "https://github.com/microsoft/vscode.git");
    assert.strictEqual(parsed.canonicalId, "github:microsoft/vscode#marketplace");
    assert.strictEqual(parsed.displayLabel, "microsoft/vscode#marketplace");
    assert.deepStrictEqual(parsed.cacheSegments, ["github.com", "microsoft", "vscode", "ref_marketplace"]);
    assert.strictEqual(parsed.ref, "marketplace");
    assert.strictEqual(parsed.githubRepo, "microsoft/vscode");
  });
  test("parses direct HTTPS and SSH marketplaces ending in .git", () => {
    const https = parseMarketplaceReference("https://example.com/org/repo.git");
    assert.ok(https);
    if (!https) {
      return;
    }
    assert.strictEqual(https.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(https.displayLabel, "https://example.com/org/repo.git");
    assert.deepStrictEqual(https.cacheSegments, ["example.com", "org", "repo"]);
    const ssh = parseMarketplaceReference("ssh://git@example.com/org/repo.git");
    assert.ok(ssh);
    if (!ssh) {
      return;
    }
    assert.strictEqual(ssh.kind, MarketplaceReferenceKind.GitUri);
    assert.deepStrictEqual(ssh.cacheSegments, ["git@example.com", "org", "repo"]);
  });
  test("parses scp-like git URI marketplaces", () => {
    const parsed = parseMarketplaceReference("git@example.com:org/repo.git");
    assert.ok(parsed);
    if (!parsed) {
      return;
    }
    assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(parsed.cloneUrl, "git@example.com:org/repo.git");
    assert.strictEqual(parsed.canonicalId, "git:example.com/org/repo.git");
    assert.deepStrictEqual(parsed.cacheSegments, ["example.com", "org", "repo"]);
    assert.strictEqual(parsed.githubRepo, void 0);
  });
  test("parses git URI marketplaces with ref suffix", () => {
    const https = parseMarketplaceReference("https://example.com/org/repo.git#marketplace");
    assert.ok(https);
    assert.strictEqual(https?.cloneUrl, "https://example.com/org/repo.git");
    assert.strictEqual(https?.canonicalId, "git:example.com/org/repo.git#marketplace");
    assert.deepStrictEqual(https?.cacheSegments, ["example.com", "org", "repo", "ref_marketplace"]);
    assert.strictEqual(https?.ref, "marketplace");
    const scp = parseMarketplaceReference("git@example.com:org/repo.git#marketplace");
    assert.ok(scp);
    assert.strictEqual(scp?.cloneUrl, "git@example.com:org/repo.git");
    assert.strictEqual(scp?.canonicalId, "git:example.com/org/repo.git#marketplace");
    assert.deepStrictEqual(scp?.cacheSegments, ["example.com", "org", "repo", "ref_marketplace"]);
    assert.strictEqual(scp?.ref, "marketplace");
  });
  test("populates githubRepo for GitHub HTTPS URLs", () => {
    const withGit = parseMarketplaceReference("https://github.com/owner/repo.git");
    assert.ok(withGit);
    assert.strictEqual(withGit?.githubRepo, "owner/repo");
    const withoutGit = parseMarketplaceReference("https://github.com/owner/repo");
    assert.ok(withoutGit);
    assert.strictEqual(withoutGit?.githubRepo, "owner/repo");
  });
  test("populates githubRepo for GitHub SCP-style URLs", () => {
    const parsed = parseMarketplaceReference("git@github.com:owner/repo.git");
    assert.ok(parsed);
    assert.strictEqual(parsed?.githubRepo, "owner/repo");
  });
  test("does not populate githubRepo for non-GitHub URLs", () => {
    const https = parseMarketplaceReference("https://example.com/org/repo.git");
    assert.ok(https);
    assert.strictEqual(https?.githubRepo, void 0);
    const scp = parseMarketplaceReference("git@gitlab.com:org/repo.git");
    assert.ok(scp);
    assert.strictEqual(scp?.githubRepo, void 0);
  });
  test("parses local file marketplace references", () => {
    const parsed = parseMarketplaceReference("file:///tmp/marketplace-repo");
    assert.ok(parsed);
    if (!parsed) {
      return;
    }
    assert.strictEqual(parsed.kind, MarketplaceReferenceKind.LocalFileUri);
    assert.strictEqual(parsed.localRepositoryUri?.scheme, "file");
    assert.strictEqual(parsed.cloneUrl, "file:///tmp/marketplace-repo");
    assert.deepStrictEqual(parsed.cacheSegments, []);
  });
  test("accepts HTTPS and SSH marketplace entries without .git suffix", () => {
    const https = parseMarketplaceReference("https://example.com/org/repo");
    assert.ok(https);
    assert.strictEqual(https?.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(https?.canonicalId, "git:example.com/org/repo.git");
    assert.deepStrictEqual(https?.cacheSegments, ["example.com", "org", "repo"]);
    const ssh = parseMarketplaceReference("ssh://git@example.com/org/repo");
    assert.ok(ssh);
    assert.strictEqual(ssh?.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(ssh?.canonicalId, "git:git@example.com/org/repo.git");
    assert.strictEqual(parseMarketplaceReference("git@example.com:org/repo"), void 0);
  });
  test("accepts host-only HTTPS marketplace endpoints (per ADR-002 git.url is any string)", () => {
    const parsed = parseMarketplaceReference("https://plugins.internal.example.com");
    assert.ok(parsed);
    assert.strictEqual(parsed?.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(parsed?.cloneUrl, "https://plugins.internal.example.com/");
    assert.strictEqual(parsed?.canonicalId, "git:plugins.internal.example.com/");
    assert.deepStrictEqual(parsed?.cacheSegments, ["plugins.internal.example.com"]);
    assert.strictEqual(parsed?.githubRepo, void 0);
    const withSlash = parseMarketplaceReference("https://plugins.internal.example.com/");
    assert.strictEqual(withSlash?.canonicalId, "git:plugins.internal.example.com/");
  });
  test("readConfiguredMarketplaces converts policy dict to named marketplace entries", () => {
    const configService = new TestConfigurationService({
      [ChatConfiguration.ExtraMarketplaces]: {
        "acme-internal": '{"source":"https://plugins.internal.acme.com","autoUpdate":true}',
        "acme-public": '{"source":"https://copilot-plugins.acme.io","autoUpdate":false}',
        "vscode-team-kit": "microsoft/vscode-team-kit",
        "invalid": null
      }
    });
    const { extraValues, effectiveValues } = readConfiguredMarketplaces(configService);
    const refs = parseMarketplaceReferences(extraValues);
    assert.strictEqual(refs.length, 3);
    assert.deepStrictEqual(refs.map((r) => r.displayLabel), ["acme-internal", "acme-public", "vscode-team-kit"]);
    assert.strictEqual(refs[0].kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(refs[2].kind, MarketplaceReferenceKind.GitHubShorthand);
    assert.deepStrictEqual(refs.map((r) => r.autoUpdate), [true, false, void 0]);
    assert.strictEqual(effectiveValues.length, extraValues.length);
  });
  test("extraKnownMarketplacesToConfigDict: returns undefined for empty/missing input", () => {
    assert.strictEqual(extraKnownMarketplacesToConfigDict(void 0), void 0);
    assert.strictEqual(extraKnownMarketplacesToConfigDict([]), void 0);
  });
  test("extraKnownMarketplacesToConfigDict: github source becomes owner/repo shorthand", () => {
    const dict = extraKnownMarketplacesToConfigDict([
      { name: "vscode-team-kit", source: { source: "github", repo: "microsoft/vscode-team-kit" } }
    ]);
    assert.deepStrictEqual(dict, { "vscode-team-kit": "microsoft/vscode-team-kit" });
  });
  test("extraKnownMarketplacesToConfigDict: preserves explicit autoUpdate values", () => {
    const dict = extraKnownMarketplacesToConfigDict([
      { name: "always", autoUpdate: true, source: { source: "github", repo: "microsoft/always" } },
      { name: "never", autoUpdate: false, source: { source: "github", repo: "microsoft/never" } },
      { name: "default", source: { source: "github", repo: "microsoft/default" } }
    ]);
    assert.deepStrictEqual(dict, {
      always: '{"source":"microsoft/always","autoUpdate":true}',
      never: '{"source":"microsoft/never","autoUpdate":false}',
      default: "microsoft/default"
    });
  });
  test("managed autoUpdate survives a duplicate user marketplace reference", () => {
    const configService = new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: ["microsoft/plugins"],
      [ChatConfiguration.ExtraMarketplaces]: {
        managed: '{"source":"microsoft/plugins","autoUpdate":true}'
      }
    });
    const refs = parseMarketplaceReferences(readConfiguredMarketplaces(configService).effectiveValues);
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].autoUpdate, true);
  });
  test("extraKnownMarketplacesToConfigDict: github source with ref appends #ref", () => {
    const dict = extraKnownMarketplacesToConfigDict([
      { name: "team-kit-beta", source: { source: "github", repo: "microsoft/vscode-team-kit", ref: "beta" } }
    ]);
    assert.deepStrictEqual(dict, { "team-kit-beta": "microsoft/vscode-team-kit#beta" });
  });
  test("extraKnownMarketplacesToConfigDict: git source becomes raw URL (with optional #ref)", () => {
    const dict = extraKnownMarketplacesToConfigDict([
      { name: "acme-internal", source: { source: "git", url: "https://plugins.internal.acme.com" } },
      { name: "acme-tagged", source: { source: "git", url: "https://git.acme.com/plugins.git", ref: "v1" } }
    ]);
    assert.deepStrictEqual(dict, {
      "acme-internal": "https://plugins.internal.acme.com",
      "acme-tagged": "https://git.acme.com/plugins.git#v1"
    });
  });
  test("extraKnownMarketplacesToConfigDict: end-to-end policy \u2192 config dict \u2192 readConfiguredMarketplaces \u2192 parseMarketplaceReferences", () => {
    const policyEntries = [
      { name: "acme-internal", source: { source: "git", url: "https://plugins.internal.acme.com" } },
      { name: "acme-public", source: { source: "git", url: "https://copilot-plugins.acme.io" } },
      { name: "vscode-team-kit", source: { source: "github", repo: "microsoft/vscode-team-kit" } }
    ];
    const dict = extraKnownMarketplacesToConfigDict(policyEntries);
    assert.ok(dict);
    const roundTripped = JSON.parse(JSON.stringify(dict));
    const configService = new TestConfigurationService({
      [ChatConfiguration.ExtraMarketplaces]: roundTripped
    });
    const { extraValues } = readConfiguredMarketplaces(configService);
    const refs = parseMarketplaceReferences(extraValues);
    assert.strictEqual(refs.length, 3, "all three policy entries are surfaced as marketplace references");
    assert.deepStrictEqual(
      refs.map((r) => r.displayLabel),
      ["acme-internal", "acme-public", "vscode-team-kit"],
      'displayLabel must equal the policy `name` so enabledPlugins["plugin@<name>"] keys resolve'
    );
    assert.strictEqual(refs[0].kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(refs[1].kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(refs[2].kind, MarketplaceReferenceKind.GitHubShorthand);
  });
  test("parses Azure DevOps HTTPS clone URLs without .git suffix", () => {
    const parsed = parseMarketplaceReference("https://dev.azure.com/org/project/_git/repo");
    assert.ok(parsed);
    assert.strictEqual(parsed?.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(parsed?.cloneUrl, "https://dev.azure.com/org/project/_git/repo");
    assert.strictEqual(parsed?.canonicalId, "git:dev.azure.com/org/project/_git/repo.git");
    assert.deepStrictEqual(parsed?.cacheSegments, ["dev.azure.com", "org", "project", "_git", "repo"]);
  });
  test("deduplicates Azure DevOps URLs with and without .git suffix", () => {
    const parsed = parseMarketplaceReferences([
      "https://dev.azure.com/org/project/_git/repo",
      "https://dev.azure.com/org/project/_git/repo.git"
    ]);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].canonicalId, "git:dev.azure.com/org/project/_git/repo.git");
  });
  test("github.com URI form and GitHub shorthand form share the same canonicalId (policy trust comparisons must match)", () => {
    const shorthand = parseMarketplaceReference("microsoft/vscode-team-kit");
    const httpsWithGit = parseMarketplaceReference("https://github.com/microsoft/vscode-team-kit.git");
    const httpsWithoutGit = parseMarketplaceReference("https://github.com/microsoft/vscode-team-kit");
    const scp = parseMarketplaceReference("git@github.com:microsoft/vscode-team-kit.git");
    assert.ok(shorthand);
    assert.ok(httpsWithGit);
    assert.ok(httpsWithoutGit);
    assert.ok(scp);
    assert.strictEqual(httpsWithGit.canonicalId, shorthand.canonicalId);
    assert.strictEqual(httpsWithoutGit.canonicalId, shorthand.canonicalId);
    assert.strictEqual(scp.canonicalId, shorthand.canonicalId);
    const deduped = parseMarketplaceReferences([
      "microsoft/vscode-team-kit",
      "https://github.com/microsoft/vscode-team-kit.git",
      "https://github.com/microsoft/vscode-team-kit",
      "git@github.com:microsoft/vscode-team-kit.git"
    ]);
    assert.strictEqual(deduped.length, 1);
  });
  test("parses HTTPS URI with trailing slash after .git", () => {
    const parsed = parseMarketplaceReference("https://example.com/org/repo.git/");
    assert.ok(parsed);
    if (!parsed) {
      return;
    }
    assert.strictEqual(parsed.kind, MarketplaceReferenceKind.GitUri);
    assert.strictEqual(parsed.canonicalId, "git:example.com/org/repo.git");
    assert.deepStrictEqual(parsed.cacheSegments, ["example.com", "org", "repo"]);
  });
  test("deduplicates github.com URI, SSH, and shorthand to the same canonical id", () => {
    const parsed = parseMarketplaceReferences([
      "microsoft/vscode",
      "https://github.com/microsoft/vscode.git",
      "git@github.com:microsoft/vscode.git"
    ]);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].canonicalId, "github:microsoft/vscode");
  });
  test("parseMarketplaceReferences ignores invalid entries (null, numbers, malformed objects)", () => {
    const parsed = parseMarketplaceReferences([null, 42, {}, "microsoft/vscode"]);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].canonicalId, "github:microsoft/vscode");
  });
  test("parseMarketplaceReferences accepts policy-shape objects and uses name as displayLabel", () => {
    const parsed = parseMarketplaceReferences([
      { name: "vscode-team-kit", source: { source: "github", repo: "microsoft/vscode-team-kit" } },
      { name: "acme-public", source: { source: "git", url: "https://copilot-plugins.acme.io", ref: "main" } }
    ]);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].displayLabel, "vscode-team-kit");
    assert.strictEqual(parsed[0].canonicalId, "github:microsoft/vscode-team-kit");
    assert.strictEqual(parsed[1].displayLabel, "acme-public");
    assert.strictEqual(parsed[1].ref, "main");
  });
  test("treats different marketplace refs as distinct references", () => {
    const parsed = parseMarketplaceReferences([
      "microsoft/vscode#main",
      "microsoft/vscode#marketplace",
      "https://github.com/microsoft/vscode.git#marketplace"
    ]);
    assert.deepStrictEqual(parsed.map((r) => r.canonicalId), [
      "github:microsoft/vscode#main",
      "github:microsoft/vscode#marketplace"
    ]);
  });
});
suite("PluginMarketplaceService - GitHub marketplace refs", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("fetches GitHub marketplace definitions from the configured ref", async () => {
    const requestUrls = [];
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: ["microsoft/vscode#marketplace"],
      [ChatConfiguration.PluginsEnabled]: true
    }));
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IFileService, {});
    instantiationService.stub(IAgentPluginRepositoryService, {
      agentPluginsHome: URI.file("/agent-plugins"),
      ensureRepository: async () => {
        throw new Error("should not clone for 5xx responses");
      }
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IRequestService, {
      request: async (options) => {
        requestUrls.push(options.url);
        return { res: { headers: {}, statusCode: 500 }, stream: bufferToStream(VSBuffer.fromString("")) };
      }
    });
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    instantiationService.stub(IWorkspacePluginSettingsService, {
      extraMarketplaces: observableValue("test.extraMarketplaces", []),
      enabledPlugins: observableValue("test.enabledPlugins", /* @__PURE__ */ new Map())
    });
    instantiationService.stub(IWorkspaceTrustManagementService, {
      isWorkspaceTrusted: () => true,
      onDidChangeTrust: Event.None
    });
    instantiationService.stub(IExtensionsWorkbenchService, {
      getAutoUpdateValue: () => "on"
    });
    const service = store.add(instantiationService.createInstance(PluginMarketplaceService));
    await service.fetchMarketplacePlugins(CancellationToken.None);
    assert.ok(requestUrls.length > 0);
    assert.ok(requestUrls.every((url) => url.includes("/marketplace/")));
    assert.ok(requestUrls.every((url) => !url.includes("/main/")));
  });
  test("a cancelled fetch does not clear the last fetched plugins", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: ["microsoft/vscode"],
      [ChatConfiguration.PluginsEnabled]: true
    }));
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IFileService, {});
    instantiationService.stub(IAgentPluginRepositoryService, {
      agentPluginsHome: URI.file("/agent-plugins"),
      ensureRepository: async () => URI.file("/agent-plugins/github.com/microsoft/vscode")
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IRequestService, {
      request: async () => ({ res: { headers: {}, statusCode: 404 }, stream: bufferToStream(VSBuffer.fromString("")) })
    });
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    instantiationService.stub(IWorkspacePluginSettingsService, {
      extraMarketplaces: observableValue("test.extraMarketplaces", []),
      enabledPlugins: observableValue("test.enabledPlugins", /* @__PURE__ */ new Map())
    });
    instantiationService.stub(IWorkspaceTrustManagementService, {
      isWorkspaceTrusted: () => true,
      onDidChangeTrust: Event.None
    });
    instantiationService.stub(IExtensionsWorkbenchService, {
      getAutoUpdateValue: () => "on"
    });
    const service = store.add(instantiationService.createInstance(PluginMarketplaceService));
    const seeded = service.lastFetchedPlugins.get();
    const cts = store.add(new CancellationTokenSource());
    cts.cancel();
    await service.fetchMarketplacePlugins(cts.token);
    assert.deepStrictEqual(service.lastFetchedPlugins.get(), seeded);
  });
});
suite("PluginMarketplaceService - Agent Plugin direct install probes", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  class ProbeFileService {
    constructor() {
      this.files = /* @__PURE__ */ new Map();
    }
    async exists(resource) {
      return this.files.has(resource.toString());
    }
    async readFile(resource) {
      const value = this.files.get(resource.toString());
      if (value === void 0) {
        throw new Error(`Missing file: ${resource.toString()}`);
      }
      return { value: VSBuffer.fromString(value) };
    }
    createWatcher() {
      return { onDidChange: Event.None, dispose: () => {
      } };
    }
  }
  function createService(fileService) {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: [],
      [ChatConfiguration.PluginsEnabled]: true
    }));
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IAgentPluginRepositoryService, { agentPluginsHome: URI.file("/agent-plugins") });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IRequestService, {});
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    instantiationService.stub(IWorkspacePluginSettingsService, {
      extraMarketplaces: observableValue("test.extraMarketplaces", []),
      enabledPlugins: observableValue("test.enabledPlugins", /* @__PURE__ */ new Map())
    });
    instantiationService.stub(IWorkspaceTrustManagementService, {
      isWorkspaceTrusted: () => true,
      onDidChangeTrust: Event.None
    });
    instantiationService.stub(IExtensionsWorkbenchService, {
      getAutoUpdateValue: () => "off"
    });
    return store.add(instantiationService.createInstance(PluginMarketplaceService));
  }
  function seedCompatibleManifest(fileService, repoDir) {
    fileService.files.set(joinPath(repoDir, "plugin.json").toString(), JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA.replace("/1.0.0/", "/1.0.1/"),
      name: "compatible-plugin"
    }));
  }
  test("reads a Git direct-source manifest with a compatible schema revision", async () => {
    const fileService = new ProbeFileService();
    const repoDir = URI.file("/repos/compatible");
    seedCompatibleManifest(fileService, repoDir);
    const service = createService(fileService);
    const result = await service.readSinglePluginManifest(repoDir, parseMarketplaceReference("owner/compatible"));
    assert.strictEqual(result?.name, "compatible-plugin");
  });
  test("recognizes a local directory with a compatible schema revision", async () => {
    const fileService = new ProbeFileService();
    const repoDir = URI.file("/plugins/compatible");
    seedCompatibleManifest(fileService, repoDir);
    const service = createService(fileService);
    const result = await service.isPluginDirectory(repoDir);
    assert.strictEqual(result, true);
  });
});
suite("PluginMarketplaceService - getMarketplacePluginMetadata", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const marketplaceRef = parseMarketplaceReference("microsoft/plugins");
  function createService(autoUpdate = "on", extraMarketplaces = {}) {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: ["microsoft/plugins"],
      [ChatConfiguration.ExtraMarketplaces]: extraMarketplaces,
      [ChatConfiguration.PluginsEnabled]: true
    }));
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IFileService, {});
    instantiationService.stub(IAgentPluginRepositoryService, { agentPluginsHome: URI.file("/agent-plugins") });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IRequestService, {});
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    instantiationService.stub(IWorkspacePluginSettingsService, {
      extraMarketplaces: observableValue("test.extraMarketplaces", []),
      enabledPlugins: observableValue("test.enabledPlugins", /* @__PURE__ */ new Map())
    });
    instantiationService.stub(IWorkspaceTrustManagementService, {
      isWorkspaceTrusted: () => true,
      onDidChangeTrust: Event.None
    });
    instantiationService.stub(IExtensionsWorkbenchService, {
      getAutoUpdateValue: () => autoUpdate
    });
    return store.add(instantiationService.createInstance(PluginMarketplaceService));
  }
  test("returns metadata for an installed plugin", () => {
    const service = createService();
    const pluginUri = URI.file("/cache/agentPlugins/my-plugin");
    const plugin = {
      name: "my-plugin",
      description: "A test plugin",
      version: "2.0.0",
      source: "plugins/my-plugin",
      sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: "plugins/my-plugin" },
      marketplace: marketplaceRef.displayLabel,
      marketplaceReference: marketplaceRef,
      marketplaceType: MarketplaceType.Copilot
    };
    service.addInstalledPlugin(pluginUri, plugin);
    const result = service.getMarketplacePluginMetadata(pluginUri);
    assert.deepStrictEqual(result, plugin);
  });
  test("returns undefined for a URI that is not installed", () => {
    const service = createService();
    const result = service.getMarketplacePluginMetadata(URI.file("/some/other/path"));
    assert.strictEqual(result, void 0);
  });
  test("returns undefined when no plugins are installed", () => {
    const service = createService();
    const result = service.getMarketplacePluginMetadata(URI.file("/any/path"));
    assert.strictEqual(result, void 0);
  });
  test("managed marketplace autoUpdate overrides the global setting by canonical identity", () => {
    const service = createService("off", {
      always: '{"source":"microsoft/always","autoUpdate":true}',
      never: '{"source":"microsoft/never","autoUpdate":false}',
      inherited: "microsoft/inherited"
    });
    assert.deepStrictEqual({
      always: service.isMarketplaceAutoUpdateEnabled(parseMarketplaceReference("https://github.com/microsoft/always.git")),
      never: service.isMarketplaceAutoUpdateEnabled(parseMarketplaceReference("microsoft/never")),
      inherited: service.isMarketplaceAutoUpdateEnabled(parseMarketplaceReference("microsoft/inherited")),
      unmanaged: service.isMarketplaceAutoUpdateEnabled(parseMarketplaceReference("microsoft/unmanaged"))
    }, {
      always: true,
      never: false,
      inherited: false,
      unmanaged: false
    });
  });
});
suite("PluginMarketplaceService - installed plugins lifecycle", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const marketplaceRef = parseMarketplaceReference("microsoft/plugins");
  function makePlugin(name, source) {
    return {
      name,
      description: `${name} description`,
      version: "1.0.0",
      source,
      sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: source },
      marketplace: marketplaceRef.displayLabel,
      marketplaceReference: marketplaceRef,
      marketplaceType: MarketplaceType.Copilot
    };
  }
  function createService() {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: ["microsoft/plugins"],
      [ChatConfiguration.PluginsEnabled]: true
    }));
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IFileService, {});
    instantiationService.stub(IAgentPluginRepositoryService, { agentPluginsHome: URI.file("/agent-plugins") });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IRequestService, {});
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    instantiationService.stub(IWorkspacePluginSettingsService, {
      extraMarketplaces: observableValue("test.extraMarketplaces", []),
      enabledPlugins: observableValue("test.enabledPlugins", /* @__PURE__ */ new Map())
    });
    instantiationService.stub(IWorkspaceTrustManagementService, {
      isWorkspaceTrusted: () => true,
      onDidChangeTrust: Event.None
    });
    instantiationService.stub(IExtensionsWorkbenchService, {
      getAutoUpdateValue: () => "on"
    });
    return store.add(instantiationService.createInstance(PluginMarketplaceService));
  }
  test("installedPlugins observable is empty with no plugins", () => {
    const service = createService();
    assert.deepStrictEqual(service.installedPlugins.get(), []);
  });
  test("addInstalledPlugin makes plugin appear in installedPlugins", () => {
    const service = createService();
    const uri = URI.file("/agent-plugins/github.com/microsoft/plugins/my-plugin");
    const plugin = makePlugin("my-plugin", "my-plugin");
    service.addInstalledPlugin(uri, plugin);
    const installed = service.installedPlugins.get();
    assert.strictEqual(installed.length, 1);
    assert.strictEqual(installed[0].plugin.name, "my-plugin");
  });
  test("removeInstalledPlugin removes plugin from installedPlugins and metadata", () => {
    const service = createService();
    const uri = URI.file("/agent-plugins/github.com/microsoft/plugins/my-plugin");
    const plugin = makePlugin("my-plugin", "my-plugin");
    service.addInstalledPlugin(uri, plugin);
    assert.strictEqual(service.installedPlugins.get().length, 1);
    service.removeInstalledPlugin(uri);
    assert.strictEqual(service.installedPlugins.get().length, 0);
    assert.strictEqual(service.getMarketplacePluginMetadata(uri), void 0);
  });
  test("addInstalledPlugin updates metadata for existing entry", () => {
    const service = createService();
    const uri = URI.file("/agent-plugins/github.com/microsoft/plugins/my-plugin");
    const v1 = makePlugin("my-plugin", "my-plugin");
    const v2 = { ...v1, version: "2.0.0", description: "updated" };
    service.addInstalledPlugin(uri, v1);
    service.addInstalledPlugin(uri, v2);
    const installed = service.installedPlugins.get();
    assert.strictEqual(installed.length, 1);
    assert.strictEqual(installed[0].plugin.version, "2.0.0");
    assert.strictEqual(installed[0].plugin.description, "updated");
  });
  test("getMarketplacePluginMetadata finds metadata for child URI", () => {
    const service = createService();
    const uri = URI.file("/agent-plugins/github.com/microsoft/plugins");
    const plugin = makePlugin("my-plugin", "my-plugin");
    service.addInstalledPlugin(uri, plugin);
    const childUri = URI.file("/agent-plugins/github.com/microsoft/plugins/subdir/file.ts");
    const result = service.getMarketplacePluginMetadata(childUri);
    assert.strictEqual(result?.name, "my-plugin");
  });
  test("multiple plugins can be installed independently", () => {
    const service = createService();
    const uri1 = URI.file("/agent-plugins/github.com/microsoft/plugins/plugin-a");
    const uri2 = URI.file("/agent-plugins/github.com/microsoft/plugins/plugin-b");
    const pluginA = makePlugin("plugin-a", "plugin-a");
    const pluginB = makePlugin("plugin-b", "plugin-b");
    service.addInstalledPlugin(uri1, pluginA);
    service.addInstalledPlugin(uri2, pluginB);
    assert.strictEqual(service.installedPlugins.get().length, 2);
    service.removeInstalledPlugin(uri1);
    const remaining = service.installedPlugins.get();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].plugin.name, "plugin-b");
  });
});
suite("PluginMarketplaceService - hydration after restart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const CACHE_ROOT = URI.file("/agent-plugins");
  class TestFileService {
    constructor() {
      this.files = /* @__PURE__ */ new Map();
      this.folders = /* @__PURE__ */ new Set();
    }
    async exists(resource) {
      const key = resource.toString();
      return this.files.has(key) || this.folders.has(key);
    }
    async readFile(resource) {
      const key = resource.toString();
      const value = this.files.get(key);
      if (value === void 0) {
        throw new Error(`Missing file: ${key}`);
      }
      return { value: VSBuffer.fromString(value) };
    }
    async writeFile(resource, content) {
      this.files.set(resource.toString(), content.toString());
      return {};
    }
    async createFolder(resource) {
      this.folders.add(resource.toString());
      return {};
    }
    createWatcher() {
      return { onDidChange: Event.None, dispose: () => {
      } };
    }
    setFile(resource, content) {
      this.files.set(resource.toString(), content);
    }
  }
  function createPluginRepositoryStub() {
    const getRepositoryUri = (marketplace) => URI.joinPath(CACHE_ROOT, ...marketplace.cacheSegments);
    const getPluginSourceInstallUri = (descriptor) => {
      if (descriptor.kind === PluginSourceKind.GitHub) {
        const [owner, repo] = descriptor.repo.split("/");
        const base = URI.joinPath(CACHE_ROOT, "github.com", owner, repo);
        return descriptor.path ? URI.joinPath(base, descriptor.path) : base;
      }
      if (descriptor.kind === PluginSourceKind.RelativePath) {
        throw new Error("RelativePath should not reach getPluginSourceInstallUri in hydration tests");
      }
      throw new Error(`Unhandled source kind in test stub: ${descriptor.kind}`);
    };
    return {
      agentPluginsHome: CACHE_ROOT,
      getRepositoryUri,
      getPluginInstallUri: (plugin) => {
        if (plugin.sourceDescriptor.kind !== PluginSourceKind.RelativePath) {
          return getPluginSourceInstallUri(plugin.sourceDescriptor);
        }
        const repoDir = getRepositoryUri(plugin.marketplaceReference);
        return plugin.source ? URI.joinPath(repoDir, plugin.source) : repoDir;
      },
      getPluginSourceInstallUri
    };
  }
  function makeAzurePlugin(marketplaceReference) {
    return {
      name: "azure",
      description: "Microsoft Azure MCP Server and skills",
      version: "1.0.0",
      source: "",
      sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: "microsoft/azure-skills", path: ".github/plugins/azure-skills" },
      marketplace: marketplaceReference.displayLabel,
      marketplaceReference,
      marketplaceType: MarketplaceType.Copilot
    };
  }
  function storeMarketplaceCache(storageService, marketplaceReference, plugin) {
    storageService.store("chat.plugins.marketplaces.githubCache.v1", JSON.stringify({
      [marketplaceReference.canonicalId]: {
        plugins: [plugin],
        expiresAt: Date.now() + 6e4,
        referenceRawValue: marketplaceReference.rawValue
      }
    }), StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  test("hydrates a github-sourced plugin from installed.json name and marketplace cache after restart", async () => {
    const storageService = store.add(new InMemoryStorageService());
    const fileService = new TestFileService();
    const awesomeCopilot = parseMarketplaceReference("github/awesome-copilot#marketplace");
    const azurePlugin = makeAzurePlugin(awesomeCopilot);
    storeMarketplaceCache(storageService, awesomeCopilot, azurePlugin);
    const azurePluginUri = URI.joinPath(CACHE_ROOT, "github.com", "microsoft", "azure-skills", ".github", "plugins", "azure-skills");
    const installedJson = URI.joinPath(CACHE_ROOT, "installed.json");
    fileService.setFile(installedJson, JSON.stringify({
      version: 1,
      installed: [{
        pluginUri: azurePluginUri.toString(),
        marketplace: awesomeCopilot.rawValue,
        name: "azure"
      }]
    }));
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: ["github/awesome-copilot#marketplace"],
      [ChatConfiguration.PluginsEnabled]: true
    }));
    instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IAgentPluginRepositoryService, createPluginRepositoryStub());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IRequestService, {});
    instantiationService.stub(IStorageService, storageService);
    instantiationService.stub(IWorkspacePluginSettingsService, {
      extraMarketplaces: observableValue("test.extraMarketplaces", []),
      enabledPlugins: observableValue("test.enabledPlugins", /* @__PURE__ */ new Map())
    });
    instantiationService.stub(IWorkspaceTrustManagementService, {
      isWorkspaceTrusted: () => true,
      onDidChangeTrust: Event.None
    });
    instantiationService.stub(IExtensionsWorkbenchService, {
      getAutoUpdateValue: () => "on"
    });
    const service = store.add(instantiationService.createInstance(PluginMarketplaceService));
    for (let i = 0; i < 50; i++) {
      if (service.installedPlugins.get().length === 1) {
        break;
      }
      await timeout(10);
    }
    const installed = service.installedPlugins.get();
    assert.strictEqual(installed.length, 1, "azure plugin should be hydrated from marketplace data");
    assert.strictEqual(installed[0].plugin.name, "azure");
    assert.strictEqual(installed[0].plugin.sourceDescriptor.kind, PluginSourceKind.GitHub);
    assert.strictEqual(installed[0].plugin.marketplaceReference.canonicalId, awesomeCopilot.canonicalId);
  });
  test("persists plugin name when a plugin is added so it survives a restart", async () => {
    const storageService = store.add(new InMemoryStorageService());
    const fileService = new TestFileService();
    const awesomeCopilot = parseMarketplaceReference("github/awesome-copilot#marketplace");
    const azurePluginUri = URI.joinPath(CACHE_ROOT, "github.com", "microsoft", "azure-skills", ".github", "plugins", "azure-skills");
    const azurePlugin = makeAzurePlugin(awesomeCopilot);
    storeMarketplaceCache(storageService, awesomeCopilot, azurePlugin);
    function makeService() {
      const instantiationService = store.add(new TestInstantiationService());
      instantiationService.stub(IConfigurationService, new TestConfigurationService({
        [ChatConfiguration.PluginMarketplaces]: ["github/awesome-copilot#marketplace"],
        [ChatConfiguration.PluginsEnabled]: true
      }));
      instantiationService.stub(IEnvironmentService, { cacheHome: URI.file("/cache") });
      instantiationService.stub(IFileService, fileService);
      instantiationService.stub(IAgentPluginRepositoryService, createPluginRepositoryStub());
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(IRequestService, {});
      instantiationService.stub(IStorageService, storageService);
      instantiationService.stub(IWorkspacePluginSettingsService, {
        extraMarketplaces: observableValue("test.extraMarketplaces", []),
        enabledPlugins: observableValue("test.enabledPlugins", /* @__PURE__ */ new Map())
      });
      instantiationService.stub(IWorkspaceTrustManagementService, {
        isWorkspaceTrusted: () => true,
        onDidChangeTrust: Event.None
      });
      instantiationService.stub(IExtensionsWorkbenchService, {
        getAutoUpdateValue: () => "on"
      });
      return store.add(instantiationService.createInstance(PluginMarketplaceService));
    }
    const first = makeService();
    await timeout(20);
    first.addInstalledPlugin(azurePluginUri, azurePlugin);
    await timeout(200);
    const installedJson = URI.joinPath(CACHE_ROOT, "installed.json");
    const persisted = JSON.parse(fileService.files.get(installedJson.toString()));
    assert.strictEqual(persisted.installed.length, 1);
    assert.deepStrictEqual(persisted.installed[0], {
      pluginUri: azurePluginUri.toString(),
      marketplace: awesomeCopilot.rawValue,
      name: "azure"
    });
    const second = makeService();
    for (let i = 0; i < 50; i++) {
      if (second.installedPlugins.get().length === 1) {
        break;
      }
      await timeout(10);
    }
    const installed = second.installedPlugins.get();
    assert.strictEqual(installed.length, 1);
    assert.strictEqual(installed[0].plugin.name, "azure");
    assert.strictEqual(installed[0].plugin.sourceDescriptor.kind, PluginSourceKind.GitHub);
  });
});
suite("parsePluginSource", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const logContext = {
    pluginName: "test",
    logService: new NullLogService(),
    logPrefix: "[test]"
  };
  test("parses string source as RelativePath", () => {
    const result = parsePluginSource("./my-plugin", void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.RelativePath, path: "my-plugin" });
  });
  test("parses string source with pluginRoot", () => {
    const result = parsePluginSource("sub", "plugins", logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.RelativePath, path: "plugins/sub" });
  });
  test("parses undefined source as RelativePath using pluginRoot", () => {
    const result = parsePluginSource(void 0, "root", logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.RelativePath, path: "root" });
  });
  test("parses empty string source as RelativePath using pluginRoot", () => {
    const result = parsePluginSource("", "base", logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.RelativePath, path: "base" });
  });
  test("returns base dir for empty source without pluginRoot", () => {
    assert.deepStrictEqual(parsePluginSource("", void 0, logContext), { kind: PluginSourceKind.RelativePath, path: "" });
  });
  test("returns base dir for undefined source without pluginRoot", () => {
    assert.deepStrictEqual(parsePluginSource(void 0, void 0, logContext), { kind: PluginSourceKind.RelativePath, path: "" });
  });
  test("parses github object source", () => {
    const result = parsePluginSource({ source: "github", repo: "owner/repo" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitHub, repo: "owner/repo", ref: void 0, sha: void 0, path: void 0 });
  });
  test("parses github object source with ref and sha", () => {
    const result = parsePluginSource({ source: "github", repo: "owner/repo", ref: "v2.0.0", sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitHub, repo: "owner/repo", ref: "v2.0.0", sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0", path: void 0 });
  });
  test("parses github object source with path", () => {
    const result = parsePluginSource({ source: "github", repo: "owner/repo", path: "plugins/my-plugin" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitHub, repo: "owner/repo", ref: void 0, sha: void 0, path: "plugins/my-plugin" });
  });
  test("returns undefined for github source missing repo", () => {
    assert.strictEqual(parsePluginSource({ source: "github" }, void 0, logContext), void 0);
  });
  test("returns undefined for github source with invalid repo format", () => {
    assert.strictEqual(parsePluginSource({ source: "github", repo: "owner" }, void 0, logContext), void 0);
  });
  test("returns undefined for github source with invalid sha", () => {
    assert.strictEqual(parsePluginSource({ source: "github", repo: "owner/repo", sha: "abc123" }, void 0, logContext), void 0);
  });
  test("returns undefined for github source with non-string path", () => {
    assert.strictEqual(parsePluginSource({ source: "github", repo: "owner/repo", path: 42 }, void 0, logContext), void 0);
  });
  test("parses url object source", () => {
    const result = parsePluginSource({ source: "url", url: "https://gitlab.com/team/plugin.git" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitUrl, url: "https://gitlab.com/team/plugin.git", ref: void 0, sha: void 0, path: void 0 });
  });
  test("returns undefined for url source missing url field", () => {
    assert.strictEqual(parsePluginSource({ source: "url" }, void 0, logContext), void 0);
  });
  test("returns undefined for url source not ending in .git", () => {
    assert.strictEqual(parsePluginSource({ source: "url", url: "https://gitlab.com/team/plugin" }, void 0, logContext), void 0);
  });
  test("parses git-subdir object source", () => {
    const result = parsePluginSource({ source: "git-subdir", url: "https://github.com/acme/monorepo.git", path: "tools/claude-plugin" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitUrl, url: "https://github.com/acme/monorepo.git", ref: void 0, sha: void 0, path: "tools/claude-plugin" });
  });
  test("parses git-subdir object source with ref and sha", () => {
    const result = parsePluginSource({ source: "git-subdir", url: "https://example.com/repo.git", path: "plugins/foo", ref: "v2.0.0", sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitUrl, url: "https://example.com/repo.git", ref: "v2.0.0", sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0", path: "plugins/foo" });
  });
  test("parses git-subdir source without .git suffix", () => {
    const result = parsePluginSource({ source: "git-subdir", url: "https://dev.azure.com/org/project/_git/repo", path: "plugins/foo" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.GitUrl, url: "https://dev.azure.com/org/project/_git/repo", ref: void 0, sha: void 0, path: "plugins/foo" });
  });
  test("returns undefined for git-subdir source missing url field", () => {
    assert.strictEqual(parsePluginSource({ source: "git-subdir", path: "plugins/foo" }, void 0, logContext), void 0);
  });
  test("returns undefined for git-subdir source missing path field", () => {
    assert.strictEqual(parsePluginSource({ source: "git-subdir", url: "https://example.com/repo.git" }, void 0, logContext), void 0);
  });
  test("parses npm object source", () => {
    const result = parsePluginSource({ source: "npm", package: "@acme/claude-plugin" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.Npm, package: "@acme/claude-plugin", version: void 0, registry: void 0 });
  });
  test("parses npm object source with version and registry", () => {
    const result = parsePluginSource({ source: "npm", package: "@acme/claude-plugin", version: "2.1.0", registry: "https://npm.example.com" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.Npm, package: "@acme/claude-plugin", version: "2.1.0", registry: "https://npm.example.com" });
  });
  test("returns undefined for npm source missing package", () => {
    assert.strictEqual(parsePluginSource({ source: "npm" }, void 0, logContext), void 0);
  });
  test("returns undefined for npm source with non-string version", () => {
    assert.strictEqual(parsePluginSource({ source: "npm", package: "@acme/claude-plugin", version: 123 }, void 0, logContext), void 0);
  });
  test("parses pip object source", () => {
    const result = parsePluginSource({ source: "pip", package: "my-plugin" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.Pip, package: "my-plugin", version: void 0, registry: void 0 });
  });
  test("parses pip object source with version and registry", () => {
    const result = parsePluginSource({ source: "pip", package: "my-plugin", version: "1.0.0", registry: "https://pypi.example.com" }, void 0, logContext);
    assert.deepStrictEqual(result, { kind: PluginSourceKind.Pip, package: "my-plugin", version: "1.0.0", registry: "https://pypi.example.com" });
  });
  test("returns undefined for pip source missing package", () => {
    assert.strictEqual(parsePluginSource({ source: "pip" }, void 0, logContext), void 0);
  });
  test("returns undefined for pip source with non-string registry", () => {
    assert.strictEqual(parsePluginSource({ source: "pip", package: "my-plugin", registry: 42 }, void 0, logContext), void 0);
  });
  test("returns undefined for unknown source kind", () => {
    assert.strictEqual(parsePluginSource({ source: "unknown" }, void 0, logContext), void 0);
  });
  test("returns undefined for object source without source discriminant", () => {
    assert.strictEqual(parsePluginSource({ package: "test" }, void 0, logContext), void 0);
  });
});
suite("getPluginSourceLabel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("formats relative path", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.RelativePath, path: "plugins/foo" }), "plugins/foo");
  });
  test("formats empty relative path", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.RelativePath, path: "" }), ".");
  });
  test("formats github source", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.GitHub, repo: "owner/repo" }), "owner/repo");
  });
  test("formats github source with path", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.GitHub, repo: "owner/repo", path: "plugins/foo" }), "owner/repo/plugins/foo");
  });
  test("formats url source", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.GitUrl, url: "https://example.com/repo.git" }), "https://example.com/repo.git");
  });
  test("formats url source with path", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.GitUrl, url: "https://example.com/repo.git", path: "plugins/foo" }), "https://example.com/repo.git/plugins/foo");
  });
  test("formats npm source without version", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.Npm, package: "@acme/plugin" }), "@acme/plugin");
  });
  test("formats npm source with version", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.Npm, package: "@acme/plugin", version: "1.0.0" }), "@acme/plugin@1.0.0");
  });
  test("formats pip source without version", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.Pip, package: "my-plugin" }), "my-plugin");
  });
  test("formats pip source with version", () => {
    assert.strictEqual(getPluginSourceLabel({ kind: PluginSourceKind.Pip, package: "my-plugin", version: "2.0" }), "my-plugin==2.0");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccGx1Z2luc1xccGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgYnVmZmVyVG9TdHJlYW0sIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQUdFTlRfUExVR0lOX1NDSEVNQSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50UGx1Z2lucy9jb21tb24vYWdlbnRQbHVnaW5QYXJzZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIElGaWxlU3lzdGVtV2F0Y2hlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBBdXRvVXBkYXRlQ29uZmlndXJhdGlvblZhbHVlLCBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1hcmtldHBsYWNlUGx1Z2luLCBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yLCBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQsIE1hcmtldHBsYWNlVHlwZSwgUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLCBQbHVnaW5Tb3VyY2VLaW5kLCBleHRyYUtub3duTWFya2V0cGxhY2VzVG9Db25maWdEaWN0LCBnZXRQbHVnaW5Tb3VyY2VMYWJlbCwgcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSwgcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZXMsIHBhcnNlUGx1Z2luU291cmNlLCByZWFkQ29uZmlndXJlZE1hcmtldHBsYWNlcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvd29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ1BsdWdpbk1hcmtldHBsYWNlU2VydmljZScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncGFyc2VzIEdpdEh1YiBzaG9ydGhhbmQgbWFya2V0cGxhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnbWljcm9zb2Z0L3ZzY29kZScpO1xuXHRcdGFzc2VydC5vayhwYXJzZWQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdEh1YlNob3J0aGFuZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5jbG9uZVVybCwgJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLmdpdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuY2Fub25pY2FsSWQsICdnaXRodWI6bWljcm9zb2Z0L3ZzY29kZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuZGlzcGxheUxhYmVsLCAnbWljcm9zb2Z0L3ZzY29kZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLmNhY2hlU2VnbWVudHMsIFsnZ2l0aHViLmNvbScsICdtaWNyb3NvZnQnLCAndnNjb2RlJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuZ2l0aHViUmVwbywgJ21pY3Jvc29mdC92c2NvZGUnKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIEdpdEh1YiBzaG9ydGhhbmQgbWFya2V0cGxhY2Ugd2l0aCByZWYgc3VmZml4JywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ21pY3Jvc29mdC92c2NvZGUjbWFya2V0cGxhY2UnKTtcblx0XHRhc3NlcnQub2socGFyc2VkKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmtpbmQsIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5HaXRIdWJTaG9ydGhhbmQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuY2xvbmVVcmwsICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS5naXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmNhbm9uaWNhbElkLCAnZ2l0aHViOm1pY3Jvc29mdC92c2NvZGUjbWFya2V0cGxhY2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmRpc3BsYXlMYWJlbCwgJ21pY3Jvc29mdC92c2NvZGUjbWFya2V0cGxhY2UnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZC5jYWNoZVNlZ21lbnRzLCBbJ2dpdGh1Yi5jb20nLCAnbWljcm9zb2Z0JywgJ3ZzY29kZScsICdyZWZfbWFya2V0cGxhY2UnXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5yZWYsICdtYXJrZXRwbGFjZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuZ2l0aHViUmVwbywgJ21pY3Jvc29mdC92c2NvZGUnKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIGRpcmVjdCBIVFRQUyBhbmQgU1NIIG1hcmtldHBsYWNlcyBlbmRpbmcgaW4gLmdpdCcsICgpID0+IHtcblx0XHRjb25zdCBodHRwcyA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vb3JnL3JlcG8uZ2l0Jyk7XG5cdFx0YXNzZXJ0Lm9rKGh0dHBzKTtcblx0XHRpZiAoIWh0dHBzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChodHRwcy5raW5kLCBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuR2l0VXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaHR0cHMuZGlzcGxheUxhYmVsLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9vcmcvcmVwby5naXQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGh0dHBzLmNhY2hlU2VnbWVudHMsIFsnZXhhbXBsZS5jb20nLCAnb3JnJywgJ3JlcG8nXSk7XG5cblx0XHRjb25zdCBzc2ggPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdzc2g6Ly9naXRAZXhhbXBsZS5jb20vb3JnL3JlcG8uZ2l0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHNzaCk7XG5cdFx0aWYgKCFzc2gpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNzaC5raW5kLCBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuR2l0VXJpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNzaC5jYWNoZVNlZ21lbnRzLCBbJ2dpdEBleGFtcGxlLmNvbScsICdvcmcnLCAncmVwbyddKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIHNjcC1saWtlIGdpdCBVUkkgbWFya2V0cGxhY2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2dpdEBleGFtcGxlLmNvbTpvcmcvcmVwby5naXQnKTtcblx0XHRhc3NlcnQub2socGFyc2VkKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmtpbmQsIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5HaXRVcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuY2xvbmVVcmwsICdnaXRAZXhhbXBsZS5jb206b3JnL3JlcG8uZ2l0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5jYW5vbmljYWxJZCwgJ2dpdDpleGFtcGxlLmNvbS9vcmcvcmVwby5naXQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZC5jYWNoZVNlZ21lbnRzLCBbJ2V4YW1wbGUuY29tJywgJ29yZycsICdyZXBvJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuZ2l0aHViUmVwbywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIGdpdCBVUkkgbWFya2V0cGxhY2VzIHdpdGggcmVmIHN1ZmZpeCcsICgpID0+IHtcblx0XHRjb25zdCBodHRwcyA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vb3JnL3JlcG8uZ2l0I21hcmtldHBsYWNlJyk7XG5cdFx0YXNzZXJ0Lm9rKGh0dHBzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaHR0cHM/LmNsb25lVXJsLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9vcmcvcmVwby5naXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaHR0cHM/LmNhbm9uaWNhbElkLCAnZ2l0OmV4YW1wbGUuY29tL29yZy9yZXBvLmdpdCNtYXJrZXRwbGFjZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaHR0cHM/LmNhY2hlU2VnbWVudHMsIFsnZXhhbXBsZS5jb20nLCAnb3JnJywgJ3JlcG8nLCAncmVmX21hcmtldHBsYWNlJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChodHRwcz8ucmVmLCAnbWFya2V0cGxhY2UnKTtcblxuXHRcdGNvbnN0IHNjcCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2dpdEBleGFtcGxlLmNvbTpvcmcvcmVwby5naXQjbWFya2V0cGxhY2UnKTtcblx0XHRhc3NlcnQub2soc2NwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NwPy5jbG9uZVVybCwgJ2dpdEBleGFtcGxlLmNvbTpvcmcvcmVwby5naXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NwPy5jYW5vbmljYWxJZCwgJ2dpdDpleGFtcGxlLmNvbS9vcmcvcmVwby5naXQjbWFya2V0cGxhY2UnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNjcD8uY2FjaGVTZWdtZW50cywgWydleGFtcGxlLmNvbScsICdvcmcnLCAncmVwbycsICdyZWZfbWFya2V0cGxhY2UnXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjcD8ucmVmLCAnbWFya2V0cGxhY2UnKTtcblx0fSk7XG5cblx0dGVzdCgncG9wdWxhdGVzIGdpdGh1YlJlcG8gZm9yIEdpdEh1YiBIVFRQUyBVUkxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdpdGhHaXQgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby5naXQnKTtcblx0XHRhc3NlcnQub2sod2l0aEdpdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpdGhHaXQ/LmdpdGh1YlJlcG8sICdvd25lci9yZXBvJyk7XG5cblx0XHRjb25zdCB3aXRob3V0R2l0ID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8nKTtcblx0XHRhc3NlcnQub2sod2l0aG91dEdpdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpdGhvdXRHaXQ/LmdpdGh1YlJlcG8sICdvd25lci9yZXBvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BvcHVsYXRlcyBnaXRodWJSZXBvIGZvciBHaXRIdWIgU0NQLXN0eWxlIFVSTHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnZ2l0QGdpdGh1Yi5jb206b3duZXIvcmVwby5naXQnKTtcblx0XHRhc3NlcnQub2socGFyc2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkPy5naXRodWJSZXBvLCAnb3duZXIvcmVwbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBwb3B1bGF0ZSBnaXRodWJSZXBvIGZvciBub24tR2l0SHViIFVSTHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHR0cHMgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdodHRwczovL2V4YW1wbGUuY29tL29yZy9yZXBvLmdpdCcpO1xuXHRcdGFzc2VydC5vayhodHRwcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGh0dHBzPy5naXRodWJSZXBvLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3Qgc2NwID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnZ2l0QGdpdGxhYi5jb206b3JnL3JlcG8uZ2l0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHNjcCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjcD8uZ2l0aHViUmVwbywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIGxvY2FsIGZpbGUgbWFya2V0cGxhY2UgcmVmZXJlbmNlcycsICgpID0+IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdmaWxlOi8vL3RtcC9tYXJrZXRwbGFjZS1yZXBvJyk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnNlZCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5raW5kLCBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuTG9jYWxGaWxlVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmxvY2FsUmVwb3NpdG9yeVVyaT8uc2NoZW1lLCAnZmlsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuY2xvbmVVcmwsICdmaWxlOi8vL3RtcC9tYXJrZXRwbGFjZS1yZXBvJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQuY2FjaGVTZWdtZW50cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHRzIEhUVFBTIGFuZCBTU0ggbWFya2V0cGxhY2UgZW50cmllcyB3aXRob3V0IC5naXQgc3VmZml4JywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0dHBzID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9vcmcvcmVwbycpO1xuXHRcdGFzc2VydC5vayhodHRwcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGh0dHBzPy5raW5kLCBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuR2l0VXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaHR0cHM/LmNhbm9uaWNhbElkLCAnZ2l0OmV4YW1wbGUuY29tL29yZy9yZXBvLmdpdCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaHR0cHM/LmNhY2hlU2VnbWVudHMsIFsnZXhhbXBsZS5jb20nLCAnb3JnJywgJ3JlcG8nXSk7XG5cblx0XHRjb25zdCBzc2ggPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdzc2g6Ly9naXRAZXhhbXBsZS5jb20vb3JnL3JlcG8nKTtcblx0XHRhc3NlcnQub2soc3NoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3NoPy5raW5kLCBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuR2l0VXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3NoPy5jYW5vbmljYWxJZCwgJ2dpdDpnaXRAZXhhbXBsZS5jb20vb3JnL3JlcG8uZ2l0Jyk7XG5cblx0XHQvLyBTQ1Atc3R5bGUgKGdpdEBob3N0OnBhdGgpIHN0aWxsIHJlcXVpcmVzIC5naXQgYmVjYXVzZSB0aGUgY29sb24tcGF0aCBzeW50YXggaXNcblx0XHQvLyB1bmFtYmlndW91cyBvbmx5IGZvciB0cmFkaXRpb25hbCBnaXQgU1NIIFVSTHMgd2hlcmUgLmdpdCBpcyBjb252ZW50aW9uYWwuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2dpdEBleGFtcGxlLmNvbTpvcmcvcmVwbycpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHRzIGhvc3Qtb25seSBIVFRQUyBtYXJrZXRwbGFjZSBlbmRwb2ludHMgKHBlciBBRFItMDAyIGdpdC51cmwgaXMgYW55IHN0cmluZyknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnaHR0cHM6Ly9wbHVnaW5zLmludGVybmFsLmV4YW1wbGUuY29tJyk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnNlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZD8ua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdFVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZD8uY2xvbmVVcmwsICdodHRwczovL3BsdWdpbnMuaW50ZXJuYWwuZXhhbXBsZS5jb20vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZD8uY2Fub25pY2FsSWQsICdnaXQ6cGx1Z2lucy5pbnRlcm5hbC5leGFtcGxlLmNvbS8nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZD8uY2FjaGVTZWdtZW50cywgWydwbHVnaW5zLmludGVybmFsLmV4YW1wbGUuY29tJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQ/LmdpdGh1YlJlcG8sIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBUcmFpbGluZyBzbGFzaCBjb2xsYXBzZXMgdG8gdGhlIGhvc3Qtb25seSBmb3JtLlxuXHRcdGNvbnN0IHdpdGhTbGFzaCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2h0dHBzOi8vcGx1Z2lucy5pbnRlcm5hbC5leGFtcGxlLmNvbS8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2l0aFNsYXNoPy5jYW5vbmljYWxJZCwgJ2dpdDpwbHVnaW5zLmludGVybmFsLmV4YW1wbGUuY29tLycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkQ29uZmlndXJlZE1hcmtldHBsYWNlcyBjb252ZXJ0cyBwb2xpY3kgZGljdCB0byBuYW1lZCBtYXJrZXRwbGFjZSBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FeHRyYU1hcmtldHBsYWNlc106IHtcblx0XHRcdFx0J2FjbWUtaW50ZXJuYWwnOiAne1wic291cmNlXCI6XCJodHRwczovL3BsdWdpbnMuaW50ZXJuYWwuYWNtZS5jb21cIixcImF1dG9VcGRhdGVcIjp0cnVlfScsXG5cdFx0XHRcdCdhY21lLXB1YmxpYyc6ICd7XCJzb3VyY2VcIjpcImh0dHBzOi8vY29waWxvdC1wbHVnaW5zLmFjbWUuaW9cIixcImF1dG9VcGRhdGVcIjpmYWxzZX0nLFxuXHRcdFx0XHQndnNjb2RlLXRlYW0ta2l0JzogJ21pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQnLFxuXHRcdFx0XHQnaW52YWxpZCc6IG51bGwsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgZXh0cmFWYWx1ZXMsIGVmZmVjdGl2ZVZhbHVlcyB9ID0gcmVhZENvbmZpZ3VyZWRNYXJrZXRwbGFjZXMoY29uZmlnU2VydmljZSBhcyB1bmtub3duIGFzIElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcmVmcyA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzKGV4dHJhVmFsdWVzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVmcy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVmcy5tYXAociA9PiByLmRpc3BsYXlMYWJlbCksIFsnYWNtZS1pbnRlcm5hbCcsICdhY21lLXB1YmxpYycsICd2c2NvZGUtdGVhbS1raXQnXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnNbMF0ua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdFVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnNbMl0ua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdEh1YlNob3J0aGFuZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWZzLm1hcChyID0+IHIuYXV0b1VwZGF0ZSksIFt0cnVlLCBmYWxzZSwgdW5kZWZpbmVkXSk7XG5cdFx0Ly8gRWZmZWN0aXZlIHZhbHVlcyB1bmlvbiB1c2VyICsgZXh0cmFcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWZmZWN0aXZlVmFsdWVzLmxlbmd0aCwgZXh0cmFWYWx1ZXMubGVuZ3RoKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFLbm93bk1hcmtldHBsYWNlc1RvQ29uZmlnRGljdDogcmV0dXJucyB1bmRlZmluZWQgZm9yIGVtcHR5L21pc3NpbmcgaW5wdXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhS25vd25NYXJrZXRwbGFjZXNUb0NvbmZpZ0RpY3QodW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFLbm93bk1hcmtldHBsYWNlc1RvQ29uZmlnRGljdChbXSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhS25vd25NYXJrZXRwbGFjZXNUb0NvbmZpZ0RpY3Q6IGdpdGh1YiBzb3VyY2UgYmVjb21lcyBvd25lci9yZXBvIHNob3J0aGFuZCcsICgpID0+IHtcblx0XHRjb25zdCBkaWN0ID0gZXh0cmFLbm93bk1hcmtldHBsYWNlc1RvQ29uZmlnRGljdChbXG5cdFx0XHR7IG5hbWU6ICd2c2NvZGUtdGVhbS1raXQnLCBzb3VyY2U6IHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ21pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQnIH0gfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpY3QsIHsgJ3ZzY29kZS10ZWFtLWtpdCc6ICdtaWNyb3NvZnQvdnNjb2RlLXRlYW0ta2l0JyB9KTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFLbm93bk1hcmtldHBsYWNlc1RvQ29uZmlnRGljdDogcHJlc2VydmVzIGV4cGxpY2l0IGF1dG9VcGRhdGUgdmFsdWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpY3QgPSBleHRyYUtub3duTWFya2V0cGxhY2VzVG9Db25maWdEaWN0KFtcblx0XHRcdHsgbmFtZTogJ2Fsd2F5cycsIGF1dG9VcGRhdGU6IHRydWUsIHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnbWljcm9zb2Z0L2Fsd2F5cycgfSB9LFxuXHRcdFx0eyBuYW1lOiAnbmV2ZXInLCBhdXRvVXBkYXRlOiBmYWxzZSwgc291cmNlOiB7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdtaWNyb3NvZnQvbmV2ZXInIH0gfSxcblx0XHRcdHsgbmFtZTogJ2RlZmF1bHQnLCBzb3VyY2U6IHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ21pY3Jvc29mdC9kZWZhdWx0JyB9IH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWN0LCB7XG5cdFx0XHRhbHdheXM6ICd7XCJzb3VyY2VcIjpcIm1pY3Jvc29mdC9hbHdheXNcIixcImF1dG9VcGRhdGVcIjp0cnVlfScsXG5cdFx0XHRuZXZlcjogJ3tcInNvdXJjZVwiOlwibWljcm9zb2Z0L25ldmVyXCIsXCJhdXRvVXBkYXRlXCI6ZmFsc2V9Jyxcblx0XHRcdGRlZmF1bHQ6ICdtaWNyb3NvZnQvZGVmYXVsdCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbmFnZWQgYXV0b1VwZGF0ZSBzdXJ2aXZlcyBhIGR1cGxpY2F0ZSB1c2VyIG1hcmtldHBsYWNlIHJlZmVyZW5jZScsICgpID0+IHtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzXTogWydtaWNyb3NvZnQvcGx1Z2lucyddLFxuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkV4dHJhTWFya2V0cGxhY2VzXToge1xuXHRcdFx0XHRtYW5hZ2VkOiAne1wic291cmNlXCI6XCJtaWNyb3NvZnQvcGx1Z2luc1wiLFwiYXV0b1VwZGF0ZVwiOnRydWV9Jyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVmcyA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzKHJlYWRDb25maWd1cmVkTWFya2V0cGxhY2VzKGNvbmZpZ1NlcnZpY2UgYXMgdW5rbm93biBhcyBJQ29uZmlndXJhdGlvblNlcnZpY2UpLmVmZmVjdGl2ZVZhbHVlcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVmc1swXS5hdXRvVXBkYXRlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFLbm93bk1hcmtldHBsYWNlc1RvQ29uZmlnRGljdDogZ2l0aHViIHNvdXJjZSB3aXRoIHJlZiBhcHBlbmRzICNyZWYnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGljdCA9IGV4dHJhS25vd25NYXJrZXRwbGFjZXNUb0NvbmZpZ0RpY3QoW1xuXHRcdFx0eyBuYW1lOiAndGVhbS1raXQtYmV0YScsIHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnbWljcm9zb2Z0L3ZzY29kZS10ZWFtLWtpdCcsIHJlZjogJ2JldGEnIH0gfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpY3QsIHsgJ3RlYW0ta2l0LWJldGEnOiAnbWljcm9zb2Z0L3ZzY29kZS10ZWFtLWtpdCNiZXRhJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFLbm93bk1hcmtldHBsYWNlc1RvQ29uZmlnRGljdDogZ2l0IHNvdXJjZSBiZWNvbWVzIHJhdyBVUkwgKHdpdGggb3B0aW9uYWwgI3JlZiknLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGljdCA9IGV4dHJhS25vd25NYXJrZXRwbGFjZXNUb0NvbmZpZ0RpY3QoW1xuXHRcdFx0eyBuYW1lOiAnYWNtZS1pbnRlcm5hbCcsIHNvdXJjZTogeyBzb3VyY2U6ICdnaXQnLCB1cmw6ICdodHRwczovL3BsdWdpbnMuaW50ZXJuYWwuYWNtZS5jb20nIH0gfSxcblx0XHRcdHsgbmFtZTogJ2FjbWUtdGFnZ2VkJywgc291cmNlOiB7IHNvdXJjZTogJ2dpdCcsIHVybDogJ2h0dHBzOi8vZ2l0LmFjbWUuY29tL3BsdWdpbnMuZ2l0JywgcmVmOiAndjEnIH0gfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpY3QsIHtcblx0XHRcdCdhY21lLWludGVybmFsJzogJ2h0dHBzOi8vcGx1Z2lucy5pbnRlcm5hbC5hY21lLmNvbScsXG5cdFx0XHQnYWNtZS10YWdnZWQnOiAnaHR0cHM6Ly9naXQuYWNtZS5jb20vcGx1Z2lucy5naXQjdjEnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYUtub3duTWFya2V0cGxhY2VzVG9Db25maWdEaWN0OiBlbmQtdG8tZW5kIHBvbGljeSBcdTIxOTIgY29uZmlnIGRpY3QgXHUyMTkyIHJlYWRDb25maWd1cmVkTWFya2V0cGxhY2VzIFx1MjE5MiBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcycsICgpID0+IHtcblx0XHQvLyBTaW11bGF0ZXMgdGhlIGZ1bGwgQ2hhdEV4dHJhTWFya2V0cGxhY2VzIHBvbGljeSBkZWxpdmVyeSBwaXBlbGluZTpcblx0XHQvLyAgMS4gbWFuYWdlZF9zZXR0aW5ncyByZXNwb25zZSBpcyBhZGFwdGVkIGludG8gSUV4dHJhS25vd25NYXJrZXRwbGFjZUVudHJ5W11cblx0XHQvLyAgMi4gZXh0cmFLbm93bk1hcmtldHBsYWNlc1RvQ29uZmlnRGljdCBjb252ZXJ0cyB0byB0aGUgZGljdCBzaGFwZSB0aGVcblx0XHQvLyAgICAgYGNoYXQucGx1Z2lucy5leHRyYU1hcmtldHBsYWNlc2Agc2V0dGluZyBzdG9yZXNcblx0XHQvLyAgMy4gVGhlIHBvbGljeSBmcmFtZXdvcmsgc2VyaWFsaXplcy9kZXNlcmlhbGl6ZXMgdGhhdCBhcyBKU09OXG5cdFx0Ly8gIDQuIHJlYWRDb25maWd1cmVkTWFya2V0cGxhY2VzIHJldmVyc2VzIGl0IGJhY2sgdG8gbmVzdGVkIGVudHJ5IHNoYXBlXG5cdFx0Ly8gIDUuIHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzIHJlc29sdmVzIG1hcmtldHBsYWNlIHJlZmVyZW5jZXMgdGhhdFxuXHRcdC8vICAgICBwcmVzZXJ2ZSBgZGlzcGxheUxhYmVsID0gbmFtZWAgKHJlcXVpcmVkIGZvciBgcGx1Z2luQDxuYW1lPmAga2V5cylcblx0XHRjb25zdCBwb2xpY3lFbnRyaWVzID0gW1xuXHRcdFx0eyBuYW1lOiAnYWNtZS1pbnRlcm5hbCcsIHNvdXJjZTogeyBzb3VyY2U6ICdnaXQnIGFzIGNvbnN0LCB1cmw6ICdodHRwczovL3BsdWdpbnMuaW50ZXJuYWwuYWNtZS5jb20nIH0gfSxcblx0XHRcdHsgbmFtZTogJ2FjbWUtcHVibGljJywgc291cmNlOiB7IHNvdXJjZTogJ2dpdCcgYXMgY29uc3QsIHVybDogJ2h0dHBzOi8vY29waWxvdC1wbHVnaW5zLmFjbWUuaW8nIH0gfSxcblx0XHRcdHsgbmFtZTogJ3ZzY29kZS10ZWFtLWtpdCcsIHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInIGFzIGNvbnN0LCByZXBvOiAnbWljcm9zb2Z0L3ZzY29kZS10ZWFtLWtpdCcgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCBkaWN0ID0gZXh0cmFLbm93bk1hcmtldHBsYWNlc1RvQ29uZmlnRGljdChwb2xpY3lFbnRyaWVzKTtcblx0XHRhc3NlcnQub2soZGljdCk7XG5cblx0XHQvLyBKU09OIHJvdW5kLXRyaXAgbWlycm9ycyB3aGF0IEFjY291bnRQb2xpY3lTZXJ2aWNlIC8gUG9saWN5Q29uZmlndXJhdGlvbiBkby5cblx0XHRjb25zdCByb3VuZFRyaXBwZWQgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGRpY3QpKTtcblxuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FeHRyYU1hcmtldHBsYWNlc106IHJvdW5kVHJpcHBlZCxcblx0XHR9KTtcblx0XHRjb25zdCB7IGV4dHJhVmFsdWVzIH0gPSByZWFkQ29uZmlndXJlZE1hcmtldHBsYWNlcyhjb25maWdTZXJ2aWNlIGFzIHVua25vd24gYXMgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCByZWZzID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZXMoZXh0cmFWYWx1ZXMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnMubGVuZ3RoLCAzLCAnYWxsIHRocmVlIHBvbGljeSBlbnRyaWVzIGFyZSBzdXJmYWNlZCBhcyBtYXJrZXRwbGFjZSByZWZlcmVuY2VzJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHJlZnMubWFwKHIgPT4gci5kaXNwbGF5TGFiZWwpLFxuXHRcdFx0WydhY21lLWludGVybmFsJywgJ2FjbWUtcHVibGljJywgJ3ZzY29kZS10ZWFtLWtpdCddLFxuXHRcdFx0J2Rpc3BsYXlMYWJlbCBtdXN0IGVxdWFsIHRoZSBwb2xpY3kgYG5hbWVgIHNvIGVuYWJsZWRQbHVnaW5zW1wicGx1Z2luQDxuYW1lPlwiXSBrZXlzIHJlc29sdmUnLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnNbMF0ua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdFVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnNbMV0ua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdFVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnNbMl0ua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdEh1YlNob3J0aGFuZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBBenVyZSBEZXZPcHMgSFRUUFMgY2xvbmUgVVJMcyB3aXRob3V0IC5naXQgc3VmZml4JywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2h0dHBzOi8vZGV2LmF6dXJlLmNvbS9vcmcvcHJvamVjdC9fZ2l0L3JlcG8nKTtcblx0XHRhc3NlcnQub2socGFyc2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkPy5raW5kLCBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuR2l0VXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkPy5jbG9uZVVybCwgJ2h0dHBzOi8vZGV2LmF6dXJlLmNvbS9vcmcvcHJvamVjdC9fZ2l0L3JlcG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkPy5jYW5vbmljYWxJZCwgJ2dpdDpkZXYuYXp1cmUuY29tL29yZy9wcm9qZWN0L19naXQvcmVwby5naXQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZD8uY2FjaGVTZWdtZW50cywgWydkZXYuYXp1cmUuY29tJywgJ29yZycsICdwcm9qZWN0JywgJ19naXQnLCAncmVwbyddKTtcblx0fSk7XG5cblx0dGVzdCgnZGVkdXBsaWNhdGVzIEF6dXJlIERldk9wcyBVUkxzIHdpdGggYW5kIHdpdGhvdXQgLmdpdCBzdWZmaXgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZXMoW1xuXHRcdFx0J2h0dHBzOi8vZGV2LmF6dXJlLmNvbS9vcmcvcHJvamVjdC9fZ2l0L3JlcG8nLFxuXHRcdFx0J2h0dHBzOi8vZGV2LmF6dXJlLmNvbS9vcmcvcHJvamVjdC9fZ2l0L3JlcG8uZ2l0Jyxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFswXS5jYW5vbmljYWxJZCwgJ2dpdDpkZXYuYXp1cmUuY29tL29yZy9wcm9qZWN0L19naXQvcmVwby5naXQnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2l0aHViLmNvbSBVUkkgZm9ybSBhbmQgR2l0SHViIHNob3J0aGFuZCBmb3JtIHNoYXJlIHRoZSBzYW1lIGNhbm9uaWNhbElkIChwb2xpY3kgdHJ1c3QgY29tcGFyaXNvbnMgbXVzdCBtYXRjaCknLCAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogdW5kZXIgc3RyaWN0TWFya2V0cGxhY2VzLCBpc01hcmtldHBsYWNlVHJ1c3RlZCBjb21wYXJlc1xuXHRcdC8vIGNhbm9uaWNhbElkLiBBIHBsdWdpbiBkaXNjb3ZlcmVkIGZyb20gYGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLXRlYW0ta2l0LmdpdGBcblx0XHQvLyB3YXMgYmVpbmcgYmxvY2tlZCBldmVuIHRob3VnaCBgbWljcm9zb2Z0L3ZzY29kZS10ZWFtLWtpdGAgd2FzIGluIHRoZVxuXHRcdC8vIHRydXN0ZWQgbGlzdCwgYmVjYXVzZSB0aGUgVVJJIHBhcnNlciBwcm9kdWNlZCBhIGBnaXQ6YCBjYW5vbmljYWxJZFxuXHRcdC8vIHdoaWxlIHRoZSBzaG9ydGhhbmQgcGFyc2VyIHByb2R1Y2VkIGEgYGdpdGh1YjpgIG9uZS5cblx0XHRjb25zdCBzaG9ydGhhbmQgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdtaWNyb3NvZnQvdnNjb2RlLXRlYW0ta2l0Jyk7XG5cdFx0Y29uc3QgaHR0cHNXaXRoR2l0ID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQuZ2l0Jyk7XG5cdFx0Y29uc3QgaHR0cHNXaXRob3V0R2l0ID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQnKTtcblx0XHRjb25zdCBzY3AgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdnaXRAZ2l0aHViLmNvbTptaWNyb3NvZnQvdnNjb2RlLXRlYW0ta2l0LmdpdCcpO1xuXHRcdGFzc2VydC5vayhzaG9ydGhhbmQpO1xuXHRcdGFzc2VydC5vayhodHRwc1dpdGhHaXQpO1xuXHRcdGFzc2VydC5vayhodHRwc1dpdGhvdXRHaXQpO1xuXHRcdGFzc2VydC5vayhzY3ApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChodHRwc1dpdGhHaXQhLmNhbm9uaWNhbElkLCBzaG9ydGhhbmQhLmNhbm9uaWNhbElkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaHR0cHNXaXRob3V0R2l0IS5jYW5vbmljYWxJZCwgc2hvcnRoYW5kIS5jYW5vbmljYWxJZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjcCEuY2Fub25pY2FsSWQsIHNob3J0aGFuZCEuY2Fub25pY2FsSWQpO1xuXG5cdFx0Ly8gQWxsIGZvdXIgZm9ybXMgc2hvdWxkIGNvbGxhcHNlIHRvIGEgc2luZ2xlIGVudHJ5IHdoZW4gZGVkdXBsaWNhdGVkLlxuXHRcdGNvbnN0IGRlZHVwZWQgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcyhbXG5cdFx0XHQnbWljcm9zb2Z0L3ZzY29kZS10ZWFtLWtpdCcsXG5cdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQuZ2l0Jyxcblx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS10ZWFtLWtpdCcsXG5cdFx0XHQnZ2l0QGdpdGh1Yi5jb206bWljcm9zb2Z0L3ZzY29kZS10ZWFtLWtpdC5naXQnLFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWR1cGVkLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBIVFRQUyBVUkkgd2l0aCB0cmFpbGluZyBzbGFzaCBhZnRlciAuZ2l0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vb3JnL3JlcG8uZ2l0LycpO1xuXHRcdGFzc2VydC5vayhwYXJzZWQpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQua2luZCwgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdFVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5jYW5vbmljYWxJZCwgJ2dpdDpleGFtcGxlLmNvbS9vcmcvcmVwby5naXQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZC5jYWNoZVNlZ21lbnRzLCBbJ2V4YW1wbGUuY29tJywgJ29yZycsICdyZXBvJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWR1cGxpY2F0ZXMgZ2l0aHViLmNvbSBVUkksIFNTSCwgYW5kIHNob3J0aGFuZCB0byB0aGUgc2FtZSBjYW5vbmljYWwgaWQnLCAoKSA9PiB7XG5cdFx0Ly8gQWxsIHRocmVlIGZvcm1zIHJlZmVyIHRvIHRoZSBzYW1lIG1hcmtldHBsYWNlLCBzbyBwb2xpY3kgdHJ1c3Rcblx0XHQvLyBjb21wYXJpc29ucyAod2hpY2ggbWF0Y2ggYnkgY2Fub25pY2FsSWQpIG11c3QgY29sbGFwc2UgdGhlbS5cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcyhbXG5cdFx0XHQnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUuZ2l0Jyxcblx0XHRcdCdnaXRAZ2l0aHViLmNvbTptaWNyb3NvZnQvdnNjb2RlLmdpdCcsXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFswXS5jYW5vbmljYWxJZCwgJ2dpdGh1YjptaWNyb3NvZnQvdnNjb2RlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzIGlnbm9yZXMgaW52YWxpZCBlbnRyaWVzIChudWxsLCBudW1iZXJzLCBtYWxmb3JtZWQgb2JqZWN0cyknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZXMoW251bGwsIDQyLCB7fSwgJ21pY3Jvc29mdC92c2NvZGUnXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRbMF0uY2Fub25pY2FsSWQsICdnaXRodWI6bWljcm9zb2Z0L3ZzY29kZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlcyBhY2NlcHRzIHBvbGljeS1zaGFwZSBvYmplY3RzIGFuZCB1c2VzIG5hbWUgYXMgZGlzcGxheUxhYmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzKFtcblx0XHRcdHsgbmFtZTogJ3ZzY29kZS10ZWFtLWtpdCcsIHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnbWljcm9zb2Z0L3ZzY29kZS10ZWFtLWtpdCcgfSB9LFxuXHRcdFx0eyBuYW1lOiAnYWNtZS1wdWJsaWMnLCBzb3VyY2U6IHsgc291cmNlOiAnZ2l0JywgdXJsOiAnaHR0cHM6Ly9jb3BpbG90LXBsdWdpbnMuYWNtZS5pbycsIHJlZjogJ21haW4nIH0gfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFswXS5kaXNwbGF5TGFiZWwsICd2c2NvZGUtdGVhbS1raXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkWzBdLmNhbm9uaWNhbElkLCAnZ2l0aHViOm1pY3Jvc29mdC92c2NvZGUtdGVhbS1raXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkWzFdLmRpc3BsYXlMYWJlbCwgJ2FjbWUtcHVibGljJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFsxXS5yZWYsICdtYWluJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyZWF0cyBkaWZmZXJlbnQgbWFya2V0cGxhY2UgcmVmcyBhcyBkaXN0aW5jdCByZWZlcmVuY2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2VzKFtcblx0XHRcdCdtaWNyb3NvZnQvdnNjb2RlI21haW4nLFxuXHRcdFx0J21pY3Jvc29mdC92c2NvZGUjbWFya2V0cGxhY2UnLFxuXHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLmdpdCNtYXJrZXRwbGFjZScsXG5cdFx0XSk7XG5cblx0XHQvLyBgaHR0cHM6Ly9naXRodWIuY29tLy4uLiNtYXJrZXRwbGFjZWAgY29sbGFwc2VzIHdpdGggdGhlIHNob3J0aGFuZFxuXHRcdC8vIChzYW1lIGNhbm9uaWNhbCBpZCksIHNvIHdlIGV4cGVjdCAyIGRpc3RpbmN0IHJlZnMgbm90IDMuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQubWFwKHIgPT4gci5jYW5vbmljYWxJZCksIFtcblx0XHRcdCdnaXRodWI6bWljcm9zb2Z0L3ZzY29kZSNtYWluJyxcblx0XHRcdCdnaXRodWI6bWljcm9zb2Z0L3ZzY29kZSNtYXJrZXRwbGFjZScsXG5cdFx0XSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgLSBHaXRIdWIgbWFya2V0cGxhY2UgcmVmcycsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmZXRjaGVzIEdpdEh1YiBtYXJrZXRwbGFjZSBkZWZpbml0aW9ucyBmcm9tIHRoZSBjb25maWd1cmVkIHJlZicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0VXJsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5NYXJrZXRwbGFjZXNdOiBbJ21pY3Jvc29mdC92c2NvZGUjbWFya2V0cGxhY2UnXSxcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5zRW5hYmxlZF06IHRydWUsXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwgeyBjYWNoZUhvbWU6IFVSSS5maWxlKCcvY2FjaGUnKSB9IGFzIFBhcnRpYWw8SUVudmlyb25tZW50U2VydmljZT4gYXMgSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIHt9IGFzIHVua25vd24gYXMgSUZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLCB7XG5cdFx0XHRhZ2VudFBsdWdpbnNIb21lOiBVUkkuZmlsZSgnL2FnZW50LXBsdWdpbnMnKSxcblx0XHRcdGVuc3VyZVJlcG9zaXRvcnk6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdzaG91bGQgbm90IGNsb25lIGZvciA1eHggcmVzcG9uc2VzJyk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgUGFydGlhbDxJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZT4gYXMgSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZXF1ZXN0U2VydmljZSwge1xuXHRcdFx0cmVxdWVzdDogYXN5bmMgKG9wdGlvbnM6IHsgdXJsOiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0XHRyZXF1ZXN0VXJscy5wdXNoKG9wdGlvbnMudXJsKTtcblx0XHRcdFx0cmV0dXJuIHsgcmVzOiB7IGhlYWRlcnM6IHt9LCBzdGF0dXNDb2RlOiA1MDAgfSwgc3RyZWFtOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSkgfTtcblx0XHRcdH0sXG5cdFx0fSBhcyBQYXJ0aWFsPElSZXF1ZXN0U2VydmljZT4gYXMgSVJlcXVlc3RTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmUuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UsIHtcblx0XHRcdGV4dHJhTWFya2V0cGxhY2VzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuZXh0cmFNYXJrZXRwbGFjZXMnLCBbXSksXG5cdFx0XHRlbmFibGVkUGx1Z2luczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmVuYWJsZWRQbHVnaW5zJywgbmV3IE1hcCgpKSxcblx0XHR9IGFzIFBhcnRpYWw8SVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZT4gYXMgSVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwge1xuXHRcdFx0aXNXb3Jrc3BhY2VUcnVzdGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0b25EaWRDaGFuZ2VUcnVzdDogRXZlbnQuTm9uZSxcblx0XHR9IGFzIFBhcnRpYWw8SVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U+IGFzIElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwge1xuXHRcdFx0Z2V0QXV0b1VwZGF0ZVZhbHVlOiAoKSA9PiAnb24nLFxuXHRcdH0gYXMgUGFydGlhbDxJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U+IGFzIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBsdWdpbk1hcmtldHBsYWNlU2VydmljZSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmV0Y2hNYXJrZXRwbGFjZVBsdWdpbnMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQub2socmVxdWVzdFVybHMubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHJlcXVlc3RVcmxzLmV2ZXJ5KHVybCA9PiB1cmwuaW5jbHVkZXMoJy9tYXJrZXRwbGFjZS8nKSkpO1xuXHRcdGFzc2VydC5vayhyZXF1ZXN0VXJscy5ldmVyeSh1cmwgPT4gIXVybC5pbmNsdWRlcygnL21haW4vJykpKTtcblx0fSk7XG5cblx0dGVzdCgnYSBjYW5jZWxsZWQgZmV0Y2ggZG9lcyBub3QgY2xlYXIgdGhlIGxhc3QgZmV0Y2hlZCBwbHVnaW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbk1hcmtldHBsYWNlc106IFsnbWljcm9zb2Z0L3ZzY29kZSddLFxuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbnNFbmFibGVkXTogdHJ1ZSxcblx0XHR9KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRW52aXJvbm1lbnRTZXJ2aWNlLCB7IGNhY2hlSG9tZTogVVJJLmZpbGUoJy9jYWNoZScpIH0gYXMgUGFydGlhbDxJRW52aXJvbm1lbnRTZXJ2aWNlPiBhcyBJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge30gYXMgdW5rbm93biBhcyBJRmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UsIHtcblx0XHRcdGFnZW50UGx1Z2luc0hvbWU6IFVSSS5maWxlKCcvYWdlbnQtcGx1Z2lucycpLFxuXHRcdFx0ZW5zdXJlUmVwb3NpdG9yeTogYXN5bmMgKCkgPT4gVVJJLmZpbGUoJy9hZ2VudC1wbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScpLFxuXHRcdH0gYXMgUGFydGlhbDxJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZT4gYXMgSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZXF1ZXN0U2VydmljZSwge1xuXHRcdFx0cmVxdWVzdDogYXN5bmMgKCkgPT4gKHsgcmVzOiB7IGhlYWRlcnM6IHt9LCBzdGF0dXNDb2RlOiA0MDQgfSwgc3RyZWFtOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSkgfSksXG5cdFx0fSBhcyBQYXJ0aWFsPElSZXF1ZXN0U2VydmljZT4gYXMgSVJlcXVlc3RTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmUuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UsIHtcblx0XHRcdGV4dHJhTWFya2V0cGxhY2VzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuZXh0cmFNYXJrZXRwbGFjZXMnLCBbXSksXG5cdFx0XHRlbmFibGVkUGx1Z2luczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmVuYWJsZWRQbHVnaW5zJywgbmV3IE1hcCgpKSxcblx0XHR9IGFzIFBhcnRpYWw8SVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZT4gYXMgSVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwge1xuXHRcdFx0aXNXb3Jrc3BhY2VUcnVzdGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0b25EaWRDaGFuZ2VUcnVzdDogRXZlbnQuTm9uZSxcblx0XHR9IGFzIFBhcnRpYWw8SVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U+IGFzIElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwge1xuXHRcdFx0Z2V0QXV0b1VwZGF0ZVZhbHVlOiAoKSA9PiAnb24nLFxuXHRcdH0gYXMgUGFydGlhbDxJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U+IGFzIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBsdWdpbk1hcmtldHBsYWNlU2VydmljZSkpO1xuXHRcdGNvbnN0IHNlZWRlZCA9IHNlcnZpY2UubGFzdEZldGNoZWRQbHVnaW5zLmdldCgpO1xuXG5cdFx0Y29uc3QgY3RzID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0YXdhaXQgc2VydmljZS5mZXRjaE1hcmtldHBsYWNlUGx1Z2lucyhjdHMudG9rZW4pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmxhc3RGZXRjaGVkUGx1Z2lucy5nZXQoKSwgc2VlZGVkKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1BsdWdpbk1hcmtldHBsYWNlU2VydmljZSAtIEFnZW50IFBsdWdpbiBkaXJlY3QgaW5zdGFsbCBwcm9iZXMnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgUHJvYmVGaWxlU2VydmljZSB7XG5cdFx0cmVhZG9ubHkgZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdFx0YXN5bmMgZXhpc3RzKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRcdHJldHVybiB0aGlzLmZpbGVzLmhhcyhyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR9XG5cblx0XHRhc3luYyByZWFkRmlsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx7IHZhbHVlOiBWU0J1ZmZlciB9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuZmlsZXMuZ2V0KHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIGZpbGU6ICR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKHZhbHVlKSB9O1xuXHRcdH1cblxuXHRcdGNyZWF0ZVdhdGNoZXIoKTogSUZpbGVTeXN0ZW1XYXRjaGVyIHtcblx0XHRcdHJldHVybiB7IG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKGZpbGVTZXJ2aWNlOiBQcm9iZUZpbGVTZXJ2aWNlKTogUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5NYXJrZXRwbGFjZXNdOiBbXSxcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5zRW5hYmxlZF06IHRydWUsXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwgeyBjYWNoZUhvbWU6IFVSSS5maWxlKCcvY2FjaGUnKSB9IGFzIFBhcnRpYWw8SUVudmlyb25tZW50U2VydmljZT4gYXMgSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlIGFzIHVua25vd24gYXMgSUZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLCB7IGFnZW50UGx1Z2luc0hvbWU6IFVSSS5maWxlKCcvYWdlbnQtcGx1Z2lucycpIH0gYXMgdW5rbm93biBhcyBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlcXVlc3RTZXJ2aWNlLCB7fSBhcyB1bmtub3duIGFzIElSZXF1ZXN0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLCB7XG5cdFx0XHRleHRyYU1hcmtldHBsYWNlczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmV4dHJhTWFya2V0cGxhY2VzJywgW10pLFxuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5lbmFibGVkUGx1Z2lucycsIG5ldyBNYXAoKSksXG5cdFx0fSBhcyBQYXJ0aWFsPElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2U+IGFzIElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIHtcblx0XHRcdGlzV29ya3NwYWNlVHJ1c3RlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdG9uRGlkQ2hhbmdlVHJ1c3Q6IEV2ZW50Lk5vbmUsXG5cdFx0fSBhcyBQYXJ0aWFsPElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlPiBhcyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIHtcblx0XHRcdGdldEF1dG9VcGRhdGVWYWx1ZTogKCkgPT4gJ29mZicsXG5cdFx0fSBhcyBQYXJ0aWFsPElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZT4gYXMgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRyZXR1cm4gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBsdWdpbk1hcmtldHBsYWNlU2VydmljZSkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2VlZENvbXBhdGlibGVNYW5pZmVzdChmaWxlU2VydmljZTogUHJvYmVGaWxlU2VydmljZSwgcmVwb0RpcjogVVJJKTogdm9pZCB7XG5cdFx0ZmlsZVNlcnZpY2UuZmlsZXMuc2V0KGpvaW5QYXRoKHJlcG9EaXIsICdwbHVnaW4uanNvbicpLnRvU3RyaW5nKCksIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdCRzY2hlbWE6IEFHRU5UX1BMVUdJTl9TQ0hFTUEucmVwbGFjZSgnLzEuMC4wLycsICcvMS4wLjEvJyksXG5cdFx0XHRuYW1lOiAnY29tcGF0aWJsZS1wbHVnaW4nLFxuXHRcdH0pKTtcblx0fVxuXG5cdHRlc3QoJ3JlYWRzIGEgR2l0IGRpcmVjdC1zb3VyY2UgbWFuaWZlc3Qgd2l0aCBhIGNvbXBhdGlibGUgc2NoZW1hIHJldmlzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IFByb2JlRmlsZVNlcnZpY2UoKTtcblx0XHRjb25zdCByZXBvRGlyID0gVVJJLmZpbGUoJy9yZXBvcy9jb21wYXRpYmxlJyk7XG5cdFx0c2VlZENvbXBhdGlibGVNYW5pZmVzdChmaWxlU2VydmljZSwgcmVwb0Rpcik7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmlsZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZWFkU2luZ2xlUGx1Z2luTWFuaWZlc3QocmVwb0RpciwgcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnb3duZXIvY29tcGF0aWJsZScpISk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py5uYW1lLCAnY29tcGF0aWJsZS1wbHVnaW4nKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb2duaXplcyBhIGxvY2FsIGRpcmVjdG9yeSB3aXRoIGEgY29tcGF0aWJsZSBzY2hlbWEgcmV2aXNpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgUHJvYmVGaWxlU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlcG9EaXIgPSBVUkkuZmlsZSgnL3BsdWdpbnMvY29tcGF0aWJsZScpO1xuXHRcdHNlZWRDb21wYXRpYmxlTWFuaWZlc3QoZmlsZVNlcnZpY2UsIHJlcG9EaXIpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGZpbGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuaXNQbHVnaW5EaXJlY3RvcnkocmVwb0Rpcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1BsdWdpbk1hcmtldHBsYWNlU2VydmljZSAtIGdldE1hcmtldHBsYWNlUGx1Z2luTWV0YWRhdGEnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgbWFya2V0cGxhY2VSZWYgPSBwYXJzZU1hcmtldHBsYWNlUmVmZXJlbmNlKCdtaWNyb3NvZnQvcGx1Z2lucycpITtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKGF1dG9VcGRhdGU6IEF1dG9VcGRhdGVDb25maWd1cmF0aW9uVmFsdWUgPSAnb24nLCBleHRyYU1hcmtldHBsYWNlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fSk6IFBsdWdpbk1hcmtldHBsYWNlU2VydmljZSB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5NYXJrZXRwbGFjZXNdOiBbJ21pY3Jvc29mdC9wbHVnaW5zJ10sXG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRXh0cmFNYXJrZXRwbGFjZXNdOiBleHRyYU1hcmtldHBsYWNlcyxcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5zRW5hYmxlZF06IHRydWUsXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwgeyBjYWNoZUhvbWU6IFVSSS5maWxlKCcvY2FjaGUnKSB9IGFzIFBhcnRpYWw8SUVudmlyb25tZW50U2VydmljZT4gYXMgSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIHt9IGFzIHVua25vd24gYXMgSUZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLCB7IGFnZW50UGx1Z2luc0hvbWU6IFVSSS5maWxlKCcvYWdlbnQtcGx1Z2lucycpIH0gYXMgdW5rbm93biBhcyBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlcXVlc3RTZXJ2aWNlLCB7fSBhcyB1bmtub3duIGFzIElSZXF1ZXN0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLCB7XG5cdFx0XHRleHRyYU1hcmtldHBsYWNlczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmV4dHJhTWFya2V0cGxhY2VzJywgW10pLFxuXHRcdFx0ZW5hYmxlZFBsdWdpbnM6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5lbmFibGVkUGx1Z2lucycsIG5ldyBNYXAoKSksXG5cdFx0fSBhcyBQYXJ0aWFsPElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2U+IGFzIElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIHtcblx0XHRcdGlzV29ya3NwYWNlVHJ1c3RlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdG9uRGlkQ2hhbmdlVHJ1c3Q6IEV2ZW50Lk5vbmUsXG5cdFx0fSBhcyBQYXJ0aWFsPElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlPiBhcyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIHtcblx0XHRcdGdldEF1dG9VcGRhdGVWYWx1ZTogKCkgPT4gYXV0b1VwZGF0ZSxcblx0XHR9IGFzIFBhcnRpYWw8SUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlPiBhcyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UpKTtcblx0fVxuXG5cdHRlc3QoJ3JldHVybnMgbWV0YWRhdGEgZm9yIGFuIGluc3RhbGxlZCBwbHVnaW4nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL2NhY2hlL2FnZW50UGx1Z2lucy9teS1wbHVnaW4nKTtcblx0XHRjb25zdCBwbHVnaW4gPSB7XG5cdFx0XHRuYW1lOiAnbXktcGx1Z2luJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnQSB0ZXN0IHBsdWdpbicsXG5cdFx0XHR2ZXJzaW9uOiAnMi4wLjAnLFxuXHRcdFx0c291cmNlOiAncGx1Z2lucy9teS1wbHVnaW4nLFxuXHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvbXktcGx1Z2luJyB9IGFzIGNvbnN0LFxuXHRcdFx0bWFya2V0cGxhY2U6IG1hcmtldHBsYWNlUmVmLmRpc3BsYXlMYWJlbCxcblx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBtYXJrZXRwbGFjZVJlZixcblx0XHRcdG1hcmtldHBsYWNlVHlwZTogTWFya2V0cGxhY2VUeXBlLkNvcGlsb3QsXG5cdFx0fTtcblxuXHRcdHNlcnZpY2UuYWRkSW5zdGFsbGVkUGx1Z2luKHBsdWdpblVyaSwgcGx1Z2luKTtcblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1hcmtldHBsYWNlUGx1Z2luTWV0YWRhdGEocGx1Z2luVXJpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBwbHVnaW4pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgYSBVUkkgdGhhdCBpcyBub3QgaW5zdGFsbGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNYXJrZXRwbGFjZVBsdWdpbk1ldGFkYXRhKFVSSS5maWxlKCcvc29tZS9vdGhlci9wYXRoJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gcGx1Z2lucyBhcmUgaW5zdGFsbGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNYXJrZXRwbGFjZVBsdWdpbk1ldGFkYXRhKFVSSS5maWxlKCcvYW55L3BhdGgnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWFuYWdlZCBtYXJrZXRwbGFjZSBhdXRvVXBkYXRlIG92ZXJyaWRlcyB0aGUgZ2xvYmFsIHNldHRpbmcgYnkgY2Fub25pY2FsIGlkZW50aXR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCdvZmYnLCB7XG5cdFx0XHRhbHdheXM6ICd7XCJzb3VyY2VcIjpcIm1pY3Jvc29mdC9hbHdheXNcIixcImF1dG9VcGRhdGVcIjp0cnVlfScsXG5cdFx0XHRuZXZlcjogJ3tcInNvdXJjZVwiOlwibWljcm9zb2Z0L25ldmVyXCIsXCJhdXRvVXBkYXRlXCI6ZmFsc2V9Jyxcblx0XHRcdGluaGVyaXRlZDogJ21pY3Jvc29mdC9pbmhlcml0ZWQnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhbHdheXM6IHNlcnZpY2UuaXNNYXJrZXRwbGFjZUF1dG9VcGRhdGVFbmFibGVkKHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvYWx3YXlzLmdpdCcpISksXG5cdFx0XHRuZXZlcjogc2VydmljZS5pc01hcmtldHBsYWNlQXV0b1VwZGF0ZUVuYWJsZWQocGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnbWljcm9zb2Z0L25ldmVyJykhKSxcblx0XHRcdGluaGVyaXRlZDogc2VydmljZS5pc01hcmtldHBsYWNlQXV0b1VwZGF0ZUVuYWJsZWQocGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnbWljcm9zb2Z0L2luaGVyaXRlZCcpISksXG5cdFx0XHR1bm1hbmFnZWQ6IHNlcnZpY2UuaXNNYXJrZXRwbGFjZUF1dG9VcGRhdGVFbmFibGVkKHBhcnNlTWFya2V0cGxhY2VSZWZlcmVuY2UoJ21pY3Jvc29mdC91bm1hbmFnZWQnKSEpLFxuXHRcdH0sIHtcblx0XHRcdGFsd2F5czogdHJ1ZSxcblx0XHRcdG5ldmVyOiBmYWxzZSxcblx0XHRcdGluaGVyaXRlZDogZmFsc2UsXG5cdFx0XHR1bm1hbmFnZWQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIC0gaW5zdGFsbGVkIHBsdWdpbnMgbGlmZWN5Y2xlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IG1hcmtldHBsYWNlUmVmID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnbWljcm9zb2Z0L3BsdWdpbnMnKSE7XG5cblx0ZnVuY3Rpb24gbWFrZVBsdWdpbihuYW1lOiBzdHJpbmcsIHNvdXJjZTogc3RyaW5nKTogSU1hcmtldHBsYWNlUGx1Z2luIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBgJHtuYW1lfSBkZXNjcmlwdGlvbmAsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0c291cmNlLFxuXHRcdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogc291cmNlIH0gYXMgY29uc3QsXG5cdFx0XHRtYXJrZXRwbGFjZTogbWFya2V0cGxhY2VSZWYuZGlzcGxheUxhYmVsLFxuXHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IG1hcmtldHBsYWNlUmVmLFxuXHRcdFx0bWFya2V0cGxhY2VUeXBlOiBNYXJrZXRwbGFjZVR5cGUuQ29waWxvdCxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZSgpOiBQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2Uge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzXTogWydtaWNyb3NvZnQvcGx1Z2lucyddLFxuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbnNFbmFibGVkXTogdHJ1ZSxcblx0XHR9KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRW52aXJvbm1lbnRTZXJ2aWNlLCB7IGNhY2hlSG9tZTogVVJJLmZpbGUoJy9jYWNoZScpIH0gYXMgUGFydGlhbDxJRW52aXJvbm1lbnRTZXJ2aWNlPiBhcyBJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge30gYXMgdW5rbm93biBhcyBJRmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UsIHsgYWdlbnRQbHVnaW5zSG9tZTogVVJJLmZpbGUoJy9hZ2VudC1wbHVnaW5zJykgfSBhcyB1bmtub3duIGFzIElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVxdWVzdFNlcnZpY2UsIHt9IGFzIHVua25vd24gYXMgSVJlcXVlc3RTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmUuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UsIHtcblx0XHRcdGV4dHJhTWFya2V0cGxhY2VzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuZXh0cmFNYXJrZXRwbGFjZXMnLCBbXSksXG5cdFx0XHRlbmFibGVkUGx1Z2luczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmVuYWJsZWRQbHVnaW5zJywgbmV3IE1hcCgpKSxcblx0XHR9IGFzIFBhcnRpYWw8SVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZT4gYXMgSVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwge1xuXHRcdFx0aXNXb3Jrc3BhY2VUcnVzdGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0b25EaWRDaGFuZ2VUcnVzdDogRXZlbnQuTm9uZSxcblx0XHR9IGFzIFBhcnRpYWw8SVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U+IGFzIElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwge1xuXHRcdFx0Z2V0QXV0b1VwZGF0ZVZhbHVlOiAoKSA9PiAnb24nLFxuXHRcdH0gYXMgUGFydGlhbDxJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U+IGFzIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cblx0XHRyZXR1cm4gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBsdWdpbk1hcmtldHBsYWNlU2VydmljZSkpO1xuXHR9XG5cblx0dGVzdCgnaW5zdGFsbGVkUGx1Z2lucyBvYnNlcnZhYmxlIGlzIGVtcHR5IHdpdGggbm8gcGx1Z2lucycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5pbnN0YWxsZWRQbHVnaW5zLmdldCgpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZEluc3RhbGxlZFBsdWdpbiBtYWtlcyBwbHVnaW4gYXBwZWFyIGluIGluc3RhbGxlZFBsdWdpbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2FnZW50LXBsdWdpbnMvZ2l0aHViLmNvbS9taWNyb3NvZnQvcGx1Z2lucy9teS1wbHVnaW4nKTtcblx0XHRjb25zdCBwbHVnaW4gPSBtYWtlUGx1Z2luKCdteS1wbHVnaW4nLCAnbXktcGx1Z2luJyk7XG5cblx0XHRzZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbih1cmksIHBsdWdpbik7XG5cblx0XHRjb25zdCBpbnN0YWxsZWQgPSBzZXJ2aWNlLmluc3RhbGxlZFBsdWdpbnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbGxlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YWxsZWRbMF0ucGx1Z2luLm5hbWUsICdteS1wbHVnaW4nKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlSW5zdGFsbGVkUGx1Z2luIHJlbW92ZXMgcGx1Z2luIGZyb20gaW5zdGFsbGVkUGx1Z2lucyBhbmQgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2FnZW50LXBsdWdpbnMvZ2l0aHViLmNvbS9taWNyb3NvZnQvcGx1Z2lucy9teS1wbHVnaW4nKTtcblx0XHRjb25zdCBwbHVnaW4gPSBtYWtlUGx1Z2luKCdteS1wbHVnaW4nLCAnbXktcGx1Z2luJyk7XG5cblx0XHRzZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbih1cmksIHBsdWdpbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaW5zdGFsbGVkUGx1Z2lucy5nZXQoKS5sZW5ndGgsIDEpO1xuXG5cdFx0c2VydmljZS5yZW1vdmVJbnN0YWxsZWRQbHVnaW4odXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pbnN0YWxsZWRQbHVnaW5zLmdldCgpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0TWFya2V0cGxhY2VQbHVnaW5NZXRhZGF0YSh1cmkpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRJbnN0YWxsZWRQbHVnaW4gdXBkYXRlcyBtZXRhZGF0YSBmb3IgZXhpc3RpbmcgZW50cnknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2FnZW50LXBsdWdpbnMvZ2l0aHViLmNvbS9taWNyb3NvZnQvcGx1Z2lucy9teS1wbHVnaW4nKTtcblx0XHRjb25zdCB2MSA9IG1ha2VQbHVnaW4oJ215LXBsdWdpbicsICdteS1wbHVnaW4nKTtcblx0XHRjb25zdCB2MiA9IHsgLi4udjEsIHZlcnNpb246ICcyLjAuMCcsIGRlc2NyaXB0aW9uOiAndXBkYXRlZCcgfTtcblxuXHRcdHNlcnZpY2UuYWRkSW5zdGFsbGVkUGx1Z2luKHVyaSwgdjEpO1xuXHRcdHNlcnZpY2UuYWRkSW5zdGFsbGVkUGx1Z2luKHVyaSwgdjIpO1xuXG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gc2VydmljZS5pbnN0YWxsZWRQbHVnaW5zLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YWxsZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFsbGVkWzBdLnBsdWdpbi52ZXJzaW9uLCAnMi4wLjAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFsbGVkWzBdLnBsdWdpbi5kZXNjcmlwdGlvbiwgJ3VwZGF0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TWFya2V0cGxhY2VQbHVnaW5NZXRhZGF0YSBmaW5kcyBtZXRhZGF0YSBmb3IgY2hpbGQgVVJJJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9hZ2VudC1wbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3BsdWdpbnMnKTtcblx0XHRjb25zdCBwbHVnaW4gPSBtYWtlUGx1Z2luKCdteS1wbHVnaW4nLCAnbXktcGx1Z2luJyk7XG5cblx0XHRzZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbih1cmksIHBsdWdpbik7XG5cblx0XHRjb25zdCBjaGlsZFVyaSA9IFVSSS5maWxlKCcvYWdlbnQtcGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC9wbHVnaW5zL3N1YmRpci9maWxlLnRzJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNYXJrZXRwbGFjZVBsdWdpbk1ldGFkYXRhKGNoaWxkVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py5uYW1lLCAnbXktcGx1Z2luJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIHBsdWdpbnMgY2FuIGJlIGluc3RhbGxlZCBpbmRlcGVuZGVudGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdXJpMSA9IFVSSS5maWxlKCcvYWdlbnQtcGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC9wbHVnaW5zL3BsdWdpbi1hJyk7XG5cdFx0Y29uc3QgdXJpMiA9IFVSSS5maWxlKCcvYWdlbnQtcGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC9wbHVnaW5zL3BsdWdpbi1iJyk7XG5cdFx0Y29uc3QgcGx1Z2luQSA9IG1ha2VQbHVnaW4oJ3BsdWdpbi1hJywgJ3BsdWdpbi1hJyk7XG5cdFx0Y29uc3QgcGx1Z2luQiA9IG1ha2VQbHVnaW4oJ3BsdWdpbi1iJywgJ3BsdWdpbi1iJyk7XG5cblx0XHRzZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbih1cmkxLCBwbHVnaW5BKTtcblx0XHRzZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbih1cmkyLCBwbHVnaW5CKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmluc3RhbGxlZFBsdWdpbnMuZ2V0KCkubGVuZ3RoLCAyKTtcblxuXHRcdHNlcnZpY2UucmVtb3ZlSW5zdGFsbGVkUGx1Z2luKHVyaTEpO1xuXHRcdGNvbnN0IHJlbWFpbmluZyA9IHNlcnZpY2UuaW5zdGFsbGVkUGx1Z2lucy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtYWluaW5nLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbWFpbmluZ1swXS5wbHVnaW4ubmFtZSwgJ3BsdWdpbi1iJyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgLSBoeWRyYXRpb24gYWZ0ZXIgcmVzdGFydCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBDQUNIRV9ST09UID0gVVJJLmZpbGUoJy9hZ2VudC1wbHVnaW5zJyk7XG5cblx0Y2xhc3MgVGVzdEZpbGVTZXJ2aWNlIHtcblx0XHRyZWFkb25seSBmaWxlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0cmVhZG9ubHkgZm9sZGVycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0YXN5bmMgZXhpc3RzKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRcdGNvbnN0IGtleSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5maWxlcy5oYXMoa2V5KSB8fCB0aGlzLmZvbGRlcnMuaGFzKGtleSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8eyB2YWx1ZTogVlNCdWZmZXIgfT4ge1xuXHRcdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5maWxlcy5nZXQoa2V5KTtcblx0XHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTWlzc2luZyBmaWxlOiAke2tleX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKHZhbHVlKSB9O1xuXHRcdH1cblxuXHRcdGFzeW5jIHdyaXRlRmlsZShyZXNvdXJjZTogVVJJLCBjb250ZW50OiBWU0J1ZmZlcik6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdFx0dGhpcy5maWxlcy5zZXQocmVzb3VyY2UudG9TdHJpbmcoKSwgY29udGVudC50b1N0cmluZygpKTtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cblx0XHRhc3luYyBjcmVhdGVGb2xkZXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdFx0dGhpcy5mb2xkZXJzLmFkZChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cblx0XHRjcmVhdGVXYXRjaGVyKCk6IElGaWxlU3lzdGVtV2F0Y2hlciB7XG5cdFx0XHRyZXR1cm4geyBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0c2V0RmlsZShyZXNvdXJjZTogVVJJLCBjb250ZW50OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdHRoaXMuZmlsZXMuc2V0KHJlc291cmNlLnRvU3RyaW5nKCksIGNvbnRlbnQpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVBsdWdpblJlcG9zaXRvcnlTdHViKCk6IElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlIHtcblx0XHRjb25zdCBnZXRSZXBvc2l0b3J5VXJpID0gKG1hcmtldHBsYWNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UpID0+IFVSSS5qb2luUGF0aChDQUNIRV9ST09ULCAuLi5tYXJrZXRwbGFjZS5jYWNoZVNlZ21lbnRzKTtcblx0XHRjb25zdCBnZXRQbHVnaW5Tb3VyY2VJbnN0YWxsVXJpID0gKGRlc2NyaXB0b3I6IElQbHVnaW5Tb3VyY2VEZXNjcmlwdG9yKSA9PiB7XG5cdFx0XHRpZiAoZGVzY3JpcHRvci5raW5kID09PSBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1Yikge1xuXHRcdFx0XHRjb25zdCBbb3duZXIsIHJlcG9dID0gZGVzY3JpcHRvci5yZXBvLnNwbGl0KCcvJyk7XG5cdFx0XHRcdGNvbnN0IGJhc2UgPSBVUkkuam9pblBhdGgoQ0FDSEVfUk9PVCwgJ2dpdGh1Yi5jb20nLCBvd25lciwgcmVwbyk7XG5cdFx0XHRcdHJldHVybiBkZXNjcmlwdG9yLnBhdGggPyBVUkkuam9pblBhdGgoYmFzZSwgZGVzY3JpcHRvci5wYXRoKSA6IGJhc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZGVzY3JpcHRvci5raW5kID09PSBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCkge1xuXHRcdFx0XHQvLyBUZXN0cyB1c2luZyB0aGlzIHN0dWIgb25seSBleGVyY2lzZSBub24tcmVsYXRpdmUgZGVzY3JpcHRvcnMgdmlhIHRoaXMgZW50cnkgcG9pbnQuXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignUmVsYXRpdmVQYXRoIHNob3VsZCBub3QgcmVhY2ggZ2V0UGx1Z2luU291cmNlSW5zdGFsbFVyaSBpbiBoeWRyYXRpb24gdGVzdHMnKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5oYW5kbGVkIHNvdXJjZSBraW5kIGluIHRlc3Qgc3R1YjogJHtkZXNjcmlwdG9yLmtpbmR9YCk7XG5cdFx0fTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YWdlbnRQbHVnaW5zSG9tZTogQ0FDSEVfUk9PVCxcblx0XHRcdGdldFJlcG9zaXRvcnlVcmksXG5cdFx0XHRnZXRQbHVnaW5JbnN0YWxsVXJpOiAocGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4pID0+IHtcblx0XHRcdFx0aWYgKHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmQgIT09IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGdldFBsdWdpblNvdXJjZUluc3RhbGxVcmkocGx1Z2luLnNvdXJjZURlc2NyaXB0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlcG9EaXIgPSBnZXRSZXBvc2l0b3J5VXJpKHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSk7XG5cdFx0XHRcdHJldHVybiBwbHVnaW4uc291cmNlID8gVVJJLmpvaW5QYXRoKHJlcG9EaXIsIHBsdWdpbi5zb3VyY2UpIDogcmVwb0Rpcjtcblx0XHRcdH0sXG5cdFx0XHRnZXRQbHVnaW5Tb3VyY2VJbnN0YWxsVXJpLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZTtcblx0fVxuXG5cdGZ1bmN0aW9uIG1ha2VBenVyZVBsdWdpbihtYXJrZXRwbGFjZVJlZmVyZW5jZTogSU1hcmtldHBsYWNlUmVmZXJlbmNlKTogSU1hcmtldHBsYWNlUGx1Z2luIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogJ2F6dXJlJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnTWljcm9zb2Z0IEF6dXJlIE1DUCBTZXJ2ZXIgYW5kIHNraWxscycsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0c291cmNlOiAnJyxcblx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIHJlcG86ICdtaWNyb3NvZnQvYXp1cmUtc2tpbGxzJywgcGF0aDogJy5naXRodWIvcGx1Z2lucy9henVyZS1za2lsbHMnIH0sXG5cdFx0XHRtYXJrZXRwbGFjZTogbWFya2V0cGxhY2VSZWZlcmVuY2UuZGlzcGxheUxhYmVsLFxuXHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2UsXG5cdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBzdG9yZU1hcmtldHBsYWNlQ2FjaGUoc3RvcmFnZVNlcnZpY2U6IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIG1hcmtldHBsYWNlUmVmZXJlbmNlOiBJTWFya2V0cGxhY2VSZWZlcmVuY2UsIHBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luKTogdm9pZCB7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2NoYXQucGx1Z2lucy5tYXJrZXRwbGFjZXMuZ2l0aHViQ2FjaGUudjEnLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRbbWFya2V0cGxhY2VSZWZlcmVuY2UuY2Fub25pY2FsSWRdOiB7XG5cdFx0XHRcdHBsdWdpbnM6IFtwbHVnaW5dLFxuXHRcdFx0XHRleHBpcmVzQXQ6IERhdGUubm93KCkgKyA2MF8wMDAsXG5cdFx0XHRcdHJlZmVyZW5jZVJhd1ZhbHVlOiBtYXJrZXRwbGFjZVJlZmVyZW5jZS5yYXdWYWx1ZSxcblx0XHRcdH0sXG5cdFx0fSksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHRlc3QoJ2h5ZHJhdGVzIGEgZ2l0aHViLXNvdXJjZWQgcGx1Z2luIGZyb20gaW5zdGFsbGVkLmpzb24gbmFtZSBhbmQgbWFya2V0cGxhY2UgY2FjaGUgYWZ0ZXIgcmVzdGFydCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTaW11bGF0ZXM6IHVzZXIgaW5zdGFsbHMgdGhlIFwiYXp1cmVcIiBwbHVnaW4gZnJvbSB0aGVcblx0XHQvLyBcImdpdGh1Yi9hd2Vzb21lLWNvcGlsb3QjbWFya2V0cGxhY2VcIiBtYXJrZXRwbGFjZSAoZmV0Y2hlZCB2aWEgSFRUUCwgbmV2ZXJcblx0XHQvLyBjbG9uZWQpLiBBZnRlciByZXN0YXJ0LCBpbnN0YWxsZWQuanNvbiBjb250YWlucyBvbmx5IHRoZSBkdXJhYmxlXG5cdFx0Ly8gaWRlbnRpdHkgZm9yIHRoYXQgcGx1Z2luOyB0aGUgZnVsbCBkZXNjcmlwdG9yIGlzIHJlY292ZXJlZCBmcm9tXG5cdFx0Ly8gbWFya2V0cGxhY2UgZGF0YSBjYWNoZWQgZnJvbSB0aGUgcHJpb3IgZmV0Y2guXG5cblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBUZXN0RmlsZVNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGF3ZXNvbWVDb3BpbG90ID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnZ2l0aHViL2F3ZXNvbWUtY29waWxvdCNtYXJrZXRwbGFjZScpITtcblx0XHRjb25zdCBhenVyZVBsdWdpbiA9IG1ha2VBenVyZVBsdWdpbihhd2Vzb21lQ29waWxvdCk7XG5cdFx0c3RvcmVNYXJrZXRwbGFjZUNhY2hlKHN0b3JhZ2VTZXJ2aWNlLCBhd2Vzb21lQ29waWxvdCwgYXp1cmVQbHVnaW4pO1xuXHRcdGNvbnN0IGF6dXJlUGx1Z2luVXJpID0gVVJJLmpvaW5QYXRoKENBQ0hFX1JPT1QsICdnaXRodWIuY29tJywgJ21pY3Jvc29mdCcsICdhenVyZS1za2lsbHMnLCAnLmdpdGh1YicsICdwbHVnaW5zJywgJ2F6dXJlLXNraWxscycpO1xuXG5cdFx0Y29uc3QgaW5zdGFsbGVkSnNvbiA9IFVSSS5qb2luUGF0aChDQUNIRV9ST09ULCAnaW5zdGFsbGVkLmpzb24nKTtcblx0XHRmaWxlU2VydmljZS5zZXRGaWxlKGluc3RhbGxlZEpzb24sIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHZlcnNpb246IDEsXG5cdFx0XHRpbnN0YWxsZWQ6IFt7XG5cdFx0XHRcdHBsdWdpblVyaTogYXp1cmVQbHVnaW5VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0bWFya2V0cGxhY2U6IGF3ZXNvbWVDb3BpbG90LnJhd1ZhbHVlLFxuXHRcdFx0XHRuYW1lOiAnYXp1cmUnLFxuXHRcdFx0fV0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzXTogWydnaXRodWIvYXdlc29tZS1jb3BpbG90I21hcmtldHBsYWNlJ10sXG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luc0VuYWJsZWRdOiB0cnVlLFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFNlcnZpY2UsIHsgY2FjaGVIb21lOiBVUkkuZmlsZSgnL2NhY2hlJykgfSBhcyBQYXJ0aWFsPElFbnZpcm9ubWVudFNlcnZpY2U+IGFzIElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSBhcyB1bmtub3duIGFzIElGaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSwgY3JlYXRlUGx1Z2luUmVwb3NpdG9yeVN0dWIoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlcXVlc3RTZXJ2aWNlLCB7fSBhcyB1bmtub3duIGFzIElSZXF1ZXN0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UsIHtcblx0XHRcdGV4dHJhTWFya2V0cGxhY2VzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuZXh0cmFNYXJrZXRwbGFjZXMnLCBbXSksXG5cdFx0XHRlbmFibGVkUGx1Z2luczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmVuYWJsZWRQbHVnaW5zJywgbmV3IE1hcCgpKSxcblx0XHR9IGFzIFBhcnRpYWw8SVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZT4gYXMgSVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwge1xuXHRcdFx0aXNXb3Jrc3BhY2VUcnVzdGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0b25EaWRDaGFuZ2VUcnVzdDogRXZlbnQuTm9uZSxcblx0XHR9IGFzIFBhcnRpYWw8SVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U+IGFzIElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwge1xuXHRcdFx0Z2V0QXV0b1VwZGF0ZVZhbHVlOiAoKSA9PiAnb24nLFxuXHRcdH0gYXMgUGFydGlhbDxJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U+IGFzIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBsdWdpbk1hcmtldHBsYWNlU2VydmljZSkpO1xuXG5cdFx0Ly8gRmlsZUJhY2tlZEluc3RhbGxlZFBsdWdpbnNTdG9yZSBpbml0aWFsaXNlcyBhc3luY2hyb25vdXNseS5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwOyBpKyspIHtcblx0XHRcdGlmIChzZXJ2aWNlLmluc3RhbGxlZFBsdWdpbnMuZ2V0KCkubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gc2VydmljZS5pbnN0YWxsZWRQbHVnaW5zLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YWxsZWQubGVuZ3RoLCAxLCAnYXp1cmUgcGx1Z2luIHNob3VsZCBiZSBoeWRyYXRlZCBmcm9tIG1hcmtldHBsYWNlIGRhdGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFsbGVkWzBdLnBsdWdpbi5uYW1lLCAnYXp1cmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFsbGVkWzBdLnBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLmtpbmQsIFBsdWdpblNvdXJjZUtpbmQuR2l0SHViKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFsbGVkWzBdLnBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZS5jYW5vbmljYWxJZCwgYXdlc29tZUNvcGlsb3QuY2Fub25pY2FsSWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwZXJzaXN0cyBwbHVnaW4gbmFtZSB3aGVuIGEgcGx1Z2luIGlzIGFkZGVkIHNvIGl0IHN1cnZpdmVzIGEgcmVzdGFydCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBGaXJzdCBzZXJ2aWNlIHdyaXRlcyBpbnN0YWxsZWQuanNvbiwgc2Vjb25kIHNlcnZpY2UgKHNoYXJpbmcgdGhlXG5cdFx0Ly8gc2FtZSBmaWxlIHN5c3RlbSArIHN0b3JhZ2UpIHJlYWRzIGl0IGJhY2sgYW5kIG11c3QgcmVjb25zdHJ1Y3Rcblx0XHQvLyB0aGUgcGx1Z2luIGZyb20gaXRzIHN0b3JlZCBuYW1lIHBsdXMgbWFya2V0cGxhY2UgZGF0YS5cblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBUZXN0RmlsZVNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGF3ZXNvbWVDb3BpbG90ID0gcGFyc2VNYXJrZXRwbGFjZVJlZmVyZW5jZSgnZ2l0aHViL2F3ZXNvbWUtY29waWxvdCNtYXJrZXRwbGFjZScpITtcblx0XHRjb25zdCBhenVyZVBsdWdpblVyaSA9IFVSSS5qb2luUGF0aChDQUNIRV9ST09ULCAnZ2l0aHViLmNvbScsICdtaWNyb3NvZnQnLCAnYXp1cmUtc2tpbGxzJywgJy5naXRodWInLCAncGx1Z2lucycsICdhenVyZS1za2lsbHMnKTtcblx0XHRjb25zdCBhenVyZVBsdWdpbiA9IG1ha2VBenVyZVBsdWdpbihhd2Vzb21lQ29waWxvdCk7XG5cdFx0c3RvcmVNYXJrZXRwbGFjZUNhY2hlKHN0b3JhZ2VTZXJ2aWNlLCBhd2Vzb21lQ29waWxvdCwgYXp1cmVQbHVnaW4pO1xuXG5cdFx0ZnVuY3Rpb24gbWFrZVNlcnZpY2UoKTogUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIHtcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5NYXJrZXRwbGFjZXNdOiBbJ2dpdGh1Yi9hd2Vzb21lLWNvcGlsb3QjbWFya2V0cGxhY2UnXSxcblx0XHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbnNFbmFibGVkXTogdHJ1ZSxcblx0XHRcdH0pKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwgeyBjYWNoZUhvbWU6IFVSSS5maWxlKCcvY2FjaGUnKSB9IGFzIFBhcnRpYWw8SUVudmlyb25tZW50U2VydmljZT4gYXMgSUVudmlyb25tZW50U2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UgYXMgdW5rbm93biBhcyBJRmlsZVNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSwgY3JlYXRlUGx1Z2luUmVwb3NpdG9yeVN0dWIoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZXF1ZXN0U2VydmljZSwge30gYXMgdW5rbm93biBhcyBJUmVxdWVzdFNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSwge1xuXHRcdFx0XHRleHRyYU1hcmtldHBsYWNlczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmV4dHJhTWFya2V0cGxhY2VzJywgW10pLFxuXHRcdFx0XHRlbmFibGVkUGx1Z2luczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmVuYWJsZWRQbHVnaW5zJywgbmV3IE1hcCgpKSxcblx0XHRcdH0gYXMgUGFydGlhbDxJV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlPiBhcyBJV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIHtcblx0XHRcdFx0aXNXb3Jrc3BhY2VUcnVzdGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRvbkRpZENoYW5nZVRydXN0OiBFdmVudC5Ob25lLFxuXHRcdFx0fSBhcyBQYXJ0aWFsPElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlPiBhcyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwge1xuXHRcdFx0XHRnZXRBdXRvVXBkYXRlVmFsdWU6ICgpID0+ICdvbicsXG5cdFx0XHR9IGFzIFBhcnRpYWw8SUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlPiBhcyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UpKTtcblx0XHR9XG5cblx0XHQvLyBGaXJzdCBzZXNzaW9uOiBpbnN0YWxsIHRoZSBwbHVnaW4uXG5cdFx0Y29uc3QgZmlyc3QgPSBtYWtlU2VydmljZSgpO1xuXHRcdC8vIFdhaXQgZm9yIEZpbGVCYWNrZWRJbnN0YWxsZWRQbHVnaW5zU3RvcmUgdG8gZmluaXNoIGluaXRpYWxpc2F0aW9uXG5cdFx0Ly8gc28gdGhhdCBzdWJzZXF1ZW50IHdyaXRlcyBhcmUgZmx1c2hlZCB0byB0aGUgZmlsZSBzZXJ2aWNlLlxuXHRcdGF3YWl0IHRpbWVvdXQoMjApO1xuXHRcdGZpcnN0LmFkZEluc3RhbGxlZFBsdWdpbihhenVyZVBsdWdpblVyaSwgYXp1cmVQbHVnaW4pO1xuXHRcdC8vIFdhaXQgZm9yIHRoZSB0aHJvdHRsZWQgd3JpdGUgdG8gbGFuZC5cblx0XHRhd2FpdCB0aW1lb3V0KDIwMCk7XG5cblx0XHRjb25zdCBpbnN0YWxsZWRKc29uID0gVVJJLmpvaW5QYXRoKENBQ0hFX1JPT1QsICdpbnN0YWxsZWQuanNvbicpO1xuXHRcdGNvbnN0IHBlcnNpc3RlZCA9IEpTT04ucGFyc2UoZmlsZVNlcnZpY2UuZmlsZXMuZ2V0KGluc3RhbGxlZEpzb24udG9TdHJpbmcoKSkhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVyc2lzdGVkLmluc3RhbGxlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGVyc2lzdGVkLmluc3RhbGxlZFswXSwge1xuXHRcdFx0cGx1Z2luVXJpOiBhenVyZVBsdWdpblVyaS50b1N0cmluZygpLFxuXHRcdFx0bWFya2V0cGxhY2U6IGF3ZXNvbWVDb3BpbG90LnJhd1ZhbHVlLFxuXHRcdFx0bmFtZTogJ2F6dXJlJyxcblx0XHR9KTtcblxuXHRcdC8vIFNlY29uZCBzZXNzaW9uOiByZXN0YXJ0IHdpdGggc2hhcmVkIHN0b3JhZ2UgKyBmaWxlIHN5c3RlbS4gVGhlXG5cdFx0Ly8gcGx1Z2luIG11c3QgYmUgcmVjb25zdHJ1Y3RlZCBmcm9tIGluc3RhbGxlZC5qc29uICsgbWFya2V0cGxhY2UgZGF0YS5cblx0XHRjb25zdCBzZWNvbmQgPSBtYWtlU2VydmljZSgpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykge1xuXHRcdFx0aWYgKHNlY29uZC5pbnN0YWxsZWRQbHVnaW5zLmdldCgpLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdH1cblx0XHRjb25zdCBpbnN0YWxsZWQgPSBzZWNvbmQuaW5zdGFsbGVkUGx1Z2lucy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFsbGVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbGxlZFswXS5wbHVnaW4ubmFtZSwgJ2F6dXJlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbGxlZFswXS5wbHVnaW4uc291cmNlRGVzY3JpcHRvci5raW5kLCBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1Yik7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdwYXJzZVBsdWdpblNvdXJjZScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgbG9nQ29udGV4dCA9IHtcblx0XHRwbHVnaW5OYW1lOiAndGVzdCcsXG5cdFx0bG9nU2VydmljZTogbmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0bG9nUHJlZml4OiAnW3Rlc3RdJyxcblx0fTtcblxuXHR0ZXN0KCdwYXJzZXMgc3RyaW5nIHNvdXJjZSBhcyBSZWxhdGl2ZVBhdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VQbHVnaW5Tb3VyY2UoJy4vbXktcGx1Z2luJywgdW5kZWZpbmVkLCBsb2dDb250ZXh0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ215LXBsdWdpbicgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBzdHJpbmcgc291cmNlIHdpdGggcGx1Z2luUm9vdCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVBsdWdpblNvdXJjZSgnc3ViJywgJ3BsdWdpbnMnLCBsb2dDb250ZXh0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvc3ViJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIHVuZGVmaW5lZCBzb3VyY2UgYXMgUmVsYXRpdmVQYXRoIHVzaW5nIHBsdWdpblJvb3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VQbHVnaW5Tb3VyY2UodW5kZWZpbmVkLCAncm9vdCcsIGxvZ0NvbnRleHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAncm9vdCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBlbXB0eSBzdHJpbmcgc291cmNlIGFzIFJlbGF0aXZlUGF0aCB1c2luZyBwbHVnaW5Sb290JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUGx1Z2luU291cmNlKCcnLCAnYmFzZScsIGxvZ0NvbnRleHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAnYmFzZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgYmFzZSBkaXIgZm9yIGVtcHR5IHNvdXJjZSB3aXRob3V0IHBsdWdpblJvb3QnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVBsdWdpblNvdXJjZSgnJywgdW5kZWZpbmVkLCBsb2dDb250ZXh0KSwgeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJycgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgYmFzZSBkaXIgZm9yIHVuZGVmaW5lZCBzb3VyY2Ugd2l0aG91dCBwbHVnaW5Sb290JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VQbHVnaW5Tb3VyY2UodW5kZWZpbmVkLCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpLCB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiAnJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIGdpdGh1YiBvYmplY3Qgc291cmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ293bmVyL3JlcG8nIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRIdWIsIHJlcG86ICdvd25lci9yZXBvJywgcmVmOiB1bmRlZmluZWQsIHNoYTogdW5kZWZpbmVkLCBwYXRoOiB1bmRlZmluZWQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBnaXRodWIgb2JqZWN0IHNvdXJjZSB3aXRoIHJlZiBhbmQgc2hhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ293bmVyL3JlcG8nLCByZWY6ICd2Mi4wLjAnLCBzaGE6ICdhMWIyYzNkNGU1ZjZhN2I4YzlkMGUxZjJhM2I0YzVkNmU3ZjhhOWIwJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycsIHJlZjogJ3YyLjAuMCcsIHNoYTogJ2ExYjJjM2Q0ZTVmNmE3YjhjOWQwZTFmMmEzYjRjNWQ2ZTdmOGE5YjAnLCBwYXRoOiB1bmRlZmluZWQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBnaXRodWIgb2JqZWN0IHNvdXJjZSB3aXRoIHBhdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnb3duZXIvcmVwbycsIHBhdGg6ICdwbHVnaW5zL215LXBsdWdpbicgfSwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nLCByZWY6IHVuZGVmaW5lZCwgc2hhOiB1bmRlZmluZWQsIHBhdGg6ICdwbHVnaW5zL215LXBsdWdpbicgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBnaXRodWIgc291cmNlIG1pc3NpbmcgcmVwbycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICdnaXRodWInIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBnaXRodWIgc291cmNlIHdpdGggaW52YWxpZCByZXBvIGZvcm1hdCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnb3duZXInIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBnaXRodWIgc291cmNlIHdpdGggaW52YWxpZCBzaGEnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ293bmVyL3JlcG8nLCBzaGE6ICdhYmMxMjMnIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBnaXRodWIgc291cmNlIHdpdGggbm9uLXN0cmluZyBwYXRoJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVBsdWdpblNvdXJjZSh7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdvd25lci9yZXBvJywgcGF0aDogNDIgfSBhcyBuZXZlciwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIHVybCBvYmplY3Qgc291cmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAndXJsJywgdXJsOiAnaHR0cHM6Ly9naXRsYWIuY29tL3RlYW0vcGx1Z2luLmdpdCcgfSwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdFVybCwgdXJsOiAnaHR0cHM6Ly9naXRsYWIuY29tL3RlYW0vcGx1Z2luLmdpdCcsIHJlZjogdW5kZWZpbmVkLCBzaGE6IHVuZGVmaW5lZCwgcGF0aDogdW5kZWZpbmVkIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgdXJsIHNvdXJjZSBtaXNzaW5nIHVybCBmaWVsZCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICd1cmwnIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB1cmwgc291cmNlIG5vdCBlbmRpbmcgaW4gLmdpdCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICd1cmwnLCB1cmw6ICdodHRwczovL2dpdGxhYi5jb20vdGVhbS9wbHVnaW4nIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBnaXQtc3ViZGlyIG9iamVjdCBzb3VyY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICdnaXQtc3ViZGlyJywgdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL2FjbWUvbW9ub3JlcG8uZ2l0JywgcGF0aDogJ3Rvb2xzL2NsYXVkZS1wbHVnaW4nIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRVcmwsIHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9hY21lL21vbm9yZXBvLmdpdCcsIHJlZjogdW5kZWZpbmVkLCBzaGE6IHVuZGVmaW5lZCwgcGF0aDogJ3Rvb2xzL2NsYXVkZS1wbHVnaW4nIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgZ2l0LXN1YmRpciBvYmplY3Qgc291cmNlIHdpdGggcmVmIGFuZCBzaGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICdnaXQtc3ViZGlyJywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9yZXBvLmdpdCcsIHBhdGg6ICdwbHVnaW5zL2ZvbycsIHJlZjogJ3YyLjAuMCcsIHNoYTogJ2ExYjJjM2Q0ZTVmNmE3YjhjOWQwZTFmMmEzYjRjNWQ2ZTdmOGE5YjAnIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRVcmwsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vcmVwby5naXQnLCByZWY6ICd2Mi4wLjAnLCBzaGE6ICdhMWIyYzNkNGU1ZjZhN2I4YzlkMGUxZjJhM2I0YzVkNmU3ZjhhOWIwJywgcGF0aDogJ3BsdWdpbnMvZm9vJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIGdpdC1zdWJkaXIgc291cmNlIHdpdGhvdXQgLmdpdCBzdWZmaXgnLCAoKSA9PiB7XG5cdFx0Ly8gZ2l0LXN1YmRpciBkb2VzIG5vdCByZXF1aXJlIC5naXQgc3VmZml4IChBenVyZSBEZXZPcHMgLyBBV1MgQ29kZUNvbW1pdCBjb21wYXRpYmlsaXR5KVxuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnZ2l0LXN1YmRpcicsIHVybDogJ2h0dHBzOi8vZGV2LmF6dXJlLmNvbS9vcmcvcHJvamVjdC9fZ2l0L3JlcG8nLCBwYXRoOiAncGx1Z2lucy9mb28nIH0sIHVuZGVmaW5lZCwgbG9nQ29udGV4dCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRVcmwsIHVybDogJ2h0dHBzOi8vZGV2LmF6dXJlLmNvbS9vcmcvcHJvamVjdC9fZ2l0L3JlcG8nLCByZWY6IHVuZGVmaW5lZCwgc2hhOiB1bmRlZmluZWQsIHBhdGg6ICdwbHVnaW5zL2ZvbycgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBnaXQtc3ViZGlyIHNvdXJjZSBtaXNzaW5nIHVybCBmaWVsZCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICdnaXQtc3ViZGlyJywgcGF0aDogJ3BsdWdpbnMvZm9vJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZ2l0LXN1YmRpciBzb3VyY2UgbWlzc2luZyBwYXRoIGZpZWxkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVBsdWdpblNvdXJjZSh7IHNvdXJjZTogJ2dpdC1zdWJkaXInLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3JlcG8uZ2l0JyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgbnBtIG9iamVjdCBzb3VyY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICducG0nLCBwYWNrYWdlOiAnQGFjbWUvY2xhdWRlLXBsdWdpbicgfSwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLk5wbSwgcGFja2FnZTogJ0BhY21lL2NsYXVkZS1wbHVnaW4nLCB2ZXJzaW9uOiB1bmRlZmluZWQsIHJlZ2lzdHJ5OiB1bmRlZmluZWQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBucG0gb2JqZWN0IHNvdXJjZSB3aXRoIHZlcnNpb24gYW5kIHJlZ2lzdHJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnbnBtJywgcGFja2FnZTogJ0BhY21lL2NsYXVkZS1wbHVnaW4nLCB2ZXJzaW9uOiAnMi4xLjAnLCByZWdpc3RyeTogJ2h0dHBzOi8vbnBtLmV4YW1wbGUuY29tJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuTnBtLCBwYWNrYWdlOiAnQGFjbWUvY2xhdWRlLXBsdWdpbicsIHZlcnNpb246ICcyLjEuMCcsIHJlZ2lzdHJ5OiAnaHR0cHM6Ly9ucG0uZXhhbXBsZS5jb20nIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgbnBtIHNvdXJjZSBtaXNzaW5nIHBhY2thZ2UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAnbnBtJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgbnBtIHNvdXJjZSB3aXRoIG5vbi1zdHJpbmcgdmVyc2lvbicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICducG0nLCBwYWNrYWdlOiAnQGFjbWUvY2xhdWRlLXBsdWdpbicsIHZlcnNpb246IDEyMyB9IGFzIG5ldmVyLCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgcGlwIG9iamVjdCBzb3VyY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VQbHVnaW5Tb3VyY2UoeyBzb3VyY2U6ICdwaXAnLCBwYWNrYWdlOiAnbXktcGx1Z2luJyB9LCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUGlwLCBwYWNrYWdlOiAnbXktcGx1Z2luJywgdmVyc2lvbjogdW5kZWZpbmVkLCByZWdpc3RyeTogdW5kZWZpbmVkIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgcGlwIG9iamVjdCBzb3VyY2Ugd2l0aCB2ZXJzaW9uIGFuZCByZWdpc3RyeScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVBsdWdpblNvdXJjZSh7IHNvdXJjZTogJ3BpcCcsIHBhY2thZ2U6ICdteS1wbHVnaW4nLCB2ZXJzaW9uOiAnMS4wLjAnLCByZWdpc3RyeTogJ2h0dHBzOi8vcHlwaS5leGFtcGxlLmNvbScgfSwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlBpcCwgcGFja2FnZTogJ215LXBsdWdpbicsIHZlcnNpb246ICcxLjAuMCcsIHJlZ2lzdHJ5OiAnaHR0cHM6Ly9weXBpLmV4YW1wbGUuY29tJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHBpcCBzb3VyY2UgbWlzc2luZyBwYWNrYWdlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVBsdWdpblNvdXJjZSh7IHNvdXJjZTogJ3BpcCcgfSwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHBpcCBzb3VyY2Ugd2l0aCBub24tc3RyaW5nIHJlZ2lzdHJ5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVBsdWdpblNvdXJjZSh7IHNvdXJjZTogJ3BpcCcsIHBhY2thZ2U6ICdteS1wbHVnaW4nLCByZWdpc3RyeTogNDIgfSBhcyBuZXZlciwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHVua25vd24gc291cmNlIGtpbmQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUGx1Z2luU291cmNlKHsgc291cmNlOiAndW5rbm93bicgfSwgdW5kZWZpbmVkLCBsb2dDb250ZXh0KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIG9iamVjdCBzb3VyY2Ugd2l0aG91dCBzb3VyY2UgZGlzY3JpbWluYW50JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVBsdWdpblNvdXJjZSh7IHBhY2thZ2U6ICd0ZXN0JyB9IGFzIG5ldmVyLCB1bmRlZmluZWQsIGxvZ0NvbnRleHQpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnZ2V0UGx1Z2luU291cmNlTGFiZWwnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Zvcm1hdHMgcmVsYXRpdmUgcGF0aCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UGx1Z2luU291cmNlTGFiZWwoeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJ3BsdWdpbnMvZm9vJyB9KSwgJ3BsdWdpbnMvZm9vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zvcm1hdHMgZW1wdHkgcmVsYXRpdmUgcGF0aCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UGx1Z2luU291cmNlTGFiZWwoeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLlJlbGF0aXZlUGF0aCwgcGF0aDogJycgfSksICcuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zvcm1hdHMgZ2l0aHViIHNvdXJjZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UGx1Z2luU291cmNlTGFiZWwoeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogJ293bmVyL3JlcG8nIH0pLCAnb3duZXIvcmVwbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JtYXRzIGdpdGh1YiBzb3VyY2Ugd2l0aCBwYXRoJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQbHVnaW5Tb3VyY2VMYWJlbCh7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuR2l0SHViLCByZXBvOiAnb3duZXIvcmVwbycsIHBhdGg6ICdwbHVnaW5zL2ZvbycgfSksICdvd25lci9yZXBvL3BsdWdpbnMvZm9vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zvcm1hdHMgdXJsIHNvdXJjZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UGx1Z2luU291cmNlTGFiZWwoeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdFVybCwgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9yZXBvLmdpdCcgfSksICdodHRwczovL2V4YW1wbGUuY29tL3JlcG8uZ2l0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zvcm1hdHMgdXJsIHNvdXJjZSB3aXRoIHBhdGgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFBsdWdpblNvdXJjZUxhYmVsKHsga2luZDogUGx1Z2luU291cmNlS2luZC5HaXRVcmwsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vcmVwby5naXQnLCBwYXRoOiAncGx1Z2lucy9mb28nIH0pLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9yZXBvLmdpdC9wbHVnaW5zL2ZvbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JtYXRzIG5wbSBzb3VyY2Ugd2l0aG91dCB2ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQbHVnaW5Tb3VyY2VMYWJlbCh7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuTnBtLCBwYWNrYWdlOiAnQGFjbWUvcGx1Z2luJyB9KSwgJ0BhY21lL3BsdWdpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JtYXRzIG5wbSBzb3VyY2Ugd2l0aCB2ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQbHVnaW5Tb3VyY2VMYWJlbCh7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuTnBtLCBwYWNrYWdlOiAnQGFjbWUvcGx1Z2luJywgdmVyc2lvbjogJzEuMC4wJyB9KSwgJ0BhY21lL3BsdWdpbkAxLjAuMCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JtYXRzIHBpcCBzb3VyY2Ugd2l0aG91dCB2ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQbHVnaW5Tb3VyY2VMYWJlbCh7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUGlwLCBwYWNrYWdlOiAnbXktcGx1Z2luJyB9KSwgJ215LXBsdWdpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JtYXRzIHBpcCBzb3VyY2Ugd2l0aCB2ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQbHVnaW5Tb3VyY2VMYWJlbCh7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUGlwLCBwYWNrYWdlOiAnbXktcGx1Z2luJywgdmVyc2lvbjogJzIuMCcgfSksICdteS1wbHVnaW49PTIuMCcpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQixnQkFBZ0I7QUFDekMsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBd0M7QUFDakQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQix3QkFBd0IsY0FBYyxxQkFBcUI7QUFDckYsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUywyQkFBMkI7QUFDcEMsU0FBdUMsbUNBQW1DO0FBQzFFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUNBQXFDO0FBQzlDLFNBQTZFLDBCQUEwQixpQkFBaUIsMEJBQTBCLGtCQUFrQixvQ0FBb0Msc0JBQXNCLDJCQUEyQiw0QkFBNEIsbUJBQW1CLGtDQUFrQztBQUMxVSxTQUFTLHVDQUF1QztBQUVoRCxNQUFNLDRCQUE0QixNQUFNO0FBQ3ZDLDBDQUF3QztBQUV4QyxPQUFLLHVDQUF1QyxNQUFNO0FBQ2pELFVBQU0sU0FBUywwQkFBMEIsa0JBQWtCO0FBQzNELFdBQU8sR0FBRyxNQUFNO0FBQ2hCLFFBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxJQUNEO0FBQ0EsV0FBTyxZQUFZLE9BQU8sTUFBTSx5QkFBeUIsZUFBZTtBQUN4RSxXQUFPLFlBQVksT0FBTyxVQUFVLHlDQUF5QztBQUM3RSxXQUFPLFlBQVksT0FBTyxhQUFhLHlCQUF5QjtBQUNoRSxXQUFPLFlBQVksT0FBTyxjQUFjLGtCQUFrQjtBQUMxRCxXQUFP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
