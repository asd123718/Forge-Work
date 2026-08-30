import assert from "assert";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import {
  IRemoteAgentHostService,
  RemoteAgentHostAutoConnectSettingId,
  RemoteAgentHostConnectionStatus,
  RemoteAgentHostsEnabledSettingId
} from "../../../../../../platform/agentHost/common/remoteAgentHostService.js";
import {
  ITunnelAgentHostService,
  TUNNEL_ADDRESS_PREFIX
} from "../../../../../../platform/agentHost/common/tunnelAgentHost.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IAuthenticationService } from "../../../../../../workbench/services/authentication/common/authentication.js";
import { IHostService } from "../../../../../../workbench/services/host/browser/host.js";
import { ITunnelHostService } from "../../../../../../workbench/contrib/chat/common/tunnelHost.js";
import { ISessionsProvidersService } from "../../../../../services/sessions/browser/sessionsProvidersService.js";
import { IAgentHostFilterService } from "../../../../../services/agentHostFilter/common/agentHostFilter.js";
import { TunnelAgentHostContribution } from "../../browser/tunnelAgentHost.contribution.js";
class StubProvider extends mock() {
  constructor(address, name) {
    super();
    this.setConnectionCalls = [];
    this.clearConnectionCalls = [];
    this._status = observableValue("status", RemoteAgentHostConnectionStatus.connecting);
    this.connectionStatus = this._status;
    this.id = `agenthost-${address}`;
    this.remoteAddress = address;
    this.label = name;
  }
  setConnectionStatus(status) {
    this._status.set(status, void 0);
  }
  setConnection(connection, defaultDirectory) {
    this.setConnectionCalls.push({ connection, defaultDirectory });
  }
  unpublishCachedSessions() {
  }
  clearConnection() {
    this.clearConnectionCalls.push(void 0);
  }
  dispose() {
  }
}
class StubTunnelService extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChangeTunnels = this._register(new Emitter());
    this.onDidChangeTunnels = this._onDidChangeTunnels.event;
    this._cached = [];
    this._suppressed = /* @__PURE__ */ new Set();
    /** Records every `connect()` call for assertions on the `userInitiated` threading. */
    this.connectCalls = [];
    this.canDeleteTunnels = true;
  }
  setCached(tunnels) {
    this._cached = tunnels;
    this._onDidChangeTunnels.fire();
  }
  getCachedTunnels() {
    return this._cached;
  }
  setListed(tunnels) {
    this._listed = tunnels;
  }
  async listTunnels() {
    return this._listed ?? [];
  }
  async deleteTunnel(tunnel) {
    this.removeCachedTunnel(tunnel.tunnelId);
  }
  cacheTunnel(tunnel, authProvider) {
    this._cached = [{ tunnelId: tunnel.tunnelId, clusterId: tunnel.clusterId, name: tunnel.name, authProvider }, ...this._cached.filter((cached) => cached.tunnelId !== tunnel.tunnelId)];
    this._onDidChangeTunnels.fire();
  }
  removeCachedTunnel(tunnelId) {
    this._cached = this._cached.filter((tunnel) => tunnel.tunnelId !== tunnelId);
    this._onDidChangeTunnels.fire();
  }
  isAutoConnectSuppressed(id) {
    return this._suppressed.has(id);
  }
  suppressAutoConnect(id) {
    this._suppressed.add(id);
  }
  clearAutoConnectSuppression(id) {
    this._suppressed.delete(id);
  }
  async getAuthProvider() {
    return void 0;
  }
  async connect(tunnel, authProvider, options) {
    this.connectCalls.push({ tunnel, authProvider, options });
  }
  async disconnect(_address) {
  }
}
class StubRemoteAgentHostService extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChangeConnections = this._register(new Emitter());
    this.onDidChangeConnections = this._onDidChangeConnections.event;
    this._connections = [];
    this._agentConnections = /* @__PURE__ */ new Map();
  }
  get connections() {
    return this._connections;
  }
  getConnection(address) {
    return this._agentConnections.get(address);
  }
  addConnection(info, connection) {
    this._connections.push(info);
    this._agentConnections.set(info.address, connection);
    this._onDidChangeConnections.fire();
  }
  setConnectionStatus(address, status) {
    const index = this._connections.findIndex((connection) => connection.address === address);
    if (index >= 0) {
      this._connections[index] = { ...this._connections[index], status };
      this._onDidChangeConnections.fire();
    }
  }
  fireConnectionChange() {
    this._onDidChangeConnections.fire();
  }
}
class StubHostService extends mock() {
  constructor() {
    super(...arguments);
    this._onDidChangeFocus = new Emitter();
    this.onDidChangeFocus = this._onDidChangeFocus.event;
  }
  fireFocus(focused) {
    this._onDidChangeFocus.fire(focused);
  }
}
class StubTunnelHostService extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
  }
  get isSharing() {
    return this._sharingInfo !== void 0;
  }
  get isConnecting() {
    return false;
  }
  get sharingInfo() {
    return this._sharingInfo;
  }
  setSharingInfo(tunnelName) {
    this._sharingInfo = tunnelName ? { tunnelName } : void 0;
    this._onDidChangeStatus.fire();
  }
  async startSharing() {
    throw new Error("Not implemented");
  }
  async stopSharing() {
    this.setSharingInfo(void 0);
  }
}
class StubSessionsProvidersService extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChange = this._register(new Emitter());
    this.onDidChangeProviders = this._onDidChange.event;
    this._providers = /* @__PURE__ */ new Map();
  }
  registerProvider(provider) {
    this._providers.set(provider.id, provider);
    this._onDidChange.fire({ added: [provider], removed: [] });
    return toDisposable(() => {
      if (this._providers.delete(provider.id)) {
        this._onDidChange.fire({ added: [], removed: [provider] });
      }
    });
  }
  getProviders() {
    return [...this._providers.values()];
  }
}
class StubFilterService {
  registerDiscoveryHandler(_handler) {
    return toDisposable(() => {
    });
  }
  async rediscover() {
  }
}
class TestTunnelContribution extends TunnelAgentHostContribution {
  constructor() {
    super(...arguments);
    this.stubProviders = /* @__PURE__ */ new Map();
  }
  _instantiateProvider(address, name) {
    const stub = new StubProvider(address, name);
    this.stubProviders.set(address, stub);
    return stub;
  }
}
suite("TunnelAgentHostContribution", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("newly-cached tunnel binds to subsequent live connection", async () => {
    const tunnelService = store.add(new StubTunnelService());
    const remoteService = store.add(new StubRemoteAgentHostService());
    const providersService = store.add(new StubSessionsProvidersService());
    const configurationService = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
    const hostService = new StubHostService();
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(ITunnelAgentHostService, tunnelService);
    instantiationService.stub(IRemoteAgentHostService, remoteService);
    instantiationService.stub(ISessionsProvidersService, providersService);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(INotificationService, { notify: () => ({ close() {
    } }) });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None });
    instantiationService.stub(ITelemetryService, { publicLog2: () => {
    } });
    instantiationService.stub(IHostService, hostService);
    instantiationService.stub(ITunnelHostService, store.add(new StubTunnelHostService()));
    instantiationService.stub(IAgentHostFilterService, new StubFilterService());
    const contribution = store.add(instantiationService.createInstance(TestTunnelContribution));
    const tunnelId = "tunnel-abc";
    const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
    const fakeConnection = {};
    tunnelService.setCached([{ tunnelId, clusterId: "use", name: "My Tunnel" }]);
    const provider = contribution.stubProviders.get(address);
    assert.ok(provider, "provider should be created for the cached tunnel");
    assert.strictEqual(provider.setConnectionCalls.length, 0, "no live connection yet \u2014 wire-up must wait");
    remoteService.addConnection({
      address,
      name: "My Tunnel",
      clientId: "client-1",
      status: RemoteAgentHostConnectionStatus.connected
    }, fakeConnection);
    assert.deepStrictEqual(provider.setConnectionCalls.map((c) => c.connection), [fakeConnection]);
    await configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);
    configurationService.onDidChangeConfigurationEmitter.fire({
      affectsConfiguration: (key) => key === RemoteAgentHostsEnabledSettingId,
      affectedKeys: /* @__PURE__ */ new Set([RemoteAgentHostsEnabledSettingId]),
      change: { keys: [RemoteAgentHostsEnabledSettingId], overrides: [] },
      source: ConfigurationTarget.USER
    });
    assert.deepStrictEqual(providersService.getProviders(), []);
  });
  test("background auto-connect threads userInitiated: false through to tunnelService.connect, while explicit connects thread userInitiated: true", async () => {
    const tunnelService = store.add(new StubTunnelService());
    const remoteService = store.add(new StubRemoteAgentHostService());
    const providersService = store.add(new StubSessionsProvidersService());
    const configurationService = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
    const hostService = new StubHostService();
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(ITunnelAgentHostService, tunnelService);
    instantiationService.stub(IRemoteAgentHostService, remoteService);
    instantiationService.stub(ISessionsProvidersService, providersService);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(INotificationService, { notify: () => ({ close() {
    } }) });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None });
    instantiationService.stub(ITelemetryService, { publicLog2: () => {
    } });
    instantiationService.stub(IHostService, hostService);
    instantiationService.stub(ITunnelHostService, store.add(new StubTunnelHostService()));
    instantiationService.stub(IAgentHostFilterService, new StubFilterService());
    const contribution = store.add(instantiationService.createInstance(TestTunnelContribution));
    const tunnelId = "tunnel-bg";
    const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
    tunnelService.setCached([{ tunnelId, clusterId: "use", name: "Background Tunnel" }]);
    const testable = contribution;
    await testable._connectTunnel(address, { userInitiated: false });
    assert.strictEqual(tunnelService.connectCalls.length, 1);
    assert.strictEqual(tunnelService.connectCalls[0].options?.userInitiated, false, "background connect must pass userInitiated: false");
    await testable._connectTunnel(address, { userInitiated: true });
    assert.strictEqual(tunnelService.connectCalls.length, 2);
    assert.strictEqual(tunnelService.connectCalls[1].options?.userInitiated, true, "explicit/user-initiated connect must pass userInitiated: true");
  });
  test("does not auto-connect the locally hosted tunnel and reconnects it after sharing stops", async () => {
    const tunnelService = store.add(new StubTunnelService());
    const remoteService = store.add(new StubRemoteAgentHostService());
    const providersService = store.add(new StubSessionsProvidersService());
    const configurationService = new TestConfigurationService({
      [RemoteAgentHostsEnabledSettingId]: true,
      [RemoteAgentHostAutoConnectSettingId]: true
    });
    const hostService = new StubHostService();
    const tunnelHostService = store.add(new StubTunnelHostService());
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(ITunnelAgentHostService, tunnelService);
    instantiationService.stub(IRemoteAgentHostService, remoteService);
    instantiationService.stub(ISessionsProvidersService, providersService);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(INotificationService, { notify: () => ({ close() {
    } }) });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None });
    instantiationService.stub(ITelemetryService, { publicLog2: () => {
    } });
    instantiationService.stub(IHostService, hostService);
    instantiationService.stub(ITunnelHostService, tunnelHostService);
    instantiationService.stub(IAgentHostFilterService, new StubFilterService());
    const locallyHostedTunnel = { tunnelId: "tunnel-local", clusterId: "use", name: "This Machine", tags: [], protocolVersion: 6, hostConnectionCount: 1 };
    const remoteTunnel = { tunnelId: "tunnel-remote", clusterId: "use", name: "Remote Machine", tags: [], protocolVersion: 6, hostConnectionCount: 1 };
    tunnelHostService.setSharingInfo(locallyHostedTunnel.name);
    const contribution = store.add(instantiationService.createInstance(TestTunnelContribution));
    tunnelService.setCached([
      { tunnelId: locallyHostedTunnel.tunnelId, clusterId: locallyHostedTunnel.clusterId, name: locallyHostedTunnel.name },
      { tunnelId: remoteTunnel.tunnelId, clusterId: remoteTunnel.clusterId, name: remoteTunnel.name }
    ]);
    tunnelService.setListed([locallyHostedTunnel, remoteTunnel]);
    const testable = contribution;
    await testable._silentStatusCheck();
    const initialConnects = tunnelService.connectCalls.map((call) => call.tunnel.tunnelId);
    tunnelHostService.setSharingInfo(void 0);
    await Promise.resolve();
    const connectsAfterSharingStopped = tunnelService.connectCalls.map((call) => call.tunnel.tunnelId);
    assert.deepStrictEqual(
      { initialConnects, connectsAfterSharingStopped },
      {
        initialConnects: [remoteTunnel.tunnelId],
        connectsAfterSharingStopped: [remoteTunnel.tunnelId, locallyHostedTunnel.tunnelId, remoteTunnel.tunnelId]
      }
    );
  });
  test("resumes a max-attempts pause on focus and rate-limits repeated focus changes", () => {
    const tunnelService = store.add(new StubTunnelService());
    const remoteService = store.add(new StubRemoteAgentHostService());
    const providersService = store.add(new StubSessionsProvidersService());
    const configurationService = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
    const hostService = new StubHostService();
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(ITunnelAgentHostService, tunnelService);
    instantiationService.stub(IRemoteAgentHostService, remoteService);
    instantiationService.stub(ISessionsProvidersService, providersService);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(INotificationService, { notify: () => ({ close() {
    } }) });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None });
    instantiationService.stub(ITelemetryService, { publicLog2: () => {
    } });
    instantiationService.stub(IHostService, hostService);
    instantiationService.stub(ITunnelHostService, store.add(new StubTunnelHostService()));
    instantiationService.stub(IAgentHostFilterService, new StubFilterService());
    const contribution = store.add(instantiationService.createInstance(TestTunnelContribution));
    const address = `${TUNNEL_ADDRESS_PREFIX}tunnel-focus`;
    tunnelService.setCached([{ tunnelId: "tunnel-focus", clusterId: "use", name: "Focus Tunnel" }]);
    const testable = contribution;
    testable._reconnectPaused.add(address);
    hostService.fireFocus(true);
    const firstResume = {
      paused: testable._reconnectPaused.has(address),
      timers: [...testable._reconnectTimeouts.keys()]
    };
    testable._reconnectPaused.add(address);
    hostService.fireFocus(true);
    const rateLimitedResume = {
      paused: testable._reconnectPaused.has(address),
      timers: [...testable._reconnectTimeouts.keys()]
    };
    assert.deepStrictEqual(
      { firstResume, rateLimitedResume },
      {
        firstResume: { paused: false, timers: [address] },
        rateLimitedResume: { paused: true, timers: [address] }
      }
    );
  });
  test("confirmed online tunnel resumes a max-attempts pause during status check", async () => {
    const tunnelService = store.add(new StubTunnelService());
    const remoteService = store.add(new StubRemoteAgentHostService());
    const providersService = store.add(new StubSessionsProvidersService());
    const configurationService = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
    const hostService = new StubHostService();
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(ITunnelAgentHostService, tunnelService);
    instantiationService.stub(IRemoteAgentHostService, remoteService);
    instantiationService.stub(ISessionsProvidersService, providersService);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(INotificationService, { notify: () => ({ close() {
    } }) });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None });
    instantiationService.stub(ITelemetryService, { publicLog2: () => {
    } });
    instantiationService.stub(IHostService, hostService);
    instantiationService.stub(ITunnelHostService, store.add(new StubTunnelHostService()));
    instantiationService.stub(IAgentHostFilterService, new StubFilterService());
    const contribution = store.add(instantiationService.createInstance(TestTunnelContribution));
    const tunnelId = "tunnel-online";
    const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
    tunnelService.setCached([{ tunnelId, clusterId: "use", name: "Online Tunnel" }]);
    tunnelService.setListed([{ tunnelId, clusterId: "use", name: "Online Tunnel", tags: [], protocolVersion: 5, hostConnectionCount: 1 }]);
    const testable = contribution;
    testable._reconnectPaused.add(address);
    await testable._silentStatusCheck();
    assert.deepStrictEqual(
      { paused: testable._reconnectPaused.has(address), timers: [...testable._reconnectTimeouts.keys()] },
      { paused: false, timers: [address] }
    );
  });
  test("clears the provider connection only after a connected transport disconnects", () => {
    const tunnelService = store.add(new StubTunnelService());
    const remoteService = store.add(new StubRemoteAgentHostService());
    const providersService = store.add(new StubSessionsProvidersService());
    const configurationService = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
    const hostService = new StubHostService();
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(ITunnelAgentHostService, tunnelService);
    instantiationService.stub(IRemoteAgentHostService, remoteService);
    instantiationService.stub(ISessionsProvidersService, providersService);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(INotificationService, { notify: () => ({ close() {
    } }) });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None });
    instantiationService.stub(ITelemetryService, { publicLog2: () => {
    } });
    instantiationService.stub(IHostService, hostService);
    instantiationService.stub(ITunnelHostService, store.add(new StubTunnelHostService()));
    instantiationService.stub(IAgentHostFilterService, new StubFilterService());
    const contribution = store.add(instantiationService.createInstance(TestTunnelContribution));
    const tunnelId = "tunnel-disconnect";
    const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
    tunnelService.setCached([{ tunnelId, clusterId: "use", name: "Disconnect Tunnel" }]);
    remoteService.addConnection({ address, name: "Disconnect Tunnel", clientId: "client", status: RemoteAgentHostConnectionStatus.connected }, {});
    const provider = contribution.stubProviders.get(address);
    remoteService.fireConnectionChange();
    const whileConnected = provider.clearConnectionCalls.length;
    remoteService.setConnectionStatus(address, RemoteAgentHostConnectionStatus.connecting);
    const whileConnecting = provider.clearConnectionCalls.length;
    remoteService.setConnectionStatus(address, RemoteAgentHostConnectionStatus.connected);
    remoteService.setConnectionStatus(address, RemoteAgentHostConnectionStatus.disconnected);
    const afterDisconnect = provider.clearConnectionCalls.length;
    remoteService.fireConnectionChange();
    const afterRepeatDisconnect = provider.clearConnectionCalls.length;
    remoteService.setConnectionStatus(address, RemoteAgentHostConnectionStatus.connected);
    remoteService.setConnectionStatus(address, RemoteAgentHostConnectionStatus.connecting);
    remoteService.setConnectionStatus(address, RemoteAgentHostConnectionStatus.disconnected);
    assert.deepStrictEqual(
      { whileConnected, whileConnecting, afterDisconnect, afterRepeatDisconnect, afterConnectingDisconnect: provider.clearConnectionCalls.length },
      { whileConnected: 0, whileConnecting: 0, afterDisconnect: 1, afterRepeatDisconnect: 1, afterConnectingDisconnect: 2 }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXHR1bm5lbEFnZW50SG9zdC5jb250cmlidXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHtcblx0SVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvLFxuXHRJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0UmVtb3RlQWdlbnRIb3N0QXV0b0Nvbm5lY3RTZXR0aW5nSWQsXG5cdFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMsXG5cdFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkLFxufSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHtcblx0SUNhY2hlZFR1bm5lbCxcblx0SVR1bm5lbEFnZW50SG9zdFNlcnZpY2UsXG5cdFRVTk5FTF9BRERSRVNTX1BSRUZJWCxcblx0dHlwZSBJVHVubmVsSG9zdEluZm8sXG5cdHR5cGUgSVR1bm5lbEluZm8sXG59IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vdHVubmVsQWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJVHVubmVsSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi90dW5uZWxIb3N0LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzQ2hhbmdlRXZlbnQsIElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2FnZW50SG9zdEZpbHRlci9jb21tb24vYWdlbnRIb3N0RmlsdGVyLmpzJztcbmltcG9ydCB7IFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3JlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgVHVubmVsQWdlbnRIb3N0Q29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90dW5uZWxBZ2VudEhvc3QuY29udHJpYnV0aW9uLmpzJztcblxuY2xhc3MgU3R1YlByb3ZpZGVyIGV4dGVuZHMgbW9jazxSZW1vdGVBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyPigpIHtcblx0cmVhZG9ubHkgc2V0Q29ubmVjdGlvbkNhbGxzOiBBcnJheTx7IGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb247IGRlZmF1bHREaXJlY3Rvcnk6IHN0cmluZyB8IHVuZGVmaW5lZCB9PiA9IFtdO1xuXHRyZWFkb25seSBjbGVhckNvbm5lY3Rpb25DYWxsczogdW5kZWZpbmVkW10gPSBbXTtcblxuXHRvdmVycmlkZSByZWFkb25seSBpZDogc3RyaW5nO1xuXHRvdmVycmlkZSByZWFkb25seSByZW1vdGVBZGRyZXNzOiBzdHJpbmc7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlPFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM+KCdzdGF0dXMnLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RpbmcpO1xuXHRvdmVycmlkZSByZWFkb25seSBjb25uZWN0aW9uU3RhdHVzID0gdGhpcy5fc3RhdHVzO1xuXG5cdGNvbnN0cnVjdG9yKGFkZHJlc3M6IHN0cmluZywgbmFtZTogc3RyaW5nKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmlkID0gYGFnZW50aG9zdC0ke2FkZHJlc3N9YDtcblx0XHR0aGlzLnJlbW90ZUFkZHJlc3MgPSBhZGRyZXNzO1xuXHRcdHRoaXMubGFiZWwgPSBuYW1lO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0Q29ubmVjdGlvblN0YXR1cyhzdGF0dXM6IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0dXMuc2V0KHN0YXR1cywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldENvbm5lY3Rpb24oY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiwgZGVmYXVsdERpcmVjdG9yeT86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuc2V0Q29ubmVjdGlvbkNhbGxzLnB1c2goeyBjb25uZWN0aW9uLCBkZWZhdWx0RGlyZWN0b3J5IH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgdW5wdWJsaXNoQ2FjaGVkU2Vzc2lvbnMoKTogdm9pZCB7IC8qIG5vb3AgKi8gfVxuXHRvdmVycmlkZSBjbGVhckNvbm5lY3Rpb24oKTogdm9pZCB7IHRoaXMuY2xlYXJDb25uZWN0aW9uQ2FsbHMucHVzaCh1bmRlZmluZWQpOyB9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHsgLyogbm9vcCAqLyB9XG59XG5cbmNsYXNzIFN0dWJUdW5uZWxTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUdW5uZWxBZ2VudEhvc3RTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUdW5uZWxzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVHVubmVscyA9IHRoaXMuX29uRGlkQ2hhbmdlVHVubmVscy5ldmVudDtcblxuXHRwcml2YXRlIF9jYWNoZWQ6IElDYWNoZWRUdW5uZWxbXSA9IFtdO1xuXHRwcml2YXRlIF9saXN0ZWQ6IElUdW5uZWxJbmZvW10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1cHByZXNzZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHQvKiogUmVjb3JkcyBldmVyeSBgY29ubmVjdCgpYCBjYWxsIGZvciBhc3NlcnRpb25zIG9uIHRoZSBgdXNlckluaXRpYXRlZGAgdGhyZWFkaW5nLiAqL1xuXHRyZWFkb25seSBjb25uZWN0Q2FsbHM6IEFycmF5PHsgdHVubmVsOiBJVHVubmVsSW5mbzsgYXV0aFByb3ZpZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7IG9wdGlvbnM6IHsgcmVhZG9ubHkgdXNlckluaXRpYXRlZD86IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCB9PiA9IFtdO1xuXG5cdHNldENhY2hlZCh0dW5uZWxzOiBJQ2FjaGVkVHVubmVsW10pOiB2b2lkIHtcblx0XHR0aGlzLl9jYWNoZWQgPSB0dW5uZWxzO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVHVubmVscy5maXJlKCk7XG5cdH1cblxuXHRnZXRDYWNoZWRUdW5uZWxzKCk6IElDYWNoZWRUdW5uZWxbXSB7IHJldHVybiB0aGlzLl9jYWNoZWQ7IH1cblx0c2V0TGlzdGVkKHR1bm5lbHM6IElUdW5uZWxJbmZvW10gfCB1bmRlZmluZWQpOiB2b2lkIHsgdGhpcy5fbGlzdGVkID0gdHVubmVsczsgfVxuXHRhc3luYyBsaXN0VHVubmVscygpOiBQcm9taXNlPElUdW5uZWxJbmZvW10+IHsgcmV0dXJuIHRoaXMuX2xpc3RlZCA/PyBbXTsgfVxuXHRyZWFkb25seSBjYW5EZWxldGVUdW5uZWxzID0gdHJ1ZTtcblx0YXN5bmMgZGVsZXRlVHVubmVsKHR1bm5lbDogSVR1bm5lbEluZm8pOiBQcm9taXNlPHZvaWQ+IHsgdGhpcy5yZW1vdmVDYWNoZWRUdW5uZWwodHVubmVsLnR1bm5lbElkKTsgfVxuXHRjYWNoZVR1bm5lbCh0dW5uZWw6IElUdW5uZWxJbmZvLCBhdXRoUHJvdmlkZXI/OiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FjaGVkID0gW3sgdHVubmVsSWQ6IHR1bm5lbC50dW5uZWxJZCwgY2x1c3RlcklkOiB0dW5uZWwuY2x1c3RlcklkLCBuYW1lOiB0dW5uZWwubmFtZSwgYXV0aFByb3ZpZGVyIH0sIC4uLnRoaXMuX2NhY2hlZC5maWx0ZXIoY2FjaGVkID0+IGNhY2hlZC50dW5uZWxJZCAhPT0gdHVubmVsLnR1bm5lbElkKV07XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUdW5uZWxzLmZpcmUoKTtcblx0fVxuXHRyZW1vdmVDYWNoZWRUdW5uZWwodHVubmVsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NhY2hlZCA9IHRoaXMuX2NhY2hlZC5maWx0ZXIodHVubmVsID0+IHR1bm5lbC50dW5uZWxJZCAhPT0gdHVubmVsSWQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVHVubmVscy5maXJlKCk7XG5cdH1cblx0aXNBdXRvQ29ubmVjdFN1cHByZXNzZWQoaWQ6IHN0cmluZyk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fc3VwcHJlc3NlZC5oYXMoaWQpOyB9XG5cdHN1cHByZXNzQXV0b0Nvbm5lY3QoaWQ6IHN0cmluZyk6IHZvaWQgeyB0aGlzLl9zdXBwcmVzc2VkLmFkZChpZCk7IH1cblx0Y2xlYXJBdXRvQ29ubmVjdFN1cHByZXNzaW9uKGlkOiBzdHJpbmcpOiB2b2lkIHsgdGhpcy5fc3VwcHJlc3NlZC5kZWxldGUoaWQpOyB9XG5cdGFzeW5jIGdldEF1dGhQcm92aWRlcigpOiBQcm9taXNlPCdnaXRodWInIHwgJ21pY3Jvc29mdCcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdGFzeW5jIGNvbm5lY3QodHVubmVsOiBJVHVubmVsSW5mbywgYXV0aFByb3ZpZGVyPzogJ2dpdGh1YicgfCAnbWljcm9zb2Z0Jywgb3B0aW9ucz86IHsgcmVhZG9ubHkgdXNlckluaXRpYXRlZD86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY29ubmVjdENhbGxzLnB1c2goeyB0dW5uZWwsIGF1dGhQcm92aWRlciwgb3B0aW9ucyB9KTtcblx0fVxuXG5cdGFzeW5jIGRpc2Nvbm5lY3QoX2FkZHJlc3M6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyAvKiBub29wICovIH1cbn1cblxuY2xhc3MgU3R1YlJlbW90ZUFnZW50SG9zdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25uZWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbm5lY3Rpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9uczogSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWdlbnRDb25uZWN0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJQWdlbnRDb25uZWN0aW9uPigpO1xuXG5cdGdldCBjb25uZWN0aW9ucygpOiByZWFkb25seSBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm9bXSB7IHJldHVybiB0aGlzLl9jb25uZWN0aW9uczsgfVxuXG5cdGdldENvbm5lY3Rpb24oYWRkcmVzczogc3RyaW5nKTogSUFnZW50Q29ubmVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2FnZW50Q29ubmVjdGlvbnMuZ2V0KGFkZHJlc3MpO1xuXHR9XG5cblx0YWRkQ29ubmVjdGlvbihpbmZvOiBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8sIGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9jb25uZWN0aW9ucy5wdXNoKGluZm8pO1xuXHRcdHRoaXMuX2FnZW50Q29ubmVjdGlvbnMuc2V0KGluZm8uYWRkcmVzcywgY29ubmVjdGlvbik7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdH1cblxuXHRzZXRDb25uZWN0aW9uU3RhdHVzKGFkZHJlc3M6IHN0cmluZywgc3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9jb25uZWN0aW9ucy5maW5kSW5kZXgoY29ubmVjdGlvbiA9PiBjb25uZWN0aW9uLmFkZHJlc3MgPT09IGFkZHJlc3MpO1xuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLl9jb25uZWN0aW9uc1tpbmRleF0gPSB7IC4uLnRoaXMuX2Nvbm5lY3Rpb25zW2luZGV4XSwgc3RhdHVzIH07XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRmaXJlQ29ubmVjdGlvbkNoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0fVxufVxuXG5jbGFzcyBTdHViSG9zdFNlcnZpY2UgZXh0ZW5kcyBtb2NrPElIb3N0U2VydmljZT4oKSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRm9jdXMgPSBuZXcgRW1pdHRlcjxib29sZWFuPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZvY3VzID0gdGhpcy5fb25EaWRDaGFuZ2VGb2N1cy5ldmVudDtcblxuXHRmaXJlRm9jdXMoZm9jdXNlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRm9jdXMuZmlyZShmb2N1c2VkKTtcblx0fVxufVxuXG5jbGFzcyBTdHViVHVubmVsSG9zdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVR1bm5lbEhvc3RTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGF0dXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTdGF0dXMgPSB0aGlzLl9vbkRpZENoYW5nZVN0YXR1cy5ldmVudDtcblxuXHRwcml2YXRlIF9zaGFyaW5nSW5mbzogSVR1bm5lbEhvc3RJbmZvIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBpc1NoYXJpbmcoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NoYXJpbmdJbmZvICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgaXNDb25uZWN0aW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGdldCBzaGFyaW5nSW5mbygpOiBJVHVubmVsSG9zdEluZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zaGFyaW5nSW5mbztcblx0fVxuXG5cdHNldFNoYXJpbmdJbmZvKHR1bm5lbE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3NoYXJpbmdJbmZvID0gdHVubmVsTmFtZSA/IHsgdHVubmVsTmFtZSB9IDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzLmZpcmUoKTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0U2hhcmluZygpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRhc3luYyBzdG9wU2hhcmluZygpOiBQcm9taXNlPHZvaWQ+IHsgdGhpcy5zZXRTaGFyaW5nSW5mbyh1bmRlZmluZWQpOyB9XG59XG5cbmNsYXNzIFN0dWJTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2Vzc2lvbnNQcm92aWRlcnNDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvdmlkZXJzID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uc1Byb3ZpZGVyPigpO1xuXG5cdHJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXI6IElTZXNzaW9uc1Byb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX3Byb3ZpZGVycy5zZXQocHJvdmlkZXIuaWQsIHByb3ZpZGVyKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgYWRkZWQ6IFtwcm92aWRlcl0sIHJlbW92ZWQ6IFtdIH0pO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3Byb3ZpZGVycy5kZWxldGUocHJvdmlkZXIuaWQpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtwcm92aWRlcl0gfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRnZXRQcm92aWRlcnMoKTogSVNlc3Npb25zUHJvdmlkZXJbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9wcm92aWRlcnMudmFsdWVzKCldO1xuXHR9XG59XG5cbmNsYXNzIFN0dWJGaWx0ZXJTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlZ2lzdGVyRGlzY292ZXJ5SGFuZGxlcihfaGFuZGxlcjogKCkgPT4gUHJvbWlzZTx2b2lkPik6IElEaXNwb3NhYmxlIHsgcmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pOyB9XG5cdGFzeW5jIHJlZGlzY292ZXIoKTogUHJvbWlzZTx2b2lkPiB7IC8qIG5vb3AgXHUyMDE0IHByb2R1Y3Rpb24gcm91dGVzIHRocm91Z2ggdGhlIGRpc2NvdmVyeSBoYW5kbGVyICovIH1cbn1cblxuY2xhc3MgVGVzdFR1bm5lbENvbnRyaWJ1dGlvbiBleHRlbmRzIFR1bm5lbEFnZW50SG9zdENvbnRyaWJ1dGlvbiB7XG5cdHJlYWRvbmx5IHN0dWJQcm92aWRlcnMgPSBuZXcgTWFwPHN0cmluZywgU3R1YlByb3ZpZGVyPigpO1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfaW5zdGFudGlhdGVQcm92aWRlcihhZGRyZXNzOiBzdHJpbmcsIG5hbWU6IHN0cmluZyk6IFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdGNvbnN0IHN0dWIgPSBuZXcgU3R1YlByb3ZpZGVyKGFkZHJlc3MsIG5hbWUpO1xuXHRcdHRoaXMuc3R1YlByb3ZpZGVycy5zZXQoYWRkcmVzcywgc3R1Yik7XG5cdFx0cmV0dXJuIHN0dWIgYXMgdW5rbm93biBhcyBSZW1vdGVBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyO1xuXHR9XG59XG5cbnN1aXRlKCdUdW5uZWxBZ2VudEhvc3RDb250cmlidXRpb24nLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCduZXdseS1jYWNoZWQgdHVubmVsIGJpbmRzIHRvIHN1YnNlcXVlbnQgbGl2ZSBjb25uZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb24gZ3VhcmQgZm9yIHRoZSBwaWNrZXIgZmxvdzogYHR1bm5lbFNlcnZpY2UuY29ubmVjdCgpYCBpc1xuXHRcdC8vIGNvbnRyYWN0dWFsbHkgb2JsaWdhdGVkIHRvIGNhY2hlIHRoZSB0dW5uZWwgQkVGT1JFIGFubm91bmNpbmcgdGhlXG5cdFx0Ly8gbGl2ZSBjb25uZWN0aW9uIHZpYSBgYWRkTWFuYWdlZENvbm5lY3Rpb25gLiBUaGF0IG9yZGVyaW5nIGxldHMgdGhlXG5cdFx0Ly8gYG9uRGlkQ2hhbmdlVHVubmVsc2AgaGFuZGxlciBjcmVhdGUgdGhlIHByb3ZpZGVyIGZpcnN0LCBzbyB0aGVcblx0XHQvLyBgb25EaWRDaGFuZ2VDb25uZWN0aW9uc2AgaGFuZGxlciBjYW4gd2lyZSBpdC4gQm90aCBoYWx2ZXMgYXJlXG5cdFx0Ly8gZXhlcmNpc2VkIGhlcmUuXG5cdFx0Y29uc3QgdHVubmVsU2VydmljZSA9IHN0b3JlLmFkZChuZXcgU3R1YlR1bm5lbFNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcmVtb3RlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgU3R1YlJlbW90ZUFnZW50SG9zdFNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXJzU2VydmljZSA9IHN0b3JlLmFkZChuZXcgU3R1YlNlc3Npb25zUHJvdmlkZXJzU2VydmljZSgpKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBbUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWRdOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gbmV3IFN0dWJIb3N0U2VydmljZSgpO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUdW5uZWxBZ2VudEhvc3RTZXJ2aWNlLCB0dW5uZWxTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCByZW1vdGVTZXJ2aWNlIGFzIHVua25vd24gYXMgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgcHJvdmlkZXJzU2VydmljZSBhcyB1bmtub3duIGFzIElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90aWZpY2F0aW9uU2VydmljZSwgeyBub3RpZnk6ICgpID0+ICh7IGNsb3NlKCkgeyB9IH0pIH0gYXMgdW5rbm93biBhcyBJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgeyBvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudC5Ob25lIH0gYXMgdW5rbm93biBhcyBJQXV0aGVudGljYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7IHB1YmxpY0xvZzI6ICgpID0+IHsgfSB9IGFzIHVua25vd24gYXMgSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhvc3RTZXJ2aWNlLCBob3N0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVHVubmVsSG9zdFNlcnZpY2UsIHN0b3JlLmFkZChuZXcgU3R1YlR1bm5lbEhvc3RTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlLCBuZXcgU3R1YkZpbHRlclNlcnZpY2UoKSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VHVubmVsQ29udHJpYnV0aW9uKSk7XG5cblx0XHRjb25zdCB0dW5uZWxJZCA9ICd0dW5uZWwtYWJjJztcblx0XHRjb25zdCBhZGRyZXNzID0gYCR7VFVOTkVMX0FERFJFU1NfUFJFRklYfSR7dHVubmVsSWR9YDtcblx0XHRjb25zdCBmYWtlQ29ubmVjdGlvbiA9IHt9IGFzIElBZ2VudENvbm5lY3Rpb247XG5cblx0XHQvLyBTdGVwIDE6IGNhY2hlIHRoZSB0dW5uZWwgXHUyMDE0IGNyZWF0ZXMgdGhlIHByb3ZpZGVyIHZpYSBgX3JlY29uY2lsZVByb3ZpZGVyc2AuXG5cdFx0dHVubmVsU2VydmljZS5zZXRDYWNoZWQoW3sgdHVubmVsSWQsIGNsdXN0ZXJJZDogJ3VzZScsIG5hbWU6ICdNeSBUdW5uZWwnIH1dKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNvbnRyaWJ1dGlvbi5zdHViUHJvdmlkZXJzLmdldChhZGRyZXNzKTtcblx0XHRhc3NlcnQub2socHJvdmlkZXIsICdwcm92aWRlciBzaG91bGQgYmUgY3JlYXRlZCBmb3IgdGhlIGNhY2hlZCB0dW5uZWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIhLnNldENvbm5lY3Rpb25DYWxscy5sZW5ndGgsIDAsICdubyBsaXZlIGNvbm5lY3Rpb24geWV0IFx1MjAxNCB3aXJlLXVwIG11c3Qgd2FpdCcpO1xuXG5cdFx0Ly8gU3RlcCAyOiBhbm5vdW5jZSB0aGUgbGl2ZSBjb25uZWN0aW9uIFx1MjAxNCBgX3dpcmVDb25uZWN0aW9uc2Agc2hvdWxkIGJpbmQgaXQuXG5cdFx0cmVtb3RlU2VydmljZS5hZGRDb25uZWN0aW9uKHtcblx0XHRcdGFkZHJlc3MsXG5cdFx0XHRuYW1lOiAnTXkgVHVubmVsJyxcblx0XHRcdGNsaWVudElkOiAnY2xpZW50LTEnLFxuXHRcdFx0c3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZCxcblx0XHR9LCBmYWtlQ29ubmVjdGlvbik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyIS5zZXRDb25uZWN0aW9uQ2FsbHMubWFwKGMgPT4gYy5jb25uZWN0aW9uKSwgW2Zha2VDb25uZWN0aW9uXSk7XG5cblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCwgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjoga2V5ID0+IGtleSA9PT0gUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQsXG5cdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoW1JlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkXSksXG5cdFx0XHRjaGFuZ2U6IHsga2V5czogW1JlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkXSwgb3ZlcnJpZGVzOiBbXSB9LFxuXHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnYmFja2dyb3VuZCBhdXRvLWNvbm5lY3QgdGhyZWFkcyB1c2VySW5pdGlhdGVkOiBmYWxzZSB0aHJvdWdoIHRvIHR1bm5lbFNlcnZpY2UuY29ubmVjdCwgd2hpbGUgZXhwbGljaXQgY29ubmVjdHMgdGhyZWFkIHVzZXJJbml0aWF0ZWQ6IHRydWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gRm9jdXNlZCByZWdyZXNzaW9uIHRlc3QgZm9yIHRoZSB1c2VySW5pdGlhdGVkL3NpbGVudCBwb2xpY3k6XG5cdFx0Ly8gYmFja2dyb3VuZC9hdXRvLWNvbm5lY3QgbXVzdCBuZXZlciBiZSB0cmVhdGVkIGFzIHVzZXItaW5pdGlhdGVkXG5cdFx0Ly8gKHNvIGEgdjYgZ2F0ZXdheSBzZWxlY3Rpb24gbmV2ZXIgcHJvbXB0cyBvciBwaWNrcyBhbiBlZGl0b3Jcblx0XHQvLyBlbnRyeSksIHdoaWxlIGFuIGV4cGxpY2l0IGNvbm5lY3QgbXVzdCByZXRhaW4gdXNlckluaXRpYXRlZDogdHJ1ZS5cblx0XHRjb25zdCB0dW5uZWxTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBTdHViVHVubmVsU2VydmljZSgpKTtcblx0XHRjb25zdCByZW1vdGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBTdHViUmVtb3RlQWdlbnRIb3N0U2VydmljZSgpKTtcblx0XHRjb25zdCBwcm92aWRlcnNTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBTdHViU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7IFtSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZF06IHRydWUgfSk7XG5cdFx0Y29uc3QgaG9zdFNlcnZpY2UgPSBuZXcgU3R1Ykhvc3RTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVR1bm5lbEFnZW50SG9zdFNlcnZpY2UsIHR1bm5lbFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIHJlbW90ZVNlcnZpY2UgYXMgdW5rbm93biBhcyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBwcm92aWRlcnNTZXJ2aWNlIGFzIHVua25vd24gYXMgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCB7IG5vdGlmeTogKCkgPT4gKHsgY2xvc2UoKSB7IH0gfSkgfSBhcyB1bmtub3duIGFzIElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25TZXJ2aWNlLCB7IG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEV2ZW50Lk5vbmUgfSBhcyB1bmtub3duIGFzIElBdXRoZW50aWNhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHsgcHVibGljTG9nMjogKCkgPT4geyB9IH0gYXMgdW5rbm93biBhcyBJVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSG9zdFNlcnZpY2UsIGhvc3RTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUdW5uZWxIb3N0U2VydmljZSwgc3RvcmUuYWRkKG5ldyBTdHViVHVubmVsSG9zdFNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdEZpbHRlclNlcnZpY2UsIG5ldyBTdHViRmlsdGVyU2VydmljZSgpIGFzIHVua25vd24gYXMgSUFnZW50SG9zdEZpbHRlclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUdW5uZWxDb250cmlidXRpb24pKTtcblxuXHRcdGNvbnN0IHR1bm5lbElkID0gJ3R1bm5lbC1iZyc7XG5cdFx0Y29uc3QgYWRkcmVzcyA9IGAke1RVTk5FTF9BRERSRVNTX1BSRUZJWH0ke3R1bm5lbElkfWA7XG5cdFx0dHVubmVsU2VydmljZS5zZXRDYWNoZWQoW3sgdHVubmVsSWQsIGNsdXN0ZXJJZDogJ3VzZScsIG5hbWU6ICdCYWNrZ3JvdW5kIFR1bm5lbCcgfV0pO1xuXG5cdFx0Ly8gQWNjZXNzIHRoZSBwcml2YXRlIGNvbm5lY3Qtb3JjaGVzdHJhdGlvbiBtZXRob2QgdmlhIGEgdHlwZWQgc2VhbSBcdTIwMTRcblx0XHQvLyBpdCdzIHRoZSBvbmx5IHBsYWNlIGB0dW5uZWxTZXJ2aWNlLmNvbm5lY3QoKWAgaXMgaW52b2tlZCwgc28gdGhpc1xuXHRcdC8vIGV4ZXJjaXNlcyB0aGUgZXhhY3QgdGhyZWFkaW5nIHRoZSBmaXggaW50cm9kdWNlcyB3aXRob3V0IG5lZWRpbmdcblx0XHQvLyB0byBkcml2ZSB0aGUgZnVsbCBgY29ubmVjdE9uRGVtYW5kYC9yZWNvbm5lY3QtdGltZXIgbWFjaGluZXJ5LlxuXHRcdGNvbnN0IHRlc3RhYmxlID0gY29udHJpYnV0aW9uIGFzIHVua25vd24gYXMge1xuXHRcdFx0X2Nvbm5lY3RUdW5uZWwoYWRkcmVzczogc3RyaW5nLCBvcHRpb25zOiB7IHJlYWRvbmx5IHVzZXJJbml0aWF0ZWQ6IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD47XG5cdFx0fTtcblxuXHRcdGF3YWl0IHRlc3RhYmxlLl9jb25uZWN0VHVubmVsKGFkZHJlc3MsIHsgdXNlckluaXRpYXRlZDogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1bm5lbFNlcnZpY2UuY29ubmVjdENhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1bm5lbFNlcnZpY2UuY29ubmVjdENhbGxzWzBdLm9wdGlvbnM/LnVzZXJJbml0aWF0ZWQsIGZhbHNlLCAnYmFja2dyb3VuZCBjb25uZWN0IG11c3QgcGFzcyB1c2VySW5pdGlhdGVkOiBmYWxzZScpO1xuXG5cdFx0YXdhaXQgdGVzdGFibGUuX2Nvbm5lY3RUdW5uZWwoYWRkcmVzcywgeyB1c2VySW5pdGlhdGVkOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dW5uZWxTZXJ2aWNlLmNvbm5lY3RDYWxscy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dW5uZWxTZXJ2aWNlLmNvbm5lY3RDYWxsc1sxXS5vcHRpb25zPy51c2VySW5pdGlhdGVkLCB0cnVlLCAnZXhwbGljaXQvdXNlci1pbml0aWF0ZWQgY29ubmVjdCBtdXN0IHBhc3MgdXNlckluaXRpYXRlZDogdHJ1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBhdXRvLWNvbm5lY3QgdGhlIGxvY2FsbHkgaG9zdGVkIHR1bm5lbCBhbmQgcmVjb25uZWN0cyBpdCBhZnRlciBzaGFyaW5nIHN0b3BzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHR1bm5lbFNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFN0dWJUdW5uZWxTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHJlbW90ZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFN0dWJSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyc1NlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFN0dWJTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZF06IHRydWUsXG5cdFx0XHRbUmVtb3RlQWdlbnRIb3N0QXV0b0Nvbm5lY3RTZXR0aW5nSWRdOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gbmV3IFN0dWJIb3N0U2VydmljZSgpO1xuXHRcdGNvbnN0IHR1bm5lbEhvc3RTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBTdHViVHVubmVsSG9zdFNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUdW5uZWxBZ2VudEhvc3RTZXJ2aWNlLCB0dW5uZWxTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCByZW1vdGVTZXJ2aWNlIGFzIHVua25vd24gYXMgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgcHJvdmlkZXJzU2VydmljZSBhcyB1bmtub3duIGFzIElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90aWZpY2F0aW9uU2VydmljZSwgeyBub3RpZnk6ICgpID0+ICh7IGNsb3NlKCkgeyB9IH0pIH0gYXMgdW5rbm93biBhcyBJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgeyBvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudC5Ob25lIH0gYXMgdW5rbm93biBhcyBJQXV0aGVudGljYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7IHB1YmxpY0xvZzI6ICgpID0+IHsgfSB9IGFzIHVua25vd24gYXMgSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhvc3RTZXJ2aWNlLCBob3N0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVHVubmVsSG9zdFNlcnZpY2UsIHR1bm5lbEhvc3RTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlLCBuZXcgU3R1YkZpbHRlclNlcnZpY2UoKSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGxvY2FsbHlIb3N0ZWRUdW5uZWw6IElUdW5uZWxJbmZvID0geyB0dW5uZWxJZDogJ3R1bm5lbC1sb2NhbCcsIGNsdXN0ZXJJZDogJ3VzZScsIG5hbWU6ICdUaGlzIE1hY2hpbmUnLCB0YWdzOiBbXSwgcHJvdG9jb2xWZXJzaW9uOiA2LCBob3N0Q29ubmVjdGlvbkNvdW50OiAxIH07XG5cdFx0Y29uc3QgcmVtb3RlVHVubmVsOiBJVHVubmVsSW5mbyA9IHsgdHVubmVsSWQ6ICd0dW5uZWwtcmVtb3RlJywgY2x1c3RlcklkOiAndXNlJywgbmFtZTogJ1JlbW90ZSBNYWNoaW5lJywgdGFnczogW10sIHByb3RvY29sVmVyc2lvbjogNiwgaG9zdENvbm5lY3Rpb25Db3VudDogMSB9O1xuXHRcdHR1bm5lbEhvc3RTZXJ2aWNlLnNldFNoYXJpbmdJbmZvKGxvY2FsbHlIb3N0ZWRUdW5uZWwubmFtZSk7XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFR1bm5lbENvbnRyaWJ1dGlvbikpO1xuXHRcdHR1bm5lbFNlcnZpY2Uuc2V0Q2FjaGVkKFtcblx0XHRcdHsgdHVubmVsSWQ6IGxvY2FsbHlIb3N0ZWRUdW5uZWwudHVubmVsSWQsIGNsdXN0ZXJJZDogbG9jYWxseUhvc3RlZFR1bm5lbC5jbHVzdGVySWQsIG5hbWU6IGxvY2FsbHlIb3N0ZWRUdW5uZWwubmFtZSB9LFxuXHRcdFx0eyB0dW5uZWxJZDogcmVtb3RlVHVubmVsLnR1bm5lbElkLCBjbHVzdGVySWQ6IHJlbW90ZVR1bm5lbC5jbHVzdGVySWQsIG5hbWU6IHJlbW90ZVR1bm5lbC5uYW1lIH0sXG5cdFx0XSk7XG5cdFx0dHVubmVsU2VydmljZS5zZXRMaXN0ZWQoW2xvY2FsbHlIb3N0ZWRUdW5uZWwsIHJlbW90ZVR1bm5lbF0pO1xuXHRcdGNvbnN0IHRlc3RhYmxlID0gY29udHJpYnV0aW9uIGFzIHVua25vd24gYXMgeyBfc2lsZW50U3RhdHVzQ2hlY2soKTogUHJvbWlzZTx2b2lkPiB9O1xuXHRcdGF3YWl0IHRlc3RhYmxlLl9zaWxlbnRTdGF0dXNDaGVjaygpO1xuXHRcdGNvbnN0IGluaXRpYWxDb25uZWN0cyA9IHR1bm5lbFNlcnZpY2UuY29ubmVjdENhbGxzLm1hcChjYWxsID0+IGNhbGwudHVubmVsLnR1bm5lbElkKTtcblxuXHRcdHR1bm5lbEhvc3RTZXJ2aWNlLnNldFNoYXJpbmdJbmZvKHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0Y29uc3QgY29ubmVjdHNBZnRlclNoYXJpbmdTdG9wcGVkID0gdHVubmVsU2VydmljZS5jb25uZWN0Q2FsbHMubWFwKGNhbGwgPT4gY2FsbC50dW5uZWwudHVubmVsSWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgaW5pdGlhbENvbm5lY3RzLCBjb25uZWN0c0FmdGVyU2hhcmluZ1N0b3BwZWQgfSxcblx0XHRcdHtcblx0XHRcdFx0aW5pdGlhbENvbm5lY3RzOiBbcmVtb3RlVHVubmVsLnR1bm5lbElkXSxcblx0XHRcdFx0Y29ubmVjdHNBZnRlclNoYXJpbmdTdG9wcGVkOiBbcmVtb3RlVHVubmVsLnR1bm5lbElkLCBsb2NhbGx5SG9zdGVkVHVubmVsLnR1bm5lbElkLCByZW1vdGVUdW5uZWwudHVubmVsSWRdLFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN1bWVzIGEgbWF4LWF0dGVtcHRzIHBhdXNlIG9uIGZvY3VzIGFuZCByYXRlLWxpbWl0cyByZXBlYXRlZCBmb2N1cyBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHR1bm5lbFNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFN0dWJUdW5uZWxTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHJlbW90ZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFN0dWJSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyc1NlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFN0dWJTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgW1JlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkXTogdHJ1ZSB9KTtcblx0XHRjb25zdCBob3N0U2VydmljZSA9IG5ldyBTdHViSG9zdFNlcnZpY2UoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVR1bm5lbEFnZW50SG9zdFNlcnZpY2UsIHR1bm5lbFNlcnZpY2UgYXMgdW5rbm93biBhcyBJVHVubmVsQWdlbnRIb3N0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgcmVtb3RlU2VydmljZSBhcyB1bmtub3duIGFzIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIHByb3ZpZGVyc1NlcnZpY2UgYXMgdW5rbm93biBhcyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIHsgbm90aWZ5OiAoKSA9PiAoeyBjbG9zZSgpIHsgfSB9KSB9IGFzIHVua25vd24gYXMgSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvblNlcnZpY2UsIHsgb25EaWRDaGFuZ2VTZXNzaW9uczogRXZlbnQuTm9uZSB9IGFzIHVua25vd24gYXMgSUF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgeyBwdWJsaWNMb2cyOiAoKSA9PiB7IH0gfSBhcyB1bmtub3duIGFzIElUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElIb3N0U2VydmljZSwgaG9zdFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVR1bm5lbEhvc3RTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IFN0dWJUdW5uZWxIb3N0U2VydmljZSgpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0RmlsdGVyU2VydmljZSwgbmV3IFN0dWJGaWx0ZXJTZXJ2aWNlKCkgYXMgdW5rbm93biBhcyBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSk7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUdW5uZWxDb250cmlidXRpb24pKTtcblx0XHRjb25zdCBhZGRyZXNzID0gYCR7VFVOTkVMX0FERFJFU1NfUFJFRklYfXR1bm5lbC1mb2N1c2A7XG5cdFx0dHVubmVsU2VydmljZS5zZXRDYWNoZWQoW3sgdHVubmVsSWQ6ICd0dW5uZWwtZm9jdXMnLCBjbHVzdGVySWQ6ICd1c2UnLCBuYW1lOiAnRm9jdXMgVHVubmVsJyB9XSk7XG5cdFx0Y29uc3QgdGVzdGFibGUgPSBjb250cmlidXRpb24gYXMgdW5rbm93biBhcyB7XG5cdFx0XHRfcmVjb25uZWN0UGF1c2VkOiBTZXQ8c3RyaW5nPjtcblx0XHRcdF9yZWNvbm5lY3RUaW1lb3V0czogTWFwPHN0cmluZywgUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4+O1xuXHRcdH07XG5cblx0XHR0ZXN0YWJsZS5fcmVjb25uZWN0UGF1c2VkLmFkZChhZGRyZXNzKTtcblx0XHRob3N0U2VydmljZS5maXJlRm9jdXModHJ1ZSk7XG5cdFx0Y29uc3QgZmlyc3RSZXN1bWUgPSB7XG5cdFx0XHRwYXVzZWQ6IHRlc3RhYmxlLl9yZWNvbm5lY3RQYXVzZWQuaGFzKGFkZHJlc3MpLFxuXHRcdFx0dGltZXJzOiBbLi4udGVzdGFibGUuX3JlY29ubmVjdFRpbWVvdXRzLmtleXMoKV0sXG5cdFx0fTtcblxuXHRcdHRlc3RhYmxlLl9yZWNvbm5lY3RQYXVzZWQuYWRkKGFkZHJlc3MpO1xuXHRcdGhvc3RTZXJ2aWNlLmZpcmVGb2N1cyh0cnVlKTtcblx0XHRjb25zdCByYXRlTGltaXRlZFJlc3VtZSA9IHtcblx0XHRcdHBhdXNlZDogdGVzdGFibGUuX3JlY29ubmVjdFBhdXNlZC5oYXMoYWRkcmVzcyksXG5cdFx0XHR0aW1lcnM6IFsuLi50ZXN0YWJsZS5fcmVjb25uZWN0VGltZW91dHMua2V5cygpXSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgZmlyc3RSZXN1bWUsIHJhdGVMaW1pdGVkUmVzdW1lIH0sXG5cdFx0XHR7XG5cdFx0XHRcdGZpcnN0UmVzdW1lOiB7IHBhdXNlZDogZmFsc2UsIHRpbWVyczogW2FkZHJlc3NdIH0sXG5cdFx0XHRcdHJhdGVMaW1pdGVkUmVzdW1lOiB7IHBhdXNlZDogdHJ1ZSwgdGltZXJzOiBbYWRkcmVzc10gfSxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlybWVkIG9ubGluZSB0dW5uZWwgcmVzdW1lcyBhIG1heC1hdHRlbXB0cyBwYXVzZSBkdXJpbmcgc3RhdHVzIGNoZWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHR1bm5lbFNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFN0dWJUdW5uZWxTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHJlbW90ZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFN0dWJSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyc1NlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFN0dWJTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgW1JlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkXTogdHJ1ZSB9KTtcblx0XHRjb25zdCBob3N0U2VydmljZSA9IG5ldyBTdHViSG9zdFNlcnZpY2UoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVR1bm5lbEFnZW50SG9zdFNlcnZpY2UsIHR1bm5lbFNlcnZpY2UgYXMgdW5rbm93biBhcyBJVHVubmVsQWdlbnRIb3N0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgcmVtb3RlU2VydmljZSBhcyB1bmtub3duIGFzIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIHByb3ZpZGVyc1NlcnZpY2UgYXMgdW5rbm93biBhcyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIHsgbm90aWZ5OiAoKSA9PiAoeyBjbG9zZSgpIHsgfSB9KSB9IGFzIHVua25vd24gYXMgSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvblNlcnZpY2UsIHsgb25EaWRDaGFuZ2VTZXNzaW9uczogRXZlbnQuTm9uZSB9IGFzIHVua25vd24gYXMgSUF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgeyBwdWJsaWNMb2cyOiAoKSA9PiB7IH0gfSBhcyB1bmtub3duIGFzIElUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElIb3N0U2VydmljZSwgaG9zdFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVR1bm5lbEhvc3RTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IFN0dWJUdW5uZWxIb3N0U2VydmljZSgpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0RmlsdGVyU2VydmljZSwgbmV3IFN0dWJGaWx0ZXJTZXJ2aWNlKCkgYXMgdW5rbm93biBhcyBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSk7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUdW5uZWxDb250cmlidXRpb24pKTtcblx0XHRjb25zdCB0dW5uZWxJZCA9ICd0dW5uZWwtb25saW5lJztcblx0XHRjb25zdCBhZGRyZXNzID0gYCR7VFVOTkVMX0FERFJFU1NfUFJFRklYfSR7dHVubmVsSWR9YDtcblx0XHR0dW5uZWxTZXJ2aWNlLnNldENhY2hlZChbeyB0dW5uZWxJZCwgY2x1c3RlcklkOiAndXNlJywgbmFtZTogJ09ubGluZSBUdW5uZWwnIH1dKTtcblx0XHR0dW5uZWxTZXJ2aWNlLnNldExpc3RlZChbeyB0dW5uZWxJZCwgY2x1c3RlcklkOiAndXNlJywgbmFtZTogJ09ubGluZSBUdW5uZWwnLCB0YWdzOiBbXSwgcHJvdG9jb2xWZXJzaW9uOiA1LCBob3N0Q29ubmVjdGlvbkNvdW50OiAxIH1dKTtcblx0XHRjb25zdCB0ZXN0YWJsZSA9IGNvbnRyaWJ1dGlvbiBhcyB1bmtub3duIGFzIHtcblx0XHRcdF9yZWNvbm5lY3RQYXVzZWQ6IFNldDxzdHJpbmc+O1xuXHRcdFx0X3JlY29ubmVjdFRpbWVvdXRzOiBNYXA8c3RyaW5nLCBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0Pj47XG5cdFx0XHRfc2lsZW50U3RhdHVzQ2hlY2soKTogUHJvbWlzZTx2b2lkPjtcblx0XHR9O1xuXG5cdFx0dGVzdGFibGUuX3JlY29ubmVjdFBhdXNlZC5hZGQoYWRkcmVzcyk7XG5cdFx0YXdhaXQgdGVzdGFibGUuX3NpbGVudFN0YXR1c0NoZWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBwYXVzZWQ6IHRlc3RhYmxlLl9yZWNvbm5lY3RQYXVzZWQuaGFzKGFkZHJlc3MpLCB0aW1lcnM6IFsuLi50ZXN0YWJsZS5fcmVjb25uZWN0VGltZW91dHMua2V5cygpXSB9LFxuXHRcdFx0eyBwYXVzZWQ6IGZhbHNlLCB0aW1lcnM6IFthZGRyZXNzXSB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFycyB0aGUgcHJvdmlkZXIgY29ubmVjdGlvbiBvbmx5IGFmdGVyIGEgY29ubmVjdGVkIHRyYW5zcG9ydCBkaXNjb25uZWN0cycsICgpID0+IHtcblx0XHRjb25zdCB0dW5uZWxTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBTdHViVHVubmVsU2VydmljZSgpKTtcblx0XHRjb25zdCByZW1vdGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBTdHViUmVtb3RlQWdlbnRIb3N0U2VydmljZSgpKTtcblx0XHRjb25zdCBwcm92aWRlcnNTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBTdHViU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7IFtSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZF06IHRydWUgfSk7XG5cdFx0Y29uc3QgaG9zdFNlcnZpY2UgPSBuZXcgU3R1Ykhvc3RTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUdW5uZWxBZ2VudEhvc3RTZXJ2aWNlLCB0dW5uZWxTZXJ2aWNlIGFzIHVua25vd24gYXMgSVR1bm5lbEFnZW50SG9zdFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIHJlbW90ZVNlcnZpY2UgYXMgdW5rbm93biBhcyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBwcm92aWRlcnNTZXJ2aWNlIGFzIHVua25vd24gYXMgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCB7IG5vdGlmeTogKCkgPT4gKHsgY2xvc2UoKSB7IH0gfSkgfSBhcyB1bmtub3duIGFzIElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25TZXJ2aWNlLCB7IG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEV2ZW50Lk5vbmUgfSBhcyB1bmtub3duIGFzIElBdXRoZW50aWNhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHsgcHVibGljTG9nMjogKCkgPT4geyB9IH0gYXMgdW5rbm93biBhcyBJVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSG9zdFNlcnZpY2UsIGhvc3RTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUdW5uZWxIb3N0U2VydmljZSwgc3RvcmUuYWRkKG5ldyBTdHViVHVubmVsSG9zdFNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdEZpbHRlclNlcnZpY2UsIG5ldyBTdHViRmlsdGVyU2VydmljZSgpIGFzIHVua25vd24gYXMgSUFnZW50SG9zdEZpbHRlclNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VHVubmVsQ29udHJpYnV0aW9uKSk7XG5cdFx0Y29uc3QgdHVubmVsSWQgPSAndHVubmVsLWRpc2Nvbm5lY3QnO1xuXHRcdGNvbnN0IGFkZHJlc3MgPSBgJHtUVU5ORUxfQUREUkVTU19QUkVGSVh9JHt0dW5uZWxJZH1gO1xuXHRcdHR1bm5lbFNlcnZpY2Uuc2V0Q2FjaGVkKFt7IHR1bm5lbElkLCBjbHVzdGVySWQ6ICd1c2UnLCBuYW1lOiAnRGlzY29ubmVjdCBUdW5uZWwnIH1dKTtcblx0XHRyZW1vdGVTZXJ2aWNlLmFkZENvbm5lY3Rpb24oeyBhZGRyZXNzLCBuYW1lOiAnRGlzY29ubmVjdCBUdW5uZWwnLCBjbGllbnRJZDogJ2NsaWVudCcsIHN0YXR1czogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQgfSwge30gYXMgSUFnZW50Q29ubmVjdGlvbik7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjb250cmlidXRpb24uc3R1YlByb3ZpZGVycy5nZXQoYWRkcmVzcykhO1xuXG5cdFx0cmVtb3RlU2VydmljZS5maXJlQ29ubmVjdGlvbkNoYW5nZSgpO1xuXHRcdGNvbnN0IHdoaWxlQ29ubmVjdGVkID0gcHJvdmlkZXIuY2xlYXJDb25uZWN0aW9uQ2FsbHMubGVuZ3RoO1xuXHRcdHJlbW90ZVNlcnZpY2Uuc2V0Q29ubmVjdGlvblN0YXR1cyhhZGRyZXNzLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RpbmcpO1xuXHRcdGNvbnN0IHdoaWxlQ29ubmVjdGluZyA9IHByb3ZpZGVyLmNsZWFyQ29ubmVjdGlvbkNhbGxzLmxlbmd0aDtcblx0XHRyZW1vdGVTZXJ2aWNlLnNldENvbm5lY3Rpb25TdGF0dXMoYWRkcmVzcywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQpO1xuXHRcdHJlbW90ZVNlcnZpY2Uuc2V0Q29ubmVjdGlvblN0YXR1cyhhZGRyZXNzLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmRpc2Nvbm5lY3RlZCk7XG5cdFx0Y29uc3QgYWZ0ZXJEaXNjb25uZWN0ID0gcHJvdmlkZXIuY2xlYXJDb25uZWN0aW9uQ2FsbHMubGVuZ3RoO1xuXHRcdHJlbW90ZVNlcnZpY2UuZmlyZUNvbm5lY3Rpb25DaGFuZ2UoKTtcblx0XHRjb25zdCBhZnRlclJlcGVhdERpc2Nvbm5lY3QgPSBwcm92aWRlci5jbGVhckNvbm5lY3Rpb25DYWxscy5sZW5ndGg7XG5cblx0XHQvLyBBIHRyYW5zcG9ydCB0aGF0IGRyb3BzIHZpYSBhbiBpbnRlcm1lZGlhdGUgYGNvbm5lY3RpbmdgIHN0YXRlIG11c3Rcblx0XHQvLyBzdGlsbCBjbGVhcjogdGhlIHdpcmVkLXByb3ZpZGVyIGJvb2trZWVwaW5nIGhhcyB0byBzdXJ2aXZlIHN0YXR1c2VzXG5cdFx0Ly8gdGhhdCBhcmUgbmVpdGhlciBjb25uZWN0ZWQgbm9yIGRpc2Nvbm5lY3RlZC5cblx0XHRyZW1vdGVTZXJ2aWNlLnNldENvbm5lY3Rpb25TdGF0dXMoYWRkcmVzcywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQpO1xuXHRcdHJlbW90ZVNlcnZpY2Uuc2V0Q29ubmVjdGlvblN0YXR1cyhhZGRyZXNzLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RpbmcpO1xuXHRcdHJlbW90ZVNlcnZpY2Uuc2V0Q29ubmVjdGlvblN0YXR1cyhhZGRyZXNzLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmRpc2Nvbm5lY3RlZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyB3aGlsZUNvbm5lY3RlZCwgd2hpbGVDb25uZWN0aW5nLCBhZnRlckRpc2Nvbm5lY3QsIGFmdGVyUmVwZWF0RGlzY29ubmVjdCwgYWZ0ZXJDb25uZWN0aW5nRGlzY29ubmVjdDogcHJvdmlkZXIuY2xlYXJDb25uZWN0aW9uQ2FsbHMubGVuZ3RoIH0sXG5cdFx0XHR7IHdoaWxlQ29ubmVjdGVkOiAwLCB3aGlsZUNvbm5lY3Rpbmc6IDAsIGFmdGVyRGlzY29ubmVjdDogMSwgYWZ0ZXJSZXBlYXREaXNjb25uZWN0OiAxLCBhZnRlckNvbm5lY3RpbmdEaXNjb25uZWN0OiAyIH0sXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFFeEQ7QUFBQSxFQUVDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUNQO0FBQUEsRUFFQztBQUFBLEVBQ0E7QUFBQSxPQUdNO0FBQ1AsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQkFBMEI7QUFFbkMsU0FBd0MsaUNBQWlDO0FBQ3pFLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsbUNBQW1DO0FBRTVDLE1BQU0scUJBQXFCLEtBQXNDLEVBQUU7QUFBQSxFQVdsRSxZQUFZLFNBQWlCLE1BQWM7QUFDMUMsVUFBTTtBQVhQLFNBQVMscUJBQW9HLENBQUM7QUFDOUcsU0FBUyx1QkFBb0MsQ0FBQztBQU05QyxTQUFpQixVQUFVLGdCQUFpRCxVQUFVLGdDQUFnQyxVQUFVO0FBQ2hJLFNBQWtCLG1CQUFtQixLQUFLO0FBSXpDLFNBQUssS0FBSyxhQUFhLE9BQU87QUFDOUIsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxRQUFRO0FBQUEsRUFDZDtBQUFBLEVBRVMsb0JBQW9CLFFBQStDO0FBQzNFLFNBQUssUUFBUSxJQUFJLFFBQVEsTUFBUztBQUFBLEVBQ25DO0FBQUEsRUFFUyxjQUFjLFlBQThCLGtCQUFpQztBQUNyRixTQUFL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
