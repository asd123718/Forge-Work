import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CommandsRegistry } from "../../../../../../platform/commands/common/commands.js";
import { isIMenuItem, MenuId, MenuRegistry } from "../../../../../../platform/actions/common/actions.js";
import { Extensions as JSONExtensions } from "../../../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { NullLogService, ILogService } from "../../../../../../platform/log/common/log.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { ROOT_STATE_URI } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import {
  agentHostSettingsUri,
  AGENT_HOST_SETTINGS_SCHEME,
  AgentHostSettingsFileSystemProvider,
  AgentHostSettingsSchemaRegistrar
} from "../../../browser/agentSessions/agentHost/agentHostSettingsFileSystemProvider.js";
import "../../../browser/agentSessions/agentHost/agentHostSettings.contribution.js";
class MockAgentHostService extends mock() {
  constructor() {
    super(...arguments);
    this.onAgentHostStart = Event.None;
    this.onAgentHostExit = Event.None;
    this.onDidAction = Event.None;
    this.onDidNotification = Event.None;
    this.dispatchedActions = [];
    this._rootStateValue = void 0;
    this._rootStateOnDidChange = new Emitter();
    this.rootState = (() => {
      const self = this;
      return {
        get value() {
          return self._rootStateValue;
        },
        get verifiedValue() {
          return self._rootStateValue instanceof Error ? void 0 : self._rootStateValue;
        },
        onDidChange: this._rootStateOnDidChange.event,
        onWillApplyAction: Event.None,
        onDidApplyAction: Event.None
      };
    })();
  }
  dispatch(channel, action) {
    this.dispatchedActions.push({ channel, action });
  }
  setRootState(state) {
    this._rootStateValue = state;
    if (!(state instanceof Error)) {
      this._rootStateOnDidChange.fire(state);
    }
  }
  dispose() {
    this._rootStateOnDidChange.dispose();
  }
}
function makeRootState(properties, values = {}) {
  return {
    agents: [],
    config: {
      schema: { type: "object", properties },
      values
    }
  };
}
suite("AgentHostSettingsFileSystemProvider (ambient editor-window adapter)", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createHarness(initialState) {
    const agentHostService = new MockAgentHostService();
    store.add({ dispose: () => agentHostService.dispose() });
    if (initialState) {
      agentHostService.setRootState(initialState);
    }
    const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
      [IAgentHostService, agentHostService],
      [ILogService, new NullLogService()]
    )));
    const schemaRegistrar = store.add(instantiationService.createInstance(AgentHostSettingsSchemaRegistrar));
    const fs = store.add(instantiationService.createInstance(AgentHostSettingsFileSystemProvider, schemaRegistrar));
    return { fs, agentHostService, uri: agentHostSettingsUri() };
  }
  test("URI identity: agent-host-settings://local/settings.jsonc", () => {
    const uri = agentHostSettingsUri();
    assert.strictEqual(uri.scheme, AGENT_HOST_SETTINGS_SCHEME);
    assert.strictEqual(uri.authority, "local");
    assert.strictEqual(uri.path, "/settings.jsonc");
  });
  test("readFile returns root config values as JSON", async () => {
    const { fs, uri } = createHarness(makeRootState({
      autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    const buf = await fs.readFile(uri);
    const text = VSBuffer.wrap(buf).toString();
    const parsed = JSON.parse(text.substring(text.indexOf("{")));
    assert.deepStrictEqual(parsed, { autoApprove: "default" });
  });
  test("readFile before any root state has arrived returns an empty document", async () => {
    const { fs, uri } = createHarness();
    const buf = await fs.readFile(uri);
    const text = VSBuffer.wrap(buf).toString();
    const parsed = JSON.parse(text.substring(text.indexOf("{")));
    assert.deepStrictEqual(parsed, {});
  });
  test("writeFile with invalid JSON throws", async () => {
    const { fs, uri } = createHarness(makeRootState({}, {}));
    await assert.rejects(async () => {
      await fs.writeFile(uri, VSBuffer.fromString("{ not json").buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    });
  });
  test("writeFile with a JSON array throws (not an object)", async () => {
    const { fs, uri } = createHarness(makeRootState({}, {}));
    await assert.rejects(async () => {
      await fs.writeFile(uri, VSBuffer.fromString("[]").buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    });
  });
  test("writeFile filters out keys with no schema entry", async () => {
    const { fs, uri, agentHostService } = createHarness(makeRootState({
      autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    const newContent = VSBuffer.fromString('{ "autoApprove": "autoApprove", "unknownKey": 123 }\n').buffer;
    await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const action = agentHostService.dispatchedActions[0].action;
    assert.deepStrictEqual(action.config, { autoApprove: "autoApprove" });
  });
  test("writeFile dispatches RootConfigChanged with replace: true to ROOT_STATE_URI", async () => {
    const { fs, uri, agentHostService } = createHarness(makeRootState({
      autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
    const { channel, action } = agentHostService.dispatchedActions[0];
    assert.strictEqual(channel, ROOT_STATE_URI);
    assert.strictEqual(action.type, ActionType.RootConfigChanged);
    assert.strictEqual(action.replace, true);
  });
  test("writeFile with structurally unchanged values does not dispatch", async () => {
    const { fs, uri, agentHostService } = createHarness(makeRootState({
      autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  test("writeFile optimistically updates the local view before the dispatch round-trips", async () => {
    const { fs, uri, agentHostService } = createHarness(makeRootState({
      autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
    }, { autoApprove: "default" }));
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    const buf = await fs.readFile(uri);
    const text = VSBuffer.wrap(buf).toString();
    const parsed = JSON.parse(text.substring(text.indexOf("{")));
    assert.deepStrictEqual(parsed, { autoApprove: "autoApprove" });
    assert.strictEqual(agentHostService.dispatchedActions.length, 1);
  });
  test("writeFile when no root config has arrived yet is a no-op", async () => {
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
  test("onDidChangeFile fires when the host publishes a new root state", async () => {
    const { fs, uri, agentHostService } = createHarness(makeRootState({}, {}));
    const events = [];
    const listeners = new DisposableStore();
    store.add(listeners);
    listeners.add(fs.onDidChangeFile((changes) => {
      for (const c of changes) {
        events.push(c.resource);
      }
    }));
    listeners.add(fs.watch(uri, { recursive: false, excludes: [] }));
    agentHostService.setRootState(makeRootState({}, { autoApprove: "default" }));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].toString(), uri.toString());
  });
  test("root state hydrates after construction (readFile reflects late-arriving config)", async () => {
    const { fs, uri, agentHostService } = createHarness();
    const initial = await fs.readFile(uri);
    assert.deepStrictEqual(JSON.parse(VSBuffer.wrap(initial).toString().substring(VSBuffer.wrap(initial).toString().indexOf("{"))), {});
    agentHostService.setRootState(makeRootState({
      autoApprove: { type: "string", title: "Auto Approve", enum: ["default"] }
    }, { autoApprove: "default" }));
    const hydrated = await fs.readFile(uri);
    const text = VSBuffer.wrap(hydrated).toString();
    assert.deepStrictEqual(JSON.parse(text.substring(text.indexOf("{"))), { autoApprove: "default" });
  });
  test("root state error leaves config unavailable (empty document, write ignored)", async () => {
    const { fs, uri, agentHostService } = createHarness(new Error("agent host disconnected"));
    const text = VSBuffer.wrap(await fs.readFile(uri)).toString();
    assert.deepStrictEqual(JSON.parse(text.substring(text.indexOf("{"))), {});
    await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(agentHostService.dispatchedActions, []);
  });
  suite("schema registration", () => {
    const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
    const schemaId = `vscode://schemas/agent-host-settings/local.jsonc`;
    test("readFile lazily registers a schema + association", async () => {
      const { fs, uri } = createHarness(makeRootState({
        autoApprove: { type: "string", title: "Auto Approve", enum: ["default"] }
      }, { autoApprove: "default" }));
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
      await fs.readFile(uri);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
      assert.deepStrictEqual(schemaRegistry.getSchemaAssociations()[schemaId], [uri.toString()]);
    });
    test("schema is refreshed when root state changes with a new schema identity", async () => {
      const { fs, uri, agentHostService } = createHarness(makeRootState({
        autoApprove: { type: "string", title: "Auto Approve", enum: ["default"] }
      }, { autoApprove: "default" }));
      await fs.readFile(uri);
      const initial = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.ok(initial);
      agentHostService.setRootState(makeRootState({
        autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] },
        mode: { type: "string", title: "Mode", enum: ["a", "b"] }
      }, { autoApprove: "default", mode: "a" }));
      const refreshed = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.notStrictEqual(refreshed, initial);
      assert.ok(refreshed.properties?.["mode"], "refreshed schema should include the newly added property");
    });
  });
});
suite("workbench.action.chat.openAgentHostSettings", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const ACTION_ID = "workbench.action.chat.openAgentHostSettings";
  function evalWhen(when, values) {
    assert.ok(when, "expected a when clause");
    return when.evaluate({ getValue: (key) => values[key] });
  }
  test("is registered in the Command Palette gated on chat + agent-host enablement", () => {
    const item = MenuRegistry.getMenuItems(MenuId.CommandPalette).find((i) => isIMenuItem(i) && i.command.id === ACTION_ID);
    assert.ok(item, "command palette item is registered");
    assert.strictEqual(evalWhen(item.when, {
      [ChatContextKeys.enabled.key]: true,
      [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true
    }), true);
    assert.strictEqual(evalWhen(item.when, {
      [ChatContextKeys.enabled.key]: false,
      [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true
    }), false);
    assert.strictEqual(evalWhen(item.when, {
      [ChatContextKeys.enabled.key]: true,
      [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: false
    }), false);
  });
  test("appears in the local agent-host session context menu, not for remote or non-agent-host sessions", () => {
    const item = MenuRegistry.getMenuItems(MenuId.AgentSessionsContext).find((i) => isIMenuItem(i) && i.command.id === ACTION_ID);
    assert.ok(item, "agent sessions context menu item is registered");
    const base = { [ChatContextKeys.enabled.key]: true, [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true };
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: "agent-host-copilotcli" }), true);
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: "remote-copilotcli" }), false);
    assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: "copilotcli" }), false);
  });
  test("run() opens the ambient settings resource pinned, ignoring any session context", async () => {
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
    await instantiationService.invokeFunction((accessor) => command.handler(accessor, { providerId: "some-other-provider" }));
    assert.deepStrictEqual(opened, [{ resource: agentHostSettingsUri(), pinned: true }]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgaXNJTWVudUl0ZW0sIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCB0eXBlIElNZW51SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgdHlwZSBDb250ZXh0S2V5RXhwcmVzc2lvbiwgdHlwZSBDb250ZXh0S2V5VmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgSlNPTkV4dGVuc2lvbnMsIElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlLCBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX0VOQUJMRURfQ09OVEVYVF9LRVkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24sIENsaWVudEFubm90YXRpb25zQWN0aW9uLCBJTm90aWZpY2F0aW9uLCBTZXNzaW9uQWN0aW9uLCBUZXJtaW5hbEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgUk9PVF9TVEFURV9VUkksIHR5cGUgQ29uZmlnUHJvcGVydHlTY2hlbWEsIHR5cGUgUm9vdFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7XG5cdGFnZW50SG9zdFNldHRpbmdzVXJpLFxuXHRBR0VOVF9IT1NUX1NFVFRJTkdTX1NDSEVNRSxcblx0QWdlbnRIb3N0U2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIsXG5cdEFnZW50SG9zdFNldHRpbmdzU2NoZW1hUmVnaXN0cmFyLFxufSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RTZXR0aW5ncy5jb250cmlidXRpb24uanMnO1xuXG5jbGFzcyBNb2NrQWdlbnRIb3N0U2VydmljZSBleHRlbmRzIG1vY2s8SUFnZW50SG9zdFNlcnZpY2U+KCkge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRvdmVycmlkZSByZWFkb25seSBvbkFnZW50SG9zdFN0YXJ0ID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25BZ2VudEhvc3RFeGl0ID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBY3Rpb24gPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZE5vdGlmaWNhdGlvbjogRXZlbnQ8SU5vdGlmaWNhdGlvbj4gPSBFdmVudC5Ob25lO1xuXG5cdHJlYWRvbmx5IGRpc3BhdGNoZWRBY3Rpb25zOiB7IGNoYW5uZWw6IHN0cmluZzsgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiB9W10gPSBbXTtcblxuXHRvdmVycmlkZSBkaXNwYXRjaChjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLmRpc3BhdGNoZWRBY3Rpb25zLnB1c2goeyBjaGFubmVsLCBhY3Rpb24gfSk7XG5cdH1cblxuXHRwcml2YXRlIF9yb290U3RhdGVWYWx1ZTogUm9vdFN0YXRlIHwgRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jvb3RTdGF0ZU9uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8Um9vdFN0YXRlPigpO1xuXHRvdmVycmlkZSByZWFkb25seSByb290U3RhdGU6IElBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+ID0gKCgpID0+IHtcblx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0IHZhbHVlKCkgeyByZXR1cm4gc2VsZi5fcm9vdFN0YXRlVmFsdWU7IH0sXG5cdFx0XHRnZXQgdmVyaWZpZWRWYWx1ZSgpIHsgcmV0dXJuIHNlbGYuX3Jvb3RTdGF0ZVZhbHVlIGluc3RhbmNlb2YgRXJyb3IgPyB1bmRlZmluZWQgOiBzZWxmLl9yb290U3RhdGVWYWx1ZTsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlOiB0aGlzLl9yb290U3RhdGVPbkRpZENoYW5nZS5ldmVudCxcblx0XHRcdG9uV2lsbEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHR9O1xuXHR9KSgpO1xuXG5cdHNldFJvb3RTdGF0ZShzdGF0ZTogUm9vdFN0YXRlIHwgRXJyb3IpOiB2b2lkIHtcblx0XHR0aGlzLl9yb290U3RhdGVWYWx1ZSA9IHN0YXRlO1xuXHRcdGlmICghKHN0YXRlIGluc3RhbmNlb2YgRXJyb3IpKSB7XG5cdFx0XHR0aGlzLl9yb290U3RhdGVPbkRpZENoYW5nZS5maXJlKHN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZU9uRGlkQ2hhbmdlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBtYWtlUm9vdFN0YXRlKHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIENvbmZpZ1Byb3BlcnR5U2NoZW1hPiwgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9KTogUm9vdFN0YXRlIHtcblx0cmV0dXJuIHtcblx0XHRhZ2VudHM6IFtdLFxuXHRcdGNvbmZpZzoge1xuXHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzIH0sXG5cdFx0XHR2YWx1ZXMsXG5cdFx0fSxcblx0fTtcbn1cblxuc3VpdGUoJ0FnZW50SG9zdFNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyIChhbWJpZW50IGVkaXRvci13aW5kb3cgYWRhcHRlciknLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVIYXJuZXNzKGluaXRpYWxTdGF0ZT86IFJvb3RTdGF0ZSB8IEVycm9yKSB7XG5cdFx0Y29uc3QgYWdlbnRIb3N0U2VydmljZSA9IG5ldyBNb2NrQWdlbnRIb3N0U2VydmljZSgpO1xuXHRcdHN0b3JlLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGFnZW50SG9zdFNlcnZpY2UuZGlzcG9zZSgpIH0pO1xuXHRcdGlmIChpbml0aWFsU3RhdGUpIHtcblx0XHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKGluaXRpYWxTdGF0ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUFnZW50SG9zdFNlcnZpY2UsIGFnZW50SG9zdFNlcnZpY2VdLFxuXHRcdFx0W0lMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKV0sXG5cdFx0KSkpO1xuXG5cdFx0Y29uc3Qgc2NoZW1hUmVnaXN0cmFyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFNldHRpbmdzU2NoZW1hUmVnaXN0cmFyKSk7XG5cdFx0Y29uc3QgZnMgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0U2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIsIHNjaGVtYVJlZ2lzdHJhcikpO1xuXG5cdFx0cmV0dXJuIHsgZnMsIGFnZW50SG9zdFNlcnZpY2UsIHVyaTogYWdlbnRIb3N0U2V0dGluZ3NVcmkoKSB9O1xuXHR9XG5cblx0dGVzdCgnVVJJIGlkZW50aXR5OiBhZ2VudC1ob3N0LXNldHRpbmdzOi8vbG9jYWwvc2V0dGluZ3MuanNvbmMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gYWdlbnRIb3N0U2V0dGluZ3NVcmkoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnNjaGVtZSwgQUdFTlRfSE9TVF9TRVRUSU5HU19TQ0hFTUUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkuYXV0aG9yaXR5LCAnbG9jYWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvc2V0dGluZ3MuanNvbmMnKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgcmV0dXJucyByb290IGNvbmZpZyB2YWx1ZXMgYXMgSlNPTicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmkgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVJvb3RTdGF0ZSh7XG5cdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdH0sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KSk7XG5cblx0XHRjb25zdCBidWYgPSBhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdGNvbnN0IHRleHQgPSBWU0J1ZmZlci53cmFwKGJ1ZikudG9TdHJpbmcoKTtcblx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHRleHQuc3Vic3RyaW5nKHRleHQuaW5kZXhPZigneycpKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQsIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgYmVmb3JlIGFueSByb290IHN0YXRlIGhhcyBhcnJpdmVkIHJldHVybnMgYW4gZW1wdHkgZG9jdW1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpIH0gPSBjcmVhdGVIYXJuZXNzKCk7XG5cblx0XHRjb25zdCBidWYgPSBhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdGNvbnN0IHRleHQgPSBWU0J1ZmZlci53cmFwKGJ1ZikudG9TdHJpbmcoKTtcblx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHRleHQuc3Vic3RyaW5nKHRleHQuaW5kZXhPZigneycpKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQsIHt9KTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIHdpdGggaW52YWxpZCBKU09OIHRocm93cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmkgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVJvb3RTdGF0ZSh7fSwge30pKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IG5vdCBqc29uJykuYnVmZmVyLCB7IGNyZWF0ZTogZmFsc2UsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIHdpdGggYSBKU09OIGFycmF5IHRocm93cyAobm90IGFuIG9iamVjdCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VSb290U3RhdGUoe30sIHt9KSk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygnW10nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgZmlsdGVycyBvdXQga2V5cyB3aXRoIG5vIHNjaGVtYSBlbnRyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVJvb3RTdGF0ZSh7XG5cdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdH0sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KSk7XG5cblx0XHRjb25zdCBuZXdDb250ZW50ID0gVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImF1dG9BcHByb3ZlXCI6IFwiYXV0b0FwcHJvdmVcIiwgXCJ1bmtub3duS2V5XCI6IDEyMyB9XFxuJykuYnVmZmVyO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIG5ld0NvbnRlbnQsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBhY3Rpb24gPSBhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zWzBdLmFjdGlvbiBhcyBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb247XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb24uY29uZmlnLCB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgZGlzcGF0Y2hlcyBSb290Q29uZmlnQ2hhbmdlZCB3aXRoIHJlcGxhY2U6IHRydWUgdG8gUk9PVF9TVEFURV9VUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VSb290U3RhdGUoe1xuXHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSkpO1xuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImF1dG9BcHByb3ZlXCI6IFwiYXV0b0FwcHJvdmVcIiB9XFxuJykuYnVmZmVyLCB7IGNyZWF0ZTogZmFsc2UsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgeyBjaGFubmVsLCBhY3Rpb24gfSA9IGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnNbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5uZWwsIFJPT1RfU1RBVEVfVVJJKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLnR5cGUsIEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYWN0aW9uIGFzIElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbikucmVwbGFjZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSB3aXRoIHN0cnVjdHVyYWxseSB1bmNoYW5nZWQgdmFsdWVzIGRvZXMgbm90IGRpc3BhdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhtYWtlUm9vdFN0YXRlKHtcblx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0fSwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pKTtcblxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJhdXRvQXBwcm92ZVwiOiBcImRlZmF1bHRcIiB9XFxuJykuYnVmZmVyLCB7IGNyZWF0ZTogZmFsc2UsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaGVkQWN0aW9ucyBhcyByZWFkb25seSB1bmtub3duW10sIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIG9wdGltaXN0aWNhbGx5IHVwZGF0ZXMgdGhlIGxvY2FsIHZpZXcgYmVmb3JlIHRoZSBkaXNwYXRjaCByb3VuZC10cmlwcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVJvb3RTdGF0ZSh7XG5cdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdH0sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KSk7XG5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiYXV0b0FwcHJvdmVcIjogXCJhdXRvQXBwcm92ZVwiIH1cXG4nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gUmUtcmVhZCB3aXRob3V0IHRoZSBob3N0IGVjaG9pbmcgYW55dGhpbmcgYmFjayBcdTIwMTQgdGhlIG9wdGltaXN0aWNcblx0XHQvLyBsb2NhbCBjYWNoZSBzaG91bGQgYWxyZWFkeSByZWZsZWN0IHRoZSB3cml0ZS5cblx0XHRjb25zdCBidWYgPSBhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdGNvbnN0IHRleHQgPSBWU0J1ZmZlci53cmFwKGJ1ZikudG9TdHJpbmcoKTtcblx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHRleHQuc3Vic3RyaW5nKHRleHQuaW5kZXhPZigneycpKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQsIHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIHdoZW4gbm8gcm9vdCBjb25maWcgaGFzIGFycml2ZWQgeWV0IGlzIGEgbm8tb3AnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKCk7XG5cblx0XHRjb25zdCBldmVudHM6IFVSSVtdID0gW107XG5cdFx0c3RvcmUuYWRkKGZzLm9uRGlkQ2hhbmdlRmlsZShjaGFuZ2VzID0+IHsgZm9yIChjb25zdCBjIG9mIGNoYW5nZXMpIHsgZXZlbnRzLnB1c2goYy5yZXNvdXJjZSk7IH0gfSkpO1xuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImF1dG9BcHByb3ZlXCI6IFwiZGVmYXVsdFwiIH1cXG4nKS5idWZmZXIsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zIGFzIHJlYWRvbmx5IHVua25vd25bXSwgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VGaWxlIGZpcmVzIHdoZW4gdGhlIGhvc3QgcHVibGlzaGVzIGEgbmV3IHJvb3Qgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKG1ha2VSb290U3RhdGUoe30sIHt9KSk7XG5cblx0XHRjb25zdCBldmVudHM6IFVSSVtdID0gW107XG5cdFx0Y29uc3QgbGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChsaXN0ZW5lcnMpO1xuXHRcdGxpc3RlbmVycy5hZGQoZnMub25EaWRDaGFuZ2VGaWxlKGNoYW5nZXMgPT4geyBmb3IgKGNvbnN0IGMgb2YgY2hhbmdlcykgeyBldmVudHMucHVzaChjLnJlc291cmNlKTsgfSB9KSk7XG5cdFx0bGlzdGVuZXJzLmFkZChmcy53YXRjaCh1cmksIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pKTtcblxuXHRcdGFnZW50SG9zdFNlcnZpY2Uuc2V0Um9vdFN0YXRlKG1ha2VSb290U3RhdGUoe30sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS50b1N0cmluZygpLCB1cmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jvb3Qgc3RhdGUgaHlkcmF0ZXMgYWZ0ZXIgY29uc3RydWN0aW9uIChyZWFkRmlsZSByZWZsZWN0cyBsYXRlLWFycml2aW5nIGNvbmZpZyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKCk7IC8vIG5vIGluaXRpYWwgc3RhdGVcblxuXHRcdGNvbnN0IGluaXRpYWwgPSBhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5wYXJzZShWU0J1ZmZlci53cmFwKGluaXRpYWwpLnRvU3RyaW5nKCkuc3Vic3RyaW5nKFZTQnVmZmVyLndyYXAoaW5pdGlhbCkudG9TdHJpbmcoKS5pbmRleE9mKCd7JykpKSwge30pO1xuXG5cdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUobWFrZVJvb3RTdGF0ZSh7XG5cdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBlbnVtOiBbJ2RlZmF1bHQnXSB9LFxuXHRcdH0sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KSk7XG5cblx0XHRjb25zdCBoeWRyYXRlZCA9IGF3YWl0IGZzLnJlYWRGaWxlKHVyaSk7XG5cdFx0Y29uc3QgdGV4dCA9IFZTQnVmZmVyLndyYXAoaHlkcmF0ZWQpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKHRleHQuc3Vic3RyaW5nKHRleHQuaW5kZXhPZigneycpKSksIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KTtcblx0fSk7XG5cblx0dGVzdCgncm9vdCBzdGF0ZSBlcnJvciBsZWF2ZXMgY29uZmlnIHVuYXZhaWxhYmxlIChlbXB0eSBkb2N1bWVudCwgd3JpdGUgaWdub3JlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBhZ2VudEhvc3RTZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKG5ldyBFcnJvcignYWdlbnQgaG9zdCBkaXNjb25uZWN0ZWQnKSk7XG5cblx0XHRjb25zdCB0ZXh0ID0gVlNCdWZmZXIud3JhcChhd2FpdCBmcy5yZWFkRmlsZSh1cmkpKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5wYXJzZSh0ZXh0LnN1YnN0cmluZyh0ZXh0LmluZGV4T2YoJ3snKSkpLCB7fSk7XG5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiYXV0b0FwcHJvdmVcIjogXCJkZWZhdWx0XCIgfVxcbicpLmJ1ZmZlciwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoZWRBY3Rpb25zIGFzIHJlYWRvbmx5IHVua25vd25bXSwgW10pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2NoZW1hIHJlZ2lzdHJhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBzY2hlbWFSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnk+KEpTT05FeHRlbnNpb25zLkpTT05Db250cmlidXRpb24pO1xuXHRcdGNvbnN0IHNjaGVtYUlkID0gYHZzY29kZTovL3NjaGVtYXMvYWdlbnQtaG9zdC1zZXR0aW5ncy9sb2NhbC5qc29uY2A7XG5cblx0XHR0ZXN0KCdyZWFkRmlsZSBsYXppbHkgcmVnaXN0ZXJzIGEgc2NoZW1hICsgYXNzb2NpYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZzLCB1cmkgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVJvb3RTdGF0ZSh7XG5cdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCddIH0sXG5cdFx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuaGFzU2NoZW1hQ29udGVudChzY2hlbWFJZCksIGZhbHNlKTtcblxuXHRcdFx0YXdhaXQgZnMucmVhZEZpbGUodXJpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5Lmhhc1NjaGVtYUNvbnRlbnQoc2NoZW1hSWQpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuZ2V0U2NoZW1hQXNzb2NpYXRpb25zKClbc2NoZW1hSWRdLCBbdXJpLnRvU3RyaW5nKCldKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NjaGVtYSBpcyByZWZyZXNoZWQgd2hlbiByb290IHN0YXRlIGNoYW5nZXMgd2l0aCBhIG5ldyBzY2hlbWEgaWRlbnRpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZzLCB1cmksIGFnZW50SG9zdFNlcnZpY2UgfSA9IGNyZWF0ZUhhcm5lc3MobWFrZVJvb3RTdGF0ZSh7XG5cdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCddIH0sXG5cdFx0XHR9LCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSkpO1xuXG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0Y29uc3QgaW5pdGlhbCA9IHNjaGVtYVJlZ2lzdHJ5LmdldFNjaGVtYUNvbnRyaWJ1dGlvbnMoKS5zY2hlbWFzW3NjaGVtYUlkXTtcblx0XHRcdGFzc2VydC5vayhpbml0aWFsKTtcblxuXHRcdFx0YWdlbnRIb3N0U2VydmljZS5zZXRSb290U3RhdGUobWFrZVJvb3RTdGF0ZSh7XG5cdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0XHRcdG1vZGU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnTW9kZScsIGVudW06IFsnYScsICdiJ10gfSxcblx0XHRcdH0sIHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgbW9kZTogJ2EnIH0pKTtcblxuXHRcdFx0Y29uc3QgcmVmcmVzaGVkID0gc2NoZW1hUmVnaXN0cnkuZ2V0U2NoZW1hQ29udHJpYnV0aW9ucygpLnNjaGVtYXNbc2NoZW1hSWRdO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlZnJlc2hlZCwgaW5pdGlhbCk7XG5cdFx0XHRhc3NlcnQub2socmVmcmVzaGVkLnByb3BlcnRpZXM/LlsnbW9kZSddLCAncmVmcmVzaGVkIHNjaGVtYSBzaG91bGQgaW5jbHVkZSB0aGUgbmV3bHkgYWRkZWQgcHJvcGVydHknKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuQWdlbnRIb3N0U2V0dGluZ3MnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBBQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5BZ2VudEhvc3RTZXR0aW5ncyc7XG5cblx0ZnVuY3Rpb24gZXZhbFdoZW4od2hlbjogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQsIHZhbHVlczogUmVjb3JkPHN0cmluZywgQ29udGV4dEtleVZhbHVlPik6IGJvb2xlYW4ge1xuXHRcdGFzc2VydC5vayh3aGVuLCAnZXhwZWN0ZWQgYSB3aGVuIGNsYXVzZScpO1xuXHRcdHJldHVybiB3aGVuLmV2YWx1YXRlKHsgZ2V0VmFsdWU6IDxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlID0gQ29udGV4dEtleVZhbHVlPihrZXk6IHN0cmluZykgPT4gdmFsdWVzW2tleV0gYXMgVCB9KTtcblx0fVxuXG5cdHRlc3QoJ2lzIHJlZ2lzdGVyZWQgaW4gdGhlIENvbW1hbmQgUGFsZXR0ZSBnYXRlZCBvbiBjaGF0ICsgYWdlbnQtaG9zdCBlbmFibGVtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGl0ZW0gPSBNZW51UmVnaXN0cnkuZ2V0TWVudUl0ZW1zKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSlcblx0XHRcdC5maW5kKChpKTogaSBpcyBJTWVudUl0ZW0gPT4gaXNJTWVudUl0ZW0oaSkgJiYgaS5jb21tYW5kLmlkID09PSBBQ1RJT05fSUQpO1xuXHRcdGFzc2VydC5vayhpdGVtLCAnY29tbWFuZCBwYWxldHRlIGl0ZW0gaXMgcmVnaXN0ZXJlZCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2YWxXaGVuKGl0ZW0ud2hlbiwge1xuXHRcdFx0W0NoYXRDb250ZXh0S2V5cy5lbmFibGVkLmtleV06IHRydWUsXG5cdFx0XHRbQUdFTlRfSE9TVF9FTkFCTEVEX0NPTlRFWFRfS0VZLmtleV06IHRydWUsXG5cdFx0fSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmFsV2hlbihpdGVtLndoZW4sIHtcblx0XHRcdFtDaGF0Q29udGV4dEtleXMuZW5hYmxlZC5rZXldOiBmYWxzZSxcblx0XHRcdFtBR0VOVF9IT1NUX0VOQUJMRURfQ09OVEVYVF9LRVkua2V5XTogdHJ1ZSxcblx0XHR9KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmFsV2hlbihpdGVtLndoZW4sIHtcblx0XHRcdFtDaGF0Q29udGV4dEtleXMuZW5hYmxlZC5rZXldOiB0cnVlLFxuXHRcdFx0W0FHRU5UX0hPU1RfRU5BQkxFRF9DT05URVhUX0tFWS5rZXldOiBmYWxzZSxcblx0XHR9KSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlYXJzIGluIHRoZSBsb2NhbCBhZ2VudC1ob3N0IHNlc3Npb24gY29udGV4dCBtZW51LCBub3QgZm9yIHJlbW90ZSBvciBub24tYWdlbnQtaG9zdCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBpdGVtID0gTWVudVJlZ2lzdHJ5LmdldE1lbnVJdGVtcyhNZW51SWQuQWdlbnRTZXNzaW9uc0NvbnRleHQpXG5cdFx0XHQuZmluZCgoaSk6IGkgaXMgSU1lbnVJdGVtID0+IGlzSU1lbnVJdGVtKGkpICYmIGkuY29tbWFuZC5pZCA9PT0gQUNUSU9OX0lEKTtcblx0XHRhc3NlcnQub2soaXRlbSwgJ2FnZW50IHNlc3Npb25zIGNvbnRleHQgbWVudSBpdGVtIGlzIHJlZ2lzdGVyZWQnKTtcblxuXHRcdGNvbnN0IGJhc2UgPSB7IFtDaGF0Q29udGV4dEtleXMuZW5hYmxlZC5rZXldOiB0cnVlLCBbQUdFTlRfSE9TVF9FTkFCTEVEX0NPTlRFWFRfS0VZLmtleV06IHRydWUgfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZhbFdoZW4oaXRlbS53aGVuLCB7IC4uLmJhc2UsIFtDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uVHlwZS5rZXldOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyB9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2YWxXaGVuKGl0ZW0ud2hlbiwgeyAuLi5iYXNlLCBbQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblR5cGUua2V5XTogJ3JlbW90ZS1jb3BpbG90Y2xpJyB9KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmFsV2hlbihpdGVtLndoZW4sIHsgLi4uYmFzZSwgW0NoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25UeXBlLmtleV06ICdjb3BpbG90Y2xpJyB9KSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdydW4oKSBvcGVucyB0aGUgYW1iaWVudCBzZXR0aW5ncyByZXNvdXJjZSBwaW5uZWQsIGlnbm9yaW5nIGFueSBzZXNzaW9uIGNvbnRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChBQ1RJT05fSUQpO1xuXHRcdGFzc2VydC5vayhjb21tYW5kLCAnY29tbWFuZCBpcyByZWdpc3RlcmVkJyk7XG5cblx0XHRjb25zdCBvcGVuZWQ6IHsgcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDsgcGlubmVkOiBib29sZWFuIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuRWRpdG9yKC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IGFyZ3NbMF0gYXMgSVJlc291cmNlRWRpdG9ySW5wdXQ7XG5cdFx0XHRcdG9wZW5lZC5wdXNoKHsgcmVzb3VyY2U6IGVkaXRvci5yZXNvdXJjZSwgcGlubmVkOiBlZGl0b3Iub3B0aW9ucz8ucGlubmVkIH0pO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gUGFzcyBhIGJvZ3VzIHNlc3Npb24taXRlbS1zaGFwZWQgYXJndW1lbnQgdG8gY29uZmlybSBpdCdzIGlnbm9yZWQgZm9yIHJvdXRpbmcuXG5cdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gY29tbWFuZC5oYW5kbGVyKGFjY2Vzc29yLCB7IHByb3ZpZGVySWQ6ICdzb21lLW90aGVyLXByb3ZpZGVyJyB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wZW5lZCwgW3sgcmVzb3VyY2U6IGFnZW50SG9zdFNldHRpbmdzVXJpKCksIHBpbm5lZDogdHJ1ZSB9XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsYUFBYSxRQUFRLG9CQUFvQztBQUVsRSxTQUFTLGNBQWMsc0JBQWlEO0FBQ3hFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCLG1CQUFtQjtBQUM1QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNDQUFzQztBQUcvQyxTQUFTLHNCQUFpRTtBQUMxRSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHVCQUF1QjtBQUNoQztBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBQ1AsT0FBTztBQUVQLE1BQU0sNkJBQTZCLEtBQXdCLEVBQUU7QUFBQSxFQUE3RDtBQUFBO0FBR0MsU0FBa0IsbUJBQW1CLE1BQU07QUFDM0Ms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
