import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { ResourceSet } from "../../../../../../base/common/map.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { PluginFormat } from "../../../../../../platform/agentPlugins/common/pluginParsers.js";
import { CustomizationEnablementKind, CustomizationType } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { ConfigurationTarget } from "../../../../../../platform/configuration/common/configuration.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { McpServerType } from "../../../../../../platform/mcp/common/mcpPlatformTypes.js";
import { resolveCustomizationRefs, resolveLocalCustomAgents, shouldSyncWorkspaceDotMcp } from "../../../browser/agentSessions/agentHost/agentHostLocalCustomizations.js";
import { BUILTIN_STORAGE } from "../../../common/aiCustomizationWorkspaceService.js";
import { ContributionEnablementState } from "../../../common/enablement.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { McpServerTransportType } from "../../../../mcp/common/mcpTypes.js";
import { ConfigurationResolverExpression } from "../../../../../services/configurationResolver/common/configurationResolverExpression.js";
import { SessionType } from "../../../common/chatSessionsService.js";
function makePromptPath(uri, type, storage) {
  return { uri, type, storage };
}
function makeConfigurationResolverService(resolutions = {}) {
  return {
    async resolveAsync(_folder, config) {
      const expr = ConfigurationResolverExpression.parse(config);
      for (const replacement of expr.unresolved()) {
        if (Object.prototype.hasOwnProperty.call(resolutions, replacement.id)) {
          expr.resolve(replacement, resolutions[replacement.id]);
        } else if (replacement.name === "input" || replacement.name === "command") {
          expr.resolve(replacement, replacement.id);
        }
      }
      return expr.toObject();
    }
  };
}
function makePromptsService(files, disabledPromptFiles = /* @__PURE__ */ new Map()) {
  return {
    async listPromptFilesForStorage(type, storage) {
      return files.get(`${type}/${storage}`) ?? [];
    },
    getDisabledPromptFiles(type) {
      return disabledPromptFiles.get(type) ?? new ResourceSet();
    }
  };
}
class FakeSyncProvider {
  constructor(_disabled = /* @__PURE__ */ new Set()) {
    this._disabled = _disabled;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
  }
  isDisabled(uri) {
    return this._disabled.has(uri.toString());
  }
  setDisabled() {
  }
}
function globalEnablement(enabled) {
  return [{ kind: CustomizationEnablementKind.Global, enabled }];
}
function makeAgentPluginService(plugins = [], profileEnablement = /* @__PURE__ */ new Map()) {
  return {
    _serviceBrand: void 0,
    plugins: observableValue("plugins", plugins),
    enablementModel: { readProfileEnabled: (key) => profileEnablement.get(key) ?? true }
  };
}
function makePlugin(uri, options = {}) {
  const { label = "Plugin", enabled = true, enablement = enabled ? ContributionEnablementState.EnabledProfile : ContributionEnablementState.DisabledProfile, agents = 0, mcpServers = 0 } = options;
  return {
    uri,
    format: PluginFormat.Copilot,
    label,
    enablement: observableValue("enablement", enablement),
    hooks: observableValue("hooks", []),
    commands: observableValue("commands", []),
    skills: observableValue("skills", []),
    agents: observableValue("agents", Array.from({ length: agents }, (_, index) => ({ uri: URI.joinPath(uri, "agents", `agent-${index}.agent.md`), name: `agent-${index}` }))),
    instructions: observableValue("instructions", []),
    mcpServerDefinitions: observableValue("mcpServers", new Array(mcpServers).fill({}))
  };
}
function makeFileService(stats = /* @__PURE__ */ new Map(), contents = /* @__PURE__ */ new Map()) {
  return {
    async stat(uri) {
      const known = stats.get(uri.toString());
      if (known) {
        return known;
      }
      throw new Error(`no stat for ${uri.toString()}`);
    },
    async readFile(uri) {
      const content = contents.get(uri.toString());
      if (content !== void 0) {
        return { resource: uri, value: VSBuffer.fromString(content) };
      }
      throw new Error(`no content for ${uri.toString()}`);
    }
  };
}
function makeMcpServer(options) {
  const { id, collectionId, label = id, enabled = true, enablement = enabled ? ContributionEnablementState.EnabledProfile : ContributionEnablementState.DisabledProfile, launch, configTarget = ConfigurationTarget.USER, collectionSource } = options;
  const collection = { id: collectionId, label: collectionId, order: 0, configTarget, source: collectionSource };
  const definitions = observableValue("definitions", { server: launch ? { launch } : void 0, collection });
  return {
    definition: { id, label },
    collection: { id: collectionId, label: collectionId, order: 0 },
    enablement: observableValue("enablement", enablement),
    readDefinitions: () => definitions
  };
}
function makeMcpService(servers = [], profileEnablement = /* @__PURE__ */ new Map()) {
  return {
    _serviceBrand: void 0,
    servers: observableValue("servers", servers),
    enablementModel: { readProfileEnabled: (key) => profileEnablement.get(key) ?? true }
  };
}
const stdioLaunch = {
  type: McpServerTransportType.Stdio,
  command: "my-server",
  args: ["--flag"],
  env: {},
  envFile: void 0,
  cwd: void 0,
  sandbox: void 0
};
function makeCopilotChatGitHubMcpServer() {
  return makeMcpServer({
    id: "github.copilot-chat/GitHub",
    collectionId: "github.copilot-chat/github",
    label: "GitHub",
    launch: stdioLaunch,
    collectionSource: new ExtensionIdentifier("GitHub.copilot-chat")
  });
}
const stdioLaunchWithInput = {
  type: McpServerTransportType.Stdio,
  command: "my-server",
  args: ["--token", "${input:token}"],
  env: {},
  envFile: void 0,
  cwd: void 0,
  sandbox: void 0
};
const stdioLaunchWithFolder = {
  type: McpServerTransportType.Stdio,
  command: "my-server",
  args: ["--root", "${workspaceFolder}"],
  env: {},
  envFile: void 0,
  cwd: void 0,
  sandbox: void 0
};
class FakeBundler {
  constructor(_result = { uri: "open-plugin://bundle", name: "Open Plugin" }) {
    this._result = _result;
    this.received = [];
    this.receivedMcp = [];
  }
  async bundle(files, mcpServers = []) {
    this.received.push([...files]);
    this.receivedMcp.push([...mcpServers]);
    if (!this._result) {
      return void 0;
    }
    return { ref: { type: CustomizationType.Plugin, id: this._result.uri, uri: this._result.uri, name: this._result.name, enablement: globalEnablement(true) }, paths: [] };
  }
}
suite("resolveCustomizationRefs - built-in skills", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("passes built-in skills to the bundler as loose files", async () => {
    const builtin = URI.file("/builtin/create-pr/SKILL.md");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map([
      [`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE)]]
    ]));
    const bundler = new FakeBundler();
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(),
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(bundler.received[0].map((f) => ({ uri: f.uri.toString(), type: f.type })), [
      { uri: builtin.toString(), type: PromptsType.skill }
    ]);
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].name, "Open Plugin");
  });
  test("omits disabled built-in skills from the bundle", async () => {
    const enabled = URI.file("/builtin/create-pr/SKILL.md");
    const disabled = URI.file("/builtin/merge/SKILL.md");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map([
      [`${PromptsType.skill}/${BUILTIN_STORAGE}`, [
        makePromptPath(enabled, PromptsType.skill, BUILTIN_STORAGE),
        makePromptPath(disabled, PromptsType.skill, BUILTIN_STORAGE)
      ]]
    ]));
    const bundler = new FakeBundler();
    await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(/* @__PURE__ */ new Set([disabled.toString()])),
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.deepStrictEqual(bundler.received[0].map((f) => f.uri.toString()), [enabled.toString()]);
  });
  test("omits built-in skills the user disabled in the Customizations UI from the bundle", async () => {
    const enabled = URI.file("/builtin/create-pr/SKILL.md");
    const disabled = URI.file("/builtin/merge/SKILL.md");
    const promptsService = makePromptsService(
      /* @__PURE__ */ new Map([
        [`${PromptsType.skill}/${BUILTIN_STORAGE}`, [
          makePromptPath(enabled, PromptsType.skill, BUILTIN_STORAGE),
          makePromptPath(disabled, PromptsType.skill, BUILTIN_STORAGE)
        ]]
      ]),
      /* @__PURE__ */ new Map([[PromptsType.skill, new ResourceSet([disabled])]])
    );
    const bundler = new FakeBundler();
    await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(),
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.deepStrictEqual(bundler.received[0].map((f) => f.uri.toString()), [enabled.toString()]);
  });
  test("combines built-in skills with user files in a single bundle", async () => {
    const userAgent = URI.file("/user/agents/foo.agent.md");
    const builtin = URI.file("/builtin/merge/SKILL.md");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map([
      [`${PromptsType.agent}/${PromptsStorage.extension}`, [makePromptPath(userAgent, PromptsType.agent, PromptsStorage.extension)]],
      [`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE)]]
    ]));
    const bundler = new FakeBundler();
    await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(),
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(
      bundler.received[0].map((f) => ({ uri: f.uri.toString(), type: f.type })).sort((a, b) => a.uri.localeCompare(b.uri)),
      [
        { uri: builtin.toString(), type: PromptsType.skill },
        { uri: userAgent.toString(), type: PromptsType.agent }
      ].sort((a, b) => a.uri.localeCompare(b.uri))
    );
  });
  test("includes enabled user files only when user storage is enabled", async () => {
    const enabled = URI.file("/home/user/.copilot/instructions/enabled.instructions.md");
    const disabled = URI.file("/home/user/.claude/rules/disabled.instructions.md");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map([
      [`${PromptsType.instructions}/${PromptsStorage.user}`, [
        makePromptPath(enabled, PromptsType.instructions, PromptsStorage.user),
        makePromptPath(disabled, PromptsType.instructions, PromptsStorage.user)
      ]]
    ]));
    const syncProvider = new FakeSyncProvider(/* @__PURE__ */ new Set([disabled.toString()]));
    const localBundler = new FakeBundler();
    const remoteBundler = new FakeBundler();
    await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      syncProvider,
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      localBundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      syncProvider,
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      remoteBundler,
      SessionType.CopilotCLI,
      false,
      { includeUserStorage: true }
    );
    assert.deepStrictEqual({
      local: localBundler.received,
      remote: remoteBundler.received[0].map((file) => ({ uri: file.uri.toString(), source: file.source }))
    }, {
      local: [],
      remote: [{ uri: enabled.toString(), source: PromptsStorage.user }]
    });
  });
  test("skips bundler call entirely when only disabled built-ins exist", async () => {
    const builtin = URI.file("/builtin/create-pr/SKILL.md");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map([
      [`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE)]]
    ]));
    const bundler = new FakeBundler();
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(/* @__PURE__ */ new Set([builtin.toString()])),
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.strictEqual(bundler.received.length, 0);
    assert.deepStrictEqual(refs, []);
  });
  test("includes plugins that only contribute MCP servers", async () => {
    const pluginUri = URI.file("/plugins/mcp-only");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map());
    const bundler = new FakeBundler();
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(),
      makeAgentPluginService([makePlugin(pluginUri, { label: "MCP Only", mcpServers: 1 })]),
      makeMcpService(),
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.strictEqual(bundler.received.length, 0);
    assert.deepStrictEqual(refs.map((r) => ({ uri: r.uri, name: r.name })), [
      { uri: pluginUri.toString(), name: "MCP Only" }
    ]);
  });
  test("includes plugins discovered through their agents before prompt-file hydration", async () => {
    const pluginUri = URI.file("/plugins/agent-only");
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService([makePlugin(pluginUri, { label: "Agent Only", agents: 1 })]),
      makeMcpService(),
      makeConfigurationResolverService(),
      new FakeBundler(),
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.deepStrictEqual(refs.map((ref) => ({ uri: ref.uri, name: ref.name })), [
      { uri: pluginUri.toString(), name: "Agent Only" }
    ]);
  });
  test("publishes disabled MCP-only plugins with an explicit global decision", async () => {
    const pluginUri = URI.file("/plugins/mcp-disabled");
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService([makePlugin(pluginUri, { enabled: false, mcpServers: 1 })], /* @__PURE__ */ new Map([[pluginUri.toString(), false]])),
      makeMcpService(),
      makeConfigurationResolverService(),
      new FakeBundler(),
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.deepStrictEqual(refs.map((ref) => ref.enablement), [globalEnablement(false)]);
  });
  test("publishes disabled plugins with agent contributions", async () => {
    const pluginUri = URI.file("/plugins/agent-disabled");
    const promptFile = URI.file("/plugins/agent-disabled/agents/foo.agent.md");
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map([
        [`${PromptsType.agent}/${PromptsStorage.plugin}`, [makePromptPath(promptFile, PromptsType.agent, PromptsStorage.plugin)]]
      ])),
      new FakeSyncProvider(),
      makeAgentPluginService([makePlugin(pluginUri, { enabled: false })], /* @__PURE__ */ new Map([[pluginUri.toString(), false]])),
      makeMcpService(),
      makeConfigurationResolverService(),
      new FakeBundler(),
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.deepStrictEqual(refs.map((ref) => ref.enablement), [globalEnablement(false)]);
  });
  test("publishes MCP-only plugins regardless of the removed plugin sync opt-out", async () => {
    const pluginUri = URI.file("/plugins/mcp-opted-out");
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(/* @__PURE__ */ new Set([pluginUri.toString()])),
      makeAgentPluginService([makePlugin(pluginUri, { mcpServers: 1 })]),
      makeMcpService(),
      makeConfigurationResolverService(),
      new FakeBundler(),
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.deepStrictEqual(refs.map((ref) => ref.enablement), [globalEnablement(true)]);
  });
  test("does not duplicate a plugin that contributes both prompt files and MCP servers", async () => {
    const pluginUri = URI.file("/plugins/combined");
    const promptFile = URI.file("/plugins/combined/skills/foo.skill.md");
    const promptsService = makePromptsService(/* @__PURE__ */ new Map([
      [`${PromptsType.skill}/${PromptsStorage.plugin}`, [makePromptPath(promptFile, PromptsType.skill, PromptsStorage.plugin)]]
    ]));
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(),
      makeAgentPluginService([makePlugin(pluginUri, { label: "Combined", mcpServers: 2 })]),
      makeMcpService(),
      makeConfigurationResolverService(),
      new FakeBundler(),
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.deepStrictEqual(refs.map((r) => r.uri), [pluginUri.toString()]);
  });
  test("we honor the cancellation token contract by passing it through to listPromptFilesForStorage", async () => {
    const promptsService = makePromptsService(/* @__PURE__ */ new Map());
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      promptsService,
      new FakeSyncProvider(),
      makeAgentPluginService(),
      makeMcpService(),
      makeConfigurationResolverService(),
      new FakeBundler(),
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.deepStrictEqual(refs, []);
    assert.ok(CancellationToken.None.isCancellationRequested === false);
  });
  test("bundles MCP servers configured directly in VS Code", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "user.my-server", collectionId: "user", label: "my-server", launch: stdioLaunch })
    ]);
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(bundler.receivedMcp[0], [
      { name: "my-server", configuration: { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"], env: void 0, envFile: void 0, cwd: void 0 }, enablement: globalEnablement(true) }
    ]);
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].name, "Open Plugin");
  });
  test("excludes the Copilot Chat GitHub MCP provider without excluding user or other extension servers", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeCopilotChatGitHubMcpServer(),
      makeMcpServer({ id: "user.GitHub", collectionId: "user", label: "GitHub", launch: stdioLaunch }),
      makeMcpServer({
        id: "publisher.extension/server",
        collectionId: "publisher.extension/provider",
        label: "extension-server",
        launch: stdioLaunch,
        collectionSource: new ExtensionIdentifier("publisher.extension")
      })
    ]);
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      "agent-host-copilotcli",
      false,
      void 0
    );
    assert.deepStrictEqual(bundler.receivedMcp, [[
      { name: "GitHub", configuration: { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"], env: void 0, envFile: void 0, cwd: void 0 }, enablement: globalEnablement(true) },
      { name: "extension-server", configuration: { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"], env: void 0, envFile: void 0, cwd: void 0 }, enablement: globalEnablement(true) }
    ]]);
  });
  test("excludes the Copilot Chat GitHub MCP provider from remote Copilot agent hosts", async () => {
    const bundler = new FakeBundler();
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      makeMcpService([makeCopilotChatGitHubMcpServer()]),
      makeConfigurationResolverService(),
      bundler,
      "remote-test-copilotcli",
      false,
      void 0
    );
    assert.deepStrictEqual(bundler.receivedMcp, []);
  });
  test("retains the Copilot Chat GitHub MCP provider for agent hosts without a built-in server", async () => {
    const bundler = new FakeBundler();
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      makeMcpService([makeCopilotChatGitHubMcpServer()]),
      makeConfigurationResolverService(),
      bundler,
      "agent-host-claude",
      false,
      void 0
    );
    assert.deepStrictEqual(bundler.receivedMcp, [[
      { name: "GitHub", configuration: { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"], env: void 0, envFile: void 0, cwd: void 0 }, enablement: globalEnablement(true) }
    ]]);
  });
  test("excludes plugin-sourced MCP servers from the bundle", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "plugin.foo.srv", collectionId: "plugin.file:///plugins/foo", label: "srv", launch: stdioLaunch })
    ]);
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.strictEqual(bundler.received.length, 0);
    assert.deepStrictEqual(refs, []);
  });
  test("publishes disabled MCP servers with an explicit global decision", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "user.off", collectionId: "user", label: "off", enabled: false, launch: stdioLaunch })
    ], /* @__PURE__ */ new Map([["user.off", false]]));
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.deepStrictEqual(bundler.receivedMcp[0], [
      { name: "off", configuration: { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"], env: void 0, envFile: void 0, cwd: void 0 }, enablement: globalEnablement(false) }
    ]);
  });
  test("publishes profile enablement despite a VS Code workspace override", async () => {
    const pluginUri = URI.file("/plugins/workspace-disabled");
    const plugin = makePlugin(pluginUri, { mcpServers: 1, enablement: ContributionEnablementState.DisabledWorkspace });
    const server = makeMcpServer({ id: "user.workspace-disabled", collectionId: "user", label: "workspace-disabled", enablement: ContributionEnablementState.DisabledWorkspace, launch: stdioLaunch });
    const bundler = new FakeBundler();
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService([plugin], /* @__PURE__ */ new Map([[pluginUri.toString(), true]])),
      makeMcpService([server], /* @__PURE__ */ new Map([["user.workspace-disabled", true]])),
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.deepStrictEqual(refs.map((ref) => ref.enablement), [globalEnablement(true), globalEnablement(true)]);
    assert.deepStrictEqual(bundler.receivedMcp[0].map((entry) => entry.enablement), [globalEnablement(true)]);
  });
  test("excludes workspace-discovered `.mcp.json` servers (the agent host discovers those itself)", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "wsdot.srv", collectionId: "workspace-dot-mcp.0", label: "srv", launch: stdioLaunch, configTarget: ConfigurationTarget.WORKSPACE_FOLDER })
    ]);
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.strictEqual(bundler.received.length, 0);
  });
  test("excludes `.code-workspace` configured servers", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "wscfg.srv", collectionId: "mcp.config.workspace", label: "srv", launch: stdioLaunch, configTarget: ConfigurationTarget.WORKSPACE })
    ]);
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.strictEqual(bundler.received.length, 0);
  });
  test("includes workspace-discovered `.mcp.json` servers when includeWorkspaceDotMcp is set (multi-root gate)", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "wsdot.srv", collectionId: "workspace-dot-mcp.0", label: "srv", launch: stdioLaunch, configTarget: ConfigurationTarget.WORKSPACE_FOLDER })
    ]);
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      true,
      void 0
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(bundler.receivedMcp[0], [
      { name: "srv", configuration: { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"], env: void 0, envFile: void 0, cwd: void 0 }, enablement: globalEnablement(true) }
    ]);
    assert.strictEqual(refs.length, 1);
  });
  test("still excludes `.code-workspace` servers even when includeWorkspaceDotMcp is set", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "wscfg.srv", collectionId: "mcp.config.workspace", label: "srv", launch: stdioLaunch, configTarget: ConfigurationTarget.WORKSPACE })
    ]);
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      true,
      void 0
    );
    assert.strictEqual(bundler.received.length, 0);
  });
  test("syncs `.vscode/mcp.json` servers that resolve without user interaction", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "mcp.config.ws0.my-server", collectionId: "mcp.config.ws0", label: "my-server", launch: stdioLaunch, configTarget: ConfigurationTarget.WORKSPACE_FOLDER })
    ]);
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(bundler.receivedMcp[0], [
      { name: "my-server", configuration: { type: McpServerType.LOCAL, command: "my-server", args: ["--flag"], env: void 0, envFile: void 0, cwd: void 0 }, enablement: globalEnablement(true) }
    ]);
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].name, "Open Plugin");
  });
  test("excludes `.vscode/mcp.json` servers with variables that require interaction (e.g. ${input:\u2026})", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "mcp.config.ws0.needs-input", collectionId: "mcp.config.ws0", label: "needs-input", launch: stdioLaunchWithInput, configTarget: ConfigurationTarget.WORKSPACE_FOLDER })
    ]);
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.strictEqual(bundler.received.length, 0);
  });
  test("syncs `.vscode/mcp.json` servers after resolving non-interactive variables (e.g. ${workspaceFolder})", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "mcp.config.ws0.folder", collectionId: "mcp.config.ws0", label: "folder-server", launch: stdioLaunchWithFolder, configTarget: ConfigurationTarget.WORKSPACE_FOLDER })
    ]);
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService({ "${workspaceFolder}": "/ws" }),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(bundler.receivedMcp[0], [
      { name: "folder-server", configuration: { type: McpServerType.LOCAL, command: "my-server", args: ["--root", "/ws"], env: void 0, envFile: void 0, cwd: void 0 }, enablement: globalEnablement(true) }
    ]);
    assert.strictEqual(refs.length, 1);
  });
  test("excludes `.vscode/mcp.json` servers when variable resolution throws", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "mcp.config.ws0.folder", collectionId: "mcp.config.ws0", label: "folder-server", launch: stdioLaunchWithFolder, configTarget: ConfigurationTarget.WORKSPACE_FOLDER })
    ]);
    const throwingResolver = {
      async resolveAsync() {
        throw new Error("no workspace folder");
      }
    };
    await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      throwingResolver,
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.strictEqual(bundler.received.length, 0);
  });
  test("still syncs extension-contributed servers (workspace scope, user config target)", async () => {
    const bundler = new FakeBundler();
    const mcpService = makeMcpService([
      makeMcpServer({ id: "ext.foo.srv", collectionId: "ext.foo", label: "srv", launch: stdioLaunch, configTarget: ConfigurationTarget.USER })
    ]);
    const refs = await resolveCustomizationRefs(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map()),
      new FakeSyncProvider(),
      makeAgentPluginService(),
      mcpService,
      makeConfigurationResolverService(),
      bundler,
      SessionType.CopilotCLI,
      false,
      void 0
    );
    assert.strictEqual(bundler.received.length, 1);
    assert.deepStrictEqual(bundler.receivedMcp[0].map((s) => s.name), ["srv"]);
    assert.strictEqual(refs.length, 1);
  });
});
suite("resolveLocalCustomAgents", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("parses agent frontmatter for the pre-session picker", async () => {
    const pluginUri = URI.file("/plugins/github-inbox");
    const agentUri = URI.joinPath(pluginUri, "agents", "inbox.agent.md");
    const plugin = {
      ...makePlugin(pluginUri),
      agents: observableValue("agents", [{ uri: agentUri, name: "inbox.agent" }])
    };
    const agents = await resolveLocalCustomAgents(
      makeFileService(/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map([[agentUri.toString(), [
        "---",
        "name: Inbox",
        "description: Triage GitHub notifications",
        "user-invocable: false",
        "---",
        "Agent instructions"
      ].join("\n")]])),
      makePromptsService(/* @__PURE__ */ new Map([
        [`${PromptsType.agent}/${PromptsStorage.plugin}`, [makePromptPath(agentUri, PromptsType.agent, PromptsStorage.plugin)]]
      ])),
      new FakeSyncProvider(),
      makeAgentPluginService([plugin]),
      SessionType.CopilotCLI,
      void 0
    );
    assert.deepStrictEqual(agents, [{
      type: "agent",
      id: agentUri.toString(),
      uri: agentUri.toString(),
      name: "Inbox",
      description: "Triage GitHub notifications",
      disableUserInvocation: true
    }]);
  });
  test("uses profile enablement when filtering plugin agents for the pre-session picker", async () => {
    const pluginUri = URI.file("/plugins/workspace-disabled");
    const agentUri = URI.joinPath(pluginUri, "agents", "agent-0.agent.md");
    const plugin = makePlugin(pluginUri, { agents: 1, enablement: ContributionEnablementState.DisabledWorkspace });
    const agents = await resolveLocalCustomAgents(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map([
        [`${PromptsType.agent}/${PromptsStorage.plugin}`, [makePromptPath(agentUri, PromptsType.agent, PromptsStorage.plugin)]]
      ])),
      new FakeSyncProvider(),
      makeAgentPluginService([plugin], /* @__PURE__ */ new Map([[pluginUri.toString(), true]])),
      SessionType.CopilotCLI,
      void 0
    );
    assert.deepStrictEqual(agents.map((agent) => agent.name), ["agent-0"]);
  });
  test("publishes plugin agents disabled in the profile for container-gated selection", async () => {
    const pluginUri = URI.file("/plugins/profile-disabled");
    const agentUri = URI.joinPath(pluginUri, "agents", "agent-0.agent.md");
    const plugin = makePlugin(pluginUri, { agents: 1, enablement: ContributionEnablementState.EnabledWorkspace });
    const agents = await resolveLocalCustomAgents(
      makeFileService(),
      makePromptsService(/* @__PURE__ */ new Map([
        [`${PromptsType.agent}/${PromptsStorage.plugin}`, [makePromptPath(agentUri, PromptsType.agent, PromptsStorage.plugin)]]
      ])),
      new FakeSyncProvider(),
      makeAgentPluginService([plugin], /* @__PURE__ */ new Map([[pluginUri.toString(), false]])),
      SessionType.CopilotCLI,
      void 0
    );
    assert.deepStrictEqual(agents.map((agent) => agent.uri), [agentUri.toString()]);
  });
});
suite("shouldSyncWorkspaceDotMcp - multi-root gate", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const LOCAL_COPILOT = "agent-host-copilotcli";
  test("true only for local Copilot + multiple roots + setting enabled", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp(LOCAL_COPILOT, [URI.file("/workspace-a"), URI.file("/workspace-b")], true), true);
  });
  test("false when the multi-root setting is disabled", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp(LOCAL_COPILOT, [URI.file("/workspace-a"), URI.file("/workspace-b")], false), false);
  });
  test("false for a single root", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp(LOCAL_COPILOT, [URI.file("/workspace")], true), false);
  });
  test("false for a workspace-less scope", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp(LOCAL_COPILOT, [], true), false);
  });
  test("false for a non-Copilot harness (e.g. Claude)", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp("agent-host-claude", [URI.file("/workspace-a"), URI.file("/workspace-b")], true), false);
  });
  test("false for the Copilot CLI (extension host) harness", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp("copilotcli", [URI.file("/workspace-a"), URI.file("/workspace-b")], true), false);
  });
  test("false for a remote Copilot Agent Host session", () => {
    assert.strictEqual(shouldSyncWorkspaceDotMcp("remote-myauthority-copilotcli", [URI.file("/workspace-a"), URI.file("/workspace-b")], true), false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXHJlc29sdmVDdXN0b21pemF0aW9uUmVmcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFBsdWdpbkZvcm1hdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQsIEN1c3RvbWl6YXRpb25UeXBlLCB0eXBlIEN1c3RvbWl6YXRpb25FbmFibGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMsIHJlc29sdmVMb2NhbEN1c3RvbUFnZW50cywgc2hvdWxkU3luY1dvcmtzcGFjZURvdE1jcCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0TG9jYWxDdXN0b21pemF0aW9ucy5qcyc7XG5pbXBvcnQgeyB0eXBlIElTeW5jYWJsZUZpbGUsIHR5cGUgSVN5bmNhYmxlTWNwU2VydmVyLCB0eXBlIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9zeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlci5qcyc7XG5pbXBvcnQgeyBCVUlMVElOX1NUT1JBR0UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0eXBlIElDdXN0b21pemF0aW9uU3luY1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyB0eXBlIElBZ2VudFBsdWdpbiwgdHlwZSBJQWdlbnRQbHVnaW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyB0eXBlIElQcm9tcHRQYXRoLCB0eXBlIElQcm9tcHRzU2VydmljZSwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgdHlwZSBJTWNwU2VydmVyLCB0eXBlIElNY3BTZXJ2aWNlLCBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiwgTWNwU2VydmVyTGF1bmNoLCBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24uanMnO1xuaW1wb3J0IHsgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5cbmZ1bmN0aW9uIG1ha2VQcm9tcHRQYXRoKHVyaTogVVJJLCB0eXBlOiBQcm9tcHRzVHlwZSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UpOiBJUHJvbXB0UGF0aCB7XG5cdHJldHVybiB7IHVyaSwgdHlwZSwgc3RvcmFnZSB9IGFzIElQcm9tcHRQYXRoO1xufVxuXG4vKipcbiAqIEEgZmFrZSB7QGxpbmsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2V9IHdob3NlIGByZXNvbHZlQXN5bmNgIG1pcnJvcnMgdGhlXG4gKiByZWFsIHNlcnZpY2U6IGl0IHJlc29sdmVzIHRoZSBnaXZlbiBgJHsuLi59YCB2YXJpYWJsZXMgZnJvbSBgcmVzb2x1dGlvbnNgIGFuZFxuICogbGVhdmVzIGFueSBvdGhlcnMgKGUuZy4gYCR7aW5wdXQ6XHUyMDI2fWApIHVudG91Y2hlZCBzbyB0aGV5IHJlbWFpbiB1bnJlc29sdmVkLlxuICovXG5mdW5jdGlvbiBtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZShyZXNvbHV0aW9uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9KTogSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdGFzeW5jIHJlc29sdmVBc3luYyhfZm9sZGVyOiB1bmtub3duLCBjb25maWc6IHVua25vd24pIHtcblx0XHRcdGNvbnN0IGV4cHIgPSBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLnBhcnNlKGNvbmZpZyBhcyBvYmplY3QpO1xuXHRcdFx0Zm9yIChjb25zdCByZXBsYWNlbWVudCBvZiBleHByLnVucmVzb2x2ZWQoKSkge1xuXHRcdFx0XHRpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc29sdXRpb25zLCByZXBsYWNlbWVudC5pZCkpIHtcblx0XHRcdFx0XHRleHByLnJlc29sdmUocmVwbGFjZW1lbnQsIHJlc29sdXRpb25zW3JlcGxhY2VtZW50LmlkXSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocmVwbGFjZW1lbnQubmFtZSA9PT0gJ2lucHV0JyB8fCByZXBsYWNlbWVudC5uYW1lID09PSAnY29tbWFuZCcpIHtcblx0XHRcdFx0XHQvLyBNaXJyb3IgdGhlIHJlYWwgcmVzb2x2ZXI6IHdpdGhvdXQgYSB2YWx1ZSBtYXBwaW5nLCBpbnRlcmFjdGl2ZVxuXHRcdFx0XHRcdC8vIHZhcmlhYmxlcyBcInJlc29sdmVcIiB0byB0aGVpciBvd24gbGl0ZXJhbCB0ZXh0LCBkcm9wcGluZyBvdXQgb2Zcblx0XHRcdFx0XHQvLyBgdW5yZXNvbHZlZCgpYC5cblx0XHRcdFx0XHRleHByLnJlc29sdmUocmVwbGFjZW1lbnQsIHJlcGxhY2VtZW50LmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGV4cHIudG9PYmplY3QoKTtcblx0XHR9LFxuXHR9IGFzIHVua25vd24gYXMgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U7XG59XG5cbmZ1bmN0aW9uIG1ha2VQcm9tcHRzU2VydmljZShcblx0ZmlsZXM6IFJlYWRvbmx5TWFwPHN0cmluZywgcmVhZG9ubHkgSVByb21wdFBhdGhbXT4sXG5cdGRpc2FibGVkUHJvbXB0RmlsZXM6IFJlYWRvbmx5TWFwPFByb21wdHNUeXBlLCBSZXNvdXJjZVNldD4gPSBuZXcgTWFwKCksXG4pOiBJUHJvbXB0c1NlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdGFzeW5jIGxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UodHlwZTogUHJvbXB0c1R5cGUsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlKTogUHJvbWlzZTxyZWFkb25seSBJUHJvbXB0UGF0aFtdPiB7XG5cdFx0XHRyZXR1cm4gZmlsZXMuZ2V0KGAke3R5cGV9LyR7c3RvcmFnZX1gKSA/PyBbXTtcblx0XHR9LFxuXHRcdGdldERpc2FibGVkUHJvbXB0RmlsZXModHlwZTogUHJvbXB0c1R5cGUpOiBSZXNvdXJjZVNldCB7XG5cdFx0XHRyZXR1cm4gZGlzYWJsZWRQcm9tcHRGaWxlcy5nZXQodHlwZSkgPz8gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0fSxcblx0fSBhcyB1bmtub3duIGFzIElQcm9tcHRzU2VydmljZTtcbn1cblxuY2xhc3MgRmFrZVN5bmNQcm92aWRlciBpbXBsZW1lbnRzIElDdXN0b21pemF0aW9uU3luY1Byb3ZpZGVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfZGlzYWJsZWQ6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KCkpIHsgfVxuXHRpc0Rpc2FibGVkKHVyaTogVVJJKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9kaXNhYmxlZC5oYXModXJpLnRvU3RyaW5nKCkpOyB9XG5cdHNldERpc2FibGVkKCk6IHZvaWQgeyAvKiBuby1vcCAqLyB9XG59XG5cbmZ1bmN0aW9uIGdsb2JhbEVuYWJsZW1lbnQoZW5hYmxlZDogYm9vbGVhbik6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10ge1xuXHRyZXR1cm4gW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZCB9XTtcbn1cblxuZnVuY3Rpb24gbWFrZUFnZW50UGx1Z2luU2VydmljZShwbHVnaW5zOiByZWFkb25seSBJQWdlbnRQbHVnaW5bXSA9IFtdLCBwcm9maWxlRW5hYmxlbWVudCA9IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpKTogSUFnZW50UGx1Z2luU2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdHBsdWdpbnM6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2lucycsIHBsdWdpbnMpLFxuXHRcdGVuYWJsZW1lbnRNb2RlbDogeyByZWFkUHJvZmlsZUVuYWJsZWQ6IChrZXk6IHN0cmluZykgPT4gcHJvZmlsZUVuYWJsZW1lbnQuZ2V0KGtleSkgPz8gdHJ1ZSB9LFxuXHR9IGFzIHVua25vd24gYXMgSUFnZW50UGx1Z2luU2VydmljZTtcbn1cblxuZnVuY3Rpb24gbWFrZVBsdWdpbih1cmk6IFVSSSwgb3B0aW9uczogeyBsYWJlbD86IHN0cmluZzsgZW5hYmxlZD86IGJvb2xlYW47IGVuYWJsZW1lbnQ/OiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGU7IGFnZW50cz86IG51bWJlcjsgbWNwU2VydmVycz86IG51bWJlciB9ID0ge30pOiBJQWdlbnRQbHVnaW4ge1xuXHRjb25zdCB7IGxhYmVsID0gJ1BsdWdpbicsIGVuYWJsZWQgPSB0cnVlLCBlbmFibGVtZW50ID0gZW5hYmxlZCA/IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSA6IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFByb2ZpbGUsIGFnZW50cyA9IDAsIG1jcFNlcnZlcnMgPSAwIH0gPSBvcHRpb25zO1xuXHRyZXR1cm4ge1xuXHRcdHVyaSxcblx0XHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5Db3BpbG90LFxuXHRcdGxhYmVsLFxuXHRcdGVuYWJsZW1lbnQ6IG9ic2VydmFibGVWYWx1ZSgnZW5hYmxlbWVudCcsIGVuYWJsZW1lbnQpLFxuXHRcdGhvb2tzOiBvYnNlcnZhYmxlVmFsdWUoJ2hvb2tzJywgW10pLFxuXHRcdGNvbW1hbmRzOiBvYnNlcnZhYmxlVmFsdWUoJ2NvbW1hbmRzJywgW10pLFxuXHRcdHNraWxsczogb2JzZXJ2YWJsZVZhbHVlKCdza2lsbHMnLCBbXSksXG5cdFx0YWdlbnRzOiBvYnNlcnZhYmxlVmFsdWUoJ2FnZW50cycsIEFycmF5LmZyb20oeyBsZW5ndGg6IGFnZW50cyB9LCAoXywgaW5kZXgpID0+ICh7IHVyaTogVVJJLmpvaW5QYXRoKHVyaSwgJ2FnZW50cycsIGBhZ2VudC0ke2luZGV4fS5hZ2VudC5tZGApLCBuYW1lOiBgYWdlbnQtJHtpbmRleH1gIH0pKSksXG5cdFx0aW5zdHJ1Y3Rpb25zOiBvYnNlcnZhYmxlVmFsdWUoJ2luc3RydWN0aW9ucycsIFtdKSxcblx0XHRtY3BTZXJ2ZXJEZWZpbml0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCdtY3BTZXJ2ZXJzJywgbmV3IEFycmF5KG1jcFNlcnZlcnMpLmZpbGwoe30pKSxcblx0fSBhcyB1bmtub3duIGFzIElBZ2VudFBsdWdpbjtcbn1cblxuZnVuY3Rpb24gbWFrZUZpbGVTZXJ2aWNlKHN0YXRzOiBSZWFkb25seU1hcDxzdHJpbmcsIHsgbXRpbWU6IG51bWJlciB9PiA9IG5ldyBNYXAoKSwgY29udGVudHM6IFJlYWRvbmx5TWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKSk6IElGaWxlU2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0YXN5bmMgc3RhdCh1cmk6IFVSSSkge1xuXHRcdFx0Y29uc3Qga25vd24gPSBzdGF0cy5nZXQodXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKGtub3duKSB7XG5cdFx0XHRcdHJldHVybiBrbm93bjtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcihgbm8gc3RhdCBmb3IgJHt1cmkudG9TdHJpbmcoKX1gKTtcblx0XHR9LFxuXHRcdGFzeW5jIHJlYWRGaWxlKHVyaTogVVJJKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY29udGVudHMuZ2V0KHVyaS50b1N0cmluZygpKTtcblx0XHRcdGlmIChjb250ZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHsgcmVzb3VyY2U6IHVyaSwgdmFsdWU6IFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkgfTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcihgbm8gY29udGVudCBmb3IgJHt1cmkudG9TdHJpbmcoKX1gKTtcblx0XHR9LFxuXHR9IGFzIHVua25vd24gYXMgSUZpbGVTZXJ2aWNlO1xufVxuXG5mdW5jdGlvbiBtYWtlTWNwU2VydmVyKG9wdGlvbnM6IHsgaWQ6IHN0cmluZzsgY29sbGVjdGlvbklkOiBzdHJpbmc7IGxhYmVsPzogc3RyaW5nOyBlbmFibGVkPzogYm9vbGVhbjsgZW5hYmxlbWVudD86IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZTsgbGF1bmNoPzogTWNwU2VydmVyTGF1bmNoIHwgdW5kZWZpbmVkOyBjb25maWdUYXJnZXQ/OiBDb25maWd1cmF0aW9uVGFyZ2V0OyBjb2xsZWN0aW9uU291cmNlPzogRXh0ZW5zaW9uSWRlbnRpZmllciB9KTogSU1jcFNlcnZlciB7XG5cdGNvbnN0IHsgaWQsIGNvbGxlY3Rpb25JZCwgbGFiZWwgPSBpZCwgZW5hYmxlZCA9IHRydWUsIGVuYWJsZW1lbnQgPSBlbmFibGVkID8gQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlIDogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSwgbGF1bmNoLCBjb25maWdUYXJnZXQgPSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsIGNvbGxlY3Rpb25Tb3VyY2UgfSA9IG9wdGlvbnM7XG5cdGNvbnN0IGNvbGxlY3Rpb24gPSB7IGlkOiBjb2xsZWN0aW9uSWQsIGxhYmVsOiBjb2xsZWN0aW9uSWQsIG9yZGVyOiAwLCBjb25maWdUYXJnZXQsIHNvdXJjZTogY29sbGVjdGlvblNvdXJjZSB9IGFzIHVua25vd24gYXMgTWNwQ29sbGVjdGlvbkRlZmluaXRpb247XG5cdGNvbnN0IGRlZmluaXRpb25zID0gb2JzZXJ2YWJsZVZhbHVlKCdkZWZpbml0aW9ucycsIHsgc2VydmVyOiBsYXVuY2ggPyB7IGxhdW5jaCB9IDogdW5kZWZpbmVkLCBjb2xsZWN0aW9uIH0pO1xuXHRyZXR1cm4ge1xuXHRcdGRlZmluaXRpb246IHsgaWQsIGxhYmVsIH0sXG5cdFx0Y29sbGVjdGlvbjogeyBpZDogY29sbGVjdGlvbklkLCBsYWJlbDogY29sbGVjdGlvbklkLCBvcmRlcjogMCB9LFxuXHRcdGVuYWJsZW1lbnQ6IG9ic2VydmFibGVWYWx1ZSgnZW5hYmxlbWVudCcsIGVuYWJsZW1lbnQpLFxuXHRcdHJlYWREZWZpbml0aW9uczogKCkgPT4gZGVmaW5pdGlvbnMsXG5cdH0gYXMgdW5rbm93biBhcyBJTWNwU2VydmVyO1xufVxuXG5mdW5jdGlvbiBtYWtlTWNwU2VydmljZShzZXJ2ZXJzOiByZWFkb25seSBJTWNwU2VydmVyW10gPSBbXSwgcHJvZmlsZUVuYWJsZW1lbnQgPSBuZXcgTWFwPHN0cmluZywgYm9vbGVhbj4oKSk6IElNY3BTZXJ2aWNlIHtcblx0cmV0dXJuIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0c2VydmVyczogb2JzZXJ2YWJsZVZhbHVlKCdzZXJ2ZXJzJywgc2VydmVycyksXG5cdFx0ZW5hYmxlbWVudE1vZGVsOiB7IHJlYWRQcm9maWxlRW5hYmxlZDogKGtleTogc3RyaW5nKSA9PiBwcm9maWxlRW5hYmxlbWVudC5nZXQoa2V5KSA/PyB0cnVlIH0sXG5cdH0gYXMgdW5rbm93biBhcyBJTWNwU2VydmljZTtcbn1cblxuY29uc3Qgc3RkaW9MYXVuY2g6IE1jcFNlcnZlckxhdW5jaCA9IHtcblx0dHlwZTogTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbyxcblx0Y29tbWFuZDogJ215LXNlcnZlcicsXG5cdGFyZ3M6IFsnLS1mbGFnJ10sXG5cdGVudjoge30sXG5cdGVudkZpbGU6IHVuZGVmaW5lZCxcblx0Y3dkOiB1bmRlZmluZWQsXG5cdHNhbmRib3g6IHVuZGVmaW5lZCxcbn07XG5cbmZ1bmN0aW9uIG1ha2VDb3BpbG90Q2hhdEdpdEh1Yk1jcFNlcnZlcigpOiBJTWNwU2VydmVyIHtcblx0cmV0dXJuIG1ha2VNY3BTZXJ2ZXIoe1xuXHRcdGlkOiAnZ2l0aHViLmNvcGlsb3QtY2hhdC9HaXRIdWInLFxuXHRcdGNvbGxlY3Rpb25JZDogJ2dpdGh1Yi5jb3BpbG90LWNoYXQvZ2l0aHViJyxcblx0XHRsYWJlbDogJ0dpdEh1YicsXG5cdFx0bGF1bmNoOiBzdGRpb0xhdW5jaCxcblx0XHRjb2xsZWN0aW9uU291cmNlOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignR2l0SHViLmNvcGlsb3QtY2hhdCcpLFxuXHR9KTtcbn1cblxuY29uc3Qgc3RkaW9MYXVuY2hXaXRoSW5wdXQ6IE1jcFNlcnZlckxhdW5jaCA9IHtcblx0dHlwZTogTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbyxcblx0Y29tbWFuZDogJ215LXNlcnZlcicsXG5cdGFyZ3M6IFsnLS10b2tlbicsICcke2lucHV0OnRva2VufSddLFxuXHRlbnY6IHt9LFxuXHRlbnZGaWxlOiB1bmRlZmluZWQsXG5cdGN3ZDogdW5kZWZpbmVkLFxuXHRzYW5kYm94OiB1bmRlZmluZWQsXG59O1xuXG5jb25zdCBzdGRpb0xhdW5jaFdpdGhGb2xkZXI6IE1jcFNlcnZlckxhdW5jaCA9IHtcblx0dHlwZTogTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbyxcblx0Y29tbWFuZDogJ215LXNlcnZlcicsXG5cdGFyZ3M6IFsnLS1yb290JywgJyR7d29ya3NwYWNlRm9sZGVyfSddLFxuXHRlbnY6IHt9LFxuXHRlbnZGaWxlOiB1bmRlZmluZWQsXG5cdGN3ZDogdW5kZWZpbmVkLFxuXHRzYW5kYm94OiB1bmRlZmluZWQsXG59O1xuXG5jbGFzcyBGYWtlQnVuZGxlciB7XG5cdHJlYWRvbmx5IHJlY2VpdmVkOiBJU3luY2FibGVGaWxlW11bXSA9IFtdO1xuXHRyZWFkb25seSByZWNlaXZlZE1jcDogSVN5bmNhYmxlTWNwU2VydmVyW11bXSA9IFtdO1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9yZXN1bHQ6IHsgdXJpOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9IHwgdW5kZWZpbmVkID0geyB1cmk6ICdvcGVuLXBsdWdpbjovL2J1bmRsZScsIG5hbWU6ICdPcGVuIFBsdWdpbicgfSkgeyB9XG5cdGFzeW5jIGJ1bmRsZShmaWxlczogcmVhZG9ubHkgSVN5bmNhYmxlRmlsZVtdLCBtY3BTZXJ2ZXJzOiByZWFkb25seSBJU3luY2FibGVNY3BTZXJ2ZXJbXSA9IFtdKSB7XG5cdFx0dGhpcy5yZWNlaXZlZC5wdXNoKFsuLi5maWxlc10pO1xuXHRcdHRoaXMucmVjZWl2ZWRNY3AucHVzaChbLi4ubWNwU2VydmVyc10pO1xuXHRcdGlmICghdGhpcy5fcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyByZWY6IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogdGhpcy5fcmVzdWx0LnVyaSwgdXJpOiB0aGlzLl9yZXN1bHQudXJpIGFzIG5ldmVyLCBuYW1lOiB0aGlzLl9yZXN1bHQubmFtZSwgZW5hYmxlbWVudDogZ2xvYmFsRW5hYmxlbWVudCh0cnVlKSB9LCBwYXRoczogW10gfTtcblx0fVxufVxuXG5zdWl0ZSgncmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzIC0gYnVpbHQtaW4gc2tpbGxzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Bhc3NlcyBidWlsdC1pbiBza2lsbHMgdG8gdGhlIGJ1bmRsZXIgYXMgbG9vc2UgZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVpbHRpbiA9IFVSSS5maWxlKCcvYnVpbHRpbi9jcmVhdGUtcHIvU0tJTEwubWQnKTtcblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKFtcblx0XHRcdFtgJHtQcm9tcHRzVHlwZS5za2lsbH0vJHtCVUlMVElOX1NUT1JBR0V9YCwgW21ha2VQcm9tcHRQYXRoKGJ1aWx0aW4sIFByb21wdHNUeXBlLnNraWxsLCBCVUlMVElOX1NUT1JBR0UgYXMgdW5rbm93biBhcyBQcm9tcHRzU3RvcmFnZSldXSxcblx0XHRdKSk7XG5cdFx0Y29uc3QgYnVuZGxlciA9IG5ldyBGYWtlQnVuZGxlcigpO1xuXG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0cHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWFrZU1jcFNlcnZpY2UoKSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkWzBdLm1hcChmID0+ICh7IHVyaTogZi51cmkudG9TdHJpbmcoKSwgdHlwZTogZi50eXBlIH0pKSwgW1xuXHRcdFx0eyB1cmk6IGJ1aWx0aW4udG9TdHJpbmcoKSwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVmcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZzWzBdLm5hbWUsICdPcGVuIFBsdWdpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbWl0cyBkaXNhYmxlZCBidWlsdC1pbiBza2lsbHMgZnJvbSB0aGUgYnVuZGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVuYWJsZWQgPSBVUkkuZmlsZSgnL2J1aWx0aW4vY3JlYXRlLXByL1NLSUxMLm1kJyk7XG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBVUkkuZmlsZSgnL2J1aWx0aW4vbWVyZ2UvU0tJTEwubWQnKTtcblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKFtcblx0XHRcdFtgJHtQcm9tcHRzVHlwZS5za2lsbH0vJHtCVUlMVElOX1NUT1JBR0V9YCwgW1xuXHRcdFx0XHRtYWtlUHJvbXB0UGF0aChlbmFibGVkLCBQcm9tcHRzVHlwZS5za2lsbCwgQlVJTFRJTl9TVE9SQUdFIGFzIHVua25vd24gYXMgUHJvbXB0c1N0b3JhZ2UpLFxuXHRcdFx0XHRtYWtlUHJvbXB0UGF0aChkaXNhYmxlZCwgUHJvbXB0c1R5cGUuc2tpbGwsIEJVSUxUSU5fU1RPUkFHRSBhcyB1bmtub3duIGFzIFByb21wdHNTdG9yYWdlKSxcblx0XHRcdF1dLFxuXHRcdF0pKTtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cblx0XHRhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIobmV3IFNldChbZGlzYWJsZWQudG9TdHJpbmcoKV0pKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoKSxcblx0XHRcdG1ha2VNY3BTZXJ2aWNlKCksXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0YnVuZGxlciBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWRbMF0ubWFwKGYgPT4gZi51cmkudG9TdHJpbmcoKSksIFtlbmFibGVkLnRvU3RyaW5nKCldKTtcblx0fSk7XG5cblx0dGVzdCgnb21pdHMgYnVpbHQtaW4gc2tpbGxzIHRoZSB1c2VyIGRpc2FibGVkIGluIHRoZSBDdXN0b21pemF0aW9ucyBVSSBmcm9tIHRoZSBidW5kbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogdGhlIEVuYWJsZS9EaXNhYmxlIGFjdGlvbnMgd3JpdGUgdG8gYElQcm9tcHRzU2VydmljZWAsXG5cdFx0Ly8gbm90IHRvIHRoZSBwZXItaGFybmVzcyBzeW5jIHByb3ZpZGVyLCBzbyBhIHNraWxsIGRpc2FibGVkIGZyb20gdGhlIFVJXG5cdFx0Ly8gbXVzdCBzdGlsbCBiZSBkcm9wcGVkIGZyb20gdGhlIGJ1bmRsZSBzZW50IHRvIHRoZSBhZ2VudCBob3N0LlxuXHRcdGNvbnN0IGVuYWJsZWQgPSBVUkkuZmlsZSgnL2J1aWx0aW4vY3JlYXRlLXByL1NLSUxMLm1kJyk7XG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBVUkkuZmlsZSgnL2J1aWx0aW4vbWVyZ2UvU0tJTEwubWQnKTtcblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1ha2VQcm9tcHRzU2VydmljZShcblx0XHRcdG5ldyBNYXAoW1xuXHRcdFx0XHRbYCR7UHJvbXB0c1R5cGUuc2tpbGx9LyR7QlVJTFRJTl9TVE9SQUdFfWAsIFtcblx0XHRcdFx0XHRtYWtlUHJvbXB0UGF0aChlbmFibGVkLCBQcm9tcHRzVHlwZS5za2lsbCwgQlVJTFRJTl9TVE9SQUdFIGFzIHVua25vd24gYXMgUHJvbXB0c1N0b3JhZ2UpLFxuXHRcdFx0XHRcdG1ha2VQcm9tcHRQYXRoKGRpc2FibGVkLCBQcm9tcHRzVHlwZS5za2lsbCwgQlVJTFRJTl9TVE9SQUdFIGFzIHVua25vd24gYXMgUHJvbXB0c1N0b3JhZ2UpLFxuXHRcdFx0XHRdXSxcblx0XHRcdF0pLFxuXHRcdFx0bmV3IE1hcChbW1Byb21wdHNUeXBlLnNraWxsLCBuZXcgUmVzb3VyY2VTZXQoW2Rpc2FibGVkXSldXSksXG5cdFx0KTtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cblx0XHRhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoKSxcblx0XHRcdG1ha2VNY3BTZXJ2aWNlKCksXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0YnVuZGxlciBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWRbMF0ubWFwKGYgPT4gZi51cmkudG9TdHJpbmcoKSksIFtlbmFibGVkLnRvU3RyaW5nKCldKTtcblx0fSk7XG5cblx0dGVzdCgnY29tYmluZXMgYnVpbHQtaW4gc2tpbGxzIHdpdGggdXNlciBmaWxlcyBpbiBhIHNpbmdsZSBidW5kbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXNlckFnZW50ID0gVVJJLmZpbGUoJy91c2VyL2FnZW50cy9mb28uYWdlbnQubWQnKTtcblx0XHRjb25zdCBidWlsdGluID0gVVJJLmZpbGUoJy9idWlsdGluL21lcmdlL1NLSUxMLm1kJyk7XG5cdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRbYCR7UHJvbXB0c1R5cGUuYWdlbnR9LyR7UHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9ufWAsIFttYWtlUHJvbXB0UGF0aCh1c2VyQWdlbnQsIFByb21wdHNUeXBlLmFnZW50LCBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pXV0sXG5cdFx0XHRbYCR7UHJvbXB0c1R5cGUuc2tpbGx9LyR7QlVJTFRJTl9TVE9SQUdFfWAsIFttYWtlUHJvbXB0UGF0aChidWlsdGluLCBQcm9tcHRzVHlwZS5za2lsbCwgQlVJTFRJTl9TVE9SQUdFIGFzIHVua25vd24gYXMgUHJvbXB0c1N0b3JhZ2UpXV0sXG5cdFx0XSkpO1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblxuXHRcdGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0cHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWFrZU1jcFNlcnZpY2UoKSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGJ1bmRsZXIucmVjZWl2ZWRbMF0ubWFwKGYgPT4gKHsgdXJpOiBmLnVyaS50b1N0cmluZygpLCB0eXBlOiBmLnR5cGUgfSkpLnNvcnQoKGEsIGIpID0+IGEudXJpLmxvY2FsZUNvbXBhcmUoYi51cmkpKSxcblx0XHRcdFtcblx0XHRcdFx0eyB1cmk6IGJ1aWx0aW4udG9TdHJpbmcoKSwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwgfSxcblx0XHRcdFx0eyB1cmk6IHVzZXJBZ2VudC50b1N0cmluZygpLCB0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCB9LFxuXHRcdFx0XS5zb3J0KChhLCBiKSA9PiBhLnVyaS5sb2NhbGVDb21wYXJlKGIudXJpKSksXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZXMgZW5hYmxlZCB1c2VyIGZpbGVzIG9ubHkgd2hlbiB1c2VyIHN0b3JhZ2UgaXMgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbmFibGVkID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvLmNvcGlsb3QvaW5zdHJ1Y3Rpb25zL2VuYWJsZWQuaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci8uY2xhdWRlL3J1bGVzL2Rpc2FibGVkLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoW1xuXHRcdFx0W2Ake1Byb21wdHNUeXBlLmluc3RydWN0aW9uc30vJHtQcm9tcHRzU3RvcmFnZS51c2VyfWAsIFtcblx0XHRcdFx0bWFrZVByb21wdFBhdGgoZW5hYmxlZCwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBQcm9tcHRzU3RvcmFnZS51c2VyKSxcblx0XHRcdFx0bWFrZVByb21wdFBhdGgoZGlzYWJsZWQsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgUHJvbXB0c1N0b3JhZ2UudXNlciksXG5cdFx0XHRdXSxcblx0XHRdKSk7XG5cdFx0Y29uc3Qgc3luY1Byb3ZpZGVyID0gbmV3IEZha2VTeW5jUHJvdmlkZXIobmV3IFNldChbZGlzYWJsZWQudG9TdHJpbmcoKV0pKTtcblx0XHRjb25zdCBsb2NhbEJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblx0XHRjb25zdCByZW1vdGVCdW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cblx0XHRhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0c3luY1Byb3ZpZGVyLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWFrZU1jcFNlcnZpY2UoKSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRsb2NhbEJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXHRcdGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0cHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRzeW5jUHJvdmlkZXIsXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKCksXG5cdFx0XHRtYWtlTWNwU2VydmljZSgpLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdHJlbW90ZUJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHsgaW5jbHVkZVVzZXJTdG9yYWdlOiB0cnVlIH0sXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bG9jYWw6IGxvY2FsQnVuZGxlci5yZWNlaXZlZCxcblx0XHRcdHJlbW90ZTogcmVtb3RlQnVuZGxlci5yZWNlaXZlZFswXS5tYXAoZmlsZSA9PiAoeyB1cmk6IGZpbGUudXJpLnRvU3RyaW5nKCksIHNvdXJjZTogZmlsZS5zb3VyY2UgfSkpLFxuXHRcdH0sIHtcblx0XHRcdGxvY2FsOiBbXSxcblx0XHRcdHJlbW90ZTogW3sgdXJpOiBlbmFibGVkLnRvU3RyaW5nKCksIHNvdXJjZTogUHJvbXB0c1N0b3JhZ2UudXNlciB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgYnVuZGxlciBjYWxsIGVudGlyZWx5IHdoZW4gb25seSBkaXNhYmxlZCBidWlsdC1pbnMgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVpbHRpbiA9IFVSSS5maWxlKCcvYnVpbHRpbi9jcmVhdGUtcHIvU0tJTEwubWQnKTtcblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKFtcblx0XHRcdFtgJHtQcm9tcHRzVHlwZS5za2lsbH0vJHtCVUlMVElOX1NUT1JBR0V9YCwgW21ha2VQcm9tcHRQYXRoKGJ1aWx0aW4sIFByb21wdHNUeXBlLnNraWxsLCBCVUlMVElOX1NUT1JBR0UgYXMgdW5rbm93biBhcyBQcm9tcHRzU3RvcmFnZSldXSxcblx0XHRdKSk7XG5cdFx0Y29uc3QgYnVuZGxlciA9IG5ldyBGYWtlQnVuZGxlcigpO1xuXG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0cHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcihuZXcgU2V0KFtidWlsdGluLnRvU3RyaW5nKCldKSksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKCksXG5cdFx0XHRtYWtlTWNwU2VydmljZSgpLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdGJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWQubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZXMgcGx1Z2lucyB0aGF0IG9ubHkgY29udHJpYnV0ZSBNQ1Agc2VydmVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvbWNwLW9ubHknKTtcblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKCkpO1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblxuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoW21ha2VQbHVnaW4ocGx1Z2luVXJpLCB7IGxhYmVsOiAnTUNQIE9ubHknLCBtY3BTZXJ2ZXJzOiAxIH0pXSksXG5cdFx0XHRtYWtlTWNwU2VydmljZSgpLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdGJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWQubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZnMubWFwKHIgPT4gKHsgdXJpOiByLnVyaSwgbmFtZTogci5uYW1lIH0pKSwgW1xuXHRcdFx0eyB1cmk6IHBsdWdpblVyaS50b1N0cmluZygpLCBuYW1lOiAnTUNQIE9ubHknIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIHBsdWdpbnMgZGlzY292ZXJlZCB0aHJvdWdoIHRoZWlyIGFnZW50cyBiZWZvcmUgcHJvbXB0LWZpbGUgaHlkcmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpblVyaSA9IFVSSS5maWxlKCcvcGx1Z2lucy9hZ2VudC1vbmx5Jyk7XG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZShbbWFrZVBsdWdpbihwbHVnaW5VcmksIHsgbGFiZWw6ICdBZ2VudCBPbmx5JywgYWdlbnRzOiAxIH0pXSksXG5cdFx0XHRtYWtlTWNwU2VydmljZSgpLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdG5ldyBGYWtlQnVuZGxlcigpIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVmcy5tYXAocmVmID0+ICh7IHVyaTogcmVmLnVyaSwgbmFtZTogcmVmLm5hbWUgfSkpLCBbXG5cdFx0XHR7IHVyaTogcGx1Z2luVXJpLnRvU3RyaW5nKCksIG5hbWU6ICdBZ2VudCBPbmx5JyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwdWJsaXNoZXMgZGlzYWJsZWQgTUNQLW9ubHkgcGx1Z2lucyB3aXRoIGFuIGV4cGxpY2l0IGdsb2JhbCBkZWNpc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvbWNwLWRpc2FibGVkJyk7XG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZShbbWFrZVBsdWdpbihwbHVnaW5VcmksIHsgZW5hYmxlZDogZmFsc2UsIG1jcFNlcnZlcnM6IDEgfSldLCBuZXcgTWFwKFtbcGx1Z2luVXJpLnRvU3RyaW5nKCksIGZhbHNlXV0pKSxcblx0XHRcdG1ha2VNY3BTZXJ2aWNlKCksXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0bmV3IEZha2VCdW5kbGVyKCkgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVmcy5tYXAocmVmID0+IHJlZi5lbmFibGVtZW50KSwgW2dsb2JhbEVuYWJsZW1lbnQoZmFsc2UpXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3B1Ymxpc2hlcyBkaXNhYmxlZCBwbHVnaW5zIHdpdGggYWdlbnQgY29udHJpYnV0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvYWdlbnQtZGlzYWJsZWQnKTtcblx0XHRjb25zdCBwcm9tcHRGaWxlID0gVVJJLmZpbGUoJy9wbHVnaW5zL2FnZW50LWRpc2FibGVkL2FnZW50cy9mb28uYWdlbnQubWQnKTtcblx0XHRjb25zdCByZWZzID0gYXdhaXQgcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzKFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKCksXG5cdFx0XHRtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRcdFtgJHtQcm9tcHRzVHlwZS5hZ2VudH0vJHtQcm9tcHRzU3RvcmFnZS5wbHVnaW59YCwgW21ha2VQcm9tcHRQYXRoKHByb21wdEZpbGUsIFByb21wdHNUeXBlLmFnZW50LCBQcm9tcHRzU3RvcmFnZS5wbHVnaW4pXV0sXG5cdFx0XHRdKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZShbbWFrZVBsdWdpbihwbHVnaW5VcmksIHsgZW5hYmxlZDogZmFsc2UgfSldLCBuZXcgTWFwKFtbcGx1Z2luVXJpLnRvU3RyaW5nKCksIGZhbHNlXV0pKSxcblx0XHRcdG1ha2VNY3BTZXJ2aWNlKCksXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0bmV3IEZha2VCdW5kbGVyKCkgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVmcy5tYXAocmVmID0+IHJlZi5lbmFibGVtZW50KSwgW2dsb2JhbEVuYWJsZW1lbnQoZmFsc2UpXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3B1Ymxpc2hlcyBNQ1Atb25seSBwbHVnaW5zIHJlZ2FyZGxlc3Mgb2YgdGhlIHJlbW92ZWQgcGx1Z2luIHN5bmMgb3B0LW91dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvbWNwLW9wdGVkLW91dCcpO1xuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKCkpLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIobmV3IFNldChbcGx1Z2luVXJpLnRvU3RyaW5nKCldKSksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKFttYWtlUGx1Z2luKHBsdWdpblVyaSwgeyBtY3BTZXJ2ZXJzOiAxIH0pXSksXG5cdFx0XHRtYWtlTWNwU2VydmljZSgpLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdG5ldyBGYWtlQnVuZGxlcigpIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZnMubWFwKHJlZiA9PiByZWYuZW5hYmxlbWVudCksIFtnbG9iYWxFbmFibGVtZW50KHRydWUpXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGR1cGxpY2F0ZSBhIHBsdWdpbiB0aGF0IGNvbnRyaWJ1dGVzIGJvdGggcHJvbXB0IGZpbGVzIGFuZCBNQ1Agc2VydmVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvY29tYmluZWQnKTtcblx0XHRjb25zdCBwcm9tcHRGaWxlID0gVVJJLmZpbGUoJy9wbHVnaW5zL2NvbWJpbmVkL3NraWxscy9mb28uc2tpbGwubWQnKTtcblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKFtcblx0XHRcdFtgJHtQcm9tcHRzVHlwZS5za2lsbH0vJHtQcm9tcHRzU3RvcmFnZS5wbHVnaW59YCwgW21ha2VQcm9tcHRQYXRoKHByb21wdEZpbGUsIFByb21wdHNUeXBlLnNraWxsLCBQcm9tcHRzU3RvcmFnZS5wbHVnaW4pXV0sXG5cdFx0XSkpO1xuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoW21ha2VQbHVnaW4ocGx1Z2luVXJpLCB7IGxhYmVsOiAnQ29tYmluZWQnLCBtY3BTZXJ2ZXJzOiAyIH0pXSksXG5cdFx0XHRtYWtlTWNwU2VydmljZSgpLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdG5ldyBGYWtlQnVuZGxlcigpIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZnMubWFwKHIgPT4gci51cmkpLCBbcGx1Z2luVXJpLnRvU3RyaW5nKCldKTtcblx0fSk7XG5cblx0dGVzdCgnd2UgaG9ub3IgdGhlIGNhbmNlbGxhdGlvbiB0b2tlbiBjb250cmFjdCBieSBwYXNzaW5nIGl0IHRocm91Z2ggdG8gbGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZScsIGFzeW5jICgpID0+IHtcblx0XHQvLyByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMgdXNlcyBgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZWAsIHNvIHdlIGp1c3Rcblx0XHQvLyBhc3NlcnQgdGhhdCBjYWxsaW5nIGl0IGRvZXMgbm90IHRocm93IGFuZCB0aGUgY2FsbCBzdGlsbCByZXNvbHZlcy5cblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKCkpO1xuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoKSxcblx0XHRcdG1ha2VNY3BTZXJ2aWNlKCksXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0bmV3IEZha2VCdW5kbGVyKCkgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVmcywgW10pO1xuXHRcdC8vIFVzZSBDYW5jZWxsYXRpb25Ub2tlbiBzbyB0aGUgaW1wb3J0IGlzbid0IGRlYWQgaW4gdGhlIGJ1bmRsZS5cblx0XHRhc3NlcnQub2soQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZS5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCA9PT0gZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdidW5kbGVzIE1DUCBzZXJ2ZXJzIGNvbmZpZ3VyZWQgZGlyZWN0bHkgaW4gVlMgQ29kZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG1ha2VNY3BTZXJ2aWNlKFtcblx0XHRcdG1ha2VNY3BTZXJ2ZXIoeyBpZDogJ3VzZXIubXktc2VydmVyJywgY29sbGVjdGlvbklkOiAndXNlcicsIGxhYmVsOiAnbXktc2VydmVyJywgbGF1bmNoOiBzdGRpb0xhdW5jaCB9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKCkpLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoKSxcblx0XHRcdG1jcFNlcnZpY2UsXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0YnVuZGxlciBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZE1jcFswXSwgW1xuXHRcdFx0eyBuYW1lOiAnbXktc2VydmVyJywgY29uZmlndXJhdGlvbjogeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAnbXktc2VydmVyJywgYXJnczogWyctLWZsYWcnXSwgZW52OiB1bmRlZmluZWQsIGVudkZpbGU6IHVuZGVmaW5lZCwgY3dkOiB1bmRlZmluZWQgfSwgZW5hYmxlbWVudDogZ2xvYmFsRW5hYmxlbWVudCh0cnVlKSB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnNbMF0ubmFtZSwgJ09wZW4gUGx1Z2luJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHRoZSBDb3BpbG90IENoYXQgR2l0SHViIE1DUCBwcm92aWRlciB3aXRob3V0IGV4Y2x1ZGluZyB1c2VyIG9yIG90aGVyIGV4dGVuc2lvbiBzZXJ2ZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbWFrZU1jcFNlcnZpY2UoW1xuXHRcdFx0bWFrZUNvcGlsb3RDaGF0R2l0SHViTWNwU2VydmVyKCksXG5cdFx0XHRtYWtlTWNwU2VydmVyKHsgaWQ6ICd1c2VyLkdpdEh1YicsIGNvbGxlY3Rpb25JZDogJ3VzZXInLCBsYWJlbDogJ0dpdEh1YicsIGxhdW5jaDogc3RkaW9MYXVuY2ggfSksXG5cdFx0XHRtYWtlTWNwU2VydmVyKHtcblx0XHRcdFx0aWQ6ICdwdWJsaXNoZXIuZXh0ZW5zaW9uL3NlcnZlcicsXG5cdFx0XHRcdGNvbGxlY3Rpb25JZDogJ3B1Ymxpc2hlci5leHRlbnNpb24vcHJvdmlkZXInLFxuXHRcdFx0XHRsYWJlbDogJ2V4dGVuc2lvbi1zZXJ2ZXInLFxuXHRcdFx0XHRsYXVuY2g6IHN0ZGlvTGF1bmNoLFxuXHRcdFx0XHRjb2xsZWN0aW9uU291cmNlOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigncHVibGlzaGVyLmV4dGVuc2lvbicpLFxuXHRcdFx0fSksXG5cdFx0XSk7XG5cblx0XHRhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKCkpLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoKSxcblx0XHRcdG1jcFNlcnZpY2UsXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0YnVuZGxlciBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0J2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0XHRmYWxzZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkTWNwLCBbW1xuXHRcdFx0eyBuYW1lOiAnR2l0SHViJywgY29uZmlndXJhdGlvbjogeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAnbXktc2VydmVyJywgYXJnczogWyctLWZsYWcnXSwgZW52OiB1bmRlZmluZWQsIGVudkZpbGU6IHVuZGVmaW5lZCwgY3dkOiB1bmRlZmluZWQgfSwgZW5hYmxlbWVudDogZ2xvYmFsRW5hYmxlbWVudCh0cnVlKSB9LFxuXHRcdFx0eyBuYW1lOiAnZXh0ZW5zaW9uLXNlcnZlcicsIGNvbmZpZ3VyYXRpb246IHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ215LXNlcnZlcicsIGFyZ3M6IFsnLS1mbGFnJ10sIGVudjogdW5kZWZpbmVkLCBlbnZGaWxlOiB1bmRlZmluZWQsIGN3ZDogdW5kZWZpbmVkIH0sIGVuYWJsZW1lbnQ6IGdsb2JhbEVuYWJsZW1lbnQodHJ1ZSkgfSxcblx0XHRdXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHRoZSBDb3BpbG90IENoYXQgR2l0SHViIE1DUCBwcm92aWRlciBmcm9tIHJlbW90ZSBDb3BpbG90IGFnZW50IGhvc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblxuXHRcdGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWFrZU1jcFNlcnZpY2UoW21ha2VDb3BpbG90Q2hhdEdpdEh1Yk1jcFNlcnZlcigpXSksXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0YnVuZGxlciBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0J3JlbW90ZS10ZXN0LWNvcGlsb3RjbGknLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZE1jcCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRhaW5zIHRoZSBDb3BpbG90IENoYXQgR2l0SHViIE1DUCBwcm92aWRlciBmb3IgYWdlbnQgaG9zdHMgd2l0aG91dCBhIGJ1aWx0LWluIHNlcnZlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cblx0XHRhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKCkpLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoKSxcblx0XHRcdG1ha2VNY3BTZXJ2aWNlKFttYWtlQ29waWxvdENoYXRHaXRIdWJNY3BTZXJ2ZXIoKV0pLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdGJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdCdhZ2VudC1ob3N0LWNsYXVkZScsXG5cdFx0XHRmYWxzZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkTWNwLCBbW1xuXHRcdFx0eyBuYW1lOiAnR2l0SHViJywgY29uZmlndXJhdGlvbjogeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAnbXktc2VydmVyJywgYXJnczogWyctLWZsYWcnXSwgZW52OiB1bmRlZmluZWQsIGVudkZpbGU6IHVuZGVmaW5lZCwgY3dkOiB1bmRlZmluZWQgfSwgZW5hYmxlbWVudDogZ2xvYmFsRW5hYmxlbWVudCh0cnVlKSB9LFxuXHRcdF1dKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgcGx1Z2luLXNvdXJjZWQgTUNQIHNlcnZlcnMgZnJvbSB0aGUgYnVuZGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbWFrZU1jcFNlcnZpY2UoW1xuXHRcdFx0bWFrZU1jcFNlcnZlcih7IGlkOiAncGx1Z2luLmZvby5zcnYnLCBjb2xsZWN0aW9uSWQ6ICdwbHVnaW4uZmlsZTovLy9wbHVnaW5zL2ZvbycsIGxhYmVsOiAnc3J2JywgbGF1bmNoOiBzdGRpb0xhdW5jaCB9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKCkpLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoKSxcblx0XHRcdG1jcFNlcnZpY2UsXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0YnVuZGxlciBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdCk7XG5cblx0XHQvLyBObyBsb29zZSBmaWxlcyBhbmQgbm8gbm9uLXBsdWdpbiBNQ1Agc2VydmVyczogYnVuZGxlciBpcyBuZXZlciBjYWxsZWQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWQubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncHVibGlzaGVzIGRpc2FibGVkIE1DUCBzZXJ2ZXJzIHdpdGggYW4gZXhwbGljaXQgZ2xvYmFsIGRlY2lzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbWFrZU1jcFNlcnZpY2UoW1xuXHRcdFx0bWFrZU1jcFNlcnZlcih7IGlkOiAndXNlci5vZmYnLCBjb2xsZWN0aW9uSWQ6ICd1c2VyJywgbGFiZWw6ICdvZmYnLCBlbmFibGVkOiBmYWxzZSwgbGF1bmNoOiBzdGRpb0xhdW5jaCB9KSxcblx0XHRdLCBuZXcgTWFwKFtbJ3VzZXIub2ZmJywgZmFsc2VdXSkpO1xuXG5cdFx0YXdhaXQgcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzKFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKCksXG5cdFx0XHRtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcCgpKSxcblx0XHRcdG5ldyBGYWtlU3luY1Byb3ZpZGVyKCksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKCksXG5cdFx0XHRtY3BTZXJ2aWNlLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdGJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkTWNwWzBdLCBbXG5cdFx0XHR7IG5hbWU6ICdvZmYnLCBjb25maWd1cmF0aW9uOiB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICdteS1zZXJ2ZXInLCBhcmdzOiBbJy0tZmxhZyddLCBlbnY6IHVuZGVmaW5lZCwgZW52RmlsZTogdW5kZWZpbmVkLCBjd2Q6IHVuZGVmaW5lZCB9LCBlbmFibGVtZW50OiBnbG9iYWxFbmFibGVtZW50KGZhbHNlKSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwdWJsaXNoZXMgcHJvZmlsZSBlbmFibGVtZW50IGRlc3BpdGUgYSBWUyBDb2RlIHdvcmtzcGFjZSBvdmVycmlkZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvd29ya3NwYWNlLWRpc2FibGVkJyk7XG5cdFx0Y29uc3QgcGx1Z2luID0gbWFrZVBsdWdpbihwbHVnaW5VcmksIHsgbWNwU2VydmVyczogMSwgZW5hYmxlbWVudDogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlIH0pO1xuXHRcdGNvbnN0IHNlcnZlciA9IG1ha2VNY3BTZXJ2ZXIoeyBpZDogJ3VzZXIud29ya3NwYWNlLWRpc2FibGVkJywgY29sbGVjdGlvbklkOiAndXNlcicsIGxhYmVsOiAnd29ya3NwYWNlLWRpc2FibGVkJywgZW5hYmxlbWVudDogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlLCBsYXVuY2g6IHN0ZGlvTGF1bmNoIH0pO1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblxuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKCkpLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoW3BsdWdpbl0sIG5ldyBNYXAoW1twbHVnaW5VcmkudG9TdHJpbmcoKSwgdHJ1ZV1dKSksXG5cdFx0XHRtYWtlTWNwU2VydmljZShbc2VydmVyXSwgbmV3IE1hcChbWyd1c2VyLndvcmtzcGFjZS1kaXNhYmxlZCcsIHRydWVdXSkpLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdGJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWZzLm1hcChyZWYgPT4gcmVmLmVuYWJsZW1lbnQpLCBbZ2xvYmFsRW5hYmxlbWVudCh0cnVlKSwgZ2xvYmFsRW5hYmxlbWVudCh0cnVlKV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZE1jcFswXS5tYXAoZW50cnkgPT4gZW50cnkuZW5hYmxlbWVudCksIFtnbG9iYWxFbmFibGVtZW50KHRydWUpXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHdvcmtzcGFjZS1kaXNjb3ZlcmVkIGAubWNwLmpzb25gIHNlcnZlcnMgKHRoZSBhZ2VudCBob3N0IGRpc2NvdmVycyB0aG9zZSBpdHNlbGYpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbWFrZU1jcFNlcnZpY2UoW1xuXHRcdFx0bWFrZU1jcFNlcnZlcih7IGlkOiAnd3Nkb3Quc3J2JywgY29sbGVjdGlvbklkOiAnd29ya3NwYWNlLWRvdC1tY3AuMCcsIGxhYmVsOiAnc3J2JywgbGF1bmNoOiBzdGRpb0xhdW5jaCwgY29uZmlnVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIgfSksXG5cdFx0XSk7XG5cblx0XHRhd2FpdCByZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoKSxcblx0XHRcdG1ha2VQcm9tcHRzU2VydmljZShuZXcgTWFwKCkpLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoKSxcblx0XHRcdG1jcFNlcnZpY2UsXG5cdFx0XHRtYWtlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSgpLFxuXHRcdFx0YnVuZGxlciBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZC5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdleGNsdWRlcyBgLmNvZGUtd29ya3NwYWNlYCBjb25maWd1cmVkIHNlcnZlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IG5ldyBGYWtlQnVuZGxlcigpO1xuXHRcdGNvbnN0IG1jcFNlcnZpY2UgPSBtYWtlTWNwU2VydmljZShbXG5cdFx0XHRtYWtlTWNwU2VydmVyKHsgaWQ6ICd3c2NmZy5zcnYnLCBjb2xsZWN0aW9uSWQ6ICdtY3AuY29uZmlnLndvcmtzcGFjZScsIGxhYmVsOiAnc3J2JywgbGF1bmNoOiBzdGRpb0xhdW5jaCwgY29uZmlnVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSB9KSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWNwU2VydmljZSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIHdvcmtzcGFjZS1kaXNjb3ZlcmVkIGAubWNwLmpzb25gIHNlcnZlcnMgd2hlbiBpbmNsdWRlV29ya3NwYWNlRG90TWNwIGlzIHNldCAobXVsdGktcm9vdCBnYXRlKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG1ha2VNY3BTZXJ2aWNlKFtcblx0XHRcdG1ha2VNY3BTZXJ2ZXIoeyBpZDogJ3dzZG90LnNydicsIGNvbGxlY3Rpb25JZDogJ3dvcmtzcGFjZS1kb3QtbWNwLjAnLCBsYWJlbDogJ3NydicsIGxhdW5jaDogc3RkaW9MYXVuY2gsIGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIH0pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWNwU2VydmljZSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWRNY3BbMF0sIFtcblx0XHRcdHsgbmFtZTogJ3NydicsIGNvbmZpZ3VyYXRpb246IHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ215LXNlcnZlcicsIGFyZ3M6IFsnLS1mbGFnJ10sIGVudjogdW5kZWZpbmVkLCBlbnZGaWxlOiB1bmRlZmluZWQsIGN3ZDogdW5kZWZpbmVkIH0sIGVuYWJsZW1lbnQ6IGdsb2JhbEVuYWJsZW1lbnQodHJ1ZSkgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVmcy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGlsbCBleGNsdWRlcyBgLmNvZGUtd29ya3NwYWNlYCBzZXJ2ZXJzIGV2ZW4gd2hlbiBpbmNsdWRlV29ya3NwYWNlRG90TWNwIGlzIHNldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG1ha2VNY3BTZXJ2aWNlKFtcblx0XHRcdG1ha2VNY3BTZXJ2ZXIoeyBpZDogJ3dzY2ZnLnNydicsIGNvbGxlY3Rpb25JZDogJ21jcC5jb25maWcud29ya3NwYWNlJywgbGFiZWw6ICdzcnYnLCBsYXVuY2g6IHN0ZGlvTGF1bmNoLCBjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFIH0pLFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzKFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKCksXG5cdFx0XHRtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcCgpKSxcblx0XHRcdG5ldyBGYWtlU3luY1Byb3ZpZGVyKCksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKCksXG5cdFx0XHRtY3BTZXJ2aWNlLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdGJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHR0cnVlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZC5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jcyBgLnZzY29kZS9tY3AuanNvbmAgc2VydmVycyB0aGF0IHJlc29sdmUgd2l0aG91dCB1c2VyIGludGVyYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBuZXcgRmFrZUJ1bmRsZXIoKTtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbWFrZU1jcFNlcnZpY2UoW1xuXHRcdFx0bWFrZU1jcFNlcnZlcih7IGlkOiAnbWNwLmNvbmZpZy53czAubXktc2VydmVyJywgY29sbGVjdGlvbklkOiAnbWNwLmNvbmZpZy53czAnLCBsYWJlbDogJ215LXNlcnZlcicsIGxhdW5jaDogc3RkaW9MYXVuY2gsIGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIH0pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWNwU2VydmljZSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkTWNwWzBdLCBbXG5cdFx0XHR7IG5hbWU6ICdteS1zZXJ2ZXInLCBjb25maWd1cmF0aW9uOiB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICdteS1zZXJ2ZXInLCBhcmdzOiBbJy0tZmxhZyddLCBlbnY6IHVuZGVmaW5lZCwgZW52RmlsZTogdW5kZWZpbmVkLCBjd2Q6IHVuZGVmaW5lZCB9LCBlbmFibGVtZW50OiBnbG9iYWxFbmFibGVtZW50KHRydWUpIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVmc1swXS5uYW1lLCAnT3BlbiBQbHVnaW4nKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgYC52c2NvZGUvbWNwLmpzb25gIHNlcnZlcnMgd2l0aCB2YXJpYWJsZXMgdGhhdCByZXF1aXJlIGludGVyYWN0aW9uIChlLmcuICR7aW5wdXQ6XHUyMDI2fSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IG5ldyBGYWtlQnVuZGxlcigpO1xuXHRcdGNvbnN0IG1jcFNlcnZpY2UgPSBtYWtlTWNwU2VydmljZShbXG5cdFx0XHRtYWtlTWNwU2VydmVyKHsgaWQ6ICdtY3AuY29uZmlnLndzMC5uZWVkcy1pbnB1dCcsIGNvbGxlY3Rpb25JZDogJ21jcC5jb25maWcud3MwJywgbGFiZWw6ICduZWVkcy1pbnB1dCcsIGxhdW5jaDogc3RkaW9MYXVuY2hXaXRoSW5wdXQsIGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIH0pLFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzKFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKCksXG5cdFx0XHRtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcCgpKSxcblx0XHRcdG5ldyBGYWtlU3luY1Byb3ZpZGVyKCksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKCksXG5cdFx0XHRtY3BTZXJ2aWNlLFxuXHRcdFx0bWFrZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UoKSxcblx0XHRcdGJ1bmRsZXIgYXMgdW5rbm93biBhcyBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlcixcblx0XHRcdFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bmRsZXIucmVjZWl2ZWQubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc3luY3MgYC52c2NvZGUvbWNwLmpzb25gIHNlcnZlcnMgYWZ0ZXIgcmVzb2x2aW5nIG5vbi1pbnRlcmFjdGl2ZSB2YXJpYWJsZXMgKGUuZy4gJHt3b3Jrc3BhY2VGb2xkZXJ9KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG1ha2VNY3BTZXJ2aWNlKFtcblx0XHRcdG1ha2VNY3BTZXJ2ZXIoeyBpZDogJ21jcC5jb25maWcud3MwLmZvbGRlcicsIGNvbGxlY3Rpb25JZDogJ21jcC5jb25maWcud3MwJywgbGFiZWw6ICdmb2xkZXItc2VydmVyJywgbGF1bmNoOiBzdGRpb0xhdW5jaFdpdGhGb2xkZXIsIGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIH0pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWNwU2VydmljZSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKHsgJyR7d29ya3NwYWNlRm9sZGVyfSc6ICcvd3MnIH0pLFxuXHRcdFx0YnVuZGxlciBhcyB1bmtub3duIGFzIFN5bmNlZEN1c3RvbWl6YXRpb25CdW5kbGVyLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVuZGxlci5yZWNlaXZlZE1jcFswXSwgW1xuXHRcdFx0eyBuYW1lOiAnZm9sZGVyLXNlcnZlcicsIGNvbmZpZ3VyYXRpb246IHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ215LXNlcnZlcicsIGFyZ3M6IFsnLS1yb290JywgJy93cyddLCBlbnY6IHVuZGVmaW5lZCwgZW52RmlsZTogdW5kZWZpbmVkLCBjd2Q6IHVuZGVmaW5lZCB9LCBlbmFibGVtZW50OiBnbG9iYWxFbmFibGVtZW50KHRydWUpIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgYC52c2NvZGUvbWNwLmpzb25gIHNlcnZlcnMgd2hlbiB2YXJpYWJsZSByZXNvbHV0aW9uIHRocm93cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBidW5kbGVyID0gbmV3IEZha2VCdW5kbGVyKCk7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG1ha2VNY3BTZXJ2aWNlKFtcblx0XHRcdG1ha2VNY3BTZXJ2ZXIoeyBpZDogJ21jcC5jb25maWcud3MwLmZvbGRlcicsIGNvbGxlY3Rpb25JZDogJ21jcC5jb25maWcud3MwJywgbGFiZWw6ICdmb2xkZXItc2VydmVyJywgbGF1bmNoOiBzdGRpb0xhdW5jaFdpdGhGb2xkZXIsIGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIH0pLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHRocm93aW5nUmVzb2x2ZXIgPSB7XG5cdFx0XHRhc3luYyByZXNvbHZlQXN5bmMoKSB7IHRocm93IG5ldyBFcnJvcignbm8gd29ya3NwYWNlIGZvbGRlcicpOyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZTtcblxuXHRcdGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWNwU2VydmljZSxcblx0XHRcdHRocm93aW5nUmVzb2x2ZXIsXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0aWxsIHN5bmNzIGV4dGVuc2lvbi1jb250cmlidXRlZCBzZXJ2ZXJzICh3b3Jrc3BhY2Ugc2NvcGUsIHVzZXIgY29uZmlnIHRhcmdldCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYnVuZGxlciA9IG5ldyBGYWtlQnVuZGxlcigpO1xuXHRcdGNvbnN0IG1jcFNlcnZpY2UgPSBtYWtlTWNwU2VydmljZShbXG5cdFx0XHRtYWtlTWNwU2VydmVyKHsgaWQ6ICdleHQuZm9vLnNydicsIGNvbGxlY3Rpb25JZDogJ2V4dC5mb28nLCBsYWJlbDogJ3NydicsIGxhdW5jaDogc3RkaW9MYXVuY2gsIGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSIH0pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlc29sdmVDdXN0b21pemF0aW9uUmVmcyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoKSksXG5cdFx0XHRuZXcgRmFrZVN5bmNQcm92aWRlcigpLFxuXHRcdFx0bWFrZUFnZW50UGx1Z2luU2VydmljZSgpLFxuXHRcdFx0bWNwU2VydmljZSxcblx0XHRcdG1ha2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKCksXG5cdFx0XHRidW5kbGVyIGFzIHVua25vd24gYXMgU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIsXG5cdFx0XHRTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidW5kbGVyLnJlY2VpdmVkTWNwWzBdLm1hcChzID0+IHMubmFtZSksIFsnc3J2J10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWZzLmxlbmd0aCwgMSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdyZXNvbHZlTG9jYWxDdXN0b21BZ2VudHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncGFyc2VzIGFnZW50IGZyb250bWF0dGVyIGZvciB0aGUgcHJlLXNlc3Npb24gcGlja2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpblVyaSA9IFVSSS5maWxlKCcvcGx1Z2lucy9naXRodWItaW5ib3gnKTtcblx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5qb2luUGF0aChwbHVnaW5VcmksICdhZ2VudHMnLCAnaW5ib3guYWdlbnQubWQnKTtcblx0XHRjb25zdCBwbHVnaW4gPSB7XG5cdFx0XHQuLi5tYWtlUGx1Z2luKHBsdWdpblVyaSksXG5cdFx0XHRhZ2VudHM6IG9ic2VydmFibGVWYWx1ZSgnYWdlbnRzJywgW3sgdXJpOiBhZ2VudFVyaSwgbmFtZTogJ2luYm94LmFnZW50JyB9XSksXG5cdFx0fSBhcyBJQWdlbnRQbHVnaW47XG5cblx0XHRjb25zdCBhZ2VudHMgPSBhd2FpdCByZXNvbHZlTG9jYWxDdXN0b21BZ2VudHMoXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UobmV3IE1hcCgpLCBuZXcgTWFwKFtbYWdlbnRVcmkudG9TdHJpbmcoKSwgW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IEluYm94Jyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUcmlhZ2UgR2l0SHViIG5vdGlmaWNhdGlvbnMnLFxuXHRcdFx0XHQndXNlci1pbnZvY2FibGU6IGZhbHNlJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdBZ2VudCBpbnN0cnVjdGlvbnMnLFxuXHRcdFx0XS5qb2luKCdcXG4nKV1dKSksXG5cdFx0XHRtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRcdFtgJHtQcm9tcHRzVHlwZS5hZ2VudH0vJHtQcm9tcHRzU3RvcmFnZS5wbHVnaW59YCwgW21ha2VQcm9tcHRQYXRoKGFnZW50VXJpLCBQcm9tcHRzVHlwZS5hZ2VudCwgUHJvbXB0c1N0b3JhZ2UucGx1Z2luKV1dLFxuXHRcdFx0XSkpLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoW3BsdWdpbl0pLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudHMsIFt7XG5cdFx0XHR0eXBlOiAnYWdlbnQnLFxuXHRcdFx0aWQ6IGFnZW50VXJpLnRvU3RyaW5nKCksXG5cdFx0XHR1cmk6IGFnZW50VXJpLnRvU3RyaW5nKCksXG5cdFx0XHRuYW1lOiAnSW5ib3gnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdUcmlhZ2UgR2l0SHViIG5vdGlmaWNhdGlvbnMnLFxuXHRcdFx0ZGlzYWJsZVVzZXJJbnZvY2F0aW9uOiB0cnVlLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBwcm9maWxlIGVuYWJsZW1lbnQgd2hlbiBmaWx0ZXJpbmcgcGx1Z2luIGFnZW50cyBmb3IgdGhlIHByZS1zZXNzaW9uIHBpY2tlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5VcmkgPSBVUkkuZmlsZSgnL3BsdWdpbnMvd29ya3NwYWNlLWRpc2FibGVkJyk7XG5cdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkuam9pblBhdGgocGx1Z2luVXJpLCAnYWdlbnRzJywgJ2FnZW50LTAuYWdlbnQubWQnKTtcblx0XHRjb25zdCBwbHVnaW4gPSBtYWtlUGx1Z2luKHBsdWdpblVyaSwgeyBhZ2VudHM6IDEsIGVuYWJsZW1lbnQ6IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSB9KTtcblxuXHRcdGNvbnN0IGFnZW50cyA9IGF3YWl0IHJlc29sdmVMb2NhbEN1c3RvbUFnZW50cyhcblx0XHRcdG1ha2VGaWxlU2VydmljZSgpLFxuXHRcdFx0bWFrZVByb21wdHNTZXJ2aWNlKG5ldyBNYXAoW1xuXHRcdFx0XHRbYCR7UHJvbXB0c1R5cGUuYWdlbnR9LyR7UHJvbXB0c1N0b3JhZ2UucGx1Z2lufWAsIFttYWtlUHJvbXB0UGF0aChhZ2VudFVyaSwgUHJvbXB0c1R5cGUuYWdlbnQsIFByb21wdHNTdG9yYWdlLnBsdWdpbildXSxcblx0XHRcdF0pKSxcblx0XHRcdG5ldyBGYWtlU3luY1Byb3ZpZGVyKCksXG5cdFx0XHRtYWtlQWdlbnRQbHVnaW5TZXJ2aWNlKFtwbHVnaW5dLCBuZXcgTWFwKFtbcGx1Z2luVXJpLnRvU3RyaW5nKCksIHRydWVdXSkpLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudHMubWFwKGFnZW50ID0+IGFnZW50Lm5hbWUpLCBbJ2FnZW50LTAnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3B1Ymxpc2hlcyBwbHVnaW4gYWdlbnRzIGRpc2FibGVkIGluIHRoZSBwcm9maWxlIGZvciBjb250YWluZXItZ2F0ZWQgc2VsZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpblVyaSA9IFVSSS5maWxlKCcvcGx1Z2lucy9wcm9maWxlLWRpc2FibGVkJyk7XG5cdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkuam9pblBhdGgocGx1Z2luVXJpLCAnYWdlbnRzJywgJ2FnZW50LTAuYWdlbnQubWQnKTtcblx0XHRjb25zdCBwbHVnaW4gPSBtYWtlUGx1Z2luKHBsdWdpblVyaSwgeyBhZ2VudHM6IDEsIGVuYWJsZW1lbnQ6IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlIH0pO1xuXG5cdFx0Y29uc3QgYWdlbnRzID0gYXdhaXQgcmVzb2x2ZUxvY2FsQ3VzdG9tQWdlbnRzKFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKCksXG5cdFx0XHRtYWtlUHJvbXB0c1NlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRcdFtgJHtQcm9tcHRzVHlwZS5hZ2VudH0vJHtQcm9tcHRzU3RvcmFnZS5wbHVnaW59YCwgW21ha2VQcm9tcHRQYXRoKGFnZW50VXJpLCBQcm9tcHRzVHlwZS5hZ2VudCwgUHJvbXB0c1N0b3JhZ2UucGx1Z2luKV1dLFxuXHRcdFx0XSkpLFxuXHRcdFx0bmV3IEZha2VTeW5jUHJvdmlkZXIoKSxcblx0XHRcdG1ha2VBZ2VudFBsdWdpblNlcnZpY2UoW3BsdWdpbl0sIG5ldyBNYXAoW1twbHVnaW5VcmkudG9TdHJpbmcoKSwgZmFsc2VdXSkpLFxuXHRcdFx0U2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudHMubWFwKGFnZW50ID0+IGFnZW50LnVyaSksIFthZ2VudFVyaS50b1N0cmluZygpXSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdzaG91bGRTeW5jV29ya3NwYWNlRG90TWNwIC0gbXVsdGktcm9vdCBnYXRlJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIFBpbnMgdGhlIHByb2R1Y3Rpb24gbG9jYWwgQ29waWxvdCBBZ2VudCBIb3N0IHNlc3Npb24gdHlwZSBzbyBhIGRyaWZ0IGluIHRoZVxuXHQvLyBnYXRlJ3Mgc2Vzc2lvbi10eXBlIGNvbXBhcmlzb24gKHRoZSBjbGFzcyBvZiBidWcgdGhhdCB3b3VsZCBvdGhlcndpc2UgbGVhdmVcblx0Ly8gdGhlIGZlYXR1cmUgdGVzdHMgZ3JlZW4pIGZhaWxzIGhlcmUuXG5cdGNvbnN0IExPQ0FMX0NPUElMT1QgPSAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJztcblxuXHR0ZXN0KCd0cnVlIG9ubHkgZm9yIGxvY2FsIENvcGlsb3QgKyBtdWx0aXBsZSByb290cyArIHNldHRpbmcgZW5hYmxlZCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkU3luY1dvcmtzcGFjZURvdE1jcChMT0NBTF9DT1BJTE9ULCBbVVJJLmZpbGUoJy93b3Jrc3BhY2UtYScpLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS1iJyldLCB0cnVlKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbHNlIHdoZW4gdGhlIG11bHRpLXJvb3Qgc2V0dGluZyBpcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkU3luY1dvcmtzcGFjZURvdE1jcChMT0NBTF9DT1BJTE9ULCBbVVJJLmZpbGUoJy93b3Jrc3BhY2UtYScpLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS1iJyldLCBmYWxzZSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsc2UgZm9yIGEgc2luZ2xlIHJvb3QnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFN5bmNXb3Jrc3BhY2VEb3RNY3AoTE9DQUxfQ09QSUxPVCwgW1VSSS5maWxlKCcvd29ya3NwYWNlJyldLCB0cnVlKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxzZSBmb3IgYSB3b3Jrc3BhY2UtbGVzcyBzY29wZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkU3luY1dvcmtzcGFjZURvdE1jcChMT0NBTF9DT1BJTE9ULCBbXSwgdHJ1ZSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsc2UgZm9yIGEgbm9uLUNvcGlsb3QgaGFybmVzcyAoZS5nLiBDbGF1ZGUpJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRTeW5jV29ya3NwYWNlRG90TWNwKCdhZ2VudC1ob3N0LWNsYXVkZScsIFtVUkkuZmlsZSgnL3dvcmtzcGFjZS1hJyksIFVSSS5maWxlKCcvd29ya3NwYWNlLWInKV0sIHRydWUpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbHNlIGZvciB0aGUgQ29waWxvdCBDTEkgKGV4dGVuc2lvbiBob3N0KSBoYXJuZXNzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRTeW5jV29ya3NwYWNlRG90TWNwKCdjb3BpbG90Y2xpJywgW1VSSS5maWxlKCcvd29ya3NwYWNlLWEnKSwgVVJJLmZpbGUoJy93b3Jrc3BhY2UtYicpXSwgdHJ1ZSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsc2UgZm9yIGEgcmVtb3RlIENvcGlsb3QgQWdlbnQgSG9zdCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRTeW5jV29ya3NwYWNlRG90TWNwKCdyZW1vdGUtbXlhdXRob3JpdHktY29waWxvdGNsaScsIFtVUkkuZmlsZSgnL3dvcmtzcGFjZS1hJyksIFVSSS5maWxlKCcvd29ya3NwYWNlLWInKV0sIHRydWUpLCBmYWxzZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkIseUJBQXVEO0FBQzdGLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCLDBCQUEwQixpQ0FBaUM7QUFFOUYsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxtQ0FBbUM7QUFFNUMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBaUQsc0JBQXNCO0FBQ3ZFLFNBQXNGLDhCQUE4QjtBQUVwSCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLGVBQWUsS0FBVSxNQUFtQixTQUFzQztBQUMxRixTQUFPLEVBQUUsS0FBSyxNQUFNLFFBQVE7QUFDN0I7QUFPQSxTQUFTLGlDQUFpQyxjQUFzQyxDQUFDLEdBQWtDO0FBQ2xILFNBQU87QUFB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
