import assert from "assert";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { URI } from "../../../../../../base/common/uri.js";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { McpServerType } from "../../../../../../platform/mcp/common/mcpPlatformTypes.js";
import { CustomizationEnablementKind } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { SyncedCustomizationBundler } from "../../../browser/agentSessions/agentHost/syncedCustomizationBundler.js";
import { IAgentHostFileSystemService, SYNCED_CUSTOMIZATION_SCHEME } from "../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
suite("SyncedCustomizationBundler", () => {
  const disposables = new DisposableStore();
  let fileService;
  let instantiationService;
  const enabledMcpServer = (name, configuration) => ({
    name,
    configuration,
    enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }]
  });
  setup(() => {
    fileService = disposables.add(new FileService(new NullLogService()));
    const memFs = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));
    const syncedProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(SYNCED_CUSTOMIZATION_SCHEME, syncedProvider));
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IAgentHostFileSystemService, { ensureSyncedCustomizationProvider() {
    } });
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createBundler(authority = "test-agent") {
    return disposables.add(instantiationService.createInstance(SyncedCustomizationBundler, authority));
  }
  async function seedFile(path, content) {
    const uri = URI.from({ scheme: Schemas.inMemory, path });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
    return uri;
  }
  test("returns undefined for empty file list", async () => {
    const bundler = createBundler();
    const result = await bundler.bundle([]);
    assert.strictEqual(result, void 0);
  });
  test("returns undefined when all files have unsupported types", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/hooks.json", "{}");
    const result = await bundler.bundle([{ uri, type: PromptsType.hook }]);
    assert.strictEqual(result, void 0);
  });
  test("bundles instruction files into rules directory", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/my-rules.md", "# My rules\nDo X");
    const result = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.ok(result, "should return a result");
    assert.ok(result.ref.uri, "should have a URI");
    assert.strictEqual(result.ref.name, "VS Code Synced Data");
    assert.ok(result.ref.nonce, "should have a nonce");
    const destUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/my-rules.md" });
    const content = await fileService.readFile(destUri);
    assert.strictEqual(content.value.toString(), "# My rules\nDo X");
  });
  test("bundles files into correct directories by type", async () => {
    const bundler = createBundler();
    const instrUri = await seedFile("/test/rule.md", "rule content");
    const promptUri = await seedFile("/test/cmd.prompt.md", "prompt content");
    const agentUri = await seedFile("/test/my-agent.md", "agent content");
    const skillUri = await seedFile("/test/my-skill.md", "skill content");
    const result = await bundler.bundle([
      { uri: instrUri, type: PromptsType.instructions },
      { uri: promptUri, type: PromptsType.prompt },
      { uri: agentUri, type: PromptsType.agent },
      { uri: skillUri, type: PromptsType.skill }
    ]);
    assert.ok(result);
    const ruleContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/rule.md" }));
    assert.strictEqual(ruleContent.value.toString(), "rule content");
    const cmdContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/commands/cmd.prompt.md" }));
    assert.strictEqual(cmdContent.value.toString(), "prompt content");
    const agentContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/agents/my-agent.md" }));
    assert.strictEqual(agentContent.value.toString(), "agent content");
    const skillContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/my-skill.md" }));
    assert.strictEqual(skillContent.value.toString(), "skill content");
  });
  test("bundles SKILL.md files into per-skill subdirectories", async () => {
    const bundler = createBundler();
    const skillA = await seedFile("/skills/skill-a/SKILL.md", "skill A content");
    const skillB = await seedFile("/skills/skill-b/SKILL.md", "skill B content");
    const skillC = await seedFile("/skills/my-cool-skill/SKILL.md", "skill C content");
    const result = await bundler.bundle([
      { uri: skillA, type: PromptsType.skill },
      { uri: skillB, type: PromptsType.skill },
      { uri: skillC, type: PromptsType.skill }
    ]);
    assert.ok(result);
    const contentA = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/skill-a/SKILL.md" }));
    assert.strictEqual(contentA.value.toString(), "skill A content");
    const contentB = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/skill-b/SKILL.md" }));
    assert.strictEqual(contentB.value.toString(), "skill B content");
    const contentC = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/my-cool-skill/SKILL.md" }));
    assert.strictEqual(contentC.value.toString(), "skill C content");
  });
  test("writes plugin manifest", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/file.md", "content");
    await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    const manifestUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/.plugin/plugin.json" });
    const manifest = await fileService.readFile(manifestUri);
    const parsed = JSON.parse(manifest.value.toString());
    assert.strictEqual(parsed.name, "VS Code Synced Data");
  });
  test("nonce is stable for same content", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/stable.md", "same content");
    const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    const result2 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.strictEqual(result1.ref.nonce, result2.ref.nonce);
  });
  test("nonce changes when content changes", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/changing.md", "v1");
    const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    await fileService.writeFile(uri, VSBuffer.fromString("v2"));
    const result2 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.notStrictEqual(result1.ref.nonce, result2.ref.nonce);
  });
  test("nonce is order-independent", async () => {
    const bundler = createBundler();
    const uriA = await seedFile("/test/a.md", "A");
    const uriB = await seedFile("/test/b.md", "B");
    const result1 = await bundler.bundle([
      { uri: uriA, type: PromptsType.instructions },
      { uri: uriB, type: PromptsType.instructions }
    ]);
    const result2 = await bundler.bundle([
      { uri: uriB, type: PromptsType.instructions },
      { uri: uriA, type: PromptsType.instructions }
    ]);
    assert.strictEqual(result1.ref.nonce, result2.ref.nonce);
  });
  test("different authorities do not conflict", async () => {
    const bundlerA = createBundler("agent-a");
    const bundlerB = createBundler("agent-b");
    const uri = await seedFile("/test/shared.md", "shared content");
    await bundlerA.bundle([{ uri, type: PromptsType.instructions }]);
    await bundlerB.bundle([{ uri, type: PromptsType.instructions }]);
    const contentA = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/agent-a/rules/shared.md" }));
    const contentB = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/agent-b/rules/shared.md" }));
    assert.strictEqual(contentA.value.toString(), "shared content");
    assert.strictEqual(contentB.value.toString(), "shared content");
  });
  test("lastNonce tracks the most recent bundle", async () => {
    const bundler = createBundler();
    assert.strictEqual(bundler.lastNonce, void 0);
    const uri = await seedFile("/test/track.md", "tracking");
    const result = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.strictEqual(bundler.lastNonce, result.ref.nonce);
  });
  test("SKILL.md files with same basename do not overwrite each other", async () => {
    const bundler = createBundler();
    const skillA = await seedFile("/skills/alpha/SKILL.md", "alpha skill");
    const skillB = await seedFile("/skills/beta/SKILL.md", "beta skill");
    const result = await bundler.bundle([
      { uri: skillA, type: PromptsType.skill },
      { uri: skillB, type: PromptsType.skill }
    ]);
    assert.ok(result);
    const contentA = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/alpha/SKILL.md" }));
    const contentB = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/beta/SKILL.md" }));
    assert.strictEqual(contentA.value.toString(), "alpha skill");
    assert.strictEqual(contentB.value.toString(), "beta skill");
  });
  test("non-SKILL.md skill files are written flat", async () => {
    const bundler = createBundler();
    const skillUri = await seedFile("/test/my-helper.md", "helper skill");
    const result = await bundler.bundle([{ uri: skillUri, type: PromptsType.skill }]);
    assert.ok(result);
    const content = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/my-helper.md" }));
    assert.strictEqual(content.value.toString(), "helper skill");
  });
  test("mixed SKILL.md and non-SKILL.md skill files coexist", async () => {
    const bundler = createBundler();
    const skillDir = await seedFile("/skills/council-plan/SKILL.md", "council plan");
    const skillFlat = await seedFile("/test/quick-fix.md", "quick fix");
    const result = await bundler.bundle([
      { uri: skillDir, type: PromptsType.skill },
      { uri: skillFlat, type: PromptsType.skill }
    ]);
    assert.ok(result);
    const contentA = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/council-plan/SKILL.md" }));
    assert.strictEqual(contentA.value.toString(), "council plan");
    const contentB = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/quick-fix.md" }));
    assert.strictEqual(contentB.value.toString(), "quick fix");
  });
  test("SKILL.md nonce includes subdirectory path", async () => {
    const bundler = createBundler();
    const skillA = await seedFile("/skills/skill-x/SKILL.md", "same content");
    const skillB = await seedFile("/skills/skill-y/SKILL.md", "same content");
    const resultA = await bundler.bundle([{ uri: skillA, type: PromptsType.skill }]);
    const resultB = await bundler.bundle([{ uri: skillB, type: PromptsType.skill }]);
    assert.notStrictEqual(resultA.ref.nonce, resultB.ref.nonce);
  });
  test("rebundle clears previous tree", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/first.md", "first version");
    await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    const destUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/first.md" });
    const content = await fileService.readFile(destUri);
    assert.strictEqual(content.value.toString(), "first version");
    const uri2 = await seedFile("/test/second.md", "second version");
    await bundler.bundle([{ uri: uri2, type: PromptsType.instructions }]);
    let threw = false;
    try {
      await fileService.readFile(destUri);
    } catch {
      threw = true;
    }
    assert.ok(threw, "old file should have been deleted by rebundle");
    const newContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/second.md" }));
    assert.strictEqual(newContent.value.toString(), "second version");
  });
  test("unchanged rebundle reuses the previous result without touching the tree", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/stable.md", "unchanged content");
    const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.ok(result1);
    const sentinel = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/sentinel.txt" });
    await fileService.writeFile(sentinel, VSBuffer.fromString("keep me"));
    const result2 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.strictEqual(result2, result1);
    const survived = await fileService.readFile(sentinel);
    assert.strictEqual(survived.value.toString(), "keep me");
  });
  test("changed rebundle deletes the previous tree", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/changing.md", "v1");
    const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.ok(result1);
    const sentinel = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/sentinel.txt" });
    await fileService.writeFile(sentinel, VSBuffer.fromString("remove me"));
    await fileService.writeFile(uri, VSBuffer.fromString("v2"));
    const result2 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.notStrictEqual(result2, result1);
    assert.notStrictEqual(result2.ref.nonce, result1.ref.nonce);
    let threw = false;
    try {
      await fileService.readFile(sentinel);
    } catch {
      threw = true;
    }
    assert.ok(threw, "sentinel should be deleted when content changes");
  });
  test("unchanged MCP-only rebundle reuses the previous result", async () => {
    const bundler = createBundler();
    const server = enabledMcpServer("srv", { type: McpServerType.LOCAL, command: "srv" });
    const result1 = await bundler.bundle([], [server]);
    assert.ok(result1);
    const sentinel = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/sentinel.txt" });
    await fileService.writeFile(sentinel, VSBuffer.fromString("keep me"));
    const result2 = await bundler.bundle([], [server]);
    assert.strictEqual(result2, result1);
    const survived = await fileService.readFile(sentinel);
    assert.strictEqual(survived.value.toString(), "keep me");
  });
  test("reused rebundle still detects a later content change", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/evolving.md", "v1");
    const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    const result2 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.strictEqual(result2, result1);
    await fileService.writeFile(uri, VSBuffer.fromString("v2"));
    const result3 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.notStrictEqual(result3, result1);
    assert.notStrictEqual(result3.ref.nonce, result1.ref.nonce);
    const written = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/evolving.md" }));
    assert.strictEqual(written.value.toString(), "v2");
  });
  test("lastNonce is unchanged after a reused rebundle", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/stable.md", "unchanged content");
    const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    assert.strictEqual(bundler.lastNonce, result1.ref.nonce);
  });
  test("removing a file from the set rebuilds the tree", async () => {
    const bundler = createBundler();
    const uriA = await seedFile("/test/keep.md", "A");
    const uriB = await seedFile("/test/drop.md", "B");
    await bundler.bundle([
      { uri: uriA, type: PromptsType.instructions },
      { uri: uriB, type: PromptsType.instructions }
    ]);
    await bundler.bundle([{ uri: uriA, type: PromptsType.instructions }]);
    const kept = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/keep.md" }));
    assert.strictEqual(kept.value.toString(), "A");
    let threw = false;
    try {
      await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/drop.md" }));
    } catch {
      threw = true;
    }
    assert.ok(threw, "dropped file should be removed when the file set changes");
  });
  test("changed MCP-only rebundle rewrites .mcp.json", async () => {
    const bundler = createBundler();
    const mcpUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/.mcp.json" });
    await bundler.bundle([], [enabledMcpServer("srv", { type: McpServerType.LOCAL, command: "v1" })]);
    await bundler.bundle([], [enabledMcpServer("srv", { type: McpServerType.LOCAL, command: "v2" })]);
    const parsed = JSON.parse((await fileService.readFile(mcpUri)).value.toString());
    assert.deepStrictEqual(parsed, {
      mcpServers: { srv: { type: McpServerType.LOCAL, command: "v2" } }
    });
  });
  test("bundle description includes file count", async () => {
    const bundler = createBundler();
    const uriA = await seedFile("/test/a.md", "A");
    const uriB = await seedFile("/test/b.md", "B");
    const uriC = await seedFile("/test/c.md", "C");
    const result = await bundler.bundle([
      { uri: uriA, type: PromptsType.instructions },
      { uri: uriB, type: PromptsType.agent },
      { uri: uriC, type: PromptsType.prompt }
    ]);
    assert.ok(result);
    assert.ok(result.ref.nonce, "should produce a nonce reflecting the bundled files");
  });
  test("writes MCP servers into .mcp.json", async () => {
    const bundler = createBundler();
    const result = await bundler.bundle([], [
      enabledMcpServer("my-server", { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"] })
    ]);
    assert.ok(result, "a bundle with only MCP servers should still produce a result");
    const mcpUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/.mcp.json" });
    const parsed = JSON.parse((await fileService.readFile(mcpUri)).value.toString());
    assert.deepStrictEqual(parsed, {
      mcpServers: { "my-server": { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"] } }
    });
    assert.deepStrictEqual(result.ref.childEnablement, {
      "my-server": [{ kind: CustomizationEnablementKind.Global, enabled: true }]
    });
    assert.deepStrictEqual([
      bundler.isBundledMcpServer(result.ref.uri, "my-server"),
      bundler.isBundledMcpServer(result.ref.uri, "other-server"),
      bundler.isBundledMcpServer("vscode-synced-customization:///other-plugin", "my-server")
    ], [true, false, false]);
  });
  test("MCP server bundle nonce is stable and order-independent", async () => {
    const bundler = createBundler();
    const a = enabledMcpServer("a", { type: McpServerType.LOCAL, command: "a" });
    const b = enabledMcpServer("b", { type: McpServerType.LOCAL, command: "b" });
    const result1 = await bundler.bundle([], [a, b]);
    const result2 = await bundler.bundle([], [b, a]);
    assert.strictEqual(result1.ref.nonce, result2.ref.nonce);
  });
  test("MCP server bundle nonce changes when a server changes", async () => {
    const bundler = createBundler();
    const result1 = await bundler.bundle([], [enabledMcpServer("srv", { type: McpServerType.LOCAL, command: "v1" })]);
    const result2 = await bundler.bundle([], [enabledMcpServer("srv", { type: McpServerType.LOCAL, command: "v2" })]);
    assert.notStrictEqual(result1.ref.nonce, result2.ref.nonce);
  });
  test("getOrigin recovers provenance of flattened files by synced URI", async () => {
    const bundler = createBundler();
    const extUri = await seedFile("/ext/rule.md", "ext rule");
    const skillMd = await seedFile("/plugins/my-skill/SKILL.md", "# skill");
    await bundler.bundle([
      { uri: extUri, type: PromptsType.instructions, source: "extension", extensionId: "pub.ext" },
      { uri: skillMd, type: PromptsType.skill, source: "plugin", pluginUri: URI.from({ scheme: Schemas.inMemory, path: "/plugins/my-skill" }) }
    ]);
    const ruleDest = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/rule.md" });
    assert.deepStrictEqual(bundler.getOrigin(ruleDest), {
      uri: extUri,
      source: "extension",
      extensionId: "pub.ext",
      pluginUri: void 0
    });
    const skillDest = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/skills/my-skill/SKILL.md" });
    assert.deepStrictEqual(bundler.getOrigin(skillDest), {
      uri: skillMd,
      source: "plugin",
      extensionId: void 0,
      pluginUri: URI.from({ scheme: Schemas.inMemory, path: "/plugins/my-skill" })
    });
    assert.strictEqual(bundler.getOrigin(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/unknown.md" })), void 0);
  });
  test("getOrigin has no entry for files without a source", async () => {
    const bundler = createBundler();
    const uri = await seedFile("/test/rule.md", "rule");
    await bundler.bundle([{ uri, type: PromptsType.instructions }]);
    const dest = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/rule.md" });
    assert.strictEqual(bundler.getOrigin(dest), void 0);
  });
  test("getOrigin map refreshes on each bundle", async () => {
    const bundler = createBundler();
    const first = await seedFile("/test/first.md", "first");
    await bundler.bundle([{ uri: first, type: PromptsType.instructions, source: "extension", extensionId: "pub.first" }]);
    const firstDest = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/first.md" });
    assert.ok(bundler.getOrigin(firstDest));
    const second = await seedFile("/test/second.md", "second");
    await bundler.bundle([{ uri: second, type: PromptsType.instructions, source: "plugin" }]);
    assert.strictEqual(bundler.getOrigin(firstDest), void 0);
    assert.ok(bundler.getOrigin(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: "/test-agent/rules/second.md" })));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXHN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyVHlwZSwgdHlwZSBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IHR5cGUgSVN5bmNhYmxlTWNwU2VydmVyLCBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3Qvc3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlLCBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcblxuc3VpdGUoJ1N5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgZmlsZVNlcnZpY2U6IEZpbGVTZXJ2aWNlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRjb25zdCBlbmFibGVkTWNwU2VydmVyID0gKG5hbWU6IHN0cmluZywgY29uZmlndXJhdGlvbjogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24pOiBJU3luY2FibGVNY3BTZXJ2ZXIgPT4gKHtcblx0XHRuYW1lLFxuXHRcdGNvbmZpZ3VyYXRpb24sXG5cdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogdHJ1ZSB9XSxcblx0fSk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IG1lbUZzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmluTWVtb3J5LCBtZW1GcykpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIHN5bmNlZC1jdXN0b21pemF0aW9uIHNjaGVtZSB2aWEgYSBtb2NrIHNlcnZpY2Vcblx0XHRjb25zdCBzeW5jZWRQcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBzeW5jZWRQcm92aWRlcikpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZSwgeyBlbnN1cmVTeW5jZWRDdXN0b21pemF0aW9uUHJvdmlkZXIoKSB7IC8qIGFscmVhZHkgcmVnaXN0ZXJlZCBhYm92ZSAqLyB9IH0pO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUJ1bmRsZXIoYXV0aG9yaXR5ID0gJ3Rlc3QtYWdlbnQnKTogU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsIGF1dGhvcml0eSkpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gc2VlZEZpbGUocGF0aDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoIH0pO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdHJldHVybiB1cmk7XG5cdH1cblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZW1wdHkgZmlsZSBsaXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gYWxsIGZpbGVzIGhhdmUgdW5zdXBwb3J0ZWQgdHlwZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCB1cmkgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3QvaG9va3MuanNvbicsICd7fScpO1xuXHRcdC8vIEhvb2tzIGFyZSBub3Qgc3VwcG9ydGVkIGJ5IHRoZSBidW5kbGVyIHlldFxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaG9vayB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYnVuZGxlcyBpbnN0cnVjdGlvbiBmaWxlcyBpbnRvIHJ1bGVzIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHVyaSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9teS1ydWxlcy5tZCcsICcjIE15IHJ1bGVzXFxuRG8gWCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQsICdzaG91bGQgcmV0dXJuIGEgcmVzdWx0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5yZWYudXJpLCAnc2hvdWxkIGhhdmUgYSBVUkknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnJlZi5uYW1lLCAnVlMgQ29kZSBTeW5jZWQgRGF0YScpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQucmVmLm5vbmNlLCAnc2hvdWxkIGhhdmUgYSBub25jZScpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBmaWxlIHdhcyB3cml0dGVuIHRvIHRoZSBpbi1tZW1vcnkgRlNcblx0XHRjb25zdCBkZXN0VXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3J1bGVzL215LXJ1bGVzLm1kJyB9KTtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoZGVzdFVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJyMgTXkgcnVsZXNcXG5EbyBYJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1bmRsZXMgZmlsZXMgaW50byBjb3JyZWN0IGRpcmVjdG9yaWVzIGJ5IHR5cGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBpbnN0clVyaSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9ydWxlLm1kJywgJ3J1bGUgY29udGVudCcpO1xuXHRcdGNvbnN0IHByb21wdFVyaSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9jbWQucHJvbXB0Lm1kJywgJ3Byb21wdCBjb250ZW50Jyk7XG5cdFx0Y29uc3QgYWdlbnRVcmkgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3QvbXktYWdlbnQubWQnLCAnYWdlbnQgY29udGVudCcpO1xuXHRcdGNvbnN0IHNraWxsVXJpID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L215LXNraWxsLm1kJywgJ3NraWxsIGNvbnRlbnQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFtcblx0XHRcdHsgdXJpOiBpbnN0clVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH0sXG5cdFx0XHR7IHVyaTogcHJvbXB0VXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQgfSxcblx0XHRcdHsgdXJpOiBhZ2VudFVyaSwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQgfSxcblx0XHRcdHsgdXJpOiBza2lsbFVyaSwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQub2socmVzdWx0KTtcblxuXHRcdC8vIFZlcmlmeSBlYWNoIGZpbGUgbGFuZGVkIGluIHRoZSBjb3JyZWN0IGRpcmVjdG9yeVxuXHRcdGNvbnN0IHJ1bGVDb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3J1bGVzL3J1bGUubWQnIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJ3J1bGUgY29udGVudCcpO1xuXG5cdFx0Y29uc3QgY21kQ29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9jb21tYW5kcy9jbWQucHJvbXB0Lm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNtZENvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJ3Byb21wdCBjb250ZW50Jyk7XG5cblx0XHRjb25zdCBhZ2VudENvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvYWdlbnRzL215LWFnZW50Lm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50Q29udGVudC52YWx1ZS50b1N0cmluZygpLCAnYWdlbnQgY29udGVudCcpO1xuXG5cdFx0Ly8gTm9uLVNLSUxMLm1kIHNraWxsIGZpbGVzIGFyZSB3cml0dGVuIGZsYXRcblx0XHRjb25zdCBza2lsbENvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvc2tpbGxzL215LXNraWxsLm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNraWxsQ29udGVudC52YWx1ZS50b1N0cmluZygpLCAnc2tpbGwgY29udGVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdidW5kbGVzIFNLSUxMLm1kIGZpbGVzIGludG8gcGVyLXNraWxsIHN1YmRpcmVjdG9yaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3Qgc2tpbGxBID0gYXdhaXQgc2VlZEZpbGUoJy9za2lsbHMvc2tpbGwtYS9TS0lMTC5tZCcsICdza2lsbCBBIGNvbnRlbnQnKTtcblx0XHRjb25zdCBza2lsbEIgPSBhd2FpdCBzZWVkRmlsZSgnL3NraWxscy9za2lsbC1iL1NLSUxMLm1kJywgJ3NraWxsIEIgY29udGVudCcpO1xuXHRcdGNvbnN0IHNraWxsQyA9IGF3YWl0IHNlZWRGaWxlKCcvc2tpbGxzL215LWNvb2wtc2tpbGwvU0tJTEwubWQnLCAnc2tpbGwgQyBjb250ZW50Jyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbXG5cdFx0XHR7IHVyaTogc2tpbGxBLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCB9LFxuXHRcdFx0eyB1cmk6IHNraWxsQiwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwgfSxcblx0XHRcdHsgdXJpOiBza2lsbEMsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cblx0XHQvLyBFYWNoIFNLSUxMLm1kIHNob3VsZCBiZSBpbiBpdHMgb3duIHN1YmRpcmVjdG9yeSAobmFtZWQgYWZ0ZXIgdGhlIHBhcmVudCBmb2xkZXIpXG5cdFx0Y29uc3QgY29udGVudEEgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvc2tpbGxzL3NraWxsLWEvU0tJTEwubWQnIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudEEudmFsdWUudG9TdHJpbmcoKSwgJ3NraWxsIEEgY29udGVudCcpO1xuXG5cdFx0Y29uc3QgY29udGVudEIgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvc2tpbGxzL3NraWxsLWIvU0tJTEwubWQnIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudEIudmFsdWUudG9TdHJpbmcoKSwgJ3NraWxsIEIgY29udGVudCcpO1xuXG5cdFx0Y29uc3QgY29udGVudEMgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvc2tpbGxzL215LWNvb2wtc2tpbGwvU0tJTEwubWQnIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudEMudmFsdWUudG9TdHJpbmcoKSwgJ3NraWxsIEMgY29udGVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZXMgcGx1Z2luIG1hbmlmZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3QgdXJpID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L2ZpbGUubWQnLCAnY29udGVudCcpO1xuXG5cdFx0YXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXG5cdFx0Y29uc3QgbWFuaWZlc3RVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvLnBsdWdpbi9wbHVnaW4uanNvbicgfSk7XG5cdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShtYW5pZmVzdFVyaSk7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShtYW5pZmVzdC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLm5hbWUsICdWUyBDb2RlIFN5bmNlZCBEYXRhJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vbmNlIGlzIHN0YWJsZSBmb3Igc2FtZSBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3QgdXJpID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L3N0YWJsZS5tZCcsICdzYW1lIGNvbnRlbnQnKTtcblxuXHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbeyB1cmksIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XSk7XG5cdFx0Y29uc3QgcmVzdWx0MiA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MSEucmVmLm5vbmNlLCByZXN1bHQyIS5yZWYubm9uY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdub25jZSBjaGFuZ2VzIHdoZW4gY29udGVudCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3QgdXJpID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L2NoYW5naW5nLm1kJywgJ3YxJyk7XG5cblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3YyJykpO1xuXHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbeyB1cmksIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlc3VsdDEhLnJlZi5ub25jZSwgcmVzdWx0MiEucmVmLm5vbmNlKTtcblx0fSk7XG5cblx0dGVzdCgnbm9uY2UgaXMgb3JkZXItaW5kZXBlbmRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCB1cmlBID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L2EubWQnLCAnQScpO1xuXHRcdGNvbnN0IHVyaUIgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3QvYi5tZCcsICdCJyk7XG5cblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW1xuXHRcdFx0eyB1cmk6IHVyaUEsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9LFxuXHRcdFx0eyB1cmk6IHVyaUIsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbXG5cdFx0XHR7IHVyaTogdXJpQiwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH0sXG5cdFx0XHR7IHVyaTogdXJpQSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEhLnJlZi5ub25jZSwgcmVzdWx0MiEucmVmLm5vbmNlKTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZmVyZW50IGF1dGhvcml0aWVzIGRvIG5vdCBjb25mbGljdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyQSA9IGNyZWF0ZUJ1bmRsZXIoJ2FnZW50LWEnKTtcblx0XHRjb25zdCBidW5kbGVyQiA9IGNyZWF0ZUJ1bmRsZXIoJ2FnZW50LWInKTtcblx0XHRjb25zdCB1cmkgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3Qvc2hhcmVkLm1kJywgJ3NoYXJlZCBjb250ZW50Jyk7XG5cblx0XHRhd2FpdCBidW5kbGVyQS5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXHRcdGF3YWl0IGJ1bmRsZXJCLmJ1bmRsZShbeyB1cmksIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XSk7XG5cblx0XHQvLyBCb3RoIHNob3VsZCBoYXZlIHRoZWlyIG93biBjb3B5XG5cdFx0Y29uc3QgY29udGVudEEgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL2FnZW50LWEvcnVsZXMvc2hhcmVkLm1kJyB9KSk7XG5cdFx0Y29uc3QgY29udGVudEIgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL2FnZW50LWIvcnVsZXMvc2hhcmVkLm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRBLnZhbHVlLnRvU3RyaW5nKCksICdzaGFyZWQgY29udGVudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50Qi52YWx1ZS50b1N0cmluZygpLCAnc2hhcmVkIGNvbnRlbnQnKTtcblx0fSk7XG5cblx0dGVzdCgnbGFzdE5vbmNlIHRyYWNrcyB0aGUgbW9zdCByZWNlbnQgYnVuZGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIubGFzdE5vbmNlLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgdXJpID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L3RyYWNrLm1kJywgJ3RyYWNraW5nJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLmxhc3ROb25jZSwgcmVzdWx0IS5yZWYubm9uY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdTS0lMTC5tZCBmaWxlcyB3aXRoIHNhbWUgYmFzZW5hbWUgZG8gbm90IG92ZXJ3cml0ZSBlYWNoIG90aGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Ly8gQm90aCBmaWxlcyBoYXZlIHRoZSBzYW1lIGJhc2VuYW1lIFwiU0tJTEwubWRcIiBcdTIwMTQgdGhlIGNvbGxpc2lvbiBidWdcblx0XHQvLyBjYXVzZWQgYWxsIHNraWxscyB0byBvdmVyd3JpdGUgZWFjaCBvdGhlciBhdCBza2lsbHMvU0tJTEwubWQuXG5cdFx0Y29uc3Qgc2tpbGxBID0gYXdhaXQgc2VlZEZpbGUoJy9za2lsbHMvYWxwaGEvU0tJTEwubWQnLCAnYWxwaGEgc2tpbGwnKTtcblx0XHRjb25zdCBza2lsbEIgPSBhd2FpdCBzZWVkRmlsZSgnL3NraWxscy9iZXRhL1NLSUxMLm1kJywgJ2JldGEgc2tpbGwnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFtcblx0XHRcdHsgdXJpOiBza2lsbEEsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH0sXG5cdFx0XHR7IHVyaTogc2tpbGxCLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXG5cdFx0Ly8gQm90aCBzaG91bGQgYmUgcHJlc2VydmVkIGluIHNlcGFyYXRlIHN1YmRpcmVjdG9yaWVzXG5cdFx0Y29uc3QgY29udGVudEEgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvc2tpbGxzL2FscGhhL1NLSUxMLm1kJyB9KSk7XG5cdFx0Y29uc3QgY29udGVudEIgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvc2tpbGxzL2JldGEvU0tJTEwubWQnIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudEEudmFsdWUudG9TdHJpbmcoKSwgJ2FscGhhIHNraWxsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRCLnZhbHVlLnRvU3RyaW5nKCksICdiZXRhIHNraWxsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vbi1TS0lMTC5tZCBza2lsbCBmaWxlcyBhcmUgd3JpdHRlbiBmbGF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3Qgc2tpbGxVcmkgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3QvbXktaGVscGVyLm1kJywgJ2hlbHBlciBza2lsbCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpOiBza2lsbFVyaSwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwgfV0pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXG5cdFx0Ly8gTm9uLVNLSUxMLm1kIGZpbGVzIGdvIGRpcmVjdGx5IHVuZGVyIHNraWxscy8gd2l0aG91dCBzdWJkaXJlY3Rvcnlcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3NraWxscy9teS1oZWxwZXIubWQnIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS50b1N0cmluZygpLCAnaGVscGVyIHNraWxsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21peGVkIFNLSUxMLm1kIGFuZCBub24tU0tJTEwubWQgc2tpbGwgZmlsZXMgY29leGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHNraWxsRGlyID0gYXdhaXQgc2VlZEZpbGUoJy9za2lsbHMvY291bmNpbC1wbGFuL1NLSUxMLm1kJywgJ2NvdW5jaWwgcGxhbicpO1xuXHRcdGNvbnN0IHNraWxsRmxhdCA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9xdWljay1maXgubWQnLCAncXVpY2sgZml4Jyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbXG5cdFx0XHR7IHVyaTogc2tpbGxEaXIsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH0sXG5cdFx0XHR7IHVyaTogc2tpbGxGbGF0LCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXG5cdFx0Y29uc3QgY29udGVudEEgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvc2tpbGxzL2NvdW5jaWwtcGxhbi9TS0lMTC5tZCcgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50QS52YWx1ZS50b1N0cmluZygpLCAnY291bmNpbCBwbGFuJyk7XG5cblx0XHRjb25zdCBjb250ZW50QiA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9za2lsbHMvcXVpY2stZml4Lm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRCLnZhbHVlLnRvU3RyaW5nKCksICdxdWljayBmaXgnKTtcblx0fSk7XG5cblx0dGVzdCgnU0tJTEwubWQgbm9uY2UgaW5jbHVkZXMgc3ViZGlyZWN0b3J5IHBhdGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHQvLyBUd28gc2tpbGxzIHdpdGggc2FtZSBjb250ZW50IGJ1dCBkaWZmZXJlbnQgcGFyZW50IGRpcnMgc2hvdWxkIHByb2R1Y2Vcblx0XHQvLyBkaWZmZXJlbnQgbm9uY2VzIGJlY2F1c2UgdGhlaXIgaGFzaCBrZXlzIGluY2x1ZGUgdGhlIHN1YmRpcmVjdG9yeS5cblx0XHRjb25zdCBza2lsbEEgPSBhd2FpdCBzZWVkRmlsZSgnL3NraWxscy9za2lsbC14L1NLSUxMLm1kJywgJ3NhbWUgY29udGVudCcpO1xuXHRcdGNvbnN0IHNraWxsQiA9IGF3YWl0IHNlZWRGaWxlKCcvc2tpbGxzL3NraWxsLXkvU0tJTEwubWQnLCAnc2FtZSBjb250ZW50Jyk7XG5cblx0XHRjb25zdCByZXN1bHRBID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpOiBza2lsbEEsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH1dKTtcblx0XHRjb25zdCByZXN1bHRCID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpOiBza2lsbEIsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH1dKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocmVzdWx0QSEucmVmLm5vbmNlLCByZXN1bHRCIS5yZWYubm9uY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWJ1bmRsZSBjbGVhcnMgcHJldmlvdXMgdHJlZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHVyaSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9maXJzdC5tZCcsICdmaXJzdCB2ZXJzaW9uJyk7XG5cblx0XHRhd2FpdCBidW5kbGVyLmJ1bmRsZShbeyB1cmksIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XSk7XG5cblx0XHQvLyBWZXJpZnkgdGhlIGZpcnN0IGZpbGUgZXhpc3RzXG5cdFx0Y29uc3QgZGVzdFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9ydWxlcy9maXJzdC5tZCcgfSk7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGRlc3RVcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLnRvU3RyaW5nKCksICdmaXJzdCB2ZXJzaW9uJyk7XG5cblx0XHQvLyBSZS1idW5kbGUgd2l0aCBhIGRpZmZlcmVudCBmaWxlIFx1MjAxNCBvbGQgZmlsZSBzaG91bGQgYmUgZ29uZVxuXHRcdGNvbnN0IHVyaTIgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3Qvc2Vjb25kLm1kJywgJ3NlY29uZCB2ZXJzaW9uJyk7XG5cdFx0YXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpOiB1cmkyLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXG5cdFx0bGV0IHRocmV3ID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGRlc3RVcmkpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhyZXcgPSB0cnVlO1xuXHRcdH1cblx0XHRhc3NlcnQub2sodGhyZXcsICdvbGQgZmlsZSBzaG91bGQgaGF2ZSBiZWVuIGRlbGV0ZWQgYnkgcmVidW5kbGUnKTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvcnVsZXMvc2Vjb25kLm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld0NvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJ3NlY29uZCB2ZXJzaW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuY2hhbmdlZCByZWJ1bmRsZSByZXVzZXMgdGhlIHByZXZpb3VzIHJlc3VsdCB3aXRob3V0IHRvdWNoaW5nIHRoZSB0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cdFx0Y29uc3QgdXJpID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L3N0YWJsZS5tZCcsICd1bmNoYW5nZWQgY29udGVudCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0MSA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKTtcblx0XHRhc3NlcnQub2socmVzdWx0MSk7XG5cblx0XHQvLyBEcm9wIGEgc2VudGluZWwgZmlsZSBpbnRvIHRoZSB0cmVlLiBBIGRlc3RydWN0aXZlIHJlYnVuZGxlIHdvdWxkIHdpcGUgaXQ7XG5cdFx0Ly8gYSBza2lwcGVkIHJlYnVuZGxlIGxlYXZlcyBpdCB1bnRvdWNoZWQuXG5cdFx0Y29uc3Qgc2VudGluZWwgPSBVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvc2VudGluZWwudHh0JyB9KTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc2VudGluZWwsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2tlZXAgbWUnKSk7XG5cblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXG5cdFx0Ly8gVGhlIGV4YWN0IHNhbWUgcmVzdWx0IG9iamVjdCBpcyByZXR1cm5lZCBhbmQgdGhlIHNlbnRpbmVsIHN1cnZpdmVzLFxuXHRcdC8vIHByb3ZpbmcgdGhlIGRlbGV0ZSArIHJld3JpdGUgd2FzIHNraXBwZWQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDIsIHJlc3VsdDEpO1xuXHRcdGNvbnN0IHN1cnZpdmVkID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoc2VudGluZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdXJ2aXZlZC52YWx1ZS50b1N0cmluZygpLCAna2VlcCBtZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2VkIHJlYnVuZGxlIGRlbGV0ZXMgdGhlIHByZXZpb3VzIHRyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCB1cmkgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3QvY2hhbmdpbmcubWQnLCAndjEnKTtcblxuXHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbeyB1cmksIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdDEpO1xuXG5cdFx0Ly8gU2VudGluZWwgdGhhdCBzaG91bGQgYmUgcmVtb3ZlZCB3aGVuIHRoZSB0cmVlIGlzIHJlYnVpbHQuXG5cdFx0Y29uc3Qgc2VudGluZWwgPSBVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvc2VudGluZWwudHh0JyB9KTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc2VudGluZWwsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3JlbW92ZSBtZScpKTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3YyJykpO1xuXHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbeyB1cmksIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XSk7XG5cblx0XHQvLyBBIGZyZXNoIHJlc3VsdCBpcyBwcm9kdWNlZCBhbmQgdGhlIHNlbnRpbmVsIGlzIGdvbmUuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlc3VsdDIsIHJlc3VsdDEpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZXN1bHQyIS5yZWYubm9uY2UsIHJlc3VsdDEucmVmLm5vbmNlKTtcblx0XHRsZXQgdGhyZXcgPSBmYWxzZTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoc2VudGluZWwpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhyZXcgPSB0cnVlO1xuXHRcdH1cblx0XHRhc3NlcnQub2sodGhyZXcsICdzZW50aW5lbCBzaG91bGQgYmUgZGVsZXRlZCB3aGVuIGNvbnRlbnQgY2hhbmdlcycpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmNoYW5nZWQgTUNQLW9ubHkgcmVidW5kbGUgcmV1c2VzIHRoZSBwcmV2aW91cyByZXN1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBzZXJ2ZXIgPSBlbmFibGVkTWNwU2VydmVyKCdzcnYnLCB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICdzcnYnIH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0MSA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFtdLCBbc2VydmVyXSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdDEpO1xuXG5cdFx0Y29uc3Qgc2VudGluZWwgPSBVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvc2VudGluZWwudHh0JyB9KTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc2VudGluZWwsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2tlZXAgbWUnKSk7XG5cblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW10sIFtzZXJ2ZXJdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLCByZXN1bHQxKTtcblx0XHRjb25zdCBzdXJ2aXZlZCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHNlbnRpbmVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Vydml2ZWQudmFsdWUudG9TdHJpbmcoKSwgJ2tlZXAgbWUnKTtcblx0fSk7XG5cblx0dGVzdCgncmV1c2VkIHJlYnVuZGxlIHN0aWxsIGRldGVjdHMgYSBsYXRlciBjb250ZW50IGNoYW5nZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHVyaSA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9ldm9sdmluZy5tZCcsICd2MScpO1xuXG5cdFx0Y29uc3QgcmVzdWx0MSA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKTtcblx0XHQvLyBTZWNvbmQgYnVuZGxlIGlzIGlkZW50aWNhbCBhbmQgc2hvdWxkIGJlIHJldXNlZCAoc2tpcCBwYXRoKS5cblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLCByZXN1bHQxKTtcblxuXHRcdC8vIEEgY2hhbmdlIGFmdGVyIGEgcmV1c2VkIHJlYnVuZGxlIG11c3Qgc3RpbGwgdHJpZ2dlciBhIHJlYnVpbGQgXHUyMDE0IHRoZVxuXHRcdC8vIHJldXNlIHBhdGggbXVzdCBub3QgcG9pc29uIHRoZSBjYWNoZWQgbm9uY2UvcmVzdWx0LlxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3YyJykpO1xuXHRcdGNvbnN0IHJlc3VsdDMgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbeyB1cmksIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9XSk7XG5cblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocmVzdWx0MywgcmVzdWx0MSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlc3VsdDMhLnJlZi5ub25jZSwgcmVzdWx0MSEucmVmLm5vbmNlKTtcblx0XHRjb25zdCB3cml0dGVuID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSwgcGF0aDogJy90ZXN0LWFnZW50L3J1bGVzL2V2b2x2aW5nLm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdyaXR0ZW4udmFsdWUudG9TdHJpbmcoKSwgJ3YyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhc3ROb25jZSBpcyB1bmNoYW5nZWQgYWZ0ZXIgYSByZXVzZWQgcmVidW5kbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCB1cmkgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3Qvc3RhYmxlLm1kJywgJ3VuY2hhbmdlZCBjb250ZW50Jyk7XG5cblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXHRcdGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFt7IHVyaSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLmxhc3ROb25jZSwgcmVzdWx0MSEucmVmLm5vbmNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZpbmcgYSBmaWxlIGZyb20gdGhlIHNldCByZWJ1aWxkcyB0aGUgdHJlZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHVyaUEgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3Qva2VlcC5tZCcsICdBJyk7XG5cdFx0Y29uc3QgdXJpQiA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9kcm9wLm1kJywgJ0InKTtcblxuXHRcdGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFtcblx0XHRcdHsgdXJpOiB1cmlBLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfSxcblx0XHRcdHsgdXJpOiB1cmlCLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfSxcblx0XHRdKTtcblxuXHRcdC8vIFJlLWJ1bmRsZSB3aXRoIG9ubHkgdGhlIGZpcnN0IGZpbGUgXHUyMDE0IHRoZSBkcm9wcGVkIGZpbGUgc2hvdWxkIGJlIGdvbmUuXG5cdFx0YXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpOiB1cmlBLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXG5cdFx0Y29uc3Qga2VwdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9ydWxlcy9rZWVwLm1kJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGtlcHQudmFsdWUudG9TdHJpbmcoKSwgJ0EnKTtcblxuXHRcdGxldCB0aHJldyA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvcnVsZXMvZHJvcC5tZCcgfSkpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhyZXcgPSB0cnVlO1xuXHRcdH1cblx0XHRhc3NlcnQub2sodGhyZXcsICdkcm9wcGVkIGZpbGUgc2hvdWxkIGJlIHJlbW92ZWQgd2hlbiB0aGUgZmlsZSBzZXQgY2hhbmdlcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2VkIE1DUC1vbmx5IHJlYnVuZGxlIHJld3JpdGVzIC5tY3AuanNvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IG1jcFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC8ubWNwLmpzb24nIH0pO1xuXG5cdFx0YXdhaXQgYnVuZGxlci5idW5kbGUoW10sIFtlbmFibGVkTWNwU2VydmVyKCdzcnYnLCB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICd2MScgfSldKTtcblx0XHRhd2FpdCBidW5kbGVyLmJ1bmRsZShbXSwgW2VuYWJsZWRNY3BTZXJ2ZXIoJ3NydicsIHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ3YyJyB9KV0pO1xuXG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZSgoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUobWNwVXJpKSkudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQsIHtcblx0XHRcdG1jcFNlcnZlcnM6IHsgc3J2OiB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICd2MicgfSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidW5kbGUgZGVzY3JpcHRpb24gaW5jbHVkZXMgZmlsZSBjb3VudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IHVyaUEgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3QvYS5tZCcsICdBJyk7XG5cdFx0Y29uc3QgdXJpQiA9IGF3YWl0IHNlZWRGaWxlKCcvdGVzdC9iLm1kJywgJ0InKTtcblx0XHRjb25zdCB1cmlDID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L2MubWQnLCAnQycpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW1xuXHRcdFx0eyB1cmk6IHVyaUEsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyB9LFxuXHRcdFx0eyB1cmk6IHVyaUIsIHR5cGU6IFByb21wdHNUeXBlLmFnZW50IH0sXG5cdFx0XHR7IHVyaTogdXJpQywgdHlwZTogUHJvbXB0c1R5cGUucHJvbXB0IH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5yZWYubm9uY2UsICdzaG91bGQgcHJvZHVjZSBhIG5vbmNlIHJlZmxlY3RpbmcgdGhlIGJ1bmRsZWQgZmlsZXMnKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVzIE1DUCBzZXJ2ZXJzIGludG8gLm1jcC5qc29uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBjcmVhdGVCdW5kbGVyKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbXSwgW1xuXHRcdFx0ZW5hYmxlZE1jcFNlcnZlcignbXktc2VydmVyJywgeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAnbXktc2VydmVyJywgYXJnczogWyctLWZsYWcnXSB9KSxcblx0XHRdKTtcblx0XHRhc3NlcnQub2socmVzdWx0LCAnYSBidW5kbGUgd2l0aCBvbmx5IE1DUCBzZXJ2ZXJzIHNob3VsZCBzdGlsbCBwcm9kdWNlIGEgcmVzdWx0Jyk7XG5cblx0XHRjb25zdCBtY3BVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvLm1jcC5qc29uJyB9KTtcblx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShtY3BVcmkpKS52YWx1ZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwge1xuXHRcdFx0bWNwU2VydmVyczogeyAnbXktc2VydmVyJzogeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAnbXktc2VydmVyJywgYXJnczogWyctLWZsYWcnXSB9IH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQucmVmLmNoaWxkRW5hYmxlbWVudCwge1xuXHRcdFx0J215LXNlcnZlcic6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IHRydWUgfV0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRidW5kbGVyLmlzQnVuZGxlZE1jcFNlcnZlcihyZXN1bHQucmVmLnVyaSwgJ215LXNlcnZlcicpLFxuXHRcdFx0YnVuZGxlci5pc0J1bmRsZWRNY3BTZXJ2ZXIocmVzdWx0LnJlZi51cmksICdvdGhlci1zZXJ2ZXInKSxcblx0XHRcdGJ1bmRsZXIuaXNCdW5kbGVkTWNwU2VydmVyKCd2c2NvZGUtc3luY2VkLWN1c3RvbWl6YXRpb246Ly8vb3RoZXItcGx1Z2luJywgJ215LXNlcnZlcicpLFxuXHRcdF0sIFt0cnVlLCBmYWxzZSwgZmFsc2VdKTtcblx0fSk7XG5cblx0dGVzdCgnTUNQIHNlcnZlciBidW5kbGUgbm9uY2UgaXMgc3RhYmxlIGFuZCBvcmRlci1pbmRlcGVuZGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IGEgPSBlbmFibGVkTWNwU2VydmVyKCdhJywgeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAnYScgfSk7XG5cdFx0Y29uc3QgYiA9IGVuYWJsZWRNY3BTZXJ2ZXIoJ2InLCB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICdiJyB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShbXSwgW2EsIGJdKTtcblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW10sIFtiLCBhXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEhLnJlZi5ub25jZSwgcmVzdWx0MiEucmVmLm5vbmNlKTtcblx0fSk7XG5cblx0dGVzdCgnTUNQIHNlcnZlciBidW5kbGUgbm9uY2UgY2hhbmdlcyB3aGVuIGEgc2VydmVyIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW10sIFtlbmFibGVkTWNwU2VydmVyKCdzcnYnLCB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICd2MScgfSldKTtcblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgYnVuZGxlci5idW5kbGUoW10sIFtlbmFibGVkTWNwU2VydmVyKCdzcnYnLCB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICd2MicgfSldKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocmVzdWx0MSEucmVmLm5vbmNlLCByZXN1bHQyIS5yZWYubm9uY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRPcmlnaW4gcmVjb3ZlcnMgcHJvdmVuYW5jZSBvZiBmbGF0dGVuZWQgZmlsZXMgYnkgc3luY2VkIFVSSScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IGV4dFVyaSA9IGF3YWl0IHNlZWRGaWxlKCcvZXh0L3J1bGUubWQnLCAnZXh0IHJ1bGUnKTtcblx0XHRjb25zdCBza2lsbE1kID0gYXdhaXQgc2VlZEZpbGUoJy9wbHVnaW5zL215LXNraWxsL1NLSUxMLm1kJywgJyMgc2tpbGwnKTtcblxuXHRcdGF3YWl0IGJ1bmRsZXIuYnVuZGxlKFtcblx0XHRcdHsgdXJpOiBleHRVcmksIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgc291cmNlOiAnZXh0ZW5zaW9uJywgZXh0ZW5zaW9uSWQ6ICdwdWIuZXh0JyB9LFxuXHRcdFx0eyB1cmk6IHNraWxsTWQsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBzb3VyY2U6ICdwbHVnaW4nLCBwbHVnaW5Vcmk6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3BsdWdpbnMvbXktc2tpbGwnIH0pIH0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCBydWxlRGVzdCA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9ydWxlcy9ydWxlLm1kJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1bmRsZXIuZ2V0T3JpZ2luKHJ1bGVEZXN0KSwge1xuXHRcdFx0dXJpOiBleHRVcmksXG5cdFx0XHRzb3VyY2U6ICdleHRlbnNpb24nLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6ICdwdWIuZXh0Jyxcblx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXG5cdFx0Ly8gU2tpbGxzIHByZXNlcnZlIHRoZWlyIGRpcmVjdG9yeTogc2tpbGxzL3tza2lsbE5hbWV9L1NLSUxMLm1kLlxuXHRcdGNvbnN0IHNraWxsRGVzdCA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVuZGxlci5nZXRPcmlnaW4oc2tpbGxEZXN0KSwge1xuXHRcdFx0dXJpOiBza2lsbE1kLFxuXHRcdFx0c291cmNlOiAncGx1Z2luJyxcblx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRwbHVnaW5Vcmk6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3BsdWdpbnMvbXktc2tpbGwnIH0pLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIuZ2V0T3JpZ2luKFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9ydWxlcy91bmtub3duLm1kJyB9KSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE9yaWdpbiBoYXMgbm8gZW50cnkgZm9yIGZpbGVzIHdpdGhvdXQgYSBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGNyZWF0ZUJ1bmRsZXIoKTtcblx0XHRjb25zdCB1cmkgPSBhd2FpdCBzZWVkRmlsZSgnL3Rlc3QvcnVsZS5tZCcsICdydWxlJyk7XG5cdFx0YXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfV0pO1xuXHRcdGNvbnN0IGRlc3QgPSBVUkkuZnJvbSh7IHNjaGVtZTogU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FLCBwYXRoOiAnL3Rlc3QtYWdlbnQvcnVsZXMvcnVsZS5tZCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIuZ2V0T3JpZ2luKGRlc3QpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRPcmlnaW4gbWFwIHJlZnJlc2hlcyBvbiBlYWNoIGJ1bmRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gY3JlYXRlQnVuZGxlcigpO1xuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L2ZpcnN0Lm1kJywgJ2ZpcnN0Jyk7XG5cdFx0YXdhaXQgYnVuZGxlci5idW5kbGUoW3sgdXJpOiBmaXJzdCwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBzb3VyY2U6ICdleHRlbnNpb24nLCBleHRlbnNpb25JZDogJ3B1Yi5maXJzdCcgfV0pO1xuXHRcdGNvbnN0IGZpcnN0RGVzdCA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9ydWxlcy9maXJzdC5tZCcgfSk7XG5cdFx0YXNzZXJ0Lm9rKGJ1bmRsZXIuZ2V0T3JpZ2luKGZpcnN0RGVzdCkpO1xuXG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgc2VlZEZpbGUoJy90ZXN0L3NlY29uZC5tZCcsICdzZWNvbmQnKTtcblx0XHRhd2FpdCBidW5kbGVyLmJ1bmRsZShbeyB1cmk6IHNlY29uZCwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBzb3VyY2U6ICdwbHVnaW4nIH1dKTtcblx0XHQvLyBUaGUgcHJldmlvdXMgZmlsZSBpcyBubyBsb25nZXIgcGFydCBvZiB0aGUgYnVuZGxlLCBzbyBpdHMgb3JpZ2luIGlzIGdvbmUuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIuZ2V0T3JpZ2luKGZpcnN0RGVzdCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGJ1bmRsZXIuZ2V0T3JpZ2luKFVSSS5mcm9tKHsgc2NoZW1lOiBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUsIHBhdGg6ICcvdGVzdC1hZ2VudC9ydWxlcy9zZWNvbmQubWQnIH0pKSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMscUJBQW1EO0FBQzVELFNBQVMsbUNBQW1DO0FBQzVDLFNBQWtDLGtDQUFrQztBQUNwRSxTQUFTLDZCQUE2QixtQ0FBbUM7QUFDekUsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBb0I7QUFFN0IsTUFBTSw4QkFBOEIsTUFBTTtBQUV6QyxRQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLG1CQUFtQixDQUFDLE1BQWMsbUJBQWdFO0FBQUEsSUFDdkc7QUFBQSxJQUNBO0FBQUEsSUFDQSxZQUFZLENBQUMsRUFBRSxNQUFNLDRCQUE0QixRQUFRLFNBQVMsS0FBSyxDQUFDO0FBQUEsRUFDekU7QUFFQSxRQUFNLE1BQU07QUFDWCxrQkFBYyxZQUFZLElBQUksSUFBSSxZQUFZLElBQUksZUFBZSxDQUFDLENBQUM7QUFDbkUsVUFBTSxRQUFRLFlBQVksSUFBSSxJQUFJLDJCQUEyQixDQUFDO0FBQzlELGdCQUFZLElBQUksWUFBWSxpQkFBaUIsUUFBUSxVQUFVLEtBQUssQ0FBQztBQUdyRSxVQUFNLGlCQUFpQixZQUFZLElBQUks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
