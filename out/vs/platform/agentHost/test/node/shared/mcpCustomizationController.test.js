import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { AgentSession } from "../../../common/agent.js";
import { isCustomizationEnabled } from "../../../common/customizationEnablement.js";
import { ActionType } from "../../../common/state/protocol/common/actions.js";
import { CustomizationEnablementKind, CustomizationType, McpAuthRequiredReason, McpServerStatus, SessionStatus } from "../../../common/state/protocol/channels-session/state.js";
import { AgentHostStateManager } from "../../../node/agentHostStateManager.js";
import { getEffectiveMcpServerCustomizations, McpCustomizationController, findMcpChildId, findMcpServerName, parseMcpChannelUri } from "../../../node/shared/mcpCustomizationController.js";
function harness(store, opts = {}) {
  const actions = [];
  const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
  const sessionUri = AgentSession.uri("copilot", "session-1");
  const session = sessionUri.toString();
  stateManager.createSession({
    resource: session,
    provider: "copilot",
    title: "Test",
    status: SessionStatus.Idle,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (opts.desiredEnabled !== void 0 || opts.customizations !== void 0) {
    stateManager.dispatchServerAction(session, {
      type: ActionType.SessionCustomizationsChanged,
      customizations: opts.customizations ? [...opts.customizations] : [{
        type: CustomizationType.McpServer,
        id: "mcp-top-level:copilot:session-1:search",
        uri: "mcp-top-level:copilot:session-1:search",
        name: "search",
        ...opts.desiredEnabled ? {} : { enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] },
        state: starting()
      }]
    });
  }
  const controller = new McpCustomizationController({
    providerId: "copilot",
    sessionId: "session-1",
    sessionUri,
    emit: (a) => actions.push(a),
    pluginMcpServerSources: opts.pluginMcpServerSources,
    resolveEnablement: opts.resolveEnablement
  }, stateManager);
  return { controller, actions };
}
function server(name, state) {
  return { name, state };
}
function ready() {
  return { kind: McpServerStatus.Ready };
}
function starting() {
  return { kind: McpServerStatus.Starting };
}
function stopped() {
  return { kind: McpServerStatus.Stopped };
}
function authRequired() {
  return {
    kind: McpServerStatus.AuthRequired,
    reason: McpAuthRequiredReason.Required,
    resource: {
      resource: "https://mcp.example.com",
      authorization_servers: ["https://auth.example.com"]
    },
    requiredScopes: ["repo"]
  };
}
function errored(message) {
  return { kind: McpServerStatus.Error, error: { errorType: "test-error", message } };
}
const PLUGIN_CUSTOMIZATIONS = [
  {
    type: CustomizationType.Plugin,
    id: "plugin:demo",
    uri: "file:///plugins/demo",
    name: "demo-plugin",
    children: [
      {
        type: CustomizationType.McpServer,
        id: "mcp-child:demo:fs",
        uri: "mcp-child:demo:fs",
        name: "fs",
        state: { kind: McpServerStatus.Starting }
      }
    ]
  }
];
suite("McpCustomizationController", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("empty inventory dispatches nothing", () => {
    const { controller, actions } = harness(store);
    store.add(controller);
    controller.applyAll([]);
    assert.deepStrictEqual(actions, []);
    assert.deepStrictEqual(controller.topLevelCustomizations(), []);
  });
  test("child-backed server: ready/error/ready transitions only update state+channel", () => {
    const { controller, actions } = harness(store, { customizations: PLUGIN_CUSTOMIZATIONS });
    store.add(controller);
    controller.applyOne(server("fs", ready()));
    controller.applyOne(server("fs", errored("boom")));
    controller.applyOne(server("fs", ready()));
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: { kind: McpServerStatus.Ready },
        channel: "mcp://copilot/session-1/fs"
      },
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: { kind: McpServerStatus.Error, error: { errorType: "test-error", message: "boom" } },
        channel: void 0
      },
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: { kind: McpServerStatus.Ready },
        channel: "mcp://copilot/session-1/fs"
      }
    ]);
    assert.deepStrictEqual(controller.topLevelCustomizations(), []);
  });
  test("bare server (no child match) is surfaced as a full top-level customization", () => {
    const { controller, actions } = harness(store);
    store.add(controller);
    controller.applyOne(server("search", ready()));
    const expectedId = "mcp-top-level:copilot:session-1:search";
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.SessionCustomizationUpdated,
        customization: {
          type: CustomizationType.McpServer,
          id: expectedId,
          uri: expectedId,
          name: "search",
          state: { kind: McpServerStatus.Ready },
          channel: "mcp://copilot/session-1/search",
          mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } }
        }
      }
    ]);
    assert.deepStrictEqual(controller.topLevelCustomizations(), [
      {
        type: CustomizationType.McpServer,
        id: expectedId,
        uri: expectedId,
        name: "search",
        state: { kind: McpServerStatus.Ready },
        channel: "mcp://copilot/session-1/search",
        mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } }
      }
    ]);
  });
  test("passes a plugin MCP server source internally when it is temporarily surfaced top-level", () => {
    let receivedOwner;
    const { controller, actions } = harness(store, {
      pluginMcpServerSources: () => /* @__PURE__ */ new Map([["azure", "file:///plugins/azure-skills"]]),
      resolveEnablement: (_server, owningPluginUri) => {
        receivedOwner = owningPluginUri;
        return void 0;
      }
    });
    store.add(controller);
    controller.applyOne(server("azure", ready()));
    const action = actions[0];
    assert.strictEqual(action.customization.type, CustomizationType.McpServer);
    if (action.customization.type === CustomizationType.McpServer) {
      assert.strictEqual(Object.hasOwn(action.customization, "owningPluginUri"), false);
    }
    assert.strictEqual(receivedOwner, "file:///plugins/azure-skills");
  });
  test("uses the resolved global and workspace enablement for a plugin server temporarily surfaced top-level", () => {
    const enablement = [
      { kind: CustomizationEnablementKind.Workspace, uri: "file:///workspace", enabled: false },
      { kind: CustomizationEnablementKind.Global, enabled: false }
    ];
    const { controller, actions } = harness(store, {
      pluginMcpServerSources: () => /* @__PURE__ */ new Map([["azure", "file:///plugins/azure-skills"]]),
      resolveEnablement: () => enablement
    });
    store.add(controller);
    controller.applyOne(server("azure", stopped()));
    assert.deepStrictEqual(actions, [{
      type: ActionType.SessionCustomizationUpdated,
      customization: {
        type: CustomizationType.McpServer,
        id: "mcp-top-level:copilot:session-1:azure",
        uri: "mcp-top-level:copilot:session-1:azure",
        name: "azure",
        enablement,
        state: { kind: McpServerStatus.Stopped },
        channel: void 0,
        mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } }
      }
    }]);
  });
  test("non-ready bare server has no channel but still advertises mcpApp (static capability)", () => {
    const { controller, actions } = harness(store);
    store.add(controller);
    controller.applyOne(server("search", starting()));
    const expectedId = "mcp-top-level:copilot:session-1:search";
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.SessionCustomizationUpdated,
        customization: {
          type: CustomizationType.McpServer,
          id: expectedId,
          uri: expectedId,
          name: "search",
          state: { kind: McpServerStatus.Starting },
          channel: void 0,
          mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } }
        }
      }
    ]);
  });
  test("removing a bare top-level server emits SessionCustomizationRemoved", () => {
    const { controller, actions } = harness(store);
    store.add(controller);
    controller.applyOne(server("search", ready()));
    actions.length = 0;
    controller.remove("search");
    const expectedId = "mcp-top-level:copilot:session-1:search";
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.SessionCustomizationRemoved,
        id: expectedId
      }
    ]);
    assert.deepStrictEqual(controller.topLevelCustomizations(), []);
  });
  test("applyAll removes servers no longer present (child) and emits Stopped", () => {
    const { controller, actions } = harness(store, { customizations: PLUGIN_CUSTOMIZATIONS });
    store.add(controller);
    controller.applyAll([server("fs", ready())]);
    controller.applyAll([]);
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: { kind: McpServerStatus.Ready },
        channel: "mcp://copilot/session-1/fs"
      },
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: { kind: McpServerStatus.Stopped }
      }
    ]);
  });
  test("runtimeStates snapshots child and top-level servers by customization id", () => {
    const { controller } = harness(store, { customizations: PLUGIN_CUSTOMIZATIONS });
    store.add(controller);
    controller.applyOne(server("fs", ready()));
    controller.applyOne(server("search", starting()));
    assert.deepStrictEqual(controller.runtimeStates.get(), /* @__PURE__ */ new Map([
      ["mcp-child:demo:fs", { state: { kind: McpServerStatus.Ready }, channel: "mcp://copilot/session-1/fs" }],
      ["mcp-top-level:copilot:session-1:search", { state: { kind: McpServerStatus.Starting }, channel: void 0 }]
    ]));
    assert.strictEqual(controller.serverNameForCustomizationId("mcp-child:demo:fs"), "fs");
    assert.strictEqual(controller.serverNameForCustomizationId("mcp-top-level:copilot:session-1:search"), "search");
    controller.remove("fs");
    assert.deepStrictEqual([...controller.runtimeStates.get().keys()], ["mcp-top-level:copilot:session-1:search"]);
  });
  test("top-level entry stays top-level across updates (id stable)", () => {
    const { controller, actions } = harness(store);
    store.add(controller);
    controller.applyOne(server("search", starting()));
    controller.applyOne(server("search", ready()));
    controller.applyOne(server("search", stopped()));
    const expectedId = "mcp-top-level:copilot:session-1:search";
    const ids = actions.filter((a) => a.type === ActionType.SessionCustomizationUpdated).map((a) => a.customization.id);
    assert.deepStrictEqual(ids, [expectedId, expectedId, expectedId]);
  });
  test("bare server publishes reducer-backed enablement across runtime updates", () => {
    const { controller, actions } = harness(store, { desiredEnabled: false });
    store.add(controller);
    controller.applyOne(server("search", authRequired()));
    controller.applyOne(server("search", starting()));
    assert.deepStrictEqual(actions.filter((action) => action.type === ActionType.SessionCustomizationUpdated).map((action) => action.type === ActionType.SessionCustomizationUpdated && action.customization.type === CustomizationType.McpServer ? isCustomizationEnabled(action.customization) : void 0), [false, false]);
  });
  test("workspace plugin enablement masks and restores its child MCP server without changing the child decision", () => {
    const child = {
      type: CustomizationType.McpServer,
      id: "mcp-child:demo:fs",
      uri: "mcp-child:demo:fs",
      name: "fs",
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
      state: starting()
    };
    const plugin = {
      type: CustomizationType.Plugin,
      id: "plugin:demo",
      uri: "file:///plugins/demo",
      name: "demo-plugin",
      children: [child]
    };
    const disabledPlugin = {
      ...plugin,
      enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: "file:///workspace", enabled: false }]
    };
    const effective = [plugin, disabledPlugin, plugin].map(
      (customization) => getEffectiveMcpServerCustomizations([customization]).map(({ server: server2, enabled }) => ({
        id: server2.id,
        enablement: server2.enablement,
        enabled
      }))
    );
    assert.deepStrictEqual(effective, [
      [{ id: "mcp-child:demo:fs", enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }], enabled: true }],
      [{ id: "mcp-child:demo:fs", enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }], enabled: false }],
      [{ id: "mcp-child:demo:fs", enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }], enabled: true }]
    ]);
  });
  test("authRequired state is preserved across coarse starting updates", () => {
    const { controller, actions } = harness(store, { customizations: PLUGIN_CUSTOMIZATIONS });
    store.add(controller);
    const authState = authRequired();
    controller.applyOne(server("fs", authState));
    controller.applyOne(server("fs", starting()));
    controller.applyOne(server("fs", ready()));
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: authState,
        channel: void 0
      },
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: authState,
        channel: void 0
      },
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: { kind: McpServerStatus.Ready },
        channel: "mcp://copilot/session-1/fs"
      }
    ]);
  });
  test("parseMcpChannelUri round-trips the controller-minted channel URI", () => {
    const channel = "mcp://copilot/session-1/fs";
    assert.deepStrictEqual(parseMcpChannelUri(channel), {
      providerId: "copilot",
      sessionId: "session-1",
      serverName: "fs"
    });
  });
  test("parseMcpChannelUri decodes URL-encoded path segments", () => {
    const channel = "mcp://copilot/session%2F1/my%20server";
    assert.deepStrictEqual(parseMcpChannelUri(channel), {
      providerId: "copilot",
      sessionId: "session/1",
      serverName: "my server"
    });
  });
  test("parseMcpChannelUri rejects malformed inputs", () => {
    assert.strictEqual(parseMcpChannelUri("https://copilot/x/y"), void 0);
    assert.strictEqual(parseMcpChannelUri("mcp://"), void 0);
    assert.strictEqual(parseMcpChannelUri("mcp:///session/server"), void 0);
    assert.strictEqual(parseMcpChannelUri("mcp://copilot/session-only"), void 0);
    assert.strictEqual(parseMcpChannelUri("mcp://copilot/session/"), void 0);
    assert.strictEqual(parseMcpChannelUri("mcp://copilot/bad%/server"), void 0);
    assert.strictEqual(parseMcpChannelUri("mcp://copilot/session/bad%2"), void 0);
  });
  test("findMcpChildId finds bare top-level entries and plugin children", () => {
    const customizations = [
      ...PLUGIN_CUSTOMIZATIONS,
      {
        type: CustomizationType.McpServer,
        id: "mcp-top-level:test:search",
        uri: "mcp-top-level:test:search",
        name: "search",
        state: { kind: McpServerStatus.Ready }
      }
    ];
    assert.strictEqual(findMcpChildId(customizations, "fs"), "mcp-child:demo:fs");
    assert.strictEqual(findMcpChildId(customizations, "search"), "mcp-top-level:test:search");
    assert.strictEqual(findMcpChildId(customizations, "missing"), void 0);
  });
  test("findMcpServerName finds bare top-level entries and plugin children", () => {
    const customizations = [
      ...PLUGIN_CUSTOMIZATIONS,
      {
        type: CustomizationType.McpServer,
        id: "mcp-top-level:test:search",
        uri: "mcp-top-level:test:search",
        name: "search",
        state: { kind: McpServerStatus.Ready }
      }
    ];
    assert.strictEqual(findMcpServerName(customizations, "mcp-child:demo:fs"), "fs");
    assert.strictEqual(findMcpServerName(customizations, "mcp-top-level:test:search"), "search");
    assert.strictEqual(findMcpServerName(customizations, "missing"), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzaGFyZWRcXG1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBpc0N1c3RvbWl6YXRpb25FbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1c3RvbWl6YXRpb25FbmFibGVtZW50LmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLCBDdXN0b21pemF0aW9uVHlwZSwgTWNwQXV0aFJlcXVpcmVkUmVhc29uLCBNY3BTZXJ2ZXJTdGF0dXMsIFNlc3Npb25TdGF0dXMsIHR5cGUgQ3VzdG9taXphdGlvbiwgdHlwZSBDdXN0b21pemF0aW9uRW5hYmxlbWVudCwgdHlwZSBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCB0eXBlIE1jcFNlcnZlclN0YXRlLCB0eXBlIFBsdWdpbkN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtc2Vzc2lvbi9zdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFNlc3Npb25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgZ2V0RWZmZWN0aXZlTWNwU2VydmVyQ3VzdG9taXphdGlvbnMsIE1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyLCBmaW5kTWNwQ2hpbGRJZCwgZmluZE1jcFNlcnZlck5hbWUsIHBhcnNlTWNwQ2hhbm5lbFVyaSwgdHlwZSBJU2RrTWNwU2VydmVyIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9zaGFyZWQvbWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXIuanMnO1xuXG5mdW5jdGlvbiBoYXJuZXNzKHN0b3JlOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+LCBvcHRzOiB7XG5cdGN1c3RvbWl6YXRpb25zPzogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdO1xuXHRkZXNpcmVkRW5hYmxlZD86IGJvb2xlYW47XG5cdHBsdWdpbk1jcFNlcnZlclNvdXJjZXM/OiAoKSA9PiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdHJlc29sdmVFbmFibGVtZW50PzogKHNlcnZlcjogTWNwU2VydmVyQ3VzdG9taXphdGlvbiwgb3duaW5nUGx1Z2luVXJpOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10gfCB1bmRlZmluZWQ7XG59ID0ge30pIHtcblx0Y29uc3QgYWN0aW9uczogU2Vzc2lvbkFjdGlvbltdID0gW107XG5cdGNvbnN0IHN0YXRlTWFuYWdlciA9IHN0b3JlLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24tMScpO1xuXHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0cmVzb3VyY2U6IHNlc3Npb24sXG5cdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0fSk7XG5cdGlmIChvcHRzLmRlc2lyZWRFbmFibGVkICE9PSB1bmRlZmluZWQgfHwgb3B0cy5jdXN0b21pemF0aW9ucyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24sIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCxcblx0XHRcdGN1c3RvbWl6YXRpb25zOiBvcHRzLmN1c3RvbWl6YXRpb25zID8gWy4uLm9wdHMuY3VzdG9taXphdGlvbnNdIDogW3tcblx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLFxuXHRcdFx0XHRpZDogJ21jcC10b3AtbGV2ZWw6Y29waWxvdDpzZXNzaW9uLTE6c2VhcmNoJyxcblx0XHRcdFx0dXJpOiAnbWNwLXRvcC1sZXZlbDpjb3BpbG90OnNlc3Npb24tMTpzZWFyY2gnLFxuXHRcdFx0XHRuYW1lOiAnc2VhcmNoJyxcblx0XHRcdFx0Li4uKG9wdHMuZGVzaXJlZEVuYWJsZWQgPyB7fSA6IHsgZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0gfSksXG5cdFx0XHRcdHN0YXRlOiBzdGFydGluZygpLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlcih7XG5cdFx0cHJvdmlkZXJJZDogJ2NvcGlsb3QnLFxuXHRcdHNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0c2Vzc2lvblVyaSxcblx0XHRlbWl0OiBhID0+IGFjdGlvbnMucHVzaChhKSxcblx0XHRwbHVnaW5NY3BTZXJ2ZXJTb3VyY2VzOiBvcHRzLnBsdWdpbk1jcFNlcnZlclNvdXJjZXMsXG5cdFx0cmVzb2x2ZUVuYWJsZW1lbnQ6IG9wdHMucmVzb2x2ZUVuYWJsZW1lbnQsXG5cdH0sIHN0YXRlTWFuYWdlcik7XG5cdHJldHVybiB7IGNvbnRyb2xsZXIsIGFjdGlvbnMgfTtcbn1cblxuZnVuY3Rpb24gc2VydmVyKG5hbWU6IHN0cmluZywgc3RhdGU6IE1jcFNlcnZlclN0YXRlKTogSVNka01jcFNlcnZlciB7XG5cdHJldHVybiB7IG5hbWUsIHN0YXRlIH07XG59XG5cbmZ1bmN0aW9uIHJlYWR5KCk6IE1jcFNlcnZlclN0YXRlIHsgcmV0dXJuIHsga2luZDogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH07IH1cbmZ1bmN0aW9uIHN0YXJ0aW5nKCk6IE1jcFNlcnZlclN0YXRlIHsgcmV0dXJuIHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nIH07IH1cbmZ1bmN0aW9uIHN0b3BwZWQoKTogTWNwU2VydmVyU3RhdGUgeyByZXR1cm4geyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZCB9OyB9XG5mdW5jdGlvbiBhdXRoUmVxdWlyZWQoKTogTWNwU2VydmVyU3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQsXG5cdFx0cmVhc29uOiBNY3BBdXRoUmVxdWlyZWRSZWFzb24uUmVxdWlyZWQsXG5cdFx0cmVzb3VyY2U6IHtcblx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20nLFxuXHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSddLFxuXHRcdH0sXG5cdFx0cmVxdWlyZWRTY29wZXM6IFsncmVwbyddLFxuXHR9O1xufVxuZnVuY3Rpb24gZXJyb3JlZChtZXNzYWdlOiBzdHJpbmcpOiBNY3BTZXJ2ZXJTdGF0ZSB7XG5cdHJldHVybiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5FcnJvciwgZXJyb3I6IHsgZXJyb3JUeXBlOiAndGVzdC1lcnJvcicsIG1lc3NhZ2UgfSB9O1xufVxuXG5jb25zdCBQTFVHSU5fQ1VTVE9NSVpBVElPTlM6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSA9IFtcblx0e1xuXHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRpZDogJ3BsdWdpbjpkZW1vJyxcblx0XHR1cmk6ICdmaWxlOi8vL3BsdWdpbnMvZGVtbycsXG5cdFx0bmFtZTogJ2RlbW8tcGx1Z2luJyxcblx0XHRjaGlsZHJlbjogW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRcdGlkOiAnbWNwLWNoaWxkOmRlbW86ZnMnLFxuXHRcdFx0XHR1cmk6ICdtY3AtY2hpbGQ6ZGVtbzpmcycsXG5cdFx0XHRcdG5hbWU6ICdmcycsXG5cdFx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdGFydGluZyB9LFxuXHRcdFx0fSxcblx0XHRdLFxuXHR9LFxuXTtcblxuc3VpdGUoJ01jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZW1wdHkgaW52ZW50b3J5IGRpc3BhdGNoZXMgbm90aGluZycsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIGFjdGlvbnMgfSA9IGhhcm5lc3Moc3RvcmUpO1xuXHRcdHN0b3JlLmFkZChjb250cm9sbGVyKTtcblxuXHRcdGNvbnRyb2xsZXIuYXBwbHlBbGwoW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLnRvcExldmVsQ3VzdG9taXphdGlvbnMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGlsZC1iYWNrZWQgc2VydmVyOiByZWFkeS9lcnJvci9yZWFkeSB0cmFuc2l0aW9ucyBvbmx5IHVwZGF0ZSBzdGF0ZStjaGFubmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgYWN0aW9ucyB9ID0gaGFybmVzcyhzdG9yZSwgeyBjdXN0b21pemF0aW9uczogUExVR0lOX0NVU1RPTUlaQVRJT05TIH0pO1xuXHRcdHN0b3JlLmFkZChjb250cm9sbGVyKTtcblxuXHRcdGNvbnRyb2xsZXIuYXBwbHlPbmUoc2VydmVyKCdmcycsIHJlYWR5KCkpKTtcblx0XHRjb250cm9sbGVyLmFwcGx5T25lKHNlcnZlcignZnMnLCBlcnJvcmVkKCdib29tJykpKTtcblx0XHRjb250cm9sbGVyLmFwcGx5T25lKHNlcnZlcignZnMnLCByZWFkeSgpKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMsIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhdGVDaGFuZ2VkLFxuXHRcdFx0XHRpZDogJ21jcC1jaGlsZDpkZW1vOmZzJyxcblx0XHRcdFx0c3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH0sXG5cdFx0XHRcdGNoYW5uZWw6ICdtY3A6Ly9jb3BpbG90L3Nlc3Npb24tMS9mcycsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGF0ZUNoYW5nZWQsXG5cdFx0XHRcdGlkOiAnbWNwLWNoaWxkOmRlbW86ZnMnLFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3IsIGVycm9yOiB7IGVycm9yVHlwZTogJ3Rlc3QtZXJyb3InLCBtZXNzYWdlOiAnYm9vbScgfSB9LFxuXHRcdFx0XHRjaGFubmVsOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGF0ZUNoYW5nZWQsXG5cdFx0XHRcdGlkOiAnbWNwLWNoaWxkOmRlbW86ZnMnLFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkgfSxcblx0XHRcdFx0Y2hhbm5lbDogJ21jcDovL2NvcGlsb3Qvc2Vzc2lvbi0xL2ZzJyxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLnRvcExldmVsQ3VzdG9taXphdGlvbnMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXJlIHNlcnZlciAobm8gY2hpbGQgbWF0Y2gpIGlzIHN1cmZhY2VkIGFzIGEgZnVsbCB0b3AtbGV2ZWwgY3VzdG9taXphdGlvbicsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIGFjdGlvbnMgfSA9IGhhcm5lc3Moc3RvcmUpO1xuXHRcdHN0b3JlLmFkZChjb250cm9sbGVyKTtcblxuXHRcdGNvbnRyb2xsZXIuYXBwbHlPbmUoc2VydmVyKCdzZWFyY2gnLCByZWFkeSgpKSk7XG5cblx0XHRjb25zdCBleHBlY3RlZElkID0gJ21jcC10b3AtbGV2ZWw6Y29waWxvdDpzZXNzaW9uLTE6c2VhcmNoJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMsIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRcdFx0aWQ6IGV4cGVjdGVkSWQsXG5cdFx0XHRcdFx0dXJpOiBleHBlY3RlZElkLFxuXHRcdFx0XHRcdG5hbWU6ICdzZWFyY2gnLFxuXHRcdFx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5SZWFkeSB9LFxuXHRcdFx0XHRcdGNoYW5uZWw6ICdtY3A6Ly9jb3BpbG90L3Nlc3Npb24tMS9zZWFyY2gnLFxuXHRcdFx0XHRcdG1jcEFwcDogeyBjYXBhYmlsaXRpZXM6IHsgc2VydmVyVG9vbHM6IHsgbGlzdENoYW5nZWQ6IHRydWUgfSwgc2VydmVyUmVzb3VyY2VzOiB7fSwgc2FtcGxpbmc6IHt9IH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLnRvcExldmVsQ3VzdG9taXphdGlvbnMoKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRcdGlkOiBleHBlY3RlZElkLFxuXHRcdFx0XHR1cmk6IGV4cGVjdGVkSWQsXG5cdFx0XHRcdG5hbWU6ICdzZWFyY2gnLFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkgfSxcblx0XHRcdFx0Y2hhbm5lbDogJ21jcDovL2NvcGlsb3Qvc2Vzc2lvbi0xL3NlYXJjaCcsXG5cdFx0XHRcdG1jcEFwcDogeyBjYXBhYmlsaXRpZXM6IHsgc2VydmVyVG9vbHM6IHsgbGlzdENoYW5nZWQ6IHRydWUgfSwgc2VydmVyUmVzb3VyY2VzOiB7fSwgc2FtcGxpbmc6IHt9IH0gfSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Bhc3NlcyBhIHBsdWdpbiBNQ1Agc2VydmVyIHNvdXJjZSBpbnRlcm5hbGx5IHdoZW4gaXQgaXMgdGVtcG9yYXJpbHkgc3VyZmFjZWQgdG9wLWxldmVsJywgKCkgPT4ge1xuXHRcdGxldCByZWNlaXZlZE93bmVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBhY3Rpb25zIH0gPSBoYXJuZXNzKHN0b3JlLCB7XG5cdFx0XHRwbHVnaW5NY3BTZXJ2ZXJTb3VyY2VzOiAoKSA9PiBuZXcgTWFwKFtbJ2F6dXJlJywgJ2ZpbGU6Ly8vcGx1Z2lucy9henVyZS1za2lsbHMnXV0pLFxuXHRcdFx0cmVzb2x2ZUVuYWJsZW1lbnQ6IChfc2VydmVyLCBvd25pbmdQbHVnaW5VcmkpID0+IHtcblx0XHRcdFx0cmVjZWl2ZWRPd25lciA9IG93bmluZ1BsdWdpblVyaTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0c3RvcmUuYWRkKGNvbnRyb2xsZXIpO1xuXG5cdFx0Y29udHJvbGxlci5hcHBseU9uZShzZXJ2ZXIoJ2F6dXJlJywgcmVhZHkoKSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9uID0gYWN0aW9uc1swXSBhcyBFeHRyYWN0PFNlc3Npb25BY3Rpb24sIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQgfT47XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi5jdXN0b21pemF0aW9uLnR5cGUsIEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcik7XG5cdFx0aWYgKGFjdGlvbi5jdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKE9iamVjdC5oYXNPd24oYWN0aW9uLmN1c3RvbWl6YXRpb24sICdvd25pbmdQbHVnaW5VcmknKSwgZmFsc2UpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVjZWl2ZWRPd25lciwgJ2ZpbGU6Ly8vcGx1Z2lucy9henVyZS1za2lsbHMnKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB0aGUgcmVzb2x2ZWQgZ2xvYmFsIGFuZCB3b3Jrc3BhY2UgZW5hYmxlbWVudCBmb3IgYSBwbHVnaW4gc2VydmVyIHRlbXBvcmFyaWx5IHN1cmZhY2VkIHRvcC1sZXZlbCcsICgpID0+IHtcblx0XHRjb25zdCBlbmFibGVtZW50ID0gW1xuXHRcdFx0eyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB1cmk6ICdmaWxlOi8vL3dvcmtzcGFjZScsIGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHR7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XSBhcyBjb25zdDtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIGFjdGlvbnMgfSA9IGhhcm5lc3Moc3RvcmUsIHtcblx0XHRcdHBsdWdpbk1jcFNlcnZlclNvdXJjZXM6ICgpID0+IG5ldyBNYXAoW1snYXp1cmUnLCAnZmlsZTovLy9wbHVnaW5zL2F6dXJlLXNraWxscyddXSksXG5cdFx0XHRyZXNvbHZlRW5hYmxlbWVudDogKCkgPT4gZW5hYmxlbWVudCxcblx0XHR9KTtcblx0XHRzdG9yZS5hZGQoY29udHJvbGxlcik7XG5cblx0XHRjb250cm9sbGVyLmFwcGx5T25lKHNlcnZlcignYXp1cmUnLCBzdG9wcGVkKCkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucywgW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkLFxuXHRcdFx0Y3VzdG9taXphdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRcdGlkOiAnbWNwLXRvcC1sZXZlbDpjb3BpbG90OnNlc3Npb24tMTphenVyZScsXG5cdFx0XHRcdHVyaTogJ21jcC10b3AtbGV2ZWw6Y29waWxvdDpzZXNzaW9uLTE6YXp1cmUnLFxuXHRcdFx0XHRuYW1lOiAnYXp1cmUnLFxuXHRcdFx0XHRlbmFibGVtZW50LFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZCB9LFxuXHRcdFx0XHRjaGFubmVsOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1jcEFwcDogeyBjYXBhYmlsaXRpZXM6IHsgc2VydmVyVG9vbHM6IHsgbGlzdENoYW5nZWQ6IHRydWUgfSwgc2VydmVyUmVzb3VyY2VzOiB7fSwgc2FtcGxpbmc6IHt9IH0gfSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdub24tcmVhZHkgYmFyZSBzZXJ2ZXIgaGFzIG5vIGNoYW5uZWwgYnV0IHN0aWxsIGFkdmVydGlzZXMgbWNwQXBwIChzdGF0aWMgY2FwYWJpbGl0eSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBhY3Rpb25zIH0gPSBoYXJuZXNzKHN0b3JlKTtcblx0XHRzdG9yZS5hZGQoY29udHJvbGxlcik7XG5cblx0XHRjb250cm9sbGVyLmFwcGx5T25lKHNlcnZlcignc2VhcmNoJywgc3RhcnRpbmcoKSkpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWRJZCA9ICdtY3AtdG9wLWxldmVsOmNvcGlsb3Q6c2Vzc2lvbi0xOnNlYXJjaCc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLFxuXHRcdFx0XHRcdGlkOiBleHBlY3RlZElkLFxuXHRcdFx0XHRcdHVyaTogZXhwZWN0ZWRJZCxcblx0XHRcdFx0XHRuYW1lOiAnc2VhcmNoJyxcblx0XHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RhcnRpbmcgfSxcblx0XHRcdFx0XHRjaGFubmVsOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bWNwQXBwOiB7IGNhcGFiaWxpdGllczogeyBzZXJ2ZXJUb29sczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSB9LCBzZXJ2ZXJSZXNvdXJjZXM6IHt9LCBzYW1wbGluZzoge30gfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZpbmcgYSBiYXJlIHRvcC1sZXZlbCBzZXJ2ZXIgZW1pdHMgU2Vzc2lvbkN1c3RvbWl6YXRpb25SZW1vdmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgYWN0aW9ucyB9ID0gaGFybmVzcyhzdG9yZSk7XG5cdFx0c3RvcmUuYWRkKGNvbnRyb2xsZXIpO1xuXG5cdFx0Y29udHJvbGxlci5hcHBseU9uZShzZXJ2ZXIoJ3NlYXJjaCcsIHJlYWR5KCkpKTtcblx0XHRhY3Rpb25zLmxlbmd0aCA9IDA7XG5cdFx0Y29udHJvbGxlci5yZW1vdmUoJ3NlYXJjaCcpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWRJZCA9ICdtY3AtdG9wLWxldmVsOmNvcGlsb3Q6c2Vzc2lvbi0xOnNlYXJjaCc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25SZW1vdmVkLFxuXHRcdFx0XHRpZDogZXhwZWN0ZWRJZCxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLnRvcExldmVsQ3VzdG9taXphdGlvbnMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseUFsbCByZW1vdmVzIHNlcnZlcnMgbm8gbG9uZ2VyIHByZXNlbnQgKGNoaWxkKSBhbmQgZW1pdHMgU3RvcHBlZCcsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIGFjdGlvbnMgfSA9IGhhcm5lc3Moc3RvcmUsIHsgY3VzdG9taXphdGlvbnM6IFBMVUdJTl9DVVNUT01JWkFUSU9OUyB9KTtcblx0XHRzdG9yZS5hZGQoY29udHJvbGxlcik7XG5cblx0XHRjb250cm9sbGVyLmFwcGx5QWxsKFtzZXJ2ZXIoJ2ZzJywgcmVhZHkoKSldKTtcblx0XHRjb250cm9sbGVyLmFwcGx5QWxsKFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucywgW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGF0ZUNoYW5nZWQsXG5cdFx0XHRcdGlkOiAnbWNwLWNoaWxkOmRlbW86ZnMnLFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkgfSxcblx0XHRcdFx0Y2hhbm5lbDogJ21jcDovL2NvcGlsb3Qvc2Vzc2lvbi0xL2ZzJyxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0YXRlQ2hhbmdlZCxcblx0XHRcdFx0aWQ6ICdtY3AtY2hpbGQ6ZGVtbzpmcycsXG5cdFx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW50aW1lU3RhdGVzIHNuYXBzaG90cyBjaGlsZCBhbmQgdG9wLWxldmVsIHNlcnZlcnMgYnkgY3VzdG9taXphdGlvbiBpZCcsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIgfSA9IGhhcm5lc3Moc3RvcmUsIHsgY3VzdG9taXphdGlvbnM6IFBMVUdJTl9DVVNUT01JWkFUSU9OUyB9KTtcblx0XHRzdG9yZS5hZGQoY29udHJvbGxlcik7XG5cblx0XHRjb250cm9sbGVyLmFwcGx5T25lKHNlcnZlcignZnMnLCByZWFkeSgpKSk7XG5cdFx0Y29udHJvbGxlci5hcHBseU9uZShzZXJ2ZXIoJ3NlYXJjaCcsIHN0YXJ0aW5nKCkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udHJvbGxlci5ydW50aW1lU3RhdGVzLmdldCgpLCBuZXcgTWFwKFtcblx0XHRcdFsnbWNwLWNoaWxkOmRlbW86ZnMnLCB7IHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5SZWFkeSB9LCBjaGFubmVsOiAnbWNwOi8vY29waWxvdC9zZXNzaW9uLTEvZnMnIH1dLFxuXHRcdFx0WydtY3AtdG9wLWxldmVsOmNvcGlsb3Q6c2Vzc2lvbi0xOnNlYXJjaCcsIHsgc3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nIH0sIGNoYW5uZWw6IHVuZGVmaW5lZCB9XSxcblx0XHRdKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuc2VydmVyTmFtZUZvckN1c3RvbWl6YXRpb25JZCgnbWNwLWNoaWxkOmRlbW86ZnMnKSwgJ2ZzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuc2VydmVyTmFtZUZvckN1c3RvbWl6YXRpb25JZCgnbWNwLXRvcC1sZXZlbDpjb3BpbG90OnNlc3Npb24tMTpzZWFyY2gnKSwgJ3NlYXJjaCcpO1xuXG5cdFx0Y29udHJvbGxlci5yZW1vdmUoJ2ZzJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY29udHJvbGxlci5ydW50aW1lU3RhdGVzLmdldCgpLmtleXMoKV0sIFsnbWNwLXRvcC1sZXZlbDpjb3BpbG90OnNlc3Npb24tMTpzZWFyY2gnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvcC1sZXZlbCBlbnRyeSBzdGF5cyB0b3AtbGV2ZWwgYWNyb3NzIHVwZGF0ZXMgKGlkIHN0YWJsZSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBhY3Rpb25zIH0gPSBoYXJuZXNzKHN0b3JlKTtcblx0XHRzdG9yZS5hZGQoY29udHJvbGxlcik7XG5cblx0XHRjb250cm9sbGVyLmFwcGx5T25lKHNlcnZlcignc2VhcmNoJywgc3RhcnRpbmcoKSkpO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlPbmUoc2VydmVyKCdzZWFyY2gnLCByZWFkeSgpKSk7XG5cdFx0Y29udHJvbGxlci5hcHBseU9uZShzZXJ2ZXIoJ3NlYXJjaCcsIHN0b3BwZWQoKSkpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWRJZCA9ICdtY3AtdG9wLWxldmVsOmNvcGlsb3Q6c2Vzc2lvbi0xOnNlYXJjaCc7XG5cdFx0Y29uc3QgaWRzID0gYWN0aW9uc1xuXHRcdFx0LmZpbHRlcihhID0+IGEudHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQpXG5cdFx0XHQubWFwKGEgPT4gKGEgYXMgeyBjdXN0b21pemF0aW9uOiB7IGlkOiBzdHJpbmcgfSB9KS5jdXN0b21pemF0aW9uLmlkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGlkcywgW2V4cGVjdGVkSWQsIGV4cGVjdGVkSWQsIGV4cGVjdGVkSWRdKTtcblx0fSk7XG5cblx0dGVzdCgnYmFyZSBzZXJ2ZXIgcHVibGlzaGVzIHJlZHVjZXItYmFja2VkIGVuYWJsZW1lbnQgYWNyb3NzIHJ1bnRpbWUgdXBkYXRlcycsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIGFjdGlvbnMgfSA9IGhhcm5lc3Moc3RvcmUsIHsgZGVzaXJlZEVuYWJsZWQ6IGZhbHNlIH0pO1xuXHRcdHN0b3JlLmFkZChjb250cm9sbGVyKTtcblxuXHRcdGNvbnRyb2xsZXIuYXBwbHlPbmUoc2VydmVyKCdzZWFyY2gnLCBhdXRoUmVxdWlyZWQoKSkpO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlPbmUoc2VydmVyKCdzZWFyY2gnLCBzdGFydGluZygpKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnNcblx0XHRcdC5maWx0ZXIoYWN0aW9uID0+IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZClcblx0XHRcdC5tYXAoYWN0aW9uID0+IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZCAmJiBhY3Rpb24uY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIgPyBpc0N1c3RvbWl6YXRpb25FbmFibGVkKGFjdGlvbi5jdXN0b21pemF0aW9uKSA6IHVuZGVmaW5lZCksIFtmYWxzZSwgZmFsc2VdKTtcblx0fSk7XG5cblx0dGVzdCgnd29ya3NwYWNlIHBsdWdpbiBlbmFibGVtZW50IG1hc2tzIGFuZCByZXN0b3JlcyBpdHMgY2hpbGQgTUNQIHNlcnZlciB3aXRob3V0IGNoYW5naW5nIHRoZSBjaGlsZCBkZWNpc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBjaGlsZDogTWNwU2VydmVyQ3VzdG9taXphdGlvbiA9IHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcixcblx0XHRcdGlkOiAnbWNwLWNoaWxkOmRlbW86ZnMnLFxuXHRcdFx0dXJpOiAnbWNwLWNoaWxkOmRlbW86ZnMnLFxuXHRcdFx0bmFtZTogJ2ZzJyxcblx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IHRydWUgfV0sXG5cdFx0XHRzdGF0ZTogc3RhcnRpbmcoKSxcblx0XHR9O1xuXHRcdGNvbnN0IHBsdWdpbjogUGx1Z2luQ3VzdG9taXphdGlvbiA9IHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdGlkOiAncGx1Z2luOmRlbW8nLFxuXHRcdFx0dXJpOiAnZmlsZTovLy9wbHVnaW5zL2RlbW8nLFxuXHRcdFx0bmFtZTogJ2RlbW8tcGx1Z2luJyxcblx0XHRcdGNoaWxkcmVuOiBbY2hpbGRdLFxuXHRcdH07XG5cdFx0Y29uc3QgZGlzYWJsZWRQbHVnaW46IFBsdWdpbkN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHQuLi5wbHVnaW4sXG5cdFx0XHRlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB1cmk6ICdmaWxlOi8vL3dvcmtzcGFjZScsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdH07XG5cblx0XHRjb25zdCBlZmZlY3RpdmUgPSBbcGx1Z2luLCBkaXNhYmxlZFBsdWdpbiwgcGx1Z2luXS5tYXAoY3VzdG9taXphdGlvbiA9PlxuXHRcdFx0Z2V0RWZmZWN0aXZlTWNwU2VydmVyQ3VzdG9taXphdGlvbnMoW2N1c3RvbWl6YXRpb25dKS5tYXAoKHsgc2VydmVyLCBlbmFibGVkIH0pID0+ICh7XG5cdFx0XHRcdGlkOiBzZXJ2ZXIuaWQsXG5cdFx0XHRcdGVuYWJsZW1lbnQ6IHNlcnZlci5lbmFibGVtZW50LFxuXHRcdFx0XHRlbmFibGVkLFxuXHRcdFx0fSkpXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWZmZWN0aXZlLCBbXG5cdFx0XHRbeyBpZDogJ21jcC1jaGlsZDpkZW1vOmZzJywgZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogdHJ1ZSB9XSwgZW5hYmxlZDogdHJ1ZSB9XSxcblx0XHRcdFt7IGlkOiAnbWNwLWNoaWxkOmRlbW86ZnMnLCBlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiB0cnVlIH1dLCBlbmFibGVkOiBmYWxzZSB9XSxcblx0XHRcdFt7IGlkOiAnbWNwLWNoaWxkOmRlbW86ZnMnLCBlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiB0cnVlIH1dLCBlbmFibGVkOiB0cnVlIH1dLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRoUmVxdWlyZWQgc3RhdGUgaXMgcHJlc2VydmVkIGFjcm9zcyBjb2Fyc2Ugc3RhcnRpbmcgdXBkYXRlcycsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIGFjdGlvbnMgfSA9IGhhcm5lc3Moc3RvcmUsIHsgY3VzdG9taXphdGlvbnM6IFBMVUdJTl9DVVNUT01JWkFUSU9OUyB9KTtcblx0XHRzdG9yZS5hZGQoY29udHJvbGxlcik7XG5cblx0XHRjb25zdCBhdXRoU3RhdGUgPSBhdXRoUmVxdWlyZWQoKTtcblx0XHRjb250cm9sbGVyLmFwcGx5T25lKHNlcnZlcignZnMnLCBhdXRoU3RhdGUpKTtcblx0XHRjb250cm9sbGVyLmFwcGx5T25lKHNlcnZlcignZnMnLCBzdGFydGluZygpKSk7XG5cdFx0Y29udHJvbGxlci5hcHBseU9uZShzZXJ2ZXIoJ2ZzJywgcmVhZHkoKSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0YXRlQ2hhbmdlZCxcblx0XHRcdFx0aWQ6ICdtY3AtY2hpbGQ6ZGVtbzpmcycsXG5cdFx0XHRcdHN0YXRlOiBhdXRoU3RhdGUsXG5cdFx0XHRcdGNoYW5uZWw6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0YXRlQ2hhbmdlZCxcblx0XHRcdFx0aWQ6ICdtY3AtY2hpbGQ6ZGVtbzpmcycsXG5cdFx0XHRcdHN0YXRlOiBhdXRoU3RhdGUsXG5cdFx0XHRcdGNoYW5uZWw6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0YXRlQ2hhbmdlZCxcblx0XHRcdFx0aWQ6ICdtY3AtY2hpbGQ6ZGVtbzpmcycsXG5cdFx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5SZWFkeSB9LFxuXHRcdFx0XHRjaGFubmVsOiAnbWNwOi8vY29waWxvdC9zZXNzaW9uLTEvZnMnLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VNY3BDaGFubmVsVXJpIHJvdW5kLXRyaXBzIHRoZSBjb250cm9sbGVyLW1pbnRlZCBjaGFubmVsIFVSSScsICgpID0+IHtcblx0XHRjb25zdCBjaGFubmVsID0gJ21jcDovL2NvcGlsb3Qvc2Vzc2lvbi0xL2ZzJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTWNwQ2hhbm5lbFVyaShjaGFubmVsKSwge1xuXHRcdFx0cHJvdmlkZXJJZDogJ2NvcGlsb3QnLFxuXHRcdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdHNlcnZlck5hbWU6ICdmcycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlTWNwQ2hhbm5lbFVyaSBkZWNvZGVzIFVSTC1lbmNvZGVkIHBhdGggc2VnbWVudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhbm5lbCA9ICdtY3A6Ly9jb3BpbG90L3Nlc3Npb24lMkYxL215JTIwc2VydmVyJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTWNwQ2hhbm5lbFVyaShjaGFubmVsKSwge1xuXHRcdFx0cHJvdmlkZXJJZDogJ2NvcGlsb3QnLFxuXHRcdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbi8xJyxcblx0XHRcdHNlcnZlck5hbWU6ICdteSBzZXJ2ZXInLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZU1jcENoYW5uZWxVcmkgcmVqZWN0cyBtYWxmb3JtZWQgaW5wdXRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZU1jcENoYW5uZWxVcmkoJ2h0dHBzOi8vY29waWxvdC94L3knKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VNY3BDaGFubmVsVXJpKCdtY3A6Ly8nKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VNY3BDaGFubmVsVXJpKCdtY3A6Ly8vc2Vzc2lvbi9zZXJ2ZXInKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VNY3BDaGFubmVsVXJpKCdtY3A6Ly9jb3BpbG90L3Nlc3Npb24tb25seScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZU1jcENoYW5uZWxVcmkoJ21jcDovL2NvcGlsb3Qvc2Vzc2lvbi8nKSwgdW5kZWZpbmVkKTtcblx0XHQvLyBCYWQgcGVyY2VudCBlc2NhcGVzIG11c3Qgbm90IHRocm93IFx1MjAxNCBjYWxsZXIgdHVybnMgdW5kZWZpbmVkXG5cdFx0Ly8gaW50byBhIGNsZWFuIE1ldGhvZCBub3QgZm91bmQsIG5vdCBhbiBpbnRlcm5hbCBlcnJvci5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VNY3BDaGFubmVsVXJpKCdtY3A6Ly9jb3BpbG90L2JhZCUvc2VydmVyJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlTWNwQ2hhbm5lbFVyaSgnbWNwOi8vY29waWxvdC9zZXNzaW9uL2JhZCUyJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRNY3BDaGlsZElkIGZpbmRzIGJhcmUgdG9wLWxldmVsIGVudHJpZXMgYW5kIHBsdWdpbiBjaGlsZHJlbicsICgpID0+IHtcblx0XHRjb25zdCBjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdID0gW1xuXHRcdFx0Li4uUExVR0lOX0NVU1RPTUlaQVRJT05TLFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRcdGlkOiAnbWNwLXRvcC1sZXZlbDp0ZXN0OnNlYXJjaCcsXG5cdFx0XHRcdHVyaTogJ21jcC10b3AtbGV2ZWw6dGVzdDpzZWFyY2gnLFxuXHRcdFx0XHRuYW1lOiAnc2VhcmNoJyxcblx0XHRcdFx0c3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE1jcENoaWxkSWQoY3VzdG9taXphdGlvbnMsICdmcycpLCAnbWNwLWNoaWxkOmRlbW86ZnMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE1jcENoaWxkSWQoY3VzdG9taXphdGlvbnMsICdzZWFyY2gnKSwgJ21jcC10b3AtbGV2ZWw6dGVzdDpzZWFyY2gnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE1jcENoaWxkSWQoY3VzdG9taXphdGlvbnMsICdtaXNzaW5nJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRNY3BTZXJ2ZXJOYW1lIGZpbmRzIGJhcmUgdG9wLWxldmVsIGVudHJpZXMgYW5kIHBsdWdpbiBjaGlsZHJlbicsICgpID0+IHtcblx0XHRjb25zdCBjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdID0gW1xuXHRcdFx0Li4uUExVR0lOX0NVU1RPTUlaQVRJT05TLFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRcdGlkOiAnbWNwLXRvcC1sZXZlbDp0ZXN0OnNlYXJjaCcsXG5cdFx0XHRcdHVyaTogJ21jcC10b3AtbGV2ZWw6dGVzdDpzZWFyY2gnLFxuXHRcdFx0XHRuYW1lOiAnc2VhcmNoJyxcblx0XHRcdFx0c3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE1jcFNlcnZlck5hbWUoY3VzdG9taXphdGlvbnMsICdtY3AtY2hpbGQ6ZGVtbzpmcycpLCAnZnMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE1jcFNlcnZlck5hbWUoY3VzdG9taXphdGlvbnMsICdtY3AtdG9wLWxldmVsOnRlc3Q6c2VhcmNoJyksICdzZWFyY2gnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE1jcFNlcnZlck5hbWUoY3VzdG9taXphdGlvbnMsICdtaXNzaW5nJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkIsbUJBQW1CLHVCQUF1QixpQkFBaUIscUJBQW1KO0FBRXBQLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUNBQXFDLDRCQUE0QixnQkFBZ0IsbUJBQW1CLDBCQUE4QztBQUUzSixTQUFTLFFBQVEsT0FBcUMsT0FLbEQsQ0FBQyxHQUFHO0FBQ1AsUUFBTSxVQUEyQixDQUFDO0FBQ2xDLFFBQU0sZUFBZSxNQUFNLElBQUksSUFBSSxzQkFBc0IsSUFBSSxlQUFlLENBQUMsQ0FBQztBQUM5RSxRQUFNLGFBQWEsYUFBYSxJQUFJLFdBQVcsV0FBVztBQUMxRCxRQUFNLFVBQVUsV0FBVyxTQUFTO0FBQ3BDLGVBQWEsY0FBYztBQUFBLElBQzFCLFVBQVU7QUFBQSxJQUNWLFVBQVU7QUFBQSxJQUNWLE9BQU87QUFBQSxJQUNQLFFBQVEsY0FBYztBQUFBLElBQ3RCLFlBQVcsb0JBQUksS0FB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
