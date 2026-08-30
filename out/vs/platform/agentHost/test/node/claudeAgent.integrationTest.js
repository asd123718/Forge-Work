import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { Schemas } from "../../../../base/common/network.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { FileService } from "../../../files/common/fileService.js";
import { IFileService } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { AgentSession, GITHUB_COPILOT_PROTECTED_RESOURCE } from "../../common/agent.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { buildDefaultChatUri, ResponsePartKind, ToolResultContentType, ChatInputResponseKind, ChatInputAnswerState, ChatInputAnswerValueKind } from "../../common/state/sessionState.js";
import { ISessionDataService } from "../../common/sessionDataService.js";
import { IAgentHostOTelService } from "../../common/otel/agentHostOTelService.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../node/agentConfigurationService.js";
import { IAgentHostGitHubEndpointService } from "../../node/agentHostGitHubEndpointService.js";
import { createTestGitHubEndpointService } from "./testGitHubEndpointService.js";
import { AgentHostStateManager, IAgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentHostSessionTitleSignal, IAgentHostSessionTitleSignal } from "../../node/agentHostSessionTitleSignal.js";
import { IAgentHostGitService } from "../../common/agentHostGitService.js";
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from "../../common/agentHostCheckpointService.js";
import { IAgentHostCustomizationEnablementService } from "../../node/agentHostCustomizationEnablementService.js";
import { createNoopCustomizationEnablementService } from "./testCustomizationEnablementService.js";
import { ClaudeAgent } from "../../node/claude/claudeAgent.js";
import { IClaudeAgentSdkService } from "../../node/claude/claudeAgentSdkService.js";
import { IAgentPluginManager } from "../../common/agentPluginManager.js";
import { ClaudeProxyService, IClaudeProxyService } from "../../node/claude/claudeProxyService.js";
import { ICopilotApiService } from "../../node/shared/copilotApiService.js";
import { createNoopGitService, createSessionDataService } from "../common/sessionTestHelpers.js";
import {
  makeContentBlockStartText,
  makeContentBlockStartToolUse,
  makeContentBlockStop,
  makeInputJsonDelta,
  makeMessageStart,
  makeMessageStop,
  makeStreamEvent,
  makeTextDelta,
  makeUserToolResultMessage
} from "./claudeMapSessionEventsTestUtils.js";
const noopOTelService = {
  _serviceBrand: void 0,
  getSdkTelemetryConfig: async () => void 0,
  getNativeSdkTelemetryConfig: async () => void 0,
  getSessionTraceContext: () => void 0,
  releaseSessionTraceContext: () => {
  },
  withTraceContext: (_context, fn) => fn(),
  getCurrentTraceContext: () => void 0,
  getSpansDbPath: () => void 0,
  emitSessionTitleChanged: () => {
  },
  flush: async () => {
  }
};
function claudeFileEnvServices(disposables) {
  const fileService = disposables.add(new FileService(new NullLogService()));
  disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
  const env = { userHome: URI.file("/mock-home") };
  return [
    [IFileService, fileService],
    [INativeEnvironmentService, env]
  ];
}
const ANTHROPIC_MODEL = {
  id: "claude-opus-4.6",
  name: "Claude Opus 4.6",
  vendor: "Anthropic",
  supported_endpoints: ["/v1/messages"],
  object: "model",
  version: "4.6",
  is_chat_default: false,
  is_chat_fallback: false,
  model_picker_category: "",
  model_picker_enabled: true,
  preview: false,
  billing: { is_premium: false, multiplier: 1, restricted_to: [] },
  capabilities: {
    family: "test",
    limits: { max_context_window_tokens: 2e5, max_output_tokens: 8192, max_prompt_tokens: 2e5 },
    object: "model_capabilities",
    supports: { parallel_tool_calls: true, streaming: true, tool_calls: true, vision: false },
    tokenizer: "o200k_base",
    type: "chat"
  },
  policy: { state: "enabled", terms: "" }
};
const TEST_UUID = "11111111-2222-3333-4444-555555555555";
function makeMessage(model) {
  return {
    id: "msg_int_test",
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text: "", citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    container: null,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      server_tool_use: null,
      service_tier: null
    }
  };
}
function makeCannedStream(model) {
  const message = makeMessage(model);
  const contentBlockStart = {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "", citations: [] }
  };
  const contentBlockDelta = {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "hello" }
  };
  const messageDelta = {
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null, stop_details: null, container: null },
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null
    }
  };
  return [
    { type: "message_start", message },
    contentBlockStart,
    contentBlockDelta,
    { type: "content_block_stop", index: 0 },
    messageDelta,
    { type: "message_stop" }
  ];
}
function makeSystemInitMessage(sessionId) {
  return {
    type: "system",
    subtype: "init",
    apiKeySource: "user",
    claude_code_version: "0.0.0-test",
    cwd: "/workspace",
    tools: [],
    mcp_servers: [],
    model: "claude-test",
    permissionMode: "default",
    slash_commands: [],
    output_style: "default",
    skills: [],
    plugins: [],
    uuid: TEST_UUID,
    session_id: sessionId
  };
}
function makeResultSuccess(sessionId) {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 0,
    duration_api_ms: 0,
    is_error: false,
    num_turns: 1,
    result: "",
    stop_reason: "end_turn",
    total_cost_usd: 0,
    usage: {
      cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      inference_geo: "unknown",
      input_tokens: 0,
      iterations: [],
      output_tokens: 0,
      server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 },
      service_tier: "standard",
      speed: "standard"
    },
    modelUsage: {},
    permission_denials: [],
    uuid: TEST_UUID,
    session_id: sessionId
  };
}
class StubCopilotApiService {
  constructor() {
    this.streamEvents = [];
    this.availableModels = [ANTHROPIC_MODEL];
    this.messagesCallCount = { count: 0 };
  }
  async resolveRestrictedTelemetryContext() {
    return { restrictedTelemetryEnabled: false, trackingId: void 0, telemetryEndpoint: void 0 };
  }
  async resolveApiEndpoint() {
    return void 0;
  }
  messages(token, request, options) {
    this.messagesCallCount.count++;
    if (request.stream) {
      return this._stream(options);
    }
    return Promise.reject(new Error("non-streaming not used in integration test"));
  }
  async *_stream(options) {
    for (const ev of this.streamEvents) {
      if (options?.signal?.aborted) {
        const err = new Error("Aborted");
        err.name = "AbortError";
        throw err;
      }
      yield ev;
    }
  }
  async countTokens() {
    throw new Error("countTokens not used in integration test");
  }
  async models() {
    return this.availableModels;
  }
  async responses() {
    throw new Error("responses not used in Claude integration tests");
  }
  async utilityChatCompletion() {
    throw new Error("utilityChatCompletion not used in Claude integration tests");
  }
}
function isCanUseToolMarker(item) {
  return item.kind === "canUseTool";
}
function isElicitationMarker(item) {
  return item.kind === "elicitation";
}
class ProxyRoundTripSdkService {
  constructor() {
    this.capturedStartupOptions = [];
    this.proxyRoundTrips = [];
    /**
     * Items the produced WarmQuery's Query will yield in order. SDK
     * messages flow through unchanged; {@link CanUseToolMarker} entries
     * pause the iterator and invoke the captured
     * `Options.canUseTool` closure (mirroring what the real SDK
     * subprocess does between assistant `tool_use` and the synthetic
     * `user` `tool_result` it follows up with).
     */
    this.queryMessages = [];
    /** Records the {@link PermissionResult} returned by each `canUseTool` invocation in {@link queryMessages} order. */
    this.canUseToolResults = [];
    this.elicitationResults = [];
    this.warmQueries = [];
  }
  async listSessions() {
    return [];
  }
  async canLoadWithoutDownload() {
    return true;
  }
  async ensureAvailableForDiscovery() {
  }
  async getSessionInfo(_sessionId) {
    return void 0;
  }
  async getSessionMessages(_sessionId, _options) {
    return [];
  }
  async listSubagents(_sessionId) {
    return [];
  }
  async getSubagentMessages(_sessionId, _agentId) {
    return [];
  }
  async forkSession(sessionId) {
    return { sessionId: `forked-${sessionId}` };
  }
  async deleteSession() {
  }
  async createSdkMcpServer() {
    throw new Error("not implemented in integration test fake");
  }
  async tool() {
    throw new Error("not implemented in integration test fake");
  }
  async query(_params) {
    throw new Error("query not used in proxy round-trip integration test");
  }
  async startup(params) {
    this.capturedStartupOptions.push(params.options);
    const settings = params.options.settings;
    const settingsEnv = settings && typeof settings === "object" && settings.env ? settings.env : {};
    const baseUrl = settingsEnv["ANTHROPIC_BASE_URL"];
    const bearer = settingsEnv["ANTHROPIC_AUTH_TOKEN"];
    if (!baseUrl || !bearer) {
      throw new Error("ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN missing from settings.env");
    }
    const result = await postSseToProxy(`${baseUrl}/v1/messages`, bearer, {
      model: "claude-opus-4-6",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
      max_tokens: 4096
    });
    this.proxyRoundTrips.push(result);
    const warm = new RoundTripWarmQuery(this);
    this.warmQueries.push(warm);
    return warm;
  }
}
class RoundTripWarmQuery {
  constructor(_sdk) {
    this._sdk = _sdk;
    this.asyncDisposeCount = 0;
    this.closeCount = 0;
  }
  query(prompt) {
    if (typeof prompt === "string") {
      throw new Error("integration test: agent host always passes an AsyncIterable");
    }
    return new RoundTripQuery(prompt, this._sdk);
  }
  close() {
    this.closeCount++;
  }
  async [Symbol.asyncDispose]() {
    this.asyncDisposeCount++;
  }
}
class RoundTripQuery {
  constructor(prompt, _sdk) {
    this._sdk = _sdk;
    this._index = 0;
    const it = prompt[Symbol.asyncIterator]();
    this._drainer = (async () => {
      while (true) {
        const r = await it.next();
        if (r.done) {
          return;
        }
      }
    })();
  }
  [Symbol.asyncIterator]() {
    return this;
  }
  async next() {
    while (this._index < this._sdk.queryMessages.length) {
      const item = this._sdk.queryMessages[this._index++];
      if (isCanUseToolMarker(item)) {
        const startup = this._sdk.capturedStartupOptions[0];
        if (!startup?.canUseTool) {
          throw new Error("integration test: canUseTool marker but Options.canUseTool not wired");
        }
        const result = await startup.canUseTool(item.toolName, item.input, {
          signal: new AbortController().signal,
          toolUseID: item.toolUseID,
          requestId: item.toolUseID
        });
        this._sdk.canUseToolResults.push(result);
        continue;
      }
      if (isElicitationMarker(item)) {
        const startup = this._sdk.capturedStartupOptions[0];
        if (!startup?.onElicitation) {
          throw new Error("integration test: elicitation marker but Options.onElicitation not wired");
        }
        const result = await startup.onElicitation(item.request, { signal: new AbortController().signal });
        this._sdk.elicitationResults.push(result);
        continue;
      }
      return { done: false, value: item };
    }
    await this._drainer;
    return { done: true, value: void 0 };
  }
  async return() {
    return { done: true, value: void 0 };
  }
  async throw(err) {
    throw err;
  }
  async interrupt() {
    return void 0;
  }
  setPermissionMode() {
    throw new Error("not modeled");
  }
  setMcpPermissionModeOverride() {
    throw new Error("not modeled");
  }
  setModel() {
    throw new Error("not modeled");
  }
  setMaxThinkingTokens() {
    throw new Error("not modeled");
  }
  applyFlagSettings() {
    throw new Error("not modeled");
  }
  initializationResult() {
    throw new Error("not modeled");
  }
  reinitialize() {
    throw new Error("not modeled");
  }
  supportedCommands() {
    throw new Error("not modeled");
  }
  supportedModels() {
    throw new Error("not modeled");
  }
  supportedAgents() {
    throw new Error("not modeled");
  }
  mcpServerStatus() {
    throw new Error("not modeled");
  }
  getContextUsage() {
    throw new Error("not modeled");
  }
  usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET() {
    throw new Error("not modeled");
  }
  reloadPlugins() {
    throw new Error("not modeled");
  }
  accountInfo() {
    throw new Error("not modeled");
  }
  rewindFiles() {
    throw new Error("not modeled");
  }
  readFile() {
    throw new Error("not modeled");
  }
  seedReadState() {
    throw new Error("not modeled");
  }
  reconnectMcpServer() {
    throw new Error("not modeled");
  }
  toggleMcpServer() {
    throw new Error("not modeled");
  }
  setMcpServers() {
    throw new Error("not modeled");
  }
  streamInput() {
    throw new Error("not modeled");
  }
  stopTask() {
    throw new Error("not modeled");
  }
  reloadSkills() {
    throw new Error("not modeled");
  }
  backgroundTasks() {
    throw new Error("not modeled");
  }
  close() {
  }
  [Symbol.asyncDispose]() {
    return Promise.resolve();
  }
}
let _httpModule;
async function getHttp() {
  if (!_httpModule) {
    _httpModule = await import("http");
  }
  return _httpModule;
}
async function postSseToProxy(url, bearer, payload) {
  const httpMod = await getHttp();
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(payload);
    const req = httpMod.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${bearer}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body).toString(),
        "Accept": "text/event-stream",
        "anthropic-version": "2023-06-01"
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode ?? 0,
          contentType: typeof res.headers["content-type"] === "string" ? res.headers["content-type"] : void 0,
          events: parseSseFrames(raw)
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
function parseSseFrames(raw) {
  const out = [];
  for (const block of raw.split("\n\n")) {
    if (!block.trim()) {
      continue;
    }
    let event = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        event = line.slice("event: ".length).trim();
      } else if (line.startsWith("data: ")) {
        data = line.slice("data: ".length);
      }
    }
    if (event && data) {
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = data;
      }
      out.push({ type: event, data: parsed });
    }
  }
  return out;
}
async function createSession(agent, config) {
  const session = AgentSession.uri("claude", generateUuid());
  const chat = URI.parse(buildDefaultChatUri(session));
  const created = await agent.chats.createChat(chat, chatContext(chat, session), {
    model: config.model,
    agent: config.agent,
    workingDirectories: config.workingDirectories,
    config: config.config,
    activeClient: config.activeClient,
    deferBacking: !config.fork && !config.importConversation,
    importConversation: config.importConversation
  });
  if (!created?.backingSession) {
    throw new Error("Expected chat backing metadata");
  }
  return { session, chat, sessionId: AgentSession.id(created.backingSession) };
}
function chatContext(chat, session) {
  return { configurationResource: session, resource: session };
}
suite("ClaudeAgent integration (proxy-backed)", function() {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("agent \u2192 proxy \u2192 CAPI \u2192 SSE \u2192 agent: end-to-end pipeline with real proxy and stubbed CAPI", async () => {
    const capi = new StubCopilotApiService();
    capi.streamEvents = makeCannedStream("claude-opus-4.6");
    const realProxy = disposables.add(new ClaudeProxyService(new NullLogService(), capi));
    const sdk = new ProxyRoundTripSdkService();
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const services = new ServiceCollection(
      [ILogService, logService],
      [ICopilotApiService, capi],
      [IClaudeProxyService, realProxy],
      [ISessionDataService, createSessionDataService()],
      [IClaudeAgentSdkService, sdk],
      [IAgentPluginManager, {
        _serviceBrand: void 0,
        basePath: URI.from({ scheme: "inmemory", path: "/agentPlugins" }),
        async syncCustomizations(_clientId, _customizations) {
          return [];
        }
      }],
      [IAgentConfigurationService, configService],
      [IAgentHostOTelService, noopOTelService],
      [IAgentHostStateManager, stateManager],
      [IAgentHostSessionTitleSignal, disposables.add(new AgentHostSessionTitleSignal(stateManager))],
      [IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
      [IAgentHostGitService, createNoopGitService()],
      [IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
      [IAgentHostCustomizationEnablementService, createNoopCustomizationEnablementService()],
      ...claudeFileEnvServices(disposables)
    );
    const instantiationService = disposables.add(new InstantiationService(services));
    const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
    const accepted = await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, "gh-int-test-token");
    assert.strictEqual(accepted, true);
    const created = await createSession(agent, { workingDirectories: [URI.file("/integration-cwd")] });
    assert.strictEqual(sdk.capturedStartupOptions.length, 0, "createChat does not touch the SDK");
    const sessionId = created.sessionId;
    sdk.queryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
    await agent.chats.sendMessage(created.chat, "hi", void 0, void 0, "turn-1", void 0, void 0, chatContext(created.chat, created.session));
    const startup = sdk.capturedStartupOptions[0];
    const round = sdk.proxyRoundTrips[0];
    const startupSettings = startup.settings;
    const settingsEnv = startupSettings && typeof startupSettings === "object" && startupSettings.env ? startupSettings.env : {};
    assert.deepStrictEqual({
      startupCallCount: sdk.capturedStartupOptions.length,
      roundTripCount: sdk.proxyRoundTrips.length,
      capiCallCount: capi.messagesCallCount.count,
      startupCwd: startup.cwd,
      startupSessionId: startup.sessionId,
      startupExecutable: startup.executable,
      subprocessElectronRunAsNode: startup.env?.["ELECTRON_RUN_AS_NODE"],
      subprocessNodeOptions: startup.env?.["NODE_OPTIONS"],
      subprocessAnthropicApiKey: startup.env?.["ANTHROPIC_API_KEY"],
      settingsBaseUrlIsLoopback: typeof settingsEnv["ANTHROPIC_BASE_URL"] === "string" && settingsEnv["ANTHROPIC_BASE_URL"].startsWith("http://127.0.0.1:"),
      settingsBearerHasNonceAndSession: typeof settingsEnv["ANTHROPIC_AUTH_TOKEN"] === "string" && settingsEnv["ANTHROPIC_AUTH_TOKEN"].split(".").length === 2 && settingsEnv["ANTHROPIC_AUTH_TOKEN"].endsWith(`.${sessionId}`),
      httpStatus: round.status,
      httpContentType: round.contentType,
      eventTypes: round.events.map((e) => e.type)
    }, {
      startupCallCount: 1,
      roundTripCount: 1,
      capiCallCount: 1,
      startupCwd: URI.file("/integration-cwd").fsPath,
      startupSessionId: sessionId,
      startupExecutable: process.execPath,
      subprocessElectronRunAsNode: "1",
      subprocessNodeOptions: void 0,
      subprocessAnthropicApiKey: void 0,
      settingsBaseUrlIsLoopback: true,
      settingsBearerHasNonceAndSession: true,
      httpStatus: 200,
      httpContentType: "text/event-stream",
      eventTypes: [
        "message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop"
      ]
    });
    await agent.chats.disposeChat(created.chat, chatContext(created.chat, created.session));
    assert.strictEqual(sdk.warmQueries[0].asyncDisposeCount, 1, "WarmQuery is asyncDisposed on chat dispose");
  });
  test("proxy rejects a request whose bearer carries a wrong nonce (auth contract)", async () => {
    const capi = new StubCopilotApiService();
    const realProxy = disposables.add(new ClaudeProxyService(new NullLogService(), capi));
    const handle = await realProxy.start("gh-int-test-token");
    try {
      const result = await postSseToProxy(
        `${handle.baseUrl}/v1/messages`,
        "wrong-nonce.session-x",
        { model: "claude-opus-4-6", messages: [], stream: true }
      );
      assert.strictEqual(result.status, 401);
      assert.strictEqual(capi.messagesCallCount.count, 0, "auth check fires before any upstream call");
    } finally {
      handle.dispose();
    }
  });
  test("Phase 7 \xA75.3 \u2014 canUseTool / onElicitation closures wired through to Options on materialize", async () => {
    const capi = new StubCopilotApiService();
    capi.streamEvents = makeCannedStream("claude-opus-4.6");
    const realProxy = disposables.add(new ClaudeProxyService(new NullLogService(), capi));
    const sdk = new ProxyRoundTripSdkService();
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const services = new ServiceCollection(
      [ILogService, logService],
      [ICopilotApiService, capi],
      [IClaudeProxyService, realProxy],
      [ISessionDataService, createSessionDataService()],
      [IClaudeAgentSdkService, sdk],
      [IAgentPluginManager, {
        _serviceBrand: void 0,
        basePath: URI.from({ scheme: "inmemory", path: "/agentPlugins" }),
        async syncCustomizations(_clientId, _customizations) {
          return [];
        }
      }],
      [IAgentConfigurationService, configService],
      [IAgentHostOTelService, noopOTelService],
      [IAgentHostStateManager, stateManager],
      [IAgentHostSessionTitleSignal, disposables.add(new AgentHostSessionTitleSignal(stateManager))],
      [IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
      [IAgentHostGitService, createNoopGitService()],
      [IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
      [IAgentHostCustomizationEnablementService, createNoopCustomizationEnablementService()],
      ...claudeFileEnvServices(disposables)
    );
    const instantiationService = disposables.add(new InstantiationService(services));
    const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
    await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, "gh-int-test-token");
    const created = await createSession(agent, { workingDirectories: [URI.file("/integration-cwd")] });
    const sessionId = created.sessionId;
    sdk.queryMessages = [
      makeSystemInitMessage(sessionId),
      {
        kind: "elicitation",
        request: { serverName: "mcp-test", message: "pick a side", mode: "form", requestedSchema: { type: "object", properties: { side: { type: "string" } } } }
      },
      makeResultSuccess(sessionId)
    ];
    const inputRequested = new DeferredPromise();
    disposables.add(agent.onDidChatProgress((s) => {
      if (s.kind === "action" && s.action.type === ActionType.ChatInputRequested) {
        inputRequested.complete(s.action.request);
      }
    }));
    const sendPromise = agent.chats.sendMessage(created.chat, "hi", void 0, void 0, "turn-1", void 0, void 0, chatContext(created.chat, created.session));
    const inputRequest = await inputRequested.p;
    const startup = sdk.capturedStartupOptions[0];
    assert.ok(typeof startup.canUseTool === "function", "canUseTool was wired into Options");
    assert.ok(typeof startup.onElicitation === "function", "onElicitation was wired into Options");
    agent.respondToUserInputRequest(inputRequest.id, ChatInputResponseKind.Accept, {
      side: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "left" } }
    });
    await sendPromise;
    assert.deepStrictEqual({
      elicitResult: sdk.elicitationResults[0],
      permissionMode: startup.permissionMode
    }, {
      elicitResult: { action: "accept", content: { side: "left" } },
      permissionMode: "default"
    });
  });
  test("Phase 7 \xA75.3 \u2014 Read tool round-trip: SDK tool_use \u2192 pending_confirmation \u2192 respondToPermissionRequest(true) \u2192 tool_result \u2192 continuation", async () => {
    const capi = new StubCopilotApiService();
    capi.streamEvents = makeCannedStream("claude-opus-4.6");
    const realProxy = disposables.add(new ClaudeProxyService(new NullLogService(), capi));
    const sdk = new ProxyRoundTripSdkService();
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const services = new ServiceCollection(
      [ILogService, logService],
      [ICopilotApiService, capi],
      [IClaudeProxyService, realProxy],
      [ISessionDataService, createSessionDataService()],
      [IClaudeAgentSdkService, sdk],
      [IAgentPluginManager, {
        _serviceBrand: void 0,
        basePath: URI.from({ scheme: "inmemory", path: "/agentPlugins" }),
        async syncCustomizations(_clientId, _customizations) {
          return [];
        }
      }],
      [IAgentConfigurationService, configService],
      [IAgentHostOTelService, noopOTelService],
      [IAgentHostStateManager, stateManager],
      [IAgentHostSessionTitleSignal, disposables.add(new AgentHostSessionTitleSignal(stateManager))],
      [IAgentHostGitHubEndpointService, createTestGitHubEndpointService()],
      [IAgentHostGitService, createNoopGitService()],
      [IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
      [IAgentHostCustomizationEnablementService, createNoopCustomizationEnablementService()],
      ...claudeFileEnvServices(disposables)
    );
    const instantiationService = disposables.add(new InstantiationService(services));
    const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
    await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, "gh-int-test-token");
    const created = await createSession(agent, { workingDirectories: [URI.file("/integration-cwd")] });
    const sessionId = created.sessionId;
    const TOOL_USE_ID = "tu_int_read_1";
    sdk.queryMessages = [
      makeSystemInitMessage(sessionId),
      makeStreamEvent(sessionId, makeMessageStart("msg_int_1")),
      makeStreamEvent(sessionId, makeContentBlockStartText(0)),
      makeStreamEvent(sessionId, makeTextDelta(0, "reading")),
      makeStreamEvent(sessionId, makeContentBlockStop(0)),
      makeStreamEvent(sessionId, makeContentBlockStartToolUse(1, TOOL_USE_ID, "Read")),
      makeStreamEvent(sessionId, makeInputJsonDelta(1, '{"file_path":"/tmp/x"}')),
      makeStreamEvent(sessionId, makeContentBlockStop(1)),
      makeStreamEvent(sessionId, makeMessageStop()),
      { kind: "canUseTool", toolName: "Read", input: { file_path: "/tmp/x" }, toolUseID: TOOL_USE_ID },
      makeUserToolResultMessage(sessionId, TOOL_USE_ID, "file contents"),
      makeStreamEvent(sessionId, makeMessageStart("msg_int_2")),
      makeStreamEvent(sessionId, makeContentBlockStartText(0)),
      makeStreamEvent(sessionId, makeTextDelta(0, "done")),
      makeStreamEvent(sessionId, makeContentBlockStop(0)),
      makeStreamEvent(sessionId, makeMessageStop()),
      makeResultSuccess(sessionId)
    ];
    const signals = [];
    disposables.add(agent.onDidChatProgress((s) => {
      signals.push(s);
      if (s.kind === "pending_confirmation" && s.state.toolCallId === TOOL_USE_ID) {
        agent.respondToPermissionRequest(TOOL_USE_ID, true);
      }
    }));
    await agent.chats.sendMessage(created.chat, "please read /tmp/x", void 0, void 0, "turn-1", void 0, void 0, chatContext(created.chat, created.session));
    const summary = signals.map((s) => {
      if (s.kind === "pending_confirmation") {
        return {
          kind: s.kind,
          toolCallId: s.state.toolCallId,
          toolName: s.state.toolName,
          permissionKind: s.permissionKind,
          permissionPath: s.permissionPath
        };
      }
      if (s.kind === "action") {
        const a = s.action;
        switch (a.type) {
          case ActionType.ChatResponsePart:
            return { kind: "action", type: a.type, partKind: a.part.kind, content: a.part.kind === ResponsePartKind.Markdown ? a.part.content : void 0 };
          case ActionType.ChatDelta:
            return { kind: "action", type: a.type, content: a.content };
          case ActionType.ChatToolCallStart:
            return { kind: "action", type: a.type, toolCallId: a.toolCallId, toolName: a.toolName };
          case ActionType.ChatToolCallDelta:
            return { kind: "action", type: a.type, toolCallId: a.toolCallId, content: a.content };
          case ActionType.ChatToolCallComplete:
            return { kind: "action", type: a.type, toolCallId: a.toolCallId, success: a.result.success, content: a.result.content };
          case ActionType.ChatUsage:
            return { kind: "action", type: a.type };
          case ActionType.ChatTurnComplete:
            return { kind: "action", type: a.type };
          default:
            return { kind: "action", type: a.type };
        }
      }
      return { kind: s.kind };
    });
    assert.deepStrictEqual({
      summary,
      canUseToolResults: sdk.canUseToolResults
    }, {
      summary: [
        { kind: "action", type: ActionType.ChatResponsePart, partKind: ResponsePartKind.Markdown, content: "" },
        { kind: "action", type: ActionType.ChatDelta, content: "reading" },
        { kind: "action", type: ActionType.ChatToolCallStart, toolCallId: TOOL_USE_ID, toolName: "Read" },
        { kind: "action", type: ActionType.ChatToolCallDelta, toolCallId: TOOL_USE_ID, content: '{"file_path":"/tmp/x"}' },
        // Phase 8.5 — mapper emits `ChatToolCallReady` at
        // `content_block_stop` so auto-allowed tools transition out of
        // `Streaming`; `sessionPermissions` then emits a second Ready
        // for the pending_confirmation card below.
        { kind: "action", type: ActionType.ChatToolCallReady },
        { kind: "pending_confirmation", toolCallId: TOOL_USE_ID, toolName: "Read", permissionKind: "read", permissionPath: "/tmp/x" },
        { kind: "action", type: ActionType.ChatToolCallComplete, toolCallId: TOOL_USE_ID, success: true, content: [{ type: ToolResultContentType.Text, text: "file contents" }] },
        { kind: "action", type: ActionType.ChatResponsePart, partKind: ResponsePartKind.Markdown, content: "" },
        { kind: "action", type: ActionType.ChatDelta, content: "done" },
        { kind: "action", type: ActionType.ChatUsage },
        { kind: "action", type: ActionType.ChatTurnComplete }
      ],
      canUseToolResults: [
        { behavior: "allow", updatedInput: { file_path: "/tmp/x" } }
      ]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVBZ2VudC5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIEludGVncmF0aW9uIHRlc3QgZm9yIFBoYXNlIDYgQ2xhdWRlQWdlbnQuXG4gKlxuICogV2lyZXMgdG9nZXRoZXI6XG4gKiAgLSBSZWFsIHtAbGluayBDbGF1ZGVQcm94eVNlcnZpY2V9IGJvdW5kIHRvIGEgcmVhbCBsb29wYmFjayBIVFRQIGxpc3RlbmVyLlxuICogIC0gU3R1YmJlZCB7QGxpbmsgSUNvcGlsb3RBcGlTZXJ2aWNlfSB0aGF0IHlpZWxkcyBhIGNhbm5lZCBBbnRocm9waWNcbiAqICAgIGBNZXNzYWdlU3RyZWFtRXZlbnRgIHNlcXVlbmNlLlxuICogIC0gUmVhbCB7QGxpbmsgQ2xhdWRlQWdlbnR9IGRyaXZpbmcgdGhlIG1hdGVyaWFsaXplIGxpZmVjeWNsZS5cbiAqICAtIFJlY29yZGluZyB7QGxpbmsgSUNsYXVkZUFnZW50U2RrU2VydmljZX0gdGhhdCwgb24gYHN0YXJ0dXAoKWAsXG4gKiAgICBwZXJmb3JtcyBhIHJlYWwgSFRUUCByb3VuZC10cmlwIGFnYWluc3QgdGhlIHByb3h5IHVzaW5nIHRoZVxuICogICAgYE9wdGlvbnMuc2V0dGluZ3MuZW52LkFOVEhST1BJQ19CQVNFX1VSTGAgL1xuICogICAgYE9wdGlvbnMuc2V0dGluZ3MuZW52LkFOVEhST1BJQ19BVVRIX1RPS0VOYCBpdCByZWNlaXZlZCBcdTIwMTQgZXhhY3RseVxuICogICAgd2hhdCB0aGUgcmVhbCBDbGF1ZGUgU0RLIHN1YnByb2Nlc3Mgd291bGQgZG8gd2hlbiBmb3JrZWQuXG4gKlxuICogVGhlIHRlc3QgZG9lcyBOT1QgZm9yayB0aGUgYnVuZGxlZCBgQGFudGhyb3BpYy1haS9jbGF1ZGUtYWdlbnQtc2RrYFxuICogc3VicHJvY2Vzcy4gVGhhdCBmb3JrIGlzIGV4ZXJjaXNlZCBsaXZlIGJ5IHRoZSBQaGFzZSA2IHNtb2tlIHJ1blxuICogKGBzbW9rZS5tZGApLiBXaGF0IHRoaXMgdGVzdCBndWFyYW50ZWVzIGluIENJIGlzIHRoZSBjcm9zcy1jb21wb25lbnRcbiAqIHdpcmluZyB0aGF0IGNvbm5lY3RzIHRoZSB0d286XG4gKiAgLSBUaGUgYWdlbnQgY29uc3RydWN0cyBgQmVhcmVyIDxub25jZT4uPHNlc3Npb25JZD5gIGluIGEgZm9ybWF0IHRoZVxuICogICAgcmVhbCBwcm94eSdzIGF1dGggcGFyc2VyIGFjY2VwdHMuXG4gKiAgLSBUaGUgYWdlbnQgcGFzc2VzIHRoZSBwcm94eSdzIGFjdHVhbCBgYmFzZVVybGAgdGhyb3VnaFxuICogICAgYE9wdGlvbnMuc2V0dGluZ3MuZW52YC5cbiAqICAtIFRoZSBwcm94eSdzIFNTRSBlbmNvZGluZyByb3VuZC10cmlwcyB0aGUgY2FubmVkIHVwc3RyZWFtIHN0cmVhbS5cbiAqICAtIFRoZSBhZ2VudCdzIHN0cmlwLWVudiBjb250cmFjdCBvbiBgT3B0aW9ucy5lbnZgXG4gKiAgICAoYE5PREVfT1BUSU9OUz09PXVuZGVmaW5lZGAsIGBFTEVDVFJPTl9SVU5fQVNfTk9ERT09PScxJ2ApIGlzXG4gKiAgICBjYXB0dXJlZCBieSB3aGF0IHRoZSBTREsgc2VydmljZSByZWNlaXZlcy5cbiAqICAtIERpc3Bvc2luZyB0aGUgYWdlbnQgZGlzcG9zZXMgdGhlIHByb3h5IGhhbmRsZSBhbmQgdGhlIFdhcm1RdWVyeVxuICogICAgKG5vIG9ycGhhbiByZXNvdXJjZXMpLlxuICovXG5cbmltcG9ydCB0eXBlIEFudGhyb3BpYyBmcm9tICdAYW50aHJvcGljLWFpL3Nkayc7XG5pbXBvcnQgdHlwZSB7IEdldFNlc3Npb25NZXNzYWdlc09wdGlvbnMsIE9wdGlvbnMsIFBlcm1pc3Npb25SZXN1bHQsIFF1ZXJ5LCBTREtDb250cm9sSW50ZXJydXB0UmVzcG9uc2UsIFNES01lc3NhZ2UsIFNES1Jlc3VsdFN1Y2Nlc3MsIFNES1Nlc3Npb25JbmZvLCBTREtTeXN0ZW1NZXNzYWdlLCBTREtVc2VyTWVzc2FnZSwgU2Vzc2lvbk1lc3NhZ2UsIFdhcm1RdWVyeSB9IGZyb20gJ0BhbnRocm9waWMtYWkvY2xhdWRlLWFnZW50LXNkayc7XG5pbXBvcnQgdHlwZSB7IENDQU1vZGVsIH0gZnJvbSAnQHZzY29kZS9jb3BpbG90LWFwaSc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uLCB0eXBlIEFnZW50U2lnbmFsLCB0eXBlIElBZ2VudENoYXRDb250ZXh0LCB0eXBlIElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGJ1aWxkRGVmYXVsdENoYXRVcmksIFJlc3BvbnNlUGFydEtpbmQsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLCBDaGF0SW5wdXRBbnN3ZXJTdGF0ZSwgQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLCB0eXBlIENoYXRJbnB1dFJlcXVlc3QsIHR5cGUgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdE9UZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL290ZWwvYWdlbnRIb3N0T1RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuL3Rlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsLCBJQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTZXNzaW9uVGl0bGVTaWduYWwuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsIE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOb29wQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi90ZXN0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENsYXVkZUFnZW50IH0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlQWdlbnQuanMnO1xuaW1wb3J0IHsgSUNsYXVkZUFnZW50U2RrU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZUFnZW50U2RrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW5NYW5hZ2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50UGx1Z2luTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVQcm94eVNlcnZpY2UsIElDbGF1ZGVQcm94eVNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVQcm94eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvcGlsb3RBcGlTZXJ2aWNlLCB0eXBlIElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvY29waWxvdEFwaVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlTm9vcEdpdFNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHtcblx0bWFrZUNvbnRlbnRCbG9ja1N0YXJ0VGV4dCxcblx0bWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSxcblx0bWFrZUNvbnRlbnRCbG9ja1N0b3AsXG5cdG1ha2VJbnB1dEpzb25EZWx0YSxcblx0bWFrZU1lc3NhZ2VTdGFydCxcblx0bWFrZU1lc3NhZ2VTdG9wLFxuXHRtYWtlU3RyZWFtRXZlbnQsXG5cdG1ha2VUZXh0RGVsdGEsXG5cdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UsXG59IGZyb20gJy4vY2xhdWRlTWFwU2Vzc2lvbkV2ZW50c1Rlc3RVdGlscy5qcyc7XG5cbmNvbnN0IG5vb3BPVGVsU2VydmljZTogSUFnZW50SG9zdE9UZWxTZXJ2aWNlID0ge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdGdldFNka1RlbGVtZXRyeUNvbmZpZzogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRnZXROYXRpdmVTZGtUZWxlbWV0cnlDb25maWc6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0Z2V0U2Vzc2lvblRyYWNlQ29udGV4dDogKCkgPT4gdW5kZWZpbmVkLFxuXHRyZWxlYXNlU2Vzc2lvblRyYWNlQ29udGV4dDogKCkgPT4geyB9LFxuXHR3aXRoVHJhY2VDb250ZXh0OiA8VD4oX2NvbnRleHQ6IHVuZGVmaW5lZCwgZm46ICgpID0+IFQpOiBUID0+IGZuKCksXG5cdGdldEN1cnJlbnRUcmFjZUNvbnRleHQ6ICgpID0+IHVuZGVmaW5lZCxcblx0Z2V0U3BhbnNEYlBhdGg6ICgpID0+IHVuZGVmaW5lZCxcblx0ZW1pdFNlc3Npb25UaXRsZUNoYW5nZWQ6ICgpID0+IHsgfSxcblx0Zmx1c2g6IGFzeW5jICgpID0+IHsgfSxcbn07XG5cbi8vICNyZWdpb24gVGVzdCBmaXh0dXJlc1xuXG4vKipcbiAqIFRoZSB7QGxpbmsgSUZpbGVTZXJ2aWNlfSArIHtAbGluayBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlfSBwYWlyIHRoZVxuICogUGhhc2UgMTYgY3VzdG9taXphdGlvbiBkaXNrIHNjYW4gLyB3YXRjaGVyIG5lZWRzIGF0IHNlc3Npb24gY29uc3RydWN0aW9uXG4gKiB0aW1lLiBOb3RoaW5nIGlzIHNlZWRlZCB1bmRlciBgdXNlckhvbWVgLCBzbyB0aGUgc2NhbiBpcyBkZXRlcm1pbmlzdGljYWxseVxuICogZW1wdHkgXHUyMDE0IHRoZXNlIG9ubHkgZXhpc3Qgc28gYG5ldyBDbGF1ZGVBZ2VudFNlc3Npb25gIGNhbiByZWFkIGB1c2VySG9tZWBcbiAqIGFuZCBzdGFydCBpdHMgd2F0Y2hlciB3aXRob3V0IHRocm93aW5nLlxuICovXG5mdW5jdGlvbiBjbGF1ZGVGaWxlRW52U2VydmljZXMoZGlzcG9zYWJsZXM6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4pOiBbdHlwZW9mIElGaWxlU2VydmljZSB8IHR5cGVvZiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBJRmlsZVNlcnZpY2UgfCBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlXVtdIHtcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRjb25zdCBlbnY6IFBhcnRpYWw8SU5hdGl2ZUVudmlyb25tZW50U2VydmljZT4gPSB7IHVzZXJIb21lOiBVUkkuZmlsZSgnL21vY2staG9tZScpIH07XG5cdHJldHVybiBbXG5cdFx0W0lGaWxlU2VydmljZSwgZmlsZVNlcnZpY2VdLFxuXHRcdFtJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBlbnYgYXMgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZV0sXG5cdF07XG59XG5cbmNvbnN0IEFOVEhST1BJQ19NT0RFTDogQ0NBTW9kZWwgPSB7XG5cdGlkOiAnY2xhdWRlLW9wdXMtNC42Jyxcblx0bmFtZTogJ0NsYXVkZSBPcHVzIDQuNicsXG5cdHZlbmRvcjogJ0FudGhyb3BpYycsXG5cdHN1cHBvcnRlZF9lbmRwb2ludHM6IFsnL3YxL21lc3NhZ2VzJ10sXG5cdG9iamVjdDogJ21vZGVsJyxcblx0dmVyc2lvbjogJzQuNicsXG5cdGlzX2NoYXRfZGVmYXVsdDogZmFsc2UsXG5cdGlzX2NoYXRfZmFsbGJhY2s6IGZhbHNlLFxuXHRtb2RlbF9waWNrZXJfY2F0ZWdvcnk6ICcnLFxuXHRtb2RlbF9waWNrZXJfZW5hYmxlZDogdHJ1ZSxcblx0cHJldmlldzogZmFsc2UsXG5cdGJpbGxpbmc6IHsgaXNfcHJlbWl1bTogZmFsc2UsIG11bHRpcGxpZXI6IDEsIHJlc3RyaWN0ZWRfdG86IFtdIH0sXG5cdGNhcGFiaWxpdGllczoge1xuXHRcdGZhbWlseTogJ3Rlc3QnLFxuXHRcdGxpbWl0czogeyBtYXhfY29udGV4dF93aW5kb3dfdG9rZW5zOiAyMDBfMDAwLCBtYXhfb3V0cHV0X3Rva2VuczogODE5MiwgbWF4X3Byb21wdF90b2tlbnM6IDIwMF8wMDAgfSxcblx0XHRvYmplY3Q6ICdtb2RlbF9jYXBhYmlsaXRpZXMnLFxuXHRcdHN1cHBvcnRzOiB7IHBhcmFsbGVsX3Rvb2xfY2FsbHM6IHRydWUsIHN0cmVhbWluZzogdHJ1ZSwgdG9vbF9jYWxsczogdHJ1ZSwgdmlzaW9uOiBmYWxzZSB9LFxuXHRcdHRva2VuaXplcjogJ28yMDBrX2Jhc2UnLFxuXHRcdHR5cGU6ICdjaGF0Jyxcblx0fSxcblx0cG9saWN5OiB7IHN0YXRlOiAnZW5hYmxlZCcsIHRlcm1zOiAnJyB9LFxufTtcblxuY29uc3QgVEVTVF9VVUlEID0gJzExMTExMTExLTIyMjItMzMzMy00NDQ0LTU1NTU1NTU1NTU1NSc7XG5cbmZ1bmN0aW9uIG1ha2VNZXNzYWdlKG1vZGVsOiBzdHJpbmcpOiBBbnRocm9waWMuTWVzc2FnZSB7XG5cdHJldHVybiB7XG5cdFx0aWQ6ICdtc2dfaW50X3Rlc3QnLFxuXHRcdHR5cGU6ICdtZXNzYWdlJyxcblx0XHRyb2xlOiAnYXNzaXN0YW50Jyxcblx0XHRtb2RlbCxcblx0XHRjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICcnLCBjaXRhdGlvbnM6IG51bGwgfV0sXG5cdFx0c3RvcF9yZWFzb246ICdlbmRfdHVybicsXG5cdFx0c3RvcF9zZXF1ZW5jZTogbnVsbCxcblx0XHRzdG9wX2RldGFpbHM6IG51bGwsXG5cdFx0Y29udGFpbmVyOiBudWxsLFxuXHRcdHVzYWdlOiB7XG5cdFx0XHRpbnB1dF90b2tlbnM6IDEsXG5cdFx0XHRvdXRwdXRfdG9rZW5zOiAxLFxuXHRcdFx0Y2FjaGVfY3JlYXRpb246IG51bGwsXG5cdFx0XHRjYWNoZV9jcmVhdGlvbl9pbnB1dF90b2tlbnM6IG51bGwsXG5cdFx0XHRjYWNoZV9yZWFkX2lucHV0X3Rva2VuczogbnVsbCxcblx0XHRcdGluZmVyZW5jZV9nZW86IG51bGwsXG5cdFx0XHRzZXJ2ZXJfdG9vbF91c2U6IG51bGwsXG5cdFx0XHRzZXJ2aWNlX3RpZXI6IG51bGwsXG5cdFx0fSxcblx0fTtcbn1cblxuLyoqIENhbm5lZCBBbnRocm9waWMgYE1lc3NhZ2VTdHJlYW1FdmVudGAgc2VxdWVuY2UgZm9yIHRoZSBgbWVzc2FnZXNgIHN0dWIuICovXG5mdW5jdGlvbiBtYWtlQ2FubmVkU3RyZWFtKG1vZGVsOiBzdHJpbmcpOiBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50W10ge1xuXHRjb25zdCBtZXNzYWdlID0gbWFrZU1lc3NhZ2UobW9kZWwpO1xuXHRjb25zdCBjb250ZW50QmxvY2tTdGFydDogQW50aHJvcGljLlJhd0NvbnRlbnRCbG9ja1N0YXJ0RXZlbnQgPSB7XG5cdFx0dHlwZTogJ2NvbnRlbnRfYmxvY2tfc3RhcnQnLFxuXHRcdGluZGV4OiAwLFxuXHRcdGNvbnRlbnRfYmxvY2s6IHsgdHlwZTogJ3RleHQnLCB0ZXh0OiAnJywgY2l0YXRpb25zOiBbXSB9LFxuXHR9O1xuXHRjb25zdCBjb250ZW50QmxvY2tEZWx0YTogQW50aHJvcGljLlJhd0NvbnRlbnRCbG9ja0RlbHRhRXZlbnQgPSB7XG5cdFx0dHlwZTogJ2NvbnRlbnRfYmxvY2tfZGVsdGEnLFxuXHRcdGluZGV4OiAwLFxuXHRcdGRlbHRhOiB7IHR5cGU6ICd0ZXh0X2RlbHRhJywgdGV4dDogJ2hlbGxvJyB9LFxuXHR9O1xuXHRjb25zdCBtZXNzYWdlRGVsdGE6IEFudGhyb3BpYy5SYXdNZXNzYWdlRGVsdGFFdmVudCA9IHtcblx0XHR0eXBlOiAnbWVzc2FnZV9kZWx0YScsXG5cdFx0ZGVsdGE6IHsgc3RvcF9yZWFzb246ICdlbmRfdHVybicsIHN0b3Bfc2VxdWVuY2U6IG51bGwsIHN0b3BfZGV0YWlsczogbnVsbCwgY29udGFpbmVyOiBudWxsIH0sXG5cdFx0dXNhZ2U6IHtcblx0XHRcdGlucHV0X3Rva2VuczogMSxcblx0XHRcdG91dHB1dF90b2tlbnM6IDEsXG5cdFx0XHRjYWNoZV9jcmVhdGlvbl9pbnB1dF90b2tlbnM6IG51bGwsXG5cdFx0XHRjYWNoZV9yZWFkX2lucHV0X3Rva2VuczogbnVsbCxcblx0XHRcdHNlcnZlcl90b29sX3VzZTogbnVsbCxcblx0XHR9LFxuXHR9O1xuXHRyZXR1cm4gW1xuXHRcdHsgdHlwZTogJ21lc3NhZ2Vfc3RhcnQnLCBtZXNzYWdlIH0sXG5cdFx0Y29udGVudEJsb2NrU3RhcnQsXG5cdFx0Y29udGVudEJsb2NrRGVsdGEsXG5cdFx0eyB0eXBlOiAnY29udGVudF9ibG9ja19zdG9wJywgaW5kZXg6IDAgfSxcblx0XHRtZXNzYWdlRGVsdGEsXG5cdFx0eyB0eXBlOiAnbWVzc2FnZV9zdG9wJyB9LFxuXHRdO1xufVxuXG5mdW5jdGlvbiBtYWtlU3lzdGVtSW5pdE1lc3NhZ2Uoc2Vzc2lvbklkOiBzdHJpbmcpOiBTREtTeXN0ZW1NZXNzYWdlIHtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiAnc3lzdGVtJyxcblx0XHRzdWJ0eXBlOiAnaW5pdCcsXG5cdFx0YXBpS2V5U291cmNlOiAndXNlcicsXG5cdFx0Y2xhdWRlX2NvZGVfdmVyc2lvbjogJzAuMC4wLXRlc3QnLFxuXHRcdGN3ZDogJy93b3Jrc3BhY2UnLFxuXHRcdHRvb2xzOiBbXSxcblx0XHRtY3Bfc2VydmVyczogW10sXG5cdFx0bW9kZWw6ICdjbGF1ZGUtdGVzdCcsXG5cdFx0cGVybWlzc2lvbk1vZGU6ICdkZWZhdWx0Jyxcblx0XHRzbGFzaF9jb21tYW5kczogW10sXG5cdFx0b3V0cHV0X3N0eWxlOiAnZGVmYXVsdCcsXG5cdFx0c2tpbGxzOiBbXSxcblx0XHRwbHVnaW5zOiBbXSxcblx0XHR1dWlkOiBURVNUX1VVSUQsXG5cdFx0c2Vzc2lvbl9pZDogc2Vzc2lvbklkLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlUmVzdWx0U3VjY2VzcyhzZXNzaW9uSWQ6IHN0cmluZyk6IFNES1Jlc3VsdFN1Y2Nlc3Mge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6ICdyZXN1bHQnLFxuXHRcdHN1YnR5cGU6ICdzdWNjZXNzJyxcblx0XHRkdXJhdGlvbl9tczogMCxcblx0XHRkdXJhdGlvbl9hcGlfbXM6IDAsXG5cdFx0aXNfZXJyb3I6IGZhbHNlLFxuXHRcdG51bV90dXJuczogMSxcblx0XHRyZXN1bHQ6ICcnLFxuXHRcdHN0b3BfcmVhc29uOiAnZW5kX3R1cm4nLFxuXHRcdHRvdGFsX2Nvc3RfdXNkOiAwLFxuXHRcdHVzYWdlOiB7XG5cdFx0XHRjYWNoZV9jcmVhdGlvbjogeyBlcGhlbWVyYWxfMWhfaW5wdXRfdG9rZW5zOiAwLCBlcGhlbWVyYWxfNW1faW5wdXRfdG9rZW5zOiAwIH0sXG5cdFx0XHRjYWNoZV9jcmVhdGlvbl9pbnB1dF90b2tlbnM6IDAsXG5cdFx0XHRjYWNoZV9yZWFkX2lucHV0X3Rva2VuczogMCxcblx0XHRcdGluZmVyZW5jZV9nZW86ICd1bmtub3duJyxcblx0XHRcdGlucHV0X3Rva2VuczogMCxcblx0XHRcdGl0ZXJhdGlvbnM6IFtdLFxuXHRcdFx0b3V0cHV0X3Rva2VuczogMCxcblx0XHRcdHNlcnZlcl90b29sX3VzZTogeyB3ZWJfZmV0Y2hfcmVxdWVzdHM6IDAsIHdlYl9zZWFyY2hfcmVxdWVzdHM6IDAgfSxcblx0XHRcdHNlcnZpY2VfdGllcjogJ3N0YW5kYXJkJyxcblx0XHRcdHNwZWVkOiAnc3RhbmRhcmQnLFxuXHRcdH0sXG5cdFx0bW9kZWxVc2FnZToge30sXG5cdFx0cGVybWlzc2lvbl9kZW5pYWxzOiBbXSxcblx0XHR1dWlkOiBURVNUX1VVSUQsXG5cdFx0c2Vzc2lvbl9pZDogc2Vzc2lvbklkLFxuXHR9O1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gU3R1YmJlZCBDQVBJXG5cbmNsYXNzIFN0dWJDb3BpbG90QXBpU2VydmljZSBpbXBsZW1lbnRzIElDb3BpbG90QXBpU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHN0cmVhbUV2ZW50czogQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudFtdID0gW107XG5cdGF2YWlsYWJsZU1vZGVsczogQ0NBTW9kZWxbXSA9IFtBTlRIUk9QSUNfTU9ERUxdO1xuXG5cdHJlYWRvbmx5IG1lc3NhZ2VzQ2FsbENvdW50ID0geyBjb3VudDogMCB9O1xuXG5cdGFzeW5jIHJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCgpIHsgcmV0dXJuIHsgcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IGZhbHNlLCB0cmFja2luZ0lkOiB1bmRlZmluZWQsIHRlbGVtZXRyeUVuZHBvaW50OiB1bmRlZmluZWQgfTsgfVxuXHRhc3luYyByZXNvbHZlQXBpRW5kcG9pbnQoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRtZXNzYWdlcyhcblx0XHR0b2tlbjogc3RyaW5nLFxuXHRcdHJlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zU3RyZWFtaW5nLFxuXHRcdG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcblx0KTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD47XG5cdG1lc3NhZ2VzKFxuXHRcdHRva2VuOiBzdHJpbmcsXG5cdFx0cmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNOb25TdHJlYW1pbmcsXG5cdFx0b3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPjtcblx0bWVzc2FnZXMoXG5cdFx0dG9rZW46IHN0cmluZyxcblx0XHRyZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtcyxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+IHwgUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZT4ge1xuXHRcdHRoaXMubWVzc2FnZXNDYWxsQ291bnQuY291bnQrKztcblx0XHRpZiAocmVxdWVzdC5zdHJlYW0pIHtcblx0XHRcdHJldHVybiB0aGlzLl9zdHJlYW0ob3B0aW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ25vbi1zdHJlYW1pbmcgbm90IHVzZWQgaW4gaW50ZWdyYXRpb24gdGVzdCcpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgKl9zdHJlYW0oXG5cdFx0b3B0aW9uczogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdCk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+IHtcblx0XHRmb3IgKGNvbnN0IGV2IG9mIHRoaXMuc3RyZWFtRXZlbnRzKSB7XG5cdFx0XHRpZiAob3B0aW9ucz8uc2lnbmFsPy5hYm9ydGVkKSB7XG5cdFx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignQWJvcnRlZCcpO1xuXHRcdFx0XHQoZXJyIGFzIHsgbmFtZTogc3RyaW5nIH0pLm5hbWUgPSAnQWJvcnRFcnJvcic7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHRcdHlpZWxkIGV2O1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNvdW50VG9rZW5zKCk6IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2VUb2tlbnNDb3VudD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignY291bnRUb2tlbnMgbm90IHVzZWQgaW4gaW50ZWdyYXRpb24gdGVzdCcpO1xuXHR9XG5cblx0YXN5bmMgbW9kZWxzKCk6IFByb21pc2U8Q0NBTW9kZWxbXT4ge1xuXHRcdHJldHVybiB0aGlzLmF2YWlsYWJsZU1vZGVscztcblx0fVxuXG5cdGFzeW5jIHJlc3BvbnNlcygpOiBQcm9taXNlPFJlc3BvbnNlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdyZXNwb25zZXMgbm90IHVzZWQgaW4gQ2xhdWRlIGludGVncmF0aW9uIHRlc3RzJyk7XG5cdH1cblxuXHRhc3luYyB1dGlsaXR5Q2hhdENvbXBsZXRpb24oKTogUHJvbWlzZTxuZXZlcj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcigndXRpbGl0eUNoYXRDb21wbGV0aW9uIG5vdCB1c2VkIGluIENsYXVkZSBpbnRlZ3JhdGlvbiB0ZXN0cycpO1xuXHR9XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBSZWNvcmRpbmcgU0RLIHNlcnZpY2UgdGhhdCByb3VuZC10cmlwcyB0aHJvdWdoIHRoZSByZWFsIHByb3h5XG5cbmludGVyZmFjZSBJUHJveHlSb3VuZFRyaXBSZXN1bHQge1xuXHRyZWFkb25seSBzdGF0dXM6IG51bWJlcjtcblx0cmVhZG9ubHkgY29udGVudFR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZXZlbnRzOiByZWFkb25seSB7IHJlYWRvbmx5IHR5cGU6IHN0cmluZzsgcmVhZG9ubHkgZGF0YTogdW5rbm93biB9W107XG59XG5cbi8qKlxuICogTWFya2VyIGVudHJ5IHRoZSB0ZXN0IGNhbiBpbnRlcmxlYXZlIGluc2lkZVxuICoge0BsaW5rIFByb3h5Um91bmRUcmlwU2RrU2VydmljZS5xdWVyeU1lc3NhZ2VzfSBiZXR3ZWVuIFNESyBtZXNzYWdlcy5cbiAqIFdoZW4ge0BsaW5rIFJvdW5kVHJpcFF1ZXJ5Lm5leHR9IGVuY291bnRlcnMgYSBtYXJrZXIsIGl0IGludm9rZXMgdGhlXG4gKiBjYXB0dXJlZCB7QGxpbmsgT3B0aW9ucy5jYW5Vc2VUb29sfSBjbG9zdXJlIGFuZCB3YWl0cyBmb3IgaXQgdG9cbiAqIHJlc29sdmUgYmVmb3JlIHByb2NlZWRpbmcgdG8gdGhlIG5leHQgZW50cnksIG1pcnJvcmluZyB0aGUgcmVhbCBTREtcbiAqIHN1YnByb2Nlc3MncyBiZWhhdmlvdXIgYXJvdW5kIGFuIGFzc2lzdGFudCBgdG9vbF91c2VgIFx1MjE5MiBzeW50aGV0aWNcbiAqIHVzZXIgYHRvb2xfcmVzdWx0YCByb3VuZC10cmlwLlxuICovXG5pbnRlcmZhY2UgQ2FuVXNlVG9vbE1hcmtlciB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdjYW5Vc2VUb29sJztcblx0cmVhZG9ubHkgdG9vbE5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaW5wdXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRyZWFkb25seSB0b29sVXNlSUQ6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEVsaWNpdGF0aW9uTWFya2VyIHtcblx0cmVhZG9ubHkga2luZDogJ2VsaWNpdGF0aW9uJztcblx0cmVhZG9ubHkgcmVxdWVzdDogUGFyYW1ldGVyczxOb25OdWxsYWJsZTxPcHRpb25zWydvbkVsaWNpdGF0aW9uJ10+PlswXTtcbn1cblxudHlwZSBRdWVyeVN0cmVhbUl0ZW0gPSBTREtNZXNzYWdlIHwgQ2FuVXNlVG9vbE1hcmtlciB8IEVsaWNpdGF0aW9uTWFya2VyO1xuXG5mdW5jdGlvbiBpc0NhblVzZVRvb2xNYXJrZXIoaXRlbTogUXVlcnlTdHJlYW1JdGVtKTogaXRlbSBpcyBDYW5Vc2VUb29sTWFya2VyIHtcblx0cmV0dXJuIChpdGVtIGFzIENhblVzZVRvb2xNYXJrZXIpLmtpbmQgPT09ICdjYW5Vc2VUb29sJztcbn1cblxuZnVuY3Rpb24gaXNFbGljaXRhdGlvbk1hcmtlcihpdGVtOiBRdWVyeVN0cmVhbUl0ZW0pOiBpdGVtIGlzIEVsaWNpdGF0aW9uTWFya2VyIHtcblx0cmV0dXJuIChpdGVtIGFzIEVsaWNpdGF0aW9uTWFya2VyKS5raW5kID09PSAnZWxpY2l0YXRpb24nO1xufVxuXG4vKipcbiAqIFRlc3QgZG91YmxlIGZvciB7QGxpbmsgSUNsYXVkZUFnZW50U2RrU2VydmljZX0uIE9uIGBzdGFydHVwKClgLCBwZXJmb3Jtc1xuICogYSByZWFsIEhUVFAgYFBPU1QgL3YxL21lc3NhZ2VzYCBhZ2FpbnN0IHRoZSBwcm94eSBVUkwgdGhlIGFnZW50IHBhc3NlZFxuICogdmlhIGBPcHRpb25zLnNldHRpbmdzLmVudmAsIHVzaW5nIHRoZSBiZWFyZXIgdGhlIGFnZW50IGNvbnN0cnVjdGVkLlxuICogVGhpcyBzdGFuZHMgaW4gZm9yIHRoZSBTREsgc3VicHJvY2VzcydzIGZpcnN0IG1vZGVsIGNhbGwgc28gd2UgY2FuXG4gKiBhc3NlcnQgdGhlIGFnZW50IFx1MjE5MiBwcm94eSBcdTIxOTIgQ0FQSSByb3VuZC10cmlwIHdvcmtzIHdpdGhvdXQgZm9ya2luZ1xuICogYEBhbnRocm9waWMtYWkvY2xhdWRlLWFnZW50LXNka2AncyBidW5kbGVkIENMSS5cbiAqL1xuY2xhc3MgUHJveHlSb3VuZFRyaXBTZGtTZXJ2aWNlIGltcGxlbWVudHMgSUNsYXVkZUFnZW50U2RrU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGNhcHR1cmVkU3RhcnR1cE9wdGlvbnM6IE9wdGlvbnNbXSA9IFtdO1xuXHRyZWFkb25seSBwcm94eVJvdW5kVHJpcHM6IElQcm94eVJvdW5kVHJpcFJlc3VsdFtdID0gW107XG5cblx0LyoqXG5cdCAqIEl0ZW1zIHRoZSBwcm9kdWNlZCBXYXJtUXVlcnkncyBRdWVyeSB3aWxsIHlpZWxkIGluIG9yZGVyLiBTREtcblx0ICogbWVzc2FnZXMgZmxvdyB0aHJvdWdoIHVuY2hhbmdlZDsge0BsaW5rIENhblVzZVRvb2xNYXJrZXJ9IGVudHJpZXNcblx0ICogcGF1c2UgdGhlIGl0ZXJhdG9yIGFuZCBpbnZva2UgdGhlIGNhcHR1cmVkXG5cdCAqIGBPcHRpb25zLmNhblVzZVRvb2xgIGNsb3N1cmUgKG1pcnJvcmluZyB3aGF0IHRoZSByZWFsIFNES1xuXHQgKiBzdWJwcm9jZXNzIGRvZXMgYmV0d2VlbiBhc3Npc3RhbnQgYHRvb2xfdXNlYCBhbmQgdGhlIHN5bnRoZXRpY1xuXHQgKiBgdXNlcmAgYHRvb2xfcmVzdWx0YCBpdCBmb2xsb3dzIHVwIHdpdGgpLlxuXHQgKi9cblx0cXVlcnlNZXNzYWdlczogUXVlcnlTdHJlYW1JdGVtW10gPSBbXTtcblxuXHQvKiogUmVjb3JkcyB0aGUge0BsaW5rIFBlcm1pc3Npb25SZXN1bHR9IHJldHVybmVkIGJ5IGVhY2ggYGNhblVzZVRvb2xgIGludm9jYXRpb24gaW4ge0BsaW5rIHF1ZXJ5TWVzc2FnZXN9IG9yZGVyLiAqL1xuXHRyZWFkb25seSBjYW5Vc2VUb29sUmVzdWx0czogKFBlcm1pc3Npb25SZXN1bHQgfCBudWxsKVtdID0gW107XG5cdHJlYWRvbmx5IGVsaWNpdGF0aW9uUmVzdWx0czogQXdhaXRlZDxSZXR1cm5UeXBlPE5vbk51bGxhYmxlPE9wdGlvbnNbJ29uRWxpY2l0YXRpb24nXT4+PltdID0gW107XG5cblx0cmVhZG9ubHkgd2FybVF1ZXJpZXM6IFJvdW5kVHJpcFdhcm1RdWVyeVtdID0gW107XG5cblx0YXN5bmMgbGlzdFNlc3Npb25zKCk6IFByb21pc2U8cmVhZG9ubHkgU0RLU2Vzc2lvbkluZm9bXT4ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIGNhbkxvYWRXaXRob3V0RG93bmxvYWQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyBlbnN1cmVBdmFpbGFibGVGb3JEaXNjb3ZlcnkoKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRhc3luYyBnZXRTZXNzaW9uSW5mbyhfc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPFNES1Nlc3Npb25JbmZvIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGdldFNlc3Npb25NZXNzYWdlcyhfc2Vzc2lvbklkOiBzdHJpbmcsIF9vcHRpb25zPzogR2V0U2Vzc2lvbk1lc3NhZ2VzT3B0aW9ucyk6IFByb21pc2U8cmVhZG9ubHkgU2Vzc2lvbk1lc3NhZ2VbXT4ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIGxpc3RTdWJhZ2VudHMoX3Nlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBzdHJpbmdbXT4ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIGdldFN1YmFnZW50TWVzc2FnZXMoX3Nlc3Npb25JZDogc3RyaW5nLCBfYWdlbnRJZDogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBTZXNzaW9uTWVzc2FnZVtdPiB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0YXN5bmMgZm9ya1Nlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHsgc2Vzc2lvbklkOiBzdHJpbmcgfT4ge1xuXHRcdHJldHVybiB7IHNlc3Npb25JZDogYGZvcmtlZC0ke3Nlc3Npb25JZH1gIH07XG5cdH1cblxuXHRhc3luYyBkZWxldGVTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4geyAvKiBub3QgZXhlcmNpc2VkIGJ5IHRoZSBwcm94eSByb3VuZC10cmlwICovIH1cblxuXHRhc3luYyBjcmVhdGVTZGtNY3BTZXJ2ZXIoKTogUHJvbWlzZTxuZXZlcj4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCBpbiBpbnRlZ3JhdGlvbiB0ZXN0IGZha2UnKTsgfVxuXHRhc3luYyB0b29sKCk6IFByb21pc2U8bmV2ZXI+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQgaW4gaW50ZWdyYXRpb24gdGVzdCBmYWtlJyk7IH1cblxuXHRhc3luYyBxdWVyeShfcGFyYW1zOiB7IHByb21wdDogc3RyaW5nIHwgQXN5bmNJdGVyYWJsZTxTREtVc2VyTWVzc2FnZT47IG9wdGlvbnM/OiBPcHRpb25zIH0pOiBQcm9taXNlPFF1ZXJ5PiB7IHRocm93IG5ldyBFcnJvcigncXVlcnkgbm90IHVzZWQgaW4gcHJveHkgcm91bmQtdHJpcCBpbnRlZ3JhdGlvbiB0ZXN0Jyk7IH1cblxuXHRhc3luYyBzdGFydHVwKHBhcmFtczogeyBvcHRpb25zOiBPcHRpb25zOyBpbml0aWFsaXplVGltZW91dE1zPzogbnVtYmVyIH0pOiBQcm9taXNlPFdhcm1RdWVyeT4ge1xuXHRcdHRoaXMuY2FwdHVyZWRTdGFydHVwT3B0aW9ucy5wdXNoKHBhcmFtcy5vcHRpb25zKTtcblx0XHRjb25zdCBzZXR0aW5ncyA9IHBhcmFtcy5vcHRpb25zLnNldHRpbmdzO1xuXHRcdGNvbnN0IHNldHRpbmdzRW52ID0gKHNldHRpbmdzICYmIHR5cGVvZiBzZXR0aW5ncyA9PT0gJ29iamVjdCcgJiYgc2V0dGluZ3MuZW52KSA/IHNldHRpbmdzLmVudiA6IHt9O1xuXHRcdGNvbnN0IGJhc2VVcmwgPSBzZXR0aW5nc0VudlsnQU5USFJPUElDX0JBU0VfVVJMJ107XG5cdFx0Y29uc3QgYmVhcmVyID0gc2V0dGluZ3NFbnZbJ0FOVEhST1BJQ19BVVRIX1RPS0VOJ107XG5cdFx0aWYgKCFiYXNlVXJsIHx8ICFiZWFyZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQU5USFJPUElDX0JBU0VfVVJMIC8gQU5USFJPUElDX0FVVEhfVE9LRU4gbWlzc2luZyBmcm9tIHNldHRpbmdzLmVudicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBvc3RTc2VUb1Byb3h5KGAke2Jhc2VVcmx9L3YxL21lc3NhZ2VzYCwgYmVhcmVyLCB7XG5cdFx0XHRtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsXG5cdFx0XHRtZXNzYWdlczogW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnaGknIH1dLFxuXHRcdFx0c3RyZWFtOiB0cnVlLFxuXHRcdFx0bWF4X3Rva2VuczogNDA5Nixcblx0XHR9KTtcblx0XHR0aGlzLnByb3h5Um91bmRUcmlwcy5wdXNoKHJlc3VsdCk7XG5cblx0XHRjb25zdCB3YXJtID0gbmV3IFJvdW5kVHJpcFdhcm1RdWVyeSh0aGlzKTtcblx0XHR0aGlzLndhcm1RdWVyaWVzLnB1c2god2FybSk7XG5cdFx0cmV0dXJuIHdhcm07XG5cdH1cbn1cblxuY2xhc3MgUm91bmRUcmlwV2FybVF1ZXJ5IGltcGxlbWVudHMgV2FybVF1ZXJ5IHtcblx0YXN5bmNEaXNwb3NlQ291bnQgPSAwO1xuXHRjbG9zZUNvdW50ID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9zZGs6IFByb3h5Um91bmRUcmlwU2RrU2VydmljZSkgeyB9XG5cblx0cXVlcnkocHJvbXB0OiBzdHJpbmcgfCBBc3luY0l0ZXJhYmxlPFNES1VzZXJNZXNzYWdlPik6IFF1ZXJ5IHtcblx0XHRpZiAodHlwZW9mIHByb21wdCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignaW50ZWdyYXRpb24gdGVzdDogYWdlbnQgaG9zdCBhbHdheXMgcGFzc2VzIGFuIEFzeW5jSXRlcmFibGUnKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSb3VuZFRyaXBRdWVyeShwcm9tcHQsIHRoaXMuX3Nkayk7XG5cdH1cblxuXHRjbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNsb3NlQ291bnQrKztcblx0fVxuXG5cdGFzeW5jIFtTeW1ib2wuYXN5bmNEaXNwb3NlXSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmFzeW5jRGlzcG9zZUNvdW50Kys7XG5cdH1cbn1cblxuY2xhc3MgUm91bmRUcmlwUXVlcnkgaW1wbGVtZW50cyBBc3luY0dlbmVyYXRvcjxTREtNZXNzYWdlLCB2b2lkPiB7XG5cdHByaXZhdGUgX2luZGV4ID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfZHJhaW5lcjogUHJvbWlzZTx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcihwcm9tcHQ6IEFzeW5jSXRlcmFibGU8U0RLVXNlck1lc3NhZ2U+LCBwcml2YXRlIHJlYWRvbmx5IF9zZGs6IFByb3h5Um91bmRUcmlwU2RrU2VydmljZSkge1xuXHRcdC8vIERyYWluIHRoZSBwcm9tcHQgaXRlcmFibGUgaW4gdGhlIGJhY2tncm91bmQgc28gdGhlIGFnZW50J3Ncblx0XHQvLyBgX3BlbmRpbmdQcm9tcHREZWZlcnJlZC5jb21wbGV0ZSgpYCBhY3R1YWxseSBwdW1wcyB0aGUgcXVldWUuXG5cdFx0Y29uc3QgaXQgPSBwcm9tcHRbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCk7XG5cdFx0dGhpcy5fZHJhaW5lciA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjb25zdCByID0gYXdhaXQgaXQubmV4dCgpO1xuXHRcdFx0XHRpZiAoci5kb25lKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkoKTtcblx0fVxuXG5cdFtTeW1ib2wuYXN5bmNJdGVyYXRvcl0oKTogQXN5bmNHZW5lcmF0b3I8U0RLTWVzc2FnZSwgdm9pZD4ge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0YXN5bmMgbmV4dCgpOiBQcm9taXNlPEl0ZXJhdG9yUmVzdWx0PFNES01lc3NhZ2UsIHZvaWQ+PiB7XG5cdFx0d2hpbGUgKHRoaXMuX2luZGV4IDwgdGhpcy5fc2RrLnF1ZXJ5TWVzc2FnZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gdGhpcy5fc2RrLnF1ZXJ5TWVzc2FnZXNbdGhpcy5faW5kZXgrK107XG5cdFx0XHRpZiAoaXNDYW5Vc2VUb29sTWFya2VyKGl0ZW0pKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0dXAgPSB0aGlzLl9zZGsuY2FwdHVyZWRTdGFydHVwT3B0aW9uc1swXTtcblx0XHRcdFx0aWYgKCFzdGFydHVwPy5jYW5Vc2VUb29sKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdpbnRlZ3JhdGlvbiB0ZXN0OiBjYW5Vc2VUb29sIG1hcmtlciBidXQgT3B0aW9ucy5jYW5Vc2VUb29sIG5vdCB3aXJlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN0YXJ0dXAuY2FuVXNlVG9vbChpdGVtLnRvb2xOYW1lLCBpdGVtLmlucHV0LCB7XG5cdFx0XHRcdFx0c2lnbmFsOiBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsLFxuXHRcdFx0XHRcdHRvb2xVc2VJRDogaXRlbS50b29sVXNlSUQsXG5cdFx0XHRcdFx0cmVxdWVzdElkOiBpdGVtLnRvb2xVc2VJRCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX3Nkay5jYW5Vc2VUb29sUmVzdWx0cy5wdXNoKHJlc3VsdCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzRWxpY2l0YXRpb25NYXJrZXIoaXRlbSkpIHtcblx0XHRcdFx0Y29uc3Qgc3RhcnR1cCA9IHRoaXMuX3Nkay5jYXB0dXJlZFN0YXJ0dXBPcHRpb25zWzBdO1xuXHRcdFx0XHRpZiAoIXN0YXJ0dXA/Lm9uRWxpY2l0YXRpb24pIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ludGVncmF0aW9uIHRlc3Q6IGVsaWNpdGF0aW9uIG1hcmtlciBidXQgT3B0aW9ucy5vbkVsaWNpdGF0aW9uIG5vdCB3aXJlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN0YXJ0dXAub25FbGljaXRhdGlvbihpdGVtLnJlcXVlc3QsIHsgc2lnbmFsOiBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsIH0pO1xuXHRcdFx0XHR0aGlzLl9zZGsuZWxpY2l0YXRpb25SZXN1bHRzLnB1c2gocmVzdWx0KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBkb25lOiBmYWxzZSwgdmFsdWU6IGl0ZW0gfTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZHJhaW5lcjtcblx0XHRyZXR1cm4geyBkb25lOiB0cnVlLCB2YWx1ZTogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRhc3luYyByZXR1cm4oKTogUHJvbWlzZTxJdGVyYXRvclJlc3VsdDxTREtNZXNzYWdlLCB2b2lkPj4ge1xuXHRcdHJldHVybiB7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfTtcblx0fVxuXG5cdGFzeW5jIHRocm93KGVycjogdW5rbm93bik6IFByb21pc2U8SXRlcmF0b3JSZXN1bHQ8U0RLTWVzc2FnZSwgdm9pZD4+IHtcblx0XHR0aHJvdyBlcnI7XG5cdH1cblxuXHRhc3luYyBpbnRlcnJ1cHQoKTogUHJvbWlzZTxTREtDb250cm9sSW50ZXJydXB0UmVzcG9uc2UgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdHNldFBlcm1pc3Npb25Nb2RlKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHNldE1jcFBlcm1pc3Npb25Nb2RlT3ZlcnJpZGUoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0c2V0TW9kZWwoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0c2V0TWF4VGhpbmtpbmdUb2tlbnMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0YXBwbHlGbGFnU2V0dGluZ3MoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0aW5pdGlhbGl6YXRpb25SZXN1bHQoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0cmVpbml0aWFsaXplKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHN1cHBvcnRlZENvbW1hbmRzKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHN1cHBvcnRlZE1vZGVscygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzdXBwb3J0ZWRBZ2VudHMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0bWNwU2VydmVyU3RhdHVzKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdGdldENvbnRleHRVc2FnZSgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHR1c2FnZV9FWFBFUklNRU5UQUxfTUFZX0NIQU5HRV9ET19OT1RfUkVMWV9PTl9USElTX0FQSV9ZRVQoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0cmVsb2FkUGx1Z2lucygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRhY2NvdW50SW5mbygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRyZXdpbmRGaWxlcygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRyZWFkRmlsZSgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzZWVkUmVhZFN0YXRlKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHJlY29ubmVjdE1jcFNlcnZlcigpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHR0b2dnbGVNY3BTZXJ2ZXIoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0c2V0TWNwU2VydmVycygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzdHJlYW1JbnB1dCgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzdG9wVGFzaygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRyZWxvYWRTa2lsbHMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0YmFja2dyb3VuZFRhc2tzKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdGNsb3NlKCk6IHZvaWQgeyAvKiBuby1vcCAqLyB9XG5cdFtTeW1ib2wuYXN5bmNEaXNwb3NlXSgpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBIVFRQIGhlbHBlcnNcblxubGV0IF9odHRwTW9kdWxlOiB0eXBlb2YgaHR0cCB8IHVuZGVmaW5lZDtcbmFzeW5jIGZ1bmN0aW9uIGdldEh0dHAoKTogUHJvbWlzZTx0eXBlb2YgaHR0cD4ge1xuXHRpZiAoIV9odHRwTW9kdWxlKSB7XG5cdFx0X2h0dHBNb2R1bGUgPSBhd2FpdCBpbXBvcnQoJ2h0dHAnKTtcblx0fVxuXHRyZXR1cm4gX2h0dHBNb2R1bGU7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBvc3RTc2VUb1Byb3h5KFxuXHR1cmw6IHN0cmluZyxcblx0YmVhcmVyOiBzdHJpbmcsXG5cdHBheWxvYWQ6IG9iamVjdCxcbik6IFByb21pc2U8SVByb3h5Um91bmRUcmlwUmVzdWx0PiB7XG5cdGNvbnN0IGh0dHBNb2QgPSBhd2FpdCBnZXRIdHRwKCk7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgdSA9IG5ldyBVUkwodXJsKTtcblx0XHRjb25zdCBib2R5ID0gSlNPTi5zdHJpbmdpZnkocGF5bG9hZCk7XG5cdFx0Y29uc3QgcmVxID0gaHR0cE1vZC5yZXF1ZXN0KHtcblx0XHRcdGhvc3RuYW1lOiB1Lmhvc3RuYW1lLFxuXHRcdFx0cG9ydDogdS5wb3J0LFxuXHRcdFx0cGF0aDogdS5wYXRobmFtZSArIHUuc2VhcmNoLFxuXHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2JlYXJlcn1gLFxuXHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHQnQ29udGVudC1MZW5ndGgnOiBCdWZmZXIuYnl0ZUxlbmd0aChib2R5KS50b1N0cmluZygpLFxuXHRcdFx0XHQnQWNjZXB0JzogJ3RleHQvZXZlbnQtc3RyZWFtJyxcblx0XHRcdFx0J2FudGhyb3BpYy12ZXJzaW9uJzogJzIwMjMtMDYtMDEnLFxuXHRcdFx0fSxcblx0XHR9LCByZXMgPT4ge1xuXHRcdFx0Y29uc3QgY2h1bmtzOiBCdWZmZXJbXSA9IFtdO1xuXHRcdFx0cmVzLm9uKCdkYXRhJywgYyA9PiBjaHVua3MucHVzaChCdWZmZXIuaXNCdWZmZXIoYykgPyBjIDogQnVmZmVyLmZyb20oYykpKTtcblx0XHRcdHJlcy5vbignZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByYXcgPSBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoJ3V0ZjgnKTtcblx0XHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdFx0c3RhdHVzOiByZXMuc3RhdHVzQ29kZSA/PyAwLFxuXHRcdFx0XHRcdGNvbnRlbnRUeXBlOiB0eXBlb2YgcmVzLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID09PSAnc3RyaW5nJyA/IHJlcy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRldmVudHM6IHBhcnNlU3NlRnJhbWVzKHJhdyksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXMub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHR9KTtcblx0XHRyZXEub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRyZXEud3JpdGUoYm9keSk7XG5cdFx0cmVxLmVuZCgpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gcGFyc2VTc2VGcmFtZXMocmF3OiBzdHJpbmcpOiB7IHR5cGU6IHN0cmluZzsgZGF0YTogdW5rbm93biB9W10ge1xuXHRjb25zdCBvdXQ6IHsgdHlwZTogc3RyaW5nOyBkYXRhOiB1bmtub3duIH1bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGJsb2NrIG9mIHJhdy5zcGxpdCgnXFxuXFxuJykpIHtcblx0XHRpZiAoIWJsb2NrLnRyaW0oKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGxldCBldmVudCA9ICcnO1xuXHRcdGxldCBkYXRhID0gJyc7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGJsb2NrLnNwbGl0KCdcXG4nKSkge1xuXHRcdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnZXZlbnQ6ICcpKSB7XG5cdFx0XHRcdGV2ZW50ID0gbGluZS5zbGljZSgnZXZlbnQ6ICcubGVuZ3RoKS50cmltKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmUuc3RhcnRzV2l0aCgnZGF0YTogJykpIHtcblx0XHRcdFx0ZGF0YSA9IGxpbmUuc2xpY2UoJ2RhdGE6ICcubGVuZ3RoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGV2ZW50ICYmIGRhdGEpIHtcblx0XHRcdGxldCBwYXJzZWQ6IHVua25vd247XG5cdFx0XHR0cnkgeyBwYXJzZWQgPSBKU09OLnBhcnNlKGRhdGEpOyB9IGNhdGNoIHsgcGFyc2VkID0gZGF0YTsgfVxuXHRcdFx0b3V0LnB1c2goeyB0eXBlOiBldmVudCwgZGF0YTogcGFyc2VkIH0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gb3V0O1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gU2Vzc2lvbiBoZWxwZXJzXG5cbi8qKlxuICogUHJvdmlzaW9ucyBhIHNlc3Npb24gdGhlIHdheSBBZ2VudCBIb3N0IGRvZXM6IHRoZSBob3N0IG1pbnRzIGJvdGggdGhlIHNlc3Npb25cbiAqIFVSSSBhbmQgdGhlIGNoYXQgVVJJIGl0IHN0YXJ0cyB0aGUgc2Vzc2lvbiB3aXRoLCBhbmQgY3JlYXRlcyB0aGVtIHRvZ2V0aGVyXG4gKiB0aHJvdWdoIHRoZSBzaW5nbGUgYElBZ2VudENoYXRzLmNyZWF0ZUNoYXRgIHNlYW0gd2l0aCB0aGUgc2Vzc2lvbidzIGNyZWF0ZVxuICogY29uZmlnIGZsYXR0ZW5lZCBvbnRvIHRoZSBjcmVhdGlvbiBvcHRpb25zLiBSZXR1cm5zIHRoZSBjaGF0IFVSSSBwbHVzIHRoZSBTREtcbiAqIGNvbnZlcnNhdGlvbiBpZCB0aGUgcHJvdmlkZXIgYm91bmQgdG8gaXQgXHUyMDE0IGluZGVwZW5kZW50IG9mIHRoZSBBSCBzZXNzaW9uIGlkIFx1MjAxNFxuICogd2hpY2ggdGhlc2UgdGVzdHMgbmVlZCB0byBzdGFnZSB0aGUgZmFrZSBTREsgdHJhbnNjcmlwdC5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihhZ2VudDogQ2xhdWRlQWdlbnQsIGNvbmZpZzogSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZyk6IFByb21pc2U8eyBzZXNzaW9uOiBVUkk7IGNoYXQ6IFVSSTsgc2Vzc2lvbklkOiBzdHJpbmcgfT4ge1xuXHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY2xhdWRlJywgZ2VuZXJhdGVVdWlkKCkpO1xuXHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpO1xuXHRjb25zdCBjcmVhdGVkID0gYXdhaXQgYWdlbnQuY2hhdHMuY3JlYXRlQ2hhdChjaGF0LCBjaGF0Q29udGV4dChjaGF0LCBzZXNzaW9uKSwge1xuXHRcdG1vZGVsOiBjb25maWcubW9kZWwsXG5cdFx0YWdlbnQ6IGNvbmZpZy5hZ2VudCxcblx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IGNvbmZpZy53b3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0Y29uZmlnOiBjb25maWcuY29uZmlnLFxuXHRcdGFjdGl2ZUNsaWVudDogY29uZmlnLmFjdGl2ZUNsaWVudCxcblx0XHRkZWZlckJhY2tpbmc6ICFjb25maWcuZm9yayAmJiAhY29uZmlnLmltcG9ydENvbnZlcnNhdGlvbixcblx0XHRpbXBvcnRDb252ZXJzYXRpb246IGNvbmZpZy5pbXBvcnRDb252ZXJzYXRpb24sXG5cdH0pO1xuXHRpZiAoIWNyZWF0ZWQ/LmJhY2tpbmdTZXNzaW9uKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBjaGF0IGJhY2tpbmcgbWV0YWRhdGEnKTtcblx0fVxuXHRyZXR1cm4geyBzZXNzaW9uLCBjaGF0LCBzZXNzaW9uSWQ6IEFnZW50U2Vzc2lvbi5pZChjcmVhdGVkLmJhY2tpbmdTZXNzaW9uKSB9O1xufVxuXG4vKipcbiAqIFRoZSBob3N0LW93bmVkIHtAbGluayBJQWdlbnRDaGF0Q29udGV4dH0gQWdlbnQgSG9zdCBzdGFtcHMgb24gZXZlcnkgYWRkcmVzc2VkXG4gKiBjaGF0IG9wZXJhdGlvbi4gQSBzZXNzaW9uLWJhY2tlZCBkZWZhdWx0IGNoYXQgaXMgc2NvcGVkIHRvIHRoZSBzZXNzaW9uXG4gKiByZXNvdXJjZSwgbWlycm9yaW5nIHRoZSBvcmNoZXN0cmF0b3IncyBvd24gY29udGV4dCBidWlsZGVyLlxuICovXG5mdW5jdGlvbiBjaGF0Q29udGV4dChjaGF0OiBVUkksIHNlc3Npb246IFVSSSk6IElBZ2VudENoYXRDb250ZXh0IHtcblx0cmV0dXJuIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBzZXNzaW9uLCByZXNvdXJjZTogc2Vzc2lvbiB9O1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gU3VpdGVcblxuc3VpdGUoJ0NsYXVkZUFnZW50IGludGVncmF0aW9uIChwcm94eS1iYWNrZWQpJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYWdlbnQgXHUyMTkyIHByb3h5IFx1MjE5MiBDQVBJIFx1MjE5MiBTU0UgXHUyMTkyIGFnZW50OiBlbmQtdG8tZW5kIHBpcGVsaW5lIHdpdGggcmVhbCBwcm94eSBhbmQgc3R1YmJlZCBDQVBJJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoaXMgaXMgdGhlIFBoYXNlIDYgXHUwMEE3NS4yIGludGVncmF0aW9uIHRlc3Q6IHJlYWwgQ2xhdWRlUHJveHlTZXJ2aWNlXG5cdFx0Ly8gKyByZWFsIENsYXVkZUFnZW50ICsgc3R1YmJlZCBJQ29waWxvdEFwaVNlcnZpY2UgKyByZWNvcmRpbmcgU0RLXG5cdFx0Ly8gc2VydmljZSB0aGF0IHBlcmZvcm1zIGEgcmVhbCBIVFRQIHJvdW5kLXRyaXAgb24gdGhlIHByb3h5IGZyb21cblx0XHQvLyBpbnNpZGUgYHN0YXJ0dXAoKWAuIENhdGNoZXMgcmVncmVzc2lvbnMgaW4gYW55IG9mOlxuXHRcdC8vICAgLSBBZ2VudCdzIGBPcHRpb25zLnNldHRpbmdzLmVudmAgd2lyaW5nIChCQVNFX1VSTCAvIEFVVEhfVE9LRU4pLlxuXHRcdC8vICAgLSBQcm94eSdzIGBCZWFyZXIgPG5vbmNlPi48c2Vzc2lvbklkPmAgcGFyc2VyLlxuXHRcdC8vICAgLSBQcm94eSdzIG1vZGVsLWlkIHJld3JpdGUgKFNESyBcdTIxOTQgZW5kcG9pbnQgZm9ybWF0KS5cblx0XHQvLyAgIC0gUHJveHkncyBTU0UgZnJhbWUgZW5jb2RpbmcuXG5cdFx0Ly8gICAtIEFnZW50J3MgYE9wdGlvbnMuZW52YCBzdHJpcCBjb250cmFjdC5cblx0XHRjb25zdCBjYXBpID0gbmV3IFN0dWJDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNhcGkuc3RyZWFtRXZlbnRzID0gbWFrZUNhbm5lZFN0cmVhbSgnY2xhdWRlLW9wdXMtNC42Jyk7XG5cblx0XHRjb25zdCByZWFsUHJveHkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENsYXVkZVByb3h5U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY2FwaSkpO1xuXHRcdGNvbnN0IHNkayA9IG5ldyBQcm94eVJvdW5kVHJpcFNka1NlcnZpY2UoKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTG9nU2VydmljZSwgbG9nU2VydmljZV0sXG5cdFx0XHRbSUNvcGlsb3RBcGlTZXJ2aWNlLCBjYXBpXSxcblx0XHRcdFtJQ2xhdWRlUHJveHlTZXJ2aWNlLCByZWFsUHJveHldLFxuXHRcdFx0W0lTZXNzaW9uRGF0YVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSgpXSxcblx0XHRcdFtJQ2xhdWRlQWdlbnRTZGtTZXJ2aWNlLCBzZGtdLFxuXHRcdFx0W0lBZ2VudFBsdWdpbk1hbmFnZXIsIHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRiYXNlUGF0aDogVVJJLmZyb20oeyBzY2hlbWU6ICdpbm1lbW9yeScsIHBhdGg6ICcvYWdlbnRQbHVnaW5zJyB9KSxcblx0XHRcdFx0YXN5bmMgc3luY0N1c3RvbWl6YXRpb25zKF9jbGllbnRJZDogc3RyaW5nLCBfY3VzdG9taXphdGlvbnM6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSkgeyByZXR1cm4gW107IH0sXG5cdFx0XHR9XSxcblx0XHRcdFtJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlnU2VydmljZV0sXG5cdFx0XHRbSUFnZW50SG9zdE9UZWxTZXJ2aWNlLCBub29wT1RlbFNlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIHN0YXRlTWFuYWdlcl0sXG5cdFx0XHRbSUFnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbCwgZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTZXNzaW9uVGl0bGVTaWduYWwoc3RhdGVNYW5hZ2VyKSldLFxuXHRcdFx0W0lBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UsIGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UoKV0sXG5cdFx0XHRbSUFnZW50SG9zdEdpdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCldLFxuXHRcdFx0W0lBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSwgTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0VdLFxuXHRcdFx0W0lBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UsIGNyZWF0ZU5vb3BDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UoKV0sXG5cdFx0XHQuLi5jbGF1ZGVGaWxlRW52U2VydmljZXMoZGlzcG9zYWJsZXMpLFxuXHRcdCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VzKSk7XG5cdFx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2xhdWRlQWdlbnQpKTtcblxuXHRcdC8vIEF1dGhlbnRpY2F0ZSBcdTIwMTQgYm9vdHMgdGhlIHByb3h5IGFuZCBzbmFwc2hvdHMgdGhlIG1vZGVsIGxpc3QuXG5cdFx0Y29uc3QgYWNjZXB0ZWQgPSBhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoR0lUSFVCX0NPUElMT1RfUFJPVEVDVEVEX1JFU09VUkNFLnJlc291cmNlLCAnZ2gtaW50LXRlc3QtdG9rZW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWNjZXB0ZWQsIHRydWUpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgcHJvdmlzaW9uYWwgc2Vzc2lvbiBcdTIwMTQgbm8gU0RLIGNvbnRhY3QgeWV0LlxuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBjcmVhdGVTZXNzaW9uKGFnZW50LCB7IHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvaW50ZWdyYXRpb24tY3dkJyldIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZGsuY2FwdHVyZWRTdGFydHVwT3B0aW9ucy5sZW5ndGgsIDAsICdjcmVhdGVDaGF0IGRvZXMgbm90IHRvdWNoIHRoZSBTREsnKTtcblxuXHRcdC8vIFN0YWdlIGEgdHJhbnNjcmlwdCBvbiB0aGUgU0RLIHNvIGBzZW5kTWVzc2FnZWAgcmVzb2x2ZXMuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gY3JlYXRlZC5zZXNzaW9uSWQ7XG5cdFx0c2RrLnF1ZXJ5TWVzc2FnZXMgPSBbbWFrZVN5c3RlbUluaXRNZXNzYWdlKHNlc3Npb25JZCksIG1ha2VSZXN1bHRTdWNjZXNzKHNlc3Npb25JZCldO1xuXG5cdFx0Ly8gRmlyc3Qgc2VuZCBtYXRlcmlhbGl6ZXMgXHUyMDE0IGRyaXZlcyBgc3RhcnR1cCgpYCwgd2hpY2ggcGVyZm9ybXNcblx0XHQvLyB0aGUgcmVhbCBIVFRQIHJvdW5kLXRyaXAgb24gdGhlIHJlYWwgcHJveHkuXG5cdFx0YXdhaXQgYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoY3JlYXRlZC5jaGF0LCAnaGknLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ3R1cm4tMScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjaGF0Q29udGV4dChjcmVhdGVkLmNoYXQsIGNyZWF0ZWQuc2Vzc2lvbikpO1xuXG5cdFx0Ly8gU25hcHNob3Qgd2hhdCBmbG93ZWQgdGhyb3VnaCB0aGUgaW50ZWdyYXRpb24gaW4gYSBzaW5nbGVcblx0XHQvLyBhc3NlcnRpb24gc28gdGhlIGZhaWx1cmUgc3VyZmFjZSBpcyB0aGUgd2hvbGUgcGlwZWxpbmUuXG5cdFx0Y29uc3Qgc3RhcnR1cCA9IHNkay5jYXB0dXJlZFN0YXJ0dXBPcHRpb25zWzBdO1xuXHRcdGNvbnN0IHJvdW5kID0gc2RrLnByb3h5Um91bmRUcmlwc1swXTtcblx0XHRjb25zdCBzdGFydHVwU2V0dGluZ3MgPSBzdGFydHVwLnNldHRpbmdzO1xuXHRcdGNvbnN0IHNldHRpbmdzRW52ID0gKHN0YXJ0dXBTZXR0aW5ncyAmJiB0eXBlb2Ygc3RhcnR1cFNldHRpbmdzID09PSAnb2JqZWN0JyAmJiBzdGFydHVwU2V0dGluZ3MuZW52KSA/IHN0YXJ0dXBTZXR0aW5ncy5lbnYgOiB7fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0dXBDYWxsQ291bnQ6IHNkay5jYXB0dXJlZFN0YXJ0dXBPcHRpb25zLmxlbmd0aCxcblx0XHRcdHJvdW5kVHJpcENvdW50OiBzZGsucHJveHlSb3VuZFRyaXBzLmxlbmd0aCxcblx0XHRcdGNhcGlDYWxsQ291bnQ6IGNhcGkubWVzc2FnZXNDYWxsQ291bnQuY291bnQsXG5cdFx0XHRzdGFydHVwQ3dkOiBzdGFydHVwLmN3ZCxcblx0XHRcdHN0YXJ0dXBTZXNzaW9uSWQ6IHN0YXJ0dXAuc2Vzc2lvbklkLFxuXHRcdFx0c3RhcnR1cEV4ZWN1dGFibGU6IHN0YXJ0dXAuZXhlY3V0YWJsZSxcblx0XHRcdHN1YnByb2Nlc3NFbGVjdHJvblJ1bkFzTm9kZTogc3RhcnR1cC5lbnY/LlsnRUxFQ1RST05fUlVOX0FTX05PREUnXSxcblx0XHRcdHN1YnByb2Nlc3NOb2RlT3B0aW9uczogc3RhcnR1cC5lbnY/LlsnTk9ERV9PUFRJT05TJ10sXG5cdFx0XHRzdWJwcm9jZXNzQW50aHJvcGljQXBpS2V5OiBzdGFydHVwLmVudj8uWydBTlRIUk9QSUNfQVBJX0tFWSddLFxuXHRcdFx0c2V0dGluZ3NCYXNlVXJsSXNMb29wYmFjazogdHlwZW9mIHNldHRpbmdzRW52WydBTlRIUk9QSUNfQkFTRV9VUkwnXSA9PT0gJ3N0cmluZydcblx0XHRcdFx0JiYgc2V0dGluZ3NFbnZbJ0FOVEhST1BJQ19CQVNFX1VSTCddLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8xMjcuMC4wLjE6JyksXG5cdFx0XHRzZXR0aW5nc0JlYXJlckhhc05vbmNlQW5kU2Vzc2lvbjogdHlwZW9mIHNldHRpbmdzRW52WydBTlRIUk9QSUNfQVVUSF9UT0tFTiddID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQmJiBzZXR0aW5nc0VudlsnQU5USFJPUElDX0FVVEhfVE9LRU4nXS5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMlxuXHRcdFx0XHQmJiBzZXR0aW5nc0VudlsnQU5USFJPUElDX0FVVEhfVE9LRU4nXS5lbmRzV2l0aChgLiR7c2Vzc2lvbklkfWApLFxuXHRcdFx0aHR0cFN0YXR1czogcm91bmQuc3RhdHVzLFxuXHRcdFx0aHR0cENvbnRlbnRUeXBlOiByb3VuZC5jb250ZW50VHlwZSxcblx0XHRcdGV2ZW50VHlwZXM6IHJvdW5kLmV2ZW50cy5tYXAoZSA9PiBlLnR5cGUpLFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0dXBDYWxsQ291bnQ6IDEsXG5cdFx0XHRyb3VuZFRyaXBDb3VudDogMSxcblx0XHRcdGNhcGlDYWxsQ291bnQ6IDEsXG5cdFx0XHRzdGFydHVwQ3dkOiBVUkkuZmlsZSgnL2ludGVncmF0aW9uLWN3ZCcpLmZzUGF0aCxcblx0XHRcdHN0YXJ0dXBTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHN0YXJ0dXBFeGVjdXRhYmxlOiBwcm9jZXNzLmV4ZWNQYXRoLFxuXHRcdFx0c3VicHJvY2Vzc0VsZWN0cm9uUnVuQXNOb2RlOiAnMScsXG5cdFx0XHRzdWJwcm9jZXNzTm9kZU9wdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdHN1YnByb2Nlc3NBbnRocm9waWNBcGlLZXk6IHVuZGVmaW5lZCxcblx0XHRcdHNldHRpbmdzQmFzZVVybElzTG9vcGJhY2s6IHRydWUsXG5cdFx0XHRzZXR0aW5nc0JlYXJlckhhc05vbmNlQW5kU2Vzc2lvbjogdHJ1ZSxcblx0XHRcdGh0dHBTdGF0dXM6IDIwMCxcblx0XHRcdGh0dHBDb250ZW50VHlwZTogJ3RleHQvZXZlbnQtc3RyZWFtJyxcblx0XHRcdGV2ZW50VHlwZXM6IFtcblx0XHRcdFx0J21lc3NhZ2Vfc3RhcnQnLFxuXHRcdFx0XHQnY29udGVudF9ibG9ja19zdGFydCcsXG5cdFx0XHRcdCdjb250ZW50X2Jsb2NrX2RlbHRhJyxcblx0XHRcdFx0J2NvbnRlbnRfYmxvY2tfc3RvcCcsXG5cdFx0XHRcdCdtZXNzYWdlX2RlbHRhJyxcblx0XHRcdFx0J21lc3NhZ2Vfc3RvcCcsXG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0Ly8gQ2xlYW51cDogdGVhciB0aGUgY2hhdCBkb3duIGFuZCBhc3NlcnQgdGhlIFdhcm1RdWVyeSB3YXNcblx0XHQvLyBjbG9zZWQgdmlhIFN5bWJvbC5hc3luY0Rpc3Bvc2UgKG5vIG9ycGhhbiBzdWJwcm9jZXNzKS4gVHJhY2UtY29udGV4dFxuXHRcdC8vIHJlbGVhc2UgZm9yIHRoZSBkZWZhdWx0IGNoYXQgbm93IGhhcHBlbnMgaW5zaWRlIGRpc3Bvc2VDaGF0IGl0c2VsZiBcdTIwMTRcblx0XHQvLyB0aGVyZSBpcyBubyBzZXBhcmF0ZSBmaW5hbGl6ZSBzdGVwLlxuXHRcdGF3YWl0IGFnZW50LmNoYXRzLmRpc3Bvc2VDaGF0KGNyZWF0ZWQuY2hhdCwgY2hhdENvbnRleHQoY3JlYXRlZC5jaGF0LCBjcmVhdGVkLnNlc3Npb24pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2RrLndhcm1RdWVyaWVzWzBdLmFzeW5jRGlzcG9zZUNvdW50LCAxLCAnV2FybVF1ZXJ5IGlzIGFzeW5jRGlzcG9zZWQgb24gY2hhdCBkaXNwb3NlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3h5IHJlamVjdHMgYSByZXF1ZXN0IHdob3NlIGJlYXJlciBjYXJyaWVzIGEgd3Jvbmcgbm9uY2UgKGF1dGggY29udHJhY3QpJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIENvbXBhbmlvbiB0ZXN0IHRoYXQgbG9ja3MgdGhlIHByb3h5J3MgYXV0aCBjb250cmFjdCBmcm9tXG5cdFx0Ly8gb3V0c2lkZSB0aGUgYWdlbnQuIElmIHRoZSBhZ2VudCBldmVyIGRyaWZ0cyBhd2F5IGZyb21cblx0XHQvLyBgQmVhcmVyIDxub25jZT4uPHNlc3Npb25JZD5gLCB0aGUgcm91bmQtdHJpcCBpbiB0aGUgdGVzdFxuXHRcdC8vIGFib3ZlIGZhaWxzIFx1MjAxNCBidXQgdGhpcyB0ZXN0IGd1YXJhbnRlZXMgdGhlIHByb3h5IGl0c2VsZlxuXHRcdC8vIHJlamVjdHMgZm9yZ2VkIGJlYXJlcnMgcmVnYXJkbGVzcyBvZiB0aGUgYWdlbnQuXG5cdFx0Y29uc3QgY2FwaSA9IG5ldyBTdHViQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb25zdCByZWFsUHJveHkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENsYXVkZVByb3h5U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY2FwaSkpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHJlYWxQcm94eS5zdGFydCgnZ2gtaW50LXRlc3QtdG9rZW4nKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcG9zdFNzZVRvUHJveHkoXG5cdFx0XHRcdGAke2hhbmRsZS5iYXNlVXJsfS92MS9tZXNzYWdlc2AsXG5cdFx0XHRcdCd3cm9uZy1ub25jZS5zZXNzaW9uLXgnLFxuXHRcdFx0XHR7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBzdHJlYW06IHRydWUgfSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXR1cywgNDAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXBpLm1lc3NhZ2VzQ2FsbENvdW50LmNvdW50LCAwLCAnYXV0aCBjaGVjayBmaXJlcyBiZWZvcmUgYW55IHVwc3RyZWFtIGNhbGwnKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1BoYXNlIDcgXHUwMEE3NS4zIFx1MjAxNCBjYW5Vc2VUb29sIC8gb25FbGljaXRhdGlvbiBjbG9zdXJlcyB3aXJlZCB0aHJvdWdoIHRvIE9wdGlvbnMgb24gbWF0ZXJpYWxpemUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUGhhc2UgNyBcdTAwQTc1LjMuIFRoZSBQaGFzZS02IHJvdW5kLXRyaXAgYWJvdmUgZXhlcmNpc2VkIHRoZVxuXHRcdC8vIHByb3h5IC8gQ0FQSSAvIHNldHRpbmdzLWVudiB3aXJpbmc7IHRoaXMgdGVzdCBwaW5zIHRoZVxuXHRcdC8vIFBoYXNlLTcgY2FsbGJhY2sgc3VyZmFjZSBcdTIwMTQgYGNhblVzZVRvb2xgIGFuZCBgb25FbGljaXRhdGlvbmBcblx0XHQvLyBtdXN0IGJvdGggYmUgcHJlc2VudCBpbiB0aGUgT3B0aW9ucyB0aGUgU0RLIHNlcnZpY2UgcmVjZWl2ZXNcblx0XHQvLyBmcm9tIGBfbWF0ZXJpYWxpemVQcm92aXNpb25hbGAgYW5kIGJlaGF2ZSBwZXIgXHUwMEE3My40IC8gXHUwMEE3My43LlxuXHRcdC8vIFdlIGRvbid0IG5lZWQgYSBmdWxsIFNESyBtZXNzYWdlIHN0cmVhbSB3aXRoIHRvb2xfdXNlIGJsb2Nrc1xuXHRcdC8vIHRvIHZhbGlkYXRlIHRoZSB3aXJpbmcgXHUyMDE0IHRoZSB1bml0IHN1aXRlcyBpblxuXHRcdC8vIGBjbGF1ZGVBZ2VudC50ZXN0LnRzYCBjb3ZlciB0aGUgaW4tcHJvY2VzcyB0b29sIHJvdW5kLXRyaXBcblx0XHQvLyBleGhhdXN0aXZlbHkuIFdoYXQgdGhpcyBpbnRlZ3JhdGlvbiBhZGRzOiB0aGUgY2xvc3VyZXNcblx0XHQvLyBzdXJ2aXZlIHRoZSBtYXRlcmlhbGl6ZSBcdTIxOTIgU0RLIGJvdW5kYXJ5IGludGFjdCB3aGVuIHRoZSByZWFsXG5cdFx0Ly8gcHJveHkgaXMgaW4gdGhlIGxvb3AuXG5cdFx0Y29uc3QgY2FwaSA9IG5ldyBTdHViQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjYXBpLnN0cmVhbUV2ZW50cyA9IG1ha2VDYW5uZWRTdHJlYW0oJ2NsYXVkZS1vcHVzLTQuNicpO1xuXHRcdGNvbnN0IHJlYWxQcm94eSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2xhdWRlUHJveHlTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBjYXBpKSk7XG5cdFx0Y29uc3Qgc2RrID0gbmV3IFByb3h5Um91bmRUcmlwU2RrU2VydmljZSgpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlXSxcblx0XHRcdFtJQ29waWxvdEFwaVNlcnZpY2UsIGNhcGldLFxuXHRcdFx0W0lDbGF1ZGVQcm94eVNlcnZpY2UsIHJlYWxQcm94eV0sXG5cdFx0XHRbSVNlc3Npb25EYXRhU2VydmljZSwgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKCldLFxuXHRcdFx0W0lDbGF1ZGVBZ2VudFNka1NlcnZpY2UsIHNka10sXG5cdFx0XHRbSUFnZW50UGx1Z2luTWFuYWdlciwge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGJhc2VQYXRoOiBVUkkuZnJvbSh7IHNjaGVtZTogJ2lubWVtb3J5JywgcGF0aDogJy9hZ2VudFBsdWdpbnMnIH0pLFxuXHRcdFx0XHRhc3luYyBzeW5jQ3VzdG9taXphdGlvbnMoX2NsaWVudElkOiBzdHJpbmcsIF9jdXN0b21pemF0aW9uczogQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdKSB7IHJldHVybiBbXTsgfSxcblx0XHRcdH1dLFxuXHRcdFx0W0lBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWdTZXJ2aWNlXSxcblx0XHRcdFtJQWdlbnRIb3N0T1RlbFNlcnZpY2UsIG5vb3BPVGVsU2VydmljZV0sXG5cdFx0XHRbSUFnZW50SG9zdFN0YXRlTWFuYWdlciwgc3RhdGVNYW5hZ2VyXSxcblx0XHRcdFtJQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsLCBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbChzdGF0ZU1hbmFnZXIpKV0sXG5cdFx0XHRbSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSwgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSgpXSxcblx0XHRcdFtJQWdlbnRIb3N0R2l0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKV0sXG5cdFx0XHRbSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRV0sXG5cdFx0XHRbSUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSwgY3JlYXRlTm9vcEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSgpXSxcblx0XHRcdC4uLmNsYXVkZUZpbGVFbnZTZXJ2aWNlcyhkaXNwb3NhYmxlcyksXG5cdFx0KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpKTtcblx0XHRjb25zdCBhZ2VudCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGF1ZGVBZ2VudCkpO1xuXG5cdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRS5yZXNvdXJjZSwgJ2doLWludC10ZXN0LXRva2VuJyk7XG5cdFx0Y29uc3QgY3JlYXRlZCA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oYWdlbnQsIHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy9pbnRlZ3JhdGlvbi1jd2QnKV0gfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gY3JlYXRlZC5zZXNzaW9uSWQ7XG5cdFx0c2RrLnF1ZXJ5TWVzc2FnZXMgPSBbXG5cdFx0XHRtYWtlU3lzdGVtSW5pdE1lc3NhZ2Uoc2Vzc2lvbklkKSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2VsaWNpdGF0aW9uJyxcblx0XHRcdFx0cmVxdWVzdDogeyBzZXJ2ZXJOYW1lOiAnbWNwLXRlc3QnLCBtZXNzYWdlOiAncGljayBhIHNpZGUnLCBtb2RlOiAnZm9ybScsIHJlcXVlc3RlZFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczogeyBzaWRlOiB7IHR5cGU6ICdzdHJpbmcnIH0gfSB9IH0sXG5cdFx0XHR9LFxuXHRcdFx0bWFrZVJlc3VsdFN1Y2Nlc3Moc2Vzc2lvbklkKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgaW5wdXRSZXF1ZXN0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPENoYXRJbnB1dFJlcXVlc3Q+KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFnZW50Lm9uRGlkQ2hhdFByb2dyZXNzKHMgPT4ge1xuXHRcdFx0aWYgKHMua2luZCA9PT0gJ2FjdGlvbicgJiYgcy5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0SW5wdXRSZXF1ZXN0ZWQpIHtcblx0XHRcdFx0aW5wdXRSZXF1ZXN0ZWQuY29tcGxldGUocy5hY3Rpb24ucmVxdWVzdCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VuZFByb21pc2UgPSBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShjcmVhdGVkLmNoYXQsICdoaScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAndHVybi0xJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNoYXRDb250ZXh0KGNyZWF0ZWQuY2hhdCwgY3JlYXRlZC5zZXNzaW9uKSk7XG5cdFx0Y29uc3QgaW5wdXRSZXF1ZXN0ID0gYXdhaXQgaW5wdXRSZXF1ZXN0ZWQucDtcblxuXHRcdGNvbnN0IHN0YXJ0dXAgPSBzZGsuY2FwdHVyZWRTdGFydHVwT3B0aW9uc1swXTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHN0YXJ0dXAuY2FuVXNlVG9vbCA9PT0gJ2Z1bmN0aW9uJywgJ2NhblVzZVRvb2wgd2FzIHdpcmVkIGludG8gT3B0aW9ucycpO1xuXHRcdGFzc2VydC5vayh0eXBlb2Ygc3RhcnR1cC5vbkVsaWNpdGF0aW9uID09PSAnZnVuY3Rpb24nLCAnb25FbGljaXRhdGlvbiB3YXMgd2lyZWQgaW50byBPcHRpb25zJyk7XG5cblx0XHRhZ2VudC5yZXNwb25kVG9Vc2VySW5wdXRSZXF1ZXN0KGlucHV0UmVxdWVzdC5pZCwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCwge1xuXHRcdFx0c2lkZTogeyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLCB2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCwgdmFsdWU6ICdsZWZ0JyB9IH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgc2VuZFByb21pc2U7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVsaWNpdFJlc3VsdDogc2RrLmVsaWNpdGF0aW9uUmVzdWx0c1swXSxcblx0XHRcdHBlcm1pc3Npb25Nb2RlOiBzdGFydHVwLnBlcm1pc3Npb25Nb2RlLFxuXHRcdH0sIHtcblx0XHRcdGVsaWNpdFJlc3VsdDogeyBhY3Rpb246ICdhY2NlcHQnLCBjb250ZW50OiB7IHNpZGU6ICdsZWZ0JyB9IH0sXG5cdFx0XHRwZXJtaXNzaW9uTW9kZTogJ2RlZmF1bHQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdQaGFzZSA3IFx1MDBBNzUuMyBcdTIwMTQgUmVhZCB0b29sIHJvdW5kLXRyaXA6IFNESyB0b29sX3VzZSBcdTIxOTIgcGVuZGluZ19jb25maXJtYXRpb24gXHUyMTkyIHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KHRydWUpIFx1MjE5MiB0b29sX3Jlc3VsdCBcdTIxOTIgY29udGludWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFx1MDBBNzUuMyBvZiB0aGUgUGhhc2UtNyBwbGFuOiBkcml2ZSBhIG9uZS10b29sIHJvdW5kLXRyaXAgZW5kLXRvLWVuZFxuXHRcdC8vIHRocm91Z2ggYSBtYXRlcmlhbGl6ZWQgYWdlbnQgYmFja2VkIGJ5IHRoZSByZWFsIHByb3h5LiBVbml0XG5cdFx0Ly8gdGVzdHMgaW4gYGNsYXVkZUFnZW50LnRlc3QudHNgIGFscmVhZHkgY292ZXIgdGhlIGluLXByb2Nlc3Ncblx0XHQvLyBgX2hhbmRsZUNhblVzZVRvb2xgIG1lY2hhbmljczsgd2hhdCB0aGlzIHRlc3QgcGlucyBpcyB0aGVcblx0XHQvLyBhZ2VudCBcdTIxOTIgbWFwcGVyIFx1MjE5MiBwcm9ncmVzcy1ldmVudCBvcmRlcmluZyB3aGVuIHRoZSBTREsgZml4dHVyZVxuXHRcdC8vIGludm9rZXMgdGhlIGNhcHR1cmVkIGBPcHRpb25zLmNhblVzZVRvb2xgIG1pZC1zdHJlYW0gdGhlIHNhbWVcblx0XHQvLyB3YXkgdGhlIHJlYWwgc3VicHJvY2VzcyB3b3VsZC5cblx0XHRjb25zdCBjYXBpID0gbmV3IFN0dWJDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNhcGkuc3RyZWFtRXZlbnRzID0gbWFrZUNhbm5lZFN0cmVhbSgnY2xhdWRlLW9wdXMtNC42Jyk7XG5cdFx0Y29uc3QgcmVhbFByb3h5ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDbGF1ZGVQcm94eVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGNhcGkpKTtcblx0XHRjb25zdCBzZGsgPSBuZXcgUHJveHlSb3VuZFRyaXBTZGtTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZXMgPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUxvZ1NlcnZpY2UsIGxvZ1NlcnZpY2VdLFxuXHRcdFx0W0lDb3BpbG90QXBpU2VydmljZSwgY2FwaV0sXG5cdFx0XHRbSUNsYXVkZVByb3h5U2VydmljZSwgcmVhbFByb3h5XSxcblx0XHRcdFtJU2Vzc2lvbkRhdGFTZXJ2aWNlLCBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoKV0sXG5cdFx0XHRbSUNsYXVkZUFnZW50U2RrU2VydmljZSwgc2RrXSxcblx0XHRcdFtJQWdlbnRQbHVnaW5NYW5hZ2VyLCB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0YmFzZVBhdGg6IFVSSS5mcm9tKHsgc2NoZW1lOiAnaW5tZW1vcnknLCBwYXRoOiAnL2FnZW50UGx1Z2lucycgfSksXG5cdFx0XHRcdGFzeW5jIHN5bmNDdXN0b21pemF0aW9ucyhfY2xpZW50SWQ6IHN0cmluZywgX2N1c3RvbWl6YXRpb25zOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10pIHsgcmV0dXJuIFtdOyB9LFxuXHRcdFx0fV0sXG5cdFx0XHRbSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RPVGVsU2VydmljZSwgbm9vcE9UZWxTZXJ2aWNlXSxcblx0XHRcdFtJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBzdGF0ZU1hbmFnZXJdLFxuXHRcdFx0W0lBZ2VudEhvc3RTZXNzaW9uVGl0bGVTaWduYWwsIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsKHN0YXRlTWFuYWdlcikpXSxcblx0XHRcdFtJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLCBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKCldLFxuXHRcdFx0W0lBZ2VudEhvc3RHaXRTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpXSxcblx0XHRcdFtJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsIE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFXSxcblx0XHRcdFtJQWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLCBjcmVhdGVOb29wQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlKCldLFxuXHRcdFx0Li4uY2xhdWRlRmlsZUVudlNlcnZpY2VzKGRpc3Bvc2FibGVzKSxcblx0XHQpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcykpO1xuXHRcdGNvbnN0IGFnZW50ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENsYXVkZUFnZW50KSk7XG5cblx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoR0lUSFVCX0NPUElMT1RfUFJPVEVDVEVEX1JFU09VUkNFLnJlc291cmNlLCAnZ2gtaW50LXRlc3QtdG9rZW4nKTtcblx0XHRjb25zdCBjcmVhdGVkID0gYXdhaXQgY3JlYXRlU2Vzc2lvbihhZ2VudCwgeyB3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL2ludGVncmF0aW9uLWN3ZCcpXSB9KTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBjcmVhdGVkLnNlc3Npb25JZDtcblxuXHRcdC8vIENhbm5lZCB0dXJuOiBhc3Npc3RhbnQgc2F5cyBcInJlYWRpbmdcIiwgY2FsbHMgYFJlYWRgLCB0aGUgU0RLXG5cdFx0Ly8gaW52b2tlcyBgY2FuVXNlVG9vbGAsIHRoZW4gYSBzeW50aGV0aWMgdXNlciBgdG9vbF9yZXN1bHRgXG5cdFx0Ly8gYXJyaXZlcyBmb2xsb3dlZCBieSBhbiBhc3Npc3RhbnQgY29udGludWF0aW9uIGFuZCBgcmVzdWx0YC5cblx0XHRjb25zdCBUT09MX1VTRV9JRCA9ICd0dV9pbnRfcmVhZF8xJztcblx0XHRzZGsucXVlcnlNZXNzYWdlcyA9IFtcblx0XHRcdG1ha2VTeXN0ZW1Jbml0TWVzc2FnZShzZXNzaW9uSWQpLFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KHNlc3Npb25JZCwgbWFrZU1lc3NhZ2VTdGFydCgnbXNnX2ludF8xJykpLFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KHNlc3Npb25JZCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VGV4dCgwKSksXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoc2Vzc2lvbklkLCBtYWtlVGV4dERlbHRhKDAsICdyZWFkaW5nJykpLFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KHNlc3Npb25JZCwgbWFrZUNvbnRlbnRCbG9ja1N0b3AoMCkpLFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KHNlc3Npb25JZCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgxLCBUT09MX1VTRV9JRCwgJ1JlYWQnKSksXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoc2Vzc2lvbklkLCBtYWtlSW5wdXRKc29uRGVsdGEoMSwgJ3tcImZpbGVfcGF0aFwiOlwiL3RtcC94XCJ9JykpLFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KHNlc3Npb25JZCwgbWFrZUNvbnRlbnRCbG9ja1N0b3AoMSkpLFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KHNlc3Npb25JZCwgbWFrZU1lc3NhZ2VTdG9wKCkpLFxuXHRcdFx0eyBraW5kOiAnY2FuVXNlVG9vbCcsIHRvb2xOYW1lOiAnUmVhZCcsIGlucHV0OiB7IGZpbGVfcGF0aDogJy90bXAveCcgfSwgdG9vbFVzZUlEOiBUT09MX1VTRV9JRCB9LFxuXHRcdFx0bWFrZVVzZXJUb29sUmVzdWx0TWVzc2FnZShzZXNzaW9uSWQsIFRPT0xfVVNFX0lELCAnZmlsZSBjb250ZW50cycpLFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KHNlc3Npb25JZCwgbWFrZU1lc3NhZ2VTdGFydCgnbXNnX2ludF8yJykpLFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KHNlc3Npb25JZCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VGV4dCgwKSksXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoc2Vzc2lvbklkLCBtYWtlVGV4dERlbHRhKDAsICdkb25lJykpLFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KHNlc3Npb25JZCwgbWFrZUNvbnRlbnRCbG9ja1N0b3AoMCkpLFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KHNlc3Npb25JZCwgbWFrZU1lc3NhZ2VTdG9wKCkpLFxuXHRcdFx0bWFrZVJlc3VsdFN1Y2Nlc3Moc2Vzc2lvbklkKSxcblx0XHRdO1xuXG5cdFx0Y29uc3Qgc2lnbmFsczogQWdlbnRTaWduYWxbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZ2VudC5vbkRpZENoYXRQcm9ncmVzcyhzID0+IHtcblx0XHRcdHNpZ25hbHMucHVzaChzKTtcblx0XHRcdGlmIChzLmtpbmQgPT09ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicgJiYgcy5zdGF0ZS50b29sQ2FsbElkID09PSBUT09MX1VTRV9JRCkge1xuXHRcdFx0XHRhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdChUT09MX1VTRV9JRCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoY3JlYXRlZC5jaGF0LCAncGxlYXNlIHJlYWQgL3RtcC94JywgdW5kZWZpbmVkLCB1bmRlZmluZWQsICd0dXJuLTEnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgY2hhdENvbnRleHQoY3JlYXRlZC5jaGF0LCBjcmVhdGVkLnNlc3Npb24pKTtcblxuXHRcdC8vIFNuYXBzaG90IHRoZSBhZ2VudC1zaWRlIGVtaXNzaW9uIHN0cmVhbSBhcyBhIHNpbmdsZSBzaGFwZSBzb1xuXHRcdC8vIHRoZSBmYWlsdXJlIHN1cmZhY2UgaXMgdGhlIHdob2xlIHBpcGVsaW5lLlxuXHRcdGNvbnN0IHN1bW1hcnkgPSBzaWduYWxzLm1hcChzID0+IHtcblx0XHRcdGlmIChzLmtpbmQgPT09ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiBzLmtpbmQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogcy5zdGF0ZS50b29sQ2FsbElkLFxuXHRcdFx0XHRcdHRvb2xOYW1lOiBzLnN0YXRlLnRvb2xOYW1lLFxuXHRcdFx0XHRcdHBlcm1pc3Npb25LaW5kOiBzLnBlcm1pc3Npb25LaW5kLFxuXHRcdFx0XHRcdHBlcm1pc3Npb25QYXRoOiBzLnBlcm1pc3Npb25QYXRoLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHMua2luZCA9PT0gJ2FjdGlvbicpIHtcblx0XHRcdFx0Y29uc3QgYSA9IHMuYWN0aW9uO1xuXHRcdFx0XHRzd2l0Y2ggKGEudHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0OlxuXHRcdFx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2FjdGlvbicsIHR5cGU6IGEudHlwZSwgcGFydEtpbmQ6IGEucGFydC5raW5kLCBjb250ZW50OiBhLnBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biA/IGEucGFydC5jb250ZW50IDogdW5kZWZpbmVkIH07XG5cdFx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXREZWx0YTpcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdhY3Rpb24nLCB0eXBlOiBhLnR5cGUsIGNvbnRlbnQ6IGEuY29udGVudCB9O1xuXHRcdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydDpcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdhY3Rpb24nLCB0eXBlOiBhLnR5cGUsIHRvb2xDYWxsSWQ6IGEudG9vbENhbGxJZCwgdG9vbE5hbWU6IGEudG9vbE5hbWUgfTtcblx0XHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGE6XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYWN0aW9uJywgdHlwZTogYS50eXBlLCB0b29sQ2FsbElkOiBhLnRvb2xDYWxsSWQsIGNvbnRlbnQ6IGEuY29udGVudCB9O1xuXHRcdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZTpcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdhY3Rpb24nLCB0eXBlOiBhLnR5cGUsIHRvb2xDYWxsSWQ6IGEudG9vbENhbGxJZCwgc3VjY2VzczogYS5yZXN1bHQuc3VjY2VzcywgY29udGVudDogYS5yZXN1bHQuY29udGVudCB9O1xuXHRcdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VXNhZ2U6XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYWN0aW9uJywgdHlwZTogYS50eXBlIH07XG5cdFx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGU6XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYWN0aW9uJywgdHlwZTogYS50eXBlIH07XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdhY3Rpb24nLCB0eXBlOiBhLnR5cGUgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsga2luZDogcy5raW5kIH07XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN1bW1hcnksXG5cdFx0XHRjYW5Vc2VUb29sUmVzdWx0czogc2RrLmNhblVzZVRvb2xSZXN1bHRzLFxuXHRcdH0sIHtcblx0XHRcdHN1bW1hcnk6IFtcblx0XHRcdFx0eyBraW5kOiAnYWN0aW9uJywgdHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LCBwYXJ0S2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJycgfSxcblx0XHRcdFx0eyBraW5kOiAnYWN0aW9uJywgdHlwZTogQWN0aW9uVHlwZS5DaGF0RGVsdGEsIGNvbnRlbnQ6ICdyZWFkaW5nJyB9LFxuXHRcdFx0XHR7IGtpbmQ6ICdhY3Rpb24nLCB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0b29sQ2FsbElkOiBUT09MX1VTRV9JRCwgdG9vbE5hbWU6ICdSZWFkJyB9LFxuXHRcdFx0XHR7IGtpbmQ6ICdhY3Rpb24nLCB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLCB0b29sQ2FsbElkOiBUT09MX1VTRV9JRCwgY29udGVudDogJ3tcImZpbGVfcGF0aFwiOlwiL3RtcC94XCJ9JyB9LFxuXHRcdFx0XHQvLyBQaGFzZSA4LjUgXHUyMDE0IG1hcHBlciBlbWl0cyBgQ2hhdFRvb2xDYWxsUmVhZHlgIGF0XG5cdFx0XHRcdC8vIGBjb250ZW50X2Jsb2NrX3N0b3BgIHNvIGF1dG8tYWxsb3dlZCB0b29scyB0cmFuc2l0aW9uIG91dCBvZlxuXHRcdFx0XHQvLyBgU3RyZWFtaW5nYDsgYHNlc3Npb25QZXJtaXNzaW9uc2AgdGhlbiBlbWl0cyBhIHNlY29uZCBSZWFkeVxuXHRcdFx0XHQvLyBmb3IgdGhlIHBlbmRpbmdfY29uZmlybWF0aW9uIGNhcmQgYmVsb3cuXG5cdFx0XHRcdHsga2luZDogJ2FjdGlvbicsIHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkgfSxcblx0XHRcdFx0eyBraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCB0b29sQ2FsbElkOiBUT09MX1VTRV9JRCwgdG9vbE5hbWU6ICdSZWFkJywgcGVybWlzc2lvbktpbmQ6ICdyZWFkJywgcGVybWlzc2lvblBhdGg6ICcvdG1wL3gnIH0sXG5cdFx0XHRcdHsga2luZDogJ2FjdGlvbicsIHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsIHRvb2xDYWxsSWQ6IFRPT0xfVVNFX0lELCBzdWNjZXNzOiB0cnVlLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2ZpbGUgY29udGVudHMnIH1dIH0sXG5cdFx0XHRcdHsga2luZDogJ2FjdGlvbicsIHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCwgcGFydEtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICcnIH0sXG5cdFx0XHRcdHsga2luZDogJ2FjdGlvbicsIHR5cGU6IEFjdGlvblR5cGUuQ2hhdERlbHRhLCBjb250ZW50OiAnZG9uZScgfSxcblx0XHRcdFx0eyBraW5kOiAnYWN0aW9uJywgdHlwZTogQWN0aW9uVHlwZS5DaGF0VXNhZ2UgfSxcblx0XHRcdFx0eyBraW5kOiAnYWN0aW9uJywgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlIH0sXG5cdFx0XHRdLFxuXHRcdFx0Y2FuVXNlVG9vbFJlc3VsdHM6IFtcblx0XHRcdFx0eyBiZWhhdmlvcjogJ2FsbG93JywgdXBkYXRlZElucHV0OiB7IGZpbGVfcGF0aDogJy90bXAveCcgfSB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuLy8gI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBc0NBLE9BQU8sWUFBWTtBQUVuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxlQUFlO0FBRXhCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxpQ0FBaUM7QUFDMUMs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
