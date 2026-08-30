import assert from "assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { retry } from "../../../../../../base/common/async.js";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { CompletionItemKind } from "../../../../common/state/protocol/commands.js";
import { PROTOCOL_VERSION } from "../../../../common/state/protocol/version/registry.js";
import { CustomizationEnablementKind, McpServerStatus } from "../../../../common/state/protocol/state.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { buildDefaultChatUri, ChatInputAnswerState, ChatInputAnswerValueKind, customizationId, CustomizationType, ResponsePartKind, ROOT_STATE_URI } from "../../../../common/state/sessionState.js";
import { createRealSession, driveTurnToCompletion, driveTurnWithAnswersToCompletion, driveTurnWithCancelledInputToCompletion, resolveGitHubToken, textFromContent } from "../harness/agentHostE2ETestHarness.js";
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { providerHostOnlyTest } from "./e2eTestContext.js";
const nodeRequire = createRequire(import.meta.url);
function defineMcpPluginTests(context) {
  if (context.tier !== "parity") {
    return;
  }
  const { config, createdSessions, tempDirs } = context;
  if (config.provider === "claude") {
    return;
  }
  async function createPluginSession(prefix, options = {}) {
    const workspace = mkdtempSync(join(tmpdir(), `ahp-mcp-workspace-${prefix}-`));
    const plugin = mkdtempSync(join(tmpdir(), `ahp-mcp-plugin-${prefix}-`));
    tempDirs.push(workspace, plugin);
    const manifestDirectory = config.provider === "claude" ? ".claude-plugin" : ".plugin";
    for (const directory of [
      join(plugin, manifestDirectory),
      join(plugin, "agents"),
      join(plugin, "rules"),
      join(plugin, "skills", "probe-skill")
    ]) {
      mkdirSync(directory, { recursive: true });
    }
    let hookLog;
    if (options.hookType) {
      const hooksDirectory = join(plugin, "hooks");
      mkdirSync(hooksDirectory, { recursive: true });
      hookLog = join(plugin, "hook.log");
      const hookScript = join(plugin, "record-hook.cjs");
      writeFileSync(hookScript, [
        'const fs = require("fs");',
        "const [log, tag, exitCode, stdout] = process.argv.slice(2);",
        'let input = "";',
        'process.stdin.setEncoding("utf8");',
        'process.stdin.on("data", chunk => input += chunk);',
        'process.stdin.on("end", () => {',
        "  fs.appendFileSync(log, `${tag}:${input}\\n`);",
        "  if (stdout) { process.stdout.write(stdout); }",
        "  process.exit(Number(exitCode));",
        "});"
      ].join("\n"));
      const command = [process.execPath, hookScript, hookLog, options.hookType, String(options.hookExitCode ?? 0), options.hookStdout ?? ""].map((value) => JSON.stringify(value)).join(" ");
      writeFileSync(join(hooksDirectory, "hooks.json"), JSON.stringify({
        hooks: {
          [options.hookType]: [{ hooks: [{ type: "command", command }] }]
        }
      }));
    }
    const mcpScript = join(plugin, "probe-mcp.cjs");
    const mcpServerModule = nodeRequire.resolve("@modelcontextprotocol/sdk/server/index.js");
    const mcpStdioModule = nodeRequire.resolve("@modelcontextprotocol/sdk/server/stdio.js");
    const mcpTypesModule = nodeRequire.resolve("@modelcontextprotocol/sdk/types.js");
    const pluginName = options.pluginName ?? "E2E MCP Plugin";
    writeFileSync(join(plugin, manifestDirectory, "plugin.json"), JSON.stringify({ name: pluginName }));
    writeFileSync(join(plugin, "agents", "probe.agent.md"), "---\nname: Probe Agent\ndescription: Uses the probe MCP server\n---\nUse the probe tool when asked.");
    writeFileSync(join(plugin, "rules", "probe.instructions.md"), '---\napplyTo:\n  - "**/*"\n---\nPrefer the customization_probe tool.');
    writeFileSync(join(plugin, "skills", "probe-skill", "SKILL.md"), "---\nname: probe-skill\ndescription: Uses the customization probe\n---\nCall customization_probe.");
    writeFileSync(mcpScript, [
      `const { Server } = require(${JSON.stringify(mcpServerModule)});`,
      `const { StdioServerTransport } = require(${JSON.stringify(mcpStdioModule)});`,
      `const { CallToolRequestSchema, ListToolsRequestSchema } = require(${JSON.stringify(mcpTypesModule)});`,
      `const server = new Server({ name: "e2e-mcp-plugin", version: "1.0.0" }, { capabilities: { tools: {} } });`,
      `server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [`,
      `  { name: "customization_probe", description: "Returns MCP_PLUGIN_RESULT", inputSchema: { type: "object", properties: {} } },`,
      `  { name: "customization_elicit_form", description: "Asks for structured values and returns them", inputSchema: { type: "object", properties: {} } },`,
      `  { name: "customization_elicit_extended", description: "Asks for text, number, and multiple selections", inputSchema: { type: "object", properties: {} } },`,
      `  { name: "customization_elicit_coercion", description: "Asks for values that can be represented by different AHP answer kinds", inputSchema: { type: "object", properties: {} } },`,
      `  { name: "customization_elicit_url", description: "Asks the user to approve opening a URL", inputSchema: { type: "object", properties: {} } },`,
      `  { name: "customization_sample", description: "Samples a nested model response", inputSchema: { type: "object", properties: {} } },`,
      `] }));`,
      `server.setRequestHandler(CallToolRequestSchema, async request => {`,
      `  if (request.params.name === "customization_elicit_form") {`,
      `    const result = await server.elicitInput({ mode: "form", message: "Choose values", requestedSchema: {`,
      `      type: "object",`,
      `      properties: {`,
      `        choice: { type: "string", title: "Choice", enum: ["Apple", "Banana"], default: "Apple" },`,
      `        count: { type: "integer", title: "Count", minimum: 1, maximum: 5, default: 3 },`,
      `        confirmed: { type: "boolean", title: "Confirmed", default: true },`,
      `      },`,
      `      required: ["choice", "count", "confirmed"],`,
      `    } });`,
      `    const value = result.content || {};`,
      `    return { content: [{ type: "text", text: \`ELICIT_FORM:\${result.action}:\${value.choice}:\${value.count}:\${value.confirmed}\` }] };`,
      `  }`,
      `  if (request.params.name === "customization_elicit_url") {`,
      `    const result = await server.elicitInput({ mode: "url", message: "Open the documentation", url: "https://example.com/docs", elicitationId: "e2e-url" });`,
      `    return { content: [{ type: "text", text: \`ELICIT_URL:\${result.action}\` }] };`,
      `  }`,
      `  if (request.params.name === "customization_elicit_coercion") {`,
      `    const result = await server.elicitInput({ mode: "form", message: "Provide coercion values", requestedSchema: {`,
      `      type: "object",`,
      `      properties: {`,
      `        enabled: { type: "boolean", title: "Enabled" },`,
      `        ratio: { type: "number", title: "Ratio" },`,
      `        colors: { type: "array", title: "Colors", items: { type: "string", enum: ["Red", "Blue"] } },`,
      `        choice: { type: "string", title: "Choice", enum: ["Apple", "Banana"] },`,
      `      },`,
      `      required: ["enabled", "ratio", "colors", "choice"],`,
      `    } });`,
      `    const value = result.content || {};`,
      `    return { content: [{ type: "text", text: \`COERCION:\${typeof value.enabled}:\${value.enabled}:\${typeof value.ratio}:\${value.ratio}:\${Array.isArray(value.colors) ? "array" : typeof value.colors}:\${(value.colors || []).join("+")}:\${typeof value.choice}:\${value.choice}\` }] };`,
      `  }`,
      `  if (request.params.name === "customization_elicit_extended") {`,
      `    const result = await server.elicitInput({ mode: "form", message: "Provide extended values", requestedSchema: {`,
      `      type: "object",`,
      `      properties: {`,
      `        note: { type: "string", title: "Note", default: "sample" },`,
      `        ratio: { type: "number", title: "Ratio", minimum: 0, maximum: 10, default: 2.5 },`,
      `        colors: { type: "array", title: "Colors", items: { type: "string", enum: ["Red", "Blue"] }, default: ["Red"] },`,
      `      },`,
      `      required: ["note", "ratio", "colors"],`,
      `    } });`,
      `    const value = result.content || {};`,
      `    return { content: [{ type: "text", text: \`ELICIT_EXTENDED:\${result.action}:\${value.note}:\${value.ratio}:\${(value.colors || []).join("+")}\` }] };`,
      `  }`,
      `  if (request.params.name === "customization_sample") {`,
      `    const result = await server.createMessage({ messages: [{ role: "user", content: { type: "text", text: "Reply exactly MCP_SAMPLE_INNER" } }], maxTokens: 32 });`,
      `    const blocks = Array.isArray(result.content) ? result.content : [result.content];`,
      `    const text = blocks.filter(block => block && block.type === "text").map(block => block.text).join("");`,
      `    return { content: [{ type: "text", text: \`MCP_SAMPLE:\${text}\` }] };`,
      `  }`,
      `  return { content: [{ type: "text", text: "MCP_PLUGIN_RESULT" }] };`,
      `});`,
      "void server.connect(new StdioServerTransport());"
    ].join("\n"));
    writeFileSync(join(plugin, ".mcp.json"), JSON.stringify({
      mcpServers: {
        customization_probe_server: {
          command: process.execPath,
          args: [mcpScript],
          env: { ELECTRON_RUN_AS_NODE: "1" }
        }
      }
    }));
    const pluginUri = URI.file(plugin).toString();
    const clientId = `mcp-plugin-${prefix}-${config.provider}`;
    const sessionUri = await createRealSession(context.client, config, clientId, createdSessions, URI.file(workspace));
    const customization = {
      type: CustomizationType.Plugin,
      id: customizationId(pluginUri),
      uri: pluginUri,
      name: pluginName,
      nonce: "1",
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }]
    };
    context.client.dispatch({
      channel: sessionUri,
      clientSeq: 1,
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: { clientId, tools: [], customizations: [customization] }
      }
    });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "session/activeClientSet") && getActionEnvelope(n).channel === sessionUri,
      3e4
    );
    return { sessionUri, pluginUri, clientId, workspace, hookLog };
  }
  async function pluginState(sessionUri, pluginUri) {
    return retry(async () => {
      const result = await context.client.call("subscribe", { channel: sessionUri });
      const plugin = result.snapshot.state.customizations?.find((customization) => customization.type === CustomizationType.Plugin && customization.uri === pluginUri);
      if (!plugin || !plugin.children?.some((child) => child.type === CustomizationType.McpServer)) {
        throw new Error("Plugin customizations are not ready");
      }
      return plugin;
    }, 100, 100);
  }
  async function mcpServerState(sessionUri, pluginUri) {
    const plugin = await pluginState(sessionUri, pluginUri);
    const server = plugin.children?.find((child) => child.type === CustomizationType.McpServer);
    assert.ok(server);
    return server;
  }
  function toolResultTexts(sessionUri, turnId) {
    return context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallComplete")).map((n) => ({ envelope: getActionEnvelope(n), action: getActionEnvelope(n).action })).filter(({ envelope, action }) => envelope.channel === buildDefaultChatUri(sessionUri) && action.turnId === turnId).map(({ action }) => textFromContent(action.result.content ?? []));
  }
  async function waitForHook(hookLog, hookType) {
    assert.ok(hookLog);
    return retry(async () => {
      if (!existsSync(hookLog)) {
        throw new Error(`${hookType} hook has not run`);
      }
      const content = readFileSync(hookLog, "utf8");
      if (!content.includes(`${hookType}:`)) {
        throw new Error(`${hookType} hook has not recorded input`);
      }
      return content;
    }, 100, 100);
  }
  async function driveCoercionTurn(sessionUri, turnId, answers) {
    await driveTurnWithAnswersToCompletion(
      context.client,
      sessionUri,
      turnId,
      "Call customization_elicit_coercion exactly once, then reply with only its exact result.",
      2,
      answers
    );
  }
  providerHostOnlyTest(context, "client plugin exposes agent rule skill and MCP server customizations", async function() {
    const { sessionUri, pluginUri } = await createPluginSession("catalog");
    const plugin = await pluginState(sessionUri, pluginUri);
    assert.deepStrictEqual(
      new Set(plugin.children?.map((child) => child.type)),
      /* @__PURE__ */ new Set([CustomizationType.Agent, CustomizationType.Rule, CustomizationType.Skill, CustomizationType.McpServer])
    );
  });
  providerHostOnlyTest(context, "client plugin can be disabled and enabled through AHP", async function() {
    const { sessionUri, pluginUri } = await createPluginSession("toggle");
    const plugin = await pluginState(sessionUri, pluginUri);
    context.client.dispatch({
      channel: sessionUri,
      clientSeq: 10,
      action: { type: ActionType.SessionCustomizationToggled, id: plugin.id, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }
    });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "session/customizationToggled") && getActionEnvelope(n).channel === sessionUri,
      3e4
    );
    assert.deepStrictEqual((await pluginState(sessionUri, pluginUri)).enablement, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
    context.client.dispatch({
      channel: sessionUri,
      clientSeq: 11,
      action: { type: ActionType.SessionCustomizationToggled, id: plugin.id, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }] }
    });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "session/customizationToggled") && getActionEnvelope(n).channel === sessionUri,
      3e4
    );
    assert.deepStrictEqual((await pluginState(sessionUri, pluginUri)).enablement, [{ kind: CustomizationEnablementKind.Global, enabled: true }]);
  });
  providerHostOnlyTest(context, "removing the active client removes its plugin customization", async function() {
    const { sessionUri, pluginUri, clientId } = await createPluginSession("remove");
    const plugin = await pluginState(sessionUri, pluginUri);
    context.client.clearReceived();
    context.client.dispatch({
      channel: sessionUri,
      clientSeq: 10,
      action: { type: ActionType.SessionActiveClientRemoved, clientId }
    });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "session/activeClientRemoved") && getActionEnvelope(n).channel === sessionUri,
      3e4
    );
    await retry(async () => {
      const result = await context.client.call("subscribe", { channel: sessionUri });
      const customizations = result.snapshot.state.customizations ?? [];
      if (customizations.some((customization) => customization.id === plugin.id)) {
        throw new Error("Plugin customization has not been removed");
      }
    }, 100, 100);
  }, config.provider !== "codex");
  const modelBackedEnabled = config.provider === "copilotcli";
  if (modelBackedEnabled) {
    const pluginHookTest = context.isWindows ? test.skip : test;
    (context.runKnownIssueTests ? test : test.skip)("plugin skill is included in leading slash completions", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri } = await createPluginSession("skill-completion-leading", { pluginName: "e2e-probe" });
      await pluginState(sessionUri, pluginUri);
      await driveTurnToCompletion(context.client, sessionUri, "turn-skill-completion-leading", 'Reply exactly "ready".', 2);
      const completions = await context.client.call("completions", {
        channel: buildDefaultChatUri(sessionUri),
        kind: CompletionItemKind.UserMessage,
        text: "/E2E",
        offset: 4
      });
      assert.ok(completions.items.some((item) => item.insertText.includes("probe-skill")));
    });
    (context.runKnownIssueTests ? test : test.skip)("plugin skill is included in whitespace slash completions without runtime commands", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri } = await createPluginSession("skill-completion-whitespace", { pluginName: "e2e-probe" });
      await pluginState(sessionUri, pluginUri);
      await driveTurnToCompletion(context.client, sessionUri, "turn-skill-completion-whitespace", 'Reply exactly "ready".', 2);
      const completions = await context.client.call("completions", {
        channel: buildDefaultChatUri(sessionUri),
        kind: CompletionItemKind.UserMessage,
        text: "Use /E2E",
        offset: 8
      });
      assert.ok(completions.items.some((item) => item.insertText.includes("probe-skill")));
    });
    test("plugin skill invocation is routed through the provider skill lifecycle", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri } = await createPluginSession("skill-invocation");
      await pluginState(sessionUri, pluginUri);
      const turnId = "turn-skill-invocation";
      await driveTurnToCompletion(context.client, sessionUri, turnId, "Invoke the probe-skill skill exactly once, follow its instructions, then reply with only the customization probe result.", 2);
      assert.ok(toolResultTexts(sessionUri, turnId).includes("MCP_PLUGIN_RESULT"));
    });
    (context.runKnownIssueTests ? test : test.skip)("plugin skill lifecycle is reconstructed after a host restart", async function() {
      this.timeout(24e4);
      const { sessionUri, pluginUri, workspace } = await createPluginSession("skill-history-restart");
      await pluginState(sessionUri, pluginUri);
      const turnId = "turn-skill-history-restart";
      await driveTurnToCompletion(context.client, sessionUri, turnId, "Invoke the probe-skill skill exactly once, follow its instructions, then reply with only the customization probe result.", 2);
      const before = await fetchSessionWithChat(context.client, sessionUri);
      const beforeToolNames = before.turns.find((turn) => turn.id === turnId)?.responseParts.filter((part) => part.kind === ResponsePartKind.ToolCall).map((part) => part.toolCall.toolName) ?? [];
      await context.restartServer();
      context.client.setWorkingDirectory(workspace);
      await context.client.call("initialize", {
        channel: ROOT_STATE_URI,
        protocolVersions: [PROTOCOL_VERSION],
        clientId: "skill-history-restart-client"
      }, 3e4);
      await context.client.call("authenticate", {
        channel: ROOT_STATE_URI,
        resource: "https://api.github.com",
        token: config.githubToken ?? resolveGitHubToken()
      }, 3e4);
      await context.client.call("subscribe", { channel: sessionUri });
      const restored = await fetchSessionWithChat(context.client, sessionUri);
      const restoredToolNames = restored.turns.find((turn) => turn.id === turnId)?.responseParts.filter((part) => part.kind === ResponsePartKind.ToolCall).map((part) => part.toolCall.toolName) ?? [];
      assert.deepStrictEqual(restoredToolNames, beforeToolNames);
    });
    pluginHookTest("plugin SessionStart hook runs when the provider materializes", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri, hookLog } = await createPluginSession("hook-session-start", { hookType: "SessionStart" });
      await pluginState(sessionUri, pluginUri);
      await driveTurnToCompletion(context.client, sessionUri, "turn-hook-session-start", 'Reply exactly "ready".', 2);
      await waitForHook(hookLog, "SessionStart");
    });
    pluginHookTest("plugin UserPromptSubmit hook receives the submitted prompt", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri, hookLog } = await createPluginSession("hook-user-prompt", { hookType: "UserPromptSubmit" });
      await pluginState(sessionUri, pluginUri);
      await driveTurnToCompletion(context.client, sessionUri, "turn-hook-user-prompt", 'Reply exactly "HOOK_PROMPT_READY".', 2);
      const hookContent = await waitForHook(hookLog, "UserPromptSubmit");
      assert.ok(hookContent.includes("HOOK_PROMPT_READY"));
    });
    pluginHookTest("plugin PreToolUse hook runs before an MCP tool", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri, hookLog } = await createPluginSession("hook-pre-tool", { hookType: "PreToolUse" });
      await pluginState(sessionUri, pluginUri);
      await driveTurnToCompletion(context.client, sessionUri, "turn-hook-pre-tool", "Call customization_probe exactly once, then reply with only its exact result.", 2);
      const hookContent = await waitForHook(hookLog, "PreToolUse");
      assert.ok(hookContent.includes("customization_probe"));
    });
    pluginHookTest("plugin PostToolUse hook runs after an MCP tool result", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri, hookLog } = await createPluginSession("hook-post-tool", { hookType: "PostToolUse" });
      await pluginState(sessionUri, pluginUri);
      await driveTurnToCompletion(context.client, sessionUri, "turn-hook-post-tool", "Call customization_probe exactly once, then reply with only its exact result.", 2);
      const hookContent = await waitForHook(hookLog, "PostToolUse");
      assert.ok(hookContent.includes("MCP_PLUGIN_RESULT"));
    });
    pluginHookTest("plugin SessionEnd hook runs when the session is disposed", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri, hookLog } = await createPluginSession("hook-session-end", { hookType: "SessionEnd" });
      await pluginState(sessionUri, pluginUri);
      await driveTurnToCompletion(context.client, sessionUri, "turn-hook-session-end", 'Reply exactly "ready".', 2);
      await context.client.call("disposeSession", { channel: sessionUri }, 3e4);
      createdSessions.splice(createdSessions.indexOf(sessionUri), 1);
      await waitForHook(hookLog, "SessionEnd");
    });
    pluginHookTest("failing plugin hook is non-fatal to the provider turn", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri, hookLog } = await createPluginSession("hook-failure", { hookType: "UserPromptSubmit", hookExitCode: 7 });
      await pluginState(sessionUri, pluginUri);
      const result = await driveTurnToCompletion(context.client, sessionUri, "turn-hook-failure", 'Reply exactly "HOOK_FAILURE_SURVIVED".', 2);
      await waitForHook(hookLog, "UserPromptSubmit");
      assert.strictEqual(result.responseText.trim(), "HOOK_FAILURE_SURVIVED");
    });
    pluginHookTest("non-JSON plugin hook output is ignored without failing the provider turn", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri, hookLog } = await createPluginSession("hook-non-json", { hookType: "PostToolUse", hookStdout: "not-json" });
      await pluginState(sessionUri, pluginUri);
      const turnId = "turn-hook-non-json";
      const result = await driveTurnToCompletion(context.client, sessionUri, turnId, "Call customization_probe exactly once, then reply with only its exact result.", 2);
      await waitForHook(hookLog, "PostToolUse");
      assert.ok(result.responseText.includes("MCP_PLUGIN_RESULT"));
    });
    test("plugin MCP tool executes and returns its result to the model", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri } = await createPluginSession("tool");
      await pluginState(sessionUri, pluginUri);
      await driveTurnToCompletion(
        context.client,
        sessionUri,
        "turn-mcp-plugin-tool",
        "Call customization_probe exactly once, then reply with only its exact result.",
        2
      );
      assert.ok(toolResultTexts(sessionUri, "turn-mcp-plugin-tool").includes("MCP_PLUGIN_RESULT"));
    });
    test("plugin MCP server can be stopped and restarted through AHP", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri } = await createPluginSession("lifecycle");
      await pluginState(sessionUri, pluginUri);
      await driveTurnToCompletion(context.client, sessionUri, "turn-mcp-plugin-ready", 'Reply exactly "ready".', 2);
      const ready = await retry(async () => {
        const server = await mcpServerState(sessionUri, pluginUri);
        if (server.state.kind !== McpServerStatus.Ready) {
          throw new Error(`MCP server is ${server.state.kind}`);
        }
        return server;
      }, 100, 100);
      context.client.dispatch({
        channel: sessionUri,
        clientSeq: 10,
        action: { type: ActionType.SessionMcpServerStopRequested, id: ready.id }
      });
      await context.client.waitForNotification(
        (n) => isActionNotification(n, "session/mcpServerStopRequested") && getActionEnvelope(n).channel === sessionUri,
        3e4
      );
      await retry(async () => {
        assert.strictEqual((await mcpServerState(sessionUri, pluginUri)).state.kind, McpServerStatus.Stopped);
      }, 100, 100);
      context.client.dispatch({
        channel: sessionUri,
        clientSeq: 11,
        action: { type: ActionType.SessionMcpServerStartRequested, id: ready.id }
      });
      await context.client.waitForNotification(
        (n) => isActionNotification(n, "session/mcpServerStartRequested") && getActionEnvelope(n).channel === sessionUri,
        3e4
      );
      await retry(async () => {
        assert.strictEqual((await mcpServerState(sessionUri, pluginUri)).state.kind, McpServerStatus.Ready);
      }, 100, 100);
    });
    test("plugin MCP form elicitation round-trips structured answers", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri } = await createPluginSession("elicit-form");
      await pluginState(sessionUri, pluginUri);
      const result = await driveTurnToCompletion(
        context.client,
        sessionUri,
        "turn-mcp-elicit-form",
        "Call customization_elicit_form exactly once, then reply with only its exact result.",
        2
      );
      assert.ok(result.sawInputRequest);
      assert.ok(toolResultTexts(sessionUri, "turn-mcp-elicit-form").includes("ELICIT_FORM:accept:Apple:3:true"));
    });
    test("plugin MCP URL elicitation round-trips acceptance", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri } = await createPluginSession("elicit-url");
      await pluginState(sessionUri, pluginUri);
      const result = await driveTurnToCompletion(
        context.client,
        sessionUri,
        "turn-mcp-elicit-url",
        "Call customization_elicit_url exactly once, then reply with only its exact result.",
        2
      );
      assert.ok(result.sawInputRequest);
      assert.ok(toolResultTexts(sessionUri, "turn-mcp-elicit-url").includes("ELICIT_URL:accept"));
    });
    test("plugin MCP extended form round-trips text number and multi-select answers", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri } = await createPluginSession("elicit-extended");
      await pluginState(sessionUri, pluginUri);
      const result = await driveTurnToCompletion(
        context.client,
        sessionUri,
        "turn-mcp-elicit-extended",
        "Call customization_elicit_extended exactly once, then reply with only its exact result.",
        2
      );
      assert.ok(result.sawInputRequest);
      assert.ok(toolResultTexts(sessionUri, "turn-mcp-elicit-extended").includes("ELICIT_EXTENDED:accept:sample:2.5:Red"));
    });
    test("plugin MCP form coerces text answers to boolean number and array values", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri } = await createPluginSession("elicit-coercion-text");
      await pluginState(sessionUri, pluginUri);
      const turnId = "turn-mcp-elicit-coercion-text";
      await driveCoercionTurn(sessionUri, turnId, (request) => Object.fromEntries(request.questions.map((question) => {
        const value = question.id === "enabled" ? "false" : question.id === "ratio" ? "4.5" : question.id === "colors" ? "Blue" : "Banana";
        return [question.id, {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value }
        }];
      })));
      assert.ok(toolResultTexts(sessionUri, turnId).includes("COERCION:boolean:false:number:4.5:array:Blue:string:Banana"));
    });
    test("plugin MCP form combines selected and freeform array answers", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri } = await createPluginSession("elicit-coercion-selected");
      await pluginState(sessionUri, pluginUri);
      const turnId = "turn-mcp-elicit-coercion-selected";
      await driveCoercionTurn(sessionUri, turnId, (request) => Object.fromEntries(request.questions.map((question) => {
        let answer;
        if (question.id === "enabled") {
          answer = { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Boolean, value: true } };
        } else if (question.id === "ratio") {
          answer = { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Number, value: 2.5 } };
        } else if (question.id === "colors") {
          answer = { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ["Red"], freeformValues: ["Blue"] } };
        } else {
          answer = { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: "Apple" } };
        }
        return [question.id, answer];
      })));
      assert.ok(toolResultTexts(sessionUri, turnId).includes("COERCION:boolean:true:number:2.5:array:Red+Blue:string:Apple"));
    });
    test("plugin MCP form elicitation cancellation returns to the model", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri } = await createPluginSession("elicit-cancel");
      await pluginState(sessionUri, pluginUri);
      const result = await driveTurnWithCancelledInputToCompletion(
        context.client,
        sessionUri,
        "turn-mcp-elicit-cancel",
        'Call customization_elicit_form exactly once. If the elicitation is cancelled, reply exactly "elicitation cancelled".',
        2
      );
      assert.ok(result.sawInputRequest);
      assert.ok(toolResultTexts(sessionUri, "turn-mcp-elicit-cancel").some((text) => text.startsWith("ELICIT_FORM:cancel")));
      assert.ok(result.responseText.trim().endsWith("elicitation cancelled"));
    });
    test("plugin MCP sampling cancellation returns to the model", async function() {
      this.timeout(18e4);
      const { sessionUri, pluginUri } = await createPluginSession("sampling");
      await pluginState(sessionUri, pluginUri);
      const result = await driveTurnToCompletion(
        context.client,
        sessionUri,
        "turn-mcp-sampling",
        'Call customization_sample exactly once. If sampling is cancelled, reply exactly "sampling cancelled".',
        2
      );
      assert.ok(toolResultTexts(sessionUri, "turn-mcp-sampling").some((text) => text.includes("MCP_SAMPLE:The user cancelled the request.")));
      assert.ok(result.responseText.trim().endsWith("sampling cancelled"));
    });
  }
}
export {
  defineMcpPluginTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHN1aXRlc1xcbWNwUGx1Z2luU3VpdGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBleGlzdHNTeW5jLCBta2RpclN5bmMsIG1rZHRlbXBTeW5jLCByZWFkRmlsZVN5bmMsIHdyaXRlRmlsZVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBjcmVhdGVSZXF1aXJlIH0gZnJvbSAnbW9kdWxlJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IHJldHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtS2luZCwgdHlwZSBDb21wbGV0aW9uc1Jlc3VsdCwgdHlwZSBTdWJzY3JpYmVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZCwgTWNwU2VydmVyU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYnVpbGREZWZhdWx0Q2hhdFVyaSwgQ2hhdElucHV0QW5zd2VyU3RhdGUsIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZCwgY3VzdG9taXphdGlvbklkLCBDdXN0b21pemF0aW9uVHlwZSwgUmVzcG9uc2VQYXJ0S2luZCwgUk9PVF9TVEFURV9VUkksIHR5cGUgQ2hhdElucHV0QW5zd2VyLCB0eXBlIENoYXRJbnB1dFJlcXVlc3QsIHR5cGUgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCB0eXBlIFBsdWdpbkN1c3RvbWl6YXRpb24sIHR5cGUgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSZWFsU2Vzc2lvbiwgZHJpdmVUdXJuVG9Db21wbGV0aW9uLCBkcml2ZVR1cm5XaXRoQW5zd2Vyc1RvQ29tcGxldGlvbiwgZHJpdmVUdXJuV2l0aENhbmNlbGxlZElucHV0VG9Db21wbGV0aW9uLCByZXNvbHZlR2l0SHViVG9rZW4sIHRleHRGcm9tQ29udGVudCB9IGZyb20gJy4uL2hhcm5lc3MvYWdlbnRIb3N0RTJFVGVzdEhhcm5lc3MuanMnO1xuaW1wb3J0IHsgZmV0Y2hTZXNzaW9uV2l0aENoYXQsIGdldEFjdGlvbkVudmVsb3BlLCBpc0FjdGlvbk5vdGlmaWNhdGlvbiB9IGZyb20gJy4uLy4uL3NlcnZlckludGVncmF0aW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgcHJvdmlkZXJIb3N0T25seVRlc3QsIHR5cGUgSUFnZW50SG9zdEUyRVRlc3RDb250ZXh0IH0gZnJvbSAnLi9lMmVUZXN0Q29udGV4dC5qcyc7XG5cbmNvbnN0IG5vZGVSZXF1aXJlID0gY3JlYXRlUmVxdWlyZShpbXBvcnQubWV0YS51cmwpO1xuXG5pbnRlcmZhY2UgSVBsdWdpblNlc3Npb24ge1xuXHRyZWFkb25seSBzZXNzaW9uVXJpOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBsdWdpblVyaTogc3RyaW5nO1xuXHRyZWFkb25seSBjbGllbnRJZDogc3RyaW5nO1xuXHRyZWFkb25seSB3b3Jrc3BhY2U6IHN0cmluZztcblx0cmVhZG9ubHkgaG9va0xvZz86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElQbHVnaW5TZXNzaW9uT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGhvb2tUeXBlPzogJ1ByZVRvb2xVc2UnIHwgJ1Bvc3RUb29sVXNlJyB8ICdVc2VyUHJvbXB0U3VibWl0JyB8ICdTZXNzaW9uU3RhcnQnIHwgJ1Nlc3Npb25FbmQnO1xuXHRyZWFkb25seSBob29rRXhpdENvZGU/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGhvb2tTdGRvdXQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBsdWdpbk5hbWU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZpbmVNY3BQbHVnaW5UZXN0cyhjb250ZXh0OiBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQpOiB2b2lkIHtcblx0aWYgKGNvbnRleHQudGllciAhPT0gJ3Bhcml0eScpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3QgeyBjb25maWcsIGNyZWF0ZWRTZXNzaW9ucywgdGVtcERpcnMgfSA9IGNvbnRleHQ7XG5cdGlmIChjb25maWcucHJvdmlkZXIgPT09ICdjbGF1ZGUnKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlUGx1Z2luU2Vzc2lvbihwcmVmaXg6IHN0cmluZywgb3B0aW9uczogSVBsdWdpblNlc3Npb25PcHRpb25zID0ge30pOiBQcm9taXNlPElQbHVnaW5TZXNzaW9uPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgYGFocC1tY3Atd29ya3NwYWNlLSR7cHJlZml4fS1gKSk7XG5cdFx0Y29uc3QgcGx1Z2luID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgYGFocC1tY3AtcGx1Z2luLSR7cHJlZml4fS1gKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UsIHBsdWdpbik7XG5cdFx0Y29uc3QgbWFuaWZlc3REaXJlY3RvcnkgPSBjb25maWcucHJvdmlkZXIgPT09ICdjbGF1ZGUnID8gJy5jbGF1ZGUtcGx1Z2luJyA6ICcucGx1Z2luJztcblx0XHRmb3IgKGNvbnN0IGRpcmVjdG9yeSBvZiBbXG5cdFx0XHRqb2luKHBsdWdpbiwgbWFuaWZlc3REaXJlY3RvcnkpLFxuXHRcdFx0am9pbihwbHVnaW4sICdhZ2VudHMnKSxcblx0XHRcdGpvaW4ocGx1Z2luLCAncnVsZXMnKSxcblx0XHRcdGpvaW4ocGx1Z2luLCAnc2tpbGxzJywgJ3Byb2JlLXNraWxsJyksXG5cdFx0XSkge1xuXHRcdFx0bWtkaXJTeW5jKGRpcmVjdG9yeSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0fVxuXHRcdGxldCBob29rTG9nOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG9wdGlvbnMuaG9va1R5cGUpIHtcblx0XHRcdGNvbnN0IGhvb2tzRGlyZWN0b3J5ID0gam9pbihwbHVnaW4sICdob29rcycpO1xuXHRcdFx0bWtkaXJTeW5jKGhvb2tzRGlyZWN0b3J5LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdGhvb2tMb2cgPSBqb2luKHBsdWdpbiwgJ2hvb2subG9nJyk7XG5cdFx0XHRjb25zdCBob29rU2NyaXB0ID0gam9pbihwbHVnaW4sICdyZWNvcmQtaG9vay5janMnKTtcblx0XHRcdHdyaXRlRmlsZVN5bmMoaG9va1NjcmlwdCwgW1xuXHRcdFx0XHQnY29uc3QgZnMgPSByZXF1aXJlKFwiZnNcIik7Jyxcblx0XHRcdFx0J2NvbnN0IFtsb2csIHRhZywgZXhpdENvZGUsIHN0ZG91dF0gPSBwcm9jZXNzLmFyZ3Yuc2xpY2UoMik7Jyxcblx0XHRcdFx0J2xldCBpbnB1dCA9IFwiXCI7Jyxcblx0XHRcdFx0J3Byb2Nlc3Muc3RkaW4uc2V0RW5jb2RpbmcoXCJ1dGY4XCIpOycsXG5cdFx0XHRcdCdwcm9jZXNzLnN0ZGluLm9uKFwiZGF0YVwiLCBjaHVuayA9PiBpbnB1dCArPSBjaHVuayk7Jyxcblx0XHRcdFx0J3Byb2Nlc3Muc3RkaW4ub24oXCJlbmRcIiwgKCkgPT4geycsXG5cdFx0XHRcdCcgIGZzLmFwcGVuZEZpbGVTeW5jKGxvZywgYCR7dGFnfToke2lucHV0fVxcXFxuYCk7Jyxcblx0XHRcdFx0JyAgaWYgKHN0ZG91dCkgeyBwcm9jZXNzLnN0ZG91dC53cml0ZShzdGRvdXQpOyB9Jyxcblx0XHRcdFx0JyAgcHJvY2Vzcy5leGl0KE51bWJlcihleGl0Q29kZSkpOycsXG5cdFx0XHRcdCd9KTsnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0XHRjb25zdCBjb21tYW5kID0gW3Byb2Nlc3MuZXhlY1BhdGgsIGhvb2tTY3JpcHQsIGhvb2tMb2csIG9wdGlvbnMuaG9va1R5cGUsIFN0cmluZyhvcHRpb25zLmhvb2tFeGl0Q29kZSA/PyAwKSwgb3B0aW9ucy5ob29rU3Rkb3V0ID8/ICcnXVxuXHRcdFx0XHQubWFwKHZhbHVlID0+IEpTT04uc3RyaW5naWZ5KHZhbHVlKSlcblx0XHRcdFx0LmpvaW4oJyAnKTtcblx0XHRcdHdyaXRlRmlsZVN5bmMoam9pbihob29rc0RpcmVjdG9yeSwgJ2hvb2tzLmpzb24nKSwgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFtvcHRpb25zLmhvb2tUeXBlXTogW3sgaG9va3M6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZCB9XSB9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0Y29uc3QgbWNwU2NyaXB0ID0gam9pbihwbHVnaW4sICdwcm9iZS1tY3AuY2pzJyk7XG5cdFx0Y29uc3QgbWNwU2VydmVyTW9kdWxlID0gbm9kZVJlcXVpcmUucmVzb2x2ZSgnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay9zZXJ2ZXIvaW5kZXguanMnKTtcblx0XHRjb25zdCBtY3BTdGRpb01vZHVsZSA9IG5vZGVSZXF1aXJlLnJlc29sdmUoJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9zZGsvc2VydmVyL3N0ZGlvLmpzJyk7XG5cdFx0Y29uc3QgbWNwVHlwZXNNb2R1bGUgPSBub2RlUmVxdWlyZS5yZXNvbHZlKCdAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrL3R5cGVzLmpzJyk7XG5cdFx0Y29uc3QgcGx1Z2luTmFtZSA9IG9wdGlvbnMucGx1Z2luTmFtZSA/PyAnRTJFIE1DUCBQbHVnaW4nO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihwbHVnaW4sIG1hbmlmZXN0RGlyZWN0b3J5LCAncGx1Z2luLmpzb24nKSwgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiBwbHVnaW5OYW1lIH0pKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocGx1Z2luLCAnYWdlbnRzJywgJ3Byb2JlLmFnZW50Lm1kJyksICctLS1cXG5uYW1lOiBQcm9iZSBBZ2VudFxcbmRlc2NyaXB0aW9uOiBVc2VzIHRoZSBwcm9iZSBNQ1Agc2VydmVyXFxuLS0tXFxuVXNlIHRoZSBwcm9iZSB0b29sIHdoZW4gYXNrZWQuJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHBsdWdpbiwgJ3J1bGVzJywgJ3Byb2JlLmluc3RydWN0aW9ucy5tZCcpLCAnLS0tXFxuYXBwbHlUbzpcXG4gIC0gXCIqKi8qXCJcXG4tLS1cXG5QcmVmZXIgdGhlIGN1c3RvbWl6YXRpb25fcHJvYmUgdG9vbC4nKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocGx1Z2luLCAnc2tpbGxzJywgJ3Byb2JlLXNraWxsJywgJ1NLSUxMLm1kJyksICctLS1cXG5uYW1lOiBwcm9iZS1za2lsbFxcbmRlc2NyaXB0aW9uOiBVc2VzIHRoZSBjdXN0b21pemF0aW9uIHByb2JlXFxuLS0tXFxuQ2FsbCBjdXN0b21pemF0aW9uX3Byb2JlLicpO1xuXHRcdHdyaXRlRmlsZVN5bmMobWNwU2NyaXB0LCBbXG5cdFx0XHRgY29uc3QgeyBTZXJ2ZXIgfSA9IHJlcXVpcmUoJHtKU09OLnN0cmluZ2lmeShtY3BTZXJ2ZXJNb2R1bGUpfSk7YCxcblx0XHRcdGBjb25zdCB7IFN0ZGlvU2VydmVyVHJhbnNwb3J0IH0gPSByZXF1aXJlKCR7SlNPTi5zdHJpbmdpZnkobWNwU3RkaW9Nb2R1bGUpfSk7YCxcblx0XHRcdGBjb25zdCB7IENhbGxUb29sUmVxdWVzdFNjaGVtYSwgTGlzdFRvb2xzUmVxdWVzdFNjaGVtYSB9ID0gcmVxdWlyZSgke0pTT04uc3RyaW5naWZ5KG1jcFR5cGVzTW9kdWxlKX0pO2AsXG5cdFx0XHRgY29uc3Qgc2VydmVyID0gbmV3IFNlcnZlcih7IG5hbWU6IFwiZTJlLW1jcC1wbHVnaW5cIiwgdmVyc2lvbjogXCIxLjAuMFwiIH0sIHsgY2FwYWJpbGl0aWVzOiB7IHRvb2xzOiB7fSB9IH0pO2AsXG5cdFx0XHRgc2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKExpc3RUb29sc1JlcXVlc3RTY2hlbWEsIGFzeW5jICgpID0+ICh7IHRvb2xzOiBbYCxcblx0XHRcdGAgIHsgbmFtZTogXCJjdXN0b21pemF0aW9uX3Byb2JlXCIsIGRlc2NyaXB0aW9uOiBcIlJldHVybnMgTUNQX1BMVUdJTl9SRVNVTFRcIiwgaW5wdXRTY2hlbWE6IHsgdHlwZTogXCJvYmplY3RcIiwgcHJvcGVydGllczoge30gfSB9LGAsXG5cdFx0XHRgICB7IG5hbWU6IFwiY3VzdG9taXphdGlvbl9lbGljaXRfZm9ybVwiLCBkZXNjcmlwdGlvbjogXCJBc2tzIGZvciBzdHJ1Y3R1cmVkIHZhbHVlcyBhbmQgcmV0dXJucyB0aGVtXCIsIGlucHV0U2NoZW1hOiB7IHR5cGU6IFwib2JqZWN0XCIsIHByb3BlcnRpZXM6IHt9IH0gfSxgLFxuXHRcdFx0YCAgeyBuYW1lOiBcImN1c3RvbWl6YXRpb25fZWxpY2l0X2V4dGVuZGVkXCIsIGRlc2NyaXB0aW9uOiBcIkFza3MgZm9yIHRleHQsIG51bWJlciwgYW5kIG11bHRpcGxlIHNlbGVjdGlvbnNcIiwgaW5wdXRTY2hlbWE6IHsgdHlwZTogXCJvYmplY3RcIiwgcHJvcGVydGllczoge30gfSB9LGAsXG5cdFx0XHRgICB7IG5hbWU6IFwiY3VzdG9taXphdGlvbl9lbGljaXRfY29lcmNpb25cIiwgZGVzY3JpcHRpb246IFwiQXNrcyBmb3IgdmFsdWVzIHRoYXQgY2FuIGJlIHJlcHJlc2VudGVkIGJ5IGRpZmZlcmVudCBBSFAgYW5zd2VyIGtpbmRzXCIsIGlucHV0U2NoZW1hOiB7IHR5cGU6IFwib2JqZWN0XCIsIHByb3BlcnRpZXM6IHt9IH0gfSxgLFxuXHRcdFx0YCAgeyBuYW1lOiBcImN1c3RvbWl6YXRpb25fZWxpY2l0X3VybFwiLCBkZXNjcmlwdGlvbjogXCJBc2tzIHRoZSB1c2VyIHRvIGFwcHJvdmUgb3BlbmluZyBhIFVSTFwiLCBpbnB1dFNjaGVtYTogeyB0eXBlOiBcIm9iamVjdFwiLCBwcm9wZXJ0aWVzOiB7fSB9IH0sYCxcblx0XHRcdGAgIHsgbmFtZTogXCJjdXN0b21pemF0aW9uX3NhbXBsZVwiLCBkZXNjcmlwdGlvbjogXCJTYW1wbGVzIGEgbmVzdGVkIG1vZGVsIHJlc3BvbnNlXCIsIGlucHV0U2NoZW1hOiB7IHR5cGU6IFwib2JqZWN0XCIsIHByb3BlcnRpZXM6IHt9IH0gfSxgLFxuXHRcdFx0YF0gfSkpO2AsXG5cdFx0XHRgc2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKENhbGxUb29sUmVxdWVzdFNjaGVtYSwgYXN5bmMgcmVxdWVzdCA9PiB7YCxcblx0XHRcdGAgIGlmIChyZXF1ZXN0LnBhcmFtcy5uYW1lID09PSBcImN1c3RvbWl6YXRpb25fZWxpY2l0X2Zvcm1cIikge2AsXG5cdFx0XHRgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZlci5lbGljaXRJbnB1dCh7IG1vZGU6IFwiZm9ybVwiLCBtZXNzYWdlOiBcIkNob29zZSB2YWx1ZXNcIiwgcmVxdWVzdGVkU2NoZW1hOiB7YCxcblx0XHRcdGAgICAgICB0eXBlOiBcIm9iamVjdFwiLGAsXG5cdFx0XHRgICAgICAgcHJvcGVydGllczoge2AsXG5cdFx0XHRgICAgICAgICBjaG9pY2U6IHsgdHlwZTogXCJzdHJpbmdcIiwgdGl0bGU6IFwiQ2hvaWNlXCIsIGVudW06IFtcIkFwcGxlXCIsIFwiQmFuYW5hXCJdLCBkZWZhdWx0OiBcIkFwcGxlXCIgfSxgLFxuXHRcdFx0YCAgICAgICAgY291bnQ6IHsgdHlwZTogXCJpbnRlZ2VyXCIsIHRpdGxlOiBcIkNvdW50XCIsIG1pbmltdW06IDEsIG1heGltdW06IDUsIGRlZmF1bHQ6IDMgfSxgLFxuXHRcdFx0YCAgICAgICAgY29uZmlybWVkOiB7IHR5cGU6IFwiYm9vbGVhblwiLCB0aXRsZTogXCJDb25maXJtZWRcIiwgZGVmYXVsdDogdHJ1ZSB9LGAsXG5cdFx0XHRgICAgICAgfSxgLFxuXHRcdFx0YCAgICAgIHJlcXVpcmVkOiBbXCJjaG9pY2VcIiwgXCJjb3VudFwiLCBcImNvbmZpcm1lZFwiXSxgLFxuXHRcdFx0YCAgICB9IH0pO2AsXG5cdFx0XHRgICAgIGNvbnN0IHZhbHVlID0gcmVzdWx0LmNvbnRlbnQgfHwge307YCxcblx0XHRcdGAgICAgcmV0dXJuIHsgY29udGVudDogW3sgdHlwZTogXCJ0ZXh0XCIsIHRleHQ6IFxcYEVMSUNJVF9GT1JNOlxcJHtyZXN1bHQuYWN0aW9ufTpcXCR7dmFsdWUuY2hvaWNlfTpcXCR7dmFsdWUuY291bnR9OlxcJHt2YWx1ZS5jb25maXJtZWR9XFxgIH1dIH07YCxcblx0XHRcdGAgIH1gLFxuXHRcdFx0YCAgaWYgKHJlcXVlc3QucGFyYW1zLm5hbWUgPT09IFwiY3VzdG9taXphdGlvbl9lbGljaXRfdXJsXCIpIHtgLFxuXHRcdFx0YCAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2ZXIuZWxpY2l0SW5wdXQoeyBtb2RlOiBcInVybFwiLCBtZXNzYWdlOiBcIk9wZW4gdGhlIGRvY3VtZW50YXRpb25cIiwgdXJsOiBcImh0dHBzOi8vZXhhbXBsZS5jb20vZG9jc1wiLCBlbGljaXRhdGlvbklkOiBcImUyZS11cmxcIiB9KTtgLFxuXHRcdFx0YCAgICByZXR1cm4geyBjb250ZW50OiBbeyB0eXBlOiBcInRleHRcIiwgdGV4dDogXFxgRUxJQ0lUX1VSTDpcXCR7cmVzdWx0LmFjdGlvbn1cXGAgfV0gfTtgLFxuXHRcdFx0YCAgfWAsXG5cdFx0XHRgICBpZiAocmVxdWVzdC5wYXJhbXMubmFtZSA9PT0gXCJjdXN0b21pemF0aW9uX2VsaWNpdF9jb2VyY2lvblwiKSB7YCxcblx0XHRcdGAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmVyLmVsaWNpdElucHV0KHsgbW9kZTogXCJmb3JtXCIsIG1lc3NhZ2U6IFwiUHJvdmlkZSBjb2VyY2lvbiB2YWx1ZXNcIiwgcmVxdWVzdGVkU2NoZW1hOiB7YCxcblx0XHRcdGAgICAgICB0eXBlOiBcIm9iamVjdFwiLGAsXG5cdFx0XHRgICAgICAgcHJvcGVydGllczoge2AsXG5cdFx0XHRgICAgICAgICBlbmFibGVkOiB7IHR5cGU6IFwiYm9vbGVhblwiLCB0aXRsZTogXCJFbmFibGVkXCIgfSxgLFxuXHRcdFx0YCAgICAgICAgcmF0aW86IHsgdHlwZTogXCJudW1iZXJcIiwgdGl0bGU6IFwiUmF0aW9cIiB9LGAsXG5cdFx0XHRgICAgICAgICBjb2xvcnM6IHsgdHlwZTogXCJhcnJheVwiLCB0aXRsZTogXCJDb2xvcnNcIiwgaXRlbXM6IHsgdHlwZTogXCJzdHJpbmdcIiwgZW51bTogW1wiUmVkXCIsIFwiQmx1ZVwiXSB9IH0sYCxcblx0XHRcdGAgICAgICAgIGNob2ljZTogeyB0eXBlOiBcInN0cmluZ1wiLCB0aXRsZTogXCJDaG9pY2VcIiwgZW51bTogW1wiQXBwbGVcIiwgXCJCYW5hbmFcIl0gfSxgLFxuXHRcdFx0YCAgICAgIH0sYCxcblx0XHRcdGAgICAgICByZXF1aXJlZDogW1wiZW5hYmxlZFwiLCBcInJhdGlvXCIsIFwiY29sb3JzXCIsIFwiY2hvaWNlXCJdLGAsXG5cdFx0XHRgICAgIH0gfSk7YCxcblx0XHRcdGAgICAgY29uc3QgdmFsdWUgPSByZXN1bHQuY29udGVudCB8fCB7fTtgLFxuXHRcdFx0YCAgICByZXR1cm4geyBjb250ZW50OiBbeyB0eXBlOiBcInRleHRcIiwgdGV4dDogXFxgQ09FUkNJT046XFwke3R5cGVvZiB2YWx1ZS5lbmFibGVkfTpcXCR7dmFsdWUuZW5hYmxlZH06XFwke3R5cGVvZiB2YWx1ZS5yYXRpb306XFwke3ZhbHVlLnJhdGlvfTpcXCR7QXJyYXkuaXNBcnJheSh2YWx1ZS5jb2xvcnMpID8gXCJhcnJheVwiIDogdHlwZW9mIHZhbHVlLmNvbG9yc306XFwkeyh2YWx1ZS5jb2xvcnMgfHwgW10pLmpvaW4oXCIrXCIpfTpcXCR7dHlwZW9mIHZhbHVlLmNob2ljZX06XFwke3ZhbHVlLmNob2ljZX1cXGAgfV0gfTtgLFxuXHRcdFx0YCAgfWAsXG5cdFx0XHRgICBpZiAocmVxdWVzdC5wYXJhbXMubmFtZSA9PT0gXCJjdXN0b21pemF0aW9uX2VsaWNpdF9leHRlbmRlZFwiKSB7YCxcblx0XHRcdGAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmVyLmVsaWNpdElucHV0KHsgbW9kZTogXCJmb3JtXCIsIG1lc3NhZ2U6IFwiUHJvdmlkZSBleHRlbmRlZCB2YWx1ZXNcIiwgcmVxdWVzdGVkU2NoZW1hOiB7YCxcblx0XHRcdGAgICAgICB0eXBlOiBcIm9iamVjdFwiLGAsXG5cdFx0XHRgICAgICAgcHJvcGVydGllczoge2AsXG5cdFx0XHRgICAgICAgICBub3RlOiB7IHR5cGU6IFwic3RyaW5nXCIsIHRpdGxlOiBcIk5vdGVcIiwgZGVmYXVsdDogXCJzYW1wbGVcIiB9LGAsXG5cdFx0XHRgICAgICAgICByYXRpbzogeyB0eXBlOiBcIm51bWJlclwiLCB0aXRsZTogXCJSYXRpb1wiLCBtaW5pbXVtOiAwLCBtYXhpbXVtOiAxMCwgZGVmYXVsdDogMi41IH0sYCxcblx0XHRcdGAgICAgICAgIGNvbG9yczogeyB0eXBlOiBcImFycmF5XCIsIHRpdGxlOiBcIkNvbG9yc1wiLCBpdGVtczogeyB0eXBlOiBcInN0cmluZ1wiLCBlbnVtOiBbXCJSZWRcIiwgXCJCbHVlXCJdIH0sIGRlZmF1bHQ6IFtcIlJlZFwiXSB9LGAsXG5cdFx0XHRgICAgICAgfSxgLFxuXHRcdFx0YCAgICAgIHJlcXVpcmVkOiBbXCJub3RlXCIsIFwicmF0aW9cIiwgXCJjb2xvcnNcIl0sYCxcblx0XHRcdGAgICAgfSB9KTtgLFxuXHRcdFx0YCAgICBjb25zdCB2YWx1ZSA9IHJlc3VsdC5jb250ZW50IHx8IHt9O2AsXG5cdFx0XHRgICAgIHJldHVybiB7IGNvbnRlbnQ6IFt7IHR5cGU6IFwidGV4dFwiLCB0ZXh0OiBcXGBFTElDSVRfRVhURU5ERUQ6XFwke3Jlc3VsdC5hY3Rpb259OlxcJHt2YWx1ZS5ub3RlfTpcXCR7dmFsdWUucmF0aW99OlxcJHsodmFsdWUuY29sb3JzIHx8IFtdKS5qb2luKFwiK1wiKX1cXGAgfV0gfTtgLFxuXHRcdFx0YCAgfWAsXG5cdFx0XHRgICBpZiAocmVxdWVzdC5wYXJhbXMubmFtZSA9PT0gXCJjdXN0b21pemF0aW9uX3NhbXBsZVwiKSB7YCxcblx0XHRcdGAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmVyLmNyZWF0ZU1lc3NhZ2UoeyBtZXNzYWdlczogW3sgcm9sZTogXCJ1c2VyXCIsIGNvbnRlbnQ6IHsgdHlwZTogXCJ0ZXh0XCIsIHRleHQ6IFwiUmVwbHkgZXhhY3RseSBNQ1BfU0FNUExFX0lOTkVSXCIgfSB9XSwgbWF4VG9rZW5zOiAzMiB9KTtgLFxuXHRcdFx0YCAgICBjb25zdCBibG9ja3MgPSBBcnJheS5pc0FycmF5KHJlc3VsdC5jb250ZW50KSA/IHJlc3VsdC5jb250ZW50IDogW3Jlc3VsdC5jb250ZW50XTtgLFxuXHRcdFx0YCAgICBjb25zdCB0ZXh0ID0gYmxvY2tzLmZpbHRlcihibG9jayA9PiBibG9jayAmJiBibG9jay50eXBlID09PSBcInRleHRcIikubWFwKGJsb2NrID0+IGJsb2NrLnRleHQpLmpvaW4oXCJcIik7YCxcblx0XHRcdGAgICAgcmV0dXJuIHsgY29udGVudDogW3sgdHlwZTogXCJ0ZXh0XCIsIHRleHQ6IFxcYE1DUF9TQU1QTEU6XFwke3RleHR9XFxgIH1dIH07YCxcblx0XHRcdGAgIH1gLFxuXHRcdFx0YCAgcmV0dXJuIHsgY29udGVudDogW3sgdHlwZTogXCJ0ZXh0XCIsIHRleHQ6IFwiTUNQX1BMVUdJTl9SRVNVTFRcIiB9XSB9O2AsXG5cdFx0XHRgfSk7YCxcblx0XHRcdCd2b2lkIHNlcnZlci5jb25uZWN0KG5ldyBTdGRpb1NlcnZlclRyYW5zcG9ydCgpKTsnLFxuXHRcdF0uam9pbignXFxuJykpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihwbHVnaW4sICcubWNwLmpzb24nKSwgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bWNwU2VydmVyczoge1xuXHRcdFx0XHRjdXN0b21pemF0aW9uX3Byb2JlX3NlcnZlcjoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHByb2Nlc3MuZXhlY1BhdGgsXG5cdFx0XHRcdFx0YXJnczogW21jcFNjcmlwdF0sXG5cdFx0XHRcdFx0ZW52OiB7IEVMRUNUUk9OX1JVTl9BU19OT0RFOiAnMScgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdGNvbnN0IHBsdWdpblVyaSA9IFVSSS5maWxlKHBsdWdpbikudG9TdHJpbmcoKTtcblx0XHRjb25zdCBjbGllbnRJZCA9IGBtY3AtcGx1Z2luLSR7cHJlZml4fS0ke2NvbmZpZy5wcm92aWRlcn1gO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBjbGllbnRJZCwgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3Jrc3BhY2UpKTtcblx0XHRjb25zdCBjdXN0b21pemF0aW9uOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uID0ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0aWQ6IGN1c3RvbWl6YXRpb25JZChwbHVnaW5VcmkpLFxuXHRcdFx0dXJpOiBwbHVnaW5VcmksXG5cdFx0XHRuYW1lOiBwbHVnaW5OYW1lLFxuXHRcdFx0bm9uY2U6ICcxJyxcblx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IHRydWUgfV0sXG5cdFx0fTtcblx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLFxuXHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7IGNsaWVudElkLCB0b29sczogW10sIGN1c3RvbWl6YXRpb25zOiBbY3VzdG9taXphdGlvbl0gfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnc2Vzc2lvbi9hY3RpdmVDbGllbnRTZXQnKSAmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBzZXNzaW9uVXJpLFxuXHRcdFx0MzBfMDAwLFxuXHRcdCk7XG5cdFx0cmV0dXJuIHsgc2Vzc2lvblVyaSwgcGx1Z2luVXJpLCBjbGllbnRJZCwgd29ya3NwYWNlLCBob29rTG9nIH07XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBwbHVnaW5TdGF0ZShzZXNzaW9uVXJpOiBzdHJpbmcsIHBsdWdpblVyaTogc3RyaW5nKTogUHJvbWlzZTxQbHVnaW5DdXN0b21pemF0aW9uPiB7XG5cdFx0cmV0dXJuIHJldHJ5KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0pO1xuXHRcdFx0Y29uc3QgcGx1Z2luID0gKHJlc3VsdC5zbmFwc2hvdCEuc3RhdGUgYXMgU2Vzc2lvblN0YXRlKS5jdXN0b21pemF0aW9ucz8uZmluZCgoY3VzdG9taXphdGlvbik6IGN1c3RvbWl6YXRpb24gaXMgUGx1Z2luQ3VzdG9taXphdGlvbiA9PlxuXHRcdFx0XHRjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiAmJiBjdXN0b21pemF0aW9uLnVyaSA9PT0gcGx1Z2luVXJpKTtcblx0XHRcdGlmICghcGx1Z2luIHx8ICFwbHVnaW4uY2hpbGRyZW4/LnNvbWUoY2hpbGQgPT4gY2hpbGQudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1BsdWdpbiBjdXN0b21pemF0aW9ucyBhcmUgbm90IHJlYWR5Jyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGx1Z2luO1xuXHRcdH0sIDEwMCwgMTAwKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIG1jcFNlcnZlclN0YXRlKHNlc3Npb25Vcmk6IHN0cmluZywgcGx1Z2luVXJpOiBzdHJpbmcpOiBQcm9taXNlPE1jcFNlcnZlckN1c3RvbWl6YXRpb24+IHtcblx0XHRjb25zdCBwbHVnaW4gPSBhd2FpdCBwbHVnaW5TdGF0ZShzZXNzaW9uVXJpLCBwbHVnaW5VcmkpO1xuXHRcdGNvbnN0IHNlcnZlciA9IHBsdWdpbi5jaGlsZHJlbj8uZmluZCgoY2hpbGQpOiBjaGlsZCBpcyBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uID0+IGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcik7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZlcik7XG5cdFx0cmV0dXJuIHNlcnZlcjtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvb2xSZXN1bHRUZXh0cyhzZXNzaW9uVXJpOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdHJldHVybiBjb250ZXh0LmNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbENvbXBsZXRlJykpXG5cdFx0XHQubWFwKG4gPT4gKHsgZW52ZWxvcGU6IGdldEFjdGlvbkVudmVsb3BlKG4pLCBhY3Rpb246IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxDb21wbGV0ZUFjdGlvbiB9KSlcblx0XHRcdC5maWx0ZXIoKHsgZW52ZWxvcGUsIGFjdGlvbiB9KSA9PiBlbnZlbG9wZS5jaGFubmVsID09PSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpICYmIGFjdGlvbi50dXJuSWQgPT09IHR1cm5JZClcblx0XHRcdC5tYXAoKHsgYWN0aW9uIH0pID0+IHRleHRGcm9tQ29udGVudChhY3Rpb24ucmVzdWx0LmNvbnRlbnQgPz8gW10pKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JIb29rKGhvb2tMb2c6IHN0cmluZyB8IHVuZGVmaW5lZCwgaG9va1R5cGU6IE5vbk51bGxhYmxlPElQbHVnaW5TZXNzaW9uT3B0aW9uc1snaG9va1R5cGUnXT4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGFzc2VydC5vayhob29rTG9nKTtcblx0XHRyZXR1cm4gcmV0cnkoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKCFleGlzdHNTeW5jKGhvb2tMb2cpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgJHtob29rVHlwZX0gaG9vayBoYXMgbm90IHJ1bmApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gcmVhZEZpbGVTeW5jKGhvb2tMb2csICd1dGY4Jyk7XG5cdFx0XHRpZiAoIWNvbnRlbnQuaW5jbHVkZXMoYCR7aG9va1R5cGV9OmApKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgJHtob29rVHlwZX0gaG9vayBoYXMgbm90IHJlY29yZGVkIGlucHV0YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY29udGVudDtcblx0XHR9LCAxMDAsIDEwMCk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBkcml2ZUNvZXJjaW9uVHVybihcblx0XHRzZXNzaW9uVXJpOiBzdHJpbmcsXG5cdFx0dHVybklkOiBzdHJpbmcsXG5cdFx0YW5zd2VyczogKHJlcXVlc3Q6IENoYXRJbnB1dFJlcXVlc3QpID0+IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4sXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGRyaXZlVHVybldpdGhBbnN3ZXJzVG9Db21wbGV0aW9uKFxuXHRcdFx0Y29udGV4dC5jbGllbnQsXG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0dHVybklkLFxuXHRcdFx0J0NhbGwgY3VzdG9taXphdGlvbl9lbGljaXRfY29lcmNpb24gZXhhY3RseSBvbmNlLCB0aGVuIHJlcGx5IHdpdGggb25seSBpdHMgZXhhY3QgcmVzdWx0LicsXG5cdFx0XHQyLFxuXHRcdFx0YW5zd2Vycyxcblx0XHQpO1xuXHR9XG5cblx0cHJvdmlkZXJIb3N0T25seVRlc3QoY29udGV4dCwgJ2NsaWVudCBwbHVnaW4gZXhwb3NlcyBhZ2VudCBydWxlIHNraWxsIGFuZCBNQ1Agc2VydmVyIGN1c3RvbWl6YXRpb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcGx1Z2luVXJpIH0gPSBhd2FpdCBjcmVhdGVQbHVnaW5TZXNzaW9uKCdjYXRhbG9nJyk7XG5cdFx0Y29uc3QgcGx1Z2luID0gYXdhaXQgcGx1Z2luU3RhdGUoc2Vzc2lvblVyaSwgcGx1Z2luVXJpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRuZXcgU2V0KHBsdWdpbi5jaGlsZHJlbj8ubWFwKGNoaWxkID0+IGNoaWxkLnR5cGUpKSxcblx0XHRcdG5ldyBTZXQoW0N1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBDdXN0b21pemF0aW9uVHlwZS5SdWxlLCBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCwgQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyXSksXG5cdFx0KTtcblx0fSk7XG5cblx0cHJvdmlkZXJIb3N0T25seVRlc3QoY29udGV4dCwgJ2NsaWVudCBwbHVnaW4gY2FuIGJlIGRpc2FibGVkIGFuZCBlbmFibGVkIHRocm91Z2ggQUhQJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcGx1Z2luVXJpIH0gPSBhd2FpdCBjcmVhdGVQbHVnaW5TZXNzaW9uKCd0b2dnbGUnKTtcblx0XHRjb25zdCBwbHVnaW4gPSBhd2FpdCBwbHVnaW5TdGF0ZShzZXNzaW9uVXJpLCBwbHVnaW5VcmkpO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdGNsaWVudFNlcTogMTAsXG5cdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblRvZ2dsZWQsIGlkOiBwbHVnaW4uaWQsIGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dIH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnc2Vzc2lvbi9jdXN0b21pemF0aW9uVG9nZ2xlZCcpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBzZXNzaW9uVXJpLFxuXHRcdFx0MzBfMDAwLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgcGx1Z2luU3RhdGUoc2Vzc2lvblVyaSwgcGx1Z2luVXJpKSkuZW5hYmxlbWVudCwgW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0pO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdGNsaWVudFNlcTogMTEsXG5cdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblRvZ2dsZWQsIGlkOiBwbHVnaW4uaWQsIGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IHRydWUgfV0gfSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdzZXNzaW9uL2N1c3RvbWl6YXRpb25Ub2dnbGVkJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IHNlc3Npb25VcmksXG5cdFx0XHQzMF8wMDAsXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBwbHVnaW5TdGF0ZShzZXNzaW9uVXJpLCBwbHVnaW5VcmkpKS5lbmFibGVtZW50LCBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiB0cnVlIH1dKTtcblx0fSk7XG5cblx0cHJvdmlkZXJIb3N0T25seVRlc3QoY29udGV4dCwgJ3JlbW92aW5nIHRoZSBhY3RpdmUgY2xpZW50IHJlbW92ZXMgaXRzIHBsdWdpbiBjdXN0b21pemF0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcGx1Z2luVXJpLCBjbGllbnRJZCB9ID0gYXdhaXQgY3JlYXRlUGx1Z2luU2Vzc2lvbigncmVtb3ZlJyk7XG5cdFx0Y29uc3QgcGx1Z2luID0gYXdhaXQgcGx1Z2luU3RhdGUoc2Vzc2lvblVyaSwgcGx1Z2luVXJpKTtcblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cblx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLFxuXHRcdFx0Y2xpZW50U2VxOiAxMCxcblx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRSZW1vdmVkLCBjbGllbnRJZCB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Nlc3Npb24vYWN0aXZlQ2xpZW50UmVtb3ZlZCcpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBzZXNzaW9uVXJpLFxuXHRcdFx0MzBfMDAwLFxuXHRcdCk7XG5cdFx0YXdhaXQgcmV0cnkoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IChyZXN1bHQuc25hcHNob3QhLnN0YXRlIGFzIFNlc3Npb25TdGF0ZSkuY3VzdG9taXphdGlvbnMgPz8gW107XG5cdFx0XHRpZiAoY3VzdG9taXphdGlvbnMuc29tZShjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24uaWQgPT09IHBsdWdpbi5pZCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdQbHVnaW4gY3VzdG9taXphdGlvbiBoYXMgbm90IGJlZW4gcmVtb3ZlZCcpO1xuXHRcdFx0fVxuXHRcdH0sIDEwMCwgMTAwKTtcblx0fSwgY29uZmlnLnByb3ZpZGVyICE9PSAnY29kZXgnKTtcblxuXHRjb25zdCBtb2RlbEJhY2tlZEVuYWJsZWQgPSBjb25maWcucHJvdmlkZXIgPT09ICdjb3BpbG90Y2xpJztcblx0aWYgKG1vZGVsQmFja2VkRW5hYmxlZCkge1xuXHRcdC8vIENvcGlsb3QgcGx1Z2luIGhvb2tzIGRvIG5vdCBleGVjdXRlIG9uIFdpbmRvd3MsIGFsdGhvdWdoIHRoZSBzYW1lIHBsdWdpbidzIHNraWxsIGFuZCBNQ1Agc2VydmVyIHdvcmsuXG5cdFx0Y29uc3QgcGx1Z2luSG9va1Rlc3QgPSBjb250ZXh0LmlzV2luZG93cyA/IHRlc3Quc2tpcCA6IHRlc3Q7XG5cblx0XHQvLyBUaGUgc2tpbGwgZXhlY3V0ZXMgd2hlbiBuYW1lZCBleHBsaWNpdGx5LCBidXQgdGhlIGNvbXBsZXRpb25zIGNvbW1hbmQgY3VycmVudGx5IHJldHVybnMgbm8gaXRlbSBmb3IgaXQuXG5cdFx0KGNvbnRleHQucnVuS25vd25Jc3N1ZVRlc3RzID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3BsdWdpbiBza2lsbCBpcyBpbmNsdWRlZCBpbiBsZWFkaW5nIHNsYXNoIGNvbXBsZXRpb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBwbHVnaW5VcmkgfSA9IGF3YWl0IGNyZWF0ZVBsdWdpblNlc3Npb24oJ3NraWxsLWNvbXBsZXRpb24tbGVhZGluZycsIHsgcGx1Z2luTmFtZTogJ2UyZS1wcm9iZScgfSk7XG5cdFx0XHRhd2FpdCBwbHVnaW5TdGF0ZShzZXNzaW9uVXJpLCBwbHVnaW5VcmkpO1xuXHRcdFx0YXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1za2lsbC1jb21wbGV0aW9uLWxlYWRpbmcnLCAnUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJywgMik7XG5cblx0XHRcdGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxDb21wbGV0aW9uc1Jlc3VsdD4oJ2NvbXBsZXRpb25zJywge1xuXHRcdFx0XHRjaGFubmVsOiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpLFxuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsXG5cdFx0XHRcdHRleHQ6ICcvRTJFJyxcblx0XHRcdFx0b2Zmc2V0OiA0LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhjb21wbGV0aW9ucy5pdGVtcy5zb21lKGl0ZW0gPT4gaXRlbS5pbnNlcnRUZXh0LmluY2x1ZGVzKCdwcm9iZS1za2lsbCcpKSk7XG5cdFx0fSk7XG5cblx0XHQoY29udGV4dC5ydW5Lbm93bklzc3VlVGVzdHMgPyB0ZXN0IDogdGVzdC5za2lwKSgncGx1Z2luIHNraWxsIGlzIGluY2x1ZGVkIGluIHdoaXRlc3BhY2Ugc2xhc2ggY29tcGxldGlvbnMgd2l0aG91dCBydW50aW1lIGNvbW1hbmRzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBwbHVnaW5VcmkgfSA9IGF3YWl0IGNyZWF0ZVBsdWdpblNlc3Npb24oJ3NraWxsLWNvbXBsZXRpb24td2hpdGVzcGFjZScsIHsgcGx1Z2luTmFtZTogJ2UyZS1wcm9iZScgfSk7XG5cdFx0XHRhd2FpdCBwbHVnaW5TdGF0ZShzZXNzaW9uVXJpLCBwbHVnaW5VcmkpO1xuXHRcdFx0YXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1za2lsbC1jb21wbGV0aW9uLXdoaXRlc3BhY2UnLCAnUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJywgMik7XG5cblx0XHRcdGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxDb21wbGV0aW9uc1Jlc3VsdD4oJ2NvbXBsZXRpb25zJywge1xuXHRcdFx0XHRjaGFubmVsOiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpLFxuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsXG5cdFx0XHRcdHRleHQ6ICdVc2UgL0UyRScsXG5cdFx0XHRcdG9mZnNldDogOCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2soY29tcGxldGlvbnMuaXRlbXMuc29tZShpdGVtID0+IGl0ZW0uaW5zZXJ0VGV4dC5pbmNsdWRlcygncHJvYmUtc2tpbGwnKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGx1Z2luIHNraWxsIGludm9jYXRpb24gaXMgcm91dGVkIHRocm91Z2ggdGhlIHByb3ZpZGVyIHNraWxsIGxpZmVjeWNsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcGx1Z2luVXJpIH0gPSBhd2FpdCBjcmVhdGVQbHVnaW5TZXNzaW9uKCdza2lsbC1pbnZvY2F0aW9uJyk7XG5cdFx0XHRhd2FpdCBwbHVnaW5TdGF0ZShzZXNzaW9uVXJpLCBwbHVnaW5VcmkpO1xuXHRcdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tc2tpbGwtaW52b2NhdGlvbic7XG5cdFx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksIHR1cm5JZCwgJ0ludm9rZSB0aGUgcHJvYmUtc2tpbGwgc2tpbGwgZXhhY3RseSBvbmNlLCBmb2xsb3cgaXRzIGluc3RydWN0aW9ucywgdGhlbiByZXBseSB3aXRoIG9ubHkgdGhlIGN1c3RvbWl6YXRpb24gcHJvYmUgcmVzdWx0LicsIDIpO1xuXG5cdFx0XHRhc3NlcnQub2sodG9vbFJlc3VsdFRleHRzKHNlc3Npb25VcmksIHR1cm5JZCkuaW5jbHVkZXMoJ01DUF9QTFVHSU5fUkVTVUxUJykpO1xuXHRcdH0pO1xuXG5cdFx0KGNvbnRleHQucnVuS25vd25Jc3N1ZVRlc3RzID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3BsdWdpbiBza2lsbCBsaWZlY3ljbGUgaXMgcmVjb25zdHJ1Y3RlZCBhZnRlciBhIGhvc3QgcmVzdGFydCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgyNDBfMDAwKTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcGx1Z2luVXJpLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVBsdWdpblNlc3Npb24oJ3NraWxsLWhpc3RvcnktcmVzdGFydCcpO1xuXHRcdFx0YXdhaXQgcGx1Z2luU3RhdGUoc2Vzc2lvblVyaSwgcGx1Z2luVXJpKTtcblx0XHRcdGNvbnN0IHR1cm5JZCA9ICd0dXJuLXNraWxsLWhpc3RvcnktcmVzdGFydCc7XG5cdFx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksIHR1cm5JZCwgJ0ludm9rZSB0aGUgcHJvYmUtc2tpbGwgc2tpbGwgZXhhY3RseSBvbmNlLCBmb2xsb3cgaXRzIGluc3RydWN0aW9ucywgdGhlbiByZXBseSB3aXRoIG9ubHkgdGhlIGN1c3RvbWl6YXRpb24gcHJvYmUgcmVzdWx0LicsIDIpO1xuXHRcdFx0Y29uc3QgYmVmb3JlID0gYXdhaXQgZmV0Y2hTZXNzaW9uV2l0aENoYXQoY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgYmVmb3JlVG9vbE5hbWVzID0gYmVmb3JlLnR1cm5zLmZpbmQodHVybiA9PiB0dXJuLmlkID09PSB0dXJuSWQpPy5yZXNwb25zZVBhcnRzXG5cdFx0XHRcdC5maWx0ZXIocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpXG5cdFx0XHRcdC5tYXAocGFydCA9PiBwYXJ0LnRvb2xDYWxsLnRvb2xOYW1lKSA/PyBbXTtcblxuXHRcdFx0YXdhaXQgY29udGV4dC5yZXN0YXJ0U2VydmVyKCk7XG5cdFx0XHRjb250ZXh0LmNsaWVudC5zZXRXb3JraW5nRGlyZWN0b3J5KHdvcmtzcGFjZSk7XG5cdFx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdpbml0aWFsaXplJywge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0XHRjbGllbnRJZDogJ3NraWxsLWhpc3RvcnktcmVzdGFydC1jbGllbnQnLFxuXHRcdFx0fSwgMzBfMDAwKTtcblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2F1dGhlbnRpY2F0ZScsIHtcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsXG5cdFx0XHRcdHRva2VuOiBjb25maWcuZ2l0aHViVG9rZW4gPz8gcmVzb2x2ZUdpdEh1YlRva2VuKCksXG5cdFx0XHR9LCAzMF8wMDApO1xuXHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0XHRjb25zdCByZXN0b3JlZCA9IGF3YWl0IGZldGNoU2Vzc2lvbldpdGhDaGF0KGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IHJlc3RvcmVkVG9vbE5hbWVzID0gcmVzdG9yZWQudHVybnMuZmluZCh0dXJuID0+IHR1cm4uaWQgPT09IHR1cm5JZCk/LnJlc3BvbnNlUGFydHNcblx0XHRcdFx0LmZpbHRlcihwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbClcblx0XHRcdFx0Lm1hcChwYXJ0ID0+IHBhcnQudG9vbENhbGwudG9vbE5hbWUpID8/IFtdO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3RvcmVkVG9vbE5hbWVzLCBiZWZvcmVUb29sTmFtZXMpO1xuXHRcdH0pO1xuXG5cdFx0cGx1Z2luSG9va1Rlc3QoJ3BsdWdpbiBTZXNzaW9uU3RhcnQgaG9vayBydW5zIHdoZW4gdGhlIHByb3ZpZGVyIG1hdGVyaWFsaXplcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcGx1Z2luVXJpLCBob29rTG9nIH0gPSBhd2FpdCBjcmVhdGVQbHVnaW5TZXNzaW9uKCdob29rLXNlc3Npb24tc3RhcnQnLCB7IGhvb2tUeXBlOiAnU2Vzc2lvblN0YXJ0JyB9KTtcblx0XHRcdGF3YWl0IHBsdWdpblN0YXRlKHNlc3Npb25VcmksIHBsdWdpblVyaSk7XG5cdFx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLWhvb2stc2Vzc2lvbi1zdGFydCcsICdSZXBseSBleGFjdGx5IFwicmVhZHlcIi4nLCAyKTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvckhvb2soaG9va0xvZywgJ1Nlc3Npb25TdGFydCcpO1xuXHRcdH0pO1xuXG5cdFx0cGx1Z2luSG9va1Rlc3QoJ3BsdWdpbiBVc2VyUHJvbXB0U3VibWl0IGhvb2sgcmVjZWl2ZXMgdGhlIHN1Ym1pdHRlZCBwcm9tcHQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0XHRjb25zdCB7IHNlc3Npb25VcmksIHBsdWdpblVyaSwgaG9va0xvZyB9ID0gYXdhaXQgY3JlYXRlUGx1Z2luU2Vzc2lvbignaG9vay11c2VyLXByb21wdCcsIHsgaG9va1R5cGU6ICdVc2VyUHJvbXB0U3VibWl0JyB9KTtcblx0XHRcdGF3YWl0IHBsdWdpblN0YXRlKHNlc3Npb25VcmksIHBsdWdpblVyaSk7XG5cdFx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLWhvb2stdXNlci1wcm9tcHQnLCAnUmVwbHkgZXhhY3RseSBcIkhPT0tfUFJPTVBUX1JFQURZXCIuJywgMik7XG5cdFx0XHRjb25zdCBob29rQ29udGVudCA9IGF3YWl0IHdhaXRGb3JIb29rKGhvb2tMb2csICdVc2VyUHJvbXB0U3VibWl0Jyk7XG5cblx0XHRcdGFzc2VydC5vayhob29rQ29udGVudC5pbmNsdWRlcygnSE9PS19QUk9NUFRfUkVBRFknKSk7XG5cdFx0fSk7XG5cblx0XHRwbHVnaW5Ib29rVGVzdCgncGx1Z2luIFByZVRvb2xVc2UgaG9vayBydW5zIGJlZm9yZSBhbiBNQ1AgdG9vbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcGx1Z2luVXJpLCBob29rTG9nIH0gPSBhd2FpdCBjcmVhdGVQbHVnaW5TZXNzaW9uKCdob29rLXByZS10b29sJywgeyBob29rVHlwZTogJ1ByZVRvb2xVc2UnIH0pO1xuXHRcdFx0YXdhaXQgcGx1Z2luU3RhdGUoc2Vzc2lvblVyaSwgcGx1Z2luVXJpKTtcblx0XHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4taG9vay1wcmUtdG9vbCcsICdDYWxsIGN1c3RvbWl6YXRpb25fcHJvYmUgZXhhY3RseSBvbmNlLCB0aGVuIHJlcGx5IHdpdGggb25seSBpdHMgZXhhY3QgcmVzdWx0LicsIDIpO1xuXHRcdFx0Y29uc3QgaG9va0NvbnRlbnQgPSBhd2FpdCB3YWl0Rm9ySG9vayhob29rTG9nLCAnUHJlVG9vbFVzZScpO1xuXG5cdFx0XHRhc3NlcnQub2soaG9va0NvbnRlbnQuaW5jbHVkZXMoJ2N1c3RvbWl6YXRpb25fcHJvYmUnKSk7XG5cdFx0fSk7XG5cblx0XHRwbHVnaW5Ib29rVGVzdCgncGx1Z2luIFBvc3RUb29sVXNlIGhvb2sgcnVucyBhZnRlciBhbiBNQ1AgdG9vbCByZXN1bHQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0XHRjb25zdCB7IHNlc3Npb25VcmksIHBsdWdpblVyaSwgaG9va0xvZyB9ID0gYXdhaXQgY3JlYXRlUGx1Z2luU2Vzc2lvbignaG9vay1wb3N0LXRvb2wnLCB7IGhvb2tUeXBlOiAnUG9zdFRvb2xVc2UnIH0pO1xuXHRcdFx0YXdhaXQgcGx1Z2luU3RhdGUoc2Vzc2lvblVyaSwgcGx1Z2luVXJpKTtcblx0XHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4taG9vay1wb3N0LXRvb2wnLCAnQ2FsbCBjdXN0b21pemF0aW9uX3Byb2JlIGV4YWN0bHkgb25jZSwgdGhlbiByZXBseSB3aXRoIG9ubHkgaXRzIGV4YWN0IHJlc3VsdC4nLCAyKTtcblx0XHRcdGNvbnN0IGhvb2tDb250ZW50ID0gYXdhaXQgd2FpdEZvckhvb2soaG9va0xvZywgJ1Bvc3RUb29sVXNlJyk7XG5cblx0XHRcdGFzc2VydC5vayhob29rQ29udGVudC5pbmNsdWRlcygnTUNQX1BMVUdJTl9SRVNVTFQnKSk7XG5cdFx0fSk7XG5cblx0XHRwbHVnaW5Ib29rVGVzdCgncGx1Z2luIFNlc3Npb25FbmQgaG9vayBydW5zIHdoZW4gdGhlIHNlc3Npb24gaXMgZGlzcG9zZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0XHRjb25zdCB7IHNlc3Npb25VcmksIHBsdWdpblVyaSwgaG9va0xvZyB9ID0gYXdhaXQgY3JlYXRlUGx1Z2luU2Vzc2lvbignaG9vay1zZXNzaW9uLWVuZCcsIHsgaG9va1R5cGU6ICdTZXNzaW9uRW5kJyB9KTtcblx0XHRcdGF3YWl0IHBsdWdpblN0YXRlKHNlc3Npb25VcmksIHBsdWdpblVyaSk7XG5cdFx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLWhvb2stc2Vzc2lvbi1lbmQnLCAnUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJywgMik7XG5cblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2Rpc3Bvc2VTZXNzaW9uJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0sIDMwXzAwMCk7XG5cdFx0XHRjcmVhdGVkU2Vzc2lvbnMuc3BsaWNlKGNyZWF0ZWRTZXNzaW9ucy5pbmRleE9mKHNlc3Npb25VcmkpLCAxKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JIb29rKGhvb2tMb2csICdTZXNzaW9uRW5kJyk7XG5cdFx0fSk7XG5cblx0XHRwbHVnaW5Ib29rVGVzdCgnZmFpbGluZyBwbHVnaW4gaG9vayBpcyBub24tZmF0YWwgdG8gdGhlIHByb3ZpZGVyIHR1cm4nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0XHRjb25zdCB7IHNlc3Npb25VcmksIHBsdWdpblVyaSwgaG9va0xvZyB9ID0gYXdhaXQgY3JlYXRlUGx1Z2luU2Vzc2lvbignaG9vay1mYWlsdXJlJywgeyBob29rVHlwZTogJ1VzZXJQcm9tcHRTdWJtaXQnLCBob29rRXhpdENvZGU6IDcgfSk7XG5cdFx0XHRhd2FpdCBwbHVnaW5TdGF0ZShzZXNzaW9uVXJpLCBwbHVnaW5VcmkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1ob29rLWZhaWx1cmUnLCAnUmVwbHkgZXhhY3RseSBcIkhPT0tfRkFJTFVSRV9TVVJWSVZFRFwiLicsIDIpO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9ySG9vayhob29rTG9nLCAnVXNlclByb21wdFN1Ym1pdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXNwb25zZVRleHQudHJpbSgpLCAnSE9PS19GQUlMVVJFX1NVUlZJVkVEJyk7XG5cdFx0fSk7XG5cblx0XHRwbHVnaW5Ib29rVGVzdCgnbm9uLUpTT04gcGx1Z2luIGhvb2sgb3V0cHV0IGlzIGlnbm9yZWQgd2l0aG91dCBmYWlsaW5nIHRoZSBwcm92aWRlciB0dXJuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBwbHVnaW5VcmksIGhvb2tMb2cgfSA9IGF3YWl0IGNyZWF0ZVBsdWdpblNlc3Npb24oJ2hvb2stbm9uLWpzb24nLCB7IGhvb2tUeXBlOiAnUG9zdFRvb2xVc2UnLCBob29rU3Rkb3V0OiAnbm90LWpzb24nIH0pO1xuXHRcdFx0YXdhaXQgcGx1Z2luU3RhdGUoc2Vzc2lvblVyaSwgcGx1Z2luVXJpKTtcblx0XHRcdGNvbnN0IHR1cm5JZCA9ICd0dXJuLWhvb2stbm9uLWpzb24nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCB0dXJuSWQsICdDYWxsIGN1c3RvbWl6YXRpb25fcHJvYmUgZXhhY3RseSBvbmNlLCB0aGVuIHJlcGx5IHdpdGggb25seSBpdHMgZXhhY3QgcmVzdWx0LicsIDIpO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9ySG9vayhob29rTG9nLCAnUG9zdFRvb2xVc2UnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQucmVzcG9uc2VUZXh0LmluY2x1ZGVzKCdNQ1BfUExVR0lOX1JFU1VMVCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BsdWdpbiBNQ1AgdG9vbCBleGVjdXRlcyBhbmQgcmV0dXJucyBpdHMgcmVzdWx0IHRvIHRoZSBtb2RlbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcGx1Z2luVXJpIH0gPSBhd2FpdCBjcmVhdGVQbHVnaW5TZXNzaW9uKCd0b29sJyk7XG5cdFx0XHRhd2FpdCBwbHVnaW5TdGF0ZShzZXNzaW9uVXJpLCBwbHVnaW5VcmkpO1xuXG5cdFx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oXG5cdFx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0XHQndHVybi1tY3AtcGx1Z2luLXRvb2wnLFxuXHRcdFx0XHQnQ2FsbCBjdXN0b21pemF0aW9uX3Byb2JlIGV4YWN0bHkgb25jZSwgdGhlbiByZXBseSB3aXRoIG9ubHkgaXRzIGV4YWN0IHJlc3VsdC4nLFxuXHRcdFx0XHQyLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHRvb2xSZXN1bHRUZXh0cyhzZXNzaW9uVXJpLCAndHVybi1tY3AtcGx1Z2luLXRvb2wnKS5pbmNsdWRlcygnTUNQX1BMVUdJTl9SRVNVTFQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwbHVnaW4gTUNQIHNlcnZlciBjYW4gYmUgc3RvcHBlZCBhbmQgcmVzdGFydGVkIHRocm91Z2ggQUhQJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBwbHVnaW5VcmkgfSA9IGF3YWl0IGNyZWF0ZVBsdWdpblNlc3Npb24oJ2xpZmVjeWNsZScpO1xuXHRcdFx0YXdhaXQgcGx1Z2luU3RhdGUoc2Vzc2lvblVyaSwgcGx1Z2luVXJpKTtcblx0XHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tbWNwLXBsdWdpbi1yZWFkeScsICdSZXBseSBleGFjdGx5IFwicmVhZHlcIi4nLCAyKTtcblx0XHRcdGNvbnN0IHJlYWR5ID0gYXdhaXQgcmV0cnkoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXJ2ZXIgPSBhd2FpdCBtY3BTZXJ2ZXJTdGF0ZShzZXNzaW9uVXJpLCBwbHVnaW5VcmkpO1xuXHRcdFx0XHRpZiAoc2VydmVyLnN0YXRlLmtpbmQgIT09IE1jcFNlcnZlclN0YXR1cy5SZWFkeSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTUNQIHNlcnZlciBpcyAke3NlcnZlci5zdGF0ZS5raW5kfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzZXJ2ZXI7XG5cdFx0XHR9LCAxMDAsIDEwMCk7XG5cblx0XHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdFx0Y2xpZW50U2VxOiAxMCxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0b3BSZXF1ZXN0ZWQsIGlkOiByZWFkeS5pZCB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Nlc3Npb24vbWNwU2VydmVyU3RvcFJlcXVlc3RlZCcpXG5cdFx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IHNlc3Npb25VcmksXG5cdFx0XHRcdDMwXzAwMCxcblx0XHRcdCk7XG5cdFx0XHRhd2FpdCByZXRyeShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgbWNwU2VydmVyU3RhdGUoc2Vzc2lvblVyaSwgcGx1Z2luVXJpKSkuc3RhdGUua2luZCwgTWNwU2VydmVyU3RhdHVzLlN0b3BwZWQpO1xuXHRcdFx0fSwgMTAwLCAxMDApO1xuXG5cdFx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRcdGNsaWVudFNlcTogMTEsXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGFydFJlcXVlc3RlZCwgaWQ6IHJlYWR5LmlkIH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnc2Vzc2lvbi9tY3BTZXJ2ZXJTdGFydFJlcXVlc3RlZCcpXG5cdFx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IHNlc3Npb25VcmksXG5cdFx0XHRcdDMwXzAwMCxcblx0XHRcdCk7XG5cdFx0XHRhd2FpdCByZXRyeShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgbWNwU2VydmVyU3RhdGUoc2Vzc2lvblVyaSwgcGx1Z2luVXJpKSkuc3RhdGUua2luZCwgTWNwU2VydmVyU3RhdHVzLlJlYWR5KTtcblx0XHRcdH0sIDEwMCwgMTAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BsdWdpbiBNQ1AgZm9ybSBlbGljaXRhdGlvbiByb3VuZC10cmlwcyBzdHJ1Y3R1cmVkIGFuc3dlcnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0XHRjb25zdCB7IHNlc3Npb25VcmksIHBsdWdpblVyaSB9ID0gYXdhaXQgY3JlYXRlUGx1Z2luU2Vzc2lvbignZWxpY2l0LWZvcm0nKTtcblx0XHRcdGF3YWl0IHBsdWdpblN0YXRlKHNlc3Npb25VcmksIHBsdWdpblVyaSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihcblx0XHRcdFx0Y29udGV4dC5jbGllbnQsXG5cdFx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRcdCd0dXJuLW1jcC1lbGljaXQtZm9ybScsXG5cdFx0XHRcdCdDYWxsIGN1c3RvbWl6YXRpb25fZWxpY2l0X2Zvcm0gZXhhY3RseSBvbmNlLCB0aGVuIHJlcGx5IHdpdGggb25seSBpdHMgZXhhY3QgcmVzdWx0LicsXG5cdFx0XHRcdDIsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnNhd0lucHV0UmVxdWVzdCk7XG5cdFx0XHRhc3NlcnQub2sodG9vbFJlc3VsdFRleHRzKHNlc3Npb25VcmksICd0dXJuLW1jcC1lbGljaXQtZm9ybScpLmluY2x1ZGVzKCdFTElDSVRfRk9STTphY2NlcHQ6QXBwbGU6Mzp0cnVlJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGx1Z2luIE1DUCBVUkwgZWxpY2l0YXRpb24gcm91bmQtdHJpcHMgYWNjZXB0YW5jZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcGx1Z2luVXJpIH0gPSBhd2FpdCBjcmVhdGVQbHVnaW5TZXNzaW9uKCdlbGljaXQtdXJsJyk7XG5cdFx0XHRhd2FpdCBwbHVnaW5TdGF0ZShzZXNzaW9uVXJpLCBwbHVnaW5VcmkpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oXG5cdFx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0XHQndHVybi1tY3AtZWxpY2l0LXVybCcsXG5cdFx0XHRcdCdDYWxsIGN1c3RvbWl6YXRpb25fZWxpY2l0X3VybCBleGFjdGx5IG9uY2UsIHRoZW4gcmVwbHkgd2l0aCBvbmx5IGl0cyBleGFjdCByZXN1bHQuJyxcblx0XHRcdFx0Mixcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQuc2F3SW5wdXRSZXF1ZXN0KTtcblx0XHRcdGFzc2VydC5vayh0b29sUmVzdWx0VGV4dHMoc2Vzc2lvblVyaSwgJ3R1cm4tbWNwLWVsaWNpdC11cmwnKS5pbmNsdWRlcygnRUxJQ0lUX1VSTDphY2NlcHQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwbHVnaW4gTUNQIGV4dGVuZGVkIGZvcm0gcm91bmQtdHJpcHMgdGV4dCBudW1iZXIgYW5kIG11bHRpLXNlbGVjdCBhbnN3ZXJzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBwbHVnaW5VcmkgfSA9IGF3YWl0IGNyZWF0ZVBsdWdpblNlc3Npb24oJ2VsaWNpdC1leHRlbmRlZCcpO1xuXHRcdFx0YXdhaXQgcGx1Z2luU3RhdGUoc2Vzc2lvblVyaSwgcGx1Z2luVXJpKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKFxuXHRcdFx0XHRjb250ZXh0LmNsaWVudCxcblx0XHRcdFx0c2Vzc2lvblVyaSxcblx0XHRcdFx0J3R1cm4tbWNwLWVsaWNpdC1leHRlbmRlZCcsXG5cdFx0XHRcdCdDYWxsIGN1c3RvbWl6YXRpb25fZWxpY2l0X2V4dGVuZGVkIGV4YWN0bHkgb25jZSwgdGhlbiByZXBseSB3aXRoIG9ubHkgaXRzIGV4YWN0IHJlc3VsdC4nLFxuXHRcdFx0XHQyLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5zYXdJbnB1dFJlcXVlc3QpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRvb2xSZXN1bHRUZXh0cyhzZXNzaW9uVXJpLCAndHVybi1tY3AtZWxpY2l0LWV4dGVuZGVkJykuaW5jbHVkZXMoJ0VMSUNJVF9FWFRFTkRFRDphY2NlcHQ6c2FtcGxlOjIuNTpSZWQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwbHVnaW4gTUNQIGZvcm0gY29lcmNlcyB0ZXh0IGFuc3dlcnMgdG8gYm9vbGVhbiBudW1iZXIgYW5kIGFycmF5IHZhbHVlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcGx1Z2luVXJpIH0gPSBhd2FpdCBjcmVhdGVQbHVnaW5TZXNzaW9uKCdlbGljaXQtY29lcmNpb24tdGV4dCcpO1xuXHRcdFx0YXdhaXQgcGx1Z2luU3RhdGUoc2Vzc2lvblVyaSwgcGx1Z2luVXJpKTtcblx0XHRcdGNvbnN0IHR1cm5JZCA9ICd0dXJuLW1jcC1lbGljaXQtY29lcmNpb24tdGV4dCc7XG5cdFx0XHRhd2FpdCBkcml2ZUNvZXJjaW9uVHVybihzZXNzaW9uVXJpLCB0dXJuSWQsIHJlcXVlc3QgPT4gT2JqZWN0LmZyb21FbnRyaWVzKHJlcXVlc3QucXVlc3Rpb25zIS5tYXAocXVlc3Rpb24gPT4ge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IHF1ZXN0aW9uLmlkID09PSAnZW5hYmxlZCcgPyAnZmFsc2UnXG5cdFx0XHRcdFx0OiBxdWVzdGlvbi5pZCA9PT0gJ3JhdGlvJyA/ICc0LjUnXG5cdFx0XHRcdFx0XHQ6IHF1ZXN0aW9uLmlkID09PSAnY29sb3JzJyA/ICdCbHVlJ1xuXHRcdFx0XHRcdFx0XHQ6ICdCYW5hbmEnO1xuXHRcdFx0XHRyZXR1cm4gW3F1ZXN0aW9uLmlkLCB7XG5cdFx0XHRcdFx0c3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0XHR2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCwgdmFsdWUgfSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgQ2hhdElucHV0QW5zd2VyXTtcblx0XHRcdH0pKSk7XG5cblx0XHRcdGFzc2VydC5vayh0b29sUmVzdWx0VGV4dHMoc2Vzc2lvblVyaSwgdHVybklkKS5pbmNsdWRlcygnQ09FUkNJT046Ym9vbGVhbjpmYWxzZTpudW1iZXI6NC41OmFycmF5OkJsdWU6c3RyaW5nOkJhbmFuYScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BsdWdpbiBNQ1AgZm9ybSBjb21iaW5lcyBzZWxlY3RlZCBhbmQgZnJlZWZvcm0gYXJyYXkgYW5zd2VycycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcGx1Z2luVXJpIH0gPSBhd2FpdCBjcmVhdGVQbHVnaW5TZXNzaW9uKCdlbGljaXQtY29lcmNpb24tc2VsZWN0ZWQnKTtcblx0XHRcdGF3YWl0IHBsdWdpblN0YXRlKHNlc3Npb25VcmksIHBsdWdpblVyaSk7XG5cdFx0XHRjb25zdCB0dXJuSWQgPSAndHVybi1tY3AtZWxpY2l0LWNvZXJjaW9uLXNlbGVjdGVkJztcblx0XHRcdGF3YWl0IGRyaXZlQ29lcmNpb25UdXJuKHNlc3Npb25VcmksIHR1cm5JZCwgcmVxdWVzdCA9PiBPYmplY3QuZnJvbUVudHJpZXMocmVxdWVzdC5xdWVzdGlvbnMhLm1hcChxdWVzdGlvbiA9PiB7XG5cdFx0XHRcdGxldCBhbnN3ZXI6IENoYXRJbnB1dEFuc3dlcjtcblx0XHRcdFx0aWYgKHF1ZXN0aW9uLmlkID09PSAnZW5hYmxlZCcpIHtcblx0XHRcdFx0XHRhbnN3ZXIgPSB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5Cb29sZWFuLCB2YWx1ZTogdHJ1ZSB9IH07XG5cdFx0XHRcdH0gZWxzZSBpZiAocXVlc3Rpb24uaWQgPT09ICdyYXRpbycpIHtcblx0XHRcdFx0XHRhbnN3ZXIgPSB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5OdW1iZXIsIHZhbHVlOiAyLjUgfSB9O1xuXHRcdFx0XHR9IGVsc2UgaWYgKHF1ZXN0aW9uLmlkID09PSAnY29sb3JzJykge1xuXHRcdFx0XHRcdGFuc3dlciA9IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkTWFueSwgdmFsdWU6IFsnUmVkJ10sIGZyZWVmb3JtVmFsdWVzOiBbJ0JsdWUnXSB9IH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YW5zd2VyID0geyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLCB2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWQsIHZhbHVlOiAnQXBwbGUnIH0gfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gW3F1ZXN0aW9uLmlkLCBhbnN3ZXJdO1xuXHRcdFx0fSkpKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHRvb2xSZXN1bHRUZXh0cyhzZXNzaW9uVXJpLCB0dXJuSWQpLmluY2x1ZGVzKCdDT0VSQ0lPTjpib29sZWFuOnRydWU6bnVtYmVyOjIuNTphcnJheTpSZWQrQmx1ZTpzdHJpbmc6QXBwbGUnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwbHVnaW4gTUNQIGZvcm0gZWxpY2l0YXRpb24gY2FuY2VsbGF0aW9uIHJldHVybnMgdG8gdGhlIG1vZGVsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBwbHVnaW5VcmkgfSA9IGF3YWl0IGNyZWF0ZVBsdWdpblNlc3Npb24oJ2VsaWNpdC1jYW5jZWwnKTtcblx0XHRcdGF3YWl0IHBsdWdpblN0YXRlKHNlc3Npb25VcmksIHBsdWdpblVyaSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRyaXZlVHVybldpdGhDYW5jZWxsZWRJbnB1dFRvQ29tcGxldGlvbihcblx0XHRcdFx0Y29udGV4dC5jbGllbnQsXG5cdFx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRcdCd0dXJuLW1jcC1lbGljaXQtY2FuY2VsJyxcblx0XHRcdFx0J0NhbGwgY3VzdG9taXphdGlvbl9lbGljaXRfZm9ybSBleGFjdGx5IG9uY2UuIElmIHRoZSBlbGljaXRhdGlvbiBpcyBjYW5jZWxsZWQsIHJlcGx5IGV4YWN0bHkgXCJlbGljaXRhdGlvbiBjYW5jZWxsZWRcIi4nLFxuXHRcdFx0XHQyLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5zYXdJbnB1dFJlcXVlc3QpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRvb2xSZXN1bHRUZXh0cyhzZXNzaW9uVXJpLCAndHVybi1tY3AtZWxpY2l0LWNhbmNlbCcpLnNvbWUodGV4dCA9PiB0ZXh0LnN0YXJ0c1dpdGgoJ0VMSUNJVF9GT1JNOmNhbmNlbCcpKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnJlc3BvbnNlVGV4dC50cmltKCkuZW5kc1dpdGgoJ2VsaWNpdGF0aW9uIGNhbmNlbGxlZCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BsdWdpbiBNQ1Agc2FtcGxpbmcgY2FuY2VsbGF0aW9uIHJldHVybnMgdG8gdGhlIG1vZGVsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBwbHVnaW5VcmkgfSA9IGF3YWl0IGNyZWF0ZVBsdWdpblNlc3Npb24oJ3NhbXBsaW5nJyk7XG5cdFx0XHRhd2FpdCBwbHVnaW5TdGF0ZShzZXNzaW9uVXJpLCBwbHVnaW5VcmkpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oXG5cdFx0XHRcdGNvbnRleHQuY2xpZW50LFxuXHRcdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0XHQndHVybi1tY3Atc2FtcGxpbmcnLFxuXHRcdFx0XHQnQ2FsbCBjdXN0b21pemF0aW9uX3NhbXBsZSBleGFjdGx5IG9uY2UuIElmIHNhbXBsaW5nIGlzIGNhbmNlbGxlZCwgcmVwbHkgZXhhY3RseSBcInNhbXBsaW5nIGNhbmNlbGxlZFwiLicsXG5cdFx0XHRcdDIsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2sodG9vbFJlc3VsdFRleHRzKHNlc3Npb25VcmksICd0dXJuLW1jcC1zYW1wbGluZycpLnNvbWUodGV4dCA9PiB0ZXh0LmluY2x1ZGVzKCdNQ1BfU0FNUExFOlRoZSB1c2VyIGNhbmNlbGxlZCB0aGUgcmVxdWVzdC4nKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5yZXNwb25zZVRleHQudHJpbSgpLmVuZHNXaXRoKCdzYW1wbGluZyBjYW5jZWxsZWQnKSk7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFlBQVksV0FBVyxhQUFhLGNBQWMscUJBQXFCO0FBQ2hGLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsY0FBYztBQUN2QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUF3RTtBQUNqRixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2Qix1QkFBdUI7QUFDN0QsU0FBUyxrQkFBbUQ7QUFDNUQsU0FBUyxxQkFBcUIsc0JBQXNCLDBCQUEwQixpQkFBaUIsbUJBQW1CLGtCQUFrQixzQkFBNks7QUFDalQsU0FBUyxtQkFBbUIsdUJBQXVCLGtDQUFrQyx5Q0FBeUMsb0JBQW9CLHVCQUF1QjtBQUN6SyxTQUFTLHNCQUFzQixtQkFBbUIsNEJBQTRCO0FBQzlFLFNBQVMsNEJBQTJEO0FBRXBFLE1BQU0sY0FBYyxjQUFjLFlBQVksR0FBRztBQWlCMUMsU0FBUyxxQkFBcUIsU0FBeUM7QUFDN0UsTUFBSSxRQUFRLFNBQVMsVUFBVTtBQUM5QjtBQUFBLEVBQ0Q7QUFDQSxRQUFNLEVBQUUsUUFBUSxpQkFBaUIsU0FBUyxJQUFJO0FBQzlDLE1BQUksT0FBTyxhQUFhLFVBQVU7QUFDakM7QUFBQSxFQUNEO0FBRUEsaUJBQWUsb0JBQW9CLFFBQWdCLFVBQWlDLENBQUMsR0FBNEI7QUFDaEgsVUFBTSxZQUFZLFlBQVksS0FBSyxPQUFPLEdBQUcscUJBQXFCLE1BQU0sR0FBRyxDQUFDO0FBQzVFLFVBQU0sU0FBUyxZQUFZLEtBQUssT0FBTyxHQUFH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QUUsTUFBTSx5QkFBeUIsY0FBYyxPQUFPLENBQUMsS0FBSyxHQUFHLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxFQUFFO0FBQUEsUUFDcEosT0FBTztBQUNOLG1CQUFTLEVBQUUsT0FBTyxxQkFBcUIsV0FBVyxPQUFPLEVBQUUsTUFBTSx5QkFBeUIsVUFBVSxPQUFPLFFBQVEsRUFBRTtBQUFBLFFBQ3RIO0FBQ0EsZUFBTyxDQUFDLFNBQVMsSUFBSSxNQUFNO0FBQUEsTUFDNUIsQ0FBQyxDQUFDLENBQUM7QUFFSCxhQUFPLEdBQUcsZ0JBQWdCLFlBQVksTUFBTSxFQUFFLFNBQVMsOERBQThELENBQUM7QUFBQSxJQUN2SCxDQUFDO0FBRUQsU0FBSyxpRUFBaUUsaUJBQWtCO0FBQ3ZGLFdBQUssUUFBUSxJQUFPO0FBQ3BCLFlBQU0sRUFBRSxZQUFZLFVBQVUsSUFBSSxNQUFNLG9CQUFvQixlQUFlO0FBQzNFLFlBQU0sWUFBWSxZQUFZLFNBQVM7QUFFdkMsWUFBTSxTQUFTLE1BQU07QUFBQSxRQUNwQixRQUFRO0FBQUEsUUFDUjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxhQUFPLEdBQUcsT0FBTyxlQUFlO0FBQ2hDLGFBQU8sR0FBRyxnQkFBZ0IsWUFBWSx3QkFBd0IsRUFBRSxLQUFLLFVBQVEsS0FBSyxXQUFXLG9CQUFvQixDQUFDLENBQUM7QUFDbkgsYUFBTyxHQUFHLE9BQU8sYUFBYSxLQUFLLEVBQUUsU0FBUyx1QkFBdUIsQ0FBQztBQUFBLElBQ3ZFLENBQUM7QUFFRCxTQUFLLHlEQUF5RCxpQkFBa0I7QUFDL0UsV0FBSyxRQUFRLElBQU87QUFDcEIsWUFBTSxFQUFFLFlBQVksVUFBVSxJQUFJLE1BQU0sb0JBQW9CLFVBQVU7QUFDdEUsWUFBTSxZQUFZLFlBQVksU0FBUztBQUV2QyxZQUFNLFNBQVMsTUFBTTtBQUFBLFFBQ3BCLFFBQVE7QUFBQSxRQUNSO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLGFBQU8sR0FBRyxnQkFBZ0IsWUFBWSxtQkFBbUIsRUFBRSxLQUFLLFVBQVEsS0FBSyxTQUFTLDRDQUE0QyxDQUFDLENBQUM7QUFDcEksYUFBTyxHQUFHLE9BQU8sYUFBYSxLQUFLLEVBQUUsU0FBUyxvQkFBb0IsQ0FBQztBQUFBLElBQ3BFLENBQUM7QUFBQSxFQUNGO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
