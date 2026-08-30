import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { FileType } from "../../../files/common/files.js";
import { NullTelemetryService, NullTelemetryServiceShape } from "../../../telemetry/common/telemetryUtils.js";
import { ChatSourceKind, ContentEncoding } from "../../common/state/protocol/commands.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { PROTOCOL_VERSION } from "../../common/state/protocol/version/registry.js";
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, JSON_RPC_INTERNAL_ERROR, JsonRpcErrorCodes, ProtocolError, AhpErrorCodes, AHP_UNSUPPORTED_PROTOCOL_VERSION, AHP_SESSION_NOT_FOUND } from "../../common/state/sessionProtocol.js";
import { MessageKind, ResponsePartKind, SessionStatus, ChangesetStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, buildChatUri, buildDefaultChatUri, readSessionExternal, readSessionWorkspaceless, withSessionExternal, withSessionWorkspaceless } from "../../common/state/sessionState.js";
import { ProtocolServerHandler } from "../../node/protocolServerHandler.js";
import { CompositeProtocolServer } from "../../node/compositeProtocolServer.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentHostFileSystemProvider, agentHostUri } from "../../common/agentHostFileSystemProvider.js";
import { agentsWindowAgentHostClientInfo, editorWindowAgentHostClientInfo, AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind } from "../../common/agentHostTelemetry.js";
import { iterateOtlpLogRecords, OtlpLogEmitter } from "../../common/otlp/otlpLogEmitter.js";
import { MessagePortProtocolServer } from "../../node/messagePortProtocolServer.js";
import { AgentHostClientConnectionTelemetryTracker } from "../../node/agentHostClientConnectionTelemetry.js";
import { AgentHostManagedSettingsService } from "../../node/agentHostManagedSettingsService.js";
class MockProtocolTransport {
  constructor(transportKind = AgentHostTransportKind.Unknown) {
    this.transportKind = transportKind;
    this._onMessage = new Emitter();
    this.onMessage = this._onMessage.event;
    this._onDidSend = new Emitter();
    this.onDidSend = this._onDidSend.event;
    this._onClose = new Emitter();
    this.onClose = this._onClose.event;
    this.sent = [];
  }
  send(message) {
    this.sent.push(message);
    this._onDidSend.fire(message);
  }
  simulateMessage(msg) {
    this._onMessage.fire(msg);
  }
  simulateClose() {
    this._onClose.fire();
  }
  dispose() {
    this._onMessage.dispose();
    this._onDidSend.dispose();
    this._onClose.dispose();
  }
}
class MockProtocolServer {
  constructor() {
    this._onConnection = new Emitter();
    this.onConnection = this._onConnection.event;
    this.address = "mock://test";
  }
  simulateConnection(transport) {
    this._onConnection.fire(transport);
  }
  dispose() {
    this._onConnection.dispose();
  }
}
class CountingLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.errorCount = 0;
  }
  error(_message, ..._args) {
    this.errorCount++;
  }
}
class FailingAgentHostFileSystemProvider extends AgentHostFileSystemProvider {
  registerAuthority(_authority, _connection) {
    throw new Error("registration failed");
  }
}
class FailingReconnectAgentHostFileSystemProvider extends AgentHostFileSystemProvider {
  constructor() {
    super(...arguments);
    this._registrationCount = 0;
  }
  registerAuthority(authority, connection) {
    this._registrationCount++;
    if (this._registrationCount === 2) {
      throw new Error("registration failed");
    }
    return super.registerAuthority(authority, connection);
  }
}
class TestTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super(...arguments);
    this.events = [];
  }
  publicLog2(eventName, data) {
    if (eventName) {
      this.events.push({ eventName, data });
    }
  }
}
class MockAgentService {
  constructor() {
    this.handledActions = [];
    this.handledClientTypes = [];
    this.handledClientContexts = [];
    this.browsedUris = [];
    this.browseErrors = /* @__PURE__ */ new Map();
    this.readErrors = /* @__PURE__ */ new Map();
    this.listedSessions = [];
    this.createSessionConfigs = [];
    this.managedSettingsDiagnostics = [];
    this.shutdownCalls = 0;
    this._onDidAction = new Emitter();
    this.onDidAction = this._onDidAction.event;
    this._onDidNotification = new Emitter();
    this.onDidNotification = this._onDidNotification.event;
    this._onMcpNotification = new Emitter();
    this.onMcpNotification = this._onMcpNotification.event;
    this.createdChats = [];
    this.disposedChats = [];
    this.watchSubscribeCalls = [];
    this.watchUnsubscribeCalls = [];
    /** Channels for which `onResourceWatchSubscribed` should return a descriptor. */
    this.liveWatchDescriptors = /* @__PURE__ */ new Map();
  }
  /** Connect to the state manager so dispatchAction works correctly. */
  setStateManager(sm) {
    this._stateManager = sm;
  }
  dispatchAction(channel, action, clientId, clientSeq, clientContext) {
    this.handledActions.push(action);
    this.handledClientTypes.push(clientContext?.clientType);
    this.handledClientContexts.push(clientContext);
    const origin = { clientId, clientSeq };
    this._stateManager.dispatchClientAction(channel, action, origin);
  }
  async createSession(config) {
    this.createSessionConfigs.push(config);
    await this.createSessionBarrier?.p;
    const session = config?.session ?? URI.parse("copilot:///new-session");
    this._stateManager.createSession({
      resource: session.toString(),
      provider: config?.provider ?? "copilot",
      title: "",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///created-project", displayName: "Created Project" },
      workingDirectories: config?.workingDirectories?.[0] ? [config.workingDirectories?.[0].toString()] : void 0
    });
    return session;
  }
  async resolveSessionConfig(_params) {
    return { schema: { type: "object", properties: {} }, values: {} };
  }
  async sessionConfigCompletions(_params) {
    return { items: [] };
  }
  async completions(_params) {
    return { items: [] };
  }
  async getCompletionTriggerCharacters() {
    return [];
  }
  async disposeSession(_session) {
  }
  async createChat(session, chat, options) {
    this.createdChats.push({ session: session.toString(), chat: chat.toString(), ...options ? { options } : {} });
    this._stateManager.addChat(session.toString(), chat.toString());
  }
  async disposeChat(session, chat) {
    this.disposedChats.push({ session: session.toString(), chat: chat.toString() });
    this._stateManager.removeChat(session.toString(), chat.toString());
  }
  async listSessions() {
    return this.listedSessions;
  }
  async subscribe(resource, _clientId) {
    await this.subscribeBarrier?.p;
    const snapshot = this._stateManager.getSnapshot(resource.toString());
    if (!snapshot) {
      throw new Error(`Cannot subscribe to unknown resource: ${resource.toString()}`);
    }
    return snapshot;
  }
  addSubscriber(_resource, _clientId) {
  }
  unsubscribe(_resource, _clientId) {
  }
  async shutdown() {
    this.shutdownCalls++;
  }
  async getNetworkDiagnosticsInfo() {
    return { version: "test", os: "test", arch: "test", proxySettings: {}, proxyEnv: {}, endpoints: [] };
  }
  async getManagedSettingsDiagnostics() {
    return this.managedSettingsDiagnostics;
  }
  async diagnosticsFetch(url) {
    return { url };
  }
  async authenticate(_params) {
    return { authenticated: true };
  }
  getAuthToken() {
    return void 0;
  }
  async resourceWrite(_params) {
    return {};
  }
  async resourceList(uri) {
    this.browsedUris.push(uri);
    const error = this.browseErrors.get(uri.toString());
    if (error) {
      throw error;
    }
    return {
      entries: [
        { name: "src", type: "directory" },
        { name: "README.md", type: "file" }
      ]
    };
  }
  async resourceRead(uri) {
    const error = this.readErrors.get(uri.toString());
    if (error) {
      throw error;
    }
    return { data: "", encoding: ContentEncoding.Utf8 };
  }
  async resourceCopy(_params) {
    return {};
  }
  async resourceDelete() {
    return {};
  }
  async resourceMove() {
    return {};
  }
  async resourceResolve(_params) {
    throw new Error("Not implemented");
  }
  async resourceMkdir(_params) {
    return {};
  }
  async createResourceWatch(_params) {
    throw new Error("Not implemented");
  }
  onResourceWatchSubscribed(channel) {
    this.watchSubscribeCalls.push(channel);
    return this.liveWatchDescriptors.get(channel);
  }
  onResourceWatchUnsubscribed(channel) {
    this.watchUnsubscribeCalls.push(channel);
    return this.liveWatchDescriptors.has(channel);
  }
  async createTerminal() {
  }
  async disposeTerminal() {
  }
  async invokeChangesetOperation() {
    return {};
  }
  async handleMcpRequest() {
    throw new Error("Method not found");
  }
  dispose() {
    this._onDidAction.dispose();
    this._onDidNotification.dispose();
    this._onMcpNotification.dispose();
  }
}
function notification(method, params) {
  return { jsonrpc: "2.0", method, params };
}
function request(id, method, params) {
  return { jsonrpc: "2.0", id, method, params };
}
function findNotifications(sent, method) {
  return sent.filter(isJsonRpcNotification);
}
function findResponse(sent, id) {
  return sent.find((message) => isJsonRpcResponse(message) && message.id === id);
}
function waitForResponse(transport, id) {
  return Event.toPromise(Event.filter(transport.onDidSend, (message) => isJsonRpcResponse(message) && message.id === id));
}
suite("ProtocolServerHandler", () => {
  let disposables;
  let stateManager;
  let server;
  let agentService;
  let managedSettingsService;
  let handler;
  let fileSystemProvider;
  let logService;
  let telemetryService;
  const sessionUri = URI.from({ scheme: "copilot", path: "/test-session" }).toString();
  const defaultChatUri = buildDefaultChatUri(sessionUri);
  function makeSessionSummary(resource) {
    return {
      resource: resource ?? sessionUri,
      provider: "copilot",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///test-project", displayName: "Test Project" }
    };
  }
  function connectClient(clientId, initialSubscriptions, clientInfo, meta) {
    const transport = new MockProtocolTransport();
    server.simulateConnection(transport);
    transport.simulateMessage(request(1, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId,
      clientInfo,
      _meta: meta,
      initialSubscriptions
    }));
    return transport;
  }
  setup(() => {
    disposables = new DisposableStore();
    stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    server = disposables.add(new MockProtocolServer());
    agentService = new MockAgentService();
    agentService.setStateManager(stateManager);
    managedSettingsService = disposables.add(new AgentHostManagedSettingsService());
    logService = new CountingLogService();
    telemetryService = new TestTelemetryService();
    disposables.add(agentService);
    disposables.add(handler = new ProtocolServerHandler(
      agentService,
      stateManager,
      server,
      { hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess, defaultDirectory: URI.file("/home/testuser").toString() },
      disposables.add(fileSystemProvider = new AgentHostFileSystemProvider()),
      logService,
      telemetryService,
      managedSettingsService
    ));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("handshake returns initialize response", () => {
    const transport = connectClient("client-1");
    const resp = findResponse(transport.sent, 1);
    assert.ok(resp, "should have sent initialize response");
    const result = resp.result;
    assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
    assert.strictEqual(result.serverSeq, stateManager.serverSeq);
  });
  test("handshake rejects unsupported protocol versions", () => {
    const transport = new MockProtocolTransport();
    server.simulateConnection(transport);
    transport.simulateMessage(request(1, "initialize", {
      protocolVersions: ["0.0.0"],
      clientId: "client-incompat"
    }));
    const resp = findResponse(transport.sent, 1);
    assert.ok(resp, "should have sent error response");
    assert.strictEqual(resp.error?.code, AHP_UNSUPPORTED_PROTOCOL_VERSION);
    assert.match(resp.error.message, /0\.0\.0/);
    assert.match(resp.error.message, new RegExp(PROTOCOL_VERSION.replace(/\./g, "\\.")));
    const data = resp.error.data;
    assert.strictEqual(data?._meta?.vscodeUpgradeMethod, void 0);
    transport.simulateClose();
    transport.dispose();
  });
  test("handshake leniently picks the highest compatible offered version", () => {
    const transport = new MockProtocolTransport();
    server.simulateConnection(transport);
    transport.simulateMessage(request(1, "initialize", {
      protocolVersions: ["0.0.0", PROTOCOL_VERSION, "9.9.9"],
      clientId: "client-lenient"
    }));
    const resp = findResponse(transport.sent, 1);
    assert.ok(resp?.result, "should have negotiated successfully");
    assert.strictEqual(resp.result.protocolVersion, PROTOCOL_VERSION);
    transport.simulateClose();
    transport.dispose();
  });
  test("upgrade method advertised when management socket env var is set", () => {
    const originalEnv = process.env.VSCODE_AGENT_HOST_MANAGEMENT_SOCKET;
    process.env.VSCODE_AGENT_HOST_MANAGEMENT_SOCKET = "/tmp/mock-supervisor.sock";
    try {
      const transport = new MockProtocolTransport();
      server.simulateConnection(transport);
      transport.simulateMessage(request(1, "initialize", {
        protocolVersions: ["9.9.9"],
        clientId: "client-incompat-with-cli"
      }));
      const resp = findResponse(transport.sent, 1);
      assert.strictEqual(resp?.error?.code, AHP_UNSUPPORTED_PROTOCOL_VERSION);
      const data = resp.error.data;
      assert.strictEqual(data?._meta?.vscodeUpgradeMethod, "_vscodeUpgrade");
      transport.simulateClose();
      transport.dispose();
    } finally {
      if (originalEnv === void 0) {
        delete process.env.VSCODE_AGENT_HOST_MANAGEMENT_SOCKET;
      } else {
        process.env.VSCODE_AGENT_HOST_MANAGEMENT_SOCKET = originalEnv;
      }
    }
  });
  test("_vscodeUpgrade RPC returns MethodNotFound when no supervisor is available", async () => {
    const transport = new MockProtocolTransport();
    server.simulateConnection(transport);
    const responsePromise = waitForResponse(transport, 42);
    transport.simulateMessage(request(42, "_vscodeUpgrade", {}));
    const resp = await responsePromise;
    assert.ok(resp.error, "should have responded with an error");
    assert.strictEqual(
      resp.error.code,
      -32601
      /* MethodNotFound */
    );
    transport.simulateClose();
    transport.dispose();
  });
  test("handshake with initialSubscriptions returns snapshots", () => {
    stateManager.createSession(makeSessionSummary());
    const transport = connectClient("client-1", [sessionUri]);
    const resp = findResponse(transport.sent, 1);
    assert.ok(resp);
    const result = resp.result;
    assert.strictEqual(result.snapshots.length, 1);
    assert.strictEqual(result.snapshots[0].resource.toString(), sessionUri.toString());
  });
  test("handshake retains an initial subscription whose state has not materialized", () => {
    const transport = connectClient("client-1", [defaultChatUri]);
    const response = findResponse(transport.sent, 1);
    assert.deepStrictEqual(response.result.snapshots, []);
    transport.sent.length = 0;
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello after restore", origin: { kind: MessageKind.User } }
    });
    const actionMessages = findNotifications(transport.sent, "action");
    const turnStarted = actionMessages.find((message) => {
      const envelope = message.params;
      return envelope.action?.type === ActionType.ChatTurnStarted;
    });
    assert.ok(turnStarted, "should deliver actions after the initially missing state materializes");
  });
  test("ping responds before initialize", async () => {
    const transport = new MockProtocolTransport();
    disposables.add(transport);
    server.simulateConnection(transport);
    const responsePromise = waitForResponse(transport, 7);
    transport.simulateMessage(request(7, "ping", {}));
    const resp = await responsePromise;
    assert.strictEqual(resp.id, 7);
    assert.strictEqual(resp.result, null);
    transport.simulateClose();
  });
  test("unknown requests return MethodNotFound before and after initialize", () => {
    const transport = new MockProtocolTransport();
    disposables.add(transport);
    server.simulateConnection(transport);
    transport.simulateMessage(request(7, "notARealMethod", { channel: "ahp-root://" }));
    transport.simulateMessage(request(8, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId: "client-1"
    }));
    transport.simulateMessage(request(9, "notARealMethod", { channel: "ahp-root://" }));
    assert.deepStrictEqual(
      [findResponse(transport.sent, 7), findResponse(transport.sent, 9)],
      [
        { jsonrpc: "2.0", id: 7, error: { code: JsonRpcErrorCodes.MethodNotFound, message: "Method not found: notARealMethod" } },
        { jsonrpc: "2.0", id: 9, error: { code: JsonRpcErrorCodes.MethodNotFound, message: "Method not found: notARealMethod" } }
      ]
    );
  });
  test("extension methods remain enabled by default", async () => {
    const transport = connectClient("client-extension-default");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 11);
    transport.simulateMessage(request(11, "shutdown", {}));
    assert.deepStrictEqual({
      response: await responsePromise,
      shutdownCalls: agentService.shutdownCalls
    }, {
      response: { jsonrpc: "2.0", id: 11, result: null },
      shutdownCalls: 1
    });
  });
  test("extension methods can be disabled without blocking managed settings contributions", () => {
    const localDisposables = disposables.add(new DisposableStore());
    const localServer = localDisposables.add(new MockProtocolServer());
    localDisposables.add(new ProtocolServerHandler(
      agentService,
      stateManager,
      localServer,
      {
        defaultDirectory: URI.file("/home/testuser").toString(),
        allowExtensionMethods: false
      },
      localDisposables.add(new AgentHostFileSystemProvider()),
      logService,
      NullTelemetryService,
      managedSettingsService
    ));
    const transport = new MockProtocolTransport();
    localServer.simulateConnection(transport);
    transport.simulateMessage(request(1, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId: "client-extension-disabled"
    }));
    transport.sent.length = 0;
    transport.simulateMessage(request(2, "shutdown", {}));
    transport.simulateMessage(notification("setClientManagedSettingsPermissions", {
      permissions: { disableBypassPermissionsMode: "disable", ask: ["Shell"] }
    }));
    assert.deepStrictEqual({
      response: findResponse(transport.sent, 2),
      shutdownCalls: agentService.shutdownCalls,
      managedSettingsPermissions: managedSettingsService.permissions
    }, {
      response: { jsonrpc: "2.0", id: 2, error: { code: JsonRpcErrorCodes.MethodNotFound, message: "Method not found: shutdown" } },
      shutdownCalls: 0,
      managedSettingsPermissions: { disableBypassPermissionsMode: "disable", ask: ["Shell"] }
    });
  });
  test("ping responds after initialize", async () => {
    const transport = connectClient("client-1");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 9);
    transport.simulateMessage(request(9, "ping", {}));
    const resp = await responsePromise;
    assert.strictEqual(resp.id, 9);
    assert.strictEqual(resp.result, null);
  });
  test("subscribe request returns snapshot", async () => {
    stateManager.createSession(makeSessionSummary());
    const transport = connectClient("client-1");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 1);
    transport.simulateMessage(request(1, "subscribe", { channel: sessionUri }));
    const resp = await responsePromise;
    assert.ok(resp, "should have sent response");
    const result = resp.result;
    assert.strictEqual(result.snapshot.resource.toString(), sessionUri.toString());
  });
  test("client action is dispatched and echoed", () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transport = connectClient("client-1", [sessionUri, defaultChatUri]);
    transport.sent.length = 0;
    transport.simulateMessage(notification("dispatchAction", {
      channel: defaultChatUri,
      clientSeq: 1,
      action: {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      }
    }));
    const actionMsgs = findNotifications(transport.sent, "action");
    const turnStarted = actionMsgs.find((m) => {
      const envelope2 = m.params;
      return envelope2.action.type === ActionType.ChatTurnStarted;
    });
    assert.ok(turnStarted, "should have echoed turnStarted");
    const envelope = turnStarted.params;
    assert.strictEqual(envelope.origin.clientId, "client-1");
    assert.strictEqual(envelope.origin.clientSeq, 1);
  });
  test("unsupported chat working-directory actions are rejected, not dispatched", () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const cases = [
      { type: ActionType.ChatWorkingDirectorySet, channel: defaultChatUri },
      { type: ActionType.ChatWorkingDirectoryRemoved, channel: defaultChatUri }
    ];
    for (const [index, { type, channel }] of cases.entries()) {
      const clientId = `wd-client-${index}`;
      const clientSeq = 100 + index;
      const transport = connectClient(clientId, [sessionUri, defaultChatUri]);
      transport.sent.length = 0;
      agentService.handledActions.length = 0;
      transport.simulateMessage(notification("dispatchAction", {
        channel,
        clientSeq,
        action: { type, directory: "file:///tmp/extra-root" }
      }));
      assert.deepStrictEqual(agentService.handledActions, [], `${type} must not be dispatched`);
      const actionMsgs = findNotifications(transport.sent, "action");
      assert.strictEqual(actionMsgs.length, 1, `${type} should emit exactly one envelope`);
      const envelope = actionMsgs[0].params;
      assert.strictEqual(envelope.action.type, type);
      assert.ok(envelope.rejectionReason, `${type} envelope should carry a rejectionReason`);
      assert.strictEqual(envelope.origin.clientId, clientId);
      assert.strictEqual(envelope.origin.clientSeq, clientSeq);
    }
  });
  test("session working-directory actions reach the agent service", () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transport = connectClient("working-directory-client", [sessionUri], editorWindowAgentHostClientInfo);
    transport.sent.length = 0;
    transport.simulateMessage(notification("dispatchAction", {
      channel: sessionUri,
      clientSeq: 1,
      action: { type: ActionType.SessionWorkingDirectorySet, directory: "file:///tmp/extra-root" }
    }));
    const action = agentService.handledActions.at(-1);
    const envelope = findNotifications(transport.sent, "action").at(-1)?.params;
    assert.deepStrictEqual({
      action,
      clientType: agentService.handledClientTypes.at(-1),
      rejectionReason: envelope?.rejectionReason
    }, {
      action: { type: ActionType.SessionWorkingDirectorySet, directory: "file:///tmp/extra-root" },
      clientType: AgentHostClientType.EditorWindow,
      rejectionReason: void 0
    });
  });
  test("actions are scoped to subscribed sessions", () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transportA = connectClient("client-a", [sessionUri]);
    const transportB = connectClient("client-b");
    transportA.sent.length = 0;
    transportB.sent.length = 0;
    stateManager.dispatchServerAction(sessionUri, {
      type: ActionType.SessionTitleChanged,
      title: "New Title"
    });
    assert.strictEqual(findNotifications(transportA.sent, "action").length, 1);
    assert.strictEqual(findNotifications(transportB.sent, "action").length, 0);
  });
  test("changeset actions are scoped to subscribed changeset URIs", () => {
    const changesetUri = `${sessionUri}/changeset/session`;
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    stateManager.registerChangeset(changesetUri);
    const transportA = connectClient("client-a-cs", [changesetUri]);
    const transportB = connectClient("client-b-cs", [sessionUri]);
    transportA.sent.length = 0;
    transportB.sent.length = 0;
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///test/changed.ts",
        edit: {
          after: { uri: "file:///test/changed.ts", content: { uri: "file:///test/changed.ts" } },
          diff: { added: 1, removed: 0 }
        }
      }
    });
    const aActions = findNotifications(transportA.sent, "action");
    const bActions = findNotifications(transportB.sent, "action");
    assert.strictEqual(aActions.length, 1, "changeset subscriber should receive 1 envelope");
    assert.strictEqual(bActions.length, 0, "session-only subscriber should receive 0 changeset envelopes");
    const params = aActions[0].params;
    assert.deepStrictEqual(
      { type: params.action.type, channel: params.channel },
      { type: ActionType.ChangesetFileSet, channel: changesetUri }
    );
  });
  test("changeset/cleared reaches changeset subscribers", () => {
    const changesetUri = `${sessionUri}/changeset/session`;
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    stateManager.registerChangeset(changesetUri);
    const transport = connectClient("client-clear", [changesetUri]);
    transport.sent.length = 0;
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetCleared
    });
    const actions = findNotifications(transport.sent, "action");
    assert.strictEqual(actions.length, 1);
    const params = actions[0].params;
    assert.strictEqual(params.action.type, ActionType.ChangesetCleared);
  });
  test("notifications are broadcast to all clients", () => {
    const transportA = connectClient("client-a");
    const transportB = connectClient("client-b");
    transportA.sent.length = 0;
    transportB.sent.length = 0;
    stateManager.createSession(makeSessionSummary());
    assert.strictEqual(findNotifications(transportA.sent, "root/sessionAdded").length, 1);
    assert.strictEqual(findNotifications(transportB.sent, "root/sessionAdded").length, 1);
  });
  test("listSessions includes project metadata", async () => {
    agentService.listedSessions.push({
      session: URI.parse(sessionUri),
      startTime: 1e3,
      modifiedTime: 2e3,
      project: { uri: URI.file("/workspace/project"), displayName: "Project" },
      summary: "Session Summary"
    });
    const transport = connectClient("client-list");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "listSessions"));
    const resp = await responsePromise;
    const result = resp.result;
    assert.deepStrictEqual(result.items.map((item) => item.project), [{ uri: URI.file("/workspace/project").toString(), displayName: "Project" }]);
  });
  test("listSessions omits project metadata when absent", async () => {
    agentService.listedSessions.push({
      session: URI.parse(sessionUri),
      startTime: 1e3,
      modifiedTime: 2e3,
      summary: "Session Summary"
    });
    const transport = connectClient("client-list-no-project");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "listSessions"));
    const resp = await responsePromise;
    const result = resp.result;
    assert.deepStrictEqual(result.items.map((item) => item.project), [void 0]);
  });
  test("listSessions surfaces the changes summary from the agent", async () => {
    agentService.listedSessions.push({
      session: URI.parse(sessionUri),
      startTime: 1e3,
      modifiedTime: 2e3,
      summary: "Session With Changesets",
      changes: {
        additions: 5,
        deletions: 2,
        files: 3
      }
    });
    const transport = connectClient("client-list-changesets");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "listSessions"));
    const resp = await responsePromise;
    const result = resp.result;
    assert.deepStrictEqual(result.items[0].changes, {
      additions: 5,
      deletions: 2,
      files: 3
    });
  });
  test("listSessions carries the workspace-less marker on _meta", async () => {
    agentService.listedSessions.push({
      session: URI.parse(sessionUri),
      startTime: 1e3,
      modifiedTime: 2e3,
      summary: "Quick Chat",
      workingDirectories: [URI.file("/home/user/.copilot/chats/session-1")],
      _meta: withSessionWorkspaceless(void 0, true)
    });
    const transport = connectClient("client-list-workspaceless");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "listSessions"));
    const resp = await responsePromise;
    const result = resp.result;
    assert.deepStrictEqual(result.items.map((item) => readSessionWorkspaceless(item._meta)), [true]);
  });
  test("listSessions carries external provenance on _meta", async () => {
    agentService.listedSessions.push({
      session: URI.parse(sessionUri),
      startTime: 1e3,
      modifiedTime: 2e3,
      summary: "Native Chat",
      _meta: withSessionExternal(void 0, true)
    });
    const transport = connectClient("client-list-external");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "listSessions"));
    const resp = await responsePromise;
    const result = resp.result;
    assert.deepStrictEqual(result.items.map((item) => readSessionExternal(item._meta)), [true]);
  });
  test("listSessions omits _meta when the agent provides none", async () => {
    agentService.listedSessions.push({
      session: URI.parse(sessionUri),
      startTime: 1e3,
      modifiedTime: 2e3,
      summary: "Session Summary"
    });
    const transport = connectClient("client-list-no-meta");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "listSessions"));
    const resp = await responsePromise;
    const result = resp.result;
    assert.deepStrictEqual(result.items.map((item) => item._meta), [void 0]);
  });
  test("createSession forwards request metadata and broadcasts project in sessionAdded summary", async () => {
    const transport = connectClient("client-create");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    const newSession = URI.parse("copilot:///created-session").toString();
    const _meta = { multiRoot: { workspaceFile: "file:///demo.code-workspace" } };
    transport.simulateMessage(request(2, "createSession", { channel: newSession, _meta }));
    const resp = await responsePromise;
    const added = findNotifications(transport.sent, "root/sessionAdded")[0];
    assert.deepStrictEqual({
      result: resp.result,
      project: added.params.summary.project,
      _meta: agentService.createSessionConfigs.at(-1)?._meta
    }, {
      result: null,
      project: { uri: "file:///created-project", displayName: "Created Project" },
      _meta
    });
  });
  test("createSession rejects a fork targeting its source session", async () => {
    const transport = connectClient("client-self-fork");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    const session = URI.parse("copilot:///same-session").toString();
    transport.simulateMessage(request(2, "createSession", {
      channel: session,
      provider: "copilot",
      fork: { session, turnId: "turn-1" }
    }));
    const response = await responsePromise;
    assert.deepStrictEqual({
      errorCode: response.error?.code,
      errorMessage: response.error?.message,
      createCalls: agentService.createSessionConfigs.length
    }, {
      errorCode: AhpErrorCodes.SessionAlreadyExists,
      errorMessage: `Fork target session must differ from source session: ${session}`,
      createCalls: 0
    });
  });
  test("whenIdle waits for in-flight protocol requests after disposal", async () => {
    const transport = connectClient("client-drain");
    agentService.createSessionBarrier = new DeferredPromise();
    const newSession = URI.parse("copilot:///drain-session").toString();
    transport.simulateMessage(request(2, "createSession", { channel: newSession }));
    handler.dispose();
    let idle = false;
    const whenIdle = handler.whenIdle().then(() => idle = true);
    await Promise.resolve();
    const idleWhileRequestPending = idle;
    agentService.createSessionBarrier.complete();
    await whenIdle;
    assert.deepStrictEqual({
      idleWhileRequestPending,
      idleAfterRequest: idle
    }, {
      idleWhileRequestPending: false,
      idleAfterRequest: true
    });
  });
  test("whenIdle waits for reconnect subscription restoration", async () => {
    stateManager.createSession(makeSessionSummary());
    const initialTransport = connectClient("client-drain-reconnect", [sessionUri]);
    const initialResponse = findResponse(initialTransport.sent, 1);
    initialTransport.simulateClose();
    agentService.subscribeBarrier = new DeferredPromise();
    const reconnectTransport = new MockProtocolTransport();
    server.simulateConnection(reconnectTransport);
    reconnectTransport.simulateMessage(request(2, "reconnect", {
      clientId: "client-drain-reconnect",
      lastSeenServerSeq: initialResponse.result.serverSeq,
      subscriptions: [sessionUri]
    }));
    await Promise.resolve();
    let idle = false;
    const whenIdle = handler.whenIdle().then(() => idle = true);
    await Promise.resolve();
    const idleWhileRestoring = idle;
    agentService.subscribeBarrier.complete();
    await whenIdle;
    assert.deepStrictEqual({
      idleWhileRestoring,
      idleAfterRestore: idle
    }, {
      idleWhileRestoring: false,
      idleAfterRestore: true
    });
  });
  suite("createChat / disposeChat", () => {
    const peerChat = buildChatUri(sessionUri, "peer-1");
    test("createChat on the default chat URI is a no-op", async () => {
      stateManager.createSession(makeSessionSummary());
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", { channel: sessionUri, chat: buildDefaultChatUri(sessionUri) }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        result: resp.result,
        created: agentService.createdChats
      }, {
        result: null,
        created: []
      });
    });
    test("createChat for an additional chat forwards to the agent service and grows the catalog", async () => {
      stateManager.createSession(makeSessionSummary());
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", { channel: sessionUri, chat: peerChat }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        result: resp.result,
        created: agentService.createdChats,
        inCatalog: stateManager.getSessionState(sessionUri)?.chats.some((c) => c.resource === peerChat)
      }, {
        result: null,
        created: [{ session: sessionUri, chat: peerChat }],
        inCatalog: true
      });
    });
    test("createChat forwards a fork source to the agent service", async () => {
      stateManager.createSession(makeSessionSummary());
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", {
        channel: sessionUri,
        chat: peerChat,
        source: { kind: ChatSourceKind.Fork, chat: buildDefaultChatUri(sessionUri), turnId: "turn-1" }
      }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        result: resp.result,
        created: agentService.createdChats
      }, {
        result: null,
        created: [{
          session: sessionUri,
          chat: peerChat,
          options: {
            fork: { source: URI.parse(buildDefaultChatUri(sessionUri)), turnId: "turn-1" }
          }
        }]
      });
    });
    test("createChat rejects a source without kind", async () => {
      stateManager.createSession(makeSessionSummary());
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", {
        channel: sessionUri,
        chat: peerChat,
        source: {
          chat: buildDefaultChatUri(sessionUri),
          turnId: "turn-1"
        }
      }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        code: resp.error?.code,
        message: resp.error?.message,
        created: agentService.createdChats
      }, {
        code: JsonRpcErrorCodes.InvalidParams,
        message: "Unsupported createChat source kind: undefined",
        created: []
      });
    });
    test("createChat forwards a side chat source to the agent service", async () => {
      stateManager.createSession(makeSessionSummary());
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", {
        channel: sessionUri,
        chat: peerChat,
        source: {
          kind: ChatSourceKind.SideChat,
          chat: buildDefaultChatUri(sessionUri),
          turnId: "turn-active",
          selection: { text: "  selected text  ", responsePartId: "response-part-1" }
        }
      }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        result: resp.result,
        created: agentService.createdChats
      }, {
        result: null,
        created: [{
          session: sessionUri,
          chat: peerChat,
          options: {
            sideChat: { source: URI.parse(buildDefaultChatUri(sessionUri)), turnId: "turn-active", selection: { text: "  selected text  ", responsePartId: "response-part-1" } }
          }
        }]
      });
    });
    test("createChat rejects an unknown source kind", async () => {
      stateManager.createSession(makeSessionSummary());
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", {
        channel: sessionUri,
        chat: peerChat,
        source: {
          kind: "unknown",
          chat: buildDefaultChatUri(sessionUri),
          turnId: "turn-1"
        }
      }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        code: resp.error?.code,
        message: resp.error?.message,
        created: agentService.createdChats
      }, {
        code: JsonRpcErrorCodes.InvalidParams,
        message: "Unsupported createChat source kind: unknown",
        created: []
      });
    });
    test("createChat for an unknown session fails with SESSION_NOT_FOUND", async () => {
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createChat", { channel: "copilot:/missing", chat: buildChatUri("copilot:/missing", "peer-1") }));
      const resp = await responsePromise;
      assert.strictEqual(resp.error?.code, AHP_SESSION_NOT_FOUND);
    });
    test("disposeChat forwards to the agent service and shrinks the catalog", async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.addChat(sessionUri, peerChat);
      const transport = connectClient("client-cc");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "disposeChat", { channel: peerChat }));
      const resp = await responsePromise;
      assert.deepStrictEqual({
        result: resp.result,
        disposed: agentService.disposedChats,
        inCatalog: stateManager.getSessionState(sessionUri)?.chats.some((c) => c.resource === peerChat)
      }, {
        result: null,
        disposed: [{ session: sessionUri, chat: peerChat }],
        inCatalog: false
      });
    });
  });
  test("reconnect replays missed actions", async () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transport1 = connectClient("client-r", [sessionUri]);
    const resp = findResponse(transport1.sent, 1);
    const initSeq = resp.result.serverSeq;
    transport1.simulateClose();
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Title A" });
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Title B" });
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-r",
      lastSeenServerSeq: initSeq,
      subscriptions: [sessionUri]
    }));
    const reconnectResp = await reconnectRespPromise;
    const result = reconnectResp.result;
    assert.strictEqual(result.type, "replay");
    if (result.type === "replay") {
      assert.strictEqual(result.actions.length, 2);
    }
  });
  test("reconnect rejects a client the server no longer remembers", async () => {
    const transport = new MockProtocolTransport();
    server.simulateConnection(transport);
    const responsePromise = waitForResponse(transport, 1);
    transport.simulateMessage(request(1, "reconnect", {
      clientId: "forgotten-client",
      lastSeenServerSeq: 0,
      subscriptions: []
    }));
    const response = await responsePromise;
    assert.deepStrictEqual(response.error, {
      code: AhpErrorCodes.NotFound,
      message: "Reconnect client not found: forgotten-client"
    });
    transport.simulateClose();
  });
  test("retains client info for action attribution across reconnect", async () => {
    const transport1 = connectClient("client-attribution", void 0, agentsWindowAgentHostClientInfo, {
      "vscode.clientConnectionKind": AgentHostClientConnectionKind.DevTunnel,
      "vscode.clientMachineId": "client-machine-id",
      "vscode.clientDevDeviceId": "client-dev-device-id"
    });
    transport1.simulateMessage(notification("dispatchAction", {
      channel: "ahp-root://",
      clientSeq: 1,
      action: { type: ActionType.RootConfigChanged, config: {} }
    }));
    transport1.simulateClose();
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 2);
    transport2.simulateMessage(request(2, "reconnect", {
      clientId: "client-attribution",
      lastSeenServerSeq: stateManager.serverSeq,
      subscriptions: [],
      _meta: {
        "vscode.clientMachineId": "client-machine-id",
        "vscode.clientDevDeviceId": "client-dev-device-id"
      }
    }));
    await reconnectRespPromise;
    transport2.simulateMessage(notification("dispatchAction", {
      channel: "ahp-root://",
      clientSeq: 2,
      action: { type: ActionType.RootConfigChanged, config: {} }
    }));
    assert.deepStrictEqual({
      clientTypes: agentService.handledClientTypes,
      connectionKinds: agentService.handledClientContexts.map((context) => context?.connectionKind),
      machineIds: agentService.handledClientContexts.map((context) => context?.machineId),
      devDeviceIds: agentService.handledClientContexts.map((context) => context?.devDeviceId)
    }, {
      clientTypes: ["agents_window", "agents_window"],
      connectionKinds: ["dev_tunnel", "dev_tunnel"],
      machineIds: ["client-machine-id", "client-machine-id"],
      devDeviceIds: ["client-dev-device-id", "client-dev-device-id"]
    });
  });
  test("does not retain client telemetry identity when reconnect omits it", async () => {
    const transport1 = connectClient("client-consent", void 0, agentsWindowAgentHostClientInfo, {
      "vscode.clientMachineId": "client-machine-id",
      "vscode.clientDevDeviceId": "client-dev-device-id"
    });
    transport1.simulateClose();
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 2);
    transport2.simulateMessage(request(2, "reconnect", {
      clientId: "client-consent",
      lastSeenServerSeq: stateManager.serverSeq,
      subscriptions: []
    }));
    await reconnectRespPromise;
    transport2.simulateMessage(notification("dispatchAction", {
      channel: "ahp-root://",
      clientSeq: 1,
      action: { type: ActionType.RootConfigChanged, config: {} }
    }));
    assert.deepStrictEqual(agentService.handledClientContexts.at(-1), {
      clientType: "agents_window",
      connectionKind: "unknown",
      transportKind: "unknown",
      hostLaunchKind: "vscode_main_process"
    });
  });
  test("attributes telemetry identity independently for concurrent clients", () => {
    const clients = [
      connectClient("client-a", void 0, agentsWindowAgentHostClientInfo, {
        "vscode.clientMachineId": "machine-a",
        "vscode.clientDevDeviceId": "device-a"
      }),
      connectClient("client-b", void 0, editorWindowAgentHostClientInfo, {
        "vscode.clientMachineId": "machine-b",
        "vscode.clientDevDeviceId": "device-b"
      })
    ];
    for (const client of clients) {
      client.simulateMessage(notification("dispatchAction", {
        channel: "ahp-root://",
        clientSeq: 1,
        action: { type: ActionType.RootConfigChanged, config: {} }
      }));
    }
    assert.deepStrictEqual(agentService.handledClientContexts.map((context) => ({
      clientType: context?.clientType,
      machineId: context?.machineId,
      devDeviceId: context?.devDeviceId
    })), [{
      clientType: "agents_window",
      machineId: "machine-a",
      devDeviceId: "device-a"
    }, {
      clientType: "editor_window",
      machineId: "machine-b",
      devDeviceId: "device-b"
    }]);
  });
  test("reports client topology and attributes actions to the initiating connection", () => {
    const transport = new MockProtocolTransport(AgentHostTransportKind.WebSocket);
    server.simulateConnection(transport);
    transport.simulateMessage(request(1, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId: "tunnel-client",
      clientInfo: { name: "vscode-agents-window", version: "1.2.3", title: "VS Code Agents Window" },
      _meta: {
        "vscode.clientConnectionKind": AgentHostClientConnectionKind.DevTunnel,
        "vscode.clientMachineId": "client-machine-id",
        "vscode.clientDevDeviceId": "client-dev-device-id"
      }
    }));
    transport.simulateMessage(notification("dispatchAction", {
      channel: "ahp-root://",
      clientSeq: 1,
      action: { type: ActionType.RootConfigChanged, config: {} }
    }));
    transport.simulateClose();
    const connectionEvents = telemetryService.events.map((event) => {
      const data = event.data;
      return {
        ...event,
        data: {
          ...data,
          connectionDurationMs: typeof data.connectionDurationMs
        }
      };
    });
    assert.deepStrictEqual({
      clientContext: agentService.handledClientContexts.at(-1),
      connectionEvents
    }, {
      clientContext: {
        clientType: "agents_window",
        connectionKind: "dev_tunnel",
        transportKind: "websocket",
        hostLaunchKind: "vscode_main_process",
        machineId: "client-machine-id",
        devDeviceId: "client-dev-device-id"
      },
      connectionEvents: [{
        eventName: "agentHost.clientConnection",
        data: {
          action: "connected",
          hostLaunchKind: "vscode_main_process",
          clientId: "tunnel-client",
          clientType: "agents_window",
          clientImplementationName: "vscode-agents-window",
          clientImplementationVersion: "1.2.3",
          connectionKind: "dev_tunnel",
          transportKind: "websocket",
          clientMachineId: "client-machine-id",
          clientDevDeviceId: "client-dev-device-id",
          protocolVersion: PROTOCOL_VERSION,
          isReconnect: false,
          connectedClientCount: 1,
          connectedTransportCount: 1,
          clientTransportCount: 1,
          connectionDurationMs: "undefined",
          subscriptionCount: void 0
        }
      }, {
        eventName: "agentHost.clientConnection",
        data: {
          action: "disconnected",
          hostLaunchKind: "vscode_main_process",
          clientId: "tunnel-client",
          clientType: "agents_window",
          clientImplementationName: "vscode-agents-window",
          clientImplementationVersion: "1.2.3",
          connectionKind: "dev_tunnel",
          transportKind: "websocket",
          clientMachineId: "client-machine-id",
          clientDevDeviceId: "client-dev-device-id",
          protocolVersion: PROTOCOL_VERSION,
          isReconnect: false,
          connectedClientCount: 0,
          connectedTransportCount: 0,
          clientTransportCount: 0,
          connectionDurationMs: "number",
          subscriptionCount: 0
        }
      }]
    });
  });
  test("reports process-wide client counts across protocol listeners", () => {
    const localDisposables = disposables.add(new DisposableStore());
    const tracker = localDisposables.add(new AgentHostClientConnectionTelemetryTracker());
    const firstServer = localDisposables.add(new MockProtocolServer());
    const secondServer = localDisposables.add(new MockProtocolServer());
    const handlers = [];
    for (const listener of [firstServer, secondServer]) {
      handlers.push(localDisposables.add(new ProtocolServerHandler(
        agentService,
        stateManager,
        listener,
        { hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess, connectionTelemetryTracker: tracker },
        localDisposables.add(new AgentHostFileSystemProvider()),
        logService,
        telemetryService,
        managedSettingsService
      )));
    }
    for (const [index, listener] of [firstServer, secondServer].entries()) {
      const transport = new MockProtocolTransport(index === 0 ? AgentHostTransportKind.MessagePort : AgentHostTransportKind.WebSocket);
      listener.simulateConnection(transport);
      transport.simulateMessage(request(index + 1, "initialize", {
        protocolVersions: [PROTOCOL_VERSION],
        clientId: `client-${index}`
      }));
    }
    handlers[0].dispose();
    assert.deepStrictEqual(telemetryService.events.map((event) => {
      const data = event.data;
      return {
        action: data.action,
        connectedClientCount: data.connectedClientCount,
        connectedTransportCount: data.connectedTransportCount
      };
    }), [
      { action: "connected", connectedClientCount: 1, connectedTransportCount: 1 },
      { action: "connected", connectedClientCount: 2, connectedTransportCount: 2 },
      { action: "disconnected", connectedClientCount: 1, connectedTransportCount: 1 }
    ]);
  });
  test("expires disconnected client reconnect history", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const tracker = disposables.add(new AgentHostClientConnectionTelemetryTracker(100));
      const firstTransport = {};
      assert.strictEqual(tracker.connect("client", firstTransport).isReconnect, false);
      tracker.disconnect("client", firstTransport);
      assert.strictEqual(tracker.hasSeenClient("client"), true);
      await new Promise((resolve) => setTimeout(resolve, 101));
      assert.deepStrictEqual({
        hasSeenClient: tracker.hasSeenClient("client"),
        isReconnect: tracker.connect("client", {}).isReconnect
      }, {
        hasSeenClient: false,
        isReconnect: false
      });
    });
  });
  test("does not count a client when initialization fails after negotiation", () => {
    const localDisposables = disposables.add(new DisposableStore());
    const localServer = localDisposables.add(new MockProtocolServer());
    const localTelemetry = new TestTelemetryService();
    const localHandler = localDisposables.add(new ProtocolServerHandler(
      agentService,
      stateManager,
      localServer,
      { hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess },
      localDisposables.add(new FailingAgentHostFileSystemProvider()),
      logService,
      localTelemetry,
      managedSettingsService
    ));
    const counts = [];
    localDisposables.add(localHandler.onDidChangeConnectionCount((count) => counts.push(count)));
    const transport = new MockProtocolTransport(AgentHostTransportKind.WebSocket);
    localServer.simulateConnection(transport);
    transport.simulateMessage(request(1, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId: "failed-client"
    }));
    const responseCode = findResponse(transport.sent, 1).error.code;
    transport.simulateClose();
    assert.deepStrictEqual({
      counts,
      events: localTelemetry.events,
      responseCode
    }, {
      counts: [],
      events: [],
      responseCode: JSON_RPC_INTERNAL_ERROR
    });
  });
  test("rolls back reconnect when filesystem authority registration fails", async () => {
    const localDisposables = disposables.add(new DisposableStore());
    const localServer = localDisposables.add(new MockProtocolServer());
    const localTelemetry = new TestTelemetryService();
    const localHandler = localDisposables.add(new ProtocolServerHandler(
      agentService,
      stateManager,
      localServer,
      { hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess },
      localDisposables.add(new FailingReconnectAgentHostFileSystemProvider()),
      logService,
      localTelemetry,
      managedSettingsService
    ));
    const counts = [];
    localDisposables.add(localHandler.onDidChangeConnectionCount((count) => counts.push(count)));
    const initialTransport = new MockProtocolTransport();
    localServer.simulateConnection(initialTransport);
    initialTransport.simulateMessage(request(1, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId: "reconnecting-client"
    }));
    initialTransport.simulateClose();
    const failedTransport = new MockProtocolTransport();
    localServer.simulateConnection(failedTransport);
    failedTransport.simulateMessage(request(2, "reconnect", {
      clientId: "reconnecting-client",
      lastSeenServerSeq: 0,
      subscriptions: []
    }));
    const failedResponseCode = findResponse(failedTransport.sent, 2).error.code;
    failedTransport.simulateClose();
    const retryTransport = new MockProtocolTransport();
    localServer.simulateConnection(retryTransport);
    const retryResponsePromise = waitForResponse(retryTransport, 3);
    retryTransport.simulateMessage(request(3, "reconnect", {
      clientId: "reconnecting-client",
      lastSeenServerSeq: 0,
      subscriptions: []
    }));
    await retryResponsePromise;
    assert.deepStrictEqual({
      counts,
      connectionActions: localTelemetry.events.map((event) => event.data.action),
      failedResponseCode
    }, {
      counts: [1, 0, 1],
      connectionActions: ["connected", "disconnected", "connected"],
      failedResponseCode: JSON_RPC_INTERNAL_ERROR
    });
  });
  test("reconnect replays missed changeset actions to changeset subscribers", async () => {
    const changesetUri = `${sessionUri}/changeset/session`;
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    stateManager.registerChangeset(changesetUri);
    const transport1 = connectClient("client-rc", [changesetUri]);
    const resp = findResponse(transport1.sent, 1);
    const initSeq = resp.result.serverSeq;
    transport1.simulateClose();
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///a.ts",
        edit: {
          after: { uri: "file:///a.ts", content: { uri: "file:///a.ts" } },
          diff: { added: 2, removed: 0 }
        }
      }
    });
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetStatusChanged,
      status: ChangesetStatus.Ready
    });
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-rc",
      lastSeenServerSeq: initSeq,
      subscriptions: [changesetUri]
    }));
    const reconnectResp = await reconnectRespPromise;
    const result = reconnectResp.result;
    assert.strictEqual(result.type, "replay");
    if (result.type === "replay") {
      const replayedTypes = result.actions.map((e) => e.action.type);
      assert.ok(replayedTypes.includes(ActionType.ChangesetFileSet), "replay should include ChangesetFileSet");
      assert.ok(replayedTypes.includes(ActionType.ChangesetStatusChanged), "replay should include ChangesetStatusChanged");
    }
  });
  test("reconnect sends fresh snapshots when gap too large", async () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transport1 = connectClient("client-g", [sessionUri]);
    transport1.simulateClose();
    for (let i = 0; i < 1100; i++) {
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: `Title ${i}` });
    }
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-g",
      lastSeenServerSeq: 0,
      subscriptions: [sessionUri]
    }));
    const reconnectResp = await reconnectRespPromise;
    const result = reconnectResp.result;
    assert.strictEqual(result.type, "snapshot");
    if (result.type === "snapshot") {
      assert.ok(result.snapshots.length > 0, "should contain snapshots");
    }
  });
  test("reconnect rehydrates server-side state that was evicted while disconnected", async () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const subscribeCalls = [];
    agentService.subscribe = async (resource, _clientId) => {
      subscribeCalls.push(resource.toString());
      let snapshot = stateManager.getSnapshot(resource.toString());
      if (!snapshot) {
        stateManager.restoreSession(makeSessionSummary(), []);
        snapshot = stateManager.getSnapshot(resource.toString());
      }
      return snapshot;
    };
    const transport1 = connectClient("client-e", [sessionUri]);
    const initResp = findResponse(transport1.sent, 1);
    const initSeq = initResp.result.serverSeq;
    transport1.simulateClose();
    stateManager.removeSession(sessionUri);
    assert.strictEqual(stateManager.getSnapshot(sessionUri), void 0, "precondition: state evicted");
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-e",
      lastSeenServerSeq: initSeq,
      subscriptions: [sessionUri]
    }));
    await reconnectRespPromise;
    assert.deepStrictEqual(subscribeCalls, [sessionUri], "reconnect should call subscribe to restore evicted state");
    assert.ok(stateManager.getSnapshot(sessionUri), "state should have been re-hydrated by reconnect");
  });
  test("reconnect re-registers the reverse-RPC filesystem authority", async () => {
    const transport1 = connectClient("client-fs");
    transport1.simulateClose();
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-fs",
      lastSeenServerSeq: 0,
      subscriptions: []
    }));
    await reconnectRespPromise;
    transport2.sent.length = 0;
    disposables.add(transport2.onDidSend((msg) => {
      if (isJsonRpcRequest(msg) && msg.method === "resourceList") {
        transport2.simulateMessage({
          jsonrpc: "2.0",
          id: msg.id,
          result: { entries: [{ name: "after-reconnect.txt", type: "file" }] }
        });
      }
    }));
    const result = await fileSystemProvider.readdir(agentHostUri("client-fs", "/workspace"));
    assert.deepStrictEqual(result, [["after-reconnect.txt", FileType.File]]);
  });
  test("overlapping reconnect keeps earlier reverse-RPC requests alive until that transport closes", async () => {
    const transport1 = connectClient("client-fs-overlap");
    const reverseRequestPromise = Event.toPromise(Event.filter(transport1.onDidSend, (msg) => isJsonRpcRequest(msg) && msg.method === "resourceList"));
    const readPromise = fileSystemProvider.readdir(agentHostUri("client-fs-overlap", "/workspace"));
    const reverseRequest = await reverseRequestPromise;
    assert.ok(isJsonRpcRequest(reverseRequest));
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-fs-overlap",
      lastSeenServerSeq: 0,
      subscriptions: []
    }));
    await reconnectRespPromise;
    transport1.simulateMessage({
      jsonrpc: "2.0",
      id: reverseRequest.id,
      result: { entries: [{ name: "from-original-transport.txt", type: "file" }] }
    });
    const result = await readPromise;
    assert.deepStrictEqual(result, [["from-original-transport.txt", FileType.File]]);
  });
  test("closing an older overlapping transport rejects its pending reverse-RPC requests", async () => {
    const transport1 = connectClient("client-fs-overlap-close");
    const reverseRequestPromise = Event.toPromise(Event.filter(transport1.onDidSend, (msg) => isJsonRpcRequest(msg) && msg.method === "resourceList"));
    const readPromise = fileSystemProvider.readdir(agentHostUri("client-fs-overlap-close", "/workspace"));
    await reverseRequestPromise;
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-fs-overlap-close",
      lastSeenServerSeq: 0,
      subscriptions: []
    }));
    await reconnectRespPromise;
    transport1.simulateClose();
    await assert.rejects(readPromise, /Client client-fs-overlap-close disconnected/);
  });
  test("client disconnect cleans up", () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transport = connectClient("client-d", [sessionUri]);
    transport.sent.length = 0;
    transport.simulateClose();
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "After Disconnect" });
    assert.strictEqual(transport.sent.length, 0);
  });
  test("client disconnect retains active client during grace, then removes it and fails owned tool calls after grace period", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-1",
        invocationMessage: "Run Task",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const transport = connectClient("client-tools", [sessionUri]);
      transport.simulateClose();
      assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients.map((c) => c.clientId), ["client-tools"]);
      let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Running);
      await new Promise((r) => setTimeout(r, 30001));
      assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients, []);
      part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
        status: part.toolCall.status,
        success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0,
        error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : void 0
      } : void 0, {
        status: ToolCallStatus.Completed,
        success: false,
        error: "Client client-tools disconnected before completing Run Task"
      });
    });
  });
  test("client disconnect fails owned streaming tool calls after grace period", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      const transport = connectClient("client-tools", [sessionUri]);
      transport.simulateClose();
      let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
      await new Promise((r) => setTimeout(r, 30001));
      part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
        status: part.toolCall.status,
        success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0,
        error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : void 0
      } : void 0, {
        status: ToolCallStatus.Completed,
        success: false,
        error: "Client client-tools disconnected before completing Run Task"
      });
    });
  });
  test("owned tool call is not failed when closing the latest overlapping transport falls back to an older one", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      const fallbackTransport = connectClient("client-tools", [sessionUri]);
      const latestTransport = connectClient("client-tools", [sessionUri]);
      latestTransport.simulateClose();
      let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
      await new Promise((r) => setTimeout(r, 30001));
      part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
      fallbackTransport.simulateClose();
    });
  });
  test("owned tool call is failed after the last overlapping transport closes", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      const fallbackTransport = connectClient("client-tools", [sessionUri]);
      const latestTransport = connectClient("client-tools", [sessionUri]);
      latestTransport.simulateClose();
      await new Promise((r) => setTimeout(r, 30001));
      let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
      fallbackTransport.simulateClose();
      await new Promise((r) => setTimeout(r, 30001));
      part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
        status: part.toolCall.status,
        success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0,
        error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : void 0
      } : void 0, {
        status: ToolCallStatus.Completed,
        success: false,
        error: "Client client-tools disconnected before completing Run Task"
      });
    });
  });
  test("client reconnect without session subscription does not clear tool call disconnect timeout", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-1",
        invocationMessage: "Run Task",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const transport = connectClient("client-tools", [sessionUri]);
      transport.simulateClose();
      const reconnectTransport = new MockProtocolTransport();
      server.simulateConnection(reconnectTransport);
      reconnectTransport.simulateMessage(request(1, "reconnect", {
        clientId: "client-tools",
        lastSeenServerSeq: stateManager.serverSeq,
        subscriptions: []
      }));
      await new Promise((r) => setTimeout(r, 30001));
      const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
        status: part.toolCall.status,
        success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0
      } : void 0, {
        status: ToolCallStatus.Completed,
        success: false
      });
    });
  });
  test("client reconnect with session subscription clears tool call disconnect timeout for that session", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-1",
        invocationMessage: "Run Task",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const transport = connectClient("client-tools", [sessionUri]);
      transport.simulateClose();
      const reconnectTransport = new MockProtocolTransport();
      server.simulateConnection(reconnectTransport);
      reconnectTransport.simulateMessage(request(1, "reconnect", {
        clientId: "client-tools",
        lastSeenServerSeq: stateManager.serverSeq,
        subscriptions: [sessionUri]
      }));
      await new Promise((r) => setTimeout(r, 30001));
      const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Running);
    });
  });
  test("client tool timeout tells model it may retry when replacement active client provides the tool", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-tools",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-1",
        invocationMessage: "Run Task",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const transport = connectClient("client-tools", [sessionUri]);
      transport.simulateClose();
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "client-replacement",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      await new Promise((r) => setTimeout(r, 30001));
      const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed ? {
        status: part.toolCall.status,
        success: part.toolCall.success,
        content: part.toolCall.content
      } : void 0, {
        status: ToolCallStatus.Completed,
        success: false,
        content: [{ type: ToolResultContentType.Text, text: "The client that was running Run Task disconnected, but another active client now provides Run Task. You may try calling the tool again." }]
      });
    });
  });
  test("client tool call stamped for a disconnected protocol client fails after the grace period", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const chatUri = buildDefaultChatUri(sessionUri);
      const transport = connectClient("disconnected-client", [sessionUri]);
      transport.simulateClose();
      stateManager.dispatchServerAction(chatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(chatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "disconnected-client" }
      });
      let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
      await new Promise((r) => setTimeout(r, 30001));
      part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
        status: part.toolCall.status,
        success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0,
        error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : void 0
      } : void 0, {
        status: ToolCallStatus.Completed,
        success: false,
        error: "Client disconnected-client disconnected before completing Run Task"
      });
    });
  });
  test("client tool call owned by an active local IPC client is not treated as orphaned", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      stateManager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "local-client",
          tools: [{ name: "runTask", description: "Runs a task" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "local-client" }
      });
      await new Promise((r) => setTimeout(r, 30001));
      const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
    });
  });
  test("orphaned client tool call timeout is cleared when the owning client connects within the window", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const transport = connectClient("late-client", [sessionUri]);
      transport.simulateClose();
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "late-client" }
      });
      connectClient("late-client", [sessionUri]);
      await new Promise((r) => setTimeout(r, 30001));
      const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
    });
  });
  test("a later orphaned tool call does not extend an earlier one past the grace window", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      stateManager.createSession(makeSessionSummary());
      stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const transport = connectClient("disconnected-client", [sessionUri]);
      transport.simulateClose();
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run it", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "disconnected-client" }
      });
      await new Promise((r) => setTimeout(r, 2e4));
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-2",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "disconnected-client" }
      });
      await new Promise((r) => setTimeout(r, 11e3));
      const parts = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts ?? [];
      const statuses = parts.filter((p) => p.kind === ResponsePartKind.ToolCall).map((p) => p.kind === ResponsePartKind.ToolCall ? p.toolCall.status : void 0);
      assert.deepStrictEqual(statuses, [ToolCallStatus.Completed, ToolCallStatus.Completed]);
    });
  });
  test("unsubscribe removes the active client and fails its owned tool calls", () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    stateManager.dispatchServerAction(sessionUri, {
      type: ActionType.SessionActiveClientSet,
      activeClient: {
        clientId: "client-tools",
        tools: [{ name: "runTask", description: "Runs a task" }]
      }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "run it", origin: { kind: MessageKind.User } }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatToolCallStart,
      turnId: "turn-1",
      toolCallId: "tool-1",
      toolName: "runTask",
      displayName: "Run Task",
      contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tool-1",
      invocationMessage: "Run Task",
      toolInput: "{}",
      confirmed: ToolCallConfirmationReason.NotNeeded
    });
    const transport = connectClient("client-tools", [sessionUri]);
    transport.simulateMessage(notification("unsubscribe", { channel: sessionUri }));
    assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients, []);
    const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
    assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
      status: part.toolCall.status,
      success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0,
      error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : void 0
    } : void 0, {
      status: ToolCallStatus.Completed,
      success: false,
      error: "Client client-tools disconnected before completing Run Task"
    });
    transport.simulateClose();
  });
  test("reconnect without resubscription removes the active client and fails its owned tool calls", async () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transport1 = connectClient("client-tools", [sessionUri]);
    const initSeq = findResponse(transport1.sent, 1).result.serverSeq;
    stateManager.dispatchServerAction(sessionUri, {
      type: ActionType.SessionActiveClientSet,
      activeClient: {
        clientId: "client-tools",
        tools: [{ name: "runTask", description: "Runs a task" }]
      }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "run it", origin: { kind: MessageKind.User } }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatToolCallStart,
      turnId: "turn-1",
      toolCallId: "tool-1",
      toolName: "runTask",
      displayName: "Run Task",
      contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tool-1",
      invocationMessage: "Run Task",
      toolInput: "{}",
      confirmed: ToolCallConfirmationReason.NotNeeded
    });
    transport1.simulateClose();
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-tools",
      lastSeenServerSeq: initSeq,
      subscriptions: []
    }));
    await reconnectRespPromise;
    assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients, []);
    const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
    assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
      status: part.toolCall.status,
      success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : void 0,
      error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : void 0
    } : void 0, {
      status: ToolCallStatus.Completed,
      success: false,
      error: "Client client-tools disconnected before completing Run Task"
    });
    transport2.simulateClose();
  });
  test("reconnect with resubscription keeps the active client and its owned tool calls", async () => {
    stateManager.createSession(makeSessionSummary());
    stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const transport1 = connectClient("client-tools", [sessionUri]);
    const initSeq = findResponse(transport1.sent, 1).result.serverSeq;
    stateManager.dispatchServerAction(sessionUri, {
      type: ActionType.SessionActiveClientSet,
      activeClient: {
        clientId: "client-tools",
        tools: [{ name: "runTask", description: "Runs a task" }]
      }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "run it", origin: { kind: MessageKind.User } }
    });
    stateManager.dispatchServerAction(defaultChatUri, {
      type: ActionType.ChatToolCallStart,
      turnId: "turn-1",
      toolCallId: "tool-1",
      toolName: "runTask",
      displayName: "Run Task",
      contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" }
    });
    transport1.simulateClose();
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    const reconnectRespPromise = waitForResponse(transport2, 1);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-tools",
      lastSeenServerSeq: initSeq,
      subscriptions: [sessionUri]
    }));
    await reconnectRespPromise;
    assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients.map((c) => c.clientId), ["client-tools"]);
    const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
    assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0, ToolCallStatus.Streaming);
    transport2.simulateClose();
  });
  test("handshake includes defaultDirectory from side effects", () => {
    const transport = connectClient("client-home");
    const resp = findResponse(transport.sent, 1);
    assert.ok(resp);
    const result = resp.result;
    assert.strictEqual(URI.parse(result.defaultDirectory).path, "/home/testuser");
  });
  test("resourceList routes to side effect handler", async () => {
    const transport = connectClient("client-browse");
    transport.sent.length = 0;
    const dirUri = URI.file("/home/user/project").toString();
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "resourceList", { uri: dirUri }));
    const resp = await responsePromise;
    assert.strictEqual(agentService.browsedUris.length, 1);
    assert.strictEqual(agentService.browsedUris[0].path, "/home/user/project");
    assert.ok(resp);
    const result = resp.result;
    assert.strictEqual(result.entries.length, 2);
    assert.strictEqual(result.entries[0].name, "src");
    assert.strictEqual(result.entries[0].type, "directory");
    assert.strictEqual(result.entries[1].name, "README.md");
    assert.strictEqual(result.entries[1].type, "file");
  });
  test("resourceList returns a JSON-RPC error when the target is invalid", async () => {
    const transport = connectClient("client-browse-error");
    transport.sent.length = 0;
    const dirUri = URI.file("/missing").toString();
    agentService.browseErrors.set(URI.file("/missing").toString(), new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Directory not found: ${dirUri}`));
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "resourceList", { uri: dirUri }));
    const resp = await responsePromise;
    assert.ok(resp?.error);
    assert.strictEqual(resp.error.code, JSON_RPC_INTERNAL_ERROR);
    assert.match(resp.error.message, /Directory not found/);
  });
  test("resourceRead does not log missing file reads", async () => {
    const transport = connectClient("client-read-missing-file");
    transport.sent.length = 0;
    const fileUri = URI.file("/missing").toString();
    agentService.readErrors.set(fileUri, new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${fileUri}`));
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "resourceRead", { uri: fileUri }));
    const resp = await responsePromise;
    assert.deepStrictEqual({
      errorCode: resp.error?.code,
      errorCount: logService.errorCount
    }, {
      errorCode: AhpErrorCodes.NotFound,
      errorCount: 0
    });
  });
  test("resourceRead logs missing non-file reads", async () => {
    const transport = connectClient("client-read-missing-session-db");
    transport.sent.length = 0;
    const resource = "session-db:/missing";
    agentService.readErrors.set(resource, new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${resource}`));
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "resourceRead", { uri: resource }));
    const resp = await responsePromise;
    assert.deepStrictEqual({
      errorCode: resp.error?.code,
      errorCount: logService.errorCount
    }, {
      errorCode: AhpErrorCodes.NotFound,
      errorCount: 1
    });
  });
  test("authenticate returns result via typed request", async () => {
    const transport = connectClient("client-auth");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "authenticate", { resource: "https://api.github.com", token: "test-token" }));
    const resp = await responsePromise;
    assert.ok(!resp.error, `unexpected error: ${resp.error?.message}`);
    assert.deepStrictEqual(resp.result, {});
  });
  test("getManagedSettingsDiagnostics returns provider SDK snapshots", async () => {
    agentService.managedSettingsDiagnostics = [{
      provider: "copilot",
      snapshot: {
        source: "device",
        serverManaged: false,
        deviceManaged: true,
        failClosed: false,
        bypassPermissionsDisabled: false,
        managedKeys: ["permissions"],
        settings: { permissions: { allow: ["Shell(echo *)"] } }
      }
    }];
    const transport = connectClient("client-managed-settings");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "getManagedSettingsDiagnostics"));
    const response = await responsePromise;
    assert.ok(!response.error, `unexpected error: ${response.error?.message}`);
    assert.deepStrictEqual(response.result, agentService.managedSettingsDiagnostics);
  });
  test("setClientManagedSettingsPermissions validates and attributes contributions to the connected client", async () => {
    const transport = connectClient("client-managed-settings-contribution");
    transport.sent.length = 0;
    transport.simulateMessage(notification("setClientManagedSettingsPermissions", {
      permissions: { disableBypassPermissionsMode: "disable", ask: ["Shell"] }
    }));
    transport.simulateMessage(notification("setClientManagedSettingsPermissions", {
      permissions: { allow: ["Shell"] }
    }));
    await Promise.resolve();
    assert.deepStrictEqual(managedSettingsService.permissions, {
      disableBypassPermissionsMode: "disable",
      ask: ["Shell"]
    });
  });
  test("scopes managed settings contributions to each protocol handler", () => {
    const firstTransport = connectClient("shared-client-id");
    firstTransport.simulateMessage(notification("setClientManagedSettingsPermissions", {
      permissions: { ask: ["Shell"] }
    }));
    const localDisposables = disposables.add(new DisposableStore());
    const secondServer = localDisposables.add(new MockProtocolServer());
    const secondHandler = localDisposables.add(new ProtocolServerHandler(
      agentService,
      stateManager,
      secondServer,
      { defaultDirectory: URI.file("/home/testuser").toString() },
      localDisposables.add(new AgentHostFileSystemProvider()),
      logService,
      NullTelemetryService,
      managedSettingsService
    ));
    const secondTransport = new MockProtocolTransport();
    secondServer.simulateConnection(secondTransport);
    secondTransport.simulateMessage(request(1, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId: "shared-client-id"
    }));
    secondTransport.simulateMessage(notification("setClientManagedSettingsPermissions", {
      permissions: { disableBypassPermissionsMode: "disable" }
    }));
    assert.deepStrictEqual(managedSettingsService.permissions, {
      disableBypassPermissionsMode: "disable",
      ask: ["Shell"]
    });
    secondTransport.simulateClose();
    secondHandler.dispose();
    assert.deepStrictEqual(managedSettingsService.permissions, { ask: ["Shell"] });
  });
  test("removes managed settings contributions for active and grace clients on dispose", () => {
    const activeTransport = connectClient("client-managed-settings-active");
    activeTransport.simulateMessage(notification("setClientManagedSettingsPermissions", {
      permissions: { ask: ["Shell"] }
    }));
    const graceTransport = connectClient("client-managed-settings-grace");
    graceTransport.simulateMessage(notification("setClientManagedSettingsPermissions", {
      permissions: { disableBypassPermissionsMode: "disable" }
    }));
    graceTransport.simulateClose();
    assert.deepStrictEqual(managedSettingsService.permissions, {
      disableBypassPermissionsMode: "disable",
      ask: ["Shell"]
    });
    handler.dispose();
    assert.deepStrictEqual(managedSettingsService.permissions, {});
  });
  test("removes a managed settings contribution after disconnect grace expires", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const transport = connectClient("client-managed-settings-disconnect");
      transport.simulateMessage(notification("setClientManagedSettingsPermissions", {
        permissions: { ask: ["Shell"] }
      }));
      transport.simulateClose();
      await new Promise((resolve) => setTimeout(resolve, 30001));
      assert.deepStrictEqual(managedSettingsService.permissions, {});
    });
  });
  test("extension request preserves ProtocolError code and data", async () => {
    const origHandler = agentService.authenticate;
    agentService.authenticate = async () => {
      throw new ProtocolError(-32007, "Auth required", { hint: "sign in" });
    };
    const transport = connectClient("client-auth-error");
    transport.sent.length = 0;
    const responsePromise = waitForResponse(transport, 2);
    transport.simulateMessage(request(2, "authenticate", { resource: "test", token: "bad" }));
    const resp = await responsePromise;
    assert.ok(resp?.error);
    assert.strictEqual(resp.error.code, -32007);
    assert.strictEqual(resp.error.message, "Auth required");
    assert.deepStrictEqual(resp.error.data, { hint: "sign in" });
    agentService.authenticate = origHandler;
  });
  test("onDidChangeConnectionCount fires on connect and disconnect", () => {
    const counts = [];
    disposables.add(handler.onDidChangeConnectionCount((c) => counts.push(c)));
    const transport = connectClient("client-count-1");
    connectClient("client-count-2");
    transport.simulateClose();
    assert.deepStrictEqual(counts, [1, 2, 1]);
  });
  test("shares connection count across MessagePort and external listeners", async () => {
    const localDisposables = disposables.add(new DisposableStore());
    const messagePortServer = new MessagePortProtocolServer();
    const socketServer = new MockProtocolServer();
    const combinedServer = localDisposables.add(new CompositeProtocolServer([messagePortServer, socketServer]));
    const combinedHandler = localDisposables.add(new ProtocolServerHandler(
      agentService,
      stateManager,
      combinedServer,
      { defaultDirectory: URI.file("/home/testuser").toString() },
      localDisposables.add(new AgentHostFileSystemProvider()),
      logService,
      NullTelemetryService,
      managedSettingsService
    ));
    const counts = [];
    localDisposables.add(combinedHandler.onDidChangeConnectionCount((count) => counts.push(count)));
    await messagePortServer.call("message-port-client", "connect");
    await messagePortServer.call("message-port-client", "send", JSON.stringify(request(1, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId: "message-port-client"
    })));
    const socketTransport = new MockProtocolTransport();
    socketServer.simulateConnection(socketTransport);
    socketTransport.simulateMessage(request(2, "initialize", {
      protocolVersions: [PROTOCOL_VERSION],
      clientId: "socket-client"
    }));
    messagePortServer.closeClient("message-port-client");
    socketTransport.simulateClose();
    assert.deepStrictEqual(counts, [1, 2, 1, 0]);
  });
  test("onDidChangeConnectionCount is not decremented by stale reconnect close", () => {
    const counts = [];
    disposables.add(handler.onDidChangeConnectionCount((c) => counts.push(c)));
    const transport1 = connectClient("client-rc");
    assert.deepStrictEqual(counts, [1]);
    const transport2 = new MockProtocolTransport();
    server.simulateConnection(transport2);
    transport2.simulateMessage(request(1, "reconnect", {
      clientId: "client-rc",
      lastSeenServerSeq: 0,
      subscriptions: []
    }));
    assert.deepStrictEqual(counts, [1, 1]);
    transport1.simulateClose();
    assert.deepStrictEqual(counts, [1, 1]);
    transport2.simulateClose();
    assert.deepStrictEqual(counts, [1, 1, 0]);
  });
  suite("createSession activeClient", () => {
    test("forwards activeClient to the agent service", async () => {
      const newSession = URI.parse("copilot:///eager-session").toString();
      const transport = connectClient("client-1");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createSession", {
        session: newSession,
        provider: "copilot",
        activeClient: {
          clientId: "client-1",
          tools: [{ name: "t1", description: "d", inputSchema: { type: "object" } }],
          customizations: [{ uri: "file:///plugin-a", displayName: "A" }]
        }
      }));
      const resp = await responsePromise;
      assert.strictEqual(resp.error, void 0, "createSession should succeed");
      const config = agentService.createSessionConfigs.at(-1);
      assert.deepStrictEqual({
        clientId: config?.activeClient?.clientId,
        toolName: config?.activeClient?.tools[0]?.name,
        customizationUri: config?.activeClient?.customizations?.[0].uri
      }, {
        clientId: "client-1",
        toolName: "t1",
        customizationUri: "file:///plugin-a"
      });
    });
    test("rejects createSession when activeClient.clientId mismatches", async () => {
      const newSession = URI.parse("copilot:///mismatch-session").toString();
      const transport = connectClient("client-1");
      transport.sent.length = 0;
      const responsePromise = waitForResponse(transport, 2);
      transport.simulateMessage(request(2, "createSession", {
        session: newSession,
        provider: "copilot",
        activeClient: {
          clientId: "other-client",
          tools: []
        }
      }));
      const resp = await responsePromise;
      assert.ok(resp.error, "response should be an error");
      assert.strictEqual(resp.result, void 0);
      assert.strictEqual(agentService.createSessionConfigs.length, 0, "agent service should not have been called");
    });
  });
  suite("OTLP logs channel", () => {
    let otlpEmitter;
    let otlpStateManager;
    let otlpServer;
    let otlpAgentService;
    let localDisposables;
    setup(() => {
      localDisposables = new DisposableStore();
      otlpEmitter = localDisposables.add(new OtlpLogEmitter());
      otlpStateManager = localDisposables.add(new AgentHostStateManager(new NullLogService()));
      otlpServer = localDisposables.add(new MockProtocolServer());
      otlpAgentService = new MockAgentService();
      otlpAgentService.setStateManager(otlpStateManager);
      localDisposables.add(otlpAgentService);
      localDisposables.add(new ProtocolServerHandler(
        otlpAgentService,
        otlpStateManager,
        otlpServer,
        { defaultDirectory: URI.file("/home/testuser").toString(), otlpLogEmitter: otlpEmitter },
        localDisposables.add(new AgentHostFileSystemProvider()),
        new NullLogService(),
        NullTelemetryService,
        managedSettingsService
      ));
    });
    teardown(() => {
      localDisposables.dispose();
    });
    function connectOtlpClient(clientId, initialSubscriptions) {
      const transport = new MockProtocolTransport();
      otlpServer.simulateConnection(transport);
      transport.simulateMessage(request(1, "initialize", {
        protocolVersions: [PROTOCOL_VERSION],
        clientId,
        initialSubscriptions
      }));
      return transport;
    }
    function findOtlpLogs(sent) {
      return sent.filter(isJsonRpcNotification).filter((m) => m.method === "otlp/exportLogs").map((m) => ({ channel: m.params.channel, payload: m.params.payload }));
    }
    test("handshake advertises the logs channel template", () => {
      const transport = connectOtlpClient("client-otlp-1");
      const resp = findResponse(transport.sent, 1);
      assert.deepStrictEqual(resp.result.telemetry, { logs: "ahp-otlp://logs/{level}" });
    });
    test("subscribe to logs channel returns an empty stateless result and starts forwarding records at-or-above the requested level", async () => {
      const transport = connectOtlpClient("client-otlp-2");
      transport.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/warn" }));
      const resp = await waitForResponse(transport, 2);
      assert.deepStrictEqual(resp.result, {});
      otlpEmitter.emit({ timeUnixNano: "1000", severityNumber: 9, severityText: "info", body: "info-msg" });
      otlpEmitter.emit({ timeUnixNano: "1001", severityNumber: 13, severityText: "warn", body: "warn-msg" });
      otlpEmitter.emit({ timeUnixNano: "1002", severityNumber: 17, severityText: "error", body: "error-msg" });
      const logs = findOtlpLogs(transport.sent);
      const bodies = logs.flatMap(({ payload }) => [...iterateOtlpLogRecords(payload)].map((r) => r.body));
      assert.deepStrictEqual(bodies, ["warn-msg", "error-msg"]);
      for (const { channel } of logs) {
        assert.strictEqual(channel, "ahp-otlp://logs/warn");
      }
    });
    test("unsubscribe stops forwarding without affecting other subscribers", async () => {
      const a = connectOtlpClient("client-otlp-a");
      const b = connectOtlpClient("client-otlp-b");
      const aSubscribed = waitForResponse(a, 2);
      const bSubscribed = waitForResponse(b, 2);
      a.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/trace" }));
      b.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/trace" }));
      await aSubscribed;
      await bSubscribed;
      otlpEmitter.emit({ timeUnixNano: "1", severityNumber: 9, severityText: "info", body: "first" });
      a.simulateMessage(notification("unsubscribe", { channel: "ahp-otlp://logs/trace" }));
      otlpEmitter.emit({ timeUnixNano: "2", severityNumber: 9, severityText: "info", body: "second" });
      const aBodies = findOtlpLogs(a.sent).flatMap(({ payload }) => [...iterateOtlpLogRecords(payload)].map((r) => r.body));
      const bBodies = findOtlpLogs(b.sent).flatMap(({ payload }) => [...iterateOtlpLogRecords(payload)].map((r) => r.body));
      assert.deepStrictEqual({ a: aBodies, b: bBodies }, { a: ["first"], b: ["first", "second"] });
    });
    test("multiple subscriptions to different levels each receive their own band", async () => {
      const transport = connectOtlpClient("client-otlp-multi");
      const subscribed2 = waitForResponse(transport, 2);
      const subscribed3 = waitForResponse(transport, 3);
      transport.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/info" }));
      transport.simulateMessage(request(3, "subscribe", { channel: "ahp-otlp://logs/error" }));
      await subscribed2;
      await subscribed3;
      otlpEmitter.emit({ timeUnixNano: "1", severityNumber: 9, severityText: "info", body: "info-only" });
      otlpEmitter.emit({ timeUnixNano: "2", severityNumber: 17, severityText: "error", body: "both" });
      const byChannel = /* @__PURE__ */ new Map();
      for (const { channel, payload } of findOtlpLogs(transport.sent)) {
        const bodies = [...iterateOtlpLogRecords(payload)].map((r) => r.body);
        byChannel.set(channel, [...byChannel.get(channel) ?? [], ...bodies]);
      }
      assert.deepStrictEqual(Object.fromEntries(byChannel), {
        "ahp-otlp://logs/info": ["info-only", "both"],
        "ahp-otlp://logs/error": ["both"]
      });
    });
    test("client disconnect drops its OTLP subscriptions", async () => {
      const transport = connectOtlpClient("client-otlp-disconnect");
      transport.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/trace" }));
      await waitForResponse(transport, 2);
      transport.simulateClose();
      otlpEmitter.emit({ timeUnixNano: "1", severityNumber: 9, severityText: "info", body: "after-close" });
      const logs = findOtlpLogs(transport.sent);
      assert.deepStrictEqual(logs, []);
    });
    test("unrecognised ahp-otlp URIs do not crash subscribe", async () => {
      const transport = connectOtlpClient("client-otlp-bad");
      transport.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/verbose" }));
      const resp = await waitForResponse(transport, 2);
      assert.deepStrictEqual(resp.result, {}, "unknown level should be acknowledged as stateless");
      otlpEmitter.emit({ timeUnixNano: "1", severityNumber: 9, severityText: "info", body: "whatever" });
      assert.deepStrictEqual(findOtlpLogs(transport.sent), [], "no records should leak to an invalid level");
    });
    test("URI variants that parse to the same level collapse to one canonical subscription", async () => {
      const transport = connectOtlpClient("client-otlp-canonical");
      const r2 = waitForResponse(transport, 2);
      const r3 = waitForResponse(transport, 3);
      const r4 = waitForResponse(transport, 4);
      transport.simulateMessage(request(2, "subscribe", { channel: "ahp-otlp://logs/info" }));
      transport.simulateMessage(request(3, "subscribe", { channel: "ahp-otlp://logs/info?dup=1" }));
      transport.simulateMessage(request(4, "subscribe", { channel: "ahp-otlp://logs/info#frag" }));
      await r2;
      await r3;
      await r4;
      otlpEmitter.emit({ timeUnixNano: "1", severityNumber: 9, severityText: "info", body: "once" });
      const logs = findOtlpLogs(transport.sent);
      assert.strictEqual(logs.length, 1, "one record should produce exactly one notification");
      assert.strictEqual(logs[0].channel, "ahp-otlp://logs/info", "channel should be canonicalised");
      transport.simulateMessage(notification("unsubscribe", { channel: "ahp-otlp://logs/info?dup=1" }));
      otlpEmitter.emit({ timeUnixNano: "2", severityNumber: 9, severityText: "info", body: "after-unsub" });
      assert.strictEqual(findOtlpLogs(transport.sent).length, 1, "no further notifications after unsubscribe");
    });
  });
  suite("download progress channel", () => {
    let dlStateManager;
    let dlServer;
    let dlAgentService;
    let localDisposables;
    setup(() => {
      localDisposables = new DisposableStore();
      dlStateManager = localDisposables.add(new AgentHostStateManager(new NullLogService()));
      dlServer = localDisposables.add(new MockProtocolServer());
      dlAgentService = new MockAgentService();
      dlAgentService.setStateManager(dlStateManager);
      localDisposables.add(dlAgentService);
      localDisposables.add(new ProtocolServerHandler(
        dlAgentService,
        dlStateManager,
        dlServer,
        { defaultDirectory: URI.file("/home/testuser").toString() },
        localDisposables.add(new AgentHostFileSystemProvider()),
        new NullLogService(),
        NullTelemetryService,
        managedSettingsService
      ));
    });
    teardown(() => {
      localDisposables.dispose();
    });
    function connectDownloadClient(clientId) {
      const transport = new MockProtocolTransport();
      dlServer.simulateConnection(transport);
      transport.simulateMessage(request(1, "initialize", {
        protocolVersions: [PROTOCOL_VERSION],
        clientId
      }));
      return transport;
    }
    function findProgress(sent) {
      return sent.filter(isJsonRpcNotification).filter((m) => m.method === "root/progress").map((m) => m.params);
    }
    test("forwards each progress frame to connected clients on the root channel", () => {
      const transport = connectDownloadClient("client-dl-1");
      dlStateManager.emitProgress({ progressToken: "t1", progress: 0, total: 1e3, message: "Claude" });
      dlStateManager.emitProgress({ progressToken: "t1", progress: 500, total: 1e3, message: "Claude" });
      dlStateManager.emitProgress({ progressToken: "t1", progress: 1e3, total: 1e3, message: "Claude" });
      const frames = findProgress(transport.sent);
      assert.deepStrictEqual(frames.map((f) => f.progress), [0, 500, 1e3]);
      assert.ok(frames.every((f) => f.progressToken === "t1" && f.message === "Claude" && f.total === 1e3));
      assert.ok(frames.every((f) => f.channel === "ahp-root://"), "frames are broadcast on the root channel");
    });
  });
  suite("resource watches", () => {
    test("subscribe to a resource-watch channel returns the descriptor + bumps refcount; envelopes are routed", async () => {
      const watchChannel = "ahp-resource-watch:/mock-watch";
      const descriptor = { root: "file:///workspace", recursive: false };
      agentService.liveWatchDescriptors.set(watchChannel, descriptor);
      const transport = connectClient("client-watch");
      transport.sent.length = 0;
      const subPromise = waitForResponse(transport, 101);
      transport.simulateMessage(request(101, "subscribe", { channel: watchChannel }));
      const resp = await subPromise;
      const result = resp.result;
      assert.strictEqual(result.snapshot.resource, watchChannel);
      assert.deepStrictEqual(result.snapshot.state, descriptor);
      assert.deepStrictEqual(agentService.watchSubscribeCalls, [watchChannel]);
      transport.sent.length = 0;
      stateManager.dispatchServerAction(watchChannel, {
        type: ActionType.ResourceWatchChanged,
        changes: { items: [{ uri: "file:///workspace/a.txt", type: "updated" }] }
      });
      const actionMsgs = findNotifications(transport.sent, "action");
      assert.strictEqual(actionMsgs.length, 1, "subscriber should receive the change envelope");
      const env = actionMsgs[0].params;
      assert.strictEqual(env.channel, watchChannel);
      assert.strictEqual(env.action.type, ActionType.ResourceWatchChanged);
      transport.simulateMessage(notification("unsubscribe", { channel: watchChannel }));
      assert.deepStrictEqual(agentService.watchUnsubscribeCalls, [watchChannel]);
    });
    test("subscribe to an unknown resource-watch channel surfaces a JSON-RPC error", async () => {
      const transport = connectClient("client-watch-bad");
      transport.sent.length = 0;
      const respPromise = waitForResponse(transport, 102);
      transport.simulateMessage(request(102, "subscribe", { channel: "ahp-resource-watch:/bogus" }));
      const resp = await respPromise;
      const error = resp.error;
      assert.ok(error, `expected an error response, got ${JSON.stringify(resp)}`);
    });
    test("client disconnect releases the watch refcount", async () => {
      const watchChannel = "ahp-resource-watch:/mock-watch-disconnect";
      agentService.liveWatchDescriptors.set(watchChannel, { root: "file:///root", recursive: false });
      const transport = connectClient("client-watch-2");
      const subPromise = waitForResponse(transport, 200);
      transport.simulateMessage(request(200, "subscribe", { channel: watchChannel }));
      await subPromise;
      assert.deepStrictEqual(agentService.watchSubscribeCalls, [watchChannel]);
      transport.simulateClose();
      assert.deepStrictEqual(agentService.watchUnsubscribeCalls, [watchChannel]);
    });
    test("overlapping transports release each resource-watch subscription", async () => {
      const watchChannel = "ahp-resource-watch:/mock-watch-overlap";
      agentService.liveWatchDescriptors.set(watchChannel, { root: "file:///root", recursive: false });
      const transport1 = connectClient("client-watch-overlap");
      const subPromise1 = waitForResponse(transport1, 200);
      transport1.simulateMessage(request(200, "subscribe", { channel: watchChannel }));
      await subPromise1;
      const transport2 = connectClient("client-watch-overlap");
      const subPromise2 = waitForResponse(transport2, 201);
      transport2.simulateMessage(request(201, "subscribe", { channel: watchChannel }));
      await subPromise2;
      transport2.simulateClose();
      transport1.simulateClose();
      assert.deepStrictEqual({
        subscribes: agentService.watchSubscribeCalls,
        unsubscribes: agentService.watchUnsubscribeCalls
      }, {
        subscribes: [watchChannel, watchChannel],
        unsubscribes: [watchChannel, watchChannel]
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxwcm90b2NvbFNlcnZlckhhbmRsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEZpbGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyB0eXBlIElBZ2VudENyZWF0ZUNoYXRPcHRpb25zLCB0eXBlIElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIHR5cGUgSUFnZW50UmVzb2x2ZVNlc3Npb25Db25maWdQYXJhbXMsIHR5cGUgSUFnZW50U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUGFyYW1zLCB0eXBlIElBZ2VudFNlc3Npb25NZXRhZGF0YSwgdHlwZSBBdXRoZW50aWNhdGVQYXJhbXMsIHR5cGUgQXV0aGVudGljYXRlUmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IHR5cGUgSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzLCB0eXBlIElBZ2VudEhvc3ROZXR3b3JrRGlhZ25vc3RpY3NJbmZvLCB0eXBlIElBZ2VudEhvc3ROZXR3b3JrRmV0Y2hSZXN1bHQsIHR5cGUgSUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFNvdXJjZUtpbmQsIENvbXBsZXRpb25zUGFyYW1zLCBDb21wbGV0aW9uc1Jlc3VsdCwgQ29udGVudEVuY29kaW5nLCBMaXN0U2Vzc2lvbnNSZXN1bHQsIFJlc291cmNlUmVhZFJlc3VsdCwgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQsIFNlc3Npb25Db25maWdDb21wbGV0aW9uc1Jlc3VsdCwgUmVzb3VyY2VNa2RpclBhcmFtcywgUmVzb3VyY2VNa2RpclJlc3VsdCwgUmVzb3VyY2VSZXNvbHZlUGFyYW1zLCBSZXNvdXJjZVJlc29sdmVSZXN1bHQsIFJlc291cmNlQ29weVBhcmFtcywgUmVzb3VyY2VDb3B5UmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB0eXBlIHsgSW1wbGVtZW50YXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQWN0aW9uRW52ZWxvcGUsIHR5cGUgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCB0eXBlIFNlc3Npb25BY3Rpb24sIHR5cGUgVGVybWluYWxBY3Rpb24sIHR5cGUgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24sIHR5cGUgUHJvZ3Jlc3NQYXJhbXMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGlzSnNvblJwY05vdGlmaWNhdGlvbiwgaXNKc29uUnBjUmVxdWVzdCwgaXNKc29uUnBjUmVzcG9uc2UsIEpTT05fUlBDX0lOVEVSTkFMX0VSUk9SLCBKc29uUnBjRXJyb3JDb2RlcywgUHJvdG9jb2xFcnJvciwgQWhwRXJyb3JDb2RlcywgQUhQX1VOU1VQUE9SVEVEX1BST1RPQ09MX1ZFUlNJT04sIEFIUF9TRVNTSU9OX05PVF9GT1VORCwgdHlwZSBBaHBOb3RpZmljYXRpb24sIHR5cGUgSW5pdGlhbGl6ZVJlc3VsdCwgdHlwZSBQcm90b2NvbE1lc3NhZ2UsIHR5cGUgUmVjb25uZWN0UmVzdWx0LCB0eXBlIFJlc291cmNlTGlzdFJlc3VsdCwgdHlwZSBSZXNvdXJjZVdyaXRlUGFyYW1zLCB0eXBlIFJlc291cmNlV3JpdGVSZXN1bHQsIHR5cGUgSVN0YXRlU25hcHNob3QgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBTZXNzaW9uU3RhdHVzLCBDaGFuZ2VzZXRTdGF0dXMsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZCwgVG9vbENhbGxTdGF0dXMsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgYnVpbGRDaGF0VXJpLCBidWlsZERlZmF1bHRDaGF0VXJpLCByZWFkU2Vzc2lvbkV4dGVybmFsLCByZWFkU2Vzc2lvbldvcmtzcGFjZWxlc3MsIHdpdGhTZXNzaW9uRXh0ZXJuYWwsIHdpdGhTZXNzaW9uV29ya3NwYWNlbGVzcywgdHlwZSBTZXNzaW9uU3VtbWFyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBTZXNzaW9uQWRkZWRQYXJhbXMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvbm90aWZpY2F0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IElQcm90b2NvbFNlcnZlciwgSVByb3RvY29sVHJhbnNwb3J0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25UcmFuc3BvcnQuanMnO1xuaW1wb3J0IHsgUHJvdG9jb2xTZXJ2ZXJIYW5kbGVyIH0gZnJvbSAnLi4vLi4vbm9kZS9wcm90b2NvbFNlcnZlckhhbmRsZXIuanMnO1xuaW1wb3J0IHsgQ29tcG9zaXRlUHJvdG9jb2xTZXJ2ZXIgfSBmcm9tICcuLi8uLi9ub2RlL2NvbXBvc2l0ZVByb3RvY29sU2VydmVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlciwgYWdlbnRIb3N0VXJpLCB0eXBlIElSZW1vdGVGaWxlc3lzdGVtQ29ubmVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgYWdlbnRzV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbywgZWRpdG9yV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbywgQWdlbnRIb3N0Q2xpZW50VHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kLCBBZ2VudEhvc3RMYXVuY2hLaW5kLCBBZ2VudEhvc3RUcmFuc3BvcnRLaW5kLCB0eXBlIElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBpdGVyYXRlT3RscExvZ1JlY29yZHMsIE90bHBMb2dFbWl0dGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL290bHAvb3RscExvZ0VtaXR0ZXIuanMnO1xuaW1wb3J0IHsgTWVzc2FnZVBvcnRQcm90b2NvbFNlcnZlciB9IGZyb20gJy4uLy4uL25vZGUvbWVzc2FnZVBvcnRQcm90b2NvbFNlcnZlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uVGVsZW1ldHJ5VHJhY2tlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvblRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLmpzJztcblxuLy8gLS0tLSBNb2NrIGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgTW9ja1Byb3RvY29sVHJhbnNwb3J0IGltcGxlbWVudHMgSVByb3RvY29sVHJhbnNwb3J0IHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgdHJhbnNwb3J0S2luZCA9IEFnZW50SG9zdFRyYW5zcG9ydEtpbmQuVW5rbm93bikgeyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25NZXNzYWdlID0gbmV3IEVtaXR0ZXI8UHJvdG9jb2xNZXNzYWdlPigpO1xuXHRyZWFkb25seSBvbk1lc3NhZ2UgPSB0aGlzLl9vbk1lc3NhZ2UuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2VuZCA9IG5ldyBFbWl0dGVyPFByb3RvY29sTWVzc2FnZT4oKTtcblx0cmVhZG9ubHkgb25EaWRTZW5kID0gdGhpcy5fb25EaWRTZW5kLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNsb3NlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25DbG9zZSA9IHRoaXMuX29uQ2xvc2UuZXZlbnQ7XG5cblx0cmVhZG9ubHkgc2VudDogUHJvdG9jb2xNZXNzYWdlW10gPSBbXTtcblxuXHRzZW5kKG1lc3NhZ2U6IFByb3RvY29sTWVzc2FnZSk6IHZvaWQge1xuXHRcdHRoaXMuc2VudC5wdXNoKG1lc3NhZ2UpO1xuXHRcdHRoaXMuX29uRGlkU2VuZC5maXJlKG1lc3NhZ2UpO1xuXHR9XG5cblx0c2ltdWxhdGVNZXNzYWdlKG1zZzogUHJvdG9jb2xNZXNzYWdlKTogdm9pZCB7XG5cdFx0dGhpcy5fb25NZXNzYWdlLmZpcmUobXNnKTtcblx0fVxuXG5cdHNpbXVsYXRlQ2xvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25DbG9zZS5maXJlKCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uTWVzc2FnZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRTZW5kLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkNsb3NlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBNb2NrUHJvdG9jb2xTZXJ2ZXIgaW1wbGVtZW50cyBJUHJvdG9jb2xTZXJ2ZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbm5lY3Rpb24gPSBuZXcgRW1pdHRlcjxJUHJvdG9jb2xUcmFuc3BvcnQ+KCk7XG5cdHJlYWRvbmx5IG9uQ29ubmVjdGlvbiA9IHRoaXMuX29uQ29ubmVjdGlvbi5ldmVudDtcblx0cmVhZG9ubHkgYWRkcmVzcyA9ICdtb2NrOi8vdGVzdCc7XG5cblx0c2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydDogSVByb3RvY29sVHJhbnNwb3J0KTogdm9pZCB7XG5cdFx0dGhpcy5fb25Db25uZWN0aW9uLmZpcmUodHJhbnNwb3J0KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25Db25uZWN0aW9uLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBDb3VudGluZ0xvZ1NlcnZpY2UgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7XG5cdGVycm9yQ291bnQgPSAwO1xuXG5cdG92ZXJyaWRlIGVycm9yKF9tZXNzYWdlOiBzdHJpbmcsIC4uLl9hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLmVycm9yQ291bnQrKztcblx0fVxufVxuXG5jbGFzcyBGYWlsaW5nQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyIGV4dGVuZHMgQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0b3ZlcnJpZGUgcmVnaXN0ZXJBdXRob3JpdHkoX2F1dGhvcml0eTogc3RyaW5nLCBfY29ubmVjdGlvbjogSVJlbW90ZUZpbGVzeXN0ZW1Db25uZWN0aW9uKTogbmV2ZXIge1xuXHRcdHRocm93IG5ldyBFcnJvcigncmVnaXN0cmF0aW9uIGZhaWxlZCcpO1xuXHR9XG59XG5cbmNsYXNzIEZhaWxpbmdSZWNvbm5lY3RBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIgZXh0ZW5kcyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRwcml2YXRlIF9yZWdpc3RyYXRpb25Db3VudCA9IDA7XG5cblx0b3ZlcnJpZGUgcmVnaXN0ZXJBdXRob3JpdHkoYXV0aG9yaXR5OiBzdHJpbmcsIGNvbm5lY3Rpb246IElSZW1vdGVGaWxlc3lzdGVtQ29ubmVjdGlvbikge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbkNvdW50Kys7XG5cdFx0aWYgKHRoaXMuX3JlZ2lzdHJhdGlvbkNvdW50ID09PSAyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3JlZ2lzdHJhdGlvbiBmYWlsZWQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLnJlZ2lzdGVyQXV0aG9yaXR5KGF1dGhvcml0eSwgY29ubmVjdGlvbik7XG5cdH1cbn1cblxuY2xhc3MgVGVzdFRlbGVtZXRyeVNlcnZpY2UgZXh0ZW5kcyBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIHtcblx0cmVhZG9ubHkgZXZlbnRzOiB7IGV2ZW50TmFtZTogc3RyaW5nOyBkYXRhOiB1bmtub3duIH1bXSA9IFtdO1xuXG5cdG92ZXJyaWRlIHB1YmxpY0xvZzIoZXZlbnROYW1lPzogc3RyaW5nLCBkYXRhPzogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmIChldmVudE5hbWUpIHtcblx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIE1vY2tBZ2VudFNlcnZpY2UgaW1wbGVtZW50cyBJQWdlbnRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGhhbmRsZWRBY3Rpb25zOiAoU2Vzc2lvbkFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pW10gPSBbXTtcblx0cmVhZG9ubHkgaGFuZGxlZENsaWVudFR5cGVzOiAoQWdlbnRIb3N0Q2xpZW50VHlwZSB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRyZWFkb25seSBoYW5kbGVkQ2xpZW50Q29udGV4dHM6IChJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRyZWFkb25seSBicm93c2VkVXJpczogVVJJW10gPSBbXTtcblx0cmVhZG9ubHkgYnJvd3NlRXJyb3JzID0gbmV3IE1hcDxzdHJpbmcsIEVycm9yPigpO1xuXHRyZWFkb25seSByZWFkRXJyb3JzID0gbmV3IE1hcDxzdHJpbmcsIEVycm9yPigpO1xuXHRyZWFkb25seSBsaXN0ZWRTZXNzaW9uczogSUFnZW50U2Vzc2lvbk1ldGFkYXRhW10gPSBbXTtcblx0cmVhZG9ubHkgY3JlYXRlU2Vzc2lvbkNvbmZpZ3M6IChJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdG1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzOiByZWFkb25seSBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3NbXSA9IFtdO1xuXHRzaHV0ZG93bkNhbGxzID0gMDtcblx0Y3JlYXRlU2Vzc2lvbkJhcnJpZXI6IERlZmVycmVkUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0c3Vic2NyaWJlQmFycmllcjogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWN0aW9uID0gbmV3IEVtaXR0ZXI8aW1wb3J0KCcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnKS5BY3Rpb25FbnZlbG9wZT4oKTtcblx0cmVhZG9ubHkgb25EaWRBY3Rpb24gPSB0aGlzLl9vbkRpZEFjdGlvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWROb3RpZmljYXRpb24gPSBuZXcgRW1pdHRlcjxpbXBvcnQoJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcycpLklOb3RpZmljYXRpb24+KCk7XG5cdHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uID0gdGhpcy5fb25EaWROb3RpZmljYXRpb24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTWNwTm90aWZpY2F0aW9uID0gbmV3IEVtaXR0ZXI8aW1wb3J0KCcuLi8uLi9jb21tb24vYWdlbnQuanMnKS5JTWNwTm90aWZpY2F0aW9uPigpO1xuXHRyZWFkb25seSBvbk1jcE5vdGlmaWNhdGlvbiA9IHRoaXMuX29uTWNwTm90aWZpY2F0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgX3N0YXRlTWFuYWdlciE6IEFnZW50SG9zdFN0YXRlTWFuYWdlcjtcblxuXHQvKiogQ29ubmVjdCB0byB0aGUgc3RhdGUgbWFuYWdlciBzbyBkaXNwYXRjaEFjdGlvbiB3b3JrcyBjb3JyZWN0bHkuICovXG5cdHNldFN0YXRlTWFuYWdlcihzbTogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyID0gc207XG5cdH1cblxuXHRkaXNwYXRjaEFjdGlvbihjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24sIGNsaWVudElkOiBzdHJpbmcsIGNsaWVudFNlcTogbnVtYmVyLCBjbGllbnRDb250ZXh0PzogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQpOiB2b2lkIHtcblx0XHR0aGlzLmhhbmRsZWRBY3Rpb25zLnB1c2goYWN0aW9uKTtcblx0XHR0aGlzLmhhbmRsZWRDbGllbnRUeXBlcy5wdXNoKGNsaWVudENvbnRleHQ/LmNsaWVudFR5cGUpO1xuXHRcdHRoaXMuaGFuZGxlZENsaWVudENvbnRleHRzLnB1c2goY2xpZW50Q29udGV4dCk7XG5cdFx0Y29uc3Qgb3JpZ2luID0geyBjbGllbnRJZCwgY2xpZW50U2VxIH07XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGNoYW5uZWwsIGFjdGlvbiwgb3JpZ2luKTtcblx0fVxuXHRhc3luYyBjcmVhdGVTZXNzaW9uKGNvbmZpZz86IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcpOiBQcm9taXNlPFVSST4ge1xuXHRcdHRoaXMuY3JlYXRlU2Vzc2lvbkNvbmZpZ3MucHVzaChjb25maWcpO1xuXHRcdGF3YWl0IHRoaXMuY3JlYXRlU2Vzc2lvbkJhcnJpZXI/LnA7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNvbmZpZz8uc2Vzc2lvbiA/PyBVUkkucGFyc2UoJ2NvcGlsb3Q6Ly8vbmV3LXNlc3Npb24nKTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0cHJvdmlkZXI6IGNvbmZpZz8ucHJvdmlkZXIgPz8gJ2NvcGlsb3QnLFxuXHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdHByb2plY3Q6IHsgdXJpOiAnZmlsZTovLy9jcmVhdGVkLXByb2plY3QnLCBkaXNwbGF5TmFtZTogJ0NyZWF0ZWQgUHJvamVjdCcgfSxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogY29uZmlnPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSA/IFtjb25maWcud29ya2luZ0RpcmVjdG9yaWVzPy5bMF0udG9TdHJpbmcoKV0gOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHRhc3luYyByZXNvbHZlU2Vzc2lvbkNvbmZpZyhfcGFyYW1zOiBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtcyk6IFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+IHsgcmV0dXJuIHsgc2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LCB2YWx1ZXM6IHt9IH07IH1cblx0YXN5bmMgc2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKF9wYXJhbXM6IElBZ2VudFNlc3Npb25Db25maWdDb21wbGV0aW9uc1BhcmFtcyk6IFByb21pc2U8U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0PiB7IHJldHVybiB7IGl0ZW1zOiBbXSB9OyB9XG5cdGFzeW5jIGNvbXBsZXRpb25zKF9wYXJhbXM6IENvbXBsZXRpb25zUGFyYW1zKTogUHJvbWlzZTxDb21wbGV0aW9uc1Jlc3VsdD4geyByZXR1cm4geyBpdGVtczogW10gfTsgfVxuXHRhc3luYyBnZXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMoKTogUHJvbWlzZTxyZWFkb25seSBzdHJpbmdbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgZGlzcG9zZVNlc3Npb24oX3Nlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4geyB9XG5cdHJlYWRvbmx5IGNyZWF0ZWRDaGF0czogeyBzZXNzaW9uOiBzdHJpbmc7IGNoYXQ6IHN0cmluZzsgb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zIH1bXSA9IFtdO1xuXHRyZWFkb25seSBkaXNwb3NlZENoYXRzOiB7IHNlc3Npb246IHN0cmluZzsgY2hhdDogc3RyaW5nIH1bXSA9IFtdO1xuXHRhc3luYyBjcmVhdGVDaGF0KHNlc3Npb246IFVSSSwgY2hhdDogVVJJLCBvcHRpb25zPzogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNyZWF0ZWRDaGF0cy5wdXNoKHsgc2Vzc2lvbjogc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0OiBjaGF0LnRvU3RyaW5nKCksIC4uLihvcHRpb25zID8geyBvcHRpb25zIH0gOiB7fSkgfSk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0LnRvU3RyaW5nKCkpO1xuXHR9XG5cdGFzeW5jIGRpc3Bvc2VDaGF0KHNlc3Npb246IFVSSSwgY2hhdDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5kaXNwb3NlZENoYXRzLnB1c2goeyBzZXNzaW9uOiBzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQ6IGNoYXQudG9TdHJpbmcoKSB9KTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVtb3ZlQ2hhdChzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQudG9TdHJpbmcoKSk7XG5cdH1cblx0YXN5bmMgbGlzdFNlc3Npb25zKCk6IFByb21pc2U8SUFnZW50U2Vzc2lvbk1ldGFkYXRhW10+IHsgcmV0dXJuIHRoaXMubGlzdGVkU2Vzc2lvbnM7IH1cblx0YXN5bmMgc3Vic2NyaWJlKHJlc291cmNlOiBVUkksIF9jbGllbnRJZDogc3RyaW5nKTogUHJvbWlzZTxJU3RhdGVTbmFwc2hvdD4ge1xuXHRcdGF3YWl0IHRoaXMuc3Vic2NyaWJlQmFycmllcj8ucDtcblx0XHRjb25zdCBzbmFwc2hvdCA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRpZiAoIXNuYXBzaG90KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBzdWJzY3JpYmUgdG8gdW5rbm93biByZXNvdXJjZTogJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gc25hcHNob3Q7XG5cdH1cblx0YWRkU3Vic2NyaWJlcihfcmVzb3VyY2U6IFVSSSwgX2NsaWVudElkOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHR1bnN1YnNjcmliZShfcmVzb3VyY2U6IFVSSSwgX2NsaWVudElkOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRhc3luYyBzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHsgdGhpcy5zaHV0ZG93bkNhbGxzKys7IH1cblx0YXN5bmMgZ2V0TmV0d29ya0RpYWdub3N0aWNzSW5mbygpOiBQcm9taXNlPElBZ2VudEhvc3ROZXR3b3JrRGlhZ25vc3RpY3NJbmZvPiB7IHJldHVybiB7IHZlcnNpb246ICd0ZXN0Jywgb3M6ICd0ZXN0JywgYXJjaDogJ3Rlc3QnLCBwcm94eVNldHRpbmdzOiB7fSwgcHJveHlFbnY6IHt9LCBlbmRwb2ludHM6IFtdIH07IH1cblx0YXN5bmMgZ2V0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3MoKTogUHJvbWlzZTxyZWFkb25seSBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3NbXT4geyByZXR1cm4gdGhpcy5tYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljczsgfVxuXHRhc3luYyBkaWFnbm9zdGljc0ZldGNoKHVybDogc3RyaW5nKTogUHJvbWlzZTxJQWdlbnRIb3N0TmV0d29ya0ZldGNoUmVzdWx0PiB7IHJldHVybiB7IHVybCB9OyB9XG5cdGFzeW5jIGF1dGhlbnRpY2F0ZShfcGFyYW1zOiBBdXRoZW50aWNhdGVQYXJhbXMpOiBQcm9taXNlPEF1dGhlbnRpY2F0ZVJlc3VsdD4geyByZXR1cm4geyBhdXRoZW50aWNhdGVkOiB0cnVlIH07IH1cblx0Z2V0QXV0aFRva2VuKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgcmVzb3VyY2VXcml0ZShfcGFyYW1zOiBSZXNvdXJjZVdyaXRlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVdyaXRlUmVzdWx0PiB7IHJldHVybiB7fTsgfVxuXHRhc3luYyByZXNvdXJjZUxpc3QodXJpOiBVUkkpOiBQcm9taXNlPFJlc291cmNlTGlzdFJlc3VsdD4ge1xuXHRcdHRoaXMuYnJvd3NlZFVyaXMucHVzaCh1cmkpO1xuXHRcdGNvbnN0IGVycm9yID0gdGhpcy5icm93c2VFcnJvcnMuZ2V0KHVyaS50b1N0cmluZygpKTtcblx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZW50cmllczogW1xuXHRcdFx0XHR7IG5hbWU6ICdzcmMnLCB0eXBlOiAnZGlyZWN0b3J5JyB9LFxuXHRcdFx0XHR7IG5hbWU6ICdSRUFETUUubWQnLCB0eXBlOiAnZmlsZScgfSxcblx0XHRcdF0sXG5cdFx0fTtcblx0fVxuXHRhc3luYyByZXNvdXJjZVJlYWQodXJpOiBVUkkpOiBQcm9taXNlPFJlc291cmNlUmVhZFJlc3VsdD4ge1xuXHRcdGNvbnN0IGVycm9yID0gdGhpcy5yZWFkRXJyb3JzLmdldCh1cmkudG9TdHJpbmcoKSk7XG5cdFx0aWYgKGVycm9yKSB7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIHsgZGF0YTogJycsIGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCB9O1xuXHR9XG5cdGFzeW5jIHJlc291cmNlQ29weShfcGFyYW1zOiBSZXNvdXJjZUNvcHlQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlQ29weVJlc3VsdD4geyByZXR1cm4ge307IH1cblx0YXN5bmMgcmVzb3VyY2VEZWxldGUoKTogUHJvbWlzZTx7fT4geyByZXR1cm4ge307IH1cblx0YXN5bmMgcmVzb3VyY2VNb3ZlKCk6IFByb21pc2U8e30+IHsgcmV0dXJuIHt9OyB9XG5cdGFzeW5jIHJlc291cmNlUmVzb2x2ZShfcGFyYW1zOiBSZXNvdXJjZVJlc29sdmVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlUmVzb2x2ZVJlc3VsdD4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGFzeW5jIHJlc291cmNlTWtkaXIoX3BhcmFtczogUmVzb3VyY2VNa2RpclBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VNa2RpclJlc3VsdD4geyByZXR1cm4ge307IH1cblx0cmVhZG9ubHkgd2F0Y2hTdWJzY3JpYmVDYWxsczogc3RyaW5nW10gPSBbXTtcblx0cmVhZG9ubHkgd2F0Y2hVbnN1YnNjcmliZUNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHQvKiogQ2hhbm5lbHMgZm9yIHdoaWNoIGBvblJlc291cmNlV2F0Y2hTdWJzY3JpYmVkYCBzaG91bGQgcmV0dXJuIGEgZGVzY3JpcHRvci4gKi9cblx0cmVhZG9ubHkgbGl2ZVdhdGNoRGVzY3JpcHRvcnMgPSBuZXcgTWFwPHN0cmluZywgaW1wb3J0KCcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJykuUmVzb3VyY2VXYXRjaFN0YXRlPigpO1xuXHRhc3luYyBjcmVhdGVSZXNvdXJjZVdhdGNoKF9wYXJhbXM6IGltcG9ydCgnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcycpLkNyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXMpOiBQcm9taXNlPGltcG9ydCgnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcycpLkNyZWF0ZVJlc291cmNlV2F0Y2hSZXN1bHQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cdG9uUmVzb3VyY2VXYXRjaFN1YnNjcmliZWQoY2hhbm5lbDogc3RyaW5nKTogaW1wb3J0KCcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJykuUmVzb3VyY2VXYXRjaFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLndhdGNoU3Vic2NyaWJlQ2FsbHMucHVzaChjaGFubmVsKTtcblx0XHRyZXR1cm4gdGhpcy5saXZlV2F0Y2hEZXNjcmlwdG9ycy5nZXQoY2hhbm5lbCk7XG5cdH1cblx0b25SZXNvdXJjZVdhdGNoVW5zdWJzY3JpYmVkKGNoYW5uZWw6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHRoaXMud2F0Y2hVbnN1YnNjcmliZUNhbGxzLnB1c2goY2hhbm5lbCk7XG5cdFx0cmV0dXJuIHRoaXMubGl2ZVdhdGNoRGVzY3JpcHRvcnMuaGFzKGNoYW5uZWwpO1xuXHR9XG5cdGFzeW5jIGNyZWF0ZVRlcm1pbmFsKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGRpc3Bvc2VUZXJtaW5hbCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBpbnZva2VDaGFuZ2VzZXRPcGVyYXRpb24oKTogUHJvbWlzZTx7fT4geyByZXR1cm4ge307IH1cblx0YXN5bmMgaGFuZGxlTWNwUmVxdWVzdCgpOiBQcm9taXNlPHVua25vd24+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGZvdW5kJyk7IH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQWN0aW9uLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZE5vdGlmaWNhdGlvbi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25NY3BOb3RpZmljYXRpb24uZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vIC0tLS0gSGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIG5vdGlmaWNhdGlvbihtZXRob2Q6IHN0cmluZywgcGFyYW1zPzogdW5rbm93bik6IFByb3RvY29sTWVzc2FnZSB7XG5cdHJldHVybiB7IGpzb25ycGM6ICcyLjAnLCBtZXRob2QsIHBhcmFtcyB9IGFzIFByb3RvY29sTWVzc2FnZTtcbn1cblxuZnVuY3Rpb24gcmVxdWVzdChpZDogbnVtYmVyLCBtZXRob2Q6IHN0cmluZywgcGFyYW1zPzogdW5rbm93bik6IFByb3RvY29sTWVzc2FnZSB7XG5cdHJldHVybiB7IGpzb25ycGM6ICcyLjAnLCBpZCwgbWV0aG9kLCBwYXJhbXMgfSBhcyBQcm90b2NvbE1lc3NhZ2U7XG59XG5cbmZ1bmN0aW9uIGZpbmROb3RpZmljYXRpb25zKHNlbnQ6IFByb3RvY29sTWVzc2FnZVtdLCBtZXRob2Q6IHN0cmluZyk6IEFocE5vdGlmaWNhdGlvbltdIHtcblx0cmV0dXJuIHNlbnQuZmlsdGVyKGlzSnNvblJwY05vdGlmaWNhdGlvbikgYXMgQWhwTm90aWZpY2F0aW9uW107XG59XG5cbmZ1bmN0aW9uIGZpbmRSZXNwb25zZShzZW50OiBQcm90b2NvbE1lc3NhZ2VbXSwgaWQ6IG51bWJlcik6IFByb3RvY29sTWVzc2FnZSB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBzZW50LmZpbmQobWVzc2FnZSA9PiBpc0pzb25ScGNSZXNwb25zZShtZXNzYWdlKSAmJiBtZXNzYWdlLmlkID09PSBpZCk7XG59XG5cbmZ1bmN0aW9uIHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQ6IE1vY2tQcm90b2NvbFRyYW5zcG9ydCwgaWQ6IG51bWJlcik6IFByb21pc2U8UHJvdG9jb2xNZXNzYWdlPiB7XG5cdHJldHVybiBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKHRyYW5zcG9ydC5vbkRpZFNlbmQsIG1lc3NhZ2UgPT4gaXNKc29uUnBjUmVzcG9uc2UobWVzc2FnZSkgJiYgbWVzc2FnZS5pZCA9PT0gaWQpKTtcbn1cblxuLy8gLS0tLSBUZXN0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuc3VpdGUoJ1Byb3RvY29sU2VydmVySGFuZGxlcicsICgpID0+IHtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyO1xuXHRsZXQgc2VydmVyOiBNb2NrUHJvdG9jb2xTZXJ2ZXI7XG5cdGxldCBhZ2VudFNlcnZpY2U6IE1vY2tBZ2VudFNlcnZpY2U7XG5cdGxldCBtYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlOiBBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlO1xuXHRsZXQgaGFuZGxlcjogUHJvdG9jb2xTZXJ2ZXJIYW5kbGVyO1xuXHRsZXQgZmlsZVN5c3RlbVByb3ZpZGVyOiBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXI7XG5cdGxldCBsb2dTZXJ2aWNlOiBDb3VudGluZ0xvZ1NlcnZpY2U7XG5cdGxldCB0ZWxlbWV0cnlTZXJ2aWNlOiBUZXN0VGVsZW1ldHJ5U2VydmljZTtcblxuXHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy90ZXN0LXNlc3Npb24nIH0pLnRvU3RyaW5nKCk7XG5cdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblxuXHRmdW5jdGlvbiBtYWtlU2Vzc2lvblN1bW1hcnkocmVzb3VyY2U/OiBzdHJpbmcpOiBTZXNzaW9uU3VtbWFyeSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlOiByZXNvdXJjZSA/PyBzZXNzaW9uVXJpLFxuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0cHJvamVjdDogeyB1cmk6ICdmaWxlOi8vL3Rlc3QtcHJvamVjdCcsIGRpc3BsYXlOYW1lOiAnVGVzdCBQcm9qZWN0JyB9LFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjb25uZWN0Q2xpZW50KGNsaWVudElkOiBzdHJpbmcsIGluaXRpYWxTdWJzY3JpcHRpb25zPzogcmVhZG9ubHkgc3RyaW5nW10sIGNsaWVudEluZm8/OiBJbXBsZW1lbnRhdGlvbiwgbWV0YT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogTW9ja1Byb3RvY29sVHJhbnNwb3J0IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQpO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAnaW5pdGlhbGl6ZScsIHtcblx0XHRcdHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSxcblx0XHRcdGNsaWVudElkLFxuXHRcdFx0Y2xpZW50SW5mbyxcblx0XHRcdF9tZXRhOiBtZXRhLFxuXHRcdFx0aW5pdGlhbFN1YnNjcmlwdGlvbnMsXG5cdFx0fSkpO1xuXHRcdHJldHVybiB0cmFuc3BvcnQ7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRzZXJ2ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tQcm90b2NvbFNlcnZlcigpKTtcblx0XHRhZ2VudFNlcnZpY2UgPSBuZXcgTW9ja0FnZW50U2VydmljZSgpO1xuXHRcdGFnZW50U2VydmljZS5zZXRTdGF0ZU1hbmFnZXIoc3RhdGVNYW5hZ2VyKTtcblx0XHRtYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKCkpO1xuXHRcdGxvZ1NlcnZpY2UgPSBuZXcgQ291bnRpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0dGVsZW1ldHJ5U2VydmljZSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZ2VudFNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChoYW5kbGVyID0gbmV3IFByb3RvY29sU2VydmVySGFuZGxlcihcblx0XHRcdGFnZW50U2VydmljZSxcblx0XHRcdHN0YXRlTWFuYWdlcixcblx0XHRcdHNlcnZlcixcblx0XHRcdHsgaG9zdExhdW5jaEtpbmQ6IEFnZW50SG9zdExhdW5jaEtpbmQuVlNDb2RlTWFpblByb2Nlc3MsIGRlZmF1bHREaXJlY3Rvcnk6IFVSSS5maWxlKCcvaG9tZS90ZXN0dXNlcicpLnRvU3RyaW5nKCkgfSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU3lzdGVtUHJvdmlkZXIgPSBuZXcgQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyKCkpLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLFxuXHRcdCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdoYW5kc2hha2UgcmV0dXJucyBpbml0aWFsaXplIHJlc3BvbnNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC0xJyk7XG5cblx0XHRjb25zdCByZXNwID0gZmluZFJlc3BvbnNlKHRyYW5zcG9ydC5zZW50LCAxKTtcblx0XHRhc3NlcnQub2socmVzcCwgJ3Nob3VsZCBoYXZlIHNlbnQgaW5pdGlhbGl6ZSByZXNwb25zZScpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IChyZXNwIGFzIHsgcmVzdWx0OiBJbml0aWFsaXplUmVzdWx0IH0pLnJlc3VsdDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByb3RvY29sVmVyc2lvbiwgUFJPVE9DT0xfVkVSU0lPTik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZXJ2ZXJTZXEsIHN0YXRlTWFuYWdlci5zZXJ2ZXJTZXEpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kc2hha2UgcmVqZWN0cyB1bnN1cHBvcnRlZCBwcm90b2NvbCB2ZXJzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQpO1xuXHRcdC8vIE9mZmVyIGEgc2luZ2xlLCBkZWxpYmVyYXRlbHktdW5zdXBwb3J0ZWQgdmVyc2lvbi4gVGhlIHNlcnZlciBzaG91bGRcblx0XHQvLyByZXNwb25kIHdpdGggLTMyMDA1IGFuZCBhIG1lc3NhZ2UgbmFtaW5nIHRoZSBvZmZlcmVkL3N1cHBvcnRlZCBzZXRzXG5cdFx0Ly8gaW5zdGVhZCBvZiBhIHJlc3VsdC5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbJzAuMC4wJ10sXG5cdFx0XHRjbGllbnRJZDogJ2NsaWVudC1pbmNvbXBhdCcsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVzcCA9IGZpbmRSZXNwb25zZSh0cmFuc3BvcnQuc2VudCwgMSkgYXMgeyBlcnJvcj86IHsgY29kZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmc7IGRhdGE/OiB1bmtub3duIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQub2socmVzcCwgJ3Nob3VsZCBoYXZlIHNlbnQgZXJyb3IgcmVzcG9uc2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcC5lcnJvcj8uY29kZSwgQUhQX1VOU1VQUE9SVEVEX1BST1RPQ09MX1ZFUlNJT04pO1xuXHRcdGFzc2VydC5tYXRjaChyZXNwLmVycm9yIS5tZXNzYWdlLCAvMFxcLjBcXC4wLyk7XG5cdFx0YXNzZXJ0Lm1hdGNoKHJlc3AuZXJyb3IhLm1lc3NhZ2UsIG5ldyBSZWdFeHAoUFJPVE9DT0xfVkVSU0lPTi5yZXBsYWNlKC9cXC4vZywgJ1xcXFwuJykpKTtcblx0XHQvLyBXaXRob3V0IHRoZSB1cGdyYWRlLXNvY2tldCBlbnYgdmFyLCBubyBfbWV0YSBzaG91bGQgYmUgYWR2ZXJ0aXNlZC5cblx0XHRjb25zdCBkYXRhID0gcmVzcC5lcnJvciEuZGF0YSBhcyB7IF9tZXRhPzogeyB2c2NvZGVVcGdyYWRlTWV0aG9kPzogc3RyaW5nIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YT8uX21ldGE/LnZzY29kZVVwZ3JhZGVNZXRob2QsIHVuZGVmaW5lZCk7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXHRcdHRyYW5zcG9ydC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRzaGFrZSBsZW5pZW50bHkgcGlja3MgdGhlIGhpZ2hlc3QgY29tcGF0aWJsZSBvZmZlcmVkIHZlcnNpb24nLCAoKSA9PiB7XG5cdFx0Ly8gTWl4IGFuIGluY29tcGF0aWJsZSB2ZXJzaW9uIHdpdGggYSBjb21wYXRpYmxlIG9uZSBcdTIwMTQgdGhlIHNlcnZlclxuXHRcdC8vIG11c3QgcGljayB0aGUgY29tcGF0aWJsZSBvbmUgcmF0aGVyIHRoYW4gcmVqZWN0aW5nIG9uIHRoZSBmaXJzdFxuXHRcdC8vIHVua25vd24gZW50cnkuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0KTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbJzAuMC4wJywgUFJPVE9DT0xfVkVSU0lPTiwgJzkuOS45J10sXG5cdFx0XHRjbGllbnRJZDogJ2NsaWVudC1sZW5pZW50Jyxcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZXNwID0gZmluZFJlc3BvbnNlKHRyYW5zcG9ydC5zZW50LCAxKSBhcyB7IHJlc3VsdD86IEluaXRpYWxpemVSZXN1bHQgfSB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQub2socmVzcD8ucmVzdWx0LCAnc2hvdWxkIGhhdmUgbmVnb3RpYXRlZCBzdWNjZXNzZnVsbHknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcC5yZXN1bHQucHJvdG9jb2xWZXJzaW9uLCBQUk9UT0NPTF9WRVJTSU9OKTtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0dHJhbnNwb3J0LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndXBncmFkZSBtZXRob2QgYWR2ZXJ0aXNlZCB3aGVuIG1hbmFnZW1lbnQgc29ja2V0IGVudiB2YXIgaXMgc2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsRW52ID0gcHJvY2Vzcy5lbnYuVlNDT0RFX0FHRU5UX0hPU1RfTUFOQUdFTUVOVF9TT0NLRVQ7XG5cdFx0cHJvY2Vzcy5lbnYuVlNDT0RFX0FHRU5UX0hPU1RfTUFOQUdFTUVOVF9TT0NLRVQgPSAnL3RtcC9tb2NrLXN1cGVydmlzb3Iuc29jayc7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0KTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAnaW5pdGlhbGl6ZScsIHtcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogWyc5LjkuOSddLFxuXHRcdFx0XHRjbGllbnRJZDogJ2NsaWVudC1pbmNvbXBhdC13aXRoLWNsaScsXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IHJlc3AgPSBmaW5kUmVzcG9uc2UodHJhbnNwb3J0LnNlbnQsIDEpIGFzIHsgZXJyb3I/OiB7IGNvZGU6IG51bWJlcjsgZGF0YT86IHVua25vd24gfSB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3A/LmVycm9yPy5jb2RlLCBBSFBfVU5TVVBQT1JURURfUFJPVE9DT0xfVkVSU0lPTik7XG5cdFx0XHRjb25zdCBkYXRhID0gcmVzcC5lcnJvciEuZGF0YSBhcyB7IF9tZXRhPzogeyB2c2NvZGVVcGdyYWRlTWV0aG9kPzogc3RyaW5nIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhPy5fbWV0YT8udnNjb2RlVXBncmFkZU1ldGhvZCwgJ192c2NvZGVVcGdyYWRlJyk7XG5cblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0XHR0cmFuc3BvcnQuZGlzcG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAob3JpZ2luYWxFbnYgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRkZWxldGUgcHJvY2Vzcy5lbnYuVlNDT0RFX0FHRU5UX0hPU1RfTUFOQUdFTUVOVF9TT0NLRVQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwcm9jZXNzLmVudi5WU0NPREVfQUdFTlRfSE9TVF9NQU5BR0VNRU5UX1NPQ0tFVCA9IG9yaWdpbmFsRW52O1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnX3ZzY29kZVVwZ3JhZGUgUlBDIHJldHVybnMgTWV0aG9kTm90Rm91bmQgd2hlbiBubyBzdXBlcnZpc29yIGlzIGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQpO1xuXHRcdC8vIE5vdGU6IE5PVCBnb2luZyB0aHJvdWdoIGluaXRpYWxpemUgZmlyc3QgXHUyMDE0IHRoZSB1cGdyYWRlIG1ldGhvZCBtdXN0XG5cdFx0Ly8gYWxzbyBiZSBjYWxsYWJsZSBwcmUtaGFuZHNoYWtlLlxuXHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDQyKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoNDIsICdfdnNjb2RlVXBncmFkZScsIHt9KSk7XG5cblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlIGFzIHsgZXJyb3I/OiB7IGNvZGU6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nIH0gfTtcblx0XHRhc3NlcnQub2socmVzcC5lcnJvciwgJ3Nob3VsZCBoYXZlIHJlc3BvbmRlZCB3aXRoIGFuIGVycm9yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3AuZXJyb3IhLmNvZGUsIC0zMjYwMSAvKiBNZXRob2ROb3RGb3VuZCAqLyk7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXHRcdHRyYW5zcG9ydC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRzaGFrZSB3aXRoIGluaXRpYWxTdWJzY3JpcHRpb25zIHJldHVybnMgc25hcHNob3RzJywgKCkgPT4ge1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC0xJywgW3Nlc3Npb25VcmldKTtcblxuXHRcdGNvbnN0IHJlc3AgPSBmaW5kUmVzcG9uc2UodHJhbnNwb3J0LnNlbnQsIDEpO1xuXHRcdGFzc2VydC5vayhyZXNwKTtcblx0XHRjb25zdCByZXN1bHQgPSAocmVzcCBhcyB7IHJlc3VsdDogSW5pdGlhbGl6ZVJlc3VsdCB9KS5yZXN1bHQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zbmFwc2hvdHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNuYXBzaG90c1swXS5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kc2hha2UgcmV0YWlucyBhbiBpbml0aWFsIHN1YnNjcmlwdGlvbiB3aG9zZSBzdGF0ZSBoYXMgbm90IG1hdGVyaWFsaXplZCcsICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtMScsIFtkZWZhdWx0Q2hhdFVyaV0pO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gZmluZFJlc3BvbnNlKHRyYW5zcG9ydC5zZW50LCAxKSBhcyB7IHJlc3VsdDogSW5pdGlhbGl6ZVJlc3VsdCB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzcG9uc2UucmVzdWx0LnNuYXBzaG90cywgW10pO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8gYWZ0ZXIgcmVzdG9yZScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGFjdGlvbk1lc3NhZ2VzID0gZmluZE5vdGlmaWNhdGlvbnModHJhbnNwb3J0LnNlbnQsICdhY3Rpb24nKTtcblx0XHRjb25zdCB0dXJuU3RhcnRlZCA9IGFjdGlvbk1lc3NhZ2VzLmZpbmQobWVzc2FnZSA9PiB7XG5cdFx0XHRjb25zdCBlbnZlbG9wZSA9IG1lc3NhZ2UucGFyYW1zIGFzIHVua25vd24gYXMgeyBhY3Rpb24/OiB7IHR5cGU6IHN0cmluZyB9IH07XG5cdFx0XHRyZXR1cm4gZW52ZWxvcGUuYWN0aW9uPy50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZDtcblx0XHR9KTtcblx0XHRhc3NlcnQub2sodHVyblN0YXJ0ZWQsICdzaG91bGQgZGVsaXZlciBhY3Rpb25zIGFmdGVyIHRoZSBpbml0aWFsbHkgbWlzc2luZyBzdGF0ZSBtYXRlcmlhbGl6ZXMnKTtcblx0fSk7XG5cblx0dGVzdCgncGluZyByZXNwb25kcyBiZWZvcmUgaW5pdGlhbGl6ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRyYW5zcG9ydCk7XG5cdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQpO1xuXHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDcpO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCg3LCAncGluZycsIHt9KSk7XG5cdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZSBhcyB7IGlkOiBudW1iZXI7IHJlc3VsdDogbnVsbCB9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3AuaWQsIDcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwLnJlc3VsdCwgbnVsbCk7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlQ2xvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndW5rbm93biByZXF1ZXN0cyByZXR1cm4gTWV0aG9kTm90Rm91bmQgYmVmb3JlIGFuZCBhZnRlciBpbml0aWFsaXplJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodHJhbnNwb3J0KTtcblx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydCk7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoNywgJ25vdEFSZWFsTWV0aG9kJywgeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nIH0pKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoOCwgJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sXG5cdFx0XHRjbGllbnRJZDogJ2NsaWVudC0xJyxcblx0XHR9KSk7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDksICdub3RBUmVhbE1ldGhvZCcsIHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJyB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W2ZpbmRSZXNwb25zZSh0cmFuc3BvcnQuc2VudCwgNyksIGZpbmRSZXNwb25zZSh0cmFuc3BvcnQuc2VudCwgOSldLFxuXHRcdFx0W1xuXHRcdFx0XHR7IGpzb25ycGM6ICcyLjAnLCBpZDogNywgZXJyb3I6IHsgY29kZTogSnNvblJwY0Vycm9yQ29kZXMuTWV0aG9kTm90Rm91bmQsIG1lc3NhZ2U6ICdNZXRob2Qgbm90IGZvdW5kOiBub3RBUmVhbE1ldGhvZCcgfSB9LFxuXHRcdFx0XHR7IGpzb25ycGM6ICcyLjAnLCBpZDogOSwgZXJyb3I6IHsgY29kZTogSnNvblJwY0Vycm9yQ29kZXMuTWV0aG9kTm90Rm91bmQsIG1lc3NhZ2U6ICdNZXRob2Qgbm90IGZvdW5kOiBub3RBUmVhbE1ldGhvZCcgfSB9LFxuXHRcdFx0XSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRlbnNpb24gbWV0aG9kcyByZW1haW4gZW5hYmxlZCBieSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1leHRlbnNpb24tZGVmYXVsdCcpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMTEpO1xuXG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDExLCAnc2h1dGRvd24nLCB7fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXNwb25zZTogYXdhaXQgcmVzcG9uc2VQcm9taXNlLFxuXHRcdFx0c2h1dGRvd25DYWxsczogYWdlbnRTZXJ2aWNlLnNodXRkb3duQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0cmVzcG9uc2U6IHsganNvbnJwYzogJzIuMCcsIGlkOiAxMSwgcmVzdWx0OiBudWxsIH0sXG5cdFx0XHRzaHV0ZG93bkNhbGxzOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRlbnNpb24gbWV0aG9kcyBjYW4gYmUgZGlzYWJsZWQgd2l0aG91dCBibG9ja2luZyBtYW5hZ2VkIHNldHRpbmdzIGNvbnRyaWJ1dGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxEaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGxvY2FsU2VydmVyID0gbG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tQcm90b2NvbFNlcnZlcigpKTtcblx0XHRsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgUHJvdG9jb2xTZXJ2ZXJIYW5kbGVyKFxuXHRcdFx0YWdlbnRTZXJ2aWNlLFxuXHRcdFx0c3RhdGVNYW5hZ2VyLFxuXHRcdFx0bG9jYWxTZXJ2ZXIsXG5cdFx0XHR7XG5cdFx0XHRcdGRlZmF1bHREaXJlY3Rvcnk6IFVSSS5maWxlKCcvaG9tZS90ZXN0dXNlcicpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGFsbG93RXh0ZW5zaW9uTWV0aG9kczogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0bG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlcigpKSxcblx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdG1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsXG5cdFx0KSk7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdGxvY2FsU2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQpO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAnaW5pdGlhbGl6ZScsIHtcblx0XHRcdHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSxcblx0XHRcdGNsaWVudElkOiAnY2xpZW50LWV4dGVuc2lvbi1kaXNhYmxlZCcsXG5cdFx0fSkpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdzaHV0ZG93bicsIHt9KSk7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShub3RpZmljYXRpb24oJ3NldENsaWVudE1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zJywge1xuXHRcdFx0cGVybWlzc2lvbnM6IHsgZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZTogJ2Rpc2FibGUnLCBhc2s6IFsnU2hlbGwnXSB9LFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzcG9uc2U6IGZpbmRSZXNwb25zZSh0cmFuc3BvcnQuc2VudCwgMiksXG5cdFx0XHRzaHV0ZG93bkNhbGxzOiBhZ2VudFNlcnZpY2Uuc2h1dGRvd25DYWxscyxcblx0XHRcdG1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zOiBtYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLnBlcm1pc3Npb25zLFxuXHRcdH0sIHtcblx0XHRcdHJlc3BvbnNlOiB7IGpzb25ycGM6ICcyLjAnLCBpZDogMiwgZXJyb3I6IHsgY29kZTogSnNvblJwY0Vycm9yQ29kZXMuTWV0aG9kTm90Rm91bmQsIG1lc3NhZ2U6ICdNZXRob2Qgbm90IGZvdW5kOiBzaHV0ZG93bicgfSB9LFxuXHRcdFx0c2h1dGRvd25DYWxsczogMCxcblx0XHRcdG1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zOiB7IGRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGU6ICdkaXNhYmxlJywgYXNrOiBbJ1NoZWxsJ10gfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGluZyByZXNwb25kcyBhZnRlciBpbml0aWFsaXplJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC0xJyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCA5KTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoOSwgJ3BpbmcnLCB7fSkpO1xuXHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2UgYXMgeyBpZDogbnVtYmVyOyByZXN1bHQ6IG51bGwgfTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwLmlkLCA5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcC5yZXN1bHQsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdWJzY3JpYmUgcmVxdWVzdCByZXR1cm5zIHNuYXBzaG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC0xJyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAxKTtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAnc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0pKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3AsICdzaG91bGQgaGF2ZSBzZW50IHJlc3BvbnNlJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gKHJlc3AgYXMgdW5rbm93biBhcyB7IHJlc3VsdDogeyBzbmFwc2hvdDogSVN0YXRlU25hcHNob3QgfSB9KS5yZXN1bHQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zbmFwc2hvdC5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGllbnQgYWN0aW9uIGlzIGRpc3BhdGNoZWQgYW5kIGVjaG9lZCcsICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0Ly8gQ2hhdCBhY3Rpb25zIGFyZSBlbWl0dGVkIG9uIHRoZSBkZXJpdmVkIGRlZmF1bHQtY2hhdCBjaGFubmVsLCBzbyB0aGVcblx0XHQvLyBjbGllbnQgbXVzdCBzdWJzY3JpYmUgdG8gaXQgKGFzIHRoZSByZWFsIFVJIGJyaWRnZSBkb2VzKSB0byBzZWUgZWNob2VzLlxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC0xJywgW3Nlc3Npb25VcmksIGRlZmF1bHRDaGF0VXJpXSk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2Uobm90aWZpY2F0aW9uKCdkaXNwYXRjaEFjdGlvbicsIHtcblx0XHRcdGNoYW5uZWw6IGRlZmF1bHRDaGF0VXJpLFxuXHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9uTXNncyA9IGZpbmROb3RpZmljYXRpb25zKHRyYW5zcG9ydC5zZW50LCAnYWN0aW9uJyk7XG5cdFx0Y29uc3QgdHVyblN0YXJ0ZWQgPSBhY3Rpb25Nc2dzLmZpbmQobSA9PiB7XG5cdFx0XHRjb25zdCBlbnZlbG9wZSA9IG0ucGFyYW1zIGFzIHVua25vd24gYXMgeyBhY3Rpb246IHsgdHlwZTogc3RyaW5nIH0gfTtcblx0XHRcdHJldHVybiBlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQ7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0Lm9rKHR1cm5TdGFydGVkLCAnc2hvdWxkIGhhdmUgZWNob2VkIHR1cm5TdGFydGVkJyk7XG5cdFx0Y29uc3QgZW52ZWxvcGUgPSB0dXJuU3RhcnRlZCEucGFyYW1zIGFzIHVua25vd24gYXMgeyBvcmlnaW46IHsgY2xpZW50SWQ6IHN0cmluZzsgY2xpZW50U2VxOiBudW1iZXIgfSB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZlbG9wZS5vcmlnaW4uY2xpZW50SWQsICdjbGllbnQtMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZlbG9wZS5vcmlnaW4uY2xpZW50U2VxLCAxKTtcblx0fSk7XG5cblx0dGVzdCgndW5zdXBwb3J0ZWQgY2hhdCB3b3JraW5nLWRpcmVjdG9yeSBhY3Rpb25zIGFyZSByZWplY3RlZCwgbm90IGRpc3BhdGNoZWQnLCAoKSA9PiB7XG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdGNvbnN0IGNhc2VzOiByZWFkb25seSB7IHJlYWRvbmx5IHR5cGU6IEFjdGlvblR5cGU7IHJlYWRvbmx5IGNoYW5uZWw6IHN0cmluZyB9W10gPSBbXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFdvcmtpbmdEaXJlY3RvcnlTZXQsIGNoYW5uZWw6IGRlZmF1bHRDaGF0VXJpIH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFdvcmtpbmdEaXJlY3RvcnlSZW1vdmVkLCBjaGFubmVsOiBkZWZhdWx0Q2hhdFVyaSB9LFxuXHRcdF07XG5cblx0XHRmb3IgKGNvbnN0IFtpbmRleCwgeyB0eXBlLCBjaGFubmVsIH1dIG9mIGNhc2VzLmVudHJpZXMoKSkge1xuXHRcdFx0Y29uc3QgY2xpZW50SWQgPSBgd2QtY2xpZW50LSR7aW5kZXh9YDtcblx0XHRcdGNvbnN0IGNsaWVudFNlcSA9IDEwMCArIGluZGV4O1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudChjbGllbnRJZCwgW3Nlc3Npb25VcmksIGRlZmF1bHRDaGF0VXJpXSk7XG5cdFx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXHRcdFx0YWdlbnRTZXJ2aWNlLmhhbmRsZWRBY3Rpb25zLmxlbmd0aCA9IDA7XG5cblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2Uobm90aWZpY2F0aW9uKCdkaXNwYXRjaEFjdGlvbicsIHtcblx0XHRcdFx0Y2hhbm5lbCxcblx0XHRcdFx0Y2xpZW50U2VxLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZSwgZGlyZWN0b3J5OiAnZmlsZTovLy90bXAvZXh0cmEtcm9vdCcgfSxcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gTm8gZGlzcGF0Y2g6IHRoZSBnYXRlIGludGVyY2VwdHMgYmVmb3JlIHJlYWNoaW5nIHRoZSBhZ2VudCBzZXJ2aWNlLFxuXHRcdFx0Ly8gc28gdGhlIHJlZHVjZXIgbmV2ZXIgcnVucyBhbmQgc3luY2hyb25pemVkIHN0YXRlIGlzIHVudG91Y2hlZC5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRTZXJ2aWNlLmhhbmRsZWRBY3Rpb25zLCBbXSwgYCR7dHlwZX0gbXVzdCBub3QgYmUgZGlzcGF0Y2hlZGApO1xuXG5cdFx0XHQvLyBFeGFjdGx5IG9uZSByZWplY3Rpb24gZW52ZWxvcGUsIHByZXNlcnZpbmcgdGhlIG9yaWdpbmFsIG9yaWdpbiBzbyB0aGVcblx0XHRcdC8vIGNsaWVudCBjYW4gcmVjb25jaWxlIGl0cyBvcHRpbWlzdGljIGFjdGlvbi5cblx0XHRcdGNvbnN0IGFjdGlvbk1zZ3MgPSBmaW5kTm90aWZpY2F0aW9ucyh0cmFuc3BvcnQuc2VudCwgJ2FjdGlvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbk1zZ3MubGVuZ3RoLCAxLCBgJHt0eXBlfSBzaG91bGQgZW1pdCBleGFjdGx5IG9uZSBlbnZlbG9wZWApO1xuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBhY3Rpb25Nc2dzWzBdLnBhcmFtcyBhcyB1bmtub3duIGFzIHsgYWN0aW9uOiB7IHR5cGU6IHN0cmluZyB9OyBvcmlnaW46IHsgY2xpZW50SWQ6IHN0cmluZzsgY2xpZW50U2VxOiBudW1iZXIgfTsgcmVqZWN0aW9uUmVhc29uPzogc3RyaW5nIH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGUuYWN0aW9uLnR5cGUsIHR5cGUpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVudmVsb3BlLnJlamVjdGlvblJlYXNvbiwgYCR7dHlwZX0gZW52ZWxvcGUgc2hvdWxkIGNhcnJ5IGEgcmVqZWN0aW9uUmVhc29uYCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGUub3JpZ2luLmNsaWVudElkLCBjbGllbnRJZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGUub3JpZ2luLmNsaWVudFNlcSwgY2xpZW50U2VxKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gd29ya2luZy1kaXJlY3RvcnkgYWN0aW9ucyByZWFjaCB0aGUgYWdlbnQgc2VydmljZScsICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHkgfSk7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnd29ya2luZy1kaXJlY3RvcnktY2xpZW50JywgW3Nlc3Npb25VcmldLCBlZGl0b3JXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvKTtcblx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShub3RpZmljYXRpb24oJ2Rpc3BhdGNoQWN0aW9uJywge1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3Rvcnk6ICdmaWxlOi8vL3RtcC9leHRyYS1yb290JyB9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGFjdGlvbiA9IGFnZW50U2VydmljZS5oYW5kbGVkQWN0aW9ucy5hdCgtMSk7XG5cdFx0Y29uc3QgZW52ZWxvcGUgPSBmaW5kTm90aWZpY2F0aW9ucyh0cmFuc3BvcnQuc2VudCwgJ2FjdGlvbicpLmF0KC0xKT8ucGFyYW1zIGFzIEFjdGlvbkVudmVsb3BlIHwgdW5kZWZpbmVkO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWN0aW9uLFxuXHRcdFx0Y2xpZW50VHlwZTogYWdlbnRTZXJ2aWNlLmhhbmRsZWRDbGllbnRUeXBlcy5hdCgtMSksXG5cdFx0XHRyZWplY3Rpb25SZWFzb246IGVudmVsb3BlPy5yZWplY3Rpb25SZWFzb24sXG5cdFx0fSwge1xuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQsIGRpcmVjdG9yeTogJ2ZpbGU6Ly8vdG1wL2V4dHJhLXJvb3QnIH0sXG5cdFx0XHRjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdyxcblx0XHRcdHJlamVjdGlvblJlYXNvbjogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3Rpb25zIGFyZSBzY29wZWQgdG8gc3Vic2NyaWJlZCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0QSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1hJywgW3Nlc3Npb25VcmldKTtcblx0XHRjb25zdCB0cmFuc3BvcnRCID0gY29ubmVjdENsaWVudCgnY2xpZW50LWInKTtcblxuXHRcdHRyYW5zcG9ydEEuc2VudC5sZW5ndGggPSAwO1xuXHRcdHRyYW5zcG9ydEIuc2VudC5sZW5ndGggPSAwO1xuXG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdHRpdGxlOiAnTmV3IFRpdGxlJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTm90aWZpY2F0aW9ucyh0cmFuc3BvcnRBLnNlbnQsICdhY3Rpb24nKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTm90aWZpY2F0aW9ucyh0cmFuc3BvcnRCLnNlbnQsICdhY3Rpb24nKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2VzZXQgYWN0aW9ucyBhcmUgc2NvcGVkIHRvIHN1YnNjcmliZWQgY2hhbmdlc2V0IFVSSXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYCR7c2Vzc2lvblVyaX0vY2hhbmdlc2V0L3Nlc3Npb25gO1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0c3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGNoYW5nZXNldFVyaSk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnRBID0gY29ubmVjdENsaWVudCgnY2xpZW50LWEtY3MnLCBbY2hhbmdlc2V0VXJpXSk7XG5cdFx0Ly8gU2Vzc2lvbi1vbmx5IHN1YnNjcmliZXI6IG11c3QgTk9UIHJlY2VpdmUgY2hhbmdlc2V0IGVudmVsb3Blcy5cblx0XHRjb25zdCB0cmFuc3BvcnRCID0gY29ubmVjdENsaWVudCgnY2xpZW50LWItY3MnLCBbc2Vzc2lvblVyaV0pO1xuXG5cdFx0dHJhbnNwb3J0QS5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0dHJhbnNwb3J0Qi5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsXG5cdFx0XHRmaWxlOiB7XG5cdFx0XHRcdGlkOiAnZmlsZTovLy90ZXN0L2NoYW5nZWQudHMnLFxuXHRcdFx0XHRlZGl0OiB7XG5cdFx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy90ZXN0L2NoYW5nZWQudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC9jaGFuZ2VkLnRzJyB9IH0sXG5cdFx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBhQWN0aW9ucyA9IGZpbmROb3RpZmljYXRpb25zKHRyYW5zcG9ydEEuc2VudCwgJ2FjdGlvbicpO1xuXHRcdGNvbnN0IGJBY3Rpb25zID0gZmluZE5vdGlmaWNhdGlvbnModHJhbnNwb3J0Qi5zZW50LCAnYWN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFBY3Rpb25zLmxlbmd0aCwgMSwgJ2NoYW5nZXNldCBzdWJzY3JpYmVyIHNob3VsZCByZWNlaXZlIDEgZW52ZWxvcGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYkFjdGlvbnMubGVuZ3RoLCAwLCAnc2Vzc2lvbi1vbmx5IHN1YnNjcmliZXIgc2hvdWxkIHJlY2VpdmUgMCBjaGFuZ2VzZXQgZW52ZWxvcGVzJyk7XG5cblx0XHRjb25zdCBwYXJhbXMgPSBhQWN0aW9uc1swXS5wYXJhbXMgYXMgeyBjaGFubmVsOiBzdHJpbmc7IGFjdGlvbjogeyB0eXBlOiBzdHJpbmcgfSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHR5cGU6IHBhcmFtcy5hY3Rpb24udHlwZSwgY2hhbm5lbDogcGFyYW1zLmNoYW5uZWwgfSxcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRGaWxlU2V0LCBjaGFubmVsOiBjaGFuZ2VzZXRVcmkgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2VzZXQvY2xlYXJlZCByZWFjaGVzIGNoYW5nZXNldCBzdWJzY3JpYmVycycsICgpID0+IHtcblx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBgJHtzZXNzaW9uVXJpfS9jaGFuZ2VzZXQvc2Vzc2lvbmA7XG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0XHRzdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoY2hhbmdlc2V0VXJpKTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1jbGVhcicsIFtjaGFuZ2VzZXRVcmldKTtcblx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5nZXNldFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRDbGVhcmVkLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGZpbmROb3RpZmljYXRpb25zKHRyYW5zcG9ydC5zZW50LCAnYWN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBwYXJhbXMgPSBhY3Rpb25zWzBdLnBhcmFtcyBhcyB7IGFjdGlvbjogeyB0eXBlOiBzdHJpbmcgfSB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJhbXMuYWN0aW9uLnR5cGUsIEFjdGlvblR5cGUuQ2hhbmdlc2V0Q2xlYXJlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vdGlmaWNhdGlvbnMgYXJlIGJyb2FkY2FzdCB0byBhbGwgY2xpZW50cycsICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnRBID0gY29ubmVjdENsaWVudCgnY2xpZW50LWEnKTtcblx0XHRjb25zdCB0cmFuc3BvcnRCID0gY29ubmVjdENsaWVudCgnY2xpZW50LWInKTtcblxuXHRcdHRyYW5zcG9ydEEuc2VudC5sZW5ndGggPSAwO1xuXHRcdHRyYW5zcG9ydEIuc2VudC5sZW5ndGggPSAwO1xuXG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmROb3RpZmljYXRpb25zKHRyYW5zcG9ydEEuc2VudCwgJ3Jvb3Qvc2Vzc2lvbkFkZGVkJykubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE5vdGlmaWNhdGlvbnModHJhbnNwb3J0Qi5zZW50LCAncm9vdC9zZXNzaW9uQWRkZWQnKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0U2Vzc2lvbnMgaW5jbHVkZXMgcHJvamVjdCBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudFNlcnZpY2UubGlzdGVkU2Vzc2lvbnMucHVzaCh7XG5cdFx0XHRzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaSksXG5cdFx0XHRzdGFydFRpbWU6IDEwMDAsXG5cdFx0XHRtb2RpZmllZFRpbWU6IDIwMDAsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvcHJvamVjdCcpLCBkaXNwbGF5TmFtZTogJ1Byb2plY3QnIH0sXG5cdFx0XHRzdW1tYXJ5OiAnU2Vzc2lvbiBTdW1tYXJ5Jyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1saXN0Jyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnbGlzdFNlc3Npb25zJykpO1xuXHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2U7XG5cblx0XHRjb25zdCByZXN1bHQgPSAocmVzcCBhcyB1bmtub3duIGFzIHsgcmVzdWx0OiBMaXN0U2Vzc2lvbnNSZXN1bHQgfSkucmVzdWx0O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lml0ZW1zLm1hcChpdGVtID0+IGl0ZW0ucHJvamVjdCksIFt7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvcHJvamVjdCcpLnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiAnUHJvamVjdCcgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0U2Vzc2lvbnMgb21pdHMgcHJvamVjdCBtZXRhZGF0YSB3aGVuIGFic2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudFNlcnZpY2UubGlzdGVkU2Vzc2lvbnMucHVzaCh7XG5cdFx0XHRzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaSksXG5cdFx0XHRzdGFydFRpbWU6IDEwMDAsXG5cdFx0XHRtb2RpZmllZFRpbWU6IDIwMDAsXG5cdFx0XHRzdW1tYXJ5OiAnU2Vzc2lvbiBTdW1tYXJ5Jyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1saXN0LW5vLXByb2plY3QnKTtcblx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdsaXN0U2Vzc2lvbnMnKSk7XG5cdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IChyZXNwIGFzIHVua25vd24gYXMgeyByZXN1bHQ6IExpc3RTZXNzaW9uc1Jlc3VsdCB9KS5yZXN1bHQ7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuaXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5wcm9qZWN0KSwgW3VuZGVmaW5lZF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0U2Vzc2lvbnMgc3VyZmFjZXMgdGhlIGNoYW5nZXMgc3VtbWFyeSBmcm9tIHRoZSBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudFNlcnZpY2UubGlzdGVkU2Vzc2lvbnMucHVzaCh7XG5cdFx0XHRzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaSksXG5cdFx0XHRzdGFydFRpbWU6IDEwMDAsXG5cdFx0XHRtb2RpZmllZFRpbWU6IDIwMDAsXG5cdFx0XHRzdW1tYXJ5OiAnU2Vzc2lvbiBXaXRoIENoYW5nZXNldHMnLFxuXHRcdFx0Y2hhbmdlczoge1xuXHRcdFx0XHRhZGRpdGlvbnM6IDUsXG5cdFx0XHRcdGRlbGV0aW9uczogMixcblx0XHRcdFx0ZmlsZXM6IDMsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWxpc3QtY2hhbmdlc2V0cycpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2xpc3RTZXNzaW9ucycpKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gKHJlc3AgYXMgdW5rbm93biBhcyB7IHJlc3VsdDogTGlzdFNlc3Npb25zUmVzdWx0IH0pLnJlc3VsdDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5pdGVtc1swXS5jaGFuZ2VzLCB7XG5cdFx0XHRhZGRpdGlvbnM6IDUsXG5cdFx0XHRkZWxldGlvbnM6IDIsXG5cdFx0XHRmaWxlczogMyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGlzdFNlc3Npb25zIGNhcnJpZXMgdGhlIHdvcmtzcGFjZS1sZXNzIG1hcmtlciBvbiBfbWV0YScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiB0aGUgY2xpZW50IHJlc29sdmVzIGEgc2Vzc2lvbidzIGtpbmQgKHF1aWNrIGNoYXQgdnMuXG5cdFx0Ly8gd29ya3NwYWNlKSBmcm9tIGBfbWV0YS53b3Jrc3BhY2VsZXNzYCwgYW5kIGEgbGlzdGluZyBpcyB0aGUgZmlyc3Rcblx0XHQvLyB0aGluZyBpdCBzZWVzIGFmdGVyIGEgd2luZG93IHJlbG9hZC5cblx0XHQvLyBEcm9wcGluZyBgX21ldGFgIGhlcmUgbWFkZSBldmVyeSByZXN0b3JlZCBxdWljayBjaGF0IGxvb2tcblx0XHQvLyB3b3Jrc3BhY2UtYm91bmQgYW5kIGxlYWsgdGhlIGhvc3QncyBzY3JhdGNoIGN3ZCBhcyBhIHdvcmtzcGFjZSBmb2xkZXIuXG5cdFx0YWdlbnRTZXJ2aWNlLmxpc3RlZFNlc3Npb25zLnB1c2goe1xuXHRcdFx0c2Vzc2lvbjogVVJJLnBhcnNlKHNlc3Npb25VcmkpLFxuXHRcdFx0c3RhcnRUaW1lOiAxMDAwLFxuXHRcdFx0bW9kaWZpZWRUaW1lOiAyMDAwLFxuXHRcdFx0c3VtbWFyeTogJ1F1aWNrIENoYXQnLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy9ob21lL3VzZXIvLmNvcGlsb3QvY2hhdHMvc2Vzc2lvbi0xJyldLFxuXHRcdFx0X21ldGE6IHdpdGhTZXNzaW9uV29ya3NwYWNlbGVzcyh1bmRlZmluZWQsIHRydWUpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWxpc3Qtd29ya3NwYWNlbGVzcycpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2xpc3RTZXNzaW9ucycpKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gKHJlc3AgYXMgdW5rbm93biBhcyB7IHJlc3VsdDogTGlzdFNlc3Npb25zUmVzdWx0IH0pLnJlc3VsdDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5pdGVtcy5tYXAoaXRlbSA9PiByZWFkU2Vzc2lvbldvcmtzcGFjZWxlc3MoaXRlbS5fbWV0YSkpLCBbdHJ1ZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0U2Vzc2lvbnMgY2FycmllcyBleHRlcm5hbCBwcm92ZW5hbmNlIG9uIF9tZXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50U2VydmljZS5saXN0ZWRTZXNzaW9ucy5wdXNoKHtcblx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpKSxcblx0XHRcdHN0YXJ0VGltZTogMTAwMCxcblx0XHRcdG1vZGlmaWVkVGltZTogMjAwMCxcblx0XHRcdHN1bW1hcnk6ICdOYXRpdmUgQ2hhdCcsXG5cdFx0XHRfbWV0YTogd2l0aFNlc3Npb25FeHRlcm5hbCh1bmRlZmluZWQsIHRydWUpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWxpc3QtZXh0ZXJuYWwnKTtcblx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnbGlzdFNlc3Npb25zJykpO1xuXHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2U7XG5cblx0XHRjb25zdCByZXN1bHQgPSAocmVzcCBhcyB1bmtub3duIGFzIHsgcmVzdWx0OiBMaXN0U2Vzc2lvbnNSZXN1bHQgfSkucmVzdWx0O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lml0ZW1zLm1hcChpdGVtID0+IHJlYWRTZXNzaW9uRXh0ZXJuYWwoaXRlbS5fbWV0YSkpLCBbdHJ1ZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0U2Vzc2lvbnMgb21pdHMgX21ldGEgd2hlbiB0aGUgYWdlbnQgcHJvdmlkZXMgbm9uZScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUaGUgd2lyZSBpdGVtIGlzIGJ1aWx0IGZpZWxkIGJ5IGZpZWxkIGFuZCBgc2F0aXNmaWVzIFNlc3Npb25TdW1tYXJ5YFxuXHRcdC8vIGNhbm5vdCBjYXRjaCBhIGRyb3BwZWQgb3B0aW9uYWwsIHNvIHBpbiB0aGUgYWJzZW50IGNhc2UgdG9vOiBhXG5cdFx0Ly8gbGlzdGluZyBtdXN0IG5vdCBzdGFydCBtYW51ZmFjdHVyaW5nIGFuIGVtcHR5IGBfbWV0YWAgYmFnIHRoYXQgbGF0ZXJcblx0XHQvLyBvdmVyd3JpdGVzIGEgcmljaGVyIG9uZSBvbiB0aGUgY2xpZW50LlxuXHRcdGFnZW50U2VydmljZS5saXN0ZWRTZXNzaW9ucy5wdXNoKHtcblx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpKSxcblx0XHRcdHN0YXJ0VGltZTogMTAwMCxcblx0XHRcdG1vZGlmaWVkVGltZTogMjAwMCxcblx0XHRcdHN1bW1hcnk6ICdTZXNzaW9uIFN1bW1hcnknLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWxpc3Qtbm8tbWV0YScpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2xpc3RTZXNzaW9ucycpKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gKHJlc3AgYXMgdW5rbm93biBhcyB7IHJlc3VsdDogTGlzdFNlc3Npb25zUmVzdWx0IH0pLnJlc3VsdDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5pdGVtcy5tYXAoaXRlbSA9PiBpdGVtLl9tZXRhKSwgW3VuZGVmaW5lZF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVTZXNzaW9uIGZvcndhcmRzIHJlcXVlc3QgbWV0YWRhdGEgYW5kIGJyb2FkY2FzdHMgcHJvamVjdCBpbiBzZXNzaW9uQWRkZWQgc3VtbWFyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtY3JlYXRlJyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblxuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSBVUkkucGFyc2UoJ2NvcGlsb3Q6Ly8vY3JlYXRlZC1zZXNzaW9uJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBfbWV0YSA9IHsgbXVsdGlSb290OiB7IHdvcmtzcGFjZUZpbGU6ICdmaWxlOi8vL2RlbW8uY29kZS13b3Jrc3BhY2UnIH0gfTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2NyZWF0ZVNlc3Npb24nLCB7IGNoYW5uZWw6IG5ld1Nlc3Npb24sIF9tZXRhIH0pKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0Y29uc3QgYWRkZWQgPSBmaW5kTm90aWZpY2F0aW9ucyh0cmFuc3BvcnQuc2VudCwgJ3Jvb3Qvc2Vzc2lvbkFkZGVkJylbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQ6IChyZXNwIGFzIHsgcmVzdWx0OiBudWxsIH0pLnJlc3VsdCxcblx0XHRcdHByb2plY3Q6IChhZGRlZCEucGFyYW1zIGFzIFNlc3Npb25BZGRlZFBhcmFtcykuc3VtbWFyeS5wcm9qZWN0LFxuXHRcdFx0X21ldGE6IGFnZW50U2VydmljZS5jcmVhdGVTZXNzaW9uQ29uZmlncy5hdCgtMSk/Ll9tZXRhLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDogbnVsbCxcblx0XHRcdHByb2plY3Q6IHsgdXJpOiAnZmlsZTovLy9jcmVhdGVkLXByb2plY3QnLCBkaXNwbGF5TmFtZTogJ0NyZWF0ZWQgUHJvamVjdCcgfSxcblx0XHRcdF9tZXRhLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVTZXNzaW9uIHJlamVjdHMgYSBmb3JrIHRhcmdldGluZyBpdHMgc291cmNlIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LXNlbGYtZm9yaycpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IFVSSS5wYXJzZSgnY29waWxvdDovLy9zYW1lLXNlc3Npb24nKS50b1N0cmluZygpO1xuXG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdjcmVhdGVTZXNzaW9uJywge1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvbixcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRmb3JrOiB7IHNlc3Npb24sIHR1cm5JZDogJ3R1cm4tMScgfSxcblx0XHR9KSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXNwb25zZVByb21pc2UgYXMgeyBlcnJvcj86IHsgY29kZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmcgfSB9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlcnJvckNvZGU6IHJlc3BvbnNlLmVycm9yPy5jb2RlLFxuXHRcdFx0ZXJyb3JNZXNzYWdlOiByZXNwb25zZS5lcnJvcj8ubWVzc2FnZSxcblx0XHRcdGNyZWF0ZUNhbGxzOiBhZ2VudFNlcnZpY2UuY3JlYXRlU2Vzc2lvbkNvbmZpZ3MubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdGVycm9yQ29kZTogQWhwRXJyb3JDb2Rlcy5TZXNzaW9uQWxyZWFkeUV4aXN0cyxcblx0XHRcdGVycm9yTWVzc2FnZTogYEZvcmsgdGFyZ2V0IHNlc3Npb24gbXVzdCBkaWZmZXIgZnJvbSBzb3VyY2Ugc2Vzc2lvbjogJHtzZXNzaW9ufWAsXG5cdFx0XHRjcmVhdGVDYWxsczogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbklkbGUgd2FpdHMgZm9yIGluLWZsaWdodCBwcm90b2NvbCByZXF1ZXN0cyBhZnRlciBkaXNwb3NhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtZHJhaW4nKTtcblx0XHRhZ2VudFNlcnZpY2UuY3JlYXRlU2Vzc2lvbkJhcnJpZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IFVSSS5wYXJzZSgnY29waWxvdDovLy9kcmFpbi1zZXNzaW9uJykudG9TdHJpbmcoKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2NyZWF0ZVNlc3Npb24nLCB7IGNoYW5uZWw6IG5ld1Nlc3Npb24gfSkpO1xuXHRcdGhhbmRsZXIuZGlzcG9zZSgpO1xuXHRcdGxldCBpZGxlID0gZmFsc2U7XG5cdFx0Y29uc3Qgd2hlbklkbGUgPSBoYW5kbGVyLndoZW5JZGxlKCkudGhlbigoKSA9PiBpZGxlID0gdHJ1ZSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRjb25zdCBpZGxlV2hpbGVSZXF1ZXN0UGVuZGluZyA9IGlkbGU7XG5cdFx0YWdlbnRTZXJ2aWNlLmNyZWF0ZVNlc3Npb25CYXJyaWVyLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgd2hlbklkbGU7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlkbGVXaGlsZVJlcXVlc3RQZW5kaW5nLFxuXHRcdFx0aWRsZUFmdGVyUmVxdWVzdDogaWRsZSxcblx0XHR9LCB7XG5cdFx0XHRpZGxlV2hpbGVSZXF1ZXN0UGVuZGluZzogZmFsc2UsXG5cdFx0XHRpZGxlQWZ0ZXJSZXF1ZXN0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuSWRsZSB3YWl0cyBmb3IgcmVjb25uZWN0IHN1YnNjcmlwdGlvbiByZXN0b3JhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0Y29uc3QgaW5pdGlhbFRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1kcmFpbi1yZWNvbm5lY3QnLCBbc2Vzc2lvblVyaV0pO1xuXHRcdGNvbnN0IGluaXRpYWxSZXNwb25zZSA9IGZpbmRSZXNwb25zZShpbml0aWFsVHJhbnNwb3J0LnNlbnQsIDEpIGFzIHsgcmVzdWx0OiBJbml0aWFsaXplUmVzdWx0IH07XG5cdFx0aW5pdGlhbFRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0YWdlbnRTZXJ2aWNlLnN1YnNjcmliZUJhcnJpZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0XHRjb25zdCByZWNvbm5lY3RUcmFuc3BvcnQgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbihyZWNvbm5lY3RUcmFuc3BvcnQpO1xuXHRcdHJlY29ubmVjdFRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAncmVjb25uZWN0Jywge1xuXHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtZHJhaW4tcmVjb25uZWN0Jyxcblx0XHRcdGxhc3RTZWVuU2VydmVyU2VxOiBpbml0aWFsUmVzcG9uc2UucmVzdWx0LnNlcnZlclNlcSxcblx0XHRcdHN1YnNjcmlwdGlvbnM6IFtzZXNzaW9uVXJpXSxcblx0XHR9KSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0bGV0IGlkbGUgPSBmYWxzZTtcblx0XHRjb25zdCB3aGVuSWRsZSA9IGhhbmRsZXIud2hlbklkbGUoKS50aGVuKCgpID0+IGlkbGUgPSB0cnVlKTtcblxuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGNvbnN0IGlkbGVXaGlsZVJlc3RvcmluZyA9IGlkbGU7XG5cdFx0YWdlbnRTZXJ2aWNlLnN1YnNjcmliZUJhcnJpZXIuY29tcGxldGUoKTtcblx0XHRhd2FpdCB3aGVuSWRsZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aWRsZVdoaWxlUmVzdG9yaW5nLFxuXHRcdFx0aWRsZUFmdGVyUmVzdG9yZTogaWRsZSxcblx0XHR9LCB7XG5cdFx0XHRpZGxlV2hpbGVSZXN0b3Jpbmc6IGZhbHNlLFxuXHRcdFx0aWRsZUFmdGVyUmVzdG9yZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NyZWF0ZUNoYXQgLyBkaXNwb3NlQ2hhdCcsICgpID0+IHtcblx0XHRjb25zdCBwZWVyQ2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0xJyk7XG5cblx0XHR0ZXN0KCdjcmVhdGVDaGF0IG9uIHRoZSBkZWZhdWx0IGNoYXQgVVJJIGlzIGEgbm8tb3AnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtY2MnKTtcblx0XHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblxuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdjcmVhdGVDaGF0JywgeyBjaGFubmVsOiBzZXNzaW9uVXJpLCBjaGF0OiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpIH0pKTtcblx0XHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2U7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQ6IChyZXNwIGFzIHsgcmVzdWx0OiBudWxsIH0pLnJlc3VsdCxcblx0XHRcdFx0Y3JlYXRlZDogYWdlbnRTZXJ2aWNlLmNyZWF0ZWRDaGF0cyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzdWx0OiBudWxsLFxuXHRcdFx0XHRjcmVhdGVkOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlQ2hhdCBmb3IgYW4gYWRkaXRpb25hbCBjaGF0IGZvcndhcmRzIHRvIHRoZSBhZ2VudCBzZXJ2aWNlIGFuZCBncm93cyB0aGUgY2F0YWxvZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1jYycpO1xuXHRcdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2NyZWF0ZUNoYXQnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmksIGNoYXQ6IHBlZXJDaGF0IH0pKTtcblx0XHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2U7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQ6IChyZXNwIGFzIHsgcmVzdWx0OiBudWxsIH0pLnJlc3VsdCxcblx0XHRcdFx0Y3JlYXRlZDogYWdlbnRTZXJ2aWNlLmNyZWF0ZWRDaGF0cyxcblx0XHRcdFx0aW5DYXRhbG9nOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5jaGF0cy5zb21lKGMgPT4gYy5yZXNvdXJjZSA9PT0gcGVlckNoYXQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXN1bHQ6IG51bGwsXG5cdFx0XHRcdGNyZWF0ZWQ6IFt7IHNlc3Npb246IHNlc3Npb25VcmksIGNoYXQ6IHBlZXJDaGF0IH1dLFxuXHRcdFx0XHRpbkNhdGFsb2c6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZUNoYXQgZm9yd2FyZHMgYSBmb3JrIHNvdXJjZSB0byB0aGUgYWdlbnQgc2VydmljZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1jYycpO1xuXHRcdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2NyZWF0ZUNoYXQnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRcdGNoYXQ6IHBlZXJDaGF0LFxuXHRcdFx0XHRzb3VyY2U6IHsga2luZDogQ2hhdFNvdXJjZUtpbmQuRm9yaywgY2hhdDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSwgdHVybklkOiAndHVybi0xJyB9LFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlc3VsdDogKHJlc3AgYXMgeyByZXN1bHQ6IG51bGwgfSkucmVzdWx0LFxuXHRcdFx0XHRjcmVhdGVkOiBhZ2VudFNlcnZpY2UuY3JlYXRlZENoYXRzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXN1bHQ6IG51bGwsXG5cdFx0XHRcdGNyZWF0ZWQ6IFt7XG5cdFx0XHRcdFx0c2Vzc2lvbjogc2Vzc2lvblVyaSxcblx0XHRcdFx0XHRjaGF0OiBwZWVyQ2hhdCxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRmb3JrOiB7IHNvdXJjZTogVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpLCB0dXJuSWQ6ICd0dXJuLTEnIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZUNoYXQgcmVqZWN0cyBhIHNvdXJjZSB3aXRob3V0IGtpbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtY2MnKTtcblx0XHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblxuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdjcmVhdGVDaGF0Jywge1xuXHRcdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLFxuXHRcdFx0XHRjaGF0OiBwZWVyQ2hhdCxcblx0XHRcdFx0c291cmNlOiB7XG5cdFx0XHRcdFx0Y2hhdDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSxcblx0XHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZSBhcyB7IGVycm9yPzogeyBjb2RlOiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZyB9IH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjb2RlOiByZXNwLmVycm9yPy5jb2RlLFxuXHRcdFx0XHRtZXNzYWdlOiByZXNwLmVycm9yPy5tZXNzYWdlLFxuXHRcdFx0XHRjcmVhdGVkOiBhZ2VudFNlcnZpY2UuY3JlYXRlZENoYXRzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjb2RlOiBKc29uUnBjRXJyb3JDb2Rlcy5JbnZhbGlkUGFyYW1zLFxuXHRcdFx0XHRtZXNzYWdlOiAnVW5zdXBwb3J0ZWQgY3JlYXRlQ2hhdCBzb3VyY2Uga2luZDogdW5kZWZpbmVkJyxcblx0XHRcdFx0Y3JlYXRlZDogW10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZUNoYXQgZm9yd2FyZHMgYSBzaWRlIGNoYXQgc291cmNlIHRvIHRoZSBhZ2VudCBzZXJ2aWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWNjJyk7XG5cdFx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnY3JlYXRlQ2hhdCcsIHtcblx0XHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdFx0Y2hhdDogcGVlckNoYXQsXG5cdFx0XHRcdHNvdXJjZToge1xuXHRcdFx0XHRcdGtpbmQ6IENoYXRTb3VyY2VLaW5kLlNpZGVDaGF0LFxuXHRcdFx0XHRcdGNoYXQ6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHRcdFx0dHVybklkOiAndHVybi1hY3RpdmUnLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjogeyB0ZXh0OiAnICBzZWxlY3RlZCB0ZXh0ICAnLCByZXNwb25zZVBhcnRJZDogJ3Jlc3BvbnNlLXBhcnQtMScgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2U7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQ6IChyZXNwIGFzIHsgcmVzdWx0OiBudWxsIH0pLnJlc3VsdCxcblx0XHRcdFx0Y3JlYXRlZDogYWdlbnRTZXJ2aWNlLmNyZWF0ZWRDaGF0cyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzdWx0OiBudWxsLFxuXHRcdFx0XHRjcmVhdGVkOiBbe1xuXHRcdFx0XHRcdHNlc3Npb246IHNlc3Npb25VcmksXG5cdFx0XHRcdFx0Y2hhdDogcGVlckNoYXQsXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0c2lkZUNoYXQ6IHsgc291cmNlOiBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSksIHR1cm5JZDogJ3R1cm4tYWN0aXZlJywgc2VsZWN0aW9uOiB7IHRleHQ6ICcgIHNlbGVjdGVkIHRleHQgICcsIHJlc3BvbnNlUGFydElkOiAncmVzcG9uc2UtcGFydC0xJyB9IH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZUNoYXQgcmVqZWN0cyBhbiB1bmtub3duIHNvdXJjZSBraW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWNjJyk7XG5cdFx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnY3JlYXRlQ2hhdCcsIHtcblx0XHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdFx0Y2hhdDogcGVlckNoYXQsXG5cdFx0XHRcdHNvdXJjZToge1xuXHRcdFx0XHRcdGtpbmQ6ICd1bmtub3duJyxcblx0XHRcdFx0XHRjaGF0OiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpLFxuXHRcdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlIGFzIHsgZXJyb3I/OiB7IGNvZGU6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nIH0gfTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNvZGU6IHJlc3AuZXJyb3I/LmNvZGUsXG5cdFx0XHRcdG1lc3NhZ2U6IHJlc3AuZXJyb3I/Lm1lc3NhZ2UsXG5cdFx0XHRcdGNyZWF0ZWQ6IGFnZW50U2VydmljZS5jcmVhdGVkQ2hhdHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvZGU6IEpzb25ScGNFcnJvckNvZGVzLkludmFsaWRQYXJhbXMsXG5cdFx0XHRcdG1lc3NhZ2U6ICdVbnN1cHBvcnRlZCBjcmVhdGVDaGF0IHNvdXJjZSBraW5kOiB1bmtub3duJyxcblx0XHRcdFx0Y3JlYXRlZDogW10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZUNoYXQgZm9yIGFuIHVua25vd24gc2Vzc2lvbiBmYWlscyB3aXRoIFNFU1NJT05fTk9UX0ZPVU5EJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWNjJyk7XG5cdFx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnY3JlYXRlQ2hhdCcsIHsgY2hhbm5lbDogJ2NvcGlsb3Q6L21pc3NpbmcnLCBjaGF0OiBidWlsZENoYXRVcmkoJ2NvcGlsb3Q6L21pc3NpbmcnLCAncGVlci0xJykgfSkpO1xuXHRcdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZSBhcyB7IGVycm9yPzogeyBjb2RlOiBudW1iZXIgfSB9O1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcC5lcnJvcj8uY29kZSwgQUhQX1NFU1NJT05fTk9UX0ZPVU5EKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2VDaGF0IGZvcndhcmRzIHRvIHRoZSBhZ2VudCBzZXJ2aWNlIGFuZCBzaHJpbmtzIHRoZSBjYXRhbG9nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQpO1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWNjJyk7XG5cdFx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnZGlzcG9zZUNoYXQnLCB7IGNoYW5uZWw6IHBlZXJDaGF0IH0pKTtcblx0XHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2U7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQ6IChyZXNwIGFzIHsgcmVzdWx0OiBudWxsIH0pLnJlc3VsdCxcblx0XHRcdFx0ZGlzcG9zZWQ6IGFnZW50U2VydmljZS5kaXNwb3NlZENoYXRzLFxuXHRcdFx0XHRpbkNhdGFsb2c6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmNoYXRzLnNvbWUoYyA9PiBjLnJlc291cmNlID09PSBwZWVyQ2hhdCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc3VsdDogbnVsbCxcblx0XHRcdFx0ZGlzcG9zZWQ6IFt7IHNlc3Npb246IHNlc3Npb25VcmksIGNoYXQ6IHBlZXJDaGF0IH1dLFxuXHRcdFx0XHRpbkNhdGFsb2c6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29ubmVjdCByZXBsYXlzIG1pc3NlZCBhY3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQxID0gY29ubmVjdENsaWVudCgnY2xpZW50LXInLCBbc2Vzc2lvblVyaV0pO1xuXHRcdGNvbnN0IHJlc3AgPSBmaW5kUmVzcG9uc2UodHJhbnNwb3J0MS5zZW50LCAxKTtcblx0XHRjb25zdCBpbml0U2VxID0gKHJlc3AgYXMgeyByZXN1bHQ6IEluaXRpYWxpemVSZXN1bHQgfSkucmVzdWx0LnNlcnZlclNlcTtcblx0XHR0cmFuc3BvcnQxLnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdUaXRsZSBBJyB9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnVGl0bGUgQicgfSk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQyID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0Mik7XG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcFByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0MiwgMSk7XG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAncmVjb25uZWN0Jywge1xuXHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtcicsXG5cdFx0XHRsYXN0U2VlblNlcnZlclNlcTogaW5pdFNlcSxcblx0XHRcdHN1YnNjcmlwdGlvbnM6IFtzZXNzaW9uVXJpXSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZWNvbm5lY3RSZXNwID0gYXdhaXQgcmVjb25uZWN0UmVzcFByb21pc2U7XG5cdFx0Y29uc3QgcmVzdWx0ID0gKHJlY29ubmVjdFJlc3AgYXMgeyByZXN1bHQ6IFJlY29ubmVjdFJlc3VsdCB9KS5yZXN1bHQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50eXBlLCAncmVwbGF5Jyk7XG5cdFx0aWYgKHJlc3VsdC50eXBlID09PSAncmVwbGF5Jykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hY3Rpb25zLmxlbmd0aCwgMik7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3QgcmVqZWN0cyBhIGNsaWVudCB0aGUgc2VydmVyIG5vIGxvbmdlciByZW1lbWJlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0KTtcblx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAxKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ3JlY29ubmVjdCcsIHtcblx0XHRcdGNsaWVudElkOiAnZm9yZ290dGVuLWNsaWVudCcsXG5cdFx0XHRsYXN0U2VlblNlcnZlclNlcTogMCxcblx0XHRcdHN1YnNjcmlwdGlvbnM6IFtdLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKHJlc3BvbnNlIGFzIHsgZXJyb3I6IHsgY29kZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmcgfSB9KS5lcnJvciwge1xuXHRcdFx0Y29kZTogQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCxcblx0XHRcdG1lc3NhZ2U6ICdSZWNvbm5lY3QgY2xpZW50IG5vdCBmb3VuZDogZm9yZ290dGVuLWNsaWVudCcsXG5cdFx0fSk7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlQ2xvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmV0YWlucyBjbGllbnQgaW5mbyBmb3IgYWN0aW9uIGF0dHJpYnV0aW9uIGFjcm9zcyByZWNvbm5lY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0MSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1hdHRyaWJ1dGlvbicsIHVuZGVmaW5lZCwgYWdlbnRzV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbywge1xuXHRcdFx0J3ZzY29kZS5jbGllbnRDb25uZWN0aW9uS2luZCc6IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kLkRldlR1bm5lbCxcblx0XHRcdCd2c2NvZGUuY2xpZW50TWFjaGluZUlkJzogJ2NsaWVudC1tYWNoaW5lLWlkJyxcblx0XHRcdCd2c2NvZGUuY2xpZW50RGV2RGV2aWNlSWQnOiAnY2xpZW50LWRldi1kZXZpY2UtaWQnLFxuXHRcdH0pO1xuXHRcdHRyYW5zcG9ydDEuc2ltdWxhdGVNZXNzYWdlKG5vdGlmaWNhdGlvbignZGlzcGF0Y2hBY3Rpb24nLCB7XG5cdFx0XHRjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLFxuXHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsIGNvbmZpZzoge30gfSxcblx0XHR9KSk7XG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQyID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0Mik7XG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcFByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0MiwgMik7XG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAncmVjb25uZWN0Jywge1xuXHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtYXR0cmlidXRpb24nLFxuXHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IHN0YXRlTWFuYWdlci5zZXJ2ZXJTZXEsXG5cdFx0XHRzdWJzY3JpcHRpb25zOiBbXSxcblx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdCd2c2NvZGUuY2xpZW50TWFjaGluZUlkJzogJ2NsaWVudC1tYWNoaW5lLWlkJyxcblx0XHRcdFx0J3ZzY29kZS5jbGllbnREZXZEZXZpY2VJZCc6ICdjbGllbnQtZGV2LWRldmljZS1pZCcsXG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHRhd2FpdCByZWNvbm5lY3RSZXNwUHJvbWlzZTtcblx0XHR0cmFuc3BvcnQyLnNpbXVsYXRlTWVzc2FnZShub3RpZmljYXRpb24oJ2Rpc3BhdGNoQWN0aW9uJywge1xuXHRcdFx0Y2hhbm5lbDogJ2FocC1yb290Oi8vJyxcblx0XHRcdGNsaWVudFNlcTogMixcblx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLCBjb25maWc6IHt9IH0sXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjbGllbnRUeXBlczogYWdlbnRTZXJ2aWNlLmhhbmRsZWRDbGllbnRUeXBlcyxcblx0XHRcdGNvbm5lY3Rpb25LaW5kczogYWdlbnRTZXJ2aWNlLmhhbmRsZWRDbGllbnRDb250ZXh0cy5tYXAoY29udGV4dCA9PiBjb250ZXh0Py5jb25uZWN0aW9uS2luZCksXG5cdFx0XHRtYWNoaW5lSWRzOiBhZ2VudFNlcnZpY2UuaGFuZGxlZENsaWVudENvbnRleHRzLm1hcChjb250ZXh0ID0+IGNvbnRleHQ/Lm1hY2hpbmVJZCksXG5cdFx0XHRkZXZEZXZpY2VJZHM6IGFnZW50U2VydmljZS5oYW5kbGVkQ2xpZW50Q29udGV4dHMubWFwKGNvbnRleHQgPT4gY29udGV4dD8uZGV2RGV2aWNlSWQpLFxuXHRcdH0sIHtcblx0XHRcdGNsaWVudFR5cGVzOiBbJ2FnZW50c193aW5kb3cnLCAnYWdlbnRzX3dpbmRvdyddLFxuXHRcdFx0Y29ubmVjdGlvbktpbmRzOiBbJ2Rldl90dW5uZWwnLCAnZGV2X3R1bm5lbCddLFxuXHRcdFx0bWFjaGluZUlkczogWydjbGllbnQtbWFjaGluZS1pZCcsICdjbGllbnQtbWFjaGluZS1pZCddLFxuXHRcdFx0ZGV2RGV2aWNlSWRzOiBbJ2NsaWVudC1kZXYtZGV2aWNlLWlkJywgJ2NsaWVudC1kZXYtZGV2aWNlLWlkJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJldGFpbiBjbGllbnQgdGVsZW1ldHJ5IGlkZW50aXR5IHdoZW4gcmVjb25uZWN0IG9taXRzIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydDEgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtY29uc2VudCcsIHVuZGVmaW5lZCwgYWdlbnRzV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbywge1xuXHRcdFx0J3ZzY29kZS5jbGllbnRNYWNoaW5lSWQnOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0J3ZzY29kZS5jbGllbnREZXZEZXZpY2VJZCc6ICdjbGllbnQtZGV2LWRldmljZS1pZCcsXG5cdFx0fSk7XG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQyID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0Mik7XG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcFByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0MiwgMik7XG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAncmVjb25uZWN0Jywge1xuXHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtY29uc2VudCcsXG5cdFx0XHRsYXN0U2VlblNlcnZlclNlcTogc3RhdGVNYW5hZ2VyLnNlcnZlclNlcSxcblx0XHRcdHN1YnNjcmlwdGlvbnM6IFtdLFxuXHRcdH0pKTtcblx0XHRhd2FpdCByZWNvbm5lY3RSZXNwUHJvbWlzZTtcblx0XHR0cmFuc3BvcnQyLnNpbXVsYXRlTWVzc2FnZShub3RpZmljYXRpb24oJ2Rpc3BhdGNoQWN0aW9uJywge1xuXHRcdFx0Y2hhbm5lbDogJ2FocC1yb290Oi8vJyxcblx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLCBjb25maWc6IHt9IH0sXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudFNlcnZpY2UuaGFuZGxlZENsaWVudENvbnRleHRzLmF0KC0xKSwge1xuXHRcdFx0Y2xpZW50VHlwZTogJ2FnZW50c193aW5kb3cnLFxuXHRcdFx0Y29ubmVjdGlvbktpbmQ6ICd1bmtub3duJyxcblx0XHRcdHRyYW5zcG9ydEtpbmQ6ICd1bmtub3duJyxcblx0XHRcdGhvc3RMYXVuY2hLaW5kOiAndnNjb2RlX21haW5fcHJvY2VzcycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F0dHJpYnV0ZXMgdGVsZW1ldHJ5IGlkZW50aXR5IGluZGVwZW5kZW50bHkgZm9yIGNvbmN1cnJlbnQgY2xpZW50cycsICgpID0+IHtcblx0XHRjb25zdCBjbGllbnRzID0gW1xuXHRcdFx0Y29ubmVjdENsaWVudCgnY2xpZW50LWEnLCB1bmRlZmluZWQsIGFnZW50c1dpbmRvd0FnZW50SG9zdENsaWVudEluZm8sIHtcblx0XHRcdFx0J3ZzY29kZS5jbGllbnRNYWNoaW5lSWQnOiAnbWFjaGluZS1hJyxcblx0XHRcdFx0J3ZzY29kZS5jbGllbnREZXZEZXZpY2VJZCc6ICdkZXZpY2UtYScsXG5cdFx0XHR9KSxcblx0XHRcdGNvbm5lY3RDbGllbnQoJ2NsaWVudC1iJywgdW5kZWZpbmVkLCBlZGl0b3JXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvLCB7XG5cdFx0XHRcdCd2c2NvZGUuY2xpZW50TWFjaGluZUlkJzogJ21hY2hpbmUtYicsXG5cdFx0XHRcdCd2c2NvZGUuY2xpZW50RGV2RGV2aWNlSWQnOiAnZGV2aWNlLWInLFxuXHRcdFx0fSksXG5cdFx0XTtcblxuXHRcdGZvciAoY29uc3QgY2xpZW50IG9mIGNsaWVudHMpIHtcblx0XHRcdGNsaWVudC5zaW11bGF0ZU1lc3NhZ2Uobm90aWZpY2F0aW9uKCdkaXNwYXRjaEFjdGlvbicsIHtcblx0XHRcdFx0Y2hhbm5lbDogJ2FocC1yb290Oi8vJyxcblx0XHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCwgY29uZmlnOiB7fSB9LFxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRTZXJ2aWNlLmhhbmRsZWRDbGllbnRDb250ZXh0cy5tYXAoY29udGV4dCA9PiAoe1xuXHRcdFx0Y2xpZW50VHlwZTogY29udGV4dD8uY2xpZW50VHlwZSxcblx0XHRcdG1hY2hpbmVJZDogY29udGV4dD8ubWFjaGluZUlkLFxuXHRcdFx0ZGV2RGV2aWNlSWQ6IGNvbnRleHQ/LmRldkRldmljZUlkLFxuXHRcdH0pKSwgW3tcblx0XHRcdGNsaWVudFR5cGU6ICdhZ2VudHNfd2luZG93Jyxcblx0XHRcdG1hY2hpbmVJZDogJ21hY2hpbmUtYScsXG5cdFx0XHRkZXZEZXZpY2VJZDogJ2RldmljZS1hJyxcblx0XHR9LCB7XG5cdFx0XHRjbGllbnRUeXBlOiAnZWRpdG9yX3dpbmRvdycsXG5cdFx0XHRtYWNoaW5lSWQ6ICdtYWNoaW5lLWInLFxuXHRcdFx0ZGV2RGV2aWNlSWQ6ICdkZXZpY2UtYicsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIGNsaWVudCB0b3BvbG9neSBhbmQgYXR0cmlidXRlcyBhY3Rpb25zIHRvIHRoZSBpbml0aWF0aW5nIGNvbm5lY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydChBZ2VudEhvc3RUcmFuc3BvcnRLaW5kLldlYlNvY2tldCk7XG5cdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQpO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAnaW5pdGlhbGl6ZScsIHtcblx0XHRcdHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSxcblx0XHRcdGNsaWVudElkOiAndHVubmVsLWNsaWVudCcsXG5cdFx0XHRjbGllbnRJbmZvOiB7IG5hbWU6ICd2c2NvZGUtYWdlbnRzLXdpbmRvdycsIHZlcnNpb246ICcxLjIuMycsIHRpdGxlOiAnVlMgQ29kZSBBZ2VudHMgV2luZG93JyB9LFxuXHRcdFx0X21ldGE6IHtcblx0XHRcdFx0J3ZzY29kZS5jbGllbnRDb25uZWN0aW9uS2luZCc6IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kLkRldlR1bm5lbCxcblx0XHRcdFx0J3ZzY29kZS5jbGllbnRNYWNoaW5lSWQnOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0XHQndnNjb2RlLmNsaWVudERldkRldmljZUlkJzogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2Uobm90aWZpY2F0aW9uKCdkaXNwYXRjaEFjdGlvbicsIHtcblx0XHRcdGNoYW5uZWw6ICdhaHAtcm9vdDovLycsXG5cdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCwgY29uZmlnOiB7fSB9LFxuXHRcdH0pKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXG5cdFx0Y29uc3QgY29ubmVjdGlvbkV2ZW50cyA9IHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLm1hcChldmVudCA9PiB7XG5cdFx0XHRjb25zdCBkYXRhID0gZXZlbnQuZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmV2ZW50LFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0Li4uZGF0YSxcblx0XHRcdFx0XHRjb25uZWN0aW9uRHVyYXRpb25NczogdHlwZW9mIGRhdGEuY29ubmVjdGlvbkR1cmF0aW9uTXMsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2xpZW50Q29udGV4dDogYWdlbnRTZXJ2aWNlLmhhbmRsZWRDbGllbnRDb250ZXh0cy5hdCgtMSksXG5cdFx0XHRjb25uZWN0aW9uRXZlbnRzLFxuXHRcdH0sIHtcblx0XHRcdGNsaWVudENvbnRleHQ6IHtcblx0XHRcdFx0Y2xpZW50VHlwZTogJ2FnZW50c193aW5kb3cnLFxuXHRcdFx0XHRjb25uZWN0aW9uS2luZDogJ2Rldl90dW5uZWwnLFxuXHRcdFx0XHR0cmFuc3BvcnRLaW5kOiAnd2Vic29ja2V0Jyxcblx0XHRcdFx0aG9zdExhdW5jaEtpbmQ6ICd2c2NvZGVfbWFpbl9wcm9jZXNzJyxcblx0XHRcdFx0bWFjaGluZUlkOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0XHRkZXZEZXZpY2VJZDogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHRcdH0sXG5cdFx0XHRjb25uZWN0aW9uRXZlbnRzOiBbe1xuXHRcdFx0XHRldmVudE5hbWU6ICdhZ2VudEhvc3QuY2xpZW50Q29ubmVjdGlvbicsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRhY3Rpb246ICdjb25uZWN0ZWQnLFxuXHRcdFx0XHRcdGhvc3RMYXVuY2hLaW5kOiAndnNjb2RlX21haW5fcHJvY2VzcycsXG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICd0dW5uZWwtY2xpZW50Jyxcblx0XHRcdFx0XHRjbGllbnRUeXBlOiAnYWdlbnRzX3dpbmRvdycsXG5cdFx0XHRcdFx0Y2xpZW50SW1wbGVtZW50YXRpb25OYW1lOiAndnNjb2RlLWFnZW50cy13aW5kb3cnLFxuXHRcdFx0XHRcdGNsaWVudEltcGxlbWVudGF0aW9uVmVyc2lvbjogJzEuMi4zJyxcblx0XHRcdFx0XHRjb25uZWN0aW9uS2luZDogJ2Rldl90dW5uZWwnLFxuXHRcdFx0XHRcdHRyYW5zcG9ydEtpbmQ6ICd3ZWJzb2NrZXQnLFxuXHRcdFx0XHRcdGNsaWVudE1hY2hpbmVJZDogJ2NsaWVudC1tYWNoaW5lLWlkJyxcblx0XHRcdFx0XHRjbGllbnREZXZEZXZpY2VJZDogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHRcdFx0XHRwcm90b2NvbFZlcnNpb246IFBST1RPQ09MX1ZFUlNJT04sXG5cdFx0XHRcdFx0aXNSZWNvbm5lY3Q6IGZhbHNlLFxuXHRcdFx0XHRcdGNvbm5lY3RlZENsaWVudENvdW50OiAxLFxuXHRcdFx0XHRcdGNvbm5lY3RlZFRyYW5zcG9ydENvdW50OiAxLFxuXHRcdFx0XHRcdGNsaWVudFRyYW5zcG9ydENvdW50OiAxLFxuXHRcdFx0XHRcdGNvbm5lY3Rpb25EdXJhdGlvbk1zOiAndW5kZWZpbmVkJyxcblx0XHRcdFx0XHRzdWJzY3JpcHRpb25Db3VudDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRldmVudE5hbWU6ICdhZ2VudEhvc3QuY2xpZW50Q29ubmVjdGlvbicsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRhY3Rpb246ICdkaXNjb25uZWN0ZWQnLFxuXHRcdFx0XHRcdGhvc3RMYXVuY2hLaW5kOiAndnNjb2RlX21haW5fcHJvY2VzcycsXG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICd0dW5uZWwtY2xpZW50Jyxcblx0XHRcdFx0XHRjbGllbnRUeXBlOiAnYWdlbnRzX3dpbmRvdycsXG5cdFx0XHRcdFx0Y2xpZW50SW1wbGVtZW50YXRpb25OYW1lOiAndnNjb2RlLWFnZW50cy13aW5kb3cnLFxuXHRcdFx0XHRcdGNsaWVudEltcGxlbWVudGF0aW9uVmVyc2lvbjogJzEuMi4zJyxcblx0XHRcdFx0XHRjb25uZWN0aW9uS2luZDogJ2Rldl90dW5uZWwnLFxuXHRcdFx0XHRcdHRyYW5zcG9ydEtpbmQ6ICd3ZWJzb2NrZXQnLFxuXHRcdFx0XHRcdGNsaWVudE1hY2hpbmVJZDogJ2NsaWVudC1tYWNoaW5lLWlkJyxcblx0XHRcdFx0XHRjbGllbnREZXZEZXZpY2VJZDogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHRcdFx0XHRwcm90b2NvbFZlcnNpb246IFBST1RPQ09MX1ZFUlNJT04sXG5cdFx0XHRcdFx0aXNSZWNvbm5lY3Q6IGZhbHNlLFxuXHRcdFx0XHRcdGNvbm5lY3RlZENsaWVudENvdW50OiAwLFxuXHRcdFx0XHRcdGNvbm5lY3RlZFRyYW5zcG9ydENvdW50OiAwLFxuXHRcdFx0XHRcdGNsaWVudFRyYW5zcG9ydENvdW50OiAwLFxuXHRcdFx0XHRcdGNvbm5lY3Rpb25EdXJhdGlvbk1zOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRzdWJzY3JpcHRpb25Db3VudDogMCxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIHByb2Nlc3Mtd2lkZSBjbGllbnQgY291bnRzIGFjcm9zcyBwcm90b2NvbCBsaXN0ZW5lcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxEaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHRyYWNrZXIgPSBsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvblRlbGVtZXRyeVRyYWNrZXIoKSk7XG5cdFx0Y29uc3QgZmlyc3RTZXJ2ZXIgPSBsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1Byb3RvY29sU2VydmVyKCkpO1xuXHRcdGNvbnN0IHNlY29uZFNlcnZlciA9IGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrUHJvdG9jb2xTZXJ2ZXIoKSk7XG5cdFx0Y29uc3QgaGFuZGxlcnM6IFByb3RvY29sU2VydmVySGFuZGxlcltdID0gW107XG5cdFx0Zm9yIChjb25zdCBsaXN0ZW5lciBvZiBbZmlyc3RTZXJ2ZXIsIHNlY29uZFNlcnZlcl0pIHtcblx0XHRcdGhhbmRsZXJzLnB1c2gobG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IFByb3RvY29sU2VydmVySGFuZGxlcihcblx0XHRcdFx0YWdlbnRTZXJ2aWNlLFxuXHRcdFx0XHRzdGF0ZU1hbmFnZXIsXG5cdFx0XHRcdGxpc3RlbmVyLFxuXHRcdFx0XHR7IGhvc3RMYXVuY2hLaW5kOiBBZ2VudEhvc3RMYXVuY2hLaW5kLlZTQ29kZU1haW5Qcm9jZXNzLCBjb25uZWN0aW9uVGVsZW1ldHJ5VHJhY2tlcjogdHJhY2tlciB9LFxuXHRcdFx0XHRsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyKCkpLFxuXHRcdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLFxuXHRcdFx0KSkpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW2luZGV4LCBsaXN0ZW5lcl0gb2YgW2ZpcnN0U2VydmVyLCBzZWNvbmRTZXJ2ZXJdLmVudHJpZXMoKSkge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydChpbmRleCA9PT0gMCA/IEFnZW50SG9zdFRyYW5zcG9ydEtpbmQuTWVzc2FnZVBvcnQgOiBBZ2VudEhvc3RUcmFuc3BvcnRLaW5kLldlYlNvY2tldCk7XG5cdFx0XHRsaXN0ZW5lci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0KTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdChpbmRleCArIDEsICdpbml0aWFsaXplJywge1xuXHRcdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sXG5cdFx0XHRcdGNsaWVudElkOiBgY2xpZW50LSR7aW5kZXh9YCxcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0aGFuZGxlcnNbMF0uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cy5tYXAoZXZlbnQgPT4ge1xuXHRcdFx0Y29uc3QgZGF0YSA9IGV2ZW50LmRhdGEgYXMgeyBhY3Rpb246IHN0cmluZzsgY29ubmVjdGVkQ2xpZW50Q291bnQ6IG51bWJlcjsgY29ubmVjdGVkVHJhbnNwb3J0Q291bnQ6IG51bWJlciB9O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YWN0aW9uOiBkYXRhLmFjdGlvbixcblx0XHRcdFx0Y29ubmVjdGVkQ2xpZW50Q291bnQ6IGRhdGEuY29ubmVjdGVkQ2xpZW50Q291bnQsXG5cdFx0XHRcdGNvbm5lY3RlZFRyYW5zcG9ydENvdW50OiBkYXRhLmNvbm5lY3RlZFRyYW5zcG9ydENvdW50LFxuXHRcdFx0fTtcblx0XHR9KSwgW1xuXHRcdFx0eyBhY3Rpb246ICdjb25uZWN0ZWQnLCBjb25uZWN0ZWRDbGllbnRDb3VudDogMSwgY29ubmVjdGVkVHJhbnNwb3J0Q291bnQ6IDEgfSxcblx0XHRcdHsgYWN0aW9uOiAnY29ubmVjdGVkJywgY29ubmVjdGVkQ2xpZW50Q291bnQ6IDIsIGNvbm5lY3RlZFRyYW5zcG9ydENvdW50OiAyIH0sXG5cdFx0XHR7IGFjdGlvbjogJ2Rpc2Nvbm5lY3RlZCcsIGNvbm5lY3RlZENsaWVudENvdW50OiAxLCBjb25uZWN0ZWRUcmFuc3BvcnRDb3VudDogMSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBpcmVzIGRpc2Nvbm5lY3RlZCBjbGllbnQgcmVjb25uZWN0IGhpc3RvcnknLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhY2tlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvblRlbGVtZXRyeVRyYWNrZXIoMTAwKSk7XG5cdFx0XHRjb25zdCBmaXJzdFRyYW5zcG9ydCA9IHt9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuY29ubmVjdCgnY2xpZW50JywgZmlyc3RUcmFuc3BvcnQpLmlzUmVjb25uZWN0LCBmYWxzZSk7XG5cdFx0XHR0cmFja2VyLmRpc2Nvbm5lY3QoJ2NsaWVudCcsIGZpcnN0VHJhbnNwb3J0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmhhc1NlZW5DbGllbnQoJ2NsaWVudCcpLCB0cnVlKTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aGFzU2VlbkNsaWVudDogdHJhY2tlci5oYXNTZWVuQ2xpZW50KCdjbGllbnQnKSxcblx0XHRcdFx0aXNSZWNvbm5lY3Q6IHRyYWNrZXIuY29ubmVjdCgnY2xpZW50Jywge30pLmlzUmVjb25uZWN0LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRoYXNTZWVuQ2xpZW50OiBmYWxzZSxcblx0XHRcdFx0aXNSZWNvbm5lY3Q6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGNvdW50IGEgY2xpZW50IHdoZW4gaW5pdGlhbGl6YXRpb24gZmFpbHMgYWZ0ZXIgbmVnb3RpYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxEaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGxvY2FsU2VydmVyID0gbG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tQcm90b2NvbFNlcnZlcigpKTtcblx0XHRjb25zdCBsb2NhbFRlbGVtZXRyeSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGNvbnN0IGxvY2FsSGFuZGxlciA9IGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBQcm90b2NvbFNlcnZlckhhbmRsZXIoXG5cdFx0XHRhZ2VudFNlcnZpY2UsXG5cdFx0XHRzdGF0ZU1hbmFnZXIsXG5cdFx0XHRsb2NhbFNlcnZlcixcblx0XHRcdHsgaG9zdExhdW5jaEtpbmQ6IEFnZW50SG9zdExhdW5jaEtpbmQuVlNDb2RlTWFpblByb2Nlc3MgfSxcblx0XHRcdGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBGYWlsaW5nQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyKCkpLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdGxvY2FsVGVsZW1ldHJ5LFxuXHRcdFx0bWFuYWdlZFNldHRpbmdzU2VydmljZSxcblx0XHQpKTtcblx0XHRjb25zdCBjb3VudHM6IG51bWJlcltdID0gW107XG5cdFx0bG9jYWxEaXNwb3NhYmxlcy5hZGQobG9jYWxIYW5kbGVyLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbkNvdW50KGNvdW50ID0+IGNvdW50cy5wdXNoKGNvdW50KSkpO1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoQWdlbnRIb3N0VHJhbnNwb3J0S2luZC5XZWJTb2NrZXQpO1xuXHRcdGxvY2FsU2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQpO1xuXG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEsICdpbml0aWFsaXplJywge1xuXHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0Y2xpZW50SWQ6ICdmYWlsZWQtY2xpZW50Jyxcblx0XHR9KSk7XG5cdFx0Y29uc3QgcmVzcG9uc2VDb2RlID0gKGZpbmRSZXNwb25zZSh0cmFuc3BvcnQuc2VudCwgMSkgYXMgeyBlcnJvcjogeyBjb2RlOiBudW1iZXIgfSB9KS5lcnJvci5jb2RlO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvdW50cyxcblx0XHRcdGV2ZW50czogbG9jYWxUZWxlbWV0cnkuZXZlbnRzLFxuXHRcdFx0cmVzcG9uc2VDb2RlLFxuXHRcdH0sIHtcblx0XHRcdGNvdW50czogW10sXG5cdFx0XHRldmVudHM6IFtdLFxuXHRcdFx0cmVzcG9uc2VDb2RlOiBKU09OX1JQQ19JTlRFUk5BTF9FUlJPUixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncm9sbHMgYmFjayByZWNvbm5lY3Qgd2hlbiBmaWxlc3lzdGVtIGF1dGhvcml0eSByZWdpc3RyYXRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxEaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGxvY2FsU2VydmVyID0gbG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tQcm90b2NvbFNlcnZlcigpKTtcblx0XHRjb25zdCBsb2NhbFRlbGVtZXRyeSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGNvbnN0IGxvY2FsSGFuZGxlciA9IGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBQcm90b2NvbFNlcnZlckhhbmRsZXIoXG5cdFx0XHRhZ2VudFNlcnZpY2UsXG5cdFx0XHRzdGF0ZU1hbmFnZXIsXG5cdFx0XHRsb2NhbFNlcnZlcixcblx0XHRcdHsgaG9zdExhdW5jaEtpbmQ6IEFnZW50SG9zdExhdW5jaEtpbmQuVlNDb2RlTWFpblByb2Nlc3MgfSxcblx0XHRcdGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBGYWlsaW5nUmVjb25uZWN0QWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyKCkpLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdGxvY2FsVGVsZW1ldHJ5LFxuXHRcdFx0bWFuYWdlZFNldHRpbmdzU2VydmljZSxcblx0XHQpKTtcblx0XHRjb25zdCBjb3VudHM6IG51bWJlcltdID0gW107XG5cdFx0bG9jYWxEaXNwb3NhYmxlcy5hZGQobG9jYWxIYW5kbGVyLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbkNvdW50KGNvdW50ID0+IGNvdW50cy5wdXNoKGNvdW50KSkpO1xuXG5cdFx0Y29uc3QgaW5pdGlhbFRyYW5zcG9ydCA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRsb2NhbFNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24oaW5pdGlhbFRyYW5zcG9ydCk7XG5cdFx0aW5pdGlhbFRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAnaW5pdGlhbGl6ZScsIHtcblx0XHRcdHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSxcblx0XHRcdGNsaWVudElkOiAncmVjb25uZWN0aW5nLWNsaWVudCcsXG5cdFx0fSkpO1xuXHRcdGluaXRpYWxUcmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXG5cdFx0Y29uc3QgZmFpbGVkVHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdGxvY2FsU2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbihmYWlsZWRUcmFuc3BvcnQpO1xuXHRcdGZhaWxlZFRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAncmVjb25uZWN0Jywge1xuXHRcdFx0Y2xpZW50SWQ6ICdyZWNvbm5lY3RpbmctY2xpZW50Jyxcblx0XHRcdGxhc3RTZWVuU2VydmVyU2VxOiAwLFxuXHRcdFx0c3Vic2NyaXB0aW9uczogW10sXG5cdFx0fSkpO1xuXHRcdGNvbnN0IGZhaWxlZFJlc3BvbnNlQ29kZSA9IChmaW5kUmVzcG9uc2UoZmFpbGVkVHJhbnNwb3J0LnNlbnQsIDIpIGFzIHsgZXJyb3I6IHsgY29kZTogbnVtYmVyIH0gfSkuZXJyb3IuY29kZTtcblx0XHRmYWlsZWRUcmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXG5cdFx0Y29uc3QgcmV0cnlUcmFuc3BvcnQgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0bG9jYWxTZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHJldHJ5VHJhbnNwb3J0KTtcblx0XHRjb25zdCByZXRyeVJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZShyZXRyeVRyYW5zcG9ydCwgMyk7XG5cdFx0cmV0cnlUcmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMywgJ3JlY29ubmVjdCcsIHtcblx0XHRcdGNsaWVudElkOiAncmVjb25uZWN0aW5nLWNsaWVudCcsXG5cdFx0XHRsYXN0U2VlblNlcnZlclNlcTogMCxcblx0XHRcdHN1YnNjcmlwdGlvbnM6IFtdLFxuXHRcdH0pKTtcblx0XHRhd2FpdCByZXRyeVJlc3BvbnNlUHJvbWlzZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y291bnRzLFxuXHRcdFx0Y29ubmVjdGlvbkFjdGlvbnM6IGxvY2FsVGVsZW1ldHJ5LmV2ZW50cy5tYXAoZXZlbnQgPT4gKGV2ZW50LmRhdGEgYXMgeyBhY3Rpb246IHN0cmluZyB9KS5hY3Rpb24pLFxuXHRcdFx0ZmFpbGVkUmVzcG9uc2VDb2RlLFxuXHRcdH0sIHtcblx0XHRcdGNvdW50czogWzEsIDAsIDFdLFxuXHRcdFx0Y29ubmVjdGlvbkFjdGlvbnM6IFsnY29ubmVjdGVkJywgJ2Rpc2Nvbm5lY3RlZCcsICdjb25uZWN0ZWQnXSxcblx0XHRcdGZhaWxlZFJlc3BvbnNlQ29kZTogSlNPTl9SUENfSU5URVJOQUxfRVJST1IsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29ubmVjdCByZXBsYXlzIG1pc3NlZCBjaGFuZ2VzZXQgYWN0aW9ucyB0byBjaGFuZ2VzZXQgc3Vic2NyaWJlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYCR7c2Vzc2lvblVyaX0vY2hhbmdlc2V0L3Nlc3Npb25gO1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIGNoYW5nZXNldCBiZWZvcmUgdGhlIGZpcnN0IGNvbm5lY3Rpb24gc28gdGhlIGluaXRpYWxcblx0XHQvLyBzdWJzY3JpcHRpb24gc3VjY2VlZHMuXG5cdFx0c3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGNoYW5nZXNldFVyaSk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQxID0gY29ubmVjdENsaWVudCgnY2xpZW50LXJjJywgW2NoYW5nZXNldFVyaV0pO1xuXHRcdGNvbnN0IHJlc3AgPSBmaW5kUmVzcG9uc2UodHJhbnNwb3J0MS5zZW50LCAxKTtcblx0XHRjb25zdCBpbml0U2VxID0gKHJlc3AgYXMgeyByZXN1bHQ6IEluaXRpYWxpemVSZXN1bHQgfSkucmVzdWx0LnNlcnZlclNlcTtcblx0XHR0cmFuc3BvcnQxLnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdC8vIERpc3BhdGNoIHR3byBjaGFuZ2VzZXQgYWN0aW9ucyB3aGlsZSBjbGllbnQgaXMgZGlzY29ubmVjdGVkLlxuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFuZ2VzZXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZVNldCxcblx0XHRcdGZpbGU6IHtcblx0XHRcdFx0aWQ6ICdmaWxlOi8vL2EudHMnLFxuXHRcdFx0XHRlZGl0OiB7XG5cdFx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy9hLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL2EudHMnIH0gfSxcblx0XHRcdFx0XHRkaWZmOiB7IGFkZGVkOiAyLCByZW1vdmVkOiAwIH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsXG5cdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSxcblx0XHR9KTtcblxuXHRcdC8vIFJlY29ubmVjdCB3aXRoIHNhbWUgY2xpZW50SWQgYW5kIHRoZSBjaGFuZ2VzZXQgVVJJIGluIHN1YnNjcmlwdGlvbnMuXG5cdFx0Y29uc3QgdHJhbnNwb3J0MiA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydDIpO1xuXHRcdGNvbnN0IHJlY29ubmVjdFJlc3BQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydDIsIDEpO1xuXHRcdHRyYW5zcG9ydDIuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ3JlY29ubmVjdCcsIHtcblx0XHRcdGNsaWVudElkOiAnY2xpZW50LXJjJyxcblx0XHRcdGxhc3RTZWVuU2VydmVyU2VxOiBpbml0U2VxLFxuXHRcdFx0c3Vic2NyaXB0aW9uczogW2NoYW5nZXNldFVyaV0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcCA9IGF3YWl0IHJlY29ubmVjdFJlc3BQcm9taXNlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IChyZWNvbm5lY3RSZXNwIGFzIHsgcmVzdWx0OiBSZWNvbm5lY3RSZXN1bHQgfSkucmVzdWx0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHlwZSwgJ3JlcGxheScpO1xuXHRcdGlmIChyZXN1bHQudHlwZSA9PT0gJ3JlcGxheScpIHtcblx0XHRcdGNvbnN0IHJlcGxheWVkVHlwZXMgPSByZXN1bHQuYWN0aW9ucy5tYXAoZSA9PiBlLmFjdGlvbi50eXBlKTtcblx0XHRcdGFzc2VydC5vayhyZXBsYXllZFR5cGVzLmluY2x1ZGVzKEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZVNldCksICdyZXBsYXkgc2hvdWxkIGluY2x1ZGUgQ2hhbmdlc2V0RmlsZVNldCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlcGxheWVkVHlwZXMuaW5jbHVkZXMoQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkKSwgJ3JlcGxheSBzaG91bGQgaW5jbHVkZSBDaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3Qgc2VuZHMgZnJlc2ggc25hcHNob3RzIHdoZW4gZ2FwIHRvbyBsYXJnZScsIGFzeW5jICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0MSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1nJywgW3Nlc3Npb25VcmldKTtcblx0XHR0cmFuc3BvcnQxLnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTEwMDsgaSsrKSB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiBgVGl0bGUgJHtpfWAgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJhbnNwb3J0MiA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydDIpO1xuXHRcdGNvbnN0IHJlY29ubmVjdFJlc3BQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydDIsIDEpO1xuXHRcdHRyYW5zcG9ydDIuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ3JlY29ubmVjdCcsIHtcblx0XHRcdGNsaWVudElkOiAnY2xpZW50LWcnLFxuXHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IDAsXG5cdFx0XHRzdWJzY3JpcHRpb25zOiBbc2Vzc2lvblVyaV0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcCA9IGF3YWl0IHJlY29ubmVjdFJlc3BQcm9taXNlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IChyZWNvbm5lY3RSZXNwIGFzIHsgcmVzdWx0OiBSZWNvbm5lY3RSZXN1bHQgfSkucmVzdWx0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHlwZSwgJ3NuYXBzaG90Jyk7XG5cdFx0aWYgKHJlc3VsdC50eXBlID09PSAnc25hcHNob3QnKSB7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnNuYXBzaG90cy5sZW5ndGggPiAwLCAnc2hvdWxkIGNvbnRhaW4gc25hcHNob3RzJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3QgcmVoeWRyYXRlcyBzZXJ2ZXItc2lkZSBzdGF0ZSB0aGF0IHdhcyBldmljdGVkIHdoaWxlIGRpc2Nvbm5lY3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0Ly8gTW9ja0FnZW50U2VydmljZS5zdWJzY3JpYmUgbm9ybWFsbHkganVzdCByZXR1cm5zIHRoZSBleGlzdGluZyBzbmFwc2hvdC5cblx0XHQvLyBPdmVycmlkZSBpdCBzbyBhIG1pc3Npbmcgc2Vzc2lvbiBpcyByZXN0b3JlZCBvbiBzdWJzY3JpYmUgXHUyMDE0IHRoaXMgaXMgdGhlXG5cdFx0Ly8gYmVoYXZpb3IgdGhlIHJlYWwgQWdlbnRTZXJ2aWNlIHByb3ZpZGVzIGFuZCB0aGF0IHJlY29ubmVjdCBub3cgcmVsaWVzIG9uLlxuXHRcdGNvbnN0IHN1YnNjcmliZUNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGFnZW50U2VydmljZS5zdWJzY3JpYmUgPSBhc3luYyAocmVzb3VyY2UsIF9jbGllbnRJZCkgPT4ge1xuXHRcdFx0c3Vic2NyaWJlQ2FsbHMucHVzaChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGxldCBzbmFwc2hvdCA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGlmICghc25hcHNob3QpIHtcblx0XHRcdFx0c3RhdGVNYW5hZ2VyLnJlc3RvcmVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpLCBbXSk7XG5cdFx0XHRcdHNuYXBzaG90ID0gc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KHJlc291cmNlLnRvU3RyaW5nKCkpITtcblx0XHRcdH1cblx0XHRcdHJldHVybiBzbmFwc2hvdDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0MSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1lJywgW3Nlc3Npb25VcmldKTtcblx0XHRjb25zdCBpbml0UmVzcCA9IGZpbmRSZXNwb25zZSh0cmFuc3BvcnQxLnNlbnQsIDEpO1xuXHRcdGNvbnN0IGluaXRTZXEgPSAoaW5pdFJlc3AgYXMgeyByZXN1bHQ6IEluaXRpYWxpemVSZXN1bHQgfSkucmVzdWx0LnNlcnZlclNlcTtcblx0XHR0cmFuc3BvcnQxLnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHRoZSBBZ2VudFNlcnZpY2UgZXZpY3RpbmcgdGhlIGlkbGUgc2Vzc2lvbiB3aGlsZSB0aGUgY2xpZW50XG5cdFx0Ly8gd2FzIGRpc2Nvbm5lY3RlZCAodGhpcyBpcyB3aGF0IGBfbWF5YmVFdmljdElkbGVTZXNzaW9uYCBkb2VzIGluIHRoZVxuXHRcdC8vIHJlYWwgc2VydmljZSkuXG5cdFx0c3RhdGVNYW5hZ2VyLnJlbW92ZVNlc3Npb24oc2Vzc2lvblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChzZXNzaW9uVXJpKSwgdW5kZWZpbmVkLCAncHJlY29uZGl0aW9uOiBzdGF0ZSBldmljdGVkJyk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQyID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0Mik7XG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcFByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0MiwgMSk7XG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAncmVjb25uZWN0Jywge1xuXHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtZScsXG5cdFx0XHRsYXN0U2VlblNlcnZlclNlcTogaW5pdFNlcSxcblx0XHRcdHN1YnNjcmlwdGlvbnM6IFtzZXNzaW9uVXJpXSxcblx0XHR9KSk7XG5cblx0XHRhd2FpdCByZWNvbm5lY3RSZXNwUHJvbWlzZTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN1YnNjcmliZUNhbGxzLCBbc2Vzc2lvblVyaV0sICdyZWNvbm5lY3Qgc2hvdWxkIGNhbGwgc3Vic2NyaWJlIHRvIHJlc3RvcmUgZXZpY3RlZCBzdGF0ZScpO1xuXHRcdGFzc2VydC5vayhzdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3Qoc2Vzc2lvblVyaSksICdzdGF0ZSBzaG91bGQgaGF2ZSBiZWVuIHJlLWh5ZHJhdGVkIGJ5IHJlY29ubmVjdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3QgcmUtcmVnaXN0ZXJzIHRoZSByZXZlcnNlLVJQQyBmaWxlc3lzdGVtIGF1dGhvcml0eScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUaGUgc2VydmVyLXNpZGUgZmlsZXN5c3RlbSBwcm92aWRlciB0YWxrcyBiYWNrIHRvIHRoZSBjbGllbnQgdmlhXG5cdFx0Ly8gcmV2ZXJzZS1SUEMgKGUuZy4gYHJlc291cmNlTGlzdGApLiBJZiB0aGUgYXV0aG9yaXR5IGlzIG5vdFxuXHRcdC8vIHJlLXJlZ2lzdGVyZWQgb24gcmVjb25uZWN0LCB0aGUgYWdlbnQgaG9zdCB3b3VsZCBmYWlsIHdpdGhcblx0XHQvLyBcIk5vIGNvbm5lY3Rpb24gZm9yIGF1dGhvcml0eTogPGNsaWVudElkPlwiIHVudGlsIHRoZSBjbGllbnRcblx0XHQvLyByZWluaXRpYWxpemVkLiBWZXJpZnkgYSByZXZlcnNlLVJQQyByb3V0ZXMgdGhyb3VnaCB0aGUgbmV3XG5cdFx0Ly8gdHJhbnNwb3J0IGFmdGVyIHJlY29ubmVjdC5cblx0XHRjb25zdCB0cmFuc3BvcnQxID0gY29ubmVjdENsaWVudCgnY2xpZW50LWZzJyk7XG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQyID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0Mik7XG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcFByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0MiwgMSk7XG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAncmVjb25uZWN0Jywge1xuXHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtZnMnLFxuXHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IDAsXG5cdFx0XHRzdWJzY3JpcHRpb25zOiBbXSxcblx0XHR9KSk7XG5cdFx0YXdhaXQgcmVjb25uZWN0UmVzcFByb21pc2U7XG5cdFx0dHJhbnNwb3J0Mi5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHQvLyBXaXJlIHRoZSB0ZXN0J3MgcmVzcG9uc2UgKmJlZm9yZSogd2UgdHJpZ2dlciB0aGUgcmV2ZXJzZS1SUEMgc29cblx0XHQvLyB0aGUgcmVzcG9uc2UgaXMgb2JzZXJ2ZWQgb24gdGhlIG5leHQgbWljcm90YXNrLlxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0cmFuc3BvcnQyLm9uRGlkU2VuZChtc2cgPT4ge1xuXHRcdFx0aWYgKGlzSnNvblJwY1JlcXVlc3QobXNnKSAmJiBtc2cubWV0aG9kID09PSAncmVzb3VyY2VMaXN0Jykge1xuXHRcdFx0XHR0cmFuc3BvcnQyLnNpbXVsYXRlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdFx0aWQ6IG1zZy5pZCxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgZW50cmllczogW3sgbmFtZTogJ2FmdGVyLXJlY29ubmVjdC50eHQnLCB0eXBlOiAnZmlsZScgYXMgY29uc3QgfV0gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmlsZVN5c3RlbVByb3ZpZGVyLnJlYWRkaXIoYWdlbnRIb3N0VXJpKCdjbGllbnQtZnMnLCAnL3dvcmtzcGFjZScpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1snYWZ0ZXItcmVjb25uZWN0LnR4dCcsIEZpbGVUeXBlLkZpbGVdXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ292ZXJsYXBwaW5nIHJlY29ubmVjdCBrZWVwcyBlYXJsaWVyIHJldmVyc2UtUlBDIHJlcXVlc3RzIGFsaXZlIHVudGlsIHRoYXQgdHJhbnNwb3J0IGNsb3NlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQxID0gY29ubmVjdENsaWVudCgnY2xpZW50LWZzLW92ZXJsYXAnKTtcblx0XHRjb25zdCByZXZlcnNlUmVxdWVzdFByb21pc2UgPSBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKHRyYW5zcG9ydDEub25EaWRTZW5kLCBtc2cgPT4gaXNKc29uUnBjUmVxdWVzdChtc2cpICYmIG1zZy5tZXRob2QgPT09ICdyZXNvdXJjZUxpc3QnKSk7XG5cdFx0Y29uc3QgcmVhZFByb21pc2UgPSBmaWxlU3lzdGVtUHJvdmlkZXIucmVhZGRpcihhZ2VudEhvc3RVcmkoJ2NsaWVudC1mcy1vdmVybGFwJywgJy93b3Jrc3BhY2UnKSk7XG5cdFx0Y29uc3QgcmV2ZXJzZVJlcXVlc3QgPSBhd2FpdCByZXZlcnNlUmVxdWVzdFByb21pc2U7XG5cdFx0YXNzZXJ0Lm9rKGlzSnNvblJwY1JlcXVlc3QocmV2ZXJzZVJlcXVlc3QpKTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydDIgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQyKTtcblx0XHRjb25zdCByZWNvbm5lY3RSZXNwUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQyLCAxKTtcblx0XHR0cmFuc3BvcnQyLnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEsICdyZWNvbm5lY3QnLCB7XG5cdFx0XHRjbGllbnRJZDogJ2NsaWVudC1mcy1vdmVybGFwJyxcblx0XHRcdGxhc3RTZWVuU2VydmVyU2VxOiAwLFxuXHRcdFx0c3Vic2NyaXB0aW9uczogW10sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHJlY29ubmVjdFJlc3BQcm9taXNlO1xuXG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZU1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogcmV2ZXJzZVJlcXVlc3QuaWQsXG5cdFx0XHRyZXN1bHQ6IHsgZW50cmllczogW3sgbmFtZTogJ2Zyb20tb3JpZ2luYWwtdHJhbnNwb3J0LnR4dCcsIHR5cGU6ICdmaWxlJyBhcyBjb25zdCB9XSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVhZFByb21pc2U7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtbJ2Zyb20tb3JpZ2luYWwtdHJhbnNwb3J0LnR4dCcsIEZpbGVUeXBlLkZpbGVdXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NpbmcgYW4gb2xkZXIgb3ZlcmxhcHBpbmcgdHJhbnNwb3J0IHJlamVjdHMgaXRzIHBlbmRpbmcgcmV2ZXJzZS1SUEMgcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0MSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1mcy1vdmVybGFwLWNsb3NlJyk7XG5cdFx0Y29uc3QgcmV2ZXJzZVJlcXVlc3RQcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcih0cmFuc3BvcnQxLm9uRGlkU2VuZCwgbXNnID0+IGlzSnNvblJwY1JlcXVlc3QobXNnKSAmJiBtc2cubWV0aG9kID09PSAncmVzb3VyY2VMaXN0JykpO1xuXHRcdGNvbnN0IHJlYWRQcm9taXNlID0gZmlsZVN5c3RlbVByb3ZpZGVyLnJlYWRkaXIoYWdlbnRIb3N0VXJpKCdjbGllbnQtZnMtb3ZlcmxhcC1jbG9zZScsICcvd29ya3NwYWNlJykpO1xuXHRcdGF3YWl0IHJldmVyc2VSZXF1ZXN0UHJvbWlzZTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydDIgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbih0cmFuc3BvcnQyKTtcblx0XHRjb25zdCByZWNvbm5lY3RSZXNwUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQyLCAxKTtcblx0XHR0cmFuc3BvcnQyLnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEsICdyZWNvbm5lY3QnLCB7XG5cdFx0XHRjbGllbnRJZDogJ2NsaWVudC1mcy1vdmVybGFwLWNsb3NlJyxcblx0XHRcdGxhc3RTZWVuU2VydmVyU2VxOiAwLFxuXHRcdFx0c3Vic2NyaXB0aW9uczogW10sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHJlY29ubmVjdFJlc3BQcm9taXNlO1xuXG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZWFkUHJvbWlzZSwgL0NsaWVudCBjbGllbnQtZnMtb3ZlcmxhcC1jbG9zZSBkaXNjb25uZWN0ZWQvKTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IGRpc2Nvbm5lY3QgY2xlYW5zIHVwJywgKCkgPT4ge1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtZCcsIFtzZXNzaW9uVXJpXSk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnQWZ0ZXIgRGlzY29ubmVjdCcgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnQubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IGRpc2Nvbm5lY3QgcmV0YWlucyBhY3RpdmUgY2xpZW50IGR1cmluZyBncmFjZSwgdGhlbiByZW1vdmVzIGl0IGFuZCBmYWlscyBvd25lZCB0b29sIGNhbGxzIGFmdGVyIGdyYWNlIHBlcmlvZCcsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyxcblx0XHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC10b29scycgfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne30nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtdG9vbHMnLCBbc2Vzc2lvblVyaV0pO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdFx0Ly8gVGhlIGFjdGl2ZSBjbGllbnQgaXMgcmV0YWluZWQgZHVyaW5nIHRoZSBncmFjZSB3aW5kb3cgc28gYSBxdWlja1xuXHRcdFx0Ly8gcmVjb25uZWN0IGNhbiBrZWVwIGl0cyBzbG90LlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVDbGllbnRzLm1hcChjID0+IGMuY2xpZW50SWQpLCBbJ2NsaWVudC10b29scyddKTtcblx0XHRcdGxldCBwYXJ0ID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8gcGFydC50b29sQ2FsbC5zdGF0dXMgOiB1bmRlZmluZWQsIFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcpO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMzBfMDAxKSk7XG5cblx0XHRcdC8vIEFmdGVyIHRoZSBncmFjZSB3aW5kb3cgdGhlIGFjdGl2ZSBjbGllbnQgaXMgcmVtb3ZlZCBhbmQgaXRzXG5cdFx0XHQvLyBwZW5kaW5nIHRvb2wgY2FsbCBpcyBmYWlsZWQuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZUNsaWVudHMsIFtdKTtcblx0XHRcdHBhcnQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQ/LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8ge1xuXHRcdFx0XHRzdGF0dXM6IHBhcnQudG9vbENhbGwuc3RhdHVzLFxuXHRcdFx0XHRzdWNjZXNzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkID8gcGFydC50b29sQ2FsbC5zdWNjZXNzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRlcnJvcjogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHBhcnQudG9vbENhbGwuZXJyb3I/Lm1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0XHR9IDogdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0ZXJyb3I6ICdDbGllbnQgY2xpZW50LXRvb2xzIGRpc2Nvbm5lY3RlZCBiZWZvcmUgY29tcGxldGluZyBSdW4gVGFzaycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IGRpc2Nvbm5lY3QgZmFpbHMgb3duZWQgc3RyZWFtaW5nIHRvb2wgY2FsbHMgYWZ0ZXIgZ3JhY2UgcGVyaW9kJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0XHRcdHRvb2xzOiBbeyBuYW1lOiAncnVuVGFzaycsIGRlc2NyaXB0aW9uOiAnUnVucyBhIHRhc2snIH1dXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIGl0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC10b29scycsIFtzZXNzaW9uVXJpXSk7XG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXG5cdFx0XHRsZXQgcGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnQudG9vbENhbGwuc3RhdHVzIDogdW5kZWZpbmVkLCBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcpO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMzBfMDAxKSk7XG5cblx0XHRcdHBhcnQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQ/LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8ge1xuXHRcdFx0XHRzdGF0dXM6IHBhcnQudG9vbENhbGwuc3RhdHVzLFxuXHRcdFx0XHRzdWNjZXNzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkID8gcGFydC50b29sQ2FsbC5zdWNjZXNzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRlcnJvcjogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHBhcnQudG9vbENhbGwuZXJyb3I/Lm1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0XHR9IDogdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0ZXJyb3I6ICdDbGllbnQgY2xpZW50LXRvb2xzIGRpc2Nvbm5lY3RlZCBiZWZvcmUgY29tcGxldGluZyBSdW4gVGFzaycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb3duZWQgdG9vbCBjYWxsIGlzIG5vdCBmYWlsZWQgd2hlbiBjbG9zaW5nIHRoZSBsYXRlc3Qgb3ZlcmxhcHBpbmcgdHJhbnNwb3J0IGZhbGxzIGJhY2sgdG8gYW4gb2xkZXIgb25lJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0XHRcdHRvb2xzOiBbeyBuYW1lOiAncnVuVGFzaycsIGRlc2NyaXB0aW9uOiAnUnVucyBhIHRhc2snIH1dXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIGl0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGZhbGxiYWNrVHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LXRvb2xzJywgW3Nlc3Npb25VcmldKTtcblx0XHRcdGNvbnN0IGxhdGVzdFRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC10b29scycsIFtzZXNzaW9uVXJpXSk7XG5cblx0XHRcdGxhdGVzdFRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRcdGxldCBwYXJ0ID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8gcGFydC50b29sQ2FsbC5zdGF0dXMgOiB1bmRlZmluZWQsIFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAzMF8wMDEpKTtcblxuXHRcdFx0cGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnQudG9vbENhbGwuc3RhdHVzIDogdW5kZWZpbmVkLCBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcpO1xuXG5cdFx0XHRmYWxsYmFja1RyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ293bmVkIHRvb2wgY2FsbCBpcyBmYWlsZWQgYWZ0ZXIgdGhlIGxhc3Qgb3ZlcmxhcHBpbmcgdHJhbnNwb3J0IGNsb3NlcycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyxcblx0XHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC10b29scycgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBmYWxsYmFja1RyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC10b29scycsIFtzZXNzaW9uVXJpXSk7XG5cdFx0XHRjb25zdCBsYXRlc3RUcmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtdG9vbHMnLCBbc2Vzc2lvblVyaV0pO1xuXHRcdFx0bGF0ZXN0VHJhbnNwb3J0LnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDMwXzAwMSkpO1xuXHRcdFx0bGV0IHBhcnQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA6IHVuZGVmaW5lZCwgVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nKTtcblxuXHRcdFx0ZmFsbGJhY2tUcmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDMwXzAwMSkpO1xuXG5cdFx0XHRwYXJ0ID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHtcblx0XHRcdFx0c3RhdHVzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyxcblx0XHRcdFx0c3VjY2VzczogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHBhcnQudG9vbENhbGwuc3VjY2VzcyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZXJyb3I6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBwYXJ0LnRvb2xDYWxsLmVycm9yPy5tZXNzYWdlIDogdW5kZWZpbmVkLFxuXHRcdFx0fSA6IHVuZGVmaW5lZCwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdGVycm9yOiAnQ2xpZW50IGNsaWVudC10b29scyBkaXNjb25uZWN0ZWQgYmVmb3JlIGNvbXBsZXRpbmcgUnVuIFRhc2snLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsaWVudCByZWNvbm5lY3Qgd2l0aG91dCBzZXNzaW9uIHN1YnNjcmlwdGlvbiBkb2VzIG5vdCBjbGVhciB0b29sIGNhbGwgZGlzY29ubmVjdCB0aW1lb3V0JywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0XHRcdHRvb2xzOiBbeyBuYW1lOiAncnVuVGFzaycsIGRlc2NyaXB0aW9uOiAnUnVucyBhIHRhc2snIH1dXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIGl0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7fScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC10b29scycsIFtzZXNzaW9uVXJpXSk7XG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXG5cdFx0XHRjb25zdCByZWNvbm5lY3RUcmFuc3BvcnQgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHJlY29ubmVjdFRyYW5zcG9ydCk7XG5cdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ3JlY29ubmVjdCcsIHtcblx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0XHRsYXN0U2VlblNlcnZlclNlcTogc3RhdGVNYW5hZ2VyLnNlcnZlclNlcSxcblx0XHRcdFx0c3Vic2NyaXB0aW9uczogW10sXG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAzMF8wMDEpKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyB7XG5cdFx0XHRcdHN0YXR1czogcGFydC50b29sQ2FsbC5zdGF0dXMsXG5cdFx0XHRcdHN1Y2Nlc3M6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBwYXJ0LnRvb2xDYWxsLnN1Y2Nlc3MgOiB1bmRlZmluZWQsXG5cdFx0XHR9IDogdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGllbnQgcmVjb25uZWN0IHdpdGggc2Vzc2lvbiBzdWJzY3JpcHRpb24gY2xlYXJzIHRvb2wgY2FsbCBkaXNjb25uZWN0IHRpbWVvdXQgZm9yIHRoYXQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyxcblx0XHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC10b29scycgfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne30nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtdG9vbHMnLCBbc2Vzc2lvblVyaV0pO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdFx0Y29uc3QgcmVjb25uZWN0VHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdFx0c2VydmVyLnNpbXVsYXRlQ29ubmVjdGlvbihyZWNvbm5lY3RUcmFuc3BvcnQpO1xuXHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDEsICdyZWNvbm5lY3QnLCB7XG5cdFx0XHRcdGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyxcblx0XHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IHN0YXRlTWFuYWdlci5zZXJ2ZXJTZXEsXG5cdFx0XHRcdHN1YnNjcmlwdGlvbnM6IFtzZXNzaW9uVXJpXSxcblx0XHRcdH0pKTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDMwXzAwMSkpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8gcGFydC50b29sQ2FsbC5zdGF0dXMgOiB1bmRlZmluZWQsIFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGllbnQgdG9vbCB0aW1lb3V0IHRlbGxzIG1vZGVsIGl0IG1heSByZXRyeSB3aGVuIHJlcGxhY2VtZW50IGFjdGl2ZSBjbGllbnQgcHJvdmlkZXMgdGhlIHRvb2wnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRjbGllbnRJZDogJ2NsaWVudC10b29scycsXG5cdFx0XHRcdFx0dG9vbHM6IFt7IG5hbWU6ICdydW5UYXNrJywgZGVzY3JpcHRpb246ICdSdW5zIGEgdGFzaycgfV1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gaXQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnIH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3t9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LXRvb2xzJywgW3Nlc3Npb25VcmldKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAnY2xpZW50LXJlcGxhY2VtZW50Jyxcblx0XHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAzMF8wMDEpKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHtcblx0XHRcdFx0c3RhdHVzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyxcblx0XHRcdFx0c3VjY2VzczogcGFydC50b29sQ2FsbC5zdWNjZXNzLFxuXHRcdFx0XHRjb250ZW50OiBwYXJ0LnRvb2xDYWxsLmNvbnRlbnQsXG5cdFx0XHR9IDogdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdUaGUgY2xpZW50IHRoYXQgd2FzIHJ1bm5pbmcgUnVuIFRhc2sgZGlzY29ubmVjdGVkLCBidXQgYW5vdGhlciBhY3RpdmUgY2xpZW50IG5vdyBwcm92aWRlcyBSdW4gVGFzay4gWW91IG1heSB0cnkgY2FsbGluZyB0aGUgdG9vbCBhZ2Fpbi4nIH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsaWVudCB0b29sIGNhbGwgc3RhbXBlZCBmb3IgYSBkaXNjb25uZWN0ZWQgcHJvdG9jb2wgY2xpZW50IGZhaWxzIGFmdGVyIHRoZSBncmFjZSBwZXJpb2QnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdkaXNjb25uZWN0ZWQtY2xpZW50JywgW3Nlc3Npb25VcmldKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIGl0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdkaXNjb25uZWN0ZWQtY2xpZW50JyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGxldCBwYXJ0ID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8gcGFydC50b29sQ2FsbC5zdGF0dXMgOiB1bmRlZmluZWQsIFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAzMF8wMDEpKTtcblxuXHRcdFx0cGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyB7XG5cdFx0XHRcdHN0YXR1czogcGFydC50b29sQ2FsbC5zdGF0dXMsXG5cdFx0XHRcdHN1Y2Nlc3M6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBwYXJ0LnRvb2xDYWxsLnN1Y2Nlc3MgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVycm9yOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkID8gcGFydC50b29sQ2FsbC5lcnJvcj8ubWVzc2FnZSA6IHVuZGVmaW5lZCxcblx0XHRcdH0gOiB1bmRlZmluZWQsIHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRlcnJvcjogJ0NsaWVudCBkaXNjb25uZWN0ZWQtY2xpZW50IGRpc2Nvbm5lY3RlZCBiZWZvcmUgY29tcGxldGluZyBSdW4gVGFzaycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IHRvb2wgY2FsbCBvd25lZCBieSBhbiBhY3RpdmUgbG9jYWwgSVBDIGNsaWVudCBpcyBub3QgdHJlYXRlZCBhcyBvcnBoYW5lZCcsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAnbG9jYWwtY2xpZW50Jyxcblx0XHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2xvY2FsLWNsaWVudCcgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMzBfMDAxKSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA6IHVuZGVmaW5lZCwgVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb3JwaGFuZWQgY2xpZW50IHRvb2wgY2FsbCB0aW1lb3V0IGlzIGNsZWFyZWQgd2hlbiB0aGUgb3duaW5nIGNsaWVudCBjb25uZWN0cyB3aXRoaW4gdGhlIHdpbmRvdycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdsYXRlLWNsaWVudCcsIFtzZXNzaW9uVXJpXSk7XG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gaXQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdsYXRlLWNsaWVudCcgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGUgb3duaW5nIGNsaWVudCByZWNvbm5lY3RzIHdpdGhpbiB0aGUgZ3JhY2Ugd2luZG93LlxuXHRcdFx0Y29ubmVjdENsaWVudCgnbGF0ZS1jbGllbnQnLCBbc2Vzc2lvblVyaV0pO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMzBfMDAxKSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA6IHVuZGVmaW5lZCwgVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBsYXRlciBvcnBoYW5lZCB0b29sIGNhbGwgZG9lcyBub3QgZXh0ZW5kIGFuIGVhcmxpZXIgb25lIHBhc3QgdGhlIGdyYWNlIHdpbmRvdycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdkaXNjb25uZWN0ZWQtY2xpZW50JywgW3Nlc3Npb25VcmldKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Ly8gRmlyc3Qgb3JwaGFuZWQgdG9vbCBjYWxsIGFybXMgdGhlIGdyYWNlIHRpbWVyLlxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2Rpc2Nvbm5lY3RlZC1jbGllbnQnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gUmUtYXJtaW5nIGZvciBhIGxhdGVyIGNhbGwgbXVzdCByZXRhaW4gdGhlIG9yaWdpbmFsIGRlYWRsaW5lLlxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDIwXzAwMCkpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTInLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2Rpc2Nvbm5lY3RlZC1jbGllbnQnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gMzFzIGFmdGVyIHRoZSBGSVJTVCBjYWxsOiBib3RoIG11c3QgaGF2ZSBmYWlsZWQuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTFfMDAwKSk7XG5cblx0XHRcdGNvbnN0IHBhcnRzID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cyA/PyBbXTtcblx0XHRcdGNvbnN0IHN0YXR1c2VzID0gcGFydHNcblx0XHRcdFx0LmZpbHRlcihwID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbClcblx0XHRcdFx0Lm1hcChwID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHAudG9vbENhbGwuc3RhdHVzIDogdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzZXMsIFtUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsIFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnN1YnNjcmliZSByZW1vdmVzIHRoZSBhY3RpdmUgY2xpZW50IGFuZCBmYWlscyBpdHMgb3duZWQgdG9vbCBjYWxscycsICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gaXQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0fSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC10b29scycgfSxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdHRvb2xJbnB1dDogJ3t9Jyxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LXRvb2xzJywgW3Nlc3Npb25VcmldKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKG5vdGlmaWNhdGlvbigndW5zdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVDbGllbnRzLCBbXSk7XG5cdFx0Y29uc3QgcGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8ge1xuXHRcdFx0c3RhdHVzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyxcblx0XHRcdHN1Y2Nlc3M6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBwYXJ0LnRvb2xDYWxsLnN1Y2Nlc3MgOiB1bmRlZmluZWQsXG5cdFx0XHRlcnJvcjogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHBhcnQudG9vbENhbGwuZXJyb3I/Lm1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0fSA6IHVuZGVmaW5lZCwge1xuXHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdGVycm9yOiAnQ2xpZW50IGNsaWVudC10b29scyBkaXNjb25uZWN0ZWQgYmVmb3JlIGNvbXBsZXRpbmcgUnVuIFRhc2snLFxuXHRcdH0pO1xuXG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlQ2xvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb25uZWN0IHdpdGhvdXQgcmVzdWJzY3JpcHRpb24gcmVtb3ZlcyB0aGUgYWN0aXZlIGNsaWVudCBhbmQgZmFpbHMgaXRzIG93bmVkIHRvb2wgY2FsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydDEgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtdG9vbHMnLCBbc2Vzc2lvblVyaV0pO1xuXHRcdGNvbnN0IGluaXRTZXEgPSAoZmluZFJlc3BvbnNlKHRyYW5zcG9ydDEuc2VudCwgMSkgYXMgeyByZXN1bHQ6IEluaXRpYWxpemVSZXN1bHQgfSkucmVzdWx0LnNlcnZlclNlcTtcblxuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3J1blRhc2snLCBkZXNjcmlwdGlvbjogJ1J1bnMgYSB0YXNrJyB9XVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gaXQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0fSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC10b29scycgfSxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdHRvb2xJbnB1dDogJ3t9Jyxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdH0pO1xuXG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHQvLyBSZWNvbm5lY3QsIGJ1dCBkbyBOT1QgcmVzdWJzY3JpYmUgdG8gdGhlIHNlc3Npb24uXG5cdFx0Y29uc3QgdHJhbnNwb3J0MiA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydDIpO1xuXHRcdGNvbnN0IHJlY29ubmVjdFJlc3BQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydDIsIDEpO1xuXHRcdHRyYW5zcG9ydDIuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ3JlY29ubmVjdCcsIHtcblx0XHRcdGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyxcblx0XHRcdGxhc3RTZWVuU2VydmVyU2VxOiBpbml0U2VxLFxuXHRcdFx0c3Vic2NyaXB0aW9uczogW10sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHJlY29ubmVjdFJlc3BQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVDbGllbnRzLCBbXSk7XG5cdFx0Y29uc3QgcGFydCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8ge1xuXHRcdFx0c3RhdHVzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyxcblx0XHRcdHN1Y2Nlc3M6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBwYXJ0LnRvb2xDYWxsLnN1Y2Nlc3MgOiB1bmRlZmluZWQsXG5cdFx0XHRlcnJvcjogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHBhcnQudG9vbENhbGwuZXJyb3I/Lm1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0fSA6IHVuZGVmaW5lZCwge1xuXHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdGVycm9yOiAnQ2xpZW50IGNsaWVudC10b29scyBkaXNjb25uZWN0ZWQgYmVmb3JlIGNvbXBsZXRpbmcgUnVuIFRhc2snLFxuXHRcdH0pO1xuXG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZUNsb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29ubmVjdCB3aXRoIHJlc3Vic2NyaXB0aW9uIGtlZXBzIHRoZSBhY3RpdmUgY2xpZW50IGFuZCBpdHMgb3duZWQgdG9vbCBjYWxscycsIGFzeW5jICgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0MSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC10b29scycsIFtzZXNzaW9uVXJpXSk7XG5cdFx0Y29uc3QgaW5pdFNlcSA9IChmaW5kUmVzcG9uc2UodHJhbnNwb3J0MS5zZW50LCAxKSBhcyB7IHJlc3VsdDogSW5pdGlhbGl6ZVJlc3VsdCB9KS5yZXN1bHQuc2VydmVyU2VxO1xuXG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRjbGllbnRJZDogJ2NsaWVudC10b29scycsXG5cdFx0XHRcdHRvb2xzOiBbeyBuYW1lOiAncnVuVGFzaycsIGRlc2NyaXB0aW9uOiAnUnVucyBhIHRhc2snIH1dXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LXRvb2xzJyB9LFxuXHRcdH0pO1xuXG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQyID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0Mik7XG5cdFx0Y29uc3QgcmVjb25uZWN0UmVzcFByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0MiwgMSk7XG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAncmVjb25uZWN0Jywge1xuXHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtdG9vbHMnLFxuXHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXE6IGluaXRTZXEsXG5cdFx0XHRzdWJzY3JpcHRpb25zOiBbc2Vzc2lvblVyaV0sXG5cdFx0fSkpO1xuXHRcdGF3YWl0IHJlY29ubmVjdFJlc3BQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5hY3RpdmVDbGllbnRzLm1hcChjID0+IGMuY2xpZW50SWQpLCBbJ2NsaWVudC10b29scyddKTtcblx0XHRjb25zdCBwYXJ0ID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnQudG9vbENhbGwuc3RhdHVzIDogdW5kZWZpbmVkLCBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcpO1xuXG5cdFx0dHJhbnNwb3J0Mi5zaW11bGF0ZUNsb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRzaGFrZSBpbmNsdWRlcyBkZWZhdWx0RGlyZWN0b3J5IGZyb20gc2lkZSBlZmZlY3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1ob21lJyk7XG5cblx0XHRjb25zdCByZXNwID0gZmluZFJlc3BvbnNlKHRyYW5zcG9ydC5zZW50LCAxKTtcblx0XHRhc3NlcnQub2socmVzcCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gKHJlc3AgYXMgeyByZXN1bHQ6IEluaXRpYWxpemVSZXN1bHQgfSkucmVzdWx0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkucGFyc2UocmVzdWx0LmRlZmF1bHREaXJlY3RvcnkhKS5wYXRoLCAnL2hvbWUvdGVzdHVzZXInKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VMaXN0IHJvdXRlcyB0byBzaWRlIGVmZmVjdCBoYW5kbGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1icm93c2UnKTtcblx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXG5cdFx0Y29uc3QgZGlyVXJpID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdCcpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdyZXNvdXJjZUxpc3QnLCB7IHVyaTogZGlyVXJpIH0pKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50U2VydmljZS5icm93c2VkVXJpcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudFNlcnZpY2UuYnJvd3NlZFVyaXNbMF0ucGF0aCwgJy9ob21lL3VzZXIvcHJvamVjdCcpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3ApO1xuXHRcdGNvbnN0IHJlc3VsdCA9IChyZXNwIGFzIHVua25vd24gYXMgeyByZXN1bHQ6IHsgZW50cmllczogeyBuYW1lOiBzdHJpbmc7IHVyaTogdW5rbm93bjsgdHlwZTogc3RyaW5nIH1bXSB9IH0pLnJlc3VsdDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVudHJpZXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVudHJpZXNbMF0ubmFtZSwgJ3NyYycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZW50cmllc1swXS50eXBlLCAnZGlyZWN0b3J5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lbnRyaWVzWzFdLm5hbWUsICdSRUFETUUubWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVudHJpZXNbMV0udHlwZSwgJ2ZpbGUnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VMaXN0IHJldHVybnMgYSBKU09OLVJQQyBlcnJvciB3aGVuIHRoZSB0YXJnZXQgaXMgaW52YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtYnJvd3NlLWVycm9yJyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblxuXHRcdGNvbnN0IGRpclVyaSA9IFVSSS5maWxlKCcvbWlzc2luZycpLnRvU3RyaW5nKCk7XG5cdFx0YWdlbnRTZXJ2aWNlLmJyb3dzZUVycm9ycy5zZXQoVVJJLmZpbGUoJy9taXNzaW5nJykudG9TdHJpbmcoKSwgbmV3IFByb3RvY29sRXJyb3IoSlNPTl9SUENfSU5URVJOQUxfRVJST1IsIGBEaXJlY3Rvcnkgbm90IGZvdW5kOiAke2RpclVyaX1gKSk7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdyZXNvdXJjZUxpc3QnLCB7IHVyaTogZGlyVXJpIH0pKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlIGFzIHsgZXJyb3I/OiB7IGNvZGU6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nIH0gfTtcblxuXHRcdGFzc2VydC5vayhyZXNwPy5lcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3AuZXJyb3IhLmNvZGUsIEpTT05fUlBDX0lOVEVSTkFMX0VSUk9SKTtcblx0XHRhc3NlcnQubWF0Y2gocmVzcC5lcnJvciEubWVzc2FnZSwgL0RpcmVjdG9yeSBub3QgZm91bmQvKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VSZWFkIGRvZXMgbm90IGxvZyBtaXNzaW5nIGZpbGUgcmVhZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LXJlYWQtbWlzc2luZy1maWxlJyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblxuXHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkuZmlsZSgnL21pc3NpbmcnKS50b1N0cmluZygpO1xuXHRcdGFnZW50U2VydmljZS5yZWFkRXJyb3JzLnNldChmaWxlVXJpLCBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgQ29udGVudCBub3QgZm91bmQ6ICR7ZmlsZVVyaX1gKSk7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdyZXNvdXJjZVJlYWQnLCB7IHVyaTogZmlsZVVyaSB9KSk7XG5cdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZSBhcyB7IGVycm9yPzogeyBjb2RlOiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZyB9IH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVycm9yQ29kZTogcmVzcC5lcnJvcj8uY29kZSxcblx0XHRcdGVycm9yQ291bnQ6IGxvZ1NlcnZpY2UuZXJyb3JDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRlcnJvckNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQsXG5cdFx0XHRlcnJvckNvdW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZVJlYWQgbG9ncyBtaXNzaW5nIG5vbi1maWxlIHJlYWRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1yZWFkLW1pc3Npbmctc2Vzc2lvbi1kYicpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9ICdzZXNzaW9uLWRiOi9taXNzaW5nJztcblx0XHRhZ2VudFNlcnZpY2UucmVhZEVycm9ycy5zZXQocmVzb3VyY2UsIG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuTm90Rm91bmQsIGBDb250ZW50IG5vdCBmb3VuZDogJHtyZXNvdXJjZX1gKSk7XG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdyZXNvdXJjZVJlYWQnLCB7IHVyaTogcmVzb3VyY2UgfSkpO1xuXHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2UgYXMgeyBlcnJvcj86IHsgY29kZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmcgfSB9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlcnJvckNvZGU6IHJlc3AuZXJyb3I/LmNvZGUsXG5cdFx0XHRlcnJvckNvdW50OiBsb2dTZXJ2aWNlLmVycm9yQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0ZXJyb3JDb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLFxuXHRcdFx0ZXJyb3JDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBFeHRlbnNpb24gbWV0aG9kczogYXV0aCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnYXV0aGVudGljYXRlIHJldHVybnMgcmVzdWx0IHZpYSB0eXBlZCByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1hdXRoJyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblxuXHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnYXV0aGVudGljYXRlJywgeyByZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCB0b2tlbjogJ3Rlc3QtdG9rZW4nIH0pKTtcblx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlIGFzIHsgcmVzdWx0PzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47IGVycm9yPzogeyBjb2RlOiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZyB9IH07XG5cblx0XHRhc3NlcnQub2soIXJlc3AuZXJyb3IsIGB1bmV4cGVjdGVkIGVycm9yOiAke3Jlc3AuZXJyb3I/Lm1lc3NhZ2V9YCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNwLnJlc3VsdCwge30pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcyByZXR1cm5zIHByb3ZpZGVyIFNESyBzbmFwc2hvdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRTZXJ2aWNlLm1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzID0gW3tcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRzbmFwc2hvdDoge1xuXHRcdFx0XHRzb3VyY2U6ICdkZXZpY2UnLFxuXHRcdFx0XHRzZXJ2ZXJNYW5hZ2VkOiBmYWxzZSxcblx0XHRcdFx0ZGV2aWNlTWFuYWdlZDogdHJ1ZSxcblx0XHRcdFx0ZmFpbENsb3NlZDogZmFsc2UsXG5cdFx0XHRcdGJ5cGFzc1Blcm1pc3Npb25zRGlzYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRtYW5hZ2VkS2V5czogWydwZXJtaXNzaW9ucyddLFxuXHRcdFx0XHRzZXR0aW5nczogeyBwZXJtaXNzaW9uczogeyBhbGxvdzogWydTaGVsbChlY2hvICopJ10gfSB9LFxuXHRcdFx0fSxcblx0XHR9XTtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtbWFuYWdlZC1zZXR0aW5ncycpO1xuXHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHRjb25zdCByZXNwb25zZVByb21pc2UgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2dldE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzJykpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlIGFzIHsgcmVzdWx0PzogdW5rbm93bjsgZXJyb3I/OiB7IG1lc3NhZ2U6IHN0cmluZyB9IH07XG5cblx0XHRhc3NlcnQub2soIXJlc3BvbnNlLmVycm9yLCBgdW5leHBlY3RlZCBlcnJvcjogJHtyZXNwb25zZS5lcnJvcj8ubWVzc2FnZX1gKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3BvbnNlLnJlc3VsdCwgYWdlbnRTZXJ2aWNlLm1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0Q2xpZW50TWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMgdmFsaWRhdGVzIGFuZCBhdHRyaWJ1dGVzIGNvbnRyaWJ1dGlvbnMgdG8gdGhlIGNvbm5lY3RlZCBjbGllbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LW1hbmFnZWQtc2V0dGluZ3MtY29udHJpYnV0aW9uJyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2Uobm90aWZpY2F0aW9uKCdzZXRDbGllbnRNYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9ucycsIHtcblx0XHRcdHBlcm1pc3Npb25zOiB7IGRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGU6ICdkaXNhYmxlJywgYXNrOiBbJ1NoZWxsJ10gfSxcblx0XHR9KSk7XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShub3RpZmljYXRpb24oJ3NldENsaWVudE1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zJywge1xuXHRcdFx0cGVybWlzc2lvbnM6IHsgYWxsb3c6IFsnU2hlbGwnXSB9LFxuXHRcdH0pKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFuYWdlZFNldHRpbmdzU2VydmljZS5wZXJtaXNzaW9ucywge1xuXHRcdFx0ZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZTogJ2Rpc2FibGUnLFxuXHRcdFx0YXNrOiBbJ1NoZWxsJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3BlcyBtYW5hZ2VkIHNldHRpbmdzIGNvbnRyaWJ1dGlvbnMgdG8gZWFjaCBwcm90b2NvbCBoYW5kbGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0VHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnc2hhcmVkLWNsaWVudC1pZCcpO1xuXHRcdGZpcnN0VHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShub3RpZmljYXRpb24oJ3NldENsaWVudE1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zJywge1xuXHRcdFx0cGVybWlzc2lvbnM6IHsgYXNrOiBbJ1NoZWxsJ10gfSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBsb2NhbERpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3Qgc2Vjb25kU2VydmVyID0gbG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tQcm90b2NvbFNlcnZlcigpKTtcblx0XHRjb25zdCBzZWNvbmRIYW5kbGVyID0gbG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IFByb3RvY29sU2VydmVySGFuZGxlcihcblx0XHRcdGFnZW50U2VydmljZSxcblx0XHRcdHN0YXRlTWFuYWdlcixcblx0XHRcdHNlY29uZFNlcnZlcixcblx0XHRcdHsgZGVmYXVsdERpcmVjdG9yeTogVVJJLmZpbGUoJy9ob21lL3Rlc3R1c2VyJykudG9TdHJpbmcoKSB9LFxuXHRcdFx0bG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlcigpKSxcblx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdG1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsXG5cdFx0KSk7XG5cdFx0Y29uc3Qgc2Vjb25kVHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNlY29uZFNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24oc2Vjb25kVHJhbnNwb3J0KTtcblx0XHRzZWNvbmRUcmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sXG5cdFx0XHRjbGllbnRJZDogJ3NoYXJlZC1jbGllbnQtaWQnLFxuXHRcdH0pKTtcblx0XHRzZWNvbmRUcmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKG5vdGlmaWNhdGlvbignc2V0Q2xpZW50TWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMnLCB7XG5cdFx0XHRwZXJtaXNzaW9uczogeyBkaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlOiAnZGlzYWJsZScgfSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hbmFnZWRTZXR0aW5nc1NlcnZpY2UucGVybWlzc2lvbnMsIHtcblx0XHRcdGRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGU6ICdkaXNhYmxlJyxcblx0XHRcdGFzazogWydTaGVsbCddLFxuXHRcdH0pO1xuXG5cdFx0c2Vjb25kVHJhbnNwb3J0LnNpbXVsYXRlQ2xvc2UoKTtcblx0XHRzZWNvbmRIYW5kbGVyLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFuYWdlZFNldHRpbmdzU2VydmljZS5wZXJtaXNzaW9ucywgeyBhc2s6IFsnU2hlbGwnXSB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlcyBtYW5hZ2VkIHNldHRpbmdzIGNvbnRyaWJ1dGlvbnMgZm9yIGFjdGl2ZSBhbmQgZ3JhY2UgY2xpZW50cyBvbiBkaXNwb3NlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdGl2ZVRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1tYW5hZ2VkLXNldHRpbmdzLWFjdGl2ZScpO1xuXHRcdGFjdGl2ZVRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2Uobm90aWZpY2F0aW9uKCdzZXRDbGllbnRNYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9ucycsIHtcblx0XHRcdHBlcm1pc3Npb25zOiB7IGFzazogWydTaGVsbCddIH0sXG5cdFx0fSkpO1xuXHRcdGNvbnN0IGdyYWNlVHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LW1hbmFnZWQtc2V0dGluZ3MtZ3JhY2UnKTtcblx0XHRncmFjZVRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2Uobm90aWZpY2F0aW9uKCdzZXRDbGllbnRNYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9ucycsIHtcblx0XHRcdHBlcm1pc3Npb25zOiB7IGRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGU6ICdkaXNhYmxlJyB9LFxuXHRcdH0pKTtcblx0XHRncmFjZVRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hbmFnZWRTZXR0aW5nc1NlcnZpY2UucGVybWlzc2lvbnMsIHtcblx0XHRcdGRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGU6ICdkaXNhYmxlJyxcblx0XHRcdGFzazogWydTaGVsbCddLFxuXHRcdH0pO1xuXG5cdFx0aGFuZGxlci5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hbmFnZWRTZXR0aW5nc1NlcnZpY2UucGVybWlzc2lvbnMsIHt9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlcyBhIG1hbmFnZWQgc2V0dGluZ3MgY29udHJpYnV0aW9uIGFmdGVyIGRpc2Nvbm5lY3QgZ3JhY2UgZXhwaXJlcycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtbWFuYWdlZC1zZXR0aW5ncy1kaXNjb25uZWN0Jyk7XG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKG5vdGlmaWNhdGlvbignc2V0Q2xpZW50TWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMnLCB7XG5cdFx0XHRcdHBlcm1pc3Npb25zOiB7IGFzazogWydTaGVsbCddIH0sXG5cdFx0XHR9KSk7XG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMzBfMDAxKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFuYWdlZFNldHRpbmdzU2VydmljZS5wZXJtaXNzaW9ucywge30pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRlbnNpb24gcmVxdWVzdCBwcmVzZXJ2ZXMgUHJvdG9jb2xFcnJvciBjb2RlIGFuZCBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIE92ZXJyaWRlIGF1dGhlbnRpY2F0ZSB0byB0aHJvdyBhIFByb3RvY29sRXJyb3Igd2l0aCBkYXRhXG5cdFx0Y29uc3Qgb3JpZ0hhbmRsZXIgPSBhZ2VudFNlcnZpY2UuYXV0aGVudGljYXRlO1xuXHRcdGFnZW50U2VydmljZS5hdXRoZW50aWNhdGUgPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBQcm90b2NvbEVycm9yKC0zMjAwNywgJ0F1dGggcmVxdWlyZWQnLCB7IGhpbnQ6ICdzaWduIGluJyB9KTsgfTtcblxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1hdXRoLWVycm9yJyk7XG5cdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblxuXHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnYXV0aGVudGljYXRlJywgeyByZXNvdXJjZTogJ3Rlc3QnLCB0b2tlbjogJ2JhZCcgfSkpO1xuXHRcdGNvbnN0IHJlc3AgPSBhd2FpdCByZXNwb25zZVByb21pc2UgYXMgeyBlcnJvcj86IHsgY29kZTogbnVtYmVyOyBtZXNzYWdlOiBzdHJpbmc7IGRhdGE/OiB1bmtub3duIH0gfTtcblxuXHRcdGFzc2VydC5vayhyZXNwPy5lcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3AuZXJyb3IhLmNvZGUsIC0zMjAwNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3AuZXJyb3IhLm1lc3NhZ2UsICdBdXRoIHJlcXVpcmVkJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNwLmVycm9yIS5kYXRhLCB7IGhpbnQ6ICdzaWduIGluJyB9KTtcblxuXHRcdGFnZW50U2VydmljZS5hdXRoZW50aWNhdGUgPSBvcmlnSGFuZGxlcjtcblx0fSk7XG5cblx0Ly8gLS0tLSBDb25uZWN0aW9uIGNvdW50IGV2ZW50IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnb25EaWRDaGFuZ2VDb25uZWN0aW9uQ291bnQgZmlyZXMgb24gY29ubmVjdCBhbmQgZGlzY29ubmVjdCcsICgpID0+IHtcblx0XHRjb25zdCBjb3VudHM6IG51bWJlcltdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGhhbmRsZXIub25EaWRDaGFuZ2VDb25uZWN0aW9uQ291bnQoYyA9PiBjb3VudHMucHVzaChjKSkpO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LWNvdW50LTEnKTtcblx0XHRjb25uZWN0Q2xpZW50KCdjbGllbnQtY291bnQtMicpO1xuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvdW50cywgWzEsIDIsIDFdKTtcblx0fSk7XG5cblx0dGVzdCgnc2hhcmVzIGNvbm5lY3Rpb24gY291bnQgYWNyb3NzIE1lc3NhZ2VQb3J0IGFuZCBleHRlcm5hbCBsaXN0ZW5lcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxEaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IG1lc3NhZ2VQb3J0U2VydmVyID0gbmV3IE1lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXI8c3RyaW5nPigpO1xuXHRcdGNvbnN0IHNvY2tldFNlcnZlciA9IG5ldyBNb2NrUHJvdG9jb2xTZXJ2ZXIoKTtcblx0XHRjb25zdCBjb21iaW5lZFNlcnZlciA9IGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBDb21wb3NpdGVQcm90b2NvbFNlcnZlcihbbWVzc2FnZVBvcnRTZXJ2ZXIsIHNvY2tldFNlcnZlcl0pKTtcblx0XHRjb25zdCBjb21iaW5lZEhhbmRsZXIgPSBsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgUHJvdG9jb2xTZXJ2ZXJIYW5kbGVyKFxuXHRcdFx0YWdlbnRTZXJ2aWNlLFxuXHRcdFx0c3RhdGVNYW5hZ2VyLFxuXHRcdFx0Y29tYmluZWRTZXJ2ZXIsXG5cdFx0XHR7IGRlZmF1bHREaXJlY3Rvcnk6IFVSSS5maWxlKCcvaG9tZS90ZXN0dXNlcicpLnRvU3RyaW5nKCkgfSxcblx0XHRcdGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoKSksXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0TnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdGNvbnN0IGNvdW50czogbnVtYmVyW10gPSBbXTtcblx0XHRsb2NhbERpc3Bvc2FibGVzLmFkZChjb21iaW5lZEhhbmRsZXIub25EaWRDaGFuZ2VDb25uZWN0aW9uQ291bnQoY291bnQgPT4gY291bnRzLnB1c2goY291bnQpKSk7XG5cblx0XHRhd2FpdCBtZXNzYWdlUG9ydFNlcnZlci5jYWxsPHZvaWQ+KCdtZXNzYWdlLXBvcnQtY2xpZW50JywgJ2Nvbm5lY3QnKTtcblx0XHRhd2FpdCBtZXNzYWdlUG9ydFNlcnZlci5jYWxsPHZvaWQ+KCdtZXNzYWdlLXBvcnQtY2xpZW50JywgJ3NlbmQnLCBKU09OLnN0cmluZ2lmeShyZXF1ZXN0KDEsICdpbml0aWFsaXplJywge1xuXHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0Y2xpZW50SWQ6ICdtZXNzYWdlLXBvcnQtY2xpZW50Jyxcblx0XHR9KSkpO1xuXG5cdFx0Y29uc3Qgc29ja2V0VHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdHNvY2tldFNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24oc29ja2V0VHJhbnNwb3J0KTtcblx0XHRzb2NrZXRUcmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbUFJPVE9DT0xfVkVSU0lPTl0sXG5cdFx0XHRjbGllbnRJZDogJ3NvY2tldC1jbGllbnQnLFxuXHRcdH0pKTtcblxuXHRcdG1lc3NhZ2VQb3J0U2VydmVyLmNsb3NlQ2xpZW50KCdtZXNzYWdlLXBvcnQtY2xpZW50Jyk7XG5cdFx0c29ja2V0VHJhbnNwb3J0LnNpbXVsYXRlQ2xvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY291bnRzLCBbMSwgMiwgMSwgMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZUNvbm5lY3Rpb25Db3VudCBpcyBub3QgZGVjcmVtZW50ZWQgYnkgc3RhbGUgcmVjb25uZWN0IGNsb3NlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvdW50czogbnVtYmVyW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaGFuZGxlci5vbkRpZENoYW5nZUNvbm5lY3Rpb25Db3VudChjID0+IGNvdW50cy5wdXNoKGMpKSk7XG5cblx0XHQvLyBDb25uZWN0XG5cdFx0Y29uc3QgdHJhbnNwb3J0MSA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC1yYycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY291bnRzLCBbMV0pO1xuXG5cdFx0Ly8gUmVjb25uZWN0IHdpdGggc2FtZSBjbGllbnRJZCAobmV3IGFjdGl2ZSB0cmFuc3BvcnQpXG5cdFx0Y29uc3QgdHJhbnNwb3J0MiA9IG5ldyBNb2NrUHJvdG9jb2xUcmFuc3BvcnQoKTtcblx0XHRzZXJ2ZXIuc2ltdWxhdGVDb25uZWN0aW9uKHRyYW5zcG9ydDIpO1xuXHRcdHRyYW5zcG9ydDIuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMSwgJ3JlY29ubmVjdCcsIHtcblx0XHRcdGNsaWVudElkOiAnY2xpZW50LXJjJyxcblx0XHRcdGxhc3RTZWVuU2VydmVyU2VxOiAwLFxuXHRcdFx0c3Vic2NyaXB0aW9uczogW10sXG5cdFx0fSkpO1xuXHRcdC8vIENvdW50IGlzIHVuY2hhbmdlZCBiZWNhdXNlIHRoZSBsb2dpY2FsIGNsaWVudElkIGlzIGFscmVhZHkgY29ubmVjdGVkLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY291bnRzLCBbMSwgMV0pO1xuXG5cdFx0Ly8gT2xkIHRyYW5zcG9ydCBjbG9zZXMgLSBzaG91bGQgTk9UIGRlY3JlbWVudCBiZWNhdXNlIHRoZSBuZXdlclxuXHRcdC8vIHRyYW5zcG9ydCBpcyBzdGlsbCBjb25uZWN0ZWQuXG5cdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb3VudHMsIFsxLCAxXSk7XG5cblx0XHQvLyBOZXcgdHJhbnNwb3J0IGNsb3NlcyAtIHNob3VsZCBkZWNyZW1lbnRcblx0XHR0cmFuc3BvcnQyLnNpbXVsYXRlQ2xvc2UoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvdW50cywgWzEsIDEsIDBdKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBjcmVhdGVTZXNzaW9uIGFjdGl2ZUNsaWVudCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2NyZWF0ZVNlc3Npb24gYWN0aXZlQ2xpZW50JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgYWN0aXZlQ2xpZW50IHRvIHRoZSBhZ2VudCBzZXJ2aWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IFVSSS5wYXJzZSgnY29waWxvdDovLy9lYWdlci1zZXNzaW9uJykudG9TdHJpbmcoKTtcblxuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LTEnKTtcblx0XHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdjcmVhdGVTZXNzaW9uJywge1xuXHRcdFx0XHRzZXNzaW9uOiBuZXdTZXNzaW9uLFxuXHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRjbGllbnRJZDogJ2NsaWVudC0xJyxcblx0XHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3QxJywgZGVzY3JpcHRpb246ICdkJywgaW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcgfSB9XSxcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uczogW3sgdXJpOiAnZmlsZTovLy9wbHVnaW4tYScsIGRpc3BsYXlOYW1lOiAnQScgfV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcG9uc2VQcm9taXNlIGFzIHsgcmVzdWx0PzogdW5rbm93bjsgZXJyb3I/OiB1bmtub3duIH07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwLmVycm9yLCB1bmRlZmluZWQsICdjcmVhdGVTZXNzaW9uIHNob3VsZCBzdWNjZWVkJyk7XG5cdFx0XHRjb25zdCBjb25maWcgPSBhZ2VudFNlcnZpY2UuY3JlYXRlU2Vzc2lvbkNvbmZpZ3MuYXQoLTEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNsaWVudElkOiBjb25maWc/LmFjdGl2ZUNsaWVudD8uY2xpZW50SWQsXG5cdFx0XHRcdHRvb2xOYW1lOiBjb25maWc/LmFjdGl2ZUNsaWVudD8udG9vbHNbMF0/Lm5hbWUsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25Vcmk6IGNvbmZpZz8uYWN0aXZlQ2xpZW50Py5jdXN0b21pemF0aW9ucz8uWzBdLnVyaSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAndDEnLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uVXJpOiAnZmlsZTovLy9wbHVnaW4tYScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgY3JlYXRlU2Vzc2lvbiB3aGVuIGFjdGl2ZUNsaWVudC5jbGllbnRJZCBtaXNtYXRjaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IFVSSS5wYXJzZSgnY29waWxvdDovLy9taXNtYXRjaC1zZXNzaW9uJykudG9TdHJpbmcoKTtcblxuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LTEnKTtcblx0XHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cblx0XHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdjcmVhdGVTZXNzaW9uJywge1xuXHRcdFx0XHRzZXNzaW9uOiBuZXdTZXNzaW9uLFxuXHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRjbGllbnRJZDogJ290aGVyLWNsaWVudCcsXG5cdFx0XHRcdFx0dG9vbHM6IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHJlc3BvbnNlUHJvbWlzZSBhcyB7IHJlc3VsdD86IHVua25vd247IGVycm9yPzogeyBjb2RlOiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZyB9IH07XG5cblx0XHRcdGFzc2VydC5vayhyZXNwLmVycm9yLCAncmVzcG9uc2Ugc2hvdWxkIGJlIGFuIGVycm9yJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcC5yZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRTZXJ2aWNlLmNyZWF0ZVNlc3Npb25Db25maWdzLmxlbmd0aCwgMCwgJ2FnZW50IHNlcnZpY2Ugc2hvdWxkIG5vdCBoYXZlIGJlZW4gY2FsbGVkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdPVExQIGxvZ3MgY2hhbm5lbCcsICgpID0+IHtcblx0XHQvLyBXZSBuZWVkIGEgc2VwYXJhdGUgaGFuZGxlciBpbnN0YW5jZSB0aGF0IGhhcyBhbiBPdGxwTG9nRW1pdHRlclxuXHRcdC8vIGF0dGFjaGVkLCBzbyBzcGluIG9uZSB1cCBwZXItdGVzdCB1c2luZyBhIHByaXZhdGUgc3RhdGUgbWFuYWdlci5cblx0XHQvLyBUaGUgb3V0ZXItc3VpdGUgaGFuZGxlciBpcyBsZWZ0IGFsb25lIGFuZCBjb250aW51ZXMgdG8gdGVzdCB0aGVcblx0XHQvLyBcIm5vIE9UTFBcIiBjb2RlIHBhdGggaW1wbGljaXRseS5cblx0XHRsZXQgb3RscEVtaXR0ZXI6IE90bHBMb2dFbWl0dGVyO1xuXHRcdGxldCBvdGxwU3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdFx0bGV0IG90bHBTZXJ2ZXI6IE1vY2tQcm90b2NvbFNlcnZlcjtcblx0XHRsZXQgb3RscEFnZW50U2VydmljZTogTW9ja0FnZW50U2VydmljZTtcblx0XHRsZXQgbG9jYWxEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0bG9jYWxEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdG90bHBFbWl0dGVyID0gbG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IE90bHBMb2dFbWl0dGVyKCkpO1xuXHRcdFx0b3RscFN0YXRlTWFuYWdlciA9IGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdG90bHBTZXJ2ZXIgPSBsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1Byb3RvY29sU2VydmVyKCkpO1xuXHRcdFx0b3RscEFnZW50U2VydmljZSA9IG5ldyBNb2NrQWdlbnRTZXJ2aWNlKCk7XG5cdFx0XHRvdGxwQWdlbnRTZXJ2aWNlLnNldFN0YXRlTWFuYWdlcihvdGxwU3RhdGVNYW5hZ2VyKTtcblx0XHRcdGxvY2FsRGlzcG9zYWJsZXMuYWRkKG90bHBBZ2VudFNlcnZpY2UpO1xuXHRcdFx0bG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IFByb3RvY29sU2VydmVySGFuZGxlcihcblx0XHRcdFx0b3RscEFnZW50U2VydmljZSxcblx0XHRcdFx0b3RscFN0YXRlTWFuYWdlcixcblx0XHRcdFx0b3RscFNlcnZlcixcblx0XHRcdFx0eyBkZWZhdWx0RGlyZWN0b3J5OiBVUkkuZmlsZSgnL2hvbWUvdGVzdHVzZXInKS50b1N0cmluZygpLCBvdGxwTG9nRW1pdHRlcjogb3RscEVtaXR0ZXIgfSxcblx0XHRcdFx0bG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlcigpKSxcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLFxuXHRcdFx0KSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRsb2NhbERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIGNvbm5lY3RPdGxwQ2xpZW50KGNsaWVudElkOiBzdHJpbmcsIGluaXRpYWxTdWJzY3JpcHRpb25zPzogcmVhZG9ubHkgc3RyaW5nW10pOiBNb2NrUHJvdG9jb2xUcmFuc3BvcnQge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gbmV3IE1vY2tQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdFx0b3RscFNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0KTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAnaW5pdGlhbGl6ZScsIHtcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0XHRjbGllbnRJZCxcblx0XHRcdFx0aW5pdGlhbFN1YnNjcmlwdGlvbnMsXG5cdFx0XHR9KSk7XG5cdFx0XHRyZXR1cm4gdHJhbnNwb3J0O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGZpbmRPdGxwTG9ncyhzZW50OiBQcm90b2NvbE1lc3NhZ2VbXSk6IHsgY2hhbm5lbDogc3RyaW5nOyBwYXlsb2FkOiB1bmtub3duIH1bXSB7XG5cdFx0XHRyZXR1cm4gc2VudFxuXHRcdFx0XHQuZmlsdGVyKGlzSnNvblJwY05vdGlmaWNhdGlvbilcblx0XHRcdFx0LmZpbHRlcigobSk6IG0gaXMgQWhwTm90aWZpY2F0aW9uICYgeyBtZXRob2Q6ICdvdGxwL2V4cG9ydExvZ3MnOyBwYXJhbXM6IHsgY2hhbm5lbDogc3RyaW5nOyBwYXlsb2FkOiB1bmtub3duIH0gfSA9PiBtLm1ldGhvZCA9PT0gJ290bHAvZXhwb3J0TG9ncycpXG5cdFx0XHRcdC5tYXAobSA9PiAoeyBjaGFubmVsOiBtLnBhcmFtcy5jaGFubmVsLCBwYXlsb2FkOiBtLnBhcmFtcy5wYXlsb2FkIH0pKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdoYW5kc2hha2UgYWR2ZXJ0aXNlcyB0aGUgbG9ncyBjaGFubmVsIHRlbXBsYXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdE90bHBDbGllbnQoJ2NsaWVudC1vdGxwLTEnKTtcblx0XHRcdGNvbnN0IHJlc3AgPSBmaW5kUmVzcG9uc2UodHJhbnNwb3J0LnNlbnQsIDEpIGFzIHsgcmVzdWx0OiBJbml0aWFsaXplUmVzdWx0ICYgeyB0ZWxlbWV0cnk/OiB7IGxvZ3M/OiBzdHJpbmcgfSB9IH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3AucmVzdWx0LnRlbGVtZXRyeSwgeyBsb2dzOiAnYWhwLW90bHA6Ly9sb2dzL3tsZXZlbH0nIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3Vic2NyaWJlIHRvIGxvZ3MgY2hhbm5lbCByZXR1cm5zIGFuIGVtcHR5IHN0YXRlbGVzcyByZXN1bHQgYW5kIHN0YXJ0cyBmb3J3YXJkaW5nIHJlY29yZHMgYXQtb3ItYWJvdmUgdGhlIHJlcXVlc3RlZCBsZXZlbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RPdGxwQ2xpZW50KCdjbGllbnQtb3RscC0yJyk7XG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogJ2FocC1vdGxwOi8vbG9ncy93YXJuJyB9KSk7XG5cdFx0XHRjb25zdCByZXNwID0gYXdhaXQgd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChyZXNwIGFzIHsgcmVzdWx0OiB1bmtub3duIH0pLnJlc3VsdCwge30pO1xuXG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMTAwMCcsIHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ2luZm8tbXNnJyB9KTtcblx0XHRcdG90bHBFbWl0dGVyLmVtaXQoeyB0aW1lVW5peE5hbm86ICcxMDAxJywgc2V2ZXJpdHlOdW1iZXI6IDEzLCBzZXZlcml0eVRleHQ6ICd3YXJuJywgYm9keTogJ3dhcm4tbXNnJyB9KTtcblx0XHRcdG90bHBFbWl0dGVyLmVtaXQoeyB0aW1lVW5peE5hbm86ICcxMDAyJywgc2V2ZXJpdHlOdW1iZXI6IDE3LCBzZXZlcml0eVRleHQ6ICdlcnJvcicsIGJvZHk6ICdlcnJvci1tc2cnIH0pO1xuXG5cdFx0XHRjb25zdCBsb2dzID0gZmluZE90bHBMb2dzKHRyYW5zcG9ydC5zZW50KTtcblx0XHRcdGNvbnN0IGJvZGllcyA9IGxvZ3MuZmxhdE1hcCgoeyBwYXlsb2FkIH0pID0+IFsuLi5pdGVyYXRlT3RscExvZ1JlY29yZHMocGF5bG9hZCldLm1hcChyID0+IHIuYm9keSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChib2RpZXMsIFsnd2Fybi1tc2cnLCAnZXJyb3ItbXNnJ10pO1xuXHRcdFx0Zm9yIChjb25zdCB7IGNoYW5uZWwgfSBvZiBsb2dzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFubmVsLCAnYWhwLW90bHA6Ly9sb2dzL3dhcm4nKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Vuc3Vic2NyaWJlIHN0b3BzIGZvcndhcmRpbmcgd2l0aG91dCBhZmZlY3Rpbmcgb3RoZXIgc3Vic2NyaWJlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhID0gY29ubmVjdE90bHBDbGllbnQoJ2NsaWVudC1vdGxwLWEnKTtcblx0XHRcdGNvbnN0IGIgPSBjb25uZWN0T3RscENsaWVudCgnY2xpZW50LW90bHAtYicpO1xuXG5cdFx0XHRjb25zdCBhU3Vic2NyaWJlZCA9IHdhaXRGb3JSZXNwb25zZShhLCAyKTtcblx0XHRcdGNvbnN0IGJTdWJzY3JpYmVkID0gd2FpdEZvclJlc3BvbnNlKGIsIDIpO1xuXHRcdFx0YS5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnc3Vic2NyaWJlJywgeyBjaGFubmVsOiAnYWhwLW90bHA6Ly9sb2dzL3RyYWNlJyB9KSk7XG5cdFx0XHRiLnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6ICdhaHAtb3RscDovL2xvZ3MvdHJhY2UnIH0pKTtcblx0XHRcdGF3YWl0IGFTdWJzY3JpYmVkO1xuXHRcdFx0YXdhaXQgYlN1YnNjcmliZWQ7XG5cblx0XHRcdG90bHBFbWl0dGVyLmVtaXQoeyB0aW1lVW5peE5hbm86ICcxJywgc2V2ZXJpdHlOdW1iZXI6IDksIHNldmVyaXR5VGV4dDogJ2luZm8nLCBib2R5OiAnZmlyc3QnIH0pO1xuXG5cdFx0XHRhLnNpbXVsYXRlTWVzc2FnZShub3RpZmljYXRpb24oJ3Vuc3Vic2NyaWJlJywgeyBjaGFubmVsOiAnYWhwLW90bHA6Ly9sb2dzL3RyYWNlJyB9KSk7XG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMicsIHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ3NlY29uZCcgfSk7XG5cblx0XHRcdGNvbnN0IGFCb2RpZXMgPSBmaW5kT3RscExvZ3MoYS5zZW50KS5mbGF0TWFwKCh7IHBheWxvYWQgfSkgPT4gWy4uLml0ZXJhdGVPdGxwTG9nUmVjb3JkcyhwYXlsb2FkKV0ubWFwKHIgPT4gci5ib2R5KSk7XG5cdFx0XHRjb25zdCBiQm9kaWVzID0gZmluZE90bHBMb2dzKGIuc2VudCkuZmxhdE1hcCgoeyBwYXlsb2FkIH0pID0+IFsuLi5pdGVyYXRlT3RscExvZ1JlY29yZHMocGF5bG9hZCldLm1hcChyID0+IHIuYm9keSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGE6IGFCb2RpZXMsIGI6IGJCb2RpZXMgfSwgeyBhOiBbJ2ZpcnN0J10sIGI6IFsnZmlyc3QnLCAnc2Vjb25kJ10gfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSBzdWJzY3JpcHRpb25zIHRvIGRpZmZlcmVudCBsZXZlbHMgZWFjaCByZWNlaXZlIHRoZWlyIG93biBiYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdE90bHBDbGllbnQoJ2NsaWVudC1vdGxwLW11bHRpJyk7XG5cdFx0XHRjb25zdCBzdWJzY3JpYmVkMiA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXHRcdFx0Y29uc3Qgc3Vic2NyaWJlZDMgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAzKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyLCAnc3Vic2NyaWJlJywgeyBjaGFubmVsOiAnYWhwLW90bHA6Ly9sb2dzL2luZm8nIH0pKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgzLCAnc3Vic2NyaWJlJywgeyBjaGFubmVsOiAnYWhwLW90bHA6Ly9sb2dzL2Vycm9yJyB9KSk7XG5cdFx0XHRhd2FpdCBzdWJzY3JpYmVkMjtcblx0XHRcdGF3YWl0IHN1YnNjcmliZWQzO1xuXG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMScsIHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ2luZm8tb25seScgfSk7XG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMicsIHNldmVyaXR5TnVtYmVyOiAxNywgc2V2ZXJpdHlUZXh0OiAnZXJyb3InLCBib2R5OiAnYm90aCcgfSk7XG5cblx0XHRcdGNvbnN0IGJ5Q2hhbm5lbCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmdbXT4oKTtcblx0XHRcdGZvciAoY29uc3QgeyBjaGFubmVsLCBwYXlsb2FkIH0gb2YgZmluZE90bHBMb2dzKHRyYW5zcG9ydC5zZW50KSkge1xuXHRcdFx0XHRjb25zdCBib2RpZXMgPSBbLi4uaXRlcmF0ZU90bHBMb2dSZWNvcmRzKHBheWxvYWQpXS5tYXAociA9PiByLmJvZHkpO1xuXHRcdFx0XHRieUNoYW5uZWwuc2V0KGNoYW5uZWwsIFsuLi4oYnlDaGFubmVsLmdldChjaGFubmVsKSA/PyBbXSksIC4uLmJvZGllc10pO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChPYmplY3QuZnJvbUVudHJpZXMoYnlDaGFubmVsKSwge1xuXHRcdFx0XHQnYWhwLW90bHA6Ly9sb2dzL2luZm8nOiBbJ2luZm8tb25seScsICdib3RoJ10sXG5cdFx0XHRcdCdhaHAtb3RscDovL2xvZ3MvZXJyb3InOiBbJ2JvdGgnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xpZW50IGRpc2Nvbm5lY3QgZHJvcHMgaXRzIE9UTFAgc3Vic2NyaXB0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RPdGxwQ2xpZW50KCdjbGllbnQtb3RscC1kaXNjb25uZWN0Jyk7XG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMiwgJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogJ2FocC1vdGxwOi8vbG9ncy90cmFjZScgfSkpO1xuXHRcdFx0YXdhaXQgd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMik7XG5cblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZUNsb3NlKCk7XG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMScsIHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ2FmdGVyLWNsb3NlJyB9KTtcblxuXHRcdFx0Ly8gQWZ0ZXIgY2xvc2UsIG5vIGZ1cnRoZXIgbm90aWZpY2F0aW9ucyBzaG91bGQgbGFuZCBvbiB0aGVcblx0XHRcdC8vIGRpc2Nvbm5lY3RlZCB0cmFuc3BvcnQuIChTYW5pdHk6IHRoZSBvbmx5IG1lc3NhZ2Ugd2UgZXhwZWN0XG5cdFx0XHQvLyB3YXMgdGhlIHN1YnNjcmliZSByZXNwb25zZSB3ZSBhbHJlYWR5IGNvbnN1bWVkLilcblx0XHRcdGNvbnN0IGxvZ3MgPSBmaW5kT3RscExvZ3ModHJhbnNwb3J0LnNlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2dzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1bnJlY29nbmlzZWQgYWhwLW90bHAgVVJJcyBkbyBub3QgY3Jhc2ggc3Vic2NyaWJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdE90bHBDbGllbnQoJ2NsaWVudC1vdGxwLWJhZCcpO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6ICdhaHAtb3RscDovL2xvZ3MvdmVyYm9zZScgfSkpO1xuXHRcdFx0Y29uc3QgcmVzcCA9IGF3YWl0IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgocmVzcCBhcyB7IHJlc3VsdDogdW5rbm93biB9KS5yZXN1bHQsIHt9LCAndW5rbm93biBsZXZlbCBzaG91bGQgYmUgYWNrbm93bGVkZ2VkIGFzIHN0YXRlbGVzcycpO1xuXG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMScsIHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ3doYXRldmVyJyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmluZE90bHBMb2dzKHRyYW5zcG9ydC5zZW50KSwgW10sICdubyByZWNvcmRzIHNob3VsZCBsZWFrIHRvIGFuIGludmFsaWQgbGV2ZWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1VSSSB2YXJpYW50cyB0aGF0IHBhcnNlIHRvIHRoZSBzYW1lIGxldmVsIGNvbGxhcHNlIHRvIG9uZSBjYW5vbmljYWwgc3Vic2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdE90bHBDbGllbnQoJ2NsaWVudC1vdGxwLWNhbm9uaWNhbCcpO1xuXHRcdFx0Y29uc3QgcjIgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0LCAyKTtcblx0XHRcdGNvbnN0IHIzID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMyk7XG5cdFx0XHRjb25zdCByNCA9IHdhaXRGb3JSZXNwb25zZSh0cmFuc3BvcnQsIDQpO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDIsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6ICdhaHAtb3RscDovL2xvZ3MvaW5mbycgfSkpO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDMsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6ICdhaHAtb3RscDovL2xvZ3MvaW5mbz9kdXA9MScgfSkpO1xuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShyZXF1ZXN0KDQsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6ICdhaHAtb3RscDovL2xvZ3MvaW5mbyNmcmFnJyB9KSk7XG5cdFx0XHRhd2FpdCByMjsgYXdhaXQgcjM7IGF3YWl0IHI0O1xuXG5cdFx0XHRvdGxwRW1pdHRlci5lbWl0KHsgdGltZVVuaXhOYW5vOiAnMScsIHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ29uY2UnIH0pO1xuXG5cdFx0XHRjb25zdCBsb2dzID0gZmluZE90bHBMb2dzKHRyYW5zcG9ydC5zZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2dzLmxlbmd0aCwgMSwgJ29uZSByZWNvcmQgc2hvdWxkIHByb2R1Y2UgZXhhY3RseSBvbmUgbm90aWZpY2F0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9nc1swXS5jaGFubmVsLCAnYWhwLW90bHA6Ly9sb2dzL2luZm8nLCAnY2hhbm5lbCBzaG91bGQgYmUgY2Fub25pY2FsaXNlZCcpO1xuXG5cdFx0XHQvLyBVbnN1YnNjcmliZSBzaG91bGQgcmVtb3ZlIHRoZSBjYW5vbmljYWwgZW50cnkgcmVnYXJkbGVzcyBvZlxuXHRcdFx0Ly8gd2hpY2ggVVJJIHZhcmlhbnQgdGhlIGNsaWVudCB1c2VzIHRvIHVuc3Vic2NyaWJlLlxuXHRcdFx0dHJhbnNwb3J0LnNpbXVsYXRlTWVzc2FnZShub3RpZmljYXRpb24oJ3Vuc3Vic2NyaWJlJywgeyBjaGFubmVsOiAnYWhwLW90bHA6Ly9sb2dzL2luZm8/ZHVwPTEnIH0pKTtcblx0XHRcdG90bHBFbWl0dGVyLmVtaXQoeyB0aW1lVW5peE5hbm86ICcyJywgc2V2ZXJpdHlOdW1iZXI6IDksIHNldmVyaXR5VGV4dDogJ2luZm8nLCBib2R5OiAnYWZ0ZXItdW5zdWInIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE90bHBMb2dzKHRyYW5zcG9ydC5zZW50KS5sZW5ndGgsIDEsICdubyBmdXJ0aGVyIG5vdGlmaWNhdGlvbnMgYWZ0ZXIgdW5zdWJzY3JpYmUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Rvd25sb2FkIHByb2dyZXNzIGNoYW5uZWwnLCAoKSA9PiB7XG5cdFx0Ly8gUHJvZ3Jlc3MgaXMgZW1pdHRlZCBvbiB0aGUgc3RhdGUgbWFuYWdlciAoc28gaXQgcmVhY2hlcyBib3RoIGxvY2FsXG5cdFx0Ly8gSVBDIGFuZCByZW1vdGUgV2ViU29ja2V0IHJlbmRlcmVycyB0aHJvdWdoIHRoZSBzYW1lIHBhdGggYXMgc2Vzc2lvblxuXHRcdC8vIG5vdGlmaWNhdGlvbnMpLiBUaGlzIHN1aXRlIHZlcmlmaWVzIHRoZSBoYW5kbGVyIGZvcndhcmRzIGVhY2ggZnJhbWUgdG9cblx0XHQvLyBjb25uZWN0ZWQgY2xpZW50cyBhcyBhIGBwcm9ncmVzc2Agbm90aWZpY2F0aW9uIG9uIHRoZSByb290IGNoYW5uZWwuXG5cdFx0Ly8gU3B1biB1cCBwZXItdGVzdCB3aXRoIGEgcHJpdmF0ZSBzdGF0ZSBtYW5hZ2VyIHNvIHRoZSBvdXRlciBzdWl0ZSBpc1xuXHRcdC8vIHVuYWZmZWN0ZWQuXG5cdFx0bGV0IGRsU3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdFx0bGV0IGRsU2VydmVyOiBNb2NrUHJvdG9jb2xTZXJ2ZXI7XG5cdFx0bGV0IGRsQWdlbnRTZXJ2aWNlOiBNb2NrQWdlbnRTZXJ2aWNlO1xuXHRcdGxldCBsb2NhbERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRsb2NhbERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0ZGxTdGF0ZU1hbmFnZXIgPSBsb2NhbERpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRkbFNlcnZlciA9IGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrUHJvdG9jb2xTZXJ2ZXIoKSk7XG5cdFx0XHRkbEFnZW50U2VydmljZSA9IG5ldyBNb2NrQWdlbnRTZXJ2aWNlKCk7XG5cdFx0XHRkbEFnZW50U2VydmljZS5zZXRTdGF0ZU1hbmFnZXIoZGxTdGF0ZU1hbmFnZXIpO1xuXHRcdFx0bG9jYWxEaXNwb3NhYmxlcy5hZGQoZGxBZ2VudFNlcnZpY2UpO1xuXHRcdFx0bG9jYWxEaXNwb3NhYmxlcy5hZGQobmV3IFByb3RvY29sU2VydmVySGFuZGxlcihcblx0XHRcdFx0ZGxBZ2VudFNlcnZpY2UsXG5cdFx0XHRcdGRsU3RhdGVNYW5hZ2VyLFxuXHRcdFx0XHRkbFNlcnZlcixcblx0XHRcdFx0eyBkZWZhdWx0RGlyZWN0b3J5OiBVUkkuZmlsZSgnL2hvbWUvdGVzdHVzZXInKS50b1N0cmluZygpIH0sXG5cdFx0XHRcdGxvY2FsRGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoKSksXG5cdFx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzU2VydmljZSxcblx0XHRcdCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0bG9jYWxEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHRmdW5jdGlvbiBjb25uZWN0RG93bmxvYWRDbGllbnQoY2xpZW50SWQ6IHN0cmluZyk6IE1vY2tQcm90b2NvbFRyYW5zcG9ydCB7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBuZXcgTW9ja1Byb3RvY29sVHJhbnNwb3J0KCk7XG5cdFx0XHRkbFNlcnZlci5zaW11bGF0ZUNvbm5lY3Rpb24odHJhbnNwb3J0KTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxLCAnaW5pdGlhbGl6ZScsIHtcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0XHRjbGllbnRJZCxcblx0XHRcdH0pKTtcblx0XHRcdHJldHVybiB0cmFuc3BvcnQ7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZmluZFByb2dyZXNzKHNlbnQ6IFByb3RvY29sTWVzc2FnZVtdKTogUHJvZ3Jlc3NQYXJhbXNbXSB7XG5cdFx0XHRyZXR1cm4gc2VudFxuXHRcdFx0XHQuZmlsdGVyKGlzSnNvblJwY05vdGlmaWNhdGlvbilcblx0XHRcdFx0LmZpbHRlcigobSk6IG0gaXMgQWhwTm90aWZpY2F0aW9uICYgeyBtZXRob2Q6ICdyb290L3Byb2dyZXNzJzsgcGFyYW1zOiBQcm9ncmVzc1BhcmFtcyB9ID0+IG0ubWV0aG9kID09PSAncm9vdC9wcm9ncmVzcycpXG5cdFx0XHRcdC5tYXAobSA9PiBtLnBhcmFtcyk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnZm9yd2FyZHMgZWFjaCBwcm9ncmVzcyBmcmFtZSB0byBjb25uZWN0ZWQgY2xpZW50cyBvbiB0aGUgcm9vdCBjaGFubmVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdERvd25sb2FkQ2xpZW50KCdjbGllbnQtZGwtMScpO1xuXG5cdFx0XHRkbFN0YXRlTWFuYWdlci5lbWl0UHJvZ3Jlc3MoeyBwcm9ncmVzc1Rva2VuOiAndDEnLCBwcm9ncmVzczogMCwgdG90YWw6IDEwMDAsIG1lc3NhZ2U6ICdDbGF1ZGUnIH0pO1xuXHRcdFx0ZGxTdGF0ZU1hbmFnZXIuZW1pdFByb2dyZXNzKHsgcHJvZ3Jlc3NUb2tlbjogJ3QxJywgcHJvZ3Jlc3M6IDUwMCwgdG90YWw6IDEwMDAsIG1lc3NhZ2U6ICdDbGF1ZGUnIH0pO1xuXHRcdFx0ZGxTdGF0ZU1hbmFnZXIuZW1pdFByb2dyZXNzKHsgcHJvZ3Jlc3NUb2tlbjogJ3QxJywgcHJvZ3Jlc3M6IDEwMDAsIHRvdGFsOiAxMDAwLCBtZXNzYWdlOiAnQ2xhdWRlJyB9KTtcblxuXHRcdFx0Y29uc3QgZnJhbWVzID0gZmluZFByb2dyZXNzKHRyYW5zcG9ydC5zZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnJhbWVzLm1hcChmID0+IGYucHJvZ3Jlc3MpLCBbMCwgNTAwLCAxMDAwXSk7XG5cdFx0XHRhc3NlcnQub2soZnJhbWVzLmV2ZXJ5KGYgPT4gZi5wcm9ncmVzc1Rva2VuID09PSAndDEnICYmIGYubWVzc2FnZSA9PT0gJ0NsYXVkZScgJiYgZi50b3RhbCA9PT0gMTAwMCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZyYW1lcy5ldmVyeShmID0+IChmIGFzIFByb2dyZXNzUGFyYW1zICYgeyBjaGFubmVsOiBzdHJpbmcgfSkuY2hhbm5lbCA9PT0gJ2FocC1yb290Oi8vJyksICdmcmFtZXMgYXJlIGJyb2FkY2FzdCBvbiB0aGUgcm9vdCBjaGFubmVsJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvdXJjZSB3YXRjaGVzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3Vic2NyaWJlIHRvIGEgcmVzb3VyY2Utd2F0Y2ggY2hhbm5lbCByZXR1cm5zIHRoZSBkZXNjcmlwdG9yICsgYnVtcHMgcmVmY291bnQ7IGVudmVsb3BlcyBhcmUgcm91dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gUHJlLXBvcHVsYXRlIHRoZSBtb2NrIHNvIGBvblJlc291cmNlV2F0Y2hTdWJzY3JpYmVkYCByZXR1cm5zXG5cdFx0XHQvLyBhIGRlc2NyaXB0b3IgXHUyMDE0IHRoaXMgaXMgdGhlIHJvbGUgdGhlIHByb2R1Y3Rpb24gYEFnZW50U2VydmljZWBcblx0XHRcdC8vIHBsYXlzIGFmdGVyIGl0IHBhcnNlcyB0aGUgY2hhbm5lbCBVUkkuXG5cdFx0XHRjb25zdCB3YXRjaENoYW5uZWwgPSAnYWhwLXJlc291cmNlLXdhdGNoOi9tb2NrLXdhdGNoJztcblx0XHRcdGNvbnN0IGRlc2NyaXB0b3IgPSB7IHJvb3Q6ICdmaWxlOi8vL3dvcmtzcGFjZScsIHJlY3Vyc2l2ZTogZmFsc2UgfTtcblx0XHRcdGFnZW50U2VydmljZS5saXZlV2F0Y2hEZXNjcmlwdG9ycy5zZXQod2F0Y2hDaGFubmVsLCBkZXNjcmlwdG9yKTtcblxuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LXdhdGNoJyk7XG5cdFx0XHR0cmFuc3BvcnQuc2VudC5sZW5ndGggPSAwO1xuXG5cdFx0XHRjb25zdCBzdWJQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMTAxKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxMDEsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHdhdGNoQ2hhbm5lbCB9KSk7XG5cdFx0XHRjb25zdCByZXNwID0gYXdhaXQgc3ViUHJvbWlzZTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IChyZXNwIGFzIHsgcmVzdWx0OiB7IHNuYXBzaG90OiBJU3RhdGVTbmFwc2hvdCB9IH0pLnJlc3VsdDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc25hcHNob3QucmVzb3VyY2UsIHdhdGNoQ2hhbm5lbCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5zbmFwc2hvdC5zdGF0ZSwgZGVzY3JpcHRvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50U2VydmljZS53YXRjaFN1YnNjcmliZUNhbGxzLCBbd2F0Y2hDaGFubmVsXSk7XG5cblx0XHRcdHRyYW5zcG9ydC5zZW50Lmxlbmd0aCA9IDA7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24od2F0Y2hDaGFubmVsLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUmVzb3VyY2VXYXRjaENoYW5nZWQsXG5cdFx0XHRcdGNoYW5nZXM6IHsgaXRlbXM6IFt7IHVyaTogJ2ZpbGU6Ly8vd29ya3NwYWNlL2EudHh0JywgdHlwZTogJ3VwZGF0ZWQnIGFzIG5ldmVyIH1dIH0sXG5cdFx0XHR9IGFzIHVua25vd24gYXMgUGFyYW1ldGVyczx0eXBlb2Ygc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uPlsxXSk7XG5cblx0XHRcdGNvbnN0IGFjdGlvbk1zZ3MgPSBmaW5kTm90aWZpY2F0aW9ucyh0cmFuc3BvcnQuc2VudCwgJ2FjdGlvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbk1zZ3MubGVuZ3RoLCAxLCAnc3Vic2NyaWJlciBzaG91bGQgcmVjZWl2ZSB0aGUgY2hhbmdlIGVudmVsb3BlJyk7XG5cdFx0XHRjb25zdCBlbnYgPSBhY3Rpb25Nc2dzWzBdLnBhcmFtcyBhcyB1bmtub3duIGFzIHsgY2hhbm5lbDogc3RyaW5nOyBhY3Rpb246IHsgdHlwZTogc3RyaW5nIH0gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnYuY2hhbm5lbCwgd2F0Y2hDaGFubmVsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnYuYWN0aW9uLnR5cGUsIEFjdGlvblR5cGUuUmVzb3VyY2VXYXRjaENoYW5nZWQpO1xuXG5cdFx0XHQvLyBFeHBsaWNpdCB1bnN1YnNjcmliZSBkcm9wcyB0aGUgcmVmY291bnQgdGhyb3VnaCB0aGUgYWdlbnQgc2VydmljZS5cblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2Uobm90aWZpY2F0aW9uKCd1bnN1YnNjcmliZScsIHsgY2hhbm5lbDogd2F0Y2hDaGFubmVsIH0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRTZXJ2aWNlLndhdGNoVW5zdWJzY3JpYmVDYWxscywgW3dhdGNoQ2hhbm5lbF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3Vic2NyaWJlIHRvIGFuIHVua25vd24gcmVzb3VyY2Utd2F0Y2ggY2hhbm5lbCBzdXJmYWNlcyBhIEpTT04tUlBDIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gY29ubmVjdENsaWVudCgnY2xpZW50LXdhdGNoLWJhZCcpO1xuXHRcdFx0dHJhbnNwb3J0LnNlbnQubGVuZ3RoID0gMDtcblx0XHRcdGNvbnN0IHJlc3BQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMTAyKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgxMDIsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6ICdhaHAtcmVzb3VyY2Utd2F0Y2g6L2JvZ3VzJyB9KSk7XG5cdFx0XHRjb25zdCByZXNwID0gYXdhaXQgcmVzcFByb21pc2U7XG5cdFx0XHRjb25zdCBlcnJvciA9IChyZXNwIGFzIHVua25vd24gYXMgeyBlcnJvcj86IHsgY29kZTogbnVtYmVyIH0gfSkuZXJyb3I7XG5cdFx0XHRhc3NlcnQub2soZXJyb3IsIGBleHBlY3RlZCBhbiBlcnJvciByZXNwb25zZSwgZ290ICR7SlNPTi5zdHJpbmdpZnkocmVzcCl9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGllbnQgZGlzY29ubmVjdCByZWxlYXNlcyB0aGUgd2F0Y2ggcmVmY291bnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3YXRjaENoYW5uZWwgPSAnYWhwLXJlc291cmNlLXdhdGNoOi9tb2NrLXdhdGNoLWRpc2Nvbm5lY3QnO1xuXHRcdFx0YWdlbnRTZXJ2aWNlLmxpdmVXYXRjaERlc2NyaXB0b3JzLnNldCh3YXRjaENoYW5uZWwsIHsgcm9vdDogJ2ZpbGU6Ly8vcm9vdCcsIHJlY3Vyc2l2ZTogZmFsc2UgfSk7XG5cblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGNvbm5lY3RDbGllbnQoJ2NsaWVudC13YXRjaC0yJyk7XG5cdFx0XHRjb25zdCBzdWJQcm9taXNlID0gd2FpdEZvclJlc3BvbnNlKHRyYW5zcG9ydCwgMjAwKTtcblx0XHRcdHRyYW5zcG9ydC5zaW11bGF0ZU1lc3NhZ2UocmVxdWVzdCgyMDAsICdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHdhdGNoQ2hhbm5lbCB9KSk7XG5cdFx0XHRhd2FpdCBzdWJQcm9taXNlO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudFNlcnZpY2Uud2F0Y2hTdWJzY3JpYmVDYWxscywgW3dhdGNoQ2hhbm5lbF0pO1xuXG5cdFx0XHR0cmFuc3BvcnQuc2ltdWxhdGVDbG9zZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudFNlcnZpY2Uud2F0Y2hVbnN1YnNjcmliZUNhbGxzLCBbd2F0Y2hDaGFubmVsXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvdmVybGFwcGluZyB0cmFuc3BvcnRzIHJlbGVhc2UgZWFjaCByZXNvdXJjZS13YXRjaCBzdWJzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3YXRjaENoYW5uZWwgPSAnYWhwLXJlc291cmNlLXdhdGNoOi9tb2NrLXdhdGNoLW92ZXJsYXAnO1xuXHRcdFx0YWdlbnRTZXJ2aWNlLmxpdmVXYXRjaERlc2NyaXB0b3JzLnNldCh3YXRjaENoYW5uZWwsIHsgcm9vdDogJ2ZpbGU6Ly8vcm9vdCcsIHJlY3Vyc2l2ZTogZmFsc2UgfSk7XG5cblx0XHRcdGNvbnN0IHRyYW5zcG9ydDEgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtd2F0Y2gtb3ZlcmxhcCcpO1xuXHRcdFx0Y29uc3Qgc3ViUHJvbWlzZTEgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0MSwgMjAwKTtcblx0XHRcdHRyYW5zcG9ydDEuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMjAwLCAnc3Vic2NyaWJlJywgeyBjaGFubmVsOiB3YXRjaENoYW5uZWwgfSkpO1xuXHRcdFx0YXdhaXQgc3ViUHJvbWlzZTE7XG5cblx0XHRcdGNvbnN0IHRyYW5zcG9ydDIgPSBjb25uZWN0Q2xpZW50KCdjbGllbnQtd2F0Y2gtb3ZlcmxhcCcpO1xuXHRcdFx0Y29uc3Qgc3ViUHJvbWlzZTIgPSB3YWl0Rm9yUmVzcG9uc2UodHJhbnNwb3J0MiwgMjAxKTtcblx0XHRcdHRyYW5zcG9ydDIuc2ltdWxhdGVNZXNzYWdlKHJlcXVlc3QoMjAxLCAnc3Vic2NyaWJlJywgeyBjaGFubmVsOiB3YXRjaENoYW5uZWwgfSkpO1xuXHRcdFx0YXdhaXQgc3ViUHJvbWlzZTI7XG5cblx0XHRcdHRyYW5zcG9ydDIuc2ltdWxhdGVDbG9zZSgpO1xuXHRcdFx0dHJhbnNwb3J0MS5zaW11bGF0ZUNsb3NlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdWJzY3JpYmVzOiBhZ2VudFNlcnZpY2Uud2F0Y2hTdWJzY3JpYmVDYWxscyxcblx0XHRcdFx0dW5zdWJzY3JpYmVzOiBhZ2VudFNlcnZpY2Uud2F0Y2hVbnN1YnNjcmliZUNhbGxzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdWJzY3JpYmVzOiBbd2F0Y2hDaGFubmVsLCB3YXRjaENoYW5uZWxdLFxuXHRcdFx0XHR1bnN1YnNjcmliZXM6IFt3YXRjaENoYW5uZWwsIHdhdGNoQ2hhbm5lbF0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0IsaUNBQWlDO0FBR2hFLFNBQVMsZ0JBQXNELHVCQUEyUDtBQUUxVCxTQUFTLGtCQUFrSztBQUMzSyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHVCQUF1QixrQkFBa0IsbUJBQW1CLHlCQUF5QixtQkFBbUIsZUFBZSxlQUFlLGtDQUFrQyw2QkFBd047QUFDelksU0FBUyxhQUFhLGtCQUFrQixlQUFlLGlCQUFpQiw0QkFBNEIseUJBQXlCLGdCQUFnQix1QkFBdUIsY0FBYyxxQkFBcUIscUJBQXFCLDBCQUEwQixxQkFBcUIsZ0NBQXFEO0FBR2hVLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCLG9CQUFzRDtBQUM1RixTQUFTLGlDQUFpQyxpQ0FBaUMsMkJBQTJCO0FBQ3RHLFNBQVMsK0JB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
