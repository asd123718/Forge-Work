import assert from "assert";
import * as DOM from "../../../../../../base/browser/dom.js";
import { Button, unthemedButtonStyles } from "../../../../../../base/browser/ui/button/button.js";
import { URI } from "../../../../../../base/common/uri.js";
import { Action, Separator } from "../../../../../../base/common/actions.js";
import { isDisposable } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CustomizationEnablementKind, McpServerStatus } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { ContributionEnablementState } from "../../../common/enablement.js";
import { DisableMcpServerForWorkspaceAction, DisableMcpServerGloballyAction, EnableMcpServerForWorkspaceAction, EnableMcpServerGloballyAction } from "../../../../mcp/browser/mcpServerActions.js";
import {
  authenticateMcpServer,
  createBuiltinActiveSessionMcpEntries,
  getActiveSessionServerLifecycleAction,
  getActiveSessionServerPresentation,
  getBuiltinMcpServerEnablementActions,
  getActiveSessionServerOptionsActions,
  getAgentHostMcpServerEnablementActions,
  getLocalMcpServerEnablementActions,
  getMcpServerOutputHandler,
  getMcpStatusPresentation,
  getServerItemContextMenuActions,
  registerMcpInlineButtonAction
} from "../../../browser/aiCustomization/mcpListWidget.js";
function createAgentHostServer(overrides = {}) {
  return {
    id: "server-1",
    name: "Server One",
    enabled: true,
    status: McpServerStatus.Ready,
    state: { kind: McpServerStatus.Ready },
    setEnabled: () => {
    },
    start: () => {
    },
    stop: () => {
    },
    ...overrides
  };
}
function createAgentHostCustomizations(hasWorkspace = true) {
  const calls = [];
  const service = {
    getWorkingDirectories: () => hasWorkspace ? ["file:///workspace"] : [],
    setCustomizationEnablement: (sessionResource, serverId, enablement, kind, enabled) => {
      calls.push([sessionResource, serverId, enablement, kind, enabled]);
    }
  };
  return { service, calls };
}
function createAgentPluginService(calls) {
  return {
    enablementModel: { setEnabled: (...args) => calls?.push(args) }
  };
}
function createMcpService(enablement) {
  const calls = [];
  const service = {
    enablementModel: {
      readEnabled: () => enablement,
      setEnabled: (key, state) => {
        calls.push([key, state]);
      }
    }
  };
  return { service, calls };
}
function runAction(action) {
  assert.ok(action, "expected an action to be defined");
  void action.run();
}
function trackActions(store, actions) {
  for (const action of actions) {
    if (isDisposable(action)) {
      store.add(action);
    }
  }
  return [...actions];
}
suite("mcpListWidget", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("classifies active-session-only MCP servers as built-in entries", () => {
    const server = createAgentHostServer({ name: "node_repl" });
    assert.deepStrictEqual(createBuiltinActiveSessionMcpEntries([server]), [{
      type: "session-server-item",
      server
    }]);
  });
  test("renders host-published disabled reasons without changing legacy rows", () => {
    assert.deepStrictEqual([
      getMcpStatusPresentation("disabled", { source: "scope", scope: CustomizationEnablementKind.Global })?.label,
      getMcpStatusPresentation("disabled", { source: "scope", scope: CustomizationEnablementKind.Workspace })?.label,
      getMcpStatusPresentation("disabled", { source: "scope", scope: CustomizationEnablementKind.Session })?.label,
      getMcpStatusPresentation("disabled", { source: "plugin", plugin: { id: "plugin-1", name: "Plugin One", uri: URI.file("/plugins/plugin-1").toString(), enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: "file:///workspace", enabled: false }] } })?.label,
      getMcpStatusPresentation(McpServerStatus.Ready)?.label,
      getMcpStatusPresentation("disabled")?.label
    ], [
      "Disabled",
      "Disabled (Workspace)",
      "Disabled (Session)",
      "Disabled (Plugin)",
      "Running",
      "Disabled"
    ]);
  });
  test("uses the current active-session server enablement for rows and lifecycle actions", () => {
    const disabledServer = createAgentHostServer({ enabled: false });
    const enabledServer = createAgentHostServer({ enabled: true });
    const disabledLifecycleAction = getActiveSessionServerLifecycleAction(disabledServer);
    const enabledLifecycleAction = getActiveSessionServerLifecycleAction(enabledServer);
    if (disabledLifecycleAction) {
      disposables.add(disabledLifecycleAction);
    }
    if (enabledLifecycleAction) {
      disposables.add(enabledLifecycleAction);
    }
    assert.deepStrictEqual([
      {
        renderedDisabled: getActiveSessionServerPresentation(disabledServer).status === "disabled",
        hasLifecycleAction: disabledLifecycleAction !== void 0
      },
      {
        renderedDisabled: getActiveSessionServerPresentation(enabledServer).status === "disabled",
        hasLifecycleAction: enabledLifecycleAction !== void 0
      }
    ], [
      { renderedDisabled: true, hasLifecycleAction: false },
      { renderedDisabled: false, hasLifecycleAction: true }
    ]);
  });
  test("uses active-session enablement for both the row and built-in context menu", () => {
    const sessionResource = URI.parse("vscode-agent-session:///session-1");
    const server = createAgentHostServer({
      enabled: false,
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
    });
    const { service: mcpService } = createMcpService(ContributionEnablementState.EnabledProfile);
    const { service: agentHostService } = createAgentHostCustomizations();
    const actions = trackActions(disposables, getBuiltinMcpServerEnablementActions(
      mcpService,
      "server-def-id",
      false,
      agentHostService,
      createAgentPluginService(),
      sessionResource,
      server
    ));
    assert.deepStrictEqual({
      renderedStatus: getActiveSessionServerPresentation(server).status,
      contextMenuActions: actions.map((action) => action.label)
    }, {
      renderedStatus: "disabled",
      contextMenuActions: ["Enable", "Enable (Workspace)", "Enable (Session)"]
    });
  });
  suite("getAgentHostMcpServerEnablementActions", () => {
    const sessionResource = URI.parse("vscode-agent-session:///session-1");
    test("offers the scoped action matrix", () => {
      const cases = [
        ["no decisions", createAgentHostServer(), ["Disable", "Disable (Workspace)", "Disable (Session)"]],
        ["global disabled", createAgentHostServer({ enabled: false, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] }), ["Enable", "Enable (Workspace)", "Enable (Session)"]],
        ["workspace disabled", createAgentHostServer({ enabled: false, enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: "file:///workspace", enabled: false }] }), ["Disable", "Enable (Workspace)", "Enable (Session)"]],
        ["session disabled", createAgentHostServer({ enabled: false, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }] }), ["Disable", "Disable (Workspace)", "Enable (Session)"]]
      ];
      for (const [, server, expected] of cases) {
        const { service } = createAgentHostCustomizations();
        assert.deepStrictEqual(trackActions(disposables, getAgentHostMcpServerEnablementActions(service, createAgentPluginService(), sessionResource, server)).map((action) => action.label), expected);
      }
    });
    test("preserves explicit decisions and omits workspace actions without a workspace", () => {
      const { service, calls } = createAgentHostCustomizations(false);
      const server = createAgentHostServer({ enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }] });
      const actions = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, createAgentPluginService(), sessionResource, server));
      assert.deepStrictEqual(actions.map((action) => action.label), ["Enable", "Enable (Session)"]);
      runAction(actions[1]);
      assert.deepStrictEqual(calls, [[sessionResource, server.id, server.enablement, CustomizationEnablementKind.Session, true]]);
    });
    test("offers only Enable Plugin for a server disabled by its plugin", () => {
      const { service, calls } = createAgentHostCustomizations();
      const pluginEnablement = [
        { kind: CustomizationEnablementKind.Session, enabled: false },
        { kind: CustomizationEnablementKind.Workspace, uri: "file:///workspace", enabled: true },
        { kind: CustomizationEnablementKind.Global, enabled: false }
      ];
      const server = createAgentHostServer({
        enabled: false,
        enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
        disabledReason: { source: "plugin", plugin: { id: "plugin-1", name: "Plugin One", uri: URI.file("/plugins/plugin-1").toString(), enablement: pluginEnablement } }
      });
      const actions = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, createAgentPluginService(), sessionResource, server));
      assert.deepStrictEqual(actions.map((action) => action.label), ["Enable Plugin"]);
      runAction(actions[0]);
      assert.deepStrictEqual(calls, [[sessionResource, "plugin-1", pluginEnablement, CustomizationEnablementKind.Session, true]]);
    });
    test("enables a client-published plugin globally through the client", () => {
      const { service, calls: hostCalls } = createAgentHostCustomizations();
      const clientCalls = [];
      const pluginUri = URI.file("/plugins/plugin-1");
      const server = createAgentHostServer({
        enabled: false,
        disabledReason: {
          source: "plugin",
          plugin: {
            id: "plugin-1",
            name: "Plugin One",
            uri: pluginUri.toString(),
            clientId: "client-1",
            enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
          }
        }
      });
      const [action] = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, createAgentPluginService(clientCalls), sessionResource, server));
      runAction(action);
      assert.deepStrictEqual({ clientCalls, hostCalls }, {
        clientCalls: [[pluginUri.toString(), ContributionEnablementState.EnabledProfile]],
        hostCalls: []
      });
    });
    test("offers the inverse session action and preserves all decisions when dispatching", () => {
      const cases = [
        [createAgentHostServer(), "Disable (Session)", false],
        [createAgentHostServer({
          enabled: false,
          enablement: [
            { kind: CustomizationEnablementKind.Session, enabled: false },
            { kind: CustomizationEnablementKind.Workspace, uri: "file:///workspace", enabled: false },
            { kind: CustomizationEnablementKind.Global, enabled: false }
          ]
        }), "Enable (Session)", true]
      ];
      for (const [server, label, enabled] of cases) {
        const { service, calls } = createAgentHostCustomizations();
        const [action] = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, createAgentPluginService(), sessionResource, server, ["session"]));
        assert.deepStrictEqual({ label: action.label, calls }, { label, calls: [] });
        runAction(action);
        assert.deepStrictEqual(calls, [[sessionResource, server.id, server.enablement, CustomizationEnablementKind.Session, enabled]]);
      }
    });
  });
  suite("getServerItemContextMenuActions", () => {
    const sessionResource = URI.parse("vscode-agent-session:///session-1");
    test("replaces the VS Code workspace action with agent-host workspace and session actions", () => {
      const { service, calls } = createAgentHostCustomizations();
      const server = createAgentHostServer({
        enabled: false,
        enablement: [
          { kind: CustomizationEnablementKind.Session, enabled: false },
          { kind: CustomizationEnablementKind.Workspace, uri: "file:///workspace", enabled: false },
          { kind: CustomizationEnablementKind.Global, enabled: false }
        ]
      });
      const agentHostActions = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, createAgentPluginService(), sessionResource, server, ["workspace", "session"]));
      const localActions = trackActions(disposables, [
        new Action(DisableMcpServerGloballyAction.ID, "Disable"),
        new Action(DisableMcpServerForWorkspaceAction.ID, "Disable (Workspace)"),
        new Action("unrelated", "Unrelated")
      ]);
      const actions = getServerItemContextMenuActions(
        [
          localActions
        ],
        server,
        void 0,
        agentHostActions
      );
      assert.deepStrictEqual(actions.filter((action) => !(action instanceof Separator)).map((action) => action.label), [
        "Disable",
        "Unrelated",
        "Enable (Workspace)",
        "Enable (Session)"
      ]);
      runAction(actions.find((action) => action.label === "Enable (Workspace)"));
      runAction(actions.find((action) => action.label === "Enable (Session)"));
      assert.deepStrictEqual(calls, [
        [sessionResource, server.id, server.enablement, CustomizationEnablementKind.Workspace, true],
        [sessionResource, server.id, server.enablement, CustomizationEnablementKind.Session, true]
      ]);
    });
    test("keeps the VS Code-owned enablement set without an active agent-host session", () => {
      const localActions = trackActions(disposables, [
        new Action(EnableMcpServerGloballyAction.ID, "Enable"),
        new Action(EnableMcpServerForWorkspaceAction.ID, "Enable (Workspace)"),
        new Action(DisableMcpServerGloballyAction.ID, "Disable"),
        new Action(DisableMcpServerForWorkspaceAction.ID, "Disable (Workspace)")
      ]);
      const actions = getServerItemContextMenuActions([localActions], void 0, void 0, []);
      assert.deepStrictEqual(actions.filter((action) => !(action instanceof Separator)).map((action) => action.label), localActions.map((action) => action.label));
    });
  });
  suite("getLocalMcpServerEnablementActions", () => {
    test("offers Disable + Disable (Workspace) when enabled and workbench has a workspace", () => {
      const { service, calls } = createMcpService(ContributionEnablementState.EnabledProfile);
      const actions = trackActions(disposables, getLocalMcpServerEnablementActions(service, "server-def-id", false));
      assert.deepStrictEqual(actions.map((a) => a.label), ["Disable", "Disable (Workspace)"]);
      runAction(actions[0]);
      assert.deepStrictEqual(calls, [["server-def-id", ContributionEnablementState.DisabledProfile]]);
    });
    suite("getBuiltinMcpServerEnablementActions", () => {
      const sessionResource = URI.parse("vscode-agent-session:///session-1");
      test("routes workspace and session actions to the active agent-host session", () => {
        const { service: mcpService, calls: localCalls } = createMcpService(ContributionEnablementState.EnabledProfile);
        const { service: agentHostService, calls: agentHostCalls } = createAgentHostCustomizations();
        const server = createAgentHostServer({
          enabled: false,
          enablement: [
            { kind: CustomizationEnablementKind.Global, enabled: false },
            { kind: CustomizationEnablementKind.Workspace, uri: "file:///workspace", enabled: false }
          ]
        });
        const actions = trackActions(disposables, getBuiltinMcpServerEnablementActions(mcpService, "server-def-id", false, agentHostService, createAgentPluginService(), sessionResource, server));
        assert.deepStrictEqual(actions.map((action) => action.label), ["Enable", "Enable (Workspace)", "Enable (Session)"]);
        runAction(actions[0]);
        runAction(actions[1]);
        runAction(actions[2]);
        assert.deepStrictEqual({
          localCalls,
          agentHostCalls
        }, {
          localCalls: [["server-def-id", ContributionEnablementState.EnabledProfile]],
          agentHostCalls: [
            [sessionResource, server.id, server.enablement, CustomizationEnablementKind.Workspace, true],
            [sessionResource, server.id, server.enablement, CustomizationEnablementKind.Session, true]
          ]
        });
      });
      test("routes global enablement through the host for a client-forwarded plugin child", () => {
        const { service: mcpService, calls: localCalls } = createMcpService(ContributionEnablementState.EnabledProfile);
        const { service: agentHostService, calls: agentHostCalls } = createAgentHostCustomizations();
        const server = createAgentHostServer({
          id: "azure",
          isPluginProvided: true,
          owningPluginClientId: "forwarded-plugin-client"
        });
        const actions = trackActions(disposables, getBuiltinMcpServerEnablementActions(mcpService, "azure", false, agentHostService, createAgentPluginService(), sessionResource, server));
        runAction(actions[0]);
        assert.deepStrictEqual({
          labels: actions.map((action) => action.label),
          agentHostCalls,
          localCalls
        }, {
          labels: ["Disable", "Disable (Workspace)", "Disable (Session)"],
          agentHostCalls: [[sessionResource, "azure", void 0, CustomizationEnablementKind.Global, false]],
          localCalls: []
        });
      });
      test("routes global enablement locally for a client-bundled plugin child", () => {
        const { service: mcpService, calls: localCalls } = createMcpService(ContributionEnablementState.EnabledProfile);
        const { service: agentHostService, calls: agentHostCalls } = createAgentHostCustomizations();
        const server = createAgentHostServer({
          id: "azure",
          isPluginProvided: true,
          isClientBundled: true,
          owningPluginClientId: "forwarded-plugin-client"
        });
        const actions = trackActions(disposables, getBuiltinMcpServerEnablementActions(mcpService, "azure", false, agentHostService, createAgentPluginService(), sessionResource, server));
        runAction(actions[0]);
        assert.deepStrictEqual({
          labels: actions.map((action) => action.label),
          agentHostCalls,
          localCalls
        }, {
          labels: ["Disable", "Disable (Workspace)", "Disable (Session)"],
          agentHostCalls: [],
          localCalls: [["azure", ContributionEnablementState.DisabledProfile]]
        });
      });
      test("keeps the client-bundled row presentation and menu in sync after a global change", () => {
        const { service: enabledMcpService } = createMcpService(ContributionEnablementState.EnabledProfile);
        const { service: disabledMcpService } = createMcpService(ContributionEnablementState.DisabledProfile);
        const { service: agentHostService } = createAgentHostCustomizations();
        const enabledServer = createAgentHostServer({ isClientBundled: true });
        const disabledServer = createAgentHostServer({
          isClientBundled: true,
          enabled: false,
          enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
        });
        const enabledActions = trackActions(disposables, getBuiltinMcpServerEnablementActions(
          enabledMcpService,
          "server-def-id",
          false,
          agentHostService,
          createAgentPluginService(),
          sessionResource,
          enabledServer
        ));
        const disabledActions = trackActions(disposables, getBuiltinMcpServerEnablementActions(
          disabledMcpService,
          "server-def-id",
          false,
          agentHostService,
          createAgentPluginService(),
          sessionResource,
          disabledServer
        ));
        assert.deepStrictEqual({
          enabled: {
            status: getActiveSessionServerPresentation(enabledServer).status,
            menu: enabledActions[0].label
          },
          disabled: {
            status: getActiveSessionServerPresentation(disabledServer).status,
            menu: disabledActions[0].label
          }
        }, {
          enabled: { status: McpServerStatus.Ready, menu: "Disable" },
          disabled: { status: "disabled", menu: "Enable" }
        });
      });
      test("keeps legacy VS Code workspace actions without an active agent-host session", () => {
        const { service: mcpService, calls: localCalls } = createMcpService(ContributionEnablementState.EnabledProfile);
        const { service: agentHostService, calls: agentHostCalls } = createAgentHostCustomizations();
        const actions = trackActions(disposables, getBuiltinMcpServerEnablementActions(mcpService, "server-def-id", false, agentHostService, createAgentPluginService(), sessionResource, void 0));
        assert.deepStrictEqual(actions.map((action) => action.label), ["Disable", "Disable (Workspace)"]);
        runAction(actions[1]);
        assert.deepStrictEqual({
          localCalls,
          agentHostCalls
        }, {
          localCalls: [["server-def-id", ContributionEnablementState.DisabledWorkspace]],
          agentHostCalls: []
        });
      });
    });
    test("omits the workspace variant in an empty workbench", () => {
      const { service } = createMcpService(ContributionEnablementState.DisabledProfile);
      const actions = trackActions(disposables, getLocalMcpServerEnablementActions(service, "server-def-id", true));
      assert.deepStrictEqual(actions.map((a) => a.label), ["Enable"]);
    });
  });
  suite("getActiveSessionServerOptionsActions", () => {
    test("composes lifecycle, durable, session, and options actions without duplicating groups", () => {
      const { service } = createAgentHostCustomizations();
      const server = createAgentHostServer({ enabled: true, status: McpServerStatus.Ready });
      const sessionResource = URI.parse("vscode-agent-session:///session-1");
      const commandService = { executeCommand: async () => void 0 };
      const actions = trackActions(disposables, getActiveSessionServerOptionsActions(
        commandService,
        service,
        createAgentPluginService(),
        sessionResource,
        server
      ));
      const labels = actions.map((a) => a instanceof Separator ? "(separator)" : a.label);
      assert.deepStrictEqual(labels, [
        "Stop Server",
        "(separator)",
        "Disable",
        "Disable (Workspace)",
        "Disable (Session)",
        "(separator)",
        "Server Options"
      ]);
    });
  });
  suite("inline actions", () => {
    test("authentication receives the active session and server without opening the row", () => {
      const sessionResource = URI.parse("vscode-agent-session:///session-1");
      const calls = [];
      const service = {
        authenticateMcpServer: (resource, serverId) => {
          calls.push([resource, serverId]);
          return Promise.resolve(true);
        }
      };
      const row = document.createElement("div");
      let rowPointerDowns = 0;
      let rowClicks = 0;
      disposables.add(DOM.addDisposableGenericMouseDownListener(row, () => rowPointerDowns++));
      disposables.add(DOM.addDisposableListener(row, DOM.EventType.CLICK, () => rowClicks++));
      const button = disposables.add(new Button(row, unthemedButtonStyles));
      registerMcpInlineButtonAction(disposables, button, async () => {
        await authenticateMcpServer(service, sessionResource, "server-1");
      });
      button.element.dispatchEvent(new MouseEvent(DOM.EventType.MOUSE_DOWN, { bubbles: true }));
      button.element.click();
      assert.deepStrictEqual({
        calls,
        rowPointerDowns,
        rowClicks
      }, {
        calls: [[sessionResource, "server-1"]],
        rowPointerDowns: 0,
        rowClicks: 0
      });
    });
    test("active-session error registers the channel, closes the editor, then opens output", async () => {
      const shownChannels = [];
      let localOutputCount = 0;
      const actions = [];
      const outputHandler = getMcpServerOutputHandler(
        {
          showChannel: async (channelId) => {
            actions.push("show-output");
            shownChannels.push(channelId);
          }
        },
        { showOutput: async () => {
          localOutputCount++;
        } },
        createAgentHostServer({ logOutputChannelId: "agent-host-output" }),
        async () => {
          actions.push("close-editor");
        },
        async (beforeShow) => {
          actions.push("register-agent-host-output");
          await beforeShow?.();
          actions.push("show-agent-host-output");
        }
      );
      assert.ok(outputHandler);
      await outputHandler();
      assert.deepStrictEqual({
        shownChannels,
        localOutputCount,
        actions
      }, {
        shownChannels: [],
        localOutputCount: 0,
        actions: ["register-agent-host-output", "close-editor", "show-agent-host-output"]
      });
    });
    test("local error opens local output when no agent-host output exists", async () => {
      const shownChannels = [];
      let localOutputCount = 0;
      const outputHandler = getMcpServerOutputHandler(
        { showChannel: async (channelId) => {
          shownChannels.push(channelId);
        } },
        { showOutput: async () => {
          localOutputCount++;
        } },
        void 0
      );
      await outputHandler?.();
      assert.deepStrictEqual({
        shownChannels,
        localOutputCount
      }, {
        shownChannels: [],
        localOutputCount: 1
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcbWNwTGlzdFdpZGdldC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uLCB1bnRoZW1lZEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBpc0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQsIE1jcFNlcnZlclN0YXR1cywgdHlwZSBDdXN0b21pemF0aW9uRW5hYmxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgRGlzYWJsZU1jcFNlcnZlckZvcldvcmtzcGFjZUFjdGlvbiwgRGlzYWJsZU1jcFNlcnZlckdsb2JhbGx5QWN0aW9uLCBFbmFibGVNY3BTZXJ2ZXJGb3JXb3Jrc3BhY2VBY3Rpb24sIEVuYWJsZU1jcFNlcnZlckdsb2JhbGx5QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vbWNwL2Jyb3dzZXIvbWNwU2VydmVyQWN0aW9ucy5qcyc7XG5pbXBvcnQge1xuXHRBZ2VudEhvc3RNY3BTZXJ2ZXIsXG5cdGF1dGhlbnRpY2F0ZU1jcFNlcnZlcixcblx0Y3JlYXRlQnVpbHRpbkFjdGl2ZVNlc3Npb25NY3BFbnRyaWVzLFxuXHRnZXRBY3RpdmVTZXNzaW9uU2VydmVyTGlmZWN5Y2xlQWN0aW9uLFxuXHRnZXRBY3RpdmVTZXNzaW9uU2VydmVyUHJlc2VudGF0aW9uLFxuXHRnZXRCdWlsdGluTWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMsXG5cdGdldEFjdGl2ZVNlc3Npb25TZXJ2ZXJPcHRpb25zQWN0aW9ucyxcblx0Z2V0QWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMsXG5cdGdldExvY2FsTWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMsXG5cdGdldE1jcFNlcnZlck91dHB1dEhhbmRsZXIsXG5cdGdldE1jcFN0YXR1c1ByZXNlbnRhdGlvbixcblx0Z2V0U2VydmVySXRlbUNvbnRleHRNZW51QWN0aW9ucyxcblx0cmVnaXN0ZXJNY3BJbmxpbmVCdXR0b25BY3Rpb24sXG59IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL21jcExpc3RXaWRnZXQuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVBZ2VudEhvc3RTZXJ2ZXIob3ZlcnJpZGVzOiBQYXJ0aWFsPEFnZW50SG9zdE1jcFNlcnZlcj4gPSB7fSk6IEFnZW50SG9zdE1jcFNlcnZlciB7XG5cdHJldHVybiB7XG5cdFx0aWQ6ICdzZXJ2ZXItMScsXG5cdFx0bmFtZTogJ1NlcnZlciBPbmUnLFxuXHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0c3RhdHVzOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHksXG5cdFx0c3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH0sXG5cdFx0c2V0RW5hYmxlZDogKCkgPT4geyB9LFxuXHRcdHN0YXJ0OiAoKSA9PiB7IH0sXG5cdFx0c3RvcDogKCkgPT4geyB9LFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fSBhcyBBZ2VudEhvc3RNY3BTZXJ2ZXI7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25zKGhhc1dvcmtzcGFjZSA9IHRydWUpOiB7IHNlcnZpY2U6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZTsgY2FsbHM6IHVua25vd25bXVtdIH0ge1xuXHRjb25zdCBjYWxsczogdW5rbm93bltdW10gPSBbXTtcblx0Y29uc3Qgc2VydmljZSA9IHtcblx0XHRnZXRXb3JraW5nRGlyZWN0b3JpZXM6ICgpID0+IGhhc1dvcmtzcGFjZSA/IFsnZmlsZTovLy93b3Jrc3BhY2UnXSA6IFtdLFxuXHRcdHNldEN1c3RvbWl6YXRpb25FbmFibGVtZW50OiAoc2Vzc2lvblJlc291cmNlOiBVUkksIHNlcnZlcklkOiBzdHJpbmcsIGVuYWJsZW1lbnQ6IHVua25vd24sIGtpbmQ6IHVua25vd24sIGVuYWJsZWQ6IGJvb2xlYW4pID0+IHtcblx0XHRcdGNhbGxzLnB1c2goW3Nlc3Npb25SZXNvdXJjZSwgc2VydmVySWQsIGVuYWJsZW1lbnQsIGtpbmQsIGVuYWJsZWRdKTtcblx0XHR9LFxuXHR9IGFzIHVua25vd24gYXMgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlO1xuXHRyZXR1cm4geyBzZXJ2aWNlLCBjYWxscyB9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVBZ2VudFBsdWdpblNlcnZpY2UoY2FsbHM/OiB1bmtub3duW11bXSk6IElBZ2VudFBsdWdpblNlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdGVuYWJsZW1lbnRNb2RlbDogeyBzZXRFbmFibGVkOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiBjYWxscz8ucHVzaChhcmdzKSB9LFxuXHR9IGFzIHVua25vd24gYXMgSUFnZW50UGx1Z2luU2VydmljZTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTWNwU2VydmljZShlbmFibGVtZW50OiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUpOiB7IHNlcnZpY2U6IElNY3BTZXJ2aWNlOyBjYWxsczogW3N0cmluZywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlXVtdIH0ge1xuXHRjb25zdCBjYWxsczogW3N0cmluZywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlXVtdID0gW107XG5cdGNvbnN0IHNlcnZpY2UgPSB7XG5cdFx0ZW5hYmxlbWVudE1vZGVsOiB7XG5cdFx0XHRyZWFkRW5hYmxlZDogKCkgPT4gZW5hYmxlbWVudCxcblx0XHRcdHNldEVuYWJsZWQ6IChrZXk6IHN0cmluZywgc3RhdGU6IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSkgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKFtrZXksIHN0YXRlXSk7XG5cdFx0XHR9LFxuXHRcdH0sXG5cdH0gYXMgdW5rbm93biBhcyBJTWNwU2VydmljZTtcblx0cmV0dXJuIHsgc2VydmljZSwgY2FsbHMgfTtcbn1cblxuZnVuY3Rpb24gcnVuQWN0aW9uKGFjdGlvbjogSUFjdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRhc3NlcnQub2soYWN0aW9uLCAnZXhwZWN0ZWQgYW4gYWN0aW9uIHRvIGJlIGRlZmluZWQnKTtcblx0dm9pZCBhY3Rpb24ucnVuKCk7XG59XG5cbmZ1bmN0aW9uIHRyYWNrQWN0aW9ucyhzdG9yZTogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPiwgYWN0aW9uczogcmVhZG9ubHkgSUFjdGlvbltdKTogSUFjdGlvbltdIHtcblx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdGlmIChpc0Rpc3Bvc2FibGUoYWN0aW9uKSkge1xuXHRcdFx0c3RvcmUuYWRkKGFjdGlvbik7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBbLi4uYWN0aW9uc107XG59XG5cbnN1aXRlKCdtY3BMaXN0V2lkZ2V0JywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NsYXNzaWZpZXMgYWN0aXZlLXNlc3Npb24tb25seSBNQ1Agc2VydmVycyBhcyBidWlsdC1pbiBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IGNyZWF0ZUFnZW50SG9zdFNlcnZlcih7IG5hbWU6ICdub2RlX3JlcGwnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjcmVhdGVCdWlsdGluQWN0aXZlU2Vzc2lvbk1jcEVudHJpZXMoW3NlcnZlcl0pLCBbe1xuXHRcdFx0dHlwZTogJ3Nlc3Npb24tc2VydmVyLWl0ZW0nLFxuXHRcdFx0c2VydmVyLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgncmVuZGVycyBob3N0LXB1Ymxpc2hlZCBkaXNhYmxlZCByZWFzb25zIHdpdGhvdXQgY2hhbmdpbmcgbGVnYWN5IHJvd3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRNY3BTdGF0dXNQcmVzZW50YXRpb24oJ2Rpc2FibGVkJywgeyBzb3VyY2U6ICdzY29wZScsIHNjb3BlOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsIH0pPy5sYWJlbCxcblx0XHRcdGdldE1jcFN0YXR1c1ByZXNlbnRhdGlvbignZGlzYWJsZWQnLCB7IHNvdXJjZTogJ3Njb3BlJywgc2NvcGU6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UgfSk/LmxhYmVsLFxuXHRcdFx0Z2V0TWNwU3RhdHVzUHJlc2VudGF0aW9uKCdkaXNhYmxlZCcsIHsgc291cmNlOiAnc2NvcGUnLCBzY29wZTogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24gfSk/LmxhYmVsLFxuXHRcdFx0Z2V0TWNwU3RhdHVzUHJlc2VudGF0aW9uKCdkaXNhYmxlZCcsIHsgc291cmNlOiAncGx1Z2luJywgcGx1Z2luOiB7IGlkOiAncGx1Z2luLTEnLCBuYW1lOiAnUGx1Z2luIE9uZScsIHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3BsdWdpbi0xJykudG9TdHJpbmcoKSwgZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiAnZmlsZTovLy93b3Jrc3BhY2UnLCBlbmFibGVkOiBmYWxzZSB9XSB9IH0pPy5sYWJlbCxcblx0XHRcdGdldE1jcFN0YXR1c1ByZXNlbnRhdGlvbihNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkpPy5sYWJlbCxcblx0XHRcdGdldE1jcFN0YXR1c1ByZXNlbnRhdGlvbignZGlzYWJsZWQnKT8ubGFiZWwsXG5cdFx0XSwgW1xuXHRcdFx0J0Rpc2FibGVkJyxcblx0XHRcdCdEaXNhYmxlZCAoV29ya3NwYWNlKScsXG5cdFx0XHQnRGlzYWJsZWQgKFNlc3Npb24pJyxcblx0XHRcdCdEaXNhYmxlZCAoUGx1Z2luKScsXG5cdFx0XHQnUnVubmluZycsXG5cdFx0XHQnRGlzYWJsZWQnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRoZSBjdXJyZW50IGFjdGl2ZS1zZXNzaW9uIHNlcnZlciBlbmFibGVtZW50IGZvciByb3dzIGFuZCBsaWZlY3ljbGUgYWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBkaXNhYmxlZFNlcnZlciA9IGNyZWF0ZUFnZW50SG9zdFNlcnZlcih7IGVuYWJsZWQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IGVuYWJsZWRTZXJ2ZXIgPSBjcmVhdGVBZ2VudEhvc3RTZXJ2ZXIoeyBlbmFibGVkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGRpc2FibGVkTGlmZWN5Y2xlQWN0aW9uID0gZ2V0QWN0aXZlU2Vzc2lvblNlcnZlckxpZmVjeWNsZUFjdGlvbihkaXNhYmxlZFNlcnZlcik7XG5cdFx0Y29uc3QgZW5hYmxlZExpZmVjeWNsZUFjdGlvbiA9IGdldEFjdGl2ZVNlc3Npb25TZXJ2ZXJMaWZlY3ljbGVBY3Rpb24oZW5hYmxlZFNlcnZlcik7XG5cdFx0aWYgKGRpc2FibGVkTGlmZWN5Y2xlQWN0aW9uKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZGlzYWJsZWRMaWZlY3ljbGVBY3Rpb24pO1xuXHRcdH1cblx0XHRpZiAoZW5hYmxlZExpZmVjeWNsZUFjdGlvbikge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVuYWJsZWRMaWZlY3ljbGVBY3Rpb24pO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0e1xuXHRcdFx0XHRyZW5kZXJlZERpc2FibGVkOiBnZXRBY3RpdmVTZXNzaW9uU2VydmVyUHJlc2VudGF0aW9uKGRpc2FibGVkU2VydmVyKS5zdGF0dXMgPT09ICdkaXNhYmxlZCcsXG5cdFx0XHRcdGhhc0xpZmVjeWNsZUFjdGlvbjogZGlzYWJsZWRMaWZlY3ljbGVBY3Rpb24gIT09IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHJlbmRlcmVkRGlzYWJsZWQ6IGdldEFjdGl2ZVNlc3Npb25TZXJ2ZXJQcmVzZW50YXRpb24oZW5hYmxlZFNlcnZlcikuc3RhdHVzID09PSAnZGlzYWJsZWQnLFxuXHRcdFx0XHRoYXNMaWZlY3ljbGVBY3Rpb246IGVuYWJsZWRMaWZlY3ljbGVBY3Rpb24gIT09IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XSwgW1xuXHRcdFx0eyByZW5kZXJlZERpc2FibGVkOiB0cnVlLCBoYXNMaWZlY3ljbGVBY3Rpb246IGZhbHNlIH0sXG5cdFx0XHR7IHJlbmRlcmVkRGlzYWJsZWQ6IGZhbHNlLCBoYXNMaWZlY3ljbGVBY3Rpb246IHRydWUgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBhY3RpdmUtc2Vzc2lvbiBlbmFibGVtZW50IGZvciBib3RoIHRoZSByb3cgYW5kIGJ1aWx0LWluIGNvbnRleHQgbWVudScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1zZXNzaW9uOi8vL3Nlc3Npb24tMScpO1xuXHRcdGNvbnN0IHNlcnZlciA9IGNyZWF0ZUFnZW50SG9zdFNlcnZlcih7XG5cdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgc2VydmljZTogbWNwU2VydmljZSB9ID0gY3JlYXRlTWNwU2VydmljZShDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUpO1xuXHRcdGNvbnN0IHsgc2VydmljZTogYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlQWdlbnRIb3N0Q3VzdG9taXphdGlvbnMoKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSB0cmFja0FjdGlvbnMoZGlzcG9zYWJsZXMsIGdldEJ1aWx0aW5NY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9ucyhcblx0XHRcdG1jcFNlcnZpY2UsXG5cdFx0XHQnc2VydmVyLWRlZi1pZCcsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGFnZW50SG9zdFNlcnZpY2UsXG5cdFx0XHRjcmVhdGVBZ2VudFBsdWdpblNlcnZpY2UoKSxcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHNlcnZlcixcblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVuZGVyZWRTdGF0dXM6IGdldEFjdGl2ZVNlc3Npb25TZXJ2ZXJQcmVzZW50YXRpb24oc2VydmVyKS5zdGF0dXMsXG5cdFx0XHRjb250ZXh0TWVudUFjdGlvbnM6IGFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24ubGFiZWwpLFxuXHRcdH0sIHtcblx0XHRcdHJlbmRlcmVkU3RhdHVzOiAnZGlzYWJsZWQnLFxuXHRcdFx0Y29udGV4dE1lbnVBY3Rpb25zOiBbJ0VuYWJsZScsICdFbmFibGUgKFdvcmtzcGFjZSknLCAnRW5hYmxlIChTZXNzaW9uKSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0QWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCd2c2NvZGUtYWdlbnQtc2Vzc2lvbjovLy9zZXNzaW9uLTEnKTtcblxuXHRcdHRlc3QoJ29mZmVycyB0aGUgc2NvcGVkIGFjdGlvbiBtYXRyaXgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXNlczogcmVhZG9ubHkgW3N0cmluZywgQWdlbnRIb3N0TWNwU2VydmVyLCByZWFkb25seSBzdHJpbmdbXV1bXSA9IFtcblx0XHRcdFx0WydubyBkZWNpc2lvbnMnLCBjcmVhdGVBZ2VudEhvc3RTZXJ2ZXIoKSwgWydEaXNhYmxlJywgJ0Rpc2FibGUgKFdvcmtzcGFjZSknLCAnRGlzYWJsZSAoU2Vzc2lvbiknXV0sXG5cdFx0XHRcdFsnZ2xvYmFsIGRpc2FibGVkJywgY3JlYXRlQWdlbnRIb3N0U2VydmVyKHsgZW5hYmxlZDogZmFsc2UsIGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dIH0pLCBbJ0VuYWJsZScsICdFbmFibGUgKFdvcmtzcGFjZSknLCAnRW5hYmxlIChTZXNzaW9uKSddXSxcblx0XHRcdFx0Wyd3b3Jrc3BhY2UgZGlzYWJsZWQnLCBjcmVhdGVBZ2VudEhvc3RTZXJ2ZXIoeyBlbmFibGVkOiBmYWxzZSwgZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiAnZmlsZTovLy93b3Jrc3BhY2UnLCBlbmFibGVkOiBmYWxzZSB9XSB9KSwgWydEaXNhYmxlJywgJ0VuYWJsZSAoV29ya3NwYWNlKScsICdFbmFibGUgKFNlc3Npb24pJ11dLFxuXHRcdFx0XHRbJ3Nlc3Npb24gZGlzYWJsZWQnLCBjcmVhdGVBZ2VudEhvc3RTZXJ2ZXIoeyBlbmFibGVkOiBmYWxzZSwgZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IGZhbHNlIH1dIH0pLCBbJ0Rpc2FibGUnLCAnRGlzYWJsZSAoV29ya3NwYWNlKScsICdFbmFibGUgKFNlc3Npb24pJ11dLFxuXHRcdFx0XTtcblx0XHRcdGZvciAoY29uc3QgWywgc2VydmVyLCBleHBlY3RlZF0gb2YgY2FzZXMpIHtcblx0XHRcdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVBZ2VudEhvc3RDdXN0b21pemF0aW9ucygpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYWNrQWN0aW9ucyhkaXNwb3NhYmxlcywgZ2V0QWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMoc2VydmljZSwgY3JlYXRlQWdlbnRQbHVnaW5TZXJ2aWNlKCksIHNlc3Npb25SZXNvdXJjZSwgc2VydmVyKSkubWFwKGFjdGlvbiA9PiBhY3Rpb24ubGFiZWwpLCBleHBlY3RlZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgZXhwbGljaXQgZGVjaXNpb25zIGFuZCBvbWl0cyB3b3Jrc3BhY2UgYWN0aW9ucyB3aXRob3V0IGEgd29ya3NwYWNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBjYWxscyB9ID0gY3JlYXRlQWdlbnRIb3N0Q3VzdG9taXphdGlvbnMoZmFsc2UpO1xuXHRcdFx0Y29uc3Qgc2VydmVyID0gY3JlYXRlQWdlbnRIb3N0U2VydmVyKHsgZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0gfSk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gdHJhY2tBY3Rpb25zKGRpc3Bvc2FibGVzLCBnZXRBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9ucyhzZXJ2aWNlLCBjcmVhdGVBZ2VudFBsdWdpblNlcnZpY2UoKSwgc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXIpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbi5sYWJlbCksIFsnRW5hYmxlJywgJ0VuYWJsZSAoU2Vzc2lvbiknXSk7XG5cdFx0XHRydW5BY3Rpb24oYWN0aW9uc1sxXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbW3Nlc3Npb25SZXNvdXJjZSwgc2VydmVyLmlkLCBzZXJ2ZXIuZW5hYmxlbWVudCwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIHRydWVdXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvZmZlcnMgb25seSBFbmFibGUgUGx1Z2luIGZvciBhIHNlcnZlciBkaXNhYmxlZCBieSBpdHMgcGx1Z2luJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBjYWxscyB9ID0gY3JlYXRlQWdlbnRIb3N0Q3VzdG9taXphdGlvbnMoKTtcblx0XHRcdGNvbnN0IHBsdWdpbkVuYWJsZW1lbnQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10gPSBbXG5cdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiAnZmlsZTovLy93b3Jrc3BhY2UnLCBlbmFibGVkOiB0cnVlIH0sXG5cdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBzZXJ2ZXIgPSBjcmVhdGVBZ2VudEhvc3RTZXJ2ZXIoe1xuXHRcdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdFx0XHRkaXNhYmxlZFJlYXNvbjogeyBzb3VyY2U6ICdwbHVnaW4nLCBwbHVnaW46IHsgaWQ6ICdwbHVnaW4tMScsIG5hbWU6ICdQbHVnaW4gT25lJywgdXJpOiBVUkkuZmlsZSgnL3BsdWdpbnMvcGx1Z2luLTEnKS50b1N0cmluZygpLCBlbmFibGVtZW50OiBwbHVnaW5FbmFibGVtZW50IH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhY3Rpb25zID0gdHJhY2tBY3Rpb25zKGRpc3Bvc2FibGVzLCBnZXRBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9ucyhzZXJ2aWNlLCBjcmVhdGVBZ2VudFBsdWdpblNlcnZpY2UoKSwgc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXIpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbi5sYWJlbCksIFsnRW5hYmxlIFBsdWdpbiddKTtcblx0XHRcdHJ1bkFjdGlvbihhY3Rpb25zWzBdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtbc2Vzc2lvblJlc291cmNlLCAncGx1Z2luLTEnLCBwbHVnaW5FbmFibGVtZW50LCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgdHJ1ZV1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VuYWJsZXMgYSBjbGllbnQtcHVibGlzaGVkIHBsdWdpbiBnbG9iYWxseSB0aHJvdWdoIHRoZSBjbGllbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIGNhbGxzOiBob3N0Q2FsbHMgfSA9IGNyZWF0ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25zKCk7XG5cdFx0XHRjb25zdCBjbGllbnRDYWxsczogdW5rbm93bltdW10gPSBbXTtcblx0XHRcdGNvbnN0IHBsdWdpblVyaSA9IFVSSS5maWxlKCcvcGx1Z2lucy9wbHVnaW4tMScpO1xuXHRcdFx0Y29uc3Qgc2VydmVyID0gY3JlYXRlQWdlbnRIb3N0U2VydmVyKHtcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdGRpc2FibGVkUmVhc29uOiB7XG5cdFx0XHRcdFx0c291cmNlOiAncGx1Z2luJyxcblx0XHRcdFx0XHRwbHVnaW46IHtcblx0XHRcdFx0XHRcdGlkOiAncGx1Z2luLTEnLFxuXHRcdFx0XHRcdFx0bmFtZTogJ1BsdWdpbiBPbmUnLFxuXHRcdFx0XHRcdFx0dXJpOiBwbHVnaW5VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGNsaWVudElkOiAnY2xpZW50LTEnLFxuXHRcdFx0XHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBbYWN0aW9uXSA9IHRyYWNrQWN0aW9ucyhkaXNwb3NhYmxlcywgZ2V0QWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMoc2VydmljZSwgY3JlYXRlQWdlbnRQbHVnaW5TZXJ2aWNlKGNsaWVudENhbGxzKSwgc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXIpKTtcblx0XHRcdHJ1bkFjdGlvbihhY3Rpb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY2xpZW50Q2FsbHMsIGhvc3RDYWxscyB9LCB7XG5cdFx0XHRcdGNsaWVudENhbGxzOiBbW3BsdWdpblVyaS50b1N0cmluZygpLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGVdXSxcblx0XHRcdFx0aG9zdENhbGxzOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb2ZmZXJzIHRoZSBpbnZlcnNlIHNlc3Npb24gYWN0aW9uIGFuZCBwcmVzZXJ2ZXMgYWxsIGRlY2lzaW9ucyB3aGVuIGRpc3BhdGNoaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FzZXM6IHJlYWRvbmx5IFtBZ2VudEhvc3RNY3BTZXJ2ZXIsIHN0cmluZywgYm9vbGVhbl1bXSA9IFtcblx0XHRcdFx0W2NyZWF0ZUFnZW50SG9zdFNlcnZlcigpLCAnRGlzYWJsZSAoU2Vzc2lvbiknLCBmYWxzZV0sXG5cdFx0XHRcdFtjcmVhdGVBZ2VudEhvc3RTZXJ2ZXIoe1xuXHRcdFx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGVuYWJsZW1lbnQ6IFtcblx0XHRcdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdFx0XHR7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UsIHVyaTogJ2ZpbGU6Ly8vd29ya3NwYWNlJywgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9KSwgJ0VuYWJsZSAoU2Vzc2lvbiknLCB0cnVlXSxcblx0XHRcdF07XG5cdFx0XHRmb3IgKGNvbnN0IFtzZXJ2ZXIsIGxhYmVsLCBlbmFibGVkXSBvZiBjYXNlcykge1xuXHRcdFx0XHRjb25zdCB7IHNlcnZpY2UsIGNhbGxzIH0gPSBjcmVhdGVBZ2VudEhvc3RDdXN0b21pemF0aW9ucygpO1xuXHRcdFx0XHRjb25zdCBbYWN0aW9uXSA9IHRyYWNrQWN0aW9ucyhkaXNwb3NhYmxlcywgZ2V0QWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMoc2VydmljZSwgY3JlYXRlQWdlbnRQbHVnaW5TZXJ2aWNlKCksIHNlc3Npb25SZXNvdXJjZSwgc2VydmVyLCBbJ3Nlc3Npb24nXSkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgbGFiZWw6IGFjdGlvbi5sYWJlbCwgY2FsbHMgfSwgeyBsYWJlbCwgY2FsbHM6IFtdIH0pO1xuXHRcdFx0XHRydW5BY3Rpb24oYWN0aW9uKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW1tzZXNzaW9uUmVzb3VyY2UsIHNlcnZlci5pZCwgc2VydmVyLmVuYWJsZW1lbnQsIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLCBlbmFibGVkXV0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0U2VydmVySXRlbUNvbnRleHRNZW51QWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1zZXNzaW9uOi8vL3Nlc3Npb24tMScpO1xuXG5cdFx0dGVzdCgncmVwbGFjZXMgdGhlIFZTIENvZGUgd29ya3NwYWNlIGFjdGlvbiB3aXRoIGFnZW50LWhvc3Qgd29ya3NwYWNlIGFuZCBzZXNzaW9uIGFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIGNhbGxzIH0gPSBjcmVhdGVBZ2VudEhvc3RDdXN0b21pemF0aW9ucygpO1xuXHRcdFx0Y29uc3Qgc2VydmVyID0gY3JlYXRlQWdlbnRIb3N0U2VydmVyKHtcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdGVuYWJsZW1lbnQ6IFtcblx0XHRcdFx0XHR7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLCBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiAnZmlsZTovLy93b3Jrc3BhY2UnLCBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgYWdlbnRIb3N0QWN0aW9ucyA9IHRyYWNrQWN0aW9ucyhkaXNwb3NhYmxlcywgZ2V0QWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMoc2VydmljZSwgY3JlYXRlQWdlbnRQbHVnaW5TZXJ2aWNlKCksIHNlc3Npb25SZXNvdXJjZSwgc2VydmVyLCBbJ3dvcmtzcGFjZScsICdzZXNzaW9uJ10pKTtcblx0XHRcdGNvbnN0IGxvY2FsQWN0aW9ucyA9IHRyYWNrQWN0aW9ucyhkaXNwb3NhYmxlcywgW1xuXHRcdFx0XHRuZXcgQWN0aW9uKERpc2FibGVNY3BTZXJ2ZXJHbG9iYWxseUFjdGlvbi5JRCwgJ0Rpc2FibGUnKSxcblx0XHRcdFx0bmV3IEFjdGlvbihEaXNhYmxlTWNwU2VydmVyRm9yV29ya3NwYWNlQWN0aW9uLklELCAnRGlzYWJsZSAoV29ya3NwYWNlKScpLFxuXHRcdFx0XHRuZXcgQWN0aW9uKCd1bnJlbGF0ZWQnLCAnVW5yZWxhdGVkJyksXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRTZXJ2ZXJJdGVtQ29udGV4dE1lbnVBY3Rpb25zKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0bG9jYWxBY3Rpb25zLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRzZXJ2ZXIsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0YWdlbnRIb3N0QWN0aW9ucyxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucy5maWx0ZXIoYWN0aW9uID0+ICEoYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSkubWFwKGFjdGlvbiA9PiBhY3Rpb24ubGFiZWwpLCBbXG5cdFx0XHRcdCdEaXNhYmxlJyxcblx0XHRcdFx0J1VucmVsYXRlZCcsXG5cdFx0XHRcdCdFbmFibGUgKFdvcmtzcGFjZSknLFxuXHRcdFx0XHQnRW5hYmxlIChTZXNzaW9uKScsXG5cdFx0XHRdKTtcblx0XHRcdHJ1bkFjdGlvbihhY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5sYWJlbCA9PT0gJ0VuYWJsZSAoV29ya3NwYWNlKScpKTtcblx0XHRcdHJ1bkFjdGlvbihhY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5sYWJlbCA9PT0gJ0VuYWJsZSAoU2Vzc2lvbiknKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXG5cdFx0XHRcdFtzZXNzaW9uUmVzb3VyY2UsIHNlcnZlci5pZCwgc2VydmVyLmVuYWJsZW1lbnQsIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UsIHRydWVdLFxuXHRcdFx0XHRbc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXIuaWQsIHNlcnZlci5lbmFibGVtZW50LCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgdHJ1ZV0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIHRoZSBWUyBDb2RlLW93bmVkIGVuYWJsZW1lbnQgc2V0IHdpdGhvdXQgYW4gYWN0aXZlIGFnZW50LWhvc3Qgc2Vzc2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvY2FsQWN0aW9ucyA9IHRyYWNrQWN0aW9ucyhkaXNwb3NhYmxlcywgW1xuXHRcdFx0XHRuZXcgQWN0aW9uKEVuYWJsZU1jcFNlcnZlckdsb2JhbGx5QWN0aW9uLklELCAnRW5hYmxlJyksXG5cdFx0XHRcdG5ldyBBY3Rpb24oRW5hYmxlTWNwU2VydmVyRm9yV29ya3NwYWNlQWN0aW9uLklELCAnRW5hYmxlIChXb3Jrc3BhY2UpJyksXG5cdFx0XHRcdG5ldyBBY3Rpb24oRGlzYWJsZU1jcFNlcnZlckdsb2JhbGx5QWN0aW9uLklELCAnRGlzYWJsZScpLFxuXHRcdFx0XHRuZXcgQWN0aW9uKERpc2FibGVNY3BTZXJ2ZXJGb3JXb3Jrc3BhY2VBY3Rpb24uSUQsICdEaXNhYmxlIChXb3Jrc3BhY2UpJyksXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRTZXJ2ZXJJdGVtQ29udGV4dE1lbnVBY3Rpb25zKFtsb2NhbEFjdGlvbnNdLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgW10pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMuZmlsdGVyKGFjdGlvbiA9PiAhKGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvcikpLm1hcChhY3Rpb24gPT4gYWN0aW9uLmxhYmVsKSwgbG9jYWxBY3Rpb25zLm1hcChhY3Rpb24gPT4gYWN0aW9uLmxhYmVsKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRMb2NhbE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ29mZmVycyBEaXNhYmxlICsgRGlzYWJsZSAoV29ya3NwYWNlKSB3aGVuIGVuYWJsZWQgYW5kIHdvcmtiZW5jaCBoYXMgYSB3b3Jrc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIGNhbGxzIH0gPSBjcmVhdGVNY3BTZXJ2aWNlKENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gdHJhY2tBY3Rpb25zKGRpc3Bvc2FibGVzLCBnZXRMb2NhbE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb25zKHNlcnZpY2UsICdzZXJ2ZXItZGVmLWlkJywgZmFsc2UpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucy5tYXAoYSA9PiBhLmxhYmVsKSwgWydEaXNhYmxlJywgJ0Rpc2FibGUgKFdvcmtzcGFjZSknXSk7XG5cdFx0XHRydW5BY3Rpb24oYWN0aW9uc1swXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbWydzZXJ2ZXItZGVmLWlkJywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZV1dKTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdnZXRCdWlsdGluTWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1zZXNzaW9uOi8vL3Nlc3Npb24tMScpO1xuXG5cdFx0XHR0ZXN0KCdyb3V0ZXMgd29ya3NwYWNlIGFuZCBzZXNzaW9uIGFjdGlvbnMgdG8gdGhlIGFjdGl2ZSBhZ2VudC1ob3N0IHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgc2VydmljZTogbWNwU2VydmljZSwgY2FsbHM6IGxvY2FsQ2FsbHMgfSA9IGNyZWF0ZU1jcFNlcnZpY2UoQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlKTtcblx0XHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBhZ2VudEhvc3RTZXJ2aWNlLCBjYWxsczogYWdlbnRIb3N0Q2FsbHMgfSA9IGNyZWF0ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25zKCk7XG5cdFx0XHRcdGNvbnN0IHNlcnZlciA9IGNyZWF0ZUFnZW50SG9zdFNlcnZlcih7XG5cdFx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdFx0ZW5hYmxlbWVudDogW1xuXHRcdFx0XHRcdFx0eyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0XHRcdFx0eyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB1cmk6ICdmaWxlOi8vL3dvcmtzcGFjZScsIGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0cmFja0FjdGlvbnMoZGlzcG9zYWJsZXMsIGdldEJ1aWx0aW5NY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9ucyhtY3BTZXJ2aWNlLCAnc2VydmVyLWRlZi1pZCcsIGZhbHNlLCBhZ2VudEhvc3RTZXJ2aWNlLCBjcmVhdGVBZ2VudFBsdWdpblNlcnZpY2UoKSwgc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXIpKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24ubGFiZWwpLCBbJ0VuYWJsZScsICdFbmFibGUgKFdvcmtzcGFjZSknLCAnRW5hYmxlIChTZXNzaW9uKSddKTtcblx0XHRcdFx0cnVuQWN0aW9uKGFjdGlvbnNbMF0pO1xuXHRcdFx0XHRydW5BY3Rpb24oYWN0aW9uc1sxXSk7XG5cdFx0XHRcdHJ1bkFjdGlvbihhY3Rpb25zWzJdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0bG9jYWxDYWxscyxcblx0XHRcdFx0XHRhZ2VudEhvc3RDYWxscyxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGxvY2FsQ2FsbHM6IFtbJ3NlcnZlci1kZWYtaWQnLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGVdXSxcblx0XHRcdFx0XHRhZ2VudEhvc3RDYWxsczogW1xuXHRcdFx0XHRcdFx0W3Nlc3Npb25SZXNvdXJjZSwgc2VydmVyLmlkLCBzZXJ2ZXIuZW5hYmxlbWVudCwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdHJ1ZV0sXG5cdFx0XHRcdFx0XHRbc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXIuaWQsIHNlcnZlci5lbmFibGVtZW50LCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgdHJ1ZV0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncm91dGVzIGdsb2JhbCBlbmFibGVtZW50IHRocm91Z2ggdGhlIGhvc3QgZm9yIGEgY2xpZW50LWZvcndhcmRlZCBwbHVnaW4gY2hpbGQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgc2VydmljZTogbWNwU2VydmljZSwgY2FsbHM6IGxvY2FsQ2FsbHMgfSA9IGNyZWF0ZU1jcFNlcnZpY2UoQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlKTtcblx0XHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBhZ2VudEhvc3RTZXJ2aWNlLCBjYWxsczogYWdlbnRIb3N0Q2FsbHMgfSA9IGNyZWF0ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25zKCk7XG5cdFx0XHRcdGNvbnN0IHNlcnZlciA9IGNyZWF0ZUFnZW50SG9zdFNlcnZlcih7XG5cdFx0XHRcdFx0aWQ6ICdhenVyZScsXG5cdFx0XHRcdFx0aXNQbHVnaW5Qcm92aWRlZDogdHJ1ZSxcblx0XHRcdFx0XHRvd25pbmdQbHVnaW5DbGllbnRJZDogJ2ZvcndhcmRlZC1wbHVnaW4tY2xpZW50Jyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0cmFja0FjdGlvbnMoZGlzcG9zYWJsZXMsIGdldEJ1aWx0aW5NY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9ucyhtY3BTZXJ2aWNlLCAnYXp1cmUnLCBmYWxzZSwgYWdlbnRIb3N0U2VydmljZSwgY3JlYXRlQWdlbnRQbHVnaW5TZXJ2aWNlKCksIHNlc3Npb25SZXNvdXJjZSwgc2VydmVyKSk7XG5cblx0XHRcdFx0cnVuQWN0aW9uKGFjdGlvbnNbMF0pO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGxhYmVsczogYWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbi5sYWJlbCksXG5cdFx0XHRcdFx0YWdlbnRIb3N0Q2FsbHMsXG5cdFx0XHRcdFx0bG9jYWxDYWxscyxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGxhYmVsczogWydEaXNhYmxlJywgJ0Rpc2FibGUgKFdvcmtzcGFjZSknLCAnRGlzYWJsZSAoU2Vzc2lvbiknXSxcblx0XHRcdFx0XHRhZ2VudEhvc3RDYWxsczogW1tzZXNzaW9uUmVzb3VyY2UsICdhenVyZScsIHVuZGVmaW5lZCwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZmFsc2VdXSxcblx0XHRcdFx0XHRsb2NhbENhbGxzOiBbXSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncm91dGVzIGdsb2JhbCBlbmFibGVtZW50IGxvY2FsbHkgZm9yIGEgY2xpZW50LWJ1bmRsZWQgcGx1Z2luIGNoaWxkJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IHNlcnZpY2U6IG1jcFNlcnZpY2UsIGNhbGxzOiBsb2NhbENhbGxzIH0gPSBjcmVhdGVNY3BTZXJ2aWNlKENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSk7XG5cdFx0XHRcdGNvbnN0IHsgc2VydmljZTogYWdlbnRIb3N0U2VydmljZSwgY2FsbHM6IGFnZW50SG9zdENhbGxzIH0gPSBjcmVhdGVBZ2VudEhvc3RDdXN0b21pemF0aW9ucygpO1xuXHRcdFx0XHRjb25zdCBzZXJ2ZXIgPSBjcmVhdGVBZ2VudEhvc3RTZXJ2ZXIoe1xuXHRcdFx0XHRcdGlkOiAnYXp1cmUnLFxuXHRcdFx0XHRcdGlzUGx1Z2luUHJvdmlkZWQ6IHRydWUsXG5cdFx0XHRcdFx0aXNDbGllbnRCdW5kbGVkOiB0cnVlLFxuXHRcdFx0XHRcdG93bmluZ1BsdWdpbkNsaWVudElkOiAnZm9yd2FyZGVkLXBsdWdpbi1jbGllbnQnLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgYWN0aW9ucyA9IHRyYWNrQWN0aW9ucyhkaXNwb3NhYmxlcywgZ2V0QnVpbHRpbk1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb25zKG1jcFNlcnZpY2UsICdhenVyZScsIGZhbHNlLCBhZ2VudEhvc3RTZXJ2aWNlLCBjcmVhdGVBZ2VudFBsdWdpblNlcnZpY2UoKSwgc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXIpKTtcblxuXHRcdFx0XHRydW5BY3Rpb24oYWN0aW9uc1swXSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0bGFiZWxzOiBhY3Rpb25zLm1hcChhY3Rpb24gPT4gYWN0aW9uLmxhYmVsKSxcblx0XHRcdFx0XHRhZ2VudEhvc3RDYWxscyxcblx0XHRcdFx0XHRsb2NhbENhbGxzLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0bGFiZWxzOiBbJ0Rpc2FibGUnLCAnRGlzYWJsZSAoV29ya3NwYWNlKScsICdEaXNhYmxlIChTZXNzaW9uKSddLFxuXHRcdFx0XHRcdGFnZW50SG9zdENhbGxzOiBbXSxcblx0XHRcdFx0XHRsb2NhbENhbGxzOiBbWydhenVyZScsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFByb2ZpbGVdXSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgna2VlcHMgdGhlIGNsaWVudC1idW5kbGVkIHJvdyBwcmVzZW50YXRpb24gYW5kIG1lbnUgaW4gc3luYyBhZnRlciBhIGdsb2JhbCBjaGFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgc2VydmljZTogZW5hYmxlZE1jcFNlcnZpY2UgfSA9IGNyZWF0ZU1jcFNlcnZpY2UoQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlKTtcblx0XHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBkaXNhYmxlZE1jcFNlcnZpY2UgfSA9IGNyZWF0ZU1jcFNlcnZpY2UoQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSk7XG5cdFx0XHRcdGNvbnN0IHsgc2VydmljZTogYWdlbnRIb3N0U2VydmljZSB9ID0gY3JlYXRlQWdlbnRIb3N0Q3VzdG9taXphdGlvbnMoKTtcblx0XHRcdFx0Y29uc3QgZW5hYmxlZFNlcnZlciA9IGNyZWF0ZUFnZW50SG9zdFNlcnZlcih7IGlzQ2xpZW50QnVuZGxlZDogdHJ1ZSB9KTtcblx0XHRcdFx0Y29uc3QgZGlzYWJsZWRTZXJ2ZXIgPSBjcmVhdGVBZ2VudEhvc3RTZXJ2ZXIoe1xuXHRcdFx0XHRcdGlzQ2xpZW50QnVuZGxlZDogdHJ1ZSxcblx0XHRcdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0XHRlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiBmYWxzZSB9XSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgZW5hYmxlZEFjdGlvbnMgPSB0cmFja0FjdGlvbnMoZGlzcG9zYWJsZXMsIGdldEJ1aWx0aW5NY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9ucyhcblx0XHRcdFx0XHRlbmFibGVkTWNwU2VydmljZSxcblx0XHRcdFx0XHQnc2VydmVyLWRlZi1pZCcsXG5cdFx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdFx0YWdlbnRIb3N0U2VydmljZSxcblx0XHRcdFx0XHRjcmVhdGVBZ2VudFBsdWdpblNlcnZpY2UoKSxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0ZW5hYmxlZFNlcnZlcixcblx0XHRcdFx0KSk7XG5cdFx0XHRcdGNvbnN0IGRpc2FibGVkQWN0aW9ucyA9IHRyYWNrQWN0aW9ucyhkaXNwb3NhYmxlcywgZ2V0QnVpbHRpbk1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb25zKFxuXHRcdFx0XHRcdGRpc2FibGVkTWNwU2VydmljZSxcblx0XHRcdFx0XHQnc2VydmVyLWRlZi1pZCcsXG5cdFx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdFx0YWdlbnRIb3N0U2VydmljZSxcblx0XHRcdFx0XHRjcmVhdGVBZ2VudFBsdWdpblNlcnZpY2UoKSxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0ZGlzYWJsZWRTZXJ2ZXIsXG5cdFx0XHRcdCkpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGVuYWJsZWQ6IHtcblx0XHRcdFx0XHRcdHN0YXR1czogZ2V0QWN0aXZlU2Vzc2lvblNlcnZlclByZXNlbnRhdGlvbihlbmFibGVkU2VydmVyKS5zdGF0dXMsXG5cdFx0XHRcdFx0XHRtZW51OiBlbmFibGVkQWN0aW9uc1swXS5sYWJlbCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRpc2FibGVkOiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6IGdldEFjdGl2ZVNlc3Npb25TZXJ2ZXJQcmVzZW50YXRpb24oZGlzYWJsZWRTZXJ2ZXIpLnN0YXR1cyxcblx0XHRcdFx0XHRcdG1lbnU6IGRpc2FibGVkQWN0aW9uc1swXS5sYWJlbCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0ZW5hYmxlZDogeyBzdGF0dXM6IE1jcFNlcnZlclN0YXR1cy5SZWFkeSwgbWVudTogJ0Rpc2FibGUnIH0sXG5cdFx0XHRcdFx0ZGlzYWJsZWQ6IHsgc3RhdHVzOiAnZGlzYWJsZWQnLCBtZW51OiAnRW5hYmxlJyB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdrZWVwcyBsZWdhY3kgVlMgQ29kZSB3b3Jrc3BhY2UgYWN0aW9ucyB3aXRob3V0IGFuIGFjdGl2ZSBhZ2VudC1ob3N0IHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgc2VydmljZTogbWNwU2VydmljZSwgY2FsbHM6IGxvY2FsQ2FsbHMgfSA9IGNyZWF0ZU1jcFNlcnZpY2UoQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlKTtcblx0XHRcdFx0Y29uc3QgeyBzZXJ2aWNlOiBhZ2VudEhvc3RTZXJ2aWNlLCBjYWxsczogYWdlbnRIb3N0Q2FsbHMgfSA9IGNyZWF0ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25zKCk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0cmFja0FjdGlvbnMoZGlzcG9zYWJsZXMsIGdldEJ1aWx0aW5NY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9ucyhtY3BTZXJ2aWNlLCAnc2VydmVyLWRlZi1pZCcsIGZhbHNlLCBhZ2VudEhvc3RTZXJ2aWNlLCBjcmVhdGVBZ2VudFBsdWdpblNlcnZpY2UoKSwgc2Vzc2lvblJlc291cmNlLCB1bmRlZmluZWQpKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24ubGFiZWwpLCBbJ0Rpc2FibGUnLCAnRGlzYWJsZSAoV29ya3NwYWNlKSddKTtcblx0XHRcdFx0cnVuQWN0aW9uKGFjdGlvbnNbMV0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRsb2NhbENhbGxzLFxuXHRcdFx0XHRcdGFnZW50SG9zdENhbGxzLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0bG9jYWxDYWxsczogW1snc2VydmVyLWRlZi1pZCcsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZV1dLFxuXHRcdFx0XHRcdGFnZW50SG9zdENhbGxzOiBbXSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIHRoZSB3b3Jrc3BhY2UgdmFyaWFudCBpbiBhbiBlbXB0eSB3b3JrYmVuY2gnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZU1jcFNlcnZpY2UoQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gdHJhY2tBY3Rpb25zKGRpc3Bvc2FibGVzLCBnZXRMb2NhbE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb25zKHNlcnZpY2UsICdzZXJ2ZXItZGVmLWlkJywgdHJ1ZSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLm1hcChhID0+IGEubGFiZWwpLCBbJ0VuYWJsZSddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldEFjdGl2ZVNlc3Npb25TZXJ2ZXJPcHRpb25zQWN0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdjb21wb3NlcyBsaWZlY3ljbGUsIGR1cmFibGUsIHNlc3Npb24sIGFuZCBvcHRpb25zIGFjdGlvbnMgd2l0aG91dCBkdXBsaWNhdGluZyBncm91cHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25zKCk7XG5cdFx0XHRjb25zdCBzZXJ2ZXIgPSBjcmVhdGVBZ2VudEhvc3RTZXJ2ZXIoeyBlbmFibGVkOiB0cnVlLCBzdGF0dXM6IE1jcFNlcnZlclN0YXR1cy5SZWFkeSB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWFnZW50LXNlc3Npb246Ly8vc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IHsgZXhlY3V0ZUNvbW1hbmQ6IGFzeW5jICgpID0+IHVuZGVmaW5lZCB9IGFzIHVua25vd24gYXMgSUNvbW1hbmRTZXJ2aWNlO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IHRyYWNrQWN0aW9ucyhkaXNwb3NhYmxlcywgZ2V0QWN0aXZlU2Vzc2lvblNlcnZlck9wdGlvbnNBY3Rpb25zKFxuXHRcdFx0XHRjb21tYW5kU2VydmljZSxcblx0XHRcdFx0c2VydmljZSxcblx0XHRcdFx0Y3JlYXRlQWdlbnRQbHVnaW5TZXJ2aWNlKCksXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0c2VydmVyLFxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IGxhYmVscyA9IGFjdGlvbnMubWFwKGEgPT4gYSBpbnN0YW5jZW9mIFNlcGFyYXRvciA/ICcoc2VwYXJhdG9yKScgOiBhLmxhYmVsKTtcblx0XHRcdC8vIFN0b3AgU2VydmVyIChsaWZlY3ljbGUpIC0+IHNlcGFyYXRvciAtPiBzY29wZWQgZW5hYmxlbWVudCAtPiBzZXBhcmF0b3IgLT4gU2VydmVyIE9wdGlvbnNcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFiZWxzLCBbXG5cdFx0XHRcdCdTdG9wIFNlcnZlcicsXG5cdFx0XHRcdCcoc2VwYXJhdG9yKScsXG5cdFx0XHRcdCdEaXNhYmxlJyxcblx0XHRcdFx0J0Rpc2FibGUgKFdvcmtzcGFjZSknLFxuXHRcdFx0XHQnRGlzYWJsZSAoU2Vzc2lvbiknLFxuXHRcdFx0XHQnKHNlcGFyYXRvciknLFxuXHRcdFx0XHQnU2VydmVyIE9wdGlvbnMnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpbmxpbmUgYWN0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdhdXRoZW50aWNhdGlvbiByZWNlaXZlcyB0aGUgYWN0aXZlIHNlc3Npb24gYW5kIHNlcnZlciB3aXRob3V0IG9wZW5pbmcgdGhlIHJvdycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWFnZW50LXNlc3Npb246Ly8vc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBjYWxsczogW1VSSSwgc3RyaW5nXVtdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0ge1xuXHRcdFx0XHRhdXRoZW50aWNhdGVNY3BTZXJ2ZXI6IChyZXNvdXJjZTogVVJJLCBzZXJ2ZXJJZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0Y2FsbHMucHVzaChbcmVzb3VyY2UsIHNlcnZlcklkXSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRcdFx0fSxcblx0XHRcdH0gYXMgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlO1xuXHRcdFx0Y29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRsZXQgcm93UG9pbnRlckRvd25zID0gMDtcblx0XHRcdGxldCByb3dDbGlja3MgPSAwO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKHJvdywgKCkgPT4gcm93UG9pbnRlckRvd25zKyspKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJvdywgRE9NLkV2ZW50VHlwZS5DTElDSywgKCkgPT4gcm93Q2xpY2tzKyspKTtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHJvdywgdW50aGVtZWRCdXR0b25TdHlsZXMpKTtcblx0XHRcdHJlZ2lzdGVyTWNwSW5saW5lQnV0dG9uQWN0aW9uKGRpc3Bvc2FibGVzLCBidXR0b24sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgYXV0aGVudGljYXRlTWNwU2VydmVyKHNlcnZpY2UsIHNlc3Npb25SZXNvdXJjZSwgJ3NlcnZlci0xJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YnV0dG9uLmVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudChET00uRXZlbnRUeXBlLk1PVVNFX0RPV04sIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0XHRidXR0b24uZWxlbWVudC5jbGljaygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2FsbHMsXG5cdFx0XHRcdHJvd1BvaW50ZXJEb3ducyxcblx0XHRcdFx0cm93Q2xpY2tzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjYWxsczogW1tzZXNzaW9uUmVzb3VyY2UsICdzZXJ2ZXItMSddXSxcblx0XHRcdFx0cm93UG9pbnRlckRvd25zOiAwLFxuXHRcdFx0XHRyb3dDbGlja3M6IDAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjdGl2ZS1zZXNzaW9uIGVycm9yIHJlZ2lzdGVycyB0aGUgY2hhbm5lbCwgY2xvc2VzIHRoZSBlZGl0b3IsIHRoZW4gb3BlbnMgb3V0cHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2hvd25DaGFubmVsczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGxldCBsb2NhbE91dHB1dENvdW50ID0gMDtcblx0XHRcdGNvbnN0IGFjdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBvdXRwdXRIYW5kbGVyID0gZ2V0TWNwU2VydmVyT3V0cHV0SGFuZGxlcihcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNob3dDaGFubmVsOiBhc3luYyBjaGFubmVsSWQgPT4ge1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5wdXNoKCdzaG93LW91dHB1dCcpO1xuXHRcdFx0XHRcdFx0c2hvd25DaGFubmVscy5wdXNoKGNoYW5uZWxJZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7IHNob3dPdXRwdXQ6IGFzeW5jICgpID0+IHsgbG9jYWxPdXRwdXRDb3VudCsrOyB9IH0sXG5cdFx0XHRcdGNyZWF0ZUFnZW50SG9zdFNlcnZlcih7IGxvZ091dHB1dENoYW5uZWxJZDogJ2FnZW50LWhvc3Qtb3V0cHV0JyB9KSxcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaCgnY2xvc2UtZWRpdG9yJyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFzeW5jIGJlZm9yZVNob3cgPT4ge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaCgncmVnaXN0ZXItYWdlbnQtaG9zdC1vdXRwdXQnKTtcblx0XHRcdFx0XHRhd2FpdCBiZWZvcmVTaG93Py4oKTtcblx0XHRcdFx0XHRhY3Rpb25zLnB1c2goJ3Nob3ctYWdlbnQtaG9zdC1vdXRwdXQnKTtcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2sob3V0cHV0SGFuZGxlcik7XG5cblx0XHRcdGF3YWl0IG91dHB1dEhhbmRsZXIoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNob3duQ2hhbm5lbHMsXG5cdFx0XHRcdGxvY2FsT3V0cHV0Q291bnQsXG5cdFx0XHRcdGFjdGlvbnMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNob3duQ2hhbm5lbHM6IFtdLFxuXHRcdFx0XHRsb2NhbE91dHB1dENvdW50OiAwLFxuXHRcdFx0XHRhY3Rpb25zOiBbJ3JlZ2lzdGVyLWFnZW50LWhvc3Qtb3V0cHV0JywgJ2Nsb3NlLWVkaXRvcicsICdzaG93LWFnZW50LWhvc3Qtb3V0cHV0J10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xvY2FsIGVycm9yIG9wZW5zIGxvY2FsIG91dHB1dCB3aGVuIG5vIGFnZW50LWhvc3Qgb3V0cHV0IGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNob3duQ2hhbm5lbHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRsZXQgbG9jYWxPdXRwdXRDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBvdXRwdXRIYW5kbGVyID0gZ2V0TWNwU2VydmVyT3V0cHV0SGFuZGxlcihcblx0XHRcdFx0eyBzaG93Q2hhbm5lbDogYXN5bmMgY2hhbm5lbElkID0+IHsgc2hvd25DaGFubmVscy5wdXNoKGNoYW5uZWxJZCk7IH0gfSxcblx0XHRcdFx0eyBzaG93T3V0cHV0OiBhc3luYyAoKSA9PiB7IGxvY2FsT3V0cHV0Q291bnQrKzsgfSB9LFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQpO1xuXG5cdFx0XHRhd2FpdCBvdXRwdXRIYW5kbGVyPy4oKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNob3duQ2hhbm5lbHMsXG5cdFx0XHRcdGxvY2FsT3V0cHV0Q291bnQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNob3duQ2hhbm5lbHM6IFtdLFxuXHRcdFx0XHRsb2NhbE91dHB1dENvdW50OiAxLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsUUFBUSw0QkFBNEI7QUFDN0MsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsUUFBaUIsaUJBQWlCO0FBQzNDLFNBQTBCLG9CQUFvQjtBQUM5QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLDZCQUE2Qix1QkFBcUQ7QUFDM0YsU0FBUyxtQ0FBbUM7QUFLNUMsU0FBUyxvQ0FBb0MsZ0NBQWdDLG1DQUFtQyxxQ0FBcUM7QUFDcko7QUFBQSxFQUVDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBRVAsU0FBUyxzQkFBc0IsWUFB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
