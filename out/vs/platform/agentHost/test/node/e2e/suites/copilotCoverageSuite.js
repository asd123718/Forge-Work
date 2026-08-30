import assert from "assert";
import { execSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { retry } from "../../../../../../base/common/async.js";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { AgentHostConfigKey } from "../../../../common/agentHostCustomizationConfig.js";
import { AgentHostAutoReplyEnabledConfigKey } from "../../../../common/agentHostSchema.js";
import { buildUncommittedChangesetUri } from "../../../../common/changesetUri.js";
import { CopilotCliConfigKey } from "../../../../common/copilotCliConfig.js";
import { CompletionItemKind } from "../../../../common/state/protocol/commands.js";
import { PROTOCOL_VERSION } from "../../../../common/state/protocol/version/registry.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { buildDefaultChatUri, MessageKind, ResponsePartKind, ROOT_STATE_URI, ToolCallStatus, ToolResultContentType } from "../../../../common/state/sessionState.js";
import { assertToolCallCompleteText, createRealSession, dispatchTurn, driveTurnToCompletion, getMarkdownResponseText, initTestGitRepo, resolveGitHubToken, terminalResourceFromContent } from "../harness/agentHostE2ETestHarness.js";
import { expandShellToolName } from "../harness/shellToolNames.js";
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
const nodeRequire = createRequire(import.meta.url);
function startedToolNames(context, turnId) {
  return context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => getActionEnvelope(n).action).filter((action) => action.turnId === turnId).map((action) => action.toolName);
}
function defineCopilotCoverageTests(context) {
  if (context.tier !== "parity" || context.config.provider !== "copilotcli") {
    return;
  }
  const { config, createdSessions, tempDirs } = context;
  async function initialize(clientId, workingDirectory) {
    context.client.setWorkingDirectory(workingDirectory);
    await context.client.call("initialize", {
      channel: ROOT_STATE_URI,
      protocolVersions: [PROTOCOL_VERSION],
      clientId
    }, 3e4);
    await context.client.call("authenticate", {
      channel: ROOT_STATE_URI,
      resource: "https://api.github.com",
      token: config.githubToken ?? resolveGitHubToken()
    }, 3e4);
  }
  async function createWorkspacelessSession(prefix) {
    const clientWorkingDirectory = mkdtempSync(join(tmpdir(), `ahp-${prefix}-client-`));
    tempDirs.push(clientWorkingDirectory);
    await initialize(`${prefix}-client`, clientWorkingDirectory);
    const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
    await context.client.call("createSession", {
      channel: sessionUri,
      provider: config.provider,
      config: { isolation: "folder" }
    }, 3e4);
    createdSessions.push(sessionUri);
    await context.client.call("subscribe", { channel: sessionUri });
    await context.client.call("subscribe", { channel: buildDefaultChatUri(sessionUri) });
    context.client.clearReceived();
    return sessionUri;
  }
  async function createWorkspaceSession(prefix, beforeCreateSession) {
    const workspace = mkdtempSync(join(tmpdir(), `ahp-${prefix}-`));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(context.client, config, `${prefix}-client`, createdSessions, URI.file(workspace), beforeCreateSession);
    return { sessionUri, workspace };
  }
  async function setRootConfig(config2, clientSeq) {
    await context.client.call("subscribe", { channel: ROOT_STATE_URI });
    context.client.clearReceived();
    context.client.dispatch({
      channel: ROOT_STATE_URI,
      clientSeq,
      action: { type: ActionType.RootConfigChanged, config: config2 }
    });
    await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, ActionType.RootConfigChanged)) {
        return false;
      }
      const action = getActionEnvelope(n).action;
      return Object.entries(config2).every(([key, value]) => JSON.stringify(action.config?.[key]) === JSON.stringify(value));
    }, 3e4);
  }
  async function driveToolSearchTurn(sessionUri, turnId, toolSearchResult) {
    const chatUri = buildDefaultChatUri(sessionUri);
    const starts = /* @__PURE__ */ new Map();
    const seen = /* @__PURE__ */ new Set();
    let clientSeq = 10;
    context.client.clearReceived();
    context.client.dispatch({
      channel: chatUri,
      clientSeq: 1,
      action: {
        type: ActionType.ChatTurnStarted,
        turnId,
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "Search for the get_magic_word tool before using it. Call get_magic_word exactly once, then reply with only its result.",
          origin: { kind: MessageKind.User },
          model: { id: "gpt-5.6-sol" }
        }
      }
    });
    while (true) {
      const notification = await context.client.waitForNotification((n) => {
        if (seen.has(n) || getActionEnvelope(n).channel !== chatUri) {
          return false;
        }
        return isActionNotification(n, "chat/toolCallStart") || isActionNotification(n, "chat/toolCallReady") || isActionNotification(n, "chat/turnComplete") || isActionNotification(n, "chat/error");
      }, 9e4);
      seen.add(notification);
      if (isActionNotification(notification, "chat/error")) {
        const action = getActionEnvelope(notification).action;
        throw new Error(`Tool-search turn failed: ${action.error.errorType}: ${action.error.message}`);
      }
      if (isActionNotification(notification, "chat/toolCallStart")) {
        const action = getActionEnvelope(notification).action;
        if (action.turnId === turnId) {
          starts.set(action.toolCallId, action.toolName);
        }
        continue;
      }
      if (isActionNotification(notification, "chat/toolCallReady")) {
        const action = getActionEnvelope(notification).action;
        const toolName = starts.get(action.toolCallId);
        if (!toolName) {
          continue;
        }
        const isSearch = toolName === "toolSearch" || toolName === "tool_search_tool";
        context.client.dispatch({
          channel: chatUri,
          clientSeq: clientSeq++,
          action: {
            type: ActionType.ChatToolCallComplete,
            turnId,
            toolCallId: action.toolCallId,
            result: {
              success: true,
              pastTenseMessage: isSearch ? "Searched tools" : "Got the magic word",
              content: [{
                type: ToolResultContentType.Text,
                text: isSearch ? toolSearchResult : "MAGIC_WORD"
              }]
            }
          }
        });
        continue;
      }
      break;
    }
    return { toolNames: [...starts.values()], responseText: getMarkdownResponseText(context.client) };
  }
  async function createFork(sourceSessionUri, sourceTurnId) {
    const forkUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
    await context.client.call("createSession", {
      channel: forkUri,
      provider: config.provider,
      fork: { session: sourceSessionUri, turnId: sourceTurnId },
      config: { isolation: "folder" }
    }, 9e4);
    createdSessions.push(forkUri);
    await context.client.call("subscribe", { channel: forkUri });
    await context.client.call("subscribe", { channel: buildDefaultChatUri(forkUri) });
    context.client.clearReceived();
    return forkUri;
  }
  async function assertSessionListed(sessionUri) {
    await retry(async () => {
      const listed = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
      assert.ok(listed.items.some((session) => session.resource === sessionUri));
    }, 100, 100);
  }
  (context.isWindows ? test.skip : test)("workspaceless session uses and cleans up a provider scratch directory", async function() {
    this.timeout(18e4);
    const sessionUri = await createWorkspacelessSession("workspaceless-scratch");
    await driveTurnToCompletion(context.client, sessionUri, "turn-workspaceless-scratch", 'Reply exactly "ready".', 1);
    const subscribed = await context.client.call("subscribe", { channel: sessionUri });
    const state = subscribed.snapshot.state;
    const scratchDirectory = state.workingDirectories?.[0] ? URI.parse(state.workingDirectories[0]).fsPath : void 0;
    assert.ok(scratchDirectory && existsSync(scratchDirectory));
    await context.client.call("disposeSession", { channel: sessionUri }, 3e4);
    createdSessions.splice(createdSessions.indexOf(sessionUri), 1);
    await retry(async () => assert.strictEqual(existsSync(scratchDirectory), false), 50, 20);
  });
  test("root auto-reply completes provider input without a client response", async function() {
    this.timeout(18e4);
    const { sessionUri } = await createWorkspaceSession("auto-reply");
    try {
      await setRootConfig({ [AgentHostAutoReplyEnabledConfigKey]: true }, 100);
      context.client.clearReceived();
      dispatchTurn(context.client, sessionUri, "turn-auto-reply", 'Call ask_user exactly once to ask "Which option?" with choices "Alpha" and "Beta". If the answer says the user is unavailable, reply exactly "AUTO_REPLIED".', 1);
      await context.client.waitForNotification(
        (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).action.turnId === "turn-auto-reply",
        9e4
      );
      assert.strictEqual(getMarkdownResponseText(context.client).trim(), "AUTO_REPLIED");
    } finally {
      await setRootConfig({ [AgentHostAutoReplyEnabledConfigKey]: false }, 101);
    }
  });
  (context.runKnownIssueTests ? test : test.skip)("config slash completions reflect the current Copilot session mode", async function() {
    this.timeout(18e4);
    const { sessionUri } = await createWorkspaceSession("config-slash-completions");
    await driveTurnToCompletion(context.client, sessionUri, "turn-config-slash-ready", 'Reply exactly "ready".', 1);
    const chatUri = buildDefaultChatUri(sessionUri);
    const before = await context.client.call("completions", {
      channel: chatUri,
      kind: CompletionItemKind.UserMessage,
      text: "/autopilot",
      offset: 10
    });
    context.client.dispatch({
      channel: sessionUri,
      clientSeq: 10,
      action: {
        type: ActionType.SessionConfigChanged,
        config: { mode: "autopilot" }
      }
    });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, ActionType.SessionConfigChanged) && getActionEnvelope(n).channel === sessionUri,
      3e4
    );
    const after = await context.client.call("completions", {
      channel: chatUri,
      kind: CompletionItemKind.UserMessage,
      text: "/autopilot",
      offset: 10
    });
    assert.deepStrictEqual({
      before: before.items.map((item) => item.attachment.label).filter((label) => label.startsWith("/autopilot")),
      after: after.items.map((item) => item.attachment.label).filter((label) => label.startsWith("/autopilot"))
    }, {
      before: ["/autopilot", "/autopilot on"],
      after: ["/autopilot", "/autopilot off"]
    });
  });
  test("goal config slash command switches to plan mode and forwards the remaining prompt", async function() {
    this.timeout(18e4);
    const { sessionUri } = await createWorkspaceSession("goal-config-slash");
    const result = await driveTurnToCompletion(context.client, sessionUri, "turn-goal-config-slash", '/goal Reply exactly "GOAL_MODE". Do not use tools.', 1);
    const subscribed = await context.client.call("subscribe", { channel: sessionUri });
    const state = subscribed.snapshot.state;
    assert.deepStrictEqual({
      mode: state.config?.values["mode"],
      response: result.responseText.trim()
    }, {
      mode: "plan",
      response: "GOAL_MODE"
    });
  });
  test("root stdio MCP server receives normalized environment values", async function() {
    this.timeout(24e4);
    const { sessionUri, workspace } = await createWorkspaceSession("root-mcp");
    const mcpScript = join(workspace, "root-mcp.cjs");
    const mcpServerModule = nodeRequire.resolve("@modelcontextprotocol/sdk/server/index.js");
    const mcpStdioModule = nodeRequire.resolve("@modelcontextprotocol/sdk/server/stdio.js");
    const mcpTypesModule = nodeRequire.resolve("@modelcontextprotocol/sdk/types.js");
    writeFileSync(mcpScript, [
      `const { Server } = require(${JSON.stringify(mcpServerModule)});`,
      `const { StdioServerTransport } = require(${JSON.stringify(mcpStdioModule)});`,
      `const { CallToolRequestSchema, ListToolsRequestSchema } = require(${JSON.stringify(mcpTypesModule)});`,
      `const server = new Server({ name: "root-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });`,
      `server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "root_probe", description: "Returns normalized environment values", inputSchema: { type: "object", properties: {} } }] }));`,
      `server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: "text", text: \`ROOT_MCP:\${process.env.ROOT_NUMBER}:\${process.env.ROOT_NULL ?? "unset"}\` }] }));`,
      "void server.connect(new StdioServerTransport());"
    ].join("\n"));
    try {
      await setRootConfig({
        mcpServers: {
          root_probe_server: {
            type: "stdio",
            command: process.execPath,
            args: [mcpScript],
            env: { ELECTRON_RUN_AS_NODE: "1", ROOT_NUMBER: 7, ROOT_NULL: null },
            cwd: tmpdir()
          }
        }
      }, 100);
      const turnId = "turn-root-mcp";
      await driveTurnToCompletion(context.client, sessionUri, turnId, "Call root_probe exactly once, then reply with only its exact result.", 1);
      const completion = context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallComplete")).map((n) => getActionEnvelope(n).action).find((action) => action.turnId === turnId);
      const resultText = completion?.result.content?.filter((content) => content.type === ToolResultContentType.Text).map((content) => content.text).join("") ?? "";
      assert.strictEqual(resultText, "ROOT_MCP:7:unset");
    } finally {
      await setRootConfig({ mcpServers: {} }, 101);
    }
  });
  test("malformed root MCP server entries do not prevent a provider turn", async function() {
    this.timeout(18e4);
    const { sessionUri } = await createWorkspaceSession("root-mcp-malformed");
    try {
      await setRootConfig({
        mcpServers: {
          missingCommand: { type: "stdio", args: [] },
          missingUrl: { type: "http" },
          unknownType: { type: "other", command: "ignored" }
        }
      }, 100);
      const result = await driveTurnToCompletion(context.client, sessionUri, "turn-root-mcp-malformed", 'Reply exactly "MALFORMED_MCP_IGNORED".', 1);
      assert.strictEqual(result.responseText.trim(), "MALFORMED_MCP_IGNORED");
    } finally {
      await setRootConfig({ mcpServers: {} }, 101);
    }
  });
  (context.runRecordOnlyTests ? test : test.skip)("tool search exposes deferred client tools and executes the selected result", async function() {
    this.timeout(24e4);
    const { sessionUri } = await createWorkspaceSession("tool-search-success");
    try {
      await setRootConfig({ [CopilotCliConfigKey.ToolSearchEnabled]: true }, 100);
      context.client.dispatch({
        channel: sessionUri,
        clientSeq: 1,
        action: {
          type: ActionType.SessionActiveClientSet,
          activeClient: {
            clientId: "tool-search-success-client",
            tools: [{
              name: "toolSearch",
              description: "Searches deferred tools by name.",
              inputSchema: { type: "object", properties: { query: { type: "string" } } }
            }, {
              name: "get_magic_word",
              description: "Returns the magic word.",
              inputSchema: { type: "object", properties: {} }
            }]
          }
        }
      });
      await context.client.waitForNotification((n) => isActionNotification(n, ActionType.SessionActiveClientSet), 3e4);
      const result = await driveToolSearchTurn(sessionUri, "turn-tool-search-success", '["get_magic_word"]');
      assert.deepStrictEqual({
        hasSearch: result.toolNames.some((name) => name === "toolSearch" || name === "tool_search_tool"),
        hasMagicWord: result.toolNames.includes("get_magic_word"),
        response: result.responseText.trim()
      }, {
        hasSearch: true,
        hasMagicWord: true,
        response: "MAGIC_WORD"
      });
    } finally {
      await setRootConfig({ [CopilotCliConfigKey.ToolSearchEnabled]: false }, 101);
    }
  });
  (context.runRecordOnlyTests ? test : test.skip)("tool search tolerates a malformed client result without activating a deferred tool", async function() {
    this.timeout(24e4);
    const { sessionUri } = await createWorkspaceSession("tool-search-malformed");
    try {
      await setRootConfig({ [CopilotCliConfigKey.ToolSearchEnabled]: true }, 100);
      context.client.dispatch({
        channel: sessionUri,
        clientSeq: 1,
        action: {
          type: ActionType.SessionActiveClientSet,
          activeClient: {
            clientId: "tool-search-malformed-client",
            tools: [{
              name: "toolSearch",
              description: "Searches deferred tools by name.",
              inputSchema: { type: "object", properties: { query: { type: "string" } } }
            }, {
              name: "get_magic_word",
              description: "Returns the magic word.",
              inputSchema: { type: "object", properties: {} }
            }]
          }
        }
      });
      await context.client.waitForNotification((n) => isActionNotification(n, ActionType.SessionActiveClientSet), 3e4);
      const result = await driveToolSearchTurn(sessionUri, "turn-tool-search-malformed", "not-json");
      assert.deepStrictEqual({
        hasSearch: result.toolNames.some((name) => name === "toolSearch" || name === "tool_search_tool"),
        hasMagicWord: result.toolNames.includes("get_magic_word")
      }, {
        hasSearch: true,
        hasMagicWord: false
      });
    } finally {
      await setRootConfig({ [CopilotCliConfigKey.ToolSearchEnabled]: false }, 101);
    }
  });
  test("session fork inherits provider history through the selected source turn", async function() {
    this.timeout(24e4);
    const { sessionUri, workspace } = await createWorkspaceSession("session-fork-history");
    await driveTurnToCompletion(context.client, sessionUri, "turn-fork-alpha", 'Remember FORK_ALPHA. Reply exactly "ready".', 1);
    await assertSessionListed(sessionUri);
    const forkUri = await createFork(sessionUri, "turn-fork-alpha");
    await context.restartServer();
    await initialize("session-fork-history-restored-client", workspace);
    await context.client.call("subscribe", { channel: forkUri });
    await context.client.call("subscribe", { channel: buildDefaultChatUri(forkUri) });
    const restored = await fetchSessionWithChat(context.client, forkUri);
    assert.deepStrictEqual(restored.turns.map((turn) => turn.message.text), ['Remember FORK_ALPHA. Reply exactly "ready".']);
    const reforkUri = await createFork(forkUri, restored.turns[0].id);
    const result = await driveTurnToCompletion(context.client, reforkUri, "turn-fork-followup", "Reply with only the code word you were asked to remember.", 10);
    assert.ok(result.responseText.includes("FORK_ALPHA"));
  });
  test("session fork excludes provider history after the selected source turn", async function() {
    this.timeout(24e4);
    const { sessionUri } = await createWorkspaceSession("session-fork-bounded");
    await driveTurnToCompletion(context.client, sessionUri, "turn-fork-first", 'Remember FORK_FIRST. Reply exactly "ready".', 1);
    await driveTurnToCompletion(context.client, sessionUri, "turn-fork-later", 'Now remember FORK_LATER too. Reply exactly "ready".', 10);
    await assertSessionListed(sessionUri);
    const forkUri = await createFork(sessionUri, "turn-fork-first");
    const result = await driveTurnToCompletion(context.client, forkUri, "turn-fork-bounded-followup", 'Reply exactly "bounded" if you remember FORK_FIRST but not FORK_LATER.', 20);
    assert.strictEqual(result.responseText.trim(), "bounded");
  });
  test("view range returns only the requested workspace lines", async function() {
    this.timeout(18e4);
    const { sessionUri, workspace } = await createWorkspaceSession("view-range");
    writeFileSync(join(workspace, "range.txt"), "RANGE_ONE\nRANGE_TWO\nRANGE_THREE\nRANGE_FOUR\nRANGE_FIVE\n");
    const turnId = "turn-view-range";
    await driveTurnToCompletion(context.client, sessionUri, turnId, 'Use view exactly once with view_range [2, 4] to read range.txt. Do not run a shell command. Then reply exactly "done".', 1);
    const viewStart = context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => getActionEnvelope(n).action).find((action) => action.turnId === turnId && action.toolName === "view");
    const viewCompletion = viewStart && context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallComplete")).map((n) => getActionEnvelope(n).action).find((action) => action.toolCallId === viewStart.toolCallId);
    const resultText = viewCompletion?.result.content?.filter((content) => content.type === ToolResultContentType.Text).map((content) => content.text).join("") ?? "";
    assert.deepStrictEqual({
      hasFirst: resultText.includes("RANGE_ONE"),
      hasSecond: resultText.includes("RANGE_TWO"),
      hasFourth: resultText.includes("RANGE_FOUR"),
      hasFifth: resultText.includes("RANGE_FIVE")
    }, {
      hasFirst: false,
      hasSecond: true,
      hasFourth: true,
      hasFifth: false
    });
  });
  test("grep searches workspace content through the provider tool", async function() {
    this.timeout(18e4);
    const { sessionUri, workspace } = await createWorkspaceSession("grep-tool");
    writeFileSync(join(workspace, "needle.txt"), "COPILOT_E2E_NEEDLE\n");
    const turnId = "turn-grep-tool";
    await driveTurnToCompletion(context.client, sessionUri, turnId, 'Use grep exactly once to find COPILOT_E2E_NEEDLE in the workspace, then reply exactly "found".', 1);
    assertToolCallCompleteText(context.client, {
      channel: buildDefaultChatUri(sessionUri),
      turnId,
      toolNames: ["grep"],
      workspace,
      expected: [/needle\.txt/]
    });
  });
  test("glob finds a nested workspace file through the provider tool", async function() {
    this.timeout(18e4);
    const { sessionUri, workspace } = await createWorkspaceSession("glob-tool");
    mkdirSync(join(workspace, "nested"));
    writeFileSync(join(workspace, "nested", "glob-target.unique"), "target\n");
    const turnId = "turn-glob-tool";
    await driveTurnToCompletion(context.client, sessionUri, turnId, 'Use glob exactly once to find files matching **/*.unique, then reply exactly "found".', 1);
    assertToolCallCompleteText(context.client, {
      channel: buildDefaultChatUri(sessionUri),
      turnId,
      toolNames: ["glob"],
      workspace,
      expected: [/nested\/glob-target\.unique/]
    });
  });
  test("shell failure preserves the real nonzero exit code", async function() {
    this.timeout(18e4);
    const { sessionUri } = await createWorkspaceSession("shell-exit-code");
    const turnId = "turn-shell-exit-code";
    await driveTurnToCompletion(context.client, sessionUri, turnId, 'Run exactly `node -e "process.exit(7)"` with bash, then reply exactly "failed as expected".', 1);
    const shellStart = context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => getActionEnvelope(n).action).find((action) => action.turnId === turnId && action.toolName === expandShellToolName("${shell}"));
    const shellCompletion = shellStart && context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallComplete")).map((n) => getActionEnvelope(n).action).find((action) => action.toolCallId === shellStart.toolCallId);
    const terminalResult = shellCompletion?.result.content?.find((content) => content.type === ToolResultContentType.Terminal)?.result;
    assert.deepStrictEqual({
      success: shellCompletion?.result.success,
      exitCode: terminalResult?.exitCode
    }, {
      success: true,
      exitCode: 7
    });
  });
  (context.runRecordOnlyTests ? test : test.skip)("managed shell can be read and stopped after asynchronous execution", async function() {
    this.timeout(24e4);
    const { sessionUri } = await createWorkspaceSession("managed-shell-read-stop");
    const turnId = "turn-managed-shell-read-stop";
    await driveTurnToCompletion(context.client, sessionUri, turnId, 'Start `echo MANAGED_SHELL_VALUE` asynchronously with bash, read that shell with read_bash, stop it with stop_bash, then reply exactly "done".', 1);
    const toolNames = startedToolNames(context, turnId);
    assert.ok(toolNames.includes("bash") && toolNames.includes("read_bash") && toolNames.includes("stop_bash"));
  });
  (context.runRecordOnlyTests ? test : test.skip)("managed shell sessions can be listed after asynchronous execution", async function() {
    this.timeout(24e4);
    const { sessionUri } = await createWorkspaceSession("managed-shell-list");
    const turnId = "turn-managed-shell-list";
    await driveTurnToCompletion(context.client, sessionUri, turnId, 'Start `echo LISTED_SHELL_VALUE` asynchronously with bash, call list_bash, stop the shell with stop_bash, then reply exactly "done".', 1);
    const toolNames = startedToolNames(context, turnId);
    assert.ok(toolNames.includes("bash") && toolNames.includes("list_bash") && toolNames.includes("stop_bash"));
  });
  (context.runRecordOnlyTests ? test : test.skip)("custom terminal tool manages an asynchronous shell lifecycle", async function() {
    this.timeout(24e4);
    const { sessionUri } = await createWorkspaceSession("custom-terminal-lifecycle");
    try {
      await setRootConfig({ [CopilotCliConfigKey.EnableCustomTerminalTool]: true }, 100);
      const turnId = "turn-custom-terminal-lifecycle";
      await driveTurnToCompletion(context.client, sessionUri, turnId, 'Start `echo CUSTOM_TERMINAL_VALUE` asynchronously with bash, read it with read_bash, list shells with list_bash, stop it with stop_bash, then reply exactly "done".', 1);
      const toolNames = startedToolNames(context, turnId);
      assert.ok(toolNames.includes("bash") && toolNames.includes("read_bash") && toolNames.includes("list_bash") && toolNames.includes("stop_bash"));
    } finally {
      await setRootConfig({ [CopilotCliConfigKey.EnableCustomTerminalTool]: false }, 101);
    }
  });
  (context.isWindows ? test.skip : test)("custom terminal tool preserves a nonzero shell exit code", async function() {
    this.timeout(18e4);
    const deterministicShellConfig = context.isWindows ? {} : { [AgentHostConfigKey.DefaultShell]: "/bin/bash" };
    try {
      const { sessionUri } = await createWorkspaceSession("custom-terminal-exit-code", () => setRootConfig({
        [CopilotCliConfigKey.EnableCustomTerminalTool]: true,
        ...deterministicShellConfig
      }, 100));
      const turnId = "turn-custom-terminal-exit-code";
      await driveTurnToCompletion(context.client, sessionUri, turnId, 'Run exactly `node -e "process.exit(9)"` with bash, then reply exactly "failed as expected".', 1);
      const shellStart = context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallStart")).map((n) => getActionEnvelope(n).action).find((action) => action.turnId === turnId && action.toolName === expandShellToolName("${shell}"));
      const shellCompletion = shellStart && context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallComplete")).map((n) => getActionEnvelope(n).action).find((action) => action.toolCallId === shellStart.toolCallId);
      const terminalUri = shellCompletion?.result.content?.find((content) => content.type === ToolResultContentType.Terminal)?.resource ?? (shellStart && context.client.receivedNotifications((n) => isActionNotification(n, "chat/toolCallContentChanged")).map((n) => getActionEnvelope(n).action).filter((action) => action.toolCallId === shellStart.toolCallId).map((action) => terminalResourceFromContent(action.content)).find((resource) => resource !== void 0));
      assert.ok(terminalUri);
      const terminal = await context.client.call("subscribe", { channel: terminalUri });
      const terminalState = terminal.snapshot.state;
      const command = terminalState.content.find((part) => part.type === "command" && part.commandLine.includes("process.exit(9)"));
      assert.deepStrictEqual({
        supportsCommandDetection: terminalState.supportsCommandDetection,
        isComplete: command?.isComplete,
        exitCode: command?.exitCode
      }, {
        supportsCommandDetection: true,
        isComplete: true,
        exitCode: 9
      });
    } finally {
      await setRootConfig({
        [CopilotCliConfigKey.EnableCustomTerminalTool]: false,
        ...context.isWindows ? {} : { [AgentHostConfigKey.DefaultShell]: "" }
      }, 101);
    }
  });
  (!context.isWindows || context.runKnownIssueTests ? test : test.skip)("tool-rich provider history is reconstructed after a host restart", async function() {
    this.timeout(24e4);
    const { sessionUri, workspace } = await createWorkspaceSession("tool-history-restart");
    writeFileSync(join(workspace, "history.txt"), "before\n");
    const turnId = "turn-tool-history-restart";
    await driveTurnToCompletion(context.client, sessionUri, turnId, 'Use edit exactly once to replace before with after in history.txt. Do not run a shell command. Then reply exactly "history-ready".', 1);
    const before = await fetchSessionWithChat(context.client, sessionUri);
    await context.restartServer();
    await initialize("tool-history-restart-client", workspace);
    await context.client.call("subscribe", { channel: sessionUri });
    const restored = await fetchSessionWithChat(context.client, sessionUri);
    const beforeToolCalls = before.turns.flatMap((turn) => turn.responseParts).filter((part) => part.kind === ResponsePartKind.ToolCall).length;
    assert.ok(beforeToolCalls > 0);
    assert.deepStrictEqual({
      restoredToolCalls: restored.turns.flatMap((turn) => turn.responseParts).filter((part) => part.kind === ResponsePartKind.ToolCall).length,
      content: readFileSync(join(workspace, "history.txt"), "utf8")
    }, {
      restoredToolCalls: beforeToolCalls,
      content: "after\n"
    });
  });
  (context.runKnownIssueTests ? test : test.skip)("shell failure metadata is reconstructed after a host restart", async function() {
    this.timeout(24e4);
    const { sessionUri, workspace } = await createWorkspaceSession("shell-history-restart");
    const turnId = "turn-shell-history-restart";
    await driveTurnToCompletion(context.client, sessionUri, turnId, 'Run exactly `node -e "process.exit(5)"` with bash, then reply exactly "failed as expected".', 1);
    const before = await fetchSessionWithChat(context.client, sessionUri);
    const beforeToolCall = before.turns.find((turn) => turn.id === turnId)?.responseParts.find((part) => part.kind === ResponsePartKind.ToolCall);
    assert.ok(beforeToolCall?.kind === ResponsePartKind.ToolCall);
    await context.restartServer();
    await initialize("shell-history-restart-client", workspace);
    await context.client.call("subscribe", { channel: sessionUri });
    const restored = await fetchSessionWithChat(context.client, sessionUri);
    const restoredToolCall = restored.turns.find((turn) => turn.id === turnId)?.responseParts.find((part) => part.kind === ResponsePartKind.ToolCall);
    const beforeSuccess = beforeToolCall.toolCall.status === ToolCallStatus.Completed ? beforeToolCall.toolCall.success : void 0;
    const restoredSuccess = restoredToolCall?.kind === ResponsePartKind.ToolCall && restoredToolCall.toolCall.status === ToolCallStatus.Completed ? restoredToolCall.toolCall.success : void 0;
    assert.deepStrictEqual({
      toolName: restoredToolCall?.kind === ResponsePartKind.ToolCall ? restoredToolCall.toolCall.toolName : void 0,
      status: restoredToolCall?.kind === ResponsePartKind.ToolCall ? restoredToolCall.toolCall.status : void 0,
      success: restoredSuccess
    }, {
      toolName: beforeToolCall.toolCall.toolName,
      status: beforeToolCall.toolCall.status,
      success: beforeSuccess
    });
  });
  test("commit changeset operation generates a message and commits mixed changes", async function() {
    this.timeout(24e4);
    const workspace = mkdtempSync(join(tmpdir(), "ahp-changeset-commit-"));
    tempDirs.push(workspace);
    initTestGitRepo(workspace);
    writeFileSync(join(workspace, "edited.txt"), "before\n");
    writeFileSync(join(workspace, "deleted.txt"), "delete me\n");
    writeFileSync(join(workspace, "renamed-before.txt"), "rename me\n");
    execSync('git add . && git commit -q -m "seed"', { cwd: workspace });
    writeFileSync(join(workspace, "edited.txt"), "after\n");
    writeFileSync(join(workspace, "created.txt"), "created\n");
    execSync("git rm -q deleted.txt && git mv renamed-before.txt renamed-after.txt", { cwd: workspace });
    const sessionUri = await createRealSession(context.client, config, "changeset-commit-client", createdSessions, URI.file(workspace));
    const authControl = await driveTurnToCompletion(context.client, sessionUri, "turn-changeset-commit-auth-control", 'Reply exactly "AUTHENTICATED".', 1);
    assert.strictEqual(authControl.responseText.trim(), "AUTHENTICATED");
    const changesetUri = buildUncommittedChangesetUri(sessionUri);
    await retry(async () => {
      const subscribed = await context.client.call("subscribe", { channel: changesetUri });
      const state = subscribed.snapshot.state;
      if (state.files.length < 4 || !state.operations?.some((operation) => operation.id === "commit")) {
        throw new Error("Mixed uncommitted changes are not ready");
      }
    }, 100, 100);
    const result = await context.client.call("invokeChangesetOperation", {
      channel: changesetUri,
      operationId: "commit"
    }, 12e4);
    assert.deepStrictEqual({
      clean: execSync("git status --porcelain", { cwd: workspace, encoding: "utf8" }),
      commitCount: Number(execSync("git rev-list --count HEAD", { cwd: workspace, encoding: "utf8" }).trim()),
      message: result.message?.markdown?.includes("Committed changes with message:") ?? false
    }, {
      clean: "",
      commitCount: 2,
      message: true
    });
  });
}
export {
  defineCopilotCoverageTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHN1aXRlc1xcY29waWxvdENvdmVyYWdlU3VpdGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgZXhpc3RzU3luYywgbWtkaXJTeW5jLCBta2R0ZW1wU3luYywgcmVhZEZpbGVTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgY3JlYXRlUmVxdWlyZSB9IGZyb20gJ21vZHVsZSc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyByZXRyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDdXN0b21pemF0aW9uQ29uZmlnLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEF1dG9SZXBseUVuYWJsZWRDb25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhbmdlc2V0VXJpLmpzJztcbmltcG9ydCB7IENvcGlsb3RDbGlDb25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29waWxvdENsaUNvbmZpZy5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbUtpbmQsIHR5cGUgQ29tcGxldGlvbnNSZXN1bHQsIHR5cGUgTGlzdFNlc3Npb25zUmVzdWx0LCB0eXBlIFN1YnNjcmliZVJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBQUk9UT0NPTF9WRVJTSU9OIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vcmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBDaGF0RXJyb3JBY3Rpb24sIHR5cGUgQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24sIHR5cGUgQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWRBY3Rpb24sIHR5cGUgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb24sIHR5cGUgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYnVpbGREZWZhdWx0Q2hhdFVyaSwgTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFJPT1RfU1RBVEVfVVJJLCBUb29sQ2FsbFN0YXR1cywgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCB0eXBlIENoYW5nZXNldFN0YXRlLCB0eXBlIFNlc3Npb25TdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBUZXJtaW5hbENvbW1hbmRQYXJ0LCBUZXJtaW5hbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLXRlcm1pbmFsL3N0YXRlLmpzJztcbmltcG9ydCB7IGFzc2VydFRvb2xDYWxsQ29tcGxldGVUZXh0LCBjcmVhdGVSZWFsU2Vzc2lvbiwgZGlzcGF0Y2hUdXJuLCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24sIGdldE1hcmtkb3duUmVzcG9uc2VUZXh0LCBpbml0VGVzdEdpdFJlcG8sIHJlc29sdmVHaXRIdWJUb2tlbiwgdGVybWluYWxSZXNvdXJjZUZyb21Db250ZW50IH0gZnJvbSAnLi4vaGFybmVzcy9hZ2VudEhvc3RFMkVUZXN0SGFybmVzcy5qcyc7XG5pbXBvcnQgeyBleHBhbmRTaGVsbFRvb2xOYW1lIH0gZnJvbSAnLi4vaGFybmVzcy9zaGVsbFRvb2xOYW1lcy5qcyc7XG5pbXBvcnQgeyBmZXRjaFNlc3Npb25XaXRoQ2hhdCwgZ2V0QWN0aW9uRW52ZWxvcGUsIGlzQWN0aW9uTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vc2VydmVySW50ZWdyYXRpb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RFMkVUZXN0Q29udGV4dCB9IGZyb20gJy4vZTJlVGVzdENvbnRleHQuanMnO1xuXG5jb25zdCBub2RlUmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcblxuZnVuY3Rpb24gc3RhcnRlZFRvb2xOYW1lcyhjb250ZXh0OiBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQsIHR1cm5JZDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRyZXR1cm4gY29udGV4dC5jbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpKVxuXHRcdC5tYXAobiA9PiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24pXG5cdFx0LmZpbHRlcihhY3Rpb24gPT4gYWN0aW9uLnR1cm5JZCA9PT0gdHVybklkKVxuXHRcdC5tYXAoYWN0aW9uID0+IGFjdGlvbi50b29sTmFtZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZpbmVDb3BpbG90Q292ZXJhZ2VUZXN0cyhjb250ZXh0OiBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQpOiB2b2lkIHtcblx0aWYgKGNvbnRleHQudGllciAhPT0gJ3Bhcml0eScgfHwgY29udGV4dC5jb25maWcucHJvdmlkZXIgIT09ICdjb3BpbG90Y2xpJykge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCB7IGNvbmZpZywgY3JlYXRlZFNlc3Npb25zLCB0ZW1wRGlycyB9ID0gY29udGV4dDtcblxuXHRhc3luYyBmdW5jdGlvbiBpbml0aWFsaXplKGNsaWVudElkOiBzdHJpbmcsIHdvcmtpbmdEaXJlY3Rvcnk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnRleHQuY2xpZW50LnNldFdvcmtpbmdEaXJlY3Rvcnkod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0Y2xpZW50SWQsXG5cdFx0fSwgMzBfMDAwKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdhdXRoZW50aWNhdGUnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsXG5cdFx0XHR0b2tlbjogY29uZmlnLmdpdGh1YlRva2VuID8/IHJlc29sdmVHaXRIdWJUb2tlbigpLFxuXHRcdH0sIDMwXzAwMCk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVXb3Jrc3BhY2VsZXNzU2Vzc2lvbihwcmVmaXg6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY2xpZW50V29ya2luZ0RpcmVjdG9yeSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksIGBhaHAtJHtwcmVmaXh9LWNsaWVudC1gKSk7XG5cdFx0dGVtcERpcnMucHVzaChjbGllbnRXb3JraW5nRGlyZWN0b3J5KTtcblx0XHRhd2FpdCBpbml0aWFsaXplKGAke3ByZWZpeH0tY2xpZW50YCwgY2xpZW50V29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBjb25maWcuc2NoZW1lLCBwYXRoOiBgLyR7Z2VuZXJhdGVVdWlkKCl9YCB9KS50b1N0cmluZygpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2NyZWF0ZVNlc3Npb24nLCB7XG5cdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLFxuXHRcdFx0cHJvdmlkZXI6IGNvbmZpZy5wcm92aWRlcixcblx0XHRcdGNvbmZpZzogeyBpc29sYXRpb246ICdmb2xkZXInIH0sXG5cdFx0fSwgMzBfMDAwKTtcblx0XHRjcmVhdGVkU2Vzc2lvbnMucHVzaChzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSB9KTtcblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0cmV0dXJuIHNlc3Npb25Vcmk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVXb3Jrc3BhY2VTZXNzaW9uKHByZWZpeDogc3RyaW5nLCBiZWZvcmVDcmVhdGVTZXNzaW9uPzogKCkgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8eyBzZXNzaW9uVXJpOiBzdHJpbmc7IHdvcmtzcGFjZTogc3RyaW5nIH0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCBgYWhwLSR7cHJlZml4fS1gKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgJHtwcmVmaXh9LWNsaWVudGAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSwgYmVmb3JlQ3JlYXRlU2Vzc2lvbik7XG5cdFx0cmV0dXJuIHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH07XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBzZXRSb290Q29uZmlnKGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGNsaWVudFNlcTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdGNsaWVudFNlcSxcblx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLCBjb25maWcgfSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyByZWFkb25seSBjb25maWc/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4gfTtcblx0XHRcdHJldHVybiBPYmplY3QuZW50cmllcyhjb25maWcpLmV2ZXJ5KChba2V5LCB2YWx1ZV0pID0+IEpTT04uc3RyaW5naWZ5KGFjdGlvbi5jb25maWc/LltrZXldKSA9PT0gSlNPTi5zdHJpbmdpZnkodmFsdWUpKTtcblx0XHR9LCAzMF8wMDApO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gZHJpdmVUb29sU2VhcmNoVHVybihzZXNzaW9uVXJpOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nLCB0b29sU2VhcmNoUmVzdWx0OiBzdHJpbmcpOiBQcm9taXNlPHsgdG9vbE5hbWVzOiBzdHJpbmdbXTsgcmVzcG9uc2VUZXh0OiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHN0YXJ0cyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8b2JqZWN0PigpO1xuXHRcdGxldCBjbGllbnRTZXEgPSAxMDtcblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogY2hhdFVyaSxcblx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ1NlYXJjaCBmb3IgdGhlIGdldF9tYWdpY193b3JkIHRvb2wgYmVmb3JlIHVzaW5nIGl0LiBDYWxsIGdldF9tYWdpY193b3JkIGV4YWN0bHkgb25jZSwgdGhlbiByZXBseSB3aXRoIG9ubHkgaXRzIHJlc3VsdC4nLFxuXHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdFx0bW9kZWw6IHsgaWQ6ICdncHQtNS42LXNvbCcgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gYXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdFx0aWYgKHNlZW4uaGFzKG4gYXMgb2JqZWN0KSB8fCBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsICE9PSBjaGF0VXJpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFN0YXJ0Jylcblx0XHRcdFx0XHR8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFJlYWR5Jylcblx0XHRcdFx0XHR8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ29tcGxldGUnKVxuXHRcdFx0XHRcdHx8IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L2Vycm9yJyk7XG5cdFx0XHR9LCA5MF8wMDApO1xuXHRcdFx0c2Vlbi5hZGQobm90aWZpY2F0aW9uIGFzIG9iamVjdCk7XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obm90aWZpY2F0aW9uLCAnY2hhdC9lcnJvcicpKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuYWN0aW9uIGFzIENoYXRFcnJvckFjdGlvbjtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUb29sLXNlYXJjaCB0dXJuIGZhaWxlZDogJHthY3Rpb24uZXJyb3IuZXJyb3JUeXBlfTogJHthY3Rpb24uZXJyb3IubWVzc2FnZX1gKTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihub3RpZmljYXRpb24sICdjaGF0L3Rvb2xDYWxsU3RhcnQnKSkge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShub3RpZmljYXRpb24pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxTdGFydEFjdGlvbjtcblx0XHRcdFx0aWYgKGFjdGlvbi50dXJuSWQgPT09IHR1cm5JZCkge1xuXHRcdFx0XHRcdHN0YXJ0cy5zZXQoYWN0aW9uLnRvb2xDYWxsSWQsIGFjdGlvbi50b29sTmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obm90aWZpY2F0aW9uLCAnY2hhdC90b29sQ2FsbFJlYWR5JykpIHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobm90aWZpY2F0aW9uKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsUmVhZHlBY3Rpb247XG5cdFx0XHRcdGNvbnN0IHRvb2xOYW1lID0gc3RhcnRzLmdldChhY3Rpb24udG9vbENhbGxJZCk7XG5cdFx0XHRcdGlmICghdG9vbE5hbWUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBpc1NlYXJjaCA9IHRvb2xOYW1lID09PSAndG9vbFNlYXJjaCcgfHwgdG9vbE5hbWUgPT09ICd0b29sX3NlYXJjaF90b29sJztcblx0XHRcdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRcdGNoYW5uZWw6IGNoYXRVcmksXG5cdFx0XHRcdFx0Y2xpZW50U2VxOiBjbGllbnRTZXErKyxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBhY3Rpb24udG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBpc1NlYXJjaCA/ICdTZWFyY2hlZCB0b29scycgOiAnR290IHRoZSBtYWdpYyB3b3JkJyxcblx0XHRcdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCxcblx0XHRcdFx0XHRcdFx0XHR0ZXh0OiBpc1NlYXJjaCA/IHRvb2xTZWFyY2hSZXN1bHQgOiAnTUFHSUNfV09SRCcsXG5cdFx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0cmV0dXJuIHsgdG9vbE5hbWVzOiBbLi4uc3RhcnRzLnZhbHVlcygpXSwgcmVzcG9uc2VUZXh0OiBnZXRNYXJrZG93blJlc3BvbnNlVGV4dChjb250ZXh0LmNsaWVudCkgfTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUZvcmsoc291cmNlU2Vzc2lvblVyaTogc3RyaW5nLCBzb3VyY2VUdXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgZm9ya1VyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBjb25maWcuc2NoZW1lLCBwYXRoOiBgLyR7Z2VuZXJhdGVVdWlkKCl9YCB9KS50b1N0cmluZygpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2NyZWF0ZVNlc3Npb24nLCB7XG5cdFx0XHRjaGFubmVsOiBmb3JrVXJpLFxuXHRcdFx0cHJvdmlkZXI6IGNvbmZpZy5wcm92aWRlcixcblx0XHRcdGZvcms6IHsgc2Vzc2lvbjogc291cmNlU2Vzc2lvblVyaSwgdHVybklkOiBzb3VyY2VUdXJuSWQgfSxcblx0XHRcdGNvbmZpZzogeyBpc29sYXRpb246ICdmb2xkZXInIH0sXG5cdFx0fSwgOTBfMDAwKTtcblx0XHRjcmVhdGVkU2Vzc2lvbnMucHVzaChmb3JrVXJpKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogZm9ya1VyaSB9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnVpbGREZWZhdWx0Q2hhdFVyaShmb3JrVXJpKSB9KTtcblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0cmV0dXJuIGZvcmtVcmk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBhc3NlcnRTZXNzaW9uTGlzdGVkKHNlc3Npb25Vcmk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHJldHJ5KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxpc3RlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8TGlzdFNlc3Npb25zUmVzdWx0PignbGlzdFNlc3Npb25zJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0XHRcdGFzc2VydC5vayhsaXN0ZWQuaXRlbXMuc29tZShzZXNzaW9uID0+IHNlc3Npb24ucmVzb3VyY2UgPT09IHNlc3Npb25VcmkpKTtcblx0XHR9LCAxMDAsIDEwMCk7XG5cdH1cblxuXHQvLyBXaW5kb3dzIHJldGFpbnMgdGhlIHByb3ZpZGVyIHNjcmF0Y2ggZGlyZWN0b3J5IGFmdGVyIHNlc3Npb24gZGlzcG9zYWwuXG5cdChjb250ZXh0LmlzV2luZG93cyA/IHRlc3Quc2tpcCA6IHRlc3QpKCd3b3Jrc3BhY2VsZXNzIHNlc3Npb24gdXNlcyBhbmQgY2xlYW5zIHVwIGEgcHJvdmlkZXIgc2NyYXRjaCBkaXJlY3RvcnknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVXb3Jrc3BhY2VsZXNzU2Vzc2lvbignd29ya3NwYWNlbGVzcy1zY3JhdGNoJyk7XG5cdFx0YXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi13b3Jrc3BhY2VsZXNzLXNjcmF0Y2gnLCAnUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJywgMSk7XG5cdFx0Y29uc3Qgc3Vic2NyaWJlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0pO1xuXHRcdGNvbnN0IHN0YXRlID0gc3Vic2NyaWJlZC5zbmFwc2hvdCEuc3RhdGUgYXMgU2Vzc2lvblN0YXRlO1xuXHRcdGNvbnN0IHNjcmF0Y2hEaXJlY3RvcnkgPSBzdGF0ZS53b3JraW5nRGlyZWN0b3JpZXM/LlswXSA/IFVSSS5wYXJzZShzdGF0ZS53b3JraW5nRGlyZWN0b3JpZXNbMF0pLmZzUGF0aCA6IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQub2soc2NyYXRjaERpcmVjdG9yeSAmJiBleGlzdHNTeW5jKHNjcmF0Y2hEaXJlY3RvcnkpKTtcblxuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2Rpc3Bvc2VTZXNzaW9uJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0sIDMwXzAwMCk7XG5cdFx0Y3JlYXRlZFNlc3Npb25zLnNwbGljZShjcmVhdGVkU2Vzc2lvbnMuaW5kZXhPZihzZXNzaW9uVXJpKSwgMSk7XG5cdFx0YXdhaXQgcmV0cnkoYXN5bmMgKCkgPT4gYXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoc2NyYXRjaERpcmVjdG9yeSksIGZhbHNlKSwgNTAsIDIwKTtcblx0fSk7XG5cblx0dGVzdCgncm9vdCBhdXRvLXJlcGx5IGNvbXBsZXRlcyBwcm92aWRlciBpbnB1dCB3aXRob3V0IGEgY2xpZW50IHJlc3BvbnNlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVdvcmtzcGFjZVNlc3Npb24oJ2F1dG8tcmVwbHknKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2V0Um9vdENvbmZpZyh7IFtBZ2VudEhvc3RBdXRvUmVwbHlFbmFibGVkQ29uZmlnS2V5XTogdHJ1ZSB9LCAxMDApO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdFx0ZGlzcGF0Y2hUdXJuKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1hdXRvLXJlcGx5JywgJ0NhbGwgYXNrX3VzZXIgZXhhY3RseSBvbmNlIHRvIGFzayBcIldoaWNoIG9wdGlvbj9cIiB3aXRoIGNob2ljZXMgXCJBbHBoYVwiIGFuZCBcIkJldGFcIi4gSWYgdGhlIGFuc3dlciBzYXlzIHRoZSB1c2VyIGlzIHVuYXZhaWxhYmxlLCByZXBseSBleGFjdGx5IFwiQVVUT19SRVBMSUVEXCIuJywgMSk7XG5cdFx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJylcblx0XHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZCA9PT0gJ3R1cm4tYXV0by1yZXBseScsXG5cdFx0XHRcdDkwXzAwMCxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWFya2Rvd25SZXNwb25zZVRleHQoY29udGV4dC5jbGllbnQpLnRyaW0oKSwgJ0FVVE9fUkVQTElFRCcpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBzZXRSb290Q29uZmlnKHsgW0FnZW50SG9zdEF1dG9SZXBseUVuYWJsZWRDb25maWdLZXldOiBmYWxzZSB9LCAxMDEpO1xuXHRcdH1cblx0fSk7XG5cblx0KGNvbnRleHQucnVuS25vd25Jc3N1ZVRlc3RzID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2NvbmZpZyBzbGFzaCBjb21wbGV0aW9ucyByZWZsZWN0IHRoZSBjdXJyZW50IENvcGlsb3Qgc2Vzc2lvbiBtb2RlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVdvcmtzcGFjZVNlc3Npb24oJ2NvbmZpZy1zbGFzaC1jb21wbGV0aW9ucycpO1xuXHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tY29uZmlnLXNsYXNoLXJlYWR5JywgJ1JlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsIDEpO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IGJlZm9yZSA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8Q29tcGxldGlvbnNSZXN1bHQ+KCdjb21wbGV0aW9ucycsIHtcblx0XHRcdGNoYW5uZWw6IGNoYXRVcmksXG5cdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsXG5cdFx0XHR0ZXh0OiAnL2F1dG9waWxvdCcsXG5cdFx0XHRvZmZzZXQ6IDEwLFxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdGNsaWVudFNlcTogMTAsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IG1vZGU6ICdhdXRvcGlsb3QnIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZClcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IHNlc3Npb25VcmksXG5cdFx0XHQzMF8wMDAsXG5cdFx0KTtcblx0XHRjb25zdCBhZnRlciA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8Q29tcGxldGlvbnNSZXN1bHQ+KCdjb21wbGV0aW9ucycsIHtcblx0XHRcdGNoYW5uZWw6IGNoYXRVcmksXG5cdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsXG5cdFx0XHR0ZXh0OiAnL2F1dG9waWxvdCcsXG5cdFx0XHRvZmZzZXQ6IDEwLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmU6IGJlZm9yZS5pdGVtcy5tYXAoaXRlbSA9PiBpdGVtLmF0dGFjaG1lbnQubGFiZWwpLmZpbHRlcihsYWJlbCA9PiBsYWJlbC5zdGFydHNXaXRoKCcvYXV0b3BpbG90JykpLFxuXHRcdFx0YWZ0ZXI6IGFmdGVyLml0ZW1zLm1hcChpdGVtID0+IGl0ZW0uYXR0YWNobWVudC5sYWJlbCkuZmlsdGVyKGxhYmVsID0+IGxhYmVsLnN0YXJ0c1dpdGgoJy9hdXRvcGlsb3QnKSksXG5cdFx0fSwge1xuXHRcdFx0YmVmb3JlOiBbJy9hdXRvcGlsb3QnLCAnL2F1dG9waWxvdCBvbiddLFxuXHRcdFx0YWZ0ZXI6IFsnL2F1dG9waWxvdCcsICcvYXV0b3BpbG90IG9mZiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnb2FsIGNvbmZpZyBzbGFzaCBjb21tYW5kIHN3aXRjaGVzIHRvIHBsYW4gbW9kZSBhbmQgZm9yd2FyZHMgdGhlIHJlbWFpbmluZyBwcm9tcHQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlV29ya3NwYWNlU2Vzc2lvbignZ29hbC1jb25maWctc2xhc2gnKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLWdvYWwtY29uZmlnLXNsYXNoJywgJy9nb2FsIFJlcGx5IGV4YWN0bHkgXCJHT0FMX01PREVcIi4gRG8gbm90IHVzZSB0b29scy4nLCAxKTtcblx0XHRjb25zdCBzdWJzY3JpYmVkID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBzdWJzY3JpYmVkLnNuYXBzaG90IS5zdGF0ZSBhcyBTZXNzaW9uU3RhdGU7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1vZGU6IHN0YXRlLmNvbmZpZz8udmFsdWVzWydtb2RlJ10sXG5cdFx0XHRyZXNwb25zZTogcmVzdWx0LnJlc3BvbnNlVGV4dC50cmltKCksXG5cdFx0fSwge1xuXHRcdFx0bW9kZTogJ3BsYW4nLFxuXHRcdFx0cmVzcG9uc2U6ICdHT0FMX01PREUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyb290IHN0ZGlvIE1DUCBzZXJ2ZXIgcmVjZWl2ZXMgbm9ybWFsaXplZCBlbnZpcm9ubWVudCB2YWx1ZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDI0MF8wMDApO1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVXb3Jrc3BhY2VTZXNzaW9uKCdyb290LW1jcCcpO1xuXHRcdGNvbnN0IG1jcFNjcmlwdCA9IGpvaW4od29ya3NwYWNlLCAncm9vdC1tY3AuY2pzJyk7XG5cdFx0Y29uc3QgbWNwU2VydmVyTW9kdWxlID0gbm9kZVJlcXVpcmUucmVzb2x2ZSgnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay9zZXJ2ZXIvaW5kZXguanMnKTtcblx0XHRjb25zdCBtY3BTdGRpb01vZHVsZSA9IG5vZGVSZXF1aXJlLnJlc29sdmUoJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9zZGsvc2VydmVyL3N0ZGlvLmpzJyk7XG5cdFx0Y29uc3QgbWNwVHlwZXNNb2R1bGUgPSBub2RlUmVxdWlyZS5yZXNvbHZlKCdAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrL3R5cGVzLmpzJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhtY3BTY3JpcHQsIFtcblx0XHRcdGBjb25zdCB7IFNlcnZlciB9ID0gcmVxdWlyZSgke0pTT04uc3RyaW5naWZ5KG1jcFNlcnZlck1vZHVsZSl9KTtgLFxuXHRcdFx0YGNvbnN0IHsgU3RkaW9TZXJ2ZXJUcmFuc3BvcnQgfSA9IHJlcXVpcmUoJHtKU09OLnN0cmluZ2lmeShtY3BTdGRpb01vZHVsZSl9KTtgLFxuXHRcdFx0YGNvbnN0IHsgQ2FsbFRvb2xSZXF1ZXN0U2NoZW1hLCBMaXN0VG9vbHNSZXF1ZXN0U2NoZW1hIH0gPSByZXF1aXJlKCR7SlNPTi5zdHJpbmdpZnkobWNwVHlwZXNNb2R1bGUpfSk7YCxcblx0XHRcdGBjb25zdCBzZXJ2ZXIgPSBuZXcgU2VydmVyKHsgbmFtZTogXCJyb290LW1jcFwiLCB2ZXJzaW9uOiBcIjEuMC4wXCIgfSwgeyBjYXBhYmlsaXRpZXM6IHsgdG9vbHM6IHt9IH0gfSk7YCxcblx0XHRcdGBzZXJ2ZXIuc2V0UmVxdWVzdEhhbmRsZXIoTGlzdFRvb2xzUmVxdWVzdFNjaGVtYSwgYXN5bmMgKCkgPT4gKHsgdG9vbHM6IFt7IG5hbWU6IFwicm9vdF9wcm9iZVwiLCBkZXNjcmlwdGlvbjogXCJSZXR1cm5zIG5vcm1hbGl6ZWQgZW52aXJvbm1lbnQgdmFsdWVzXCIsIGlucHV0U2NoZW1hOiB7IHR5cGU6IFwib2JqZWN0XCIsIHByb3BlcnRpZXM6IHt9IH0gfV0gfSkpO2AsXG5cdFx0XHRgc2VydmVyLnNldFJlcXVlc3RIYW5kbGVyKENhbGxUb29sUmVxdWVzdFNjaGVtYSwgYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sgdHlwZTogXCJ0ZXh0XCIsIHRleHQ6IFxcYFJPT1RfTUNQOlxcJHtwcm9jZXNzLmVudi5ST09UX05VTUJFUn06XFwke3Byb2Nlc3MuZW52LlJPT1RfTlVMTCA/PyBcInVuc2V0XCJ9XFxgIH1dIH0pKTtgLFxuXHRcdFx0J3ZvaWQgc2VydmVyLmNvbm5lY3QobmV3IFN0ZGlvU2VydmVyVHJhbnNwb3J0KCkpOycsXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNldFJvb3RDb25maWcoe1xuXHRcdFx0XHRtY3BTZXJ2ZXJzOiB7XG5cdFx0XHRcdFx0cm9vdF9wcm9iZV9zZXJ2ZXI6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdGRpbycsXG5cdFx0XHRcdFx0XHRjb21tYW5kOiBwcm9jZXNzLmV4ZWNQYXRoLFxuXHRcdFx0XHRcdFx0YXJnczogW21jcFNjcmlwdF0sXG5cdFx0XHRcdFx0XHRlbnY6IHsgRUxFQ1RST05fUlVOX0FTX05PREU6ICcxJywgUk9PVF9OVU1CRVI6IDcsIFJPT1RfTlVMTDogbnVsbCB9LFxuXHRcdFx0XHRcdFx0Y3dkOiB0bXBkaXIoKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgMTAwKTtcblx0XHRcdGNvbnN0IHR1cm5JZCA9ICd0dXJuLXJvb3QtbWNwJztcblx0XHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgdHVybklkLCAnQ2FsbCByb290X3Byb2JlIGV4YWN0bHkgb25jZSwgdGhlbiByZXBseSB3aXRoIG9ubHkgaXRzIGV4YWN0IHJlc3VsdC4nLCAxKTtcblx0XHRcdGNvbnN0IGNvbXBsZXRpb24gPSBjb250ZXh0LmNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbENvbXBsZXRlJykpXG5cdFx0XHRcdC5tYXAobiA9PiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24pXG5cdFx0XHRcdC5maW5kKGFjdGlvbiA9PiBhY3Rpb24udHVybklkID09PSB0dXJuSWQpO1xuXHRcdFx0Y29uc3QgcmVzdWx0VGV4dCA9IGNvbXBsZXRpb24/LnJlc3VsdC5jb250ZW50XG5cdFx0XHRcdD8uZmlsdGVyKGNvbnRlbnQgPT4gY29udGVudC50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dClcblx0XHRcdFx0Lm1hcChjb250ZW50ID0+IGNvbnRlbnQudGV4dClcblx0XHRcdFx0LmpvaW4oJycpID8/ICcnO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFRleHQsICdST09UX01DUDo3OnVuc2V0Jyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHNldFJvb3RDb25maWcoeyBtY3BTZXJ2ZXJzOiB7fSB9LCAxMDEpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnbWFsZm9ybWVkIHJvb3QgTUNQIHNlcnZlciBlbnRyaWVzIGRvIG5vdCBwcmV2ZW50IGEgcHJvdmlkZXIgdHVybicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVXb3Jrc3BhY2VTZXNzaW9uKCdyb290LW1jcC1tYWxmb3JtZWQnKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2V0Um9vdENvbmZpZyh7XG5cdFx0XHRcdG1jcFNlcnZlcnM6IHtcblx0XHRcdFx0XHRtaXNzaW5nQ29tbWFuZDogeyB0eXBlOiAnc3RkaW8nLCBhcmdzOiBbXSB9LFxuXHRcdFx0XHRcdG1pc3NpbmdVcmw6IHsgdHlwZTogJ2h0dHAnIH0sXG5cdFx0XHRcdFx0dW5rbm93blR5cGU6IHsgdHlwZTogJ290aGVyJywgY29tbWFuZDogJ2lnbm9yZWQnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCAxMDApO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1yb290LW1jcC1tYWxmb3JtZWQnLCAnUmVwbHkgZXhhY3RseSBcIk1BTEZPUk1FRF9NQ1BfSUdOT1JFRFwiLicsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXNwb25zZVRleHQudHJpbSgpLCAnTUFMRk9STUVEX01DUF9JR05PUkVEJyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHNldFJvb3RDb25maWcoeyBtY3BTZXJ2ZXJzOiB7fSB9LCAxMDEpO1xuXHRcdH1cblx0fSk7XG5cblx0KGNvbnRleHQucnVuUmVjb3JkT25seVRlc3RzID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3Rvb2wgc2VhcmNoIGV4cG9zZXMgZGVmZXJyZWQgY2xpZW50IHRvb2xzIGFuZCBleGVjdXRlcyB0aGUgc2VsZWN0ZWQgcmVzdWx0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgyNDBfMDAwKTtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVdvcmtzcGFjZVNlc3Npb24oJ3Rvb2wtc2VhcmNoLXN1Y2Nlc3MnKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2V0Um9vdENvbmZpZyh7IFtDb3BpbG90Q2xpQ29uZmlnS2V5LlRvb2xTZWFyY2hFbmFibGVkXTogdHJ1ZSB9LCAxMDApO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLFxuXHRcdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRcdGNsaWVudElkOiAndG9vbC1zZWFyY2gtc3VjY2Vzcy1jbGllbnQnLFxuXHRcdFx0XHRcdFx0dG9vbHM6IFt7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICd0b29sU2VhcmNoJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTZWFyY2hlcyBkZWZlcnJlZCB0b29scyBieSBuYW1lLicsXG5cdFx0XHRcdFx0XHRcdGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IHF1ZXJ5OiB7IHR5cGU6ICdzdHJpbmcnIH0gfSB9LFxuXHRcdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0XHRuYW1lOiAnZ2V0X21hZ2ljX3dvcmQnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1JldHVybnMgdGhlIG1hZ2ljIHdvcmQuJyxcblx0XHRcdFx0XHRcdFx0aW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0KSwgMzBfMDAwKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZHJpdmVUb29sU2VhcmNoVHVybihzZXNzaW9uVXJpLCAndHVybi10b29sLXNlYXJjaC1zdWNjZXNzJywgJ1tcImdldF9tYWdpY193b3JkXCJdJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aGFzU2VhcmNoOiByZXN1bHQudG9vbE5hbWVzLnNvbWUobmFtZSA9PiBuYW1lID09PSAndG9vbFNlYXJjaCcgfHwgbmFtZSA9PT0gJ3Rvb2xfc2VhcmNoX3Rvb2wnKSxcblx0XHRcdFx0aGFzTWFnaWNXb3JkOiByZXN1bHQudG9vbE5hbWVzLmluY2x1ZGVzKCdnZXRfbWFnaWNfd29yZCcpLFxuXHRcdFx0XHRyZXNwb25zZTogcmVzdWx0LnJlc3BvbnNlVGV4dC50cmltKCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGhhc1NlYXJjaDogdHJ1ZSxcblx0XHRcdFx0aGFzTWFnaWNXb3JkOiB0cnVlLFxuXHRcdFx0XHRyZXNwb25zZTogJ01BR0lDX1dPUkQnLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHNldFJvb3RDb25maWcoeyBbQ29waWxvdENsaUNvbmZpZ0tleS5Ub29sU2VhcmNoRW5hYmxlZF06IGZhbHNlIH0sIDEwMSk7XG5cdFx0fVxuXHR9KTtcblxuXHQoY29udGV4dC5ydW5SZWNvcmRPbmx5VGVzdHMgPyB0ZXN0IDogdGVzdC5za2lwKSgndG9vbCBzZWFyY2ggdG9sZXJhdGVzIGEgbWFsZm9ybWVkIGNsaWVudCByZXN1bHQgd2l0aG91dCBhY3RpdmF0aW5nIGEgZGVmZXJyZWQgdG9vbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMjQwXzAwMCk7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVXb3Jrc3BhY2VTZXNzaW9uKCd0b29sLXNlYXJjaC1tYWxmb3JtZWQnKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2V0Um9vdENvbmZpZyh7IFtDb3BpbG90Q2xpQ29uZmlnS2V5LlRvb2xTZWFyY2hFbmFibGVkXTogdHJ1ZSB9LCAxMDApO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLFxuXHRcdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRcdGNsaWVudElkOiAndG9vbC1zZWFyY2gtbWFsZm9ybWVkLWNsaWVudCcsXG5cdFx0XHRcdFx0XHR0b29sczogW3tcblx0XHRcdFx0XHRcdFx0bmFtZTogJ3Rvb2xTZWFyY2gnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1NlYXJjaGVzIGRlZmVycmVkIHRvb2xzIGJ5IG5hbWUuJyxcblx0XHRcdFx0XHRcdFx0aW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHsgcXVlcnk6IHsgdHlwZTogJ3N0cmluZycgfSB9IH0sXG5cdFx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdnZXRfbWFnaWNfd29yZCcsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmV0dXJucyB0aGUgbWFnaWMgd29yZC4nLFxuXHRcdFx0XHRcdFx0XHRpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQpLCAzMF8wMDApO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVRvb2xTZWFyY2hUdXJuKHNlc3Npb25VcmksICd0dXJuLXRvb2wtc2VhcmNoLW1hbGZvcm1lZCcsICdub3QtanNvbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGhhc1NlYXJjaDogcmVzdWx0LnRvb2xOYW1lcy5zb21lKG5hbWUgPT4gbmFtZSA9PT0gJ3Rvb2xTZWFyY2gnIHx8IG5hbWUgPT09ICd0b29sX3NlYXJjaF90b29sJyksXG5cdFx0XHRcdGhhc01hZ2ljV29yZDogcmVzdWx0LnRvb2xOYW1lcy5pbmNsdWRlcygnZ2V0X21hZ2ljX3dvcmQnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aGFzU2VhcmNoOiB0cnVlLFxuXHRcdFx0XHRoYXNNYWdpY1dvcmQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHNldFJvb3RDb25maWcoeyBbQ29waWxvdENsaUNvbmZpZ0tleS5Ub29sU2VhcmNoRW5hYmxlZF06IGZhbHNlIH0sIDEwMSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uIGZvcmsgaW5oZXJpdHMgcHJvdmlkZXIgaGlzdG9yeSB0aHJvdWdoIHRoZSBzZWxlY3RlZCBzb3VyY2UgdHVybicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMjQwXzAwMCk7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVdvcmtzcGFjZVNlc3Npb24oJ3Nlc3Npb24tZm9yay1oaXN0b3J5Jyk7XG5cdFx0YXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1mb3JrLWFscGhhJywgJ1JlbWVtYmVyIEZPUktfQUxQSEEuIFJlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsIDEpO1xuXHRcdGF3YWl0IGFzc2VydFNlc3Npb25MaXN0ZWQoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgZm9ya1VyaSA9IGF3YWl0IGNyZWF0ZUZvcmsoc2Vzc2lvblVyaSwgJ3R1cm4tZm9yay1hbHBoYScpO1xuXG5cdFx0YXdhaXQgY29udGV4dC5yZXN0YXJ0U2VydmVyKCk7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZSgnc2Vzc2lvbi1mb3JrLWhpc3RvcnktcmVzdG9yZWQtY2xpZW50Jywgd29ya3NwYWNlKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogZm9ya1VyaSB9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogYnVpbGREZWZhdWx0Q2hhdFVyaShmb3JrVXJpKSB9KTtcblx0XHRjb25zdCByZXN0b3JlZCA9IGF3YWl0IGZldGNoU2Vzc2lvbldpdGhDaGF0KGNvbnRleHQuY2xpZW50LCBmb3JrVXJpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3RvcmVkLnR1cm5zLm1hcCh0dXJuID0+IHR1cm4ubWVzc2FnZS50ZXh0KSwgWydSZW1lbWJlciBGT1JLX0FMUEhBLiBSZXBseSBleGFjdGx5IFwicmVhZHlcIi4nXSk7XG5cblx0XHRjb25zdCByZWZvcmtVcmkgPSBhd2FpdCBjcmVhdGVGb3JrKGZvcmtVcmksIHJlc3RvcmVkLnR1cm5zWzBdLmlkKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHJlZm9ya1VyaSwgJ3R1cm4tZm9yay1mb2xsb3d1cCcsICdSZXBseSB3aXRoIG9ubHkgdGhlIGNvZGUgd29yZCB5b3Ugd2VyZSBhc2tlZCB0byByZW1lbWJlci4nLCAxMCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5yZXNwb25zZVRleHQuaW5jbHVkZXMoJ0ZPUktfQUxQSEEnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gZm9yayBleGNsdWRlcyBwcm92aWRlciBoaXN0b3J5IGFmdGVyIHRoZSBzZWxlY3RlZCBzb3VyY2UgdHVybicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMjQwXzAwMCk7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVXb3Jrc3BhY2VTZXNzaW9uKCdzZXNzaW9uLWZvcmstYm91bmRlZCcpO1xuXHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tZm9yay1maXJzdCcsICdSZW1lbWJlciBGT1JLX0ZJUlNULiBSZXBseSBleGFjdGx5IFwicmVhZHlcIi4nLCAxKTtcblx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLWZvcmstbGF0ZXInLCAnTm93IHJlbWVtYmVyIEZPUktfTEFURVIgdG9vLiBSZXBseSBleGFjdGx5IFwicmVhZHlcIi4nLCAxMCk7XG5cdFx0YXdhaXQgYXNzZXJ0U2Vzc2lvbkxpc3RlZChzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBmb3JrVXJpID0gYXdhaXQgY3JlYXRlRm9yayhzZXNzaW9uVXJpLCAndHVybi1mb3JrLWZpcnN0Jyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIGZvcmtVcmksICd0dXJuLWZvcmstYm91bmRlZC1mb2xsb3d1cCcsICdSZXBseSBleGFjdGx5IFwiYm91bmRlZFwiIGlmIHlvdSByZW1lbWJlciBGT1JLX0ZJUlNUIGJ1dCBub3QgRk9SS19MQVRFUi4nLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXNwb25zZVRleHQudHJpbSgpLCAnYm91bmRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd2aWV3IHJhbmdlIHJldHVybnMgb25seSB0aGUgcmVxdWVzdGVkIHdvcmtzcGFjZSBsaW5lcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVdvcmtzcGFjZVNlc3Npb24oJ3ZpZXctcmFuZ2UnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAncmFuZ2UudHh0JyksICdSQU5HRV9PTkVcXG5SQU5HRV9UV09cXG5SQU5HRV9USFJFRVxcblJBTkdFX0ZPVVJcXG5SQU5HRV9GSVZFXFxuJyk7XG5cdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tdmlldy1yYW5nZSc7XG5cdFx0YXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCB0dXJuSWQsICdVc2UgdmlldyBleGFjdGx5IG9uY2Ugd2l0aCB2aWV3X3JhbmdlIFsyLCA0XSB0byByZWFkIHJhbmdlLnR4dC4gRG8gbm90IHJ1biBhIHNoZWxsIGNvbW1hbmQuIFRoZW4gcmVwbHkgZXhhY3RseSBcImRvbmVcIi4nLCAxKTtcblx0XHRjb25zdCB2aWV3U3RhcnQgPSBjb250ZXh0LmNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbFN0YXJ0JykpXG5cdFx0XHQubWFwKG4gPT4gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFN0YXJ0QWN0aW9uKVxuXHRcdFx0LmZpbmQoYWN0aW9uID0+IGFjdGlvbi50dXJuSWQgPT09IHR1cm5JZCAmJiBhY3Rpb24udG9vbE5hbWUgPT09ICd2aWV3Jyk7XG5cdFx0Y29uc3Qgdmlld0NvbXBsZXRpb24gPSB2aWV3U3RhcnQgJiYgY29udGV4dC5jbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxDb21wbGV0ZScpKVxuXHRcdFx0Lm1hcChuID0+IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxDb21wbGV0ZUFjdGlvbilcblx0XHRcdC5maW5kKGFjdGlvbiA9PiBhY3Rpb24udG9vbENhbGxJZCA9PT0gdmlld1N0YXJ0LnRvb2xDYWxsSWQpO1xuXHRcdGNvbnN0IHJlc3VsdFRleHQgPSB2aWV3Q29tcGxldGlvbj8ucmVzdWx0LmNvbnRlbnRcblx0XHRcdD8uZmlsdGVyKGNvbnRlbnQgPT4gY29udGVudC50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dClcblx0XHRcdC5tYXAoY29udGVudCA9PiBjb250ZW50LnRleHQpXG5cdFx0XHQuam9pbignJykgPz8gJyc7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc0ZpcnN0OiByZXN1bHRUZXh0LmluY2x1ZGVzKCdSQU5HRV9PTkUnKSxcblx0XHRcdGhhc1NlY29uZDogcmVzdWx0VGV4dC5pbmNsdWRlcygnUkFOR0VfVFdPJyksXG5cdFx0XHRoYXNGb3VydGg6IHJlc3VsdFRleHQuaW5jbHVkZXMoJ1JBTkdFX0ZPVVInKSxcblx0XHRcdGhhc0ZpZnRoOiByZXN1bHRUZXh0LmluY2x1ZGVzKCdSQU5HRV9GSVZFJyksXG5cdFx0fSwge1xuXHRcdFx0aGFzRmlyc3Q6IGZhbHNlLFxuXHRcdFx0aGFzU2Vjb25kOiB0cnVlLFxuXHRcdFx0aGFzRm91cnRoOiB0cnVlLFxuXHRcdFx0aGFzRmlmdGg6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdncmVwIHNlYXJjaGVzIHdvcmtzcGFjZSBjb250ZW50IHRocm91Z2ggdGhlIHByb3ZpZGVyIHRvb2wnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVXb3Jrc3BhY2VTZXNzaW9uKCdncmVwLXRvb2wnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAnbmVlZGxlLnR4dCcpLCAnQ09QSUxPVF9FMkVfTkVFRExFXFxuJyk7XG5cdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tZ3JlcC10b29sJztcblx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksIHR1cm5JZCwgJ1VzZSBncmVwIGV4YWN0bHkgb25jZSB0byBmaW5kIENPUElMT1RfRTJFX05FRURMRSBpbiB0aGUgd29ya3NwYWNlLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJmb3VuZFwiLicsIDEpO1xuXG5cdFx0YXNzZXJ0VG9vbENhbGxDb21wbGV0ZVRleHQoY29udGV4dC5jbGllbnQsIHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHR0b29sTmFtZXM6IFsnZ3JlcCddLFxuXHRcdFx0d29ya3NwYWNlLFxuXHRcdFx0ZXhwZWN0ZWQ6IFsvbmVlZGxlXFwudHh0L10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dsb2IgZmluZHMgYSBuZXN0ZWQgd29ya3NwYWNlIGZpbGUgdGhyb3VnaCB0aGUgcHJvdmlkZXIgdG9vbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVdvcmtzcGFjZVNlc3Npb24oJ2dsb2ItdG9vbCcpO1xuXHRcdG1rZGlyU3luYyhqb2luKHdvcmtzcGFjZSwgJ25lc3RlZCcpKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAnbmVzdGVkJywgJ2dsb2ItdGFyZ2V0LnVuaXF1ZScpLCAndGFyZ2V0XFxuJyk7XG5cdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tZ2xvYi10b29sJztcblx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksIHR1cm5JZCwgJ1VzZSBnbG9iIGV4YWN0bHkgb25jZSB0byBmaW5kIGZpbGVzIG1hdGNoaW5nICoqLyoudW5pcXVlLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJmb3VuZFwiLicsIDEpO1xuXG5cdFx0YXNzZXJ0VG9vbENhbGxDb21wbGV0ZVRleHQoY29udGV4dC5jbGllbnQsIHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHR0b29sTmFtZXM6IFsnZ2xvYiddLFxuXHRcdFx0d29ya3NwYWNlLFxuXHRcdFx0ZXhwZWN0ZWQ6IFsvbmVzdGVkXFwvZ2xvYi10YXJnZXRcXC51bmlxdWUvXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hlbGwgZmFpbHVyZSBwcmVzZXJ2ZXMgdGhlIHJlYWwgbm9uemVybyBleGl0IGNvZGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlV29ya3NwYWNlU2Vzc2lvbignc2hlbGwtZXhpdC1jb2RlJyk7XG5cdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tc2hlbGwtZXhpdC1jb2RlJztcblx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksIHR1cm5JZCwgJ1J1biBleGFjdGx5IGBub2RlIC1lIFwicHJvY2Vzcy5leGl0KDcpXCJgIHdpdGggYmFzaCwgdGhlbiByZXBseSBleGFjdGx5IFwiZmFpbGVkIGFzIGV4cGVjdGVkXCIuJywgMSk7XG5cdFx0Y29uc3Qgc2hlbGxTdGFydCA9IGNvbnRleHQuY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsU3RhcnQnKSlcblx0XHRcdC5tYXAobiA9PiBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgQ2hhdFRvb2xDYWxsU3RhcnRBY3Rpb24pXG5cdFx0XHQuZmluZChhY3Rpb24gPT4gYWN0aW9uLnR1cm5JZCA9PT0gdHVybklkICYmIGFjdGlvbi50b29sTmFtZSA9PT0gZXhwYW5kU2hlbGxUb29sTmFtZSgnJHtzaGVsbH0nKSk7XG5cdFx0Y29uc3Qgc2hlbGxDb21wbGV0aW9uID0gc2hlbGxTdGFydCAmJiBjb250ZXh0LmNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbENvbXBsZXRlJykpXG5cdFx0XHQubWFwKG4gPT4gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbENvbXBsZXRlQWN0aW9uKVxuXHRcdFx0LmZpbmQoYWN0aW9uID0+IGFjdGlvbi50b29sQ2FsbElkID09PSBzaGVsbFN0YXJ0LnRvb2xDYWxsSWQpO1xuXHRcdGNvbnN0IHRlcm1pbmFsUmVzdWx0ID0gc2hlbGxDb21wbGV0aW9uPy5yZXN1bHQuY29udGVudD8uZmluZChjb250ZW50ID0+IGNvbnRlbnQudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsKT8ucmVzdWx0O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdWNjZXNzOiBzaGVsbENvbXBsZXRpb24/LnJlc3VsdC5zdWNjZXNzLFxuXHRcdFx0ZXhpdENvZGU6IHRlcm1pbmFsUmVzdWx0Py5leGl0Q29kZSxcblx0XHR9LCB7XG5cdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0ZXhpdENvZGU6IDcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdChjb250ZXh0LnJ1blJlY29yZE9ubHlUZXN0cyA/IHRlc3QgOiB0ZXN0LnNraXApKCdtYW5hZ2VkIHNoZWxsIGNhbiBiZSByZWFkIGFuZCBzdG9wcGVkIGFmdGVyIGFzeW5jaHJvbm91cyBleGVjdXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDI0MF8wMDApO1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlV29ya3NwYWNlU2Vzc2lvbignbWFuYWdlZC1zaGVsbC1yZWFkLXN0b3AnKTtcblx0XHRjb25zdCB0dXJuSWQgPSAndHVybi1tYW5hZ2VkLXNoZWxsLXJlYWQtc3RvcCc7XG5cdFx0YXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCB0dXJuSWQsICdTdGFydCBgZWNobyBNQU5BR0VEX1NIRUxMX1ZBTFVFYCBhc3luY2hyb25vdXNseSB3aXRoIGJhc2gsIHJlYWQgdGhhdCBzaGVsbCB3aXRoIHJlYWRfYmFzaCwgc3RvcCBpdCB3aXRoIHN0b3BfYmFzaCwgdGhlbiByZXBseSBleGFjdGx5IFwiZG9uZVwiLicsIDEpO1xuXHRcdGNvbnN0IHRvb2xOYW1lcyA9IHN0YXJ0ZWRUb29sTmFtZXMoY29udGV4dCwgdHVybklkKTtcblxuXHRcdGFzc2VydC5vayh0b29sTmFtZXMuaW5jbHVkZXMoJ2Jhc2gnKSAmJiB0b29sTmFtZXMuaW5jbHVkZXMoJ3JlYWRfYmFzaCcpICYmIHRvb2xOYW1lcy5pbmNsdWRlcygnc3RvcF9iYXNoJykpO1xuXHR9KTtcblxuXHQoY29udGV4dC5ydW5SZWNvcmRPbmx5VGVzdHMgPyB0ZXN0IDogdGVzdC5za2lwKSgnbWFuYWdlZCBzaGVsbCBzZXNzaW9ucyBjYW4gYmUgbGlzdGVkIGFmdGVyIGFzeW5jaHJvbm91cyBleGVjdXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDI0MF8wMDApO1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlV29ya3NwYWNlU2Vzc2lvbignbWFuYWdlZC1zaGVsbC1saXN0Jyk7XG5cdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tbWFuYWdlZC1zaGVsbC1saXN0Jztcblx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksIHR1cm5JZCwgJ1N0YXJ0IGBlY2hvIExJU1RFRF9TSEVMTF9WQUxVRWAgYXN5bmNocm9ub3VzbHkgd2l0aCBiYXNoLCBjYWxsIGxpc3RfYmFzaCwgc3RvcCB0aGUgc2hlbGwgd2l0aCBzdG9wX2Jhc2gsIHRoZW4gcmVwbHkgZXhhY3RseSBcImRvbmVcIi4nLCAxKTtcblx0XHRjb25zdCB0b29sTmFtZXMgPSBzdGFydGVkVG9vbE5hbWVzKGNvbnRleHQsIHR1cm5JZCk7XG5cblx0XHRhc3NlcnQub2sodG9vbE5hbWVzLmluY2x1ZGVzKCdiYXNoJykgJiYgdG9vbE5hbWVzLmluY2x1ZGVzKCdsaXN0X2Jhc2gnKSAmJiB0b29sTmFtZXMuaW5jbHVkZXMoJ3N0b3BfYmFzaCcpKTtcblx0fSk7XG5cblx0KGNvbnRleHQucnVuUmVjb3JkT25seVRlc3RzID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2N1c3RvbSB0ZXJtaW5hbCB0b29sIG1hbmFnZXMgYW4gYXN5bmNocm9ub3VzIHNoZWxsIGxpZmVjeWNsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMjQwXzAwMCk7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVXb3Jrc3BhY2VTZXNzaW9uKCdjdXN0b20tdGVybWluYWwtbGlmZWN5Y2xlJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNldFJvb3RDb25maWcoeyBbQ29waWxvdENsaUNvbmZpZ0tleS5FbmFibGVDdXN0b21UZXJtaW5hbFRvb2xdOiB0cnVlIH0sIDEwMCk7XG5cdFx0XHRjb25zdCB0dXJuSWQgPSAndHVybi1jdXN0b20tdGVybWluYWwtbGlmZWN5Y2xlJztcblx0XHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgdHVybklkLCAnU3RhcnQgYGVjaG8gQ1VTVE9NX1RFUk1JTkFMX1ZBTFVFYCBhc3luY2hyb25vdXNseSB3aXRoIGJhc2gsIHJlYWQgaXQgd2l0aCByZWFkX2Jhc2gsIGxpc3Qgc2hlbGxzIHdpdGggbGlzdF9iYXNoLCBzdG9wIGl0IHdpdGggc3RvcF9iYXNoLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJkb25lXCIuJywgMSk7XG5cdFx0XHRjb25zdCB0b29sTmFtZXMgPSBzdGFydGVkVG9vbE5hbWVzKGNvbnRleHQsIHR1cm5JZCk7XG5cdFx0XHRhc3NlcnQub2sodG9vbE5hbWVzLmluY2x1ZGVzKCdiYXNoJykgJiYgdG9vbE5hbWVzLmluY2x1ZGVzKCdyZWFkX2Jhc2gnKSAmJiB0b29sTmFtZXMuaW5jbHVkZXMoJ2xpc3RfYmFzaCcpICYmIHRvb2xOYW1lcy5pbmNsdWRlcygnc3RvcF9iYXNoJykpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBzZXRSb290Q29uZmlnKHsgW0NvcGlsb3RDbGlDb25maWdLZXkuRW5hYmxlQ3VzdG9tVGVybWluYWxUb29sXTogZmFsc2UgfSwgMTAxKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFdpbmRvd3MgcHVibGlzaGVzIHRoZSB0ZXJtaW5hbCBidXQgb21pdHMgdGhlIGNvbXBsZXRlZCBjb21tYW5kIG1ldGFkYXRhLlxuXHQoY29udGV4dC5pc1dpbmRvd3MgPyB0ZXN0LnNraXAgOiB0ZXN0KSgnY3VzdG9tIHRlcm1pbmFsIHRvb2wgcHJlc2VydmVzIGEgbm9uemVybyBzaGVsbCBleGl0IGNvZGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE4MF8wMDApO1xuXHRcdGNvbnN0IGRldGVybWluaXN0aWNTaGVsbENvbmZpZyA9IGNvbnRleHQuaXNXaW5kb3dzID8ge30gOiB7IFtBZ2VudEhvc3RDb25maWdLZXkuRGVmYXVsdFNoZWxsXTogJy9iaW4vYmFzaCcgfTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVXb3Jrc3BhY2VTZXNzaW9uKCdjdXN0b20tdGVybWluYWwtZXhpdC1jb2RlJywgKCkgPT4gc2V0Um9vdENvbmZpZyh7XG5cdFx0XHRcdFtDb3BpbG90Q2xpQ29uZmlnS2V5LkVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbF06IHRydWUsXG5cdFx0XHRcdC4uLmRldGVybWluaXN0aWNTaGVsbENvbmZpZyxcblx0XHRcdH0sIDEwMCkpO1xuXHRcdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tY3VzdG9tLXRlcm1pbmFsLWV4aXQtY29kZSc7XG5cdFx0XHRhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksIHR1cm5JZCwgJ1J1biBleGFjdGx5IGBub2RlIC1lIFwicHJvY2Vzcy5leGl0KDkpXCJgIHdpdGggYmFzaCwgdGhlbiByZXBseSBleGFjdGx5IFwiZmFpbGVkIGFzIGV4cGVjdGVkXCIuJywgMSk7XG5cdFx0XHRjb25zdCBzaGVsbFN0YXJ0ID0gY29udGV4dC5jbGllbnQucmVjZWl2ZWROb3RpZmljYXRpb25zKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpKVxuXHRcdFx0XHQubWFwKG4gPT4gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFN0YXJ0QWN0aW9uKVxuXHRcdFx0XHQuZmluZChhY3Rpb24gPT4gYWN0aW9uLnR1cm5JZCA9PT0gdHVybklkICYmIGFjdGlvbi50b29sTmFtZSA9PT0gZXhwYW5kU2hlbGxUb29sTmFtZSgnJHtzaGVsbH0nKSk7XG5cdFx0XHRjb25zdCBzaGVsbENvbXBsZXRpb24gPSBzaGVsbFN0YXJ0ICYmIGNvbnRleHQuY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsQ29tcGxldGUnKSlcblx0XHRcdFx0Lm1hcChuID0+IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxDb21wbGV0ZUFjdGlvbilcblx0XHRcdFx0LmZpbmQoYWN0aW9uID0+IGFjdGlvbi50b29sQ2FsbElkID09PSBzaGVsbFN0YXJ0LnRvb2xDYWxsSWQpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxVcmkgPSBzaGVsbENvbXBsZXRpb24/LnJlc3VsdC5jb250ZW50Py5maW5kKGNvbnRlbnQgPT4gY29udGVudC50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwpPy5yZXNvdXJjZVxuXHRcdFx0XHQ/PyAoc2hlbGxTdGFydCAmJiBjb250ZXh0LmNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbENvbnRlbnRDaGFuZ2VkJykpXG5cdFx0XHRcdFx0Lm1hcChuID0+IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBDaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZEFjdGlvbilcblx0XHRcdFx0XHQuZmlsdGVyKGFjdGlvbiA9PiBhY3Rpb24udG9vbENhbGxJZCA9PT0gc2hlbGxTdGFydC50b29sQ2FsbElkKVxuXHRcdFx0XHRcdC5tYXAoYWN0aW9uID0+IHRlcm1pbmFsUmVzb3VyY2VGcm9tQ29udGVudChhY3Rpb24uY29udGVudCkpXG5cdFx0XHRcdFx0LmZpbmQocmVzb3VyY2UgPT4gcmVzb3VyY2UgIT09IHVuZGVmaW5lZCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRlcm1pbmFsVXJpKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHRlcm1pbmFsVXJpIH0pO1xuXHRcdFx0Y29uc3QgdGVybWluYWxTdGF0ZSA9IHRlcm1pbmFsLnNuYXBzaG90IS5zdGF0ZSBhcyBUZXJtaW5hbFN0YXRlO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IHRlcm1pbmFsU3RhdGUuY29udGVudC5maW5kKChwYXJ0KTogcGFydCBpcyBUZXJtaW5hbENvbW1hbmRQYXJ0ID0+IHBhcnQudHlwZSA9PT0gJ2NvbW1hbmQnICYmIHBhcnQuY29tbWFuZExpbmUuaW5jbHVkZXMoJ3Byb2Nlc3MuZXhpdCg5KScpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdXBwb3J0c0NvbW1hbmREZXRlY3Rpb246IHRlcm1pbmFsU3RhdGUuc3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uLFxuXHRcdFx0XHRpc0NvbXBsZXRlOiBjb21tYW5kPy5pc0NvbXBsZXRlLFxuXHRcdFx0XHRleGl0Q29kZTogY29tbWFuZD8uZXhpdENvZGUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN1cHBvcnRzQ29tbWFuZERldGVjdGlvbjogdHJ1ZSxcblx0XHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0ZXhpdENvZGU6IDksXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgc2V0Um9vdENvbmZpZyh7XG5cdFx0XHRcdFtDb3BpbG90Q2xpQ29uZmlnS2V5LkVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbF06IGZhbHNlLFxuXHRcdFx0XHQuLi4oY29udGV4dC5pc1dpbmRvd3MgPyB7fSA6IHsgW0FnZW50SG9zdENvbmZpZ0tleS5EZWZhdWx0U2hlbGxdOiAnJyB9KSxcblx0XHRcdH0sIDEwMSk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBXaW5kb3dzIGxvc2VzIHRoZSBwZXJzaXN0ZWQgcHJvdmlkZXIgc2Vzc2lvbiBkdXJpbmcgcmVzdGFydCwgc28gdGhlIGhvc3QgY2Fubm90IHJlY29uc3RydWN0IGl0cyB0b29sIGhpc3RvcnkuXG5cdCghY29udGV4dC5pc1dpbmRvd3MgfHwgY29udGV4dC5ydW5Lbm93bklzc3VlVGVzdHMgPyB0ZXN0IDogdGVzdC5za2lwKSgndG9vbC1yaWNoIHByb3ZpZGVyIGhpc3RvcnkgaXMgcmVjb25zdHJ1Y3RlZCBhZnRlciBhIGhvc3QgcmVzdGFydCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMjQwXzAwMCk7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVdvcmtzcGFjZVNlc3Npb24oJ3Rvb2wtaGlzdG9yeS1yZXN0YXJ0Jyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ2hpc3RvcnkudHh0JyksICdiZWZvcmVcXG4nKTtcblx0XHRjb25zdCB0dXJuSWQgPSAndHVybi10b29sLWhpc3RvcnktcmVzdGFydCc7XG5cdFx0YXdhaXQgZHJpdmVUdXJuVG9Db21wbGV0aW9uKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCB0dXJuSWQsICdVc2UgZWRpdCBleGFjdGx5IG9uY2UgdG8gcmVwbGFjZSBiZWZvcmUgd2l0aCBhZnRlciBpbiBoaXN0b3J5LnR4dC4gRG8gbm90IHJ1biBhIHNoZWxsIGNvbW1hbmQuIFRoZW4gcmVwbHkgZXhhY3RseSBcImhpc3RvcnktcmVhZHlcIi4nLCAxKTtcblx0XHRjb25zdCBiZWZvcmUgPSBhd2FpdCBmZXRjaFNlc3Npb25XaXRoQ2hhdChjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSk7XG5cblx0XHRhd2FpdCBjb250ZXh0LnJlc3RhcnRTZXJ2ZXIoKTtcblx0XHRhd2FpdCBpbml0aWFsaXplKCd0b29sLWhpc3RvcnktcmVzdGFydC1jbGllbnQnLCB3b3Jrc3BhY2UpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0pO1xuXHRcdGNvbnN0IHJlc3RvcmVkID0gYXdhaXQgZmV0Y2hTZXNzaW9uV2l0aENoYXQoY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmkpO1xuXG5cdFx0Y29uc3QgYmVmb3JlVG9vbENhbGxzID0gYmVmb3JlLnR1cm5zLmZsYXRNYXAodHVybiA9PiB0dXJuLnJlc3BvbnNlUGFydHMpLmZpbHRlcihwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkubGVuZ3RoO1xuXHRcdGFzc2VydC5vayhiZWZvcmVUb29sQ2FsbHMgPiAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3RvcmVkVG9vbENhbGxzOiByZXN0b3JlZC50dXJucy5mbGF0TWFwKHR1cm4gPT4gdHVybi5yZXNwb25zZVBhcnRzKS5maWx0ZXIocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpLmxlbmd0aCxcblx0XHRcdGNvbnRlbnQ6IHJlYWRGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ2hpc3RvcnkudHh0JyksICd1dGY4JyksXG5cdFx0fSwge1xuXHRcdFx0cmVzdG9yZWRUb29sQ2FsbHM6IGJlZm9yZVRvb2xDYWxscyxcblx0XHRcdGNvbnRlbnQ6ICdhZnRlclxcbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdChjb250ZXh0LnJ1bktub3duSXNzdWVUZXN0cyA/IHRlc3QgOiB0ZXN0LnNraXApKCdzaGVsbCBmYWlsdXJlIG1ldGFkYXRhIGlzIHJlY29uc3RydWN0ZWQgYWZ0ZXIgYSBob3N0IHJlc3RhcnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDI0MF8wMDApO1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVXb3Jrc3BhY2VTZXNzaW9uKCdzaGVsbC1oaXN0b3J5LXJlc3RhcnQnKTtcblx0XHRjb25zdCB0dXJuSWQgPSAndHVybi1zaGVsbC1oaXN0b3J5LXJlc3RhcnQnO1xuXHRcdGF3YWl0IGRyaXZlVHVyblRvQ29tcGxldGlvbihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgdHVybklkLCAnUnVuIGV4YWN0bHkgYG5vZGUgLWUgXCJwcm9jZXNzLmV4aXQoNSlcImAgd2l0aCBiYXNoLCB0aGVuIHJlcGx5IGV4YWN0bHkgXCJmYWlsZWQgYXMgZXhwZWN0ZWRcIi4nLCAxKTtcblx0XHRjb25zdCBiZWZvcmUgPSBhd2FpdCBmZXRjaFNlc3Npb25XaXRoQ2hhdChjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgYmVmb3JlVG9vbENhbGwgPSBiZWZvcmUudHVybnMuZmluZCh0dXJuID0+IHR1cm4uaWQgPT09IHR1cm5JZCk/LnJlc3BvbnNlUGFydHNcblx0XHRcdC5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRhc3NlcnQub2soYmVmb3JlVG9vbENhbGw/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXG5cdFx0YXdhaXQgY29udGV4dC5yZXN0YXJ0U2VydmVyKCk7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZSgnc2hlbGwtaGlzdG9yeS1yZXN0YXJ0LWNsaWVudCcsIHdvcmtzcGFjZSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0Y29uc3QgcmVzdG9yZWQgPSBhd2FpdCBmZXRjaFNlc3Npb25XaXRoQ2hhdChjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgcmVzdG9yZWRUb29sQ2FsbCA9IHJlc3RvcmVkLnR1cm5zLmZpbmQodHVybiA9PiB0dXJuLmlkID09PSB0dXJuSWQpPy5yZXNwb25zZVBhcnRzXG5cdFx0XHQuZmluZChwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0Y29uc3QgYmVmb3JlU3VjY2VzcyA9IGJlZm9yZVRvb2xDYWxsLnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkID8gYmVmb3JlVG9vbENhbGwudG9vbENhbGwuc3VjY2VzcyA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZXN0b3JlZFN1Y2Nlc3MgPSByZXN0b3JlZFRvb2xDYWxsPy5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJlc3RvcmVkVG9vbENhbGwudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyByZXN0b3JlZFRvb2xDYWxsLnRvb2xDYWxsLnN1Y2Nlc3MgOiB1bmRlZmluZWQ7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRvb2xOYW1lOiByZXN0b3JlZFRvb2xDYWxsPy5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8gcmVzdG9yZWRUb29sQ2FsbC50b29sQ2FsbC50b29sTmFtZSA6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXR1czogcmVzdG9yZWRUb29sQ2FsbD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHJlc3RvcmVkVG9vbENhbGwudG9vbENhbGwuc3RhdHVzIDogdW5kZWZpbmVkLFxuXHRcdFx0c3VjY2VzczogcmVzdG9yZWRTdWNjZXNzLFxuXHRcdH0sIHtcblx0XHRcdHRvb2xOYW1lOiBiZWZvcmVUb29sQ2FsbC50b29sQ2FsbC50b29sTmFtZSxcblx0XHRcdHN0YXR1czogYmVmb3JlVG9vbENhbGwudG9vbENhbGwuc3RhdHVzLFxuXHRcdFx0c3VjY2VzczogYmVmb3JlU3VjY2Vzcyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29tbWl0IGNoYW5nZXNldCBvcGVyYXRpb24gZ2VuZXJhdGVzIGEgbWVzc2FnZSBhbmQgY29tbWl0cyBtaXhlZCBjaGFuZ2VzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgyNDBfMDAwKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWhwLWNoYW5nZXNldC1jb21taXQtJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRpbml0VGVzdEdpdFJlcG8od29ya3NwYWNlKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAnZWRpdGVkLnR4dCcpLCAnYmVmb3JlXFxuJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ2RlbGV0ZWQudHh0JyksICdkZWxldGUgbWVcXG4nKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4od29ya3NwYWNlLCAncmVuYW1lZC1iZWZvcmUudHh0JyksICdyZW5hbWUgbWVcXG4nKTtcblx0XHRleGVjU3luYygnZ2l0IGFkZCAuICYmIGdpdCBjb21taXQgLXEgLW0gXCJzZWVkXCInLCB7IGN3ZDogd29ya3NwYWNlIH0pO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbih3b3Jrc3BhY2UsICdlZGl0ZWQudHh0JyksICdhZnRlclxcbicpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbih3b3Jrc3BhY2UsICdjcmVhdGVkLnR4dCcpLCAnY3JlYXRlZFxcbicpO1xuXHRcdGV4ZWNTeW5jKCdnaXQgcm0gLXEgZGVsZXRlZC50eHQgJiYgZ2l0IG12IHJlbmFtZWQtYmVmb3JlLnR4dCByZW5hbWVkLWFmdGVyLnR4dCcsIHsgY3dkOiB3b3Jrc3BhY2UgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNvbnRleHQuY2xpZW50LCBjb25maWcsICdjaGFuZ2VzZXQtY29tbWl0LWNsaWVudCcsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya3NwYWNlKSk7XG5cdFx0Y29uc3QgYXV0aENvbnRyb2wgPSBhd2FpdCBkcml2ZVR1cm5Ub0NvbXBsZXRpb24oY29udGV4dC5jbGllbnQsIHNlc3Npb25VcmksICd0dXJuLWNoYW5nZXNldC1jb21taXQtYXV0aC1jb250cm9sJywgJ1JlcGx5IGV4YWN0bHkgXCJBVVRIRU5USUNBVEVEXCIuJywgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF1dGhDb250cm9sLnJlc3BvbnNlVGV4dC50cmltKCksICdBVVRIRU5USUNBVEVEJyk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uVXJpKTtcblx0XHRhd2FpdCByZXRyeShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdWJzY3JpYmVkID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGNoYW5nZXNldFVyaSB9KTtcblx0XHRcdGNvbnN0IHN0YXRlID0gc3Vic2NyaWJlZC5zbmFwc2hvdCEuc3RhdGUgYXMgQ2hhbmdlc2V0U3RhdGU7XG5cdFx0XHRpZiAoc3RhdGUuZmlsZXMubGVuZ3RoIDwgNCB8fCAhc3RhdGUub3BlcmF0aW9ucz8uc29tZShvcGVyYXRpb24gPT4gb3BlcmF0aW9uLmlkID09PSAnY29tbWl0JykpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNaXhlZCB1bmNvbW1pdHRlZCBjaGFuZ2VzIGFyZSBub3QgcmVhZHknKTtcblx0XHRcdH1cblx0XHR9LCAxMDAsIDEwMCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPHsgcmVhZG9ubHkgbWVzc2FnZT86IHsgcmVhZG9ubHkgbWFya2Rvd24/OiBzdHJpbmcgfSB9PignaW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uJywge1xuXHRcdFx0Y2hhbm5lbDogY2hhbmdlc2V0VXJpLFxuXHRcdFx0b3BlcmF0aW9uSWQ6ICdjb21taXQnLFxuXHRcdH0sIDEyMF8wMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjbGVhbjogZXhlY1N5bmMoJ2dpdCBzdGF0dXMgLS1wb3JjZWxhaW4nLCB7IGN3ZDogd29ya3NwYWNlLCBlbmNvZGluZzogJ3V0ZjgnIH0pLFxuXHRcdFx0Y29tbWl0Q291bnQ6IE51bWJlcihleGVjU3luYygnZ2l0IHJldi1saXN0IC0tY291bnQgSEVBRCcsIHsgY3dkOiB3b3Jrc3BhY2UsIGVuY29kaW5nOiAndXRmOCcgfSkudHJpbSgpKSxcblx0XHRcdG1lc3NhZ2U6IHJlc3VsdC5tZXNzYWdlPy5tYXJrZG93bj8uaW5jbHVkZXMoJ0NvbW1pdHRlZCBjaGFuZ2VzIHdpdGggbWVzc2FnZTonKSA/PyBmYWxzZSxcblx0XHR9LCB7XG5cdFx0XHRjbGVhbjogJycsXG5cdFx0XHRjb21taXRDb3VudDogMixcblx0XHRcdG1lc3NhZ2U6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsWUFBWSxXQUFXLGFBQWEsY0FBYyxxQkFBcUI7QUFDaEYsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQWlHO0FBQzFHLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQTRLO0FBQ3JMLFNBQVMscUJBQXFCLGFBQWEsa0JBQWtCLGdCQUFnQixnQkFBZ0IsNkJBQXFFO0FBRWxLLFNBQVMsNEJBQTRCLG1CQUFtQixjQUFjLHVCQUF1Qix5QkFBeUIsaUJBQWlCLG9CQUFvQixtQ0FBbUM7QUFDOUwsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0IsbUJBQW1CLDRCQUE0QjtBQUc5RSxNQUFNLGNBQWMsY0FBYyxZQUFZLEdBQUc7QUFFakQsU0FBUyxpQkFBaUIsU0FBbUMsUUFBMEI7QUFDdEYsU0FBTyxRQUFRLE9BQU8sc0JBQXNCLE9BQUsscUJBQXFCLEdBQUcsb0JBQW9CLENBQUMsRUFDNUYsSUFBSSxPQUFLLGtCQUFrQixDQUFDLEVBQUUsTUFBaUMsRUFDL0QsT0FBTyxZQUFVLE9BQU8sV0FBVyxNQUFNLEVBQ3pDLElBQUksWUFBVSxPQUFPLFFBQVE7QUFDaEM7QUFFTyxTQUFTLDJCQUEyQixTQUF5QztBQUNuRixNQUFJLFFBQVEsU0FBUyxZQUFZLFFBQVEsT0FBTyxhQUFhLGNBQWM7QUFDMUU7QUFBQSxF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
