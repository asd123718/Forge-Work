import assert from "assert";
import { DeferredPromise } from "../../../../../base/common/async.js";
import { DisposableStore, Disposable } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { Emitter } from "../../../../../base/common/event.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { IAgentHostTerminalService } from "../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js";
import { ITerminalProfileService } from "../../../../../workbench/contrib/terminal/common/terminal.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { NullLogService, ILogService } from "../../../../../platform/log/common/log.js";
import { ITerminalService } from "../../../../../workbench/contrib/terminal/browser/terminal.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { toAgentHostUri } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { AgentSessionProviders } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js";
import { ChatInteractivity } from "../../../../services/sessions/common/session.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { SessionsTerminalContribution } from "../../browser/sessionsTerminalContribution.js";
import { TestPathService } from "../../../../../workbench/test/browser/workbenchTestServices.js";
import { IPathService } from "../../../../../workbench/services/path/common/pathService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IViewsService } from "../../../../../workbench/services/views/common/viewsService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
const HOME_DIR = URI.file("/home/user");
class TestLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.infos = [];
    this.traces = [];
  }
  info(message, ...args) {
    this.infos.push([message, ...args].join(" "));
  }
  trace(message, ...args) {
    this.traces.push([message, ...args].join(" "));
  }
}
function makeAgentSession(opts) {
  const folder = opts.repository || opts.worktree ? {
    root: opts.repository ?? opts.worktree,
    workingDirectory: opts.worktree ?? opts.repository,
    name: "test",
    description: void 0,
    gitRepository: { uri: opts.repository ?? opts.worktree, workTreeUri: opts.worktree, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
  } : void 0;
  const chat = {
    resource: URI.parse("file:///session"),
    createdAt: /* @__PURE__ */ new Date(),
    title: observableValue("test.title", "Test Session"),
    updatedAt: observableValue("test.updatedAt", /* @__PURE__ */ new Date()),
    status: observableValue("test.status", 0),
    changes: observableValue("test.changes", []),
    modelId: observableValue("test.modelId", void 0),
    mode: observableValue("test.mode", void 0),
    isArchived: observableValue("test.isArchived", opts.isArchived ?? false),
    isRead: observableValue("test.isRead", true),
    interactivity: observableValue("test.interactivity", ChatInteractivity.Full),
    checkpoints: observableValue("test.checkpoints", void 0),
    lastTurnEnd: observableValue("test.lastTurnEnd", void 0),
    description: observableValue("test.description", void 0)
  };
  const session = {
    sessionId: opts.sessionId ?? "test:session",
    resource: chat.resource,
    providerId: opts.providerId ?? "test",
    sessionType: opts.providerType ?? AgentSessionProviders.Local,
    icon: Codicon.copilot,
    createdAt: chat.createdAt,
    workspace: observableValue("test.workspace", folder ? {
      uri: folder.root,
      label: "test",
      icon: Codicon.repo,
      folders: [folder],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    } : void 0),
    title: chat.title,
    updatedAt: chat.updatedAt,
    status: chat.status,
    changesets: constObservable([]),
    changes: chat.changes,
    modelId: chat.modelId,
    mode: chat.mode,
    loading: observableValue("test.loading", opts.loading ?? false),
    isArchived: chat.isArchived,
    isRead: chat.isRead,
    lastTurnEnd: chat.lastTurnEnd,
    description: chat.description,
    chats: observableValue("test.chats", [chat]),
    activeChat: observableValue("test.activeChat", chat),
    mainChat: constObservable(chat),
    capabilities: constObservable({ supportsMultipleChats: false }),
    isCreated: observableValue("test.isCreated", true),
    sticky: observableValue("test.sticky", false),
    openChats: observableValue("test.openChats", [chat]),
    closedChats: constObservable([]),
    lastClosedChat: void 0,
    visibleChatTabs: constObservable([chat]),
    shouldShowChatTabs: constObservable(false)
  };
  return session;
}
function makeNonAgentSession(opts) {
  const folder = opts.repository || opts.worktree ? {
    root: opts.repository ?? opts.worktree,
    workingDirectory: opts.worktree ?? opts.repository,
    name: "test",
    description: void 0,
    gitRepository: { uri: opts.repository ?? opts.worktree, workTreeUri: opts.worktree, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
  } : void 0;
  const chat = {
    resource: URI.parse("file:///session"),
    createdAt: /* @__PURE__ */ new Date(),
    title: observableValue("test.title", "Test Session"),
    updatedAt: observableValue("test.updatedAt", /* @__PURE__ */ new Date()),
    status: observableValue("test.status", 0),
    changes: observableValue("test.changes", []),
    modelId: observableValue("test.modelId", void 0),
    mode: observableValue("test.mode", void 0),
    isArchived: observableValue("test.isArchived", false),
    isRead: observableValue("test.isRead", true),
    interactivity: observableValue("test.interactivity", ChatInteractivity.Full),
    checkpoints: observableValue("test.checkpoints", void 0),
    lastTurnEnd: observableValue("test.lastTurnEnd", void 0),
    description: observableValue("test.description", void 0)
  };
  const session = {
    sessionId: opts.sessionId ?? "test:non-agent",
    resource: chat.resource,
    providerId: "test",
    sessionType: opts.providerType ?? AgentSessionProviders.Local,
    icon: Codicon.copilot,
    createdAt: chat.createdAt,
    workspace: observableValue("test.workspace", folder ? {
      uri: folder.root,
      label: "test",
      icon: Codicon.repo,
      folders: [folder],
      requiresWorkspaceTrust: false
    } : void 0),
    title: chat.title,
    updatedAt: chat.updatedAt,
    status: chat.status,
    changesets: constObservable([]),
    changes: chat.changes,
    modelId: chat.modelId,
    mode: chat.mode,
    loading: observableValue("test.loading", false),
    isArchived: chat.isArchived,
    isRead: chat.isRead,
    lastTurnEnd: chat.lastTurnEnd,
    description: chat.description,
    chats: observableValue("test.chats", [chat]),
    mainChat: constObservable(chat),
    capabilities: constObservable({ supportsMultipleChats: false })
  };
  return session;
}
function makeTerminalInstance(id, cwd) {
  const commandHistory = [];
  let isDisposed = false;
  let initialCwdBarrier;
  let shellLaunchConfig = {};
  const capabilities = {
    get(cap) {
      if (cap === TerminalCapability.CommandDetection && commandHistory.length > 0) {
        return { commands: commandHistory };
      }
      return void 0;
    }
  };
  return {
    instanceId: id,
    get isDisposed() {
      return isDisposed;
    },
    get shellLaunchConfig() {
      return shellLaunchConfig;
    },
    async getInitialCwd() {
      await initialCwdBarrier;
      return cwd;
    },
    capabilities,
    _testCommandHistory: commandHistory,
    _testSetDisposed(disposed) {
      isDisposed = disposed;
    },
    _testSetInitialCwdBarrier(barrier) {
      initialCwdBarrier = barrier;
    },
    _testSetShellLaunchConfig(value) {
      shellLaunchConfig = value;
    }
  };
}
function addCommandToInstance(instance, timestamp) {
  instance._testCommandHistory.push({ timestamp });
}
suite("SessionsTerminalContribution", () => {
  const store = new DisposableStore();
  let contribution;
  let activeSessionObs;
  let onDidChangeSessions;
  let onDidReplaceSession;
  let onDidReplaceNewDraftSession;
  let onDidCreateInstance;
  let onDidDisposeInstance;
  let createdTerminals;
  let agentHostTerminalAddresses;
  let terminalCreationBarriers;
  let terminalCreationStarted;
  let activeInstanceSet;
  let activeInstanceId;
  let focusCalls;
  let disposedInstances;
  let nextInstanceId;
  let terminalInstances;
  let backgroundedInstances;
  let moveToBackgroundCalls;
  let showBackgroundCalls;
  let disposeOnCreatePaths;
  let defaultCwdCalls;
  let logService;
  let allSessions;
  let sessionProviders;
  let instantiationService;
  setup(() => {
    createdTerminals = [];
    agentHostTerminalAddresses = [];
    terminalCreationBarriers = /* @__PURE__ */ new Map();
    terminalCreationStarted = [];
    activeInstanceSet = [];
    activeInstanceId = void 0;
    focusCalls = 0;
    disposedInstances = [];
    nextInstanceId = 1;
    terminalInstances = /* @__PURE__ */ new Map();
    backgroundedInstances = /* @__PURE__ */ new Set();
    moveToBackgroundCalls = [];
    showBackgroundCalls = [];
    disposeOnCreatePaths = /* @__PURE__ */ new Set();
    defaultCwdCalls = [];
    logService = new TestLogService();
    allSessions = [];
    sessionProviders = /* @__PURE__ */ new Map();
    instantiationService = store.add(new TestInstantiationService());
    activeSessionObs = observableValue("activeSession", void 0);
    onDidChangeSessions = store.add(new Emitter());
    onDidReplaceSession = store.add(new Emitter());
    onDidReplaceNewDraftSession = store.add(new Emitter());
    onDidCreateInstance = store.add(new Emitter());
    onDidDisposeInstance = store.add(new Emitter());
    instantiationService.stub(ILogService, logService);
    instantiationService.stub(ISessionsManagementService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeSessions = onDidChangeSessions.event;
        this.onDidReplaceSession = onDidReplaceSession.event;
        this.onDidReplaceNewDraftSession = onDidReplaceNewDraftSession.event;
      }
      getSessions() {
        return [...allSessions];
      }
    }());
    instantiationService.stub(ISessionsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = activeSessionObs;
      }
    }());
    instantiationService.stub(ITerminalService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidCreateInstance = onDidCreateInstance.event;
        this.onDidDisposeInstance = onDidDisposeInstance.event;
      }
      get instances() {
        return [...terminalInstances.values()];
      }
      get foregroundInstances() {
        return [...terminalInstances.values()].filter((i) => !backgroundedInstances.has(i.instanceId));
      }
      get activeInstance() {
        return activeInstanceId !== void 0 ? terminalInstances.get(activeInstanceId) : void 0;
      }
      async createTerminal(opts) {
        const cwdUri = opts?.config?.cwd;
        const cwdStr = cwdUri?.fsPath ?? "";
        terminalCreationStarted.push(cwdStr);
        await terminalCreationBarriers.get(cwdStr)?.p;
        const id = nextInstanceId++;
        const instance = makeTerminalInstance(id, cwdStr);
        createdTerminals.push({ cwd: opts?.config?.cwd });
        terminalInstances.set(id, instance);
        if (disposeOnCreatePaths.has(cwdStr)) {
          instance._testSetDisposed(true);
          terminalInstances.delete(id);
        }
        return instance;
      }
      getInstanceFromId(id) {
        return terminalInstances.get(id);
      }
      setActiveInstance(instance) {
        activeInstanceSet.push(instance.instanceId);
        activeInstanceId = instance.instanceId;
      }
      async focusActiveInstance() {
        focusCalls++;
      }
      async safeDisposeTerminal(instance) {
        disposedInstances.push(instance);
        instance._testSetDisposed(true);
        terminalInstances.delete(instance.instanceId);
        backgroundedInstances.delete(instance.instanceId);
        if (activeInstanceId === instance.instanceId) {
          activeInstanceId = void 0;
        }
      }
      moveToBackground(instance) {
        backgroundedInstances.add(instance.instanceId);
        moveToBackgroundCalls.push(instance.instanceId);
      }
      async showBackgroundTerminal(instance) {
        backgroundedInstances.delete(instance.instanceId);
        showBackgroundCalls.push(instance.instanceId);
      }
    }());
    instantiationService.stub(IPathService, new TestPathService(HOME_DIR));
    instantiationService.stub(IAgentHostTerminalService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.profiles = constObservable([]);
      }
      getProfileForConnection() {
        return void 0;
      }
      setDefaultCwd(cwd) {
        defaultCwdCalls.push(cwd);
      }
      async createTerminalForEntry(address, options) {
        const cwd = typeof options?.cwd === "string" ? URI.file(options.cwd) : options?.cwd;
        if (!cwd) {
          return void 0;
        }
        const instance = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
        agentHostTerminalAddresses.push(address);
        createdTerminals.push({ cwd });
        terminalInstances.set(instance.instanceId, instance);
        return instance;
      }
    }());
    instantiationService.stub(ITerminalProfileService, new class extends mock() {
      overrideDefaultProfile() {
        return Disposable.None;
      }
    }());
    instantiationService.stub(ISessionsProvidersService, new class extends mock() {
      getProvider(providerId) {
        return sessionProviders.get(providerId);
      }
    }());
    instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));
    instantiationService.stub(IViewsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeViewVisibility = store.add(new Emitter()).event;
      }
      isViewVisible() {
        return false;
      }
    }());
    contribution = store.add(instantiationService.createInstance(SessionsTerminalContribution));
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("creates a terminal at the worktree for a background session", async () => {
    const worktreeUri = URI.file("/worktree");
    const session = makeAgentSession({ worktree: worktreeUri, repository: URI.file("/repo"), providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, worktreeUri.fsPath);
  });
  test("falls back to repository when worktree is undefined for a background session", async () => {
    const repoUri = URI.file("/repo");
    const session = makeAgentSession({ repository: repoUri, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, repoUri.fsPath);
  });
  test("uses worktree directory for a cloud agent session when workspace exists", async () => {
    const session = makeAgentSession({ worktree: URI.file("/worktree"), repository: URI.file("/repo"), providerType: AgentSessionProviders.Cloud });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, URI.file("/worktree").fsPath);
  });
  test("uses worktree directory for a local agent session when workspace exists", async () => {
    const session = makeAgentSession({ worktree: URI.file("/worktree"), providerType: AgentSessionProviders.Local });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, URI.file("/worktree").fsPath);
  });
  test("uses home directory for a non-agent session", async () => {
    const session = makeNonAgentSession({ repository: URI.file("/repo") });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, HOME_DIR.fsPath);
  });
  test("creates separate terminals when different non-background sessions share the home directory", async () => {
    const session1 = makeAgentSession({ providerType: AgentSessionProviders.Cloud, sessionId: "test:cloud-1" });
    activeSessionObs.set(session1, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    const session2 = makeAgentSession({ providerType: AgentSessionProviders.Local, sessionId: "test:local-1" });
    activeSessionObs.set(session2, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 2);
  });
  test("does not create a terminal when there is no active session", async () => {
    activeSessionObs.set(void 0, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 0);
  });
  test("waits for a loading session before creating a terminal", async () => {
    const worktreeUri = URI.file("/worktree");
    const session = makeAgentSession({ worktree: worktreeUri, providerType: AgentSessionProviders.Background, loading: true });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 0, "should not create a terminal while session is loading");
    assert.strictEqual(defaultCwdCalls.at(-1), void 0, "should not set the default cwd while session is loading");
    session.loading.set(false, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, worktreeUri.fsPath);
    assert.strictEqual(defaultCwdCalls.at(-1)?.fsPath, worktreeUri.fsPath);
  });
  test("does not recreate terminal for the same path", async () => {
    const worktreeUri = URI.file("/worktree");
    const session1 = makeAgentSession({ sessionId: "test:session-1", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session1, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    const session2 = makeAgentSession({ sessionId: "test:session-1", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session2, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
  });
  test("creates new terminal when switching to a different background path", async () => {
    const worktree1 = URI.file("/worktree1");
    const worktree2 = URI.file("/worktree2");
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: worktree1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-2", worktree: worktree2, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 2);
    assert.strictEqual(createdTerminals[1].cwd.fsPath, worktree2.fsPath);
  });
  test("ensureTerminal creates terminal and sets it active", async () => {
    const cwd = URI.file("/test-cwd");
    await contribution.ensureTerminal(cwd, false);
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, cwd.fsPath);
    assert.strictEqual(activeInstanceSet.length, 1);
    assert.strictEqual(focusCalls, 0);
  });
  test("ensureTerminal focuses when requested", async () => {
    const cwd = URI.file("/test-cwd");
    await contribution.ensureTerminal(cwd, true);
    assert.strictEqual(focusCalls, 1);
  });
  test("ensureTerminal reuses existing terminal for same path", async () => {
    const cwd = URI.file("/test-cwd");
    await contribution.ensureTerminal(cwd, false);
    await contribution.ensureTerminal(cwd, false);
    assert.strictEqual(createdTerminals.length, 1, "should reuse the existing terminal");
    assert.strictEqual(activeInstanceSet.length, 1, "should only set active instance on creation");
  });
  test("ensureTerminal creates new terminal for different path", async () => {
    await contribution.ensureTerminal(URI.file("/cwd1"), false);
    await contribution.ensureTerminal(URI.file("/cwd2"), false);
    assert.strictEqual(createdTerminals.length, 2);
  });
  test("ensureTerminal path comparison is case-insensitive", async () => {
    await contribution.ensureTerminal(URI.file("/Test/CWD"), false);
    await contribution.ensureTerminal(URI.file("/test/cwd"), false);
    assert.strictEqual(createdTerminals.length, 1, "should match case-insensitively");
  });
  test("ensureTerminal does not activate a terminal disposed during creation", async () => {
    const cwd = URI.file("/test-cwd");
    disposeOnCreatePaths.add(cwd.fsPath);
    const instances = await contribution.ensureTerminal(cwd, false);
    assert.strictEqual(instances.length, 0);
    assert.strictEqual(activeInstanceSet.length, 0);
    assert.ok(logService.traces.some((message) => message.includes(`Cannot activate created terminal for ${cwd.fsPath}; terminal 1 is no longer available`)));
  });
  test("reuses one terminal across repeated same-cwd replacement drafts", async () => {
    const cwd = URI.file("/worktree");
    sessionProviders.set("agenthost-one", new class extends mock() {
      constructor() {
        super(...arguments);
        this.id = "agenthost-one";
        this.remoteAddress = "ssh-remote+one";
      }
    }());
    let currentSession = makeAgentSession({
      sessionId: "test:draft-1",
      providerId: "agenthost-one",
      worktree: cwd,
      providerType: AgentSessionProviders.Background
    });
    const [firstTerminal] = await contribution.ensureTerminal(cwd, false, currentSession);
    let latestResult = [firstTerminal];
    for (let i = 2; i <= 10; i++) {
      const nextSession = makeAgentSession({
        sessionId: `test:draft-${i}`,
        providerId: "agenthost-one",
        worktree: cwd,
        providerType: AgentSessionProviders.Background
      });
      onDidReplaceNewDraftSession.fire({ from: currentSession, to: nextSession });
      latestResult = await contribution.ensureTerminal(cwd, false, nextSession);
      currentSession = nextSession;
    }
    assert.deepStrictEqual({
      created: createdTerminals.length,
      agentHostAddresses: agentHostTerminalAddresses,
      transferredTerminalId: latestResult[0]?.instanceId,
      disposed: disposedInstances.map((instance) => instance.instanceId)
    }, {
      created: 1,
      agentHostAddresses: ["ssh-remote+one"],
      transferredTerminalId: firstTerminal.instanceId,
      disposed: []
    });
  });
  test("transfers all tracked terminals to a same-cwd replacement draft", async () => {
    const cwd = URI.file("/worktree");
    const firstSession = makeAgentSession({ sessionId: "test:first-draft", worktree: cwd, providerType: AgentSessionProviders.Background });
    const secondSession = makeAgentSession({ sessionId: "test:second-draft", worktree: cwd, providerType: AgentSessionProviders.Background });
    const first = makeTerminalInstance(1, cwd.fsPath);
    const second = makeTerminalInstance(2, cwd.fsPath);
    terminalInstances.set(first.instanceId, first);
    terminalInstances.set(second.instanceId, second);
    nextInstanceId = 3;
    await contribution.ensureTerminal(cwd, false, firstSession);
    onDidReplaceNewDraftSession.fire({ from: firstSession, to: secondSession });
    const result = await contribution.ensureTerminal(cwd, false, secondSession);
    assert.deepStrictEqual({
      result: result.map((instance) => instance.instanceId),
      created: createdTerminals.length,
      disposed: disposedInstances.map((instance) => instance.instanceId)
    }, {
      result: [1, 2],
      created: 0,
      disposed: []
    });
  });
  test("rehomes terminals when replacement drafts use different cwd values", async () => {
    const firstCwd = URI.file("/worktree-one");
    const secondCwd = URI.file("/worktree-two");
    const thirdSession = makeAgentSession({ sessionId: "test:third-draft", worktree: firstCwd, providerType: AgentSessionProviders.Background });
    const firstSession = makeAgentSession({ sessionId: "test:first-draft", worktree: firstCwd, providerType: AgentSessionProviders.Background });
    const secondSession = makeAgentSession({ sessionId: "test:second-draft", worktree: secondCwd, providerType: AgentSessionProviders.Background });
    const [firstTerminal] = await contribution.ensureTerminal(firstCwd, false, firstSession);
    addCommandToInstance(firstTerminal, 100);
    onDidReplaceNewDraftSession.fire({ from: firstSession, to: secondSession });
    activeSessionObs.set(secondSession, void 0);
    await tick();
    const secondTerminal = terminalInstances.get(activeInstanceId);
    onDidReplaceNewDraftSession.fire({ from: secondSession, to: thirdSession });
    activeSessionObs.set(thirdSession, void 0);
    await tick();
    const thirdTerminal = terminalInstances.get(activeInstanceId);
    assert.deepStrictEqual({
      createdCwds: createdTerminals.map((terminal) => terminal.cwd.fsPath),
      firstStillAlive: terminalInstances.has(firstTerminal.instanceId),
      secondStillAlive: secondTerminal ? terminalInstances.has(secondTerminal.instanceId) : false,
      thirdTerminalId: thirdTerminal?.instanceId,
      activeTerminalId: activeInstanceId,
      backgrounded: moveToBackgroundCalls,
      disposed: disposedInstances.map((instance) => instance.instanceId)
    }, {
      createdCwds: [firstCwd.fsPath, secondCwd.fsPath, firstCwd.fsPath],
      firstStillAlive: true,
      secondStillAlive: true,
      thirdTerminalId: 3,
      activeTerminalId: 3,
      backgrounded: [],
      disposed: []
    });
  });
  test("rehomes a same-cwd terminal when the Agent Host backend changes", async () => {
    const cwd = URI.file("/worktree");
    sessionProviders.set("agenthost-one", new class extends mock() {
      constructor() {
        super(...arguments);
        this.id = "agenthost-one";
        this.remoteAddress = "ssh-remote+one";
      }
    }());
    sessionProviders.set("agenthost-two", new class extends mock() {
      constructor() {
        super(...arguments);
        this.id = "agenthost-two";
        this.remoteAddress = "ssh-remote+two";
      }
    }());
    const firstSession = makeAgentSession({
      sessionId: "test:first-draft",
      providerId: "agenthost-one",
      worktree: cwd,
      providerType: AgentSessionProviders.Background
    });
    const secondSession = makeAgentSession({
      sessionId: "test:second-draft",
      providerId: "agenthost-two",
      worktree: cwd,
      providerType: AgentSessionProviders.Background
    });
    const [firstTerminal] = await contribution.ensureTerminal(cwd, false, firstSession);
    onDidReplaceNewDraftSession.fire({ from: firstSession, to: secondSession });
    activeSessionObs.set(secondSession, void 0);
    await tick();
    const secondTerminal = terminalInstances.get(activeInstanceId);
    assert.deepStrictEqual({
      created: createdTerminals.length,
      agentHostAddresses: agentHostTerminalAddresses,
      firstStillAlive: terminalInstances.has(firstTerminal.instanceId),
      secondTerminalId: secondTerminal?.instanceId,
      backgrounded: moveToBackgroundCalls,
      disposed: disposedInstances.map((instance) => instance.instanceId)
    }, {
      created: 2,
      agentHostAddresses: ["ssh-remote+one", "ssh-remote+two"],
      firstStillAlive: true,
      secondTerminalId: 2,
      backgrounded: [],
      disposed: []
    });
  });
  test("allows generic lookup to reuse a standalone terminal", async () => {
    const firstCwd = URI.file("/worktree-one");
    const secondCwd = URI.file("/worktree-two");
    const firstSession = makeAgentSession({ sessionId: "test:first-draft", worktree: firstCwd, providerType: AgentSessionProviders.Background });
    const secondSession = makeAgentSession({ sessionId: "test:second-draft", worktree: secondCwd, providerType: AgentSessionProviders.Background });
    const [firstTerminal] = await contribution.ensureTerminal(firstCwd, false, firstSession);
    onDidReplaceNewDraftSession.fire({ from: firstSession, to: secondSession });
    const result = await contribution.ensureTerminal(firstCwd, false);
    assert.deepStrictEqual({
      result: result.map((instance) => instance.instanceId),
      created: createdTerminals.length
    }, {
      result: [firstTerminal.instanceId],
      created: 1
    });
  });
  test("disposes a terminal whose creation finishes after its draft is replaced", async () => {
    const firstCwd = URI.file("/worktree-one");
    const secondCwd = URI.file("/worktree-two");
    const firstSession = makeAgentSession({ sessionId: "test:first-draft", worktree: firstCwd, providerType: AgentSessionProviders.Background });
    const secondSession = makeAgentSession({ sessionId: "test:second-draft", worktree: secondCwd, providerType: AgentSessionProviders.Background });
    const creationBarrier = new DeferredPromise();
    terminalCreationBarriers.set(firstCwd.fsPath, creationBarrier);
    const operation = contribution.ensureTerminal(firstCwd, false, firstSession);
    await tick();
    assert.deepStrictEqual(terminalCreationStarted, [firstCwd.fsPath]);
    onDidReplaceNewDraftSession.fire({ from: firstSession, to: secondSession });
    await creationBarrier.complete();
    const result = await operation;
    assert.deepStrictEqual({
      result: result.map((instance) => instance.instanceId),
      disposed: disposedInstances.map((instance) => instance.instanceId),
      activated: activeInstanceSet,
      remaining: [...terminalInstances.keys()]
    }, {
      result: [],
      disposed: [1],
      activated: [],
      remaining: []
    });
  });
  test("leaves an existing terminal untouched when lookup finishes after replacement", async () => {
    const firstCwd = URI.file("/worktree-one");
    const secondCwd = URI.file("/worktree-two");
    const firstSession = makeAgentSession({ sessionId: "test:first-draft", worktree: firstCwd, providerType: AgentSessionProviders.Background });
    const secondSession = makeAgentSession({ sessionId: "test:second-draft", worktree: secondCwd, providerType: AgentSessionProviders.Background });
    const cwdBarrier = new DeferredPromise();
    const existing = makeTerminalInstance(1, firstCwd.fsPath);
    existing._testSetInitialCwdBarrier(cwdBarrier.p);
    terminalInstances.set(existing.instanceId, existing);
    nextInstanceId = 2;
    const operation = contribution.ensureTerminal(firstCwd, false, firstSession);
    await tick();
    onDidReplaceNewDraftSession.fire({ from: firstSession, to: secondSession });
    await cwdBarrier.complete();
    const result = await operation;
    assert.deepStrictEqual({
      result: result.map((instance) => instance.instanceId),
      disposed: disposedInstances.map((instance) => instance.instanceId),
      remaining: [...terminalInstances.keys()]
    }, {
      result: [],
      disposed: [],
      remaining: [1]
    });
  });
  test("hides (does not dispose) terminals when session is archived", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:archived-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    assert.strictEqual(createdTerminals.length, 1);
    const otherSession = makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background });
    activeSessionObs.set(otherSession, void 0);
    await tick();
    moveToBackgroundCalls.length = 0;
    const session = makeAgentSession({
      sessionId: "test:archived-session",
      isArchived: true,
      worktree: worktreeUri,
      providerType: AgentSessionProviders.Background
    });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "archived session terminal must be hidden, not disposed");
    assert.deepStrictEqual(moveToBackgroundCalls, [1], "archived session terminal should be moved to background");
  });
  test("does not hide or dispose terminals when session is not archived", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:active-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    moveToBackgroundCalls.length = 0;
    const session = makeAgentSession({
      sessionId: "test:active-session",
      isArchived: false,
      worktree: worktreeUri
    });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0);
    assert.strictEqual(moveToBackgroundCalls.length, 0);
  });
  test("does not log info when an archived session has no tracked terminals", async () => {
    const session = makeAgentSession({
      sessionId: "test:archived-without-terminal",
      isArchived: true,
      worktree: URI.file("/worktree"),
      providerType: AgentSessionProviders.Background
    });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
    await tick();
    assert.deepStrictEqual(logService.infos, []);
  });
  test("does not hide or dispose terminals when archived session has no worktree", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:active-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    moveToBackgroundCalls.length = 0;
    const session = makeAgentSession({ sessionId: "test:archived-session", isArchived: true });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0);
    assert.strictEqual(moveToBackgroundCalls.length, 0);
  });
  test("hides terminals when archived session has only a repository (no worktree)", async () => {
    const repoUri = URI.file("/repo");
    const session = makeAgentSession({ sessionId: "test:repo-session", repository: repoUri, providerType: AgentSessionProviders.Background, isArchived: false });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].cwd.fsPath, repoUri.fsPath);
    const otherSession = makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background });
    activeSessionObs.set(otherSession, void 0);
    await tick();
    moveToBackgroundCalls.length = 0;
    const archivedSession = makeAgentSession({ sessionId: "test:repo-session", repository: repoUri, providerType: AgentSessionProviders.Background, isArchived: true });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "archived repo-only session terminal must be hidden, not disposed");
    assert.deepStrictEqual(moveToBackgroundCalls, [1]);
  });
  test("does not hide the terminal at the active session cwd when archiving (just-opened terminal is protected)", async () => {
    const worktreeUri = URI.file("/worktree");
    const activeSession = makeAgentSession({ sessionId: "test:active-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(activeSession, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    moveToBackgroundCalls.length = 0;
    const archivedSession = makeAgentSession({ sessionId: "test:archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background, isArchived: true });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "terminal at the active session cwd must not be disposed");
    assert.strictEqual(moveToBackgroundCalls.length, 0, "terminal at the active session cwd must not be hidden");
  });
  test("does not re-hide a newly-opened terminal when an already-archived session is re-emitted", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    await contribution.ensureTerminal(URI.file("/other"), false, makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background }));
    const archivedSession = makeAgentSession({ sessionId: "test:archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background, isArchived: true });
    moveToBackgroundCalls.length = 0;
    onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0);
    assert.deepStrictEqual(moveToBackgroundCalls, [1]);
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:later-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    await contribution.ensureTerminal(URI.file("/other"), false, makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background }));
    activeInstanceId = 2;
    moveToBackgroundCalls.length = 0;
    onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "re-emitted archived session must not dispose any terminal");
    assert.strictEqual(moveToBackgroundCalls.length, 0, "re-emitted archived session must not re-hide the newly-opened terminal");
  });
  test("does not hide terminals for a session that was already archived when the contribution started", async () => {
    const worktreeUri = URI.file("/worktree");
    const archivedSession = makeAgentSession({ sessionId: "test:restored-archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background, isArchived: true });
    allSessions = [archivedSession];
    contribution.dispose();
    const freshContribution = store.add(instantiationService.createInstance(SessionsTerminalContribution));
    await freshContribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:restored-archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    await freshContribution.ensureTerminal(URI.file("/other"), false, makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background }));
    moveToBackgroundCalls.length = 0;
    onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "already-archived session must not dispose any terminal");
    assert.strictEqual(moveToBackgroundCalls.length, 0, "already-archived session must not be treated as a fresh archive transition");
  });
  test("closes terminals when a non-focused session is removed", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:removed-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    await contribution.ensureTerminal(URI.file("/other"), false, makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background }));
    assert.strictEqual(createdTerminals.length, 2);
    const session = makeAgentSession({ sessionId: "test:removed-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
    await tick();
    assert.strictEqual(disposedInstances.length, 1);
  });
  test("does not log info when a removed session has no tracked terminals", async () => {
    const session = makeAgentSession({
      sessionId: "test:removed-without-terminal",
      worktree: URI.file("/worktree"),
      providerType: AgentSessionProviders.Background
    });
    onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
    await tick();
    assert.deepStrictEqual(logService.infos, []);
  });
  test("does not dispose the focused terminal when its session is removed (graduation case)", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:untitled", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    assert.strictEqual(createdTerminals.length, 1);
    const skeleton = makeAgentSession({ sessionId: "test:untitled", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    onDidChangeSessions.fire({ added: [], removed: [skeleton], changed: [] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "the focused terminal must not be disposed on graduation");
  });
  test("closes only the removed session terminal when sessions share a cwd", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:untitled", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:committed", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    const fromSession = makeAgentSession({ sessionId: "test:untitled", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    const toSession = makeAgentSession({ sessionId: "test:committed", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    allSessions = [toSession];
    onDidChangeSessions.fire({ added: [], removed: [fromSession], changed: [toSession] });
    await tick();
    assert.deepStrictEqual(disposedInstances.map((instance) => instance.instanceId), [1], "only the removed session terminal should be closed");
    assert.ok(terminalInstances.has(2), "the surviving session terminal should remain");
  });
  test("hides only the archived session terminal when sessions share a cwd", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:live", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    const liveSession = makeAgentSession({ sessionId: "test:live", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    const archivedSession = makeAgentSession({ sessionId: "test:archived", worktree: worktreeUri, providerType: AgentSessionProviders.Background, isArchived: true });
    allSessions = [liveSession, archivedSession];
    activeSessionObs.set(liveSession, void 0);
    await tick();
    activeInstanceId = 1;
    moveToBackgroundCalls.length = 0;
    onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "terminal should be hidden, not disposed");
    assert.deepStrictEqual(moveToBackgroundCalls, [2], "only the archived session terminal should be hidden");
  });
  test("closes terminal when the only session at a cwd is removed even if other live sessions exist elsewhere", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:gone", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    const otherLive = makeAgentSession({ sessionId: "test:other", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background });
    const removedSession = makeAgentSession({ sessionId: "test:gone", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    allSessions = [otherLive];
    await contribution.ensureTerminal(URI.file("/other"), false, makeAgentSession({ sessionId: "test:other", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background }));
    onDidChangeSessions.fire({ added: [], removed: [removedSession], changed: [] });
    await tick();
    assert.strictEqual(disposedInstances.length, 1, "no live session owns this cwd, terminal should be closed");
  });
  test("switching back to a previously used background path reuses the existing terminal", async () => {
    const cwd1 = URI.file("/cwd1");
    const cwd2 = URI.file("/cwd2");
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-2", worktree: cwd2, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 2);
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 2, "should reuse the terminal for cwd1");
  });
  test("hides terminals from previous session when switching to a new session", async () => {
    const cwd1 = URI.file("/cwd1");
    const cwd2 = URI.file("/cwd2");
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1);
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-2", worktree: cwd2, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.ok(moveToBackgroundCalls.includes(1), "terminal for cwd1 should be backgrounded");
    assert.ok(backgroundedInstances.has(1), "terminal for cwd1 should remain backgrounded");
  });
  test("shows previously hidden terminals when switching back to their session", async () => {
    const cwd1 = URI.file("/cwd1");
    const cwd2 = URI.file("/cwd2");
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-2", worktree: cwd2, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.ok(showBackgroundCalls.includes(1), "terminal for cwd1 should be shown");
    assert.ok(!backgroundedInstances.has(1), "terminal for cwd1 should be foreground");
    assert.ok(backgroundedInstances.has(2), "terminal for cwd2 should be backgrounded");
  });
  test("only terminals of the active session are visible after multiple switches", async () => {
    const cwd1 = URI.file("/cwd1");
    const cwd2 = URI.file("/cwd2");
    const cwd3 = URI.file("/cwd3");
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-2", worktree: cwd2, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-3", worktree: cwd3, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.ok(backgroundedInstances.has(1), "terminal for cwd1 should be backgrounded");
    assert.ok(backgroundedInstances.has(2), "terminal for cwd2 should be backgrounded");
    assert.ok(!backgroundedInstances.has(3), "terminal for cwd3 should be foreground");
  });
  test("shows pre-existing terminal with matching cwd instead of creating a new one", async () => {
    const cwd = URI.file("/worktree");
    const existingInstance = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    terminalInstances.set(existingInstance.instanceId, existingInstance);
    backgroundedInstances.add(existingInstance.instanceId);
    activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 0, "should reuse existing terminal, not create a new one");
    assert.ok(showBackgroundCalls.includes(existingInstance.instanceId), "should show the existing terminal");
  });
  test("does not background a restored terminal that is disposed before cwd resolves", async () => {
    let resolveInitialCwd;
    const restoredInstance = makeTerminalInstance(nextInstanceId++, "/restored");
    restoredInstance._testSetShellLaunchConfig({ attachPersistentProcess: {} });
    restoredInstance.getInitialCwd = () => new Promise((resolve) => {
      resolveInitialCwd = resolve;
    });
    terminalInstances.set(restoredInstance.instanceId, restoredInstance);
    activeSessionObs.set(makeAgentSession({ sessionId: "test:active-session", worktree: URI.file("/active"), providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    onDidCreateInstance.fire(restoredInstance);
    restoredInstance._testSetDisposed(true);
    terminalInstances.delete(restoredInstance.instanceId);
    resolveInitialCwd?.("/other");
    await tick();
    assert.ok(!moveToBackgroundCalls.includes(restoredInstance.instanceId), "disposed restored terminal should not be backgrounded");
    assert.ok(logService.traces.some((message) => message.includes("Cannot hide restored terminal for /other; terminal") && message.includes("is no longer available")));
  });
  test("hides pre-existing terminal with non-matching cwd when session changes", async () => {
    const otherInstance = makeTerminalInstance(nextInstanceId++, "/other/path");
    terminalInstances.set(otherInstance.instanceId, otherInstance);
    const cwd = URI.file("/worktree");
    activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.ok(moveToBackgroundCalls.includes(otherInstance.instanceId), "non-matching terminal should be backgrounded");
  });
  test("ensureTerminal finds a backgrounded terminal instead of creating a new one", async () => {
    const cwd = URI.file("/test-cwd");
    await contribution.ensureTerminal(cwd, false);
    const instanceId = activeInstanceSet[0];
    backgroundedInstances.add(instanceId);
    const result = await contribution.ensureTerminal(cwd, false);
    assert.strictEqual(createdTerminals.length, 1, "should not create a new terminal");
    assert.strictEqual(result[0].instanceId, instanceId, "should return the existing backgrounded terminal");
  });
  test("does not reuse an untracked cwd match when it is already tracked to another session", async () => {
    const cwd = URI.file("/shared");
    const session1 = makeAgentSession({ sessionId: "test:session-1", worktree: cwd, providerType: AgentSessionProviders.Background });
    const session2 = makeAgentSession({ sessionId: "test:session-2", worktree: cwd, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session1, void 0);
    await tick();
    activeSessionObs.set(session2, void 0);
    await tick();
    assert.deepStrictEqual(createdTerminals.map((terminal) => terminal.cwd.fsPath), [cwd.fsPath, cwd.fsPath]);
    assert.ok(backgroundedInstances.has(1), "the first session terminal should be backgrounded");
    assert.ok(!backgroundedInstances.has(2), "the second session terminal should stay visible");
  });
  test("visibility is determined by tracked session terminals when sessions share a cwd", async () => {
    const cwd = URI.file("/cwd");
    const session1 = makeAgentSession({ sessionId: "test:session-1", worktree: cwd, providerType: AgentSessionProviders.Background });
    const session2 = makeAgentSession({ sessionId: "test:session-2", worktree: cwd, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session1, void 0);
    await tick();
    activeSessionObs.set(session2, void 0);
    await tick();
    assert.ok(backgroundedInstances.has(1), "session 1 terminal should be backgrounded when session 2 is active");
    assert.ok(!backgroundedInstances.has(2), "session 2 terminal should be foreground");
    activeSessionObs.set(session1, void 0);
    await tick();
    assert.ok(!backgroundedInstances.has(1), "session 1 terminal should be shown again when reactivated");
    assert.ok(backgroundedInstances.has(2), "session 2 terminal should be backgrounded when session 1 is active");
  });
  test("sets the terminal with the most recent command as active after visibility update", async () => {
    const cwd = URI.file("/worktree");
    const t1 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    const t2 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    terminalInstances.set(t1.instanceId, t1);
    terminalInstances.set(t2.instanceId, t2);
    addCommandToInstance(t1, 100);
    addCommandToInstance(t2, 200);
    activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(activeInstanceSet.at(-1), t2.instanceId, "should set the terminal with the most recent command as active");
  });
  test("does not change active instance when no terminals have command history", async () => {
    const cwd = URI.file("/worktree");
    const t1 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    const t2 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    terminalInstances.set(t1.instanceId, t1);
    terminalInstances.set(t2.instanceId, t2);
    const activeCountBefore = activeInstanceSet.length;
    activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.strictEqual(activeInstanceSet.length, activeCountBefore, "should not call setActiveInstance when no command history exists");
  });
  test("uses the unwrapped repository path for a background session with a remote agent host repository", async () => {
    const remoteRepoUri = toAgentHostUri(URI.file("/Users/user/repo"), "my-server");
    const session = makeAgentSession({ repository: remoteRepoUri, providerType: AgentSessionProviders.Background });
    activeSessionObs.set(session, void 0);
    await tick();
    assert.strictEqual(createdTerminals.length, 1, "should create a terminal at the unwrapped repository path");
    assert.strictEqual(createdTerminals[0].cwd.fsPath, URI.file("/Users/user/repo").fsPath);
  });
  test("does not hide hidden tool terminals when session is archived", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:regular-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    const toolTerminal = makeTerminalInstance(nextInstanceId++, worktreeUri.fsPath);
    toolTerminal._testSetShellLaunchConfig({ hideFromUser: true });
    terminalInstances.set(toolTerminal.instanceId, toolTerminal);
    const otherSession = makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background });
    activeSessionObs.set(otherSession, void 0);
    await tick();
    moveToBackgroundCalls.length = 0;
    const session = makeAgentSession({
      sessionId: "test:regular-session",
      isArchived: true,
      worktree: worktreeUri,
      providerType: AgentSessionProviders.Background
    });
    onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "archived session terminal must be hidden, not disposed");
    assert.deepStrictEqual(moveToBackgroundCalls, [1], "only the regular terminal should be hidden, not the tool terminal");
  });
  test("does not dispose hidden tool terminals when session is removed", async () => {
    const worktreeUri = URI.file("/worktree");
    await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: "test:regular-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
    const toolTerminal = makeTerminalInstance(nextInstanceId++, worktreeUri.fsPath);
    toolTerminal._testSetShellLaunchConfig({ hideFromUser: true });
    terminalInstances.set(toolTerminal.instanceId, toolTerminal);
    await contribution.ensureTerminal(URI.file("/other"), false, makeAgentSession({ sessionId: "test:other-session", worktree: URI.file("/other"), providerType: AgentSessionProviders.Background }));
    const session = makeAgentSession({ sessionId: "test:regular-session", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
    await tick();
    assert.strictEqual(disposedInstances.length, 1, "should dispose exactly one terminal");
    assert.notStrictEqual(disposedInstances[0].instanceId, toolTerminal.instanceId, "should not dispose the tool terminal");
  });
  test("does not background hidden tool terminals during session switch", async () => {
    const cwd1 = URI.file("/cwd1");
    const cwd2 = URI.file("/cwd2");
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-1", worktree: cwd1, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    const toolTerminal = makeTerminalInstance(nextInstanceId++, cwd1.fsPath);
    toolTerminal._testSetShellLaunchConfig({ hideFromUser: true });
    terminalInstances.set(toolTerminal.instanceId, toolTerminal);
    activeSessionObs.set(makeAgentSession({ sessionId: "test:session-2", worktree: cwd2, providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    assert.ok(!moveToBackgroundCalls.includes(toolTerminal.instanceId), "hidden tool terminal should not be moved to background");
  });
  test("does not include hidden tool terminals in ensureTerminal matches", async () => {
    const cwd = URI.file("/worktree");
    const toolTerminal = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    toolTerminal._testSetShellLaunchConfig({ hideFromUser: true });
    terminalInstances.set(toolTerminal.instanceId, toolTerminal);
    await contribution.ensureTerminal(cwd, false);
    assert.strictEqual(createdTerminals.length, 1, "should create a new terminal since tool terminal is hidden");
  });
  test("does not hide restored hidden tool terminals on session create", async () => {
    activeSessionObs.set(makeAgentSession({ sessionId: "test:active-session", worktree: URI.file("/active"), providerType: AgentSessionProviders.Background }), void 0);
    await tick();
    const toolTerminal = makeTerminalInstance(nextInstanceId++, "/other");
    toolTerminal._testSetShellLaunchConfig({
      hideFromUser: true,
      attachPersistentProcess: {}
    });
    terminalInstances.set(toolTerminal.instanceId, toolTerminal);
    onDidCreateInstance.fire(toolTerminal);
    await tick();
    assert.ok(!moveToBackgroundCalls.includes(toolTerminal.instanceId), "hidden tool terminal should not be moved to background on restore");
  });
  test("transfers tracked terminals when a session is replaced (graduation)", async () => {
    const worktreeUri = URI.file("/worktree");
    const untitledSession = makeAgentSession({ sessionId: "test:untitled", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    const committedSession = makeAgentSession({ sessionId: "test:committed", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    await contribution.ensureTerminal(worktreeUri, false, untitledSession);
    assert.strictEqual(createdTerminals.length, 1);
    const terminalId = [...terminalInstances.keys()][0];
    onDidReplaceSession.fire({ from: untitledSession, to: committedSession });
    activeInstanceId = void 0;
    onDidChangeSessions.fire({ added: [], removed: [untitledSession], changed: [] });
    await tick();
    assert.strictEqual(disposedInstances.length, 0, "terminal should survive graduation because tracking was transferred");
    assert.ok(terminalInstances.has(terminalId), "terminal should still exist");
    const result = await contribution.ensureTerminal(worktreeUri, false, committedSession);
    assert.strictEqual(createdTerminals.length, 1, "should reuse the transferred terminal");
    assert.strictEqual(result[0].instanceId, terminalId);
  });
  test("cleans up tracked terminal ids when terminals are externally disposed", async () => {
    const worktreeUri = URI.file("/worktree");
    const session = makeAgentSession({ sessionId: "test:session", worktree: worktreeUri, providerType: AgentSessionProviders.Background });
    await contribution.ensureTerminal(worktreeUri, false, session);
    assert.strictEqual(createdTerminals.length, 1);
    const instance = [...terminalInstances.values()][0];
    instance._testSetDisposed(true);
    terminalInstances.delete(instance.instanceId);
    onDidDisposeInstance.fire(instance);
    const result = await contribution.ensureTerminal(worktreeUri, false, session);
    assert.strictEqual(createdTerminals.length, 2, "should create a new terminal since the tracked one was disposed");
    assert.notStrictEqual(result[0].instanceId, instance.instanceId, "should be a different terminal");
  });
  test("untracked restored terminals are visible alongside tracked terminals for the same session", async () => {
    const cwd = URI.file("/worktree");
    const session = makeAgentSession({ sessionId: "test:session", worktree: cwd, providerType: AgentSessionProviders.Background });
    const restoredTerminal = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
    terminalInstances.set(restoredTerminal.instanceId, restoredTerminal);
    backgroundedInstances.add(restoredTerminal.instanceId);
    activeSessionObs.set(session, void 0);
    await tick();
    assert.ok(showBackgroundCalls.includes(restoredTerminal.instanceId), "untracked restored terminal at matching cwd should be shown");
  });
});
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcdGVybWluYWxcXHRlc3RcXGJyb3dzZXJcXHNlc3Npb25zVGVybWluYWxDb250cmlidXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VGVybWluYWxDcmVhdGVPcHRpb25zLCBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci9hZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSwgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLCBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IHRvQWdlbnRIb3N0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0SW50ZXJhY3Rpdml0eSwgSUNoYXQsIElTZXNzaW9uLCBJU2Vzc2lvbldvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc1Rlcm1pbmFsQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uc1Rlcm1pbmFsQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiwgSVNlc3Npb25zQ2hhbmdlRXZlbnQsIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5cbmNvbnN0IEhPTUVfRElSID0gVVJJLmZpbGUoJy9ob21lL3VzZXInKTtcblxuY2xhc3MgVGVzdExvZ1NlcnZpY2UgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7XG5cdHJlYWRvbmx5IGluZm9zOiBzdHJpbmdbXSA9IFtdO1xuXHRyZWFkb25seSB0cmFjZXM6IHN0cmluZ1tdID0gW107XG5cblx0b3ZlcnJpZGUgaW5mbyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMuaW5mb3MucHVzaChbbWVzc2FnZSwgLi4uYXJnc10uam9pbignICcpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHRyYWNlKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy50cmFjZXMucHVzaChbbWVzc2FnZSwgLi4uYXJnc10uam9pbignICcpKTtcblx0fVxufVxuXG50eXBlIFRlc3RUZXJtaW5hbEluc3RhbmNlID0gSVRlcm1pbmFsSW5zdGFuY2UgJiB7XG5cdF90ZXN0Q29tbWFuZEhpc3Rvcnk6IHsgdGltZXN0YW1wOiBudW1iZXIgfVtdO1xuXHRfdGVzdFNldERpc3Bvc2VkKGRpc3Bvc2VkOiBib29sZWFuKTogdm9pZDtcblx0X3Rlc3RTZXRJbml0aWFsQ3dkQmFycmllcihiYXJyaWVyOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkKTogdm9pZDtcblx0X3Rlc3RTZXRTaGVsbExhdW5jaENvbmZpZyhzaGVsbExhdW5jaENvbmZpZzogSVRlcm1pbmFsSW5zdGFuY2VbJ3NoZWxsTGF1bmNoQ29uZmlnJ10pOiB2b2lkO1xufTtcblxudHlwZSBUZXN0QWN0aXZlU2Vzc2lvbiA9IElBY3RpdmVTZXNzaW9uICYge1xuXHRsb2FkaW5nOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4+O1xufTtcblxuZnVuY3Rpb24gbWFrZUFnZW50U2Vzc2lvbihvcHRzOiB7XG5cdHJlcG9zaXRvcnk/OiBVUkk7XG5cdHdvcmt0cmVlPzogVVJJO1xuXHRwcm92aWRlclR5cGU/OiBzdHJpbmc7XG5cdGlzQXJjaGl2ZWQ/OiBib29sZWFuO1xuXHRsb2FkaW5nPzogYm9vbGVhbjtcblx0c2Vzc2lvbklkPzogc3RyaW5nO1xuXHRwcm92aWRlcklkPzogc3RyaW5nO1xufSk6IFRlc3RBY3RpdmVTZXNzaW9uIHtcblx0Y29uc3QgZm9sZGVyID0gb3B0cy5yZXBvc2l0b3J5IHx8IG9wdHMud29ya3RyZWUgPyB7XG5cdFx0cm9vdDogb3B0cy5yZXBvc2l0b3J5ID8/IG9wdHMud29ya3RyZWUhLFxuXHRcdHdvcmtpbmdEaXJlY3Rvcnk6IG9wdHMud29ya3RyZWUgPz8gb3B0cy5yZXBvc2l0b3J5ISxcblx0XHRuYW1lOiAndGVzdCcsXG5cdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRnaXRSZXBvc2l0b3J5OiB7IHVyaTogb3B0cy5yZXBvc2l0b3J5ID8/IG9wdHMud29ya3RyZWUhLCB3b3JrVHJlZVVyaTogb3B0cy53b3JrdHJlZSwgYmFzZUJyYW5jaE5hbWU6IHVuZGVmaW5lZCwgZ2l0SHViSW5mbzogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCkgfSxcblx0fSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgY2hhdDogSUNoYXQgPSB7XG5cdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9zZXNzaW9uJyksXG5cdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuXHRcdHRpdGxlOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QudGl0bGUnLCAnVGVzdCBTZXNzaW9uJyksXG5cdFx0dXBkYXRlZEF0OiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QudXBkYXRlZEF0JywgbmV3IERhdGUoKSksXG5cdFx0c3RhdHVzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3Quc3RhdHVzJywgMCksXG5cdFx0Y2hhbmdlczogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmNoYW5nZXMnLCBbXSksXG5cdFx0bW9kZWxJZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0Lm1vZGVsSWQnLCB1bmRlZmluZWQpLFxuXHRcdG1vZGU6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5tb2RlJywgdW5kZWZpbmVkKSxcblx0XHRpc0FyY2hpdmVkOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuaXNBcmNoaXZlZCcsIG9wdHMuaXNBcmNoaXZlZCA/PyBmYWxzZSksXG5cdFx0aXNSZWFkOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuaXNSZWFkJywgdHJ1ZSksXG5cdFx0aW50ZXJhY3Rpdml0eTogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmludGVyYWN0aXZpdHknLCBDaGF0SW50ZXJhY3Rpdml0eS5GdWxsKSxcblx0XHRjaGVja3BvaW50czogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmNoZWNrcG9pbnRzJywgdW5kZWZpbmVkKSxcblx0XHRsYXN0VHVybkVuZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0Lmxhc3RUdXJuRW5kJywgdW5kZWZpbmVkKSxcblx0XHRkZXNjcmlwdGlvbjogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmRlc2NyaXB0aW9uJywgdW5kZWZpbmVkKSxcblx0fSBzYXRpc2ZpZXMgSUNoYXQ7XG5cdGNvbnN0IHNlc3Npb24gPSB7XG5cdFx0c2Vzc2lvbklkOiBvcHRzLnNlc3Npb25JZCA/PyAndGVzdDpzZXNzaW9uJyxcblx0XHRyZXNvdXJjZTogY2hhdC5yZXNvdXJjZSxcblx0XHRwcm92aWRlcklkOiBvcHRzLnByb3ZpZGVySWQgPz8gJ3Rlc3QnLFxuXHRcdHNlc3Npb25UeXBlOiBvcHRzLnByb3ZpZGVyVHlwZSA/PyBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsXG5cdFx0aWNvbjogQ29kaWNvbi5jb3BpbG90LFxuXHRcdGNyZWF0ZWRBdDogY2hhdC5jcmVhdGVkQXQsXG5cdFx0d29ya3NwYWNlOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3Qud29ya3NwYWNlJywgZm9sZGVyXG5cdFx0XHQ/IHtcblx0XHRcdFx0dXJpOiBmb2xkZXIucm9vdCxcblx0XHRcdFx0bGFiZWw6ICd0ZXN0Jyxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5yZXBvLFxuXHRcdFx0XHRmb2xkZXJzOiBbZm9sZGVyXSxcblx0XHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0XHRcdGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2Vcblx0XHRcdH0gc2F0aXNmaWVzIElTZXNzaW9uV29ya3NwYWNlXG5cdFx0XHQ6IHVuZGVmaW5lZCksXG5cdFx0dGl0bGU6IGNoYXQudGl0bGUsXG5cdFx0dXBkYXRlZEF0OiBjaGF0LnVwZGF0ZWRBdCxcblx0XHRzdGF0dXM6IGNoYXQuc3RhdHVzLFxuXHRcdGNoYW5nZXNldHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0Y2hhbmdlczogY2hhdC5jaGFuZ2VzLFxuXHRcdG1vZGVsSWQ6IGNoYXQubW9kZWxJZCxcblx0XHRtb2RlOiBjaGF0Lm1vZGUsXG5cdFx0bG9hZGluZzogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmxvYWRpbmcnLCBvcHRzLmxvYWRpbmcgPz8gZmFsc2UpLFxuXHRcdGlzQXJjaGl2ZWQ6IGNoYXQuaXNBcmNoaXZlZCxcblx0XHRpc1JlYWQ6IGNoYXQuaXNSZWFkLFxuXHRcdGxhc3RUdXJuRW5kOiBjaGF0Lmxhc3RUdXJuRW5kLFxuXHRcdGRlc2NyaXB0aW9uOiBjaGF0LmRlc2NyaXB0aW9uLFxuXHRcdGNoYXRzOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuY2hhdHMnLCBbY2hhdF0pLFxuXHRcdGFjdGl2ZUNoYXQ6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5hY3RpdmVDaGF0JywgY2hhdCksXG5cdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UgfSksXG5cdFx0aXNDcmVhdGVkOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuaXNDcmVhdGVkJywgdHJ1ZSksXG5cdFx0c3RpY2t5OiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3Quc3RpY2t5JywgZmFsc2UpLFxuXHRcdG9wZW5DaGF0czogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0Lm9wZW5DaGF0cycsIFtjaGF0XSksXG5cdFx0Y2xvc2VkQ2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0bGFzdENsb3NlZENoYXQ6IHVuZGVmaW5lZCxcblx0XHR2aXNpYmxlQ2hhdFRhYnM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdHNob3VsZFNob3dDaGF0VGFiczogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0fSBzYXRpc2ZpZXMgVGVzdEFjdGl2ZVNlc3Npb247XG5cdHJldHVybiBzZXNzaW9uO1xufVxuXG5mdW5jdGlvbiBtYWtlTm9uQWdlbnRTZXNzaW9uKG9wdHM6IHsgcmVwb3NpdG9yeT86IFVSSTsgd29ya3RyZWU/OiBVUkk7IHByb3ZpZGVyVHlwZT86IHN0cmluZzsgc2Vzc2lvbklkPzogc3RyaW5nIH0pOiBJU2Vzc2lvbiB7XG5cdGNvbnN0IGZvbGRlciA9IG9wdHMucmVwb3NpdG9yeSB8fCBvcHRzLndvcmt0cmVlID8ge1xuXHRcdHJvb3Q6IG9wdHMucmVwb3NpdG9yeSA/PyBvcHRzLndvcmt0cmVlISxcblx0XHR3b3JraW5nRGlyZWN0b3J5OiBvcHRzLndvcmt0cmVlID8/IG9wdHMucmVwb3NpdG9yeSEsXG5cdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0Z2l0UmVwb3NpdG9yeTogeyB1cmk6IG9wdHMucmVwb3NpdG9yeSA/PyBvcHRzLndvcmt0cmVlISwgd29ya1RyZWVVcmk6IG9wdHMud29ya3RyZWUsIGJhc2VCcmFuY2hOYW1lOiB1bmRlZmluZWQsIGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpIH0sXG5cdH0gOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGNoYXQ6IElDaGF0ID0ge1xuXHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vc2Vzc2lvbicpLFxuXHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcblx0XHR0aXRsZTogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LnRpdGxlJywgJ1Rlc3QgU2Vzc2lvbicpLFxuXHRcdHVwZGF0ZWRBdDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LnVwZGF0ZWRBdCcsIG5ldyBEYXRlKCkpLFxuXHRcdHN0YXR1czogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LnN0YXR1cycsIDApLFxuXHRcdGNoYW5nZXM6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5jaGFuZ2VzJywgW10pLFxuXHRcdG1vZGVsSWQ6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5tb2RlbElkJywgdW5kZWZpbmVkKSxcblx0XHRtb2RlOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QubW9kZScsIHVuZGVmaW5lZCksXG5cdFx0aXNBcmNoaXZlZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmlzQXJjaGl2ZWQnLCBmYWxzZSksXG5cdFx0aXNSZWFkOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuaXNSZWFkJywgdHJ1ZSksXG5cdFx0aW50ZXJhY3Rpdml0eTogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmludGVyYWN0aXZpdHknLCBDaGF0SW50ZXJhY3Rpdml0eS5GdWxsKSxcblx0XHRjaGVja3BvaW50czogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmNoZWNrcG9pbnRzJywgdW5kZWZpbmVkKSxcblx0XHRsYXN0VHVybkVuZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0Lmxhc3RUdXJuRW5kJywgdW5kZWZpbmVkKSxcblx0XHRkZXNjcmlwdGlvbjogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmRlc2NyaXB0aW9uJywgdW5kZWZpbmVkKSxcblx0fSBzYXRpc2ZpZXMgSUNoYXQ7XG5cdGNvbnN0IHNlc3Npb24gPSB7XG5cdFx0c2Vzc2lvbklkOiBvcHRzLnNlc3Npb25JZCA/PyAndGVzdDpub24tYWdlbnQnLFxuXHRcdHJlc291cmNlOiBjaGF0LnJlc291cmNlLFxuXHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRzZXNzaW9uVHlwZTogb3B0cy5wcm92aWRlclR5cGUgPz8gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsLFxuXHRcdGljb246IENvZGljb24uY29waWxvdCxcblx0XHRjcmVhdGVkQXQ6IGNoYXQuY3JlYXRlZEF0LFxuXHRcdHdvcmtzcGFjZTogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LndvcmtzcGFjZScsIGZvbGRlclxuXHRcdFx0PyB7XG5cdFx0XHRcdHVyaTogZm9sZGVyLnJvb3QsXG5cdFx0XHRcdGxhYmVsOiAndGVzdCcsXG5cdFx0XHRcdGljb246IENvZGljb24ucmVwbyxcblx0XHRcdFx0Zm9sZGVyczogW2ZvbGRlcl0sXG5cdFx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0fSBhcyBJU2Vzc2lvbldvcmtzcGFjZSA6IHVuZGVmaW5lZCksXG5cdFx0dGl0bGU6IGNoYXQudGl0bGUsXG5cdFx0dXBkYXRlZEF0OiBjaGF0LnVwZGF0ZWRBdCxcblx0XHRzdGF0dXM6IGNoYXQuc3RhdHVzLFxuXHRcdGNoYW5nZXNldHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0Y2hhbmdlczogY2hhdC5jaGFuZ2VzLFxuXHRcdG1vZGVsSWQ6IGNoYXQubW9kZWxJZCxcblx0XHRtb2RlOiBjaGF0Lm1vZGUsXG5cdFx0bG9hZGluZzogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmxvYWRpbmcnLCBmYWxzZSksXG5cdFx0aXNBcmNoaXZlZDogY2hhdC5pc0FyY2hpdmVkLFxuXHRcdGlzUmVhZDogY2hhdC5pc1JlYWQsXG5cdFx0bGFzdFR1cm5FbmQ6IGNoYXQubGFzdFR1cm5FbmQsXG5cdFx0ZGVzY3JpcHRpb246IGNoYXQuZGVzY3JpcHRpb24sXG5cdFx0Y2hhdHM6IG9ic2VydmFibGVWYWx1ZSgndGVzdC5jaGF0cycsIFtjaGF0XSksXG5cdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UgfSksXG5cdH0gc2F0aXNmaWVzIElTZXNzaW9uO1xuXHRyZXR1cm4gc2Vzc2lvbjtcbn1cblxuZnVuY3Rpb24gbWFrZVRlcm1pbmFsSW5zdGFuY2UoaWQ6IG51bWJlciwgY3dkOiBzdHJpbmcpOiBUZXN0VGVybWluYWxJbnN0YW5jZSB7XG5cdGNvbnN0IGNvbW1hbmRIaXN0b3J5OiB7IHRpbWVzdGFtcDogbnVtYmVyIH1bXSA9IFtdO1xuXHRsZXQgaXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRsZXQgaW5pdGlhbEN3ZEJhcnJpZXI6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdGxldCBzaGVsbExhdW5jaENvbmZpZzogSVRlcm1pbmFsSW5zdGFuY2VbJ3NoZWxsTGF1bmNoQ29uZmlnJ10gPSB7fSBhcyBJVGVybWluYWxJbnN0YW5jZVsnc2hlbGxMYXVuY2hDb25maWcnXTtcblx0Y29uc3QgY2FwYWJpbGl0aWVzID0ge1xuXHRcdGdldChjYXA6IFRlcm1pbmFsQ2FwYWJpbGl0eSkge1xuXHRcdFx0aWYgKGNhcCA9PT0gVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24gJiYgY29tbWFuZEhpc3RvcnkubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXR1cm4geyBjb21tYW5kczogY29tbWFuZEhpc3RvcnkgfSBhcyB1bmtub3duIGFzIElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9IGFzIElUZXJtaW5hbENhcGFiaWxpdHlTdG9yZTtcblxuXHRyZXR1cm4ge1xuXHRcdGluc3RhbmNlSWQ6IGlkLFxuXHRcdGdldCBpc0Rpc3Bvc2VkKCkgeyByZXR1cm4gaXNEaXNwb3NlZDsgfSxcblx0XHRnZXQgc2hlbGxMYXVuY2hDb25maWcoKSB7IHJldHVybiBzaGVsbExhdW5jaENvbmZpZzsgfSxcblx0XHRhc3luYyBnZXRJbml0aWFsQ3dkKCkge1xuXHRcdFx0YXdhaXQgaW5pdGlhbEN3ZEJhcnJpZXI7XG5cdFx0XHRyZXR1cm4gY3dkO1xuXHRcdH0sXG5cdFx0Y2FwYWJpbGl0aWVzLFxuXHRcdF90ZXN0Q29tbWFuZEhpc3Rvcnk6IGNvbW1hbmRIaXN0b3J5LFxuXHRcdF90ZXN0U2V0RGlzcG9zZWQoZGlzcG9zZWQ6IGJvb2xlYW4pIHtcblx0XHRcdGlzRGlzcG9zZWQgPSBkaXNwb3NlZDtcblx0XHR9LFxuXHRcdF90ZXN0U2V0SW5pdGlhbEN3ZEJhcnJpZXIoYmFycmllcjogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZCkge1xuXHRcdFx0aW5pdGlhbEN3ZEJhcnJpZXIgPSBiYXJyaWVyO1xuXHRcdH0sXG5cdFx0X3Rlc3RTZXRTaGVsbExhdW5jaENvbmZpZyh2YWx1ZTogSVRlcm1pbmFsSW5zdGFuY2VbJ3NoZWxsTGF1bmNoQ29uZmlnJ10pIHtcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnID0gdmFsdWU7XG5cdFx0fSxcblx0fSBhcyB1bmtub3duIGFzIFRlc3RUZXJtaW5hbEluc3RhbmNlO1xufVxuXG5mdW5jdGlvbiBhZGRDb21tYW5kVG9JbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIHRpbWVzdGFtcDogbnVtYmVyKTogdm9pZCB7XG5cdChpbnN0YW5jZSBhcyBUZXN0VGVybWluYWxJbnN0YW5jZSkuX3Rlc3RDb21tYW5kSGlzdG9yeS5wdXNoKHsgdGltZXN0YW1wIH0pO1xufVxuXG5zdWl0ZSgnU2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBjb250cmlidXRpb246IFNlc3Npb25zVGVybWluYWxDb250cmlidXRpb247XG5cdGxldCBhY3RpdmVTZXNzaW9uT2JzOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+Pjtcblx0bGV0IG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEVtaXR0ZXI8SVNlc3Npb25zQ2hhbmdlRXZlbnQ+O1xuXHRsZXQgb25EaWRSZXBsYWNlU2Vzc2lvbjogRW1pdHRlcjx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT47XG5cdGxldCBvbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb246IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+O1xuXHRsZXQgb25EaWRDcmVhdGVJbnN0YW5jZTogRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT47XG5cdGxldCBvbkRpZERpc3Bvc2VJbnN0YW5jZTogRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT47XG5cblx0bGV0IGNyZWF0ZWRUZXJtaW5hbHM6IHsgY3dkOiBVUkkgfVtdO1xuXHRsZXQgYWdlbnRIb3N0VGVybWluYWxBZGRyZXNzZXM6IHN0cmluZ1tdO1xuXHRsZXQgdGVybWluYWxDcmVhdGlvbkJhcnJpZXJzOiBNYXA8c3RyaW5nLCBEZWZlcnJlZFByb21pc2U8dm9pZD4+O1xuXHRsZXQgdGVybWluYWxDcmVhdGlvblN0YXJ0ZWQ6IHN0cmluZ1tdO1xuXHRsZXQgYWN0aXZlSW5zdGFuY2VTZXQ6IG51bWJlcltdO1xuXHRsZXQgYWN0aXZlSW5zdGFuY2VJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRsZXQgZm9jdXNDYWxsczogbnVtYmVyO1xuXHRsZXQgZGlzcG9zZWRJbnN0YW5jZXM6IElUZXJtaW5hbEluc3RhbmNlW107XG5cdGxldCBuZXh0SW5zdGFuY2VJZDogbnVtYmVyO1xuXHRsZXQgdGVybWluYWxJbnN0YW5jZXM6IE1hcDxudW1iZXIsIElUZXJtaW5hbEluc3RhbmNlPjtcblx0bGV0IGJhY2tncm91bmRlZEluc3RhbmNlczogU2V0PG51bWJlcj47XG5cdGxldCBtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHM6IG51bWJlcltdO1xuXHRsZXQgc2hvd0JhY2tncm91bmRDYWxsczogbnVtYmVyW107XG5cdGxldCBkaXNwb3NlT25DcmVhdGVQYXRoczogU2V0PHN0cmluZz47XG5cdGxldCBkZWZhdWx0Q3dkQ2FsbHM6IChVUkkgfCB1bmRlZmluZWQpW107XG5cdGxldCBsb2dTZXJ2aWNlOiBUZXN0TG9nU2VydmljZTtcblx0bGV0IGFsbFNlc3Npb25zOiBJU2Vzc2lvbltdO1xuXHRsZXQgc2Vzc2lvblByb3ZpZGVyczogTWFwPHN0cmluZywgSVNlc3Npb25zUHJvdmlkZXI+O1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y3JlYXRlZFRlcm1pbmFscyA9IFtdO1xuXHRcdGFnZW50SG9zdFRlcm1pbmFsQWRkcmVzc2VzID0gW107XG5cdFx0dGVybWluYWxDcmVhdGlvbkJhcnJpZXJzID0gbmV3IE1hcCgpO1xuXHRcdHRlcm1pbmFsQ3JlYXRpb25TdGFydGVkID0gW107XG5cdFx0YWN0aXZlSW5zdGFuY2VTZXQgPSBbXTtcblx0XHRhY3RpdmVJbnN0YW5jZUlkID0gdW5kZWZpbmVkO1xuXHRcdGZvY3VzQ2FsbHMgPSAwO1xuXHRcdGRpc3Bvc2VkSW5zdGFuY2VzID0gW107XG5cdFx0bmV4dEluc3RhbmNlSWQgPSAxO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VzID0gbmV3IE1hcCgpO1xuXHRcdGJhY2tncm91bmRlZEluc3RhbmNlcyA9IG5ldyBTZXQoKTtcblx0XHRtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMgPSBbXTtcblx0XHRzaG93QmFja2dyb3VuZENhbGxzID0gW107XG5cdFx0ZGlzcG9zZU9uQ3JlYXRlUGF0aHMgPSBuZXcgU2V0KCk7XG5cdFx0ZGVmYXVsdEN3ZENhbGxzID0gW107XG5cdFx0bG9nU2VydmljZSA9IG5ldyBUZXN0TG9nU2VydmljZSgpO1xuXHRcdGFsbFNlc3Npb25zID0gW107XG5cdFx0c2Vzc2lvblByb3ZpZGVycyA9IG5ldyBNYXAoKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignYWN0aXZlU2Vzc2lvbicsIHVuZGVmaW5lZCk7XG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucyA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbnNDaGFuZ2VFdmVudD4oKSk7XG5cdFx0b25EaWRSZXBsYWNlU2Vzc2lvbiA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT4oKSk7XG5cdFx0b25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgZnJvbTogSVNlc3Npb247IHJlYWRvbmx5IHRvOiBJU2Vzc2lvbiB9PigpKTtcblx0XHRvbkRpZENyZWF0ZUluc3RhbmNlID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0XHRvbkRpZERpc3Bvc2VJbnN0YW5jZSA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFJlcGxhY2VTZXNzaW9uID0gb25EaWRSZXBsYWNlU2Vzc2lvbi5ldmVudDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbiA9IG9uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbi5ldmVudDtcblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25zKCk6IElTZXNzaW9uW10geyByZXR1cm4gWy4uLmFsbFNlc3Npb25zXTsgfVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBhY3RpdmVTZXNzaW9uT2JzO1xuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXJtaW5hbFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25EaWRDcmVhdGVJbnN0YW5jZSA9IG9uRGlkQ3JlYXRlSW5zdGFuY2UuZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSBvbkRpZERpc3Bvc2VJbnN0YW5jZSA9IG9uRGlkRGlzcG9zZUluc3RhbmNlLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgZ2V0IGluc3RhbmNlcygpOiByZWFkb25seSBJVGVybWluYWxJbnN0YW5jZVtdIHtcblx0XHRcdFx0cmV0dXJuIFsuLi50ZXJtaW5hbEluc3RhbmNlcy52YWx1ZXMoKV07XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXQgZm9yZWdyb3VuZEluc3RhbmNlcygpOiByZWFkb25seSBJVGVybWluYWxJbnN0YW5jZVtdIHtcblx0XHRcdFx0cmV0dXJuIFsuLi50ZXJtaW5hbEluc3RhbmNlcy52YWx1ZXMoKV0uZmlsdGVyKGkgPT4gIWJhY2tncm91bmRlZEluc3RhbmNlcy5oYXMoaS5pbnN0YW5jZUlkKSk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXQgYWN0aXZlSW5zdGFuY2UoKTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gYWN0aXZlSW5zdGFuY2VJZCAhPT0gdW5kZWZpbmVkID8gdGVybWluYWxJbnN0YW5jZXMuZ2V0KGFjdGl2ZUluc3RhbmNlSWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlVGVybWluYWwob3B0cz86IGFueSk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2U+IHtcblx0XHRcdFx0Y29uc3QgY3dkVXJpOiBVUkkgfCB1bmRlZmluZWQgPSBvcHRzPy5jb25maWc/LmN3ZDtcblx0XHRcdFx0Y29uc3QgY3dkU3RyID0gY3dkVXJpPy5mc1BhdGggPz8gJyc7XG5cdFx0XHRcdHRlcm1pbmFsQ3JlYXRpb25TdGFydGVkLnB1c2goY3dkU3RyKTtcblx0XHRcdFx0YXdhaXQgdGVybWluYWxDcmVhdGlvbkJhcnJpZXJzLmdldChjd2RTdHIpPy5wO1xuXHRcdFx0XHRjb25zdCBpZCA9IG5leHRJbnN0YW5jZUlkKys7XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gbWFrZVRlcm1pbmFsSW5zdGFuY2UoaWQsIGN3ZFN0cik7XG5cdFx0XHRcdGNyZWF0ZWRUZXJtaW5hbHMucHVzaCh7IGN3ZDogb3B0cz8uY29uZmlnPy5jd2QgfSk7XG5cdFx0XHRcdHRlcm1pbmFsSW5zdGFuY2VzLnNldChpZCwgaW5zdGFuY2UpO1xuXHRcdFx0XHRpZiAoZGlzcG9zZU9uQ3JlYXRlUGF0aHMuaGFzKGN3ZFN0cikpIHtcblx0XHRcdFx0XHRpbnN0YW5jZS5fdGVzdFNldERpc3Bvc2VkKHRydWUpO1xuXHRcdFx0XHRcdHRlcm1pbmFsSW5zdGFuY2VzLmRlbGV0ZShpZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGluc3RhbmNlO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZ2V0SW5zdGFuY2VGcm9tSWQoaWQ6IG51bWJlcik6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIHRlcm1pbmFsSW5zdGFuY2VzLmdldChpZCk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBzZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHRcdFx0YWN0aXZlSW5zdGFuY2VTZXQucHVzaChpbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHRcdFx0YWN0aXZlSW5zdGFuY2VJZCA9IGluc3RhbmNlLmluc3RhbmNlSWQ7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBmb2N1c0FjdGl2ZUluc3RhbmNlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRmb2N1c0NhbGxzKys7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzYWZlRGlzcG9zZVRlcm1pbmFsKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRkaXNwb3NlZEluc3RhbmNlcy5wdXNoKGluc3RhbmNlKTtcblx0XHRcdFx0KGluc3RhbmNlIGFzIFRlc3RUZXJtaW5hbEluc3RhbmNlKS5fdGVzdFNldERpc3Bvc2VkKHRydWUpO1xuXHRcdFx0XHR0ZXJtaW5hbEluc3RhbmNlcy5kZWxldGUoaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0XHRcdGJhY2tncm91bmRlZEluc3RhbmNlcy5kZWxldGUoaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0XHRcdGlmIChhY3RpdmVJbnN0YW5jZUlkID09PSBpbnN0YW5jZS5pbnN0YW5jZUlkKSB7XG5cdFx0XHRcdFx0YWN0aXZlSW5zdGFuY2VJZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgbW92ZVRvQmFja2dyb3VuZChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHRcdFx0YmFja2dyb3VuZGVkSW5zdGFuY2VzLmFkZChpbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHRcdFx0bW92ZVRvQmFja2dyb3VuZENhbGxzLnB1c2goaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzaG93QmFja2dyb3VuZFRlcm1pbmFsKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRiYWNrZ3JvdW5kZWRJbnN0YW5jZXMuZGVsZXRlKGluc3RhbmNlLmluc3RhbmNlSWQpO1xuXHRcdFx0XHRzaG93QmFja2dyb3VuZENhbGxzLnB1c2goaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQYXRoU2VydmljZSwgbmV3IFRlc3RQYXRoU2VydmljZShIT01FX0RJUikpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcHJvZmlsZXMgPSBjb25zdE9ic2VydmFibGU8bmV2ZXJbXT4oW10pO1xuXHRcdFx0b3ZlcnJpZGUgZ2V0UHJvZmlsZUZvckNvbm5lY3Rpb24oKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdG92ZXJyaWRlIHNldERlZmF1bHRDd2QoY3dkOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHsgZGVmYXVsdEN3ZENhbGxzLnB1c2goY3dkKTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlVGVybWluYWxGb3JFbnRyeShhZGRyZXNzOiBzdHJpbmcsIG9wdGlvbnM/OiBJQWdlbnRIb3N0VGVybWluYWxDcmVhdGVPcHRpb25zKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRjb25zdCBjd2QgPSB0eXBlb2Ygb3B0aW9ucz8uY3dkID09PSAnc3RyaW5nJyA/IFVSSS5maWxlKG9wdGlvbnMuY3dkKSA6IG9wdGlvbnM/LmN3ZDtcblx0XHRcdFx0aWYgKCFjd2QpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gbWFrZVRlcm1pbmFsSW5zdGFuY2UobmV4dEluc3RhbmNlSWQrKywgY3dkLmZzUGF0aCk7XG5cdFx0XHRcdGFnZW50SG9zdFRlcm1pbmFsQWRkcmVzc2VzLnB1c2goYWRkcmVzcyk7XG5cdFx0XHRcdGNyZWF0ZWRUZXJtaW5hbHMucHVzaCh7IGN3ZCB9KTtcblx0XHRcdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KGluc3RhbmNlLmluc3RhbmNlSWQsIGluc3RhbmNlKTtcblx0XHRcdFx0cmV0dXJuIGluc3RhbmNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxQcm9maWxlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGVybWluYWxQcm9maWxlU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBvdmVycmlkZURlZmF1bHRQcm9maWxlKCkgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zUHJvdmlkZXJzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRQcm92aWRlcjxUIGV4dGVuZHMgSVNlc3Npb25zUHJvdmlkZXI+KHByb3ZpZGVySWQ6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvblByb3ZpZGVycy5nZXQocHJvdmlkZXJJZCkgYXMgVCB8IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElWaWV3c1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpZXdzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBpc1ZpZXdWaXNpYmxlKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlVmlld1Zpc2liaWxpdHkgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8eyBpZDogc3RyaW5nOyB2aXNpYmxlOiBib29sZWFuIH0+KCkpLmV2ZW50O1xuXHRcdH0pO1xuXG5cdFx0Y29udHJpYnV0aW9uID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zVGVybWluYWxDb250cmlidXRpb24pKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLSBCYWNrZ3JvdW5kIHByb3ZpZGVyOiB1c2VzIHdvcmt0cmVlL3JlcG9zaXRvcnkgcGF0aCAtLS1cblxuXHR0ZXN0KCdjcmVhdGVzIGEgdGVybWluYWwgYXQgdGhlIHdvcmt0cmVlIGZvciBhIGJhY2tncm91bmQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcmVwb3NpdG9yeTogVVJJLmZpbGUoJy9yZXBvJyksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzWzBdLmN3ZC5mc1BhdGgsIHdvcmt0cmVlVXJpLmZzUGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gcmVwb3NpdG9yeSB3aGVuIHdvcmt0cmVlIGlzIHVuZGVmaW5lZCBmb3IgYSBiYWNrZ3JvdW5kIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVwb1VyaSA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgcmVwb3NpdG9yeTogcmVwb1VyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHNbMF0uY3dkLmZzUGF0aCwgcmVwb1VyaS5mc1BhdGgpO1xuXHR9KTtcblxuXHQvLyAtLS0gV29ya3NwYWNlLWJhY2tlZCBzZXNzaW9uczogdXNlIHdvcmtpbmcgZGlyZWN0b3J5IC0tLVxuXG5cdHRlc3QoJ3VzZXMgd29ya3RyZWUgZGlyZWN0b3J5IGZvciBhIGNsb3VkIGFnZW50IHNlc3Npb24gd2hlbiB3b3Jrc3BhY2UgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgd29ya3RyZWU6IFVSSS5maWxlKCcvd29ya3RyZWUnKSwgcmVwb3NpdG9yeTogVVJJLmZpbGUoJy9yZXBvJyksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkIH0pO1xuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFsc1swXS5jd2QuZnNQYXRoLCBVUkkuZmlsZSgnL3dvcmt0cmVlJykuZnNQYXRoKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB3b3JrdHJlZSBkaXJlY3RvcnkgZm9yIGEgbG9jYWwgYWdlbnQgc2Vzc2lvbiB3aGVuIHdvcmtzcGFjZSBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyB3b3JrdHJlZTogVVJJLmZpbGUoJy93b3JrdHJlZScpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCB9KTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHNbMF0uY3dkLmZzUGF0aCwgVVJJLmZpbGUoJy93b3JrdHJlZScpLmZzUGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgaG9tZSBkaXJlY3RvcnkgZm9yIGEgbm9uLWFnZW50IHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VOb25BZ2VudFNlc3Npb24oeyByZXBvc2l0b3J5OiBVUkkuZmlsZSgnL3JlcG8nKSB9KTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uIGFzIElBY3RpdmVTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHNbMF0uY3dkLmZzUGF0aCwgSE9NRV9ESVIuZnNQYXRoKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlcyBzZXBhcmF0ZSB0ZXJtaW5hbHMgd2hlbiBkaWZmZXJlbnQgbm9uLWJhY2tncm91bmQgc2Vzc2lvbnMgc2hhcmUgdGhlIGhvbWUgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24xID0gbWFrZUFnZW50U2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLCBzZXNzaW9uSWQ6ICd0ZXN0OmNsb3VkLTEnIH0pO1xuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBtYWtlQWdlbnRTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsIHNlc3Npb25JZDogJ3Rlc3Q6bG9jYWwtMScgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjIsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGNyZWF0ZSBhIHRlcm1pbmFsIHdoZW4gdGhlcmUgaXMgbm8gYWN0aXZlIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhaXRzIGZvciBhIGxvYWRpbmcgc2Vzc2lvbiBiZWZvcmUgY3JlYXRpbmcgYSB0ZXJtaW5hbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgbG9hZGluZzogdHJ1ZSB9KTtcblxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAwLCAnc2hvdWxkIG5vdCBjcmVhdGUgYSB0ZXJtaW5hbCB3aGlsZSBzZXNzaW9uIGlzIGxvYWRpbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmYXVsdEN3ZENhbGxzLmF0KC0xKSwgdW5kZWZpbmVkLCAnc2hvdWxkIG5vdCBzZXQgdGhlIGRlZmF1bHQgY3dkIHdoaWxlIHNlc3Npb24gaXMgbG9hZGluZycpO1xuXG5cdFx0c2Vzc2lvbi5sb2FkaW5nLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzWzBdLmN3ZC5mc1BhdGgsIHdvcmt0cmVlVXJpLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmF1bHRDd2RDYWxscy5hdCgtMSk/LmZzUGF0aCwgd29ya3RyZWVVcmkuZnNQYXRoKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVjcmVhdGUgdGVybWluYWwgZm9yIHRoZSBzYW1lIHBhdGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjEgPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZXNzaW9uLTEnLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjEsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblxuXHRcdGNvbnN0IHNlc3Npb24yID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0xJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24yLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZXMgbmV3IHRlcm1pbmFsIHdoZW4gc3dpdGNoaW5nIHRvIGEgZGlmZmVyZW50IGJhY2tncm91bmQgcGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZTEgPSBVUkkuZmlsZSgnL3dvcmt0cmVlMScpO1xuXHRcdGNvbnN0IHdvcmt0cmVlMiA9IFVSSS5maWxlKCcvd29ya3RyZWUyJyk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZXNzaW9uLTEnLCB3b3JrdHJlZTogd29ya3RyZWUxLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24tMicsIHdvcmt0cmVlOiB3b3JrdHJlZTIsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFsc1sxXS5jd2QuZnNQYXRoLCB3b3JrdHJlZTIuZnNQYXRoKTtcblx0fSk7XG5cblx0Ly8gLS0tIGVuc3VyZVRlcm1pbmFsIC0tLVxuXG5cdHRlc3QoJ2Vuc3VyZVRlcm1pbmFsIGNyZWF0ZXMgdGVybWluYWwgYW5kIHNldHMgaXQgYWN0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZCA9IFVSSS5maWxlKCcvdGVzdC1jd2QnKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoY3dkLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzWzBdLmN3ZC5mc1BhdGgsIGN3ZC5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVJbnN0YW5jZVNldC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2N1c0NhbGxzLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZW5zdXJlVGVybWluYWwgZm9jdXNlcyB3aGVuIHJlcXVlc3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3Rlc3QtY3dkJyk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGN3ZCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9jdXNDYWxscywgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Vuc3VyZVRlcm1pbmFsIHJldXNlcyBleGlzdGluZyB0ZXJtaW5hbCBmb3Igc2FtZSBwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZCA9IFVSSS5maWxlKCcvdGVzdC1jd2QnKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoY3dkLCBmYWxzZSk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGN3ZCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxLCAnc2hvdWxkIHJldXNlIHRoZSBleGlzdGluZyB0ZXJtaW5hbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVJbnN0YW5jZVNldC5sZW5ndGgsIDEsICdzaG91bGQgb25seSBzZXQgYWN0aXZlIGluc3RhbmNlIG9uIGNyZWF0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Vuc3VyZVRlcm1pbmFsIGNyZWF0ZXMgbmV3IHRlcm1pbmFsIGZvciBkaWZmZXJlbnQgcGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoVVJJLmZpbGUoJy9jd2QxJyksIGZhbHNlKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoVVJJLmZpbGUoJy9jd2QyJyksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2Vuc3VyZVRlcm1pbmFsIHBhdGggY29tcGFyaXNvbiBpcyBjYXNlLWluc2Vuc2l0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChVUkkuZmlsZSgnL1Rlc3QvQ1dEJyksIGZhbHNlKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoVVJJLmZpbGUoJy90ZXN0L2N3ZCcpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEsICdzaG91bGQgbWF0Y2ggY2FzZS1pbnNlbnNpdGl2ZWx5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Vuc3VyZVRlcm1pbmFsIGRvZXMgbm90IGFjdGl2YXRlIGEgdGVybWluYWwgZGlzcG9zZWQgZHVyaW5nIGNyZWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZCA9IFVSSS5maWxlKCcvdGVzdC1jd2QnKTtcblx0XHRkaXNwb3NlT25DcmVhdGVQYXRocy5hZGQoY3dkLmZzUGF0aCk7XG5cblx0XHRjb25zdCBpbnN0YW5jZXMgPSBhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoY3dkLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2VzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZUluc3RhbmNlU2V0Lmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKGxvZ1NlcnZpY2UudHJhY2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLmluY2x1ZGVzKGBDYW5ub3QgYWN0aXZhdGUgY3JlYXRlZCB0ZXJtaW5hbCBmb3IgJHtjd2QuZnNQYXRofTsgdGVybWluYWwgMSBpcyBubyBsb25nZXIgYXZhaWxhYmxlYCkpKTtcblx0fSk7XG5cblx0Ly8gLS0tIG5ldy1zZXNzaW9uIGRyYWZ0IHJlcGxhY2VtZW50IC0tLVxuXG5cdHRlc3QoJ3JldXNlcyBvbmUgdGVybWluYWwgYWNyb3NzIHJlcGVhdGVkIHNhbWUtY3dkIHJlcGxhY2VtZW50IGRyYWZ0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0c2Vzc2lvblByb3ZpZGVycy5zZXQoJ2FnZW50aG9zdC1vbmUnLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1Byb3ZpZGVyPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gJ2FnZW50aG9zdC1vbmUnO1xuXHRcdFx0cmVhZG9ubHkgcmVtb3RlQWRkcmVzcyA9ICdzc2gtcmVtb3RlK29uZSc7XG5cdFx0fSk7XG5cdFx0bGV0IGN1cnJlbnRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICd0ZXN0OmRyYWZ0LTEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ2FnZW50aG9zdC1vbmUnLFxuXHRcdFx0d29ya3RyZWU6IGN3ZCxcblx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgW2ZpcnN0VGVybWluYWxdID0gYXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGN3ZCwgZmFsc2UsIGN1cnJlbnRTZXNzaW9uKTtcblx0XHRsZXQgbGF0ZXN0UmVzdWx0OiBJVGVybWluYWxJbnN0YW5jZVtdID0gW2ZpcnN0VGVybWluYWxdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDI7IGkgPD0gMTA7IGkrKykge1xuXHRcdFx0Y29uc3QgbmV4dFNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHtcblx0XHRcdFx0c2Vzc2lvbklkOiBgdGVzdDpkcmFmdC0ke2l9YCxcblx0XHRcdFx0cHJvdmlkZXJJZDogJ2FnZW50aG9zdC1vbmUnLFxuXHRcdFx0XHR3b3JrdHJlZTogY3dkLFxuXHRcdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLFxuXHRcdFx0fSk7XG5cdFx0XHRvbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb24uZmlyZSh7IGZyb206IGN1cnJlbnRTZXNzaW9uLCB0bzogbmV4dFNlc3Npb24gfSk7XG5cdFx0XHRsYXRlc3RSZXN1bHQgPSBhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoY3dkLCBmYWxzZSwgbmV4dFNlc3Npb24pO1xuXHRcdFx0Y3VycmVudFNlc3Npb24gPSBuZXh0U2Vzc2lvbjtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNyZWF0ZWQ6IGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLFxuXHRcdFx0YWdlbnRIb3N0QWRkcmVzc2VzOiBhZ2VudEhvc3RUZXJtaW5hbEFkZHJlc3Nlcyxcblx0XHRcdHRyYW5zZmVycmVkVGVybWluYWxJZDogbGF0ZXN0UmVzdWx0WzBdPy5pbnN0YW5jZUlkLFxuXHRcdFx0ZGlzcG9zZWQ6IGRpc3Bvc2VkSW5zdGFuY2VzLm1hcChpbnN0YW5jZSA9PiBpbnN0YW5jZS5pbnN0YW5jZUlkKSxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVkOiAxLFxuXHRcdFx0YWdlbnRIb3N0QWRkcmVzc2VzOiBbJ3NzaC1yZW1vdGUrb25lJ10sXG5cdFx0XHR0cmFuc2ZlcnJlZFRlcm1pbmFsSWQ6IGZpcnN0VGVybWluYWwuaW5zdGFuY2VJZCxcblx0XHRcdGRpc3Bvc2VkOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHJhbnNmZXJzIGFsbCB0cmFja2VkIHRlcm1pbmFscyB0byBhIHNhbWUtY3dkIHJlcGxhY2VtZW50IGRyYWZ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZCA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRjb25zdCBmaXJzdFNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpmaXJzdC1kcmFmdCcsIHdvcmt0cmVlOiBjd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Y29uc3Qgc2Vjb25kU2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlY29uZC1kcmFmdCcsIHdvcmt0cmVlOiBjd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBtYWtlVGVybWluYWxJbnN0YW5jZSgxLCBjd2QuZnNQYXRoKTtcblx0XHRjb25zdCBzZWNvbmQgPSBtYWtlVGVybWluYWxJbnN0YW5jZSgyLCBjd2QuZnNQYXRoKTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlcy5zZXQoZmlyc3QuaW5zdGFuY2VJZCwgZmlyc3QpO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VzLnNldChzZWNvbmQuaW5zdGFuY2VJZCwgc2Vjb25kKTtcblx0XHRuZXh0SW5zdGFuY2VJZCA9IDM7XG5cblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoY3dkLCBmYWxzZSwgZmlyc3RTZXNzaW9uKTtcblx0XHRvbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb24uZmlyZSh7IGZyb206IGZpcnN0U2Vzc2lvbiwgdG86IHNlY29uZFNlc3Npb24gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGN3ZCwgZmFsc2UsIHNlY29uZFNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQ6IHJlc3VsdC5tYXAoaW5zdGFuY2UgPT4gaW5zdGFuY2UuaW5zdGFuY2VJZCksXG5cdFx0XHRjcmVhdGVkOiBjcmVhdGVkVGVybWluYWxzLmxlbmd0aCxcblx0XHRcdGRpc3Bvc2VkOiBkaXNwb3NlZEluc3RhbmNlcy5tYXAoaW5zdGFuY2UgPT4gaW5zdGFuY2UuaW5zdGFuY2VJZCksXG5cdFx0fSwge1xuXHRcdFx0cmVzdWx0OiBbMSwgMl0sXG5cdFx0XHRjcmVhdGVkOiAwLFxuXHRcdFx0ZGlzcG9zZWQ6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWhvbWVzIHRlcm1pbmFscyB3aGVuIHJlcGxhY2VtZW50IGRyYWZ0cyB1c2UgZGlmZmVyZW50IGN3ZCB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3RDd2QgPSBVUkkuZmlsZSgnL3dvcmt0cmVlLW9uZScpO1xuXHRcdGNvbnN0IHNlY29uZEN3ZCA9IFVSSS5maWxlKCcvd29ya3RyZWUtdHdvJyk7XG5cdFx0Y29uc3QgdGhpcmRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6dGhpcmQtZHJhZnQnLCB3b3JrdHJlZTogZmlyc3RDd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Y29uc3QgZmlyc3RTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6Zmlyc3QtZHJhZnQnLCB3b3JrdHJlZTogZmlyc3RDd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Y29uc3Qgc2Vjb25kU2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlY29uZC1kcmFmdCcsIHdvcmt0cmVlOiBzZWNvbmRDd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cblx0XHRjb25zdCBbZmlyc3RUZXJtaW5hbF0gPSBhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoZmlyc3RDd2QsIGZhbHNlLCBmaXJzdFNlc3Npb24pO1xuXHRcdGFkZENvbW1hbmRUb0luc3RhbmNlKGZpcnN0VGVybWluYWwsIDEwMCk7XG5cdFx0b25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uLmZpcmUoeyBmcm9tOiBmaXJzdFNlc3Npb24sIHRvOiBzZWNvbmRTZXNzaW9uIH0pO1xuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlY29uZFNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGNvbnN0IHNlY29uZFRlcm1pbmFsID0gdGVybWluYWxJbnN0YW5jZXMuZ2V0KGFjdGl2ZUluc3RhbmNlSWQhKTtcblxuXHRcdG9uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbi5maXJlKHsgZnJvbTogc2Vjb25kU2Vzc2lvbiwgdG86IHRoaXJkU2Vzc2lvbiB9KTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldCh0aGlyZFNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGNvbnN0IHRoaXJkVGVybWluYWwgPSB0ZXJtaW5hbEluc3RhbmNlcy5nZXQoYWN0aXZlSW5zdGFuY2VJZCEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjcmVhdGVkQ3dkczogY3JlYXRlZFRlcm1pbmFscy5tYXAodGVybWluYWwgPT4gdGVybWluYWwuY3dkLmZzUGF0aCksXG5cdFx0XHRmaXJzdFN0aWxsQWxpdmU6IHRlcm1pbmFsSW5zdGFuY2VzLmhhcyhmaXJzdFRlcm1pbmFsLmluc3RhbmNlSWQpLFxuXHRcdFx0c2Vjb25kU3RpbGxBbGl2ZTogc2Vjb25kVGVybWluYWwgPyB0ZXJtaW5hbEluc3RhbmNlcy5oYXMoc2Vjb25kVGVybWluYWwuaW5zdGFuY2VJZCkgOiBmYWxzZSxcblx0XHRcdHRoaXJkVGVybWluYWxJZDogdGhpcmRUZXJtaW5hbD8uaW5zdGFuY2VJZCxcblx0XHRcdGFjdGl2ZVRlcm1pbmFsSWQ6IGFjdGl2ZUluc3RhbmNlSWQsXG5cdFx0XHRiYWNrZ3JvdW5kZWQ6IG1vdmVUb0JhY2tncm91bmRDYWxscyxcblx0XHRcdGRpc3Bvc2VkOiBkaXNwb3NlZEluc3RhbmNlcy5tYXAoaW5zdGFuY2UgPT4gaW5zdGFuY2UuaW5zdGFuY2VJZCksXG5cdFx0fSwge1xuXHRcdFx0Y3JlYXRlZEN3ZHM6IFtmaXJzdEN3ZC5mc1BhdGgsIHNlY29uZEN3ZC5mc1BhdGgsIGZpcnN0Q3dkLmZzUGF0aF0sXG5cdFx0XHRmaXJzdFN0aWxsQWxpdmU6IHRydWUsXG5cdFx0XHRzZWNvbmRTdGlsbEFsaXZlOiB0cnVlLFxuXHRcdFx0dGhpcmRUZXJtaW5hbElkOiAzLFxuXHRcdFx0YWN0aXZlVGVybWluYWxJZDogMyxcblx0XHRcdGJhY2tncm91bmRlZDogW10sXG5cdFx0XHRkaXNwb3NlZDogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlaG9tZXMgYSBzYW1lLWN3ZCB0ZXJtaW5hbCB3aGVuIHRoZSBBZ2VudCBIb3N0IGJhY2tlbmQgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0c2Vzc2lvblByb3ZpZGVycy5zZXQoJ2FnZW50aG9zdC1vbmUnLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1Byb3ZpZGVyPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gJ2FnZW50aG9zdC1vbmUnO1xuXHRcdFx0cmVhZG9ubHkgcmVtb3RlQWRkcmVzcyA9ICdzc2gtcmVtb3RlK29uZSc7XG5cdFx0fSk7XG5cdFx0c2Vzc2lvblByb3ZpZGVycy5zZXQoJ2FnZW50aG9zdC10d28nLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1Byb3ZpZGVyPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gJ2FnZW50aG9zdC10d28nO1xuXHRcdFx0cmVhZG9ubHkgcmVtb3RlQWRkcmVzcyA9ICdzc2gtcmVtb3RlK3R3byc7XG5cdFx0fSk7XG5cdFx0Y29uc3QgZmlyc3RTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICd0ZXN0OmZpcnN0LWRyYWZ0Jyxcblx0XHRcdHByb3ZpZGVySWQ6ICdhZ2VudGhvc3Qtb25lJyxcblx0XHRcdHdvcmt0cmVlOiBjd2QsXG5cdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlY29uZFNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3Rlc3Q6c2Vjb25kLWRyYWZ0Jyxcblx0XHRcdHByb3ZpZGVySWQ6ICdhZ2VudGhvc3QtdHdvJyxcblx0XHRcdHdvcmt0cmVlOiBjd2QsXG5cdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgW2ZpcnN0VGVybWluYWxdID0gYXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGN3ZCwgZmFsc2UsIGZpcnN0U2Vzc2lvbik7XG5cdFx0b25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uLmZpcmUoeyBmcm9tOiBmaXJzdFNlc3Npb24sIHRvOiBzZWNvbmRTZXNzaW9uIH0pO1xuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlY29uZFNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGNvbnN0IHNlY29uZFRlcm1pbmFsID0gdGVybWluYWxJbnN0YW5jZXMuZ2V0KGFjdGl2ZUluc3RhbmNlSWQhKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlZDogY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsXG5cdFx0XHRhZ2VudEhvc3RBZGRyZXNzZXM6IGFnZW50SG9zdFRlcm1pbmFsQWRkcmVzc2VzLFxuXHRcdFx0Zmlyc3RTdGlsbEFsaXZlOiB0ZXJtaW5hbEluc3RhbmNlcy5oYXMoZmlyc3RUZXJtaW5hbC5pbnN0YW5jZUlkKSxcblx0XHRcdHNlY29uZFRlcm1pbmFsSWQ6IHNlY29uZFRlcm1pbmFsPy5pbnN0YW5jZUlkLFxuXHRcdFx0YmFja2dyb3VuZGVkOiBtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMsXG5cdFx0XHRkaXNwb3NlZDogZGlzcG9zZWRJbnN0YW5jZXMubWFwKGluc3RhbmNlID0+IGluc3RhbmNlLmluc3RhbmNlSWQpLFxuXHRcdH0sIHtcblx0XHRcdGNyZWF0ZWQ6IDIsXG5cdFx0XHRhZ2VudEhvc3RBZGRyZXNzZXM6IFsnc3NoLXJlbW90ZStvbmUnLCAnc3NoLXJlbW90ZSt0d28nXSxcblx0XHRcdGZpcnN0U3RpbGxBbGl2ZTogdHJ1ZSxcblx0XHRcdHNlY29uZFRlcm1pbmFsSWQ6IDIsXG5cdFx0XHRiYWNrZ3JvdW5kZWQ6IFtdLFxuXHRcdFx0ZGlzcG9zZWQ6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxvd3MgZ2VuZXJpYyBsb29rdXAgdG8gcmV1c2UgYSBzdGFuZGFsb25lIHRlcm1pbmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0Q3dkID0gVVJJLmZpbGUoJy93b3JrdHJlZS1vbmUnKTtcblx0XHRjb25zdCBzZWNvbmRDd2QgPSBVUkkuZmlsZSgnL3dvcmt0cmVlLXR3bycpO1xuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmZpcnN0LWRyYWZ0Jywgd29ya3RyZWU6IGZpcnN0Q3dkLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGNvbnN0IHNlY29uZFNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZWNvbmQtZHJhZnQnLCB3b3JrdHJlZTogc2Vjb25kQ3dkLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXG5cdFx0Y29uc3QgW2ZpcnN0VGVybWluYWxdID0gYXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGZpcnN0Q3dkLCBmYWxzZSwgZmlyc3RTZXNzaW9uKTtcblx0XHRvbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb24uZmlyZSh7IGZyb206IGZpcnN0U2Vzc2lvbiwgdG86IHNlY29uZFNlc3Npb24gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGZpcnN0Q3dkLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdDogcmVzdWx0Lm1hcChpbnN0YW5jZSA9PiBpbnN0YW5jZS5pbnN0YW5jZUlkKSxcblx0XHRcdGNyZWF0ZWQ6IGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDogW2ZpcnN0VGVybWluYWwuaW5zdGFuY2VJZF0sXG5cdFx0XHRjcmVhdGVkOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlcyBhIHRlcm1pbmFsIHdob3NlIGNyZWF0aW9uIGZpbmlzaGVzIGFmdGVyIGl0cyBkcmFmdCBpcyByZXBsYWNlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaXJzdEN3ZCA9IFVSSS5maWxlKCcvd29ya3RyZWUtb25lJyk7XG5cdFx0Y29uc3Qgc2Vjb25kQ3dkID0gVVJJLmZpbGUoJy93b3JrdHJlZS10d28nKTtcblx0XHRjb25zdCBmaXJzdFNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpmaXJzdC1kcmFmdCcsIHdvcmt0cmVlOiBmaXJzdEN3ZCwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vjb25kLWRyYWZ0Jywgd29ya3RyZWU6IHNlY29uZEN3ZCwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRjb25zdCBjcmVhdGlvbkJhcnJpZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0dGVybWluYWxDcmVhdGlvbkJhcnJpZXJzLnNldChmaXJzdEN3ZC5mc1BhdGgsIGNyZWF0aW9uQmFycmllcik7XG5cblx0XHRjb25zdCBvcGVyYXRpb24gPSBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoZmlyc3RDd2QsIGZhbHNlLCBmaXJzdFNlc3Npb24pO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlcm1pbmFsQ3JlYXRpb25TdGFydGVkLCBbZmlyc3RDd2QuZnNQYXRoXSk7XG5cblx0XHRvbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb24uZmlyZSh7IGZyb206IGZpcnN0U2Vzc2lvbiwgdG86IHNlY29uZFNlc3Npb24gfSk7XG5cdFx0YXdhaXQgY3JlYXRpb25CYXJyaWVyLmNvbXBsZXRlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgb3BlcmF0aW9uO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQ6IHJlc3VsdC5tYXAoaW5zdGFuY2UgPT4gaW5zdGFuY2UuaW5zdGFuY2VJZCksXG5cdFx0XHRkaXNwb3NlZDogZGlzcG9zZWRJbnN0YW5jZXMubWFwKGluc3RhbmNlID0+IGluc3RhbmNlLmluc3RhbmNlSWQpLFxuXHRcdFx0YWN0aXZhdGVkOiBhY3RpdmVJbnN0YW5jZVNldCxcblx0XHRcdHJlbWFpbmluZzogWy4uLnRlcm1pbmFsSW5zdGFuY2VzLmtleXMoKV0sXG5cdFx0fSwge1xuXHRcdFx0cmVzdWx0OiBbXSxcblx0XHRcdGRpc3Bvc2VkOiBbMV0sXG5cdFx0XHRhY3RpdmF0ZWQ6IFtdLFxuXHRcdFx0cmVtYWluaW5nOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIGFuIGV4aXN0aW5nIHRlcm1pbmFsIHVudG91Y2hlZCB3aGVuIGxvb2t1cCBmaW5pc2hlcyBhZnRlciByZXBsYWNlbWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaXJzdEN3ZCA9IFVSSS5maWxlKCcvd29ya3RyZWUtb25lJyk7XG5cdFx0Y29uc3Qgc2Vjb25kQ3dkID0gVVJJLmZpbGUoJy93b3JrdHJlZS10d28nKTtcblx0XHRjb25zdCBmaXJzdFNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpmaXJzdC1kcmFmdCcsIHdvcmt0cmVlOiBmaXJzdEN3ZCwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vjb25kLWRyYWZ0Jywgd29ya3RyZWU6IHNlY29uZEN3ZCwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRjb25zdCBjd2RCYXJyaWVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gbWFrZVRlcm1pbmFsSW5zdGFuY2UoMSwgZmlyc3RDd2QuZnNQYXRoKTtcblx0XHRleGlzdGluZy5fdGVzdFNldEluaXRpYWxDd2RCYXJyaWVyKGN3ZEJhcnJpZXIucCk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KGV4aXN0aW5nLmluc3RhbmNlSWQsIGV4aXN0aW5nKTtcblx0XHRuZXh0SW5zdGFuY2VJZCA9IDI7XG5cblx0XHRjb25zdCBvcGVyYXRpb24gPSBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoZmlyc3RDd2QsIGZhbHNlLCBmaXJzdFNlc3Npb24pO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRvbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb24uZmlyZSh7IGZyb206IGZpcnN0U2Vzc2lvbiwgdG86IHNlY29uZFNlc3Npb24gfSk7XG5cdFx0YXdhaXQgY3dkQmFycmllci5jb21wbGV0ZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9wZXJhdGlvbjtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0OiByZXN1bHQubWFwKGluc3RhbmNlID0+IGluc3RhbmNlLmluc3RhbmNlSWQpLFxuXHRcdFx0ZGlzcG9zZWQ6IGRpc3Bvc2VkSW5zdGFuY2VzLm1hcChpbnN0YW5jZSA9PiBpbnN0YW5jZS5pbnN0YW5jZUlkKSxcblx0XHRcdHJlbWFpbmluZzogWy4uLnRlcm1pbmFsSW5zdGFuY2VzLmtleXMoKV0sXG5cdFx0fSwge1xuXHRcdFx0cmVzdWx0OiBbXSxcblx0XHRcdGRpc3Bvc2VkOiBbXSxcblx0XHRcdHJlbWFpbmluZzogWzFdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gb25EaWRDaGFuZ2VTZXNzaW9ucyAoYXJjaGl2ZWQpIC0tLVxuXG5cdHRlc3QoJ2hpZGVzIChkb2VzIG5vdCBkaXNwb3NlKSB0ZXJtaW5hbHMgd2hlbiBzZXNzaW9uIGlzIGFyY2hpdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmFyY2hpdmVkLXNlc3Npb24nLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSkpOyAvLyB0ZXJtaW5hbCAxIGF0IC93b3JrdHJlZVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIEFyY2hpdmluZyBmbGlwcyB0aGUgYWN0aXZlIHNlc3Npb24gYXdheSBmcm9tIHRoZSBhcmNoaXZlZCBvbmUsIHNvIHRoZVxuXHRcdC8vIGFyY2hpdmVkIHNlc3Npb24ncyB0ZXJtaW5hbCBpcyBubyBsb25nZXIgdGhlIGZvY3VzZWQgKGFjdGl2ZSkgdGVybWluYWwuXG5cdFx0Y29uc3Qgb3RoZXJTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6b3RoZXItc2Vzc2lvbicsIHdvcmt0cmVlOiBVUkkuZmlsZSgnL290aGVyJyksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQob3RoZXJTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdC8vIElzb2xhdGUgdGhlIGFyY2hpdmUtZHJpdmVuIGhpZGUgZnJvbSB0aGUgdmlzaWJpbGl0eS1zd2l0Y2ggaGlkZSBhYm92ZS5cblx0XHRtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3Rlc3Q6YXJjaGl2ZWQtc2Vzc2lvbicsXG5cdFx0XHRpc0FyY2hpdmVkOiB0cnVlLFxuXHRcdFx0d29ya3RyZWU6IHdvcmt0cmVlVXJpLFxuXHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCxcblx0XHR9KTtcblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbc2Vzc2lvbl0gfSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkSW5zdGFuY2VzLmxlbmd0aCwgMCwgJ2FyY2hpdmVkIHNlc3Npb24gdGVybWluYWwgbXVzdCBiZSBoaWRkZW4sIG5vdCBkaXNwb3NlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW92ZVRvQmFja2dyb3VuZENhbGxzLCBbMV0sICdhcmNoaXZlZCBzZXNzaW9uIHRlcm1pbmFsIHNob3VsZCBiZSBtb3ZlZCB0byBiYWNrZ3JvdW5kJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGhpZGUgb3IgZGlzcG9zZSB0ZXJtaW5hbHMgd2hlbiBzZXNzaW9uIGlzIG5vdCBhcmNoaXZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwod29ya3RyZWVVcmksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDphY3RpdmUtc2Vzc2lvbicsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7XG5cblx0XHRtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3Rlc3Q6YWN0aXZlLXNlc3Npb24nLFxuXHRcdFx0aXNBcmNoaXZlZDogZmFsc2UsXG5cdFx0XHR3b3JrdHJlZTogd29ya3RyZWVVcmksXG5cdFx0fSk7XG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3Nlc3Npb25dIH0pO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZEluc3RhbmNlcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgbG9nIGluZm8gd2hlbiBhbiBhcmNoaXZlZCBzZXNzaW9uIGhhcyBubyB0cmFja2VkIHRlcm1pbmFscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICd0ZXN0OmFyY2hpdmVkLXdpdGhvdXQtdGVybWluYWwnLFxuXHRcdFx0aXNBcmNoaXZlZDogdHJ1ZSxcblx0XHRcdHdvcmt0cmVlOiBVUkkuZmlsZSgnL3dvcmt0cmVlJyksXG5cdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLFxuXHRcdH0pO1xuXG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3Nlc3Npb25dIH0pO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZ1NlcnZpY2UuaW5mb3MsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgaGlkZSBvciBkaXNwb3NlIHRlcm1pbmFscyB3aGVuIGFyY2hpdmVkIHNlc3Npb24gaGFzIG5vIHdvcmt0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmFjdGl2ZS1zZXNzaW9uJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTtcblxuXHRcdG1vdmVUb0JhY2tncm91bmRDYWxscy5sZW5ndGggPSAwO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmFyY2hpdmVkLXNlc3Npb24nLCBpc0FyY2hpdmVkOiB0cnVlIH0pO1xuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtzZXNzaW9uXSB9KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRJbnN0YW5jZXMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW92ZVRvQmFja2dyb3VuZENhbGxzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGVzIHRlcm1pbmFscyB3aGVuIGFyY2hpdmVkIHNlc3Npb24gaGFzIG9ubHkgYSByZXBvc2l0b3J5IChubyB3b3JrdHJlZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVwb1VyaSA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpyZXBvLXNlc3Npb24nLCByZXBvc2l0b3J5OiByZXBvVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBpc0FyY2hpdmVkOiBmYWxzZSB9KTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHNbMF0uY3dkLmZzUGF0aCwgcmVwb1VyaS5mc1BhdGgpO1xuXG5cdFx0Ly8gU3dpdGNoIHRoZSBhY3RpdmUgc2Vzc2lvbiB0byBhIGRpZmZlcmVudCBjd2Qgc28gdGhlIHJlcG8gY3dkIGlzIG5vIGxvbmdlclxuXHRcdC8vIHRoZSBwcm90ZWN0ZWQgYWN0aXZlIGN3ZCAobWlycm9ycyBhcmNoaXZpbmcgZmxpcHBpbmcgdGhlIGFjdGl2ZSBzZXNzaW9uXG5cdFx0Ly8gdG8gYSBuZXcgb25lKSwgdGhlbiBhcmNoaXZlIHRoZSByZXBvLW9ubHkgc2Vzc2lvbi5cblx0XHRjb25zdCBvdGhlclNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpvdGhlci1zZXNzaW9uJywgd29ya3RyZWU6IFVSSS5maWxlKCcvb3RoZXInKSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChvdGhlclNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0bW92ZVRvQmFja2dyb3VuZENhbGxzLmxlbmd0aCA9IDA7XG5cblx0XHRjb25zdCBhcmNoaXZlZFNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpyZXBvLXNlc3Npb24nLCByZXBvc2l0b3J5OiByZXBvVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBpc0FyY2hpdmVkOiB0cnVlIH0pO1xuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFthcmNoaXZlZFNlc3Npb25dIH0pO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZEluc3RhbmNlcy5sZW5ndGgsIDAsICdhcmNoaXZlZCByZXBvLW9ubHkgc2Vzc2lvbiB0ZXJtaW5hbCBtdXN0IGJlIGhpZGRlbiwgbm90IGRpc3Bvc2VkJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMsIFsxXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGhpZGUgdGhlIHRlcm1pbmFsIGF0IHRoZSBhY3RpdmUgc2Vzc2lvbiBjd2Qgd2hlbiBhcmNoaXZpbmcgKGp1c3Qtb3BlbmVkIHRlcm1pbmFsIGlzIHByb3RlY3RlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gTWlycm9ycyB0aGUgXCJhcmNoaXZlIGFsbCBzZXNzaW9ucywgdGhlbiBvcGVuIGEgdGVybWluYWxcIiByZXBybyAoIzMxMzUxMCk6XG5cdFx0Ly8gYSBsYXRlIGFyY2hpdmUgZXZlbnQgbXVzdCBub3QgdG91Y2ggdGhlIHRlcm1pbmFsIHRoZSB1c2VyIGlzIGN1cnJlbnRseVxuXHRcdC8vIHdvcmtpbmcgaW4gYXQgdGhlIGFjdGl2ZSBzZXNzaW9uJ3MgY3dkLlxuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDphY3RpdmUtc2Vzc2lvbicsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChhY3RpdmVTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSk7XG5cblx0XHRtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdC8vIEEgZGlmZmVyZW50LCBub3ctYXJjaGl2ZWQgc2Vzc2lvbiB0aGF0IGhhcHBlbnMgdG8gc2hhcmUgdGhlIGFjdGl2ZSBjd2QuXG5cdFx0Y29uc3QgYXJjaGl2ZWRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6YXJjaGl2ZWQnLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIGlzQXJjaGl2ZWQ6IHRydWUgfSk7XG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2FyY2hpdmVkU2Vzc2lvbl0gfSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkSW5zdGFuY2VzLmxlbmd0aCwgMCwgJ3Rlcm1pbmFsIGF0IHRoZSBhY3RpdmUgc2Vzc2lvbiBjd2QgbXVzdCBub3QgYmUgZGlzcG9zZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW92ZVRvQmFja2dyb3VuZENhbGxzLmxlbmd0aCwgMCwgJ3Rlcm1pbmFsIGF0IHRoZSBhY3RpdmUgc2Vzc2lvbiBjd2QgbXVzdCBub3QgYmUgaGlkZGVuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlLWhpZGUgYSBuZXdseS1vcGVuZWQgdGVybWluYWwgd2hlbiBhbiBhbHJlYWR5LWFyY2hpdmVkIHNlc3Npb24gaXMgcmUtZW1pdHRlZCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBNaXJyb3JzIHRoZSBcImV2ZXJ5IG5ldyB0ZXJtaW5hbCBrZWVwcyBkeWluZ1wiIHJlcHJvICgjMzEzNTEwLCAjMzE4NjQ1KTpcblx0XHQvLyB0aGUgcHJvdmlkZXIga2VlcHMgYXJjaGl2ZWQgc2Vzc2lvbnMgY2FjaGVkIGFuZCByZS1lbWl0cyB0aGVtIGluIGBjaGFuZ2VkYFxuXHRcdC8vIG9uIGV2ZXJ5IHN5bmMuIFRoZSBhcmNoaXZlIGNsZWFudXAgbXVzdCBvbmx5IHJ1biBvbiB0aGUgZmlyc3QgYXJjaGl2ZWRcblx0XHQvLyB0cmFuc2l0aW9uLCBub3Qgb24gZWFjaCByZS1lbWl0LlxuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmFyY2hpdmVkJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTsgLy8gdGVybWluYWwgMSBhdCAvd29ya3RyZWVcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoVVJJLmZpbGUoJy9vdGhlcicpLCBmYWxzZSwgbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6b3RoZXItc2Vzc2lvbicsIHdvcmt0cmVlOiBVUkkuZmlsZSgnL290aGVyJyksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSkpOyAvLyB0ZXJtaW5hbCAyIGF0IC9vdGhlciwgbm93IGFjdGl2ZVxuXG5cdFx0Y29uc3QgYXJjaGl2ZWRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6YXJjaGl2ZWQnLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIGlzQXJjaGl2ZWQ6IHRydWUgfSk7XG5cblx0XHRtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdC8vIEZpcnN0IGFyY2hpdmUgZXZlbnQgaGlkZXMgdGhlIHRlcm1pbmFsIGF0IHRoZSBhcmNoaXZlZCBjd2QgKG5vdCBhY3RpdmUpLlxuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFthcmNoaXZlZFNlc3Npb25dIH0pO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRJbnN0YW5jZXMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vdmVUb0JhY2tncm91bmRDYWxscywgWzFdKTtcblxuXHRcdC8vIFRoZSB1c2VyIG9wZW5zIGEgbmV3IHRlcm1pbmFsIGF0IHRoZSBzYW1lIGN3ZCwgdGhlbiBtb3ZlcyBmb2N1cyBlbHNld2hlcmUuXG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKHdvcmt0cmVlVXJpLCBmYWxzZSwgbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6bGF0ZXItc2Vzc2lvbicsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7IC8vIHRlcm1pbmFsIDMgYXQgL3dvcmt0cmVlLCBhY3RpdmVcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwoVVJJLmZpbGUoJy9vdGhlcicpLCBmYWxzZSwgbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6b3RoZXItc2Vzc2lvbicsIHdvcmt0cmVlOiBVUkkuZmlsZSgnL290aGVyJyksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSkpOyAvLyByZXVzZSB0ZXJtaW5hbCAyXG5cdFx0YWN0aXZlSW5zdGFuY2VJZCA9IDI7IC8vIHNpbXVsYXRlIHRoZSB1c2VyIHJlZm9jdXNpbmcgdGVybWluYWwgMiBhdCAvb3RoZXJcblxuXHRcdG1vdmVUb0JhY2tncm91bmRDYWxscy5sZW5ndGggPSAwO1xuXG5cdFx0Ly8gVGhlIHByb3ZpZGVyIHJlLWVtaXRzIHRoZSBzdGlsbC1hcmNoaXZlZCBzZXNzaW9uIG9uIGEgbGF0ZXIgc3luYy4gVGVybWluYWwgM1xuXHRcdC8vIGF0IC93b3JrdHJlZSBpcyBubyBsb25nZXIgdGhlIGFjdGl2ZSB0ZXJtaW5hbCwgc28gb25seSB0aGUgdHJhbnNpdGlvbiBndWFyZFxuXHRcdC8vIGtlZXBzIGl0IGFsaXZlOiB0aGUgcmUtZW1pdCBtdXN0IGJlIGEgbm8tb3Agc28gdGhlIG5ld2x5LW9wZW5lZCB0ZXJtaW5hbCBzdXJ2aXZlcy5cblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbYXJjaGl2ZWRTZXNzaW9uXSB9KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkSW5zdGFuY2VzLmxlbmd0aCwgMCwgJ3JlLWVtaXR0ZWQgYXJjaGl2ZWQgc2Vzc2lvbiBtdXN0IG5vdCBkaXNwb3NlIGFueSB0ZXJtaW5hbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMubGVuZ3RoLCAwLCAncmUtZW1pdHRlZCBhcmNoaXZlZCBzZXNzaW9uIG11c3Qgbm90IHJlLWhpZGUgdGhlIG5ld2x5LW9wZW5lZCB0ZXJtaW5hbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBoaWRlIHRlcm1pbmFscyBmb3IgYSBzZXNzaW9uIHRoYXQgd2FzIGFscmVhZHkgYXJjaGl2ZWQgd2hlbiB0aGUgY29udHJpYnV0aW9uIHN0YXJ0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2Vzc2lvbnMgcmVzdG9yZWQgYWxyZWFkeS1hcmNoaXZlZCBmcm9tIGEgcHJldmlvdXMgd2luZG93IGFyZSBzZWVkZWRcblx0XHQvLyBpbnRvIHRoZSB0cmFja2VkIHNldCBhdCBjb25zdHJ1Y3Rpb24sIHNvIHRoZWlyIGZpcnN0IGBjaGFuZ2VkYCByZS1lbWl0XG5cdFx0Ly8gbXVzdCBub3QgY291bnQgYXMgYSBmcmVzaCBhcmNoaXZlIHRyYW5zaXRpb24uIFNlZSAjMzEzNTEwLCAjMzE4NjQ1LlxuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGNvbnN0IGFyY2hpdmVkU2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnJlc3RvcmVkLWFyY2hpdmVkJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBpc0FyY2hpdmVkOiB0cnVlIH0pO1xuXHRcdGFsbFNlc3Npb25zID0gW2FyY2hpdmVkU2Vzc2lvbl07XG5cblx0XHQvLyBEaXNwb3NlIHRoZSBkZWZhdWx0IGNvbnRyaWJ1dGlvbiAoY3JlYXRlZCBpbiBzZXR1cCB3aXRoIG5vIHNlc3Npb25zKSBzb1xuXHRcdC8vIG9ubHkgdGhlIGZyZXNobHktY29uc3RydWN0ZWQsIHNlZWRlZCBjb250cmlidXRpb24gb2JzZXJ2ZXMgdGhlIGV2ZW50LlxuXHRcdGNvbnRyaWJ1dGlvbi5kaXNwb3NlKCk7XG5cblx0XHQvLyBBIGZyZXNoIGNvbnRyaWJ1dGlvbiBvYnNlcnZlcyB0aGUgYWxyZWFkeS1hcmNoaXZlZCBzZXNzaW9uIGF0IHN0YXJ0dXAuXG5cdFx0Y29uc3QgZnJlc2hDb250cmlidXRpb24gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbikpO1xuXHRcdGF3YWl0IGZyZXNoQ29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKHdvcmt0cmVlVXJpLCBmYWxzZSwgbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6cmVzdG9yZWQtYXJjaGl2ZWQnLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSkpOyAvLyB0ZXJtaW5hbCBhdCAvd29ya3RyZWVcblx0XHRhd2FpdCBmcmVzaENvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChVUkkuZmlsZSgnL290aGVyJyksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpvdGhlci1zZXNzaW9uJywgd29ya3RyZWU6IFVSSS5maWxlKCcvb3RoZXInKSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7IC8vIG1vdmUgZm9jdXMgYXdheVxuXG5cdFx0bW92ZVRvQmFja2dyb3VuZENhbGxzLmxlbmd0aCA9IDA7XG5cblx0XHQvLyBUaGUgcHJvdmlkZXIgcmUtZW1pdHMgdGhlIGFscmVhZHktYXJjaGl2ZWQgc2Vzc2lvbiBvbiBpdHMgZmlyc3Qgc3luYy5cblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbYXJjaGl2ZWRTZXNzaW9uXSB9KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRJbnN0YW5jZXMubGVuZ3RoLCAwLCAnYWxyZWFkeS1hcmNoaXZlZCBzZXNzaW9uIG11c3Qgbm90IGRpc3Bvc2UgYW55IHRlcm1pbmFsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vdmVUb0JhY2tncm91bmRDYWxscy5sZW5ndGgsIDAsICdhbHJlYWR5LWFyY2hpdmVkIHNlc3Npb24gbXVzdCBub3QgYmUgdHJlYXRlZCBhcyBhIGZyZXNoIGFyY2hpdmUgdHJhbnNpdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZXMgdGVybWluYWxzIHdoZW4gYSBub24tZm9jdXNlZCBzZXNzaW9uIGlzIHJlbW92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKHdvcmt0cmVlVXJpLCBmYWxzZSwgbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6cmVtb3ZlZC1zZXNzaW9uJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTsgLy8gdGVybWluYWwgMSBhdCAvd29ya3RyZWUsIGFjdGl2ZVxuXHRcdC8vIE9wZW4gYSB0ZXJtaW5hbCBlbHNld2hlcmUgc28gdGhlIC93b3JrdHJlZSB0ZXJtaW5hbCBpcyBubyBsb25nZXIgdGhlXG5cdFx0Ly8gZm9jdXNlZCAoYWN0aXZlKSBpbnN0YW5jZSBcdTIwMTQgaS5lLiB0aGUgdXNlciByZW1vdmVkIGEgc2Vzc2lvbiB0aGV5IHdlcmUgbm90XG5cdFx0Ly8gY3VycmVudGx5IHdvcmtpbmcgaW4uXG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKFVSSS5maWxlKCcvb3RoZXInKSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0Om90aGVyLXNlc3Npb24nLCB3b3JrdHJlZTogVVJJLmZpbGUoJy9vdGhlcicpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTsgLy8gdGVybWluYWwgMiBhdCAvb3RoZXIsIGFjdGl2ZVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAyKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpyZW1vdmVkLXNlc3Npb24nLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbc2Vzc2lvbl0sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZEluc3RhbmNlcy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBsb2cgaW5mbyB3aGVuIGEgcmVtb3ZlZCBzZXNzaW9uIGhhcyBubyB0cmFja2VkIHRlcm1pbmFscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICd0ZXN0OnJlbW92ZWQtd2l0aG91dC10ZXJtaW5hbCcsXG5cdFx0XHR3b3JrdHJlZTogVVJJLmZpbGUoJy93b3JrdHJlZScpLFxuXHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCxcblx0XHR9KTtcblxuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW3Nlc3Npb25dLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZ1NlcnZpY2UuaW5mb3MsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZGlzcG9zZSB0aGUgZm9jdXNlZCB0ZXJtaW5hbCB3aGVuIGl0cyBzZXNzaW9uIGlzIHJlbW92ZWQgKGdyYWR1YXRpb24gY2FzZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gTWlycm9ycyB0aGUgZmlyc3QtdHVybiB1bnRpdGxlZCBcdTIxOTIgY29tbWl0dGVkIGdyYWR1YXRpb24gKCMzMTM1MTAsICMzMTg2NDUpOlxuXHRcdC8vIGBvbkRpZFJlcGxhY2VTZXNzaW9uYCBzdXJmYWNlcyB0aGUgc2tlbGV0b24gaW4gYHJlbW92ZWRgIHdoaWxlIHRoZVxuXHRcdC8vIGNvbW1pdHRlZCBzZXNzaW9uIGluaGVyaXRzIHRoZSBzYW1lIGN3ZCBidXQgaGFzIG5vdCByZXNvbHZlZCBpdHMgd29ya3NwYWNlXG5cdFx0Ly8geWV0LCBzbyBpdCBkb2VzIG5vdCBhcHBlYXIgaW4gYGxpdmVDd2RLZXlzYC4gVGhlIHRlcm1pbmFsIHRoZSB1c2VyIGp1c3Rcblx0XHQvLyB1c2VkIGZvciB0aGUgZmlyc3QgdHVybiBpcyB0aGUgZm9jdXNlZCAoYWN0aXZlKSBpbnN0YW5jZSBhbmQgbXVzdCBzdXJ2aXZlLlxuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnVudGl0bGVkJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTsgLy8gdGVybWluYWwgMSBhdCAvd29ya3RyZWUsIGFjdGl2ZVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblxuXHRcdGNvbnN0IHNrZWxldG9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6dW50aXRsZWQnLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Ly8gVGhlIGNvbW1pdHRlZCBzZXNzaW9uIHJlcG9ydHMgbm8gd29ya3NwYWNlIHlldCwgc28gaXQgaXMgbm90IGluIGFsbFNlc3Npb25zLlxuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW3NrZWxldG9uXSwgY2hhbmdlZDogW10gfSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkSW5zdGFuY2VzLmxlbmd0aCwgMCwgJ3RoZSBmb2N1c2VkIHRlcm1pbmFsIG11c3Qgbm90IGJlIGRpc3Bvc2VkIG9uIGdyYWR1YXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2VzIG9ubHkgdGhlIHJlbW92ZWQgc2Vzc2lvbiB0ZXJtaW5hbCB3aGVuIHNlc3Npb25zIHNoYXJlIGEgY3dkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnVudGl0bGVkJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwod29ya3RyZWVVcmksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpjb21taXR0ZWQnLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSkpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgdGhlIG9uRGlkUmVwbGFjZVNlc3Npb24gZmxvdzogYGZyb21gICh1bnRpdGxlZCkgaXMgcmVwb3J0ZWQgYXNcblx0XHQvLyByZW1vdmVkIHdoaWxlIGB0b2AgKGNvbW1pdHRlZCkgaXMgc3RpbGwgbGl2ZSBhdCB0aGUgc2FtZSBjd2QuXG5cdFx0Y29uc3QgZnJvbVNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDp1bnRpdGxlZCcsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRjb25zdCB0b1Nlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpjb21taXR0ZWQnLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0YWxsU2Vzc2lvbnMgPSBbdG9TZXNzaW9uXTtcblxuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW2Zyb21TZXNzaW9uXSwgY2hhbmdlZDogW3RvU2Vzc2lvbl0gfSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaXNwb3NlZEluc3RhbmNlcy5tYXAoaW5zdGFuY2UgPT4gaW5zdGFuY2UuaW5zdGFuY2VJZCksIFsxXSwgJ29ubHkgdGhlIHJlbW92ZWQgc2Vzc2lvbiB0ZXJtaW5hbCBzaG91bGQgYmUgY2xvc2VkJyk7XG5cdFx0YXNzZXJ0Lm9rKHRlcm1pbmFsSW5zdGFuY2VzLmhhcygyKSwgJ3RoZSBzdXJ2aXZpbmcgc2Vzc2lvbiB0ZXJtaW5hbCBzaG91bGQgcmVtYWluJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGVzIG9ubHkgdGhlIGFyY2hpdmVkIHNlc3Npb24gdGVybWluYWwgd2hlbiBzZXNzaW9ucyBzaGFyZSBhIGN3ZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwod29ya3RyZWVVcmksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpsaXZlJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwod29ya3RyZWVVcmksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDphcmNoaXZlZCcsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7XG5cblx0XHRjb25zdCBsaXZlU2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmxpdmUnLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Y29uc3QgYXJjaGl2ZWRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6YXJjaGl2ZWQnLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIGlzQXJjaGl2ZWQ6IHRydWUgfSk7XG5cdFx0YWxsU2Vzc2lvbnMgPSBbbGl2ZVNlc3Npb24sIGFyY2hpdmVkU2Vzc2lvbl07XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChsaXZlU2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0YWN0aXZlSW5zdGFuY2VJZCA9IDE7XG5cblx0XHRtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFthcmNoaXZlZFNlc3Npb25dIH0pO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZEluc3RhbmNlcy5sZW5ndGgsIDAsICd0ZXJtaW5hbCBzaG91bGQgYmUgaGlkZGVuLCBub3QgZGlzcG9zZWQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vdmVUb0JhY2tncm91bmRDYWxscywgWzJdLCAnb25seSB0aGUgYXJjaGl2ZWQgc2Vzc2lvbiB0ZXJtaW5hbCBzaG91bGQgYmUgaGlkZGVuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlcyB0ZXJtaW5hbCB3aGVuIHRoZSBvbmx5IHNlc3Npb24gYXQgYSBjd2QgaXMgcmVtb3ZlZCBldmVuIGlmIG90aGVyIGxpdmUgc2Vzc2lvbnMgZXhpc3QgZWxzZXdoZXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmdvbmUnLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSkpOyAvLyB0ZXJtaW5hbCAxIGF0IC93b3JrdHJlZSwgYWN0aXZlXG5cblx0XHRjb25zdCBvdGhlckxpdmUgPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpvdGhlcicsIHdvcmt0cmVlOiBVUkkuZmlsZSgnL290aGVyJyksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Y29uc3QgcmVtb3ZlZFNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpnb25lJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGFsbFNlc3Npb25zID0gW290aGVyTGl2ZV07XG5cblx0XHQvLyBTd2l0Y2ggZm9jdXMgdG8gdGhlIG90aGVyIGxpdmUgc2Vzc2lvbidzIHRlcm1pbmFsIHNvIHRoZSAvd29ya3RyZWVcblx0XHQvLyB0ZXJtaW5hbCBpcyBubyBsb25nZXIgdGhlIHByb3RlY3RlZCBhY3RpdmUgaW5zdGFuY2UuXG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKFVSSS5maWxlKCcvb3RoZXInKSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0Om90aGVyJywgd29ya3RyZWU6IFVSSS5maWxlKCcvb3RoZXInKSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7IC8vIHRlcm1pbmFsIDIgYXQgL290aGVyLCBhY3RpdmVcblxuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW3JlbW92ZWRTZXNzaW9uXSwgY2hhbmdlZDogW10gfSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkSW5zdGFuY2VzLmxlbmd0aCwgMSwgJ25vIGxpdmUgc2Vzc2lvbiBvd25zIHRoaXMgY3dkLCB0ZXJtaW5hbCBzaG91bGQgYmUgY2xvc2VkJyk7XG5cdH0pO1xuXG5cdC8vIC0tLSBzd2l0Y2hpbmcgYmFjayB0byBwcmV2aW91c2x5IHVzZWQgcGF0aCByZXVzZXMgdGVybWluYWwgLS0tXG5cblx0dGVzdCgnc3dpdGNoaW5nIGJhY2sgdG8gYSBwcmV2aW91c2x5IHVzZWQgYmFja2dyb3VuZCBwYXRoIHJldXNlcyB0aGUgZXhpc3RpbmcgdGVybWluYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3dkMSA9IFVSSS5maWxlKCcvY3dkMScpO1xuXHRcdGNvbnN0IGN3ZDIgPSBVUkkuZmlsZSgnL2N3ZDInKTtcblxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24tMScsIHdvcmt0cmVlOiBjd2QxLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0yJywgd29ya3RyZWU6IGN3ZDIsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMik7XG5cblx0XHQvLyBTd2l0Y2ggYmFjayB0byBjd2QxIC0gc2hvdWxkIHJldXNlIHRlcm1pbmFsLCBub3QgY3JlYXRlIGEgbmV3IG9uZVxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24tMScsIHdvcmt0cmVlOiBjd2QxLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDIsICdzaG91bGQgcmV1c2UgdGhlIHRlcm1pbmFsIGZvciBjd2QxJyk7XG5cdH0pO1xuXG5cdC8vIC0tLSBUZXJtaW5hbCB2aXNpYmlsaXR5IG1hbmFnZW1lbnQgKHNlc3Npb24tYmFzZWQgd2l0aCBjd2QgZmFsbGJhY2spIC0tLVxuXG5cdHRlc3QoJ2hpZGVzIHRlcm1pbmFscyBmcm9tIHByZXZpb3VzIHNlc3Npb24gd2hlbiBzd2l0Y2hpbmcgdG8gYSBuZXcgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QxID0gVVJJLmZpbGUoJy9jd2QxJyk7XG5cdFx0Y29uc3QgY3dkMiA9IFVSSS5maWxlKCcvY3dkMicpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0xJywgd29ya3RyZWU6IGN3ZDEsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZXNzaW9uLTInLCB3b3JrdHJlZTogY3dkMiwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHQvLyBUaGUgZmlyc3QgdGVybWluYWwgKGlkPTEpIHNob3VsZCBoYXZlIGJlZW4gbW92ZWQgdG8gYmFja2dyb3VuZFxuXHRcdGFzc2VydC5vayhtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMuaW5jbHVkZXMoMSksICd0ZXJtaW5hbCBmb3IgY3dkMSBzaG91bGQgYmUgYmFja2dyb3VuZGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKGJhY2tncm91bmRlZEluc3RhbmNlcy5oYXMoMSksICd0ZXJtaW5hbCBmb3IgY3dkMSBzaG91bGQgcmVtYWluIGJhY2tncm91bmRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93cyBwcmV2aW91c2x5IGhpZGRlbiB0ZXJtaW5hbHMgd2hlbiBzd2l0Y2hpbmcgYmFjayB0byB0aGVpciBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZDEgPSBVUkkuZmlsZSgnL2N3ZDEnKTtcblx0XHRjb25zdCBjd2QyID0gVVJJLmZpbGUoJy9jd2QyJyk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZXNzaW9uLTEnLCB3b3JrdHJlZTogY3dkMSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZXNzaW9uLTInLCB3b3JrdHJlZTogY3dkMiwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHQvLyBTd2l0Y2ggYmFjayB0byBjd2QxXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0xJywgd29ya3RyZWU6IGN3ZDEsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0Ly8gVGVybWluYWwgZm9yIGN3ZDEgKGlkPTEpIHNob3VsZCBiZSBzaG93biBhZ2FpblxuXHRcdGFzc2VydC5vayhzaG93QmFja2dyb3VuZENhbGxzLmluY2x1ZGVzKDEpLCAndGVybWluYWwgZm9yIGN3ZDEgc2hvdWxkIGJlIHNob3duJyk7XG5cdFx0YXNzZXJ0Lm9rKCFiYWNrZ3JvdW5kZWRJbnN0YW5jZXMuaGFzKDEpLCAndGVybWluYWwgZm9yIGN3ZDEgc2hvdWxkIGJlIGZvcmVncm91bmQnKTtcblx0XHQvLyBUZXJtaW5hbCBmb3IgY3dkMiAoaWQ9Mikgc2hvdWxkIG5vdyBiZSBiYWNrZ3JvdW5kZWRcblx0XHRhc3NlcnQub2soYmFja2dyb3VuZGVkSW5zdGFuY2VzLmhhcygyKSwgJ3Rlcm1pbmFsIGZvciBjd2QyIHNob3VsZCBiZSBiYWNrZ3JvdW5kZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnb25seSB0ZXJtaW5hbHMgb2YgdGhlIGFjdGl2ZSBzZXNzaW9uIGFyZSB2aXNpYmxlIGFmdGVyIG11bHRpcGxlIHN3aXRjaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZDEgPSBVUkkuZmlsZSgnL2N3ZDEnKTtcblx0XHRjb25zdCBjd2QyID0gVVJJLmZpbGUoJy9jd2QyJyk7XG5cdFx0Y29uc3QgY3dkMyA9IFVSSS5maWxlKCcvY3dkMycpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0xJywgd29ya3RyZWU6IGN3ZDEsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0yJywgd29ya3RyZWU6IGN3ZDIsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0zJywgd29ya3RyZWU6IGN3ZDMsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0Ly8gT25seSB0ZXJtaW5hbCBmb3IgY3dkMyAoaWQ9Mykgc2hvdWxkIGJlIGZvcmVncm91bmRcblx0XHRhc3NlcnQub2soYmFja2dyb3VuZGVkSW5zdGFuY2VzLmhhcygxKSwgJ3Rlcm1pbmFsIGZvciBjd2QxIHNob3VsZCBiZSBiYWNrZ3JvdW5kZWQnKTtcblx0XHRhc3NlcnQub2soYmFja2dyb3VuZGVkSW5zdGFuY2VzLmhhcygyKSwgJ3Rlcm1pbmFsIGZvciBjd2QyIHNob3VsZCBiZSBiYWNrZ3JvdW5kZWQnKTtcblx0XHRhc3NlcnQub2soIWJhY2tncm91bmRlZEluc3RhbmNlcy5oYXMoMyksICd0ZXJtaW5hbCBmb3IgY3dkMyBzaG91bGQgYmUgZm9yZWdyb3VuZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93cyBwcmUtZXhpc3RpbmcgdGVybWluYWwgd2l0aCBtYXRjaGluZyBjd2QgaW5zdGVhZCBvZiBjcmVhdGluZyBhIG5ldyBvbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gTWFudWFsbHkgYWRkIGEgdGVybWluYWwgdGhhdCBhbHJlYWR5IGV4aXN0cyB3aXRoIGEgbWF0Y2hpbmcgY3dkXG5cdFx0Y29uc3QgY3dkID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGNvbnN0IGV4aXN0aW5nSW5zdGFuY2UgPSBtYWtlVGVybWluYWxJbnN0YW5jZShuZXh0SW5zdGFuY2VJZCsrLCBjd2QuZnNQYXRoKTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlcy5zZXQoZXhpc3RpbmdJbnN0YW5jZS5pbnN0YW5jZUlkLCBleGlzdGluZ0luc3RhbmNlKTtcblx0XHRiYWNrZ3JvdW5kZWRJbnN0YW5jZXMuYWRkKGV4aXN0aW5nSW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlQWdlbnRTZXNzaW9uKHsgd29ya3RyZWU6IGN3ZCwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDAsICdzaG91bGQgcmV1c2UgZXhpc3RpbmcgdGVybWluYWwsIG5vdCBjcmVhdGUgYSBuZXcgb25lJyk7XG5cdFx0YXNzZXJ0Lm9rKHNob3dCYWNrZ3JvdW5kQ2FsbHMuaW5jbHVkZXMoZXhpc3RpbmdJbnN0YW5jZS5pbnN0YW5jZUlkKSwgJ3Nob3VsZCBzaG93IHRoZSBleGlzdGluZyB0ZXJtaW5hbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBiYWNrZ3JvdW5kIGEgcmVzdG9yZWQgdGVybWluYWwgdGhhdCBpcyBkaXNwb3NlZCBiZWZvcmUgY3dkIHJlc29sdmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCByZXNvbHZlSW5pdGlhbEN3ZDogKChjd2Q6IHN0cmluZykgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVzdG9yZWRJbnN0YW5jZSA9IG1ha2VUZXJtaW5hbEluc3RhbmNlKG5leHRJbnN0YW5jZUlkKyssICcvcmVzdG9yZWQnKTtcblx0XHRyZXN0b3JlZEluc3RhbmNlLl90ZXN0U2V0U2hlbGxMYXVuY2hDb25maWcoeyBhdHRhY2hQZXJzaXN0ZW50UHJvY2Vzczoge30gYXMgbmV2ZXIgfSBhcyBJVGVybWluYWxJbnN0YW5jZVsnc2hlbGxMYXVuY2hDb25maWcnXSk7XG5cdFx0cmVzdG9yZWRJbnN0YW5jZS5nZXRJbml0aWFsQ3dkID0gKCkgPT4gbmV3IFByb21pc2U8c3RyaW5nPihyZXNvbHZlID0+IHtcblx0XHRcdHJlc29sdmVJbml0aWFsQ3dkID0gcmVzb2x2ZTtcblx0XHR9KTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlcy5zZXQocmVzdG9yZWRJbnN0YW5jZS5pbnN0YW5jZUlkLCByZXN0b3JlZEluc3RhbmNlKTtcblxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OmFjdGl2ZS1zZXNzaW9uJywgd29ya3RyZWU6IFVSSS5maWxlKCcvYWN0aXZlJyksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0b25EaWRDcmVhdGVJbnN0YW5jZS5maXJlKHJlc3RvcmVkSW5zdGFuY2UpO1xuXHRcdHJlc3RvcmVkSW5zdGFuY2UuX3Rlc3RTZXREaXNwb3NlZCh0cnVlKTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlcy5kZWxldGUocmVzdG9yZWRJbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHRyZXNvbHZlSW5pdGlhbEN3ZD8uKCcvb3RoZXInKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQub2soIW1vdmVUb0JhY2tncm91bmRDYWxscy5pbmNsdWRlcyhyZXN0b3JlZEluc3RhbmNlLmluc3RhbmNlSWQpLCAnZGlzcG9zZWQgcmVzdG9yZWQgdGVybWluYWwgc2hvdWxkIG5vdCBiZSBiYWNrZ3JvdW5kZWQnKTtcblx0XHRhc3NlcnQub2sobG9nU2VydmljZS50cmFjZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuaW5jbHVkZXMoJ0Nhbm5vdCBoaWRlIHJlc3RvcmVkIHRlcm1pbmFsIGZvciAvb3RoZXI7IHRlcm1pbmFsJykgJiYgbWVzc2FnZS5pbmNsdWRlcygnaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZScpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGVzIHByZS1leGlzdGluZyB0ZXJtaW5hbCB3aXRoIG5vbi1tYXRjaGluZyBjd2Qgd2hlbiBzZXNzaW9uIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gTWFudWFsbHkgYWRkIGEgdGVybWluYWwgdGhhdCBhbHJlYWR5IGV4aXN0cyB3aXRoIGEgZGlmZmVyZW50IGN3ZFxuXHRcdGNvbnN0IG90aGVySW5zdGFuY2UgPSBtYWtlVGVybWluYWxJbnN0YW5jZShuZXh0SW5zdGFuY2VJZCsrLCAnL290aGVyL3BhdGgnKTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlcy5zZXQob3RoZXJJbnN0YW5jZS5pbnN0YW5jZUlkLCBvdGhlckluc3RhbmNlKTtcblxuXHRcdGNvbnN0IGN3ZCA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlQWdlbnRTZXNzaW9uKHsgd29ya3RyZWU6IGN3ZCwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQub2sobW92ZVRvQmFja2dyb3VuZENhbGxzLmluY2x1ZGVzKG90aGVySW5zdGFuY2UuaW5zdGFuY2VJZCksICdub24tbWF0Y2hpbmcgdGVybWluYWwgc2hvdWxkIGJlIGJhY2tncm91bmRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbnN1cmVUZXJtaW5hbCBmaW5kcyBhIGJhY2tncm91bmRlZCB0ZXJtaW5hbCBpbnN0ZWFkIG9mIGNyZWF0aW5nIGEgbmV3IG9uZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3Rlc3QtY3dkJyk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGN3ZCwgZmFsc2UpO1xuXHRcdGNvbnN0IGluc3RhbmNlSWQgPSBhY3RpdmVJbnN0YW5jZVNldFswXTtcblxuXHRcdC8vIE1hbnVhbGx5IGJhY2tncm91bmQgaXRcblx0XHRiYWNrZ3JvdW5kZWRJbnN0YW5jZXMuYWRkKGluc3RhbmNlSWQpO1xuXG5cdFx0Ly8gZW5zdXJlVGVybWluYWwgc2hvdWxkIGZpbmQgaXQgYnkgY3dkLCBub3QgY3JlYXRlIGEgbmV3IG9uZVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChjd2QsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSwgJ3Nob3VsZCBub3QgY3JlYXRlIGEgbmV3IHRlcm1pbmFsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pbnN0YW5jZUlkLCBpbnN0YW5jZUlkLCAnc2hvdWxkIHJldHVybiB0aGUgZXhpc3RpbmcgYmFja2dyb3VuZGVkIHRlcm1pbmFsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJldXNlIGFuIHVudHJhY2tlZCBjd2QgbWF0Y2ggd2hlbiBpdCBpcyBhbHJlYWR5IHRyYWNrZWQgdG8gYW5vdGhlciBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZCA9IFVSSS5maWxlKCcvc2hhcmVkJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjEgPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZXNzaW9uLTEnLCB3b3JrdHJlZTogY3dkLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24yID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0yJywgd29ya3RyZWU6IGN3ZCwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubWFwKHRlcm1pbmFsID0+IHRlcm1pbmFsLmN3ZC5mc1BhdGgpLCBbY3dkLmZzUGF0aCwgY3dkLmZzUGF0aF0pO1xuXHRcdGFzc2VydC5vayhiYWNrZ3JvdW5kZWRJbnN0YW5jZXMuaGFzKDEpLCAndGhlIGZpcnN0IHNlc3Npb24gdGVybWluYWwgc2hvdWxkIGJlIGJhY2tncm91bmRlZCcpO1xuXHRcdGFzc2VydC5vayghYmFja2dyb3VuZGVkSW5zdGFuY2VzLmhhcygyKSwgJ3RoZSBzZWNvbmQgc2Vzc2lvbiB0ZXJtaW5hbCBzaG91bGQgc3RheSB2aXNpYmxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Zpc2liaWxpdHkgaXMgZGV0ZXJtaW5lZCBieSB0cmFja2VkIHNlc3Npb24gdGVybWluYWxzIHdoZW4gc2Vzc2lvbnMgc2hhcmUgYSBjd2QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3dkID0gVVJJLmZpbGUoJy9jd2QnKTtcblx0XHRjb25zdCBzZXNzaW9uMSA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24tMScsIHdvcmt0cmVlOiBjd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZXNzaW9uLTInLCB3b3JrdHJlZTogY3dkLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjEsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24yLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5vayhiYWNrZ3JvdW5kZWRJbnN0YW5jZXMuaGFzKDEpLCAnc2Vzc2lvbiAxIHRlcm1pbmFsIHNob3VsZCBiZSBiYWNrZ3JvdW5kZWQgd2hlbiBzZXNzaW9uIDIgaXMgYWN0aXZlJyk7XG5cdFx0YXNzZXJ0Lm9rKCFiYWNrZ3JvdW5kZWRJbnN0YW5jZXMuaGFzKDIpLCAnc2Vzc2lvbiAyIHRlcm1pbmFsIHNob3VsZCBiZSBmb3JlZ3JvdW5kJyk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQub2soIWJhY2tncm91bmRlZEluc3RhbmNlcy5oYXMoMSksICdzZXNzaW9uIDEgdGVybWluYWwgc2hvdWxkIGJlIHNob3duIGFnYWluIHdoZW4gcmVhY3RpdmF0ZWQnKTtcblx0XHRhc3NlcnQub2soYmFja2dyb3VuZGVkSW5zdGFuY2VzLmhhcygyKSwgJ3Nlc3Npb24gMiB0ZXJtaW5hbCBzaG91bGQgYmUgYmFja2dyb3VuZGVkIHdoZW4gc2Vzc2lvbiAxIGlzIGFjdGl2ZScpO1xuXHR9KTtcblxuXHQvLyAtLS0gTW9zdC1yZWNlbnQtY29tbWFuZCBhY3RpdmUgdGVybWluYWwgc2VsZWN0aW9uIC0tLVxuXG5cdHRlc3QoJ3NldHMgdGhlIHRlcm1pbmFsIHdpdGggdGhlIG1vc3QgcmVjZW50IGNvbW1hbmQgYXMgYWN0aXZlIGFmdGVyIHZpc2liaWxpdHkgdXBkYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZCA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRjb25zdCB0MSA9IG1ha2VUZXJtaW5hbEluc3RhbmNlKG5leHRJbnN0YW5jZUlkKyssIGN3ZC5mc1BhdGgpO1xuXHRcdGNvbnN0IHQyID0gbWFrZVRlcm1pbmFsSW5zdGFuY2UobmV4dEluc3RhbmNlSWQrKywgY3dkLmZzUGF0aCk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KHQxLmluc3RhbmNlSWQsIHQxKTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlcy5zZXQodDIuaW5zdGFuY2VJZCwgdDIpO1xuXG5cdFx0Ly8gdDEgcmFuIGEgY29tbWFuZCBhdCB0aW1lc3RhbXAgMTAwLCB0MiBhdCB0aW1lc3RhbXAgMjAwIChtb3JlIHJlY2VudClcblx0XHRhZGRDb21tYW5kVG9JbnN0YW5jZSh0MSwgMTAwKTtcblx0XHRhZGRDb21tYW5kVG9JbnN0YW5jZSh0MiwgMjAwKTtcblxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBZ2VudFNlc3Npb24oeyB3b3JrdHJlZTogY3dkLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdC8vIFRoZSBtb3N0IHJlY2VudCBzZXRBY3RpdmVJbnN0YW5jZSBjYWxsIHNob3VsZCBiZSBmb3IgdDJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlSW5zdGFuY2VTZXQuYXQoLTEpLCB0Mi5pbnN0YW5jZUlkLCAnc2hvdWxkIHNldCB0aGUgdGVybWluYWwgd2l0aCB0aGUgbW9zdCByZWNlbnQgY29tbWFuZCBhcyBhY3RpdmUnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgY2hhbmdlIGFjdGl2ZSBpbnN0YW5jZSB3aGVuIG5vIHRlcm1pbmFscyBoYXZlIGNvbW1hbmQgaGlzdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjd2QgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0Y29uc3QgdDEgPSBtYWtlVGVybWluYWxJbnN0YW5jZShuZXh0SW5zdGFuY2VJZCsrLCBjd2QuZnNQYXRoKTtcblx0XHRjb25zdCB0MiA9IG1ha2VUZXJtaW5hbEluc3RhbmNlKG5leHRJbnN0YW5jZUlkKyssIGN3ZC5mc1BhdGgpO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VzLnNldCh0MS5pbnN0YW5jZUlkLCB0MSk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KHQyLmluc3RhbmNlSWQsIHQyKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUNvdW50QmVmb3JlID0gYWN0aXZlSW5zdGFuY2VTZXQubGVuZ3RoO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHdvcmt0cmVlOiBjd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0Ly8gTm8gc2V0QWN0aXZlSW5zdGFuY2UgY2FsbHMgZnJvbSB2aXNpYmlsaXR5IHVwZGF0ZSBzaW5jZSBubyBjb21tYW5kcyB3ZXJlIHJ1blxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVJbnN0YW5jZVNldC5sZW5ndGgsIGFjdGl2ZUNvdW50QmVmb3JlLCAnc2hvdWxkIG5vdCBjYWxsIHNldEFjdGl2ZUluc3RhbmNlIHdoZW4gbm8gY29tbWFuZCBoaXN0b3J5IGV4aXN0cycpO1xuXHR9KTtcblxuXHQvLyAtLS0gUmVtb3RlIGFnZW50IGhvc3Qgc2Vzc2lvbnMgLS0tXG5cblx0dGVzdCgndXNlcyB0aGUgdW53cmFwcGVkIHJlcG9zaXRvcnkgcGF0aCBmb3IgYSBiYWNrZ3JvdW5kIHNlc3Npb24gd2l0aCBhIHJlbW90ZSBhZ2VudCBob3N0IHJlcG9zaXRvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVtb3RlUmVwb1VyaSA9IHRvQWdlbnRIb3N0VXJpKFVSSS5maWxlKCcvVXNlcnMvdXNlci9yZXBvJyksICdteS1zZXJ2ZXInKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHJlcG9zaXRvcnk6IHJlbW90ZVJlcG9VcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEsICdzaG91bGQgY3JlYXRlIGEgdGVybWluYWwgYXQgdGhlIHVud3JhcHBlZCByZXBvc2l0b3J5IHBhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFsc1swXS5jd2QuZnNQYXRoLCBVUkkuZmlsZSgnL1VzZXJzL3VzZXIvcmVwbycpLmZzUGF0aCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBIaWRkZW4gdG9vbCB0ZXJtaW5hbHMgKGhpZGVGcm9tVXNlcikgLS0tXG5cblx0dGVzdCgnZG9lcyBub3QgaGlkZSBoaWRkZW4gdG9vbCB0ZXJtaW5hbHMgd2hlbiBzZXNzaW9uIGlzIGFyY2hpdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnJlZ3VsYXItc2Vzc2lvbicsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7IC8vIHRlcm1pbmFsIDEgKHJlZ3VsYXIpIGF0IC93b3JrdHJlZVxuXG5cdFx0Ly8gU2ltdWxhdGUgYSBoaWRkZW4gdG9vbCB0ZXJtaW5hbCAoY3JlYXRlZCBieSBydW5faW5fdGVybWluYWwpIGF0IHRoZSBzYW1lIGN3ZFxuXHRcdGNvbnN0IHRvb2xUZXJtaW5hbCA9IG1ha2VUZXJtaW5hbEluc3RhbmNlKG5leHRJbnN0YW5jZUlkKyssIHdvcmt0cmVlVXJpLmZzUGF0aCk7XG5cdFx0dG9vbFRlcm1pbmFsLl90ZXN0U2V0U2hlbGxMYXVuY2hDb25maWcoeyBoaWRlRnJvbVVzZXI6IHRydWUgfSBhcyBJVGVybWluYWxJbnN0YW5jZVsnc2hlbGxMYXVuY2hDb25maWcnXSk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KHRvb2xUZXJtaW5hbC5pbnN0YW5jZUlkLCB0b29sVGVybWluYWwpO1xuXG5cdFx0Ly8gQXJjaGl2aW5nIGZsaXBzIHRoZSBhY3RpdmUgc2Vzc2lvbiBhd2F5LCBzbyB0aGUgYXJjaGl2ZWQgc2Vzc2lvbidzXG5cdFx0Ly8gcmVndWxhciB0ZXJtaW5hbCBpcyBubyBsb25nZXIgdGhlIGZvY3VzZWQgKGFjdGl2ZSkgdGVybWluYWwuXG5cdFx0Y29uc3Qgb3RoZXJTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6b3RoZXItc2Vzc2lvbicsIHdvcmt0cmVlOiBVUkkuZmlsZSgnL290aGVyJyksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQob3RoZXJTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdG1vdmVUb0JhY2tncm91bmRDYWxscy5sZW5ndGggPSAwO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAndGVzdDpyZWd1bGFyLXNlc3Npb24nLFxuXHRcdFx0aXNBcmNoaXZlZDogdHJ1ZSxcblx0XHRcdHdvcmt0cmVlOiB3b3JrdHJlZVVyaSxcblx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsXG5cdFx0fSk7XG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3Nlc3Npb25dIH0pO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdC8vIFRoZSByZWd1bGFyIHRlcm1pbmFsIHNob3VsZCBiZSBoaWRkZW4sIGJ1dCB0aGUgdG9vbCB0ZXJtaW5hbCBtdXN0IHN1cnZpdmUgdW50b3VjaGVkLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZEluc3RhbmNlcy5sZW5ndGgsIDAsICdhcmNoaXZlZCBzZXNzaW9uIHRlcm1pbmFsIG11c3QgYmUgaGlkZGVuLCBub3QgZGlzcG9zZWQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vdmVUb0JhY2tncm91bmRDYWxscywgWzFdLCAnb25seSB0aGUgcmVndWxhciB0ZXJtaW5hbCBzaG91bGQgYmUgaGlkZGVuLCBub3QgdGhlIHRvb2wgdGVybWluYWwnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZGlzcG9zZSBoaWRkZW4gdG9vbCB0ZXJtaW5hbHMgd2hlbiBzZXNzaW9uIGlzIHJlbW92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKHdvcmt0cmVlVXJpLCBmYWxzZSwgbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6cmVndWxhci1zZXNzaW9uJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pKTsgLy8gdGVybWluYWwgMSAocmVndWxhcikgYXQgL3dvcmt0cmVlLCBhY3RpdmVcblxuXHRcdGNvbnN0IHRvb2xUZXJtaW5hbCA9IG1ha2VUZXJtaW5hbEluc3RhbmNlKG5leHRJbnN0YW5jZUlkKyssIHdvcmt0cmVlVXJpLmZzUGF0aCk7XG5cdFx0dG9vbFRlcm1pbmFsLl90ZXN0U2V0U2hlbGxMYXVuY2hDb25maWcoeyBoaWRlRnJvbVVzZXI6IHRydWUgfSBhcyBJVGVybWluYWxJbnN0YW5jZVsnc2hlbGxMYXVuY2hDb25maWcnXSk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KHRvb2xUZXJtaW5hbC5pbnN0YW5jZUlkLCB0b29sVGVybWluYWwpO1xuXG5cdFx0Ly8gU3dpdGNoIGZvY3VzIGF3YXkgc28gdGhlIHJlZ3VsYXIgdGVybWluYWwgaXMgbm8gbG9uZ2VyIHRoZSBwcm90ZWN0ZWQgYWN0aXZlIGluc3RhbmNlLlxuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbChVUkkuZmlsZSgnL290aGVyJyksIGZhbHNlLCBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpvdGhlci1zZXNzaW9uJywgd29ya3RyZWU6IFVSSS5maWxlKCcvb3RoZXInKSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSk7IC8vIHRlcm1pbmFsIGF0IC9vdGhlciwgYWN0aXZlXG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6cmVndWxhci1zZXNzaW9uJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW3Nlc3Npb25dLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRJbnN0YW5jZXMubGVuZ3RoLCAxLCAnc2hvdWxkIGRpc3Bvc2UgZXhhY3RseSBvbmUgdGVybWluYWwnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZGlzcG9zZWRJbnN0YW5jZXNbMF0uaW5zdGFuY2VJZCwgdG9vbFRlcm1pbmFsLmluc3RhbmNlSWQsICdzaG91bGQgbm90IGRpc3Bvc2UgdGhlIHRvb2wgdGVybWluYWwnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgYmFja2dyb3VuZCBoaWRkZW4gdG9vbCB0ZXJtaW5hbHMgZHVyaW5nIHNlc3Npb24gc3dpdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZDEgPSBVUkkuZmlsZSgnL2N3ZDEnKTtcblx0XHRjb25zdCBjd2QyID0gVVJJLmZpbGUoJy9jd2QyJyk7XG5cblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDpzZXNzaW9uLTEnLCB3b3JrdHJlZTogY3dkMSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHQvLyBBZGQgYSBoaWRkZW4gdG9vbCB0ZXJtaW5hbCBhdCBjd2QxXG5cdFx0Y29uc3QgdG9vbFRlcm1pbmFsID0gbWFrZVRlcm1pbmFsSW5zdGFuY2UobmV4dEluc3RhbmNlSWQrKywgY3dkMS5mc1BhdGgpO1xuXHRcdHRvb2xUZXJtaW5hbC5fdGVzdFNldFNoZWxsTGF1bmNoQ29uZmlnKHsgaGlkZUZyb21Vc2VyOiB0cnVlIH0gYXMgSVRlcm1pbmFsSW5zdGFuY2VbJ3NoZWxsTGF1bmNoQ29uZmlnJ10pO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VzLnNldCh0b29sVGVybWluYWwuaW5zdGFuY2VJZCwgdG9vbFRlcm1pbmFsKTtcblxuXHRcdC8vIFN3aXRjaCB0byBjd2QyXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbi0yJywgd29ya3RyZWU6IGN3ZDIsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMuaW5jbHVkZXModG9vbFRlcm1pbmFsLmluc3RhbmNlSWQpLCAnaGlkZGVuIHRvb2wgdGVybWluYWwgc2hvdWxkIG5vdCBiZSBtb3ZlZCB0byBiYWNrZ3JvdW5kJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGluY2x1ZGUgaGlkZGVuIHRvb2wgdGVybWluYWxzIGluIGVuc3VyZVRlcm1pbmFsIG1hdGNoZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3dkID0gVVJJLmZpbGUoJy93b3JrdHJlZScpO1xuXG5cdFx0Ly8gQWRkIGEgaGlkZGVuIHRvb2wgdGVybWluYWwgYXQgdGhlIHRhcmdldCBjd2Rcblx0XHRjb25zdCB0b29sVGVybWluYWwgPSBtYWtlVGVybWluYWxJbnN0YW5jZShuZXh0SW5zdGFuY2VJZCsrLCBjd2QuZnNQYXRoKTtcblx0XHR0b29sVGVybWluYWwuX3Rlc3RTZXRTaGVsbExhdW5jaENvbmZpZyh7IGhpZGVGcm9tVXNlcjogdHJ1ZSB9IGFzIElUZXJtaW5hbEluc3RhbmNlWydzaGVsbExhdW5jaENvbmZpZyddKTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlcy5zZXQodG9vbFRlcm1pbmFsLmluc3RhbmNlSWQsIHRvb2xUZXJtaW5hbCk7XG5cblx0XHQvLyBlbnN1cmVUZXJtaW5hbCBzaG91bGQgbm90IGZpbmQgdGhlIHRvb2wgdGVybWluYWwsIHNvIGl0IGNyZWF0ZXMgYSBuZXcgb25lXG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKGN3ZCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxLCAnc2hvdWxkIGNyZWF0ZSBhIG5ldyB0ZXJtaW5hbCBzaW5jZSB0b29sIHRlcm1pbmFsIGlzIGhpZGRlbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBoaWRlIHJlc3RvcmVkIGhpZGRlbiB0b29sIHRlcm1pbmFscyBvbiBzZXNzaW9uIGNyZWF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRhY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDphY3RpdmUtc2Vzc2lvbicsIHdvcmt0cmVlOiBVUkkuZmlsZSgnL2FjdGl2ZScpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGNvbnN0IHRvb2xUZXJtaW5hbCA9IG1ha2VUZXJtaW5hbEluc3RhbmNlKG5leHRJbnN0YW5jZUlkKyssICcvb3RoZXInKTtcblx0XHR0b29sVGVybWluYWwuX3Rlc3RTZXRTaGVsbExhdW5jaENvbmZpZyh7XG5cdFx0XHRoaWRlRnJvbVVzZXI6IHRydWUsXG5cdFx0XHRhdHRhY2hQZXJzaXN0ZW50UHJvY2Vzczoge30gYXMgbmV2ZXIsXG5cdFx0fSBhcyBJVGVybWluYWxJbnN0YW5jZVsnc2hlbGxMYXVuY2hDb25maWcnXSk7XG5cdFx0dGVybWluYWxJbnN0YW5jZXMuc2V0KHRvb2xUZXJtaW5hbC5pbnN0YW5jZUlkLCB0b29sVGVybWluYWwpO1xuXG5cdFx0b25EaWRDcmVhdGVJbnN0YW5jZS5maXJlKHRvb2xUZXJtaW5hbCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFtb3ZlVG9CYWNrZ3JvdW5kQ2FsbHMuaW5jbHVkZXModG9vbFRlcm1pbmFsLmluc3RhbmNlSWQpLCAnaGlkZGVuIHRvb2wgdGVybWluYWwgc2hvdWxkIG5vdCBiZSBtb3ZlZCB0byBiYWNrZ3JvdW5kIG9uIHJlc3RvcmUnKTtcblx0fSk7XG5cblx0dGVzdCgndHJhbnNmZXJzIHRyYWNrZWQgdGVybWluYWxzIHdoZW4gYSBzZXNzaW9uIGlzIHJlcGxhY2VkIChncmFkdWF0aW9uKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRjb25zdCB1bnRpdGxlZFNlc3Npb24gPSBtYWtlQWdlbnRTZXNzaW9uKHsgc2Vzc2lvbklkOiAndGVzdDp1bnRpdGxlZCcsIHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRjb25zdCBjb21taXR0ZWRTZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6Y29tbWl0dGVkJywgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kIH0pO1xuXG5cdFx0Ly8gRW5zdXJlIGEgdGVybWluYWwgZm9yIHRoZSB1bnRpdGxlZCBzZXNzaW9uXG5cdFx0YXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKHdvcmt0cmVlVXJpLCBmYWxzZSwgdW50aXRsZWRTZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHRlcm1pbmFsSWQgPSBbLi4udGVybWluYWxJbnN0YW5jZXMua2V5cygpXVswXTtcblxuXHRcdC8vIEZpcmUgb25EaWRSZXBsYWNlU2Vzc2lvbiB0byB0cmFuc2ZlciB0cmFja2luZ1xuXHRcdG9uRGlkUmVwbGFjZVNlc3Npb24uZmlyZSh7IGZyb206IHVudGl0bGVkU2Vzc2lvbiwgdG86IGNvbW1pdHRlZFNlc3Npb24gfSk7XG5cblx0XHQvLyBOb3cgcmVtb3ZpbmcgdGhlIG9sZCBzZXNzaW9uIHNob3VsZCBub3Qga2lsbCB0aGUgdGVybWluYWwgc2luY2Vcblx0XHQvLyB0cmFja2luZyB3YXMgdHJhbnNmZXJyZWQgdG8gdGhlIGNvbW1pdHRlZCBzZXNzaW9uXG5cdFx0YWN0aXZlSW5zdGFuY2VJZCA9IHVuZGVmaW5lZDsgLy8gdGVybWluYWwgaXMgbm90IGZvY3VzZWRcblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFt1bnRpdGxlZFNlc3Npb25dLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWRJbnN0YW5jZXMubGVuZ3RoLCAwLCAndGVybWluYWwgc2hvdWxkIHN1cnZpdmUgZ3JhZHVhdGlvbiBiZWNhdXNlIHRyYWNraW5nIHdhcyB0cmFuc2ZlcnJlZCcpO1xuXHRcdGFzc2VydC5vayh0ZXJtaW5hbEluc3RhbmNlcy5oYXModGVybWluYWxJZCksICd0ZXJtaW5hbCBzaG91bGQgc3RpbGwgZXhpc3QnKTtcblxuXHRcdC8vIEFuZCBlbnN1cmVUZXJtaW5hbCBmb3IgdGhlIGNvbW1pdHRlZCBzZXNzaW9uIHNob3VsZCByZXVzZSwgbm90IGNyZWF0ZVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRyaWJ1dGlvbi5lbnN1cmVUZXJtaW5hbCh3b3JrdHJlZVVyaSwgZmFsc2UsIGNvbW1pdHRlZFNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLmxlbmd0aCwgMSwgJ3Nob3VsZCByZXVzZSB0aGUgdHJhbnNmZXJyZWQgdGVybWluYWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmluc3RhbmNlSWQsIHRlcm1pbmFsSWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhbnMgdXAgdHJhY2tlZCB0ZXJtaW5hbCBpZHMgd2hlbiB0ZXJtaW5hbHMgYXJlIGV4dGVybmFsbHkgZGlzcG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL3dvcmt0cmVlJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VBZ2VudFNlc3Npb24oeyBzZXNzaW9uSWQ6ICd0ZXN0OnNlc3Npb24nLCB3b3JrdHJlZTogd29ya3RyZWVVcmksIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cblx0XHQvLyBFbnN1cmUgYSB0ZXJtaW5hbCBmb3IgdGhlIHNlc3Npb25cblx0XHRhd2FpdCBjb250cmlidXRpb24uZW5zdXJlVGVybWluYWwod29ya3RyZWVVcmksIGZhbHNlLCBzZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGluc3RhbmNlID0gWy4uLnRlcm1pbmFsSW5zdGFuY2VzLnZhbHVlcygpXVswXSBhcyBUZXN0VGVybWluYWxJbnN0YW5jZTtcblxuXHRcdC8vIEV4dGVybmFsbHkgZGlzcG9zZSB0aGUgdGVybWluYWwgKHVzZXIgY2xvc2VzIHRoZSB0YWIpXG5cdFx0aW5zdGFuY2UuX3Rlc3RTZXREaXNwb3NlZCh0cnVlKTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlcy5kZWxldGUoaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0b25EaWREaXNwb3NlSW5zdGFuY2UuZmlyZShpbnN0YW5jZSk7XG5cblx0XHQvLyBOb3cgZW5zdXJlVGVybWluYWwgc2hvdWxkIGNyZWF0ZSBhIG5ldyB0ZXJtaW5hbCBzaW5jZSB0aGUgdHJhY2tlZCBvbmUgd2FzIGRpc3Bvc2VkXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udHJpYnV0aW9uLmVuc3VyZVRlcm1pbmFsKHdvcmt0cmVlVXJpLCBmYWxzZSwgc2Vzc2lvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAyLCAnc2hvdWxkIGNyZWF0ZSBhIG5ldyB0ZXJtaW5hbCBzaW5jZSB0aGUgdHJhY2tlZCBvbmUgd2FzIGRpc3Bvc2VkJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlc3VsdFswXS5pbnN0YW5jZUlkLCBpbnN0YW5jZS5pbnN0YW5jZUlkLCAnc2hvdWxkIGJlIGEgZGlmZmVyZW50IHRlcm1pbmFsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VudHJhY2tlZCByZXN0b3JlZCB0ZXJtaW5hbHMgYXJlIHZpc2libGUgYWxvbmdzaWRlIHRyYWNrZWQgdGVybWluYWxzIGZvciB0aGUgc2FtZSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZCA9IFVSSS5maWxlKCcvd29ya3RyZWUnKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZUFnZW50U2Vzc2lvbih7IHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbicsIHdvcmt0cmVlOiBjd2QsIHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cblx0XHQvLyBTaW11bGF0ZSBhIHJlc3RvcmVkIHRlcm1pbmFsIGF0IHRoZSBzYW1lIGN3ZCAobm90IHRyYWNrZWQpXG5cdFx0Y29uc3QgcmVzdG9yZWRUZXJtaW5hbCA9IG1ha2VUZXJtaW5hbEluc3RhbmNlKG5leHRJbnN0YW5jZUlkKyssIGN3ZC5mc1BhdGgpO1xuXHRcdHRlcm1pbmFsSW5zdGFuY2VzLnNldChyZXN0b3JlZFRlcm1pbmFsLmluc3RhbmNlSWQsIHJlc3RvcmVkVGVybWluYWwpO1xuXHRcdGJhY2tncm91bmRlZEluc3RhbmNlcy5hZGQocmVzdG9yZWRUZXJtaW5hbC5pbnN0YW5jZUlkKTtcblxuXHRcdC8vIEFjdGl2YXRlIHRoZSBzZXNzaW9uIFx1MjAxNCB0aGlzIGNyZWF0ZXMgYSB0cmFja2VkIHRlcm1pbmFsXG5cdFx0YWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHQvLyBUaGUgcmVzdG9yZWQgdGVybWluYWwgc2hvdWxkIGhhdmUgYmVlbiBzaG93biAodmlhIGN3ZCBmYWxsYmFjaylcblx0XHQvLyByYXRoZXIgdGhhbiBsZWZ0IGluIHRoZSBiYWNrZ3JvdW5kXG5cdFx0YXNzZXJ0Lm9rKHNob3dCYWNrZ3JvdW5kQ2FsbHMuaW5jbHVkZXMocmVzdG9yZWRUZXJtaW5hbC5pbnN0YW5jZUlkKSwgJ3VudHJhY2tlZCByZXN0b3JlZCB0ZXJtaW5hbCBhdCBtYXRjaGluZyBjd2Qgc2hvdWxkIGJlIHNob3duJyk7XG5cdH0pO1xufSk7XG5cbmZ1bmN0aW9uIHRpY2soKTogUHJvbWlzZTx2b2lkPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCLGtCQUFrQjtBQUM1QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCLHVCQUF1QjtBQUNqRCxTQUEwQyxpQ0FBaUM7QUFDM0UsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCLG1CQUFtQjtBQUM1QyxTQUE0Qix3QkFBd0I7QUFDcEQsU0FBZ0UsMEJBQTBCO0FBQzFGLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQTZEO0FBQ3RFLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUErQyxrQ0FBa0M7QUFDakYsU0FBUyx3QkFBd0I7QUFHakMsTUFBTSxXQUFX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
