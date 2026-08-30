import assert from "assert";
import sinon from "sinon";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostClientState, RemoteAgentHostProtocolClient } from "../../browser/remoteAgentHostProtocolClient.js";
import { AgentHostPermissionMode, AgentHostResourcePermissionError, LOCAL_AGENT_HOST_RESOURCE_IDENTITY } from "../../common/agentHostResourceService.js";
import { ConfigurationTarget } from "../../../configuration/common/configuration.js";
import { ContentEncoding, ReconnectResultType } from "../../common/state/protocol/commands.js";
import { ChatSourceKind } from "../../common/state/protocol/channels-chat/commands.js";
import { AhpErrorCodes } from "../../common/state/protocol/errors.js";
import { PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "../../common/state/protocol/version/registry.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ProtocolError } from "../../common/state/sessionProtocol.js";
import { hasKey } from "../../../../base/common/types.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { buildDefaultChatUri, CustomizationType, MessageAttachmentKind, MessageKind, PendingMessageKind, readSessionExternal, readSessionWorkspaceless, ROOT_STATE_URI, SessionStatus, StateComponents, customizationId, withSessionExternal, withSessionWorkspaceless } from "../../common/state/sessionState.js";
import { NonReconnectableTransportError } from "../../common/state/sessionTransport.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../telemetry/common/telemetryUtils.js";
import { AgentHostDisableRepoInfoTelemetryConfigKey, AgentHostTelemetryLevelConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, DISABLE_REPO_INFO_TELEMETRY_SETTING_ID, GLOBAL_AUTO_APPROVE_SETTING_ID, telemetryLevelToAgentHostConfigValue, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, TERMINAL_AUTO_APPROVE_SETTING_ID, TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID } from "../../common/agentHostSchema.js";
import { AgentHostMapLegacySettingsToManagedSettingsSettingId } from "../../common/agentHostManagedSettings.js";
import { Extensions as ConfigurationExtensions } from "../../../configuration/common/configurationRegistry.js";
import { Registry } from "../../../registry/common/platform.js";
const SYNC_SETTING_A = "test.remoteAgentHostProtocolClient.syncA";
const SYNC_CONFIG_KEY_A = "testSyncValueA";
const SYNC_SETTING_B = "test.remoteAgentHostProtocolClient.syncB";
const SYNC_CONFIG_KEY_B = "testSyncValueB";
const syncTestConfigurationNode = {
  id: "testRemoteAgentHostProtocolClientSync",
  type: "object",
  properties: {
    [SYNC_SETTING_A]: {
      type: "boolean",
      default: false,
      agentHost: { key: SYNC_CONFIG_KEY_A }
    },
    [SYNC_SETTING_B]: {
      type: "boolean",
      default: false,
      agentHost: { key: SYNC_CONFIG_KEY_B }
    }
  }
};
import { agentsWindowAgentHostClientInfo } from "../../common/agentHostClientInfo.js";
import { AgentHostClientConnectionKind } from "../../common/agentHostTelemetry.js";
class TestClientIdentityTelemetryService {
  constructor() {
    this.telemetryLevel = TelemetryLevel.USAGE;
    this.sessionId = "client-session-id";
    this.machineId = "client-machine-id";
    this.sqmId = "client-sqm-id";
    this.devDeviceId = "client-dev-device-id";
    this.firstSessionDate = "2026-08-14";
    this.sendErrorTelemetry = true;
  }
  publicLog() {
  }
  publicLog2() {
  }
  publicLogError() {
  }
  publicLogError2() {
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
}
function isPingRequest(msg) {
  return hasKey(msg, { method: true, id: true }) && msg.method === "ping";
}
function findRootConfigNotification(messages, configKey) {
  const match = messages.find((msg) => {
    if (!hasKey(msg, { method: true }) || msg.method !== "dispatchAction") {
      return false;
    }
    const params = msg.params;
    return params?.action?.type === ActionType.RootConfigChanged && !!params.action.config && configKey in params.action.config;
  });
  assert.ok(match, `Expected a RootConfigChanged notification carrying '${configKey}'`);
  return match;
}
function getRootConfig(notification) {
  const params = notification.params;
  assert.ok(params?.action?.config);
  return params.action.config;
}
function findLastRootConfigNotification(messages, configKey) {
  return findRootConfigNotification([...messages].reverse(), configKey);
}
function findLastManagedSettingsNotification(messages) {
  const match = [...messages].reverse().find((message) => hasKey(message, { method: true }) && message.method === "setClientManagedSettingsPermissions");
  assert.ok(match, "Expected a setClientManagedSettingsPermissions notification");
  return match;
}
function findRootConfigValue(messages, configKey) {
  return getRootConfig(findRootConfigNotification(messages, configKey))[configKey];
}
class TestProtocolTransport extends Disposable {
  constructor(clientConnectionKind) {
    super();
    this.clientConnectionKind = clientConnectionKind;
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
    this._onClose = this._register(new Emitter());
    this.onClose = this._onClose.event;
    this.sentMessages = [];
  }
  send(message) {
    this.sentMessages.push(message);
  }
  fireMessage(message) {
    this._onMessage.fire(message);
  }
  fireClose() {
    this._onClose.fire();
  }
}
class TestClientProtocolTransport extends TestProtocolTransport {
  constructor() {
    super(...arguments);
    this.connectDeferred = new DeferredPromise();
  }
  connect() {
    return this.connectDeferred.p;
  }
}
class CloseOnDisposeProtocolTransport extends TestProtocolTransport {
  dispose() {
    this.fireClose();
    super.dispose();
  }
}
class CountingLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.warnCount = 0;
  }
  warn(_message, ..._args) {
    this.warnCount++;
  }
}
class TerminalAutoApproveConfigurationService extends TestConfigurationService {
  constructor(configuration, _terminalAutoApproveInspectValue) {
    super(configuration);
    this._terminalAutoApproveInspectValue = _terminalAutoApproveInspectValue;
  }
  inspect(key) {
    if (key === TERMINAL_AUTO_APPROVE_SETTING_ID) {
      return this._terminalAutoApproveInspectValue;
    }
    return super.inspect(key);
  }
}
class ManagedPermissionsConfigurationService extends TestConfigurationService {
  constructor() {
    super(...arguments);
    this.globalAutoApprovePolicyValue = false;
  }
  inspect(key) {
    if (key === GLOBAL_AUTO_APPROVE_SETTING_ID) {
      return {
        ...super.inspect(key),
        policyValue: this.globalAutoApprovePolicyValue
      };
    }
    return super.inspect(key);
  }
  clearGlobalAutoApprovePolicy() {
    this.globalAutoApprovePolicyValue = void 0;
  }
}
suite("RemoteAgentHostProtocolClient", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
  suiteSetup(() => configurationRegistry.registerConfiguration(syncTestConfigurationNode));
  suiteTeardown(() => configurationRegistry.deregisterConfigurations([syncTestConfigurationNode]));
  function createPermissionService(allow = true) {
    return createResourceServiceStub({ granted: () => allow });
  }
  function createResourceServiceStub(opts = {}) {
    const grant = opts.granted ?? (() => true);
    const empty = observableValue("test", []);
    const denyRead = (uri) => new AgentHostResourcePermissionError({ channel: "ahp-root://", uri, read: true });
    const denyWrite = (uri) => new AgentHostResourcePermissionError({ channel: "ahp-root://", uri, write: true });
    const gateRead = async (identity, uri) => {
      if (!grant(identity, uri, AgentHostPermissionMode.Read)) {
        throw denyRead(uri.toString());
      }
    };
    const gateWrite = async (identity, uri) => {
      if (!grant(identity, uri, AgentHostPermissionMode.Write)) {
        throw denyWrite(uri.toString());
      }
    };
    return {
      _serviceBrand: void 0,
      check: async (addr, uri, mode) => grant(addr, uri, mode),
      async list(addr, uri) {
        await gateRead(addr, uri);
        return { entries: [] };
      },
      async read(addr, uri) {
        await gateRead(addr, uri);
        if (opts.readBytes) {
          return { bytes: opts.readBytes };
        }
        throw new Error("Not implemented in stub");
      },
      async write(addr, params) {
        await gateWrite(addr, URI.parse(params.uri));
      },
      async del(addr, params) {
        await gateWrite(addr, URI.parse(params.uri));
      },
      async move(addr, params) {
        await gateWrite(addr, URI.parse(params.source));
        await gateWrite(addr, URI.parse(params.destination));
      },
      async copy(addr, params) {
        await gateRead(addr, URI.parse(params.source));
        await gateWrite(addr, URI.parse(params.destination));
      },
      async resolve(addr, params) {
        await gateRead(addr, URI.parse(params.uri));
        throw new Error("Not implemented in stub");
      },
      async mkdir(addr, params) {
        await gateWrite(addr, URI.parse(params.uri));
      },
      request: async (addr, params) => opts.onRequest ? opts.onRequest(addr, params) : void 0,
      pendingFor: () => empty,
      allPending: empty,
      findPending: () => void 0,
      grantImplicitRead: (address, uri) => {
        opts.onGrantImplicitRead?.(address, uri);
        return opts.onRevokeImplicitRead ? toDisposable(() => opts.onRevokeImplicitRead?.(address, uri)) : Disposable.None;
      },
      connectionClosed: () => {
      }
    };
  }
  function createClientForIdentity(identity, transport = disposables.add(new TestProtocolTransport()), permissionService = createPermissionService(), loadEstimator, logService = new NullLogService(), configurationService = new TestConfigurationService(), clientId, clientInfo, telemetryService = NullTelemetryService) {
    const client = disposables.add(new RemoteAgentHostProtocolClient(identity, transport, loadEstimator, clientId, clientInfo, logService, permissionService, configurationService, telemetryService));
    return { client, transport, configurationService };
  }
  function createClient(transport = disposables.add(new TestProtocolTransport()), permissionService = createPermissionService(), loadEstimator, logService = new NullLogService(), configurationService = new TestConfigurationService(), clientId, clientInfo) {
    return createClientForIdentity("test.example:1234", transport, permissionService, loadEstimator, logService, configurationService, clientId, clientInfo);
  }
  async function connectClient(client, transport) {
    const connectPromise = client.connect();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const sent = transport.sentMessages[0];
    transport.fireMessage({
      jsonrpc: "2.0",
      id: sent.id,
      result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
    });
    await connectPromise;
  }
  test("initialize sends the local client telemetry identity only for usage telemetry", async () => {
    const transport = disposables.add(new TestProtocolTransport(AgentHostClientConnectionKind.RemoteExtensionHost));
    const { client } = createClientForIdentity("test.example:1234", transport, createPermissionService(), void 0, new NullLogService(), new TestConfigurationService(), void 0, agentsWindowAgentHostClientInfo, new TestClientIdentityTelemetryService());
    const connectPromise = client.connect();
    const initialize = transport.sentMessages[0];
    assert.deepStrictEqual(initialize.params._meta, {
      "vscode.clientConnectionKind": AgentHostClientConnectionKind.RemoteExtensionHost,
      "vscode.clientMachineId": "client-machine-id",
      "vscode.clientDevDeviceId": "client-dev-device-id"
    });
    transport.fireMessage({
      jsonrpc: "2.0",
      id: initialize.id,
      result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
    });
    await connectPromise;
    const noTelemetryTransport = disposables.add(new TestProtocolTransport());
    const noTelemetryClient = createClient(noTelemetryTransport).client;
    const noTelemetryConnectPromise = noTelemetryClient.connect();
    const noTelemetryInitialize = noTelemetryTransport.sentMessages[0];
    assert.strictEqual(noTelemetryInitialize.params._meta, void 0);
    noTelemetryTransport.fireMessage({
      jsonrpc: "2.0",
      id: noTelemetryInitialize.id,
      result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
    });
    await noTelemetryConnectPromise;
  });
  async function flushMicrotasks() {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  }
  function fireConfigurationChange(configurationService, settingId) {
    configurationService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectedKeys: /* @__PURE__ */ new Set([settingId]),
      change: { keys: [settingId], overrides: [] },
      affectsConfiguration: (configuration) => configuration === settingId
    });
  }
  async function assertRemoteProtocolError(promise, expected) {
    try {
      await promise;
      assert.fail("Expected promise to reject");
    } catch (error) {
      if (!(error instanceof ProtocolError)) {
        assert.fail(`Expected ProtocolError, got ${String(error)}`);
      }
      assert.strictEqual(error.code, expected.code);
      assert.strictEqual(error.message, expected.message);
      assert.deepStrictEqual(error.data, expected.data);
    }
  }
  test("completes matching response and removes it from pending requests", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.resourceList(URI.file("/workspace"));
    assert.deepStrictEqual(transport.sentMessages[0], {
      jsonrpc: "2.0",
      id: 1,
      method: "resourceList",
      params: { channel: "ahp-root://", uri: URI.file("/workspace").toString() }
    });
    transport.fireMessage({ jsonrpc: "2.0", id: 1, result: { entries: [] } });
    assert.deepStrictEqual(await resultPromise, { entries: [] });
    transport.fireMessage({ jsonrpc: "2.0", id: 1, result: { entries: [{ name: "late", type: "file" }] } });
    assert.strictEqual(transport.sentMessages.length, 1);
  });
  test("does not retain revoked authentication for reconnect replay", async () => {
    const { client, transport } = createClient();
    const authenticate = client.authenticate({ resource: "https://api.github.com", scopes: ["write:user", "read:user", "write:user"], token: "token" });
    const authenticateRequest = transport.sentMessages[0];
    transport.fireMessage({ jsonrpc: "2.0", id: authenticateRequest.id, result: { authenticated: true } });
    await authenticate;
    assert.deepStrictEqual(authenticateRequest.params, {
      channel: ROOT_STATE_URI,
      resource: "https://api.github.com",
      scopes: ["read:user", "write:user"],
      token: "token"
    });
    const revoke = client.authenticate({ resource: "https://api.github.com", scopes: ["write:user", "read:user"], token: "" });
    const revokeRequest = transport.sentMessages[1];
    transport.fireMessage({ jsonrpc: "2.0", id: revokeRequest.id, result: { authenticated: true } });
    await revoke;
    assert.deepStrictEqual([...client["_authentication"].values()], []);
  });
  test("listSessions carries the workspace-less marker back on _meta", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.listSessions();
    const sent = transport.sentMessages[0];
    transport.fireMessage({
      jsonrpc: "2.0",
      id: sent.id,
      result: {
        items: [{
          resource: "agent-session://copilotcli/quick-1",
          provider: "copilotcli",
          title: "Quick Chat",
          status: SessionStatus.Idle,
          createdAt: (/* @__PURE__ */ new Date(1e3)).toISOString(),
          modifiedAt: (/* @__PURE__ */ new Date(2e3)).toISOString(),
          workingDirectories: [URI.file("/home/user/.copilot/chats/quick-1").toString()],
          _meta: withSessionWorkspaceless(void 0, true)
        }]
      }
    });
    const sessions = await resultPromise;
    assert.deepStrictEqual(sessions.map((s) => readSessionWorkspaceless(s._meta)), [true]);
  });
  test("listSessions carries external provenance back on _meta", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.listSessions();
    const sent = transport.sentMessages[0];
    transport.fireMessage({
      jsonrpc: "2.0",
      id: sent.id,
      result: {
        items: [{
          resource: "agent-session://copilotcli/native-1",
          provider: "copilotcli",
          title: "Native Chat",
          status: SessionStatus.Idle,
          createdAt: (/* @__PURE__ */ new Date(1e3)).toISOString(),
          modifiedAt: (/* @__PURE__ */ new Date(2e3)).toISOString(),
          _meta: withSessionExternal(void 0, true)
        }]
      }
    });
    const sessions = await resultPromise;
    assert.deepStrictEqual(sessions.map((s) => readSessionExternal(s._meta)), [true]);
  });
  test("queues requests and notifications until a client transport initializes", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const resource = URI.file("/workspace");
    const request = client.resourceList(resource);
    client.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { preInitialize: true } });
    assert.strictEqual(transport.sentMessages.length, 0);
    disposables.add(client.onDidChangeConnectionState((state) => {
      if (state === AgentHostClientState.Connected) {
        client.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { onConnected: true } });
      }
    }));
    const connect = client.connect();
    await Promise.resolve();
    assert.strictEqual(transport.sentMessages.length, 0);
    transport.connectDeferred.complete();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const initialize = transport.sentMessages[0];
    assert.strictEqual(initialize.method, "initialize");
    transport.fireMessage({
      jsonrpc: "2.0",
      id: initialize.id,
      result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
    });
    await connect;
    const resourceList = transport.sentMessages.find((message) => hasKey(message, { method: true }) && message.method === "resourceList");
    assert.ok(resourceList);
    const actions = transport.sentMessages.filter((message) => hasKey(message, { method: true }) && message.method === "dispatchAction");
    const preInitialize = actions.find((action) => action.params.action?.config?.preInitialize === true);
    const onConnected = actions.find((action) => action.params.action?.config?.onConnected === true);
    assert.ok(preInitialize);
    assert.ok(onConnected);
    assert.ok(transport.sentMessages.indexOf(resourceList) < transport.sentMessages.indexOf(preInitialize));
    assert.ok(transport.sentMessages.indexOf(preInitialize) < transport.sentMessages.indexOf(onConnected));
    transport.fireMessage({ jsonrpc: "2.0", id: resourceList.id, result: { entries: [] } });
    assert.deepStrictEqual(await request, { entries: [] });
  });
  test("rejects queued requests and drops queued notifications when initialization fails", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const request = client.resourceList(URI.file("/workspace"));
    client.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { preInitialize: true } });
    assert.strictEqual(transport.sentMessages.length, 0);
    const connect = client.connect();
    transport.connectDeferred.complete();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const initialize = transport.sentMessages[0];
    const expected = { code: -32001, message: "Initialization failed" };
    const requestError = assertRemoteProtocolError(request, expected);
    const connectError = assertRemoteProtocolError(connect, expected);
    transport.fireMessage({ jsonrpc: "2.0", id: initialize.id, error: expected });
    await Promise.all([requestError, connectError]);
    assert.deepStrictEqual(transport.sentMessages, [initialize]);
  });
  test("waits for initialization before returning completion trigger characters", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const completionTriggerCharacters = client.getCompletionTriggerCharacters();
    let settled = false;
    void completionTriggerCharacters.then(() => settled = true);
    await Promise.resolve();
    assert.strictEqual(settled, false);
    const connect = client.connect();
    transport.connectDeferred.complete();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const initialize = transport.sentMessages[0];
    transport.fireMessage({
      jsonrpc: "2.0",
      id: initialize.id,
      result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [], completionTriggerCharacters: [".", "@"] }
    });
    await connect;
    assert.deepStrictEqual(await completionTriggerCharacters, [".", "@"]);
  });
  test("rejects completion trigger characters after an incompatible initialization", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const completionTriggerCharacters = assertRemoteProtocolError(client.getCompletionTriggerCharacters(), {
      code: AhpErrorCodes.UnsupportedProtocolVersion,
      message: "Protocol versions do not match"
    });
    const connect = client.connect();
    transport.connectDeferred.complete();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const initialize = transport.sentMessages[0];
    const connectError = assertRemoteProtocolError(connect, {
      code: AhpErrorCodes.UnsupportedProtocolVersion,
      message: "Protocol versions do not match"
    });
    transport.fireMessage({
      jsonrpc: "2.0",
      id: initialize.id,
      error: { code: AhpErrorCodes.UnsupportedProtocolVersion, message: "Protocol versions do not match" }
    });
    await Promise.all([completionTriggerCharacters, connectError]);
  });
  test("maps protocol-supported create session fork and progress token", async () => {
    const { client, transport } = createClient();
    await connectClient(client, transport);
    const session = URI.parse("ahp-session:/new");
    const source = URI.parse("ahp-session:/source");
    const creation = client.createSession({
      provider: "copilot",
      session,
      _meta: { multiRoot: { workspaceFile: "file:///demo.code-workspace" } },
      fork: { session: source, chat: URI.parse(buildDefaultChatUri(source)), turnIndex: 2, turnId: "turn-2" },
      progressToken: "progress-token"
    });
    const request = transport.sentMessages.find((message) => hasKey(message, { method: true }) && message.method === "createSession");
    assert.deepStrictEqual(request?.params, {
      channel: session.toString(),
      _meta: { multiRoot: { workspaceFile: "file:///demo.code-workspace" } },
      provider: "copilot",
      workingDirectories: void 0,
      fork: { session: source.toString(), turnId: "turn-2" },
      config: void 0,
      activeClient: void 0,
      progressToken: "progress-token"
    });
    assert.strictEqual(client.getInflightSessionCreate(session), creation);
    assert.ok(request);
    transport.fireMessage({ jsonrpc: "2.0", id: request.id, result: null });
    assert.strictEqual(await creation, session);
  });
  suite("createChat", () => {
    const sessionUri = URI.parse("ahp-session:/test");
    const chatUri = URI.parse("ahp-session:/test/chat-1");
    const sourceUri = URI.parse("ahp-session:/test/chat-0");
    test('forwards a fork source tagged with kind "fork"', async () => {
      const { client, transport } = createClient();
      const resultPromise = client.createChat(sessionUri, chatUri, { fork: { source: sourceUri, turnId: "turn-1" } });
      assert.deepStrictEqual(transport.sentMessages[0], {
        jsonrpc: "2.0",
        id: 1,
        method: "createChat",
        params: {
          channel: sessionUri.toString(),
          chat: chatUri.toString(),
          source: { kind: ChatSourceKind.Fork, chat: sourceUri.toString(), turnId: "turn-1" }
        }
      });
      transport.fireMessage({ jsonrpc: "2.0", id: 1, result: null });
      await resultPromise;
    });
    test('forwards a side chat (`/btw`) source tagged with kind "sideChat"', async () => {
      const { client, transport } = createClient();
      const selection = { text: "  selected text  ", responsePartId: "response-part-1" };
      const resultPromise = client.createChat(sessionUri, chatUri, { sideChat: { source: sourceUri, turnId: "turn-1", selection } });
      assert.deepStrictEqual(transport.sentMessages[0], {
        jsonrpc: "2.0",
        id: 1,
        method: "createChat",
        params: {
          channel: sessionUri.toString(),
          chat: chatUri.toString(),
          source: { kind: ChatSourceKind.SideChat, chat: sourceUri.toString(), turnId: "turn-1", selection }
        }
      });
      transport.fireMessage({ jsonrpc: "2.0", id: 1, result: null });
      await resultPromise;
    });
    test("omits source entirely when neither fork nor sideChat is requested", async () => {
      const { client, transport } = createClient();
      const resultPromise = client.createChat(sessionUri, chatUri);
      assert.deepStrictEqual(transport.sentMessages[0], {
        jsonrpc: "2.0",
        id: 1,
        method: "createChat",
        params: { channel: sessionUri.toString(), chat: chatUri.toString() }
      });
      transport.fireMessage({ jsonrpc: "2.0", id: 1, result: null });
      await resultPromise;
    });
  });
  test("preserves JSON-RPC error code and data", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.resourceRead(URI.file("/missing"));
    const data = { uri: URI.file("/missing").toString() };
    transport.fireMessage({ jsonrpc: "2.0", id: 1, error: { code: AhpErrorCodes.NotFound, message: "Missing resource", data } });
    await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.NotFound, message: "Missing resource", data });
  });
  test("does not warn for missing file resource reads", async () => {
    const logService = new CountingLogService();
    const { client, transport } = createClient(void 0, void 0, void 0, logService);
    const resultPromise = client.resourceRead(URI.file("/workspace/src/missing.ts"));
    transport.fireMessage({ jsonrpc: "2.0", id: 1, error: { code: AhpErrorCodes.NotFound, message: "Content not found" } });
    await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.NotFound, message: "Content not found" });
    assert.strictEqual(logService.warnCount, 0);
  });
  test("warns for non-file resource read NotFound errors", async () => {
    const logService = new CountingLogService();
    const { client, transport } = createClient(void 0, void 0, void 0, logService);
    const resultPromise = client.resourceRead(URI.parse("session-db:/missing"));
    transport.fireMessage({ jsonrpc: "2.0", id: 1, error: { code: AhpErrorCodes.NotFound, message: "Missing snapshot" } });
    await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.NotFound, message: "Missing snapshot" });
    assert.strictEqual(logService.warnCount, 1);
  });
  test("warns for non-read NotFound errors", async () => {
    const logService = new CountingLogService();
    const { client, transport } = createClient(void 0, void 0, void 0, logService);
    const resultPromise = client.resourceResolve({ channel: ROOT_STATE_URI, uri: URI.file("/workspace/src/missing.ts").toString() });
    transport.fireMessage({ jsonrpc: "2.0", id: 1, error: { code: AhpErrorCodes.NotFound, message: "Missing resource" } });
    await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.NotFound, message: "Missing resource" });
    assert.strictEqual(logService.warnCount, 1);
  });
  test("ignores response for unknown request id", () => {
    const { transport } = createClient();
    transport.fireMessage({ jsonrpc: "2.0", id: 99, result: null });
    assert.strictEqual(transport.sentMessages.length, 0);
  });
  test("rejects all pending requests on transport close", async () => {
    const { client, transport } = createClient();
    const first = client.resourceList(URI.file("/one"));
    const second = client.resourceRead(URI.file("/two"));
    let closeCount = 0;
    disposables.add(client.onDidClose(() => closeCount++));
    const firstRejected = assertRemoteProtocolError(first, { code: -32e3, message: "Connection closed: test.example:1234" });
    const secondRejected = assertRemoteProtocolError(second, { code: -32e3, message: "Connection closed: test.example:1234" });
    transport.fireClose();
    transport.fireClose();
    await firstRejected;
    await secondRejected;
    assert.strictEqual(closeCount, 1);
  });
  test("rejects pending requests on dispose", async () => {
    const { client } = createClient();
    const resultPromise = client.resourceList(URI.file("/workspace"));
    const rejected = assertRemoteProtocolError(resultPromise, { code: -32e3, message: "Connection disposed: test.example:1234" });
    client.dispose();
    await rejected;
  });
  test("dispose rejection wins when transport emits close while disposing", async () => {
    const transport = disposables.add(new CloseOnDisposeProtocolTransport());
    const { client } = createClient(transport);
    const resultPromise = client.resourceList(URI.file("/workspace"));
    const rejected = assertRemoteProtocolError(resultPromise, { code: -32e3, message: "Connection disposed: test.example:1234" });
    client.dispose();
    await rejected;
  });
  test("late response after close does not complete rejected request", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.resourceList(URI.file("/workspace"));
    const rejected = assertRemoteProtocolError(resultPromise, { code: -32e3, message: "Connection closed: test.example:1234" });
    transport.fireClose();
    transport.fireMessage({ jsonrpc: "2.0", id: 1, result: { entries: [] } });
    await rejected;
  });
  test("rejects requests started after transport close", async () => {
    const { client, transport } = createClient();
    transport.fireClose();
    await assertRemoteProtocolError(client.resourceList(URI.file("/workspace")), { code: -32e3, message: "Connection closed: test.example:1234" });
    assert.strictEqual(transport.sentMessages.length, 0);
  });
  test("rejects requests started after dispose", async () => {
    const { client, transport } = createClient();
    client.dispose();
    await assertRemoteProtocolError(client.resourceList(URI.file("/workspace")), { code: -32e3, message: "Connection disposed: test.example:1234" });
    assert.strictEqual(transport.sentMessages.length, 0);
  });
  test("liveness sends a ping when idle and force-closes after the ping ages out", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const lowLoad = { hasHighLoad: () => false };
      const { client, transport } = createClient(void 0, void 0, lowLoad);
      let closeCount = 0;
      disposables.add(client.onDidClose(() => closeCount++));
      await timeout(3e4);
      const pings = transport.sentMessages.filter(isPingRequest);
      assert.ok(pings.length >= 1, `expected at least 1 ping, got ${pings.length}`);
      assert.strictEqual(closeCount, 1);
      client.dispose();
    });
  });
  test("liveness keeps the connection open while pings are answered", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const lowLoad = { hasHighLoad: () => false };
      const { client, transport } = createClient(void 0, void 0, lowLoad);
      let closeCount = 0;
      disposables.add(client.onDidClose(() => closeCount++));
      let answered = 0;
      const dispose = mainWindow.setInterval(() => {
        for (const msg of transport.sentMessages) {
          if (isPingRequest(msg) && msg.id > answered) {
            answered = msg.id;
            transport.fireMessage({ jsonrpc: "2.0", id: msg.id, result: null });
          }
        }
      }, 1e3);
      await timeout(6e4);
      mainWindow.clearInterval(dispose);
      assert.strictEqual(closeCount, 0);
      assert.ok(answered >= 4, `expected several pings to have been answered, got ${answered}`);
      client.dispose();
    });
  });
  test("liveness is suppressed while local load is high", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const highLoad = { hasHighLoad: () => true };
      const { client } = createClient(void 0, void 0, highLoad);
      let closeCount = 0;
      disposables.add(client.onDidClose(() => closeCount++));
      await timeout(6e4);
      assert.strictEqual(closeCount, 0);
      client.dispose();
    });
  });
  test("liveness watchdog does not time out local child-process connections", async () => {
    const clock = sinon.useFakeTimers();
    const transport = disposables.add(new TestProtocolTransport(AgentHostClientConnectionKind.Local));
    const { client } = createClient(transport);
    let closeCount = 0;
    disposables.add(client.onDidClose(() => closeCount++));
    try {
      await clock.tickAsync(6e4);
      assert.deepStrictEqual({
        sentPing: transport.sentMessages.some(isPingRequest),
        closeCount
      }, {
        sentPing: true,
        closeCount: 0
      });
    } finally {
      client.dispose();
      clock.restore();
    }
  });
  test("liveness stops after the connection is closed", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const lowLoad = { hasHighLoad: () => false };
      const { client, transport } = createClient(void 0, void 0, lowLoad);
      let closeCount = 0;
      disposables.add(client.onDidClose(() => closeCount++));
      await timeout(3e4);
      assert.strictEqual(closeCount, 1, "should have force-closed once");
      const pingsAtClose = transport.sentMessages.filter(isPingRequest).length;
      await timeout(6e4);
      assert.strictEqual(closeCount, 1, "should not fire again after close");
      const pingsLater = transport.sentMessages.filter(isPingRequest).length;
      assert.strictEqual(pingsLater, pingsAtClose, "no further pings should be sent after close");
      client.dispose();
    });
  });
  test("inbound messages are dropped after close", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const { client, transport } = createClient();
      let actionCount = 0;
      disposables.add(client.onDidAction(() => actionCount++));
      const pending = client.resourceList(URI.file("/workspace"));
      const rejected = pending.catch((err2) => err2);
      await timeout(3e4);
      const err = await rejected;
      assert.ok(err instanceof ProtocolError);
      transport.fireMessage({ jsonrpc: "2.0", id: 1, result: { entries: [] } });
      const lateAction = {
        type: ActionType.SessionActiveClientRemoved,
        clientId: "c1"
      };
      transport.fireMessage({
        jsonrpc: "2.0",
        method: "action",
        params: { channel: "ahp-session:/test", action: lateAction, serverSeq: 1, origin: void 0 }
      });
      assert.strictEqual(actionCount, 0, "late action notifications must be ignored after close");
      client.dispose();
    });
  });
  test("rejects connect when transport closes before connect completes", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const rejected = assertRemoteProtocolError(client.connect(), { code: -32e3, message: "Connection closed: test.example:1234" });
    transport.fireClose();
    transport.connectDeferred.complete();
    await rejected;
    assert.strictEqual(transport.sentMessages.length, 0);
  });
  test("rejects connect when disposed before transport connect completes", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const rejected = assertRemoteProtocolError(client.connect(), { code: -32e3, message: "Connection disposed: test.example:1234" });
    client.dispose();
    await rejected;
    assert.strictEqual(transport.sentMessages.length, 0);
  });
  test("initialize handshake includes protocol version and client info", async () => {
    const transport = disposables.add(new TestClientProtocolTransport(AgentHostClientConnectionKind.DevTunnel));
    const clientInfo = agentsWindowAgentHostClientInfo;
    const { client } = createClient(transport, void 0, void 0, void 0, void 0, "renderer-client-id", clientInfo);
    const connectPromise = client.connect();
    transport.connectDeferred.complete();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const sent = transport.sentMessages[0];
    assert.strictEqual(sent.method, "initialize");
    const params = sent.params;
    assert.deepStrictEqual({
      protocolVersions: params.protocolVersions,
      clientId: params.clientId,
      clientInfo: params.clientInfo,
      _meta: params._meta
    }, {
      // Every negotiable version is offered so an older host can negotiate down,
      // newest first so a current host still picks it.
      protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
      clientId: "renderer-client-id",
      clientInfo,
      _meta: { "vscode.clientConnectionKind": "dev_tunnel" }
    });
    assert.strictEqual(params.protocolVersions[0], PROTOCOL_VERSION);
    transport.fireMessage({
      jsonrpc: "2.0",
      id: sent.id,
      result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
    });
    await connectPromise;
    const telemetryLevel = findRootConfigNotification(transport.sentMessages, AgentHostTelemetryLevelConfigKey);
    assert.deepStrictEqual(telemetryLevel, {
      jsonrpc: "2.0",
      method: "dispatchAction",
      params: {
        channel: ROOT_STATE_URI,
        clientSeq: 0,
        action: {
          type: ActionType.RootConfigChanged,
          config: { [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(TelemetryLevel.USAGE) }
        }
      }
    });
    const terminalAutoApproveRules = findRootConfigNotification(transport.sentMessages, AgentHostTerminalAutoApproveRulesConfigKey);
    assert.deepStrictEqual(terminalAutoApproveRules, {
      jsonrpc: "2.0",
      method: "dispatchAction",
      params: {
        channel: ROOT_STATE_URI,
        clientSeq: 0,
        action: {
          type: ActionType.RootConfigChanged,
          config: { [AgentHostTerminalAutoApproveRulesConfigKey]: {} }
        }
      }
    });
  });
  test("forwards every setting declaring `agentHost` on connect and when one changes", async () => {
    const configurationService = new TestConfigurationService({
      [SYNC_SETTING_A]: true,
      [SYNC_SETTING_B]: false
    });
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    assert.deepStrictEqual({
      a: findRootConfigValue(transport.sentMessages, SYNC_CONFIG_KEY_A),
      b: findRootConfigValue(transport.sentMessages, SYNC_CONFIG_KEY_B)
    }, {
      a: true,
      b: false
    });
    transport.sentMessages.length = 0;
    await configurationService.setUserConfiguration(SYNC_SETTING_A, false);
    fireConfigurationChange(configurationService, SYNC_SETTING_A);
    assert.deepStrictEqual(getRootConfig(findLastRootConfigNotification(transport.sentMessages, SYNC_CONFIG_KEY_A)), {
      [SYNC_CONFIG_KEY_A]: false
    });
  });
  test("forwards the repo-info telemetry debug switch on connect and change", async () => {
    const configurationService = new TestConfigurationService({ [DISABLE_REPO_INFO_TELEMETRY_SETTING_ID]: true });
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    const disabled = findRootConfigNotification(transport.sentMessages, AgentHostDisableRepoInfoTelemetryConfigKey);
    assert.deepStrictEqual(getRootConfig(disabled), { [AgentHostDisableRepoInfoTelemetryConfigKey]: true });
    transport.sentMessages.length = 0;
    await configurationService.setUserConfiguration(DISABLE_REPO_INFO_TELEMETRY_SETTING_ID, false);
    fireConfigurationChange(configurationService, DISABLE_REPO_INFO_TELEMETRY_SETTING_ID);
    const enabled = findLastRootConfigNotification(transport.sentMessages, AgentHostDisableRepoInfoTelemetryConfigKey);
    assert.deepStrictEqual(getRootConfig(enabled), { [AgentHostDisableRepoInfoTelemetryConfigKey]: false });
  });
  test("forwards and clears legacy managed permissions for the local host", async () => {
    const configurationService = new ManagedPermissionsConfigurationService({
      [AgentHostMapLegacySettingsToManagedSettingsSettingId]: true,
      [TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID]: false
    });
    const { client, transport } = createClientForIdentity(
      LOCAL_AGENT_HOST_RESOURCE_IDENTITY,
      disposables.add(new TestProtocolTransport()),
      createPermissionService(),
      void 0,
      new NullLogService(),
      configurationService
    );
    await connectClient(client, transport);
    assert.deepStrictEqual(findLastManagedSettingsNotification(transport.sentMessages), {
      jsonrpc: "2.0",
      method: "setClientManagedSettingsPermissions",
      params: {
        permissions: {
          disableBypassPermissionsMode: "disable",
          ask: ["Shell"]
        }
      }
    });
    transport.sentMessages.length = 0;
    configurationService.clearGlobalAutoApprovePolicy();
    await configurationService.setUserConfiguration(GLOBAL_AUTO_APPROVE_SETTING_ID, true);
    fireConfigurationChange(configurationService, GLOBAL_AUTO_APPROVE_SETTING_ID);
    await configurationService.setUserConfiguration(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, true);
    fireConfigurationChange(configurationService, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID);
    assert.deepStrictEqual(findLastManagedSettingsNotification(transport.sentMessages), {
      jsonrpc: "2.0",
      method: "setClientManagedSettingsPermissions",
      params: { permissions: {} }
    });
  });
  test("forwards terminal auto-approve rules on connect", async () => {
    const configurationService = new TestConfigurationService({
      [TERMINAL_AUTO_APPROVE_SETTING_ID]: {
        echo: null,
        python: true,
        "/^npm run build$/": { approve: true, matchCommandLine: true }
      }
    });
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    const terminalAutoApproveRules = findRootConfigNotification(transport.sentMessages, AgentHostTerminalAutoApproveRulesConfigKey);
    assert.deepStrictEqual(getRootConfig(terminalAutoApproveRules), {
      [AgentHostTerminalAutoApproveRulesConfigKey]: {
        echo: null,
        python: true,
        "/^npm run build$/": { approve: true, matchCommandLine: true }
      }
    });
  });
  test("redispatches terminal auto-approve rules when the rule setting changes", async () => {
    const configurationService = new TestConfigurationService();
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    transport.sentMessages.length = 0;
    await configurationService.setUserConfiguration(TERMINAL_AUTO_APPROVE_SETTING_ID, { python: true });
    fireConfigurationChange(configurationService, TERMINAL_AUTO_APPROVE_SETTING_ID);
    const terminalAutoApproveRules = findLastRootConfigNotification(transport.sentMessages, AgentHostTerminalAutoApproveRulesConfigKey);
    assert.deepStrictEqual(getRootConfig(terminalAutoApproveRules), {
      [AgentHostTerminalAutoApproveRulesConfigKey]: { python: true }
    });
  });
  test("redispatches terminal auto-approve rules when ignored defaults change", async () => {
    const configurationService = new TerminalAutoApproveConfigurationService({
      [TERMINAL_AUTO_APPROVE_SETTING_ID]: { echo: true, python: true }
    }, {
      default: { value: { echo: true } },
      user: { value: { python: true } }
    });
    const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), void 0, new NullLogService(), configurationService);
    await connectClient(client, transport);
    transport.sentMessages.length = 0;
    await configurationService.setUserConfiguration(TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID, true);
    fireConfigurationChange(configurationService, TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID);
    const terminalAutoApproveRules = findLastRootConfigNotification(transport.sentMessages, AgentHostTerminalAutoApproveRulesConfigKey);
    assert.deepStrictEqual(getRootConfig(terminalAutoApproveRules), {
      [AgentHostTerminalAutoApproveRulesConfigKey]: { python: true }
    });
  });
  test("rejects normal traffic but retains the transport for an incompatible protocol upgrade", async () => {
    const transport = disposables.add(new TestClientProtocolTransport());
    const { client } = createClient(transport);
    const connectPromise = client.connect();
    transport.connectDeferred.complete();
    while (transport.sentMessages.length === 0) {
      await Promise.resolve();
    }
    const sent = transport.sentMessages[0];
    transport.fireMessage({
      jsonrpc: "2.0",
      id: sent.id,
      error: {
        code: AhpErrorCodes.UnsupportedProtocolVersion,
        message: "Client offered protocol versions [0.1.0], but this server only supports 0.2.0.",
        data: { supportedVersions: ["0.2.0"], _meta: { vscodeUpgradeMethod: "_vscodeUpgrade" } }
      }
    });
    await assertRemoteProtocolError(connectPromise, {
      code: AhpErrorCodes.UnsupportedProtocolVersion,
      message: "Client offered protocol versions [0.1.0], but this server only supports 0.2.0.",
      data: { supportedVersions: ["0.2.0"], _meta: { vscodeUpgradeMethod: "_vscodeUpgrade" } }
    });
    assert.strictEqual(client.connectionState, AgentHostClientState.Incompatible);
    await assertRemoteProtocolError(client.resourceList(URI.file("/workspace")), {
      code: AhpErrorCodes.UnsupportedProtocolVersion,
      message: "Client offered protocol versions [0.1.0], but this server only supports 0.2.0.",
      data: { supportedVersions: ["0.2.0"], _meta: { vscodeUpgradeMethod: "_vscodeUpgrade" } }
    });
    client.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { dropped: true } });
    assert.strictEqual(transport.sentMessages.length, 1);
    const upgrade = client.triggerVscodeUpgrade("_vscodeUpgrade");
    const request = transport.sentMessages[1];
    assert.deepStrictEqual(request, {
      jsonrpc: "2.0",
      id: 2,
      method: "_vscodeUpgrade",
      params: {}
    });
    transport.fireMessage({ jsonrpc: "2.0", id: request.id, result: { ok: true, upgradeStarted: true } });
    assert.deepStrictEqual(await upgrade, { ok: true, upgradeStarted: true });
    transport.fireClose();
    assert.strictEqual(client.connectionState, AgentHostClientState.Closed);
  });
  test("sends shutdown as a JSON-RPC request shape", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.shutdown();
    assert.deepStrictEqual(transport.sentMessages[0], {
      jsonrpc: "2.0",
      id: 1,
      method: "shutdown",
      params: void 0
    });
    transport.fireMessage({ jsonrpc: "2.0", id: 1, result: null });
    await resultPromise;
  });
  test("rejects shutdown with structured JSON-RPC error", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.shutdown();
    transport.fireMessage({ jsonrpc: "2.0", id: 1, error: { code: AhpErrorCodes.TurnInProgress, message: "Turn in progress" } });
    await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.TurnInProgress, message: "Turn in progress" });
  });
  test("ping sends a JSON-RPC request and resolves on response", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.ping();
    const sent = transport.sentMessages[0];
    assert.strictEqual(sent.method, "ping");
    assert.strictEqual(sent.id, 1);
    transport.fireMessage({ jsonrpc: "2.0", id: 1, result: null });
    assert.strictEqual(await resultPromise, void 0);
  });
  test("ping rejects with ProtocolError when the connection closes", async () => {
    const { client, transport } = createClient();
    const resultPromise = client.ping();
    const rejected = assertRemoteProtocolError(resultPromise, { code: -32e3, message: "Connection closed: test.example:1234" });
    transport.fireClose();
    await rejected;
  });
  suite("reverse permission gating", () => {
    test("remote local address does not receive trusted local access", async () => {
      const permissionService = createResourceServiceStub({
        granted: (identity) => identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY
      });
      const { client, transport } = createClientForIdentity("local", void 0, permissionService);
      const uri = URI.file("/etc/passwd").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 41, method: "resourceRead", params: { channel: "ahp-root://", uri } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual({
        address: client.address,
        response: transport.sentMessages.pop()
      }, {
        address: "local",
        response: {
          jsonrpc: "2.0",
          id: 41,
          error: {
            code: AhpErrorCodes.PermissionDenied,
            message: `Access to ${uri} is not granted.`,
            data: { request: { channel: ROOT_STATE_URI, uri, read: true } }
          }
        }
      });
    });
    test("trusted local identity retains local resource access", async () => {
      const permissionService = createResourceServiceStub({
        granted: (identity) => identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY,
        readBytes: VSBuffer.fromString("trusted")
      });
      const { client, transport } = createClientForIdentity(LOCAL_AGENT_HOST_RESOURCE_IDENTITY, void 0, permissionService);
      const uri = URI.file("/etc/passwd").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 40, method: "resourceRead", params: { channel: "ahp-root://", uri } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual({
        address: client.address,
        response: transport.sentMessages.pop()
      }, {
        address: "local",
        response: {
          jsonrpc: "2.0",
          id: 40,
          result: { data: "dHJ1c3RlZA==", encoding: ContentEncoding.Base64 }
        }
      });
    });
    test("resourceRead is denied with PermissionDeniedErrorData when not granted", async () => {
      const { transport } = createClient(void 0, createPermissionService(false));
      const uri = URI.file("/etc/passwd").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 42, method: "resourceRead", params: { channel: "ahp-root://", uri } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(transport.sentMessages.pop(), {
        jsonrpc: "2.0",
        id: 42,
        error: {
          code: AhpErrorCodes.PermissionDenied,
          message: `Access to ${uri} is not granted.`,
          data: { request: { channel: ROOT_STATE_URI, uri, read: true } }
        }
      });
    });
    test("resourceWrite is denied with PermissionDeniedErrorData when not granted", async () => {
      const { transport } = createClient(void 0, createPermissionService(false));
      const uri = URI.file("/etc/passwd").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 7, method: "resourceWrite", params: { channel: "ahp-root://", uri, data: "aGVsbG8=", encoding: ContentEncoding.Base64 } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(transport.sentMessages.pop(), {
        jsonrpc: "2.0",
        id: 7,
        error: {
          code: AhpErrorCodes.PermissionDenied,
          message: `Access to ${uri} is not granted.`,
          data: { request: { channel: ROOT_STATE_URI, uri, write: true } }
        }
      });
    });
    test("resourceList is denied with PermissionDeniedErrorData when not granted", async () => {
      const { transport } = createClient(void 0, createPermissionService(false));
      const uri = URI.file("/etc").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 5, method: "resourceList", params: { channel: "ahp-root://", uri } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(transport.sentMessages.pop(), {
        jsonrpc: "2.0",
        id: 5,
        error: {
          code: AhpErrorCodes.PermissionDenied,
          message: `Access to ${uri} is not granted.`,
          data: { request: { channel: ROOT_STATE_URI, uri, read: true } }
        }
      });
    });
    test("resourceDelete is denied with PermissionDeniedErrorData when not granted", async () => {
      const { transport } = createClient(void 0, createPermissionService(false));
      const uri = URI.file("/etc/passwd").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 8, method: "resourceDelete", params: { channel: "ahp-root://", uri } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(transport.sentMessages.pop(), {
        jsonrpc: "2.0",
        id: 8,
        error: {
          code: AhpErrorCodes.PermissionDenied,
          message: `Access to ${uri} is not granted.`,
          data: { request: { channel: ROOT_STATE_URI, uri, write: true } }
        }
      });
    });
    test("resourceMove is denied when destination lacks write access", async () => {
      const sourceUri = URI.file("/grant/foo").toString();
      const destUri = URI.file("/no-grant/bar").toString();
      const stub = createResourceServiceStub({
        granted: (_addr, uri) => uri.toString() === sourceUri
      });
      const { transport } = createClient(void 0, stub);
      transport.fireMessage({ jsonrpc: "2.0", id: 9, method: "resourceMove", params: { channel: "ahp-root://", source: sourceUri, destination: destUri } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(transport.sentMessages.pop(), {
        jsonrpc: "2.0",
        id: 9,
        error: {
          code: AhpErrorCodes.PermissionDenied,
          message: `Access to ${destUri} is not granted.`,
          data: { request: { channel: ROOT_STATE_URI, uri: destUri, write: true } }
        }
      });
    });
    test("reverse resourceRequest delegates to permission service and replies with empty result", async () => {
      let lastRequest;
      const stub = createResourceServiceStub({
        granted: () => false,
        onRequest: async (address, params) => {
          lastRequest = { address, params };
        }
      });
      const { transport } = createClient(void 0, stub);
      const uri = URI.file("/etc/foo").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 11, method: "resourceRequest", params: { channel: "ahp-root://", uri, read: true } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(lastRequest, { address: "test.example:1234", params: { channel: "ahp-root://", uri, read: true } });
      assert.deepStrictEqual(transport.sentMessages.pop(), { jsonrpc: "2.0", id: 11, result: {} });
    });
    test("reverse resourceRequest replies with PermissionDenied on cancellation", async () => {
      const stub = createResourceServiceStub({
        granted: () => false,
        onRequest: async () => {
          throw new CancellationError();
        }
      });
      const { transport } = createClient(void 0, stub);
      const uri = URI.file("/etc/foo").toString();
      transport.fireMessage({ jsonrpc: "2.0", id: 12, method: "resourceRequest", params: { channel: "ahp-root://", uri, read: true } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(transport.sentMessages.pop(), {
        jsonrpc: "2.0",
        id: 12,
        error: {
          code: AhpErrorCodes.PermissionDenied,
          message: "Access to the requested resource is not granted.",
          data: void 0
        }
      });
    });
  });
  suite("implicit grants for outgoing actions", () => {
    function createCapturingPermissionService() {
      const calls = [];
      const service = createResourceServiceStub({
        onGrantImplicitRead: (address, uri) => calls.push({ address, uri })
      });
      return { service, calls };
    }
    test("SessionActiveClientSet dispatches implicit reads for each customization", () => {
      const { service, calls } = createCapturingPermissionService();
      const { client } = createClient(void 0, service);
      const sessionUri = URI.parse("ahp-session:/test");
      client.dispatch(sessionUri.toString(), {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "c1",
          tools: [],
          customizations: [
            { type: CustomizationType.Plugin, id: customizationId("file:///plugins/foo"), uri: "file:///plugins/foo", name: "Foo" },
            { type: CustomizationType.Plugin, id: customizationId("file:///other/bar"), uri: "file:///other/bar", name: "Bar" }
          ]
        }
      });
      assert.deepStrictEqual(
        calls.map((c) => ({ address: c.address, uri: c.uri.toString() })),
        [
          { address: "test.example:1234", uri: "file:///plugins" },
          { address: "test.example:1234", uri: "file:///other" }
        ]
      );
    });
    test("ChatTurnStarted grants attachment access before reverse resourceRead", async () => {
      const granted = /* @__PURE__ */ new Set();
      const attachmentUri = URI.file("/attachments/example.txt");
      const service = createResourceServiceStub({
        granted: (_address, uri, mode) => mode === AgentHostPermissionMode.Read && granted.has(uri.toString()),
        onGrantImplicitRead: (_address, uri) => granted.add(uri.toString()),
        readBytes: VSBuffer.fromString("attachment")
      });
      const { client, transport } = createClient(void 0, service);
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2026-07-23T00:00:00.000Z",
        message: {
          text: "Review this file",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Resource,
            uri: attachmentUri.toString(),
            label: "example.txt"
          }]
        }
      };
      client.dispatch("copilot-chat:/test", action);
      transport.fireMessage({
        jsonrpc: "2.0",
        id: 42,
        method: "resourceRead",
        params: { channel: ROOT_STATE_URI, uri: attachmentUri.toString() }
      });
      await flushMicrotasks();
      assert.deepStrictEqual(transport.sentMessages.at(-1), {
        jsonrpc: "2.0",
        id: 42,
        result: { data: "YXR0YWNobWVudA==", encoding: ContentEncoding.Base64 }
      });
    });
    test("ChatPendingMessageSet grants resource attachments only", () => {
      const { service, calls } = createCapturingPermissionService();
      const { client } = createClient(void 0, service);
      client.dispatch("copilot-chat:/test", {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "queued-1",
        message: {
          text: "Review these attachments",
          origin: { kind: MessageKind.User },
          attachments: [
            { type: MessageAttachmentKind.Resource, uri: "file:///attachments/queued.txt", label: "queued.txt" },
            { type: MessageAttachmentKind.EmbeddedResource, data: "", contentType: "text/plain", label: "inline.txt" }
          ]
        }
      });
      assert.deepStrictEqual(calls.map((call) => call.uri.toString()), ["file:///attachments/queued.txt"]);
    });
    test("multiple customizations in the same directory dedupe to one grant", () => {
      const { service, calls } = createCapturingPermissionService();
      const { client } = createClient(void 0, service);
      const sessionUri = URI.parse("ahp-session:/test");
      client.dispatch(sessionUri.toString(), {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "c1",
          tools: [],
          customizations: [
            { type: CustomizationType.Plugin, id: customizationId("file:///plugins/foo"), uri: "file:///plugins/foo", name: "Foo" },
            { type: CustomizationType.Plugin, id: customizationId("file:///plugins/bar"), uri: "file:///plugins/bar", name: "Bar" }
          ]
        }
      });
      assert.deepStrictEqual(
        calls.map((c) => c.uri.toString()),
        ["file:///plugins"]
      );
    });
    test("repeat dispatch dedupes per URI", () => {
      const { service, calls } = createCapturingPermissionService();
      const { client } = createClient(void 0, service);
      const sessionUri = URI.parse("ahp-session:/test");
      const action = {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "c1",
          tools: [],
          customizations: [
            { type: CustomizationType.Plugin, id: customizationId("file:///plugins/foo"), uri: "file:///plugins/foo", name: "Foo" }
          ]
        }
      };
      client.dispatch(sessionUri.toString(), action);
      client.dispatch(sessionUri.toString(), action);
      assert.strictEqual(calls.length, 1);
    });
    test("connection close disposes implicit read grants", async () => {
      const didGrant = new DeferredPromise();
      const revoked = [];
      const service = createResourceServiceStub({
        onGrantImplicitRead: () => didGrant.complete(),
        onRevokeImplicitRead: (_address, uri) => revoked.push(uri.toString())
      });
      const { client, transport } = createClient(void 0, service);
      client.dispatch("copilot-chat:/test", {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "queued-1",
        message: {
          text: "Review this attachment",
          origin: { kind: MessageKind.User },
          attachments: [
            { type: MessageAttachmentKind.Resource, uri: "file:///attachments/queued.txt", label: "queued.txt" }
          ]
        }
      });
      await didGrant.p;
      transport.fireClose();
      assert.deepStrictEqual(revoked, ["file:///attachments/queued.txt"]);
    });
    test("active client removal does not crash", () => {
      const { service, calls } = createCapturingPermissionService();
      const { client } = createClient(void 0, service);
      const sessionUri = URI.parse("ahp-session:/test");
      client.dispatch(sessionUri.toString(), {
        type: ActionType.SessionActiveClientRemoved,
        clientId: "c1"
      });
      assert.strictEqual(calls.length, 0);
    });
    test("createSession with active-client customizations grants implicit reads", async () => {
      const { service, calls } = createCapturingPermissionService();
      const { client, transport } = createClient(void 0, service);
      void client.createSession({
        provider: "copilot",
        activeClient: {
          clientId: "c1",
          tools: [],
          customizations: [
            { type: CustomizationType.Plugin, id: customizationId("file:///plugins/foo"), uri: "file:///plugins/foo", name: "Foo" }
          ]
        }
      });
      const sent = transport.sentMessages.find(
        (m) => "method" in m && m.method === "createSession"
      );
      assert.ok(sent);
      transport.fireMessage({ jsonrpc: "2.0", id: sent.id, result: null });
      assert.deepStrictEqual(
        calls.map((c) => c.uri.toString()),
        ["file:///plugins"]
      );
    });
  });
  suite("ordinary working-directory dispatch", () => {
    function workingDirectorySetAction(directory) {
      return { type: ActionType.SessionWorkingDirectorySet, directory };
    }
    async function subscribeToSession(client, transport, sessionUri) {
      client.getSubscription(StateComponents.Session, sessionUri, "test");
      let subscribeReq;
      while (!subscribeReq) {
        subscribeReq = transport.sentMessages.find(
          (m) => hasKey(m, { method: true, id: true }) && m.method === "subscribe"
        );
        if (!subscribeReq) {
          await Promise.resolve();
        }
      }
      transport.fireMessage({
        jsonrpc: "2.0",
        id: subscribeReq.id,
        result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } }
      });
      await flushMicrotasks();
    }
    function findLastDispatchAction(transport) {
      const match = [...transport.sentMessages].reverse().find(
        (m) => hasKey(m, { method: true }) && m.method === "dispatchAction" && !("id" in m)
      );
      assert.ok(match, "expected a dispatchAction notification to have been sent");
      return match;
    }
    test("optimistically applies and confirms an accepted action", async () => {
      const { client, transport } = createClient();
      await connectClient(client, transport);
      const sessionUri = URI.parse("copilot:/test-session");
      const sub = client.getSubscription(StateComponents.Session, sessionUri, "test");
      await subscribeToSession(client, transport, sessionUri);
      client.dispatch(sessionUri.toString(), workingDirectorySetAction("file:///ws2"));
      const sent = findLastDispatchAction(transport);
      const { clientSeq, action } = sent.params;
      assert.deepStrictEqual(sub.object.value.workingDirectories, ["file:///ws2"]);
      assert.strictEqual(sub.object.verifiedValue?.workingDirectories, void 0);
      transport.fireMessage({
        jsonrpc: "2.0",
        method: "action",
        params: { channel: sessionUri.toString(), action, serverSeq: 6, origin: { clientId: client.clientId, clientSeq } }
      });
      assert.deepStrictEqual(sub.object.verifiedValue?.workingDirectories, ["file:///ws2"]);
      assert.strictEqual(sub.object.value, sub.object.verifiedValue);
      sub.dispose();
    });
    test("rolls optimistic state back when the server rejects an action", async () => {
      const { client, transport } = createClient();
      await connectClient(client, transport);
      const sessionUri = URI.parse("copilot:/test-session");
      const sub = client.getSubscription(StateComponents.Session, sessionUri, "test");
      await subscribeToSession(client, transport, sessionUri);
      client.dispatch(sessionUri.toString(), workingDirectorySetAction("file:///ws2"));
      const sent = findLastDispatchAction(transport);
      const { clientSeq, action } = sent.params;
      assert.deepStrictEqual(sub.object.value.workingDirectories, ["file:///ws2"]);
      transport.fireMessage({
        jsonrpc: "2.0",
        method: "action",
        params: { channel: sessionUri.toString(), action, serverSeq: 6, origin: { clientId: client.clientId, clientSeq }, rejectionReason: "denied" }
      });
      assert.strictEqual(sub.object.verifiedValue?.workingDirectories, void 0);
      assert.strictEqual(sub.object.value.workingDirectories, void 0);
      sub.dispose();
    });
  });
  suite("soft reconnect (transport factory)", () => {
    function findRequest(transport, method) {
      return transport.sentMessages.find(
        (m) => "method" in m && m.method === method && "id" in m
      );
    }
    function findNotification(transport, method) {
      return transport.sentMessages.find(
        (m) => "method" in m && m.method === method && !("id" in m)
      );
    }
    function findDispatchAction(transport, actionType) {
      return transport.sentMessages.find(
        (m) => "method" in m && m.method === "dispatchAction" && !("id" in m) && m.params?.action?.type === actionType
      );
    }
    async function waitForReconnecting(client) {
      if (client.connectionState === AgentHostClientState.Reconnecting) {
        return;
      }
      await Event.toPromise(Event.filter(client.onDidChangeConnectionState, (s) => s === AgentHostClientState.Reconnecting));
    }
    async function waitForRequest(transport, method) {
      while (true) {
        const req = findRequest(transport, method);
        if (req) {
          return req;
        }
        await Promise.resolve();
      }
    }
    async function waitForRequestAt(transport, method, index) {
      while (true) {
        const requests = transport.sentMessages.filter(
          (message) => "method" in message && message.method === method && "id" in message
        );
        if (requests[index]) {
          return requests[index];
        }
        await Promise.resolve();
      }
    }
    async function waitForTransport(transports, index) {
      while (transports.length <= index) {
        await new Promise((r) => setTimeout(r, 25));
      }
      return transports[index];
    }
    function createFactoryClient(permissionService = createPermissionService(), clientInfo, telemetryService = NullTelemetryService) {
      const transports = [];
      const factory = () => {
        const t = disposables.add(new TestClientProtocolTransport());
        transports.push(t);
        return t;
      };
      const client = disposables.add(new RemoteAgentHostProtocolClient(
        "test.example:1234",
        factory,
        void 0,
        void 0,
        clientInfo,
        new NullLogService(),
        permissionService,
        new TestConfigurationService(),
        telemetryService
      ));
      return { client, transports };
    }
    async function completeHandshake(transport, connectPromise) {
      transport.connectDeferred.complete();
      while (findRequest(transport, "initialize") === void 0) {
        await Promise.resolve();
      }
      const init = findRequest(transport, "initialize");
      transport.fireMessage({
        jsonrpc: "2.0",
        id: init.id,
        result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 5, snapshots: [] }
      });
      await connectPromise;
    }
    test("retries an initial transport failure with a fresh initialization", async function() {
      this.timeout(1e4);
      const { client, transports } = createFactoryClient();
      const connectPromise = client.connect();
      transports[0].connectDeferred.error(new Error("initial transport failed"));
      await assert.rejects(connectPromise, /initial transport failed/);
      await waitForReconnecting(client);
      const reconnectTransport = await waitForTransport(transports, 1);
      reconnectTransport.connectDeferred.complete();
      const reconnect = await waitForRequest(reconnectTransport, "reconnect");
      reconnectTransport.fireMessage({
        jsonrpc: "2.0",
        id: reconnect.id,
        error: { code: AhpErrorCodes.NotFound, message: "client not found" }
      });
      const initialize = await waitForRequest(reconnectTransport, "initialize");
      reconnectTransport.fireMessage({
        jsonrpc: "2.0",
        id: initialize.id,
        result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
      });
      while (client.connectionState !== AgentHostClientState.Connected) {
        await Promise.resolve();
      }
      assert.deepStrictEqual({
        state: client.connectionState,
        transportCount: transports.length
      }, {
        state: AgentHostClientState.Connected,
        transportCount: 2
      });
    });
    test("does not retry a non-reconnectable initial transport failure", async () => {
      const { client, transports } = createFactoryClient();
      const connectPromise = client.connect();
      transports[0].connectDeferred.error(new NonReconnectableTransportError("terminal failure"));
      await assert.rejects(connectPromise, /terminal failure/);
      assert.deepStrictEqual({
        state: client.connectionState,
        transportCount: transports.length
      }, {
        state: AgentHostClientState.Closed,
        transportCount: 1
      });
    });
    test("can reconnect a terminal connection after an explicit host restart", async function() {
      this.timeout(1e4);
      const { client, transports } = createFactoryClient();
      const connectPromise = client.connect();
      transports[0].connectDeferred.error(new NonReconnectableTransportError("terminal failure"));
      await assert.rejects(connectPromise, /terminal failure/);
      assert.strictEqual(client.reconnectFromClosed(), true);
      const reconnectTransport = await waitForTransport(transports, 1);
      reconnectTransport.connectDeferred.complete();
      const reconnect = await waitForRequest(reconnectTransport, "reconnect");
      reconnectTransport.fireMessage({
        jsonrpc: "2.0",
        id: reconnect.id,
        error: { code: AhpErrorCodes.NotFound, message: "client not found" }
      });
      const initialize = await waitForRequest(reconnectTransport, "initialize");
      reconnectTransport.fireMessage({
        jsonrpc: "2.0",
        id: initialize.id,
        result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
      });
      while (client.connectionState !== AgentHostClientState.Connected) {
        await Promise.resolve();
      }
      assert.deepStrictEqual({
        state: client.connectionState,
        transportCount: transports.length
      }, {
        state: AgentHostClientState.Connected,
        transportCount: 2
      });
    });
    test("reuses clientId across transport reconnects", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const originalClientId = client.clientId;
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        const params = reconnect.params;
        assert.strictEqual(params.clientId, originalClientId);
        assert.strictEqual(params.lastSeenServerSeq, 5);
        assert.ok(Array.isArray(params.subscriptions));
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        await flushMicrotasks();
        client.dispose();
      });
    });
    test("retries with a fresh initialize when the factory transport closes during initial connect", async function() {
      this.timeout(1e4);
      const { client, transports } = createFactoryClient();
      const connectPromise = assert.rejects(client.connect());
      client.notifyTransportClosed();
      await waitForReconnecting(client);
      transports[0].connectDeferred.error(new Error("Initial transport closed"));
      await connectPromise;
      const reconnectTransport = await waitForTransport(transports, 1);
      reconnectTransport.connectDeferred.complete();
      const reconnect = await waitForRequest(reconnectTransport, "reconnect");
      reconnectTransport.fireMessage({
        jsonrpc: "2.0",
        id: reconnect.id,
        error: { code: AhpErrorCodes.NotFound, message: "Reconnect client not found" }
      });
      const initialize = await waitForRequest(reconnectTransport, "initialize");
      reconnectTransport.fireMessage({
        jsonrpc: "2.0",
        id: initialize.id,
        result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
      });
      await flushMicrotasks();
      assert.strictEqual(client.connectionState, AgentHostClientState.Connected);
    });
    test("falls back to initialize with client info when the server forgot the client", async function() {
      this.timeout(1e4);
      const { client, transports } = createFactoryClient(createPermissionService(), agentsWindowAgentHostClientInfo, new TestClientIdentityTelemetryService());
      let connectedRequest = Disposable.None;
      try {
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        connectedRequest = Event.once(Event.filter(client.onDidChangeConnectionState, (state) => state === AgentHostClientState.Connected))(() => {
          void client.listSessions().catch(() => {
          });
        });
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        assert.deepStrictEqual(reconnect.params._meta, {
          "vscode.clientMachineId": "client-machine-id",
          "vscode.clientDevDeviceId": "client-dev-device-id"
        });
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          error: { code: AhpErrorCodes.NotFound, message: "Reconnect client not found" }
        });
        const initialize = await waitForRequest(reconnectTransport, "initialize");
        assert.deepStrictEqual({
          clientInfo: initialize.params.clientInfo,
          meta: initialize.params._meta
        }, {
          clientInfo: agentsWindowAgentHostClientInfo,
          meta: {
            "vscode.clientMachineId": "client-machine-id",
            "vscode.clientDevDeviceId": "client-dev-device-id"
          }
        });
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: initialize.id,
          result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] }
        });
        await flushMicrotasks();
        const managedSettingsIndex = reconnectTransport.sentMessages.findIndex((message) => hasKey(message, { method: true }) && message.method === "setClientManagedSettingsPermissions");
        const listSessionsIndex = reconnectTransport.sentMessages.findIndex((message) => hasKey(message, { method: true }) && message.method === "listSessions");
        assert.strictEqual(client.connectionState, AgentHostClientState.Connected);
        assert.ok(managedSettingsIndex >= 0 && managedSettingsIndex < listSessionsIndex, "managed settings must be sent before requests triggered by the connected transition");
      } finally {
        connectedRequest.dispose();
        client.dispose();
      }
    });
    test("restores subscriptions before replaying pending actions when the server forgot the client", async function() {
      this.timeout(1e4);
      const { client, transports } = createFactoryClient();
      const sessionUri = URI.parse("copilot:/test-session");
      const chatUri = URI.parse("ahp-chat://default/test-session");
      const connectPromise = client.connect();
      await completeHandshake(transports[0], connectPromise);
      const sessionRef = client.getSubscription(StateComponents.Session, sessionUri, "test");
      const initialSessionSubscribe = await waitForRequestAt(transports[0], "subscribe", 0);
      transports[0].fireMessage({
        jsonrpc: "2.0",
        id: initialSessionSubscribe.id,
        result: { snapshot: { resource: sessionUri.toString(), state: { lifecycle: "ready" }, fromSeq: 5 } }
      });
      const chatRef = client.getSubscription(StateComponents.Chat, chatUri, "test");
      const initialChatSubscribe = await waitForRequestAt(transports[0], "subscribe", 1);
      transports[0].fireMessage({
        jsonrpc: "2.0",
        id: initialChatSubscribe.id,
        result: { snapshot: { resource: chatUri.toString(), state: { turns: [] }, fromSeq: 5 } }
      });
      const authentication = client.authenticate({ resource: "https://api.github.com", token: "token" });
      const initialAuthenticate = await waitForRequest(transports[0], "authenticate");
      transports[0].fireMessage({ jsonrpc: "2.0", id: initialAuthenticate.id, result: {} });
      await authentication;
      await flushMicrotasks();
      client.dispatch(chatUri.toString(), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-after-restart",
        startedAt: "2026-08-09T00:00:00.000Z",
        message: { text: "Continue", origin: { kind: MessageKind.User } }
      });
      const initialDispatch = findDispatchAction(transports[0], ActionType.ChatTurnStarted);
      assert.ok(initialDispatch);
      transports[0].fireClose();
      await waitForReconnecting(client);
      const reconnectTransport = await waitForTransport(transports, 1);
      reconnectTransport.connectDeferred.complete();
      const reconnect = await waitForRequest(reconnectTransport, "reconnect");
      reconnectTransport.fireMessage({
        jsonrpc: "2.0",
        id: reconnect.id,
        error: { code: AhpErrorCodes.NotFound, message: "Reconnect client not found" }
      });
      const initialize = await waitForRequest(reconnectTransport, "initialize");
      reconnectTransport.fireMessage({
        jsonrpc: "2.0",
        id: initialize.id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          serverSeq: 0,
          snapshots: [{ resource: ROOT_STATE_URI, state: { agents: [], activeSessions: 0 }, fromSeq: 0 }]
        }
      });
      const restoredAuthenticate = await waitForRequestAt(reconnectTransport, "authenticate", 0);
      const managedSettings = reconnectTransport.sentMessages.find((message) => hasKey(message, { method: true }) && message.method === "setClientManagedSettingsPermissions");
      assert.ok(managedSettings, "managed settings should be restored after fresh initialization");
      assert.ok(
        reconnectTransport.sentMessages.indexOf(managedSettings) < reconnectTransport.sentMessages.indexOf(restoredAuthenticate),
        "managed settings should be restored before authentication and subscriptions"
      );
      reconnectTransport.fireMessage({ jsonrpc: "2.0", id: restoredAuthenticate.id, result: {} });
      const restoredSessionSubscribe = await waitForRequestAt(reconnectTransport, "subscribe", 0);
      assert.strictEqual(restoredSessionSubscribe.params.channel, sessionUri.toString());
      reconnectTransport.fireMessage({
        jsonrpc: "2.0",
        id: restoredSessionSubscribe.id,
        result: { snapshot: { resource: sessionUri.toString(), state: { lifecycle: "ready" }, fromSeq: 1 } }
      });
      const restoredChatSubscribe = await waitForRequestAt(reconnectTransport, "subscribe", 1);
      assert.strictEqual(restoredChatSubscribe.params.channel, chatUri.toString());
      reconnectTransport.fireMessage({
        jsonrpc: "2.0",
        id: restoredChatSubscribe.id,
        result: { snapshot: { resource: chatUri.toString(), state: { turns: [] }, fromSeq: 2 } }
      });
      await flushMicrotasks();
      const replayed = findDispatchAction(reconnectTransport, ActionType.ChatTurnStarted);
      assert.ok(replayed, "pending turn should replay after the session and chat are restored");
      assert.ok(
        reconnectTransport.sentMessages.indexOf(replayed) > reconnectTransport.sentMessages.indexOf(restoredChatSubscribe),
        "pending turn should be sent after subscription restoration"
      );
      chatRef.dispose();
      sessionRef.dispose();
      client.dispose();
    });
    test("replays pending optimistic actions after reconnect", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const sessionUri = URI.parse("copilot:/test-session");
        const subRef = client.getSubscription(StateComponents.Session, sessionUri, "test");
        const subscribeReq = await waitForRequest(transports[0], "subscribe");
        transports[0].fireMessage({
          jsonrpc: "2.0",
          id: subscribeReq.id,
          result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } }
        });
        await Promise.resolve();
        const action = {
          type: ActionType.SessionTitleChanged,
          title: "Renamed by user"
        };
        client.dispatch(sessionUri.toString(), action);
        const initialDispatch = findDispatchAction(transports[0], ActionType.SessionTitleChanged);
        assert.ok(initialDispatch, "optimistic dispatch should reach the original transport");
        const initialSeq = initialDispatch.params.clientSeq;
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        await flushMicrotasks();
        const replayed = findDispatchAction(reconnectTransport, ActionType.SessionTitleChanged);
        assert.ok(replayed, "pending optimistic action should be re-sent after reconnect");
        assert.strictEqual(replayed.params.clientSeq, initialSeq, "replayed dispatch must reuse the original clientSeq");
        subRef.dispose();
        client.dispose();
      });
    });
    test("attachment grant remains available when a pending turn is replayed after reconnect", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const attachmentUri = URI.file("/attachments/replayed.txt");
        const granted = /* @__PURE__ */ new Set();
        const permissionService = createResourceServiceStub({
          granted: (_address, uri, mode) => mode === AgentHostPermissionMode.Read && granted.has(uri.toString()),
          onGrantImplicitRead: (_address, uri) => granted.add(uri.toString()),
          readBytes: VSBuffer.fromString("replayed")
        });
        const { client, transports } = createFactoryClient(permissionService);
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const chatUri = URI.parse("copilot-chat:/test-chat");
        const subRef = client.getSubscription(StateComponents.Chat, chatUri, "test");
        const subscribeReq = await waitForRequest(transports[0], "subscribe");
        transports[0].fireMessage({
          jsonrpc: "2.0",
          id: subscribeReq.id,
          result: { snapshot: { resource: chatUri.toString(), state: { turns: [] }, fromSeq: 5 } }
        });
        await Promise.resolve();
        client.dispatch(chatUri.toString(), {
          type: ActionType.ChatTurnStarted,
          turnId: "turn-1",
          startedAt: "2026-07-23T00:00:00.000Z",
          message: {
            text: "Review this file",
            origin: { kind: MessageKind.User },
            attachments: [{
              type: MessageAttachmentKind.Resource,
              uri: attachmentUri.toString(),
              label: "replayed.txt"
            }]
          }
        });
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        await flushMicrotasks();
        assert.ok(findDispatchAction(reconnectTransport, ActionType.ChatTurnStarted));
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: 42,
          method: "resourceRead",
          params: { channel: ROOT_STATE_URI, uri: attachmentUri.toString() }
        });
        await flushMicrotasks();
        assert.deepStrictEqual(reconnectTransport.sentMessages.at(-1), {
          jsonrpc: "2.0",
          id: 42,
          result: { data: "cmVwbGF5ZWQ=", encoding: ContentEncoding.Base64 }
        });
        subRef.dispose();
        client.dispose();
      });
    });
    test("skips replay when server already echoed the action in the replay buffer", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const sessionUri = URI.parse("copilot:/test-session");
        const subRef = client.getSubscription(StateComponents.Session, sessionUri, "test");
        const subscribeReq = await waitForRequest(transports[0], "subscribe");
        transports[0].fireMessage({
          jsonrpc: "2.0",
          id: subscribeReq.id,
          result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } }
        });
        await Promise.resolve();
        const action = {
          type: ActionType.SessionTitleChanged,
          title: "Echoed back"
        };
        client.dispatch(sessionUri.toString(), action);
        const initialDispatch = findDispatchAction(transports[0], ActionType.SessionTitleChanged);
        const initialSeq = initialDispatch.params.clientSeq;
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: {
            type: ReconnectResultType.Replay,
            actions: [{
              channel: sessionUri.toString(),
              action,
              serverSeq: 6,
              origin: { clientId: client.clientId, clientSeq: initialSeq },
              rejectionReason: void 0
            }],
            missing: []
          }
        });
        await flushMicrotasks();
        assert.strictEqual(
          findDispatchAction(reconnectTransport, ActionType.SessionTitleChanged),
          void 0,
          "action echoed back via replay buffer must not be re-sent"
        );
        subRef.dispose();
        client.dispose();
      });
    });
    test("outgoing requests wait for reconnect to complete", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        transports[0].fireClose();
        const inFlight = client.resourceList(URI.file("/workspace")).catch((err) => err);
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        assert.strictEqual(
          findRequest(reconnectTransport, "resourceList"),
          void 0,
          "request must NOT be sent before reconnect completes"
        );
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        const resourceList = await waitForRequest(reconnectTransport, "resourceList");
        reconnectTransport.fireMessage({ jsonrpc: "2.0", id: resourceList.id, result: { entries: [] } });
        const value = await inFlight;
        assert.deepStrictEqual(value, { entries: [] });
        client.dispose();
      });
    });
    test("rejected action echoed in replay buffer is not applied to confirmed state", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const sessionUri = URI.parse("copilot:/test-session");
        const subRef = client.getSubscription(StateComponents.Session, sessionUri, "test");
        const subscribeReq = await waitForRequest(transports[0], "subscribe");
        transports[0].fireMessage({
          jsonrpc: "2.0",
          id: subscribeReq.id,
          result: { snapshot: { resource: sessionUri.toString(), state: { summary: { title: "Original" }, turns: [] }, fromSeq: 5 } }
        });
        await Promise.resolve();
        const action = {
          type: ActionType.SessionTitleChanged,
          title: "Rejected change"
        };
        client.dispatch(sessionUri.toString(), action);
        const initialDispatch = findDispatchAction(transports[0], ActionType.SessionTitleChanged);
        const initialSeq = initialDispatch.params.clientSeq;
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: {
            type: ReconnectResultType.Replay,
            actions: [{
              channel: sessionUri.toString(),
              action,
              serverSeq: 6,
              origin: { clientId: client.clientId, clientSeq: initialSeq },
              rejectionReason: "unauthorized"
            }],
            missing: []
          }
        });
        await flushMicrotasks();
        const sessionState = subRef.object.verifiedValue;
        assert.ok(sessionState, "session state should be hydrated");
        assert.strictEqual(
          sessionState.summary.title,
          "Original",
          "rejected action must not have been applied to confirmed state"
        );
        assert.strictEqual(
          findDispatchAction(reconnectTransport, ActionType.SessionTitleChanged),
          void 0,
          "rejected action must not be re-dispatched"
        );
        subRef.dispose();
        client.dispose();
      });
    });
    test("snapshot reconnect result reseats the root state", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: {
            type: ReconnectResultType.Snapshot,
            snapshots: [{
              resource: ROOT_STATE_URI,
              state: { agents: [{ provider: "copilot", displayName: "Copilot", models: [], tools: [] }], activeSessions: 0, terminals: [] },
              fromSeq: 42
            }]
          }
        });
        await flushMicrotasks();
        const root = client.rootState.value;
        assert.ok(root && !(root instanceof Error), "root state should be hydrated from snapshot");
        assert.strictEqual(root.agents[0]?.provider, "copilot");
        client.dispose();
      });
    });
    test("reconnect snapshot replaces pending optimistic working-directory state", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const sessionUri = URI.parse("copilot:/test-session");
        const subRef = client.getSubscription(StateComponents.Session, sessionUri, "test");
        const subscribeReq = await waitForRequest(transports[0], "subscribe");
        transports[0].fireMessage({
          jsonrpc: "2.0",
          id: subscribeReq.id,
          result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } }
        });
        await flushMicrotasks();
        client.dispatch(sessionUri.toString(), {
          type: ActionType.SessionWorkingDirectorySet,
          directory: "file:///ws2"
        });
        assert.deepStrictEqual(subRef.object.value.workingDirectories, ["file:///ws2"]);
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: {
            type: ReconnectResultType.Snapshot,
            snapshots: [{ resource: sessionUri.toString(), state: { turns: [], workingDirectories: ["file:///fresh"] }, fromSeq: 9 }]
          }
        });
        await flushMicrotasks();
        assert.deepStrictEqual(subRef.object.value.workingDirectories, ["file:///fresh"]);
        assert.strictEqual(
          findDispatchAction(reconnectTransport, ActionType.SessionWorkingDirectorySet),
          void 0,
          "action cleared by a fresh snapshot must not be replayed"
        );
        subRef.dispose();
        client.dispose();
      });
    });
    test("reconnect missing result clears pending optimistic working-directory state", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const sessionUri = URI.parse("copilot:/test-session");
        const subRef = client.getSubscription(StateComponents.Session, sessionUri, "test");
        const subscribeReq = await waitForRequest(transports[0], "subscribe");
        transports[0].fireMessage({
          jsonrpc: "2.0",
          id: subscribeReq.id,
          result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } }
        });
        await Promise.resolve();
        client.dispatch(sessionUri.toString(), {
          type: ActionType.SessionWorkingDirectorySet,
          directory: "file:///ws2"
        });
        transports[0].fireClose();
        await waitForReconnecting(client);
        const reconnectTransport = await waitForTransport(transports, 1);
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [sessionUri.toString()] }
        });
        await flushMicrotasks();
        assert.ok(subRef.object.value instanceof Error);
        assert.strictEqual(
          findDispatchAction(reconnectTransport, ActionType.SessionWorkingDirectorySet),
          void 0,
          "action for a missing subscription must not be replayed"
        );
        subRef.dispose();
        client.dispose();
      });
    });
    test("transport drop during reconnect RPC re-schedules instead of hanging", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        transports[0].fireClose();
        await waitForReconnecting(client);
        const attempt1 = await waitForTransport(transports, 1);
        attempt1.connectDeferred.complete();
        await waitForRequest(attempt1, "reconnect");
        attempt1.fireClose();
        const attempt2 = await waitForTransport(transports, 2);
        attempt2.connectDeferred.complete();
        const reconnect2 = await waitForRequest(attempt2, "reconnect");
        attempt2.fireMessage({
          jsonrpc: "2.0",
          id: reconnect2.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        await flushMicrotasks();
        assert.strictEqual(
          client.connectionState,
          AgentHostClientState.Connected,
          "client must recover to Connected after a mid-reconnect drop"
        );
        client.dispose();
      });
    });
    test("non-session dispatch issued during reconnect rides retries until success", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        transports[0].fireClose();
        await waitForReconnecting(client);
        const terminalUri = URI.parse("agenthost-terminal:/term-1");
        client.dispatch(terminalUri.toString(), {
          type: ActionType.TerminalInput,
          data: "echo hello\n"
        });
        const attempt1 = await waitForTransport(transports, 1);
        attempt1.connectDeferred.error(new Error("connect failed"));
        const attempt2 = await waitForTransport(transports, 2);
        attempt2.connectDeferred.complete();
        const reconnect2 = await waitForRequest(attempt2, "reconnect");
        attempt2.fireMessage({
          jsonrpc: "2.0",
          id: reconnect2.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        await flushMicrotasks();
        const dispatched = findNotification(attempt2, "dispatchAction");
        assert.ok(dispatched, "terminal dispatch must ride the failed attempt through to the next successful one");
        client.dispose();
      });
    });
    test("request issued during reconnect rides retries until success", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        transports[0].fireClose();
        await waitForReconnecting(client);
        const inFlight = client.resourceList(URI.file("/workspace")).catch((err) => err);
        const attempt1 = await waitForTransport(transports, 1);
        attempt1.connectDeferred.error(new Error("connect failed"));
        const attempt2 = await waitForTransport(transports, 2);
        assert.strictEqual(
          findRequest(attempt2, "resourceList"),
          void 0,
          "request must not slip through to the new transport before its handshake completes"
        );
        attempt2.connectDeferred.complete();
        const reconnect2 = await waitForRequest(attempt2, "reconnect");
        attempt2.fireMessage({
          jsonrpc: "2.0",
          id: reconnect2.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        const resourceList = await waitForRequest(attempt2, "resourceList");
        attempt2.fireMessage({ jsonrpc: "2.0", id: resourceList.id, result: { entries: [] } });
        const value = await inFlight;
        assert.deepStrictEqual(
          value,
          { entries: [] },
          "request must resolve once a later reconnect attempt succeeds"
        );
        client.dispose();
      });
    });
    test("_sendExtensionRequest waits for the reconnect gate", async function() {
      this.timeout(1e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        transports[0].fireClose();
        await waitForReconnecting(client);
        const shutdown = client.shutdown().catch((err) => err);
        const reconnectTransport = await waitForTransport(transports, 1);
        assert.strictEqual(
          findRequest(reconnectTransport, "shutdown"),
          void 0,
          "shutdown extension request must NOT be sent before reconnect completes"
        );
        reconnectTransport.connectDeferred.complete();
        const reconnect = await waitForRequest(reconnectTransport, "reconnect");
        reconnectTransport.fireMessage({
          jsonrpc: "2.0",
          id: reconnect.id,
          result: { type: ReconnectResultType.Replay, actions: [], missing: [] }
        });
        const shutdownReq = await waitForRequest(reconnectTransport, "shutdown");
        reconnectTransport.fireMessage({ jsonrpc: "2.0", id: shutdownReq.id, result: null });
        await shutdown;
        client.dispose();
      });
    });
    test("watchdog dead-transport detection triggers soft reconnect", async function() {
      this.timeout(6e4);
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        const { client, transports } = createFactoryClient();
        const connectPromise = client.connect();
        await completeHandshake(transports[0], connectPromise);
        const pending = client.resourceList(URI.file("/workspace")).catch((err2) => err2);
        await timeout(3e4);
        assert.strictEqual(
          client.connectionState,
          AgentHostClientState.Reconnecting,
          "watchdog must drive the client into Reconnecting via soft reconnect rather than firing onDidClose"
        );
        const err = await pending;
        assert.ok(err instanceof ProtocolError);
        assert.match(err.message, /Connection appears dead/);
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxlbGVjdHJvbi1icm93c2VyXFxyZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudFN0YXRlLCBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUsIEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIEFnZW50SG9zdFJlc291cmNlUGVybWlzc2lvbkVycm9yLCBJQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlLCBMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFJlc291cmNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCB0eXBlIElDb25maWd1cmF0aW9uVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRlbnRFbmNvZGluZywgUmVjb25uZWN0UmVzdWx0VHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDaGF0U291cmNlS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1jaGF0L2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFocEVycm9yQ29kZXMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvZXJyb3JzLmpzJztcbmltcG9ydCB7IFBST1RPQ09MX1ZFUlNJT04sIFNVUFBPUlRFRF9QUk9UT0NPTF9WRVJTSU9OUyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQ2hhdFR1cm5TdGFydGVkQWN0aW9uLCB0eXBlIFNlc3Npb25BY3RpdmVDbGllbnRTZXRBY3Rpb24sIHR5cGUgU2Vzc2lvbkFjdGl2ZUNsaWVudFJlbW92ZWRBY3Rpb24sIHR5cGUgU2Vzc2lvblRpdGxlQ2hhbmdlZEFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBQcm90b2NvbEVycm9yLCB0eXBlIEFocFNlcnZlck5vdGlmaWNhdGlvbiwgdHlwZSBKc29uUnBjTm90aWZpY2F0aW9uLCB0eXBlIEpzb25ScGNSZXF1ZXN0LCB0eXBlIEpzb25ScGNSZXNwb25zZSwgdHlwZSBQcm90b2NvbE1lc3NhZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IGJ1aWxkRGVmYXVsdENoYXRVcmksIEN1c3RvbWl6YXRpb25UeXBlLCBNZXNzYWdlQXR0YWNobWVudEtpbmQsIE1lc3NhZ2VLaW5kLCBQZW5kaW5nTWVzc2FnZUtpbmQsIHJlYWRTZXNzaW9uRXh0ZXJuYWwsIHJlYWRTZXNzaW9uV29ya3NwYWNlbGVzcywgUk9PVF9TVEFURV9VUkksIFNlc3Npb25TdGF0dXMsIFN0YXRlQ29tcG9uZW50cywgY3VzdG9taXphdGlvbklkLCB3aXRoU2Vzc2lvbkV4dGVybmFsLCB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3MgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IE5vblJlY29ubmVjdGFibGVUcmFuc3BvcnRFcnJvciwgdHlwZSBJQ2xpZW50VHJhbnNwb3J0LCB0eXBlIElQcm90b2NvbFRyYW5zcG9ydCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uVHJhbnNwb3J0LmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlLCBUZWxlbWV0cnlMZXZlbCB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3REaXNhYmxlUmVwb0luZm9UZWxlbWV0cnlDb25maWdLZXksIEFnZW50SG9zdFRlbGVtZXRyeUxldmVsQ29uZmlnS2V5LCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXksIERJU0FCTEVfUkVQT19JTkZPX1RFTEVNRVRSWV9TRVRUSU5HX0lELCBHTE9CQUxfQVVUT19BUFBST1ZFX1NFVFRJTkdfSUQsIHRlbGVtZXRyeUxldmVsVG9BZ2VudEhvc3RDb25maWdWYWx1ZSwgVEVSTUlOQUxfQVVUT19BUFBST1ZFX0VOQUJMRURfU0VUVElOR19JRCwgVEVSTUlOQUxfQVVUT19BUFBST1ZFX1NFVFRJTkdfSUQsIFRFUk1JTkFMX0lHTk9SRV9ERUZBVUxUX0FVVE9fQVBQUk9WRV9SVUxFU19TRVRUSU5HX0lELCB0eXBlIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TWFwTGVnYWN5U2V0dGluZ3NUb01hbmFnZWRTZXR0aW5nc1NldHRpbmdJZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbi8vIFNldHRpbmdzIHVzZWQgdG8gZXhlcmNpc2UgZGVjbGFyYXRpdmUgYWdlbnQtaG9zdCBtaXJyb3JpbmcuIFJlZ2lzdGVyZWQgYnkgdGhpc1xuLy8gc3VpdGUgcmF0aGVyIHRoYW4gcHVsbGluZyBpbiBhIHByb2R1Y3QgY29uZmlndXJhdGlvbiBjb250cmlidXRpb246IHRoZVxuLy8gY29uZmlndXJhdGlvbiByZWdpc3RyeSBpcyBhIHByb2Nlc3Mtd2lkZSBzaW5nbGV0b24sIHNvIGEgc2lkZS1lZmZlY3QgaW1wb3J0XG4vLyBoZXJlIHdvdWxkIGxlYWsgaXRzIHJlZ2lzdHJhdGlvbnMgKGFuZCB0aGVpciBgbWFuYWdlZFNldHRpbmdzYCBwb2xpY2llcykgaW50b1xuLy8gZXZlcnkgb3RoZXIgc3VpdGUgaW4gdGhlIHJ1bi5cbmNvbnN0IFNZTkNfU0VUVElOR19BID0gJ3Rlc3QucmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQuc3luY0EnO1xuY29uc3QgU1lOQ19DT05GSUdfS0VZX0EgPSAndGVzdFN5bmNWYWx1ZUEnO1xuY29uc3QgU1lOQ19TRVRUSU5HX0IgPSAndGVzdC5yZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudC5zeW5jQic7XG5jb25zdCBTWU5DX0NPTkZJR19LRVlfQiA9ICd0ZXN0U3luY1ZhbHVlQic7XG5cbmNvbnN0IHN5bmNUZXN0Q29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdGlkOiAndGVzdFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50U3luYycsXG5cdHR5cGU6ICdvYmplY3QnIGFzIGNvbnN0LFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0W1NZTkNfU0VUVElOR19BXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nIGFzIGNvbnN0LFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRhZ2VudEhvc3Q6IHsga2V5OiBTWU5DX0NPTkZJR19LRVlfQSB9LFxuXHRcdH0sXG5cdFx0W1NZTkNfU0VUVElOR19CXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nIGFzIGNvbnN0LFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRhZ2VudEhvc3Q6IHsga2V5OiBTWU5DX0NPTkZJR19LRVlfQiB9LFxuXHRcdH0sXG5cdH0sXG59O1xuaW1wb3J0IHR5cGUgeyBJbXBsZW1lbnRhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgYWdlbnRzV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFRlbGVtZXRyeS5qcyc7XG5cbnR5cGUgUHJvdG9jb2xUcmFuc3BvcnRNZXNzYWdlID0gUHJvdG9jb2xNZXNzYWdlIHwgQWhwU2VydmVyTm90aWZpY2F0aW9uIHwgSnNvblJwY05vdGlmaWNhdGlvbiB8IEpzb25ScGNSZXNwb25zZSB8IEpzb25ScGNSZXF1ZXN0O1xudHlwZSBSb290Q29uZmlnVmFsdWUgPSBib29sZWFuIHwgc3RyaW5nIHwgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzIHwgdW5kZWZpbmVkO1xuXG5jbGFzcyBUZXN0Q2xpZW50SWRlbnRpdHlUZWxlbWV0cnlTZXJ2aWNlIGltcGxlbWVudHMgSVRlbGVtZXRyeVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdGVsZW1ldHJ5TGV2ZWwgPSBUZWxlbWV0cnlMZXZlbC5VU0FHRTtcblx0cmVhZG9ubHkgc2Vzc2lvbklkID0gJ2NsaWVudC1zZXNzaW9uLWlkJztcblx0cmVhZG9ubHkgbWFjaGluZUlkID0gJ2NsaWVudC1tYWNoaW5lLWlkJztcblx0cmVhZG9ubHkgc3FtSWQgPSAnY2xpZW50LXNxbS1pZCc7XG5cdHJlYWRvbmx5IGRldkRldmljZUlkID0gJ2NsaWVudC1kZXYtZGV2aWNlLWlkJztcblx0cmVhZG9ubHkgZmlyc3RTZXNzaW9uRGF0ZSA9ICcyMDI2LTA4LTE0Jztcblx0cmVhZG9ubHkgc2VuZEVycm9yVGVsZW1ldHJ5ID0gdHJ1ZTtcblx0cHVibGljTG9nKCk6IHZvaWQgeyB9XG5cdHB1YmxpY0xvZzIoKTogdm9pZCB7IH1cblx0cHVibGljTG9nRXJyb3IoKTogdm9pZCB7IH1cblx0cHVibGljTG9nRXJyb3IyKCk6IHZvaWQgeyB9XG5cdHNldEV4cGVyaW1lbnRQcm9wZXJ0eSgpOiB2b2lkIHsgfVxuXHRzZXRDb21tb25Qcm9wZXJ0eSgpOiB2b2lkIHsgfVxufVxuXG5pbnRlcmZhY2UgSVRlc3RSb290Q29uZmlnTm90aWZpY2F0aW9uUGFyYW1zIHtcblx0cmVhZG9ubHkgYWN0aW9uPzoge1xuXHRcdHJlYWRvbmx5IHR5cGU/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgY29uZmlnPzogUmVjb3JkPHN0cmluZywgUm9vdENvbmZpZ1ZhbHVlPjtcblx0fTtcbn1cblxuZnVuY3Rpb24gaXNQaW5nUmVxdWVzdChtc2c6IFByb3RvY29sVHJhbnNwb3J0TWVzc2FnZSk6IG1zZyBpcyBKc29uUnBjUmVxdWVzdCAmIHsgbWV0aG9kOiAncGluZycgfSB7XG5cdHJldHVybiBoYXNLZXkobXNnLCB7IG1ldGhvZDogdHJ1ZSwgaWQ6IHRydWUgfSkgJiYgbXNnLm1ldGhvZCA9PT0gJ3BpbmcnO1xufVxuXG4vKipcbiAqIExvY2F0ZSB0aGUgYGRpc3BhdGNoQWN0aW9uYCBub3RpZmljYXRpb24gdGhhdCBmb3J3YXJkcyBhIHBhcnRpY3VsYXIgcm9vdFxuICogY29uZmlnIGtleS4gVGhlIGNvbm5lY3QgZmxvdyBzZW5kcyBzZXZlcmFsIGBSb290Q29uZmlnQ2hhbmdlZGAgbm90aWZpY2F0aW9uc1xuICogKHRlbGVtZXRyeSwgc2Vzc2lvbiBzeW5jLCB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUpLCBzbyBtYXRjaGluZyBvbiB0aGUgY29uZmlnXG4gKiBrZXkgaXMgbW9yZSByb2J1c3QgdGhhbiBpbmRleGluZyBpbnRvIGBzZW50TWVzc2FnZXNgIGJ5IHBvc2l0aW9uLlxuICovXG5mdW5jdGlvbiBmaW5kUm9vdENvbmZpZ05vdGlmaWNhdGlvbihtZXNzYWdlczogcmVhZG9ubHkgUHJvdG9jb2xUcmFuc3BvcnRNZXNzYWdlW10sIGNvbmZpZ0tleTogc3RyaW5nKTogSnNvblJwY05vdGlmaWNhdGlvbiB7XG5cdGNvbnN0IG1hdGNoID0gbWVzc2FnZXMuZmluZCgobXNnKTogbXNnIGlzIEpzb25ScGNOb3RpZmljYXRpb24gPT4ge1xuXHRcdGlmICghaGFzS2V5KG1zZywgeyBtZXRob2Q6IHRydWUgfSkgfHwgbXNnLm1ldGhvZCAhPT0gJ2Rpc3BhdGNoQWN0aW9uJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBwYXJhbXMgPSAobXNnIGFzIEpzb25ScGNOb3RpZmljYXRpb24pLnBhcmFtcyBhcyBJVGVzdFJvb3RDb25maWdOb3RpZmljYXRpb25QYXJhbXMgfCB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHBhcmFtcz8uYWN0aW9uPy50eXBlID09PSBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkICYmICEhcGFyYW1zLmFjdGlvbi5jb25maWcgJiYgY29uZmlnS2V5IGluIHBhcmFtcy5hY3Rpb24uY29uZmlnO1xuXHR9KTtcblx0YXNzZXJ0Lm9rKG1hdGNoLCBgRXhwZWN0ZWQgYSBSb290Q29uZmlnQ2hhbmdlZCBub3RpZmljYXRpb24gY2FycnlpbmcgJyR7Y29uZmlnS2V5fSdgKTtcblx0cmV0dXJuIG1hdGNoO1xufVxuXG5mdW5jdGlvbiBnZXRSb290Q29uZmlnKG5vdGlmaWNhdGlvbjogSnNvblJwY05vdGlmaWNhdGlvbik6IFJlY29yZDxzdHJpbmcsIFJvb3RDb25maWdWYWx1ZT4ge1xuXHRjb25zdCBwYXJhbXMgPSBub3RpZmljYXRpb24ucGFyYW1zIGFzIElUZXN0Um9vdENvbmZpZ05vdGlmaWNhdGlvblBhcmFtcyB8IHVuZGVmaW5lZDtcblx0YXNzZXJ0Lm9rKHBhcmFtcz8uYWN0aW9uPy5jb25maWcpO1xuXHRyZXR1cm4gcGFyYW1zLmFjdGlvbi5jb25maWc7XG59XG5cbmZ1bmN0aW9uIGZpbmRMYXN0Um9vdENvbmZpZ05vdGlmaWNhdGlvbihtZXNzYWdlczogcmVhZG9ubHkgUHJvdG9jb2xUcmFuc3BvcnRNZXNzYWdlW10sIGNvbmZpZ0tleTogc3RyaW5nKTogSnNvblJwY05vdGlmaWNhdGlvbiB7XG5cdHJldHVybiBmaW5kUm9vdENvbmZpZ05vdGlmaWNhdGlvbihbLi4ubWVzc2FnZXNdLnJldmVyc2UoKSwgY29uZmlnS2V5KTtcbn1cblxuZnVuY3Rpb24gZmluZExhc3RNYW5hZ2VkU2V0dGluZ3NOb3RpZmljYXRpb24obWVzc2FnZXM6IHJlYWRvbmx5IFByb3RvY29sVHJhbnNwb3J0TWVzc2FnZVtdKTogUHJvdG9jb2xUcmFuc3BvcnRNZXNzYWdlIHtcblx0Y29uc3QgbWF0Y2ggPSBbLi4ubWVzc2FnZXNdLnJldmVyc2UoKS5maW5kKG1lc3NhZ2UgPT4gaGFzS2V5KG1lc3NhZ2UsIHsgbWV0aG9kOiB0cnVlIH0pICYmIG1lc3NhZ2UubWV0aG9kID09PSAnc2V0Q2xpZW50TWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMnKTtcblx0YXNzZXJ0Lm9rKG1hdGNoLCAnRXhwZWN0ZWQgYSBzZXRDbGllbnRNYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9ucyBub3RpZmljYXRpb24nKTtcblx0cmV0dXJuIG1hdGNoO1xufVxuXG4vKiogVGhlIHZhbHVlIGZvcndhcmRlZCBmb3IgYGNvbmZpZ0tleWAgaW4gdGhlIGZpcnN0IHJvb3QtY29uZmlnIG5vdGlmaWNhdGlvbiBjYXJyeWluZyBpdC4gKi9cbmZ1bmN0aW9uIGZpbmRSb290Q29uZmlnVmFsdWUobWVzc2FnZXM6IHJlYWRvbmx5IFByb3RvY29sVHJhbnNwb3J0TWVzc2FnZVtdLCBjb25maWdLZXk6IHN0cmluZyk6IFJvb3RDb25maWdWYWx1ZSB7XG5cdHJldHVybiBnZXRSb290Q29uZmlnKGZpbmRSb290Q29uZmlnTm90aWZpY2F0aW9uKG1lc3NhZ2VzLCBjb25maWdLZXkpKVtjb25maWdLZXldO1xufVxuXG5jbGFzcyBUZXN0UHJvdG9jb2xUcmFuc3BvcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVByb3RvY29sVHJhbnNwb3J0IHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgY2xpZW50Q29ubmVjdGlvbktpbmQ/OiBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1lc3NhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxQcm90b2NvbE1lc3NhZ2U+KCkpO1xuXHRyZWFkb25seSBvbk1lc3NhZ2UgPSB0aGlzLl9vbk1lc3NhZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25DbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkNsb3NlID0gdGhpcy5fb25DbG9zZS5ldmVudDtcblxuXHRyZWFkb25seSBzZW50TWVzc2FnZXM6IFByb3RvY29sVHJhbnNwb3J0TWVzc2FnZVtdID0gW107XG5cblx0c2VuZChtZXNzYWdlOiBQcm90b2NvbFRyYW5zcG9ydE1lc3NhZ2UpOiB2b2lkIHtcblx0XHR0aGlzLnNlbnRNZXNzYWdlcy5wdXNoKG1lc3NhZ2UpO1xuXHR9XG5cblx0ZmlyZU1lc3NhZ2UobWVzc2FnZTogUHJvdG9jb2xNZXNzYWdlKTogdm9pZCB7XG5cdFx0dGhpcy5fb25NZXNzYWdlLmZpcmUobWVzc2FnZSk7XG5cdH1cblxuXHRmaXJlQ2xvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25DbG9zZS5maXJlKCk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdENsaWVudFByb3RvY29sVHJhbnNwb3J0IGV4dGVuZHMgVGVzdFByb3RvY29sVHJhbnNwb3J0IGltcGxlbWVudHMgSUNsaWVudFRyYW5zcG9ydCB7XG5cdHJlYWRvbmx5IGNvbm5lY3REZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblxuXHRjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNvbm5lY3REZWZlcnJlZC5wO1xuXHR9XG59XG5cbmNsYXNzIENsb3NlT25EaXNwb3NlUHJvdG9jb2xUcmFuc3BvcnQgZXh0ZW5kcyBUZXN0UHJvdG9jb2xUcmFuc3BvcnQge1xuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZmlyZUNsb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIENvdW50aW5nTG9nU2VydmljZSBleHRlbmRzIE51bGxMb2dTZXJ2aWNlIHtcblx0d2FybkNvdW50ID0gMDtcblxuXHRvdmVycmlkZSB3YXJuKF9tZXNzYWdlOiBzdHJpbmcsIC4uLl9hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLndhcm5Db3VudCsrO1xuXHR9XG59XG5cbmNsYXNzIFRlcm1pbmFsQXV0b0FwcHJvdmVDb25maWd1cmF0aW9uU2VydmljZSBleHRlbmRzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29uZmlndXJhdGlvbjogUmVjb3JkPHN0cmluZywgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzIHwgYm9vbGVhbj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxBdXRvQXBwcm92ZUluc3BlY3RWYWx1ZTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxSZWFkb25seTxBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXM+Pixcblx0KSB7XG5cdFx0c3VwZXIoY29uZmlndXJhdGlvbik7XG5cdH1cblxuXHRvdmVycmlkZSBpbnNwZWN0PFQ+KGtleTogc3RyaW5nKTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxUPiB7XG5cdFx0aWYgKGtleSA9PT0gVEVSTUlOQUxfQVVUT19BUFBST1ZFX1NFVFRJTkdfSUQpIHtcblx0XHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbEF1dG9BcHByb3ZlSW5zcGVjdFZhbHVlIGFzIElDb25maWd1cmF0aW9uVmFsdWU8VD47XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5pbnNwZWN0PFQ+KGtleSk7XG5cdH1cbn1cblxuY2xhc3MgTWFuYWdlZFBlcm1pc3Npb25zQ29uZmlndXJhdGlvblNlcnZpY2UgZXh0ZW5kcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRwcml2YXRlIGdsb2JhbEF1dG9BcHByb3ZlUG9saWN5VmFsdWU6IGJvb2xlYW4gfCB1bmRlZmluZWQgPSBmYWxzZTtcblxuXHRvdmVycmlkZSBpbnNwZWN0PFQ+KGtleTogc3RyaW5nKTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxUPiB7XG5cdFx0aWYgKGtleSA9PT0gR0xPQkFMX0FVVE9fQVBQUk9WRV9TRVRUSU5HX0lEKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5zdXBlci5pbnNwZWN0PFQ+KGtleSksXG5cdFx0XHRcdHBvbGljeVZhbHVlOiB0aGlzLmdsb2JhbEF1dG9BcHByb3ZlUG9saWN5VmFsdWUgYXMgVCB8IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5pbnNwZWN0PFQ+KGtleSk7XG5cdH1cblxuXHRjbGVhckdsb2JhbEF1dG9BcHByb3ZlUG9saWN5KCk6IHZvaWQge1xuXHRcdHRoaXMuZ2xvYmFsQXV0b0FwcHJvdmVQb2xpY3lWYWx1ZSA9IHVuZGVmaW5lZDtcblx0fVxufVxuXG5zdWl0ZSgnUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cdHN1aXRlU2V0dXAoKCkgPT4gY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbihzeW5jVGVzdENvbmZpZ3VyYXRpb25Ob2RlKSk7XG5cdHN1aXRlVGVhcmRvd24oKCkgPT4gY29uZmlndXJhdGlvblJlZ2lzdHJ5LmRlcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhbc3luY1Rlc3RDb25maWd1cmF0aW9uTm9kZV0pKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVQZXJtaXNzaW9uU2VydmljZShhbGxvdyA9IHRydWUpOiBJQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlIHtcblx0XHRyZXR1cm4gY3JlYXRlUmVzb3VyY2VTZXJ2aWNlU3R1Yih7IGdyYW50ZWQ6ICgpID0+IGFsbG93IH0pO1xuXHR9XG5cblx0aW50ZXJmYWNlIElSZXNvdXJjZVNlcnZpY2VTdHViT3B0cyB7XG5cdFx0Z3JhbnRlZD86IChpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgdXJpOiBVUkksIG1vZGU6IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlKSA9PiBib29sZWFuO1xuXHRcdG9uUmVxdWVzdD86IChpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgcGFyYW1zOiB7IHVyaTogc3RyaW5nOyByZWFkPzogYm9vbGVhbjsgd3JpdGU/OiBib29sZWFuIH0pID0+IFByb21pc2U8dm9pZD47XG5cdFx0b25HcmFudEltcGxpY2l0UmVhZD86IChpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgdXJpOiBVUkkpID0+IHZvaWQ7XG5cdFx0LyoqIFRlc3QgaG9vayB0aGF0IG9ic2VydmVzIGRpc3Bvc2FsIG9mIHRoZSBpbXBsaWNpdC1yZWFkIGdyYW50LiAqL1xuXHRcdG9uUmV2b2tlSW1wbGljaXRSZWFkPzogKGlkZW50aXR5OiBBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5LCB1cmk6IFVSSSkgPT4gdm9pZDtcblx0XHRyZWFkQnl0ZXM/OiBWU0J1ZmZlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdHViIGZvciB7QGxpbmsgSUFnZW50SG9zdFJlc291cmNlU2VydmljZX06IGVhY2ggRlMgbWV0aG9kIHJ1bnMgdGhlXG5cdCAqIGBncmFudGVkYCBwcmVkaWNhdGUgYW5kIGVpdGhlciB0aHJvd3Mge0BsaW5rIEFnZW50SG9zdFJlc291cmNlUGVybWlzc2lvbkVycm9yfVxuXHQgKiAoY2FycnlpbmcgdGhlIHNhbWUgYHJlc291cmNlUmVxdWVzdGAgcGF5bG9hZCB0aGUgcmVhbCBzZXJ2aWNlIHdvdWxkXG5cdCAqIGFkdmVydGlzZSkgb3IgcmVzb2x2ZXMgd2l0aCBhIG1pbmltYWwgcGxhY2Vob2xkZXIgcmVzdWx0LiBTdWZmaWNpZW50IHRvXG5cdCAqIGRyaXZlIHRoZSBwcm90b2NvbCBjbGllbnQncyByZXZlcnNlLVJQQyBwZXJtaXNzaW9uLWdhdGluZyBwYXRocy5cblx0ICovXG5cdGZ1bmN0aW9uIGNyZWF0ZVJlc291cmNlU2VydmljZVN0dWIob3B0czogSVJlc291cmNlU2VydmljZVN0dWJPcHRzID0ge30pOiBJQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlIHtcblx0XHRjb25zdCBncmFudCA9IG9wdHMuZ3JhbnRlZCA/PyAoKCkgPT4gdHJ1ZSk7XG5cdFx0Y29uc3QgZW1wdHkgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgbmV2ZXJbXT4oJ3Rlc3QnLCBbXSk7XG5cdFx0Y29uc3QgZGVueVJlYWQgPSAodXJpOiBzdHJpbmcpID0+IG5ldyBBZ2VudEhvc3RSZXNvdXJjZVBlcm1pc3Npb25FcnJvcih7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaSwgcmVhZDogdHJ1ZSB9KTtcblx0XHRjb25zdCBkZW55V3JpdGUgPSAodXJpOiBzdHJpbmcpID0+IG5ldyBBZ2VudEhvc3RSZXNvdXJjZVBlcm1pc3Npb25FcnJvcih7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaSwgd3JpdGU6IHRydWUgfSk7XG5cdFx0Y29uc3QgZ2F0ZVJlYWQgPSBhc3luYyAoaWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksIHVyaTogVVJJKSA9PiB7XG5cdFx0XHRpZiAoIWdyYW50KGlkZW50aXR5LCB1cmksIEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQpKSB7IHRocm93IGRlbnlSZWFkKHVyaS50b1N0cmluZygpKTsgfVxuXHRcdH07XG5cdFx0Y29uc3QgZ2F0ZVdyaXRlID0gYXN5bmMgKGlkZW50aXR5OiBBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5LCB1cmk6IFVSSSkgPT4ge1xuXHRcdFx0aWYgKCFncmFudChpZGVudGl0eSwgdXJpLCBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5Xcml0ZSkpIHsgdGhyb3cgZGVueVdyaXRlKHVyaS50b1N0cmluZygpKTsgfVxuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGNoZWNrOiBhc3luYyAoYWRkciwgdXJpLCBtb2RlKSA9PiBncmFudChhZGRyLCB1cmksIG1vZGUpLFxuXHRcdFx0YXN5bmMgbGlzdChhZGRyLCB1cmkpIHsgYXdhaXQgZ2F0ZVJlYWQoYWRkciwgdXJpKTsgcmV0dXJuIHsgZW50cmllczogW10gfTsgfSxcblx0XHRcdGFzeW5jIHJlYWQoYWRkciwgdXJpKSB7XG5cdFx0XHRcdGF3YWl0IGdhdGVSZWFkKGFkZHIsIHVyaSk7XG5cdFx0XHRcdGlmIChvcHRzLnJlYWRCeXRlcykge1xuXHRcdFx0XHRcdHJldHVybiB7IGJ5dGVzOiBvcHRzLnJlYWRCeXRlcyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkIGluIHN0dWInKTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyB3cml0ZShhZGRyLCBwYXJhbXMpIHsgYXdhaXQgZ2F0ZVdyaXRlKGFkZHIsIFVSSS5wYXJzZShwYXJhbXMudXJpKSk7IH0sXG5cdFx0XHRhc3luYyBkZWwoYWRkciwgcGFyYW1zKSB7IGF3YWl0IGdhdGVXcml0ZShhZGRyLCBVUkkucGFyc2UocGFyYW1zLnVyaSkpOyB9LFxuXHRcdFx0YXN5bmMgbW92ZShhZGRyLCBwYXJhbXMpIHsgYXdhaXQgZ2F0ZVdyaXRlKGFkZHIsIFVSSS5wYXJzZShwYXJhbXMuc291cmNlKSk7IGF3YWl0IGdhdGVXcml0ZShhZGRyLCBVUkkucGFyc2UocGFyYW1zLmRlc3RpbmF0aW9uKSk7IH0sXG5cdFx0XHRhc3luYyBjb3B5KGFkZHIsIHBhcmFtcykgeyBhd2FpdCBnYXRlUmVhZChhZGRyLCBVUkkucGFyc2UocGFyYW1zLnNvdXJjZSkpOyBhd2FpdCBnYXRlV3JpdGUoYWRkciwgVVJJLnBhcnNlKHBhcmFtcy5kZXN0aW5hdGlvbikpOyB9LFxuXHRcdFx0YXN5bmMgcmVzb2x2ZShhZGRyLCBwYXJhbXMpIHsgYXdhaXQgZ2F0ZVJlYWQoYWRkciwgVVJJLnBhcnNlKHBhcmFtcy51cmkpKTsgdGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQgaW4gc3R1YicpOyB9LFxuXHRcdFx0YXN5bmMgbWtkaXIoYWRkciwgcGFyYW1zKSB7IGF3YWl0IGdhdGVXcml0ZShhZGRyLCBVUkkucGFyc2UocGFyYW1zLnVyaSkpOyB9LFxuXHRcdFx0cmVxdWVzdDogYXN5bmMgKGFkZHIsIHBhcmFtcykgPT4gb3B0cy5vblJlcXVlc3QgPyBvcHRzLm9uUmVxdWVzdChhZGRyLCBwYXJhbXMpIDogdW5kZWZpbmVkLFxuXHRcdFx0cGVuZGluZ0ZvcjogKCkgPT4gZW1wdHksXG5cdFx0XHRhbGxQZW5kaW5nOiBlbXB0eSxcblx0XHRcdGZpbmRQZW5kaW5nOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRncmFudEltcGxpY2l0UmVhZDogKGFkZHJlc3MsIHVyaSkgPT4ge1xuXHRcdFx0XHRvcHRzLm9uR3JhbnRJbXBsaWNpdFJlYWQ/LihhZGRyZXNzLCB1cmkpO1xuXHRcdFx0XHRyZXR1cm4gb3B0cy5vblJldm9rZUltcGxpY2l0UmVhZCA/IHRvRGlzcG9zYWJsZSgoKSA9PiBvcHRzLm9uUmV2b2tlSW1wbGljaXRSZWFkPy4oYWRkcmVzcywgdXJpKSkgOiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0XHR9LFxuXHRcdFx0Y29ubmVjdGlvbkNsb3NlZDogKCkgPT4geyB9LFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVDbGllbnRGb3JJZGVudGl0eShpZGVudGl0eTogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eSwgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UHJvdG9jb2xUcmFuc3BvcnQoKSksIHBlcm1pc3Npb25TZXJ2aWNlID0gY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoKSwgbG9hZEVzdGltYXRvcj86IHsgaGFzSGlnaExvYWQoKTogYm9vbGVhbiB9LCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpLCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSwgY2xpZW50SWQ/OiBzdHJpbmcsIGNsaWVudEluZm8/OiBJbXBsZW1lbnRhdGlvbiwgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UgPSBOdWxsVGVsZW1ldHJ5U2VydmljZSk6IHsgY2xpZW50OiBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudDsgdHJhbnNwb3J0OiBUZXN0UHJvdG9jb2xUcmFuc3BvcnQ7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSB7XG5cdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudChpZGVudGl0eSwgdHJhbnNwb3J0LCBsb2FkRXN0aW1hdG9yLCBjbGllbnRJZCwgY2xpZW50SW5mbywgbG9nU2VydmljZSwgcGVybWlzc2lvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0cmV0dXJuIHsgY2xpZW50LCB0cmFuc3BvcnQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVDbGllbnQodHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UHJvdG9jb2xUcmFuc3BvcnQoKSksIHBlcm1pc3Npb25TZXJ2aWNlID0gY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoKSwgbG9hZEVzdGltYXRvcj86IHsgaGFzSGlnaExvYWQoKTogYm9vbGVhbiB9LCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpLCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSwgY2xpZW50SWQ/OiBzdHJpbmcsIGNsaWVudEluZm8/OiBJbXBsZW1lbnRhdGlvbik6IHsgY2xpZW50OiBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudDsgdHJhbnNwb3J0OiBUZXN0UHJvdG9jb2xUcmFuc3BvcnQ7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSB7XG5cdFx0cmV0dXJuIGNyZWF0ZUNsaWVudEZvcklkZW50aXR5KCd0ZXN0LmV4YW1wbGU6MTIzNCcsIHRyYW5zcG9ydCwgcGVybWlzc2lvblNlcnZpY2UsIGxvYWRFc3RpbWF0b3IsIGxvZ1NlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjbGllbnRJZCwgY2xpZW50SW5mbyk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjb25uZWN0Q2xpZW50KGNsaWVudDogUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQsIHRyYW5zcG9ydDogVGVzdFByb3RvY29sVHJhbnNwb3J0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdHdoaWxlICh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlbnQgPSB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzWzBdIGFzIEpzb25ScGNSZXF1ZXN0O1xuXHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiBzZW50LmlkLFxuXHRcdFx0cmVzdWx0OiB7IHByb3RvY29sVmVyc2lvbjogUFJPVE9DT0xfVkVSU0lPTiwgc2VydmVyU2VxOiAwLCBzbmFwc2hvdHM6IFtdIH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgY29ubmVjdFByb21pc2U7XG5cdH1cblxuXHR0ZXN0KCdpbml0aWFsaXplIHNlbmRzIHRoZSBsb2NhbCBjbGllbnQgdGVsZW1ldHJ5IGlkZW50aXR5IG9ubHkgZm9yIHVzYWdlIHRlbGVtZXRyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RQcm90b2NvbFRyYW5zcG9ydChBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZC5SZW1vdGVFeHRlbnNpb25Ib3N0KSk7XG5cdFx0Y29uc3QgeyBjbGllbnQgfSA9IGNyZWF0ZUNsaWVudEZvcklkZW50aXR5KCd0ZXN0LmV4YW1wbGU6MTIzNCcsIHRyYW5zcG9ydCwgY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoKSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLCB1bmRlZmluZWQsIGFnZW50c1dpbmRvd0FnZW50SG9zdENsaWVudEluZm8sIG5ldyBUZXN0Q2xpZW50SWRlbnRpdHlUZWxlbWV0cnlTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gY2xpZW50LmNvbm5lY3QoKTtcblx0XHRjb25zdCBpbml0aWFsaXplID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSBhcyBKc29uUnBjUmVxdWVzdDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGluaXRpYWxpemUucGFyYW1zIGFzIHsgX21ldGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9KS5fbWV0YSwge1xuXHRcdFx0J3ZzY29kZS5jbGllbnRDb25uZWN0aW9uS2luZCc6IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kLlJlbW90ZUV4dGVuc2lvbkhvc3QsXG5cdFx0XHQndnNjb2RlLmNsaWVudE1hY2hpbmVJZCc6ICdjbGllbnQtbWFjaGluZS1pZCcsXG5cdFx0XHQndnNjb2RlLmNsaWVudERldkRldmljZUlkJzogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHR9KTtcblxuXHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiBpbml0aWFsaXplLmlkLFxuXHRcdFx0cmVzdWx0OiB7IHByb3RvY29sVmVyc2lvbjogUFJPVE9DT0xfVkVSU0lPTiwgc2VydmVyU2VxOiAwLCBzbmFwc2hvdHM6IFtdIH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgY29ubmVjdFByb21pc2U7XG5cblx0XHRjb25zdCBub1RlbGVtZXRyeVRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFByb3RvY29sVHJhbnNwb3J0KCkpO1xuXHRcdGNvbnN0IG5vVGVsZW1ldHJ5Q2xpZW50ID0gY3JlYXRlQ2xpZW50KG5vVGVsZW1ldHJ5VHJhbnNwb3J0KS5jbGllbnQ7XG5cdFx0Y29uc3Qgbm9UZWxlbWV0cnlDb25uZWN0UHJvbWlzZSA9IG5vVGVsZW1ldHJ5Q2xpZW50LmNvbm5lY3QoKTtcblx0XHRjb25zdCBub1RlbGVtZXRyeUluaXRpYWxpemUgPSBub1RlbGVtZXRyeVRyYW5zcG9ydC5zZW50TWVzc2FnZXNbMF0gYXMgSnNvblJwY1JlcXVlc3Q7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChub1RlbGVtZXRyeUluaXRpYWxpemUucGFyYW1zIGFzIHsgX21ldGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9KS5fbWV0YSwgdW5kZWZpbmVkKTtcblx0XHRub1RlbGVtZXRyeVRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiBub1RlbGVtZXRyeUluaXRpYWxpemUuaWQsXG5cdFx0XHRyZXN1bHQ6IHsgcHJvdG9jb2xWZXJzaW9uOiBQUk9UT0NPTF9WRVJTSU9OLCBzZXJ2ZXJTZXE6IDAsIHNuYXBzaG90czogW10gfSxcblx0XHR9KTtcblx0XHRhd2FpdCBub1RlbGVtZXRyeUNvbm5lY3RQcm9taXNlO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBmbHVzaE1pY3JvdGFza3MoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gYGF3YWl0IFByb21pc2UucmVzb2x2ZSgpYCBvbmx5IGFkdmFuY2VzIG9uZSBtaWNyb3Rhc2s7IGxvb3AgdG8gZHJhaW4gY2hhaW5lZCBoYW5kbGVycy5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwOyBpKyspIHtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGZpcmVDb25maWd1cmF0aW9uQ2hhbmdlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UsIHNldHRpbmdJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtzZXR0aW5nSWRdKSxcblx0XHRcdGNoYW5nZTogeyBrZXlzOiBbc2V0dGluZ0lkXSwgb3ZlcnJpZGVzOiBbXSB9LFxuXHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IGNvbmZpZ3VyYXRpb24gPT4gY29uZmlndXJhdGlvbiA9PT0gc2V0dGluZ0lkLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gYXNzZXJ0UmVtb3RlUHJvdG9jb2xFcnJvcihwcm9taXNlOiBQcm9taXNlPHVua25vd24+LCBleHBlY3RlZDogeyBjb2RlOiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZzsgZGF0YT86IHVua25vd24gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ0V4cGVjdGVkIHByb21pc2UgdG8gcmVqZWN0Jyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICghKGVycm9yIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvcikpIHtcblx0XHRcdFx0YXNzZXJ0LmZhaWwoYEV4cGVjdGVkIFByb3RvY29sRXJyb3IsIGdvdCAke1N0cmluZyhlcnJvcil9YCk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IuY29kZSwgZXhwZWN0ZWQuY29kZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IubWVzc2FnZSwgZXhwZWN0ZWQubWVzc2FnZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVycm9yLmRhdGEsIGV4cGVjdGVkLmRhdGEpO1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ2NvbXBsZXRlcyBtYXRjaGluZyByZXNwb25zZSBhbmQgcmVtb3ZlcyBpdCBmcm9tIHBlbmRpbmcgcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGNsaWVudC5yZXNvdXJjZUxpc3QoVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXNbMF0sIHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IDEsXG5cdFx0XHRtZXRob2Q6ICdyZXNvdXJjZUxpc3QnLFxuXHRcdFx0cGFyYW1zOiB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UnKS50b1N0cmluZygpIH0sXG5cdFx0fSk7XG5cblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIHJlc3VsdDogeyBlbnRyaWVzOiBbXSB9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgcmVzdWx0UHJvbWlzZSwgeyBlbnRyaWVzOiBbXSB9KTtcblxuXHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgcmVzdWx0OiB7IGVudHJpZXM6IFt7IG5hbWU6ICdsYXRlJywgdHlwZTogJ2ZpbGUnIH1dIH0gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmV0YWluIHJldm9rZWQgYXV0aGVudGljYXRpb24gZm9yIHJlY29ubmVjdCByZXBsYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cdFx0Y29uc3QgYXV0aGVudGljYXRlID0gY2xpZW50LmF1dGhlbnRpY2F0ZSh7IHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsIHNjb3BlczogWyd3cml0ZTp1c2VyJywgJ3JlYWQ6dXNlcicsICd3cml0ZTp1c2VyJ10sIHRva2VuOiAndG9rZW4nIH0pO1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0ZVJlcXVlc3QgPSB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzWzBdIGFzIEpzb25ScGNSZXF1ZXN0O1xuXHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogYXV0aGVudGljYXRlUmVxdWVzdC5pZCwgcmVzdWx0OiB7IGF1dGhlbnRpY2F0ZWQ6IHRydWUgfSB9KTtcblx0XHRhd2FpdCBhdXRoZW50aWNhdGU7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdXRoZW50aWNhdGVSZXF1ZXN0LnBhcmFtcywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLFxuXHRcdFx0c2NvcGVzOiBbJ3JlYWQ6dXNlcicsICd3cml0ZTp1c2VyJ10sXG5cdFx0XHR0b2tlbjogJ3Rva2VuJyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJldm9rZSA9IGNsaWVudC5hdXRoZW50aWNhdGUoeyByZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCBzY29wZXM6IFsnd3JpdGU6dXNlcicsICdyZWFkOnVzZXInXSwgdG9rZW46ICcnIH0pO1xuXHRcdGNvbnN0IHJldm9rZVJlcXVlc3QgPSB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzWzFdIGFzIEpzb25ScGNSZXF1ZXN0O1xuXHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogcmV2b2tlUmVxdWVzdC5pZCwgcmVzdWx0OiB7IGF1dGhlbnRpY2F0ZWQ6IHRydWUgfSB9KTtcblx0XHRhd2FpdCByZXZva2U7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jbGllbnRbJ19hdXRoZW50aWNhdGlvbiddLnZhbHVlcygpXSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0U2Vzc2lvbnMgY2FycmllcyB0aGUgd29ya3NwYWNlLWxlc3MgbWFya2VyIGJhY2sgb24gX21ldGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogdGhlIHNlc3Npb25zIHByb3ZpZGVyIHJlc29sdmVzIGEgc2Vzc2lvbidzIGtpbmQgKHF1aWNrXG5cdFx0Ly8gY2hhdCB2cy4gd29ya3NwYWNlKSBmcm9tIGBfbWV0YS53b3Jrc3BhY2VsZXNzYCwgYW5kIGFmdGVyIGEgd2luZG93XG5cdFx0Ly8gcmVsb2FkIGEgbGlzdGluZyBpcyB3aGF0IG1hdGVyaWFsaXplcyBpdC5cblx0XHQvLyBEcm9wcGluZyBgX21ldGFgIG9uIHRoZSB3YXkgYmFjayBtYWRlIGV2ZXJ5IHJlc3RvcmVkIHF1aWNrIGNoYXQgbG9va1xuXHRcdC8vIHdvcmtzcGFjZS1ib3VuZCBhbmQgbGVhayB0aGUgaG9zdCdzIHNjcmF0Y2ggY3dkIGFzIGEgd29ya3NwYWNlIGZvbGRlci5cblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoKTtcblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gY2xpZW50Lmxpc3RTZXNzaW9ucygpO1xuXG5cdFx0Y29uc3Qgc2VudCA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXNbMF0gYXMgSnNvblJwY1JlcXVlc3Q7XG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IHNlbnQuaWQsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0aXRlbXM6IFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6ICdhZ2VudC1zZXNzaW9uOi8vY29waWxvdGNsaS9xdWljay0xJyxcblx0XHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLFxuXHRcdFx0XHRcdHRpdGxlOiAnUXVpY2sgQ2hhdCcsXG5cdFx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgxMDAwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDIwMDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy9ob21lL3VzZXIvLmNvcGlsb3QvY2hhdHMvcXVpY2stMScpLnRvU3RyaW5nKCldLFxuXHRcdFx0XHRcdF9tZXRhOiB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3ModW5kZWZpbmVkLCB0cnVlKSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCByZXN1bHRQcm9taXNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbnMubWFwKHMgPT4gcmVhZFNlc3Npb25Xb3Jrc3BhY2VsZXNzKHMuX21ldGEpKSwgW3RydWVdKTtcblx0fSk7XG5cblx0dGVzdCgnbGlzdFNlc3Npb25zIGNhcnJpZXMgZXh0ZXJuYWwgcHJvdmVuYW5jZSBiYWNrIG9uIF9tZXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCgpO1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQubGlzdFNlc3Npb25zKCk7XG5cblx0XHRjb25zdCBzZW50ID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSBhcyBKc29uUnBjUmVxdWVzdDtcblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogc2VudC5pZCxcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRpdGVtczogW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogJ2FnZW50LXNlc3Npb246Ly9jb3BpbG90Y2xpL25hdGl2ZS0xJyxcblx0XHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLFxuXHRcdFx0XHRcdHRpdGxlOiAnTmF0aXZlIENoYXQnLFxuXHRcdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoMTAwMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgyMDAwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRcdF9tZXRhOiB3aXRoU2Vzc2lvbkV4dGVybmFsKHVuZGVmaW5lZCwgdHJ1ZSksXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25zLm1hcChzID0+IHJlYWRTZXNzaW9uRXh0ZXJuYWwocy5fbWV0YSkpLCBbdHJ1ZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdxdWV1ZXMgcmVxdWVzdHMgYW5kIG5vdGlmaWNhdGlvbnMgdW50aWwgYSBjbGllbnQgdHJhbnNwb3J0IGluaXRpYWxpemVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENsaWVudFByb3RvY29sVHJhbnNwb3J0KCkpO1xuXHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQodHJhbnNwb3J0KTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlJyk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGNsaWVudC5yZXNvdXJjZUxpc3QocmVzb3VyY2UpO1xuXHRcdGNsaWVudC5kaXNwYXRjaChST09UX1NUQVRFX1VSSSwgeyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLCBjb25maWc6IHsgcHJlSW5pdGlhbGl6ZTogdHJ1ZSB9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCwgMCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNsaWVudC5vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZShzdGF0ZSA9PiB7XG5cdFx0XHRpZiAoc3RhdGUgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RlZCkge1xuXHRcdFx0XHRjbGllbnQuZGlzcGF0Y2goUk9PVF9TVEFURV9VUkksIHsgdHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCwgY29uZmlnOiB7IG9uQ29ubmVjdGVkOiB0cnVlIH0gfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY29ubmVjdCA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoLCAwKTtcblxuXHRcdHRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHR3aGlsZSAodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRjb25zdCBpbml0aWFsaXplID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSBhcyBKc29uUnBjUmVxdWVzdDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5pdGlhbGl6ZS5tZXRob2QsICdpbml0aWFsaXplJyk7XG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IGluaXRpYWxpemUuaWQsXG5cdFx0XHRyZXN1bHQ6IHsgcHJvdG9jb2xWZXJzaW9uOiBQUk9UT0NPTF9WRVJTSU9OLCBzZXJ2ZXJTZXE6IDAsIHNuYXBzaG90czogW10gfSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb25uZWN0O1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VMaXN0ID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5maW5kKChtZXNzYWdlKTogbWVzc2FnZSBpcyBKc29uUnBjUmVxdWVzdCA9PlxuXHRcdFx0aGFzS2V5KG1lc3NhZ2UsIHsgbWV0aG9kOiB0cnVlIH0pICYmIG1lc3NhZ2UubWV0aG9kID09PSAncmVzb3VyY2VMaXN0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc291cmNlTGlzdCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXMuZmlsdGVyKChtZXNzYWdlKTogbWVzc2FnZSBpcyBKc29uUnBjTm90aWZpY2F0aW9uID0+XG5cdFx0XHRoYXNLZXkobWVzc2FnZSwgeyBtZXRob2Q6IHRydWUgfSkgJiYgbWVzc2FnZS5tZXRob2QgPT09ICdkaXNwYXRjaEFjdGlvbicpO1xuXHRcdGNvbnN0IHByZUluaXRpYWxpemUgPSBhY3Rpb25zLmZpbmQoYWN0aW9uID0+IChhY3Rpb24ucGFyYW1zIGFzIElUZXN0Um9vdENvbmZpZ05vdGlmaWNhdGlvblBhcmFtcykuYWN0aW9uPy5jb25maWc/LnByZUluaXRpYWxpemUgPT09IHRydWUpO1xuXHRcdGNvbnN0IG9uQ29ubmVjdGVkID0gYWN0aW9ucy5maW5kKGFjdGlvbiA9PiAoYWN0aW9uLnBhcmFtcyBhcyBJVGVzdFJvb3RDb25maWdOb3RpZmljYXRpb25QYXJhbXMpLmFjdGlvbj8uY29uZmlnPy5vbkNvbm5lY3RlZCA9PT0gdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHByZUluaXRpYWxpemUpO1xuXHRcdGFzc2VydC5vayhvbkNvbm5lY3RlZCk7XG5cdFx0YXNzZXJ0Lm9rKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMuaW5kZXhPZihyZXNvdXJjZUxpc3QpIDwgdHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5pbmRleE9mKHByZUluaXRpYWxpemUpKTtcblx0XHRhc3NlcnQub2sodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5pbmRleE9mKHByZUluaXRpYWxpemUpIDwgdHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5pbmRleE9mKG9uQ29ubmVjdGVkKSk7XG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiByZXNvdXJjZUxpc3QuaWQsIHJlc3VsdDogeyBlbnRyaWVzOiBbXSB9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgcmVxdWVzdCwgeyBlbnRyaWVzOiBbXSB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBxdWV1ZWQgcmVxdWVzdHMgYW5kIGRyb3BzIHF1ZXVlZCBub3RpZmljYXRpb25zIHdoZW4gaW5pdGlhbGl6YXRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnQoKSk7XG5cdFx0Y29uc3QgeyBjbGllbnQgfSA9IGNyZWF0ZUNsaWVudCh0cmFuc3BvcnQpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBjbGllbnQucmVzb3VyY2VMaXN0KFVSSS5maWxlKCcvd29ya3NwYWNlJykpO1xuXHRcdGNsaWVudC5kaXNwYXRjaChST09UX1NUQVRFX1VSSSwgeyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLCBjb25maWc6IHsgcHJlSW5pdGlhbGl6ZTogdHJ1ZSB9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCBjb25uZWN0ID0gY2xpZW50LmNvbm5lY3QoKTtcblx0XHR0cmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0d2hpbGUgKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0Y29uc3QgaW5pdGlhbGl6ZSA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXNbMF0gYXMgSnNvblJwY1JlcXVlc3Q7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSB7IGNvZGU6IC0zMjAwMSwgbWVzc2FnZTogJ0luaXRpYWxpemF0aW9uIGZhaWxlZCcgfTtcblx0XHRjb25zdCByZXF1ZXN0RXJyb3IgPSBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKHJlcXVlc3QsIGV4cGVjdGVkKTtcblx0XHRjb25zdCBjb25uZWN0RXJyb3IgPSBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKGNvbm5lY3QsIGV4cGVjdGVkKTtcblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IGluaXRpYWxpemUuaWQsIGVycm9yOiBleHBlY3RlZCB9KTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtyZXF1ZXN0RXJyb3IsIGNvbm5lY3RFcnJvcl0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgW2luaXRpYWxpemVdKTtcblx0fSk7XG5cblx0dGVzdCgnd2FpdHMgZm9yIGluaXRpYWxpemF0aW9uIGJlZm9yZSByZXR1cm5pbmcgY29tcGxldGlvbiB0cmlnZ2VyIGNoYXJhY3RlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnQoKSk7XG5cdFx0Y29uc3QgeyBjbGllbnQgfSA9IGNyZWF0ZUNsaWVudCh0cmFuc3BvcnQpO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycyA9IGNsaWVudC5nZXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMoKTtcblx0XHRsZXQgc2V0dGxlZCA9IGZhbHNlO1xuXHRcdHZvaWQgY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzLnRoZW4oKCkgPT4gc2V0dGxlZCA9IHRydWUpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXR0bGVkLCBmYWxzZSk7XG5cblx0XHRjb25zdCBjb25uZWN0ID0gY2xpZW50LmNvbm5lY3QoKTtcblx0XHR0cmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0d2hpbGUgKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0Y29uc3QgaW5pdGlhbGl6ZSA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXNbMF0gYXMgSnNvblJwY1JlcXVlc3Q7XG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IGluaXRpYWxpemUuaWQsXG5cdFx0XHRyZXN1bHQ6IHsgcHJvdG9jb2xWZXJzaW9uOiBQUk9UT0NPTF9WRVJTSU9OLCBzZXJ2ZXJTZXE6IDAsIHNuYXBzaG90czogW10sIGNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVyczogWycuJywgJ0AnXSB9LFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgY29ubmVjdDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IGNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycywgWycuJywgJ0AnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgY29tcGxldGlvbiB0cmlnZ2VyIGNoYXJhY3RlcnMgYWZ0ZXIgYW4gaW5jb21wYXRpYmxlIGluaXRpYWxpemF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENsaWVudFByb3RvY29sVHJhbnNwb3J0KCkpO1xuXHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQodHJhbnNwb3J0KTtcblx0XHRjb25zdCBjb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMgPSBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKGNsaWVudC5nZXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMoKSwge1xuXHRcdFx0Y29kZTogQWhwRXJyb3JDb2Rlcy5VbnN1cHBvcnRlZFByb3RvY29sVmVyc2lvbixcblx0XHRcdG1lc3NhZ2U6ICdQcm90b2NvbCB2ZXJzaW9ucyBkbyBub3QgbWF0Y2gnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbm5lY3QgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdHRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHR3aGlsZSAodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRjb25zdCBpbml0aWFsaXplID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSBhcyBKc29uUnBjUmVxdWVzdDtcblx0XHRjb25zdCBjb25uZWN0RXJyb3IgPSBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKGNvbm5lY3QsIHtcblx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuVW5zdXBwb3J0ZWRQcm90b2NvbFZlcnNpb24sXG5cdFx0XHRtZXNzYWdlOiAnUHJvdG9jb2wgdmVyc2lvbnMgZG8gbm90IG1hdGNoJyxcblx0XHR9KTtcblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogaW5pdGlhbGl6ZS5pZCxcblx0XHRcdGVycm9yOiB7IGNvZGU6IEFocEVycm9yQ29kZXMuVW5zdXBwb3J0ZWRQcm90b2NvbFZlcnNpb24sIG1lc3NhZ2U6ICdQcm90b2NvbCB2ZXJzaW9ucyBkbyBub3QgbWF0Y2gnIH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzLCBjb25uZWN0RXJyb3JdKTtcblx0fSk7XG5cblx0dGVzdCgnbWFwcyBwcm90b2NvbC1zdXBwb3J0ZWQgY3JlYXRlIHNlc3Npb24gZm9yayBhbmQgcHJvZ3Jlc3MgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cdFx0YXdhaXQgY29ubmVjdENsaWVudChjbGllbnQsIHRyYW5zcG9ydCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IFVSSS5wYXJzZSgnYWhwLXNlc3Npb246L25ldycpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IFVSSS5wYXJzZSgnYWhwLXNlc3Npb246L3NvdXJjZScpO1xuXHRcdGNvbnN0IGNyZWF0aW9uID0gY2xpZW50LmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdHNlc3Npb24sXG5cdFx0XHRfbWV0YTogeyBtdWx0aVJvb3Q6IHsgd29ya3NwYWNlRmlsZTogJ2ZpbGU6Ly8vZGVtby5jb2RlLXdvcmtzcGFjZScgfSB9LFxuXHRcdFx0Zm9yazogeyBzZXNzaW9uOiBzb3VyY2UsIGNoYXQ6IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNvdXJjZSkpLCB0dXJuSW5kZXg6IDIsIHR1cm5JZDogJ3R1cm4tMicgfSxcblx0XHRcdHByb2dyZXNzVG9rZW46ICdwcm9ncmVzcy10b2tlbicsXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXF1ZXN0ID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5maW5kKChtZXNzYWdlKTogbWVzc2FnZSBpcyBKc29uUnBjUmVxdWVzdCA9PlxuXHRcdFx0aGFzS2V5KG1lc3NhZ2UsIHsgbWV0aG9kOiB0cnVlIH0pICYmIG1lc3NhZ2UubWV0aG9kID09PSAnY3JlYXRlU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVxdWVzdD8ucGFyYW1zLCB7XG5cdFx0XHRjaGFubmVsOiBzZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0XHRfbWV0YTogeyBtdWx0aVJvb3Q6IHsgd29ya3NwYWNlRmlsZTogJ2ZpbGU6Ly8vZGVtby5jb2RlLXdvcmtzcGFjZScgfSB9LFxuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogdW5kZWZpbmVkLFxuXHRcdFx0Zm9yazogeyBzZXNzaW9uOiBzb3VyY2UudG9TdHJpbmcoKSwgdHVybklkOiAndHVybi0yJyB9LFxuXHRcdFx0Y29uZmlnOiB1bmRlZmluZWQsXG5cdFx0XHRhY3RpdmVDbGllbnQ6IHVuZGVmaW5lZCxcblx0XHRcdHByb2dyZXNzVG9rZW46ICdwcm9ncmVzcy10b2tlbicsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWVudC5nZXRJbmZsaWdodFNlc3Npb25DcmVhdGUoc2Vzc2lvbiksIGNyZWF0aW9uKTtcblx0XHRhc3NlcnQub2socmVxdWVzdCk7XG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiByZXF1ZXN0LmlkLCByZXN1bHQ6IG51bGwgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNyZWF0aW9uLCBzZXNzaW9uKTtcblx0fSk7XG5cblx0c3VpdGUoJ2NyZWF0ZUNoYXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgnYWhwLXNlc3Npb246L3Rlc3QnKTtcblx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKCdhaHAtc2Vzc2lvbjovdGVzdC9jaGF0LTEnKTtcblx0XHRjb25zdCBzb3VyY2VVcmkgPSBVUkkucGFyc2UoJ2FocC1zZXNzaW9uOi90ZXN0L2NoYXQtMCcpO1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgYSBmb3JrIHNvdXJjZSB0YWdnZWQgd2l0aCBraW5kIFwiZm9ya1wiJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQuY3JlYXRlQ2hhdChzZXNzaW9uVXJpLCBjaGF0VXJpLCB7IGZvcms6IHsgc291cmNlOiBzb3VyY2VVcmksIHR1cm5JZDogJ3R1cm4tMScgfSB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzWzBdLCB7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRpZDogMSxcblx0XHRcdFx0bWV0aG9kOiAnY3JlYXRlQ2hhdCcsXG5cdFx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRjaGF0OiBjaGF0VXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0c291cmNlOiB7IGtpbmQ6IENoYXRTb3VyY2VLaW5kLkZvcmssIGNoYXQ6IHNvdXJjZVVyaS50b1N0cmluZygpLCB0dXJuSWQ6ICd0dXJuLTEnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCByZXN1bHQ6IG51bGwgfSk7XG5cdFx0XHRhd2FpdCByZXN1bHRQcm9taXNlO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgYSBzaWRlIGNoYXQgKGAvYnR3YCkgc291cmNlIHRhZ2dlZCB3aXRoIGtpbmQgXCJzaWRlQ2hhdFwiJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHsgdGV4dDogJyAgc2VsZWN0ZWQgdGV4dCAgJywgcmVzcG9uc2VQYXJ0SWQ6ICdyZXNwb25zZS1wYXJ0LTEnIH07XG5cdFx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gY2xpZW50LmNyZWF0ZUNoYXQoc2Vzc2lvblVyaSwgY2hhdFVyaSwgeyBzaWRlQ2hhdDogeyBzb3VyY2U6IHNvdXJjZVVyaSwgdHVybklkOiAndHVybi0xJywgc2VsZWN0aW9uIH0gfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSwge1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IDEsXG5cdFx0XHRcdG1ldGhvZDogJ2NyZWF0ZUNoYXQnLFxuXHRcdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0XHRjaGFubmVsOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0Y2hhdDogY2hhdFVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdHNvdXJjZTogeyBraW5kOiBDaGF0U291cmNlS2luZC5TaWRlQ2hhdCwgY2hhdDogc291cmNlVXJpLnRvU3RyaW5nKCksIHR1cm5JZDogJ3R1cm4tMScsIHNlbGVjdGlvbiB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgcmVzdWx0OiBudWxsIH0pO1xuXHRcdFx0YXdhaXQgcmVzdWx0UHJvbWlzZTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIHNvdXJjZSBlbnRpcmVseSB3aGVuIG5laXRoZXIgZm9yayBub3Igc2lkZUNoYXQgaXMgcmVxdWVzdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQuY3JlYXRlQ2hhdChzZXNzaW9uVXJpLCBjaGF0VXJpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzWzBdLCB7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRpZDogMSxcblx0XHRcdFx0bWV0aG9kOiAnY3JlYXRlQ2hhdCcsXG5cdFx0XHRcdHBhcmFtczogeyBjaGFubmVsOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGNoYXQ6IGNoYXRVcmkudG9TdHJpbmcoKSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgcmVzdWx0OiBudWxsIH0pO1xuXHRcdFx0YXdhaXQgcmVzdWx0UHJvbWlzZTtcblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJ3ByZXNlcnZlcyBKU09OLVJQQyBlcnJvciBjb2RlIGFuZCBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCgpO1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQucmVzb3VyY2VSZWFkKFVSSS5maWxlKCcvbWlzc2luZycpKTtcblx0XHRjb25zdCBkYXRhID0geyB1cmk6IFVSSS5maWxlKCcvbWlzc2luZycpLnRvU3RyaW5nKCkgfTtcblxuXHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgZXJyb3I6IHsgY29kZTogQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCwgbWVzc2FnZTogJ01pc3NpbmcgcmVzb3VyY2UnLCBkYXRhIH0gfSk7XG5cblx0XHRhd2FpdCBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKHJlc3VsdFByb21pc2UsIHsgY29kZTogQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCwgbWVzc2FnZTogJ01pc3NpbmcgcmVzb3VyY2UnLCBkYXRhIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCB3YXJuIGZvciBtaXNzaW5nIGZpbGUgcmVzb3VyY2UgcmVhZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBDb3VudGluZ0xvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGNsaWVudC5yZXNvdXJjZVJlYWQoVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc3JjL21pc3NpbmcudHMnKSk7XG5cblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIGVycm9yOiB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQsIG1lc3NhZ2U6ICdDb250ZW50IG5vdCBmb3VuZCcgfSB9KTtcblxuXHRcdGF3YWl0IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IocmVzdWx0UHJvbWlzZSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBtZXNzYWdlOiAnQ29udGVudCBub3QgZm91bmQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2dTZXJ2aWNlLndhcm5Db3VudCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhcm5zIGZvciBub24tZmlsZSByZXNvdXJjZSByZWFkIE5vdEZvdW5kIGVycm9ycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IENvdW50aW5nTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gY2xpZW50LnJlc291cmNlUmVhZChVUkkucGFyc2UoJ3Nlc3Npb24tZGI6L21pc3NpbmcnKSk7XG5cblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIGVycm9yOiB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQsIG1lc3NhZ2U6ICdNaXNzaW5nIHNuYXBzaG90JyB9IH0pO1xuXG5cdFx0YXdhaXQgYXNzZXJ0UmVtb3RlUHJvdG9jb2xFcnJvcihyZXN1bHRQcm9taXNlLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQsIG1lc3NhZ2U6ICdNaXNzaW5nIHNuYXBzaG90JyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9nU2VydmljZS53YXJuQ291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXJucyBmb3Igbm9uLXJlYWQgTm90Rm91bmQgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgQ291bnRpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQucmVzb3VyY2VSZXNvbHZlKHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc3JjL21pc3NpbmcudHMnKS50b1N0cmluZygpIH0pO1xuXG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCBlcnJvcjogeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBtZXNzYWdlOiAnTWlzc2luZyByZXNvdXJjZScgfSB9KTtcblxuXHRcdGF3YWl0IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IocmVzdWx0UHJvbWlzZSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBtZXNzYWdlOiAnTWlzc2luZyByZXNvdXJjZScgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvZ1NlcnZpY2Uud2FybkNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyByZXNwb25zZSBmb3IgdW5rbm93biByZXF1ZXN0IGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoKTtcblxuXHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogOTksIHJlc3VsdDogbnVsbCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgYWxsIHBlbmRpbmcgcmVxdWVzdHMgb24gdHJhbnNwb3J0IGNsb3NlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCgpO1xuXHRcdGNvbnN0IGZpcnN0ID0gY2xpZW50LnJlc291cmNlTGlzdChVUkkuZmlsZSgnL29uZScpKTtcblx0XHRjb25zdCBzZWNvbmQgPSBjbGllbnQucmVzb3VyY2VSZWFkKFVSSS5maWxlKCcvdHdvJykpO1xuXHRcdGxldCBjbG9zZUNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY2xpZW50Lm9uRGlkQ2xvc2UoKCkgPT4gY2xvc2VDb3VudCsrKSk7XG5cdFx0Y29uc3QgZmlyc3RSZWplY3RlZCA9IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IoZmlyc3QsIHsgY29kZTogLTMyMDAwLCBtZXNzYWdlOiAnQ29ubmVjdGlvbiBjbG9zZWQ6IHRlc3QuZXhhbXBsZToxMjM0JyB9KTtcblx0XHRjb25zdCBzZWNvbmRSZWplY3RlZCA9IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3Ioc2Vjb25kLCB7IGNvZGU6IC0zMjAwMCwgbWVzc2FnZTogJ0Nvbm5lY3Rpb24gY2xvc2VkOiB0ZXN0LmV4YW1wbGU6MTIzNCcgfSk7XG5cblx0XHR0cmFuc3BvcnQuZmlyZUNsb3NlKCk7XG5cdFx0dHJhbnNwb3J0LmZpcmVDbG9zZSgpO1xuXG5cdFx0YXdhaXQgZmlyc3RSZWplY3RlZDtcblx0XHRhd2FpdCBzZWNvbmRSZWplY3RlZDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VDb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgcGVuZGluZyByZXF1ZXN0cyBvbiBkaXNwb3NlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQoKTtcblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gY2xpZW50LnJlc291cmNlTGlzdChVUkkuZmlsZSgnL3dvcmtzcGFjZScpKTtcblx0XHRjb25zdCByZWplY3RlZCA9IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IocmVzdWx0UHJvbWlzZSwgeyBjb2RlOiAtMzIwMDAsIG1lc3NhZ2U6ICdDb25uZWN0aW9uIGRpc3Bvc2VkOiB0ZXN0LmV4YW1wbGU6MTIzNCcgfSk7XG5cblx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXG5cdFx0YXdhaXQgcmVqZWN0ZWQ7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgcmVqZWN0aW9uIHdpbnMgd2hlbiB0cmFuc3BvcnQgZW1pdHMgY2xvc2Ugd2hpbGUgZGlzcG9zaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2xvc2VPbkRpc3Bvc2VQcm90b2NvbFRyYW5zcG9ydCgpKTtcblx0XHRjb25zdCB7IGNsaWVudCB9ID0gY3JlYXRlQ2xpZW50KHRyYW5zcG9ydCk7XG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGNsaWVudC5yZXNvdXJjZUxpc3QoVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSk7XG5cdFx0Y29uc3QgcmVqZWN0ZWQgPSBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKHJlc3VsdFByb21pc2UsIHsgY29kZTogLTMyMDAwLCBtZXNzYWdlOiAnQ29ubmVjdGlvbiBkaXNwb3NlZDogdGVzdC5leGFtcGxlOjEyMzQnIH0pO1xuXG5cdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblxuXHRcdGF3YWl0IHJlamVjdGVkO1xuXHR9KTtcblxuXHR0ZXN0KCdsYXRlIHJlc3BvbnNlIGFmdGVyIGNsb3NlIGRvZXMgbm90IGNvbXBsZXRlIHJlamVjdGVkIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGNsaWVudC5yZXNvdXJjZUxpc3QoVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSk7XG5cdFx0Y29uc3QgcmVqZWN0ZWQgPSBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKHJlc3VsdFByb21pc2UsIHsgY29kZTogLTMyMDAwLCBtZXNzYWdlOiAnQ29ubmVjdGlvbiBjbG9zZWQ6IHRlc3QuZXhhbXBsZToxMjM0JyB9KTtcblxuXHRcdHRyYW5zcG9ydC5maXJlQ2xvc2UoKTtcblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIHJlc3VsdDogeyBlbnRyaWVzOiBbXSB9IH0pO1xuXG5cdFx0YXdhaXQgcmVqZWN0ZWQ7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgcmVxdWVzdHMgc3RhcnRlZCBhZnRlciB0cmFuc3BvcnQgY2xvc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cblx0XHR0cmFuc3BvcnQuZmlyZUNsb3NlKCk7XG5cblx0XHRhd2FpdCBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKGNsaWVudC5yZXNvdXJjZUxpc3QoVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSksIHsgY29kZTogLTMyMDAwLCBtZXNzYWdlOiAnQ29ubmVjdGlvbiBjbG9zZWQ6IHRlc3QuZXhhbXBsZToxMjM0JyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIHJlcXVlc3RzIHN0YXJ0ZWQgYWZ0ZXIgZGlzcG9zZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoKTtcblxuXHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cblx0XHRhd2FpdCBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKGNsaWVudC5yZXNvdXJjZUxpc3QoVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSksIHsgY29kZTogLTMyMDAwLCBtZXNzYWdlOiAnQ29ubmVjdGlvbiBkaXNwb3NlZDogdGVzdC5leGFtcGxlOjEyMzQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpdmVuZXNzIHNlbmRzIGEgcGluZyB3aGVuIGlkbGUgYW5kIGZvcmNlLWNsb3NlcyBhZnRlciB0aGUgcGluZyBhZ2VzIG91dCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG93TG9hZCA9IHsgaGFzSGlnaExvYWQ6ICgpID0+IGZhbHNlIH07XG5cdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCB1bmRlZmluZWQsIGxvd0xvYWQpO1xuXHRcdFx0bGV0IGNsb3NlQ291bnQgPSAwO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNsaWVudC5vbkRpZENsb3NlKCgpID0+IGNsb3NlQ291bnQrKykpO1xuXG5cdFx0XHQvLyBGaXJzdCBpZGxlIHRpY2sgKHQ9NXMpIHNlbmRzIGEgcGluZzsgdGhhdCBwaW5nIHRoZW4gYWdlcyBvdXRcblx0XHRcdC8vIG92ZXIgdGhlIG5leHQgfjIwcyBhbmQgdHJpZ2dlcnMgYSBjbG9zZSBhdCB+dD0yNXMuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDMwXzAwMCk7XG5cblx0XHRcdGNvbnN0IHBpbmdzID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5maWx0ZXIoaXNQaW5nUmVxdWVzdCk7XG5cdFx0XHRhc3NlcnQub2socGluZ3MubGVuZ3RoID49IDEsIGBleHBlY3RlZCBhdCBsZWFzdCAxIHBpbmcsIGdvdCAke3BpbmdzLmxlbmd0aH1gKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9zZUNvdW50LCAxKTtcblx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpdmVuZXNzIGtlZXBzIHRoZSBjb25uZWN0aW9uIG9wZW4gd2hpbGUgcGluZ3MgYXJlIGFuc3dlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb3dMb2FkID0geyBoYXNIaWdoTG9hZDogKCkgPT4gZmFsc2UgfTtcblx0XHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgbG93TG9hZCk7XG5cdFx0XHRsZXQgY2xvc2VDb3VudCA9IDA7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY2xpZW50Lm9uRGlkQ2xvc2UoKCkgPT4gY2xvc2VDb3VudCsrKSk7XG5cblx0XHRcdC8vIEF1dG8tcmVzcG9uZCB0byBldmVyeSBvdXRnb2luZyBwaW5nLlxuXHRcdFx0bGV0IGFuc3dlcmVkID0gMDtcblx0XHRcdGNvbnN0IGRpc3Bvc2UgPSBtYWluV2luZG93LnNldEludGVydmFsKCgpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBtc2cgb2YgdHJhbnNwb3J0LnNlbnRNZXNzYWdlcykge1xuXHRcdFx0XHRcdGlmIChpc1BpbmdSZXF1ZXN0KG1zZykgJiYgbXNnLmlkID4gYW5zd2VyZWQpIHtcblx0XHRcdFx0XHRcdGFuc3dlcmVkID0gbXNnLmlkO1xuXHRcdFx0XHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiBtc2cuaWQsIHJlc3VsdDogbnVsbCB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sIDFfMDAwKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCg2MF8wMDApO1xuXHRcdFx0bWFpbldpbmRvdy5jbGVhckludGVydmFsKGRpc3Bvc2UpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VDb3VudCwgMCk7XG5cdFx0XHRhc3NlcnQub2soYW5zd2VyZWQgPj0gNCwgYGV4cGVjdGVkIHNldmVyYWwgcGluZ3MgdG8gaGF2ZSBiZWVuIGFuc3dlcmVkLCBnb3QgJHthbnN3ZXJlZH1gKTtcblx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpdmVuZXNzIGlzIHN1cHByZXNzZWQgd2hpbGUgbG9jYWwgbG9hZCBpcyBoaWdoJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoaWdoTG9hZCA9IHsgaGFzSGlnaExvYWQ6ICgpID0+IHRydWUgfTtcblx0XHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCB1bmRlZmluZWQsIGhpZ2hMb2FkKTtcblx0XHRcdGxldCBjbG9zZUNvdW50ID0gMDtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChjbGllbnQub25EaWRDbG9zZSgoKSA9PiBjbG9zZUNvdW50KyspKTtcblxuXHRcdFx0Ly8gNjBzIG9mIHNpbGVuY2UgXHUyMDE0IHdvdWxkIG5vcm1hbGx5IHRyaWdnZXIgdGhlIHRpbWVvdXQgXHUyMDE0IGJ1dFxuXHRcdFx0Ly8gaGlnaCBsb2NhbCBsb2FkIG1lYW5zIHdlIGF0dHJpYnV0ZSB0aGUgc2lsZW5jZSB0byBvdXJzZWx2ZXNcblx0XHRcdC8vIGFuZCBzdGF5IHF1aWV0LlxuXHRcdFx0YXdhaXQgdGltZW91dCg2MF8wMDApO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VDb3VudCwgMCk7XG5cdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXZlbmVzcyB3YXRjaGRvZyBkb2VzIG5vdCB0aW1lIG91dCBsb2NhbCBjaGlsZC1wcm9jZXNzIGNvbm5lY3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNsb2NrID0gc2lub24udXNlRmFrZVRpbWVycygpO1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFByb3RvY29sVHJhbnNwb3J0KEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kLkxvY2FsKSk7XG5cdFx0Y29uc3QgeyBjbGllbnQgfSA9IGNyZWF0ZUNsaWVudCh0cmFuc3BvcnQpO1xuXHRcdGxldCBjbG9zZUNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY2xpZW50Lm9uRGlkQ2xvc2UoKCkgPT4gY2xvc2VDb3VudCsrKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNsb2NrLnRpY2tBc3luYyg2MF8wMDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c2VudFBpbmc6IHRyYW5zcG9ydC5zZW50TWVzc2FnZXMuc29tZShpc1BpbmdSZXF1ZXN0KSxcblx0XHRcdFx0Y2xvc2VDb3VudCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2VudFBpbmc6IHRydWUsXG5cdFx0XHRcdGNsb3NlQ291bnQ6IDAsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdGNsb2NrLnJlc3RvcmUoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2xpdmVuZXNzIHN0b3BzIGFmdGVyIHRoZSBjb25uZWN0aW9uIGlzIGNsb3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG93TG9hZCA9IHsgaGFzSGlnaExvYWQ6ICgpID0+IGZhbHNlIH07XG5cdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCB1bmRlZmluZWQsIGxvd0xvYWQpO1xuXHRcdFx0bGV0IGNsb3NlQ291bnQgPSAwO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNsaWVudC5vbkRpZENsb3NlKCgpID0+IGNsb3NlQ291bnQrKykpO1xuXG5cdFx0XHQvLyBXYWl0IGZvciB0aGUgZmlyc3QgZm9yY2UtY2xvc2UuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDMwXzAwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VDb3VudCwgMSwgJ3Nob3VsZCBoYXZlIGZvcmNlLWNsb3NlZCBvbmNlJyk7XG5cblx0XHRcdGNvbnN0IHBpbmdzQXRDbG9zZSA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXMuZmlsdGVyKGlzUGluZ1JlcXVlc3QpLmxlbmd0aDtcblxuXHRcdFx0Ly8gV2FpdCBtdWNoIGxvbmdlcjsgbm8gZnVydGhlciBwaW5ncywgbm8gZnVydGhlciBjbG9zZXMuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDYwXzAwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VDb3VudCwgMSwgJ3Nob3VsZCBub3QgZmlyZSBhZ2FpbiBhZnRlciBjbG9zZScpO1xuXHRcdFx0Y29uc3QgcGluZ3NMYXRlciA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXMuZmlsdGVyKGlzUGluZ1JlcXVlc3QpLmxlbmd0aDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaW5nc0xhdGVyLCBwaW5nc0F0Q2xvc2UsICdubyBmdXJ0aGVyIHBpbmdzIHNob3VsZCBiZSBzZW50IGFmdGVyIGNsb3NlJyk7XG5cdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmJvdW5kIG1lc3NhZ2VzIGFyZSBkcm9wcGVkIGFmdGVyIGNsb3NlJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoKTtcblx0XHRcdGxldCBhY3Rpb25Db3VudCA9IDA7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY2xpZW50Lm9uRGlkQWN0aW9uKCgpID0+IGFjdGlvbkNvdW50KyspKTtcblxuXHRcdFx0Ly8gSXNzdWUgYSByZXF1ZXN0LCB0aGVuIGZvcmNlIGNsb3NlIHZpYSB0aGUgd2F0Y2hkb2cgdGltZW91dC5cblx0XHRcdGNvbnN0IHBlbmRpbmcgPSBjbGllbnQucmVzb3VyY2VMaXN0KFVSSS5maWxlKCcvd29ya3NwYWNlJykpO1xuXHRcdFx0Y29uc3QgcmVqZWN0ZWQgPSBwZW5kaW5nLmNhdGNoKGVyciA9PiBlcnIpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgzMF8wMDApO1xuXHRcdFx0Y29uc3QgZXJyID0gYXdhaXQgcmVqZWN0ZWQ7XG5cdFx0XHRhc3NlcnQub2soZXJyIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvcik7XG5cblx0XHRcdC8vIExhdGUgcmVzcG9uc2UgZm9yIHRoZSBzYW1lIHJlcXVlc3QgaWQgXHUyMDE0IHRoZSBzaGFyZWRcblx0XHRcdC8vIFNTSFJlbGF5VHJhbnNwb3J0IGZlZWRzIGJvdGggb2xkIGFuZCBuZXcgY2xpZW50cyBmb3IgdGhlXG5cdFx0XHQvLyBzYW1lIGNvbm5lY3Rpb25JZCwgc28gdGhpcyBjYW4gaGFwcGVuIGluIHByb2R1Y3Rpb24uIFRoZVxuXHRcdFx0Ly8gcGVuZGluZyByZXF1ZXN0IHdhcyBhbHJlYWR5IHJlamVjdGVkOyBpZiBfaGFuZGxlTWVzc2FnZVxuXHRcdFx0Ly8gcHJvY2Vzc2VkIHRoZSByZXNwb25zZSBpdCB3b3VsZCBsb2cgYSBcInVua25vd24gcmVxdWVzdCBpZFwiXG5cdFx0XHQvLyB3YXJuaW5nIGF0IGJlc3QsIG9yIHNldHRsZSBhIHJlcXVlc3QgdGhlIGNhbGxlciBubyBsb25nZXJcblx0XHRcdC8vIG93bnMgYXQgd29yc3QuIEVpdGhlciB3YXksIGFmdGVyIGNsb3NlIGl0IG11c3QgYmUgYSBuby1vcC5cblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgcmVzdWx0OiB7IGVudHJpZXM6IFtdIH0gfSk7XG5cblx0XHRcdC8vIExhdGUgbm90aWZpY2F0aW9uIFx1MjAxNCBtdXN0IG5vdCBmYW4gb3V0IGFzIGFuIGFjdGlvbiBldmVudC5cblx0XHRcdGNvbnN0IGxhdGVBY3Rpb246IFNlc3Npb25BY3RpdmVDbGllbnRSZW1vdmVkQWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRSZW1vdmVkLFxuXHRcdFx0XHRjbGllbnRJZDogJ2MxJyxcblx0XHRcdH07XG5cdFx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0bWV0aG9kOiAnYWN0aW9uJyxcblx0XHRcdFx0cGFyYW1zOiB7IGNoYW5uZWw6ICdhaHAtc2Vzc2lvbjovdGVzdCcsIGFjdGlvbjogbGF0ZUFjdGlvbiwgc2VydmVyU2VxOiAxLCBvcmlnaW46IHVuZGVmaW5lZCB9XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbkNvdW50LCAwLCAnbGF0ZSBhY3Rpb24gbm90aWZpY2F0aW9ucyBtdXN0IGJlIGlnbm9yZWQgYWZ0ZXIgY2xvc2UnKTtcblx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgY29ubmVjdCB3aGVuIHRyYW5zcG9ydCBjbG9zZXMgYmVmb3JlIGNvbm5lY3QgY29tcGxldGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENsaWVudFByb3RvY29sVHJhbnNwb3J0KCkpO1xuXHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQodHJhbnNwb3J0KTtcblx0XHRjb25zdCByZWplY3RlZCA9IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IoY2xpZW50LmNvbm5lY3QoKSwgeyBjb2RlOiAtMzIwMDAsIG1lc3NhZ2U6ICdDb25uZWN0aW9uIGNsb3NlZDogdGVzdC5leGFtcGxlOjEyMzQnIH0pO1xuXG5cdFx0dHJhbnNwb3J0LmZpcmVDbG9zZSgpO1xuXHRcdHRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblxuXHRcdGF3YWl0IHJlamVjdGVkO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgY29ubmVjdCB3aGVuIGRpc3Bvc2VkIGJlZm9yZSB0cmFuc3BvcnQgY29ubmVjdCBjb21wbGV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnQoKSk7XG5cdFx0Y29uc3QgeyBjbGllbnQgfSA9IGNyZWF0ZUNsaWVudCh0cmFuc3BvcnQpO1xuXHRcdGNvbnN0IHJlamVjdGVkID0gYXNzZXJ0UmVtb3RlUHJvdG9jb2xFcnJvcihjbGllbnQuY29ubmVjdCgpLCB7IGNvZGU6IC0zMjAwMCwgbWVzc2FnZTogJ0Nvbm5lY3Rpb24gZGlzcG9zZWQ6IHRlc3QuZXhhbXBsZToxMjM0JyB9KTtcblxuXHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cblx0XHRhd2FpdCByZWplY3RlZDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplIGhhbmRzaGFrZSBpbmNsdWRlcyBwcm90b2NvbCB2ZXJzaW9uIGFuZCBjbGllbnQgaW5mbycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RDbGllbnRQcm90b2NvbFRyYW5zcG9ydChBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZC5EZXZUdW5uZWwpKTtcblx0XHRjb25zdCBjbGllbnRJbmZvID0gYWdlbnRzV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbztcblx0XHRjb25zdCB7IGNsaWVudCB9ID0gY3JlYXRlQ2xpZW50KHRyYW5zcG9ydCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAncmVuZGVyZXItY2xpZW50LWlkJywgY2xpZW50SW5mbyk7XG5cdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXG5cdFx0dHJhbnNwb3J0LmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdC8vIGBjb25uZWN0KClgIGNoYWlucyB0aHJvdWdoIHNldmVyYWwgYXdhaXRzIGJlZm9yZSBwb3N0aW5nIHRoZVxuXHRcdC8vIGluaXRpYWxpemUgcmVxdWVzdCBcdTIwMTQgeWllbGQgdW50aWwgaXQgc2hvd3MgdXAuXG5cdFx0d2hpbGUgKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZW50ID0gdHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSBhcyBKc29uUnBjUmVxdWVzdDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VudC5tZXRob2QsICdpbml0aWFsaXplJyk7XG5cdFx0Y29uc3QgcGFyYW1zID0gc2VudC5wYXJhbXMgYXMgeyBwcm90b2NvbFZlcnNpb25zOiByZWFkb25seSBzdHJpbmdbXTsgY2xpZW50SWQ6IHN0cmluZzsgY2xpZW50SW5mbz86IEltcGxlbWVudGF0aW9uOyBfbWV0YT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBwYXJhbXMucHJvdG9jb2xWZXJzaW9ucyxcblx0XHRcdGNsaWVudElkOiBwYXJhbXMuY2xpZW50SWQsXG5cdFx0XHRjbGllbnRJbmZvOiBwYXJhbXMuY2xpZW50SW5mbyxcblx0XHRcdF9tZXRhOiBwYXJhbXMuX21ldGEsXG5cdFx0fSwge1xuXHRcdFx0Ly8gRXZlcnkgbmVnb3RpYWJsZSB2ZXJzaW9uIGlzIG9mZmVyZWQgc28gYW4gb2xkZXIgaG9zdCBjYW4gbmVnb3RpYXRlIGRvd24sXG5cdFx0XHQvLyBuZXdlc3QgZmlyc3Qgc28gYSBjdXJyZW50IGhvc3Qgc3RpbGwgcGlja3MgaXQuXG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbLi4uU1VQUE9SVEVEX1BST1RPQ09MX1ZFUlNJT05TXSxcblx0XHRcdGNsaWVudElkOiAncmVuZGVyZXItY2xpZW50LWlkJyxcblx0XHRcdGNsaWVudEluZm8sXG5cdFx0XHRfbWV0YTogeyAndnNjb2RlLmNsaWVudENvbm5lY3Rpb25LaW5kJzogJ2Rldl90dW5uZWwnIH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcmFtcy5wcm90b2NvbFZlcnNpb25zWzBdLCBQUk9UT0NPTF9WRVJTSU9OKTtcblxuXHRcdC8vIFJlcGx5IHdpdGggYSBzdWNjZXNzZnVsIGhhbmRzaGFrZSBzbyBgY29ubmVjdCgpYCByZXNvbHZlcyBhbmQgdGhlXG5cdFx0Ly8gdGVzdCBjYW4gZmluaXNoIGNsZWFubHkuXG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IHNlbnQuaWQsXG5cdFx0XHRyZXN1bHQ6IHsgcHJvdG9jb2xWZXJzaW9uOiBQUk9UT0NPTF9WRVJTSU9OLCBzZXJ2ZXJTZXE6IDAsIHNuYXBzaG90czogW10gfSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb25uZWN0UHJvbWlzZTtcblx0XHRjb25zdCB0ZWxlbWV0cnlMZXZlbCA9IGZpbmRSb290Q29uZmlnTm90aWZpY2F0aW9uKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMsIEFnZW50SG9zdFRlbGVtZXRyeUxldmVsQ29uZmlnS2V5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeUxldmVsLCB7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdG1ldGhvZDogJ2Rpc3BhdGNoQWN0aW9uJyxcblx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0Y2xpZW50U2VxOiAwLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRcdGNvbmZpZzogeyBbQWdlbnRIb3N0VGVsZW1ldHJ5TGV2ZWxDb25maWdLZXldOiB0ZWxlbWV0cnlMZXZlbFRvQWdlbnRIb3N0Q29uZmlnVmFsdWUoVGVsZW1ldHJ5TGV2ZWwuVVNBR0UpIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyA9IGZpbmRSb290Q29uZmlnTm90aWZpY2F0aW9uKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMsIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZ0tleSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMsIHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0bWV0aG9kOiAnZGlzcGF0Y2hBY3Rpb24nLFxuXHRcdFx0cGFyYW1zOiB7XG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRjbGllbnRTZXE6IDAsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXldOiB7fSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZm9yd2FyZHMgZXZlcnkgc2V0dGluZyBkZWNsYXJpbmcgYGFnZW50SG9zdGAgb24gY29ubmVjdCBhbmQgd2hlbiBvbmUgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W1NZTkNfU0VUVElOR19BXTogdHJ1ZSxcblx0XHRcdFtTWU5DX1NFVFRJTkdfQl06IGZhbHNlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudChkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RQcm90b2NvbFRyYW5zcG9ydCgpKSwgY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoKSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgY29ubmVjdENsaWVudChjbGllbnQsIHRyYW5zcG9ydCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGE6IGZpbmRSb290Q29uZmlnVmFsdWUodHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgU1lOQ19DT05GSUdfS0VZX0EpLFxuXHRcdFx0YjogZmluZFJvb3RDb25maWdWYWx1ZSh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLCBTWU5DX0NPTkZJR19LRVlfQiksXG5cdFx0fSwge1xuXHRcdFx0YTogdHJ1ZSxcblx0XHRcdGI6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0dHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5sZW5ndGggPSAwO1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFNZTkNfU0VUVElOR19BLCBmYWxzZSk7XG5cdFx0ZmlyZUNvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvblNlcnZpY2UsIFNZTkNfU0VUVElOR19BKTtcblxuXHRcdC8vIE9ubHkgdGhlIGFmZmVjdGVkIHNldHRpbmcgaXMgcmUtZm9yd2FyZGVkLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um9vdENvbmZpZyhmaW5kTGFzdFJvb3RDb25maWdOb3RpZmljYXRpb24odHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgU1lOQ19DT05GSUdfS0VZX0EpKSwge1xuXHRcdFx0W1NZTkNfQ09ORklHX0tFWV9BXTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIHRoZSByZXBvLWluZm8gdGVsZW1ldHJ5IGRlYnVnIHN3aXRjaCBvbiBjb25uZWN0IGFuZCBjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgW0RJU0FCTEVfUkVQT19JTkZPX1RFTEVNRVRSWV9TRVRUSU5HX0lEXTogdHJ1ZSB9KTtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UHJvdG9jb2xUcmFuc3BvcnQoKSksIGNyZWF0ZVBlcm1pc3Npb25TZXJ2aWNlKCksIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGNvbm5lY3RDbGllbnQoY2xpZW50LCB0cmFuc3BvcnQpO1xuXG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBmaW5kUm9vdENvbmZpZ05vdGlmaWNhdGlvbih0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLCBBZ2VudEhvc3REaXNhYmxlUmVwb0luZm9UZWxlbWV0cnlDb25maWdLZXkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um9vdENvbmZpZyhkaXNhYmxlZCksIHsgW0FnZW50SG9zdERpc2FibGVSZXBvSW5mb1RlbGVtZXRyeUNvbmZpZ0tleV06IHRydWUgfSk7XG5cblx0XHR0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCA9IDA7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oRElTQUJMRV9SRVBPX0lORk9fVEVMRU1FVFJZX1NFVFRJTkdfSUQsIGZhbHNlKTtcblx0XHRmaXJlQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uU2VydmljZSwgRElTQUJMRV9SRVBPX0lORk9fVEVMRU1FVFJZX1NFVFRJTkdfSUQpO1xuXG5cdFx0Y29uc3QgZW5hYmxlZCA9IGZpbmRMYXN0Um9vdENvbmZpZ05vdGlmaWNhdGlvbih0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLCBBZ2VudEhvc3REaXNhYmxlUmVwb0luZm9UZWxlbWV0cnlDb25maWdLZXkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um9vdENvbmZpZyhlbmFibGVkKSwgeyBbQWdlbnRIb3N0RGlzYWJsZVJlcG9JbmZvVGVsZW1ldHJ5Q29uZmlnS2V5XTogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIGFuZCBjbGVhcnMgbGVnYWN5IG1hbmFnZWQgcGVybWlzc2lvbnMgZm9yIHRoZSBsb2NhbCBob3N0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IE1hbmFnZWRQZXJtaXNzaW9uc0NvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtBZ2VudEhvc3RNYXBMZWdhY3lTZXR0aW5nc1RvTWFuYWdlZFNldHRpbmdzU2V0dGluZ0lkXTogdHJ1ZSxcblx0XHRcdFtURVJNSU5BTF9BVVRPX0FQUFJPVkVfRU5BQkxFRF9TRVRUSU5HX0lEXTogZmFsc2UsXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50Rm9ySWRlbnRpdHkoXG5cdFx0XHRMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UHJvdG9jb2xUcmFuc3BvcnQoKSksXG5cdFx0XHRjcmVhdGVQZXJtaXNzaW9uU2VydmljZSgpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHQpO1xuXG5cdFx0YXdhaXQgY29ubmVjdENsaWVudChjbGllbnQsIHRyYW5zcG9ydCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbmRMYXN0TWFuYWdlZFNldHRpbmdzTm90aWZpY2F0aW9uKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMpLCB7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdG1ldGhvZDogJ3NldENsaWVudE1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zJyxcblx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRwZXJtaXNzaW9uczoge1xuXHRcdFx0XHRcdGRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGU6ICdkaXNhYmxlJyxcblx0XHRcdFx0XHRhc2s6IFsnU2hlbGwnXSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCA9IDA7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UuY2xlYXJHbG9iYWxBdXRvQXBwcm92ZVBvbGljeSgpO1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEdMT0JBTF9BVVRPX0FQUFJPVkVfU0VUVElOR19JRCwgdHJ1ZSk7XG5cdFx0ZmlyZUNvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvblNlcnZpY2UsIEdMT0JBTF9BVVRPX0FQUFJPVkVfU0VUVElOR19JRCk7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVEVSTUlOQUxfQVVUT19BUFBST1ZFX0VOQUJMRURfU0VUVElOR19JRCwgdHJ1ZSk7XG5cdFx0ZmlyZUNvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvblNlcnZpY2UsIFRFUk1JTkFMX0FVVE9fQVBQUk9WRV9FTkFCTEVEX1NFVFRJTkdfSUQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaW5kTGFzdE1hbmFnZWRTZXR0aW5nc05vdGlmaWNhdGlvbih0cmFuc3BvcnQuc2VudE1lc3NhZ2VzKSwge1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRtZXRob2Q6ICdzZXRDbGllbnRNYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9ucycsXG5cdFx0XHRwYXJhbXM6IHsgcGVybWlzc2lvbnM6IHt9IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIHRlcm1pbmFsIGF1dG8tYXBwcm92ZSBydWxlcyBvbiBjb25uZWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbVEVSTUlOQUxfQVVUT19BUFBST1ZFX1NFVFRJTkdfSURdOiB7XG5cdFx0XHRcdGVjaG86IG51bGwsXG5cdFx0XHRcdHB5dGhvbjogdHJ1ZSxcblx0XHRcdFx0Jy9ebnBtIHJ1biBidWlsZCQvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudChkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RQcm90b2NvbFRyYW5zcG9ydCgpKSwgY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoKSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgY29ubmVjdENsaWVudChjbGllbnQsIHRyYW5zcG9ydCk7XG5cblx0XHRjb25zdCB0ZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMgPSBmaW5kUm9vdENvbmZpZ05vdGlmaWNhdGlvbih0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um9vdENvbmZpZyh0ZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMpLCB7XG5cdFx0XHRbQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnS2V5XToge1xuXHRcdFx0XHRlY2hvOiBudWxsLFxuXHRcdFx0XHRweXRob246IHRydWUsXG5cdFx0XHRcdCcvXm5wbSBydW4gYnVpbGQkLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVkaXNwYXRjaGVzIHRlcm1pbmFsIGF1dG8tYXBwcm92ZSBydWxlcyB3aGVuIHRoZSBydWxlIHNldHRpbmcgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UHJvdG9jb2xUcmFuc3BvcnQoKSksIGNyZWF0ZVBlcm1pc3Npb25TZXJ2aWNlKCksIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRhd2FpdCBjb25uZWN0Q2xpZW50KGNsaWVudCwgdHJhbnNwb3J0KTtcblx0XHR0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmxlbmd0aCA9IDA7XG5cblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihURVJNSU5BTF9BVVRPX0FQUFJPVkVfU0VUVElOR19JRCwgeyBweXRob246IHRydWUgfSk7XG5cdFx0ZmlyZUNvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvblNlcnZpY2UsIFRFUk1JTkFMX0FVVE9fQVBQUk9WRV9TRVRUSU5HX0lEKTtcblxuXHRcdGNvbnN0IHRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyA9IGZpbmRMYXN0Um9vdENvbmZpZ05vdGlmaWNhdGlvbih0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um9vdENvbmZpZyh0ZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMpLCB7XG5cdFx0XHRbQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnS2V5XTogeyBweXRob246IHRydWUgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVkaXNwYXRjaGVzIHRlcm1pbmFsIGF1dG8tYXBwcm92ZSBydWxlcyB3aGVuIGlnbm9yZWQgZGVmYXVsdHMgY2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlcm1pbmFsQXV0b0FwcHJvdmVDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbVEVSTUlOQUxfQVVUT19BUFBST1ZFX1NFVFRJTkdfSURdOiB7IGVjaG86IHRydWUsIHB5dGhvbjogdHJ1ZSB9LFxuXHRcdH0sIHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6IHsgZWNobzogdHJ1ZSB9IH0sXG5cdFx0XHR1c2VyOiB7IHZhbHVlOiB7IHB5dGhvbjogdHJ1ZSB9IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFByb3RvY29sVHJhbnNwb3J0KCkpLCBjcmVhdGVQZXJtaXNzaW9uU2VydmljZSgpLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0YXdhaXQgY29ubmVjdENsaWVudChjbGllbnQsIHRyYW5zcG9ydCk7XG5cdFx0dHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5sZW5ndGggPSAwO1xuXG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVEVSTUlOQUxfSUdOT1JFX0RFRkFVTFRfQVVUT19BUFBST1ZFX1JVTEVTX1NFVFRJTkdfSUQsIHRydWUpO1xuXHRcdGZpcmVDb25maWd1cmF0aW9uQ2hhbmdlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBURVJNSU5BTF9JR05PUkVfREVGQVVMVF9BVVRPX0FQUFJPVkVfUlVMRVNfU0VUVElOR19JRCk7XG5cblx0XHRjb25zdCB0ZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMgPSBmaW5kTGFzdFJvb3RDb25maWdOb3RpZmljYXRpb24odHJhbnNwb3J0LnNlbnRNZXNzYWdlcywgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnS2V5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJvb3RDb25maWcodGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzKSwge1xuXHRcdFx0W0FnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZ0tleV06IHsgcHl0aG9uOiB0cnVlIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgbm9ybWFsIHRyYWZmaWMgYnV0IHJldGFpbnMgdGhlIHRyYW5zcG9ydCBmb3IgYW4gaW5jb21wYXRpYmxlIHByb3RvY29sIHVwZ3JhZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnQoKSk7XG5cdFx0Y29uc3QgeyBjbGllbnQgfSA9IGNyZWF0ZUNsaWVudCh0cmFuc3BvcnQpO1xuXHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gY2xpZW50LmNvbm5lY3QoKTtcblxuXHRcdHRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHR3aGlsZSAodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbnQgPSB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzWzBdIGFzIEpzb25ScGNSZXF1ZXN0O1xuXHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiBzZW50LmlkLFxuXHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0Y29kZTogQWhwRXJyb3JDb2Rlcy5VbnN1cHBvcnRlZFByb3RvY29sVmVyc2lvbixcblx0XHRcdFx0bWVzc2FnZTogJ0NsaWVudCBvZmZlcmVkIHByb3RvY29sIHZlcnNpb25zIFswLjEuMF0sIGJ1dCB0aGlzIHNlcnZlciBvbmx5IHN1cHBvcnRzIDAuMi4wLicsXG5cdFx0XHRcdGRhdGE6IHsgc3VwcG9ydGVkVmVyc2lvbnM6IFsnMC4yLjAnXSwgX21ldGE6IHsgdnNjb2RlVXBncmFkZU1ldGhvZDogJ192c2NvZGVVcGdyYWRlJyB9IH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgYXNzZXJ0UmVtb3RlUHJvdG9jb2xFcnJvcihjb25uZWN0UHJvbWlzZSwge1xuXHRcdFx0Y29kZTogQWhwRXJyb3JDb2Rlcy5VbnN1cHBvcnRlZFByb3RvY29sVmVyc2lvbixcblx0XHRcdG1lc3NhZ2U6ICdDbGllbnQgb2ZmZXJlZCBwcm90b2NvbCB2ZXJzaW9ucyBbMC4xLjBdLCBidXQgdGhpcyBzZXJ2ZXIgb25seSBzdXBwb3J0cyAwLjIuMC4nLFxuXHRcdFx0ZGF0YTogeyBzdXBwb3J0ZWRWZXJzaW9uczogWycwLjIuMCddLCBfbWV0YTogeyB2c2NvZGVVcGdyYWRlTWV0aG9kOiAnX3ZzY29kZVVwZ3JhZGUnIH0gfSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xpZW50LmNvbm5lY3Rpb25TdGF0ZSwgQWdlbnRIb3N0Q2xpZW50U3RhdGUuSW5jb21wYXRpYmxlKTtcblx0XHRhd2FpdCBhc3NlcnRSZW1vdGVQcm90b2NvbEVycm9yKGNsaWVudC5yZXNvdXJjZUxpc3QoVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSksIHtcblx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuVW5zdXBwb3J0ZWRQcm90b2NvbFZlcnNpb24sXG5cdFx0XHRtZXNzYWdlOiAnQ2xpZW50IG9mZmVyZWQgcHJvdG9jb2wgdmVyc2lvbnMgWzAuMS4wXSwgYnV0IHRoaXMgc2VydmVyIG9ubHkgc3VwcG9ydHMgMC4yLjAuJyxcblx0XHRcdGRhdGE6IHsgc3VwcG9ydGVkVmVyc2lvbnM6IFsnMC4yLjAnXSwgX21ldGE6IHsgdnNjb2RlVXBncmFkZU1ldGhvZDogJ192c2NvZGVVcGdyYWRlJyB9IH0sXG5cdFx0fSk7XG5cdFx0Y2xpZW50LmRpc3BhdGNoKFJPT1RfU1RBVEVfVVJJLCB7IHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsIGNvbmZpZzogeyBkcm9wcGVkOiB0cnVlIH0gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMubGVuZ3RoLCAxKTtcblxuXHRcdGNvbnN0IHVwZ3JhZGUgPSBjbGllbnQudHJpZ2dlclZzY29kZVVwZ3JhZGUoJ192c2NvZGVVcGdyYWRlJyk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHRyYW5zcG9ydC5zZW50TWVzc2FnZXNbMV0gYXMgSnNvblJwY1JlcXVlc3Q7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXF1ZXN0LCB7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiAyLFxuXHRcdFx0bWV0aG9kOiAnX3ZzY29kZVVwZ3JhZGUnLFxuXHRcdFx0cGFyYW1zOiB7fSxcblx0XHR9KTtcblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IHJlcXVlc3QuaWQsIHJlc3VsdDogeyBvazogdHJ1ZSwgdXBncmFkZVN0YXJ0ZWQ6IHRydWUgfSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHVwZ3JhZGUsIHsgb2s6IHRydWUsIHVwZ3JhZGVTdGFydGVkOiB0cnVlIH0pO1xuXHRcdHRyYW5zcG9ydC5maXJlQ2xvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xpZW50LmNvbm5lY3Rpb25TdGF0ZSwgQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZHMgc2h1dGRvd24gYXMgYSBKU09OLVJQQyByZXF1ZXN0IHNoYXBlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCgpO1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQuc2h1dGRvd24oKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlc1swXSwge1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogMSxcblx0XHRcdG1ldGhvZDogJ3NodXRkb3duJyxcblx0XHRcdHBhcmFtczogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCByZXN1bHQ6IG51bGwgfSk7XG5cdFx0YXdhaXQgcmVzdWx0UHJvbWlzZTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBzaHV0ZG93biB3aXRoIHN0cnVjdHVyZWQgSlNPTi1SUEMgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGNsaWVudC5zaHV0ZG93bigpO1xuXG5cdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCBlcnJvcjogeyBjb2RlOiBBaHBFcnJvckNvZGVzLlR1cm5JblByb2dyZXNzLCBtZXNzYWdlOiAnVHVybiBpbiBwcm9ncmVzcycgfSB9KTtcblxuXHRcdGF3YWl0IGFzc2VydFJlbW90ZVByb3RvY29sRXJyb3IocmVzdWx0UHJvbWlzZSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLlR1cm5JblByb2dyZXNzLCBtZXNzYWdlOiAnVHVybiBpbiBwcm9ncmVzcycgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Bpbmcgc2VuZHMgYSBKU09OLVJQQyByZXF1ZXN0IGFuZCByZXNvbHZlcyBvbiByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoKTtcblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gY2xpZW50LnBpbmcoKTtcblxuXHRcdGNvbnN0IHNlbnQgPSB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzWzBdIGFzIEpzb25ScGNSZXF1ZXN0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZW50Lm1ldGhvZCwgJ3BpbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VudC5pZCwgMSk7XG5cblx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIHJlc3VsdDogbnVsbCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZXN1bHRQcm9taXNlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwaW5nIHJlamVjdHMgd2l0aCBQcm90b2NvbEVycm9yIHdoZW4gdGhlIGNvbm5lY3Rpb24gY2xvc2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCgpO1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBjbGllbnQucGluZygpO1xuXHRcdGNvbnN0IHJlamVjdGVkID0gYXNzZXJ0UmVtb3RlUHJvdG9jb2xFcnJvcihyZXN1bHRQcm9taXNlLCB7IGNvZGU6IC0zMjAwMCwgbWVzc2FnZTogJ0Nvbm5lY3Rpb24gY2xvc2VkOiB0ZXN0LmV4YW1wbGU6MTIzNCcgfSk7XG5cdFx0dHJhbnNwb3J0LmZpcmVDbG9zZSgpO1xuXHRcdGF3YWl0IHJlamVjdGVkO1xuXHR9KTtcblxuXHRzdWl0ZSgncmV2ZXJzZSBwZXJtaXNzaW9uIGdhdGluZycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JlbW90ZSBsb2NhbCBhZGRyZXNzIGRvZXMgbm90IHJlY2VpdmUgdHJ1c3RlZCBsb2NhbCBhY2Nlc3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwZXJtaXNzaW9uU2VydmljZSA9IGNyZWF0ZVJlc291cmNlU2VydmljZVN0dWIoe1xuXHRcdFx0XHRncmFudGVkOiBpZGVudGl0eSA9PiBpZGVudGl0eSA9PT0gTE9DQUxfQUdFTlRfSE9TVF9SRVNPVVJDRV9JREVOVElUWSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50Rm9ySWRlbnRpdHkoJ2xvY2FsJywgdW5kZWZpbmVkLCBwZXJtaXNzaW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2V0Yy9wYXNzd2QnKS50b1N0cmluZygpO1xuXG5cdFx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDQxLCBtZXRob2Q6ICdyZXNvdXJjZVJlYWQnLCBwYXJhbXM6IHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgdXJpIH0gfSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YWRkcmVzczogY2xpZW50LmFkZHJlc3MsXG5cdFx0XHRcdHJlc3BvbnNlOiB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLnBvcCgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhZGRyZXNzOiAnbG9jYWwnLFxuXHRcdFx0XHRyZXNwb25zZToge1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRcdGlkOiA0MSxcblx0XHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdFx0Y29kZTogQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogYEFjY2VzcyB0byAke3VyaX0gaXMgbm90IGdyYW50ZWQuYCxcblx0XHRcdFx0XHRcdGRhdGE6IHsgcmVxdWVzdDogeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpLCByZWFkOiB0cnVlIH0gfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cnVzdGVkIGxvY2FsIGlkZW50aXR5IHJldGFpbnMgbG9jYWwgcmVzb3VyY2UgYWNjZXNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGVybWlzc2lvblNlcnZpY2UgPSBjcmVhdGVSZXNvdXJjZVNlcnZpY2VTdHViKHtcblx0XHRcdFx0Z3JhbnRlZDogaWRlbnRpdHkgPT4gaWRlbnRpdHkgPT09IExPQ0FMX0FHRU5UX0hPU1RfUkVTT1VSQ0VfSURFTlRJVFksXG5cdFx0XHRcdHJlYWRCeXRlczogVlNCdWZmZXIuZnJvbVN0cmluZygndHJ1c3RlZCcpLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnRGb3JJZGVudGl0eShMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZLCB1bmRlZmluZWQsIHBlcm1pc3Npb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvZXRjL3Bhc3N3ZCcpLnRvU3RyaW5nKCk7XG5cblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogNDAsIG1ldGhvZDogJ3Jlc291cmNlUmVhZCcsIHBhcmFtczogeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmkgfSB9KTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRhZGRyZXNzOiBjbGllbnQuYWRkcmVzcyxcblx0XHRcdFx0cmVzcG9uc2U6IHRyYW5zcG9ydC5zZW50TWVzc2FnZXMucG9wKCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGFkZHJlc3M6ICdsb2NhbCcsXG5cdFx0XHRcdHJlc3BvbnNlOiB7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdFx0aWQ6IDQwLFxuXHRcdFx0XHRcdHJlc3VsdDogeyBkYXRhOiAnZEhKMWMzUmxaQT09JywgZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5CYXNlNjQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb3VyY2VSZWFkIGlzIGRlbmllZCB3aXRoIFBlcm1pc3Npb25EZW5pZWRFcnJvckRhdGEgd2hlbiBub3QgZ3JhbnRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCBjcmVhdGVQZXJtaXNzaW9uU2VydmljZShmYWxzZSkpO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9ldGMvcGFzc3dkJykudG9TdHJpbmcoKTtcblxuXHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiA0MiwgbWV0aG9kOiAncmVzb3VyY2VSZWFkJywgcGFyYW1zOiB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaSB9IH0pO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLnBvcCgpLCB7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRpZDogNDIsXG5cdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0Y29kZTogQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGBBY2Nlc3MgdG8gJHt1cml9IGlzIG5vdCBncmFudGVkLmAsXG5cdFx0XHRcdFx0ZGF0YTogeyByZXF1ZXN0OiB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmksIHJlYWQ6IHRydWUgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvdXJjZVdyaXRlIGlzIGRlbmllZCB3aXRoIFBlcm1pc3Npb25EZW5pZWRFcnJvckRhdGEgd2hlbiBub3QgZ3JhbnRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCBjcmVhdGVQZXJtaXNzaW9uU2VydmljZShmYWxzZSkpO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9ldGMvcGFzc3dkJykudG9TdHJpbmcoKTtcblxuXHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiA3LCBtZXRob2Q6ICdyZXNvdXJjZVdyaXRlJywgcGFyYW1zOiB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHVyaSwgZGF0YTogJ2FHVnNiRzg9JywgZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5CYXNlNjQgfSB9KTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5wb3AoKSwge1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IDcsXG5cdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0Y29kZTogQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGBBY2Nlc3MgdG8gJHt1cml9IGlzIG5vdCBncmFudGVkLmAsXG5cdFx0XHRcdFx0ZGF0YTogeyByZXF1ZXN0OiB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmksIHdyaXRlOiB0cnVlIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb3VyY2VMaXN0IGlzIGRlbmllZCB3aXRoIFBlcm1pc3Npb25EZW5pZWRFcnJvckRhdGEgd2hlbiBub3QgZ3JhbnRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCBjcmVhdGVQZXJtaXNzaW9uU2VydmljZShmYWxzZSkpO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9ldGMnKS50b1N0cmluZygpO1xuXG5cdFx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDUsIG1ldGhvZDogJ3Jlc291cmNlTGlzdCcsIHBhcmFtczogeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmkgfSB9KTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5wb3AoKSwge1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IDUsXG5cdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0Y29kZTogQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGBBY2Nlc3MgdG8gJHt1cml9IGlzIG5vdCBncmFudGVkLmAsXG5cdFx0XHRcdFx0ZGF0YTogeyByZXF1ZXN0OiB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmksIHJlYWQ6IHRydWUgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvdXJjZURlbGV0ZSBpcyBkZW5pZWQgd2l0aCBQZXJtaXNzaW9uRGVuaWVkRXJyb3JEYXRhIHdoZW4gbm90IGdyYW50ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgY3JlYXRlUGVybWlzc2lvblNlcnZpY2UoZmFsc2UpKTtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvZXRjL3Bhc3N3ZCcpLnRvU3RyaW5nKCk7XG5cblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogOCwgbWV0aG9kOiAncmVzb3VyY2VEZWxldGUnLCBwYXJhbXM6IHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgdXJpIH0gfSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYW5zcG9ydC5zZW50TWVzc2FnZXMucG9wKCksIHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiA4LFxuXHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCxcblx0XHRcdFx0XHRtZXNzYWdlOiBgQWNjZXNzIHRvICR7dXJpfSBpcyBub3QgZ3JhbnRlZC5gLFxuXHRcdFx0XHRcdGRhdGE6IHsgcmVxdWVzdDogeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpLCB3cml0ZTogdHJ1ZSB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc291cmNlTW92ZSBpcyBkZW5pZWQgd2hlbiBkZXN0aW5hdGlvbiBsYWNrcyB3cml0ZSBhY2Nlc3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2VVcmkgPSBVUkkuZmlsZSgnL2dyYW50L2ZvbycpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBkZXN0VXJpID0gVVJJLmZpbGUoJy9uby1ncmFudC9iYXInKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3Qgc3R1YiA9IGNyZWF0ZVJlc291cmNlU2VydmljZVN0dWIoe1xuXHRcdFx0XHRncmFudGVkOiAoX2FkZHIsIHVyaSkgPT4gdXJpLnRvU3RyaW5nKCkgPT09IHNvdXJjZVVyaSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgeyB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIHN0dWIpO1xuXG5cdFx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDksIG1ldGhvZDogJ3Jlc291cmNlTW92ZScsIHBhcmFtczogeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCBzb3VyY2U6IHNvdXJjZVVyaSwgZGVzdGluYXRpb246IGRlc3RVcmkgfSB9KTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5wb3AoKSwge1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IDksXG5cdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0Y29kZTogQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGBBY2Nlc3MgdG8gJHtkZXN0VXJpfSBpcyBub3QgZ3JhbnRlZC5gLFxuXHRcdFx0XHRcdGRhdGE6IHsgcmVxdWVzdDogeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBkZXN0VXJpLCB3cml0ZTogdHJ1ZSB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldmVyc2UgcmVzb3VyY2VSZXF1ZXN0IGRlbGVnYXRlcyB0byBwZXJtaXNzaW9uIHNlcnZpY2UgYW5kIHJlcGxpZXMgd2l0aCBlbXB0eSByZXN1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgbGFzdFJlcXVlc3Q6IHsgYWRkcmVzczogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eTsgcGFyYW1zOiB7IHVyaTogc3RyaW5nOyByZWFkPzogYm9vbGVhbjsgd3JpdGU/OiBib29sZWFuIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHN0dWIgPSBjcmVhdGVSZXNvdXJjZVNlcnZpY2VTdHViKHtcblx0XHRcdFx0Z3JhbnRlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdG9uUmVxdWVzdDogYXN5bmMgKGFkZHJlc3MsIHBhcmFtcykgPT4geyBsYXN0UmVxdWVzdCA9IHsgYWRkcmVzcywgcGFyYW1zIH07IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHsgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCBzdHViKTtcblxuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9ldGMvZm9vJykudG9TdHJpbmcoKTtcblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogMTEsIG1ldGhvZDogJ3Jlc291cmNlUmVxdWVzdCcsIHBhcmFtczogeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmksIHJlYWQ6IHRydWUgfSB9KTtcblxuXHRcdFx0Ly8gQWxsb3cgdGhlIGF3YWl0ZWQgcmVxdWVzdCBwcm9taXNlIHRvIHJlc29sdmUuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RSZXF1ZXN0LCB7IGFkZHJlc3M6ICd0ZXN0LmV4YW1wbGU6MTIzNCcsIHBhcmFtczogeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCB1cmksIHJlYWQ6IHRydWUgfSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5wb3AoKSwgeyBqc29ucnBjOiAnMi4wJywgaWQ6IDExLCByZXN1bHQ6IHt9IH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV2ZXJzZSByZXNvdXJjZVJlcXVlc3QgcmVwbGllcyB3aXRoIFBlcm1pc3Npb25EZW5pZWQgb24gY2FuY2VsbGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3R1YiA9IGNyZWF0ZVJlc291cmNlU2VydmljZVN0dWIoe1xuXHRcdFx0XHRncmFudGVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0b25SZXF1ZXN0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpOyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB7IHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgc3R1Yik7XG5cblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvZXRjL2ZvbycpLnRvU3RyaW5nKCk7XG5cdFx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2UoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEyLCBtZXRob2Q6ICdyZXNvdXJjZVJlcXVlc3QnLCBwYXJhbXM6IHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgdXJpLCByZWFkOiB0cnVlIH0gfSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5wb3AoKSwge1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IDEyLFxuXHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCxcblx0XHRcdFx0XHRtZXNzYWdlOiAnQWNjZXNzIHRvIHRoZSByZXF1ZXN0ZWQgcmVzb3VyY2UgaXMgbm90IGdyYW50ZWQuJyxcblx0XHRcdFx0XHRkYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ltcGxpY2l0IGdyYW50cyBmb3Igb3V0Z29pbmcgYWN0aW9ucycsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZUNhcHR1cmluZ1Blcm1pc3Npb25TZXJ2aWNlKCk6IHsgc2VydmljZTogSUFnZW50SG9zdFJlc291cmNlU2VydmljZTsgY2FsbHM6IHsgYWRkcmVzczogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eTsgdXJpOiBVUkkgfVtdIH0ge1xuXHRcdFx0Y29uc3QgY2FsbHM6IHsgYWRkcmVzczogQWdlbnRIb3N0UmVzb3VyY2VJZGVudGl0eTsgdXJpOiBVUkkgfVtdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUmVzb3VyY2VTZXJ2aWNlU3R1Yih7XG5cdFx0XHRcdG9uR3JhbnRJbXBsaWNpdFJlYWQ6IChhZGRyZXNzLCB1cmkpID0+IGNhbGxzLnB1c2goeyBhZGRyZXNzLCB1cmkgfSksXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB7IHNlcnZpY2UsIGNhbGxzIH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCBkaXNwYXRjaGVzIGltcGxpY2l0IHJlYWRzIGZvciBlYWNoIGN1c3RvbWl6YXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIGNhbGxzIH0gPSBjcmVhdGVDYXB0dXJpbmdQZXJtaXNzaW9uU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBjbGllbnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIHNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgnYWhwLXNlc3Npb246L3Rlc3QnKTtcblxuXHRcdFx0Y2xpZW50LmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAnYzEnLFxuXHRcdFx0XHRcdHRvb2xzOiBbXSxcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uczogW1xuXHRcdFx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBjdXN0b21pemF0aW9uSWQoJ2ZpbGU6Ly8vcGx1Z2lucy9mb28nKSwgdXJpOiAnZmlsZTovLy9wbHVnaW5zL2ZvbycsIG5hbWU6ICdGb28nLCB9LFxuXHRcdFx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBjdXN0b21pemF0aW9uSWQoJ2ZpbGU6Ly8vb3RoZXIvYmFyJyksIHVyaTogJ2ZpbGU6Ly8vb3RoZXIvYmFyJywgbmFtZTogJ0JhcicsIH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGNhbGxzLm1hcChjID0+ICh7IGFkZHJlc3M6IGMuYWRkcmVzcywgdXJpOiBjLnVyaS50b1N0cmluZygpIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgYWRkcmVzczogJ3Rlc3QuZXhhbXBsZToxMjM0JywgdXJpOiAnZmlsZTovLy9wbHVnaW5zJyB9LFxuXHRcdFx0XHRcdHsgYWRkcmVzczogJ3Rlc3QuZXhhbXBsZToxMjM0JywgdXJpOiAnZmlsZTovLy9vdGhlcicgfSxcblx0XHRcdFx0XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDaGF0VHVyblN0YXJ0ZWQgZ3JhbnRzIGF0dGFjaG1lbnQgYWNjZXNzIGJlZm9yZSByZXZlcnNlIHJlc291cmNlUmVhZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGdyYW50ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGNvbnN0IGF0dGFjaG1lbnRVcmkgPSBVUkkuZmlsZSgnL2F0dGFjaG1lbnRzL2V4YW1wbGUudHh0Jyk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUmVzb3VyY2VTZXJ2aWNlU3R1Yih7XG5cdFx0XHRcdGdyYW50ZWQ6IChfYWRkcmVzcywgdXJpLCBtb2RlKSA9PiBtb2RlID09PSBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkICYmIGdyYW50ZWQuaGFzKHVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0b25HcmFudEltcGxpY2l0UmVhZDogKF9hZGRyZXNzLCB1cmkpID0+IGdyYW50ZWQuYWRkKHVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0cmVhZEJ5dGVzOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhdHRhY2htZW50JyksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIHNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgYWN0aW9uOiBDaGF0VHVyblN0YXJ0ZWRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI2LTA3LTIzVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ1JldmlldyB0aGlzIGZpbGUnLFxuXHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdFx0YXR0YWNobWVudHM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHR1cmk6IGF0dGFjaG1lbnRVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGxhYmVsOiAnZXhhbXBsZS50eHQnLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y2xpZW50LmRpc3BhdGNoKCdjb3BpbG90LWNoYXQ6L3Rlc3QnLCBhY3Rpb24pO1xuXHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiA0Mixcblx0XHRcdFx0bWV0aG9kOiAncmVzb3VyY2VSZWFkJyxcblx0XHRcdFx0cGFyYW1zOiB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGF0dGFjaG1lbnRVcmkudG9TdHJpbmcoKSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBmbHVzaE1pY3JvdGFza3MoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmF0KC0xKSwge1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IDQyLFxuXHRcdFx0XHRyZXN1bHQ6IHsgZGF0YTogJ1lYUjBZV05vYldWdWRBPT0nLCBlbmNvZGluZzogQ29udGVudEVuY29kaW5nLkJhc2U2NCB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDaGF0UGVuZGluZ01lc3NhZ2VTZXQgZ3JhbnRzIHJlc291cmNlIGF0dGFjaG1lbnRzIG9ubHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIGNhbGxzIH0gPSBjcmVhdGVDYXB0dXJpbmdQZXJtaXNzaW9uU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBjbGllbnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIHNlcnZpY2UpO1xuXG5cdFx0XHRjbGllbnQuZGlzcGF0Y2goJ2NvcGlsb3QtY2hhdDovdGVzdCcsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsXG5cdFx0XHRcdGlkOiAncXVldWVkLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ1JldmlldyB0aGVzZSBhdHRhY2htZW50cycsXG5cdFx0XHRcdFx0b3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSxcblx0XHRcdFx0XHRhdHRhY2htZW50czogW1xuXHRcdFx0XHRcdFx0eyB0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsIHVyaTogJ2ZpbGU6Ly8vYXR0YWNobWVudHMvcXVldWVkLnR4dCcsIGxhYmVsOiAncXVldWVkLnR4dCcgfSxcblx0XHRcdFx0XHRcdHsgdHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkVtYmVkZGVkUmVzb3VyY2UsIGRhdGE6ICcnLCBjb250ZW50VHlwZTogJ3RleHQvcGxhaW4nLCBsYWJlbDogJ2lubGluZS50eHQnIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLm1hcChjYWxsID0+IGNhbGwudXJpLnRvU3RyaW5nKCkpLCBbJ2ZpbGU6Ly8vYXR0YWNobWVudHMvcXVldWVkLnR4dCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIGN1c3RvbWl6YXRpb25zIGluIHRoZSBzYW1lIGRpcmVjdG9yeSBkZWR1cGUgdG8gb25lIGdyYW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBjYWxscyB9ID0gY3JlYXRlQ2FwdHVyaW5nUGVybWlzc2lvblNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHsgY2xpZW50IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCBzZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkucGFyc2UoJ2FocC1zZXNzaW9uOi90ZXN0Jyk7XG5cblx0XHRcdGNsaWVudC5kaXNwYXRjaChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRjbGllbnRJZDogJ2MxJyxcblx0XHRcdFx0XHR0b29sczogW10sXG5cdFx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogY3VzdG9taXphdGlvbklkKCdmaWxlOi8vL3BsdWdpbnMvZm9vJyksIHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9mb28nLCBuYW1lOiAnRm9vJywgfSxcblx0XHRcdFx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogY3VzdG9taXphdGlvbklkKCdmaWxlOi8vL3BsdWdpbnMvYmFyJyksIHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9iYXInLCBuYW1lOiAnQmFyJywgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0Y2FsbHMubWFwKGMgPT4gYy51cmkudG9TdHJpbmcoKSksXG5cdFx0XHRcdFsnZmlsZTovLy9wbHVnaW5zJ10sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwZWF0IGRpc3BhdGNoIGRlZHVwZXMgcGVyIFVSSScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgY2FsbHMgfSA9IGNyZWF0ZUNhcHR1cmluZ1Blcm1pc3Npb25TZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB7IGNsaWVudCB9ID0gY3JlYXRlQ2xpZW50KHVuZGVmaW5lZCwgc2VydmljZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKCdhaHAtc2Vzc2lvbjovdGVzdCcpO1xuXG5cdFx0XHRjb25zdCBhY3Rpb246IFNlc3Npb25BY3RpdmVDbGllbnRTZXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICdjMScsXG5cdFx0XHRcdFx0dG9vbHM6IFtdLFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9wbHVnaW5zL2ZvbycpLCB1cmk6ICdmaWxlOi8vL3BsdWdpbnMvZm9vJywgbmFtZTogJ0ZvbycsIH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y2xpZW50LmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRcdGNsaWVudC5kaXNwYXRjaChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGFjdGlvbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscy5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29ubmVjdGlvbiBjbG9zZSBkaXNwb3NlcyBpbXBsaWNpdCByZWFkIGdyYW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRpZEdyYW50ID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3QgcmV2b2tlZDogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVSZXNvdXJjZVNlcnZpY2VTdHViKHtcblx0XHRcdFx0b25HcmFudEltcGxpY2l0UmVhZDogKCkgPT4gZGlkR3JhbnQuY29tcGxldGUoKSxcblx0XHRcdFx0b25SZXZva2VJbXBsaWNpdFJlYWQ6IChfYWRkcmVzcywgdXJpKSA9PiByZXZva2VkLnB1c2godXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCBzZXJ2aWNlKTtcblxuXHRcdFx0Y2xpZW50LmRpc3BhdGNoKCdjb3BpbG90LWNoYXQ6L3Rlc3QnLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0LFxuXHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkLFxuXHRcdFx0XHRpZDogJ3F1ZXVlZC0xJyxcblx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdHRleHQ6ICdSZXZpZXcgdGhpcyBhdHRhY2htZW50Jyxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbXG5cdFx0XHRcdFx0XHR7IHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSwgdXJpOiAnZmlsZTovLy9hdHRhY2htZW50cy9xdWV1ZWQudHh0JywgbGFiZWw6ICdxdWV1ZWQudHh0JyB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGRpZEdyYW50LnA7XG5cdFx0XHR0cmFuc3BvcnQuZmlyZUNsb3NlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmV2b2tlZCwgWydmaWxlOi8vL2F0dGFjaG1lbnRzL3F1ZXVlZC50eHQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhY3RpdmUgY2xpZW50IHJlbW92YWwgZG9lcyBub3QgY3Jhc2gnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIGNhbGxzIH0gPSBjcmVhdGVDYXB0dXJpbmdQZXJtaXNzaW9uU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgeyBjbGllbnQgfSA9IGNyZWF0ZUNsaWVudCh1bmRlZmluZWQsIHNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgnYWhwLXNlc3Npb246L3Rlc3QnKTtcblxuXHRcdFx0Y2xpZW50LmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRSZW1vdmVkLFxuXHRcdFx0XHRjbGllbnRJZDogJ2MxJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZVNlc3Npb24gd2l0aCBhY3RpdmUtY2xpZW50IGN1c3RvbWl6YXRpb25zIGdyYW50cyBpbXBsaWNpdCByZWFkcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgY2FsbHMgfSA9IGNyZWF0ZUNhcHR1cmluZ1Blcm1pc3Npb25TZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQodW5kZWZpbmVkLCBzZXJ2aWNlKTtcblxuXHRcdFx0dm9pZCBjbGllbnQuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiAnYzEnLFxuXHRcdFx0XHRcdHRvb2xzOiBbXSxcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uczogW1xuXHRcdFx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBjdXN0b21pemF0aW9uSWQoJ2ZpbGU6Ly8vcGx1Z2lucy9mb28nKSwgdXJpOiAnZmlsZTovLy9wbHVnaW5zL2ZvbycsIG5hbWU6ICdGb28nLCB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gUmVzb2x2ZSB0aGUgaW4tZmxpZ2h0IGNyZWF0ZVNlc3Npb24gcmVxdWVzdCBmb3IgY2xlYW51cC5cblx0XHRcdGNvbnN0IHNlbnQgPSB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmZpbmQoXG5cdFx0XHRcdChtKTogbSBpcyBKc29uUnBjUmVxdWVzdCA9PiAnbWV0aG9kJyBpbiBtICYmIG0ubWV0aG9kID09PSAnY3JlYXRlU2Vzc2lvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlbnQpO1xuXHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiBzZW50LmlkLCByZXN1bHQ6IG51bGwgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGNhbGxzLm1hcChjID0+IGMudXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRbJ2ZpbGU6Ly8vcGx1Z2lucyddLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ29yZGluYXJ5IHdvcmtpbmctZGlyZWN0b3J5IGRpc3BhdGNoJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gd29ya2luZ0RpcmVjdG9yeVNldEFjdGlvbihkaXJlY3Rvcnk6IHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVNldCBhcyBjb25zdCwgZGlyZWN0b3J5IH07XG5cdFx0fVxuXG5cdFx0LyoqIENvbm5lY3QgYGNsaWVudGAsIHN1YnNjcmliZSB0byBgc2Vzc2lvblVyaWAsIGFuZCBhbnN3ZXIgdGhlIGBzdWJzY3JpYmVgIHJlcXVlc3Qgd2l0aCBhbiBlbXB0eSBzZXNzaW9uIHNuYXBzaG90LiAqL1xuXHRcdGFzeW5jIGZ1bmN0aW9uIHN1YnNjcmliZVRvU2Vzc2lvbihjbGllbnQ6IFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LCB0cmFuc3BvcnQ6IFRlc3RQcm90b2NvbFRyYW5zcG9ydCwgc2Vzc2lvblVyaTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjbGllbnQuZ2V0U3Vic2NyaXB0aW9uKFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBzZXNzaW9uVXJpLCAndGVzdCcpO1xuXHRcdFx0bGV0IHN1YnNjcmliZVJlcTogSnNvblJwY1JlcXVlc3QgfCB1bmRlZmluZWQ7XG5cdFx0XHR3aGlsZSAoIXN1YnNjcmliZVJlcSkge1xuXHRcdFx0XHRzdWJzY3JpYmVSZXEgPSB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmZpbmQoXG5cdFx0XHRcdFx0KG0pOiBtIGlzIEpzb25ScGNSZXF1ZXN0ID0+IGhhc0tleShtLCB7IG1ldGhvZDogdHJ1ZSwgaWQ6IHRydWUgfSkgJiYgKG0gYXMgSnNvblJwY1JlcXVlc3QpLm1ldGhvZCA9PT0gJ3N1YnNjcmliZScsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGlmICghc3Vic2NyaWJlUmVxKSB7XG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogc3Vic2NyaWJlUmVxLmlkLFxuXHRcdFx0XHRyZXN1bHQ6IHsgc25hcHNob3Q6IHsgcmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgc3RhdGU6IHsgdHVybnM6IFtdIH0sIGZyb21TZXE6IDUgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBmbHVzaE1pY3JvdGFza3MoKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBmaW5kTGFzdERpc3BhdGNoQWN0aW9uKHRyYW5zcG9ydDogVGVzdFByb3RvY29sVHJhbnNwb3J0KTogSnNvblJwY05vdGlmaWNhdGlvbiB7XG5cdFx0XHRjb25zdCBtYXRjaCA9IFsuLi50cmFuc3BvcnQuc2VudE1lc3NhZ2VzXS5yZXZlcnNlKCkuZmluZChcblx0XHRcdFx0KG0pOiBtIGlzIEpzb25ScGNOb3RpZmljYXRpb24gPT4gaGFzS2V5KG0sIHsgbWV0aG9kOiB0cnVlIH0pICYmIChtIGFzIEpzb25ScGNOb3RpZmljYXRpb24pLm1ldGhvZCA9PT0gJ2Rpc3BhdGNoQWN0aW9uJyAmJiAhKCdpZCcgaW4gbSksXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1hdGNoLCAnZXhwZWN0ZWQgYSBkaXNwYXRjaEFjdGlvbiBub3RpZmljYXRpb24gdG8gaGF2ZSBiZWVuIHNlbnQnKTtcblx0XHRcdHJldHVybiBtYXRjaDtcblx0XHR9XG5cblx0XHR0ZXN0KCdvcHRpbWlzdGljYWxseSBhcHBsaWVzIGFuZCBjb25maXJtcyBhbiBhY2NlcHRlZCBhY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0IH0gPSBjcmVhdGVDbGllbnQoKTtcblx0XHRcdGF3YWl0IGNvbm5lY3RDbGllbnQoY2xpZW50LCB0cmFuc3BvcnQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgnY29waWxvdDovdGVzdC1zZXNzaW9uJyk7XG5cdFx0XHRjb25zdCBzdWIgPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uPHsgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgc3RyaW5nW10gfT4oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHNlc3Npb25VcmksICd0ZXN0Jyk7XG5cdFx0XHRhd2FpdCBzdWJzY3JpYmVUb1Nlc3Npb24oY2xpZW50LCB0cmFuc3BvcnQsIHNlc3Npb25VcmkpO1xuXG5cdFx0XHRjbGllbnQuZGlzcGF0Y2goc2Vzc2lvblVyaS50b1N0cmluZygpLCB3b3JraW5nRGlyZWN0b3J5U2V0QWN0aW9uKCdmaWxlOi8vL3dzMicpKTtcblx0XHRcdGNvbnN0IHNlbnQgPSBmaW5kTGFzdERpc3BhdGNoQWN0aW9uKHRyYW5zcG9ydCk7XG5cdFx0XHRjb25zdCB7IGNsaWVudFNlcSwgYWN0aW9uIH0gPSBzZW50LnBhcmFtcyBhcyB7IGNsaWVudFNlcTogbnVtYmVyOyBhY3Rpb246IFJldHVyblR5cGU8dHlwZW9mIHdvcmtpbmdEaXJlY3RvcnlTZXRBY3Rpb24+IH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChzdWIub2JqZWN0LnZhbHVlIGFzIHsgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgc3RyaW5nW10gfSkud29ya2luZ0RpcmVjdG9yaWVzLCBbJ2ZpbGU6Ly8vd3MyJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Yi5vYmplY3QudmVyaWZpZWRWYWx1ZT8ud29ya2luZ0RpcmVjdG9yaWVzLCB1bmRlZmluZWQpO1xuXG5cdFx0XHR0cmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0bWV0aG9kOiAnYWN0aW9uJyxcblx0XHRcdFx0cGFyYW1zOiB7IGNoYW5uZWw6IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uLCBzZXJ2ZXJTZXE6IDYsIG9yaWdpbjogeyBjbGllbnRJZDogY2xpZW50LmNsaWVudElkLCBjbGllbnRTZXEgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3ViLm9iamVjdC52ZXJpZmllZFZhbHVlPy53b3JraW5nRGlyZWN0b3JpZXMsIFsnZmlsZTovLy93czInXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ViLm9iamVjdC52YWx1ZSwgc3ViLm9iamVjdC52ZXJpZmllZFZhbHVlKTtcblx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyb2xscyBvcHRpbWlzdGljIHN0YXRlIGJhY2sgd2hlbiB0aGUgc2VydmVyIHJlamVjdHMgYW4gYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydCB9ID0gY3JlYXRlQ2xpZW50KCk7XG5cdFx0XHRhd2FpdCBjb25uZWN0Q2xpZW50KGNsaWVudCwgdHJhbnNwb3J0KTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkucGFyc2UoJ2NvcGlsb3Q6L3Rlc3Qtc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3Qgc3ViID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbjx7IHdvcmtpbmdEaXJlY3Rvcmllcz86IHJlYWRvbmx5IHN0cmluZ1tdIH0+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBzZXNzaW9uVXJpLCAndGVzdCcpO1xuXHRcdFx0YXdhaXQgc3Vic2NyaWJlVG9TZXNzaW9uKGNsaWVudCwgdHJhbnNwb3J0LCBzZXNzaW9uVXJpKTtcblxuXHRcdFx0Y2xpZW50LmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgd29ya2luZ0RpcmVjdG9yeVNldEFjdGlvbignZmlsZTovLy93czInKSk7XG5cdFx0XHRjb25zdCBzZW50ID0gZmluZExhc3REaXNwYXRjaEFjdGlvbih0cmFuc3BvcnQpO1xuXHRcdFx0Y29uc3QgeyBjbGllbnRTZXEsIGFjdGlvbiB9ID0gc2VudC5wYXJhbXMgYXMgeyBjbGllbnRTZXE6IG51bWJlcjsgYWN0aW9uOiBSZXR1cm5UeXBlPHR5cGVvZiB3b3JraW5nRGlyZWN0b3J5U2V0QWN0aW9uPiB9O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoc3ViLm9iamVjdC52YWx1ZSBhcyB7IHdvcmtpbmdEaXJlY3Rvcmllcz86IHJlYWRvbmx5IHN0cmluZ1tdIH0pLndvcmtpbmdEaXJlY3RvcmllcywgWydmaWxlOi8vL3dzMiddKTtcblxuXHRcdFx0dHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdG1ldGhvZDogJ2FjdGlvbicsXG5cdFx0XHRcdHBhcmFtczogeyBjaGFubmVsOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGFjdGlvbiwgc2VydmVyU2VxOiA2LCBvcmlnaW46IHsgY2xpZW50SWQ6IGNsaWVudC5jbGllbnRJZCwgY2xpZW50U2VxIH0sIHJlamVjdGlvblJlYXNvbjogJ2RlbmllZCcgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ViLm9iamVjdC52ZXJpZmllZFZhbHVlPy53b3JraW5nRGlyZWN0b3JpZXMsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHN1Yi5vYmplY3QudmFsdWUgYXMgeyB3b3JraW5nRGlyZWN0b3JpZXM/OiByZWFkb25seSBzdHJpbmdbXSB9KS53b3JraW5nRGlyZWN0b3JpZXMsIHVuZGVmaW5lZCk7XG5cdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc29mdCByZWNvbm5lY3QgKHRyYW5zcG9ydCBmYWN0b3J5KScsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGZpbmRSZXF1ZXN0KHRyYW5zcG9ydDogVGVzdFByb3RvY29sVHJhbnNwb3J0LCBtZXRob2Q6IHN0cmluZyk6IEpzb25ScGNSZXF1ZXN0IHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmZpbmQoXG5cdFx0XHRcdChtKTogbSBpcyBKc29uUnBjUmVxdWVzdCA9PiAnbWV0aG9kJyBpbiBtICYmIChtIGFzIEpzb25ScGNSZXF1ZXN0KS5tZXRob2QgPT09IG1ldGhvZCAmJiAnaWQnIGluIG0sXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGZpbmROb3RpZmljYXRpb24odHJhbnNwb3J0OiBUZXN0UHJvdG9jb2xUcmFuc3BvcnQsIG1ldGhvZDogc3RyaW5nKTogSnNvblJwY05vdGlmaWNhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gdHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5maW5kKFxuXHRcdFx0XHQobSk6IG0gaXMgSnNvblJwY05vdGlmaWNhdGlvbiA9PiAnbWV0aG9kJyBpbiBtICYmIChtIGFzIEpzb25ScGNOb3RpZmljYXRpb24pLm1ldGhvZCA9PT0gbWV0aG9kICYmICEoJ2lkJyBpbiBtKSxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZmluZERpc3BhdGNoQWN0aW9uKHRyYW5zcG9ydDogVGVzdFByb3RvY29sVHJhbnNwb3J0LCBhY3Rpb25UeXBlOiBBY3Rpb25UeXBlKTogSnNvblJwY05vdGlmaWNhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gdHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5maW5kKFxuXHRcdFx0XHQobSk6IG0gaXMgSnNvblJwY05vdGlmaWNhdGlvbiA9PiAnbWV0aG9kJyBpbiBtXG5cdFx0XHRcdFx0JiYgKG0gYXMgSnNvblJwY05vdGlmaWNhdGlvbikubWV0aG9kID09PSAnZGlzcGF0Y2hBY3Rpb24nXG5cdFx0XHRcdFx0JiYgISgnaWQnIGluIG0pXG5cdFx0XHRcdFx0JiYgKChtIGFzIEpzb25ScGNOb3RpZmljYXRpb24pLnBhcmFtcyBhcyB7IGFjdGlvbj86IHsgdHlwZT86IHVua25vd24gfSB9IHwgdW5kZWZpbmVkKT8uYWN0aW9uPy50eXBlID09PSBhY3Rpb25UeXBlLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvKiogV2FpdCB1bnRpbCB0aGUgY2xpZW50IHRyYW5zaXRpb25zIGludG8gdGhlIHtAbGluayBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3Rpbmd9IHN0YXRlLiAqL1xuXHRcdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JSZWNvbm5lY3RpbmcoY2xpZW50OiBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0aWYgKGNsaWVudC5jb25uZWN0aW9uU3RhdGUgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKGNsaWVudC5vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZSwgcyA9PiBzID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcpKTtcblx0XHR9XG5cblx0XHQvKiogV2FpdCBmb3IgdGhlIG5leHQgdGltZSBhIG1ldGhvZC1uYW1lZCByZXF1ZXN0IGFwcGVhcnMgaW4gdGhlIHRyYW5zcG9ydCdzIG91dGJveC4gKi9cblx0XHRhc3luYyBmdW5jdGlvbiB3YWl0Rm9yUmVxdWVzdCh0cmFuc3BvcnQ6IFRlc3RQcm90b2NvbFRyYW5zcG9ydCwgbWV0aG9kOiBzdHJpbmcpOiBQcm9taXNlPEpzb25ScGNSZXF1ZXN0PiB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjb25zdCByZXEgPSBmaW5kUmVxdWVzdCh0cmFuc3BvcnQsIG1ldGhvZCk7XG5cdFx0XHRcdGlmIChyZXEpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JSZXF1ZXN0QXQodHJhbnNwb3J0OiBUZXN0UHJvdG9jb2xUcmFuc3BvcnQsIG1ldGhvZDogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogUHJvbWlzZTxKc29uUnBjUmVxdWVzdD4ge1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdHMgPSB0cmFuc3BvcnQuc2VudE1lc3NhZ2VzLmZpbHRlcihcblx0XHRcdFx0XHQobWVzc2FnZSk6IG1lc3NhZ2UgaXMgSnNvblJwY1JlcXVlc3QgPT4gJ21ldGhvZCcgaW4gbWVzc2FnZSAmJiBtZXNzYWdlLm1ldGhvZCA9PT0gbWV0aG9kICYmICdpZCcgaW4gbWVzc2FnZSxcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKHJlcXVlc3RzW2luZGV4XSkge1xuXHRcdFx0XHRcdHJldHVybiByZXF1ZXN0c1tpbmRleF07XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0LyoqIFdhaXQgZm9yIHRoZSBuZXh0IHRpbWUgdGhlIG5ldyB0cmFuc3BvcnQgaXMgY3JlYXRlZCBieSB0aGUgZmFjdG9yeS4gKi9cblx0XHRhc3luYyBmdW5jdGlvbiB3YWl0Rm9yVHJhbnNwb3J0KHRyYW5zcG9ydHM6IFRlc3RDbGllbnRQcm90b2NvbFRyYW5zcG9ydFtdLCBpbmRleDogbnVtYmVyKTogUHJvbWlzZTxUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnQ+IHtcblx0XHRcdHdoaWxlICh0cmFuc3BvcnRzLmxlbmd0aCA8PSBpbmRleCkge1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHNldFRpbWVvdXQociwgMjUpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cmFuc3BvcnRzW2luZGV4XTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBCdWlsZCBhIGNsaWVudCB3aXJlZCB0byBhIHRyYW5zcG9ydCBmYWN0b3J5IHRoYXQgaGFuZHMgb3V0IGZyZXNoXG5cdFx0ICogYFRlc3RDbGllbnRQcm90b2NvbFRyYW5zcG9ydGBzIG9uIGVhY2ggaW52b2NhdGlvbi4gUmV0dXJucyB0aGVcblx0XHQgKiBjbGllbnQgcGx1cyBhIGB0cmFuc3BvcnRzYCBhcnJheSByZWNvcmRpbmcgZWFjaCB0cmFuc3BvcnQgaGFuZGVkXG5cdFx0ICogb3V0LCBzbyB0ZXN0cyBjYW4gZHJpdmUgaGFuZHNoYWtlL3JlY29ubmVjdCBpbnRlcmFjdGlvbnMuXG5cdFx0ICovXG5cdFx0ZnVuY3Rpb24gY3JlYXRlRmFjdG9yeUNsaWVudChwZXJtaXNzaW9uU2VydmljZSA9IGNyZWF0ZVBlcm1pc3Npb25TZXJ2aWNlKCksIGNsaWVudEluZm8/OiBJbXBsZW1lbnRhdGlvbiwgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UgPSBOdWxsVGVsZW1ldHJ5U2VydmljZSk6IHsgY2xpZW50OiBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudDsgdHJhbnNwb3J0czogVGVzdENsaWVudFByb3RvY29sVHJhbnNwb3J0W10gfSB7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnRzOiBUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnRbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENsaWVudFByb3RvY29sVHJhbnNwb3J0KCkpO1xuXHRcdFx0XHR0cmFuc3BvcnRzLnB1c2godCk7XG5cdFx0XHRcdHJldHVybiB0O1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQoXG5cdFx0XHRcdCd0ZXN0LmV4YW1wbGU6MTIzNCcsIGZhY3RvcnksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjbGllbnRJbmZvLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgcGVybWlzc2lvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSwgdGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdCkpO1xuXHRcdFx0cmV0dXJuIHsgY2xpZW50LCB0cmFuc3BvcnRzIH07XG5cdFx0fVxuXG5cdFx0YXN5bmMgZnVuY3Rpb24gY29tcGxldGVIYW5kc2hha2UodHJhbnNwb3J0OiBUZXN0Q2xpZW50UHJvdG9jb2xUcmFuc3BvcnQsIGNvbm5lY3RQcm9taXNlOiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHR0cmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHR3aGlsZSAoZmluZFJlcXVlc3QodHJhbnNwb3J0LCAnaW5pdGlhbGl6ZScpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbml0ID0gZmluZFJlcXVlc3QodHJhbnNwb3J0LCAnaW5pdGlhbGl6ZScpITtcblx0XHRcdHRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogaW5pdC5pZCxcblx0XHRcdFx0cmVzdWx0OiB7IHByb3RvY29sVmVyc2lvbjogUFJPVE9DT0xfVkVSU0lPTiwgc2VydmVyU2VxOiA1LCBzbmFwc2hvdHM6IFtdIH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGNvbm5lY3RQcm9taXNlO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3JldHJpZXMgYW4gaW5pdGlhbCB0cmFuc3BvcnQgZmFpbHVyZSB3aXRoIGEgZnJlc2ggaW5pdGlhbGl6YXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTBfMDAwKTtcblx0XHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnRzIH0gPSBjcmVhdGVGYWN0b3J5Q2xpZW50KCk7XG5cdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHR0cmFuc3BvcnRzWzBdLmNvbm5lY3REZWZlcnJlZC5lcnJvcihuZXcgRXJyb3IoJ2luaXRpYWwgdHJhbnNwb3J0IGZhaWxlZCcpKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbm5lY3RQcm9taXNlLCAvaW5pdGlhbCB0cmFuc3BvcnQgZmFpbGVkLyk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yUmVjb25uZWN0aW5nKGNsaWVudCk7XG5cblx0XHRcdGNvbnN0IHJlY29ubmVjdFRyYW5zcG9ydCA9IGF3YWl0IHdhaXRGb3JUcmFuc3BvcnQodHJhbnNwb3J0cywgMSk7XG5cdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRjb25zdCByZWNvbm5lY3QgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdChyZWNvbm5lY3RUcmFuc3BvcnQsICdyZWNvbm5lY3QnKTtcblx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRpZDogcmVjb25uZWN0LmlkLFxuXHRcdFx0XHRlcnJvcjogeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBtZXNzYWdlOiAnY2xpZW50IG5vdCBmb3VuZCcgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaW5pdGlhbGl6ZSA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ2luaXRpYWxpemUnKTtcblx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRpZDogaW5pdGlhbGl6ZS5pZCxcblx0XHRcdFx0cmVzdWx0OiB7IHByb3RvY29sVmVyc2lvbjogUFJPVE9DT0xfVkVSU0lPTiwgc2VydmVyU2VxOiAwLCBzbmFwc2hvdHM6IFtdIH0sXG5cdFx0XHR9KTtcblx0XHRcdHdoaWxlIChjbGllbnQuY29ubmVjdGlvblN0YXRlICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGF0ZTogY2xpZW50LmNvbm5lY3Rpb25TdGF0ZSxcblx0XHRcdFx0dHJhbnNwb3J0Q291bnQ6IHRyYW5zcG9ydHMubGVuZ3RoLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGF0ZTogQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGVkLFxuXHRcdFx0XHR0cmFuc3BvcnRDb3VudDogMixcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgcmV0cnkgYSBub24tcmVjb25uZWN0YWJsZSBpbml0aWFsIHRyYW5zcG9ydCBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydHMgfSA9IGNyZWF0ZUZhY3RvcnlDbGllbnQoKTtcblx0XHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gY2xpZW50LmNvbm5lY3QoKTtcblx0XHRcdHRyYW5zcG9ydHNbMF0uY29ubmVjdERlZmVycmVkLmVycm9yKG5ldyBOb25SZWNvbm5lY3RhYmxlVHJhbnNwb3J0RXJyb3IoJ3Rlcm1pbmFsIGZhaWx1cmUnKSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbm5lY3RQcm9taXNlLCAvdGVybWluYWwgZmFpbHVyZS8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3RhdGU6IGNsaWVudC5jb25uZWN0aW9uU3RhdGUsXG5cdFx0XHRcdHRyYW5zcG9ydENvdW50OiB0cmFuc3BvcnRzLmxlbmd0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhdGU6IEFnZW50SG9zdENsaWVudFN0YXRlLkNsb3NlZCxcblx0XHRcdFx0dHJhbnNwb3J0Q291bnQ6IDEsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbiByZWNvbm5lY3QgYSB0ZXJtaW5hbCBjb25uZWN0aW9uIGFmdGVyIGFuIGV4cGxpY2l0IGhvc3QgcmVzdGFydCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydHMgfSA9IGNyZWF0ZUZhY3RvcnlDbGllbnQoKTtcblx0XHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gY2xpZW50LmNvbm5lY3QoKTtcblx0XHRcdHRyYW5zcG9ydHNbMF0uY29ubmVjdERlZmVycmVkLmVycm9yKG5ldyBOb25SZWNvbm5lY3RhYmxlVHJhbnNwb3J0RXJyb3IoJ3Rlcm1pbmFsIGZhaWx1cmUnKSk7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjb25uZWN0UHJvbWlzZSwgL3Rlcm1pbmFsIGZhaWx1cmUvKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWVudC5yZWNvbm5lY3RGcm9tQ2xvc2VkKCksIHRydWUpO1xuXHRcdFx0Y29uc3QgcmVjb25uZWN0VHJhbnNwb3J0ID0gYXdhaXQgd2FpdEZvclRyYW5zcG9ydCh0cmFuc3BvcnRzLCAxKTtcblx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdGNvbnN0IHJlY29ubmVjdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3JlY29ubmVjdCcpO1xuXHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiByZWNvbm5lY3QuaWQsXG5cdFx0XHRcdGVycm9yOiB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQsIG1lc3NhZ2U6ICdjbGllbnQgbm90IGZvdW5kJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbml0aWFsaXplID0gYXdhaXQgd2FpdEZvclJlcXVlc3QocmVjb25uZWN0VHJhbnNwb3J0LCAnaW5pdGlhbGl6ZScpO1xuXHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiBpbml0aWFsaXplLmlkLFxuXHRcdFx0XHRyZXN1bHQ6IHsgcHJvdG9jb2xWZXJzaW9uOiBQUk9UT0NPTF9WRVJTSU9OLCBzZXJ2ZXJTZXE6IDAsIHNuYXBzaG90czogW10gfSxcblx0XHRcdH0pO1xuXHRcdFx0d2hpbGUgKGNsaWVudC5jb25uZWN0aW9uU3RhdGUgIT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RlZCkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0YXRlOiBjbGllbnQuY29ubmVjdGlvblN0YXRlLFxuXHRcdFx0XHR0cmFuc3BvcnRDb3VudDogdHJhbnNwb3J0cy5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXRlOiBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQsXG5cdFx0XHRcdHRyYW5zcG9ydENvdW50OiAyLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXVzZXMgY2xpZW50SWQgYWNyb3NzIHRyYW5zcG9ydCByZWNvbm5lY3RzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0cyB9ID0gY3JlYXRlRmFjdG9yeUNsaWVudCgpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxDbGllbnRJZCA9IGNsaWVudC5jbGllbnRJZDtcblxuXHRcdFx0XHQvLyBEcm9wIHRoZSB0cmFuc3BvcnQ7IHRoZSBjbGllbnQgc2hvdWxkIGF0dGFjaCBhIGZyZXNoIG9uZSBhbmRcblx0XHRcdFx0Ly8gcmVjb25uZWN0IHdpdGggdGhlIHNhbWUgY2xpZW50SWQgcmF0aGVyIHRoYW4gcmVzdGFydCBmcm9tIHNjcmF0Y2guXG5cdFx0XHRcdHRyYW5zcG9ydHNbMF0uZmlyZUNsb3NlKCk7XG5cdFx0XHRcdGF3YWl0IHdhaXRGb3JSZWNvbm5lY3RpbmcoY2xpZW50KTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0VHJhbnNwb3J0ID0gYXdhaXQgd2FpdEZvclRyYW5zcG9ydCh0cmFuc3BvcnRzLCAxKTtcblx0XHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRjb25zdCByZWNvbm5lY3QgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdChyZWNvbm5lY3RUcmFuc3BvcnQsICdyZWNvbm5lY3QnKTtcblxuXHRcdFx0XHRjb25zdCBwYXJhbXMgPSByZWNvbm5lY3QucGFyYW1zIGFzIHsgY2xpZW50SWQ6IHN0cmluZzsgbGFzdFNlZW5TZXJ2ZXJTZXE6IG51bWJlcjsgc3Vic2NyaXB0aW9uczogdW5rbm93bltdIH07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJhbXMuY2xpZW50SWQsIG9yaWdpbmFsQ2xpZW50SWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyYW1zLmxhc3RTZWVuU2VydmVyU2VxLCA1KTtcblx0XHRcdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkocGFyYW1zLnN1YnNjcmlwdGlvbnMpKTtcblxuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogcmVjb25uZWN0LmlkLFxuXHRcdFx0XHRcdHJlc3VsdDogeyB0eXBlOiBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheSwgYWN0aW9uczogW10sIG1pc3Npbmc6IFtdIH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXHRcdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXRyaWVzIHdpdGggYSBmcmVzaCBpbml0aWFsaXplIHdoZW4gdGhlIGZhY3RvcnkgdHJhbnNwb3J0IGNsb3NlcyBkdXJpbmcgaW5pdGlhbCBjb25uZWN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0cyB9ID0gY3JlYXRlRmFjdG9yeUNsaWVudCgpO1xuXHRcdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBhc3NlcnQucmVqZWN0cyhjbGllbnQuY29ubmVjdCgpKTtcblxuXHRcdFx0Y2xpZW50Lm5vdGlmeVRyYW5zcG9ydENsb3NlZCgpO1xuXHRcdFx0YXdhaXQgd2FpdEZvclJlY29ubmVjdGluZyhjbGllbnQpO1xuXHRcdFx0dHJhbnNwb3J0c1swXS5jb25uZWN0RGVmZXJyZWQuZXJyb3IobmV3IEVycm9yKCdJbml0aWFsIHRyYW5zcG9ydCBjbG9zZWQnKSk7XG5cdFx0XHRhd2FpdCBjb25uZWN0UHJvbWlzZTtcblxuXHRcdFx0Y29uc3QgcmVjb25uZWN0VHJhbnNwb3J0ID0gYXdhaXQgd2FpdEZvclRyYW5zcG9ydCh0cmFuc3BvcnRzLCAxKTtcblx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdGNvbnN0IHJlY29ubmVjdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3JlY29ubmVjdCcpO1xuXHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiByZWNvbm5lY3QuaWQsXG5cdFx0XHRcdGVycm9yOiB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQsIG1lc3NhZ2U6ICdSZWNvbm5lY3QgY2xpZW50IG5vdCBmb3VuZCcgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBpbml0aWFsaXplID0gYXdhaXQgd2FpdEZvclJlcXVlc3QocmVjb25uZWN0VHJhbnNwb3J0LCAnaW5pdGlhbGl6ZScpO1xuXHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiBpbml0aWFsaXplLmlkLFxuXHRcdFx0XHRyZXN1bHQ6IHsgcHJvdG9jb2xWZXJzaW9uOiBQUk9UT0NPTF9WRVJTSU9OLCBzZXJ2ZXJTZXE6IDAsIHNuYXBzaG90czogW10gfSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnQuY29ubmVjdGlvblN0YXRlLCBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBpbml0aWFsaXplIHdpdGggY2xpZW50IGluZm8gd2hlbiB0aGUgc2VydmVyIGZvcmdvdCB0aGUgY2xpZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0cyB9ID0gY3JlYXRlRmFjdG9yeUNsaWVudChjcmVhdGVQZXJtaXNzaW9uU2VydmljZSgpLCBhZ2VudHNXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvLCBuZXcgVGVzdENsaWVudElkZW50aXR5VGVsZW1ldHJ5U2VydmljZSgpKTtcblx0XHRcdGxldCBjb25uZWN0ZWRSZXF1ZXN0ID0gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0XHRhd2FpdCBjb21wbGV0ZUhhbmRzaGFrZSh0cmFuc3BvcnRzWzBdLCBjb25uZWN0UHJvbWlzZSk7XG5cdFx0XHRcdGNvbm5lY3RlZFJlcXVlc3QgPSBFdmVudC5vbmNlKEV2ZW50LmZpbHRlcihjbGllbnQub25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUsIHN0YXRlID0+IHN0YXRlID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpKSgoKSA9PiB7XG5cdFx0XHRcdFx0dm9pZCBjbGllbnQubGlzdFNlc3Npb25zKCkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dHJhbnNwb3J0c1swXS5maXJlQ2xvc2UoKTtcblx0XHRcdFx0YXdhaXQgd2FpdEZvclJlY29ubmVjdGluZyhjbGllbnQpO1xuXHRcdFx0XHRjb25zdCByZWNvbm5lY3RUcmFuc3BvcnQgPSBhd2FpdCB3YWl0Rm9yVHJhbnNwb3J0KHRyYW5zcG9ydHMsIDEpO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3JlY29ubmVjdCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChyZWNvbm5lY3QucGFyYW1zIGFzIHsgX21ldGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9KS5fbWV0YSwge1xuXHRcdFx0XHRcdCd2c2NvZGUuY2xpZW50TWFjaGluZUlkJzogJ2NsaWVudC1tYWNoaW5lLWlkJyxcblx0XHRcdFx0XHQndnNjb2RlLmNsaWVudERldkRldmljZUlkJzogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdFx0aWQ6IHJlY29ubmVjdC5pZCxcblx0XHRcdFx0XHRlcnJvcjogeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBtZXNzYWdlOiAnUmVjb25uZWN0IGNsaWVudCBub3QgZm91bmQnIH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGluaXRpYWxpemUgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdChyZWNvbm5lY3RUcmFuc3BvcnQsICdpbml0aWFsaXplJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGNsaWVudEluZm86IChpbml0aWFsaXplLnBhcmFtcyBhcyB7IGNsaWVudEluZm8/OiBJbXBsZW1lbnRhdGlvbiB9KS5jbGllbnRJbmZvLFxuXHRcdFx0XHRcdG1ldGE6IChpbml0aWFsaXplLnBhcmFtcyBhcyB7IF9tZXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSkuX21ldGEsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRjbGllbnRJbmZvOiBhZ2VudHNXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvLFxuXHRcdFx0XHRcdG1ldGE6IHtcblx0XHRcdFx0XHRcdCd2c2NvZGUuY2xpZW50TWFjaGluZUlkJzogJ2NsaWVudC1tYWNoaW5lLWlkJyxcblx0XHRcdFx0XHRcdCd2c2NvZGUuY2xpZW50RGV2RGV2aWNlSWQnOiAnY2xpZW50LWRldi1kZXZpY2UtaWQnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRcdGlkOiBpbml0aWFsaXplLmlkLFxuXHRcdFx0XHRcdHJlc3VsdDogeyBwcm90b2NvbFZlcnNpb246IFBST1RPQ09MX1ZFUlNJT04sIHNlcnZlclNlcTogMCwgc25hcHNob3RzOiBbXSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cdFx0XHRcdGNvbnN0IG1hbmFnZWRTZXR0aW5nc0luZGV4ID0gcmVjb25uZWN0VHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5maW5kSW5kZXgobWVzc2FnZSA9PiBoYXNLZXkobWVzc2FnZSwgeyBtZXRob2Q6IHRydWUgfSkgJiYgbWVzc2FnZS5tZXRob2QgPT09ICdzZXRDbGllbnRNYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9ucycpO1xuXHRcdFx0XHRjb25zdCBsaXN0U2Vzc2lvbnNJbmRleCA9IHJlY29ubmVjdFRyYW5zcG9ydC5zZW50TWVzc2FnZXMuZmluZEluZGV4KG1lc3NhZ2UgPT4gaGFzS2V5KG1lc3NhZ2UsIHsgbWV0aG9kOiB0cnVlIH0pICYmIG1lc3NhZ2UubWV0aG9kID09PSAnbGlzdFNlc3Npb25zJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnQuY29ubmVjdGlvblN0YXRlLCBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpO1xuXHRcdFx0XHRhc3NlcnQub2sobWFuYWdlZFNldHRpbmdzSW5kZXggPj0gMCAmJiBtYW5hZ2VkU2V0dGluZ3NJbmRleCA8IGxpc3RTZXNzaW9uc0luZGV4LCAnbWFuYWdlZCBzZXR0aW5ncyBtdXN0IGJlIHNlbnQgYmVmb3JlIHJlcXVlc3RzIHRyaWdnZXJlZCBieSB0aGUgY29ubmVjdGVkIHRyYW5zaXRpb24nKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGNvbm5lY3RlZFJlcXVlc3QuZGlzcG9zZSgpO1xuXHRcdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZXMgc3Vic2NyaXB0aW9ucyBiZWZvcmUgcmVwbGF5aW5nIHBlbmRpbmcgYWN0aW9ucyB3aGVuIHRoZSBzZXJ2ZXIgZm9yZ290IHRoZSBjbGllbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTBfMDAwKTtcblx0XHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnRzIH0gPSBjcmVhdGVGYWN0b3J5Q2xpZW50KCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKCdjb3BpbG90Oi90ZXN0LXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoJ2FocC1jaGF0Oi8vZGVmYXVsdC90ZXN0LXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gY2xpZW50LmNvbm5lY3QoKTtcblx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlZiA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb24oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHNlc3Npb25VcmksICd0ZXN0Jyk7XG5cdFx0XHRjb25zdCBpbml0aWFsU2Vzc2lvblN1YnNjcmliZSA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0QXQodHJhbnNwb3J0c1swXSwgJ3N1YnNjcmliZScsIDApO1xuXHRcdFx0dHJhbnNwb3J0c1swXS5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogaW5pdGlhbFNlc3Npb25TdWJzY3JpYmUuaWQsXG5cdFx0XHRcdHJlc3VsdDogeyBzbmFwc2hvdDogeyByZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLCBzdGF0ZTogeyBsaWZlY3ljbGU6ICdyZWFkeScgfSwgZnJvbVNlcTogNSB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNoYXRSZWYgPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uKFN0YXRlQ29tcG9uZW50cy5DaGF0LCBjaGF0VXJpLCAndGVzdCcpO1xuXHRcdFx0Y29uc3QgaW5pdGlhbENoYXRTdWJzY3JpYmUgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdEF0KHRyYW5zcG9ydHNbMF0sICdzdWJzY3JpYmUnLCAxKTtcblx0XHRcdHRyYW5zcG9ydHNbMF0uZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IGluaXRpYWxDaGF0U3Vic2NyaWJlLmlkLFxuXHRcdFx0XHRyZXN1bHQ6IHsgc25hcHNob3Q6IHsgcmVzb3VyY2U6IGNoYXRVcmkudG9TdHJpbmcoKSwgc3RhdGU6IHsgdHVybnM6IFtdIH0sIGZyb21TZXE6IDUgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhdXRoZW50aWNhdGlvbiA9IGNsaWVudC5hdXRoZW50aWNhdGUoeyByZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCB0b2tlbjogJ3Rva2VuJyB9KTtcblx0XHRcdGNvbnN0IGluaXRpYWxBdXRoZW50aWNhdGUgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdCh0cmFuc3BvcnRzWzBdLCAnYXV0aGVudGljYXRlJyk7XG5cdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiBpbml0aWFsQXV0aGVudGljYXRlLmlkLCByZXN1bHQ6IHt9IH0pO1xuXHRcdFx0YXdhaXQgYXV0aGVudGljYXRpb247XG5cdFx0XHRhd2FpdCBmbHVzaE1pY3JvdGFza3MoKTtcblxuXHRcdFx0Y2xpZW50LmRpc3BhdGNoKGNoYXRVcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi1hZnRlci1yZXN0YXJ0Jyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNi0wOC0wOVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnQ29udGludWUnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGluaXRpYWxEaXNwYXRjaCA9IGZpbmREaXNwYXRjaEFjdGlvbih0cmFuc3BvcnRzWzBdLCBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCk7XG5cdFx0XHRhc3NlcnQub2soaW5pdGlhbERpc3BhdGNoKTtcblxuXHRcdFx0dHJhbnNwb3J0c1swXS5maXJlQ2xvc2UoKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JSZWNvbm5lY3RpbmcoY2xpZW50KTtcblx0XHRcdGNvbnN0IHJlY29ubmVjdFRyYW5zcG9ydCA9IGF3YWl0IHdhaXRGb3JUcmFuc3BvcnQodHJhbnNwb3J0cywgMSk7XG5cdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRjb25zdCByZWNvbm5lY3QgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdChyZWNvbm5lY3RUcmFuc3BvcnQsICdyZWNvbm5lY3QnKTtcblx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogcmVjb25uZWN0LmlkLFxuXHRcdFx0XHRlcnJvcjogeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBtZXNzYWdlOiAnUmVjb25uZWN0IGNsaWVudCBub3QgZm91bmQnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGluaXRpYWxpemUgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdChyZWNvbm5lY3RUcmFuc3BvcnQsICdpbml0aWFsaXplJyk7XG5cdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IGluaXRpYWxpemUuaWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHByb3RvY29sVmVyc2lvbjogUFJPVE9DT0xfVkVSU0lPTixcblx0XHRcdFx0XHRzZXJ2ZXJTZXE6IDAsXG5cdFx0XHRcdFx0c25hcHNob3RzOiBbeyByZXNvdXJjZTogUk9PVF9TVEFURV9VUkksIHN0YXRlOiB7IGFnZW50czogW10sIGFjdGl2ZVNlc3Npb25zOiAwIH0sIGZyb21TZXE6IDAgfV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdG9yZWRBdXRoZW50aWNhdGUgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdEF0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ2F1dGhlbnRpY2F0ZScsIDApO1xuXHRcdFx0Y29uc3QgbWFuYWdlZFNldHRpbmdzID0gcmVjb25uZWN0VHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5maW5kKG1lc3NhZ2UgPT4gaGFzS2V5KG1lc3NhZ2UsIHsgbWV0aG9kOiB0cnVlIH0pICYmIG1lc3NhZ2UubWV0aG9kID09PSAnc2V0Q2xpZW50TWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMnKTtcblx0XHRcdGFzc2VydC5vayhtYW5hZ2VkU2V0dGluZ3MsICdtYW5hZ2VkIHNldHRpbmdzIHNob3VsZCBiZSByZXN0b3JlZCBhZnRlciBmcmVzaCBpbml0aWFsaXphdGlvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuc2VudE1lc3NhZ2VzLmluZGV4T2YobWFuYWdlZFNldHRpbmdzKSA8IHJlY29ubmVjdFRyYW5zcG9ydC5zZW50TWVzc2FnZXMuaW5kZXhPZihyZXN0b3JlZEF1dGhlbnRpY2F0ZSksXG5cdFx0XHRcdCdtYW5hZ2VkIHNldHRpbmdzIHNob3VsZCBiZSByZXN0b3JlZCBiZWZvcmUgYXV0aGVudGljYXRpb24gYW5kIHN1YnNjcmlwdGlvbnMnLFxuXHRcdFx0KTtcblx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogcmVzdG9yZWRBdXRoZW50aWNhdGUuaWQsIHJlc3VsdDoge30gfSk7XG5cdFx0XHRjb25zdCByZXN0b3JlZFNlc3Npb25TdWJzY3JpYmUgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdEF0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3N1YnNjcmliZScsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN0b3JlZFNlc3Npb25TdWJzY3JpYmUucGFyYW1zIGFzIHsgY2hhbm5lbDogc3RyaW5nIH0pLmNoYW5uZWwsIHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHJlc3RvcmVkU2Vzc2lvblN1YnNjcmliZS5pZCxcblx0XHRcdFx0cmVzdWx0OiB7IHNuYXBzaG90OiB7IHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHN0YXRlOiB7IGxpZmVjeWNsZTogJ3JlYWR5JyB9LCBmcm9tU2VxOiAxIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdG9yZWRDaGF0U3Vic2NyaWJlID0gYXdhaXQgd2FpdEZvclJlcXVlc3RBdChyZWNvbm5lY3RUcmFuc3BvcnQsICdzdWJzY3JpYmUnLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdG9yZWRDaGF0U3Vic2NyaWJlLnBhcmFtcyBhcyB7IGNoYW5uZWw6IHN0cmluZyB9KS5jaGFubmVsLCBjaGF0VXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsIGlkOiByZXN0b3JlZENoYXRTdWJzY3JpYmUuaWQsXG5cdFx0XHRcdHJlc3VsdDogeyBzbmFwc2hvdDogeyByZXNvdXJjZTogY2hhdFVyaS50b1N0cmluZygpLCBzdGF0ZTogeyB0dXJuczogW10gfSwgZnJvbVNlcTogMiB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXG5cdFx0XHRjb25zdCByZXBsYXllZCA9IGZpbmREaXNwYXRjaEFjdGlvbihyZWNvbm5lY3RUcmFuc3BvcnQsIEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkKTtcblx0XHRcdGFzc2VydC5vayhyZXBsYXllZCwgJ3BlbmRpbmcgdHVybiBzaG91bGQgcmVwbGF5IGFmdGVyIHRoZSBzZXNzaW9uIGFuZCBjaGF0IGFyZSByZXN0b3JlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuc2VudE1lc3NhZ2VzLmluZGV4T2YocmVwbGF5ZWQpID4gcmVjb25uZWN0VHJhbnNwb3J0LnNlbnRNZXNzYWdlcy5pbmRleE9mKHJlc3RvcmVkQ2hhdFN1YnNjcmliZSksXG5cdFx0XHRcdCdwZW5kaW5nIHR1cm4gc2hvdWxkIGJlIHNlbnQgYWZ0ZXIgc3Vic2NyaXB0aW9uIHJlc3RvcmF0aW9uJyxcblx0XHRcdCk7XG5cblx0XHRcdGNoYXRSZWYuZGlzcG9zZSgpO1xuXHRcdFx0c2Vzc2lvblJlZi5kaXNwb3NlKCk7XG5cdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwbGF5cyBwZW5kaW5nIG9wdGltaXN0aWMgYWN0aW9ucyBhZnRlciByZWNvbm5lY3QnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTBfMDAwKTtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnRzIH0gPSBjcmVhdGVGYWN0b3J5Q2xpZW50KCk7XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gY2xpZW50LmNvbm5lY3QoKTtcblx0XHRcdFx0YXdhaXQgY29tcGxldGVIYW5kc2hha2UodHJhbnNwb3J0c1swXSwgY29ubmVjdFByb21pc2UpO1xuXG5cdFx0XHRcdC8vIEVzdGFibGlzaCBhIHNlc3Npb24gc3Vic2NyaXB0aW9uIHNvIGRpc3BhdGNoKCkgY2FuIGFwcGx5IG9wdGltaXN0aWNhbGx5LlxuXHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKCdjb3BpbG90Oi90ZXN0LXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3Qgc3ViUmVmID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgc2Vzc2lvblVyaSwgJ3Rlc3QnKTtcblx0XHRcdFx0Y29uc3Qgc3Vic2NyaWJlUmVxID0gYXdhaXQgd2FpdEZvclJlcXVlc3QodHJhbnNwb3J0c1swXSwgJ3N1YnNjcmliZScpO1xuXHRcdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHN1YnNjcmliZVJlcS5pZCxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgc25hcHNob3Q6IHsgcmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgc3RhdGU6IHsgdHVybnM6IFtdIH0sIGZyb21TZXE6IDUgfSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRcdFx0Ly8gRGlzcGF0Y2ggYW4gb3B0aW1pc3RpYyBhY3Rpb24gcmlnaHQgYmVmb3JlIHRoZSB0cmFuc3BvcnQgZHJvcHMuXG5cdFx0XHRcdGNvbnN0IGFjdGlvbjogU2Vzc2lvblRpdGxlQ2hhbmdlZEFjdGlvbiA9IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsXG5cdFx0XHRcdFx0dGl0bGU6ICdSZW5hbWVkIGJ5IHVzZXInLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjbGllbnQuZGlzcGF0Y2goc2Vzc2lvblVyaS50b1N0cmluZygpLCBhY3Rpb24pO1xuXHRcdFx0XHRjb25zdCBpbml0aWFsRGlzcGF0Y2ggPSBmaW5kRGlzcGF0Y2hBY3Rpb24odHJhbnNwb3J0c1swXSwgQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGluaXRpYWxEaXNwYXRjaCwgJ29wdGltaXN0aWMgZGlzcGF0Y2ggc2hvdWxkIHJlYWNoIHRoZSBvcmlnaW5hbCB0cmFuc3BvcnQnKTtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbFNlcSA9IChpbml0aWFsRGlzcGF0Y2gucGFyYW1zIGFzIHsgY2xpZW50U2VxOiBudW1iZXIgfSkuY2xpZW50U2VxO1xuXG5cdFx0XHRcdC8vIERyb3AgdGhlIHRyYW5zcG9ydCBtaWQtZmxpZ2h0LiBUaGUgbmV3IHRyYW5zcG9ydCByZWNlaXZlcyBhXG5cdFx0XHRcdC8vIHJlY29ubmVjdCBSUEMgcGx1cyBhIHJlcGxheSBvZiB0aGUgdW5jb25maXJtZWQgZGlzcGF0Y2guXG5cdFx0XHRcdHRyYW5zcG9ydHNbMF0uZmlyZUNsb3NlKCk7XG5cdFx0XHRcdGF3YWl0IHdhaXRGb3JSZWNvbm5lY3RpbmcoY2xpZW50KTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0VHJhbnNwb3J0ID0gYXdhaXQgd2FpdEZvclRyYW5zcG9ydCh0cmFuc3BvcnRzLCAxKTtcblx0XHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRjb25zdCByZWNvbm5lY3QgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdChyZWNvbm5lY3RUcmFuc3BvcnQsICdyZWNvbm5lY3QnKTtcblx0XHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHJlY29ubmVjdC5pZCxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgdHlwZTogUmVjb25uZWN0UmVzdWx0VHlwZS5SZXBsYXksIGFjdGlvbnM6IFtdLCBtaXNzaW5nOiBbXSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cblx0XHRcdFx0Y29uc3QgcmVwbGF5ZWQgPSBmaW5kRGlzcGF0Y2hBY3Rpb24ocmVjb25uZWN0VHJhbnNwb3J0LCBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQpO1xuXHRcdFx0XHRhc3NlcnQub2socmVwbGF5ZWQsICdwZW5kaW5nIG9wdGltaXN0aWMgYWN0aW9uIHNob3VsZCBiZSByZS1zZW50IGFmdGVyIHJlY29ubmVjdCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlcGxheWVkLnBhcmFtcyBhcyB7IGNsaWVudFNlcTogbnVtYmVyIH0pLmNsaWVudFNlcSwgaW5pdGlhbFNlcSwgJ3JlcGxheWVkIGRpc3BhdGNoIG11c3QgcmV1c2UgdGhlIG9yaWdpbmFsIGNsaWVudFNlcScpO1xuXG5cdFx0XHRcdHN1YlJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2F0dGFjaG1lbnQgZ3JhbnQgcmVtYWlucyBhdmFpbGFibGUgd2hlbiBhIHBlbmRpbmcgdHVybiBpcyByZXBsYXllZCBhZnRlciByZWNvbm5lY3QnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTBfMDAwKTtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGF0dGFjaG1lbnRVcmkgPSBVUkkuZmlsZSgnL2F0dGFjaG1lbnRzL3JlcGxheWVkLnR4dCcpO1xuXHRcdFx0XHRjb25zdCBncmFudGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRcdGNvbnN0IHBlcm1pc3Npb25TZXJ2aWNlID0gY3JlYXRlUmVzb3VyY2VTZXJ2aWNlU3R1Yih7XG5cdFx0XHRcdFx0Z3JhbnRlZDogKF9hZGRyZXNzLCB1cmksIG1vZGUpID0+IG1vZGUgPT09IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQgJiYgZ3JhbnRlZC5oYXModXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdG9uR3JhbnRJbXBsaWNpdFJlYWQ6IChfYWRkcmVzcywgdXJpKSA9PiBncmFudGVkLmFkZCh1cmkudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0cmVhZEJ5dGVzOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdyZXBsYXllZCcpLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydHMgfSA9IGNyZWF0ZUZhY3RvcnlDbGllbnQocGVybWlzc2lvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblxuXHRcdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKCdjb3BpbG90LWNoYXQ6L3Rlc3QtY2hhdCcpO1xuXHRcdFx0XHRjb25zdCBzdWJSZWYgPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uKFN0YXRlQ29tcG9uZW50cy5DaGF0LCBjaGF0VXJpLCAndGVzdCcpO1xuXHRcdFx0XHRjb25zdCBzdWJzY3JpYmVSZXEgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdCh0cmFuc3BvcnRzWzBdLCAnc3Vic2NyaWJlJyk7XG5cdFx0XHRcdHRyYW5zcG9ydHNbMF0uZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogc3Vic2NyaWJlUmVxLmlkLFxuXHRcdFx0XHRcdHJlc3VsdDogeyBzbmFwc2hvdDogeyByZXNvdXJjZTogY2hhdFVyaS50b1N0cmluZygpLCBzdGF0ZTogeyB0dXJuczogW10gfSwgZnJvbVNlcTogNSB9IH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0XHRjbGllbnQuZGlzcGF0Y2goY2hhdFVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI2LTA3LTIzVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHRcdHRleHQ6ICdSZXZpZXcgdGhpcyBmaWxlJyxcblx0XHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdFx0XHRhdHRhY2htZW50czogW3tcblx0XHRcdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHR1cmk6IGF0dGFjaG1lbnRVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdFx0bGFiZWw6ICdyZXBsYXllZC50eHQnLFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dHJhbnNwb3J0c1swXS5maXJlQ2xvc2UoKTtcblx0XHRcdFx0YXdhaXQgd2FpdEZvclJlY29ubmVjdGluZyhjbGllbnQpO1xuXHRcdFx0XHRjb25zdCByZWNvbm5lY3RUcmFuc3BvcnQgPSBhd2FpdCB3YWl0Rm9yVHJhbnNwb3J0KHRyYW5zcG9ydHMsIDEpO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3JlY29ubmVjdCcpO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogcmVjb25uZWN0LmlkLFxuXHRcdFx0XHRcdHJlc3VsdDogeyB0eXBlOiBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheSwgYWN0aW9uczogW10sIG1pc3Npbmc6IFtdIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBmbHVzaE1pY3JvdGFza3MoKTtcblxuXHRcdFx0XHRhc3NlcnQub2soZmluZERpc3BhdGNoQWN0aW9uKHJlY29ubmVjdFRyYW5zcG9ydCwgQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQpKTtcblx0XHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0XHRpZDogNDIsXG5cdFx0XHRcdFx0bWV0aG9kOiAncmVzb3VyY2VSZWFkJyxcblx0XHRcdFx0XHRwYXJhbXM6IHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogYXR0YWNobWVudFVyaS50b1N0cmluZygpIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBmbHVzaE1pY3JvdGFza3MoKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNvbm5lY3RUcmFuc3BvcnQuc2VudE1lc3NhZ2VzLmF0KC0xKSwge1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRcdGlkOiA0Mixcblx0XHRcdFx0XHRyZXN1bHQ6IHsgZGF0YTogJ2NtVndiR0Y1WldRPScsIGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuQmFzZTY0IH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHN1YlJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIHJlcGxheSB3aGVuIHNlcnZlciBhbHJlYWR5IGVjaG9lZCB0aGUgYWN0aW9uIGluIHRoZSByZXBsYXkgYnVmZmVyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0cyB9ID0gY3JlYXRlRmFjdG9yeUNsaWVudCgpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKCdjb3BpbG90Oi90ZXN0LXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3Qgc3ViUmVmID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgc2Vzc2lvblVyaSwgJ3Rlc3QnKTtcblx0XHRcdFx0Y29uc3Qgc3Vic2NyaWJlUmVxID0gYXdhaXQgd2FpdEZvclJlcXVlc3QodHJhbnNwb3J0c1swXSwgJ3N1YnNjcmliZScpO1xuXHRcdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHN1YnNjcmliZVJlcS5pZCxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgc25hcHNob3Q6IHsgcmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgc3RhdGU6IHsgdHVybnM6IFtdIH0sIGZyb21TZXE6IDUgfSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRcdFx0Y29uc3QgYWN0aW9uOiBTZXNzaW9uVGl0bGVDaGFuZ2VkQWN0aW9uID0ge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdFx0XHR0aXRsZTogJ0VjaG9lZCBiYWNrJyxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y2xpZW50LmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbERpc3BhdGNoID0gZmluZERpc3BhdGNoQWN0aW9uKHRyYW5zcG9ydHNbMF0sIEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCkhO1xuXHRcdFx0XHRjb25zdCBpbml0aWFsU2VxID0gKGluaXRpYWxEaXNwYXRjaC5wYXJhbXMgYXMgeyBjbGllbnRTZXE6IG51bWJlciB9KS5jbGllbnRTZXE7XG5cblx0XHRcdFx0dHJhbnNwb3J0c1swXS5maXJlQ2xvc2UoKTtcblx0XHRcdFx0YXdhaXQgd2FpdEZvclJlY29ubmVjdGluZyhjbGllbnQpO1xuXHRcdFx0XHRjb25zdCByZWNvbm5lY3RUcmFuc3BvcnQgPSBhd2FpdCB3YWl0Rm9yVHJhbnNwb3J0KHRyYW5zcG9ydHMsIDEpO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3JlY29ubmVjdCcpO1xuXHRcdFx0XHQvLyBSZXBseSB3aXRoIGEgcmVwbGF5IGJ1ZmZlciB0aGF0IGFscmVhZHkgY29udGFpbnMgb3VyIGFjdGlvbixcblx0XHRcdFx0Ly8gZWNob2VkIGJhY2sgd2l0aCBvcmlnaW4gPSB7IGNsaWVudElkLCBjbGllbnRTZXEgfS5cblx0XHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHJlY29ubmVjdC5pZCxcblx0XHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6IFJlY29ubmVjdFJlc3VsdFR5cGUuUmVwbGF5LFxuXHRcdFx0XHRcdFx0YWN0aW9uczogW3tcblx0XHRcdFx0XHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb24sXG5cdFx0XHRcdFx0XHRcdHNlcnZlclNlcTogNixcblx0XHRcdFx0XHRcdFx0b3JpZ2luOiB7IGNsaWVudElkOiBjbGllbnQuY2xpZW50SWQsIGNsaWVudFNlcTogaW5pdGlhbFNlcSB9LFxuXHRcdFx0XHRcdFx0XHRyZWplY3Rpb25SZWFzb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0bWlzc2luZzogW10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kRGlzcGF0Y2hBY3Rpb24ocmVjb25uZWN0VHJhbnNwb3J0LCBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQpLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0J2FjdGlvbiBlY2hvZWQgYmFjayB2aWEgcmVwbGF5IGJ1ZmZlciBtdXN0IG5vdCBiZSByZS1zZW50Jyk7XG5cblx0XHRcdFx0c3ViUmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb3V0Z29pbmcgcmVxdWVzdHMgd2FpdCBmb3IgcmVjb25uZWN0IHRvIGNvbXBsZXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0cyB9ID0gY3JlYXRlRmFjdG9yeUNsaWVudCgpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblxuXHRcdFx0XHQvLyBEcm9wIHRoZSB0cmFuc3BvcnQsIHRoZW4gaXNzdWUgYSBuZXcgcmVxdWVzdCB3aGlsZSB0aGVcblx0XHRcdFx0Ly8gc29mdC1yZWNvbm5lY3QgaXMgaW4gZmxpZ2h0LiBUaGUgcmVxdWVzdCBtdXN0IGxhbmQgb24gdGhlIG5ld1xuXHRcdFx0XHQvLyB0cmFuc3BvcnQgcmF0aGVyIHRoYW4gcmFjaW5nIHRoZSBkZWFkIG9uZSBvciBiZWluZyBkcm9wcGVkLlxuXHRcdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVDbG9zZSgpO1xuXHRcdFx0XHRjb25zdCBpbkZsaWdodCA9IGNsaWVudC5yZXNvdXJjZUxpc3QoVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSkuY2F0Y2goZXJyID0+IGVycik7XG5cblx0XHRcdFx0Ly8gSG9sZCBvZmYgdGhlIG5ldyB0cmFuc3BvcnQncyBjb25uZWN0KCkgc28gdGhlIHJlcXVlc3Qgc3RheXMgZ2F0ZWQuXG5cdFx0XHRcdGF3YWl0IHdhaXRGb3JSZWNvbm5lY3RpbmcoY2xpZW50KTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0VHJhbnNwb3J0ID0gYXdhaXQgd2FpdEZvclRyYW5zcG9ydCh0cmFuc3BvcnRzLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3Jlc291cmNlTGlzdCcpLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0J3JlcXVlc3QgbXVzdCBOT1QgYmUgc2VudCBiZWZvcmUgcmVjb25uZWN0IGNvbXBsZXRlcycpO1xuXG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0ID0gYXdhaXQgd2FpdEZvclJlcXVlc3QocmVjb25uZWN0VHJhbnNwb3J0LCAncmVjb25uZWN0Jyk7XG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsIGlkOiByZWNvbm5lY3QuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHR5cGU6IFJlY29ubmVjdFJlc3VsdFR5cGUuUmVwbGF5LCBhY3Rpb25zOiBbXSwgbWlzc2luZzogW10gfSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VMaXN0ID0gYXdhaXQgd2FpdEZvclJlcXVlc3QocmVjb25uZWN0VHJhbnNwb3J0LCAncmVzb3VyY2VMaXN0Jyk7XG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7IGpzb25ycGM6ICcyLjAnLCBpZDogcmVzb3VyY2VMaXN0LmlkLCByZXN1bHQ6IHsgZW50cmllczogW10gfSB9KTtcblxuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGluRmxpZ2h0O1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZhbHVlLCB7IGVudHJpZXM6IFtdIH0pO1xuXHRcdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RlZCBhY3Rpb24gZWNob2VkIGluIHJlcGxheSBidWZmZXIgaXMgbm90IGFwcGxpZWQgdG8gY29uZmlybWVkIHN0YXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0cyB9ID0gY3JlYXRlRmFjdG9yeUNsaWVudCgpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKCdjb3BpbG90Oi90ZXN0LXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3Qgc3ViUmVmID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbjx7IHN1bW1hcnk6IHsgdGl0bGU6IHN0cmluZyB9IH0+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBzZXNzaW9uVXJpLCAndGVzdCcpO1xuXHRcdFx0XHRjb25zdCBzdWJzY3JpYmVSZXEgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdCh0cmFuc3BvcnRzWzBdLCAnc3Vic2NyaWJlJyk7XG5cdFx0XHRcdHRyYW5zcG9ydHNbMF0uZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogc3Vic2NyaWJlUmVxLmlkLFxuXHRcdFx0XHRcdHJlc3VsdDogeyBzbmFwc2hvdDogeyByZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLCBzdGF0ZTogeyBzdW1tYXJ5OiB7IHRpdGxlOiAnT3JpZ2luYWwnIH0sIHR1cm5zOiBbXSB9LCBmcm9tU2VxOiA1IH0gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRcdGNvbnN0IGFjdGlvbjogU2Vzc2lvblRpdGxlQ2hhbmdlZEFjdGlvbiA9IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsXG5cdFx0XHRcdFx0dGl0bGU6ICdSZWplY3RlZCBjaGFuZ2UnLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjbGllbnQuZGlzcGF0Y2goc2Vzc2lvblVyaS50b1N0cmluZygpLCBhY3Rpb24pO1xuXHRcdFx0XHRjb25zdCBpbml0aWFsRGlzcGF0Y2ggPSBmaW5kRGlzcGF0Y2hBY3Rpb24odHJhbnNwb3J0c1swXSwgQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKSE7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxTZXEgPSAoaW5pdGlhbERpc3BhdGNoLnBhcmFtcyBhcyB7IGNsaWVudFNlcTogbnVtYmVyIH0pLmNsaWVudFNlcTtcblxuXHRcdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVDbG9zZSgpO1xuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yUmVjb25uZWN0aW5nKGNsaWVudCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdFRyYW5zcG9ydCA9IGF3YWl0IHdhaXRGb3JUcmFuc3BvcnQodHJhbnNwb3J0cywgMSk7XG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0ID0gYXdhaXQgd2FpdEZvclJlcXVlc3QocmVjb25uZWN0VHJhbnNwb3J0LCAncmVjb25uZWN0Jyk7XG5cdFx0XHRcdC8vIFNlcnZlciBlY2hvZXMgYmFjayB0aGUgYWN0aW9uIHdpdGggYSByZWplY3Rpb25SZWFzb24gXHUyMDE0IHRoZVxuXHRcdFx0XHQvLyBjb25maXJtZWQgc3RhdGUgbXVzdCBOT1QgYWR2YW5jZSB0byAnUmVqZWN0ZWQgY2hhbmdlJy5cblx0XHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHJlY29ubmVjdC5pZCxcblx0XHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6IFJlY29ubmVjdFJlc3VsdFR5cGUuUmVwbGF5LFxuXHRcdFx0XHRcdFx0YWN0aW9uczogW3tcblx0XHRcdFx0XHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb24sXG5cdFx0XHRcdFx0XHRcdHNlcnZlclNlcTogNixcblx0XHRcdFx0XHRcdFx0b3JpZ2luOiB7IGNsaWVudElkOiBjbGllbnQuY2xpZW50SWQsIGNsaWVudFNlcTogaW5pdGlhbFNlcSB9LFxuXHRcdFx0XHRcdFx0XHRyZWplY3Rpb25SZWFzb246ICd1bmF1dGhvcml6ZWQnLFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRtaXNzaW5nOiBbXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gc3ViUmVmLm9iamVjdC52ZXJpZmllZFZhbHVlO1xuXHRcdFx0XHRhc3NlcnQub2soc2Vzc2lvblN0YXRlLCAnc2Vzc2lvbiBzdGF0ZSBzaG91bGQgYmUgaHlkcmF0ZWQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25TdGF0ZS5zdW1tYXJ5LnRpdGxlLCAnT3JpZ2luYWwnLFxuXHRcdFx0XHRcdCdyZWplY3RlZCBhY3Rpb24gbXVzdCBub3QgaGF2ZSBiZWVuIGFwcGxpZWQgdG8gY29uZmlybWVkIHN0YXRlJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kRGlzcGF0Y2hBY3Rpb24ocmVjb25uZWN0VHJhbnNwb3J0LCBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQpLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0J3JlamVjdGVkIGFjdGlvbiBtdXN0IG5vdCBiZSByZS1kaXNwYXRjaGVkJyk7XG5cblx0XHRcdFx0c3ViUmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc25hcHNob3QgcmVjb25uZWN0IHJlc3VsdCByZXNlYXRzIHRoZSByb290IHN0YXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0cyB9ID0gY3JlYXRlRmFjdG9yeUNsaWVudCgpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblxuXHRcdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVDbG9zZSgpO1xuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yUmVjb25uZWN0aW5nKGNsaWVudCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdFRyYW5zcG9ydCA9IGF3YWl0IHdhaXRGb3JUcmFuc3BvcnQodHJhbnNwb3J0cywgMSk7XG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0ID0gYXdhaXQgd2FpdEZvclJlcXVlc3QocmVjb25uZWN0VHJhbnNwb3J0LCAncmVjb25uZWN0Jyk7XG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsIGlkOiByZWNvbm5lY3QuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBSZWNvbm5lY3RSZXN1bHRUeXBlLlNuYXBzaG90LFxuXHRcdFx0XHRcdFx0c25hcHNob3RzOiBbe1xuXHRcdFx0XHRcdFx0XHRyZXNvdXJjZTogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdFx0XHRcdHN0YXRlOiB7IGFnZW50czogW3sgcHJvdmlkZXI6ICdjb3BpbG90JywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgbW9kZWxzOiBbXSwgdG9vbHM6IFtdIH1dLCBhY3RpdmVTZXNzaW9uczogMCwgdGVybWluYWxzOiBbXSB9LFxuXHRcdFx0XHRcdFx0XHRmcm9tU2VxOiA0Mixcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBmbHVzaE1pY3JvdGFza3MoKTtcblxuXHRcdFx0XHRjb25zdCByb290ID0gY2xpZW50LnJvb3RTdGF0ZS52YWx1ZTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJvb3QgJiYgIShyb290IGluc3RhbmNlb2YgRXJyb3IpLCAncm9vdCBzdGF0ZSBzaG91bGQgYmUgaHlkcmF0ZWQgZnJvbSBzbmFwc2hvdCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdC5hZ2VudHNbMF0/LnByb3ZpZGVyLCAnY29waWxvdCcpO1xuXHRcdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWNvbm5lY3Qgc25hcHNob3QgcmVwbGFjZXMgcGVuZGluZyBvcHRpbWlzdGljIHdvcmtpbmctZGlyZWN0b3J5IHN0YXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0cyB9ID0gY3JlYXRlRmFjdG9yeUNsaWVudCgpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKCdjb3BpbG90Oi90ZXN0LXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3Qgc3ViUmVmID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgc2Vzc2lvblVyaSwgJ3Rlc3QnKTtcblx0XHRcdFx0Y29uc3Qgc3Vic2NyaWJlUmVxID0gYXdhaXQgd2FpdEZvclJlcXVlc3QodHJhbnNwb3J0c1swXSwgJ3N1YnNjcmliZScpO1xuXHRcdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHN1YnNjcmliZVJlcS5pZCxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgc25hcHNob3Q6IHsgcmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgc3RhdGU6IHsgdHVybnM6IFtdIH0sIGZyb21TZXE6IDUgfSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgZmx1c2hNaWNyb3Rhc2tzKCk7XG5cblx0XHRcdFx0Y2xpZW50LmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQsXG5cdFx0XHRcdFx0ZGlyZWN0b3J5OiAnZmlsZTovLy93czInLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoc3ViUmVmLm9iamVjdC52YWx1ZSBhcyB7IHdvcmtpbmdEaXJlY3Rvcmllcz86IHN0cmluZ1tdIH0pLndvcmtpbmdEaXJlY3RvcmllcywgWydmaWxlOi8vL3dzMiddKTtcblxuXHRcdFx0XHQvLyBEcm9wIHRoZSB0cmFuc3BvcnQgYmVmb3JlIHRoZSBzZXJ2ZXIgZXZlciBlY2hvZXMgdGhlIGFjdGlvbiBiYWNrLlxuXHRcdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVDbG9zZSgpO1xuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yUmVjb25uZWN0aW5nKGNsaWVudCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdFRyYW5zcG9ydCA9IGF3YWl0IHdhaXRGb3JUcmFuc3BvcnQodHJhbnNwb3J0cywgMSk7XG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0ID0gYXdhaXQgd2FpdEZvclJlcXVlc3QocmVjb25uZWN0VHJhbnNwb3J0LCAncmVjb25uZWN0Jyk7XG5cdFx0XHRcdC8vIFNlcnZlciByZXBvcnRzIHRoZSByZXBsYXkgYnVmZmVyIG5vIGxvbmdlciBjb3ZlcnMgb3VyIGdhcCwgc28gaXRcblx0XHRcdFx0Ly8gc2VuZHMgYSBmcmVzaCBzbmFwc2hvdCBpbnN0ZWFkIFx1MjAxNCByZWJhc2luZyBjb25maXJtZWQgc3RhdGUgYmVmb3JlXG5cdFx0XHRcdC8vIHRoZSBkaXNwYXRjaGVkIGFjdGlvbidzIGVjaG8gZXZlciBhcnJpdmVkLlxuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogcmVjb25uZWN0LmlkLFxuXHRcdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdFx0dHlwZTogUmVjb25uZWN0UmVzdWx0VHlwZS5TbmFwc2hvdCxcblx0XHRcdFx0XHRcdHNuYXBzaG90czogW3sgcmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgc3RhdGU6IHsgdHVybnM6IFtdLCB3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy9mcmVzaCddIH0sIGZyb21TZXE6IDkgfV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKHN1YlJlZi5vYmplY3QudmFsdWUgYXMgeyB3b3JraW5nRGlyZWN0b3JpZXM/OiBzdHJpbmdbXSB9KS53b3JraW5nRGlyZWN0b3JpZXMsIFsnZmlsZTovLy9mcmVzaCddKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmREaXNwYXRjaEFjdGlvbihyZWNvbm5lY3RUcmFuc3BvcnQsIEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQpLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0J2FjdGlvbiBjbGVhcmVkIGJ5IGEgZnJlc2ggc25hcHNob3QgbXVzdCBub3QgYmUgcmVwbGF5ZWQnKTtcblxuXHRcdFx0XHRzdWJSZWYuZGlzcG9zZSgpO1xuXHRcdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWNvbm5lY3QgbWlzc2luZyByZXN1bHQgY2xlYXJzIHBlbmRpbmcgb3B0aW1pc3RpYyB3b3JraW5nLWRpcmVjdG9yeSBzdGF0ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydHMgfSA9IGNyZWF0ZUZhY3RvcnlDbGllbnQoKTtcblx0XHRcdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0XHRhd2FpdCBjb21wbGV0ZUhhbmRzaGFrZSh0cmFuc3BvcnRzWzBdLCBjb25uZWN0UHJvbWlzZSk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgnY29waWxvdDovdGVzdC1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IHN1YlJlZiA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb24oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHNlc3Npb25VcmksICd0ZXN0Jyk7XG5cdFx0XHRcdGNvbnN0IHN1YnNjcmliZVJlcSA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHRyYW5zcG9ydHNbMF0sICdzdWJzY3JpYmUnKTtcblx0XHRcdFx0dHJhbnNwb3J0c1swXS5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsIGlkOiBzdWJzY3JpYmVSZXEuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHNuYXBzaG90OiB7IHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHN0YXRlOiB7IHR1cm5zOiBbXSB9LCBmcm9tU2VxOiA1IH0gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRcdGNsaWVudC5kaXNwYXRjaChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LFxuXHRcdFx0XHRcdGRpcmVjdG9yeTogJ2ZpbGU6Ly8vd3MyJyxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dHJhbnNwb3J0c1swXS5maXJlQ2xvc2UoKTtcblx0XHRcdFx0YXdhaXQgd2FpdEZvclJlY29ubmVjdGluZyhjbGllbnQpO1xuXHRcdFx0XHRjb25zdCByZWNvbm5lY3RUcmFuc3BvcnQgPSBhd2FpdCB3YWl0Rm9yVHJhbnNwb3J0KHRyYW5zcG9ydHMsIDEpO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3JlY29ubmVjdCcpO1xuXHRcdFx0XHQvLyBTZXJ2ZXIgcmVwbGF5cyB3aXRoIG5vIGFjdGlvbnMgYnV0IHJlcG9ydHMgb3VyIHNlc3Npb25cblx0XHRcdFx0Ly8gc3Vic2NyaXB0aW9uIGFzIG5vLWxvbmdlci1yZXN1bWFibGUuXG5cdFx0XHRcdHJlY29ubmVjdFRyYW5zcG9ydC5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsIGlkOiByZWNvbm5lY3QuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHR5cGU6IFJlY29ubmVjdFJlc3VsdFR5cGUuUmVwbGF5LCBhY3Rpb25zOiBbXSwgbWlzc2luZzogW3Nlc3Npb25VcmkudG9TdHJpbmcoKV0gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXG5cdFx0XHRcdGFzc2VydC5vayhzdWJSZWYub2JqZWN0LnZhbHVlIGluc3RhbmNlb2YgRXJyb3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZERpc3BhdGNoQWN0aW9uKHJlY29ubmVjdFRyYW5zcG9ydCwgQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVNldCksIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQnYWN0aW9uIGZvciBhIG1pc3Npbmcgc3Vic2NyaXB0aW9uIG11c3Qgbm90IGJlIHJlcGxheWVkJyk7XG5cblx0XHRcdFx0c3ViUmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJhbnNwb3J0IGRyb3AgZHVyaW5nIHJlY29ubmVjdCBSUEMgcmUtc2NoZWR1bGVzIGluc3RlYWQgb2YgaGFuZ2luZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydHMgfSA9IGNyZWF0ZUZhY3RvcnlDbGllbnQoKTtcblx0XHRcdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0XHRhd2FpdCBjb21wbGV0ZUhhbmRzaGFrZSh0cmFuc3BvcnRzWzBdLCBjb25uZWN0UHJvbWlzZSk7XG5cblx0XHRcdFx0dHJhbnNwb3J0c1swXS5maXJlQ2xvc2UoKTtcblx0XHRcdFx0YXdhaXQgd2FpdEZvclJlY29ubmVjdGluZyhjbGllbnQpO1xuXHRcdFx0XHRjb25zdCBhdHRlbXB0MSA9IGF3YWl0IHdhaXRGb3JUcmFuc3BvcnQodHJhbnNwb3J0cywgMSk7XG5cdFx0XHRcdGF0dGVtcHQxLmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yUmVxdWVzdChhdHRlbXB0MSwgJ3JlY29ubmVjdCcpO1xuXG5cdFx0XHRcdC8vIFNlY29uZCBkcm9wIG1pZC1oYW5kc2hha2UuIFRoZSBhdHRlbXB0J3MgcGVuZGluZyBSUEMgbXVzdCBiZSByZWplY3RlZFxuXHRcdFx0XHQvLyBzbyB0aGUgcmV0cnkgcGF0aCBmaXJlczsgd2l0aG91dCB0aGF0IHRoZSBhd2FpdCBzdGF5cyBwZW5kaW5nIGFuZFxuXHRcdFx0XHQvLyBldmVyeSBzdWJzZXF1ZW50IHJlcXVlc3QgZGVhZGxvY2tzIG9uIHRoZSByZWNvbm5lY3QgZ2F0ZS5cblx0XHRcdFx0YXR0ZW1wdDEuZmlyZUNsb3NlKCk7XG5cblx0XHRcdFx0Y29uc3QgYXR0ZW1wdDIgPSBhd2FpdCB3YWl0Rm9yVHJhbnNwb3J0KHRyYW5zcG9ydHMsIDIpO1xuXHRcdFx0XHRhdHRlbXB0Mi5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0MiA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KGF0dGVtcHQyLCAncmVjb25uZWN0Jyk7XG5cdFx0XHRcdGF0dGVtcHQyLmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHJlY29ubmVjdDIuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHR5cGU6IFJlY29ubmVjdFJlc3VsdFR5cGUuUmVwbGF5LCBhY3Rpb25zOiBbXSwgbWlzc2luZzogW10gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnQuY29ubmVjdGlvblN0YXRlLCBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQsXG5cdFx0XHRcdFx0J2NsaWVudCBtdXN0IHJlY292ZXIgdG8gQ29ubmVjdGVkIGFmdGVyIGEgbWlkLXJlY29ubmVjdCBkcm9wJyk7XG5cdFx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vbi1zZXNzaW9uIGRpc3BhdGNoIGlzc3VlZCBkdXJpbmcgcmVjb25uZWN0IHJpZGVzIHJldHJpZXMgdW50aWwgc3VjY2VzcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBjbGllbnQsIHRyYW5zcG9ydHMgfSA9IGNyZWF0ZUZhY3RvcnlDbGllbnQoKTtcblx0XHRcdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBjbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0XHRhd2FpdCBjb21wbGV0ZUhhbmRzaGFrZSh0cmFuc3BvcnRzWzBdLCBjb25uZWN0UHJvbWlzZSk7XG5cblx0XHRcdFx0Ly8gRHJvcCB0cmFuc3BvcnQgYmVmb3JlIGFueSBzdWNjZXNzZnVsIHJlY29ubmVjdCBzbyB0aGUgZ2F0ZSBzdGF5c1xuXHRcdFx0XHQvLyBlbmdhZ2VkIGFjcm9zcyB0aGUgZmFpbGVkIGF0dGVtcHQuXG5cdFx0XHRcdHRyYW5zcG9ydHNbMF0uZmlyZUNsb3NlKCk7XG5cdFx0XHRcdGF3YWl0IHdhaXRGb3JSZWNvbm5lY3RpbmcoY2xpZW50KTtcblxuXHRcdFx0XHQvLyBBIHRlcm1pbmFsIGFjdGlvbiBkaXNwYXRjaGVkIHdoaWxlIHJlY29ubmVjdGluZy4gVGhlcmUgaXMgbm9cblx0XHRcdFx0Ly8gb3B0aW1pc3RpYyByZXBsYXkgcGF0aCBmb3IgdGVybWluYWwvcm9vdCBhY3Rpb25zOyB0aGUgb25seSB3YXlcblx0XHRcdFx0Ly8gdGhlc2UgcmVhY2ggdGhlIHNlcnZlciBpcyB2aWEgdGhlIG5vdGlmaWNhdGlvbiBnYXRlLlxuXHRcdFx0XHRjb25zdCB0ZXJtaW5hbFVyaSA9IFVSSS5wYXJzZSgnYWdlbnRob3N0LXRlcm1pbmFsOi90ZXJtLTEnKTtcblx0XHRcdFx0Y2xpZW50LmRpc3BhdGNoKHRlcm1pbmFsVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsSW5wdXQsXG5cdFx0XHRcdFx0ZGF0YTogJ2VjaG8gaGVsbG9cXG4nLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBGaXJzdCBhdHRlbXB0IGZhaWxzLiBUaGUgbm90aWZpY2F0aW9uIG11c3QgTk9UIGJlIGRyb3BwZWQ7IHRoZVxuXHRcdFx0XHQvLyByZWplY3Rpb24gaGFuZGxlciBzaG91bGQgcmUtcXVldWUgaXQgb250byB0aGUgbmV3IGdhdGUuXG5cdFx0XHRcdGNvbnN0IGF0dGVtcHQxID0gYXdhaXQgd2FpdEZvclRyYW5zcG9ydCh0cmFuc3BvcnRzLCAxKTtcblx0XHRcdFx0YXR0ZW1wdDEuY29ubmVjdERlZmVycmVkLmVycm9yKG5ldyBFcnJvcignY29ubmVjdCBmYWlsZWQnKSk7XG5cblx0XHRcdFx0Y29uc3QgYXR0ZW1wdDIgPSBhd2FpdCB3YWl0Rm9yVHJhbnNwb3J0KHRyYW5zcG9ydHMsIDIpO1xuXHRcdFx0XHRhdHRlbXB0Mi5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0MiA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KGF0dGVtcHQyLCAncmVjb25uZWN0Jyk7XG5cdFx0XHRcdGF0dGVtcHQyLmZpcmVNZXNzYWdlKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJywgaWQ6IHJlY29ubmVjdDIuaWQsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHR5cGU6IFJlY29ubmVjdFJlc3VsdFR5cGUuUmVwbGF5LCBhY3Rpb25zOiBbXSwgbWlzc2luZzogW10gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXG5cdFx0XHRcdGNvbnN0IGRpc3BhdGNoZWQgPSBmaW5kTm90aWZpY2F0aW9uKGF0dGVtcHQyLCAnZGlzcGF0Y2hBY3Rpb24nKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGRpc3BhdGNoZWQsICd0ZXJtaW5hbCBkaXNwYXRjaCBtdXN0IHJpZGUgdGhlIGZhaWxlZCBhdHRlbXB0IHRocm91Z2ggdG8gdGhlIG5leHQgc3VjY2Vzc2Z1bCBvbmUnKTtcblx0XHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVxdWVzdCBpc3N1ZWQgZHVyaW5nIHJlY29ubmVjdCByaWRlcyByZXRyaWVzIHVudGlsIHN1Y2Nlc3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTBfMDAwKTtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgY2xpZW50LCB0cmFuc3BvcnRzIH0gPSBjcmVhdGVGYWN0b3J5Q2xpZW50KCk7XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gY2xpZW50LmNvbm5lY3QoKTtcblx0XHRcdFx0YXdhaXQgY29tcGxldGVIYW5kc2hha2UodHJhbnNwb3J0c1swXSwgY29ubmVjdFByb21pc2UpO1xuXG5cdFx0XHRcdHRyYW5zcG9ydHNbMF0uZmlyZUNsb3NlKCk7XG5cdFx0XHRcdGF3YWl0IHdhaXRGb3JSZWNvbm5lY3RpbmcoY2xpZW50KTtcblxuXHRcdFx0XHQvLyBJc3N1ZSBhIHJlcXVlc3Qgd2hpbGUgdGhlIGdhdGUgaXMgZW5nYWdlZC4gVGhlIGZpcnN0IHJlY29ubmVjdFxuXHRcdFx0XHQvLyBhdHRlbXB0IHdpbGwgZmFpbDsgdGhlIHJlcXVlc3QgbXVzdCBOT1Qgc3VyZmFjZSB0aGUgdHJhbnNpZW50XG5cdFx0XHRcdC8vIGZhaWx1cmUgdG8gaXRzIGNhbGxlciwgaXQgc2hvdWxkIHN0YXkgZ2F0ZWQgdW50aWwgdGhlIG5leHRcblx0XHRcdFx0Ly8gc3VjY2Vzc2Z1bCBoYW5kc2hha2UuXG5cdFx0XHRcdGNvbnN0IGluRmxpZ2h0ID0gY2xpZW50LnJlc291cmNlTGlzdChVUkkuZmlsZSgnL3dvcmtzcGFjZScpKS5jYXRjaChlcnIgPT4gZXJyKTtcblxuXHRcdFx0XHRjb25zdCBhdHRlbXB0MSA9IGF3YWl0IHdhaXRGb3JUcmFuc3BvcnQodHJhbnNwb3J0cywgMSk7XG5cdFx0XHRcdGF0dGVtcHQxLmNvbm5lY3REZWZlcnJlZC5lcnJvcihuZXcgRXJyb3IoJ2Nvbm5lY3QgZmFpbGVkJykpO1xuXG5cdFx0XHRcdGNvbnN0IGF0dGVtcHQyID0gYXdhaXQgd2FpdEZvclRyYW5zcG9ydCh0cmFuc3BvcnRzLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRSZXF1ZXN0KGF0dGVtcHQyLCAncmVzb3VyY2VMaXN0JyksIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQncmVxdWVzdCBtdXN0IG5vdCBzbGlwIHRocm91Z2ggdG8gdGhlIG5ldyB0cmFuc3BvcnQgYmVmb3JlIGl0cyBoYW5kc2hha2UgY29tcGxldGVzJyk7XG5cblx0XHRcdFx0YXR0ZW1wdDIuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdDIgPSBhd2FpdCB3YWl0Rm9yUmVxdWVzdChhdHRlbXB0MiwgJ3JlY29ubmVjdCcpO1xuXHRcdFx0XHRhdHRlbXB0Mi5maXJlTWVzc2FnZSh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsIGlkOiByZWNvbm5lY3QyLmlkLFxuXHRcdFx0XHRcdHJlc3VsdDogeyB0eXBlOiBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheSwgYWN0aW9uczogW10sIG1pc3Npbmc6IFtdIH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc291cmNlTGlzdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KGF0dGVtcHQyLCAncmVzb3VyY2VMaXN0Jyk7XG5cdFx0XHRcdGF0dGVtcHQyLmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiByZXNvdXJjZUxpc3QuaWQsIHJlc3VsdDogeyBlbnRyaWVzOiBbXSB9IH0pO1xuXG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgaW5GbGlnaHQ7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmFsdWUsIHsgZW50cmllczogW10gfSxcblx0XHRcdFx0XHQncmVxdWVzdCBtdXN0IHJlc29sdmUgb25jZSBhIGxhdGVyIHJlY29ubmVjdCBhdHRlbXB0IHN1Y2NlZWRzJyk7XG5cdFx0XHRcdGNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ19zZW5kRXh0ZW5zaW9uUmVxdWVzdCB3YWl0cyBmb3IgdGhlIHJlY29ubmVjdCBnYXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0cyB9ID0gY3JlYXRlRmFjdG9yeUNsaWVudCgpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblxuXHRcdFx0XHR0cmFuc3BvcnRzWzBdLmZpcmVDbG9zZSgpO1xuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yUmVjb25uZWN0aW5nKGNsaWVudCk7XG5cdFx0XHRcdGNvbnN0IHNodXRkb3duID0gY2xpZW50LnNodXRkb3duKCkuY2F0Y2goZXJyID0+IGVycik7XG5cblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0VHJhbnNwb3J0ID0gYXdhaXQgd2FpdEZvclRyYW5zcG9ydCh0cmFuc3BvcnRzLCAxKTtcblx0XHRcdFx0Ly8gRXh0ZW5zaW9uIHJlcXVlc3RzIG11c3Qgbm90IHJhY2UgdGhlIGRlYWQgdHJhbnNwb3J0IFx1MjAxNCBub3RoaW5nXG5cdFx0XHRcdC8vIHNob3VsZCBiZSBvbiB0aGUgd2lyZSB5ZXQuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kUmVxdWVzdChyZWNvbm5lY3RUcmFuc3BvcnQsICdzaHV0ZG93bicpLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0J3NodXRkb3duIGV4dGVuc2lvbiByZXF1ZXN0IG11c3QgTk9UIGJlIHNlbnQgYmVmb3JlIHJlY29ubmVjdCBjb21wbGV0ZXMnKTtcblxuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGNvbnN0IHJlY29ubmVjdCA9IGF3YWl0IHdhaXRGb3JSZXF1ZXN0KHJlY29ubmVjdFRyYW5zcG9ydCwgJ3JlY29ubmVjdCcpO1xuXHRcdFx0XHRyZWNvbm5lY3RUcmFuc3BvcnQuZmlyZU1lc3NhZ2Uoe1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLCBpZDogcmVjb25uZWN0LmlkLFxuXHRcdFx0XHRcdHJlc3VsdDogeyB0eXBlOiBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheSwgYWN0aW9uczogW10sIG1pc3Npbmc6IFtdIH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHNodXRkb3duUmVxID0gYXdhaXQgd2FpdEZvclJlcXVlc3QocmVjb25uZWN0VHJhbnNwb3J0LCAnc2h1dGRvd24nKTtcblx0XHRcdFx0cmVjb25uZWN0VHJhbnNwb3J0LmZpcmVNZXNzYWdlKHsganNvbnJwYzogJzIuMCcsIGlkOiBzaHV0ZG93blJlcS5pZCwgcmVzdWx0OiBudWxsIH0pO1xuXHRcdFx0XHRhd2FpdCBzaHV0ZG93bjtcblx0XHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2F0Y2hkb2cgZGVhZC10cmFuc3BvcnQgZGV0ZWN0aW9uIHRyaWdnZXJzIHNvZnQgcmVjb25uZWN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGhpcy50aW1lb3V0KDYwXzAwMCk7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGNsaWVudCwgdHJhbnNwb3J0cyB9ID0gY3JlYXRlRmFjdG9yeUNsaWVudCgpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IGNsaWVudC5jb25uZWN0KCk7XG5cdFx0XHRcdGF3YWl0IGNvbXBsZXRlSGFuZHNoYWtlKHRyYW5zcG9ydHNbMF0sIGNvbm5lY3RQcm9taXNlKTtcblxuXHRcdFx0XHQvLyBJc3N1ZSBhIHJlcXVlc3QgdGhlIHNlcnZlciBuZXZlciBhbnN3ZXJzLiBBZnRlciBXQVRDSERPR19USU1FT1VUX01TXG5cdFx0XHRcdC8vIG9mIHNpbGVuY2UgdGhlIHdhdGNoZG9nIG11c3Qgcm91dGUgdGhyb3VnaCB0aGUgc29mdC1yZWNvbm5lY3Rcblx0XHRcdFx0Ly8gcGF0aCBcdTIwMTQgKm5vdCogcmVseSBvbiB0aGUgdHJhbnNwb3J0J3Mgb25DbG9zZSBmaXJpbmcgKGl0IG5ldmVyXG5cdFx0XHRcdC8vIHdpbGwgZm9yIGEgc2lsZW50IGRlYWQgc29ja2V0LCBzZWUgV2ViU29ja2V0Q2xpZW50VHJhbnNwb3J0LmRpc3Bvc2UpLlxuXHRcdFx0XHRjb25zdCBwZW5kaW5nID0gY2xpZW50LnJlc291cmNlTGlzdChVUkkuZmlsZSgnL3dvcmtzcGFjZScpKS5jYXRjaChlcnIgPT4gZXJyKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgzMF8wMDApO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnQuY29ubmVjdGlvblN0YXRlLCBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcsXG5cdFx0XHRcdFx0J3dhdGNoZG9nIG11c3QgZHJpdmUgdGhlIGNsaWVudCBpbnRvIFJlY29ubmVjdGluZyB2aWEgc29mdCByZWNvbm5lY3QgcmF0aGVyIHRoYW4gZmlyaW5nIG9uRGlkQ2xvc2UnKTtcblxuXHRcdFx0XHRjb25zdCBlcnIgPSBhd2FpdCBwZW5kaW5nO1xuXHRcdFx0XHRhc3NlcnQub2soZXJyIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvcik7XG5cdFx0XHRcdGFzc2VydC5tYXRjaCgoZXJyIGFzIFByb3RvY29sRXJyb3IpLm1lc3NhZ2UsIC9Db25uZWN0aW9uIGFwcGVhcnMgZGVhZC8pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBc0Isc0JBQXNCO0FBQzVDLFNBQVMsc0JBQXNCLHFDQUFxQztBQUNwRSxTQUFTLHlCQUFvRCxrQ0FBNkQsMENBQTBDO0FBQ3BLLFNBQVMsMkJBQXFEO0FBQzlELFNBQVMsaUJBQWlCLDJCQUEyQjtBQUNyRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtCQUFrQixtQ0FBbUM7QUFDOUQsU0FBUyxrQkFBd0o7QUFDakssU0FBUyxxQkFBNEk7QUFDckosU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMscUJBQXFCLG1CQUFtQix1QkFBdUIsYUFBYSxvQkFBb0IscUJBQXFCLDBCQUEwQixnQkFBZ0IsZUFBZSxpQkFBaUIsaUJBQWlCLHFCQUFxQixnQ0FBZ0M7QUFDOVEsU0FBUyxzQ0FBc0Y7QUFDL0YsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBNEIsc0JBQXNCO0FBQ2xE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
