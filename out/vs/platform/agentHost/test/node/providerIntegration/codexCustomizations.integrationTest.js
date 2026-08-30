import assert from "assert";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import { createRequire } from "module";
import { tmpdir } from "os";
import { join } from "../../../../../base/common/path.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { ActionType } from "../../../common/state/sessionActions.js";
import { AgentHostCodexEnabledConfigKey } from "../../../common/agentHostSchema.js";
import { PROTOCOL_VERSION } from "../../../common/state/protocol/version/registry.js";
import { buildDefaultChatUri, customizationId, CustomizationType, MessageKind, ROOT_STATE_URI } from "../../../common/state/sessionState.js";
import { fetchSessionWithChat, getActionEnvelope, isActionNotification, startRealServer, stopServer, TestProtocolClient } from "../serverIntegrationTestHelpers.js";
import { CODEX_SDK_ROOT } from "../e2e/providers/codexTestConfiguration.js";
const AGENT_MARKER = "CODEX_CUSTOM_AGENT_INSTRUCTION_MARKER";
const WORKSPACE_AGENT_MARKER = "CODEX_WORKSPACE_AGENT_INSTRUCTION_MARKER";
const RULE_MARKER = "CODEX_PLUGIN_RULE_MARKER";
const SKILL_MARKER = "CODEX_PLUGIN_SKILL_DESCRIPTION_MARKER";
const MCP_MARKER = "CODEX_PLUGIN_MCP_TOOL_MARKER";
const nodeRequire = createRequire(import.meta.url);
function developerInputText(body) {
  const input = body?.input;
  return Array.isArray(input) ? JSON.stringify(input.filter((item) => item && typeof item === "object" && item.role === "developer")) : "";
}
async function waitForParsedPlugin(client, sessionUri, pluginUri) {
  const deadline = Date.now() + 6e4;
  let lastPlugin;
  while (Date.now() < deadline) {
    const session = await fetchSessionWithChat(client, sessionUri);
    const plugin = session.customizations?.find(
      (customization) => customization.type === CustomizationType.Plugin && customization.uri === pluginUri
    );
    lastPlugin = plugin;
    if (plugin && (plugin.children?.length ?? 0) >= 4 && plugin.children?.some((child) => child.type === CustomizationType.McpServer) === true) {
      return plugin;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for parsed plugin ${pluginUri}; last state: ${JSON.stringify(lastPlugin)}`);
}
async function waitForWorkspaceAgent(client, sessionUri, agentUri) {
  const deadline = Date.now() + 6e4;
  while (Date.now() < deadline) {
    const session = await fetchSessionWithChat(client, sessionUri);
    const directory = session.customizations?.find(
      (customization) => customization.type === CustomizationType.Directory && customization.contents === CustomizationType.Agent && customization.children?.some((child) => child.type === CustomizationType.Agent && child.uri === agentUri) === true
    );
    if (directory) {
      return directory;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for workspace agent ${agentUri}`);
}
suite("Agent Host Provider Integration \u2014 Codex Customizations", function() {
  let server;
  let client;
  let userHomeDir;
  const createdSessions = [];
  const tempDirs = [];
  suiteSetup(async function() {
    this.timeout(12e4);
    if (!CODEX_SDK_ROOT) {
      this.skip();
    }
    userHomeDir = await mkdtemp(join(tmpdir(), "codex-customizations-home-"));
    const codexHomeDir = join(userHomeDir, ".codex");
    await mkdir(codexHomeDir, { recursive: true });
    server = await startRealServer({
      mockLlm: true,
      codexSdkRoot: CODEX_SDK_ROOT,
      codexHomeDir,
      homeDir: userHomeDir,
      userDataDir: join(userHomeDir, "user-data")
    });
  });
  suiteTeardown(async function() {
    await stopServer(server);
    await rm(userHomeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  setup(async function() {
    this.timeout(12e4);
    client = new TestProtocolClient(server.port);
    await client.connect();
  });
  teardown(async function() {
    for (const session of createdSessions) {
      try {
        await client.call("disposeSession", { session }, 5e3);
      } catch {
      }
    }
    createdSessions.length = 0;
    client.close();
    for (const dir of tempDirs) {
      try {
        await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
      }
    }
    tempDirs.length = 0;
  });
  test("client plugin agents, instructions, skills, and MCP reach Codex", async function() {
    this.timeout(18e4);
    const workspaceDir = await mkdtemp(join(tmpdir(), "codex-customizations-workspace-"));
    const pluginDir = await mkdtemp(join(tmpdir(), "codex-customizations-plugin-"));
    tempDirs.push(workspaceDir, pluginDir);
    const agentFile = join(pluginDir, "agents", "reviewer.agent.md");
    const skillFile = join(pluginDir, "skills", "customization-skill", "SKILL.md");
    const instructionFile = join(pluginDir, "rules", "customization.instructions.md");
    const mcpScript = join(pluginDir, "customization-mcp.cjs");
    const mcpConfigFile = join(pluginDir, ".mcp.json");
    const pluginUri = URI.file(pluginDir).toString();
    await Promise.all([
      mkdir(join(pluginDir, ".plugin"), { recursive: true }),
      mkdir(join(pluginDir, "agents"), { recursive: true }),
      mkdir(join(pluginDir, "skills", "customization-skill"), { recursive: true }),
      mkdir(join(pluginDir, "rules"), { recursive: true })
    ]);
    const mcpServerModule = nodeRequire.resolve("@modelcontextprotocol/sdk/server/index.js");
    const mcpStdioModule = nodeRequire.resolve("@modelcontextprotocol/sdk/server/stdio.js");
    const mcpTypesModule = nodeRequire.resolve("@modelcontextprotocol/sdk/types.js");
    await Promise.all([
      writeFile(join(pluginDir, ".plugin", "plugin.json"), JSON.stringify({ name: "Codex Customizations Test Plugin" })),
      writeFile(agentFile, [
        "---",
        "name: Codex Custom Reviewer",
        "description: Reviews changes using the integration-test policy.",
        "---",
        `Always follow ${AGENT_MARKER}.`
      ].join("\n")),
      writeFile(instructionFile, [
        "---",
        "name: Codex Integration Rule",
        "applyTo:",
        '  - "**/*"',
        "---",
        `Always follow ${RULE_MARKER}.`
      ].join("\n")),
      writeFile(skillFile, [
        "---",
        "name: customization-skill",
        `description: ${SKILL_MARKER}`,
        "---",
        "Use this skill when validating Codex customization propagation."
      ].join("\n")),
      writeFile(mcpScript, [
        `const { Server } = require(${JSON.stringify(mcpServerModule)});`,
        `const { StdioServerTransport } = require(${JSON.stringify(mcpStdioModule)});`,
        `const { CallToolRequestSchema, ListToolsRequestSchema } = require(${JSON.stringify(mcpTypesModule)});`,
        `const server = new Server({ name: "codex-customization-test", version: "1.0.0" }, { capabilities: { tools: {} } });`,
        `server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "customization_probe", description: ${JSON.stringify(MCP_MARKER)}, inputSchema: { type: "object", properties: {} } }] }));`,
        `server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: "text", text: "customization MCP response" }] }));`,
        "void server.connect(new StdioServerTransport());"
      ].join("\n")),
      writeFile(mcpConfigFile, JSON.stringify({
        mcpServers: {
          customization_test: {
            command: process.execPath,
            args: [mcpScript],
            env: { ELECTRON_RUN_AS_NODE: "1" }
          }
        }
      }))
    ]);
    const clientId = "codex-customizations-client";
    await client.call("initialize", { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId }, 3e4);
    await client.call("authenticate", { channel: ROOT_STATE_URI, resource: "https://api.github.com", token: "not-a-real-token" }, 3e4);
    const pluginCustomization = {
      type: CustomizationType.Plugin,
      id: customizationId(pluginUri),
      uri: pluginUri,
      name: "Codex Customizations Test Plugin",
      nonce: "1"
    };
    const sessionUri = URI.from({ scheme: "codex", path: `/${generateUuid()}` }).toString();
    await client.call("createSession", {
      channel: sessionUri,
      provider: "codex",
      workingDirectories: [URI.file(workspaceDir).toString()],
      config: { isolation: "folder" },
      activeClient: {
        clientId,
        tools: [],
        customizations: [pluginCustomization]
      }
    }, 3e4);
    createdSessions.push(sessionUri);
    await client.call("subscribe", { channel: sessionUri });
    await client.call("subscribe", { channel: buildDefaultChatUri(sessionUri) });
    client.clearReceived();
    const parsedPlugin = await waitForParsedPlugin(client, sessionUri, pluginUri);
    assert.deepStrictEqual(
      new Set(parsedPlugin.children?.map((child) => child.type)),
      /* @__PURE__ */ new Set([CustomizationType.Agent, CustomizationType.Rule, CustomizationType.Skill, CustomizationType.McpServer])
    );
    const turnId = "turn-codex-customizations";
    client.dispatch({
      channel: buildDefaultChatUri(sessionUri),
      clientSeq: 1,
      action: {
        type: ActionType.ChatTurnStarted,
        turnId,
        startedAt: "2026-08-04T00:00:00.000Z",
        message: {
          text: "Reply with exactly CODEX_CUSTOMIZATIONS_OK.",
          origin: { kind: MessageKind.User },
          agent: { uri: URI.file(agentFile).toString() }
        }
      }
    });
    await client.waitForNotification(
      (notification) => isActionNotification(notification, "chat/turnComplete") && getActionEnvelope(notification).channel === buildDefaultChatUri(sessionUri) && getActionEnvelope(notification).action.turnId === turnId,
      12e4
    );
    const rolloutRoot = join(userHomeDir, ".codex", "sessions");
    const rolloutFiles = (await readdir(rolloutRoot, { recursive: true })).filter((file) => file.endsWith(".jsonl"));
    const rolloutContents = await Promise.all(rolloutFiles.map((file) => readFile(join(rolloutRoot, file), "utf8")));
    assert.ok(rolloutContents.some((content) => content.includes("CODEX_CUSTOMIZATIONS_OK")), "Codex test rollouts must be written under the isolated test home");
    const requests = server.mockLlm?.getRequests?.() ?? [];
    const responsesRequest = [...requests].reverse().find((request) => request.path.includes("/responses"));
    assert.ok(responsesRequest, `expected a Codex /responses request; got paths: ${requests.map((request) => request.path).join(", ")}`);
    const requestText = JSON.stringify(responsesRequest.body);
    const developerText = developerInputText(responsesRequest.body);
    assert.ok(developerText.includes(AGENT_MARKER), "selected custom-agent instructions must reach the Codex developer message");
    assert.ok(developerText.includes(RULE_MARKER), "plugin instructions must reach the Codex developer message");
    assert.ok(requestText.includes(SKILL_MARKER), "plugin skills must be advertised in the Codex model request");
    assert.ok(requestText.includes(MCP_MARKER), "plugin MCP tools must be advertised in the Codex model request");
  });
  test("workspace agent is exposed and selected without client customization sync", async function() {
    this.timeout(18e4);
    const workspaceDir = await mkdtemp(join(tmpdir(), "codex-workspace-agent-"));
    tempDirs.push(workspaceDir);
    const agentsDir = join(workspaceDir, ".github", "agents");
    const agentFile = join(agentsDir, "workspace-reviewer.agent.md");
    const agentUri = URI.file(agentFile).toString();
    await mkdir(agentsDir, { recursive: true });
    await writeFile(agentFile, [
      "---",
      "name: Workspace Reviewer",
      "description: Reviews this workspace.",
      "---",
      `Always follow ${WORKSPACE_AGENT_MARKER}.`
    ].join("\n"));
    const clientId = "codex-workspace-agent-client";
    await client.call("initialize", { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId }, 3e4);
    await client.call("authenticate", { channel: ROOT_STATE_URI, resource: "https://api.github.com", token: "not-a-real-token" }, 3e4);
    const sessionUri = URI.from({ scheme: "codex", path: `/${generateUuid()}` }).toString();
    await client.call("createSession", {
      channel: sessionUri,
      provider: "codex",
      workingDirectories: [URI.file(workspaceDir).toString()],
      config: { isolation: "folder" },
      activeClient: { clientId, tools: [], customizations: [] }
    }, 3e4);
    createdSessions.push(sessionUri);
    await client.call("subscribe", { channel: sessionUri });
    await client.call("subscribe", { channel: buildDefaultChatUri(sessionUri) });
    client.clearReceived();
    const directory = await waitForWorkspaceAgent(client, sessionUri, agentUri);
    assert.deepStrictEqual(directory.children?.map((child) => ({ type: child.type, name: child.name, uri: child.uri })), [{
      type: CustomizationType.Agent,
      name: "Workspace Reviewer",
      uri: agentUri
    }]);
    const turnId = "turn-codex-workspace-agent";
    client.dispatch({
      channel: buildDefaultChatUri(sessionUri),
      clientSeq: 1,
      action: {
        type: ActionType.ChatTurnStarted,
        turnId,
        startedAt: "2026-08-13T00:00:00.000Z",
        message: {
          text: "Reply with exactly CODEX_WORKSPACE_AGENT_OK.",
          origin: { kind: MessageKind.User },
          agent: { uri: agentUri }
        }
      }
    });
    await client.waitForNotification(
      (notification) => isActionNotification(notification, "chat/turnComplete") && getActionEnvelope(notification).channel === buildDefaultChatUri(sessionUri) && getActionEnvelope(notification).action.turnId === turnId,
      12e4
    );
    const requests = server.mockLlm?.getRequests?.() ?? [];
    const responsesRequest = [...requests].reverse().find((request) => request.path.includes("/responses"));
    assert.ok(responsesRequest, `expected a Codex /responses request; got paths: ${requests.map((request) => request.path).join(", ")}`);
    assert.ok(developerInputText(responsesRequest.body).includes(WORKSPACE_AGENT_MARKER), "selected workspace-agent instructions must reach the Codex developer message");
  });
  test("standalone host registers Codex after runtime enablement", async function() {
    this.timeout(12e4);
    const runtimeHomeDir = await mkdtemp(join(tmpdir(), "codex-runtime-enablement-home-"));
    const workspaceDir = await mkdtemp(join(tmpdir(), "codex-runtime-enablement-"));
    const runtimeCodexHomeDir = join(runtimeHomeDir, ".codex");
    await mkdir(runtimeCodexHomeDir, { recursive: true });
    const runtimeServer = await startRealServer({
      mockLlm: true,
      codexSdkRoot: CODEX_SDK_ROOT,
      codexHomeDir: runtimeCodexHomeDir,
      codexAgentEnabled: false,
      homeDir: runtimeHomeDir,
      userDataDir: join(runtimeHomeDir, "user-data")
    });
    const runtimeClient = new TestProtocolClient(runtimeServer.port);
    try {
      await runtimeClient.connect();
      await runtimeClient.call("initialize", { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: "codex-runtime-enablement-client" }, 3e4);
      await runtimeClient.call("authenticate", { channel: ROOT_STATE_URI, resource: "https://api.github.com", token: "not-a-real-token" }, 3e4);
      await runtimeClient.call("subscribe", { channel: ROOT_STATE_URI });
      runtimeClient.clearReceived();
      runtimeClient.dispatch({
        channel: ROOT_STATE_URI,
        clientSeq: 1,
        action: { type: ActionType.RootConfigChanged, config: { [AgentHostCodexEnabledConfigKey]: true } }
      });
      await runtimeClient.waitForNotification(
        (notification) => isActionNotification(notification, ActionType.RootConfigChanged) && getActionEnvelope(notification).action.config?.[AgentHostCodexEnabledConfigKey] === true,
        3e4
      );
      const sessionUri = URI.from({ scheme: "codex", path: `/${generateUuid()}` }).toString();
      await runtimeClient.call("createSession", {
        channel: sessionUri,
        provider: "codex",
        workingDirectories: [URI.file(workspaceDir).toString()],
        config: { isolation: "folder" }
      }, 3e4);
    } finally {
      runtimeClient.close();
      await stopServer(runtimeServer);
      await Promise.all([
        rm(runtimeHomeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
        rm(workspaceDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      ]);
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxwcm92aWRlckludGVncmF0aW9uXFxjb2RleEN1c3RvbWl6YXRpb25zLmludGVncmF0aW9uVGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogQWdlbnQgSG9zdCBpbnRlZ3JhdGlvbiB0ZXN0cyB1c2luZyB0aGUgcmVhbCBDb2RleCBBcHAgU2VydmVyIGFuZCBhIHN5bnRoZXRpYyBsb2NhbCBMTE0uXG4gKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWtkaXIsIG1rZHRlbXAsIHJlYWRGaWxlLCByZWFkZGlyLCBybSwgd3JpdGVGaWxlIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgY3JlYXRlUmVxdWlyZSB9IGZyb20gJ21vZHVsZSc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvZGV4RW5hYmxlZENvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHR5cGUgU3Vic2NyaWJlUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGJ1aWxkRGVmYXVsdENoYXRVcmksIGN1c3RvbWl6YXRpb25JZCwgQ3VzdG9taXphdGlvblR5cGUsIE1lc3NhZ2VLaW5kLCBST09UX1NUQVRFX1VSSSwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIERpcmVjdG9yeUN1c3RvbWl6YXRpb24sIHR5cGUgTWNwU2VydmVyQ3VzdG9taXphdGlvbiwgdHlwZSBQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIFVSSSBhcyBQcm90b2NvbFVSSSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgZmV0Y2hTZXNzaW9uV2l0aENoYXQsIGdldEFjdGlvbkVudmVsb3BlLCBpc0FjdGlvbk5vdGlmaWNhdGlvbiwgdHlwZSBJU2VydmVySGFuZGxlLCBzdGFydFJlYWxTZXJ2ZXIsIHN0b3BTZXJ2ZXIsIFRlc3RQcm90b2NvbENsaWVudCB9IGZyb20gJy4uL3NlcnZlckludGVncmF0aW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgQ09ERVhfU0RLX1JPT1QgfSBmcm9tICcuLi9lMmUvcHJvdmlkZXJzL2NvZGV4VGVzdENvbmZpZ3VyYXRpb24uanMnO1xuXG5jb25zdCBBR0VOVF9NQVJLRVIgPSAnQ09ERVhfQ1VTVE9NX0FHRU5UX0lOU1RSVUNUSU9OX01BUktFUic7XG5jb25zdCBXT1JLU1BBQ0VfQUdFTlRfTUFSS0VSID0gJ0NPREVYX1dPUktTUEFDRV9BR0VOVF9JTlNUUlVDVElPTl9NQVJLRVInO1xuY29uc3QgUlVMRV9NQVJLRVIgPSAnQ09ERVhfUExVR0lOX1JVTEVfTUFSS0VSJztcbmNvbnN0IFNLSUxMX01BUktFUiA9ICdDT0RFWF9QTFVHSU5fU0tJTExfREVTQ1JJUFRJT05fTUFSS0VSJztcbmNvbnN0IE1DUF9NQVJLRVIgPSAnQ09ERVhfUExVR0lOX01DUF9UT09MX01BUktFUic7XG5jb25zdCBub2RlUmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcblxuaW50ZXJmYWNlIElDYXB0dXJlZFJlcXVlc3Qge1xuXHRyZWFkb25seSBwYXRoOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJvZHk6IHVua25vd247XG59XG5cbmZ1bmN0aW9uIGRldmVsb3BlcklucHV0VGV4dChib2R5OiB1bmtub3duKTogc3RyaW5nIHtcblx0Y29uc3QgaW5wdXQgPSAoYm9keSBhcyB7IHJlYWRvbmx5IGlucHV0PzogdW5rbm93biB9IHwgdW5kZWZpbmVkKT8uaW5wdXQ7XG5cdHJldHVybiBBcnJheS5pc0FycmF5KGlucHV0KVxuXHRcdD8gSlNPTi5zdHJpbmdpZnkoaW5wdXQuZmlsdGVyKGl0ZW0gPT4gaXRlbSAmJiB0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcgJiYgKGl0ZW0gYXMgeyByZWFkb25seSByb2xlPzogdW5rbm93biB9KS5yb2xlID09PSAnZGV2ZWxvcGVyJykpXG5cdFx0OiAnJztcbn1cblxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvclBhcnNlZFBsdWdpbihjbGllbnQ6IFRlc3RQcm90b2NvbENsaWVudCwgc2Vzc2lvblVyaTogc3RyaW5nLCBwbHVnaW5Vcmk6IHN0cmluZyk6IFByb21pc2U8UGx1Z2luQ3VzdG9taXphdGlvbj4ge1xuXHRjb25zdCBkZWFkbGluZSA9IERhdGUubm93KCkgKyA2MF8wMDA7XG5cdGxldCBsYXN0UGx1Z2luOiBQbHVnaW5DdXN0b21pemF0aW9uIHwgdW5kZWZpbmVkO1xuXHR3aGlsZSAoRGF0ZS5ub3coKSA8IGRlYWRsaW5lKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGZldGNoU2Vzc2lvbldpdGhDaGF0KGNsaWVudCwgc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgcGx1Z2luID0gc2Vzc2lvbi5jdXN0b21pemF0aW9ucz8uZmluZCgoY3VzdG9taXphdGlvbik6IGN1c3RvbWl6YXRpb24gaXMgUGx1Z2luQ3VzdG9taXphdGlvbiA9PlxuXHRcdFx0Y3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW5cblx0XHRcdCYmIGN1c3RvbWl6YXRpb24udXJpID09PSBwbHVnaW5Vcmlcblx0XHQpO1xuXHRcdGxhc3RQbHVnaW4gPSBwbHVnaW47XG5cdFx0aWYgKHBsdWdpblxuXHRcdFx0JiYgKHBsdWdpbi5jaGlsZHJlbj8ubGVuZ3RoID8/IDApID49IDRcblx0XHRcdCYmIHBsdWdpbi5jaGlsZHJlbj8uc29tZSgoY2hpbGQpOiBjaGlsZCBpcyBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uID0+IGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikgPT09IHRydWUpIHtcblx0XHRcdHJldHVybiBwbHVnaW47XG5cdFx0fVxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDApKTtcblx0fVxuXHR0aHJvdyBuZXcgRXJyb3IoYFRpbWVkIG91dCB3YWl0aW5nIGZvciBwYXJzZWQgcGx1Z2luICR7cGx1Z2luVXJpfTsgbGFzdCBzdGF0ZTogJHtKU09OLnN0cmluZ2lmeShsYXN0UGx1Z2luKX1gKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvcldvcmtzcGFjZUFnZW50KGNsaWVudDogVGVzdFByb3RvY29sQ2xpZW50LCBzZXNzaW9uVXJpOiBzdHJpbmcsIGFnZW50VXJpOiBzdHJpbmcpOiBQcm9taXNlPERpcmVjdG9yeUN1c3RvbWl6YXRpb24+IHtcblx0Y29uc3QgZGVhZGxpbmUgPSBEYXRlLm5vdygpICsgNjBfMDAwO1xuXHR3aGlsZSAoRGF0ZS5ub3coKSA8IGRlYWRsaW5lKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGZldGNoU2Vzc2lvbldpdGhDaGF0KGNsaWVudCwgc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgZGlyZWN0b3J5ID0gc2Vzc2lvbi5jdXN0b21pemF0aW9ucz8uZmluZCgoY3VzdG9taXphdGlvbik6IGN1c3RvbWl6YXRpb24gaXMgRGlyZWN0b3J5Q3VzdG9taXphdGlvbiA9PlxuXHRcdFx0Y3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5EaXJlY3Rvcnlcblx0XHRcdCYmIGN1c3RvbWl6YXRpb24uY29udGVudHMgPT09IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50XG5cdFx0XHQmJiBjdXN0b21pemF0aW9uLmNoaWxkcmVuPy5zb21lKGNoaWxkID0+IGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50ICYmIGNoaWxkLnVyaSA9PT0gYWdlbnRVcmkpID09PSB0cnVlXG5cdFx0KTtcblx0XHRpZiAoZGlyZWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gZGlyZWN0b3J5O1xuXHRcdH1cblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSk7XG5cdH1cblx0dGhyb3cgbmV3IEVycm9yKGBUaW1lZCBvdXQgd2FpdGluZyBmb3Igd29ya3NwYWNlIGFnZW50ICR7YWdlbnRVcml9YCk7XG59XG5cbnN1aXRlKCdBZ2VudCBIb3N0IFByb3ZpZGVyIEludGVncmF0aW9uIFx1MjAxNCBDb2RleCBDdXN0b21pemF0aW9ucycsIGZ1bmN0aW9uICgpIHtcblxuXHRsZXQgc2VydmVyOiBJU2VydmVySGFuZGxlO1xuXHRsZXQgY2xpZW50OiBUZXN0UHJvdG9jb2xDbGllbnQ7XG5cdGxldCB1c2VySG9tZURpcjogc3RyaW5nO1xuXHRjb25zdCBjcmVhdGVkU2Vzc2lvbnM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IHRlbXBEaXJzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdHN1aXRlU2V0dXAoYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxMjBfMDAwKTtcblx0XHRpZiAoIUNPREVYX1NES19ST09UKSB7XG5cdFx0XHR0aGlzLnNraXAoKTtcblx0XHR9XG5cdFx0dXNlckhvbWVEaXIgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICdjb2RleC1jdXN0b21pemF0aW9ucy1ob21lLScpKTtcblx0XHRjb25zdCBjb2RleEhvbWVEaXIgPSBqb2luKHVzZXJIb21lRGlyLCAnLmNvZGV4Jyk7XG5cdFx0YXdhaXQgbWtkaXIoY29kZXhIb21lRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRzZXJ2ZXIgPSBhd2FpdCBzdGFydFJlYWxTZXJ2ZXIoe1xuXHRcdFx0bW9ja0xsbTogdHJ1ZSxcblx0XHRcdGNvZGV4U2RrUm9vdDogQ09ERVhfU0RLX1JPT1QsXG5cdFx0XHRjb2RleEhvbWVEaXIsXG5cdFx0XHRob21lRGlyOiB1c2VySG9tZURpcixcblx0XHRcdHVzZXJEYXRhRGlyOiBqb2luKHVzZXJIb21lRGlyLCAndXNlci1kYXRhJyksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlVGVhcmRvd24oYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHN0b3BTZXJ2ZXIoc2VydmVyKTtcblx0XHRhd2FpdCBybSh1c2VySG9tZURpciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlLCBtYXhSZXRyaWVzOiA1LCByZXRyeURlbGF5OiAyMDAgfSk7XG5cdH0pO1xuXG5cdHNldHVwKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cdFx0Y2xpZW50ID0gbmV3IFRlc3RQcm90b2NvbENsaWVudChzZXJ2ZXIucG9ydCk7XG5cdFx0YXdhaXQgY2xpZW50LmNvbm5lY3QoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBjcmVhdGVkU2Vzc2lvbnMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGNsaWVudC5jYWxsKCdkaXNwb3NlU2Vzc2lvbicsIHsgc2Vzc2lvbiB9LCA1MDAwKTtcblx0XHRcdH0gY2F0Y2ggeyAvKiBiZXN0LWVmZm9ydCAqLyB9XG5cdFx0fVxuXHRcdGNyZWF0ZWRTZXNzaW9ucy5sZW5ndGggPSAwO1xuXHRcdGNsaWVudC5jbG9zZSgpO1xuXG5cdFx0Zm9yIChjb25zdCBkaXIgb2YgdGVtcERpcnMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHJtKGRpciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlLCBtYXhSZXRyaWVzOiA1LCByZXRyeURlbGF5OiAyMDAgfSk7XG5cdFx0XHR9IGNhdGNoIHsgLyogYmVzdC1lZmZvcnQgKi8gfVxuXHRcdH1cblx0XHR0ZW1wRGlycy5sZW5ndGggPSAwO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGllbnQgcGx1Z2luIGFnZW50cywgaW5zdHJ1Y3Rpb25zLCBza2lsbHMsIGFuZCBNQ1AgcmVhY2ggQ29kZXgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlRGlyID0gYXdhaXQgbWtkdGVtcChqb2luKHRtcGRpcigpLCAnY29kZXgtY3VzdG9taXphdGlvbnMtd29ya3NwYWNlLScpKTtcblx0XHRjb25zdCBwbHVnaW5EaXIgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICdjb2RleC1jdXN0b21pemF0aW9ucy1wbHVnaW4tJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlRGlyLCBwbHVnaW5EaXIpO1xuXG5cdFx0Y29uc3QgYWdlbnRGaWxlID0gam9pbihwbHVnaW5EaXIsICdhZ2VudHMnLCAncmV2aWV3ZXIuYWdlbnQubWQnKTtcblx0XHRjb25zdCBza2lsbEZpbGUgPSBqb2luKHBsdWdpbkRpciwgJ3NraWxscycsICdjdXN0b21pemF0aW9uLXNraWxsJywgJ1NLSUxMLm1kJyk7XG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb25GaWxlID0gam9pbihwbHVnaW5EaXIsICdydWxlcycsICdjdXN0b21pemF0aW9uLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdGNvbnN0IG1jcFNjcmlwdCA9IGpvaW4ocGx1Z2luRGlyLCAnY3VzdG9taXphdGlvbi1tY3AuY2pzJyk7XG5cdFx0Y29uc3QgbWNwQ29uZmlnRmlsZSA9IGpvaW4ocGx1Z2luRGlyLCAnLm1jcC5qc29uJyk7XG5cdFx0Y29uc3QgcGx1Z2luVXJpID0gVVJJLmZpbGUocGx1Z2luRGlyKS50b1N0cmluZygpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0bWtkaXIoam9pbihwbHVnaW5EaXIsICcucGx1Z2luJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pLFxuXHRcdFx0bWtkaXIoam9pbihwbHVnaW5EaXIsICdhZ2VudHMnKSwgeyByZWN1cnNpdmU6IHRydWUgfSksXG5cdFx0XHRta2Rpcihqb2luKHBsdWdpbkRpciwgJ3NraWxscycsICdjdXN0b21pemF0aW9uLXNraWxsJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pLFxuXHRcdFx0bWtkaXIoam9pbihwbHVnaW5EaXIsICdydWxlcycpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IG1jcFNlcnZlck1vZHVsZSA9IG5vZGVSZXF1aXJlLnJlc29sdmUoJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9zZGsvc2VydmVyL2luZGV4LmpzJyk7XG5cdFx0Y29uc3QgbWNwU3RkaW9Nb2R1bGUgPSBub2RlUmVxdWlyZS5yZXNvbHZlKCdAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrL3NlcnZlci9zdGRpby5qcycpO1xuXHRcdGNvbnN0IG1jcFR5cGVzTW9kdWxlID0gbm9kZVJlcXVpcmUucmVzb2x2ZSgnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay90eXBlcy5qcycpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHdyaXRlRmlsZShqb2luKHBsdWdpbkRpciwgJy5wbHVnaW4nLCAncGx1Z2luLmpzb24nKSwgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAnQ29kZXggQ3VzdG9taXphdGlvbnMgVGVzdCBQbHVnaW4nIH0pKSxcblx0XHRcdHdyaXRlRmlsZShhZ2VudEZpbGUsIFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBDb2RleCBDdXN0b20gUmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY2hhbmdlcyB1c2luZyB0aGUgaW50ZWdyYXRpb24tdGVzdCBwb2xpY3kuJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdGBBbHdheXMgZm9sbG93ICR7QUdFTlRfTUFSS0VSfS5gLFxuXHRcdFx0XS5qb2luKCdcXG4nKSksXG5cdFx0XHR3cml0ZUZpbGUoaW5zdHJ1Y3Rpb25GaWxlLCBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogQ29kZXggSW50ZWdyYXRpb24gUnVsZScsXG5cdFx0XHRcdCdhcHBseVRvOicsXG5cdFx0XHRcdCcgIC0gXCIqKi8qXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0YEFsd2F5cyBmb2xsb3cgJHtSVUxFX01BUktFUn0uYCxcblx0XHRcdF0uam9pbignXFxuJykpLFxuXHRcdFx0d3JpdGVGaWxlKHNraWxsRmlsZSwgW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IGN1c3RvbWl6YXRpb24tc2tpbGwnLFxuXHRcdFx0XHRgZGVzY3JpcHRpb246ICR7U0tJTExfTUFSS0VSfWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVXNlIHRoaXMgc2tpbGwgd2hlbiB2YWxpZGF0aW5nIENvZGV4IGN1c3RvbWl6YXRpb24gcHJvcGFnYXRpb24uJyxcblx0XHRcdF0uam9pbignXFxuJykpLFxuXHRcdFx0d3JpdGVGaWxlKG1jcFNjcmlwdCwgW1xuXHRcdFx0XHRgY29uc3QgeyBTZXJ2ZXIgfSA9IHJlcXVpcmUoJHtKU09OLnN0cmluZ2lmeShtY3BTZXJ2ZXJNb2R1bGUpfSk7YCxcblx0XHRcdFx0YGNvbnN0IHsgU3RkaW9TZXJ2ZXJUcmFuc3BvcnQgfSA9IHJlcXVpcmUoJHtKU09OLnN0cmluZ2lmeShtY3BTdGRpb01vZHVsZSl9KTtgLFxuXHRcdFx0XHRgY29uc3QgeyBDYWxsVG9vbFJlcXVlc3RTY2hlbWEsIExpc3RUb29sc1JlcXVlc3RTY2hlbWEgfSA9IHJlcXVpcmUoJHtKU09OLnN0cmluZ2lmeShtY3BUeXBlc01vZHVsZSl9KTtgLFxuXHRcdFx0XHRgY29uc3Qgc2VydmVyID0gbmV3IFNlcnZlcih7IG5hbWU6IFwiY29kZXgtY3VzdG9taXphdGlvbi10ZXN0XCIsIHZlcnNpb246IFwiMS4wLjBcIiB9LCB7IGNhcGFiaWxpdGllczogeyB0b29sczoge30gfSB9KTtgLFxuXHRcdFx0XHRgc2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKExpc3RUb29sc1JlcXVlc3RTY2hlbWEsIGFzeW5jICgpID0+ICh7IHRvb2xzOiBbeyBuYW1lOiBcImN1c3RvbWl6YXRpb25fcHJvYmVcIiwgZGVzY3JpcHRpb246ICR7SlNPTi5zdHJpbmdpZnkoTUNQX01BUktFUil9LCBpbnB1dFNjaGVtYTogeyB0eXBlOiBcIm9iamVjdFwiLCBwcm9wZXJ0aWVzOiB7fSB9IH1dIH0pKTtgLFxuXHRcdFx0XHRgc2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKENhbGxUb29sUmVxdWVzdFNjaGVtYSwgYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sgdHlwZTogXCJ0ZXh0XCIsIHRleHQ6IFwiY3VzdG9taXphdGlvbiBNQ1AgcmVzcG9uc2VcIiB9XSB9KSk7YCxcblx0XHRcdFx0J3ZvaWQgc2VydmVyLmNvbm5lY3QobmV3IFN0ZGlvU2VydmVyVHJhbnNwb3J0KCkpOycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKSxcblx0XHRcdHdyaXRlRmlsZShtY3BDb25maWdGaWxlLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdG1jcFNlcnZlcnM6IHtcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uX3Rlc3Q6IHtcblx0XHRcdFx0XHRcdGNvbW1hbmQ6IHByb2Nlc3MuZXhlY1BhdGgsXG5cdFx0XHRcdFx0XHRhcmdzOiBbbWNwU2NyaXB0XSxcblx0XHRcdFx0XHRcdGVudjogeyBFTEVDVFJPTl9SVU5fQVNfTk9ERTogJzEnIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGNsaWVudElkID0gJ2NvZGV4LWN1c3RvbWl6YXRpb25zLWNsaWVudCc7XG5cdFx0YXdhaXQgY2xpZW50LmNhbGwoJ2luaXRpYWxpemUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCBwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sIGNsaWVudElkIH0sIDMwXzAwMCk7XG5cdFx0YXdhaXQgY2xpZW50LmNhbGwoJ2F1dGhlbnRpY2F0ZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsIHRva2VuOiAnbm90LWEtcmVhbC10b2tlbicgfSwgMzBfMDAwKTtcblx0XHRjb25zdCBwbHVnaW5DdXN0b21pemF0aW9uOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uID0ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0aWQ6IGN1c3RvbWl6YXRpb25JZChwbHVnaW5VcmkpLFxuXHRcdFx0dXJpOiBwbHVnaW5VcmkgYXMgUHJvdG9jb2xVUkksXG5cdFx0XHRuYW1lOiAnQ29kZXggQ3VzdG9taXphdGlvbnMgVGVzdCBQbHVnaW4nLFxuXHRcdFx0bm9uY2U6ICcxJyxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29kZXgnLCBwYXRoOiBgLyR7Z2VuZXJhdGVVdWlkKCl9YCB9KS50b1N0cmluZygpO1xuXHRcdGF3YWl0IGNsaWVudC5jYWxsKCdjcmVhdGVTZXNzaW9uJywge1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdHByb3ZpZGVyOiAnY29kZXgnLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUod29ya3NwYWNlRGlyKS50b1N0cmluZygpXSxcblx0XHRcdGNvbmZpZzogeyBpc29sYXRpb246ICdmb2xkZXInIH0sXG5cdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0Y2xpZW50SWQsXG5cdFx0XHRcdHRvb2xzOiBbXSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFtwbHVnaW5DdXN0b21pemF0aW9uXSxcblx0XHRcdH0sXG5cdFx0fSwgMzBfMDAwKTtcblx0XHRjcmVhdGVkU2Vzc2lvbnMucHVzaChzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0YXdhaXQgY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpIH0pO1xuXHRcdGNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cblx0XHRjb25zdCBwYXJzZWRQbHVnaW4gPSBhd2FpdCB3YWl0Rm9yUGFyc2VkUGx1Z2luKGNsaWVudCwgc2Vzc2lvblVyaSwgcGx1Z2luVXJpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0bmV3IFNldChwYXJzZWRQbHVnaW4uY2hpbGRyZW4/Lm1hcChjaGlsZCA9PiBjaGlsZC50eXBlKSksXG5cdFx0XHRuZXcgU2V0KFtDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgQ3VzdG9taXphdGlvblR5cGUuUnVsZSwgQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsIEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcl0pLFxuXHRcdCk7XG5cblx0XHRjb25zdCB0dXJuSWQgPSAndHVybi1jb2RleC1jdXN0b21pemF0aW9ucyc7XG5cdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNi0wOC0wNFQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdHRleHQ6ICdSZXBseSB3aXRoIGV4YWN0bHkgQ09ERVhfQ1VTVE9NSVpBVElPTlNfT0suJyxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdGFnZW50OiB7IHVyaTogVVJJLmZpbGUoYWdlbnRGaWxlKS50b1N0cmluZygpIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obm90aWZpY2F0aW9uLCAnY2hhdC90dXJuQ29tcGxldGUnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobm90aWZpY2F0aW9uKS5jaGFubmVsID09PSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpXG5cdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobm90aWZpY2F0aW9uKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmcgfSkudHVybklkID09PSB0dXJuSWQsXG5cdFx0XHQxMjBfMDAwLFxuXHRcdCk7XG5cdFx0Y29uc3Qgcm9sbG91dFJvb3QgPSBqb2luKHVzZXJIb21lRGlyLCAnLmNvZGV4JywgJ3Nlc3Npb25zJyk7XG5cdFx0Y29uc3Qgcm9sbG91dEZpbGVzID0gKGF3YWl0IHJlYWRkaXIocm9sbG91dFJvb3QsIHsgcmVjdXJzaXZlOiB0cnVlIH0pKS5maWx0ZXIoZmlsZSA9PiBmaWxlLmVuZHNXaXRoKCcuanNvbmwnKSk7XG5cdFx0Y29uc3Qgcm9sbG91dENvbnRlbnRzID0gYXdhaXQgUHJvbWlzZS5hbGwocm9sbG91dEZpbGVzLm1hcChmaWxlID0+IHJlYWRGaWxlKGpvaW4ocm9sbG91dFJvb3QsIGZpbGUpLCAndXRmOCcpKSk7XG5cdFx0YXNzZXJ0Lm9rKHJvbGxvdXRDb250ZW50cy5zb21lKGNvbnRlbnQgPT4gY29udGVudC5pbmNsdWRlcygnQ09ERVhfQ1VTVE9NSVpBVElPTlNfT0snKSksICdDb2RleCB0ZXN0IHJvbGxvdXRzIG11c3QgYmUgd3JpdHRlbiB1bmRlciB0aGUgaXNvbGF0ZWQgdGVzdCBob21lJyk7XG5cblx0XHRjb25zdCByZXF1ZXN0cyA9IChzZXJ2ZXIubW9ja0xsbT8uZ2V0UmVxdWVzdHM/LigpID8/IFtdKSBhcyByZWFkb25seSBJQ2FwdHVyZWRSZXF1ZXN0W107XG5cdFx0Y29uc3QgcmVzcG9uc2VzUmVxdWVzdCA9IFsuLi5yZXF1ZXN0c10ucmV2ZXJzZSgpLmZpbmQocmVxdWVzdCA9PiByZXF1ZXN0LnBhdGguaW5jbHVkZXMoJy9yZXNwb25zZXMnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3BvbnNlc1JlcXVlc3QsIGBleHBlY3RlZCBhIENvZGV4IC9yZXNwb25zZXMgcmVxdWVzdDsgZ290IHBhdGhzOiAke3JlcXVlc3RzLm1hcChyZXF1ZXN0ID0+IHJlcXVlc3QucGF0aCkuam9pbignLCAnKX1gKTtcblx0XHRjb25zdCByZXF1ZXN0VGV4dCA9IEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlc1JlcXVlc3QuYm9keSk7XG5cdFx0Y29uc3QgZGV2ZWxvcGVyVGV4dCA9IGRldmVsb3BlcklucHV0VGV4dChyZXNwb25zZXNSZXF1ZXN0LmJvZHkpO1xuXHRcdGFzc2VydC5vayhkZXZlbG9wZXJUZXh0LmluY2x1ZGVzKEFHRU5UX01BUktFUiksICdzZWxlY3RlZCBjdXN0b20tYWdlbnQgaW5zdHJ1Y3Rpb25zIG11c3QgcmVhY2ggdGhlIENvZGV4IGRldmVsb3BlciBtZXNzYWdlJyk7XG5cdFx0YXNzZXJ0Lm9rKGRldmVsb3BlclRleHQuaW5jbHVkZXMoUlVMRV9NQVJLRVIpLCAncGx1Z2luIGluc3RydWN0aW9ucyBtdXN0IHJlYWNoIHRoZSBDb2RleCBkZXZlbG9wZXIgbWVzc2FnZScpO1xuXHRcdGFzc2VydC5vayhyZXF1ZXN0VGV4dC5pbmNsdWRlcyhTS0lMTF9NQVJLRVIpLCAncGx1Z2luIHNraWxscyBtdXN0IGJlIGFkdmVydGlzZWQgaW4gdGhlIENvZGV4IG1vZGVsIHJlcXVlc3QnKTtcblx0XHRhc3NlcnQub2socmVxdWVzdFRleHQuaW5jbHVkZXMoTUNQX01BUktFUiksICdwbHVnaW4gTUNQIHRvb2xzIG11c3QgYmUgYWR2ZXJ0aXNlZCBpbiB0aGUgQ29kZXggbW9kZWwgcmVxdWVzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3Jrc3BhY2UgYWdlbnQgaXMgZXhwb3NlZCBhbmQgc2VsZWN0ZWQgd2l0aG91dCBjbGllbnQgY3VzdG9taXphdGlvbiBzeW5jJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZURpciA9IGF3YWl0IG1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ2NvZGV4LXdvcmtzcGFjZS1hZ2VudC0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2VEaXIpO1xuXHRcdGNvbnN0IGFnZW50c0RpciA9IGpvaW4od29ya3NwYWNlRGlyLCAnLmdpdGh1YicsICdhZ2VudHMnKTtcblx0XHRjb25zdCBhZ2VudEZpbGUgPSBqb2luKGFnZW50c0RpciwgJ3dvcmtzcGFjZS1yZXZpZXdlci5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IGFnZW50VXJpID0gVVJJLmZpbGUoYWdlbnRGaWxlKS50b1N0cmluZygpO1xuXHRcdGF3YWl0IG1rZGlyKGFnZW50c0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0YXdhaXQgd3JpdGVGaWxlKGFnZW50RmlsZSwgW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnbmFtZTogV29ya3NwYWNlIFJldmlld2VyJyxcblx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyB0aGlzIHdvcmtzcGFjZS4nLFxuXHRcdFx0Jy0tLScsXG5cdFx0XHRgQWx3YXlzIGZvbGxvdyAke1dPUktTUEFDRV9BR0VOVF9NQVJLRVJ9LmAsXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cblx0XHRjb25zdCBjbGllbnRJZCA9ICdjb2RleC13b3Jrc3BhY2UtYWdlbnQtY2xpZW50Jztcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSwgY2xpZW50SWQgfSwgMzBfMDAwKTtcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgnYXV0aGVudGljYXRlJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgcmVzb3VyY2U6ICdodHRwczovL2FwaS5naXRodWIuY29tJywgdG9rZW46ICdub3QtYS1yZWFsLXRva2VuJyB9LCAzMF8wMDApO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvZGV4JywgcGF0aDogYC8ke2dlbmVyYXRlVXVpZCgpfWAgfSkudG9TdHJpbmcoKTtcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgnY3JlYXRlU2Vzc2lvbicsIHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRwcm92aWRlcjogJ2NvZGV4Jyxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKHdvcmtzcGFjZURpcikudG9TdHJpbmcoKV0sXG5cdFx0XHRjb25maWc6IHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9LFxuXHRcdFx0YWN0aXZlQ2xpZW50OiB7IGNsaWVudElkLCB0b29sczogW10sIGN1c3RvbWl6YXRpb25zOiBbXSB9LFxuXHRcdH0sIDMwXzAwMCk7XG5cdFx0Y3JlYXRlZFNlc3Npb25zLnB1c2goc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0pO1xuXHRcdGF3YWl0IGNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSB9KTtcblx0XHRjbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXG5cdFx0Y29uc3QgZGlyZWN0b3J5ID0gYXdhaXQgd2FpdEZvcldvcmtzcGFjZUFnZW50KGNsaWVudCwgc2Vzc2lvblVyaSwgYWdlbnRVcmkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlyZWN0b3J5LmNoaWxkcmVuPy5tYXAoY2hpbGQgPT4gKHsgdHlwZTogY2hpbGQudHlwZSwgbmFtZTogY2hpbGQubmFtZSwgdXJpOiBjaGlsZC51cmkgfSkpLCBbe1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsXG5cdFx0XHRuYW1lOiAnV29ya3NwYWNlIFJldmlld2VyJyxcblx0XHRcdHVyaTogYWdlbnRVcmksXG5cdFx0fV0pO1xuXG5cdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tY29kZXgtd29ya3NwYWNlLWFnZW50Jztcblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSxcblx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI2LTA4LTEzVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ1JlcGx5IHdpdGggZXhhY3RseSBDT0RFWF9XT1JLU1BBQ0VfQUdFTlRfT0suJyxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdGFnZW50OiB7IHVyaTogYWdlbnRVcmkgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obm90aWZpY2F0aW9uID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihub3RpZmljYXRpb24sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShub3RpZmljYXRpb24pLmNoYW5uZWwgPT09IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSlcblx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShub3RpZmljYXRpb24pLmFjdGlvbiBhcyB7IHR1cm5JZD86IHN0cmluZyB9KS50dXJuSWQgPT09IHR1cm5JZCxcblx0XHRcdDEyMF8wMDAsXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlcXVlc3RzID0gKHNlcnZlci5tb2NrTGxtPy5nZXRSZXF1ZXN0cz8uKCkgPz8gW10pIGFzIHJlYWRvbmx5IElDYXB0dXJlZFJlcXVlc3RbXTtcblx0XHRjb25zdCByZXNwb25zZXNSZXF1ZXN0ID0gWy4uLnJlcXVlc3RzXS5yZXZlcnNlKCkuZmluZChyZXF1ZXN0ID0+IHJlcXVlc3QucGF0aC5pbmNsdWRlcygnL3Jlc3BvbnNlcycpKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2VzUmVxdWVzdCwgYGV4cGVjdGVkIGEgQ29kZXggL3Jlc3BvbnNlcyByZXF1ZXN0OyBnb3QgcGF0aHM6ICR7cmVxdWVzdHMubWFwKHJlcXVlc3QgPT4gcmVxdWVzdC5wYXRoKS5qb2luKCcsICcpfWApO1xuXHRcdGFzc2VydC5vayhkZXZlbG9wZXJJbnB1dFRleHQocmVzcG9uc2VzUmVxdWVzdC5ib2R5KS5pbmNsdWRlcyhXT1JLU1BBQ0VfQUdFTlRfTUFSS0VSKSwgJ3NlbGVjdGVkIHdvcmtzcGFjZS1hZ2VudCBpbnN0cnVjdGlvbnMgbXVzdCByZWFjaCB0aGUgQ29kZXggZGV2ZWxvcGVyIG1lc3NhZ2UnKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhbmRhbG9uZSBob3N0IHJlZ2lzdGVycyBDb2RleCBhZnRlciBydW50aW1lIGVuYWJsZW1lbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDEyMF8wMDApO1xuXHRcdGNvbnN0IHJ1bnRpbWVIb21lRGlyID0gYXdhaXQgbWtkdGVtcChqb2luKHRtcGRpcigpLCAnY29kZXgtcnVudGltZS1lbmFibGVtZW50LWhvbWUtJykpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZURpciA9IGF3YWl0IG1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ2NvZGV4LXJ1bnRpbWUtZW5hYmxlbWVudC0nKSk7XG5cdFx0Y29uc3QgcnVudGltZUNvZGV4SG9tZURpciA9IGpvaW4ocnVudGltZUhvbWVEaXIsICcuY29kZXgnKTtcblx0XHRhd2FpdCBta2RpcihydW50aW1lQ29kZXhIb21lRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRjb25zdCBydW50aW1lU2VydmVyID0gYXdhaXQgc3RhcnRSZWFsU2VydmVyKHtcblx0XHRcdG1vY2tMbG06IHRydWUsXG5cdFx0XHRjb2RleFNka1Jvb3Q6IENPREVYX1NES19ST09ULFxuXHRcdFx0Y29kZXhIb21lRGlyOiBydW50aW1lQ29kZXhIb21lRGlyLFxuXHRcdFx0Y29kZXhBZ2VudEVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0aG9tZURpcjogcnVudGltZUhvbWVEaXIsXG5cdFx0XHR1c2VyRGF0YURpcjogam9pbihydW50aW1lSG9tZURpciwgJ3VzZXItZGF0YScpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJ1bnRpbWVDbGllbnQgPSBuZXcgVGVzdFByb3RvY29sQ2xpZW50KHJ1bnRpbWVTZXJ2ZXIucG9ydCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHJ1bnRpbWVDbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0YXdhaXQgcnVudGltZUNsaWVudC5jYWxsKCdpbml0aWFsaXplJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgcHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLCBjbGllbnRJZDogJ2NvZGV4LXJ1bnRpbWUtZW5hYmxlbWVudC1jbGllbnQnIH0sIDMwXzAwMCk7XG5cdFx0XHRhd2FpdCBydW50aW1lQ2xpZW50LmNhbGwoJ2F1dGhlbnRpY2F0ZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsIHRva2VuOiAnbm90LWEtcmVhbC10b2tlbicgfSwgMzBfMDAwKTtcblx0XHRcdGF3YWl0IHJ1bnRpbWVDbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdFx0cnVudGltZUNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0XHRydW50aW1lQ2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsIGNvbmZpZzogeyBbQWdlbnRIb3N0Q29kZXhFbmFibGVkQ29uZmlnS2V5XTogdHJ1ZSB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHJ1bnRpbWVDbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihub3RpZmljYXRpb24gPT5cblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obm90aWZpY2F0aW9uLCBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkKVxuXHRcdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobm90aWZpY2F0aW9uKS5hY3Rpb24gYXMgeyByZWFkb25seSBjb25maWc/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj4gfSkuY29uZmlnPy5bQWdlbnRIb3N0Q29kZXhFbmFibGVkQ29uZmlnS2V5XSA9PT0gdHJ1ZSxcblx0XHRcdFx0MzBfMDAwLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29kZXgnLCBwYXRoOiBgLyR7Z2VuZXJhdGVVdWlkKCl9YCB9KS50b1N0cmluZygpO1xuXHRcdFx0YXdhaXQgcnVudGltZUNsaWVudC5jYWxsKCdjcmVhdGVTZXNzaW9uJywge1xuXHRcdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLFxuXHRcdFx0XHRwcm92aWRlcjogJ2NvZGV4Jyxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUod29ya3NwYWNlRGlyKS50b1N0cmluZygpXSxcblx0XHRcdFx0Y29uZmlnOiB7IGlzb2xhdGlvbjogJ2ZvbGRlcicgfSxcblx0XHRcdH0sIDMwXzAwMCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJ1bnRpbWVDbGllbnQuY2xvc2UoKTtcblx0XHRcdGF3YWl0IHN0b3BTZXJ2ZXIocnVudGltZVNlcnZlcik7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHJtKHJ1bnRpbWVIb21lRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUsIG1heFJldHJpZXM6IDUsIHJldHJ5RGVsYXk6IDIwMCB9KSxcblx0XHRcdFx0cm0od29ya3NwYWNlRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUsIG1heFJldHJpZXM6IDUsIHJldHJ5RGVsYXk6IDIwMCB9KSxcblx0XHRcdF0pO1xuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQVNBLE9BQU8sWUFBWTtBQUNuQixTQUFTLE9BQU8sU0FBUyxVQUFVLFNBQVMsSUFBSSxpQkFBaUI7QUFDakUsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxxQkFBcUIsaUJBQWlCLG1CQUFtQixhQUFhLHNCQUFtSztBQUNsUCxTQUFTLHNCQUFzQixtQkFBbUIsc0JBQTBDLGlCQUFpQixZQUFZLDBCQUEwQjtBQUNuSixTQUFTLHNCQUFzQjtBQUUvQixNQUFNLGVBQWU7QUFDckIsTUFBTSx5QkFBeUI7QUFDL0IsTUFBTSxjQUFjO0FBQ3BCLE1BQU0sZUFBZTtBQUNyQixNQUFNLGFBQWE7QUFDbkIsTUFBTSxjQUFjLGNBQWMsWUFBWSxHQUFHO0FBT2pELFNBQVMsbUJBQW1CLE1BQXVCO0FBQ2xELFFBQU0sUUFBUyxNQUFtRDtBQUNsRSxTQUFPLE1BQU0sUUFBUSxLQUFLLElBQ3ZCLEtBQUssVUFBVSxNQUFNLE9BQU8sVUFBUSxRQUFRLE9BQU8sU0FBUyxZQUFhLEtBQXFDLFNBQVMsV0FBVyxDQUFDLElBQ25JO0FBQ0o7QUFFQSxlQUFlLG9CQUFvQixRQUE0QixZQUFvQixXQUFpRDtBQUNuSSxRQUFNLFdBQVcsS0FBSyxJQUFJLElBQUk7QUFDOUIsTUFBSTtBQUNKLFNBQU8sS0FBSyxJQUFJLElBQUksVUFBVTtBQUM3QixVQUFNLFVBQVUsTUFBTSxxQkFBcUIsUUFBUSxVQUFVO0FBQzdELFVBQU0sU0FBUyxRQUFRLGdCQUFnQjtBQUFBLE1BQUssQ0FBQyxrQkFDNUMsY0FBYyxTQUFTLGtCQUFrQixVQUN0QyxjQUFj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
