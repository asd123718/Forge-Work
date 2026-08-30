import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { URI } from "../../../../../../base/common/uri.js";
import { CommandsRegistry } from "../../../../../../platform/commands/common/commands.js";
import { isIMenuItem, MenuId, MenuRegistry } from "../../../../../../platform/actions/common/actions.js";
import { Extensions as JSONExtensions } from "../../../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { NullLogService, ILogService } from "../../../../../../platform/log/common/log.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { SessionLifecycle, SessionStatus } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import {
  agentSessionSettingsUri,
  AGENT_SESSION_SETTINGS_SCHEME,
  AgentSessionSettingsFileSystemProvider,
  AgentSessionSettingsSchemaRegistrar
} from "../../../browser/agentSessions/agentHost/agentSessionSettingsFileSystemProvider.js";
import "../../../browser/agentSessions/agentHost/agentSessionSettings.contribution.js";
const CHAT_SESSION_RESOURCE = URI.from({ scheme: "agent-host-copilotcli", path: "/abc-123" });
const BACKEND_SESSION = URI.from({ scheme: "copilotcli", path: "/abc-123" });
class FakeSessionSubscription {
  constructor() {
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this.onWillApplyAction = Event.None;
    this.onDidApplyAction = Event.None;
  }
  get value() {
    return this._value;
  }
  get verifiedValue() {
    return this._value instanceof Error ? void 0 : this._value;
  }
  setState(state) {
    this._value = state;
    if (!(state instanceof Error)) {
      this._onDidChange.fire(state);
    }
  }
  applyReplace(config) {
    if (!this._value || this._value instanceof Error || !this._value.config) {
      return;
    }
    this._value = { ...this._value, config: { ...this._value.config, values: { ...config } } };
    this._onDidChange.fire(this._value);
  }
  dispose() {
    this._onDidChange.dispose();
  }
}
class MockAgentHostService extends mock() {
  constructor() {
    super(...arguments);
    this.onAgentHostStart = Event.None;
    this.onAgentHostExit = Event.None;
    this.onDidAction = Event.None;
    this.onDidNotification = Event.None;
    this.dispatchedActions = [];
    this._subs = /* @__PURE__ */ new Map();
  }
  _entry(resource) {
    const key = resource.toString();
    let entry = this._subs.get(key);
    if (!entry) {
      entry = { sub: new FakeSessionSubscription(), acquireCount: 0, disposeCount: 0 };
      this._subs.set(key, entry);
    }
    return entry;
  }
  getSubscription(_kind, resource, _owner) {
    const entry = this._entry(resource);
    entry.acquireCount++;
    return {
      object: entry.sub,
      dispose: () => {
        entry.disposeCount++;
      }
    };
  }
  getSubscriptionUnmanaged(_kind, resource) {
    const entry = this._subs.get(resource.toString());
    return entry?.sub;
  }
  dispatch(channel, action) {
    this.dispatchedActions.push({ channel, action });
    const entry = this._subs.get(channel);
    if (entry && action.type === ActionType.SessionConfigChanged) {
      entry.sub.applyReplace(action.config);
    }
  }
  setSessionState(resource, state) {
    this._entry(resource).sub.setState(state);
  }
  acquireCount(resource) {
    return this._subs.get(resource.toString())?.acquireCount ?? 0;
  }
  disposeCount(resource) {
    return this._subs.get(resource.toString())?.disposeCount ?? 0;
  }
  dispose() {
    for (const entry of this._subs.values()) {
      entry.sub.dispose();
    }
  }
}
function makeSessionState(properties, values = {}) {
  return {
    provider: "copilotcli",
    title: "Test session",
    status: SessionStatus.Idle,
    lifecycle: SessionLifecycle.Ready,
    activeClients: [],
    chats: [],
    config: {
      schema: { type: "object", properties },
      values
    }
  };
}
function readJson(buf) {
  const text = VSBuffer.wrap(buf).toString();
  return JSON.parse(text.substring(text.indexOf("{")));
}
function createPolicyRestrictedConfigurationService() {
  return new class extends TestConfigurationService {
    inspect(key) {
      const base = super.inspect(key);
      if (key === "chat.tools.global.autoApprove") {
        return { ...base, policyValue: false };
      }
      return base;
    }
  }();
}
suite("AgentSessionSettingsFileSystemProvider (editor-window per-session adapter)", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createHarness(initialState, configurationService = new TestConfigurationService()) {
    const agentHostService = new MockAgentHostService();
    store.add({ dispose: () => agentHostService.dispose() });
    if (initialState) {
      agentHostService.setSessionState(BACKEND_SESSION, initialState);
    }
    const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
      [IAgentHostService, agentHostService],
      [IConfigurationService, configurationService],
      [ILogService, new NullLogService()]
    )));
    const schemaRegistrar = store.add(instantiationService.createInstance(AgentSessionSettingsSchemaRegistrar));
    const fs = store.add(instantiationService.createInstance(AgentSessionSettingsFileSystemProvider, schemaRegistrar));
    return { fs, agentHostService, uri: agentSessionSettingsUri(BACKEND_SESSION) };
  }
  test("URI routing: encodes and round-trips the backend session URI", () => {
    const uri = agentSessionSettingsUri(BACKEND_SESSION);
    assert.strictEqual(uri.scheme, AGENT_SESSION_SETTINGS_SCHEME);
    assert.strictEqual(uri.authority, "copilotcli");
    assert.strictEqual(uri.path, "/abc-123.jsonc");
  });
  test("readFile filters to session-mutable, non-readOnly properties", async () => {
    const { fs, uri } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
      isolation: { type: "string", title: "Isolation", enum: ["worktree"] },
      // non-mutable — omitted
      branch: { type: "string", title: "Branch", sessionMutable: true, readOnly: true, enum: ["main"] }
      // readOnly — omitted
    }, { autoApprove: "default", isolation: "worktree", branch: "main" }));
    const parsed = readJson(await fs.readFile(uri));
    assert.deepStrictEqual(parsed, { autoApprove: "default" });
  });
  test("readFile before any session state has arrived returns an empty document", async () => {
    const { fs, uri } = createHarness();
    assert.deepStrictEqual(readJson(await fs.readFile(uri)), {});
  });
  test("writeFile with invalid JSON throws", async () => {
    const { fs, uri } = createHarness(makeSessionState({}, {}));
    await assert.rejects(async () => {
      await fs.writeFile(uri, VSBuffer.fromString("{ not json").buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    });
  });
  test("writeFile dispatches SessionConfigChanged with replace:true to the backend session channel", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const { channel, action } = agentHostService.dispatchedActions[0];
    assert.strictEqual(channel, BACKEND_SESSION.toString());
    assert.strictEqual(action.type, ActionType.SessionConfigChanged);
    assert.strictEqual(action.replace, true);
  });
  test("writeFile preserves non-editable values and clears an omitted editable value", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
      mode: { type: "string", title: "Mode", sessionMutable: true, enum: ["a", "b"] },
      isolation: { type: "string", title: "Isolation", enum: ["worktree"] },
      // non-mutable, must be preserved
      branch: { type: "string", title: "Branch", sessionMutable: true, readOnly: true, enum: ["main"] }
      // readOnly, must be preserved
    }, { autoApprove: "default", mode: "a", isolation: "worktree", branch: "main" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const action = agentHostService.dispatchedActions[0].action;
    assert.deepStrictEqual(action.config, { autoApprove: "autoApprove", isolation: "worktree", branch: "main" });
    assert.strictEqual(Object.hasOwn(action.config, "mode"), false);
  });
  test("writeFile clamps autoApprove to default when org policy disables global auto-approve", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove", "autopilot"] },
      mode: { type: "string", title: "Mode", sessionMutable: true, enum: ["a", "b"] }
    }, { autoApprove: "default", mode: "a" }), createPolicyRestrictedConfigurationService());
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autopilot", "mode": "b" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const action = agentHostService.dispatchedActions[0].action;
    assert.deepStrictEqual(action.config, { autoApprove: "default", mode: "b" });
  });
  test("writeFile passes autoApprove through unchanged when org policy does not restrict auto-approve", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove", "autopilot"] }
    }, { autoApprove: "default" }), new TestConfigurationService());
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autopilot" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const action = agentHostService.dispatchedActions[0].action;
    assert.deepStrictEqual(action.config, { autoApprove: "autopilot" });
  });
  test("writeFile does not dispatch when the only requested change is clamped away by policy", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove", "autopilot"] }
    }, { autoApprove: "default" }), createPolicyRestrictedConfigurationService());
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("writeFile with structurally unchanged values does not dispatch", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("writeFile when no session state has arrived yet is a no-op", async () => {
    const { fs, uri, agentHostService } = createHarness();
    const events = [];
    store.add(fs.onDidChangeFile((changes) => {
      for (const c of changes) {
        events.push(c.resource);
      }
    }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
    assert.strictEqual(events.length, 1);
  });
  test("readFile reflects the live subscription's optimistic value after a replace dispatch", async () => {
    const { fs, uri } = createHarness(makeSessionState({
      autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(readJson(await fs.readFile(uri)), { autoApprove: "autoApprove" });
  });
  test("onDidChangeFile fires when the backend session publishes new state while watched", async () => {
    const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));
    const events = [];
    const listeners = new DisposableStore();
    store.add(listeners);
    listeners.add(fs.onDidChangeFile((changes) => {
      for (const c of changes) {
        events.push(c.resource);
      }
    }));
    listeners.add(fs.watch(uri, { recursive: false, excludes: [] }));
    agentHostService.setSessionState(BACKEND_SESSION, makeSessionState({}, { autoApprove: "default" }));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].toString(), uri.toString());
  });
  test("session state error leaves config unavailable (empty document, write ignored)", async () => {
    const { fs, uri, agentHostService } = createHarness(new Error("session disconnected"));
    assert.deepStrictEqual(readJson(await fs.readFile(uri)), {});
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  suite("subscription lifecycle", () => {
    test("readFile acquires and releases its own scoped reference", async () => {
      const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));
      await fs.readFile(uri);
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 1);
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1, "the reference acquired for readFile is released once the call completes");
    });
    test("stat and writeFile also acquire and release their own scoped reference", async () => {
      const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));
      await fs.stat(uri);
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 1);
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1);
      await fs.writeFile(uri, VSBuffer.fromString("{}\n").buffer, { create: false, overwrite: true, unlock: false, atomic: false });
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 2);
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 2);
    });
    test("watch acquires its own reference and holds it until disposed", () => {
      const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));
      const watch1 = fs.watch(uri, { recursive: false, excludes: [] });
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 1);
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 0);
      watch1.dispose();
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1);
    });
    test("multiple watches each acquire and release their own reference independently", () => {
      const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));
      const watch1 = fs.watch(uri, { recursive: false, excludes: [] });
      const watch2 = fs.watch(uri, { recursive: false, excludes: [] });
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 2);
      watch1.dispose();
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1, "disposing one watch releases only its own reference");
      watch2.dispose();
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 2, "disposing the second watch releases its own reference too");
    });
    test("readFile while a watch is active releases only its own reference, leaving the watch's reference held", async () => {
      const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));
      const watch = fs.watch(uri, { recursive: false, excludes: [] });
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 1);
      await fs.readFile(uri);
      assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 2);
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1, "readFile released its own reference; the watch reference is still held");
      watch.dispose();
      assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 2);
    });
  });
  suite("schema registration", () => {
    const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
    const schemaId = `vscode://schemas/agent-session-settings/copilotcli/abc-123.jsonc`;
    test("readFile lazily registers a schema + association", async () => {
      const { fs, uri } = createHarness(makeSessionState({
        autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default"] }
      }, { autoApprove: "default" }));
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
      await fs.readFile(uri);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
      assert.deepStrictEqual(schemaRegistry.getSchemaAssociations()[schemaId], [uri.toString()]);
    });
    test("schema is refreshed on the next read after session state changes with a new schema identity", async () => {
      const { fs, uri, agentHostService } = createHarness(makeSessionState({
        autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default"] }
      }, { autoApprove: "default" }));
      await fs.readFile(uri);
      const initial = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.ok(initial);
      agentHostService.setSessionState(BACKEND_SESSION, makeSessionState({
        autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
        mode: { type: "string", title: "Mode", sessionMutable: true, enum: ["a", "b"] }
      }, { autoApprove: "default", mode: "a" }));
      await fs.readFile(uri);
      const refreshed = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.notStrictEqual(refreshed, initial);
      assert.ok(refreshed.properties?.["mode"], "refreshed schema should include the newly added property");
    });
    test("schema is disposed when the filesystem provider is disposed", async () => {
      const agentHostService = new MockAgentHostService();
      store.add({ dispose: () => agentHostService.dispose() });
      agentHostService.setSessionState(BACKEND_SESSION, makeSessionState({
        autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default"] }
      }, { autoApprove: "default" }));
      const instantiationService = new TestInstantiationService(new ServiceCollection(
        [IAgentHostService, agentHostService],
        [IConfigurationService, new TestConfigurationService()],
        [ILogService, new NullLogService()]
      ));
      const schemaRegistrar = instantiationService.createInstance(AgentSessionSettingsSchemaRegistrar);
      const fs = instantiationService.createInstance(AgentSessionSettingsFileSystemProvider, schemaRegistrar);
      const uri = agentSessionSettingsUri(BACKEND_SESSION);
      await fs.readFile(uri);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
      fs.dispose();
      schemaRegistrar.dispose();
      instantiationService.dispose();
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
    });
  });
});
suite("workbench.action.chat.openAgentSessionSettings", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const ACTION_ID = "workbench.action.chat.openAgentSessionSettings";
  function evalWhen(when, values) {
    assert.ok(when, "expected a when clause");
    return when.evaluate({ getValue: (key) => values[key] });
  }
  test("is NOT registered in the Command Palette (context-menu-only)", () => {
    const item = MenuRegistry.getMenuItems(MenuId.CommandPalette).find((i) => isIMenuItem(i) && i.command.id === ACTION_ID);
    assert.strictEqual(item, void 0);
  });
  test("appears in the local agent-host session context menu, not for remote or non-agent-host sessions", () => {
    const item = MenuRegistry.getMenuItems(MenuId.AgentSessionsContext).find((i) => isIMenuItem(i) && i.command.id === ACTION_ID);
    assert.ok(item, "agent sessions context menu item is registered");
    const base = { [ChatContextKeys.enabled.key]: true, [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true };
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: "agent-host-copilotcli" }), true);
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: "remote-copilotcli" }), false);
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: "copilotcli" }), false);
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.enabled.key]: false, [ChatContextKeys.agentSessionType.key]: "agent-host-copilotcli" }), false);
  });
  function makeAgentSession(resource) {
    return {
      resource,
      isArchived: () => false,
      setArchived: () => {
      },
      isPinned: () => false,
      setPinned: () => {
      },
      isRead: () => true,
      isMarkedUnread: () => false,
      setRead: () => {
      }
    };
  }
  async function invokeWithContext(context) {
    const command = CommandsRegistry.getCommand(ACTION_ID);
    assert.ok(command, "command is registered");
    const opened = [];
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IEditorService, new class extends mock() {
      async openEditor(...args) {
        const editor = args[0];
        opened.push({ resource: editor.resource, pinned: editor.options?.pinned });
        return void 0;
      }
    }());
    await instantiationService.invokeFunction((accessor) => command.handler(accessor, context));
    return opened;
  }
  test("run() with a direct IAgentSession opens the routed session settings resource pinned", async () => {
    const session = makeAgentSession(CHAT_SESSION_RESOURCE);
    const opened = await invokeWithContext(session);
    assert.deepStrictEqual(opened, [{ resource: agentSessionSettingsUri(BACKEND_SESSION), pinned: true }]);
  });
  test("run() with a marshalled agent-session context routes via context.session, ignoring context.sessions", async () => {
    const session = makeAgentSession(CHAT_SESSION_RESOURCE);
    const otherSession = makeAgentSession(URI.from({ scheme: "agent-host-copilotcli", path: "/other" }));
    const marshalled = {
      $mid: MarshalledId.AgentSessionContext,
      session,
      sessions: [session, otherSession]
    };
    const opened = await invokeWithContext(marshalled);
    assert.deepStrictEqual(opened, [{ resource: agentSessionSettingsUri(BACKEND_SESSION), pinned: true }]);
  });
  test("run() with no context does not open anything (no last-focused-session inference)", async () => {
    const opened = await invokeWithContext(void 0);
    assert.deepStrictEqual(opened, []);
  });
  test("run() with a non-agent-host session resource does not open anything", async () => {
    const session = makeAgentSession(URI.from({ scheme: "somethingElse", path: "/x" }));
    const opened = await invokeWithContext(session);
    assert.deepStrictEqual(opened, []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvblNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgaXNJTWVudUl0ZW0sIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCB0eXBlIElNZW51SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgdHlwZSBDb250ZXh0S2V5RXhwcmVzc2lvbiwgdHlwZSBDb250ZXh0S2V5VmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgSlNPTkV4dGVuc2lvbnMsIElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlLCBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfRU5BQkxFRF9DT05URVhUX0tFWSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24sIElOb3RpZmljYXRpb24sIFNlc3Npb25BY3Rpb24sIFRlcm1pbmFsQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTdGF0ZUNvbXBvbmVudHMsIHR5cGUgQ29tcG9uZW50VG9TdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkxpZmVjeWNsZSwgU2Vzc2lvblN0YXR1cywgdHlwZSBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIHR5cGUgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb24sIElNYXJzaGFsbGVkQWdlbnRTZXNzaW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHtcblx0YWdlbnRTZXNzaW9uU2V0dGluZ3NVcmksXG5cdEFHRU5UX1NFU1NJT05fU0VUVElOR1NfU0NIRU1FLFxuXHRBZ2VudFNlc3Npb25TZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlcixcblx0QWdlbnRTZXNzaW9uU2V0dGluZ3NTY2hlbWFSZWdpc3RyYXIsXG59IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRTZXNzaW9uU2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50U2Vzc2lvblNldHRpbmdzLmNvbnRyaWJ1dGlvbi5qcyc7XG5cbmNvbnN0IENIQVRfU0VTU0lPTl9SRVNPVVJDRSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJywgcGF0aDogJy9hYmMtMTIzJyB9KTtcbmNvbnN0IEJBQ0tFTkRfU0VTU0lPTiA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdGNsaScsIHBhdGg6ICcvYWJjLTEyMycgfSk7XG5cbmNsYXNzIEZha2VTZXNzaW9uU3Vic2NyaXB0aW9uIGltcGxlbWVudHMgSUFnZW50U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8U2Vzc2lvblN0YXRlPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXHRyZWFkb25seSBvbldpbGxBcHBseUFjdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQXBwbHlBY3Rpb24gPSBFdmVudC5Ob25lO1xuXG5cdHByaXZhdGUgX3ZhbHVlOiBTZXNzaW9uU3RhdGUgfCBFcnJvciB8IHVuZGVmaW5lZDtcblxuXHRnZXQgdmFsdWUoKTogU2Vzc2lvblN0YXRlIHwgRXJyb3IgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fdmFsdWU7IH1cblx0Z2V0IHZlcmlmaWVkVmFsdWUoKTogU2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3ZhbHVlIGluc3RhbmNlb2YgRXJyb3IgPyB1bmRlZmluZWQgOiB0aGlzLl92YWx1ZTsgfVxuXG5cdHNldFN0YXRlKHN0YXRlOiBTZXNzaW9uU3RhdGUgfCBFcnJvcik6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbHVlID0gc3RhdGU7XG5cdFx0aWYgKCEoc3RhdGUgaW5zdGFuY2VvZiBFcnJvcikpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoc3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdGFwcGx5UmVwbGFjZShjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl92YWx1ZSB8fCB0aGlzLl92YWx1ZSBpbnN0YW5jZW9mIEVycm9yIHx8ICF0aGlzLl92YWx1ZS5jb25maWcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdmFsdWUgPSB7IC4uLnRoaXMuX3ZhbHVlLCBjb25maWc6IHsgLi4udGhpcy5fdmFsdWUuY29uZmlnLCB2YWx1ZXM6IHsgLi4uY29uZmlnIH0gfSB9O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodGhpcy5fdmFsdWUpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElTdWJzY3JpcHRpb25FbnRyeSB7XG5cdHJlYWRvbmx5IHN1YjogRmFrZVNlc3Npb25TdWJzY3JpcHRpb247XG5cdGFjcXVpcmVDb3VudDogbnVtYmVyO1xuXHRkaXNwb3NlQ291bnQ6IG51bWJlcjtcbn1cblxuY2xhc3MgTW9ja0FnZW50SG9zdFNlcnZpY2UgZXh0ZW5kcyBtb2NrPElBZ2VudEhvc3RTZXJ2aWNlPigpIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25BZ2VudEhvc3RTdGFydCA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uQWdlbnRIb3N0RXhpdCA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWN0aW9uID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWROb3RpZmljYXRpb246IEV2ZW50PElOb3RpZmljYXRpb24+ID0gRXZlbnQuTm9uZTtcblxuXHRyZWFkb25seSBkaXNwYXRjaGVkQWN0aW9uczogeyBjaGFubmVsOiBzdHJpbmc7IGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24gfVtdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3VicyA9IG5ldyBNYXA8c3RyaW5nLCBJU3Vic2NyaXB0aW9uRW50cnk+KCk7XG5cblx0cHJpdmF0ZSBfZW50cnkocmVzb3VyY2U6IFVSSSk6IElTdWJzY3JpcHRpb25FbnRyeSB7XG5cdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRsZXQgZW50cnkgPSB0aGlzLl9zdWJzLmdldChrZXkpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdGVudHJ5ID0geyBzdWI6IG5ldyBGYWtlU2Vzc2lvblN1YnNjcmlwdGlvbigpLCBhY3F1aXJlQ291bnQ6IDAsIGRpc3Bvc2VDb3VudDogMCB9O1xuXHRcdFx0dGhpcy5fc3Vicy5zZXQoa2V5LCBlbnRyeSk7XG5cdFx0fVxuXHRcdHJldHVybiBlbnRyeTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFN1YnNjcmlwdGlvbjxUIGV4dGVuZHMgU3RhdGVDb21wb25lbnRzPihfa2luZDogVCwgcmVzb3VyY2U6IFVSSSwgX293bmVyOiBzdHJpbmcpOiBJUmVmZXJlbmNlPElBZ2VudFN1YnNjcmlwdGlvbjxDb21wb25lbnRUb1N0YXRlW1RdPj4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZW50cnkocmVzb3VyY2UpO1xuXHRcdGVudHJ5LmFjcXVpcmVDb3VudCsrO1xuXHRcdHJldHVybiB7XG5cdFx0XHRvYmplY3Q6IGVudHJ5LnN1YiBhcyB1bmtub3duIGFzIElBZ2VudFN1YnNjcmlwdGlvbjxDb21wb25lbnRUb1N0YXRlW1RdPixcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgZW50cnkuZGlzcG9zZUNvdW50Kys7IH0sXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFN1YnNjcmlwdGlvblVubWFuYWdlZDxUIGV4dGVuZHMgU3RhdGVDb21wb25lbnRzPihfa2luZDogVCwgcmVzb3VyY2U6IFVSSSk6IElBZ2VudFN1YnNjcmlwdGlvbjxDb21wb25lbnRUb1N0YXRlW1RdPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zdWJzLmdldChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRyZXR1cm4gZW50cnk/LnN1YiBhcyB1bmtub3duIGFzIElBZ2VudFN1YnNjcmlwdGlvbjxDb21wb25lbnRUb1N0YXRlW1RdPiB8IHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3BhdGNoKGNoYW5uZWw6IHN0cmluZywgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuZGlzcGF0Y2hlZEFjdGlvbnMucHVzaCh7IGNoYW5uZWwsIGFjdGlvbiB9KTtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3N1YnMuZ2V0KGNoYW5uZWwpO1xuXHRcdGlmIChlbnRyeSAmJiBhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCkge1xuXHRcdFx0ZW50cnkuc3ViLmFwcGx5UmVwbGFjZSgoYWN0aW9uIGFzIHsgY29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9KS5jb25maWcpO1xuXHRcdH1cblx0fVxuXG5cdHNldFNlc3Npb25TdGF0ZShyZXNvdXJjZTogVVJJLCBzdGF0ZTogU2Vzc2lvblN0YXRlIHwgRXJyb3IpOiB2b2lkIHtcblx0XHR0aGlzLl9lbnRyeShyZXNvdXJjZSkuc3ViLnNldFN0YXRlKHN0YXRlKTtcblx0fVxuXG5cdGFjcXVpcmVDb3VudChyZXNvdXJjZTogVVJJKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc3Vicy5nZXQocmVzb3VyY2UudG9TdHJpbmcoKSk/LmFjcXVpcmVDb3VudCA/PyAwO1xuXHR9XG5cblx0ZGlzcG9zZUNvdW50KHJlc291cmNlOiBVUkkpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zdWJzLmdldChyZXNvdXJjZS50b1N0cmluZygpKT8uZGlzcG9zZUNvdW50ID8/IDA7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fc3Vicy52YWx1ZXMoKSkge1xuXHRcdFx0ZW50cnkuc3ViLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gbWFrZVNlc3Npb25TdGF0ZShwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWE+LCB2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge30pOiBTZXNzaW9uU3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0dGl0bGU6ICdUZXN0IHNlc3Npb24nLFxuXHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRjaGF0czogW10sXG5cdFx0Y29uZmlnOiB7XG5cdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXMgfSxcblx0XHRcdHZhbHVlcyxcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiByZWFkSnNvbihidWY6IFVpbnQ4QXJyYXkpOiB1bmtub3duIHtcblx0Y29uc3QgdGV4dCA9IFZTQnVmZmVyLndyYXAoYnVmKS50b1N0cmluZygpO1xuXHRyZXR1cm4gSlNPTi5wYXJzZSh0ZXh0LnN1YnN0cmluZyh0ZXh0LmluZGV4T2YoJ3snKSkpO1xufVxuXG4vKipcbiAqIEEge0BsaW5rIFRlc3RDb25maWd1cmF0aW9uU2VydmljZX0gd2hvc2UgYGNoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlYFxuICogcG9saWN5IHZhbHVlIGlzIHBpbm5lZCB0byBgZmFsc2VgLCBzaW11bGF0aW5nIGFuIG9yZ2FuaXphdGlvbiBwb2xpY3kgdGhhdFxuICogZGlzYWJsZXMgYXV0by1hcHByb3ZhbC4gTWlycm9ycyB0aGUgaWRlbnRpY2FsIGhlbHBlciBpblxuICogYHZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC90ZXN0L2Jyb3dzZXIvbG9jYWxBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLnRlc3QudHNgLlxuICovXG5mdW5jdGlvbiBjcmVhdGVQb2xpY3lSZXN0cmljdGVkQ29uZmlndXJhdGlvblNlcnZpY2UoKTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdFx0b3ZlcnJpZGUgaW5zcGVjdDxUPihrZXk6IHN0cmluZykge1xuXHRcdFx0Y29uc3QgYmFzZSA9IHN1cGVyLmluc3BlY3Q8VD4oa2V5KTtcblx0XHRcdGlmIChrZXkgPT09ICdjaGF0LnRvb2xzLmdsb2JhbC5hdXRvQXBwcm92ZScpIHtcblx0XHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwgcG9saWN5VmFsdWU6IGZhbHNlIGFzIHVua25vd24gYXMgVCB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGJhc2U7XG5cdFx0fVxuXHR9KCk7XG59XG5cbnN1aXRlKCdBZ2VudFNlc3Npb25TZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlciAoZWRpdG9yLXdpbmRvdyBwZXItc2Vzc2lvbiBhZGFwdGVyKScsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUhhcm5lc3MoaW5pdGlhbFN0YXRlPzogU2Vzc2lvblN0YXRlIHwgRXJyb3IsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpIHtcblx0XHRjb25zdCBhZ2VudEhvc3RTZXJ2aWNlID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0c3RvcmUuYWRkKHsgZGlzcG9zZTogKCkgPT4gYWdlbnRIb3N0U2VydmljZS5kaXNwb3NlKCkgfSk7XG5cdFx0aWYgKGluaXRpYWxTdGF0ZSkge1xuXHRcdFx0YWdlbnRIb3N0U2VydmljZS5zZXRTZXNzaW9uU3RhdGUoQkFDS0VORF9TRVNTSU9OLCBpbml0aWFsU3RhdGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lBZ2VudEhvc3RTZXJ2aWNlLCBhZ2VudEhvc3RTZXJ2aWNlXSxcblx0XHRcdFtJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlXSxcblx0XHRcdFtJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCldLFxuXHRcdCkpKTtcblxuXHRcdGNvbnN0IHNjaGVtYVJlZ2lzdHJhciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25TZXR0aW5nc1NjaGVtYVJlZ2lzdHJhcikpO1xuXHRcdGNvbnN0IGZzID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvblNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyLCBzY2hlbWFSZWdpc3RyYXIpKTtcblxuXHRcdHJldHVybiB7IGZzLCBhZ2VudEhvc3RTZXJ2aWNlLCB1cmk6IGFnZW50U2Vzc2lvblNldHRpbmdzVXJpKEJBQ0tFTkRfU0VTU0lPTikgfTtcblx0fVxuXG5cdHRlc3QoJ1VSSSByb3V0aW5nOiBlbmNvZGVzIGFuZCByb3VuZC10cmlwcyB0aGUgYmFja2VuZCBzZXNzaW9uIFVSSScsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBhZ2VudFNlc3Npb25TZXR0aW5nc1VyaShCQUNLRU5EX1NFU1NJT04pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkuc2NoZW1lLCBBR0VOVF9TRVNTSU9OX1NFVFRJTkdTX1NDSEVNRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5hdXRob3JpdHksICdjb3BpbG90Y2xpJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5wYXRoLCAnL2FiYy0xMjMuanNvbmMnKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgZmlsdGVycyB0byBzZXNzaW9uLW11dGFibGUsIG5vbi1yZWFkT25seSBwcm9wZXJ0aWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlU2Vzc2lvblN0YXRlKHtcblx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdFx0aXNvbGF0aW9uOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0lzb2xhdGlvbicsIGVudW06IFsnd29ya3RyZWUnXSB9LCAvLyBub24tbXV0YWJsZSBcdTIwMTQgb21pdHRlZFxuXHRcdFx0YnJhbmNoOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0JyYW5jaCcsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCByZWFkT25seTogdHJ1ZSwgZW51bTogWydtYWluJ10gfSwgLy8gcmVhZE9ubHkgXHUyMDE0IG9taXR0ZWRcblx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsIGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbicgfSkpO1xuXG5cdFx0Y29uc3QgcGFyc2VkID0gcmVhZEpzb24oYXdhaXQgZnMucmVhZEZpbGUodXJpKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQsIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgYmVmb3JlIGFueSBzZXNzaW9uIHN0YXRlIGhhcyBhcnJpdmVkIHJldHVybnMgYW4gZW1wdHkgZG9jdW1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpIH0gPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFkSnNvbihhd2FpdCBmcy5yZWFkRmlsZSh1cmkpKSwge30pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgd2l0aCBpbnZhbGlkIEpTT04gdGhyb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlU2Vzc2lvblN0YXRlKHt9LCB7fSkpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgbm90IGpzb24nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgZGlzcGF0Y2hlcyBTZXNzaW9uQ29uZmlnQ2hhbmdlZCB3aXRoIHJlcGxhY2U6dHJ1ZSB0byB0aGUgYmFja2VuZCBzZXNzaW9uIGNoYW5uZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VTZXNzaW9uU3RhdGUoe1xuXHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pKTtcblxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJhdXRvQXBwcm92ZVwiOiBcImF1dG9BcHByb3ZlXCIgfVxcbicpLmJ1ZmZlciwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHsgY2hhbm5lbCwgYWN0aW9uIH0gPSBhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFubmVsLCBCQUNLRU5EX1NFU1NJT04udG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi50eXBlLCBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGFjdGlvbiBhcyB7IHJlcGxhY2U/OiBib29sZWFuIH0pLnJlcGxhY2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgcHJlc2VydmVzIG5vbi1lZGl0YWJsZSB2YWx1ZXMgYW5kIGNsZWFycyBhbiBvbWl0dGVkIGVkaXRhYmxlIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlU2Vzc2lvblN0YXRlKHtcblx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdFx0bW9kZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdNb2RlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnYScsICdiJ10gfSxcblx0XHRcdGlzb2xhdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdJc29sYXRpb24nLCBlbnVtOiBbJ3dvcmt0cmVlJ10gfSwgLy8gbm9uLW11dGFibGUsIG11c3QgYmUgcHJlc2VydmVkXG5cdFx0XHRicmFuY2g6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQnJhbmNoJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIHJlYWRPbmx5OiB0cnVlLCBlbnVtOiBbJ21haW4nXSB9LCAvLyByZWFkT25seSwgbXVzdCBiZSBwcmVzZXJ2ZWRcblx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsIG1vZGU6ICdhJywgaXNvbGF0aW9uOiAnd29ya3RyZWUnLCBicmFuY2g6ICdtYWluJyB9KSk7XG5cblx0XHQvLyBPbWl0IGBtb2RlYCBlbnRpcmVseSBcdTIwMTQgaXQgc2hvdWxkIGJlIGNsZWFyZWQsIG5vdCBkZWZhdWx0ZWQuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImF1dG9BcHByb3ZlXCI6IFwiYXV0b0FwcHJvdmVcIiB9XFxuJykuYnVmZmVyLCB7IGNyZWF0ZTogZmFsc2UsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgYWN0aW9uID0gYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9uc1swXS5hY3Rpb24gYXMgeyBjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb24uY29uZmlnLCB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnLCBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3QuaGFzT3duKGFjdGlvbi5jb25maWcsICdtb2RlJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIGNsYW1wcyBhdXRvQXBwcm92ZSB0byBkZWZhdWx0IHdoZW4gb3JnIHBvbGljeSBkaXNhYmxlcyBnbG9iYWwgYXV0by1hcHByb3ZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlU2Vzc2lvblN0YXRlKHtcblx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnLCAnYXV0b3BpbG90J10gfSxcblx0XHRcdG1vZGU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnTW9kZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2EnLCAnYiddIH0sXG5cdFx0fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBtb2RlOiAnYScgfSksIGNyZWF0ZVBvbGljeVJlc3RyaWN0ZWRDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblxuXHRcdC8vIFRoZSB1c2VyIGVkaXRzIHRoZSBKU09OQyBkb2N1bWVudCBkaXJlY3RseSB0byByZXF1ZXN0IGFuIGVsZXZhdGVkXG5cdFx0Ly8gYXV0by1hcHByb3ZlIGxldmVsIGFuZCBhIHBsYWluLCB1bnJlc3RyaWN0ZWQgYG1vZGVgIGNoYW5nZS5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiYXV0b0FwcHJvdmVcIjogXCJhdXRvcGlsb3RcIiwgXCJtb2RlXCI6IFwiYlwiIH1cXG4nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBhY3Rpb24gPSBhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zWzBdLmFjdGlvbiBhcyB7IGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfTtcblx0XHQvLyBhdXRvQXBwcm92ZSBpcyBjbGFtcGVkIGJhY2sgdG8gJ2RlZmF1bHQnIGRlc3BpdGUgdGhlIHJlcXVlc3RlZCAnYXV0b3BpbG90JyB2YWx1ZTtcblx0XHQvLyB0aGUgdW5yZXN0cmljdGVkIGBtb2RlYCBwcm9wZXJ0eSBwYXNzZXMgdGhyb3VnaCB1bmNoYW5nZWQuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb24uY29uZmlnLCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsIG1vZGU6ICdiJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIHBhc3NlcyBhdXRvQXBwcm92ZSB0aHJvdWdoIHVuY2hhbmdlZCB3aGVuIG9yZyBwb2xpY3kgZG9lcyBub3QgcmVzdHJpY3QgYXV0by1hcHByb3ZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlU2Vzc2lvblN0YXRlKHtcblx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnLCAnYXV0b3BpbG90J10gfSxcblx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSksIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiYXV0b0FwcHJvdmVcIjogXCJhdXRvcGlsb3RcIiB9XFxuJykuYnVmZmVyLCB7IGNyZWF0ZTogZmFsc2UsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgYWN0aW9uID0gYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9uc1swXS5hY3Rpb24gYXMgeyBjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb24uY29uZmlnLCB7IGF1dG9BcHByb3ZlOiAnYXV0b3BpbG90JyB9KTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIGRvZXMgbm90IGRpc3BhdGNoIHdoZW4gdGhlIG9ubHkgcmVxdWVzdGVkIGNoYW5nZSBpcyBjbGFtcGVkIGF3YXkgYnkgcG9saWN5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlU2Vzc2lvblN0YXRlKHtcblx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnLCAnYXV0b3BpbG90J10gfSxcblx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSksIGNyZWF0ZVBvbGljeVJlc3RyaWN0ZWRDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblxuXHRcdC8vIEFscmVhZHkgJ2RlZmF1bHQnOyB0aGUgcmVxdWVzdGVkICdhdXRvQXBwcm92ZScgY2xhbXBzIHJpZ2h0IGJhY2sgdG9cblx0XHQvLyB0aGUgY3VycmVudCB2YWx1ZSwgc28gbm90aGluZyBoYXMgYWN0dWFsbHkgY2hhbmdlZC5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiYXV0b0FwcHJvdmVcIjogXCJhdXRvQXBwcm92ZVwiIH1cXG4nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zIGFzIHJlYWRvbmx5IHVua25vd25bXSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgd2l0aCBzdHJ1Y3R1cmFsbHkgdW5jaGFuZ2VkIHZhbHVlcyBkb2VzIG5vdCBkaXNwYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVNlc3Npb25TdGF0ZSh7XG5cdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSkpO1xuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImF1dG9BcHByb3ZlXCI6IFwiZGVmYXVsdFwiIH1cXG4nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zIGFzIHJlYWRvbmx5IHVua25vd25bXSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgd2hlbiBubyBzZXNzaW9uIHN0YXRlIGhhcyBhcnJpdmVkIHlldCBpcyBhIG5vLW9wJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcygpO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBVUklbXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChmcy5vbkRpZENoYW5nZUZpbGUoY2hhbmdlcyA9PiB7IGZvciAoY29uc3QgYyBvZiBjaGFuZ2VzKSB7IGV2ZW50cy5wdXNoKGMucmVzb3VyY2UpOyB9IH0pKTtcblxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJhdXRvQXBwcm92ZVwiOiBcImRlZmF1bHRcIiB9XFxuJykuYnVmZmVyLCB7IGNyZWF0ZTogZmFsc2UsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucyBhcyByZWFkb25seSB1bmtub3duW10sIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIHJlZmxlY3RzIHRoZSBsaXZlIHN1YnNjcmlwdGlvblxcJ3Mgb3B0aW1pc3RpYyB2YWx1ZSBhZnRlciBhIHJlcGxhY2UgZGlzcGF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VTZXNzaW9uU3RhdGUoe1xuXHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pKTtcblxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJhdXRvQXBwcm92ZVwiOiBcImF1dG9BcHByb3ZlXCIgfVxcbicpLmJ1ZmZlciwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRKc29uKGF3YWl0IGZzLnJlYWRGaWxlKHVyaSkpLCB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZUZpbGUgZmlyZXMgd2hlbiB0aGUgYmFja2VuZCBzZXNzaW9uIHB1Ymxpc2hlcyBuZXcgc3RhdGUgd2hpbGUgd2F0Y2hlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVNlc3Npb25TdGF0ZSh7fSwge30pKTtcblxuXHRcdGNvbnN0IGV2ZW50czogVVJJW10gPSBbXTtcblx0XHRjb25zdCBsaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKGxpc3RlbmVycyk7XG5cdFx0bGlzdGVuZXJzLmFkZChmcy5vbkRpZENoYW5nZUZpbGUoY2hhbmdlcyA9PiB7IGZvciAoY29uc3QgYyBvZiBjaGFuZ2VzKSB7IGV2ZW50cy5wdXNoKGMucmVzb3VyY2UpOyB9IH0pKTtcblx0XHRsaXN0ZW5lcnMuYWRkKGZzLndhdGNoKHVyaSwgeyByZWN1cnNpdmU6IGZhbHNlLCBleGNsdWRlczogW10gfSkpO1xuXG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRTZXNzaW9uU3RhdGUoQkFDS0VORF9TRVNTSU9OLCBtYWtlU2Vzc2lvblN0YXRlKHt9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMF0udG9TdHJpbmcoKSwgdXJpLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uIHN0YXRlIGVycm9yIGxlYXZlcyBjb25maWcgdW5hdmFpbGFibGUgKGVtcHR5IGRvY3VtZW50LCB3cml0ZSBpZ25vcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobmV3IEVycm9yKCdzZXNzaW9uIGRpc2Nvbm5lY3RlZCcpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVhZEpzb24oYXdhaXQgZnMucmVhZEZpbGUodXJpKSksIHt9KTtcblxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJhdXRvQXBwcm92ZVwiOiBcImRlZmF1bHRcIiB9XFxuJykuYnVmZmVyLCB7IGNyZWF0ZTogZmFsc2UsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMgYXMgcmVhZG9ubHkgdW5rbm93bltdLCBbXSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzdWJzY3JpcHRpb24gbGlmZWN5Y2xlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVhZEZpbGUgYWNxdWlyZXMgYW5kIHJlbGVhc2VzIGl0cyBvd24gc2NvcGVkIHJlZmVyZW5jZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlU2Vzc2lvblN0YXRlKHt9LCB7fSkpO1xuXG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5hY3F1aXJlQ291bnQoQkFDS0VORF9TRVNTSU9OKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwb3NlQ291bnQoQkFDS0VORF9TRVNTSU9OKSwgMSwgJ3RoZSByZWZlcmVuY2UgYWNxdWlyZWQgZm9yIHJlYWRGaWxlIGlzIHJlbGVhc2VkIG9uY2UgdGhlIGNhbGwgY29tcGxldGVzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdGF0IGFuZCB3cml0ZUZpbGUgYWxzbyBhY3F1aXJlIGFuZCByZWxlYXNlIHRoZWlyIG93biBzY29wZWQgcmVmZXJlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VTZXNzaW9uU3RhdGUoe30sIHt9KSk7XG5cblx0XHRcdGF3YWl0IGZzLnN0YXQodXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmFjcXVpcmVDb3VudChCQUNLRU5EX1NFU1NJT04pLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3Bvc2VDb3VudChCQUNLRU5EX1NFU1NJT04pLCAxKTtcblxuXHRcdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygne31cXG4nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuYWNxdWlyZUNvdW50KEJBQ0tFTkRfU0VTU0lPTiksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcG9zZUNvdW50KEJBQ0tFTkRfU0VTU0lPTiksIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2F0Y2ggYWNxdWlyZXMgaXRzIG93biByZWZlcmVuY2UgYW5kIGhvbGRzIGl0IHVudGlsIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VTZXNzaW9uU3RhdGUoe30sIHt9KSk7XG5cblx0XHRcdGNvbnN0IHdhdGNoMSA9IGZzLndhdGNoKHVyaSwgeyByZWN1cnNpdmU6IGZhbHNlLCBleGNsdWRlczogW10gfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5hY3F1aXJlQ291bnQoQkFDS0VORF9TRVNTSU9OKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwb3NlQ291bnQoQkFDS0VORF9TRVNTSU9OKSwgMCk7XG5cblx0XHRcdHdhdGNoMS5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwb3NlQ291bnQoQkFDS0VORF9TRVNTSU9OKSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSB3YXRjaGVzIGVhY2ggYWNxdWlyZSBhbmQgcmVsZWFzZSB0aGVpciBvd24gcmVmZXJlbmNlIGluZGVwZW5kZW50bHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVNlc3Npb25TdGF0ZSh7fSwge30pKTtcblxuXHRcdFx0Y29uc3Qgd2F0Y2gxID0gZnMud2F0Y2godXJpLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KTtcblx0XHRcdGNvbnN0IHdhdGNoMiA9IGZzLndhdGNoKHVyaSwgeyByZWN1cnNpdmU6IGZhbHNlLCBleGNsdWRlczogW10gfSk7XG5cblx0XHRcdC8vIEV2ZXJ5IHJlc29sdXRpb24gYWNxdWlyZXMgaXRzIG93biByZWZlcmVuY2UgXHUyMDE0IHRoZSBwcm92aWRlciBrZWVwc1xuXHRcdFx0Ly8gbm8gY2FjaGUvcmVmY291bnQgbWFwOyB0aGUgdW5kZXJseWluZyBJQWdlbnRIb3N0U2VydmljZSBpc1xuXHRcdFx0Ly8gcmVzcG9uc2libGUgZm9yIGRlZHVwaW5nL3JlZmNvdW50aW5nIGEgc2hhcmVkIHN1YnNjcmlwdGlvbi5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmFjcXVpcmVDb3VudChCQUNLRU5EX1NFU1NJT04pLCAyKTtcblxuXHRcdFx0d2F0Y2gxLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3Bvc2VDb3VudChCQUNLRU5EX1NFU1NJT04pLCAxLCAnZGlzcG9zaW5nIG9uZSB3YXRjaCByZWxlYXNlcyBvbmx5IGl0cyBvd24gcmVmZXJlbmNlJyk7XG5cblx0XHRcdHdhdGNoMi5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwb3NlQ291bnQoQkFDS0VORF9TRVNTSU9OKSwgMiwgJ2Rpc3Bvc2luZyB0aGUgc2Vjb25kIHdhdGNoIHJlbGVhc2VzIGl0cyBvd24gcmVmZXJlbmNlIHRvbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZEZpbGUgd2hpbGUgYSB3YXRjaCBpcyBhY3RpdmUgcmVsZWFzZXMgb25seSBpdHMgb3duIHJlZmVyZW5jZSwgbGVhdmluZyB0aGUgd2F0Y2hcXCdzIHJlZmVyZW5jZSBoZWxkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VTZXNzaW9uU3RhdGUoe30sIHt9KSk7XG5cblx0XHRcdGNvbnN0IHdhdGNoID0gZnMud2F0Y2godXJpLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmFjcXVpcmVDb3VudChCQUNLRU5EX1NFU1NJT04pLCAxKTtcblxuXHRcdFx0YXdhaXQgZnMucmVhZEZpbGUodXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmFjcXVpcmVDb3VudChCQUNLRU5EX1NFU1NJT04pLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3Bvc2VDb3VudChCQUNLRU5EX1NFU1NJT04pLCAxLCAncmVhZEZpbGUgcmVsZWFzZWQgaXRzIG93biByZWZlcmVuY2U7IHRoZSB3YXRjaCByZWZlcmVuY2UgaXMgc3RpbGwgaGVsZCcpO1xuXG5cdFx0XHR3YXRjaC5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwb3NlQ291bnQoQkFDS0VORF9TRVNTSU9OKSwgMik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzY2hlbWEgcmVnaXN0cmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNjaGVtYVJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUpTT05Db250cmlidXRpb25SZWdpc3RyeT4oSlNPTkV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5cdFx0Y29uc3Qgc2NoZW1hSWQgPSBgdnNjb2RlOi8vc2NoZW1hcy9hZ2VudC1zZXNzaW9uLXNldHRpbmdzL2NvcGlsb3RjbGkvYWJjLTEyMy5qc29uY2A7XG5cblx0XHR0ZXN0KCdyZWFkRmlsZSBsYXppbHkgcmVnaXN0ZXJzIGEgc2NoZW1hICsgYXNzb2NpYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZzLCB1cmkgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVNlc3Npb25TdGF0ZSh7XG5cdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnXSB9LFxuXHRcdFx0fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5Lmhhc1NjaGVtYUNvbnRlbnQoc2NoZW1hSWQpLCBmYWxzZSk7XG5cblx0XHRcdGF3YWl0IGZzLnJlYWRGaWxlKHVyaSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2hlbWFSZWdpc3RyeS5oYXNTY2hlbWFDb250ZW50KHNjaGVtYUlkKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5LmdldFNjaGVtYUFzc29jaWF0aW9ucygpW3NjaGVtYUlkXSwgW3VyaS50b1N0cmluZygpXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzY2hlbWEgaXMgcmVmcmVzaGVkIG9uIHRoZSBuZXh0IHJlYWQgYWZ0ZXIgc2Vzc2lvbiBzdGF0ZSBjaGFuZ2VzIHdpdGggYSBuZXcgc2NoZW1hIGlkZW50aXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVW5saWtlIHRoZSBhbWJpZW50IGhvc3QgcmVnaXN0cmFyLCB0aGUgcGVyLXNlc3Npb24gcmVnaXN0cmFyXG5cdFx0XHQvLyBkb2VzIG5vdCBob2xkIGl0cyBvd24gc3Vic2NyaXB0aW9uL2xpc3RlbmVyIChieSBkZXNpZ24gXHUyMDE0IHNlZVxuXHRcdFx0Ly8gYWdlbnRTZXNzaW9uU2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIudHMpOyBpdCByZWZyZXNoZXNcblx0XHRcdC8vIGxhemlseSB3aGVuZXZlciBgcmVhZEZpbGVgIG5leHQgY2FsbHMgYGVuc3VyZVJlZ2lzdGVyZWRgLFxuXHRcdFx0Ly8gd2hpY2ggaXMgYWxzbyBob3cgYSByZWFsIG9wZW4gZWRpdG9yIHBpY2tzIHVwIGEgY2hhbmdlIChpdFxuXHRcdFx0Ly8gcmUtcmVhZHMgYWZ0ZXIgdGhlIGZpbGVzeXN0ZW0gcHJvdmlkZXIncyBgb25EaWRDaGFuZ2VGaWxlYCkuXG5cdFx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVNlc3Npb25TdGF0ZSh7XG5cdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnXSB9LFxuXHRcdFx0fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pKTtcblxuXHRcdFx0YXdhaXQgZnMucmVhZEZpbGUodXJpKTtcblx0XHRcdGNvbnN0IGluaXRpYWwgPSBzY2hlbWFSZWdpc3RyeS5nZXRTY2hlbWFDb250cmlidXRpb25zKCkuc2NoZW1hc1tzY2hlbWFJZF07XG5cdFx0XHRhc3NlcnQub2soaW5pdGlhbCk7XG5cblx0XHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0U2Vzc2lvblN0YXRlKEJBQ0tFTkRfU0VTU0lPTiwgbWFrZVNlc3Npb25TdGF0ZSh7XG5cdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdFx0XHRtb2RlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ01vZGUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydhJywgJ2InXSB9LFxuXHRcdFx0fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBtb2RlOiAnYScgfSkpO1xuXG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXG5cdFx0XHRjb25zdCByZWZyZXNoZWQgPSBzY2hlbWFSZWdpc3RyeS5nZXRTY2hlbWFDb250cmlidXRpb25zKCkuc2NoZW1hc1tzY2hlbWFJZF07XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocmVmcmVzaGVkLCBpbml0aWFsKTtcblx0XHRcdGFzc2VydC5vayhyZWZyZXNoZWQucHJvcGVydGllcz8uWydtb2RlJ10sICdyZWZyZXNoZWQgc2NoZW1hIHNob3VsZCBpbmNsdWRlIHRoZSBuZXdseSBhZGRlZCBwcm9wZXJ0eScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NoZW1hIGlzIGRpc3Bvc2VkIHdoZW4gdGhlIGZpbGVzeXN0ZW0gcHJvdmlkZXIgaXMgZGlzcG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudEhvc3RTZXJ2aWNlID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0XHRzdG9yZS5hZGQoeyBkaXNwb3NlOiAoKSA9PiBhZ2VudEhvc3RTZXJ2aWNlLmRpc3Bvc2UoKSB9KTtcblx0XHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0U2Vzc2lvblN0YXRlKEJBQ0tFTkRfU0VTU0lPTiwgbWFrZVNlc3Npb25TdGF0ZSh7XG5cdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnXSB9LFxuXHRcdFx0fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pKTtcblxuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFx0W0lBZ2VudEhvc3RTZXJ2aWNlLCBhZ2VudEhvc3RTZXJ2aWNlXSxcblx0XHRcdFx0W0lDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpXSxcblx0XHRcdFx0W0lMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKV0sXG5cdFx0XHQpKTtcblx0XHRcdGNvbnN0IHNjaGVtYVJlZ2lzdHJhciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvblNldHRpbmdzU2NoZW1hUmVnaXN0cmFyKTtcblx0XHRcdGNvbnN0IGZzID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uU2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIsIHNjaGVtYVJlZ2lzdHJhcik7XG5cblx0XHRcdGNvbnN0IHVyaSA9IGFnZW50U2Vzc2lvblNldHRpbmdzVXJpKEJBQ0tFTkRfU0VTU0lPTik7XG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5Lmhhc1NjaGVtYUNvbnRlbnQoc2NoZW1hSWQpLCB0cnVlKTtcblxuXHRcdFx0ZnMuZGlzcG9zZSgpO1xuXHRcdFx0c2NoZW1hUmVnaXN0cmFyLmRpc3Bvc2UoKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5Lmhhc1NjaGVtYUNvbnRlbnQoc2NoZW1hSWQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlbkFnZW50U2Vzc2lvblNldHRpbmdzJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuQWdlbnRTZXNzaW9uU2V0dGluZ3MnO1xuXG5cdGZ1bmN0aW9uIGV2YWxXaGVuKHdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkLCB2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIENvbnRleHRLZXlWYWx1ZT4pOiBib29sZWFuIHtcblx0XHRhc3NlcnQub2sod2hlbiwgJ2V4cGVjdGVkIGEgd2hlbiBjbGF1c2UnKTtcblx0XHRyZXR1cm4gd2hlbi5ldmFsdWF0ZSh7IGdldFZhbHVlOiA8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZSA9IENvbnRleHRLZXlWYWx1ZT4oa2V5OiBzdHJpbmcpID0+IHZhbHVlc1trZXldIGFzIFQgfSk7XG5cdH1cblxuXHR0ZXN0KCdpcyBOT1QgcmVnaXN0ZXJlZCBpbiB0aGUgQ29tbWFuZCBQYWxldHRlIChjb250ZXh0LW1lbnUtb25seSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgaXRlbSA9IE1lbnVSZWdpc3RyeS5nZXRNZW51SXRlbXMoTWVudUlkLkNvbW1hbmRQYWxldHRlKVxuXHRcdFx0LmZpbmQoKGkpOiBpIGlzIElNZW51SXRlbSA9PiBpc0lNZW51SXRlbShpKSAmJiBpLmNvbW1hbmQuaWQgPT09IEFDVElPTl9JRCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVhcnMgaW4gdGhlIGxvY2FsIGFnZW50LWhvc3Qgc2Vzc2lvbiBjb250ZXh0IG1lbnUsIG5vdCBmb3IgcmVtb3RlIG9yIG5vbi1hZ2VudC1ob3N0IHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGl0ZW0gPSBNZW51UmVnaXN0cnkuZ2V0TWVudUl0ZW1zKE1lbnVJZC5BZ2VudFNlc3Npb25zQ29udGV4dClcblx0XHRcdC5maW5kKChpKTogaSBpcyBJTWVudUl0ZW0gPT4gaXNJTWVudUl0ZW0oaSkgJiYgaS5jb21tYW5kLmlkID09PSBBQ1RJT05fSUQpO1xuXHRcdGFzc2VydC5vayhpdGVtLCAnYWdlbnQgc2Vzc2lvbnMgY29udGV4dCBtZW51IGl0ZW0gaXMgcmVnaXN0ZXJlZCcpO1xuXG5cdFx0Y29uc3QgYmFzZSA9IHsgW0NoYXRDb250ZXh0S2V5cy5lbmFibGVkLmtleV06IHRydWUsIFtBR0VOVF9IT1NUX0VOQUJMRURfQ09OVEVYVF9LRVkua2V5XTogdHJ1ZSB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmFsV2hlbihpdGVtLndoZW4sIHsgLi4uYmFzZSwgW0NoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25UeXBlLmtleV06ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZhbFdoZW4oaXRlbS53aGVuLCB7IC4uLmJhc2UsIFtDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uVHlwZS5rZXldOiAncmVtb3RlLWNvcGlsb3RjbGknIH0pLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2YWxXaGVuKGl0ZW0ud2hlbiwgeyAuLi5iYXNlLCBbQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblR5cGUua2V5XTogJ2NvcGlsb3RjbGknIH0pLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2YWxXaGVuKGl0ZW0ud2hlbiwgeyAuLi5iYXNlLCBbQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQua2V5XTogZmFsc2UsIFtDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uVHlwZS5rZXldOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyB9KSwgZmFsc2UpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBtYWtlQWdlbnRTZXNzaW9uKHJlc291cmNlOiBVUkkpOiBJQWdlbnRTZXNzaW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdHNldEFyY2hpdmVkOiAoKSA9PiB7IH0sXG5cdFx0XHRpc1Bpbm5lZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRzZXRQaW5uZWQ6ICgpID0+IHsgfSxcblx0XHRcdGlzUmVhZDogKCkgPT4gdHJ1ZSxcblx0XHRcdGlzTWFya2VkVW5yZWFkOiAoKSA9PiBmYWxzZSxcblx0XHRcdHNldFJlYWQ6ICgpID0+IHsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSUFnZW50U2Vzc2lvbjtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGludm9rZVdpdGhDb250ZXh0KGNvbnRleHQ6IElBZ2VudFNlc3Npb24gfCBJTWFyc2hhbGxlZEFnZW50U2Vzc2lvbkNvbnRleHQgfCB1bmRlZmluZWQpOiBQcm9taXNlPHsgcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDsgcGlubmVkOiBib29sZWFuIHwgdW5kZWZpbmVkIH1bXT4ge1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoQUNUSU9OX0lEKTtcblx0XHRhc3NlcnQub2soY29tbWFuZCwgJ2NvbW1hbmQgaXMgcmVnaXN0ZXJlZCcpO1xuXG5cdFx0Y29uc3Qgb3BlbmVkOiB7IHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7IHBpbm5lZDogYm9vbGVhbiB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvclNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgb3BlbkVkaXRvciguLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSBhcmdzWzBdIGFzIElSZXNvdXJjZUVkaXRvcklucHV0O1xuXHRcdFx0XHRvcGVuZWQucHVzaCh7IHJlc291cmNlOiBlZGl0b3IucmVzb3VyY2UsIHBpbm5lZDogZWRpdG9yLm9wdGlvbnM/LnBpbm5lZCB9KTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGNvbW1hbmQuaGFuZGxlcihhY2Nlc3NvciwgY29udGV4dCkpO1xuXHRcdHJldHVybiBvcGVuZWQ7XG5cdH1cblxuXHR0ZXN0KCdydW4oKSB3aXRoIGEgZGlyZWN0IElBZ2VudFNlc3Npb24gb3BlbnMgdGhlIHJvdXRlZCBzZXNzaW9uIHNldHRpbmdzIHJlc291cmNlIHBpbm5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbihDSEFUX1NFU1NJT05fUkVTT1VSQ0UpO1xuXHRcdGNvbnN0IG9wZW5lZCA9IGF3YWl0IGludm9rZVdpdGhDb250ZXh0KHNlc3Npb24pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlbmVkLCBbeyByZXNvdXJjZTogYWdlbnRTZXNzaW9uU2V0dGluZ3NVcmkoQkFDS0VORF9TRVNTSU9OKSwgcGlubmVkOiB0cnVlIH1dKTtcblx0fSk7XG5cblx0dGVzdCgncnVuKCkgd2l0aCBhIG1hcnNoYWxsZWQgYWdlbnQtc2Vzc2lvbiBjb250ZXh0IHJvdXRlcyB2aWEgY29udGV4dC5zZXNzaW9uLCBpZ25vcmluZyBjb250ZXh0LnNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKENIQVRfU0VTU0lPTl9SRVNPVVJDRSk7XG5cdFx0Y29uc3Qgb3RoZXJTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbihVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsIHBhdGg6ICcvb3RoZXInIH0pKTtcblx0XHRjb25zdCBtYXJzaGFsbGVkOiBJTWFyc2hhbGxlZEFnZW50U2Vzc2lvbkNvbnRleHQgPSB7XG5cdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuQWdlbnRTZXNzaW9uQ29udGV4dCxcblx0XHRcdHNlc3Npb24sXG5cdFx0XHRzZXNzaW9uczogW3Nlc3Npb24sIG90aGVyU2Vzc2lvbl0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IG9wZW5lZCA9IGF3YWl0IGludm9rZVdpdGhDb250ZXh0KG1hcnNoYWxsZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlbmVkLCBbeyByZXNvdXJjZTogYWdlbnRTZXNzaW9uU2V0dGluZ3NVcmkoQkFDS0VORF9TRVNTSU9OKSwgcGlubmVkOiB0cnVlIH1dKTtcblx0fSk7XG5cblx0dGVzdCgncnVuKCkgd2l0aCBubyBjb250ZXh0IGRvZXMgbm90IG9wZW4gYW55dGhpbmcgKG5vIGxhc3QtZm9jdXNlZC1zZXNzaW9uIGluZmVyZW5jZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb3BlbmVkID0gYXdhaXQgaW52b2tlV2l0aENvbnRleHQodW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wZW5lZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW4oKSB3aXRoIGEgbm9uLWFnZW50LWhvc3Qgc2Vzc2lvbiByZXNvdXJjZSBkb2VzIG5vdCBvcGVuIGFueXRoaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKFVSSS5mcm9tKHsgc2NoZW1lOiAnc29tZXRoaW5nRWxzZScsIHBhdGg6ICcveCcgfSkpO1xuXHRcdGNvbnN0IG9wZW5lZCA9IGF3YWl0IGludm9rZVdpdGhDb250ZXh0KHNlc3Npb24pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlbmVkLCBbXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx1QkFBbUM7QUFDNUMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FB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
