import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { IDialogService } from "../../../dialogs/common/dialogs.js";
import { INotificationService, Severity } from "../../../notification/common/notification.js";
import { TestNotificationService } from "../../../notification/test/common/testNotificationService.js";
import { IProductService } from "../../../product/common/productService.js";
import { ISharedProcessService } from "../../../ipc/electron-browser/services.js";
import { IQuickInputService } from "../../../quickinput/common/quickInput.js";
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from "../../common/remoteAgentHostService.js";
import { AHP_UNSUPPORTED_PROTOCOL_VERSION, ProtocolError } from "../../common/state/sessionProtocol.js";
import { IRemoteAgentHostLocationPreferenceService } from "../../common/remoteAgentHostLocationPreference.js";
import { ISSHHostKeyTrustService } from "../../common/sshHostKeyTrust.js";
import { SSHHostKeyTrustService } from "../../browser/sshHostKeyTrustService.js";
import { InMemoryStorageService } from "../../../storage/common/storage.js";
import { PROTOCOL_VERSION } from "../../common/state/protocol/version/registry.js";
import { ISSHRelayClientFactory, SSHRemoteAgentHostService } from "../../electron-browser/sshRemoteAgentHostServiceImpl.js";
class MockSSHMainService {
  constructor() {
    this._onDidChangeConnections = new Emitter();
    this.onDidChangeConnections = this._onDidChangeConnections.event;
    this._onDidCloseConnection = new Emitter();
    this.onDidCloseConnection = this._onDidCloseConnection.event;
    this._onDidReportConnectProgress = new Emitter();
    this.onDidReportConnectProgress = this._onDidReportConnectProgress.event;
    this._onDidRelayMessage = new Emitter();
    this.onDidRelayMessage = this._onDidRelayMessage.event;
    this._onDidRelayClose = new Emitter();
    this.onDidRelayClose = this._onDidRelayClose.event;
    this._onDidRequestKeyboardInteractive = new Emitter();
    this.onDidRequestKeyboardInteractive = this._onDidRequestKeyboardInteractive.event;
    this._onDidCancelKeyboardInteractive = new Emitter();
    this.onDidCancelKeyboardInteractive = this._onDidCancelKeyboardInteractive.event;
    this.kbiResponses = [];
    this._onDidRequestEndpointSelection = new Emitter();
    this.onDidRequestEndpointSelection = this._onDidRequestEndpointSelection.event;
    this._onDidCancelEndpointSelection = new Emitter();
    this.onDidCancelEndpointSelection = this._onDidCancelEndpointSelection.event;
    this._onDidRequestHostKeyVerification = new Emitter();
    this.onDidRequestHostKeyVerification = this._onDidRequestHostKeyVerification.event;
    this._onDidCancelHostKeyVerification = new Emitter();
    this.onDidCancelHostKeyVerification = this._onDidCancelHostKeyVerification.event;
    this._onDidAnnounceHostKeys = new Emitter();
    this.onDidAnnounceHostKeys = this._onDidAnnounceHostKeys.event;
    this.hostKeyResponses = [];
    this._hostKeyResponseWaiters = [];
    this.endpointSelectionResponses = [];
    this._endpointSelectionResponseWaiters = [];
    this.disconnectCalls = [];
    this.connectCalls = [];
    this.reconnectCalls = [];
    this._nextConnectionId = 1;
  }
  async respondKeyboardInteractive(requestId, responses) {
    this.kbiResponses.push({ requestId, responses });
  }
  async respondHostKeyVerification(requestId, trusted) {
    this.hostKeyResponses.push({ requestId, trusted });
    this._hostKeyResponseWaiters.splice(0).forEach((waiter) => waiter.complete());
  }
  /** Test helper: fire a host key verification request as the shared process would. */
  fireHostKeyVerificationRequest(request) {
    this._onDidRequestHostKeyVerification.fire(request);
  }
  /** Test helper: cancel a host key verification as the shared process would. */
  fireHostKeyVerificationCancel(requestId) {
    this._onDidCancelHostKeyVerification.fire(requestId);
  }
  /** Test helper: fire a host key announcement as the shared process would. */
  fireHostKeysAnnouncement(announcement) {
    this._onDidAnnounceHostKeys.fire(announcement);
  }
  /** Test helper: resolves once {@link respondHostKeyVerification} is next called. */
  waitForHostKeyResponse() {
    const deferred = new DeferredPromise();
    this._hostKeyResponseWaiters.push(deferred);
    return deferred.p;
  }
  /** Test helper: fire an endpoint-selection request as the main process would. */
  fireEndpointSelectionRequest(request) {
    this._onDidRequestEndpointSelection.fire(request);
  }
  /** Test helper: fire an endpoint-selection cancellation as the main process would. */
  fireEndpointSelectionCancel(requestId) {
    this._onDidCancelEndpointSelection.fire(requestId);
  }
  /** Test helper: resolves once {@link respondEndpointSelection} is next called. */
  waitForEndpointSelectionResponse() {
    const deferred = new DeferredPromise();
    this._endpointSelectionResponseWaiters.push(deferred);
    return deferred.p;
  }
  async respondEndpointSelection(requestId, selection) {
    this.endpointSelectionResponses.push({ requestId, selection });
    this._endpointSelectionResponseWaiters.splice(0).forEach((d) => d.complete());
  }
  async connect(config) {
    this.connectCalls.push(config);
    const connectionId = this.connectResult?.connectionId ?? `conn-${this._nextConnectionId++}`;
    return {
      connectionId,
      address: this.connectResult?.address ?? `ssh:${config.host}`,
      name: config.name,
      connectionToken: "test-token",
      config: { host: config.host, username: config.username, authMethod: config.authMethod, name: config.name, sshConfigHost: config.sshConfigHost },
      sshConfigHost: config.sshConfigHost,
      serverType: this.connectResult?.serverType
    };
  }
  async reconnect(sshConfigHost, name, remoteAgentHostCommand, agentForward, userInitiated, preferredAgentLocation) {
    this.reconnectCalls.push({ sshConfigHost, name, remoteAgentHostCommand, agentForward, userInitiated, preferredAgentLocation });
    return {
      connectionId: this.connectResult?.connectionId ?? `conn-${this._nextConnectionId++}`,
      address: this.connectResult?.address ?? `ssh:${sshConfigHost}`,
      name,
      connectionToken: "test-token",
      config: { host: sshConfigHost, username: "u", authMethod: 0, name, sshConfigHost },
      sshConfigHost,
      serverType: this.connectResult?.serverType
    };
  }
  async relaySend(_connectionId, _message) {
  }
  async disconnect(connectionId) {
    this.disconnectCalls.push(connectionId);
  }
  async listSSHConfigHosts() {
    return [];
  }
  async ensureUserSSHConfig() {
    return URI.file("/tmp/ssh-config");
  }
  async listSSHConfigFiles() {
    return [URI.file("/tmp/ssh-config")];
  }
  async resolveSSHConfig(_host) {
    return { hostname: "", user: void 0, port: 22, identityFile: [], identityAgent: void 0, forwardAgent: false, userKnownHostsFiles: [], globalKnownHostsFiles: [], strictHostKeyChecking: void 0 };
  }
  dispose() {
    this._onDidChangeConnections.dispose();
    this._onDidCloseConnection.dispose();
    this._onDidReportConnectProgress.dispose();
    this._onDidRelayMessage.dispose();
    this._onDidRelayClose.dispose();
    this._onDidRequestKeyboardInteractive.dispose();
    this._onDidCancelKeyboardInteractive.dispose();
    this._onDidRequestEndpointSelection.dispose();
    this._onDidCancelEndpointSelection.dispose();
    this._onDidRequestHostKeyVerification.dispose();
    this._onDidCancelHostKeyVerification.dispose();
    this._onDidAnnounceHostKeys.dispose();
  }
}
function asChannel(target) {
  return {
    call: async (method, args) => {
      const fn = target[method];
      if (typeof fn !== "function") {
        throw new Error(`MockChannel: no method ${method}`);
      }
      return fn.apply(target, args ?? []);
    },
    listen: (event) => {
      const ev = target[event];
      if (typeof ev !== "function") {
        throw new Error(`MockChannel: no event ${event}`);
      }
      return ev;
    }
  };
}
class MockRemoteAgentHostService extends Disposable {
  constructor() {
    super(...arguments);
    this.added = [];
    this._entries = /* @__PURE__ */ new Map();
    // Holds transport disposables from prior registrations that were
    // replaced by a later `addManagedConnection` for the same address.
    // Production deliberately does NOT run them at replacement time (doing
    // so would call _mainService.disconnect on the brand-new tunnel and
    // kill it). They are released when the service itself is disposed.
    this._abandonedTransports = [];
  }
  async addManagedConnection(entry, client, transportDisposable, status = RemoteAgentHostConnectionStatus.connected) {
    const address = entry.connection.address ?? `ssh:${entry.connection.sshConfigHost}`;
    const previous = this._entries.get(address);
    if (previous) {
      previous.client.dispose?.();
      if (previous.transport) {
        this._abandonedTransports.push(previous.transport);
      }
    }
    this.added.push({ address, status, transport: transportDisposable });
    this._entries.set(address, { client, transport: transportDisposable, status });
    return { address, name: entry.name, clientId: "mock", defaultDirectory: void 0, status };
  }
  /** Mirrors IRemoteAgentHostService.getConnection: returns the client only when the entry is connected. */
  getConnection(address) {
    const entry = this._entries.get(address);
    return entry && RemoteAgentHostConnectionStatus.isConnected(entry.status) ? entry.client : void 0;
  }
  notifyConnectionClosed(_address) {
  }
  /** Simulate user clicking "Remove Remote": disposes the per-entry store, which runs the transport disposable. */
  removeEntry(address) {
    const e = this._entries.get(address);
    if (!e) {
      return;
    }
    this._entries.delete(address);
    e.client.dispose?.();
    e.transport?.dispose();
  }
  dispose() {
    for (const [, e] of this._entries) {
      e.client.dispose?.();
      e.transport?.dispose();
    }
    this._entries.clear();
    for (const t of this._abandonedTransports) {
      t.dispose();
    }
    this._abandonedTransports.length = 0;
    super.dispose();
  }
}
class MockProtocolClient extends Disposable {
  constructor() {
    super(...arguments);
    this.clientId = "mock-protocol-client";
    this.onDidClose = Event.None;
    this.onDidAction = Event.None;
    this.onDidNotification = Event.None;
    this.connectDeferred = new DeferredPromise();
  }
  async connect() {
    return this.connectDeferred.p;
  }
  registerOwned(d) {
    return this._register(d);
  }
}
class TestConfigurationService {
  constructor(_remoteAgentHostsEnabled = true) {
    this._remoteAgentHostsEnabled = _remoteAgentHostsEnabled;
    this.onDidChangeConfiguration = Event.None;
  }
  getValue(key) {
    return key === RemoteAgentHostsEnabledSettingId ? this._remoteAgentHostsEnabled : void 0;
  }
  setRemoteAgentHostsEnabled(enabled) {
    this._remoteAgentHostsEnabled = enabled;
  }
}
class CapturingNotificationService extends TestNotificationService {
  constructor() {
    super(...arguments);
    this.infoMessages = [];
    this.notifications = [];
  }
  info(message) {
    this.infoMessages.push(message);
    return super.info(message);
  }
  notify(notification) {
    this.notifications.push(notification);
    return super.notify(notification);
  }
}
class TestRemoteAgentHostLocationPreferenceService {
  constructor() {
    this._preferences = /* @__PURE__ */ new Map();
    this._onDidChangePreference = new Emitter();
    this.onDidChangePreference = this._onDidChangePreference.event;
  }
  getPreference(hostKey) {
    return this._preferences.get(hostKey);
  }
  setPreference(hostKey, preference) {
    this._preferences.set(hostKey, preference);
    this._onDidChangePreference.fire(hostKey);
  }
  dispose() {
    this._onDidChangePreference.dispose();
  }
}
suite("SSHRemoteAgentHostService (renderer)", () => {
  const disposables = new DisposableStore();
  let mainService;
  let remoteAgentHostService;
  let configurationService;
  let notificationService;
  let createdClients;
  let waitForClient;
  let service;
  let quickInputServiceStub;
  let locationPreferenceService;
  let hostKeyTrustService;
  setup(() => {
    mainService = new MockSSHMainService();
    disposables.add({ dispose: () => mainService.dispose() });
    remoteAgentHostService = disposables.add(new MockRemoteAgentHostService());
    createdClients = [];
    const sharedProcessService = {
      getChannel: () => asChannel(mainService)
    };
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(ILogService, new NullLogService());
    configurationService = new TestConfigurationService();
    instantiationService.stub(IConfigurationService, configurationService);
    quickInputServiceStub = {};
    instantiationService.stub(IQuickInputService, quickInputServiceStub);
    instantiationService.stub(ISharedProcessService, sharedProcessService);
    instantiationService.stub(IRemoteAgentHostService, remoteAgentHostService);
    notificationService = new CapturingNotificationService();
    instantiationService.stub(INotificationService, notificationService);
    locationPreferenceService = disposables.add(new TestRemoteAgentHostLocationPreferenceService());
    instantiationService.stub(IRemoteAgentHostLocationPreferenceService, locationPreferenceService);
    instantiationService.stub(IDialogService, {
      prompt: (() => {
        throw new Error("unexpected dialogService.prompt call");
      })
    });
    instantiationService.stub(IProductService, { _serviceBrand: void 0, nameShort: "Test Product" });
    hostKeyTrustService = disposables.add(new SSHHostKeyTrustService(disposables.add(new InMemoryStorageService())));
    instantiationService.stub(ISSHHostKeyTrustService, hostKeyTrustService);
    const clientWaiters = [];
    waitForClient = (index) => {
      if (createdClients[index]) {
        return Promise.resolve(createdClients[index]);
      }
      return (clientWaiters[index] ??= new DeferredPromise()).p;
    };
    instantiationService.stub(ISSHRelayClientFactory, {
      createClient: (_mainService, _connectionId, _address) => {
        const c = new MockProtocolClient();
        disposables.add(c);
        const index = createdClients.length;
        createdClients.push(c);
        clientWaiters[index]?.complete(c);
        return c;
      }
    });
    service = disposables.add(instantiationService.createInstance(SSHRemoteAgentHostService));
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  const sampleConfig = {
    host: "remote.example",
    username: "user",
    authMethod: 0,
    name: "My Remote",
    sshConfigHost: "remote.example"
  };
  async function awaitClientThenResolve(index) {
    const client = await waitForClient(index);
    client.connectDeferred.complete();
  }
  test("connect registers a managed connection with a transport disposable", async () => {
    const connectPromise = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    const handle = await connectPromise;
    assert.strictEqual(remoteAgentHostService.added.length, 1);
    assert.strictEqual(remoteAgentHostService.added[0].address, "ssh:remote.example");
    assert.strictEqual(remoteAgentHostService.added[0].status?.kind, "connected");
    assert.ok(remoteAgentHostService.added[0].transport, "a transport disposable is passed so removal can tear down the SSH tunnel");
    assert.strictEqual(service.connections.length, 1);
    assert.strictEqual(handle.localAddress, "ssh:remote.example");
  });
  test("connect threads the stored location preference for the stable connection key into the main-process config", async () => {
    locationPreferenceService.setPreference("ssh:remote.example", "editor");
    const connectPromise = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await connectPromise;
    assert.strictEqual(mainService.connectCalls.length, 1);
    assert.strictEqual(mainService.connectCalls[0].preferredAgentLocation, "editor");
  });
  test("connect omits preferredAgentLocation from the main-process config when no preference is stored", async () => {
    const connectPromise = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await connectPromise;
    assert.strictEqual(mainService.connectCalls.length, 1);
    assert.strictEqual(mainService.connectCalls[0].preferredAgentLocation, void 0);
  });
  test("reconnect threads the stored location preference for sshConfigHost into the main-process reconnect call", async () => {
    locationPreferenceService.setPreference("ssh:remote.example", "dedicated");
    const reconnectPromise = service.reconnect("remote.example", "My Remote");
    await awaitClientThenResolve(0);
    await reconnectPromise;
    assert.strictEqual(mainService.reconnectCalls.length, 1);
    assert.strictEqual(mainService.reconnectCalls[0].sshConfigHost, "remote.example");
    assert.strictEqual(mainService.reconnectCalls[0].preferredAgentLocation, "dedicated");
  });
  test("reconnect omits preferredAgentLocation from the main-process call when no preference is stored", async () => {
    const reconnectPromise = service.reconnect("remote.example", "My Remote");
    await awaitClientThenResolve(0);
    await reconnectPromise;
    assert.strictEqual(mainService.reconnectCalls.length, 1);
    assert.strictEqual(mainService.reconnectCalls[0].preferredAgentLocation, void 0);
  });
  test("connect uses the preference for its own stable connection key, not an unrelated host's", async () => {
    locationPreferenceService.setPreference("ssh:remote.example", "editor");
    locationPreferenceService.setPreference("ssh:other.example", "dedicated");
    const connectPromise = service.connect({ ...sampleConfig, host: "other.example", sshConfigHost: "other.example" });
    await awaitClientThenResolve(0);
    await connectPromise;
    assert.strictEqual(mainService.connectCalls[0].preferredAgentLocation, "dedicated", "must use the preference for this config's own key, not an unrelated host's");
  });
  test("incompatible handshake keeps SSH tunnel registered for server upgrade", async () => {
    const connectPromise = service.connect(sampleConfig);
    const client = await waitForClient(0);
    await client.connectDeferred.error(new ProtocolError(
      AHP_UNSUPPORTED_PROTOCOL_VERSION,
      "Unsupported protocol version",
      { supportedVersions: ["^0.2.0"], _meta: { vscodeUpgradeMethod: "_vscodeUpgrade" } }
    ));
    await assert.rejects(connectPromise, /Unsupported protocol version/);
    assert.deepStrictEqual({
      added: remoteAgentHostService.added.map(({ address, status }) => ({ address, status })),
      connections: service.connections.map((connection) => connection.localAddress),
      disconnectCalls: mainService.disconnectCalls
    }, {
      added: [{
        address: "ssh:remote.example",
        status: RemoteAgentHostConnectionStatus.incompatible("Unsupported protocol version", [PROTOCOL_VERSION], ["^0.2.0"], "_vscodeUpgrade")
      }],
      connections: ["ssh:remote.example"],
      disconnectCalls: []
    });
  });
  test("reconnect after incompatible handshake replaces the stale handle and re-handshakes", async () => {
    mainService.connectResult = { connectionId: "conn-stable", address: "ssh:remote.example" };
    const firstConnect = service.connect(sampleConfig);
    const firstClient = await waitForClient(0);
    await firstClient.connectDeferred.error(new ProtocolError(
      AHP_UNSUPPORTED_PROTOCOL_VERSION,
      "Unsupported protocol version",
      { supportedVersions: ["^0.2.0"], _meta: { vscodeUpgradeMethod: "_vscodeUpgrade" } }
    ));
    await assert.rejects(firstConnect, /Unsupported protocol version/);
    const reconnectPromise = service.reconnect("remote.example", "My Remote");
    const secondClient = await waitForClient(1);
    await secondClient.connectDeferred.complete();
    await reconnectPromise;
    assert.deepStrictEqual({
      clientCount: createdClients.length,
      added: remoteAgentHostService.added.map(({ address, status }) => ({ address, statusKind: status?.kind })),
      // The replaceRelay path keeps the SSH tunnel alive — we must not
      // have asked the main service to disconnect it.
      disconnectCalls: mainService.disconnectCalls,
      // Exactly one renderer-side handle for the address.
      connections: service.connections.map((connection) => connection.localAddress)
    }, {
      clientCount: 2,
      added: [
        { address: "ssh:remote.example", statusKind: "incompatible" },
        { address: "ssh:remote.example", statusKind: "connected" }
      ],
      disconnectCalls: [],
      connections: ["ssh:remote.example"]
    });
  });
  test("disabled setting prevents SSH tunnel connects and reconnects", async () => {
    configurationService.setRemoteAgentHostsEnabled(false);
    await assert.rejects(() => service.connect(sampleConfig), /not enabled/);
    await assert.rejects(() => service.reconnect("remote.example", "My Remote"), /not enabled/);
    assert.deepStrictEqual({ connectCalls: mainService.connectCalls, reconnectCalls: mainService.reconnectCalls, added: remoteAgentHostService.added }, {
      connectCalls: [],
      reconnectCalls: [],
      added: []
    });
  });
  test("removing the entry tears down the SSH tunnel and the renderer-side handle", async () => {
    const connectPromise = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await connectPromise;
    assert.strictEqual(mainService.disconnectCalls.length, 0);
    assert.strictEqual(service.connections.length, 1);
    remoteAgentHostService.removeEntry("ssh:remote.example");
    assert.deepStrictEqual(mainService.disconnectCalls, ["conn-1"], "main-process tunnel is told to disconnect");
    assert.strictEqual(service.connections.length, 0, "renderer-side handle is dropped");
  });
  test("connect after removal does not reuse the previous handle", async () => {
    const c1 = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await c1;
    remoteAgentHostService.removeEntry("ssh:remote.example");
    assert.strictEqual(service.connections.length, 0);
    mainService.connectResult = { connectionId: "conn-2", address: "ssh:remote.example" };
    const c2 = service.connect(sampleConfig);
    await awaitClientThenResolve(1);
    await c2;
    assert.strictEqual(service.connections.length, 1);
    assert.strictEqual(remoteAgentHostService.added.length, 2, "each connect produces a fresh managed-connection registration");
  });
  test("main-process onDidCloseConnection cleans up renderer handle without double-disconnecting", async () => {
    const connectPromise = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await connectPromise;
    assert.strictEqual(service.connections.length, 1);
    mainService._onDidCloseConnection.fire("conn-1");
    assert.strictEqual(service.connections.length, 0, "handle dropped on main close");
    remoteAgentHostService.removeEntry("ssh:remote.example");
    assert.ok(mainService.disconnectCalls.length <= 1, "no duplicate disconnect against a stale connectionId");
  });
  const NOTIFICATION_MESSAGE = "The editor agent host exited. Reconnected to a dedicated agent host. In-progress work may have been interrupted.";
  function fireMainProcessClose(connectionId) {
    mainService._onDidCloseConnection.fire(connectionId);
  }
  test("initial connect never notifies, even when it lands on a standalone endpoint", async () => {
    mainService.connectResult = { serverType: "standalone" };
    const c1 = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await c1;
    assert.deepStrictEqual(notificationService.infoMessages, []);
  });
  test("an automatic/background reconnect that fails over from an editor-owned endpoint to a standalone endpoint shows exactly one notification", async () => {
    mainService.connectResult = { serverType: "editor" };
    const c1 = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await c1;
    assert.deepStrictEqual(notificationService.infoMessages, [], "no notification on initial connect");
    fireMainProcessClose("conn-1");
    assert.strictEqual(service.connections.length, 0);
    mainService.connectResult = { connectionId: "conn-2", serverType: "standalone" };
    const r = service.reconnect("remote.example", "My Remote", false);
    await awaitClientThenResolve(1);
    await r;
    assert.deepStrictEqual(notificationService.infoMessages, [NOTIFICATION_MESSAGE]);
  });
  test("a user-initiated reconnect from an editor-owned endpoint to a standalone endpoint does not notify", async () => {
    mainService.connectResult = { serverType: "editor" };
    const c1 = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await c1;
    fireMainProcessClose("conn-1");
    mainService.connectResult = { connectionId: "conn-2", serverType: "standalone" };
    const r = service.reconnect(
      "remote.example",
      "My Remote",
      /* userInitiated */
      true
    );
    await awaitClientThenResolve(1);
    await r;
    assert.deepStrictEqual(notificationService.infoMessages, []);
  });
  test("reconnect without an explicit userInitiated argument defaults to user-initiated and does not notify", async () => {
    mainService.connectResult = { serverType: "editor" };
    const c1 = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await c1;
    fireMainProcessClose("conn-1");
    mainService.connectResult = { connectionId: "conn-2", serverType: "standalone" };
    const r = service.reconnect("remote.example", "My Remote");
    await awaitClientThenResolve(1);
    await r;
    assert.deepStrictEqual(notificationService.infoMessages, []);
  });
  test("an automatic reconnect that stays on an editor-owned endpoint does not notify", async () => {
    mainService.connectResult = { serverType: "editor" };
    const c1 = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await c1;
    fireMainProcessClose("conn-1");
    mainService.connectResult = { connectionId: "conn-2", serverType: "editor" };
    const r = service.reconnect("remote.example", "My Remote", false);
    await awaitClientThenResolve(1);
    await r;
    assert.deepStrictEqual(notificationService.infoMessages, []);
  });
  test("an automatic reconnect that stays on a standalone endpoint does not notify", async () => {
    mainService.connectResult = { serverType: "standalone" };
    const c1 = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await c1;
    fireMainProcessClose("conn-1");
    mainService.connectResult = { connectionId: "conn-2", serverType: "standalone" };
    const r = service.reconnect("remote.example", "My Remote", false);
    await awaitClientThenResolve(1);
    await r;
    assert.deepStrictEqual(notificationService.infoMessages, []);
  });
  test("a failed (incompatible) automatic reconnect does not notify even though it targets a standalone endpoint", async () => {
    mainService.connectResult = { serverType: "editor" };
    const c1 = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await c1;
    fireMainProcessClose("conn-1");
    mainService.connectResult = { connectionId: "conn-2", serverType: "standalone" };
    const r = service.reconnect("remote.example", "My Remote", false);
    const client = await waitForClient(1);
    await client.connectDeferred.error(new ProtocolError(
      AHP_UNSUPPORTED_PROTOCOL_VERSION,
      "Unsupported protocol version",
      { supportedVersions: ["^0.2.0"], _meta: { vscodeUpgradeMethod: "_vscodeUpgrade" } }
    ));
    await assert.rejects(r, /Unsupported protocol version/);
    assert.deepStrictEqual(notificationService.infoMessages, []);
  });
  test("a duplicate setup that reuses an already-connected handle does not notify", async () => {
    mainService.connectResult = { connectionId: "conn-1", serverType: "editor" };
    const c1 = service.connect(sampleConfig);
    await awaitClientThenResolve(0);
    await c1;
    const c2 = service.connect(sampleConfig);
    await c2;
    assert.strictEqual(createdClients.length, 1, "no second protocol client is created for the duplicate setup");
    assert.deepStrictEqual(notificationService.infoMessages, []);
  });
});
suite("SSHRemoteAgentHostService endpoint selection preference (renderer)", () => {
  const disposables = new DisposableStore();
  let mainService;
  let locationPreferenceService;
  let dialogServiceStub;
  setup(() => {
    mainService = new MockSSHMainService();
    disposables.add({ dispose: () => mainService.dispose() });
    const sharedProcessService = {
      getChannel: () => asChannel(mainService)
    };
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IQuickInputService, {});
    instantiationService.stub(ISharedProcessService, sharedProcessService);
    instantiationService.stub(IRemoteAgentHostService, disposables.add(new MockRemoteAgentHostService()));
    instantiationService.stub(INotificationService, new CapturingNotificationService());
    instantiationService.stub(ISSHRelayClientFactory, {
      createClient: () => disposables.add(new MockProtocolClient())
    });
    locationPreferenceService = disposables.add(new TestRemoteAgentHostLocationPreferenceService());
    instantiationService.stub(IRemoteAgentHostLocationPreferenceService, locationPreferenceService);
    instantiationService.stub(ISSHHostKeyTrustService, disposables.add(new SSHHostKeyTrustService(disposables.add(new InMemoryStorageService()))));
    dialogServiceStub = {
      prompt: (() => {
        throw new Error("unexpected dialogService.prompt call");
      })
    };
    instantiationService.stub(IDialogService, dialogServiceStub);
    instantiationService.stub(IProductService, { _serviceBrand: void 0, nameShort: "Test Product" });
    disposables.add(instantiationService.createInstance(SSHRemoteAgentHostService));
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  const connectionKey = "ssh:remote.example";
  const editorCandidate = {
    type: "editor",
    pid: 111,
    instanceId: "editor-instance-2",
    quality: "stable",
    endpoint: { type: "socket", path: "/run/agent-host/editor-111.sock" }
  };
  const otherEditorCandidate = {
    type: "editor",
    pid: 333,
    instanceId: "editor-instance-1",
    endpoint: { type: "socket", path: "/run/agent-host/editor-333.sock" }
  };
  const standaloneCandidate = {
    type: "standalone",
    pid: 222,
    instanceId: "standalone-instance-2",
    endpoint: { type: "tcp", host: "127.0.0.1", port: 43210 }
  };
  const otherStandaloneCandidate = {
    type: "standalone",
    pid: 444,
    instanceId: "standalone-instance-1",
    endpoint: { type: "tcp", host: "127.0.0.1", port: 43211 }
  };
  function makeRequest(candidates, key = connectionKey) {
    return { requestId: "req-1", connectionKey: key, displayHost: "remote.example", candidates };
  }
  test('no stored preference with a live editor shows the shared modal and persists a chosen "editor" preference', async () => {
    dialogServiceStub.prompt = (async () => ({ result: "editor" }));
    mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: { kind: "candidate", type: "editor", pid: 111, instanceId: "editor-instance-2" } }
    ]);
    assert.strictEqual(locationPreferenceService.getPreference(connectionKey), "editor");
  });
  test('no stored preference with a live editor shows the shared modal and persists a chosen "dedicated" preference', async () => {
    dialogServiceStub.prompt = (async () => ({ result: "dedicated" }));
    mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: { kind: "candidate", type: "standalone", pid: 222, instanceId: "standalone-instance-2" } }
    ]);
    assert.strictEqual(locationPreferenceService.getPreference(connectionKey), "dedicated");
  });
  test("no stored preference and no live editor resolves to a dedicated selection without prompting or persisting anything", async () => {
    mainService.fireEndpointSelectionRequest(makeRequest([standaloneCandidate]));
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: { kind: "candidate", type: "standalone", pid: 222, instanceId: "standalone-instance-2" } }
    ]);
    assert.strictEqual(locationPreferenceService.getPreference(connectionKey), void 0);
  });
  test("no stored preference and no live candidates at all spawns a new dedicated host without prompting", async () => {
    mainService.fireEndpointSelectionRequest(makeRequest([]));
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: { kind: "spawn" } }
    ]);
    assert.strictEqual(locationPreferenceService.getPreference(connectionKey), void 0);
  });
  test('a stored "editor" preference bypasses the modal and resolves to the live editor candidate', async () => {
    locationPreferenceService.setPreference(connectionKey, "editor");
    mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: { kind: "candidate", type: "editor", pid: 111, instanceId: "editor-instance-2" } }
    ]);
  });
  test('a stored "dedicated" preference bypasses the modal even when an editor is live', async () => {
    locationPreferenceService.setPreference(connectionKey, "dedicated");
    mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: { kind: "candidate", type: "standalone", pid: 222, instanceId: "standalone-instance-2" } }
    ]);
  });
  test('a stored "dedicated" preference with no live standalone endpoint spawns a new one', async () => {
    locationPreferenceService.setPreference(connectionKey, "dedicated");
    mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate]));
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: { kind: "spawn" } }
    ]);
  });
  test('a stored "editor" preference with no live editor falls back to a dedicated selection without mutating the stored preference', async () => {
    locationPreferenceService.setPreference(connectionKey, "editor");
    mainService.fireEndpointSelectionRequest(makeRequest([standaloneCandidate]));
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: { kind: "candidate", type: "standalone", pid: 222, instanceId: "standalone-instance-2" } }
    ]);
    assert.strictEqual(locationPreferenceService.getPreference(connectionKey), "editor", "a live-editor-unavailable fallback must not downgrade the stored preference, so a future connect can prefer an editor again");
  });
  test('a stored "editor" preference with neither a live editor nor a live standalone spawns a new dedicated host', async () => {
    locationPreferenceService.setPreference(connectionKey, "editor");
    mainService.fireEndpointSelectionRequest(makeRequest([]));
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: { kind: "spawn" } }
    ]);
    assert.strictEqual(locationPreferenceService.getPreference(connectionKey), "editor");
  });
  test("resolves to the live editor candidate with the lexicographically smallest instanceId, regardless of array order", async () => {
    locationPreferenceService.setPreference(connectionKey, "editor");
    mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, otherEditorCandidate]));
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: { kind: "candidate", type: "editor", pid: 333, instanceId: "editor-instance-1" } }
    ]);
  });
  test("resolves to the live standalone candidate with the lexicographically smallest instanceId, regardless of array order", async () => {
    locationPreferenceService.setPreference(connectionKey, "dedicated");
    mainService.fireEndpointSelectionRequest(makeRequest([standaloneCandidate, otherStandaloneCandidate]));
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: { kind: "candidate", type: "standalone", pid: 444, instanceId: "standalone-instance-1" } }
    ]);
  });
  test("a main-process cancellation aborts the open modal cleanly, responds with undefined, and persists nothing", async () => {
    let capturedToken;
    dialogServiceStub.prompt = ((prompt) => new Promise((resolve) => {
      capturedToken = prompt.token;
      const listener = prompt.token?.onCancellationRequested(() => {
        listener?.dispose();
        resolve({ result: void 0 });
      });
    }));
    mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
    assert.ok(capturedToken, "the modal should have been opened synchronously with a cancellation token");
    const responsePromise = mainService.waitForEndpointSelectionResponse();
    mainService.fireEndpointSelectionCancel("req-1");
    await responsePromise;
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: void 0 }
    ]);
    assert.strictEqual(locationPreferenceService.getPreference(connectionKey), void 0);
  });
  test("the user dismissing the modal responds with undefined and does not persist a preference", async () => {
    dialogServiceStub.prompt = (async () => ({ result: void 0 }));
    mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: void 0 }
    ]);
    assert.strictEqual(locationPreferenceService.getPreference(connectionKey), void 0);
  });
  test("cancelling an unrelated requestId does not abort the current modal", async () => {
    dialogServiceStub.prompt = (async () => ({ result: void 0 }));
    mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate]));
    mainService.fireEndpointSelectionCancel("some-other-request");
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: void 0 }
    ]);
  });
  test("preferences are isolated per connectionKey: a preference stored for one host does not suppress the modal for another", async () => {
    locationPreferenceService.setPreference("ssh:other.example", "dedicated");
    dialogServiceStub.prompt = (async () => ({ result: "editor" }));
    mainService.fireEndpointSelectionRequest(makeRequest([editorCandidate, standaloneCandidate], connectionKey));
    await mainService.waitForEndpointSelectionResponse();
    assert.deepStrictEqual(mainService.endpointSelectionResponses, [
      { requestId: "req-1", selection: { kind: "candidate", type: "editor", pid: 111, instanceId: "editor-instance-2" } }
    ]);
    assert.strictEqual(locationPreferenceService.getPreference(connectionKey), "editor");
    assert.strictEqual(locationPreferenceService.getPreference("ssh:other.example"), "dedicated");
  });
});
suite("SSHRemoteAgentHostService host key verification (renderer)", () => {
  const disposables = new DisposableStore();
  let mainService;
  let hostKeyTrustService;
  let notificationService;
  let confirmResult;
  let confirmCalls;
  let confirmGate;
  let inFlightVerifications;
  let lastConfirmOptions;
  setup(() => {
    mainService = disposables.add(new MockSSHMainService());
    const sharedProcessService = {
      getChannel: () => asChannel(mainService)
    };
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IQuickInputService, {});
    instantiationService.stub(ISharedProcessService, sharedProcessService);
    instantiationService.stub(IRemoteAgentHostService, disposables.add(new MockRemoteAgentHostService()));
    notificationService = new CapturingNotificationService();
    instantiationService.stub(INotificationService, notificationService);
    instantiationService.stub(ISSHRelayClientFactory, {
      createClient: () => disposables.add(new MockProtocolClient())
    });
    instantiationService.stub(IRemoteAgentHostLocationPreferenceService, disposables.add(new TestRemoteAgentHostLocationPreferenceService()));
    instantiationService.stub(IProductService, { _serviceBrand: void 0, nameShort: "Test Product" });
    confirmResult = false;
    confirmCalls = 0;
    confirmGate = void 0;
    lastConfirmOptions = void 0;
    inFlightVerifications = [];
    instantiationService.stub(IDialogService, {
      confirm: (async (confirmation) => {
        confirmCalls++;
        lastConfirmOptions = confirmation;
        if (confirmGate) {
          await confirmGate();
        }
        return { confirmed: confirmResult };
      })
    });
    hostKeyTrustService = disposables.add(new SSHHostKeyTrustService(disposables.add(new InMemoryStorageService())));
    instantiationService.stub(ISSHHostKeyTrustService, hostKeyTrustService);
    class TestableService extends SSHRemoteAgentHostService {
      _trackHostKeyVerification(handled) {
        inFlightVerifications.push(handled);
      }
    }
    disposables.add(instantiationService.createInstance(TestableService));
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  async function settleVerifications() {
    while (inFlightVerifications.length) {
      await Promise.all(inFlightVerifications.splice(0));
    }
  }
  const FINGERPRINT = "SHA256:testfingerprintaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  function makeHostKeyRequest(overrides = {}) {
    return {
      requestId: "hostkey-1",
      connectionKey: "ssh:remote.example",
      displayHost: "remote.example",
      host: "remote.example",
      port: 22,
      keyType: "ssh-ed25519",
      fingerprint: FINGERPRINT,
      knownHostsMatch: "unknown",
      userInitiated: true,
      ...overrides
    };
  }
  async function fireAndWait(request) {
    const responded = mainService.waitForHostKeyResponse();
    mainService.fireHostKeyVerificationRequest(request);
    await responded;
  }
  test("prompts for an unknown host and persists on accept", async () => {
    confirmResult = true;
    await fireAndWait(makeHostKeyRequest());
    assert.deepStrictEqual(
      {
        responses: mainService.hostKeyResponses,
        confirmCalls,
        stored: hostKeyTrustService.getTrustedKeys("remote.example", 22).map((k) => `${k.keyType} ${k.fingerprint}`)
      },
      {
        responses: [{ requestId: "hostkey-1", trusted: true }],
        confirmCalls: 1,
        stored: ["ssh-ed25519 SHA256:testfingerprintaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
      }
    );
  });
  test("declining the prompt refuses the key and stores nothing", async () => {
    confirmResult = false;
    await fireAndWait(makeHostKeyRequest());
    assert.deepStrictEqual(
      {
        responses: mainService.hostKeyResponses,
        stored: hostKeyTrustService.getTrustedKeys("remote.example", 22).length
      },
      { responses: [{ requestId: "hostkey-1", trusted: false }], stored: 0 }
    );
  });
  test("an already-trusted key connects silently", async () => {
    hostKeyTrustService.trustHostKey("remote.example", 22, { keyType: "ssh-ed25519", fingerprint: FINGERPRINT, addedAt: 1 });
    await fireAndWait(makeHostKeyRequest());
    assert.deepStrictEqual(
      { responses: mainService.hostKeyResponses, confirmCalls },
      { responses: [{ requestId: "hostkey-1", trusted: true }], confirmCalls: 0 }
    );
  });
  test("a changed key is refused with no way to click through", async () => {
    hostKeyTrustService.trustHostKey("remote.example", 22, { keyType: "ssh-ed25519", fingerprint: "SHA256:theoldkey", addedAt: 1 });
    await fireAndWait(makeHostKeyRequest());
    const notified = notificationService.notifications.at(-1);
    assert.deepStrictEqual(
      {
        responses: mainService.hostKeyResponses,
        // No dialog at all: recovering requires explicitly forgetting
        // the host, so a possible impersonation can't be waved away.
        confirmCalls,
        severity: notified?.severity,
        hasForgetAction: !!notified?.actions?.primary?.length,
        // The old key must remain stored until the user forgets it.
        stillStored: hostKeyTrustService.getTrustedKeys("remote.example", 22).map((k) => k.fingerprint)
      },
      {
        responses: [{ requestId: "hostkey-1", trusted: false }],
        confirmCalls: 0,
        severity: Severity.Error,
        hasForgetAction: true,
        stillStored: ["SHA256:theoldkey"]
      }
    );
  });
  test("a known_hosts mismatch or revocation offers no forget action", async () => {
    await fireAndWait(makeHostKeyRequest({ knownHostsMatch: "mismatch" }));
    const fromKnownHosts = notificationService.notifications.at(-1);
    await fireAndWait(makeHostKeyRequest({ requestId: "hostkey-2", knownHostsMatch: "revoked" }));
    const fromRevoked = notificationService.notifications.at(-1);
    assert.deepStrictEqual(
      {
        knownHostsHasForget: !!fromKnownHosts?.actions?.primary?.length,
        knownHostsMentionsFile: !!fromKnownHosts?.message.toString().includes("known_hosts"),
        revokedHasForget: !!fromRevoked?.actions?.primary?.length,
        revokedMentionsFile: !!fromRevoked?.message.toString().includes("known_hosts"),
        responses: mainService.hostKeyResponses
      },
      {
        knownHostsHasForget: false,
        knownHostsMentionsFile: true,
        revokedHasForget: false,
        revokedMentionsFile: true,
        responses: [
          { requestId: "hostkey-1", trusted: false },
          { requestId: "hostkey-2", trusted: false }
        ]
      }
    );
  });
  test("the forget action clears the stored key so the next connect can re-verify", async () => {
    hostKeyTrustService.trustHostKey("remote.example", 22, { keyType: "ssh-ed25519", fingerprint: "SHA256:theoldkey", addedAt: 1 });
    await fireAndWait(makeHostKeyRequest());
    await notificationService.notifications.at(-1)?.actions?.primary?.[0].run();
    assert.strictEqual(hostKeyTrustService.getTrustedKeys("remote.example", 22).length, 0);
  });
  test("a known_hosts match is trusted silently and copied into the store", async () => {
    await fireAndWait(makeHostKeyRequest({ knownHostsMatch: "match" }));
    assert.deepStrictEqual(
      {
        responses: mainService.hostKeyResponses,
        confirmCalls,
        stored: hostKeyTrustService.getTrustedKeys("remote.example", 22).map((k) => k.fingerprint)
      },
      {
        responses: [{ requestId: "hostkey-1", trusted: true }],
        confirmCalls: 0,
        stored: [FINGERPRINT]
      }
    );
  });
  test("a revoked key is refused", async () => {
    await fireAndWait(makeHostKeyRequest({ knownHostsMatch: "revoked" }));
    assert.deepStrictEqual(
      { responses: mainService.hostKeyResponses, confirmCalls },
      { responses: [{ requestId: "hostkey-1", trusted: false }], confirmCalls: 0 }
    );
  });
  test("a background reconnect never opens a dialog", async () => {
    await fireAndWait(makeHostKeyRequest({ userInitiated: false }));
    assert.deepStrictEqual(
      { responses: mainService.hostKeyResponses, confirmCalls },
      { responses: [{ requestId: "hostkey-1", trusted: false }], confirmCalls: 0 }
    );
  });
  test("StrictHostKeyChecking accept-new trusts unknown hosts without prompting", async () => {
    await fireAndWait(makeHostKeyRequest({ strictHostKeyChecking: "accept-new" }));
    assert.deepStrictEqual(
      {
        responses: mainService.hostKeyResponses,
        confirmCalls,
        stored: hostKeyTrustService.getTrustedKeys("remote.example", 22).length
      },
      { responses: [{ requestId: "hostkey-1", trusted: true }], confirmCalls: 0, stored: 1 }
    );
  });
  test("a prompt for a connection that dies is dismissed, and a late answer grants nothing", async () => {
    let releaseDialog = () => {
    };
    const dialogShown = new Promise((resolveShown) => {
      confirmGate = () => {
        resolveShown();
        return new Promise((resolve) => {
          releaseDialog = resolve;
        });
      };
    });
    confirmResult = true;
    mainService.fireHostKeyVerificationRequest(makeHostKeyRequest());
    await dialogShown;
    const dialogToken = lastConfirmOptions?.token;
    const dismissedBeforeCancel = dialogToken?.isCancellationRequested;
    mainService.fireHostKeyVerificationCancel("hostkey-1");
    const dismissedAfterCancel = dialogToken?.isCancellationRequested;
    releaseDialog();
    await settleVerifications();
    assert.deepStrictEqual(
      {
        // The dialog is handed a live token that is cancelled when the
        // connection dies, which is what dismisses it.
        dismissedBeforeCancel,
        dismissedAfterCancel,
        // And a late "Connect" still grants nothing.
        responses: mainService.hostKeyResponses,
        stored: hostKeyTrustService.getTrustedKeys("remote.example", 22).length
      },
      { dismissedBeforeCancel: false, dismissedAfterCancel: true, responses: [], stored: 0 }
    );
  });
  test("learns a rotated key announced over an authenticated connection", async () => {
    hostKeyTrustService.trustHostKey("remote.example", 22, { keyType: "ssh-ed25519", fingerprint: FINGERPRINT, addedAt: 1 });
    await fireAndWait(makeHostKeyRequest());
    mainService.fireHostKeysAnnouncement({
      connectionKey: "ssh:remote.example",
      host: "remote.example",
      port: 22,
      keys: [
        { keyType: "ssh-ed25519", fingerprint: "SHA256:rotated" },
        { keyType: "ssh-rsa", fingerprint: "SHA256:rsakey" }
      ]
    });
    assert.deepStrictEqual(
      hostKeyTrustService.getTrustedKeys("remote.example", 22).map((k) => `${k.keyType} ${k.fingerprint}`).sort(),
      ["ssh-ed25519 SHA256:rotated", "ssh-rsa SHA256:rsakey"]
    );
  });
  test("a changed key is refused even when StrictHostKeyChecking is disabled", async () => {
    hostKeyTrustService.trustHostKey("remote.example", 22, { keyType: "ssh-ed25519", fingerprint: FINGERPRINT, addedAt: 1 });
    await fireAndWait(makeHostKeyRequest({ fingerprint: "SHA256:impostorkey", strictHostKeyChecking: "no" }));
    mainService.fireHostKeysAnnouncement({
      connectionKey: "ssh:remote.example",
      host: "remote.example",
      port: 22,
      keys: [{ keyType: "ssh-ed25519", fingerprint: "SHA256:attackerkey" }]
    });
    assert.deepStrictEqual(
      {
        // Refused outright, before authentication.
        connected: mainService.hostKeyResponses,
        // And the genuine stored key is untouched.
        stored: hostKeyTrustService.getTrustedKeys("remote.example", 22).map((k) => k.fingerprint)
      },
      {
        connected: [{ requestId: "hostkey-1", trusted: false }],
        stored: [FINGERPRINT]
      }
    );
  });
  test("an unverified session cannot poison stored trust via announcements", async () => {
    hostKeyTrustService.trustHostKey("remote.example", 22, { keyType: "ssh-ed25519", fingerprint: FINGERPRINT, addedAt: 1 });
    await fireAndWait(makeHostKeyRequest({ keyType: "ssh-rsa", fingerprint: "SHA256:impostorkey", strictHostKeyChecking: "no" }));
    mainService.fireHostKeysAnnouncement({
      connectionKey: "ssh:remote.example",
      host: "remote.example",
      port: 22,
      keys: [{ keyType: "ssh-ed25519", fingerprint: "SHA256:attackerkey" }]
    });
    assert.deepStrictEqual(
      {
        // The unverified session was allowed to connect...
        connected: mainService.hostKeyResponses,
        // ...but the genuine stored key is untouched.
        stored: hostKeyTrustService.getTrustedKeys("remote.example", 22).map((k) => k.fingerprint)
      },
      {
        connected: [{ requestId: "hostkey-1", trusted: true }],
        stored: [FINGERPRINT]
      }
    );
  });
  test("ignores announcements for hosts that were never trusted", async () => {
    mainService.fireHostKeysAnnouncement({
      connectionKey: "ssh:remote.example",
      host: "remote.example",
      port: 22,
      keys: [{ keyType: "ssh-ed25519", fingerprint: "SHA256:rotated" }]
    });
    assert.strictEqual(hostKeyTrustService.getTrustedKeys("remote.example", 22).length, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxlbGVjdHJvbi1icm93c2VyXFxzc2hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgdHlwZSB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maXJtYXRpb24sIElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHksIHR5cGUgSU5vdGlmaWNhdGlvbiwgdHlwZSBJTm90aWZpY2F0aW9uSGFuZGxlIH0gZnJvbSAnLi4vLi4vLi4vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub3RpZmljYXRpb24vdGVzdC9jb21tb24vdGVzdE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuXG5pbXBvcnQgeyBJU2hhcmVkUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pcGMvZWxlY3Ryb24tYnJvd3Nlci9zZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLCBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUhQX1VOU1VQUE9SVEVEX1BST1RPQ09MX1ZFUlNJT04sIFByb3RvY29sRXJyb3IgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLCB0eXBlIFJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UuanMnO1xuaW1wb3J0IHsgSVNTSEhvc3RLZXlUcnVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc3NoSG9zdEtleVRydXN0LmpzJztcbmltcG9ydCB7IFNTSEhvc3RLZXlUcnVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3NzaEhvc3RLZXlUcnVzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHR5cGUge1xuXHRJU1NIQWdlbnRIb3N0Q29uZmlnLFxuXHRJU1NIQ29ubmVjdFJlc3VsdCxcblx0SVNTSEVuZHBvaW50Q2FuZGlkYXRlLFxuXHRJU1NIRW5kcG9pbnRTZWxlY3Rpb24sXG5cdElTU0hFbmRwb2ludFNlbGVjdGlvblJlcXVlc3QsXG5cdElTU0hIb3N0S2V5VmVyaWZpY2F0aW9uUmVxdWVzdCxcblx0SVNTSEhvc3RLZXlzQW5ub3VuY2VtZW50LFxuXHRJU1NIS2V5Ym9hcmRJbnRlcmFjdGl2ZVJlcXVlc3QsXG5cdElTU0hSZXNvbHZlZENvbmZpZyxcblx0SVNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlLFxufSBmcm9tICcuLi8uLi9jb21tb24vc3NoUmVtb3RlQWdlbnRIb3N0LmpzJztcbmltcG9ydCB0eXBlIHsgSVJlbGF5TWVzc2FnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9yZWxheVRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgeyBQUk9UT0NPTF9WRVJTSU9OIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vcmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVNTSFJlbGF5Q2xpZW50RmFjdG9yeSwgU1NIUmVtb3RlQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uL2VsZWN0cm9uLWJyb3dzZXIvc3NoUmVtb3RlQWdlbnRIb3N0U2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQgfSBmcm9tICcuLi8uLi9icm93c2VyL3JlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LmpzJztcblxuLyoqXG4gKiBJbi1yZW5kZXJlciBtb2NrIG9mIHRoZSBzaGFyZWQtcHJvY2VzcyBTU0ggc2VydmljZS4gRXhwb3NlcyB0aGUgc2FtZVxuICogc3VyZmFjZSB0aGF0IHRoZSByZW5kZXJlciBhY2Nlc3NlcyB0aHJvdWdoIFByb3h5Q2hhbm5lbCwgcGx1cyBhIHNtYWxsXG4gKiB0ZXN0IEFQSSB0byBkcml2ZSBjbG9zZSBldmVudHMgYW5kIGluc3BlY3QgY2FsbHMuXG4gKi9cbmNsYXNzIE1vY2tTU0hNYWluU2VydmljZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbm5lY3Rpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsb3NlQ29ubmVjdGlvbiA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZUNvbm5lY3Rpb24gPSB0aGlzLl9vbkRpZENsb3NlQ29ubmVjdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcyA9IG5ldyBFbWl0dGVyPHsgY29ubmVjdGlvbktleTogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmcgfT4oKTtcblx0cmVhZG9ubHkgb25EaWRSZXBvcnRDb25uZWN0UHJvZ3Jlc3MgPSB0aGlzLl9vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbGF5TWVzc2FnZSA9IG5ldyBFbWl0dGVyPElSZWxheU1lc3NhZ2U+KCk7XG5cdHJlYWRvbmx5IG9uRGlkUmVsYXlNZXNzYWdlID0gdGhpcy5fb25EaWRSZWxheU1lc3NhZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWxheUNsb3NlID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvbkRpZFJlbGF5Q2xvc2UgPSB0aGlzLl9vbkRpZFJlbGF5Q2xvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0S2V5Ym9hcmRJbnRlcmFjdGl2ZSA9IG5ldyBFbWl0dGVyPElTU0hLZXlib2FyZEludGVyYWN0aXZlUmVxdWVzdD4oKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0S2V5Ym9hcmRJbnRlcmFjdGl2ZSA9IHRoaXMuX29uRGlkUmVxdWVzdEtleWJvYXJkSW50ZXJhY3RpdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDYW5jZWxLZXlib2FyZEludGVyYWN0aXZlID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvbkRpZENhbmNlbEtleWJvYXJkSW50ZXJhY3RpdmUgPSB0aGlzLl9vbkRpZENhbmNlbEtleWJvYXJkSW50ZXJhY3RpdmUuZXZlbnQ7XG5cblx0cmVhZG9ubHkga2JpUmVzcG9uc2VzOiBBcnJheTx7IHJlcXVlc3RJZDogc3RyaW5nOyByZXNwb25zZXM6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPiB8IHVuZGVmaW5lZCB9PiA9IFtdO1xuXG5cdGFzeW5jIHJlc3BvbmRLZXlib2FyZEludGVyYWN0aXZlKHJlcXVlc3RJZDogc3RyaW5nLCByZXNwb25zZXM/OiBSZWFkb25seUFycmF5PHN0cmluZz4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmtiaVJlc3BvbnNlcy5wdXNoKHsgcmVxdWVzdElkLCByZXNwb25zZXMgfSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RFbmRwb2ludFNlbGVjdGlvbiA9IG5ldyBFbWl0dGVyPElTU0hFbmRwb2ludFNlbGVjdGlvblJlcXVlc3Q+KCk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdEVuZHBvaW50U2VsZWN0aW9uID0gdGhpcy5fb25EaWRSZXF1ZXN0RW5kcG9pbnRTZWxlY3Rpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDYW5jZWxFbmRwb2ludFNlbGVjdGlvbiA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0cmVhZG9ubHkgb25EaWRDYW5jZWxFbmRwb2ludFNlbGVjdGlvbiA9IHRoaXMuX29uRGlkQ2FuY2VsRW5kcG9pbnRTZWxlY3Rpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0SG9zdEtleVZlcmlmaWNhdGlvbiA9IG5ldyBFbWl0dGVyPElTU0hIb3N0S2V5VmVyaWZpY2F0aW9uUmVxdWVzdD4oKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0SG9zdEtleVZlcmlmaWNhdGlvbiA9IHRoaXMuX29uRGlkUmVxdWVzdEhvc3RLZXlWZXJpZmljYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDYW5jZWxIb3N0S2V5VmVyaWZpY2F0aW9uID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvbkRpZENhbmNlbEhvc3RLZXlWZXJpZmljYXRpb24gPSB0aGlzLl9vbkRpZENhbmNlbEhvc3RLZXlWZXJpZmljYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBbm5vdW5jZUhvc3RLZXlzID0gbmV3IEVtaXR0ZXI8SVNTSEhvc3RLZXlzQW5ub3VuY2VtZW50PigpO1xuXHRyZWFkb25seSBvbkRpZEFubm91bmNlSG9zdEtleXMgPSB0aGlzLl9vbkRpZEFubm91bmNlSG9zdEtleXMuZXZlbnQ7XG5cblx0cmVhZG9ubHkgaG9zdEtleVJlc3BvbnNlczogQXJyYXk8eyByZXF1ZXN0SWQ6IHN0cmluZzsgdHJ1c3RlZDogYm9vbGVhbiB9PiA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3N0S2V5UmVzcG9uc2VXYWl0ZXJzOiBEZWZlcnJlZFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXG5cdGFzeW5jIHJlc3BvbmRIb3N0S2V5VmVyaWZpY2F0aW9uKHJlcXVlc3RJZDogc3RyaW5nLCB0cnVzdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5ob3N0S2V5UmVzcG9uc2VzLnB1c2goeyByZXF1ZXN0SWQsIHRydXN0ZWQgfSk7XG5cdFx0dGhpcy5faG9zdEtleVJlc3BvbnNlV2FpdGVycy5zcGxpY2UoMCkuZm9yRWFjaCh3YWl0ZXIgPT4gd2FpdGVyLmNvbXBsZXRlKCkpO1xuXHR9XG5cblx0LyoqIFRlc3QgaGVscGVyOiBmaXJlIGEgaG9zdCBrZXkgdmVyaWZpY2F0aW9uIHJlcXVlc3QgYXMgdGhlIHNoYXJlZCBwcm9jZXNzIHdvdWxkLiAqL1xuXHRmaXJlSG9zdEtleVZlcmlmaWNhdGlvblJlcXVlc3QocmVxdWVzdDogSVNTSEhvc3RLZXlWZXJpZmljYXRpb25SZXF1ZXN0KTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0SG9zdEtleVZlcmlmaWNhdGlvbi5maXJlKHJlcXVlc3QpO1xuXHR9XG5cblx0LyoqIFRlc3QgaGVscGVyOiBjYW5jZWwgYSBob3N0IGtleSB2ZXJpZmljYXRpb24gYXMgdGhlIHNoYXJlZCBwcm9jZXNzIHdvdWxkLiAqL1xuXHRmaXJlSG9zdEtleVZlcmlmaWNhdGlvbkNhbmNlbChyZXF1ZXN0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2FuY2VsSG9zdEtleVZlcmlmaWNhdGlvbi5maXJlKHJlcXVlc3RJZCk7XG5cdH1cblxuXHQvKiogVGVzdCBoZWxwZXI6IGZpcmUgYSBob3N0IGtleSBhbm5vdW5jZW1lbnQgYXMgdGhlIHNoYXJlZCBwcm9jZXNzIHdvdWxkLiAqL1xuXHRmaXJlSG9zdEtleXNBbm5vdW5jZW1lbnQoYW5ub3VuY2VtZW50OiBJU1NISG9zdEtleXNBbm5vdW5jZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZEFubm91bmNlSG9zdEtleXMuZmlyZShhbm5vdW5jZW1lbnQpO1xuXHR9XG5cblx0LyoqIFRlc3QgaGVscGVyOiByZXNvbHZlcyBvbmNlIHtAbGluayByZXNwb25kSG9zdEtleVZlcmlmaWNhdGlvbn0gaXMgbmV4dCBjYWxsZWQuICovXG5cdHdhaXRGb3JIb3N0S2V5UmVzcG9uc2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0dGhpcy5faG9zdEtleVJlc3BvbnNlV2FpdGVycy5wdXNoKGRlZmVycmVkKTtcblx0XHRyZXR1cm4gZGVmZXJyZWQucDtcblx0fVxuXG5cdHJlYWRvbmx5IGVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2VzOiBBcnJheTx7IHJlcXVlc3RJZDogc3RyaW5nOyBzZWxlY3Rpb246IElTU0hFbmRwb2ludFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB9PiA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlV2FpdGVyczogRGVmZXJyZWRQcm9taXNlPHZvaWQ+W10gPSBbXTtcblxuXHQvKiogVGVzdCBoZWxwZXI6IGZpcmUgYW4gZW5kcG9pbnQtc2VsZWN0aW9uIHJlcXVlc3QgYXMgdGhlIG1haW4gcHJvY2VzcyB3b3VsZC4gKi9cblx0ZmlyZUVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdChyZXF1ZXN0OiBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0KTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0RW5kcG9pbnRTZWxlY3Rpb24uZmlyZShyZXF1ZXN0KTtcblx0fVxuXG5cdC8qKiBUZXN0IGhlbHBlcjogZmlyZSBhbiBlbmRwb2ludC1zZWxlY3Rpb24gY2FuY2VsbGF0aW9uIGFzIHRoZSBtYWluIHByb2Nlc3Mgd291bGQuICovXG5cdGZpcmVFbmRwb2ludFNlbGVjdGlvbkNhbmNlbChyZXF1ZXN0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2FuY2VsRW5kcG9pbnRTZWxlY3Rpb24uZmlyZShyZXF1ZXN0SWQpO1xuXHR9XG5cblx0LyoqIFRlc3QgaGVscGVyOiByZXNvbHZlcyBvbmNlIHtAbGluayByZXNwb25kRW5kcG9pbnRTZWxlY3Rpb259IGlzIG5leHQgY2FsbGVkLiAqL1xuXHR3YWl0Rm9yRW5kcG9pbnRTZWxlY3Rpb25SZXNwb25zZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHR0aGlzLl9lbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlV2FpdGVycy5wdXNoKGRlZmVycmVkKTtcblx0XHRyZXR1cm4gZGVmZXJyZWQucDtcblx0fVxuXG5cdGFzeW5jIHJlc3BvbmRFbmRwb2ludFNlbGVjdGlvbihyZXF1ZXN0SWQ6IHN0cmluZywgc2VsZWN0aW9uOiBJU1NIRW5kcG9pbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2VzLnB1c2goeyByZXF1ZXN0SWQsIHNlbGVjdGlvbiB9KTtcblx0XHR0aGlzLl9lbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlV2FpdGVycy5zcGxpY2UoMCkuZm9yRWFjaChkID0+IGQuY29tcGxldGUoKSk7XG5cdH1cblxuXHRyZWFkb25seSBkaXNjb25uZWN0Q2FsbHM6IHN0cmluZ1tdID0gW107XG5cdHJlYWRvbmx5IGNvbm5lY3RDYWxsczogSVNTSEFnZW50SG9zdENvbmZpZ1tdID0gW107XG5cdHJlYWRvbmx5IHJlY29ubmVjdENhbGxzOiBBcnJheTx7IHNzaENvbmZpZ0hvc3Q6IHN0cmluZzsgbmFtZTogc3RyaW5nOyByZW1vdGVBZ2VudEhvc3RDb21tYW5kPzogc3RyaW5nOyBhZ2VudEZvcndhcmQ/OiBib29sZWFuOyB1c2VySW5pdGlhdGVkPzogYm9vbGVhbjsgcHJlZmVycmVkQWdlbnRMb2NhdGlvbj86IFJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZSB9PiA9IFtdO1xuXHRwcml2YXRlIF9uZXh0Q29ubmVjdGlvbklkID0gMTtcblxuXHRjb25uZWN0UmVzdWx0OiBQYXJ0aWFsPElTU0hDb25uZWN0UmVzdWx0PiB8IHVuZGVmaW5lZDtcblxuXHRhc3luYyBjb25uZWN0KGNvbmZpZzogSVNTSEFnZW50SG9zdENvbmZpZyk6IFByb21pc2U8SVNTSENvbm5lY3RSZXN1bHQ+IHtcblx0XHR0aGlzLmNvbm5lY3RDYWxscy5wdXNoKGNvbmZpZyk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbklkID0gdGhpcy5jb25uZWN0UmVzdWx0Py5jb25uZWN0aW9uSWQgPz8gYGNvbm4tJHt0aGlzLl9uZXh0Q29ubmVjdGlvbklkKyt9YDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29ubmVjdGlvbklkLFxuXHRcdFx0YWRkcmVzczogdGhpcy5jb25uZWN0UmVzdWx0Py5hZGRyZXNzID8/IGBzc2g6JHtjb25maWcuaG9zdH1gLFxuXHRcdFx0bmFtZTogY29uZmlnLm5hbWUsXG5cdFx0XHRjb25uZWN0aW9uVG9rZW46ICd0ZXN0LXRva2VuJyxcblx0XHRcdGNvbmZpZzogeyBob3N0OiBjb25maWcuaG9zdCwgdXNlcm5hbWU6IGNvbmZpZy51c2VybmFtZSwgYXV0aE1ldGhvZDogY29uZmlnLmF1dGhNZXRob2QsIG5hbWU6IGNvbmZpZy5uYW1lLCBzc2hDb25maWdIb3N0OiBjb25maWcuc3NoQ29uZmlnSG9zdCB9LFxuXHRcdFx0c3NoQ29uZmlnSG9zdDogY29uZmlnLnNzaENvbmZpZ0hvc3QsXG5cdFx0XHRzZXJ2ZXJUeXBlOiB0aGlzLmNvbm5lY3RSZXN1bHQ/LnNlcnZlclR5cGUsXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHJlY29ubmVjdChzc2hDb25maWdIb3N0OiBzdHJpbmcsIG5hbWU6IHN0cmluZywgcmVtb3RlQWdlbnRIb3N0Q29tbWFuZD86IHN0cmluZywgYWdlbnRGb3J3YXJkPzogYm9vbGVhbiwgdXNlckluaXRpYXRlZD86IGJvb2xlYW4sIHByZWZlcnJlZEFnZW50TG9jYXRpb24/OiBSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UpOiBQcm9taXNlPElTU0hDb25uZWN0UmVzdWx0PiB7XG5cdFx0dGhpcy5yZWNvbm5lY3RDYWxscy5wdXNoKHsgc3NoQ29uZmlnSG9zdCwgbmFtZSwgcmVtb3RlQWdlbnRIb3N0Q29tbWFuZCwgYWdlbnRGb3J3YXJkLCB1c2VySW5pdGlhdGVkLCBwcmVmZXJyZWRBZ2VudExvY2F0aW9uIH0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb25uZWN0aW9uSWQ6IHRoaXMuY29ubmVjdFJlc3VsdD8uY29ubmVjdGlvbklkID8/IGBjb25uLSR7dGhpcy5fbmV4dENvbm5lY3Rpb25JZCsrfWAsXG5cdFx0XHRhZGRyZXNzOiB0aGlzLmNvbm5lY3RSZXN1bHQ/LmFkZHJlc3MgPz8gYHNzaDoke3NzaENvbmZpZ0hvc3R9YCxcblx0XHRcdG5hbWUsXG5cdFx0XHRjb25uZWN0aW9uVG9rZW46ICd0ZXN0LXRva2VuJyxcblx0XHRcdGNvbmZpZzogeyBob3N0OiBzc2hDb25maWdIb3N0LCB1c2VybmFtZTogJ3UnLCBhdXRoTWV0aG9kOiAwIGFzIG5ldmVyLCBuYW1lLCBzc2hDb25maWdIb3N0IH0sXG5cdFx0XHRzc2hDb25maWdIb3N0LFxuXHRcdFx0c2VydmVyVHlwZTogdGhpcy5jb25uZWN0UmVzdWx0Py5zZXJ2ZXJUeXBlLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyByZWxheVNlbmQoX2Nvbm5lY3Rpb25JZDogc3RyaW5nLCBfbWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7IC8qIG5vLW9wICovIH1cblxuXHRhc3luYyBkaXNjb25uZWN0KGNvbm5lY3Rpb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5kaXNjb25uZWN0Q2FsbHMucHVzaChjb25uZWN0aW9uSWQpO1xuXHR9XG5cblx0YXN5bmMgbGlzdFNTSENvbmZpZ0hvc3RzKCk6IFByb21pc2U8c3RyaW5nW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIGVuc3VyZVVzZXJTU0hDb25maWcoKTogUHJvbWlzZTxVUkk+IHsgcmV0dXJuIFVSSS5maWxlKCcvdG1wL3NzaC1jb25maWcnKTsgfVxuXHRhc3luYyBsaXN0U1NIQ29uZmlnRmlsZXMoKTogUHJvbWlzZTxVUklbXT4geyByZXR1cm4gW1VSSS5maWxlKCcvdG1wL3NzaC1jb25maWcnKV07IH1cblx0YXN5bmMgcmVzb2x2ZVNTSENvbmZpZyhfaG9zdDogc3RyaW5nKTogUHJvbWlzZTxJU1NIUmVzb2x2ZWRDb25maWc+IHtcblx0XHRyZXR1cm4geyBob3N0bmFtZTogJycsIHVzZXI6IHVuZGVmaW5lZCwgcG9ydDogMjIsIGlkZW50aXR5RmlsZTogW10sIGlkZW50aXR5QWdlbnQ6IHVuZGVmaW5lZCwgZm9yd2FyZEFnZW50OiBmYWxzZSwgdXNlcktub3duSG9zdHNGaWxlczogW10sIGdsb2JhbEtub3duSG9zdHNGaWxlczogW10sIHN0cmljdEhvc3RLZXlDaGVja2luZzogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2xvc2VDb25uZWN0aW9uLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRSZWxheU1lc3NhZ2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkUmVsYXlDbG9zZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0S2V5Ym9hcmRJbnRlcmFjdGl2ZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDYW5jZWxLZXlib2FyZEludGVyYWN0aXZlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFJlcXVlc3RFbmRwb2ludFNlbGVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDYW5jZWxFbmRwb2ludFNlbGVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0SG9zdEtleVZlcmlmaWNhdGlvbi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDYW5jZWxIb3N0S2V5VmVyaWZpY2F0aW9uLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZEFubm91bmNlSG9zdEtleXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKiBBZGFwdCBhIG1vY2sgc2VydmljZSBvYmplY3QgdG8gdGhlIElDaGFubmVsIHN1cmZhY2UgUHJveHlDaGFubmVsIGV4cGVjdHMuICovXG5mdW5jdGlvbiBhc0NoYW5uZWwodGFyZ2V0OiBvYmplY3QpOiBJQ2hhbm5lbCB7XG5cdHJldHVybiB7XG5cdFx0Y2FsbDogYXN5bmMgPFQ+KG1ldGhvZDogc3RyaW5nLCBhcmdzPzogdW5rbm93bik6IFByb21pc2U8VD4gPT4ge1xuXHRcdFx0Y29uc3QgZm4gPSAodGFyZ2V0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVttZXRob2RdO1xuXHRcdFx0aWYgKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1vY2tDaGFubmVsOiBubyBtZXRob2QgJHttZXRob2R9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gKGZuIGFzICguLi5hOiB1bmtub3duW10pID0+IFByb21pc2U8VD4pLmFwcGx5KHRhcmdldCwgKGFyZ3MgYXMgdW5rbm93bltdKSA/PyBbXSk7XG5cdFx0fSxcblx0XHRsaXN0ZW46IDxUPihldmVudDogc3RyaW5nKTogRXZlbnQ8VD4gPT4ge1xuXHRcdFx0Y29uc3QgZXYgPSAodGFyZ2V0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtldmVudF07XG5cdFx0XHRpZiAodHlwZW9mIGV2ICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTW9ja0NoYW5uZWw6IG5vIGV2ZW50ICR7ZXZlbnR9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZXYgYXMgRXZlbnQ8VD47XG5cdFx0fSxcblx0fTtcbn1cblxuLyoqIENhcHR1cmVzIGFkZE1hbmFnZWRDb25uZWN0aW9uIGNhbGxzIHNvIHRlc3RzIGNhbiBpbnNwZWN0IHRyYW5zcG9ydERpc3Bvc2FibGUuICovXG5jbGFzcyBNb2NrUmVtb3RlQWdlbnRIb3N0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBhZGRlZDogQXJyYXk8eyBhZGRyZXNzOiBzdHJpbmc7IHN0YXR1cz86IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM7IHRyYW5zcG9ydD86IElEaXNwb3NhYmxlIH0+ID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgeyB0cmFuc3BvcnQ/OiBJRGlzcG9zYWJsZTsgY2xpZW50OiB7IGRpc3Bvc2U/OiAoKSA9PiB2b2lkIH07IHN0YXR1czogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cyB9PigpO1xuXHQvLyBIb2xkcyB0cmFuc3BvcnQgZGlzcG9zYWJsZXMgZnJvbSBwcmlvciByZWdpc3RyYXRpb25zIHRoYXQgd2VyZVxuXHQvLyByZXBsYWNlZCBieSBhIGxhdGVyIGBhZGRNYW5hZ2VkQ29ubmVjdGlvbmAgZm9yIHRoZSBzYW1lIGFkZHJlc3MuXG5cdC8vIFByb2R1Y3Rpb24gZGVsaWJlcmF0ZWx5IGRvZXMgTk9UIHJ1biB0aGVtIGF0IHJlcGxhY2VtZW50IHRpbWUgKGRvaW5nXG5cdC8vIHNvIHdvdWxkIGNhbGwgX21haW5TZXJ2aWNlLmRpc2Nvbm5lY3Qgb24gdGhlIGJyYW5kLW5ldyB0dW5uZWwgYW5kXG5cdC8vIGtpbGwgaXQpLiBUaGV5IGFyZSByZWxlYXNlZCB3aGVuIHRoZSBzZXJ2aWNlIGl0c2VsZiBpcyBkaXNwb3NlZC5cblx0cHJpdmF0ZSByZWFkb25seSBfYWJhbmRvbmVkVHJhbnNwb3J0czogSURpc3Bvc2FibGVbXSA9IFtdO1xuXG5cdGFzeW5jIGFkZE1hbmFnZWRDb25uZWN0aW9uKGVudHJ5OiB7IG5hbWU6IHN0cmluZzsgY29ubmVjdGlvbjogeyBhZGRyZXNzPzogc3RyaW5nOyBzc2hDb25maWdIb3N0Pzogc3RyaW5nIH0gfSwgY2xpZW50OiBJQWdlbnRDb25uZWN0aW9uLCB0cmFuc3BvcnREaXNwb3NhYmxlPzogSURpc3Bvc2FibGUsIHN0YXR1czogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cyA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGVkKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0Y29uc3QgYWRkcmVzcyA9IGVudHJ5LmNvbm5lY3Rpb24uYWRkcmVzcyA/PyBgc3NoOiR7ZW50cnkuY29ubmVjdGlvbi5zc2hDb25maWdIb3N0fWA7XG5cdFx0Ly8gTWlycm9yIFJlbW90ZUFnZW50SG9zdFNlcnZpY2U6IHJlLXJlZ2lzdGVyaW5nIGFuIGFkZHJlc3MgcmVwbGFjZXNcblx0XHQvLyB0aGUgcHJldmlvdXMgZW50cnkgYW5kIGRpc3Bvc2VzIGl0cyBwcm90b2NvbCBjbGllbnQgKGJ1dCBOT1QgaXRzXG5cdFx0Ly8gdHJhbnNwb3J0IGRpc3Bvc2FibGUgXHUyMDE0IHRoZSBuZXcgZW50cnkgb3ducyB0aGUgdW5kZXJseWluZyB0dW5uZWwpLlxuXHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5fZW50cmllcy5nZXQoYWRkcmVzcyk7XG5cdFx0aWYgKHByZXZpb3VzKSB7XG5cdFx0XHRwcmV2aW91cy5jbGllbnQuZGlzcG9zZT8uKCk7XG5cdFx0XHRpZiAocHJldmlvdXMudHJhbnNwb3J0KSB7XG5cdFx0XHRcdHRoaXMuX2FiYW5kb25lZFRyYW5zcG9ydHMucHVzaChwcmV2aW91cy50cmFuc3BvcnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmFkZGVkLnB1c2goeyBhZGRyZXNzLCBzdGF0dXMsIHRyYW5zcG9ydDogdHJhbnNwb3J0RGlzcG9zYWJsZSB9KTtcblx0XHR0aGlzLl9lbnRyaWVzLnNldChhZGRyZXNzLCB7IGNsaWVudDogY2xpZW50IGFzIHsgZGlzcG9zZT86ICgpID0+IHZvaWQgfSwgdHJhbnNwb3J0OiB0cmFuc3BvcnREaXNwb3NhYmxlLCBzdGF0dXMgfSk7XG5cdFx0cmV0dXJuIHsgYWRkcmVzcywgbmFtZTogZW50cnkubmFtZSwgY2xpZW50SWQ6ICdtb2NrJywgZGVmYXVsdERpcmVjdG9yeTogdW5kZWZpbmVkLCBzdGF0dXMgfTtcblx0fVxuXG5cdC8qKiBNaXJyb3JzIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmdldENvbm5lY3Rpb246IHJldHVybnMgdGhlIGNsaWVudCBvbmx5IHdoZW4gdGhlIGVudHJ5IGlzIGNvbm5lY3RlZC4gKi9cblx0Z2V0Q29ubmVjdGlvbihhZGRyZXNzOiBzdHJpbmcpOiBJQWdlbnRDb25uZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KGFkZHJlc3MpO1xuXHRcdHJldHVybiBlbnRyeSAmJiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGVudHJ5LnN0YXR1cykgPyBlbnRyeS5jbGllbnQgYXMgdW5rbm93biBhcyBJQWdlbnRDb25uZWN0aW9uIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0bm90aWZ5Q29ubmVjdGlvbkNsb3NlZChfYWRkcmVzczogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gbm8tb3AgaW4gdGVzdHMgXHUyMDE0IHRoZSBkZWZlbnNlLWluLWRlcHRoIG5vdGlmaWNhdGlvbiBpcyBleGVyY2lzZWQgc2VwYXJhdGVseVxuXHR9XG5cblx0LyoqIFNpbXVsYXRlIHVzZXIgY2xpY2tpbmcgXCJSZW1vdmUgUmVtb3RlXCI6IGRpc3Bvc2VzIHRoZSBwZXItZW50cnkgc3RvcmUsIHdoaWNoIHJ1bnMgdGhlIHRyYW5zcG9ydCBkaXNwb3NhYmxlLiAqL1xuXHRyZW1vdmVFbnRyeShhZGRyZXNzOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBlID0gdGhpcy5fZW50cmllcy5nZXQoYWRkcmVzcyk7XG5cdFx0aWYgKCFlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2VudHJpZXMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdGUuY2xpZW50LmRpc3Bvc2U/LigpO1xuXHRcdGUudHJhbnNwb3J0Py5kaXNwb3NlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdC8vIERpc3Bvc2UgYW55IHN0aWxsLXJlZ2lzdGVyZWQgZW50cmllcyAobWlycm9ycyB0aGUgcGVyLWVudHJ5IHN0b3JlIGNsZWFudXBcblx0XHQvLyBkb25lIGJ5IHRoZSByZWFsIFJlbW90ZUFnZW50SG9zdFNlcnZpY2Ugd2hlbiBpdCBpdHNlbGYgaXMgZGlzcG9zZWQpLlxuXHRcdGZvciAoY29uc3QgWywgZV0gb2YgdGhpcy5fZW50cmllcykge1xuXHRcdFx0ZS5jbGllbnQuZGlzcG9zZT8uKCk7XG5cdFx0XHRlLnRyYW5zcG9ydD8uZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9lbnRyaWVzLmNsZWFyKCk7XG5cdFx0Ly8gUmVsZWFzZSBhYmFuZG9uZWQgdHJhbnNwb3J0cyBmcm9tIHByaW9yIHJlZ2lzdHJhdGlvbnMgYXMgd2VsbC5cblx0XHRmb3IgKGNvbnN0IHQgb2YgdGhpcy5fYWJhbmRvbmVkVHJhbnNwb3J0cykge1xuXHRcdFx0dC5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2FiYW5kb25lZFRyYW5zcG9ydHMubGVuZ3RoID0gMDtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTW9ja1Byb3RvY29sQ2xpZW50IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGNsaWVudElkID0gJ21vY2stcHJvdG9jb2wtY2xpZW50Jztcblx0cmVhZG9ubHkgb25EaWRDbG9zZSA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQWN0aW9uID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWROb3RpZmljYXRpb24gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBjb25uZWN0RGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdGFzeW5jIGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiB0aGlzLmNvbm5lY3REZWZlcnJlZC5wOyB9XG5cdHJlZ2lzdGVyT3duZWQ8VCBleHRlbmRzIElEaXNwb3NhYmxlPihkOiBUKTogVCB7IHJldHVybiB0aGlzLl9yZWdpc3RlcihkKTsgfVxufVxuXG5jbGFzcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSBFdmVudC5Ob25lO1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIF9yZW1vdGVBZ2VudEhvc3RzRW5hYmxlZCA9IHRydWUpIHsgfVxuXHRnZXRWYWx1ZShrZXk/OiBzdHJpbmcpOiB1bmtub3duIHsgcmV0dXJuIGtleSA9PT0gUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQgPyB0aGlzLl9yZW1vdGVBZ2VudEhvc3RzRW5hYmxlZCA6IHVuZGVmaW5lZDsgfVxuXHRzZXRSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZChlbmFibGVkOiBib29sZWFuKTogdm9pZCB7IHRoaXMuX3JlbW90ZUFnZW50SG9zdHNFbmFibGVkID0gZW5hYmxlZDsgfVxufVxuXG4vKiogQ2FwdHVyZXMgZXZlcnkgbWVzc2FnZSBwYXNzZWQgdG8gYGluZm8oKWAgc28gdGVzdHMgY2FuIGFzc2VydCBvbiB0aGUgU1NIIGZhaWxvdmVyIG5vdGlmaWNhdGlvbi4gKi9cbmNsYXNzIENhcHR1cmluZ05vdGlmaWNhdGlvblNlcnZpY2UgZXh0ZW5kcyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSB7XG5cdHJlYWRvbmx5IGluZm9NZXNzYWdlczogc3RyaW5nW10gPSBbXTtcblx0cmVhZG9ubHkgbm90aWZpY2F0aW9uczogSU5vdGlmaWNhdGlvbltdID0gW107XG5cblx0b3ZlcnJpZGUgaW5mbyhtZXNzYWdlOiBzdHJpbmcpOiBJTm90aWZpY2F0aW9uSGFuZGxlIHtcblx0XHR0aGlzLmluZm9NZXNzYWdlcy5wdXNoKG1lc3NhZ2UpO1xuXHRcdHJldHVybiBzdXBlci5pbmZvKG1lc3NhZ2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgbm90aWZ5KG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvbik6IElOb3RpZmljYXRpb25IYW5kbGUge1xuXHRcdHRoaXMubm90aWZpY2F0aW9ucy5wdXNoKG5vdGlmaWNhdGlvbik7XG5cdFx0cmV0dXJuIHN1cGVyLm5vdGlmeShub3RpZmljYXRpb24pO1xuXHR9XG59XG5cbi8qKiBJbi1tZW1vcnkgc3RhbmQtaW4gZm9yIHtAbGluayBJUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlU2VydmljZX0sIGtleWVkIHRoZSBzYW1lIHdheSBhcyB0aGUgcmVhbCBzdG9yYWdlLWJhY2tlZCBpbXBsZW1lbnRhdGlvbi4gKi9cbmNsYXNzIFRlc3RSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlIGltcGxlbWVudHMgSVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmVmZXJlbmNlcyA9IG5ldyBNYXA8c3RyaW5nLCBSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2U+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQcmVmZXJlbmNlID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVByZWZlcmVuY2UgPSB0aGlzLl9vbkRpZENoYW5nZVByZWZlcmVuY2UuZXZlbnQ7XG5cblx0Z2V0UHJlZmVyZW5jZShob3N0S2V5OiBzdHJpbmcpOiBSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9wcmVmZXJlbmNlcy5nZXQoaG9zdEtleSk7XG5cdH1cblxuXHRzZXRQcmVmZXJlbmNlKGhvc3RLZXk6IHN0cmluZywgcHJlZmVyZW5jZTogUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJlZmVyZW5jZXMuc2V0KGhvc3RLZXksIHByZWZlcmVuY2UpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJlZmVyZW5jZS5maXJlKGhvc3RLZXkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVByZWZlcmVuY2UuZGlzcG9zZSgpO1xuXHR9XG59XG5cbnN1aXRlKCdTU0hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIChyZW5kZXJlciknLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBtYWluU2VydmljZTogTW9ja1NTSE1haW5TZXJ2aWNlO1xuXHRsZXQgcmVtb3RlQWdlbnRIb3N0U2VydmljZTogTW9ja1JlbW90ZUFnZW50SG9zdFNlcnZpY2U7XG5cdGxldCBjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgbm90aWZpY2F0aW9uU2VydmljZTogQ2FwdHVyaW5nTm90aWZpY2F0aW9uU2VydmljZTtcblx0bGV0IGNyZWF0ZWRDbGllbnRzOiBNb2NrUHJvdG9jb2xDbGllbnRbXTtcblx0bGV0IHdhaXRGb3JDbGllbnQ6IChpbmRleDogbnVtYmVyKSA9PiBQcm9taXNlPE1vY2tQcm90b2NvbENsaWVudD47XG5cdGxldCBzZXJ2aWNlOiBTU0hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlO1xuXHRsZXQgcXVpY2tJbnB1dFNlcnZpY2VTdHViOiBQYXJ0aWFsPElRdWlja0lucHV0U2VydmljZT47XG5cdGxldCBsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlOiBUZXN0UmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlU2VydmljZTtcblx0bGV0IGhvc3RLZXlUcnVzdFNlcnZpY2U6IFNTSEhvc3RLZXlUcnVzdFNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdG1haW5TZXJ2aWNlID0gbmV3IE1vY2tTU0hNYWluU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IG1haW5TZXJ2aWNlLmRpc3Bvc2UoKSB9KTtcblx0XHRyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrUmVtb3RlQWdlbnRIb3N0U2VydmljZSgpKTtcblx0XHRjcmVhdGVkQ2xpZW50cyA9IFtdO1xuXG5cdFx0Y29uc3Qgc2hhcmVkUHJvY2Vzc1NlcnZpY2U6IFBhcnRpYWw8SVNoYXJlZFByb2Nlc3NTZXJ2aWNlPiA9IHtcblx0XHRcdGdldENoYW5uZWw6ICgpID0+IGFzQ2hhbm5lbChtYWluU2VydmljZSksXG5cdFx0fTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSBhcyBQYXJ0aWFsPElDb25maWd1cmF0aW9uU2VydmljZT4pO1xuXHRcdHF1aWNrSW5wdXRTZXJ2aWNlU3R1YiA9IHt9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVF1aWNrSW5wdXRTZXJ2aWNlLCBxdWlja0lucHV0U2VydmljZVN0dWIgYXMgUGFydGlhbDxJUXVpY2tJbnB1dFNlcnZpY2U+KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTaGFyZWRQcm9jZXNzU2VydmljZSwgc2hhcmVkUHJvY2Vzc1NlcnZpY2UgYXMgSVNoYXJlZFByb2Nlc3NTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIGFzIFBhcnRpYWw8SVJlbW90ZUFnZW50SG9zdFNlcnZpY2U+KTtcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlID0gbmV3IENhcHR1cmluZ05vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlIGFzIFBhcnRpYWw8SU5vdGlmaWNhdGlvblNlcnZpY2U+KTtcblx0XHRsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLCBsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlIGFzIFBhcnRpYWw8SVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2U+KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWFsb2dTZXJ2aWNlLCB7XG5cdFx0XHRwcm9tcHQ6ICgoKSA9PiB7IHRocm93IG5ldyBFcnJvcigndW5leHBlY3RlZCBkaWFsb2dTZXJ2aWNlLnByb21wdCBjYWxsJyk7IH0pIGFzIHVua25vd24gYXMgSURpYWxvZ1NlcnZpY2VbJ3Byb21wdCddLFxuXHRcdH0gYXMgUGFydGlhbDxJRGlhbG9nU2VydmljZT4pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2R1Y3RTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgbmFtZVNob3J0OiAnVGVzdCBQcm9kdWN0JyB9IGFzIElQcm9kdWN0U2VydmljZSk7XG5cdFx0aG9zdEtleVRydXN0U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU1NISG9zdEtleVRydXN0U2VydmljZShkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTU0hIb3N0S2V5VHJ1c3RTZXJ2aWNlLCBob3N0S2V5VHJ1c3RTZXJ2aWNlIGFzIFBhcnRpYWw8SVNTSEhvc3RLZXlUcnVzdFNlcnZpY2U+KTtcblxuXHRcdGNvbnN0IGNsaWVudFdhaXRlcnM6IERlZmVycmVkUHJvbWlzZTxNb2NrUHJvdG9jb2xDbGllbnQ+W10gPSBbXTtcblx0XHR3YWl0Rm9yQ2xpZW50ID0gKGluZGV4OiBudW1iZXIpOiBQcm9taXNlPE1vY2tQcm90b2NvbENsaWVudD4gPT4ge1xuXHRcdFx0aWYgKGNyZWF0ZWRDbGllbnRzW2luZGV4XSkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNyZWF0ZWRDbGllbnRzW2luZGV4XSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gKGNsaWVudFdhaXRlcnNbaW5kZXhdID8/PSBuZXcgRGVmZXJyZWRQcm9taXNlPE1vY2tQcm90b2NvbENsaWVudD4oKSkucDtcblx0XHR9O1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU1NIUmVsYXlDbGllbnRGYWN0b3J5LCB7XG5cdFx0XHRjcmVhdGVDbGllbnQ6IChfbWFpblNlcnZpY2U6IElTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSwgX2Nvbm5lY3Rpb25JZDogc3RyaW5nLCBfYWRkcmVzczogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGMgPSBuZXcgTW9ja1Byb3RvY29sQ2xpZW50KCk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChjKTtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBjcmVhdGVkQ2xpZW50cy5sZW5ndGg7XG5cdFx0XHRcdGNyZWF0ZWRDbGllbnRzLnB1c2goYyk7XG5cdFx0XHRcdGNsaWVudFdhaXRlcnNbaW5kZXhdPy5jb21wbGV0ZShjKTtcblx0XHRcdFx0cmV0dXJuIGMgYXMgdW5rbm93biBhcyBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudDtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2UpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHNhbXBsZUNvbmZpZzogSVNTSEFnZW50SG9zdENvbmZpZyA9IHtcblx0XHRob3N0OiAncmVtb3RlLmV4YW1wbGUnLFxuXHRcdHVzZXJuYW1lOiAndXNlcicsXG5cdFx0YXV0aE1ldGhvZDogMCBhcyBuZXZlcixcblx0XHRuYW1lOiAnTXkgUmVtb3RlJyxcblx0XHRzc2hDb25maWdIb3N0OiAncmVtb3RlLmV4YW1wbGUnLFxuXHR9O1xuXG5cdC8qKiBXYWl0IHVudGlsIHRoZSByZW5kZXJlciBoYXMgY3JlYXRlZCBpdHMgcHJvdG9jb2wgY2xpZW50LCB0aGVuIHJlc29sdmUgaXRzIGhhbmRzaGFrZS4gKi9cblx0YXN5bmMgZnVuY3Rpb24gYXdhaXRDbGllbnRUaGVuUmVzb2x2ZShpbmRleDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgd2FpdEZvckNsaWVudChpbmRleCk7XG5cdFx0Y2xpZW50LmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHR9XG5cblx0dGVzdCgnY29ubmVjdCByZWdpc3RlcnMgYSBtYW5hZ2VkIGNvbm5lY3Rpb24gd2l0aCBhIHRyYW5zcG9ydCBkaXNwb3NhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gc2VydmljZS5jb25uZWN0KHNhbXBsZUNvbmZpZyk7XG5cdFx0YXdhaXQgYXdhaXRDbGllbnRUaGVuUmVzb2x2ZSgwKTtcblx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBjb25uZWN0UHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZGVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW90ZUFnZW50SG9zdFNlcnZpY2UuYWRkZWRbMF0uYWRkcmVzcywgJ3NzaDpyZW1vdGUuZXhhbXBsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZGVkWzBdLnN0YXR1cz8ua2luZCwgJ2Nvbm5lY3RlZCcpO1xuXHRcdGFzc2VydC5vayhyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZGVkWzBdLnRyYW5zcG9ydCwgJ2EgdHJhbnNwb3J0IGRpc3Bvc2FibGUgaXMgcGFzc2VkIHNvIHJlbW92YWwgY2FuIHRlYXIgZG93biB0aGUgU1NIIHR1bm5lbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNvbm5lY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhbmRsZS5sb2NhbEFkZHJlc3MsICdzc2g6cmVtb3RlLmV4YW1wbGUnKTtcblx0fSk7XG5cblx0dGVzdCgnY29ubmVjdCB0aHJlYWRzIHRoZSBzdG9yZWQgbG9jYXRpb24gcHJlZmVyZW5jZSBmb3IgdGhlIHN0YWJsZSBjb25uZWN0aW9uIGtleSBpbnRvIHRoZSBtYWluLXByb2Nlc3MgY29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2Uuc2V0UHJlZmVyZW5jZSgnc3NoOnJlbW90ZS5leGFtcGxlJywgJ2VkaXRvcicpO1xuXG5cdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBzZXJ2aWNlLmNvbm5lY3Qoc2FtcGxlQ29uZmlnKTtcblx0XHRhd2FpdCBhd2FpdENsaWVudFRoZW5SZXNvbHZlKDApO1xuXHRcdGF3YWl0IGNvbm5lY3RQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1haW5TZXJ2aWNlLmNvbm5lY3RDYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYWluU2VydmljZS5jb25uZWN0Q2FsbHNbMF0ucHJlZmVycmVkQWdlbnRMb2NhdGlvbiwgJ2VkaXRvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25uZWN0IG9taXRzIHByZWZlcnJlZEFnZW50TG9jYXRpb24gZnJvbSB0aGUgbWFpbi1wcm9jZXNzIGNvbmZpZyB3aGVuIG5vIHByZWZlcmVuY2UgaXMgc3RvcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gc2VydmljZS5jb25uZWN0KHNhbXBsZUNvbmZpZyk7XG5cdFx0YXdhaXQgYXdhaXRDbGllbnRUaGVuUmVzb2x2ZSgwKTtcblx0XHRhd2FpdCBjb25uZWN0UHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYWluU2VydmljZS5jb25uZWN0Q2FsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFpblNlcnZpY2UuY29ubmVjdENhbGxzWzBdLnByZWZlcnJlZEFnZW50TG9jYXRpb24sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29ubmVjdCB0aHJlYWRzIHRoZSBzdG9yZWQgbG9jYXRpb24gcHJlZmVyZW5jZSBmb3Igc3NoQ29uZmlnSG9zdCBpbnRvIHRoZSBtYWluLXByb2Nlc3MgcmVjb25uZWN0IGNhbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0bG9jYXRpb25QcmVmZXJlbmNlU2VydmljZS5zZXRQcmVmZXJlbmNlKCdzc2g6cmVtb3RlLmV4YW1wbGUnLCAnZGVkaWNhdGVkJyk7XG5cblx0XHRjb25zdCByZWNvbm5lY3RQcm9taXNlID0gc2VydmljZS5yZWNvbm5lY3QoJ3JlbW90ZS5leGFtcGxlJywgJ015IFJlbW90ZScpO1xuXHRcdGF3YWl0IGF3YWl0Q2xpZW50VGhlblJlc29sdmUoMCk7XG5cdFx0YXdhaXQgcmVjb25uZWN0UHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYWluU2VydmljZS5yZWNvbm5lY3RDYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYWluU2VydmljZS5yZWNvbm5lY3RDYWxsc1swXS5zc2hDb25maWdIb3N0LCAncmVtb3RlLmV4YW1wbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFpblNlcnZpY2UucmVjb25uZWN0Q2FsbHNbMF0ucHJlZmVycmVkQWdlbnRMb2NhdGlvbiwgJ2RlZGljYXRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3Qgb21pdHMgcHJlZmVycmVkQWdlbnRMb2NhdGlvbiBmcm9tIHRoZSBtYWluLXByb2Nlc3MgY2FsbCB3aGVuIG5vIHByZWZlcmVuY2UgaXMgc3RvcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlY29ubmVjdFByb21pc2UgPSBzZXJ2aWNlLnJlY29ubmVjdCgncmVtb3RlLmV4YW1wbGUnLCAnTXkgUmVtb3RlJyk7XG5cdFx0YXdhaXQgYXdhaXRDbGllbnRUaGVuUmVzb2x2ZSgwKTtcblx0XHRhd2FpdCByZWNvbm5lY3RQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1haW5TZXJ2aWNlLnJlY29ubmVjdENhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1haW5TZXJ2aWNlLnJlY29ubmVjdENhbGxzWzBdLnByZWZlcnJlZEFnZW50TG9jYXRpb24sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nvbm5lY3QgdXNlcyB0aGUgcHJlZmVyZW5jZSBmb3IgaXRzIG93biBzdGFibGUgY29ubmVjdGlvbiBrZXksIG5vdCBhbiB1bnJlbGF0ZWQgaG9zdFxcJ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0bG9jYXRpb25QcmVmZXJlbmNlU2VydmljZS5zZXRQcmVmZXJlbmNlKCdzc2g6cmVtb3RlLmV4YW1wbGUnLCAnZWRpdG9yJyk7XG5cdFx0bG9jYXRpb25QcmVmZXJlbmNlU2VydmljZS5zZXRQcmVmZXJlbmNlKCdzc2g6b3RoZXIuZXhhbXBsZScsICdkZWRpY2F0ZWQnKTtcblxuXHRcdGNvbnN0IGNvbm5lY3RQcm9taXNlID0gc2VydmljZS5jb25uZWN0KHsgLi4uc2FtcGxlQ29uZmlnLCBob3N0OiAnb3RoZXIuZXhhbXBsZScsIHNzaENvbmZpZ0hvc3Q6ICdvdGhlci5leGFtcGxlJyB9KTtcblx0XHRhd2FpdCBhd2FpdENsaWVudFRoZW5SZXNvbHZlKDApO1xuXHRcdGF3YWl0IGNvbm5lY3RQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1haW5TZXJ2aWNlLmNvbm5lY3RDYWxsc1swXS5wcmVmZXJyZWRBZ2VudExvY2F0aW9uLCAnZGVkaWNhdGVkJywgJ211c3QgdXNlIHRoZSBwcmVmZXJlbmNlIGZvciB0aGlzIGNvbmZpZ1xcJ3Mgb3duIGtleSwgbm90IGFuIHVucmVsYXRlZCBob3N0XFwncycpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmNvbXBhdGlibGUgaGFuZHNoYWtlIGtlZXBzIFNTSCB0dW5uZWwgcmVnaXN0ZXJlZCBmb3Igc2VydmVyIHVwZ3JhZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubmVjdFByb21pc2UgPSBzZXJ2aWNlLmNvbm5lY3Qoc2FtcGxlQ29uZmlnKTtcblx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCB3YWl0Rm9yQ2xpZW50KDApO1xuXHRcdGF3YWl0IGNsaWVudC5jb25uZWN0RGVmZXJyZWQuZXJyb3IobmV3IFByb3RvY29sRXJyb3IoXG5cdFx0XHRBSFBfVU5TVVBQT1JURURfUFJPVE9DT0xfVkVSU0lPTixcblx0XHRcdCdVbnN1cHBvcnRlZCBwcm90b2NvbCB2ZXJzaW9uJyxcblx0XHRcdHsgc3VwcG9ydGVkVmVyc2lvbnM6IFsnXjAuMi4wJ10sIF9tZXRhOiB7IHZzY29kZVVwZ3JhZGVNZXRob2Q6ICdfdnNjb2RlVXBncmFkZScgfSB9LFxuXHRcdCkpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29ubmVjdFByb21pc2UsIC9VbnN1cHBvcnRlZCBwcm90b2NvbCB2ZXJzaW9uLyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFkZGVkOiByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZGVkLm1hcCgoeyBhZGRyZXNzLCBzdGF0dXMgfSkgPT4gKHsgYWRkcmVzcywgc3RhdHVzIH0pKSxcblx0XHRcdGNvbm5lY3Rpb25zOiBzZXJ2aWNlLmNvbm5lY3Rpb25zLm1hcChjb25uZWN0aW9uID0+IGNvbm5lY3Rpb24ubG9jYWxBZGRyZXNzKSxcblx0XHRcdGRpc2Nvbm5lY3RDYWxsczogbWFpblNlcnZpY2UuZGlzY29ubmVjdENhbGxzLFxuXHRcdH0sIHtcblx0XHRcdGFkZGVkOiBbe1xuXHRcdFx0XHRhZGRyZXNzOiAnc3NoOnJlbW90ZS5leGFtcGxlJyxcblx0XHRcdFx0c3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmluY29tcGF0aWJsZSgnVW5zdXBwb3J0ZWQgcHJvdG9jb2wgdmVyc2lvbicsIFtQUk9UT0NPTF9WRVJTSU9OXSwgWydeMC4yLjAnXSwgJ192c2NvZGVVcGdyYWRlJyksXG5cdFx0XHR9XSxcblx0XHRcdGNvbm5lY3Rpb25zOiBbJ3NzaDpyZW1vdGUuZXhhbXBsZSddLFxuXHRcdFx0ZGlzY29ubmVjdENhbGxzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVjb25uZWN0IGFmdGVyIGluY29tcGF0aWJsZSBoYW5kc2hha2UgcmVwbGFjZXMgdGhlIHN0YWxlIGhhbmRsZSBhbmQgcmUtaGFuZHNoYWtlcycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBQaW4gYSBzdGFibGUgY29ubmVjdGlvbklkIHNvIHRoZSBzaW11bGF0ZWQgYHJlcGxhY2VSZWxheWAgcmVjb25uZWN0XG5cdFx0Ly8gcmV0dXJucyB0aGUgc2FtZSBpZCBhcyB0aGUgaW5pdGlhbCBjb25uZWN0IFx1MjAxNCB0aGF0IGlzIHRoZSByZWFsXG5cdFx0Ly8gYmVoYXZpb3Igb2YgU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UuY29ubmVjdChyZXBsYWNlUmVsYXk9dHJ1ZSkuXG5cdFx0bWFpblNlcnZpY2UuY29ubmVjdFJlc3VsdCA9IHsgY29ubmVjdGlvbklkOiAnY29ubi1zdGFibGUnLCBhZGRyZXNzOiAnc3NoOnJlbW90ZS5leGFtcGxlJyB9O1xuXG5cdFx0Ly8gRmlyc3QgY29ubmVjdDogaGFuZHNoYWtlIHJlamVjdGVkIGFzIGluY29tcGF0aWJsZS4gUGVyIHRoZSBleGlzdGluZ1xuXHRcdC8vIGZpeCwgdGhpcyBzdGlsbCByZWdpc3RlcnMgYSBtYW5hZ2VkIGNvbm5lY3Rpb24gaW4gYGluY29tcGF0aWJsZWBcblx0XHQvLyBzdGF0ZSBzbyB0aGUgc2VydmVyLXVwZ3JhZGUgUlBDIGNhbiByZWFjaCB0aGUgaG9zdC5cblx0XHRjb25zdCBmaXJzdENvbm5lY3QgPSBzZXJ2aWNlLmNvbm5lY3Qoc2FtcGxlQ29uZmlnKTtcblx0XHRjb25zdCBmaXJzdENsaWVudCA9IGF3YWl0IHdhaXRGb3JDbGllbnQoMCk7XG5cdFx0YXdhaXQgZmlyc3RDbGllbnQuY29ubmVjdERlZmVycmVkLmVycm9yKG5ldyBQcm90b2NvbEVycm9yKFxuXHRcdFx0QUhQX1VOU1VQUE9SVEVEX1BST1RPQ09MX1ZFUlNJT04sXG5cdFx0XHQnVW5zdXBwb3J0ZWQgcHJvdG9jb2wgdmVyc2lvbicsXG5cdFx0XHR7IHN1cHBvcnRlZFZlcnNpb25zOiBbJ14wLjIuMCddLCBfbWV0YTogeyB2c2NvZGVVcGdyYWRlTWV0aG9kOiAnX3ZzY29kZVVwZ3JhZGUnIH0gfSxcblx0XHQpKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhmaXJzdENvbm5lY3QsIC9VbnN1cHBvcnRlZCBwcm90b2NvbCB2ZXJzaW9uLyk7XG5cblx0XHQvLyBVc2VyIHRyaWdnZXJzIHRoZSBzZXJ2ZXIgdXBncmFkZSBhbmQgdGhlbiB0aGUgY29udHJpYnV0aW9uIHJlY29ubmVjdHMuXG5cdFx0Ly8gVGhlIHJlY29ubmVjdCBtdXN0IE5PVCBzaG9ydC1jaXJjdWl0IHRvIHRoZSBzdGFsZSBoYW5kbGUgKHdob3NlXG5cdFx0Ly8gcHJvdG9jb2wgY2xpZW50IGlzIHBlcm1hbmVudGx5IHN0dWNrIGluIGluY29tcGF0aWJsZSBzdGF0ZSk7IGl0IG11c3Rcblx0XHQvLyBidWlsZCBhIGZyZXNoIGNsaWVudCBhbmQgY29tcGxldGUgYSBmcmVzaCBoYW5kc2hha2UgYWdhaW5zdCB0aGVcblx0XHQvLyB1cGdyYWRlZCBzZXJ2ZXIuXG5cdFx0Y29uc3QgcmVjb25uZWN0UHJvbWlzZSA9IHNlcnZpY2UucmVjb25uZWN0KCdyZW1vdGUuZXhhbXBsZScsICdNeSBSZW1vdGUnKTtcblx0XHRjb25zdCBzZWNvbmRDbGllbnQgPSBhd2FpdCB3YWl0Rm9yQ2xpZW50KDEpO1xuXHRcdGF3YWl0IHNlY29uZENsaWVudC5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCByZWNvbm5lY3RQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjbGllbnRDb3VudDogY3JlYXRlZENsaWVudHMubGVuZ3RoLFxuXHRcdFx0YWRkZWQ6IHJlbW90ZUFnZW50SG9zdFNlcnZpY2UuYWRkZWQubWFwKCh7IGFkZHJlc3MsIHN0YXR1cyB9KSA9PiAoeyBhZGRyZXNzLCBzdGF0dXNLaW5kOiBzdGF0dXM/LmtpbmQgfSkpLFxuXHRcdFx0Ly8gVGhlIHJlcGxhY2VSZWxheSBwYXRoIGtlZXBzIHRoZSBTU0ggdHVubmVsIGFsaXZlIFx1MjAxNCB3ZSBtdXN0IG5vdFxuXHRcdFx0Ly8gaGF2ZSBhc2tlZCB0aGUgbWFpbiBzZXJ2aWNlIHRvIGRpc2Nvbm5lY3QgaXQuXG5cdFx0XHRkaXNjb25uZWN0Q2FsbHM6IG1haW5TZXJ2aWNlLmRpc2Nvbm5lY3RDYWxscyxcblx0XHRcdC8vIEV4YWN0bHkgb25lIHJlbmRlcmVyLXNpZGUgaGFuZGxlIGZvciB0aGUgYWRkcmVzcy5cblx0XHRcdGNvbm5lY3Rpb25zOiBzZXJ2aWNlLmNvbm5lY3Rpb25zLm1hcChjb25uZWN0aW9uID0+IGNvbm5lY3Rpb24ubG9jYWxBZGRyZXNzKSxcblx0XHR9LCB7XG5cdFx0XHRjbGllbnRDb3VudDogMixcblx0XHRcdGFkZGVkOiBbXG5cdFx0XHRcdHsgYWRkcmVzczogJ3NzaDpyZW1vdGUuZXhhbXBsZScsIHN0YXR1c0tpbmQ6ICdpbmNvbXBhdGlibGUnIH0sXG5cdFx0XHRcdHsgYWRkcmVzczogJ3NzaDpyZW1vdGUuZXhhbXBsZScsIHN0YXR1c0tpbmQ6ICdjb25uZWN0ZWQnIH0sXG5cdFx0XHRdLFxuXHRcdFx0ZGlzY29ubmVjdENhbGxzOiBbXSxcblx0XHRcdGNvbm5lY3Rpb25zOiBbJ3NzaDpyZW1vdGUuZXhhbXBsZSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNhYmxlZCBzZXR0aW5nIHByZXZlbnRzIFNTSCB0dW5uZWwgY29ubmVjdHMgYW5kIHJlY29ubmVjdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0UmVtb3RlQWdlbnRIb3N0c0VuYWJsZWQoZmFsc2UpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gc2VydmljZS5jb25uZWN0KHNhbXBsZUNvbmZpZyksIC9ub3QgZW5hYmxlZC8pO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UucmVjb25uZWN0KCdyZW1vdGUuZXhhbXBsZScsICdNeSBSZW1vdGUnKSwgL25vdCBlbmFibGVkLyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY29ubmVjdENhbGxzOiBtYWluU2VydmljZS5jb25uZWN0Q2FsbHMsIHJlY29ubmVjdENhbGxzOiBtYWluU2VydmljZS5yZWNvbm5lY3RDYWxscywgYWRkZWQ6IHJlbW90ZUFnZW50SG9zdFNlcnZpY2UuYWRkZWQgfSwge1xuXHRcdFx0Y29ubmVjdENhbGxzOiBbXSxcblx0XHRcdHJlY29ubmVjdENhbGxzOiBbXSxcblx0XHRcdGFkZGVkOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZpbmcgdGhlIGVudHJ5IHRlYXJzIGRvd24gdGhlIFNTSCB0dW5uZWwgYW5kIHRoZSByZW5kZXJlci1zaWRlIGhhbmRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IHNlcnZpY2UuY29ubmVjdChzYW1wbGVDb25maWcpO1xuXHRcdGF3YWl0IGF3YWl0Q2xpZW50VGhlblJlc29sdmUoMCk7XG5cdFx0YXdhaXQgY29ubmVjdFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFpblNlcnZpY2UuZGlzY29ubmVjdENhbGxzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIFNpbXVsYXRlIHRoZSB1c2VyIGNsaWNraW5nIFwiUmVtb3ZlIFJlbW90ZVwiOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZVxuXHRcdC8vIGRpc3Bvc2VzIHRoZSBwZXItZW50cnkgc3RvcmUsIHdoaWNoIHJ1bnMgb3VyIHRyYW5zcG9ydCBkaXNwb3NhYmxlLlxuXHRcdHJlbW90ZUFnZW50SG9zdFNlcnZpY2UucmVtb3ZlRW50cnkoJ3NzaDpyZW1vdGUuZXhhbXBsZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYWluU2VydmljZS5kaXNjb25uZWN0Q2FsbHMsIFsnY29ubi0xJ10sICdtYWluLXByb2Nlc3MgdHVubmVsIGlzIHRvbGQgdG8gZGlzY29ubmVjdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNvbm5lY3Rpb25zLmxlbmd0aCwgMCwgJ3JlbmRlcmVyLXNpZGUgaGFuZGxlIGlzIGRyb3BwZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnY29ubmVjdCBhZnRlciByZW1vdmFsIGRvZXMgbm90IHJldXNlIHRoZSBwcmV2aW91cyBoYW5kbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gRmlyc3QgY29ubmVjdCBcdTIxOTIgZW50cnkgcmVnaXN0ZXJlZCwgdGhlbiByZW1vdmVkLlxuXHRcdGNvbnN0IGMxID0gc2VydmljZS5jb25uZWN0KHNhbXBsZUNvbmZpZyk7XG5cdFx0YXdhaXQgYXdhaXRDbGllbnRUaGVuUmVzb2x2ZSgwKTtcblx0XHRhd2FpdCBjMTtcblx0XHRyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLnJlbW92ZUVudHJ5KCdzc2g6cmVtb3RlLmV4YW1wbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jb25uZWN0aW9ucy5sZW5ndGgsIDApO1xuXG5cdFx0Ly8gU2Vjb25kIGNvbm5lY3QgXHUyMTkyIG1haW4gcmV0dXJucyBhIG5ldyBjb25uZWN0aW9uSWQ7IHJlbmRlcmVyIGNyZWF0ZXNcblx0XHQvLyBhIGZyZXNoIGhhbmRsZSBhbmQgcmVnaXN0ZXJzIGEgbmV3IG1hbmFnZWQgZW50cnkuXG5cdFx0bWFpblNlcnZpY2UuY29ubmVjdFJlc3VsdCA9IHsgY29ubmVjdGlvbklkOiAnY29ubi0yJywgYWRkcmVzczogJ3NzaDpyZW1vdGUuZXhhbXBsZScgfTtcblx0XHRjb25zdCBjMiA9IHNlcnZpY2UuY29ubmVjdChzYW1wbGVDb25maWcpO1xuXHRcdGF3YWl0IGF3YWl0Q2xpZW50VGhlblJlc29sdmUoMSk7XG5cdFx0YXdhaXQgYzI7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jb25uZWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZGVkLmxlbmd0aCwgMiwgJ2VhY2ggY29ubmVjdCBwcm9kdWNlcyBhIGZyZXNoIG1hbmFnZWQtY29ubmVjdGlvbiByZWdpc3RyYXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnbWFpbi1wcm9jZXNzIG9uRGlkQ2xvc2VDb25uZWN0aW9uIGNsZWFucyB1cCByZW5kZXJlciBoYW5kbGUgd2l0aG91dCBkb3VibGUtZGlzY29ubmVjdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uZWN0UHJvbWlzZSA9IHNlcnZpY2UuY29ubmVjdChzYW1wbGVDb25maWcpO1xuXHRcdGF3YWl0IGF3YWl0Q2xpZW50VGhlblJlc29sdmUoMCk7XG5cdFx0YXdhaXQgY29ubmVjdFByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIFNpbXVsYXRlIG1haW4gcHJvY2VzcyBjbG9zaW5nIHRoZSBjb25uZWN0aW9uIG9uIGl0cyBvd24gKGUuZy4gU1NIIGRyb3BwZWQpLlxuXHRcdC8vIFdlIGNhbid0IGRpcmVjdGx5IGZpcmUgb24gdGhlIHdyYXBwZWQgZW1pdHRlciB0aHJvdWdoIHRoZSBjaGFubmVsIGJlY2F1c2Vcblx0XHQvLyBQcm94eUNoYW5uZWwgaXMgb25lLWRpcmVjdGlvbmFsOyBpbnN0ZWFkIHdlIHRyaWdnZXIgdmlhIHRoZSBtb2NrIHNlcnZpY2Vcblx0XHQvLyBlbWl0dGVyIHRoYXQgdGhlIHJlbmRlcmVyIHN1YnNjcmliZWQgdG8uXG5cdFx0KG1haW5TZXJ2aWNlIGFzIHVua25vd24gYXMgeyBfb25EaWRDbG9zZUNvbm5lY3Rpb246IEVtaXR0ZXI8c3RyaW5nPiB9KS5fb25EaWRDbG9zZUNvbm5lY3Rpb24uZmlyZSgnY29ubi0xJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jb25uZWN0aW9ucy5sZW5ndGgsIDAsICdoYW5kbGUgZHJvcHBlZCBvbiBtYWluIGNsb3NlJyk7XG5cdFx0Ly8gUmVtb3ZpbmcgdGhlIChhbHJlYWR5LWdvbmUpIGVudHJ5IHNob3VsZG4ndCB0cmlnZ2VyIGFub3RoZXIgZGlzY29ubmVjdCBjYWxsLlxuXHRcdHJlbW90ZUFnZW50SG9zdFNlcnZpY2UucmVtb3ZlRW50cnkoJ3NzaDpyZW1vdGUuZXhhbXBsZScpO1xuXHRcdC8vIE9uZSBkaXNjb25uZWN0IGZyb20gdGhlIHRyYW5zcG9ydCBkaXNwb3NhYmxlIGlzIGZpbmU7IHdlIGp1c3Qgd2FudCB0byBtYWtlXG5cdFx0Ly8gc3VyZSB3ZSdyZSBub3QgYXQgcmlzayBvZiBpc3N1aW5nIGEgc2Vjb25kIG9uZSBhZ2FpbnN0IGEgc3RhbGUgaWQuXG5cdFx0YXNzZXJ0Lm9rKG1haW5TZXJ2aWNlLmRpc2Nvbm5lY3RDYWxscy5sZW5ndGggPD0gMSwgJ25vIGR1cGxpY2F0ZSBkaXNjb25uZWN0IGFnYWluc3QgYSBzdGFsZSBjb25uZWN0aW9uSWQnKTtcblx0fSk7XG5cblx0Ly8gLS0tIFNTSCBmYWlsb3ZlciBub3RpZmljYXRpb246IGVkaXRvci1vd25lZCBcdTIxOTIgc3RhbmRhbG9uZSBvbiBhbiB1bmF0dGVuZGVkIHJlY29ubmVjdCAtLS1cblxuXHRjb25zdCBOT1RJRklDQVRJT05fTUVTU0FHRSA9ICdUaGUgZWRpdG9yIGFnZW50IGhvc3QgZXhpdGVkLiBSZWNvbm5lY3RlZCB0byBhIGRlZGljYXRlZCBhZ2VudCBob3N0LiBJbi1wcm9ncmVzcyB3b3JrIG1heSBoYXZlIGJlZW4gaW50ZXJydXB0ZWQuJztcblxuXHQvKiogRmlyZXMgdGhlIG1haW4tcHJvY2VzcyBjbG9zZSBldmVudCB0byBzaW11bGF0ZSBuYXR1cmFsIGNvbm5lY3Rpb24gY2xlYW51cCBiZXR3ZWVuIGNvbm5lY3QvcmVjb25uZWN0IGNhbGxzLiAqL1xuXHRmdW5jdGlvbiBmaXJlTWFpblByb2Nlc3NDbG9zZShjb25uZWN0aW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdChtYWluU2VydmljZSBhcyB1bmtub3duIGFzIHsgX29uRGlkQ2xvc2VDb25uZWN0aW9uOiBFbWl0dGVyPHN0cmluZz4gfSkuX29uRGlkQ2xvc2VDb25uZWN0aW9uLmZpcmUoY29ubmVjdGlvbklkKTtcblx0fVxuXG5cdHRlc3QoJ2luaXRpYWwgY29ubmVjdCBuZXZlciBub3RpZmllcywgZXZlbiB3aGVuIGl0IGxhbmRzIG9uIGEgc3RhbmRhbG9uZSBlbmRwb2ludCcsIGFzeW5jICgpID0+IHtcblx0XHRtYWluU2VydmljZS5jb25uZWN0UmVzdWx0ID0geyBzZXJ2ZXJUeXBlOiAnc3RhbmRhbG9uZScgfTtcblx0XHRjb25zdCBjMSA9IHNlcnZpY2UuY29ubmVjdChzYW1wbGVDb25maWcpO1xuXHRcdGF3YWl0IGF3YWl0Q2xpZW50VGhlblJlc29sdmUoMCk7XG5cdFx0YXdhaXQgYzE7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5vdGlmaWNhdGlvblNlcnZpY2UuaW5mb01lc3NhZ2VzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIGF1dG9tYXRpYy9iYWNrZ3JvdW5kIHJlY29ubmVjdCB0aGF0IGZhaWxzIG92ZXIgZnJvbSBhbiBlZGl0b3Itb3duZWQgZW5kcG9pbnQgdG8gYSBzdGFuZGFsb25lIGVuZHBvaW50IHNob3dzIGV4YWN0bHkgb25lIG5vdGlmaWNhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHQvLyBJbml0aWFsIGNvbm5lY3Qgc2VsZWN0cyBhbiBlZGl0b3Itb3duZWQgZW5kcG9pbnQuXG5cdFx0bWFpblNlcnZpY2UuY29ubmVjdFJlc3VsdCA9IHsgc2VydmVyVHlwZTogJ2VkaXRvcicgfTtcblx0XHRjb25zdCBjMSA9IHNlcnZpY2UuY29ubmVjdChzYW1wbGVDb25maWcpO1xuXHRcdGF3YWl0IGF3YWl0Q2xpZW50VGhlblJlc29sdmUoMCk7XG5cdFx0YXdhaXQgYzE7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChub3RpZmljYXRpb25TZXJ2aWNlLmluZm9NZXNzYWdlcywgW10sICdubyBub3RpZmljYXRpb24gb24gaW5pdGlhbCBjb25uZWN0Jyk7XG5cblx0XHQvLyBUaGUgU1NIIHR1bm5lbCBkcm9wcyBhbmQgdGhlIHJlbmRlcmVyLXNpZGUgaGFuZGxlIGlzIGNsZWFuZWQgdXAuXG5cdFx0Ly8gVGhpcyBkaXNjb25uZWN0IGNsZWFudXAgbXVzdCBOT1QgZXJhc2UgdGhlIGxhc3Qta25vd24gc2VydmVyIHR5cGUuXG5cdFx0ZmlyZU1haW5Qcm9jZXNzQ2xvc2UoJ2Nvbm4tMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNvbm5lY3Rpb25zLmxlbmd0aCwgMCk7XG5cblx0XHQvLyBBIHNpbGVudC9iYWNrZ3JvdW5kIHJlY29ubmVjdCAodXNlckluaXRpYXRlZDogZmFsc2UpIGxhbmRzIG9uIGFcblx0XHQvLyBzdGFuZGFsb25lIGVuZHBvaW50IGluc3RlYWQgb2YgdGhlIGVkaXRvci1vd25lZCBvbmUuXG5cdFx0bWFpblNlcnZpY2UuY29ubmVjdFJlc3VsdCA9IHsgY29ubmVjdGlvbklkOiAnY29ubi0yJywgc2VydmVyVHlwZTogJ3N0YW5kYWxvbmUnIH07XG5cdFx0Y29uc3QgciA9IHNlcnZpY2UucmVjb25uZWN0KCdyZW1vdGUuZXhhbXBsZScsICdNeSBSZW1vdGUnLCBmYWxzZSk7XG5cdFx0YXdhaXQgYXdhaXRDbGllbnRUaGVuUmVzb2x2ZSgxKTtcblx0XHRhd2FpdCByO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChub3RpZmljYXRpb25TZXJ2aWNlLmluZm9NZXNzYWdlcywgW05PVElGSUNBVElPTl9NRVNTQUdFXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgdXNlci1pbml0aWF0ZWQgcmVjb25uZWN0IGZyb20gYW4gZWRpdG9yLW93bmVkIGVuZHBvaW50IHRvIGEgc3RhbmRhbG9uZSBlbmRwb2ludCBkb2VzIG5vdCBub3RpZnknLCBhc3luYyAoKSA9PiB7XG5cdFx0bWFpblNlcnZpY2UuY29ubmVjdFJlc3VsdCA9IHsgc2VydmVyVHlwZTogJ2VkaXRvcicgfTtcblx0XHRjb25zdCBjMSA9IHNlcnZpY2UuY29ubmVjdChzYW1wbGVDb25maWcpO1xuXHRcdGF3YWl0IGF3YWl0Q2xpZW50VGhlblJlc29sdmUoMCk7XG5cdFx0YXdhaXQgYzE7XG5cblx0XHRmaXJlTWFpblByb2Nlc3NDbG9zZSgnY29ubi0xJyk7XG5cblx0XHRtYWluU2VydmljZS5jb25uZWN0UmVzdWx0ID0geyBjb25uZWN0aW9uSWQ6ICdjb25uLTInLCBzZXJ2ZXJUeXBlOiAnc3RhbmRhbG9uZScgfTtcblx0XHRjb25zdCByID0gc2VydmljZS5yZWNvbm5lY3QoJ3JlbW90ZS5leGFtcGxlJywgJ015IFJlbW90ZScsIC8qIHVzZXJJbml0aWF0ZWQgKi8gdHJ1ZSk7XG5cdFx0YXdhaXQgYXdhaXRDbGllbnRUaGVuUmVzb2x2ZSgxKTtcblx0XHRhd2FpdCByO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChub3RpZmljYXRpb25TZXJ2aWNlLmluZm9NZXNzYWdlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3Qgd2l0aG91dCBhbiBleHBsaWNpdCB1c2VySW5pdGlhdGVkIGFyZ3VtZW50IGRlZmF1bHRzIHRvIHVzZXItaW5pdGlhdGVkIGFuZCBkb2VzIG5vdCBub3RpZnknLCBhc3luYyAoKSA9PiB7XG5cdFx0bWFpblNlcnZpY2UuY29ubmVjdFJlc3VsdCA9IHsgc2VydmVyVHlwZTogJ2VkaXRvcicgfTtcblx0XHRjb25zdCBjMSA9IHNlcnZpY2UuY29ubmVjdChzYW1wbGVDb25maWcpO1xuXHRcdGF3YWl0IGF3YWl0Q2xpZW50VGhlblJlc29sdmUoMCk7XG5cdFx0YXdhaXQgYzE7XG5cblx0XHRmaXJlTWFpblByb2Nlc3NDbG9zZSgnY29ubi0xJyk7XG5cblx0XHRtYWluU2VydmljZS5jb25uZWN0UmVzdWx0ID0geyBjb25uZWN0aW9uSWQ6ICdjb25uLTInLCBzZXJ2ZXJUeXBlOiAnc3RhbmRhbG9uZScgfTtcblx0XHRjb25zdCByID0gc2VydmljZS5yZWNvbm5lY3QoJ3JlbW90ZS5leGFtcGxlJywgJ015IFJlbW90ZScpO1xuXHRcdGF3YWl0IGF3YWl0Q2xpZW50VGhlblJlc29sdmUoMSk7XG5cdFx0YXdhaXQgcjtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm90aWZpY2F0aW9uU2VydmljZS5pbmZvTWVzc2FnZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnYW4gYXV0b21hdGljIHJlY29ubmVjdCB0aGF0IHN0YXlzIG9uIGFuIGVkaXRvci1vd25lZCBlbmRwb2ludCBkb2VzIG5vdCBub3RpZnknLCBhc3luYyAoKSA9PiB7XG5cdFx0bWFpblNlcnZpY2UuY29ubmVjdFJlc3VsdCA9IHsgc2VydmVyVHlwZTogJ2VkaXRvcicgfTtcblx0XHRjb25zdCBjMSA9IHNlcnZpY2UuY29ubmVjdChzYW1wbGVDb25maWcpO1xuXHRcdGF3YWl0IGF3YWl0Q2xpZW50VGhlblJlc29sdmUoMCk7XG5cdFx0YXdhaXQgYzE7XG5cblx0XHRmaXJlTWFpblByb2Nlc3NDbG9zZSgnY29ubi0xJyk7XG5cblx0XHRtYWluU2VydmljZS5jb25uZWN0UmVzdWx0ID0geyBjb25uZWN0aW9uSWQ6ICdjb25uLTInLCBzZXJ2ZXJUeXBlOiAnZWRpdG9yJyB9O1xuXHRcdGNvbnN0IHIgPSBzZXJ2aWNlLnJlY29ubmVjdCgncmVtb3RlLmV4YW1wbGUnLCAnTXkgUmVtb3RlJywgZmFsc2UpO1xuXHRcdGF3YWl0IGF3YWl0Q2xpZW50VGhlblJlc29sdmUoMSk7XG5cdFx0YXdhaXQgcjtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm90aWZpY2F0aW9uU2VydmljZS5pbmZvTWVzc2FnZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnYW4gYXV0b21hdGljIHJlY29ubmVjdCB0aGF0IHN0YXlzIG9uIGEgc3RhbmRhbG9uZSBlbmRwb2ludCBkb2VzIG5vdCBub3RpZnknLCBhc3luYyAoKSA9PiB7XG5cdFx0bWFpblNlcnZpY2UuY29ubmVjdFJlc3VsdCA9IHsgc2VydmVyVHlwZTogJ3N0YW5kYWxvbmUnIH07XG5cdFx0Y29uc3QgYzEgPSBzZXJ2aWNlLmNvbm5lY3Qoc2FtcGxlQ29uZmlnKTtcblx0XHRhd2FpdCBhd2FpdENsaWVudFRoZW5SZXNvbHZlKDApO1xuXHRcdGF3YWl0IGMxO1xuXG5cdFx0ZmlyZU1haW5Qcm9jZXNzQ2xvc2UoJ2Nvbm4tMScpO1xuXG5cdFx0bWFpblNlcnZpY2UuY29ubmVjdFJlc3VsdCA9IHsgY29ubmVjdGlvbklkOiAnY29ubi0yJywgc2VydmVyVHlwZTogJ3N0YW5kYWxvbmUnIH07XG5cdFx0Y29uc3QgciA9IHNlcnZpY2UucmVjb25uZWN0KCdyZW1vdGUuZXhhbXBsZScsICdNeSBSZW1vdGUnLCBmYWxzZSk7XG5cdFx0YXdhaXQgYXdhaXRDbGllbnRUaGVuUmVzb2x2ZSgxKTtcblx0XHRhd2FpdCByO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChub3RpZmljYXRpb25TZXJ2aWNlLmluZm9NZXNzYWdlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGZhaWxlZCAoaW5jb21wYXRpYmxlKSBhdXRvbWF0aWMgcmVjb25uZWN0IGRvZXMgbm90IG5vdGlmeSBldmVuIHRob3VnaCBpdCB0YXJnZXRzIGEgc3RhbmRhbG9uZSBlbmRwb2ludCcsIGFzeW5jICgpID0+IHtcblx0XHRtYWluU2VydmljZS5jb25uZWN0UmVzdWx0ID0geyBzZXJ2ZXJUeXBlOiAnZWRpdG9yJyB9O1xuXHRcdGNvbnN0IGMxID0gc2VydmljZS5jb25uZWN0KHNhbXBsZUNvbmZpZyk7XG5cdFx0YXdhaXQgYXdhaXRDbGllbnRUaGVuUmVzb2x2ZSgwKTtcblx0XHRhd2FpdCBjMTtcblxuXHRcdGZpcmVNYWluUHJvY2Vzc0Nsb3NlKCdjb25uLTEnKTtcblxuXHRcdG1haW5TZXJ2aWNlLmNvbm5lY3RSZXN1bHQgPSB7IGNvbm5lY3Rpb25JZDogJ2Nvbm4tMicsIHNlcnZlclR5cGU6ICdzdGFuZGFsb25lJyB9O1xuXHRcdGNvbnN0IHIgPSBzZXJ2aWNlLnJlY29ubmVjdCgncmVtb3RlLmV4YW1wbGUnLCAnTXkgUmVtb3RlJywgZmFsc2UpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IHdhaXRGb3JDbGllbnQoMSk7XG5cdFx0YXdhaXQgY2xpZW50LmNvbm5lY3REZWZlcnJlZC5lcnJvcihuZXcgUHJvdG9jb2xFcnJvcihcblx0XHRcdEFIUF9VTlNVUFBPUlRFRF9QUk9UT0NPTF9WRVJTSU9OLFxuXHRcdFx0J1Vuc3VwcG9ydGVkIHByb3RvY29sIHZlcnNpb24nLFxuXHRcdFx0eyBzdXBwb3J0ZWRWZXJzaW9uczogWydeMC4yLjAnXSwgX21ldGE6IHsgdnNjb2RlVXBncmFkZU1ldGhvZDogJ192c2NvZGVVcGdyYWRlJyB9IH0sXG5cdFx0KSk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMociwgL1Vuc3VwcG9ydGVkIHByb3RvY29sIHZlcnNpb24vKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm90aWZpY2F0aW9uU2VydmljZS5pbmZvTWVzc2FnZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnYSBkdXBsaWNhdGUgc2V0dXAgdGhhdCByZXVzZXMgYW4gYWxyZWFkeS1jb25uZWN0ZWQgaGFuZGxlIGRvZXMgbm90IG5vdGlmeScsIGFzeW5jICgpID0+IHtcblx0XHRtYWluU2VydmljZS5jb25uZWN0UmVzdWx0ID0geyBjb25uZWN0aW9uSWQ6ICdjb25uLTEnLCBzZXJ2ZXJUeXBlOiAnZWRpdG9yJyB9O1xuXHRcdGNvbnN0IGMxID0gc2VydmljZS5jb25uZWN0KHNhbXBsZUNvbmZpZyk7XG5cdFx0YXdhaXQgYXdhaXRDbGllbnRUaGVuUmVzb2x2ZSgwKTtcblx0XHRhd2FpdCBjMTtcblxuXHRcdC8vIFNlY29uZCBjb25uZWN0IHJlc29sdmVzIHRvIHRoZSBzYW1lIGNvbm5lY3Rpb25JZCB3aGlsZSB0aGUgZW50cnlcblx0XHQvLyBpcyBzdGlsbCBjb25uZWN0ZWQgXHUyMDE0IFNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2Ugc2hvcnQtY2lyY3VpdHMgdG9cblx0XHQvLyB0aGUgZXhpc3RpbmcgaGFuZGxlIGFuZCBuZXZlciByZS1ydW5zIGVuZHBvaW50LXNlbGVjdGlvbiB0cmFja2luZy5cblx0XHRjb25zdCBjMiA9IHNlcnZpY2UuY29ubmVjdChzYW1wbGVDb25maWcpO1xuXHRcdGF3YWl0IGMyO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRDbGllbnRzLmxlbmd0aCwgMSwgJ25vIHNlY29uZCBwcm90b2NvbCBjbGllbnQgaXMgY3JlYXRlZCBmb3IgdGhlIGR1cGxpY2F0ZSBzZXR1cCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm90aWZpY2F0aW9uU2VydmljZS5pbmZvTWVzc2FnZXMsIFtdKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1NTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2UgZW5kcG9pbnQgc2VsZWN0aW9uIHByZWZlcmVuY2UgKHJlbmRlcmVyKScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IG1haW5TZXJ2aWNlOiBNb2NrU1NITWFpblNlcnZpY2U7XG5cdGxldCBsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlOiBUZXN0UmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlU2VydmljZTtcblx0bGV0IGRpYWxvZ1NlcnZpY2VTdHViOiBQYXJ0aWFsPElEaWFsb2dTZXJ2aWNlPjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bWFpblNlcnZpY2UgPSBuZXcgTW9ja1NTSE1haW5TZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gbWFpblNlcnZpY2UuZGlzcG9zZSgpIH0pO1xuXG5cdFx0Y29uc3Qgc2hhcmVkUHJvY2Vzc1NlcnZpY2U6IFBhcnRpYWw8SVNoYXJlZFByb2Nlc3NTZXJ2aWNlPiA9IHtcblx0XHRcdGdldENoYW5uZWw6ICgpID0+IGFzQ2hhbm5lbChtYWluU2VydmljZSksXG5cdFx0fTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkgYXMgUGFydGlhbDxJQ29uZmlndXJhdGlvblNlcnZpY2U+KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElRdWlja0lucHV0U2VydmljZSwge30gYXMgUGFydGlhbDxJUXVpY2tJbnB1dFNlcnZpY2U+KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTaGFyZWRQcm9jZXNzU2VydmljZSwgc2hhcmVkUHJvY2Vzc1NlcnZpY2UgYXMgSVNoYXJlZFByb2Nlc3NTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKCkpIGFzIFBhcnRpYWw8SVJlbW90ZUFnZW50SG9zdFNlcnZpY2U+KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCBuZXcgQ2FwdHVyaW5nTm90aWZpY2F0aW9uU2VydmljZSgpIGFzIFBhcnRpYWw8SU5vdGlmaWNhdGlvblNlcnZpY2U+KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTU0hSZWxheUNsaWVudEZhY3RvcnksIHtcblx0XHRcdGNyZWF0ZUNsaWVudDogKCkgPT4gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrUHJvdG9jb2xDbGllbnQoKSkgYXMgdW5rbm93biBhcyBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudCxcblx0XHR9KTtcblxuXHRcdGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UsIGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UgYXMgUGFydGlhbDxJUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlU2VydmljZT4pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNTSEhvc3RLZXlUcnVzdFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgU1NISG9zdEtleVRydXN0U2VydmljZShkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpKSBhcyBQYXJ0aWFsPElTU0hIb3N0S2V5VHJ1c3RTZXJ2aWNlPik7XG5cblx0XHQvLyBEZWZhdWx0IHRvIHRocm93aW5nIHNvIGFueSB0ZXN0IHRoYXQgZG9lc24ndCBleHBlY3QgdGhlIG1vZGFsIHRvXG5cdFx0Ly8gYXBwZWFyIGZhaWxzIGxvdWRseSBpZiB0aGUgaW1wbGVtZW50YXRpb24gc2hvd3MgaXQgdW5leHBlY3RlZGx5LlxuXHRcdGRpYWxvZ1NlcnZpY2VTdHViID0ge1xuXHRcdFx0cHJvbXB0OiAoKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3VuZXhwZWN0ZWQgZGlhbG9nU2VydmljZS5wcm9tcHQgY2FsbCcpOyB9KSBhcyB1bmtub3duIGFzIElEaWFsb2dTZXJ2aWNlWydwcm9tcHQnXSxcblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpYWxvZ1NlcnZpY2UsIGRpYWxvZ1NlcnZpY2VTdHViIGFzIElEaWFsb2dTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9kdWN0U2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIG5hbWVTaG9ydDogJ1Rlc3QgUHJvZHVjdCcgfSBhcyBJUHJvZHVjdFNlcnZpY2UpO1xuXG5cdFx0Ly8gSW5zdGFudGlhdGluZyB0aGUgc2VydmljZSBpcyBlbm91Z2ggdG8gcmVnaXN0ZXIgdGhlXG5cdFx0Ly8gb25EaWRSZXF1ZXN0RW5kcG9pbnRTZWxlY3Rpb24vb25EaWRDYW5jZWxFbmRwb2ludFNlbGVjdGlvbiBsaXN0ZW5lcnM7XG5cdFx0Ly8gdGhlIHJlc3VsdGluZyBoYW5kbGUgaXNuJ3Qgb3RoZXJ3aXNlIHVzZWQgYnkgdGhlc2UgdGVzdHMuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2UpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGNvbm5lY3Rpb25LZXkgPSAnc3NoOnJlbW90ZS5leGFtcGxlJztcblxuXHRjb25zdCBlZGl0b3JDYW5kaWRhdGU6IElTU0hFbmRwb2ludENhbmRpZGF0ZSA9IHtcblx0XHR0eXBlOiAnZWRpdG9yJyxcblx0XHRwaWQ6IDExMSxcblx0XHRpbnN0YW5jZUlkOiAnZWRpdG9yLWluc3RhbmNlLTInLFxuXHRcdHF1YWxpdHk6ICdzdGFibGUnLFxuXHRcdGVuZHBvaW50OiB7IHR5cGU6ICdzb2NrZXQnLCBwYXRoOiAnL3J1bi9hZ2VudC1ob3N0L2VkaXRvci0xMTEuc29jaycgfSxcblx0fTtcblx0Y29uc3Qgb3RoZXJFZGl0b3JDYW5kaWRhdGU6IElTU0hFbmRwb2ludENhbmRpZGF0ZSA9IHtcblx0XHR0eXBlOiAnZWRpdG9yJyxcblx0XHRwaWQ6IDMzMyxcblx0XHRpbnN0YW5jZUlkOiAnZWRpdG9yLWluc3RhbmNlLTEnLFxuXHRcdGVuZHBvaW50OiB7IHR5cGU6ICdzb2NrZXQnLCBwYXRoOiAnL3J1bi9hZ2VudC1ob3N0L2VkaXRvci0zMzMuc29jaycgfSxcblx0fTtcblx0Y29uc3Qgc3RhbmRhbG9uZUNhbmRpZGF0ZTogSVNTSEVuZHBvaW50Q2FuZGlkYXRlID0ge1xuXHRcdHR5cGU6ICdzdGFuZGFsb25lJyxcblx0XHRwaWQ6IDIyMixcblx0XHRpbnN0YW5jZUlkOiAnc3RhbmRhbG9uZS1pbnN0YW5jZS0yJyxcblx0XHRlbmRwb2ludDogeyB0eXBlOiAndGNwJywgaG9zdDogJzEyNy4wLjAuMScsIHBvcnQ6IDQzMjEwIH0sXG5cdH07XG5cdGNvbnN0IG90aGVyU3RhbmRhbG9uZUNhbmRpZGF0ZTogSVNTSEVuZHBvaW50Q2FuZGlkYXRlID0ge1xuXHRcdHR5cGU6ICdzdGFuZGFsb25lJyxcblx0XHRwaWQ6IDQ0NCxcblx0XHRpbnN0YW5jZUlkOiAnc3RhbmRhbG9uZS1pbnN0YW5jZS0xJyxcblx0XHRlbmRwb2ludDogeyB0eXBlOiAndGNwJywgaG9zdDogJzEyNy4wLjAuMScsIHBvcnQ6IDQzMjExIH0sXG5cdH07XG5cblx0ZnVuY3Rpb24gbWFrZVJlcXVlc3QoY2FuZGlkYXRlczogcmVhZG9ubHkgSVNTSEVuZHBvaW50Q2FuZGlkYXRlW10sIGtleSA9IGNvbm5lY3Rpb25LZXkpOiBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0IHtcblx0XHRyZXR1cm4geyByZXF1ZXN0SWQ6ICdyZXEtMScsIGNvbm5lY3Rpb25LZXk6IGtleSwgZGlzcGxheUhvc3Q6ICdyZW1vdGUuZXhhbXBsZScsIGNhbmRpZGF0ZXMgfTtcblx0fVxuXG5cdHRlc3QoJ25vIHN0b3JlZCBwcmVmZXJlbmNlIHdpdGggYSBsaXZlIGVkaXRvciBzaG93cyB0aGUgc2hhcmVkIG1vZGFsIGFuZCBwZXJzaXN0cyBhIGNob3NlbiBcImVkaXRvclwiIHByZWZlcmVuY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0ZGlhbG9nU2VydmljZVN0dWIucHJvbXB0ID0gKGFzeW5jICgpID0+ICh7IHJlc3VsdDogJ2VkaXRvcicgfSkpIGFzIHVua25vd24gYXMgSURpYWxvZ1NlcnZpY2VbJ3Byb21wdCddO1xuXG5cdFx0bWFpblNlcnZpY2UuZmlyZUVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdChtYWtlUmVxdWVzdChbZWRpdG9yQ2FuZGlkYXRlLCBzdGFuZGFsb25lQ2FuZGlkYXRlXSkpO1xuXHRcdGF3YWl0IG1haW5TZXJ2aWNlLndhaXRGb3JFbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1haW5TZXJ2aWNlLmVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2VzLCBbXG5cdFx0XHR7IHJlcXVlc3RJZDogJ3JlcS0xJywgc2VsZWN0aW9uOiB7IGtpbmQ6ICdjYW5kaWRhdGUnLCB0eXBlOiAnZWRpdG9yJywgcGlkOiAxMTEsIGluc3RhbmNlSWQ6ICdlZGl0b3ItaW5zdGFuY2UtMicgfSB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLmdldFByZWZlcmVuY2UoY29ubmVjdGlvbktleSksICdlZGl0b3InKTtcblx0fSk7XG5cblx0dGVzdCgnbm8gc3RvcmVkIHByZWZlcmVuY2Ugd2l0aCBhIGxpdmUgZWRpdG9yIHNob3dzIHRoZSBzaGFyZWQgbW9kYWwgYW5kIHBlcnNpc3RzIGEgY2hvc2VuIFwiZGVkaWNhdGVkXCIgcHJlZmVyZW5jZScsIGFzeW5jICgpID0+IHtcblx0XHRkaWFsb2dTZXJ2aWNlU3R1Yi5wcm9tcHQgPSAoYXN5bmMgKCkgPT4gKHsgcmVzdWx0OiAnZGVkaWNhdGVkJyB9KSkgYXMgdW5rbm93biBhcyBJRGlhbG9nU2VydmljZVsncHJvbXB0J107XG5cblx0XHRtYWluU2VydmljZS5maXJlRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0KG1ha2VSZXF1ZXN0KFtlZGl0b3JDYW5kaWRhdGUsIHN0YW5kYWxvbmVDYW5kaWRhdGVdKSk7XG5cdFx0YXdhaXQgbWFpblNlcnZpY2Uud2FpdEZvckVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFpblNlcnZpY2UuZW5kcG9pbnRTZWxlY3Rpb25SZXNwb25zZXMsIFtcblx0XHRcdHsgcmVxdWVzdElkOiAncmVxLTEnLCBzZWxlY3Rpb246IHsga2luZDogJ2NhbmRpZGF0ZScsIHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAyMjIsIGluc3RhbmNlSWQ6ICdzdGFuZGFsb25lLWluc3RhbmNlLTInIH0gfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYXRpb25QcmVmZXJlbmNlU2VydmljZS5nZXRQcmVmZXJlbmNlKGNvbm5lY3Rpb25LZXkpLCAnZGVkaWNhdGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vIHN0b3JlZCBwcmVmZXJlbmNlIGFuZCBubyBsaXZlIGVkaXRvciByZXNvbHZlcyB0byBhIGRlZGljYXRlZCBzZWxlY3Rpb24gd2l0aG91dCBwcm9tcHRpbmcgb3IgcGVyc2lzdGluZyBhbnl0aGluZycsIGFzeW5jICgpID0+IHtcblx0XHRtYWluU2VydmljZS5maXJlRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0KG1ha2VSZXF1ZXN0KFtzdGFuZGFsb25lQ2FuZGlkYXRlXSkpO1xuXHRcdGF3YWl0IG1haW5TZXJ2aWNlLndhaXRGb3JFbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1haW5TZXJ2aWNlLmVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2VzLCBbXG5cdFx0XHR7IHJlcXVlc3RJZDogJ3JlcS0xJywgc2VsZWN0aW9uOiB7IGtpbmQ6ICdjYW5kaWRhdGUnLCB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMjIyLCBpbnN0YW5jZUlkOiAnc3RhbmRhbG9uZS1pbnN0YW5jZS0yJyB9IH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UuZ2V0UHJlZmVyZW5jZShjb25uZWN0aW9uS2V5KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbm8gc3RvcmVkIHByZWZlcmVuY2UgYW5kIG5vIGxpdmUgY2FuZGlkYXRlcyBhdCBhbGwgc3Bhd25zIGEgbmV3IGRlZGljYXRlZCBob3N0IHdpdGhvdXQgcHJvbXB0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdG1haW5TZXJ2aWNlLmZpcmVFbmRwb2ludFNlbGVjdGlvblJlcXVlc3QobWFrZVJlcXVlc3QoW10pKTtcblx0XHRhd2FpdCBtYWluU2VydmljZS53YWl0Rm9yRW5kcG9pbnRTZWxlY3Rpb25SZXNwb25zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYWluU2VydmljZS5lbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlcywgW1xuXHRcdFx0eyByZXF1ZXN0SWQ6ICdyZXEtMScsIHNlbGVjdGlvbjogeyBraW5kOiAnc3Bhd24nIH0gfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYXRpb25QcmVmZXJlbmNlU2VydmljZS5nZXRQcmVmZXJlbmNlKGNvbm5lY3Rpb25LZXkpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHN0b3JlZCBcImVkaXRvclwiIHByZWZlcmVuY2UgYnlwYXNzZXMgdGhlIG1vZGFsIGFuZCByZXNvbHZlcyB0byB0aGUgbGl2ZSBlZGl0b3IgY2FuZGlkYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2Uuc2V0UHJlZmVyZW5jZShjb25uZWN0aW9uS2V5LCAnZWRpdG9yJyk7XG5cblx0XHRtYWluU2VydmljZS5maXJlRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0KG1ha2VSZXF1ZXN0KFtlZGl0b3JDYW5kaWRhdGUsIHN0YW5kYWxvbmVDYW5kaWRhdGVdKSk7XG5cdFx0YXdhaXQgbWFpblNlcnZpY2Uud2FpdEZvckVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFpblNlcnZpY2UuZW5kcG9pbnRTZWxlY3Rpb25SZXNwb25zZXMsIFtcblx0XHRcdHsgcmVxdWVzdElkOiAncmVxLTEnLCBzZWxlY3Rpb246IHsga2luZDogJ2NhbmRpZGF0ZScsIHR5cGU6ICdlZGl0b3InLCBwaWQ6IDExMSwgaW5zdGFuY2VJZDogJ2VkaXRvci1pbnN0YW5jZS0yJyB9IH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egc3RvcmVkIFwiZGVkaWNhdGVkXCIgcHJlZmVyZW5jZSBieXBhc3NlcyB0aGUgbW9kYWwgZXZlbiB3aGVuIGFuIGVkaXRvciBpcyBsaXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2Uuc2V0UHJlZmVyZW5jZShjb25uZWN0aW9uS2V5LCAnZGVkaWNhdGVkJyk7XG5cblx0XHRtYWluU2VydmljZS5maXJlRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0KG1ha2VSZXF1ZXN0KFtlZGl0b3JDYW5kaWRhdGUsIHN0YW5kYWxvbmVDYW5kaWRhdGVdKSk7XG5cdFx0YXdhaXQgbWFpblNlcnZpY2Uud2FpdEZvckVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFpblNlcnZpY2UuZW5kcG9pbnRTZWxlY3Rpb25SZXNwb25zZXMsIFtcblx0XHRcdHsgcmVxdWVzdElkOiAncmVxLTEnLCBzZWxlY3Rpb246IHsga2luZDogJ2NhbmRpZGF0ZScsIHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAyMjIsIGluc3RhbmNlSWQ6ICdzdGFuZGFsb25lLWluc3RhbmNlLTInIH0gfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYSBzdG9yZWQgXCJkZWRpY2F0ZWRcIiBwcmVmZXJlbmNlIHdpdGggbm8gbGl2ZSBzdGFuZGFsb25lIGVuZHBvaW50IHNwYXducyBhIG5ldyBvbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0bG9jYXRpb25QcmVmZXJlbmNlU2VydmljZS5zZXRQcmVmZXJlbmNlKGNvbm5lY3Rpb25LZXksICdkZWRpY2F0ZWQnKTtcblxuXHRcdG1haW5TZXJ2aWNlLmZpcmVFbmRwb2ludFNlbGVjdGlvblJlcXVlc3QobWFrZVJlcXVlc3QoW2VkaXRvckNhbmRpZGF0ZV0pKTtcblx0XHRhd2FpdCBtYWluU2VydmljZS53YWl0Rm9yRW5kcG9pbnRTZWxlY3Rpb25SZXNwb25zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYWluU2VydmljZS5lbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlcywgW1xuXHRcdFx0eyByZXF1ZXN0SWQ6ICdyZXEtMScsIHNlbGVjdGlvbjogeyBraW5kOiAnc3Bhd24nIH0gfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYSBzdG9yZWQgXCJlZGl0b3JcIiBwcmVmZXJlbmNlIHdpdGggbm8gbGl2ZSBlZGl0b3IgZmFsbHMgYmFjayB0byBhIGRlZGljYXRlZCBzZWxlY3Rpb24gd2l0aG91dCBtdXRhdGluZyB0aGUgc3RvcmVkIHByZWZlcmVuY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0bG9jYXRpb25QcmVmZXJlbmNlU2VydmljZS5zZXRQcmVmZXJlbmNlKGNvbm5lY3Rpb25LZXksICdlZGl0b3InKTtcblxuXHRcdG1haW5TZXJ2aWNlLmZpcmVFbmRwb2ludFNlbGVjdGlvblJlcXVlc3QobWFrZVJlcXVlc3QoW3N0YW5kYWxvbmVDYW5kaWRhdGVdKSk7XG5cdFx0YXdhaXQgbWFpblNlcnZpY2Uud2FpdEZvckVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFpblNlcnZpY2UuZW5kcG9pbnRTZWxlY3Rpb25SZXNwb25zZXMsIFtcblx0XHRcdHsgcmVxdWVzdElkOiAncmVxLTEnLCBzZWxlY3Rpb246IHsga2luZDogJ2NhbmRpZGF0ZScsIHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAyMjIsIGluc3RhbmNlSWQ6ICdzdGFuZGFsb25lLWluc3RhbmNlLTInIH0gfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYXRpb25QcmVmZXJlbmNlU2VydmljZS5nZXRQcmVmZXJlbmNlKGNvbm5lY3Rpb25LZXkpLCAnZWRpdG9yJywgJ2EgbGl2ZS1lZGl0b3ItdW5hdmFpbGFibGUgZmFsbGJhY2sgbXVzdCBub3QgZG93bmdyYWRlIHRoZSBzdG9yZWQgcHJlZmVyZW5jZSwgc28gYSBmdXR1cmUgY29ubmVjdCBjYW4gcHJlZmVyIGFuIGVkaXRvciBhZ2FpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHN0b3JlZCBcImVkaXRvclwiIHByZWZlcmVuY2Ugd2l0aCBuZWl0aGVyIGEgbGl2ZSBlZGl0b3Igbm9yIGEgbGl2ZSBzdGFuZGFsb25lIHNwYXducyBhIG5ldyBkZWRpY2F0ZWQgaG9zdCcsIGFzeW5jICgpID0+IHtcblx0XHRsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLnNldFByZWZlcmVuY2UoY29ubmVjdGlvbktleSwgJ2VkaXRvcicpO1xuXG5cdFx0bWFpblNlcnZpY2UuZmlyZUVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdChtYWtlUmVxdWVzdChbXSkpO1xuXHRcdGF3YWl0IG1haW5TZXJ2aWNlLndhaXRGb3JFbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1haW5TZXJ2aWNlLmVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2VzLCBbXG5cdFx0XHR7IHJlcXVlc3RJZDogJ3JlcS0xJywgc2VsZWN0aW9uOiB7IGtpbmQ6ICdzcGF3bicgfSB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLmdldFByZWZlcmVuY2UoY29ubmVjdGlvbktleSksICdlZGl0b3InKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgdG8gdGhlIGxpdmUgZWRpdG9yIGNhbmRpZGF0ZSB3aXRoIHRoZSBsZXhpY29ncmFwaGljYWxseSBzbWFsbGVzdCBpbnN0YW5jZUlkLCByZWdhcmRsZXNzIG9mIGFycmF5IG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2Uuc2V0UHJlZmVyZW5jZShjb25uZWN0aW9uS2V5LCAnZWRpdG9yJyk7XG5cblx0XHRtYWluU2VydmljZS5maXJlRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0KG1ha2VSZXF1ZXN0KFtlZGl0b3JDYW5kaWRhdGUsIG90aGVyRWRpdG9yQ2FuZGlkYXRlXSkpO1xuXHRcdGF3YWl0IG1haW5TZXJ2aWNlLndhaXRGb3JFbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1haW5TZXJ2aWNlLmVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2VzLCBbXG5cdFx0XHR7IHJlcXVlc3RJZDogJ3JlcS0xJywgc2VsZWN0aW9uOiB7IGtpbmQ6ICdjYW5kaWRhdGUnLCB0eXBlOiAnZWRpdG9yJywgcGlkOiAzMzMsIGluc3RhbmNlSWQ6ICdlZGl0b3ItaW5zdGFuY2UtMScgfSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcyB0byB0aGUgbGl2ZSBzdGFuZGFsb25lIGNhbmRpZGF0ZSB3aXRoIHRoZSBsZXhpY29ncmFwaGljYWxseSBzbWFsbGVzdCBpbnN0YW5jZUlkLCByZWdhcmRsZXNzIG9mIGFycmF5IG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2Uuc2V0UHJlZmVyZW5jZShjb25uZWN0aW9uS2V5LCAnZGVkaWNhdGVkJyk7XG5cblx0XHRtYWluU2VydmljZS5maXJlRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0KG1ha2VSZXF1ZXN0KFtzdGFuZGFsb25lQ2FuZGlkYXRlLCBvdGhlclN0YW5kYWxvbmVDYW5kaWRhdGVdKSk7XG5cdFx0YXdhaXQgbWFpblNlcnZpY2Uud2FpdEZvckVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFpblNlcnZpY2UuZW5kcG9pbnRTZWxlY3Rpb25SZXNwb25zZXMsIFtcblx0XHRcdHsgcmVxdWVzdElkOiAncmVxLTEnLCBzZWxlY3Rpb246IHsga2luZDogJ2NhbmRpZGF0ZScsIHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiA0NDQsIGluc3RhbmNlSWQ6ICdzdGFuZGFsb25lLWluc3RhbmNlLTEnIH0gfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYSBtYWluLXByb2Nlc3MgY2FuY2VsbGF0aW9uIGFib3J0cyB0aGUgb3BlbiBtb2RhbCBjbGVhbmx5LCByZXNwb25kcyB3aXRoIHVuZGVmaW5lZCwgYW5kIHBlcnNpc3RzIG5vdGhpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGNhcHR1cmVkVG9rZW46IENhbmNlbGxhdGlvblRva2VuIHwgdW5kZWZpbmVkO1xuXHRcdGRpYWxvZ1NlcnZpY2VTdHViLnByb21wdCA9ICgocHJvbXB0OiB7IHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4gfSkgPT4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRjYXB0dXJlZFRva2VuID0gcHJvbXB0LnRva2VuO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBwcm9tcHQudG9rZW4/Lm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0bGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZSh7IHJlc3VsdDogdW5kZWZpbmVkIH0pO1xuXHRcdFx0fSk7XG5cdFx0fSkpIGFzIHVua25vd24gYXMgSURpYWxvZ1NlcnZpY2VbJ3Byb21wdCddO1xuXG5cdFx0bWFpblNlcnZpY2UuZmlyZUVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdChtYWtlUmVxdWVzdChbZWRpdG9yQ2FuZGlkYXRlLCBzdGFuZGFsb25lQ2FuZGlkYXRlXSkpO1xuXHRcdGFzc2VydC5vayhjYXB0dXJlZFRva2VuLCAndGhlIG1vZGFsIHNob3VsZCBoYXZlIGJlZW4gb3BlbmVkIHN5bmNocm9ub3VzbHkgd2l0aCBhIGNhbmNlbGxhdGlvbiB0b2tlbicpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VQcm9taXNlID0gbWFpblNlcnZpY2Uud2FpdEZvckVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2UoKTtcblx0XHRtYWluU2VydmljZS5maXJlRW5kcG9pbnRTZWxlY3Rpb25DYW5jZWwoJ3JlcS0xJyk7XG5cdFx0YXdhaXQgcmVzcG9uc2VQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYWluU2VydmljZS5lbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlcywgW1xuXHRcdFx0eyByZXF1ZXN0SWQ6ICdyZXEtMScsIHNlbGVjdGlvbjogdW5kZWZpbmVkIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UuZ2V0UHJlZmVyZW5jZShjb25uZWN0aW9uS2V5KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndGhlIHVzZXIgZGlzbWlzc2luZyB0aGUgbW9kYWwgcmVzcG9uZHMgd2l0aCB1bmRlZmluZWQgYW5kIGRvZXMgbm90IHBlcnNpc3QgYSBwcmVmZXJlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGRpYWxvZ1NlcnZpY2VTdHViLnByb21wdCA9IChhc3luYyAoKSA9PiAoeyByZXN1bHQ6IHVuZGVmaW5lZCB9KSkgYXMgdW5rbm93biBhcyBJRGlhbG9nU2VydmljZVsncHJvbXB0J107XG5cblx0XHRtYWluU2VydmljZS5maXJlRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0KG1ha2VSZXF1ZXN0KFtlZGl0b3JDYW5kaWRhdGUsIHN0YW5kYWxvbmVDYW5kaWRhdGVdKSk7XG5cdFx0YXdhaXQgbWFpblNlcnZpY2Uud2FpdEZvckVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFpblNlcnZpY2UuZW5kcG9pbnRTZWxlY3Rpb25SZXNwb25zZXMsIFtcblx0XHRcdHsgcmVxdWVzdElkOiAncmVxLTEnLCBzZWxlY3Rpb246IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLmdldFByZWZlcmVuY2UoY29ubmVjdGlvbktleSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbGxpbmcgYW4gdW5yZWxhdGVkIHJlcXVlc3RJZCBkb2VzIG5vdCBhYm9ydCB0aGUgY3VycmVudCBtb2RhbCcsIGFzeW5jICgpID0+IHtcblx0XHRkaWFsb2dTZXJ2aWNlU3R1Yi5wcm9tcHQgPSAoYXN5bmMgKCkgPT4gKHsgcmVzdWx0OiB1bmRlZmluZWQgfSkpIGFzIHVua25vd24gYXMgSURpYWxvZ1NlcnZpY2VbJ3Byb21wdCddO1xuXG5cdFx0bWFpblNlcnZpY2UuZmlyZUVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdChtYWtlUmVxdWVzdChbZWRpdG9yQ2FuZGlkYXRlLCBzdGFuZGFsb25lQ2FuZGlkYXRlXSkpO1xuXHRcdG1haW5TZXJ2aWNlLmZpcmVFbmRwb2ludFNlbGVjdGlvbkNhbmNlbCgnc29tZS1vdGhlci1yZXF1ZXN0Jyk7XG5cdFx0YXdhaXQgbWFpblNlcnZpY2Uud2FpdEZvckVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2UoKTtcblxuXHRcdC8vIFRoZSBtb2RhbCByZXNvbHZlZCBvbiBpdHMgb3duICh1c2VyIGRpc21pc3NlZCBpdCk7IHRoZSB1bnJlbGF0ZWRcblx0XHQvLyBjYW5jZWwgZXZlbnQgbXVzdCBub3QgaGF2ZSBpbnRlcmZlcmVkIHdpdGggcm91dGluZyB0aGUgcmVzcG9uc2UuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYWluU2VydmljZS5lbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlcywgW1xuXHRcdFx0eyByZXF1ZXN0SWQ6ICdyZXEtMScsIHNlbGVjdGlvbjogdW5kZWZpbmVkIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZWZlcmVuY2VzIGFyZSBpc29sYXRlZCBwZXIgY29ubmVjdGlvbktleTogYSBwcmVmZXJlbmNlIHN0b3JlZCBmb3Igb25lIGhvc3QgZG9lcyBub3Qgc3VwcHJlc3MgdGhlIG1vZGFsIGZvciBhbm90aGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2Uuc2V0UHJlZmVyZW5jZSgnc3NoOm90aGVyLmV4YW1wbGUnLCAnZGVkaWNhdGVkJyk7XG5cdFx0ZGlhbG9nU2VydmljZVN0dWIucHJvbXB0ID0gKGFzeW5jICgpID0+ICh7IHJlc3VsdDogJ2VkaXRvcicgfSkpIGFzIHVua25vd24gYXMgSURpYWxvZ1NlcnZpY2VbJ3Byb21wdCddO1xuXG5cdFx0bWFpblNlcnZpY2UuZmlyZUVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdChtYWtlUmVxdWVzdChbZWRpdG9yQ2FuZGlkYXRlLCBzdGFuZGFsb25lQ2FuZGlkYXRlXSwgY29ubmVjdGlvbktleSkpO1xuXHRcdGF3YWl0IG1haW5TZXJ2aWNlLndhaXRGb3JFbmRwb2ludFNlbGVjdGlvblJlc3BvbnNlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1haW5TZXJ2aWNlLmVuZHBvaW50U2VsZWN0aW9uUmVzcG9uc2VzLCBbXG5cdFx0XHR7IHJlcXVlc3RJZDogJ3JlcS0xJywgc2VsZWN0aW9uOiB7IGtpbmQ6ICdjYW5kaWRhdGUnLCB0eXBlOiAnZWRpdG9yJywgcGlkOiAxMTEsIGluc3RhbmNlSWQ6ICdlZGl0b3ItaW5zdGFuY2UtMicgfSB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLmdldFByZWZlcmVuY2UoY29ubmVjdGlvbktleSksICdlZGl0b3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYXRpb25QcmVmZXJlbmNlU2VydmljZS5nZXRQcmVmZXJlbmNlKCdzc2g6b3RoZXIuZXhhbXBsZScpLCAnZGVkaWNhdGVkJyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdTU0hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIGhvc3Qga2V5IHZlcmlmaWNhdGlvbiAocmVuZGVyZXIpJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgbWFpblNlcnZpY2U6IE1vY2tTU0hNYWluU2VydmljZTtcblx0bGV0IGhvc3RLZXlUcnVzdFNlcnZpY2U6IFNTSEhvc3RLZXlUcnVzdFNlcnZpY2U7XG5cdGxldCBub3RpZmljYXRpb25TZXJ2aWNlOiBDYXB0dXJpbmdOb3RpZmljYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29uZmlybVJlc3VsdDogYm9vbGVhbjtcblx0bGV0IGNvbmZpcm1DYWxsczogbnVtYmVyO1xuXHQvKiogV2hlbiBzZXQsIHRoZSBjb25maXJtIGRpYWxvZyBibG9ja3Mgb24gdGhpcyB1bnRpbCB0aGUgdGVzdCByZWxlYXNlcyBpdC4gKi9cblx0bGV0IGNvbmZpcm1HYXRlOiAoKCkgPT4gUHJvbWlzZTx2b2lkPikgfCB1bmRlZmluZWQ7XG5cdGxldCBpbkZsaWdodFZlcmlmaWNhdGlvbnM6IFByb21pc2U8dm9pZD5bXTtcblx0LyoqIFRoZSBvcHRpb25zIHRoZSBsYXN0IGNvbmZpcm0gZGlhbG9nIHdhcyBvcGVuZWQgd2l0aC4gKi9cblx0bGV0IGxhc3RDb25maXJtT3B0aW9uczogSUNvbmZpcm1hdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bWFpblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tTU0hNYWluU2VydmljZSgpKTtcblx0XHRjb25zdCBzaGFyZWRQcm9jZXNzU2VydmljZTogUGFydGlhbDxJU2hhcmVkUHJvY2Vzc1NlcnZpY2U+ID0ge1xuXHRcdFx0Z2V0Q2hhbm5lbDogKCkgPT4gYXNDaGFubmVsKG1haW5TZXJ2aWNlKSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSBhcyBQYXJ0aWFsPElDb25maWd1cmF0aW9uU2VydmljZT4pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVF1aWNrSW5wdXRTZXJ2aWNlLCB7fSBhcyBQYXJ0aWFsPElRdWlja0lucHV0U2VydmljZT4pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNoYXJlZFByb2Nlc3NTZXJ2aWNlLCBzaGFyZWRQcm9jZXNzU2VydmljZSBhcyBJU2hhcmVkUHJvY2Vzc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1JlbW90ZUFnZW50SG9zdFNlcnZpY2UoKSkgYXMgUGFydGlhbDxJUmVtb3RlQWdlbnRIb3N0U2VydmljZT4pO1xuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2UgPSBuZXcgQ2FwdHVyaW5nTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UgYXMgUGFydGlhbDxJTm90aWZpY2F0aW9uU2VydmljZT4pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNTSFJlbGF5Q2xpZW50RmFjdG9yeSwge1xuXHRcdFx0Y3JlYXRlQ2xpZW50OiAoKSA9PiBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tQcm90b2NvbENsaWVudCgpKSBhcyB1bmtub3duIGFzIFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UoKSkgYXMgUGFydGlhbDxJUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlU2VydmljZT4pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2R1Y3RTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgbmFtZVNob3J0OiAnVGVzdCBQcm9kdWN0JyB9IGFzIElQcm9kdWN0U2VydmljZSk7XG5cblx0XHRjb25maXJtUmVzdWx0ID0gZmFsc2U7XG5cdFx0Y29uZmlybUNhbGxzID0gMDtcblx0XHRjb25maXJtR2F0ZSA9IHVuZGVmaW5lZDtcblx0XHRsYXN0Q29uZmlybU9wdGlvbnMgPSB1bmRlZmluZWQ7XG5cdFx0aW5GbGlnaHRWZXJpZmljYXRpb25zID0gW107XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlhbG9nU2VydmljZSwge1xuXHRcdFx0Y29uZmlybTogKGFzeW5jIChjb25maXJtYXRpb246IElDb25maXJtYXRpb24pID0+IHtcblx0XHRcdFx0Y29uZmlybUNhbGxzKys7XG5cdFx0XHRcdGxhc3RDb25maXJtT3B0aW9ucyA9IGNvbmZpcm1hdGlvbjtcblx0XHRcdFx0aWYgKGNvbmZpcm1HYXRlKSB7XG5cdFx0XHRcdFx0YXdhaXQgY29uZmlybUdhdGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBjb25maXJtZWQ6IGNvbmZpcm1SZXN1bHQgfTtcblx0XHRcdH0pIGFzIHVua25vd24gYXMgSURpYWxvZ1NlcnZpY2VbJ2NvbmZpcm0nXSxcblx0XHR9IGFzIFBhcnRpYWw8SURpYWxvZ1NlcnZpY2U+KTtcblxuXHRcdGhvc3RLZXlUcnVzdFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNTSEhvc3RLZXlUcnVzdFNlcnZpY2UoZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU1NISG9zdEtleVRydXN0U2VydmljZSwgaG9zdEtleVRydXN0U2VydmljZSBhcyBQYXJ0aWFsPElTU0hIb3N0S2V5VHJ1c3RTZXJ2aWNlPik7XG5cblx0XHQvLyBTdWJjbGFzc2VkIHNvIHRlc3RzIGNhbiBhd2FpdCB0aGUgcmVhbCBoYW5kbGVyIHNldHRsaW5nIHJhdGhlciB0aGFuXG5cdFx0Ly8gc2xlZXBpbmcgZm9yIGEgZml4ZWQgaW50ZXJ2YWwsIHdoaWNoIGlzIGxvYWQtZGVwZW5kZW50IGFuZCBmbGFreS5cblx0XHRjbGFzcyBUZXN0YWJsZVNlcnZpY2UgZXh0ZW5kcyBTU0hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIHtcblx0XHRcdHByb3RlY3RlZCBvdmVycmlkZSBfdHJhY2tIb3N0S2V5VmVyaWZpY2F0aW9uKGhhbmRsZWQ6IFByb21pc2U8dm9pZD4pOiB2b2lkIHtcblx0XHRcdFx0aW5GbGlnaHRWZXJpZmljYXRpb25zLnB1c2goaGFuZGxlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0YWJsZVNlcnZpY2UpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8qKiBTZXR0bGVzIG9uY2UgZXZlcnkgdmVyaWZpY2F0aW9uIHRoZSB0ZXN0IGhhcyB0cmlnZ2VyZWQgaGFzIGZpbmlzaGVkLiAqL1xuXHRhc3luYyBmdW5jdGlvbiBzZXR0bGVWZXJpZmljYXRpb25zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHdoaWxlIChpbkZsaWdodFZlcmlmaWNhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChpbkZsaWdodFZlcmlmaWNhdGlvbnMuc3BsaWNlKDApKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBGSU5HRVJQUklOVCA9ICdTSEEyNTY6dGVzdGZpbmdlcnByaW50YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhJztcblxuXHRmdW5jdGlvbiBtYWtlSG9zdEtleVJlcXVlc3Qob3ZlcnJpZGVzOiBQYXJ0aWFsPElTU0hIb3N0S2V5VmVyaWZpY2F0aW9uUmVxdWVzdD4gPSB7fSk6IElTU0hIb3N0S2V5VmVyaWZpY2F0aW9uUmVxdWVzdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlcXVlc3RJZDogJ2hvc3RrZXktMScsXG5cdFx0XHRjb25uZWN0aW9uS2V5OiAnc3NoOnJlbW90ZS5leGFtcGxlJyxcblx0XHRcdGRpc3BsYXlIb3N0OiAncmVtb3RlLmV4YW1wbGUnLFxuXHRcdFx0aG9zdDogJ3JlbW90ZS5leGFtcGxlJyxcblx0XHRcdHBvcnQ6IDIyLFxuXHRcdFx0a2V5VHlwZTogJ3NzaC1lZDI1NTE5Jyxcblx0XHRcdGZpbmdlcnByaW50OiBGSU5HRVJQUklOVCxcblx0XHRcdGtub3duSG9zdHNNYXRjaDogJ3Vua25vd24nLFxuXHRcdFx0dXNlckluaXRpYXRlZDogdHJ1ZSxcblx0XHRcdC4uLm92ZXJyaWRlcyxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gZmlyZUFuZFdhaXQocmVxdWVzdDogSVNTSEhvc3RLZXlWZXJpZmljYXRpb25SZXF1ZXN0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzcG9uZGVkID0gbWFpblNlcnZpY2Uud2FpdEZvckhvc3RLZXlSZXNwb25zZSgpO1xuXHRcdG1haW5TZXJ2aWNlLmZpcmVIb3N0S2V5VmVyaWZpY2F0aW9uUmVxdWVzdChyZXF1ZXN0KTtcblx0XHRhd2FpdCByZXNwb25kZWQ7XG5cdH1cblxuXHR0ZXN0KCdwcm9tcHRzIGZvciBhbiB1bmtub3duIGhvc3QgYW5kIHBlcnNpc3RzIG9uIGFjY2VwdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25maXJtUmVzdWx0ID0gdHJ1ZTtcblx0XHRhd2FpdCBmaXJlQW5kV2FpdChtYWtlSG9zdEtleVJlcXVlc3QoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRyZXNwb25zZXM6IG1haW5TZXJ2aWNlLmhvc3RLZXlSZXNwb25zZXMsXG5cdFx0XHRcdGNvbmZpcm1DYWxscyxcblx0XHRcdFx0c3RvcmVkOiBob3N0S2V5VHJ1c3RTZXJ2aWNlLmdldFRydXN0ZWRLZXlzKCdyZW1vdGUuZXhhbXBsZScsIDIyKS5tYXAoayA9PiBgJHtrLmtleVR5cGV9ICR7ay5maW5nZXJwcmludH1gKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHJlc3BvbnNlczogW3sgcmVxdWVzdElkOiAnaG9zdGtleS0xJywgdHJ1c3RlZDogdHJ1ZSB9XSxcblx0XHRcdFx0Y29uZmlybUNhbGxzOiAxLFxuXHRcdFx0XHRzdG9yZWQ6IFsnc3NoLWVkMjU1MTkgU0hBMjU2OnRlc3RmaW5nZXJwcmludGFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYSddLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY2xpbmluZyB0aGUgcHJvbXB0IHJlZnVzZXMgdGhlIGtleSBhbmQgc3RvcmVzIG5vdGhpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlybVJlc3VsdCA9IGZhbHNlO1xuXHRcdGF3YWl0IGZpcmVBbmRXYWl0KG1ha2VIb3N0S2V5UmVxdWVzdCgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHJlc3BvbnNlczogbWFpblNlcnZpY2UuaG9zdEtleVJlc3BvbnNlcyxcblx0XHRcdFx0c3RvcmVkOiBob3N0S2V5VHJ1c3RTZXJ2aWNlLmdldFRydXN0ZWRLZXlzKCdyZW1vdGUuZXhhbXBsZScsIDIyKS5sZW5ndGgsXG5cdFx0XHR9LFxuXHRcdFx0eyByZXNwb25zZXM6IFt7IHJlcXVlc3RJZDogJ2hvc3RrZXktMScsIHRydXN0ZWQ6IGZhbHNlIH1dLCBzdG9yZWQ6IDAgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIGFscmVhZHktdHJ1c3RlZCBrZXkgY29ubmVjdHMgc2lsZW50bHknLCBhc3luYyAoKSA9PiB7XG5cdFx0aG9zdEtleVRydXN0U2VydmljZS50cnVzdEhvc3RLZXkoJ3JlbW90ZS5leGFtcGxlJywgMjIsIHsga2V5VHlwZTogJ3NzaC1lZDI1NTE5JywgZmluZ2VycHJpbnQ6IEZJTkdFUlBSSU5ULCBhZGRlZEF0OiAxIH0pO1xuXHRcdGF3YWl0IGZpcmVBbmRXYWl0KG1ha2VIb3N0S2V5UmVxdWVzdCgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHJlc3BvbnNlczogbWFpblNlcnZpY2UuaG9zdEtleVJlc3BvbnNlcywgY29uZmlybUNhbGxzIH0sXG5cdFx0XHR7IHJlc3BvbnNlczogW3sgcmVxdWVzdElkOiAnaG9zdGtleS0xJywgdHJ1c3RlZDogdHJ1ZSB9XSwgY29uZmlybUNhbGxzOiAwIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGNoYW5nZWQga2V5IGlzIHJlZnVzZWQgd2l0aCBubyB3YXkgdG8gY2xpY2sgdGhyb3VnaCcsIGFzeW5jICgpID0+IHtcblx0XHRob3N0S2V5VHJ1c3RTZXJ2aWNlLnRydXN0SG9zdEtleSgncmVtb3RlLmV4YW1wbGUnLCAyMiwgeyBrZXlUeXBlOiAnc3NoLWVkMjU1MTknLCBmaW5nZXJwcmludDogJ1NIQTI1Njp0aGVvbGRrZXknLCBhZGRlZEF0OiAxIH0pO1xuXHRcdGF3YWl0IGZpcmVBbmRXYWl0KG1ha2VIb3N0S2V5UmVxdWVzdCgpKTtcblxuXHRcdGNvbnN0IG5vdGlmaWVkID0gbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZmljYXRpb25zLmF0KC0xKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRyZXNwb25zZXM6IG1haW5TZXJ2aWNlLmhvc3RLZXlSZXNwb25zZXMsXG5cdFx0XHRcdC8vIE5vIGRpYWxvZyBhdCBhbGw6IHJlY292ZXJpbmcgcmVxdWlyZXMgZXhwbGljaXRseSBmb3JnZXR0aW5nXG5cdFx0XHRcdC8vIHRoZSBob3N0LCBzbyBhIHBvc3NpYmxlIGltcGVyc29uYXRpb24gY2FuJ3QgYmUgd2F2ZWQgYXdheS5cblx0XHRcdFx0Y29uZmlybUNhbGxzLFxuXHRcdFx0XHRzZXZlcml0eTogbm90aWZpZWQ/LnNldmVyaXR5LFxuXHRcdFx0XHRoYXNGb3JnZXRBY3Rpb246ICEhbm90aWZpZWQ/LmFjdGlvbnM/LnByaW1hcnk/Lmxlbmd0aCxcblx0XHRcdFx0Ly8gVGhlIG9sZCBrZXkgbXVzdCByZW1haW4gc3RvcmVkIHVudGlsIHRoZSB1c2VyIGZvcmdldHMgaXQuXG5cdFx0XHRcdHN0aWxsU3RvcmVkOiBob3N0S2V5VHJ1c3RTZXJ2aWNlLmdldFRydXN0ZWRLZXlzKCdyZW1vdGUuZXhhbXBsZScsIDIyKS5tYXAoayA9PiBrLmZpbmdlcnByaW50KSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHJlc3BvbnNlczogW3sgcmVxdWVzdElkOiAnaG9zdGtleS0xJywgdHJ1c3RlZDogZmFsc2UgfV0sXG5cdFx0XHRcdGNvbmZpcm1DYWxsczogMCxcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRoYXNGb3JnZXRBY3Rpb246IHRydWUsXG5cdFx0XHRcdHN0aWxsU3RvcmVkOiBbJ1NIQTI1Njp0aGVvbGRrZXknXSxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGtub3duX2hvc3RzIG1pc21hdGNoIG9yIHJldm9jYXRpb24gb2ZmZXJzIG5vIGZvcmdldCBhY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gXCJGb3JnZXQgU2F2ZWQgSG9zdCBLZXlcIiBvbmx5IGNsZWFycyAqb3VyKiBzdG9yZS4gV2hlbiB0aGUgY29uZmxpY3Rcblx0XHQvLyBsaXZlcyBpbiB0aGUgdXNlcidzIG93biBrbm93bl9ob3N0cyBmaWxlLCBmb3JnZXR0aW5nIHdvdWxkIGNoYW5nZVxuXHRcdC8vIG5vdGhpbmcgYW5kIHRoZSB2ZXJ5IHNhbWUgZXJyb3Igd291bGQgcmVhcHBlYXIgb24gdGhlIG5leHQgY29ubmVjdCxcblx0XHQvLyBzbyB0aGUgbWVzc2FnZSBwb2ludHMgYXQgdGhlIGZpbGUgdGhhdCBhY3R1YWxseSBkZWNpZGVzIGluc3RlYWQuXG5cdFx0YXdhaXQgZmlyZUFuZFdhaXQobWFrZUhvc3RLZXlSZXF1ZXN0KHsga25vd25Ib3N0c01hdGNoOiAnbWlzbWF0Y2gnIH0pKTtcblx0XHRjb25zdCBmcm9tS25vd25Ib3N0cyA9IG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZpY2F0aW9ucy5hdCgtMSk7XG5cblx0XHRhd2FpdCBmaXJlQW5kV2FpdChtYWtlSG9zdEtleVJlcXVlc3QoeyByZXF1ZXN0SWQ6ICdob3N0a2V5LTInLCBrbm93bkhvc3RzTWF0Y2g6ICdyZXZva2VkJyB9KSk7XG5cdFx0Y29uc3QgZnJvbVJldm9rZWQgPSBub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmaWNhdGlvbnMuYXQoLTEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0a25vd25Ib3N0c0hhc0ZvcmdldDogISFmcm9tS25vd25Ib3N0cz8uYWN0aW9ucz8ucHJpbWFyeT8ubGVuZ3RoLFxuXHRcdFx0XHRrbm93bkhvc3RzTWVudGlvbnNGaWxlOiAhIWZyb21Lbm93bkhvc3RzPy5tZXNzYWdlLnRvU3RyaW5nKCkuaW5jbHVkZXMoJ2tub3duX2hvc3RzJyksXG5cdFx0XHRcdHJldm9rZWRIYXNGb3JnZXQ6ICEhZnJvbVJldm9rZWQ/LmFjdGlvbnM/LnByaW1hcnk/Lmxlbmd0aCxcblx0XHRcdFx0cmV2b2tlZE1lbnRpb25zRmlsZTogISFmcm9tUmV2b2tlZD8ubWVzc2FnZS50b1N0cmluZygpLmluY2x1ZGVzKCdrbm93bl9ob3N0cycpLFxuXHRcdFx0XHRyZXNwb25zZXM6IG1haW5TZXJ2aWNlLmhvc3RLZXlSZXNwb25zZXMsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRrbm93bkhvc3RzSGFzRm9yZ2V0OiBmYWxzZSxcblx0XHRcdFx0a25vd25Ib3N0c01lbnRpb25zRmlsZTogdHJ1ZSxcblx0XHRcdFx0cmV2b2tlZEhhc0ZvcmdldDogZmFsc2UsXG5cdFx0XHRcdHJldm9rZWRNZW50aW9uc0ZpbGU6IHRydWUsXG5cdFx0XHRcdHJlc3BvbnNlczogW1xuXHRcdFx0XHRcdHsgcmVxdWVzdElkOiAnaG9zdGtleS0xJywgdHJ1c3RlZDogZmFsc2UgfSxcblx0XHRcdFx0XHR7IHJlcXVlc3RJZDogJ2hvc3RrZXktMicsIHRydXN0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGhlIGZvcmdldCBhY3Rpb24gY2xlYXJzIHRoZSBzdG9yZWQga2V5IHNvIHRoZSBuZXh0IGNvbm5lY3QgY2FuIHJlLXZlcmlmeScsIGFzeW5jICgpID0+IHtcblx0XHRob3N0S2V5VHJ1c3RTZXJ2aWNlLnRydXN0SG9zdEtleSgncmVtb3RlLmV4YW1wbGUnLCAyMiwgeyBrZXlUeXBlOiAnc3NoLWVkMjU1MTknLCBmaW5nZXJwcmludDogJ1NIQTI1Njp0aGVvbGRrZXknLCBhZGRlZEF0OiAxIH0pO1xuXHRcdGF3YWl0IGZpcmVBbmRXYWl0KG1ha2VIb3N0S2V5UmVxdWVzdCgpKTtcblxuXHRcdGF3YWl0IG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZpY2F0aW9ucy5hdCgtMSk/LmFjdGlvbnM/LnByaW1hcnk/LlswXS5ydW4oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdEtleVRydXN0U2VydmljZS5nZXRUcnVzdGVkS2V5cygncmVtb3RlLmV4YW1wbGUnLCAyMikubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnYSBrbm93bl9ob3N0cyBtYXRjaCBpcyB0cnVzdGVkIHNpbGVudGx5IGFuZCBjb3BpZWQgaW50byB0aGUgc3RvcmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlyZUFuZFdhaXQobWFrZUhvc3RLZXlSZXF1ZXN0KHsga25vd25Ib3N0c01hdGNoOiAnbWF0Y2gnIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHJlc3BvbnNlczogbWFpblNlcnZpY2UuaG9zdEtleVJlc3BvbnNlcyxcblx0XHRcdFx0Y29uZmlybUNhbGxzLFxuXHRcdFx0XHRzdG9yZWQ6IGhvc3RLZXlUcnVzdFNlcnZpY2UuZ2V0VHJ1c3RlZEtleXMoJ3JlbW90ZS5leGFtcGxlJywgMjIpLm1hcChrID0+IGsuZmluZ2VycHJpbnQpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cmVzcG9uc2VzOiBbeyByZXF1ZXN0SWQ6ICdob3N0a2V5LTEnLCB0cnVzdGVkOiB0cnVlIH1dLFxuXHRcdFx0XHRjb25maXJtQ2FsbHM6IDAsXG5cdFx0XHRcdHN0b3JlZDogW0ZJTkdFUlBSSU5UXSxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHJldm9rZWQga2V5IGlzIHJlZnVzZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlyZUFuZFdhaXQobWFrZUhvc3RLZXlSZXF1ZXN0KHsga25vd25Ib3N0c01hdGNoOiAncmV2b2tlZCcgfSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHJlc3BvbnNlczogbWFpblNlcnZpY2UuaG9zdEtleVJlc3BvbnNlcywgY29uZmlybUNhbGxzIH0sXG5cdFx0XHR7IHJlc3BvbnNlczogW3sgcmVxdWVzdElkOiAnaG9zdGtleS0xJywgdHJ1c3RlZDogZmFsc2UgfV0sIGNvbmZpcm1DYWxsczogMCB9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBiYWNrZ3JvdW5kIHJlY29ubmVjdCBuZXZlciBvcGVucyBhIGRpYWxvZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaXJlQW5kV2FpdChtYWtlSG9zdEtleVJlcXVlc3QoeyB1c2VySW5pdGlhdGVkOiBmYWxzZSB9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgcmVzcG9uc2VzOiBtYWluU2VydmljZS5ob3N0S2V5UmVzcG9uc2VzLCBjb25maXJtQ2FsbHMgfSxcblx0XHRcdHsgcmVzcG9uc2VzOiBbeyByZXF1ZXN0SWQ6ICdob3N0a2V5LTEnLCB0cnVzdGVkOiBmYWxzZSB9XSwgY29uZmlybUNhbGxzOiAwIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdTdHJpY3RIb3N0S2V5Q2hlY2tpbmcgYWNjZXB0LW5ldyB0cnVzdHMgdW5rbm93biBob3N0cyB3aXRob3V0IHByb21wdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaXJlQW5kV2FpdChtYWtlSG9zdEtleVJlcXVlc3QoeyBzdHJpY3RIb3N0S2V5Q2hlY2tpbmc6ICdhY2NlcHQtbmV3JyB9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0cmVzcG9uc2VzOiBtYWluU2VydmljZS5ob3N0S2V5UmVzcG9uc2VzLFxuXHRcdFx0XHRjb25maXJtQ2FsbHMsXG5cdFx0XHRcdHN0b3JlZDogaG9zdEtleVRydXN0U2VydmljZS5nZXRUcnVzdGVkS2V5cygncmVtb3RlLmV4YW1wbGUnLCAyMikubGVuZ3RoLFxuXHRcdFx0fSxcblx0XHRcdHsgcmVzcG9uc2VzOiBbeyByZXF1ZXN0SWQ6ICdob3N0a2V5LTEnLCB0cnVzdGVkOiB0cnVlIH1dLCBjb25maXJtQ2FsbHM6IDAsIHN0b3JlZDogMSB9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBwcm9tcHQgZm9yIGEgY29ubmVjdGlvbiB0aGF0IGRpZXMgaXMgZGlzbWlzc2VkLCBhbmQgYSBsYXRlIGFuc3dlciBncmFudHMgbm90aGluZycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUaGUgZGlhbG9nIGlzIG9wZW5lZCB3aXRoIGEgY2FuY2VsbGF0aW9uIHRva2VuIHNvIGl0IHRlYXJzIGl0c2VsZlxuXHRcdC8vIGRvd24gd2hlbiB0aGUgY29ubmVjdGlvbiBkcm9wcywgcmF0aGVyIHRoYW4gc3RyYW5kaW5nIHRoZSB1c2VyIHdpdGhcblx0XHQvLyBhIHF1ZXN0aW9uIGFib3V0IGEgY29ubmVjdGlvbiB0aGF0IG5vIGxvbmdlciBleGlzdHMuIEFuc3dlcmluZyBpdFxuXHRcdC8vIGxhdGUgbXVzdCBhbHNvIGJlIGluZXJ0LlxuXHRcdGxldCByZWxlYXNlRGlhbG9nID0gKCkgPT4geyB9O1xuXHRcdGNvbnN0IGRpYWxvZ1Nob3duID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZVNob3duID0+IHtcblx0XHRcdGNvbmZpcm1HYXRlID0gKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlU2hvd24oKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4geyByZWxlYXNlRGlhbG9nID0gcmVzb2x2ZTsgfSk7XG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdGNvbmZpcm1SZXN1bHQgPSB0cnVlO1xuXG5cdFx0bWFpblNlcnZpY2UuZmlyZUhvc3RLZXlWZXJpZmljYXRpb25SZXF1ZXN0KG1ha2VIb3N0S2V5UmVxdWVzdCgpKTtcblx0XHRhd2FpdCBkaWFsb2dTaG93bjtcblx0XHRjb25zdCBkaWFsb2dUb2tlbiA9IGxhc3RDb25maXJtT3B0aW9ucz8udG9rZW47XG5cdFx0Y29uc3QgZGlzbWlzc2VkQmVmb3JlQ2FuY2VsID0gZGlhbG9nVG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkO1xuXHRcdC8vIFRoZSBjb25uZWN0aW9uIGRyb3BzIHdoaWxlIHRoZSB1c2VyIGlzIHN0aWxsIGxvb2tpbmcgYXQgdGhlIGRpYWxvZy5cblx0XHRtYWluU2VydmljZS5maXJlSG9zdEtleVZlcmlmaWNhdGlvbkNhbmNlbCgnaG9zdGtleS0xJyk7XG5cdFx0Y29uc3QgZGlzbWlzc2VkQWZ0ZXJDYW5jZWwgPSBkaWFsb2dUb2tlbj8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQ7XG5cdFx0cmVsZWFzZURpYWxvZygpO1xuXHRcdGF3YWl0IHNldHRsZVZlcmlmaWNhdGlvbnMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdC8vIFRoZSBkaWFsb2cgaXMgaGFuZGVkIGEgbGl2ZSB0b2tlbiB0aGF0IGlzIGNhbmNlbGxlZCB3aGVuIHRoZVxuXHRcdFx0XHQvLyBjb25uZWN0aW9uIGRpZXMsIHdoaWNoIGlzIHdoYXQgZGlzbWlzc2VzIGl0LlxuXHRcdFx0XHRkaXNtaXNzZWRCZWZvcmVDYW5jZWwsXG5cdFx0XHRcdGRpc21pc3NlZEFmdGVyQ2FuY2VsLFxuXHRcdFx0XHQvLyBBbmQgYSBsYXRlIFwiQ29ubmVjdFwiIHN0aWxsIGdyYW50cyBub3RoaW5nLlxuXHRcdFx0XHRyZXNwb25zZXM6IG1haW5TZXJ2aWNlLmhvc3RLZXlSZXNwb25zZXMsXG5cdFx0XHRcdHN0b3JlZDogaG9zdEtleVRydXN0U2VydmljZS5nZXRUcnVzdGVkS2V5cygncmVtb3RlLmV4YW1wbGUnLCAyMikubGVuZ3RoLFxuXHRcdFx0fSxcblx0XHRcdHsgZGlzbWlzc2VkQmVmb3JlQ2FuY2VsOiBmYWxzZSwgZGlzbWlzc2VkQWZ0ZXJDYW5jZWw6IHRydWUsIHJlc3BvbnNlczogW10sIHN0b3JlZDogMCB9KTtcblx0fSk7XG5cblx0dGVzdCgnbGVhcm5zIGEgcm90YXRlZCBrZXkgYW5ub3VuY2VkIG92ZXIgYW4gYXV0aGVudGljYXRlZCBjb25uZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGhvc3RLZXlUcnVzdFNlcnZpY2UudHJ1c3RIb3N0S2V5KCdyZW1vdGUuZXhhbXBsZScsIDIyLCB7IGtleVR5cGU6ICdzc2gtZWQyNTUxOScsIGZpbmdlcnByaW50OiBGSU5HRVJQUklOVCwgYWRkZWRBdDogMSB9KTtcblx0XHQvLyBFc3RhYmxpc2ggYSBzZXNzaW9uIHdob3NlIGhvc3Qga2V5IGlzIGl0c2VsZiB0cnVzdGVkIFx1MjAxNCB0aGF0IGlzIHdoYXRcblx0XHQvLyBlbnRpdGxlcyB0aGUgc2VydmVyIHRvIHRlbGwgdXMgYWJvdXQgaXRzIG90aGVyIGtleXMuXG5cdFx0YXdhaXQgZmlyZUFuZFdhaXQobWFrZUhvc3RLZXlSZXF1ZXN0KCkpO1xuXG5cdFx0bWFpblNlcnZpY2UuZmlyZUhvc3RLZXlzQW5ub3VuY2VtZW50KHtcblx0XHRcdGNvbm5lY3Rpb25LZXk6ICdzc2g6cmVtb3RlLmV4YW1wbGUnLFxuXHRcdFx0aG9zdDogJ3JlbW90ZS5leGFtcGxlJyxcblx0XHRcdHBvcnQ6IDIyLFxuXHRcdFx0a2V5czogW1xuXHRcdFx0XHR7IGtleVR5cGU6ICdzc2gtZWQyNTUxOScsIGZpbmdlcnByaW50OiAnU0hBMjU2OnJvdGF0ZWQnIH0sXG5cdFx0XHRcdHsga2V5VHlwZTogJ3NzaC1yc2EnLCBmaW5nZXJwcmludDogJ1NIQTI1Njpyc2FrZXknIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGhvc3RLZXlUcnVzdFNlcnZpY2UuZ2V0VHJ1c3RlZEtleXMoJ3JlbW90ZS5leGFtcGxlJywgMjIpLm1hcChrID0+IGAke2sua2V5VHlwZX0gJHtrLmZpbmdlcnByaW50fWApLnNvcnQoKSxcblx0XHRcdFsnc3NoLWVkMjU1MTkgU0hBMjU2OnJvdGF0ZWQnLCAnc3NoLXJzYSBTSEEyNTY6cnNha2V5J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGNoYW5nZWQga2V5IGlzIHJlZnVzZWQgZXZlbiB3aGVuIFN0cmljdEhvc3RLZXlDaGVja2luZyBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUaGUgb3B0LW91dCBtZWFucyBcIkkgYWNjZXB0IHVua25vd24ga2V5c1wiLCBub3QgXCJJIGFjY2VwdCBhIGtleSB0aGF0XG5cdFx0Ly8gY29udHJhZGljdHMgb25lIEkgYWxyZWFkeSB0cnVzdFwiLiBPcGVuU1NIIDkuOSBrZWVwcyBwcm90ZWN0aW5nIHRoaXNcblx0XHQvLyBjYXNlIHRvbzogaXQgd2FybnMgYW5kIGRpc2FibGVzIHBhc3N3b3JkIGF1dGgsIGtleWJvYXJkLWludGVyYWN0aXZlXG5cdFx0Ly8gYXV0aCBhbmQgYWdlbnQgZm9yd2FyZGluZy4gV2UgcmVmdXNlIG91dHJpZ2h0LCBzbyBubyBjcmVkZW50aWFsIGFuZFxuXHRcdC8vIG5vIGFnZW50IGFjY2VzcyBldmVyIHJlYWNoZXMgYSBwb3NzaWJsZSBpbXBvc3RvciBcdTIwMTQgYW5kIHRoZVxuXHRcdC8vIGFubm91bmNlbWVudCBwYXRoIGlzIG1vb3QgYmVjYXVzZSB0aGUgc2Vzc2lvbiBuZXZlciBhdXRoZW50aWNhdGVzLlxuXHRcdGhvc3RLZXlUcnVzdFNlcnZpY2UudHJ1c3RIb3N0S2V5KCdyZW1vdGUuZXhhbXBsZScsIDIyLCB7IGtleVR5cGU6ICdzc2gtZWQyNTUxOScsIGZpbmdlcnByaW50OiBGSU5HRVJQUklOVCwgYWRkZWRBdDogMSB9KTtcblx0XHRhd2FpdCBmaXJlQW5kV2FpdChtYWtlSG9zdEtleVJlcXVlc3QoeyBmaW5nZXJwcmludDogJ1NIQTI1NjppbXBvc3RvcmtleScsIHN0cmljdEhvc3RLZXlDaGVja2luZzogJ25vJyB9KSk7XG5cblx0XHRtYWluU2VydmljZS5maXJlSG9zdEtleXNBbm5vdW5jZW1lbnQoe1xuXHRcdFx0Y29ubmVjdGlvbktleTogJ3NzaDpyZW1vdGUuZXhhbXBsZScsXG5cdFx0XHRob3N0OiAncmVtb3RlLmV4YW1wbGUnLFxuXHRcdFx0cG9ydDogMjIsXG5cdFx0XHRrZXlzOiBbeyBrZXlUeXBlOiAnc3NoLWVkMjU1MTknLCBmaW5nZXJwcmludDogJ1NIQTI1NjphdHRhY2tlcmtleScgfV0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHQvLyBSZWZ1c2VkIG91dHJpZ2h0LCBiZWZvcmUgYXV0aGVudGljYXRpb24uXG5cdFx0XHRcdGNvbm5lY3RlZDogbWFpblNlcnZpY2UuaG9zdEtleVJlc3BvbnNlcyxcblx0XHRcdFx0Ly8gQW5kIHRoZSBnZW51aW5lIHN0b3JlZCBrZXkgaXMgdW50b3VjaGVkLlxuXHRcdFx0XHRzdG9yZWQ6IGhvc3RLZXlUcnVzdFNlcnZpY2UuZ2V0VHJ1c3RlZEtleXMoJ3JlbW90ZS5leGFtcGxlJywgMjIpLm1hcChrID0+IGsuZmluZ2VycHJpbnQpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y29ubmVjdGVkOiBbeyByZXF1ZXN0SWQ6ICdob3N0a2V5LTEnLCB0cnVzdGVkOiBmYWxzZSB9XSxcblx0XHRcdFx0c3RvcmVkOiBbRklOR0VSUFJJTlRdLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIHVudmVyaWZpZWQgc2Vzc2lvbiBjYW5ub3QgcG9pc29uIHN0b3JlZCB0cnVzdCB2aWEgYW5ub3VuY2VtZW50cycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBBIHNlc3Npb24gYWNjZXB0ZWQgdW5kZXIgU3RyaWN0SG9zdEtleUNoZWNraW5nPW5vIGlzIHVudmVyaWZpZWQ6IHRoZVxuXHRcdC8vIGtleSB3YXMgc2ltcGx5IG5vdCBjaGVja2VkLiBzc2gyIHN0aWxsIHByb3ZlcyBhbm5vdW5jZWQga2V5cyBiZWxvbmdcblx0XHQvLyB0byB3aG9ldmVyIHdlIGFyZSB0YWxraW5nIHRvIFx1MjAxNCBidXQgdGhhdCBjb3VsZCBiZSBhbiBpbXBvc3Rvciwgc28gdGhlXG5cdFx0Ly8gYW5ub3VuY2VtZW50IG11c3Qgbm90IG92ZXJ3cml0ZSB0aGUgcmVhbCBzdG9yZWQga2V5LiBNaXJyb3JzXG5cdFx0Ly8gT3BlblNTSCwgd2hpY2ggb25seSBhY2NlcHRzIGFkZGl0aW9uYWwgaG9zdCBrZXlzIHdoZW4gdGhlIGtleSB0aGF0XG5cdFx0Ly8gYXV0aGVudGljYXRlZCB0aGUgaG9zdCB3YXMgYWxyZWFkeSB0cnVzdGVkLlxuXHRcdC8vXG5cdFx0Ly8gVXNlcyBhbiAqdW5rbm93bioga2V5IChhIGRpZmZlcmVudCBhbGdvcml0aG0pLCBzaW5jZSBhIGtleSB0aGF0XG5cdFx0Ly8gY29udHJhZGljdHMgdGhlIHN0b3JlZCBvbmUgaXMgbm93IHJlZnVzZWQgb3V0cmlnaHQgYnkgdGhlIHRlc3QgYWJvdmUuXG5cdFx0aG9zdEtleVRydXN0U2VydmljZS50cnVzdEhvc3RLZXkoJ3JlbW90ZS5leGFtcGxlJywgMjIsIHsga2V5VHlwZTogJ3NzaC1lZDI1NTE5JywgZmluZ2VycHJpbnQ6IEZJTkdFUlBSSU5ULCBhZGRlZEF0OiAxIH0pO1xuXHRcdGF3YWl0IGZpcmVBbmRXYWl0KG1ha2VIb3N0S2V5UmVxdWVzdCh7IGtleVR5cGU6ICdzc2gtcnNhJywgZmluZ2VycHJpbnQ6ICdTSEEyNTY6aW1wb3N0b3JrZXknLCBzdHJpY3RIb3N0S2V5Q2hlY2tpbmc6ICdubycgfSkpO1xuXG5cdFx0bWFpblNlcnZpY2UuZmlyZUhvc3RLZXlzQW5ub3VuY2VtZW50KHtcblx0XHRcdGNvbm5lY3Rpb25LZXk6ICdzc2g6cmVtb3RlLmV4YW1wbGUnLFxuXHRcdFx0aG9zdDogJ3JlbW90ZS5leGFtcGxlJyxcblx0XHRcdHBvcnQ6IDIyLFxuXHRcdFx0a2V5czogW3sga2V5VHlwZTogJ3NzaC1lZDI1NTE5JywgZmluZ2VycHJpbnQ6ICdTSEEyNTY6YXR0YWNrZXJrZXknIH1dLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0Ly8gVGhlIHVudmVyaWZpZWQgc2Vzc2lvbiB3YXMgYWxsb3dlZCB0byBjb25uZWN0Li4uXG5cdFx0XHRcdGNvbm5lY3RlZDogbWFpblNlcnZpY2UuaG9zdEtleVJlc3BvbnNlcyxcblx0XHRcdFx0Ly8gLi4uYnV0IHRoZSBnZW51aW5lIHN0b3JlZCBrZXkgaXMgdW50b3VjaGVkLlxuXHRcdFx0XHRzdG9yZWQ6IGhvc3RLZXlUcnVzdFNlcnZpY2UuZ2V0VHJ1c3RlZEtleXMoJ3JlbW90ZS5leGFtcGxlJywgMjIpLm1hcChrID0+IGsuZmluZ2VycHJpbnQpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y29ubmVjdGVkOiBbeyByZXF1ZXN0SWQ6ICdob3N0a2V5LTEnLCB0cnVzdGVkOiB0cnVlIH1dLFxuXHRcdFx0XHRzdG9yZWQ6IFtGSU5HRVJQUklOVF0sXG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBhbm5vdW5jZW1lbnRzIGZvciBob3N0cyB0aGF0IHdlcmUgbmV2ZXIgdHJ1c3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBPdGhlcndpc2UgYW4gYW5ub3VuY2VtZW50IHdvdWxkIGJlY29tZSBhIHdheSB0byBlc3RhYmxpc2ggdHJ1c3Rcblx0XHQvLyB3aXRob3V0IGFueSB2ZXJpZmljYXRpb24gYXQgYWxsLlxuXHRcdG1haW5TZXJ2aWNlLmZpcmVIb3N0S2V5c0Fubm91bmNlbWVudCh7XG5cdFx0XHRjb25uZWN0aW9uS2V5OiAnc3NoOnJlbW90ZS5leGFtcGxlJyxcblx0XHRcdGhvc3Q6ICdyZW1vdGUuZXhhbXBsZScsXG5cdFx0XHRwb3J0OiAyMixcblx0XHRcdGtleXM6IFt7IGtleVR5cGU6ICdzc2gtZWQyNTUxOScsIGZpbmdlcnByaW50OiAnU0hBMjU2OnJvdGF0ZWQnIH1dLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvc3RLZXlUcnVzdFNlcnZpY2UuZ2V0VHJ1c3RlZEtleXMoJ3JlbW90ZS5leGFtcGxlJywgMjIpLmxlbmd0aCwgMCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLFdBQVc7QUFFcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUF3QixzQkFBc0I7QUFDOUMsU0FBUyxzQkFBc0IsZ0JBQThEO0FBQzdGLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCLGlDQUFpQyx3Q0FBd0M7QUFFM0csU0FBUyxrQ0FBa0MscUJBQXFCO0FBQ2hFLFNBQVMsaURBQXlGO0FBQ2xHLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsOEJBQThCO0FBY3ZDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCLGlDQUFpQztBQVFsRSxNQUFNLG1CQUFtQjtBQUFBLEVBQXpCO0FBQ0MsU0FBaUIsMEJBQTBCLElBQUksUUFBYztBQUM3RCxTQUFTLHlCQUF5QixLQUFLLHdCQUF3QjtBQUUvRCxTQUFpQix3QkFBd0IsSUFBSSxRQUFnQjtBQUM3RCxTQUFTLHVCQUF1QixLQUFLLHNCQUFzQjtBQUUzRCxTQUFpQiw4QkFBOEIsSUFBSSxRQUFvRDtBQUN2RyxTQUFTLDZCQUE2QixLQUFLLDRCQUE0QjtBQUV2RSxTQUFpQixxQkFBcUIsSUFBSSxRQUF1QjtBQUNqRSxTQUFTLG9CQUFvQixLQUFLLG1CQUFtQjtBQUVyRCxTQUFpQixtQkFBbUIsSUFBSSxRQUFnQjtBQUN4RCxTQUFTLGtCQUFrQixLQUFLLGlC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
