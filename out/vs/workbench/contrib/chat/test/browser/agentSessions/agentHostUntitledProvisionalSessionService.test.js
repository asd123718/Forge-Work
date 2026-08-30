import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { constObservable, derived, observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { CustomizationType } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../../../platform/workspace/common/workspace.js";
import { MessageKind, TurnState } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { AgentHostUntitledProvisionalSessionService } from "../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js";
import { AgentHostNewSessionFolderService, IAgentHostNewSessionFolderService } from "../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js";
import { AgentHostImportConversationStore, IAgentHostImportConversationStore } from "../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js";
import { IAgentHostActiveClientService } from "../../../browser/agentSessions/agentHost/agentHostActiveClientService.js";
class MockAgentHostService extends mock() {
  constructor() {
    super(...arguments);
    this.clientId = "test-client";
    this.createCalls = [];
    this.disposed = [];
    this.dispatched = [];
    this.resolveCalls = [];
    this.disposeAttempts = [];
    this.failNextCreate = false;
    this.failNextDispose = false;
    this._onAgentHostStart = new Emitter();
    this.onAgentHostStart = this._onAgentHostStart.event;
    /** Agents advertised by the (stubbed) root state; drives capability gating. */
    this.rootStateAgents = [];
    this.rootState = (() => {
      const self = this;
      return {
        get value() {
          return { agents: self.rootStateAgents };
        },
        verifiedValue: void 0,
        onDidChange: Event.None,
        onWillApplyAction: Event.None,
        onDidApplyAction: Event.None
      };
    })();
    /**
     * Each entry is consumed in order by the next `resolveSessionConfig` call.
     * Callers may push deferred promises (for race tests) or resolved values.
     */
    this.resolveQueue = [];
  }
  async createSession(config) {
    assert.ok(config?.session);
    this.createCalls.push(config);
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error("create failed");
    }
    const gate = this.createGate;
    this.createGate = void 0;
    if (gate) {
      await gate.p;
    }
    return config.session;
  }
  async disposeSession(session) {
    this.disposeAttempts.push(session);
    if (this.failNextDispose) {
      this.failNextDispose = false;
      throw new Error("dispose failed");
    }
    this.disposed.push(session);
  }
  fireAgentHostStart() {
    this._onAgentHostStart.fire();
  }
  dispose() {
    this._onAgentHostStart.dispose();
  }
  dispatch(channel, action) {
    this.dispatched.push({ channel, ...action });
  }
  async resolveSessionConfig(params) {
    this.resolveCalls.push(params);
    const next = this.resolveQueue.shift();
    if (!next) {
      throw new Error(`No queued resolveSessionConfig response (call #${this.resolveCalls.length})`);
    }
    return next;
  }
}
class MockChatService extends mock() {
  constructor() {
    super(...arguments);
    this.onDidDisposeSession = Event.None;
  }
}
function makeSchema(branchReadOnly) {
  return {
    type: "object",
    properties: {
      isolation: {
        type: "string",
        title: "Isolation",
        enum: ["folder", "worktree"],
        default: "folder"
      },
      branch: {
        type: "string",
        title: "Branch",
        enum: ["main"],
        default: "main",
        readOnly: branchReadOnly
      }
    }
  };
}
function untitledChatUri(id) {
  return URI.from({ scheme: "agent-host-copilot", path: `/untitled-${id}` });
}
function workspaceFolder(uri, index) {
  return { uri, index, name: uri.path, toResource: (relativePath) => URI.joinPath(uri, relativePath) };
}
suite("AgentHostUntitledProvisionalSessionService", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let agentHost;
  let importStore;
  let provisional;
  let folderService;
  let cleanup;
  let workspaceTrusted;
  let untrustedFolders;
  let workspaceFolders;
  let workspaceConfiguration;
  let workspaceName;
  let workbenchState;
  let isSessionsWindow;
  let customizations;
  let onDidChangeWorkspaceFolders;
  setup(async () => {
    agentHost = ds.add(new MockAgentHostService());
    workspaceTrusted = true;
    untrustedFolders = /* @__PURE__ */ new Set();
    workspaceFolders = [];
    workspaceConfiguration = null;
    workspaceName = void 0;
    workbenchState = WorkbenchState.EMPTY;
    isSessionsWindow = false;
    onDidChangeWorkspaceFolders = ds.add(new Emitter());
    const insta = ds.add(new TestInstantiationService());
    insta.stub(IAgentHostService, agentHost);
    insta.stub(ILogService, new NullLogService());
    insta.stub(IChatService, new MockChatService());
    insta.stub(IConfigurationService, new TestConfigurationService());
    insta.stub(IWorkbenchEnvironmentService, { get isSessionsWindow() {
      return isSessionsWindow;
    } });
    insta.stub(IWorkspaceContextService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeWorkspaceFolders = onDidChangeWorkspaceFolders.event;
      }
      getWorkspace() {
        return {
          id: "workspace",
          folders: workspaceFolders.map((uri) => ({ uri })),
          configuration: workspaceConfiguration,
          name: workspaceName
        };
      }
      getWorkbenchState() {
        return workbenchState;
      }
    }());
    insta.stub(IWorkspaceTrustManagementService, new class extends mock() {
      isWorkspaceTrusted() {
        return workspaceTrusted;
      }
      async getUriTrustInfo(uri) {
        return { uri, trusted: !untrustedFolders.has(uri.toString()) };
      }
    }());
    folderService = ds.add(insta.createInstance(AgentHostNewSessionFolderService));
    insta.stub(IAgentHostNewSessionFolderService, folderService);
    importStore = new AgentHostImportConversationStore();
    insta.stub(IAgentHostImportConversationStore, importStore);
    customizations = observableValue("customizations", []);
    insta.stub(IAgentHostActiveClientService, {
      acquireScope: (_sessionType, _roots) => ({
        customizations,
        customAgents: constObservable([]),
        tools: constObservable([]),
        isResolved: constObservable(true),
        whenResolved: () => Promise.resolve(),
        activeClient: (clientId) => derived((reader) => ({ clientId, tools: [], customizations: [...customizations.read(reader)] })),
        dispose: () => {
        }
      })
    });
    provisional = ds.add(insta.createInstance(AgentHostUntitledProvisionalSessionService));
    cleanup = ds.add(new DisposableStore());
  });
  test("getOrCreate creates one backend provisional and returns the same URI on repeat calls", async () => {
    agentHost.resolveQueue = [];
    const ui = untitledChatUri("a");
    const [a, b] = await Promise.all([
      provisional.getOrCreate(ui, "copilot", void 0),
      provisional.getOrCreate(ui, "copilot", void 0)
    ]);
    assert.deepStrictEqual({
      provider: a?.scheme,
      isOpaque: a?.path !== ui.path,
      reused: b?.toString() === a?.toString(),
      createCount: agentHost.createCalls.length,
      config: agentHost.createCalls[0].config
    }, {
      provider: "copilot",
      isOpaque: true,
      reused: true,
      createCount: 1,
      config: { isolation: "folder" }
    });
  });
  test("publishes active-client customizations before the first prompt and keeps them updated", async () => {
    const first = {
      type: CustomizationType.Plugin,
      id: "plugin:first",
      uri: "file:///plugins/first",
      name: "First"
    };
    const second = {
      type: CustomizationType.Plugin,
      id: "plugin:second",
      uri: "file:///plugins/second",
      name: "Second"
    };
    customizations.set([first], void 0);
    await provisional.getOrCreate(untitledChatUri("customizations"), "copilot", void 0);
    customizations.set([first, second], void 0);
    assert.deepStrictEqual(agentHost.dispatched.filter((action) => action.type === ActionType.SessionActiveClientSet).map((action) => action.activeClient), [{
      clientId: "test-client",
      tools: [],
      customizations: [first]
    }, {
      clientId: "test-client",
      tools: [],
      customizations: [first, second]
    }]);
  });
  test("getOrCreate includes Editor multi-root workspace metadata", async () => {
    workspaceFolders = [URI.file("/workspace/one")];
    workspaceConfiguration = URI.parse("vscode-remote://ssh-remote+host/work/demo.code-workspace");
    workspaceName = "Demo Workspace";
    workbenchState = WorkbenchState.WORKSPACE;
    await provisional.getOrCreate(untitledChatUri("multi-root"), "copilot", workspaceFolders[0]);
    assert.deepStrictEqual(agentHost.createCalls[0]._meta, {
      multiRoot: {
        workspaceFile: workspaceConfiguration.toString()
      }
    });
  });
  test("workspace folder changes recreate a multi-root provisional with the latest secondary set", async () => {
    const primary = URI.file("/workspace/one");
    const secondary = URI.file("/workspace/two");
    const added = URI.file("/workspace/three");
    workspaceFolders = [primary, secondary];
    workspaceConfiguration = URI.file("/workspace/demo.code-workspace");
    workbenchState = WorkbenchState.WORKSPACE;
    agentHost.rootStateAgents = [agentInfo("copilot", true)];
    const ui = untitledChatUri("multi-root-folder-changes");
    await provisional.getOrCreate(ui, "copilot", primary);
    workspaceFolders = [secondary, added];
    onDidChangeWorkspaceFolders.fire({
      added: [workspaceFolder(added, 1)],
      removed: [workspaceFolder(primary, 0)],
      changed: []
    });
    await provisional.waitForPending(ui);
    workspaceFolders = [added, secondary];
    onDidChangeWorkspaceFolders.fire({
      added: [],
      removed: [],
      changed: [workspaceFolder(added, 0), workspaceFolder(secondary, 1)]
    });
    await provisional.waitForPending(ui);
    const afterReorderCount = agentHost.createCalls.length;
    workspaceFolders = [added];
    onDidChangeWorkspaceFolders.fire({
      added: [],
      removed: [workspaceFolder(secondary, 1)],
      changed: []
    });
    await provisional.waitForPending(ui);
    assert.deepStrictEqual({
      workingDirectories: agentHost.createCalls.map((call) => call.workingDirectories?.map((directory) => directory.toString())),
      afterReorderCount
    }, {
      workingDirectories: [
        [primary.toString(), secondary.toString()],
        [primary.toString(), secondary.toString(), added.toString()],
        [primary.toString(), added.toString()]
      ],
      afterReorderCount: 2
    });
  });
  test("a single-folder draft adopts secondary roots when the workspace becomes multi-root", async () => {
    const primary = URI.file("/workspace/one");
    const added = URI.file("/workspace/two");
    workspaceFolders = [primary];
    workspaceConfiguration = URI.file("/workspace/demo.code-workspace");
    workbenchState = WorkbenchState.WORKSPACE;
    agentHost.rootStateAgents = [agentInfo("copilot", true)];
    const ui = untitledChatUri("single-to-multi-root");
    await provisional.getOrCreate(ui, "copilot", primary);
    workspaceFolders = [primary, added];
    onDidChangeWorkspaceFolders.fire({
      added: [workspaceFolder(added, 1)],
      removed: [],
      changed: []
    });
    await provisional.waitForPending(ui);
    assert.deepStrictEqual(
      agentHost.createCalls.map((call) => call.workingDirectories?.map((directory) => directory.toString())),
      [
        [primary.toString()],
        [primary.toString(), added.toString()]
      ]
    );
  });
  test("tryRebind recomputes the latest multi-root folder set without relying on a workspace event", async () => {
    const primary = URI.file("/workspace/one");
    const secondary = URI.file("/workspace/two");
    const added = URI.file("/workspace/three");
    workspaceFolders = [primary, secondary];
    workspaceConfiguration = URI.file("/workspace/demo.code-workspace");
    workbenchState = WorkbenchState.WORKSPACE;
    agentHost.rootStateAgents = [agentInfo("copilot", true)];
    const ui = untitledChatUri("multi-root-rebind");
    const real = URI.from({ scheme: "agent-host-copilot", path: "/real-multi-root-rebind" });
    await provisional.getOrCreate(ui, "copilot", primary);
    workspaceFolders = [secondary, added];
    await provisional.tryRebind(ui, real, "copilot", primary);
    assert.deepStrictEqual(
      agentHost.createCalls.at(-1)?.workingDirectories?.map((directory) => directory.toString()),
      [primary.toString(), secondary.toString(), added.toString()]
    );
  });
  test("tryRebind promotes a single-folder draft when a second folder appears without a workspace event", async () => {
    const primary = URI.file("/workspace/one");
    const added = URI.file("/workspace/two");
    workspaceFolders = [primary];
    workspaceConfiguration = URI.file("/workspace/demo.code-workspace");
    workbenchState = WorkbenchState.WORKSPACE;
    agentHost.rootStateAgents = [agentInfo("copilot", true)];
    const ui = untitledChatUri("single-to-multi-root-rebind");
    const real = URI.from({ scheme: "agent-host-copilot", path: "/real-single-to-multi-root-rebind" });
    await provisional.getOrCreate(ui, "copilot", primary);
    workspaceFolders = [primary, added];
    await provisional.tryRebind(ui, real, "copilot", primary);
    assert.deepStrictEqual(
      agentHost.createCalls.map((call) => call.workingDirectories?.map((directory) => directory.toString())),
      [
        [primary.toString()],
        [primary.toString(), added.toString()]
      ]
    );
  });
  test("getOrCreate omits multi-root metadata without a workspace configuration", async () => {
    workspaceFolders = [URI.file("/workspace/one"), URI.file("/workspace/two")];
    workbenchState = WorkbenchState.WORKSPACE;
    await provisional.getOrCreate(untitledChatUri("multi-root-no-config"), "copilot", workspaceFolders[0]);
    assert.strictEqual(agentHost.createCalls[0]._meta, void 0);
  });
  test("getOrCreate omits multi-root metadata in the Agents window", async () => {
    workspaceFolders = [URI.file("/workspace/one"), URI.file("/workspace/two")];
    workspaceConfiguration = URI.file("/workspace/demo.code-workspace");
    workbenchState = WorkbenchState.WORKSPACE;
    isSessionsWindow = true;
    await provisional.getOrCreate(untitledChatUri("agents-window"), "copilot", workspaceFolders[0]);
    assert.strictEqual(agentHost.createCalls[0]._meta, void 0);
  });
  test("getOrCreate does not spawn a backend provisional in an untrusted workspace", async () => {
    workspaceTrusted = false;
    const ui = untitledChatUri("untrusted");
    const result = await provisional.getOrCreate(ui, "copilot", void 0);
    assert.strictEqual(result, void 0);
    assert.strictEqual(agentHost.createCalls.length, 0);
    assert.strictEqual(provisional.get(ui), void 0);
  });
  test("getOrCreate does not spawn a backend provisional in an untrusted working directory folder", async () => {
    const workingDirectory = URI.from({ scheme: "file", path: "/untrusted-folder" });
    untrustedFolders.add(workingDirectory.toString());
    const ui = untitledChatUri("untrusted-folder");
    const result = await provisional.getOrCreate(ui, "copilot", workingDirectory);
    assert.strictEqual(result, void 0);
    assert.strictEqual(agentHost.createCalls.length, 0);
    assert.strictEqual(provisional.get(ui), void 0);
  });
  test("getOrCreate spawns a backend provisional in a trusted working directory folder", async () => {
    const workingDirectory = URI.from({ scheme: "file", path: "/trusted-folder" });
    const ui = untitledChatUri("trusted-folder");
    const result = await provisional.getOrCreate(ui, "copilot", workingDirectory);
    assert.deepStrictEqual({
      provider: result?.scheme,
      isOpaque: result?.path !== ui.path,
      createCount: agentHost.createCalls.length
    }, {
      provider: "copilot",
      isOpaque: true,
      createCount: 1
    });
  });
  test("applyConfigChange dispatches SessionConfigChanged before schema re-resolution completes", async () => {
    const ui = untitledChatUri("b");
    const blocked = new DeferredPromise();
    cleanup.add({ dispose: () => blocked.cancel() });
    agentHost.resolveQueue = [blocked.p];
    const promise = provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    await timeout(0);
    const configChanged = agentHost.dispatched.filter((action) => action.type === ActionType.SessionConfigChanged);
    assert.strictEqual(configChanged.length, 1, "dispatched before re-resolve await");
    assert.deepStrictEqual(configChanged[0].config, { isolation: "worktree" });
    assert.strictEqual(configChanged[0].channel, agentHost.createCalls[0].session?.toString());
    blocked.complete({ schema: makeSchema(false), values: { isolation: "worktree" } });
    await promise;
  });
  test("getResolvedConfig reflects the re-resolved schema/values after applyConfigChange", async () => {
    const ui = untitledChatUri("c");
    const resolved = {
      schema: makeSchema(false),
      values: { isolation: "worktree", branch: "main" }
    };
    agentHost.resolveQueue = [resolved];
    assert.strictEqual(provisional.getResolvedConfig(ui), void 0);
    await provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    const overlay = provisional.getResolvedConfig(ui);
    assert.deepStrictEqual(overlay?.schema, resolved.schema);
    assert.deepStrictEqual(overlay?.values, resolved.values);
    assert.strictEqual(agentHost.resolveCalls.length, 1);
    assert.deepStrictEqual(agentHost.resolveCalls[0].config, { isolation: "worktree" });
  });
  test("refreshResolvedConfig stores a schema overlay for running sessions", async () => {
    const ui = URI.from({ scheme: "agent-host-copilot", path: "/real-j" });
    const resolved = {
      schema: makeSchema(true),
      values: { isolation: "folder", branch: "main" }
    };
    agentHost.resolveQueue = [resolved];
    let changeFires = 0;
    cleanup.add(provisional.onDidChange((uri) => {
      if (uri.toString() === ui.toString()) {
        changeFires++;
      }
    }));
    await provisional.refreshResolvedConfig(ui, "copilot", void 0, { isolation: "folder" });
    assert.deepStrictEqual({
      overlay: provisional.getResolvedConfig(ui),
      changeFires,
      resolveConfig: agentHost.resolveCalls[0].config
    }, {
      overlay: resolved,
      changeFires: 1,
      resolveConfig: { isolation: "folder" }
    });
  });
  test("refreshResolvedConfig ignores stale running-session responses", async () => {
    const ui = URI.from({ scheme: "agent-host-copilot", path: "/real-k" });
    const first = new DeferredPromise();
    const second = new DeferredPromise();
    cleanup.add({ dispose: () => {
      first.cancel();
      second.cancel();
    } });
    agentHost.resolveQueue = [first.p, second.p];
    const a = provisional.refreshResolvedConfig(ui, "copilot", void 0, { isolation: "worktree" });
    const b = provisional.refreshResolvedConfig(ui, "copilot", void 0, { isolation: "folder" });
    first.complete({ schema: makeSchema(false), values: { isolation: "worktree" } });
    second.complete({ schema: makeSchema(true), values: { isolation: "folder" } });
    await a;
    await b;
    assert.deepStrictEqual(provisional.getResolvedConfig(ui), { schema: makeSchema(true), values: { isolation: "folder" } });
  });
  test("optimistic merge: overlay.values reflects partial before re-resolve completes", async () => {
    const ui = untitledChatUri("d");
    agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: "worktree", branch: "main" } }];
    await provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    assert.strictEqual(provisional.getResolvedConfig(ui)?.values?.["isolation"], "worktree");
    const blocked = new DeferredPromise();
    cleanup.add({ dispose: () => blocked.cancel() });
    agentHost.resolveQueue = [blocked.p];
    const promise = provisional.applyConfigChange(ui, "copilot", void 0, { branch: "feature/x" });
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    await timeout(0);
    const mid = provisional.getResolvedConfig(ui);
    assert.strictEqual(mid?.values?.["branch"], "feature/x", "overlay value updated optimistically");
    assert.strictEqual(mid?.values?.["isolation"], "worktree", "previous overlay values preserved");
    blocked.complete({ schema: makeSchema(false), values: { isolation: "worktree", branch: "feature/x" } });
    await promise;
  });
  test("racing applyConfigChange calls: the second one wins (sequencer order)", async () => {
    const ui = untitledChatUri("e");
    const first = new DeferredPromise();
    const second = new DeferredPromise();
    cleanup.add({ dispose: () => {
      first.cancel();
      second.cancel();
    } });
    agentHost.resolveQueue = [first.p, second.p];
    const a = provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    const b = provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "folder" });
    second.complete({ schema: makeSchema(true), values: { isolation: "folder", branch: "main" } });
    first.complete({ schema: makeSchema(false), values: { isolation: "worktree", branch: "main" } });
    await a;
    await b;
    const overlay = provisional.getResolvedConfig(ui);
    assert.strictEqual(overlay?.values?.["isolation"], "folder");
    assert.strictEqual(overlay?.schema.properties["branch"].readOnly, true);
  });
  test("equals check skips onDidChange when re-resolved config is identical", async () => {
    const ui = untitledChatUri("f");
    const result = {
      schema: makeSchema(false),
      values: { isolation: "worktree", branch: "main" }
    };
    agentHost.resolveQueue = [result, { schema: makeSchema(false), values: { isolation: "worktree", branch: "main" } }];
    await provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    let changeFires = 0;
    cleanup.add(provisional.onDidChange((uri) => {
      if (uri.toString() === ui.toString()) {
        changeFires++;
      }
    }));
    await provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    assert.strictEqual(changeFires, 0, "no onDidChange fire when overlay is unchanged");
  });
  test("tryRebind waits for pending config reconciliation", async () => {
    workspaceFolders = [URI.file("/workspace/one"), URI.file("/workspace/two")];
    workspaceConfiguration = URI.file("/workspace/demo.code-workspace");
    workspaceName = "Demo Workspace";
    workbenchState = WorkbenchState.WORKSPACE;
    const ui = untitledChatUri("g");
    const blocked = new DeferredPromise();
    cleanup.add({ dispose: () => blocked.cancel() });
    agentHost.resolveQueue = [blocked.p];
    void provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    await Promise.resolve();
    await Promise.resolve();
    await timeout(0);
    const newUi = URI.from({ scheme: "agent-host-copilot", path: "/real-g" });
    const rebind = provisional.tryRebind(ui, newUi, "copilot", void 0);
    assert.strictEqual(agentHost.createCalls.some((c) => c.session?.path === "/real-g"), false);
    blocked.complete({ schema: makeSchema(false), values: { isolation: "worktree" } });
    await rebind;
    const reboundCreate = agentHost.createCalls.find((c) => c.session?.path === "/real-g");
    assert.ok(reboundCreate, "rebind triggered a createSession");
    assert.deepStrictEqual({
      isolation: reboundCreate.config?.["isolation"],
      _meta: reboundCreate._meta
    }, {
      isolation: "worktree",
      _meta: {
        multiRoot: {
          workspaceFile: workspaceConfiguration.toString()
        }
      }
    });
  });
  test("tryRebind retries when config changes during final session creation", async () => {
    const ui = untitledChatUri("rebind-config-race");
    const realUi = URI.from({ scheme: "agent-host-copilot", path: "/real-config-race" });
    await provisional.getOrCreate(ui, "copilot", void 0);
    const oldBackend = provisional.get(ui);
    assert.ok(oldBackend);
    const gate = new DeferredPromise();
    cleanup.add({ dispose: () => gate.cancel() });
    agentHost.createGate = gate;
    const rebind = provisional.tryRebind(ui, realUi, "copilot", void 0);
    await timeout(0);
    const configChange = provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    gate.complete();
    const [rebound] = await Promise.all([rebind, configChange]);
    const finalCreates = agentHost.createCalls.filter((call) => call.session?.path === "/real-config-race");
    assert.deepStrictEqual({
      finalCreateCount: finalCreates.length,
      firstCandidateDisposed: agentHost.disposed.filter((uri) => uri.path === "/real-config-race").length,
      oldBackendDisposed: agentHost.disposed.some((uri) => uri.toString() === oldBackend.toString()),
      rebound: rebound?.toString(),
      current: provisional.get(realUi)?.toString(),
      finalConfig: finalCreates.at(-1)?.config
    }, {
      finalCreateCount: 2,
      firstCandidateDisposed: 1,
      oldBackendDisposed: true,
      rebound: URI.from({ scheme: "copilot", path: "/real-config-race" }).toString(),
      current: URI.from({ scheme: "copilot", path: "/real-config-race" }).toString(),
      finalConfig: { isolation: "worktree" }
    });
  });
  test("tryRebind disposes its candidate when the old entry is retired during creation", async () => {
    const ui = untitledChatUri("rebind-dispose-race");
    const realUi = URI.from({ scheme: "agent-host-copilot", path: "/real-dispose-race" });
    await provisional.getOrCreate(ui, "copilot", void 0);
    const oldBackend = provisional.get(ui);
    assert.ok(oldBackend);
    const gate = new DeferredPromise();
    cleanup.add({ dispose: () => gate.cancel() });
    agentHost.createGate = gate;
    const rebind = provisional.tryRebind(ui, realUi, "copilot", void 0);
    await timeout(0);
    const disposal = provisional.disposeSession(ui);
    gate.complete();
    const [rebound] = await Promise.all([rebind, disposal]);
    assert.deepStrictEqual({
      rebound,
      oldMapping: provisional.get(ui),
      newMapping: provisional.get(realUi),
      disposed: agentHost.disposed.map((uri) => uri.toString()).sort()
    }, {
      rebound: void 0,
      oldMapping: void 0,
      newMapping: void 0,
      disposed: [
        oldBackend.toString(),
        URI.from({ scheme: "copilot", path: "/real-dispose-race" }).toString()
      ].sort()
    });
  });
  test("tryRebind restores an imported conversation when final creation fails", async () => {
    const ui = untitledChatUri("rebind-import-failure");
    const realUi = URI.from({ scheme: "agent-host-copilot", path: "/real-import-failure" });
    await provisional.getOrCreate(ui, "copilot", void 0);
    const turn = { id: "turn", message: { text: "hello", origin: { kind: MessageKind.User } }, responseParts: [], usage: void 0, state: TurnState.Complete };
    const imported = { turns: [turn], model: { id: "test-model" } };
    importStore.set(realUi, imported);
    agentHost.failNextCreate = true;
    const rebound = await provisional.tryRebind(ui, realUi, "copilot", void 0);
    assert.deepStrictEqual({
      rebound,
      imported: importStore.take(realUi),
      disposed: agentHost.disposed.map((uri) => uri.toString())
    }, {
      rebound: void 0,
      imported,
      disposed: [URI.from({ scheme: "copilot", path: "/real-import-failure" }).toString()]
    });
  });
  test("tryRebind blocks deterministic URI reuse until failed disposal is retried", async () => {
    const ui = untitledChatUri("rebind-dispose-failure");
    const realUi = URI.from({ scheme: "agent-host-copilot", path: "/real-dispose-failure" });
    await provisional.getOrCreate(ui, "copilot", void 0);
    const gate = new DeferredPromise();
    cleanup.add({ dispose: () => gate.cancel() });
    agentHost.createGate = gate;
    const rebind = provisional.tryRebind(ui, realUi, "copilot", void 0);
    const pendingRead = provisional.waitForPending(ui);
    await timeout(0);
    agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: "worktree" } }];
    const configChange = provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    agentHost.failNextDispose = true;
    gate.complete();
    await assert.rejects(rebind, /Cannot safely retry rebound session/);
    assert.strictEqual(await pendingRead, void 0);
    await configChange;
    const reboundUri = URI.from({ scheme: "copilot", path: "/real-dispose-failure" });
    assert.deepStrictEqual({
      attempts: agentHost.disposeAttempts.filter((uri) => uri.toString() === reboundUri.toString()).length,
      disposed: agentHost.disposed.filter((uri) => uri.toString() === reboundUri.toString()).length
    }, {
      attempts: 1,
      disposed: 0
    });
    agentHost.fireAgentHostStart();
    await timeout(0);
    assert.strictEqual(agentHost.disposed.filter((uri) => uri.toString() === reboundUri.toString()).length, 1);
  });
  test("disposeSession drops the entry and its overlay", async () => {
    const ui = untitledChatUri("h");
    agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: "worktree" } }];
    await provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    assert.ok(provisional.getResolvedConfig(ui));
    await provisional.disposeSession(ui);
    assert.strictEqual(provisional.get(ui), void 0);
    assert.strictEqual(provisional.getResolvedConfig(ui), void 0);
    assert.strictEqual(agentHost.disposed.length, 1);
  });
  test("failed re-resolve preserves the previous overlay", async () => {
    const ui = untitledChatUri("i");
    agentHost.resolveQueue = [
      { schema: makeSchema(false), values: { isolation: "worktree" } },
      Promise.reject(new Error("boom"))
    ];
    await provisional.applyConfigChange(ui, "copilot", void 0, { isolation: "worktree" });
    const before = provisional.getResolvedConfig(ui);
    assert.ok(before);
    await provisional.applyConfigChange(ui, "copilot", void 0, { branch: "feature/x" });
    const after = provisional.getResolvedConfig(ui);
    assert.deepStrictEqual(after?.schema, before.schema, "schema unchanged after failed re-resolve");
    assert.strictEqual(after?.values?.["branch"], "feature/x");
  });
  async function flush() {
    for (let i = 0; i < 50; i++) {
      await Promise.resolve();
    }
    await timeout(0);
  }
  test("folder change recreates the provisional at the new cwd preserving config", async () => {
    const folderA = URI.file("/repoA");
    const folderB = URI.file("/repoB");
    const ui = untitledChatUri("cwd1");
    agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: "worktree" } }];
    await provisional.applyConfigChange(ui, "copilot", folderA, { isolation: "worktree" });
    assert.strictEqual(agentHost.createCalls.length, 1);
    const original = agentHost.createCalls[0].session;
    assert.ok(original);
    agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: "worktree" } }];
    folderService.setFolder(ui, folderB);
    await flush();
    const recreate = agentHost.createCalls[agentHost.createCalls.length - 1];
    assert.deepStrictEqual({
      createCount: agentHost.createCalls.length,
      disposedOld: agentHost.disposed.some((d) => d.toString() === original.toString()),
      recreatedWithFreshUri: recreate.session?.toString() !== original.toString(),
      currentSession: provisional.get(ui)?.toString(),
      recreatedCwd: recreate.workingDirectories?.[0]?.toString(),
      recreatedConfig: recreate.config?.["isolation"]
    }, {
      createCount: 2,
      disposedOld: true,
      recreatedWithFreshUri: true,
      currentSession: recreate.session?.toString(),
      recreatedCwd: folderB.toString(),
      recreatedConfig: "worktree"
    });
  });
  test("folder change listeners can wait for the queued replacement", async () => {
    const folderA = URI.file("/repoA");
    const folderB = URI.file("/repoB");
    const ui = untitledChatUri("cwd-listener");
    await provisional.getOrCreate(ui, "copilot", folderA);
    agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: "folder" } }];
    let pendingReplacement;
    cleanup.add(provisional.onDidChange((resource) => {
      if (!pendingReplacement && resource.toString() === ui.toString()) {
        pendingReplacement = provisional.waitForPending(ui);
      }
    }));
    folderService.setFolder(ui, folderB);
    assert.ok(pendingReplacement);
    const replacement = await pendingReplacement;
    assert.deepStrictEqual({
      replacement: replacement?.toString(),
      current: provisional.get(ui)?.toString(),
      cwd: agentHost.createCalls.at(-1)?.workingDirectories?.[0]?.toString()
    }, {
      replacement: agentHost.createCalls.at(-1)?.session?.toString(),
      current: agentHost.createCalls.at(-1)?.session?.toString(),
      cwd: folderB.toString()
    });
  });
  test("folder change to the same folder is a no-op", async () => {
    const folderA = URI.file("/repoA");
    const ui = untitledChatUri("cwd2");
    await provisional.getOrCreate(ui, "copilot", folderA);
    assert.strictEqual(agentHost.createCalls.length, 1);
    folderService.setFolder(ui, folderA);
    await flush();
    assert.strictEqual(agentHost.createCalls.length, 1, "no recreate for unchanged folder");
    assert.strictEqual(agentHost.disposed.length, 0);
  });
  test("rapid folder changes converge on the latest folder", async () => {
    const folderA = URI.file("/repoA");
    const folderB = URI.file("/repoB");
    const folderC = URI.file("/repoC");
    const ui = untitledChatUri("rapid");
    await provisional.getOrCreate(ui, "copilot", folderA);
    const original = provisional.get(ui);
    assert.ok(original);
    agentHost.resolveQueue = [
      { schema: makeSchema(false), values: { isolation: "folder" } },
      { schema: makeSchema(false), values: { isolation: "folder" } }
    ];
    folderService.setFolder(ui, folderB);
    folderService.setFolder(ui, folderC);
    await flush();
    assert.deepStrictEqual({
      createCount: agentHost.createCalls.length,
      current: provisional.get(ui)?.toString(),
      latestCwd: agentHost.createCalls.at(-1)?.workingDirectories?.[0]?.toString(),
      disposed: agentHost.disposed.map((uri) => uri.toString())
    }, {
      createCount: 2,
      current: agentHost.createCalls.at(-1)?.session?.toString(),
      latestCwd: folderC.toString(),
      disposed: [original.toString()]
    });
  });
  test("untrusted folder change retires the hidden generation and recreates on rollback", async () => {
    const folderA = URI.file("/repoA");
    const folderB = URI.file("/repoB");
    const ui = untitledChatUri("trust-change");
    await provisional.getOrCreate(ui, "copilot", folderA);
    const original = provisional.get(ui);
    assert.ok(original);
    untrustedFolders.add(folderB.toString());
    folderService.setFolder(ui, folderB);
    await flush();
    assert.deepStrictEqual({
      current: provisional.get(ui),
      disposed: agentHost.disposed.map((uri) => uri.toString()),
      createCount: agentHost.createCalls.length
    }, {
      current: void 0,
      disposed: [original.toString()],
      createCount: 1
    });
    agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: "folder" } }];
    folderService.setFolder(ui, folderA);
    await flush();
    assert.deepStrictEqual({
      current: provisional.get(ui)?.toString(),
      createCount: agentHost.createCalls.length,
      disposed: agentHost.disposed.map((uri) => uri.toString()),
      recreated: provisional.get(ui)?.toString() !== original.toString()
    }, {
      current: agentHost.createCalls.at(-1)?.session?.toString(),
      createCount: 2,
      disposed: [original.toString()],
      recreated: true
    });
  });
  test("failed folder replacement cleans up its candidate and recreates on retry", async () => {
    const folderA = URI.file("/repoA");
    const folderB = URI.file("/repoB");
    const ui = untitledChatUri("failed-change");
    await provisional.getOrCreate(ui, "copilot", folderA);
    const original = provisional.get(ui);
    assert.ok(original);
    agentHost.failNextCreate = true;
    folderService.setFolder(ui, folderB);
    await flush();
    const failedCandidate = agentHost.createCalls[1].session;
    assert.ok(failedCandidate);
    assert.deepStrictEqual({
      current: provisional.get(ui),
      disposed: agentHost.disposed.map((uri) => uri.toString()),
      createCount: agentHost.createCalls.length
    }, {
      current: void 0,
      disposed: [failedCandidate.toString(), original.toString()],
      createCount: 2
    });
    const retried = await provisional.getOrCreate(ui, "copilot", folderB);
    assert.deepStrictEqual({
      retried: retried?.toString(),
      latestCwd: agentHost.createCalls.at(-1)?.workingDirectories?.[0]?.toString(),
      disposed: agentHost.disposed.map((uri) => uri.toString())
    }, {
      retried: agentHost.createCalls.at(-1)?.session?.toString(),
      latestCwd: folderB.toString(),
      disposed: [failedCandidate.toString(), original.toString()]
    });
  });
  test("config changed during creation retires the stale candidate", async () => {
    const folder = URI.file("/repo");
    const ui = untitledChatUri("config-race");
    const gate = new DeferredPromise();
    cleanup.add({ dispose: () => gate.cancel() });
    agentHost.createGate = gate;
    const initialCreate = provisional.getOrCreate(ui, "copilot", folder);
    await timeout(0);
    agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: "worktree" } }];
    const configChange = provisional.applyConfigChange(ui, "copilot", folder, { isolation: "worktree" });
    gate.complete();
    await Promise.all([initialCreate, configChange]);
    const stale = agentHost.createCalls[0].session;
    const current = agentHost.createCalls.at(-1)?.session;
    assert.deepStrictEqual({
      createCount: agentHost.createCalls.length,
      staleDisposed: agentHost.disposed.map((uri) => uri.toString()),
      current: provisional.get(ui)?.toString(),
      currentConfig: agentHost.createCalls.at(-1)?.config,
      dispatchChannel: agentHost.dispatched.at(-1)?.channel
    }, {
      createCount: 2,
      staleDisposed: stale ? [stale.toString()] : [],
      current: current?.toString(),
      currentConfig: { isolation: "worktree" },
      dispatchChannel: current?.toString()
    });
  });
  test("dispose queued behind creation cannot publish or deadlock", async () => {
    const ui = untitledChatUri("dispose-race");
    const gate = new DeferredPromise();
    cleanup.add({ dispose: () => gate.cancel() });
    agentHost.createGate = gate;
    const creation = provisional.getOrCreate(ui, "copilot", URI.file("/repo"));
    await timeout(0);
    const disposal = provisional.disposeSession(ui);
    gate.complete();
    await Promise.all([creation, disposal]);
    const createdSession = agentHost.createCalls[0].session;
    assert.ok(createdSession);
    assert.deepStrictEqual({
      current: provisional.get(ui),
      createCount: agentHost.createCalls.length,
      disposed: agentHost.disposed.map((uri) => uri.toString())
    }, {
      current: void 0,
      createCount: 1,
      disposed: [createdSession.toString()]
    });
  });
  test("folder change with no provisional entry is a no-op", async () => {
    const ui = untitledChatUri("cwd3");
    folderService.setFolder(ui, URI.file("/repoB"));
    await flush();
    assert.strictEqual(agentHost.createCalls.length, 0);
    assert.strictEqual(provisional.get(ui), void 0);
  });
  test("derives the ordered working-directory set from the picked primary", async () => {
    const folderA = URI.file("/repoA");
    const folderB = URI.file("/repoB");
    const folderC = URI.file("/repoC");
    workspaceFolders = [folderA, folderB, folderC];
    agentHost.rootStateAgents = [agentInfo("copilot", true)];
    const multiRoot = untitledChatUri("multi");
    await provisional.getOrCreate(multiRoot, "copilot", folderB);
    workspaceFolders = [folderA];
    const singleRoot = untitledChatUri("single");
    await provisional.getOrCreate(singleRoot, "copilot", folderA);
    assert.deepStrictEqual({
      multiRoot: agentHost.createCalls[0].workingDirectories?.map((d) => d.toString()),
      singleRoot: agentHost.createCalls[1].workingDirectories?.map((d) => d.toString())
    }, {
      multiRoot: [folderB.toString(), folderA.toString(), folderC.toString()],
      singleRoot: [folderA.toString()]
    });
  });
  test("sends only the primary when the provider does not advertise multiple working directories", async () => {
    const folderA = URI.file("/repoA");
    const folderB = URI.file("/repoB");
    const folderC = URI.file("/repoC");
    workspaceFolders = [folderA, folderB, folderC];
    agentHost.rootStateAgents = [agentInfo("copilot", true)];
    const multi = untitledChatUri("cap-multi");
    await provisional.getOrCreate(multi, "copilot", folderB);
    agentHost.rootStateAgents = [agentInfo("copilot", false)];
    const single = untitledChatUri("cap-single");
    await provisional.getOrCreate(single, "copilot", folderB);
    assert.deepStrictEqual({
      advertising: agentHost.createCalls[0].workingDirectories?.map((d) => d.toString()),
      nonAdvertising: agentHost.createCalls[1].workingDirectories?.map((d) => d.toString())
    }, {
      advertising: [folderB.toString(), folderA.toString(), folderC.toString()],
      nonAdvertising: [folderB.toString()]
    });
  });
});
function agentInfo(provider, multipleWorkingDirectories) {
  return {
    provider,
    displayName: provider,
    description: "",
    models: [],
    capabilities: multipleWorkingDirectories ? { multipleWorkingDirectories: { immutablePrimary: true } } : {}
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnLCBJQWdlbnRIb3N0U2VydmljZSwgSUFnZW50UmVzb2x2ZVNlc3Npb25Db25maWdQYXJhbXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlLCB0eXBlIENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24sIHR5cGUgQ29uZmlnU2NoZW1hLCB0eXBlIFNlc3Npb25BY3RpdmVDbGllbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUZvbGRlciwgSVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudCwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTdWJzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL2FnZW50U3Vic2NyaXB0aW9uLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBUdXJuU3RhdGUsIHR5cGUgQWdlbnRJbmZvLCB0eXBlIFJvb3RTdGF0ZSwgdHlwZSBUdXJuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UsIElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZSwgSUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSwgSUFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZS5qcyc7XG5cbi8vIC0tLS0gTW9ja3MgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuaW50ZXJmYWNlIElEaXNwYXRjaGVkQWN0aW9uIHtcblx0cmVhZG9ubHkgY2hhbm5lbDogc3RyaW5nO1xuXHRyZWFkb25seSB0eXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbmZpZz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRyZWFkb25seSBhY3RpdmVDbGllbnQ/OiBTZXNzaW9uQWN0aXZlQ2xpZW50O1xufVxuXG5jbGFzcyBNb2NrQWdlbnRIb3N0U2VydmljZSBleHRlbmRzIG1vY2s8SUFnZW50SG9zdFNlcnZpY2U+KCkge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgY2xpZW50SWQgPSAndGVzdC1jbGllbnQnO1xuXG5cdHJlYWRvbmx5IGNyZWF0ZUNhbGxzOiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnW10gPSBbXTtcblx0cmVhZG9ubHkgZGlzcG9zZWQ6IFVSSVtdID0gW107XG5cdHJlYWRvbmx5IGRpc3BhdGNoZWQ6IElEaXNwYXRjaGVkQWN0aW9uW10gPSBbXTtcblx0cmVhZG9ubHkgcmVzb2x2ZUNhbGxzOiBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtc1tdID0gW107XG5cdHJlYWRvbmx5IGRpc3Bvc2VBdHRlbXB0czogVVJJW10gPSBbXTtcblx0Y3JlYXRlR2F0ZTogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRmYWlsTmV4dENyZWF0ZSA9IGZhbHNlO1xuXHRmYWlsTmV4dERpc3Bvc2UgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25BZ2VudEhvc3RTdGFydCA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uQWdlbnRIb3N0U3RhcnQgPSB0aGlzLl9vbkFnZW50SG9zdFN0YXJ0LmV2ZW50O1xuXG5cdC8qKiBBZ2VudHMgYWR2ZXJ0aXNlZCBieSB0aGUgKHN0dWJiZWQpIHJvb3Qgc3RhdGU7IGRyaXZlcyBjYXBhYmlsaXR5IGdhdGluZy4gKi9cblx0cm9vdFN0YXRlQWdlbnRzOiBBZ2VudEluZm9bXSA9IFtdO1xuXHRvdmVycmlkZSByZWFkb25seSByb290U3RhdGU6IElBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+ID0gKCgpID0+IHtcblx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0IHZhbHVlKCk6IFJvb3RTdGF0ZSB7IHJldHVybiB7IGFnZW50czogc2VsZi5yb290U3RhdGVBZ2VudHMgfSBhcyB1bmtub3duIGFzIFJvb3RTdGF0ZTsgfSxcblx0XHRcdHZlcmlmaWVkVmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0b25XaWxsQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRTdWJzY3JpcHRpb248Um9vdFN0YXRlPjtcblx0fSkoKTtcblxuXHQvKipcblx0ICogRWFjaCBlbnRyeSBpcyBjb25zdW1lZCBpbiBvcmRlciBieSB0aGUgbmV4dCBgcmVzb2x2ZVNlc3Npb25Db25maWdgIGNhbGwuXG5cdCAqIENhbGxlcnMgbWF5IHB1c2ggZGVmZXJyZWQgcHJvbWlzZXMgKGZvciByYWNlIHRlc3RzKSBvciByZXNvbHZlZCB2YWx1ZXMuXG5cdCAqL1xuXHRyZXNvbHZlUXVldWU6IChQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PiB8IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0KVtdID0gW107XG5cblx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlU2Vzc2lvbihjb25maWc/OiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKTogUHJvbWlzZTxVUkk+IHtcblx0XHRhc3NlcnQub2soY29uZmlnPy5zZXNzaW9uKTtcblx0XHR0aGlzLmNyZWF0ZUNhbGxzLnB1c2goY29uZmlnKTtcblx0XHRpZiAodGhpcy5mYWlsTmV4dENyZWF0ZSkge1xuXHRcdFx0dGhpcy5mYWlsTmV4dENyZWF0ZSA9IGZhbHNlO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdjcmVhdGUgZmFpbGVkJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGdhdGUgPSB0aGlzLmNyZWF0ZUdhdGU7XG5cdFx0dGhpcy5jcmVhdGVHYXRlID0gdW5kZWZpbmVkO1xuXHRcdGlmIChnYXRlKSB7XG5cdFx0XHRhd2FpdCBnYXRlLnA7XG5cdFx0fVxuXHRcdHJldHVybiBjb25maWcuc2Vzc2lvbjtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGRpc3Bvc2VTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGlzcG9zZUF0dGVtcHRzLnB1c2goc2Vzc2lvbik7XG5cdFx0aWYgKHRoaXMuZmFpbE5leHREaXNwb3NlKSB7XG5cdFx0XHR0aGlzLmZhaWxOZXh0RGlzcG9zZSA9IGZhbHNlO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdkaXNwb3NlIGZhaWxlZCcpO1xuXHRcdH1cblx0XHR0aGlzLmRpc3Bvc2VkLnB1c2goc2Vzc2lvbik7XG5cdH1cblxuXHRmaXJlQWdlbnRIb3N0U3RhcnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25BZ2VudEhvc3RTdGFydC5maXJlKCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uQWdlbnRIb3N0U3RhcnQuZGlzcG9zZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcGF0Y2goY2hhbm5lbDogUGFyYW1ldGVyczxJQWdlbnRIb3N0U2VydmljZVsnZGlzcGF0Y2gnXT5bMF0sIGFjdGlvbjogUGFyYW1ldGVyczxJQWdlbnRIb3N0U2VydmljZVsnZGlzcGF0Y2gnXT5bMV0pOiB2b2lkIHtcblx0XHR0aGlzLmRpc3BhdGNoZWQucHVzaCh7IGNoYW5uZWwsIC4uLmFjdGlvbiB9IGFzIElEaXNwYXRjaGVkQWN0aW9uKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVTZXNzaW9uQ29uZmlnKHBhcmFtczogSUFnZW50UmVzb2x2ZVNlc3Npb25Db25maWdQYXJhbXMpOiBQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PiB7XG5cdFx0dGhpcy5yZXNvbHZlQ2FsbHMucHVzaChwYXJhbXMpO1xuXHRcdGNvbnN0IG5leHQgPSB0aGlzLnJlc29sdmVRdWV1ZS5zaGlmdCgpO1xuXHRcdGlmICghbmV4dCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBxdWV1ZWQgcmVzb2x2ZVNlc3Npb25Db25maWcgcmVzcG9uc2UgKGNhbGwgIyR7dGhpcy5yZXNvbHZlQ2FsbHMubGVuZ3RofSlgKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5leHQ7XG5cdH1cbn1cblxuY2xhc3MgTW9ja0NoYXRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJQ2hhdFNlcnZpY2U+KCkge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWREaXNwb3NlU2Vzc2lvbiA9IEV2ZW50Lk5vbmU7XG59XG5cbi8vIC0tLS0gSGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gbWFrZVNjaGVtYShicmFuY2hSZWFkT25seTogYm9vbGVhbik6IENvbmZpZ1NjaGVtYSB7XG5cdHJldHVybiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0aXNvbGF0aW9uOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR0aXRsZTogJ0lzb2xhdGlvbicsXG5cdFx0XHRcdGVudW06IFsnZm9sZGVyJywgJ3dvcmt0cmVlJ10sXG5cdFx0XHRcdGRlZmF1bHQ6ICdmb2xkZXInLFxuXHRcdFx0fSxcblx0XHRcdGJyYW5jaDoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0dGl0bGU6ICdCcmFuY2gnLFxuXHRcdFx0XHRlbnVtOiBbJ21haW4nXSxcblx0XHRcdFx0ZGVmYXVsdDogJ21haW4nLFxuXHRcdFx0XHRyZWFkT25seTogYnJhbmNoUmVhZE9ubHksXG5cdFx0XHR9LFxuXHRcdH0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIHVudGl0bGVkQ2hhdFVyaShpZDogc3RyaW5nKTogVVJJIHtcblx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jb3BpbG90JywgcGF0aDogYC91bnRpdGxlZC0ke2lkfWAgfSk7XG59XG5cbmZ1bmN0aW9uIHdvcmtzcGFjZUZvbGRlcih1cmk6IFVSSSwgaW5kZXg6IG51bWJlcik6IElXb3Jrc3BhY2VGb2xkZXIge1xuXHRyZXR1cm4geyB1cmksIGluZGV4LCBuYW1lOiB1cmkucGF0aCwgdG9SZXNvdXJjZTogcmVsYXRpdmVQYXRoID0+IFVSSS5qb2luUGF0aCh1cmksIHJlbGF0aXZlUGF0aCkgfTtcbn1cblxuLy8gLS0tLSBUZXN0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5zdWl0ZSgnQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBhZ2VudEhvc3Q6IE1vY2tBZ2VudEhvc3RTZXJ2aWNlO1xuXHRsZXQgaW1wb3J0U3RvcmU6IEFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlO1xuXHRsZXQgcHJvdmlzaW9uYWw6IElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2U7XG5cdGxldCBmb2xkZXJTZXJ2aWNlOiBJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2U7XG5cdGxldCBjbGVhbnVwOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCB3b3Jrc3BhY2VUcnVzdGVkOiBib29sZWFuO1xuXHRsZXQgdW50cnVzdGVkRm9sZGVyczogU2V0PHN0cmluZz47XG5cdGxldCB3b3Jrc3BhY2VGb2xkZXJzOiBVUklbXTtcblx0bGV0IHdvcmtzcGFjZUNvbmZpZ3VyYXRpb246IFVSSSB8IG51bGw7XG5cdGxldCB3b3Jrc3BhY2VOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCB3b3JrYmVuY2hTdGF0ZTogV29ya2JlbmNoU3RhdGU7XG5cdGxldCBpc1Nlc3Npb25zV2luZG93OiBib29sZWFuO1xuXHRsZXQgY3VzdG9taXphdGlvbnM6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10+Pjtcblx0bGV0IG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVyczogRW1pdHRlcjxJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50PjtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0ID0gZHMuYWRkKG5ldyBNb2NrQWdlbnRIb3N0U2VydmljZSgpKTtcblx0XHR3b3Jrc3BhY2VUcnVzdGVkID0gdHJ1ZTtcblx0XHR1bnRydXN0ZWRGb2xkZXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0d29ya3NwYWNlRm9sZGVycyA9IFtdO1xuXHRcdHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24gPSBudWxsO1xuXHRcdHdvcmtzcGFjZU5hbWUgPSB1bmRlZmluZWQ7XG5cdFx0d29ya2JlbmNoU3RhdGUgPSBXb3JrYmVuY2hTdGF0ZS5FTVBUWTtcblx0XHRpc1Nlc3Npb25zV2luZG93ID0gZmFsc2U7XG5cdFx0b25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzID0gZHMuYWRkKG5ldyBFbWl0dGVyPElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQ+KCkpO1xuXHRcdGNvbnN0IGluc3RhID0gZHMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGEuc3R1YihJQWdlbnRIb3N0U2VydmljZSwgYWdlbnRIb3N0KTtcblx0XHRpbnN0YS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGEuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSk7XG5cdFx0aW5zdGEuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGEuc3R1YihJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLCB7IGdldCBpc1Nlc3Npb25zV2luZG93KCkgeyByZXR1cm4gaXNTZXNzaW9uc1dpbmRvdzsgfSB9IGFzIFBhcnRpYWw8SVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZT4pO1xuXHRcdGluc3RhLnN0dWIoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VDb250ZXh0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMgPSBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMuZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSBnZXRXb3Jrc3BhY2UoKTogSVdvcmtzcGFjZSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRcdGZvbGRlcnM6IHdvcmtzcGFjZUZvbGRlcnMubWFwKHVyaSA9PiAoeyB1cmkgfSBhcyBJV29ya3NwYWNlRm9sZGVyKSksXG5cdFx0XHRcdFx0Y29uZmlndXJhdGlvbjogd29ya3NwYWNlQ29uZmlndXJhdGlvbixcblx0XHRcdFx0XHRuYW1lOiB3b3Jrc3BhY2VOYW1lLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZ2V0V29ya2JlbmNoU3RhdGUoKTogV29ya2JlbmNoU3RhdGUgeyByZXR1cm4gd29ya2JlbmNoU3RhdGU7IH1cblx0XHR9KTtcblx0XHRpbnN0YS5zdHViKElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGlzV29ya3NwYWNlVHJ1c3RlZCgpOiBib29sZWFuIHsgcmV0dXJuIHdvcmtzcGFjZVRydXN0ZWQ7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldFVyaVRydXN0SW5mbyh1cmk6IFVSSSkgeyByZXR1cm4geyB1cmksIHRydXN0ZWQ6ICF1bnRydXN0ZWRGb2xkZXJzLmhhcyh1cmkudG9TdHJpbmcoKSkgfTsgfVxuXHRcdH0pO1xuXHRcdGZvbGRlclNlcnZpY2UgPSBkcy5hZGQoaW5zdGEuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UpKTtcblx0XHRpbnN0YS5zdHViKElBZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZSwgZm9sZGVyU2VydmljZSk7XG5cdFx0aW1wb3J0U3RvcmUgPSBuZXcgQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUoKTtcblx0XHRpbnN0YS5zdHViKElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSwgaW1wb3J0U3RvcmUpO1xuXHRcdGN1c3RvbWl6YXRpb25zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXT4oJ2N1c3RvbWl6YXRpb25zJywgW10pO1xuXHRcdGluc3RhLnN0dWIoSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UsIHtcblx0XHRcdGFjcXVpcmVTY29wZTogKF9zZXNzaW9uVHlwZTogc3RyaW5nLCBfcm9vdHM6IHJlYWRvbmx5IFVSSVtdKSA9PiAoe1xuXHRcdFx0XHRjdXN0b21pemF0aW9ucyxcblx0XHRcdFx0Y3VzdG9tQWdlbnRzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdFx0XHR0b29sczogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRcdFx0aXNSZXNvbHZlZDogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRcdFx0XHR3aGVuUmVzb2x2ZWQ6ICgpID0+IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IGNsaWVudElkID0+IGRlcml2ZWQocmVhZGVyID0+ICh7IGNsaWVudElkLCB0b29sczogW10sIGN1c3RvbWl6YXRpb25zOiBbLi4uY3VzdG9taXphdGlvbnMucmVhZChyZWFkZXIpXSB9KSksXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdH0gYXMgUGFydGlhbDxJQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZT4gYXMgSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UpO1xuXHRcdHByb3Zpc2lvbmFsID0gZHMuYWRkKGluc3RhLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSkpO1xuXHRcdGNsZWFudXAgPSBkcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0T3JDcmVhdGUgY3JlYXRlcyBvbmUgYmFja2VuZCBwcm92aXNpb25hbCBhbmQgcmV0dXJucyB0aGUgc2FtZSBVUkkgb24gcmVwZWF0IGNhbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5yZXNvbHZlUXVldWUgPSBbXTtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnYScpO1xuXHRcdGNvbnN0IFthLCBiXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHByb3Zpc2lvbmFsLmdldE9yQ3JlYXRlKHVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCksXG5cdFx0XHRwcm92aXNpb25hbC5nZXRPckNyZWF0ZSh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQpLFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvdmlkZXI6IGE/LnNjaGVtZSxcblx0XHRcdGlzT3BhcXVlOiBhPy5wYXRoICE9PSB1aS5wYXRoLFxuXHRcdFx0cmV1c2VkOiBiPy50b1N0cmluZygpID09PSBhPy50b1N0cmluZygpLFxuXHRcdFx0Y3JlYXRlQ291bnQ6IGFnZW50SG9zdC5jcmVhdGVDYWxscy5sZW5ndGgsXG5cdFx0XHRjb25maWc6IGFnZW50SG9zdC5jcmVhdGVDYWxsc1swXS5jb25maWcsXG5cdFx0fSwge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdGlzT3BhcXVlOiB0cnVlLFxuXHRcdFx0cmV1c2VkOiB0cnVlLFxuXHRcdFx0Y3JlYXRlQ291bnQ6IDEsXG5cdFx0XHRjb25maWc6IHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwdWJsaXNoZXMgYWN0aXZlLWNsaWVudCBjdXN0b21pemF0aW9ucyBiZWZvcmUgdGhlIGZpcnN0IHByb21wdCBhbmQga2VlcHMgdGhlbSB1cGRhdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0OiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uID0ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0aWQ6ICdwbHVnaW46Zmlyc3QnLFxuXHRcdFx0dXJpOiAnZmlsZTovLy9wbHVnaW5zL2ZpcnN0Jyxcblx0XHRcdG5hbWU6ICdGaXJzdCcsXG5cdFx0fTtcblx0XHRjb25zdCBzZWNvbmQ6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRpZDogJ3BsdWdpbjpzZWNvbmQnLFxuXHRcdFx0dXJpOiAnZmlsZTovLy9wbHVnaW5zL3NlY29uZCcsXG5cdFx0XHRuYW1lOiAnU2Vjb25kJyxcblx0XHR9O1xuXHRcdGN1c3RvbWl6YXRpb25zLnNldChbZmlyc3RdLCB1bmRlZmluZWQpO1xuXG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodW50aXRsZWRDaGF0VXJpKCdjdXN0b21pemF0aW9ucycpLCAnY29waWxvdCcsIHVuZGVmaW5lZCk7XG5cdFx0Y3VzdG9taXphdGlvbnMuc2V0KFtmaXJzdCwgc2Vjb25kXSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0LmRpc3BhdGNoZWRcblx0XHRcdC5maWx0ZXIoYWN0aW9uID0+IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQpXG5cdFx0XHQubWFwKGFjdGlvbiA9PiBhY3Rpb24uYWN0aXZlQ2xpZW50KSwgW3tcblx0XHRcdFx0Y2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsXG5cdFx0XHRcdHRvb2xzOiBbXSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFtmaXJzdF0sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNsaWVudElkOiAndGVzdC1jbGllbnQnLFxuXHRcdFx0XHR0b29sczogW10sXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbZmlyc3QsIHNlY29uZF0sXG5cdFx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE9yQ3JlYXRlIGluY2x1ZGVzIEVkaXRvciBtdWx0aS1yb290IHdvcmtzcGFjZSBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHR3b3Jrc3BhY2VGb2xkZXJzID0gW1VSSS5maWxlKCcvd29ya3NwYWNlL29uZScpXTtcblx0XHR3b3Jrc3BhY2VDb25maWd1cmF0aW9uID0gVVJJLnBhcnNlKCd2c2NvZGUtcmVtb3RlOi8vc3NoLXJlbW90ZStob3N0L3dvcmsvZGVtby5jb2RlLXdvcmtzcGFjZScpO1xuXHRcdHdvcmtzcGFjZU5hbWUgPSAnRGVtbyBXb3Jrc3BhY2UnO1xuXHRcdHdvcmtiZW5jaFN0YXRlID0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFO1xuXG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodW50aXRsZWRDaGF0VXJpKCdtdWx0aS1yb290JyksICdjb3BpbG90Jywgd29ya3NwYWNlRm9sZGVyc1swXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdC5jcmVhdGVDYWxsc1swXS5fbWV0YSwge1xuXHRcdFx0bXVsdGlSb290OiB7XG5cdFx0XHRcdHdvcmtzcGFjZUZpbGU6IHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24udG9TdHJpbmcoKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmtzcGFjZSBmb2xkZXIgY2hhbmdlcyByZWNyZWF0ZSBhIG11bHRpLXJvb3QgcHJvdmlzaW9uYWwgd2l0aCB0aGUgbGF0ZXN0IHNlY29uZGFyeSBzZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJpbWFyeSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL29uZScpO1xuXHRcdGNvbnN0IHNlY29uZGFyeSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3R3bycpO1xuXHRcdGNvbnN0IGFkZGVkID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdGhyZWUnKTtcblx0XHR3b3Jrc3BhY2VGb2xkZXJzID0gW3ByaW1hcnksIHNlY29uZGFyeV07XG5cdFx0d29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2RlbW8uY29kZS13b3Jrc3BhY2UnKTtcblx0XHR3b3JrYmVuY2hTdGF0ZSA9IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTtcblx0XHRhZ2VudEhvc3Qucm9vdFN0YXRlQWdlbnRzID0gW2FnZW50SW5mbygnY29waWxvdCcsIHRydWUpXTtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnbXVsdGktcm9vdC1mb2xkZXItY2hhbmdlcycpO1xuXG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodWksICdjb3BpbG90JywgcHJpbWFyeSk7XG5cdFx0d29ya3NwYWNlRm9sZGVycyA9IFtzZWNvbmRhcnksIGFkZGVkXTtcblx0XHRvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMuZmlyZSh7XG5cdFx0XHRhZGRlZDogW3dvcmtzcGFjZUZvbGRlcihhZGRlZCwgMSldLFxuXHRcdFx0cmVtb3ZlZDogW3dvcmtzcGFjZUZvbGRlcihwcmltYXJ5LCAwKV0sXG5cdFx0XHRjaGFuZ2VkOiBbXSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLndhaXRGb3JQZW5kaW5nKHVpKTtcblx0XHR3b3Jrc3BhY2VGb2xkZXJzID0gW2FkZGVkLCBzZWNvbmRhcnldO1xuXHRcdG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycy5maXJlKHtcblx0XHRcdGFkZGVkOiBbXSxcblx0XHRcdHJlbW92ZWQ6IFtdLFxuXHRcdFx0Y2hhbmdlZDogW3dvcmtzcGFjZUZvbGRlcihhZGRlZCwgMCksIHdvcmtzcGFjZUZvbGRlcihzZWNvbmRhcnksIDEpXSxcblx0XHR9KTtcblx0XHRhd2FpdCBwcm92aXNpb25hbC53YWl0Rm9yUGVuZGluZyh1aSk7XG5cdFx0Y29uc3QgYWZ0ZXJSZW9yZGVyQ291bnQgPSBhZ2VudEhvc3QuY3JlYXRlQ2FsbHMubGVuZ3RoO1xuXHRcdHdvcmtzcGFjZUZvbGRlcnMgPSBbYWRkZWRdO1xuXHRcdG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycy5maXJlKHtcblx0XHRcdGFkZGVkOiBbXSxcblx0XHRcdHJlbW92ZWQ6IFt3b3Jrc3BhY2VGb2xkZXIoc2Vjb25kYXJ5LCAxKV0sXG5cdFx0XHRjaGFuZ2VkOiBbXSxcblx0XHR9KTtcblx0XHRhd2FpdCBwcm92aXNpb25hbC53YWl0Rm9yUGVuZGluZyh1aSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogYWdlbnRIb3N0LmNyZWF0ZUNhbGxzLm1hcChjYWxsID0+IGNhbGwud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS50b1N0cmluZygpKSksXG5cdFx0XHRhZnRlclJlb3JkZXJDb3VudCxcblx0XHR9LCB7XG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtcblx0XHRcdFx0W3ByaW1hcnkudG9TdHJpbmcoKSwgc2Vjb25kYXJ5LnRvU3RyaW5nKCldLFxuXHRcdFx0XHRbcHJpbWFyeS50b1N0cmluZygpLCBzZWNvbmRhcnkudG9TdHJpbmcoKSwgYWRkZWQudG9TdHJpbmcoKV0sXG5cdFx0XHRcdFtwcmltYXJ5LnRvU3RyaW5nKCksIGFkZGVkLnRvU3RyaW5nKCldLFxuXHRcdFx0XSxcblx0XHRcdGFmdGVyUmVvcmRlckNvdW50OiAyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHNpbmdsZS1mb2xkZXIgZHJhZnQgYWRvcHRzIHNlY29uZGFyeSByb290cyB3aGVuIHRoZSB3b3Jrc3BhY2UgYmVjb21lcyBtdWx0aS1yb290JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByaW1hcnkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9vbmUnKTtcblx0XHRjb25zdCBhZGRlZCA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3R3bycpO1xuXHRcdHdvcmtzcGFjZUZvbGRlcnMgPSBbcHJpbWFyeV07XG5cdFx0d29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2RlbW8uY29kZS13b3Jrc3BhY2UnKTtcblx0XHR3b3JrYmVuY2hTdGF0ZSA9IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTtcblx0XHRhZ2VudEhvc3Qucm9vdFN0YXRlQWdlbnRzID0gW2FnZW50SW5mbygnY29waWxvdCcsIHRydWUpXTtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnc2luZ2xlLXRvLW11bHRpLXJvb3QnKTtcblxuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmdldE9yQ3JlYXRlKHVpLCAnY29waWxvdCcsIHByaW1hcnkpO1xuXHRcdHdvcmtzcGFjZUZvbGRlcnMgPSBbcHJpbWFyeSwgYWRkZWRdO1xuXHRcdG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycy5maXJlKHtcblx0XHRcdGFkZGVkOiBbd29ya3NwYWNlRm9sZGVyKGFkZGVkLCAxKV0sXG5cdFx0XHRyZW1vdmVkOiBbXSxcblx0XHRcdGNoYW5nZWQ6IFtdLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLndhaXRGb3JQZW5kaW5nKHVpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhZ2VudEhvc3QuY3JlYXRlQ2FsbHMubWFwKGNhbGwgPT4gY2FsbC53b3JraW5nRGlyZWN0b3JpZXM/Lm1hcChkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LnRvU3RyaW5nKCkpKSxcblx0XHRcdFtcblx0XHRcdFx0W3ByaW1hcnkudG9TdHJpbmcoKV0sXG5cdFx0XHRcdFtwcmltYXJ5LnRvU3RyaW5nKCksIGFkZGVkLnRvU3RyaW5nKCldLFxuXHRcdFx0XSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cnlSZWJpbmQgcmVjb21wdXRlcyB0aGUgbGF0ZXN0IG11bHRpLXJvb3QgZm9sZGVyIHNldCB3aXRob3V0IHJlbHlpbmcgb24gYSB3b3Jrc3BhY2UgZXZlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJpbWFyeSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL29uZScpO1xuXHRcdGNvbnN0IHNlY29uZGFyeSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3R3bycpO1xuXHRcdGNvbnN0IGFkZGVkID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdGhyZWUnKTtcblx0XHR3b3Jrc3BhY2VGb2xkZXJzID0gW3ByaW1hcnksIHNlY29uZGFyeV07XG5cdFx0d29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2RlbW8uY29kZS13b3Jrc3BhY2UnKTtcblx0XHR3b3JrYmVuY2hTdGF0ZSA9IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTtcblx0XHRhZ2VudEhvc3Qucm9vdFN0YXRlQWdlbnRzID0gW2FnZW50SW5mbygnY29waWxvdCcsIHRydWUpXTtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnbXVsdGktcm9vdC1yZWJpbmQnKTtcblx0XHRjb25zdCByZWFsID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudC1ob3N0LWNvcGlsb3QnLCBwYXRoOiAnL3JlYWwtbXVsdGktcm9vdC1yZWJpbmQnIH0pO1xuXG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodWksICdjb3BpbG90JywgcHJpbWFyeSk7XG5cdFx0d29ya3NwYWNlRm9sZGVycyA9IFtzZWNvbmRhcnksIGFkZGVkXTtcblx0XHRhd2FpdCBwcm92aXNpb25hbC50cnlSZWJpbmQodWksIHJlYWwsICdjb3BpbG90JywgcHJpbWFyeSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0YWdlbnRIb3N0LmNyZWF0ZUNhbGxzLmF0KC0xKT8ud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS50b1N0cmluZygpKSxcblx0XHRcdFtwcmltYXJ5LnRvU3RyaW5nKCksIHNlY29uZGFyeS50b1N0cmluZygpLCBhZGRlZC50b1N0cmluZygpXSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cnlSZWJpbmQgcHJvbW90ZXMgYSBzaW5nbGUtZm9sZGVyIGRyYWZ0IHdoZW4gYSBzZWNvbmQgZm9sZGVyIGFwcGVhcnMgd2l0aG91dCBhIHdvcmtzcGFjZSBldmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmltYXJ5ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2Uvb25lJyk7XG5cdFx0Y29uc3QgYWRkZWQgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS90d28nKTtcblx0XHR3b3Jrc3BhY2VGb2xkZXJzID0gW3ByaW1hcnldO1xuXHRcdHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24gPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9kZW1vLmNvZGUtd29ya3NwYWNlJyk7XG5cdFx0d29ya2JlbmNoU3RhdGUgPSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0U7XG5cdFx0YWdlbnRIb3N0LnJvb3RTdGF0ZUFnZW50cyA9IFthZ2VudEluZm8oJ2NvcGlsb3QnLCB0cnVlKV07XG5cdFx0Y29uc3QgdWkgPSB1bnRpdGxlZENoYXRVcmkoJ3NpbmdsZS10by1tdWx0aS1yb290LXJlYmluZCcpO1xuXHRcdGNvbnN0IHJlYWwgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdCcsIHBhdGg6ICcvcmVhbC1zaW5nbGUtdG8tbXVsdGktcm9vdC1yZWJpbmQnIH0pO1xuXG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodWksICdjb3BpbG90JywgcHJpbWFyeSk7XG5cdFx0d29ya3NwYWNlRm9sZGVycyA9IFtwcmltYXJ5LCBhZGRlZF07XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwudHJ5UmViaW5kKHVpLCByZWFsLCAnY29waWxvdCcsIHByaW1hcnkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGFnZW50SG9zdC5jcmVhdGVDYWxscy5tYXAoY2FsbCA9PiBjYWxsLndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkudG9TdHJpbmcoKSkpLFxuXHRcdFx0W1xuXHRcdFx0XHRbcHJpbWFyeS50b1N0cmluZygpXSxcblx0XHRcdFx0W3ByaW1hcnkudG9TdHJpbmcoKSwgYWRkZWQudG9TdHJpbmcoKV0sXG5cdFx0XHRdLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE9yQ3JlYXRlIG9taXRzIG11bHRpLXJvb3QgbWV0YWRhdGEgd2l0aG91dCBhIHdvcmtzcGFjZSBjb25maWd1cmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdHdvcmtzcGFjZUZvbGRlcnMgPSBbVVJJLmZpbGUoJy93b3Jrc3BhY2Uvb25lJyksIFVSSS5maWxlKCcvd29ya3NwYWNlL3R3bycpXTtcblx0XHR3b3JrYmVuY2hTdGF0ZSA9IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTtcblxuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmdldE9yQ3JlYXRlKHVudGl0bGVkQ2hhdFVyaSgnbXVsdGktcm9vdC1uby1jb25maWcnKSwgJ2NvcGlsb3QnLCB3b3Jrc3BhY2VGb2xkZXJzWzBdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuY3JlYXRlQ2FsbHNbMF0uX21ldGEsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE9yQ3JlYXRlIG9taXRzIG11bHRpLXJvb3QgbWV0YWRhdGEgaW4gdGhlIEFnZW50cyB3aW5kb3cnLCBhc3luYyAoKSA9PiB7XG5cdFx0d29ya3NwYWNlRm9sZGVycyA9IFtVUkkuZmlsZSgnL3dvcmtzcGFjZS9vbmUnKSwgVVJJLmZpbGUoJy93b3Jrc3BhY2UvdHdvJyldO1xuXHRcdHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24gPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9kZW1vLmNvZGUtd29ya3NwYWNlJyk7XG5cdFx0d29ya2JlbmNoU3RhdGUgPSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0U7XG5cdFx0aXNTZXNzaW9uc1dpbmRvdyA9IHRydWU7XG5cblx0XHRhd2FpdCBwcm92aXNpb25hbC5nZXRPckNyZWF0ZSh1bnRpdGxlZENoYXRVcmkoJ2FnZW50cy13aW5kb3cnKSwgJ2NvcGlsb3QnLCB3b3Jrc3BhY2VGb2xkZXJzWzBdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuY3JlYXRlQ2FsbHNbMF0uX21ldGEsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE9yQ3JlYXRlIGRvZXMgbm90IHNwYXduIGEgYmFja2VuZCBwcm92aXNpb25hbCBpbiBhbiB1bnRydXN0ZWQgd29ya3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdHdvcmtzcGFjZVRydXN0ZWQgPSBmYWxzZTtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgndW50cnVzdGVkJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodWksICdjb3BpbG90JywgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuY3JlYXRlQ2FsbHMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlzaW9uYWwuZ2V0KHVpKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0T3JDcmVhdGUgZG9lcyBub3Qgc3Bhd24gYSBiYWNrZW5kIHByb3Zpc2lvbmFsIGluIGFuIHVudHJ1c3RlZCB3b3JraW5nIGRpcmVjdG9yeSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gV29ya3NwYWNlIGlzIHRydXN0ZWQsIGJ1dCB0aGUgdGFyZ2V0IHdvcmtpbmcgZGlyZWN0b3J5IGlzIGFcblx0XHQvLyBzdGFuZGFsb25lIHVudHJ1c3RlZCBmb2xkZXIgKGUuZy4gYSBwZXItc2Vzc2lvbiBmb2xkZXIgb3V0c2lkZSB0aGVcblx0XHQvLyBvcGVuIHdvcmtzcGFjZSkuXG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvdW50cnVzdGVkLWZvbGRlcicgfSk7XG5cdFx0dW50cnVzdGVkRm9sZGVycy5hZGQod29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpKTtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgndW50cnVzdGVkLWZvbGRlcicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3Zpc2lvbmFsLmdldE9yQ3JlYXRlKHVpLCAnY29waWxvdCcsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5jcmVhdGVDYWxscy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aXNpb25hbC5nZXQodWkpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRPckNyZWF0ZSBzcGF3bnMgYSBiYWNrZW5kIHByb3Zpc2lvbmFsIGluIGEgdHJ1c3RlZCB3b3JraW5nIGRpcmVjdG9yeSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvdHJ1c3RlZC1mb2xkZXInIH0pO1xuXHRcdGNvbnN0IHVpID0gdW50aXRsZWRDaGF0VXJpKCd0cnVzdGVkLWZvbGRlcicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3Zpc2lvbmFsLmdldE9yQ3JlYXRlKHVpLCAnY29waWxvdCcsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvdmlkZXI6IHJlc3VsdD8uc2NoZW1lLFxuXHRcdFx0aXNPcGFxdWU6IHJlc3VsdD8ucGF0aCAhPT0gdWkucGF0aCxcblx0XHRcdGNyZWF0ZUNvdW50OiBhZ2VudEhvc3QuY3JlYXRlQ2FsbHMubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRpc09wYXF1ZTogdHJ1ZSxcblx0XHRcdGNyZWF0ZUNvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseUNvbmZpZ0NoYW5nZSBkaXNwYXRjaGVzIFNlc3Npb25Db25maWdDaGFuZ2VkIGJlZm9yZSBzY2hlbWEgcmUtcmVzb2x1dGlvbiBjb21wbGV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdWkgPSB1bnRpdGxlZENoYXRVcmkoJ2InKTtcblx0XHQvLyBSZXNvbHZlIG5ldmVyIHJldHVybnMgXHUyMDE0IHByb3ZlcyBtdXRhdGUrZGlzcGF0Y2ggaGFwcGVuIGJlZm9yZSB0aGVcblx0XHQvLyByZS1yZXNvbHZlIGF3YWl0LlxuXHRcdGNvbnN0IGJsb2NrZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PigpO1xuXHRcdGNsZWFudXAuYWRkKHsgZGlzcG9zZTogKCkgPT4gYmxvY2tlZC5jYW5jZWwoKSB9KTtcblx0XHRhZ2VudEhvc3QucmVzb2x2ZVF1ZXVlID0gW2Jsb2NrZWQucF07XG5cblx0XHRjb25zdCBwcm9taXNlID0gcHJvdmlzaW9uYWwuYXBwbHlDb25maWdDaGFuZ2UodWksICdjb3BpbG90JywgdW5kZWZpbmVkLCB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9KTtcblx0XHQvLyBZaWVsZCBlbm91Z2ggbWljcm90YXNrcyBmb3IgZ2V0T3JDcmVhdGUncyBzZXF1ZW5jZXIgKyBjcmVhdGVTZXNzaW9uXG5cdFx0Ly8gdG8gc2V0dGxlIGFuZCBhcHBseUNvbmZpZ0NoYW5nZSdzIHN5bmNocm9ub3VzIHByZWx1ZGUgKG11dGF0ZSArXG5cdFx0Ly8gZGlzcGF0Y2gpIHRvIHJ1bi4gVGhlIHJlLXJlc29sdmUgYXdhaXQgYmxvY2tzIGluZGVmaW5pdGVseS5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDIwOyBpKyspIHtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gRGlzcGF0Y2ggc2hvdWxkIGhhdmUgaGFwcGVuZWQgYmVmb3JlIHRoZSBwcm9taXNlIHJlc29sdmVzIChyZS1yZXNvbHZlXG5cdFx0Ly8gaXMgc3RpbGwgYmxvY2tlZCkuXG5cdFx0Y29uc3QgY29uZmlnQ2hhbmdlZCA9IGFnZW50SG9zdC5kaXNwYXRjaGVkLmZpbHRlcihhY3Rpb24gPT4gYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWdDaGFuZ2VkLmxlbmd0aCwgMSwgJ2Rpc3BhdGNoZWQgYmVmb3JlIHJlLXJlc29sdmUgYXdhaXQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ0NoYW5nZWRbMF0uY29uZmlnLCB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnQ2hhbmdlZFswXS5jaGFubmVsLCBhZ2VudEhvc3QuY3JlYXRlQ2FsbHNbMF0uc2Vzc2lvbj8udG9TdHJpbmcoKSk7XG5cblx0XHQvLyBVbmJsb2NrIHNvIHRoZSBxdWV1ZWQgcmUtcmVzb2x2ZSBjb21wbGV0ZXMgYW5kIHRoZSBvdXRlciBwcm9taXNlIHNldHRsZXMuXG5cdFx0YmxvY2tlZC5jb21wbGV0ZSh7IHNjaGVtYTogbWFrZVNjaGVtYShmYWxzZSksIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSB9KTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRSZXNvbHZlZENvbmZpZyByZWZsZWN0cyB0aGUgcmUtcmVzb2x2ZWQgc2NoZW1hL3ZhbHVlcyBhZnRlciBhcHBseUNvbmZpZ0NoYW5nZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnYycpO1xuXHRcdGNvbnN0IHJlc29sdmVkOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCA9IHtcblx0XHRcdHNjaGVtYTogbWFrZVNjaGVtYShmYWxzZSksXG5cdFx0XHR2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnLCBicmFuY2g6ICdtYWluJyB9LFxuXHRcdH07XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVRdWV1ZSA9IFtyZXNvbHZlZF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlzaW9uYWwuZ2V0UmVzb2x2ZWRDb25maWcodWkpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmFwcGx5Q29uZmlnQ2hhbmdlKHVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCwgeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSk7XG5cblx0XHRjb25zdCBvdmVybGF5ID0gcHJvdmlzaW9uYWwuZ2V0UmVzb2x2ZWRDb25maWcodWkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3ZlcmxheT8uc2NoZW1hLCByZXNvbHZlZC5zY2hlbWEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3ZlcmxheT8udmFsdWVzLCByZXNvbHZlZC52YWx1ZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QucmVzb2x2ZUNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3QucmVzb2x2ZUNhbGxzWzBdLmNvbmZpZywgeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hSZXNvbHZlZENvbmZpZyBzdG9yZXMgYSBzY2hlbWEgb3ZlcmxheSBmb3IgcnVubmluZyBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1aSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jb3BpbG90JywgcGF0aDogJy9yZWFsLWonIH0pO1xuXHRcdGNvbnN0IHJlc29sdmVkOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCA9IHtcblx0XHRcdHNjaGVtYTogbWFrZVNjaGVtYSh0cnVlKSxcblx0XHRcdHZhbHVlczogeyBpc29sYXRpb246ICdmb2xkZXInLCBicmFuY2g6ICdtYWluJyB9LFxuXHRcdH07XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVRdWV1ZSA9IFtyZXNvbHZlZF07XG5cblx0XHRsZXQgY2hhbmdlRmlyZXMgPSAwO1xuXHRcdGNsZWFudXAuYWRkKHByb3Zpc2lvbmFsLm9uRGlkQ2hhbmdlKHVyaSA9PiB7IGlmICh1cmkudG9TdHJpbmcoKSA9PT0gdWkudG9TdHJpbmcoKSkgeyBjaGFuZ2VGaXJlcysrOyB9IH0pKTtcblxuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLnJlZnJlc2hSZXNvbHZlZENvbmZpZyh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQsIHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3ZlcmxheTogcHJvdmlzaW9uYWwuZ2V0UmVzb2x2ZWRDb25maWcodWkpLFxuXHRcdFx0Y2hhbmdlRmlyZXMsXG5cdFx0XHRyZXNvbHZlQ29uZmlnOiBhZ2VudEhvc3QucmVzb2x2ZUNhbGxzWzBdLmNvbmZpZyxcblx0XHR9LCB7XG5cdFx0XHRvdmVybGF5OiByZXNvbHZlZCxcblx0XHRcdGNoYW5nZUZpcmVzOiAxLFxuXHRcdFx0cmVzb2x2ZUNvbmZpZzogeyBpc29sYXRpb246ICdmb2xkZXInIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hSZXNvbHZlZENvbmZpZyBpZ25vcmVzIHN0YWxlIHJ1bm5pbmctc2Vzc2lvbiByZXNwb25zZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdWkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdCcsIHBhdGg6ICcvcmVhbC1rJyB9KTtcblx0XHRjb25zdCBmaXJzdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+KCk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbmV3IERlZmVycmVkUHJvbWlzZTxSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4oKTtcblx0XHRjbGVhbnVwLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHsgZmlyc3QuY2FuY2VsKCk7IHNlY29uZC5jYW5jZWwoKTsgfSB9KTtcblx0XHRhZ2VudEhvc3QucmVzb2x2ZVF1ZXVlID0gW2ZpcnN0LnAsIHNlY29uZC5wXTtcblxuXHRcdGNvbnN0IGEgPSBwcm92aXNpb25hbC5yZWZyZXNoUmVzb2x2ZWRDb25maWcodWksICdjb3BpbG90JywgdW5kZWZpbmVkLCB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9KTtcblx0XHRjb25zdCBiID0gcHJvdmlzaW9uYWwucmVmcmVzaFJlc29sdmVkQ29uZmlnKHVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCwgeyBpc29sYXRpb246ICdmb2xkZXInIH0pO1xuXG5cdFx0Zmlyc3QuY29tcGxldGUoeyBzY2hlbWE6IG1ha2VTY2hlbWEoZmFsc2UpLCB2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0gfSk7XG5cdFx0c2Vjb25kLmNvbXBsZXRlKHsgc2NoZW1hOiBtYWtlU2NoZW1hKHRydWUpLCB2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9IH0pO1xuXG5cdFx0YXdhaXQgYTtcblx0XHRhd2FpdCBiO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aXNpb25hbC5nZXRSZXNvbHZlZENvbmZpZyh1aSksIHsgc2NoZW1hOiBtYWtlU2NoZW1hKHRydWUpLCB2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9IH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcHRpbWlzdGljIG1lcmdlOiBvdmVybGF5LnZhbHVlcyByZWZsZWN0cyBwYXJ0aWFsIGJlZm9yZSByZS1yZXNvbHZlIGNvbXBsZXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnZCcpO1xuXHRcdC8vIEZpcnN0IGFwcGx5Q29uZmlnQ2hhbmdlOiBzZWVkIGFuIG92ZXJsYXkuXG5cdFx0YWdlbnRIb3N0LnJlc29sdmVRdWV1ZSA9IFt7IHNjaGVtYTogbWFrZVNjaGVtYShmYWxzZSksIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nIH0gfV07XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuYXBwbHlDb25maWdDaGFuZ2UodWksICdjb3BpbG90JywgdW5kZWZpbmVkLCB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlzaW9uYWwuZ2V0UmVzb2x2ZWRDb25maWcodWkpPy52YWx1ZXM/LlsnaXNvbGF0aW9uJ10sICd3b3JrdHJlZScpO1xuXG5cdFx0Ly8gU2Vjb25kIGFwcGx5Q29uZmlnQ2hhbmdlOiBibG9jayB0aGUgcmUtcmVzb2x2ZSBhbmQgYXNzZXJ0IHRoYXQgdGhlXG5cdFx0Ly8gb3ZlcmxheSdzIGB2YWx1ZXNgIHJlZmxlY3RzIHRoZSBuZXcgcGFydGlhbCAqYmVmb3JlKiB0aGUgcmUtcmVzb2x2ZVxuXHRcdC8vIHJldHVybnMuIFRoaXMgaXMgd2hhdCBrZWVwcyB0aGUgcGlja2VyIGZyb20gcmVuZGVyaW5nIGEgc3RhbGUgdmFsdWVcblx0XHQvLyBkdXJpbmcgdGhlIHJvdW5kLXRyaXAuXG5cdFx0Y29uc3QgYmxvY2tlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+KCk7XG5cdFx0Y2xlYW51cC5hZGQoeyBkaXNwb3NlOiAoKSA9PiBibG9ja2VkLmNhbmNlbCgpIH0pO1xuXHRcdGFnZW50SG9zdC5yZXNvbHZlUXVldWUgPSBbYmxvY2tlZC5wXTtcblxuXHRcdGNvbnN0IHByb21pc2UgPSBwcm92aXNpb25hbC5hcHBseUNvbmZpZ0NoYW5nZSh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQsIHsgYnJhbmNoOiAnZmVhdHVyZS94JyB9KTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDIwOyBpKyspIHtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3QgbWlkID0gcHJvdmlzaW9uYWwuZ2V0UmVzb2x2ZWRDb25maWcodWkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaWQ/LnZhbHVlcz8uWydicmFuY2gnXSwgJ2ZlYXR1cmUveCcsICdvdmVybGF5IHZhbHVlIHVwZGF0ZWQgb3B0aW1pc3RpY2FsbHknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWlkPy52YWx1ZXM/LlsnaXNvbGF0aW9uJ10sICd3b3JrdHJlZScsICdwcmV2aW91cyBvdmVybGF5IHZhbHVlcyBwcmVzZXJ2ZWQnKTtcblxuXHRcdGJsb2NrZWQuY29tcGxldGUoeyBzY2hlbWE6IG1ha2VTY2hlbWEoZmFsc2UpLCB2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnLCBicmFuY2g6ICdmZWF0dXJlL3gnIH0gfSk7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblx0fSk7XG5cblx0dGVzdCgncmFjaW5nIGFwcGx5Q29uZmlnQ2hhbmdlIGNhbGxzOiB0aGUgc2Vjb25kIG9uZSB3aW5zIChzZXF1ZW5jZXIgb3JkZXIpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVpID0gdW50aXRsZWRDaGF0VXJpKCdlJyk7XG5cdFx0Y29uc3QgZmlyc3QgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PigpO1xuXHRcdGNvbnN0IHNlY29uZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+KCk7XG5cdFx0Y2xlYW51cC5hZGQoeyBkaXNwb3NlOiAoKSA9PiB7IGZpcnN0LmNhbmNlbCgpOyBzZWNvbmQuY2FuY2VsKCk7IH0gfSk7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVRdWV1ZSA9IFtmaXJzdC5wLCBzZWNvbmQucF07XG5cblx0XHQvLyBGaXJlIGJvdGggYmVmb3JlIGVpdGhlciByZXNvbHZlIGNvbXBsZXRlcy5cblx0XHRjb25zdCBhID0gcHJvdmlzaW9uYWwuYXBwbHlDb25maWdDaGFuZ2UodWksICdjb3BpbG90JywgdW5kZWZpbmVkLCB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9KTtcblx0XHRjb25zdCBiID0gcHJvdmlzaW9uYWwuYXBwbHlDb25maWdDaGFuZ2UodWksICdjb3BpbG90JywgdW5kZWZpbmVkLCB7IGlzb2xhdGlvbjogJ2ZvbGRlcicgfSk7XG5cblx0XHQvLyBDb21wbGV0ZSB0aGUgU0VDT05EIG9uZSBmaXJzdCB0byBzaW11bGF0ZSBvdXQtb2Ytb3JkZXIgUlBDIHJldHVybnMuXG5cdFx0c2Vjb25kLmNvbXBsZXRlKHsgc2NoZW1hOiBtYWtlU2NoZW1hKHRydWUpLCB2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnZm9sZGVyJywgYnJhbmNoOiAnbWFpbicgfSB9KTtcblx0XHQvLyBUaGUgc2VxdWVuY2VyIGVuc3VyZXMgdGhlIHNlY29uZCBjYWxsIHJ1bnMgYWZ0ZXIgdGhlIGZpcnN0OyByZXNvbHZlXG5cdFx0Ly8gdGhlIGZpcnN0IHNvIGl0IGNhbiBzZXR0bGUgYW5kIGxldCB0aGUgc2Vjb25kIHRha2UgZWZmZWN0IGxhc3QuXG5cdFx0Zmlyc3QuY29tcGxldGUoeyBzY2hlbWE6IG1ha2VTY2hlbWEoZmFsc2UpLCB2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnLCBicmFuY2g6ICdtYWluJyB9IH0pO1xuXG5cdFx0YXdhaXQgYTtcblx0XHRhd2FpdCBiO1xuXG5cdFx0Y29uc3Qgb3ZlcmxheSA9IHByb3Zpc2lvbmFsLmdldFJlc29sdmVkQ29uZmlnKHVpKTtcblx0XHQvLyBUaGUgYGZvbGRlcmAgcmVzb2x2ZSB3YXMgaXNzdWVkIHNlY29uZCBhbmQgc2hvdWxkIGJlIHRoZSBmaW5hbCBvdmVybGF5LlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdmVybGF5Py52YWx1ZXM/LlsnaXNvbGF0aW9uJ10sICdmb2xkZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3ZlcmxheT8uc2NoZW1hLnByb3BlcnRpZXNbJ2JyYW5jaCddLnJlYWRPbmx5LCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZXF1YWxzIGNoZWNrIHNraXBzIG9uRGlkQ2hhbmdlIHdoZW4gcmUtcmVzb2x2ZWQgY29uZmlnIGlzIGlkZW50aWNhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnZicpO1xuXHRcdGNvbnN0IHJlc3VsdDogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgPSB7XG5cdFx0XHRzY2hlbWE6IG1ha2VTY2hlbWEoZmFsc2UpLFxuXHRcdFx0dmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbicgfSxcblx0XHR9O1xuXHRcdC8vIFF1ZXVlIHR3byBpZGVudGljYWwgcmVzdWx0cyBmb3IgdHdvIGFwcGx5Q29uZmlnQ2hhbmdlIGNhbGxzLlxuXHRcdGFnZW50SG9zdC5yZXNvbHZlUXVldWUgPSBbcmVzdWx0LCB7IHNjaGVtYTogbWFrZVNjaGVtYShmYWxzZSksIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nIH0gfV07XG5cblx0XHRhd2FpdCBwcm92aXNpb25hbC5hcHBseUNvbmZpZ0NoYW5nZSh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQsIHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0pO1xuXG5cdFx0bGV0IGNoYW5nZUZpcmVzID0gMDtcblx0XHRjbGVhbnVwLmFkZChwcm92aXNpb25hbC5vbkRpZENoYW5nZSh1cmkgPT4geyBpZiAodXJpLnRvU3RyaW5nKCkgPT09IHVpLnRvU3RyaW5nKCkpIHsgY2hhbmdlRmlyZXMrKzsgfSB9KSk7XG5cblx0XHQvLyBTZWNvbmQgY2FsbCB3aXRoIHRoZSBzYW1lIHBhcnRpYWwgc2hvdWxkIHByb2R1Y2UgdGhlIHNhbWUgcmVzb2x2ZWRcblx0XHQvLyBzY2hlbWEvdmFsdWVzOyB0aGUgZXF1YWxzIGNoZWNrIHNob3VsZCBzdXBwcmVzcyB0aGUgb25EaWRDaGFuZ2UgZmlyZS5cblx0XHRhd2FpdCBwcm92aXNpb25hbC5hcHBseUNvbmZpZ0NoYW5nZSh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQsIHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0pO1xuXG5cdFx0Ly8gT25lIG1pY3JvLWZpcmUgaXMgYWNjZXB0YWJsZSBidXQgdGhlIHJlc29sdmVkLXNpZGUgZmlyZSBzaG91bGQgbm90LlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VGaXJlcywgMCwgJ25vIG9uRGlkQ2hhbmdlIGZpcmUgd2hlbiBvdmVybGF5IGlzIHVuY2hhbmdlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cnlSZWJpbmQgd2FpdHMgZm9yIHBlbmRpbmcgY29uZmlnIHJlY29uY2lsaWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdHdvcmtzcGFjZUZvbGRlcnMgPSBbVVJJLmZpbGUoJy93b3Jrc3BhY2Uvb25lJyksIFVSSS5maWxlKCcvd29ya3NwYWNlL3R3bycpXTtcblx0XHR3b3Jrc3BhY2VDb25maWd1cmF0aW9uID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZGVtby5jb2RlLXdvcmtzcGFjZScpO1xuXHRcdHdvcmtzcGFjZU5hbWUgPSAnRGVtbyBXb3Jrc3BhY2UnO1xuXHRcdHdvcmtiZW5jaFN0YXRlID0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFO1xuXHRcdGNvbnN0IHVpID0gdW50aXRsZWRDaGF0VXJpKCdnJyk7XG5cdFx0Ly8gQmxvY2sgdGhlIHJlLXJlc29sdmUgc28gaXQgZG9lcyBOT1QgcnVuIGJlZm9yZSB0cnlSZWJpbmQncyByZWFkLlxuXHRcdGNvbnN0IGJsb2NrZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PigpO1xuXHRcdGNsZWFudXAuYWRkKHsgZGlzcG9zZTogKCkgPT4gYmxvY2tlZC5jYW5jZWwoKSB9KTtcblx0XHRhZ2VudEhvc3QucmVzb2x2ZVF1ZXVlID0gW2Jsb2NrZWQucF07XG5cblx0XHQvLyBGaXJlLWFuZC1mb3JnZXQgYXBwbHlDb25maWdDaGFuZ2UgXHUyMDE0IHdlIGRlbGliZXJhdGVseSBkbyBOT1QgYXdhaXQgaXQuXG5cdFx0dm9pZCBwcm92aXNpb25hbC5hcHBseUNvbmZpZ0NoYW5nZSh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQsIHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0pO1xuXG5cdFx0Ly8gWWllbGQgZW5vdWdoIG1pY3JvdGFza3MgZm9yIGdldE9yQ3JlYXRlICsgdGhlIHN5bmNocm9ub3VzIHByZWx1ZGUgdG8gcnVuLlxuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBSZWJpbmQgbXVzdCB3YWl0IGJlaGluZCB0aGUgY29uZmlnIG9wZXJhdGlvbiByYXRoZXIgdGhhbiBncmFkdWF0aW5nXG5cdFx0Ly8gd2l0aCBhIHBhcnRpYWxseSByZWNvbmNpbGVkIGRyYWZ0LlxuXHRcdGNvbnN0IG5ld1VpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudC1ob3N0LWNvcGlsb3QnLCBwYXRoOiAnL3JlYWwtZycgfSk7XG5cdFx0Y29uc3QgcmViaW5kID0gcHJvdmlzaW9uYWwudHJ5UmViaW5kKHVpLCBuZXdVaSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuY3JlYXRlQ2FsbHMuc29tZShjID0+IGMuc2Vzc2lvbj8ucGF0aCA9PT0gJy9yZWFsLWcnKSwgZmFsc2UpO1xuXHRcdGJsb2NrZWQuY29tcGxldGUoeyBzY2hlbWE6IG1ha2VTY2hlbWEoZmFsc2UpLCB2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0gfSk7XG5cdFx0YXdhaXQgcmViaW5kO1xuXG5cdFx0Y29uc3QgcmVib3VuZENyZWF0ZSA9IGFnZW50SG9zdC5jcmVhdGVDYWxscy5maW5kKGMgPT4gYy5zZXNzaW9uPy5wYXRoID09PSAnL3JlYWwtZycpO1xuXHRcdGFzc2VydC5vayhyZWJvdW5kQ3JlYXRlLCAncmViaW5kIHRyaWdnZXJlZCBhIGNyZWF0ZVNlc3Npb24nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlzb2xhdGlvbjogcmVib3VuZENyZWF0ZS5jb25maWc/LlsnaXNvbGF0aW9uJ10sXG5cdFx0XHRfbWV0YTogcmVib3VuZENyZWF0ZS5fbWV0YSxcblx0XHR9LCB7XG5cdFx0XHRpc29sYXRpb246ICd3b3JrdHJlZScsXG5cdFx0XHRfbWV0YToge1xuXHRcdFx0XHRtdWx0aVJvb3Q6IHtcblx0XHRcdFx0XHR3b3Jrc3BhY2VGaWxlOiB3b3Jrc3BhY2VDb25maWd1cmF0aW9uLnRvU3RyaW5nKCksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0cnlSZWJpbmQgcmV0cmllcyB3aGVuIGNvbmZpZyBjaGFuZ2VzIGR1cmluZyBmaW5hbCBzZXNzaW9uIGNyZWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVpID0gdW50aXRsZWRDaGF0VXJpKCdyZWJpbmQtY29uZmlnLXJhY2UnKTtcblx0XHRjb25zdCByZWFsVWkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdCcsIHBhdGg6ICcvcmVhbC1jb25maWctcmFjZScgfSk7XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodWksICdjb3BpbG90JywgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBvbGRCYWNrZW5kID0gcHJvdmlzaW9uYWwuZ2V0KHVpKTtcblx0XHRhc3NlcnQub2sob2xkQmFja2VuZCk7XG5cdFx0Y29uc3QgZ2F0ZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjbGVhbnVwLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGdhdGUuY2FuY2VsKCkgfSk7XG5cdFx0YWdlbnRIb3N0LmNyZWF0ZUdhdGUgPSBnYXRlO1xuXG5cdFx0Y29uc3QgcmViaW5kID0gcHJvdmlzaW9uYWwudHJ5UmViaW5kKHVpLCByZWFsVWksICdjb3BpbG90JywgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IGNvbmZpZ0NoYW5nZSA9IHByb3Zpc2lvbmFsLmFwcGx5Q29uZmlnQ2hhbmdlKHVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCwgeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSk7XG5cdFx0Z2F0ZS5jb21wbGV0ZSgpO1xuXHRcdGNvbnN0IFtyZWJvdW5kXSA9IGF3YWl0IFByb21pc2UuYWxsKFtyZWJpbmQsIGNvbmZpZ0NoYW5nZV0pO1xuXG5cdFx0Y29uc3QgZmluYWxDcmVhdGVzID0gYWdlbnRIb3N0LmNyZWF0ZUNhbGxzLmZpbHRlcihjYWxsID0+IGNhbGwuc2Vzc2lvbj8ucGF0aCA9PT0gJy9yZWFsLWNvbmZpZy1yYWNlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmaW5hbENyZWF0ZUNvdW50OiBmaW5hbENyZWF0ZXMubGVuZ3RoLFxuXHRcdFx0Zmlyc3RDYW5kaWRhdGVEaXNwb3NlZDogYWdlbnRIb3N0LmRpc3Bvc2VkLmZpbHRlcih1cmkgPT4gdXJpLnBhdGggPT09ICcvcmVhbC1jb25maWctcmFjZScpLmxlbmd0aCxcblx0XHRcdG9sZEJhY2tlbmREaXNwb3NlZDogYWdlbnRIb3N0LmRpc3Bvc2VkLnNvbWUodXJpID0+IHVyaS50b1N0cmluZygpID09PSBvbGRCYWNrZW5kLnRvU3RyaW5nKCkpLFxuXHRcdFx0cmVib3VuZDogcmVib3VuZD8udG9TdHJpbmcoKSxcblx0XHRcdGN1cnJlbnQ6IHByb3Zpc2lvbmFsLmdldChyZWFsVWkpPy50b1N0cmluZygpLFxuXHRcdFx0ZmluYWxDb25maWc6IGZpbmFsQ3JlYXRlcy5hdCgtMSk/LmNvbmZpZyxcblx0XHR9LCB7XG5cdFx0XHRmaW5hbENyZWF0ZUNvdW50OiAyLFxuXHRcdFx0Zmlyc3RDYW5kaWRhdGVEaXNwb3NlZDogMSxcblx0XHRcdG9sZEJhY2tlbmREaXNwb3NlZDogdHJ1ZSxcblx0XHRcdHJlYm91bmQ6IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvcmVhbC1jb25maWctcmFjZScgfSkudG9TdHJpbmcoKSxcblx0XHRcdGN1cnJlbnQ6IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvcmVhbC1jb25maWctcmFjZScgfSkudG9TdHJpbmcoKSxcblx0XHRcdGZpbmFsQ29uZmlnOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0cnlSZWJpbmQgZGlzcG9zZXMgaXRzIGNhbmRpZGF0ZSB3aGVuIHRoZSBvbGQgZW50cnkgaXMgcmV0aXJlZCBkdXJpbmcgY3JlYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdWkgPSB1bnRpdGxlZENoYXRVcmkoJ3JlYmluZC1kaXNwb3NlLXJhY2UnKTtcblx0XHRjb25zdCByZWFsVWkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdCcsIHBhdGg6ICcvcmVhbC1kaXNwb3NlLXJhY2UnIH0pO1xuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmdldE9yQ3JlYXRlKHVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3Qgb2xkQmFja2VuZCA9IHByb3Zpc2lvbmFsLmdldCh1aSk7XG5cdFx0YXNzZXJ0Lm9rKG9sZEJhY2tlbmQpO1xuXHRcdGNvbnN0IGdhdGUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y2xlYW51cC5hZGQoeyBkaXNwb3NlOiAoKSA9PiBnYXRlLmNhbmNlbCgpIH0pO1xuXHRcdGFnZW50SG9zdC5jcmVhdGVHYXRlID0gZ2F0ZTtcblxuXHRcdGNvbnN0IHJlYmluZCA9IHByb3Zpc2lvbmFsLnRyeVJlYmluZCh1aSwgcmVhbFVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBkaXNwb3NhbCA9IHByb3Zpc2lvbmFsLmRpc3Bvc2VTZXNzaW9uKHVpKTtcblx0XHRnYXRlLmNvbXBsZXRlKCk7XG5cdFx0Y29uc3QgW3JlYm91bmRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW3JlYmluZCwgZGlzcG9zYWxdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVib3VuZCxcblx0XHRcdG9sZE1hcHBpbmc6IHByb3Zpc2lvbmFsLmdldCh1aSksXG5cdFx0XHRuZXdNYXBwaW5nOiBwcm92aXNpb25hbC5nZXQocmVhbFVpKSxcblx0XHRcdGRpc3Bvc2VkOiBhZ2VudEhvc3QuZGlzcG9zZWQubWFwKHVyaSA9PiB1cmkudG9TdHJpbmcoKSkuc29ydCgpLFxuXHRcdH0sIHtcblx0XHRcdHJlYm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdG9sZE1hcHBpbmc6IHVuZGVmaW5lZCxcblx0XHRcdG5ld01hcHBpbmc6IHVuZGVmaW5lZCxcblx0XHRcdGRpc3Bvc2VkOiBbXG5cdFx0XHRcdG9sZEJhY2tlbmQudG9TdHJpbmcoKSxcblx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9yZWFsLWRpc3Bvc2UtcmFjZScgfSkudG9TdHJpbmcoKSxcblx0XHRcdF0uc29ydCgpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0cnlSZWJpbmQgcmVzdG9yZXMgYW4gaW1wb3J0ZWQgY29udmVyc2F0aW9uIHdoZW4gZmluYWwgY3JlYXRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdWkgPSB1bnRpdGxlZENoYXRVcmkoJ3JlYmluZC1pbXBvcnQtZmFpbHVyZScpO1xuXHRcdGNvbnN0IHJlYWxVaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jb3BpbG90JywgcGF0aDogJy9yZWFsLWltcG9ydC1mYWlsdXJlJyB9KTtcblx0XHRhd2FpdCBwcm92aXNpb25hbC5nZXRPckNyZWF0ZSh1aSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHR1cm46IFR1cm4gPSB7IGlkOiAndHVybicsIG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LCByZXNwb25zZVBhcnRzOiBbXSwgdXNhZ2U6IHVuZGVmaW5lZCwgc3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSB9O1xuXHRcdGNvbnN0IGltcG9ydGVkID0geyB0dXJuczogW3R1cm5dLCBtb2RlbDogeyBpZDogJ3Rlc3QtbW9kZWwnIH0gfTtcblx0XHRpbXBvcnRTdG9yZS5zZXQocmVhbFVpLCBpbXBvcnRlZCk7XG5cdFx0YWdlbnRIb3N0LmZhaWxOZXh0Q3JlYXRlID0gdHJ1ZTtcblxuXHRcdGNvbnN0IHJlYm91bmQgPSBhd2FpdCBwcm92aXNpb25hbC50cnlSZWJpbmQodWksIHJlYWxVaSwgJ2NvcGlsb3QnLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZWJvdW5kLFxuXHRcdFx0aW1wb3J0ZWQ6IGltcG9ydFN0b3JlLnRha2UocmVhbFVpKSxcblx0XHRcdGRpc3Bvc2VkOiBhZ2VudEhvc3QuZGlzcG9zZWQubWFwKHVyaSA9PiB1cmkudG9TdHJpbmcoKSksXG5cdFx0fSwge1xuXHRcdFx0cmVib3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0aW1wb3J0ZWQsXG5cdFx0XHRkaXNwb3NlZDogW1VSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvcmVhbC1pbXBvcnQtZmFpbHVyZScgfSkudG9TdHJpbmcoKV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyeVJlYmluZCBibG9ja3MgZGV0ZXJtaW5pc3RpYyBVUkkgcmV1c2UgdW50aWwgZmFpbGVkIGRpc3Bvc2FsIGlzIHJldHJpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdWkgPSB1bnRpdGxlZENoYXRVcmkoJ3JlYmluZC1kaXNwb3NlLWZhaWx1cmUnKTtcblx0XHRjb25zdCByZWFsVWkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdCcsIHBhdGg6ICcvcmVhbC1kaXNwb3NlLWZhaWx1cmUnIH0pO1xuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmdldE9yQ3JlYXRlKHVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgZ2F0ZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjbGVhbnVwLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGdhdGUuY2FuY2VsKCkgfSk7XG5cdFx0YWdlbnRIb3N0LmNyZWF0ZUdhdGUgPSBnYXRlO1xuXHRcdGNvbnN0IHJlYmluZCA9IHByb3Zpc2lvbmFsLnRyeVJlYmluZCh1aSwgcmVhbFVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgcGVuZGluZ1JlYWQgPSBwcm92aXNpb25hbC53YWl0Rm9yUGVuZGluZyh1aSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhZ2VudEhvc3QucmVzb2x2ZVF1ZXVlID0gW3sgc2NoZW1hOiBtYWtlU2NoZW1hKGZhbHNlKSwgdmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9IH1dO1xuXHRcdGNvbnN0IGNvbmZpZ0NoYW5nZSA9IHByb3Zpc2lvbmFsLmFwcGx5Q29uZmlnQ2hhbmdlKHVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCwgeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSk7XG5cdFx0YWdlbnRIb3N0LmZhaWxOZXh0RGlzcG9zZSA9IHRydWU7XG5cdFx0Z2F0ZS5jb21wbGV0ZSgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmViaW5kLCAvQ2Fubm90IHNhZmVseSByZXRyeSByZWJvdW5kIHNlc3Npb24vKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcGVuZGluZ1JlYWQsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgY29uZmlnQ2hhbmdlO1xuXHRcdGNvbnN0IHJlYm91bmRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL3JlYWwtZGlzcG9zZS1mYWlsdXJlJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF0dGVtcHRzOiBhZ2VudEhvc3QuZGlzcG9zZUF0dGVtcHRzLmZpbHRlcih1cmkgPT4gdXJpLnRvU3RyaW5nKCkgPT09IHJlYm91bmRVcmkudG9TdHJpbmcoKSkubGVuZ3RoLFxuXHRcdFx0ZGlzcG9zZWQ6IGFnZW50SG9zdC5kaXNwb3NlZC5maWx0ZXIodXJpID0+IHVyaS50b1N0cmluZygpID09PSByZWJvdW5kVXJpLnRvU3RyaW5nKCkpLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRhdHRlbXB0czogMSxcblx0XHRcdGRpc3Bvc2VkOiAwLFxuXHRcdH0pO1xuXG5cdFx0YWdlbnRIb3N0LmZpcmVBZ2VudEhvc3RTdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5kaXNwb3NlZC5maWx0ZXIodXJpID0+IHVyaS50b1N0cmluZygpID09PSByZWJvdW5kVXJpLnRvU3RyaW5nKCkpLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2VTZXNzaW9uIGRyb3BzIHRoZSBlbnRyeSBhbmQgaXRzIG92ZXJsYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdWkgPSB1bnRpdGxlZENoYXRVcmkoJ2gnKTtcblx0XHRhZ2VudEhvc3QucmVzb2x2ZVF1ZXVlID0gW3sgc2NoZW1hOiBtYWtlU2NoZW1hKGZhbHNlKSwgdmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9IH1dO1xuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmFwcGx5Q29uZmlnQ2hhbmdlKHVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCwgeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSk7XG5cdFx0YXNzZXJ0Lm9rKHByb3Zpc2lvbmFsLmdldFJlc29sdmVkQ29uZmlnKHVpKSk7XG5cblx0XHRhd2FpdCBwcm92aXNpb25hbC5kaXNwb3NlU2Vzc2lvbih1aSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3Zpc2lvbmFsLmdldCh1aSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3Zpc2lvbmFsLmdldFJlc29sdmVkQ29uZmlnKHVpKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LmRpc3Bvc2VkLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhaWxlZCByZS1yZXNvbHZlIHByZXNlcnZlcyB0aGUgcHJldmlvdXMgb3ZlcmxheScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnaScpO1xuXHRcdGFnZW50SG9zdC5yZXNvbHZlUXVldWUgPSBbXG5cdFx0XHR7IHNjaGVtYTogbWFrZVNjaGVtYShmYWxzZSksIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSB9LFxuXHRcdFx0UHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdib29tJykpLFxuXHRcdF07XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuYXBwbHlDb25maWdDaGFuZ2UodWksICdjb3BpbG90JywgdW5kZWZpbmVkLCB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9KTtcblx0XHRjb25zdCBiZWZvcmUgPSBwcm92aXNpb25hbC5nZXRSZXNvbHZlZENvbmZpZyh1aSk7XG5cdFx0YXNzZXJ0Lm9rKGJlZm9yZSk7XG5cblx0XHQvLyBBIGZhaWxlZCByZS1yZXNvbHZlIHNob3VsZCBub3QgdGhyb3cgb3V0IG9mIGFwcGx5Q29uZmlnQ2hhbmdlIGFuZFxuXHRcdC8vIG11c3QgbGVhdmUgdGhlIHByZXZpb3VzIG92ZXJsYXkgc2NoZW1hIGluIHBsYWNlLlxuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmFwcGx5Q29uZmlnQ2hhbmdlKHVpLCAnY29waWxvdCcsIHVuZGVmaW5lZCwgeyBicmFuY2g6ICdmZWF0dXJlL3gnIH0pO1xuXG5cdFx0Y29uc3QgYWZ0ZXIgPSBwcm92aXNpb25hbC5nZXRSZXNvbHZlZENvbmZpZyh1aSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZnRlcj8uc2NoZW1hLCBiZWZvcmUuc2NoZW1hLCAnc2NoZW1hIHVuY2hhbmdlZCBhZnRlciBmYWlsZWQgcmUtcmVzb2x2ZScpO1xuXHRcdC8vIE9wdGltaXN0aWMgbWVyZ2Ugc3RpbGwgYXBwbGllZCBmb3IgdmFsdWVzLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZnRlcj8udmFsdWVzPy5bJ2JyYW5jaCddLCAnZmVhdHVyZS94Jyk7XG5cdH0pO1xuXG5cdC8vIFlpZWxkIGVub3VnaCBtaWNyb3Rhc2tzICsgYSBtYWNyb3Rhc2sgZm9yIHRoZSBmaXJlLWFuZC1mb3JnZXQgZm9sZGVyLWNoYW5nZVxuXHQvLyByZWNyZWF0aW9uIChkaXNwb3NlIC0+IGNyZWF0ZSAtPiByZS1yZXNvbHZlKSB0byBzZXR0bGUgYWdhaW5zdCB0aGUgbW9jay5cblx0YXN5bmMgZnVuY3Rpb24gZmx1c2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0fVxuXG5cdHRlc3QoJ2ZvbGRlciBjaGFuZ2UgcmVjcmVhdGVzIHRoZSBwcm92aXNpb25hbCBhdCB0aGUgbmV3IGN3ZCBwcmVzZXJ2aW5nIGNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmb2xkZXJBID0gVVJJLmZpbGUoJy9yZXBvQScpO1xuXHRcdGNvbnN0IGZvbGRlckIgPSBVUkkuZmlsZSgnL3JlcG9CJyk7XG5cdFx0Y29uc3QgdWkgPSB1bnRpdGxlZENoYXRVcmkoJ2N3ZDEnKTtcblx0XHRhZ2VudEhvc3QucmVzb2x2ZVF1ZXVlID0gW3sgc2NoZW1hOiBtYWtlU2NoZW1hKGZhbHNlKSwgdmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9IH1dO1xuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmFwcGx5Q29uZmlnQ2hhbmdlKHVpLCAnY29waWxvdCcsIGZvbGRlckEsIHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuY3JlYXRlQ2FsbHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBvcmlnaW5hbCA9IGFnZW50SG9zdC5jcmVhdGVDYWxsc1swXS5zZXNzaW9uO1xuXHRcdGFzc2VydC5vayhvcmlnaW5hbCk7XG5cblx0XHQvLyBSZS1yZXNvbHZlIHJlc3BvbnNlIGZvciB0aGUgcmVjcmVhdGlvbiBhdCB0aGUgbmV3IGN3ZC5cblx0XHRhZ2VudEhvc3QucmVzb2x2ZVF1ZXVlID0gW3sgc2NoZW1hOiBtYWtlU2NoZW1hKGZhbHNlKSwgdmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9IH1dO1xuXHRcdGZvbGRlclNlcnZpY2Uuc2V0Rm9sZGVyKHVpLCBmb2xkZXJCKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0Y29uc3QgcmVjcmVhdGUgPSBhZ2VudEhvc3QuY3JlYXRlQ2FsbHNbYWdlbnRIb3N0LmNyZWF0ZUNhbGxzLmxlbmd0aCAtIDFdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlQ291bnQ6IGFnZW50SG9zdC5jcmVhdGVDYWxscy5sZW5ndGgsXG5cdFx0XHRkaXNwb3NlZE9sZDogYWdlbnRIb3N0LmRpc3Bvc2VkLnNvbWUoZCA9PiBkLnRvU3RyaW5nKCkgPT09IG9yaWdpbmFsLnRvU3RyaW5nKCkpLFxuXHRcdFx0cmVjcmVhdGVkV2l0aEZyZXNoVXJpOiByZWNyZWF0ZS5zZXNzaW9uPy50b1N0cmluZygpICE9PSBvcmlnaW5hbC50b1N0cmluZygpLFxuXHRcdFx0Y3VycmVudFNlc3Npb246IHByb3Zpc2lvbmFsLmdldCh1aSk/LnRvU3RyaW5nKCksXG5cdFx0XHRyZWNyZWF0ZWRDd2Q6IHJlY3JlYXRlLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdPy50b1N0cmluZygpLFxuXHRcdFx0cmVjcmVhdGVkQ29uZmlnOiByZWNyZWF0ZS5jb25maWc/LlsnaXNvbGF0aW9uJ10sXG5cdFx0fSwge1xuXHRcdFx0Y3JlYXRlQ291bnQ6IDIsXG5cdFx0XHRkaXNwb3NlZE9sZDogdHJ1ZSxcblx0XHRcdHJlY3JlYXRlZFdpdGhGcmVzaFVyaTogdHJ1ZSxcblx0XHRcdGN1cnJlbnRTZXNzaW9uOiByZWNyZWF0ZS5zZXNzaW9uPy50b1N0cmluZygpLFxuXHRcdFx0cmVjcmVhdGVkQ3dkOiBmb2xkZXJCLnRvU3RyaW5nKCksXG5cdFx0XHRyZWNyZWF0ZWRDb25maWc6ICd3b3JrdHJlZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvbGRlciBjaGFuZ2UgbGlzdGVuZXJzIGNhbiB3YWl0IGZvciB0aGUgcXVldWVkIHJlcGxhY2VtZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlckEgPSBVUkkuZmlsZSgnL3JlcG9BJyk7XG5cdFx0Y29uc3QgZm9sZGVyQiA9IFVSSS5maWxlKCcvcmVwb0InKTtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnY3dkLWxpc3RlbmVyJyk7XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodWksICdjb3BpbG90JywgZm9sZGVyQSk7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVRdWV1ZSA9IFt7IHNjaGVtYTogbWFrZVNjaGVtYShmYWxzZSksIHZhbHVlczogeyBpc29sYXRpb246ICdmb2xkZXInIH0gfV07XG5cdFx0bGV0IHBlbmRpbmdSZXBsYWNlbWVudDogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xuXHRcdGNsZWFudXAuYWRkKHByb3Zpc2lvbmFsLm9uRGlkQ2hhbmdlKHJlc291cmNlID0+IHtcblx0XHRcdGlmICghcGVuZGluZ1JlcGxhY2VtZW50ICYmIHJlc291cmNlLnRvU3RyaW5nKCkgPT09IHVpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0cGVuZGluZ1JlcGxhY2VtZW50ID0gcHJvdmlzaW9uYWwud2FpdEZvclBlbmRpbmcodWkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGZvbGRlclNlcnZpY2Uuc2V0Rm9sZGVyKHVpLCBmb2xkZXJCKTtcblx0XHRhc3NlcnQub2socGVuZGluZ1JlcGxhY2VtZW50KTtcblx0XHRjb25zdCByZXBsYWNlbWVudCA9IGF3YWl0IHBlbmRpbmdSZXBsYWNlbWVudDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVwbGFjZW1lbnQ6IHJlcGxhY2VtZW50Py50b1N0cmluZygpLFxuXHRcdFx0Y3VycmVudDogcHJvdmlzaW9uYWwuZ2V0KHVpKT8udG9TdHJpbmcoKSxcblx0XHRcdGN3ZDogYWdlbnRIb3N0LmNyZWF0ZUNhbGxzLmF0KC0xKT8ud29ya2luZ0RpcmVjdG9yaWVzPy5bMF0/LnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0cmVwbGFjZW1lbnQ6IGFnZW50SG9zdC5jcmVhdGVDYWxscy5hdCgtMSk/LnNlc3Npb24/LnRvU3RyaW5nKCksXG5cdFx0XHRjdXJyZW50OiBhZ2VudEhvc3QuY3JlYXRlQ2FsbHMuYXQoLTEpPy5zZXNzaW9uPy50b1N0cmluZygpLFxuXHRcdFx0Y3dkOiBmb2xkZXJCLnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvbGRlciBjaGFuZ2UgdG8gdGhlIHNhbWUgZm9sZGVyIGlzIGEgbm8tb3AnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZm9sZGVyQSA9IFVSSS5maWxlKCcvcmVwb0EnKTtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgnY3dkMicpO1xuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmdldE9yQ3JlYXRlKHVpLCAnY29waWxvdCcsIGZvbGRlckEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuY3JlYXRlQ2FsbHMubGVuZ3RoLCAxKTtcblxuXHRcdGZvbGRlclNlcnZpY2Uuc2V0Rm9sZGVyKHVpLCBmb2xkZXJBKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5jcmVhdGVDYWxscy5sZW5ndGgsIDEsICdubyByZWNyZWF0ZSBmb3IgdW5jaGFuZ2VkIGZvbGRlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcG9zZWQubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncmFwaWQgZm9sZGVyIGNoYW5nZXMgY29udmVyZ2Ugb24gdGhlIGxhdGVzdCBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZm9sZGVyQSA9IFVSSS5maWxlKCcvcmVwb0EnKTtcblx0XHRjb25zdCBmb2xkZXJCID0gVVJJLmZpbGUoJy9yZXBvQicpO1xuXHRcdGNvbnN0IGZvbGRlckMgPSBVUkkuZmlsZSgnL3JlcG9DJyk7XG5cdFx0Y29uc3QgdWkgPSB1bnRpdGxlZENoYXRVcmkoJ3JhcGlkJyk7XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodWksICdjb3BpbG90JywgZm9sZGVyQSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBwcm92aXNpb25hbC5nZXQodWkpO1xuXHRcdGFzc2VydC5vayhvcmlnaW5hbCk7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVRdWV1ZSA9IFtcblx0XHRcdHsgc2NoZW1hOiBtYWtlU2NoZW1hKGZhbHNlKSwgdmFsdWVzOiB7IGlzb2xhdGlvbjogJ2ZvbGRlcicgfSB9LFxuXHRcdFx0eyBzY2hlbWE6IG1ha2VTY2hlbWEoZmFsc2UpLCB2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9IH0sXG5cdFx0XTtcblxuXHRcdGZvbGRlclNlcnZpY2Uuc2V0Rm9sZGVyKHVpLCBmb2xkZXJCKTtcblx0XHRmb2xkZXJTZXJ2aWNlLnNldEZvbGRlcih1aSwgZm9sZGVyQyk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlQ291bnQ6IGFnZW50SG9zdC5jcmVhdGVDYWxscy5sZW5ndGgsXG5cdFx0XHRjdXJyZW50OiBwcm92aXNpb25hbC5nZXQodWkpPy50b1N0cmluZygpLFxuXHRcdFx0bGF0ZXN0Q3dkOiBhZ2VudEhvc3QuY3JlYXRlQ2FsbHMuYXQoLTEpPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXT8udG9TdHJpbmcoKSxcblx0XHRcdGRpc3Bvc2VkOiBhZ2VudEhvc3QuZGlzcG9zZWQubWFwKHVyaSA9PiB1cmkudG9TdHJpbmcoKSksXG5cdFx0fSwge1xuXHRcdFx0Y3JlYXRlQ291bnQ6IDIsXG5cdFx0XHRjdXJyZW50OiBhZ2VudEhvc3QuY3JlYXRlQ2FsbHMuYXQoLTEpPy5zZXNzaW9uPy50b1N0cmluZygpLFxuXHRcdFx0bGF0ZXN0Q3dkOiBmb2xkZXJDLnRvU3RyaW5nKCksXG5cdFx0XHRkaXNwb3NlZDogW29yaWdpbmFsLnRvU3RyaW5nKCldLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnRydXN0ZWQgZm9sZGVyIGNoYW5nZSByZXRpcmVzIHRoZSBoaWRkZW4gZ2VuZXJhdGlvbiBhbmQgcmVjcmVhdGVzIG9uIHJvbGxiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlckEgPSBVUkkuZmlsZSgnL3JlcG9BJyk7XG5cdFx0Y29uc3QgZm9sZGVyQiA9IFVSSS5maWxlKCcvcmVwb0InKTtcblx0XHRjb25zdCB1aSA9IHVudGl0bGVkQ2hhdFVyaSgndHJ1c3QtY2hhbmdlJyk7XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodWksICdjb3BpbG90JywgZm9sZGVyQSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBwcm92aXNpb25hbC5nZXQodWkpO1xuXHRcdGFzc2VydC5vayhvcmlnaW5hbCk7XG5cdFx0dW50cnVzdGVkRm9sZGVycy5hZGQoZm9sZGVyQi50b1N0cmluZygpKTtcblxuXHRcdGZvbGRlclNlcnZpY2Uuc2V0Rm9sZGVyKHVpLCBmb2xkZXJCKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBwcm92aXNpb25hbC5nZXQodWkpLFxuXHRcdFx0ZGlzcG9zZWQ6IGFnZW50SG9zdC5kaXNwb3NlZC5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKSxcblx0XHRcdGNyZWF0ZUNvdW50OiBhZ2VudEhvc3QuY3JlYXRlQ2FsbHMubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdGRpc3Bvc2VkOiBbb3JpZ2luYWwudG9TdHJpbmcoKV0sXG5cdFx0XHRjcmVhdGVDb3VudDogMSxcblx0XHR9KTtcblxuXHRcdGFnZW50SG9zdC5yZXNvbHZlUXVldWUgPSBbeyBzY2hlbWE6IG1ha2VTY2hlbWEoZmFsc2UpLCB2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9IH1dO1xuXHRcdGZvbGRlclNlcnZpY2Uuc2V0Rm9sZGVyKHVpLCBmb2xkZXJBKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3VycmVudDogcHJvdmlzaW9uYWwuZ2V0KHVpKT8udG9TdHJpbmcoKSxcblx0XHRcdGNyZWF0ZUNvdW50OiBhZ2VudEhvc3QuY3JlYXRlQ2FsbHMubGVuZ3RoLFxuXHRcdFx0ZGlzcG9zZWQ6IGFnZW50SG9zdC5kaXNwb3NlZC5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKSxcblx0XHRcdHJlY3JlYXRlZDogcHJvdmlzaW9uYWwuZ2V0KHVpKT8udG9TdHJpbmcoKSAhPT0gb3JpZ2luYWwudG9TdHJpbmcoKSxcblx0XHR9LCB7XG5cdFx0XHRjdXJyZW50OiBhZ2VudEhvc3QuY3JlYXRlQ2FsbHMuYXQoLTEpPy5zZXNzaW9uPy50b1N0cmluZygpLFxuXHRcdFx0Y3JlYXRlQ291bnQ6IDIsXG5cdFx0XHRkaXNwb3NlZDogW29yaWdpbmFsLnRvU3RyaW5nKCldLFxuXHRcdFx0cmVjcmVhdGVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWlsZWQgZm9sZGVyIHJlcGxhY2VtZW50IGNsZWFucyB1cCBpdHMgY2FuZGlkYXRlIGFuZCByZWNyZWF0ZXMgb24gcmV0cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZm9sZGVyQSA9IFVSSS5maWxlKCcvcmVwb0EnKTtcblx0XHRjb25zdCBmb2xkZXJCID0gVVJJLmZpbGUoJy9yZXBvQicpO1xuXHRcdGNvbnN0IHVpID0gdW50aXRsZWRDaGF0VXJpKCdmYWlsZWQtY2hhbmdlJyk7XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodWksICdjb3BpbG90JywgZm9sZGVyQSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBwcm92aXNpb25hbC5nZXQodWkpO1xuXHRcdGFzc2VydC5vayhvcmlnaW5hbCk7XG5cdFx0YWdlbnRIb3N0LmZhaWxOZXh0Q3JlYXRlID0gdHJ1ZTtcblxuXHRcdGZvbGRlclNlcnZpY2Uuc2V0Rm9sZGVyKHVpLCBmb2xkZXJCKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXHRcdGNvbnN0IGZhaWxlZENhbmRpZGF0ZSA9IGFnZW50SG9zdC5jcmVhdGVDYWxsc1sxXS5zZXNzaW9uO1xuXHRcdGFzc2VydC5vayhmYWlsZWRDYW5kaWRhdGUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBwcm92aXNpb25hbC5nZXQodWkpLFxuXHRcdFx0ZGlzcG9zZWQ6IGFnZW50SG9zdC5kaXNwb3NlZC5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKSxcblx0XHRcdGNyZWF0ZUNvdW50OiBhZ2VudEhvc3QuY3JlYXRlQ2FsbHMubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdGRpc3Bvc2VkOiBbZmFpbGVkQ2FuZGlkYXRlLnRvU3RyaW5nKCksIG9yaWdpbmFsLnRvU3RyaW5nKCldLFxuXHRcdFx0Y3JlYXRlQ291bnQ6IDIsXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXRyaWVkID0gYXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUodWksICdjb3BpbG90JywgZm9sZGVyQik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXRyaWVkOiByZXRyaWVkPy50b1N0cmluZygpLFxuXHRcdFx0bGF0ZXN0Q3dkOiBhZ2VudEhvc3QuY3JlYXRlQ2FsbHMuYXQoLTEpPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXT8udG9TdHJpbmcoKSxcblx0XHRcdGRpc3Bvc2VkOiBhZ2VudEhvc3QuZGlzcG9zZWQubWFwKHVyaSA9PiB1cmkudG9TdHJpbmcoKSksXG5cdFx0fSwge1xuXHRcdFx0cmV0cmllZDogYWdlbnRIb3N0LmNyZWF0ZUNhbGxzLmF0KC0xKT8uc2Vzc2lvbj8udG9TdHJpbmcoKSxcblx0XHRcdGxhdGVzdEN3ZDogZm9sZGVyQi50b1N0cmluZygpLFxuXHRcdFx0ZGlzcG9zZWQ6IFtmYWlsZWRDYW5kaWRhdGUudG9TdHJpbmcoKSwgb3JpZ2luYWwudG9TdHJpbmcoKV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZyBjaGFuZ2VkIGR1cmluZyBjcmVhdGlvbiByZXRpcmVzIHRoZSBzdGFsZSBjYW5kaWRhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZm9sZGVyID0gVVJJLmZpbGUoJy9yZXBvJyk7XG5cdFx0Y29uc3QgdWkgPSB1bnRpdGxlZENoYXRVcmkoJ2NvbmZpZy1yYWNlJyk7XG5cdFx0Y29uc3QgZ2F0ZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjbGVhbnVwLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGdhdGUuY2FuY2VsKCkgfSk7XG5cdFx0YWdlbnRIb3N0LmNyZWF0ZUdhdGUgPSBnYXRlO1xuXHRcdGNvbnN0IGluaXRpYWxDcmVhdGUgPSBwcm92aXNpb25hbC5nZXRPckNyZWF0ZSh1aSwgJ2NvcGlsb3QnLCBmb2xkZXIpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVRdWV1ZSA9IFt7IHNjaGVtYTogbWFrZVNjaGVtYShmYWxzZSksIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSB9XTtcblxuXHRcdGNvbnN0IGNvbmZpZ0NoYW5nZSA9IHByb3Zpc2lvbmFsLmFwcGx5Q29uZmlnQ2hhbmdlKHVpLCAnY29waWxvdCcsIGZvbGRlciwgeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSk7XG5cdFx0Z2F0ZS5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtpbml0aWFsQ3JlYXRlLCBjb25maWdDaGFuZ2VdKTtcblxuXHRcdGNvbnN0IHN0YWxlID0gYWdlbnRIb3N0LmNyZWF0ZUNhbGxzWzBdLnNlc3Npb247XG5cdFx0Y29uc3QgY3VycmVudCA9IGFnZW50SG9zdC5jcmVhdGVDYWxscy5hdCgtMSk/LnNlc3Npb247XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjcmVhdGVDb3VudDogYWdlbnRIb3N0LmNyZWF0ZUNhbGxzLmxlbmd0aCxcblx0XHRcdHN0YWxlRGlzcG9zZWQ6IGFnZW50SG9zdC5kaXNwb3NlZC5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKSxcblx0XHRcdGN1cnJlbnQ6IHByb3Zpc2lvbmFsLmdldCh1aSk/LnRvU3RyaW5nKCksXG5cdFx0XHRjdXJyZW50Q29uZmlnOiBhZ2VudEhvc3QuY3JlYXRlQ2FsbHMuYXQoLTEpPy5jb25maWcsXG5cdFx0XHRkaXNwYXRjaENoYW5uZWw6IGFnZW50SG9zdC5kaXNwYXRjaGVkLmF0KC0xKT8uY2hhbm5lbCxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVDb3VudDogMixcblx0XHRcdHN0YWxlRGlzcG9zZWQ6IHN0YWxlID8gW3N0YWxlLnRvU3RyaW5nKCldIDogW10sXG5cdFx0XHRjdXJyZW50OiBjdXJyZW50Py50b1N0cmluZygpLFxuXHRcdFx0Y3VycmVudENvbmZpZzogeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSxcblx0XHRcdGRpc3BhdGNoQ2hhbm5lbDogY3VycmVudD8udG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBxdWV1ZWQgYmVoaW5kIGNyZWF0aW9uIGNhbm5vdCBwdWJsaXNoIG9yIGRlYWRsb2NrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVpID0gdW50aXRsZWRDaGF0VXJpKCdkaXNwb3NlLXJhY2UnKTtcblx0XHRjb25zdCBnYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNsZWFudXAuYWRkKHsgZGlzcG9zZTogKCkgPT4gZ2F0ZS5jYW5jZWwoKSB9KTtcblx0XHRhZ2VudEhvc3QuY3JlYXRlR2F0ZSA9IGdhdGU7XG5cdFx0Y29uc3QgY3JlYXRpb24gPSBwcm92aXNpb25hbC5nZXRPckNyZWF0ZSh1aSwgJ2NvcGlsb3QnLCBVUkkuZmlsZSgnL3JlcG8nKSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FsID0gcHJvdmlzaW9uYWwuZGlzcG9zZVNlc3Npb24odWkpO1xuXHRcdGdhdGUuY29tcGxldGUoKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbY3JlYXRpb24sIGRpc3Bvc2FsXSk7XG5cdFx0Y29uc3QgY3JlYXRlZFNlc3Npb24gPSBhZ2VudEhvc3QuY3JlYXRlQ2FsbHNbMF0uc2Vzc2lvbjtcblx0XHRhc3NlcnQub2soY3JlYXRlZFNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBwcm92aXNpb25hbC5nZXQodWkpLFxuXHRcdFx0Y3JlYXRlQ291bnQ6IGFnZW50SG9zdC5jcmVhdGVDYWxscy5sZW5ndGgsXG5cdFx0XHRkaXNwb3NlZDogYWdlbnRIb3N0LmRpc3Bvc2VkLm1hcCh1cmkgPT4gdXJpLnRvU3RyaW5nKCkpLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdGNyZWF0ZUNvdW50OiAxLFxuXHRcdFx0ZGlzcG9zZWQ6IFtjcmVhdGVkU2Vzc2lvbi50b1N0cmluZygpXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZm9sZGVyIGNoYW5nZSB3aXRoIG5vIHByb3Zpc2lvbmFsIGVudHJ5IGlzIGEgbm8tb3AnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdWkgPSB1bnRpdGxlZENoYXRVcmkoJ2N3ZDMnKTtcblx0XHRmb2xkZXJTZXJ2aWNlLnNldEZvbGRlcih1aSwgVVJJLmZpbGUoJy9yZXBvQicpKTtcblx0XHRhd2FpdCBmbHVzaCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5jcmVhdGVDYWxscy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aXNpb25hbC5nZXQodWkpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXJpdmVzIHRoZSBvcmRlcmVkIHdvcmtpbmctZGlyZWN0b3J5IHNldCBmcm9tIHRoZSBwaWNrZWQgcHJpbWFyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmb2xkZXJBID0gVVJJLmZpbGUoJy9yZXBvQScpO1xuXHRcdGNvbnN0IGZvbGRlckIgPSBVUkkuZmlsZSgnL3JlcG9CJyk7XG5cdFx0Y29uc3QgZm9sZGVyQyA9IFVSSS5maWxlKCcvcmVwb0MnKTtcblx0XHR3b3Jrc3BhY2VGb2xkZXJzID0gW2ZvbGRlckEsIGZvbGRlckIsIGZvbGRlckNdO1xuXHRcdC8vIFRoZSBwcm92aWRlciBhZHZlcnRpc2VzIG11bHRpLXJvb3Qgc3VwcG9ydCwgc28gdGhlIGNsaWVudCBzZW5kcyB0aGUgc2V0LlxuXHRcdGFnZW50SG9zdC5yb290U3RhdGVBZ2VudHMgPSBbYWdlbnRJbmZvKCdjb3BpbG90JywgdHJ1ZSldO1xuXG5cdFx0Y29uc3QgbXVsdGlSb290ID0gdW50aXRsZWRDaGF0VXJpKCdtdWx0aScpO1xuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmdldE9yQ3JlYXRlKG11bHRpUm9vdCwgJ2NvcGlsb3QnLCBmb2xkZXJCKTtcblxuXHRcdC8vIEEgc2luZ2xlLWZvbGRlciB3b3Jrc3BhY2Uga2VlcHMganVzdCB0aGUgcHJpbWFyeSAoYnl0ZS1pZGVudGljYWwgdG8gdGhlXG5cdFx0Ly8gcHJldmlvdXMgc2luZ2xlLWRpcmVjdG9yeSBiZWhhdmlvdXIpLlxuXHRcdHdvcmtzcGFjZUZvbGRlcnMgPSBbZm9sZGVyQV07XG5cdFx0Y29uc3Qgc2luZ2xlUm9vdCA9IHVudGl0bGVkQ2hhdFVyaSgnc2luZ2xlJyk7XG5cdFx0YXdhaXQgcHJvdmlzaW9uYWwuZ2V0T3JDcmVhdGUoc2luZ2xlUm9vdCwgJ2NvcGlsb3QnLCBmb2xkZXJBKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bXVsdGlSb290OiBhZ2VudEhvc3QuY3JlYXRlQ2FsbHNbMF0ud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZCA9PiBkLnRvU3RyaW5nKCkpLFxuXHRcdFx0c2luZ2xlUm9vdDogYWdlbnRIb3N0LmNyZWF0ZUNhbGxzWzFdLndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGQgPT4gZC50b1N0cmluZygpKSxcblx0XHR9LCB7XG5cdFx0XHRtdWx0aVJvb3Q6IFtmb2xkZXJCLnRvU3RyaW5nKCksIGZvbGRlckEudG9TdHJpbmcoKSwgZm9sZGVyQy50b1N0cmluZygpXSxcblx0XHRcdHNpbmdsZVJvb3Q6IFtmb2xkZXJBLnRvU3RyaW5nKCldLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kcyBvbmx5IHRoZSBwcmltYXJ5IHdoZW4gdGhlIHByb3ZpZGVyIGRvZXMgbm90IGFkdmVydGlzZSBtdWx0aXBsZSB3b3JraW5nIGRpcmVjdG9yaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlckEgPSBVUkkuZmlsZSgnL3JlcG9BJyk7XG5cdFx0Y29uc3QgZm9sZGVyQiA9IFVSSS5maWxlKCcvcmVwb0InKTtcblx0XHRjb25zdCBmb2xkZXJDID0gVVJJLmZpbGUoJy9yZXBvQycpO1xuXHRcdHdvcmtzcGFjZUZvbGRlcnMgPSBbZm9sZGVyQSwgZm9sZGVyQiwgZm9sZGVyQ107XG5cblx0XHQvLyBUaGUgc2FtZSBwcm92aWRlciBnZXRzIHRoZSBmdWxsIG9yZGVyZWQgc2V0IHdoaWxlIGl0IGFkdmVydGlzZXMgdGhlXG5cdFx0Ly8gY2FwYWJpbGl0eSwgYW5kIG9ubHkgdGhlIHByaW1hcnkgb25jZSBpdCBkb2VzIG5vdCBcdTIwMTQgdGhlIGNsaWVudCBtaXJyb3JzXG5cdFx0Ly8gdGhlIG5vZGUtc2lkZSBndWFyZCBpbnN0ZWFkIG9mIHJlbHlpbmcgb24gaXQgYWxvbmUuXG5cdFx0YWdlbnRIb3N0LnJvb3RTdGF0ZUFnZW50cyA9IFthZ2VudEluZm8oJ2NvcGlsb3QnLCB0cnVlKV07XG5cdFx0Y29uc3QgbXVsdGkgPSB1bnRpdGxlZENoYXRVcmkoJ2NhcC1tdWx0aScpO1xuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmdldE9yQ3JlYXRlKG11bHRpLCAnY29waWxvdCcsIGZvbGRlckIpO1xuXG5cdFx0YWdlbnRIb3N0LnJvb3RTdGF0ZUFnZW50cyA9IFthZ2VudEluZm8oJ2NvcGlsb3QnLCBmYWxzZSldO1xuXHRcdGNvbnN0IHNpbmdsZSA9IHVudGl0bGVkQ2hhdFVyaSgnY2FwLXNpbmdsZScpO1xuXHRcdGF3YWl0IHByb3Zpc2lvbmFsLmdldE9yQ3JlYXRlKHNpbmdsZSwgJ2NvcGlsb3QnLCBmb2xkZXJCKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWR2ZXJ0aXNpbmc6IGFnZW50SG9zdC5jcmVhdGVDYWxsc1swXS53b3JraW5nRGlyZWN0b3JpZXM/Lm1hcChkID0+IGQudG9TdHJpbmcoKSksXG5cdFx0XHRub25BZHZlcnRpc2luZzogYWdlbnRIb3N0LmNyZWF0ZUNhbGxzWzFdLndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGQgPT4gZC50b1N0cmluZygpKSxcblx0XHR9LCB7XG5cdFx0XHRhZHZlcnRpc2luZzogW2ZvbGRlckIudG9TdHJpbmcoKSwgZm9sZGVyQS50b1N0cmluZygpLCBmb2xkZXJDLnRvU3RyaW5nKCldLFxuXHRcdFx0bm9uQWR2ZXJ0aXNpbmc6IFtmb2xkZXJCLnRvU3RyaW5nKCldLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG4vKiogTWluaW1hbCB7QGxpbmsgQWdlbnRJbmZvfSBmb3IgY2FwYWJpbGl0eS1nYXRpbmcgdGVzdHMuICovXG5mdW5jdGlvbiBhZ2VudEluZm8ocHJvdmlkZXI6IHN0cmluZywgbXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXM6IGJvb2xlYW4pOiBBZ2VudEluZm8ge1xuXHRyZXR1cm4ge1xuXHRcdHByb3ZpZGVyLFxuXHRcdGRpc3BsYXlOYW1lOiBwcm92aWRlcixcblx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0bW9kZWxzOiBbXSxcblx0XHRjYXBhYmlsaXRpZXM6IG11bHRpcGxlV29ya2luZ0RpcmVjdG9yaWVzID8geyBtdWx0aXBsZVdvcmtpbmdEaXJlY3RvcmllczogeyBpbW11dGFibGVQcmltYXJ5OiB0cnVlIH0gfSA6IHt9LFxuXHR9IGFzIEFnZW50SW5mbztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCLFNBQVMsdUJBQXVCO0FBQzFELFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFvQyx5QkFBMkQ7QUFDL0YsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyx5QkFBc0c7QUFDL0csU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywwQkFBc0Ysc0JBQXNCO0FBRXJILFNBQVMsYUFBYSxpQkFBNEQ7QUFDbEYsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrREFBK0Y7QUFDeEcsU0FBUyxrQ0FBa0MseUNBQXlDO0FBQ3BGLFNBQVMsa0NBQWtDLHlDQUF5QztBQUNwRixTQUFTLHFDQUFxQztBQVc5QyxNQUFNLDZCQUE2QixLQUF3QixFQUFFO0FBQUEsRUFBN0Q7QUFBQTtBQUVDLFNBQWtCLFdBQVc7QUFFN0IsU0FBUyxjQUEyQyxDQUFDO0FBQ3JELFNBQVMsV0FBa0IsQ0FBQztBQUM1QixTQUFTLGFBQWtDLENBQUM7QUFDNUMsU0FBUyxlQUFtRCxDQUFDO0FBQzdELFNBQVMsa0JBQXlCLENBQUM7QUFFbkMsMEJBQWlCO0FBQ2pCLDJCQUFrQjtBQUNsQixTQUFpQixvQkFBb0IsSUFBSSxRQUFjO0FBQ3ZELFNBQWtCLG1CQUFtQixLQUFLLGtCQUFrQjtBQUc1RDtBQUFBLDJCQUErQixDQUFDO0FBQ2hDLFNBQWtCLGFBQTRDLE1B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
