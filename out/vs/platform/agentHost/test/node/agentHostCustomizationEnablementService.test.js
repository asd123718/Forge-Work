import assert from "assert";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentSession } from "../../common/agentService.js";
import { isCustomizationEnabled } from "../../common/customizationEnablement.js";
import { SessionStatus, withSessionWorkspaceless } from "../../common/state/sessionState.js";
import { ActionType } from "../../common/state/protocol/common/actions.js";
import { CustomizationEnablementKind, CustomizationType } from "../../common/state/protocol/channels-session/state.js";
import { AgentHostCustomizationEnablementService, getCustomizationEnablementKey } from "../../node/agentHostCustomizationEnablementService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentHostStorageService } from "../../node/agentHostStorageService.js";
import { TestSessionDatabase } from "../common/sessionTestHelpers.js";
class EnablementSessionDatabase extends TestSessionDatabase {
  getMetadata(key) {
    return this.metadataLoad ?? super.getMetadata(key);
  }
}
class TestSessionDataService {
  constructor() {
    this._databases = /* @__PURE__ */ new Map();
    this.onWillDeleteSessionData = Event.None;
  }
  set metadataLoad(value) {
    this._metadataLoad = value;
    for (const database of this._databases.values()) {
      database.metadataLoad = value;
    }
  }
  getSessionDataDir(session) {
    return URI.joinPath(URI.from({ scheme: "inmemory", path: "/session-data" }), session.path);
  }
  getSessionDataDirById(sessionId) {
    return URI.from({ scheme: "inmemory", path: `/session-data/${sessionId}` });
  }
  openDatabase(session) {
    return {
      object: this._database(session),
      dispose: () => {
      }
    };
  }
  async tryOpenDatabase(session) {
    return this.openDatabase(session);
  }
  async deleteSessionData() {
  }
  async cleanupOrphanedData() {
  }
  async whenIdle() {
  }
  async getMetadata(session, key) {
    return this._database(URI.parse(session)).getMetadata(key);
  }
  _database(session) {
    const key = session.toString();
    let database = this._databases.get(key);
    if (database === void 0) {
      database = new EnablementSessionDatabase();
      database.metadataLoad = this._metadataLoad;
      this._databases.set(key, database);
    }
    return database;
  }
}
function makeSummary(resource, workingDirectories, meta) {
  return {
    resource,
    provider: "copilot",
    title: "Session",
    status: SessionStatus.Idle,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
    project: { uri: "file:///repo", displayName: "repo" },
    workingDirectories,
    _meta: meta
  };
}
function serializableResolution(resolution) {
  if (resolution.kind === "pending" || resolution.workingDirectory.kind !== "directory") {
    return resolution;
  }
  return {
    ...resolution,
    workingDirectory: {
      kind: resolution.workingDirectory.kind,
      uri: resolution.workingDirectory.uri.toString()
    }
  };
}
class TestWorktreeIsolation {
  constructor() {
    this.pending = /* @__PURE__ */ new Set();
    this._onDidChangeWorkingDirectoryPending = new Emitter();
    this.onDidChangeWorkingDirectoryPending = this._onDidChangeWorkingDirectoryPending.event;
  }
  isWorkingDirectoryPending(session) {
    return this.pending.has(session);
  }
  firePendingChange(sessionId) {
    this._onDidChangeWorkingDirectoryPending.fire(sessionId);
  }
}
suite("AgentHostCustomizationEnablementService", () => {
  const disposables = new DisposableStore();
  const session = "ahp://copilot/session-1";
  const workspace = URI.file("/repo");
  let storage;
  let sessionData;
  let worktree;
  let state;
  let service;
  const plugin = {
    id: "plugin-materialized-hash-one",
    type: CustomizationType.Plugin,
    name: "Plugin",
    source: URI.file("/plugins/example")
  };
  setup(async () => {
    storage = disposables.add(new AgentHostStorageService(void 0, new NullLogService()));
    sessionData = new TestSessionDataService();
    state = disposables.add(new AgentHostStateManager(new NullLogService()));
    state.createSession(makeSummary(session, [workspace.toString()]));
    worktree = new TestWorktreeIsolation();
    service = disposables.add(new AgentHostCustomizationEnablementService(storage, sessionData, state, new NullLogService()));
    service.setWorktreeIsolation(worktree);
    await service.initializeSession(session);
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("resolves session, workspace, global, and default decisions in precedence order", () => {
    service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, true);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Session, false);
    const resolved = service.resolve(session, plugin);
    assert.strictEqual(resolved.kind, "resolved");
    if (resolved.kind === "resolved") {
      assert.deepStrictEqual({
        enablement: resolved.enablement,
        enabled: resolved.enabled,
        derived: isCustomizationEnabled({ enablement: resolved.enablement })
      }, {
        enablement: [
          { kind: CustomizationEnablementKind.Session, enabled: false },
          { kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: true },
          { kind: CustomizationEnablementKind.Global, enabled: false }
        ],
        enabled: false,
        derived: false
      });
    }
  });
  test("resolves a workspace decision for a newly registered session", async () => {
    service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false);
    const newSession = "ahp://copilot/session-2";
    state.createSession(makeSummary(newSession, [workspace.toString()]));
    await service.initializeSession(newSession);
    const resolved = service.resolve(newSession, plugin);
    assert.deepStrictEqual(serializableResolution(resolved), {
      kind: "resolved",
      enabled: false,
      enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: false }],
      workingDirectory: { kind: "directory", uri: workspace.toString() }
    });
  });
  test("resolves a global decision for a newly registered plugin MCP child", async () => {
    const server = {
      id: "mcp-materialized-hash-one",
      type: CustomizationType.McpServer,
      name: "azure",
      source: URI.file("/agentPlugins/example/hash-one/.mcp.json"),
      owningPluginSource: plugin.source
    };
    service.setEnablement(session, server, CustomizationEnablementKind.Global, false);
    const newSession = "ahp://copilot/session-2";
    state.createSession(makeSummary(newSession, [workspace.toString()]));
    await service.initializeSession(newSession);
    assert.deepStrictEqual(serializableResolution(service.resolve(newSession, {
      ...server,
      id: "mcp-materialized-hash-two",
      source: URI.file("/agentPlugins/example/hash-two/.mcp.json")
    })), {
      kind: "resolved",
      enabled: false,
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
      workingDirectory: { kind: "directory", uri: workspace.toString() }
    });
  });
  test("resolves the complete global, workspace, and session matrix with sorted explicit decisions", () => {
    const values = [void 0, true, false];
    const cases = values.flatMap((global) => values.flatMap((workspaceDecision) => values.map((sessionDecision) => {
      service.setEnablement(session, plugin, CustomizationEnablementKind.Global, true);
      service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, true);
      service.setEnablement(session, plugin, CustomizationEnablementKind.Session, true);
      if (global !== void 0) {
        service.setEnablement(session, plugin, CustomizationEnablementKind.Global, global);
      }
      if (workspaceDecision !== void 0) {
        service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, workspaceDecision);
      }
      if (sessionDecision !== void 0) {
        service.setEnablement(session, plugin, CustomizationEnablementKind.Session, sessionDecision);
      }
      const globalEnabled = global ?? true;
      const hasWorkspaceDecision = workspaceDecision !== void 0 && workspaceDecision !== globalEnabled;
      const workspaceEnabled = hasWorkspaceDecision ? workspaceDecision : globalEnabled;
      const hasSessionDecision = sessionDecision !== void 0 && sessionDecision !== workspaceEnabled;
      const resolved = service.resolve(session, plugin);
      assert.strictEqual(resolved.kind, "resolved");
      return {
        input: { global, workspace: workspaceDecision, session: sessionDecision },
        resolution: resolved.kind === "resolved" ? {
          enabled: resolved.enabled,
          enablement: resolved.enablement
        } : resolved,
        expected: {
          enabled: hasSessionDecision ? sessionDecision : workspaceEnabled,
          enablement: [
            ...hasSessionDecision ? [{ kind: CustomizationEnablementKind.Session, enabled: sessionDecision }] : [],
            ...hasWorkspaceDecision ? [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: workspaceDecision }] : [],
            ...global === false ? [{ kind: CustomizationEnablementKind.Global, enabled: false }] : []
          ]
        }
      };
    })));
    assert.deepStrictEqual(cases.map(({ input, resolution }) => ({ input, resolution })), cases.map(({ input, expected }) => ({ input, resolution: expected })));
  });
  test("keeps host decisions above a client global base", () => {
    const clientPlugin = { ...plugin, isClientBundled: true };
    service.setEnablement(session, clientPlugin, CustomizationEnablementKind.Global, false);
    service.setEnablement(session, clientPlugin, CustomizationEnablementKind.Workspace, true);
    service.setEnablement(session, clientPlugin, CustomizationEnablementKind.Session, false);
    const resolution = service.applyClientGlobalEnablement(session, clientPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: true }]);
    assert.strictEqual(resolution.kind, "resolved");
    if (resolution.kind === "resolved") {
      assert.deepStrictEqual({
        enablement: resolution.enablement,
        enabled: resolution.enabled
      }, {
        enablement: [
          { kind: CustomizationEnablementKind.Session, enabled: false },
          { kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: true },
          { kind: CustomizationEnablementKind.Global, enabled: false }
        ],
        enabled: false
      });
    }
  });
  test("keeps a host global decision through a stale client republish", () => {
    const clientPlugin = { ...plugin, isClientBundled: true };
    service.replaceEnablement(session, clientPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
    const resolution = service.applyClientGlobalEnablement(session, clientPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: true }]);
    assert.deepStrictEqual({
      resolution: serializableResolution(resolution),
      persisted: storage.get("customizationEnablement")
    }, {
      resolution: {
        kind: "resolved",
        enabled: false,
        enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
        workingDirectory: { kind: "directory", uri: workspace.toString() }
      },
      persisted: {
        global: { "file:///plugins/example": false }
      }
    });
  });
  test("uses a client global base when the host has no decision", () => {
    const clientPlugin = { ...plugin, isClientBundled: true };
    const disabled = service.applyClientGlobalEnablement(session, clientPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
    const enabled = service.applyClientGlobalEnablement(session, clientPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: true }]);
    assert.deepStrictEqual({
      disabled: serializableResolution(disabled),
      enabled: serializableResolution(enabled),
      persisted: storage.get("customizationEnablement")
    }, {
      disabled: {
        kind: "resolved",
        enabled: false,
        enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
        workingDirectory: { kind: "directory", uri: workspace.toString() }
      },
      enabled: {
        kind: "resolved",
        enabled: true,
        enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
        workingDirectory: { kind: "directory", uri: workspace.toString() }
      },
      persisted: void 0
    });
  });
  test("retains and clears host decisions relative to the client base", () => {
    const clientPlugin = { ...plugin, isClientBundled: true };
    service.applyClientGlobalEnablement(session, clientPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
    service.setEnablement(session, clientPlugin, CustomizationEnablementKind.Global, true);
    const hostOverride = structuredClone(storage.get("customizationEnablement"));
    service.setEnablement(session, clientPlugin, CustomizationEnablementKind.Workspace, false);
    service.setEnablement(session, clientPlugin, CustomizationEnablementKind.Global, false);
    assert.deepStrictEqual({
      hostOverride,
      afterInheritingClientBase: {
        resolution: serializableResolution(service.resolve(session, clientPlugin)),
        persisted: storage.get("customizationEnablement")
      }
    }, {
      hostOverride: {
        global: { "file:///plugins/example": true }
      },
      afterInheritingClientBase: {
        resolution: {
          kind: "resolved",
          enabled: false,
          enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
          workingDirectory: { kind: "directory", uri: workspace.toString() }
        },
        persisted: void 0
      }
    });
  });
  test("retains host-owned MCP decisions when an unbundled client republish asserts enabled", async () => {
    const pluginSource = URI.parse("file:///Users/connor/.vscode-oss-dev-dev/agent-plugins/github.com/microsoft/azure-skills/.github/plugins/azure-skills");
    const azureSkillsPlugin = {
      id: "azure-skills-plugin",
      type: CustomizationType.Plugin,
      name: "azure-skills",
      source: pluginSource,
      isClientBundled: true
    };
    const azure = {
      id: "file:///Users/connor/.vscode-oss-dev/agentPlugins/file-azure-skills/19ff2ac36f2/.mcp.json#mcp=azure",
      type: CustomizationType.McpServer,
      name: "azure",
      source: URI.parse("file:///Users/connor/.vscode-oss-dev/agentPlugins/file-azure-skills/19ff2ac36f2/.mcp.json"),
      owningPluginSource: pluginSource,
      isClientBundled: false
    };
    service.setEnablement(session, azure, CustomizationEnablementKind.Global, false);
    service.applyClientGlobalEnablement(session, azureSkillsPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: true }]);
    const afterGlobalRepublish = service.resolve(session, azure);
    service.setEnablement(session, azure, CustomizationEnablementKind.Workspace, true);
    const afterWorkspaceRepublish = service.applyClientGlobalEnablement(session, azure, [{ kind: CustomizationEnablementKind.Global, enabled: true }]);
    const newSession = "ahp://copilot/session-azure";
    state.createSession(makeSummary(newSession, [workspace.toString()]));
    await service.initializeSession(newSession);
    assert.deepStrictEqual({
      afterGlobalRepublish: serializableResolution(afterGlobalRepublish),
      afterWorkspaceRepublish: serializableResolution(afterWorkspaceRepublish),
      newSession: serializableResolution(service.resolve(newSession, azure)),
      persisted: storage.get("customizationEnablement")
    }, {
      afterGlobalRepublish: {
        kind: "resolved",
        enabled: false,
        enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
        workingDirectory: { kind: "directory", uri: workspace.toString() }
      },
      afterWorkspaceRepublish: {
        kind: "resolved",
        enabled: true,
        enablement: [
          { kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: true },
          { kind: CustomizationEnablementKind.Global, enabled: false }
        ],
        workingDirectory: { kind: "directory", uri: workspace.toString() }
      },
      newSession: {
        kind: "resolved",
        enabled: true,
        enablement: [
          { kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: true },
          { kind: CustomizationEnablementKind.Global, enabled: false }
        ],
        workingDirectory: { kind: "directory", uri: workspace.toString() }
      },
      persisted: {
        global: {
          "file:///Users/connor/.vscode-oss-dev-dev/agent-plugins/github.com/microsoft/azure-skills/.github/plugins/azure-skills#mcp=azure": false
        },
        workingDirectories: {
          "file:///repo": {
            "file:///Users/connor/.vscode-oss-dev-dev/agent-plugins/github.com/microsoft/azure-skills/.github/plugins/azure-skills#mcp=azure": true
          }
        }
      }
    });
  });
  test("clears entries that match inherited decisions through set, change, clear, and re-set transitions", () => {
    service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, true);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Global, true);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);
    assert.deepStrictEqual(storage.get("customizationEnablement"), {
      global: {
        "file:///plugins/example": false
      }
    });
  });
  test("persists only scope decisions that differ from their inherited values", async () => {
    service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, true);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Session, true);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Session, false);
    await service.whenIdle();
    const withOverrides = {
      durable: structuredClone(storage.get("customizationEnablement")),
      session: await sessionData.getMetadata(session, "customizationEnablement")
    };
    service.setEnablement(session, plugin, CustomizationEnablementKind.Session, true);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Global, true);
    await service.whenIdle();
    assert.deepStrictEqual({
      withOverrides,
      afterClearingInheritedValues: {
        durable: storage.get("customizationEnablement"),
        session: await sessionData.getMetadata(session, "customizationEnablement")
      }
    }, {
      withOverrides: {
        durable: {
          global: { "file:///plugins/example": false },
          workingDirectories: {
            "file:///repo": { "file:///plugins/example": true }
          }
        },
        session: '{"plugin-materialized-hash-one":false}'
      },
      afterClearingInheritedValues: {
        durable: void 0,
        session: "{}"
      }
    });
  });
  test("prunes workspace entries that match an incoming global decision without erasing opposing directories", async () => {
    const matchingDirectory = URI.file("/matching");
    const opposingDirectory = URI.file("/opposing");
    const untouchedDirectory = URI.file("/untouched");
    const preloadedStorage = disposables.add(new AgentHostStorageService(void 0, new NullLogService()));
    preloadedStorage.set("customizationEnablement", {
      workingDirectories: {
        [matchingDirectory.toString()]: { "file:///plugins/example": false },
        [opposingDirectory.toString()]: { "file:///plugins/example": true }
      }
    });
    const pruningService = disposables.add(new AgentHostCustomizationEnablementService(preloadedStorage, sessionData, state, new NullLogService()));
    pruningService.setWorktreeIsolation(worktree);
    await pruningService.initializeSession(session);
    pruningService.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);
    const resolutions = [];
    for (const directory of [matchingDirectory, opposingDirectory, untouchedDirectory]) {
      const directorySession = `ahp://copilot${directory.path}`;
      state.createSession(makeSummary(directorySession, [directory.toString()]));
      await pruningService.initializeSession(directorySession);
      const resolution = pruningService.resolve(directorySession, plugin);
      assert.strictEqual(resolution.kind, "resolved");
      resolutions.push({
        directory: directory.toString(),
        resolution: resolution.kind === "resolved" ? {
          enabled: resolution.enabled,
          enablement: resolution.enablement
        } : resolution
      });
    }
    assert.deepStrictEqual({
      persisted: preloadedStorage.get("customizationEnablement"),
      resolutions
    }, {
      persisted: {
        global: { "file:///plugins/example": false },
        workingDirectories: {
          "file:///opposing": { "file:///plugins/example": true }
        }
      },
      resolutions: [
        {
          directory: "file:///matching",
          resolution: {
            enabled: false,
            enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
          }
        },
        {
          directory: "file:///opposing",
          resolution: {
            enabled: true,
            enablement: [
              { kind: CustomizationEnablementKind.Workspace, uri: "file:///opposing", enabled: true },
              { kind: CustomizationEnablementKind.Global, enabled: false }
            ]
          }
        },
        {
          directory: "file:///untouched",
          resolution: {
            enabled: false,
            enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
          }
        }
      ]
    });
  });
  test("replaces rather than patches decisions through set, replacement, clear, and re-set transitions", async () => {
    service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, true);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Session, false);
    await service.whenIdle();
    const globalOnly = service.replaceEnablement(session, plugin, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, true);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Session, false);
    const sessionOnly = service.replaceEnablement(session, plugin, [{ kind: CustomizationEnablementKind.Session, enabled: false }]);
    const empty = service.replaceEnablement(session, plugin, []);
    await service.whenIdle();
    assert.deepStrictEqual({
      globalOnly: serializableResolution(globalOnly),
      sessionOnly: serializableResolution(sessionOnly),
      empty: serializableResolution(empty),
      persisted: {
        durable: storage.get("customizationEnablement"),
        session: await sessionData.getMetadata(session, "customizationEnablement")
      }
    }, {
      globalOnly: {
        kind: "resolved",
        enabled: false,
        workingDirectory: { kind: "directory", uri: workspace.toString() },
        enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
      },
      sessionOnly: {
        kind: "resolved",
        enabled: false,
        workingDirectory: { kind: "directory", uri: workspace.toString() },
        enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }]
      },
      empty: {
        kind: "resolved",
        enabled: true,
        workingDirectory: { kind: "directory", uri: workspace.toString() },
        enablement: []
      },
      persisted: {
        durable: void 0,
        session: "{}"
      }
    });
  });
  test("derives exact durable and session keys without plugin-child collisions across materialized edits", () => {
    const pluginServer = {
      id: "mcp-materialized-hash-one",
      type: CustomizationType.McpServer,
      name: "slack",
      source: URI.file("/agentPlugins/example/hash-one/.mcp.json"),
      owningPluginSource: URI.file("/plugins/example")
    };
    const editedPluginServer = {
      ...pluginServer,
      id: "mcp-materialized-hash-two",
      source: URI.file("/agentPlugins/example/hash-two/.mcp.json")
    };
    const topLevelServer = {
      id: "session-mcp-id",
      type: CustomizationType.McpServer,
      name: "stdio",
      source: URI.file("/repo/.vscode/mcp.json")
    };
    assert.deepStrictEqual({
      plugin: getCustomizationEnablementKey(plugin, CustomizationEnablementKind.Global),
      pluginServer: getCustomizationEnablementKey(pluginServer, CustomizationEnablementKind.Workspace),
      topLevelServer: getCustomizationEnablementKey(topLevelServer, CustomizationEnablementKind.Global),
      sessionBeforeEdit: getCustomizationEnablementKey(pluginServer, CustomizationEnablementKind.Session),
      sessionAfterEdit: getCustomizationEnablementKey(editedPluginServer, CustomizationEnablementKind.Session),
      pluginAndChildAreDistinct: getCustomizationEnablementKey(plugin, CustomizationEnablementKind.Global) !== getCustomizationEnablementKey(pluginServer, CustomizationEnablementKind.Global)
    }, {
      plugin: "file:///plugins/example",
      pluginServer: "file:///plugins/example#mcp=slack",
      topLevelServer: "mcpServers#stdio",
      sessionBeforeEdit: "mcp-materialized-hash-one",
      sessionAfterEdit: "mcp-materialized-hash-two",
      pluginAndChildAreDistinct: true
    });
    service.setEnablement(session, pluginServer, CustomizationEnablementKind.Global, false);
    service.setEnablement(session, pluginServer, CustomizationEnablementKind.Workspace, true);
    service.setEnablement(session, pluginServer, CustomizationEnablementKind.Session, false);
    const editedResolution = service.resolve(session, editedPluginServer);
    assert.strictEqual(editedResolution.kind, "resolved");
    if (editedResolution.kind === "resolved") {
      assert.deepStrictEqual(editedResolution.enablement, [
        { kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: true },
        { kind: CustomizationEnablementKind.Global, enabled: false }
      ]);
    }
  });
  test("models working-directory states without treating pending as workspace-less", () => {
    state.deleteSession(session);
    assert.deepStrictEqual(service.getWorkingDirectoryState(session), { kind: "pending" });
    assert.deepStrictEqual(service.resolve(session, plugin), { kind: "pending", reason: "workingDirectory" });
    assert.deepStrictEqual(service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false), { kind: "pending", reason: "workingDirectory" });
    assert.deepStrictEqual(storage.get("customizationEnablement"), { global: { "file:///plugins/example": false } });
    state.createSession(makeSummary(session, void 0, withSessionWorkspaceless(void 0, true)));
    assert.deepStrictEqual(service.getWorkingDirectoryState(session), { kind: "workspaceless" });
    state.setSessionMeta(session, void 0);
    worktree.pending.add(AgentSession.id(session));
    assert.deepStrictEqual(service.getWorkingDirectoryState(session), { kind: "pending" });
    worktree.pending.delete(AgentSession.id(session));
    state.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: workspace.toString() });
    const directoryState = service.getWorkingDirectoryState(session);
    assert.deepStrictEqual(directoryState.kind === "directory" ? { kind: directoryState.kind, uri: directoryState.uri.toString() } : directoryState, { kind: "directory", uri: workspace.toString() });
  });
  test("queues a workspace replacement while the working directory is pending and applies it when registered", () => {
    state.deleteSession(session);
    const replacement = service.replaceEnablement(session, plugin, [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: false }]);
    state.createSession(makeSummary(session));
    state.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: workspace.toString() });
    assert.deepStrictEqual({
      replacement,
      resolution: serializableResolution(service.resolve(session, plugin))
    }, {
      replacement: { kind: "pending", reason: "workingDirectory" },
      resolution: {
        kind: "resolved",
        enabled: false,
        workingDirectory: { kind: "directory", uri: workspace.toString() },
        enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: false }]
      }
    });
  });
  test("queues a workspace write while the working directory is pending and applies it when registered", () => {
    state.deleteSession(session);
    const write = service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false);
    state.createSession(makeSummary(session));
    state.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: workspace.toString() });
    assert.deepStrictEqual({
      write,
      resolution: serializableResolution(service.resolve(session, plugin))
    }, {
      write: { kind: "pending", reason: "workingDirectory" },
      resolution: {
        kind: "resolved",
        enabled: false,
        workingDirectory: { kind: "directory", uri: workspace.toString() },
        enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: false }]
      }
    });
  });
  test("queues a replacement before loading the session cache and applies it after loading", async () => {
    let resolveLoad;
    sessionData.metadataLoad = new Promise((resolve) => {
      resolveLoad = resolve;
    });
    const loading = disposables.add(new AgentHostCustomizationEnablementService(storage, sessionData, state, new NullLogService()));
    loading.setWorktreeIsolation(worktree);
    const load = loading.initializeSession(session);
    const replacement = loading.replaceEnablement(session, plugin, [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: false }]);
    resolveLoad(void 0);
    await load;
    assert.deepStrictEqual({
      replacement,
      resolution: serializableResolution(loading.resolve(session, plugin))
    }, {
      replacement: { kind: "pending", reason: "session" },
      resolution: {
        kind: "resolved",
        enabled: false,
        workingDirectory: { kind: "directory", uri: workspace.toString() },
        enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: false }]
      }
    });
  });
  test("rejects workspace writes for workspace-less sessions", () => {
    state.deleteSession(session);
    state.createSession(makeSummary(session, void 0, withSessionWorkspaceless(void 0, true)));
    assert.throws(
      () => service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false),
      /Cannot record workspace enablement for a workspace-less session/
    );
  });
  test("announces when a session enablement cache transitions from pending to resolved", async () => {
    let resolveLoad;
    sessionData.metadataLoad = new Promise((resolve) => {
      resolveLoad = resolve;
    });
    const loading = disposables.add(new AgentHostCustomizationEnablementService(storage, sessionData, state, new NullLogService()));
    loading.setWorktreeIsolation(worktree);
    const changes = [];
    disposables.add(loading.onDidChange((event) => changes.push([...event.sessions])));
    const load = loading.initializeSession(session);
    assert.deepStrictEqual(loading.resolve(session, plugin), { kind: "pending", reason: "session" });
    resolveLoad(void 0);
    await load;
    await loading.initializeSession(session);
    assert.deepStrictEqual({
      changes,
      resolution: loading.resolve(session, plugin).kind
    }, {
      changes: [[session]],
      resolution: "resolved"
    });
  });
  test("announces working-directory and worktree-pending transitions", () => {
    state.deleteSession(session);
    const changes = [];
    disposables.add(service.onDidChange((event) => changes.push([...event.sessions])));
    assert.deepStrictEqual(service.resolve(session, plugin), { kind: "pending", reason: "workingDirectory" });
    state.createSession(makeSummary(session));
    state.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: workspace.toString() });
    assert.strictEqual(service.resolve(session, plugin).kind, "resolved");
    worktree.pending.add(AgentSession.id(session));
    assert.deepStrictEqual(service.resolve(session, plugin), { kind: "pending", reason: "workingDirectory" });
    worktree.pending.delete(AgentSession.id(session));
    worktree.firePendingChange(AgentSession.id(session));
    assert.deepStrictEqual({
      changes,
      resolution: service.resolve(session, plugin).kind
    }, {
      changes: [[session], [session]],
      resolution: "resolved"
    });
  });
  test("rebuilds the authoritative synchronous session cache after reopening", async () => {
    service.setEnablement(session, plugin, CustomizationEnablementKind.Session, false);
    await service.whenIdle();
    const reopened = disposables.add(new AgentHostCustomizationEnablementService(storage, sessionData, state, new NullLogService()));
    reopened.setWorktreeIsolation(worktree);
    await reopened.initializeSession(session);
    const resolved = reopened.resolve(session, plugin);
    assert.strictEqual(resolved.kind, "resolved");
    if (resolved.kind === "resolved") {
      assert.deepStrictEqual(resolved.enablement, [{ kind: CustomizationEnablementKind.Session, enabled: false }]);
    }
  });
  test("isolates persisted session decisions between sessions for the same customization", async () => {
    const otherSession = "ahp://copilot/session-2";
    state.createSession(makeSummary(otherSession, [workspace.toString()]));
    await service.initializeSession(otherSession);
    service.setEnablement(session, plugin, CustomizationEnablementKind.Session, false);
    await service.whenIdle();
    const reopened = disposables.add(new AgentHostCustomizationEnablementService(storage, sessionData, state, new NullLogService()));
    reopened.setWorktreeIsolation(worktree);
    await Promise.all([reopened.initializeSession(session), reopened.initializeSession(otherSession)]);
    assert.deepStrictEqual({
      first: serializableResolution(reopened.resolve(session, plugin)),
      second: serializableResolution(reopened.resolve(otherSession, plugin)),
      persisted: {
        first: await sessionData.getMetadata(session, "customizationEnablement"),
        second: await sessionData.getMetadata(otherSession, "customizationEnablement")
      }
    }, {
      first: {
        kind: "resolved",
        enabled: false,
        workingDirectory: { kind: "directory", uri: workspace.toString() },
        enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }]
      },
      second: {
        kind: "resolved",
        enabled: true,
        workingDirectory: { kind: "directory", uri: workspace.toString() },
        enablement: []
      },
      persisted: {
        first: '{"plugin-materialized-hash-one":false}',
        second: void 0
      }
    });
  });
  test("emits once for a decision write and does not emit on a no-op session re-initialization", async () => {
    const changes = [];
    disposables.add(service.onDidChange((event) => changes.push([...event.sessions])));
    service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);
    await service.initializeSession(session);
    assert.deepStrictEqual(changes, [[session]]);
  });
  test("evicts across global and workspace entries, updating recency only on writes", () => {
    for (let i = 0; i <= 510; i++) {
      service.setEnablement(session, {
        id: `plugin-${i}`,
        type: CustomizationType.Plugin,
        name: `Plugin ${i}`,
        source: URI.file(`/plugins/${i}`)
      }, CustomizationEnablementKind.Global, false);
    }
    const workspaceTarget = {
      id: "workspace-plugin",
      type: CustomizationType.Plugin,
      name: "Workspace Plugin",
      source: URI.file("/plugins/workspace")
    };
    service.setEnablement(session, workspaceTarget, CustomizationEnablementKind.Workspace, false);
    service.resolve(session, {
      id: "plugin-0",
      type: CustomizationType.Plugin,
      name: "Plugin 0",
      source: URI.file("/plugins/0")
    });
    service.setEnablement(session, {
      id: "plugin-511",
      type: CustomizationType.Plugin,
      name: "Plugin 511",
      source: URI.file("/plugins/511")
    }, CustomizationEnablementKind.Global, false);
    service.setEnablement(session, workspaceTarget, CustomizationEnablementKind.Workspace, false);
    service.setEnablement(session, {
      id: "plugin-512",
      type: CustomizationType.Plugin,
      name: "Plugin 512",
      source: URI.file("/plugins/512")
    }, CustomizationEnablementKind.Global, false);
    const persisted = storage.get("customizationEnablement");
    assert.deepStrictEqual({
      count: Object.keys(persisted.global).length + Object.values(persisted.workingDirectories).reduce((total, decisions) => total + Object.keys(decisions).length, 0),
      readDoesNotRefresh: persisted.global["file:///plugins/0"],
      workspaceRewriteRefreshes: persisted.workingDirectories["file:///repo"]?.["file:///plugins/workspace"],
      oldestAfterRewrite: persisted.global["file:///plugins/1"],
      newest: persisted.global["file:///plugins/512"]
    }, {
      count: 512,
      readDoesNotRefresh: void 0,
      workspaceRewriteRefreshes: false,
      oldestAfterRewrite: void 0,
      newest: false
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0eXBlIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQgfSBmcm9tICcuLi8uLi9jb21tb24vY3VzdG9taXphdGlvbkVuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblN0YXR1cywgd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzLCB0eXBlIFNlc3Npb25TdW1tYXJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFTZXJ2aWNlLCB0eXBlIElTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLCBDdXN0b21pemF0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1zZXNzaW9uL3N0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSwgZ2V0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRLZXksIHR5cGUgSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0IH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0b3JhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvblRlc3RIZWxwZXJzLmpzJztcblxuY2xhc3MgRW5hYmxlbWVudFNlc3Npb25EYXRhYmFzZSBleHRlbmRzIFRlc3RTZXNzaW9uRGF0YWJhc2Uge1xuXHRtZXRhZGF0YUxvYWQ6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcblxuXHRvdmVycmlkZSBnZXRNZXRhZGF0YShrZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMubWV0YWRhdGFMb2FkID8/IHN1cGVyLmdldE1ldGFkYXRhKGtleSk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdFNlc3Npb25EYXRhU2VydmljZSBpbXBsZW1lbnRzIElTZXNzaW9uRGF0YVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGF0YWJhc2VzID0gbmV3IE1hcDxzdHJpbmcsIEVuYWJsZW1lbnRTZXNzaW9uRGF0YWJhc2U+KCk7XG5cdHByaXZhdGUgX21ldGFkYXRhTG9hZDogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvbldpbGxEZWxldGVTZXNzaW9uRGF0YSA9IEV2ZW50Lk5vbmU7XG5cblx0c2V0IG1ldGFkYXRhTG9hZCh2YWx1ZTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fbWV0YWRhdGFMb2FkID0gdmFsdWU7XG5cdFx0Zm9yIChjb25zdCBkYXRhYmFzZSBvZiB0aGlzLl9kYXRhYmFzZXMudmFsdWVzKCkpIHtcblx0XHRcdGRhdGFiYXNlLm1ldGFkYXRhTG9hZCA9IHZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdGdldFNlc3Npb25EYXRhRGlyKHNlc3Npb246IFVSSSk6IFVSSSB7XG5cdFx0cmV0dXJuIFVSSS5qb2luUGF0aChVUkkuZnJvbSh7IHNjaGVtZTogJ2lubWVtb3J5JywgcGF0aDogJy9zZXNzaW9uLWRhdGEnIH0pLCBzZXNzaW9uLnBhdGgpO1xuXHR9XG5cblx0Z2V0U2Vzc2lvbkRhdGFEaXJCeUlkKHNlc3Npb25JZDogc3RyaW5nKTogVVJJIHtcblx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6ICdpbm1lbW9yeScsIHBhdGg6IGAvc2Vzc2lvbi1kYXRhLyR7c2Vzc2lvbklkfWAgfSk7XG5cdH1cblxuXHRvcGVuRGF0YWJhc2Uoc2Vzc2lvbjogVVJJKTogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9iamVjdDogdGhpcy5fZGF0YWJhc2Uoc2Vzc2lvbiksXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHRyeU9wZW5EYXRhYmFzZShzZXNzaW9uOiBVUkkpOiBQcm9taXNlPElSZWZlcmVuY2U8SVNlc3Npb25EYXRhYmFzZT4gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5vcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdH1cblxuXHRhc3luYyBkZWxldGVTZXNzaW9uRGF0YSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdGFzeW5jIGNsZWFudXBPcnBoYW5lZERhdGEoKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRhc3luYyB3aGVuSWRsZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdGFzeW5jIGdldE1ldGFkYXRhKHNlc3Npb246IHN0cmluZywga2V5OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9kYXRhYmFzZShVUkkucGFyc2Uoc2Vzc2lvbikpLmdldE1ldGFkYXRhKGtleSk7XG5cdH1cblxuXHRwcml2YXRlIF9kYXRhYmFzZShzZXNzaW9uOiBVUkkpOiBFbmFibGVtZW50U2Vzc2lvbkRhdGFiYXNlIHtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0bGV0IGRhdGFiYXNlID0gdGhpcy5fZGF0YWJhc2VzLmdldChrZXkpO1xuXHRcdGlmIChkYXRhYmFzZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRkYXRhYmFzZSA9IG5ldyBFbmFibGVtZW50U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRkYXRhYmFzZS5tZXRhZGF0YUxvYWQgPSB0aGlzLl9tZXRhZGF0YUxvYWQ7XG5cdFx0XHR0aGlzLl9kYXRhYmFzZXMuc2V0KGtleSwgZGF0YWJhc2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGF0YWJhc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gbWFrZVN1bW1hcnkocmVzb3VyY2U6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yaWVzPzogc3RyaW5nW10sIG1ldGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFNlc3Npb25TdW1tYXJ5IHtcblx0cmV0dXJuIHtcblx0XHRyZXNvdXJjZSxcblx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdHRpdGxlOiAnU2Vzc2lvbicsXG5cdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdHByb2plY3Q6IHsgdXJpOiAnZmlsZTovLy9yZXBvJywgZGlzcGxheU5hbWU6ICdyZXBvJyB9LFxuXHRcdHdvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHRfbWV0YTogbWV0YSxcblx0fTtcbn1cblxuZnVuY3Rpb24gc2VyaWFsaXphYmxlUmVzb2x1dGlvbihyZXNvbHV0aW9uOiBSZXR1cm5UeXBlPEFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZVsncmVzb2x2ZSddPikge1xuXHRpZiAocmVzb2x1dGlvbi5raW5kID09PSAncGVuZGluZycgfHwgcmVzb2x1dGlvbi53b3JraW5nRGlyZWN0b3J5LmtpbmQgIT09ICdkaXJlY3RvcnknKSB7XG5cdFx0cmV0dXJuIHJlc29sdXRpb247XG5cdH1cblx0cmV0dXJuIHtcblx0XHQuLi5yZXNvbHV0aW9uLFxuXHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHtcblx0XHRcdGtpbmQ6IHJlc29sdXRpb24ud29ya2luZ0RpcmVjdG9yeS5raW5kLFxuXHRcdFx0dXJpOiByZXNvbHV0aW9uLndvcmtpbmdEaXJlY3RvcnkudXJpLnRvU3RyaW5nKCksXG5cdFx0fSxcblx0fTtcbn1cblxuY2xhc3MgVGVzdFdvcmt0cmVlSXNvbGF0aW9uIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHBlbmRpbmcgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VXb3JraW5nRGlyZWN0b3J5UGVuZGluZyA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VXb3JraW5nRGlyZWN0b3J5UGVuZGluZzogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkQ2hhbmdlV29ya2luZ0RpcmVjdG9yeVBlbmRpbmcuZXZlbnQ7XG5cblx0aXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZyhzZXNzaW9uOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5wZW5kaW5nLmhhcyhzZXNzaW9uKTtcblx0fVxuXG5cdGZpcmVQZW5kaW5nQ2hhbmdlKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VXb3JraW5nRGlyZWN0b3J5UGVuZGluZy5maXJlKHNlc3Npb25JZCk7XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3Qgc2Vzc2lvbiA9ICdhaHA6Ly9jb3BpbG90L3Nlc3Npb24tMSc7XG5cdGNvbnN0IHdvcmtzcGFjZSA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRsZXQgc3RvcmFnZTogQWdlbnRIb3N0U3RvcmFnZVNlcnZpY2U7XG5cdGxldCBzZXNzaW9uRGF0YTogVGVzdFNlc3Npb25EYXRhU2VydmljZTtcblx0bGV0IHdvcmt0cmVlOiBUZXN0V29ya3RyZWVJc29sYXRpb247XG5cdGxldCBzdGF0ZTogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyO1xuXHRsZXQgc2VydmljZTogQWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlO1xuXG5cdGNvbnN0IHBsdWdpbjogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0ID0ge1xuXHRcdGlkOiAncGx1Z2luLW1hdGVyaWFsaXplZC1oYXNoLW9uZScsXG5cdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdG5hbWU6ICdQbHVnaW4nLFxuXHRcdHNvdXJjZTogVVJJLmZpbGUoJy9wbHVnaW5zL2V4YW1wbGUnKSxcblx0fTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0c3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RvcmFnZVNlcnZpY2UodW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHNlc3Npb25EYXRhID0gbmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKTtcblx0XHRzdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0c3RhdGUuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeShzZXNzaW9uLCBbd29ya3NwYWNlLnRvU3RyaW5nKCldKSk7XG5cdFx0d29ya3RyZWUgPSBuZXcgVGVzdFdvcmt0cmVlSXNvbGF0aW9uKCk7XG5cdFx0c2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlKHN0b3JhZ2UsIHNlc3Npb25EYXRhLCBzdGF0ZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRzZXJ2aWNlLnNldFdvcmt0cmVlSXNvbGF0aW9uKHdvcmt0cmVlKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemVTZXNzaW9uKHNlc3Npb24pO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVzb2x2ZXMgc2Vzc2lvbiwgd29ya3NwYWNlLCBnbG9iYWwsIGFuZCBkZWZhdWx0IGRlY2lzaW9ucyBpbiBwcmVjZWRlbmNlIG9yZGVyJywgKCkgPT4ge1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uLCBwbHVnaW4sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGZhbHNlKTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB0cnVlKTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgZmFsc2UpO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gc2VydmljZS5yZXNvbHZlKHNlc3Npb24sIHBsdWdpbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmtpbmQsICdyZXNvbHZlZCcpO1xuXHRcdGlmIChyZXNvbHZlZC5raW5kID09PSAncmVzb2x2ZWQnKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZW5hYmxlbWVudDogcmVzb2x2ZWQuZW5hYmxlbWVudCxcblx0XHRcdFx0ZW5hYmxlZDogcmVzb2x2ZWQuZW5hYmxlZCxcblx0XHRcdFx0ZGVyaXZlZDogaXNDdXN0b21pemF0aW9uRW5hYmxlZCh7IGVuYWJsZW1lbnQ6IHJlc29sdmVkLmVuYWJsZW1lbnQgfSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGVuYWJsZW1lbnQ6IFtcblx0XHRcdFx0XHR7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLCBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSwgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdGRlcml2ZWQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBhIHdvcmtzcGFjZSBkZWNpc2lvbiBmb3IgYSBuZXdseSByZWdpc3RlcmVkIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgZmFsc2UpO1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSAnYWhwOi8vY29waWxvdC9zZXNzaW9uLTInO1xuXHRcdHN0YXRlLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkobmV3U2Vzc2lvbiwgW3dvcmtzcGFjZS50b1N0cmluZygpXSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZVNlc3Npb24obmV3U2Vzc2lvbik7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IHNlcnZpY2UucmVzb2x2ZShuZXdTZXNzaW9uLCBwbHVnaW4pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJpYWxpemFibGVSZXNvbHV0aW9uKHJlc29sdmVkKSwge1xuXHRcdFx0a2luZDogJ3Jlc29sdmVkJyxcblx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSwgZW5hYmxlZDogZmFsc2UgfV0sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB7IGtpbmQ6ICdkaXJlY3RvcnknLCB1cmk6IHdvcmtzcGFjZS50b1N0cmluZygpIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIGEgZ2xvYmFsIGRlY2lzaW9uIGZvciBhIG5ld2x5IHJlZ2lzdGVyZWQgcGx1Z2luIE1DUCBjaGlsZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2ZXI6IElDdXN0b21pemF0aW9uRW5hYmxlbWVudFRhcmdldCA9IHtcblx0XHRcdGlkOiAnbWNwLW1hdGVyaWFsaXplZC1oYXNoLW9uZScsXG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRuYW1lOiAnYXp1cmUnLFxuXHRcdFx0c291cmNlOiBVUkkuZmlsZSgnL2FnZW50UGx1Z2lucy9leGFtcGxlL2hhc2gtb25lLy5tY3AuanNvbicpLFxuXHRcdFx0b3duaW5nUGx1Z2luU291cmNlOiBwbHVnaW4uc291cmNlLFxuXHRcdH07XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHNlcnZlciwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZmFsc2UpO1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSAnYWhwOi8vY29waWxvdC9zZXNzaW9uLTInO1xuXHRcdHN0YXRlLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkobmV3U2Vzc2lvbiwgW3dvcmtzcGFjZS50b1N0cmluZygpXSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZVNlc3Npb24obmV3U2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcmlhbGl6YWJsZVJlc29sdXRpb24oc2VydmljZS5yZXNvbHZlKG5ld1Nlc3Npb24sIHtcblx0XHRcdC4uLnNlcnZlcixcblx0XHRcdGlkOiAnbWNwLW1hdGVyaWFsaXplZC1oYXNoLXR3bycsXG5cdFx0XHRzb3VyY2U6IFVSSS5maWxlKCcvYWdlbnRQbHVnaW5zL2V4YW1wbGUvaGFzaC10d28vLm1jcC5qc29uJyksXG5cdFx0fSkpLCB7XG5cdFx0XHRraW5kOiAncmVzb2x2ZWQnLFxuXHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiBmYWxzZSB9XSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ2RpcmVjdG9yeScsIHVyaTogd29ya3NwYWNlLnRvU3RyaW5nKCkgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgdGhlIGNvbXBsZXRlIGdsb2JhbCwgd29ya3NwYWNlLCBhbmQgc2Vzc2lvbiBtYXRyaXggd2l0aCBzb3J0ZWQgZXhwbGljaXQgZGVjaXNpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhbHVlczogQXJyYXk8Ym9vbGVhbiB8IHVuZGVmaW5lZD4gPSBbdW5kZWZpbmVkLCB0cnVlLCBmYWxzZV07XG5cdFx0Y29uc3QgY2FzZXMgPSB2YWx1ZXMuZmxhdE1hcChnbG9iYWwgPT4gdmFsdWVzLmZsYXRNYXAod29ya3NwYWNlRGVjaXNpb24gPT4gdmFsdWVzLm1hcChzZXNzaW9uRGVjaXNpb24gPT4ge1xuXHRcdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgdHJ1ZSk7XG5cdFx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB0cnVlKTtcblx0XHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uLCBwbHVnaW4sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLCB0cnVlKTtcblxuXHRcdFx0aWYgKGdsb2JhbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uLCBwbHVnaW4sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGdsb2JhbCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAod29ya3NwYWNlRGVjaXNpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB3b3Jrc3BhY2VEZWNpc2lvbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2Vzc2lvbkRlY2lzaW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIHNlc3Npb25EZWNpc2lvbik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGdsb2JhbEVuYWJsZWQgPSBnbG9iYWwgPz8gdHJ1ZTtcblx0XHRcdGNvbnN0IGhhc1dvcmtzcGFjZURlY2lzaW9uID0gd29ya3NwYWNlRGVjaXNpb24gIT09IHVuZGVmaW5lZCAmJiB3b3Jrc3BhY2VEZWNpc2lvbiAhPT0gZ2xvYmFsRW5hYmxlZDtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUVuYWJsZWQgPSBoYXNXb3Jrc3BhY2VEZWNpc2lvbiA/IHdvcmtzcGFjZURlY2lzaW9uISA6IGdsb2JhbEVuYWJsZWQ7XG5cdFx0XHRjb25zdCBoYXNTZXNzaW9uRGVjaXNpb24gPSBzZXNzaW9uRGVjaXNpb24gIT09IHVuZGVmaW5lZCAmJiBzZXNzaW9uRGVjaXNpb24gIT09IHdvcmtzcGFjZUVuYWJsZWQ7XG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IHNlcnZpY2UucmVzb2x2ZShzZXNzaW9uLCBwbHVnaW4pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmtpbmQsICdyZXNvbHZlZCcpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW5wdXQ6IHsgZ2xvYmFsLCB3b3Jrc3BhY2U6IHdvcmtzcGFjZURlY2lzaW9uLCBzZXNzaW9uOiBzZXNzaW9uRGVjaXNpb24gfSxcblx0XHRcdFx0cmVzb2x1dGlvbjogcmVzb2x2ZWQua2luZCA9PT0gJ3Jlc29sdmVkJyA/IHtcblx0XHRcdFx0XHRlbmFibGVkOiByZXNvbHZlZC5lbmFibGVkLFxuXHRcdFx0XHRcdGVuYWJsZW1lbnQ6IHJlc29sdmVkLmVuYWJsZW1lbnQsXG5cdFx0XHRcdH0gOiByZXNvbHZlZCxcblx0XHRcdFx0ZXhwZWN0ZWQ6IHtcblx0XHRcdFx0XHRlbmFibGVkOiBoYXNTZXNzaW9uRGVjaXNpb24gPyBzZXNzaW9uRGVjaXNpb24hIDogd29ya3NwYWNlRW5hYmxlZCxcblx0XHRcdFx0XHRlbmFibGVtZW50OiBbXG5cdFx0XHRcdFx0XHQuLi4oaGFzU2Vzc2lvbkRlY2lzaW9uID8gW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IHNlc3Npb25EZWNpc2lvbiEgfV0gOiBbXSksXG5cdFx0XHRcdFx0XHQuLi4oaGFzV29ya3NwYWNlRGVjaXNpb24gPyBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB1cmk6IHdvcmtzcGFjZS50b1N0cmluZygpLCBlbmFibGVkOiB3b3Jrc3BhY2VEZWNpc2lvbiEgfV0gOiBbXSksXG5cdFx0XHRcdFx0XHQuLi4oZ2xvYmFsID09PSBmYWxzZSA/IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dIDogW10pLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH0pKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhc2VzLm1hcCgoeyBpbnB1dCwgcmVzb2x1dGlvbiB9KSA9PiAoeyBpbnB1dCwgcmVzb2x1dGlvbiB9KSksIGNhc2VzLm1hcCgoeyBpbnB1dCwgZXhwZWN0ZWQgfSkgPT4gKHsgaW5wdXQsIHJlc29sdXRpb246IGV4cGVjdGVkIH0pKSk7XG5cdH0pO1xuXG5cblx0dGVzdCgna2VlcHMgaG9zdCBkZWNpc2lvbnMgYWJvdmUgYSBjbGllbnQgZ2xvYmFsIGJhc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2xpZW50UGx1Z2luID0geyAuLi5wbHVnaW4sIGlzQ2xpZW50QnVuZGxlZDogdHJ1ZSB9O1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uLCBjbGllbnRQbHVnaW4sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGZhbHNlKTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgY2xpZW50UGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB0cnVlKTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgY2xpZW50UGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgcmVzb2x1dGlvbiA9IHNlcnZpY2UuYXBwbHlDbGllbnRHbG9iYWxFbmFibGVtZW50KHNlc3Npb24sIGNsaWVudFBsdWdpbiwgW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogdHJ1ZSB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x1dGlvbi5raW5kLCAncmVzb2x2ZWQnKTtcblx0XHRpZiAocmVzb2x1dGlvbi5raW5kID09PSAncmVzb2x2ZWQnKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZW5hYmxlbWVudDogcmVzb2x1dGlvbi5lbmFibGVtZW50LFxuXHRcdFx0XHRlbmFibGVkOiByZXNvbHV0aW9uLmVuYWJsZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGVuYWJsZW1lbnQ6IFtcblx0XHRcdFx0XHR7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLCBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSwgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGEgaG9zdCBnbG9iYWwgZGVjaXNpb24gdGhyb3VnaCBhIHN0YWxlIGNsaWVudCByZXB1Ymxpc2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2xpZW50UGx1Z2luID0geyAuLi5wbHVnaW4sIGlzQ2xpZW50QnVuZGxlZDogdHJ1ZSB9O1xuXG5cdFx0c2VydmljZS5yZXBsYWNlRW5hYmxlbWVudChzZXNzaW9uLCBjbGllbnRQbHVnaW4sIFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dKTtcblx0XHRjb25zdCByZXNvbHV0aW9uID0gc2VydmljZS5hcHBseUNsaWVudEdsb2JhbEVuYWJsZW1lbnQoc2Vzc2lvbiwgY2xpZW50UGx1Z2luLCBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiB0cnVlIH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzb2x1dGlvbjogc2VyaWFsaXphYmxlUmVzb2x1dGlvbihyZXNvbHV0aW9uKSxcblx0XHRcdHBlcnNpc3RlZDogc3RvcmFnZS5nZXQoJ2N1c3RvbWl6YXRpb25FbmFibGVtZW50JyksXG5cdFx0fSwge1xuXHRcdFx0cmVzb2x1dGlvbjoge1xuXHRcdFx0XHRraW5kOiAncmVzb2x2ZWQnLFxuXHRcdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0sXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ2RpcmVjdG9yeScsIHVyaTogd29ya3NwYWNlLnRvU3RyaW5nKCkgfSxcblx0XHRcdH0sXG5cdFx0XHRwZXJzaXN0ZWQ6IHtcblx0XHRcdFx0Z2xvYmFsOiB7ICdmaWxlOi8vL3BsdWdpbnMvZXhhbXBsZSc6IGZhbHNlIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGEgY2xpZW50IGdsb2JhbCBiYXNlIHdoZW4gdGhlIGhvc3QgaGFzIG5vIGRlY2lzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNsaWVudFBsdWdpbiA9IHsgLi4ucGx1Z2luLCBpc0NsaWVudEJ1bmRsZWQ6IHRydWUgfTtcblx0XHRjb25zdCBkaXNhYmxlZCA9IHNlcnZpY2UuYXBwbHlDbGllbnRHbG9iYWxFbmFibGVtZW50KHNlc3Npb24sIGNsaWVudFBsdWdpbiwgW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0pO1xuXHRcdGNvbnN0IGVuYWJsZWQgPSBzZXJ2aWNlLmFwcGx5Q2xpZW50R2xvYmFsRW5hYmxlbWVudChzZXNzaW9uLCBjbGllbnRQbHVnaW4sIFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IHRydWUgfV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNhYmxlZDogc2VyaWFsaXphYmxlUmVzb2x1dGlvbihkaXNhYmxlZCksXG5cdFx0XHRlbmFibGVkOiBzZXJpYWxpemFibGVSZXNvbHV0aW9uKGVuYWJsZWQpLFxuXHRcdFx0cGVyc2lzdGVkOiBzdG9yYWdlLmdldCgnY3VzdG9taXphdGlvbkVuYWJsZW1lbnQnKSxcblx0XHR9LCB7XG5cdFx0XHRkaXNhYmxlZDoge1xuXHRcdFx0XHRraW5kOiAncmVzb2x2ZWQnLFxuXHRcdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0sXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ2RpcmVjdG9yeScsIHVyaTogd29ya3NwYWNlLnRvU3RyaW5nKCkgfSxcblx0XHRcdH0sXG5cdFx0XHRlbmFibGVkOiB7XG5cdFx0XHRcdGtpbmQ6ICdyZXNvbHZlZCcsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IHRydWUgfV0sXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ2RpcmVjdG9yeScsIHVyaTogd29ya3NwYWNlLnRvU3RyaW5nKCkgfSxcblx0XHRcdH0sXG5cdFx0XHRwZXJzaXN0ZWQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0YWlucyBhbmQgY2xlYXJzIGhvc3QgZGVjaXNpb25zIHJlbGF0aXZlIHRvIHRoZSBjbGllbnQgYmFzZScsICgpID0+IHtcblx0XHRjb25zdCBjbGllbnRQbHVnaW4gPSB7IC4uLnBsdWdpbiwgaXNDbGllbnRCdW5kbGVkOiB0cnVlIH07XG5cdFx0c2VydmljZS5hcHBseUNsaWVudEdsb2JhbEVuYWJsZW1lbnQoc2Vzc2lvbiwgY2xpZW50UGx1Z2luLCBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiBmYWxzZSB9XSk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIGNsaWVudFBsdWdpbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgdHJ1ZSk7XG5cdFx0Y29uc3QgaG9zdE92ZXJyaWRlID0gc3RydWN0dXJlZENsb25lKHN0b3JhZ2UuZ2V0KCdjdXN0b21pemF0aW9uRW5hYmxlbWVudCcpKTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgY2xpZW50UGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCBmYWxzZSk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIGNsaWVudFBsdWdpbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRob3N0T3ZlcnJpZGUsXG5cdFx0XHRhZnRlckluaGVyaXRpbmdDbGllbnRCYXNlOiB7XG5cdFx0XHRcdHJlc29sdXRpb246IHNlcmlhbGl6YWJsZVJlc29sdXRpb24oc2VydmljZS5yZXNvbHZlKHNlc3Npb24sIGNsaWVudFBsdWdpbikpLFxuXHRcdFx0XHRwZXJzaXN0ZWQ6IHN0b3JhZ2UuZ2V0KCdjdXN0b21pemF0aW9uRW5hYmxlbWVudCcpLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRob3N0T3ZlcnJpZGU6IHtcblx0XHRcdFx0Z2xvYmFsOiB7ICdmaWxlOi8vL3BsdWdpbnMvZXhhbXBsZSc6IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0XHRhZnRlckluaGVyaXRpbmdDbGllbnRCYXNlOiB7XG5cdFx0XHRcdHJlc29sdXRpb246IHtcblx0XHRcdFx0XHRraW5kOiAncmVzb2x2ZWQnLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ2RpcmVjdG9yeScsIHVyaTogd29ya3NwYWNlLnRvU3RyaW5nKCkgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVyc2lzdGVkOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRhaW5zIGhvc3Qtb3duZWQgTUNQIGRlY2lzaW9ucyB3aGVuIGFuIHVuYnVuZGxlZCBjbGllbnQgcmVwdWJsaXNoIGFzc2VydHMgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5Tb3VyY2UgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vVXNlcnMvY29ubm9yLy52c2NvZGUtb3NzLWRldi1kZXYvYWdlbnQtcGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC9henVyZS1za2lsbHMvLmdpdGh1Yi9wbHVnaW5zL2F6dXJlLXNraWxscycpO1xuXHRcdGNvbnN0IGF6dXJlU2tpbGxzUGx1Z2luOiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQgPSB7XG5cdFx0XHRpZDogJ2F6dXJlLXNraWxscy1wbHVnaW4nLFxuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0bmFtZTogJ2F6dXJlLXNraWxscycsXG5cdFx0XHRzb3VyY2U6IHBsdWdpblNvdXJjZSxcblx0XHRcdGlzQ2xpZW50QnVuZGxlZDogdHJ1ZSxcblx0XHR9O1xuXHRcdGNvbnN0IGF6dXJlOiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQgPSB7XG5cdFx0XHRpZDogJ2ZpbGU6Ly8vVXNlcnMvY29ubm9yLy52c2NvZGUtb3NzLWRldi9hZ2VudFBsdWdpbnMvZmlsZS1henVyZS1za2lsbHMvMTlmZjJhYzM2ZjIvLm1jcC5qc29uI21jcD1henVyZScsXG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRuYW1lOiAnYXp1cmUnLFxuXHRcdFx0c291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vVXNlcnMvY29ubm9yLy52c2NvZGUtb3NzLWRldi9hZ2VudFBsdWdpbnMvZmlsZS1henVyZS1za2lsbHMvMTlmZjJhYzM2ZjIvLm1jcC5qc29uJyksXG5cdFx0XHRvd25pbmdQbHVnaW5Tb3VyY2U6IHBsdWdpblNvdXJjZSxcblx0XHRcdGlzQ2xpZW50QnVuZGxlZDogZmFsc2UsXG5cdFx0fTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgYXp1cmUsIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGZhbHNlKTtcblx0XHRzZXJ2aWNlLmFwcGx5Q2xpZW50R2xvYmFsRW5hYmxlbWVudChzZXNzaW9uLCBhenVyZVNraWxsc1BsdWdpbiwgW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogdHJ1ZSB9XSk7XG5cdFx0Y29uc3QgYWZ0ZXJHbG9iYWxSZXB1Ymxpc2ggPSBzZXJ2aWNlLnJlc29sdmUoc2Vzc2lvbiwgYXp1cmUpO1xuXG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIGF6dXJlLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB0cnVlKTtcblx0XHRjb25zdCBhZnRlcldvcmtzcGFjZVJlcHVibGlzaCA9IHNlcnZpY2UuYXBwbHlDbGllbnRHbG9iYWxFbmFibGVtZW50KHNlc3Npb24sIGF6dXJlLCBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiB0cnVlIH1dKTtcblx0XHRjb25zdCBuZXdTZXNzaW9uID0gJ2FocDovL2NvcGlsb3Qvc2Vzc2lvbi1henVyZSc7XG5cdFx0c3RhdGUuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeShuZXdTZXNzaW9uLCBbd29ya3NwYWNlLnRvU3RyaW5nKCldKSk7XG5cdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplU2Vzc2lvbihuZXdTZXNzaW9uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWZ0ZXJHbG9iYWxSZXB1Ymxpc2g6IHNlcmlhbGl6YWJsZVJlc29sdXRpb24oYWZ0ZXJHbG9iYWxSZXB1Ymxpc2gpLFxuXHRcdFx0YWZ0ZXJXb3Jrc3BhY2VSZXB1Ymxpc2g6IHNlcmlhbGl6YWJsZVJlc29sdXRpb24oYWZ0ZXJXb3Jrc3BhY2VSZXB1Ymxpc2gpLFxuXHRcdFx0bmV3U2Vzc2lvbjogc2VyaWFsaXphYmxlUmVzb2x1dGlvbihzZXJ2aWNlLnJlc29sdmUobmV3U2Vzc2lvbiwgYXp1cmUpKSxcblx0XHRcdHBlcnNpc3RlZDogc3RvcmFnZS5nZXQoJ2N1c3RvbWl6YXRpb25FbmFibGVtZW50JyksXG5cdFx0fSwge1xuXHRcdFx0YWZ0ZXJHbG9iYWxSZXB1Ymxpc2g6IHtcblx0XHRcdFx0a2luZDogJ3Jlc29sdmVkJyxcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB7IGtpbmQ6ICdkaXJlY3RvcnknLCB1cmk6IHdvcmtzcGFjZS50b1N0cmluZygpIH0sXG5cdFx0XHR9LFxuXHRcdFx0YWZ0ZXJXb3Jrc3BhY2VSZXB1Ymxpc2g6IHtcblx0XHRcdFx0a2luZDogJ3Jlc29sdmVkJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0ZW5hYmxlbWVudDogW1xuXHRcdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSwgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogeyBraW5kOiAnZGlyZWN0b3J5JywgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSB9LFxuXHRcdFx0fSxcblx0XHRcdG5ld1Nlc3Npb246IHtcblx0XHRcdFx0a2luZDogJ3Jlc29sdmVkJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0ZW5hYmxlbWVudDogW1xuXHRcdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSwgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogeyBraW5kOiAnZGlyZWN0b3J5JywgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSB9LFxuXHRcdFx0fSxcblx0XHRcdHBlcnNpc3RlZDoge1xuXHRcdFx0XHRnbG9iYWw6IHtcblx0XHRcdFx0XHQnZmlsZTovLy9Vc2Vycy9jb25ub3IvLnZzY29kZS1vc3MtZGV2LWRldi9hZ2VudC1wbHVnaW5zL2dpdGh1Yi5jb20vbWljcm9zb2Z0L2F6dXJlLXNraWxscy8uZ2l0aHViL3BsdWdpbnMvYXp1cmUtc2tpbGxzI21jcD1henVyZSc6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHtcblx0XHRcdFx0XHQnZmlsZTovLy9yZXBvJzoge1xuXHRcdFx0XHRcdFx0J2ZpbGU6Ly8vVXNlcnMvY29ubm9yLy52c2NvZGUtb3NzLWRldi1kZXYvYWdlbnQtcGx1Z2lucy9naXRodWIuY29tL21pY3Jvc29mdC9henVyZS1za2lsbHMvLmdpdGh1Yi9wbHVnaW5zL2F6dXJlLXNraWxscyNtY3A9YXp1cmUnOiB0cnVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhcnMgZW50cmllcyB0aGF0IG1hdGNoIGluaGVyaXRlZCBkZWNpc2lvbnMgdGhyb3VnaCBzZXQsIGNoYW5nZSwgY2xlYXIsIGFuZCByZS1zZXQgdHJhbnNpdGlvbnMnLCAoKSA9PiB7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZmFsc2UpO1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uLCBwbHVnaW4sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UsIGZhbHNlKTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB0cnVlKTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCBmYWxzZSk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgdHJ1ZSk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdG9yYWdlLmdldCgnY3VzdG9taXphdGlvbkVuYWJsZW1lbnQnKSwge1xuXHRcdFx0Z2xvYmFsOiB7XG5cdFx0XHRcdCdmaWxlOi8vL3BsdWdpbnMvZXhhbXBsZSc6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHR9KTtcblxuXHR0ZXN0KCdwZXJzaXN0cyBvbmx5IHNjb3BlIGRlY2lzaW9ucyB0aGF0IGRpZmZlciBmcm9tIHRoZWlyIGluaGVyaXRlZCB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZmFsc2UpO1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uLCBwbHVnaW4sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UsIGZhbHNlKTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB0cnVlKTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgdHJ1ZSk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGZhbHNlKTtcblx0XHRhd2FpdCBzZXJ2aWNlLndoZW5JZGxlKCk7XG5cblx0XHRjb25zdCB3aXRoT3ZlcnJpZGVzID0ge1xuXHRcdFx0ZHVyYWJsZTogc3RydWN0dXJlZENsb25lKHN0b3JhZ2UuZ2V0PFJlY29yZDxzdHJpbmcsIHVua25vd24+PignY3VzdG9taXphdGlvbkVuYWJsZW1lbnQnKSksXG5cdFx0XHRzZXNzaW9uOiBhd2FpdCBzZXNzaW9uRGF0YS5nZXRNZXRhZGF0YShzZXNzaW9uLCAnY3VzdG9taXphdGlvbkVuYWJsZW1lbnQnKSxcblx0XHR9O1xuXG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIHRydWUpO1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uLCBwbHVnaW4sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UsIGZhbHNlKTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCB0cnVlKTtcblx0XHRhd2FpdCBzZXJ2aWNlLndoZW5JZGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdpdGhPdmVycmlkZXMsXG5cdFx0XHRhZnRlckNsZWFyaW5nSW5oZXJpdGVkVmFsdWVzOiB7XG5cdFx0XHRcdGR1cmFibGU6IHN0b3JhZ2UuZ2V0KCdjdXN0b21pemF0aW9uRW5hYmxlbWVudCcpLFxuXHRcdFx0XHRzZXNzaW9uOiBhd2FpdCBzZXNzaW9uRGF0YS5nZXRNZXRhZGF0YShzZXNzaW9uLCAnY3VzdG9taXphdGlvbkVuYWJsZW1lbnQnKSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0d2l0aE92ZXJyaWRlczoge1xuXHRcdFx0XHRkdXJhYmxlOiB7XG5cdFx0XHRcdFx0Z2xvYmFsOiB7ICdmaWxlOi8vL3BsdWdpbnMvZXhhbXBsZSc6IGZhbHNlIH0sXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB7XG5cdFx0XHRcdFx0XHQnZmlsZTovLy9yZXBvJzogeyAnZmlsZTovLy9wbHVnaW5zL2V4YW1wbGUnOiB0cnVlIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0c2Vzc2lvbjogJ3tcInBsdWdpbi1tYXRlcmlhbGl6ZWQtaGFzaC1vbmVcIjpmYWxzZX0nLFxuXHRcdFx0fSxcblx0XHRcdGFmdGVyQ2xlYXJpbmdJbmhlcml0ZWRWYWx1ZXM6IHtcblx0XHRcdFx0ZHVyYWJsZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRzZXNzaW9uOiAne30nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJ1bmVzIHdvcmtzcGFjZSBlbnRyaWVzIHRoYXQgbWF0Y2ggYW4gaW5jb21pbmcgZ2xvYmFsIGRlY2lzaW9uIHdpdGhvdXQgZXJhc2luZyBvcHBvc2luZyBkaXJlY3RvcmllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYXRjaGluZ0RpcmVjdG9yeSA9IFVSSS5maWxlKCcvbWF0Y2hpbmcnKTtcblx0XHRjb25zdCBvcHBvc2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKCcvb3Bwb3NpbmcnKTtcblx0XHRjb25zdCB1bnRvdWNoZWREaXJlY3RvcnkgPSBVUkkuZmlsZSgnL3VudG91Y2hlZCcpO1xuXHRcdGNvbnN0IHByZWxvYWRlZFN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0b3JhZ2VTZXJ2aWNlKHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRwcmVsb2FkZWRTdG9yYWdlLnNldCgnY3VzdG9taXphdGlvbkVuYWJsZW1lbnQnLCB7XG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHtcblx0XHRcdFx0W21hdGNoaW5nRGlyZWN0b3J5LnRvU3RyaW5nKCldOiB7ICdmaWxlOi8vL3BsdWdpbnMvZXhhbXBsZSc6IGZhbHNlIH0sXG5cdFx0XHRcdFtvcHBvc2luZ0RpcmVjdG9yeS50b1N0cmluZygpXTogeyAnZmlsZTovLy9wbHVnaW5zL2V4YW1wbGUnOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBydW5pbmdTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UocHJlbG9hZGVkU3RvcmFnZSwgc2Vzc2lvbkRhdGEsIHN0YXRlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHBydW5pbmdTZXJ2aWNlLnNldFdvcmt0cmVlSXNvbGF0aW9uKHdvcmt0cmVlKTtcblx0XHRhd2FpdCBwcnVuaW5nU2VydmljZS5pbml0aWFsaXplU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdHBydW5pbmdTZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBmYWxzZSk7XG5cblx0XHRjb25zdCByZXNvbHV0aW9ucyA9IFtdO1xuXHRcdGZvciAoY29uc3QgZGlyZWN0b3J5IG9mIFttYXRjaGluZ0RpcmVjdG9yeSwgb3Bwb3NpbmdEaXJlY3RvcnksIHVudG91Y2hlZERpcmVjdG9yeV0pIHtcblx0XHRcdGNvbnN0IGRpcmVjdG9yeVNlc3Npb24gPSBgYWhwOi8vY29waWxvdCR7ZGlyZWN0b3J5LnBhdGh9YDtcblx0XHRcdHN0YXRlLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkoZGlyZWN0b3J5U2Vzc2lvbiwgW2RpcmVjdG9yeS50b1N0cmluZygpXSkpO1xuXHRcdFx0YXdhaXQgcHJ1bmluZ1NlcnZpY2UuaW5pdGlhbGl6ZVNlc3Npb24oZGlyZWN0b3J5U2Vzc2lvbik7XG5cdFx0XHRjb25zdCByZXNvbHV0aW9uID0gcHJ1bmluZ1NlcnZpY2UucmVzb2x2ZShkaXJlY3RvcnlTZXNzaW9uLCBwbHVnaW4pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdXRpb24ua2luZCwgJ3Jlc29sdmVkJyk7XG5cdFx0XHRyZXNvbHV0aW9ucy5wdXNoKHtcblx0XHRcdFx0ZGlyZWN0b3J5OiBkaXJlY3RvcnkudG9TdHJpbmcoKSxcblx0XHRcdFx0cmVzb2x1dGlvbjogcmVzb2x1dGlvbi5raW5kID09PSAncmVzb2x2ZWQnID8ge1xuXHRcdFx0XHRcdGVuYWJsZWQ6IHJlc29sdXRpb24uZW5hYmxlZCxcblx0XHRcdFx0XHRlbmFibGVtZW50OiByZXNvbHV0aW9uLmVuYWJsZW1lbnQsXG5cdFx0XHRcdH0gOiByZXNvbHV0aW9uLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwZXJzaXN0ZWQ6IHByZWxvYWRlZFN0b3JhZ2UuZ2V0KCdjdXN0b21pemF0aW9uRW5hYmxlbWVudCcpLFxuXHRcdFx0cmVzb2x1dGlvbnMsXG5cdFx0fSwge1xuXHRcdFx0cGVyc2lzdGVkOiB7XG5cdFx0XHRcdGdsb2JhbDogeyAnZmlsZTovLy9wbHVnaW5zL2V4YW1wbGUnOiBmYWxzZSB9LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHtcblx0XHRcdFx0XHQnZmlsZTovLy9vcHBvc2luZyc6IHsgJ2ZpbGU6Ly8vcGx1Z2lucy9leGFtcGxlJzogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHJlc29sdXRpb25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaXJlY3Rvcnk6ICdmaWxlOi8vL21hdGNoaW5nJyxcblx0XHRcdFx0XHRyZXNvbHV0aW9uOiB7XG5cdFx0XHRcdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkaXJlY3Rvcnk6ICdmaWxlOi8vL29wcG9zaW5nJyxcblx0XHRcdFx0XHRyZXNvbHV0aW9uOiB7XG5cdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0ZW5hYmxlbWVudDogW1xuXHRcdFx0XHRcdFx0XHR7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UsIHVyaTogJ2ZpbGU6Ly8vb3Bwb3NpbmcnLCBlbmFibGVkOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRpcmVjdG9yeTogJ2ZpbGU6Ly8vdW50b3VjaGVkJyxcblx0XHRcdFx0XHRyZXNvbHV0aW9uOiB7XG5cdFx0XHRcdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlcyByYXRoZXIgdGhhbiBwYXRjaGVzIGRlY2lzaW9ucyB0aHJvdWdoIHNldCwgcmVwbGFjZW1lbnQsIGNsZWFyLCBhbmQgcmUtc2V0IHRyYW5zaXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uLCBwbHVnaW4sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGZhbHNlKTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB0cnVlKTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgZmFsc2UpO1xuXHRcdGF3YWl0IHNlcnZpY2Uud2hlbklkbGUoKTtcblxuXHRcdGNvbnN0IGdsb2JhbE9ubHkgPSBzZXJ2aWNlLnJlcGxhY2VFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpbiwgW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0pO1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uLCBwbHVnaW4sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UsIHRydWUpO1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uLCBwbHVnaW4sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLCBmYWxzZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbk9ubHkgPSBzZXJ2aWNlLnJlcGxhY2VFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpbiwgW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IGZhbHNlIH1dKTtcblx0XHRjb25zdCBlbXB0eSA9IHNlcnZpY2UucmVwbGFjZUVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBbXSk7XG5cdFx0YXdhaXQgc2VydmljZS53aGVuSWRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRnbG9iYWxPbmx5OiBzZXJpYWxpemFibGVSZXNvbHV0aW9uKGdsb2JhbE9ubHkpLFxuXHRcdFx0c2Vzc2lvbk9ubHk6IHNlcmlhbGl6YWJsZVJlc29sdXRpb24oc2Vzc2lvbk9ubHkpLFxuXHRcdFx0ZW1wdHk6IHNlcmlhbGl6YWJsZVJlc29sdXRpb24oZW1wdHkpLFxuXHRcdFx0cGVyc2lzdGVkOiB7XG5cdFx0XHRcdGR1cmFibGU6IHN0b3JhZ2UuZ2V0KCdjdXN0b21pemF0aW9uRW5hYmxlbWVudCcpLFxuXHRcdFx0XHRzZXNzaW9uOiBhd2FpdCBzZXNzaW9uRGF0YS5nZXRNZXRhZGF0YShzZXNzaW9uLCAnY3VzdG9taXphdGlvbkVuYWJsZW1lbnQnKSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0Z2xvYmFsT25seToge1xuXHRcdFx0XHRraW5kOiAncmVzb2x2ZWQnLFxuXHRcdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogeyBraW5kOiAnZGlyZWN0b3J5JywgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHRlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBlbmFibGVkOiBmYWxzZSB9XSxcblx0XHRcdH0sXG5cdFx0XHRzZXNzaW9uT25seToge1xuXHRcdFx0XHRraW5kOiAncmVzb2x2ZWQnLFxuXHRcdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogeyBraW5kOiAnZGlyZWN0b3J5JywgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHRlbmFibGVtZW50OiBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgZW5hYmxlZDogZmFsc2UgfV0sXG5cdFx0XHR9LFxuXHRcdFx0ZW1wdHk6IHtcblx0XHRcdFx0a2luZDogJ3Jlc29sdmVkJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogeyBraW5kOiAnZGlyZWN0b3J5JywgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHRlbmFibGVtZW50OiBbXSxcblx0XHRcdH0sXG5cdFx0XHRwZXJzaXN0ZWQ6IHtcblx0XHRcdFx0ZHVyYWJsZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRzZXNzaW9uOiAne30nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJ2Rlcml2ZXMgZXhhY3QgZHVyYWJsZSBhbmQgc2Vzc2lvbiBrZXlzIHdpdGhvdXQgcGx1Z2luLWNoaWxkIGNvbGxpc2lvbnMgYWNyb3NzIG1hdGVyaWFsaXplZCBlZGl0cycsICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5TZXJ2ZXI6IElDdXN0b21pemF0aW9uRW5hYmxlbWVudFRhcmdldCA9IHtcblx0XHRcdGlkOiAnbWNwLW1hdGVyaWFsaXplZC1oYXNoLW9uZScsXG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRuYW1lOiAnc2xhY2snLFxuXHRcdFx0c291cmNlOiBVUkkuZmlsZSgnL2FnZW50UGx1Z2lucy9leGFtcGxlL2hhc2gtb25lLy5tY3AuanNvbicpLFxuXHRcdFx0b3duaW5nUGx1Z2luU291cmNlOiBVUkkuZmlsZSgnL3BsdWdpbnMvZXhhbXBsZScpLFxuXHRcdH07XG5cdFx0Y29uc3QgZWRpdGVkUGx1Z2luU2VydmVyOiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQgPSB7XG5cdFx0XHQuLi5wbHVnaW5TZXJ2ZXIsXG5cdFx0XHRpZDogJ21jcC1tYXRlcmlhbGl6ZWQtaGFzaC10d28nLFxuXHRcdFx0c291cmNlOiBVUkkuZmlsZSgnL2FnZW50UGx1Z2lucy9leGFtcGxlL2hhc2gtdHdvLy5tY3AuanNvbicpLFxuXHRcdH07XG5cdFx0Y29uc3QgdG9wTGV2ZWxTZXJ2ZXI6IElDdXN0b21pemF0aW9uRW5hYmxlbWVudFRhcmdldCA9IHtcblx0XHRcdGlkOiAnc2Vzc2lvbi1tY3AtaWQnLFxuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLFxuXHRcdFx0bmFtZTogJ3N0ZGlvJyxcblx0XHRcdHNvdXJjZTogVVJJLmZpbGUoJy9yZXBvLy52c2NvZGUvbWNwLmpzb24nKSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwbHVnaW46IGdldEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2V5KHBsdWdpbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCksXG5cdFx0XHRwbHVnaW5TZXJ2ZXI6IGdldEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2V5KHBsdWdpblNlcnZlciwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSksXG5cdFx0XHR0b3BMZXZlbFNlcnZlcjogZ2V0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRLZXkodG9wTGV2ZWxTZXJ2ZXIsIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwpLFxuXHRcdFx0c2Vzc2lvbkJlZm9yZUVkaXQ6IGdldEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2V5KHBsdWdpblNlcnZlciwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24pLFxuXHRcdFx0c2Vzc2lvbkFmdGVyRWRpdDogZ2V0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRLZXkoZWRpdGVkUGx1Z2luU2VydmVyLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiksXG5cdFx0XHRwbHVnaW5BbmRDaGlsZEFyZURpc3RpbmN0OiBnZXRDdXN0b21pemF0aW9uRW5hYmxlbWVudEtleShwbHVnaW4sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwpICE9PSBnZXRDdXN0b21pemF0aW9uRW5hYmxlbWVudEtleShwbHVnaW5TZXJ2ZXIsIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwpLFxuXHRcdH0sIHtcblx0XHRcdHBsdWdpbjogJ2ZpbGU6Ly8vcGx1Z2lucy9leGFtcGxlJyxcblx0XHRcdHBsdWdpblNlcnZlcjogJ2ZpbGU6Ly8vcGx1Z2lucy9leGFtcGxlI21jcD1zbGFjaycsXG5cdFx0XHR0b3BMZXZlbFNlcnZlcjogJ21jcFNlcnZlcnMjc3RkaW8nLFxuXHRcdFx0c2Vzc2lvbkJlZm9yZUVkaXQ6ICdtY3AtbWF0ZXJpYWxpemVkLWhhc2gtb25lJyxcblx0XHRcdHNlc3Npb25BZnRlckVkaXQ6ICdtY3AtbWF0ZXJpYWxpemVkLWhhc2gtdHdvJyxcblx0XHRcdHBsdWdpbkFuZENoaWxkQXJlRGlzdGluY3Q6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luU2VydmVyLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBmYWxzZSk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpblNlcnZlciwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdHJ1ZSk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpblNlcnZlciwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGZhbHNlKTtcblx0XHRjb25zdCBlZGl0ZWRSZXNvbHV0aW9uID0gc2VydmljZS5yZXNvbHZlKHNlc3Npb24sIGVkaXRlZFBsdWdpblNlcnZlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRlZFJlc29sdXRpb24ua2luZCwgJ3Jlc29sdmVkJyk7XG5cdFx0aWYgKGVkaXRlZFJlc29sdXRpb24ua2luZCA9PT0gJ3Jlc29sdmVkJykge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0ZWRSZXNvbHV0aW9uLmVuYWJsZW1lbnQsIFtcblx0XHRcdFx0eyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB1cmk6IHdvcmtzcGFjZS50b1N0cmluZygpLCBlbmFibGVkOiB0cnVlIH0sXG5cdFx0XHRcdHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdF0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnbW9kZWxzIHdvcmtpbmctZGlyZWN0b3J5IHN0YXRlcyB3aXRob3V0IHRyZWF0aW5nIHBlbmRpbmcgYXMgd29ya3NwYWNlLWxlc3MnLCAoKSA9PiB7XG5cdFx0c3RhdGUuZGVsZXRlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0V29ya2luZ0RpcmVjdG9yeVN0YXRlKHNlc3Npb24pLCB7IGtpbmQ6ICdwZW5kaW5nJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UucmVzb2x2ZShzZXNzaW9uLCBwbHVnaW4pLCB7IGtpbmQ6ICdwZW5kaW5nJywgcmVhc29uOiAnd29ya2luZ0RpcmVjdG9yeScgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBmYWxzZSksIHsga2luZDogJ3BlbmRpbmcnLCByZWFzb246ICd3b3JraW5nRGlyZWN0b3J5JyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdjdXN0b21pemF0aW9uRW5hYmxlbWVudCcpLCB7IGdsb2JhbDogeyAnZmlsZTovLy9wbHVnaW5zL2V4YW1wbGUnOiBmYWxzZSB9IH0pO1xuXG5cdFx0c3RhdGUuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeShzZXNzaW9uLCB1bmRlZmluZWQsIHdpdGhTZXNzaW9uV29ya3NwYWNlbGVzcyh1bmRlZmluZWQsIHRydWUpKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldFdvcmtpbmdEaXJlY3RvcnlTdGF0ZShzZXNzaW9uKSwgeyBraW5kOiAnd29ya3NwYWNlbGVzcycgfSk7XG5cblx0XHRzdGF0ZS5zZXRTZXNzaW9uTWV0YShzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdHdvcmt0cmVlLnBlbmRpbmcuYWRkKEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldFdvcmtpbmdEaXJlY3RvcnlTdGF0ZShzZXNzaW9uKSwgeyBraW5kOiAncGVuZGluZycgfSk7XG5cblx0XHR3b3JrdHJlZS5wZW5kaW5nLmRlbGV0ZShBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpO1xuXHRcdHN0YXRlLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24sIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVNldCwgZGlyZWN0b3J5OiB3b3Jrc3BhY2UudG9TdHJpbmcoKSB9KTtcblx0XHRjb25zdCBkaXJlY3RvcnlTdGF0ZSA9IHNlcnZpY2UuZ2V0V29ya2luZ0RpcmVjdG9yeVN0YXRlKHNlc3Npb24pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlyZWN0b3J5U3RhdGUua2luZCA9PT0gJ2RpcmVjdG9yeScgPyB7IGtpbmQ6IGRpcmVjdG9yeVN0YXRlLmtpbmQsIHVyaTogZGlyZWN0b3J5U3RhdGUudXJpLnRvU3RyaW5nKCkgfSA6IGRpcmVjdG9yeVN0YXRlLCB7IGtpbmQ6ICdkaXJlY3RvcnknLCB1cmk6IHdvcmtzcGFjZS50b1N0cmluZygpIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdxdWV1ZXMgYSB3b3Jrc3BhY2UgcmVwbGFjZW1lbnQgd2hpbGUgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGlzIHBlbmRpbmcgYW5kIGFwcGxpZXMgaXQgd2hlbiByZWdpc3RlcmVkJywgKCkgPT4ge1xuXHRcdHN0YXRlLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0Y29uc3QgcmVwbGFjZW1lbnQgPSBzZXJ2aWNlLnJlcGxhY2VFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpbiwgW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSwgZW5hYmxlZDogZmFsc2UgfV0pO1xuXHRcdHN0YXRlLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkoc2Vzc2lvbikpO1xuXHRcdHN0YXRlLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24sIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVNldCwgZGlyZWN0b3J5OiB3b3Jrc3BhY2UudG9TdHJpbmcoKSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVwbGFjZW1lbnQsXG5cdFx0XHRyZXNvbHV0aW9uOiBzZXJpYWxpemFibGVSZXNvbHV0aW9uKHNlcnZpY2UucmVzb2x2ZShzZXNzaW9uLCBwbHVnaW4pKSxcblx0XHR9LCB7XG5cdFx0XHRyZXBsYWNlbWVudDogeyBraW5kOiAncGVuZGluZycsIHJlYXNvbjogJ3dvcmtpbmdEaXJlY3RvcnknIH0sXG5cdFx0XHRyZXNvbHV0aW9uOiB7XG5cdFx0XHRcdGtpbmQ6ICdyZXNvbHZlZCcsXG5cdFx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB7IGtpbmQ6ICdkaXJlY3RvcnknLCB1cmk6IHdvcmtzcGFjZS50b1N0cmluZygpIH0sXG5cdFx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UsIHVyaTogd29ya3NwYWNlLnRvU3RyaW5nKCksIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHR9KTtcblxuXHR0ZXN0KCdxdWV1ZXMgYSB3b3Jrc3BhY2Ugd3JpdGUgd2hpbGUgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGlzIHBlbmRpbmcgYW5kIGFwcGxpZXMgaXQgd2hlbiByZWdpc3RlcmVkJywgKCkgPT4ge1xuXHRcdHN0YXRlLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0Y29uc3Qgd3JpdGUgPSBzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCBmYWxzZSk7XG5cdFx0c3RhdGUuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeShzZXNzaW9uKSk7XG5cdFx0c3RhdGUuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3Rvcnk6IHdvcmtzcGFjZS50b1N0cmluZygpIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3cml0ZSxcblx0XHRcdHJlc29sdXRpb246IHNlcmlhbGl6YWJsZVJlc29sdXRpb24oc2VydmljZS5yZXNvbHZlKHNlc3Npb24sIHBsdWdpbikpLFxuXHRcdH0sIHtcblx0XHRcdHdyaXRlOiB7IGtpbmQ6ICdwZW5kaW5nJywgcmVhc29uOiAnd29ya2luZ0RpcmVjdG9yeScgfSxcblx0XHRcdHJlc29sdXRpb246IHtcblx0XHRcdFx0a2luZDogJ3Jlc29sdmVkJyxcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHsga2luZDogJ2RpcmVjdG9yeScsIHVyaTogd29ya3NwYWNlLnRvU3RyaW5nKCkgfSxcblx0XHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSwgZW5hYmxlZDogZmFsc2UgfV0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdxdWV1ZXMgYSByZXBsYWNlbWVudCBiZWZvcmUgbG9hZGluZyB0aGUgc2Vzc2lvbiBjYWNoZSBhbmQgYXBwbGllcyBpdCBhZnRlciBsb2FkaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCByZXNvbHZlTG9hZDogKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHZvaWQ7XG5cdFx0c2Vzc2lvbkRhdGEubWV0YWRhdGFMb2FkID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7IHJlc29sdmVMb2FkID0gcmVzb2x2ZTsgfSk7XG5cdFx0Y29uc3QgbG9hZGluZyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlKHN0b3JhZ2UsIHNlc3Npb25EYXRhLCBzdGF0ZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRsb2FkaW5nLnNldFdvcmt0cmVlSXNvbGF0aW9uKHdvcmt0cmVlKTtcblx0XHRjb25zdCBsb2FkID0gbG9hZGluZy5pbml0aWFsaXplU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRjb25zdCByZXBsYWNlbWVudCA9IGxvYWRpbmcucmVwbGFjZUVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB1cmk6IHdvcmtzcGFjZS50b1N0cmluZygpLCBlbmFibGVkOiBmYWxzZSB9XSk7XG5cdFx0cmVzb2x2ZUxvYWQhKHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgbG9hZDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVwbGFjZW1lbnQsXG5cdFx0XHRyZXNvbHV0aW9uOiBzZXJpYWxpemFibGVSZXNvbHV0aW9uKGxvYWRpbmcucmVzb2x2ZShzZXNzaW9uLCBwbHVnaW4pKSxcblx0XHR9LCB7XG5cdFx0XHRyZXBsYWNlbWVudDogeyBraW5kOiAncGVuZGluZycsIHJlYXNvbjogJ3Nlc3Npb24nIH0sXG5cdFx0XHRyZXNvbHV0aW9uOiB7XG5cdFx0XHRcdGtpbmQ6ICdyZXNvbHZlZCcsXG5cdFx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB7IGtpbmQ6ICdkaXJlY3RvcnknLCB1cmk6IHdvcmtzcGFjZS50b1N0cmluZygpIH0sXG5cdFx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UsIHVyaTogd29ya3NwYWNlLnRvU3RyaW5nKCksIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyB3b3Jrc3BhY2Ugd3JpdGVzIGZvciB3b3Jrc3BhY2UtbGVzcyBzZXNzaW9ucycsICgpID0+IHtcblx0XHRzdGF0ZS5kZWxldGVTZXNzaW9uKHNlc3Npb24pO1xuXHRcdHN0YXRlLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkoc2Vzc2lvbiwgdW5kZWZpbmVkLCB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3ModW5kZWZpbmVkLCB0cnVlKSkpO1xuXG5cdFx0YXNzZXJ0LnRocm93cyhcblx0XHRcdCgpID0+IHNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uLCBwbHVnaW4sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UsIGZhbHNlKSxcblx0XHRcdC9DYW5ub3QgcmVjb3JkIHdvcmtzcGFjZSBlbmFibGVtZW50IGZvciBhIHdvcmtzcGFjZS1sZXNzIHNlc3Npb24vLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fubm91bmNlcyB3aGVuIGEgc2Vzc2lvbiBlbmFibGVtZW50IGNhY2hlIHRyYW5zaXRpb25zIGZyb20gcGVuZGluZyB0byByZXNvbHZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgcmVzb2x2ZUxvYWQ6ICh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB2b2lkO1xuXHRcdHNlc3Npb25EYXRhLm1ldGFkYXRhTG9hZCA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4geyByZXNvbHZlTG9hZCA9IHJlc29sdmU7IH0pO1xuXHRcdGNvbnN0IGxvYWRpbmcgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZShzdG9yYWdlLCBzZXNzaW9uRGF0YSwgc3RhdGUsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0bG9hZGluZy5zZXRXb3JrdHJlZUlzb2xhdGlvbih3b3JrdHJlZSk7XG5cdFx0Y29uc3QgY2hhbmdlczogc3RyaW5nW11bXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsb2FkaW5nLm9uRGlkQ2hhbmdlKGV2ZW50ID0+IGNoYW5nZXMucHVzaChbLi4uZXZlbnQuc2Vzc2lvbnNdKSkpO1xuXG5cdFx0Y29uc3QgbG9hZCA9IGxvYWRpbmcuaW5pdGlhbGl6ZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2FkaW5nLnJlc29sdmUoc2Vzc2lvbiwgcGx1Z2luKSwgeyBraW5kOiAncGVuZGluZycsIHJlYXNvbjogJ3Nlc3Npb24nIH0pO1xuXHRcdHJlc29sdmVMb2FkISh1bmRlZmluZWQpO1xuXHRcdGF3YWl0IGxvYWQ7XG5cdFx0YXdhaXQgbG9hZGluZy5pbml0aWFsaXplU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2hhbmdlcyxcblx0XHRcdHJlc29sdXRpb246IGxvYWRpbmcucmVzb2x2ZShzZXNzaW9uLCBwbHVnaW4pLmtpbmQsXG5cdFx0fSwge1xuXHRcdFx0Y2hhbmdlczogW1tzZXNzaW9uXV0sXG5cdFx0XHRyZXNvbHV0aW9uOiAncmVzb2x2ZWQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbm5vdW5jZXMgd29ya2luZy1kaXJlY3RvcnkgYW5kIHdvcmt0cmVlLXBlbmRpbmcgdHJhbnNpdGlvbnMnLCAoKSA9PiB7XG5cdFx0c3RhdGUuZGVsZXRlU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRjb25zdCBjaGFuZ2VzOiBzdHJpbmdbXVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2UoZXZlbnQgPT4gY2hhbmdlcy5wdXNoKFsuLi5ldmVudC5zZXNzaW9uc10pKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnJlc29sdmUoc2Vzc2lvbiwgcGx1Z2luKSwgeyBraW5kOiAncGVuZGluZycsIHJlYXNvbjogJ3dvcmtpbmdEaXJlY3RvcnknIH0pO1xuXG5cdFx0c3RhdGUuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeShzZXNzaW9uKSk7XG5cdFx0c3RhdGUuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3Rvcnk6IHdvcmtzcGFjZS50b1N0cmluZygpIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlc29sdmUoc2Vzc2lvbiwgcGx1Z2luKS5raW5kLCAncmVzb2x2ZWQnKTtcblxuXHRcdHdvcmt0cmVlLnBlbmRpbmcuYWRkKEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnJlc29sdmUoc2Vzc2lvbiwgcGx1Z2luKSwgeyBraW5kOiAncGVuZGluZycsIHJlYXNvbjogJ3dvcmtpbmdEaXJlY3RvcnknIH0pO1xuXHRcdHdvcmt0cmVlLnBlbmRpbmcuZGVsZXRlKEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSk7XG5cdFx0d29ya3RyZWUuZmlyZVBlbmRpbmdDaGFuZ2UoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2hhbmdlcyxcblx0XHRcdHJlc29sdXRpb246IHNlcnZpY2UucmVzb2x2ZShzZXNzaW9uLCBwbHVnaW4pLmtpbmQsXG5cdFx0fSwge1xuXHRcdFx0Y2hhbmdlczogW1tzZXNzaW9uXSwgW3Nlc3Npb25dXSxcblx0XHRcdHJlc29sdXRpb246ICdyZXNvbHZlZCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYnVpbGRzIHRoZSBhdXRob3JpdGF0aXZlIHN5bmNocm9ub3VzIHNlc3Npb24gY2FjaGUgYWZ0ZXIgcmVvcGVuaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uLCBwbHVnaW4sIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLCBmYWxzZSk7XG5cdFx0YXdhaXQgc2VydmljZS53aGVuSWRsZSgpO1xuXHRcdGNvbnN0IHJlb3BlbmVkID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2Uoc3RvcmFnZSwgc2Vzc2lvbkRhdGEsIHN0YXRlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHJlb3BlbmVkLnNldFdvcmt0cmVlSXNvbGF0aW9uKHdvcmt0cmVlKTtcblx0XHRhd2FpdCByZW9wZW5lZC5pbml0aWFsaXplU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gcmVvcGVuZWQucmVzb2x2ZShzZXNzaW9uLCBwbHVnaW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5raW5kLCAncmVzb2x2ZWQnKTtcblx0XHRpZiAocmVzb2x2ZWQua2luZCA9PT0gJ3Jlc29sdmVkJykge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlZC5lbmFibGVtZW50LCBbeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgZW5hYmxlZDogZmFsc2UgfV0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnaXNvbGF0ZXMgcGVyc2lzdGVkIHNlc3Npb24gZGVjaXNpb25zIGJldHdlZW4gc2Vzc2lvbnMgZm9yIHRoZSBzYW1lIGN1c3RvbWl6YXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb3RoZXJTZXNzaW9uID0gJ2FocDovL2NvcGlsb3Qvc2Vzc2lvbi0yJztcblx0XHRzdGF0ZS5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KG90aGVyU2Vzc2lvbiwgW3dvcmtzcGFjZS50b1N0cmluZygpXSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZVNlc3Npb24ob3RoZXJTZXNzaW9uKTtcblx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwgcGx1Z2luLCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbiwgZmFsc2UpO1xuXHRcdGF3YWl0IHNlcnZpY2Uud2hlbklkbGUoKTtcblxuXHRcdGNvbnN0IHJlb3BlbmVkID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2Uoc3RvcmFnZSwgc2Vzc2lvbkRhdGEsIHN0YXRlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHJlb3BlbmVkLnNldFdvcmt0cmVlSXNvbGF0aW9uKHdvcmt0cmVlKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbcmVvcGVuZWQuaW5pdGlhbGl6ZVNlc3Npb24oc2Vzc2lvbiksIHJlb3BlbmVkLmluaXRpYWxpemVTZXNzaW9uKG90aGVyU2Vzc2lvbildKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zmlyc3Q6IHNlcmlhbGl6YWJsZVJlc29sdXRpb24ocmVvcGVuZWQucmVzb2x2ZShzZXNzaW9uLCBwbHVnaW4pKSxcblx0XHRcdHNlY29uZDogc2VyaWFsaXphYmxlUmVzb2x1dGlvbihyZW9wZW5lZC5yZXNvbHZlKG90aGVyU2Vzc2lvbiwgcGx1Z2luKSksXG5cdFx0XHRwZXJzaXN0ZWQ6IHtcblx0XHRcdFx0Zmlyc3Q6IGF3YWl0IHNlc3Npb25EYXRhLmdldE1ldGFkYXRhKHNlc3Npb24sICdjdXN0b21pemF0aW9uRW5hYmxlbWVudCcpLFxuXHRcdFx0XHRzZWNvbmQ6IGF3YWl0IHNlc3Npb25EYXRhLmdldE1ldGFkYXRhKG90aGVyU2Vzc2lvbiwgJ2N1c3RvbWl6YXRpb25FbmFibGVtZW50JyksXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdGZpcnN0OiB7XG5cdFx0XHRcdGtpbmQ6ICdyZXNvbHZlZCcsXG5cdFx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB7IGtpbmQ6ICdkaXJlY3RvcnknLCB1cmk6IHdvcmtzcGFjZS50b1N0cmluZygpIH0sXG5cdFx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLCBlbmFibGVkOiBmYWxzZSB9XSxcblx0XHRcdH0sXG5cdFx0XHRzZWNvbmQ6IHtcblx0XHRcdFx0a2luZDogJ3Jlc29sdmVkJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogeyBraW5kOiAnZGlyZWN0b3J5JywgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHRlbmFibGVtZW50OiBbXSxcblx0XHRcdH0sXG5cdFx0XHRwZXJzaXN0ZWQ6IHtcblx0XHRcdFx0Zmlyc3Q6ICd7XCJwbHVnaW4tbWF0ZXJpYWxpemVkLWhhc2gtb25lXCI6ZmFsc2V9Jyxcblx0XHRcdFx0c2Vjb25kOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBvbmNlIGZvciBhIGRlY2lzaW9uIHdyaXRlIGFuZCBkb2VzIG5vdCBlbWl0IG9uIGEgbm8tb3Agc2Vzc2lvbiByZS1pbml0aWFsaXphdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGFuZ2VzOiBzdHJpbmdbXVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2UoZXZlbnQgPT4gY2hhbmdlcy5wdXNoKFsuLi5ldmVudC5zZXNzaW9uc10pKSk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHBsdWdpbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZmFsc2UpO1xuXHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZVNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYW5nZXMsIFtbc2Vzc2lvbl1dKTtcblx0fSk7XG5cblx0dGVzdCgnZXZpY3RzIGFjcm9zcyBnbG9iYWwgYW5kIHdvcmtzcGFjZSBlbnRyaWVzLCB1cGRhdGluZyByZWNlbmN5IG9ubHkgb24gd3JpdGVzJywgKCkgPT4ge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDw9IDUxMDsgaSsrKSB7XG5cdFx0XHRzZXJ2aWNlLnNldEVuYWJsZW1lbnQoc2Vzc2lvbiwge1xuXHRcdFx0XHRpZDogYHBsdWdpbi0ke2l9YCxcblx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0XHRuYW1lOiBgUGx1Z2luICR7aX1gLFxuXHRcdFx0XHRzb3VyY2U6IFVSSS5maWxlKGAvcGx1Z2lucy8ke2l9YCksXG5cdFx0XHR9LCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBmYWxzZSk7XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmtzcGFjZVRhcmdldDogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0ID0ge1xuXHRcdFx0aWQ6ICd3b3Jrc3BhY2UtcGx1Z2luJyxcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdG5hbWU6ICdXb3Jrc3BhY2UgUGx1Z2luJyxcblx0XHRcdHNvdXJjZTogVVJJLmZpbGUoJy9wbHVnaW5zL3dvcmtzcGFjZScpLFxuXHRcdH07XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHdvcmtzcGFjZVRhcmdldCwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgZmFsc2UpO1xuXHRcdHNlcnZpY2UucmVzb2x2ZShzZXNzaW9uLCB7XG5cdFx0XHRpZDogJ3BsdWdpbi0wJyxcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdG5hbWU6ICdQbHVnaW4gMCcsXG5cdFx0XHRzb3VyY2U6IFVSSS5maWxlKCcvcGx1Z2lucy8wJyksXG5cdFx0fSk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHtcblx0XHRcdGlkOiAncGx1Z2luLTUxMScsXG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRuYW1lOiAnUGx1Z2luIDUxMScsXG5cdFx0XHRzb3VyY2U6IFVSSS5maWxlKCcvcGx1Z2lucy81MTEnKSxcblx0XHR9LCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsLCBmYWxzZSk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVtZW50KHNlc3Npb24sIHdvcmtzcGFjZVRhcmdldCwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgZmFsc2UpO1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlbWVudChzZXNzaW9uLCB7XG5cdFx0XHRpZDogJ3BsdWdpbi01MTInLFxuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0bmFtZTogJ1BsdWdpbiA1MTInLFxuXHRcdFx0c291cmNlOiBVUkkuZmlsZSgnL3BsdWdpbnMvNTEyJyksXG5cdFx0fSwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgcGVyc2lzdGVkID0gc3RvcmFnZS5nZXQ8eyBnbG9iYWw6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+OyB3b3JraW5nRGlyZWN0b3JpZXM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PiB9PignY3VzdG9taXphdGlvbkVuYWJsZW1lbnQnKSE7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb3VudDogT2JqZWN0LmtleXMocGVyc2lzdGVkLmdsb2JhbCkubGVuZ3RoICsgT2JqZWN0LnZhbHVlcyhwZXJzaXN0ZWQud29ya2luZ0RpcmVjdG9yaWVzKS5yZWR1Y2UoKHRvdGFsLCBkZWNpc2lvbnMpID0+IHRvdGFsICsgT2JqZWN0LmtleXMoZGVjaXNpb25zKS5sZW5ndGgsIDApLFxuXHRcdFx0cmVhZERvZXNOb3RSZWZyZXNoOiBwZXJzaXN0ZWQuZ2xvYmFsWydmaWxlOi8vL3BsdWdpbnMvMCddLFxuXHRcdFx0d29ya3NwYWNlUmV3cml0ZVJlZnJlc2hlczogcGVyc2lzdGVkLndvcmtpbmdEaXJlY3Rvcmllc1snZmlsZTovLy9yZXBvJ10/LlsnZmlsZTovLy9wbHVnaW5zL3dvcmtzcGFjZSddLFxuXHRcdFx0b2xkZXN0QWZ0ZXJSZXdyaXRlOiBwZXJzaXN0ZWQuZ2xvYmFsWydmaWxlOi8vL3BsdWdpbnMvMSddLFxuXHRcdFx0bmV3ZXN0OiBwZXJzaXN0ZWQuZ2xvYmFsWydmaWxlOi8vL3BsdWdpbnMvNTEyJ10sXG5cdFx0fSwge1xuXHRcdFx0Y291bnQ6IDUxMixcblx0XHRcdHJlYWREb2VzTm90UmVmcmVzaDogdW5kZWZpbmVkLFxuXHRcdFx0d29ya3NwYWNlUmV3cml0ZVJlZnJlc2hlczogZmFsc2UsXG5cdFx0XHRvbGRlc3RBZnRlclJld3JpdGU6IHVuZGVmaW5lZCxcblx0XHRcdG5ld2VzdDogZmFsc2UsXG5cdFx0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
