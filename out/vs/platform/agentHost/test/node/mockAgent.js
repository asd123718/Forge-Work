import { timeout } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { observableValue } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { AgentSession, resolveAgentChatContext } from "../../common/agent.js";
import { buildSubagentTurnsFromHistory, buildTurnsFromHistory } from "./historyRecordFixtures.js";
import { ToolCallContributorKind } from "../../common/state/protocol/state.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, CustomizationLoadStatus, buildDefaultChatUri, isAhpChatChannel, isDefaultChatUri, parseChatUri, parseSubagentSessionUri } from "../../common/state/sessionState.js";
import { hasKey } from "../../../../base/common/types.js";
const MOCK_AUTO_TITLE = "Automatically generated title";
function uriKey(session) {
  return `${session.scheme}://${session.authority}${session.path}${session.query ? "?" + session.query : ""}${session.fragment ? "#" + session.fragment : ""}`;
}
function mockProject(provider) {
  return { uri: URI.from({ scheme: "mock-project", path: `/${provider}` }), displayName: `Agent ${provider}` };
}
class MockAgent {
  constructor(id = "mock") {
    this.id = id;
    this._discoveredChatsEmitter = new Emitter();
    this.onDidDiscoverChats = this._discoveredChatsEmitter.event;
    this._onDidChatProgress = new Emitter();
    this.onDidChatProgress = this._onDidChatProgress.event;
    this.onDidMaterializeChat = Event.None;
    this.onDidChangeChatData = Event.None;
    this.onDidSpawnChat = Event.None;
    this._onDidSendMessage = new Emitter();
    this.onDidSendMessage = this._onDidSendMessage.event;
    this._models = observableValue(this, []);
    this.models = this._models;
    this._authenticationRequired = observableValue(this, void 0);
    this.authenticationRequired = this._authenticationRequired;
    this._sessions = /* @__PURE__ */ new Map();
    this._initialChats = /* @__PURE__ */ new Set();
    /** Active turn IDs per session, captured from sendMessage(). */
    this._activeTurnIds = /* @__PURE__ */ new Map();
    this.sendMessageCalls = [];
    this.setPendingMessagesCalls = [];
    this.disposeSessionCalls = [];
    this.releaseSessionCalls = [];
    this.abortSessionCalls = [];
    this.respondToPermissionCalls = [];
    this.changeModelCalls = [];
    this.changeAgentCalls = [];
    this.authenticateCalls = [];
    this.setClientCustomizationsCalls = [];
    this.setClientToolsCalls = [];
    this.removeActiveClientCalls = [];
    /**
     * Every host-supplied {@link IAgentChatContext} this agent was handed,
     * keyed by the boundary it arrived at. Lets shared tests assert that Agent
     * Host stamps the exhaustive `kind` / `origin` / `customizations` seam on
     * every addressed chat operation.
     */
    this.chatContexts = [];
    /** Active-client fan-out recorded exactly as Agent Host supplied it. */
    this.activeClientCalls = [];
    /** Host customizations handed to {@link getChatCustomizations}. */
    this.sessionCustomizationsCalls = [];
    this.clientToolCallCompleteCalls = [];
    this.truncateChatCalls = [];
    /** Configurable return value for getCustomizations. */
    this.customizations = [];
    this._onDidCustomizationsChange = new Emitter();
    this.onDidCustomizationsChange = this._onDidCustomizationsChange.event;
    this.getChatCustomizations = async (_chat, context, hostCustomizations) => {
      const configurationResource = URI.isUri(context) ? context : context.configurationResource;
      this.sessionCustomizationsCalls.push({ session: configurationResource, hostCustomizations });
      return this.getSessionCustomizations?.(configurationResource, hostCustomizations) ?? this.customizations;
    };
    /**
     * Configurable session history. Tests construct {@link IHistoryRecord}
     * entries (the agent-internal intermediate shape) and the mock converts
     * them to {@link Turn}s on demand. Subagent URIs are routed to filtered
     * subagent turns via {@link buildSubagentTurnsFromHistory}.
     */
    this.sessionMessages = [];
    /** Usage stamped onto every reconstructed turn (e.g. an Auto-model stub). */
    this.turnUsageOverride = void 0;
    /** Optional overrides applied to session metadata from listSessions. */
    this.sessionMetadataOverrides = {};
    this.chats = {
      createChat: (chatUri, context, options) => {
        this._recordContext("createChat", chatUri, context);
        const session = resolveAgentChatContext(context, chatUri).configurationResource;
        if (!this._sessions.has(AgentSession.id(session)) || this._initialChats.has(chatUri.toString())) {
          this._initialChats.add(chatUri.toString());
          return Promise.resolve(this._createSessionRecord(session, {
            session,
            model: options?.model,
            agent: options?.agent,
            workingDirectories: options?.workingDirectories,
            config: options?.config,
            activeClient: options?.activeClient,
            importConversation: options?.importConversation
          }));
        }
        return this.createChat(session, chatUri, options);
      },
      disposeChat: (chatUri, context) => {
        this._recordContext("disposeChat", chatUri, context);
        const { session, chat } = this._resolveChatTarget(chatUri, context);
        return this.disposeChat(session, chat).then(() => {
          if (this._initialChats.delete(chatUri.toString())) {
            this.disposeSessionCalls.push(session);
            this._sessions.delete(AgentSession.id(session));
          }
        });
      },
      releaseChat: (chatUri, context) => {
        this._recordContext("releaseChat", chatUri, context);
        const { session } = this._resolveChatTarget(chatUri, context);
        this._releaseSessionRecord(session);
        return Promise.resolve();
      },
      sendMessage: (chatUri, prompt, _workingDirectoriesOrDirectory, attachments, turnId, senderClientId, clientTypeOrContext, context) => {
        const clientType = typeof clientTypeOrContext === "string" ? clientTypeOrContext : AgentHostClientType.Unknown;
        const operationContext = context ?? (typeof clientTypeOrContext === "string" ? void 0 : clientTypeOrContext);
        this._recordContext("sendMessage", chatUri, operationContext);
        const { session, chat } = this._resolveChatTarget(chatUri, operationContext);
        return this.sendMessage(session, chat, prompt, attachments, turnId, senderClientId, clientType);
      },
      abort: (chat, context) => {
        this._recordContext("abort", chat, context);
        const { session } = this._resolveChatTarget(chat, context);
        return this.abortSession(session);
      },
      changeModel: (chatUri, model, context) => {
        this._recordContext("changeModel", chatUri, context);
        const { session, chat } = this._resolveChatTarget(chatUri, context);
        return this.changeModel(session, model, chat);
      },
      changeAgent: (chatUri, agent, context) => {
        this._recordContext("changeAgent", chatUri, context);
        const { session, chat } = this._resolveChatTarget(chatUri, context);
        return this.changeAgent(session, agent, chat);
      },
      getMessages: (chat, context) => {
        this._recordContext("getMessages", chat, context);
        return this.getSessionMessages(chat);
      }
    };
    queueMicrotask(() => {
      void this.listExternalChats().then((chats) => {
        if (chats) {
          this.fireDiscoveredChats(chats.map((metadata) => ({ ...metadata, external: true })));
        }
      }, () => {
      });
    });
  }
  setAuthenticationRequired(requirement) {
    this._authenticationRequired.set(requirement, void 0);
  }
  getDescriptor() {
    return { provider: this.id, displayName: `Agent ${this.id}`, description: `Test ${this.id} agent`, capabilities: { multipleChats: { fork: true } } };
  }
  getProtectedResources() {
    if (this.id === "copilot") {
      return [{ resource: "https://api.github.com", authorization_servers: ["https://github.com/login/oauth"], required: true }];
    }
    return [];
  }
  setModels(models) {
    this._models.set(models, void 0);
  }
  async listExternalChats() {
    return [...this._sessions.values()].map((session) => ({ chat: URI.parse(buildDefaultChatUri(session)), startTime: Date.now(), modifiedTime: Date.now(), project: mockProject(this.id), ...this.sessionMetadataOverrides }));
  }
  fireDiscoveredChats(chats) {
    this._discoveredChatsEmitter.fire(chats);
  }
  async listChatsToMigrate() {
    return [];
  }
  async listSessions() {
    return [...this._sessions.values()].map((session) => ({ session, startTime: Date.now(), modifiedTime: Date.now(), project: mockProject(this.id), ...this.sessionMetadataOverrides }));
  }
  async getChatMetadata(chat, context) {
    const session = resolveAgentChatContext(context, chat).configurationResource;
    if (!this._sessions.has(AgentSession.id(session))) {
      return void 0;
    }
    return { chat, startTime: Date.now(), modifiedTime: Date.now(), project: mockProject(this.id), ...this.sessionMetadataOverrides };
  }
  async getSessionMetadata(session) {
    return this._sessions.has(AgentSession.id(session)) ? { session, startTime: Date.now(), modifiedTime: Date.now(), project: mockProject(this.id), ...this.sessionMetadataOverrides } : void 0;
  }
  /** Backing helper for an initializing {@link chats}.createChat call. */
  _createSessionRecord(session, config) {
    this.lastCreateSessionConfig = config;
    this._sessions.set(AgentSession.id(session), session);
    return { project: mockProject(this.id), resolvedWorkingDirectory: this.resolvedWorkingDirectory };
  }
  async resolveChatConfig(params) {
    return { schema: { type: "object", properties: {} }, values: params.config ?? {} };
  }
  resolveSessionConfig(params) {
    return this.resolveChatConfig(params);
  }
  getInheritedChatConfig() {
    return void 0;
  }
  async chatConfigCompletions(_params) {
    return { items: [] };
  }
  sessionConfigCompletions(params) {
    return this.chatConfigCompletions(params);
  }
  async sendMessage(session, chat, prompt, attachments, turnId, senderClientId, clientType = AgentHostClientType.Unknown) {
    const call = {
      session,
      prompt,
      attachments,
      chat,
      ...senderClientId ? { senderClientId } : {},
      ...clientType !== AgentHostClientType.Unknown ? { clientType } : {}
    };
    this.sendMessageCalls.push(call);
    this._onDidSendMessage.fire(call);
    if (turnId) {
      this._activeTurnIds.set(uriKey(session), turnId);
    }
    if (this.sendMessageError) {
      throw this.sendMessageError;
    }
  }
  setPendingMessages(chat, steeringMessage, queuedMessages) {
    this.setPendingMessagesCalls.push({ chat, steeringMessage, queuedMessages });
  }
  async getSessionMessages(session) {
    const subagentInfo = parseSubagentSessionUri(session);
    if (subagentInfo) {
      return buildSubagentTurnsFromHistory(this.sessionMessages, subagentInfo.toolCallId, session.toString());
    }
    const turns = buildTurnsFromHistory(this.sessionMessages);
    if (this.turnUsageOverride) {
      return turns.map((turn) => ({ ...turn, usage: this.turnUsageOverride }));
    }
    return turns;
  }
  /** Backing helper for {@link chats}.releaseChat: records a non-destructive release. */
  _releaseSessionRecord(session) {
    this.releaseSessionCalls.push(session);
  }
  async abortSession(session) {
    this.abortSessionCalls.push(session);
  }
  async finalizeSession(session, _context) {
    this.disposeSessionCalls.push(session);
    this._sessions.delete(AgentSession.id(session));
  }
  async truncateChat(chat, turnId, context) {
    this.truncateChatCalls.push({ chat, turnId, context });
  }
  respondToPermissionRequest(requestId, approved) {
    this.respondToPermissionCalls.push({ requestId, approved });
  }
  respondToUserInputRequest() {
  }
  async changeModel(session, model, chat) {
    this.changeModelCalls.push({ session, model, chat });
  }
  async changeAgent(session, agent, chat) {
    this.changeAgentCalls.push({ session, agent, chat });
  }
  /**
   * Create an additional (peer) chat. The base mock is single-chat and
   * rejects; multi-chat test subclasses override this.
   */
  async createChat(_session, _chat, _options) {
    throw new Error(`Agent ${this.id} does not support multiple chats`);
  }
  /** Dispose an additional (peer) chat. Overridden by multi-chat subclasses. */
  async disposeChat(_session, _chat) {
  }
  /**
   * Map an already-resolved chat URI to the `(session, chat)` pair the
   * mock records calls against (mirroring the real agents).
   */
  _resolveChatTarget(chat, context) {
    if (context) {
      return { session: resolveAgentChatContext(context, chat).configurationResource, chat };
    }
    const parsed = parseChatUri(chat);
    if (!parsed) {
      throw new Error(`Mock agent chat operation requires an AHP chat URI: ${chat.toString()}`);
    }
    return { session: URI.parse(parsed.session), chat: URI.parse(chat.toString()) };
  }
  /** Records a host-supplied chat context for later assertion. */
  _recordContext(boundary, chat, context) {
    this.chatContexts.push({ boundary, chat, context });
  }
  async materializeChat(_chat, _context, _providerData) {
  }
  async authenticate(resource, token) {
    this.authenticateCalls.push({ resource, token });
    return true;
  }
  getCustomizations() {
    return this.customizations;
  }
  syncClientCustomizations(session, clientId, customizations) {
    this.setClientCustomizationsCalls.push({ clientId, customizations });
    const results = customizations.map((c) => ({
      customization: {
        ...c,
        load: { kind: CustomizationLoadStatus.Loaded }
      }
    }));
    this._onDidChatProgress.fire({
      kind: "action",
      resource: session,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: results.map((result) => result.customization)
      }
    });
    return results;
  }
  getOrCreateActiveClient(chat, context, client, hostCustomizations) {
    const self = this;
    this.activeClientCalls.push({ chat, context, clientId: client.clientId, hostCustomizations });
    let tools = [];
    let customizations = [];
    return {
      clientId: client.clientId,
      displayName: client.displayName,
      get tools() {
        return tools;
      },
      set tools(value) {
        tools = value;
        self.setClientToolsCalls.push({ clientId: client.clientId, tools: value });
      },
      get customizations() {
        return customizations;
      },
      set customizations(value) {
        customizations = value;
        self.syncClientCustomizations(resolveAgentChatContext(context, chat).configurationResource, client.clientId, [...value]);
      }
    };
  }
  removeActiveClient(chat, _context, clientId) {
    this.removeActiveClientCalls.push({ chat, clientId });
  }
  onClientToolCallComplete(chat, toolCallId, result, context) {
    this.clientToolCallCompleteCalls.push({ chat, toolCallId, result, context });
  }
  async shutdown() {
  }
  /**
   * Fires an {@link AgentSignal} on this agent.
   */
  fireProgress(signal) {
    this._onDidChatProgress.fire(signal);
  }
  /**
   * Looks up the active turn id captured from the most recent
   * {@link sendMessage} call for a given session. Returns `undefined` if
   * the session has no active turn yet (e.g. tests that fire progress
   * without first calling sendMessage).
   */
  getActiveTurnId(session) {
    return this._activeTurnIds.get(uriKey(session));
  }
  fireCustomizationsChange() {
    this._onDidCustomizationsChange.fire();
  }
  dispose() {
    this._discoveredChatsEmitter.dispose();
    this._onDidChatProgress.dispose();
    this._onDidSendMessage.dispose();
    this._onDidCustomizationsChange.dispose();
  }
}
const PRE_EXISTING_SESSION_URI = AgentSession.uri("mock", "pre-existing-session");
class ScriptedMockAgent {
  constructor() {
    this._discoveredChatsEmitter = new Emitter();
    this.onDidDiscoverChats = this._discoveredChatsEmitter.event;
    this.id = "mock";
    this._onDidChatProgress = new Emitter();
    this.onDidChatProgress = this._onDidChatProgress.event;
    this.onDidMaterializeChat = Event.None;
    this.onDidChangeChatData = Event.None;
    this.onDidSpawnChat = Event.None;
    this._models = observableValue(this, [{ provider: "mock", id: "mock-model", name: "Mock Model", maxContextWindow: 128e3, supportsVision: false }]);
    this.models = this._models;
    this._sessions = /* @__PURE__ */ new Map();
    /**
     * Message history for the pre-existing session: a single user→assistant
     * turn with a tool call.
     */
    this._preExistingMessages = [
      { type: "message", role: "user", session: PRE_EXISTING_SESSION_URI, messageId: "h-msg-1", content: "What files are here?" },
      { type: "tool_start", session: PRE_EXISTING_SESSION_URI, toolCallId: "h-tc-1", toolName: "list_files", displayName: "List Files", invocationMessage: "Listing files..." },
      { type: "tool_complete", session: PRE_EXISTING_SESSION_URI, toolCallId: "h-tc-1", result: { pastTenseMessage: "Listed files", content: [{ type: ToolResultContentType.Text, text: "file1.ts\nfile2.ts" }], success: true } },
      { type: "message", role: "assistant", session: PRE_EXISTING_SESSION_URI, messageId: "h-msg-2", content: "Here are the files: file1.ts and file2.ts" }
    ];
    // Track pending permission requests
    this._pendingPermissions = /* @__PURE__ */ new Map();
    // Track the active turn ID per session, captured from sendMessage().
    this._activeTurnIds = /* @__PURE__ */ new Map();
    // Track pending abort callbacks for slow responses
    this._pendingAborts = /* @__PURE__ */ new Map();
    this.didCompleteToolCalls = /* @__PURE__ */ new Set();
    this.chats = {
      createChat: (chatUri, context) => {
        const session = resolveAgentChatContext(context, chatUri).configurationResource;
        if (!this._sessions.has(AgentSession.id(session))) {
          return Promise.resolve(this._createSessionRecord(session));
        }
        throw new Error("Scripted mock agent does not support multiple chats");
      },
      disposeChat: (chat, context) => {
        const { session } = this._resolveChatTarget(chat, context);
        this._sessions.delete(AgentSession.id(session));
        return Promise.resolve();
      },
      releaseChat: async (chat, context) => {
        this._resolveChatTarget(chat, context);
      },
      sendMessage: (chatUri, prompt, _workingDirectoriesOrDirectory, attachments, turnId, _senderClientId, clientTypeOrContext, context) => {
        const operationContext = context ?? (typeof clientTypeOrContext === "string" ? void 0 : clientTypeOrContext);
        const { session, chat } = this._resolveChatTarget(chatUri, operationContext);
        return this.sendMessage(session, chat, prompt, attachments, turnId);
      },
      abort: (chat, context) => {
        const { session } = this._resolveChatTarget(chat, context);
        return this.abortSession(session);
      },
      changeModel: (chat, model, context) => {
        const { session } = this._resolveChatTarget(chat, context);
        return this.changeModel(session, model);
      },
      changeAgent: (chat, _agent, context) => {
        resolveAgentChatContext(context, chat);
        return Promise.resolve();
      },
      getMessages: (chat, context) => {
        return this.getSessionMessages(this._resolveChatTarget(chat, context).session);
      }
    };
    this._sessions.set(AgentSession.id(PRE_EXISTING_SESSION_URI), PRE_EXISTING_SESSION_URI);
    queueMicrotask(() => {
      void this.listExternalChats().then((chats) => {
        if (chats) {
          this.fireDiscoveredChats(chats.map((metadata) => ({ ...metadata, external: true })));
        }
      }, () => {
      });
    });
    const seeded = process.env["VSCODE_AGENT_HOST_MOCK_SEED_SESSIONS"];
    if (seeded) {
      for (const raw of seeded.split(",")) {
        const trimmed = raw.trim();
        if (!trimmed) {
          continue;
        }
        const uri = URI.parse(trimmed);
        this._sessions.set(AgentSession.id(uri), uri);
      }
    }
  }
  getDescriptor() {
    return { provider: "mock", displayName: "Mock Agent", description: "Scripted test agent" };
  }
  getProtectedResources() {
    return [];
  }
  async listExternalChats() {
    return [...this._sessions.values()].map((session) => ({
      chat: URI.parse(buildDefaultChatUri(session)),
      startTime: Date.now(),
      modifiedTime: Date.now(),
      project: mockProject(this.id),
      summary: session.toString() === PRE_EXISTING_SESSION_URI.toString() ? "Pre-existing session" : void 0
    }));
  }
  fireDiscoveredChats(chats) {
    this._discoveredChatsEmitter.fire(chats);
  }
  async listChatsToMigrate() {
    return [];
  }
  async listSessions() {
    return [...this._sessions.values()].map((session) => ({
      session,
      startTime: Date.now(),
      modifiedTime: Date.now(),
      project: mockProject(this.id),
      summary: session.toString() === PRE_EXISTING_SESSION_URI.toString() ? "Pre-existing session" : void 0
    }));
  }
  async getChatMetadata(chat, context) {
    const session = resolveAgentChatContext(context, chat).configurationResource;
    if (!this._sessions.has(AgentSession.id(session))) {
      return void 0;
    }
    return {
      chat,
      startTime: Date.now(),
      modifiedTime: Date.now(),
      project: mockProject(this.id),
      summary: session.toString() === PRE_EXISTING_SESSION_URI.toString() ? "Pre-existing session" : void 0
    };
  }
  async getSessionMetadata(session) {
    return this._sessions.has(AgentSession.id(session)) ? { session, startTime: Date.now(), modifiedTime: Date.now(), project: mockProject(this.id), summary: session.toString() === PRE_EXISTING_SESSION_URI.toString() ? "Pre-existing session" : void 0 } : void 0;
  }
  _createSessionRecord(session) {
    this._sessions.set(AgentSession.id(session), session);
    return { project: mockProject(this.id) };
  }
  async resolveChatConfig(params) {
    const isolation = params.config?.isolation === "folder" || params.config?.isolation === "worktree" ? params.config.isolation : "worktree";
    const branch = isolation === "worktree" && typeof params.config?.branch === "string" ? params.config.branch : "main";
    return {
      schema: {
        type: "object",
        properties: {
          isolation: {
            type: "string",
            title: "Isolation",
            description: "Where the mock agent should make changes",
            enum: ["folder", "worktree"],
            enumLabels: ["Folder", "Worktree"],
            default: "worktree"
          },
          branch: {
            type: "string",
            title: "Branch",
            description: "Base branch to work from",
            enum: ["main"],
            enumLabels: ["main"],
            default: "main",
            enumDynamic: isolation === "worktree",
            readOnly: isolation === "folder"
          }
        }
      },
      values: { isolation, branch }
    };
  }
  resolveSessionConfig(params) {
    return this.resolveChatConfig(params);
  }
  getInheritedChatConfig() {
    return void 0;
  }
  async chatConfigCompletions(params) {
    if (params.property !== "branch") {
      return { items: [] };
    }
    const query = params.query?.toLowerCase() ?? "";
    const branches = ["main", "feature/config", "release"].filter((branch) => branch.toLowerCase().includes(query));
    return { items: branches.map((branch) => ({ value: branch, label: branch })) };
  }
  sessionConfigCompletions(params) {
    return this.chatConfigCompletions(params);
  }
  async sendMessage(session, chat, prompt, _attachments, turnId) {
    if (turnId) {
      this._activeTurnIds.set(uriKey(session), turnId);
      this._activeTurnIds.set(uriKey(chat), turnId);
    }
    const { sessionStr, turnId: tid } = this._ctx(chat);
    switch (prompt) {
      case "hello":
        this._fireSequence([
          _markdown(chat, sessionStr, tid, "Hello, world!"),
          _idle(chat, sessionStr, tid)
        ]);
        break;
      case "use-tool":
        this._fireSequence([
          ..._toolStart(chat, sessionStr, tid, "tc-1", "echo_tool", "Echo Tool", "Running echo tool..."),
          _toolComplete(chat, sessionStr, tid, "tc-1", { pastTenseMessage: "Ran echo tool", content: [{ type: ToolResultContentType.Text, text: "echoed" }], success: true }),
          _markdown(chat, sessionStr, tid, "Tool done."),
          _idle(chat, sessionStr, tid)
        ]);
        break;
      case "error":
        this._fireSequence([
          _error(chat, sessionStr, tid, "test_error", "Something went wrong")
        ]);
        break;
      case "permission": {
        (async () => {
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, tid, "tc-perm-1", "shell", "Shell", "Run a test command")) {
            this._onDidChatProgress.fire(s);
          }
          await timeout(5);
          this._onDidChatProgress.fire(_pendingConfirmation(chat, "tc-perm-1", "Run a test command", { toolInput: "echo test", confirmationTitle: "Run a test command" }));
        })();
        this._pendingPermissions.set("tc-perm-1", (approved) => {
          if (approved) {
            this._fireSequence([
              _markdown(chat, sessionStr, tid, "Allowed."),
              _idle(chat, sessionStr, tid)
            ]);
          }
        });
        break;
      }
      case "write-file": {
        (async () => {
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, tid, "tc-write-1", "create", "Create File", "Create file")) {
            this._onDidChatProgress.fire(s);
          }
          await timeout(5);
          this._onDidChatProgress.fire(_pendingConfirmation(chat, "tc-write-1", "Write src/app.ts", { permissionKind: "write", permissionPath: "/workspace/src/app.ts" }));
          await timeout(10);
          this._fireSequence([
            _toolComplete(chat, sessionStr, tid, "tc-write-1", { pastTenseMessage: "Wrote file", content: [{ type: ToolResultContentType.Text, text: "ok" }], success: true }),
            _idle(chat, sessionStr, tid)
          ]);
        })();
        break;
      }
      case "write-env": {
        (async () => {
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, tid, "tc-write-env-1", "create", "Create File", "Create file")) {
            this._onDidChatProgress.fire(s);
          }
          await timeout(5);
          this._onDidChatProgress.fire(_pendingConfirmation(chat, "tc-write-env-1", "Write .env", { permissionKind: "write", permissionPath: "/workspace/.env", confirmationTitle: "Write .env" }));
        })();
        this._pendingPermissions.set("tc-write-env-1", (approved) => {
          if (approved) {
            this._fireSequence([
              _toolComplete(chat, sessionStr, tid, "tc-write-env-1", { pastTenseMessage: "Wrote .env", content: [{ type: ToolResultContentType.Text, text: "ok" }], success: true }),
              _idle(chat, sessionStr, tid)
            ]);
          }
        });
        break;
      }
      case "run-safe-command": {
        (async () => {
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, tid, "tc-shell-1", "bash", "Run Command", "Run command")) {
            this._onDidChatProgress.fire(s);
          }
          await timeout(5);
          this._onDidChatProgress.fire(_pendingConfirmation(chat, "tc-shell-1", "ls -la", { permissionKind: "shell", toolInput: "ls -la" }));
          await timeout(10);
          this._fireSequence([
            _toolComplete(chat, sessionStr, tid, "tc-shell-1", { pastTenseMessage: "Ran command", content: [{ type: ToolResultContentType.Text, text: "file1.ts\nfile2.ts" }], success: true }),
            _idle(chat, sessionStr, tid)
          ]);
        })();
        break;
      }
      case "run-dangerous-command": {
        (async () => {
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, tid, "tc-shell-deny-1", "bash", "Run Command", "Run command")) {
            this._onDidChatProgress.fire(s);
          }
          await timeout(5);
          this._onDidChatProgress.fire(_pendingConfirmation(chat, "tc-shell-deny-1", "rm -rf /", { permissionKind: "shell", toolInput: "rm -rf /", confirmationTitle: "Run in terminal" }));
        })();
        this._pendingPermissions.set("tc-shell-deny-1", (approved) => {
          if (approved) {
            this._fireSequence([
              _toolComplete(chat, sessionStr, tid, "tc-shell-deny-1", { pastTenseMessage: "Ran command", content: [{ type: ToolResultContentType.Text, text: "" }], success: true }),
              _idle(chat, sessionStr, tid)
            ]);
          }
        });
        break;
      }
      case "orphan-confirmation": {
        (async () => {
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, tid, "tc-orphan-initial", "bash", "Run Command", "Run command")) {
            this._onDidChatProgress.fire(s);
          }
          await timeout(5);
          this._onDidChatProgress.fire(_toolComplete(chat, sessionStr, tid, "tc-orphan-initial", { pastTenseMessage: "Ran command", content: [{ type: ToolResultContentType.Text, text: "ok" }], success: true }));
          await timeout(5);
          this._onDidChatProgress.fire(_idle(chat, sessionStr, tid));
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, "", "tc-orphan", "view", "Read", "Read file")) {
            this._onDidChatProgress.fire(s);
          }
          await timeout(5);
          this._onDidChatProgress.fire(_pendingConfirmation(chat, "tc-orphan", "Read file", { permissionKind: "read", permissionPath: "/workspace/file.ts" }));
        })();
        this._pendingPermissions.set("tc-orphan", (approved) => {
          if (approved) {
            this._fireSequence([
              _toolComplete(chat, sessionStr, tid, "tc-orphan", { pastTenseMessage: "Read file", content: [{ type: ToolResultContentType.Text, text: "contents" }], success: true }),
              _markdown(chat, sessionStr, tid, "continued-after-hook"),
              _idle(chat, sessionStr, tid)
            ]);
          }
        });
        break;
      }
      case "with-usage":
        this._fireSequence([
          _markdown(chat, sessionStr, tid, "Usage response."),
          _usage(chat, sessionStr, tid, { inputTokens: 100, outputTokens: 50, model: "mock-model", _meta: { cost: 0.5 } }),
          _idle(chat, sessionStr, tid)
        ]);
        break;
      case "with-reasoning": {
        const initialReasoning = _reasoning(chat, sessionStr, tid, "Let me think");
        const partId = initialReasoning.action.type === ActionType.ChatResponsePart && hasKey(initialReasoning.action.part, { id: true }) ? initialReasoning.action.part.id : "";
        this._fireSequence([
          initialReasoning,
          _action(chat, {
            type: ActionType.ChatReasoning,
            turnId: tid,
            partId,
            content: " about this..."
          }),
          _markdown(chat, sessionStr, tid, "Reasoned response."),
          _idle(chat, sessionStr, tid)
        ]);
        break;
      }
      case "with-title":
        this._fireSequence([
          _markdown(chat, sessionStr, tid, "Title response."),
          _titleChanged(session, sessionStr, MOCK_AUTO_TITLE),
          _idle(chat, sessionStr, tid)
        ]);
        break;
      case "slow": {
        const timer = setTimeout(() => {
          const ctx = this._ctx(chat);
          this._fireSequence([
            _markdown(chat, ctx.sessionStr, ctx.turnId, "Slow response."),
            _idle(chat, ctx.sessionStr, ctx.turnId)
          ]);
        }, 5e3);
        this._pendingAborts.set(session.toString(), () => clearTimeout(timer));
        break;
      }
      case "client-tool": {
        (async () => {
          await timeout(10);
          this._onDidChatProgress.fire(_action(chat, {
            type: ActionType.ChatToolCallStart,
            turnId: tid,
            toolCallId: "tc-client-1",
            toolName: "runTests",
            displayName: "Run Tests",
            contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client-tool" }
          }));
          await timeout(5);
          this._onDidChatProgress.fire(_pendingConfirmation(chat, "tc-client-1", "Running tests...", { toolInput: "{}" }));
        })();
        this._pendingPermissions.set("tc-client-1", () => {
          this._fireSequence([
            _markdown(chat, sessionStr, tid, "Client tool done."),
            _idle(chat, sessionStr, tid)
          ]);
        });
        break;
      }
      case "client-tool-with-permission": {
        (async () => {
          await timeout(10);
          this._onDidChatProgress.fire(_action(chat, {
            type: ActionType.ChatToolCallStart,
            turnId: tid,
            toolCallId: "tc-client-perm-1",
            toolName: "runTests",
            displayName: "Run Tests",
            contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client-tool" }
          }));
          await timeout(5);
          this._onDidChatProgress.fire(_pendingConfirmation(chat, "tc-client-perm-1", "Run tests on project", { confirmationTitle: "Allow Run Tests?" }));
        })();
        this._pendingPermissions.set("tc-client-perm-1", (approved) => {
          if (approved) {
            this._fireSequence([
              _toolComplete(chat, sessionStr, tid, "tc-client-perm-1", { pastTenseMessage: "Ran tests", content: [{ type: ToolResultContentType.Text, text: "all passed" }], success: true }),
              _markdown(chat, sessionStr, tid, "Permission granted, tool done."),
              _idle(chat, sessionStr, tid)
            ]);
          }
        });
        break;
      }
      case "subagent": {
        this._fireSequence([
          ..._toolStart(chat, sessionStr, tid, "tc-task-1", "task", "Task", "Spawning subagent", { toolKind: "subagent", subagentAgentName: "explore", subagentDescription: "Explore" }),
          { kind: "subagent_started", chat, toolCallId: "tc-task-1", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Exploration helper" },
          ..._toolStart(chat, sessionStr, tid, "tc-inner-1", "echo_tool", "Echo Tool", "Inner tool running...", { parentToolCallId: "tc-task-1" }),
          _toolComplete(chat, sessionStr, tid, "tc-inner-1", { pastTenseMessage: "Ran inner tool", content: [{ type: ToolResultContentType.Text, text: "inner-ok" }], success: true }, "tc-task-1"),
          { kind: "subagent_completed", chat, toolCallId: "tc-task-1" },
          _toolComplete(chat, sessionStr, tid, "tc-task-1", { pastTenseMessage: "Subagent done", content: [{ type: ToolResultContentType.Text, text: "task-ok" }], success: true }),
          _markdown(chat, sessionStr, tid, "Subagent finished."),
          _idle(chat, sessionStr, tid)
        ]);
        break;
      }
      default:
        if (prompt.startsWith("terminal-edit:")) {
          const filePath = prompt.slice("terminal-edit:".length);
          void (async () => {
            for (const s of _toolStart(chat, sessionStr, tid, "tc-term-edit-1", "bash", "Run Command", "Edit file via shell")) {
              this._onDidChatProgress.fire(s);
            }
            const fs = await import("fs/promises");
            await fs.writeFile(filePath, "edited-from-terminal\n");
            this._fireSequence([
              _toolComplete(chat, sessionStr, tid, "tc-term-edit-1", { pastTenseMessage: "Edited file", content: [{ type: ToolResultContentType.Text, text: "ok" }], success: true }),
              _idle(chat, sessionStr, tid)
            ]);
          })().catch((err) => {
            this._fireSequence([
              _markdown(chat, sessionStr, tid, "terminal-edit failed: " + (err instanceof Error ? err.message : String(err))),
              _idle(chat, sessionStr, tid)
            ]);
          });
          break;
        }
        this._fireSequence([
          _markdown(chat, sessionStr, tid, "Unknown prompt: " + prompt),
          _idle(chat, sessionStr, tid)
        ]);
        break;
    }
  }
  setPendingMessages(chat, steeringMessage, _queuedMessages) {
    if (steeringMessage) {
      timeout(20).then(() => {
        this._onDidChatProgress.fire({ kind: "steering_consumed", chat: isAhpChatChannel(chat.toString()) ? chat : URI.parse(buildDefaultChatUri(chat)), id: steeringMessage.id });
      });
    }
  }
  getOrCreateActiveClient(_chat, _context, client, _hostCustomizations) {
    let tools = [];
    let customizations = [];
    return {
      clientId: client.clientId,
      displayName: client.displayName,
      get tools() {
        return tools;
      },
      set tools(value) {
        tools = value;
      },
      get customizations() {
        return customizations;
      },
      set customizations(value) {
        customizations = value;
      }
    };
  }
  removeActiveClient() {
  }
  onClientToolCallComplete(chat, toolCallId, result) {
    const key = `${chat.toString()}:${toolCallId}`;
    if (this.didCompleteToolCalls.has(key)) {
      return;
    }
    this.didCompleteToolCalls.add(key);
    const { sessionStr, turnId } = this._ctx(chat);
    this._onDidChatProgress.fire(_toolComplete(chat, sessionStr, turnId, toolCallId, result));
    const callback = this._pendingPermissions.get(toolCallId);
    if (callback) {
      this._pendingPermissions.delete(toolCallId);
      callback(true);
    }
  }
  async getSessionMessages(session) {
    const subagentInfo = parseSubagentSessionUri(session);
    if (subagentInfo) {
      return buildSubagentTurnsFromHistory(this._preExistingMessages, subagentInfo.toolCallId, session.toString());
    }
    const parsed = parseChatUri(session);
    const normalized = parsed && isDefaultChatUri(session) ? URI.parse(parsed.session) : session;
    if (normalized.toString() === PRE_EXISTING_SESSION_URI.toString()) {
      return buildTurnsFromHistory(this._preExistingMessages);
    }
    return [];
  }
  async abortSession(session) {
    const callback = this._pendingAborts.get(session.toString());
    if (callback) {
      this._pendingAborts.delete(session.toString());
      callback();
    }
  }
  async changeModel(_session, _model) {
  }
  /**
   * Map an already-resolved chat URI to the `(session, chat)` pair the
   * scripted mock's per-chat context is keyed by.
   */
  _resolveChatTarget(chat, context) {
    if (context) {
      return { session: resolveAgentChatContext(context, chat).configurationResource, chat };
    }
    const parsed = parseChatUri(chat);
    if (!parsed) {
      throw new Error(`Scripted mock chat operation requires an AHP chat URI: ${chat.toString()}`);
    }
    return { session: URI.parse(parsed.session), chat: URI.parse(chat.toString()) };
  }
  async materializeChat(_chat, _context, _providerData) {
  }
  async finalizeSession(session, _context) {
    this._sessions.delete(AgentSession.id(session));
  }
  async getChatCustomizations() {
    return [];
  }
  async truncateChat(_chat, _turnId, _context) {
  }
  respondToPermissionRequest(toolCallId, approved) {
    const callback = this._pendingPermissions.get(toolCallId);
    if (callback) {
      this._pendingPermissions.delete(toolCallId);
      callback(approved);
    }
  }
  respondToUserInputRequest() {
  }
  async authenticate(_resource, _token) {
    return true;
  }
  async shutdown() {
  }
  dispose() {
    this._discoveredChatsEmitter.dispose();
    this._onDidChatProgress.dispose();
  }
  /**
   * Fires a sequence of {@link AgentSignal}s with staggered 10 ms delays
   * so the state manager processes them in order.
   */
  _fireSequence(signals) {
    let delay = 0;
    for (const signal of signals) {
      delay += 10;
      setTimeout(() => this._onDidChatProgress.fire(signal), delay);
    }
  }
  /** Builds the session-string + turnId context for signal construction. */
  _ctx(session) {
    return {
      sessionStr: session.toString(),
      turnId: this._activeTurnIds.get(uriKey(session)) ?? "mock-turn"
    };
  }
}
let _mockPartIdCounter = 0;
function _action(session, action, parentToolCallId) {
  return { kind: "action", resource: session, action, parentToolCallId };
}
function _markdown(session, sessionStr, turnId, content, parentToolCallId) {
  return _action(session, {
    type: ActionType.ChatResponsePart,
    turnId,
    part: { kind: ResponsePartKind.Markdown, id: `mock-md-${++_mockPartIdCounter}`, content }
  }, parentToolCallId);
}
function _reasoning(session, sessionStr, turnId, content) {
  return _action(session, {
    type: ActionType.ChatResponsePart,
    turnId,
    part: { kind: ResponsePartKind.Reasoning, id: `mock-rs-${++_mockPartIdCounter}`, content }
  });
}
function _idle(session, sessionStr, turnId) {
  return _action(session, { type: ActionType.ChatTurnComplete, turnId, duration: 1 });
}
function _error(session, sessionStr, turnId, errorType, message, stack) {
  return _action(session, { type: ActionType.ChatError, turnId, duration: 1, error: { errorType, message, stack } });
}
function _titleChanged(session, sessionStr, title) {
  return _action(session, { type: ActionType.SessionTitleChanged, title });
}
function _usage(session, sessionStr, turnId, usage) {
  return _action(session, { type: ActionType.ChatUsage, turnId, usage });
}
function _toolStart(session, sessionStr, turnId, toolCallId, toolName, displayName, invocationMessage, opts) {
  const meta = {};
  if (opts?.toolKind) {
    meta.toolKind = opts.toolKind;
  }
  if (opts?.subagentAgentName) {
    meta.subagentAgentName = opts.subagentAgentName;
  }
  if (opts?.subagentDescription) {
    meta.subagentDescription = opts.subagentDescription;
  }
  const signals = [_action(session, {
    type: ActionType.ChatToolCallStart,
    turnId,
    toolCallId,
    toolName,
    displayName,
    contributor: opts?.toolClientId ? { kind: ToolCallContributorKind.Client, clientId: opts.toolClientId } : void 0,
    _meta: Object.keys(meta).length ? meta : void 0
  }, opts?.parentToolCallId)];
  if (!opts?.toolClientId) {
    signals.push(_action(session, {
      type: ActionType.ChatToolCallReady,
      turnId,
      toolCallId,
      invocationMessage,
      toolInput: opts?.toolInput,
      confirmed: ToolCallConfirmationReason.NotNeeded
    }, opts?.parentToolCallId));
  }
  return signals;
}
function _toolComplete(session, sessionStr, turnId, toolCallId, result, parentToolCallId) {
  return _action(session, { type: ActionType.ChatToolCallComplete, turnId, toolCallId, result }, parentToolCallId);
}
function _pendingConfirmation(session, toolCallId, invocationMessage, opts) {
  return {
    kind: "pending_confirmation",
    chat: session,
    state: {
      status: ToolCallStatus.PendingConfirmation,
      toolCallId,
      toolName: "",
      displayName: "",
      invocationMessage,
      toolInput: opts?.toolInput,
      confirmationTitle: opts?.confirmationTitle
    },
    permissionKind: opts?.permissionKind,
    permissionPath: opts?.permissionPath
  };
}
export {
  MOCK_AUTO_TITLE,
  MockAgent,
  PRE_EXISTING_SESSION_URI,
  ScriptedMockAgent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxtb2NrQWdlbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB0eXBlIHsgSUF1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2F1dGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudFR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5pbXBvcnQgeyB0eXBlIElTeW5jZWRDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50UGx1Z2luTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIHR5cGUgQWdlbnRQcm92aWRlciwgdHlwZSBBZ2VudFNpZ25hbCwgdHlwZSBJQWN0aXZlQ2xpZW50LCB0eXBlIElBZ2VudCwgdHlwZSBJQWdlbnRBY3Rpb25TaWduYWwsIHR5cGUgSUFnZW50Q2hhdENvbmZpZ0NvbXBsZXRpb25zUGFyYW1zLCB0eXBlIElBZ2VudENoYXRDb250ZXh0LCB0eXBlIElBZ2VudENoYXRNZXRhZGF0YSwgdHlwZSBJQWdlbnRDaGF0cywgdHlwZSBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucywgdHlwZSBJQWdlbnRDcmVhdGVDaGF0UmVzdWx0LCB0eXBlIElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIHR5cGUgSUFnZW50RGVzY3JpcHRvciwgdHlwZSBJQWdlbnREaXNjb3ZlcmVkQ2hhdCwgdHlwZSBJQWdlbnRNb2RlbEluZm8sIHR5cGUgSUFnZW50UmVzb2x2ZUNoYXRDb25maWdQYXJhbXMsIHR5cGUgSUFnZW50U2Vzc2lvbk1ldGFkYXRhLCB0eXBlIElBZ2VudFRvb2xQZW5kaW5nQ29uZmlybWF0aW9uU2lnbmFsLCByZXNvbHZlQWdlbnRDaGF0Q29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBidWlsZFN1YmFnZW50VHVybnNGcm9tSGlzdG9yeSwgYnVpbGRUdXJuc0Zyb21IaXN0b3J5LCB0eXBlIElIaXN0b3J5UmVjb3JkIH0gZnJvbSAnLi9oaXN0b3J5UmVjb3JkRml4dHVyZXMuanMnO1xuaW1wb3J0IHsgUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIHR5cGUgQWdlbnRTZWxlY3Rpb24sIHR5cGUgTWVzc2FnZUF0dGFjaG1lbnQsIHR5cGUgTW9kZWxTZWxlY3Rpb24sIHR5cGUgVG9vbERlZmluaXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCwgU2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQXV0aFJlcXVpcmVkUGFyYW1zIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IFJlc3BvbnNlUGFydEtpbmQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbFN0YXR1cywgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCBDdXN0b21pemF0aW9uTG9hZFN0YXR1cywgYnVpbGREZWZhdWx0Q2hhdFVyaSwgaXNBaHBDaGF0Q2hhbm5lbCwgaXNEZWZhdWx0Q2hhdFVyaSwgcGFyc2VDaGF0VXJpLCBwYXJzZVN1YmFnZW50U2Vzc2lvblVyaSwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgUGVuZGluZ01lc3NhZ2UsIHR5cGUgU3RyaW5nT3JNYXJrZG93biwgdHlwZSBUb29sQ2FsbFJlc3VsdCwgdHlwZSBUdXJuLCB0eXBlIFVzYWdlSW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG4vKiogV2VsbC1rbm93biBhdXRvLWdlbmVyYXRlZCB0aXRsZSB1c2VkIGJ5IHRoZSAnd2l0aC10aXRsZScgcHJvbXB0LiAqL1xuZXhwb3J0IGNvbnN0IE1PQ0tfQVVUT19USVRMRSA9ICdBdXRvbWF0aWNhbGx5IGdlbmVyYXRlZCB0aXRsZSc7XG5cbmZ1bmN0aW9uIHVyaUtleShzZXNzaW9uOiBVUkkpOiBzdHJpbmcge1xuXHQvLyBCdWlsZCBhIHN0YWJsZSBrZXkgZnJvbSByYXcgVVJJIGZpZWxkcyB3aXRob3V0IGludm9raW5nIGB0b1N0cmluZygpYCxcblx0Ly8gd2hpY2ggd291bGQgbXV0YXRlIHRoZSBVUkkncyBgX2Zvcm1hdHRlZGAgY2FjaGUgYW5kIGJyZWFrXG5cdC8vIGBhc3NlcnQuZGVlcFN0cmljdEVxdWFsYCBjb21wYXJpc29ucyBpbiB0ZXN0cyB0aGF0IGNhcHR1cmUgdGhlIFVSSVxuXHQvLyBiZWZvcmUgaXQgaXMgb2JzZXJ2ZWQgZWxzZXdoZXJlLlxuXHRyZXR1cm4gYCR7c2Vzc2lvbi5zY2hlbWV9Oi8vJHtzZXNzaW9uLmF1dGhvcml0eX0ke3Nlc3Npb24ucGF0aH0ke3Nlc3Npb24ucXVlcnkgPyAnPycgKyBzZXNzaW9uLnF1ZXJ5IDogJyd9JHtzZXNzaW9uLmZyYWdtZW50ID8gJyMnICsgc2Vzc2lvbi5mcmFnbWVudCA6ICcnfWA7XG59XG5cbmZ1bmN0aW9uIG1vY2tQcm9qZWN0KHByb3ZpZGVyOiBBZ2VudFByb3ZpZGVyKSB7XG5cdHJldHVybiB7IHVyaTogVVJJLmZyb20oeyBzY2hlbWU6ICdtb2NrLXByb2plY3QnLCBwYXRoOiBgLyR7cHJvdmlkZXJ9YCB9KSwgZGlzcGxheU5hbWU6IGBBZ2VudCAke3Byb3ZpZGVyfWAgfTtcbn1cblxuaW50ZXJmYWNlIElNb2NrU2VuZE1lc3NhZ2VDYWxsIHtcblx0cmVhZG9ubHkgc2Vzc2lvbjogVVJJO1xuXHRyZWFkb25seSBwcm9tcHQ6IHN0cmluZztcblx0cmVhZG9ubHkgYXR0YWNobWVudHM/OiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdO1xuXHRyZWFkb25seSBjaGF0PzogVVJJO1xuXHRyZWFkb25seSBzZW5kZXJDbGllbnRJZD86IHN0cmluZztcblx0cmVhZG9ubHkgY2xpZW50VHlwZT86IEFnZW50SG9zdENsaWVudFR5cGU7XG59XG5cbi8qKlxuICogR2VuZXJhbC1wdXJwb3NlIG1vY2sgYWdlbnQgZm9yIHVuaXQgdGVzdHMuIFRyYWNrcyBhbGwgbWV0aG9kIGNhbGxzXG4gKiBmb3IgYXNzZXJ0aW9uIGFuZCBleHBvc2VzIHtAbGluayBmaXJlUHJvZ3Jlc3N9IHRvIGluamVjdCBwcm9ncmVzcyBldmVudHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBNb2NrQWdlbnQgaW1wbGVtZW50cyBJQWdlbnQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNjb3ZlcmVkQ2hhdHNFbWl0dGVyID0gbmV3IEVtaXR0ZXI8cmVhZG9ubHkgSUFnZW50RGlzY292ZXJlZENoYXRbXT4oKTtcblx0cmVhZG9ubHkgb25EaWREaXNjb3ZlckNoYXRzID0gdGhpcy5fZGlzY292ZXJlZENoYXRzRW1pdHRlci5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGF0UHJvZ3Jlc3MgPSBuZXcgRW1pdHRlcjxBZ2VudFNpZ25hbD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGF0UHJvZ3Jlc3MgPSB0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5ldmVudDtcblx0cmVhZG9ubHkgb25EaWRNYXRlcmlhbGl6ZUNoYXQgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNoYXREYXRhID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRTcGF3bkNoYXQgPSBFdmVudC5Ob25lO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlbmRNZXNzYWdlID0gbmV3IEVtaXR0ZXI8SU1vY2tTZW5kTWVzc2FnZUNhbGw+KCk7XG5cdHJlYWRvbmx5IG9uRGlkU2VuZE1lc3NhZ2UgPSB0aGlzLl9vbkRpZFNlbmRNZXNzYWdlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW10+KHRoaXMsIFtdKTtcblx0cmVhZG9ubHkgbW9kZWxzID0gdGhpcy5fbW9kZWxzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvblJlcXVpcmVkID0gb2JzZXJ2YWJsZVZhbHVlPE9taXQ8QXV0aFJlcXVpcmVkUGFyYW1zLCAnY2hhbm5lbCc+IHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSBhdXRoZW50aWNhdGlvblJlcXVpcmVkID0gdGhpcy5fYXV0aGVudGljYXRpb25SZXF1aXJlZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBVUkk+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXRpYWxDaGF0cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHQvKiogQWN0aXZlIHR1cm4gSURzIHBlciBzZXNzaW9uLCBjYXB0dXJlZCBmcm9tIHNlbmRNZXNzYWdlKCkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVR1cm5JZHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cblx0cmVhZG9ubHkgc2VuZE1lc3NhZ2VDYWxsczogSU1vY2tTZW5kTWVzc2FnZUNhbGxbXSA9IFtdO1xuXHRyZWFkb25seSBzZXRQZW5kaW5nTWVzc2FnZXNDYWxsczogeyBjaGF0OiBVUkk7IHN0ZWVyaW5nTWVzc2FnZTogUGVuZGluZ01lc3NhZ2UgfCB1bmRlZmluZWQ7IHF1ZXVlZE1lc3NhZ2VzOiByZWFkb25seSBQZW5kaW5nTWVzc2FnZVtdIH1bXSA9IFtdO1xuXHRyZWFkb25seSBkaXNwb3NlU2Vzc2lvbkNhbGxzOiBVUklbXSA9IFtdO1xuXHRyZWFkb25seSByZWxlYXNlU2Vzc2lvbkNhbGxzOiBVUklbXSA9IFtdO1xuXHRyZWFkb25seSBhYm9ydFNlc3Npb25DYWxsczogVVJJW10gPSBbXTtcblx0cmVhZG9ubHkgcmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzOiB7IHJlcXVlc3RJZDogc3RyaW5nOyBhcHByb3ZlZDogYm9vbGVhbiB9W10gPSBbXTtcblx0cmVhZG9ubHkgY2hhbmdlTW9kZWxDYWxsczogeyBzZXNzaW9uOiBVUkk7IG1vZGVsOiBNb2RlbFNlbGVjdGlvbjsgY2hhdD86IFVSSSB9W10gPSBbXTtcblx0cmVhZG9ubHkgY2hhbmdlQWdlbnRDYWxsczogeyBzZXNzaW9uOiBVUkk7IGFnZW50OiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZDsgY2hhdD86IFVSSSB9W10gPSBbXTtcblx0cmVhZG9ubHkgYXV0aGVudGljYXRlQ2FsbHM6IHsgcmVzb3VyY2U6IHN0cmluZzsgdG9rZW46IHN0cmluZyB9W10gPSBbXTtcblx0cmVhZG9ubHkgc2V0Q2xpZW50Q3VzdG9taXphdGlvbnNDYWxsczogeyBjbGllbnRJZDogc3RyaW5nOyBjdXN0b21pemF0aW9uczogQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdIH1bXSA9IFtdO1xuXHRyZWFkb25seSBzZXRDbGllbnRUb29sc0NhbGxzOiB7IGNsaWVudElkOiBzdHJpbmc7IHRvb2xzOiByZWFkb25seSBUb29sRGVmaW5pdGlvbltdIH1bXSA9IFtdO1xuXHRyZWFkb25seSByZW1vdmVBY3RpdmVDbGllbnRDYWxsczogeyBjaGF0OiBVUkk7IGNsaWVudElkOiBzdHJpbmcgfVtdID0gW107XG5cdC8qKlxuXHQgKiBFdmVyeSBob3N0LXN1cHBsaWVkIHtAbGluayBJQWdlbnRDaGF0Q29udGV4dH0gdGhpcyBhZ2VudCB3YXMgaGFuZGVkLFxuXHQgKiBrZXllZCBieSB0aGUgYm91bmRhcnkgaXQgYXJyaXZlZCBhdC4gTGV0cyBzaGFyZWQgdGVzdHMgYXNzZXJ0IHRoYXQgQWdlbnRcblx0ICogSG9zdCBzdGFtcHMgdGhlIGV4aGF1c3RpdmUgYGtpbmRgIC8gYG9yaWdpbmAgLyBgY3VzdG9taXphdGlvbnNgIHNlYW0gb25cblx0ICogZXZlcnkgYWRkcmVzc2VkIGNoYXQgb3BlcmF0aW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgY2hhdENvbnRleHRzOiB7IGJvdW5kYXJ5OiBzdHJpbmc7IGNoYXQ6IFVSSTsgY29udGV4dDogSUFnZW50Q2hhdENvbnRleHQgfCBVUkkgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdC8qKiBBY3RpdmUtY2xpZW50IGZhbi1vdXQgcmVjb3JkZWQgZXhhY3RseSBhcyBBZ2VudCBIb3N0IHN1cHBsaWVkIGl0LiAqL1xuXHRyZWFkb25seSBhY3RpdmVDbGllbnRDYWxsczogeyBjaGF0OiBVUkk7IGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0OyBjbGllbnRJZDogc3RyaW5nOyBob3N0Q3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0LyoqIEhvc3QgY3VzdG9taXphdGlvbnMgaGFuZGVkIHRvIHtAbGluayBnZXRDaGF0Q3VzdG9taXphdGlvbnN9LiAqL1xuXHRyZWFkb25seSBzZXNzaW9uQ3VzdG9taXphdGlvbnNDYWxsczogeyBzZXNzaW9uOiBVUkk7IGhvc3RDdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRyZWFkb25seSBjbGllbnRUb29sQ2FsbENvbXBsZXRlQ2FsbHM6IHsgY2hhdDogVVJJOyB0b29sQ2FsbElkOiBzdHJpbmc7IHJlc3VsdDogVG9vbENhbGxSZXN1bHQ7IGNvbnRleHQ/OiBJQWdlbnRDaGF0Q29udGV4dCB9W10gPSBbXTtcblx0cmVhZG9ubHkgdHJ1bmNhdGVDaGF0Q2FsbHM6IHsgY2hhdDogVVJJOyB0dXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdC8qKiBDb25maWd1cmFibGUgcmV0dXJuIHZhbHVlIGZvciBnZXRDdXN0b21pemF0aW9ucy4gKi9cblx0Y3VzdG9taXphdGlvbnM6IEN1c3RvbWl6YXRpb25bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZSA9IHRoaXMuX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UuZXZlbnQ7XG5cdGdldFNlc3Npb25DdXN0b21pemF0aW9ucz86IChzZXNzaW9uOiBVUkksIGhvc3RDdXN0b21pemF0aW9ucz86IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSkgPT4gUHJvbWlzZTxyZWFkb25seSBDdXN0b21pemF0aW9uW10+O1xuXHRnZXRDaGF0Q3VzdG9taXphdGlvbnMgPSBhc3luYyAoX2NoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQsIGhvc3RDdXN0b21pemF0aW9ucz86IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSk6IFByb21pc2U8cmVhZG9ubHkgQ3VzdG9taXphdGlvbltdPiA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblJlc291cmNlID0gVVJJLmlzVXJpKGNvbnRleHQpID8gY29udGV4dCA6IGNvbnRleHQuY29uZmlndXJhdGlvblJlc291cmNlO1xuXHRcdHRoaXMuc2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2FsbHMucHVzaCh7IHNlc3Npb246IGNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgaG9zdEN1c3RvbWl6YXRpb25zIH0pO1xuXHRcdHJldHVybiB0aGlzLmdldFNlc3Npb25DdXN0b21pemF0aW9ucz8uKGNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgaG9zdEN1c3RvbWl6YXRpb25zKSA/PyB0aGlzLmN1c3RvbWl6YXRpb25zO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiBDb25maWd1cmFibGUgc2Vzc2lvbiBoaXN0b3J5LiBUZXN0cyBjb25zdHJ1Y3Qge0BsaW5rIElIaXN0b3J5UmVjb3JkfVxuXHQgKiBlbnRyaWVzICh0aGUgYWdlbnQtaW50ZXJuYWwgaW50ZXJtZWRpYXRlIHNoYXBlKSBhbmQgdGhlIG1vY2sgY29udmVydHNcblx0ICogdGhlbSB0byB7QGxpbmsgVHVybn1zIG9uIGRlbWFuZC4gU3ViYWdlbnQgVVJJcyBhcmUgcm91dGVkIHRvIGZpbHRlcmVkXG5cdCAqIHN1YmFnZW50IHR1cm5zIHZpYSB7QGxpbmsgYnVpbGRTdWJhZ2VudFR1cm5zRnJvbUhpc3Rvcnl9LlxuXHQgKi9cblx0c2Vzc2lvbk1lc3NhZ2VzOiBJSGlzdG9yeVJlY29yZFtdID0gW107XG5cdC8qKiBVc2FnZSBzdGFtcGVkIG9udG8gZXZlcnkgcmVjb25zdHJ1Y3RlZCB0dXJuIChlLmcuIGFuIEF1dG8tbW9kZWwgc3R1YikuICovXG5cdHR1cm5Vc2FnZU92ZXJyaWRlOiBVc2FnZUluZm8gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0LyoqIE9wdGlvbmFsIG92ZXJyaWRlcyBhcHBsaWVkIHRvIHNlc3Npb24gbWV0YWRhdGEgZnJvbSBsaXN0U2Vzc2lvbnMuICovXG5cdHNlc3Npb25NZXRhZGF0YU92ZXJyaWRlczogUGFydGlhbDxPbWl0PElBZ2VudFNlc3Npb25NZXRhZGF0YSwgJ3Nlc3Npb24nPj4gPSB7fTtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBpZDogQWdlbnRQcm92aWRlciA9ICdtb2NrJykge1xuXHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdHZvaWQgdGhpcy5saXN0RXh0ZXJuYWxDaGF0cygpLnRoZW4oY2hhdHMgPT4ge1xuXHRcdFx0XHRpZiAoY2hhdHMpIHtcblx0XHRcdFx0XHR0aGlzLmZpcmVEaXNjb3ZlcmVkQ2hhdHMoY2hhdHMubWFwKG1ldGFkYXRhID0+ICh7IC4uLm1ldGFkYXRhLCBleHRlcm5hbDogdHJ1ZSB9KSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAoKSA9PiB7IH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0c2V0QXV0aGVudGljYXRpb25SZXF1aXJlZChyZXF1aXJlbWVudDogT21pdDxBdXRoUmVxdWlyZWRQYXJhbXMsICdjaGFubmVsJz4gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9hdXRoZW50aWNhdGlvblJlcXVpcmVkLnNldChyZXF1aXJlbWVudCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdGdldERlc2NyaXB0b3IoKTogSUFnZW50RGVzY3JpcHRvciB7XG5cdFx0cmV0dXJuIHsgcHJvdmlkZXI6IHRoaXMuaWQsIGRpc3BsYXlOYW1lOiBgQWdlbnQgJHt0aGlzLmlkfWAsIGRlc2NyaXB0aW9uOiBgVGVzdCAke3RoaXMuaWR9IGFnZW50YCwgY2FwYWJpbGl0aWVzOiB7IG11bHRpcGxlQ2hhdHM6IHsgZm9yazogdHJ1ZSB9IH0gfTtcblx0fVxuXG5cdGdldFByb3RlY3RlZFJlc291cmNlcygpOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhW10ge1xuXHRcdGlmICh0aGlzLmlkID09PSAnY29waWxvdCcpIHtcblx0XHRcdHJldHVybiBbeyByZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCBhdXRob3JpemF0aW9uX3NlcnZlcnM6IFsnaHR0cHM6Ly9naXRodWIuY29tL2xvZ2luL29hdXRoJ10sIHJlcXVpcmVkOiB0cnVlIH1dO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRzZXRNb2RlbHMobW9kZWxzOiByZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXSk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVscy5zZXQobW9kZWxzLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0YXN5bmMgbGlzdEV4dGVybmFsQ2hhdHMoKTogUHJvbWlzZTxJQWdlbnRDaGF0TWV0YWRhdGFbXT4ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fc2Vzc2lvbnMudmFsdWVzKCldLm1hcChzZXNzaW9uID0+ICh7IGNoYXQ6IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKSwgc3RhcnRUaW1lOiBEYXRlLm5vdygpLCBtb2RpZmllZFRpbWU6IERhdGUubm93KCksIHByb2plY3Q6IG1vY2tQcm9qZWN0KHRoaXMuaWQpLCAuLi50aGlzLnNlc3Npb25NZXRhZGF0YU92ZXJyaWRlcyB9KSk7XG5cdH1cblxuXHRmaXJlRGlzY292ZXJlZENoYXRzKGNoYXRzOiByZWFkb25seSBJQWdlbnREaXNjb3ZlcmVkQ2hhdFtdKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzY292ZXJlZENoYXRzRW1pdHRlci5maXJlKGNoYXRzKTtcblx0fVxuXG5cdGFzeW5jIGxpc3RDaGF0c1RvTWlncmF0ZSgpOiBQcm9taXNlPElBZ2VudENoYXRNZXRhZGF0YVtdPiB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0YXN5bmMgbGlzdFNlc3Npb25zKCk6IFByb21pc2U8SUFnZW50U2Vzc2lvbk1ldGFkYXRhW10+IHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX3Nlc3Npb25zLnZhbHVlcygpXS5tYXAoc2Vzc2lvbiA9PiAoeyBzZXNzaW9uLCBzdGFydFRpbWU6IERhdGUubm93KCksIG1vZGlmaWVkVGltZTogRGF0ZS5ub3coKSwgcHJvamVjdDogbW9ja1Byb2plY3QodGhpcy5pZCksIC4uLnRoaXMuc2Vzc2lvbk1ldGFkYXRhT3ZlcnJpZGVzIH0pKTtcblx0fVxuXG5cdGFzeW5jIGdldENoYXRNZXRhZGF0YShjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTxJQWdlbnRDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gcmVzb2x2ZUFnZW50Q2hhdENvbnRleHQoY29udGV4dCwgY2hhdCkuY29uZmlndXJhdGlvblJlc291cmNlO1xuXHRcdGlmICghdGhpcy5fc2Vzc2lvbnMuaGFzKEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IGNoYXQsIHN0YXJ0VGltZTogRGF0ZS5ub3coKSwgbW9kaWZpZWRUaW1lOiBEYXRlLm5vdygpLCBwcm9qZWN0OiBtb2NrUHJvamVjdCh0aGlzLmlkKSwgLi4udGhpcy5zZXNzaW9uTWV0YWRhdGFPdmVycmlkZXMgfTtcblx0fVxuXG5cdGFzeW5jIGdldFNlc3Npb25NZXRhZGF0YShzZXNzaW9uOiBVUkkpOiBQcm9taXNlPElBZ2VudFNlc3Npb25NZXRhZGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9ucy5oYXMoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKVxuXHRcdFx0PyB7IHNlc3Npb24sIHN0YXJ0VGltZTogRGF0ZS5ub3coKSwgbW9kaWZpZWRUaW1lOiBEYXRlLm5vdygpLCBwcm9qZWN0OiBtb2NrUHJvamVjdCh0aGlzLmlkKSwgLi4udGhpcy5zZXNzaW9uTWV0YWRhdGFPdmVycmlkZXMgfVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiogT3B0aW9uYWwgb3ZlcnJpZGUgZm9yIHRoZSB3b3JraW5nIGRpcmVjdG9yeSByZXR1cm5lZCBieSBpbml0aWFsaXppbmcgY3JlYXRlQ2hhdC4gKi9cblx0cmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFdoZW4gc2V0LCB7QGxpbmsgc2VuZE1lc3NhZ2V9IHJlamVjdHMgd2l0aCB0aGlzIGVycm9yIGFmdGVyIHJlY29yZGluZyB0aGVcblx0ICogY2FsbCBcdTIwMTQgdXNlZCB0byBzaW11bGF0ZSBhIGZhaWxlZCBmaXJzdC10dXJuIG1hdGVyaWFsaXphdGlvbiAoZS5nLiB3b3JrdHJlZVxuXHQgKiBvciBicmFuY2ggc2V0dXAgdGhyb3dpbmcpLlxuXHQgKi9cblx0c2VuZE1lc3NhZ2VFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdGxhc3RDcmVhdGVTZXNzaW9uQ29uZmlnOiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBCYWNraW5nIGhlbHBlciBmb3IgYW4gaW5pdGlhbGl6aW5nIHtAbGluayBjaGF0c30uY3JlYXRlQ2hhdCBjYWxsLiAqL1xuXHRwcml2YXRlIF9jcmVhdGVTZXNzaW9uUmVjb3JkKHNlc3Npb246IFVSSSwgY29uZmlnOiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnIHwgdW5kZWZpbmVkKTogSUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCB7XG5cdFx0dGhpcy5sYXN0Q3JlYXRlU2Vzc2lvbkNvbmZpZyA9IGNvbmZpZztcblx0XHR0aGlzLl9zZXNzaW9ucy5zZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLCBzZXNzaW9uKTtcblx0XHRyZXR1cm4geyBwcm9qZWN0OiBtb2NrUHJvamVjdCh0aGlzLmlkKSwgcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5OiB0aGlzLnJlc29sdmVkV29ya2luZ0RpcmVjdG9yeSB9O1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUNoYXRDb25maWcocGFyYW1zOiBJQWdlbnRSZXNvbHZlQ2hhdENvbmZpZ1BhcmFtcyk6IFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+IHtcblx0XHRyZXR1cm4geyBzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sIHZhbHVlczogcGFyYW1zLmNvbmZpZyA/PyB7fSB9O1xuXHR9XG5cdHJlc29sdmVTZXNzaW9uQ29uZmlnKHBhcmFtczogSUFnZW50UmVzb2x2ZUNoYXRDb25maWdQYXJhbXMpOiBQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMucmVzb2x2ZUNoYXRDb25maWcocGFyYW1zKTtcblx0fVxuXG5cdGdldEluaGVyaXRlZENoYXRDb25maWcoKTogdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgY2hhdENvbmZpZ0NvbXBsZXRpb25zKF9wYXJhbXM6IElBZ2VudENoYXRDb25maWdDb21wbGV0aW9uc1BhcmFtcyk6IFByb21pc2U8U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHsgaXRlbXM6IFtdIH07XG5cdH1cblx0c2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKHBhcmFtczogSUFnZW50Q2hhdENvbmZpZ0NvbXBsZXRpb25zUGFyYW1zKTogUHJvbWlzZTxTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5jaGF0Q29uZmlnQ29tcGxldGlvbnMocGFyYW1zKTtcblx0fVxuXG5cdGFzeW5jIHNlbmRNZXNzYWdlKHNlc3Npb246IFVSSSwgY2hhdDogVVJJLCBwcm9tcHQ6IHN0cmluZywgYXR0YWNobWVudHM/OiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdLCB0dXJuSWQ/OiBzdHJpbmcsIHNlbmRlckNsaWVudElkPzogc3RyaW5nLCBjbGllbnRUeXBlID0gQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2FsbCA9IHtcblx0XHRcdHNlc3Npb24sXG5cdFx0XHRwcm9tcHQsXG5cdFx0XHRhdHRhY2htZW50cyxcblx0XHRcdGNoYXQsXG5cdFx0XHQuLi4oc2VuZGVyQ2xpZW50SWQgPyB7IHNlbmRlckNsaWVudElkIH0gOiB7fSksXG5cdFx0XHQuLi4oY2xpZW50VHlwZSAhPT0gQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duID8geyBjbGllbnRUeXBlIH0gOiB7fSksXG5cdFx0fTtcblx0XHR0aGlzLnNlbmRNZXNzYWdlQ2FsbHMucHVzaChjYWxsKTtcblx0XHR0aGlzLl9vbkRpZFNlbmRNZXNzYWdlLmZpcmUoY2FsbCk7XG5cdFx0aWYgKHR1cm5JZCkge1xuXHRcdFx0dGhpcy5fYWN0aXZlVHVybklkcy5zZXQodXJpS2V5KHNlc3Npb24pLCB0dXJuSWQpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5zZW5kTWVzc2FnZUVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLnNlbmRNZXNzYWdlRXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0c2V0UGVuZGluZ01lc3NhZ2VzKGNoYXQ6IFVSSSwgc3RlZXJpbmdNZXNzYWdlOiBQZW5kaW5nTWVzc2FnZSB8IHVuZGVmaW5lZCwgcXVldWVkTWVzc2FnZXM6IHJlYWRvbmx5IFBlbmRpbmdNZXNzYWdlW10pOiB2b2lkIHtcblx0XHR0aGlzLnNldFBlbmRpbmdNZXNzYWdlc0NhbGxzLnB1c2goeyBjaGF0LCBzdGVlcmluZ01lc3NhZ2UsIHF1ZXVlZE1lc3NhZ2VzIH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0U2Vzc2lvbk1lc3NhZ2VzKHNlc3Npb246IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0Y29uc3Qgc3ViYWdlbnRJbmZvID0gcGFyc2VTdWJhZ2VudFNlc3Npb25Vcmkoc2Vzc2lvbik7XG5cdFx0aWYgKHN1YmFnZW50SW5mbykge1xuXHRcdFx0cmV0dXJuIGJ1aWxkU3ViYWdlbnRUdXJuc0Zyb21IaXN0b3J5KHRoaXMuc2Vzc2lvbk1lc3NhZ2VzLCBzdWJhZ2VudEluZm8udG9vbENhbGxJZCwgc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHR9XG5cdFx0Y29uc3QgdHVybnMgPSBidWlsZFR1cm5zRnJvbUhpc3RvcnkodGhpcy5zZXNzaW9uTWVzc2FnZXMpO1xuXHRcdGlmICh0aGlzLnR1cm5Vc2FnZU92ZXJyaWRlKSB7XG5cdFx0XHRyZXR1cm4gdHVybnMubWFwKHR1cm4gPT4gKHsgLi4udHVybiwgdXNhZ2U6IHRoaXMudHVyblVzYWdlT3ZlcnJpZGUgfSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHVybnM7XG5cdH1cblxuXHQvKiogQmFja2luZyBoZWxwZXIgZm9yIHtAbGluayBjaGF0c30ucmVsZWFzZUNoYXQ6IHJlY29yZHMgYSBub24tZGVzdHJ1Y3RpdmUgcmVsZWFzZS4gKi9cblx0cHJpdmF0ZSBfcmVsZWFzZVNlc3Npb25SZWNvcmQoc2Vzc2lvbjogVVJJKTogdm9pZCB7XG5cdFx0Ly8gTm9uLWRlc3RydWN0aXZlOiByZWNvcmQgdGhlIGNhbGwgYnV0IGtlZXAgdGhlIHNlc3Npb24gaW4gdGhlIGNhdGFsb2dcblx0XHQvLyBzbyBhIGxhdGVyIHJlc3RvcmUvcmVzdW1lIHN0aWxsIGZpbmRzIGl0cyBkdXJhYmxlIGRhdGEuXG5cdFx0dGhpcy5yZWxlYXNlU2Vzc2lvbkNhbGxzLnB1c2goc2Vzc2lvbik7XG5cdH1cblxuXHRhc3luYyBhYm9ydFNlc3Npb24oc2Vzc2lvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5hYm9ydFNlc3Npb25DYWxscy5wdXNoKHNlc3Npb24pO1xuXHR9XG5cblx0YXN5bmMgZmluYWxpemVTZXNzaW9uKHNlc3Npb246IFVSSSwgX2NvbnRleHQ/OiB7IHJlYWRvbmx5IHdvcmtzcGFjZWxlc3M/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmRpc3Bvc2VTZXNzaW9uQ2FsbHMucHVzaChzZXNzaW9uKTtcblx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGUoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKTtcblx0fVxuXG5cdGFzeW5jIHRydW5jYXRlQ2hhdChjaGF0OiBVUkksIHR1cm5JZD86IHN0cmluZywgY29udGV4dD86IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cnVuY2F0ZUNoYXRDYWxscy5wdXNoKHsgY2hhdCwgdHVybklkLCBjb250ZXh0IH0pO1xuXHR9XG5cblx0cmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QocmVxdWVzdElkOiBzdHJpbmcsIGFwcHJvdmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMucHVzaCh7IHJlcXVlc3RJZCwgYXBwcm92ZWQgfSk7XG5cdH1cblxuXHRyZXNwb25kVG9Vc2VySW5wdXRSZXF1ZXN0KCk6IHZvaWQge1xuXHRcdC8vIG5vLW9wIGZvciB0ZXN0c1xuXHR9XG5cblx0YXN5bmMgY2hhbmdlTW9kZWwoc2Vzc2lvbjogVVJJLCBtb2RlbDogTW9kZWxTZWxlY3Rpb24sIGNoYXQ/OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNoYW5nZU1vZGVsQ2FsbHMucHVzaCh7IHNlc3Npb24sIG1vZGVsLCBjaGF0IH0pO1xuXHR9XG5cblx0YXN5bmMgY2hhbmdlQWdlbnQoc2Vzc2lvbjogVVJJLCBhZ2VudDogQWdlbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQsIGNoYXQ/OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNoYW5nZUFnZW50Q2FsbHMucHVzaCh7IHNlc3Npb24sIGFnZW50LCBjaGF0IH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhbiBhZGRpdGlvbmFsIChwZWVyKSBjaGF0LiBUaGUgYmFzZSBtb2NrIGlzIHNpbmdsZS1jaGF0IGFuZFxuXHQgKiByZWplY3RzOyBtdWx0aS1jaGF0IHRlc3Qgc3ViY2xhc3NlcyBvdmVycmlkZSB0aGlzLlxuXHQgKi9cblx0YXN5bmMgY3JlYXRlQ2hhdChfc2Vzc2lvbjogVVJJLCBfY2hhdDogVVJJLCBfb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHwgdm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcihgQWdlbnQgJHt0aGlzLmlkfSBkb2VzIG5vdCBzdXBwb3J0IG11bHRpcGxlIGNoYXRzYCk7XG5cdH1cblxuXHQvKiogRGlzcG9zZSBhbiBhZGRpdGlvbmFsIChwZWVyKSBjaGF0LiBPdmVycmlkZGVuIGJ5IG11bHRpLWNoYXQgc3ViY2xhc3Nlcy4gKi9cblx0YXN5bmMgZGlzcG9zZUNoYXQoX3Nlc3Npb246IFVSSSwgX2NoYXQ6IFVSSSk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0LyoqXG5cdCAqIE1hcCBhbiBhbHJlYWR5LXJlc29sdmVkIGNoYXQgVVJJIHRvIHRoZSBgKHNlc3Npb24sIGNoYXQpYCBwYWlyIHRoZVxuXHQgKiBtb2NrIHJlY29yZHMgY2FsbHMgYWdhaW5zdCAobWlycm9yaW5nIHRoZSByZWFsIGFnZW50cykuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlQ2hhdFRhcmdldChjaGF0OiBVUkksIGNvbnRleHQ/OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IHsgc2Vzc2lvbjogVVJJOyBjaGF0OiBVUkkgfSB7XG5cdFx0aWYgKGNvbnRleHQpIHtcblx0XHRcdHJldHVybiB7IHNlc3Npb246IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpLmNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgY2hhdCB9O1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYXRVcmkoY2hhdCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTW9jayBhZ2VudCBjaGF0IG9wZXJhdGlvbiByZXF1aXJlcyBhbiBBSFAgY2hhdCBVUkk6ICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4geyBzZXNzaW9uOiBVUkkucGFyc2UocGFyc2VkLnNlc3Npb24pLCBjaGF0OiBVUkkucGFyc2UoY2hhdC50b1N0cmluZygpKSB9O1xuXHR9XG5cblx0LyoqIFJlY29yZHMgYSBob3N0LXN1cHBsaWVkIGNoYXQgY29udGV4dCBmb3IgbGF0ZXIgYXNzZXJ0aW9uLiAqL1xuXHRwcml2YXRlIF9yZWNvcmRDb250ZXh0KGJvdW5kYXJ5OiBzdHJpbmcsIGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmNoYXRDb250ZXh0cy5wdXNoKHsgYm91bmRhcnksIGNoYXQsIGNvbnRleHQgfSk7XG5cdH1cblxuXHRyZWFkb25seSBjaGF0czogSUFnZW50Q2hhdHMgPSB7XG5cdFx0Y3JlYXRlQ2hhdDogKGNoYXRVcmk6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQsIG9wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCB8IHZvaWQ+ID0+IHtcblx0XHRcdHRoaXMuX3JlY29yZENvbnRleHQoJ2NyZWF0ZUNoYXQnLCBjaGF0VXJpLCBjb250ZXh0KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSByZXNvbHZlQWdlbnRDaGF0Q29udGV4dChjb250ZXh0LCBjaGF0VXJpKS5jb25maWd1cmF0aW9uUmVzb3VyY2U7XG5cdFx0XHRpZiAoIXRoaXMuX3Nlc3Npb25zLmhhcyhBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpIHx8IHRoaXMuX2luaXRpYWxDaGF0cy5oYXMoY2hhdFVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0XHR0aGlzLl9pbml0aWFsQ2hhdHMuYWRkKGNoYXRVcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5fY3JlYXRlU2Vzc2lvblJlY29yZChzZXNzaW9uLCB7XG5cdFx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0XHRtb2RlbDogb3B0aW9ucz8ubW9kZWwsXG5cdFx0XHRcdFx0YWdlbnQ6IG9wdGlvbnM/LmFnZW50LFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogb3B0aW9ucz8ud29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0XHRcdGNvbmZpZzogb3B0aW9ucz8uY29uZmlnLFxuXHRcdFx0XHRcdGFjdGl2ZUNsaWVudDogb3B0aW9ucz8uYWN0aXZlQ2xpZW50LFxuXHRcdFx0XHRcdGltcG9ydENvbnZlcnNhdGlvbjogb3B0aW9ucz8uaW1wb3J0Q29udmVyc2F0aW9uLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVDaGF0KHNlc3Npb24sIGNoYXRVcmksIG9wdGlvbnMpO1xuXHRcdH0sXG5cdFx0ZGlzcG9zZUNoYXQ6IChjaGF0VXJpOiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHR0aGlzLl9yZWNvcmRDb250ZXh0KCdkaXNwb3NlQ2hhdCcsIGNoYXRVcmksIGNvbnRleHQpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uLCBjaGF0IH0gPSB0aGlzLl9yZXNvbHZlQ2hhdFRhcmdldChjaGF0VXJpLCBjb250ZXh0KTtcblx0XHRcdHJldHVybiB0aGlzLmRpc3Bvc2VDaGF0KHNlc3Npb24sIGNoYXQpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5faW5pdGlhbENoYXRzLmRlbGV0ZShjaGF0VXJpLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRcdFx0dGhpcy5kaXNwb3NlU2Vzc2lvbkNhbGxzLnB1c2goc2Vzc2lvbik7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbnMuZGVsZXRlKEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0cmVsZWFzZUNoYXQ6IChjaGF0VXJpOiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHQvLyBVbmxpa2UgZGlzcG9zZSwgcmVsZWFzZSBoYXMgbm8gc2VwYXJhdGUgc2Vzc2lvbi1sZXZlbCBmaW5hbGl6ZVxuXHRcdFx0Ly8gaG9vazogZXZlcnkgYWRkcmVzc2VkIGNoYXQgKGRlZmF1bHQgb3IgcGVlcikgbWFwcyBkaXJlY3RseSB0b1xuXHRcdFx0Ly8gdGhpcyBtb2NrJ3Mgc2Vzc2lvbi1sZXZlbCByZWxlYXNlIGJvb2trZWVwaW5nLlxuXHRcdFx0dGhpcy5fcmVjb3JkQ29udGV4dCgncmVsZWFzZUNoYXQnLCBjaGF0VXJpLCBjb250ZXh0KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gdGhpcy5fcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdFVyaSwgY29udGV4dCk7XG5cdFx0XHR0aGlzLl9yZWxlYXNlU2Vzc2lvblJlY29yZChzZXNzaW9uKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9LFxuXHRcdHNlbmRNZXNzYWdlOiAoY2hhdFVyaTogVVJJLCBwcm9tcHQ6IHN0cmluZywgX3dvcmtpbmdEaXJlY3Rvcmllc09yRGlyZWN0b3J5OiByZWFkb25seSBVUklbXSB8IFVSSSB8IHVuZGVmaW5lZCwgYXR0YWNobWVudHM/OiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdLCB0dXJuSWQ/OiBzdHJpbmcsIHNlbmRlckNsaWVudElkPzogc3RyaW5nLCBjbGllbnRUeXBlT3JDb250ZXh0PzogQWdlbnRIb3N0Q2xpZW50VHlwZSB8IFVSSSB8IElBZ2VudENoYXRDb250ZXh0LCBjb250ZXh0PzogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudFR5cGUgPSB0eXBlb2YgY2xpZW50VHlwZU9yQ29udGV4dCA9PT0gJ3N0cmluZycgPyBjbGllbnRUeXBlT3JDb250ZXh0IDogQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duO1xuXHRcdFx0Y29uc3Qgb3BlcmF0aW9uQ29udGV4dCA9IGNvbnRleHQgPz8gKHR5cGVvZiBjbGllbnRUeXBlT3JDb250ZXh0ID09PSAnc3RyaW5nJyA/IHVuZGVmaW5lZCA6IGNsaWVudFR5cGVPckNvbnRleHQpO1xuXHRcdFx0dGhpcy5fcmVjb3JkQ29udGV4dCgnc2VuZE1lc3NhZ2UnLCBjaGF0VXJpLCBvcGVyYXRpb25Db250ZXh0KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiwgY2hhdCB9ID0gdGhpcy5fcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdFVyaSwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZW5kTWVzc2FnZShzZXNzaW9uLCBjaGF0LCBwcm9tcHQsIGF0dGFjaG1lbnRzLCB0dXJuSWQsIHNlbmRlckNsaWVudElkLCBjbGllbnRUeXBlKTtcblx0XHR9LFxuXHRcdGFib3J0OiAoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0dGhpcy5fcmVjb3JkQ29udGV4dCgnYWJvcnQnLCBjaGF0LCBjb250ZXh0KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gdGhpcy5fcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdCwgY29udGV4dCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5hYm9ydFNlc3Npb24oc2Vzc2lvbik7XG5cdFx0fSxcblx0XHRjaGFuZ2VNb2RlbDogKGNoYXRVcmk6IFVSSSwgbW9kZWw6IE1vZGVsU2VsZWN0aW9uLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0dGhpcy5fcmVjb3JkQ29udGV4dCgnY2hhbmdlTW9kZWwnLCBjaGF0VXJpLCBjb250ZXh0KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiwgY2hhdCB9ID0gdGhpcy5fcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdFVyaSwgY29udGV4dCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5jaGFuZ2VNb2RlbChzZXNzaW9uLCBtb2RlbCwgY2hhdCk7XG5cdFx0fSxcblx0XHRjaGFuZ2VBZ2VudDogKGNoYXRVcmk6IFVSSSwgYWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0dGhpcy5fcmVjb3JkQ29udGV4dCgnY2hhbmdlQWdlbnQnLCBjaGF0VXJpLCBjb250ZXh0KTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiwgY2hhdCB9ID0gdGhpcy5fcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdFVyaSwgY29udGV4dCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5jaGFuZ2VBZ2VudChzZXNzaW9uLCBhZ2VudCwgY2hhdCk7XG5cdFx0fSxcblx0XHRnZXRNZXNzYWdlczogKGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4gPT4ge1xuXHRcdFx0dGhpcy5fcmVjb3JkQ29udGV4dCgnZ2V0TWVzc2FnZXMnLCBjaGF0LCBjb250ZXh0KTtcblx0XHRcdHJldHVybiB0aGlzLmdldFNlc3Npb25NZXNzYWdlcyhjaGF0KTtcblx0XHR9LFxuXHR9O1xuXG5cdGFzeW5jIG1hdGVyaWFsaXplQ2hhdChfY2hhdDogVVJJLCBfY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQsIF9wcm92aWRlckRhdGE6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCB8IHZvaWQ+IHsgfVxuXG5cdGFzeW5jIGF1dGhlbnRpY2F0ZShyZXNvdXJjZTogc3RyaW5nLCB0b2tlbjogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5hdXRoZW50aWNhdGVDYWxscy5wdXNoKHsgcmVzb3VyY2UsIHRva2VuIH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Z2V0Q3VzdG9taXphdGlvbnMoKTogQ3VzdG9taXphdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5jdXN0b21pemF0aW9ucztcblx0fVxuXG5cdHN5bmNDbGllbnRDdXN0b21pemF0aW9ucyhzZXNzaW9uOiBVUkksIGNsaWVudElkOiBzdHJpbmcsIGN1c3RvbWl6YXRpb25zOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10pOiBJU3luY2VkQ3VzdG9taXphdGlvbltdIHtcblx0XHR0aGlzLnNldENsaWVudEN1c3RvbWl6YXRpb25zQ2FsbHMucHVzaCh7IGNsaWVudElkLCBjdXN0b21pemF0aW9ucyB9KTtcblx0XHRjb25zdCByZXN1bHRzOiBJU3luY2VkQ3VzdG9taXphdGlvbltdID0gY3VzdG9taXphdGlvbnMubWFwKGMgPT4gKHtcblx0XHRcdGN1c3RvbWl6YXRpb246IHtcblx0XHRcdFx0Li4uYyxcblx0XHRcdFx0bG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzLmZpcmUoe1xuXHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvbixcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LmN1c3RvbWl6YXRpb24pLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0cztcblx0fVxuXG5cdGdldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQsIGNsaWVudDogeyByZWFkb25seSBjbGllbnRJZDogc3RyaW5nOyByZWFkb25seSBkaXNwbGF5TmFtZT86IHN0cmluZyB9LCBob3N0Q3VzdG9taXphdGlvbnM/OiByZWFkb25seSBDdXN0b21pemF0aW9uW10pOiBJQWN0aXZlQ2xpZW50IHtcblx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHR0aGlzLmFjdGl2ZUNsaWVudENhbGxzLnB1c2goeyBjaGF0LCBjb250ZXh0LCBjbGllbnRJZDogY2xpZW50LmNsaWVudElkLCBob3N0Q3VzdG9taXphdGlvbnMgfSk7XG5cdFx0bGV0IHRvb2xzOiByZWFkb25seSBUb29sRGVmaW5pdGlvbltdID0gW107XG5cdFx0bGV0IGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10gPSBbXTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2xpZW50SWQ6IGNsaWVudC5jbGllbnRJZCxcblx0XHRcdGRpc3BsYXlOYW1lOiBjbGllbnQuZGlzcGxheU5hbWUsXG5cdFx0XHRnZXQgdG9vbHMoKSB7IHJldHVybiB0b29sczsgfSxcblx0XHRcdHNldCB0b29scyh2YWx1ZTogcmVhZG9ubHkgVG9vbERlZmluaXRpb25bXSkge1xuXHRcdFx0XHR0b29scyA9IHZhbHVlO1xuXHRcdFx0XHRzZWxmLnNldENsaWVudFRvb2xzQ2FsbHMucHVzaCh7IGNsaWVudElkOiBjbGllbnQuY2xpZW50SWQsIHRvb2xzOiB2YWx1ZSB9KTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgY3VzdG9taXphdGlvbnMoKSB7IHJldHVybiBjdXN0b21pemF0aW9uczsgfSxcblx0XHRcdHNldCBjdXN0b21pemF0aW9ucyh2YWx1ZTogcmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdKSB7XG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zID0gdmFsdWU7XG5cdFx0XHRcdHNlbGYuc3luY0NsaWVudEN1c3RvbWl6YXRpb25zKHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpLmNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgY2xpZW50LmNsaWVudElkLCBbLi4udmFsdWVdKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHJlbW92ZUFjdGl2ZUNsaWVudChjaGF0OiBVUkksIF9jb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCwgY2xpZW50SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucmVtb3ZlQWN0aXZlQ2xpZW50Q2FsbHMucHVzaCh7IGNoYXQsIGNsaWVudElkIH0pO1xuXHR9XG5cblx0b25DbGllbnRUb29sQ2FsbENvbXBsZXRlKGNoYXQ6IFVSSSwgdG9vbENhbGxJZDogc3RyaW5nLCByZXN1bHQ6IFRvb2xDYWxsUmVzdWx0LCBjb250ZXh0PzogSUFnZW50Q2hhdENvbnRleHQpOiB2b2lkIHtcblx0XHR0aGlzLmNsaWVudFRvb2xDYWxsQ29tcGxldGVDYWxscy5wdXNoKHsgY2hhdCwgdG9vbENhbGxJZCwgcmVzdWx0LCBjb250ZXh0IH0pO1xuXHR9XG5cblx0YXN5bmMgc2h1dGRvd24oKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHQvKipcblx0ICogRmlyZXMgYW4ge0BsaW5rIEFnZW50U2lnbmFsfSBvbiB0aGlzIGFnZW50LlxuXHQgKi9cblx0ZmlyZVByb2dyZXNzKHNpZ25hbDogQWdlbnRTaWduYWwpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5maXJlKHNpZ25hbCk7XG5cdH1cblxuXHQvKipcblx0ICogTG9va3MgdXAgdGhlIGFjdGl2ZSB0dXJuIGlkIGNhcHR1cmVkIGZyb20gdGhlIG1vc3QgcmVjZW50XG5cdCAqIHtAbGluayBzZW5kTWVzc2FnZX0gY2FsbCBmb3IgYSBnaXZlbiBzZXNzaW9uLiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmXG5cdCAqIHRoZSBzZXNzaW9uIGhhcyBubyBhY3RpdmUgdHVybiB5ZXQgKGUuZy4gdGVzdHMgdGhhdCBmaXJlIHByb2dyZXNzXG5cdCAqIHdpdGhvdXQgZmlyc3QgY2FsbGluZyBzZW5kTWVzc2FnZSkuXG5cdCAqL1xuXHRnZXRBY3RpdmVUdXJuSWQoc2Vzc2lvbjogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlVHVybklkcy5nZXQodXJpS2V5KHNlc3Npb24pKTtcblx0fVxuXG5cdGZpcmVDdXN0b21pemF0aW9uc0NoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzY292ZXJlZENoYXRzRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGF0UHJvZ3Jlc3MuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkU2VuZE1lc3NhZ2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogV2VsbC1rbm93biBVUkkgb2YgYSBwcmUtZXhpc3Rpbmcgc2Vzc2lvbiBzZWVkZWQgaW4ge0BsaW5rIFNjcmlwdGVkTW9ja0FnZW50fS5cbiAqIFRoaXMgc2Vzc2lvbiBhcHBlYXJzIGluIGBsaXN0U2Vzc2lvbnMoKWAgYW5kIGhhcyBtZXNzYWdlIGhpc3RvcnkgdmlhXG4gKiBgZ2V0U2Vzc2lvbk1lc3NhZ2VzKClgLCBidXQgd2FzIG5ldmVyIGNyZWF0ZWQgdGhyb3VnaCB0aGUgc2VydmVyJ3NcbiAqIGBoYW5kbGVDcmVhdGVTZXNzaW9uYC4gSXQgc2ltdWxhdGVzIGEgc2Vzc2lvbiBmcm9tIGEgcHJldmlvdXMgc2VydmVyXG4gKiBsaWZldGltZSBmb3IgdGVzdGluZyB0aGUgcmVzdG9yZS1vbi1zdWJzY3JpYmUgcGF0aC5cbiAqL1xuZXhwb3J0IGNvbnN0IFBSRV9FWElTVElOR19TRVNTSU9OX1VSSSA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAncHJlLWV4aXN0aW5nLXNlc3Npb24nKTtcblxuZXhwb3J0IGNsYXNzIFNjcmlwdGVkTW9ja0FnZW50IGltcGxlbWVudHMgSUFnZW50IHtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzY292ZXJlZENoYXRzRW1pdHRlciA9IG5ldyBFbWl0dGVyPHJlYWRvbmx5IElBZ2VudERpc2NvdmVyZWRDaGF0W10+KCk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzY292ZXJDaGF0cyA9IHRoaXMuX2Rpc2NvdmVyZWRDaGF0c0VtaXR0ZXIuZXZlbnQ7XG5cdHJlYWRvbmx5IGlkOiBBZ2VudFByb3ZpZGVyID0gJ21vY2snO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhdFByb2dyZXNzID0gbmV3IEVtaXR0ZXI8QWdlbnRTaWduYWw+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhdFByb2dyZXNzID0gdGhpcy5fb25EaWRDaGF0UHJvZ3Jlc3MuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkTWF0ZXJpYWxpemVDaGF0ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDaGF0RGF0YSA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkU3Bhd25DaGF0ID0gRXZlbnQuTm9uZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudE1vZGVsSW5mb1tdPih0aGlzLCBbeyBwcm92aWRlcjogJ21vY2snLCBpZDogJ21vY2stbW9kZWwnLCBuYW1lOiAnTW9jayBNb2RlbCcsIG1heENvbnRleHRXaW5kb3c6IDEyODAwMCwgc3VwcG9ydHNWaXNpb246IGZhbHNlIH1dKTtcblx0cmVhZG9ubHkgbW9kZWxzID0gdGhpcy5fbW9kZWxzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblxuXHQvKipcblx0ICogTWVzc2FnZSBoaXN0b3J5IGZvciB0aGUgcHJlLWV4aXN0aW5nIHNlc3Npb246IGEgc2luZ2xlIHVzZXJcdTIxOTJhc3Npc3RhbnRcblx0ICogdHVybiB3aXRoIGEgdG9vbCBjYWxsLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcHJlRXhpc3RpbmdNZXNzYWdlczogSUhpc3RvcnlSZWNvcmRbXSA9IFtcblx0XHR7IHR5cGU6ICdtZXNzYWdlJywgcm9sZTogJ3VzZXInLCBzZXNzaW9uOiBQUkVfRVhJU1RJTkdfU0VTU0lPTl9VUkksIG1lc3NhZ2VJZDogJ2gtbXNnLTEnLCBjb250ZW50OiAnV2hhdCBmaWxlcyBhcmUgaGVyZT8nIH0sXG5cdFx0eyB0eXBlOiAndG9vbF9zdGFydCcsIHNlc3Npb246IFBSRV9FWElTVElOR19TRVNTSU9OX1VSSSwgdG9vbENhbGxJZDogJ2gtdGMtMScsIHRvb2xOYW1lOiAnbGlzdF9maWxlcycsIGRpc3BsYXlOYW1lOiAnTGlzdCBGaWxlcycsIGludm9jYXRpb25NZXNzYWdlOiAnTGlzdGluZyBmaWxlcy4uLicgfSxcblx0XHR7IHR5cGU6ICd0b29sX2NvbXBsZXRlJywgc2Vzc2lvbjogUFJFX0VYSVNUSU5HX1NFU1NJT05fVVJJLCB0b29sQ2FsbElkOiAnaC10Yy0xJywgcmVzdWx0OiB7IHBhc3RUZW5zZU1lc3NhZ2U6ICdMaXN0ZWQgZmlsZXMnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2ZpbGUxLnRzXFxuZmlsZTIudHMnIH1dLCBzdWNjZXNzOiB0cnVlIH0gc2F0aXNmaWVzIFRvb2xDYWxsUmVzdWx0IH0sXG5cdFx0eyB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICdhc3Npc3RhbnQnLCBzZXNzaW9uOiBQUkVfRVhJU1RJTkdfU0VTU0lPTl9VUkksIG1lc3NhZ2VJZDogJ2gtbXNnLTInLCBjb250ZW50OiAnSGVyZSBhcmUgdGhlIGZpbGVzOiBmaWxlMS50cyBhbmQgZmlsZTIudHMnIH0sXG5cdF07XG5cblx0Ly8gVHJhY2sgcGVuZGluZyBwZXJtaXNzaW9uIHJlcXVlc3RzXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdQZXJtaXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCAoYXBwcm92ZWQ6IGJvb2xlYW4pID0+IHZvaWQ+KCk7XG5cdC8vIFRyYWNrIHRoZSBhY3RpdmUgdHVybiBJRCBwZXIgc2Vzc2lvbiwgY2FwdHVyZWQgZnJvbSBzZW5kTWVzc2FnZSgpLlxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVUdXJuSWRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0Ly8gVHJhY2sgcGVuZGluZyBhYm9ydCBjYWxsYmFja3MgZm9yIHNsb3cgcmVzcG9uc2VzXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdBYm9ydHMgPSBuZXcgTWFwPHN0cmluZywgKCkgPT4gdm9pZD4oKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHQvLyBTZWVkIHRoZSBwcmUtZXhpc3Rpbmcgc2Vzc2lvbiBzbyBpdCBhcHBlYXJzIGluIGxpc3RTZXNzaW9ucygpXG5cdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KEFnZW50U2Vzc2lvbi5pZChQUkVfRVhJU1RJTkdfU0VTU0lPTl9VUkkpLCBQUkVfRVhJU1RJTkdfU0VTU0lPTl9VUkkpO1xuXHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdHZvaWQgdGhpcy5saXN0RXh0ZXJuYWxDaGF0cygpLnRoZW4oY2hhdHMgPT4ge1xuXHRcdFx0XHRpZiAoY2hhdHMpIHtcblx0XHRcdFx0XHR0aGlzLmZpcmVEaXNjb3ZlcmVkQ2hhdHMoY2hhdHMubWFwKG1ldGFkYXRhID0+ICh7IC4uLm1ldGFkYXRhLCBleHRlcm5hbDogdHJ1ZSB9KSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAoKSA9PiB7IH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQWxsb3cgaW50ZWdyYXRpb24gdGVzdHMgdG8gc2VlZCBhZGRpdGlvbmFsIHByZS1leGlzdGluZyBzZXNzaW9ucyBhY3Jvc3Ncblx0XHQvLyBzZXJ2ZXIgcmVzdGFydHMgdmlhIGVudiB2YXIuIFRoZSB2YWx1ZSBpcyBhIGNvbW1hLXNlcGFyYXRlZCBsaXN0IG9mXG5cdFx0Ly8gc2Vzc2lvbiBVUklzIChlLmcuIGBtb2NrOi8vcHJlLTEsbW9jazovL3ByZS0yYCkuXG5cdFx0Y29uc3Qgc2VlZGVkID0gcHJvY2Vzcy5lbnZbJ1ZTQ09ERV9BR0VOVF9IT1NUX01PQ0tfU0VFRF9TRVNTSU9OUyddO1xuXHRcdGlmIChzZWVkZWQpIHtcblx0XHRcdGZvciAoY29uc3QgcmF3IG9mIHNlZWRlZC5zcGxpdCgnLCcpKSB7XG5cdFx0XHRcdGNvbnN0IHRyaW1tZWQgPSByYXcudHJpbSgpO1xuXHRcdFx0XHRpZiAoIXRyaW1tZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UodHJpbW1lZCk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25zLnNldChBZ2VudFNlc3Npb24uaWQodXJpKSwgdXJpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXREZXNjcmlwdG9yKCk6IElBZ2VudERlc2NyaXB0b3Ige1xuXHRcdHJldHVybiB7IHByb3ZpZGVyOiAnbW9jaycsIGRpc3BsYXlOYW1lOiAnTW9jayBBZ2VudCcsIGRlc2NyaXB0aW9uOiAnU2NyaXB0ZWQgdGVzdCBhZ2VudCcgfTtcblx0fVxuXG5cdGdldFByb3RlY3RlZFJlc291cmNlcygpOiBJQXV0aG9yaXphdGlvblByb3RlY3RlZFJlc291cmNlTWV0YWRhdGFbXSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0YXN5bmMgbGlzdEV4dGVybmFsQ2hhdHMoKTogUHJvbWlzZTxJQWdlbnRDaGF0TWV0YWRhdGFbXT4ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fc2Vzc2lvbnMudmFsdWVzKCldLm1hcChzZXNzaW9uID0+ICh7XG5cdFx0XHRjaGF0OiBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSksXG5cdFx0XHRzdGFydFRpbWU6IERhdGUubm93KCksXG5cdFx0XHRtb2RpZmllZFRpbWU6IERhdGUubm93KCksXG5cdFx0XHRwcm9qZWN0OiBtb2NrUHJvamVjdCh0aGlzLmlkKSxcblx0XHRcdHN1bW1hcnk6IHNlc3Npb24udG9TdHJpbmcoKSA9PT0gUFJFX0VYSVNUSU5HX1NFU1NJT05fVVJJLnRvU3RyaW5nKCkgPyAnUHJlLWV4aXN0aW5nIHNlc3Npb24nIDogdW5kZWZpbmVkLFxuXHRcdH0pKTtcblx0fVxuXG5cdGZpcmVEaXNjb3ZlcmVkQ2hhdHMoY2hhdHM6IHJlYWRvbmx5IElBZ2VudERpc2NvdmVyZWRDaGF0W10pOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNjb3ZlcmVkQ2hhdHNFbWl0dGVyLmZpcmUoY2hhdHMpO1xuXHR9XG5cblx0YXN5bmMgbGlzdENoYXRzVG9NaWdyYXRlKCk6IFByb21pc2U8SUFnZW50Q2hhdE1ldGFkYXRhW10+IHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRhc3luYyBsaXN0U2Vzc2lvbnMoKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXT4ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fc2Vzc2lvbnMudmFsdWVzKCldLm1hcChzZXNzaW9uID0+ICh7XG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0c3RhcnRUaW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0bW9kaWZpZWRUaW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0cHJvamVjdDogbW9ja1Byb2plY3QodGhpcy5pZCksXG5cdFx0XHRzdW1tYXJ5OiBzZXNzaW9uLnRvU3RyaW5nKCkgPT09IFBSRV9FWElTVElOR19TRVNTSU9OX1VSSS50b1N0cmluZygpID8gJ1ByZS1leGlzdGluZyBzZXNzaW9uJyA6IHVuZGVmaW5lZCxcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBnZXRDaGF0TWV0YWRhdGEoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8SUFnZW50Q2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpLmNvbmZpZ3VyYXRpb25SZXNvdXJjZTtcblx0XHRpZiAoIXRoaXMuX3Nlc3Npb25zLmhhcyhBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRjaGF0LFxuXHRcdFx0c3RhcnRUaW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0bW9kaWZpZWRUaW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0cHJvamVjdDogbW9ja1Byb2plY3QodGhpcy5pZCksXG5cdFx0XHRzdW1tYXJ5OiBzZXNzaW9uLnRvU3RyaW5nKCkgPT09IFBSRV9FWElTVElOR19TRVNTSU9OX1VSSS50b1N0cmluZygpID8gJ1ByZS1leGlzdGluZyBzZXNzaW9uJyA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZ2V0U2Vzc2lvbk1ldGFkYXRhKHNlc3Npb246IFVSSSk6IFByb21pc2U8SUFnZW50U2Vzc2lvbk1ldGFkYXRhIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25zLmhhcyhBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpXG5cdFx0XHQ/IHsgc2Vzc2lvbiwgc3RhcnRUaW1lOiBEYXRlLm5vdygpLCBtb2RpZmllZFRpbWU6IERhdGUubm93KCksIHByb2plY3Q6IG1vY2tQcm9qZWN0KHRoaXMuaWQpLCBzdW1tYXJ5OiBzZXNzaW9uLnRvU3RyaW5nKCkgPT09IFBSRV9FWElTVElOR19TRVNTSU9OX1VSSS50b1N0cmluZygpID8gJ1ByZS1leGlzdGluZyBzZXNzaW9uJyA6IHVuZGVmaW5lZCB9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVNlc3Npb25SZWNvcmQoc2Vzc2lvbjogVVJJKTogSUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCB7XG5cdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSwgc2Vzc2lvbik7XG5cdFx0cmV0dXJuIHsgcHJvamVjdDogbW9ja1Byb2plY3QodGhpcy5pZCkgfTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVDaGF0Q29uZmlnKHBhcmFtczogSUFnZW50UmVzb2x2ZUNoYXRDb25maWdQYXJhbXMpOiBQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gcGFyYW1zLmNvbmZpZz8uaXNvbGF0aW9uID09PSAnZm9sZGVyJyB8fCBwYXJhbXMuY29uZmlnPy5pc29sYXRpb24gPT09ICd3b3JrdHJlZScgPyBwYXJhbXMuY29uZmlnLmlzb2xhdGlvbiA6ICd3b3JrdHJlZSc7XG5cdFx0Y29uc3QgYnJhbmNoID0gaXNvbGF0aW9uID09PSAnd29ya3RyZWUnICYmIHR5cGVvZiBwYXJhbXMuY29uZmlnPy5icmFuY2ggPT09ICdzdHJpbmcnID8gcGFyYW1zLmNvbmZpZy5icmFuY2ggOiAnbWFpbic7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGlzb2xhdGlvbjoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHR0aXRsZTogJ0lzb2xhdGlvbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1doZXJlIHRoZSBtb2NrIGFnZW50IHNob3VsZCBtYWtlIGNoYW5nZXMnLFxuXHRcdFx0XHRcdFx0ZW51bTogWydmb2xkZXInLCAnd29ya3RyZWUnXSxcblx0XHRcdFx0XHRcdGVudW1MYWJlbHM6IFsnRm9sZGVyJywgJ1dvcmt0cmVlJ10sXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAnd29ya3RyZWUnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YnJhbmNoOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdHRpdGxlOiAnQnJhbmNoJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQmFzZSBicmFuY2ggdG8gd29yayBmcm9tJyxcblx0XHRcdFx0XHRcdGVudW06IFsnbWFpbiddLFxuXHRcdFx0XHRcdFx0ZW51bUxhYmVsczogWydtYWluJ10sXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAnbWFpbicsXG5cdFx0XHRcdFx0XHRlbnVtRHluYW1pYzogaXNvbGF0aW9uID09PSAnd29ya3RyZWUnLFxuXHRcdFx0XHRcdFx0cmVhZE9ubHk6IGlzb2xhdGlvbiA9PT0gJ2ZvbGRlcicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHsgaXNvbGF0aW9uLCBicmFuY2ggfSxcblx0XHR9O1xuXHR9XG5cdHJlc29sdmVTZXNzaW9uQ29uZmlnKHBhcmFtczogSUFnZW50UmVzb2x2ZUNoYXRDb25maWdQYXJhbXMpOiBQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMucmVzb2x2ZUNoYXRDb25maWcocGFyYW1zKTtcblx0fVxuXG5cdGdldEluaGVyaXRlZENoYXRDb25maWcoKTogdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgY2hhdENvbmZpZ0NvbXBsZXRpb25zKHBhcmFtczogSUFnZW50Q2hhdENvbmZpZ0NvbXBsZXRpb25zUGFyYW1zKTogUHJvbWlzZTxTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNSZXN1bHQ+IHtcblx0XHRpZiAocGFyYW1zLnByb3BlcnR5ICE9PSAnYnJhbmNoJykge1xuXHRcdFx0cmV0dXJuIHsgaXRlbXM6IFtdIH07XG5cdFx0fVxuXHRcdGNvbnN0IHF1ZXJ5ID0gcGFyYW1zLnF1ZXJ5Py50b0xvd2VyQ2FzZSgpID8/ICcnO1xuXHRcdGNvbnN0IGJyYW5jaGVzID0gWydtYWluJywgJ2ZlYXR1cmUvY29uZmlnJywgJ3JlbGVhc2UnXS5maWx0ZXIoYnJhbmNoID0+IGJyYW5jaC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KSk7XG5cdFx0cmV0dXJuIHsgaXRlbXM6IGJyYW5jaGVzLm1hcChicmFuY2ggPT4gKHsgdmFsdWU6IGJyYW5jaCwgbGFiZWw6IGJyYW5jaCB9KSkgfTtcblx0fVxuXHRzZXNzaW9uQ29uZmlnQ29tcGxldGlvbnMocGFyYW1zOiBJQWdlbnRDaGF0Q29uZmlnQ29tcGxldGlvbnNQYXJhbXMpOiBQcm9taXNlPFNlc3Npb25Db25maWdDb21wbGV0aW9uc1Jlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLmNoYXRDb25maWdDb21wbGV0aW9ucyhwYXJhbXMpO1xuXHR9XG5cblx0YXN5bmMgc2VuZE1lc3NhZ2Uoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkksIHByb21wdDogc3RyaW5nLCBfYXR0YWNobWVudHM/OiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdLCB0dXJuSWQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodHVybklkKSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVUdXJuSWRzLnNldCh1cmlLZXkoc2Vzc2lvbiksIHR1cm5JZCk7XG5cdFx0XHR0aGlzLl9hY3RpdmVUdXJuSWRzLnNldCh1cmlLZXkoY2hhdCksIHR1cm5JZCk7XG5cdFx0fVxuXHRcdGNvbnN0IHsgc2Vzc2lvblN0ciwgdHVybklkOiB0aWQgfSA9IHRoaXMuX2N0eChjaGF0KTtcblx0XHRzd2l0Y2ggKHByb21wdCkge1xuXHRcdFx0Y2FzZSAnaGVsbG8nOlxuXHRcdFx0XHR0aGlzLl9maXJlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdF9tYXJrZG93bihjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICdIZWxsbywgd29ybGQhJyksXG5cdFx0XHRcdFx0X2lkbGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkKSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICd1c2UtdG9vbCc6XG5cdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0Li4uX3Rvb2xTdGFydChjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy0xJywgJ2VjaG9fdG9vbCcsICdFY2hvIFRvb2wnLCAnUnVubmluZyBlY2hvIHRvb2wuLi4nKSxcblx0XHRcdFx0XHRfdG9vbENvbXBsZXRlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLTEnLCB7IHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gZWNobyB0b29sJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdlY2hvZWQnIH1dLCBzdWNjZXNzOiB0cnVlIH0pLFxuXHRcdFx0XHRcdF9tYXJrZG93bihjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICdUb29sIGRvbmUuJyksXG5cdFx0XHRcdFx0X2lkbGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkKSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0X2Vycm9yKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3Rlc3RfZXJyb3InLCAnU29tZXRoaW5nIHdlbnQgd3JvbmcnKSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdwZXJtaXNzaW9uJzoge1xuXHRcdFx0XHQvLyBGaXJlIHRvb2xfc3RhcnQgdG8gY3JlYXRlIHRoZSB0b29sLCB0aGVuIHBlbmRpbmdfY29uZmlybWF0aW9uIHRvIHJlcXVlc3QgY29uZmlybWF0aW9uXG5cdFx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIF90b29sU3RhcnQoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGMtcGVybS0xJywgJ3NoZWxsJywgJ1NoZWxsJywgJ1J1biBhIHRlc3QgY29tbWFuZCcpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5maXJlKHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDUpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzLmZpcmUoX3BlbmRpbmdDb25maXJtYXRpb24oY2hhdCwgJ3RjLXBlcm0tMScsICdSdW4gYSB0ZXN0IGNvbW1hbmQnLCB7IHRvb2xJbnB1dDogJ2VjaG8gdGVzdCcsIGNvbmZpcm1hdGlvblRpdGxlOiAnUnVuIGEgdGVzdCBjb21tYW5kJyB9KSk7XG5cdFx0XHRcdH0pKCk7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdQZXJtaXNzaW9ucy5zZXQoJ3RjLXBlcm0tMScsIChhcHByb3ZlZCkgPT4ge1xuXHRcdFx0XHRcdGlmIChhcHByb3ZlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZmlyZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRcdFx0X21hcmtkb3duKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ0FsbG93ZWQuJyksXG5cdFx0XHRcdFx0XHRcdF9pZGxlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCksXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSAnd3JpdGUtZmlsZSc6IHtcblx0XHRcdFx0Ly8gRmlyZSB0b29sX3N0YXJ0ICsgcGVuZGluZ19jb25maXJtYXRpb24gd2l0aCB3cml0ZSBwZXJtaXNzaW9uIGZvciBhIHJlZ3VsYXIgZmlsZSAoc2hvdWxkIGJlIGF1dG8tYXBwcm92ZWQpXG5cdFx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIF90b29sU3RhcnQoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGMtd3JpdGUtMScsICdjcmVhdGUnLCAnQ3JlYXRlIEZpbGUnLCAnQ3JlYXRlIGZpbGUnKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGF0UHJvZ3Jlc3MuZmlyZShzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCg1KTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5maXJlKF9wZW5kaW5nQ29uZmlybWF0aW9uKGNoYXQsICd0Yy13cml0ZS0xJywgJ1dyaXRlIHNyYy9hcHAudHMnLCB7IHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwZXJtaXNzaW9uUGF0aDogJy93b3Jrc3BhY2Uvc3JjL2FwcC50cycgfSkpO1xuXHRcdFx0XHRcdC8vIEF1dG8tYXBwcm92ZWQgd3JpdGVzIHJlc29sdmUgaW1tZWRpYXRlbHkgXHUyMDE0IGNvbXBsZXRlIHRoZSB0b29sIGFuZCB0dXJuXG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRcdF90b29sQ29tcGxldGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGMtd3JpdGUtMScsIHsgcGFzdFRlbnNlTWVzc2FnZTogJ1dyb3RlIGZpbGUnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ29rJyB9XSwgc3VjY2VzczogdHJ1ZSB9KSxcblx0XHRcdFx0XHRcdF9pZGxlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCksXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdH0pKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlICd3cml0ZS1lbnYnOiB7XG5cdFx0XHRcdC8vIEZpcmUgdG9vbF9zdGFydCArIHBlbmRpbmdfY29uZmlybWF0aW9uIHdpdGggd3JpdGUgcGVybWlzc2lvbiBmb3IgLmVudiAoc2hvdWxkIGJlIGJsb2NrZWQpXG5cdFx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIF90b29sU3RhcnQoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGMtd3JpdGUtZW52LTEnLCAnY3JlYXRlJywgJ0NyZWF0ZSBGaWxlJywgJ0NyZWF0ZSBmaWxlJykpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzLmZpcmUocyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoNSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGF0UHJvZ3Jlc3MuZmlyZShfcGVuZGluZ0NvbmZpcm1hdGlvbihjaGF0LCAndGMtd3JpdGUtZW52LTEnLCAnV3JpdGUgLmVudicsIHsgcGVybWlzc2lvbktpbmQ6ICd3cml0ZScsIHBlcm1pc3Npb25QYXRoOiAnL3dvcmtzcGFjZS8uZW52JywgY29uZmlybWF0aW9uVGl0bGU6ICdXcml0ZSAuZW52JyB9KSk7XG5cdFx0XHRcdH0pKCk7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdQZXJtaXNzaW9ucy5zZXQoJ3RjLXdyaXRlLWVudi0xJywgKGFwcHJvdmVkKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGFwcHJvdmVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9maXJlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdFx0XHRfdG9vbENvbXBsZXRlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLXdyaXRlLWVudi0xJywgeyBwYXN0VGVuc2VNZXNzYWdlOiAnV3JvdGUgLmVudicsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnb2snIH1dLCBzdWNjZXNzOiB0cnVlIH0pLFxuXHRcdFx0XHRcdFx0XHRfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpLFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgJ3J1bi1zYWZlLWNvbW1hbmQnOiB7XG5cdFx0XHRcdC8vIEZpcmUgdG9vbF9zdGFydCArIHBlbmRpbmdfY29uZmlybWF0aW9uIHdpdGggc2hlbGwgcGVybWlzc2lvbiBmb3IgYW4gYWxsb3dlZCBjb21tYW5kIChzaG91bGQgYmUgYXV0by1hcHByb3ZlZClcblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHMgb2YgX3Rvb2xTdGFydChjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy1zaGVsbC0xJywgJ2Jhc2gnLCAnUnVuIENvbW1hbmQnLCAnUnVuIGNvbW1hbmQnKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGF0UHJvZ3Jlc3MuZmlyZShzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCg1KTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5maXJlKF9wZW5kaW5nQ29uZmlybWF0aW9uKGNoYXQsICd0Yy1zaGVsbC0xJywgJ2xzIC1sYScsIHsgcGVybWlzc2lvbktpbmQ6ICdzaGVsbCcsIHRvb2xJbnB1dDogJ2xzIC1sYScgfSkpO1xuXHRcdFx0XHRcdC8vIEF1dG8tYXBwcm92ZWQgc2hlbGwgY29tbWFuZHMgcmVzb2x2ZSBpbW1lZGlhdGVseVxuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0XHRfdG9vbENvbXBsZXRlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLXNoZWxsLTEnLCB7IHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gY29tbWFuZCcsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnZmlsZTEudHNcXG5maWxlMi50cycgfV0sIHN1Y2Nlc3M6IHRydWUgfSksXG5cdFx0XHRcdFx0XHRfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHR9KSgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSAncnVuLWRhbmdlcm91cy1jb21tYW5kJzoge1xuXHRcdFx0XHQvLyBGaXJlIHRvb2xfc3RhcnQgKyBwZW5kaW5nX2NvbmZpcm1hdGlvbiB3aXRoIHNoZWxsIHBlcm1pc3Npb24gZm9yIGEgZGVuaWVkIGNvbW1hbmQgKHNob3VsZCByZXF1aXJlIGNvbmZpcm1hdGlvbilcblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHMgb2YgX3Rvb2xTdGFydChjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy1zaGVsbC1kZW55LTEnLCAnYmFzaCcsICdSdW4gQ29tbWFuZCcsICdSdW4gY29tbWFuZCcpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5maXJlKHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDUpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzLmZpcmUoX3BlbmRpbmdDb25maXJtYXRpb24oY2hhdCwgJ3RjLXNoZWxsLWRlbnktMScsICdybSAtcmYgLycsIHsgcGVybWlzc2lvbktpbmQ6ICdzaGVsbCcsIHRvb2xJbnB1dDogJ3JtIC1yZiAvJywgY29uZmlybWF0aW9uVGl0bGU6ICdSdW4gaW4gdGVybWluYWwnIH0pKTtcblx0XHRcdFx0fSkoKTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLnNldCgndGMtc2hlbGwtZGVueS0xJywgKGFwcHJvdmVkKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGFwcHJvdmVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9maXJlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdFx0XHRfdG9vbENvbXBsZXRlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLXNoZWxsLWRlbnktMScsIHsgcGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBjb21tYW5kJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICcnIH1dLCBzdWNjZXNzOiB0cnVlIH0pLFxuXHRcdFx0XHRcdFx0XHRfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpLFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgJ29ycGhhbi1jb25maXJtYXRpb24nOiB7XG5cdFx0XHRcdC8vIFJlZ3Jlc3Npb24gc2NlbmFyaW8gZm9yIGEgYHBlbmRpbmdfY29uZmlybWF0aW9uYCB0aGF0XG5cdFx0XHRcdC8vIGFycml2ZXMgd2l0aG91dCBhbiBhY3RpdmUgcHJvdG9jb2wgdHVybiAodGhlIHNlc3Npb24gd291bGRcblx0XHRcdFx0Ly8gb3RoZXJ3aXNlIGhhbmcgZm9yZXZlcikuIFJlcHJvZHVjZXMgYSBob29rLXRyaWdnZXJlZFxuXHRcdFx0XHQvLyBjb250aW51YXRpb24gdGhhdCBydW5zICphZnRlciogdGhlIHByb3RvY29sIHR1cm4gaGFzXG5cdFx0XHRcdC8vIGFscmVhZHkgY29tcGxldGVkOlxuXHRcdFx0XHQvLyAgIDEuIEEgdG9vbCBydW5zIGFuZCB0aGUgdHVybiBjb21wbGV0ZXMgXHUyMDE0IHRoZSBzdGF0ZSBtYW5hZ2VyXG5cdFx0XHRcdC8vICAgICAgbm8gbG9uZ2VyIGhhcyBhbiBhY3RpdmUgdHVybi5cblx0XHRcdFx0Ly8gICAyLiBUaGUgY29udGludWF0aW9uIGRpc3BhdGNoZXMgYSBuZXcgdG9vbCB3aXRoIGFuIGVtcHR5XG5cdFx0XHRcdC8vICAgICAgdHVybklkIGFuZCBlbWl0cyBgcGVuZGluZ19jb25maXJtYXRpb25gIHdoaWxlIHRoZXJlIGlzXG5cdFx0XHRcdC8vICAgICAgbm8gYWN0aXZlIHR1cm4uXG5cdFx0XHRcdC8vIFRoZSByZWFkIHRhcmdldHMgYSBwYXRoIGluc2lkZSB0aGUgd29ya2luZyBkaXJlY3RvcnksIHNvIHRoZVxuXHRcdFx0XHQvLyBob3N0IGF1dG8tYXBwcm92ZXMgaXQgYW5kIGNhbGxzIGByZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdGAsXG5cdFx0XHRcdC8vIHdoaWNoIHJlc29sdmVzIHRoZSBjYWxsYmFjayBiZWxvdyBhbmQgbGV0cyB0aGUgc2Vzc2lvblxuXHRcdFx0XHQvLyBjb250aW51ZS4gV2l0aG91dCB0aGUgZml4IHRoZSBzaWduYWwgaXMgZHJvcHBlZCwgdGhlIGNhbGxiYWNrXG5cdFx0XHRcdC8vIG5ldmVyIGZpcmVzLCBhbmQgdGhlIHNlc3Npb24gaGFuZ3MuXG5cdFx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIF90b29sU3RhcnQoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGMtb3JwaGFuLWluaXRpYWwnLCAnYmFzaCcsICdSdW4gQ29tbWFuZCcsICdSdW4gY29tbWFuZCcpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5maXJlKHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDUpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzLmZpcmUoX3Rvb2xDb21wbGV0ZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy1vcnBoYW4taW5pdGlhbCcsIHsgcGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBjb21tYW5kJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdvaycgfV0sIHN1Y2Nlc3M6IHRydWUgfSkpO1xuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoNSk7XG5cdFx0XHRcdFx0Ly8gQ29tcGxldGUgdGhlIHR1cm4gXHUyMDE0IHRoZSBzdGF0ZSBtYW5hZ2VyIGNsZWFycyB0aGUgYWN0aXZlIHR1cm4uXG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGF0UHJvZ3Jlc3MuZmlyZShfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpKTtcblxuXHRcdFx0XHRcdC8vIEhvb2stdHJpZ2dlcmVkIGNvbnRpbnVhdGlvbjogYSBuZXcgdG9vbCBzdGFydHMgd2l0aCBhblxuXHRcdFx0XHRcdC8vIGVtcHR5IHR1cm5JZCBhbmQgYHBlbmRpbmdfY29uZmlybWF0aW9uYCBhcnJpdmVzIHdoaWxlXG5cdFx0XHRcdFx0Ly8gdGhlcmUgaXMgbm8gYWN0aXZlIHR1cm4uXG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIF90b29sU3RhcnQoY2hhdCwgc2Vzc2lvblN0ciwgJycsICd0Yy1vcnBoYW4nLCAndmlldycsICdSZWFkJywgJ1JlYWQgZmlsZScpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5maXJlKHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDUpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzLmZpcmUoX3BlbmRpbmdDb25maXJtYXRpb24oY2hhdCwgJ3RjLW9ycGhhbicsICdSZWFkIGZpbGUnLCB7IHBlcm1pc3Npb25LaW5kOiAncmVhZCcsIHBlcm1pc3Npb25QYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyB9KSk7XG5cdFx0XHRcdH0pKCk7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdQZXJtaXNzaW9ucy5zZXQoJ3RjLW9ycGhhbicsIChhcHByb3ZlZCkgPT4ge1xuXHRcdFx0XHRcdGlmIChhcHByb3ZlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZmlyZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRcdFx0X3Rvb2xDb21wbGV0ZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy1vcnBoYW4nLCB7IHBhc3RUZW5zZU1lc3NhZ2U6ICdSZWFkIGZpbGUnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2NvbnRlbnRzJyB9XSwgc3VjY2VzczogdHJ1ZSB9KSxcblx0XHRcdFx0XHRcdFx0X21hcmtkb3duKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ2NvbnRpbnVlZC1hZnRlci1ob29rJyksXG5cdFx0XHRcdFx0XHRcdF9pZGxlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCksXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSAnd2l0aC11c2FnZSc6XG5cdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0X21hcmtkb3duKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ1VzYWdlIHJlc3BvbnNlLicpLFxuXHRcdFx0XHRcdF91c2FnZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQsIHsgaW5wdXRUb2tlbnM6IDEwMCwgb3V0cHV0VG9rZW5zOiA1MCwgbW9kZWw6ICdtb2NrLW1vZGVsJywgX21ldGE6IHsgY29zdDogMC41IH0gfSksXG5cdFx0XHRcdFx0X2lkbGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkKSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICd3aXRoLXJlYXNvbmluZyc6IHtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbFJlYXNvbmluZyA9IF9yZWFzb25pbmcoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAnTGV0IG1lIHRoaW5rJyk7XG5cdFx0XHRcdGNvbnN0IHBhcnRJZCA9IGluaXRpYWxSZWFzb25pbmcuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydFxuXHRcdFx0XHRcdCYmIGhhc0tleShpbml0aWFsUmVhc29uaW5nLmFjdGlvbi5wYXJ0LCB7IGlkOiB0cnVlIH0pXG5cdFx0XHRcdFx0PyBpbml0aWFsUmVhc29uaW5nLmFjdGlvbi5wYXJ0LmlkXG5cdFx0XHRcdFx0OiAnJztcblx0XHRcdFx0dGhpcy5fZmlyZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRpbml0aWFsUmVhc29uaW5nLFxuXHRcdFx0XHRcdF9hY3Rpb24oY2hhdCwge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVhc29uaW5nLFxuXHRcdFx0XHRcdFx0dHVybklkOiB0aWQsXG5cdFx0XHRcdFx0XHRwYXJ0SWQsXG5cdFx0XHRcdFx0XHRjb250ZW50OiAnIGFib3V0IHRoaXMuLi4nLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdF9tYXJrZG93bihjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICdSZWFzb25lZCByZXNwb25zZS4nKSxcblx0XHRcdFx0XHRfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgJ3dpdGgtdGl0bGUnOlxuXHRcdFx0XHR0aGlzLl9maXJlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdF9tYXJrZG93bihjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICdUaXRsZSByZXNwb25zZS4nKSxcblx0XHRcdFx0XHRfdGl0bGVDaGFuZ2VkKHNlc3Npb24sIHNlc3Npb25TdHIsIE1PQ0tfQVVUT19USVRMRSksXG5cdFx0XHRcdFx0X2lkbGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkKSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdzbG93Jzoge1xuXHRcdFx0XHQvLyBTbG93IHJlc3BvbnNlIGZvciBjYW5jZWwgdGVzdGluZyBcdTIwMTQgZmlyZXMgZGVsdGEgYWZ0ZXIgYSBsb25nIGRlbGF5XG5cdFx0XHRcdGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY3R4ID0gdGhpcy5fY3R4KGNoYXQpO1xuXHRcdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0XHRfbWFya2Rvd24oY2hhdCwgY3R4LnNlc3Npb25TdHIsIGN0eC50dXJuSWQsICdTbG93IHJlc3BvbnNlLicpLFxuXHRcdFx0XHRcdFx0X2lkbGUoY2hhdCwgY3R4LnNlc3Npb25TdHIsIGN0eC50dXJuSWQpLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHR9LCA1MDAwKTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0Fib3J0cy5zZXQoc2Vzc2lvbi50b1N0cmluZygpLCAoKSA9PiBjbGVhclRpbWVvdXQodGltZXIpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgJ2NsaWVudC10b29sJzoge1xuXHRcdFx0XHQvLyBGaXJlcyB0b29sX3N0YXJ0IHdpdGggdG9vbENsaWVudElkIGZvbGxvd2VkIGJ5IHBlbmRpbmdfY29uZmlybWF0aW9uXG5cdFx0XHRcdC8vICh3aXRob3V0IGNvbmZpcm1hdGlvblRpdGxlKSB0byBzaW11bGF0ZSBhIGNsaWVudC1wcm92aWRlZCB0b29sXG5cdFx0XHRcdC8vIHRoYXQgaXMgcmVhZHkgZm9yIGV4ZWN1dGlvbi4gVGhlIHJlYWwgU0RLIGhhbmRsZXIgZmlyZXNcblx0XHRcdFx0Ly8gdG9vbF9yZWFkeSBvbmNlIGl0cyBkZWZlcnJlZCBpcyBpbiBwbGFjZS5cblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdFx0XHQvLyBDbGllbnQgdG9vbHMgZG9uJ3QgZ2V0IGF1dG8tcmVhZHkgXHUyMDE0IHRvb2xTdGFydCB3aXRoIHRvb2xDbGllbnRJZCBvbmx5IGVtaXRzIHRvb2xfc3RhcnRcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5maXJlKF9hY3Rpb24oY2hhdCwge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0XHRcdHR1cm5JZDogdGlkLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNsaWVudC0xJyxcblx0XHRcdFx0XHRcdHRvb2xOYW1lOiAncnVuVGVzdHMnLFxuXHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGVzdHMnLFxuXHRcdFx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50LXRvb2wnIH0sXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoNSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGF0UHJvZ3Jlc3MuZmlyZShfcGVuZGluZ0NvbmZpcm1hdGlvbihjaGF0LCAndGMtY2xpZW50LTEnLCAnUnVubmluZyB0ZXN0cy4uLicsIHsgdG9vbElucHV0OiAne30nIH0pKTtcblx0XHRcdFx0fSkoKTtcblx0XHRcdFx0Ly8gVGhlIHRvb2wgc3RheXMgcGVuZGluZyBcdTIwMTQgdGhlIGNsaWVudCBpcyByZXNwb25zaWJsZSBmb3IgZGlzcGF0Y2hpbmcgdG9vbENhbGxDb21wbGV0ZS5cblx0XHRcdFx0Ly8gT25jZSBjb21wbGV0ZSwgZmlyZSBhIHJlc3BvbnNlIGRlbHRhIGFuZCBpZGxlLlxuXHRcdFx0XHR0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuc2V0KCd0Yy1jbGllbnQtMScsICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9maXJlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdFx0X21hcmtkb3duKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ0NsaWVudCB0b29sIGRvbmUuJyksXG5cdFx0XHRcdFx0XHRfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgJ2NsaWVudC10b29sLXdpdGgtcGVybWlzc2lvbic6IHtcblx0XHRcdFx0Ly8gRmlyZXMgdG9vbF9zdGFydCB3aXRoIHRvb2xDbGllbnRJZCBmb2xsb3dlZCBieSBhIHBlcm1pc3Npb24gcmVxdWVzdC5cblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5maXJlKF9hY3Rpb24oY2hhdCwge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0XHRcdHR1cm5JZDogdGlkLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNsaWVudC1wZXJtLTEnLFxuXHRcdFx0XHRcdFx0dG9vbE5hbWU6ICdydW5UZXN0cycsXG5cdFx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUZXN0cycsXG5cdFx0XHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAndGVzdC1jbGllbnQtdG9vbCcgfSxcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCg1KTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5maXJlKF9wZW5kaW5nQ29uZmlybWF0aW9uKGNoYXQsICd0Yy1jbGllbnQtcGVybS0xJywgJ1J1biB0ZXN0cyBvbiBwcm9qZWN0JywgeyBjb25maXJtYXRpb25UaXRsZTogJ0FsbG93IFJ1biBUZXN0cz8nIH0pKTtcblx0XHRcdFx0fSkoKTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLnNldCgndGMtY2xpZW50LXBlcm0tMScsIChhcHByb3ZlZCkgPT4ge1xuXHRcdFx0XHRcdGlmIChhcHByb3ZlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZmlyZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRcdFx0X3Rvb2xDb21wbGV0ZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy1jbGllbnQtcGVybS0xJywgeyBwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIHRlc3RzJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdhbGwgcGFzc2VkJyB9XSwgc3VjY2VzczogdHJ1ZSB9KSxcblx0XHRcdFx0XHRcdFx0X21hcmtkb3duKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ1Blcm1pc3Npb24gZ3JhbnRlZCwgdG9vbCBkb25lLicpLFxuXHRcdFx0XHRcdFx0XHRfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpLFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgJ3N1YmFnZW50Jzoge1xuXHRcdFx0XHQvLyBTcGF3bnMgYSBzdWJhZ2VudDogcGFyZW50IGB0YXNrYCB0b29sIHN0YXJ0cyAoZW1pdHMgc3RhcnQgK1xuXHRcdFx0XHQvLyBhdXRvLXJlYWR5IGFzIGEgcGFpciksIHRoZW4gYHN1YmFnZW50X3N0YXJ0ZWRgIGNyZWF0ZXMgdGhlXG5cdFx0XHRcdC8vIGNoaWxkIHNlc3Npb24sIHRoZW4gYW4gaW5uZXIgdG9vbCBydW5zIGluIHRoZSBjaGlsZCBzZXNzaW9uXG5cdFx0XHRcdC8vIChyb3V0ZWQgdmlhIGBwYXJlbnRUb29sQ2FsbElkYCkuXG5cdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0Li4uX3Rvb2xTdGFydChjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy10YXNrLTEnLCAndGFzaycsICdUYXNrJywgJ1NwYXduaW5nIHN1YmFnZW50JywgeyB0b29sS2luZDogJ3N1YmFnZW50Jywgc3ViYWdlbnRBZ2VudE5hbWU6ICdleHBsb3JlJywgc3ViYWdlbnREZXNjcmlwdGlvbjogJ0V4cGxvcmUnIH0pLFxuXHRcdFx0XHRcdHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0LCB0b29sQ2FsbElkOiAndGMtdGFzay0xJywgYWdlbnROYW1lOiAnZXhwbG9yZScsIGFnZW50RGlzcGxheU5hbWU6ICdFeHBsb3JlJywgYWdlbnREZXNjcmlwdGlvbjogJ0V4cGxvcmF0aW9uIGhlbHBlcicgfSxcblx0XHRcdFx0XHQuLi5fdG9vbFN0YXJ0KGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLWlubmVyLTEnLCAnZWNob190b29sJywgJ0VjaG8gVG9vbCcsICdJbm5lciB0b29sIHJ1bm5pbmcuLi4nLCB7IHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy10YXNrLTEnIH0pLFxuXHRcdFx0XHRcdF90b29sQ29tcGxldGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGMtaW5uZXItMScsIHsgcGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBpbm5lciB0b29sJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdpbm5lci1vaycgfV0sIHN1Y2Nlc3M6IHRydWUgfSwgJ3RjLXRhc2stMScpLFxuXHRcdFx0XHRcdHsga2luZDogJ3N1YmFnZW50X2NvbXBsZXRlZCcsIGNoYXQsIHRvb2xDYWxsSWQ6ICd0Yy10YXNrLTEnIH0sXG5cdFx0XHRcdFx0X3Rvb2xDb21wbGV0ZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy10YXNrLTEnLCB7IHBhc3RUZW5zZU1lc3NhZ2U6ICdTdWJhZ2VudCBkb25lJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICd0YXNrLW9rJyB9XSwgc3VjY2VzczogdHJ1ZSB9KSxcblx0XHRcdFx0XHRfbWFya2Rvd24oY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAnU3ViYWdlbnQgZmluaXNoZWQuJyksXG5cdFx0XHRcdFx0X2lkbGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkKSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRpZiAocHJvbXB0LnN0YXJ0c1dpdGgoJ3Rlcm1pbmFsLWVkaXQ6JykpIHtcblx0XHRcdFx0XHQvLyBUZXN0IHByb21wdDogc2ltdWxhdGUgYSB0ZXJtaW5hbCBjb21tYW5kIHRoYXQgZWRpdHMgYSBmaWxlIG9uIGRpc2tcblx0XHRcdFx0XHQvLyB3aXRob3V0IGVtaXR0aW5nIGFueSBUb29sUmVzdWx0RmlsZUVkaXRDb250ZW50LiBUaGUgdGVzdCByZWxpZXMgb24gdGhlXG5cdFx0XHRcdFx0Ly8gZ2l0LWRyaXZlbiBkaWZmIHBhdGggdG8gcGljayB0aGlzIHVwLiBGb3JtYXQ6IGB0ZXJtaW5hbC1lZGl0OjxhYnNQYXRoPmAuXG5cdFx0XHRcdFx0Y29uc3QgZmlsZVBhdGggPSBwcm9tcHQuc2xpY2UoJ3Rlcm1pbmFsLWVkaXQ6Jy5sZW5ndGgpO1xuXHRcdFx0XHRcdHZvaWQgKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgcyBvZiBfdG9vbFN0YXJ0KGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLXRlcm0tZWRpdC0xJywgJ2Jhc2gnLCAnUnVuIENvbW1hbmQnLCAnRWRpdCBmaWxlIHZpYSBzaGVsbCcpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzLmZpcmUocyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRcdFx0XHRcdGF3YWl0IGZzLndyaXRlRmlsZShmaWxlUGF0aCwgJ2VkaXRlZC1mcm9tLXRlcm1pbmFsXFxuJyk7XG5cdFx0XHRcdFx0XHR0aGlzLl9maXJlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdFx0XHRfdG9vbENvbXBsZXRlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLXRlcm0tZWRpdC0xJywgeyBwYXN0VGVuc2VNZXNzYWdlOiAnRWRpdGVkIGZpbGUnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ29rJyB9XSwgc3VjY2VzczogdHJ1ZSB9KSxcblx0XHRcdFx0XHRcdFx0X2lkbGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkKSxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdH0pKCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHRcdC8vIFN1cmZhY2UgZmFpbHVyZXMgZGV0ZXJtaW5pc3RpY2FsbHkgXHUyMDE0IGFuIHVuaGFuZGxlZCByZWplY3Rpb25cblx0XHRcdFx0XHRcdC8vIHdvdWxkIG1ha2UgdGhlIHRlc3Qgc3VpdGUgZmxha3kuXG5cdFx0XHRcdFx0XHR0aGlzLl9maXJlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdFx0XHRfbWFya2Rvd24oY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGVybWluYWwtZWRpdCBmYWlsZWQ6ICcgKyAoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpKSksXG5cdFx0XHRcdFx0XHRcdF9pZGxlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCksXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9maXJlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdF9tYXJrZG93bihjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICdVbmtub3duIHByb21wdDogJyArIHByb21wdCksXG5cdFx0XHRcdFx0X2lkbGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkKSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHNldFBlbmRpbmdNZXNzYWdlcyhjaGF0OiBVUkksIHN0ZWVyaW5nTWVzc2FnZTogUGVuZGluZ01lc3NhZ2UgfCB1bmRlZmluZWQsIF9xdWV1ZWRNZXNzYWdlczogcmVhZG9ubHkgUGVuZGluZ01lc3NhZ2VbXSk6IHZvaWQge1xuXHRcdC8vIFdoZW4gc3RlZXJpbmcgaXMgc2V0LCBjb25zdW1lIGl0IG9uIHRoZSBuZXh0IHRpY2tcblx0XHRpZiAoc3RlZXJpbmdNZXNzYWdlKSB7XG5cdFx0XHR0aW1lb3V0KDIwKS50aGVuKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGF0UHJvZ3Jlc3MuZmlyZSh7IGtpbmQ6ICdzdGVlcmluZ19jb25zdW1lZCcsIGNoYXQ6IGlzQWhwQ2hhdENoYW5uZWwoY2hhdC50b1N0cmluZygpKSA/IGNoYXQgOiBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShjaGF0KSksIGlkOiBzdGVlcmluZ01lc3NhZ2UuaWQgfSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRnZXRPckNyZWF0ZUFjdGl2ZUNsaWVudChfY2hhdDogVVJJLCBfY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQsIGNsaWVudDogeyByZWFkb25seSBjbGllbnRJZDogc3RyaW5nOyByZWFkb25seSBkaXNwbGF5TmFtZT86IHN0cmluZyB9LCBfaG9zdEN1c3RvbWl6YXRpb25zPzogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdKTogSUFjdGl2ZUNsaWVudCB7XG5cdFx0bGV0IHRvb2xzOiByZWFkb25seSBUb29sRGVmaW5pdGlvbltdID0gW107XG5cdFx0bGV0IGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10gPSBbXTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2xpZW50SWQ6IGNsaWVudC5jbGllbnRJZCxcblx0XHRcdGRpc3BsYXlOYW1lOiBjbGllbnQuZGlzcGxheU5hbWUsXG5cdFx0XHRnZXQgdG9vbHMoKSB7IHJldHVybiB0b29sczsgfSxcblx0XHRcdHNldCB0b29scyh2YWx1ZTogcmVhZG9ubHkgVG9vbERlZmluaXRpb25bXSkgeyB0b29scyA9IHZhbHVlOyB9LFxuXHRcdFx0Z2V0IGN1c3RvbWl6YXRpb25zKCkgeyByZXR1cm4gY3VzdG9taXphdGlvbnM7IH0sXG5cdFx0XHRzZXQgY3VzdG9taXphdGlvbnModmFsdWU6IHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSkgeyBjdXN0b21pemF0aW9ucyA9IHZhbHVlOyB9LFxuXHRcdH07XG5cdH1cblxuXHRyZW1vdmVBY3RpdmVDbGllbnQoKTogdm9pZCB7IH1cblxuXHRwcml2YXRlIGRpZENvbXBsZXRlVG9vbENhbGxzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0b25DbGllbnRUb29sQ2FsbENvbXBsZXRlKGNoYXQ6IFVSSSwgdG9vbENhbGxJZDogc3RyaW5nLCByZXN1bHQ6IFRvb2xDYWxsUmVzdWx0KTogdm9pZCB7XG5cdFx0Ly8gVGhlIG1vY2sncyBldmVudCBtb2RlbCBpcyBjaGF0LWNoYW5uZWwgb3JpZW50ZWQgKHNlbmRNZXNzYWdlIGZpcmVzXG5cdFx0Ly8gZXZlcnkgdHVybiBzaWduYWwgb24gdGhlIGNoYXQgVVJJKS4gRW1pdCB0aGUgY29tcGxldGlvbiBvbiB0aGUgY2hhdFxuXHRcdC8vIGNoYW5uZWwgdGhlIHRvb2wgd2FzIHN0YXJ0ZWQgb24gc28gdGhlIHBhcmtlZCB0dXJuIGNhbGxiYWNrIFx1MjAxNCB3aGljaFxuXHRcdC8vIGNhcHR1cmVkIHRoYXQgc2FtZSBjaGF0IFVSSSBcdTIwMTQgcmVzb2x2ZXMgb24gdGhlIHJpZ2h0IGNoYW5uZWwuXG5cdFx0Y29uc3Qga2V5ID0gYCR7Y2hhdC50b1N0cmluZygpfToke3Rvb2xDYWxsSWR9YDtcblx0XHRpZiAodGhpcy5kaWRDb21wbGV0ZVRvb2xDYWxscy5oYXMoa2V5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmRpZENvbXBsZXRlVG9vbENhbGxzLmFkZChrZXkpO1xuXHRcdC8vIEZpcmUgdG9vbF9jb21wbGV0ZSBhY3Rpb24gc2lnbmFsIGFuZCByZXNvbHZlIGFueSBwZW5kaW5nIGNhbGxiYWNrLlxuXHRcdGNvbnN0IHsgc2Vzc2lvblN0ciwgdHVybklkIH0gPSB0aGlzLl9jdHgoY2hhdCk7XG5cdFx0dGhpcy5fb25EaWRDaGF0UHJvZ3Jlc3MuZmlyZShfdG9vbENvbXBsZXRlKGNoYXQsIHNlc3Npb25TdHIsIHR1cm5JZCwgdG9vbENhbGxJZCwgcmVzdWx0KSk7XG5cdFx0Y29uc3QgY2FsbGJhY2sgPSB0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdGlmIChjYWxsYmFjaykge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHRcdGNhbGxiYWNrKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldFNlc3Npb25NZXNzYWdlcyhzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4ge1xuXHRcdGNvbnN0IHN1YmFnZW50SW5mbyA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHNlc3Npb24pO1xuXHRcdGlmIChzdWJhZ2VudEluZm8pIHtcblx0XHRcdHJldHVybiBidWlsZFN1YmFnZW50VHVybnNGcm9tSGlzdG9yeSh0aGlzLl9wcmVFeGlzdGluZ01lc3NhZ2VzLCBzdWJhZ2VudEluZm8udG9vbENhbGxJZCwgc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHR9XG5cdFx0Ly8gUmVzdG9yZSBhZGRyZXNzZXMgdGhlIGRlZmF1bHQgY2hhdCBieSBpdHMgY2hhbm5lbCBVUkk7IG5vcm1hbGl6ZSBpdFxuXHRcdC8vIGJhY2sgdG8gdGhlIHNlc3Npb24gVVJJIChtaXJyb3JpbmcgdGhlIHJlYWwgYWdlbnRzJyBnZXRTZXNzaW9uTWVzc2FnZXMpLlxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhdFVyaShzZXNzaW9uKTtcblx0XHRjb25zdCBub3JtYWxpemVkID0gcGFyc2VkICYmIGlzRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikgPyBVUkkucGFyc2UocGFyc2VkLnNlc3Npb24pIDogc2Vzc2lvbjtcblx0XHRpZiAobm9ybWFsaXplZC50b1N0cmluZygpID09PSBQUkVfRVhJU1RJTkdfU0VTU0lPTl9VUkkudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuIGJ1aWxkVHVybnNGcm9tSGlzdG9yeSh0aGlzLl9wcmVFeGlzdGluZ01lc3NhZ2VzKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0YXN5bmMgYWJvcnRTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNhbGxiYWNrID0gdGhpcy5fcGVuZGluZ0Fib3J0cy5nZXQoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRpZiAoY2FsbGJhY2spIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdBYm9ydHMuZGVsZXRlKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRjYWxsYmFjaygpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNoYW5nZU1vZGVsKF9zZXNzaW9uOiBVUkksIF9tb2RlbDogTW9kZWxTZWxlY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBNb2NrIGFnZW50IGRvZXNuJ3QgdHJhY2sgbW9kZWwgc3RhdGVcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXAgYW4gYWxyZWFkeS1yZXNvbHZlZCBjaGF0IFVSSSB0byB0aGUgYChzZXNzaW9uLCBjaGF0KWAgcGFpciB0aGVcblx0ICogc2NyaXB0ZWQgbW9jaydzIHBlci1jaGF0IGNvbnRleHQgaXMga2V5ZWQgYnkuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlQ2hhdFRhcmdldChjaGF0OiBVUkksIGNvbnRleHQ/OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IHsgc2Vzc2lvbjogVVJJOyBjaGF0OiBVUkkgfSB7XG5cdFx0aWYgKGNvbnRleHQpIHtcblx0XHRcdHJldHVybiB7IHNlc3Npb246IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpLmNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgY2hhdCB9O1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYXRVcmkoY2hhdCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2NyaXB0ZWQgbW9jayBjaGF0IG9wZXJhdGlvbiByZXF1aXJlcyBhbiBBSFAgY2hhdCBVUkk6ICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4geyBzZXNzaW9uOiBVUkkucGFyc2UocGFyc2VkLnNlc3Npb24pLCBjaGF0OiBVUkkucGFyc2UoY2hhdC50b1N0cmluZygpKSB9O1xuXHR9XG5cblx0cmVhZG9ubHkgY2hhdHM6IElBZ2VudENoYXRzID0ge1xuXHRcdGNyZWF0ZUNoYXQ6IChjaGF0VXJpOiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHwgdm9pZD4gPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXRVcmkpLmNvbmZpZ3VyYXRpb25SZXNvdXJjZTtcblx0XHRcdGlmICghdGhpcy5fc2Vzc2lvbnMuaGFzKEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSkpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLl9jcmVhdGVTZXNzaW9uUmVjb3JkKHNlc3Npb24pKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcignU2NyaXB0ZWQgbW9jayBhZ2VudCBkb2VzIG5vdCBzdXBwb3J0IG11bHRpcGxlIGNoYXRzJyk7XG5cdFx0fSxcblx0XHRkaXNwb3NlQ2hhdDogKGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gdGhpcy5fcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdCwgY29udGV4dCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGUoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9LFxuXHRcdHJlbGVhc2VDaGF0OiBhc3luYyAoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0dGhpcy5fcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdCwgY29udGV4dCk7XG5cdFx0fSxcblx0XHRzZW5kTWVzc2FnZTogKGNoYXRVcmk6IFVSSSwgcHJvbXB0OiBzdHJpbmcsIF93b3JraW5nRGlyZWN0b3JpZXNPckRpcmVjdG9yeTogcmVhZG9ubHkgVVJJW10gfCBVUkkgfCB1bmRlZmluZWQsIGF0dGFjaG1lbnRzPzogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSwgdHVybklkPzogc3RyaW5nLCBfc2VuZGVyQ2xpZW50SWQ/OiBzdHJpbmcsIGNsaWVudFR5cGVPckNvbnRleHQ/OiBBZ2VudEhvc3RDbGllbnRUeXBlIHwgVVJJIHwgSUFnZW50Q2hhdENvbnRleHQsIGNvbnRleHQ/OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0Y29uc3Qgb3BlcmF0aW9uQ29udGV4dCA9IGNvbnRleHQgPz8gKHR5cGVvZiBjbGllbnRUeXBlT3JDb250ZXh0ID09PSAnc3RyaW5nJyA/IHVuZGVmaW5lZCA6IGNsaWVudFR5cGVPckNvbnRleHQpO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uLCBjaGF0IH0gPSB0aGlzLl9yZXNvbHZlQ2hhdFRhcmdldChjaGF0VXJpLCBvcGVyYXRpb25Db250ZXh0KTtcblx0XHRcdHJldHVybiB0aGlzLnNlbmRNZXNzYWdlKHNlc3Npb24sIGNoYXQsIHByb21wdCwgYXR0YWNobWVudHMsIHR1cm5JZCk7XG5cdFx0fSxcblx0XHRhYm9ydDogKGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gdGhpcy5fcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdCwgY29udGV4dCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5hYm9ydFNlc3Npb24oc2Vzc2lvbik7XG5cdFx0fSxcblx0XHRjaGFuZ2VNb2RlbDogKGNoYXQ6IFVSSSwgbW9kZWw6IE1vZGVsU2VsZWN0aW9uLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSB0aGlzLl9yZXNvbHZlQ2hhdFRhcmdldChjaGF0LCBjb250ZXh0KTtcblx0XHRcdHJldHVybiB0aGlzLmNoYW5nZU1vZGVsKHNlc3Npb24sIG1vZGVsKTtcblx0XHR9LFxuXHRcdGNoYW5nZUFnZW50OiAoY2hhdDogVVJJLCBfYWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0Ly8gU2NyaXB0ZWQgbW9jayBkb2VzIG5vdCB0cmFjayBhZ2VudCBzZWxlY3Rpb24uXG5cdFx0XHRyZXNvbHZlQWdlbnRDaGF0Q29udGV4dChjb250ZXh0LCBjaGF0KTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9LFxuXHRcdGdldE1lc3NhZ2VzOiAoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRTZXNzaW9uTWVzc2FnZXModGhpcy5fcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdCwgY29udGV4dCkuc2Vzc2lvbik7XG5cdFx0fSxcblx0fTtcblxuXHRhc3luYyBtYXRlcmlhbGl6ZUNoYXQoX2NoYXQ6IFVSSSwgX2NvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0LCBfcHJvdmlkZXJEYXRhOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPElBZ2VudENyZWF0ZUNoYXRSZXN1bHQgfCB2b2lkPiB7IH1cblxuXHRhc3luYyBmaW5hbGl6ZVNlc3Npb24oc2Vzc2lvbjogVVJJLCBfY29udGV4dD86IHsgcmVhZG9ubHkgd29ya3NwYWNlbGVzcz86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZShBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hhdEN1c3RvbWl6YXRpb25zKCk6IFByb21pc2U8cmVhZG9ubHkgQ3VzdG9taXphdGlvbltdPiB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0YXN5bmMgdHJ1bmNhdGVDaGF0KF9jaGF0OiBVUkksIF90dXJuSWQ/OiBzdHJpbmcsIF9jb250ZXh0PzogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBNb2NrIGFnZW50IGFjY2VwdHMgdHJ1bmNhdGlvbiB3aXRob3V0IHNpZGUgZWZmZWN0c1xuXHR9XG5cblx0cmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QodG9vbENhbGxJZDogc3RyaW5nLCBhcHByb3ZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGNhbGxiYWNrID0gdGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLmdldCh0b29sQ2FsbElkKTtcblx0XHRpZiAoY2FsbGJhY2spIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdQZXJtaXNzaW9ucy5kZWxldGUodG9vbENhbGxJZCk7XG5cdFx0XHRjYWxsYmFjayhhcHByb3ZlZCk7XG5cdFx0fVxuXHR9XG5cblx0cmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdCgpOiB2b2lkIHtcblx0XHQvLyBuby1vcCBmb3IgdGVzdHNcblx0fVxuXG5cdGFzeW5jIGF1dGhlbnRpY2F0ZShfcmVzb3VyY2U6IHN0cmluZywgX3Rva2VuOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIHNodXRkb3duKCk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNjb3ZlcmVkQ2hhdHNFbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogRmlyZXMgYSBzZXF1ZW5jZSBvZiB7QGxpbmsgQWdlbnRTaWduYWx9cyB3aXRoIHN0YWdnZXJlZCAxMCBtcyBkZWxheXNcblx0ICogc28gdGhlIHN0YXRlIG1hbmFnZXIgcHJvY2Vzc2VzIHRoZW0gaW4gb3JkZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9maXJlU2VxdWVuY2Uoc2lnbmFsczogQWdlbnRTaWduYWxbXSk6IHZvaWQge1xuXHRcdGxldCBkZWxheSA9IDA7XG5cdFx0Zm9yIChjb25zdCBzaWduYWwgb2Ygc2lnbmFscykge1xuXHRcdFx0ZGVsYXkgKz0gMTA7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzLmZpcmUoc2lnbmFsKSwgZGVsYXkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBCdWlsZHMgdGhlIHNlc3Npb24tc3RyaW5nICsgdHVybklkIGNvbnRleHQgZm9yIHNpZ25hbCBjb25zdHJ1Y3Rpb24uICovXG5cdHByaXZhdGUgX2N0eChzZXNzaW9uOiBVUkkpOiB7IHNlc3Npb25TdHI6IHN0cmluZzsgdHVybklkOiBzdHJpbmcgfSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25TdHI6IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHR1cm5JZDogdGhpcy5fYWN0aXZlVHVybklkcy5nZXQodXJpS2V5KHNlc3Npb24pKSA/PyAnbW9jay10dXJuJyxcblx0XHR9O1xuXHR9XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUZXN0LWV2ZW50IGhlbHBlcnNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBTaWduYWwgZmFjdG9yeSBoZWxwZXJzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5sZXQgX21vY2tQYXJ0SWRDb3VudGVyID0gMDtcblxuLyoqIFdyYXBzIGEgc2Vzc2lvbiBhY3Rpb24gaW50byBhbiB7QGxpbmsgSUFnZW50QWN0aW9uU2lnbmFsfS4gKi9cbmZ1bmN0aW9uIF9hY3Rpb24oc2Vzc2lvbjogVVJJLCBhY3Rpb246IGltcG9ydCgnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJykuU2Vzc2lvbkFjdGlvbiB8IGltcG9ydCgnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJykuQ2hhdEFjdGlvbiwgcGFyZW50VG9vbENhbGxJZD86IHN0cmluZyk6IElBZ2VudEFjdGlvblNpZ25hbCB7XG5cdHJldHVybiB7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogc2Vzc2lvbiwgYWN0aW9uLCBwYXJlbnRUb29sQ2FsbElkIH07XG59XG5cbi8qKiBDcmVhdGVzIGEgbWFya2Rvd24ge0BsaW5rIFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd259IHJlc3BvbnNlIHBhcnQgc2lnbmFsLiAqL1xuZnVuY3Rpb24gX21hcmtkb3duKHNlc3Npb246IFVSSSwgc2Vzc2lvblN0cjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZywgY29udGVudDogc3RyaW5nLCBwYXJlbnRUb29sQ2FsbElkPzogc3RyaW5nKTogSUFnZW50QWN0aW9uU2lnbmFsIHtcblx0cmV0dXJuIF9hY3Rpb24oc2Vzc2lvbiwge1xuXHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCxcblx0XHR0dXJuSWQsXG5cdFx0cGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogYG1vY2stbWQtJHsrK19tb2NrUGFydElkQ291bnRlcn1gLCBjb250ZW50IH0sXG5cdH0sIHBhcmVudFRvb2xDYWxsSWQpO1xufVxuXG4vKiogQ3JlYXRlcyBhIHJlYXNvbmluZyB7QGxpbmsgUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmd9IHJlc3BvbnNlIHBhcnQgc2lnbmFsLiAqL1xuZnVuY3Rpb24gX3JlYXNvbmluZyhzZXNzaW9uOiBVUkksIHNlc3Npb25TdHI6IHN0cmluZywgdHVybklkOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZyk6IElBZ2VudEFjdGlvblNpZ25hbCB7XG5cdHJldHVybiBfYWN0aW9uKHNlc3Npb24sIHtcblx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsXG5cdFx0dHVybklkLFxuXHRcdHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsIGlkOiBgbW9jay1ycy0keysrX21vY2tQYXJ0SWRDb3VudGVyfWAsIGNvbnRlbnQgfSxcblx0fSk7XG59XG5cbi8qKiBDcmVhdGVzIGEge0BsaW5rIEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZX0gc2lnbmFsLiAqL1xuZnVuY3Rpb24gX2lkbGUoc2Vzc2lvbjogVVJJLCBzZXNzaW9uU3RyOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogSUFnZW50QWN0aW9uU2lnbmFsIHtcblx0cmV0dXJuIF9hY3Rpb24oc2Vzc2lvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZCwgZHVyYXRpb246IDEgfSk7XG59XG5cbi8qKiBDcmVhdGVzIGEge0BsaW5rIEFjdGlvblR5cGUuQ2hhdEVycm9yfSBzaWduYWwuICovXG5mdW5jdGlvbiBfZXJyb3Ioc2Vzc2lvbjogVVJJLCBzZXNzaW9uU3RyOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nLCBlcnJvclR5cGU6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nLCBzdGFjaz86IHN0cmluZyk6IElBZ2VudEFjdGlvblNpZ25hbCB7XG5cdHJldHVybiBfYWN0aW9uKHNlc3Npb24sIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0RXJyb3IsIHR1cm5JZCwgZHVyYXRpb246IDEsIGVycm9yOiB7IGVycm9yVHlwZSwgbWVzc2FnZSwgc3RhY2sgfSB9KTtcbn1cblxuLyoqIENyZWF0ZXMgYSB7QGxpbmsgQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkfSBzaWduYWwuICovXG5mdW5jdGlvbiBfdGl0bGVDaGFuZ2VkKHNlc3Npb246IFVSSSwgc2Vzc2lvblN0cjogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogSUFnZW50QWN0aW9uU2lnbmFsIHtcblx0cmV0dXJuIF9hY3Rpb24oc2Vzc2lvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlIH0pO1xufVxuXG4vKiogQ3JlYXRlcyBhIHtAbGluayBBY3Rpb25UeXBlLkNoYXRVc2FnZX0gc2lnbmFsLiAqL1xuZnVuY3Rpb24gX3VzYWdlKHNlc3Npb246IFVSSSwgc2Vzc2lvblN0cjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZywgdXNhZ2U6IFVzYWdlSW5mbyk6IElBZ2VudEFjdGlvblNpZ25hbCB7XG5cdHJldHVybiBfYWN0aW9uKHNlc3Npb24sIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VXNhZ2UsIHR1cm5JZCwgdXNhZ2UgfSk7XG59XG5cbi8qKlxuICogQ3JlYXRlcyB0b29sLXN0YXJ0IHNpZ25hbHM6IGEge0BsaW5rIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnR9IGFuZCxcbiAqIGZvciBub24tY2xpZW50IHRvb2xzLCBhbiBhdXRvLXJlYWR5IHtAbGluayBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5fS5cbiAqL1xuZnVuY3Rpb24gX3Rvb2xTdGFydChzZXNzaW9uOiBVUkksIHNlc3Npb25TdHI6IHN0cmluZywgdHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZywgZGlzcGxheU5hbWU6IHN0cmluZywgaW52b2NhdGlvbk1lc3NhZ2U6IFN0cmluZ09yTWFya2Rvd24sIG9wdHM/OiB7XG5cdHRvb2xJbnB1dD86IHN0cmluZztcblx0dG9vbEtpbmQ/OiBzdHJpbmc7XG5cdHRvb2xDbGllbnRJZD86IHN0cmluZztcblx0c3ViYWdlbnRBZ2VudE5hbWU/OiBzdHJpbmc7XG5cdHN1YmFnZW50RGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHBhcmVudFRvb2xDYWxsSWQ/OiBzdHJpbmc7XG59KTogSUFnZW50QWN0aW9uU2lnbmFsW10ge1xuXHRjb25zdCBtZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRpZiAob3B0cz8udG9vbEtpbmQpIHtcblx0XHRtZXRhLnRvb2xLaW5kID0gb3B0cy50b29sS2luZDtcblx0fVxuXHRpZiAob3B0cz8uc3ViYWdlbnRBZ2VudE5hbWUpIHtcblx0XHRtZXRhLnN1YmFnZW50QWdlbnROYW1lID0gb3B0cy5zdWJhZ2VudEFnZW50TmFtZTtcblx0fVxuXHRpZiAob3B0cz8uc3ViYWdlbnREZXNjcmlwdGlvbikge1xuXHRcdG1ldGEuc3ViYWdlbnREZXNjcmlwdGlvbiA9IG9wdHMuc3ViYWdlbnREZXNjcmlwdGlvbjtcblx0fVxuXHRjb25zdCBzaWduYWxzOiBJQWdlbnRBY3Rpb25TaWduYWxbXSA9IFtfYWN0aW9uKHNlc3Npb24sIHtcblx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdHR1cm5JZCxcblx0XHR0b29sQ2FsbElkLFxuXHRcdHRvb2xOYW1lLFxuXHRcdGRpc3BsYXlOYW1lLFxuXHRcdGNvbnRyaWJ1dG9yOiBvcHRzPy50b29sQ2xpZW50SWQgPyB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IG9wdHMudG9vbENsaWVudElkIH0gOiB1bmRlZmluZWQsXG5cdFx0X21ldGE6IE9iamVjdC5rZXlzKG1ldGEpLmxlbmd0aCA/IG1ldGEgOiB1bmRlZmluZWQsXG5cdH0sIG9wdHM/LnBhcmVudFRvb2xDYWxsSWQpXTtcblx0aWYgKCFvcHRzPy50b29sQ2xpZW50SWQpIHtcblx0XHRzaWduYWxzLnB1c2goX2FjdGlvbihzZXNzaW9uLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0dHVybklkLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0dG9vbElucHV0OiBvcHRzPy50b29sSW5wdXQsXG5cdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHR9LCBvcHRzPy5wYXJlbnRUb29sQ2FsbElkKSk7XG5cdH1cblx0cmV0dXJuIHNpZ25hbHM7XG59XG5cbi8qKiBDcmVhdGVzIGEge0BsaW5rIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGV9IHNpZ25hbC4gKi9cbmZ1bmN0aW9uIF90b29sQ29tcGxldGUoc2Vzc2lvbjogVVJJLCBzZXNzaW9uU3RyOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nLCB0b29sQ2FsbElkOiBzdHJpbmcsIHJlc3VsdDogVG9vbENhbGxSZXN1bHQsIHBhcmVudFRvb2xDYWxsSWQ/OiBzdHJpbmcpOiBJQWdlbnRBY3Rpb25TaWduYWwge1xuXHRyZXR1cm4gX2FjdGlvbihzZXNzaW9uLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsIHR1cm5JZCwgdG9vbENhbGxJZCwgcmVzdWx0IH0sIHBhcmVudFRvb2xDYWxsSWQpO1xufVxuXG4vKiogQ3JlYXRlcyBhIHtAbGluayBJQWdlbnRUb29sUGVuZGluZ0NvbmZpcm1hdGlvblNpZ25hbH0uICovXG5mdW5jdGlvbiBfcGVuZGluZ0NvbmZpcm1hdGlvbihzZXNzaW9uOiBVUkksIHRvb2xDYWxsSWQ6IHN0cmluZywgaW52b2NhdGlvbk1lc3NhZ2U6IFN0cmluZ09yTWFya2Rvd24sIG9wdHM/OiB7XG5cdHRvb2xJbnB1dD86IHN0cmluZztcblx0Y29uZmlybWF0aW9uVGl0bGU/OiBTdHJpbmdPck1hcmtkb3duO1xuXHRwZXJtaXNzaW9uS2luZD86IElBZ2VudFRvb2xQZW5kaW5nQ29uZmlybWF0aW9uU2lnbmFsWydwZXJtaXNzaW9uS2luZCddO1xuXHRwZXJtaXNzaW9uUGF0aD86IElBZ2VudFRvb2xQZW5kaW5nQ29uZmlybWF0aW9uU2lnbmFsWydwZXJtaXNzaW9uUGF0aCddO1xufSk6IElBZ2VudFRvb2xQZW5kaW5nQ29uZmlybWF0aW9uU2lnbmFsIHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLFxuXHRcdGNoYXQ6IHNlc3Npb24sXG5cdFx0c3RhdGU6IHtcblx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHR0b29sTmFtZTogJycsXG5cdFx0XHRkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdHRvb2xJbnB1dDogb3B0cz8udG9vbElucHV0LFxuXHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IG9wdHM/LmNvbmZpcm1hdGlvblRpdGxlLFxuXHRcdH0sXG5cdFx0cGVybWlzc2lvbktpbmQ6IG9wdHM/LnBlcm1pc3Npb25LaW5kLFxuXHRcdHBlcm1pc3Npb25QYXRoOiBvcHRzPy5wZXJtaXNzaW9uUGF0aCxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxjQUFzZSwrQkFBK0I7QUFDOWdCLFNBQVMsK0JBQStCLDZCQUFrRDtBQUMxRixTQUFvQywrQkFBc0g7QUFFMUosU0FBUyxrQkFBMkM7QUFDcEQsU0FBUyxrQkFBa0IsNEJBQTRCLGdCQUFnQix1QkFBdUIseUJBQXlCLHFCQUFxQixrQkFBa0Isa0JBQWtCLGNBQWMsK0JBQStLO0FBQzdXLFNBQVMsY0FBYztBQUdoQixNQUFNLGtCQUFrQjtBQUUvQixTQUFTLE9BQU8sU0FBc0I7QUFLckMsU0FBTyxHQUFHLFFBQVEsTUFBTSxNQUFNLFFBQVEsU0FBUyxHQUFHLFFBQVEsSUFBSSxHQUFHLFFBQVEsUUFBUSxNQUFNLFFB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
