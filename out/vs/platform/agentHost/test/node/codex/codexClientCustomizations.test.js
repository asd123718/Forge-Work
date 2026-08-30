import assert from "assert";
import { isCustomizationEnabled } from "../../../common/customizationEnablement.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FileService } from "../../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../log/common/log.js";
import { PluginFormat } from "../../../../agentPlugins/common/pluginParsers.js";
import { McpServerType } from "../../../../mcp/common/mcpPlatformTypes.js";
import { SYNCED_CUSTOMIZATION_SCHEME } from "../../../common/agentHostFileSystemService.js";
import { CustomizationType, McpServerStatus } from "../../../common/state/protocol/channels-session/state.js";
import { CodexClientCustomizationStore, codexAgentRoleToml, codexCustomizationConfig, codexMcpServersFromPlugins, codexSkillCapabilityRoots, codexSkillRootsFromPlugins } from "../../../node/codex/codexClientCustomizations.js";
suite("codexClientCustomizations", () => {
  const disposables = new DisposableStore();
  let fileService;
  setup(() => {
    fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function pluginCustomization(id) {
    return { type: CustomizationType.Plugin, id, uri: `https://plugins/${id}`, name: id };
  }
  function mcpDef(name, config) {
    const uri = URI.file(`/plugins/${name}/.mcp.json`);
    return { name, configuration: config, uri, customization: { type: CustomizationType.McpServer, id: `mcp:${name}`, uri: uri.toString(), name, state: { kind: McpServerStatus.Starting } } };
  }
  function skillDef(pluginDir, name) {
    const uri = URI.file(`${pluginDir}/skills/${name}/SKILL.md`);
    return { uri, name, description: `${name} desc`, customization: { type: CustomizationType.Skill, id: `skill:${name}`, uri: uri.toString(), name } };
  }
  function agentDef(uri, name) {
    return { uri, name, customization: { type: CustomizationType.Agent, id: `agent:${name}`, uri: uri.toString(), name } };
  }
  function instructionDef(uri, name) {
    return { uri, name, customization: { type: CustomizationType.Rule, id: `rule:${name}`, uri: uri.toString(), name } };
  }
  function parsed(overrides = {}) {
    return { format: PluginFormat.Copilot, hooks: [], mcpServers: [], skills: [], agents: [], instructions: [], ...overrides };
  }
  function plugin(id, pluginDir, p) {
    const synced = { customization: pluginCustomization(id), pluginDir: pluginDir ? URI.file(pluginDir) : void 0 };
    return { synced, parsed: p };
  }
  test("toCustomizations folds parsed children and applies the enablement overlay", () => {
    const store = new CodexClientCustomizationStore();
    store.setClient("c1", [plugin("p1", "/plugins/p1", parsed({
      mcpServers: [mcpDef("srv", { type: McpServerType.LOCAL, command: "run" })],
      skills: [skillDef("/plugins/p1", "greet")]
    }))]);
    store.setEnabled("p1", false);
    assert.deepStrictEqual(store.toCustomizations().map((c) => ({
      id: c.id,
      enabled: isCustomizationEnabled(c),
      children: c.children?.map((ch) => ({ type: ch.type, id: ch.id }))
    })), [{
      id: "p1",
      enabled: false,
      children: [
        { type: CustomizationType.Skill, id: "skill:greet" },
        { type: CustomizationType.McpServer, id: "mcp:srv" }
      ]
    }]);
  });
  test("enabledPlugins excludes disabled and unparsed plugins; merge dedupes by id (first client wins)", () => {
    const store = new CodexClientCustomizationStore();
    store.setClient("c1", [
      plugin("shared", "/plugins/shared", parsed({ skills: [skillDef("/plugins/shared", "s")] })),
      plugin("unparsed", void 0, void 0),
      plugin("off", "/plugins/off", parsed())
    ]);
    store.setClient("c2", [plugin("shared", "/plugins/other", parsed())]);
    store.setEnabled("off", false);
    assert.deepStrictEqual(store.enabledPlugins().map((p) => p.synced.customization.id), ["shared"]);
  });
  test("codexMcpServersFromPlugins maps stdio + http, stringifies env, and maps headers", () => {
    const plugins = [plugin("p", "/plugins/p", parsed({
      mcpServers: [
        mcpDef("local", { type: McpServerType.LOCAL, command: "npx", args: ["-y", "pkg"], env: { KEY: "v", N: 3, DROP: null }, cwd: "/w" }),
        mcpDef("remote", { type: McpServerType.REMOTE, url: "https://x/mcp", headers: { Authorization: "Bearer t" } })
      ]
    }))];
    assert.deepStrictEqual(codexMcpServersFromPlugins(plugins), {
      local: { command: "npx", args: ["-y", "pkg"], env: { KEY: "v", N: "3" }, cwd: "/w" },
      remote: { url: "https://x/mcp", http_headers: { Authorization: "Bearer t" } }
    });
  });
  test("codexMcpServersFromPlugins de-duplicates server names (first wins) and omits empties", () => {
    const plugins = [
      plugin("a", "/plugins/a", parsed({ mcpServers: [mcpDef("dup", { type: McpServerType.LOCAL, command: "first", args: [], env: {} })] })),
      plugin("b", "/plugins/b", parsed({ mcpServers: [mcpDef("dup", { type: McpServerType.LOCAL, command: "second" })] }))
    ];
    assert.deepStrictEqual(codexMcpServersFromPlugins(plugins), { dup: { command: "first" } });
  });
  test("codexSkillRootsFromPlugins returns the skills root (dirname twice), deduped and sorted", () => {
    const plugins = [plugin("p", "/plugins/p", parsed({
      skills: [skillDef("/plugins/p", "b"), skillDef("/plugins/p", "a")]
    })), plugin("q", "/plugins/q", parsed({ skills: [skillDef("/plugins/q", "c")] }))];
    const skillsRoot = (pluginDir) => URI.file(`${pluginDir}/skills`).fsPath;
    assert.deepStrictEqual(codexSkillRootsFromPlugins(plugins), [skillsRoot("/plugins/p"), skillsRoot("/plugins/q")]);
    assert.deepStrictEqual(codexSkillCapabilityRoots(plugins).map((root) => root.fsPath), [skillsRoot("/plugins/p"), skillsRoot("/plugins/q")]);
  });
  test("converts agent markdown and plugin instructions into codex launch configuration", async () => {
    const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/plugin/agents/reviewer.agent.md" });
    const instructionUri = URI.from({ scheme: Schemas.inMemory, path: "/plugin/rules/repo.instructions.md" });
    await fileService.writeFile(agentUri, VSBuffer.fromString(`---
name: Reviewer
description: Reviews carefully
model: gpt-test
---
Review the change and report risks.`));
    await fileService.writeFile(instructionUri, VSBuffer.fromString(`---
description: Repository rules
---
Always run focused tests.`));
    const plugins = [plugin("p", void 0, parsed({
      agents: [agentDef(agentUri, "reviewer")],
      instructions: [instructionDef(instructionUri, "repo")]
    }))];
    const config = await codexCustomizationConfig([], plugins, { uri: agentUri.toString() }, fileService);
    assert.deepStrictEqual(config, {
      agentRoles: [{
        name: "Reviewer",
        description: "Reviews carefully",
        instructions: "Review the change and report risks.",
        model: "gpt-test"
      }],
      developerInstructions: "Always run focused tests.\n\nReview the change and report risks."
    });
    assert.strictEqual(codexAgentRoleToml(config.agentRoles[0]), [
      'name = "Reviewer"',
      'description = "Reviews carefully"',
      'developer_instructions = "Review the change and report risks."',
      'model = "gpt-test"',
      ""
    ].join("\n"));
  });
  test("converts a selected workspace agent without a client plugin", async () => {
    const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/workspace/.github/agents/reviewer.agent.md" });
    await fileService.writeFile(agentUri, VSBuffer.fromString([
      "---",
      "name: Workspace Reviewer",
      "description: Reviews workspace changes",
      "model: [gpt-first, gpt-second]",
      "tools: [read_file, search]",
      "infer: true",
      "disable-model-invocation: true",
      "---",
      "Review the workspace change."
    ].join("\n")));
    const config = await codexCustomizationConfig(
      [agentDef(agentUri, "reviewer")],
      [],
      { uri: agentUri.toString() },
      fileService
    );
    assert.deepStrictEqual(config, {
      agentRoles: [{
        name: "Workspace Reviewer",
        description: "Reviews workspace changes",
        instructions: "Review the workspace change.",
        model: "gpt-first"
      }],
      developerInstructions: "Review the workspace change."
    });
  });
  test("does not promote path-scoped plugin instructions to thread-global instructions", async () => {
    const globalInstructionUri = URI.from({ scheme: Schemas.inMemory, path: "/plugin/rules/global.instructions.md" });
    const scopedInstructionUri = URI.from({ scheme: Schemas.inMemory, path: "/plugin/rules/typescript.instructions.md" });
    await fileService.writeFile(globalInstructionUri, VSBuffer.fromString(`---
applyTo: "**/*"
---
Apply globally.`));
    await fileService.writeFile(scopedInstructionUri, VSBuffer.fromString(`---
applyTo: "**/*.ts"
---
Apply only to TypeScript.`));
    const plugins = [plugin("p", void 0, parsed({
      instructions: [
        instructionDef(globalInstructionUri, "global"),
        instructionDef(scopedInstructionUri, "typescript")
      ]
    }))];
    const config = await codexCustomizationConfig([], plugins, void 0, fileService);
    assert.strictEqual(config.developerInstructions, "Apply globally.");
  });
  test("matches a selected source agent to its host-synced plugin copy", async () => {
    const sourcePluginUri = URI.from({ scheme: Schemas.inMemory, path: "/source/plugin" });
    const syncedPluginUri = URI.from({ scheme: Schemas.inMemory, path: "/synced/plugin" });
    const sourceAgentUri = URI.joinPath(sourcePluginUri, "agents", "reviewer.agent.md");
    const syncedAgentUri = URI.joinPath(syncedPluginUri, "agents", "reviewer.agent.md");
    await fileService.writeFile(syncedAgentUri, VSBuffer.fromString(`---
name: Reviewer
description: Reviews carefully
---
Apply synced reviewer instructions.`));
    const synced = {
      customization: {
        type: CustomizationType.Plugin,
        id: "synced-plugin",
        uri: sourcePluginUri.toString(),
        name: "Synced Plugin"
      },
      pluginDir: syncedPluginUri
    };
    const plugins = [{
      synced,
      parsed: parsed({ agents: [agentDef(syncedAgentUri, "reviewer")] })
    }];
    const config = await codexCustomizationConfig([], plugins, { uri: sourceAgentUri.toString() }, fileService);
    assert.strictEqual(config.developerInstructions, "Apply synced reviewer instructions.");
  });
  test("matches an original loose-agent URI to its synthetic bundle copy", async () => {
    const sourceAgentUri = URI.file("/workspace/.github/agents/reviewer.agent.md");
    const syncedPluginUri = URI.from({ scheme: Schemas.inMemory, path: "/synced/plugin" });
    const syncedAgentUri = URI.joinPath(syncedPluginUri, "agents", "reviewer.agent.md");
    await fileService.writeFile(syncedAgentUri, VSBuffer.fromString(`---
name: Reviewer
description: Reviews carefully
---
Apply loose reviewer instructions.`));
    const synced = {
      customization: {
        type: CustomizationType.Plugin,
        id: "synthetic-plugin",
        uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/agent-host-codex`,
        name: "VS Code Synced Data"
      },
      pluginDir: syncedPluginUri
    };
    const plugins = [{
      synced,
      parsed: parsed({ agents: [agentDef(syncedAgentUri, "reviewer")] })
    }];
    const config = await codexCustomizationConfig([], plugins, { uri: sourceAgentUri.toString() }, fileService);
    assert.strictEqual(config.developerInstructions, "Apply loose reviewer instructions.");
  });
  test("prefers an exact selected agent over a synthetic filename fallback", async () => {
    const selectedPluginUri = URI.from({ scheme: Schemas.inMemory, path: "/source/plugin" });
    const selectedSyncedPluginUri = URI.from({ scheme: Schemas.inMemory, path: "/synced/selected-plugin" });
    const selectedAgentUri = URI.joinPath(selectedPluginUri, "agents", "reviewer.agent.md");
    const selectedSyncedAgentUri = URI.joinPath(selectedSyncedPluginUri, "agents", "reviewer.agent.md");
    const syntheticPluginUri = URI.from({ scheme: Schemas.inMemory, path: "/synced/synthetic-plugin" });
    const syntheticAgentUri = URI.joinPath(syntheticPluginUri, "agents", "reviewer.agent.md");
    await fileService.writeFile(selectedSyncedAgentUri, VSBuffer.fromString("Apply exact reviewer instructions."));
    await fileService.writeFile(syntheticAgentUri, VSBuffer.fromString("Do not apply synthetic reviewer instructions."));
    const plugins = [
      {
        synced: {
          customization: { type: CustomizationType.Plugin, id: "selected-plugin", uri: selectedPluginUri.toString(), name: "Selected Plugin" },
          pluginDir: selectedSyncedPluginUri
        },
        parsed: parsed({ agents: [agentDef(selectedSyncedAgentUri, "selected-reviewer")] })
      },
      {
        synced: {
          customization: { type: CustomizationType.Plugin, id: "synthetic-plugin", uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/agent-host-codex`, name: "VS Code Synced Data" },
          pluginDir: syntheticPluginUri
        },
        parsed: parsed({ agents: [agentDef(syntheticAgentUri, "synthetic-reviewer")] })
      }
    ];
    const config = await codexCustomizationConfig([], plugins, { uri: selectedAgentUri.toString() }, fileService);
    assert.strictEqual(config.developerInstructions, "Apply exact reviewer instructions.");
  });
  test("removeClient drops a client and setEnabled reports whether it changed", () => {
    const store = new CodexClientCustomizationStore();
    store.setClient("c1", [plugin("p1", "/plugins/p1", parsed())]);
    assert.deepStrictEqual({
      hasBefore: store.has("p1"),
      toggledOff: store.setEnabled("p1", false),
      toggledOffAgain: store.setEnabled("p1", false),
      removed: store.removeClient("c1"),
      emptyAfter: store.isEmpty()
    }, { hasBefore: true, toggledOff: true, toggledOffAgain: false, removed: true, emptyAfter: true });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhDbGllbnRDdXN0b21pemF0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgaXNDdXN0b21pemF0aW9uRW5hYmxlZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uRW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBQbHVnaW5Gb3JtYXQsIHR5cGUgSU1jcFNlcnZlckRlZmluaXRpb24sIHR5cGUgSVBhcnNlZEFnZW50LCB0eXBlIElQYXJzZWRQbHVnaW4sIHR5cGUgSVBhcnNlZFJ1bGUsIHR5cGUgSVBhcnNlZFNraWxsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYWdlbnRQbHVnaW5zL2NvbW1vbi9wbHVnaW5QYXJzZXJzLmpzJztcbmltcG9ydCB7IE1jcFNlcnZlclR5cGUsIHR5cGUgSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9tY3AvY29tbW9uL21jcFBsYXRmb3JtVHlwZXMuanMnO1xuaW1wb3J0IHsgU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSVN5bmNlZEN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRQbHVnaW5NYW5hZ2VyLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlLCBNY3BTZXJ2ZXJTdGF0dXMsIHR5cGUgUGx1Z2luQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1zZXNzaW9uL3N0YXRlLmpzJztcbmltcG9ydCB7IENvZGV4Q2xpZW50Q3VzdG9taXphdGlvblN0b3JlLCBjb2RleEFnZW50Um9sZVRvbWwsIGNvZGV4Q3VzdG9taXphdGlvbkNvbmZpZywgY29kZXhNY3BTZXJ2ZXJzRnJvbVBsdWdpbnMsIGNvZGV4U2tpbGxDYXBhYmlsaXR5Um9vdHMsIGNvZGV4U2tpbGxSb290c0Zyb21QbHVnaW5zLCB0eXBlIElDb2RleENsaWVudFBsdWdpbiB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvY29kZXhDbGllbnRDdXN0b21pemF0aW9ucy5qcyc7XG5cbnN1aXRlKCdjb2RleENsaWVudEN1c3RvbWl6YXRpb25zJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBGaWxlU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBwbHVnaW5DdXN0b21pemF0aW9uKGlkOiBzdHJpbmcpOiBQbHVnaW5DdXN0b21pemF0aW9uIHtcblx0XHRyZXR1cm4geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkLCB1cmk6IGBodHRwczovL3BsdWdpbnMvJHtpZH1gLCBuYW1lOiBpZCwgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIG1jcERlZihuYW1lOiBzdHJpbmcsIGNvbmZpZzogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24pOiBJTWNwU2VydmVyRGVmaW5pdGlvbiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoYC9wbHVnaW5zLyR7bmFtZX0vLm1jcC5qc29uYCk7XG5cdFx0cmV0dXJuIHsgbmFtZSwgY29uZmlndXJhdGlvbjogY29uZmlnLCB1cmksIGN1c3RvbWl6YXRpb246IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLCBpZDogYG1jcDoke25hbWV9YCwgdXJpOiB1cmkudG9TdHJpbmcoKSwgbmFtZSwgc3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nIH0gfSB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gc2tpbGxEZWYocGx1Z2luRGlyOiBzdHJpbmcsIG5hbWU6IHN0cmluZyk6IElQYXJzZWRTa2lsbCB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoYCR7cGx1Z2luRGlyfS9za2lsbHMvJHtuYW1lfS9TS0lMTC5tZGApO1xuXHRcdHJldHVybiB7IHVyaSwgbmFtZSwgZGVzY3JpcHRpb246IGAke25hbWV9IGRlc2NgLCBjdXN0b21pemF0aW9uOiB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsLCBpZDogYHNraWxsOiR7bmFtZX1gLCB1cmk6IHVyaS50b1N0cmluZygpLCBuYW1lIH0gfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFnZW50RGVmKHVyaTogVVJJLCBuYW1lOiBzdHJpbmcpOiBJUGFyc2VkQWdlbnQge1xuXHRcdHJldHVybiB7IHVyaSwgbmFtZSwgY3VzdG9taXphdGlvbjogeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6IGBhZ2VudDoke25hbWV9YCwgdXJpOiB1cmkudG9TdHJpbmcoKSwgbmFtZSB9IH07XG5cdH1cblxuXHRmdW5jdGlvbiBpbnN0cnVjdGlvbkRlZih1cmk6IFVSSSwgbmFtZTogc3RyaW5nKTogSVBhcnNlZFJ1bGUge1xuXHRcdHJldHVybiB7IHVyaSwgbmFtZSwgY3VzdG9taXphdGlvbjogeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5SdWxlLCBpZDogYHJ1bGU6JHtuYW1lfWAsIHVyaTogdXJpLnRvU3RyaW5nKCksIG5hbWUgfSB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gcGFyc2VkKG92ZXJyaWRlczogUGFydGlhbDxJUGFyc2VkUGx1Z2luPiA9IHt9KTogSVBhcnNlZFBsdWdpbiB7XG5cdFx0cmV0dXJuIHsgZm9ybWF0OiBQbHVnaW5Gb3JtYXQuQ29waWxvdCwgaG9va3M6IFtdLCBtY3BTZXJ2ZXJzOiBbXSwgc2tpbGxzOiBbXSwgYWdlbnRzOiBbXSwgaW5zdHJ1Y3Rpb25zOiBbXSwgLi4ub3ZlcnJpZGVzIH07XG5cdH1cblxuXHRmdW5jdGlvbiBwbHVnaW4oaWQ6IHN0cmluZywgcGx1Z2luRGlyOiBzdHJpbmcgfCB1bmRlZmluZWQsIHA6IElQYXJzZWRQbHVnaW4gfCB1bmRlZmluZWQpOiBJQ29kZXhDbGllbnRQbHVnaW4ge1xuXHRcdGNvbnN0IHN5bmNlZDogSVN5bmNlZEN1c3RvbWl6YXRpb24gPSB7IGN1c3RvbWl6YXRpb246IHBsdWdpbkN1c3RvbWl6YXRpb24oaWQpLCBwbHVnaW5EaXI6IHBsdWdpbkRpciA/IFVSSS5maWxlKHBsdWdpbkRpcikgOiB1bmRlZmluZWQgfTtcblx0XHRyZXR1cm4geyBzeW5jZWQsIHBhcnNlZDogcCB9O1xuXHR9XG5cblx0dGVzdCgndG9DdXN0b21pemF0aW9ucyBmb2xkcyBwYXJzZWQgY2hpbGRyZW4gYW5kIGFwcGxpZXMgdGhlIGVuYWJsZW1lbnQgb3ZlcmxheScsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBDb2RleENsaWVudEN1c3RvbWl6YXRpb25TdG9yZSgpO1xuXHRcdHN0b3JlLnNldENsaWVudCgnYzEnLCBbcGx1Z2luKCdwMScsICcvcGx1Z2lucy9wMScsIHBhcnNlZCh7XG5cdFx0XHRtY3BTZXJ2ZXJzOiBbbWNwRGVmKCdzcnYnLCB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICdydW4nIH0pXSxcblx0XHRcdHNraWxsczogW3NraWxsRGVmKCcvcGx1Z2lucy9wMScsICdncmVldCcpXSxcblx0XHR9KSldKTtcblx0XHRzdG9yZS5zZXRFbmFibGVkKCdwMScsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JlLnRvQ3VzdG9taXphdGlvbnMoKS5tYXAoYyA9PiAoe1xuXHRcdFx0aWQ6IGMuaWQsXG5cdFx0XHRlbmFibGVkOiBpc0N1c3RvbWl6YXRpb25FbmFibGVkKGMpLFxuXHRcdFx0Y2hpbGRyZW46IGMuY2hpbGRyZW4/Lm1hcChjaCA9PiAoeyB0eXBlOiBjaC50eXBlLCBpZDogY2guaWQgfSkpLFxuXHRcdH0pKSwgW3tcblx0XHRcdGlkOiAncDEnLFxuXHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsLCBpZDogJ3NraWxsOmdyZWV0JyB9LFxuXHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlciwgaWQ6ICdtY3A6c3J2JyB9LFxuXHRcdFx0XSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VuYWJsZWRQbHVnaW5zIGV4Y2x1ZGVzIGRpc2FibGVkIGFuZCB1bnBhcnNlZCBwbHVnaW5zOyBtZXJnZSBkZWR1cGVzIGJ5IGlkIChmaXJzdCBjbGllbnQgd2lucyknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQ29kZXhDbGllbnRDdXN0b21pemF0aW9uU3RvcmUoKTtcblx0XHRzdG9yZS5zZXRDbGllbnQoJ2MxJywgW1xuXHRcdFx0cGx1Z2luKCdzaGFyZWQnLCAnL3BsdWdpbnMvc2hhcmVkJywgcGFyc2VkKHsgc2tpbGxzOiBbc2tpbGxEZWYoJy9wbHVnaW5zL3NoYXJlZCcsICdzJyldIH0pKSxcblx0XHRcdHBsdWdpbigndW5wYXJzZWQnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksXG5cdFx0XHRwbHVnaW4oJ29mZicsICcvcGx1Z2lucy9vZmYnLCBwYXJzZWQoKSksXG5cdFx0XSk7XG5cdFx0c3RvcmUuc2V0Q2xpZW50KCdjMicsIFtwbHVnaW4oJ3NoYXJlZCcsICcvcGx1Z2lucy9vdGhlcicsIHBhcnNlZCgpKV0pOyAvLyBkdXBsaWNhdGUgaWQgaWdub3JlZFxuXHRcdHN0b3JlLnNldEVuYWJsZWQoJ29mZicsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JlLmVuYWJsZWRQbHVnaW5zKCkubWFwKHAgPT4gcC5zeW5jZWQuY3VzdG9taXphdGlvbi5pZCksIFsnc2hhcmVkJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2RleE1jcFNlcnZlcnNGcm9tUGx1Z2lucyBtYXBzIHN0ZGlvICsgaHR0cCwgc3RyaW5naWZpZXMgZW52LCBhbmQgbWFwcyBoZWFkZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpbnMgPSBbcGx1Z2luKCdwJywgJy9wbHVnaW5zL3AnLCBwYXJzZWQoe1xuXHRcdFx0bWNwU2VydmVyczogW1xuXHRcdFx0XHRtY3BEZWYoJ2xvY2FsJywgeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAnbnB4JywgYXJnczogWycteScsICdwa2cnXSwgZW52OiB7IEtFWTogJ3YnLCBOOiAzLCBEUk9QOiBudWxsIH0sIGN3ZDogJy93JyB9KSxcblx0XHRcdFx0bWNwRGVmKCdyZW1vdGUnLCB7IHR5cGU6IE1jcFNlcnZlclR5cGUuUkVNT1RFLCB1cmw6ICdodHRwczovL3gvbWNwJywgaGVhZGVyczogeyBBdXRob3JpemF0aW9uOiAnQmVhcmVyIHQnIH0gfSksXG5cdFx0XHRdLFxuXHRcdH0pKV07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2RleE1jcFNlcnZlcnNGcm9tUGx1Z2lucyhwbHVnaW5zKSwge1xuXHRcdFx0bG9jYWw6IHsgY29tbWFuZDogJ25weCcsIGFyZ3M6IFsnLXknLCAncGtnJ10sIGVudjogeyBLRVk6ICd2JywgTjogJzMnIH0sIGN3ZDogJy93JyB9LFxuXHRcdFx0cmVtb3RlOiB7IHVybDogJ2h0dHBzOi8veC9tY3AnLCBodHRwX2hlYWRlcnM6IHsgQXV0aG9yaXphdGlvbjogJ0JlYXJlciB0JyB9IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvZGV4TWNwU2VydmVyc0Zyb21QbHVnaW5zIGRlLWR1cGxpY2F0ZXMgc2VydmVyIG5hbWVzIChmaXJzdCB3aW5zKSBhbmQgb21pdHMgZW1wdGllcycsICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5zID0gW1xuXHRcdFx0cGx1Z2luKCdhJywgJy9wbHVnaW5zL2EnLCBwYXJzZWQoeyBtY3BTZXJ2ZXJzOiBbbWNwRGVmKCdkdXAnLCB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICdmaXJzdCcsIGFyZ3M6IFtdLCBlbnY6IHt9IH0pXSB9KSksXG5cdFx0XHRwbHVnaW4oJ2InLCAnL3BsdWdpbnMvYicsIHBhcnNlZCh7IG1jcFNlcnZlcnM6IFttY3BEZWYoJ2R1cCcsIHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ3NlY29uZCcgfSldIH0pKSxcblx0XHRdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29kZXhNY3BTZXJ2ZXJzRnJvbVBsdWdpbnMocGx1Z2lucyksIHsgZHVwOiB7IGNvbW1hbmQ6ICdmaXJzdCcgfSB9KTtcblx0fSk7XG5cblx0dGVzdCgnY29kZXhTa2lsbFJvb3RzRnJvbVBsdWdpbnMgcmV0dXJucyB0aGUgc2tpbGxzIHJvb3QgKGRpcm5hbWUgdHdpY2UpLCBkZWR1cGVkIGFuZCBzb3J0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGx1Z2lucyA9IFtwbHVnaW4oJ3AnLCAnL3BsdWdpbnMvcCcsIHBhcnNlZCh7XG5cdFx0XHRza2lsbHM6IFtza2lsbERlZignL3BsdWdpbnMvcCcsICdiJyksIHNraWxsRGVmKCcvcGx1Z2lucy9wJywgJ2EnKV0sXG5cdFx0fSkpLCBwbHVnaW4oJ3EnLCAnL3BsdWdpbnMvcScsIHBhcnNlZCh7IHNraWxsczogW3NraWxsRGVmKCcvcGx1Z2lucy9xJywgJ2MnKV0gfSkpXTtcblx0XHQvLyBUaGUgcm9vdHMgYXJlIG5hdGl2ZSBmc1BhdGhzIChiYWNrc2xhc2hlcyBvbiBXaW5kb3dzKSwgc28gZXhwcmVzcyB0aGVcblx0XHQvLyBleHBlY3RhdGlvbiB3aXRoIHRoZSBzYW1lIHBsYXRmb3JtLWF3YXJlIHRyYW5zZm9ybSByYXRoZXIgdGhhbiBhXG5cdFx0Ly8gaGFyZGNvZGVkIHBvc2l4IHBhdGguXG5cdFx0Y29uc3Qgc2tpbGxzUm9vdCA9IChwbHVnaW5EaXI6IHN0cmluZykgPT4gVVJJLmZpbGUoYCR7cGx1Z2luRGlyfS9za2lsbHNgKS5mc1BhdGg7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2RleFNraWxsUm9vdHNGcm9tUGx1Z2lucyhwbHVnaW5zKSwgW3NraWxsc1Jvb3QoJy9wbHVnaW5zL3AnKSwgc2tpbGxzUm9vdCgnL3BsdWdpbnMvcScpXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2RleFNraWxsQ2FwYWJpbGl0eVJvb3RzKHBsdWdpbnMpLm1hcChyb290ID0+IHJvb3QuZnNQYXRoKSwgW3NraWxsc1Jvb3QoJy9wbHVnaW5zL3AnKSwgc2tpbGxzUm9vdCgnL3BsdWdpbnMvcScpXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIGFnZW50IG1hcmtkb3duIGFuZCBwbHVnaW4gaW5zdHJ1Y3Rpb25zIGludG8gY29kZXggbGF1bmNoIGNvbmZpZ3VyYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9wbHVnaW4vYWdlbnRzL3Jldmlld2VyLmFnZW50Lm1kJyB9KTtcblx0XHRjb25zdCBpbnN0cnVjdGlvblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3BsdWdpbi9ydWxlcy9yZXBvLmluc3RydWN0aW9ucy5tZCcgfSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGFnZW50VXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGAtLS1cXG5uYW1lOiBSZXZpZXdlclxcbmRlc2NyaXB0aW9uOiBSZXZpZXdzIGNhcmVmdWxseVxcbm1vZGVsOiBncHQtdGVzdFxcbi0tLVxcblJldmlldyB0aGUgY2hhbmdlIGFuZCByZXBvcnQgcmlza3MuYCkpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShpbnN0cnVjdGlvblVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhgLS0tXFxuZGVzY3JpcHRpb246IFJlcG9zaXRvcnkgcnVsZXNcXG4tLS1cXG5BbHdheXMgcnVuIGZvY3VzZWQgdGVzdHMuYCkpO1xuXHRcdGNvbnN0IHBsdWdpbnMgPSBbcGx1Z2luKCdwJywgdW5kZWZpbmVkLCBwYXJzZWQoe1xuXHRcdFx0YWdlbnRzOiBbYWdlbnREZWYoYWdlbnRVcmksICdyZXZpZXdlcicpXSxcblx0XHRcdGluc3RydWN0aW9uczogW2luc3RydWN0aW9uRGVmKGluc3RydWN0aW9uVXJpLCAncmVwbycpXSxcblx0XHR9KSldO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgY29kZXhDdXN0b21pemF0aW9uQ29uZmlnKFtdLCBwbHVnaW5zLCB7IHVyaTogYWdlbnRVcmkudG9TdHJpbmcoKSB9LCBmaWxlU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZywge1xuXHRcdFx0YWdlbnRSb2xlczogW3tcblx0XHRcdFx0bmFtZTogJ1Jldmlld2VyJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdSZXZpZXdzIGNhcmVmdWxseScsXG5cdFx0XHRcdGluc3RydWN0aW9uczogJ1JldmlldyB0aGUgY2hhbmdlIGFuZCByZXBvcnQgcmlza3MuJyxcblx0XHRcdFx0bW9kZWw6ICdncHQtdGVzdCcsXG5cdFx0XHR9XSxcblx0XHRcdGRldmVsb3Blckluc3RydWN0aW9uczogJ0Fsd2F5cyBydW4gZm9jdXNlZCB0ZXN0cy5cXG5cXG5SZXZpZXcgdGhlIGNoYW5nZSBhbmQgcmVwb3J0IHJpc2tzLicsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvZGV4QWdlbnRSb2xlVG9tbChjb25maWcuYWdlbnRSb2xlc1swXSksIFtcblx0XHRcdCduYW1lID0gXCJSZXZpZXdlclwiJyxcblx0XHRcdCdkZXNjcmlwdGlvbiA9IFwiUmV2aWV3cyBjYXJlZnVsbHlcIicsXG5cdFx0XHQnZGV2ZWxvcGVyX2luc3RydWN0aW9ucyA9IFwiUmV2aWV3IHRoZSBjaGFuZ2UgYW5kIHJlcG9ydCByaXNrcy5cIicsXG5cdFx0XHQnbW9kZWwgPSBcImdwdC10ZXN0XCInLFxuXHRcdFx0JycsXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIGEgc2VsZWN0ZWQgd29ya3NwYWNlIGFnZW50IHdpdGhvdXQgYSBjbGllbnQgcGx1Z2luJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50VXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL3Jldmlld2VyLmFnZW50Lm1kJyB9KTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnbmFtZTogV29ya3NwYWNlIFJldmlld2VyJyxcblx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyB3b3Jrc3BhY2UgY2hhbmdlcycsXG5cdFx0XHQnbW9kZWw6IFtncHQtZmlyc3QsIGdwdC1zZWNvbmRdJyxcblx0XHRcdCd0b29sczogW3JlYWRfZmlsZSwgc2VhcmNoXScsXG5cdFx0XHQnaW5mZXI6IHRydWUnLFxuXHRcdFx0J2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogdHJ1ZScsXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdSZXZpZXcgdGhlIHdvcmtzcGFjZSBjaGFuZ2UuJyxcblx0XHRdLmpvaW4oJ1xcbicpKSk7XG5cblx0XHRjb25zdCBjb25maWcgPSBhd2FpdCBjb2RleEN1c3RvbWl6YXRpb25Db25maWcoXG5cdFx0XHRbYWdlbnREZWYoYWdlbnRVcmksICdyZXZpZXdlcicpXSxcblx0XHRcdFtdLFxuXHRcdFx0eyB1cmk6IGFnZW50VXJpLnRvU3RyaW5nKCkgfSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZywge1xuXHRcdFx0YWdlbnRSb2xlczogW3tcblx0XHRcdFx0bmFtZTogJ1dvcmtzcGFjZSBSZXZpZXdlcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmV2aWV3cyB3b3Jrc3BhY2UgY2hhbmdlcycsXG5cdFx0XHRcdGluc3RydWN0aW9uczogJ1JldmlldyB0aGUgd29ya3NwYWNlIGNoYW5nZS4nLFxuXHRcdFx0XHRtb2RlbDogJ2dwdC1maXJzdCcsXG5cdFx0XHR9XSxcblx0XHRcdGRldmVsb3Blckluc3RydWN0aW9uczogJ1JldmlldyB0aGUgd29ya3NwYWNlIGNoYW5nZS4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBwcm9tb3RlIHBhdGgtc2NvcGVkIHBsdWdpbiBpbnN0cnVjdGlvbnMgdG8gdGhyZWFkLWdsb2JhbCBpbnN0cnVjdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2xvYmFsSW5zdHJ1Y3Rpb25VcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9wbHVnaW4vcnVsZXMvZ2xvYmFsLmluc3RydWN0aW9ucy5tZCcgfSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdHJ1Y3Rpb25VcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9wbHVnaW4vcnVsZXMvdHlwZXNjcmlwdC5pbnN0cnVjdGlvbnMubWQnIH0pO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShnbG9iYWxJbnN0cnVjdGlvblVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhgLS0tXFxuYXBwbHlUbzogXCIqKi8qXCJcXG4tLS1cXG5BcHBseSBnbG9iYWxseS5gKSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNjb3BlZEluc3RydWN0aW9uVXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGAtLS1cXG5hcHBseVRvOiBcIioqLyoudHNcIlxcbi0tLVxcbkFwcGx5IG9ubHkgdG8gVHlwZVNjcmlwdC5gKSk7XG5cdFx0Y29uc3QgcGx1Z2lucyA9IFtwbHVnaW4oJ3AnLCB1bmRlZmluZWQsIHBhcnNlZCh7XG5cdFx0XHRpbnN0cnVjdGlvbnM6IFtcblx0XHRcdFx0aW5zdHJ1Y3Rpb25EZWYoZ2xvYmFsSW5zdHJ1Y3Rpb25VcmksICdnbG9iYWwnKSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25EZWYoc2NvcGVkSW5zdHJ1Y3Rpb25VcmksICd0eXBlc2NyaXB0JyksXG5cdFx0XHRdLFxuXHRcdH0pKV07XG5cblx0XHRjb25zdCBjb25maWcgPSBhd2FpdCBjb2RleEN1c3RvbWl6YXRpb25Db25maWcoW10sIHBsdWdpbnMsIHVuZGVmaW5lZCwgZmlsZVNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5kZXZlbG9wZXJJbnN0cnVjdGlvbnMsICdBcHBseSBnbG9iYWxseS4nKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlcyBhIHNlbGVjdGVkIHNvdXJjZSBhZ2VudCB0byBpdHMgaG9zdC1zeW5jZWQgcGx1Z2luIGNvcHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc291cmNlUGx1Z2luVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvc291cmNlL3BsdWdpbicgfSk7XG5cdFx0Y29uc3Qgc3luY2VkUGx1Z2luVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvc3luY2VkL3BsdWdpbicgfSk7XG5cdFx0Y29uc3Qgc291cmNlQWdlbnRVcmkgPSBVUkkuam9pblBhdGgoc291cmNlUGx1Z2luVXJpLCAnYWdlbnRzJywgJ3Jldmlld2VyLmFnZW50Lm1kJyk7XG5cdFx0Y29uc3Qgc3luY2VkQWdlbnRVcmkgPSBVUkkuam9pblBhdGgoc3luY2VkUGx1Z2luVXJpLCAnYWdlbnRzJywgJ3Jldmlld2VyLmFnZW50Lm1kJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHN5bmNlZEFnZW50VXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGAtLS1cXG5uYW1lOiBSZXZpZXdlclxcbmRlc2NyaXB0aW9uOiBSZXZpZXdzIGNhcmVmdWxseVxcbi0tLVxcbkFwcGx5IHN5bmNlZCByZXZpZXdlciBpbnN0cnVjdGlvbnMuYCkpO1xuXHRcdGNvbnN0IHN5bmNlZDogSVN5bmNlZEN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHRjdXN0b21pemF0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6ICdzeW5jZWQtcGx1Z2luJyxcblx0XHRcdFx0dXJpOiBzb3VyY2VQbHVnaW5VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0bmFtZTogJ1N5bmNlZCBQbHVnaW4nLFxuXHRcdFx0fSxcblx0XHRcdHBsdWdpbkRpcjogc3luY2VkUGx1Z2luVXJpLFxuXHRcdH07XG5cdFx0Y29uc3QgcGx1Z2luczogSUNvZGV4Q2xpZW50UGx1Z2luW10gPSBbe1xuXHRcdFx0c3luY2VkLFxuXHRcdFx0cGFyc2VkOiBwYXJzZWQoeyBhZ2VudHM6IFthZ2VudERlZihzeW5jZWRBZ2VudFVyaSwgJ3Jldmlld2VyJyldIH0pLFxuXHRcdH1dO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgY29kZXhDdXN0b21pemF0aW9uQ29uZmlnKFtdLCBwbHVnaW5zLCB7IHVyaTogc291cmNlQWdlbnRVcmkudG9TdHJpbmcoKSB9LCBmaWxlU2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmRldmVsb3Blckluc3RydWN0aW9ucywgJ0FwcGx5IHN5bmNlZCByZXZpZXdlciBpbnN0cnVjdGlvbnMuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXMgYW4gb3JpZ2luYWwgbG9vc2UtYWdlbnQgVVJJIHRvIGl0cyBzeW50aGV0aWMgYnVuZGxlIGNvcHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc291cmNlQWdlbnRVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9yZXZpZXdlci5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IHN5bmNlZFBsdWdpblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3N5bmNlZC9wbHVnaW4nIH0pO1xuXHRcdGNvbnN0IHN5bmNlZEFnZW50VXJpID0gVVJJLmpvaW5QYXRoKHN5bmNlZFBsdWdpblVyaSwgJ2FnZW50cycsICdyZXZpZXdlci5hZ2VudC5tZCcpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzeW5jZWRBZ2VudFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhgLS0tXFxubmFtZTogUmV2aWV3ZXJcXG5kZXNjcmlwdGlvbjogUmV2aWV3cyBjYXJlZnVsbHlcXG4tLS1cXG5BcHBseSBsb29zZSByZXZpZXdlciBpbnN0cnVjdGlvbnMuYCkpO1xuXHRcdGNvbnN0IHN5bmNlZDogSVN5bmNlZEN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHRjdXN0b21pemF0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6ICdzeW50aGV0aWMtcGx1Z2luJyxcblx0XHRcdFx0dXJpOiBgJHtTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUV9Oi9hZ2VudC1ob3N0LWNvZGV4YCxcblx0XHRcdFx0bmFtZTogJ1ZTIENvZGUgU3luY2VkIERhdGEnLFxuXHRcdFx0fSxcblx0XHRcdHBsdWdpbkRpcjogc3luY2VkUGx1Z2luVXJpLFxuXHRcdH07XG5cdFx0Y29uc3QgcGx1Z2luczogSUNvZGV4Q2xpZW50UGx1Z2luW10gPSBbe1xuXHRcdFx0c3luY2VkLFxuXHRcdFx0cGFyc2VkOiBwYXJzZWQoeyBhZ2VudHM6IFthZ2VudERlZihzeW5jZWRBZ2VudFVyaSwgJ3Jldmlld2VyJyldIH0pLFxuXHRcdH1dO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgY29kZXhDdXN0b21pemF0aW9uQ29uZmlnKFtdLCBwbHVnaW5zLCB7IHVyaTogc291cmNlQWdlbnRVcmkudG9TdHJpbmcoKSB9LCBmaWxlU2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmRldmVsb3Blckluc3RydWN0aW9ucywgJ0FwcGx5IGxvb3NlIHJldmlld2VyIGluc3RydWN0aW9ucy4nKTtcblx0fSk7XG5cblx0dGVzdCgncHJlZmVycyBhbiBleGFjdCBzZWxlY3RlZCBhZ2VudCBvdmVyIGEgc3ludGhldGljIGZpbGVuYW1lIGZhbGxiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlbGVjdGVkUGx1Z2luVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvc291cmNlL3BsdWdpbicgfSk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRTeW5jZWRQbHVnaW5VcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9zeW5jZWQvc2VsZWN0ZWQtcGx1Z2luJyB9KTtcblx0XHRjb25zdCBzZWxlY3RlZEFnZW50VXJpID0gVVJJLmpvaW5QYXRoKHNlbGVjdGVkUGx1Z2luVXJpLCAnYWdlbnRzJywgJ3Jldmlld2VyLmFnZW50Lm1kJyk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRTeW5jZWRBZ2VudFVyaSA9IFVSSS5qb2luUGF0aChzZWxlY3RlZFN5bmNlZFBsdWdpblVyaSwgJ2FnZW50cycsICdyZXZpZXdlci5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IHN5bnRoZXRpY1BsdWdpblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3N5bmNlZC9zeW50aGV0aWMtcGx1Z2luJyB9KTtcblx0XHRjb25zdCBzeW50aGV0aWNBZ2VudFVyaSA9IFVSSS5qb2luUGF0aChzeW50aGV0aWNQbHVnaW5VcmksICdhZ2VudHMnLCAncmV2aWV3ZXIuYWdlbnQubWQnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc2VsZWN0ZWRTeW5jZWRBZ2VudFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygnQXBwbHkgZXhhY3QgcmV2aWV3ZXIgaW5zdHJ1Y3Rpb25zLicpKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc3ludGhldGljQWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0RvIG5vdCBhcHBseSBzeW50aGV0aWMgcmV2aWV3ZXIgaW5zdHJ1Y3Rpb25zLicpKTtcblx0XHRjb25zdCBwbHVnaW5zOiBJQ29kZXhDbGllbnRQbHVnaW5bXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0c3luY2VkOiB7XG5cdFx0XHRcdFx0Y3VzdG9taXphdGlvbjogeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiAnc2VsZWN0ZWQtcGx1Z2luJywgdXJpOiBzZWxlY3RlZFBsdWdpblVyaS50b1N0cmluZygpLCBuYW1lOiAnU2VsZWN0ZWQgUGx1Z2luJywgfSxcblx0XHRcdFx0XHRwbHVnaW5EaXI6IHNlbGVjdGVkU3luY2VkUGx1Z2luVXJpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwYXJzZWQ6IHBhcnNlZCh7IGFnZW50czogW2FnZW50RGVmKHNlbGVjdGVkU3luY2VkQWdlbnRVcmksICdzZWxlY3RlZC1yZXZpZXdlcicpXSB9KSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHN5bmNlZDoge1xuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb246IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogJ3N5bnRoZXRpYy1wbHVnaW4nLCB1cmk6IGAke1NZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRX06L2FnZW50LWhvc3QtY29kZXhgLCBuYW1lOiAnVlMgQ29kZSBTeW5jZWQgRGF0YScsIH0sXG5cdFx0XHRcdFx0cGx1Z2luRGlyOiBzeW50aGV0aWNQbHVnaW5VcmksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBhcnNlZDogcGFyc2VkKHsgYWdlbnRzOiBbYWdlbnREZWYoc3ludGhldGljQWdlbnRVcmksICdzeW50aGV0aWMtcmV2aWV3ZXInKV0gfSksXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRjb25zdCBjb25maWcgPSBhd2FpdCBjb2RleEN1c3RvbWl6YXRpb25Db25maWcoW10sIHBsdWdpbnMsIHsgdXJpOiBzZWxlY3RlZEFnZW50VXJpLnRvU3RyaW5nKCkgfSwgZmlsZVNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5kZXZlbG9wZXJJbnN0cnVjdGlvbnMsICdBcHBseSBleGFjdCByZXZpZXdlciBpbnN0cnVjdGlvbnMuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZUNsaWVudCBkcm9wcyBhIGNsaWVudCBhbmQgc2V0RW5hYmxlZCByZXBvcnRzIHdoZXRoZXIgaXQgY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBDb2RleENsaWVudEN1c3RvbWl6YXRpb25TdG9yZSgpO1xuXHRcdHN0b3JlLnNldENsaWVudCgnYzEnLCBbcGx1Z2luKCdwMScsICcvcGx1Z2lucy9wMScsIHBhcnNlZCgpKV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzQmVmb3JlOiBzdG9yZS5oYXMoJ3AxJyksXG5cdFx0XHR0b2dnbGVkT2ZmOiBzdG9yZS5zZXRFbmFibGVkKCdwMScsIGZhbHNlKSxcblx0XHRcdHRvZ2dsZWRPZmZBZ2Fpbjogc3RvcmUuc2V0RW5hYmxlZCgncDEnLCBmYWxzZSksXG5cdFx0XHRyZW1vdmVkOiBzdG9yZS5yZW1vdmVDbGllbnQoJ2MxJyksXG5cdFx0XHRlbXB0eUFmdGVyOiBzdG9yZS5pc0VtcHR5KCksXG5cdFx0fSwgeyBoYXNCZWZvcmU6IHRydWUsIHRvZ2dsZWRPZmY6IHRydWUsIHRvZ2dsZWRPZmZBZ2FpbjogZmFsc2UsIHJlbW92ZWQ6IHRydWUsIGVtcHR5QWZ0ZXI6IHRydWUgfSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUEySDtBQUNwSSxTQUFTLHFCQUFtRDtBQUM1RCxTQUFTLG1DQUFtQztBQUU1QyxTQUFTLG1CQUFtQix1QkFBaUQ7QUFDN0UsU0FBUywrQkFBK0Isb0JBQW9CLDBCQUEwQiw0QkFBNEIsMkJBQTJCLGtDQUEyRDtBQUV4TSxNQUFNLDZCQUE2QixNQUFNO0FBQ3hDLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsa0JBQWMsWUFBWSxJQUFJLElBQUksWUFBWSxJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQ25FLGdCQUFZLElBQUksWUFBWSxpQkFBaUIsUUFBUSxVQUFVLFlBQVksSUFBSSxJQUFJLDJCQUEyQixDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ2xILENBQUM7QUFFRCxXQUFTLE1BQU0sWUFBWSxNQUFNLENBQUM7QUFFbEMsMENBQXdDO0FBRXhDLFdBQVMsb0JBQW9CLElBQWlDO0FBQzdELFdBQU8sRUFBRSxNQUFNLGtCQUFrQixRQUFRLElBQUksS0FBSyxtQkFBbUIsRUFBRSxJ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
