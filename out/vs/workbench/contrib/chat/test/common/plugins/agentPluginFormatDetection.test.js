import assert from "assert";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { waitForState } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { McpServerType } from "../../../../../../platform/mcp/common/mcpPlatformTypes.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { testWorkspace } from "../../../../../../platform/workspace/test/common/testWorkspace.js";
import { TestContextService } from "../../../../../test/common/workbenchTestServices.js";
import { IPathService } from "../../../../../services/path/common/pathService.js";
import { AbstractAgentPluginDiscovery } from "../../../common/plugins/agentPluginServiceImpl.js";
import { ContributionEnablementState } from "../../../common/enablement.js";
import { AGENT_PLUGIN_MCP_SCHEMA, AGENT_PLUGIN_SCHEMA } from "../../../../../../platform/agentPlugins/common/agentPluginParser.js";
import { PluginFormat } from "../../../../../../platform/agentPlugins/common/pluginParsers.js";
class TestPluginDiscovery extends AbstractAgentPluginDiscovery {
  constructor(fileService, pathService, logService, workspaceContextService) {
    super(fileService, pathService, logService, workspaceContextService);
    this._sources = [];
    this._remove = () => {
    };
  }
  start(enablementModel) {
    this._enablementModel = enablementModel;
  }
  /** Set plugin sources and trigger a refresh. */
  async setSourcesAndRefresh(uris) {
    this._sources = uris;
    await this._refreshPlugins();
  }
  async setRemoveAndRefresh(uri, remove) {
    this._sources = [uri];
    this._remove = remove;
    await this._refreshPlugins();
  }
  async setRemoveAndRefreshAfter(uri, remove, barrier) {
    this._sources = [uri];
    this._remove = remove;
    this._nextDiscoveryBarrier = barrier;
    await this._refreshPlugins();
  }
  async _discoverPluginSources() {
    const sources = this._sources.map((uri) => ({
      uri,
      fromMarketplace: void 0,
      remove: this._remove
    }));
    const barrier = this._nextDiscoveryBarrier;
    this._nextDiscoveryBarrier = void 0;
    await barrier;
    return sources;
  }
}
suite("AgentPlugin format detection", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const logService = new NullLogService();
  let fileService;
  let instantiationService;
  const workspaceRoot = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
  setup(() => {
    const contextService = new TestContextService(testWorkspace(workspaceRoot));
    fileService = store.add(new FileService(logService));
    store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
    instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, logService);
    instantiationService.stub(IWorkspaceContextService, contextService);
    instantiationService.stub(IPathService, {
      userHome: async () => URI.file("/home/testuser")
    });
    instantiationService.stub(IInstantiationService, instantiationService);
  });
  const mockEnablementModel = {
    readEnabled: () => ContributionEnablementState.EnabledProfile,
    readProfileEnabled: () => true,
    setEnabled: () => {
    },
    remove: () => {
    }
  };
  function createDiscovery() {
    return store.add(new TestPluginDiscovery(
      fileService,
      instantiationService.get(IPathService),
      logService,
      instantiationService.get(IWorkspaceContextService)
    ));
  }
  function getDiscoveredPlugins(discovery) {
    const plugins = discovery.plugins.get();
    assert.ok(plugins, "Expected plugin discovery to have completed");
    return plugins;
  }
  async function writeFile(path, content) {
    const uri = URI.from({ scheme: Schemas.inMemory, path });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
  }
  function pluginUri(path) {
    return URI.from({ scheme: Schemas.inMemory, path });
  }
  test("starts unresolved until first refresh completes", () => {
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    assert.strictEqual(discovery.plugins.get(), void 0);
  });
  test("refreshes removability for cached plugin entries", async () => {
    const uri = pluginUri("/plugins/removability");
    await writeFile("/plugins/removability/plugin.json", JSON.stringify({ name: "removability" }));
    const removeCounts = [0, 0];
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setRemoveAndRefresh(uri, () => removeCounts[0]++);
    const initialPlugin = getDiscoveredPlugins(discovery)[0];
    initialPlugin.remove?.();
    await discovery.setRemoveAndRefresh(uri, void 0);
    const managedPlugin = getDiscoveredPlugins(discovery)[0];
    const managedRemove = managedPlugin.remove;
    await discovery.setRemoveAndRefresh(uri, () => removeCounts[1]++);
    const removablePlugin = getDiscoveredPlugins(discovery)[0];
    removablePlugin.remove?.();
    assert.deepStrictEqual({
      reusedManagedPlugin: managedPlugin === initialPlugin,
      managedRemove,
      reusedRemovablePlugin: removablePlugin === initialPlugin,
      removeCounts
    }, {
      reusedManagedPlugin: true,
      managedRemove: void 0,
      reusedRemovablePlugin: true,
      removeCounts: [1, 1]
    });
  });
  test("stale refresh does not overwrite removability of published cached plugin", async () => {
    const uri = pluginUri("/plugins/removability-race");
    await writeFile("/plugins/removability-race/plugin.json", JSON.stringify({ name: "removability-race" }));
    let removeCount = 0;
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setRemoveAndRefresh(uri, () => {
    });
    const staleDiscoveryBarrier = new DeferredPromise();
    const staleRefresh = discovery.setRemoveAndRefreshAfter(uri, void 0, staleDiscoveryBarrier.p);
    await discovery.setRemoveAndRefresh(uri, () => removeCount++);
    staleDiscoveryBarrier.complete();
    await staleRefresh;
    const plugin = getDiscoveredPlugins(discovery)[0];
    plugin.remove?.();
    assert.deepStrictEqual({
      hasRemove: plugin.remove !== void 0,
      removeCount
    }, {
      hasRemove: true,
      removeCount: 1
    });
  });
  test("detects Open Plugin format when .plugin/plugin.json exists", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/my-open-plugin");
    await writeFile("/plugins/my-open-plugin/.plugin/plugin.json", JSON.stringify({ name: "my-open-plugin" }));
    await writeFile("/plugins/my-open-plugin/commands/hello.md", "# Hello");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (cmds) => cmds.length > 0);
    assert.strictEqual(plugins[0].commands.get()[0].name, "hello");
  }));
  test("detects Claude format when .claude-plugin/plugin.json exists", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/my-claude-plugin");
    await writeFile("/plugins/my-claude-plugin/.claude-plugin/plugin.json", JSON.stringify({ name: "my-claude-plugin" }));
    await writeFile("/plugins/my-claude-plugin/commands/greet.md", "# Greet");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (cmds) => cmds.length > 0);
    assert.strictEqual(plugins[0].commands.get()[0].name, "greet");
  }));
  test("falls back to Copilot format when no vendor manifest exists", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/my-copilot-plugin");
    await writeFile("/plugins/my-copilot-plugin/plugin.json", JSON.stringify({ name: "my-copilot-plugin" }));
    await writeFile("/plugins/my-copilot-plugin/commands/run.md", "# Run");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (cmds) => cmds.length > 0);
    assert.strictEqual(plugins[0].commands.get()[0].name, "run");
  }));
  test("plugin label uses manifest `name` when no marketplace metadata is present", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/_direct/sukumarp2022--slide-creator-plugin");
    await writeFile("/plugins/_direct/sukumarp2022--slide-creator-plugin/plugin.json", JSON.stringify({
      name: "Slide Creator"
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.deepStrictEqual(plugins.map((p) => p.label), ["Slide Creator"]);
  }));
  test("plugin label falls back to basename when manifest `name` is missing or invalid", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const missingUri = pluginUri("/plugins/missing-name");
    await writeFile("/plugins/missing-name/plugin.json", JSON.stringify({}));
    const blankUri = pluginUri("/plugins/blank-name");
    await writeFile("/plugins/blank-name/plugin.json", JSON.stringify({ name: "   " }));
    const nonStringUri = pluginUri("/plugins/non-string-name");
    await writeFile("/plugins/non-string-name/plugin.json", JSON.stringify({ name: 42 }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([missingUri, blankUri, nonStringUri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.deepStrictEqual(
      plugins.map((p) => p.label).sort(),
      ["blank-name", "missing-name", "non-string-name"]
    );
  }));
  test("Open Plugin format takes priority over Claude format", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/dual-plugin");
    await writeFile("/plugins/dual-plugin/.plugin/plugin.json", JSON.stringify({ name: "dual-plugin" }));
    await writeFile("/plugins/dual-plugin/.claude-plugin/plugin.json", JSON.stringify({ name: "dual-plugin" }));
    await writeFile("/plugins/dual-plugin/.plugin/plugin.json", JSON.stringify({
      name: "dual-plugin",
      mcpServers: { "open-server": { command: "echo", args: ["open"] } }
    }));
    await writeFile("/plugins/dual-plugin/.claude-plugin/plugin.json", JSON.stringify({
      name: "dual-plugin",
      mcpServers: { "claude-server": { command: "echo", args: ["claude"] } }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (defs) => defs.length > 0);
    const mcpDefs = plugins[0].mcpServerDefinitions.get();
    assert.strictEqual(mcpDefs.length, 1);
    assert.strictEqual(mcpDefs[0].name, "open-server");
  }));
  test("Agent Plugin root takes priority and exposes portable and Copilot extension components", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/agent-plugin");
    await writeFile("/plugins/agent-plugin/plugin.json", JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA,
      name: "agent-plugin",
      extensions: { "com.github.copilot": {} }
    }));
    await writeFile("/plugins/agent-plugin/.plugin/plugin.json", JSON.stringify({
      name: "legacy",
      mcpServers: { legacy: { command: "node" } }
    }));
    await writeFile("/plugins/agent-plugin/skills/portable/SKILL.md", "---\nname: portable\ndescription: Portable skill\n---");
    await writeFile("/plugins/agent-plugin/commands/ignored.md", "# Ignored");
    await writeFile("/plugins/agent-plugin/agents/ignored.md", "# Ignored");
    await writeFile("/plugins/agent-plugin/com.github.copilot/commands/ship.md", "# Ship");
    await writeFile("/plugins/agent-plugin/com.github.copilot/agents/helper.md", "# Helper");
    await writeFile("/plugins/agent-plugin/com.github.copilot/rules/project.instructions.md", "# Project");
    await writeFile("/plugins/agent-plugin/com.github.copilot/hooks/hooks.json", JSON.stringify({
      hooks: {
        PostToolUse: [{ type: "command", command: "echo done" }]
      }
    }));
    await writeFile("/plugins/agent-plugin/.mcp.json", JSON.stringify({ mcpServers: { ignored: { command: "node" } } }));
    await writeFile("/plugins/agent-plugin/mcp.json", JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA,
      mcpServers: { portable: { type: "streamable-http", url: "https://example.com/mcp" } }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugin = getDiscoveredPlugins(discovery)[0];
    await Promise.all([
      waitForState(plugin.skills, (skills) => skills.length > 0),
      waitForState(plugin.mcpServerDefinitions, (definitions) => definitions.length > 0),
      waitForState(plugin.commands, (commands) => commands.length > 0),
      waitForState(plugin.agents, (agents) => agents.length > 0),
      waitForState(plugin.hooks, (hooks) => hooks.length > 0),
      waitForState(plugin.instructions, (instructions) => instructions.length > 0)
    ]);
    assert.deepStrictEqual({
      label: plugin.label,
      skills: plugin.skills.get().map((skill) => skill.name),
      mcp: plugin.mcpServerDefinitions.get().map((server) => server.name),
      commands: plugin.commands.get().map((command) => command.name),
      agents: plugin.agents.get().map((agent) => agent.name),
      hooks: plugin.hooks.get().map((hook) => hook.type),
      instructions: plugin.instructions.get().map((instruction) => instruction.name)
    }, {
      label: "agent-plugin",
      skills: ["portable"],
      mcp: ["portable"],
      commands: ["ship"],
      agents: ["helper"],
      hooks: ["PostToolUse"],
      instructions: ["project"]
    });
  }));
  test("recognized Agent Plugin without a name uses the directory label without legacy fallback", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/rejected-agent-plugin");
    await writeFile("/plugins/rejected-agent-plugin/plugin.json", JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA }));
    await writeFile("/plugins/rejected-agent-plugin/.plugin/plugin.json", JSON.stringify({ name: "legacy" }));
    await writeFile("/plugins/rejected-agent-plugin/commands/legacy.md", "# Legacy");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugin = getDiscoveredPlugins(discovery)[0];
    assert.deepStrictEqual({
      format: plugin.format,
      label: plugin.label,
      commands: plugin.commands.get()
    }, {
      format: PluginFormat.AgentPlugin,
      label: "rejected-agent-plugin",
      commands: []
    });
  }));
  test("adding an Agent Plugin manifest re-detects an existing plugin", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/updated-plugin");
    await writeFile("/plugins/updated-plugin/.plugin/plugin.json", JSON.stringify({ name: "legacy" }));
    await writeFile("/plugins/updated-plugin/commands/legacy.md", "# Legacy");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    assert.strictEqual(getDiscoveredPlugins(discovery)[0].format, PluginFormat.OpenPlugin);
    await writeFile("/plugins/updated-plugin/plugin.json", JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: "updated" }));
    const plugins = await waitForState(discovery.plugins, (value) => value?.[0]?.format === PluginFormat.AgentPlugin);
    assert.deepStrictEqual({
      format: plugins?.[0].format,
      commands: plugins?.[0].commands.get()
    }, {
      format: PluginFormat.AgentPlugin,
      commands: []
    });
  }));
  test("Open Plugin reads MCP definitions from .plugin/plugin.json inline", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/mcp-plugin");
    await writeFile("/plugins/mcp-plugin/.plugin/plugin.json", JSON.stringify({
      name: "mcp-plugin",
      mcpServers: {
        "my-server": { command: "node", args: ["server.js"] }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (defs) => defs.length > 0);
    const mcpDefs = plugins[0].mcpServerDefinitions.get();
    assert.deepStrictEqual(mcpDefs.map((d) => d.name), ["my-server"]);
  }));
  test("Open Plugin reads MCP definitions from standalone .mcp.json", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/mcp-standalone");
    await writeFile("/plugins/mcp-standalone/.plugin/plugin.json", JSON.stringify({ name: "mcp-standalone" }));
    await writeFile("/plugins/mcp-standalone/.mcp.json", JSON.stringify({
      mcpServers: {
        "standalone-server": { command: "python", args: ["serve.py"] }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (defs) => defs.length > 0);
    assert.strictEqual(plugins[0].mcpServerDefinitions.get()[0].name, "standalone-server");
  }));
  test("reads skills from skills/ subdirectories", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/skills-plugin");
    await writeFile("/plugins/skills-plugin/.plugin/plugin.json", JSON.stringify({ name: "skills-plugin" }));
    await writeFile("/plugins/skills-plugin/skills/deploy/SKILL.md", "# Deploy skill");
    await writeFile("/plugins/skills-plugin/skills/lint/SKILL.md", "# Lint skill");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, (s) => s.length > 0);
    const skillNames = plugins[0].skills.get().map((s) => s.name).sort();
    assert.deepStrictEqual(skillNames, ["deploy", "lint"]);
  }));
  test("reads root-level SKILL.md as a fallback skill", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/root-skill");
    await writeFile("/plugins/root-skill/.plugin/plugin.json", JSON.stringify({ name: "root-skill" }));
    await writeFile("/plugins/root-skill/SKILL.md", "# Visual Explainer");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, (s) => s.length > 0);
    assert.deepStrictEqual(
      plugins[0].skills.get().map((s) => s.name),
      ["root-skill"]
    );
  }));
  test("root-level SKILL.md is ignored when skills/ has content", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/root-skill-ignored");
    await writeFile("/plugins/root-skill-ignored/.plugin/plugin.json", JSON.stringify({ name: "root-skill-ignored" }));
    await writeFile("/plugins/root-skill-ignored/SKILL.md", "# Root skill");
    await writeFile("/plugins/root-skill-ignored/skills/real/SKILL.md", "# Real skill");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, (s) => s.length > 0);
    assert.deepStrictEqual(
      plugins[0].skills.get().map((s) => s.name),
      ["real"]
    );
  }));
  test("reads agents from agents/ directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/agents-plugin");
    await writeFile("/plugins/agents-plugin/.plugin/plugin.json", JSON.stringify({ name: "agents-plugin" }));
    await writeFile("/plugins/agents-plugin/agents/reviewer.md", "---\nname: reviewer\n---\nYou review code.");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].agents, (a) => a.length > 0);
    assert.strictEqual(plugins[0].agents.get()[0].name, "reviewer");
  }));
  test("manifest skills field adds supplemental skill directories", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/custom-skills");
    await writeFile("/plugins/custom-skills/.plugin/plugin.json", JSON.stringify({
      name: "custom-skills",
      skills: "./extra-skills/"
    }));
    await writeFile("/plugins/custom-skills/skills/default-skill/SKILL.md", "# Default skill");
    await writeFile("/plugins/custom-skills/extra-skills/bonus-skill/SKILL.md", "# Bonus skill");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, (s) => s.length >= 2);
    assert.deepStrictEqual(
      plugins[0].skills.get().map((s) => s.name).sort(),
      ["bonus-skill", "default-skill"]
    );
  }));
  test("manifest skills field with exclusive mode skips default directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/exclusive-skills");
    await writeFile("/plugins/exclusive-skills/.plugin/plugin.json", JSON.stringify({
      name: "exclusive-skills",
      skills: { paths: ["./only-here/"], exclusive: true }
    }));
    await writeFile("/plugins/exclusive-skills/skills/ignored/SKILL.md", "# Should be ignored");
    await writeFile("/plugins/exclusive-skills/only-here/visible/SKILL.md", "# Should be visible");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, (s) => s.length > 0);
    assert.deepStrictEqual(
      plugins[0].skills.get().map((s) => s.name),
      ["visible"]
    );
  }));
  test("manifest commands field with string array scans multiple directories", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/multi-commands");
    await writeFile("/plugins/multi-commands/.plugin/plugin.json", JSON.stringify({
      name: "multi-commands",
      commands: ["./cmd1/", "./cmd2/"]
    }));
    await writeFile("/plugins/multi-commands/commands/default.md", "# Default");
    await writeFile("/plugins/multi-commands/cmd1/alpha.md", "# Alpha");
    await writeFile("/plugins/multi-commands/cmd2/beta.md", "# Beta");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (c) => c.length >= 3);
    assert.deepStrictEqual(
      plugins[0].commands.get().map((c) => c.name).sort(),
      ["alpha", "beta", "default"]
    );
  }));
  test("manifest agents field adds supplemental agent directories", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/custom-agents");
    await writeFile("/plugins/custom-agents/.plugin/plugin.json", JSON.stringify({
      name: "custom-agents",
      agents: "./extra-agents/"
    }));
    await writeFile("/plugins/custom-agents/agents/default-agent.md", "# Default");
    await writeFile("/plugins/custom-agents/extra-agents/bonus-agent.md", "# Bonus");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].agents, (a) => a.length >= 2);
    assert.deepStrictEqual(
      plugins[0].agents.get().map((a) => a.name).sort(),
      ["bonus-agent", "default-agent"]
    );
  }));
  test("path traversal in manifest is rejected", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/traversal");
    await writeFile("/plugins/traversal/.plugin/plugin.json", JSON.stringify({
      name: "traversal",
      skills: "../outside/"
    }));
    await writeFile("/plugins/outside/evil/SKILL.md", "# Evil skill");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, () => true);
    assert.deepStrictEqual(plugins[0].skills.get(), []);
  }));
  test("duplicate names across directories deduplicate (first wins)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/dedup");
    await writeFile("/plugins/dedup/.plugin/plugin.json", JSON.stringify({
      name: "dedup",
      commands: "./extra-commands/"
    }));
    await writeFile("/plugins/dedup/commands/shared.md", "# Default version");
    await writeFile("/plugins/dedup/extra-commands/shared.md", "# Custom version");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (c) => c.length > 0);
    const cmds = plugins[0].commands.get();
    assert.strictEqual(cmds.length, 1);
    assert.strictEqual(cmds[0].name, "shared");
    assert.ok(cmds[0].uri.path.includes("/commands/shared.md"));
  }));
  test("discovers components without a manifest", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/no-manifest");
    await writeFile("/plugins/no-manifest/commands/hello.md", "# Hello");
    await writeFile("/plugins/no-manifest/skills/my-skill/SKILL.md", "# My skill");
    await writeFile("/plugins/no-manifest/agents/helper.md", "# Helper");
    await writeFile("/plugins/no-manifest/rules/prefer-const.mdc", "---\ndescription: Prefer const\n---\nUse const.");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    assert.strictEqual(plugins[0].label, "no-manifest");
    await waitForState(plugins[0].commands, (c) => c.length > 0);
    assert.strictEqual(plugins[0].commands.get()[0].name, "hello");
    await waitForState(plugins[0].skills, (s) => s.length > 0);
    assert.strictEqual(plugins[0].skills.get()[0].name, "my-skill");
    await waitForState(plugins[0].agents, (a) => a.length > 0);
    assert.strictEqual(plugins[0].agents.get()[0].name, "helper");
    await waitForState(plugins[0].instructions, (i) => i.length > 0);
    assert.strictEqual(plugins[0].instructions.get()[0].name, "prefer-const");
  }));
  test("reads hooks from default hooks/hooks.json", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/hooks-default");
    await writeFile("/plugins/hooks-default/.plugin/plugin.json", JSON.stringify({ name: "hooks-default" }));
    await writeFile("/plugins/hooks-default/hooks/hooks.json", JSON.stringify({
      hooks: {
        PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "echo done" }] }]
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].hooks, (h) => h.length > 0);
    assert.strictEqual(plugins[0].hooks.get().length, 1);
  }));
  test("reads inline hooks from manifest", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/hooks-inline");
    await writeFile("/plugins/hooks-inline/.plugin/plugin.json", JSON.stringify({
      name: "hooks-inline",
      hooks: {
        hooks: {
          SessionStart: [{ hooks: [{ type: "command", command: "echo start" }] }]
        }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].hooks, (h) => h.length > 0);
    assert.strictEqual(plugins[0].hooks.get().length, 1);
  }));
  test("reads hooks from custom path in manifest", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/hooks-custom");
    await writeFile("/plugins/hooks-custom/.plugin/plugin.json", JSON.stringify({
      name: "hooks-custom",
      hooks: "./config/my-hooks.json"
    }));
    await writeFile("/plugins/hooks-custom/config/my-hooks.json", JSON.stringify({
      hooks: {
        PostToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "echo edited" }] }]
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].hooks, (h) => h.length > 0);
    assert.strictEqual(plugins[0].hooks.get().length, 1);
  }));
  test("reads MCP from custom path in manifest", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/mcp-custom");
    await writeFile("/plugins/mcp-custom/.plugin/plugin.json", JSON.stringify({
      name: "mcp-custom",
      mcpServers: "./config/servers.json"
    }));
    await writeFile("/plugins/mcp-custom/config/servers.json", JSON.stringify({
      mcpServers: {
        "custom-server": { command: "node", args: ["custom.js"] }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (d) => d.length > 0);
    assert.strictEqual(plugins[0].mcpServerDefinitions.get()[0].name, "custom-server");
  }));
  test("inline MCP in manifest takes priority over standalone .mcp.json", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/mcp-merged");
    await writeFile("/plugins/mcp-merged/.plugin/plugin.json", JSON.stringify({
      name: "mcp-merged",
      mcpServers: {
        "inline-server": { command: "echo", args: ["inline"] }
      }
    }));
    await writeFile("/plugins/mcp-merged/.mcp.json", JSON.stringify({
      mcpServers: {
        "file-server": { command: "echo", args: ["file"] }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (d) => [...d].some((s) => s.name === "inline-server"));
    assert.deepStrictEqual(
      plugins[0].mcpServerDefinitions.get().map((d) => d.name),
      ["inline-server"]
    );
  }));
  test("PLUGIN_ROOT expansion in hook commands", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/root-expansion");
    await writeFile("/plugins/root-expansion/.plugin/plugin.json", JSON.stringify({
      name: "root-expansion",
      hooks: {
        hooks: {
          PostToolUse: [{
            hooks: [{
              type: "command",
              command: "${PLUGIN_ROOT}/scripts/format.sh"
            }]
          }]
        }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].hooks, (h) => h.length > 0);
    const hookCommands = plugins[0].hooks.get()[0].hooks;
    assert.ok(hookCommands.length > 0);
    const command = hookCommands[0].command;
    assert.ok(command && !command.includes("${PLUGIN_ROOT}"), `Expected PLUGIN_ROOT to be expanded, got: ${command}`);
  }));
  test("manifest commands field pointing to a specific file", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/cmd-file");
    await writeFile("/plugins/cmd-file/.plugin/plugin.json", JSON.stringify({
      name: "cmd-file",
      commands: "./special/deploy.md"
    }));
    await writeFile("/plugins/cmd-file/commands/default.md", "# Default");
    await writeFile("/plugins/cmd-file/special/deploy.md", "# Deploy");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (c) => c.length >= 2);
    assert.deepStrictEqual(
      plugins[0].commands.get().map((c) => c.name).sort(),
      ["default", "deploy"]
    );
  }));
  test("manifest commands field with array of specific files", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/cmd-files");
    await writeFile("/plugins/cmd-files/.plugin/plugin.json", JSON.stringify({
      name: "cmd-files",
      commands: ["./extras/alpha.md", "./extras/beta.md"]
    }));
    await writeFile("/plugins/cmd-files/extras/alpha.md", "# Alpha");
    await writeFile("/plugins/cmd-files/extras/beta.md", "# Beta");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].commands, (c) => c.length >= 2);
    assert.deepStrictEqual(
      plugins[0].commands.get().map((c) => c.name).sort(),
      ["alpha", "beta"]
    );
  }));
  test("manifest agents field pointing to a specific file", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/agent-file");
    await writeFile("/plugins/agent-file/.plugin/plugin.json", JSON.stringify({
      name: "agent-file",
      agents: "./custom/specialist.md"
    }));
    await writeFile("/plugins/agent-file/agents/default.md", "# Default");
    await writeFile("/plugins/agent-file/custom/specialist.md", "# Specialist");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].agents, (a) => a.length >= 2);
    assert.deepStrictEqual(
      plugins[0].agents.get().map((a) => a.name).sort(),
      ["default", "specialist"]
    );
  }));
  test("manifest skills field pointing to a specific skill directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/skill-dir");
    await writeFile("/plugins/skill-dir/.plugin/plugin.json", JSON.stringify({
      name: "skill-dir",
      skills: "./custom/my-skill"
    }));
    await writeFile("/plugins/skill-dir/custom/my-skill/SKILL.md", "# My Skill");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].skills, (s) => s.length > 0);
    assert.deepStrictEqual(
      plugins[0].skills.get().map((s) => s.name),
      ["my-skill"]
    );
  }));
  test("manifest hooks field pointing to a specific file", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/hook-file");
    await writeFile("/plugins/hook-file/.plugin/plugin.json", JSON.stringify({
      name: "hook-file",
      hooks: "./config/custom-hooks.json"
    }));
    await writeFile("/plugins/hook-file/config/custom-hooks.json", JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }]
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].hooks, (h) => h.length > 0);
    assert.strictEqual(plugins[0].hooks.get().length, 1);
  }));
  test("manifest mcpServers field pointing to a specific file", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/mcp-file");
    await writeFile("/plugins/mcp-file/.plugin/plugin.json", JSON.stringify({
      name: "mcp-file",
      mcpServers: "./config/servers.json"
    }));
    await writeFile("/plugins/mcp-file/config/servers.json", JSON.stringify({
      mcpServers: {
        "custom-server": { command: "node", args: ["serve.js"] }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (d) => d.length > 0);
    assert.strictEqual(plugins[0].mcpServerDefinitions.get()[0].name, "custom-server");
  }));
  test("reads rules from rules/ directory with .mdc extension", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/rules-plugin");
    await writeFile("/plugins/rules-plugin/.plugin/plugin.json", JSON.stringify({ name: "rules-plugin" }));
    await writeFile("/plugins/rules-plugin/rules/prefer-const.mdc", "---\ndescription: Prefer const\n---\nUse const.");
    await writeFile("/plugins/rules-plugin/rules/error-handling.mdc", "---\ndescription: Error handling\n---\nAlways handle errors.");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].instructions, (i) => i.length >= 2);
    assert.deepStrictEqual(
      plugins[0].instructions.get().map((i) => i.name).sort(),
      ["error-handling", "prefer-const"]
    );
  }));
  test("reads rules with .md and .instructions.md extensions", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/rules-mixed");
    await writeFile("/plugins/rules-mixed/.plugin/plugin.json", JSON.stringify({ name: "rules-mixed" }));
    await writeFile("/plugins/rules-mixed/rules/rule-a.mdc", "Rule A");
    await writeFile("/plugins/rules-mixed/rules/rule-b.md", "Rule B");
    await writeFile("/plugins/rules-mixed/rules/rule-c.instructions.md", "Rule C");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].instructions, (i) => i.length >= 3);
    assert.deepStrictEqual(
      plugins[0].instructions.get().map((i) => i.name).sort(),
      ["rule-a", "rule-b", "rule-c"]
    );
  }));
  test("manifest rules field adds supplemental rule directories", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/custom-rules");
    await writeFile("/plugins/custom-rules/.plugin/plugin.json", JSON.stringify({
      name: "custom-rules",
      rules: "./extra-rules/"
    }));
    await writeFile("/plugins/custom-rules/rules/default-rule.mdc", "Default rule");
    await writeFile("/plugins/custom-rules/extra-rules/bonus-rule.mdc", "Bonus rule");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].instructions, (i) => i.length >= 2);
    assert.deepStrictEqual(
      plugins[0].instructions.get().map((i) => i.name).sort(),
      ["bonus-rule", "default-rule"]
    );
  }));
  test("manifest rules field with exclusive mode skips default directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/exclusive-rules");
    await writeFile("/plugins/exclusive-rules/.plugin/plugin.json", JSON.stringify({
      name: "exclusive-rules",
      rules: { paths: ["./only-here/"], exclusive: true }
    }));
    await writeFile("/plugins/exclusive-rules/rules/ignored.mdc", "Should be ignored");
    await writeFile("/plugins/exclusive-rules/only-here/visible.mdc", "Should be visible");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].instructions, (i) => i.length === 1 && i[0].name === "visible");
    assert.deepStrictEqual(
      plugins[0].instructions.get().map((i) => i.name),
      ["visible"]
    );
  }));
  test("rule name strips longest matching suffix first", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/suffix-rules");
    await writeFile("/plugins/suffix-rules/.plugin/plugin.json", JSON.stringify({ name: "suffix-rules" }));
    await writeFile("/plugins/suffix-rules/rules/coding-standards.instructions.md", "Standards");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].instructions, (i) => i.length > 0);
    assert.strictEqual(plugins[0].instructions.get()[0].name, "coding-standards");
  }));
  test("deduplicates rules with the same base name", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/dup-rules");
    await writeFile("/plugins/dup-rules/.plugin/plugin.json", JSON.stringify({
      name: "dup-rules",
      rules: "./extra/"
    }));
    await writeFile("/plugins/dup-rules/rules/my-rule.mdc", "From default");
    await writeFile("/plugins/dup-rules/extra/my-rule.md", "From extra");
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].instructions, (i) => i.length > 0);
    assert.strictEqual(plugins[0].instructions.get().length, 1);
    const instruction = plugins[0].instructions.get()[0];
    assert.strictEqual(instruction.name, "my-rule");
    assert.ok(instruction.uri.path.endsWith("/rules/my-rule.mdc"));
  }));
  test("PLUGIN_ROOT expansion in inline MCP server definitions", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/mcp-root");
    await writeFile("/plugins/mcp-root/.plugin/plugin.json", JSON.stringify({
      name: "mcp-root",
      mcpServers: {
        "my-server": {
          command: "${PLUGIN_ROOT}/bin/server",
          args: ["--config", "${PLUGIN_ROOT}/config.json"],
          cwd: "${PLUGIN_ROOT}",
          env: { "CONFIG_DIR": "${PLUGIN_ROOT}/etc" }
        }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (d) => d.length > 0);
    const server = plugins[0].mcpServerDefinitions.get()[0];
    assert.strictEqual(server.name, "my-server");
    const config = server.configuration;
    assert.ok(!config.command.includes("${PLUGIN_ROOT}"), `Expected PLUGIN_ROOT to be expanded in command, got: ${config.command}`);
    assert.ok(!config.args[1].includes("${PLUGIN_ROOT}"), `Expected PLUGIN_ROOT to be expanded in args, got: ${config.args[1]}`);
    assert.ok(!config.cwd.includes("${PLUGIN_ROOT}"), `Expected PLUGIN_ROOT to be expanded in cwd, got: ${config.cwd}`);
    assert.ok(!config.env["CONFIG_DIR"].includes("${PLUGIN_ROOT}"), `Expected PLUGIN_ROOT to be expanded in env, got: ${config.env["CONFIG_DIR"]}`);
    assert.strictEqual(config.env["PLUGIN_ROOT"], uri.fsPath, "Expected PLUGIN_ROOT env var to be set");
  }));
  test("CLAUDE_PLUGIN_ROOT expansion in MCP server definitions from .mcp.json", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/claude-mcp-root");
    await writeFile("/plugins/claude-mcp-root/.claude-plugin/plugin.json", JSON.stringify({ name: "claude-mcp-root" }));
    await writeFile("/plugins/claude-mcp-root/.mcp.json", JSON.stringify({
      mcpServers: {
        "claude-server": {
          command: "${CLAUDE_PLUGIN_ROOT}/run.sh",
          args: ["--dir", "${CLAUDE_PLUGIN_ROOT}/data"]
        }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (d) => d.length > 0);
    const server = plugins[0].mcpServerDefinitions.get()[0];
    const config = server.configuration;
    assert.ok(!config.command.includes("${CLAUDE_PLUGIN_ROOT}"), `Expected CLAUDE_PLUGIN_ROOT to be expanded in command, got: ${config.command}`);
    assert.ok(!config.args[1].includes("${CLAUDE_PLUGIN_ROOT}"), `Expected CLAUDE_PLUGIN_ROOT to be expanded in args, got: ${config.args[1]}`);
    assert.strictEqual(config.env["CLAUDE_PLUGIN_ROOT"], uri.fsPath, "Expected CLAUDE_PLUGIN_ROOT env var to be set");
  }));
  test("Copilot Plugin MCP servers expand root aliases and default cwd to plugin root", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const uri = pluginUri("/plugins/copilot-mcp-root");
    await writeFile("/plugins/copilot-mcp-root/plugin.json", JSON.stringify({ name: "copilot-mcp-root" }));
    await writeFile("/plugins/copilot-mcp-root/.mcp.json", JSON.stringify({
      mcpServers: {
        "copilot-server": {
          command: "${PLUGIN_ROOT}/bin/server",
          args: ["--data", "${CLAUDE_PLUGIN_ROOT}/data"],
          env: { CONFIG_DIR: "${PLUGIN_ROOT}/etc" }
        },
        "explicit-cwd-server": {
          command: "node",
          cwd: "/custom/cwd"
        }
      }
    }));
    const discovery = createDiscovery();
    discovery.start(mockEnablementModel);
    await discovery.setSourcesAndRefresh([uri]);
    const plugins = getDiscoveredPlugins(discovery);
    assert.strictEqual(plugins.length, 1);
    await waitForState(plugins[0].mcpServerDefinitions, (d) => d.length === 2);
    const servers = new Map(plugins[0].mcpServerDefinitions.get().map((server) => [server.name, server.configuration]));
    const defaultCwdConfig = servers.get("copilot-server");
    assert.strictEqual(defaultCwdConfig?.type, McpServerType.LOCAL);
    if (defaultCwdConfig?.type !== McpServerType.LOCAL) {
      assert.fail("Expected a local MCP server configuration");
    }
    const explicitCwdConfig = servers.get("explicit-cwd-server");
    assert.strictEqual(explicitCwdConfig?.type, McpServerType.LOCAL);
    if (explicitCwdConfig?.type !== McpServerType.LOCAL) {
      assert.fail("Expected a local MCP server configuration");
    }
    assert.deepStrictEqual({
      defaultCwd: {
        command: defaultCwdConfig.command,
        args: defaultCwdConfig.args,
        cwd: defaultCwdConfig.cwd,
        env: defaultCwdConfig.env
      },
      explicitCwd: {
        command: explicitCwdConfig.command,
        cwd: explicitCwdConfig.cwd
      }
    }, {
      defaultCwd: {
        command: `${uri.fsPath}/bin/server`,
        args: ["--data", `${uri.fsPath}/data`],
        cwd: uri.fsPath,
        env: {
          CONFIG_DIR: `${uri.fsPath}/etc`,
          PLUGIN_ROOT: uri.fsPath,
          CLAUDE_PLUGIN_ROOT: uri.fsPath
        }
      },
      explicitCwd: {
        command: "node",
        cwd: "/custom/cwd"
      }
    });
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccGx1Z2luc1xcYWdlbnRQbHVnaW5Gb3JtYXREZXRlY3Rpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IHdhaXRGb3JTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IE1jcFNlcnZlclR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcFBsYXRmb3JtVHlwZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgdGVzdFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS90ZXN0L2NvbW1vbi90ZXN0V29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEFnZW50UGx1Z2luRGlzY292ZXJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUsIElFbmFibGVtZW50TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBBR0VOVF9QTFVHSU5fTUNQX1NDSEVNQSwgQUdFTlRfUExVR0lOX1NDSEVNQSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50UGx1Z2lucy9jb21tb24vYWdlbnRQbHVnaW5QYXJzZXIuanMnO1xuaW1wb3J0IHsgUGx1Z2luRm9ybWF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRQbHVnaW5zL2NvbW1vbi9wbHVnaW5QYXJzZXJzLmpzJztcblxuLyoqXG4gKiBDb25jcmV0ZSBkaXNjb3Zlcnkgc3ViY2xhc3MgdGhhdCByZXR1cm5zIGEgZml4ZWQgbGlzdCBvZiBwbHVnaW4gVVJJcyxcbiAqIGFsbG93aW5nIGZvcm1hdCBkZXRlY3Rpb24gYW5kIGNvbnRlbnQgcmVhZGluZyB0byBiZSB0ZXN0ZWQgaW4gaXNvbGF0aW9uLlxuICovXG5jbGFzcyBUZXN0UGx1Z2luRGlzY292ZXJ5IGV4dGVuZHMgQWJzdHJhY3RBZ2VudFBsdWdpbkRpc2NvdmVyeSB7XG5cdHByaXZhdGUgX3NvdXJjZXM6IFVSSVtdID0gW107XG5cdHByaXZhdGUgX3JlbW92ZTogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkID0gKCkgPT4geyB9O1xuXHRwcml2YXRlIF9uZXh0RGlzY292ZXJ5QmFycmllcjogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZmlsZVNlcnZpY2UsIHBhdGhTZXJ2aWNlLCBsb2dTZXJ2aWNlLCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdH1cblxuXHRzdGFydChlbmFibGVtZW50TW9kZWw6IElFbmFibGVtZW50TW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl9lbmFibGVtZW50TW9kZWwgPSBlbmFibGVtZW50TW9kZWw7XG5cdH1cblxuXHQvKiogU2V0IHBsdWdpbiBzb3VyY2VzIGFuZCB0cmlnZ2VyIGEgcmVmcmVzaC4gKi9cblx0YXN5bmMgc2V0U291cmNlc0FuZFJlZnJlc2godXJpczogVVJJW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zb3VyY2VzID0gdXJpcztcblx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoUGx1Z2lucygpO1xuXHR9XG5cblx0YXN5bmMgc2V0UmVtb3ZlQW5kUmVmcmVzaCh1cmk6IFVSSSwgcmVtb3ZlOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zb3VyY2VzID0gW3VyaV07XG5cdFx0dGhpcy5fcmVtb3ZlID0gcmVtb3ZlO1xuXHRcdGF3YWl0IHRoaXMuX3JlZnJlc2hQbHVnaW5zKCk7XG5cdH1cblxuXHRhc3luYyBzZXRSZW1vdmVBbmRSZWZyZXNoQWZ0ZXIodXJpOiBVUkksIHJlbW92ZTogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkLCBiYXJyaWVyOiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fc291cmNlcyA9IFt1cmldO1xuXHRcdHRoaXMuX3JlbW92ZSA9IHJlbW92ZTtcblx0XHR0aGlzLl9uZXh0RGlzY292ZXJ5QmFycmllciA9IGJhcnJpZXI7XG5cdFx0YXdhaXQgdGhpcy5fcmVmcmVzaFBsdWdpbnMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfZGlzY292ZXJQbHVnaW5Tb3VyY2VzKCkge1xuXHRcdGNvbnN0IHNvdXJjZXMgPSB0aGlzLl9zb3VyY2VzLm1hcCh1cmkgPT4gKHtcblx0XHRcdHVyaSxcblx0XHRcdGZyb21NYXJrZXRwbGFjZTogdW5kZWZpbmVkLFxuXHRcdFx0cmVtb3ZlOiB0aGlzLl9yZW1vdmUsXG5cdFx0fSkpO1xuXHRcdGNvbnN0IGJhcnJpZXIgPSB0aGlzLl9uZXh0RGlzY292ZXJ5QmFycmllcjtcblx0XHR0aGlzLl9uZXh0RGlzY292ZXJ5QmFycmllciA9IHVuZGVmaW5lZDtcblx0XHRhd2FpdCBiYXJyaWVyO1xuXHRcdHJldHVybiBzb3VyY2VzO1xuXHR9XG59XG5cbnN1aXRlKCdBZ2VudFBsdWdpbiBmb3JtYXQgZGV0ZWN0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cblx0bGV0IGZpbGVTZXJ2aWNlOiBGaWxlU2VydmljZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy93b3Jrc3BhY2UnIH0pO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0U2VydmljZSA9IG5ldyBUZXN0Q29udGV4dFNlcnZpY2UodGVzdFdvcmtzcGFjZSh3b3Jrc3BhY2VSb290KSk7XG5cblx0XHRmaWxlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRcdHN0b3JlLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaW5NZW1vcnksIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgY29udGV4dFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVBhdGhTZXJ2aWNlLCB7XG5cdFx0XHR1c2VySG9tZTogYXN5bmMgKCkgPT4gVVJJLmZpbGUoJy9ob21lL3Rlc3R1c2VyJyksXG5cdFx0fSBhcyBQYXJ0aWFsPElQYXRoU2VydmljZT4gYXMgSVBhdGhTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElJbnN0YW50aWF0aW9uU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHR9KTtcblxuXHRjb25zdCBtb2NrRW5hYmxlbWVudE1vZGVsOiBJRW5hYmxlbWVudE1vZGVsID0ge1xuXHRcdHJlYWRFbmFibGVkOiAoKSA9PiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUsXG5cdFx0cmVhZFByb2ZpbGVFbmFibGVkOiAoKSA9PiB0cnVlLFxuXHRcdHNldEVuYWJsZWQ6ICgpID0+IHsgfSxcblx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0fTtcblxuXHRmdW5jdGlvbiBjcmVhdGVEaXNjb3ZlcnkoKTogVGVzdFBsdWdpbkRpc2NvdmVyeSB7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChuZXcgVGVzdFBsdWdpbkRpc2NvdmVyeShcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElQYXRoU2VydmljZSksXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSksXG5cdFx0KSk7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3Zlcnk6IFRlc3RQbHVnaW5EaXNjb3ZlcnkpIHtcblx0XHRjb25zdCBwbHVnaW5zID0gZGlzY292ZXJ5LnBsdWdpbnMuZ2V0KCk7XG5cdFx0YXNzZXJ0Lm9rKHBsdWdpbnMsICdFeHBlY3RlZCBwbHVnaW4gZGlzY292ZXJ5IHRvIGhhdmUgY29tcGxldGVkJyk7XG5cdFx0cmV0dXJuIHBsdWdpbnM7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiB3cml0ZUZpbGUocGF0aDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aCB9KTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHBsdWdpblVyaShwYXRoOiBzdHJpbmcpOiBVUkkge1xuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aCB9KTtcblx0fVxuXG5cdHRlc3QoJ3N0YXJ0cyB1bnJlc29sdmVkIHVudGlsIGZpcnN0IHJlZnJlc2ggY29tcGxldGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNjb3ZlcnkucGx1Z2lucy5nZXQoKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaGVzIHJlbW92YWJpbGl0eSBmb3IgY2FjaGVkIHBsdWdpbiBlbnRyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvcmVtb3ZhYmlsaXR5Jyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9yZW1vdmFiaWxpdHkvcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdyZW1vdmFiaWxpdHknIH0pKTtcblxuXHRcdGNvbnN0IHJlbW92ZUNvdW50cyA9IFswLCAwXTtcblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFJlbW92ZUFuZFJlZnJlc2godXJpLCAoKSA9PiByZW1vdmVDb3VudHNbMF0rKyk7XG5cdFx0Y29uc3QgaW5pdGlhbFBsdWdpbiA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSlbMF07XG5cdFx0aW5pdGlhbFBsdWdpbi5yZW1vdmU/LigpO1xuXG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFJlbW92ZUFuZFJlZnJlc2godXJpLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IG1hbmFnZWRQbHVnaW4gPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpWzBdO1xuXHRcdGNvbnN0IG1hbmFnZWRSZW1vdmUgPSBtYW5hZ2VkUGx1Z2luLnJlbW92ZTtcblxuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRSZW1vdmVBbmRSZWZyZXNoKHVyaSwgKCkgPT4gcmVtb3ZlQ291bnRzWzFdKyspO1xuXHRcdGNvbnN0IHJlbW92YWJsZVBsdWdpbiA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSlbMF07XG5cdFx0cmVtb3ZhYmxlUGx1Z2luLnJlbW92ZT8uKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJldXNlZE1hbmFnZWRQbHVnaW46IG1hbmFnZWRQbHVnaW4gPT09IGluaXRpYWxQbHVnaW4sXG5cdFx0XHRtYW5hZ2VkUmVtb3ZlLFxuXHRcdFx0cmV1c2VkUmVtb3ZhYmxlUGx1Z2luOiByZW1vdmFibGVQbHVnaW4gPT09IGluaXRpYWxQbHVnaW4sXG5cdFx0XHRyZW1vdmVDb3VudHMsXG5cdFx0fSwge1xuXHRcdFx0cmV1c2VkTWFuYWdlZFBsdWdpbjogdHJ1ZSxcblx0XHRcdG1hbmFnZWRSZW1vdmU6IHVuZGVmaW5lZCxcblx0XHRcdHJldXNlZFJlbW92YWJsZVBsdWdpbjogdHJ1ZSxcblx0XHRcdHJlbW92ZUNvdW50czogWzEsIDFdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFsZSByZWZyZXNoIGRvZXMgbm90IG92ZXJ3cml0ZSByZW1vdmFiaWxpdHkgb2YgcHVibGlzaGVkIGNhY2hlZCBwbHVnaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9yZW1vdmFiaWxpdHktcmFjZScpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvcmVtb3ZhYmlsaXR5LXJhY2UvcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdyZW1vdmFiaWxpdHktcmFjZScgfSkpO1xuXG5cdFx0bGV0IHJlbW92ZUNvdW50ID0gMDtcblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFJlbW92ZUFuZFJlZnJlc2godXJpLCAoKSA9PiB7IH0pO1xuXG5cdFx0Y29uc3Qgc3RhbGVEaXNjb3ZlcnlCYXJyaWVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHN0YWxlUmVmcmVzaCA9IGRpc2NvdmVyeS5zZXRSZW1vdmVBbmRSZWZyZXNoQWZ0ZXIodXJpLCB1bmRlZmluZWQsIHN0YWxlRGlzY292ZXJ5QmFycmllci5wKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0UmVtb3ZlQW5kUmVmcmVzaCh1cmksICgpID0+IHJlbW92ZUNvdW50KyspO1xuXHRcdHN0YWxlRGlzY292ZXJ5QmFycmllci5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHN0YWxlUmVmcmVzaDtcblxuXHRcdGNvbnN0IHBsdWdpbiA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSlbMF07XG5cdFx0cGx1Z2luLnJlbW92ZT8uKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc1JlbW92ZTogcGx1Z2luLnJlbW92ZSAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0cmVtb3ZlQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0aGFzUmVtb3ZlOiB0cnVlLFxuXHRcdFx0cmVtb3ZlQ291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RldGVjdHMgT3BlbiBQbHVnaW4gZm9ybWF0IHdoZW4gLnBsdWdpbi9wbHVnaW4uanNvbiBleGlzdHMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL215LW9wZW4tcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9teS1vcGVuLXBsdWdpbi8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAnbXktb3Blbi1wbHVnaW4nIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL215LW9wZW4tcGx1Z2luL2NvbW1hbmRzL2hlbGxvLm1kJywgJyMgSGVsbG8nKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgcGx1Z2luIHJlYWQgY29tbWFuZHMgZnJvbSB0aGUgc3RhbmRhcmQgY29tbWFuZHMvIGRpcmVjdG9yeVxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLmNvbW1hbmRzLCBjbWRzID0+IGNtZHMubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnNbMF0uY29tbWFuZHMuZ2V0KClbMF0ubmFtZSwgJ2hlbGxvJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkZXRlY3RzIENsYXVkZSBmb3JtYXQgd2hlbiAuY2xhdWRlLXBsdWdpbi9wbHVnaW4uanNvbiBleGlzdHMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL215LWNsYXVkZS1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL215LWNsYXVkZS1wbHVnaW4vLmNsYXVkZS1wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdteS1jbGF1ZGUtcGx1Z2luJyB9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9teS1jbGF1ZGUtcGx1Z2luL2NvbW1hbmRzL2dyZWV0Lm1kJywgJyMgR3JlZXQnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5jb21tYW5kcywgY21kcyA9PiBjbWRzLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLmNvbW1hbmRzLmdldCgpWzBdLm5hbWUsICdncmVldCcpO1xuXHR9KSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBDb3BpbG90IGZvcm1hdCB3aGVuIG5vIHZlbmRvciBtYW5pZmVzdCBleGlzdHMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL215LWNvcGlsb3QtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9teS1jb3BpbG90LXBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ215LWNvcGlsb3QtcGx1Z2luJyB9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9teS1jb3BpbG90LXBsdWdpbi9jb21tYW5kcy9ydW4ubWQnLCAnIyBSdW4nKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5jb21tYW5kcywgY21kcyA9PiBjbWRzLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLmNvbW1hbmRzLmdldCgpWzBdLm5hbWUsICdydW4nKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3BsdWdpbiBsYWJlbCB1c2VzIG1hbmlmZXN0IGBuYW1lYCB3aGVuIG5vIG1hcmtldHBsYWNlIG1ldGFkYXRhIGlzIHByZXNlbnQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBEaXJlY3QtaW5zdGFsbGVkIHBsdWdpbiAobm8gbWFya2V0cGxhY2UgbWV0YWRhdGEpIHdpdGggYSBgbmFtZWAgaW5cblx0XHQvLyBpdHMgbWFuaWZlc3QgXHUyMDE0IHRoZSBsYWJlbCBzaG91bGQgdXNlIHRoZSBtYW5pZmVzdCBuYW1lLCBub3QgdGhlXG5cdFx0Ly8gdWdsaWVyIGRpcmVjdG9yeSBiYXNlbmFtZS5cblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL19kaXJlY3Qvc3VrdW1hcnAyMDIyLS1zbGlkZS1jcmVhdG9yLXBsdWdpbicpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvX2RpcmVjdC9zdWt1bWFycDIwMjItLXNsaWRlLWNyZWF0b3ItcGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ1NsaWRlIENyZWF0b3InLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwbHVnaW5zLm1hcChwID0+IHAubGFiZWwpLCBbJ1NsaWRlIENyZWF0b3InXSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdwbHVnaW4gbGFiZWwgZmFsbHMgYmFjayB0byBiYXNlbmFtZSB3aGVuIG1hbmlmZXN0IGBuYW1lYCBpcyBtaXNzaW5nIG9yIGludmFsaWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtaXNzaW5nVXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9taXNzaW5nLW5hbWUnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL21pc3NpbmctbmFtZS9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHt9KSk7XG5cblx0XHRjb25zdCBibGFua1VyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvYmxhbmstbmFtZScpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvYmxhbmstbmFtZS9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJyAgICcgfSkpO1xuXG5cdFx0Y29uc3Qgbm9uU3RyaW5nVXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9ub24tc3RyaW5nLW5hbWUnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL25vbi1zdHJpbmctbmFtZS9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogNDIgfSkpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbbWlzc2luZ1VyaSwgYmxhbmtVcmksIG5vblN0cmluZ1VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnMubWFwKHAgPT4gcC5sYWJlbCkuc29ydCgpLFxuXHRcdFx0WydibGFuay1uYW1lJywgJ21pc3NpbmctbmFtZScsICdub24tc3RyaW5nLW5hbWUnXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgnT3BlbiBQbHVnaW4gZm9ybWF0IHRha2VzIHByaW9yaXR5IG92ZXIgQ2xhdWRlIGZvcm1hdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFBsdWdpbiBoYXMgYm90aCAucGx1Z2luL3BsdWdpbi5qc29uIGFuZCAuY2xhdWRlLXBsdWdpbi9wbHVnaW4uanNvbiBcdTIwMTRcblx0XHQvLyB0aGUgb3BlbiBwbHVnaW4gbWFuaWZlc3Qgc2hvdWxkIGJlIGRldGVjdGVkIGZpcnN0LlxuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvZHVhbC1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2R1YWwtcGx1Z2luLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdkdWFsLXBsdWdpbicgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvZHVhbC1wbHVnaW4vLmNsYXVkZS1wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdkdWFsLXBsdWdpbicgfSkpO1xuXG5cdFx0Ly8gV3JpdGUgaW5saW5lIE1DUCBpbnRvIHRoZSBvcGVuLXBsdWdpbiBtYW5pZmVzdCB0byB2ZXJpZnkgaXQncyB1c2VkLlxuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvZHVhbC1wbHVnaW4vLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdkdWFsLXBsdWdpbicsXG5cdFx0XHRtY3BTZXJ2ZXJzOiB7ICdvcGVuLXNlcnZlcic6IHsgY29tbWFuZDogJ2VjaG8nLCBhcmdzOiBbJ29wZW4nXSB9IH0sXG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xhdWRlIG1hbmlmZXN0IGRlZmluZXMgYSBkaWZmZXJlbnQgc2VydmVyIHRvIHByb3ZlIGl0J3MgTk9UIHJlYWQuXG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9kdWFsLXBsdWdpbi8uY2xhdWRlLXBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdkdWFsLXBsdWdpbicsXG5cdFx0XHRtY3BTZXJ2ZXJzOiB7ICdjbGF1ZGUtc2VydmVyJzogeyBjb21tYW5kOiAnZWNobycsIGFyZ3M6IFsnY2xhdWRlJ10gfSB9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLCBkZWZzID0+IGRlZnMubGVuZ3RoID4gMCk7XG5cdFx0Y29uc3QgbWNwRGVmcyA9IHBsdWdpbnNbMF0ubWNwU2VydmVyRGVmaW5pdGlvbnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1jcERlZnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWNwRGVmc1swXS5uYW1lLCAnb3Blbi1zZXJ2ZXInKTtcblx0fSkpO1xuXG5cdHRlc3QoJ0FnZW50IFBsdWdpbiByb290IHRha2VzIHByaW9yaXR5IGFuZCBleHBvc2VzIHBvcnRhYmxlIGFuZCBDb3BpbG90IGV4dGVuc2lvbiBjb21wb25lbnRzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9hZ2VudC1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2FnZW50LXBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdCRzY2hlbWE6IEFHRU5UX1BMVUdJTl9TQ0hFTUEsXG5cdFx0XHRuYW1lOiAnYWdlbnQtcGx1Z2luJyxcblx0XHRcdGV4dGVuc2lvbnM6IHsgJ2NvbS5naXRodWIuY29waWxvdCc6IHt9IH0sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvYWdlbnQtcGx1Z2luLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnbGVnYWN5Jyxcblx0XHRcdG1jcFNlcnZlcnM6IHsgbGVnYWN5OiB7IGNvbW1hbmQ6ICdub2RlJyB9IH0sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvYWdlbnQtcGx1Z2luL3NraWxscy9wb3J0YWJsZS9TS0lMTC5tZCcsICctLS1cXG5uYW1lOiBwb3J0YWJsZVxcbmRlc2NyaXB0aW9uOiBQb3J0YWJsZSBza2lsbFxcbi0tLScpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvYWdlbnQtcGx1Z2luL2NvbW1hbmRzL2lnbm9yZWQubWQnLCAnIyBJZ25vcmVkJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9hZ2VudC1wbHVnaW4vYWdlbnRzL2lnbm9yZWQubWQnLCAnIyBJZ25vcmVkJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9hZ2VudC1wbHVnaW4vY29tLmdpdGh1Yi5jb3BpbG90L2NvbW1hbmRzL3NoaXAubWQnLCAnIyBTaGlwJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9hZ2VudC1wbHVnaW4vY29tLmdpdGh1Yi5jb3BpbG90L2FnZW50cy9oZWxwZXIubWQnLCAnIyBIZWxwZXInKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2FnZW50LXBsdWdpbi9jb20uZ2l0aHViLmNvcGlsb3QvcnVsZXMvcHJvamVjdC5pbnN0cnVjdGlvbnMubWQnLCAnIyBQcm9qZWN0Jyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9hZ2VudC1wbHVnaW4vY29tLmdpdGh1Yi5jb3BpbG90L2hvb2tzL2hvb2tzLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRob29rczoge1xuXHRcdFx0XHRQb3N0VG9vbFVzZTogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBkb25lJyB9XSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvYWdlbnQtcGx1Z2luLy5tY3AuanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbWNwU2VydmVyczogeyBpZ25vcmVkOiB7IGNvbW1hbmQ6ICdub2RlJyB9IH0gfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvYWdlbnQtcGx1Z2luL21jcC5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0JHNjaGVtYTogQUdFTlRfUExVR0lOX01DUF9TQ0hFTUEsXG5cdFx0XHRtY3BTZXJ2ZXJzOiB7IHBvcnRhYmxlOiB7IHR5cGU6ICdzdHJlYW1hYmxlLWh0dHAnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL21jcCcgfSB9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2luID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KVswXTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR3YWl0Rm9yU3RhdGUocGx1Z2luLnNraWxscywgc2tpbGxzID0+IHNraWxscy5sZW5ndGggPiAwKSxcblx0XHRcdHdhaXRGb3JTdGF0ZShwbHVnaW4ubWNwU2VydmVyRGVmaW5pdGlvbnMsIGRlZmluaXRpb25zID0+IGRlZmluaXRpb25zLmxlbmd0aCA+IDApLFxuXHRcdFx0d2FpdEZvclN0YXRlKHBsdWdpbi5jb21tYW5kcywgY29tbWFuZHMgPT4gY29tbWFuZHMubGVuZ3RoID4gMCksXG5cdFx0XHR3YWl0Rm9yU3RhdGUocGx1Z2luLmFnZW50cywgYWdlbnRzID0+IGFnZW50cy5sZW5ndGggPiAwKSxcblx0XHRcdHdhaXRGb3JTdGF0ZShwbHVnaW4uaG9va3MsIGhvb2tzID0+IGhvb2tzLmxlbmd0aCA+IDApLFxuXHRcdFx0d2FpdEZvclN0YXRlKHBsdWdpbi5pbnN0cnVjdGlvbnMsIGluc3RydWN0aW9ucyA9PiBpbnN0cnVjdGlvbnMubGVuZ3RoID4gMCksXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsYWJlbDogcGx1Z2luLmxhYmVsLFxuXHRcdFx0c2tpbGxzOiBwbHVnaW4uc2tpbGxzLmdldCgpLm1hcChza2lsbCA9PiBza2lsbC5uYW1lKSxcblx0XHRcdG1jcDogcGx1Z2luLm1jcFNlcnZlckRlZmluaXRpb25zLmdldCgpLm1hcChzZXJ2ZXIgPT4gc2VydmVyLm5hbWUpLFxuXHRcdFx0Y29tbWFuZHM6IHBsdWdpbi5jb21tYW5kcy5nZXQoKS5tYXAoY29tbWFuZCA9PiBjb21tYW5kLm5hbWUpLFxuXHRcdFx0YWdlbnRzOiBwbHVnaW4uYWdlbnRzLmdldCgpLm1hcChhZ2VudCA9PiBhZ2VudC5uYW1lKSxcblx0XHRcdGhvb2tzOiBwbHVnaW4uaG9va3MuZ2V0KCkubWFwKGhvb2sgPT4gaG9vay50eXBlKSxcblx0XHRcdGluc3RydWN0aW9uczogcGx1Z2luLmluc3RydWN0aW9ucy5nZXQoKS5tYXAoaW5zdHJ1Y3Rpb24gPT4gaW5zdHJ1Y3Rpb24ubmFtZSksXG5cdFx0fSwge1xuXHRcdFx0bGFiZWw6ICdhZ2VudC1wbHVnaW4nLFxuXHRcdFx0c2tpbGxzOiBbJ3BvcnRhYmxlJ10sXG5cdFx0XHRtY3A6IFsncG9ydGFibGUnXSxcblx0XHRcdGNvbW1hbmRzOiBbJ3NoaXAnXSxcblx0XHRcdGFnZW50czogWydoZWxwZXInXSxcblx0XHRcdGhvb2tzOiBbJ1Bvc3RUb29sVXNlJ10sXG5cdFx0XHRpbnN0cnVjdGlvbnM6IFsncHJvamVjdCddLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncmVjb2duaXplZCBBZ2VudCBQbHVnaW4gd2l0aG91dCBhIG5hbWUgdXNlcyB0aGUgZGlyZWN0b3J5IGxhYmVsIHdpdGhvdXQgbGVnYWN5IGZhbGxiYWNrJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9yZWplY3RlZC1hZ2VudC1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3JlamVjdGVkLWFnZW50LXBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgJHNjaGVtYTogQUdFTlRfUExVR0lOX1NDSEVNQSB9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9yZWplY3RlZC1hZ2VudC1wbHVnaW4vLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ2xlZ2FjeScgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvcmVqZWN0ZWQtYWdlbnQtcGx1Z2luL2NvbW1hbmRzL2xlZ2FjeS5tZCcsICcjIExlZ2FjeScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW4gPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpWzBdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zm9ybWF0OiBwbHVnaW4uZm9ybWF0LFxuXHRcdFx0bGFiZWw6IHBsdWdpbi5sYWJlbCxcblx0XHRcdGNvbW1hbmRzOiBwbHVnaW4uY29tbWFuZHMuZ2V0KCksXG5cdFx0fSwge1xuXHRcdFx0Zm9ybWF0OiBQbHVnaW5Gb3JtYXQuQWdlbnRQbHVnaW4sXG5cdFx0XHRsYWJlbDogJ3JlamVjdGVkLWFnZW50LXBsdWdpbicsXG5cdFx0XHRjb21tYW5kczogW10sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdhZGRpbmcgYW4gQWdlbnQgUGx1Z2luIG1hbmlmZXN0IHJlLWRldGVjdHMgYW4gZXhpc3RpbmcgcGx1Z2luJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy91cGRhdGVkLXBsdWdpbicpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvdXBkYXRlZC1wbHVnaW4vLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ2xlZ2FjeScgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvdXBkYXRlZC1wbHVnaW4vY29tbWFuZHMvbGVnYWN5Lm1kJywgJyMgTGVnYWN5Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KVswXS5mb3JtYXQsIFBsdWdpbkZvcm1hdC5PcGVuUGx1Z2luKTtcblxuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvdXBkYXRlZC1wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7ICRzY2hlbWE6IEFHRU5UX1BMVUdJTl9TQ0hFTUEsIG5hbWU6ICd1cGRhdGVkJyB9KSk7XG5cdFx0Y29uc3QgcGx1Z2lucyA9IGF3YWl0IHdhaXRGb3JTdGF0ZShkaXNjb3ZlcnkucGx1Z2lucywgdmFsdWUgPT4gdmFsdWU/LlswXT8uZm9ybWF0ID09PSBQbHVnaW5Gb3JtYXQuQWdlbnRQbHVnaW4pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmb3JtYXQ6IHBsdWdpbnM/LlswXS5mb3JtYXQsXG5cdFx0XHRjb21tYW5kczogcGx1Z2lucz8uWzBdLmNvbW1hbmRzLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkFnZW50UGx1Z2luLFxuXHRcdFx0Y29tbWFuZHM6IFtdLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnT3BlbiBQbHVnaW4gcmVhZHMgTUNQIGRlZmluaXRpb25zIGZyb20gLnBsdWdpbi9wbHVnaW4uanNvbiBpbmxpbmUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL21jcC1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL21jcC1wbHVnaW4vLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdtY3AtcGx1Z2luJyxcblx0XHRcdG1jcFNlcnZlcnM6IHtcblx0XHRcdFx0J215LXNlcnZlcic6IHsgY29tbWFuZDogJ25vZGUnLCBhcmdzOiBbJ3NlcnZlci5qcyddIH0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLCBkZWZzID0+IGRlZnMubGVuZ3RoID4gMCk7XG5cdFx0Y29uc3QgbWNwRGVmcyA9IHBsdWdpbnNbMF0ubWNwU2VydmVyRGVmaW5pdGlvbnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtY3BEZWZzLm1hcChkID0+IGQubmFtZSksIFsnbXktc2VydmVyJ10pO1xuXHR9KSk7XG5cblx0dGVzdCgnT3BlbiBQbHVnaW4gcmVhZHMgTUNQIGRlZmluaXRpb25zIGZyb20gc3RhbmRhbG9uZSAubWNwLmpzb24nLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL21jcC1zdGFuZGFsb25lJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9tY3Atc3RhbmRhbG9uZS8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAnbWNwLXN0YW5kYWxvbmUnIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL21jcC1zdGFuZGFsb25lLy5tY3AuanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG1jcFNlcnZlcnM6IHtcblx0XHRcdFx0J3N0YW5kYWxvbmUtc2VydmVyJzogeyBjb21tYW5kOiAncHl0aG9uJywgYXJnczogWydzZXJ2ZS5weSddIH0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLCBkZWZzID0+IGRlZnMubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnNbMF0ubWNwU2VydmVyRGVmaW5pdGlvbnMuZ2V0KClbMF0ubmFtZSwgJ3N0YW5kYWxvbmUtc2VydmVyJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZWFkcyBza2lsbHMgZnJvbSBza2lsbHMvIHN1YmRpcmVjdG9yaWVzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9za2lsbHMtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9za2lsbHMtcGx1Z2luLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdza2lsbHMtcGx1Z2luJyB9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9za2lsbHMtcGx1Z2luL3NraWxscy9kZXBsb3kvU0tJTEwubWQnLCAnIyBEZXBsb3kgc2tpbGwnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3NraWxscy1wbHVnaW4vc2tpbGxzL2xpbnQvU0tJTEwubWQnLCAnIyBMaW50IHNraWxsJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5za2lsbHMsIHMgPT4gcy5sZW5ndGggPiAwKTtcblx0XHRjb25zdCBza2lsbE5hbWVzID0gcGx1Z2luc1swXS5za2lsbHMuZ2V0KCkubWFwKHMgPT4gcy5uYW1lKS5zb3J0KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChza2lsbE5hbWVzLCBbJ2RlcGxveScsICdsaW50J10pO1xuXHR9KSk7XG5cblx0dGVzdCgncmVhZHMgcm9vdC1sZXZlbCBTS0lMTC5tZCBhcyBhIGZhbGxiYWNrIHNraWxsJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9yb290LXNraWxsJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9yb290LXNraWxsLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdyb290LXNraWxsJyB9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9yb290LXNraWxsL1NLSUxMLm1kJywgJyMgVmlzdWFsIEV4cGxhaW5lcicpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uc2tpbGxzLCBzID0+IHMubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0uc2tpbGxzLmdldCgpLm1hcChzID0+IHMubmFtZSksXG5cdFx0XHRbJ3Jvb3Qtc2tpbGwnXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgncm9vdC1sZXZlbCBTS0lMTC5tZCBpcyBpZ25vcmVkIHdoZW4gc2tpbGxzLyBoYXMgY29udGVudCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvcm9vdC1za2lsbC1pZ25vcmVkJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9yb290LXNraWxsLWlnbm9yZWQvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ3Jvb3Qtc2tpbGwtaWdub3JlZCcgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvcm9vdC1za2lsbC1pZ25vcmVkL1NLSUxMLm1kJywgJyMgUm9vdCBza2lsbCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvcm9vdC1za2lsbC1pZ25vcmVkL3NraWxscy9yZWFsL1NLSUxMLm1kJywgJyMgUmVhbCBza2lsbCcpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uc2tpbGxzLCBzID0+IHMubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0uc2tpbGxzLmdldCgpLm1hcChzID0+IHMubmFtZSksXG5cdFx0XHRbJ3JlYWwnXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVhZHMgYWdlbnRzIGZyb20gYWdlbnRzLyBkaXJlY3RvcnknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL2FnZW50cy1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2FnZW50cy1wbHVnaW4vLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ2FnZW50cy1wbHVnaW4nIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2FnZW50cy1wbHVnaW4vYWdlbnRzL3Jldmlld2VyLm1kJywgJy0tLVxcbm5hbWU6IHJldmlld2VyXFxuLS0tXFxuWW91IHJldmlldyBjb2RlLicpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uYWdlbnRzLCBhID0+IGEubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnNbMF0uYWdlbnRzLmdldCgpWzBdLm5hbWUsICdyZXZpZXdlcicpO1xuXHR9KSk7XG5cblx0dGVzdCgnbWFuaWZlc3Qgc2tpbGxzIGZpZWxkIGFkZHMgc3VwcGxlbWVudGFsIHNraWxsIGRpcmVjdG9yaWVzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9jdXN0b20tc2tpbGxzJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jdXN0b20tc2tpbGxzLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnY3VzdG9tLXNraWxscycsXG5cdFx0XHRza2lsbHM6ICcuL2V4dHJhLXNraWxscy8nLFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2N1c3RvbS1za2lsbHMvc2tpbGxzL2RlZmF1bHQtc2tpbGwvU0tJTEwubWQnLCAnIyBEZWZhdWx0IHNraWxsJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jdXN0b20tc2tpbGxzL2V4dHJhLXNraWxscy9ib251cy1za2lsbC9TS0lMTC5tZCcsICcjIEJvbnVzIHNraWxsJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5za2lsbHMsIHMgPT4gcy5sZW5ndGggPj0gMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0uc2tpbGxzLmdldCgpLm1hcChzID0+IHMubmFtZSkuc29ydCgpLFxuXHRcdFx0Wydib251cy1za2lsbCcsICdkZWZhdWx0LXNraWxsJ10sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ21hbmlmZXN0IHNraWxscyBmaWVsZCB3aXRoIGV4Y2x1c2l2ZSBtb2RlIHNraXBzIGRlZmF1bHQgZGlyZWN0b3J5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9leGNsdXNpdmUtc2tpbGxzJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9leGNsdXNpdmUtc2tpbGxzLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnZXhjbHVzaXZlLXNraWxscycsXG5cdFx0XHRza2lsbHM6IHsgcGF0aHM6IFsnLi9vbmx5LWhlcmUvJ10sIGV4Y2x1c2l2ZTogdHJ1ZSB9LFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2V4Y2x1c2l2ZS1za2lsbHMvc2tpbGxzL2lnbm9yZWQvU0tJTEwubWQnLCAnIyBTaG91bGQgYmUgaWdub3JlZCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvZXhjbHVzaXZlLXNraWxscy9vbmx5LWhlcmUvdmlzaWJsZS9TS0lMTC5tZCcsICcjIFNob3VsZCBiZSB2aXNpYmxlJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5za2lsbHMsIHMgPT4gcy5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGx1Z2luc1swXS5za2lsbHMuZ2V0KCkubWFwKHMgPT4gcy5uYW1lKSxcblx0XHRcdFsndmlzaWJsZSddLFxuXHRcdCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdtYW5pZmVzdCBjb21tYW5kcyBmaWVsZCB3aXRoIHN0cmluZyBhcnJheSBzY2FucyBtdWx0aXBsZSBkaXJlY3RvcmllcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvbXVsdGktY29tbWFuZHMnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL211bHRpLWNvbW1hbmRzLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnbXVsdGktY29tbWFuZHMnLFxuXHRcdFx0Y29tbWFuZHM6IFsnLi9jbWQxLycsICcuL2NtZDIvJ10sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbXVsdGktY29tbWFuZHMvY29tbWFuZHMvZGVmYXVsdC5tZCcsICcjIERlZmF1bHQnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL211bHRpLWNvbW1hbmRzL2NtZDEvYWxwaGEubWQnLCAnIyBBbHBoYScpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbXVsdGktY29tbWFuZHMvY21kMi9iZXRhLm1kJywgJyMgQmV0YScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uY29tbWFuZHMsIGMgPT4gYy5sZW5ndGggPj0gMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0uY29tbWFuZHMuZ2V0KCkubWFwKGMgPT4gYy5uYW1lKS5zb3J0KCksXG5cdFx0XHRbJ2FscGhhJywgJ2JldGEnLCAnZGVmYXVsdCddLFxuXHRcdCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdtYW5pZmVzdCBhZ2VudHMgZmllbGQgYWRkcyBzdXBwbGVtZW50YWwgYWdlbnQgZGlyZWN0b3JpZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL2N1c3RvbS1hZ2VudHMnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2N1c3RvbS1hZ2VudHMvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdjdXN0b20tYWdlbnRzJyxcblx0XHRcdGFnZW50czogJy4vZXh0cmEtYWdlbnRzLycsXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvY3VzdG9tLWFnZW50cy9hZ2VudHMvZGVmYXVsdC1hZ2VudC5tZCcsICcjIERlZmF1bHQnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2N1c3RvbS1hZ2VudHMvZXh0cmEtYWdlbnRzL2JvbnVzLWFnZW50Lm1kJywgJyMgQm9udXMnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLmFnZW50cywgYSA9PiBhLmxlbmd0aCA+PSAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGx1Z2luc1swXS5hZ2VudHMuZ2V0KCkubWFwKGEgPT4gYS5uYW1lKS5zb3J0KCksXG5cdFx0XHRbJ2JvbnVzLWFnZW50JywgJ2RlZmF1bHQtYWdlbnQnXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgncGF0aCB0cmF2ZXJzYWwgaW4gbWFuaWZlc3QgaXMgcmVqZWN0ZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL3RyYXZlcnNhbCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvdHJhdmVyc2FsLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAndHJhdmVyc2FsJyxcblx0XHRcdHNraWxsczogJy4uL291dHNpZGUvJyxcblx0XHR9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9vdXRzaWRlL2V2aWwvU0tJTEwubWQnLCAnIyBFdmlsIHNraWxsJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHQvLyBPbmx5IGRlZmF1bHQgc2tpbGxzLyBkaXJlY3Rvcnkgc2hvdWxkIGJlIHNjYW5uZWQ7IHRoZSB0cmF2ZXJzYWwgcGF0aCBpcyByZWplY3RlZC5cblx0XHQvLyBTaW5jZSB0aGVyZSBhcmUgbm8gc2tpbGxzIGluIHNraWxscy8sIHJlc3VsdCBzaG91bGQgYmUgZW1wdHkuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uc2tpbGxzLCAoKSA9PiB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBsdWdpbnNbMF0uc2tpbGxzLmdldCgpLCBbXSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkdXBsaWNhdGUgbmFtZXMgYWNyb3NzIGRpcmVjdG9yaWVzIGRlZHVwbGljYXRlIChmaXJzdCB3aW5zKScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvZGVkdXAnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2RlZHVwLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnZGVkdXAnLFxuXHRcdFx0Y29tbWFuZHM6ICcuL2V4dHJhLWNvbW1hbmRzLycsXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvZGVkdXAvY29tbWFuZHMvc2hhcmVkLm1kJywgJyMgRGVmYXVsdCB2ZXJzaW9uJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9kZWR1cC9leHRyYS1jb21tYW5kcy9zaGFyZWQubWQnLCAnIyBDdXN0b20gdmVyc2lvbicpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uY29tbWFuZHMsIGMgPT4gYy5sZW5ndGggPiAwKTtcblx0XHRjb25zdCBjbWRzID0gcGx1Z2luc1swXS5jb21tYW5kcy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY21kcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbWRzWzBdLm5hbWUsICdzaGFyZWQnKTtcblx0XHQvLyBUaGUgZGVmYXVsdCBkaXJlY3RvcnkgaXMgc2Nhbm5lZCBmaXJzdCwgc28gdGhlIFVSSSBzaG91bGQgY29tZSBmcm9tIGNvbW1hbmRzL1xuXHRcdGFzc2VydC5vayhjbWRzWzBdLnVyaS5wYXRoLmluY2x1ZGVzKCcvY29tbWFuZHMvc2hhcmVkLm1kJykpO1xuXHR9KSk7XG5cblx0dGVzdCgnZGlzY292ZXJzIGNvbXBvbmVudHMgd2l0aG91dCBhIG1hbmlmZXN0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9uby1tYW5pZmVzdCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbm8tbWFuaWZlc3QvY29tbWFuZHMvaGVsbG8ubWQnLCAnIyBIZWxsbycpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbm8tbWFuaWZlc3Qvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJywgJyMgTXkgc2tpbGwnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL25vLW1hbmlmZXN0L2FnZW50cy9oZWxwZXIubWQnLCAnIyBIZWxwZXInKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL25vLW1hbmlmZXN0L3J1bGVzL3ByZWZlci1jb25zdC5tZGMnLCAnLS0tXFxuZGVzY3JpcHRpb246IFByZWZlciBjb25zdFxcbi0tLVxcblVzZSBjb25zdC4nKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luc1swXS5sYWJlbCwgJ25vLW1hbmlmZXN0Jyk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5jb21tYW5kcywgYyA9PiBjLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLmNvbW1hbmRzLmdldCgpWzBdLm5hbWUsICdoZWxsbycpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uc2tpbGxzLCBzID0+IHMubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnNbMF0uc2tpbGxzLmdldCgpWzBdLm5hbWUsICdteS1za2lsbCcpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uYWdlbnRzLCBhID0+IGEubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnNbMF0uYWdlbnRzLmdldCgpWzBdLm5hbWUsICdoZWxwZXInKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLmluc3RydWN0aW9ucywgaSA9PiBpLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLmluc3RydWN0aW9ucy5nZXQoKVswXS5uYW1lLCAncHJlZmVyLWNvbnN0Jyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZWFkcyBob29rcyBmcm9tIGRlZmF1bHQgaG9va3MvaG9va3MuanNvbicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvaG9va3MtZGVmYXVsdCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvaG9va3MtZGVmYXVsdC8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAnaG9va3MtZGVmYXVsdCcgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvaG9va3MtZGVmYXVsdC9ob29rcy9ob29rcy5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0aG9va3M6IHtcblx0XHRcdFx0UG9zdFRvb2xVc2U6IFt7IG1hdGNoZXI6ICdXcml0ZScsIGhvb2tzOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIGRvbmUnIH1dIH1dLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uaG9va3MsIGggPT4gaC5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luc1swXS5ob29rcy5nZXQoKS5sZW5ndGgsIDEpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVhZHMgaW5saW5lIGhvb2tzIGZyb20gbWFuaWZlc3QnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL2hvb2tzLWlubGluZScpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvaG9va3MtaW5saW5lLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnaG9va3MtaW5saW5lJyxcblx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0U2Vzc2lvblN0YXJ0OiBbeyBob29rczogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBzdGFydCcgfV0gfV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5ob29rcywgaCA9PiBoLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLmhvb2tzLmdldCgpLmxlbmd0aCwgMSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZWFkcyBob29rcyBmcm9tIGN1c3RvbSBwYXRoIGluIG1hbmlmZXN0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9ob29rcy1jdXN0b20nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2hvb2tzLWN1c3RvbS8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ2hvb2tzLWN1c3RvbScsXG5cdFx0XHRob29rczogJy4vY29uZmlnL215LWhvb2tzLmpzb24nLFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2hvb2tzLWN1c3RvbS9jb25maWcvbXktaG9va3MuanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFBvc3RUb29sVXNlOiBbeyBtYXRjaGVyOiAnRWRpdCcsIGhvb2tzOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIGVkaXRlZCcgfV0gfV0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5ob29rcywgaCA9PiBoLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLmhvb2tzLmdldCgpLmxlbmd0aCwgMSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZWFkcyBNQ1AgZnJvbSBjdXN0b20gcGF0aCBpbiBtYW5pZmVzdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvbWNwLWN1c3RvbScpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbWNwLWN1c3RvbS8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ21jcC1jdXN0b20nLFxuXHRcdFx0bWNwU2VydmVyczogJy4vY29uZmlnL3NlcnZlcnMuanNvbicsXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbWNwLWN1c3RvbS9jb25maWcvc2VydmVycy5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bWNwU2VydmVyczoge1xuXHRcdFx0XHQnY3VzdG9tLXNlcnZlcic6IHsgY29tbWFuZDogJ25vZGUnLCBhcmdzOiBbJ2N1c3RvbS5qcyddIH0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5tY3BTZXJ2ZXJEZWZpbml0aW9ucywgZCA9PiBkLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLmdldCgpWzBdLm5hbWUsICdjdXN0b20tc2VydmVyJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdpbmxpbmUgTUNQIGluIG1hbmlmZXN0IHRha2VzIHByaW9yaXR5IG92ZXIgc3RhbmRhbG9uZSAubWNwLmpzb24nLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL21jcC1tZXJnZWQnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL21jcC1tZXJnZWQvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdtY3AtbWVyZ2VkJyxcblx0XHRcdG1jcFNlcnZlcnM6IHtcblx0XHRcdFx0J2lubGluZS1zZXJ2ZXInOiB7IGNvbW1hbmQ6ICdlY2hvJywgYXJnczogWydpbmxpbmUnXSB9LFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9tY3AtbWVyZ2VkLy5tY3AuanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG1jcFNlcnZlcnM6IHtcblx0XHRcdFx0J2ZpbGUtc2VydmVyJzogeyBjb21tYW5kOiAnZWNobycsIGFyZ3M6IFsnZmlsZSddIH0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIFdoZW4gaW5saW5lIG1jcFNlcnZlcnMgaXMgYW4gb2JqZWN0IGluIHRoZSBtYW5pZmVzdCwgaXQgaXMgdHJlYXRlZCBhc1xuXHRcdC8vIGVtYmVkZGVkIGNvbmZpZ3VyYXRpb24gYW5kIHRoZSBkZWZhdWx0IC5tY3AuanNvbiBmaWxlIGlzIG5vdCByZWFkLlxuXHRcdC8vIFdhaXQgZm9yIHRoZSBpbmxpbmUgc2VydmVyIHRvIGFwcGVhciAobWFuaWZlc3QgbG9hZHMgYXN5bmNocm9ub3VzbHkpLlxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLCBkID0+XG5cdFx0XHRbLi4uZF0uc29tZShzID0+IHMubmFtZSA9PT0gJ2lubGluZS1zZXJ2ZXInKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0ubWNwU2VydmVyRGVmaW5pdGlvbnMuZ2V0KCkubWFwKGQgPT4gZC5uYW1lKSxcblx0XHRcdFsnaW5saW5lLXNlcnZlciddLFxuXHRcdCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdQTFVHSU5fUk9PVCBleHBhbnNpb24gaW4gaG9vayBjb21tYW5kcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvcm9vdC1leHBhbnNpb24nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3Jvb3QtZXhwYW5zaW9uLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAncm9vdC1leHBhbnNpb24nLFxuXHRcdFx0aG9va3M6IHtcblx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRQb3N0VG9vbFVzZTogW3tcblx0XHRcdFx0XHRcdGhvb2tzOiBbe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6ICcke1BMVUdJTl9ST09UfS9zY3JpcHRzL2Zvcm1hdC5zaCcsXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLmhvb2tzLCBoID0+IGgubGVuZ3RoID4gMCk7XG5cblx0XHRjb25zdCBob29rQ29tbWFuZHMgPSBwbHVnaW5zWzBdLmhvb2tzLmdldCgpWzBdLmhvb2tzO1xuXHRcdGFzc2VydC5vayhob29rQ29tbWFuZHMubGVuZ3RoID4gMCk7XG5cdFx0Ly8gJHtQTFVHSU5fUk9PVH0gc2hvdWxkIGJlIGV4cGFuZGVkIHRvIHRoZSBwbHVnaW4ncyBmc1BhdGhcblx0XHRjb25zdCBjb21tYW5kID0gaG9va0NvbW1hbmRzWzBdLmNvbW1hbmQ7XG5cdFx0YXNzZXJ0Lm9rKGNvbW1hbmQgJiYgIWNvbW1hbmQuaW5jbHVkZXMoJyR7UExVR0lOX1JPT1R9JyksIGBFeHBlY3RlZCBQTFVHSU5fUk9PVCB0byBiZSBleHBhbmRlZCwgZ290OiAke2NvbW1hbmR9YCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdtYW5pZmVzdCBjb21tYW5kcyBmaWVsZCBwb2ludGluZyB0byBhIHNwZWNpZmljIGZpbGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL2NtZC1maWxlJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jbWQtZmlsZS8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ2NtZC1maWxlJyxcblx0XHRcdGNvbW1hbmRzOiAnLi9zcGVjaWFsL2RlcGxveS5tZCcsXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvY21kLWZpbGUvY29tbWFuZHMvZGVmYXVsdC5tZCcsICcjIERlZmF1bHQnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2NtZC1maWxlL3NwZWNpYWwvZGVwbG95Lm1kJywgJyMgRGVwbG95Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5jb21tYW5kcywgYyA9PiBjLmxlbmd0aCA+PSAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGx1Z2luc1swXS5jb21tYW5kcy5nZXQoKS5tYXAoYyA9PiBjLm5hbWUpLnNvcnQoKSxcblx0XHRcdFsnZGVmYXVsdCcsICdkZXBsb3knXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgnbWFuaWZlc3QgY29tbWFuZHMgZmllbGQgd2l0aCBhcnJheSBvZiBzcGVjaWZpYyBmaWxlcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvY21kLWZpbGVzJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jbWQtZmlsZXMvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdjbWQtZmlsZXMnLFxuXHRcdFx0Y29tbWFuZHM6IFsnLi9leHRyYXMvYWxwaGEubWQnLCAnLi9leHRyYXMvYmV0YS5tZCddLFxuXHRcdH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2NtZC1maWxlcy9leHRyYXMvYWxwaGEubWQnLCAnIyBBbHBoYScpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvY21kLWZpbGVzL2V4dHJhcy9iZXRhLm1kJywgJyMgQmV0YScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0uY29tbWFuZHMsIGMgPT4gYy5sZW5ndGggPj0gMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0uY29tbWFuZHMuZ2V0KCkubWFwKGMgPT4gYy5uYW1lKS5zb3J0KCksXG5cdFx0XHRbJ2FscGhhJywgJ2JldGEnXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgnbWFuaWZlc3QgYWdlbnRzIGZpZWxkIHBvaW50aW5nIHRvIGEgc3BlY2lmaWMgZmlsZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvYWdlbnQtZmlsZScpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvYWdlbnQtZmlsZS8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ2FnZW50LWZpbGUnLFxuXHRcdFx0YWdlbnRzOiAnLi9jdXN0b20vc3BlY2lhbGlzdC5tZCcsXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvYWdlbnQtZmlsZS9hZ2VudHMvZGVmYXVsdC5tZCcsICcjIERlZmF1bHQnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2FnZW50LWZpbGUvY3VzdG9tL3NwZWNpYWxpc3QubWQnLCAnIyBTcGVjaWFsaXN0Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5hZ2VudHMsIGEgPT4gYS5sZW5ndGggPj0gMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0uYWdlbnRzLmdldCgpLm1hcChhID0+IGEubmFtZSkuc29ydCgpLFxuXHRcdFx0WydkZWZhdWx0JywgJ3NwZWNpYWxpc3QnXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgnbWFuaWZlc3Qgc2tpbGxzIGZpZWxkIHBvaW50aW5nIHRvIGEgc3BlY2lmaWMgc2tpbGwgZGlyZWN0b3J5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9za2lsbC1kaXInKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3NraWxsLWRpci8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ3NraWxsLWRpcicsXG5cdFx0XHRza2lsbHM6ICcuL2N1c3RvbS9teS1za2lsbCcsXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvc2tpbGwtZGlyL2N1c3RvbS9teS1za2lsbC9TS0lMTC5tZCcsICcjIE15IFNraWxsJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5za2lsbHMsIHMgPT4gcy5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGx1Z2luc1swXS5za2lsbHMuZ2V0KCkubWFwKHMgPT4gcy5uYW1lKSxcblx0XHRcdFsnbXktc2tpbGwnXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgnbWFuaWZlc3QgaG9va3MgZmllbGQgcG9pbnRpbmcgdG8gYSBzcGVjaWZpYyBmaWxlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9ob29rLWZpbGUnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2hvb2stZmlsZS8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ2hvb2stZmlsZScsXG5cdFx0XHRob29rczogJy4vY29uZmlnL2N1c3RvbS1ob29rcy5qc29uJyxcblx0XHR9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9ob29rLWZpbGUvY29uZmlnL2N1c3RvbS1ob29rcy5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0aG9va3M6IHtcblx0XHRcdFx0U2Vzc2lvblN0YXJ0OiBbeyBob29rczogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBoaScgfV0gfV0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5ob29rcywgaCA9PiBoLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLmhvb2tzLmdldCgpLmxlbmd0aCwgMSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdtYW5pZmVzdCBtY3BTZXJ2ZXJzIGZpZWxkIHBvaW50aW5nIHRvIGEgc3BlY2lmaWMgZmlsZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvbWNwLWZpbGUnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL21jcC1maWxlLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRuYW1lOiAnbWNwLWZpbGUnLFxuXHRcdFx0bWNwU2VydmVyczogJy4vY29uZmlnL3NlcnZlcnMuanNvbicsXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbWNwLWZpbGUvY29uZmlnL3NlcnZlcnMuanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG1jcFNlcnZlcnM6IHtcblx0XHRcdFx0J2N1c3RvbS1zZXJ2ZXInOiB7IGNvbW1hbmQ6ICdub2RlJywgYXJnczogWydzZXJ2ZS5qcyddIH0sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5tY3BTZXJ2ZXJEZWZpbml0aW9ucywgZCA9PiBkLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLmdldCgpWzBdLm5hbWUsICdjdXN0b20tc2VydmVyJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZWFkcyBydWxlcyBmcm9tIHJ1bGVzLyBkaXJlY3Rvcnkgd2l0aCAubWRjIGV4dGVuc2lvbicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvcnVsZXMtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9ydWxlcy1wbHVnaW4vLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ3J1bGVzLXBsdWdpbicgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvcnVsZXMtcGx1Z2luL3J1bGVzL3ByZWZlci1jb25zdC5tZGMnLCAnLS0tXFxuZGVzY3JpcHRpb246IFByZWZlciBjb25zdFxcbi0tLVxcblVzZSBjb25zdC4nKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3J1bGVzLXBsdWdpbi9ydWxlcy9lcnJvci1oYW5kbGluZy5tZGMnLCAnLS0tXFxuZGVzY3JpcHRpb246IEVycm9yIGhhbmRsaW5nXFxuLS0tXFxuQWx3YXlzIGhhbmRsZSBlcnJvcnMuJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5pbnN0cnVjdGlvbnMsIGkgPT4gaS5sZW5ndGggPj0gMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0uaW5zdHJ1Y3Rpb25zLmdldCgpLm1hcChpID0+IGkubmFtZSkuc29ydCgpLFxuXHRcdFx0WydlcnJvci1oYW5kbGluZycsICdwcmVmZXItY29uc3QnXSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgncmVhZHMgcnVsZXMgd2l0aCAubWQgYW5kIC5pbnN0cnVjdGlvbnMubWQgZXh0ZW5zaW9ucycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHBsdWdpblVyaSgnL3BsdWdpbnMvcnVsZXMtbWl4ZWQnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3J1bGVzLW1peGVkLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdydWxlcy1taXhlZCcgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvcnVsZXMtbWl4ZWQvcnVsZXMvcnVsZS1hLm1kYycsICdSdWxlIEEnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3J1bGVzLW1peGVkL3J1bGVzL3J1bGUtYi5tZCcsICdSdWxlIEInKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3J1bGVzLW1peGVkL3J1bGVzL3J1bGUtYy5pbnN0cnVjdGlvbnMubWQnLCAnUnVsZSBDJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5pbnN0cnVjdGlvbnMsIGkgPT4gaS5sZW5ndGggPj0gMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0uaW5zdHJ1Y3Rpb25zLmdldCgpLm1hcChpID0+IGkubmFtZSkuc29ydCgpLFxuXHRcdFx0WydydWxlLWEnLCAncnVsZS1iJywgJ3J1bGUtYyddLFxuXHRcdCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdtYW5pZmVzdCBydWxlcyBmaWVsZCBhZGRzIHN1cHBsZW1lbnRhbCBydWxlIGRpcmVjdG9yaWVzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9jdXN0b20tcnVsZXMnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2N1c3RvbS1ydWxlcy8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ2N1c3RvbS1ydWxlcycsXG5cdFx0XHRydWxlczogJy4vZXh0cmEtcnVsZXMvJyxcblx0XHR9KSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jdXN0b20tcnVsZXMvcnVsZXMvZGVmYXVsdC1ydWxlLm1kYycsICdEZWZhdWx0IHJ1bGUnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2N1c3RvbS1ydWxlcy9leHRyYS1ydWxlcy9ib251cy1ydWxlLm1kYycsICdCb251cyBydWxlJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5pbnN0cnVjdGlvbnMsIGkgPT4gaS5sZW5ndGggPj0gMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBsdWdpbnNbMF0uaW5zdHJ1Y3Rpb25zLmdldCgpLm1hcChpID0+IGkubmFtZSkuc29ydCgpLFxuXHRcdFx0Wydib251cy1ydWxlJywgJ2RlZmF1bHQtcnVsZSddLFxuXHRcdCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdtYW5pZmVzdCBydWxlcyBmaWVsZCB3aXRoIGV4Y2x1c2l2ZSBtb2RlIHNraXBzIGRlZmF1bHQgZGlyZWN0b3J5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9leGNsdXNpdmUtcnVsZXMnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2V4Y2x1c2l2ZS1ydWxlcy8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ2V4Y2x1c2l2ZS1ydWxlcycsXG5cdFx0XHRydWxlczogeyBwYXRoczogWycuL29ubHktaGVyZS8nXSwgZXhjbHVzaXZlOiB0cnVlIH0sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvZXhjbHVzaXZlLXJ1bGVzL3J1bGVzL2lnbm9yZWQubWRjJywgJ1Nob3VsZCBiZSBpZ25vcmVkJyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9leGNsdXNpdmUtcnVsZXMvb25seS1oZXJlL3Zpc2libGUubWRjJywgJ1Nob3VsZCBiZSB2aXNpYmxlJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5pbnN0cnVjdGlvbnMsIGkgPT4gaS5sZW5ndGggPT09IDEgJiYgaVswXS5uYW1lID09PSAndmlzaWJsZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwbHVnaW5zWzBdLmluc3RydWN0aW9ucy5nZXQoKS5tYXAoaSA9PiBpLm5hbWUpLFxuXHRcdFx0Wyd2aXNpYmxlJ10sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3J1bGUgbmFtZSBzdHJpcHMgbG9uZ2VzdCBtYXRjaGluZyBzdWZmaXggZmlyc3QnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBwbHVnaW5VcmkoJy9wbHVnaW5zL3N1ZmZpeC1ydWxlcycpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvc3VmZml4LXJ1bGVzLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdzdWZmaXgtcnVsZXMnIH0pKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL3N1ZmZpeC1ydWxlcy9ydWxlcy9jb2Rpbmctc3RhbmRhcmRzLmluc3RydWN0aW9ucy5tZCcsICdTdGFuZGFyZHMnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGNyZWF0ZURpc2NvdmVyeSgpO1xuXHRcdGRpc2NvdmVyeS5zdGFydChtb2NrRW5hYmxlbWVudE1vZGVsKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2V0U291cmNlc0FuZFJlZnJlc2goW3VyaV0pO1xuXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGdldERpc2NvdmVyZWRQbHVnaW5zKGRpc2NvdmVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbnMubGVuZ3RoLCAxKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShwbHVnaW5zWzBdLmluc3RydWN0aW9ucywgaSA9PiBpLmxlbmd0aCA+IDApO1xuXHRcdC8vIFNob3VsZCBzdHJpcCAnLmluc3RydWN0aW9ucy5tZCcgKGxvbmdlc3QgbWF0Y2gpLCBub3QganVzdCAnLm1kJ1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zWzBdLmluc3RydWN0aW9ucy5nZXQoKVswXS5uYW1lLCAnY29kaW5nLXN0YW5kYXJkcycpO1xuXHR9KSk7XG5cblx0dGVzdCgnZGVkdXBsaWNhdGVzIHJ1bGVzIHdpdGggdGhlIHNhbWUgYmFzZSBuYW1lJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9kdXAtcnVsZXMnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2R1cC1ydWxlcy8ucGx1Z2luL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogJ2R1cC1ydWxlcycsXG5cdFx0XHRydWxlczogJy4vZXh0cmEvJyxcblx0XHR9KSk7XG5cdFx0Ly8gRGVmYXVsdCBkaXJlY3RvcnkgaGFzICdteS1ydWxlLm1kYycsIHN1cHBsZW1lbnRhbCBoYXMgJ215LXJ1bGUubWQnIFx1MjAxNCBmaXJzdCB3aW5zXG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9kdXAtcnVsZXMvcnVsZXMvbXktcnVsZS5tZGMnLCAnRnJvbSBkZWZhdWx0Jyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9kdXAtcnVsZXMvZXh0cmEvbXktcnVsZS5tZCcsICdGcm9tIGV4dHJhJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBjcmVhdGVEaXNjb3ZlcnkoKTtcblx0XHRkaXNjb3Zlcnkuc3RhcnQobW9ja0VuYWJsZW1lbnRNb2RlbCk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNldFNvdXJjZXNBbmRSZWZyZXNoKFt1cmldKTtcblxuXHRcdGNvbnN0IHBsdWdpbnMgPSBnZXREaXNjb3ZlcmVkUGx1Z2lucyhkaXNjb3ZlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW5zLmxlbmd0aCwgMSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUocGx1Z2luc1swXS5pbnN0cnVjdGlvbnMsIGkgPT4gaS5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luc1swXS5pbnN0cnVjdGlvbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBpbnN0cnVjdGlvbiA9IHBsdWdpbnNbMF0uaW5zdHJ1Y3Rpb25zLmdldCgpWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0cnVjdGlvbi5uYW1lLCAnbXktcnVsZScpO1xuXHRcdGFzc2VydC5vayhpbnN0cnVjdGlvbi51cmkucGF0aC5lbmRzV2l0aCgnL3J1bGVzL215LXJ1bGUubWRjJykpO1xuXHR9KSk7XG5cblx0dGVzdCgnUExVR0lOX1JPT1QgZXhwYW5zaW9uIGluIGlubGluZSBNQ1Agc2VydmVyIGRlZmluaXRpb25zJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9tY3Atcm9vdCcpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvbWNwLXJvb3QvLnBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG5hbWU6ICdtY3Atcm9vdCcsXG5cdFx0XHRtY3BTZXJ2ZXJzOiB7XG5cdFx0XHRcdCdteS1zZXJ2ZXInOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJyR7UExVR0lOX1JPT1R9L2Jpbi9zZXJ2ZXInLFxuXHRcdFx0XHRcdGFyZ3M6IFsnLS1jb25maWcnLCAnJHtQTFVHSU5fUk9PVH0vY29uZmlnLmpzb24nXSxcblx0XHRcdFx0XHRjd2Q6ICcke1BMVUdJTl9ST09UfScsXG5cdFx0XHRcdFx0ZW52OiB7ICdDT05GSUdfRElSJzogJyR7UExVR0lOX1JPT1R9L2V0YycgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0ubWNwU2VydmVyRGVmaW5pdGlvbnMsIGQgPT4gZC5sZW5ndGggPiAwKTtcblx0XHRjb25zdCBzZXJ2ZXIgPSBwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLmdldCgpWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXIubmFtZSwgJ215LXNlcnZlcicpO1xuXHRcdGNvbnN0IGNvbmZpZzogYW55ID0gc2VydmVyLmNvbmZpZ3VyYXRpb247XG5cdFx0YXNzZXJ0Lm9rKCFjb25maWcuY29tbWFuZC5pbmNsdWRlcygnJHtQTFVHSU5fUk9PVH0nKSwgYEV4cGVjdGVkIFBMVUdJTl9ST09UIHRvIGJlIGV4cGFuZGVkIGluIGNvbW1hbmQsIGdvdDogJHtjb25maWcuY29tbWFuZH1gKTtcblx0XHRhc3NlcnQub2soIWNvbmZpZy5hcmdzWzFdLmluY2x1ZGVzKCcke1BMVUdJTl9ST09UfScpLCBgRXhwZWN0ZWQgUExVR0lOX1JPT1QgdG8gYmUgZXhwYW5kZWQgaW4gYXJncywgZ290OiAke2NvbmZpZy5hcmdzWzFdfWApO1xuXHRcdGFzc2VydC5vayghY29uZmlnLmN3ZC5pbmNsdWRlcygnJHtQTFVHSU5fUk9PVH0nKSwgYEV4cGVjdGVkIFBMVUdJTl9ST09UIHRvIGJlIGV4cGFuZGVkIGluIGN3ZCwgZ290OiAke2NvbmZpZy5jd2R9YCk7XG5cdFx0YXNzZXJ0Lm9rKCFjb25maWcuZW52WydDT05GSUdfRElSJ10uaW5jbHVkZXMoJyR7UExVR0lOX1JPT1R9JyksIGBFeHBlY3RlZCBQTFVHSU5fUk9PVCB0byBiZSBleHBhbmRlZCBpbiBlbnYsIGdvdDogJHtjb25maWcuZW52WydDT05GSUdfRElSJ119YCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5lbnZbJ1BMVUdJTl9ST09UJ10sIHVyaS5mc1BhdGgsICdFeHBlY3RlZCBQTFVHSU5fUk9PVCBlbnYgdmFyIHRvIGJlIHNldCcpO1xuXHR9KSk7XG5cblx0dGVzdCgnQ0xBVURFX1BMVUdJTl9ST09UIGV4cGFuc2lvbiBpbiBNQ1Agc2VydmVyIGRlZmluaXRpb25zIGZyb20gLm1jcC5qc29uJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9jbGF1ZGUtbWNwLXJvb3QnKTtcblx0XHRhd2FpdCB3cml0ZUZpbGUoJy9wbHVnaW5zL2NsYXVkZS1tY3Atcm9vdC8uY2xhdWRlLXBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ2NsYXVkZS1tY3Atcm9vdCcgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvY2xhdWRlLW1jcC1yb290Ly5tY3AuanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdG1jcFNlcnZlcnM6IHtcblx0XHRcdFx0J2NsYXVkZS1zZXJ2ZXInOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJyR7Q0xBVURFX1BMVUdJTl9ST09UfS9ydW4uc2gnLFxuXHRcdFx0XHRcdGFyZ3M6IFsnLS1kaXInLCAnJHtDTEFVREVfUExVR0lOX1JPT1R9L2RhdGEnXSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0ubWNwU2VydmVyRGVmaW5pdGlvbnMsIGQgPT4gZC5sZW5ndGggPiAwKTtcblx0XHRjb25zdCBzZXJ2ZXIgPSBwbHVnaW5zWzBdLm1jcFNlcnZlckRlZmluaXRpb25zLmdldCgpWzBdO1xuXHRcdGNvbnN0IGNvbmZpZzogYW55ID0gc2VydmVyLmNvbmZpZ3VyYXRpb247XG5cdFx0YXNzZXJ0Lm9rKCFjb25maWcuY29tbWFuZC5pbmNsdWRlcygnJHtDTEFVREVfUExVR0lOX1JPT1R9JyksIGBFeHBlY3RlZCBDTEFVREVfUExVR0lOX1JPT1QgdG8gYmUgZXhwYW5kZWQgaW4gY29tbWFuZCwgZ290OiAke2NvbmZpZy5jb21tYW5kfWApO1xuXHRcdGFzc2VydC5vayghY29uZmlnLmFyZ3NbMV0uaW5jbHVkZXMoJyR7Q0xBVURFX1BMVUdJTl9ST09UfScpLCBgRXhwZWN0ZWQgQ0xBVURFX1BMVUdJTl9ST09UIHRvIGJlIGV4cGFuZGVkIGluIGFyZ3MsIGdvdDogJHtjb25maWcuYXJnc1sxXX1gKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmVudlsnQ0xBVURFX1BMVUdJTl9ST09UJ10sIHVyaS5mc1BhdGgsICdFeHBlY3RlZCBDTEFVREVfUExVR0lOX1JPT1QgZW52IHZhciB0byBiZSBzZXQnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ0NvcGlsb3QgUGx1Z2luIE1DUCBzZXJ2ZXJzIGV4cGFuZCByb290IGFsaWFzZXMgYW5kIGRlZmF1bHQgY3dkIHRvIHBsdWdpbiByb290JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gcGx1Z2luVXJpKCcvcGx1Z2lucy9jb3BpbG90LW1jcC1yb290Jyk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKCcvcGx1Z2lucy9jb3BpbG90LW1jcC1yb290L3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAnY29waWxvdC1tY3Atcm9vdCcgfSkpO1xuXHRcdGF3YWl0IHdyaXRlRmlsZSgnL3BsdWdpbnMvY29waWxvdC1tY3Atcm9vdC8ubWNwLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRtY3BTZXJ2ZXJzOiB7XG5cdFx0XHRcdCdjb3BpbG90LXNlcnZlcic6IHtcblx0XHRcdFx0XHRjb21tYW5kOiAnJHtQTFVHSU5fUk9PVH0vYmluL3NlcnZlcicsXG5cdFx0XHRcdFx0YXJnczogWyctLWRhdGEnLCAnJHtDTEFVREVfUExVR0lOX1JPT1R9L2RhdGEnXSxcblx0XHRcdFx0XHRlbnY6IHsgQ09ORklHX0RJUjogJyR7UExVR0lOX1JPT1R9L2V0YycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2V4cGxpY2l0LWN3ZC1zZXJ2ZXInOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJ25vZGUnLFxuXHRcdFx0XHRcdGN3ZDogJy9jdXN0b20vY3dkJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gY3JlYXRlRGlzY292ZXJ5KCk7XG5cdFx0ZGlzY292ZXJ5LnN0YXJ0KG1vY2tFbmFibGVtZW50TW9kZWwpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zZXRTb3VyY2VzQW5kUmVmcmVzaChbdXJpXSk7XG5cblx0XHRjb25zdCBwbHVnaW5zID0gZ2V0RGlzY292ZXJlZFBsdWdpbnMoZGlzY292ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2lucy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHBsdWdpbnNbMF0ubWNwU2VydmVyRGVmaW5pdGlvbnMsIGQgPT4gZC5sZW5ndGggPT09IDIpO1xuXHRcdGNvbnN0IHNlcnZlcnMgPSBuZXcgTWFwKHBsdWdpbnNbMF0ubWNwU2VydmVyRGVmaW5pdGlvbnMuZ2V0KCkubWFwKHNlcnZlciA9PiBbc2VydmVyLm5hbWUsIHNlcnZlci5jb25maWd1cmF0aW9uXSkpO1xuXHRcdGNvbnN0IGRlZmF1bHRDd2RDb25maWcgPSBzZXJ2ZXJzLmdldCgnY29waWxvdC1zZXJ2ZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmYXVsdEN3ZENvbmZpZz8udHlwZSwgTWNwU2VydmVyVHlwZS5MT0NBTCk7XG5cdFx0aWYgKGRlZmF1bHRDd2RDb25maWc/LnR5cGUgIT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdGFzc2VydC5mYWlsKCdFeHBlY3RlZCBhIGxvY2FsIE1DUCBzZXJ2ZXIgY29uZmlndXJhdGlvbicpO1xuXHRcdH1cblx0XHRjb25zdCBleHBsaWNpdEN3ZENvbmZpZyA9IHNlcnZlcnMuZ2V0KCdleHBsaWNpdC1jd2Qtc2VydmVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGxpY2l0Q3dkQ29uZmlnPy50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRpZiAoZXhwbGljaXRDd2RDb25maWc/LnR5cGUgIT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdGFzc2VydC5mYWlsKCdFeHBlY3RlZCBhIGxvY2FsIE1DUCBzZXJ2ZXIgY29uZmlndXJhdGlvbicpO1xuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRlZmF1bHRDd2Q6IHtcblx0XHRcdFx0Y29tbWFuZDogZGVmYXVsdEN3ZENvbmZpZy5jb21tYW5kLFxuXHRcdFx0XHRhcmdzOiBkZWZhdWx0Q3dkQ29uZmlnLmFyZ3MsXG5cdFx0XHRcdGN3ZDogZGVmYXVsdEN3ZENvbmZpZy5jd2QsXG5cdFx0XHRcdGVudjogZGVmYXVsdEN3ZENvbmZpZy5lbnYsXG5cdFx0XHR9LFxuXHRcdFx0ZXhwbGljaXRDd2Q6IHtcblx0XHRcdFx0Y29tbWFuZDogZXhwbGljaXRDd2RDb25maWcuY29tbWFuZCxcblx0XHRcdFx0Y3dkOiBleHBsaWNpdEN3ZENvbmZpZy5jd2QsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdGRlZmF1bHRDd2Q6IHtcblx0XHRcdFx0Y29tbWFuZDogYCR7dXJpLmZzUGF0aH0vYmluL3NlcnZlcmAsXG5cdFx0XHRcdGFyZ3M6IFsnLS1kYXRhJywgYCR7dXJpLmZzUGF0aH0vZGF0YWBdLFxuXHRcdFx0XHRjd2Q6IHVyaS5mc1BhdGgsXG5cdFx0XHRcdGVudjoge1xuXHRcdFx0XHRcdENPTkZJR19ESVI6IGAke3VyaS5mc1BhdGh9L2V0Y2AsXG5cdFx0XHRcdFx0UExVR0lOX1JPT1Q6IHVyaS5mc1BhdGgsXG5cdFx0XHRcdFx0Q0xBVURFX1BMVUdJTl9ST09UOiB1cmkuZnNQYXRoLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdGV4cGxpY2l0Q3dkOiB7XG5cdFx0XHRcdGNvbW1hbmQ6ICdub2RlJyxcblx0XHRcdFx0Y3dkOiAnL2N1c3RvbS9jd2QnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSkpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsbUNBQXFEO0FBQzlELFNBQVMseUJBQXlCLDJCQUEyQjtBQUM3RCxTQUFTLG9CQUFvQjtBQU03QixNQUFNLDRCQUE0Qiw2QkFBNkI7QUFBQSxFQUs5RCxZQUNDLGFBQ0Es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
