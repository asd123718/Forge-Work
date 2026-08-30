import assert from "assert";
import { Event } from "../../../../../base/common/event.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { isCustomizationEnabled, sortCustomizationEnablement } from "../../../common/customizationEnablement.js";
import { CustomizationEnablementKind, CustomizationType, McpServerStatus } from "../../../common/state/protocol/channels-session/state.js";
import { getSdkMcpServerEnablement, isCustomizationSdkEligible, recordClientPluginEnablement, resolveCustomizationEnablement } from "../../../node/shared/customizationEnablementGate.js";
class TestEnablementService {
  constructor() {
    this.onDidChange = Event.None;
    this._enablement = /* @__PURE__ */ new Map();
    this._enablementByDurableKey = /* @__PURE__ */ new Map();
  }
  setEnablementFor(id, enablement) {
    this._enablement.set(id, sortCustomizationEnablement(enablement));
  }
  setEnablementForDurableKey(key, enablement) {
    this._enablementByDurableKey.set(key, sortCustomizationEnablement(enablement));
  }
  setPending(reason) {
    this._pending = reason;
  }
  async initializeSession(_session) {
  }
  getWorkingDirectoryState(_session) {
    return { kind: "workspaceless" };
  }
  resolve(_session, target) {
    this.lastResolvedTarget = target;
    if (this._pending !== void 0) {
      return { kind: "pending", reason: this._pending };
    }
    return this._resolved(this._enablement.get(target.id) ?? this._enablementByDurableKey.get(this._key(target)) ?? []);
  }
  applyClientGlobalEnablement(session, target, enablement) {
    const global = enablement.find((entry) => entry.kind === CustomizationEnablementKind.Global);
    if (global === void 0) {
      throw new Error("Expected a global enablement entry");
    }
    const existing = this._enablement.get(target.id) ?? [];
    this._enablement.set(target.id, sortCustomizationEnablement([
      ...existing.filter((entry) => entry.kind !== CustomizationEnablementKind.Global),
      global
    ]));
    return this.resolve(session, target);
  }
  replaceEnablement(session, target, enablement) {
    this._enablement.set(target.id, sortCustomizationEnablement(enablement));
    return this.resolve(session, target);
  }
  setEnablement(session, target, _kind, _enabled) {
    return this.resolve(session, target);
  }
  async whenIdle() {
  }
  _resolved(enablement) {
    return {
      kind: "resolved",
      enablement,
      enabled: isCustomizationEnabled({ enablement }),
      workingDirectory: { kind: "workspaceless" }
    };
  }
  _key(target) {
    return target.type === CustomizationType.McpServer && target.owningPluginSource ? `${target.owningPluginSource.toString()}#mcp=${target.name}` : target.id;
  }
}
function plugin(children) {
  return {
    type: CustomizationType.Plugin,
    id: "plugin-id",
    uri: "file:///plugins/example",
    name: "Example Plugin",
    children
  };
}
function server() {
  return {
    type: CustomizationType.McpServer,
    id: "server-id",
    uri: "file:///plugins/example/.mcp.json",
    name: "server",
    state: { kind: McpServerStatus.Starting }
  };
}
function agent() {
  return {
    type: CustomizationType.Agent,
    id: "agent-id",
    uri: "file:///plugins/example/agents/example.agent.md",
    name: "agent"
  };
}
function sdkChildNames(customizations) {
  return customizations.flatMap((customization) => {
    if (customization.type !== CustomizationType.Plugin || !isCustomizationEnabled(customization)) {
      return [];
    }
    return customization.children?.flatMap((child) => child.type === CustomizationType.McpServer && isCustomizationEnabled(child) ? [child.name] : []) ?? [];
  });
}
function sdkAgentNames(customizations) {
  return customizations.flatMap((customization) => {
    if (customization.type !== CustomizationType.Plugin || !isCustomizationEnabled(customization)) {
      return [];
    }
    return customization.children?.flatMap((child) => child.type === CustomizationType.Agent ? [child.name] : []) ?? [];
  });
}
function firstChildEnablement(customizations) {
  const first = customizations[0];
  const child = first?.type === CustomizationType.Plugin ? first.children?.[0] : void 0;
  if (child?.type !== CustomizationType.McpServer) {
    return void 0;
  }
  return child.enablement;
}
suite("CustomizationEnablementGate", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("does not fabricate enablement while a resolution is pending and excludes it from the SDK", () => {
    const service = new TestEnablementService();
    service.setPending("session");
    const customization = plugin([server()]);
    const resolved = resolveCustomizationEnablement(service, URI.parse("ahp://copilot/session-1"), [customization]);
    const child = resolved.customizations[0].children?.[0];
    assert.deepStrictEqual({
      pending: resolved.pending,
      pendingCustomizationIds: [...resolved.pendingCustomizationIds],
      published: resolved.customizations,
      sdkEligible: isCustomizationSdkEligible(resolved, customization),
      childSdkEligible: child && isCustomizationSdkEligible(resolved, child)
    }, {
      pending: true,
      pendingCustomizationIds: ["plugin-id", "server-id"],
      published: [{
        ...customization,
        children: [server()]
      }],
      sdkEligible: false,
      childSdkEligible: false
    });
  });
  test("fails closed when deriving MCP server enablement for a pending resolution", () => {
    const service = new TestEnablementService();
    service.setPending("session");
    const resolved = resolveCustomizationEnablement(service, URI.parse("ahp://copilot/session-1"), [plugin([server()])]);
    assert.deepStrictEqual([...getSdkMcpServerEnablement(resolved)], [["server-id", false]]);
  });
  test("removes stale enablement when an empty resolution settles", () => {
    const service = new TestEnablementService();
    const customization = {
      ...server(),
      enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }]
    };
    const resolved = resolveCustomizationEnablement(service, URI.parse("ahp://copilot/session-1"), [customization]);
    assert.deepStrictEqual(resolved.customizations, [{
      type: CustomizationType.McpServer,
      id: "server-id",
      uri: "file:///plugins/example/.mcp.json",
      name: "server",
      state: { kind: McpServerStatus.Starting }
    }]);
  });
  test("replaces only a child global decision while preserving host workspace and session decisions", () => {
    const service = new TestEnablementService();
    service.setEnablementFor("server-id", [
      { kind: CustomizationEnablementKind.Session, enabled: false },
      { kind: CustomizationEnablementKind.Workspace, uri: "file:///repo", enabled: true },
      { kind: CustomizationEnablementKind.Global, enabled: true }
    ]);
    const parsedPlugin = plugin([server()]);
    const clientPlugin = {
      ...parsedPlugin,
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
      childEnablement: {
        server: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
      }
    };
    recordClientPluginEnablement(service, URI.parse("ahp://copilot/session-1"), parsedPlugin, clientPlugin);
    const resolved = resolveCustomizationEnablement(service, URI.parse("ahp://copilot/session-1"), [parsedPlugin]);
    assert.deepStrictEqual(resolved.customizations, [{
      ...parsedPlugin,
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
      children: [{
        ...server(),
        enablement: [
          { kind: CustomizationEnablementKind.Session, enabled: false },
          { kind: CustomizationEnablementKind.Workspace, uri: "file:///repo", enabled: true },
          { kind: CustomizationEnablementKind.Global, enabled: false }
        ]
      }]
    }]);
  });
  test("publishes a workspace decision for a materialized plugin MCP child in every session", () => {
    const service = new TestEnablementService();
    const pluginUri = "file:///Users/connor/.vscode-oss-dev-dev/agent-plugins/github.com/microsoft/azure-skills/.github/plugins/azure-skills";
    const materializedChildId = "file:///Users/connor/.vscode-oss-dev-dev/agentPlugins/19ff2ac36f2/.mcp.json#mcp=azure";
    const workspaceEnablement = [{ kind: CustomizationEnablementKind.Workspace, uri: "file:///Users/connor/Github/js-debug-demos/node", enabled: false }];
    service.setEnablementForDurableKey(`${pluginUri}#mcp=azure`, workspaceEnablement);
    const parsedPlugin = {
      ...plugin([{
        ...server(),
        id: materializedChildId,
        uri: "file:///Users/connor/.vscode-oss-dev-dev/agentPlugins/19ff2ac36f2/.mcp.json",
        name: "azure"
      }]),
      uri: pluginUri
    };
    const firstSession = resolveCustomizationEnablement(service, URI.parse("ahp://copilot/session-1"), [parsedPlugin]);
    const secondSession = resolveCustomizationEnablement(service, URI.parse("ahp://copilot/session-2"), [parsedPlugin]);
    assert.deepStrictEqual({
      first: firstChildEnablement(firstSession.customizations),
      second: firstChildEnablement(secondSession.customizations),
      firstSdkChildren: sdkChildNames(firstSession.customizations),
      secondSdkChildren: sdkChildNames(secondSession.customizations)
    }, {
      first: workspaceEnablement,
      second: workspaceEnablement,
      firstSdkChildren: [],
      secondSdkChildren: []
    });
  });
  test("publishes a global decision for a materialized plugin MCP child in a newly created session", () => {
    const service = new TestEnablementService();
    const pluginUri = "file:///plugins/azure-skills";
    const globalEnablement = [{ kind: CustomizationEnablementKind.Global, enabled: false }];
    service.setEnablementForDurableKey(`${pluginUri}#mcp=azure`, globalEnablement);
    const parsedPlugin = {
      ...plugin([{ ...server(), name: "azure" }]),
      uri: pluginUri
    };
    const resolved = resolveCustomizationEnablement(service, URI.parse("ahp://copilot/new-session"), [parsedPlugin]);
    assert.deepStrictEqual(firstChildEnablement(resolved.customizations), globalEnablement);
  });
  test("resolves a plugin MCP server to the same durable identity while nested or top-level", () => {
    const service = new TestEnablementService();
    const pluginUri = "file:///plugins/azure-skills";
    const enablement = [{ kind: CustomizationEnablementKind.Global, enabled: false }];
    service.setEnablementForDurableKey(`${pluginUri}#mcp=azure`, enablement);
    const nested = plugin([{ ...server(), name: "azure" }]);
    const topLevel = {
      ...server(),
      id: "mcp-top-level:copilot:new-session:azure",
      uri: "mcp-top-level:copilot:new-session:azure",
      name: "azure"
    };
    const nestedResolved = resolveCustomizationEnablement(service, URI.parse("ahp://copilot/new-session"), [{ ...nested, uri: pluginUri }]);
    const topLevelResolved = resolveCustomizationEnablement(
      service,
      URI.parse("ahp://copilot/new-session"),
      [topLevel],
      /* @__PURE__ */ new Map([[pluginUri, { azure: [] }]]),
      void 0,
      /* @__PURE__ */ new Map([["azure", pluginUri]])
    );
    assert.deepStrictEqual({
      nested: firstChildEnablement(nestedResolved.customizations),
      topLevel: topLevelResolved.customizations[0].enablement,
      topLevelIsClientBundled: service.lastResolvedTarget?.isClientBundled
    }, {
      nested: enablement,
      topLevel: enablement,
      topLevelIsClientBundled: true
    });
  });
  test("retains a plugin child global decision when its client republish has no opinion", () => {
    const service = new TestEnablementService();
    service.setEnablementFor("server-id", [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
    const parsedPlugin = plugin([server()]);
    const clientChildEnablement = /* @__PURE__ */ new Map([[parsedPlugin.uri, {
      server: []
    }]]);
    const resolved = resolveCustomizationEnablement(
      service,
      URI.parse("ahp://copilot/session-1"),
      [parsedPlugin],
      clientChildEnablement,
      /* @__PURE__ */ new Map([[parsedPlugin.uri, { ...parsedPlugin, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }] }]])
    );
    const resolvedChild = resolved.customizations[0].children?.[0];
    assert.deepStrictEqual({
      enablement: resolvedChild.enablement,
      isClientBundled: service.lastResolvedTarget?.isClientBundled,
      publishesClientBundled: Object.hasOwn(resolvedChild, "isClientBundled")
    }, {
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
      isClientBundled: true,
      publishesClientBundled: false
    });
  });
  test("masks a child when its plugin is disabled without erasing the child decision", () => {
    const service = new TestEnablementService();
    service.setEnablementFor("plugin-id", [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
    service.setEnablementFor("server-id", [{ kind: CustomizationEnablementKind.Session, enabled: true }]);
    const parsedPlugin = plugin([server()]);
    const disabled = resolveCustomizationEnablement(service, URI.parse("ahp://copilot/session-1"), [parsedPlugin]);
    service.setEnablementFor("plugin-id", []);
    const reenabled = resolveCustomizationEnablement(service, URI.parse("ahp://copilot/session-1"), [parsedPlugin]);
    assert.deepStrictEqual({
      disabledSdkChildren: sdkChildNames(disabled.customizations),
      reenabledSdkChildren: sdkChildNames(reenabled.customizations),
      childEnablementAfterReenable: firstChildEnablement(reenabled.customizations)
    }, {
      disabledSdkChildren: [],
      reenabledSdkChildren: ["server"],
      childEnablementAfterReenable: [{ kind: CustomizationEnablementKind.Session, enabled: true }]
    });
  });
  test("keeps disabled plugin agents out of the SDK handoff", () => {
    const service = new TestEnablementService();
    service.setEnablementFor("plugin-id", [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
    const parsedPlugin = plugin([agent()]);
    const disabled = resolveCustomizationEnablement(service, URI.parse("ahp://copilot/session-1"), [parsedPlugin]);
    service.setEnablementFor("plugin-id", []);
    const reenabled = resolveCustomizationEnablement(service, URI.parse("ahp://copilot/session-1"), [parsedPlugin]);
    assert.deepStrictEqual({
      disabledSdkAgents: sdkAgentNames(disabled.customizations),
      reenabledSdkAgents: sdkAgentNames(reenabled.customizations)
    }, {
      disabledSdkAgents: [],
      reenabledSdkAgents: ["agent"]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzaGFyZWRcXGN1c3RvbWl6YXRpb25FbmFibGVtZW50R2F0ZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBpc0N1c3RvbWl6YXRpb25FbmFibGVkLCBzb3J0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3VzdG9taXphdGlvbkVuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLCBDdXN0b21pemF0aW9uVHlwZSwgTWNwU2VydmVyU3RhdHVzLCB0eXBlIEFnZW50Q3VzdG9taXphdGlvbiwgdHlwZSBDaGlsZEN1c3RvbWl6YXRpb24sIHR5cGUgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBDdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb25FbmFibGVtZW50LCB0eXBlIE1jcFNlcnZlckN1c3RvbWl6YXRpb24sIHR5cGUgUGx1Z2luQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1zZXNzaW9uL3N0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UsIHR5cGUgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRSZXNvbHV0aW9uLCB0eXBlIElDdXN0b21pemF0aW9uRW5hYmxlbWVudFRhcmdldCwgdHlwZSBXb3JraW5nRGlyZWN0b3J5U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRTZGtNY3BTZXJ2ZXJFbmFibGVtZW50LCBpc0N1c3RvbWl6YXRpb25TZGtFbGlnaWJsZSwgcmVjb3JkQ2xpZW50UGx1Z2luRW5hYmxlbWVudCwgcmVzb2x2ZUN1c3RvbWl6YXRpb25FbmFibGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9zaGFyZWQvY3VzdG9taXphdGlvbkVuYWJsZW1lbnRHYXRlLmpzJztcblxuY2xhc3MgVGVzdEVuYWJsZW1lbnRTZXJ2aWNlIGltcGxlbWVudHMgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VuYWJsZW1lbnQgPSBuZXcgTWFwPHN0cmluZywgcmVhZG9ubHkgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRbXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZW5hYmxlbWVudEJ5RHVyYWJsZUtleSA9IG5ldyBNYXA8c3RyaW5nLCByZWFkb25seSBDdXN0b21pemF0aW9uRW5hYmxlbWVudFtdPigpO1xuXHRwcml2YXRlIF9wZW5kaW5nOiAnc2Vzc2lvbicgfCAnd29ya2luZ0RpcmVjdG9yeScgfCB1bmRlZmluZWQ7XG5cdGxhc3RSZXNvbHZlZFRhcmdldDogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0IHwgdW5kZWZpbmVkO1xuXG5cdHNldEVuYWJsZW1lbnRGb3IoaWQ6IHN0cmluZywgZW5hYmxlbWVudDogcmVhZG9ubHkgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2VuYWJsZW1lbnQuc2V0KGlkLCBzb3J0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQoZW5hYmxlbWVudCkpO1xuXHR9XG5cblx0c2V0RW5hYmxlbWVudEZvckR1cmFibGVLZXkoa2V5OiBzdHJpbmcsIGVuYWJsZW1lbnQ6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10pOiB2b2lkIHtcblx0XHR0aGlzLl9lbmFibGVtZW50QnlEdXJhYmxlS2V5LnNldChrZXksIHNvcnRDdXN0b21pemF0aW9uRW5hYmxlbWVudChlbmFibGVtZW50KSk7XG5cdH1cblxuXHRzZXRQZW5kaW5nKHJlYXNvbjogJ3Nlc3Npb24nIHwgJ3dvcmtpbmdEaXJlY3RvcnknIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZyA9IHJlYXNvbjtcblx0fVxuXG5cdGFzeW5jIGluaXRpYWxpemVTZXNzaW9uKF9zZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdGdldFdvcmtpbmdEaXJlY3RvcnlTdGF0ZShfc2Vzc2lvbjogc3RyaW5nKTogV29ya2luZ0RpcmVjdG9yeVN0YXRlIHtcblx0XHRyZXR1cm4geyBraW5kOiAnd29ya3NwYWNlbGVzcycgfTtcblx0fVxuXG5cdHJlc29sdmUoX3Nlc3Npb246IHN0cmluZywgdGFyZ2V0OiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQpOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudFJlc29sdXRpb24ge1xuXHRcdHRoaXMubGFzdFJlc29sdmVkVGFyZ2V0ID0gdGFyZ2V0O1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdwZW5kaW5nJywgcmVhc29uOiB0aGlzLl9wZW5kaW5nIH07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlZCh0aGlzLl9lbmFibGVtZW50LmdldCh0YXJnZXQuaWQpID8/IHRoaXMuX2VuYWJsZW1lbnRCeUR1cmFibGVLZXkuZ2V0KHRoaXMuX2tleSh0YXJnZXQpKSA/PyBbXSk7XG5cdH1cblxuXHRhcHBseUNsaWVudEdsb2JhbEVuYWJsZW1lbnQoc2Vzc2lvbjogc3RyaW5nLCB0YXJnZXQ6IElDdXN0b21pemF0aW9uRW5hYmxlbWVudFRhcmdldCwgZW5hYmxlbWVudDogcmVhZG9ubHkgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRbXSk6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50UmVzb2x1dGlvbiB7XG5cdFx0Y29uc3QgZ2xvYmFsID0gZW5hYmxlbWVudC5maW5kKGVudHJ5ID0+IGVudHJ5LmtpbmQgPT09IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwpO1xuXHRcdGlmIChnbG9iYWwgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBhIGdsb2JhbCBlbmFibGVtZW50IGVudHJ5Jyk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fZW5hYmxlbWVudC5nZXQodGFyZ2V0LmlkKSA/PyBbXTtcblx0XHR0aGlzLl9lbmFibGVtZW50LnNldCh0YXJnZXQuaWQsIHNvcnRDdXN0b21pemF0aW9uRW5hYmxlbWVudChbXG5cdFx0XHQuLi5leGlzdGluZy5maWx0ZXIoZW50cnkgPT4gZW50cnkua2luZCAhPT0gQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCksXG5cdFx0XHRnbG9iYWwsXG5cdFx0XSkpO1xuXHRcdHJldHVybiB0aGlzLnJlc29sdmUoc2Vzc2lvbiwgdGFyZ2V0KTtcblx0fVxuXG5cdHJlcGxhY2VFbmFibGVtZW50KHNlc3Npb246IHN0cmluZywgdGFyZ2V0OiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQsIGVuYWJsZW1lbnQ6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10pOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudFJlc29sdXRpb24ge1xuXHRcdHRoaXMuX2VuYWJsZW1lbnQuc2V0KHRhcmdldC5pZCwgc29ydEN1c3RvbWl6YXRpb25FbmFibGVtZW50KGVuYWJsZW1lbnQpKTtcblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlKHNlc3Npb24sIHRhcmdldCk7XG5cdH1cblxuXHRzZXRFbmFibGVtZW50KHNlc3Npb246IHN0cmluZywgdGFyZ2V0OiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQsIF9raW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQsIF9lbmFibGVkOiBib29sZWFuKTogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRSZXNvbHV0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlKHNlc3Npb24sIHRhcmdldCk7XG5cdH1cblxuXHRhc3luYyB3aGVuSWRsZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdHByaXZhdGUgX3Jlc29sdmVkKGVuYWJsZW1lbnQ6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10pOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudFJlc29sdXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAncmVzb2x2ZWQnLFxuXHRcdFx0ZW5hYmxlbWVudCxcblx0XHRcdGVuYWJsZWQ6IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQoeyBlbmFibGVtZW50IH0pLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogeyBraW5kOiAnd29ya3NwYWNlbGVzcycgfSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfa2V5KHRhcmdldDogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGFyZ2V0LnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlciAmJiB0YXJnZXQub3duaW5nUGx1Z2luU291cmNlXG5cdFx0XHQ/IGAke3RhcmdldC5vd25pbmdQbHVnaW5Tb3VyY2UudG9TdHJpbmcoKX0jbWNwPSR7dGFyZ2V0Lm5hbWV9YFxuXHRcdFx0OiB0YXJnZXQuaWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gcGx1Z2luKGNoaWxkcmVuPzogQ2hpbGRDdXN0b21pemF0aW9uW10pOiBQbHVnaW5DdXN0b21pemF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0aWQ6ICdwbHVnaW4taWQnLFxuXHRcdHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9leGFtcGxlJyxcblx0XHRuYW1lOiAnRXhhbXBsZSBQbHVnaW4nLFxuXHRcdGNoaWxkcmVuLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBzZXJ2ZXIoKTogTWNwU2VydmVyQ3VzdG9taXphdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLFxuXHRcdGlkOiAnc2VydmVyLWlkJyxcblx0XHR1cmk6ICdmaWxlOi8vL3BsdWdpbnMvZXhhbXBsZS8ubWNwLmpzb24nLFxuXHRcdG5hbWU6ICdzZXJ2ZXInLFxuXHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdGFydGluZyB9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBhZ2VudCgpOiBBZ2VudEN1c3RvbWl6YXRpb24ge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LFxuXHRcdGlkOiAnYWdlbnQtaWQnLFxuXHRcdHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9leGFtcGxlL2FnZW50cy9leGFtcGxlLmFnZW50Lm1kJyxcblx0XHRuYW1lOiAnYWdlbnQnLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBzZGtDaGlsZE5hbWVzKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10pOiBzdHJpbmdbXSB7XG5cdHJldHVybiBjdXN0b21pemF0aW9ucy5mbGF0TWFwKGN1c3RvbWl6YXRpb24gPT4ge1xuXHRcdGlmIChjdXN0b21pemF0aW9uLnR5cGUgIT09IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiB8fCAhaXNDdXN0b21pemF0aW9uRW5hYmxlZChjdXN0b21pemF0aW9uKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gY3VzdG9taXphdGlvbi5jaGlsZHJlbj8uZmxhdE1hcChjaGlsZCA9PiBjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIgJiYgaXNDdXN0b21pemF0aW9uRW5hYmxlZChjaGlsZCkgPyBbY2hpbGQubmFtZV0gOiBbXSkgPz8gW107XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBzZGtBZ2VudE5hbWVzKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10pOiBzdHJpbmdbXSB7XG5cdHJldHVybiBjdXN0b21pemF0aW9ucy5mbGF0TWFwKGN1c3RvbWl6YXRpb24gPT4ge1xuXHRcdGlmIChjdXN0b21pemF0aW9uLnR5cGUgIT09IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiB8fCAhaXNDdXN0b21pemF0aW9uRW5hYmxlZChjdXN0b21pemF0aW9uKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gY3VzdG9taXphdGlvbi5jaGlsZHJlbj8uZmxhdE1hcChjaGlsZCA9PiBjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCA/IFtjaGlsZC5uYW1lXSA6IFtdKSA/PyBbXTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGZpcnN0Q2hpbGRFbmFibGVtZW50KGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10pOiByZWFkb25seSBDdXN0b21pemF0aW9uRW5hYmxlbWVudFtdIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZmlyc3QgPSBjdXN0b21pemF0aW9uc1swXTtcblx0Y29uc3QgY2hpbGQgPSBmaXJzdD8udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luID8gZmlyc3QuY2hpbGRyZW4/LlswXSA6IHVuZGVmaW5lZDtcblx0aWYgKGNoaWxkPy50eXBlICE9PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBjaGlsZC5lbmFibGVtZW50O1xufVxuXG5zdWl0ZSgnQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRHYXRlJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGZhYnJpY2F0ZSBlbmFibGVtZW50IHdoaWxlIGEgcmVzb2x1dGlvbiBpcyBwZW5kaW5nIGFuZCBleGNsdWRlcyBpdCBmcm9tIHRoZSBTREsnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RW5hYmxlbWVudFNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLnNldFBlbmRpbmcoJ3Nlc3Npb24nKTtcblx0XHRjb25zdCBjdXN0b21pemF0aW9uID0gcGx1Z2luKFtzZXJ2ZXIoKV0pO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZUN1c3RvbWl6YXRpb25FbmFibGVtZW50KHNlcnZpY2UsIFVSSS5wYXJzZSgnYWhwOi8vY29waWxvdC9zZXNzaW9uLTEnKSwgW2N1c3RvbWl6YXRpb25dKTtcblx0XHRjb25zdCBjaGlsZCA9IChyZXNvbHZlZC5jdXN0b21pemF0aW9uc1swXSBhcyBQbHVnaW5DdXN0b21pemF0aW9uKS5jaGlsZHJlbj8uWzBdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwZW5kaW5nOiByZXNvbHZlZC5wZW5kaW5nLFxuXHRcdFx0cGVuZGluZ0N1c3RvbWl6YXRpb25JZHM6IFsuLi5yZXNvbHZlZC5wZW5kaW5nQ3VzdG9taXphdGlvbklkc10sXG5cdFx0XHRwdWJsaXNoZWQ6IHJlc29sdmVkLmN1c3RvbWl6YXRpb25zLFxuXHRcdFx0c2RrRWxpZ2libGU6IGlzQ3VzdG9taXphdGlvblNka0VsaWdpYmxlKHJlc29sdmVkLCBjdXN0b21pemF0aW9uKSxcblx0XHRcdGNoaWxkU2RrRWxpZ2libGU6IGNoaWxkICYmIGlzQ3VzdG9taXphdGlvblNka0VsaWdpYmxlKHJlc29sdmVkLCBjaGlsZCksXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZzogdHJ1ZSxcblx0XHRcdHBlbmRpbmdDdXN0b21pemF0aW9uSWRzOiBbJ3BsdWdpbi1pZCcsICdzZXJ2ZXItaWQnXSxcblx0XHRcdHB1Ymxpc2hlZDogW3tcblx0XHRcdFx0Li4uY3VzdG9taXphdGlvbixcblx0XHRcdFx0Y2hpbGRyZW46IFtzZXJ2ZXIoKV0sXG5cdFx0XHR9XSxcblx0XHRcdHNka0VsaWdpYmxlOiBmYWxzZSxcblx0XHRcdGNoaWxkU2RrRWxpZ2libGU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWlscyBjbG9zZWQgd2hlbiBkZXJpdmluZyBNQ1Agc2VydmVyIGVuYWJsZW1lbnQgZm9yIGEgcGVuZGluZyByZXNvbHV0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVuYWJsZW1lbnRTZXJ2aWNlKCk7XG5cdFx0c2VydmljZS5zZXRQZW5kaW5nKCdzZXNzaW9uJyk7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQoc2VydmljZSwgVVJJLnBhcnNlKCdhaHA6Ly9jb3BpbG90L3Nlc3Npb24tMScpLCBbcGx1Z2luKFtzZXJ2ZXIoKV0pXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5nZXRTZGtNY3BTZXJ2ZXJFbmFibGVtZW50KHJlc29sdmVkKV0sIFtbJ3NlcnZlci1pZCcsIGZhbHNlXV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVzIHN0YWxlIGVuYWJsZW1lbnQgd2hlbiBhbiBlbXB0eSByZXNvbHV0aW9uIHNldHRsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RW5hYmxlbWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBjdXN0b21pemF0aW9uOiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uID0ge1xuXHRcdFx0Li4uc2VydmVyKCksXG5cdFx0XHRlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgZW5hYmxlZDogZmFsc2UgfV0sXG5cdFx0fTtcblx0XHRjb25zdCByZXNvbHZlZCA9IHJlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudChzZXJ2aWNlLCBVUkkucGFyc2UoJ2FocDovL2NvcGlsb3Qvc2Vzc2lvbi0xJyksIFtjdXN0b21pemF0aW9uXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVkLmN1c3RvbWl6YXRpb25zLCBbe1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLFxuXHRcdFx0aWQ6ICdzZXJ2ZXItaWQnLFxuXHRcdFx0dXJpOiAnZmlsZTovLy9wbHVnaW5zL2V4YW1wbGUvLm1jcC5qc29uJyxcblx0XHRcdG5hbWU6ICdzZXJ2ZXInLFxuXHRcdFx0c3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nIH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlcyBvbmx5IGEgY2hpbGQgZ2xvYmFsIGRlY2lzaW9uIHdoaWxlIHByZXNlcnZpbmcgaG9zdCB3b3Jrc3BhY2UgYW5kIHNlc3Npb24gZGVjaXNpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVuYWJsZW1lbnRTZXJ2aWNlKCk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50Rm9yKCdzZXJ2ZXItaWQnLCBbXG5cdFx0XHR7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLCBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0eyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB1cmk6ICdmaWxlOi8vL3JlcG8nLCBlbmFibGVkOiB0cnVlIH0sXG5cdFx0XHR7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IHRydWUgfSxcblx0XHRdKTtcblx0XHRjb25zdCBwYXJzZWRQbHVnaW4gPSBwbHVnaW4oW3NlcnZlcigpXSk7XG5cdFx0Y29uc3QgY2xpZW50UGx1Z2luOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uID0ge1xuXHRcdFx0Li4ucGFyc2VkUGx1Z2luLFxuXHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogdHJ1ZSB9XSxcblx0XHRcdGNoaWxkRW5hYmxlbWVudDoge1xuXHRcdFx0XHRzZXJ2ZXI6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0cmVjb3JkQ2xpZW50UGx1Z2luRW5hYmxlbWVudChzZXJ2aWNlLCBVUkkucGFyc2UoJ2FocDovL2NvcGlsb3Qvc2Vzc2lvbi0xJyksIHBhcnNlZFBsdWdpbiwgY2xpZW50UGx1Z2luKTtcblx0XHRjb25zdCByZXNvbHZlZCA9IHJlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudChzZXJ2aWNlLCBVUkkucGFyc2UoJ2FocDovL2NvcGlsb3Qvc2Vzc2lvbi0xJyksIFtwYXJzZWRQbHVnaW5dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZWQuY3VzdG9taXphdGlvbnMsIFt7XG5cdFx0XHQuLi5wYXJzZWRQbHVnaW4sXG5cdFx0XHRlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiB0cnVlIH1dLFxuXHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdC4uLnNlcnZlcigpLFxuXHRcdFx0XHRlbmFibGVtZW50OiBbXG5cdFx0XHRcdFx0eyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0XHR7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UsIHVyaTogJ2ZpbGU6Ly8vcmVwbycsIGVuYWJsZWQ6IHRydWUgfSxcblx0XHRcdFx0XHR7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9XSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3B1Ymxpc2hlcyBhIHdvcmtzcGFjZSBkZWNpc2lvbiBmb3IgYSBtYXRlcmlhbGl6ZWQgcGx1Z2luIE1DUCBjaGlsZCBpbiBldmVyeSBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVuYWJsZW1lbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcGx1Z2luVXJpID0gJ2ZpbGU6Ly8vVXNlcnMvY29ubm9yLy52c2NvZGUtb3NzLWRldi1kZXYvYWdlbnQtcGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC9henVyZS1za2lsbHMvLmdpdGh1Yi9wbHVnaW5zL2F6dXJlLXNraWxscyc7XG5cdFx0Y29uc3QgbWF0ZXJpYWxpemVkQ2hpbGRJZCA9ICdmaWxlOi8vL1VzZXJzL2Nvbm5vci8udnNjb2RlLW9zcy1kZXYtZGV2L2FnZW50UGx1Z2lucy8xOWZmMmFjMzZmMi8ubWNwLmpzb24jbWNwPWF6dXJlJztcblx0XHRjb25zdCB3b3Jrc3BhY2VFbmFibGVtZW50ID0gW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiAnZmlsZTovLy9Vc2Vycy9jb25ub3IvR2l0aHViL2pzLWRlYnVnLWRlbW9zL25vZGUnLCBlbmFibGVkOiBmYWxzZSB9XSBhcyBjb25zdDtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnRGb3JEdXJhYmxlS2V5KGAke3BsdWdpblVyaX0jbWNwPWF6dXJlYCwgd29ya3NwYWNlRW5hYmxlbWVudCk7XG5cdFx0Y29uc3QgcGFyc2VkUGx1Z2luOiBQbHVnaW5DdXN0b21pemF0aW9uID0ge1xuXHRcdFx0Li4ucGx1Z2luKFt7XG5cdFx0XHRcdC4uLnNlcnZlcigpLFxuXHRcdFx0XHRpZDogbWF0ZXJpYWxpemVkQ2hpbGRJZCxcblx0XHRcdFx0dXJpOiAnZmlsZTovLy9Vc2Vycy9jb25ub3IvLnZzY29kZS1vc3MtZGV2LWRldi9hZ2VudFBsdWdpbnMvMTlmZjJhYzM2ZjIvLm1jcC5qc29uJyxcblx0XHRcdFx0bmFtZTogJ2F6dXJlJyxcblx0XHRcdH1dKSxcblx0XHRcdHVyaTogcGx1Z2luVXJpLFxuXHRcdH07XG5cblx0XHRjb25zdCBmaXJzdFNlc3Npb24gPSByZXNvbHZlQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQoc2VydmljZSwgVVJJLnBhcnNlKCdhaHA6Ly9jb3BpbG90L3Nlc3Npb24tMScpLCBbcGFyc2VkUGx1Z2luXSk7XG5cdFx0Y29uc3Qgc2Vjb25kU2Vzc2lvbiA9IHJlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudChzZXJ2aWNlLCBVUkkucGFyc2UoJ2FocDovL2NvcGlsb3Qvc2Vzc2lvbi0yJyksIFtwYXJzZWRQbHVnaW5dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zmlyc3Q6IGZpcnN0Q2hpbGRFbmFibGVtZW50KGZpcnN0U2Vzc2lvbi5jdXN0b21pemF0aW9ucyksXG5cdFx0XHRzZWNvbmQ6IGZpcnN0Q2hpbGRFbmFibGVtZW50KHNlY29uZFNlc3Npb24uY3VzdG9taXphdGlvbnMpLFxuXHRcdFx0Zmlyc3RTZGtDaGlsZHJlbjogc2RrQ2hpbGROYW1lcyhmaXJzdFNlc3Npb24uY3VzdG9taXphdGlvbnMpLFxuXHRcdFx0c2Vjb25kU2RrQ2hpbGRyZW46IHNka0NoaWxkTmFtZXMoc2Vjb25kU2Vzc2lvbi5jdXN0b21pemF0aW9ucyksXG5cdFx0fSwge1xuXHRcdFx0Zmlyc3Q6IHdvcmtzcGFjZUVuYWJsZW1lbnQsXG5cdFx0XHRzZWNvbmQ6IHdvcmtzcGFjZUVuYWJsZW1lbnQsXG5cdFx0XHRmaXJzdFNka0NoaWxkcmVuOiBbXSxcblx0XHRcdHNlY29uZFNka0NoaWxkcmVuOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHVibGlzaGVzIGEgZ2xvYmFsIGRlY2lzaW9uIGZvciBhIG1hdGVyaWFsaXplZCBwbHVnaW4gTUNQIGNoaWxkIGluIGEgbmV3bHkgY3JlYXRlZCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVuYWJsZW1lbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcGx1Z2luVXJpID0gJ2ZpbGU6Ly8vcGx1Z2lucy9henVyZS1za2lsbHMnO1xuXHRcdGNvbnN0IGdsb2JhbEVuYWJsZW1lbnQgPSBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiBmYWxzZSB9XSBhcyBjb25zdDtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnRGb3JEdXJhYmxlS2V5KGAke3BsdWdpblVyaX0jbWNwPWF6dXJlYCwgZ2xvYmFsRW5hYmxlbWVudCk7XG5cdFx0Y29uc3QgcGFyc2VkUGx1Z2luOiBQbHVnaW5DdXN0b21pemF0aW9uID0ge1xuXHRcdFx0Li4ucGx1Z2luKFt7IC4uLnNlcnZlcigpLCBuYW1lOiAnYXp1cmUnIH1dKSxcblx0XHRcdHVyaTogcGx1Z2luVXJpLFxuXHRcdH07XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IHJlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudChzZXJ2aWNlLCBVUkkucGFyc2UoJ2FocDovL2NvcGlsb3QvbmV3LXNlc3Npb24nKSwgW3BhcnNlZFBsdWdpbl0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJzdENoaWxkRW5hYmxlbWVudChyZXNvbHZlZC5jdXN0b21pemF0aW9ucyksIGdsb2JhbEVuYWJsZW1lbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBhIHBsdWdpbiBNQ1Agc2VydmVyIHRvIHRoZSBzYW1lIGR1cmFibGUgaWRlbnRpdHkgd2hpbGUgbmVzdGVkIG9yIHRvcC1sZXZlbCcsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFbmFibGVtZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IHBsdWdpblVyaSA9ICdmaWxlOi8vL3BsdWdpbnMvYXp1cmUtc2tpbGxzJztcblx0XHRjb25zdCBlbmFibGVtZW50ID0gW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0gYXMgY29uc3Q7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50Rm9yRHVyYWJsZUtleShgJHtwbHVnaW5Vcml9I21jcD1henVyZWAsIGVuYWJsZW1lbnQpO1xuXHRcdGNvbnN0IG5lc3RlZCA9IHBsdWdpbihbeyAuLi5zZXJ2ZXIoKSwgbmFtZTogJ2F6dXJlJyB9XSk7XG5cdFx0Y29uc3QgdG9wTGV2ZWw6IE1jcFNlcnZlckN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHQuLi5zZXJ2ZXIoKSxcblx0XHRcdGlkOiAnbWNwLXRvcC1sZXZlbDpjb3BpbG90Om5ldy1zZXNzaW9uOmF6dXJlJyxcblx0XHRcdHVyaTogJ21jcC10b3AtbGV2ZWw6Y29waWxvdDpuZXctc2Vzc2lvbjphenVyZScsXG5cdFx0XHRuYW1lOiAnYXp1cmUnLFxuXHRcdH07XG5cblx0XHRjb25zdCBuZXN0ZWRSZXNvbHZlZCA9IHJlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudChzZXJ2aWNlLCBVUkkucGFyc2UoJ2FocDovL2NvcGlsb3QvbmV3LXNlc3Npb24nKSwgW3sgLi4ubmVzdGVkLCB1cmk6IHBsdWdpblVyaSB9XSk7XG5cdFx0Y29uc3QgdG9wTGV2ZWxSZXNvbHZlZCA9IHJlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudChcblx0XHRcdHNlcnZpY2UsXG5cdFx0XHRVUkkucGFyc2UoJ2FocDovL2NvcGlsb3QvbmV3LXNlc3Npb24nKSxcblx0XHRcdFt0b3BMZXZlbF0sXG5cdFx0XHRuZXcgTWFwKFtbcGx1Z2luVXJpLCB7IGF6dXJlOiBbXSB9XV0pLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bmV3IE1hcChbWydhenVyZScsIHBsdWdpblVyaV1dKSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRuZXN0ZWQ6IGZpcnN0Q2hpbGRFbmFibGVtZW50KG5lc3RlZFJlc29sdmVkLmN1c3RvbWl6YXRpb25zKSxcblx0XHRcdHRvcExldmVsOiAodG9wTGV2ZWxSZXNvbHZlZC5jdXN0b21pemF0aW9uc1swXSBhcyBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uKS5lbmFibGVtZW50LFxuXHRcdFx0dG9wTGV2ZWxJc0NsaWVudEJ1bmRsZWQ6IHNlcnZpY2UubGFzdFJlc29sdmVkVGFyZ2V0Py5pc0NsaWVudEJ1bmRsZWQsXG5cdFx0fSwge1xuXHRcdFx0bmVzdGVkOiBlbmFibGVtZW50LFxuXHRcdFx0dG9wTGV2ZWw6IGVuYWJsZW1lbnQsXG5cdFx0XHR0b3BMZXZlbElzQ2xpZW50QnVuZGxlZDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0YWlucyBhIHBsdWdpbiBjaGlsZCBnbG9iYWwgZGVjaXNpb24gd2hlbiBpdHMgY2xpZW50IHJlcHVibGlzaCBoYXMgbm8gb3BpbmlvbicsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFbmFibGVtZW50U2VydmljZSgpO1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudEZvcignc2VydmVyLWlkJywgW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0pO1xuXHRcdGNvbnN0IHBhcnNlZFBsdWdpbiA9IHBsdWdpbihbc2VydmVyKCldKTtcblx0XHRjb25zdCBjbGllbnRDaGlsZEVuYWJsZW1lbnQgPSBuZXcgTWFwPHN0cmluZywgUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgcmVhZG9ubHkgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRbXT4+PihbW3BhcnNlZFBsdWdpbi51cmksIHtcblx0XHRcdHNlcnZlcjogW10sXG5cdFx0fV1dKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZUN1c3RvbWl6YXRpb25FbmFibGVtZW50KFxuXHRcdFx0c2VydmljZSxcblx0XHRcdFVSSS5wYXJzZSgnYWhwOi8vY29waWxvdC9zZXNzaW9uLTEnKSxcblx0XHRcdFtwYXJzZWRQbHVnaW5dLFxuXHRcdFx0Y2xpZW50Q2hpbGRFbmFibGVtZW50LFxuXHRcdFx0bmV3IE1hcChbW3BhcnNlZFBsdWdpbi51cmksIHsgLi4ucGFyc2VkUGx1Z2luLCBlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiB0cnVlIH1dIH1dXSksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc29sdmVkQ2hpbGQgPSAocmVzb2x2ZWQuY3VzdG9taXphdGlvbnNbMF0gYXMgUGx1Z2luQ3VzdG9taXphdGlvbikuY2hpbGRyZW4/LlswXSBhcyBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZW5hYmxlbWVudDogcmVzb2x2ZWRDaGlsZC5lbmFibGVtZW50LFxuXHRcdFx0aXNDbGllbnRCdW5kbGVkOiBzZXJ2aWNlLmxhc3RSZXNvbHZlZFRhcmdldD8uaXNDbGllbnRCdW5kbGVkLFxuXHRcdFx0cHVibGlzaGVzQ2xpZW50QnVuZGxlZDogT2JqZWN0Lmhhc093bihyZXNvbHZlZENoaWxkLCAnaXNDbGllbnRCdW5kbGVkJyksXG5cdFx0fSwge1xuXHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0sXG5cdFx0XHRpc0NsaWVudEJ1bmRsZWQ6IHRydWUsXG5cdFx0XHRwdWJsaXNoZXNDbGllbnRCdW5kbGVkOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWFza3MgYSBjaGlsZCB3aGVuIGl0cyBwbHVnaW4gaXMgZGlzYWJsZWQgd2l0aG91dCBlcmFzaW5nIHRoZSBjaGlsZCBkZWNpc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFbmFibGVtZW50U2VydmljZSgpO1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudEZvcigncGx1Z2luLWlkJywgW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0pO1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudEZvcignc2VydmVyLWlkJywgW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IHRydWUgfV0pO1xuXHRcdGNvbnN0IHBhcnNlZFBsdWdpbiA9IHBsdWdpbihbc2VydmVyKCldKTtcblxuXHRcdGNvbnN0IGRpc2FibGVkID0gcmVzb2x2ZUN1c3RvbWl6YXRpb25FbmFibGVtZW50KHNlcnZpY2UsIFVSSS5wYXJzZSgnYWhwOi8vY29waWxvdC9zZXNzaW9uLTEnKSwgW3BhcnNlZFBsdWdpbl0pO1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudEZvcigncGx1Z2luLWlkJywgW10pO1xuXHRcdGNvbnN0IHJlZW5hYmxlZCA9IHJlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudChzZXJ2aWNlLCBVUkkucGFyc2UoJ2FocDovL2NvcGlsb3Qvc2Vzc2lvbi0xJyksIFtwYXJzZWRQbHVnaW5dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzYWJsZWRTZGtDaGlsZHJlbjogc2RrQ2hpbGROYW1lcyhkaXNhYmxlZC5jdXN0b21pemF0aW9ucyksXG5cdFx0XHRyZWVuYWJsZWRTZGtDaGlsZHJlbjogc2RrQ2hpbGROYW1lcyhyZWVuYWJsZWQuY3VzdG9taXphdGlvbnMpLFxuXHRcdFx0Y2hpbGRFbmFibGVtZW50QWZ0ZXJSZWVuYWJsZTogZmlyc3RDaGlsZEVuYWJsZW1lbnQocmVlbmFibGVkLmN1c3RvbWl6YXRpb25zKSxcblx0XHR9LCB7XG5cdFx0XHRkaXNhYmxlZFNka0NoaWxkcmVuOiBbXSxcblx0XHRcdHJlZW5hYmxlZFNka0NoaWxkcmVuOiBbJ3NlcnZlciddLFxuXHRcdFx0Y2hpbGRFbmFibGVtZW50QWZ0ZXJSZWVuYWJsZTogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IHRydWUgfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGRpc2FibGVkIHBsdWdpbiBhZ2VudHMgb3V0IG9mIHRoZSBTREsgaGFuZG9mZicsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFbmFibGVtZW50U2VydmljZSgpO1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudEZvcigncGx1Z2luLWlkJywgW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0pO1xuXHRcdGNvbnN0IHBhcnNlZFBsdWdpbiA9IHBsdWdpbihbYWdlbnQoKV0pO1xuXG5cdFx0Y29uc3QgZGlzYWJsZWQgPSByZXNvbHZlQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQoc2VydmljZSwgVVJJLnBhcnNlKCdhaHA6Ly9jb3BpbG90L3Nlc3Npb24tMScpLCBbcGFyc2VkUGx1Z2luXSk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50Rm9yKCdwbHVnaW4taWQnLCBbXSk7XG5cdFx0Y29uc3QgcmVlbmFibGVkID0gcmVzb2x2ZUN1c3RvbWl6YXRpb25FbmFibGVtZW50KHNlcnZpY2UsIFVSSS5wYXJzZSgnYWhwOi8vY29waWxvdC9zZXNzaW9uLTEnKSwgW3BhcnNlZFBsdWdpbl0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNhYmxlZFNka0FnZW50czogc2RrQWdlbnROYW1lcyhkaXNhYmxlZC5jdXN0b21pemF0aW9ucyksXG5cdFx0XHRyZWVuYWJsZWRTZGtBZ2VudHM6IHNka0FnZW50TmFtZXMocmVlbmFibGVkLmN1c3RvbWl6YXRpb25zKSxcblx0XHR9LCB7XG5cdFx0XHRkaXNhYmxlZFNka0FnZW50czogW10sXG5cdFx0XHRyZWVuYWJsZWRTZGtBZ2VudHM6IFsnYWdlbnQnXSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsd0JBQXdCLG1DQUFtQztBQUNwRSxTQUFTLDZCQUE2QixtQkFBbUIsdUJBQWtOO0FBRTNRLFNBQVMsMkJBQTJCLDRCQUE0Qiw4QkFBOEIsc0NBQXNDO0FBRXBJLE1BQU0sc0JBQTBFO0FBQUEsRUFBaEY7QUFFQyxTQUFTLGNBQWMsTUFBTTtBQUM3QixTQUFpQixjQUFjLG9CQUFJLElBQWdEO0FBQ25GLFNBQWlCLDBCQUEwQixvQkFBSSxJQUFnRDtBQUFBO0FBQUEsRUFJL0YsaUJBQWlCLElBQVksWUFBc0Q7QUFDbEYsU0FBSyxZ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
