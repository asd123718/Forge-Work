import assert from "assert";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { URI } from "../../../../base/common/uri.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { ILabelService } from "../../../label/common/label.js";
import { AgentsWindowRemoteAgentHostService, RemoteAgentHostService } from "../../browser/remoteAgentHostServiceImpl.js";
import { getEntryTypeConfig, parseRemoteAgentHostInput, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId } from "../../common/remoteAgentHostService.js";
import { AGENT_HOST_SCHEME, agentHostAuthority } from "../../common/agentHostUri.js";
import { DeferredPromise } from "../../../../base/common/async.js";
import { InMemoryStorageService, IStorageService } from "../../../storage/common/storage.js";
import { agentsWindowAgentHostClientInfo, editorWindowAgentHostClientInfo } from "../../common/agentHostClientInfo.js";
class MockTransport extends Disposable {
  constructor() {
    super(...arguments);
    this.onMessage = Event.None;
    this.onClose = Event.None;
    this.onOpen = Event.None;
    this.isOpen = false;
  }
  connect() {
    return Promise.resolve();
  }
  send() {
    return true;
  }
}
const _MockProtocolClient = class _MockProtocolClient extends Disposable {
  constructor(mockAddress) {
    super();
    this.mockAddress = mockAddress;
    this.clientId = `mock-client-${_MockProtocolClient._nextId++}`;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this.onDidAction = Event.None;
    this.onDidNotification = Event.None;
    this.onDidChangeConnectionState = Event.None;
    this.onDidReceiveOtlpLogs = Event.None;
    this.connectionState = "connecting";
    this.initializeResult = void 0;
    this.telemetryCapabilities = void 0;
    this.triggerVscodeUpgradeCalls = [];
    this.connectDeferred = new DeferredPromise();
  }
  async connect() {
    return this.connectDeferred.p;
  }
  async triggerVscodeUpgrade(method) {
    this.triggerVscodeUpgradeCalls.push(method);
    return { ok: true, upgradeStarted: true };
  }
  fireClose() {
    this._onDidClose.fire();
  }
};
_MockProtocolClient._nextId = 1;
let MockProtocolClient = _MockProtocolClient;
class TestConfigurationService {
  constructor() {
    this._onDidChangeConfiguration = new Emitter();
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this._entries = [];
    this._enabled = true;
    this.updateValueCalls = 0;
  }
  getValue(key) {
    if (key === RemoteAgentHostsEnabledSettingId) {
      return this._enabled;
    }
    return this._entries;
  }
  inspect(_key) {
    return {
      userValue: this._entries
    };
  }
  async updateValue(_key, value) {
    this.updateValueCalls++;
    const entries = value ?? [];
    const changed = JSON.stringify(this._entries) !== JSON.stringify(entries);
    this._entries = entries;
    if (!changed) {
      return;
    }
    this._onDidChangeConfiguration.fire({
      affectsConfiguration: (key) => key === RemoteAgentHostsSettingId || key === RemoteAgentHostsEnabledSettingId
    });
  }
  get entries() {
    return this._entries;
  }
  setEntries(entries) {
    this._entries = entries.flatMap((entry) => {
      const config = getEntryTypeConfig(entry.connection.type);
      return config.store === "settings" ? [config.toRaw(entry, entry.connection)] : [];
    });
    this._onDidChangeConfiguration.fire({
      affectsConfiguration: (key) => key === RemoteAgentHostsSettingId || key === RemoteAgentHostsEnabledSettingId
    });
  }
  setRawEntries(entries) {
    this._entries = entries;
    this._onDidChangeConfiguration.fire({
      affectsConfiguration: (key) => key === RemoteAgentHostsSettingId || key === RemoteAgentHostsEnabledSettingId
    });
  }
  setEnabled(enabled) {
    this._enabled = enabled;
    this._onDidChangeConfiguration.fire({
      affectsConfiguration: (key) => key === RemoteAgentHostsEnabledSettingId
    });
  }
  dispose() {
    this._onDidChangeConfiguration.dispose();
  }
}
class TestStorageService extends InMemoryStorageService {
  constructor() {
    super(...arguments);
    this.writeCalls = 0;
  }
  store(key, value, scope, target, external = false) {
    this.writeCalls++;
    super.store(key, value, scope, target, external);
  }
  remove(key, scope, external = false) {
    this.writeCalls++;
    super.remove(key, scope, external);
  }
}
suite("RemoteAgentHostService", () => {
  const disposables = new DisposableStore();
  let configService;
  let createdClients;
  let createdClientInfos;
  let registeredFormatters;
  let instantiationService;
  let service;
  let storageService;
  setup(() => {
    configService = new TestConfigurationService();
    disposables.add(toDisposable(() => configService.dispose()));
    createdClients = [];
    createdClientInfos = [];
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IEnvironmentService, { logsHome: URI.file("/logs") });
    instantiationService.stub(IConfigurationService, configService);
    storageService = disposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    registeredFormatters = [];
    instantiationService.stub(ILabelService, {
      registerFormatter(formatter) {
        registeredFormatters.push(formatter);
        return toDisposable(() => {
          const idx = registeredFormatters.indexOf(formatter);
          if (idx >= 0) {
            registeredFormatters.splice(idx, 1);
          }
        });
      }
    });
    const mockInstantiationService = {
      createInstance: (ctor, ...args) => {
        const ctorName = ctor.name;
        if (ctorName === "WebSocketClientTransport") {
          return disposables.add(new MockTransport());
        }
        const client = new MockProtocolClient(args[0]);
        createdClientInfos.push(args[4]);
        disposables.add(client);
        createdClients.push(client);
        return client;
      }
    };
    instantiationService.stub(IInstantiationService, mockInstantiationService);
    service = disposables.add(instantiationService.createInstance(RemoteAgentHostService));
  });
  test("round-trips persisted entry types through their configuration", () => {
    const entries = [
      { name: "WebSocket", connectionToken: "ws-token", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host:8080" } },
      { name: "SSH", connectionToken: "ssh-token", connection: { type: RemoteAgentHostEntryType.SSH, address: "localhost:1234", sshConfigHost: "host", hostName: "host.example", user: "me", port: 2222 } }
    ];
    assert.deepStrictEqual(entries.map((entry) => {
      const config = getEntryTypeConfig(entry.connection.type);
      return config.fromRaw(config.toRaw(entry, entry.connection));
    }), entries);
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  async function waitForConnected() {
    while (!service.connections.some((c) => RemoteAgentHostConnectionStatus.isConnected(c.status))) {
      await Event.toPromise(service.onDidChangeConnections);
    }
  }
  test("starts with no connections when setting is empty", () => {
    assert.deepStrictEqual(service.connections, []);
  });
  test("parses supported remote host inputs", () => {
    assert.deepStrictEqual([
      parseRemoteAgentHostInput("Listening on ws://127.0.0.1:8089"),
      parseRemoteAgentHostInput("Agent host proxy listening on ws://127.0.0.1:8089"),
      parseRemoteAgentHostInput("127.0.0.1:8089"),
      parseRemoteAgentHostInput("ws://127.0.0.1:8089"),
      parseRemoteAgentHostInput("ws://127.0.0.1:40147?tkn=c9d12867-da33-425e-8d39-0d071e851597"),
      parseRemoteAgentHostInput("wss://secure.example.com:443"),
      parseRemoteAgentHostInput("local"),
      parseRemoteAgentHostInput("ws://local")
    ], [
      { parsed: { address: "127.0.0.1:8089", connectionToken: void 0, suggestedName: "127.0.0.1:8089" } },
      { parsed: { address: "127.0.0.1:8089", connectionToken: void 0, suggestedName: "127.0.0.1:8089" } },
      { parsed: { address: "127.0.0.1:8089", connectionToken: void 0, suggestedName: "127.0.0.1:8089" } },
      { parsed: { address: "127.0.0.1:8089", connectionToken: void 0, suggestedName: "127.0.0.1:8089" } },
      { parsed: { address: "127.0.0.1:40147", connectionToken: "c9d12867-da33-425e-8d39-0d071e851597", suggestedName: "127.0.0.1:40147" } },
      { parsed: { address: "wss://secure.example.com", connectionToken: void 0, suggestedName: "secure.example.com" } },
      { parsed: { address: "local", connectionToken: void 0, suggestedName: "local" } },
      { parsed: { address: "local", connectionToken: void 0, suggestedName: "local" } }
    ]);
  });
  test("getConnection returns undefined for unknown address", () => {
    assert.strictEqual(service.getConnection("ws://unknown:1234"), void 0);
  });
  test("creates connection when setting is updated", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    assert.strictEqual(createdClients.length, 1);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    const connected = service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status));
    assert.deepStrictEqual({
      connection: connected.map(({ address, name }) => ({ address, name })),
      clientInfo: createdClientInfos
    }, {
      connection: [{ address: "host1:8080", name: "Host 1" }],
      clientInfo: [editorWindowAgentHostClientInfo]
    });
  });
  test("agents window service identifies its protocol client", async () => {
    service.dispose();
    service = disposables.add(instantiationService.createInstance(AgentsWindowRemoteAgentHostService));
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    assert.deepStrictEqual(createdClientInfos, [agentsWindowAgentHostClientInfo]);
  });
  test("getConnection returns client after successful connect", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    const connection = service.getConnection("ws://host1:8080");
    assert.ok(connection);
    assert.strictEqual(connection.clientId, createdClients[0].clientId);
  });
  test("removes connection when setting entry is removed", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    const removedEvent = Event.toPromise(service.onDidChangeConnections);
    configService.setEntries([]);
    await removedEvent;
    assert.strictEqual(service.connections.length, 0);
    assert.strictEqual(service.getConnection("ws://host1:8080"), void 0);
  });
  test("fires onDidChangeConnections when connection closes", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    const closedEvent = Event.toPromise(service.onDidChangeConnections);
    createdClients[0].fireClose();
    await closedEvent;
    assert.strictEqual(service.getConnection("ws://host1:8080"), void 0);
    const entry = service.connections.find((c) => c.address === "host1:8080");
    assert.ok(entry);
    assert.strictEqual(entry.status, RemoteAgentHostConnectionStatus.disconnected);
  });
  test("removes connection on connect failure", async () => {
    configService.setEntries([{ name: "Bad", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://bad:9999" } }]);
    assert.strictEqual(createdClients.length, 1);
    const connectionChanged = Event.toPromise(service.onDidChangeConnections);
    createdClients[0].connectDeferred.error(new Error("Connection refused"));
    await connectionChanged;
    assert.strictEqual(service.connections.length, 0);
    assert.strictEqual(service.getConnection("ws://bad:9999"), void 0);
  });
  test("manages multiple connections independently", async () => {
    configService.setEntries([
      { name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } },
      { name: "Host 2", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host2:8080" } }
    ]);
    assert.strictEqual(createdClients.length, 2);
    createdClients[0].connectDeferred.complete();
    createdClients[1].connectDeferred.complete();
    await waitForConnected();
    assert.strictEqual(service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 2);
    const conn1 = service.getConnection("ws://host1:8080");
    const conn2 = service.getConnection("ws://host2:8080");
    assert.ok(conn1);
    assert.ok(conn2);
    assert.notStrictEqual(conn1.clientId, conn2.clientId);
  });
  test("does not re-create existing connections on setting update", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    const firstClientId = createdClients[0].clientId;
    configService.setEntries([{ name: "Renamed", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    assert.strictEqual(createdClients.length, 1);
    const conn = service.getConnection("ws://host1:8080");
    assert.ok(conn);
    assert.strictEqual(conn.clientId, firstClientId);
    const entry = service.connections.find((c) => c.address === "host1:8080");
    assert.strictEqual(entry?.name, "Renamed");
  });
  test("addRemoteAgentHost stores the entry and waits for connection", async () => {
    const connectionPromise = service.addRemoteAgentHost({
      name: "Host 1",
      connectionToken: "secret-token",
      connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" }
    });
    assert.deepStrictEqual(configService.entries, [{
      address: "host1:8080",
      name: "Host 1",
      connectionToken: "secret-token"
    }]);
    assert.strictEqual(createdClients.length, 1);
    createdClients[0].connectDeferred.complete();
    const connection = await connectionPromise;
    assert.deepStrictEqual(connection, {
      address: "host1:8080",
      name: "Host 1",
      clientId: createdClients[0].clientId,
      defaultDirectory: void 0,
      status: RemoteAgentHostConnectionStatus.connected
    });
  });
  test("addRemoteAgentHost updates existing configured entries without reconnecting", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    const connection = await service.addRemoteAgentHost({
      name: "Updated Host",
      connectionToken: "new-token",
      connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" }
    });
    assert.strictEqual(createdClients.length, 1);
    assert.deepStrictEqual(configService.entries, [{
      address: "host1:8080",
      name: "Updated Host",
      connectionToken: "new-token"
    }]);
    assert.deepStrictEqual(connection, {
      address: "host1:8080",
      name: "Updated Host",
      clientId: createdClients[0].clientId,
      defaultDirectory: void 0,
      status: RemoteAgentHostConnectionStatus.connected
    });
  });
  test("addRemoteAgentHost appends when adding a second host", async () => {
    const firstPromise = service.addRemoteAgentHost({
      name: "Host 1",
      connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host1:8080" }
    });
    createdClients[0].connectDeferred.complete();
    await firstPromise;
    const secondPromise = service.addRemoteAgentHost({
      name: "Host 2",
      connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host2:9090" }
    });
    createdClients[1].connectDeferred.complete();
    await secondPromise;
    assert.strictEqual(createdClients.length, 2);
    assert.deepStrictEqual(configService.entries, [
      { address: "host1:8080", name: "Host 1", connectionToken: void 0 },
      { address: "host2:9090", name: "Host 2", connectionToken: void 0 }
    ]);
    assert.strictEqual(service.connections.length, 2);
  });
  test("addRemoteAgentHost resolves when connection completes before wait is created", async () => {
    const originalUpdateValue = configService.updateValue.bind(configService);
    configService.updateValue = async (key, value) => {
      await originalUpdateValue(key, value);
      if (createdClients.length > 0) {
        createdClients[createdClients.length - 1].connectDeferred.complete();
      }
    };
    const connection = await service.addRemoteAgentHost({
      name: "Fast Host",
      connection: { type: RemoteAgentHostEntryType.WebSocket, address: "fast-host:1234" }
    });
    assert.strictEqual(connection.address, "fast-host:1234");
    assert.strictEqual(connection.name, "Fast Host");
  });
  test("disabling the enabled setting disconnects all remotes", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    assert.strictEqual(service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);
    configService.setEnabled(false);
    assert.strictEqual(service.connections.length, 0);
  });
  test("addRemoteAgentHost throws when disabled", async () => {
    configService.setEnabled(false);
    await assert.rejects(
      () => service.addRemoteAgentHost({ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host1:8080" } }),
      /not enabled/
    );
  });
  test("re-enabling reconnects configured remotes", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    assert.strictEqual(service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);
    configService.setEnabled(false);
    assert.strictEqual(service.connections.length, 0);
    configService.setEnabled(true);
    assert.strictEqual(createdClients.length, 2);
    createdClients[1].connectDeferred.complete();
    await waitForConnected();
    assert.strictEqual(service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);
  });
  test("removeRemoteAgentHost removes entry and disconnects", async () => {
    configService.setEntries([
      { name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } },
      { name: "Host 2", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host2:9090" } }
    ]);
    createdClients[0].connectDeferred.complete();
    createdClients[1].connectDeferred.complete();
    await waitForConnected();
    assert.strictEqual(service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 2);
    await service.removeRemoteAgentHost("ws://host1:8080");
    assert.deepStrictEqual(configService.entries, [
      { address: "ws://host2:9090", name: "Host 2", connectionToken: void 0 }
    ]);
    assert.strictEqual(service.connections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).length, 1);
    assert.strictEqual(service.getConnection("ws://host1:8080"), void 0);
    assert.ok(service.getConnection("ws://host2:9090"));
  });
  test("removeRemoteAgentHost normalizes address before removing", async () => {
    configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host1:8080" } }]);
    createdClients[0].connectDeferred.complete();
    await waitForConnected();
    await service.removeRemoteAgentHost("ws://host1:8080");
    assert.deepStrictEqual(configService.entries, []);
    assert.strictEqual(service.connections.length, 0);
  });
  suite("addManagedConnection", () => {
    function makeTransportDisposable() {
      let disposed = false;
      return {
        disposable: { dispose: () => {
          disposed = true;
        } },
        disposed: () => disposed
      };
    }
    async function addManaged(name, address, transport) {
      const mockClient = disposables.add(new MockProtocolClient(`ws://${address}`));
      return service.addManagedConnection(
        { name, connection: { type: RemoteAgentHostEntryType.WebSocket, address } },
        mockClient,
        transport
      );
    }
    test("keeps incompatible managed connection addressable for server upgrade", async () => {
      const mockClient = disposables.add(new MockProtocolClient("ssh:remote.example"));
      await service.addManagedConnection(
        {
          name: "SSH Host",
          connection: {
            type: RemoteAgentHostEntryType.SSH,
            address: "ssh:remote.example",
            sshConfigHost: "remote",
            hostName: "remote.example"
          }
        },
        mockClient,
        void 0,
        RemoteAgentHostConnectionStatus.incompatible("Unsupported protocol version", ["0.3.0"], ["^0.2.0"], "_vscodeUpgrade")
      );
      const upgradeResult = await service.triggerServerUpgrade("ssh:remote.example", "_vscodeUpgrade");
      assert.deepStrictEqual({
        status: service.connections[0].status,
        connectedConnection: service.getConnection("ssh:remote.example"),
        upgradeCalls: mockClient.triggerVscodeUpgradeCalls,
        upgradeResult
      }, {
        status: RemoteAgentHostConnectionStatus.incompatible("Unsupported protocol version", ["0.3.0"], ["^0.2.0"], "_vscodeUpgrade"),
        connectedConnection: void 0,
        upgradeCalls: ["_vscodeUpgrade"],
        upgradeResult: { ok: true, upgradeStarted: true }
      });
    });
    test("disposes transportDisposable when entry is removed via removeRemoteAgentHost", async () => {
      const t = makeTransportDisposable();
      await addManaged("Managed", "managed:1234", t.disposable);
      assert.strictEqual(t.disposed(), false);
      await service.removeRemoteAgentHost("ws://managed:1234");
      assert.strictEqual(t.disposed(), true, "transport disposable runs when entry is removed");
      assert.strictEqual(service.getConnection("ws://managed:1234"), void 0);
    });
    test("throws when disabled", async () => {
      configService.setEnabled(false);
      await assert.rejects(
        () => addManaged("Managed", "managed:1234"),
        /not enabled/
      );
    });
    test("does NOT dispose previous transportDisposable when entry is replaced", async () => {
      const t1 = makeTransportDisposable();
      await addManaged("Managed", "managed:1234", t1.disposable);
      const t2 = makeTransportDisposable();
      await addManaged("Managed", "managed:1234", t2.disposable);
      assert.strictEqual(t1.disposed(), false, "previous transport disposable is not run on replacement");
      assert.strictEqual(t2.disposed(), false, "new transport disposable is still alive");
      await service.removeRemoteAgentHost("ws://managed:1234");
      assert.strictEqual(t2.disposed(), true, "new transport disposable runs on full removal");
    });
    test("disposes transportDisposable when service itself is disposed", async () => {
      const t = makeTransportDisposable();
      await addManaged("Managed", "managed:1234", t.disposable);
      service.dispose();
      assert.strictEqual(t.disposed(), true, "transport disposable runs when service is disposed");
    });
    test("stores SSH connection details outside the remote hosts setting", async () => {
      const mockClient = disposables.add(new MockProtocolClient("ssh:remote.example"));
      await service.addManagedConnection(
        {
          name: "SSH Host",
          connectionToken: "ssh-token",
          connection: {
            type: RemoteAgentHostEntryType.SSH,
            address: "ssh:remote.example",
            sshConfigHost: "remote",
            hostName: "remote.example",
            user: "me",
            port: 2222
          }
        },
        mockClient
      );
      assert.deepStrictEqual({
        settings: configService.entries,
        configured: service.configuredEntries
      }, {
        settings: [],
        configured: [{
          name: "SSH Host",
          connectionToken: "ssh-token",
          connection: {
            type: RemoteAgentHostEntryType.SSH,
            address: "ssh:remote.example",
            sshConfigHost: "remote",
            hostName: "remote.example",
            user: "me",
            port: 2222
          }
        }]
      });
    });
    test("does not persist runtime managed connections or their removal", async () => {
      const entries = [
        { name: "Tunnel", connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: "runtime-tunnel", clusterId: "cluster" } },
        { name: "WSL", connection: { type: RemoteAgentHostEntryType.WSL, address: "wsl:runtime", distro: "runtime" } },
        { name: "Cloud Sandbox", connection: { type: RemoteAgentHostEntryType.CloudSandbox, address: "cloud:runtime", environmentId: "env_runtime" } }
      ];
      const addresses = ["tunnel:runtime-tunnel", "wsl:runtime", "cloud:runtime"];
      for (let index = 0; index < entries.length; index++) {
        const client = disposables.add(new MockProtocolClient(addresses[index]));
        await service.addManagedConnection(entries[index], client);
      }
      for (const address of addresses) {
        await service.removeRemoteAgentHost(address);
      }
      assert.deepStrictEqual({
        settingsWrites: configService.updateValueCalls,
        storageWrites: storageService.writeCalls,
        settings: configService.entries
      }, {
        settingsWrites: 0,
        storageWrites: 0,
        settings: []
      });
    });
    test("keeps a registered tunnel connected when WebSocket settings change", async () => {
      const tunnel = disposables.add(new MockProtocolClient("tunnel:live"));
      await service.addManagedConnection(
        { name: "Tunnel", connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: "live", clusterId: "cluster" } },
        tunnel
      );
      configService.setEntries([{ name: "WebSocket", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host:8080" } }]);
      assert.strictEqual(service.getConnection("tunnel:live"), tunnel);
    });
    test("migrates legacy SSH connection details from settings to storage", async () => {
      service.dispose();
      configService.setRawEntries([{
        address: "ssh:legacy",
        name: "Legacy SSH Host",
        connectionToken: "ssh-token",
        sshConfigHost: "legacy",
        sshHostName: "legacy.example",
        sshUser: "me",
        sshPort: 2222
      }]);
      service = disposables.add(instantiationService.createInstance(RemoteAgentHostService));
      assert.deepStrictEqual({
        settings: configService.entries,
        configured: service.configuredEntries
      }, {
        settings: [],
        configured: [{
          name: "Legacy SSH Host",
          connectionToken: "ssh-token",
          connection: {
            type: RemoteAgentHostEntryType.SSH,
            address: "ssh:legacy",
            sshConfigHost: "legacy",
            hostName: "legacy.example",
            user: "me",
            port: 2222
          }
        }]
      });
      service.dispose();
      service = disposables.add(instantiationService.createInstance(RemoteAgentHostService));
      assert.deepStrictEqual({
        settings: configService.entries,
        configured: service.configuredEntries
      }, {
        settings: [],
        configured: [{
          name: "Legacy SSH Host",
          connectionToken: "ssh-token",
          connection: {
            type: RemoteAgentHostEntryType.SSH,
            address: "ssh:legacy",
            sshConfigHost: "legacy",
            hostName: "legacy.example",
            user: "me",
            port: 2222
          }
        }]
      });
    });
    test("fires change when removing a storage-only SSH entry", async () => {
      service.dispose();
      configService.setRawEntries([{
        address: "ssh:legacy",
        name: "Legacy SSH Host",
        sshConfigHost: "legacy",
        sshHostName: "legacy.example"
      }]);
      service = disposables.add(instantiationService.createInstance(RemoteAgentHostService));
      const changed = Event.toPromise(service.onDidChangeConnections);
      await service.removeRemoteAgentHost("ssh:legacy");
      await changed;
      assert.deepStrictEqual({
        settings: configService.entries,
        configured: service.configuredEntries
      }, {
        settings: [],
        configured: []
      });
    });
    test("replacing a stored SSH entry with a WebSocket entry clears the storage row", async () => {
      service.dispose();
      configService.setRawEntries([{
        address: "host1:8080",
        name: "SSH Host",
        sshConfigHost: "legacy",
        sshHostName: "legacy.example"
      }]);
      service = disposables.add(instantiationService.createInstance(RemoteAgentHostService));
      const added = service.addRemoteAgentHost({ name: "WebSocket Host", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host1:8080" } });
      createdClients[createdClients.length - 1].connectDeferred.complete();
      await added;
      assert.deepStrictEqual(service.configuredEntries, [{
        name: "WebSocket Host",
        connectionToken: void 0,
        connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host1:8080" }
      }]);
    });
    test("keeps runtime connection names across reconciliation", async () => {
      const tunnel = { name: "My Tunnel", connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: "tunnel", clusterId: "cluster" } };
      const client = disposables.add(new MockProtocolClient("tunnel:tunnel"));
      await service.addManagedConnection(tunnel, client);
      configService.setEntries([{ name: "WebSocket", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "host1:8080" } }]);
      assert.deepStrictEqual(
        service.connections.find((connection) => connection.address === "tunnel:tunnel")?.name,
        "My Tunnel"
      );
    });
  });
  suite("host label formatter", () => {
    function formatterFor(address) {
      const authority = agentHostAuthority(address);
      return registeredFormatters.find((f) => f.scheme === AGENT_HOST_SCHEME && f.authority === authority);
    }
    test("registers formatter when an entry is added", async () => {
      configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
      const formatter = formatterFor("host1:8080");
      assert.ok(formatter, "formatter is registered");
      assert.strictEqual(formatter.formatting.workspaceSuffix, "Host 1");
    });
    test("refreshes formatter when an entry name changes", async () => {
      configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
      configService.setEntries([{ name: "Renamed", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
      const matching = registeredFormatters.filter((f) => f.authority === agentHostAuthority("host1:8080"));
      assert.strictEqual(matching.length, 1, "old formatter is replaced, not duplicated");
      assert.strictEqual(matching[0].formatting.workspaceSuffix, "Renamed");
    });
    test("removes formatter when an entry is removed", async () => {
      configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
      assert.ok(formatterFor("host1:8080"));
      configService.setEntries([]);
      assert.strictEqual(formatterFor("host1:8080"), void 0);
    });
    test("removes formatters when the service is disabled", async () => {
      configService.setEntries([{ name: "Host 1", connection: { type: RemoteAgentHostEntryType.WebSocket, address: "ws://host1:8080" } }]);
      assert.ok(formatterFor("host1:8080"));
      configService.setEnabled(false);
      assert.strictEqual(formatterFor("host1:8080"), void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxlbGVjdHJvbi1icm93c2VyXFxyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0eXBlIElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSwgdHlwZSBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyIH0gZnJvbSAnLi4vLi4vLi4vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IEFnZW50c1dpbmRvd1JlbW90ZUFnZW50SG9zdFNlcnZpY2UsIFJlbW90ZUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3JlbW90ZUFnZW50SG9zdFNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IGdldEVudHJ5VHlwZUNvbmZpZywgcGFyc2VSZW1vdGVBZ2VudEhvc3RJbnB1dCwgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cywgUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLCBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCwgUmVtb3RlQWdlbnRIb3N0c1NldHRpbmdJZCwgdHlwZSBJUmF3UmVtb3RlQWdlbnRIb3N0RW50cnksIHR5cGUgSVJlbW90ZUFnZW50SG9zdEVudHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9TQ0hFTUUsIGFnZW50SG9zdEF1dGhvcml0eSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB0eXBlIHsgU3RvcmFnZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB0eXBlIHsgSW1wbGVtZW50YXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGFnZW50c1dpbmRvd0FnZW50SG9zdENsaWVudEluZm8sIGVkaXRvcldpbmRvd0FnZW50SG9zdENsaWVudEluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5cbi8vIC0tLS0gTW9jayB0cmFuc3BvcnQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNsYXNzIE1vY2tUcmFuc3BvcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgb25NZXNzYWdlID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25DbG9zZSA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uT3BlbiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IGlzT3BlbiA9IGZhbHNlO1xuXHRjb25uZWN0KCk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7IH1cblx0c2VuZCgpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cbn1cblxuLy8gLS0tLSBNb2NrIHByb3RvY29sIGNsaWVudCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgTW9ja1Byb3RvY29sQ2xpZW50IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIF9uZXh0SWQgPSAxO1xuXHRyZWFkb25seSBjbGllbnRJZCA9IGBtb2NrLWNsaWVudC0ke01vY2tQcm90b2NvbENsaWVudC5fbmV4dElkKyt9YDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2UgPSB0aGlzLl9vbkRpZENsb3NlLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZEFjdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZFJlY2VpdmVPdGxwTG9ncyA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IGNvbm5lY3Rpb25TdGF0ZSA9ICdjb25uZWN0aW5nJyBhcyBjb25zdDtcblx0cmVhZG9ubHkgaW5pdGlhbGl6ZVJlc3VsdCA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdGVsZW1ldHJ5Q2FwYWJpbGl0aWVzID0gdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0cmlnZ2VyVnNjb2RlVXBncmFkZUNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdHB1YmxpYyBjb25uZWN0RGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IG1vY2tBZGRyZXNzOiBzdHJpbmcpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgY29ubmVjdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5jb25uZWN0RGVmZXJyZWQucDtcblx0fVxuXG5cdGFzeW5jIHRyaWdnZXJWc2NvZGVVcGdyYWRlKG1ldGhvZDogc3RyaW5nKSB7XG5cdFx0dGhpcy50cmlnZ2VyVnNjb2RlVXBncmFkZUNhbGxzLnB1c2gobWV0aG9kKTtcblx0XHRyZXR1cm4geyBvazogdHJ1ZSwgdXBncmFkZVN0YXJ0ZWQ6IHRydWUgfTtcblx0fVxuXG5cdGZpcmVDbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENsb3NlLmZpcmUoKTtcblx0fVxufVxuXG4vLyAtLS0tIFRlc3QgY29uZmlndXJhdGlvbiBzZXJ2aWNlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jbGFzcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSBuZXcgRW1pdHRlcjxQYXJ0aWFsPElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQ+PigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSB0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSBfZW50cmllczogSVJhd1JlbW90ZUFnZW50SG9zdEVudHJ5W10gPSBbXTtcblx0cHJpdmF0ZSBfZW5hYmxlZCA9IHRydWU7XG5cdHVwZGF0ZVZhbHVlQ2FsbHMgPSAwO1xuXG5cdGdldFZhbHVlKGtleT86IHN0cmluZyk6IHVua25vd24ge1xuXHRcdGlmIChrZXkgPT09IFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZW5hYmxlZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJpZXM7XG5cdH1cblxuXHRpbnNwZWN0KF9rZXk6IHN0cmluZykge1xuXHRcdHJldHVybiB7XG5cdFx0XHR1c2VyVmFsdWU6IHRoaXMuX2VudHJpZXMsXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVZhbHVlKF9rZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnVwZGF0ZVZhbHVlQ2FsbHMrKztcblx0XHRjb25zdCBlbnRyaWVzID0gKHZhbHVlIGFzIElSYXdSZW1vdGVBZ2VudEhvc3RFbnRyeVtdIHwgdW5kZWZpbmVkKSA/PyBbXTtcblx0XHRjb25zdCBjaGFuZ2VkID0gSlNPTi5zdHJpbmdpZnkodGhpcy5fZW50cmllcykgIT09IEpTT04uc3RyaW5naWZ5KGVudHJpZXMpO1xuXHRcdHRoaXMuX2VudHJpZXMgPSBlbnRyaWVzO1xuXHRcdGlmICghY2hhbmdlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZSh7XG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09IFJlbW90ZUFnZW50SG9zdHNTZXR0aW5nSWQgfHwga2V5ID09PSBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCxcblx0XHR9KTtcblx0fVxuXG5cdGdldCBlbnRyaWVzKCk6IHJlYWRvbmx5IElSYXdSZW1vdGVBZ2VudEhvc3RFbnRyeVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fZW50cmllcztcblx0fVxuXG5cdHNldEVudHJpZXMoZW50cmllczogSVJlbW90ZUFnZW50SG9zdEVudHJ5W10pOiB2b2lkIHtcblx0XHR0aGlzLl9lbnRyaWVzID0gZW50cmllcy5mbGF0TWFwKGVudHJ5ID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IGdldEVudHJ5VHlwZUNvbmZpZyhlbnRyeS5jb25uZWN0aW9uLnR5cGUpO1xuXHRcdFx0cmV0dXJuIGNvbmZpZy5zdG9yZSA9PT0gJ3NldHRpbmdzJyA/IFtjb25maWcudG9SYXchKGVudHJ5LCBlbnRyeS5jb25uZWN0aW9uKV0gOiBbXTtcblx0XHR9KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZSh7XG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09IFJlbW90ZUFnZW50SG9zdHNTZXR0aW5nSWQgfHwga2V5ID09PSBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCxcblx0XHR9KTtcblx0fVxuXG5cdHNldFJhd0VudHJpZXMoZW50cmllczogSVJhd1JlbW90ZUFnZW50SG9zdEVudHJ5W10pOiB2b2lkIHtcblx0XHR0aGlzLl9lbnRyaWVzID0gZW50cmllcztcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZSh7XG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09IFJlbW90ZUFnZW50SG9zdHNTZXR0aW5nSWQgfHwga2V5ID09PSBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCxcblx0XHR9KTtcblx0fVxuXG5cdHNldEVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2VuYWJsZWQgPSBlbmFibGVkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5maXJlKHtcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoa2V5OiBzdHJpbmcpID0+IGtleSA9PT0gUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQsXG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdFN0b3JhZ2VTZXJ2aWNlIGV4dGVuZHMgSW5NZW1vcnlTdG9yYWdlU2VydmljZSB7XG5cdHdyaXRlQ2FsbHMgPSAwO1xuXG5cdG92ZXJyaWRlIHN0b3JlKGtleTogc3RyaW5nLCB2YWx1ZTogU3RvcmFnZVZhbHVlLCBzY29wZTogU3RvcmFnZVNjb3BlLCB0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQsIGV4dGVybmFsID0gZmFsc2UpOiB2b2lkIHtcblx0XHR0aGlzLndyaXRlQ2FsbHMrKztcblx0XHRzdXBlci5zdG9yZShrZXksIHZhbHVlLCBzY29wZSwgdGFyZ2V0LCBleHRlcm5hbCk7XG5cdH1cblxuXHRvdmVycmlkZSByZW1vdmUoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGV4dGVybmFsID0gZmFsc2UpOiB2b2lkIHtcblx0XHR0aGlzLndyaXRlQ2FsbHMrKztcblx0XHRzdXBlci5yZW1vdmUoa2V5LCBzY29wZSwgZXh0ZXJuYWwpO1xuXHR9XG59XG5cbnN1aXRlKCdSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgY29uZmlnU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgY3JlYXRlZENsaWVudHM6IE1vY2tQcm90b2NvbENsaWVudFtdO1xuXHRsZXQgY3JlYXRlZENsaWVudEluZm9zOiAoSW1wbGVtZW50YXRpb24gfCB1bmRlZmluZWQpW107XG5cdGxldCByZWdpc3RlcmVkRm9ybWF0dGVyczogUmVzb3VyY2VMYWJlbEZvcm1hdHRlcltdO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IHNlcnZpY2U6IFJlbW90ZUFnZW50SG9zdFNlcnZpY2U7XG5cdGxldCBzdG9yYWdlU2VydmljZTogVGVzdFN0b3JhZ2VTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY29uZmlnU2VydmljZS5kaXNwb3NlKCkpKTtcblxuXHRcdGNyZWF0ZWRDbGllbnRzID0gW107XG5cdFx0Y3JlYXRlZENsaWVudEluZm9zID0gW107XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFNlcnZpY2UsIHsgbG9nc0hvbWU6IFVSSS5maWxlKCcvbG9ncycpIH0gYXMgUGFydGlhbDxJRW52aXJvbm1lbnRTZXJ2aWNlPik7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UgYXMgUGFydGlhbDxJQ29uZmlndXJhdGlvblNlcnZpY2U+KTtcblx0XHRzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0cmVnaXN0ZXJlZEZvcm1hdHRlcnMgPSBbXTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYWJlbFNlcnZpY2UsIHtcblx0XHRcdHJlZ2lzdGVyRm9ybWF0dGVyKGZvcm1hdHRlcjogUmVzb3VyY2VMYWJlbEZvcm1hdHRlcikge1xuXHRcdFx0XHRyZWdpc3RlcmVkRm9ybWF0dGVycy5wdXNoKGZvcm1hdHRlcik7XG5cdFx0XHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGlkeCA9IHJlZ2lzdGVyZWRGb3JtYXR0ZXJzLmluZGV4T2YoZm9ybWF0dGVyKTtcblx0XHRcdFx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdFx0XHRcdHJlZ2lzdGVyZWRGb3JtYXR0ZXJzLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgUGFydGlhbDxJTGFiZWxTZXJ2aWNlPik7XG5cblx0XHQvLyBNb2NrIHRoZSBpbnN0YW50aWF0aW9uIHNlcnZpY2UgdG8gY2FwdHVyZSBjcmVhdGVkIHByb3RvY29sIGNsaWVudHMuXG5cdFx0Ly8gYF9jb25uZWN0VG9gIGNhbGxzIGBjcmVhdGVJbnN0YW5jZWAgZm9yIGBXZWJTb2NrZXRDbGllbnRUcmFuc3BvcnRgXG5cdFx0Ly8gYW5kIGBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudGAuIFdlIG9ubHkgY2FyZSBhYm91dCB0cmFja2luZ1xuXHRcdC8vIHRoZSBwcm90b2NvbCBjbGllbnQ7IGZvciB0aGUgdHJhbnNwb3J0IHdlIHJldHVybiBhIG5vLW9wXG5cdFx0Ly8gZGlzcG9zYWJsZSBzbyB0aGUgdGVzdCBjYW4ga2VlcCBhc3NlcnRpbmcgb24gYGNyZWF0ZWRDbGllbnRzLmxlbmd0aGAuXG5cdFx0Y29uc3QgbW9ja0luc3RhbnRpYXRpb25TZXJ2aWNlOiBQYXJ0aWFsPElJbnN0YW50aWF0aW9uU2VydmljZT4gPSB7XG5cdFx0XHRjcmVhdGVJbnN0YW5jZTogKGN0b3I6IHVua25vd24sIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0XHRjb25zdCBjdG9yTmFtZSA9IChjdG9yIGFzIHsgbmFtZT86IHN0cmluZyB9KS5uYW1lO1xuXHRcdFx0XHRpZiAoY3Rvck5hbWUgPT09ICdXZWJTb2NrZXRDbGllbnRUcmFuc3BvcnQnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1RyYW5zcG9ydCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjbGllbnQgPSBuZXcgTW9ja1Byb3RvY29sQ2xpZW50KGFyZ3NbMF0gYXMgc3RyaW5nKTtcblx0XHRcdFx0Y3JlYXRlZENsaWVudEluZm9zLnB1c2goYXJnc1s0XSBhcyBJbXBsZW1lbnRhdGlvbiB8IHVuZGVmaW5lZCk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChjbGllbnQpO1xuXHRcdFx0XHRjcmVhdGVkQ2xpZW50cy5wdXNoKGNsaWVudCk7XG5cdFx0XHRcdHJldHVybiBjbGllbnQ7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSW5zdGFudGlhdGlvblNlcnZpY2UsIG1vY2tJbnN0YW50aWF0aW9uU2VydmljZSBhcyBQYXJ0aWFsPElJbnN0YW50aWF0aW9uU2VydmljZT4pO1xuXG5cdFx0c2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIHBlcnNpc3RlZCBlbnRyeSB0eXBlcyB0aHJvdWdoIHRoZWlyIGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZW50cmllczogSVJlbW90ZUFnZW50SG9zdEVudHJ5W10gPSBbXG5cdFx0XHR7IG5hbWU6ICdXZWJTb2NrZXQnLCBjb25uZWN0aW9uVG9rZW46ICd3cy10b2tlbicsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDo4MDgwJyB9IH0sXG5cdFx0XHR7IG5hbWU6ICdTU0gnLCBjb25uZWN0aW9uVG9rZW46ICdzc2gtdG9rZW4nLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gsIGFkZHJlc3M6ICdsb2NhbGhvc3Q6MTIzNCcsIHNzaENvbmZpZ0hvc3Q6ICdob3N0JywgaG9zdE5hbWU6ICdob3N0LmV4YW1wbGUnLCB1c2VyOiAnbWUnLCBwb3J0OiAyMjIyIH0gfSxcblx0XHRdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyaWVzLm1hcChlbnRyeSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBnZXRFbnRyeVR5cGVDb25maWcoZW50cnkuY29ubmVjdGlvbi50eXBlKTtcblx0XHRcdHJldHVybiBjb25maWcuZnJvbVJhdyEoY29uZmlnLnRvUmF3IShlbnRyeSwgZW50cnkuY29ubmVjdGlvbikpO1xuXHRcdH0pLCBlbnRyaWVzKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8qKiBXYWl0IGZvciBhIGNvbm5lY3Rpb24gdG8gcmVhY2ggQ29ubmVjdGVkIHN0YXR1cy4gKi9cblx0YXN5bmMgZnVuY3Rpb24gd2FpdEZvckNvbm5lY3RlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR3aGlsZSAoIXNlcnZpY2UuY29ubmVjdGlvbnMuc29tZShjID0+IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQoYy5zdGF0dXMpKSkge1xuXHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnc3RhcnRzIHdpdGggbm8gY29ubmVjdGlvbnMgd2hlbiBzZXR0aW5nIGlzIGVtcHR5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5jb25uZWN0aW9ucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgc3VwcG9ydGVkIHJlbW90ZSBob3N0IGlucHV0cycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHBhcnNlUmVtb3RlQWdlbnRIb3N0SW5wdXQoJ0xpc3RlbmluZyBvbiB3czovLzEyNy4wLjAuMTo4MDg5JyksXG5cdFx0XHRwYXJzZVJlbW90ZUFnZW50SG9zdElucHV0KCdBZ2VudCBob3N0IHByb3h5IGxpc3RlbmluZyBvbiB3czovLzEyNy4wLjAuMTo4MDg5JyksXG5cdFx0XHRwYXJzZVJlbW90ZUFnZW50SG9zdElucHV0KCcxMjcuMC4wLjE6ODA4OScpLFxuXHRcdFx0cGFyc2VSZW1vdGVBZ2VudEhvc3RJbnB1dCgnd3M6Ly8xMjcuMC4wLjE6ODA4OScpLFxuXHRcdFx0cGFyc2VSZW1vdGVBZ2VudEhvc3RJbnB1dCgnd3M6Ly8xMjcuMC4wLjE6NDAxNDc/dGtuPWM5ZDEyODY3LWRhMzMtNDI1ZS04ZDM5LTBkMDcxZTg1MTU5NycpLFxuXHRcdFx0cGFyc2VSZW1vdGVBZ2VudEhvc3RJbnB1dCgnd3NzOi8vc2VjdXJlLmV4YW1wbGUuY29tOjQ0MycpLFxuXHRcdFx0cGFyc2VSZW1vdGVBZ2VudEhvc3RJbnB1dCgnbG9jYWwnKSxcblx0XHRcdHBhcnNlUmVtb3RlQWdlbnRIb3N0SW5wdXQoJ3dzOi8vbG9jYWwnKSxcblx0XHRdLCBbXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnMTI3LjAuMC4xOjgwODknLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCwgc3VnZ2VzdGVkTmFtZTogJzEyNy4wLjAuMTo4MDg5JyB9IH0sXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnMTI3LjAuMC4xOjgwODknLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCwgc3VnZ2VzdGVkTmFtZTogJzEyNy4wLjAuMTo4MDg5JyB9IH0sXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnMTI3LjAuMC4xOjgwODknLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCwgc3VnZ2VzdGVkTmFtZTogJzEyNy4wLjAuMTo4MDg5JyB9IH0sXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnMTI3LjAuMC4xOjgwODknLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCwgc3VnZ2VzdGVkTmFtZTogJzEyNy4wLjAuMTo4MDg5JyB9IH0sXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnMTI3LjAuMC4xOjQwMTQ3JywgY29ubmVjdGlvblRva2VuOiAnYzlkMTI4NjctZGEzMy00MjVlLThkMzktMGQwNzFlODUxNTk3Jywgc3VnZ2VzdGVkTmFtZTogJzEyNy4wLjAuMTo0MDE0NycgfSB9LFxuXHRcdFx0eyBwYXJzZWQ6IHsgYWRkcmVzczogJ3dzczovL3NlY3VyZS5leGFtcGxlLmNvbScsIGNvbm5lY3Rpb25Ub2tlbjogdW5kZWZpbmVkLCBzdWdnZXN0ZWROYW1lOiAnc2VjdXJlLmV4YW1wbGUuY29tJyB9IH0sXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnbG9jYWwnLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCwgc3VnZ2VzdGVkTmFtZTogJ2xvY2FsJyB9IH0sXG5cdFx0XHR7IHBhcnNlZDogeyBhZGRyZXNzOiAnbG9jYWwnLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCwgc3VnZ2VzdGVkTmFtZTogJ2xvY2FsJyB9IH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvbm5lY3Rpb24gcmV0dXJucyB1bmRlZmluZWQgZm9yIHVua25vd24gYWRkcmVzcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRDb25uZWN0aW9uKCd3czovL3Vua25vd246MTIzNCcpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVzIGNvbm5lY3Rpb24gd2hlbiBzZXR0aW5nIGlzIHVwZGF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbnRyaWVzKFt7IG5hbWU6ICdIb3N0IDEnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICd3czovL2hvc3QxOjgwODAnIH0gfV0pO1xuXG5cdFx0Ly8gUmVzb2x2ZSB0aGUgY29ubmVjdCBwcm9taXNlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRDbGllbnRzLmxlbmd0aCwgMSk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbm5lY3RlZCgpO1xuXG5cdFx0Y29uc3QgY29ubmVjdGVkID0gc2VydmljZS5jb25uZWN0aW9ucy5maWx0ZXIoYyA9PiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGMuc3RhdHVzKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb25uZWN0aW9uOiBjb25uZWN0ZWQubWFwKCh7IGFkZHJlc3MsIG5hbWUgfSkgPT4gKHsgYWRkcmVzcywgbmFtZSB9KSksXG5cdFx0XHRjbGllbnRJbmZvOiBjcmVhdGVkQ2xpZW50SW5mb3MsXG5cdFx0fSwge1xuXHRcdFx0Y29ubmVjdGlvbjogW3sgYWRkcmVzczogJ2hvc3QxOjgwODAnLCBuYW1lOiAnSG9zdCAxJyB9XSxcblx0XHRcdGNsaWVudEluZm86IFtlZGl0b3JXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnRzIHdpbmRvdyBzZXJ2aWNlIGlkZW50aWZpZXMgaXRzIHByb3RvY29sIGNsaWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50c1dpbmRvd1JlbW90ZUFnZW50SG9zdFNlcnZpY2UpKTtcblx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW3sgbmFtZTogJ0hvc3QgMScsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDE6ODA4MCcgfSB9XSk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbm5lY3RlZCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjcmVhdGVkQ2xpZW50SW5mb3MsIFthZ2VudHNXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvbm5lY3Rpb24gcmV0dXJucyBjbGllbnQgYWZ0ZXIgc3VjY2Vzc2Z1bCBjb25uZWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbeyBuYW1lOiAnSG9zdCAxJywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnd3M6Ly9ob3N0MTo4MDgwJyB9IH1dKTtcblx0XHRjcmVhdGVkQ2xpZW50c1swXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29ubmVjdGVkKCk7XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gc2VydmljZS5nZXRDb25uZWN0aW9uKCd3czovL2hvc3QxOjgwODAnKTtcblx0XHRhc3NlcnQub2soY29ubmVjdGlvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24uY2xpZW50SWQsIGNyZWF0ZWRDbGllbnRzWzBdLmNsaWVudElkKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlcyBjb25uZWN0aW9uIHdoZW4gc2V0dGluZyBlbnRyeSBpcyByZW1vdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEFkZCBhIGNvbm5lY3Rpb25cblx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW3sgbmFtZTogJ0hvc3QgMScsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDE6ODA4MCcgfSB9XSk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbm5lY3RlZCgpO1xuXG5cdFx0Ly8gUmVtb3ZlIGl0XG5cdFx0Y29uc3QgcmVtb3ZlZEV2ZW50ID0gRXZlbnQudG9Qcm9taXNlKHNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9ucyk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbnRyaWVzKFtdKTtcblx0XHRhd2FpdCByZW1vdmVkRXZlbnQ7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jb25uZWN0aW9ucy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldENvbm5lY3Rpb24oJ3dzOi8vaG9zdDE6ODA4MCcpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJlcyBvbkRpZENoYW5nZUNvbm5lY3Rpb25zIHdoZW4gY29ubmVjdGlvbiBjbG9zZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbnRyaWVzKFt7IG5hbWU6ICdIb3N0IDEnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICd3czovL2hvc3QxOjgwODAnIH0gfV0pO1xuXHRcdGNyZWF0ZWRDbGllbnRzWzBdLmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25uZWN0ZWQoKTtcblxuXHRcdC8vIFNpbXVsYXRlIGNvbm5lY3Rpb24gY2xvc2UgXHUyMDE0IGVudHJ5IHRyYW5zaXRpb25zIHRvIERpc2Nvbm5lY3RlZFxuXHRcdGNvbnN0IGNsb3NlZEV2ZW50ID0gRXZlbnQudG9Qcm9taXNlKHNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9ucyk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uZmlyZUNsb3NlKCk7XG5cdFx0YXdhaXQgY2xvc2VkRXZlbnQ7XG5cblx0XHQvLyBDb25uZWN0aW9uIGlzIHN0aWxsIHRyYWNrZWQgKGZvciByZWNvbm5lY3QpIGJ1dCBnZXRDb25uZWN0aW9uIHJldHVybnMgdW5kZWZpbmVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0Q29ubmVjdGlvbignd3M6Ly9ob3N0MTo4MDgwJyksIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgZW50cnkgPSBzZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoYyA9PiBjLmFkZHJlc3MgPT09ICdob3N0MTo4MDgwJyk7XG5cdFx0YXNzZXJ0Lm9rKGVudHJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuc3RhdHVzLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmRpc2Nvbm5lY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZXMgY29ubmVjdGlvbiBvbiBjb25uZWN0IGZhaWx1cmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbnRyaWVzKFt7IG5hbWU6ICdCYWQnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICd3czovL2JhZDo5OTk5JyB9IH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZENsaWVudHMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIEZhaWwgdGhlIGNvbm5lY3Rpb24gYW5kIHdhaXQgZm9yIHRoZSBzZXJ2aWNlIHRvIHJlYWN0XG5cdFx0Y29uc3QgY29ubmVjdGlvbkNoYW5nZWQgPSBFdmVudC50b1Byb21pc2Uoc2VydmljZS5vbkRpZENoYW5nZUNvbm5lY3Rpb25zKTtcblx0XHRjcmVhdGVkQ2xpZW50c1swXS5jb25uZWN0RGVmZXJyZWQuZXJyb3IobmV3IEVycm9yKCdDb25uZWN0aW9uIHJlZnVzZWQnKSk7XG5cdFx0YXdhaXQgY29ubmVjdGlvbkNoYW5nZWQ7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jb25uZWN0aW9ucy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldENvbm5lY3Rpb24oJ3dzOi8vYmFkOjk5OTknKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWFuYWdlcyBtdWx0aXBsZSBjb25uZWN0aW9ucyBpbmRlcGVuZGVudGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbXG5cdFx0XHR7IG5hbWU6ICdIb3N0IDEnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICd3czovL2hvc3QxOjgwODAnIH0gfSxcblx0XHRcdHsgbmFtZTogJ0hvc3QgMicsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDI6ODA4MCcgfSB9LFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRDbGllbnRzLmxlbmd0aCwgMik7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMV0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbm5lY3RlZCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cykpLmxlbmd0aCwgMik7XG5cblx0XHRjb25zdCBjb25uMSA9IHNlcnZpY2UuZ2V0Q29ubmVjdGlvbignd3M6Ly9ob3N0MTo4MDgwJyk7XG5cdFx0Y29uc3QgY29ubjIgPSBzZXJ2aWNlLmdldENvbm5lY3Rpb24oJ3dzOi8vaG9zdDI6ODA4MCcpO1xuXHRcdGFzc2VydC5vayhjb25uMSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbm4yKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoY29ubjEuY2xpZW50SWQsIGNvbm4yLmNsaWVudElkKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmUtY3JlYXRlIGV4aXN0aW5nIGNvbm5lY3Rpb25zIG9uIHNldHRpbmcgdXBkYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbeyBuYW1lOiAnSG9zdCAxJywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnd3M6Ly9ob3N0MTo4MDgwJyB9IH1dKTtcblx0XHRjcmVhdGVkQ2xpZW50c1swXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29ubmVjdGVkKCk7XG5cblx0XHRjb25zdCBmaXJzdENsaWVudElkID0gY3JlYXRlZENsaWVudHNbMF0uY2xpZW50SWQ7XG5cblx0XHQvLyBVcGRhdGUgc2V0dGluZyB3aXRoIHNhbWUgYWRkcmVzcyAoYnV0IGRpZmZlcmVudCBuYW1lKVxuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbeyBuYW1lOiAnUmVuYW1lZCcsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDE6ODA4MCcgfSB9XSk7XG5cblx0XHQvLyBTaG91bGQgTk9UIGhhdmUgY3JlYXRlZCBhIHNlY29uZCBjbGllbnRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZENsaWVudHMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIENvbm5lY3Rpb24gc2hvdWxkIHN0aWxsIHdvcmsgd2l0aCBzYW1lIGNsaWVudFxuXHRcdGNvbnN0IGNvbm4gPSBzZXJ2aWNlLmdldENvbm5lY3Rpb24oJ3dzOi8vaG9zdDE6ODA4MCcpO1xuXHRcdGFzc2VydC5vayhjb25uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubi5jbGllbnRJZCwgZmlyc3RDbGllbnRJZCk7XG5cblx0XHQvLyBCdXQgbmFtZSBzaG91bGQgYmUgdXBkYXRlZFxuXHRcdGNvbnN0IGVudHJ5ID0gc2VydmljZS5jb25uZWN0aW9ucy5maW5kKGMgPT4gYy5hZGRyZXNzID09PSAnaG9zdDE6ODA4MCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeT8ubmFtZSwgJ1JlbmFtZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkUmVtb3RlQWdlbnRIb3N0IHN0b3JlcyB0aGUgZW50cnkgYW5kIHdhaXRzIGZvciBjb25uZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb25Qcm9taXNlID0gc2VydmljZS5hZGRSZW1vdGVBZ2VudEhvc3Qoe1xuXHRcdFx0bmFtZTogJ0hvc3QgMScsXG5cdFx0XHRjb25uZWN0aW9uVG9rZW46ICdzZWNyZXQtdG9rZW4nLFxuXHRcdFx0Y29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnd3M6Ly9ob3N0MTo4MDgwJyB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWdTZXJ2aWNlLmVudHJpZXMsIFt7XG5cdFx0XHRhZGRyZXNzOiAnaG9zdDE6ODA4MCcsXG5cdFx0XHRuYW1lOiAnSG9zdCAxJyxcblx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogJ3NlY3JldC10b2tlbicsXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkQ2xpZW50cy5sZW5ndGgsIDEpO1xuXG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IGNvbm5lY3Rpb25Qcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25uZWN0aW9uLCB7XG5cdFx0XHRhZGRyZXNzOiAnaG9zdDE6ODA4MCcsXG5cdFx0XHRuYW1lOiAnSG9zdCAxJyxcblx0XHRcdGNsaWVudElkOiBjcmVhdGVkQ2xpZW50c1swXS5jbGllbnRJZCxcblx0XHRcdGRlZmF1bHREaXJlY3Rvcnk6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXR1czogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZFJlbW90ZUFnZW50SG9zdCB1cGRhdGVzIGV4aXN0aW5nIGNvbmZpZ3VyZWQgZW50cmllcyB3aXRob3V0IHJlY29ubmVjdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW3sgbmFtZTogJ0hvc3QgMScsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDE6ODA4MCcgfSB9XSk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbm5lY3RlZCgpO1xuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHNlcnZpY2UuYWRkUmVtb3RlQWdlbnRIb3N0KHtcblx0XHRcdG5hbWU6ICdVcGRhdGVkIEhvc3QnLFxuXHRcdFx0Y29ubmVjdGlvblRva2VuOiAnbmV3LXRva2VuJyxcblx0XHRcdGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDE6ODA4MCcgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkQ2xpZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlnU2VydmljZS5lbnRyaWVzLCBbe1xuXHRcdFx0YWRkcmVzczogJ2hvc3QxOjgwODAnLFxuXHRcdFx0bmFtZTogJ1VwZGF0ZWQgSG9zdCcsXG5cdFx0XHRjb25uZWN0aW9uVG9rZW46ICduZXctdG9rZW4nLFxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbm5lY3Rpb24sIHtcblx0XHRcdGFkZHJlc3M6ICdob3N0MTo4MDgwJyxcblx0XHRcdG5hbWU6ICdVcGRhdGVkIEhvc3QnLFxuXHRcdFx0Y2xpZW50SWQ6IGNyZWF0ZWRDbGllbnRzWzBdLmNsaWVudElkLFxuXHRcdFx0ZGVmYXVsdERpcmVjdG9yeTogdW5kZWZpbmVkLFxuXHRcdFx0c3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWRkUmVtb3RlQWdlbnRIb3N0IGFwcGVuZHMgd2hlbiBhZGRpbmcgYSBzZWNvbmQgaG9zdCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBBZGQgZmlyc3QgaG9zdFxuXHRcdGNvbnN0IGZpcnN0UHJvbWlzZSA9IHNlcnZpY2UuYWRkUmVtb3RlQWdlbnRIb3N0KHtcblx0XHRcdG5hbWU6ICdIb3N0IDEnLFxuXHRcdFx0Y29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnaG9zdDE6ODA4MCcgfSxcblx0XHR9KTtcblx0XHRjcmVhdGVkQ2xpZW50c1swXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCBmaXJzdFByb21pc2U7XG5cblx0XHQvLyBBZGQgc2Vjb25kIGhvc3Rcblx0XHRjb25zdCBzZWNvbmRQcm9taXNlID0gc2VydmljZS5hZGRSZW1vdGVBZ2VudEhvc3Qoe1xuXHRcdFx0bmFtZTogJ0hvc3QgMicsXG5cdFx0XHRjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICdob3N0Mjo5MDkwJyB9LFxuXHRcdH0pO1xuXHRcdGNyZWF0ZWRDbGllbnRzWzFdLmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHNlY29uZFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZENsaWVudHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ1NlcnZpY2UuZW50cmllcywgW1xuXHRcdFx0eyBhZGRyZXNzOiAnaG9zdDE6ODA4MCcsIG5hbWU6ICdIb3N0IDEnLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBhZGRyZXNzOiAnaG9zdDI6OTA5MCcsIG5hbWU6ICdIb3N0IDInLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNvbm5lY3Rpb25zLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZFJlbW90ZUFnZW50SG9zdCByZXNvbHZlcyB3aGVuIGNvbm5lY3Rpb24gY29tcGxldGVzIGJlZm9yZSB3YWl0IGlzIGNyZWF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGUgYSBmYXN0IGNvbm5lY3Q6IHRoZSBtb2NrIGNsaWVudCByZXNvbHZlcyBzeW5jaHJvbm91c2x5XG5cdFx0Ly8gZHVyaW5nIHRoZSBjb25maWcgY2hhbmdlIGhhbmRsZXIsIGJlZm9yZSBhZGRSZW1vdGVBZ2VudEhvc3QgaGFzIGFcblx0XHQvLyBjaGFuY2UgdG8gY3JlYXRlIGl0cyBEZWZlcnJlZFByb21pc2Ugd2FpdC5cblx0XHRjb25zdCBvcmlnaW5hbFVwZGF0ZVZhbHVlID0gY29uZmlnU2VydmljZS51cGRhdGVWYWx1ZS5iaW5kKGNvbmZpZ1NlcnZpY2UpO1xuXHRcdGNvbmZpZ1NlcnZpY2UudXBkYXRlVmFsdWUgPSBhc3luYyAoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKSA9PiB7XG5cdFx0XHRhd2FpdCBvcmlnaW5hbFVwZGF0ZVZhbHVlKGtleSwgdmFsdWUpO1xuXHRcdFx0Ly8gQ29tcGxldGUgdGhlIGNvbm5lY3Rpb24gc3luY2hyb25vdXNseSBpbnNpZGUgdGhlIGNvbmZpZyBjaGFuZ2UgY2FsbGJhY2tcblx0XHRcdGlmIChjcmVhdGVkQ2xpZW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNyZWF0ZWRDbGllbnRzW2NyZWF0ZWRDbGllbnRzLmxlbmd0aCAtIDFdLmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgc2VydmljZS5hZGRSZW1vdGVBZ2VudEhvc3Qoe1xuXHRcdFx0bmFtZTogJ0Zhc3QgSG9zdCcsXG5cdFx0XHRjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICdmYXN0LWhvc3Q6MTIzNCcgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLmFkZHJlc3MsICdmYXN0LWhvc3Q6MTIzNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLm5hbWUsICdGYXN0IEhvc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsaW5nIHRoZSBlbmFibGVkIHNldHRpbmcgZGlzY29ubmVjdHMgYWxsIHJlbW90ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbnRyaWVzKFt7IG5hbWU6ICdIb3N0IDEnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICdob3N0MTo4MDgwJyB9IH1dKTtcblx0XHRjcmVhdGVkQ2xpZW50c1swXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29ubmVjdGVkKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cykpLmxlbmd0aCwgMSk7XG5cblx0XHRjb25maWdTZXJ2aWNlLnNldEVuYWJsZWQoZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkUmVtb3RlQWdlbnRIb3N0IHRocm93cyB3aGVuIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW5hYmxlZChmYWxzZSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UuYWRkUmVtb3RlQWdlbnRIb3N0KHsgbmFtZTogJ0hvc3QgMScsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ2hvc3QxOjgwODAnIH0gfSksXG5cdFx0XHQvbm90IGVuYWJsZWQvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlLWVuYWJsaW5nIHJlY29ubmVjdHMgY29uZmlndXJlZCByZW1vdGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbeyBuYW1lOiAnSG9zdCAxJywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnaG9zdDE6ODA4MCcgfSB9XSk7XG5cdFx0Y3JlYXRlZENsaWVudHNbMF0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgd2FpdEZvckNvbm5lY3RlZCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbHRlcihjID0+IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQoYy5zdGF0dXMpKS5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbmFibGVkKGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jb25uZWN0aW9ucy5sZW5ndGgsIDApO1xuXG5cdFx0Y29uZmlnU2VydmljZS5zZXRFbmFibGVkKHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkQ2xpZW50cy5sZW5ndGgsIDIpOyAvLyBuZXcgY2xpZW50IGNyZWF0ZWRcblx0XHRjcmVhdGVkQ2xpZW50c1sxXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29ubmVjdGVkKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cykpLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZVJlbW90ZUFnZW50SG9zdCByZW1vdmVzIGVudHJ5IGFuZCBkaXNjb25uZWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW1xuXHRcdFx0eyBuYW1lOiAnSG9zdCAxJywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnd3M6Ly9ob3N0MTo4MDgwJyB9IH0sXG5cdFx0XHR7IG5hbWU6ICdIb3N0IDInLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICd3czovL2hvc3QyOjkwOTAnIH0gfSxcblx0XHRdKTtcblx0XHRjcmVhdGVkQ2xpZW50c1swXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRjcmVhdGVkQ2xpZW50c1sxXS5jb25uZWN0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCB3YWl0Rm9yQ29ubmVjdGVkKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cykpLmxlbmd0aCwgMik7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlbW92ZVJlbW90ZUFnZW50SG9zdCgnd3M6Ly9ob3N0MTo4MDgwJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ1NlcnZpY2UuZW50cmllcywgW1xuXHRcdFx0eyBhZGRyZXNzOiAnd3M6Ly9ob3N0Mjo5MDkwJywgbmFtZTogJ0hvc3QgMicsIGNvbm5lY3Rpb25Ub2tlbjogdW5kZWZpbmVkIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cykpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0Q29ubmVjdGlvbignd3M6Ly9ob3N0MTo4MDgwJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0Q29ubmVjdGlvbignd3M6Ly9ob3N0Mjo5MDkwJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVSZW1vdGVBZ2VudEhvc3Qgbm9ybWFsaXplcyBhZGRyZXNzIGJlZm9yZSByZW1vdmluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW3sgbmFtZTogJ0hvc3QgMScsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ2hvc3QxOjgwODAnIH0gfV0pO1xuXHRcdGNyZWF0ZWRDbGllbnRzWzBdLmNvbm5lY3REZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JDb25uZWN0ZWQoKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVtb3ZlUmVtb3RlQWdlbnRIb3N0KCd3czovL2hvc3QxOjgwODAnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlnU2VydmljZS5lbnRyaWVzLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY29ubmVjdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0c3VpdGUoJ2FkZE1hbmFnZWRDb25uZWN0aW9uJywgKCkgPT4ge1xuXG5cdFx0Ly8gQnVpbGQgYSB0cmFuc3BvcnQgZGlzcG9zYWJsZSB0aGF0IHJlY29yZHMgd2hlbiBpdCByYW4uXG5cdFx0ZnVuY3Rpb24gbWFrZVRyYW5zcG9ydERpc3Bvc2FibGUoKTogeyBkaXNwb3NhYmxlOiB7IGRpc3Bvc2UoKTogdm9pZCB9OyBkaXNwb3NlZDogKCkgPT4gYm9vbGVhbiB9IHtcblx0XHRcdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcG9zYWJsZTogeyBkaXNwb3NlOiAoKSA9PiB7IGRpc3Bvc2VkID0gdHJ1ZTsgfSB9LFxuXHRcdFx0XHRkaXNwb3NlZDogKCkgPT4gZGlzcG9zZWQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEluamVjdCBhIG1hbmFnZWQgY29ubmVjdGlvbiAobWltaWNraW5nIHRoZSBTU0gvdHVubmVsIHJlbmRlcmVyIGZsb3cpLlxuXHRcdGFzeW5jIGZ1bmN0aW9uIGFkZE1hbmFnZWQobmFtZTogc3RyaW5nLCBhZGRyZXNzOiBzdHJpbmcsIHRyYW5zcG9ydD86IHsgZGlzcG9zZSgpOiB2b2lkIH0pIHtcblx0XHRcdGNvbnN0IG1vY2tDbGllbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tQcm90b2NvbENsaWVudChgd3M6Ly8ke2FkZHJlc3N9YCkpO1xuXHRcdFx0cmV0dXJuIHNlcnZpY2UuYWRkTWFuYWdlZENvbm5lY3Rpb24oXG5cdFx0XHRcdHsgbmFtZSwgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzIH0gfSxcblx0XHRcdFx0bW9ja0NsaWVudCBhcyB1bmtub3duIGFzIFBhcmFtZXRlcnM8dHlwZW9mIHNlcnZpY2UuYWRkTWFuYWdlZENvbm5lY3Rpb24+WzFdLFxuXHRcdFx0XHR0cmFuc3BvcnQsXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2tlZXBzIGluY29tcGF0aWJsZSBtYW5hZ2VkIGNvbm5lY3Rpb24gYWRkcmVzc2FibGUgZm9yIHNlcnZlciB1cGdyYWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0NsaWVudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1Byb3RvY29sQ2xpZW50KCdzc2g6cmVtb3RlLmV4YW1wbGUnKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmFkZE1hbmFnZWRDb25uZWN0aW9uKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ1NTSCBIb3N0Jyxcblx0XHRcdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0XHRcdFx0YWRkcmVzczogJ3NzaDpyZW1vdGUuZXhhbXBsZScsXG5cdFx0XHRcdFx0XHRzc2hDb25maWdIb3N0OiAncmVtb3RlJyxcblx0XHRcdFx0XHRcdGhvc3ROYW1lOiAncmVtb3RlLmV4YW1wbGUnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1vY2tDbGllbnQgYXMgdW5rbm93biBhcyBQYXJhbWV0ZXJzPHR5cGVvZiBzZXJ2aWNlLmFkZE1hbmFnZWRDb25uZWN0aW9uPlsxXSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmluY29tcGF0aWJsZSgnVW5zdXBwb3J0ZWQgcHJvdG9jb2wgdmVyc2lvbicsIFsnMC4zLjAnXSwgWydeMC4yLjAnXSwgJ192c2NvZGVVcGdyYWRlJyksXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCB1cGdyYWRlUmVzdWx0ID0gYXdhaXQgc2VydmljZS50cmlnZ2VyU2VydmVyVXBncmFkZSgnc3NoOnJlbW90ZS5leGFtcGxlJywgJ192c2NvZGVVcGdyYWRlJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGF0dXM6IHNlcnZpY2UuY29ubmVjdGlvbnNbMF0uc3RhdHVzLFxuXHRcdFx0XHRjb25uZWN0ZWRDb25uZWN0aW9uOiBzZXJ2aWNlLmdldENvbm5lY3Rpb24oJ3NzaDpyZW1vdGUuZXhhbXBsZScpLFxuXHRcdFx0XHR1cGdyYWRlQ2FsbHM6IG1vY2tDbGllbnQudHJpZ2dlclZzY29kZVVwZ3JhZGVDYWxscyxcblx0XHRcdFx0dXBncmFkZVJlc3VsdCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmluY29tcGF0aWJsZSgnVW5zdXBwb3J0ZWQgcHJvdG9jb2wgdmVyc2lvbicsIFsnMC4zLjAnXSwgWydeMC4yLjAnXSwgJ192c2NvZGVVcGdyYWRlJyksXG5cdFx0XHRcdGNvbm5lY3RlZENvbm5lY3Rpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0dXBncmFkZUNhbGxzOiBbJ192c2NvZGVVcGdyYWRlJ10sXG5cdFx0XHRcdHVwZ3JhZGVSZXN1bHQ6IHsgb2s6IHRydWUsIHVwZ3JhZGVTdGFydGVkOiB0cnVlIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2VzIHRyYW5zcG9ydERpc3Bvc2FibGUgd2hlbiBlbnRyeSBpcyByZW1vdmVkIHZpYSByZW1vdmVSZW1vdGVBZ2VudEhvc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ID0gbWFrZVRyYW5zcG9ydERpc3Bvc2FibGUoKTtcblx0XHRcdGF3YWl0IGFkZE1hbmFnZWQoJ01hbmFnZWQnLCAnbWFuYWdlZDoxMjM0JywgdC5kaXNwb3NhYmxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0LmRpc3Bvc2VkKCksIGZhbHNlKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5yZW1vdmVSZW1vdGVBZ2VudEhvc3QoJ3dzOi8vbWFuYWdlZDoxMjM0Jyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0LmRpc3Bvc2VkKCksIHRydWUsICd0cmFuc3BvcnQgZGlzcG9zYWJsZSBydW5zIHdoZW4gZW50cnkgaXMgcmVtb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0Q29ubmVjdGlvbignd3M6Ly9tYW5hZ2VkOjEyMzQnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyB3aGVuIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRFbmFibGVkKGZhbHNlKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IGFkZE1hbmFnZWQoJ01hbmFnZWQnLCAnbWFuYWdlZDoxMjM0JyksXG5cdFx0XHRcdC9ub3QgZW5hYmxlZC8sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBOT1QgZGlzcG9zZSBwcmV2aW91cyB0cmFuc3BvcnREaXNwb3NhYmxlIHdoZW4gZW50cnkgaXMgcmVwbGFjZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBXaGVuIHRoZSBlbnRyeSBpcyByZXBsYWNlZCAoZS5nLiBvbiByZWNvbm5lY3QgdG8gdGhlIHNhbWUgYWRkcmVzcyksXG5cdFx0XHQvLyB0aGUgbmV3IGVudHJ5IHRha2VzIG93bmVyc2hpcCBvZiB0aGUgc2FtZSB1bmRlcmx5aW5nIGNvbm5lY3Rpb25JZC5cblx0XHRcdC8vIFJ1bm5pbmcgdGhlIG9sZCB0cmFuc3BvcnREaXNwb3NhYmxlIHdvdWxkIGNhbGwgZGlzY29ubmVjdCgpIG9uIHRoZVxuXHRcdFx0Ly8gc2hhcmVkLXByb2Nlc3MgdHVubmVsIGtleWVkIGJ5IHRoYXQgY29ubmVjdGlvbklkIGFuZCBpbW1lZGlhdGVseVxuXHRcdFx0Ly8gdGVhciBkb3duIHRoZSBicmFuZC1uZXcgY29ubmVjdGlvbi4gVGhlIG5ldyB0cmFuc3BvcnREaXNwb3NhYmxlXG5cdFx0XHQvLyBpbmhlcml0cyByZXNwb25zaWJpbGl0eSBmb3IgdGhlIHVuZGVybHlpbmcgdHVubmVsLlxuXHRcdFx0Y29uc3QgdDEgPSBtYWtlVHJhbnNwb3J0RGlzcG9zYWJsZSgpO1xuXHRcdFx0YXdhaXQgYWRkTWFuYWdlZCgnTWFuYWdlZCcsICdtYW5hZ2VkOjEyMzQnLCB0MS5kaXNwb3NhYmxlKTtcblxuXHRcdFx0Y29uc3QgdDIgPSBtYWtlVHJhbnNwb3J0RGlzcG9zYWJsZSgpO1xuXHRcdFx0YXdhaXQgYWRkTWFuYWdlZCgnTWFuYWdlZCcsICdtYW5hZ2VkOjEyMzQnLCB0Mi5kaXNwb3NhYmxlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHQxLmRpc3Bvc2VkKCksIGZhbHNlLCAncHJldmlvdXMgdHJhbnNwb3J0IGRpc3Bvc2FibGUgaXMgbm90IHJ1biBvbiByZXBsYWNlbWVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHQyLmRpc3Bvc2VkKCksIGZhbHNlLCAnbmV3IHRyYW5zcG9ydCBkaXNwb3NhYmxlIGlzIHN0aWxsIGFsaXZlJyk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UucmVtb3ZlUmVtb3RlQWdlbnRIb3N0KCd3czovL21hbmFnZWQ6MTIzNCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodDIuZGlzcG9zZWQoKSwgdHJ1ZSwgJ25ldyB0cmFuc3BvcnQgZGlzcG9zYWJsZSBydW5zIG9uIGZ1bGwgcmVtb3ZhbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zZXMgdHJhbnNwb3J0RGlzcG9zYWJsZSB3aGVuIHNlcnZpY2UgaXRzZWxmIGlzIGRpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IG1ha2VUcmFuc3BvcnREaXNwb3NhYmxlKCk7XG5cdFx0XHRhd2FpdCBhZGRNYW5hZ2VkKCdNYW5hZ2VkJywgJ21hbmFnZWQ6MTIzNCcsIHQuZGlzcG9zYWJsZSk7XG5cblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodC5kaXNwb3NlZCgpLCB0cnVlLCAndHJhbnNwb3J0IGRpc3Bvc2FibGUgcnVucyB3aGVuIHNlcnZpY2UgaXMgZGlzcG9zZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0b3JlcyBTU0ggY29ubmVjdGlvbiBkZXRhaWxzIG91dHNpZGUgdGhlIHJlbW90ZSBob3N0cyBzZXR0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0NsaWVudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1Byb3RvY29sQ2xpZW50KCdzc2g6cmVtb3RlLmV4YW1wbGUnKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmFkZE1hbmFnZWRDb25uZWN0aW9uKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ1NTSCBIb3N0Jyxcblx0XHRcdFx0XHRjb25uZWN0aW9uVG9rZW46ICdzc2gtdG9rZW4nLFxuXHRcdFx0XHRcdGNvbm5lY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gsXG5cdFx0XHRcdFx0XHRhZGRyZXNzOiAnc3NoOnJlbW90ZS5leGFtcGxlJyxcblx0XHRcdFx0XHRcdHNzaENvbmZpZ0hvc3Q6ICdyZW1vdGUnLFxuXHRcdFx0XHRcdFx0aG9zdE5hbWU6ICdyZW1vdGUuZXhhbXBsZScsXG5cdFx0XHRcdFx0XHR1c2VyOiAnbWUnLFxuXHRcdFx0XHRcdFx0cG9ydDogMjIyMixcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtb2NrQ2xpZW50IGFzIHVua25vd24gYXMgUGFyYW1ldGVyczx0eXBlb2Ygc2VydmljZS5hZGRNYW5hZ2VkQ29ubmVjdGlvbj5bMV0sXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c2V0dGluZ3M6IGNvbmZpZ1NlcnZpY2UuZW50cmllcyxcblx0XHRcdFx0Y29uZmlndXJlZDogc2VydmljZS5jb25maWd1cmVkRW50cmllcyxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2V0dGluZ3M6IFtdLFxuXHRcdFx0XHRjb25maWd1cmVkOiBbe1xuXHRcdFx0XHRcdG5hbWU6ICdTU0ggSG9zdCcsXG5cdFx0XHRcdFx0Y29ubmVjdGlvblRva2VuOiAnc3NoLXRva2VuJyxcblx0XHRcdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0XHRcdFx0YWRkcmVzczogJ3NzaDpyZW1vdGUuZXhhbXBsZScsXG5cdFx0XHRcdFx0XHRzc2hDb25maWdIb3N0OiAncmVtb3RlJyxcblx0XHRcdFx0XHRcdGhvc3ROYW1lOiAncmVtb3RlLmV4YW1wbGUnLFxuXHRcdFx0XHRcdFx0dXNlcjogJ21lJyxcblx0XHRcdFx0XHRcdHBvcnQ6IDIyMjIsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHBlcnNpc3QgcnVudGltZSBtYW5hZ2VkIGNvbm5lY3Rpb25zIG9yIHRoZWlyIHJlbW92YWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnRyaWVzOiBJUmVtb3RlQWdlbnRIb3N0RW50cnlbXSA9IFtcblx0XHRcdFx0eyBuYW1lOiAnVHVubmVsJywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuVHVubmVsLCB0dW5uZWxJZDogJ3J1bnRpbWUtdHVubmVsJywgY2x1c3RlcklkOiAnY2x1c3RlcicgfSB9LFxuXHRcdFx0XHR7IG5hbWU6ICdXU0wnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XU0wsIGFkZHJlc3M6ICd3c2w6cnVudGltZScsIGRpc3RybzogJ3J1bnRpbWUnIH0gfSxcblx0XHRcdFx0eyBuYW1lOiAnQ2xvdWQgU2FuZGJveCcsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLkNsb3VkU2FuZGJveCwgYWRkcmVzczogJ2Nsb3VkOnJ1bnRpbWUnLCBlbnZpcm9ubWVudElkOiAnZW52X3J1bnRpbWUnIH0gfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhZGRyZXNzZXMgPSBbJ3R1bm5lbDpydW50aW1lLXR1bm5lbCcsICd3c2w6cnVudGltZScsICdjbG91ZDpydW50aW1lJ107XG5cblx0XHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBlbnRyaWVzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tQcm90b2NvbENsaWVudChhZGRyZXNzZXNbaW5kZXhdKSk7XG5cdFx0XHRcdGF3YWl0IHNlcnZpY2UuYWRkTWFuYWdlZENvbm5lY3Rpb24oZW50cmllc1tpbmRleF0sIGNsaWVudCBhcyB1bmtub3duIGFzIFBhcmFtZXRlcnM8dHlwZW9mIHNlcnZpY2UuYWRkTWFuYWdlZENvbm5lY3Rpb24+WzFdKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgYWRkcmVzcyBvZiBhZGRyZXNzZXMpIHtcblx0XHRcdFx0YXdhaXQgc2VydmljZS5yZW1vdmVSZW1vdGVBZ2VudEhvc3QoYWRkcmVzcyk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXR0aW5nc1dyaXRlczogY29uZmlnU2VydmljZS51cGRhdGVWYWx1ZUNhbGxzLFxuXHRcdFx0XHRzdG9yYWdlV3JpdGVzOiBzdG9yYWdlU2VydmljZS53cml0ZUNhbGxzLFxuXHRcdFx0XHRzZXR0aW5nczogY29uZmlnU2VydmljZS5lbnRyaWVzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZXR0aW5nc1dyaXRlczogMCxcblx0XHRcdFx0c3RvcmFnZVdyaXRlczogMCxcblx0XHRcdFx0c2V0dGluZ3M6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyBhIHJlZ2lzdGVyZWQgdHVubmVsIGNvbm5lY3RlZCB3aGVuIFdlYlNvY2tldCBzZXR0aW5ncyBjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dW5uZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tQcm90b2NvbENsaWVudCgndHVubmVsOmxpdmUnKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmFkZE1hbmFnZWRDb25uZWN0aW9uKFxuXHRcdFx0XHR7IG5hbWU6ICdUdW5uZWwnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5UdW5uZWwsIHR1bm5lbElkOiAnbGl2ZScsIGNsdXN0ZXJJZDogJ2NsdXN0ZXInIH0gfSxcblx0XHRcdFx0dHVubmVsIGFzIHVua25vd24gYXMgUGFyYW1ldGVyczx0eXBlb2Ygc2VydmljZS5hZGRNYW5hZ2VkQ29ubmVjdGlvbj5bMV0sXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW3sgbmFtZTogJ1dlYlNvY2tldCcsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDo4MDgwJyB9IH1dKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0Q29ubmVjdGlvbigndHVubmVsOmxpdmUnKSwgdHVubmVsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21pZ3JhdGVzIGxlZ2FjeSBTU0ggY29ubmVjdGlvbiBkZXRhaWxzIGZyb20gc2V0dGluZ3MgdG8gc3RvcmFnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRSYXdFbnRyaWVzKFt7XG5cdFx0XHRcdGFkZHJlc3M6ICdzc2g6bGVnYWN5Jyxcblx0XHRcdFx0bmFtZTogJ0xlZ2FjeSBTU0ggSG9zdCcsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogJ3NzaC10b2tlbicsXG5cdFx0XHRcdHNzaENvbmZpZ0hvc3Q6ICdsZWdhY3knLFxuXHRcdFx0XHRzc2hIb3N0TmFtZTogJ2xlZ2FjeS5leGFtcGxlJyxcblx0XHRcdFx0c3NoVXNlcjogJ21lJyxcblx0XHRcdFx0c3NoUG9ydDogMjIyMixcblx0XHRcdH1dKTtcblxuXHRcdFx0c2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXR0aW5nczogY29uZmlnU2VydmljZS5lbnRyaWVzLFxuXHRcdFx0XHRjb25maWd1cmVkOiBzZXJ2aWNlLmNvbmZpZ3VyZWRFbnRyaWVzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZXR0aW5nczogW10sXG5cdFx0XHRcdGNvbmZpZ3VyZWQ6IFt7XG5cdFx0XHRcdFx0bmFtZTogJ0xlZ2FjeSBTU0ggSG9zdCcsXG5cdFx0XHRcdFx0Y29ubmVjdGlvblRva2VuOiAnc3NoLXRva2VuJyxcblx0XHRcdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0XHRcdFx0YWRkcmVzczogJ3NzaDpsZWdhY3knLFxuXHRcdFx0XHRcdFx0c3NoQ29uZmlnSG9zdDogJ2xlZ2FjeScsXG5cdFx0XHRcdFx0XHRob3N0TmFtZTogJ2xlZ2FjeS5leGFtcGxlJyxcblx0XHRcdFx0XHRcdHVzZXI6ICdtZScsXG5cdFx0XHRcdFx0XHRwb3J0OiAyMjIyLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSk7XG5cblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXR0aW5nczogY29uZmlnU2VydmljZS5lbnRyaWVzLFxuXHRcdFx0XHRjb25maWd1cmVkOiBzZXJ2aWNlLmNvbmZpZ3VyZWRFbnRyaWVzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZXR0aW5nczogW10sXG5cdFx0XHRcdGNvbmZpZ3VyZWQ6IFt7XG5cdFx0XHRcdFx0bmFtZTogJ0xlZ2FjeSBTU0ggSG9zdCcsXG5cdFx0XHRcdFx0Y29ubmVjdGlvblRva2VuOiAnc3NoLXRva2VuJyxcblx0XHRcdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0XHRcdFx0YWRkcmVzczogJ3NzaDpsZWdhY3knLFxuXHRcdFx0XHRcdFx0c3NoQ29uZmlnSG9zdDogJ2xlZ2FjeScsXG5cdFx0XHRcdFx0XHRob3N0TmFtZTogJ2xlZ2FjeS5leGFtcGxlJyxcblx0XHRcdFx0XHRcdHVzZXI6ICdtZScsXG5cdFx0XHRcdFx0XHRwb3J0OiAyMjIyLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaXJlcyBjaGFuZ2Ugd2hlbiByZW1vdmluZyBhIHN0b3JhZ2Utb25seSBTU0ggZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0UmF3RW50cmllcyhbe1xuXHRcdFx0XHRhZGRyZXNzOiAnc3NoOmxlZ2FjeScsXG5cdFx0XHRcdG5hbWU6ICdMZWdhY3kgU1NIIEhvc3QnLFxuXHRcdFx0XHRzc2hDb25maWdIb3N0OiAnbGVnYWN5Jyxcblx0XHRcdFx0c3NoSG9zdE5hbWU6ICdsZWdhY3kuZXhhbXBsZScsXG5cdFx0XHR9XSk7XG5cdFx0XHRzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZUFnZW50SG9zdFNlcnZpY2UpKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IEV2ZW50LnRvUHJvbWlzZShzZXJ2aWNlLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbnMpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5yZW1vdmVSZW1vdGVBZ2VudEhvc3QoJ3NzaDpsZWdhY3knKTtcblx0XHRcdGF3YWl0IGNoYW5nZWQ7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXR0aW5nczogY29uZmlnU2VydmljZS5lbnRyaWVzLFxuXHRcdFx0XHRjb25maWd1cmVkOiBzZXJ2aWNlLmNvbmZpZ3VyZWRFbnRyaWVzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZXR0aW5nczogW10sXG5cdFx0XHRcdGNvbmZpZ3VyZWQ6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXBsYWNpbmcgYSBzdG9yZWQgU1NIIGVudHJ5IHdpdGggYSBXZWJTb2NrZXQgZW50cnkgY2xlYXJzIHRoZSBzdG9yYWdlIHJvdycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRSYXdFbnRyaWVzKFt7XG5cdFx0XHRcdGFkZHJlc3M6ICdob3N0MTo4MDgwJyxcblx0XHRcdFx0bmFtZTogJ1NTSCBIb3N0Jyxcblx0XHRcdFx0c3NoQ29uZmlnSG9zdDogJ2xlZ2FjeScsXG5cdFx0XHRcdHNzaEhvc3ROYW1lOiAnbGVnYWN5LmV4YW1wbGUnLFxuXHRcdFx0fV0pO1xuXHRcdFx0c2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKSk7XG5cblx0XHRcdGNvbnN0IGFkZGVkID0gc2VydmljZS5hZGRSZW1vdGVBZ2VudEhvc3QoeyBuYW1lOiAnV2ViU29ja2V0IEhvc3QnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICdob3N0MTo4MDgwJyB9IH0pO1xuXHRcdFx0Y3JlYXRlZENsaWVudHNbY3JlYXRlZENsaWVudHMubGVuZ3RoIC0gMV0uY29ubmVjdERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRhd2FpdCBhZGRlZDtcblxuXHRcdFx0Ly8gVGhlIHN0YWxlIFNTSCByb3cgbXVzdCBub3Qgc3Vydml2ZSBpbiBzdG9yYWdlLCBvciBfZ2V0Q29uZmlndXJlZEVudHJpZXNcblx0XHRcdC8vIG92ZXJsYXlzIGl0IGJhY2sgb24gdG9wIG9mIHRoZSBuZXcgV2ViU29ja2V0IGVudHJ5LlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmNvbmZpZ3VyZWRFbnRyaWVzLCBbe1xuXHRcdFx0XHRuYW1lOiAnV2ViU29ja2V0IEhvc3QnLFxuXHRcdFx0XHRjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnaG9zdDE6ODA4MCcgfSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIHJ1bnRpbWUgY29ubmVjdGlvbiBuYW1lcyBhY3Jvc3MgcmVjb25jaWxpYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dW5uZWw6IElSZW1vdGVBZ2VudEhvc3RFbnRyeSA9IHsgbmFtZTogJ015IFR1bm5lbCcsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlR1bm5lbCwgdHVubmVsSWQ6ICd0dW5uZWwnLCBjbHVzdGVySWQ6ICdjbHVzdGVyJyB9IH07XG5cdFx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tQcm90b2NvbENsaWVudCgndHVubmVsOnR1bm5lbCcpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuYWRkTWFuYWdlZENvbm5lY3Rpb24odHVubmVsLCBjbGllbnQgYXMgdW5rbm93biBhcyBQYXJhbWV0ZXJzPHR5cGVvZiBzZXJ2aWNlLmFkZE1hbmFnZWRDb25uZWN0aW9uPlsxXSk7XG5cblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbeyBuYW1lOiAnV2ViU29ja2V0JywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnaG9zdDE6ODA4MCcgfSB9XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNlcnZpY2UuY29ubmVjdGlvbnMuZmluZChjb25uZWN0aW9uID0+IGNvbm5lY3Rpb24uYWRkcmVzcyA9PT0gJ3R1bm5lbDp0dW5uZWwnKT8ubmFtZSxcblx0XHRcdFx0J015IFR1bm5lbCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaG9zdCBsYWJlbCBmb3JtYXR0ZXInLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBmb3JtYXR0ZXJGb3IoYWRkcmVzczogc3RyaW5nKTogUmVzb3VyY2VMYWJlbEZvcm1hdHRlciB8IHVuZGVmaW5lZCB7XG5cdFx0XHRjb25zdCBhdXRob3JpdHkgPSBhZ2VudEhvc3RBdXRob3JpdHkoYWRkcmVzcyk7XG5cdFx0XHRyZXR1cm4gcmVnaXN0ZXJlZEZvcm1hdHRlcnMuZmluZChmID0+IGYuc2NoZW1lID09PSBBR0VOVF9IT1NUX1NDSEVNRSAmJiBmLmF1dGhvcml0eSA9PT0gYXV0aG9yaXR5KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdyZWdpc3RlcnMgZm9ybWF0dGVyIHdoZW4gYW4gZW50cnkgaXMgYWRkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW3sgbmFtZTogJ0hvc3QgMScsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDE6ODA4MCcgfSB9XSk7XG5cblx0XHRcdGNvbnN0IGZvcm1hdHRlciA9IGZvcm1hdHRlckZvcignaG9zdDE6ODA4MCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZvcm1hdHRlciwgJ2Zvcm1hdHRlciBpcyByZWdpc3RlcmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0dGVyLmZvcm1hdHRpbmcud29ya3NwYWNlU3VmZml4LCAnSG9zdCAxJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWZyZXNoZXMgZm9ybWF0dGVyIHdoZW4gYW4gZW50cnkgbmFtZSBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRFbnRyaWVzKFt7IG5hbWU6ICdIb3N0IDEnLCBjb25uZWN0aW9uOiB7IHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsIGFkZHJlc3M6ICd3czovL2hvc3QxOjgwODAnIH0gfV0pO1xuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRFbnRyaWVzKFt7IG5hbWU6ICdSZW5hbWVkJywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnd3M6Ly9ob3N0MTo4MDgwJyB9IH1dKTtcblxuXHRcdFx0Y29uc3QgbWF0Y2hpbmcgPSByZWdpc3RlcmVkRm9ybWF0dGVycy5maWx0ZXIoZiA9PiBmLmF1dGhvcml0eSA9PT0gYWdlbnRIb3N0QXV0aG9yaXR5KCdob3N0MTo4MDgwJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoaW5nLmxlbmd0aCwgMSwgJ29sZCBmb3JtYXR0ZXIgaXMgcmVwbGFjZWQsIG5vdCBkdXBsaWNhdGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hpbmdbMF0uZm9ybWF0dGluZy53b3Jrc3BhY2VTdWZmaXgsICdSZW5hbWVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVzIGZvcm1hdHRlciB3aGVuIGFuIGVudHJ5IGlzIHJlbW92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW3sgbmFtZTogJ0hvc3QgMScsIGNvbm5lY3Rpb246IHsgdHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCwgYWRkcmVzczogJ3dzOi8vaG9zdDE6ODA4MCcgfSB9XSk7XG5cdFx0XHRhc3NlcnQub2soZm9ybWF0dGVyRm9yKCdob3N0MTo4MDgwJykpO1xuXG5cdFx0XHRjb25maWdTZXJ2aWNlLnNldEVudHJpZXMoW10pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0dGVyRm9yKCdob3N0MTo4MDgwJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVzIGZvcm1hdHRlcnMgd2hlbiB0aGUgc2VydmljZSBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW50cmllcyhbeyBuYW1lOiAnSG9zdCAxJywgY29ubmVjdGlvbjogeyB0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuV2ViU29ja2V0LCBhZGRyZXNzOiAnd3M6Ly9ob3N0MTo4MDgwJyB9IH1dKTtcblx0XHRcdGFzc2VydC5vayhmb3JtYXR0ZXJGb3IoJ2hvc3QxOjgwODAnKSk7XG5cblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0RW5hYmxlZChmYWxzZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXR0ZXJGb3IoJ2hvc3QxOjgwODAnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2RDtBQUN0RSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFrRDtBQUMzRCxTQUFTLG9DQUFvQyw4QkFBOEI7QUFDM0UsU0FBUyxvQkFBb0IsMkJBQTJCLGlDQUFpQywwQkFBMEIsa0NBQWtDLGlDQUE0RjtBQUNqUCxTQUFTLG1CQUFtQiwwQkFBMEI7QUFDdEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0IsdUJBQW9EO0FBR3JGLFNBQVMsaUNBQWlDLHVDQUF1QztBQUlqRixNQUFNLHNCQUFzQixXQUFXO0FBQUEsRUFBdkM7QUFBQTtBQUNDLFNBQVMsWUFBWSxNQUFNO0FBQzNCLFNBQVMsVUFBVSxNQUFNO0FBQ3pCLFNBQVMsU0FBUyxNQUFNO0FBQ3hCLFNBQVMsU0FBUztBQUFBO0FBQUEsRUFDbEIsVUFBeUI7QUFBRSxXQUFPLFFBQVEsUUFBUTtBQUFBLEVBQUc7QUFBQSxFQUNyRCxPQUFnQjtBQUFFLFdBQU87QUFBQSxFQUFNO0FBQ2hDO0FBSUEsTUFBTSxzQkFBTixNQUFNLDRCQUEyQixXQUFXO0FBQUEsRUFpQjNDLFlBQTRCLGFBQXFCO0FBQ2hELFVBQU07QUFEcUI7QUFmNUIsU0FBUyxXQUFXLGVBQWUsb0JBQW1CLFNBQVM7QUFFL0QsU0FBaUIsY0FBYyxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDakUsU0FBUyxhQUFhLEtBQUssWUFBWTtBQUN2QyxTQUFTLGNBQWMsTUFBTTtBQUM3QixTQUFTLG9CQUFvQixNQUFNO0FBQ25DLFNBQVMsNkJBQTZCLE1BQU07QUFDNUMsU0FBUyx1QkFBdUIsTUFBTTtBQUN0QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDRCQUFzQyxDQUFDO0FBRWhELFNBQU8sa0JBQWtCLElBQUksZ0JBQXNCO0FBQUEsRUFJbkQ7QUFBQSxFQUVBLE1BQU0sVUFBeUI7QUFDOUIsV0FBTyxLQUFLLGdCQUFnQjtBQUFBLEVBQzdCO0FBQUEsRUFFQSxNQUFNLHFCQUFxQixRQUFnQjtBQUMxQyxTQUFLLDBCQUEwQixLQUFLLE1BQU07QUFDMUMsV0FBTyxFQUFFLElBQUksTUFBTSxnQkFBZ0IsS0FBSztBQUFBLEVBQ3pDO0FBQUEsRUFFQSxZQUFrQjtBQUNqQixTQUFLLFlBQVksS0FBSztBQUFBLEVBQ3ZCO0FBQ0Q7QUFqQ00sb0JBQ1UsVUFBVTtBQUQxQixJQUFNLHFCQUFOO0FBcUNBLE1BQU0seUJBQXlCO0FBQUEsRUFBL0I7QUFDQyxTQUFpQiw0QkFBNEIsSUFBSSxRQUE0QztBQUM3RixTQUFTLDJCQUEyQixLQUFLLDBCQUEwQjtBQUVuRSxTQUFRLFdBQXVDLENBQUM7QUFDaEQsU0FBUSxXQUFXO0FBQ25CLDRCQUFtQjtBQUFBO0FBQUEsRUFFbkIsU0FBUyxLQUF1QjtBQUMvQixRQUFJLFFBQVEsa0NBQWtDO0FBQzdDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxRQUFRLE1BQWM7QUFDckIsV0FBTztBQUFBLE1BQ04sV0FBVyxLQUFLO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLFlBQVksTUFBYyxPQUErQjtBQUM5RCxTQUFLO0FBQ0wsVUFBTSxVQUFXLFNBQW9ELENBQUM7QUFDdEUsVUFBTSxVQUFVLEtBQUssVUFBVSxLQUFLLFFBQVEsTUFBTSxLQUFLLFVBQVUsT0FBTztBQUN4RSxTQUFLLFdBQVc7QUFDaEIsUUFBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLElBQ0Q7QUFDQSxTQUFLLDBCQUEwQixLQUFLO0FBQUEsTUFDbkMsc0JBQXNCLENBQUMsUUFBZ0IsUUFBUSw2QkFBNkIsUUFBUTtBQUFBLElBQ3JGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxJQUFJLFVBQStDO0FBQ2xELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLFdBQVcsU0FBd0M7QUFDbEQsU0FBSyxXQUFXLFFBQVEsUUFBUSxXQUFTO0FBQ3hDLFlBQU0sU0FBUyxtQkFBbUIsTUFBTSxXQUFXLElBQUk7QUFDdkQsYUFBTyxPQUFPLFVBQVUsYUFBYSxDQUFDLE9BQU8sTUFBTyxPQUFPLE1BQU0sVUFBVSxDQUFDLElBQUksQ0FBQztBQUFBLElBQ2xGLENBQUM7QUFDRCxTQUFLLDBCQUEwQixLQUFLO0FBQUEsTUFDbkMsc0JBQXNCLENBQUMsUUFBZ0IsUUFBUSw2QkFBNkIsUUFBUTtBQUFBLElBQ3JGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxjQUFjLFNBQTJDO0FBQ3hELFNBQUssV0FBVztBQUNoQixTQUFLLDBCQUEwQixLQUFLO0FBQUEsTUFDbkMsc0JBQXNCLENBQUMsUUFBZ0IsUUFBUSw2QkFBNkIsUUFBUTtBQUFBLElBQ3JGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxXQUFXLFNBQXdCO0FBQ2xDLFNBQUssV0FBVztBQUNoQixTQUFLLDBCQUEwQixLQUFLO0FBQUEsTUFDbkMsc0JBQXNCLENBQUMsUUFBZ0IsUUFBUTtBQUFBLElBQ2hELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssMEJBQTBCLFFBQVE7QUFBQSxFQUN4QztBQUNEO0FBRUEsTUFBTSwyQkFBMkIsdUJBQXVCO0FBQUEsRUFBeEQ7QUFBQTtBQUNDLHNCQUFhO0FBQUE7QUFBQSxFQUVKLE1BQU0sS0FBYSxPQUFxQixPQUFxQixRQUF1QixXQUFXLE9BQWE7QUFDcEgsU0FBSztBQUNMLFVBQU0sTUFBTSxLQUFLLE9BQU8sT0FBTyxRQUFRLFFBQVE7QUFBQSxFQUNoRDtBQUFBLEVBRVMsT0FBTyxLQUFhLE9BQXFCLFdBQVcsT0FBYTtBQUN6RSxTQUFLO0FBQ0wsVUFBTSxPQUFPLEtBQUssT0FBTyxRQUFRO0FBQUEsRUFDbEM7QUFDRDtBQUVBLE1BQU0sMEJBQTBCLE1BQU07QUFFckMsUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxvQkFBZ0IsSUFBSSx5QkFBeUI7QUFDN0MsZ0JBQVksSUFBSSxhQUFhLE1BQU0sY0FBYyxRQUFRLENBQUMsQ0FBQztBQUUzRCxxQkFBaUIsQ0FBQztBQUNsQix5QkFBcUIsQ0FBQztBQUV0QiwyQkFBdUIsWUFBWSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDckUseUJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUMzRCx5QkFBcUIsS0FBSyxxQkFBcUIsRUFBRSxVQUFVLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBaUM7QUFDOUcseUJBQXFCLEtBQUssdUJBQXVCLGFBQStDO0FBQ2hHLHFCQUFpQixZQUFZLElBQUksSUFBSSxtQkFBbUIsQ0FBQztBQUN6RCx5QkFBcUIsS0FBSyxpQkFBaUIsY0FBYztBQUN6RCwyQkFBdUIsQ0FBQztBQUN4Qix5QkFBcUIsS0FBSyxlQUFlO0FBQUEsTUFDeEMsa0JBQWtCLFdBQW1DO0FBQ3BELDZCQUFxQixLQUFLLFNBQVM7QUFDbkMsZUFBTyxhQUFhLE1BQU07QUFDekIsZ0JBQU0sTUFBTSxxQkFBcUIsUUFBUSxTQUFTO0FBQ2xELGNBQUksT0FBTyxHQUFHO0FBQ2IsaUNBQXFCLE9BQU8sS0FBSyxDQUFDO0FBQUEsVUFDbkM7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUEyQjtBQU8zQixVQUFNLDJCQUEyRDtBQUFBLE1BQ2hFLGdCQUFnQixDQUFDLFNBQWtCLFNBQW9CO0FBQ3RELGNBQU0sV0FBWSxLQUEyQjtBQUM3QyxZQUFJLGFBQWEsNEJBQTRCO0FBQzVDLGlCQUFPLFlBQVksSUFBSSxJQUFJLGNBQWMsQ0FBQztBQUFBLFFBQzNDO0FBQ0EsY0FBTSxTQUFTLElBQUksbUJBQW1CLEtBQUssQ0FBQyxDQUFXO0FBQ3ZELDJCQUFtQixLQUFLLEtBQUssQ0FBQyxDQUErQjtBQUM3RCxvQkFBWSxJQUFJLE1BQU07QUFDdEIsdUJBQWUsS0FBSyxNQUFNO0FBQzFCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLHlCQUFxQixLQUFLLHVCQUF1Qix3QkFBMEQ7QUFFM0csY0FBVSxZQUFZLElBQUkscUJBQXFCLGVBQWUsc0JBQXNCLENBQUM7QUFBQSxFQUN0RixDQUFDO0FBRUQsT0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxVQUFNLFVBQW1DO0FBQUEsTUFDeEMsRUFBRSxNQUFNLGFBQWEsaUJBQWlCLFlBQVksWUFBWSxFQUFFLE1BQU0seUJBQXlCLFdBQVcsU0FBUyxpQkFBaUIsRUFBRTtBQUFBLE1BQ3RJLEVBQUUsTUFBTSxPQUFPLGlCQUFpQixhQUFhLFlBQVksRUFBRSxNQUFNLHlCQUF5QixLQUFLLFNBQVMsa0JBQWtCLGVBQWUsUUFBUSxVQUFVLGdCQUFnQixNQUFNLE1BQU0sTUFBTSxLQUFLLEVBQUU7QUFBQSxJQUNyTTtBQUVBLFdBQU8sZ0JBQWdCLFFBQVEsSUFBSSxXQUFTO0FBQzNDLFlBQU0sU0FBUyxtQkFBbUIsTUFBTSxXQUFXLElBQUk7QUFDdkQsYUFBTyxPQUFPLFFBQVMsT0FBTyxNQUFPLE9BQU8sTUFBTSxVQUFVLENBQUM7QUFBQSxJQUM5RCxDQUFDLEdBQUcsT0FBTztBQUFBLEVBQ1osQ0FBQztBQUVELFdBQVMsTUFBTSxZQUFZLE1BQU0sQ0FBQztBQUNsQywwQ0FBd0M7QUFHeEMsaUJBQWUsbUJBQWtDO0FBQ2hELFdBQU8sQ0FBQyxRQUFRLFlBQVksS0FBSyxPQUFLLGdDQUFnQyxZQUFZLEVBQUUsTUFBTSxDQUFDLEdBQUc7QUFDN0YsWUFBTSxNQUFNLFVBQVUsUUFBUSxzQkFBc0I7QUFBQSxJQUNyRDtBQUFBLEVBQ0Q7QUFFQSxPQUFLLG9EQUFvRCxNQUFNO0FBQzlELFdBQU8sZ0JBQWdCLFFBQVEsYUFBYSxDQUFDLENBQUM7QUFBQSxFQUMvQyxDQUFDO0FBRUQsT0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLDBCQUEwQixrQ0FBa0M7QUFBQSxNQUM1RCwwQkFBMEIsbURBQW1EO0FBQUEsTUFDN0UsMEJBQTBCLGdCQUFnQjtBQUFBLE1BQzFDLDBCQUEwQixxQkFBcUI7QUFBQSxNQUMvQywwQkFBMEIsK0RBQStEO0FBQUEsTUFDekYsMEJBQTBCLDhCQUE4QjtBQUFBLE1BQ3hELDBCQUEwQixPQUFPO0FBQUEsTUFDakMsMEJBQTBCLFlBQVk7QUFBQSxJQUN2QyxHQUFHO0FBQUEsTUFDRixFQUFFLFFBQVEsRUFBRSxTQUFTLGtCQUFrQixpQkFBaUIsUUFBVyxlQUFlLGlCQUFpQixFQUFFO0FBQUEsTUFDckcsRUFBRSxRQUFRLEVBQUUsU0FBUyxrQkFBa0IsaUJBQWlCLFFBQVcsZUFBZSxpQkFBaUIsRUFBRTtBQUFBLE1BQ3JHLEVBQUUsUUFBUSxFQUFFLFNBQVMsa0JBQWtCLGlCQUFpQixRQUFXLGVBQWUsaUJBQWlCLEVBQUU7QUFBQSxNQUNyRyxFQUFFLFFBQVEsRUFBRSxTQUFTLGtCQUFrQixpQkFBaUIsUUFBVyxlQUFlLGlCQUFpQixFQUFFO0FBQUEsTUFDckcsRUFBRSxRQUFRLEVBQUUsU0FBUyxtQkFBbUIsaUJBQWlCLHdDQUF3QyxlQUFlLGtCQUFrQixFQUFFO0FBQUEsTUFDcEksRUFBRSxRQUFRLEVBQUUsU0FBUyw0QkFBNEIsaUJBQWlCLFFBQVcsZUFBZSxxQkFBcUIsRUFBRTtBQUFBLE1BQ25ILEVBQUUsUUFBUSxFQUFFLFNBQVMsU0FBUyxpQkFBaUIsUUFBVyxlQUFlLFFBQVEsRUFBRTtBQUFBLE1BQ25GLEVBQUUsUUFBUSxFQUFFLFNBQVMsU0FBUyxpQkFBaUIsUUFBVyxlQUFlLFFBQVEsRUFBRTtBQUFBLElBQ3BGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFdBQU8sWUFBWSxRQUFRLGNBQWMsbUJBQW1CLEdBQUcsTUFBUztBQUFBLEVBQ3pFLENBQUM7QUFFRCxPQUFLLDhDQUE4QyxZQUFZO0FBQzlELGtCQUFjLFdBQVcsQ0FBQyxFQUFFLE1BQU0sVUFBVSxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGtCQUFrQixFQUFFLENBQUMsQ0FBQztBQUduSSxXQUFPLFlBQVksZUFBZSxRQUFRLENBQUM7QUFDM0MsbUJBQWUsQ0FBQyxFQUFFLGdCQUFnQixTQUFTO0FBQzNDLFVBQU0saUJBQWlCO0FBRXZCLFVBQU0sWUFBWSxRQUFRLFlBQVksT0FBTyxPQUFLLGdDQUFnQyxZQUFZLEVBQUUsTUFBTSxDQUFDO0FBQ3ZHLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsWUFBWSxVQUFVLElBQUksQ0FBQyxFQUFFLFNBQVMsS0FBSyxPQUFPLEVBQUUsU0FBUyxLQUFLLEVBQUU7QUFBQSxNQUNwRSxZQUFZO0FBQUEsSUFDYixHQUFHO0FBQUEsTUFDRixZQUFZLENBQUMsRUFBRSxTQUFTLGNBQWMsTUFBTSxTQUFTLENBQUM7QUFBQSxNQUN0RCxZQUFZLENBQUMsK0JBQStCO0FBQUEsSUFDN0MsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0RBQXdELFlBQVk7QUFDeEUsWUFBUSxRQUFRO0FBQ2hCLGNBQVUsWUFBWSxJQUFJLHFCQUFxQixlQUFlLGtDQUFrQyxDQUFDO0FBQ2pHLGtCQUFjLFdBQVcsQ0FBQyxFQUFFLE1BQU0sVUFBVSxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGtCQUFrQixFQUFFLENBQUMsQ0FBQztBQUNuSSxtQkFBZSxDQUFDLEVBQUUsZ0JBQWdCLFNBQVM7QUFDM0MsVUFBTSxpQkFBaUI7QUFFdkIsV0FBTyxnQkFBZ0Isb0JBQW9CLENBQUMsK0JBQStCLENBQUM7QUFBQSxFQUM3RSxDQUFDO0FBRUQsT0FBSyx5REFBeUQsWUFBWTtBQUN6RSxrQkFBYyxXQUFXLENBQUMsRUFBRSxNQUFNLFVBQVUsWUFBWSxFQUFFLE1BQU0seUJBQXlCLFdBQVcsU0FBUyxrQkFBa0IsRUFBRSxDQUFDLENBQUM7QUFDbkksbUJBQWUsQ0FBQyxFQUFFLGdCQUFnQixTQUFTO0FBQzNDLFVBQU0saUJBQWlCO0FBRXZCLFVBQU0sYUFBYSxRQUFRLGNBQWMsaUJBQWlCO0FBQzFELFdBQU8sR0FBRyxVQUFVO0FBQ3BCLFdBQU8sWUFBWSxXQUFXLFVBQVUsZUFBZSxDQUFDLEVBQUUsUUFBUTtBQUFBLEVBQ25FLENBQUM7QUFFRCxPQUFLLG9EQUFvRCxZQUFZO0FBRXBFLGtCQUFjLFdBQVcsQ0FBQyxFQUFFLE1BQU0sVUFBVSxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGtCQUFrQixFQUFFLENBQUMsQ0FBQztBQUNuSSxtQkFBZSxDQUFDLEVBQUUsZ0JBQWdCLFNBQVM7QUFDM0MsVUFBTSxpQkFBaUI7QUFHdkIsVUFBTSxlQUFlLE1BQU0sVUFBVSxRQUFRLHNCQUFzQjtBQUNuRSxrQkFBYyxXQUFXLENBQUMsQ0FBQztBQUMzQixVQUFNO0FBRU4sV0FBTyxZQUFZLFFBQVEsWUFBWSxRQUFRLENBQUM7QUFDaEQsV0FBTyxZQUFZLFFBQVEsY0FBYyxpQkFBaUIsR0FBRyxNQUFTO0FBQUEsRUFDdkUsQ0FBQztBQUVELE9BQUssdURBQXVELFlBQVk7QUFDdkUsa0JBQWMsV0FBVyxDQUFDLEVBQUUsTUFBTSxVQUFVLFlBQVksRUFBRSxNQUFNLHlCQUF5QixXQUFXLFNBQVMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO0FBQ25JLG1CQUFlLENBQUMsRUFBRSxnQkFBZ0IsU0FBUztBQUMzQyxVQUFNLGlCQUFpQjtBQUd2QixVQUFNLGNBQWMsTUFBTSxVQUFVLFFBQVEsc0JBQXNCO0FBQ2xFLG1CQUFlLENBQUMsRUFBRSxVQUFVO0FBQzVCLFVBQU07QUFHTixXQUFPLFlBQVksUUFBUSxjQUFjLGlCQUFpQixHQUFHLE1BQVM7QUFDdEUsVUFBTSxRQUFRLFFBQVEsWUFBWSxLQUFLLE9BQUssRUFBRSxZQUFZLFlBQVk7QUFDdEUsV0FBTyxHQUFHLEtBQUs7QUFDZixXQUFPLFlBQVksTUFBTSxRQUFRLGdDQUFnQyxZQUFZO0FBQUEsRUFDOUUsQ0FBQztBQUVELE9BQUsseUNBQXlDLFlBQVk7QUFDekQsa0JBQWMsV0FBVyxDQUFDLEVBQUUsTUFBTSxPQUFPLFlBQVksRUFBRSxNQUFNLHlCQUF5QixXQUFXLFNBQVMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO0FBQzlILFdBQU8sWUFBWSxlQUFlLFFBQVEsQ0FBQztBQUczQyxVQUFNLG9CQUFvQixNQUFNLFVBQVUsUUFBUSxzQkFBc0I7QUFDeEUsbUJBQWUsQ0FBQyxFQUFFLGdCQUFnQixNQUFNLElBQUksTUFBTSxvQkFBb0IsQ0FBQztBQUN2RSxVQUFNO0FBRU4sV0FBTyxZQUFZLFFBQVEsWUFBWSxRQUFRLENBQUM7QUFDaEQsV0FBTyxZQUFZLFFBQVEsY0FBYyxlQUFlLEdBQUcsTUFBUztBQUFBLEVBQ3JFLENBQUM7QUFFRCxPQUFLLDhDQUE4QyxZQUFZO0FBQzlELGtCQUFjLFdBQVc7QUFBQSxNQUN4QixFQUFFLE1BQU0sVUFBVSxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGtCQUFrQixFQUFFO0FBQUEsTUFDdkcsRUFBRSxNQUFNLFVBQVUsWUFBWSxFQUFFLE1BQU0seUJBQXlCLFdBQVcsU0FBUyxrQkFBa0IsRUFBRTtBQUFBLElBQ3hHLENBQUM7QUFFRCxXQUFPLFlBQVksZUFBZSxRQUFRLENBQUM7QUFDM0MsbUJBQWUsQ0FBQyxFQUFFLGdCQUFnQixTQUFTO0FBQzNDLG1CQUFlLENBQUMsRUFBRSxnQkFBZ0IsU0FBUztBQUMzQyxVQUFNLGlCQUFpQjtBQUV2QixXQUFPLFlBQVksUUFBUSxZQUFZLE9BQU8sT0FBSyxnQ0FBZ0MsWUFBWSxFQUFFLE1BQU0sQ0FBQyxFQUFFLFFBQVEsQ0FBQztBQUVuSCxVQUFNLFFBQVEsUUFBUSxjQUFjLGlCQUFpQjtBQUNyRCxVQUFNLFFBQVEsUUFBUSxjQUFjLGlCQUFpQjtBQUNyRCxXQUFPLEdBQUcsS0FBSztBQUNmLFdBQU8sR0FBRyxLQUFLO0FBQ2YsV0FBTyxlQUFlLE1BQU0sVUFBVSxNQUFNLFFBQVE7QUFBQSxFQUNyRCxDQUFDO0FBRUQsT0FBSyw2REFBNkQsWUFBWTtBQUM3RSxrQkFBYyxXQUFXLENBQUMsRUFBRSxNQUFNLFVBQVUsWUFBWSxFQUFFLE1BQU0seUJBQXlCLFdBQVcsU0FBUyxrQkFBa0IsRUFBRSxDQUFDLENBQUM7QUFDbkksbUJBQWUsQ0FBQyxFQUFFLGdCQUFnQixTQUFTO0FBQzNDLFVBQU0saUJBQWlCO0FBRXZCLFVBQU0sZ0JBQWdCLGVBQWUsQ0FBQyxFQUFFO0FBR3hDLGtCQUFjLFdBQVcsQ0FBQyxFQUFFLE1BQU0sV0FBVyxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGtCQUFrQixFQUFFLENBQUMsQ0FBQztBQUdwSSxXQUFPLFlBQVksZUFBZSxRQUFRLENBQUM7QUFHM0MsVUFBTSxPQUFPLFFBQVEsY0FBYyxpQkFBaUI7QUFDcEQsV0FBTyxHQUFHLElBQUk7QUFDZCxXQUFPLFlBQVksS0FBSyxVQUFVLGFBQWE7QUFHL0MsVUFBTSxRQUFRLFFBQVEsWUFBWSxLQUFLLE9BQUssRUFBRSxZQUFZLFlBQVk7QUFDdEUsV0FBTyxZQUFZLE9BQU8sTUFBTSxTQUFTO0FBQUEsRUFDMUMsQ0FBQztBQUVELE9BQUssZ0VBQWdFLFlBQVk7QUFDaEYsVUFBTSxvQkFBb0IsUUFBUSxtQkFBbUI7QUFBQSxNQUNwRCxNQUFNO0FBQUEsTUFDTixpQkFBaUI7QUFBQSxNQUNqQixZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGtCQUFrQjtBQUFBLElBQ3BGLENBQUM7QUFFRCxXQUFPLGdCQUFnQixjQUFjLFNBQVMsQ0FBQztBQUFBLE1BQzlDLFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxNQUNOLGlCQUFpQjtBQUFBLElBQ2xCLENBQUMsQ0FBQztBQUNGLFdBQU8sWUFBWSxlQUFlLFFBQVEsQ0FBQztBQUUzQyxtQkFBZSxDQUFDLEVBQUUsZ0JBQWdCLFNBQVM7QUFDM0MsVUFBTSxhQUFhLE1BQU07QUFFekIsV0FBTyxnQkFBZ0IsWUFBWTtBQUFBLE1BQ2xDLFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxNQUNOLFVBQVUsZUFBZSxDQUFDLEVBQUU7QUFBQSxNQUM1QixrQkFBa0I7QUFBQSxNQUNsQixRQUFRLGdDQUFnQztBQUFBLElBQ3pDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtFQUErRSxZQUFZO0FBQy9GLGtCQUFjLFdBQVcsQ0FBQyxFQUFFLE1BQU0sVUFBVSxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGtCQUFrQixFQUFFLENBQUMsQ0FBQztBQUNuSSxtQkFBZSxDQUFDLEVBQUUsZ0JBQWdCLFNBQVM7QUFDM0MsVUFBTSxpQkFBaUI7QUFFdkIsVUFBTSxhQUFhLE1BQU0sUUFBUSxtQkFBbUI7QUFBQSxNQUNuRCxNQUFNO0FBQUEsTUFDTixpQkFBaUI7QUFBQSxNQUNqQixZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGtCQUFrQjtBQUFBLElBQ3BGLENBQUM7QUFFRCxXQUFPLFlBQVksZUFBZSxRQUFRLENBQUM7QUFDM0MsV0FBTyxnQkFBZ0IsY0FBYyxTQUFTLENBQUM7QUFBQSxNQUM5QyxTQUFTO0FBQUEsTUFDVCxNQUFNO0FBQUEsTUFDTixpQkFBaUI7QUFBQSxJQUNsQixDQUFDLENBQUM7QUFDRixXQUFPLGdCQUFnQixZQUFZO0FBQUEsTUFDbEMsU0FBUztBQUFBLE1BQ1QsTUFBTTtBQUFBLE1BQ04sVUFBVSxlQUFlLENBQUMsRUFBRTtBQUFBLE1BQzVCLGtCQUFrQjtBQUFBLE1BQ2xCLFFBQVEsZ0NBQWdDO0FBQUEsSUFDekMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0RBQXdELFlBQVk7QUFFeEUsVUFBTSxlQUFlLFFBQVEsbUJBQW1CO0FBQUEsTUFDL0MsTUFBTTtBQUFBLE1BQ04sWUFBWSxFQUFFLE1BQU0seUJBQXlCLFdBQVcsU0FBUyxhQUFhO0FBQUEsSUFDL0UsQ0FBQztBQUNELG1CQUFlLENBQUMsRUFBRSxnQkFBZ0IsU0FBUztBQUMzQyxVQUFNO0FBR04sVUFBTSxnQkFBZ0IsUUFBUSxtQkFBbUI7QUFBQSxNQUNoRCxNQUFNO0FBQUEsTUFDTixZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGFBQWE7QUFBQSxJQUMvRSxDQUFDO0FBQ0QsbUJBQWUsQ0FBQyxFQUFFLGdCQUFnQixTQUFTO0FBQzNDLFVBQU07QUFFTixXQUFPLFlBQVksZUFBZSxRQUFRLENBQUM7QUFDM0MsV0FBTyxnQkFBZ0IsY0FBYyxTQUFTO0FBQUEsTUFDN0MsRUFBRSxTQUFTLGNBQWMsTUFBTSxVQUFVLGlCQUFpQixPQUFVO0FBQUEsTUFDcEUsRUFBRSxTQUFTLGNBQWMsTUFBTSxVQUFVLGlCQUFpQixPQUFVO0FBQUEsSUFDckUsQ0FBQztBQUNELFdBQU8sWUFBWSxRQUFRLFlBQVksUUFBUSxDQUFDO0FBQUEsRUFDakQsQ0FBQztBQUVELE9BQUssZ0ZBQWdGLFlBQVk7QUFJaEcsVUFBTSxzQkFBc0IsY0FBYyxZQUFZLEtBQUssYUFBYTtBQUN4RSxrQkFBYyxjQUFjLE9BQU8sS0FBYSxVQUFtQjtBQUNsRSxZQUFNLG9CQUFvQixLQUFLLEtBQUs7QUFFcEMsVUFBSSxlQUFlLFNBQVMsR0FBRztBQUM5Qix1QkFBZSxlQUFlLFNBQVMsQ0FBQyxFQUFFLGdCQUFnQixTQUFTO0FBQUEsTUFDcEU7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUFhLE1BQU0sUUFBUSxtQkFBbUI7QUFBQSxNQUNuRCxNQUFNO0FBQUEsTUFDTixZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGlCQUFpQjtBQUFBLElBQ25GLENBQUM7QUFFRCxXQUFPLFlBQVksV0FBVyxTQUFTLGdCQUFnQjtBQUN2RCxXQUFPLFlBQVksV0FBVyxNQUFNLFdBQVc7QUFBQSxFQUNoRCxDQUFDO0FBRUQsT0FBSyx5REFBeUQsWUFBWTtBQUN6RSxrQkFBYyxXQUFXLENBQUMsRUFBRSxNQUFNLFVBQVUsWUFBWSxFQUFFLE1BQU0seUJBQXlCLFdBQVcsU0FBUyxhQUFhLEVBQUUsQ0FBQyxDQUFDO0FBQzlILG1CQUFlLENBQUMsRUFBRSxnQkFBZ0IsU0FBUztBQUMzQyxVQUFNLGlCQUFpQjtBQUN2QixXQUFPLFlBQVksUUFBUSxZQUFZLE9BQU8sT0FBSyxnQ0FBZ0MsWUFBWSxFQUFFLE1BQU0sQ0FBQyxFQUFFLFFBQVEsQ0FBQztBQUVuSCxrQkFBYyxXQUFXLEtBQUs7QUFFOUIsV0FBTyxZQUFZLFFBQVEsWUFBWSxRQUFRLENBQUM7QUFBQSxFQUNqRCxDQUFDO0FBRUQsT0FBSywyQ0FBMkMsWUFBWTtBQUMzRCxrQkFBYyxXQUFXLEtBQUs7QUFFOUIsVUFBTSxPQUFPO0FBQUEsTUFDWixNQUFNLFFBQVEsbUJBQW1CLEVBQUUsTUFBTSxVQUFVLFlBQVksRUFBRSxNQUFNLHlCQUF5QixXQUFXLFNBQVMsYUFBYSxFQUFFLENBQUM7QUFBQSxNQUNwSTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDZDQUE2QyxZQUFZO0FBQzdELGtCQUFjLFdBQVcsQ0FBQyxFQUFFLE1BQU0sVUFBVSxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGFBQWEsRUFBRSxDQUFDLENBQUM7QUFDOUgsbUJBQWUsQ0FBQyxFQUFFLGdCQUFnQixTQUFTO0FBQzNDLFVBQU0saUJBQWlCO0FBQ3ZCLFdBQU8sWUFBWSxRQUFRLFlBQVksT0FBTyxPQUFLLGdDQUFnQyxZQUFZLEVBQUUsTUFBTSxDQUFDLEVBQUUsUUFBUSxDQUFDO0FBRW5ILGtCQUFjLFdBQVcsS0FBSztBQUM5QixXQUFPLFlBQVksUUFBUSxZQUFZLFFBQVEsQ0FBQztBQUVoRCxrQkFBYyxXQUFXLElBQUk7QUFDN0IsV0FBTyxZQUFZLGVBQWUsUUFBUSxDQUFDO0FBQzNDLG1CQUFlLENBQUMsRUFBRSxnQkFBZ0IsU0FBUztBQUMzQyxVQUFNLGlCQUFpQjtBQUN2QixXQUFPLFlBQVksUUFBUSxZQUFZLE9BQU8sT0FBSyxnQ0FBZ0MsWUFBWSxFQUFFLE1BQU0sQ0FBQyxFQUFFLFFBQVEsQ0FBQztBQUFBLEVBQ3BILENBQUM7QUFFRCxPQUFLLHVEQUF1RCxZQUFZO0FBQ3ZFLGtCQUFjLFdBQVc7QUFBQSxNQUN4QixFQUFFLE1BQU0sVUFBVSxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGtCQUFrQixFQUFFO0FBQUEsTUFDdkcsRUFBRSxNQUFNLFVBQVUsWUFBWSxFQUFFLE1BQU0seUJBQXlCLFdBQVcsU0FBUyxrQkFBa0IsRUFBRTtBQUFBLElBQ3hHLENBQUM7QUFDRCxtQkFBZSxDQUFDLEVBQUUsZ0JBQWdCLFNBQVM7QUFDM0MsbUJBQWUsQ0FBQyxFQUFFLGdCQUFnQixTQUFTO0FBQzNDLFVBQU0saUJBQWlCO0FBQ3ZCLFdBQU8sWUFBWSxRQUFRLFlBQVksT0FBTyxPQUFLLGdDQUFnQyxZQUFZLEVBQUUsTUFBTSxDQUFDLEVBQUUsUUFBUSxDQUFDO0FBRW5ILFVBQU0sUUFBUSxzQkFBc0IsaUJBQWlCO0FBRXJELFdBQU8sZ0JBQWdCLGNBQWMsU0FBUztBQUFBLE1BQzdDLEVBQUUsU0FBUyxtQkFBbUIsTUFBTSxVQUFVLGlCQUFpQixPQUFVO0FBQUEsSUFDMUUsQ0FBQztBQUNELFdBQU8sWUFBWSxRQUFRLFlBQVksT0FBTyxPQUFLLGdDQUFnQyxZQUFZLEVBQUUsTUFBTSxDQUFDLEVBQUUsUUFBUSxDQUFDO0FBQ25ILFdBQU8sWUFBWSxRQUFRLGNBQWMsaUJBQWlCLEdBQUcsTUFBUztBQUN0RSxXQUFPLEdBQUcsUUFBUSxjQUFjLGlCQUFpQixDQUFDO0FBQUEsRUFDbkQsQ0FBQztBQUVELE9BQUssNERBQTRELFlBQVk7QUFDNUUsa0JBQWMsV0FBVyxDQUFDLEVBQUUsTUFBTSxVQUFVLFlBQVksRUFBRSxNQUFNLHlCQUF5QixXQUFXLFNBQVMsYUFBYSxFQUFFLENBQUMsQ0FBQztBQUM5SCxtQkFBZSxDQUFDLEVBQUUsZ0JBQWdCLFNBQVM7QUFDM0MsVUFBTSxpQkFBaUI7QUFFdkIsVUFBTSxRQUFRLHNCQUFzQixpQkFBaUI7QUFFckQsV0FBTyxnQkFBZ0IsY0FBYyxTQUFTLENBQUMsQ0FBQztBQUNoRCxXQUFPLFlBQVksUUFBUSxZQUFZLFFBQVEsQ0FBQztBQUFBLEVBQ2pELENBQUM7QUFFRCxRQUFNLHdCQUF3QixNQUFNO0FBR25DLGFBQVMsMEJBQXdGO0FBQ2hHLFVBQUksV0FBVztBQUNmLGFBQU87QUFBQSxRQUNOLFlBQVksRUFBRSxTQUFTLE1BQU07QUFBRSxxQkFBVztBQUFBLFFBQU0sRUFBRTtBQUFBLFFBQ2xELFVBQVUsTUFBTTtBQUFBLE1BQ2pCO0FBQUEsSUFDRDtBQUdBLG1CQUFlLFdBQVcsTUFBYyxTQUFpQixXQUFpQztBQUN6RixZQUFNLGFBQWEsWUFBWSxJQUFJLElBQUksbUJBQW1CLFFBQVEsT0FBTyxFQUFFLENBQUM7QUFDNUUsYUFBTyxRQUFRO0FBQUEsUUFDZCxFQUFFLE1BQU0sWUFBWSxFQUFFLE1BQU0seUJBQXlCLFdBQVcsUUFBUSxFQUFFO0FBQUEsUUFDMUU7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLHdFQUF3RSxZQUFZO0FBQ3hGLFlBQU0sYUFBYSxZQUFZLElBQUksSUFBSSxtQkFBbUIsb0JBQW9CLENBQUM7QUFDL0UsWUFBTSxRQUFRO0FBQUEsUUFDYjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sWUFBWTtBQUFBLFlBQ1gsTUFBTSx5QkFBeUI7QUFBQSxZQUMvQixTQUFTO0FBQUEsWUFDVCxlQUFlO0FBQUEsWUFDZixVQUFVO0FBQUEsVUFDWDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0EsZ0NBQWdDLGFBQWEsZ0NBQWdDLENBQUMsT0FBTyxHQUFHLENBQUMsUUFBUSxHQUFHLGdCQUFnQjtBQUFBLE1BQ3JIO0FBRUEsWUFBTSxnQkFBZ0IsTUFBTSxRQUFRLHFCQUFxQixzQkFBc0IsZ0JBQWdCO0FBRS9GLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsUUFBUSxRQUFRLFlBQVksQ0FBQyxFQUFFO0FBQUEsUUFDL0IscUJBQXFCLFFBQVEsY0FBYyxvQkFBb0I7QUFBQSxRQUMvRCxjQUFjLFdBQVc7QUFBQSxRQUN6QjtBQUFBLE1BQ0QsR0FBRztBQUFBLFFBQ0YsUUFBUSxnQ0FBZ0MsYUFBYSxnQ0FBZ0MsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxRQUFRLEdBQUcsZ0JBQWdCO0FBQUEsUUFDNUgscUJBQXFCO0FBQUEsUUFDckIsY0FBYyxDQUFDLGdCQUFnQjtBQUFBLFFBQy9CLGVBQWUsRUFBRSxJQUFJLE1BQU0sZ0JBQWdCLEtBQUs7QUFBQSxNQUNqRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxnRkFBZ0YsWUFBWTtBQUNoRyxZQUFNLElBQUksd0JBQXdCO0FBQ2xDLFlBQU0sV0FBVyxXQUFXLGdCQUFnQixFQUFFLFVBQVU7QUFDeEQsYUFBTyxZQUFZLEVBQUUsU0FBUyxHQUFHLEtBQUs7QUFFdEMsWUFBTSxRQUFRLHNCQUFzQixtQkFBbUI7QUFFdkQsYUFBTyxZQUFZLEVBQUUsU0FBUyxHQUFHLE1BQU0saURBQWlEO0FBQ3hGLGFBQU8sWUFBWSxRQUFRLGNBQWMsbUJBQW1CLEdBQUcsTUFBUztBQUFBLElBQ3pFLENBQUM7QUFFRCxTQUFLLHdCQUF3QixZQUFZO0FBQ3hDLG9CQUFjLFdBQVcsS0FBSztBQUU5QixZQUFNLE9BQU87QUFBQSxRQUNaLE1BQU0sV0FBVyxXQUFXLGNBQWM7QUFBQSxRQUMxQztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHdFQUF3RSxZQUFZO0FBT3hGLFlBQU0sS0FBSyx3QkFBd0I7QUFDbkMsWUFBTSxXQUFXLFdBQVcsZ0JBQWdCLEdBQUcsVUFBVTtBQUV6RCxZQUFNLEtBQUssd0JBQXdCO0FBQ25DLFlBQU0sV0FBVyxXQUFXLGdCQUFnQixHQUFHLFVBQVU7QUFFekQsYUFBTyxZQUFZLEdBQUcsU0FBUyxHQUFHLE9BQU8seURBQXlEO0FBQ2xHLGFBQU8sWUFBWSxHQUFHLFNBQVMsR0FBRyxPQUFPLHlDQUF5QztBQUVsRixZQUFNLFFBQVEsc0JBQXNCLG1CQUFtQjtBQUV2RCxhQUFPLFlBQVksR0FBRyxTQUFTLEdBQUcsTUFBTSwrQ0FBK0M7QUFBQSxJQUN4RixDQUFDO0FBRUQsU0FBSyxnRUFBZ0UsWUFBWTtBQUNoRixZQUFNLElBQUksd0JBQXdCO0FBQ2xDLFlBQU0sV0FBVyxXQUFXLGdCQUFnQixFQUFFLFVBQVU7QUFFeEQsY0FBUSxRQUFRO0FBRWhCLGFBQU8sWUFBWSxFQUFFLFNBQVMsR0FBRyxNQUFNLG9EQUFvRDtBQUFBLElBQzVGLENBQUM7QUFFRCxTQUFLLGtFQUFrRSxZQUFZO0FBQ2xGLFlBQU0sYUFBYSxZQUFZLElBQUksSUFBSSxtQkFBbUIsb0JBQW9CLENBQUM7QUFDL0UsWUFBTSxRQUFRO0FBQUEsUUFDYjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04saUJBQWlCO0FBQUEsVUFDakIsWUFBWTtBQUFBLFlBQ1gsTUFBTSx5QkFBeUI7QUFBQSxZQUMvQixTQUFTO0FBQUEsWUFDVCxlQUFlO0FBQUEsWUFDZixVQUFVO0FBQUEsWUFDVixNQUFNO0FBQUEsWUFDTixNQUFNO0FBQUEsVUFDUDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsVUFBVSxjQUFjO0FBQUEsUUFDeEIsWUFBWSxRQUFRO0FBQUEsTUFDckIsR0FBRztBQUFBLFFBQ0YsVUFBVSxDQUFDO0FBQUEsUUFDWCxZQUFZLENBQUM7QUFBQSxVQUNaLE1BQU07QUFBQSxVQUNOLGlCQUFpQjtBQUFBLFVBQ2pCLFlBQVk7QUFBQSxZQUNYLE1BQU0seUJBQXlCO0FBQUEsWUFDL0IsU0FBUztBQUFBLFlBQ1QsZUFBZTtBQUFBLFlBQ2YsVUFBVTtBQUFBLFlBQ1YsTUFBTTtBQUFBLFlBQ04sTUFBTTtBQUFBLFVBQ1A7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLGlFQUFpRSxZQUFZO0FBQ2pGLFlBQU0sVUFBbUM7QUFBQSxRQUN4QyxFQUFFLE1BQU0sVUFBVSxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsUUFBUSxVQUFVLGtCQUFrQixXQUFXLFVBQVUsRUFBRTtBQUFBLFFBQzFILEVBQUUsTUFBTSxPQUFPLFlBQVksRUFBRSxNQUFNLHlCQUF5QixLQUFLLFNBQVMsZUFBZSxRQUFRLFVBQVUsRUFBRTtBQUFBLFFBQzdHLEVBQUUsTUFBTSxpQkFBaUIsWUFBWSxFQUFFLE1BQU0seUJBQXlCLGNBQWMsU0FBUyxpQkFBaUIsZUFBZSxjQUFjLEVBQUU7QUFBQSxNQUM5STtBQUNBLFlBQU0sWUFBWSxDQUFDLHlCQUF5QixlQUFlLGVBQWU7QUFFMUUsZUFBUyxRQUFRLEdBQUcsUUFBUSxRQUFRLFFBQVEsU0FBUztBQUNwRCxjQUFNLFNBQVMsWUFBWSxJQUFJLElBQUksbUJBQW1CLFVBQVUsS0FBSyxDQUFDLENBQUM7QUFDdkUsY0FBTSxRQUFRLHFCQUFxQixRQUFRLEtBQUssR0FBRyxNQUF1RTtBQUFBLE1BQzNIO0FBQ0EsaUJBQVcsV0FBVyxXQUFXO0FBQ2hDLGNBQU0sUUFBUSxzQkFBc0IsT0FBTztBQUFBLE1BQzVDO0FBRUEsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixnQkFBZ0IsY0FBYztBQUFBLFFBQzlCLGVBQWUsZUFBZTtBQUFBLFFBQzlCLFVBQVUsY0FBYztBQUFBLE1BQ3pCLEdBQUc7QUFBQSxRQUNGLGdCQUFnQjtBQUFBLFFBQ2hCLGVBQWU7QUFBQSxRQUNmLFVBQVUsQ0FBQztBQUFBLE1BQ1osQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssc0VBQXNFLFlBQVk7QUFDdEYsWUFBTSxTQUFTLFlBQVksSUFBSSxJQUFJLG1CQUFtQixhQUFhLENBQUM7QUFDcEUsWUFBTSxRQUFRO0FBQUEsUUFDYixFQUFFLE1BQU0sVUFBVSxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsUUFBUSxVQUFVLFFBQVEsV0FBVyxVQUFVLEVBQUU7QUFBQSxRQUNoSDtBQUFBLE1BQ0Q7QUFFQSxvQkFBYyxXQUFXLENBQUMsRUFBRSxNQUFNLGFBQWEsWUFBWSxFQUFFLE1BQU0seUJBQXlCLFdBQVcsU0FBUyxpQkFBaUIsRUFBRSxDQUFDLENBQUM7QUFFckksYUFBTyxZQUFZLFFBQVEsY0FBYyxhQUFhLEdBQUcsTUFBTTtBQUFBLElBQ2hFLENBQUM7QUFFRCxTQUFLLG1FQUFtRSxZQUFZO0FBQ25GLGNBQVEsUUFBUTtBQUNoQixvQkFBYyxjQUFjLENBQUM7QUFBQSxRQUM1QixTQUFTO0FBQUEsUUFDVCxNQUFNO0FBQUEsUUFDTixpQkFBaUI7QUFBQSxRQUNqQixlQUFlO0FBQUEsUUFDZixhQUFhO0FBQUEsUUFDYixTQUFTO0FBQUEsUUFDVCxTQUFTO0FBQUEsTUFDVixDQUFDLENBQUM7QUFFRixnQkFBVSxZQUFZLElBQUkscUJBQXFCLGVBQWUsc0JBQXNCLENBQUM7QUFFckYsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixVQUFVLGNBQWM7QUFBQSxRQUN4QixZQUFZLFFBQVE7QUFBQSxNQUNyQixHQUFHO0FBQUEsUUFDRixVQUFVLENBQUM7QUFBQSxRQUNYLFlBQVksQ0FBQztBQUFBLFVBQ1osTUFBTTtBQUFBLFVBQ04saUJBQWlCO0FBQUEsVUFDakIsWUFBWTtBQUFBLFlBQ1gsTUFBTSx5QkFBeUI7QUFBQSxZQUMvQixTQUFTO0FBQUEsWUFDVCxlQUFlO0FBQUEsWUFDZixVQUFVO0FBQUEsWUFDVixNQUFNO0FBQUEsWUFDTixNQUFNO0FBQUEsVUFDUDtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUVELGNBQVEsUUFBUTtBQUNoQixnQkFBVSxZQUFZLElBQUkscUJBQXFCLGVBQWUsc0JBQXNCLENBQUM7QUFFckYsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixVQUFVLGNBQWM7QUFBQSxRQUN4QixZQUFZLFFBQVE7QUFBQSxNQUNyQixHQUFHO0FBQUEsUUFDRixVQUFVLENBQUM7QUFBQSxRQUNYLFlBQVksQ0FBQztBQUFBLFVBQ1osTUFBTTtBQUFBLFVBQ04saUJBQWlCO0FBQUEsVUFDakIsWUFBWTtBQUFBLFlBQ1gsTUFBTSx5QkFBeUI7QUFBQSxZQUMvQixTQUFTO0FBQUEsWUFDVCxlQUFlO0FBQUEsWUFDZixVQUFVO0FBQUEsWUFDVixNQUFNO0FBQUEsWUFDTixNQUFNO0FBQUEsVUFDUDtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssdURBQXVELFlBQVk7QUFDdkUsY0FBUSxRQUFRO0FBQ2hCLG9CQUFjLGNBQWMsQ0FBQztBQUFBLFFBQzVCLFNBQVM7QUFBQSxRQUNULE1BQU07QUFBQSxRQUNOLGVBQWU7QUFBQSxRQUNmLGFBQWE7QUFBQSxNQUNkLENBQUMsQ0FBQztBQUNGLGdCQUFVLFlBQVksSUFBSSxxQkFBcUIsZUFBZSxzQkFBc0IsQ0FBQztBQUVyRixZQUFNLFVBQVUsTUFBTSxVQUFVLFFBQVEsc0JBQXNCO0FBQzlELFlBQU0sUUFBUSxzQkFBc0IsWUFBWTtBQUNoRCxZQUFNO0FBRU4sYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixVQUFVLGNBQWM7QUFBQSxRQUN4QixZQUFZLFFBQVE7QUFBQSxNQUNyQixHQUFHO0FBQUEsUUFDRixVQUFVLENBQUM7QUFBQSxRQUNYLFlBQVksQ0FBQztBQUFBLE1BQ2QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssOEVBQThFLFlBQVk7QUFDOUYsY0FBUSxRQUFRO0FBQ2hCLG9CQUFjLGNBQWMsQ0FBQztBQUFBLFFBQzVCLFNBQVM7QUFBQSxRQUNULE1BQU07QUFBQSxRQUNOLGVBQWU7QUFBQSxRQUNmLGFBQWE7QUFBQSxNQUNkLENBQUMsQ0FBQztBQUNGLGdCQUFVLFlBQVksSUFBSSxxQkFBcUIsZUFBZSxzQkFBc0IsQ0FBQztBQUVyRixZQUFNLFFBQVEsUUFBUSxtQkFBbUIsRUFBRSxNQUFNLGtCQUFrQixZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGFBQWEsRUFBRSxDQUFDO0FBQ3BKLHFCQUFlLGVBQWUsU0FBUyxDQUFDLEVBQUUsZ0JBQWdCLFNBQVM7QUFDbkUsWUFBTTtBQUlOLGFBQU8sZ0JBQWdCLFFBQVEsbUJBQW1CLENBQUM7QUFBQSxRQUNsRCxNQUFNO0FBQUEsUUFDTixpQkFBaUI7QUFBQSxRQUNqQixZQUFZLEVBQUUsTUFBTSx5QkFBeUIsV0FBVyxTQUFTLGFBQWE7QUFBQSxNQUMvRSxDQUFDLENBQUM7QUFBQSxJQUNILENBQUM7QUFFRCxTQUFLLHdEQUF3RCxZQUFZO0FBQ3hFLFlBQU0sU0FBZ0MsRUFBRSxNQUFNLGFBQWEsWUFBWSxFQUFFLE1BQU0seUJBQXlCLFFBQVEsVUFBVSxVQUFVLFdBQVcsVUFBVSxFQUFFO0FBQzNKLFlBQU0sU0FBUyxZQUFZLElBQUksSUFBSSxtQkFBbUIsZUFBZSxDQUFDO0FBQ3RFLFlBQU0sUUFBUSxxQkFBcUIsUUFBUSxNQUF1RTtBQUVsSCxvQkFBYyxXQUFXLENBQUMsRUFBRSxNQUFNLGFBQWEsWUFBWSxFQUFFLE1BQU0seUJBQXlCLFdBQVcsU0FBUyxhQUFhLEVBQUUsQ0FBQyxDQUFDO0FBRWpJLGFBQU87QUFBQSxRQUNOLFFBQVEsWUFBWSxLQUFLLGdCQUFjLFdBQVcsWUFBWSxlQUFlLEdBQUc7QUFBQSxRQUNoRjtBQUFBLE1BQVc7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHdCQUF3QixNQUFNO0FBRW5DLGFBQVMsYUFBYSxTQUFxRDtBQUMxRSxZQUFNLFlBQVksbUJBQW1CLE9BQU87QUFDNUMsYUFBTyxxQkFBcUIsS0FBSyxPQUFLLEVBQUUsV0FBVyxxQkFBcUIsRUFBRSxjQUFjLFNBQVM7QUFBQSxJQUNsRztBQUVBLFNBQUssOENBQThDLFlBQVk7QUFDOUQsb0JBQWMsV0FBVyxDQUFDLEVBQUUsTUFBTSxVQUFVLFlBQVksRUFBRSxNQUFNLHlCQUF5QixXQUFXLFNBQVMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO0FBRW5JLFlBQU0sWUFBWSxhQUFhLFlBQVk7QUFDM0MsYUFBTyxHQUFHLFdBQVcseUJBQXlCO0FBQzlDLGFBQU8sWUFBWSxVQUFVLFdBQVcsaUJBQWlCLFFBQVE7QUFBQSxJQUNsRSxDQUFDO0FBRUQsU0FBSyxrREFBa0QsWUFBWTtBQUNsRSxvQkFBYyxXQUFXLENBQUMsRUFBRSxNQUFNLFVBQVUsWUFBWSxFQUFFLE1BQU0seUJBQXlCLFdBQVcsU0FBUyxrQkFBa0IsRUFBRSxDQUFDLENBQUM7QUFDbkksb0JBQWMsV0FBVyxDQUFDLEVBQUUsTUFBTSxXQUFXLFlBQVksRUFBRSxNQUFNLHlCQUF5QixXQUFXLFNBQVMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO0FBRXBJLFlBQU0sV0FBVyxxQkFBcUIsT0FBTyxPQUFLLEVBQUUsY0FBYyxtQkFBbUIsWUFBWSxDQUFDO0FBQ2xHLGFBQU8sWUFBWSxTQUFTLFFBQVEsR0FBRywyQ0FBMkM7QUFDbEYsYUFBTyxZQUFZLFNBQVMsQ0FBQyxFQUFFLFdBQVcsaUJBQWlCLFNBQVM7QUFBQSxJQUNyRSxDQUFDO0FBRUQsU0FBSyw4Q0FBOEMsWUFBWTtBQUM5RCxvQkFBYyxXQUFXLENBQUMsRUFBRSxNQUFNLFVBQVUsWUFBWSxFQUFFLE1BQU0seUJBQXlCLFdBQVcsU0FBUyxrQkFBa0IsRUFBRSxDQUFDLENBQUM7QUFDbkksYUFBTyxHQUFHLGFBQWEsWUFBWSxDQUFDO0FBRXBDLG9CQUFjLFdBQVcsQ0FBQyxDQUFDO0FBRTNCLGFBQU8sWUFBWSxhQUFhLFlBQVksR0FBRyxNQUFTO0FBQUEsSUFDekQsQ0FBQztBQUVELFNBQUssbURBQW1ELFlBQVk7QUFDbkUsb0JBQWMsV0FBVyxDQUFDLEVBQUUsTUFBTSxVQUFVLFlBQVksRUFBRSxNQUFNLHlCQUF5QixXQUFXLFNBQVMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO0FBQ25JLGFBQU8sR0FBRyxhQUFhLFlBQVksQ0FBQztBQUVwQyxvQkFBYyxXQUFXLEtBQUs7QUFFOUIsYUFBTyxZQUFZLGFBQWEsWUFBWSxHQUFHLE1BQVM7QUFBQSxJQUN6RCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
