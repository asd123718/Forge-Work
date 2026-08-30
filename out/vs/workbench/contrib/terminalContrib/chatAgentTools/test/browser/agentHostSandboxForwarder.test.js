import assert from "assert";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { AgentHostSdkSandboxEnabledSettingId, AgentHostSdkSandboxWindowsEnabledSettingId, IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { AgentHostCustomTerminalToolEnabledSettingId } from "../../../../../../platform/agentHost/common/copilotCliConfig.js";
import { IAgentHostConnectionsService } from "../../../../../../platform/agentHost/common/agentHostConnectionsService.js";
import { AgentHostConnectionsService } from "../../../../../../platform/agentHost/browser/agentHostConnectionsService.js";
import { IRemoteAgentHostService } from "../../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { AgentHostSandboxConfigKey, AgentHostSandboxKey } from "../../../../../../platform/agentHost/common/sandboxConfigSchema.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { AgentNetworkDomainSettingId } from "../../../../../../platform/networkFilter/common/settings.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from "../../../../../../platform/sandbox/common/settings.js";
import { AgentHostSandboxForwarder } from "../../browser/agentHostSandboxForwarder.js";
class MockAgentConnection {
  constructor() {
    this.clientId = "mock-client";
    this.dispatched = [];
    this._rootStateOnDidChange = new Emitter();
    this.rootState = (() => {
      const self = this;
      return {
        get value() {
          return self._rootStateValue;
        },
        get verifiedValue() {
          return self._rootStateValue;
        },
        onDidChange: this._rootStateOnDidChange.event,
        onWillApplyAction: Event.None,
        onDidApplyAction: Event.None
      };
    })();
    this.onDidAction = Event.None;
    this.onDidNotification = Event.None;
  }
  dispatch(_channel, action) {
    this.dispatched.push(action);
  }
  setRootState(state) {
    this._rootStateValue = state;
    if (state) {
      this._rootStateOnDidChange.fire(state);
    }
  }
  dispose() {
    this._rootStateOnDidChange.dispose();
  }
}
class MockAgentHostService extends mock() {
  constructor() {
    super(...arguments);
    this.inner = new MockAgentConnection();
    this.clientId = this.inner.clientId;
    this.onAgentHostStart = Event.None;
    this.onAgentHostExit = Event.None;
    this.onDidAction = this.inner.onDidAction;
    this.onDidNotification = this.inner.onDidNotification;
    this.rootState = this.inner.rootState;
  }
  dispatch(channel, action) {
    this.inner.dispatch(channel, action);
  }
  get dispatched() {
    return this.inner.dispatched;
  }
  setRootState(state) {
    this.inner.setRootState(state);
  }
  dispose() {
    this.inner.dispose();
  }
}
class MockRemoteAgentHostService extends mock() {
  constructor() {
    super(...arguments);
    this._onDidChangeConnections = new Emitter();
    this.onDidChangeConnections = this._onDidChangeConnections.event;
    this._connections = [];
    this._byAddress = /* @__PURE__ */ new Map();
  }
  get connections() {
    return this._connections;
  }
  getConnection(address) {
    return this._byAddress.get(address);
  }
  addConnection(address) {
    const conn = new MockAgentConnection();
    this._byAddress.set(address, conn);
    this._connections = [...this._connections, { address, name: address, clientId: conn.clientId, status: { kind: "connected" } }];
    this._onDidChangeConnections.fire();
    return conn;
  }
  removeConnection(address) {
    const conn = this._byAddress.get(address);
    conn?.dispose();
    this._byAddress.delete(address);
    this._connections = this._connections.filter((c) => c.address !== address);
    this._onDidChangeConnections.fire();
  }
  dispose() {
    for (const conn of this._byAddress.values()) {
      conn.dispose();
    }
    this._byAddress.clear();
    this._onDidChangeConnections.dispose();
  }
}
function rootStateWithSandboxSchema(sandbox = {}) {
  return {
    agents: [],
    config: {
      schema: {
        type: "object",
        properties: {
          [AgentHostSandboxConfigKey.Sandbox]: { type: "object", title: "Agent Sandbox" }
        }
      },
      values: { [AgentHostSandboxConfigKey.Sandbox]: sandbox }
    }
  };
}
function rootStateWithoutSandboxSchema() {
  return {
    agents: [],
    config: {
      schema: {
        type: "object",
        // Older / third-party host that doesn't advertise sandbox keys.
        properties: { customizations: { type: "array", title: "Customizations" } }
      },
      values: {}
    }
  };
}
function setup(disposables, configValues = {}) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const local = new MockAgentHostService();
  disposables.add({ dispose: () => local.dispose() });
  const remote = new MockRemoteAgentHostService();
  disposables.add({ dispose: () => remote.dispose() });
  const configurationService = new TestConfigurationService({
    [AgentHostCustomTerminalToolEnabledSettingId]: true,
    ...configValues
  });
  instantiationService.stub(IAgentHostService, local);
  instantiationService.stub(IRemoteAgentHostService, remote);
  instantiationService.stub(IConfigurationService, configurationService);
  instantiationService.stub(ILogService, new NullLogService());
  const connectionsService = disposables.add(instantiationService.createInstance(AgentHostConnectionsService));
  instantiationService.stub(IAgentHostConnectionsService, connectionsService);
  const forwarder = disposables.add(instantiationService.createInstance(AgentHostSandboxForwarder));
  return { forwarder, local, remote, configurationService };
}
suite("AgentHostSandboxForwarder", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("does not dispatch while rootState is unhydrated", () => {
    const { local } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    assert.deepStrictEqual(local.dispatched, []);
  });
  test("dispatches sandbox values to the local host when rootState hydrates", () => {
    const { local } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema());
    assert.deepStrictEqual(local.dispatched, [{
      type: ActionType.RootConfigChanged,
      config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } }
    }]);
  });
  test("schema-guards keys: skips keys the host does not advertise", () => {
    const { local } = setup(disposables, {
      [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
      [AgentNetworkDomainSettingId.AllowedNetworkDomains]: ["example.com"]
    });
    local.setRootState(rootStateWithoutSandboxSchema());
    assert.deepStrictEqual(local.dispatched, []);
  });
  test("skips no-op dispatch when rootState already matches workbench values", () => {
    const { local } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));
    assert.deepStrictEqual(local.dispatched, []);
  });
  test("re-dispatches when the workbench sandbox setting changes", () => {
    const { local, configurationService } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));
    assert.deepStrictEqual(local.dispatched, []);
    configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);
    configurationService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectsConfiguration: (key) => key === AgentSandboxSettingId.AgentSandboxEnabled,
      affectedKeys: /* @__PURE__ */ new Set([AgentSandboxSettingId.AgentSandboxEnabled]),
      change: { keys: [AgentSandboxSettingId.AgentSandboxEnabled], overrides: [] }
    });
    assert.deepStrictEqual(local.dispatched, [{
      type: ActionType.RootConfigChanged,
      config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.Off } }
    }]);
  });
  test("dispatches to remote connections when they appear", () => {
    const { remote } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    const remoteConn = remote.addConnection("remote.example:9000");
    remoteConn.setRootState(rootStateWithSandboxSchema());
    assert.deepStrictEqual(remoteConn.dispatched, [{
      type: ActionType.RootConfigChanged,
      config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } }
    }]);
  });
  test("fans out workbench setting changes to all connected agent hosts", () => {
    const { local, remote, configurationService } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema());
    const remoteConn = remote.addConnection("remote.example:9000");
    remoteConn.setRootState(rootStateWithSandboxSchema());
    configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, true);
    configurationService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectsConfiguration: (key) => key === AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands,
      affectedKeys: /* @__PURE__ */ new Set([AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]),
      change: { keys: [AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands], overrides: [] }
    });
    const expectedPatch = {
      type: ActionType.RootConfigChanged,
      config: {
        [AgentHostSandboxConfigKey.Sandbox]: {
          [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
          [AgentHostSandboxKey.AllowUnsandboxedCommands]: true
        }
      }
    };
    assert.deepStrictEqual(local.dispatched.at(-1), expectedPatch);
    assert.deepStrictEqual(remoteConn.dispatched.at(-1), expectedPatch);
  });
  test("ignores unrelated configuration changes", () => {
    const { local, configurationService } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));
    assert.deepStrictEqual(local.dispatched, []);
    configurationService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectsConfiguration: (key) => key === "editor.fontSize",
      affectedKeys: /* @__PURE__ */ new Set(["editor.fontSize"]),
      change: { keys: ["editor.fontSize"], overrides: [] }
    });
    assert.deepStrictEqual(local.dispatched, []);
  });
  test("does not push back after initial push when the host updates rootState", () => {
    const { local } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema());
    assert.strictEqual(local.dispatched.length, 1);
    local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.Off }));
    local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.AllowUnsandboxedCommands]: true }));
    local.setRootState(rootStateWithSandboxSchema());
    assert.strictEqual(local.dispatched.length, 1);
  });
  test("does not re-push to existing connections when a new remote appears", () => {
    const { local, remote } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    local.setRootState(rootStateWithSandboxSchema());
    assert.strictEqual(local.dispatched.length, 1);
    const firstRemote = remote.addConnection("remote-a.example:9000");
    firstRemote.setRootState(rootStateWithSandboxSchema());
    assert.strictEqual(firstRemote.dispatched.length, 1);
    assert.strictEqual(local.dispatched.length, 1);
    const secondRemote = remote.addConnection("remote-b.example:9000");
    secondRemote.setRootState(rootStateWithSandboxSchema());
    assert.strictEqual(local.dispatched.length, 1);
    assert.strictEqual(firstRemote.dispatched.length, 1);
    assert.strictEqual(secondRemote.dispatched.length, 1);
  });
  test("cleans up the pending listener when a remote disconnects before hydrating", () => {
    const { remote } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
    const remoteConn = remote.addConnection("remote.example:9000");
    assert.deepStrictEqual(remoteConn.dispatched, []);
    remote.removeConnection("remote.example:9000");
    remoteConn.setRootState(rootStateWithSandboxSchema());
    assert.deepStrictEqual(remoteConn.dispatched, []);
  });
  suite("SDK-sandbox gating", () => {
    test("forwards user values verbatim when customTerminalTool is enabled, regardless of sdkSandbox", () => {
      const { local } = setup(disposables, {
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
        [AgentSandboxSettingId.AgentSandboxAllowNetwork]: true,
        [AgentHostCustomTerminalToolEnabledSettingId]: true,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.Off
      });
      local.setRootState(rootStateWithSandboxSchema());
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: {
          [AgentHostSandboxConfigKey.Sandbox]: {
            [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
            [AgentHostSandboxKey.AllowNetwork]: true
          }
        }
      }]);
    });
    test("forwards an empty sandbox object when both customTerminalTool and sdkSandbox are off (default)", () => {
      const { local } = setup(disposables, {
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
        [AgentSandboxSettingId.AgentSandboxAllowNetwork]: true,
        [AgentHostCustomTerminalToolEnabledSettingId]: false
        // sdkSandbox unset → defaults to 'off'.
      });
      local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: { [AgentHostSandboxConfigKey.Sandbox]: {} }
      }]);
    });
    test("enables non-Windows SDK sandbox independently", () => {
      const { local } = setup(disposables, {
        // User has the engine sandbox off entirely — the SDK sandbox
        // setting should still drive the SDK path independently.
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.Off,
        [AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]: true,
        [AgentHostCustomTerminalToolEnabledSettingId]: false,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.On
      });
      local.setRootState(rootStateWithSandboxSchema());
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: {
          [AgentHostSandboxConfigKey.Sandbox]: {
            [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
            [AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.Off,
            [AgentHostSandboxKey.AllowUnsandboxedCommands]: true
          }
        }
      }]);
    });
    test("forwards the separate allowNetwork policy for the non-Windows SDK sandbox", () => {
      const { local } = setup(disposables, {
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
        [AgentSandboxSettingId.AgentSandboxAllowNetwork]: true,
        [AgentHostCustomTerminalToolEnabledSettingId]: false,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.On
      });
      local.setRootState(rootStateWithSandboxSchema());
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: {
          [AgentHostSandboxConfigKey.Sandbox]: {
            [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
            [AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.Off,
            [AgentHostSandboxKey.AllowNetwork]: true
          }
        }
      }]);
    });
    test("enables Windows SDK sandbox independently", () => {
      const { local } = setup(disposables, {
        [AgentHostCustomTerminalToolEnabledSettingId]: false,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.Off,
        [AgentHostSdkSandboxWindowsEnabledSettingId]: AgentSandboxEnabledValue.On
      });
      local.setRootState(rootStateWithSandboxSchema());
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: {
          [AgentHostSandboxConfigKey.Sandbox]: {
            [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.Off,
            [AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.On
          }
        }
      }]);
    });
    test("re-dispatches when the Windows SDK sandbox setting changes", () => {
      const { local, configurationService } = setup(disposables, {
        [AgentHostCustomTerminalToolEnabledSettingId]: false,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.Off,
        [AgentHostSdkSandboxWindowsEnabledSettingId]: AgentSandboxEnabledValue.Off
      });
      local.setRootState(rootStateWithSandboxSchema());
      assert.deepStrictEqual(local.dispatched, []);
      configurationService.setUserConfiguration(AgentHostSdkSandboxWindowsEnabledSettingId, AgentSandboxEnabledValue.On);
      configurationService.onDidChangeConfigurationEmitter.fire({
        source: ConfigurationTarget.USER,
        affectsConfiguration: (key) => key === AgentHostSdkSandboxWindowsEnabledSettingId,
        affectedKeys: /* @__PURE__ */ new Set([AgentHostSdkSandboxWindowsEnabledSettingId]),
        change: { keys: [AgentHostSdkSandboxWindowsEnabledSettingId], overrides: [] }
      });
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: {
          [AgentHostSandboxConfigKey.Sandbox]: {
            [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.Off,
            [AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.On
          }
        }
      }]);
    });
    test("re-dispatches when sdkSandbox toggles from `on` to `off`", () => {
      const { local, configurationService } = setup(disposables, {
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
        [AgentHostCustomTerminalToolEnabledSettingId]: false,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.On
      });
      local.setRootState(rootStateWithSandboxSchema({
        [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
        [AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.Off
      }));
      assert.deepStrictEqual(local.dispatched, []);
      configurationService.setUserConfiguration(AgentHostSdkSandboxEnabledSettingId, AgentSandboxEnabledValue.Off);
      configurationService.onDidChangeConfigurationEmitter.fire({
        source: ConfigurationTarget.USER,
        affectsConfiguration: (key) => key === AgentHostSdkSandboxEnabledSettingId,
        affectedKeys: /* @__PURE__ */ new Set([AgentHostSdkSandboxEnabledSettingId]),
        change: { keys: [AgentHostSdkSandboxEnabledSettingId], overrides: [] }
      });
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: { [AgentHostSandboxConfigKey.Sandbox]: {} }
      }]);
    });
    test("forwards the separate allowNetwork policy when SDK sandboxing is on", () => {
      const { local, configurationService } = setup(disposables, {
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
        [AgentHostCustomTerminalToolEnabledSettingId]: false,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.On
      });
      local.setRootState(rootStateWithSandboxSchema({
        [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
        [AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.Off
      }));
      assert.deepStrictEqual(local.dispatched, []);
      configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxAllowNetwork, true);
      configurationService.onDidChangeConfigurationEmitter.fire({
        source: ConfigurationTarget.USER,
        affectsConfiguration: (key) => key === AgentSandboxSettingId.AgentSandboxAllowNetwork,
        affectedKeys: /* @__PURE__ */ new Set([AgentSandboxSettingId.AgentSandboxAllowNetwork]),
        change: { keys: [AgentSandboxSettingId.AgentSandboxAllowNetwork], overrides: [] }
      });
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: {
          [AgentHostSandboxConfigKey.Sandbox]: {
            [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
            [AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.Off,
            [AgentHostSandboxKey.AllowNetwork]: true
          }
        }
      }]);
    });
    test("re-dispatches when customTerminalTool is toggled while sdkSandbox is off", () => {
      const { local, configurationService } = setup(disposables, {
        [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
        [AgentHostCustomTerminalToolEnabledSettingId]: false,
        [AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.Off
      });
      local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));
      assert.deepStrictEqual(local.dispatched, [{
        type: ActionType.RootConfigChanged,
        config: { [AgentHostSandboxConfigKey.Sandbox]: {} }
      }]);
      local.setRootState(rootStateWithSandboxSchema({}));
      configurationService.setUserConfiguration(AgentHostCustomTerminalToolEnabledSettingId, true);
      configurationService.onDidChangeConfigurationEmitter.fire({
        source: ConfigurationTarget.USER,
        affectsConfiguration: (key) => key === AgentHostCustomTerminalToolEnabledSettingId,
        affectedKeys: /* @__PURE__ */ new Set([AgentHostCustomTerminalToolEnabledSettingId]),
        change: { keys: [AgentHostCustomTerminalToolEnabledSettingId], overrides: [] }
      });
      assert.deepStrictEqual(local.dispatched.at(-1), {
        type: ActionType.RootConfigChanged,
        config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } }
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXGFnZW50SG9zdFNhbmRib3hGb3J3YXJkZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNka1NhbmRib3hFbmFibGVkU2V0dGluZ0lkLCBBZ2VudEhvc3RTZGtTYW5kYm94V2luZG93c0VuYWJsZWRTZXR0aW5nSWQsIElBZ2VudENvbm5lY3Rpb24sIElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q3VzdG9tVGVybWluYWxUb29sRW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY29waWxvdENsaUNvbmZpZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2Jyb3dzZXIvYWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleSwgQWdlbnRIb3N0U2FuZGJveEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc2FuZGJveENvbmZpZ1NjaGVtYS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBBY3Rpb25FbnZlbG9wZSwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCBJTm90aWZpY2F0aW9uLCBTZXNzaW9uQWN0aW9uLCBUZXJtaW5hbEFjdGlvbiwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgUm9vdFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmV0d29ya0ZpbHRlci9jb21tb24vc2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLCBBZ2VudFNhbmRib3hTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zYW5kYm94L2NvbW1vbi9zZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTYW5kYm94Rm9yd2FyZGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hZ2VudEhvc3RTYW5kYm94Rm9yd2FyZGVyLmpzJztcblxuLy8gLS0tLSBNb2NrcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgTW9ja0FnZW50Q29ubmVjdGlvbiB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyByZWFkb25seSBjbGllbnRJZCA9ICdtb2NrLWNsaWVudCc7XG5cdHB1YmxpYyBkaXNwYXRjaGVkOiAoU2Vzc2lvbkFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pW10gPSBbXTtcblxuXHRwcml2YXRlIF9yb290U3RhdGVWYWx1ZTogUm9vdFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yb290U3RhdGVPbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPFJvb3RTdGF0ZT4oKTtcblxuXHRyZWFkb25seSByb290U3RhdGU6IElBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+ID0gKCgpID0+IHtcblx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0IHZhbHVlKCkgeyByZXR1cm4gc2VsZi5fcm9vdFN0YXRlVmFsdWU7IH0sXG5cdFx0XHRnZXQgdmVyaWZpZWRWYWx1ZSgpIHsgcmV0dXJuIHNlbGYuX3Jvb3RTdGF0ZVZhbHVlOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMuX3Jvb3RTdGF0ZU9uRGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0b25XaWxsQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdH0pKCk7XG5cblx0cmVhZG9ubHkgb25EaWRBY3Rpb246IEV2ZW50PEFjdGlvbkVudmVsb3BlPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uOiBFdmVudDxJTm90aWZpY2F0aW9uPiA9IEV2ZW50Lk5vbmU7XG5cblx0ZGlzcGF0Y2goX2NoYW5uZWw6IHN0cmluZywgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuZGlzcGF0Y2hlZC5wdXNoKGFjdGlvbik7XG5cdH1cblxuXHRzZXRSb290U3RhdGUoc3RhdGU6IFJvb3RTdGF0ZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZVZhbHVlID0gc3RhdGU7XG5cdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHR0aGlzLl9yb290U3RhdGVPbkRpZENoYW5nZS5maXJlKHN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZU9uRGlkQ2hhbmdlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBNb2NrQWdlbnRIb3N0U2VydmljZSBleHRlbmRzIG1vY2s8SUFnZW50SG9zdFNlcnZpY2U+KCkge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHVibGljIHJlYWRvbmx5IGlubmVyID0gbmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKTtcblxuXHRvdmVycmlkZSByZWFkb25seSBjbGllbnRJZCA9IHRoaXMuaW5uZXIuY2xpZW50SWQ7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uQWdlbnRIb3N0U3RhcnQgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkFnZW50SG9zdEV4aXQgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFjdGlvbiA9IHRoaXMuaW5uZXIub25EaWRBY3Rpb247XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uID0gdGhpcy5pbm5lci5vbkRpZE5vdGlmaWNhdGlvbjtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgcm9vdFN0YXRlID0gdGhpcy5pbm5lci5yb290U3RhdGU7XG5cblx0b3ZlcnJpZGUgZGlzcGF0Y2goY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5pbm5lci5kaXNwYXRjaChjaGFubmVsLCBhY3Rpb24pO1xuXHR9XG5cblx0Z2V0IGRpc3BhdGNoZWQoKTogcmVhZG9ubHkgKFNlc3Npb25BY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKVtdIHtcblx0XHRyZXR1cm4gdGhpcy5pbm5lci5kaXNwYXRjaGVkO1xuXHR9XG5cblx0c2V0Um9vdFN0YXRlKHN0YXRlOiBSb290U3RhdGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmlubmVyLnNldFJvb3RTdGF0ZShzdGF0ZSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuaW5uZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIE1vY2tSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIGV4dGVuZHMgbW9jazxJUmVtb3RlQWdlbnRIb3N0U2VydmljZT4oKSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUNvbm5lY3Rpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5ldmVudDtcblxuXHRwcml2YXRlIF9jb25uZWN0aW9uczogSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfYnlBZGRyZXNzID0gbmV3IE1hcDxzdHJpbmcsIE1vY2tBZ2VudENvbm5lY3Rpb24+KCk7XG5cblx0b3ZlcnJpZGUgZ2V0IGNvbm5lY3Rpb25zKCk6IHJlYWRvbmx5IElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uSW5mb1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fY29ubmVjdGlvbnM7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRDb25uZWN0aW9uKGFkZHJlc3M6IHN0cmluZyk6IElBZ2VudENvbm5lY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9ieUFkZHJlc3MuZ2V0KGFkZHJlc3MpIGFzIHVua25vd24gYXMgSUFnZW50Q29ubmVjdGlvbiB8IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFkZENvbm5lY3Rpb24oYWRkcmVzczogc3RyaW5nKTogTW9ja0FnZW50Q29ubmVjdGlvbiB7XG5cdFx0Y29uc3QgY29ubiA9IG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCk7XG5cdFx0dGhpcy5fYnlBZGRyZXNzLnNldChhZGRyZXNzLCBjb25uKTtcblx0XHR0aGlzLl9jb25uZWN0aW9ucyA9IFsuLi50aGlzLl9jb25uZWN0aW9ucywgeyBhZGRyZXNzLCBuYW1lOiBhZGRyZXNzLCBjbGllbnRJZDogY29ubi5jbGllbnRJZCwgc3RhdHVzOiB7IGtpbmQ6ICdjb25uZWN0ZWQnIH0gfV07XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdFx0cmV0dXJuIGNvbm47XG5cdH1cblxuXHRyZW1vdmVDb25uZWN0aW9uKGFkZHJlc3M6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbm4gPSB0aGlzLl9ieUFkZHJlc3MuZ2V0KGFkZHJlc3MpO1xuXHRcdGNvbm4/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9ieUFkZHJlc3MuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb25zID0gdGhpcy5fY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gYy5hZGRyZXNzICE9PSBhZGRyZXNzKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjb25uIG9mIHRoaXMuX2J5QWRkcmVzcy52YWx1ZXMoKSkge1xuXHRcdFx0Y29ubi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2J5QWRkcmVzcy5jbGVhcigpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vIC0tLS0gSGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKHNhbmRib3g6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge30pOiBSb290U3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdGFnZW50czogW10sXG5cdFx0Y29uZmlnOiB7XG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleS5TYW5kYm94XTogeyB0eXBlOiAnb2JqZWN0JywgdGl0bGU6ICdBZ2VudCBTYW5kYm94JyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyBbQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleS5TYW5kYm94XTogc2FuZGJveCB9LFxuXHRcdH0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIHJvb3RTdGF0ZVdpdGhvdXRTYW5kYm94U2NoZW1hKCk6IFJvb3RTdGF0ZSB7XG5cdHJldHVybiB7XG5cdFx0YWdlbnRzOiBbXSxcblx0XHRjb25maWc6IHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0Ly8gT2xkZXIgLyB0aGlyZC1wYXJ0eSBob3N0IHRoYXQgZG9lc24ndCBhZHZlcnRpc2Ugc2FuZGJveCBrZXlzLlxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7IGN1c3RvbWl6YXRpb25zOiB7IHR5cGU6ICdhcnJheScsIHRpdGxlOiAnQ3VzdG9taXphdGlvbnMnIH0gfSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHt9LFxuXHRcdH0sXG5cdH07XG59XG5cbmludGVyZmFjZSBJVGVzdFNldHVwIHtcblx0Zm9yd2FyZGVyOiBBZ2VudEhvc3RTYW5kYm94Rm9yd2FyZGVyO1xuXHRsb2NhbDogTW9ja0FnZW50SG9zdFNlcnZpY2U7XG5cdHJlbW90ZTogTW9ja1JlbW90ZUFnZW50SG9zdFNlcnZpY2U7XG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG59XG5cbmZ1bmN0aW9uIHNldHVwKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIGNvbmZpZ1ZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fSk6IElUZXN0U2V0dXAge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRjb25zdCBsb2NhbCA9IG5ldyBNb2NrQWdlbnRIb3N0U2VydmljZSgpO1xuXHRkaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiBsb2NhbC5kaXNwb3NlKCkgfSk7XG5cdGNvbnN0IHJlbW90ZSA9IG5ldyBNb2NrUmVtb3RlQWdlbnRIb3N0U2VydmljZSgpO1xuXHRkaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiByZW1vdGUuZGlzcG9zZSgpIH0pO1xuXHQvLyBEZWZhdWx0IHRoZSBob3N0LXBvbGljeSBnYXRlcyB0byBcImVuZ2luZSBwYXRoXCIgc28gZXhpc3RpbmcgdGVzdHMgdGhhdFxuXHQvLyBvbmx5IHNldCBgY2hhdC5hZ2VudC5zYW5kYm94LipgIGNvbnRpbnVlIHRvIGFzc2VydCBhZ2FpbnN0IHRoZSB1c2VyJ3Ncblx0Ly8gcmF3IGZvcndhcmRlZCB2YWx1ZXMuIFRoZSBTREstc2FuZGJveCBnYXRpbmcgc3ViLXN1aXRlIGJlbG93IG92ZXJyaWRlc1xuXHQvLyBib3RoIGdhdGVzIGV4cGxpY2l0bHkgdG8gZXhlcmNpc2UgdGhlIG90aGVyIGJyYW5jaGVzLlxuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFtBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkXTogdHJ1ZSxcblx0XHQuLi5jb25maWdWYWx1ZXMsXG5cdH0pO1xuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdFNlcnZpY2UsIGxvY2FsKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgcmVtb3RlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRjb25zdCBjb25uZWN0aW9uc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZSwgY29ubmVjdGlvbnNTZXJ2aWNlKTtcblxuXHRjb25zdCBmb3J3YXJkZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0U2FuZGJveEZvcndhcmRlcikpO1xuXHRyZXR1cm4geyBmb3J3YXJkZXIsIGxvY2FsLCByZW1vdGUsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH07XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbnN1aXRlKCdBZ2VudEhvc3RTYW5kYm94Rm9yd2FyZGVyJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGRpc3BhdGNoIHdoaWxlIHJvb3RTdGF0ZSBpcyB1bmh5ZHJhdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbG9jYWwgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCB7IFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcGF0Y2hlcyBzYW5kYm94IHZhbHVlcyB0byB0aGUgbG9jYWwgaG9zdCB3aGVuIHJvb3RTdGF0ZSBoeWRyYXRlcycsICgpID0+IHtcblx0XHRjb25zdCB7IGxvY2FsIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgeyBbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24gfSk7XG5cblx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFt7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LlNhbmRib3hdOiB7IFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24gfSB9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnc2NoZW1hLWd1YXJkcyBrZXlzOiBza2lwcyBrZXlzIHRoZSBob3N0IGRvZXMgbm90IGFkdmVydGlzZScsICgpID0+IHtcblx0XHRjb25zdCB7IGxvY2FsIH0gPSBzZXR1cChkaXNwb3NhYmxlcywge1xuXHRcdFx0W0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLFxuXHRcdFx0W0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5BbGxvd2VkTmV0d29ya0RvbWFpbnNdOiBbJ2V4YW1wbGUuY29tJ10sXG5cdFx0fSk7XG5cblx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aG91dFNhbmRib3hTY2hlbWEoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgbm8tb3AgZGlzcGF0Y2ggd2hlbiByb290U3RhdGUgYWxyZWFkeSBtYXRjaGVzIHdvcmtiZW5jaCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBsb2NhbCB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHsgW0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uIH0pO1xuXG5cdFx0bG9jYWwuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKHsgW0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmUtZGlzcGF0Y2hlcyB3aGVuIHRoZSB3b3JrYmVuY2ggc2FuZGJveCBzZXR0aW5nIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBsb2NhbCwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCB7IFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9KTtcblxuXHRcdGxvY2FsLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSh7IFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24gfSkpO1xuXHRcdC8vIEluaXRpYWwgc3RhdGUgYWxyZWFkeSBtYXRjaGVzIFx1MjE5MiBubyBkaXNwYXRjaC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFtdKTtcblxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09IEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkLFxuXHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF0pLFxuXHRcdFx0Y2hhbmdlOiB7IGtleXM6IFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF0sIG92ZXJyaWRlczogW10gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHsgW0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmYgfSB9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcGF0Y2hlcyB0byByZW1vdGUgY29ubmVjdGlvbnMgd2hlbiB0aGV5IGFwcGVhcicsICgpID0+IHtcblx0XHRjb25zdCB7IHJlbW90ZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHsgW0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uIH0pO1xuXG5cdFx0Y29uc3QgcmVtb3RlQ29ubiA9IHJlbW90ZS5hZGRDb25uZWN0aW9uKCdyZW1vdGUuZXhhbXBsZTo5MDAwJyk7XG5cdFx0cmVtb3RlQ29ubi5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbW90ZUNvbm4uZGlzcGF0Y2hlZCwgW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHsgW0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9IH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYW5zIG91dCB3b3JrYmVuY2ggc2V0dGluZyBjaGFuZ2VzIHRvIGFsbCBjb25uZWN0ZWQgYWdlbnQgaG9zdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlLCBjb25maWd1cmF0aW9uU2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHsgW0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uIH0pO1xuXHRcdGxvY2FsLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSgpKTtcblx0XHRjb25zdCByZW1vdGVDb25uID0gcmVtb3RlLmFkZENvbm5lY3Rpb24oJ3JlbW90ZS5leGFtcGxlOjkwMDAnKTtcblx0XHRyZW1vdGVDb25uLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSgpKTtcblxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMsIHRydWUpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoa2V5OiBzdHJpbmcpID0+IGtleSA9PT0gQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcyxcblx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kc10pLFxuXHRcdFx0Y2hhbmdlOiB7IGtleXM6IFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dVbnNhbmRib3hlZENvbW1hbmRzXSwgb3ZlcnJpZGVzOiBbXSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWRQYXRjaCA9IHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHtcblx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5FbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLFxuXHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LkFsbG93VW5zYW5kYm94ZWRDb21tYW5kc106IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbC5kaXNwYXRjaGVkLmF0KC0xKSwgZXhwZWN0ZWRQYXRjaCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1vdGVDb25uLmRpc3BhdGNoZWQuYXQoLTEpLCBleHBlY3RlZFBhdGNoKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyB1bnJlbGF0ZWQgY29uZmlndXJhdGlvbiBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbG9jYWwsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgeyBbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24gfSk7XG5cdFx0bG9jYWwuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKHsgW0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbC5kaXNwYXRjaGVkLCBbXSk7XG5cblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09ICdlZGl0b3IuZm9udFNpemUnLFxuXHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFsnZWRpdG9yLmZvbnRTaXplJ10pLFxuXHRcdFx0Y2hhbmdlOiB7IGtleXM6IFsnZWRpdG9yLmZvbnRTaXplJ10sIG92ZXJyaWRlczogW10gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBwdXNoIGJhY2sgYWZ0ZXIgaW5pdGlhbCBwdXNoIHdoZW4gdGhlIGhvc3QgdXBkYXRlcyByb290U3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBsb2NhbCB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHsgW0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uIH0pO1xuXG5cdFx0Ly8gSW5pdGlhbCBoeWRyYXRpb24gdHJpZ2dlcnMgZXhhY3RseSBvbmUgcHVzaC5cblx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQubGVuZ3RoLCAxKTtcblxuXHRcdC8vIFN1YnNlcXVlbnQgcm9vdFN0YXRlIGNoYW5nZXMgZnJvbSB0aGUgaG9zdCBzaWRlIChkaWZmZXJlbnQgc2FuZGJveFxuXHRcdC8vIHZhbHVlcywgdW5yZWxhdGVkIGNvbmZpZyBrZXlzLCBhbnl0aGluZykgbXVzdCBOT1QgdHJpZ2dlciBhbm90aGVyXG5cdFx0Ly8gcHVzaCBcdTIwMTQgdGhhdCdzIHRoZSBwdXNoLWJhY2sgbG9vcCB0aGUgZm9yd2FyZGVyIGlzIGRlc2lnbmVkIHRvIGF2b2lkLlxuXHRcdGxvY2FsLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSh7IFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmIH0pKTtcblx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoeyBbQWdlbnRIb3N0U2FuZGJveEtleS5BbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHNdOiB0cnVlIH0pKTtcblx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZC5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZS1wdXNoIHRvIGV4aXN0aW5nIGNvbm5lY3Rpb25zIHdoZW4gYSBuZXcgcmVtb3RlIGFwcGVhcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBsb2NhbCwgcmVtb3RlIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgeyBbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24gfSk7XG5cdFx0bG9jYWwuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbC5kaXNwYXRjaGVkLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCBmaXJzdFJlbW90ZSA9IHJlbW90ZS5hZGRDb25uZWN0aW9uKCdyZW1vdGUtYS5leGFtcGxlOjkwMDAnKTtcblx0XHRmaXJzdFJlbW90ZS5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0UmVtb3RlLmRpc3BhdGNoZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZC5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gQWRkaW5nIGEgc2Vjb25kIHJlbW90ZSBtdXN0IG5vdCBjYXVzZSBhIHJlZHVuZGFudCBwdXNoIHRvIHRoZSBsb2NhbFxuXHRcdC8vIGhvc3Qgb3IgdG8gdGhlIGFscmVhZHktcHVzaGVkIGZpcnN0IHJlbW90ZS5cblx0XHRjb25zdCBzZWNvbmRSZW1vdGUgPSByZW1vdGUuYWRkQ29ubmVjdGlvbigncmVtb3RlLWIuZXhhbXBsZTo5MDAwJyk7XG5cdFx0c2Vjb25kUmVtb3RlLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbC5kaXNwYXRjaGVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0UmVtb3RlLmRpc3BhdGNoZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kUmVtb3RlLmRpc3BhdGNoZWQubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYW5zIHVwIHRoZSBwZW5kaW5nIGxpc3RlbmVyIHdoZW4gYSByZW1vdGUgZGlzY29ubmVjdHMgYmVmb3JlIGh5ZHJhdGluZycsICgpID0+IHtcblx0XHRjb25zdCB7IHJlbW90ZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHsgW0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uIH0pO1xuXG5cdFx0Y29uc3QgcmVtb3RlQ29ubiA9IHJlbW90ZS5hZGRDb25uZWN0aW9uKCdyZW1vdGUuZXhhbXBsZTo5MDAwJyk7XG5cdFx0Ly8gQ29ubmVjdGlvbiBuZXZlciBoeWRyYXRlcyBcdTIxOTIgZm9yd2FyZGVyIGlzIHN0aWxsIHN1YnNjcmliZWQgdG8gaXRzXG5cdFx0Ly8gcm9vdFN0YXRlLm9uRGlkQ2hhbmdlIHdhaXRpbmcgZm9yIHRoZSBzY2hlbWEuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1vdGVDb25uLmRpc3BhdGNoZWQsIFtdKTtcblxuXHRcdHJlbW90ZS5yZW1vdmVDb25uZWN0aW9uKCdyZW1vdGUuZXhhbXBsZTo5MDAwJyk7XG5cdFx0Ly8gSWYgdGhlIGxpc3RlbmVyIHdhc24ndCBkaXNwb3NlZCwgdGhlIGxlYWsgY2hlY2tlciAoc2VlXG5cdFx0Ly8gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKSB3b3VsZCBmbGFnIGl0IGF0IHRlYXJkb3duLlxuXHRcdC8vIEZpcmluZyBoZXJlIHdvdWxkIGFsc28gdGhyb3cgaWYgdGhlIGNvbm5lY3Rpb24gd2FzIHN0aWxsIG9ic2VydmVkXG5cdFx0Ly8gYWZ0ZXIgcmVtb3ZhbCBcdTIwMTQgZXhwbGljaXRseSBhc3NlcnQgbm8gbGF0ZSBkaXNwYXRjaCBoYXBwZW5zLlxuXHRcdHJlbW90ZUNvbm4uc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVtb3RlQ29ubi5kaXNwYXRjaGVkLCBbXSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdTREstc2FuZGJveCBnYXRpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZm9yd2FyZHMgdXNlciB2YWx1ZXMgdmVyYmF0aW0gd2hlbiBjdXN0b21UZXJtaW5hbFRvb2wgaXMgZW5hYmxlZCwgcmVnYXJkbGVzcyBvZiBzZGtTYW5kYm94JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBsb2NhbCB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHtcblx0XHRcdFx0W0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLFxuXHRcdFx0XHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93TmV0d29ya106IHRydWUsXG5cdFx0XHRcdFtBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkXTogdHJ1ZSxcblx0XHRcdFx0W0FnZW50SG9zdFNka1NhbmRib3hFbmFibGVkU2V0dGluZ0lkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZixcblx0XHRcdH0pO1xuXG5cdFx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW3tcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHtcblx0XHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sXG5cdFx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5BbGxvd05ldHdvcmtdOiB0cnVlLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvcndhcmRzIGFuIGVtcHR5IHNhbmRib3ggb2JqZWN0IHdoZW4gYm90aCBjdXN0b21UZXJtaW5hbFRvb2wgYW5kIHNka1NhbmRib3ggYXJlIG9mZiAoZGVmYXVsdCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGxvY2FsIH0gPSBzZXR1cChkaXNwb3NhYmxlcywge1xuXHRcdFx0XHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sXG5cdFx0XHRcdFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dOZXR3b3JrXTogdHJ1ZSxcblx0XHRcdFx0W0FnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWRdOiBmYWxzZSxcblx0XHRcdFx0Ly8gc2RrU2FuZGJveCB1bnNldCBcdTIxOTIgZGVmYXVsdHMgdG8gJ29mZicuXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gSG9zdCBhbHJlYWR5IGNhcnJpZXMgdmFsdWVzIGZyb20gYSBwcmlvciBzZXNzaW9uLlxuXHRcdFx0bG9jYWwuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKHsgW0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW3tcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LlNhbmRib3hdOiB7fSB9LFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW5hYmxlcyBub24tV2luZG93cyBTREsgc2FuZGJveCBpbmRlcGVuZGVudGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBsb2NhbCB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHtcblx0XHRcdFx0Ly8gVXNlciBoYXMgdGhlIGVuZ2luZSBzYW5kYm94IG9mZiBlbnRpcmVseSBcdTIwMTQgdGhlIFNESyBzYW5kYm94XG5cdFx0XHRcdC8vIHNldHRpbmcgc2hvdWxkIHN0aWxsIGRyaXZlIHRoZSBTREsgcGF0aCBpbmRlcGVuZGVudGx5LlxuXHRcdFx0XHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmLFxuXHRcdFx0XHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kc106IHRydWUsXG5cdFx0XHRcdFtBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkXTogZmFsc2UsXG5cdFx0XHRcdFtBZ2VudEhvc3RTZGtTYW5kYm94RW5hYmxlZFNldHRpbmdJZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbixcblx0XHRcdH0pO1xuXG5cdFx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW3tcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHtcblx0XHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sXG5cdFx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5XaW5kb3dzRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmYsXG5cdFx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5BbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHNdOiB0cnVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3J3YXJkcyB0aGUgc2VwYXJhdGUgYWxsb3dOZXR3b3JrIHBvbGljeSBmb3IgdGhlIG5vbi1XaW5kb3dzIFNESyBzYW5kYm94JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBsb2NhbCB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHtcblx0XHRcdFx0W0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLFxuXHRcdFx0XHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93TmV0d29ya106IHRydWUsXG5cdFx0XHRcdFtBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkXTogZmFsc2UsXG5cdFx0XHRcdFtBZ2VudEhvc3RTZGtTYW5kYm94RW5hYmxlZFNldHRpbmdJZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbixcblx0XHRcdH0pO1xuXG5cdFx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW3tcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHtcblx0XHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sXG5cdFx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5XaW5kb3dzRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmYsXG5cdFx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5BbGxvd05ldHdvcmtdOiB0cnVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbmFibGVzIFdpbmRvd3MgU0RLIHNhbmRib3ggaW5kZXBlbmRlbnRseScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbG9jYWwgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRcdFtBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkXTogZmFsc2UsXG5cdFx0XHRcdFtBZ2VudEhvc3RTZGtTYW5kYm94RW5hYmxlZFNldHRpbmdJZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmYsXG5cdFx0XHRcdFtBZ2VudEhvc3RTZGtTYW5kYm94V2luZG93c0VuYWJsZWRTZXR0aW5nSWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sXG5cdFx0XHR9KTtcblxuXHRcdFx0bG9jYWwuc2V0Um9vdFN0YXRlKHJvb3RTdGF0ZVdpdGhTYW5kYm94U2NoZW1hKCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFt7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LlNhbmRib3hdOiB7XG5cdFx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5FbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZixcblx0XHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LldpbmRvd3NFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZS1kaXNwYXRjaGVzIHdoZW4gdGhlIFdpbmRvd3MgU0RLIHNhbmRib3ggc2V0dGluZyBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBsb2NhbCwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRcdFtBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkXTogZmFsc2UsXG5cdFx0XHRcdFtBZ2VudEhvc3RTZGtTYW5kYm94RW5hYmxlZFNldHRpbmdJZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmYsXG5cdFx0XHRcdFtBZ2VudEhvc3RTZGtTYW5kYm94V2luZG93c0VuYWJsZWRTZXR0aW5nSWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmLFxuXHRcdFx0fSk7XG5cdFx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFtdKTtcblxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQWdlbnRIb3N0U2RrU2FuZGJveFdpbmRvd3NFbmFibGVkU2V0dGluZ0lkLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24pO1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiBrZXkgPT4ga2V5ID09PSBBZ2VudEhvc3RTZGtTYW5kYm94V2luZG93c0VuYWJsZWRTZXR0aW5nSWQsXG5cdFx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbQWdlbnRIb3N0U2RrU2FuZGJveFdpbmRvd3NFbmFibGVkU2V0dGluZ0lkXSksXG5cdFx0XHRcdGNoYW5nZTogeyBrZXlzOiBbQWdlbnRIb3N0U2RrU2FuZGJveFdpbmRvd3NFbmFibGVkU2V0dGluZ0lkXSwgb3ZlcnJpZGVzOiBbXSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW3tcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHtcblx0XHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmLFxuXHRcdFx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hLZXkuV2luZG93c0VuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlLWRpc3BhdGNoZXMgd2hlbiBzZGtTYW5kYm94IHRvZ2dsZXMgZnJvbSBgb25gIHRvIGBvZmZgJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBsb2NhbCwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRcdFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbixcblx0XHRcdFx0W0FnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWRdOiBmYWxzZSxcblx0XHRcdFx0W0FnZW50SG9zdFNka1NhbmRib3hFbmFibGVkU2V0dGluZ0lkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLFxuXHRcdFx0fSk7XG5cdFx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoe1xuXHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5FbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLFxuXHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveEtleS5XaW5kb3dzRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmYsXG5cdFx0XHR9KSk7XG5cdFx0XHQvLyBJbml0aWFsIHN0YXRlIGFscmVhZHkgbWF0Y2hlcyBcdTIxOTIgbm8gZGlzcGF0Y2guXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFtdKTtcblxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWQsIEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmYpO1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoa2V5OiBzdHJpbmcpID0+IGtleSA9PT0gQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWQsXG5cdFx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWRdKSxcblx0XHRcdFx0Y2hhbmdlOiB7IGtleXM6IFtBZ2VudEhvc3RTZGtTYW5kYm94RW5hYmxlZFNldHRpbmdJZF0sIG92ZXJyaWRlczogW10gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmRpc3BhdGNoZWQsIFt7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdGNvbmZpZzogeyBbQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleS5TYW5kYm94XToge30gfSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvcndhcmRzIHRoZSBzZXBhcmF0ZSBhbGxvd05ldHdvcmsgcG9saWN5IHdoZW4gU0RLIHNhbmRib3hpbmcgaXMgb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGxvY2FsLCBjb25maWd1cmF0aW9uU2VydmljZSB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIHtcblx0XHRcdFx0W0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLFxuXHRcdFx0XHRbQWdlbnRIb3N0Q3VzdG9tVGVybWluYWxUb29sRW5hYmxlZFNldHRpbmdJZF06IGZhbHNlLFxuXHRcdFx0XHRbQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sXG5cdFx0XHR9KTtcblx0XHRcdGxvY2FsLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSh7XG5cdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sXG5cdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LldpbmRvd3NFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZixcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZCwgW10pO1xuXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dOZXR3b3JrLCB0cnVlKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKGtleTogc3RyaW5nKSA9PiBrZXkgPT09IEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd05ldHdvcmssXG5cdFx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93TmV0d29ya10pLFxuXHRcdFx0XHRjaGFuZ2U6IHsga2V5czogW0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd05ldHdvcmtdLCBvdmVycmlkZXM6IFtdIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbC5kaXNwYXRjaGVkLCBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHtcblx0XHRcdFx0XHRbQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleS5TYW5kYm94XToge1xuXHRcdFx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbixcblx0XHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LldpbmRvd3NFbmFibGVkXTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZixcblx0XHRcdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5LkFsbG93TmV0d29ya106IHRydWUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlLWRpc3BhdGNoZXMgd2hlbiBjdXN0b21UZXJtaW5hbFRvb2wgaXMgdG9nZ2xlZCB3aGlsZSBzZGtTYW5kYm94IGlzIG9mZicsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbG9jYWwsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcywge1xuXHRcdFx0XHRbQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sXG5cdFx0XHRcdFtBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkXTogZmFsc2UsXG5cdFx0XHRcdFtBZ2VudEhvc3RTZGtTYW5kYm94RW5hYmxlZFNldHRpbmdJZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmYsXG5cdFx0XHR9KTtcblx0XHRcdC8vIEJvdGggZ2F0ZXMgb2ZmIFx1MjE5MiBmb3J3YXJkZXIgcHVzaGVzIGB7fWAsIHdoaWNoIGNsZWFycyB0aGUgaG9zdCdzXG5cdFx0XHQvLyBwcmlvciB2YWx1ZS5cblx0XHRcdGxvY2FsLnNldFJvb3RTdGF0ZShyb290U3RhdGVXaXRoU2FuZGJveFNjaGVtYSh7IFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24gfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbC5kaXNwYXRjaGVkLCBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveF06IHt9IH0sXG5cdFx0XHR9XSk7XG5cblx0XHRcdC8vIFNpbXVsYXRlIHRoZSBob3N0IGFwcGx5aW5nIHRoYXQgZGlzcGF0Y2ggKHRoZSBtb2NrIGRvZXMgbm90IGRvIHRoaXNcblx0XHRcdC8vIGF1dG9tYXRpY2FsbHkpLiBXaXRob3V0IHRoaXMsIHRoZSBlcXVhbHMtY2hlY2sgaW5zaWRlIF90cnlQdXNoIHdvdWxkXG5cdFx0XHQvLyBzaG9ydC1jaXJjdWl0IHRoZSBzZWNvbmQgcHVzaCBiZWNhdXNlIHRoZSBob3N0J3MgdmlldyBvZiB0aGUgc2FuZGJveFxuXHRcdFx0Ly8gdmFsdWVzIHdvdWxkIHN0aWxsIGJlIHRoZSBzdGFsZSBwcmUtY2xlYXIgdmFsdWUuXG5cdFx0XHRsb2NhbC5zZXRSb290U3RhdGUocm9vdFN0YXRlV2l0aFNhbmRib3hTY2hlbWEoe30pKTtcblxuXHRcdFx0Ly8gRmxpcCBjdXN0b21UZXJtaW5hbFRvb2wgT04gXHUyMTkyIGZvcndhcmRlciBzaG91bGQgcHVzaCB0aGUgcmVhbFxuXHRcdFx0Ly8gc2FuZGJveCB2YWx1ZXMgdmVyYmF0aW0gKGVuZ2luZSBwYXRoIG5lZWRzIHRoZW0pLlxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQWdlbnRIb3N0Q3VzdG9tVGVybWluYWxUb29sRW5hYmxlZFNldHRpbmdJZCwgdHJ1ZSk7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChrZXk6IHN0cmluZykgPT4ga2V5ID09PSBBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkLFxuXHRcdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoW0FnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWRdKSxcblx0XHRcdFx0Y2hhbmdlOiB7IGtleXM6IFtBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkXSwgb3ZlcnJpZGVzOiBbXSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9jYWwuZGlzcGF0Y2hlZC5hdCgtMSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LlNhbmRib3hdOiB7IFtBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24gfSB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMscUNBQXFDLDRDQUE4RCx5QkFBeUI7QUFDckksU0FBUyxtREFBbUQ7QUFDNUQsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUywrQkFBK0Q7QUFDeEUsU0FBUywyQkFBMkIsMkJBQTJCO0FBQy9ELFNBQVMsa0JBQWtCO0FBSTNCLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsMEJBQTBCLDZCQUE2QjtBQUNoRSxTQUFTLGlDQUFpQztBQUkxQyxNQUFNLG9CQUFvQjtBQUFBLEVBQTFCO0FBR0MsU0FBZ0IsV0FBVztBQUMzQixTQUFPLGFBQXNHLENBQUM7QUFHOUcsU0FBaUIsd0JBQXdCLElBQUksUUFBbUI7QUFFaEUsU0FBUyxhQUE0QyxNQUFNO0FBQzFELFlBQU0sT0FBTztBQUNiLGFBQU87QUFBQSxRQUNOLElBQUksUUFBUTtBQUFFLGlCQUFPLEtBQUs7QUFBQSxRQUFpQjtBQUFBLFFBQzNDLElBQUksZ0JBQWdCO0FBQUUsaUJBQU8sS0FBSztBQUFBLFFBQWlCO0FBQUEsUUFDbkQsYUFBYSxLQUFLLHNCQUFzQjtBQUFBLFFBQ3hDLG1CQUFtQixNQUFNO0FBQUEsUUFDekIsa0JBQWtCLE1BQU07QUFBQSxNQUN6QjtBQUFBLElBQ0QsR0FBRztBQUVILFNBQVMsY0FBcUMsTUFBTTtBQUNwRCxTQUFTLG9CQUEwQyxNQUFNO0FBQUE7QUFBQSxFQUV6RCxTQUFTLFVBQWtCLFFBQW1HO0FBQzdILFNBQUssV0FB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
